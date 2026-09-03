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
    flushCombat();
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
    flushCombat();
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
