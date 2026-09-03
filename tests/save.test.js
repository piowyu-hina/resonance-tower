const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

global.window = { location: { search: '' } };

const source = [
  'prototype/js/constants.js',
  'prototype/js/state.js',
  'prototype/js/save.js',
].map(file => fs.readFileSync(file, 'utf8')).join('\n');

vm.runInThisContext(`${source}\nglobalThis.__saveTestApi = { normalizeSaveData };`);
const { normalizeSaveData } = globalThis.__saveTestApi;

const normalized = normalizeSaveData({
  format: 'resonance-tower-save',
  version: 1,
  progression: {
    bankedGold: 42.9,
    slimeKillCount: -5,
    potionUseCount: '12',
    unlockedChars: ['not-a-character'],
    resonanceState: { xiaochu: 'contracted', fake: 'contracted' },
    roster: [{ id: 'xiaochu', level: 3, xp: 999, lineLevels: { atk: 500, skill0: 4 }, loadout: { activeItemId: 'powerCharm' } }],
    party: ['xiaochu', 'not-a-character'],
    inventory: [{ itemId: 'monsterCrystal', qty: 7 }, { itemId: 'fake', qty: 2 }],
    storage: [],
    ownedSkins: ['xiaochu_default', 'fake_skin'],
    equippedSkinByCharacter: { xiaochu: 'xiaochu_default', wuming: 'fake_skin' },
  },
});

assert.equal(normalized.bankedGold, 42);
assert.equal(normalized.slimeKillCount, 0);
assert.equal(normalized.potionUseCount, 12);
assert.deepEqual([...normalized.unlocked].sort(), ['wuming', 'xiaochu']);
assert.equal(normalized.resonanceState.xiaochu, 'contracted');
assert.equal(normalized.resonanceState.fake, undefined);
assert.deepEqual(normalized.party, ['xiaochu']);
assert.deepEqual(normalized.inventory[0], { itemId: 'monsterCrystal', qty: 7 });
assert.equal(normalized.inventory[1], null);
assert.equal(normalized.characters.get('xiaochu').xp, 29);
assert.equal(normalized.characters.get('xiaochu').lineLevels.atk, 100);
assert.equal(normalized.characters.get('xiaochu').lineLevels.skill0, 4);
assert.equal(normalized.characters.get('xiaochu').activeItemId, 'powerCharm');
assert.equal(normalized.ownedSkins.has('fake_skin'), false);
assert.equal(normalized.equippedSkinByCharacter.xiaochu, 'xiaochu_default');

assert.throws(() => normalizeSaveData({ version: 1 }), /不支援的存檔格式/);
console.log('save.test.js: all assertions passed');
