import { CHAR_DEFS, GENERAL_STAT_LINES, STAT_LINE_MAX, RARITY_DEFS, ITEM_DEFS } from './constants.js';
import { t } from './i18n.js';
import {
  gameState, lineLevel, lineBookId, isCharUnlocked, characterSkins, equippedSkin,
  characterFullArtPath, equipCharacterSkin, xpToNext, useExpBookOnLine, skillLineKey,
} from './state.js';
import { closeOtherOverlays, overlayUiState } from './ui-overlays.js';
import { hideTooltip, inventoryItemCount } from './ui-loadout.js';
import { flushCombat } from './ui-combat-effects.js';
import { toggleParty } from './combat.js';
import { render } from './ui-main.js';
import { attachHoldRepeat } from './ui-press.js';
export { attachHoldRepeat } from './ui-press.js';
let disposeGrowthHold = null;
let detailReturnFocus = null;
let homeDetailTab = 'growth';

export function setCharacterDetailOpen(open, characterId = null) {
  if (open && gameState.activeOverlay !== 'characterDetail') homeDetailTab = 'growth';
  if (open && gameState.activeOverlay !== 'characterDetail') detailReturnFocus = document.activeElement;
  if (!open) { disposeGrowthHold?.(); disposeGrowthHold = null; }
  if (open) closeOtherOverlays('characterDetail');
  gameState.activeOverlay = open ? 'characterDetail' : (gameState.activeOverlay === 'characterDetail' ? null : gameState.activeOverlay);
  const overlay = document.getElementById('characterDetailOverlay');
  overlay.classList.toggle('open', open);
  overlay.classList.toggle('homeCharacterDetail', open && overlayUiState.prepLocation === 'home');
  overlay.setAttribute('aria-hidden', String(!open));
  hideTooltip();
  if (!open) {
    if (overlayUiState.prepLocation === 'home') render();
    if (detailReturnFocus?.isConnected) detailReturnFocus.focus({ preventScroll: true });
    detailReturnFocus = null;
    return;
  }
  if (!characterId) return;
  renderCharacterDetail(characterId);
  if (overlayUiState.prepLocation === 'home') render();
  document.getElementById('characterDetailCloseBtn').focus({ preventScroll: true });
}

export function attachCharacterCardPress(card, characterId) {
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
export function lineBadgeHTML(c, lineKey) {
  return `<span class="lineBadge" data-line="${lineKey}">${lineLevel(c, lineKey)}</span>`;
}

// press = 1 level, holding repeats `tick()` until released/it returns false.
// `tick` should perform one level-up attempt and return whether to continue.

let selectedGrowthLine = 'atk';

export function growthLineMeta(characterId, lineKey) {
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
export function growthLineValue(c, lineKey, level) {
  const def = CHAR_DEFS[c.id];
  const scale = 1 + level / STAT_LINE_MAX;
  if (lineKey === 'atk') return `${(c.atk * scale).toFixed(1)} 攻擊力`;
  if (lineKey === 'def') return `${(c.def * scale).toFixed(1)} 防禦力`;
  if (lineKey === 'speed') return `${(def.atkInterval * (1 - 0.5 * level / STAT_LINE_MAX) / 1000).toFixed(2)} 秒`;
  if (lineKey === 'action') {
    const cooldownText = `${(def.action.cooldown * (1 - 0.5 * level / STAT_LINE_MAX)).toFixed(1)} 秒冷卻`;
    // Some actions have no magnitude of their own to
    // scale - only cooldown moves. Actions with a magnitude (including guards)
    // show their scaled magnitude alongside it, same as a skill line would.
    if (def.action.type === 'selfBuffAtkDef') {
      return `${cooldownText} · +${(def.action.atkPct * scale * 100).toFixed(1)}% 攻擊 / +${(def.action.defAmount * scale).toFixed(1)} 防禦`;
    }
    if (def.action.type === 'guardAndSlash') {
      return `${cooldownText} · 格擋減傷 ${(Math.min(.85, def.action.reduction * scale) * 100).toFixed(1)}% / 下次斬擊 +${(def.action.slashPct * scale * 100).toFixed(1)}%`;
    }
    if (def.action.type === 'healAndResolve') {
      return `${cooldownText} · 回復 ${(def.action.pct * scale * 100).toFixed(1)}% / 減傷 ${(Math.min(.6, def.action.reduction * scale) * 100).toFixed(1)}%（${def.action.duration} 秒）`;
    }
    return cooldownText;
  }
  const skill = def.skills[Number(lineKey.replace('skill', ''))];
  if (skill.type === 'damage') return `${(skill.mult * scale).toFixed(2)} 倍傷害`;
  if (skill.type === 'evasionSelf') return `${(Math.min(.75, skill.chance * scale) * 100).toFixed(1)}% 閃避（${skill.duration} 秒，上限 75%）`;
  if (skill.type === 'openingStrike') return `${(skill.mult * scale).toFixed(2)} 倍 / 破綻 ${(skill.openingMult * scale).toFixed(2)} 倍傷害`;
  if (skill.type === 'guardSelf') return `單次減傷 ${(Math.min(.85, skill.reduction * scale) * 100).toFixed(1)}%（上限 85%）`;
  if (skill.type === 'counterSlash') return `${(skill.mult * scale).toFixed(2)} 倍 / 反擊 ${(skill.counterMult * scale).toFixed(2)} 倍傷害`;
  if (skill.type === 'healSelf' || skill.type === 'healAlly') return `${(skill.pct * scale * 100).toFixed(1)}% 最大生命`;
  if (skill.type === 'buffAtk') return `+${(skill.pct * scale * 100).toFixed(1)}% 攻擊`;
  if (skill.type === 'buffDefParty') return `+${(skill.amount * scale).toFixed(1)} 防禦`;
  if (skill.type === 'hasteSelf') return `+${(Math.min(0.95, (1 - skill.mult) * scale) * 100).toFixed(1)}% 攻速`;
  return skill.desc;
}

export function growthCardHTML(c, lineKey, imagePath = '') {
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
export function updateGrowthPanelLive(c, lineKey) {
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

export function renderCharacterDetail(characterId) {
  disposeGrowthHold?.();
  disposeGrowthHold = null;
  const c = gameState.roster.find(member => member.id === characterId);
  const def = CHAR_DEFS[characterId];
  if (!c || !def) return;
  const atHome = overlayUiState.prepLocation === 'home';
  if (atHome && isCharUnlocked(characterId)) gameState.seenCharacterIds.add(characterId);
  const unlocked = isCharUnlocked(characterId);
  const selected = gameState.party.includes(characterId);
  const rarity = RARITY_DEFS[def.rarity];
  const skins = characterSkins(characterId);
  const currentSkin = equippedSkin(characterId);
  if (selectedGrowthLine === 'action' && !def.action) selectedGrowthLine = 'atk';
  const activeLine = selectedGrowthLine;
  const activeMeta = growthLineMeta(characterId, activeLine);
  const activeSkill = activeLine === 'action' ? def.action : def.skills[Number(activeLine.replace('skill', ''))];
  const activeLevel = lineLevel(c, activeLine);
  const activeBookId = lineBookId(activeLine);
  const activeBookCount = inventoryItemCount(activeBookId);
  const activeMaxed = activeLevel >= STAT_LINE_MAX;
  const content = document.getElementById('characterDetailContent');
  content.style.setProperty('--rarity-color', rarity.color);
  content.innerHTML = `
    <div class="detailPortraitColumn">
      ${atHome ? `<nav class="homeCharacterPicker" aria-label="選擇培養角色">
        <span class="homeCultivationTitle">角色培養</span>
        <div class="homeCharacterChoices">${gameState.roster.map(member => {
          const available = isCharUnlocked(member.id);
          const isNew = available && !gameState.seenCharacterIds.has(member.id);
          return `<button type="button" data-home-character="${member.id}" aria-pressed="${member.id === characterId}" ${available ? '' : 'disabled'}>
            <span>${CHAR_DEFS[member.id].name}</span>${!available ? '<small>尚未締結契約</small>' : isNew ? '<small>NEW</small>' : ''}</button>`;
        }).join('')}</div>
      </nav>` : ''}
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
      <p class="detailCharacterDescription">${t(`character.description.${characterId}`)}</p>
      <div class="detailSectionTitle detailSectionHeading"><span>共鳴外觀</span><small>目前：${currentSkin.name} · 持有 ${skins.length}</small></div>
      <div class="skinPicker">
        ${skins.map(skin => `
          <button type="button" aria-pressed="${gameState.equippedSkinByCharacter[characterId] === skin.skinId}" class="skinOption${gameState.equippedSkinByCharacter[characterId] === skin.skinId ? ' selected' : ''}" data-skin-id="${skin.skinId}">
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
        ${activeSkill ? `<p class="growthSkillDescription"><span>基礎效果</span>${activeSkill.desc}</p>` : ''}
        <div class="growthCompare"><div><small>目前</small><strong>${growthLineValue(c, activeLine, activeLevel)}</strong></div><span>→</span><div><small>${activeMaxed ? '已達上限' : '下一級'}</small><strong>${growthLineValue(c, activeLine, Math.min(STAT_LINE_MAX, activeLevel + 1))}</strong></div></div>
        <div class="growthUpgradeRow"><span class="growthCost"><img src="assets/item/${ITEM_DEFS[activeBookId].img}.png" alt="">${ITEM_DEFS[activeBookId].name} ×1</span><button id="growthUpgradeBtn" type="button"${activeMaxed || activeBookCount <= 0 ? ' disabled' : ''}>${activeMaxed ? '已滿級' : activeBookCount <= 0 ? '書本不足' : '升級'}</button></div>
      </div>
    </div>
  `;

  if (atHome) {
    // Keep the existing growth controls/handlers, but give each area its own
    // layout so long descriptions never push the upgrade action off screen.
    const profile = document.createElement('section');
    profile.id = 'homeProfilePanel';
    profile.className = 'homeProfilePanel';
    profile.setAttribute('role', 'tabpanel');
    profile.setAttribute('aria-labelledby', 'homeTab-profile');
    const introductionHeading = document.createElement('h3');
    introductionHeading.className = 'homeProfileHeading';
    introductionHeading.textContent = '角色介紹';
    profile.appendChild(introductionHeading);
    for (const selector of ['.detailCharacterDescription', '.detailSectionHeading', '.skinPicker']) {
      profile.appendChild(content.querySelector(selector));
    }
    profile.querySelector('.detailSectionHeading small').remove();
    content.querySelector('.detailArtFrame').before(content.querySelector('.detailIdentity'));
    const info = content.querySelector('.detailInfo');
    const inspector = content.querySelector('.growthInspector');
    const choices = document.createElement('div');
    choices.className = 'homeGrowthChoices';
    for (const child of [...info.children]) {
      if (!child.classList.contains('detailTitleRow') && child !== inspector) choices.appendChild(child);
    }
    inspector.before(choices);
    const explanation = document.createElement('div');
    explanation.className = 'homeGrowthExplanation';
    for (const child of [...inspector.children]) {
      if (child.matches('.growthSkillDescription')) explanation.appendChild(child);
    }
    inspector.querySelector('.growthCompare').before(explanation);
    const growth = document.createElement('section');
    growth.id = 'homeGrowthPanel';
    growth.className = 'homeGrowthPanel';
    growth.setAttribute('role', 'tabpanel');
    growth.setAttribute('aria-labelledby', 'homeTab-growth');
    growth.append(content.querySelector('.growthWallet'), choices, inspector);
    info.append(growth, profile);
    const tabs = document.createElement('div');
    tabs.className = 'homeDetailTabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', '角色資訊');
    tabs.innerHTML = '<button type="button" role="tab" id="homeTab-growth" aria-controls="homeGrowthPanel" data-home-tab="growth">培養</button><button type="button" role="tab" id="homeTab-profile" aria-controls="homeProfilePanel" data-home-tab="profile">角色</button>';
    info.querySelector('.detailTitleRow').replaceWith(tabs);
    const selectTab = (tab, focus = false) => {
      homeDetailTab = tab;
      growth.hidden = tab !== 'growth';
      profile.hidden = tab !== 'profile';
      tabs.querySelectorAll('button').forEach(button => {
        const selected = button.dataset.homeTab === tab;
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        if (selected && focus) button.focus({ preventScroll: true });
      });
    };
    tabs.addEventListener('click', event => {
      const button = event.target.closest('[data-home-tab]');
      if (button) selectTab(button.dataset.homeTab);
    });
    tabs.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      selectTab(event.key === 'Home' ? 'growth' : event.key === 'End' ? 'profile' : homeDetailTab === 'growth' ? 'profile' : 'growth', true);
    });
    selectTab(homeDetailTab);
  }

  const fullArt = content.querySelector('.detailArtFrame img');
  content.querySelectorAll('[data-home-character]').forEach(button => {
    button.addEventListener('click', () => {
      const nextId = button.dataset.homeCharacter;
      if (!isCharUnlocked(nextId)) return;
      selectedGrowthLine = 'atk';
      renderCharacterDetail(nextId);
      render();
      content.querySelector(`[data-home-character="${nextId}"]`)?.focus({ preventScroll: true });
    });
  });
  fullArt.addEventListener('load', () => content.querySelector('.detailArtFrame').classList.add('loaded'));
  fullArt.addEventListener('error', () => {
    fullArt.remove();
    content.querySelector('.detailArtFrame').classList.add('missing');
  });
  content.querySelectorAll('.growthCard[data-line]').forEach(el => {
    el.addEventListener('click', () => {
      selectedGrowthLine = el.dataset.line;
      renderCharacterDetail(characterId);
      content.querySelector(`.growthCard[data-line="${selectedGrowthLine}"]`)?.focus({ preventScroll: true });
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
  disposeGrowthHold = attachHoldRepeat(upgradeBtn, () => {
    if (gameState.activeOverlay !== 'characterDetail' || !useExpBookOnLine(characterId, activeLine)) return false;
    updateGrowthPanelLive(c, activeLine);
    return lineLevel(c, activeLine) < STAT_LINE_MAX && inventoryItemCount(lineBookId(activeLine)) > 0;
  }, () => {
    const restoreFocus = document.activeElement === upgradeBtn;
    renderCharacterDetail(characterId);
    render();
    if (restoreFocus) {
      const nextButton = document.getElementById('growthUpgradeBtn');
      const target = nextButton.disabled ? document.querySelector(`.growthCard[data-line="${activeLine}"]`) : nextButton;
      target?.focus({ preventScroll: true });
    }
  });

  const selectBtn = document.getElementById('characterDetailSelectBtn');
  const isWuming = characterId === 'wuming';
  selectBtn.textContent = !unlocked ? '尚未締結契約' : selected ? (isWuming ? '目前出戰中' : '目前附身中') : gameState.partyLocked ? '本次遠征角色已鎖定' : (isWuming ? '設為出戰角色' : '設為附身對象');
  selectBtn.disabled = !unlocked || selected || gameState.partyLocked;
  selectBtn.style.display = overlayUiState.prepLocation === 'home' ? 'none' : '';
  selectBtn.addEventListener('click', () => {
    toggleParty(characterId);
    renderCharacterDetail(characterId);
    flushCombat();
  });
}

export const shopUiState = {
  shopDialogueIndex: 0,
  lastShopDialogueMode: null,
  shopTab: 'buy',
  lastShopTabMode: null,
  wasShopOpen: false,
};

export const SHOP_DIALOGUE_KEYS = {
  town: ['shop.dialogue.town.0', 'shop.dialogue.town.1', 'shop.dialogue.town.2'],
  dungeon: ['shop.dialogue.dungeon.0', 'shop.dialogue.dungeon.1', 'shop.dialogue.dungeon.2'],
};
