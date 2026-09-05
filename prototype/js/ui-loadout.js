import { CHAR_DEFS, localizedItemDef, ITEM_DEFS } from './constants.js';
import { gameState, calcDef, xpToNext, PHASES, isPrepPhase, characterPortraitPath, characterFullArtPath, characterActionCooldown } from './state.js';
import { t, formatLocaleNumber } from './i18n.js';
import { closeOtherOverlays } from './ui-overlays.js';
import { render } from './ui-main.js';

export function charTooltipHTML(id) {
  const c = gameState.roster.find(r => r.id === id);
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

export function skillTooltipHTML(skill) {
  return `
    <div class="ttName">${skill.name}</div>
    <div class="ttStat">冷卻：${skill.cd} 秒</div>
    <div class="ttStat">${skill.desc}</div>
  `;
}

export function characterActionTooltipHTML(action, character = null) {
  const cooldown = character ? characterActionCooldown(character) / 1000 : action.cooldown;
  return `
    <div class="ttName">${action.name}</div>
    <div class="ttStat">手動操作・冷卻 ${cooldown.toFixed(1)} 秒</div>
    <div class="ttStat">基礎效果：${action.desc}</div>
  `;
}

export function attachCharacterActionTooltip(el, action, character = null) {
  el.addEventListener('mouseenter', e => showTooltipContent(characterActionTooltipHTML(action, character), e));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

export function statusTooltipHTML(status, missingImage = false, remainingMs = 0) {
  return `
    <div class="ttName">${status.label}</div>
    <div class="ttStat">${status.desc}</div>
    ${remainingMs > 0 ? `<div class="ttStat">剩餘：${Math.ceil(remainingMs / 1000)} 秒</div>` : ''}
    ${missingImage ? '<div class="ttMissing">⚠ 缺少狀態圖示素材</div>' : ''}
  `;
}

export function monsterTooltipHTML(m) {
  if (!m) return '';
  return `
    <div class="ttName">${m.name}　Lv.${m.displayLevel ?? m.level}</div>
    <div class="ttStat">HP ${Math.max(0, m.hp)}/${m.maxHp}</div>
    <div class="ttStat">攻擊 ${m.atk}</div>
  `;
}

export function positionTooltip(e) {
  // Game-style cursor tooltip: keep the panel close enough to read as attached
  // to the pointer, with only a small gap so it never sits under the cursor.
  const verticalGap = 5;
  const horizontalGap = 9;
  const edge = 8;
  const width = gameState.tooltipEl.offsetWidth;
  const height = gameState.tooltipEl.offsetHeight;
  let x = e.clientX + horizontalGap;
  if (x + width > window.innerWidth - edge) x = e.clientX - width - horizontalGap;
  x = Math.max(edge, x);
  const y = Math.max(edge, e.clientY - height - verticalGap);
  gameState.tooltipEl.style.left = Math.round(x) + 'px';
  gameState.tooltipEl.style.top = Math.round(y) + 'px';
}

export function showTooltipContent(html, e) {
  if (!html) return;
  gameState.tooltipEl.innerHTML = html;
  gameState.tooltipEl.style.display = 'block';
  positionTooltip(e);
}

export function hideTooltip() {
  gameState.tooltipEl.style.display = 'none';
}

export function attachTextTooltip(el, heading, detail) {
  const html = `<div class="ttName">${heading}</div>${detail ? `<div class="ttStat">${detail}</div>` : ''}`;
  el.addEventListener('mouseenter', event => showTooltipContent(html, event));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

export function attachCharTooltip(el, id) {
  el.addEventListener('mouseenter', (e) => showTooltipContent(charTooltipHTML(id), e));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

export function attachMonsterTooltip(el, m) {
  el.addEventListener('mouseenter', (e) => showTooltipContent(monsterTooltipHTML(m), e));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

export function attachSkillTooltip(el, skill) {
  el.addEventListener('mouseenter', (e) => showTooltipContent(skillTooltipHTML(skill), e));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

export function attachStatusTooltip(el, status, character) {
  const show = e => {
    const missingImage = el.querySelector('.statusIcon').classList.contains('missing');
    const remainingMs = status.remaining ? status.remaining(character) : 0;
    showTooltipContent(statusTooltipHTML(status, missingImage, remainingMs), e);
  };
  const showAtBadge = () => {
    const rect = el.getBoundingClientRect();
    show({ clientX: rect.left, clientY: rect.top });
  };
  el.addEventListener('mouseenter', show);
  el.addEventListener('focus', showAtBadge);
  el.addEventListener('click', showAtBadge);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showAtBadge(); }
    if (e.key === 'Escape') { e.stopPropagation(); hideTooltip(); }
  });
  el.addEventListener('blur', hideTooltip);
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

export function itemTooltipHTML(item, entry) {
  return `
    <div class="ttName">${item.name}</div>
    <div class="ttStat">${t('tooltip.rarity', { rarity: item.rarity })}</div>
    ${entry ? `<div class="ttStat">${t('tooltip.owned', { quantity: formatLocaleNumber(entry.qty) })}</div>` : ''}
    <div class="ttStat">${item.desc}</div>
  `;
}

export function attachItemTooltip(el, item, entry) {
  el.addEventListener('mouseenter', e => showTooltipContent(itemTooltipHTML(item, entry), e));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

export function attachCombatActionTooltip(el, getItemId) {
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

export function attachActiveRelicTooltip(el, character) {
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

export function inventoryItemCount(itemId) {
  return gameState.inventory.reduce((total, entry) => total + (entry && entry.itemId === itemId ? entry.qty : 0), 0);
}

export function loadoutItemHTML(itemId, fallbackIcon, fallbackLabel) {
  const item = itemId && localizedItemDef(itemId);
  if (!item) return `<span class="quickFallback">${fallbackIcon}</span><span class="quickLabel">${fallbackLabel}</span>`;
  const qty = item.equipSlot === 'potion' ? inventoryItemCount(itemId) : null;
  return `
    <img src="assets/item/${item.img}.png" alt="${item.name}" draggable="false">
    <span class="quickLabel">${item.name}</span>
    ${qty === null ? '' : `<span class="quickQty">×${qty}</span>`}
  `;
}

export function renderActiveRelicSlot(slot, character) {
  const itemId = character.loadout.activeItemId;
  slot.innerHTML = loadoutItemHTML(itemId, '◇', t('loadout.charmSlot'));
  slot.classList.toggle('equipped', !!itemId);
}

export function renderCharmPicker(character) {
  const list = document.getElementById('charmPickerList');
  list.innerHTML = '';
  gameState.inventory.forEach(entry => {
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
export function positionPickerNearAnchor(picker, anchor) {
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

export function setCharmPickerOpen(open, anchor = null, character = null) {
  if (open) closeOtherOverlays('charmPicker');
  gameState.activeOverlay = open ? 'charmPicker' : (gameState.activeOverlay === 'charmPicker' ? null : gameState.activeOverlay);
  const picker = document.getElementById('charmPicker');
  picker.classList.toggle('open', open);
  picker.setAttribute('aria-hidden', String(!open));
  hideTooltip();
  if (!open || !anchor || !character) return;
  renderCharmPicker(character);
  positionPickerNearAnchor(picker, anchor);
}

export function renderExpeditionSelectedSummary() {
  const summary = document.getElementById('expeditionSelectedSummary');
  if (!summary) return;
  const character = gameState.roster.find(member => gameState.party.includes(member.id));
  const hero = document.getElementById('expeditionHeroPortrait');
  const heroPath = characterFullArtPath(character?.id || 'wuming');
  if (hero.getAttribute('src') !== heroPath) hero.src = heroPath;
  document.getElementById('expeditionView').classList.toggle('noDeployment', !character);
  if (!character) {
    summary.innerHTML = `<div class="expeditionEmptySelection">${t('loadout.notSelected')}</div>`;
    return;
  }
  const def = CHAR_DEFS[character.id];
  const selectedIdentity = `
    <div class="expeditionSelectedIdentity${gameState.phase === PHASES.PREP_BOSS ? ' bossSelectedIdentity' : ''}">
      <img src="${characterPortraitPath(character.id)}" alt="${def.name}">
      <div><small>${t(character.id === 'wuming' ? 'loadout.currentDeployment' : 'loadout.currentPossession')}</small><b>${def.name}</b><span>${t('format.level', { level: formatLocaleNumber(character.level) })}</span></div>
    </div>`;
  summary.innerHTML = `
    ${selectedIdentity}
    <div class="expeditionLoadoutBlock">
      <div class="expeditionStepLabel"><span>3</span>${t('loadout.equipment')}</div>
      <div class="expeditionLoadout">
        <div><small>${t('loadout.potion')}</small><div class="quickSlot combatItemQuickSlot" role="button" tabindex="0"></div></div>
        <div><small>${t('loadout.charm')}</small><div class="quickSlot activeQuickSlot"></div></div>
      </div>
      <div class="expeditionTechniquePreview">
        ${[...def.skills, def.action].map(skill => `<span tabindex="0" role="img" aria-label="${skill.name}：${skill.desc}"><img src="assets/skills/${skill.img}.png" alt=""></span>`).join('')}
      </div>
    </div>`;
  summary.querySelectorAll('.expeditionTechniquePreview > span').forEach((icon, index) => {
    const action = index === def.skills.length;
    const skill = action ? def.action : def.skills[index];
    if (action) attachCharacterActionTooltip(icon, skill, character);
    else attachSkillTooltip(icon, skill);
    icon.addEventListener('focus', () => {
      const rect = icon.getBoundingClientRect();
      showTooltipContent(action ? characterActionTooltipHTML(skill, character) : skillTooltipHTML(skill), { clientX: rect.left, clientY: rect.bottom });
    });
    icon.addEventListener('blur', hideTooltip);
  });
  const combatSlot = summary.querySelector('.combatItemQuickSlot');
  combatSlot.innerHTML = loadoutItemHTML(gameState.equippedCombatItemId, '＋', t('picker.potion'));
  combatSlot.classList.toggle('equipped', !!gameState.equippedCombatItemId);
  combatSlot.classList.toggle('locked', gameState.phase === PHASES.COMBAT);
  attachCombatActionTooltip(combatSlot, () => gameState.equippedCombatItemId);
  const openPicker = event => {
    event.stopPropagation();
    if (!isPrepPhase()) return;
    if (gameState.activeOverlay === 'combatItemPicker') {
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
    if (gameState.activeOverlay === 'charmPicker') {
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

export function renderCombatItemPicker() {
  const list = document.getElementById('combatItemPickerList');
  list.innerHTML = '';
  Object.keys(ITEM_DEFS).forEach(itemId => {
    const item = localizedItemDef(itemId);
    if (!item.combatAction) return;
    const qty = inventoryItemCount(itemId);
    const option = document.createElement('button');
    option.type = 'button';
    option.className = `pickerItem${gameState.equippedCombatItemId === itemId ? ' selected' : ''}${qty <= 0 ? ' unavailable' : ''}`;
    option.innerHTML = `
      <img src="assets/item/${item.img}.png" alt="${item.name}">
      <span>${item.name}</span>
      <b>×${qty}</b>
    `;
    option.addEventListener('click', event => {
      event.stopPropagation();
      if (qty <= 0) return;
      gameState.equippedCombatItemId = itemId;
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
    gameState.equippedCombatItemId = null;
    setCombatItemPickerOpen(false);
    render();
  });
  list.appendChild(emptyOption);
}

export function setCombatItemPickerOpen(open, anchor = null) {
  if (open) closeOtherOverlays('combatItemPicker');
  gameState.activeOverlay = open ? 'combatItemPicker' : (gameState.activeOverlay === 'combatItemPicker' ? null : gameState.activeOverlay);
  const picker = document.getElementById('combatItemPicker');
  picker.classList.toggle('open', open);
  picker.setAttribute('aria-hidden', String(!open));
  hideTooltip();
  if (!open || !anchor) return;
  renderCombatItemPicker();
  positionPickerNearAnchor(picker, anchor);
}
