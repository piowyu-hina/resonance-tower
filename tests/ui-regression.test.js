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
const lineCount = scriptId => DIALOGUE_DEFS[scriptId].length;

// Same idea as lineCount above: count index.html's own <link rel="stylesheet">
// tags instead of hardcoding how many exist, so adding a new split stylesheet
// doesn't silently leave this assertion checking a stale number.
const expectedStylesheetCount = (fs.readFileSync(path.join(prototypeDir, 'index.html'), 'utf8').match(/<link[^>]*rel="stylesheet"/g) || []).length;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2',
};

// Real ES modules (see index.html's <script type="module">) can't load over
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

async function testMajorViewsRender(browser) {
  const views = [
    ['home', '#homeView'],
    ['growth', '#homeGrowthView'],
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

// The only test that drives gameState.resonanceState.xiaochu's full 9-value
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

  // Stage 1: jungle encounter (killCount trigger -> 'encountering' -> 'following').
  await page.evaluate(() => document.querySelector('[data-debug-action="xiaochu-story"]').click());
  await waitForOverlay('dialogue');
  assert.equal(await xiaochuState(), 'encountering');
  await advanceDialogue(lineCount('xiaochu_encounter'));
  assert.equal(await xiaochuState(), 'following');

  // Stage 2: retreat -> village-return dialogue -> 'goHome'.
  await click('retreatBtn');
  await waitForOverlay('dialogue');
  assert.equal(await xiaochuState(), 'villageReturn');
  await advanceDialogue(lineCount('xiaochu_village'));
  assert.equal(await xiaochuState(), 'goHome');

  // Stage 3: clicking home while 'goHome' plays the book-searching beat -> 'bookPending'.
  await click('homeLocationBtn');
  await waitForOverlay('dialogue');
  await advanceDialogue(lineCount('xiaochu_home_search'));
  assert.equal(await xiaochuState(), 'bookPending');

  // Stage 4: read the journal cover to cover -> 'bookReading' -> 'oathReady'.
  // Each page turn disables #journalNextBtn for the ~1.1s leaf-turn animation
  // (see story.js's advanceTravelJournal) before re-enabling it, so clicks
  // must wait for that instead of firing back to back.
  await click('travelJournalBtn');
  assert.equal(await xiaochuState(), 'bookReading');
  for (let i = 0; i < JOURNAL_PAGES.length; i++) {
    await page.waitForFunction(() => !document.getElementById('journalNextBtn').disabled, null, { timeout: 3000 });
    await click('journalNextBtn'); // last iteration lands on the final page and closes (finished)
  }
  await waitForOverlay('dialogue');
  await advanceDialogue(lineCount('xiaochu_after_book'));
  assert.equal(await xiaochuState(), 'oathReady');

  // Stage 5: covenant ritual -> oath -> first possession -> 'contracted'.
  await click('contractFacilityBtn');
  await waitForOverlay('dialogue');
  await advanceDialogue(lineCount('xiaochu_contract_prepare'));
  await waitForOverlay('contract');
  await click('xiaochuSoulBtn');
  await click('contractConfirmBtn');
  await waitForOverlay('dialogue');
  assert.equal(await xiaochuState(), 'contracting');
  await advanceDialogue(lineCount('xiaochu_oath')); // last line hands off to the contractFormed outro
  await click('contractFormed'); // finishes the outro, chaining into xiaochu_first_possession
  await advanceDialogue(lineCount('xiaochu_first_possession')); // includes both xiaochu_kiss lines

  assert.equal(await xiaochuState(), 'contracted');
  assert.equal(await isUnlocked(), true);
  assertNoRuntimeErrors(page, 'xiaochu encounter flow');
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

async function waitForEventToFinish(page, label) {
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
  for (const index of [0, 0, 4, 4, 8, 8]) {
    await page.click(`[data-event-action="mushroom"][data-index="${index}"]`);
  }
  await waitForEventToFinish(page, 'mushroom puzzle');

  page = await openEvent(browser, 'sealed-supply-crate');
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

(async () => {
  const server = await startServer();
  const { port } = server.address();
  prototypeUrl = `http://127.0.0.1:${port}/index.html`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    await testMajorViewsRender(browser);
    await testDungeonEntry(browser);
    await testBossTransition(browser);
    await testSameSpeakerDialogue(browser);
    await testOverlayExclusivity(browser);
    await testXiaochuEncounterFlow(browser);
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
