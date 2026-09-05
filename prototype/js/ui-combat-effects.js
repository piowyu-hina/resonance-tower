import { gameState } from './state.js';
import { drainCombatEvents } from './combat-events.js';
import { popup, flash, showSkillCastEffect, showVictoryOverlay, showDefeatOverlay, showBossIntro } from './ui-overlays.js';
import { render, buildCombatActionBar, buildMonsterCards } from './ui-main.js';
import { attachSkillTooltip } from './ui-loadout.js';
import { destroyRuinsSpike } from './ruins.js';

// Consumes the combat-event queue (combat-events.js) that combat.js populates
// instead of calling popup/flash/DOM functions directly. flushCombat() is the
// one seam every combat-mutating call site uses: play whatever one-shot
// effects combat.js just queued, then re-render current state. Safe to call
// liberally - draining an empty queue and re-rendering unchanged state are
// both no-ops.

function resolvePortraitEl(targetKind, targetId) {
  const refs = targetKind === 'char' ? gameState.charEls[targetId] : gameState.monsterEls[targetId];
  return refs && refs.portraitEl;
}

function showRuinsSpikeRush(event) {
  const arena = document.getElementById('bossArena');
  if (!arena) return;
  arena.querySelectorAll('.ruinsSpike').forEach(element => element.remove());

  const spikeIds = Array.isArray(event.spikeIds) ? event.spikeIds : [];
  const count = spikeIds.length;
  if (count === 0) return;
  const duration = Math.max(1000, Number(event.travelMs) || 5000);
  const spikeHeight = 54;
  const availableHeight = Math.max(0, arena.clientHeight - spikeHeight);
  const hint = document.createElement('div');
  hint.className = 'ruinsSpikeHint';
  hint.textContent = '點擊岩刺！';
  arena.appendChild(hint);
  for (let index = 0; index < count; index++) {
    const spike = document.createElement('button');
    spike.type = 'button';
    spike.className = 'ruinsSpike';
    spike.setAttribute('aria-label', `擊碎岩刺 ${index + 1}`);
    const ratio = count === 1 ? 0.5 : index / (count - 1);
    spike.style.setProperty('--ruins-spike-top', `${Math.round(availableHeight * ratio)}px`);
    spike.style.setProperty('--ruins-spike-right', `${-88 + (count - index - 1) * 36}px`);
    spike.style.setProperty('--ruins-spike-duration', `${duration}ms`);
    spike.style.setProperty('--ruins-spike-scale', String(0.82 + (index % 3) * 0.09));
    spike.innerHTML = '<img src="assets/skills/floor1/relics_master_skill3_effect.png" alt="" draggable="false">';
    spike.addEventListener('click', () => {
      if (!destroyRuinsSpike(event.bossId, spikeIds[index])) return;
      // Replacing the travel animation with the break animation would snap
      // `right` back to its starting value. Pin the spike at its current
      // on-screen position first so it shatters exactly where it was clicked.
      const currentLeft = spike.offsetLeft;
      spike.style.left = `${currentLeft}px`;
      spike.style.right = 'auto';
      spike.classList.add('destroyed');
      spike.disabled = true;
      if (!arena.querySelector('.ruinsSpike:not(.destroyed)')) hint.remove();
      render();
    });
    spike.addEventListener('animationend', () => spike.remove(), { once: true });
    arena.appendChild(spike);
  }
  setTimeout(() => hint.remove(), duration + 100);
}

function showRuinsSpikeImpact(event) {
  const arena = document.getElementById('bossArena');
  if (!arena) return;
  arena.querySelector('.ruinsSpikeImpact')?.remove();
  const impact = document.createElement('div');
  impact.className = 'ruinsSpikeImpact';
  impact.textContent = `${event.hitCount} 枚岩刺命中　-${event.totalDamage} HP`;
  arena.appendChild(impact);
  setTimeout(() => impact.remove(), 900);
}

function playCombatEvent(event) {
  switch (event.type) {
    case 'popup':
      popup(resolvePortraitEl(event.targetKind, event.targetId), event.text, event.cls);
      break;
    case 'flash':
      flash(resolvePortraitEl(event.targetKind, event.targetId));
      break;
    case 'skillCast':
      showSkillCastEffect(resolvePortraitEl(event.targetKind, event.targetId), event.skill);
      break;
    case 'shieldBlock': {
      const portrait = resolvePortraitEl(event.targetKind, event.targetId);
      if (!portrait) break;
      const ring = document.createElement('div');
      ring.className = 'guardBlockRing';
      ring.textContent = '🛡️';
      ring.setAttribute('aria-hidden', 'true');
      portrait.appendChild(ring);
      setTimeout(() => ring.remove(), 650);
      break;
    }
    case 'monsterDefeated': {
      // renderCombatView() only updates ALIVE monsters' cards, so without this
      // the dead one's card would just freeze on-screen at its last HP reading
      // (never visibly reaching 0) instead of actually disappearing. Keep the
      // now-transparent card as a layout placeholder until the next wave
      // rebuild - removing it here makes every surviving enemy snap toward
      // the centre on the animation's final frame.
      const refs = gameState.monsterEls[event.monsterId];
      if (refs) {
        refs.hpBar.style.width = '0%';
        refs.hpText.textContent = `0/${event.maxHp}`;
        refs.card.classList.add('down', 'dying');
      }
      break;
    }
    case 'bossVictoryCleanup':
      // Summons/remaining mobs don't linger once the boss is down.
      event.clearedIds.forEach(id => {
        const card = gameState.monsterEls[id] && gameState.monsterEls[id].card;
        if (card) card.remove();
      });
      break;
    case 'waveSpawned':
      buildMonsterCards();
      break;
    case 'combatActionsChanged':
      buildCombatActionBar();
      break;
    case 'bossIntro':
      showBossIntro(() => {}, event.presentation);
      break;
    case 'monsterSummoned': {
      buildMonsterCards();
      const bossPortrait = gameState.monsterEls[event.bossId] && gameState.monsterEls[event.bossId].portraitEl;
      showSkillCastEffect(bossPortrait, event.skill);
      popup(bossPortrait, 'SUMMON', 'buff');
      break;
    }
    case 'ruinsShieldChanged': {
      const refs = gameState.monsterEls[event.bossId];
      if (refs) refs.card.classList.toggle('reflectShield', event.active);
      break;
    }
    case 'ruinsShieldPulse': {
      const refs = gameState.monsterEls[event.bossId];
      if (refs) {
        refs.card.classList.remove('reflectShieldPulse');
        void refs.card.offsetWidth;
        refs.card.classList.add('reflectShieldPulse');
      }
      break;
    }
    case 'ruinsSpikeRush':
      showRuinsSpikeRush(event);
      break;
    case 'ruinsSpikeImpact':
      showRuinsSpikeImpact(event);
      break;
    case 'victory':
      showVictoryOverlay(event.securedGold);
      break;
    case 'defeat':
      showDefeatOverlay();
      break;
  }
}

function playCombatEvents(events) {
  events.forEach(playCombatEvent);
}

export function flushCombat() {
  playCombatEvents(drainCombatEvents());
  render();
}

// mobs only ever have the one "move" (skill), shown as a skill icon just
// like characters - same cooldown-fill visual language, even if it's just a
// basic attack. The boss additionally has skill3 (黏液陣, the arena minigame),
// shown as a second icon with its own independent cooldown.
// (Moved here from combat.js - pure DOM construction, no battle logic.)
export function updateMonsterSkillIcons(m) {
  const refs = gameState.monsterEls[m.id];
  const container = refs.skillsEl;
  container.innerHTML = '';

  if (!m.skill) {
    refs.skillCdOverlayEl = null;
    refs.skill2CdOverlayEl = null;
    refs.skill3CdOverlayEl = null;
    return;
  }

  const el = document.createElement('div');
  el.className = 'skillIcon';
  el.innerHTML = `
    <img src="assets/skills/${m.skill.img}.png" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
    <span class="fallback">${m.skill.icon}</span>
    <div class="cdOverlay"></div>
  `;
  container.appendChild(el);
  attachSkillTooltip(el, m.skill);
  refs.skillCdOverlayEl = el.querySelector('.cdOverlay');

  refs.skill2CdOverlayEl = null;
  if (m.skill2) {
    const el2 = document.createElement('div');
    el2.className = 'skillIcon';
    el2.innerHTML = `
      <img src="assets/skills/${m.skill2.img}.png" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <span class="fallback">${m.skill2.icon}</span>
      <div class="cdOverlay"></div>
    `;
    container.appendChild(el2);
    attachSkillTooltip(el2, m.skill2);
    refs.skill2CdOverlayEl = el2.querySelector('.cdOverlay');
  }

  refs.skill3CdOverlayEl = null;
  if (m.skill3) {
    const el3 = document.createElement('div');
    el3.className = 'skillIcon';
    el3.innerHTML = `
      <img src="assets/skills/${m.skill3.img}.png" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <span class="fallback">${m.skill3.icon}</span>
      <div class="cdOverlay"></div>
    `;
    container.appendChild(el3);
    attachSkillTooltip(el3, m.skill3);
    refs.skill3CdOverlayEl = el3.querySelector('.cdOverlay');
  }
}
