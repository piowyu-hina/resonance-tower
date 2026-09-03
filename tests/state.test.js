const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const context = vm.createContext({
  URLSearchParams,
  window: { location: { search: '' } },
  document: { getElementById: () => null },
});
context.globalThis = context;

for (const file of ['prototype/js/constants.js', 'prototype/js/state.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

vm.runInContext(`
  globalThis.__phases = { ...PHASES };
  globalThis.__initial = { phase, prep: isPrepPhase(), combatSurface: isCombatSurfacePhase() };
  setPhase(PHASES.DUNGEON_INTRO);
  globalThis.__dungeon = { phase, prep: isPrepPhase(), combatSurface: isCombatSurfacePhase() };
  setPhase(PHASES.COMBAT);
  setPhase(PHASES.PREP_BOSS);
  setPhase(PHASES.BOSS_INTRO);
  setPhase(PHASES.COMBAT);
  globalThis.__finalPhase = phase;
`, context);

assert.deepEqual({ ...context.__initial }, { phase: 'prepFloor', prep: true, combatSurface: false });
assert.deepEqual({ ...context.__dungeon }, { phase: 'dungeonIntro', prep: false, combatSurface: true });
assert.equal(context.__finalPhase, 'combat');
assert.throws(
  () => vm.runInContext("setPhase(PHASES.BOSS_INTRO)", context),
  /Illegal game phase transition: combat -> bossIntro/,
);
assert.throws(
  () => vm.runInContext("setPhase('typo')", context),
  /Unknown game phase/,
);

console.log('state.test.js: all phase assertions passed');
