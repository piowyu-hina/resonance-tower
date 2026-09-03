function enterPrepFloor() {
  phase = 'prepFloor';
  prepLocation = 'village';
  // retreating out of prepBoss leaves its auto-opened shop overlay active
  // otherwise - close whatever's open on this clean state transition.
  if (activeOverlay) OVERLAY_CLOSERS[activeOverlay]();
}
function enterPrepBoss() {
  phase = 'prepBoss';
  closeOtherOverlays('shop');
  activeOverlay = 'shop';
  shopMode = 'dungeon';
  shopAutoLeave = true;
  shopCountdown = SHOP_IDLE_MS;
  showGuideOnce('dungeonShop');
}

function resetBossEntryCooldowns() {
  party.forEach(id => {
    const character = roster.find(member => member.id === id);
    if (!character) return;
    character.skillCds = character.skillCds.map(() => 0);
    character.manualActionCd = 0;
  });
  combatItemCooldowns = {};
}

// mob-wave stat baselines got roughly halved from their old single-mob values
// because 2~3 of them now hit the party simultaneously - still a rough first
// pass (see design.md "平衡尚待調整"), tune freely later.
function makeMob(defId = FLOOR1_MOB_POOL[Math.floor(Math.random() * FLOOR1_MOB_POOL.length)]) {
  const def = MONSTER_DEFS[defId];
  const maxHp = 9 + Math.round(floor * 6);
  return {
    id: 'm' + (monsterIdCounter++),
    defId,
    name: def.name,
    level: floor,
    isBoss: false,
    img: def.img,
    maxHp,
    hp: maxHp,
    atk: 1 + Math.floor(floor * 0.7),
    atkInterval: MOB_ATK_INTERVAL,
    actionCountdown: MOB_ATK_INTERVAL,
    alive: true,
    isSummoned: false,
    skillCd: 0,
    skill: def.skill,
  };
}

function makeBoss() {
  return {
    id: 'm' + (monsterIdCounter++),
    name: '史萊姆王',
    level: floor,
    isBoss: true,
    img: 'floor1/slime_boss',
    maxHp: 60 + floor * 40,
    hp: 60 + floor * 40,
    atk: 6 + Math.floor(floor * 3),
    atkInterval: BOSS_ATK_INTERVAL,
    actionCountdown: BOSS_ATK_INTERVAL,
    alive: true,
    skillCd: 0, // ms remaining until 黏液潑濺 (the slow-on-hit version) is off cooldown again
    skill: {
      name: '黏液潑濺', icon: '💧', img: 'floor1/slime_boss_skill1', cd: BOSS_SKILL_CD,
      target: 'randomParty',
      effects: [
        { type: 'damage', mult: 1 },
        { type: 'slow', mult: MONSTER_SLOW_MULT, duration: MONSTER_SLOW_MS / 1000 },
      ],
      desc: '造成傷害並降低攻速 4 秒',
    },
    skill2Cd: BOSS_SUMMON_OPENING_MS,
    skill2: { name: '召喚黏液', icon: '🟢', img: 'floor1/slime_boss_skill2', cd: BOSS_SUMMON_CD_MS / 1000, desc: `召喚 1 隻隨機史萊姆，場上最多 ${BOSS_SUMMON_MAX} 隻召喚物` },
    skill3: { name: '黏液陣', icon: '🔵', img: 'floor1/slime_boss_skill3', cd: GOO_SKILL_CD_MS / 1000, desc: `一次召喚 ${GOO_BATCH_SIZE} 顆黏液，限時全部點完才造成傷害；漏掉任一顆會讓隊伍沾黏、攻擊力下降` },
  };
}

// each floor is 2 mob waves (MOBS_PER_FLOOR) of 2~3 simultaneous mobs each,
// then a single boss wave. Scope note: a future "kill 10 mobs -> event, kill
// 100 -> boss" flow (see design.md) needs the event system designed first -
// this stays the simpler wave-based gate until then.
function spawnWave() {
  clearGooArena();
  gooDebuffStacks = 0;
  monsters = [];
  if (mobsCleared < MOBS_PER_FLOOR) {
    const count = 2 + Math.floor(Math.random() * 2); // 2~3 mobs
    for (let i = 0; i < count; i++) monsters.push(makeMob());
  } else {
    monsters.push(makeBoss());
    gooSpawnCountdown = 800; // faster opening spawn than the steady-state cooldown, so the fight doesn't feel dead at the start
  }
  buildMonsterCards();
}

// mobs only ever have the one "move" (skill), shown as a skill icon just
// like characters - same cooldown-fill visual language, even if it's just a
// basic attack. The boss additionally has skill3 (黏液陣, the arena minigame),
// shown as a second icon with its own independent cooldown.
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

function bossSummonTick(boss) {
  boss.skill2Cd = Math.max(0, boss.skill2Cd - MASTER_TICK_MS);
  if (boss.skill2Cd > 0) return;

  const livingSummons = aliveMonsters().filter(m => m.isSummoned);
  if (livingSummons.length >= BOSS_SUMMON_MAX) return;

  boss.skill2Cd = BOSS_SUMMON_CD_MS;
  const summoned = makeMob();
  summoned.isSummoned = true;
  monsters.push(summoned);
  buildMonsterCards();
  const bossPortrait = monsterEls[boss.id] && monsterEls[boss.id].portraitEl;
  showSkillCastEffect(bossPortrait, boss.skill2);
  popup(bossPortrait, 'SUMMON', 'buff');
  log(`${boss.name} 使用【${boss.skill2.name}】，召喚了 ${summoned.name}！`, 'enemy');
}

function selectMonsterSkillTarget(skill) {
  if (skill.target === 'lowestHpMonster') {
    const injured = aliveMonsters().filter(m => m.hp < m.maxHp);
    if (injured.length === 0) return null;
    return injured.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b));
  }
  const alive = activeAliveMembers();
  return alive.length > 0 ? alive[Math.floor(Math.random() * alive.length)] : null;
}

// Generic interpreter for monster skill data. Returns false when a skill has
// no valid target (for example, a healer whose whole side is already full).
function performMonsterSkill(m) {
  const skill = m.skill;
  const target = selectMonsterSkillTarget(skill);
  if (!target) return false;

  const targetsParty = skill.target === 'randomParty';
  if (targetsParty && target.dodgeUntil > 0) {
    log(`${m.name} 使用【${skill.name}】，但被 ${CHAR_DEFS[target.id].name} 閃避了！`, 'party');
    popup(charEls[target.id].portraitEl, 'MISS', 'buff');
    m.skillCd = skill.cd * 1000;
    return true;
  }

  m.skillCd = skill.cd * 1000;
  const targetPortrait = targetsParty ? charEls[target.id].portraitEl : monsterEls[target.id].portraitEl;
  showSkillCastEffect(targetPortrait, skill);

  skill.effects.forEach(effect => {
    if (effect.type === 'damage') {
      const base = Math.max(1, m.atk * effect.mult - calcDef(target));
      const dmg = rollDamage(base);
      target.curHp -= dmg;
      log(`${m.name} 使用【${skill.name}】攻擊 ${CHAR_DEFS[target.id].name}，造成 ${dmg} 傷害`, 'enemy');
      popup(targetPortrait, '-' + dmg, 'dmg');
      flash(targetPortrait);
    } else if (effect.type === 'slow') {
      target.slowMult = effect.mult;
      target.slowUntil = effect.duration * 1000;
      log(`${CHAR_DEFS[target.id].name} 的攻速降低`, 'enemy');
      popup(targetPortrait, 'SLOW', 'dmg');
    } else if (effect.type === 'sleepUntilAction') {
      target.sleepUntilAction = true;
      log(`${CHAR_DEFS[target.id].name} 睡著了，下一次行動會用來醒來`, 'enemy');
      popup(targetPortrait, 'SLEEP', 'dmg');
    } else if (effect.type === 'charmAttackAlly') {
      target.charmedUntilAction = true;
      log(`${CHAR_DEFS[target.id].name} 被魅惑了，下一次行動會攻擊友軍`, 'enemy');
      popup(targetPortrait, 'CHARM', 'dmg');
    } else if (effect.type === 'heal') {
      const heal = Math.min(target.maxHp - target.hp, Math.round(target.maxHp * effect.pct));
      target.hp += heal;
      log(`${m.name} 使用【${skill.name}】，治療 ${target.name} ${heal} 生命`, 'enemy');
      popup(targetPortrait, '+' + heal, 'heal');
    }
  });

  if (targetsParty && target.curHp <= 0) {
    target.curHp = 0;
    target.alive = false;
    log(`${CHAR_DEFS[target.id].name} 倒下了！`, 'warn');
  }
  return true;
}

function performCharmedAction(c) {
  const others = activeAliveMembers().filter(member => member.id !== c.id);
  const target = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : c;
  const base = Math.max(1, calcAtk(c) - calcDef(target));
  const dmg = rollDamage(base);
  target.curHp -= dmg;
  log(`${CHAR_DEFS[c.id].name} 受到魅惑，攻擊 ${target === c ? '自己' : CHAR_DEFS[target.id].name}，造成 ${dmg} 傷害`, 'warn');
  popup(charEls[target.id].portraitEl, '-' + dmg, 'dmg');
  flash(charEls[target.id].portraitEl);
  if (target.curHp <= 0) {
    target.curHp = 0;
    target.alive = false;
    log(`${CHAR_DEFS[target.id].name} 倒下了！`, 'warn');
  }
}

function performSkill(c, skill, idx, target) {
  c.skillCds[idx] = skill.cd * 1000; // skill.cd is authored in seconds
  const name = CHAR_DEFS[c.id].name;
  // cast flourish plays on whoever the skill actually affects - the enemy
  // for offensive skills, the caster (or healed ally) for everything else -
  // not always on the caster like before.
  const lineScaleForThisSkill = skillLineScale(c, idx); // 1x unleveled, up to 2x maxed (see 經驗書)
  if (skill.type === 'damage') {
    const dmg = rollDamage(calcAtk(c) * skill.mult * lineScaleForThisSkill);
    target.hp -= dmg;
    log(`${name} 使用【${skill.name}】攻擊 ${target.name}，造成 ${dmg} 傷害`, 'party');
    showSkillCastEffect(monsterEls[target.id].portraitEl, skill);
    popup(monsterEls[target.id].portraitEl, '-' + dmg, 'dmg');
    flash(monsterEls[target.id].portraitEl);
  } else if (skill.type === 'healSelf') {
    const heal = Math.round(c.maxHp * skill.pct * lineScaleForThisSkill);
    c.curHp = Math.min(c.maxHp, c.curHp + heal);
    log(`${name} 使用【${skill.name}】，恢復 ${heal} 生命`, 'party');
    showSkillCastEffect(charEls[c.id].portraitEl, skill);
    popup(charEls[c.id].portraitEl, '+' + heal, 'heal');
  } else if (skill.type === 'healAlly') {
    const alive = activeAliveMembers();
    if (alive.length === 0) return;
    const healTarget = alive.reduce((a, b) => (a.curHp / a.maxHp < b.curHp / b.maxHp ? a : b));
    const heal = Math.round(healTarget.maxHp * skill.pct * lineScaleForThisSkill);
    healTarget.curHp = Math.min(healTarget.maxHp, healTarget.curHp + heal);
    log(`${name} 使用【${skill.name}】，治療 ${CHAR_DEFS[healTarget.id].name} ${heal} 生命`, 'party');
    showSkillCastEffect(charEls[healTarget.id].portraitEl, skill);
    popup(charEls[healTarget.id].portraitEl, '+' + heal, 'heal');
  } else if (skill.type === 'buffAtk') {
    partyBuff.mult = 1 + skill.pct * lineScaleForThisSkill;
    partyBuff.until = skill.duration * 1000; // skill.duration is authored in seconds
    log(`${name} 使用【${skill.name}】，隊伍攻擊力提升 ${Math.round(skill.pct * lineScaleForThisSkill * 100)}%`, 'party');
    showSkillCastEffect(charEls[c.id].portraitEl, skill);
    popup(charEls[c.id].portraitEl, 'ATK UP', 'buff');
  } else if (skill.type === 'buffDefParty') {
    partyDefense.bonus = Math.round(skill.amount * lineScaleForThisSkill);
    partyDefense.until = skill.duration * 1000; // skill.duration is authored in seconds
    log(`${name} 使用【${skill.name}】，隊伍防禦提升 ${partyDefense.bonus} 點`, 'party');
    showSkillCastEffect(charEls[c.id].portraitEl, skill);
    popup(charEls[c.id].portraitEl, 'DEF UP', 'buff');
  } else if (skill.type === 'hasteSelf') {
    // skill.mult is a multiplier BELOW 1 (smaller = faster), so scaling it up
    // like the other fields would backwards it into slower. Scale the boost
    // fraction (1 - mult) instead, floored so a fully-leveled line can't
    // collapse the interval to ~0.
    const boostFraction = Math.min(0.95, (1 - skill.mult) * lineScaleForThisSkill);
    grantHaste(c, 1 - boostFraction, skill.duration);
    log(`${name} 使用【${skill.name}】，攻速提升`, 'party');
    showSkillCastEffect(charEls[c.id].portraitEl, skill);
    popup(charEls[c.id].portraitEl, 'HASTE', 'buff');
  } else if (skill.type === 'dodgeSelf') {
    c.dodgeUntil = skill.duration * 1000;
    log(`${name} 使用【${skill.name}】，進入隱身狀態`, 'party');
    showSkillCastEffect(charEls[c.id].portraitEl, skill);
    popup(charEls[c.id].portraitEl, 'STEALTH', 'buff');
  }
}

// fires once per monster death, whoever/whatever caused it (a party attack,
// a skill, or a goo pop) - tick() sweeps for hp<=0 monsters after every
// action source so this only ever needs to run in one place.
function onMonsterDefeated(m) {
  if (!m.alive) return;
  m.alive = false;
  m.hp = 0;

  // renderCombatView() only updates ALIVE monsters' cards, so without this
  // the dead one's card would just freeze on-screen at its last HP reading
  // (never visibly reaching 0) instead of actually disappearing.
  const refs = monsterEls[m.id];
  if (refs) {
    refs.hpBar.style.width = '0%';
    refs.hpText.textContent = `0/${m.maxHp}`;
    refs.card.classList.add('down', 'dying');
    setTimeout(() => refs.card.remove(), MONSTER_DEATH_REMOVE_MS); // let the grey-out and fade finish before the slot closes
  }

  const alive = activeAliveMembers();
  const firstExpeditionGold = runGold <= 0;
  const gold = goldForKill(m.isBoss, floor);
  runGold += gold;
  if (firstExpeditionGold && gold > 0) showGuideOnce('expeditionGold');
  const xpShare = m.isBoss ? BOSS_XP_SHARE : MOB_XP_SHARE;
  const xpGain = Math.round((xpPoolForFloor(floor) * xpShare) / Math.max(1, alive.length));
  alive.forEach(c => addXp(c, xpGain));
  log(m.isBoss ? `擊敗首領！獲得 ${gold} 金幣` : `擊敗 ${m.name}！獲得 ${gold} 金幣`, 'good');

  if (!m.isBoss && !m.isSummoned) {
    slimeKillCount++; // all floor-1 mobs are slimes for now - see design.md 角色解鎖系統
    checkThresholdUnlocks();
    checkResonanceTriggers();
    if (Math.random() < SLIME_MONSTER_CRYSTAL_DROP_CHANCE) {
      const added = addInventoryItem('monsterCrystal', 1, true);
      if (added > 0) {
        log(`${m.name} 掉落了 1 顆魔物結晶`, 'good');
      } else {
        log(`${m.name} 掉落了魔物結晶，但背包已滿，無法拾取`, 'warn');
      }
    }
    if (Math.random() < SLIME_STAT_BOOK_DROP_CHANCE) {
      const added = addInventoryItem('statBook', 1, true);
      if (added > 0) {
        log(`${m.name} 掉落了 1 本能力書`, 'good');
      } else {
        log(`${m.name} 掉落了能力書，但背包已滿，無法拾取`, 'warn');
      }
    }
    if (Math.random() < SLIME_SKILL_BOOK_DROP_CHANCE) {
      const added = addInventoryItem('skillBook', 1, true);
      if (added > 0) {
        log(`${m.name} 掉落了 1 本技能書`, 'good');
      } else {
        log(`${m.name} 掉落了技能書，但背包已滿，無法拾取`, 'warn');
      }
    }
  }

  if (m.isBoss) {
    // Summons do not keep a cleared boss fight alive. This also leaves room
    // for a future dual-boss fight: victory waits until every boss is down.
    if (aliveMonsters().some(other => other.isBoss)) return;
    monsters.filter(other => other.alive && !other.isBoss).forEach(other => {
      other.alive = false;
      const otherCard = monsterEls[other.id] && monsterEls[other.id].card;
      if (otherCard) otherCard.remove();
    });
    setTimeout(() => {
      log(`${regionName(floor)}制霸！`, 'good');
      if (floor >= MAX_IMPLEMENTED_FLOOR) {
        const securedGold = runGold;
        log(`目前開放的區域已全部完成，本局 ${securedGold} 金幣正式入袋！`, 'good');
        phase = 'victory';
        showVictoryOverlay(securedGold);
      } else {
        floor++;
        mobsCleared = 0;
        enterPrepFloor();
      }
      render();
    }, MONSTER_DEATH_REMOVE_MS);
    return;
  }

  if (m.isSummoned) return; // add deaths never advance the pre-boss wave counter
  if (aliveMonsters().length > 0) return; // rest of this regular wave is still alive

  setTimeout(() => {
    mobsCleared++; // one full wave of mobs cleared
    if (mobsCleared >= MOBS_PER_FLOOR) {
      enterPrepBoss();
    } else {
      spawnWave();
    }
    render();
  }, MONSTER_DEATH_REMOVE_MS);
}

// shared by death and voluntary retreat: both end the run and send everyone
// home to rest (full heal). Level/xp/character unlocks ALWAYS persist now,
// wipe or not. The difference is purely economic, and only touches THIS
// run's unsecured take - anything already safely banked before this run
// started is never at risk:
//  - retreat (bankGold=true): this run's gold joins the permanent stash,
//    this run's item gains (runInventoryGains) stay in the backpack for good
//  - wipe    (bankGold=false): this run's gold evaporates (never added to
//    bankedGold), this run's item gains are stripped back out of the
//    backpack - but bankedGold itself and any previously-secured items are
//    untouched. This is what makes it worth "putting things in the warehouse"
//    (retreating) instead of pushing your luck.
// floor always resets to 1 either way - you re-climb from the bottom next time.
function endRun(bankGold) {
  if (bankGold) {
    bankedGold += runGold;
  } else {
    Object.entries(runInventoryGains).forEach(([itemId, qty]) => {
      removeInventoryItemQuantity(itemId, qty);
    });
  }
  runInventoryGains = {};
  runGold = 0;
  floor = 1;
  mobsCleared = 0;
  partyLocked = false; // a fresh run - free to pick a new party again
  gooDebuffStacks = 0;
  clearGooArena();
  roster.forEach(c => {
    c.curHp = c.maxHp; // resting before the next expedition - both paths heal
    c.alive = true;
    c.skillCds = [0, 0, 0];
    c.manualActionCd = 0;
    c.actionCountdown = 0;
    c.hasteMult = 1;
    c.hasteUntil = 0;
    c.dodgeUntil = 0;
    c.slowMult = 1;
    c.slowUntil = 0;
    c.sleepUntilAction = false;
    c.charmedUntilAction = false;
  });
  partyBuff = { mult: 1, until: 0 };
  partyDefense = { bonus: 0, until: 0 };
  combatItemCooldowns = {};
  enterPrepFloor();
}

function removeInventoryItemQuantity(itemId, amount) {
  let remaining = amount;
  for (let index = 0; index < inventory.length && remaining > 0; index++) {
    const entry = inventory[index];
    if (!entry || entry.itemId !== itemId) continue;
    const used = Math.min(entry.qty, remaining);
    entry.qty -= used;
    remaining -= used;
    if (entry.qty <= 0) inventory[index] = null;
  }
  return amount - remaining;
}

function consumeInventoryItem(itemId, amount = 1) {
  if (inventoryItemCount(itemId) < amount) return false;
  const removed = removeInventoryItemQuantity(itemId, amount);
  const unsecured = runInventoryGains[itemId] || 0;
  runInventoryGains[itemId] = Math.max(0, unsecured - removed);
  return removed === amount;
}

function addInventoryItem(itemId, amount = 1, unsecured = false) {
  const item = ITEM_DEFS[itemId];
  if (!item || amount <= 0) return 0;
  const maxStack = item.maxStack || 99;
  let remaining = amount;

  inventory.forEach(entry => {
    if (!entry || entry.itemId !== itemId || entry.qty >= maxStack || remaining <= 0) return;
    const added = Math.min(maxStack - entry.qty, remaining);
    entry.qty += added;
    remaining -= added;
  });
  for (let index = 0; index < inventory.length && remaining > 0; index++) {
    if (inventory[index]) continue;
    const added = Math.min(maxStack, remaining);
    inventory[index] = { itemId, qty: added };
    remaining -= added;
  }

  const added = amount - remaining;
  if (unsecured && added > 0) runInventoryGains[itemId] = (runInventoryGains[itemId] || 0) + added;
  const overlay = document.getElementById('inventoryOverlay');
  if (overlay && overlay.classList.contains('open')) renderInventory();
  return added;
}

function resetShopIdleTimer() {
  if (shopMode === 'dungeon' && shopAutoLeave) shopCountdown = SHOP_IDLE_MS;
}

function shopGold() {
  return shopMode === 'town' ? bankedGold : runGold;
}

function changeShopGold(amount) {
  if (shopMode === 'town') bankedGold += amount;
  else runGold += amount;
}

function sellMonsterCrystals(requestedQty) {
  if (activeOverlay !== 'shop') return;
  const qty = Math.min(requestedQty, inventoryItemCount('monsterCrystal'));
  if (qty <= 0) return;
  consumeInventoryItem('monsterCrystal', qty);
  const gold = qty * SHOP_MONSTER_CRYSTAL_SELL_PRICE;
  changeShopGold(gold);
  resetShopIdleTimer();
  log(`賣出 ${qty} 顆魔物結晶，獲得 ${gold} 金幣`, 'good');
  render();
}

function buyShopItem(itemId) {
  if (activeOverlay !== 'shop') return;
  const offer = SHOP_ITEMS.find(entry => entry.itemId === itemId);
  if (!offer || shopGold() < offer.price) return;
  if (addInventoryItem(itemId, 1, shopMode === 'dungeon') <= 0) {
    log('背包已滿，無法購買', 'warn');
    return;
  }
  changeShopGold(-offer.price);
  resetShopIdleTimer();
  log(`購買 1 個${ITEM_DEFS[itemId].name}，花費 ${offer.price} 金幣`, 'good');
  render();
}

function openTownShop() {
  if (phase !== 'prepFloor' || partyLocked) return;
  closeOtherOverlays('shop');
  activeOverlay = 'shop';
  shopMode = 'town';
  shopAutoLeave = false;
  shopCountdown = 0;
  render();
}

function toggleShopAutoLeave() {
  if (activeOverlay !== 'shop' || shopMode !== 'dungeon') return;
  shopAutoLeave = !shopAutoLeave;
  shopCountdown = shopAutoLeave ? SHOP_IDLE_MS : 0;
  render();
}

function leaveShop(timedOut = false) {
  if (activeOverlay !== 'shop') return;
  activeOverlay = null;
  shopCountdown = 0;
  log(timedOut ? '商店逾時，自動離開' : `離開${shopMode === 'town' ? '城外' : '地城'}商店`);
  shopMode = null;
  render();
}

function combatItemTargets(action) {
  if (action.target === 'lowestHpParty') {
    return activeAliveMembers()
      .filter(c => c.curHp < c.maxHp)
      .sort((a, b) => (a.curHp / a.maxHp) - (b.curHp / b.maxHp))
      .slice(0, 1);
  }
  if (action.target === 'allParty') return activeAliveMembers();
  return [];
}

function grantHaste(target, mult, durationSeconds) {
  // Stronger/longer haste wins, so a short character skill cannot overwrite
  // and weaken an active 30-second speed potion.
  target.hasteMult = Math.min(target.hasteMult || 1, mult);
  target.hasteUntil = Math.max(target.hasteUntil || 0, durationSeconds * 1000);
}

function applyCombatItemEffect(effect, target) {
  if (effect.type === 'healMaxHpPct') {
    const amount = Math.max(1, Math.round(target.maxHp * effect.pct));
    const healed = Math.min(amount, target.maxHp - target.curHp);
    target.curHp += healed;
    popup(charEls[target.id] && charEls[target.id].portraitEl, '+' + healed, 'heal');
    log(`對 ${CHAR_DEFS[target.id].name} 使用治療藥水，恢復 ${healed} 生命`, 'good');
    return;
  }
  if (effect.type === 'haste') {
    grantHaste(target, effect.mult, effect.duration);
    popup(charEls[target.id] && charEls[target.id].portraitEl, 'SPEED UP', 'buff');
    log(`${CHAR_DEFS[target.id].name} 的攻速提升 ${Math.round((1 - effect.mult) * 100)}%，持續 ${effect.duration} 秒`, 'good');
  }
}

function canUseCombatItem(itemId) {
  const item = ITEM_DEFS[itemId];
  if (equippedCombatItemId !== itemId) return false;
  if (phase !== 'combat' || !item || !item.combatAction) return false;
  if ((combatItemCooldowns[itemId] || 0) > 0) return false;
  if (inventoryItemCount(itemId) <= 0) return false;
  return combatItemTargets(item.combatAction).length > 0;
}

function useCombatItem(itemId) {
  if (!canUseCombatItem(itemId)) return;
  const item = ITEM_DEFS[itemId];
  const targets = combatItemTargets(item.combatAction);
  if (!consumeInventoryItem(itemId, 1)) return;
  targets.forEach(target => item.combatAction.effects.forEach(effect => applyCombatItemEffect(effect, target)));
  combatItemCooldowns[itemId] = item.combatAction.cooldown * 1000;
  if (item.category === 'potion') {
    potionUseCount++;
    checkThresholdUnlocks();
    checkResonanceTriggers();
  }
  hideTooltip();
  render();
}

function canUseCharacterAction(characterId) {
  const c = roster.find(member => member.id === characterId);
  const action = CHAR_DEFS[characterId] && CHAR_DEFS[characterId].action;
  return phase === 'combat' && !!c && c.alive && !!action && !isCharacterActionLocked(c) && c.manualActionCd <= 0 && aliveMonsters().length > 0;
}

function isCharacterActionLocked(character) {
  return STATUS_DEFS.some(status => status.blocksCharacterAction && status.isActive(character));
}

function useCharacterAction(characterId) {
  if (!canUseCharacterAction(characterId)) return;
  const c = roster.find(member => member.id === characterId);
  const def = CHAR_DEFS[characterId];
  const action = def.action;
  c.manualActionCd = action.cooldown * 1000 * actionLineCooldownMult(c);
  if (action.type === 'randomSkill') {
    const skillIndex = Math.floor(Math.random() * def.skills.length);
    const skill = def.skills[skillIndex];
    const targets = aliveMonsters();
    const target = targets[Math.floor(Math.random() * targets.length)];
    log(`${def.name} 發動【${action.name}】！`, 'party');
    popup(charEls[characterId] && charEls[characterId].portraitEl, 'RANDOM', 'buff');
    performSkill(c, skill, skillIndex, target);
  } else if (action.type === 'selfBuffAtkDef') {
    // 小初「全力以赴」- 見 design.md「契約角色與解鎖」。跟技能線一樣用 'action' 這條
    // 強化線放大幅度（design.md 98：專屬操作本身有數值時比照技能線疊倍率），
    // 冷卻縮短則走 actionLineCooldownMult，兩者是各自獨立的加成。
    const scale = lineScale(c, 'action');
    partyBuff.mult = 1 + action.atkPct * scale;
    partyBuff.until = action.duration * 1000;
    partyDefense.bonus = Math.round(action.defAmount * scale);
    partyDefense.until = action.duration * 1000;
    log(`${def.name} 發動【${action.name}】，攻擊力與防禦力同時提升！`, 'party');
    showSkillCastEffect(charEls[characterId] && charEls[characterId].portraitEl, action);
    popup(charEls[characterId] && charEls[characterId].portraitEl, 'ATK/DEF UP', 'buff');
  }
  render();
}

function doWipeReset() {
  if (phase === 'defeat') return;
  phase = 'defeat';
  showDefeatOverlay();
}

function doRetreat() {
  log(`選擇撤退，本局 ${runGold} 金幣正式入袋！回家休息，全隊回滿血`, 'good');
  endRun(true);
}

function tick() {
  if (activeOverlay === 'shop' && shopMode === 'dungeon' && shopAutoLeave) {
    shopCountdown = Math.max(0, shopCountdown - MASTER_TICK_MS);
    if (shopCountdown <= 0) {
      leaveShop(true);
    } else {
      renderShopView();
    }
  }
  if (phase !== 'combat') return; // waiting on the player to confirm prepFloor/prepBoss

  Object.keys(combatItemCooldowns).forEach(itemId => {
    combatItemCooldowns[itemId] = Math.max(0, combatItemCooldowns[itemId] - MASTER_TICK_MS);
  });

  const alive = activeAliveMembers();

  if (alive.length === 0) {
    doWipeReset();
    render();
    return;
  }

  tickCharacters(alive);
  tickBuffs();
  tickMonsters();

  // centralized death sweep - catches monsters killed by attacks, skills, or
  // (via popGoo, which runs outside this loop on click) a goo pop.
  monsters.filter(m => m.alive && m.hp <= 0).forEach(m => onMonsterDefeated(m));

  render();
}

function tickCharacters(alive) {
  alive.forEach(c => {
    if (!c.alive) return;
    const skills = CHAR_DEFS[c.id].skills;
    c.skillCds = c.skillCds.map(cd => Math.max(0, cd - MASTER_TICK_MS));
    c.manualActionCd = Math.max(0, c.manualActionCd - MASTER_TICK_MS);

    if (c.hasteUntil > 0) {
      c.hasteUntil -= MASTER_TICK_MS;
      if (c.hasteUntil <= 0) {
        c.hasteMult = 1;
        log(`${CHAR_DEFS[c.id].name} 的加速效果結束`);
      }
    }
    if (c.dodgeUntil > 0) {
      c.dodgeUntil -= MASTER_TICK_MS;
      if (c.dodgeUntil <= 0) log(`${CHAR_DEFS[c.id].name} 的隱身效果結束`);
    }
    if (c.slowUntil > 0) {
      c.slowUntil -= MASTER_TICK_MS;
      if (c.slowUntil <= 0) {
        c.slowMult = 1;
        log(`${CHAR_DEFS[c.id].name} 的攻速恢復正常`);
      }
    }

    c.actionCountdown -= MASTER_TICK_MS;
    if (c.actionCountdown > 0) return; // not this character's turn yet
    c.actionCountdown += CHAR_DEFS[c.id].atkInterval * (c.hasteMult || 1) * (c.slowMult || 1) * speedLineIntervalMult(c);

    if (c.sleepUntilAction) {
      c.sleepUntilAction = false;
      log(`${CHAR_DEFS[c.id].name} 醒來了，但錯過了這次行動`, 'warn');
      popup(charEls[c.id].portraitEl, 'WAKE', 'buff');
      return;
    }
    if (c.charmedUntilAction) {
      c.charmedUntilAction = false;
      performCharmedAction(c);
      return;
    }

    const targets = aliveMonsters();
    if (targets.length === 0) return; // wave already cleared this tick

    const target = targets[Math.floor(Math.random() * targets.length)];
    let usedIdx = -1;
    for (let i = 0; i < skills.length; i++) {
      if (c.skillCds[i] <= 0) { usedIdx = i; break; }
    }
    if (usedIdx >= 0) {
      performSkill(c, skills[usedIdx], usedIdx, target);
    } else {
      const dmg = rollDamage(calcAtk(c));
      target.hp -= dmg;
      log(`${CHAR_DEFS[c.id].name} 普通攻擊 ${target.name}，造成 ${dmg} 傷害`, 'party');
      popup(monsterEls[target.id].portraitEl, '-' + dmg, 'dmg');
      flash(monsterEls[target.id].portraitEl);
    }
  });
}

function tickBuffs() {
  if (partyBuff.until > 0) {
    partyBuff.until -= MASTER_TICK_MS;
    if (partyBuff.until <= 0) {
      partyBuff.mult = 1;
      log('戰吼效果結束');
    }
  }

  if (partyDefense.until > 0) {
    partyDefense.until -= MASTER_TICK_MS;
    if (partyDefense.until <= 0) {
      partyDefense.bonus = 0;
      log('防禦提升效果結束');
    }
  }
}

function tickMonsters() {
  const boss = monsters.find(m => m.isBoss);
  if (boss && boss.alive) {
    gooTick(boss);
    bossSummonTick(boss);
  }

  aliveMonsters().forEach(m => {
    m.skillCd = Math.max(0, m.skillCd - MASTER_TICK_MS);

    m.actionCountdown -= MASTER_TICK_MS;
    if (m.actionCountdown > 0) return;
    m.actionCountdown += m.atkInterval;

    const stillAlive = activeAliveMembers();
    if (stillAlive.length === 0) return;
    const useSkill = m.skillCd <= 0;
    if (useSkill && performMonsterSkill(m)) return;

    const target = stillAlive[Math.floor(Math.random() * stillAlive.length)];
    if (target.dodgeUntil > 0) {
      log(`${m.name} 攻擊 ${CHAR_DEFS[target.id].name}，但被隱身閃避了！`, 'party');
      popup(charEls[target.id].portraitEl, 'MISS', 'buff');
      return;
    }
    const baseDmg = Math.max(1, m.atk - calcDef(target));
    const dmg = rollDamage(baseDmg);
    target.curHp -= dmg;
    log(`${m.name} 普通攻擊 ${CHAR_DEFS[target.id].name}，造成 ${dmg} 傷害`, 'enemy');
    popup(charEls[target.id].portraitEl, '-' + dmg, 'dmg');
    flash(charEls[target.id].portraitEl);
    if (target.curHp <= 0) {
      target.curHp = 0;
      target.alive = false;
      log(`${CHAR_DEFS[target.id].name} 倒下了！`, 'warn');
    }
  });
}

// solo mode (SOLO_PARTY_LIMIT === 1): picking a character always just swaps
// the single slot to them - no deselecting down to an empty party, no being
// blocked because "the slot is full". Multiplayer will need a real
// add/remove toggle again once SOLO_PARTY_LIMIT goes away.
function toggleParty(id) {
  if (phase === 'combat') return; // locked once the fight has started
  if (partyLocked) return; // locked for the whole run once you've entered the dungeon
  if (!isCharUnlocked(id)) return; // can't take a locked character into the dungeon
  if (party.includes(id)) return; // already the chosen one - clicking it again does nothing
  party = [id];
  render();
}
