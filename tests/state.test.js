import assert from 'node:assert/strict';

global.window = { location: { search: '' } };
global.document = { getElementById: () => null, addEventListener: () => {}, dispatchEvent: () => {}, documentElement: {} };

const { PHASES, gameState, setPhase, isPrepPhase, isCombatSurfacePhase } = await import('../prototype/js/state.js');

const initial = { phase: gameState.phase, prep: isPrepPhase(), combatSurface: isCombatSurfacePhase() };
setPhase(PHASES.DUNGEON_INTRO);
const dungeon = { phase: gameState.phase, prep: isPrepPhase(), combatSurface: isCombatSurfacePhase() };
setPhase(PHASES.COMBAT);
setPhase(PHASES.PREP_BOSS);
setPhase(PHASES.BOSS_INTRO);
setPhase(PHASES.COMBAT);
const finalPhase = gameState.phase;

assert.deepEqual(initial, { phase: 'prepFloor', prep: true, combatSurface: false });
assert.deepEqual(dungeon, { phase: 'dungeonIntro', prep: false, combatSurface: true });
assert.equal(finalPhase, 'combat');
assert.throws(
  () => setPhase(PHASES.BOSS_INTRO),
  /Illegal game phase transition: combat -> bossIntro/,
);
assert.throws(
  () => setPhase('typo'),
  /Unknown game phase/,
);

console.log('state.test.js: all phase assertions passed');
