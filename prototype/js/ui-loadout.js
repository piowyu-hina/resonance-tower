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
  const bossIdentity = phase === PHASES.PREP_BOSS ? `
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
  combatSlot.classList.toggle('locked', phase === PHASES.COMBAT);
  attachCombatActionTooltip(combatSlot, () => equippedCombatItemId);
  const openPicker = event => {
    event.stopPropagation();
    if (!isPrepPhase()) return;
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
    if (!isPrepPhase()) return;
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
