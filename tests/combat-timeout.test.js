// Regression test for the stale-death-timeout race: killing the boss (or
// clearing a mob wave) schedules a setTimeout before advancing floor/phase.
// If the player retreats (endRun()) while that timeout is still pending, the
// stale callback must no-op instead of mutating a run that already ended.
//
// Real ES modules cache one instance per process, so there's no "fresh vm
// context" per scenario anymore - each scenario below explicitly resets the
// gameState fields it depends on before running, the same way the app itself
// only ever depends on state being set before a transition, not on a blank
// slate.
import assert from 'node:assert/strict';

global.window = { location: { search: '' } };
global.document = { getElementById: () => null, addEventListener: () => {}, dispatchEvent: () => {}, documentElement: {} };

const { gameState, PHASES } = await import('../prototype/js/state.js');
const { onMonsterDefeated, endRun } = await import('../prototype/js/combat.js');
const { drainCombatEvents } = await import('../prototype/js/combat-events.js');

// --- boss-defeat timeout: stale callback after a retreat must not fire ---
{
  gameState.phase = PHASES.COMBAT;
  gameState.floor = 1;
  gameState.monsters = [{ id: 'bossTest', isBoss: true, alive: true, hp: 0, maxHp: 100 }];
  let capturedTimeout = null;
  global.setTimeout = fn => { capturedTimeout = fn; };
  onMonsterDefeated(gameState.monsters[0]);
  assert.ok(capturedTimeout, 'boss-defeat setTimeout should have been scheduled');
  drainCombatEvents(); // discard the monsterDefeated/bossVictoryCleanup events from the call above

  endRun(); // player retreats mid-animation
  const phaseAfterRetreat = gameState.phase;
  const floorAfterRetreat = gameState.floor;

  capturedTimeout(); // the stale callback finally fires
  const finalEvents = drainCombatEvents();

  assert.ok(!finalEvents.some(e => e.type === 'victory'), 'stale boss-defeat callback must not queue a victory event');
  assert.equal(gameState.phase, phaseAfterRetreat, 'stale callback must not change phase past what endRun() already set');
  assert.equal(gameState.floor, floorAfterRetreat, 'stale callback must not advance floor after a retreat');
}

// --- boss-defeat timeout: non-stale callback still fires normally ---
{
  gameState.phase = PHASES.COMBAT;
  gameState.floor = 1;
  gameState.monsters = [{ id: 'bossTest', isBoss: true, alive: true, hp: 0, maxHp: 100 }];
  let capturedTimeout = null;
  global.setTimeout = fn => { capturedTimeout = fn; };
  onMonsterDefeated(gameState.monsters[0]);
  drainCombatEvents();

  capturedTimeout();
  const finalEvents = drainCombatEvents();

  // floor 1 === MAX_IMPLEMENTED_FLOOR in this build, so a real callback takes the victory branch
  assert.ok(finalEvents.some(e => e.type === 'victory'), 'a real (non-stale) boss-defeat callback should queue a victory event');
  assert.equal(gameState.phase, 'victory', 'setPhase(VICTORY) should run normally when the callback is not stale');
}

// --- mob-wave-cleared timeout: stale callback after a retreat must not fire ---
{
  gameState.phase = PHASES.COMBAT;
  gameState.mobsCleared = 0;
  gameState.monsters = [{ id: 'm1', isBoss: false, isSummoned: false, alive: true, hp: 0, maxHp: 15 }];
  let capturedTimeout = null;
  global.setTimeout = fn => { capturedTimeout = fn; };
  onMonsterDefeated(gameState.monsters[0]);
  assert.ok(capturedTimeout, 'mob-wave setTimeout should have been scheduled');
  drainCombatEvents();

  endRun();
  const mobsClearedAfterRetreat = gameState.mobsCleared;

  capturedTimeout();

  assert.equal(gameState.mobsCleared, mobsClearedAfterRetreat, 'stale callback must not increment mobsCleared after a retreat');
}

console.log('combat-timeout.test.js: all assertions passed');
