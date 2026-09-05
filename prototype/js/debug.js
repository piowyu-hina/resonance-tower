import { DEBUG_MODE, CHAR_DEFS, MOBS_PER_FLOOR, ROSTER_CHAR_IDS, RUINS_KILL_TARGET } from './constants.js';
import {
  gameState, PHASES, setPhase, recomputeStats, speedLineIntervalMult, log,
  RESONANCE_STATES, setResonanceState, clearResonanceState,
  CHAPTER1_STATES, setChapter1State,
} from './state.js';
import { openTownShop, addInventoryItem } from './shop.js';
import { setInventoryOpen } from './ui-commerce.js';
import {
  showDefeatOverlay, closeOtherOverlays, showDungeonEntry, prepareDungeonCombat, activatePreparedCombat,
  showBossIntro, prepareBossCombat, overlayUiState,
} from './ui-overlays.js';
import { openTravelJournal, openContractPanel, queueDialogue, storyState } from './story.js';
import { spawnWave, makeMob, beginRuinsExpedition, enterPrepBoss } from './combat.js';
import { buildBattleRoster, buildMonsterCards, render } from './ui-main.js';
import { flushCombat } from './ui-combat-effects.js';
import { EVENT_DEFS, startEventById, startRandomEvent } from './events.js';

// Multiplies how often main.js's tick loop fires. Every cooldown/countdown
// in combat.js decrements by the fixed MASTER_TICK_MS per tick rather than
// by measured elapsed time, so calling tick() more often is enough to speed
// up the whole simulation - no combat.js logic needs to change. Real-time
// setTimeout-driven animations (transitions.js, defeat restart countdown)
// are unaffected on purpose, so cutscenes don't feel rushed while testing.
export const debugState = { speedMultiplier: 1 };
const SPEED_CYCLE = [1, 2, 4, 8];

// Development helpers are opt-in through ?debug and never render in normal play.
export function initDebugTools() {
  if (!DEBUG_MODE) return;

  // Real ES modules don't leak their top-level bindings onto `window` the way
  // classic <script> globals used to - tests/ui-regression.test.js drives the
  // page via Playwright's page.evaluate() and needs a way to reach internals
  // (gameState, PHASES, etc.) for setup/assertions. Gated behind the same
  // DEBUG_MODE/?debug flag as the rest of this file, never present in normal play.
  window.__debugHooks = {
    gameState, PHASES, setPhase, overlayUiState, MOBS_PER_FLOOR, storyState,
    makeMob, buildBattleRoster, buildMonsterCards, render, openContractPanel,
    EVENT_DEFS, startEventById, startRandomEvent, beginRuinsExpedition,
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
  const requestedEvent = new URLSearchParams(window.location.search).get('event');
  if (requestedEvent) {
    // Event preview URLs represent an event encountered during an active
    // expedition. Prepare that real combat state first; otherwise entering
    // the ruins from a preview leaves the player on the village surface.
    overlayUiState.prepLocation = 'expedition';
    prepareDungeonCombat();
    activatePreparedCombat();
    startEventById(requestedEvent, action => {
      if (action === 'enterRuins') beginRuinsExpedition();
    });
  }
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
    setResonanceState('xiaochu', RESONANCE_STATES.BOOK_PENDING, { force: true });
    openTravelJournal();
  }
  if (requestedView === 'contract') {
    overlayUiState.prepLocation = 'home';
    setResonanceState('xiaochu', RESONANCE_STATES.OATH_READY, { force: true });
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
    setResonanceState('xiaochu', RESONANCE_STATES.GO_HOME, { force: true });
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
    gameState.unlockedChars = new Set(ROSTER_CHAR_IDS);
    ROSTER_CHAR_IDS.forEach(id => {
      if (CHAR_DEFS[id].unlock.type === 'resonanceContract') setResonanceState(id, RESONANCE_STATES.CONTRACTED, { force: true });
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
  } else if (action === 'journal-preview') {
    openTravelJournal({ preview: true });
  } else if (action === 'xiaochu-story') {
    setChapter1State(CHAPTER1_STATES.COMPLETE);
    closeOtherOverlays(null);
    gameState.activeOverlay = null;
    gameState.unlockedChars.delete('xiaochu');
    clearResonanceState('xiaochu');
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
  } else if (action === 'ruins-event') {
    debugOpenRuinsEvent();
  } else if (action === 'ruins-boss') {
    debugPrepareRuinsBoss();
  } else if (action === 'event') {
    startRandomEvent(resultAction => {
      if (resultAction === 'enterRuins') beginRuinsExpedition();
    });
  } else if (action === 'focus-particles') {
    closeOtherOverlays(null);
    gameState.activeOverlay = null;
    setPhase(PHASES.PREP_FLOOR, { force: true });
    gameState.partyLocked = false;
    overlayUiState.prepLocation = 'village';
    setResonanceState('xiaochu', RESONANCE_STATES.GO_HOME, { force: true });
    log('已啟用引導粒子測試：回家入口目前為聚焦目標。', 'warn');
  } else if (action === 'speed') {
    const next = SPEED_CYCLE[(SPEED_CYCLE.indexOf(debugState.speedMultiplier) + 1) % SPEED_CYCLE.length];
    debugState.speedMultiplier = next;
    log(`開發工具：戰鬥模擬速度切換為 ${next}x`, 'warn');
  } else if (action === 'reset') {
    window.location.reload();
    return;
  }

  flushCombat();
  renderDebugStatus();
}

export function debugOpenRuinsEvent() {
  closeOtherOverlays(null);
  gameState.activeOverlay = null;
  setChapter1State(CHAPTER1_STATES.FOREST);
  gameState.expeditionMode = 'forest';
  gameState.ruinsKillCount = 0;
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
  flushCombat();
  startEventById('ruins-entrance', resultAction => {
    if (resultAction === 'enterRuins') beginRuinsExpedition();
  });
  log('開發工具：已開啟遺跡入口事件', 'warn');
}

export function debugPrepareRuinsBoss() {
  closeOtherOverlays(null);
  gameState.activeOverlay = null;
  setChapter1State(CHAPTER1_STATES.RUINS);
  gameState.expeditionMode = 'ruins';
  gameState.ruinsKillCount = RUINS_KILL_TARGET;
  gameState.monsters = [];
  overlayUiState.prepLocation = 'expedition';
  setPhase(PHASES.COMBAT, { force: true });
  gameState.partyLocked = true;
  gameState.roster.forEach(character => {
    character.alive = true;
    character.curHp = character.maxHp;
  });
  enterPrepBoss();
  render();
  log('開發工具：已開啟遺跡之主戰前準備', 'warn');
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
  status.textContent = `${gameState.phase}｜${CHAR_DEFS[activeId].name} Lv.${character.level}｜解鎖 ${gameState.unlockedChars.size}/${ROSTER_CHAR_IDS.length}`;
  const speedBtn = document.querySelector('[data-debug-action="speed"]');
  if (speedBtn) speedBtn.textContent = `戰鬥模擬速度 ${debugState.speedMultiplier}x`;
}
