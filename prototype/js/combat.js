import {
  FLOOR1_MOB_POOL, MONSTER_DEFS, MOB_ATK_INTERVAL, BOSS_ATK_INTERVAL, BOSS_ENTRY_GRACE_MS,
  BOSS_SKILL_CD, MONSTER_SLOW_MULT, MONSTER_SLOW_MS, BOSS_SUMMON_OPENING_MS, BOSS_SUMMON_CD_MS,
  BOSS_SUMMON_MAX, GOO_SKILL_CD_MS, GOO_BATCH_SIZE, MOBS_PER_FLOOR, CHAR_DEFS, MAX_IMPLEMENTED_FLOOR,
  BOSS_XP_SHARE, MOB_XP_SHARE, SLIME_MONSTER_CRYSTAL_DROP_CHANCE, SLIME_STAT_BOOK_DROP_CHANCE,
  SLIME_SKILL_BOOK_DROP_CHANCE, MASTER_TICK_MS, SHOP_IDLE_MS, regionName, MONSTER_DEATH_ANIMATION_MS,
  RUINS_MONSTER_DEFS, RUINS_MOB_POOL, RUINS_KILL_TARGET, RUINS_LORD_LEVEL,
  RUINS_LORD_SPIKE_COUNT, RUINS_LORD_SPIKE_TRAVEL_MS,
} from './constants.js';
import {
  gameState, PHASES, STATUS_DEFS, setPhase, log, aliveMonsters, activeAliveMembers, calcDef, calcAtk,
  rollDamage, skillLineScale, lineScale, speedLineIntervalMult, actionLineCooldownMult, addXp,
  goldForKill, xpPoolForFloor, checkThresholdUnlocks, checkResonanceTriggers, isCharUnlocked,
  startPendingVillageContracts,
  CHAPTER1_STATES, setChapter1State,
} from './state.js';
import { OVERLAY_CLOSERS, closeOtherOverlays, overlayUiState } from './ui-overlays.js';
import { emitCombatEvent } from './combat-events.js';
import { clearGooArena, gooTick } from './goo.js';
import { tickShopIdle, addInventoryItem } from './shop.js';
import { startCharacterEncounter, startChapter1DefeatSequence, tryXiaochuTravelStory } from './story.js';
import { startRandomEvent, tickEventIdle } from './events.js';

// This file only mutates game state and queues one-shot effects via
// emitCombatEvent() (combat-events.js) - it never touches the DOM, calls
// popup/flash/showSkillCastEffect, or calls render() itself. Callers (click
// handlers in ui-*.js, and the ambient tick loop in main.js) call
// flushCombat() (ui-combat-effects.js) afterward to play queued effects and
// re-render. This keeps combat logic testable headless - see
// tests/combat-events.test.js.
export function enterPrepFloor() {
  setPhase(PHASES.PREP_FLOOR);
  overlayUiState.prepLocation = 'village';
  // retreating out of prepBoss leaves its auto-opened shop overlay active
  // otherwise - close whatever's open on this clean state transition.
  if (gameState.activeOverlay) OVERLAY_CLOSERS[gameState.activeOverlay]();
}
export function enterPrepBoss() {
  setPhase(PHASES.PREP_BOSS);
  closeOtherOverlays('shop');
  gameState.activeOverlay = 'shop';
  gameState.shopMode = 'dungeon';
  gameState.shopAutoLeave = true;
  gameState.shopCountdown = SHOP_IDLE_MS;
}

export function resetBossEntryCooldowns() {
  gameState.party.forEach(id => {
    const character = gameState.roster.find(member => member.id === id);
    if (!character) return;
    character.skillCds = character.skillCds.map(() => 0);
    character.manualActionCd = 0;
  });
  gameState.combatItemCooldowns = {};
}

// mob-wave stat baselines got roughly halved from their old single-mob values
// because 2~3 of them now hit the party simultaneously - still a rough first
// pass (see design.md "平衡尚待調整"), tune freely later.
export function makeMob(defId = FLOOR1_MOB_POOL[Math.floor(Math.random() * FLOOR1_MOB_POOL.length)]) {
  const def = MONSTER_DEFS[defId] || RUINS_MONSTER_DEFS[defId];
  const maxHp = 9 + Math.round(gameState.floor * 6);
  return {
    id: 'm' + (gameState.monsterIdCounter++),
    defId,
    name: def.name,
    level: gameState.floor,
    isBoss: false,
    img: def.img,
    maxHp,
    hp: maxHp,
    atk: (def.atk ?? 1) + Math.floor(gameState.floor * 0.7),
    atkInterval: MOB_ATK_INTERVAL,
    actionCountdown: MOB_ATK_INTERVAL,
    alive: true,
    isSummoned: false,
    skillCd: 0,
    skill: def.skill,
  };
}

export function makeBoss() {
  return {
    id: 'm' + (gameState.monsterIdCounter++),
    name: '史萊姆王',
    level: gameState.floor,
    isBoss: true,
    img: 'floor1/slime_boss',
    maxHp: 60 + gameState.floor * 40,
    hp: 60 + gameState.floor * 40,
    atk: 6 + Math.floor(gameState.floor * 3),
    atkInterval: BOSS_ATK_INTERVAL,
    // Separate the first real hit from the end of the intro. Without this
    // short grace period, its red damage flash reads like a transition glitch.
    actionCountdown: BOSS_ATK_INTERVAL + BOSS_ENTRY_GRACE_MS,
    alive: true,
    skillCd: 0, // ms remaining until 黏液潑濺 (the slow-on-hit version) is off cooldown again
    skill: {
      name: '黏液潑濺', icon: '💧', img: 'floor1/slime_boss_skill1', cd: BOSS_SKILL_CD,
      target: 'randomParty',
      effects: [
        { type: 'damage', mult: 1 },
        { type: 'slow', mult: MONSTER_SLOW_MULT, duration: MONSTER_SLOW_MS / 1000 },
      ],
      desc: '造成傷害並降低攻速 4 秒',
    },
    skill2Cd: BOSS_SUMMON_OPENING_MS,
    skill2: { name: '召喚黏液', icon: '🟢', img: 'floor1/slime_boss_skill2', cd: BOSS_SUMMON_CD_MS / 1000, desc: `召喚 1 隻隨機史萊姆，場上最多 ${BOSS_SUMMON_MAX} 隻召喚物` },
    skill3: { name: '黏液陣', icon: '🔵', img: 'floor1/slime_boss_skill3', cd: GOO_SKILL_CD_MS / 1000, desc: `一次召喚 ${GOO_BATCH_SIZE} 顆黏液，限時全部點完才造成傷害；漏掉任一顆會讓隊伍沾黏、攻擊力下降` },
  };
}

// each floor is 2 mob waves (MOBS_PER_FLOOR) of 2~3 simultaneous mobs each,
// then a single boss wave. Scope note: a future "kill 10 mobs -> event, kill
// 100 -> boss" flow (see design.md) needs the event system designed first -
// this stays the simpler wave-based gate until then.
export function spawnWave() {
  clearGooArena();
  gameState.gooDebuffStacks = 0;
  gameState.monsters = [];
  if (gameState.expeditionMode === 'ruins') {
    const remaining = Math.max(0, RUINS_KILL_TARGET - gameState.ruinsKillCount);
    const count = Math.min(remaining, 2 + Math.floor(Math.random() * 2));
    for (let i = 0; i < count; i++) {
      const defId = RUINS_MOB_POOL[Math.floor(Math.random() * RUINS_MOB_POOL.length)];
      gameState.monsters.push(makeMob(defId));
    }
  } else if (gameState.mobsCleared < MOBS_PER_FLOOR) {
    const count = 2 + Math.floor(Math.random() * 2); // 2~3 mobs
    for (let i = 0; i < count; i++) gameState.monsters.push(makeMob());
  } else {
    gameState.monsters.push(makeBoss());
    gameState.gooSpawnCountdown = 800; // faster opening spawn than the steady-state cooldown, so the fight doesn't feel dead at the start
  }
  emitCombatEvent({ type: 'waveSpawned' });
}

export function beginRuinsExpedition() {
  gameState.expeditionMode = 'ruins';
  gameState.ruinsKillCount = 0;
  gameState.mobsCleared = 0;
  setChapter1State(CHAPTER1_STATES.RUINS);
  log('進入遺跡之地。', 'warn');
  emitCombatEvent({ type: 'combatActionsChanged' });
  spawnWave();
}

function makeRuinsLord() {
  return {
    id: 'm' + (gameState.monsterIdCounter++), name: '遺跡之主', level: RUINS_LORD_LEVEL,
    displayLevel: 'XXX', isBoss: true, storyBoss: true, img: 'floor1/relics_master',
    maxHp: 12000, hp: 12000, atk: 300, atkInterval: 2400, actionCountdown: 700,
    alive: true,
    skillCd: 0,
    skill: {
      name: '重擊', icon: '✦', img: 'floor1/relics_master_skill1', cd: 4,
      target: 'randomParty', effects: [{ type: 'damage', mult: 2.2 }],
      desc: '以沉重的一擊攻擊單一目標，造成 2.2 倍攻擊力傷害',
    },
    skill2Cd: 0,
    skill2: {
      name: '反傷盾', icon: '◇', img: 'floor1/relics_master_skill2', cd: 8,
      duration: 5, reflectPct: 0.5,
      desc: '展開 5 秒反傷盾，將受到傷害的 50% 反射給攻擊者',
    },
    skill3Cd: 0,
    skill3: {
      name: '岩刺突襲', icon: '◆', img: 'floor1/relics_master_skill3', cd: 7,
      count: RUINS_LORD_SPIKE_COUNT, mult: 1,
      desc: `從戰場右側射出 ${RUINS_LORD_SPIKE_COUNT} 枚岩刺；每枚命中約造成 300 點傷害（受防禦與傷害浮動影響）`,
    },
    skillOrder: ['skill3', 'skill', 'skill2'],
    skillCursor: 0,
    reflectShieldMs: 0,
    pendingSpikeMs: 0,
    pendingSpikes: [],
    spikeWaveCounter: 0,
    defeatTriggered: false,
  };
}

export function spawnRuinsLord() {
  clearGooArena();
  gameState.gooDebuffStacks = 0;
  gameState.monsters = [makeRuinsLord()];
  emitCombatEvent({ type: 'combatActionsChanged' });
  emitCombatEvent({ type: 'waveSpawned' });
}

export function activateRuinsLordEncounter() {
  setPhase(PHASES.COMBAT);
}

function triggerRuinsLordDefeat(boss) {
  if (!boss.storyBoss || boss.defeatTriggered || activeAliveMembers().length > 0) return;
  boss.defeatTriggered = true;
  setChapter1State(CHAPTER1_STATES.GODDESS);
  // Leave the combat surface visible just long enough for the actual damage
  // number to finish playing before the mandatory dialogue covers it.
  setTimeout(() => startChapter1DefeatSequence(), 950);
}

function applyRuinsLordReflection(boss, attacker, incomingDamage) {
  if (!boss.storyBoss || boss.reflectShieldMs <= 0 || !attacker.alive) return;
  const reflected = Math.max(1, Math.round(incomingDamage * boss.skill2.reflectPct));
  attacker.curHp -= reflected;
  log(`${boss.name} 的【${boss.skill2.name}】反射 ${reflected} 傷害給 ${CHAR_DEFS[attacker.id].name}`, 'enemy');
  emitCombatEvent({ type: 'ruinsShieldPulse', bossId: boss.id });
  emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: attacker.id, text: '-' + reflected, cls: 'dmg' });
  emitCombatEvent({ type: 'flash', targetKind: 'char', targetId: attacker.id });
  if (attacker.curHp <= 0) {
    attacker.curHp = 0;
    attacker.alive = false;
    log(`${CHAR_DEFS[attacker.id].name} 倒下了！`, 'warn');
    triggerRuinsLordDefeat(boss);
  }
}

function damageCharacterFromRuinsLord(boss, target, damage, label) {
  const dmg = rollDamage(Math.max(1, damage - calcDef(target)));
  target.curHp -= dmg;
  log(`${boss.name} 使用【${label}】攻擊 ${CHAR_DEFS[target.id].name}，造成 ${dmg} 傷害`, 'enemy');
  emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: target.id, text: '-' + dmg, cls: 'dmg' });
  emitCombatEvent({ type: 'flash', targetKind: 'char', targetId: target.id });
  if (target.curHp <= 0) {
    target.curHp = 0;
    target.alive = false;
    log(`${CHAR_DEFS[target.id].name} 倒下了！`, 'warn');
  }
  return dmg;
}

function castRuinsLordShield(boss) {
  boss.skill2Cd = boss.skill2.cd * 1000;
  boss.reflectShieldMs = boss.skill2.duration * 1000;
  log(`${boss.name} 使用【${boss.skill2.name}】`, 'enemy');
  emitCombatEvent({ type: 'skillCast', targetKind: 'monster', targetId: boss.id, skill: boss.skill2 });
  emitCombatEvent({ type: 'ruinsShieldChanged', bossId: boss.id, active: true });
}

function castRuinsLordSpikes(boss) {
  boss.skill3Cd = boss.skill3.cd * 1000;
  boss.pendingSpikeMs = RUINS_LORD_SPIKE_TRAVEL_MS;
  boss.spikeWaveCounter++;
  boss.pendingSpikes = Array.from({ length: boss.skill3.count }, (_, index) => ({
    id: `${boss.id}-spike-${boss.spikeWaveCounter}-${index}`,
    active: true,
  }));
  log(`${boss.name} 使用【${boss.skill3.name}】，岩刺從戰場右側襲來！`, 'enemy');
  emitCombatEvent({ type: 'skillCast', targetKind: 'monster', targetId: boss.id, skill: boss.skill3 });
  emitCombatEvent({
    type: 'ruinsSpikeRush',
    bossId: boss.id,
    spikeIds: boss.pendingSpikes.map(spike => spike.id),
    travelMs: RUINS_LORD_SPIKE_TRAVEL_MS,
  });
}

function resolveRuinsLordSpikes(boss) {
  boss.pendingSpikeMs = 0;
  const remainingSpikes = boss.pendingSpikes.filter(spike => spike.active);
  boss.pendingSpikes = [];
  if (remainingSpikes.length === 0) {
    log('所有岩刺都被擊碎了！', 'party');
  } else {
    log(`${remainingSpikes.length} 枚岩刺突破了防線！`, 'enemy');
    let totalDamage = 0;
    // Every active spike reached the left edge, even if the first impact is
    // already lethal. Keep that visual/mechanical count separate from the
    // number of damage applications that still had a living target.
    const hitCount = remainingSpikes.length;
    remainingSpikes.forEach(() => {
      const targets = activeAliveMembers();
      if (targets.length === 0) return;
      const target = targets[Math.floor(Math.random() * targets.length)];
      totalDamage += damageCharacterFromRuinsLord(boss, target, boss.atk * boss.skill3.mult, boss.skill3.name);
    });
    emitCombatEvent({ type: 'ruinsSpikeImpact', hitCount, totalDamage });
  }
  triggerRuinsLordDefeat(boss);
}

export function tickRuinsLord(boss) {
  if (boss.defeatTriggered) return;
  boss.skillCd = Math.max(0, boss.skillCd - MASTER_TICK_MS);
  boss.skill2Cd = Math.max(0, boss.skill2Cd - MASTER_TICK_MS);
  boss.skill3Cd = Math.max(0, boss.skill3Cd - MASTER_TICK_MS);

  if (boss.reflectShieldMs > 0) {
    boss.reflectShieldMs = Math.max(0, boss.reflectShieldMs - MASTER_TICK_MS);
    if (boss.reflectShieldMs === 0) {
      log(`${boss.name} 的反傷盾消失了`);
      emitCombatEvent({ type: 'ruinsShieldChanged', bossId: boss.id, active: false });
    }
  }
  if (boss.pendingSpikeMs > 0) {
    boss.pendingSpikeMs -= MASTER_TICK_MS;
    if (boss.pendingSpikeMs <= 0) resolveRuinsLordSpikes(boss);
    // The incoming-spike wave is the boss's current action. Do not let a
    // heavy strike or shield overlap the player's click window.
    return;
  }

  boss.actionCountdown -= MASTER_TICK_MS;
  if (boss.actionCountdown > 0) return;
  boss.actionCountdown += boss.atkInterval;

  const ready = {
    skill: boss.skillCd <= 0,
    skill2: boss.skill2Cd <= 0 && boss.reflectShieldMs <= 0,
    skill3: boss.skill3Cd <= 0 && boss.pendingSpikeMs <= 0,
  };
  let selected = null;
  for (let offset = 0; offset < boss.skillOrder.length; offset++) {
    const index = (boss.skillCursor + offset) % boss.skillOrder.length;
    const candidate = boss.skillOrder[index];
    if (!ready[candidate]) continue;
    selected = candidate;
    boss.skillCursor = (index + 1) % boss.skillOrder.length;
    break;
  }

  if (selected === 'skill3') castRuinsLordSpikes(boss);
  else if (selected === 'skill2') castRuinsLordShield(boss);
  else if (selected === 'skill') performMonsterSkill(boss);
  else {
    const target = activeAliveMembers()[0];
    if (target) damageCharacterFromRuinsLord(boss, target, boss.atk, '普通攻擊');
  }
  triggerRuinsLordDefeat(boss);
}

// (updateMonsterSkillIcons moved to ui-combat-effects.js - pure DOM
// construction, no battle logic, so it doesn't belong here.)

export function bossSummonTick(boss) {
  boss.skill2Cd = Math.max(0, boss.skill2Cd - MASTER_TICK_MS);
  if (boss.skill2Cd > 0) return;

  const livingSummons = aliveMonsters().filter(m => m.isSummoned);
  if (livingSummons.length >= BOSS_SUMMON_MAX) return;

  boss.skill2Cd = BOSS_SUMMON_CD_MS;
  const summoned = makeMob();
  summoned.isSummoned = true;
  gameState.monsters.push(summoned);
  log(`${boss.name} 使用【${boss.skill2.name}】，召喚了 ${summoned.name}！`, 'enemy');
  emitCombatEvent({ type: 'monsterSummoned', bossId: boss.id, skill: boss.skill2 });
}

export function selectMonsterSkillTarget(skill) {
  if (skill.target === 'lowestHpMonster') {
    const injured = aliveMonsters().filter(m => m.hp < m.maxHp);
    if (injured.length === 0) return null;
    return injured.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
  }
  const alive = activeAliveMembers();
  return alive.length > 0 ? alive[Math.floor(Math.random() * alive.length)] : null;
}

// Generic interpreter for monster skill data. Returns false when a skill has
// no valid target (for example, a healer whose whole side is already full).
export function performMonsterSkill(m) {
  const skill = m.skill;
  const target = selectMonsterSkillTarget(skill);
  if (!target) return false;

  const targetsParty = skill.target === 'randomParty';
  const targetKind = targetsParty ? 'char' : 'monster';
  if (targetsParty && target.dodgeUntil > 0) {
    log(`${m.name} 使用【${skill.name}】，但被 ${CHAR_DEFS[target.id].name} 閃避了！`, 'party');
    emitCombatEvent({ type: 'popup', targetKind, targetId: target.id, text: 'MISS', cls: 'buff' });
    m.skillCd = skill.cd * 1000;
    return true;
  }

  m.skillCd = skill.cd * 1000;
  emitCombatEvent({ type: 'skillCast', targetKind, targetId: target.id, skill });

  skill.effects.forEach(effect => {
    if (effect.type === 'damage') {
      const base = Math.max(1, m.atk * effect.mult - calcDef(target));
      const dmg = rollDamage(base);
      target.curHp -= dmg;
      log(`${m.name} 使用【${skill.name}】攻擊 ${CHAR_DEFS[target.id].name}，造成 ${dmg} 傷害`, 'enemy');
      emitCombatEvent({ type: 'popup', targetKind, targetId: target.id, text: '-' + dmg, cls: 'dmg' });
      emitCombatEvent({ type: 'flash', targetKind, targetId: target.id });
    } else if (effect.type === 'slow') {
      target.slowMult = effect.mult;
      target.slowUntil = effect.duration * 1000;
      log(`${CHAR_DEFS[target.id].name} 的攻速降低`, 'enemy');
      emitCombatEvent({ type: 'popup', targetKind, targetId: target.id, text: 'SLOW', cls: 'dmg' });
    } else if (effect.type === 'sleepUntilAction') {
      target.sleepUntilAction = true;
      log(`${CHAR_DEFS[target.id].name} 睡著了，下一次行動會用來醒來`, 'enemy');
      emitCombatEvent({ type: 'popup', targetKind, targetId: target.id, text: 'SLEEP', cls: 'dmg' });
    } else if (effect.type === 'charmAttackAlly') {
      target.charmedUntilAction = true;
      log(`${CHAR_DEFS[target.id].name} 被魅惑了，下一次行動會攻擊友軍`, 'enemy');
      emitCombatEvent({ type: 'popup', targetKind, targetId: target.id, text: 'CHARM', cls: 'dmg' });
    } else if (effect.type === 'heal') {
      const heal = Math.min(target.maxHp - target.hp, Math.round(target.maxHp * effect.pct));
      target.hp += heal;
      log(`${m.name} 使用【${skill.name}】，治療 ${target.name} ${heal} 生命`, 'enemy');
      emitCombatEvent({ type: 'popup', targetKind, targetId: target.id, text: '+' + heal, cls: 'heal' });
    }
  });

  if (targetsParty && target.curHp <= 0) {
    target.curHp = 0;
    target.alive = false;
    log(`${CHAR_DEFS[target.id].name} 倒下了！`, 'warn');
  }
  return true;
}

export function performCharmedAction(c) {
  const others = activeAliveMembers().filter(member => member.id !== c.id);
  const target = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : c;
  const base = Math.max(1, calcAtk(c) - calcDef(target));
  const dmg = rollDamage(base);
  target.curHp -= dmg;
  log(`${CHAR_DEFS[c.id].name} 受到魅惑，攻擊 ${target === c ? '自己' : CHAR_DEFS[target.id].name}，造成 ${dmg} 傷害`, 'warn');
  emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: target.id, text: '-' + dmg, cls: 'dmg' });
  emitCombatEvent({ type: 'flash', targetKind: 'char', targetId: target.id });
  if (target.curHp <= 0) {
    target.curHp = 0;
    target.alive = false;
    log(`${CHAR_DEFS[target.id].name} 倒下了！`, 'warn');
  }
}

export function performSkill(c, skill, idx, target) {
  c.skillCds[idx] = skill.cd * 1000; // skill.cd is authored in seconds
  const name = CHAR_DEFS[c.id].name;
  // cast flourish plays on whoever the skill actually affects - the enemy
  // for offensive skills, the caster (or healed ally) for everything else -
  // not always on the caster like before.
  const lineScaleForThisSkill = skillLineScale(c, idx); // 1x unleveled, up to 2x maxed (see 經驗書)
  if (skill.type === 'damage') {
    const dmg = rollDamage(calcAtk(c) * skill.mult * lineScaleForThisSkill);
    target.hp -= dmg;
    log(`${name} 使用【${skill.name}】攻擊 ${target.name}，造成 ${dmg} 傷害`, 'party');
    emitCombatEvent({ type: 'skillCast', targetKind: 'monster', targetId: target.id, skill });
    emitCombatEvent({ type: 'popup', targetKind: 'monster', targetId: target.id, text: '-' + dmg, cls: 'dmg' });
    emitCombatEvent({ type: 'flash', targetKind: 'monster', targetId: target.id });
    applyRuinsLordReflection(target, c, dmg);
  } else if (skill.type === 'healSelf') {
    const heal = Math.round(c.maxHp * skill.pct * lineScaleForThisSkill);
    c.curHp = Math.min(c.maxHp, c.curHp + heal);
    log(`${name} 使用【${skill.name}】，恢復 ${heal} 生命`, 'party');
    emitCombatEvent({ type: 'skillCast', targetKind: 'char', targetId: c.id, skill });
    emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: c.id, text: '+' + heal, cls: 'heal' });
  } else if (skill.type === 'healAlly') {
    const alive = activeAliveMembers();
    if (alive.length === 0) return;
    const healTarget = alive.reduce((a, b) => (a.curHp / a.maxHp < b.curHp / b.maxHp ? a : b));
    const heal = Math.round(healTarget.maxHp * skill.pct * lineScaleForThisSkill);
    healTarget.curHp = Math.min(healTarget.maxHp, healTarget.curHp + heal);
    log(`${name} 使用【${skill.name}】，治療 ${CHAR_DEFS[healTarget.id].name} ${heal} 生命`, 'party');
    emitCombatEvent({ type: 'skillCast', targetKind: 'char', targetId: healTarget.id, skill });
    emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: healTarget.id, text: '+' + heal, cls: 'heal' });
  } else if (skill.type === 'buffAtk') {
    gameState.partyBuff.mult = 1 + skill.pct * lineScaleForThisSkill;
    gameState.partyBuff.until = skill.duration * 1000; // skill.duration is authored in seconds
    log(`${name} 使用【${skill.name}】，隊伍攻擊力提升 ${Math.round(skill.pct * lineScaleForThisSkill * 100)}%`, 'party');
    emitCombatEvent({ type: 'skillCast', targetKind: 'char', targetId: c.id, skill });
    emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: c.id, text: 'ATK UP', cls: 'buff' });
  } else if (skill.type === 'buffDefParty') {
    gameState.partyDefense.bonus = Math.round(skill.amount * lineScaleForThisSkill);
    gameState.partyDefense.until = skill.duration * 1000; // skill.duration is authored in seconds
    log(`${name} 使用【${skill.name}】，隊伍防禦提升 ${gameState.partyDefense.bonus} 點`, 'party');
    emitCombatEvent({ type: 'skillCast', targetKind: 'char', targetId: c.id, skill });
    emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: c.id, text: 'DEF UP', cls: 'buff' });
  } else if (skill.type === 'hasteSelf') {
    // skill.mult is a multiplier BELOW 1 (smaller = faster), so scaling it up
    // like the other fields would backwards it into slower. Scale the boost
    // fraction (1 - mult) instead, floored so a fully-leveled line can't
    // collapse the interval to ~0.
    const boostFraction = Math.min(0.95, (1 - skill.mult) * lineScaleForThisSkill);
    grantHaste(c, 1 - boostFraction, skill.duration);
    log(`${name} 使用【${skill.name}】，攻速提升`, 'party');
    emitCombatEvent({ type: 'skillCast', targetKind: 'char', targetId: c.id, skill });
    emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: c.id, text: 'HASTE', cls: 'buff' });
  } else if (skill.type === 'dodgeSelf') {
    c.dodgeUntil = skill.duration * 1000;
    log(`${name} 使用【${skill.name}】，進入隱身狀態`, 'party');
    emitCombatEvent({ type: 'skillCast', targetKind: 'char', targetId: c.id, skill });
    emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: c.id, text: 'STEALTH', cls: 'buff' });
  }
}

// fires once per monster death, whoever/whatever caused it (a party attack,
// a skill, or a goo pop) - tick() sweeps for hp<=0 monsters after every
// action source so this only ever needs to run in one place.
export function onMonsterDefeated(m) {
  if (!m.alive) return;
  m.alive = false;
  m.hp = 0;
  if (gameState.chapter1State === CHAPTER1_STATES.COMPLETE && !m.isSummoned) gameState.agentKillCount++;
  emitCombatEvent({ type: 'monsterDefeated', monsterId: m.id, maxHp: m.maxHp });

  const alive = activeAliveMembers();
  const gold = goldForKill(m.isBoss, gameState.floor);
  gameState.runGold += gold;
  const xpShare = m.isBoss ? BOSS_XP_SHARE : MOB_XP_SHARE;
  const xpGain = Math.round((xpPoolForFloor(gameState.floor) * xpShare) / Math.max(1, alive.length));
  alive.forEach(c => addXp(c, xpGain));
  log(m.isBoss ? `擊敗首領！獲得 ${gold} 金幣` : `擊敗 ${m.name}！獲得 ${gold} 金幣`, 'good');

  if (!m.isBoss && !m.isSummoned) {
    gameState.slimeKillCount++; // all floor-1 mobs are slimes for now - see design.md 角色解鎖系統
    if (gameState.expeditionMode === 'ruins') gameState.ruinsKillCount++;
    checkThresholdUnlocks();
    if (Math.random() < SLIME_MONSTER_CRYSTAL_DROP_CHANCE) {
      addInventoryItem('monsterCrystal', 1, true);
      log(`${m.name} 掉落了 1 顆魔物結晶`, 'good');
    }
    if (Math.random() < SLIME_STAT_BOOK_DROP_CHANCE) {
      addInventoryItem('statBook', 1, true);
      log(`${m.name} 掉落了 1 本能力書`, 'good');
    }
    if (Math.random() < SLIME_SKILL_BOOK_DROP_CHANCE) {
      addInventoryItem('skillBook', 1, true);
      log(`${m.name} 掉落了 1 本技能書`, 'good');
    }
  }

  if (m.isBoss) {
    // Summons do not keep a cleared boss fight alive. This also leaves room
    // for a future dual-boss fight: victory waits until every boss is down.
    if (aliveMonsters().some(other => other.isBoss)) return;
    const clearedIds = [];
    gameState.monsters.filter(other => other.alive && !other.isBoss).forEach(other => {
      other.alive = false;
      clearedIds.push(other.id);
    });
    if (clearedIds.length > 0) emitCombatEvent({ type: 'bossVictoryCleanup', clearedIds });
    const expectedRunId = gameState.runId;
    setTimeout(() => {
      if (gameState.runId !== expectedRunId) return; // player retreated during the death animation - this run is gone
      log(`${regionName(gameState.floor)}制霸！`, 'good');
      if (gameState.floor >= MAX_IMPLEMENTED_FLOOR) {
        const securedGold = gameState.runGold;
        log(`目前開放的區域已全部完成，本次取得 ${securedGold} 金幣！`, 'good');
        setPhase(PHASES.VICTORY);
        emitCombatEvent({ type: 'victory', securedGold });
      } else {
        gameState.floor++;
        gameState.mobsCleared = 0;
        enterPrepFloor();
      }
      // No render()/flushCombat() here: this fires async, up to 100ms later
      // the ambient tick loop (main.js) drains this event and re-renders -
      // see combat.js's file-header note on why combat.js never renders itself.
    }, MONSTER_DEATH_ANIMATION_MS);
    return;
  }

  if (m.isSummoned) return; // add deaths never advance the pre-boss wave counter
  if (aliveMonsters().length > 0) return; // rest of this regular wave is still alive

  const expectedRunId = gameState.runId;
  setTimeout(() => {
    if (gameState.runId !== expectedRunId) return; // player retreated during the death animation - this run is gone
    gameState.mobsCleared++; // one full wave of mobs cleared
    if (gameState.expeditionMode === 'ruins') {
      if (gameState.ruinsKillCount >= RUINS_KILL_TARGET) enterPrepBoss();
      else spawnWave();
      return;
    }
    const encounterId = checkResonanceTriggers();
    const continueThroughEvent = () => {
      if (gameState.runId !== expectedRunId) return;
      startRandomEvent(action => {
        if (gameState.runId !== expectedRunId) return;
        if (action === 'enterRuins') beginRuinsExpedition();
        else continueAfterClearedWave();
      });
    };
    if (encounterId) {
      // Character resonance always stops unattended progress first. Ordinary
      // events only begin after that non-skippable story encounter finishes.
      startCharacterEncounter(encounterId, continueThroughEvent);
      return;
    }
    if (!tryXiaochuTravelStory(continueThroughEvent)) continueThroughEvent();
  }, MONSTER_DEATH_ANIMATION_MS);
}

export function continueAfterClearedWave() {
  if (gameState.mobsCleared >= MOBS_PER_FLOOR) {
    enterPrepBoss();
  } else {
    spawnWave();
  }
}

// Every way an expedition ends keeps its rewards. Defeat only costs time and
// floor progress, which keeps unattended play productive instead of punitive.
export function endRun() {
  gameState.runId++; // invalidate any in-flight onMonsterDefeated() timeout from the run just ending
  // Leaving or losing inside the ruins makes the entrance eligible to be
  // drawn again. The goddess transition has already advanced past RUINS, so
  // its story state is deliberately left untouched here.
  if (gameState.chapter1State === CHAPTER1_STATES.RUINS) setChapter1State(CHAPTER1_STATES.FOREST);
  gameState.bankedGold += gameState.runGold;
  gameState.runItemGains = {};
  gameState.runGold = 0;
  gameState.floor = 1;
  gameState.expeditionMode = 'forest';
  gameState.ruinsKillCount = 0;
  gameState.mobsCleared = 0;
  gameState.currentEventId = null;
  gameState.eventCountdown = 0;
  gameState.partyLocked = false; // a fresh run - free to pick a new party again
  gameState.gooDebuffStacks = 0;
  clearGooArena();
  gameState.roster.forEach(c => {
    c.curHp = c.maxHp; // resting before the next expedition - both paths heal
    c.alive = true;
    c.skillCds = [0, 0, 0];
    c.manualActionCd = 0;
    c.actionCountdown = 0;
    c.hasteMult = 1;
    c.hasteUntil = 0;
    c.dodgeUntil = 0;
    c.slowMult = 1;
    c.slowUntil = 0;
    c.sleepUntilAction = false;
    c.charmedUntilAction = false;
  });
  gameState.partyBuff = { mult: 1, until: 0 };
  gameState.partyDefense = { bonus: 0, until: 0 };
  gameState.combatItemCooldowns = {};
  enterPrepFloor();
  startPendingVillageContracts();
}

// Shop, inventory, and combat-item logic lives in shop.js - not battle-tick
// logic, so it doesn't belong in this file. grantHaste stays here since
// performSkill's hasteSelf branch (below) is a core combat use of it too.
export function grantHaste(target, mult, durationSeconds) {
  // Stronger/longer haste wins, so a short character skill cannot overwrite
  // and weaken an active 30-second speed potion.
  target.hasteMult = Math.min(target.hasteMult || 1, mult);
  target.hasteUntil = Math.max(target.hasteUntil || 0, durationSeconds * 1000);
}

export function canUseCharacterAction(characterId) {
  const c = gameState.roster.find(member => member.id === characterId);
  const action = CHAR_DEFS[characterId] && CHAR_DEFS[characterId].action;
  return gameState.phase === PHASES.COMBAT && !!c && c.alive && !!action && !isCharacterActionLocked(c) && c.manualActionCd <= 0 && aliveMonsters().length > 0;
}

export function isCharacterActionLocked(character) {
  return STATUS_DEFS.some(status => status.blocksCharacterAction && status.isActive(character));
}

export function useCharacterAction(characterId) {
  if (!canUseCharacterAction(characterId)) return;
  const c = gameState.roster.find(member => member.id === characterId);
  const def = CHAR_DEFS[characterId];
  const action = def.action;
  c.manualActionCd = action.cooldown * 1000 * actionLineCooldownMult(c);
  if (action.type === 'randomSkill') {
    const skillIndex = Math.floor(Math.random() * def.skills.length);
    const skill = def.skills[skillIndex];
    const targets = aliveMonsters();
    const target = targets[Math.floor(Math.random() * targets.length)];
    log(`${def.name} 發動【${action.name}】！`, 'party');
    emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: characterId, text: 'RANDOM', cls: 'buff' });
    performSkill(c, skill, skillIndex, target);
  } else if (action.type === 'selfBuffAtkDef') {
    // 小初「全力以赴」- 見 design.md「契約角色與解鎖」。跟技能線一樣用 'action' 這條
    // 強化線放大幅度（design.md 98：專屬操作本身有數值時比照技能線疊倍率），
    // 冷卻縮短則走 actionLineCooldownMult，兩者是各自獨立的加成。
    const scale = lineScale(c, 'action');
    gameState.partyBuff.mult = 1 + action.atkPct * scale;
    gameState.partyBuff.until = action.duration * 1000;
    gameState.partyDefense.bonus = Math.round(action.defAmount * scale);
    gameState.partyDefense.until = action.duration * 1000;
    log(`${def.name} 發動【${action.name}】，攻擊力與防禦力同時提升！`, 'party');
    emitCombatEvent({ type: 'skillCast', targetKind: 'char', targetId: characterId, skill: action });
    emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: characterId, text: 'ATK/DEF UP', cls: 'buff' });
  }
}

export function doWipeReset() {
  if (gameState.phase === PHASES.DEFEAT) return;
  setPhase(PHASES.DEFEAT);
  emitCombatEvent({ type: 'defeat' });
}

export function doRetreat() {
  log(`結束遠征，本次取得的 ${gameState.runGold} 金幣與物品全部保留。回家休息，全隊回滿血`, 'good');
  endRun();
}

export function tick() {
  tickShopIdle(); // shop.js - the dungeon shop's auto-leave countdown runs independent of COMBAT phase
  tickEventIdle();
  if (gameState.activeOverlay === 'dialogue' || gameState.activeOverlay === 'event') return;
  if (gameState.phase !== PHASES.COMBAT) return; // waiting on the player to confirm prepFloor/prepBoss

  Object.keys(gameState.combatItemCooldowns).forEach(itemId => {
    gameState.combatItemCooldowns[itemId] = Math.max(0, gameState.combatItemCooldowns[itemId] - MASTER_TICK_MS);
  });

  const alive = activeAliveMembers();

  if (alive.length === 0) {
    const storyBoss = gameState.monsters.find(monster => monster.storyBoss && monster.defeatTriggered);
    if (storyBoss) return;
    doWipeReset();
    return;
  }

  tickCharacters(alive);
  tickBuffs();
  tickMonsters();

  // centralized death sweep - catches monsters killed by attacks, skills, or
  // (via popGoo, which runs outside this loop on click) a goo pop.
  gameState.monsters.filter(m => m.alive && m.hp <= 0).forEach(m => onMonsterDefeated(m));
}

export function tickCharacters(alive) {
  alive.forEach(c => {
    if (!c.alive) return;
    const skills = CHAR_DEFS[c.id].skills;
    c.skillCds = c.skillCds.map(cd => Math.max(0, cd - MASTER_TICK_MS));
    c.manualActionCd = Math.max(0, c.manualActionCd - MASTER_TICK_MS);

    if (c.hasteUntil > 0) {
      c.hasteUntil -= MASTER_TICK_MS;
      if (c.hasteUntil <= 0) {
        c.hasteMult = 1;
        log(`${CHAR_DEFS[c.id].name} 的加速效果結束`);
      }
    }
    if (c.dodgeUntil > 0) {
      c.dodgeUntil -= MASTER_TICK_MS;
      if (c.dodgeUntil <= 0) log(`${CHAR_DEFS[c.id].name} 的隱身效果結束`);
    }
    if (c.slowUntil > 0) {
      c.slowUntil -= MASTER_TICK_MS;
      if (c.slowUntil <= 0) {
        c.slowMult = 1;
        log(`${CHAR_DEFS[c.id].name} 的攻速恢復正常`);
      }
    }

    c.actionCountdown -= MASTER_TICK_MS;
    if (c.actionCountdown > 0) return; // not this character's turn yet
    c.actionCountdown += CHAR_DEFS[c.id].atkInterval * (c.hasteMult || 1) * (c.slowMult || 1) * speedLineIntervalMult(c);

    if (c.sleepUntilAction) {
      c.sleepUntilAction = false;
      log(`${CHAR_DEFS[c.id].name} 醒來了，但錯過了這次行動`, 'warn');
      emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: c.id, text: 'WAKE', cls: 'buff' });
      return;
    }
    if (c.charmedUntilAction) {
      c.charmedUntilAction = false;
      performCharmedAction(c);
      return;
    }

    const targets = aliveMonsters();
    if (targets.length === 0) return; // wave already cleared this tick

    const target = targets[Math.floor(Math.random() * targets.length)];
    let usedIdx = -1;
    for (let i = 0; i < skills.length; i++) {
      if (c.skillCds[i] <= 0) { usedIdx = i; break; }
    }
    if (usedIdx >= 0) {
      performSkill(c, skills[usedIdx], usedIdx, target);
    } else {
      const dmg = rollDamage(calcAtk(c));
      target.hp -= dmg;
      log(`${CHAR_DEFS[c.id].name} 普通攻擊 ${target.name}，造成 ${dmg} 傷害`, 'party');
      emitCombatEvent({ type: 'popup', targetKind: 'monster', targetId: target.id, text: '-' + dmg, cls: 'dmg' });
      emitCombatEvent({ type: 'flash', targetKind: 'monster', targetId: target.id });
      applyRuinsLordReflection(target, c, dmg);
    }
  });
}

export function tickBuffs() {
  if (gameState.partyBuff.until > 0) {
    gameState.partyBuff.until -= MASTER_TICK_MS;
    if (gameState.partyBuff.until <= 0) {
      gameState.partyBuff.mult = 1;
      log('戰吼效果結束');
    }
  }

  if (gameState.partyDefense.until > 0) {
    gameState.partyDefense.until -= MASTER_TICK_MS;
    if (gameState.partyDefense.until <= 0) {
      gameState.partyDefense.bonus = 0;
      log('防禦提升效果結束');
    }
  }
}

export function tickMonsters() {
  const boss = gameState.monsters.find(m => m.isBoss);
  if (boss && boss.alive && boss.storyBoss) {
    tickRuinsLord(boss);
    return;
  }
  if (boss && boss.alive) {
    gooTick(boss);
    bossSummonTick(boss);
  }

  aliveMonsters().forEach(m => {
    m.skillCd = Math.max(0, m.skillCd - MASTER_TICK_MS);

    m.actionCountdown -= MASTER_TICK_MS;
    if (m.actionCountdown > 0) return;
    m.actionCountdown += m.atkInterval;

    const stillAlive = activeAliveMembers();
    if (stillAlive.length === 0) return;
    const useSkill = m.skillCd <= 0;
    if (useSkill && performMonsterSkill(m)) return;

    const target = stillAlive[Math.floor(Math.random() * stillAlive.length)];
    if (target.dodgeUntil > 0) {
      log(`${m.name} 攻擊 ${CHAR_DEFS[target.id].name}，但被隱身閃避了！`, 'party');
      emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: target.id, text: 'MISS', cls: 'buff' });
      return;
    }
    const baseDmg = Math.max(1, m.atk - calcDef(target));
    const dmg = rollDamage(baseDmg);
    target.curHp -= dmg;
    log(`${m.name} 普通攻擊 ${CHAR_DEFS[target.id].name}，造成 ${dmg} 傷害`, 'enemy');
    emitCombatEvent({ type: 'popup', targetKind: 'char', targetId: target.id, text: '-' + dmg, cls: 'dmg' });
    emitCombatEvent({ type: 'flash', targetKind: 'char', targetId: target.id });
    if (target.curHp <= 0) {
      target.curHp = 0;
      target.alive = false;
      log(`${CHAR_DEFS[target.id].name} 倒下了！`, 'warn');
    }
  });
}

// solo mode (SOLO_PARTY_LIMIT === 1): picking a character always just swaps
// the single slot to them - no deselecting down to an empty party, no being
// blocked because "the slot is full". Multiplayer will need a real
// add/remove toggle again once SOLO_PARTY_LIMIT goes away.
export function toggleParty(id) {
  if (gameState.phase === PHASES.COMBAT) return; // locked once the fight has started
  if (gameState.partyLocked) return; // locked for the whole run once you've entered the dungeon
  if (!isCharUnlocked(id)) return; // can't take a locked character into the dungeon
  if (gameState.party.includes(id)) return; // already the chosen one - clicking it again does nothing
  gameState.party = [id];
}
