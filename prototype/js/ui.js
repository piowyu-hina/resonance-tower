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
  surface.classList.remove('surfaceEntering');
  void surface.offsetWidth;
  surface.classList.add('surfaceEntering');
}

function renderRunResultSummary(targetId, gold) {
  const rewards = [];
  if (gold > 0) {
    const coin = localizedItemDef('coin');
    rewards.push({ name: coin.name, img: coin.img, qty: gold });
  }

  Object.entries(runInventoryGains).forEach(([itemId, qty]) => {
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
  log('遠征失敗。本次遠征取得的金幣與戰利品已遺失。', 'warn');
  endRun(false);
}

function returnToVillageAfterDefeat() {
  settleDefeat();
  render();
}

function restartAfterDefeat() {
  if (phase !== 'defeat') return;
  settleDefeat();
  if (contractStoryLocked() || party.length === 0) {
    render();
    return;
  }
  prepLocation = 'expedition';
  render();
  showDungeonEntry(beginExpeditionCombat);
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
  endRun(true);
  render();
}

function showBossIntro(onComplete) {
  const overlay = document.getElementById('bossIntroOverlay');
  if (overlay.classList.contains('open')) return;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  setTimeout(() => overlay.classList.add('leaving'), 4800);
  setTimeout(() => {
    overlay.classList.remove('open', 'leaving');
    overlay.setAttribute('aria-hidden', 'true');
    onComplete();
  }, 5400);
}

function showDungeonEntry(onCovered) {
  const overlay = document.getElementById('dungeonEntryOverlay');
  if (overlay.classList.contains('open')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onCovered();
    return;
  }

  const region = localizedRegionDef(floor);
  const art = document.getElementById('dungeonEntryArt');
  art.src = `assets/ui/${region.image}.png`;
  art.alt = region.name;
  document.getElementById('dungeonEntryName').textContent = region.name;
  document.getElementById('dungeonEntryDescription').textContent = region.description;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');

  setTimeout(onCovered, 1550);
  setTimeout(() => {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }, 2100);
}

function beginExpeditionCombat() {
  partyLocked = true;
  phase = 'combat';
  buildBattleRoster();
  spawnWave();
  party.forEach(id => {
    const c = roster.find(r => r.id === id);
    c.actionCountdown = CHAR_DEFS[id].atkInterval * speedLineIntervalMult(c);
  });
  render();
}

function popup(portraitEl, text, cls) {
  if (!portraitEl) return;
  const span = document.createElement('div');
  span.className = 'popup ' + cls;
  span.textContent = text;
  portraitEl.appendChild(span);
  setTimeout(() => span.remove(), 900);
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
  setTimeout(() => el.remove(), 700);
}

function flash(portraitEl) {
  if (!portraitEl) return;
  clearTimeout(portraitEl.hitFlashTimer);
  portraitEl.classList.remove('hitFlash');
  void portraitEl.offsetWidth; // restart animation
  portraitEl.classList.add('hitFlash');
  portraitEl.hitFlashTimer = setTimeout(() => {
    portraitEl.classList.remove('hitFlash');
    portraitEl.hitFlashTimer = null;
  }, 380);
}

// --- hover tooltip: character/monster detailed stats ---
function charTooltipHTML(id) {
  const c = roster.find(r => r.id === id);
  const def = CHAR_DEFS[id];
  if (!c) return '';
  const effectiveDef = calcDef(c);
  const defText = effectiveDef === c.def ? String(c.def) : `${c.def}（目前 ${effectiveDef}）`;
  return `
    <div class="ttName">${def.name}　Lv.${c.level}</div>
    <div class="ttStat">HP ${Math.max(0, c.curHp)}/${c.maxHp}</div>
    <div class="ttStat">攻擊 ${c.atk}　防禦 ${defText}</div>
    <div class="ttStat">經驗 ${c.xp}/${xpToNext(c.level)}</div>
  `;
}

function skillTooltipHTML(skill) {
  return `
    <div class="ttName">${skill.name}</div>
    <div class="ttStat">冷卻：${skill.cd} 秒</div>
    <div class="ttStat">${skill.desc}</div>
  `;
}

function characterActionTooltipHTML(action) {
  return `
    <div class="ttName">${action.name}</div>
    <div class="ttStat">手動操作・冷卻 ${action.cooldown} 秒</div>
    <div class="ttStat">${action.desc}</div>
  `;
}

function attachCharacterActionTooltip(el, action) {
  el.addEventListener('mouseenter', e => showTooltipContent(characterActionTooltipHTML(action), e));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

function statusTooltipHTML(status, missingImage = false, remainingMs = 0) {
  return `
    <div class="ttName">${status.label}</div>
    <div class="ttStat">${status.desc}</div>
    ${remainingMs > 0 ? `<div class="ttStat">剩餘：${Math.ceil(remainingMs / 1000)} 秒</div>` : ''}
    ${missingImage ? '<div class="ttMissing">⚠ 缺少狀態圖示素材</div>' : ''}
  `;
}

function monsterTooltipHTML(m) {
  if (!m) return '';
  return `
    <div class="ttName">${m.name}　Lv.${m.level}</div>
    <div class="ttStat">HP ${Math.max(0, m.hp)}/${m.maxHp}</div>
    <div class="ttStat">攻擊 ${m.atk}</div>
  `;
}

function positionTooltip(e) {
  // Game-style cursor tooltip: keep the panel close enough to read as attached
  // to the pointer, with only a small gap so it never sits under the cursor.
  const verticalGap = 5;
  const horizontalGap = 9;
  const edge = 8;
  const width = tooltipEl.offsetWidth;
  const height = tooltipEl.offsetHeight;
  let x = e.clientX + horizontalGap;
  if (x + width > window.innerWidth - edge) x = e.clientX - width - horizontalGap;
  x = Math.max(edge, x);
  const y = Math.max(edge, e.clientY - height - verticalGap);
  tooltipEl.style.left = Math.round(x) + 'px';
  tooltipEl.style.top = Math.round(y) + 'px';
}

function showTooltipContent(html, e) {
  if (!html) return;
  tooltipEl.innerHTML = html;
  tooltipEl.style.display = 'block';
  positionTooltip(e);
}

function hideTooltip() {
  tooltipEl.style.display = 'none';
}

function attachTextTooltip(el, heading, detail) {
  const html = `<div class="ttName">${heading}</div>${detail ? `<div class="ttStat">${detail}</div>` : ''}`;
  el.addEventListener('mouseenter', event => showTooltipContent(html, event));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

function attachCharTooltip(el, id) {
  el.addEventListener('mouseenter', (e) => showTooltipContent(charTooltipHTML(id), e));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

function attachMonsterTooltip(el, m) {
  el.addEventListener('mouseenter', (e) => showTooltipContent(monsterTooltipHTML(m), e));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

function attachSkillTooltip(el, skill) {
  el.addEventListener('mouseenter', (e) => showTooltipContent(skillTooltipHTML(skill), e));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

function attachStatusTooltip(el, status, character) {
  el.addEventListener('mouseenter', e => {
    const missingImage = el.querySelector('.statusIcon').classList.contains('missing');
    const remainingMs = status.remaining ? status.remaining(character) : 0;
    showTooltipContent(statusTooltipHTML(status, missingImage, remainingMs), e);
  });
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

function itemTooltipHTML(item, entry) {
  return `
    <div class="ttName">${item.name}</div>
    <div class="ttStat">${t('tooltip.rarity', { rarity: item.rarity })}</div>
    ${entry ? `<div class="ttStat">${t('tooltip.owned', { quantity: formatLocaleNumber(entry.qty) })}</div>` : ''}
    ${entry && entry.unsecuredQty > 0 ? `<div class="ttStat ttUnsecured">${t('inventory.unsecuredHint', { quantity: formatLocaleNumber(entry.unsecuredQty) })}</div>` : ''}
    <div class="ttStat">${item.desc}</div>
  `;
}

function attachItemTooltip(el, item, entry) {
  el.addEventListener('mouseenter', e => showTooltipContent(itemTooltipHTML(item, entry), e));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

function attachCombatActionTooltip(el, getItemId) {
  el.addEventListener('mouseenter', e => {
    const itemId = getItemId();
    const item = localizedItemDef(itemId);
    const html = item
      ? itemTooltipHTML(item, { qty: inventoryItemCount(itemId) })
      : `<div class="ttName">${t('loadout.potionSlot')}</div><div class="ttStat">${t('loadout.emptyPotion')}</div>`;
    showTooltipContent(html, e);
  });
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

function attachActiveRelicTooltip(el, character) {
  el.addEventListener('mouseenter', e => {
    const item = localizedItemDef(character.loadout.activeItemId);
    const html = item
      ? itemTooltipHTML(item, null)
      : `<div class="ttName">${t('loadout.charmSlot')}</div><div class="ttStat">${t('loadout.emptyCharm')}</div>`;
    showTooltipContent(html, e);
  });
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

let inventoryDragFrom = null;

function inventoryItemCount(itemId) {
  return inventory.reduce((total, entry) => total + (entry && entry.itemId === itemId ? entry.qty : 0), 0);
}

function loadoutItemHTML(itemId, fallbackIcon, fallbackLabel) {
  const item = itemId && localizedItemDef(itemId);
  if (!item) return `<span class="quickFallback">${fallbackIcon}</span><span class="quickLabel">${fallbackLabel}</span>`;
  const qty = item.equipSlot === 'potion' ? inventoryItemCount(itemId) : null;
  return `
    <img src="assets/item/${item.img}.png" alt="${item.name}" draggable="false">
    <span class="quickLabel">${item.name}</span>
    ${qty === null ? '' : `<span class="quickQty">×${qty}</span>`}
  `;
}

function renderActiveRelicSlot(slot, character) {
  const itemId = character.loadout.activeItemId;
  slot.innerHTML = loadoutItemHTML(itemId, '◇', t('loadout.charmSlot'));
  slot.classList.toggle('equipped', !!itemId);
}

function renderCharmPicker(character) {
  const list = document.getElementById('charmPickerList');
  list.innerHTML = '';
  inventory.forEach(entry => {
    if (!entry) return;
    const item = localizedItemDef(entry.itemId);
    if (!item || item.equipSlot !== 'charm') return;
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `pickerItem${character.loadout.activeItemId === entry.itemId ? ' selected' : ''}`;
    option.innerHTML = `<img src="assets/item/${item.img}.png" alt="${item.name}"><span>${item.name}</span><b>×${entry.qty}</b>`;
    option.addEventListener('click', event => {
      event.stopPropagation();
      character.loadout.activeItemId = entry.itemId;
      setCharmPickerOpen(false);
      render();
    });
    attachItemTooltip(option, item, entry);
    list.appendChild(option);
  });
  const empty = document.createElement('button');
  empty.type = 'button';
  empty.className = 'pickerItem unequip';
  empty.innerHTML = `<span class="pickerEmptyIcon">◇</span><span>${t('picker.noneCharm')}</span>`;
  empty.addEventListener('click', event => {
    event.stopPropagation();
    character.loadout.activeItemId = null;
    setCharmPickerOpen(false);
    render();
  });
  list.appendChild(empty);
}

// Keep compact loadout menus visually attached to the game surface. Using the
// viewport alone let them hang below #app on roomy desktop screens, which made
// them look detached even though they were technically still on-screen.
function positionPickerNearAnchor(picker, anchor) {
  const anchorRect = anchor.getBoundingClientRect();
  const pickerRect = picker.getBoundingClientRect();
  const appRect = document.getElementById('app')?.getBoundingClientRect();
  const leftEdge = Math.max(8, appRect ? appRect.left + 8 : 8);
  const rightEdge = Math.min(window.innerWidth - 8, appRect ? appRect.right - 8 : window.innerWidth - 8);
  const topEdge = Math.max(8, appRect ? appRect.top + 8 : 8);
  const bottomEdge = Math.min(window.innerHeight - 8, appRect ? appRect.bottom - 8 : window.innerHeight - 8);
  const left = Math.max(leftEdge, Math.min(anchorRect.left, rightEdge - pickerRect.width));
  const below = anchorRect.bottom + 7;
  const above = anchorRect.top - pickerRect.height - 7;
  const top = below + pickerRect.height <= bottomEdge ? below : Math.max(topEdge, above);
  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
}

function setCharmPickerOpen(open, anchor = null, character = null) {
  if (open) closeOtherOverlays('charmPicker');
  activeOverlay = open ? 'charmPicker' : (activeOverlay === 'charmPicker' ? null : activeOverlay);
  const picker = document.getElementById('charmPicker');
  picker.classList.toggle('open', open);
  picker.setAttribute('aria-hidden', String(!open));
  hideTooltip();
  if (!open || !anchor || !character) return;
  renderCharmPicker(character);
  positionPickerNearAnchor(picker, anchor);
}

function renderExpeditionSelectedSummary() {
  const summary = document.getElementById('expeditionSelectedSummary');
  if (!summary) return;
  const character = roster.find(member => party.includes(member.id));
  if (!character) {
    summary.innerHTML = `<div class="expeditionEmptySelection">${t('loadout.notSelected')}</div>`;
    return;
  }
  const def = CHAR_DEFS[character.id];
  const bossIdentity = phase === 'prepBoss' ? `
    <div class="expeditionSelectedIdentity bossSelectedIdentity">
      <img src="${characterPortraitPath(character.id)}" alt="${def.name}">
      <div><small>${t(character.id === 'wuming' ? 'loadout.currentDeployment' : 'loadout.currentPossession')}</small><b>${def.name}</b><span>${t('format.level', { level: formatLocaleNumber(character.level) })}</span></div>
    </div>` : '';
  summary.innerHTML = `
    ${bossIdentity}
    <div class="expeditionLoadoutBlock">
      <div class="expeditionStepLabel"><span>3</span>${t('loadout.equipment')}</div>
      <div class="expeditionLoadout">
        <div><small>${t('loadout.potion')}</small><div class="quickSlot combatItemQuickSlot" role="button" tabindex="0"></div></div>
        <div><small>${t('loadout.charm')}</small><div class="quickSlot activeQuickSlot"></div></div>
      </div>
    </div>`;
  const combatSlot = summary.querySelector('.combatItemQuickSlot');
  combatSlot.innerHTML = loadoutItemHTML(equippedCombatItemId, '＋', t('picker.potion'));
  combatSlot.classList.toggle('equipped', !!equippedCombatItemId);
  combatSlot.classList.toggle('locked', phase === 'combat');
  attachCombatActionTooltip(combatSlot, () => equippedCombatItemId);
  const openPicker = event => {
    event.stopPropagation();
    if (phase !== 'prepFloor' && phase !== 'prepBoss') return;
    if (activeOverlay === 'combatItemPicker') {
      setCombatItemPickerOpen(false);
      return;
    }
    setCombatItemPickerOpen(true, combatSlot);
  };
  combatSlot.addEventListener('click', openPicker);
  combatSlot.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openPicker(event);
  });
  const activeSlot = summary.querySelector('.activeQuickSlot');
  renderActiveRelicSlot(activeSlot, character);
  attachActiveRelicTooltip(activeSlot, character);
  activeSlot.setAttribute('role', 'button');
  activeSlot.tabIndex = 0;
  const openCharmPicker = event => {
    event.stopPropagation();
    if (phase !== 'prepFloor' && phase !== 'prepBoss') return;
    if (activeOverlay === 'charmPicker') {
      setCharmPickerOpen(false);
      return;
    }
    setCharmPickerOpen(true, activeSlot, character);
  };
  activeSlot.addEventListener('click', openCharmPicker);
  activeSlot.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openCharmPicker(event);
  });
}

function renderCombatItemPicker() {
  const list = document.getElementById('combatItemPickerList');
  list.innerHTML = '';
  Object.keys(ITEM_DEFS).forEach(itemId => {
    const item = localizedItemDef(itemId);
    if (!item.combatAction) return;
    const qty = inventoryItemCount(itemId);
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `pickerItem${equippedCombatItemId === itemId ? ' selected' : ''}${qty <= 0 ? ' unavailable' : ''}`;
    option.innerHTML = `
      <img src="assets/item/${item.img}.png" alt="${item.name}">
      <span>${item.name}</span>
      <b>×${qty}</b>
    `;
    option.addEventListener('click', event => {
      event.stopPropagation();
      if (qty <= 0) return;
      equippedCombatItemId = itemId;
      setCombatItemPickerOpen(false);
      render();
    });
    attachItemTooltip(option, item, { qty });
    list.appendChild(option);
  });

  const emptyOption = document.createElement('button');
  emptyOption.type = 'button';
  emptyOption.className = 'pickerItem unequip';
  emptyOption.innerHTML = `<span class="pickerEmptyIcon">◇</span><span>${t('picker.nonePotion')}</span>`;
  emptyOption.addEventListener('click', event => {
    event.stopPropagation();
    equippedCombatItemId = null;
    setCombatItemPickerOpen(false);
    render();
  });
  list.appendChild(emptyOption);
}

function setCombatItemPickerOpen(open, anchor = null) {
  if (open) closeOtherOverlays('combatItemPicker');
  activeOverlay = open ? 'combatItemPicker' : (activeOverlay === 'combatItemPicker' ? null : activeOverlay);
  const picker = document.getElementById('combatItemPicker');
  picker.classList.toggle('open', open);
  picker.setAttribute('aria-hidden', String(!open));
  hideTooltip();
  if (!open || !anchor) return;
  renderCombatItemPicker();
  positionPickerNearAnchor(picker, anchor);
}

function setCharacterDetailOpen(open, characterId = null) {
  if (open) closeOtherOverlays('characterDetail');
  activeOverlay = open ? 'characterDetail' : (activeOverlay === 'characterDetail' ? null : activeOverlay);
  const overlay = document.getElementById('characterDetailOverlay');
  overlay.classList.toggle('open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  hideTooltip();
  if (!open) return;
  if (!characterId) return;
  renderCharacterDetail(characterId);
}

function attachCharacterCardPress(card, characterId) {
  const holdMs = 450;
  const moveTolerance = 8;
  let timer = null;
  let longPressed = false;
  let startX = 0;
  let startY = 0;
  let holdIndicator = null;

  const removeIndicator = () => {
    if (holdIndicator) holdIndicator.remove();
    holdIndicator = null;
  };

  const cancelTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    card.classList.remove('holding');
    removeIndicator();
  };

  card.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('.quickSlot')) return;
    longPressed = false;
    startX = event.clientX;
    startY = event.clientY;
    card.setPointerCapture(event.pointerId);
    const rect = card.getBoundingClientRect();
    holdIndicator = document.createElement('span');
    holdIndicator.className = 'holdIndicator';
    holdIndicator.style.left = `${event.clientX - rect.left}px`;
    holdIndicator.style.top = `${event.clientY - rect.top}px`;
    holdIndicator.innerHTML = `
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle class="holdTrack" cx="18" cy="18" r="14"></circle>
        <circle class="holdProgress" cx="18" cy="18" r="14"></circle>
      </svg>
    `;
    card.appendChild(holdIndicator);
    card.classList.add('holding');
    timer = setTimeout(() => {
      timer = null;
      longPressed = true;
      card.classList.remove('holding');
      removeIndicator();
      setCharacterDetailOpen(true, characterId);
    }, holdMs);
  });
  card.addEventListener('pointermove', event => {
    if (timer === null) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > moveTolerance) cancelTimer();
  });
  card.addEventListener('pointerup', cancelTimer);
  card.addEventListener('pointercancel', cancelTimer);
  card.addEventListener('pointerleave', cancelTimer);
  card.addEventListener('click', event => {
    if (event.target.closest('.quickSlot')) return;
    if (longPressed) {
      event.preventDefault();
      event.stopPropagation();
      longPressed = false;
      return;
    }
    toggleParty(characterId);
  });
}

// small "Lv N" badge shown directly on a stat tile / skill icon, instead of
// a separate row list - see design.md 經驗書／技能點強化 (UI redesign note).
function lineBadgeHTML(c, lineKey) {
  return `<span class="lineBadge" data-line="${lineKey}">${lineLevel(c, lineKey)}</span>`;
}

// press = 1 level, holding repeats `tick()` until released/it returns false.
// `tick` should perform one level-up attempt and return whether to continue.
function attachHoldRepeat(el, tick, onStop) {
  const REPEAT_MS = 90;
  let timer = null;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
    if (onStop) onStop();
  };
  const step = () => { if (!tick()) stop(); };
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    step();
    if (!timer) timer = setInterval(step, REPEAT_MS);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => el.addEventListener(evt, stop));
}

let selectedGrowthLine = 'atk';

function growthLineMeta(characterId, lineKey) {
  const def = CHAR_DEFS[characterId];
  const general = GENERAL_STAT_LINES.find(line => line.key === lineKey);
  if (general) return { name: general.label, icon: lineKey === 'atk' ? '⚔' : lineKey === 'def' ? '◈' : '⌛', kind: '基礎能力' };
  if (lineKey === 'action') return { name: def.action.name, img: `assets/skills/${def.action.img}.png`, kind: '專屬操作' };
  const skill = def.skills[Number(lineKey.replace('skill', ''))];
  return { name: skill.name, img: `assets/skills/${skill.img}.png`, kind: '自動技能' };
}

// 1 decimal place everywhere (not Math.round) so 目前→下一級 visibly moves
// even between adjacent low levels, instead of both sides showing the same
// rounded integer and reading as "did this even do anything?".
function growthLineValue(c, lineKey, level) {
  const def = CHAR_DEFS[c.id];
  const scale = 1 + level / STAT_LINE_MAX;
  if (lineKey === 'atk') return `${(c.atk * scale).toFixed(1)} 攻擊力`;
  if (lineKey === 'def') return `${(c.def * scale).toFixed(1)} 防禦力`;
  if (lineKey === 'speed') return `${(def.atkInterval * (1 - 0.5 * level / STAT_LINE_MAX) / 1000).toFixed(2)} 秒`;
  if (lineKey === 'action') {
    const cooldownText = `${(def.action.cooldown * (1 - 0.5 * level / STAT_LINE_MAX)).toFixed(1)} 秒冷卻`;
    // most actions (e.g. 無名 randomSkill) have no magnitude of their own to
    // scale - only cooldown moves. Actions that do (like 小初 selfBuffAtkDef)
    // show their scaled magnitude alongside it, same as a skill line would.
    if (def.action.type === 'selfBuffAtkDef') {
      return `${cooldownText} · +${(def.action.atkPct * scale * 100).toFixed(1)}% 攻擊 / +${(def.action.defAmount * scale).toFixed(1)} 防禦`;
    }
    return cooldownText;
  }
  const skill = def.skills[Number(lineKey.replace('skill', ''))];
  if (skill.type === 'damage') return `${(skill.mult * scale).toFixed(2)} 倍傷害`;
  if (skill.type === 'healSelf' || skill.type === 'healAlly') return `${(skill.pct * scale * 100).toFixed(1)}% 最大生命`;
  if (skill.type === 'buffAtk') return `+${(skill.pct * scale * 100).toFixed(1)}% 攻擊`;
  if (skill.type === 'buffDefParty') return `+${(skill.amount * scale).toFixed(1)} 防禦`;
  if (skill.type === 'hasteSelf') return `+${(Math.min(0.95, (1 - skill.mult) * scale) * 100).toFixed(1)}% 攻速`;
  return skill.desc;
}

function growthCardHTML(c, lineKey, imagePath = '') {
  const meta = growthLineMeta(c.id, lineKey);
  const selected = selectedGrowthLine === lineKey ? ' selected' : '';
  const maxed = lineLevel(c, lineKey) >= STAT_LINE_MAX ? ' maxed' : '';
  const action = lineKey === 'action' ? ' actionCard' : ''; // gold frame - see design.md
  const visual = imagePath
    ? `<img src="${imagePath}" alt="${meta.name}" onerror="this.style.display='none'">`
    : `<span class="growthGlyph">${meta.icon}</span>`;
  return `<button class="growthCard${selected}${maxed}${action}" type="button" data-line="${lineKey}">${visual}<span class="growthCardText"><b>${meta.name}</b><small>${growthLineValue(c, lineKey, lineLevel(c, lineKey))}</small></span><span class="growthLevel">${lineLevel(c, lineKey)}</span></button>`;
}

// patches just the numbers a single hold-repeat tick changed, in place -
// used instead of a full renderCharacterDetail() per tick (90ms apart while
// held) because that would replace #growthUpgradeBtn itself mid-hold and
// orphan attachHoldRepeat's running interval/pointer listeners. This is why
// holding used to look like it "jumped" straight to wherever it stopped -
// nothing on screen updated until the final render on release.
function updateGrowthPanelLive(c, lineKey) {
  const level = lineLevel(c, lineKey);
  const bookId = lineBookId(lineKey);
  const bookCount = inventoryItemCount(bookId);
  const maxed = level >= STAT_LINE_MAX;

  const walletBs = document.querySelectorAll('.growthWallet b');
  if (walletBs[0]) walletBs[0].textContent = inventoryItemCount('statBook');
  if (walletBs[1]) walletBs[1].textContent = inventoryItemCount('skillBook');

  const cardEl = document.querySelector(`.growthCard[data-line="${lineKey}"]`);
  if (cardEl) {
    cardEl.querySelector('.growthLevel').textContent = level;
    cardEl.querySelector('.growthCardText small').textContent = growthLineValue(c, lineKey, level);
    cardEl.classList.toggle('maxed', maxed);
  }

  const headB = document.querySelector('.growthInspectorHead b');
  if (headB) headB.textContent = `Lv.${level}`;

  const compareDivs = document.querySelectorAll('.growthCompare > div');
  if (compareDivs[0]) compareDivs[0].querySelector('strong').textContent = growthLineValue(c, lineKey, level);
  if (compareDivs[1]) {
    compareDivs[1].querySelector('small').textContent = maxed ? '已達上限' : '下一級';
    compareDivs[1].querySelector('strong').textContent = growthLineValue(c, lineKey, Math.min(STAT_LINE_MAX, level + 1));
  }

  const btn = document.getElementById('growthUpgradeBtn');
  if (btn) {
    btn.disabled = maxed || bookCount <= 0;
    btn.textContent = maxed ? '已滿級' : bookCount <= 0 ? '書本不足' : '升級';
  }
}

function renderCharacterDetail(characterId) {
  const c = roster.find(member => member.id === characterId);
  const def = CHAR_DEFS[characterId];
  if (!c || !def) return;
  const unlocked = isCharUnlocked(characterId);
  const selected = party.includes(characterId);
  const rarity = RARITY_DEFS[def.rarity];
  const skins = characterSkins(characterId);
  const currentSkin = equippedSkin(characterId);
  if (selectedGrowthLine === 'action' && !def.action) selectedGrowthLine = 'atk';
  const activeLine = selectedGrowthLine;
  const activeMeta = growthLineMeta(characterId, activeLine);
  const activeLevel = lineLevel(c, activeLine);
  const activeBookId = lineBookId(activeLine);
  const activeBookCount = inventoryItemCount(activeBookId);
  const activeMaxed = activeLevel >= STAT_LINE_MAX;
  const content = document.getElementById('characterDetailContent');
  content.style.setProperty('--rarity-color', rarity.color);
  content.innerHTML = `
    <div class="detailPortraitColumn">
      <div class="detailArtFrame">
        <img src="${characterFullArtPath(characterId)}" alt="${def.name} 完整立繪">
        <div class="detailMissingArt">缺少目前外觀立繪</div>
      </div>
      <button id="characterDetailSelectBtn" type="button"></button>
    </div>
    <div class="detailInfo">
      <div class="detailTitleRow">
        <div class="detailIdentity">
          <span class="detailRarity">${rarity.label}</span>
          <h2 id="characterDetailName">${def.name}</h2>
          <span>Lv.${c.level} · ${c.xp}/${xpToNext(c.level)} EXP</span>
        </div>
        <div class="growthWallet"><span><img src="assets/item/${ITEM_DEFS.statBook.img}.png" alt="">能力書 <b>${inventoryItemCount('statBook')}</b></span><span><img src="assets/item/${ITEM_DEFS.skillBook.img}.png" alt="">技能書 <b>${inventoryItemCount('skillBook')}</b></span></div>
      </div>
      <div class="detailSectionTitle detailSectionHeading"><span>共鳴外觀</span><small>目前：${currentSkin.name} · 持有 ${skins.length}</small></div>
      <div class="skinPicker">
        ${skins.map(skin => `
          <button type="button" aria-pressed="${equippedSkinByCharacter[characterId] === skin.skinId}" class="skinOption${equippedSkinByCharacter[characterId] === skin.skinId ? ' selected' : ''}" data-skin-id="${skin.skinId}">
            <span class="skinPreview"><img src="assets/characters/${skin.portrait}.png" alt="${skin.name}"><i aria-hidden="true">✓</i></span><span>${skin.name}</span>
          </button>`).join('')}
      </div>
      <div class="growthVital"><span>HP</span><b>${Math.max(0, c.curHp)} / ${c.maxHp}</b></div>
      <div class="detailSectionTitle">基礎能力</div>
      <div class="growthGrid growthStats">
        ${GENERAL_STAT_LINES.map(line => growthCardHTML(c, line.key, `assets/skills/stats_${line.key}.png`)).join('')}
      </div>
      <div class="detailSectionTitle">技能</div>
      <div class="growthGrid growthSkills">
        ${def.skills.map((skill, index) => growthCardHTML(c, skillLineKey(index), `assets/skills/${skill.img}.png`)).join('')}
        ${def.action ? growthCardHTML(c, 'action', `assets/skills/${def.action.img}.png`) : ''}
      </div>
      <div class="growthInspector">
        <div class="growthInspectorHead"><span>${activeMeta.kind}</span><h3>${activeMeta.name}</h3><b>Lv.${activeLevel}</b></div>
        <div class="growthCompare"><div><small>目前</small><strong>${growthLineValue(c, activeLine, activeLevel)}</strong></div><span>→</span><div><small>${activeMaxed ? '已達上限' : '下一級'}</small><strong>${growthLineValue(c, activeLine, Math.min(STAT_LINE_MAX, activeLevel + 1))}</strong></div></div>
        <div class="growthUpgradeRow"><span class="growthCost"><img src="assets/item/${ITEM_DEFS[activeBookId].img}.png" alt="">${ITEM_DEFS[activeBookId].name} ×1</span><button id="growthUpgradeBtn" type="button"${activeMaxed || activeBookCount <= 0 ? ' disabled' : ''}>${activeMaxed ? '已滿級' : activeBookCount <= 0 ? '書本不足' : '升級'}</button></div>
      </div>
    </div>
  `;

  const fullArt = content.querySelector('.detailArtFrame img');
  fullArt.addEventListener('load', () => content.querySelector('.detailArtFrame').classList.add('loaded'));
  fullArt.addEventListener('error', () => {
    fullArt.remove();
    content.querySelector('.detailArtFrame').classList.add('missing');
  });
  content.querySelectorAll('.growthCard[data-line]').forEach(el => {
    el.addEventListener('click', () => {
      selectedGrowthLine = el.dataset.line;
      renderCharacterDetail(characterId);
    });
  });
  content.querySelectorAll('.skinOption[data-skin-id]').forEach(el => {
    el.addEventListener('click', () => {
      if (!equipCharacterSkin(characterId, el.dataset.skinId)) return;
      renderCharacterDetail(characterId);
      render();
    });
  });

  const upgradeBtn = document.getElementById('growthUpgradeBtn');
  attachHoldRepeat(upgradeBtn, () => {
    if (!useExpBookOnLine(characterId, selectedGrowthLine)) return false;
    updateGrowthPanelLive(c, selectedGrowthLine); // patch numbers in place each tick, not just at the end - see design.md
    return lineLevel(c, selectedGrowthLine) < STAT_LINE_MAX && inventoryItemCount(lineBookId(selectedGrowthLine)) > 0;
  }, () => { renderCharacterDetail(characterId); render(); });

  const selectBtn = document.getElementById('characterDetailSelectBtn');
  const isWuming = characterId === 'wuming';
  selectBtn.textContent = !unlocked ? '尚未締結契約' : selected ? (isWuming ? '目前出戰中' : '目前附身中') : partyLocked ? '本次遠征角色已鎖定' : (isWuming ? '設為出戰角色' : '設為附身對象');
  selectBtn.disabled = !unlocked || selected || partyLocked;
  selectBtn.style.display = prepLocation === 'home' ? 'none' : '';
  selectBtn.addEventListener('click', () => {
    toggleParty(characterId);
    renderCharacterDetail(characterId);
    render();
  });
}

let shopDialogueIndex = 0;
let lastShopDialogueMode = null;
let shopTab = 'buy';
let lastShopTabMode = null;
let wasShopOpen = false;

const SHOP_DIALOGUE_KEYS = {
  town: ['shop.dialogue.town.0', 'shop.dialogue.town.1', 'shop.dialogue.town.2'],
  dungeon: ['shop.dialogue.dungeon.0', 'shop.dialogue.dungeon.1', 'shop.dialogue.dungeon.2'],
};

function renderShopDialogue() {
  if (lastShopDialogueMode !== shopMode) {
    shopDialogueIndex = 0;
    lastShopDialogueMode = shopMode;
  }
  const lines = SHOP_DIALOGUE_KEYS[shopMode] || SHOP_DIALOGUE_KEYS.town;
  document.getElementById('shopDialogueText').textContent = t(lines[shopDialogueIndex % lines.length]);
}

function buildShopUI() {
  const buyList = document.getElementById('shopBuyList');
  SHOP_ITEMS.forEach(offer => {
    const item = localizedItemDef(offer.itemId);
    const row = document.createElement('div');
    row.className = 'shopBuyRow';
    row.dataset.itemId = offer.itemId;
    row.innerHTML = `
      <img src="assets/item/${item.img}.png" alt="${item.name}">
      <span class="shopItemCopy"><b class="shopItemName">${item.name}</b><small>${item.desc}</small></span>
      <span class="shopOwned"></span>
      <button type="button"><span>${offer.price}</span> 金幣</button>
    `;
    row.querySelector('button').addEventListener('click', () => buyShopItem(offer.itemId));
    attachItemTooltip(row.querySelector('img'), item, { qty: inventoryItemCount(offer.itemId) });
    buyList.appendChild(row);
  });
  document.getElementById('shopSellOneBtn').addEventListener('click', () => sellMonsterCrystals(1));
  document.getElementById('shopSellAllBtn').addEventListener('click', () => sellMonsterCrystals(inventoryItemCount('monsterCrystal')));
  document.getElementById('shopAutoLeaveBtn').addEventListener('click', toggleShopAutoLeave);
  document.getElementById('shopLeaveBtn').addEventListener('click', () => leaveShop(false));
  document.getElementById('shopOverlay').addEventListener('click', event => {
    if (event.target.id === 'shopOverlay') leaveShop(false);
  });
  document.getElementById('shopBuyTab').addEventListener('click', () => {
    shopTab = 'buy';
    resetShopIdleTimer();
    renderShopView();
  });
  document.getElementById('shopSellTab').addEventListener('click', () => {
    shopTab = 'sell';
    resetShopIdleTimer();
    renderShopView();
  });
  document.querySelector('.shopKeeperPanel').addEventListener('click', () => {
    shopDialogueIndex += 1;
    renderShopDialogue();
  });
}

function renderShopView() {
  const shopOpen = activeOverlay === 'shop';
  const overlay = document.getElementById('shopOverlay');
  overlay.classList.toggle('open', shopOpen);
  overlay.setAttribute('aria-hidden', String(!shopOpen));
  if (!shopOpen) {
    wasShopOpen = false;
    return;
  }
  if (!wasShopOpen || lastShopTabMode !== shopMode) {
    shopTab = 'buy';
    lastShopTabMode = shopMode;
  }
  wasShopOpen = true;
  document.getElementById('shopTitle').textContent = t(shopMode === 'town' ? 'shop.town' : 'shop.dungeon');
  const shopWallet = document.getElementById('shopWallet');
  const shopCoinIcon = 'coin.png';
  shopWallet.innerHTML = `<img src="assets/item/${shopCoinIcon}" alt="">${shopGold()}`;
  const buyTab = document.getElementById('shopBuyTab');
  const sellTab = document.getElementById('shopSellTab');
  buyTab.classList.toggle('active', shopTab === 'buy');
  sellTab.classList.toggle('active', shopTab === 'sell');
  buyTab.setAttribute('aria-selected', String(shopTab === 'buy'));
  sellTab.setAttribute('aria-selected', String(shopTab === 'sell'));
  document.getElementById('shopBuySection').hidden = shopTab !== 'buy';
  document.getElementById('shopSellSection').hidden = shopTab !== 'sell';
  renderShopDialogue();
  document.getElementById('shopCountdown').textContent = shopMode === 'town'
    ? ''
    : (shopAutoLeave
      ? t('shop.autoLeaveIn', { seconds: formatLocaleNumber(Math.ceil(shopCountdown / 1000)) })
      : t('shop.autoLeaveOff'));
  const crystalQty = inventoryItemCount('monsterCrystal');
  document.getElementById('shopMonsterCrystalQty').textContent = t('shop.owned', {
    quantity: formatLocaleNumber(crystalQty),
  });
  const sellBtn = document.getElementById('shopSellAllBtn');
  sellBtn.textContent = crystalQty > 0
    ? t('shop.sellAll', { gold: formatLocaleNumber(crystalQty * SHOP_MONSTER_CRYSTAL_SELL_PRICE) })
    : t('shop.nothingToSell');
  sellBtn.disabled = crystalQty <= 0;
  const sellOneBtn = document.getElementById('shopSellOneBtn');
  sellOneBtn.innerHTML = `<img class="shopPriceCoin" src="assets/item/${shopCoinIcon}" alt="">${SHOP_MONSTER_CRYSTAL_SELL_PRICE}`;
  sellOneBtn.disabled = crystalQty <= 0;
  const autoLeaveBtn = document.getElementById('shopAutoLeaveBtn');
  autoLeaveBtn.style.display = shopMode === 'dungeon' ? '' : 'none';
  autoLeaveBtn.textContent = t(shopAutoLeave ? 'shop.disableCountdown' : 'shop.enableCountdown');
  SHOP_ITEMS.forEach(offer => {
    const row = document.querySelector(`.shopBuyRow[data-item-id="${offer.itemId}"]`);
    const item = localizedItemDef(offer.itemId);
    row.querySelector('img').alt = item.name;
    row.querySelector('.shopItemName').textContent = item.name;
    row.querySelector('.shopItemCopy small').textContent = item.desc;
    row.querySelector('.shopOwned').textContent = t('shop.owned', {
      quantity: formatLocaleNumber(inventoryItemCount(offer.itemId)),
    });
    const buyBtn = row.querySelector('button');
    buyBtn.innerHTML = `<img class="shopPriceCoin" src="assets/item/${shopCoinIcon}" alt="">${offer.price}`;
    buyBtn.disabled = shopGold() < offer.price;
  });
}

let selectedTransferSlot = null;

function attachInventoryDrag(slot, collectionName, index) {
  slot.addEventListener('dragstart', e => {
    const collection = collectionName === 'storage' ? storage : inventory;
    if (!collection[index]) {
      e.preventDefault();
      return;
    }
    inventoryDragFrom = { collectionName, index };
    slot.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    hideTooltip();
  });
  slot.addEventListener('dragover', e => {
    if (inventoryDragFrom === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    slot.classList.add('dragTarget');
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('dragTarget'));
  slot.addEventListener('drop', e => {
    e.preventDefault();
    slot.classList.remove('dragTarget');
    if (inventoryDragFrom === null) return;
    if (inventoryDragFrom.collectionName === collectionName && inventoryDragFrom.index === index) return;
    const source = inventoryDragFrom.collectionName === 'storage' ? storage : inventory;
    const target = collectionName === 'storage' ? storage : inventory;
    [source[inventoryDragFrom.index], target[index]] = [target[index], source[inventoryDragFrom.index]];
    inventoryDragFrom = null;
    renderInventory();
  });
  slot.addEventListener('dragend', () => {
    inventoryDragFrom = null;
    document.querySelectorAll('.inventorySlot').forEach(el => el.classList.remove('dragging', 'dragTarget'));
  });
  slot.addEventListener('click', event => {
    event.stopPropagation();
    const modal = document.getElementById('inventoryModal');
    if (!modal.classList.contains('warehouseOpen')) return;
    const collection = collectionName === 'storage' ? storage : inventory;
    if (!selectedTransferSlot) {
      if (!collection[index]) return;
      selectedTransferSlot = { collectionName, index };
      slot.classList.add('transferSelected');
      return;
    }
    if (selectedTransferSlot.collectionName === collectionName && selectedTransferSlot.index === index) {
      selectedTransferSlot = null;
      slot.classList.remove('transferSelected');
      return;
    }
    const source = selectedTransferSlot.collectionName === 'storage' ? storage : inventory;
    const target = collectionName === 'storage' ? storage : inventory;
    [source[selectedTransferSlot.index], target[index]] = [target[index], source[selectedTransferSlot.index]];
    selectedTransferSlot = null;
    renderInventory();
  });
}

function renderItemGrid(grid, collection, collectionName) {
  grid.innerHTML = '';
  const unsecuredBySlot = collectionName === 'inventory'
    ? unsecuredQuantitiesBySlot(collection)
    : collection.map(() => 0);
  collection.forEach((entry, index) => {
    const slot = document.createElement('div');
    const unsecuredQty = unsecuredBySlot[index];
    slot.className = `inventorySlot${entry ? '' : ' empty'}${unsecuredQty > 0 ? ' unsecured' : ''}`;
    slot.dataset.slotIndex = index;
    slot.dataset.collection = collectionName;
    slot.draggable = !!entry;
    grid.appendChild(slot);
    attachInventoryDrag(slot, collectionName, index);

    if (!entry) return;
    const item = localizedItemDef(entry.itemId);
    if (!item || entry.qty <= 0) return;
    slot.innerHTML = `
      <img src="assets/item/${item.img}.png" alt="${item.name}" draggable="false">
      <span class="inventoryQty">×${entry.qty}</span>
      <span class="inventoryItemName">${item.name}</span>
      ${unsecuredQty > 0 ? `<span class="inventoryRunGain">${t('inventory.unsecured', { quantity: formatLocaleNumber(unsecuredQty) })}</span>` : ''}
    `;
    if (entry.itemId !== 'coin') attachItemTooltip(slot, item, { ...entry, unsecuredQty });
  });
}

function syncCoinItem() {
  const collections = [inventory, storage];
  const coinEntries = [];
  collections.forEach(collection => collection.forEach((entry, index) => {
    if (entry && entry.itemId === 'coin') coinEntries.push({ collection, index });
  }));
  if (bankedGold <= 0) {
    coinEntries.forEach(({ collection, index }) => { collection[index] = null; });
    return;
  }
  if (coinEntries.length > 0) {
    coinEntries[0].collection[coinEntries[0].index].qty = bankedGold;
    coinEntries.slice(1).forEach(({ collection, index }) => { collection[index] = null; });
    return;
  }
  const target = collections
    .map(collection => ({ collection, index: collection.findIndex(entry => !entry) }))
    .find(location => location.index >= 0);
  if (target) target.collection[target.index] = { itemId: 'coin', qty: bankedGold };
}

function renderInventory() {
  syncCoinItem();
  const warehouseOpen = document.getElementById('inventoryModal').classList.contains('warehouseOpen');
  document.getElementById('inventoryTitle').textContent = t(warehouseOpen ? 'inventory.storage' : 'inventory.title');
  renderItemGrid(document.getElementById('inventoryGrid'), inventory, 'inventory');
  renderItemGrid(document.getElementById('storageGrid'), storage, 'storage');
}

function setInventoryOpen(open, mode = 'bag') {
  if (open) closeOtherOverlays('inventory');
  activeOverlay = open ? 'inventory' : (activeOverlay === 'inventory' ? null : activeOverlay);
  if (open) {
    selectedTransferSlot = null;
    const warehouseOpen = mode === 'storage';
    document.getElementById('inventoryTitle').textContent = t(warehouseOpen ? 'inventory.storage' : 'inventory.title');
    document.getElementById('inventoryModal').classList.toggle('warehouseOpen', warehouseOpen);
    document.getElementById('storagePane').hidden = !warehouseOpen;
    document.getElementById('inventoryTransferHint').style.display = warehouseOpen ? '' : 'none';
  }
  const overlay = document.getElementById('inventoryOverlay');
  overlay.classList.toggle('open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  hideTooltip();
  if (open) renderInventory();
}

function buildUI() {
  tooltipEl = document.getElementById('tooltip');
  attachTextTooltip(document.getElementById('saveGameBtn'), '存檔', '下載目前的永久進度檔案');
  attachTextTooltip(document.getElementById('loadGameBtn'), '讀檔', '從電腦選擇進度檔案');
  buildShopUI();
  bindDialogueUI();

  document.getElementById('townShopBtn').addEventListener('click', openTownShop);
  document.getElementById('homeLocationBtn').addEventListener('click', () => {
    if (resonanceState.xiaochu === 'goHome') {
      prepLocation = 'home';
      homeMode = 'menu';
      render();
      queueDialogue('xiaochu_home_search', () => {
        resonanceState.xiaochu = 'bookPending';
        render();
      });
      return;
    }
    if (contractStoryLocked()) return;
    prepLocation = 'home';
    homeMode = 'menu';
    render();
  });
  document.getElementById('homeBackBtn').addEventListener('click', () => {
    if (contractStoryLocked()) return;
    prepLocation = 'village';
    render();
  });
  document.getElementById('homeStorageBtn').addEventListener('click', () => {
    if (!contractStoryLocked()) setInventoryOpen(true, 'storage');
  });
  document.getElementById('homeGrowthBtn').addEventListener('click', () => {
    if (contractStoryLocked()) return;
    homeMode = 'growth';
    render();
  });
  document.getElementById('homeGrowthBackBtn').addEventListener('click', () => {
    homeMode = 'menu';
    render();
  });
  document.getElementById('expeditionLocationBtn').addEventListener('click', () => {
    if (phase !== 'prepFloor' || partyLocked) return;
    prepLocation = 'regions';
    render();
  });
  document.getElementById('regionBackBtn').addEventListener('click', () => {
    prepLocation = 'village';
    render();
  });
  document.getElementById('forestRegionBtn').addEventListener('click', () => {
    prepLocation = 'expedition';
    render();
  });
  document.getElementById('expeditionBackBtn').addEventListener('click', () => {
    prepLocation = 'regions';
    render();
  });

  document.getElementById('bagBtn').addEventListener('click', () => {
    if (!contractStoryLocked()) setInventoryOpen(true);
  });
  document.getElementById('defeatRestartBtn').addEventListener('click', restartAfterDefeat);
  document.getElementById('defeatVillageBtn').addEventListener('click', returnToVillageAfterDefeat);
  document.getElementById('victoryConfirmBtn').addEventListener('click', confirmVictory);
  document.getElementById('inventoryCloseBtn').addEventListener('click', () => setInventoryOpen(false));
  document.getElementById('inventoryOverlay').addEventListener('click', e => {
    const modal = document.getElementById('inventoryModal');
    const clickedBackdrop = e.target.id === 'inventoryOverlay';
    const clickedWarehouseBlank = modal.classList.contains('warehouseOpen')
      && !e.target.closest('.inventoryPane')
      && !e.target.closest('#inventoryCloseBtn');
    if (clickedBackdrop || clickedWarehouseBlank) setInventoryOpen(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && activeOverlay === 'dialogue') {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && activeOverlay) OVERLAY_CLOSERS[activeOverlay]();
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('#combatItemPicker') && !event.target.closest('.combatItemQuickSlot')) {
      setCombatItemPickerOpen(false);
    }
    if (!event.target.closest('#charmPicker') && !event.target.closest('#expeditionSelectedSummary .activeQuickSlot')) {
      setCharmPickerOpen(false);
    }
  });
  document.getElementById('characterDetailCloseBtn').addEventListener('click', () => setCharacterDetailOpen(false));
  document.getElementById('characterDetailOverlay').addEventListener('click', event => {
    if (event.target.id === 'characterDetailOverlay') setCharacterDetailOpen(false);
  });

  const actionArea = document.getElementById('actionArea');
  startBtnEl = document.createElement('button');
  startBtnEl.id = 'startBtn';
  startBtnEl.addEventListener('click', () => {
    if (party.length === 0) return; // need at least one character to fight with
    if (phase === 'prepFloor' || phase === 'prepBoss') {
      if (phase === 'prepBoss') {
        resetBossEntryCooldowns();
        phase = 'bossIntro';
        render();
        showBossIntro(beginExpeditionCombat);
      } else {
        showDungeonEntry(beginExpeditionCombat);
      }
    }
  });
  retreatBtnEl = document.createElement('button');
  retreatBtnEl.id = 'retreatBtn';
  retreatBtnEl.textContent = '撤退';
  retreatBtnEl.addEventListener('click', () => {
    doRetreat();
    render();
  });
  actionArea.appendChild(startBtnEl);
  actionArea.appendChild(retreatBtnEl);

  // Expedition is a quick possession choice; detailed growth stays at Home.
  const prepRosterEl = document.getElementById('prepRoster');
  prepRosterEl.innerHTML = '';
  roster.forEach(c => {
    const def = CHAR_DEFS[c.id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'expeditionCharacter';
    const rarity = RARITY_DEFS[def.rarity];
    card.style.setProperty('--rarity-color', rarity.color);
    // deliberately no native `title` tooltip here - the browser's default
    // tooltip box is ugly and can visibly get stuck on screen; rarity reads
    // from the frame color/glow alone (see design.md).
    card.innerHTML = `
      <span class="selectedBadge">${c.id === 'wuming' ? '出戰中' : '附身中'}</span>
      <div class="lockOverlay">
        <span class="lockIcon">🔒</span>
        <span class="lockReq"></span>
      </div>
      <div class="portrait">
        <img src="${characterPortraitPath(c.id)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
        <div class="fallback" style="display:none;">${def.icon}</div>
      </div>
      <span class="nm">${def.name}</span>
      <span class="lvlTag">Lv.<span class="lvl"></span></span>
    `;
    prepRosterEl.appendChild(card);

    prepEls[c.id] = {
      card,
      lvl: card.querySelector('.lvl'),
      lockReq: card.querySelector('.lockReq'),
      portrait: card.querySelector('.portrait img'),
    };
    card.addEventListener('click', () => toggleParty(c.id));
    attachCharTooltip(card.querySelector('.portrait'), c.id);
  });

  const homeRosterEl = document.getElementById('homeRoster');
  homeRosterEl.innerHTML = '';
  roster.forEach(c => {
    const def = CHAR_DEFS[c.id];
    const rarity = RARITY_DEFS[def.rarity];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'homeGrowthCard';
    card.style.setProperty('--rarity-color', rarity.color);
    card.innerHTML = `
      <span class="homeGrowthPortrait">
        <img src="${characterPortraitPath(c.id)}" alt="${def.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
        <span class="fallback" style="display:none;">缺少圖片</span>
      </span>
      <span class="homeGrowthInfo">
        <span class="homeGrowthMeta"><span class="rarityTag">${rarity.label}</span><span>外觀 ${characterSkins(c.id).length}</span></span>
        <b>${def.name}</b>
        <small>Lv.<span class="lvl"></span> · ${equippedSkin(c.id).name}</small>
        <span class="homeGrowthSkills">${def.skills.map(s => `<img src="assets/skills/${s.img}.png" alt="" onerror="this.classList.add('missing');">`).join('')}</span>
        <em>查看能力與技能配點</em>
      </span>
      <span class="homeGrowthLock">尚未締結契約</span>
    `;
    card.addEventListener('click', () => {
      if (!isCharUnlocked(c.id)) return;
      setCharacterDetailOpen(true, c.id);
    });
    homeRosterEl.appendChild(card);
    homeEls[c.id] = { card, lvl: card.querySelector('.lvl'), portrait: card.querySelector('.homeGrowthPortrait img') };
  });
}

// battle roster: ONLY the characters currently in `party`, shown as a row
// below the monster. Rebuilt fresh every time a fight starts (prepFloor/prepBoss
// -> combat) - benched characters never appear here at all while fighting.
function buildBattleRoster() {
  charEls = {};
  const partySideEl = document.getElementById('partySide');
  partySideEl.innerHTML = '';
  party.forEach(id => {
    const def = CHAR_DEFS[id];
    const card = document.createElement('div');
    card.className = 'charCard';
    card.innerHTML = `
      <div class="portrait">
        <img src="${characterPortraitPath(id)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
        <div class="fallback" style="display:none;">${def.icon}</div>
        <div class="statusList" aria-label="目前狀態"></div>
      </div>
      <div class="body">
        <div class="topRow">
          <span class="nm">${def.name}</span>
          <span class="lvlTag">Lv.<span class="lvl"></span></span>
        </div>
        <div class="row">
          <span class="hpLabel">HP</span>
          <div class="barOuter"><div class="barInner hpBar"></div></div>
          <span class="hpText"></span>
        </div>
        <div class="row">
          <span class="atkLabel" aria-label="下次行動倒數">⏱</span>
          <div class="barOuter"><div class="barInner atkBar"></div></div>
        </div>
        <div class="skills">
          ${def.skills.map(s => `
            <div class="skillIcon">
              <img src="assets/skills/${s.img}.png" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
              <span class="fallback">${s.icon}</span>
              <div class="cdOverlay"></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    partySideEl.appendChild(card);

    const portraitEl = card.querySelector('.portrait');
    attachTextTooltip(card.querySelector('.atkLabel'), '行動倒數', '進度填滿後進行下一次行動');
    const skillIconEls = Array.from(card.querySelectorAll('.skillIcon'));
    skillIconEls.forEach((iconEl, i) => attachSkillTooltip(iconEl, def.skills[i]));
    charEls[id] = {
      card,
      portraitEl,
      hpText: card.querySelector('.hpText'),
      hpBar: card.querySelector('.hpBar'),
      lvl: card.querySelector('.lvl'),
      atkBar: card.querySelector('.atkBar'),
      statusList: card.querySelector('.statusList'),
      skillIcons: skillIconEls.map(el => el.querySelector('.cdOverlay')),
    };
    attachCharTooltip(portraitEl, id);
  });

  buildCombatActionBar();
}

// Player-manual action row. Potions are a standalone combat command and are
// deliberately not attached to any character; passive charms still belong to
// their equipped character and gain one slot per party member.
function buildCombatActionBar() {
  const barEl = document.getElementById('combatActionBar');
  const itemId = equippedCombatItemId;
  barEl.innerHTML = `
    <span class="actionBarTitle">戰鬥操作</span>
    <button class="combatItemButton combatItemAction" type="button" aria-label="使用藥水">
      ${loadoutItemHTML(itemId, '◇', '空藥水槽')}
      <span class="itemCdOverlay"></span>
      <span class="itemCdText"></span>
    </button>
    <div class="relicActions"></div>
  `;
  const relicActions = barEl.querySelector('.relicActions');
  const combatItemAction = barEl.querySelector('.combatItemAction');
  attachCombatActionTooltip(combatItemAction, () => equippedCombatItemId);
  combatItemAction.addEventListener('click', () => {
    if (equippedCombatItemId) useCombatItem(equippedCombatItemId);
  });
  party.forEach(id => {
    const action = CHAR_DEFS[id].action;
    const group = document.createElement('div');
    group.className = 'actionBarGroup';
    group.innerHTML = `
      ${action ? `
        <button class="combatItemButton charActionButton" type="button" aria-label="使用${action.name}">
          <img src="assets/skills/${action.img}.png" alt="${action.name}" draggable="false">
          <span class="itemCdOverlay"></span>
          <span class="itemCdText"></span>
          <span class="actionLockOverlay"><img src="assets/skill_lock.png" alt=""></span>
        </button>
      ` : ''}
      <div class="quickSlot activeQuickSlot" data-slot-type="active" aria-label="護符"></div>
    `;
    relicActions.appendChild(group);
    if (action) {
      charEls[id].manualActionButton = group.querySelector('.charActionButton');
      charEls[id].manualActionButton.addEventListener('click', () => useCharacterAction(id));
      attachCharacterActionTooltip(charEls[id].manualActionButton, action);
    }
    charEls[id].activeQuickSlot = group.querySelector('.activeQuickSlot');
    attachActiveRelicTooltip(charEls[id].activeQuickSlot, roster.find(c => c.id === id));
  });
}

function renderCharacterStatuses(c, container) {
  const active = STATUS_DEFS.filter(status => status.isActive(c));
  const visible = active.slice(0, 4);
  const activeIds = new Set(visible.map(status => status.id));

  Array.from(container.querySelectorAll('.statusBadge')).forEach(badge => {
    if (activeIds.has(badge.dataset.statusId)) return;
    if (badge.matches(':hover')) hideTooltip();
    badge.remove();
  });

  visible.forEach(status => {
    let badge = Array.from(container.children).find(el => el.dataset.statusId === status.id);
    if (!badge) {
      badge = document.createElement('span');
      badge.className = `statusBadge ${status.tone}`;
      badge.dataset.statusId = status.id;
      badge.innerHTML = `
        <span class="statusIcon"></span>
        <span class="statusName">${status.label}</span>
        <span class="statusTime"></span>
      `;
      const iconEl = badge.querySelector('.statusIcon');
      if (status.img) {
        const img = document.createElement('img');
        img.alt = '';
        img.addEventListener('error', () => {
          img.remove();
          iconEl.classList.add('missing');
        });
        img.src = `assets/effect_icon/${status.img}.png`;
        iconEl.appendChild(img);
      } else {
        iconEl.classList.add('missing');
      }
      attachStatusTooltip(badge, status, c);
    }

    badge.className = `statusBadge ${status.tone}`;
    const remainingMs = status.remaining ? status.remaining(c) : 0;
    badge.querySelector('.statusTime').textContent = remainingMs > 0 ? `${Math.ceil(remainingMs / 1000)}s` : '';
    container.appendChild(badge);
  });

  let moreBadge = container.querySelector('.statusMore');
  const hidden = active.slice(4);
  if (hidden.length > 0) {
    if (!moreBadge) {
      moreBadge = document.createElement('span');
      moreBadge.className = 'statusMore';
      moreBadge.addEventListener('mouseenter', event => {
        const hiddenNow = STATUS_DEFS.filter(status => status.isActive(c)).slice(4);
        showTooltipContent(`
          <div class="ttName">其他狀態</div>
          ${hiddenNow.map(status => `<div class="ttStat">${status.label}：${status.desc}</div>`).join('')}
        `, event);
      });
      moreBadge.addEventListener('mousemove', positionTooltip);
      moreBadge.addEventListener('mouseleave', hideTooltip);
    }
    moreBadge.textContent = `+${hidden.length}`;
    container.appendChild(moreBadge);
  } else if (moreBadge) {
    moreBadge.remove();
  }

  container.classList.toggle('empty', active.length === 0);
}

// monster row: everyone currently in `monsters` (2~3 mobs, or the lone
// boss), shown side by side above the party row. Rebuilt fresh every time a
// new wave spawns, mirroring buildBattleRoster()'s pattern for the party.
function buildMonsterCards() {
  monsterEls = {};
  const monsterSideEl = document.getElementById('monsterSide');
  monsterSideEl.innerHTML = '';
  monsters.forEach(m => {
    const card = document.createElement('div');
    card.className = `monsterCard${m.isBoss ? ' boss' : ''}`;
    card.innerHTML = `
      <div class="portrait big">
        <img src="assets/monsters/${m.img}.png" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
        <div class="fallback" style="display:none;">👾</div>
      </div>
      <div class="monsterTopRow">
        <div class="name"></div>
        <span class="lvlTag">Lv.<span class="lvl"></span></span>
      </div>
      <div class="row">
        <span class="hpLabel">HP</span>
        <div class="barOuter"><div class="barInner hpBar"></div></div>
        <span class="hpText"></span>
      </div>
      <div class="row">
        <span class="atkLabel" aria-label="下次行動倒數">⏱</span>
        <div class="barOuter"><div class="barInner atkBar"></div></div>
      </div>
      <div class="skills"></div>
    `;
    monsterSideEl.appendChild(card);

    const portraitEl = card.querySelector('.portrait');
    attachTextTooltip(card.querySelector('.atkLabel'), '行動倒數', '進度填滿後進行下一次行動');
    monsterEls[m.id] = {
      card,
      portraitEl,
      nameEl: card.querySelector('.name'),
      lvlEl: card.querySelector('.lvl'),
      hpBar: card.querySelector('.hpBar'),
      hpText: card.querySelector('.hpText'),
      atkBar: card.querySelector('.atkBar'),
      skillsEl: card.querySelector('.skills'),
      skillCdOverlayEl: null,
      skill2CdOverlayEl: null,
      skill3CdOverlayEl: null,
    };
    attachMonsterTooltip(portraitEl, m);
    updateMonsterSkillIcons(m);
  });
}

function floorLabelText() {
  const region = regionName(floor);
  if (phase === 'prepFloor' && !partyLocked) {
    if (prepLocation === 'village') return t('village.title');
    if (prepLocation === 'home') return t('home.title');
    if (prepLocation === 'regions') return t('region.title');
    return region;
  }
  if (phase === 'combat' && monsters.length > 0) {
    const boss = monsters.find(m => m.isBoss);
    return boss
      ? t('combat.bossBattle', { region })
      : t('combat.mobProgress', {
        region,
        current: formatLocaleNumber(mobsCleared + 1),
        total: formatLocaleNumber(MOBS_PER_FLOOR),
      });
  }
  return region;
}

function render() {
  const inPrep = (phase === 'prepFloor' || phase === 'prepBoss');
  document.getElementById('app').classList.toggle('combatActive', !inPrep);
  const inFreeVillage = phase === 'prepFloor' && !partyLocked;
  const floorLabelEl = document.getElementById('floorLabel');
  floorLabelEl.textContent = floorLabelText();
  floorLabelEl.style.display = inPrep ? 'none' : '';
  const goldLabel = document.getElementById('goldLabel');
  goldLabel.style.display = inFreeVillage ? 'none' : '';
  goldLabel.innerHTML = inFreeVillage ? '' : `<img src="assets/item/coin.png" alt="遠征金幣">${runGold}`;
  const unsecuredTotal = Object.values(runInventoryGains).reduce((total, quantity) => total + Math.max(0, quantity), 0);
  const bagBtn = document.getElementById('bagBtn');
  bagBtn.setAttribute('aria-label', unsecuredTotal > 0
    ? t('header.openBagUnsecured', { quantity: formatLocaleNumber(unsecuredTotal) })
    : t('header.openBag'));
  const townShopBtn = document.getElementById('townShopBtn');
  townShopBtn.style.display = (phase === 'prepFloor' && !partyLocked) ? '' : 'none';
  renderShopView();

  document.getElementById('prepView').style.display = inPrep ? 'block' : 'none';
  document.getElementById('combatView').style.display = inPrep ? 'none' : 'block';

  if (inPrep) {
    renderPrepView();
  } else {
    renderCombatView();
  }
  const atVillageSurface = phase === 'prepFloor' && !partyLocked && prepLocation === 'village';
  const atHomeSurface = phase === 'prepFloor' && !partyLocked && prepLocation === 'home';
  const atRegionSurface = phase === 'prepFloor' && !partyLocked && prepLocation === 'regions';
  const visibleSurface = !inPrep
    ? document.getElementById('combatView')
    : atVillageSurface
      ? document.getElementById('villageView')
      : atHomeSurface
        ? document.getElementById('homeView')
        : atRegionSurface
          ? document.getElementById('regionView')
          : document.getElementById('expeditionView');
  const surfaceKey = !inPrep ? 'combat' : `${phase}:${prepLocation}:${atHomeSurface ? homeMode : ''}`;
  animateSurfaceChange(visibleSurface, surfaceKey);

  const logEl = document.getElementById('log');
  const logWasVisible = logEl.style.display === 'block';
  const logWasAtBottom = !logWasVisible
    || logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight <= 8;
  const previousLogScrollTop = logEl.scrollTop;
  logEl.style.display = phase === 'combat' ? 'block' : 'none';
  const logMarkup = `<div class="logHeading"><span>${t('combat.log')}</span></div>${logLines.map(l => `<div class="logLine ${l.type}">${l.msg}</div>`).join('')}`;
  if (logEl.innerHTML !== logMarkup) {
    logEl.innerHTML = logMarkup;
    logEl.scrollTop = logWasAtBottom ? logEl.scrollHeight : previousLogScrollTop;
  }
  if (typeof renderSaveControls === 'function') renderSaveControls();
}

function renderPrepView() {
  const headingEl = document.getElementById('prepHeading');
  const msgEl = document.getElementById('prepMsg');
  const atVillage = phase === 'prepFloor' && !partyLocked && prepLocation === 'village';
  const atHome = phase === 'prepFloor' && !partyLocked && prepLocation === 'home';
  const atRegions = phase === 'prepFloor' && !partyLocked && prepLocation === 'regions';
  renderRegionContext();
  document.getElementById('villageView').style.display = atVillage ? '' : 'none';
  const homeView = document.getElementById('homeView');
  homeView.style.display = atHome ? '' : 'none';
  homeView.classList.toggle('showingGrowth', atHome && homeMode === 'growth');
  document.getElementById('homeMenu').hidden = !atHome || homeMode !== 'menu';
  document.getElementById('homeGrowthView').hidden = !atHome || homeMode !== 'growth';
  const storyLocked = contractStoryLocked();
  const waitingForBook = ['bookPending', 'bookReading'].includes(resonanceState.xiaochu);
  const oathReady = resonanceState.xiaochu === 'oathReady';
  const mustGoHome = resonanceState.xiaochu === 'goHome';
  const journalUnlocked = ['bookPending', 'bookReading', 'oathReady', 'contracting', 'contracted'].includes(resonanceState.xiaochu);
  const contractAvailable = ['oathReady', 'contracting', 'contracted'].includes(resonanceState.xiaochu);
  document.getElementById('travelJournalBtn').hidden = !journalUnlocked;
  document.getElementById('contractFacilityBtn').hidden = !contractAvailable;
  document.getElementById('travelJournalBtn').classList.toggle('storyRequired', waitingForBook);
  document.getElementById('contractFacilityBtn').classList.toggle('storyRequired', oathReady);
  document.getElementById('homeLocationBtn').classList.toggle('storyRequired', mustGoHome);
  document.getElementById('homeGuideHina').hidden = !mustGoHome;
  document.body.classList.toggle('storyOperationLock', storyLocked && !['villageReturn', 'contracting'].includes(resonanceState.xiaochu));
  document.querySelectorAll('.storyFocusTarget').forEach(element => element.classList.remove('storyFocusTarget'));
  if (mustGoHome) document.getElementById('homeLocationBtn').classList.add('storyFocusTarget');
  if (waitingForBook) document.getElementById('travelJournalBtn').classList.add('storyFocusTarget');
  if (oathReady) document.getElementById('contractFacilityBtn').classList.add('storyFocusTarget');
  document.getElementById('homeLocationBtn').disabled = storyLocked && !mustGoHome;
  document.getElementById('townShopBtn').disabled = storyLocked;
  document.getElementById('expeditionLocationBtn').disabled = storyLocked;
  document.getElementById('homeBackBtn').disabled = storyLocked;
  document.getElementById('homeGrowthBtn').disabled = storyLocked;
  document.getElementById('homeStorageBtn').disabled = storyLocked;
  document.getElementById('travelJournalBtn').disabled = storyLocked && !waitingForBook;
  document.getElementById('bagBtn').disabled = storyLocked;
  document.getElementById('regionView').style.display = atRegions ? '' : 'none';
  document.getElementById('expeditionView').style.display = (atVillage || atHome || atRegions) ? 'none' : '';
  Object.entries(homeEls).forEach(([id, refs]) => {
    const c = roster.find(entry => entry.id === id);
    refs.lvl.textContent = c.level;
    refs.portrait.src = characterPortraitPath(id);
    refs.card.classList.toggle('charLocked', !isCharUnlocked(id));
  });
  if (atVillage || atHome || atRegions) return;

  if (phase === 'prepFloor') {
    headingEl.textContent = t('expedition.preparation', { region: regionName(floor) });
    if (partyLocked) {
      msgEl.textContent = t('expedition.lockedParty', { region: regionName(floor) });
      startBtnEl.textContent = t('expedition.continue');
    } else if (party.length === 0) {
      msgEl.textContent = t('expedition.chooseSoul', { limit: formatLocaleNumber(SOLO_PARTY_LIMIT) });
      startBtnEl.textContent = t('expedition.start');
    } else {
      msgEl.textContent = ''; // party already picked - the highlighted card already shows that, no need to say it again
      startBtnEl.textContent = t('expedition.start');
    }
    retreatBtnEl.style.display = partyLocked ? '' : 'none';
  } else {
    headingEl.textContent = t('expedition.bossPrep');
    msgEl.textContent = t('expedition.bossPrepDesc');
    startBtnEl.textContent = t('expedition.challengeBoss');
    retreatBtnEl.style.display = '';
  }
  startBtnEl.disabled = (party.length === 0);
  document.getElementById('actionArea').style.display = '';
  const choosingCharacter = phase !== 'prepBoss';
  document.getElementById('expeditionBackBtn').style.display = choosingCharacter ? '' : 'none';
  document.getElementById('expeditionCharacterHeading').style.display = choosingCharacter ? '' : 'none';
  document.getElementById('prepRoster').style.display = choosingCharacter ? '' : 'none';

  roster.forEach(c => {
    const refs = prepEls[c.id];
    const inParty = party.includes(c.id);
    const unlocked = isCharUnlocked(c.id);
    // once locked, only the chosen party is even shown - nothing else to pick
    refs.card.style.display = (!partyLocked || inParty) ? '' : 'none';
    refs.card.classList.toggle('inParty', inParty);
    refs.card.classList.toggle('runLocked', partyLocked);
    refs.card.classList.toggle('charLocked', !unlocked);
    refs.lockReq.textContent = unlockReqText(c.id);
    refs.lvl.textContent = c.level;
    refs.portrait.src = characterPortraitPath(c.id);
  });
  renderExpeditionSelectedSummary();
}

function renderRegionContext() {
  const region = localizedRegionDef(floor);
  const tagHTML = values => values.map(value => `<span>${value}</span>`).join('');
  document.getElementById('forestRegionName').textContent = region.name;
  document.getElementById('forestRegionLevel').textContent = t('format.recommendedLevel', {
    level: formatLocaleNumber(region.recommendedLevel),
  });
  document.getElementById('forestRegionDescription').textContent = region.description;
  document.getElementById('forestRegionThreats').innerHTML = tagHTML(region.threats);
  document.getElementById('forestRegionDrops').textContent = region.drops.join('・');

  const image = document.getElementById('expeditionRegionImage');
  image.src = `assets/ui/${region.image}.png`;
  image.alt = region.name;
  document.getElementById('expeditionRegionName').textContent = region.name;
  document.getElementById('expeditionRegionDescription').textContent = region.description;
  document.getElementById('expeditionRegionLevel').textContent = t('format.level', {
    level: formatLocaleNumber(region.recommendedLevel),
  });
  document.getElementById('expeditionRegionBoss').textContent = region.boss;
  document.getElementById('expeditionRegionThreats').textContent = region.threats.join('・');
}

function renderCombatView() {
  const boss = monsters.find(m => m.isBoss);
  document.getElementById('bossArena').classList.toggle('active', !!boss);

  aliveMonsters().forEach(m => {
    const refs = monsterEls[m.id];
    if (!refs) return;
    refs.nameEl.textContent = m.name;
    refs.lvlEl.textContent = m.level;
    refs.hpBar.style.width = clampPct(m.hp, m.maxHp) + '%';
    refs.hpText.textContent = `${Math.max(0, m.hp)}/${m.maxHp}`;
    const atkPct = Math.round((1 - m.actionCountdown / m.atkInterval) * 100);
    refs.atkBar.style.width = Math.max(0, Math.min(100, atkPct)) + '%';
    if (refs.skillCdOverlayEl) {
      const skillCdPct = Math.round((m.skillCd / (m.skill.cd * 1000)) * 100);
      refs.skillCdOverlayEl.style.height = Math.max(0, Math.min(100, skillCdPct)) + '%';
    }
    if (refs.skill2CdOverlayEl && m.skill2) {
      const skill2CdPct = Math.round((m.skill2Cd / (m.skill2.cd * 1000)) * 100);
      refs.skill2CdOverlayEl.style.height = Math.max(0, Math.min(100, skill2CdPct)) + '%';
    }
    if (refs.skill3CdOverlayEl) {
      const skill3CdPct = Math.round((gooSpawnCountdown / GOO_SKILL_CD_MS) * 100);
      refs.skill3CdOverlayEl.style.height = Math.max(0, Math.min(100, skill3CdPct)) + '%';
    }
  });

  party.forEach(id => {
    const c = roster.find(r => r.id === id);
    const refs = charEls[id];
    refs.card.classList.toggle('down', !c.alive);
    refs.hpText.textContent = `${Math.max(0, c.curHp)}/${c.maxHp}${!c.alive ? '（倒下）' : ''}`;
    refs.hpBar.style.width = clampPct(c.curHp, c.maxHp) + '%';
    refs.lvl.textContent = c.level;
    renderCharacterStatuses(c, refs.statusList);
    renderActiveRelicSlot(refs.activeQuickSlot, c);
    const action = CHAR_DEFS[id].action;
    if (action && refs.manualActionButton) {
      const cooldownMax = action.cooldown * 1000;
      refs.manualActionButton.querySelector('.itemCdOverlay').style.height = `${Math.round((c.manualActionCd / cooldownMax) * 100)}%`;
      refs.manualActionButton.querySelector('.itemCdText').textContent = c.manualActionCd > 0 ? Math.ceil(c.manualActionCd / 1000) : '';
      const usable = canUseCharacterAction(id);
      refs.manualActionButton.classList.toggle('disabled', !usable);
      refs.manualActionButton.classList.toggle('controlLocked', isCharacterActionLocked(c));
      refs.manualActionButton.setAttribute('aria-disabled', String(!usable));
    }
    CHAR_DEFS[id].skills.forEach((s, i) => {
      const cd = c.skillCds[i];
      const pct = cd > 0 ? Math.round((cd / (s.cd * 1000)) * 100) : 0;
      refs.skillIcons[i].style.height = pct + '%';
    });
    const atkPct = Math.round((1 - c.actionCountdown / CHAR_DEFS[id].atkInterval) * 100);
    refs.atkBar.style.width = Math.max(0, Math.min(100, atkPct)) + '%';
  });

  const combatItemAction = document.querySelector('#combatActionBar .combatItemAction');
  if (combatItemAction) {
    const itemId = equippedCombatItemId;
    const item = ITEM_DEFS[itemId];
    const cooldown = combatItemCooldowns[itemId] || 0;
    const cooldownMax = item ? item.combatAction.cooldown * 1000 : 1;
    combatItemAction.querySelector('.itemCdOverlay').style.height = `${Math.round((cooldown / cooldownMax) * 100)}%`;
    combatItemAction.querySelector('.itemCdText').textContent = cooldown > 0 ? Math.ceil(cooldown / 1000) : '';
    const qtyEl = combatItemAction.querySelector('.quickQty');
    if (qtyEl && itemId) qtyEl.textContent = `×${inventoryItemCount(itemId)}`;
    const usable = !!itemId && canUseCombatItem(itemId);
    combatItemAction.classList.toggle('disabled', !usable);
    combatItemAction.setAttribute('aria-disabled', String(!usable));
  }
}

function clampPct(v, max) {
  return Math.max(0, Math.min(100, (v / max) * 100));
}
