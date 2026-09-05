import { CHAR_DEFS, RARITY_DEFS, regionName, localizedRegionDef, MOBS_PER_FLOOR, SOLO_PARTY_LIMIT, GOO_SKILL_CD_MS, ITEM_DEFS, RUINS_KILL_TARGET } from './constants.js';
import {
  gameState, PHASES, isPrepPhase, isCombatSurfacePhase, contractStoryLocked, isCharUnlocked,
  characterPortraitPath, characterBattlePortraitPath, characterSkins, equippedSkin, unlockReqText, aliveMonsters,
  RESONANCE_STATES, setResonanceState, CHAPTER1_STATES,
  characterActionInterval, characterActionCooldown,
  activeCharacterStatuses,
} from './state.js';
import { t, formatLocaleNumber } from './i18n.js';
import {
  attachTextTooltip, attachCharTooltip, attachSkillTooltip, attachCharacterActionTooltip, attachActiveRelicTooltip,
  attachStatusTooltip, attachMonsterTooltip, attachCombatActionTooltip, hideTooltip, positionTooltip,
  showTooltipContent, inventoryItemCount, loadoutItemHTML, renderActiveRelicSlot, renderExpeditionSelectedSummary,
  setCombatItemPickerOpen, setCharmPickerOpen,
} from './ui-loadout.js';
import { buildShopUI, setInventoryOpen, renderShopView } from './ui-commerce.js';
import { bindDialogueUI, queueDialogue } from './story.js';
import {
  OVERLAY_CLOSERS, overlayUiState, restartAfterDefeat, returnToVillageAfterDefeat, confirmVictory, showBossIntro,
  showDungeonEntry, prepareBossCombat, prepareRuinsLordCombat, prepareDungeonCombat,
  activatePreparedCombat, activatePreparedRuinsLord, animateSurfaceChange,
} from './ui-overlays.js';
import { setCharacterDetailOpen } from './ui-character.js';
import { resetBossEntryCooldowns, doRetreat, toggleParty, canUseCharacterAction, isCharacterActionLocked, useCharacterAction } from './combat.js';
import { openTownShop, useCombatItem, canUseCombatItem } from './shop.js';
import { flushCombat, updateMonsterSkillIcons } from './ui-combat-effects.js';
import { renderSaveControls } from './save.js';

export function buildUI() {
  gameState.tooltipEl = document.getElementById('tooltip');
  attachTextTooltip(document.getElementById('saveGameBtn'), '存檔', '下載目前的永久進度檔案');
  attachTextTooltip(document.getElementById('loadGameBtn'), '讀檔', '從電腦選擇進度檔案');
  buildShopUI();
  bindDialogueUI();

  document.getElementById('townShopBtn').addEventListener('click', openTownShop);
  document.getElementById('homeLocationBtn').addEventListener('click', () => {
    if (gameState.resonanceState.xiaochu === RESONANCE_STATES.GO_HOME) {
      overlayUiState.prepLocation = 'home';
      overlayUiState.homeMode = 'menu';
      render();
      setResonanceState('xiaochu', RESONANCE_STATES.FOLLOWING, { force: true });
      render();
      return;
    }
    if (contractStoryLocked()) return;
    overlayUiState.prepLocation = 'home';
    overlayUiState.homeMode = 'menu';
    render();
  });
  document.getElementById('homeBackBtn').addEventListener('click', () => {
    if (contractStoryLocked()) return;
    overlayUiState.prepLocation = 'village';
    render();
  });
  document.getElementById('homeGrowthBtn').addEventListener('click', () => {
    if (contractStoryLocked()) return;
    overlayUiState.homeMode = 'growth';
    render();
  });
  document.getElementById('homeGrowthBackBtn').addEventListener('click', () => {
    overlayUiState.homeMode = 'menu';
    render();
  });
  document.getElementById('expeditionLocationBtn').addEventListener('click', () => {
    if (gameState.phase !== PHASES.PREP_FLOOR || gameState.partyLocked) return;
    overlayUiState.prepLocation = 'regions';
    render();
  });
  document.getElementById('regionBackBtn').addEventListener('click', () => {
    overlayUiState.prepLocation = 'village';
    render();
  });
  document.getElementById('forestRegionBtn').addEventListener('click', () => {
    overlayUiState.prepLocation = 'expedition';
    render();
  });
  document.getElementById('expeditionBackBtn').addEventListener('click', () => {
    overlayUiState.prepLocation = 'regions';
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
    if (e.target.id === 'inventoryOverlay') setInventoryOpen(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && gameState.activeOverlay === 'dialogue') {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && gameState.activeOverlay) OVERLAY_CLOSERS[gameState.activeOverlay]();
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
  gameState.startBtnEl = document.createElement('button');
  gameState.startBtnEl.id = 'startBtn';
  gameState.startBtnEl.addEventListener('click', () => {
    if (gameState.party.length === 0) return; // need at least one character to fight with
    if (gameState.phase === PHASES.PREP_FLOOR || gameState.phase === PHASES.PREP_BOSS) {
      if (gameState.phase === PHASES.PREP_BOSS) {
        resetBossEntryCooldowns();
        // Replace the finished mob wave before the combat view becomes visible.
        // Otherwise display:none -> block restarts every retained death animation
        // behind the translucent boss entrance.
        if (gameState.expeditionMode === 'ruins') {
          prepareRuinsLordCombat();
          showBossIntro(activatePreparedRuinsLord, {
            name: '遺跡之主',
            image: 'assets/monsters/floor1/relics_master.png',
            variant: 'ruinsMaster',
          });
        } else {
          prepareBossCombat();
          showBossIntro(activatePreparedCombat);
        }
      } else {
        showDungeonEntry(prepareDungeonCombat, activatePreparedCombat);
      }
    }
  });
  gameState.retreatBtnEl = document.createElement('button');
  gameState.retreatBtnEl.id = 'retreatBtn';
  gameState.retreatBtnEl.textContent = '返回村莊';
  gameState.retreatBtnEl.addEventListener('click', () => {
    doRetreat();
    flushCombat();
  });
  actionArea.appendChild(gameState.startBtnEl);
  actionArea.appendChild(gameState.retreatBtnEl);

  // Expedition is a quick possession choice; detailed growth stays at Home.
  const prepRosterEl = document.getElementById('prepRoster');
  prepRosterEl.innerHTML = '';
  gameState.roster.forEach(c => {
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

    gameState.prepEls[c.id] = {
      card,
      lvl: card.querySelector('.lvl'),
      lockReq: card.querySelector('.lockReq'),
      portrait: card.querySelector('.portrait img'),
    };
    card.addEventListener('click', () => { toggleParty(c.id); flushCombat(); });
    attachCharTooltip(card.querySelector('.portrait'), c.id);
  });

  const homeRosterEl = document.getElementById('homeRoster');
  homeRosterEl.innerHTML = '';
  gameState.roster.forEach(c => {
    const def = CHAR_DEFS[c.id];
    const rarity = RARITY_DEFS[def.rarity];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'homeGrowthCard';
    card.style.setProperty('--rarity-color', rarity.color);
    card.innerHTML = `
      <span class="homeGrowthNew" hidden>NEW</span>
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
      gameState.seenCharacterIds.add(c.id);
      render();
      setCharacterDetailOpen(true, c.id);
    });
    homeRosterEl.appendChild(card);
    overlayUiState.homeEls[c.id] = { card, lvl: card.querySelector('.lvl'), portrait: card.querySelector('.homeGrowthPortrait img'), newBadge: card.querySelector('.homeGrowthNew') };
  });
}

// battle roster: ONLY the characters currently in `party`, shown as a row
// below the monster. Rebuilt fresh every time a fight starts (prepFloor/prepBoss
// -> combat) - benched characters never appear here at all while fighting.
export function buildBattleRoster() {
  gameState.charEls = {};
  const partySideEl = document.getElementById('partySide');
  partySideEl.innerHTML = '';
  gameState.party.forEach(id => {
    const def = CHAR_DEFS[id];
    const card = document.createElement('div');
    card.className = 'charCard';
    card.innerHTML = `
      <div class="portrait">
        <img class="${equippedSkin(id).battlePortrait ? 'softBattleArt' : ''}" src="${characterBattlePortraitPath(id)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
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
    gameState.charEls[id] = {
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
export function buildCombatActionBar() {
  const barEl = document.getElementById('combatActionBar');
  const itemId = gameState.equippedCombatItemId;
  barEl.innerHTML = `
    <span class="actionBarTitle">戰鬥操作</span>
    <button class="combatItemButton combatItemAction" type="button" aria-label="使用藥水">
      ${loadoutItemHTML(itemId, '◇', '空藥水槽')}
      <span class="itemCdOverlay"></span>
      <span class="itemCdText"></span>
    </button>
    <div class="relicActions"></div>
    ${gameState.expeditionMode === 'ruins' && !gameState.monsters.some(monster => monster.storyBoss) ? '<button class="ruinsLeaveButton" type="button">離開遺跡</button>' : ''}
  `;
  const relicActions = barEl.querySelector('.relicActions');
  const combatItemAction = barEl.querySelector('.combatItemAction');
  attachCombatActionTooltip(combatItemAction, () => gameState.equippedCombatItemId);
  combatItemAction.addEventListener('click', () => {
    if (gameState.equippedCombatItemId) useCombatItem(gameState.equippedCombatItemId);
  });
  barEl.querySelector('.ruinsLeaveButton')?.addEventListener('click', () => {
    doRetreat();
    flushCombat();
  });
  gameState.party.forEach(id => {
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
      gameState.charEls[id].manualActionButton = group.querySelector('.charActionButton');
      gameState.charEls[id].manualActionButton.addEventListener('click', () => { useCharacterAction(id); flushCombat(); });
      attachCharacterActionTooltip(gameState.charEls[id].manualActionButton, action, gameState.roster.find(c => c.id === id));
    }
    gameState.charEls[id].activeQuickSlot = group.querySelector('.activeQuickSlot');
    attachActiveRelicTooltip(gameState.charEls[id].activeQuickSlot, gameState.roster.find(c => c.id === id));
  });
}

export function renderCharacterStatuses(c, container) {
  const active = activeCharacterStatuses(c);
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
      badge.tabIndex = 0;
      badge.setAttribute('role', 'button');
      badge.innerHTML = `
        <span class="statusIcon"></span>
        <span class="statusName">${status.label}</span>
        <span class="statusTime"></span>
      `;
      const iconEl = badge.querySelector('.statusIcon');
      if (status.shortLabel) {
        iconEl.textContent = status.shortLabel;
        iconEl.classList.add('statusGlyph');
      } else if (status.img) {
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
    badge.setAttribute('aria-label', `${status.label}：${status.desc}${remainingMs > 0 ? `，剩餘 ${Math.ceil(remainingMs / 1000)} 秒` : ''}`);
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
        const hiddenNow = activeCharacterStatuses(c).slice(4);
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
export function buildMonsterCards() {
  gameState.monsterEls = {};
  const monsterSideEl = document.getElementById('monsterSide');
  monsterSideEl.innerHTML = '';
  gameState.monsters.forEach(m => {
    const card = document.createElement('div');
    card.className = `monsterCard${m.isBoss ? ' boss' : ''}${m.storyBoss ? ' storyBoss' : ''}`;
    card.innerHTML = `
      <div class="portrait big">
        ${m.img ? `<img src="assets/monsters/${m.img}.png" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">` : ''}
        <div class="fallback" style="display:${m.img ? 'none' : 'flex'};">${m.storyBoss ? '???' : '👾'}</div>
      </div>
      <div class="monsterTopRow">
        <div class="name"></div>
        <span class="lvlTag">Lv.<span class="lvl"></span></span>
      </div>
      <div class="row hpRow">
        <span class="hpLabel">HP</span>
        <div class="barOuter"><div class="barInner hpBar"></div></div>
        <span class="hpText"></span>
      </div>
      <div class="row actionRow">
        <span class="atkLabel" aria-label="下次行動倒數">⏱</span>
        <div class="barOuter"><div class="barInner atkBar"></div></div>
      </div>
      <div class="skills"></div>
    `;
    monsterSideEl.appendChild(card);

    const portraitEl = card.querySelector('.portrait');
    attachTextTooltip(card.querySelector('.atkLabel'), '行動倒數', '進度填滿後進行下一次行動');
    gameState.monsterEls[m.id] = {
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

export function floorLabelText() {
  if (gameState.expeditionMode === 'ruins') {
    if (gameState.monsters.some(monster => monster.storyBoss)) return '遺跡之主';
    return `遺跡之地　${Math.min(gameState.ruinsKillCount, RUINS_KILL_TARGET)}/${RUINS_KILL_TARGET}`;
  }
  const region = regionName(gameState.floor);
    if (gameState.phase === PHASES.PREP_FLOOR && !gameState.partyLocked) {
    if (overlayUiState.prepLocation === 'village') return t('village.title');
    if (overlayUiState.prepLocation === 'home') return t('home.title');
    if (overlayUiState.prepLocation === 'regions') return t('region.title');
    return region;
  }
  if (isCombatSurfacePhase() && gameState.monsters.length > 0) {
    const boss = gameState.monsters.find(m => m.isBoss);
    return boss
      ? t('combat.bossBattle', { region })
      : t('combat.mobProgress', {
        region,
        current: formatLocaleNumber(gameState.mobsCleared + 1),
        total: formatLocaleNumber(MOBS_PER_FLOOR),
      });
  }
  return region;
}

export function render() {
  const inPrep = isPrepPhase();
  const app = document.getElementById('app');
  app.classList.toggle('combatActive', !inPrep);
  app.classList.toggle('ruinsActive', !inPrep && gameState.expeditionMode === 'ruins');
  const inFreeVillage = gameState.phase === PHASES.PREP_FLOOR && !gameState.partyLocked;
  const floorLabelEl = document.getElementById('floorLabel');
  floorLabelEl.textContent = floorLabelText();
  floorLabelEl.style.display = inPrep ? 'none' : '';
  const goldLabel = document.getElementById('goldLabel');
  goldLabel.style.display = inFreeVillage ? 'none' : '';
  goldLabel.innerHTML = inFreeVillage ? '' : `<img src="assets/item/coin.png" alt="遠征金幣">${gameState.runGold}`;
  const bagBtn = document.getElementById('bagBtn');
  bagBtn.setAttribute('aria-label', t('header.openBag'));
  const townShopBtn = document.getElementById('townShopBtn');
  townShopBtn.style.display = (gameState.phase === PHASES.PREP_FLOOR && !gameState.partyLocked) ? '' : 'none';
  renderShopView();

  document.getElementById('prepView').style.display = inPrep ? 'block' : 'none';
  document.getElementById('combatView').style.display = inPrep ? 'none' : 'block';

  if (inPrep) {
    renderPrepView();
  } else {
    renderCombatView();
  }
  const atVillageSurface = gameState.phase === PHASES.PREP_FLOOR && !gameState.partyLocked && overlayUiState.prepLocation === 'village';
  const atHomeSurface = gameState.phase === PHASES.PREP_FLOOR && !gameState.partyLocked && overlayUiState.prepLocation === 'home';
  const atRegionSurface = gameState.phase === PHASES.PREP_FLOOR && !gameState.partyLocked && overlayUiState.prepLocation === 'regions';
  const visibleSurface = !inPrep
    ? document.getElementById('combatView')
    : atVillageSurface
      ? document.getElementById('villageView')
      : atHomeSurface
        ? document.getElementById('homeView')
        : atRegionSurface
          ? document.getElementById('regionView')
          : document.getElementById('expeditionView');
  const surfaceKey = !inPrep ? 'combat' : `${gameState.phase}:${overlayUiState.prepLocation}:${atHomeSurface ? overlayUiState.homeMode : ''}`;
  animateSurfaceChange(visibleSurface, surfaceKey);

  const logEl = document.getElementById('log');
  const logWasVisible = logEl.style.display === 'block';
  const logWasAtBottom = !logWasVisible
    || logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight <= 8;
  const previousLogScrollTop = logEl.scrollTop;
  // Entry phases use the final combat geometry under their opaque curtains.
  // Keeping the log mounted prevents the whole surface from changing height on
  // the first visible frame after either entrance.
  logEl.style.display = inPrep ? 'none' : 'block';
  const logMarkup = `<div class="logHeading"><span>${t('combat.log')}</span></div>${gameState.logLines.map(l => `<div class="logLine ${l.type}">${l.msg}</div>`).join('')}`;
  if (logEl.innerHTML !== logMarkup) {
    logEl.innerHTML = logMarkup;
    logEl.scrollTop = logWasAtBottom ? logEl.scrollHeight : previousLogScrollTop;
  }
  renderSaveControls();
}

export function renderPrepView() {
  const headingEl = document.getElementById('prepHeading');
  const msgEl = document.getElementById('prepMsg');
  const atVillage = gameState.phase === PHASES.PREP_FLOOR && !gameState.partyLocked && overlayUiState.prepLocation === 'village';
  const atHome = gameState.phase === PHASES.PREP_FLOOR && !gameState.partyLocked && overlayUiState.prepLocation === 'home';
  const atRegions = gameState.phase === PHASES.PREP_FLOOR && !gameState.partyLocked && overlayUiState.prepLocation === 'regions';
  renderRegionContext();
  document.getElementById('villageView').style.display = atVillage ? '' : 'none';
  const homeView = document.getElementById('homeView');
  homeView.style.display = atHome ? '' : 'none';
  homeView.classList.toggle('showingGrowth', atHome && overlayUiState.homeMode === 'growth');
  document.getElementById('homeMenu').hidden = !atHome || overlayUiState.homeMode !== 'menu';
  document.getElementById('homeGrowthView').hidden = !atHome || overlayUiState.homeMode !== 'growth';
  const storyLocked = contractStoryLocked();
  const waitingForBook = [RESONANCE_STATES.BOOK_PENDING, RESONANCE_STATES.BOOK_READING].includes(gameState.resonanceState.xiaochu);
  const chapterJournal = [CHAPTER1_STATES.JOURNAL_PENDING, CHAPTER1_STATES.JOURNAL_READING].includes(gameState.chapter1State);
  const mustReadJournal = waitingForBook || chapterJournal;
  const oathReady = gameState.resonanceState.xiaochu === RESONANCE_STATES.OATH_READY;
  const mustGoHome = gameState.resonanceState.xiaochu === RESONANCE_STATES.GO_HOME;
  const journalUnlocked = [RESONANCE_STATES.BOOK_PENDING, RESONANCE_STATES.BOOK_READING, RESONANCE_STATES.OATH_READY, RESONANCE_STATES.CONTRACTING, RESONANCE_STATES.CONTRACTED].includes(gameState.resonanceState.xiaochu);
  const contractAvailable = [RESONANCE_STATES.OATH_READY, RESONANCE_STATES.CONTRACTING, RESONANCE_STATES.CONTRACTED].includes(gameState.resonanceState.xiaochu);
  const newCharacter = gameState.roster.find(character => isCharUnlocked(character.id) && !gameState.seenCharacterIds.has(character.id));
  document.getElementById('travelJournalBtn').hidden = !(journalUnlocked || chapterJournal || gameState.chapter1State === CHAPTER1_STATES.COMPLETE);
  document.getElementById('contractFacilityBtn').hidden = !contractAvailable;
  const followingXiaochu = gameState.resonanceState.xiaochu === RESONANCE_STATES.FOLLOWING;
  const xiaochuTalk = document.getElementById('xiaochuTalkBtn');
  xiaochuTalk.hidden = !followingXiaochu;
  xiaochuTalk.disabled = storyLocked || gameState.xiaochuStoryChapter === 1;
  xiaochuTalk.classList.toggle('storyRequired', followingXiaochu && gameState.xiaochuStoryChapter !== 1);
  document.getElementById('xiaochuTalkHint').textContent = t(gameState.xiaochuStoryChapter === 1 ? 'home.xiaochuExplore' : gameState.xiaochuStoryChapter === 2 ? 'home.xiaochuReady' : 'home.xiaochuWelcome');
  const visibleHomeFacilities = [...document.querySelectorAll('#homeMenu .homeFacilityBtn')]
    .filter(element => !element.hidden).length;
  document.getElementById('homeMenu').classList.toggle('singleFacility', visibleHomeFacilities === 1);
  document.getElementById('travelJournalBtn').classList.toggle('storyRequired', mustReadJournal);
  document.getElementById('contractFacilityBtn').classList.toggle('storyRequired', oathReady);
  document.getElementById('homeLocationBtn').classList.toggle('storyRequired', mustGoHome || Boolean(newCharacter && atVillage) || (atVillage && (oathReady || (followingXiaochu && gameState.xiaochuStoryChapter !== 1))));
  document.getElementById('homeGrowthBtn').classList.toggle('storyRequired', Boolean(newCharacter && atHome && overlayUiState.homeMode === 'menu'));
  document.querySelectorAll('.storyFocusTarget,.storyGuideTarget').forEach(element => element.classList.remove('storyFocusTarget', 'storyGuideTarget'));
  let storyFocusTarget = null;
  let storyGuideTarget = null;
  let storyGuideKey = '';
  if (mustGoHome) {
    storyFocusTarget = document.getElementById('homeLocationBtn');
    storyGuideKey = 'village.goHome';
  } else if (mustReadJournal && gameState.activeOverlay !== 'journal') {
    storyFocusTarget = document.getElementById('travelJournalBtn');
    storyGuideKey = 'story.guideJournal';
  } else if (oathReady && atHome && overlayUiState.homeMode === 'menu' && !gameState.activeOverlay) {
    storyGuideTarget = document.getElementById('contractFacilityBtn');
    storyGuideKey = 'story.guideContract';
  }
  if (!storyFocusTarget && newCharacter && !gameState.activeOverlay) {
    if (atVillage) storyGuideTarget = document.getElementById('homeLocationBtn');
    if (atHome && overlayUiState.homeMode === 'menu') storyGuideTarget = document.getElementById('homeGrowthBtn');
    if (storyGuideTarget) storyGuideKey = 'story.guideNewPartner';
  }
  const storyGuide = document.getElementById('homeGuideHina');
  const activeGuideTarget = storyFocusTarget || storyGuideTarget;
  storyGuide.hidden = !activeGuideTarget;
  if (activeGuideTarget) {
    activeGuideTarget.classList.add(storyFocusTarget ? 'storyFocusTarget' : 'storyGuideTarget');
    activeGuideTarget.appendChild(storyGuide);
    const guideText = document.getElementById('storyGuideText');
    guideText.dataset.i18n = storyGuideKey;
    guideText.textContent = t(storyGuideKey);
  }
  document.body.classList.toggle('storyOperationLock', Boolean(storyFocusTarget));
  document.getElementById('homeLocationBtn').disabled = storyLocked && !mustGoHome;
  document.getElementById('townShopBtn').disabled = storyLocked;
  document.getElementById('expeditionLocationBtn').disabled = storyLocked;
  document.getElementById('homeBackBtn').disabled = storyLocked;
  document.getElementById('homeGrowthBtn').disabled = storyLocked;
  document.getElementById('travelJournalBtn').disabled = storyLocked && !mustReadJournal;
  document.getElementById('bagBtn').disabled = storyLocked;
  document.getElementById('regionView').style.display = atRegions ? '' : 'none';
  document.getElementById('expeditionView').style.display = (atVillage || atHome || atRegions) ? 'none' : '';
  Object.entries(overlayUiState.homeEls).forEach(([id, refs]) => {
    const c = gameState.roster.find(entry => entry.id === id);
    refs.lvl.textContent = c.level;
    refs.portrait.src = characterPortraitPath(id);
    const unlocked = isCharUnlocked(id);
    const isNew = unlocked && !gameState.seenCharacterIds.has(id);
    refs.card.classList.toggle('charLocked', !unlocked);
    refs.card.classList.toggle('newCharacter', isNew);
    refs.newBadge.hidden = !isNew;
  });
  if (atVillage || atHome || atRegions) return;

  if (gameState.phase === PHASES.PREP_FLOOR) {
    headingEl.textContent = t('expedition.preparation', { region: regionName(gameState.floor) });
    if (gameState.partyLocked) {
      msgEl.textContent = t('expedition.lockedParty', { region: regionName(gameState.floor) });
      gameState.startBtnEl.textContent = t('expedition.continue');
    } else if (gameState.party.length === 0) {
      msgEl.textContent = t('expedition.chooseSoul', { limit: formatLocaleNumber(SOLO_PARTY_LIMIT) });
      gameState.startBtnEl.textContent = t('expedition.start');
    } else {
      msgEl.textContent = ''; // party already picked - the highlighted card already shows that, no need to say it again
      gameState.startBtnEl.textContent = t('expedition.start');
    }
    gameState.retreatBtnEl.style.display = gameState.partyLocked ? '' : 'none';
  } else {
    headingEl.textContent = t('expedition.bossPrep');
    msgEl.textContent = t('expedition.bossPrepDesc');
    gameState.startBtnEl.textContent = t('expedition.challengeBoss');
    gameState.retreatBtnEl.style.display = '';
  }
  gameState.startBtnEl.disabled = (gameState.party.length === 0);
  document.getElementById('actionArea').style.display = '';
  const choosingCharacter = gameState.phase !== PHASES.PREP_BOSS;
  document.getElementById('expeditionBackBtn').style.display = choosingCharacter ? '' : 'none';
  document.getElementById('expeditionCharacterHeading').style.display = choosingCharacter ? '' : 'none';
  document.getElementById('prepRoster').style.display = choosingCharacter ? '' : 'none';

  gameState.roster.forEach(c => {
    const refs = gameState.prepEls[c.id];
    const inParty = gameState.party.includes(c.id);
    const unlocked = isCharUnlocked(c.id);
    // once locked, only the chosen party is even shown - nothing else to pick
    refs.card.style.display = (!gameState.partyLocked || inParty) ? '' : 'none';
    refs.card.classList.toggle('inParty', inParty);
    refs.card.classList.toggle('runLocked', gameState.partyLocked);
    refs.card.classList.toggle('charLocked', !unlocked);
    refs.lockReq.textContent = unlockReqText(c.id);
    refs.lvl.textContent = c.level;
    refs.portrait.src = characterPortraitPath(c.id);
  });
  renderExpeditionSelectedSummary();
}

export function renderRegionContext() {
  const region = localizedRegionDef(gameState.floor);
  const inBossPrep = gameState.phase === PHASES.PREP_BOSS;
  const isRuinsBoss = inBossPrep && gameState.expeditionMode === 'ruins';
  const tagHTML = values => values.map(value => `<span>${value}</span>`).join('');
  document.getElementById('forestRegionName').textContent = region.name;
  document.getElementById('forestRegionLevel').textContent = t('format.recommendedLevel', {
    level: formatLocaleNumber(region.recommendedLevel),
  });
  document.getElementById('forestRegionDescription').textContent = region.description;
  document.getElementById('forestRegionThreats').innerHTML = tagHTML(region.threats);
  document.getElementById('forestRegionDrops').textContent = region.drops.join('・');

  const image = document.getElementById('expeditionRegionImage');
  const brief = document.getElementById('expeditionRegionBrief');
  brief.setAttribute('aria-label', inBossPrep ? t('expedition.step.bossIntel') : t('expedition.currentRegion'));
  document.getElementById('expeditionRegionStepText').textContent = t(inBossPrep ? 'expedition.step.bossIntel' : 'expedition.step.region');
  image.src = isRuinsBoss ? 'assets/events/ruins_entrance.png' : `assets/ui/${region.image}.png`;
  image.alt = isRuinsBoss ? '???' : region.name;
  document.getElementById('expeditionRegionName').textContent = isRuinsBoss ? '???' : region.name;
  document.getElementById('expeditionRegionDescription').textContent = isRuinsBoss ? '???' : region.description;
  document.getElementById('expeditionRegionLevel').textContent = isRuinsBoss
    ? '???'
    : t('format.level', { level: formatLocaleNumber(region.recommendedLevel) });
  document.getElementById('expeditionRegionBoss').textContent = isRuinsBoss ? '???' : region.boss;
  document.getElementById('expeditionRegionThreats').textContent = isRuinsBoss ? '???' : region.threats.join('・');
}

export function renderCombatView() {
  const boss = gameState.monsters.find(m => m.isBoss);
  document.getElementById('bossArena').classList.toggle('active', !!boss);

  aliveMonsters().forEach(m => {
    const refs = gameState.monsterEls[m.id];
    if (!refs) return;
    refs.nameEl.textContent = m.name;
    refs.lvlEl.textContent = m.displayLevel ?? m.level;
    refs.card.classList.toggle('reflectShield', (m.reflectShieldMs || 0) > 0);
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
      const skill3Remaining = m.storyBoss ? m.skill3Cd : gameState.gooSpawnCountdown;
      const skill3Max = m.storyBoss ? m.skill3.cd * 1000 : GOO_SKILL_CD_MS;
      const skill3CdPct = Math.round((skill3Remaining / skill3Max) * 100);
      refs.skill3CdOverlayEl.style.height = Math.max(0, Math.min(100, skill3CdPct)) + '%';
    }
  });

  gameState.party.forEach(id => {
    const c = gameState.roster.find(r => r.id === id);
    const refs = gameState.charEls[id];
    // Transitional/debug/server-restored states may render before their battle
    // cards are mounted. The next build/render pass will populate them.
    if (!c || !refs) return;
    refs.card.classList.toggle('down', !c.alive);
    refs.hpText.textContent = `${Math.max(0, c.curHp)}/${c.maxHp}${!c.alive ? '（倒下）' : ''}`;
    refs.hpBar.style.width = clampPct(c.curHp, c.maxHp) + '%';
    refs.lvl.textContent = c.level;
    renderCharacterStatuses(c, refs.statusList);
    renderActiveRelicSlot(refs.activeQuickSlot, c);
    const action = CHAR_DEFS[id].action;
    if (action && refs.manualActionButton) {
      const cooldownMax = characterActionCooldown(c);
      refs.manualActionButton.querySelector('.itemCdOverlay').style.height = `${clampPct(c.manualActionCd, cooldownMax)}%`;
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
    const atkPct = Math.round((1 - c.actionCountdown / (c.actionCycleMs || characterActionInterval(c))) * 100);
    refs.atkBar.style.width = Math.max(0, Math.min(100, atkPct)) + '%';
  });

  const combatItemAction = document.querySelector('#combatActionBar .combatItemAction');
  if (combatItemAction) {
    const itemId = gameState.equippedCombatItemId;
    const item = ITEM_DEFS[itemId];
    const cooldown = gameState.combatItemCooldowns[itemId] || 0;
    const cooldownMax = item ? item.combatAction.cooldown * 1000 : 1;
    combatItemAction.querySelector('.itemCdOverlay').style.height = `${Math.round((cooldown / cooldownMax) * 100)}%`;
    combatItemAction.querySelector('.itemCdText').textContent = cooldown > 0 ? Math.ceil(cooldown / 1000) : '';
    const qtyEl = combatItemAction.querySelector('.quickQty');
    if (qtyEl && itemId) qtyEl.textContent = `×${inventoryItemCount(itemId)}`;
    const usable = !!itemId && canUseCombatItem(itemId);
    combatItemAction.classList.toggle('disabled', !usable);
    combatItemAction.setAttribute('aria-disabled', String(!usable));
  }
  const ruinsLeaveButton = document.querySelector('#combatActionBar .ruinsLeaveButton');
  if (ruinsLeaveButton) ruinsLeaveButton.textContent = `離開遺跡 ${Math.min(gameState.ruinsKillCount, RUINS_KILL_TARGET)}/${RUINS_KILL_TARGET}`;
}

export function clampPct(v, max) {
  return Math.max(0, Math.min(100, (v / max) * 100));
}
