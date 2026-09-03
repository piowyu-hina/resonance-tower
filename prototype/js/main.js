function initGame() {
  roster = Object.keys(CHAR_DEFS).map(id => {
    const c = { id, level: 1, xp: 0, alive: true, skillCds: [0, 0, 0], manualActionCd: 0, actionCountdown: 0, hasteMult: 1, hasteUntil: 0, dodgeUntil: 0, slowMult: 1, slowUntil: 0, sleepUntilAction: false, charmedUntilAction: false, loadout: { activeItemId: null }, lineLevels: { atk: 0, def: 0, speed: 0, skill0: 0, skill1: 0, skill2: 0, action: 0 } };
    recomputeStats(c);
    c.curHp = c.maxHp;
    return c;
  });
  party = ['wuming'];
  floor = 1;
  partyLocked = false;
  mobsCleared = 0;
  bankedGold = 0;
  runGold = 0;
  partyBuff = { mult: 1, until: 0 };
  partyDefense = { bonus: 0, until: 0 };
  logLines = [];
  enterPrepFloor();
}

// Game surface: suppress the browser context menu so right-clicks during
// dragging/combat interaction do not interrupt play.
document.addEventListener('contextmenu', event => event.preventDefault());

initGame();
buildUI();
initDebugTools();
render();
setTimeout(() => showGuideOnce('village'), 350);
runContractPreviewFromUrl();
setInterval(tick, MASTER_TICK_MS);
