// combat.js only mutates state and queues one-shot effects via
// emitCombatEvent() (combat-events.js) - it never touches the DOM. These
// tests exercise that path directly, headless, against the real modules.
import assert from 'node:assert/strict';

global.window = { location: { search: '' } };
global.document = { getElementById: () => null, addEventListener: () => {}, dispatchEvent: () => {}, documentElement: {} };
global.setTimeout = () => {}; // death-transition timers aren't under test here

const { gameState, PHASES, recomputeStats, activeAliveMembers } = await import('../prototype/js/state.js');
const { tickCharacters, onMonsterDefeated, spawnWave } = await import('../prototype/js/combat.js');
const { drainCombatEvents } = await import('../prototype/js/combat-events.js');

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

console.log('combat-events.test.js: all assertions passed');
