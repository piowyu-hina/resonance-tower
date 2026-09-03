// build the static DOM once; render() only ever mutates values afterwards
// so popups/flash animations in flight never get wiped mid-way.

// --- visual juice: floating numbers + hit flash, independent of render() ---
// Registry of how to close each overlay by id, kept next to `activeOverlay`
// (state.js) so there is exactly one place that knows how to tear each one
// down - shop goes through leaveShop() for its log line/shopMode reset, the
// rest just hide their DOM node and clear activeOverlay.
const OVERLAY_CLOSERS = {
  shop: () => leaveShop(false),
  inventory: () => setInventoryOpen(false),
  combatItemPicker: () => setCombatItemPickerOpen(false),
  charmPicker: () => setCharmPickerOpen(false),
  characterDetail: () => setCharacterDetailOpen(false),
  dialogue: () => closeDialogue(),
  journal: () => closeTravelJournal(false),
  contract: () => closeContractPanel(),
};

// The preparation phase is a small location hub: village is the outer layer,
// while character/loadout management lives inside the home location.
let prepLocation = 'village';
let homeMode = 'menu';
let homeEls = {};
let lastRenderedSurface = null;
let defeatRestartTimer = null;
let defeatRestartDeadline = 0;

// Call before opening `nextId`: enforces "only one overlay/popover open at a
// time" so callers never have to manually juggle every other overlay's flag.
function closeOtherOverlays(nextId) {
  if (activeOverlay && activeOverlay !== nextId) OVERLAY_CLOSERS[activeOverlay]();
}

function animateSurfaceChange(surface, key) {
  if (!surface || key === lastRenderedSurface) return;
  lastRenderedSurface = key;
  playTransientAnimation(surface, 'surfaceEntering');
}

function renderRunResultSummary(targetId, gold) {
  const rewards = [];
  if (gold > 0) {
    const coin = localizedItemDef('coin');
    rewards.push({ name: coin.name, img: coin.img, qty: gold });
  }

  Object.entries(runItemGains).forEach(([itemId, qty]) => {
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

function showDefeatOverlay() {
  if (activeOverlay && OVERLAY_CLOSERS[activeOverlay]) OVERLAY_CLOSERS[activeOverlay]();
  renderRunResultSummary('defeatSummary', runGold);
  const overlay = document.getElementById('defeatOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  clearDefeatRestartTimer();
  defeatRestartDeadline = Date.now() + DEFEAT_RESTART_DELAY_MS;
  updateDefeatRestartCountdown();
  defeatRestartTimer = setInterval(updateDefeatRestartCountdown, 250);
}

function clearDefeatRestartTimer() {
  if (defeatRestartTimer !== null) clearInterval(defeatRestartTimer);
  defeatRestartTimer = null;
  defeatRestartDeadline = 0;
}

function updateDefeatRestartCountdown() {
  const seconds = Math.max(0, Math.ceil((defeatRestartDeadline - Date.now()) / 1000));
  document.getElementById('defeatRestartCountdown').textContent = t('result.autoRestartIn', {
    seconds: formatLocaleNumber(seconds),
  });
  if (seconds <= 0) restartAfterDefeat();
}

function settleDefeat() {
  clearDefeatRestartTimer();
  const overlay = document.getElementById('defeatOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  log('重新整備完成。本次取得的金幣與物品全部保留。', 'good');
  endRun();
}

function returnToVillageAfterDefeat() {
  settleDefeat();
  render();
}

function restartAfterDefeat() {
  if (phase !== PHASES.DEFEAT) return;
  settleDefeat();
  if (contractStoryLocked() || party.length === 0) {
    render();
    return;
  }
  prepLocation = 'expedition';
  render();
  showDungeonEntry(prepareDungeonCombat, activatePreparedCombat);
}

function showVictoryOverlay(securedGold) {
  renderRunResultSummary('victorySummary', securedGold);
  const overlay = document.getElementById('victoryOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

function confirmVictory() {
  const overlay = document.getElementById('victoryOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  endRun();
  render();
}

function showBossIntro(onComplete) {
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

function showDungeonEntry(onCovered, onComplete = null) {
  const overlay = document.getElementById('dungeonEntryOverlay');
  if (overlay.classList.contains('open') && !overlay.classList.contains('finished')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onCovered();
    if (onComplete) onComplete();
    return;
  }

  const region = localizedRegionDef(floor);
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

function prepareCombat(entryPhase) {
  partyLocked = true;
  setPhase(entryPhase);
  buildBattleRoster();
  spawnWave();
  party.forEach(id => {
    const c = roster.find(r => r.id === id);
    c.actionCountdown = CHAR_DEFS[id].atkInterval * speedLineIntervalMult(c);
  });
  render();
}

function prepareDungeonCombat() {
  prepareCombat(PHASES.DUNGEON_INTRO);
}

function prepareBossCombat() {
  prepareCombat(PHASES.BOSS_INTRO);
}

function activatePreparedCombat() {
  setPhase(PHASES.COMBAT);
  render();
}

function popup(portraitEl, text, cls) {
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
function showSkillCastEffect(portraitEl, skill) {
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

function flash(portraitEl) {
  if (!portraitEl) return;
  playTransientAnimation(portraitEl, 'hitFlash');
}

// --- hover tooltip: character/monster detailed stats ---
