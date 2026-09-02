// phase is one of:
//  'prepFloor' - manual, no timer: confirm party before the floor's mobs start (or retreat here)
//  'prepBoss'  - manual, no timer: confirm party after mobs are cleared, before the boss
//  'combat'    - the tick loop is actually fighting
let roster = [];
let party = [];
let floor = 1;
let monsters = [];        // 2~3 simultaneous mobs, or a single-element array for the boss wave
let monsterIdCounter = 0;
let phase = 'prepFloor';
let partyLocked = false; // once true (first "開始出擊" of a run), party can't change until endRun()
let mobsCleared = 0;     // counts full MOB WAVES cleared (not individual mobs) toward the boss gate
let partyBuff = { mult: 1, until: 0 };
let partyDefense = { bonus: 0, until: 0 }; // 魔法護盾: adds defense before the normal ATK-DEF damage formula
let bankedGold = 0; // permanent - see endRun(): a wipe now clears this too, only retreat grows it
let runGold = 0;    // this run's unbanked gold - lost on wipe, kept only if you retreat
let logLines = [];

// Backpack shell test data. This becomes the real inventory array once item
// acquisition/consumption is implemented; UI code already reads this shape.
let inventory = Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index) => {
  if (index === 0) return { itemId: 'potion', qty: 2 };
  if (index === 1) return { itemId: 'stone', qty: 3 };
  if (index === 2) return { itemId: 'speedPotion', qty: 2 };
  if (index === 3) return { itemId: 'statBook', qty: 20 }; // TODO: remove once real acquisition is the only source - here so 屬性強化 UI has something to click during testing
  if (index === 4) return { itemId: 'skillBook', qty: 20 }; // TODO: same as above
  return null;
});
let runInventoryGains = {}; // itemId -> unsecured quantity found this expedition

// --- character unlocks (see design.md 角色解鎖系統) ---
// Like level/xp, unlock progress is permanent meta-progression: endRun() never
// touches these, wipe or not (only the gold stash gets nuked on a wipe).
let slimeKillCount = 0;       // lifetime count, feeds the killCount unlock type
let potionUseCount = 0;       // lifetime successful uses, feeds potionCount unlocks
let unlockedChars = new Set(['wuming']); // wuming starts unlocked for free
// id -> 'discovered' | 'complete', for unlock.type 'soulQuest' characters only
// (see worldview_design.md 靈魂任務). Absent/'hidden' means the soul hasn't
// been found yet. Once unlockChar() runs, unlockedChars is the source of
// truth and this stage is no longer consulted.
let soulQuestStage = {};
let combatItemCooldowns = {}; // itemId -> milliseconds remaining
let equippedCombatItemId = null; // one player-controlled combat item, never character-bound
// single source of truth for which modal/popover is currently open - opening
// one always closes whatever else was open first (see closeOtherOverlays in
// ui.js). null | 'shop' | 'inventory' | 'combatItemPicker' | 'characterDetail' | 'dialogue'
let activeOverlay = null;
let shopCountdown = 0;
let shopMode = null; // 'town' spends secured gold; 'dungeon' spends run gold
let shopAutoLeave = true;

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

// call once per boss kill - each not-yet-unlocked bossDropChance character
// gets its own independent roll.
function checkBossDropUnlocks() {
  Object.keys(CHAR_DEFS).forEach(id => {
    if (unlockedChars.has(id)) return;
    const u = CHAR_DEFS[id].unlock;
    if (u.type === 'bossDropChance' && Math.random() < u.chance) {
      unlockChar(id);
    }
  });
}

// human-readable unlock requirement, for prep-card tooltips/overlays
function unlockReqText(id) {
  const u = CHAR_DEFS[id].unlock;
  if (u.type === 'free') return '';
  if (u.type === 'killCount') return `擊殺 ${u.count} 隻史萊姆解鎖（目前 ${Math.min(slimeKillCount, u.count)}/${u.count}）`;
  if (u.type === 'potionCount') return `累計使用 ${u.count} 瓶藥水解鎖（目前 ${Math.min(potionUseCount, u.count)}/${u.count}）`;
  if (u.type === 'bossDropChance') return `擊敗首領，有 ${Math.round(u.chance * 100)}% 機率獲得`;
  if (u.type === 'soulQuest') {
    const stage = soulQuestStage[id] || 'hidden';
    if (stage === 'complete') return '靈魂契約已締結，即將解鎖';
    if (stage === 'discovered') return `靈魂任務進行中：${conditionProgressText(u.goal)}`;
    return `${conditionProgressText(u.trigger)}後，會發現一個只有無名看得見的靈魂`;
  }
  return '';
}

// --- 靈魂任務 condition helpers (see worldview_design.md 靈魂任務) ---
// soulQuest's trigger/goal reuse the same condition shapes as the plain
// threshold unlock types above, so this doesn't invent a second vocabulary.
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

// call after any progress that could advance a soulQuest character to its
// next stage. Two shapes, per worldview_design_v2.md (契約不強制要求跑任務):
//  - has `goal`: two-stage - discovery dialogue first, then (once goal is
//    met) a separate completion dialogue that unlocks on dismissal.
//  - no `goal`: single-stage - trigger plays discoverDialogue once, and
//    unlocks right when that dialogue is dismissed (the encounter IS the
//    whole contract, e.g. 小初's "殺 50 隻史萊姆" or a boss-kill contract).
function checkSoulQuestTriggers() {
  Object.keys(CHAR_DEFS).forEach(id => {
    if (unlockedChars.has(id)) return;
    const u = CHAR_DEFS[id].unlock;
    if (u.type !== 'soulQuest') return;
    const stage = soulQuestStage[id] || 'hidden';
    if (stage === 'hidden' && conditionMet(u.trigger)) {
      if (u.goal) {
        soulQuestStage[id] = 'discovered';
        queueDialogue(u.discoverDialogue);
      } else {
        soulQuestStage[id] = 'complete';
        queueDialogue(u.discoverDialogue, () => unlockChar(id));
      }
    } else if (stage === 'discovered' && u.goal && conditionMet(u.goal)) {
      soulQuestStage[id] = 'complete';
      queueDialogue(u.completeDialogue, () => unlockChar(id));
    }
  });
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
  return Math.round(c.atk * (partyBuff.mult || 1) * (1 - gooPenalty) * lineScale(c, 'atk'));
}

function calcDef(c) {
  return Math.round(c.def * lineScale(c, 'def')) + (partyDefense.bonus || 0);
}

// --- 經驗書 stat/skill lines (see design.md 經驗書／技能點) ---
function lineLevel(c, key) { return (c.lineLevels && c.lineLevels[key]) || 0; }

// 1.0 at line level 0 (unleveled) up to 2.0 at STAT_LINE_MAX (maxed).
function lineScale(c, key) { return 1 + lineLevel(c, key) / STAT_LINE_MAX; }

// this character's own atkInterval multiplier from their 攻速 line - 1 at
// level 0, 0.5 (interval halved, i.e. acts twice as often) at max.
function speedLineIntervalMult(c) { return 1 - 0.5 * (lineLevel(c, 'speed') / STAT_LINE_MAX); }

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
