import { GOO_BATCH_SIZE, GOO_LIFESPAN_MS, GOO_SKILL_CD_MS, MASTER_TICK_MS, GOO_PULSE_MS, GOO_PERFECT_WINDOW_MS, GOO_PERFECT_MULT } from './constants.js';
import { gameState, PHASES, log } from './state.js';
import { popup, flash } from './ui-overlays.js';
import { render } from './ui-main.js';

// --- 王戰黏液機制 ---
// Self-contained boss-arena minigame: spawn/click/mature goo blobs. Kept
// separate from combat.js so a future floor mechanic can live alongside it
// without the two tangling together.
export function clearGooArena() {
  gameState.gooSpawnCountdown = 0;
  gameState.gooOpeningCountdown = 0;
  gameState.activeGoos.forEach(g => g.el.remove());
  gameState.activeGoos = [];
  gameState.activeGooBatch = null;
  const arena = document.getElementById('bossArena');
  if (arena) arena.querySelectorAll('.goo, .ruinsSpike, .ruinsSpikeHint, .ruinsSpikeImpact').forEach(el => el.remove());
}

export function spawnGoo(batch, index) {
  const arena = document.getElementById('bossArena');
  if (!arena) return;
  const el = document.createElement('div');
  el.className = 'goo';
  el.innerHTML = `
    <img src="assets/skills/floor1/slime_boss_skill3_effect.png" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
    <span class="fallback">🔵</span>
  `;
  arena.appendChild(el);
  // Use rendered dimensions so enlarged desktop targets stay inside the arena,
  // including the pulse animation's extra footprint.
  const margin = 4;
  const maxX = Math.max(margin, arena.clientWidth - el.offsetWidth - margin);
  const maxY = Math.max(margin, arena.clientHeight - el.offsetHeight - margin);
  const slotWidth = arena.clientWidth / GOO_BATCH_SIZE;
  const slotStart = slotWidth * index + margin;
  const slotEnd = Math.max(slotStart, slotWidth * (index + 1) - el.offsetWidth - margin);
  el.style.left = Math.round(Math.min(maxX, slotStart + Math.random() * (slotEnd - slotStart))) + 'px';
  el.style.top = Math.round(margin + Math.random() * (maxY - margin)) + 'px';
  const goo = { el, batch, msLeft: GOO_LIFESPAN_MS, spawnTime: performance.now() };
  el.addEventListener('click', () => popGoo(goo));
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `擊破黏液 ${index + 1}`);
  el.tabIndex = 0;
  el.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      popGoo(goo);
    }
  });
  gameState.activeGoos.push(goo);
}

export function spawnGooBatch() {
  if (gameState.activeGooBatch) return;
  gameState.activeGooBatch = { remaining: GOO_BATCH_SIZE, perfectCount: 0 };
  for (let index = 0; index < GOO_BATCH_SIZE; index++) spawnGoo(gameState.activeGooBatch, index);
  log(`史萊姆王召喚了 ${GOO_BATCH_SIZE} 顆黏液！全部點完才會造成傷害`, 'warn');
}

// the goo's CSS pulse (grow/shrink) doubles as the timing cue: pop it right
// when it's at its biggest for a "perfect" bonus instead of the normal one.
export function isPerfectPop(goo) {
  const elapsed = performance.now() - goo.spawnTime;
  const cyclePos = elapsed % (GOO_PULSE_MS * 2);
  const distFromPeak = Math.abs(cyclePos - GOO_PULSE_MS);
  return distFromPeak <= GOO_PERFECT_WINDOW_MS;
}

export function popGoo(goo) {
  if (gameState.phase !== PHASES.COMBAT || ['dialogue', 'event'].includes(gameState.activeOverlay)) return;
  if (goo.batch !== gameState.activeGooBatch || !gameState.monsters.some(m => m.isBoss && m.alive && m.hp > 0)) return;
  const idx = gameState.activeGoos.indexOf(goo);
  if (idx === -1) return; // already matured/removed
  gameState.activeGoos.splice(idx, 1);
  goo.el.remove();

  if (isPerfectPop(goo)) goo.batch.perfectCount++;
  goo.batch.remaining--;
  if (goo.batch.remaining > 0) {
    log(`點掉黏液，還剩 ${goo.batch.remaining} 顆`, 'party');
    return;
  }

  const boss = gameState.monsters.find(m => m.isBoss && m.alive);
  if (!boss || goo.batch !== gameState.activeGooBatch) return;
  const bossPortraitEl = gameState.monsterEls[boss.id] && gameState.monsterEls[boss.id].portraitEl;
  const baseDmg = Math.round(8 + gameState.floor * 3);
  const bonusHits = goo.batch.perfectCount * (GOO_PERFECT_MULT - 1);
  const dmg = baseDmg * (GOO_BATCH_SIZE + bonusHits);
  boss.hp -= dmg;
  if (goo.batch.perfectCount > 0 && gameState.gooDebuffStacks > 0) gameState.gooDebuffStacks--;
  const perfectText = goo.batch.perfectCount > 0 ? `（${goo.batch.perfectCount} 次完美）` : '';
  log(`整批黏液清除！${perfectText}造成 ${dmg} 傷害`, 'good');
  popup(bossPortraitEl, (goo.batch.perfectCount > 0 ? 'PERFECT ' : '') + '-' + dmg, goo.batch.perfectCount > 0 ? 'perfect' : 'dmg');
  flash(bossPortraitEl);
  gameState.activeGooBatch = null;
  // don't resolve the kill here - the next tick()'s death sweep catches
  // hp<=0 monsters uniformly, whether they died to an attack or a goo pop.
  render();
}

export function gooTick(boss) {
  let batchFailed = false;
  gameState.activeGoos.forEach(g => {
    g.msLeft -= MASTER_TICK_MS;
    if (g.msLeft <= 0) batchFailed = true;
  });
  if (batchFailed) {
    gameState.activeGoos.forEach(g => g.el.remove());
    gameState.activeGoos = [];
    gameState.activeGooBatch = null;
    gameState.gooDebuffStacks++;
    log('有黏液化開了！整批失敗，隊伍沾黏、攻擊力下降', 'warn');
  }

  if (gameState.gooOpeningCountdown > 0) {
    gameState.gooOpeningCountdown = Math.max(0, gameState.gooOpeningCountdown - MASTER_TICK_MS);
    if (gameState.gooOpeningCountdown > 0) return;
  }
  gameState.gooSpawnCountdown = Math.max(0, gameState.gooSpawnCountdown - MASTER_TICK_MS);
  if (gameState.gooSpawnCountdown <= 0 && !gameState.activeGooBatch) {
    gameState.gooSpawnCountdown = GOO_SKILL_CD_MS;
    spawnGooBatch();
  }
}
