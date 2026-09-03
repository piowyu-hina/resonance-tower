// Development helpers are opt-in through ?debug and never render in normal play.
function initDebugTools() {
  if (!DEBUG_MODE) return;

  const toggle = document.getElementById('debugToggleBtn');
  const panel = document.getElementById('debugPanel');
  toggle.hidden = false;
  toggle.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) renderDebugStatus();
  });

  panel.addEventListener('click', event => {
    const button = event.target.closest('[data-debug-action]');
    if (!button) return;
    runDebugAction(button.dataset.debugAction);
  });

  const requestedView = new URLSearchParams(window.location.search).get('view');
  if (requestedView === 'home') {
    prepLocation = 'home';
    homeMode = 'menu';
  }
  if (requestedView === 'growth') {
    prepLocation = 'home';
    homeMode = 'growth';
  }
  if (requestedView === 'regions') prepLocation = 'regions';
  if (requestedView === 'expedition') prepLocation = 'expedition';
  if (requestedView === 'shop') openTownShop();
  if (requestedView === 'inventory' || requestedView === 'inventory-risk') {
    addInventoryItem('potion', 3, true);
    addInventoryItem('monsterCrystal', 2, true);
    setInventoryOpen(true);
  }
  if (requestedView === 'defeat') {
    runGold = 21;
    addInventoryItem('monsterCrystal', 2, true);
    setPhase(PHASES.DEFEAT, { force: true });
    showDefeatOverlay();
  }
  if (requestedView === 'journal') {
    prepLocation = 'home';
    resonanceState.xiaochu = 'bookPending';
    openTravelJournal();
  }
  if (requestedView === 'contract') {
    prepLocation = 'home';
    resonanceState.xiaochu = 'oathReady';
    openContractPanel();
  }
  if (requestedView === 'dialogue' || requestedView === 'dialogue-next') {
    queueDialogue('xiaochu_first_possession');
    if (requestedView === 'dialogue-next') {
      setTimeout(() => document.getElementById('dialogueOverlay').click(), 420);
    }
  }
  if (requestedView === 'dungeon-entry') showDungeonEntry(prepareDungeonCombat, activatePreparedCombat);
  if (requestedView === 'boss-intro') {
    prepLocation = 'expedition';
    mobsCleared = MOBS_PER_FLOOR;
    prepareBossCombat();
    showBossIntro(activatePreparedCombat);
  }
  if (requestedView === 'go-home' || requestedView === 'go-home-flow') {
    setPhase(PHASES.PREP_FLOOR, { force: true });
    partyLocked = false;
    prepLocation = 'village';
    resonanceState.xiaochu = 'goHome';
    setTimeout(() => {
      const button = document.getElementById('homeLocationBtn');
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (hit && (hit === button || button.contains(hit))) button.click();
    }, 350);
    if (requestedView === 'go-home-flow') {
      setTimeout(() => document.getElementById('dialogueOverlay').click(), 600);
      setTimeout(() => document.getElementById('dialogueOverlay').click(), 850);
    }
  }
  if (requestedView === 'boss') debugStartBossFight();
}

function runDebugAction(action) {
  if (action === 'resources') {
    bankedGold += 500;
    addInventoryItem('potion', 10);
    addInventoryItem('speedPotion', 10);
    addInventoryItem('monsterCrystal', 10);
    addInventoryItem('statBook', 20);
    addInventoryItem('skillBook', 20);
    addInventoryItem('powerCharm', 1);
    addInventoryItem('guardCharm', 1);
    addInventoryItem('windCharm', 1);
    log('開發工具：已補充測試資源', 'good');
  } else if (action === 'unlock') {
    unlockedChars = new Set(Object.keys(CHAR_DEFS));
    Object.keys(CHAR_DEFS).forEach(id => {
      if (CHAR_DEFS[id].unlock.type === 'resonanceContract') resonanceState[id] = 'contracted';
    });
    log('開發工具：已解鎖全部角色', 'good');
  } else if (action === 'level') {
    const character = roster.find(member => member.id === party[0]) || roster[0];
    character.level = Math.max(character.level, 10);
    character.xp = 0;
    recomputeStats(character);
    character.curHp = character.maxHp;
    log(`開發工具：${CHAR_DEFS[character.id].name}已升至 ${character.level} 級`, 'good');
  } else if (action === 'boss') {
    debugStartBossFight();
  } else if (action === 'intro') {
    showBossIntro(() => {});
  } else if (action === 'xiaochu-story') {
    closeOtherOverlays(null);
    activeOverlay = null;
    unlockedChars.delete('xiaochu');
    delete resonanceState.xiaochu;
    slimeKillCount = 49;
    prepLocation = 'expedition';
    setPhase(PHASES.COMBAT, { force: true });
    partyLocked = true;
    mobsCleared = 0;
    roster.forEach(character => {
      character.alive = true;
      character.curHp = character.maxHp;
    });
    buildBattleRoster();
    spawnWave();
    party.forEach(id => {
      const character = roster.find(member => member.id === id);
      character.actionCountdown = CHAR_DEFS[id].atkInterval * speedLineIntervalMult(character);
    });
    log('開發工具：下一波怪物清空後將觸發小初相遇', 'warn');
  } else if (action === 'focus-particles') {
    closeOtherOverlays(null);
    activeOverlay = null;
    setPhase(PHASES.PREP_FLOOR, { force: true });
    partyLocked = false;
    prepLocation = 'village';
    resonanceState.xiaochu = 'goHome';
    log('已啟用引導粒子測試：回家入口目前為聚焦目標。', 'warn');
  } else if (action === 'reset') {
    window.location.reload();
    return;
  }

  render();
  renderDebugStatus();
}

function debugStartBossFight() {
  closeOtherOverlays(null);
  activeOverlay = null;
  prepLocation = 'expedition';
  setPhase(PHASES.COMBAT, { force: true });
  partyLocked = true;
  mobsCleared = MOBS_PER_FLOOR;
  roster.forEach(character => {
    character.alive = true;
    character.curHp = character.maxHp;
  });
  buildBattleRoster();
  spawnWave();
  party.forEach(id => {
    const character = roster.find(member => member.id === id);
    character.actionCountdown = CHAR_DEFS[id].atkInterval * speedLineIntervalMult(character);
  });
  log('開發工具：直接進入史萊姆王戰', 'warn');
}

function renderDebugStatus() {
  const status = document.getElementById('debugStatus');
  if (!status) return;
  const activeId = party[0] || 'wuming';
  const character = roster.find(member => member.id === activeId);
  status.textContent = `${phase}｜${CHAR_DEFS[activeId].name} Lv.${character.level}｜解鎖 ${unlockedChars.size}/${Object.keys(CHAR_DEFS).length}`;
}
