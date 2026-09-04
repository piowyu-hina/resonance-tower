import { ITEM_DEFS, INVENTORY_SLOT_COUNT, CHAR_DEFS, STAT_LINE_MAX, SKIN_DEFS, DEFAULT_SKIN_BY_CHARACTER, SOLO_PARTY_LIMIT } from './constants.js';
import { gameState, xpToNext, PHASES, contractStoryLocked, recomputeStats, initGame } from './state.js';
import { syncCoinItem } from './ui-commerce.js';
import { render } from './ui-main.js';
import { overlayUiState } from './ui-overlays.js';

// --- 桌面版手動存檔 ---
// Only permanent progression is serialized. An expedition in progress must be
// resolved first, so combat timers and transient DOM state never enter a save.
const SAVE_FORMAT_VERSION = 1;
const RESONANCE_SAVE_STATES = new Set([
  'encountering', 'following', 'villageReturn', 'goHome', 'bookPending',
  'bookReading', 'oathReady', 'contracting', 'contracted',
]);
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
  const unlocked = new Set((Array.isArray(source.unlockedChars) ? source.unlockedChars : []).filter(id => CHAR_DEFS[id]));
  unlocked.add('wuming');
  const seenCharacterIds = new Set((Array.isArray(source.seenCharacterIds) ? source.seenCharacterIds : ['wuming']).filter(id => CHAR_DEFS[id]));
  seenCharacterIds.add('wuming');
  const normalizedResonance = {};
  Object.entries(source.resonanceState || {}).forEach(([id, value]) => {
    if (CHAR_DEFS[id] && RESONANCE_SAVE_STATES.has(value)) normalizedResonance[id] = value;
  });
  if (normalizedResonance.xiaochu === 'contracted') unlocked.add('xiaochu');

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
  const equipped = { ...DEFAULT_SKIN_BY_CHARACTER };
  Object.entries(source.equippedSkinByCharacter || {}).forEach(([characterId, skinId]) => {
    const skin = SKIN_DEFS[skinId];
    if (skin && skin.characterId === characterId && owned.has(skinId)) equipped[characterId] = skinId;
  });
  const savedParty = (Array.isArray(source.party) ? source.party : []).filter(id => unlocked.has(id) && CHAR_DEFS[id]);

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
