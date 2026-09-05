import assert from 'node:assert/strict';

global.window = { location: { search: '' } };
global.document = { getElementById: () => null, addEventListener: () => {}, dispatchEvent: () => {}, documentElement: {} };

const { normalizeSaveData } = await import('../prototype/js/save.js');

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
    storage: [{ itemId: 'potion', qty: 3 }],
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
assert.deepEqual(normalized.inventory[1], { itemId: 'potion', qty: 3 });
assert.equal(normalized.characters.get('xiaochu').xp, 29);
assert.equal(normalized.characters.get('xiaochu').lineLevels.atk, 100);
assert.equal(normalized.characters.get('xiaochu').lineLevels.skill0, 4);
assert.equal(normalized.characters.get('xiaochu').activeItemId, 'powerCharm');
assert.equal(normalized.ownedSkins.has('fake_skin'), false);
assert.equal(normalized.equippedSkinByCharacter.xiaochu, 'xiaochu_default');

assert.throws(() => normalizeSaveData({ version: 1 }), /不支援的存檔格式/);
assert.deepEqual(normalized.journalReading, { chapterId: 'shapeshifter', pages: {} });
assert.equal(normalized.agentKillCount, 0);
const migrated = normalizeSaveData({ format: 'resonance-tower-save', version: 1, progression: { chapter1State: 'complete', agentKillCount: 23, resonanceState: { xiaochu: 'goHome' } } });
assert.equal(migrated.agentKillCount, 23);
assert.equal(migrated.resonanceState.xiaochu, 'following');
const reading = progression => normalizeSaveData({ format: 'resonance-tower-save', version: 1, progression }).journalReading;
assert.deepEqual(reading({ journalReading: { chapterId: 'shapeshifter', pages: { shapeshifter: 2 } } }), { chapterId: 'shapeshifter', pages: { shapeshifter: 2 } });
assert.deepEqual(reading({ journalReading: { chapterId: 'unknown', pages: { shapeshifter: 999, unknown: 4 } } }), { chapterId: 'shapeshifter', pages: { shapeshifter: 3 } });
console.log('save.test.js: all assertions passed');
const storySave = (state, chapter) => normalizeSaveData({ format: 'resonance-tower-save', version: 1, progression: {
  chapter1State: 'complete', resonanceState: { xiaochu: state }, xiaochuStoryChapter: chapter,
} });
for (const chapter of [0, 1, 2]) assert.equal(storySave('following', chapter).xiaochuStoryChapter, chapter);
assert.equal(storySave('oathReady', 3).resonanceState.xiaochu, 'oathReady');
assert.equal(storySave('oathReady', 3).xiaochuStoryChapter, 3);
assert.equal(storySave('contracting', 3).resonanceState.xiaochu, 'oathReady');
assert.equal(storySave('oathReady', undefined).resonanceState.xiaochu, 'following');
assert.equal(storySave('following', 99).xiaochuStoryChapter, 0);
assert.equal(storySave('contracted', undefined).xiaochuStoryChapter, 4);
