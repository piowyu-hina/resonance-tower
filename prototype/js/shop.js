// Shop, inventory, and combat-item logic. Split out of combat.js because
// none of this is battle-tick logic - it manages the shared item backpack
// and the town/dungeon shop overlay (see design.md's shop/inventory flow).

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
  const gainedThisRun = runItemGains[itemId] || 0;
  runItemGains[itemId] = Math.max(0, gainedThisRun - removed);
  return removed === amount;
}

function addInventoryItem(itemId, amount = 1, trackRunGain = false) {
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

  // The unified item library has no capacity limit. Sixteen cells are shown
  // initially, then more stacks are appended only when they are needed.
  while (remaining > 0) {
    const added = Math.min(maxStack, remaining);
    inventory.push({ itemId, qty: added });
    remaining -= added;
  }

  const added = amount - remaining;
  if (trackRunGain && added > 0) runItemGains[itemId] = (runItemGains[itemId] || 0) + added;
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
  addInventoryItem(itemId, 1, shopMode === 'dungeon');
  changeShopGold(-offer.price);
  resetShopIdleTimer();
  log(`購買 1 個${ITEM_DEFS[itemId].name}，花費 ${offer.price} 金幣`, 'good');
  render();
}

function openTownShop() {
  if (phase !== PHASES.PREP_FLOOR || partyLocked) return;
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
  if (phase !== PHASES.COMBAT || !item || !item.combatAction) return false;
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

// Extracted from combat.js's tick(): the dungeon shop's auto-leave-on-idle
// countdown is independent of the COMBAT-only battle tick, so combat.js's
// tick() calls this first, every MASTER_TICK_MS, regardless of phase.
function tickShopIdle() {
  if (activeOverlay === 'shop' && shopMode === 'dungeon' && shopAutoLeave) {
    shopCountdown = Math.max(0, shopCountdown - MASTER_TICK_MS);
    if (shopCountdown <= 0) {
      leaveShop(true);
    } else {
      renderShopView();
    }
  }
}
