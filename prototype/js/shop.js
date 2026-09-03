import { ITEM_DEFS, SHOP_MONSTER_CRYSTAL_SELL_PRICE, SHOP_ITEMS, SHOP_IDLE_MS, CHAR_DEFS, MASTER_TICK_MS } from './constants.js';
import { gameState, log, PHASES, activeAliveMembers, checkThresholdUnlocks, checkResonanceTriggers } from './state.js';
import { inventoryItemCount, hideTooltip } from './ui-loadout.js';
import { closeOtherOverlays, popup } from './ui-overlays.js';
import { renderInventory, renderShopView } from './ui-commerce.js';
import { render } from './ui-main.js';
import { grantHaste } from './combat.js';

// Shop, inventory, and combat-item logic. Split out of combat.js because
// none of this is battle-tick logic - it manages the shared item backpack
// and the town/dungeon shop overlay (see design.md's shop/inventory flow).

export function removeInventoryItemQuantity(itemId, amount) {
  let remaining = amount;
  for (let index = 0; index < gameState.inventory.length && remaining > 0; index++) {
    const entry = gameState.inventory[index];
    if (!entry || entry.itemId !== itemId) continue;
    const used = Math.min(entry.qty, remaining);
    entry.qty -= used;
    remaining -= used;
    if (entry.qty <= 0) gameState.inventory[index] = null;
  }
  return amount - remaining;
}

export function consumeInventoryItem(itemId, amount = 1) {
  if (inventoryItemCount(itemId) < amount) return false;
  const removed = removeInventoryItemQuantity(itemId, amount);
  const gainedThisRun = gameState.runItemGains[itemId] || 0;
  gameState.runItemGains[itemId] = Math.max(0, gainedThisRun - removed);
  return removed === amount;
}

export function addInventoryItem(itemId, amount = 1, trackRunGain = false) {
  const item = ITEM_DEFS[itemId];
  if (!item || amount <= 0) return 0;
  const maxStack = item.maxStack || 99;
  let remaining = amount;

  gameState.inventory.forEach(entry => {
    if (!entry || entry.itemId !== itemId || entry.qty >= maxStack || remaining <= 0) return;
    const added = Math.min(maxStack - entry.qty, remaining);
    entry.qty += added;
    remaining -= added;
  });
  for (let index = 0; index < gameState.inventory.length && remaining > 0; index++) {
    if (gameState.inventory[index]) continue;
    const added = Math.min(maxStack, remaining);
    gameState.inventory[index] = { itemId, qty: added };
    remaining -= added;
  }

  // The unified item library has no capacity limit. Sixteen cells are shown
  // initially, then more stacks are appended only when they are needed.
  while (remaining > 0) {
    const added = Math.min(maxStack, remaining);
    gameState.inventory.push({ itemId, qty: added });
    remaining -= added;
  }

  const added = amount - remaining;
  if (trackRunGain && added > 0) gameState.runItemGains[itemId] = (gameState.runItemGains[itemId] || 0) + added;
  const overlay = document.getElementById('inventoryOverlay');
  if (overlay && overlay.classList.contains('open')) renderInventory();
  return added;
}

export function resetShopIdleTimer() {
  if (gameState.shopMode === 'dungeon' && gameState.shopAutoLeave) gameState.shopCountdown = SHOP_IDLE_MS;
}

export function shopGold() {
  return gameState.shopMode === 'town' ? gameState.bankedGold : gameState.runGold;
}

export function changeShopGold(amount) {
  if (gameState.shopMode === 'town') gameState.bankedGold += amount;
  else gameState.runGold += amount;
}

export function sellMonsterCrystals(requestedQty) {
  if (gameState.activeOverlay !== 'shop') return;
  const qty = Math.min(requestedQty, inventoryItemCount('monsterCrystal'));
  if (qty <= 0) return;
  consumeInventoryItem('monsterCrystal', qty);
  const gold = qty * SHOP_MONSTER_CRYSTAL_SELL_PRICE;
  changeShopGold(gold);
  resetShopIdleTimer();
  log(`賣出 ${qty} 顆魔物結晶，獲得 ${gold} 金幣`, 'good');
  render();
}

export function buyShopItem(itemId) {
  if (gameState.activeOverlay !== 'shop') return;
  const offer = SHOP_ITEMS.find(entry => entry.itemId === itemId);
  if (!offer || shopGold() < offer.price) return;
  addInventoryItem(itemId, 1, gameState.shopMode === 'dungeon');
  changeShopGold(-offer.price);
  resetShopIdleTimer();
  log(`購買 1 個${ITEM_DEFS[itemId].name}，花費 ${offer.price} 金幣`, 'good');
  render();
}

export function openTownShop() {
  if (gameState.phase !== PHASES.PREP_FLOOR || gameState.partyLocked) return;
  closeOtherOverlays('shop');
  gameState.activeOverlay = 'shop';
  gameState.shopMode = 'town';
  gameState.shopAutoLeave = false;
  gameState.shopCountdown = 0;
  render();
}

export function toggleShopAutoLeave() {
  if (gameState.activeOverlay !== 'shop' || gameState.shopMode !== 'dungeon') return;
  gameState.shopAutoLeave = !gameState.shopAutoLeave;
  gameState.shopCountdown = gameState.shopAutoLeave ? SHOP_IDLE_MS : 0;
  render();
}

export function leaveShop(timedOut = false) {
  if (gameState.activeOverlay !== 'shop') return;
  gameState.activeOverlay = null;
  gameState.shopCountdown = 0;
  log(timedOut ? '商店逾時，自動離開' : `離開${gameState.shopMode === 'town' ? '城外' : '地城'}商店`);
  gameState.shopMode = null;
  render();
}

export function combatItemTargets(action) {
  if (action.target === 'lowestHpParty') {
    return activeAliveMembers()
      .filter(c => c.curHp < c.maxHp)
      .sort((a, b) => (a.curHp / a.maxHp) - (b.curHp / b.maxHp))
      .slice(0, 1);
  }
  if (action.target === 'allParty') return activeAliveMembers();
  return [];
}

export function applyCombatItemEffect(effect, target) {
  if (effect.type === 'healMaxHpPct') {
    const amount = Math.max(1, Math.round(target.maxHp * effect.pct));
    const healed = Math.min(amount, target.maxHp - target.curHp);
    target.curHp += healed;
    popup(gameState.charEls[target.id] && gameState.charEls[target.id].portraitEl, '+' + healed, 'heal');
    log(`對 ${CHAR_DEFS[target.id].name} 使用治療藥水，恢復 ${healed} 生命`, 'good');
    return;
  }
  if (effect.type === 'haste') {
    grantHaste(target, effect.mult, effect.duration);
    popup(gameState.charEls[target.id] && gameState.charEls[target.id].portraitEl, 'SPEED UP', 'buff');
    log(`${CHAR_DEFS[target.id].name} 的攻速提升 ${Math.round((1 - effect.mult) * 100)}%，持續 ${effect.duration} 秒`, 'good');
  }
}

export function canUseCombatItem(itemId) {
  const item = ITEM_DEFS[itemId];
  if (gameState.equippedCombatItemId !== itemId) return false;
  if (gameState.phase !== PHASES.COMBAT || !item || !item.combatAction) return false;
  if ((gameState.combatItemCooldowns[itemId] || 0) > 0) return false;
  if (inventoryItemCount(itemId) <= 0) return false;
  return combatItemTargets(item.combatAction).length > 0;
}

export function useCombatItem(itemId) {
  if (!canUseCombatItem(itemId)) return;
  const item = ITEM_DEFS[itemId];
  const targets = combatItemTargets(item.combatAction);
  if (!consumeInventoryItem(itemId, 1)) return;
  targets.forEach(target => item.combatAction.effects.forEach(effect => applyCombatItemEffect(effect, target)));
  gameState.combatItemCooldowns[itemId] = item.combatAction.cooldown * 1000;
  if (item.category === 'potion') {
    gameState.potionUseCount++;
    checkThresholdUnlocks();
    checkResonanceTriggers();
  }
  hideTooltip();
  render();
}

// Extracted from combat.js's tick(): the dungeon shop's auto-leave-on-idle
// countdown is independent of the COMBAT-only battle tick, so combat.js's
// tick() calls this first, every MASTER_TICK_MS, regardless of phase.
export function tickShopIdle() {
  if (gameState.activeOverlay === 'shop' && gameState.shopMode === 'dungeon' && gameState.shopAutoLeave) {
    gameState.shopCountdown = Math.max(0, gameState.shopCountdown - MASTER_TICK_MS);
    if (gameState.shopCountdown <= 0) {
      leaveShop(true);
    } else {
      renderShopView();
    }
  }
}
