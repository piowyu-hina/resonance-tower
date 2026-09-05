// Visual review helper: screenshots and visible small-text inventory.
// Run: node tests/ui-review.mjs [before|after]
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
const root = path.resolve('prototype');
const output = path.resolve('test-results/ui-review', process.argv[2] || 'after');
await fs.mkdir(output, { recursive: true });
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const bytes = await fs.readFile(file);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = [];
try {
  for (const width of (process.argv.includes('--sheets-only') ? [] : [1440, 390])) {
    for (const view of (process.argv.includes('--slime-only') ? ['slime-enter', 'slime-crouch', 'slime-wuming'] : process.argv.includes('--journal-only') ? ['journal', 'journal-contents', 'journal-reread'] : ['village', 'home', 'growth', 'detail', 'regions', 'expedition', 'shop', 'inventory', 'defeat', 'journal', 'contract', 'dialogue', 'combat', 'boss-prep', 'event'])) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/?debug&view=${view === 'detail' ? 'growth' : view}`, { waitUntil: 'load' });
      if (view === 'detail') await page.locator('.homeGrowthCard').first().click();
      if (view.startsWith('slime-')) {
        await page.evaluate(async () => {
          const story = await import('./js/story.js');
          story.queueDialogue('xiaochu_encounter');
          story.storyState.dialogueLineIndex = 1;
          story.renderDialogueLine();
        });
        await page.waitForTimeout(950);
        await page.evaluate(async view => {
          const story = await import('./js/story.js');
          story.storyState.dialogueLineIndex = view === 'slime-crouch' ? 6 : view === 'slime-wuming' ? 4 : 1;
          story.renderDialogueLine();
        }, view);
      }
      if (view === 'journal-contents') await page.evaluate(async () => {
        const { gameState } = await import('./js/state.js');
        gameState.chapter1State = 'complete';
        gameState.resonanceState = {};
        (await import('./js/story.js')).openTravelJournal();
      });
      if (view === 'journal-reread') {
        await page.evaluate(async () => {
          const { gameState } = await import('./js/state.js');
          gameState.journalReading.pages.shapeshifter = 1;
          (await import('./js/story.js')).openTravelJournal({ preview: true });
        });
        await page.click('.journalChapterEntry');
      }
      if (view === 'combat') {
        await page.evaluate(async () => { const d = await import('./js/debug.js'); d.debugStartBossFight(); });
      }
      if (view === 'boss-prep') await page.evaluate(async () => { const d = await import('./js/debug.js'); d.debugPrepareRuinsBoss(); const shop = await import('./js/shop.js'); shop.leaveShop(); });
      if (view === 'event') await page.evaluate(() => window.__debugHooks.startEventById('ruins-entrance', () => {}));
      await page.waitForTimeout(500);
      const audit = await page.evaluate(() => {
        const visible = e => e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && e.getBoundingClientRect().width > 0;
        const texts = [...document.querySelectorAll('body *')].filter(e => !['SCRIPT','STYLE'].includes(e.tagName) && visible(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
        const small = texts.filter(e => parseFloat(getComputedStyle(e).fontSize) < 12).map(e => ({ selector: e.id ? '#' + e.id : e.className, text: e.textContent.trim().slice(0, 60), size: getComputedStyle(e).fontSize }));
        return { small, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      await page.screenshot({ path: path.join(output, `${width}-${view}.png`), fullPage: true });
      if (view === 'journal-reread') {
        for (const direction of ['next', 'prev']) {
          await page.click(direction === 'next' ? '#journalNextBtn' : '#journalPrevBtn');
          await page.evaluate(() => {
            document.querySelector('.journalReadingLeaf').getAnimations({ subtree: true }).forEach(animation => {
              animation.pause();
              animation.currentTime = 360;
            });
          });
          await page.screenshot({ path: path.join(output, `${width}-journal-turn-${direction}.png`) });
          await page.waitForFunction(() => !document.getElementById('journalNextBtn').disabled);
        }
      }
      report.push({ width, view, ...audit, errors });
      await page.close();
    }
  }
  for (const width of [1440, 390]) {
    const files = (await fs.readdir(output)).filter(name => name.startsWith(`${width}-`) && name.endsWith('.png'));
    const sheet = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
    const tiles = await Promise.all(files.map(async name => `<figure><figcaption>${name}</figcaption><img src="data:image/png;base64,${(await fs.readFile(path.join(output, name))).toString('base64')}"></figure>`));
    await sheet.setContent(`<style>body{background:#333;color:white;display:grid;grid-template-columns:repeat(5,1fr);gap:12px;font:14px sans-serif}figure{margin:0}img{width:100%;height:340px;object-fit:contain;object-position:top;background:#111}figcaption{padding:6px}</style>${tiles.join('')}`);
    await sheet.screenshot({ path: path.join(output, `sheet-${width}.png`), fullPage: true });
    await sheet.close();
  }
  for (const time of [1200, 2100, 2700]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/?debug&view=home`);
    await page.evaluate(async () => {
      const story = await import('./js/story.js');
      story.queueDialogue('chapter1_goddess', () => {});
      story.finishHeavenArrival();
    });
    await page.waitForTimeout(350);
    await page.evaluate(async time => {
      const story = await import('./js/story.js');
      story.startHeavenDeparture();
      document.querySelectorAll('#heavenTransition *').forEach(element => {
        element.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = time; });
      });
    }, time);
    await page.screenshot({ path: path.join(output, `departure-${time}.png`) });
    await page.close();
  }
  if (report.length) await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.map(({ width, view, small, overflow, errors }) => ({ width, view, small: small.length, overflow, errors }))));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
