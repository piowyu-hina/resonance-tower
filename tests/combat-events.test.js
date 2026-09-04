// combat.js only mutates state and queues one-shot effects via
// emitCombatEvent() (combat-events.js) - it never touches the DOM. These
// tests exercise that path directly, headless, against the real modules.
import assert from 'node:assert/strict';

global.window = { location: { search: '' } };
global.document = { getElementById: () => null, addEventListener: () => {}, dispatchEvent: () => {}, documentElement: {} };
global.setTimeout = () => {}; // death-transition timers aren't under test here

const { gameState, PHASES, recomputeStats, activeAliveMembers, CHAPTER1_STATES } = await import('../prototype/js/state.js');
const { tickCharacters, onMonsterDefeated, spawnWave, makeMob, performMonsterSkill, spawnRuinsLord, tickRuinsLord } = await import('../prototype/js/combat.js');
const { drainCombatEvents } = await import('../prototype/js/combat-events.js');
const { destroyRuinsSpike } = await import('../prototype/js/ruins.js');

// tickCharacters(): a normal attack (every skill on cooldown) against a
// monster queues popup+flash events targeting that monster, with zero DOM.
{
  gameState.phase = PHASES.COMBAT;
  gameState.roster = [{
    id: 'wuming', level: 1, xp: 0, alive: true, skillCds: [999999, 999999, 999999],
    manualActionCd: 0, actionCountdown: 0, hasteMult: 1, hasteUntil: 0, dodgeUntil: 0,
    slowMult: 1, slowUntil: 0, sleepUntilAction: false, charmedUntilAction: false,
    loadout: { activeItemId: null }, lineLevels: {},
  }];
  gameState.party = ['wuming'];
  recomputeStats(gameState.roster[0]);
  gameState.roster[0].curHp = gameState.roster[0].maxHp;
  gameState.monsters = [{ id: 'm1', name: '生氣史萊姆', isBoss: false, alive: true, hp: 999, maxHp: 999, atk: 1, atkInterval: 1000, actionCountdown: 1000, skillCd: 0, skill: { name: 'x', target: 'randomParty', cd: 1, effects: [] } }];
  tickCharacters(activeAliveMembers());
  const events = drainCombatEvents();

  const types = events.map(e => e.type);
  assert.ok(types.includes('popup'), 'a normal attack should queue a popup event');
  assert.ok(types.includes('flash'), 'a normal attack should queue a flash event');
  const popupEvent = events.find(e => e.type === 'popup');
  assert.equal(popupEvent.targetKind, 'monster');
  assert.equal(popupEvent.targetId, 'm1');
}

// The Ruins Master is mechanically level 100 while concealing that level in
// the UI. Its opening rock-spike wave travels through the arena before normal
// combat damage is resolved; a surviving (tampered) character remains in the
// fight instead of being forced to zero by a story-only shortcut.
{
  gameState.phase = PHASES.COMBAT;
  gameState.chapter1State = CHAPTER1_STATES.RUINS;
  gameState.expeditionMode = 'ruins';
  gameState.roster = [{
    id: 'wuming', level: 10, xp: 0, alive: true, skillCds: [999999, 999999, 999999],
    manualActionCd: 0, actionCountdown: 999999, hasteMult: 1, hasteUntil: 0, dodgeUntil: 0,
    slowMult: 1, slowUntil: 0, sleepUntilAction: false, charmedUntilAction: false,
    loadout: { activeItemId: null }, lineLevels: {},
  }];
  gameState.party = ['wuming'];
  recomputeStats(gameState.roster[0]);
  const wuming = gameState.roster[0];
  wuming.maxHp = 10000;
  wuming.curHp = 10000;

  spawnRuinsLord();
  drainCombatEvents();
  const boss = gameState.monsters[0];
  assert.equal(boss.level, 100);
  assert.equal(boss.displayLevel, 'XXX');
  assert.deepEqual([boss.skill.name, boss.skill2.name, boss.skill3.name], ['重擊', '反傷盾', '岩刺突襲']);

  boss.actionCountdown = 0;
  tickRuinsLord(boss);
  const castEvents = drainCombatEvents();
  const spikeEvent = castEvents.find(event => event.type === 'ruinsSpikeRush');
  assert.equal(spikeEvent.spikeIds.length, 4);
  assert.ok(boss.pendingSpikeMs > 0);
  assert.equal(destroyRuinsSpike(boss.id, spikeEvent.spikeIds[0]), true);
  assert.equal(destroyRuinsSpike(boss.id, spikeEvent.spikeIds[0]), false, 'one spike cannot be clicked twice');

  boss.actionCountdown = 999999;
  boss.pendingSpikeMs = 100;
  tickRuinsLord(boss);
  assert.ok(wuming.curHp < wuming.maxHp, 'the spike wave should resolve as ordinary combat damage');
  assert.equal(wuming.alive, true, 'an abnormally durable character should remain in combat');
  const impactEvents = drainCombatEvents();
  const impactEvent = impactEvents.find(event => event.type === 'ruinsSpikeImpact');
  assert.equal(impactEvent.hitCount, 3);
  assert.ok(impactEvent.totalDamage > 0, 'the arena impact readout should report actual damage dealt');

  boss.skillCursor = 0;
  boss.skill3Cd = 0;
  boss.actionCountdown = 0;
  tickRuinsLord(boss);
  const secondSpikeEvent = drainCombatEvents().find(event => event.type === 'ruinsSpikeRush');
  secondSpikeEvent.spikeIds.forEach(spikeId => assert.equal(destroyRuinsSpike(boss.id, spikeId), true));
  const hpBeforeClearedWave = wuming.curHp;
  boss.pendingSpikeMs = 100;
  tickRuinsLord(boss);
  assert.equal(wuming.curHp, hpBeforeClearedWave, 'clearing every spike should prevent the wave damage');
  drainCombatEvents();

  boss.skillCursor = 2;
  boss.skill2Cd = 0;
  boss.reflectShieldMs = 0;
  boss.actionCountdown = 0;
  tickRuinsLord(boss);
  const shieldEvents = drainCombatEvents();
  assert.equal(boss.reflectShieldMs, boss.skill2.duration * 1000);
  assert.ok(shieldEvents.some(event => event.type === 'ruinsShieldChanged' && event.active));

  const hpBeforeReflection = wuming.curHp;
  wuming.actionCountdown = 0;
  tickCharacters([wuming]);
  const reflectionEvents = drainCombatEvents();
  assert.ok(wuming.curHp < hpBeforeReflection, 'attacking the active shield should reflect damage');
  assert.ok(reflectionEvents.some(event => event.type === 'ruinsShieldPulse'));

  const hpBeforeHeavyHit = wuming.curHp;
  boss.actionCountdown = 0;
  tickRuinsLord(boss);
  const heavyEvents = drainCombatEvents();
  assert.ok(wuming.curHp < hpBeforeHeavyHit, 'the heavy strike should deal ordinary combat damage');
  assert.ok(heavyEvents.some(event => event.type === 'skillCast' && event.skill.name === '重擊'));
}

// onMonsterDefeated(): defeating a mob queues a monsterDefeated event
// carrying its id/maxHp, needed to zero its HP bar without touching the DOM.
{
  gameState.phase = PHASES.COMBAT;
  gameState.floor = 1;
  gameState.roster = [];
  gameState.party = [];
  gameState.monsters = [{ id: 'm2', isBoss: false, isSummoned: false, alive: true, hp: 0, maxHp: 15 }];
  onMonsterDefeated(gameState.monsters[0]);
  const events = drainCombatEvents();

  const defeated = events.find(e => e.type === 'monsterDefeated');
  assert.ok(defeated, 'onMonsterDefeated() should queue a monsterDefeated event');
  assert.equal(defeated.monsterId, 'm2');
  assert.equal(defeated.maxHp, 15);
}

// spawnWave(): starting a new wave queues waveSpawned instead of building
// monster card DOM directly.
{
  gameState.floor = 1;
  gameState.mobsCleared = 0;
  spawnWave();
  const events = drainCombatEvents();
  const monsterCount = gameState.monsters.length;

  assert.ok(events.some(e => e.type === 'waveSpawned'), 'spawnWave() should queue a waveSpawned event');
  assert.ok(monsterCount >= 2 && monsterCount <= 3, 'a mob wave should spawn 2-3 monsters');
}

// Every ruins mob has a working first-turn skill with its own role: moderate
// damage, heavy damage, or damage plus a timed slow.
{
  gameState.floor = 1;
  gameState.roster = [{
    id: 'wuming', level: 1, xp: 0, alive: true, skillCds: [0, 0, 0],
    manualActionCd: 0, actionCountdown: 1000, hasteMult: 1, hasteUntil: 0, dodgeUntil: 0,
    slowMult: 1, slowUntil: 0, sleepUntilAction: false, charmedUntilAction: false,
    loadout: { activeItemId: null }, lineLevels: {},
  }];
  gameState.party = ['wuming'];
  recomputeStats(gameState.roster[0]);
  const wuming = gameState.roster[0];
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const damageByMonster = {};
    for (const defId of ['ruinsRelics', 'ruinsRock']) {
      wuming.curHp = wuming.maxHp;
      const monster = makeMob(defId);
      gameState.monsters = [monster];
      assert.equal(performMonsterSkill(monster), true);
      damageByMonster[defId] = wuming.maxHp - wuming.curHp;
      assert.equal(monster.skillCd, monster.skill.cd * 1000);
      assert.ok(drainCombatEvents().some(event => event.type === 'skillCast' && event.skill.img === monster.skill.img));
    }
    assert.ok(damageByMonster.ruinsRock > damageByMonster.ruinsRelics, 'rock slime heavy hit should exceed relic slime damage');

    wuming.curHp = wuming.maxHp;
    wuming.slowMult = 1;
    wuming.slowUntil = 0;
    const dust = makeMob('ruinsDust');
    gameState.monsters = [dust];
    assert.equal(performMonsterSkill(dust), true);
    assert.ok(wuming.curHp < wuming.maxHp, 'dust skill should deal damage');
    assert.equal(wuming.slowMult, 1.5);
    assert.equal(wuming.slowUntil, 4000);
    assert.ok(drainCombatEvents().some(event => event.type === 'skillCast' && event.skill.img === dust.skill.img));
  } finally {
    Math.random = originalRandom;
  }
}

console.log('combat-events.test.js: all assertions passed');
