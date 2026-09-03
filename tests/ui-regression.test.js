const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright-core');

const prototypeUrl = pathToFileURL(path.resolve(__dirname, '..', 'prototype', 'index.html')).href;

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
    assert.equal(result.loadedStyles, 4, `${view} must load every split stylesheet`);
    assertNoRuntimeErrors(page, view);
    await page.close();
  }
}

async function testDungeonEntry(browser) {
  const page = await openView(browser, 'dungeon-entry');
  await page.waitForTimeout(900);
  const covered = await page.evaluate(() => ({
    phase,
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
      phase,
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
    prepLocation = 'expedition';
    phase = 'prepBoss';
    partyLocked = true;
    mobsCleared = MOBS_PER_FLOOR;
    monsters = [makeMob(), makeMob()];
    monsters.forEach(monster => {
      monster.alive = false;
      monster.hp = 0;
    });
    buildBattleRoster();
    buildMonsterCards();
    Object.values(monsterEls).forEach(refs => refs.card.classList.add('down', 'dying'));
    render();
    startBtnEl.click();
  });

  const intro = await page.evaluate(() => ({
    phase,
    bossCards: document.querySelectorAll('#monsterSide .monsterCard.boss').length,
    dyingCards: document.querySelectorAll('#monsterSide .monsterCard.dying').length,
    allCards: document.querySelectorAll('#monsterSide .monsterCard').length,
  }));
  assert.deepEqual(intro, { phase: 'bossIntro', bossCards: 1, dyingCards: 0, allCards: 1 });

  await page.waitForFunction(() => phase === 'combat', null, { timeout: 6500 });
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
    resonanceState.xiaochu = 'oathReady';
    openContractPanel();
  });
  const state = await page.evaluate(() => ({
    activeOverlay,
    journalOpen: document.getElementById('journalOverlay').classList.contains('open'),
    contractOpen: document.getElementById('contractOverlay').classList.contains('open'),
  }));
  assert.deepEqual(state, { activeOverlay: 'contract', journalOpen: false, contractOpen: true });
  assertNoRuntimeErrors(page, 'overlay exclusivity');
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    await testMajorViewsRender(browser);
    await testDungeonEntry(browser);
    await testBossTransition(browser);
    await testSameSpeakerDialogue(browser);
    await testOverlayExclusivity(browser);
    console.log('ui-regression.test.js: all browser assertions passed');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
