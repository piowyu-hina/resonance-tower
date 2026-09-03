const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const context = vm.createContext({
  URLSearchParams,
  window: { location: { search: '' } },
  document: { getElementById: () => null },
});
context.globalThis = context;

for (const file of ['prototype/js/constants.js', 'prototype/js/state.js', 'prototype/js/combat-events.js', 'prototype/js/combat.js', 'prototype/js/shop.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

vm.runInContext(`
  clearGooArena = () => {};
  inventory = Array.from({ length: INVENTORY_SLOT_COUNT }, () => ({ itemId: 'potion', qty: 99 }));
  addInventoryItem('potion', 1, true);
  bankedGold = 40;
  runGold = 21;
  endRun();
  globalThis.__result = {
    inventoryLength: inventory.length,
    finalStack: inventory.at(-1),
    potionCount: inventory.reduce((total, entry) => total + (entry && entry.itemId === 'potion' ? entry.qty : 0), 0),
    bankedGold,
    runGold,
    runItemGains: { ...runItemGains },
    phase,
  };
`, context);

assert.equal(context.__result.inventoryLength, 17);
assert.deepEqual({ ...context.__result.finalStack }, { itemId: 'potion', qty: 1 });
assert.equal(context.__result.potionCount, 16 * 99 + 1);
assert.equal(context.__result.bankedGold, 61);
assert.equal(context.__result.runGold, 0);
assert.equal(Object.keys(context.__result.runItemGains).length, 0);
assert.equal(context.__result.phase, 'prepFloor');

console.log('progression.test.js: all assertions passed');
