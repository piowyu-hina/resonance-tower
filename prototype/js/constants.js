import { t } from './i18n.js';

// Display-only tiers mirroring each character's unlock difficulty (see each
// CHAR_DEFS entry's `rarity`) - purely cosmetic, does NOT affect stats. Keeping
// power gated by level+skill points only (see design.md: 不做裝備／武器系統).
export const RARITY_DEFS = {
  common: { label: '普通', color: '#9aa0a8' },
  rare:   { label: '稀有', color: '#5a8fd6', revealEffect: 'rare_magic_circle' },
  epic:   { label: '史詩', color: '#c979e8' },
  unique: { label: '獨特', color: '#e08a3c' },
};

// Development-only controls and exact unlock requirements are available with
// ?debug in the URL. Normal play keeps hidden conditions and destructive reset
// controls out of the main interface.
export const DEBUG_MODE = new URLSearchParams(window.location.search).has('debug');

// Floor-1 monster catalogue. Skills describe targets + composable effects;
// combat.js interprets those declarations without branching on monster names.
// New variants can therefore be added here without rewriting the turn loop.
export const MONSTER_DEFS = {
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

export const FLOOR1_MOB_POOL = Object.keys(MONSTER_DEFS);

export const RUINS_MONSTER_DEFS = {
  ruinsRelics: {
    name: '遺跡史萊姆', img: 'floor1/slime_relics', atk: 2,
    skill: {
      name: '古碑墜擊', icon: '◇', img: 'floor1/slime_relics_skill', cd: 6,
      target: 'randomParty', effects: [{ type: 'damage', mult: 1.3 }],
      desc: '喚起遺跡碎片墜向目標，造成 1.3 倍攻擊力傷害',
    },
  },
  ruinsRock: {
    name: '石頭史萊姆', img: 'floor1/slime_rock', atk: 2,
    skill: {
      name: '碎岩衝擊', icon: '◆', img: 'floor1/slime_rock_skill', cd: 8,
      target: 'randomParty', effects: [{ type: 'damage', mult: 2 }],
      desc: '捲起岩塊重擊目標，造成 2 倍攻擊力傷害',
    },
  },
  ruinsDust: {
    name: '塵埃史萊姆', img: 'floor1/slime_tornado', atk: 1,
    skill: {
      name: '塵沙旋風', icon: '◌', img: 'floor1/slime_tornado_skill', cd: 7,
      target: 'randomParty', effects: [{ type: 'damage', mult: 1 }, { type: 'slow', mult: 1.5, duration: 4 }],
      desc: '捲起塵沙造成傷害，並使目標攻速降低 4 秒',
    },
  },
};
export const RUINS_MOB_POOL = Object.keys(RUINS_MONSTER_DEFS);
export const RUINS_KILL_TARGET = 10;

// Inventory definitions are display/data only for now. The first backpack
// pass deliberately has no consume/drop/shop behavior attached yet.
export const ITEM_DEFS = {
  coin: {
    name: '金幣',
    img: 'coin',
    rarity: '普通',
    category: 'currency',
    equipSlot: null,
    maxStack: Number.MAX_SAFE_INTEGER,
    desc: '村莊與商店通用的貨幣。',
  },
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
export function localizedItemDef(itemId) {
  const item = ITEM_DEFS[itemId];
  if (!item) return item;
  return {
    ...item,
    name: t(`item.${itemId}.name`),
    desc: t(`item.${itemId}.desc`),
    rarity: item.rarity === '普通' ? t('rarity.common') : item.rarity,
  };
}
export const INVENTORY_SLOT_COUNT = 16;
export const SLIME_MONSTER_CRYSTAL_DROP_CHANCE = 0.35;
export const SLIME_STAT_BOOK_DROP_CHANCE = 0.15;
export const SLIME_SKILL_BOOK_DROP_CHANCE = 0.15;

// Per-character stat/skill "lines" unlocked by spending 能力書／技能書 (see
// design.md 經驗書／技能點強化 section). Each line goes 0~STAT_LINE_MAX; at
// max its scale factor is 2x the unleveled value. General lines (bookId:
// statBook) apply to atk/def/attack speed; skill lines (skill0/skill1/skill2,
// always skillBook) scale that character's own skills[i] effect magnitude.
// Kept data-driven so ui.js can render all 6 rows generically instead of
// hardcoding each stat's label/lookup/book type.
export const STAT_LINE_MAX = 100;
export const GENERAL_STAT_LINES = [
  { key: 'atk', label: '攻擊力', bookId: 'statBook' },
  { key: 'def', label: '防禦力', bookId: 'statBook' },
  { key: 'speed', label: '攻速', bookId: 'statBook' }, // maxed: this character's atkInterval is halved
];
export const SHOP_IDLE_MS = 10000;
export const EVENT_IDLE_MS = 15000;
export const SHOP_MONSTER_CRYSTAL_SELL_PRICE = 5;
export const SHOP_ITEMS = [
  { itemId: 'potion', price: 12 },
  { itemId: 'speedPotion', price: 18 },
];

// (STATUS_DEFS moved to state.js - its 'defenseUp' entry needs to read
// gameState.partyDefense, and keeping it there avoids a real circular-import
// evaluation-order hazard: state.js's own top-level `gameState` object
// literal needs several constants.js exports already initialized, so
// constants.js must never depend on state.js at its own module top level.)

// Keep the legacy wuming character ID for save compatibility; Lixue uses
// lixue asset basenames and still has no fixed class ("無職").
export const CHAR_DEFS = {
  wuming: {
    name: '璃雪', icon: '🥷', img: 'lixue', rarity: 'common',
    unlock: { type: 'free' }, // starting character, always available
    baseHp: 32, baseAtk: 7, baseDef: 1,
    atkInterval: 1800, // middle of the pack pace - generalist, not a speedster
    action: {
      name: '我還能撐住', icon: '💚', img: 'lixue_action', cooldown: 18,
      type: 'healAndResolve', pct: 0.15, reduction: 0.3, duration: 4,
      desc: '恢復自身 15% 最大生命，4 秒內受到的敵方直接傷害減少 30%；不含反傷與事件傷害，不會復活或免死',
    },
    skills: [
      { name: '試探刺擊', icon: '🗡️', img: 'lixue_skill1', cd: 4, type: 'damage', mult: 2, desc: '向前刺擊，造成 2 倍攻擊力的單體傷害' },
      { name: '穩住腳步', icon: '💨', img: 'lixue_skill2', cd: 8, type: 'evasionSelf', chance: 0.5, duration: 4, desc: '4 秒內有 50% 機率閃避敵方普攻與一般技能；成功後獲得 10 秒破綻就緒，不疊加。遺跡之主攻擊及首領場地機制不適用' },
      { name: '抓到空隙了！', icon: '🗡️', img: 'lixue_skill3', cd: 10, type: 'openingStrike', mult: 2, openingMult: 3.2, desc: '造成 2 倍攻擊力傷害；消耗破綻就緒時提升為 3.2 倍，就緒且冷卻完成時優先施放' },
    ],
  },
  xiaochu: {
    name: '小初', icon: '🗡️', img: 'xiaochu', rarity: 'rare',
    // 靈魂：年輕劍士，活潑開朗 - 見 design.md「契約角色與解鎖」。單階段
    // 達到隱藏條件後直接播放契約短篇，對話結束即締約解鎖。
    unlock: {
      type: 'resonanceContract',
      trigger: { type: 'agentKillCount', count: 50 },
      encounterDialogue: 'xiaochu_encounter',
    },
    baseHp: 40, baseAtk: 6, baseDef: 3,
    atkInterval: 2200, // ms between this character's own actions - their "attack speed"
    action: {
      name: '全力以赴', icon: '🔥', img: 'xiaochu_action', cooldown: 16,
      type: 'guardAndSlash', reduction: 0.6, slashPct: 0.5, duration: 8,
      desc: '立即獲得一次 60% 減傷格擋，並使下一次斬擊傷害提升 50%；效果持續 8 秒，不疊加次數',
    },
    skills: [
      { name: '踏步斬', icon: '⚔️', img: 'xiaochu_skill1', cd: 4, type: 'damage', mult: 2, slash: true, desc: '向前斬擊，造成 2 倍攻擊力傷害' },
      { name: '我擋得住！', icon: '🛡️', img: 'xiaochu_skill2', cd: 8, type: 'guardSelf', reduction: 0.6, duration: 8, desc: '8 秒內下一次敵方直接傷害減少 60%；成功格擋後獲得 10 秒反擊就緒，不疊加次數' },
      { name: '換我了！', icon: '⚔️', img: 'xiaochu_skill3', cd: 12, type: 'counterSlash', mult: 2, counterMult: 3.5, slash: true, desc: '造成 2 倍攻擊力傷害；消耗反擊就緒時提升為 3.5 倍，且就緒後優先施放' },
    ],
  },
  fengzi: {
    name: '豐子', icon: '🔮', img: 'fengzi', rarity: 'rare',
    // Excluded from the playable roster for the demo build - stats/skills/
    // unlock condition below are all going to be reworked into a different
    // character, so there's nothing here worth exposing yet. Data kept
    // in place rather than deleted; see state.js's ROSTER_CHAR_IDS filter
    // and debug.js's unlock-all/status-count call sites, which all key off
    // this flag too.
    hidden: true,
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

// Every place that builds a roster, checks unlocks, or counts "how many
// characters exist" should use this instead of raw Object.keys(CHAR_DEFS),
// so a CHAR_DEFS entry marked `hidden` (e.g. fengzi, pending rework) never
// shows up, gets auto-unlocked, or inflates an "unlocked X/Y" count.
export const ROSTER_CHAR_IDS = Object.keys(CHAR_DEFS).filter(id => !CHAR_DEFS[id].hidden);

// Character appearance is deliberately separate from character stats.  New
// skins only need an entry here and matching image files; combat balance and
// unlock data stay on CHAR_DEFS.
export const SKIN_DEFS = {
  wuming_default: { characterId: 'wuming', name: '初始外觀', portrait: 'lixue', fullArt: 'lixue_full', preview: 'lixue_full' },
  xiaochu_default: { characterId: 'xiaochu', name: '原始外觀', portrait: 'xiaochu', battlePortrait: 'xiaochu', fullArt: 'xiaochu_full' },
  fengzi_default: { characterId: 'fengzi', name: '原始外觀', portrait: 'fengzi', fullArt: 'fengzi_full' },
};

export const DEFAULT_SKIN_BY_CHARACTER = {
  wuming: 'wuming_default',
  xiaochu: 'xiaochu_default',
  fengzi: 'fengzi_default',
};

export const MAX_PARTY = 3; // full squad size the data model supports, for future multiplayer
export const SOLO_PARTY_LIMIT = 1; // until multiplayer ships, only one character goes on an expedition at a time
// The old design had one global tick where everyone acted in lockstep, which
// made per-character "attack speed" meaningless. Now each character/monster
// counts down its own actionCountdown (ms) independently, and this fast
// master loop just advances all of those clocks + drives the visible bars.
export const MASTER_TICK_MS = 100;
export const DEFEAT_RESTART_DELAY_MS = 10000;
export const MOB_ATK_INTERVAL = 2200;
export const BOSS_ATK_INTERVAL = 2200;
export const BOSS_ENTRY_GRACE_MS = 900;
export const BOSS_INTRO_DURATION_MS = 5600;
export const MONSTER_DEATH_ANIMATION_MS = 1100;
export const MAX_IMPLEMENTED_FLOOR = 1; // raise this when floor 2 content is ready
// design.md「區域推進」：floor numbers stay the internal progression unit,
// but are framed to the player as named regions - floor 1 is 森林, the
// forest just outside the village. Add an entry here when floor 2+ ships;
// regionName() falls back to the raw floor number for anything not yet named.
export const REGION_DEFS = {
  1: {
    localeKey: 'region.slimeForest',
    name: '史萊姆棲息地',
    description: '史萊姆棲息的近郊叢林',
    image: 'slime_forest',
    previewImage: 'slime-forest-colony',
    recommendedLevel: 1,
    threats: ['緩速', '睡眠', '魅惑'],
    threatLocaleIds: ['slow', 'sleep', 'charm'],
    drops: ['魔物結晶', '能力書', '技能書'],
    dropLocaleIds: ['crystal', 'statBook', 'skillBook'],
    boss: '史萊姆王',
    bossLocaleKey: 'monster.slimeBoss',
  },
};
export function regionDef(f) { return REGION_DEFS[f] || { name: `樓層 ${f}`, description: '未知區域', image: '', recommendedLevel: 1, threats: ['未知'], drops: ['未知'], boss: '未知' }; }
export function localizedRegionDef(f) {
  const region = regionDef(f);
  if (!region.localeKey) return region;
  return {
    ...region,
    name: t(`${region.localeKey}.name`),
    description: t(`${region.localeKey}.description`),
    threats: region.threatLocaleIds.map(id => t(`${region.localeKey}.threat.${id}`)),
    drops: region.dropLocaleIds.map(id => t(`${region.localeKey}.drop.${id}`)),
    boss: t(region.bossLocaleKey),
  };
}
export function regionName(f) { return localizedRegionDef(f).name; }
export const MOBS_PER_FLOOR = 2;   // clear this many mob WAVES (each wave = 2~3 mobs) before the boss shows up
// mob XP share got cut from 0.25 to 0.1 when mobs went from 1-at-a-time to
// 2~3-at-a-time - otherwise a floor's total mob XP would balloon to roughly
// double-triple what it used to be, on top of the same boss share.
export const MOB_XP_SHARE = 0.1;   // of xpPoolForFloor(), per mob kill
export const BOSS_XP_SHARE = 0.5;  // of xpPoolForFloor(), on boss kill

// damage randomness: every hit (party or monster) rolls within +/-15% of its
// computed base instead of always landing the exact same number.
export const DAMAGE_VARIANCE = 0.15;

// monsters' own "skill" (黏液潑濺's damage+slow) now has a real cooldown
// separate from how often they act (atkInterval) - when it's still cooling
// down they just throw a plain attack (damage only, no slow) instead.
export const MOB_SKILL_CD = 4;   // seconds
export const BOSS_SKILL_CD = 5;  // seconds
export const BOSS_SUMMON_CD_MS = 10000;
export const BOSS_SUMMON_OPENING_MS = 3000;
export const BOSS_SUMMON_MAX = 2;

// Before the goddess appoints Wuming as her agent, ordinary human growth
// stops here. The cap is lifted once chapter 1 advances past the ruins.
export const PRE_AGENT_LEVEL_CAP = 10;

// The Ruins Master is a real level-100 enemy even though its level remains
// concealed as "XXX" in the UI during the first encounter.
export const RUINS_LORD_LEVEL = 100;
export const RUINS_LORD_SPIKE_COUNT = 4;
export const RUINS_LORD_SPIKE_TRAVEL_MS = 5000;

// Boss-only 黏液陣: clear the whole batch before it matures to earn damage;
// one missed blob fails the batch and applies the party-wide ATK debuff.
export const GOO_LIFESPAN_MS = 4400;
export const GOO_SKILL_CD_MS = 7000;
export const GOO_BATCH_SIZE = 3;
export const GOO_DEBUFF_PER_STACK = 0.1;
export const GOO_DEBUFF_CAP = 0.5;
export const GOO_PULSE_MS = 1000;        // must match the gooPulse CSS animation duration
export const GOO_PERFECT_WINDOW_MS = 200; // +/- tolerance around the pulse's peak size
export const GOO_PERFECT_MULT = 2;        // damage multiplier on a perfect-timed pop

// monsters' "黏液潑濺" attack slows whoever it hits, on top of its normal damage
export const MONSTER_SLOW_MULT = 1.5; // action countdown recharges 50% slower while active
export const MONSTER_SLOW_MS = 4000;
