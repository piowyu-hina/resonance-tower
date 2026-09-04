import { localizedItemDef, DEFEAT_RESTART_DELAY_MS, CHAR_DEFS, localizedRegionDef } from './constants.js';
import { gameState, PHASES, log, contractStoryLocked, setPhase, speedLineIntervalMult } from './state.js';
import { t, formatLocaleNumber } from './i18n.js';
import { playTransientAnimation, beginManagedTransition, afterAnimationPaint, removeAfterAnimation } from './transitions.js';
import { leaveShop } from './shop.js';
import { setCombatItemPickerOpen, setCharmPickerOpen } from './ui-loadout.js';
import { setInventoryOpen } from './ui-commerce.js';
import { setCharacterDetailOpen } from './ui-character.js';
import { closeDialogue, closeTravelJournal, closeContractPanel } from './story.js';
import { endRun, spawnWave } from './combat.js';
import { render, buildBattleRoster } from './ui-main.js';
import { flushCombat } from './ui-combat-effects.js';
import { skipActiveEvent } from './events.js';

// build the static DOM once; render() only ever mutates values afterwards
// so popups/flash animations in flight never get wiped mid-way.

// --- visual juice: floating numbers + hit flash, independent of render() ---
// Registry of how to close each overlay by id, kept next to `activeOverlay`
// (state.js's gameState) so there is exactly one place that knows how to tear
// each one down - shop goes through leaveShop() for its log line/shopMode
// reset, the rest just hide their DOM node and clear activeOverlay.
export const OVERLAY_CLOSERS = {
  shop: () => leaveShop(false),
  inventory: () => setInventoryOpen(false),
  combatItemPicker: () => setCombatItemPickerOpen(false),
  charmPicker: () => setCharmPickerOpen(false),
  characterDetail: () => setCharacterDetailOpen(false),
  dialogue: () => closeDialogue(),
  journal: () => closeTravelJournal(false),
  contract: () => closeContractPanel(),
  event: () => skipActiveEvent('skip'),
};

// The preparation phase is a small location hub: village is the outer layer,
// while character/loadout management lives inside the home location.
export const overlayUiState = {
  prepLocation: 'village',
  homeMode: 'menu',
  homeEls: {},
  lastRenderedSurface: null,
  defeatRestartTimer: null,
  defeatRestartDeadline: 0,
};

// Call before opening `nextId`: enforces "only one overlay/popover open at a
// time" so callers never have to manually juggle every other overlay's flag.
export function closeOtherOverlays(nextId) {
  if (gameState.activeOverlay && gameState.activeOverlay !== nextId) OVERLAY_CLOSERS[gameState.activeOverlay]();
}

export function animateSurfaceChange(surface, key) {
  if (!surface || key === overlayUiState.lastRenderedSurface) return;
  overlayUiState.lastRenderedSurface = key;
  playTransientAnimation(surface, 'surfaceEntering');
}

export function renderRunResultSummary(targetId, gold) {
  const rewards = [];
  if (gold > 0) {
    const coin = localizedItemDef('coin');
    rewards.push({ name: coin.name, img: coin.img, qty: gold });
  }

  Object.entries(gameState.runItemGains).forEach(([itemId, qty]) => {
    const item = localizedItemDef(itemId);
    if (!item || itemId === 'coin' || qty <= 0) return;
    rewards.push({ name: item.name, img: item.img, qty });
  });

  const summary = document.getElementById(targetId);
  if (!rewards.length) {
    summary.innerHTML = `<div class="runResultEmpty">${t('result.empty')}</div>`;
    return;
  }

  summary.innerHTML = rewards.map(reward => `
    <div class="runResultItem">
      <img src="assets/item/${reward.img}.png" alt="">
      <span>${reward.name}</span>
      <b>×${formatLocaleNumber(reward.qty)}</b>
    </div>
  `).join('');
}

export function showDefeatOverlay() {
  if (gameState.activeOverlay && OVERLAY_CLOSERS[gameState.activeOverlay]) OVERLAY_CLOSERS[gameState.activeOverlay]();
  renderRunResultSummary('defeatSummary', gameState.runGold);
  const overlay = document.getElementById('defeatOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  clearDefeatRestartTimer();
  overlayUiState.defeatRestartDeadline = Date.now() + DEFEAT_RESTART_DELAY_MS;
  updateDefeatRestartCountdown();
  overlayUiState.defeatRestartTimer = setInterval(updateDefeatRestartCountdown, 250);
}

export function clearDefeatRestartTimer() {
  if (overlayUiState.defeatRestartTimer !== null) clearInterval(overlayUiState.defeatRestartTimer);
  overlayUiState.defeatRestartTimer = null;
  overlayUiState.defeatRestartDeadline = 0;
}

export function updateDefeatRestartCountdown() {
  const seconds = Math.max(0, Math.ceil((overlayUiState.defeatRestartDeadline - Date.now()) / 1000));
  document.getElementById('defeatRestartCountdown').textContent = t('result.autoRestartIn', {
    seconds: formatLocaleNumber(seconds),
  });
  if (seconds <= 0) restartAfterDefeat();
}

export function settleDefeat() {
  clearDefeatRestartTimer();
  const overlay = document.getElementById('defeatOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  log('重新整備完成。本次取得的金幣與物品全部保留。', 'good');
  endRun();
}

export function returnToVillageAfterDefeat() {
  settleDefeat();
  render();
}

export function restartAfterDefeat() {
  if (gameState.phase !== PHASES.DEFEAT) return;
  settleDefeat();
  if (contractStoryLocked() || gameState.party.length === 0) {
    render();
    return;
  }
  overlayUiState.prepLocation = 'expedition';
  render();
  showDungeonEntry(prepareDungeonCombat, activatePreparedCombat);
}

export function showVictoryOverlay(securedGold) {
  renderRunResultSummary('victorySummary', securedGold);
  const overlay = document.getElementById('victoryOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

export function confirmVictory() {
  const overlay = document.getElementById('victoryOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  endRun();
  render();
}

export function showBossIntro(onComplete) {
  const overlay = document.getElementById('bossIntroOverlay');
  if (overlay.classList.contains('open')) return;
  const transition = beginManagedTransition('bossIntro');
  const finish = () => {
    transition.finish(() => {
      overlay.classList.remove('open', 'leaving');
      overlay.setAttribute('aria-hidden', 'true');
      onComplete();
    });
  };
  transition.listen(overlay, 'animationend', event => {
    if (event.target === overlay && event.animationName === 'bossIntroLeave') {
      afterAnimationPaint(finish);
    }
  });
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  transition.after(4800, () => overlay.classList.add('leaving'));
  transition.after(5600, finish);
}

export function showDungeonEntry(onCovered, onComplete = null) {
  const overlay = document.getElementById('dungeonEntryOverlay');
  if (overlay.classList.contains('open') && !overlay.classList.contains('finished')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onCovered();
    if (onComplete) onComplete();
    return;
  }

  const region = localizedRegionDef(gameState.floor);
  const art = document.getElementById('dungeonEntryArt');
  art.src = `assets/ui/${region.image}.png`;
  art.alt = region.name;
  document.getElementById('dungeonEntryName').textContent = region.name;
  document.getElementById('dungeonEntryDescription').textContent = region.description;
  const transition = beginManagedTransition('dungeonEntry');
  const finish = () => {
    transition.finish(() => {
      // Keep the completed animation attached and hide it at opacity:0. Removing
      // the animation class here used to expose its pre-animation frame for one
      // compositor refresh, which read as a jump at the end of the curtain.
      overlay.classList.add('finished');
      overlay.setAttribute('aria-hidden', 'true');
      if (onComplete) onComplete();
    });
  };
  transition.listen(overlay, 'animationend', event => {
    if (event.target === overlay && event.animationName === 'dungeonEntryCurtain') {
      afterAnimationPaint(finish);
    }
  });
  overlay.classList.remove('open', 'finished');
  void overlay.offsetWidth;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');

  // Rebuild the combat surface while the curtain is fully opaque. It remains
  // paused in dungeonIntro, and is only activated after the curtain is gone.
  transition.after(560, onCovered);
  transition.after(2850, finish);
}

export function prepareCombat(entryPhase) {
  gameState.partyLocked = true;
  setPhase(entryPhase);
  buildBattleRoster();
  spawnWave();
  gameState.party.forEach(id => {
    const c = gameState.roster.find(r => r.id === id);
    c.actionCountdown = CHAR_DEFS[id].atkInterval * speedLineIntervalMult(c);
  });
  flushCombat();
}

export function prepareDungeonCombat() {
  prepareCombat(PHASES.DUNGEON_INTRO);
}

export function prepareBossCombat() {
  prepareCombat(PHASES.BOSS_INTRO);
}

export function activatePreparedCombat() {
  setPhase(PHASES.COMBAT);
  render();
}

export function popup(portraitEl, text, cls) {
  if (!portraitEl) return;
  const span = document.createElement('div');
  span.className = 'popup ' + cls;
  span.textContent = text;
  portraitEl.appendChild(span);
  removeAfterAnimation(span, 1050);
}

// skill-cast flourish: briefly shows the skill's own icon fading over the
// caster's portrait, so casting a skill reads visually distinct from a
// plain auto-attack even before the damage/heal number lands.
export function showSkillCastEffect(portraitEl, skill) {
  if (!portraitEl) return;
  const el = document.createElement('div');
  el.className = 'castIcon';
  el.innerHTML = `
    <img src="assets/skills/${skill.img}.png" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
    <span class="fallback">${skill.icon}</span>
  `;
  portraitEl.appendChild(el);
  removeAfterAnimation(el, 850);
}

export function flash(portraitEl) {
  if (!portraitEl) return;
  playTransientAnimation(portraitEl, 'hitFlash');
}
