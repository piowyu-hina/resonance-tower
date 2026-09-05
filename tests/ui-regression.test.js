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
for (const getPath of [characterPortraitPath, characterBattlePortraitPath, characterFullArtPath]) {
  assert.equal(getPath('xiaochu'), 'assets/characters/xiaochu_battle_chibi.png');
  assert.ok(fs.existsSync(path.join(prototypeDir, getPath('xiaochu'))));
}
const lineCount = scriptId => DIALOGUE_DEFS[scriptId].length;
const approvedEncounter = fs.readFileSync(path.resolve(__dirname, '../story/xiaochu-first-encounter.md'), 'utf8')
  .split('## 劇情正文')[1].trim().split(/\r?\n/).filter(line => line.trim())
  .map(line => line.startsWith('（') ? line.slice(1, -1) : line.replace(/^\*\*.+?：\*\*\s*/, ''));
assert.deepEqual(DIALOGUE_DEFS.xiaochu_encounter.map(line => line.text), approvedEncounter);
assert.deepEqual(Object.keys(DIALOGUE_DEFS).filter(id => id.startsWith('xiaochu_')).sort(),
  ['xiaochu_encounter', 'xiaochu_home', 'xiaochu_trust', 'xiaochu_choice', 'xiaochu_oath', 'xiaochu_after',
    'xiaochu_daily_practice', 'xiaochu_daily_chair', 'xiaochu_daily_departure'].sort());

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
  await page.evaluate(async () => {
    const story = await import('./js/story.js');
    story.storyState.dialogueLineIndex = story.DIALOGUE_DEFS.xiaochu_encounter.findIndex(line => line.speaker === 'xiaochu' && line.text === '無名……');
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
  assert.equal(await page.evaluate(() => window.__debugHooks.gameState.xiaochuStoryChapter), 1);
  assert.equal(await page.locator('#xiaochuTalkBtn').isDisabled(), true);
  assert.equal(await page.locator('#travelJournalBtn').isVisible(), true);
  await page.click('#homeBackBtn');
  await page.click('#expeditionLocationBtn');
  await page.click('#forestRegionBtn');
  await page.click('#startBtn');
  await page.waitForFunction(() => window.__debugHooks.gameState.phase === 'combat');
  await page.evaluate(() => {
    const state = window.__debugHooks.gameState;
    state.monsters.forEach(monster => { monster.hp = 1; monster.actionCountdown = 999999; });
    state.roster.find(character => character.id === 'wuming').actionCountdown = 0;
  });
  await waitForOverlay('dialogue');
  assert.equal(await page.evaluate(() => window.__debugHooks.storyState.dialogueScriptId), 'xiaochu_trust');
  assert.equal(await isUnlocked(), false);
  await advanceDialogue(lineCount('xiaochu_trust'));
  assert.equal(await page.evaluate(() => window.__debugHooks.gameState.xiaochuStoryChapter), 2);
  await click('retreatBtn');
  await page.click('#homeLocationBtn');
  await page.click('#xiaochuTalkBtn');
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
  assert.equal(await page.locator('#xiaochuTalkBtn').isVisible(), true, 'contracted Xiaochu retains optional daily conversations');
  assert.equal(await page.locator('#homeBackBtn').isEnabled(), true);
  assert.equal(await page.evaluate(async () => (await import('./js/story.js')).tryXiaochuTravelStory(() => {})), false, 'completed chapter does not repeat');
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
  assert.equal(await page.getAttribute('#eventSceneImage', 'src'), 'assets/events/ruins_entrance.png');
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
  await page.waitForFunction(() => getComputedStyle(document.getElementById('combatView')).backgroundImage.includes('ruins_battle.png'), null, { timeout: 2000 });
  assert.deepEqual(await page.evaluate(() => ({
    chapter: window.__debugHooks.gameState.chapter1State,
    count: window.__debugHooks.gameState.ruinsKillCount,
    ruinMobs: window.__debugHooks.gameState.monsters.every(monster => monster.defId.startsWith('ruins')),
    ruinsBackground: getComputedStyle(document.getElementById('combatView')).backgroundImage.includes('ruins_battle.png'),
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
    regionImage: 'assets/events/ruins_entrance.png',
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
    backdrop: getComputedStyle(document.getElementById('dialogueOverlay')).backgroundImage.includes('heaven_sanctuary.png'),
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
  assert.equal(DIALOGUE_DEFS.chapter1_goddess.some(line => line.text === '歡迎回到人間，無名。'), false);
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

async function testCombatAndGrowthAudit(browser) {
  for (const width of [1440, 390]) {
    const page = await openView(browser, 'village');
    await page.setViewportSize({ width, height: 1000 });
    const bars = await page.evaluate(async () => {
      const { gameState, characterActionInterval } = await import('./js/state.js');
      const combat = await import('./js/combat.js');
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
      (await import('./js/ui-main.js')).render();
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
      (await import('./js/ui-main.js')).render();
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
    assert.equal(await art.getAttribute('src'), 'assets/characters/xiaochu_battle_chibi.png');
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
    assert.equal(metrics.fit, 'cover', 'enlarge art proportionally to fill the inner frame');
    assert.equal(metrics.inside, true, 'art viewport must stay inside the inner portrait frame');
    assert.equal(metrics.mask, 'none', 'no bottom fade');
    assert.equal(metrics.radius, '6px');
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
  assert.equal(await page.locator('#xiaochuTalkBtn img').getAttribute('src'), 'assets/characters/xiaochu_battle_chibi.png');
  const button = page.locator('#xiaochuTalkBtn');
  assert.equal(await button.isVisible(), true);
  assert.equal(await button.isEnabled(), true);
  assert.equal(await button.evaluate(el => el.classList.contains('storyRequired')), false);
  if (process.argv.includes('--daily-only')) {
    fs.mkdirSync(path.resolve(__dirname, '../test-results'), { recursive: true });
    await page.screenshot({ path: path.resolve(__dirname, '../test-results/xiaochu-daily-home.png') });
  }
  for (const [index, id] of ['xiaochu_daily_practice', 'xiaochu_daily_chair', 'xiaochu_daily_departure'].entries()) {
    await button.click();
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
  assert.equal(await button.isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  if (process.argv.includes('--daily-only')) {
    await page.screenshot({ path: path.resolve(__dirname, '../test-results/xiaochu-daily-mobile.png') });
  }
  const blocked = await page.evaluate(async () => {
    const { gameState, setResonanceState, RESONANCE_STATES } = await import('./js/state.js');
    const { talkToXiaochu } = await import('./js/story.js');
    setResonanceState('xiaochu', RESONANCE_STATES.FOLLOWING, { force: true });
    gameState.xiaochuStoryChapter = 1;
    talkToXiaochu();
    return gameState.activeOverlay;
  });
  assert.equal(blocked, null, 'daily chats must not bypass the existing following story');
  assertNoRuntimeErrors(page, 'Xiaochu daily conversations');
  await page.close();
}

(async () => {
  const server = await startServer();
  const { port } = server.address();
  prototypeUrl = `http://127.0.0.1:${port}/index.html`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
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
    await testSoftBattleArt(browser);
    if (process.argv.includes('--battle-art-only')) {
      console.log('ui-regression.test.js: soft battle art assertions passed');
      return;
    }
    await testMajorViewsRender(browser);
    await testJournalNavigation(browser);
    await testJournalLayout(browser);
    await testDungeonEntry(browser);
    await testBossTransition(browser);
    await testSameSpeakerDialogue(browser);
    await testOverlayExclusivity(browser);
    await testChapter1RuinsFlow(browser);
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
