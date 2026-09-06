import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prototypeDir = path.resolve(__dirname, '..', 'prototype');
let prototypeUrl; // set once the local static server (started in the IIFE below) is listening

// Read dialogue line counts from the actual source of truth instead of
// hardcoding them in testXiaochuEncounterFlow below - the script text (and
// therefore each array's length) changes as the story gets rewritten, and a
// hardcoded count silently goes stale (advanceDialogue() either stalls one
// line short, or spills into the next queued script). This import runs in
// this file's own Node process, never the browser pages Playwright drives,
// so the dummy document/window below only needs to satisfy module-load-time
// references (e.g. constants.js's `new URLSearchParams(window.location...)`).
global.window = { location: { search: '' } };
global.document = { getElementById: () => null, addEventListener: () => {}, dispatchEvent: () => {}, documentElement: {} };
const { DIALOGUE_DEFS, JOURNAL_PAGES } = await import('../prototype/js/story.js');
const { characterPortraitPath, characterBattlePortraitPath, characterFullArtPath } = await import('../prototype/js/state.js');
for (const getPath of [characterPortraitPath, characterBattlePortraitPath]) {
  assert.equal(getPath('xiaochu'), 'assets/characters/xiaochu.png');
  assert.ok(fs.existsSync(path.join(prototypeDir, getPath('xiaochu'))));
}
assert.equal(characterFullArtPath('xiaochu'), 'assets/characters/xiaochu_full.png');
assert.ok(fs.existsSync(path.join(prototypeDir, characterFullArtPath('xiaochu'))));
const lineCount = scriptId => DIALOGUE_DEFS[scriptId].length;
const approvedEncounter = fs.readFileSync(path.resolve(__dirname, '../story/xiaochu-first-encounter.md'), 'utf8')
  .split('## 劇情正文')[1].trim().split(/\r?\n/).filter(line => line.trim())
  .map(line => line.startsWith('（') ? line.slice(1, -1) : line.replace(/^\*\*.+?：\*\*\s*/, ''));
assert.deepEqual(DIALOGUE_DEFS.xiaochu_encounter.map(line => line.text), approvedEncounter);
assert.deepEqual(Object.keys(DIALOGUE_DEFS).filter(id => id.startsWith('xiaochu_')).sort(),
  ['xiaochu_encounter', 'xiaochu_home', 'xiaochu_choice', 'xiaochu_oath', 'xiaochu_after',
    'xiaochu_daily_practice', 'xiaochu_daily_chair', 'xiaochu_daily_departure'].sort());

// Count the logical game's own <link rel="stylesheet"> tags, not the host shell.
// tags instead of hardcoding how many exist, so adding a new split stylesheet
// doesn't silently leave this assertion checking a stale number.
const expectedStylesheetCount = (fs.readFileSync(path.join(prototypeDir, 'game.html'), 'utf8').match(/<link[^>]*rel="stylesheet"/g) || []).length;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2',
};

// Real ES modules (see game.html's <script type="module">) can't load over
// file:// - Chromium blocks it as a cross-origin request. Serve the
// prototype directory over a throwaway local HTTP server for the duration
// of this test run instead, same as the manual browser checks used all
// session (python -m http.server), just embedded so this file has no
// external dependency.
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
      const filePath = path.join(prototypeDir, relative);
      if (!filePath.startsWith(prototypeDir)) { res.writeHead(403); res.end(); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function near(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.5, `${message}: expected ${expected}, got ${actual}`);
}

async function openView(browser, view) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.runtimeErrors = [];
  page.on('pageerror', error => page.runtimeErrors.push(error));
  await page.goto(`${prototypeUrl}?debug&view=${view}`, { waitUntil: 'load' });
  return page;
}

function assertNoRuntimeErrors(page, view) {
  assert.deepEqual(page.runtimeErrors.map(error => error.message), [], `${view} emitted a runtime error`);
}

async function testJournalNavigation(browser) {
  const preview = await openView(browser, 'village');
  await preview.click('#debugToggleBtn');
  await preview.click('[data-debug-action="journal-preview"]');
  assert.equal(await preview.locator('#journalContents').isVisible(), true);
  await preview.click('.journalChapterEntry');
  for (let index = 0; index < JOURNAL_PAGES.length; index++) {
    await preview.waitForFunction(() => !document.getElementById('journalNextBtn').disabled);
    await preview.click('#journalNextBtn');
  }
  assert.equal(await preview.locator('#journalContents').isVisible(), true);
  assert.equal(await preview.evaluate(() => window.__debugHooks.gameState.chapter1State), 'forest');
  assertNoRuntimeErrors(preview, 'journal debug preview');
  await preview.close();
  const page = await openView(browser, 'journal');
  await page.evaluate(async () => {
    const { gameState } = await import('./js/state.js');
    gameState.chapter1State = 'complete';
    gameState.resonanceState = {};
    const story = await import('./js/story.js');
    story.closeTravelJournal();
    story.openTravelJournal();
  });
  assert.equal(await page.locator('#journalContents').isVisible(), true);
  assert.equal(await page.locator('.journalChapterEntry').count(), 1);
  await page.click('.journalChapterEntry');
  assert.equal(await page.textContent('#journalPageText'), JOURNAL_PAGES[0]);
  await page.click('#journalNextBtn');
  await page.waitForFunction(() => !document.getElementById('journalNextBtn').disabled);
  await page.click('#journalContentsBtn');
  assert.equal(await page.locator('#journalResumeBtn').count(), 0);
  await page.click('.journalChapterEntry');
  assert.equal(await page.textContent('#journalPageText'), JOURNAL_PAGES[0]);
  await page.click('#journalNextBtn');
  await page.waitForFunction(() => !document.getElementById('journalPrevBtn').disabled);
  await page.click('#journalPrevBtn');
  assert.equal(await page.textContent('#journalPageText'), JOURNAL_PAGES[0]);
  await page.click('#journalNextBtn');
  await page.waitForFunction(() => !document.getElementById('journalNextBtn').disabled);
  await page.click('#journalCloseBtn');
  await page.evaluate(async () => {
    const save = await import('./js/save.js');
    const raw = save.createSaveData();
    const normalized = save.normalizeSaveData(raw);
    const { gameState } = await import('./js/state.js');
    gameState.journalReading = normalized.journalReading;
    (await import('./js/story.js')).openTravelJournal();
  });
  await page.click('.journalChapterEntry');
  assert.equal(await page.textContent('#journalPageText'), JOURNAL_PAGES[0]);
  assert.equal(await page.evaluate(() => window.__debugHooks.gameState.chapter1State), 'complete');
  assertNoRuntimeErrors(page, 'journal navigation');
  await page.close();
}

async function testJournalLayout(browser) {
  const page = await openView(browser, 'village');
  await page.evaluate(async () => (await import('./js/story.js')).openTravelJournal({ preview: true }));
  for (const locale of ['zh-Hant', 'en']) {
    await page.evaluate(async locale => (await import('./js/i18n.js')).setLocale(locale), locale);
    for (const [width, height] of [[320, 740], [390, 844], [768, 540], [1440, 1000]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(async () => {
        (await import('./js/story.js')).showJournalContents();
        const list = document.getElementById('journalChapterList');
        // Stress the layout with extra DOM entries only; never add fake story data.
        const entry = list.firstElementChild;
        for (let i = 0; i < 20; i++) list.append(entry.cloneNode(true));
        list.lastElementChild.scrollIntoView({ block: 'end' });
      });
      assert.equal(await page.evaluate(() => {
        const panel = document.querySelector('.journalPanel').getBoundingClientRect();
        const list = document.getElementById('journalChapterList');
        const last = list.lastElementChild.getBoundingClientRect();
        const bounds = list.getBoundingClientRect();
        return panel.left >= 0 && panel.right <= document.documentElement.clientWidth + 1 &&
          panel.top >= 0 && panel.bottom <= innerHeight + 1 &&
          last.bottom <= bounds.bottom + 1 && bounds.height >= 80 &&
          list.scrollWidth <= list.clientWidth + 1;
      }), true, `chapter list fits and scrolls at ${width}px / ${locale}`);
      await page.evaluate(async () => (await import('./js/story.js')).showJournalContents());
      await page.click('.journalChapterEntry');
      assert.equal(await page.evaluate(() => {
        const next = document.getElementById('journalNextBtn').getBoundingClientRect();
        const text = document.getElementById('journalPageText');
        return next.bottom <= innerHeight && next.right <= document.documentElement.clientWidth &&
          text.clientHeight >= 80 && text.scrollWidth <= text.clientWidth + 1;
      }), true, `reading controls fit at ${width}px / ${locale}`);
    }
  }
  assertNoRuntimeErrors(page, 'journal responsive layout');
  await page.close();
}

async function testMajorViewsRender(browser) {
  const views = [
    ['home', '#homeView'],
    ['growth', '#characterDetailOverlay.open'],
    ['regions', '#regionView'],
    ['expedition', '#expeditionView'],
    ['shop', '#shopOverlay.open'],
    ['inventory', '#inventoryOverlay.open'],
    ['defeat', '#defeatOverlay.open'],
    ['journal', '#journalOverlay.open .journalPanel'],
    ['contract', '#contractOverlay.open .contractPanel'],
    ['dialogue', '#dialogueOverlay.open #dialogueModal'],
  ];
  for (const [view, selector] of views) {
    const page = await openView(browser, view);
    await page.waitForTimeout(250);
    const result = await page.evaluate(selectorToCheck => {
      const element = document.querySelector(selectorToCheck);
      if (!element) return { found: false };
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        found: true,
        width: rect.width,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
        loadedStyles: [...document.styleSheets].filter(sheet => sheet.href).length,
      };
    }, selector);
    assert.equal(result.found, true, `${view} target must exist`);
    assert.ok(result.width > 100 && result.height > 40, `${view} target must have a usable box`);
    assert.notEqual(result.display, 'none', `${view} target must be displayed`);
    assert.notEqual(result.visibility, 'hidden', `${view} target must be visible`);
    assert.ok(result.opacity > 0, `${view} target must not be transparent`);
    assert.equal(result.loadedStyles, expectedStylesheetCount, `${view} must load every split stylesheet`);
    assertNoRuntimeErrors(page, view);
    await page.close();
  }
}

async function testDungeonEntry(browser) {
  const page = await openView(browser, 'dungeon-entry');
  await page.waitForTimeout(900);
  const covered = await page.evaluate(() => ({
    phase: window.__debugHooks.gameState.phase,
    rect: document.getElementById('combatView').getBoundingClientRect().toJSON(),
    entering: document.getElementById('combatView').classList.contains('surfaceEntering'),
    monsterCount: document.querySelectorAll('#monsterSide .monsterCard').length,
  }));
  assert.equal(covered.phase, 'dungeonIntro');
  assert.equal(covered.entering, false);
  assert.ok(covered.monsterCount >= 2 && covered.monsterCount <= 3);

  await page.waitForSelector('#dungeonEntryOverlay.finished', { state: 'attached' });
  const finished = await page.evaluate(() => {
    const overlay = document.getElementById('dungeonEntryOverlay');
    const style = getComputedStyle(overlay);
    return {
      phase: window.__debugHooks.gameState.phase,
      rect: document.getElementById('combatView').getBoundingClientRect().toJSON(),
      entering: document.getElementById('combatView').classList.contains('surfaceEntering'),
      overlayOpacity: style.opacity,
      overlayVisibility: style.visibility,
      monsterCount: document.querySelectorAll('#monsterSide .monsterCard').length,
    };
  });
  assert.equal(finished.phase, 'combat');
  assert.equal(finished.entering, false);
  assert.equal(finished.overlayOpacity, '0');
  assert.equal(finished.overlayVisibility, 'hidden');
  assert.equal(finished.monsterCount, covered.monsterCount);
  for (const key of ['x', 'y', 'width', 'height']) near(finished.rect[key], covered.rect[key], `combat rect ${key}`);
  assertNoRuntimeErrors(page, 'dungeon-entry');
  await page.close();
}

async function testBossTransition(browser) {
  const page = await openView(browser, 'expedition');
  await page.evaluate(() => {
    const hooks = window.__debugHooks;
    hooks.overlayUiState.prepLocation = 'expedition';
    hooks.gameState.phase = 'prepBoss';
    hooks.gameState.partyLocked = true;
    hooks.gameState.mobsCleared = hooks.MOBS_PER_FLOOR;
    hooks.gameState.monsters = [hooks.makeMob(), hooks.makeMob()];
    hooks.gameState.monsters.forEach(monster => {
      monster.alive = false;
      monster.hp = 0;
    });
    hooks.buildBattleRoster();
    hooks.buildMonsterCards();
    Object.values(hooks.gameState.monsterEls).forEach(refs => refs.card.classList.add('down', 'dying'));
    hooks.render();
    hooks.gameState.startBtnEl.click();
  });

  const intro = await page.evaluate(() => ({
    phase: window.__debugHooks.gameState.phase,
    bossCards: document.querySelectorAll('#monsterSide .monsterCard.boss').length,
    dyingCards: document.querySelectorAll('#monsterSide .monsterCard.dying').length,
    allCards: document.querySelectorAll('#monsterSide .monsterCard').length,
  }));
  assert.deepEqual(intro, { phase: 'bossIntro', bossCards: 1, dyingCards: 0, allCards: 1 });
  const entryTimers = () => page.evaluate(() => {
    const state = window.__debugHooks.gameState;
    const boss = state.monsters[0];
    const refs = state.monsterEls[boss.id];
    return { cooldowns: [boss.skillCd, boss.skill2Cd, state.gooSpawnCountdown],
      opening: [boss.summonOpeningMs, state.gooOpeningCountdown],
      overlays: [refs.skillCdOverlayEl, refs.skill2CdOverlayEl, refs.skill3CdOverlayEl].map(el => el.style.height),
      hp: boss.hp };
  });
  const beforeEntry = await entryTimers();
  assert.equal(await page.locator('.bossCinemaScene').isVisible(), true, 'boss intro has its own scene layer');
  assert.match(await page.locator('.bossCinemaScene').evaluate(el => getComputedStyle(el).backgroundImage), /slime-habitat-battle/);
  await page.locator('#bossIntroOverlay').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#bossIntroOverlay').getAttribute('aria-hidden'), 'false', 'intro cannot be skipped');
  assert.deepEqual(beforeEntry.cooldowns, [0, 0, 0], 'uncast boss skills start ready');
  assert.deepEqual(beforeEntry.overlays, ['0%', '0%', '0%']);
  assert.deepEqual(beforeEntry.opening, [3000, 800]);
  await page.waitForTimeout(350);
  assert.deepEqual(await entryTimers(), beforeEntry, 'intro must not tick combat or opening timers');

  await page.waitForFunction(() => window.__debugHooks.gameState.phase === 'combat', null, { timeout: 6500 });
  const active = await page.evaluate(() => ({
    bossCards: document.querySelectorAll('#monsterSide .monsterCard.boss').length,
    dyingCards: document.querySelectorAll('#monsterSide .monsterCard.dying').length,
    allCards: document.querySelectorAll('#monsterSide .monsterCard').length,
  }));
  assert.deepEqual(active, { bossCards: 1, dyingCards: 0, allCards: 1 });
  assertNoRuntimeErrors(page, 'boss transition');
  await page.close();
}

async function testSameSpeakerDialogue(browser) {
  const page = await openView(browser, 'dialogue');
  await page.evaluate(async () => {
    const story = await import('./js/story.js');
    story.storyState.dialogueLineIndex = story.DIALOGUE_DEFS.xiaochu_encounter.findIndex(line => line.speaker === 'xiaochu' && line.text === '璃雪……');
    story.renderDialogueLine();
  });
  await page.waitForTimeout(650);
  const before = await page.evaluate(() => {
    const image = document.getElementById('dialoguePortraitImg');
    return {
      src: image.src,
      rect: image.getBoundingClientRect().toJSON(),
      text: document.getElementById('dialogueText').textContent,
    };
  });
  await page.click('#dialogueOverlay', { position: { x: 20, y: 20 } });
  await page.waitForTimeout(650);
  const after = await page.evaluate(() => {
    const image = document.getElementById('dialoguePortraitImg');
    return {
      src: image.src,
      rect: image.getBoundingClientRect().toJSON(),
      text: document.getElementById('dialogueText').textContent,
      animating: image.classList.contains('lineEntering'),
    };
  });
  assert.equal(after.src, before.src);
  assert.notEqual(after.text, before.text);
  assert.equal(after.animating, false);
  for (const key of ['x', 'y', 'width', 'height']) near(after.rect[key], before.rect[key], `portrait rect ${key}`);
  assertNoRuntimeErrors(page, 'same-speaker dialogue');
  await page.close();
}

async function testOverlayExclusivity(browser) {
  const page = await openView(browser, 'journal');
  await page.evaluate(() => {
    const hooks = window.__debugHooks;
    hooks.gameState.resonanceState.xiaochu = 'oathReady';
    hooks.openContractPanel();
  });
  const state = await page.evaluate(() => ({
    activeOverlay: window.__debugHooks.gameState.activeOverlay,
    journalOpen: document.getElementById('journalOverlay').classList.contains('open'),
    contractOpen: document.getElementById('contractOverlay').classList.contains('open'),
  }));
  assert.deepEqual(state, { activeOverlay: 'contract', journalOpen: false, contractOpen: true });
  assertNoRuntimeErrors(page, 'overlay exclusivity');
  await page.close();
}

// Drives the approved encounter and new home/travel/covenant chapters
// state machine (design.md「角色解鎖系統」) through its real production seam
// end to end, instead of a ?view= snapshot of a single state. Stage 1 uses the
// same setup as debug.js's "xiaochu-story" button (one kill short of the
// threshold), but the killing blow itself comes from a real auto-battle tick
// via the ordinary setInterval loop in main.js, not a debug shortcut - so this
// also covers combat.js's checkResonanceTriggers() call site for real. Every
// other stage clicks the exact DOM elements a player would (retreatBtn,
// homeLocationBtn, travelJournalBtn, contractFacilityBtn, ...), calling
// .click()/dispatchEvent() directly via page.evaluate rather than Playwright's
// visibility-checked page.click(), since several of these elements sit under
// a currently-hidden sibling view at the moment they're clicked.
async function testXiaochuEncounterFlow(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.runtimeErrors = [];
  page.on('pageerror', error => page.runtimeErrors.push(error));
  await page.goto(`${prototypeUrl}?debug`, { waitUntil: 'load' });

  const xiaochuState = () => page.evaluate(() => window.__debugHooks.gameState.resonanceState.xiaochu);
  const isUnlocked = () => page.evaluate(() => window.__debugHooks.gameState.unlockedChars.has('xiaochu'));
  const click = id => page.evaluate(elId => document.getElementById(elId).click(), id);
  const waitForOverlay = overlay => page.waitForFunction(
    wanted => window.__debugHooks.gameState.activeOverlay === wanted, overlay, { timeout: 20000 },
  );
  const advanceDialogue = async times => {
    for (let i = 0; i < times; i++) {
      await page.evaluate(() =>
        document.getElementById('dialogueOverlay').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    }
  };

  const advanceSlimeScene = async times => {
    for (let i = 0; i < times; i++) {
      await page.waitForFunction(() => !window.__debugHooks.storyState.lineEffectLocked);
      await advanceDialogue(1);
    }
  };
  await page.evaluate(() => document.querySelector('[data-debug-action="xiaochu-preview"]').click());
  for (let index = 0; index < DIALOGUE_DEFS.xiaochu_encounter.length; index++) {
    assert.equal(await page.textContent('#dialogueText'), DIALOGUE_DEFS.xiaochu_encounter[index].text);
    const speaker = DIALOGUE_DEFS.xiaochu_encounter[index].speaker;
    const beat = DIALOGUE_DEFS.xiaochu_encounter[index].slimeBeat;
    assert.equal(await page.locator('#storyWuming').isVisible(), index < 12, 'Wuming stays on stage through narration and off-screen voice');
    if (index < 12) {
      assert.equal(await page.locator('#dialoguePortraitFrame').isVisible(), false, 'do not duplicate the on-stage Wuming portrait');
      assert.equal(await page.locator('#storyWuming img').evaluate(img => img.complete && img.naturalWidth > 0), true);
    }
    const wumingBeat = DIALOGUE_DEFS.xiaochu_encounter[index].wumingBeat;
    if (wumingBeat) assert.equal(await page.getAttribute('#storyWuming', 'data-beat'), wumingBeat);
    if (beat && beat !== 'gone') {
      assert.equal(await page.locator('#storySlime').isVisible(), true);
      assert.equal(await page.getAttribute('#storySlime', 'data-beat'), beat);
      await page.evaluate(() => document.getElementById('dialogueOverlay').click());
      assert.equal(await page.evaluate(() => window.__debugHooks.storyState.dialogueLineIndex), index, 'slime action cannot be skipped');
    }
    if (beat === 'gone') assert.equal(await page.locator('#storySlime').isVisible(), false);
    if (speaker.startsWith('xiaochu_')) assert.equal(await page.textContent('#dialogueSpeakerName'), '？？？');
    if (speaker === 'xiaochu') assert.equal(await page.textContent('#dialogueSpeakerName'), '小初');
    await advanceSlimeScene(1);
  }
  assert.equal(await xiaochuState(), undefined, 'preview must not grant progression');

  // Stage 1: jungle encounter (killCount trigger -> 'encountering' -> 'following').
  await page.evaluate(() => document.querySelector('[data-debug-action="xiaochu-story"]').click());
  await waitForOverlay('dialogue');
  assert.equal(await xiaochuState(), 'encountering');
  await advanceSlimeScene(lineCount('xiaochu_encounter'));
  assert.equal(await xiaochuState(), 'following');

  assert.equal(await isUnlocked(), false);
  await click('retreatBtn');
  assert.equal(await xiaochuState(), 'following');
  assert.notEqual(await page.evaluate(() => window.__debugHooks.gameState.activeOverlay), 'dialogue');
  await click('homeLocationBtn');
  assert.equal(await xiaochuState(), 'following');
  assert.notEqual(await page.evaluate(() => window.__debugHooks.gameState.activeOverlay), 'dialogue');
  assert.equal(await isUnlocked(), false);
  assertNoRuntimeErrors(page, 'xiaochu encounter flow');
  // Continue from the approved encounter through the new relationship chapters.
  assert.equal(await page.locator('#xiaochuTalkBtn').isVisible(), true);
  await page.click('#xiaochuTalkBtn');
  assert.equal(await page.evaluate(() => window.__debugHooks.storyState.dialogueScriptId), 'xiaochu_home');
  await advanceDialogue(lineCount('xiaochu_home'));
  assert.equal(await page.evaluate(() => window.__debugHooks.gameState.xiaochuStoryChapter), 2);
  assert.equal(await page.evaluate(() => window.__debugHooks.storyState.dialogueScriptId), 'xiaochu_choice', 'first home visit continues directly into covenant discussion');
  assert.equal(await isUnlocked(), false);
  await advanceDialogue(lineCount('xiaochu_choice'));
  assert.equal(await xiaochuState(), 'oathReady');
  assert.equal(await isUnlocked(), false);
  assert.equal(await page.locator('#homeBackBtn').isEnabled(), true, 'readiness must not force a covenant');
  const saved = await page.evaluate(async () => {
    const save = await import('./js/save.js');
    const normalized = save.normalizeSaveData(save.createSaveData());
    return { canSave: save.canManageSave(), chapter: normalized.xiaochuStoryChapter, state: normalized.resonanceState.xiaochu };
  });
  assert.deepEqual(saved, { canSave: true, chapter: 3, state: 'oathReady' });
  await page.evaluate(async () => {
    const save = await import('./js/save.js');
    save.applySaveData(save.normalizeSaveData(save.createSaveData()));
  });
  await page.click('#homeLocationBtn');
  assert.equal(await xiaochuState(), 'oathReady', 'load preserves the new ready state');
  await page.click('#contractFacilityBtn');
  await page.click('#xiaochuSoulBtn');
  await page.click('#contractCancelBtn');
  assert.equal(await xiaochuState(), 'oathReady');
  await page.click('#contractCloseBtn');
  await page.click('#homeBackBtn');
  await page.click('#homeLocationBtn');
  await page.click('#contractFacilityBtn');
  await page.click('#xiaochuSoulBtn');
  await page.click('#contractConfirmBtn');
  assert.equal(await xiaochuState(), 'contracting');
  await advanceDialogue(lineCount('xiaochu_oath'));
  assert.equal(await page.evaluate(() => window.__debugHooks.storyState.dialoguePhase), 'outro');
  await page.keyboard.press('Enter');
  await page.locator('#contractFormed').click({ force: true });
  assert.equal(await isUnlocked(), false, 'reveal cannot be skipped to unlock early');
  await page.waitForFunction(() => window.__debugHooks.storyState.dialogueScriptId === 'xiaochu_after');
  assert.equal(await xiaochuState(), 'contracted');
  assert.equal(await isUnlocked(), true);
  await advanceDialogue(lineCount('xiaochu_after'));
  assert.equal(await page.evaluate(() => window.__debugHooks.gameState.xiaochuStoryChapter), 4);
  assert.equal(await page.locator('#xiaochuTalkBtn').isVisible(), false, 'contracted Xiaochu has no floating home conversation entry');
  assert.equal(await page.locator('#homeBackBtn').isEnabled(), true);
  assert.equal(await page.evaluate(async () => !!(await import('./js/story.js')).DIALOGUE_DEFS.xiaochu_trust), false, 'retired travel requirement is not an active dialogue');
  assertNoRuntimeErrors(page, 'xiaochu completed covenant');
  await page.close();
}

async function testChapter1RuinsFlow(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.runtimeErrors = [];
  page.on('pageerror', error => page.runtimeErrors.push(error));
  await page.goto(`${prototypeUrl}?debug`, { waitUntil: 'load' });
  await page.click('#debugToggleBtn');
  await page.click('[data-debug-action="ruins-event"]');
  await page.waitForSelector('#eventOverlay.open');
  assert.equal(await page.getAttribute('#eventSceneImage', 'src'), 'assets/events/ruins-entrance-quiet.png');
  const click = id => page.evaluate(elId => document.getElementById(elId).click(), id);
  const advanceDialogue = async times => {
    for (let i = 0; i < times; i++) {
      await page.evaluate(() =>
        document.getElementById('dialogueOverlay').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    }
  };

  await page.evaluate(() => {
    const hooks = window.__debugHooks;
    // Keep the combat surface visible while its tick is paused, so the
    // freshly-reset 0/10 state cannot race the first automatic attack.
    hooks.setPhase(hooks.PHASES.DUNGEON_INTRO, { force: true });
    hooks.gameState.partyLocked = true;
    hooks.buildBattleRoster();
    hooks.render();
  });

  await page.click('[data-event-action="choice"][data-option-index="0"]');
  await page.waitForFunction(() => window.__debugHooks.gameState.expeditionMode === 'ruins', null, { timeout: 3000 });
  await page.waitForFunction(() => getComputedStyle(document.getElementById('combatView')).backgroundImage.includes('ruins-battle-quiet.png'), null, { timeout: 2000 });
  assert.deepEqual(await page.evaluate(() => ({
    chapter: window.__debugHooks.gameState.chapter1State,
    count: window.__debugHooks.gameState.ruinsKillCount,
    ruinMobs: window.__debugHooks.gameState.monsters.every(monster => monster.defId.startsWith('ruins')),
    ruinsBackground: getComputedStyle(document.getElementById('combatView')).backgroundImage.includes('ruins-battle-quiet.png'),
  })), { chapter: 'ruins', count: 0, ruinMobs: true, ruinsBackground: true });
  await page.waitForSelector('.ruinsLeaveButton');

  // Leaving resets only the temporary ruins progress and makes the entrance
  // eligible to appear again.
  await page.evaluate(() => {
    window.__debugHooks.gameState.ruinsKillCount = 6;
    document.querySelector('.ruinsLeaveButton').click();
  });
  assert.deepEqual(await page.evaluate(() => ({
    chapter: window.__debugHooks.gameState.chapter1State,
    mode: window.__debugHooks.gameState.expeditionMode,
    count: window.__debugHooks.gameState.ruinsKillCount,
  })), { chapter: 'forest', mode: 'forest', count: 0 });

  // Re-enter and resolve the tenth kill. The ordinary combat tick performs
  // the real death sweep and delayed encounter transition.
  await page.evaluate(() => window.__debugHooks.startEventById('ruins-entrance', action => {
    if (action === 'enterRuins') window.__debugHooks.beginRuinsExpedition();
  }));
  await page.click('[data-event-action="choice"][data-option-index="0"]');
  await page.waitForFunction(() => window.__debugHooks.gameState.expeditionMode === 'ruins', null, { timeout: 3000 });
  await page.evaluate(() => {
    const hooks = window.__debugHooks;
    hooks.setPhase(hooks.PHASES.COMBAT, { force: true });
    hooks.gameState.partyLocked = true;
    hooks.buildBattleRoster();
    hooks.render();
    const state = hooks.gameState;
    state.ruinsKillCount = 9;
    state.monsters = [state.monsters[0]];
    state.monsters[0].hp = 0;
  });
  await page.waitForFunction(() => {
    const state = window.__debugHooks.gameState;
    return state.phase === 'prepBoss' && state.activeOverlay === 'shop';
  }, null, { timeout: 4000 });
  await page.waitForSelector('#shopOverlay.open');
  assert.deepEqual(await page.evaluate(() => ({
    phase: window.__debugHooks.gameState.phase,
    shopOpen: document.getElementById('shopOverlay').classList.contains('open'),
    shopMode: window.__debugHooks.gameState.shopMode,
    hasBoss: window.__debugHooks.gameState.monsters.some(monster => monster.storyBoss),
  })), { phase: 'prepBoss', shopOpen: true, shopMode: 'dungeon', hasBoss: false });

  await page.click('#shopLeaveBtn');
  await page.waitForFunction(() => window.__debugHooks.gameState.activeOverlay === null);
  assert.deepEqual(await page.evaluate(() => ({
    prepVisible: getComputedStyle(document.getElementById('prepView')).display !== 'none',
    heading: document.getElementById('prepHeading').textContent,
    start: document.getElementById('startBtn').textContent,
    step: document.getElementById('expeditionRegionStepText').textContent,
    regionImageVisible: getComputedStyle(document.getElementById('expeditionRegionImage')).display !== 'none',
    regionImage: document.getElementById('expeditionRegionImage').getAttribute('src'),
    region: document.getElementById('expeditionRegionName').textContent,
    description: document.getElementById('expeditionRegionDescription').textContent,
    boss: document.getElementById('expeditionRegionBoss').textContent,
    recommendedLevel: document.getElementById('expeditionRegionLevel').textContent,
    threats: document.getElementById('expeditionRegionThreats').textContent,
  })), {
    prepVisible: true,
    heading: '首領戰前確認',
    start: '挑戰首領',
    step: '戰前情報',
    regionImageVisible: true,
    regionImage: 'assets/events/ruins-entrance-quiet.png',
    region: '???',
    description: '???',
    boss: '???',
    recommendedLevel: '???',
    threats: '???',
  });
  await page.evaluate(() => document.getElementById('startBtn').click());

  await page.waitForSelector('#bossIntroOverlay.open');
  assert.deepEqual(await page.evaluate(() => ({
    phase: window.__debugHooks.gameState.phase,
    name: document.querySelector('#bossIntroOverlay .bossIntroName').textContent,
    mystery: document.getElementById('bossIntroOverlay').classList.contains('mystery'),
    ruinsAnimation: document.getElementById('bossIntroOverlay').classList.contains('ruinsMasterIntro'),
    portrait: document.querySelector('#bossIntroOverlay .bossIntroPortrait').getAttribute('src'),
    seal: document.querySelector('#bossIntroOverlay .bossIntroSeal img').getAttribute('src'),
  })), {
    phase: 'bossIntro',
    name: '遺跡之主',
    mystery: false,
    ruinsAnimation: true,
    portrait: 'assets/monsters/floor1/relics_master.png',
    seal: 'assets/effects/ruins_master_seal.png',
  });
  await page.waitForFunction(() => document.getElementById('floorLabel').textContent === '遺跡之主' && !document.querySelector('.ruinsLeaveButton'), null, { timeout: 2000 });
  assert.deepEqual(await page.evaluate(() => {
    const boss = window.__debugHooks.gameState.monsters[0];
    return {
      name: boss.name,
      level: boss.level,
      leaveHidden: !document.querySelector('.ruinsLeaveButton'),
      label: document.getElementById('floorLabel').textContent,
    };
  }), { name: '遺跡之主', level: 100, leaveHidden: true, label: '遺跡之主' });

  await page.waitForFunction(() => document.getElementById('bossIntroOverlay').getAttribute('aria-hidden') === 'true' && window.__debugHooks.gameState.phase === 'combat', null, { timeout: 6500 });
  assert.equal(await page.locator('.monsterCard.storyBoss .lvlTag').textContent(), 'Lv.XXX');
  assert.equal(await page.locator('.monsterCard.storyBoss .actionRow').evaluate(element => getComputedStyle(element).visibility), 'visible');
  assert.equal(await page.locator('.monsterCard.storyBoss .hpRow').evaluate(element => getComputedStyle(element).visibility), 'hidden');
  await page.waitForSelector('#bossArena .ruinsSpike', { timeout: 2500 });
  assert.equal(await page.locator('#bossArena .ruinsSpike').count(), 4);
  const hpBeforeSpikeImpact = await page.evaluate(() => window.__debugHooks.gameState.roster.find(character => character.id === 'wuming').curHp);
  await page.waitForTimeout(1700);
  assert.equal(await page.evaluate(() => window.__debugHooks.gameState.roster.find(character => character.id === 'wuming').curHp), hpBeforeSpikeImpact, 'spikes should not deal damage before visibly reaching the left edge');
  assert.equal(await page.locator('#bossArena .ruinsSpike').count(), 4, 'the five-second spike travel must remain visible after 1.7 seconds');
  await page.locator('#bossArena .ruinsSpike').first().dispatchEvent('click');
  await page.waitForFunction(() => document.querySelectorAll('#bossArena .ruinsSpike:not(.destroyed)').length === 3);
  await page.waitForSelector('#bossArena .ruinsSpikeImpact', { timeout: 6000 });
  assert.match(await page.locator('#bossArena .ruinsSpikeImpact').textContent(), /^3 枚岩刺命中　-\d+ HP$/);
  await page.waitForFunction(() => window.__debugHooks.storyState.dialogueScriptId === 'chapter1_defeat', null, { timeout: 7000 });
  assert.deepEqual(await page.evaluate(() => {
    const wuming = window.__debugHooks.gameState.roster.find(character => character.id === 'wuming');
    return { hp: wuming.curHp, alive: wuming.alive, chapter: window.__debugHooks.gameState.chapter1State };
  }), { hp: 0, alive: false, chapter: 'goddess' });

  await advanceDialogue(2);
  assert.deepEqual(await page.evaluate(() => ({
    playing: document.getElementById('teleportStoneBreak').classList.contains('playing'),
    hidden: document.getElementById('teleportStoneBreak').getAttribute('aria-hidden'),
    locked: window.__debugHooks.storyState.lineEffectLocked,
    art: document.querySelector('.teleportBreakStone img').getAttribute('src'),
    shatteredArt: document.querySelector('.teleportBreakShattered img').getAttribute('src'),
    clippedFragments: document.querySelectorAll('.teleportBreakFragment').length,
    flashIsRound: getComputedStyle(document.querySelector('.teleportBreakFlash')).borderRadius === '50%',
    flashIsSquare: document.querySelector('.teleportBreakFlash').offsetWidth === document.querySelector('.teleportBreakFlash').offsetHeight,
  })), {
    playing: true,
    hidden: 'false',
    locked: true,
    art: 'assets/story/teleport_stone.png?v=20260905-2',
    shatteredArt: 'assets/story/teleport_stone_shattered.png?v=20260905-2',
    clippedFragments: 0,
    flashIsRound: true,
    flashIsSquare: true,
  });
  await page.waitForFunction(() => !window.__debugHooks.storyState.lineEffectLocked, null, { timeout: 3500 });
  await advanceDialogue(lineCount('chapter1_defeat') - 2);
  assert.equal(await page.evaluate(() => window.__debugHooks.storyState.dialogueScriptId), 'chapter1_goddess');
  assert.deepEqual(await page.evaluate(() => ({
    phase: window.__debugHooks.storyState.dialoguePhase,
    playing: document.getElementById('heavenTransition').classList.contains('playing'),
    arrival: document.getElementById('heavenTransition').classList.contains('arrival'),
    backdrop: getComputedStyle(document.getElementById('dialogueOverlay')).backgroundImage.includes('heaven-sanctuary-quiet.png'),
    corridor: getComputedStyle(document.querySelector('.heavenTransitionCorridor')).backgroundImage.includes('teleport_corridor.png'),
    corridorFit: getComputedStyle(document.querySelector('.heavenTransitionCorridor')).backgroundSize,
    veilRepeat: getComputedStyle(document.querySelector('.heavenTransitionVeil')).backgroundRepeat,
    veilTransform: getComputedStyle(document.querySelector('.heavenTransitionVeil')).transform,
  })), {
    phase: 'intro',
    playing: true,
    arrival: true,
    backdrop: true,
    corridor: true,
    corridorFit: 'cover',
    veilRepeat: 'no-repeat',
    veilTransform: 'none',
  });
  await click('heavenTransition');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.__debugHooks.storyState.dialoguePhase), 'intro');
  await page.waitForFunction(() => window.__debugHooks.storyState.dialoguePhase === 'dialogue');
  assert.equal(await page.textContent('#dialogueText'), DIALOGUE_DEFS.chapter1_goddess[0].text);
  await advanceDialogue(2);
  assert.deepEqual(await page.evaluate(() => ({
    goddess: document.getElementById('dialoguePortraitFrame').classList.contains('goddessSpeaker'),
    art: document.getElementById('dialoguePortraitImg').getAttribute('src'),
    entering: document.getElementById('dialoguePortraitImg').classList.contains('lineEntering'),
  })), { goddess: true, art: 'assets/story/goddess.png', entering: true });
  await page.waitForTimeout(700);
  await advanceDialogue(1);
  await advanceDialogue(1);
  assert.deepEqual(await page.evaluate(() => ({
    goddess: document.getElementById('dialoguePortraitFrame').classList.contains('goddessSpeaker'),
    returning: document.getElementById('dialoguePortraitFrame').classList.contains('goddessReturning'),
    entering: document.getElementById('dialoguePortraitImg').classList.contains('lineEntering'),
  })), { goddess: true, returning: true, entering: false });
  assert.equal(DIALOGUE_DEFS.chapter1_goddess.some(line => line.text === '歡迎回到人間，璃雪。'), false);
  await advanceDialogue(lineCount('chapter1_goddess') - 4);
  assert.deepEqual(await page.evaluate(() => ({
    phase: window.__debugHooks.storyState.dialoguePhase,
    playing: document.getElementById('heavenTransition').classList.contains('playing'),
    departure: document.getElementById('heavenTransition').classList.contains('departure'),
  })), { phase: 'outro', playing: true, departure: true });
  const departureBounds = await page.evaluate(() => {
    const stage = document.getElementById('heavenTransition');
    const corridor = stage.querySelector('.heavenTransitionCorridor');
    const veil = stage.querySelector('.heavenTransitionVeil');
    const animations = stage.getAnimations({ subtree: true });
    const samples = [1200, 2100, 2700].map(time => {
      animations.forEach(animation => { animation.pause(); animation.currentTime = time; });
      const frame = stage.getBoundingClientRect();
      const light = corridor.getBoundingClientRect();
      return light.left <= frame.left && light.right >= frame.right &&
        light.top <= frame.top && light.bottom >= frame.bottom &&
        getComputedStyle(veil).transform === 'none';
    });
    return samples;
  });
  assert.deepEqual(departureBounds, [true, true, true], 'return light never exposes an inset rectangular layer');
  assert.equal(DIALOGUE_DEFS.chapter1_after_book.some(line => line.text.includes('這次可得仔細聽')), false);
  await click('heavenTransition');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.__debugHooks.storyState.dialoguePhase), 'outro');
  await page.waitForFunction(() => window.__debugHooks.storyState.dialogueScriptId === 'chapter1_home_return');
  assert.deepEqual(await page.evaluate(() => ({
    script: window.__debugHooks.storyState.dialogueScriptId,
    location: window.__debugHooks.overlayUiState.prepLocation,
    mode: window.__debugHooks.gameState.expeditionMode,
  })), { script: 'chapter1_home_return', location: 'home', mode: 'forest' });
  await advanceDialogue(lineCount('chapter1_home_return'));
  assert.equal(await page.evaluate(() => window.__debugHooks.gameState.chapter1State), 'journalPending');
  assert.deepEqual(await page.evaluate(() => ({
    journalVisible: !document.getElementById('travelJournalBtn').hidden,
    journalEnabled: !document.getElementById('travelJournalBtn').disabled,
    journalFocused: document.getElementById('travelJournalBtn').classList.contains('storyFocusTarget'),
    bodyLocked: document.body.classList.contains('storyOperationLock'),
    growthDisabled: document.getElementById('homeGrowthBtn').disabled,
    backDisabled: document.getElementById('homeBackBtn').disabled,
    bagDisabled: document.getElementById('bagBtn').disabled,
    guideVisible: !document.getElementById('homeGuideHina').hidden,
    guideParent: document.getElementById('homeGuideHina').parentElement.id,
    guideText: document.getElementById('storyGuideText').textContent,
  })), {
    journalVisible: true,
    journalEnabled: true,
    journalFocused: true,
    bodyLocked: true,
    growthDisabled: true,
    backDisabled: true,
    bagDisabled: true,
    guideVisible: true,
    guideParent: 'travelJournalBtn',
    guideText: '翻翻那本手記吧',
  });

  await click('travelJournalBtn');
  assert.equal(await page.evaluate(() => window.__debugHooks.gameState.chapter1State), 'journalReading');
  assert.equal(await page.getAttribute('#journalOverlay', 'aria-hidden'), 'false');
  for (let i = 0; i < JOURNAL_PAGES.length; i++) {
    await page.waitForFunction(() => !document.getElementById('journalNextBtn').disabled, null, { timeout: 3000 });
    assert.equal(await page.textContent('#journalPageText'), JOURNAL_PAGES[i]);
    await click('journalNextBtn');
  }
  await page.waitForFunction(() => window.__debugHooks.storyState.dialogueScriptId === 'chapter1_after_book');
  await advanceDialogue(lineCount('chapter1_after_book'));
  assert.deepEqual(await page.evaluate(() => ({
    chapter: window.__debugHooks.gameState.chapter1State,
    bodyLocked: document.body.classList.contains('storyOperationLock'),
    guideHidden: document.getElementById('homeGuideHina').hidden,
  })), { chapter: 'complete', bodyLocked: false, guideHidden: true });

  assertNoRuntimeErrors(page, 'chapter 1 ruins flow');
  await page.close();
}

async function openEvent(browser, eventId) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.runtimeErrors = [];
  page.on('pageerror', error => page.runtimeErrors.push(error));
  await page.goto(`${prototypeUrl}?debug&event=${eventId}`, { waitUntil: 'load' });
  await page.waitForSelector('#eventOverlay.open');
  return page;
}

async function testEventArtwork(browser) {
  const expected = {
    'abandoned-camp': 'abandoned-camp-quiet.png',
    'flattened-herbs': 'flattened-herbs-quiet.png',
    'sealed-supply-crate': 'sealed-supply-crate-quiet.png',
    'floating-bubbles': 'floating-bubbles-quiet.png',
    'broken-ancient-aqueduct': 'broken-aqueduct-quiet.png',
    'slime-trail-fork': 'slime-trail-fork-quiet.png',
    'ruins-entrance': 'ruins-entrance-quiet.png',
    'rain-stone-shelter': 'rain-stone-shelter-quiet.png',
    'two-color-spores': 'two-color-spores-quiet.png',
    'crystal-echo': 'crystal-tree-hollow-quiet.png',
  };
  for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 720 }]) {
    for (const [id, filename] of Object.entries(expected)) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${prototypeUrl.replace('game.html', 'index.html')}?debug&event=${id}`);
      const frame = page.frames().find(item => item.url().includes('game.html'));
      await frame.waitForSelector('#eventOverlay.open');
      const art = frame.locator('#eventSceneImage');
      await art.evaluate(image => image.decode());
      assert.equal(await art.getAttribute('src'), `assets/events/${filename}`);
      const rendered = await art.evaluate(image => ({
        fit: getComputedStyle(image).objectFit,
        transform: getComputedStyle(image).transform,
        backdrop: getComputedStyle(image.parentElement, '::before').backgroundImage,
        width: image.naturalWidth,
      }));
      assert.ok(rendered.width > 0);
      assert.equal(rendered.fit, 'contain', `${id}: show entire event composition`);
      assert.equal(rendered.transform, 'none', `${id}: no zoom cropping`);
      assert.ok(rendered.backdrop.includes(filename), `${id}: backdrop must use the current art`);
      await page.waitForTimeout(350);
      const bounds = await frame.locator('#eventModal').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1
        && bounds.y + bounds.height <= viewport.height + 1, `${id}: modal fits viewport`);
      const skip = frame.locator('#eventSkipBtn');
      await skip.click();
      await frame.waitForFunction(() => document.getElementById('eventOverlay').getAttribute('aria-hidden') === 'true');
      assert.deepEqual(errors, [], `${id}: no runtime errors`);
      await page.close();
    }
  }
}

async function waitForEventToFinish(page, label) {
  await page.waitForSelector('#eventModal.resolved');
  const resultLayout = await page.locator('#eventFeedback').evaluate(feedback => {
    const bounds = feedback.getBoundingClientRect();
    const area = feedback.closest('.eventInteraction').getBoundingClientRect();
    return {
      heading: feedback.querySelector('b')?.textContent,
      message: feedback.querySelector('span')?.textContent,
      contained: bounds.left >= area.left - 1 && bounds.right <= area.right + 1
        && bounds.top >= area.top - 1 && bounds.bottom <= area.bottom + 1,
      disabled: [...document.querySelectorAll('#eventChallenge button')].every(button => button.disabled),
    };
  });
  assert.equal(resultLayout.heading, '事件結果');
  assert.ok(resultLayout.message, `${label}: outcome text is present`);
  assert.ok(resultLayout.contained, `${label}: result card stays inside the interaction area`);
  assert.ok(resultLayout.disabled, `${label}: resolved choices cannot award twice`);
  await page.waitForFunction(() => document.getElementById('eventOverlay').getAttribute('aria-hidden') === 'true', null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => window.__debugHooks.gameState.activeOverlay), null, `${label} must release the active overlay`);
  assertNoRuntimeErrors(page, label);
  await page.close();
}

async function testEventInteractions(browser) {
  let page = await openEvent(browser, 'abandoned-camp');
  const goldBefore = await page.evaluate(() => window.__debugHooks.gameState.runGold);
  await page.click('[data-event-action="choice"][data-option-index="2"]');
  assert.equal(await page.evaluate(() => window.__debugHooks.gameState.runGold), goldBefore + 12, 'camp choice must grant its stated gold');
  await waitForEventToFinish(page, 'camp event');

  page = await openEvent(browser, 'flattened-herbs');
  await page.click('[data-event-action="herb"]:has(img[src$="herb_purple_round.png"])');
  await waitForEventToFinish(page, 'herb puzzle');

  page = await openEvent(browser, 'floating-bubbles');
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-event-action="bubble"]')];
    const values = buttons.map(button => Number(button.textContent.trim()));
    for (let first = 0; first < values.length; first++) {
      for (let second = first + 1; second < values.length; second++) {
        if (values[first] + values[second] === 7) {
          buttons[first].click();
          buttons[second].click();
          return;
        }
      }
    }
    throw new Error('bubble puzzle did not contain a pair totaling seven');
  });
  await page.click('[data-event-action="bubble-confirm"]');
  await waitForEventToFinish(page, 'bubble puzzle');

  page = await openEvent(browser, 'two-color-spores');
  assert.equal(await page.locator('.mushroomGoalReference b').textContent(), '目標排列');
  assert.equal(await page.locator('.mushroomGoal i').count(), 9);
  for (const index of [0, 0, 4, 4, 8, 8]) {
    await page.click(`[data-event-action="mushroom"][data-index="${index}"]`);
  }
  await waitForEventToFinish(page, 'mushroom puzzle');

  page = await openEvent(browser, 'sealed-supply-crate');
  const firstDial = page.locator('[data-event-action="crate-dial"][data-index="0"]');
  for (const label of ['葉片', '水滴', '結晶', '日輪']) {
    assert.equal(await firstDial.locator('b').textContent(), label);
    assert.ok((await firstDial.getAttribute('aria-label')).includes(label));
    await firstDial.click();
  }
  assert.equal(await firstDial.locator('b').textContent(), '葉片', 'dial labels wrap with the symbol');
  await page.click('[data-event-action="crate-dial"][data-index="1"]');
  await page.click('[data-event-action="crate-dial"][data-index="2"]', { clickCount: 2 });
  await page.click('[data-event-action="crate-confirm"]');
  await waitForEventToFinish(page, 'crate puzzle');

  page = await openEvent(browser, 'broken-ancient-aqueduct');
  await page.evaluate(() => {
    const source = document.querySelector('[data-event-action="pipe"][data-pipe-role="source"]');
    const route = [...document.querySelectorAll('[data-event-action="pipe"][data-path-tile="true"]')];
    for (const tile of route) {
      if (tile === source) continue;
      const targetRotation = Number(tile.dataset.solutionRotation);
      for (let turns = 0; turns < 4 && Number(tile.dataset.rotation) !== targetRotation; turns++) tile.click();
    }
    for (let turns = 0; turns < 4 && !source.disabled; turns++) source.click();
    if (!source.disabled) throw new Error('aqueduct route did not resolve after a full source rotation');
  });
  await waitForEventToFinish(page, 'aqueduct puzzle');
}

async function testCombatAndGrowthAudit(browser) {
  for (const width of [1440, 390]) {
    const page = await openView(browser, 'village');
    await page.setViewportSize({ width, height: 1000 });
    const bars = await page.evaluate(async () => {
      const { gameState, characterActionInterval } = await import('./js/state.js');
      const combat = await import('./js/combat.js');
      const { render } = await import('./js/ui-main.js');
      gameState.party = ['xiaochu'];
      gameState.unlockedChars.add('xiaochu');
      (await import('./js/debug.js')).debugStartBossFight();
      const c = gameState.roster.find(c => c.id === 'xiaochu');
      c.lineLevels.speed = 100;
      c.lineLevels.action = 100;
      c.hasteMult = .5;
      c.hasteUntil = 8000;
      c.actionCycleMs = characterActionInterval(c);
      c.actionCountdown = c.actionCycleMs / 2;
      c.manualActionCd = 0;
      combat.useCharacterAction(c.id);
      render(); // Keep timer setup and measurement in one synchronous turn.
      const refs = gameState.charEls.xiaochu;
      const result = { cooldown: c.manualActionCd, fill: refs.manualActionButton.querySelector('.itemCdOverlay').style.height,
        actionFill: refs.atkBar.style.width };
      gameState.activeOverlay = 'dialogue';
      c.manualActionCd = 0;
      result.blockedDuringDialogue = !combat.canUseCharacterAction(c.id);
      gameState.activeOverlay = null;
      gameState.party = ['wuming'];
      result.blockedOffParty = !combat.canUseCharacterAction(c.id);
      gameState.party = ['xiaochu'];
      c.counterUntil = 10000;
      c.sleepUntilAction = true;
      c.charmedUntilAction = true;
      render();
      result.statuses = [...document.querySelectorAll('#partySide .statusBadge')].map(el => el.dataset.statusId);
      gameState.phase = 'prepFloor';
      gameState.partyLocked = false;
      gameState.inventory = [{ itemId: 'skillBook', qty: 20 }];
      (await import('./js/ui-character.js')).setCharacterDetailOpen(true, c.id);
      return result;
    });
    assert.equal(bars.cooldown, 8000);
    assert.equal(bars.fill, '100%');
    assert.equal(bars.actionFill, '50%');
    assert.equal(bars.blockedDuringDialogue, true);
    assert.equal(bars.blockedOffParty, true);
    assert.deepEqual(bars.statuses.slice(0, 2), ['sleep', 'charm']);

    await page.click('.growthCard[data-line="skill1"]');
    assert.match(await page.locator('.growthSkillDescription').textContent(), /成功格擋/);
    const values = await page.locator('.growthCompare strong').allTextContents();
    assert.notEqual(values[0], values[1], 'adjacent guard levels display their fractional difference');
    const before = await page.evaluate(async () => (await import('./js/state.js')).gameState.roster.find(c => c.id === 'xiaochu').lineLevels.skill1);
    await page.locator('#growthUpgradeBtn').focus();
    await page.keyboard.press('Enter');
    const after = await page.evaluate(async () => (await import('./js/state.js')).gameState.roster.find(c => c.id === 'xiaochu').lineLevels.skill1);
    assert.equal(after, before + 1, 'keyboard upgrade works once');
    assert.equal(await page.locator('#growthUpgradeBtn').evaluate(el => el === document.activeElement), true, 'keyboard focus survives upgrade rerender');
    // Close the panel while holding: no background resource consumption.
    await page.locator('#growthUpgradeBtn').scrollIntoViewIfNeeded();
    const closeButton = await page.locator('#characterDetailCloseBtn').boundingBox();
    assert.ok(closeButton.y >= 0 && closeButton.y + closeButton.height <= 1000, 'close button remains on screen after scrolling to upgrades');
    const button = await page.locator('#growthUpgradeBtn').boundingBox();
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
    await page.mouse.down();
    await page.evaluate(async () => (await import('./js/ui-character.js')).setCharacterDetailOpen(false));
    await page.mouse.up();
    const stoppedAt = await page.evaluate(async () => (await import('./js/state.js')).gameState.roster.find(c => c.id === 'xiaochu').lineLevels.skill1);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(async () => (await import('./js/state.js')).gameState.roster.find(c => c.id === 'xiaochu').lineLevels.skill1), stoppedAt);
    assertNoRuntimeErrors(page, 'combat and growth audit');
    await page.close();
  }
}

async function testEncounterStageFit(browser) {
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`${prototypeUrl.replace('game.html', 'index.html')}?debug`);
    const frame = page.frames().find(frame => frame.url().includes('game.html'));
    await frame.evaluate(async () => (await import('./js/story.js')).startDialogue('xiaochu_encounter'));
    for (let i = 0; i <= 12; i++) {
      await frame.waitForFunction(() => !window.__debugHooks.storyState.lineEffectLocked);
      if (i < 12) {
        for (const id of ['storyWuming', ...(i > 0 && i < 11 ? ['storySlime'] : [])]) {
          assert.equal(await frame.locator(`#${id}`).evaluate(el => {
            const r = el.getBoundingClientRect();
            const img = el.querySelector('img');
            if (!img.complete || !img.naturalWidth || r.top < 0 || r.left < 0 || r.right > innerWidth || r.bottom > innerHeight) return false;
            // isVisible() alone passes even when an ancestor clips the entire actor.
            for (let p = el.parentElement; p; p = p.parentElement) {
              const css = getComputedStyle(p), bounds = p.getBoundingClientRect();
              if (css.overflowY !== 'visible' && (r.top < bounds.top || r.bottom > bounds.bottom)) return false;
              if (css.overflowX !== 'visible' && (r.left < bounds.left || r.right > bounds.right)) return false;
            }
            return true;
          }), true, `${id} is loaded, on-screen and not clipped at encounter line ${i}`);
        }
      } else {
        assert.equal(await frame.locator('#storySlime').isVisible(), false);
        assert.equal(await frame.locator('#storyWuming').isVisible(), false);
      }
      await frame.evaluate(async () => (await import('./js/story.js')).advanceDialogue());
    }
    await page.close();
  }
}

async function testViewportFit(browser) {
  await testEncounterStageFit(browser);
  const sizes = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]];
  const views = [['village', '#villageView'], ['home', '#homeView'], ['regions', '#regionView'],
    ['expedition', '#expeditionView'], ['boss', '#combatView'], ['growth', '#characterDetailCloseBtn'],
    ['shop', '#shopOverlay'], ['inventory', '#inventoryOverlay'], ['journal', '#journalOverlay .journalPanel']];
  for (const [view, selector] of views) {
    const page = await browser.newPage();
    page.runtimeErrors = [];
    page.on('pageerror', error => page.runtimeErrors.push(error));
    await page.goto(`${prototypeUrl.replace('game.html', 'index.html')}?debug&view=${view}`);
    const frame = page.frames().find(frame => frame.url().includes('game.html'));
    assert.ok(frame, 'host mounts the game frame');
    await frame.locator(selector).waitFor({ state: 'visible' });
    await page.waitForTimeout(600);
    await frame.evaluate(() => { window.resizeAuditToken = Math.random(); });
    const token = await frame.evaluate(() => window.resizeAuditToken);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(80);
      const bounds = await page.locator('#gameFrame').boundingBox();
      assert.ok(bounds.x >= -.5 && bounds.y >= -.5 && bounds.x + bounds.width <= width + .5 && bounds.y + bounds.height <= height + .5, `${view}: whole canvas fits ${width}×${height}`);
      near(bounds.width / bounds.height, 16 / 9, 'canvas keeps its aspect ratio');
      const logicalSize = await frame.evaluate(() => [innerWidth, innerHeight]);
      if (['shop', 'growth'].includes(view)) {
        // CSS zoom rounds the embedded viewport by at most one logical pixel.
        assert.ok(Math.abs(logicalSize[0] - 1600) <= 1 && Math.abs(logicalSize[1] - 900) <= 1);
      } else assert.deepEqual(logicalSize, [1600, 900]);
      assert.equal(await frame.evaluate(() => window.resizeAuditToken), token, 'resize must not reload the game');
      for (const context of [page, frame]) {
        assert.equal(await context.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true, `${view}: no document overflow`);
      }
      const fits = await frame.locator(selector).evaluate((el, tolerance) => {
        const r = el.getBoundingClientRect();
        return r.left >= -tolerance && r.top >= -tolerance && r.right <= innerWidth + tolerance && r.bottom <= innerHeight + tolerance;
      }, ['shop', 'growth'].includes(view) ? 1 : .5);
      assert.equal(fits, true, `${view}: main surface/control remains inside the logical canvas`);
      if (['village', 'home', 'regions', 'expedition', 'boss'].includes(view)) {
        assert.deepEqual(await frame.locator(selector).evaluate(el => [el.clientWidth, el.clientHeight]), [1536, 864], 'all main scenes use the same 16:9 visible frame');
      }
      if (view === 'boss') {
        assert.equal(await frame.evaluate(() => {
          const rect = selector => document.querySelector(selector).getBoundingClientRect();
          const commands = rect('#combatActionBar');
          return ['#bossArena', '#partySide .charCard', '#monsterSide .boss'].every(selector => rect(selector).bottom <= commands.top);
        }), true, 'battle cards and clickable arena stay above the command bar');
      }
      if (view === 'expedition') {
        assert.equal(await frame.evaluate(() => {
          const rect = selector => document.querySelector(selector).getBoundingClientRect();
          return rect('.expeditionTechniquePreview').bottom < rect('#actionArea').top &&
            rect('#expeditionHeroPortrait').bottom <= rect('#prepRoster').top;
        }), true, 'departure skills and portrait remain clear of bottom controls');
      }
      if (view === 'village') {
        assert.equal(await frame.evaluate(() => {
          const scene = document.getElementById('villageView').getBoundingClientRect();
          return ['homeLocationBtn', 'townShopBtn', 'expeditionLocationBtn'].every(id => {
            const el = document.getElementById(id);
            const label = el.querySelector('b').getBoundingClientRect();
            return label.left >= scene.left && label.right <= scene.right && label.bottom <= scene.bottom &&
              el.contains(document.elementFromPoint(label.x + label.width / 2, label.y + label.height / 2));
          });
        }), true, 'labels remain visible and hit-testable in the shared scene frame');
      }
      if (process.argv.includes('--resize-only') && ['village', 'boss', 'growth'].includes(view)) {
        await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/resize-${view}-${width}.png`) });
      }
    }
    if (view === 'village') {
      await page.setViewportSize({ width: 1280, height: 720 });
      await frame.locator('#townShopBtn b').click();
      assert.equal(await frame.locator('#shopOverlay').getAttribute('aria-hidden'), 'false');
      await clickScaledFrame(page, frame, '#shopLeaveBtn');
      await frame.locator('#expeditionLocationBtn b').click();
      assert.equal(await frame.locator('#regionView').isVisible(), true);
      await frame.locator('#regionBackBtn').click();
      await frame.locator('#homeLocationBtn b').click();
      assert.equal(await frame.locator('#homeView').isVisible(), true);
    }
    if (view === 'home') {
      await page.setViewportSize({ width: 1280, height: 720 });
      await frame.locator('#homeGrowthBtn b').click();
      await frame.locator('#characterDetailOverlay.open').waitFor();
      await clickScaledFrame(page, frame, '#characterDetailCloseBtn');
      assert.equal(await frame.locator('#characterDetailOverlay').getAttribute('aria-hidden'), 'true', 'scaled click opens and closes the real panel');
    }
    if (view === 'journal') {
      await page.setViewportSize({ width: 1280, height: 720 });
      await frame.evaluate(async () => {
        (await import('./js/story.js')).openTravelJournal({ preview: true });
        (await import('./js/story.js')).showJournalContents();
        const list = document.getElementById('journalChapterList');
        for (let i = 0; i < 20; i++) list.append(list.firstElementChild.cloneNode(true));
      });
      await frame.locator('#journalChapterList').hover();
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(200);
      assert.ok(await frame.locator('#journalChapterList').evaluate(el => el.scrollTop) > 0, 'internal journal scrolling survives canvas scaling');
      assert.equal(await page.evaluate(() => scrollY), 0);
      assert.equal(await frame.evaluate(() => scrollY), 0);
    }
    if (view === 'inventory') {
      assert.equal(await frame.evaluate(() => {
        const modal = document.getElementById('inventoryModal');
        const header = modal.querySelector('.inventoryHeader');
        const m = modal.getBoundingClientRect(), h = header.getBoundingClientRect();
        return Math.abs(h.left - m.left - modal.clientLeft) < .1 && Math.abs(h.width - modal.clientWidth) < .1;
      }), true, 'sticky header background spans the inner frame without side seams');
      await frame.evaluate(async () => {
        const state = (await import('./js/state.js')).gameState;
        state.inventory = [{ itemId: 'potion', qty: 2 }, { itemId: 'skillBook', qty: 3 }, null];
        (await import('./js/ui-commerce.js')).renderInventory();
      });
      await frame.locator('#inventoryGrid [data-item-id="skillBook"]').click();
      assert.match(await frame.locator('#inventoryDetail').textContent(), /技能書/);
      await frame.locator('#inventoryGrid [data-item-id="potion"]').focus();
      await page.keyboard.press('Enter');
      assert.match(await frame.locator('#inventoryDetail').textContent(), /治療藥水/);
      await frame.locator('#inventoryGrid [data-item-id="potion"]').dragTo(frame.locator('#inventoryGrid [data-slot-index="2"]'));
      assert.equal(await frame.evaluate(async () => (await import('./js/state.js')).gameState.inventory[2].itemId), 'potion');
      assert.equal(await frame.locator('#inventoryGrid [data-item-id="potion"]').getAttribute('aria-pressed'), 'true');
      await frame.evaluate(async () => {
        (await import('./js/state.js')).gameState.inventory = [{ itemId: 'potion', qty: 1 }];
        (await import('./js/ui-commerce.js')).renderInventory();
      });
      await frame.locator('#inventoryGrid').evaluate(grid => {
        const entry = grid.firstElementChild;
        for (let i = 0; i < 80; i++) grid.append(entry.cloneNode(true));
      });
      await frame.locator('#inventoryGrid').hover();
      await page.mouse.wheel(0, 650);
      await page.waitForTimeout(200);
      assert.ok(await frame.locator('#inventoryModal').evaluate(el => el.scrollTop) > 0);
      const close = await frame.locator('#inventoryCloseBtn').evaluate(el => el.getBoundingClientRect().top);
      assert.ok(close >= 0 && close < 900, 'inventory close button stays visible while content scrolls');
    }
    if (view === 'boss') {
      await frame.locator('#combatLogToggleBtn').click();
      assert.equal(await frame.locator('#combatLogToggleBtn').getAttribute('aria-expanded'), 'true');
      await frame.locator('#combatLogToggleBtn').click();
      await frame.locator('#partySide .skillIcon').first().hover();
      assert.equal(await frame.locator('#tooltip').isVisible(), true, 'scaled hover keeps tooltip usable');
      assert.equal(await frame.locator('#tooltip').evaluate(el => {
        const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      }), true);
      await frame.evaluate(async () => {
        const state = (await import('./js/state.js')).gameState;
        state.phase = 'prepBoss';
        const ui = await import('./js/ui-overlays.js');
        ui.prepareBossCombat();
        ui.showBossIntro(ui.activatePreparedCombat);
      });
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(100);
        assert.equal(await frame.locator('#bossIntroOverlay').getAttribute('aria-hidden'), 'false');
        assert.deepEqual(await frame.evaluate(() => [innerWidth, innerHeight]), [1600, 900]);
      }
      await page.waitForTimeout(2700);
      assert.equal(await frame.locator('#bossIntroOverlay .bossCinemaBars').isVisible(), false, 'slime king fills the canvas without letterbox bars');
      assert.equal(await frame.locator('.bossIntroPortrait').evaluate(el => {
        const r = el.getBoundingClientRect();
        return el.complete && el.naturalWidth > 0 && r.top >= innerHeight * .08 && r.bottom <= innerHeight * .92 &&
          r.left >= 0 && r.right <= innerWidth && getComputedStyle(el).animationName === 'slimeKingApproach';
      }), true, 'new king reveal is loaded, clear of cinema bars and uses one continuous motion');
      await frame.locator('#bossIntroOverlay').click({ position: { x: 20, y: 20 } });
      assert.equal(await frame.locator('#bossIntroOverlay').getAttribute('aria-hidden'), 'false', 'new presentation cannot be skipped');
      await frame.waitForFunction(() => document.getElementById('bossIntroOverlay').getAttribute('aria-hidden') === 'true');
      assert.equal(await frame.evaluate(async () => (await import('./js/state.js')).gameState.phase), 'combat');
    }
    assertNoRuntimeErrors(page, `scaled ${view}`);
    await page.close();
  }
}

async function testCombatScene(browser) {
  for (const width of [1440, 1280]) {
    const page = await openView(browser, 'boss');
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 1000 });
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      // Park the debug scheduler while checking real DOM input and effects;
      // unlike a dialogue overlay this does not disable combat controls.
      (await import('./js/debug.js')).debugState.speedMultiplier = .001;
      gameState.activeOverlay = 'dialogue';
      (await import('./js/ui-main.js')).render();
    });
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      (await import('./js/state.js')).gameState.activeOverlay = null;
      (await import('./js/ui-main.js')).render();
    });
    assert.equal(await page.locator('#log').isVisible(), false, 'battle log starts folded');
    await page.locator('#combatLogToggleBtn').click();
    assert.equal(await page.locator('#log').isVisible(), true);
    assert.equal(await page.locator('#combatLogToggleBtn').getAttribute('aria-expanded'), 'true');
    await page.locator('#combatLogToggleBtn').click();
    const geometry = async () => page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const commands = rect('#combatActionBar');
      const player = rect('#partySide .charCard');
      const arena = rect('#bossArena');
      const cards = [...document.querySelectorAll('#monsterSide .monsterCard')].map(el => el.getBoundingClientRect());
      const enemies = rect('#monsterSide');
      const enemyHeading = rect('.enemyColumn .columnHeading');
      return { controlsVisible: commands.bottom <= innerHeight,
        playerClear: player.bottom < commands.top,
        arenaClear: arena.bottom < commands.top,
        enemiesClear: cards.every(card => card.top >= enemyHeading.bottom && card.bottom < arena.top),
        enemiesFit: cards.every(card => card.left >= enemies.left - 1 && card.right <= enemies.right + 1),
        noHorizontalScroll: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.deepEqual(await geometry(), { controlsVisible: true, playerClear: true, arenaClear: true, enemiesClear: true, enemiesFit: true, noHorizontalScroll: true });
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      const c = gameState.roster.find(c => c.id === gameState.party[0]);
      c.skillCds[0] = 2300;
      gameState.monsters[0].skillCd = 3200;
      (await import('./js/ui-main.js')).render();
    });
    assert.equal(await page.locator('#partySide .skillCdText').first().textContent(), '3');
    const tooltipValues = await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      const { CHAR_DEFS, STAT_LINE_MAX } = await import('./js/constants.js');
      const ui = await import('./js/ui-loadout.js');
      const c = gameState.roster.find(c => c.id === gameState.party[0]);
      c.lineLevels.action = STAT_LINE_MAX;
      const action = ui.characterActionTooltipHTML(CHAR_DEFS[c.id].action, c);
      c.lineLevels.action = 0;
      return action;
    });
    assert.match(tooltipValues, /目前效果/);
    assert.match(tooltipValues, /30.0%/);
    assert.match(tooltipValues, /60.0%/);
    assert.equal(await page.locator('#monsterSide .skillCdText').first().textContent(), '4');
    await page.locator('#partySide .skillIcon').first().focus();
    assert.equal(await page.locator('#tooltip').isVisible(), true, 'automatic skills support keyboard tooltips');
    await page.locator('#combatLogToggleBtn').focus();
    await page.evaluate(async () => {
      (await import('./js/goo.js')).spawnGooBatch();
    });
    assert.ok(await page.locator('#bossArena .goo').count() > 0);
    await page.evaluate(async () => (await import('./js/ui-main.js')).render());
    assert.equal(await page.locator('#bossArena').getAttribute('data-mechanic'), 'goo');
    assert.match(await page.locator('.arenaCaption b').textContent(), /剩餘 3/);
    assert.equal(await page.locator('#bossArena').evaluate(arena => [...arena.querySelectorAll('.goo')].every(el =>
      el.offsetWidth >= 44 && el.offsetLeft >= 0 && el.offsetTop >= 0 &&
      el.offsetLeft + el.offsetWidth <= arena.clientWidth && el.offsetTop + el.offsetHeight <= arena.clientHeight)), true);
    if (width === 1440) await page.screenshot({ path: path.resolve(__dirname, '../.local/test-results/combat-redesign-slime.png'), fullPage: true });
    await page.locator('#bossArena .goo').first().press('Enter');
    while (await page.locator('#bossArena .goo').count()) {
      // Pulsing targets intentionally never become "stable" for locator.click.
      const target = await page.locator('#bossArena .goo').first().boundingBox();
      await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
    }
    assert.equal(await page.evaluate(async () => (await import('./js/state.js')).gameState.activeGooBatch), null, 'enlarged targets still complete the mechanic');
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      const { bossSummonTick } = await import('./js/combat.js');
      const boss = gameState.monsters[0];
      for (let i = 0; i < 2; i++) {
        boss.summonOpeningMs = 0;
        boss.skill2Cd = 0;
        bossSummonTick(boss);
        (await import('./js/ui-combat-effects.js')).flushCombat();
      }
    });
    assert.equal(await page.locator('#monsterSide .monsterCard').count(), 3);
    assert.equal((await geometry()).enemiesFit, true, 'boss plus two summons fit the battlefield');
    assert.equal((await geometry()).enemiesClear, true, 'summons do not push boss skills into the arena');
    if (width === 1440) {
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.resolve(__dirname, '../.local/test-results/combat-redesign-summons.png'), fullPage: true });
    }
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      const { spawnWave, makeMob } = await import('./js/combat.js');
      gameState.mobsCleared = 0;
      spawnWave();
      while (gameState.monsters.length < 3) gameState.monsters.push(makeMob());
      (await import('./js/ui-combat-effects.js')).flushCombat();
    });
    assert.equal(await page.locator('#bossArena').isVisible(), false);
    assert.equal((await geometry()).enemiesFit, true);
    await page.locator('#monsterSide img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    if (width === 1440) await page.screenshot({ path: path.resolve(__dirname, '../.local/test-results/combat-redesign-mobs.png'), fullPage: true });
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      gameState.unlockedChars.add('xiaochu');
      gameState.party = ['xiaochu'];
      const ui = await import('./js/ui-main.js');
      ui.buildBattleRoster();
      ui.render();
    });
    await page.locator('#partySide .portrait > img').evaluate(img => img.decode());
    assert.equal(await page.locator('#partySide .portrait > img').getAttribute('src'), 'assets/characters/xiaochu.png');
    await page.locator('.charActionButton').click();
    assert.equal(await page.locator('.charActionButton').getAttribute('aria-disabled'), 'true');
    assert.equal(await page.locator('.commandState').textContent(), '冷卻中');
    await page.mouse.move(10, 10);
    await page.locator('.charActionButton').evaluate(el => el.blur());
    if (width === 1440) await page.screenshot({ path: path.resolve(__dirname, '../.local/test-results/combat-redesign-xiaochu.png'), fullPage: true });
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      gameState.expeditionMode = 'ruins';
      gameState.party = ['wuming'];
      (await import('./js/ui-main.js')).buildBattleRoster();
      (await import('./js/combat.js')).spawnRuinsLord();
      (await import('./js/ui-combat-effects.js')).flushCombat();
    });
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('#monsterSide .lvlTag').textContent(), 'Lv.XXX');
    assert.equal(await page.locator('#monsterSide .hpRow').evaluate(el => getComputedStyle(el).visibility), 'hidden');
    assert.equal(await page.locator('#monsterSide .actionRow').isVisible(), true);
    const hiddenStats = await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      const ui = await import('./js/ui-loadout.js');
      const boss = gameState.monsters[0];
      const html = ui.monsterTooltipHTML(boss);
      boss.pendingSpikeMs = 2500;
      boss.pendingSpikes = [{ active: true }, { active: false }];
      (await import('./js/ui-main.js')).render();
      return html;
    });
    assert.ok(!hiddenStats.includes('12000') && !hiddenStats.includes('300'), 'unknown boss stats do not leak via tooltip');
    assert.equal(await page.locator('#monsterSide .atkBar').evaluate(el => el.style.width), '50%');
    assert.match(await page.locator('.arenaCaption b').textContent(), /剩餘 1 枚/);
    assert.match(await page.locator('.arenaCaption small').textContent(), /3 秒/);
    if (width === 1440) await page.screenshot({ path: path.resolve(__dirname, '../.local/test-results/combat-redesign-ruins.png'), fullPage: true });
    const beforeResult = await page.locator('#combatView').boundingBox();
    for (const phase of ['victory', 'defeat']) {
      await page.evaluate(async phase => {
        (await import('./js/state.js')).gameState.phase = phase;
        (await import('./js/ui-main.js')).render();
      }, phase);
      assert.deepEqual(await page.locator('#combatView').boundingBox(), beforeResult, 'result overlays must not resize the battlefield');
    }
    assertNoRuntimeErrors(page, 'combat scene redesign');
    await page.close();
  }
}

async function testSoftBattleArt(browser) {
  for (const width of [1440, 390]) {
    const page = await openView(browser, 'village');
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      gameState.unlockedChars.add('xiaochu');
      gameState.party = ['xiaochu'];
      (await import('./js/debug.js')).debugStartBossFight();
      gameState.activeOverlay = 'test-pause';
      (await import('./js/ui-main.js')).render();
    });
    const art = page.locator('#partySide .portrait > img');
    assert.equal(await art.getAttribute('src'), 'assets/characters/xiaochu.png');
    const metrics = await art.evaluate(async img => {
      await img.decode();
      const css = getComputedStyle(img);
      const rect = img.getBoundingClientRect();
      const frame = img.parentElement;
      const bounds = frame.getBoundingClientRect();
      return { width: rect.width, height: rect.height,
        frameWidth: frame.clientWidth, frameHeight: frame.clientHeight, fit: css.objectFit,
        inside: rect.left >= bounds.left + frame.clientLeft - .5 &&
          rect.right <= bounds.left + frame.clientLeft + frame.clientWidth + .5 &&
          rect.top >= bounds.top + frame.clientTop - .5 &&
          rect.bottom <= bounds.top + frame.clientTop + frame.clientHeight + .5,
        mask: css.maskImage, radius: css.borderRadius,
        frameOverflow: getComputedStyle(img.parentElement).overflowX,
        frameMask: getComputedStyle(img.parentElement).maskImage };
    });
    near(metrics.width, metrics.frameWidth, 'art viewport fills inner frame width');
    near(metrics.height, metrics.frameHeight, 'art viewport fills inner frame height');
    assert.equal(metrics.fit, width >= 960 ? 'contain' : 'cover', 'desktop battlefield preserves the full character silhouette');
    assert.equal(metrics.inside, true, 'art viewport must stay inside the inner portrait frame');
    assert.equal(metrics.mask, 'none', 'no bottom fade');
    assert.equal(metrics.radius, width >= 960 ? '0px' : '6px');
    assert.equal(metrics.frameOverflow, 'visible');
    assert.equal(metrics.frameMask, 'none', 'status icons must not inherit the artwork mask');
    const feedback = await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      const { useCharacterAction, guardEnemyDamage } = await import('./js/combat.js');
      const { flushCombat } = await import('./js/ui-combat-effects.js');
      const c = gameState.roster.find(c => c.id === 'xiaochu');
      c.manualActionCd = 0;
      c.sleepUntilAction = false;
      c.charmedUntilAction = false;
      useCharacterAction(c.id);
      const reduced = guardEnemyDamage(c, 20);
      flushCombat();
      return { reduced, ring: !!document.querySelector('#partySide .guardBlockRing'),
        statuses: [...document.querySelectorAll('#partySide .statusName')].map(el => el.textContent) };
    });
    assert.equal(feedback.reduced, 8);
    assert.equal(feedback.ring, true, 'successful guard plays shield feedback');
    assert.ok(feedback.statuses.includes('反擊就緒'));
    assert.ok(feedback.statuses.includes('斬擊強化'));
    assertNoRuntimeErrors(page, 'soft battle art');
    await page.close();
  }
}

async function testXiaochuDaily(browser) {
  const page = await openView(browser, 'village');
  await page.click('#debugToggleBtn');
  await page.click('[data-debug-action="xiaochu-daily"]');
  await page.click('#debugToggleBtn');
  assert.equal(await page.locator('#xiaochuTalkBtn img').getAttribute('src'), 'assets/characters/xiaochu_full.png');
  const button = page.locator('#xiaochuTalkBtn');
  assert.equal(await button.isVisible(), false, 'daily content is retained without a home entry');
  assert.equal(await button.isEnabled(), true);
  assert.equal(await button.evaluate(el => el.classList.contains('storyRequired')), false);
  if (process.argv.includes('--daily-only')) {
    fs.mkdirSync(path.resolve(__dirname, '../.local/test-results'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../.local/test-results/xiaochu-daily-home.png') });
  }
  for (const [index, id] of ['xiaochu_daily_practice', 'xiaochu_daily_chair', 'xiaochu_daily_departure'].entries()) {
    await page.evaluate(async () => (await import('./js/story.js')).talkToXiaochu());
    const opened = await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      const { storyState } = await import('./js/story.js');
      return { id: storyState.dialogueScriptId, index: gameState.xiaochuDailyTalkIndex,
        backdrop: document.getElementById('dialogueOverlay').classList.contains('homeDialogue') };
    });
    assert.deepEqual(opened, { id, index, backdrop: true });
    const finished = await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      const { advanceDialogue, storyState } = await import('./js/story.js');
      const count = storyState.dialogueScript.length;
      for (let i = 0; i < count; i++) advanceDialogue();
      const { createSaveData, normalizeSaveData, applySaveData } = await import('./js/save.js');
      const saved = normalizeSaveData(createSaveData());
      const overlay = gameState.activeOverlay;
      applySaveData(saved);
      return { index: gameState.xiaochuDailyTalkIndex, overlay };
    });
    assert.deepEqual(finished, { index: (index + 1) % 3, overlay: null });
    // Loading returns to the village; bring the next conversation back home.
    await page.evaluate(async () => {
      const { overlayUiState } = await import('./js/ui-overlays.js');
      const { render } = await import('./js/ui-main.js');
      overlayUiState.prepLocation = 'home';
      overlayUiState.homeMode = 'menu';
      render();
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await button.isVisible(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  if (process.argv.includes('--daily-only')) {
    await page.screenshot({ path: path.resolve(__dirname, '../.local/test-results/xiaochu-daily-mobile.png') });
  }
  const blocked = await page.evaluate(async () => {
    const { gameState, setResonanceState, RESONANCE_STATES } = await import('./js/state.js');
    const { talkToXiaochu, storyState } = await import('./js/story.js');
    setResonanceState('xiaochu', RESONANCE_STATES.FOLLOWING, { force: true });
    gameState.xiaochuStoryChapter = 1;
    talkToXiaochu();
    return storyState.dialogueScriptId;
  });
  assert.equal(blocked, 'xiaochu_choice', 'legacy travel-wait progress resumes covenant discussion, not daily chat');
  assertNoRuntimeErrors(page, 'Xiaochu daily conversations');
  await page.close();
}

async function testWumingSkills(browser) {
  for (const width of [1440, 390]) {
    const page = await openView(browser, 'village');
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(async () => {
      const { setCharacterDetailOpen } = await import('./js/ui-character.js');
      setCharacterDetailOpen(true, 'wuming');
    });
    for (const name of ['試探刺擊', '穩住腳步', '抓到空隙了！', '我還能撐住']) {
      assert.equal(await page.locator('.growthCard b').filter({ hasText: name }).count(), 1);
    }
    for (const id of ['skill1', 'skill2', 'skill3', 'action']) {
      const basename = `lixue_${id}`;
      const line = id === 'action' ? 'action' : `skill${Number(id.slice(-1)) - 1}`;
      const img = page.locator(`.growthCard[data-line="${line}"] img[src="assets/skills/${basename}.png"]`);
      await img.evaluate(el => el.decode());
      assert.ok(await img.evaluate(el => el.naturalWidth > 0));
    }
    if (process.argv.includes('--wuming-only')) {
      fs.mkdirSync(path.resolve(__dirname, '../.local/test-results'), { recursive: true });
      await page.locator('.growthCard[data-line="action"]').scrollIntoViewIfNeeded();
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/wuming-skills-${width}.png`) });
    }
    const state = await page.evaluate(async () => {
      const { setCharacterDetailOpen } = await import('./js/ui-character.js');
      setCharacterDetailOpen(false);
      const { gameState } = await import('./js/state.js');
      const { CHAR_DEFS } = await import('./js/constants.js');
      const { performSkill, useCharacterAction } = await import('./js/combat.js');
      (await import('./js/debug.js')).debugStartBossFight();
      const c = gameState.roster.find(c => c.id === 'wuming');
      c.curHp = 1;
      c.actionCountdown = 99999;
      gameState.monsters.forEach(m => { m.actionCountdown = 99999; });
      performSkill(c, CHAR_DEFS.wuming.skills[1], 1, gameState.monsters[0]);
      c.openingUntil = 10000;
      useCharacterAction('wuming');
      (await import('./js/ui-combat-effects.js')).flushCombat();
      (await import('./js/ui-main.js')).render();
      return { hp: c.curHp, statuses: [...document.querySelectorAll('#partySide .statusName')].map(el => el.textContent) };
    });
    assert.ok(state.hp > 1);
    assert.equal(await page.locator('.charActionButton > img[src="assets/skills/lixue_action.png"]:visible').count(), 1, 'combat action uses the new Lixue resolve artwork');
    for (const label of ['靈巧閃避', '破綻就緒', '撐住']) assert.ok(state.statuses.includes(label));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assertNoRuntimeErrors(page, 'Wuming skill UI');
    await page.close();
  }
}

async function testDialogueSizing(browser) {
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
    const page = await openView(browser, 'village');
    await page.setViewportSize({ width, height });
    for (const speaker of ['xiaochu', 'wuming', 'goddess']) {
      await page.evaluate(async speaker => {
        const story = await import('./js/story.js');
        if (speaker === 'wuming') {
          (await import('./js/state.js')).gameState.equippedSkinByCharacter.wuming = 'lixue_nohat';
        }
        if (story.storyState.dialogueScript) story.closeDialogue();
        story.queueDialogue('xiaochu_home');
        const line = Object.values(story.DIALOGUE_DEFS).flat().filter(line => line.speaker === speaker)
          .sort((a, b) => b.text.length - a.text.length)[0];
        story.storyState.dialogueScript = [line];
        story.storyState.dialogueLineIndex = 0;
        story.storyState.lastDialogueSpeaker = null;
        document.getElementById('dialogueOverlay').classList.toggle('heavenDialogue', speaker === 'goddess');
        story.renderDialogueLine();
      }, speaker);
      await page.locator('#dialoguePortraitImg').evaluate(img => img.decode());
      if (speaker === 'wuming') {
        assert.equal(await page.locator('#dialogueSpeakerName').textContent(), '璃雪');
        assert.match(await page.locator('#dialoguePortraitImg').getAttribute('src'), /lixue_full\.png$/);
      }
      await page.waitForTimeout(800);
      const layout = await page.evaluate(() => {
        const portrait = document.getElementById('dialoguePortraitFrame').getBoundingClientRect();
        const box = document.getElementById('dialogueBox').getBoundingClientRect();
        return { top: portrait.top, left: portrait.left, right: portrait.right, portraitHeight: portrait.height,
          bottom: box.bottom, overlap: portrait.bottom - box.top,
          overflow: document.documentElement.scrollWidth > innerWidth,
          fit: getComputedStyle(document.getElementById('dialoguePortraitImg')).objectFit };
      });
      assert.ok(layout.top >= 0, `${speaker} portrait remains inside ${width}x${height}`);
      assert.ok(layout.left >= 0 && layout.right <= width);
      assert.ok(layout.bottom <= height);
      assert.ok(layout.overlap <= 14, 'only the small authored frame overlap is allowed');
      assert.equal(layout.fit, 'contain', 'full artwork must not be cropped');
      // Village deliberately has a desktop minimum width. Overlay geometry
      // remains checked above, but its underlying scene has no mobile layout.
      if (width >= 960) assert.equal(layout.overflow, false);
      if (width === 390) assert.ok(layout.portraitHeight > 390, 'mobile story characters are enlarged');
      if (process.argv.includes('--entry-story-only')) {
        fs.mkdirSync(path.resolve(__dirname, '../.local/test-results'), { recursive: true });
        await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/story-larger-${speaker}-${width}.png`) });
      }
    }
    assertNoRuntimeErrors(page, 'responsive story portraits');
    await page.close();
  }
}

// Native screen-coordinate input avoids Playwright's zoomed-iframe locator offset.
async function clickScaledFrame(page, frame, selector) {
  const r = await frame.locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const box = await page.locator('#gameFrame').boundingBox();
  await page.mouse.click(box.x + r.x * box.width / 1600, box.y + r.y * box.height / 900);
}

async function testMerchantRaster(browser) {
  const page = await browser.newPage();
  try {
    await page.goto(`${prototypeUrl.replace('game.html', 'index.html')}?debug&view=shop`);
    const frame = page.frames().find(f => f.url().includes('game.html'));
    await frame.locator('#shopModal').waitFor({ state: 'visible' });
    await page.waitForTimeout(700);
    for (const [width, height] of [[1366, 768], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(150);
      assert.equal(await page.locator('#gameFrame').evaluate(e => getComputedStyle(e).transform), 'none');
      const logicalSize = await frame.evaluate(() => [innerWidth, innerHeight]);
      assert.ok(Math.abs(logicalSize[0] - 1600) <= 1 && Math.abs(logicalSize[1] - 900) <= 1);
      const box = await page.locator('#gameFrame').boundingBox();
      assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1);
      await frame.evaluate(async () => {
        const { gameState } = await import('./js/state.js');
        gameState.bankedGold = 100;
        (await import('./js/ui-commerce.js')).renderShopView();
      });
      await clickScaledFrame(page, frame, '.shopBuyRow[data-item-id="potion"] button');
      assert.equal(await frame.evaluate(async () => (await import('./js/state.js')).gameState.bankedGold), 88);
    }
    await clickScaledFrame(page, frame, '#shopLeaveBtn');
    await page.waitForFunction(() => !document.documentElement.classList.contains('portraitRasterMode'));
    assert.notEqual(await page.locator('#gameFrame').evaluate(e => getComputedStyle(e).transform), 'none');
  } finally { await page.close(); }
}

async function testPortraitRaster(browser) {
  for (const view of ['growth', 'dialogue']) {
    const page = await browser.newPage({viewport:{width:1920,height:1080}});
    try {
      await page.goto(`${prototypeUrl.replace('game.html', 'index.html')}?debug&view=${view}`);
      const frame = page.frames().find(f => f.url().includes('game.html'));
      const selector = view === 'growth' ? '#characterDetailOverlay' : '#dialogueOverlay';
      await frame.locator(selector).waitFor({state:'visible'});
      await page.waitForTimeout(700);
      assert.equal(await page.locator('#gameFrame').evaluate(e => getComputedStyle(e).transform), 'none');
      if (view === 'growth') {
        assert.equal(await frame.locator('.detailArtFrame img').evaluate(e => e.complete && e.naturalWidth > 0), true);
        await clickScaledFrame(page, frame, '#homeTab-profile');
        assert.equal(await frame.locator('#homeTab-profile').getAttribute('aria-selected'), 'true');
        await clickScaledFrame(page, frame, '#characterDetailCloseBtn');
        await page.waitForFunction(() => !document.documentElement.classList.contains('portraitRasterMode'));
      } else {
        const before = await frame.locator('#dialogueOverlay').innerText();
        await clickScaledFrame(page, frame, '#dialogueModal');
        await page.waitForTimeout(350);
        assert.notEqual(await frame.locator('#dialogueOverlay').innerText(), before);
      }
    } finally { await page.close(); }
  }
}

async function testMerchantShop(browser) {
  await testMerchantRaster(browser);
  await testPortraitRaster(browser);
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
    const page = await openView(browser, 'shop');
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      gameState.bankedGold = 100;
      gameState.runGold = 7;
      gameState.inventory = [{ itemId: 'monsterCrystal', qty: 3 }];
      (await import('./js/ui-commerce.js')).renderShopView();
    });
    await page.locator('.shopKeeperArt img').evaluate(img => img.decode());
    await page.waitForTimeout(300);
    for (const locale of ['zh-Hant', 'en']) {
      await page.evaluate(async locale => (await import('./js/i18n.js')).setLocale(locale), locale);
      const bounds = await page.evaluate(() => {
        const modal = document.getElementById('shopModal');
        const rect = modal.getBoundingClientRect();
        const art = document.querySelector('.shopKeeperArt');
        return { left: rect.left, right: rect.right, viewport: document.documentElement.clientWidth,
          overflow: modal.scrollWidth > modal.clientWidth,
          artHeight: art.getBoundingClientRect().height,
          fit: getComputedStyle(art.querySelector('img')).objectFit };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= bounds.viewport + 1, `${width} shop fits viewport: ${JSON.stringify(bounds)}`);
      assert.equal(bounds.overflow, false);
      assert.ok(bounds.artHeight >= 340, 'merchant must not collapse to a tiny thumbnail');
      assert.equal(bounds.fit, 'contain');
    }
    await page.evaluate(async () => (await import('./js/i18n.js')).setLocale('zh-Hant'));
    const greeting = await page.locator('#shopDialogueText').textContent();
    await page.locator('.shopKeeperArt').click();
    assert.notEqual(await page.locator('#shopDialogueText').textContent(), greeting);
    if (process.argv.includes('--shop-only')) {
      fs.mkdirSync(path.resolve(__dirname, '../.local/test-results'), { recursive: true });
      await page.locator('#shopModal').evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/merchant-shop-${width}.png`) });
    }
    await page.locator('.shopBuyRow[data-item-id="potion"] button').click();
    const balances = () => page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      const { inventoryItemCount } = await import('./js/ui-loadout.js');
      return { bank: gameState.bankedGold, run: gameState.runGold, potions: inventoryItemCount('potion'), crystals: inventoryItemCount('monsterCrystal') };
    });
    assert.deepEqual(await balances(), { bank: 88, run: 7, potions: 1, crystals: 3 });
    await page.locator('.shopReceipt').waitFor({ state: 'visible' });
    assert.match(await page.locator('.shopReceipt').textContent(), /\+1/, 'successful purchase has a visible receipt');
    await page.locator('#shopBuyTab').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#shopSellTab').getAttribute('aria-selected'), 'true');
    await page.click('#shopSellOneBtn');
    await page.click('#shopSellAllBtn');
    assert.deepEqual(await balances(), { bank: 103, run: 7, potions: 1, crystals: 0 });
    assert.match(await page.locator('.shopReceipt').textContent(), /\+10/, 'selling the final two crystals reports the actual gold received');
    assert.equal(await page.locator('#shopSellAllBtn').isDisabled(), true);
    await page.click('#shopLeaveBtn');
    assert.equal(await page.locator('#shopOverlay').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('.shopReceipt').isVisible(), false, 'closing the shop clears transaction feedback');
    await page.evaluate(async () => {
      const { gameState, setPhase, PHASES } = await import('./js/state.js');
      setPhase(PHASES.PREP_BOSS, { force: true });
      (await import('./js/combat.js')).enterPrepBoss();
      (await import('./js/ui-main.js')).render();
      gameState.shopCountdown = 3000;
    });
    assert.equal(await page.locator('#shopCountdown').isVisible(), true, 'dungeon countdown remains visible on mobile');
    assert.equal(await page.locator('.shopBuyRow[data-item-id="potion"] button').isDisabled(), true, 'dungeon purchases use run gold, not bank gold');
    await page.locator('#shopDialogue').focus();
    await page.keyboard.press('Enter');
    assert.ok(await page.evaluate(() => window.__debugHooks.gameState.shopCountdown > 8000), 'chatting resets dungeon idle timeout');
    await page.click('#shopAutoLeaveBtn');
    assert.equal(await page.evaluate(() => window.__debugHooks.gameState.shopAutoLeave), false);
    await page.click('#shopLeaveBtn');
    assertNoRuntimeErrors(page, 'merchant shop');
    await page.close();
  }
}

async function testDesktopHome(browser) {
  for (const width of [1024, 1440, 1920]) {
    const page = await openView(browser, 'home');
    await page.setViewportSize({ width, height: 1080 });
    await page.evaluate(async () => {
      document.querySelector('[data-debug-action="xiaochu-ready"]').click();
      const { gameState, RESONANCE_STATES } = await import('./js/state.js');
      gameState.resonanceState.xiaochu = RESONANCE_STATES.OATH_READY;
      (await import('./js/ui-main.js')).render();
    });
    await page.waitForTimeout(650);
    assert.equal(await page.locator('#homeView .homeTopbar .prepHeading').count(), 0, 'room title is removed, not merely hidden at desktop widths');
    const hintStyles = await page.evaluate(() => ['#homeGrowthBtn b', '#homeBackBtn > span'].map(selector => {
      const style = getComputedStyle(document.querySelector(selector));
      return ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'border', 'borderRadius', 'padding', 'letterSpacing', 'textShadow'].map(key => style[key]);
    }));
    assert.deepEqual(hintStyles[0], hintStyles[1], 'home cultivation and exit share the same visual language');
    assert.equal(hintStyles[0][1], '23px', 'retain the original cultivation lettering');
    assert.equal(hintStyles[0][5], 'rgba(0, 0, 0, 0)', 'scene labels have no capsule background');
    for (const id of ['homeGrowthBtn', 'travelJournalBtn', 'contractFacilityBtn']) {
      const target = page.locator(`#${id}`);
      assert.equal(await target.isVisible(), true);
      const layout = await target.evaluate(el => {
        const scene = document.querySelector('#homeView').getBoundingClientRect();
        const label = el.querySelector('b').getBoundingClientRect();
        return { inside: label.left >= scene.left && label.right <= scene.right && label.bottom < scene.bottom,
          hit: el.contains(document.elementFromPoint(label.x+label.width/2,label.y+label.height/2)),
          blur: getComputedStyle(el).backdropFilter };
      });
      assert.ok(layout.inside && layout.hit, `${id}: label is inside the scene and clickable`);
      assert.equal(layout.blur, 'none');
    }
    if (process.argv.includes('--home-only')) {
      fs.mkdirSync(path.resolve(__dirname, '../.local/test-results'), { recursive: true });
      await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/home-scene-oath-${width}.png`) });
    }
    await page.click('#homeGrowthBtn b');
    assert.equal(await page.locator('#homeGrowthView').count(), 0, 'no intermediate roster page');
    assert.equal(await page.locator('#app').evaluate(el => el.classList.contains('homeSceneActive')), true);
    assert.equal(await page.locator('#characterDetailName').textContent(), '璃雪');
    assert.equal(await page.locator('[data-home-character="xiaochu"]').count(), 0, 'locked characters are absent from cultivation');
    assert.equal(await page.locator('.homeCharacterChoices').count(), 0, 'one unlocked character needs no redundant switcher');
    const workspace = await page.evaluate(() => {
      const choices = document.querySelector('.homeGrowthChoices').getBoundingClientRect();
      const inspector = document.querySelector('.growthInspector').getBoundingClientRect();
      const art = document.querySelector('.growthSkills .growthCard img').getBoundingClientRect();
      return { gap: inspector.top - choices.bottom, inspectorHeight: inspector.height, artWidth: art.width };
    });
    assert.ok(workspace.gap <= 16 && workspace.inspectorHeight <= 220, 'stat upgrade panel is compact and follows choices');
    assert.ok(workspace.artWidth >= 48, 'skill artwork is large enough to read');
    assert.equal(await page.locator('#characterDetailOverlay').evaluate(el => el.classList.contains('homeCharacterDetail')), true);
    await page.locator('.detailArtFrame img').evaluate(img => img.decode());
    await page.waitForTimeout(250);
    const detailLayout = await page.locator('#characterDetailModal').evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { fits: rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        overflow: el.scrollWidth > el.clientWidth,
        contained: getComputedStyle(el.querySelector('.detailArtFrame img')).objectFit === 'contain' };
    });
    assert.ok(detailLayout.fits && !detailLayout.overflow && detailLayout.contained, 'home detail fits desktop and preserves full art');
    if (process.argv.includes('--home-only')) await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/home-growth-detail-${width}.png`) });
    await page.locator('.growthCard[data-line="action"]').click();
    assert.ok(await page.locator('.growthInspectorHead h3').textContent());
    for (const height of [720, 900]) {
      await page.setViewportSize({ width, height });
      const pinned = await page.locator('#characterDetailModal').evaluate(modal => {
        const button = modal.querySelector('#growthUpgradeBtn').getBoundingClientRect();
        const compare = modal.querySelector('.growthCompare').getBoundingClientRect();
        return { fits: button.bottom < innerHeight && compare.top > 0 && compare.bottom < innerHeight,
          hit: modal.querySelector('#growthUpgradeBtn').contains(document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2)),
          pageScroll: modal.scrollHeight > modal.clientHeight };
      });
      assert.ok(pinned.fits && pinned.hit && !pinned.pageScroll, 'comparison and upgrade stay on-screen without modal scrolling');
      assert.ok(await page.locator('.homeGrowthExplanation').evaluate(el => el.clientHeight >= 24), 'long descriptions retain a readable scroll area');
      await page.locator('.homeGrowthExplanation').evaluate(el => { el.scrollTop = el.scrollHeight; });
      assert.equal(await page.locator('#growthUpgradeBtn').isVisible(), true);
      if (process.argv.includes('--home-only')) await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/home-growth-pinned-${width}-${height}.png`) });
    }
    assert.equal(await page.locator('#homeTab-growth').getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('.detailPortraitColumn #characterDetailName').textContent(), '璃雪');
    assert.equal(await page.locator('.growthWallet').count(), 0, 'no separate book wallet in home');
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      gameState.inventory = [{ itemId: 'statBook', qty: 3 }, { itemId: 'skillBook', qty: 5 }];
    });
    await page.locator('.growthCard[data-line="atk"]').click();
    assert.match(await page.locator('.growthCost').textContent(), /能力書/);
    assert.equal(await page.locator('#growthBookOwned').textContent(), '3');
    await page.locator('#growthUpgradeBtn').click();
    assert.equal(await page.locator('#growthBookOwned').textContent(), '2');
    await page.locator('.growthCard[data-line="action"]').click();
    assert.match(await page.locator('.growthCost').textContent(), /技能書/);
    assert.equal(await page.locator('#growthBookOwned').textContent(), '5');
    await page.locator('#growthUpgradeBtn').click();
    assert.equal(await page.locator('#growthBookOwned').textContent(), '4');
    const upgradeBeforeAppearance = await page.locator('#growthUpgradeBtn').boundingBox();
    const artBeforeTab = await page.locator('.detailArtFrame').boundingBox();
    await page.locator('#homeTab-profile').click();
    assert.equal(await page.locator('.growthWallet').isVisible(), false, 'book resources belong only to cultivation');
    assert.equal(await page.locator('#homeProfilePanel h3').textContent(), '角色介紹');
    assert.equal(await page.locator('#homeProfilePanel .detailSectionHeading small').count(), 0, 'appearance collection count is omitted');
    assert.equal(await page.locator('.skinPicker').isVisible(), true);
    assert.equal(await page.locator('.detailCharacterDescription').isVisible(), true);
    assert.equal(await page.locator('#growthUpgradeBtn').isVisible(), false);
    assert.deepEqual(await page.locator('.detailArtFrame').boundingBox(), artBeforeTab, 'portrait stays on stage across tabs');
    assert.equal(await page.locator('.skinOption').count(), 1, 'only hooded Lixue is available; picker is retained');
    assert.equal(await page.locator('[data-skin-id="lixue_nohat"]').count(), 0);
    await page.locator('.detailArtFrame img').evaluate(el => el.decode());
    assert.match(await page.locator('.detailArtFrame img').getAttribute('src'), /lixue_full\.png$/);
    assert.equal(await page.locator('[data-skin-id="wuming_default"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('[data-skin-id="wuming_default"]').textContent(), /初始外觀/);
    if (process.argv.includes('--home-only')) await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/home-appearance-${width}.png`) });
    await page.locator('.skinOption').first().click();
    assert.equal(await page.locator('#homeTab-profile').getAttribute('aria-selected'), 'true', 'equipping preserves active tab');
    await page.locator('#homeTab-profile').focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#homeTab-growth').getAttribute('aria-selected'), 'true');
    assert.deepEqual(await page.locator('#growthUpgradeBtn').boundingBox(), upgradeBeforeAppearance, 'returning restores the pinned workspace');
    assert.equal(await page.locator('.detailArtFrame').isVisible(), true);
    await page.setViewportSize({ width, height: 1080 });
    const cultivationSize = await page.locator('#characterDetailModal').evaluate(el => [getComputedStyle(el).width, getComputedStyle(el).height]);
    await page.click('#characterDetailCloseBtn');
    assert.deepEqual(await page.locator('#characterDetailModal').evaluate(el => [getComputedStyle(el).width, getComputedStyle(el).height]), cultivationSize, 'closing retains the home layout throughout fade-out');
    assert.equal(await page.locator('#homeGrowthBtn').evaluate(el => el === document.activeElement), true, 'closing returns keyboard focus to room entry');
    const door = await page.locator('#homeBackBtn').evaluate(el => {
      const r = el.getBoundingClientRect();
      const scene = document.querySelector('#homeView').getBoundingClientRect();
      // The adopted simple medieval room places its door at 55%–74%.
      return { onDoor: r.left >= scene.left + scene.width * .54 && r.right <= scene.left + scene.width * .75,
        hit: el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) };
    });
    assert.ok(door.onDoor && door.hit, 'exit is a clickable door hotspot');
    assert.equal(await page.locator('#homeBackBtn').textContent(), '出門');
    assert.equal(await page.locator('#homeGrowthBtn > img').count(), 0, 'no resident guide portrait');
    await page.locator('#homeGrowthBtn').hover();
    assert.equal(await page.evaluate(() => {
      const scene = document.querySelector('#homeView').getBoundingClientRect();
      const hint = document.querySelector('#homeGrowthBtn small').getBoundingClientRect();
      return hint.left >= scene.left && hint.right <= scene.right && hint.top >= scene.top && hint.bottom <= scene.bottom;
    }), true, 'cultivation hint stays inside the home scene');
    await page.evaluate(async () => {
      const { gameState, RESONANCE_STATES } = await import('./js/state.js');
      gameState.resonanceState.xiaochu = RESONANCE_STATES.CONTRACTED;
      (await import('./js/ui-main.js')).render();
    });
    assert.equal(await page.locator('#xiaochuTalkBtn').isVisible(), false, 'no daily conversation hotspot after contract');
    assert.equal(await page.locator('#xiaochuTalkBtn > img').isVisible(), false, 'contracted Xiaochu is not physically standing in the room');
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      gameState.unlockedChars.add('xiaochu');
    });
    await page.click('#homeGrowthBtn');
    assert.equal(await page.locator('[data-home-character="xiaochu"]').count(), 1, 'contracted character appears in cultivation');
    assert.match(await page.locator('[data-home-character="xiaochu"]').textContent(), /NEW/, 'newly unlocked character keeps the NEW marker');
    await page.click('[data-home-character="xiaochu"]');
    assert.equal(await page.locator('#characterDetailName').textContent(), '小初');
    assert.equal(await page.locator('[data-home-character="xiaochu"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.__debugHooks.gameState.seenCharacterIds.has('xiaochu')), true);
    await page.click('[data-home-character="wuming"]');
    assert.equal(await page.locator('#characterDetailName').textContent(), '璃雪');
    await page.keyboard.press('Escape');
    await page.locator('#characterDetailOverlay').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#characterDetailOverlay').isVisible(), false);
    await page.waitForTimeout(650);
    if (process.argv.includes('--home-only')) await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/home-scene-contracted-${width}.png`) });
    assert.equal(await page.locator('#xiaochuTalkBtn').isVisible(), false);
    await page.evaluate(async () => {
      const { gameState, RESONANCE_STATES } = await import('./js/state.js');
      gameState.resonanceState.xiaochu = RESONANCE_STATES.FOLLOWING;
      (await import('./js/ui-main.js')).render();
    });
    await page.locator('#xiaochuTalkBtn > img').evaluate(img => img.decode());
    assert.equal(await page.locator('#xiaochuTalkBtn > img').isVisible(), true, 'following Xiaochu remains visible');
    assert.equal(await page.locator('#xiaochuTalkBtn').isVisible(), true);
    await page.waitForTimeout(650);
    if (process.argv.includes('--home-only')) await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/home-scene-following-${width}.png`) });
    await page.locator('#xiaochuTalkBtn').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.__debugHooks.gameState.activeOverlay), 'dialogue');
    assertNoRuntimeErrors(page, 'desktop home scene');
    await page.close();
  }
}

async function testDesktopVillage(browser) {
  for (const width of [1024, 1440, 1920]) {
    const page = await openView(browser, 'village');
    await page.setViewportSize({ width, height: 1080 });
    const geometry = await page.evaluate(async () => {
      const scene = document.querySelector('#villageView');
      const rect = scene.getBoundingClientRect();
      const art = new Image();
      art.src = 'assets/backgrounds/village-square.png';
      await art.decode();
      const ids = ['homeLocationBtn', 'townShopBtn', 'expeditionLocationBtn'];
      return {
        ratio: rect.width / rect.height, artRatio: art.naturalWidth / art.naturalHeight,
        overflow: document.documentElement.scrollWidth > innerWidth,
        targets: ids.map(id => {
          const el = document.getElementById(id);
          const r = el.getBoundingClientRect();
          const label = el.querySelector('b').getBoundingClientRect();
          return { inside: r.left >= rect.left && r.right <= rect.right && r.top >= rect.top && r.bottom <= rect.bottom,
            labelHit: el.contains(document.elementFromPoint(label.x + label.width/2, label.y + label.height/2)) };
        }),
      };
    });
    near(geometry.ratio, geometry.artRatio, 'background keeps original proportions');
    assert.equal(geometry.overflow, false);
    assert.ok(geometry.targets.every(t => t.inside && t.labelHit), 'buildings and labels are clickable');
    assert.equal(await page.locator('#saveGameBtn').isVisible(), false);
    assert.equal(await page.locator('#loadGameBtn').isVisible(), false);
    assert.equal(await page.locator('#bagBtn').isVisible(), false, 'village keeps the inventory entry off stage');
    await page.waitForTimeout(600); // Wait for the existing surface entrance animation.
    const beforeDebug = await page.locator('#villageView').boundingBox();
    await page.click('#debugToggleBtn');
    assert.equal(await page.locator('#debugPanel').isVisible(), true);
    assert.deepEqual(await page.locator('#villageView').boundingBox(), beforeDebug, 'debug panel does not shift the village');
    await page.click('#debugToggleBtn');
    if (process.argv.includes('--village-only')) {
      fs.mkdirSync(path.resolve(__dirname, '../.local/test-results'), { recursive: true });
      await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/village-scene-${width}.png`) });
      await page.locator('#townShopBtn').hover();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/village-scene-hover-${width}.png`) });
    }
    await page.click('#townShopBtn b');
    assert.equal(await page.getAttribute('#shopOverlay', 'aria-hidden'), 'false');
    await page.click('#shopLeaveBtn');
    await page.locator('#expeditionLocationBtn').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#regionView').isVisible(), true);
    assert.equal(await page.locator('#app').evaluate(el => el.classList.contains('villageActive')), false);
    assert.equal(await page.locator('#bagBtn').isVisible(), true, 'inventory remains available outside the village scene');
    await page.locator('#bagBtn').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getAttribute('#inventoryOverlay', 'aria-hidden'), 'false');
    await page.click('#inventoryCloseBtn');
    await page.click('#regionBackBtn');
    await page.click('#homeLocationBtn b');
    assert.equal(await page.locator('#homeView').isVisible(), true);
    await page.click('#homeBackBtn');
    await page.evaluate(async () => {
      const { gameState, CHAPTER1_STATES, RESONANCE_STATES } = await import('./js/state.js');
      gameState.chapter1State = CHAPTER1_STATES.JOURNAL_PENDING;
      gameState.resonanceState.xiaochu = RESONANCE_STATES.GO_HOME;
      (await import('./js/ui-main.js')).render();
    });
    assert.equal(await page.locator('#townShopBtn').isDisabled(), true);
    assert.equal(await page.locator('#expeditionLocationBtn').isDisabled(), true);
    assert.equal(await page.locator('#homeGuideHina').isVisible(), true);
    await page.locator('#homeGuideHina img').evaluate(img => img.decode());
    assert.equal(await page.getAttribute('#homeGuideHina img', 'src'), 'assets/characters/guider.png');
    if (process.argv.includes('--village-only')) {
      await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/village-scene-guide-${width}.png`) });
    }
    assert.equal(await page.locator('#homeLocationBtn').evaluate(el => getComputedStyle(el).position), 'absolute');
    await page.click('#homeLocationBtn');
    assert.equal(await page.locator('#homeView').isVisible(), true);
    assertNoRuntimeErrors(page, 'desktop village');
    await page.close();
  }
}

async function testExpeditionDeparture(browser) {
  for (const width of [1024, 1440]) {
    const page = await openView(browser, 'regions');
    await page.setViewportSize({ width, height: width === 1024 ? 720 : 1000 });
    await page.locator('#regionView').evaluate(async el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    const entrance = await page.locator('#regionView').boundingBox();
    await page.locator('#forestRegionBtn b').click();
    await page.locator('#expeditionView').evaluate(async el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    const preparation = await page.locator('#expeditionView').boundingBox();
    for (const key of ['x', 'y', 'width']) assert.ok(Math.abs(entrance[key] - preparation[key]) < 1, `scene frame ${key} stays aligned on entering preparation`);
    assert.match(await page.locator('#expeditionView').evaluate(el => getComputedStyle(el).backgroundImage), /expedition-trail-quiet\.png/, 'preparation reuses the entrance artwork');
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      gameState.unlockedChars.add('xiaochu');
      gameState.party = ['wuming'];
      (await import('./js/ui-main.js')).render();
    });
    assert.equal(await page.locator('#app').evaluate(el => el.classList.contains('expeditionSceneActive')), true);
    const xiaochu = page.locator('.expeditionCharacter').filter({ has: page.locator('.nm', { hasText: '小初' }) });
    await xiaochu.click();
    assert.equal(await xiaochu.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#expeditionHeroPortrait').getAttribute('src'), 'assets/characters/xiaochu_full.png');
    assert.equal(await page.locator('.expeditionTechniquePreview img').count(), 4);
    assert.equal(await page.locator('.expeditionSkillGroup:not(.expeditionManualGroup) [data-preview-skill]').count(), 3);
    assert.equal(await page.locator('.expeditionManualGroup [data-preview-skill]').count(), 1);
    assert.equal(await page.locator('[data-preview-skill]').first().evaluate(el => el.getBoundingClientRect().width), 72);
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      gameState.inventory = [];
      gameState.equippedCombatItemId = null;
      gameState.roster.find(c => c.id === 'xiaochu').loadout.activeItemId = null;
      (await import('./js/ui-main.js')).render();
    });
    assert.equal(await page.locator('.expeditionLoadout > div').first().locator('small').textContent(), '藥水');
    assert.equal(await page.locator('#expeditionSelectedSummary .combatItemQuickSlot').isVisible(), true);
    assert.equal(await page.locator('#expeditionSelectedSummary .activeQuickSlot').isVisible(), true);
    await page.locator('#expeditionSelectedSummary .combatItemQuickSlot').click();
    assert.equal(await page.locator('#combatItemPickerList .pickerItem').count(), 1, 'empty inventory only offers unequip');
    assert.equal(await page.locator('#combatItemPickerList .unequip').textContent(), '◇不攜帶道具');
    await page.locator('#combatItemPickerList .unequip').click();
    await page.evaluate(async () => {
      const { gameState } = await import('./js/state.js');
      const { ITEM_DEFS } = await import('./js/constants.js');
      gameState.inventory = [{ itemId: 'potion', qty: 2 }, { itemId: Object.keys(ITEM_DEFS).find(id => ITEM_DEFS[id].equipSlot === 'charm'), qty: 1 }];
      (await import('./js/ui-main.js')).render();
    });
    await page.locator('[data-preview-skill]').first().focus();
    assert.equal(await page.locator('#tooltip').isVisible(), true);
    await page.locator('#expeditionSelectedSummary .combatItemQuickSlot').click();
    assert.equal(await page.locator('#combatItemPicker').evaluate(el => el.classList.contains('open')), true);
    assert.equal(await page.locator('#combatItemPickerList .pickerItem').count(), 2, 'only the owned potion plus unequip');
    assert.equal(await page.locator('#combatItemPickerList .pickerItem:not(.unequip) img').getAttribute('src'), 'assets/item/potion.png');
    await page.keyboard.press('Escape');
    await page.locator('#expeditionSelectedSummary .activeQuickSlot').click();
    assert.equal(await page.locator('#charmPicker').evaluate(el => el.classList.contains('open')), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => {
      const loadout = document.querySelector('.expeditionLoadoutBlock').getBoundingClientRect();
      const action = document.querySelector('#actionArea').getBoundingClientRect();
      return loadout.bottom < action.top && document.documentElement.scrollWidth <= window.innerWidth;
    }), true, 'loadout and departure do not overlap or overflow');
    await page.locator('#expeditionHeroPortrait').evaluate(img => img.decode());
    if (process.argv.includes('--expedition-only')) await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/expedition-departure-${width}.png`), fullPage: true });
    await page.evaluate(async () => {
      (await import('./js/state.js')).gameState.party = [];
      (await import('./js/ui-main.js')).render();
    });
    assert.equal(await page.locator('#startBtn').isDisabled(), true, 'empty selection cannot depart');
    await page.evaluate(async () => {
      const { gameState, PHASES } = await import('./js/state.js');
      gameState.party = ['wuming'];
      gameState.partyLocked = true;
      gameState.phase = PHASES.PREP_BOSS;
      gameState.expeditionMode = 'ruins';
      (await import('./js/ui-main.js')).render();
    });
    assert.equal(await page.locator('#prepRoster').isVisible(), false);
    assert.equal(await page.locator('#expeditionRegionLevel').textContent(), '???');
    assert.equal(await page.locator('#expeditionView').evaluate(el => el.classList.contains('ruinsPreparation')), true);
    assert.match(await page.locator('#expeditionView').evaluate(el => getComputedStyle(el).backgroundImage), /ruins-battle-quiet\.png/, 'ruins boss preparation remains inside the ruins');
    if (process.argv.includes('--expedition-only')) await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/boss-preparation-ruins-${width}.png`), fullPage: true });
    await page.evaluate(async () => {
      (await import('./js/state.js')).gameState.expeditionMode = 'normal';
      (await import('./js/ui-main.js')).render();
    });
    assert.match(await page.locator('#expeditionView').evaluate(el => getComputedStyle(el).backgroundImage), /slime-habitat-battle-quiet\.png/, 'forest boss preparation must not return to village staging');
    if (process.argv.includes('--expedition-only')) await page.screenshot({ path: path.resolve(__dirname, `../.local/test-results/boss-preparation-forest-${width}.png`), fullPage: true });
    await page.evaluate(async () => {
      (await import('./js/state.js')).gameState.phase = 'prepFloor';
      (await import('./js/ui-main.js')).render();
    });
    assert.match(await page.locator('#expeditionView').evaluate(el => getComputedStyle(el).backgroundImage), /expedition-trail-quiet\.png/, 'ordinary departure reuses the entrance artwork');
    assert.equal(await page.locator('#startBtn').isEnabled(), true);
    assertNoRuntimeErrors(page, 'expedition departure redesign');
    await page.close();
  }
}

(async () => {
  const server = await startServer();
  const { port } = server.address();
  prototypeUrl = `http://127.0.0.1:${port}/game.html`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    if (process.argv.includes('--event-art-only')) {
      await testEventArtwork(browser);
      await testEventInteractions(browser);
      console.log('ui-regression.test.js: event artwork and interaction assertions passed');
      return;
    }
    if (process.argv.includes('--resize-only')) {
      await testViewportFit(browser);
      console.log('ui-regression.test.js: viewport fit assertions passed');
      return;
    }
    if (process.argv.includes('--combat-ui-only')) {
      await testCombatScene(browser);
      console.log('ui-regression.test.js: combat scene assertions passed');
      return;
    }
    if (process.argv.includes('--expedition-only')) {
      await testExpeditionDeparture(browser);
      console.log('ui-regression.test.js: expedition departure assertions passed');
      return;
    }
    await testDesktopHome(browser);
    if (process.argv.includes('--home-only')) {
      console.log('ui-regression.test.js: desktop home assertions passed');
      return;
    }
    await testDesktopVillage(browser);
    if (process.argv.includes('--village-only')) {
      console.log('ui-regression.test.js: desktop village assertions passed');
      return;
    }
    await testMerchantShop(browser);
    if (process.argv.includes('--shop-only')) {
      console.log('ui-regression.test.js: merchant shop assertions passed');
      return;
    }
    await testDialogueSizing(browser);
    if (process.argv.includes('--entry-story-only')) {
      await testBossTransition(browser);
      console.log('ui-regression.test.js: entry and story sizing assertions passed');
      return;
    }
    await testWumingSkills(browser);
    if (process.argv.includes('--wuming-only')) {
      console.log('ui-regression.test.js: Wuming skill UI assertions passed');
      return;
    }
    await testXiaochuDaily(browser);
    if (process.argv.includes('--daily-only')) {
      console.log('ui-regression.test.js: Xiaochu daily assertions passed');
      return;
    }
    if (process.argv.includes('--xiaochu-only')) {
      await testXiaochuEncounterFlow(browser);
      console.log('ui-regression.test.js: Xiaochu encounter-to-covenant assertions passed');
      return;
    }
    await testCombatAndGrowthAudit(browser);
    await testCombatScene(browser);
    await testSoftBattleArt(browser);
    if (process.argv.includes('--battle-art-only')) {
      console.log('ui-regression.test.js: soft battle art assertions passed');
      return;
    }
    await testMajorViewsRender(browser);
    await testViewportFit(browser);
    await testExpeditionDeparture(browser);
    await testJournalNavigation(browser);
    await testJournalLayout(browser);
    await testDungeonEntry(browser);
    await testBossTransition(browser);
    await testSameSpeakerDialogue(browser);
    await testOverlayExclusivity(browser);
    await testChapter1RuinsFlow(browser);
    await testXiaochuEncounterFlow(browser);
    await testEventArtwork(browser);
    await testEventInteractions(browser);
    console.log('ui-regression.test.js: all browser assertions passed');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
