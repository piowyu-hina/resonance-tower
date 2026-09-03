// Display-only tiers mirroring each character's unlock difficulty (see each
// CHAR_DEFS entry's `rarity`) - purely cosmetic, does NOT affect stats. Keeping
// power gated by level+skill points only (see design.md: 不做裝備／武器系統).
const RARITY_DEFS = {
  common: { label: '普通', color: '#9aa0a8' },
  rare:   { label: '稀有', color: '#5a8fd6', revealEffect: 'rare_magic_circle' },
  epic:   { label: '史詩', color: '#c979e8' },
  unique: { label: '獨特', color: '#e08a3c' },
};

// Development-only controls and exact unlock requirements are available with
// ?debug in the URL. Normal play keeps hidden conditions and destructive reset
// controls out of the main interface.
const DEBUG_MODE = new URLSearchParams(window.location.search).has('debug');

// Floor-1 monster catalogue. Skills describe targets + composable effects;
// combat.js interprets those declarations without branching on monster names.
// New variants can therefore be added here without rewriting the turn loop.
const MONSTER_DEFS = {
  slime: {
    name: '史萊姆', img: 'floor1/slime',
    skill: {
      name: '黏液潑濺', icon: '💧', img: 'floor1/slime_skill', cd: 4,
      target: 'randomParty',
      effects: [
        { type: 'damage', mult: 1 },
        { type: 'slow', mult: 1.5, duration: 4 },
      ],
      desc: '造成傷害並降低攻速 4 秒',
    },
  },
  slimeAngry: {
    name: '生氣史萊姆', img: 'floor1/slime_angry',
    skill: {
      name: '怒氣撞擊', icon: '💢', img: 'floor1/slime_angry_skill', cd: 7,
      target: 'randomParty', effects: [{ type: 'damage', mult: 1.8 }],
      desc: '造成普通攻擊 1.8 倍的高額傷害',
    },
  },
  slimeSleepy: {
    name: '瞌睡史萊姆', img: 'floor1/slime_sleepy',
    skill: {
      name: '睡意傳染', icon: '💤', img: 'floor1/slime_sleepy_skill', cd: 7,
      target: 'randomParty', effects: [{ type: 'sleepUntilAction' }],
      desc: '使玩家睡著；攻速條跑完一次後醒來，但該次行動會被跳過',
    },
  },
  slimeLove: {
    name: '愛心史萊姆', img: 'floor1/slime_love',
    skill: {
      name: '魅惑', icon: '💕', img: 'floor1/slime_love_skill', cd: 7,
      target: 'randomParty', effects: [{ type: 'charmAttackAlly' }],
      desc: '使玩家下一次行動改為攻擊友軍；沒有友軍時會攻擊自己',
    },
  },
  slimeHeal: {
    name: '治療史萊姆', img: 'floor1/slime_heal',
    skill: {
      name: '治癒黏液', icon: '✨', img: 'floor1/slime_heal_skill', cd: 7,
      target: 'lowestHpMonster', effects: [{ type: 'heal', pct: 0.25 }],
      desc: '治療生命比例最低的受傷同伴 25% 最大生命值',
    },
  },
};

const FLOOR1_MOB_POOL = Object.keys(MONSTER_DEFS);

// Inventory definitions are display/data only for now. The first backpack
// pass deliberately has no consume/drop/shop behavior attached yet.
const ITEM_DEFS = {
  potion: {
    name: '治療藥水',
    img: 'potion',
    rarity: '普通',
    category: 'potion',
    equipSlot: 'potion',
    combatAction: {
      cooldown: 10,
      target: 'lowestHpParty',
      effects: [{ type: 'healMaxHpPct', pct: 0.3 }],
    },
    desc: '治療生命比例最低的存活角色，恢復其 30% 最大生命值。冷卻 10 秒。',
  },
  speedPotion: {
    name: '迅捷藥水',
    img: 'speed_potion',
    rarity: '普通',
    category: 'potion',
    equipSlot: 'potion',
    combatAction: {
      cooldown: 10,
      target: 'allParty',
      effects: [{ type: 'haste', mult: 0.5, duration: 30 }],
    },
    desc: '使全隊攻速提升 50%，持續 30 秒。冷卻 10 秒。',
  },
  powerCharm: {
    name: '力量護符', img: 'active_items/power_up_ring', rarity: '普通', category: 'charm', equipSlot: 'charm',
    passive: { type: 'atkPct', value: 0.15 },
    desc: '附身角色的攻擊力提升 15%。',
  },
  guardCharm: {
    name: '守護護符', img: 'active_items/recover_ring', rarity: '普通', category: 'charm', equipSlot: 'charm',
    passive: { type: 'defFlat', value: 2 },
    desc: '附身角色的防禦力提升 2。',
  },
  windCharm: {
    name: '疾風護符', img: 'active_items/speed_up_ring', rarity: '普通', category: 'charm', equipSlot: 'charm',
    passive: { type: 'speedPct', value: 0.15 },
    desc: '附身角色的行動間隔縮短 15%。',
  },
  monsterCrystal: {
    name: '魔物結晶',
    img: 'monster_crystal',
    rarity: '普通',
    equipSlot: null,
    maxStack: 99,
    desc: '怪物掉落的漂亮結晶，可以賣個好價錢。',
  },
  statBook: {
    name: '能力書',
    img: 'exp_book_stat',
    rarity: '普通',
    equipSlot: null,
    maxStack: 99,
    desc: '消耗後可為角色的攻擊力／防禦力／攻速其中一條永久 +1 級（最高 100 級，滿級為基礎值的 2 倍）。',
  },
  skillBook: {
    name: '技能書',
    img: 'exp_book_skill',
    rarity: '普通',
    equipSlot: null,
    maxStack: 99,
    desc: '消耗後可為角色某一個自動技能的效果永久 +1 級（最高 100 級，滿級為基礎值的 2 倍）。',
  },
};
const INVENTORY_SLOT_COUNT = 15; // 15 item slots + 1 reserved coin position = 4×4 backpack
const STORAGE_SLOT_COUNT = 16;
const SLIME_MONSTER_CRYSTAL_DROP_CHANCE = 0.35;
const SLIME_STAT_BOOK_DROP_CHANCE = 0.15;
const SLIME_SKILL_BOOK_DROP_CHANCE = 0.15;

// Per-character stat/skill "lines" unlocked by spending 能力書／技能書 (see
// design.md 經驗書／技能點強化 section). Each line goes 0~STAT_LINE_MAX; at
// max its scale factor is 2x the unleveled value. General lines (bookId:
// statBook) apply to atk/def/attack speed; skill lines (skill0/skill1/skill2,
// always skillBook) scale that character's own skills[i] effect magnitude.
// Kept data-driven so ui.js can render all 6 rows generically instead of
// hardcoding each stat's label/lookup/book type.
const STAT_LINE_MAX = 100;
const GENERAL_STAT_LINES = [
  { key: 'atk', label: '攻擊力', bookId: 'statBook' },
  { key: 'def', label: '防禦力', bookId: 'statBook' },
  { key: 'speed', label: '攻速', bookId: 'statBook' }, // maxed: this character's atkInterval is halved
];
const SHOP_IDLE_MS = 10000;
const SHOP_MONSTER_CRYSTAL_SELL_PRICE = 5;
const SHOP_ITEMS = [
  { itemId: 'potion', price: 12 },
  { itemId: 'speedPotion', price: 18 },
];

// Shared character-card status catalogue. Each entry only declares how to
// identify and display a status; ui.js renders every active entry through one
// generic status row instead of maintaining status-specific DOM elements.
// img points at assets/effect_icon/<img>.png; ui.js falls back to the emoji
// if the file is missing, same onerror pattern as everywhere else.
const STATUS_DEFS = [
  { id: 'sleep', icon: '💤', img: 'sleep', label: '睡眠', tone: 'bad', desc: '下一次行動會用來醒來，該次行動被跳過', blocksCharacterAction: true, isActive: c => c.sleepUntilAction },
  { id: 'charm', icon: '💕', img: 'charming', label: '魅惑', tone: 'bad', desc: '下一次行動會改為攻擊友軍（沒有友軍時攻擊自己）', blocksCharacterAction: true, isActive: c => c.charmedUntilAction },
  { id: 'slow', icon: '🐌', img: 'speed_down', label: '降攻速', tone: 'bad', desc: '攻速倒數條累積速度變慢', isActive: c => c.slowUntil > 0, remaining: c => c.slowUntil },
  { id: 'haste', icon: '⏱️', img: 'speed_up', label: '加速', tone: 'good', desc: '攻速倒數條累積速度變快', isActive: c => c.hasteUntil > 0, remaining: c => c.hasteUntil },
  { id: 'dodge', icon: '👤', img: 'hide', label: '隱身', tone: 'good', desc: '持續期間閃避敵方所有攻擊', isActive: c => c.dodgeUntil > 0, remaining: c => c.dodgeUntil },
  { id: 'defenseUp', icon: '🔷', img: 'def_up', label: '防禦提升', tone: 'good', desc: '隊伍防禦力提升，減少受到的傷害', isActive: () => partyDefense.until > 0, remaining: () => partyDefense.until },
];

// Keys and asset basenames use stable character ids, never job-class names -
// 無名 in particular has no fixed class ("無職").
const CHAR_DEFS = {
  wuming: {
    name: '無名', icon: '🥷', img: 'wuming', rarity: 'common',
    unlock: { type: 'free' }, // starting character, always available
    baseHp: 32, baseAtk: 7, baseDef: 1,
    atkInterval: 1800, // middle of the pack pace - generalist, not a speedster
    action: {
      name: '臨機應變', icon: '≫', img: 'wuming_action', cooldown: 18,
      type: 'randomSkill', desc: '隨機立即施放自身 3 個技能之一；被抽中的技能會正常進入冷卻。',
    },
    skills: [
      { name: '重擊', icon: '💢', img: 'wuming_skill1', cd: 4,  type: 'damage',    mult: 2.3, desc: '造成 2.3 倍攻擊力傷害' },
      { name: '小回復', icon: '💧', img: 'wuming_skill2', cd: 8,  type: 'healSelf', pct: 0.15, desc: '恢復自身 15% 最大生命值' },
      { name: '加速', icon: '⏱️', img: 'wuming_skill3', cd: 10, type: 'hasteSelf', mult: 0.6, duration: 5, desc: '接下來 5 秒內攻速提升 40%' },
    ],
  },
  xiaochu: {
    name: '小初', icon: '🗡️', img: 'xiaochu', rarity: 'rare',
    // 靈魂：年輕劍士，活潑開朗 - 見 design.md「契約角色與解鎖」。單階段
    // 達到隱藏條件後直接播放契約短篇，對話結束即締約解鎖。
    unlock: {
      type: 'resonanceContract',
      trigger: { type: 'killCount', monster: 'slime', count: 50 },
      contractDialogue: 'xiaochu_contract',
    },
    baseHp: 40, baseAtk: 6, baseDef: 3,
    atkInterval: 2200, // ms between this character's own actions - their "attack speed"
    action: {
      name: '全力以赴', icon: '🔥', img: 'xiaochu_action', cooldown: 16,
      type: 'selfBuffAtkDef', atkPct: 0.15, defAmount: 2, duration: 6,
      desc: '同時提升攻擊力 15% 與防禦力 2 點，持續 6 秒',
    },
    skills: [
      { name: '重擊',   icon: '💥', img: 'xiaochu_skill1', cd: 4,  type: 'damage',      mult: 2.0, desc: '造成 2 倍攻擊力傷害' },
      { name: '防禦姿態', icon: '🛡️', img: 'xiaochu_skill2', cd: 8,  type: 'buffDefParty', amount: 3, duration: 6, desc: '隊伍防禦提升 3 點，持續 6 秒' },
      { name: '力量增幅', icon: '💪', img: 'xiaochu_skill3', cd: 12, type: 'buffAtk',     pct: 0.25, duration: 5, desc: '隊伍攻擊力提升 25%，持續 5 秒' },
    ],
  },
  fengzi: {
    name: '豐子', icon: '🔮', img: 'fengzi', rarity: 'rare',
    unlock: { type: 'potionCount', count: 10 },
    baseHp: 26, baseAtk: 8, baseDef: 0,
    atkInterval: 1600, // faster pace than xiaochu - matches its already-lower skill CDs
    skills: [
      { name: '冰凍術',   icon: '❄️', img: 'fengzi_skill1', cd: 3,  type: 'damage',     mult: 1.8, desc: '造成 1.8 倍攻擊力傷害' },
      { name: '治癒術',   icon: '✨', img: 'fengzi_skill2', cd: 7,  type: 'healAlly',   pct: 0.3,  desc: '治療隊伍中生命比例最低者 30% 最大生命值' },
      { name: '魔法護盾', icon: '🔷', img: 'fengzi_skill3', cd: 10, type: 'buffDefParty', amount: 3, duration: 6, desc: '隊伍防禦提升 3 點，持續 6 秒' },
    ],
  },
};

// Character appearance is deliberately separate from character stats.  New
// skins only need an entry here and matching image files; combat balance and
// unlock data stay on CHAR_DEFS.
const SKIN_DEFS = {
  wuming_default: { characterId: 'wuming', name: '原始外觀', portrait: 'wuming', fullArt: 'wuming_full' },
  xiaochu_default: { characterId: 'xiaochu', name: '原始外觀', portrait: 'xiaochu', fullArt: 'xiaochu_full' },
  fengzi_default: { characterId: 'fengzi', name: '原始外觀', portrait: 'fengzi', fullArt: 'fengzi_full' },
};

const DEFAULT_SKIN_BY_CHARACTER = {
  wuming: 'wuming_default',
  xiaochu: 'xiaochu_default',
  fengzi: 'fengzi_default',
};

const MAX_PARTY = 3; // full squad size the data model supports, for future multiplayer
const SOLO_PARTY_LIMIT = 1; // until multiplayer ships, only one character goes on an expedition at a time
// The old design had one global tick where everyone acted in lockstep, which
// made per-character "attack speed" meaningless. Now each character/monster
// counts down its own actionCountdown (ms) independently, and this fast
// master loop just advances all of those clocks + drives the visible bars.
const MASTER_TICK_MS = 100;
const MOB_ATK_INTERVAL = 2200;
const BOSS_ATK_INTERVAL = 2200;
const MONSTER_DEATH_REMOVE_MS = 1100;
const MAX_IMPLEMENTED_FLOOR = 1; // raise this when floor 2 content is ready
// design.md「區域推進」：floor numbers stay the internal progression unit,
// but are framed to the player as named regions - floor 1 is 森林, the
// forest just outside the village. Add an entry here when floor 2+ ships;
// regionName() falls back to the raw floor number for anything not yet named.
const REGION_DEFS = {
  1: {
    name: '史萊姆叢林',
    description: '史萊姆棲息的近郊叢林',
    image: 'slime_forest',
    recommendedLevel: 1,
    threats: ['緩速', '睡眠', '魅惑'],
    drops: ['魔物結晶', '能力書', '技能書'],
    boss: '史萊姆王',
  },
};
function regionDef(f) { return REGION_DEFS[f] || { name: `樓層 ${f}`, description: '未知區域', image: '', recommendedLevel: 1, threats: ['未知'], drops: ['未知'], boss: '未知' }; }
function regionName(f) { return regionDef(f).name; }
const MOBS_PER_FLOOR = 2;   // clear this many mob WAVES (each wave = 2~3 mobs) before the boss shows up
// mob XP share got cut from 0.25 to 0.1 when mobs went from 1-at-a-time to
// 2~3-at-a-time - otherwise a floor's total mob XP would balloon to roughly
// double-triple what it used to be, on top of the same boss share.
const MOB_XP_SHARE = 0.1;   // of xpPoolForFloor(), per mob kill
const BOSS_XP_SHARE = 0.5;  // of xpPoolForFloor(), on boss kill

// damage randomness: every hit (party or monster) rolls within +/-15% of its
// computed base instead of always landing the exact same number.
const DAMAGE_VARIANCE = 0.15;

// monsters' own "skill" (黏液潑濺's damage+slow) now has a real cooldown
// separate from how often they act (atkInterval) - when it's still cooling
// down they just throw a plain attack (damage only, no slow) instead.
const MOB_SKILL_CD = 4;   // seconds
const BOSS_SKILL_CD = 5;  // seconds
const BOSS_SUMMON_CD_MS = 10000;
const BOSS_SUMMON_OPENING_MS = 3000;
const BOSS_SUMMON_MAX = 2;

// Boss-only 黏液陣: clear the whole batch before it matures to earn damage;
// one missed blob fails the batch and applies the party-wide ATK debuff.
const GOO_LIFESPAN_MS = 4400;
const GOO_SKILL_CD_MS = 7000;
const GOO_BATCH_SIZE = 3;
const GOO_DEBUFF_PER_STACK = 0.1;
const GOO_DEBUFF_CAP = 0.5;
const GOO_PULSE_MS = 1000;        // must match the gooPulse CSS animation duration
const GOO_PERFECT_WINDOW_MS = 200; // +/- tolerance around the pulse's peak size
const GOO_PERFECT_MULT = 2;        // damage multiplier on a perfect-timed pop

// monsters' "黏液潑濺" attack slows whoever it hits, on top of its normal damage
const MONSTER_SLOW_MULT = 1.5; // action countdown recharges 50% slower while active
const MONSTER_SLOW_MS = 4000;
