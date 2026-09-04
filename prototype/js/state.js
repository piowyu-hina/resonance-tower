import {
  INVENTORY_SLOT_COUNT, DEFAULT_SKIN_BY_CHARACTER, SKIN_DEFS, CHAR_DEFS, DEBUG_MODE,
  GOO_DEBUFF_CAP, GOO_DEBUFF_PER_STACK, STAT_LINE_MAX, GENERAL_STAT_LINES, DAMAGE_VARIANCE,
  ITEM_DEFS, ROSTER_CHAR_IDS, PRE_AGENT_LEVEL_CAP,
} from './constants.js';
import { queueDialogue } from './story.js';
import { render } from './ui-main.js';
import { consumeInventoryItem } from './shop.js';

// phase is one of:
//  'prepFloor' - manual, no timer: confirm party before the floor's mobs start (or retreat here)
//  'prepBoss'  - manual, no timer: confirm party after mobs are cleared, before the boss
//  'dungeonIntro' - combat DOM is ready behind the entry curtain, but tick() is paused
//  'bossIntro' - short non-interactive boss title sequence
//  'combat'    - the tick loop is actually fighting
export const PHASES = Object.freeze({
  PREP_FLOOR: 'prepFloor',
  PREP_BOSS: 'prepBoss',
  DUNGEON_INTRO: 'dungeonIntro',
  BOSS_INTRO: 'bossIntro',
  COMBAT: 'combat',
  DEFEAT: 'defeat',
  VICTORY: 'victory',
});
export const PHASE_TRANSITIONS = Object.freeze({
  [PHASES.PREP_FLOOR]: new Set([PHASES.DUNGEON_INTRO]),
  [PHASES.DUNGEON_INTRO]: new Set([PHASES.COMBAT, PHASES.PREP_FLOOR]),
  [PHASES.COMBAT]: new Set([PHASES.PREP_BOSS, PHASES.BOSS_INTRO, PHASES.DEFEAT, PHASES.VICTORY, PHASES.PREP_FLOOR]),
  [PHASES.PREP_BOSS]: new Set([PHASES.BOSS_INTRO, PHASES.PREP_FLOOR]),
  [PHASES.BOSS_INTRO]: new Set([PHASES.COMBAT, PHASES.PREP_FLOOR]),
  [PHASES.DEFEAT]: new Set([PHASES.PREP_FLOOR]),
  [PHASES.VICTORY]: new Set([PHASES.PREP_FLOOR]),
});

// Every other file imports this one object and mutates its properties -
// never reassigns the `gameState` binding itself (ES module imports are
// read-only live bindings; only this file may do `gameState = ...`, which
// it never needs to since every field below is mutated in place instead).
export const gameState = {
  roster: [],
  party: [],
  floor: 1,
  monsters: [],        // 2~3 simultaneous mobs, or a single-element array for the boss wave
  monsterIdCounter: 0,
  phase: PHASES.PREP_FLOOR,
  // Bumped by endRun(). A deferred combat callback (see onMonsterDefeated's
  // setTimeouts in combat.js) captures runId when scheduled and checks it
  // before acting, so retreating mid-death-animation can't let a stale
  // callback mutate a run that already ended.
  runId: 0,
  chapter1State: 'forest',
  expeditionMode: 'forest',
  ruinsKillCount: 0,
  partyLocked: false, // once true (first "開始出擊" of a run), party can't change until endRun()
  mobsCleared: 0,     // counts full MOB WAVES cleared (not individual mobs) toward the boss gate
  partyBuff: { mult: 1, until: 0 },
  partyDefense: { bonus: 0, until: 0 }, // 魔法護盾: adds defense before the normal ATK-DEF damage formula
  bankedGold: 0, // permanent gold available in the village
  runGold: 0,    // gold earned during the current expedition; always kept when it ends
  logLines: [],

  // Normal play starts with an empty backpack. Test items are only available
  // through the opt-in ?debug panel, never as invisible production seed data.
  inventory: Array.from({ length: INVENTORY_SLOT_COUNT }, () => null),
  runItemGains: {}, // itemId -> quantity gained this expedition, used only in result summaries

  // --- character unlocks (see design.md 角色解鎖系統) ---
  // Like level/xp, unlock progress is permanent meta-progression: endRun() never
  // touches it.
  slimeKillCount: 0,       // lifetime count, feeds the killCount unlock type
  potionUseCount: 0,       // lifetime successful uses, feeds potionCount unlocks
  unlockedChars: new Set(['wuming']), // wuming starts unlocked for free
  seenCharacterIds: new Set(['wuming']), // unlocked roster cards keep NEW until their detail is opened
  // Xiaochu progresses through encounter -> following -> bookPending -> oathReady
  // -> contracting -> contracted. Other future resonance characters can reuse
  // the same broad encounter/contract pipeline with their own scenes.
  // Absent means its hidden synchronization condition has not been met yet.
  resonanceState: {},
  combatItemCooldowns: {}, // itemId -> milliseconds remaining
  equippedCombatItemId: null, // one player-controlled combat item, never character-bound
  // single source of truth for which modal/popover is currently open - opening
  // one always closes whatever else was open first (see closeOtherOverlays in
  // ui-overlays.js). null | 'shop' | 'inventory' | 'combatItemPicker' | 'characterDetail'
  // | 'dialogue' | 'journal' | 'contract' | 'event'
  activeOverlay: null,
  currentEventId: null,
  eventCountdown: 0,
  shopCountdown: 0,
  shopMode: null, // 'town' spends secured gold; 'dungeon' spends run gold
  shopAutoLeave: true,

  // Cosmetics are permanent collection data and never affect combat stats.
  ownedSkins: new Set(Object.values(DEFAULT_SKIN_BY_CHARACTER)),
  equippedSkinByCharacter: { ...DEFAULT_SKIN_BY_CHARACTER },

  charEls: {},    // id -> battle-card DOM refs, only for CURRENT active party, rebuilt on entering combat
  prepEls: {},    // id -> prep-card DOM refs (checkbox etc.), built once for the whole roster
  monsterEls: {}, // monster.id -> battle-card DOM refs (portrait, hp bar, skill overlays...), mirrors charEls
  startBtnEl: null,
  retreatBtnEl: null,
  tooltipEl: null,
  activeGoos: [],      // { el, msLeft, spawnTime }
  gooDebuffStacks: 0,  // matured-but-unclicked goo count this boss fight
  gooSpawnCountdown: 0,
  activeGooBatch: null,
};

// Resets gameState to a fresh game's starting values. Moved here (out of
// main.js) so save.js's applySaveData() can call it without importing the
// bootstrap entry file - gameState is what it resets, so it belongs here.
export function initGame() {
  gameState.roster = ROSTER_CHAR_IDS.map(id => {
    const c = { id, level: 1, xp: 0, alive: true, skillCds: [0, 0, 0], manualActionCd: 0, actionCountdown: 0, hasteMult: 1, hasteUntil: 0, dodgeUntil: 0, slowMult: 1, slowUntil: 0, sleepUntilAction: false, charmedUntilAction: false, loadout: { activeItemId: null }, lineLevels: { atk: 0, def: 0, speed: 0, skill0: 0, skill1: 0, skill2: 0, action: 0 } };
    recomputeStats(c);
    c.curHp = c.maxHp;
    return c;
  });
  gameState.party = ['wuming'];
  gameState.floor = 1;
  gameState.chapter1State = CHAPTER1_STATES.FOREST;
  gameState.expeditionMode = 'forest';
  gameState.ruinsKillCount = 0;
  gameState.partyLocked = false;
  gameState.mobsCleared = 0;
  gameState.bankedGold = 0;
  gameState.runGold = 0;
  gameState.partyBuff = { mult: 1, until: 0 };
  gameState.partyDefense = { bonus: 0, until: 0 };
  gameState.logLines = [];
  gameState.seenCharacterIds = new Set(['wuming']);
  gameState.currentEventId = null;
  gameState.eventCountdown = 0;
}

// Shared character-card status catalogue. Each entry only declares how to
// identify and display a status; ui-main.js renders every active entry
// through one generic status row instead of maintaining status-specific DOM
// elements. img points at assets/effect_icon/<img>.png; ui-main.js falls
// back to the emoji if the file is missing, same onerror pattern as
// everywhere else.
export const STATUS_DEFS = [
  { id: 'sleep', icon: '💤', img: 'sleep', label: '睡眠', tone: 'bad', desc: '下一次行動會用來醒來，該次行動被跳過', blocksCharacterAction: true, isActive: c => c.sleepUntilAction },
  { id: 'charm', icon: '💕', img: 'charming', label: '魅惑', tone: 'bad', desc: '下一次行動會改為攻擊友軍（沒有友軍時攻擊自己）', blocksCharacterAction: true, isActive: c => c.charmedUntilAction },
  { id: 'slow', icon: '🐌', img: 'speed_down', label: '降攻速', tone: 'bad', desc: '攻速倒數條累積速度變慢', isActive: c => c.slowUntil > 0, remaining: c => c.slowUntil },
  { id: 'haste', icon: '⏱️', img: 'speed_up', label: '加速', tone: 'good', desc: '攻速倒數條累積速度變快', isActive: c => c.hasteUntil > 0, remaining: c => c.hasteUntil },
  { id: 'dodge', icon: '👤', img: 'hide', label: '隱身', tone: 'good', desc: '持續期間閃避敵方所有攻擊', isActive: c => c.dodgeUntil > 0, remaining: c => c.dodgeUntil },
  { id: 'defenseUp', icon: '🔷', img: 'def_up', label: '防禦提升', tone: 'good', desc: '隊伍防禦力提升，減少受到的傷害', isActive: () => gameState.partyDefense.until > 0, remaining: () => gameState.partyDefense.until },
];

export function setPhase(nextPhase, { force = false } = {}) {
  if (!Object.values(PHASES).includes(nextPhase)) throw new Error(`Unknown game phase: ${nextPhase}`);
  if (nextPhase === gameState.phase) return;
  if (!force && !PHASE_TRANSITIONS[gameState.phase]?.has(nextPhase)) {
    throw new Error(`Illegal game phase transition: ${gameState.phase} -> ${nextPhase}`);
  }
  gameState.phase = nextPhase;
}

export function isPrepPhase(value = gameState.phase) {
  return value === PHASES.PREP_FLOOR || value === PHASES.PREP_BOSS;
}

export function isCombatSurfacePhase(value = gameState.phase) {
  return value === PHASES.DUNGEON_INTRO || value === PHASES.BOSS_INTRO || value === PHASES.COMBAT;
}

// gameState.resonanceState[characterId] is a per-character pipeline: a
// hidden unlock condition is met -> 'encountering' -> the character's own
// scene/dialogue chain -> 'contracted'. Xiaochu is the only character wired
// up today, but any future resonance character reuses these same states
// with their own dialogue scripts (see design.md 契約角色與解鎖). Mirrors
// the PHASES/PHASE_TRANSITIONS discipline above: nothing outside this file
// may assign gameState.resonanceState[id] a bare string directly - always
// go through setResonanceState(), which validates the transition and throws
// on a stale or misspelled state name instead of silently wedging the story.
export const RESONANCE_STATES = Object.freeze({
  ENCOUNTERING: 'encountering',
  FOLLOWING: 'following',
  VILLAGE_RETURN: 'villageReturn',
  GO_HOME: 'goHome',
  BOOK_PENDING: 'bookPending',
  BOOK_READING: 'bookReading',
  OATH_READY: 'oathReady',
  CONTRACTING: 'contracting',
  CONTRACTED: 'contracted',
});
const RS = RESONANCE_STATES;
// checkResonanceTriggers() is the only place allowed to set a character's
// first-ever state, so "not set yet" only ever advances to ENCOUNTERING.
const RESONANCE_INITIAL_TRANSITIONS = new Set([RS.ENCOUNTERING]);
export const RESONANCE_TRANSITIONS = Object.freeze({
  [RS.ENCOUNTERING]: new Set([RS.FOLLOWING]),
  [RS.FOLLOWING]: new Set([RS.VILLAGE_RETURN]),
  [RS.VILLAGE_RETURN]: new Set([RS.GO_HOME]),
  [RS.GO_HOME]: new Set([RS.BOOK_PENDING]),
  [RS.BOOK_PENDING]: new Set([RS.BOOK_READING]),
  [RS.BOOK_READING]: new Set([RS.OATH_READY]),
  [RS.OATH_READY]: new Set([RS.CONTRACTING]),
  [RS.CONTRACTING]: new Set([RS.CONTRACTED]),
  [RS.CONTRACTED]: new Set(),
});

export function setResonanceState(characterId, nextState, { force = false } = {}) {
  if (!Object.values(RESONANCE_STATES).includes(nextState)) {
    throw new Error(`Unknown resonance state: ${nextState}`);
  }
  const current = gameState.resonanceState[characterId];
  if (current === nextState) return;
  const allowed = current === undefined ? RESONANCE_INITIAL_TRANSITIONS : RESONANCE_TRANSITIONS[current];
  if (!force && !allowed?.has(nextState)) {
    throw new Error(`Illegal resonance transition for ${characterId}: ${current} -> ${nextState}`);
  }
  gameState.resonanceState[characterId] = nextState;
}

export function clearResonanceState(characterId) {
  delete gameState.resonanceState[characterId];
}

// States where the player is mid-scene on the way home and prep/inventory/
// saving must stay locked - deliberately excludes FOLLOWING (still freely
// playable out in the field) and CONTRACTED (story fully resolved).
const RESONANCE_STORY_LOCKED_STATES = new Set([
  RS.VILLAGE_RETURN, RS.GO_HOME, RS.BOOK_PENDING, RS.BOOK_READING, RS.OATH_READY, RS.CONTRACTING,
]);

export const CHAPTER1_STATES = Object.freeze({
  FOREST: 'forest',
  RUINS: 'ruins',
  GODDESS: 'goddess',
  HOME_RETURN: 'homeReturn',
  JOURNAL_PENDING: 'journalPending',
  JOURNAL_READING: 'journalReading',
  COMPLETE: 'complete',
});

export function setChapter1State(nextState) {
  if (!Object.values(CHAPTER1_STATES).includes(nextState)) throw new Error(`Unknown chapter 1 state: ${nextState}`);
  gameState.chapter1State = nextState;
}

export function characterSkins(characterId) {
  return Object.entries(SKIN_DEFS)
    .filter(([skinId, skin]) => skin.characterId === characterId && gameState.ownedSkins.has(skinId))
    .map(([skinId, skin]) => ({ skinId, ...skin }));
}

export function equippedSkin(characterId) {
  const skinId = gameState.equippedSkinByCharacter[characterId] || DEFAULT_SKIN_BY_CHARACTER[characterId];
  return SKIN_DEFS[skinId] || SKIN_DEFS[DEFAULT_SKIN_BY_CHARACTER[characterId]];
}

export function characterPortraitPath(characterId) {
  return `assets/characters/${equippedSkin(characterId).portrait}.png`;
}

export function characterFullArtPath(characterId) {
  return `assets/characters/${equippedSkin(characterId).fullArt}.png`;
}

export function equipCharacterSkin(characterId, skinId) {
  const skin = SKIN_DEFS[skinId];
  if (!skin || skin.characterId !== characterId || !gameState.ownedSkins.has(skinId)) return false;
  gameState.equippedSkinByCharacter[characterId] = skinId;
  return true;
}

export function isCharUnlocked(id) { return gameState.unlockedChars.has(id); }

export function unlockChar(id) {
  if (gameState.unlockedChars.has(id)) return;
  gameState.unlockedChars.add(id);
  log(`🎉 解鎖新角色：${CHAR_DEFS[id].name}！`, 'good');
}

// call after any progress that could satisfy a threshold-style unlock.
export function checkThresholdUnlocks() {
  ROSTER_CHAR_IDS.forEach(id => {
    if (gameState.unlockedChars.has(id)) return;
    const u = CHAR_DEFS[id].unlock;
    if (u.type === 'killCount' && u.monster === 'slime' && gameState.slimeKillCount >= u.count) {
      unlockChar(id);
    }
    if (u.type === 'potionCount' && gameState.potionUseCount >= u.count) unlockChar(id);
  });
}

// human-readable unlock requirement, for prep-card tooltips/overlays
export function unlockReqText(id) {
  const u = CHAR_DEFS[id].unlock;
  if (u.type === 'free') return '';
  if (!DEBUG_MODE) return '尚未產生共鳴';
  if (u.type === 'killCount') return `擊殺 ${u.count} 隻史萊姆解鎖（目前 ${Math.min(gameState.slimeKillCount, u.count)}/${u.count}）`;
  if (u.type === 'potionCount') return `累計使用 ${u.count} 瓶藥水解鎖（目前 ${Math.min(gameState.potionUseCount, u.count)}/${u.count}）`;
  if (u.type === 'resonanceContract') {
    if (gameState.resonanceState[id] === RS.ENCOUNTERING) return '正在與未知的靈魂產生共鳴';
    if (gameState.resonanceState[id] && gameState.resonanceState[id] !== RS.CONTRACTED) return '已經相遇，尚未締結誓約';
    return `${conditionProgressText(u.trigger)}後，會與未知的共鳴靈產生同步`;
  }
  return '';
}

// --- 共鳴契約條件 helpers (see design.md「契約角色與解鎖」) ---
export function conditionMet(cond) {
  if (cond.type === 'killCount' && cond.monster === 'slime') return gameState.slimeKillCount >= cond.count;
  if (cond.type === 'potionCount') return gameState.potionUseCount >= cond.count;
  return false;
}

export function conditionProgressText(cond) {
  if (cond.type === 'killCount') return `擊殺 ${cond.count} 隻史萊姆（目前 ${Math.min(gameState.slimeKillCount, cond.count)}/${cond.count}）`;
  if (cond.type === 'potionCount') return `累計使用 ${cond.count} 瓶藥水（目前 ${Math.min(gameState.potionUseCount, cond.count)}/${cond.count}）`;
  return '';
}

// Reaching a hidden condition only establishes resonance during an expedition.
// The actual meeting and contract are deferred until the player returns home.
export function checkResonanceTriggers() {
  if (gameState.chapter1State !== CHAPTER1_STATES.COMPLETE) return false;
  return ROSTER_CHAR_IDS.find(id => {
    if (gameState.unlockedChars.has(id)) return false;
    const u = CHAR_DEFS[id].unlock;
    if (u.type !== 'resonanceContract' || gameState.resonanceState[id] || !conditionMet(u.trigger)) return false;
    setResonanceState(id, RS.ENCOUNTERING);
    return true;
  });
}

export function startPendingVillageContracts() {
  if (gameState.resonanceState.xiaochu !== RS.FOLLOWING) return;
  setResonanceState('xiaochu', RS.VILLAGE_RETURN);
  queueDialogue('xiaochu_village', () => {
    setResonanceState('xiaochu', RS.GO_HOME);
    render();
  });
}

export function contractStoryLocked() {
  const chapterLocked = [CHAPTER1_STATES.GODDESS, CHAPTER1_STATES.HOME_RETURN, CHAPTER1_STATES.JOURNAL_PENDING, CHAPTER1_STATES.JOURNAL_READING].includes(gameState.chapter1State);
  return chapterLocked || RESONANCE_STORY_LOCKED_STATES.has(gameState.resonanceState.xiaochu);
}

export function xpToNext(level) { return level * 10; }

export function characterLevelCap() {
  return [CHAPTER1_STATES.FOREST, CHAPTER1_STATES.RUINS, CHAPTER1_STATES.GODDESS].includes(gameState.chapter1State)
    ? PRE_AGENT_LEVEL_CAP
    : Number.POSITIVE_INFINITY;
}

export function recomputeStats(c) {
  const def = CHAR_DEFS[c.id];
  c.maxHp = def.baseHp + (c.level - 1) * 6;
  c.atk = def.baseAtk + (c.level - 1) * 2;
  c.def = def.baseDef + Math.floor((c.level - 1) * 0.5);
}

export function addXp(c, amount) {
  const cap = characterLevelCap();
  if (c.level >= cap) {
    c.level = cap;
    c.xp = 0;
    return;
  }
  c.xp += amount;
  while (c.level < cap && c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    c.level++;
    recomputeStats(c);
    log(`${CHAR_DEFS[c.id].name} 升級了！目前等級 ${c.level}`, 'good');
  }
  if (c.level >= cap) c.xp = 0;
}

export function xpPoolForFloor(f) { return 20 + f * 5; }
export function goldForKill(isBoss, f) { return isBoss ? 20 + f * 5 : 5 + f * 2; }

export function calcAtk(c) {
  const gooPenalty = Math.min(GOO_DEBUFF_CAP, gameState.gooDebuffStacks * GOO_DEBUFF_PER_STACK);
  const charm = equippedCharmPassive(c, 'atkPct');
  return Math.round(c.atk * (gameState.partyBuff.mult || 1) * (1 - gooPenalty) * lineScale(c, 'atk') * (1 + charm));
}

export function calcDef(c) {
  return Math.round(c.def * lineScale(c, 'def')) + (gameState.partyDefense.bonus || 0) + equippedCharmPassive(c, 'defFlat');
}

export function equippedCharmPassive(c, type) {
  const item = c && c.loadout && ITEM_DEFS[c.loadout.activeItemId];
  return item && item.equipSlot === 'charm' && item.passive && item.passive.type === type ? item.passive.value : 0;
}

// --- 經驗書 stat/skill lines (see design.md 經驗書／技能點) ---
export function lineLevel(c, key) { return (c.lineLevels && c.lineLevels[key]) || 0; }

// 1.0 at line level 0 (unleveled) up to 2.0 at STAT_LINE_MAX (maxed).
export function lineScale(c, key) { return 1 + lineLevel(c, key) / STAT_LINE_MAX; }

// this character's own atkInterval multiplier from their 攻速 line - 1 at
// level 0, 0.5 (interval halved, i.e. acts twice as often) at max.
export function speedLineIntervalMult(c) {
  return (1 - 0.5 * (lineLevel(c, 'speed') / STAT_LINE_MAX)) * (1 - equippedCharmPassive(c, 'speedPct'));
}

// same halving treatment for 專屬操作's own cooldown, via its 'action' line.
// Applies regardless of what the action's type does (currently only
// randomSkill exists, which has no magnitude of its own to scale - its
// picked skill's damage/heal/etc is already covered by that skill's own
// line), so "cast it more often" is the one upgrade that always applies.
export function actionLineCooldownMult(c) { return 1 - 0.5 * (lineLevel(c, 'action') / STAT_LINE_MAX); }

export function skillLineKey(skillIndex) { return `skill${skillIndex}`; }
export function skillLineScale(c, skillIndex) { return lineScale(c, skillLineKey(skillIndex)); }

// which book item (see ITEM_DEFS) a given line spends - general lines each
// declare their own bookId (currently all statBook); skill lines always cost
// skillBook.
export function lineBookId(lineKey) {
  const general = GENERAL_STAT_LINES.find(line => line.key === lineKey);
  return general ? general.bookId : 'skillBook';
}

// consumes 1 of the matching book from the shared inventory to permanently
// raise one of this character's lines (3 general + 3 per-skill + 專屬操作) by 1 level.
export function useExpBookOnLine(characterId, lineKey) {
  const c = gameState.roster.find(member => member.id === characterId);
  if (!c) return false;
  if (lineLevel(c, lineKey) >= STAT_LINE_MAX) return false;
  const bookId = lineBookId(lineKey);
  if (!consumeInventoryItem(bookId, 1)) return false;
  c.lineLevels[lineKey] = lineLevel(c, lineKey) + 1;
  log(`${CHAR_DEFS[c.id].name} 使用${ITEM_DEFS[bookId].name}強化了${statLineLabel(c, lineKey)}，目前 ${c.lineLevels[lineKey]}/${STAT_LINE_MAX} 級`, 'good');
  return true;
}

export function statLineLabel(c, lineKey) {
  const general = GENERAL_STAT_LINES.find(line => line.key === lineKey);
  if (general) return general.label;
  if (lineKey === 'action') return CHAR_DEFS[c.id].action.name;
  const skillIndex = Number(lineKey.replace('skill', ''));
  return CHAR_DEFS[c.id].skills[skillIndex].name;
}

// applies +/-DAMAGE_VARIANCE random spread to a computed base damage value,
// always rounding to a whole number no lower than 1.
export function rollDamage(base) {
  const mult = 1 - DAMAGE_VARIANCE + Math.random() * (DAMAGE_VARIANCE * 2);
  return Math.max(1, stochasticRound(base * mult));
}

export function stochasticRound(value) {
  const lower = Math.floor(value);
  return lower + (Math.random() < value - lower ? 1 : 0);
}

export function activeAliveMembers() {
  return gameState.roster.filter(c => gameState.party.includes(c.id) && c.alive);
}

export function aliveMonsters() {
  return gameState.monsters.filter(m => m.alive);
}

// type: 'party' | 'enemy' | 'good' | 'warn' | '' (neutral/system)
export function log(msg, type = '') {
  gameState.logLines.push({ msg, type });
  if (gameState.logLines.length > 60) gameState.logLines.shift();
}
