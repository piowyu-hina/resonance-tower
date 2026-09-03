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
};

// The preparation phase is a small location hub: village is the outer layer,
// while character/loadout management lives inside the home location.
let prepLocation = 'village';
let homeEls = {};

// Call before opening `nextId`: enforces "only one overlay/popover open at a
// time" so callers never have to manually juggle every other overlay's flag.
function closeOtherOverlays(nextId) {
  if (activeOverlay && activeOverlay !== nextId) OVERLAY_CLOSERS[activeOverlay]();
}

function showDefeatOverlay() {
  if (activeOverlay && OVERLAY_CLOSERS[activeOverlay]) OVERLAY_CLOSERS[activeOverlay]();
  const overlay = document.getElementById('defeatOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

function confirmDefeat() {
  const overlay = document.getElementById('defeatOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  log('遠征失敗。本次遠征取得的金幣與戰利品已遺失。', 'warn');
  endRun(false);
  render();
}

function showVictoryOverlay(securedGold) {
  document.getElementById('victoryReward').textContent = `帶回 ${securedGold} 金幣。`;
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
  portraitEl.classList.remove('hitFlash');
  void portraitEl.offsetWidth; // restart animation
  portraitEl.classList.add('hitFlash');
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
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  const maxX = window.innerWidth - 210;
  const maxY = window.innerHeight - 120;
  if (x > maxX) x = e.clientX - pad - 200;
  if (y > maxY) y = e.clientY - pad - 100;
  tooltipEl.style.left = x + 'px';
  tooltipEl.style.top = y + 'px';
}

function positionTooltipAbove(el) {
  const gap = 8;
  const edge = 8;
  const rect = el.getBoundingClientRect();
  const width = tooltipEl.offsetWidth;
  const height = tooltipEl.offsetHeight;
  let x = rect.left + (rect.width - width) / 2;
  let y = rect.top - height - gap;
  x = Math.max(edge, Math.min(window.innerWidth - width - edge, x));
  if (y < edge) y = rect.bottom + gap;
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
  el.addEventListener('mouseenter', () => {
    const missingImage = el.querySelector('.statusIcon').classList.contains('missing');
    const remainingMs = status.remaining ? status.remaining(character) : 0;
    tooltipEl.innerHTML = statusTooltipHTML(status, missingImage, remainingMs);
    tooltipEl.style.display = 'block';
    positionTooltipAbove(el);
  });
  el.addEventListener('mouseleave', hideTooltip);
}

function itemTooltipHTML(item, entry) {
  return `
    <div class="ttName">${item.name}</div>
    <div class="ttStat">稀有度：${item.rarity}</div>
    ${entry ? `<div class="ttStat">持有數量：${entry.qty}</div>` : ''}
    <div class="ttStat">${item.desc}</div>
  `;
}

function attachItemTooltip(el, item, entry) {
  el.addEventListener('mouseenter', e => showTooltipContent(itemTooltipHTML(item, entry), e));
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

function coinTooltipHTML(context) {
  const inShop = context === 'shop';
  const inTown = inShop ? shopMode === 'town' : phase === 'prepFloor' && !partyLocked;
  const amount = inShop ? shopGold() : (inTown ? bankedGold : runGold);
  const heading = inTown ? '村莊金幣' : '遠征中的金幣';
  const description = inTown
    ? '已帶回村莊，可在城外商店使用。'
    : '這趟遠征途中取得，可在地城商店使用；撤退或通關後才會帶回村莊。';
  return `<div class="coinTip"><img src="assets/item/coin.png" alt=""><div><small>${heading}</small><b>${amount}</b></div><p>${description}</p></div>`;
}

function attachCoinTooltip(el, context) {
  const show = event => {
    tooltipEl.innerHTML = coinTooltipHTML(context);
    tooltipEl.style.display = 'block';
    event && event.clientX ? positionTooltip(event) : positionTooltipAbove(el);
  };
  el.addEventListener('mouseenter', show);
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
  el.addEventListener('focus', show);
  el.addEventListener('blur', hideTooltip);
}

function attachCombatActionTooltip(el, getItemId) {
  el.addEventListener('mouseenter', e => {
    const itemId = getItemId();
    const item = ITEM_DEFS[itemId];
    const html = item
      ? itemTooltipHTML(item, { qty: inventoryItemCount(itemId) })
      : '<div class="ttName">藥水槽</div><div class="ttStat">目前沒有放入藥水</div>';
    showTooltipContent(html, e);
  });
  el.addEventListener('mousemove', positionTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

function attachActiveRelicTooltip(el, character) {
  el.addEventListener('mouseenter', e => {
    const item = ITEM_DEFS[character.loadout.activeItemId];
    const html = item
      ? itemTooltipHTML(item, null)
      : '<div class="ttName">護符槽</div><div class="ttStat">目前沒有裝備護符</div>';
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
  const item = itemId && ITEM_DEFS[itemId];
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
  slot.innerHTML = loadoutItemHTML(itemId, '◇', '護符槽');
  slot.classList.toggle('equipped', !!itemId);
}

function renderCharmPicker(character) {
  const list = document.getElementById('charmPickerList');
  list.innerHTML = '';
  inventory.forEach(entry => {
    if (!entry) return;
    const item = ITEM_DEFS[entry.itemId];
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
  empty.innerHTML = '<span class="pickerEmptyIcon">◇</span><span>不裝備護符</span>';
  empty.addEventListener('click', event => {
    event.stopPropagation();
    character.loadout.activeItemId = null;
    setCharmPickerOpen(false);
    render();
  });
  list.appendChild(empty);
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
  const rect = anchor.getBoundingClientRect();
  const pickerRect = picker.getBoundingClientRect();
  picker.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - pickerRect.width - 8))}px`;
  const below = rect.bottom + 7;
  picker.style.top = `${below + pickerRect.height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - pickerRect.height - 7)}px`;
}

function renderExpeditionSelectedSummary() {
  const summary = document.getElementById('expeditionSelectedSummary');
  if (!summary) return;
  const character = roster.find(member => party.includes(member.id));
  if (!character) {
    summary.innerHTML = '<div class="expeditionEmptySelection">尚未選擇附身角色</div>';
    return;
  }
  const def = CHAR_DEFS[character.id];
  const bossIdentity = phase === 'prepBoss' ? `
    <div class="expeditionSelectedIdentity bossSelectedIdentity">
      <img src="${characterPortraitPath(character.id)}" alt="${def.name}">
      <div><small>${character.id === 'wuming' ? '目前出戰' : '目前附身'}</small><b>${def.name}</b><span>Lv.${character.level}</span></div>
    </div>` : '';
  summary.innerHTML = `
    ${bossIdentity}
    <div class="expeditionLoadout">
      <div><small>藥水</small><div class="quickSlot combatItemQuickSlot" role="button" tabindex="0"></div></div>
      <div><small>護符</small><div class="quickSlot activeQuickSlot"></div></div>
    </div>`;
  const combatSlot = summary.querySelector('.combatItemQuickSlot');
  combatSlot.innerHTML = loadoutItemHTML(equippedCombatItemId, '＋', '選擇藥水');
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
  Object.entries(ITEM_DEFS).forEach(([itemId, item]) => {
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
  emptyOption.innerHTML = '<span class="pickerEmptyIcon">◇</span><span>不攜帶道具</span>';
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
  const rect = anchor.getBoundingClientRect();
  const pickerRect = picker.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 7;
  if (left + pickerRect.width > window.innerWidth - 8) left = window.innerWidth - pickerRect.width - 8;
  if (top + pickerRect.height > window.innerHeight - 8) top = rect.top - pickerRect.height - 7;
  picker.style.left = `${Math.max(8, left)}px`;
  picker.style.top = `${Math.max(8, top)}px`;
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

const SHOP_DIALOGUE = {
  town: [
    '歡迎。需要補給，還是有漂亮的結晶要賣？',
    '藥水都整理好了，出發前記得檢查行囊。',
    '魔物結晶很受歡迎，我會給你公道的價格。'
  ],
  dungeon: [
    '能在這裡碰見也算緣分，要補給就趁現在。',
    '地城裡可沒有下一間店，別省過頭了。',
    '時間不等人。想慢慢挑的話，可以先關掉倒數。'
  ]
};

function renderShopDialogue() {
  if (lastShopDialogueMode !== shopMode) {
    shopDialogueIndex = 0;
    lastShopDialogueMode = shopMode;
  }
  const lines = SHOP_DIALOGUE[shopMode] || SHOP_DIALOGUE.town;
  document.getElementById('shopDialogueText').textContent = lines[shopDialogueIndex % lines.length];
}

function buildShopUI() {
  const buyList = document.getElementById('shopBuyList');
  SHOP_ITEMS.forEach(offer => {
    const item = ITEM_DEFS[offer.itemId];
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
  if (!shopOpen) return;
  document.getElementById('shopTitle').textContent = shopMode === 'town' ? '城外商店' : '地城商店';
  const shopWallet = document.getElementById('shopWallet');
  shopWallet.innerHTML = `<img src="assets/item/coin.png" alt="">${shopGold()}`;
  renderShopDialogue();
  document.getElementById('shopCountdown').textContent = shopMode === 'town'
    ? ''
    : (shopAutoLeave ? `${Math.ceil(shopCountdown / 1000)} 秒後自動離開` : '自動離開已關閉');
  const crystalQty = inventoryItemCount('monsterCrystal');
  document.getElementById('shopMonsterCrystalQty').textContent = `持有 ×${crystalQty}`;
  const sellBtn = document.getElementById('shopSellAllBtn');
  sellBtn.textContent = crystalQty > 0 ? `全部賣出（+${crystalQty * SHOP_MONSTER_CRYSTAL_SELL_PRICE}）` : '沒有可出售物';
  sellBtn.disabled = crystalQty <= 0;
  document.getElementById('shopSellOneBtn').disabled = crystalQty <= 0;
  const autoLeaveBtn = document.getElementById('shopAutoLeaveBtn');
  autoLeaveBtn.style.display = shopMode === 'dungeon' ? '' : 'none';
  autoLeaveBtn.textContent = shopAutoLeave ? '關閉 10 秒倒數' : '開啟 10 秒倒數';
  SHOP_ITEMS.forEach(offer => {
    const row = document.querySelector(`.shopBuyRow[data-item-id="${offer.itemId}"]`);
    row.querySelector('.shopOwned').textContent = `持有 ×${inventoryItemCount(offer.itemId)}`;
    row.querySelector('button').disabled = shopGold() < offer.price;
  });
}

function attachInventoryDrag(slot, index) {
  slot.addEventListener('dragstart', e => {
    if (!inventory[index]) {
      e.preventDefault();
      return;
    }
    inventoryDragFrom = index;
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
    if (inventoryDragFrom === null || inventoryDragFrom === index) return;
    [inventory[inventoryDragFrom], inventory[index]] = [inventory[index], inventory[inventoryDragFrom]];
    inventoryDragFrom = null;
    renderInventory();
  });
  slot.addEventListener('dragend', () => {
    inventoryDragFrom = null;
    document.querySelectorAll('.inventorySlot').forEach(el => el.classList.remove('dragging', 'dragTarget'));
  });
}

function renderInventory() {
  const grid = document.getElementById('inventoryGrid');
  grid.innerHTML = '';
  for (let index = 0; index < INVENTORY_SLOT_COUNT; index++) {
    const entry = inventory[index];
    const slot = document.createElement('div');
    slot.className = `inventorySlot${entry ? '' : ' empty'}`;
    slot.dataset.slotIndex = index;
    slot.draggable = !!entry;
    grid.appendChild(slot);
    attachInventoryDrag(slot, index);

    if (!entry) continue;
    const item = ITEM_DEFS[entry.itemId];
    if (!item || entry.qty <= 0) continue;
    slot.innerHTML = `
      <img src="assets/item/${item.img}.png" alt="${item.name}" draggable="false">
      <span class="inventoryQty">×${entry.qty}</span>
      <span class="inventoryItemName">${item.name}</span>
    `;
    attachItemTooltip(slot, item, entry);
  }

}

function setInventoryOpen(open) {
  if (open) closeOtherOverlays('inventory');
  activeOverlay = open ? 'inventory' : (activeOverlay === 'inventory' ? null : activeOverlay);
  const overlay = document.getElementById('inventoryOverlay');
  overlay.classList.toggle('open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  hideTooltip();
  if (open) renderInventory();
}

function buildUI() {
  tooltipEl = document.getElementById('tooltip');
  attachCoinTooltip(document.getElementById('goldLabel'), 'header');
  attachCoinTooltip(document.getElementById('shopWallet'), 'shop');
  buildShopUI();
  bindDialogueUI();

  document.getElementById('townShopBtn').addEventListener('click', openTownShop);
  document.getElementById('homeLocationBtn').addEventListener('click', () => {
    prepLocation = 'home';
    render();
  });
  document.getElementById('homeBackBtn').addEventListener('click', () => {
    prepLocation = 'village';
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

  document.getElementById('bagBtn').addEventListener('click', () => setInventoryOpen(true));
  document.getElementById('defeatConfirmBtn').addEventListener('click', confirmDefeat);
  document.getElementById('victoryConfirmBtn').addEventListener('click', confirmVictory);
  document.getElementById('inventoryCloseBtn').addEventListener('click', () => setInventoryOpen(false));
  document.getElementById('inventoryOverlay').addEventListener('click', e => {
    if (e.target.id === 'inventoryOverlay') setInventoryOpen(false);
  });
  document.addEventListener('keydown', e => {
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
  const beginCombat = () => {
    partyLocked = true;
    phase = 'combat';
    buildBattleRoster();
    spawnWave();
    party.forEach(id => {
      const c = roster.find(r => r.id === id);
      c.actionCountdown = CHAR_DEFS[id].atkInterval * speedLineIntervalMult(c);
    });
    render();
  };
  startBtnEl.addEventListener('click', () => {
    if (party.length === 0) return; // need at least one character to fight with
    if (phase === 'prepFloor' || phase === 'prepBoss') {
      if (phase === 'prepBoss') {
        phase = 'bossIntro';
        render();
        showBossIntro(beginCombat);
      } else {
        beginCombat();
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
          <span class="atkLabel" title="下次行動倒數">⏱</span>
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
      moreBadge.addEventListener('mouseenter', () => {
        const hiddenNow = STATUS_DEFS.filter(status => status.isActive(c)).slice(4);
        tooltipEl.innerHTML = `
          <div class="ttName">其他狀態</div>
          ${hiddenNow.map(status => `<div class="ttStat">${status.label}：${status.desc}</div>`).join('')}
        `;
        tooltipEl.style.display = 'block';
        positionTooltipAbove(moreBadge);
      });
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
        <span class="atkLabel" title="下次行動倒數">⏱</span>
        <div class="barOuter"><div class="barInner atkBar"></div></div>
      </div>
      <div class="skills"></div>
    `;
    monsterSideEl.appendChild(card);

    const portraitEl = card.querySelector('.portrait');
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
    if (prepLocation === 'village') return '村莊';
    if (prepLocation === 'home') return '家';
    if (prepLocation === 'regions') return '遠征入口';
    return '史萊姆叢林';
  }
  if (phase === 'combat' && monsters.length > 0) {
    const boss = monsters.find(m => m.isBoss);
    return boss ? `${region}　首領戰` : `${region}　小怪 ${mobsCleared + 1}/${MOBS_PER_FLOOR}`;
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
  goldLabel.innerHTML = inFreeVillage
    ? `<img src="assets/item/coin.png" alt="金幣">${bankedGold}`
    : `<img src="assets/item/coin.png" alt="金幣">${runGold}`;
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

  const logEl = document.getElementById('log');
  logEl.style.display = phase === 'combat' ? 'block' : 'none';
  logEl.innerHTML = logLines.map(l => `<div class="logLine ${l.type}">${l.msg}</div>`).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

function renderPrepView() {
  const headingEl = document.getElementById('prepHeading');
  const msgEl = document.getElementById('prepMsg');
  const atVillage = phase === 'prepFloor' && !partyLocked && prepLocation === 'village';
  const atHome = phase === 'prepFloor' && !partyLocked && prepLocation === 'home';
  const atRegions = phase === 'prepFloor' && !partyLocked && prepLocation === 'regions';
  renderRegionContext();
  document.getElementById('villageView').style.display = atVillage ? '' : 'none';
  document.getElementById('homeView').style.display = atHome ? '' : 'none';
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
    headingEl.textContent = `${regionName(floor)}・遠征準備`;
    if (partyLocked) {
      msgEl.textContent = `已選定附身的靈魂，前往${regionName(floor)}，直到死亡或通關前無法更換`;
      startBtnEl.textContent = '繼續前進';
    } else if (party.length === 0) {
      msgEl.textContent = `請先選擇要讓哪個靈魂附身出發（單機模式一次僅能附身 ${SOLO_PARTY_LIMIT} 位，未來開放多人連線後會有更多可能）`;
      startBtnEl.textContent = '開始出擊';
    } else {
      msgEl.textContent = ''; // party already picked - the highlighted card already shows that, no need to say it again
      startBtnEl.textContent = '開始出擊';
    }
    retreatBtnEl.style.display = partyLocked ? '' : 'none';
  } else {
    headingEl.textContent = '首領戰前確認';
    msgEl.textContent = '小怪已清空。確認藥水與護符後，選擇撤退或挑戰首領。';
    startBtnEl.textContent = '挑戰首領';
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
  const region = regionDef(floor);
  const tagHTML = values => values.map(value => `<span>${value}</span>`).join('');
  document.getElementById('forestRegionName').textContent = region.name;
  document.getElementById('forestRegionLevel').textContent = `推薦 Lv.${region.recommendedLevel}`;
  document.getElementById('forestRegionDescription').textContent = region.description;
  document.getElementById('forestRegionThreats').innerHTML = tagHTML(region.threats);
  document.getElementById('forestRegionDrops').textContent = region.drops.join('・');

  const image = document.getElementById('expeditionRegionImage');
  image.src = `assets/ui/${region.image}.png`;
  image.alt = region.name;
  document.getElementById('expeditionRegionName').textContent = region.name;
  document.getElementById('expeditionRegionDescription').textContent = region.description;
  document.getElementById('expeditionRegionLevel').textContent = `Lv.${region.recommendedLevel}`;
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
