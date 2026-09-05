import { ITEM_DEFS, INVENTORY_SLOT_COUNT, CHAR_DEFS, STAT_LINE_MAX, SKIN_DEFS, DEFAULT_SKIN_BY_CHARACTER, SOLO_PARTY_LIMIT, ROSTER_CHAR_IDS, PRE_AGENT_LEVEL_CAP } from './constants.js';
import { gameState, xpToNext, PHASES, contractStoryLocked, recomputeStats, initGame, RESONANCE_STATES, CHAPTER1_STATES } from './state.js';
import { syncCoinItem } from './ui-commerce.js';
import { render } from './ui-main.js';
import { overlayUiState } from './ui-overlays.js';
import { JOURNAL_CHAPTERS } from './story.js';
import { XIAOCHU_DAILY_TALKS } from './xiaochu-daily.js';

// --- 桌面版手動存檔 ---
// Only permanent progression is serialized. An expedition in progress must be
// resolved first, so combat timers and transient DOM state never enter a save.
const SAVE_FORMAT_VERSION = 1;
// Built lazily (not at module top level) since state.js/story.js/save.js
// form an import cycle - see design.md「ESM 模組化」on evaluating cross-module
// bindings only inside function bodies, never at module scope.
let resonanceSaveStates = null;
function isValidResonanceSaveState(value) {
  if (!resonanceSaveStates) resonanceSaveStates = new Set(Object.values(RESONANCE_STATES));
  return resonanceSaveStates.has(value);
}
let saveStatusTimer = null;

export function saveSlot(entry) {
  if (!entry || !ITEM_DEFS[entry.itemId]) return null;
  const qty = Math.max(1, Math.min(999999, Math.floor(Number(entry.qty) || 0)));
  return qty > 0 ? { itemId: entry.itemId, qty } : null;
}

export function normalizedInventory(source) {
  const result = Array.from({ length: INVENTORY_SLOT_COUNT }, () => null);
  const legacyCollections = [source.inventory, source.storage]
    .filter(Array.isArray)
    .flat();

  legacyCollections.forEach(rawEntry => {
    const entry = saveSlot(rawEntry);
    if (!entry) return;
    const maxStack = ITEM_DEFS[entry.itemId].maxStack || 99;
    let remaining = entry.qty;
    result.forEach(existing => {
      if (!existing || existing.itemId !== entry.itemId || existing.qty >= maxStack || remaining <= 0) return;
      const added = Math.min(maxStack - existing.qty, remaining);
      existing.qty += added;
      remaining -= added;
    });
    while (remaining > 0) {
      const added = Math.min(maxStack, remaining);
      const emptyIndex = result.findIndex(slot => !slot);
      const stack = { itemId: entry.itemId, qty: added };
      if (emptyIndex >= 0) result[emptyIndex] = stack;
      else result.push(stack);
      remaining -= added;
    }
  });

  return result;
}

export function permanentCharacterData(character) {
  return {
    id: character.id,
    level: character.level,
    xp: character.xp,
    lineLevels: { ...character.lineLevels },
    loadout: { activeItemId: character.loadout && character.loadout.activeItemId || null },
  };
}

export function createSaveData() {
  syncCoinItem();
  return {
    format: 'resonance-tower-save',
    version: SAVE_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    progression: {
      bankedGold: gameState.bankedGold,
      slimeKillCount: gameState.slimeKillCount,
      potionUseCount: gameState.potionUseCount,
      unlockedChars: [...gameState.unlockedChars],
      seenCharacterIds: [...gameState.seenCharacterIds],
      resonanceState: { ...gameState.resonanceState },
      roster: gameState.roster.map(permanentCharacterData),
      party: [...gameState.party],
      inventory: gameState.inventory.map(saveSlot),
      ownedSkins: [...gameState.ownedSkins],
      equippedSkinByCharacter: { ...gameState.equippedSkinByCharacter },
      chapter1State: gameState.chapter1State,
      agentKillCount: gameState.agentKillCount,
      xiaochuStoryChapter: gameState.xiaochuStoryChapter,
      xiaochuDailyTalkIndex: gameState.xiaochuDailyTalkIndex,
      journalReading: { chapterId: gameState.journalReading.chapterId, pages: { ...gameState.journalReading.pages } },
    },
  };
}

export function safeInteger(value, fallback, max = 999999999) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(max, Math.floor(number))) : fallback;
}

export function normalizeSaveData(raw) {
  if (!raw || raw.format !== 'resonance-tower-save' || raw.version !== SAVE_FORMAT_VERSION || !raw.progression) {
    throw new Error('不支援的存檔格式');
  }
  const source = raw.progression;
  const unlocked = new Set((Array.isArray(source.unlockedChars) ? source.unlockedChars : []).filter(id => ROSTER_CHAR_IDS.includes(id)));
  unlocked.add('wuming');
  const seenCharacterIds = new Set((Array.isArray(source.seenCharacterIds) ? source.seenCharacterIds : ['wuming']).filter(id => ROSTER_CHAR_IDS.includes(id)));
  seenCharacterIds.add('wuming');
  const normalizedResonance = {};
  Object.entries(source.resonanceState || {}).forEach(([id, value]) => {
    if (CHAR_DEFS[id] && isValidResonanceSaveState(value)) normalizedResonance[id] = value;
  });
  if (normalizedResonance.xiaochu === RESONANCE_STATES.CONTRACTED) unlocked.add('xiaochu');
  const hasNewXiaochuStory = Number.isInteger(source.xiaochuStoryChapter) && source.xiaochuStoryChapter >= 0 && source.xiaochuStoryChapter <= 4;
  let xiaochuStoryChapter = hasNewXiaochuStory ? source.xiaochuStoryChapter : 0;
  // Interrupted rituals resume before consent; retired saves resume at the new home scene.
  if (hasNewXiaochuStory && xiaochuStoryChapter >= 3 && [RESONANCE_STATES.OATH_READY, RESONANCE_STATES.CONTRACTING].includes(normalizedResonance.xiaochu)) {
    normalizedResonance.xiaochu = RESONANCE_STATES.OATH_READY;
    xiaochuStoryChapter = 3;
  } else if (normalizedResonance.xiaochu && ![RESONANCE_STATES.FOLLOWING, RESONANCE_STATES.CONTRACTED].includes(normalizedResonance.xiaochu)) {
    normalizedResonance.xiaochu = RESONANCE_STATES.FOLLOWING;
    xiaochuStoryChapter = 0;
  }
  if (normalizedResonance.xiaochu === RESONANCE_STATES.CONTRACTED) xiaochuStoryChapter = 4;
  else if (normalizedResonance.xiaochu === RESONANCE_STATES.FOLLOWING) xiaochuStoryChapter = xiaochuStoryChapter > 0 ? 2 : 0;
  else if (!normalizedResonance.xiaochu) xiaochuStoryChapter = 0;

  const characters = new Map();
  (Array.isArray(source.roster) ? source.roster : []).forEach(saved => {
    if (!saved || !CHAR_DEFS[saved.id]) return;
    const level = Math.max(1, safeInteger(saved.level, 1, 9999));
    const lineLevels = {};
    ['atk', 'def', 'speed', 'skill0', 'skill1', 'skill2', 'action'].forEach(key => {
      lineLevels[key] = safeInteger(saved.lineLevels && saved.lineLevels[key], 0, STAT_LINE_MAX);
    });
    const activeItemId = saved.loadout && saved.loadout.activeItemId;
    characters.set(saved.id, {
      level,
      xp: safeInteger(saved.xp, 0, Math.max(0, xpToNext(level) - 1)),
      lineLevels,
      activeItemId: ITEM_DEFS[activeItemId] && ITEM_DEFS[activeItemId].equipSlot === 'charm' ? activeItemId : null,
    });
  });

  const owned = new Set((Array.isArray(source.ownedSkins) ? source.ownedSkins : []).filter(id => SKIN_DEFS[id]));
  Object.values(DEFAULT_SKIN_BY_CHARACTER).forEach(id => owned.add(id));
  Object.entries(SKIN_DEFS).filter(([, skin]) => skin.free).forEach(([id]) => owned.add(id));
  const equipped = { ...DEFAULT_SKIN_BY_CHARACTER };
  Object.entries(source.equippedSkinByCharacter || {}).forEach(([characterId, skinId]) => {
    const skin = SKIN_DEFS[skinId];
    if (skin && skin.characterId === characterId && owned.has(skinId)) equipped[characterId] = skinId;
  });
  const savedParty = (Array.isArray(source.party) ? source.party : []).filter(id => unlocked.has(id) && ROSTER_CHAR_IDS.includes(id));
  const chapter1State = [CHAPTER1_STATES.FOREST, CHAPTER1_STATES.COMPLETE].includes(source.chapter1State)
    ? source.chapter1State
    : (unlocked.has('xiaochu') || normalizedResonance.xiaochu ? CHAPTER1_STATES.COMPLETE : CHAPTER1_STATES.FOREST);
  if (chapter1State === CHAPTER1_STATES.FOREST) {
    characters.forEach(character => {
      character.level = Math.min(character.level, PRE_AGENT_LEVEL_CAP);
      if (character.level === PRE_AGENT_LEVEL_CAP) character.xp = 0;
    });
  }

  return {
    bankedGold: safeInteger(source.bankedGold, 0),
    slimeKillCount: safeInteger(source.slimeKillCount, 0),
    potionUseCount: safeInteger(source.potionUseCount, 0),
    unlocked,
    seenCharacterIds,
    resonanceState: normalizedResonance,
    characters,
    party: savedParty.slice(0, SOLO_PARTY_LIMIT),
    inventory: normalizedInventory(source),
    ownedSkins: owned,
    equippedSkinByCharacter: equipped,
    chapter1State,
    agentKillCount: safeInteger(source.agentKillCount, 0),
    xiaochuStoryChapter,
    xiaochuDailyTalkIndex: normalizedResonance.xiaochu === RESONANCE_STATES.CONTRACTED &&
      Number.isInteger(source.xiaochuDailyTalkIndex) && source.xiaochuDailyTalkIndex >= 0 &&
      source.xiaochuDailyTalkIndex < XIAOCHU_DAILY_TALKS.length ? source.xiaochuDailyTalkIndex : 0,
    journalReading: {
      chapterId: JOURNAL_CHAPTERS.some(chapter => chapter.id === source.journalReading?.chapterId) ? source.journalReading.chapterId : JOURNAL_CHAPTERS[0].id,
      pages: Object.fromEntries(JOURNAL_CHAPTERS.filter(chapter => Object.hasOwn(source.journalReading?.pages || {}, chapter.id)).map(chapter => [chapter.id, safeInteger(source.journalReading.pages[chapter.id], 0, chapter.pages.length - 1)])),
    },
  };
}

export function canManageSave() {
  return gameState.phase === PHASES.PREP_FLOOR && !gameState.partyLocked && gameState.activeOverlay === null && !contractStoryLocked();
}

export function showSaveStatus(message, error = false) {
  const status = document.getElementById('saveStatus');
  clearTimeout(saveStatusTimer);
  status.textContent = message;
  status.classList.toggle('error', error);
  status.classList.add('visible');
  saveStatusTimer = setTimeout(() => status.classList.remove('visible'), 3200);
}

export function renderSaveControls() {
  const enabled = canManageSave();
  document.getElementById('saveGameBtn').disabled = !enabled;
  document.getElementById('loadGameBtn').disabled = !enabled;
}

export function downloadSaveFile() {
  if (!canManageSave()) return showSaveStatus('請先結束遠征或目前劇情，再進行存檔。', true);
  const json = JSON.stringify(createSaveData(), null, 2);
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `resonance-tower-save-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  showSaveStatus('存檔已下載。可將 JSON 檔保存到 Google Drive。');
}

export function applySaveData(data) {
  initGame();
  gameState.bankedGold = data.bankedGold;
  gameState.slimeKillCount = data.slimeKillCount;
  gameState.potionUseCount = data.potionUseCount;
  gameState.unlockedChars = data.unlocked;
  gameState.seenCharacterIds = data.seenCharacterIds;
  gameState.resonanceState = data.resonanceState;
  gameState.inventory = data.inventory;
  gameState.ownedSkins = data.ownedSkins;
  gameState.equippedSkinByCharacter = data.equippedSkinByCharacter;
  gameState.chapter1State = data.chapter1State;
  gameState.agentKillCount = data.agentKillCount;
  gameState.xiaochuStoryChapter = data.xiaochuStoryChapter;
  gameState.xiaochuDailyTalkIndex = data.xiaochuDailyTalkIndex;
  gameState.journalReading = data.journalReading;
  gameState.roster.forEach(character => {
    const saved = data.characters.get(character.id);
    if (!saved) return;
    character.level = saved.level;
    character.xp = saved.xp;
    character.lineLevels = saved.lineLevels;
    character.loadout = { activeItemId: saved.activeItemId };
    recomputeStats(character);
    character.curHp = character.maxHp;
  });
  gameState.party = data.party.length ? data.party : ['wuming'];
  overlayUiState.prepLocation = 'village';
  overlayUiState.homeMode = 'menu';
  syncCoinItem();
  render();
}

export async function loadSaveFile(file) {
  if (!file || !canManageSave()) return;
  try {
    const raw = JSON.parse(await file.text());
    const data = normalizeSaveData(raw);
    applySaveData(data);
    showSaveStatus('讀檔完成，永久進度已恢復。');
  } catch (error) {
    console.error('Load failed:', error);
    showSaveStatus(`讀檔失敗：${error.message || '檔案內容不正確'}`, true);
  }
}

export function initSaveSystem() {
  const input = document.getElementById('loadGameInput');
  document.getElementById('saveGameBtn').addEventListener('click', downloadSaveFile);
  document.getElementById('loadGameBtn').addEventListener('click', () => {
    if (!canManageSave()) return showSaveStatus('請先結束遠征或目前劇情，再進行讀檔。', true);
    input.click();
  });
  input.addEventListener('change', async () => {
    await loadSaveFile(input.files && input.files[0]);
    input.value = '';
  });
}
