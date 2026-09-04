import { MASTER_TICK_MS } from './constants.js';
import { gameState, PHASES, initGame } from './state.js';
import { initI18n } from './i18n.js';
import { render, buildUI } from './ui-main.js';
import { renderJournalPage, runContractPreviewFromUrl } from './story.js';
import { renderInventory } from './ui-commerce.js';
import { initDebugTools } from './debug.js';
import { initSaveSystem } from './save.js';
import { flushCombat } from './ui-combat-effects.js';
import { tick } from './combat.js';
import { hasPendingCombatEvents } from './combat-events.js';
import { bindEventUI } from './events.js';
import { debugState } from './debug.js';

// Game surface: suppress the browser context menu so right-clicks during
// dragging/combat interaction do not interrupt play.
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('localechange', () => {
  render();
  if (gameState.activeOverlay === 'journal') renderJournalPage();
  if (gameState.activeOverlay === 'inventory') renderInventory();
});

initI18n();
initGame();
buildUI();
bindEventUI();
initDebugTools();
initSaveSystem();
flushCombat(); // debug ?view= params can have already queued combat events (e.g. a forced boss fight)
runContractPreviewFromUrl();
// combat.js never renders itself (see its file header) - flush whenever the
// battle tick actually ran, or whenever an async death-transition timeout
// queued an event while phase had already moved off COMBAT (e.g. victory).
// A recursive setTimeout (not setInterval) so the delay can react to
// debugState.speedMultiplier changing between runs - every cooldown in
// combat.js decrements by the fixed MASTER_TICK_MS per tick regardless of
// real elapsed time, so calling tick() more often is enough to speed up the
// whole simulation for testing without touching any combat.js logic.
function scheduleTick() {
  setTimeout(() => {
    tick();
    if (gameState.phase === PHASES.COMBAT || hasPendingCombatEvents()) flushCombat();
    scheduleTick();
  }, MASTER_TICK_MS / debugState.speedMultiplier);
}
scheduleTick();
