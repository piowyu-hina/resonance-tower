import { gameState, log } from './state.js';

// Player input for the Ruins Master's arena mechanic. Combat owns the wave
// timer and damage resolution; this small input seam only marks one still-
// flying spike as destroyed, keeping the DOM out of combat.js.
export function destroyRuinsSpike(bossId, spikeId) {
  const boss = gameState.monsters.find(monster => monster.id === bossId && monster.storyBoss && monster.alive);
  if (!boss || boss.pendingSpikeMs <= 0) return false;
  const spike = boss.pendingSpikes.find(candidate => candidate.id === spikeId);
  if (!spike || !spike.active) return false;

  spike.active = false;
  const remaining = boss.pendingSpikes.filter(candidate => candidate.active).length;
  log(`擊碎岩刺，還剩 ${remaining} 枚`, 'party');
  return true;
}
