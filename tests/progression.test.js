import assert from 'node:assert/strict';

global.window = { location: { search: '' } };
global.document = { getElementById: () => null, addEventListener: () => {}, dispatchEvent: () => {}, documentElement: {} };

const { INVENTORY_SLOT_COUNT } = await import('../prototype/js/constants.js');
const { gameState, conditionMet, checkResonanceTriggers } = await import('../prototype/js/state.js');
const { endRun } = await import('../prototype/js/combat.js');
const { addInventoryItem } = await import('../prototype/js/shop.js');

gameState.inventory = Array.from({ length: INVENTORY_SLOT_COUNT }, () => ({ itemId: 'potion', qty: 99 }));
addInventoryItem('potion', 1, true);
gameState.bankedGold = 40;
gameState.runGold = 21;
endRun();

assert.equal(gameState.inventory.length, 17);
assert.deepEqual({ ...gameState.inventory.at(-1) }, { itemId: 'potion', qty: 1 });
const potionCount = gameState.inventory.reduce((total, entry) => total + (entry && entry.itemId === 'potion' ? entry.qty : 0), 0);
assert.equal(potionCount, 16 * 99 + 1);
assert.equal(gameState.bankedGold, 61);
assert.equal(gameState.runGold, 0);
assert.equal(Object.keys(gameState.runItemGains).length, 0);
assert.equal(gameState.phase, 'prepFloor');

console.log('progression.test.js: all assertions passed');
gameState.slimeKillCount = 999;
gameState.agentKillCount = 49;
assert.equal(conditionMet({ type: 'agentKillCount', count: 50 }), false);
gameState.agentKillCount = 50;
assert.equal(conditionMet({ type: 'agentKillCount', count: 50 }), true);
gameState.chapter1State = 'forest';
assert.equal(checkResonanceTriggers(), false, 'old pre-agent kills never trigger the new encounter');
