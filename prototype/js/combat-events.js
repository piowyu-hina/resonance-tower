// Combat event queue: combat.js pushes one-shot "this just happened" events
// here instead of calling popup/flash/DOM functions directly. This keeps
// combat.js testable headless (see tests/combat-events.test.js) - it only
// ever mutates game state and queues events, never touches the DOM itself.
// ui-combat-effects.js drains and plays them back onto real DOM elements.
let combatEventQueue = [];

function emitCombatEvent(event) {
  combatEventQueue.push(event);
}

function drainCombatEvents() {
  const events = combatEventQueue;
  combatEventQueue = [];
  return events;
}
