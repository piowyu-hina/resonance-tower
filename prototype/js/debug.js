import { DEBUG_MODE, CHAR_DEFS, MOBS_PER_FLOOR } from './constants.js';
import { gameState, PHASES, setPhase, recomputeStats, speedLineIntervalMult, log } from './state.js';
import { openTownShop, addInventoryItem } from './shop.js';
import { setInventoryOpen } from './ui-commerce.js';
import {
  showDefeatOverlay, closeOtherOverlays, showDungeonEntry, prepareDungeonCombat, activatePreparedCombat,
  showBossIntro, prepareBossCombat, overlayUiState,
} from './ui-overlays.js';
import { openTravelJournal, openContractPanel, queueDialogue, storyState } from './story.js';
import { spawnWave, makeMob } from './combat.js';
import { buildBattleRoster, buildMonsterCards, render } from './ui-main.js';
import { flushCombat } from './ui-combat-effects.js';

// Development helpers are opt-in through ?debug and never render in normal play.
export function initDebugTools() {
  if (!DEBUG_MODE) return;

  // Real ES modules don't leak their top-level bindings onto `window` the way
  // classic <script> globals used to - tests/ui-regression.test.js drives the
  // page via Playwright's page.evaluate() and needs a way to reach internals
  // (gameState, PHASES, etc.) for setup/assertions. Gated behind the same
  // DEBUG_MODE/?debug flag as the rest of this file, never present in normal play.
  window.__debugHooks = {
    gameState, PHASES, overlayUiState, MOBS_PER_FLOOR, storyState,
    makeMob, buildBattleRoster, buildMonsterCards, render, openContractPanel,
  };

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
    overlayUiState.prepLocation = 'home';
    overlayUiState.homeMode = 'menu';
  }
  if (requestedView === 'growth') {
    overlayUiState.prepLocation = 'home';
    overlayUiState.homeMode = 'growth';
  }
  if (requestedView === 'regions') overlayUiState.prepLocation = 'regions';
  if (requestedView === 'expedition') overlayUiState.prepLocation = 'expedition';
  if (requestedView === 'shop') openTownShop();
  if (requestedView === 'inventory' || requestedView === 'inventory-risk') {
    addInventoryItem('potion', 3, true);
    addInventoryItem('monsterCrystal', 2, true);
    setInventoryOpen(true);
  }
  if (requestedView === 'defeat') {
    gameState.runGold = 21;
    addInventoryItem('monsterCrystal', 2, true);
    setPhase(PHASES.DEFEAT, { force: true });
    showDefeatOverlay();
  }
  if (requestedView === 'journal') {
    overlayUiState.prepLocation = 'home';
    gameState.resonanceState.xiaochu = 'bookPending';
    openTravelJournal();
  }
  if (requestedView === 'contract') {
    overlayUiState.prepLocation = 'home';
    gameState.resonanceState.xiaochu = 'oathReady';
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
    overlayUiState.prepLocation = 'expedition';
    gameState.mobsCleared = MOBS_PER_FLOOR;
    prepareBossCombat();
    showBossIntro(activatePreparedCombat);
  }
  if (requestedView === 'go-home' || requestedView === 'go-home-flow') {
    setPhase(PHASES.PREP_FLOOR, { force: true });
    gameState.partyLocked = false;
    overlayUiState.prepLocation = 'village';
    gameState.resonanceState.xiaochu = 'goHome';
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

export function runDebugAction(action) {
  if (action === 'resources') {
    gameState.bankedGold += 500;
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
    gameState.unlockedChars = new Set(Object.keys(CHAR_DEFS));
    Object.keys(CHAR_DEFS).forEach(id => {
      if (CHAR_DEFS[id].unlock.type === 'resonanceContract') gameState.resonanceState[id] = 'contracted';
    });
    log('開發工具：已解鎖全部角色', 'good');
  } else if (action === 'level') {
    const character = gameState.roster.find(member => member.id === gameState.party[0]) || gameState.roster[0];
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
    gameState.activeOverlay = null;
    gameState.unlockedChars.delete('xiaochu');
    delete gameState.resonanceState.xiaochu;
    gameState.slimeKillCount = 49;
    overlayUiState.prepLocation = 'expedition';
    setPhase(PHASES.COMBAT, { force: true });
    gameState.partyLocked = true;
    gameState.mobsCleared = 0;
    gameState.roster.forEach(character => {
      character.alive = true;
      character.curHp = character.maxHp;
    });
    buildBattleRoster();
    spawnWave();
    gameState.party.forEach(id => {
      const character = gameState.roster.find(member => member.id === id);
      character.actionCountdown = CHAR_DEFS[id].atkInterval * speedLineIntervalMult(character);
    });
    log('開發工具：下一波怪物清空後將觸發小初相遇', 'warn');
  } else if (action === 'focus-particles') {
    closeOtherOverlays(null);
    gameState.activeOverlay = null;
    setPhase(PHASES.PREP_FLOOR, { force: true });
    gameState.partyLocked = false;
    overlayUiState.prepLocation = 'village';
    gameState.resonanceState.xiaochu = 'goHome';
    log('已啟用引導粒子測試：回家入口目前為聚焦目標。', 'warn');
  } else if (action === 'reset') {
    window.location.reload();
    return;
  }

  flushCombat();
  renderDebugStatus();
}

export function debugStartBossFight() {
  closeOtherOverlays(null);
  gameState.activeOverlay = null;
  overlayUiState.prepLocation = 'expedition';
  setPhase(PHASES.COMBAT, { force: true });
  gameState.partyLocked = true;
  gameState.mobsCleared = MOBS_PER_FLOOR;
  gameState.roster.forEach(character => {
    character.alive = true;
    character.curHp = character.maxHp;
  });
  buildBattleRoster();
  spawnWave();
  gameState.party.forEach(id => {
    const character = gameState.roster.find(member => member.id === id);
    character.actionCountdown = CHAR_DEFS[id].atkInterval * speedLineIntervalMult(character);
  });
  log('開發工具：直接進入史萊姆王戰', 'warn');
}

export function renderDebugStatus() {
  const status = document.getElementById('debugStatus');
  if (!status) return;
  const activeId = gameState.party[0] || 'wuming';
  const character = gameState.roster.find(member => member.id === activeId);
  status.textContent = `${gameState.phase}｜${CHAR_DEFS[activeId].name} Lv.${character.level}｜解鎖 ${gameState.unlockedChars.size}/${Object.keys(CHAR_DEFS).length}`;
}
