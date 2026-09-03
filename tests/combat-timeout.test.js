// Regression test for the stale-death-timeout race: killing the boss (or
// clearing a mob wave) schedules a setTimeout before advancing floor/phase.
// If the player retreats (endRun()) while that timeout is still pending, the
// stale callback must no-op instead of mutating a run that already ended.
//
// Note: top-level `let`/`const` inside vm.runInContext() source do NOT become
// properties of the context object (only plain/`var` assignments do), so any
// state we need back in Node land is snapshotted onto `globalThis.__x` from
// inside a runInContext call, then read as `context.__x` afterward.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function freshContext() {
  const context = vm.createContext({
    URLSearchParams,
    window: { location: { search: '' } },
    document: { getElementById: () => null },
  });
  context.globalThis = context;
  for (const file of ['prototype/js/constants.js', 'prototype/js/state.js', 'prototype/js/combat.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  vm.runInContext(`
    clearGooArena = () => {};
    render = () => {};
    showVictoryOverlay = () => { globalThis.__victoryShown = true; };
    addInventoryItem = () => {}; // shop.js isn't loaded here - loot drops aren't under test
    t = key => key; // i18n stub - regionName() needs it, translated text isn't under test here
  `, context);
  return context;
}

// --- boss-defeat timeout: stale callback after a retreat must not fire ---
{
  const context = freshContext();
  vm.runInContext(`
    phase = PHASES.COMBAT;
    floor = 1;
    monsters = [{ id: 'bossTest', isBoss: true, alive: true, hp: 0, maxHp: 100 }];
    globalThis.__capturedTimeout = null;
    setTimeout = fn => { globalThis.__capturedTimeout = fn; };
    onMonsterDefeated(monsters[0]);
  `, context);
  assert.ok(context.__capturedTimeout, 'boss-defeat setTimeout should have been scheduled');

  vm.runInContext(`endRun(); globalThis.__afterRetreat = { phase, floor };`, context); // player retreats mid-animation
  const { phase: phaseAfterRetreat, floor: floorAfterRetreat } = context.__afterRetreat;

  context.__capturedTimeout(); // the stale callback finally fires
  vm.runInContext(`globalThis.__final = { phase, floor };`, context);

  assert.equal(context.__victoryShown, undefined, 'stale boss-defeat callback must not show the victory overlay');
  assert.equal(context.__final.phase, phaseAfterRetreat, 'stale callback must not change phase past what endRun() already set');
  assert.equal(context.__final.floor, floorAfterRetreat, 'stale callback must not advance floor after a retreat');
}

// --- boss-defeat timeout: non-stale callback still fires normally ---
{
  const context = freshContext();
  vm.runInContext(`
    phase = PHASES.COMBAT;
    floor = 1;
    monsters = [{ id: 'bossTest', isBoss: true, alive: true, hp: 0, maxHp: 100 }];
    globalThis.__capturedTimeout = null;
    setTimeout = fn => { globalThis.__capturedTimeout = fn; };
    onMonsterDefeated(monsters[0]);
  `, context);

  context.__capturedTimeout();
  vm.runInContext(`globalThis.__final = { phase, floor };`, context);

  // floor 1 === MAX_IMPLEMENTED_FLOOR in this build, so a real callback takes the victory branch
  assert.equal(context.__victoryShown, true, 'a real (non-stale) boss-defeat callback should still show the victory overlay');
  assert.equal(context.__final.phase, 'victory', 'setPhase(VICTORY) should run normally when the callback is not stale');
}

// --- mob-wave-cleared timeout: stale callback after a retreat must not fire ---
{
  const context = freshContext();
  vm.runInContext(`
    phase = PHASES.COMBAT;
    mobsCleared = 0;
    monsters = [{ id: 'm1', isBoss: false, isSummoned: false, alive: true, hp: 0 }];
    globalThis.__capturedTimeout = null;
    setTimeout = fn => { globalThis.__capturedTimeout = fn; };
    onMonsterDefeated(monsters[0]);
  `, context);
  assert.ok(context.__capturedTimeout, 'mob-wave setTimeout should have been scheduled');

  vm.runInContext(`endRun(); globalThis.__afterRetreat = { mobsCleared };`, context);
  const { mobsCleared: mobsClearedAfterRetreat } = context.__afterRetreat;

  context.__capturedTimeout();
  vm.runInContext(`globalThis.__final = { mobsCleared };`, context);

  assert.equal(context.__final.mobsCleared, mobsClearedAfterRetreat, 'stale callback must not increment mobsCleared after a retreat');
}

console.log('combat-timeout.test.js: all assertions passed');
