// Consumes the combat-event queue (combat-events.js) that combat.js populates
// instead of calling popup/flash/DOM functions directly. flushCombat() is the
// one seam every combat-mutating call site uses: play whatever one-shot
// effects combat.js just queued, then re-render current state. Safe to call
// liberally - draining an empty queue and re-rendering unchanged state are
// both no-ops.

function resolvePortraitEl(targetKind, targetId) {
  const refs = targetKind === 'char' ? charEls[targetId] : monsterEls[targetId];
  return refs && refs.portraitEl;
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
    case 'monsterDefeated': {
      // renderCombatView() only updates ALIVE monsters' cards, so without this
      // the dead one's card would just freeze on-screen at its last HP reading
      // (never visibly reaching 0) instead of actually disappearing. Keep the
      // now-transparent card as a layout placeholder until the next wave
      // rebuild - removing it here makes every surviving enemy snap toward
      // the centre on the animation's final frame.
      const refs = monsterEls[event.monsterId];
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
        const card = monsterEls[id] && monsterEls[id].card;
        if (card) card.remove();
      });
      break;
    case 'waveSpawned':
      buildMonsterCards();
      break;
    case 'monsterSummoned': {
      buildMonsterCards();
      const bossPortrait = monsterEls[event.bossId] && monsterEls[event.bossId].portraitEl;
      showSkillCastEffect(bossPortrait, event.skill);
      popup(bossPortrait, 'SUMMON', 'buff');
      break;
    }
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

function flushCombat() {
  playCombatEvents(drainCombatEvents());
  render();
}

// mobs only ever have the one "move" (skill), shown as a skill icon just
// like characters - same cooldown-fill visual language, even if it's just a
// basic attack. The boss additionally has skill3 (黏液陣, the arena minigame),
// shown as a second icon with its own independent cooldown.
// (Moved here from combat.js - pure DOM construction, no battle logic.)
function updateMonsterSkillIcons(m) {
  const refs = monsterEls[m.id];
  const container = refs.skillsEl;
  container.innerHTML = '';

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
