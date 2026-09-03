// phase is one of:
//  'prepFloor' - manual, no timer: confirm party before the floor's mobs start (or retreat here)
//  'prepBoss'  - manual, no timer: confirm party after mobs are cleared, before the boss
//  'dungeonIntro' - combat DOM is ready behind the entry curtain, but tick() is paused
//  'bossIntro' - short non-interactive boss title sequence
//  'combat'    - the tick loop is actually fighting
const PHASES = Object.freeze({
  PREP_FLOOR: 'prepFloor',
  PREP_BOSS: 'prepBoss',
  DUNGEON_INTRO: 'dungeonIntro',
  BOSS_INTRO: 'bossIntro',
  COMBAT: 'combat',
  DEFEAT: 'defeat',
  VICTORY: 'victory',
});
const PHASE_TRANSITIONS = Object.freeze({
  [PHASES.PREP_FLOOR]: new Set([PHASES.DUNGEON_INTRO]),
  [PHASES.DUNGEON_INTRO]: new Set([PHASES.COMBAT, PHASES.PREP_FLOOR]),
  [PHASES.COMBAT]: new Set([PHASES.PREP_BOSS, PHASES.DEFEAT, PHASES.VICTORY, PHASES.PREP_FLOOR]),
  [PHASES.PREP_BOSS]: new Set([PHASES.BOSS_INTRO, PHASES.PREP_FLOOR]),
  [PHASES.BOSS_INTRO]: new Set([PHASES.COMBAT, PHASES.PREP_FLOOR]),
  [PHASES.DEFEAT]: new Set([PHASES.PREP_FLOOR]),
  [PHASES.VICTORY]: new Set([PHASES.PREP_FLOOR]),
});

let roster = [];
let party = [];
let floor = 1;
let monsters = [];        // 2~3 simultaneous mobs, or a single-element array for the boss wave
let monsterIdCounter = 0;
let phase = PHASES.PREP_FLOOR;
// Bumped by endRun(). A deferred combat callback (see onMonsterDefeated's
// setTimeouts in combat.js) captures runId when scheduled and checks it
// before acting, so retreating mid-death-animation can't let a stale
// callback mutate a run that already ended.
let runId = 0;
let partyLocked = false; // once true (first "開始出擊" of a run), party can't change until endRun()
let mobsCleared = 0;     // counts full MOB WAVES cleared (not individual mobs) toward the boss gate
let partyBuff = { mult: 1, until: 0 };
let partyDefense = { bonus: 0, until: 0 }; // 魔法護盾: adds defense before the normal ATK-DEF damage formula
let bankedGold = 0; // permanent gold available in the village
let runGold = 0;    // gold earned during the current expedition; always kept when it ends
let logLines = [];

// Normal play starts with an empty backpack. Test items are only available
// through the opt-in ?debug panel, never as invisible production seed data.
let inventory = Array.from({ length: INVENTORY_SLOT_COUNT }, () => null);
let runItemGains = {}; // itemId -> quantity gained this expedition, used only in result summaries

// --- character unlocks (see design.md 角色解鎖系統) ---
// Like level/xp, unlock progress is permanent meta-progression: endRun() never
// touches it.
let slimeKillCount = 0;       // lifetime count, feeds the killCount unlock type
let potionUseCount = 0;       // lifetime successful uses, feeds potionCount unlocks
let unlockedChars = new Set(['wuming']); // wuming starts unlocked for free
// Xiaochu progresses through encounter -> following -> bookPending -> oathReady
// -> contracting -> contracted. Other future resonance characters can reuse
// the same broad encounter/contract pipeline with their own scenes.
// Absent means its hidden synchronization condition has not been met yet.
let resonanceState = {};
let combatItemCooldowns = {}; // itemId -> milliseconds remaining
let equippedCombatItemId = null; // one player-controlled combat item, never character-bound
// single source of truth for which modal/popover is currently open - opening
// one always closes whatever else was open first (see closeOtherOverlays in
// ui.js). null | 'shop' | 'inventory' | 'combatItemPicker' | 'characterDetail'
// | 'dialogue' | 'journal' | 'contract'
let activeOverlay = null;
let shopCountdown = 0;
let shopMode = null; // 'town' spends secured gold; 'dungeon' spends run gold
let shopAutoLeave = true;

// Cosmetics are permanent collection data and never affect combat stats.
let ownedSkins = new Set(Object.values(DEFAULT_SKIN_BY_CHARACTER));
let equippedSkinByCharacter = { ...DEFAULT_SKIN_BY_CHARACTER };

function setPhase(nextPhase, { force = false } = {}) {
  if (!Object.values(PHASES).includes(nextPhase)) throw new Error(`Unknown game phase: ${nextPhase}`);
  if (nextPhase === phase) return;
  if (!force && !PHASE_TRANSITIONS[phase]?.has(nextPhase)) {
    throw new Error(`Illegal game phase transition: ${phase} -> ${nextPhase}`);
  }
  phase = nextPhase;
}

function isPrepPhase(value = phase) {
  return value === PHASES.PREP_FLOOR || value === PHASES.PREP_BOSS;
}

function isCombatSurfacePhase(value = phase) {
  return value === PHASES.DUNGEON_INTRO || value === PHASES.BOSS_INTRO || value === PHASES.COMBAT;
}

function characterSkins(characterId) {
  return Object.entries(SKIN_DEFS)
    .filter(([skinId, skin]) => skin.characterId === characterId && ownedSkins.has(skinId))
    .map(([skinId, skin]) => ({ skinId, ...skin }));
}

function equippedSkin(characterId) {
  const skinId = equippedSkinByCharacter[characterId] || DEFAULT_SKIN_BY_CHARACTER[characterId];
  return SKIN_DEFS[skinId] || SKIN_DEFS[DEFAULT_SKIN_BY_CHARACTER[characterId]];
}

function characterPortraitPath(characterId) {
  return `assets/characters/${equippedSkin(characterId).portrait}.png`;
}

function characterFullArtPath(characterId) {
  return `assets/characters/${equippedSkin(characterId).fullArt}.png`;
}

function equipCharacterSkin(characterId, skinId) {
  const skin = SKIN_DEFS[skinId];
  if (!skin || skin.characterId !== characterId || !ownedSkins.has(skinId)) return false;
  equippedSkinByCharacter[characterId] = skinId;
  return true;
}

function isCharUnlocked(id) { return unlockedChars.has(id); }

function unlockChar(id) {
  if (unlockedChars.has(id)) return;
  unlockedChars.add(id);
  log(`🎉 解鎖新角色：${CHAR_DEFS[id].name}！`, 'good');
}

// call after any progress that could satisfy a threshold-style unlock.
function checkThresholdUnlocks() {
  Object.keys(CHAR_DEFS).forEach(id => {
    if (unlockedChars.has(id)) return;
    const u = CHAR_DEFS[id].unlock;
    if (u.type === 'killCount' && u.monster === 'slime' && slimeKillCount >= u.count) {
      unlockChar(id);
    }
    if (u.type === 'potionCount' && potionUseCount >= u.count) unlockChar(id);
  });
}

// human-readable unlock requirement, for prep-card tooltips/overlays
function unlockReqText(id) {
  const u = CHAR_DEFS[id].unlock;
  if (u.type === 'free') return '';
  if (!DEBUG_MODE) return '尚未產生共鳴';
  if (u.type === 'killCount') return `擊殺 ${u.count} 隻史萊姆解鎖（目前 ${Math.min(slimeKillCount, u.count)}/${u.count}）`;
  if (u.type === 'potionCount') return `累計使用 ${u.count} 瓶藥水解鎖（目前 ${Math.min(potionUseCount, u.count)}/${u.count}）`;
  if (u.type === 'resonanceContract') {
    if (resonanceState[id] === 'encountering') return '正在與未知的靈魂產生共鳴';
    if (resonanceState[id] && resonanceState[id] !== 'contracted') return '已經相遇，尚未締結誓約';
    return `${conditionProgressText(u.trigger)}後，會與未知的共鳴靈產生同步`;
  }
  return '';
}

// --- 共鳴契約條件 helpers (see design.md「契約角色與解鎖」) ---
function conditionMet(cond) {
  if (cond.type === 'killCount' && cond.monster === 'slime') return slimeKillCount >= cond.count;
  if (cond.type === 'potionCount') return potionUseCount >= cond.count;
  return false;
}

function conditionProgressText(cond) {
  if (cond.type === 'killCount') return `擊殺 ${cond.count} 隻史萊姆（目前 ${Math.min(slimeKillCount, cond.count)}/${cond.count}）`;
  if (cond.type === 'potionCount') return `累計使用 ${cond.count} 瓶藥水（目前 ${Math.min(potionUseCount, cond.count)}/${cond.count}）`;
  return '';
}

// Reaching a hidden condition only establishes resonance during an expedition.
// The actual meeting and contract are deferred until the player returns home.
function checkResonanceTriggers() {
  return Object.keys(CHAR_DEFS).find(id => {
    if (unlockedChars.has(id)) return false;
    const u = CHAR_DEFS[id].unlock;
    if (u.type !== 'resonanceContract' || resonanceState[id] || !conditionMet(u.trigger)) return false;
    resonanceState[id] = 'encountering';
    return true;
  });
}

function startPendingVillageContracts() {
  if (resonanceState.xiaochu !== 'following') return;
  resonanceState.xiaochu = 'villageReturn';
  queueDialogue('xiaochu_village', () => {
    resonanceState.xiaochu = 'goHome';
    render();
  });
}

function contractStoryLocked() {
  return ['villageReturn', 'goHome', 'bookPending', 'bookReading', 'oathReady', 'contracting'].includes(resonanceState.xiaochu);
}

let charEls = {};    // id -> battle-card DOM refs, only for CURRENT active party, rebuilt on entering combat
let prepEls = {};    // id -> prep-card DOM refs (checkbox etc.), built once for the whole roster
let monsterEls = {};// monster.id -> battle-card DOM refs (portrait, hp bar, skill overlays...), mirrors charEls
let startBtnEl = null;
let retreatBtnEl = null;
let tooltipEl = null;
let activeGoos = [];      // { el, msLeft, spawnTime }
let gooDebuffStacks = 0;  // matured-but-unclicked goo count this boss fight
let gooSpawnCountdown = 0;
let activeGooBatch = null;

function xpToNext(level) { return level * 10; }

function recomputeStats(c) {
  const def = CHAR_DEFS[c.id];
  c.maxHp = def.baseHp + (c.level - 1) * 6;
  c.atk = def.baseAtk + (c.level - 1) * 2;
  c.def = def.baseDef + Math.floor((c.level - 1) * 0.5);
}

function addXp(c, amount) {
  c.xp += amount;
  while (c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    c.level++;
    recomputeStats(c);
    log(`${CHAR_DEFS[c.id].name} 升級了！目前等級 ${c.level}`, 'good');
  }
}

function xpPoolForFloor(f) { return 20 + f * 5; }
function goldForKill(isBoss, f) { return isBoss ? 20 + f * 5 : 5 + f * 2; }

function calcAtk(c) {
  const gooPenalty = Math.min(GOO_DEBUFF_CAP, gooDebuffStacks * GOO_DEBUFF_PER_STACK);
  const charm = equippedCharmPassive(c, 'atkPct');
  return Math.round(c.atk * (partyBuff.mult || 1) * (1 - gooPenalty) * lineScale(c, 'atk') * (1 + charm));
}

function calcDef(c) {
  return Math.round(c.def * lineScale(c, 'def')) + (partyDefense.bonus || 0) + equippedCharmPassive(c, 'defFlat');
}

function equippedCharmPassive(c, type) {
  const item = c && c.loadout && ITEM_DEFS[c.loadout.activeItemId];
  return item && item.equipSlot === 'charm' && item.passive && item.passive.type === type ? item.passive.value : 0;
}

// --- 經驗書 stat/skill lines (see design.md 經驗書／技能點) ---
function lineLevel(c, key) { return (c.lineLevels && c.lineLevels[key]) || 0; }

// 1.0 at line level 0 (unleveled) up to 2.0 at STAT_LINE_MAX (maxed).
function lineScale(c, key) { return 1 + lineLevel(c, key) / STAT_LINE_MAX; }

// this character's own atkInterval multiplier from their 攻速 line - 1 at
// level 0, 0.5 (interval halved, i.e. acts twice as often) at max.
function speedLineIntervalMult(c) {
  return (1 - 0.5 * (lineLevel(c, 'speed') / STAT_LINE_MAX)) * (1 - equippedCharmPassive(c, 'speedPct'));
}

// same halving treatment for 專屬操作's own cooldown, via its 'action' line.
// Applies regardless of what the action's type does (currently only
// randomSkill exists, which has no magnitude of its own to scale - its
// picked skill's damage/heal/etc is already covered by that skill's own
// line), so "cast it more often" is the one upgrade that always applies.
function actionLineCooldownMult(c) { return 1 - 0.5 * (lineLevel(c, 'action') / STAT_LINE_MAX); }

function skillLineKey(skillIndex) { return `skill${skillIndex}`; }
function skillLineScale(c, skillIndex) { return lineScale(c, skillLineKey(skillIndex)); }

// which book item (see ITEM_DEFS) a given line spends - general lines each
// declare their own bookId (currently all statBook); skill lines always cost
// skillBook.
function lineBookId(lineKey) {
  const general = GENERAL_STAT_LINES.find(line => line.key === lineKey);
  return general ? general.bookId : 'skillBook';
}

// consumes 1 of the matching book from the shared inventory to permanently
// raise one of this character's lines (3 general + 3 per-skill + 專屬操作) by 1 level.
function useExpBookOnLine(characterId, lineKey) {
  const c = roster.find(member => member.id === characterId);
  if (!c) return false;
  if (lineLevel(c, lineKey) >= STAT_LINE_MAX) return false;
  const bookId = lineBookId(lineKey);
  if (!consumeInventoryItem(bookId, 1)) return false;
  c.lineLevels[lineKey] = lineLevel(c, lineKey) + 1;
  log(`${CHAR_DEFS[c.id].name} 使用${ITEM_DEFS[bookId].name}強化了${statLineLabel(c, lineKey)}，目前 ${c.lineLevels[lineKey]}/${STAT_LINE_MAX} 級`, 'good');
  return true;
}

function statLineLabel(c, lineKey) {
  const general = GENERAL_STAT_LINES.find(line => line.key === lineKey);
  if (general) return general.label;
  if (lineKey === 'action') return CHAR_DEFS[c.id].action.name;
  const skillIndex = Number(lineKey.replace('skill', ''));
  return CHAR_DEFS[c.id].skills[skillIndex].name;
}

// applies +/-DAMAGE_VARIANCE random spread to a computed base damage value,
// always rounding to a whole number no lower than 1.
function rollDamage(base) {
  const mult = 1 - DAMAGE_VARIANCE + Math.random() * (DAMAGE_VARIANCE * 2);
  return Math.max(1, stochasticRound(base * mult));
}

function stochasticRound(value) {
  const lower = Math.floor(value);
  return lower + (Math.random() < value - lower ? 1 : 0);
}

function activeAliveMembers() {
  return roster.filter(c => party.includes(c.id) && c.alive);
}

function aliveMonsters() {
  return monsters.filter(m => m.alive);
}

// type: 'party' | 'enemy' | 'good' | 'warn' | '' (neutral/system)
function log(msg, type = '') {
  logLines.push({ msg, type });
  if (logLines.length > 60) logLines.shift();
}
