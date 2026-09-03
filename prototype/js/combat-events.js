// Combat event queue: combat.js pushes one-shot "this just happened" events
// here instead of calling popup/flash/DOM functions directly. This keeps
// combat.js testable headless (see tests/combat-events.test.js) - it only
// ever mutates game state and queues events, never touches the DOM itself.
// ui-combat-effects.js drains and plays them back onto real DOM elements.
let combatEventQueue = [];

export function emitCombatEvent(event) {
  combatEventQueue.push(event);
}

export function drainCombatEvents() {
  const events = combatEventQueue;
  combatEventQueue = [];
  return events;
}

// Used by main.js's tick loop to decide whether to flush outside of
// PHASES.COMBAT - an async death-transition timeout (combat.js) can queue an
// event after phase has already moved on (e.g. victory), and that still
// needs to be drained even though the ambient loop's usual COMBAT-phase
// condition no longer holds.
export function hasPendingCombatEvents() {
  return combatEventQueue.length > 0;
}
