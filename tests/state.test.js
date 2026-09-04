import assert from 'node:assert/strict';

global.window = { location: { search: '' } };
global.document = { getElementById: () => null, addEventListener: () => {}, dispatchEvent: () => {}, documentElement: {} };

const { PHASES, gameState, setPhase, isPrepPhase, isCombatSurfacePhase, addXp, CHAPTER1_STATES } = await import('../prototype/js/state.js');

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
setPhase(PHASES.BOSS_INTRO);
assert.equal(gameState.phase, 'bossIntro', 'an in-combat story gate may start a boss intro');
setPhase(PHASES.COMBAT);
assert.throws(
  () => setPhase(PHASES.DUNGEON_INTRO),
  /Illegal game phase transition: combat -> dungeonIntro/,
);
assert.throws(
  () => setPhase('typo'),
  /Unknown game phase/,
);

const cappedCharacter = {
  id: 'wuming', level: 10, xp: 0, lineLevels: {}, loadout: { activeItemId: null },
};
gameState.chapter1State = CHAPTER1_STATES.RUINS;
addXp(cappedCharacter, 9999);
assert.deepEqual(
  { level: cappedCharacter.level, xp: cappedCharacter.xp },
  { level: 10, xp: 0 },
  'ordinary growth should stop at level 10 before Wuming becomes the goddess proxy',
);
gameState.chapter1State = CHAPTER1_STATES.COMPLETE;
addXp(cappedCharacter, 100);
assert.equal(cappedCharacter.level, 11, 'the level cap should lift after the goddess appoints Wuming');

console.log('state.test.js: all phase assertions passed');
