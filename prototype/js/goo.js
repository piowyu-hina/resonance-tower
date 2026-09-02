// --- 王戰黏液機制 ---
// Self-contained boss-arena minigame: spawn/click/mature goo blobs. Kept
// separate from combat.js so a future floor mechanic can live alongside it
// without the two tangling together.
function clearGooArena() {
  activeGoos.forEach(g => g.el.remove());
  activeGoos = [];
  activeGooBatch = null;
  const arena = document.getElementById('bossArena');
  if (arena) arena.querySelectorAll('.goo').forEach(el => el.remove());
}

function spawnGoo(batch, index) {
  const arena = document.getElementById('bossArena');
  if (!arena) return;
  const el = document.createElement('div');
  el.className = 'goo';
  el.innerHTML = `
    <img src="assets/skills/floor1/slime_boss_skill3.png" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
    <span class="fallback">🔵</span>
  `;
  const maxX = Math.max(0, arena.clientWidth - 34);
  const maxY = Math.max(0, arena.clientHeight - 34);
  const slotWidth = arena.clientWidth / GOO_BATCH_SIZE;
  const slotStart = slotWidth * index;
  const slotEnd = Math.max(slotStart, slotWidth * (index + 1) - 34);
  el.style.left = Math.round(Math.min(maxX, slotStart + Math.random() * (slotEnd - slotStart))) + 'px';
  el.style.top = Math.round(Math.random() * maxY) + 'px';
  arena.appendChild(el);
  const goo = { el, batch, msLeft: GOO_LIFESPAN_MS, spawnTime: performance.now() };
  el.addEventListener('click', () => popGoo(goo));
  activeGoos.push(goo);
}

function spawnGooBatch() {
  if (activeGooBatch) return;
  activeGooBatch = { remaining: GOO_BATCH_SIZE, perfectCount: 0 };
  for (let index = 0; index < GOO_BATCH_SIZE; index++) spawnGoo(activeGooBatch, index);
  log(`史萊姆王召喚了 ${GOO_BATCH_SIZE} 顆黏液！全部點完才會造成傷害`, 'warn');
}

// the goo's CSS pulse (grow/shrink) doubles as the timing cue: pop it right
// when it's at its biggest for a "perfect" bonus instead of the normal one.
function isPerfectPop(goo) {
  const elapsed = performance.now() - goo.spawnTime;
  const cyclePos = elapsed % (GOO_PULSE_MS * 2);
  const distFromPeak = Math.abs(cyclePos - GOO_PULSE_MS);
  return distFromPeak <= GOO_PERFECT_WINDOW_MS;
}

function popGoo(goo) {
  const idx = activeGoos.indexOf(goo);
  if (idx === -1) return; // already matured/removed
  activeGoos.splice(idx, 1);
  goo.el.remove();

  if (isPerfectPop(goo)) goo.batch.perfectCount++;
  goo.batch.remaining--;
  if (goo.batch.remaining > 0) {
    log(`點掉黏液，還剩 ${goo.batch.remaining} 顆`, 'party');
    return;
  }

  const boss = monsters.find(m => m.isBoss && m.alive);
  if (!boss || goo.batch !== activeGooBatch) return;
  const bossPortraitEl = monsterEls[boss.id] && monsterEls[boss.id].portraitEl;
  const baseDmg = Math.round(8 + floor * 3);
  const bonusHits = goo.batch.perfectCount * (GOO_PERFECT_MULT - 1);
  const dmg = baseDmg * (GOO_BATCH_SIZE + bonusHits);
  boss.hp -= dmg;
  if (goo.batch.perfectCount > 0 && gooDebuffStacks > 0) gooDebuffStacks--;
  const perfectText = goo.batch.perfectCount > 0 ? `（${goo.batch.perfectCount} 次完美）` : '';
  log(`整批黏液清除！${perfectText}造成 ${dmg} 傷害`, 'good');
  popup(bossPortraitEl, (goo.batch.perfectCount > 0 ? 'PERFECT ' : '') + '-' + dmg, goo.batch.perfectCount > 0 ? 'perfect' : 'dmg');
  flash(bossPortraitEl);
  activeGooBatch = null;
  // don't resolve the kill here - the next tick()'s death sweep catches
  // hp<=0 monsters uniformly, whether they died to an attack or a goo pop.
  render();
}

function gooTick(boss) {
  let batchFailed = false;
  activeGoos.forEach(g => {
    g.msLeft -= MASTER_TICK_MS;
    if (g.msLeft <= 0) batchFailed = true;
  });
  if (batchFailed) {
    activeGoos.forEach(g => g.el.remove());
    activeGoos = [];
    activeGooBatch = null;
    gooDebuffStacks++;
    log('有黏液化開了！整批失敗，隊伍沾黏、攻擊力下降', 'warn');
  }

  gooSpawnCountdown -= MASTER_TICK_MS;
  if (gooSpawnCountdown <= 0) {
    gooSpawnCountdown = GOO_SKILL_CD_MS;
    if (!activeGooBatch) spawnGooBatch();
  }
}
