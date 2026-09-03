// combat.js only mutates state and queues one-shot effects via
// emitCombatEvent() (combat-events.js) - it never touches the DOM. These
// tests exercise that path directly, headless, with no document/UI stubs
// beyond the bare minimum combat.js's non-UI helpers still need.
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
  for (const file of ['prototype/js/constants.js', 'prototype/js/state.js', 'prototype/js/combat-events.js', 'prototype/js/combat.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
  vm.runInContext(`
    clearGooArena = () => {};
    addInventoryItem = () => {};
    setTimeout = () => {}; // the death-transition timeout isn't under test here
    t = key => key;
  `, context);
  return context;
}

// tickCharacters(): a normal attack (every skill on cooldown) against a
// monster queues popup+flash events targeting that monster, with zero DOM.
{
  const context = freshContext();
  vm.runInContext(`
    phase = PHASES.COMBAT;
    roster = [{
      id: 'wuming', level: 1, xp: 0, alive: true, skillCds: [999999, 999999, 999999],
      manualActionCd: 0, actionCountdown: 0, hasteMult: 1, hasteUntil: 0, dodgeUntil: 0,
      slowMult: 1, slowUntil: 0, sleepUntilAction: false, charmedUntilAction: false,
      loadout: { activeItemId: null }, lineLevels: {},
    }];
    party = ['wuming'];
    recomputeStats(roster[0]);
    roster[0].curHp = roster[0].maxHp;
    monsters = [{ id: 'm1', name: '生氣史萊姆', isBoss: false, alive: true, hp: 999, maxHp: 999, atk: 1, atkInterval: 1000, actionCountdown: 1000, skillCd: 0, skill: { name: 'x', target: 'randomParty', cd: 1, effects: [] } }];
    tickCharacters(activeAliveMembers());
    globalThis.__events = drainCombatEvents();
  `, context);
  const types = context.__events.map(e => e.type);
  assert.ok(types.includes('popup'), 'a normal attack should queue a popup event');
  assert.ok(types.includes('flash'), 'a normal attack should queue a flash event');
  const popupEvent = context.__events.find(e => e.type === 'popup');
  assert.equal(popupEvent.targetKind, 'monster');
  assert.equal(popupEvent.targetId, 'm1');
}

// onMonsterDefeated(): defeating a mob queues a monsterDefeated event
// carrying its id/maxHp, needed to zero its HP bar without touching the DOM.
{
  const context = freshContext();
  vm.runInContext(`
    phase = PHASES.COMBAT;
    floor = 1;
    roster = [];
    party = [];
    monsters = [{ id: 'm2', isBoss: false, isSummoned: false, alive: true, hp: 0, maxHp: 15 }];
    onMonsterDefeated(monsters[0]);
    globalThis.__events = drainCombatEvents();
  `, context);
  const defeated = context.__events.find(e => e.type === 'monsterDefeated');
  assert.ok(defeated, 'onMonsterDefeated() should queue a monsterDefeated event');
  assert.equal(defeated.monsterId, 'm2');
  assert.equal(defeated.maxHp, 15);
}

// spawnWave(): starting a new wave queues waveSpawned instead of building
// monster card DOM directly.
{
  const context = freshContext();
  vm.runInContext(`
    floor = 1;
    mobsCleared = 0;
    spawnWave();
    globalThis.__events = drainCombatEvents();
    globalThis.__monsterCount = monsters.length;
  `, context);
  assert.ok(context.__events.some(e => e.type === 'waveSpawned'), 'spawnWave() should queue a waveSpawned event');
  assert.ok(context.__monsterCount >= 2 && context.__monsterCount <= 3, 'a mob wave should spawn 2-3 monsters');
}

console.log('combat-events.test.js: all assertions passed');
