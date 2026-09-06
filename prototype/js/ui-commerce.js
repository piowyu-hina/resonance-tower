import { SHOP_ITEMS, localizedItemDef, SHOP_MONSTER_CRYSTAL_SELL_PRICE } from './constants.js';
import { gameState } from './state.js';
import { t, formatLocaleNumber } from './i18n.js';
import { shopUiState, SHOP_DIALOGUE_KEYS } from './ui-character.js';
import { buyShopItem, sellMonsterCrystals, toggleShopAutoLeave, leaveShop, resetShopIdleTimer, shopGold } from './shop.js';
import { attachItemTooltip, itemTooltipHTML, inventoryItemCount, hideTooltip } from './ui-loadout.js';
import { closeOtherOverlays } from './ui-overlays.js';

// Drag-reorder state for the inventory grid - purely a UI concern local to
// this file's drag handlers, not shared game state.
let inventoryDragFrom = null;
let inventorySelectedItem = null;

function showInventoryDetail(entry) {
  const detail = document.getElementById('inventoryDetail');
  const item = entry && localizedItemDef(entry.itemId);
  inventorySelectedItem = item ? entry.itemId : null;
  document.querySelectorAll('#inventoryGrid .inventorySlot').forEach(slot => {
    const selected = !!item && slot.dataset.itemId === entry.itemId;
    slot.classList.toggle('selected', selected);
    if (slot.hasAttribute('role')) slot.setAttribute('aria-pressed', String(selected));
  });
  detail.innerHTML = item
    ? `<img class="inventoryDetailArt" src="assets/item/${item.img}.png" alt="">${itemTooltipHTML(item, entry)}`
    : `<img class="inventoryDetailArt emptyBagArt" src="assets/ui/bag.png" alt=""><p>${t('inventory.empty')}</p>`;
}

export function renderShopDialogue() {
  if (shopUiState.lastShopDialogueMode !== gameState.shopMode) {
    shopUiState.shopDialogueIndex = 0;
    shopUiState.lastShopDialogueMode = gameState.shopMode;
  }
  const lines = SHOP_DIALOGUE_KEYS[gameState.shopMode] || SHOP_DIALOGUE_KEYS.town;
  document.getElementById('shopDialogueText').textContent = t(lines[shopUiState.shopDialogueIndex % lines.length]);
}

export function buildShopUI() {
  const buyList = document.getElementById('shopBuyList');
  SHOP_ITEMS.forEach(offer => {
    const item = localizedItemDef(offer.itemId);
    const row = document.createElement('div');
    row.className = 'shopBuyRow';
    row.dataset.itemId = offer.itemId;
    row.innerHTML = `
      <img src="assets/item/${item.img}.png" alt="${item.name}">
      <span class="shopItemCopy"><b class="shopItemName">${item.name}</b><small>${item.desc}</small></span>
      <span class="shopOwned"></span>
      <button type="button"><span>${offer.price}</span> 金幣</button>
    `;
    row.querySelector('button').addEventListener('click', () => buyShopItem(offer.itemId));
    attachItemTooltip(row.querySelector('img'), item, { qty: inventoryItemCount(offer.itemId) });
    buyList.appendChild(row);
  });
  document.getElementById('shopSellOneBtn').addEventListener('click', () => sellMonsterCrystals(1));
  document.getElementById('shopSellAllBtn').addEventListener('click', () => sellMonsterCrystals(inventoryItemCount('monsterCrystal')));
  document.getElementById('shopAutoLeaveBtn').addEventListener('click', toggleShopAutoLeave);
  document.getElementById('shopLeaveBtn').addEventListener('click', () => leaveShop(false));
  document.getElementById('shopOverlay').addEventListener('click', event => {
    if (event.target.id === 'shopOverlay') leaveShop(false);
  });
  document.getElementById('shopBuyTab').addEventListener('click', () => {
    shopUiState.shopTab = 'buy';
    resetShopIdleTimer();
    renderShopView();
  });
  document.getElementById('shopSellTab').addEventListener('click', () => {
    shopUiState.shopTab = 'sell';
    resetShopIdleTimer();
    renderShopView();
  });
  for (const element of document.querySelectorAll('.shopKeeperArt, #shopDialogue')) {
    element.addEventListener('click', () => {
      shopUiState.shopDialogueIndex += 1;
      resetShopIdleTimer();
      renderShopDialogue();
    });
  }
  const tabs = [document.getElementById('shopBuyTab'), document.getElementById('shopSellTab')];
  tabs.forEach((tab, index) => tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
    tabs[next].click();
    tabs[next].focus();
  }));
}

export function renderShopView() {
  const shopOpen = gameState.activeOverlay === 'shop';
  const overlay = document.getElementById('shopOverlay');
  overlay.classList.toggle('open', shopOpen);
  overlay.setAttribute('aria-hidden', String(!shopOpen));
  if (!shopOpen) {
    shopUiState.wasShopOpen = false;
    return;
  }
  if (!shopUiState.wasShopOpen || shopUiState.lastShopTabMode !== gameState.shopMode) {
    shopUiState.shopTab = 'buy';
    shopUiState.lastShopTabMode = gameState.shopMode;
  }
  shopUiState.wasShopOpen = true;
  document.getElementById('shopTitle').textContent = t(gameState.shopMode === 'town' ? 'shop.town' : 'shop.dungeon');
  const shopWallet = document.getElementById('shopWallet');
  const shopCoinIcon = 'coin.png';
  shopWallet.innerHTML = `<img src="assets/item/${shopCoinIcon}" alt="">${shopGold()}`;
  const buyTab = document.getElementById('shopBuyTab');
  const sellTab = document.getElementById('shopSellTab');
  buyTab.classList.toggle('active', shopUiState.shopTab === 'buy');
  sellTab.classList.toggle('active', shopUiState.shopTab === 'sell');
  buyTab.setAttribute('aria-selected', String(shopUiState.shopTab === 'buy'));
  sellTab.setAttribute('aria-selected', String(shopUiState.shopTab === 'sell'));
  buyTab.tabIndex = shopUiState.shopTab === 'buy' ? 0 : -1;
  sellTab.tabIndex = shopUiState.shopTab === 'sell' ? 0 : -1;
  document.getElementById('shopBuySection').hidden = shopUiState.shopTab !== 'buy';
  document.getElementById('shopSellSection').hidden = shopUiState.shopTab !== 'sell';
  renderShopDialogue();
  document.getElementById('shopCountdown').textContent = gameState.shopMode === 'town'
    ? ''
    : (gameState.shopAutoLeave
      ? t('shop.autoLeaveIn', { seconds: formatLocaleNumber(Math.ceil(gameState.shopCountdown / 1000)) })
      : t('shop.autoLeaveOff'));
  const crystalQty = inventoryItemCount('monsterCrystal');
  document.getElementById('shopMonsterCrystalQty').textContent = t('shop.owned', {
    quantity: formatLocaleNumber(crystalQty),
  });
  const sellBtn = document.getElementById('shopSellAllBtn');
  sellBtn.textContent = crystalQty > 0
    ? t('shop.sellAll', { gold: formatLocaleNumber(crystalQty * SHOP_MONSTER_CRYSTAL_SELL_PRICE) })
    : t('shop.nothingToSell');
  sellBtn.disabled = crystalQty <= 0;
  const sellOneBtn = document.getElementById('shopSellOneBtn');
  sellOneBtn.innerHTML = `<img class="shopPriceCoin" src="assets/item/${shopCoinIcon}" alt="">${SHOP_MONSTER_CRYSTAL_SELL_PRICE}`;
  sellOneBtn.disabled = crystalQty <= 0;
  const autoLeaveBtn = document.getElementById('shopAutoLeaveBtn');
  autoLeaveBtn.style.display = gameState.shopMode === 'dungeon' ? '' : 'none';
  autoLeaveBtn.textContent = t(gameState.shopAutoLeave ? 'shop.disableCountdown' : 'shop.enableCountdown');
  SHOP_ITEMS.forEach(offer => {
    const row = document.querySelector(`.shopBuyRow[data-item-id="${offer.itemId}"]`);
    const item = localizedItemDef(offer.itemId);
    row.querySelector('img').alt = item.name;
    row.querySelector('.shopItemName').textContent = item.name;
    row.querySelector('.shopItemCopy small').textContent = item.desc;
    row.querySelector('.shopOwned').textContent = t('shop.owned', {
      quantity: formatLocaleNumber(inventoryItemCount(offer.itemId)),
    });
    const buyBtn = row.querySelector('button');
    buyBtn.innerHTML = `<img class="shopPriceCoin" src="assets/item/${shopCoinIcon}" alt="">${offer.price}`;
    buyBtn.disabled = shopGold() < offer.price;
  });
}

export function attachInventoryDrag(slot, index) {
  slot.addEventListener('dragstart', e => {
    if (!gameState.inventory[index]) {
      e.preventDefault();
      return;
    }
    inventoryDragFrom = index;
    slot.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    hideTooltip();
  });
  slot.addEventListener('dragover', e => {
    if (inventoryDragFrom === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    slot.classList.add('dragTarget');
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('dragTarget'));
  slot.addEventListener('drop', e => {
    e.preventDefault();
    slot.classList.remove('dragTarget');
    if (inventoryDragFrom === null) return;
    if (inventoryDragFrom === index) return;
    [gameState.inventory[inventoryDragFrom], gameState.inventory[index]] = [gameState.inventory[index], gameState.inventory[inventoryDragFrom]];
    inventoryDragFrom = null;
    renderInventory();
  });
  slot.addEventListener('dragend', () => {
    inventoryDragFrom = null;
    document.querySelectorAll('.inventorySlot').forEach(el => el.classList.remove('dragging', 'dragTarget'));
  });
}

export function renderItemGrid(grid) {
  grid.innerHTML = '';
  gameState.inventory.forEach((entry, index) => {
    const slot = document.createElement('div');
    slot.className = `inventorySlot${entry ? '' : ' empty'}`;
    slot.dataset.slotIndex = index;
    slot.draggable = !!entry;
    grid.appendChild(slot);
    attachInventoryDrag(slot, index);

    if (!entry) return;
    const item = localizedItemDef(entry.itemId);
    if (!item || entry.qty <= 0) return;
    slot.dataset.itemId = entry.itemId;
    slot.tabIndex = 0;
    slot.setAttribute('role', 'button');
    slot.setAttribute('aria-label', `${item.name} ×${entry.qty}`);
    slot.addEventListener('click', () => showInventoryDetail(entry));
    slot.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        showInventoryDetail(entry);
      }
    });
    slot.innerHTML = `
      <img src="assets/item/${item.img}.png" alt="${item.name}" draggable="false">
      <span class="inventoryQty">×${entry.qty}</span>
      <span class="inventoryItemName">${item.name}</span>
    `;
  });
}

export function syncCoinItem() {
  const coinEntries = [];
  gameState.inventory.forEach((entry, index) => {
    if (entry && entry.itemId === 'coin') coinEntries.push(index);
  });
  if (gameState.bankedGold <= 0) {
    coinEntries.forEach(index => { gameState.inventory[index] = null; });
    return;
  }
  if (coinEntries.length > 0) {
    gameState.inventory[coinEntries[0]].qty = gameState.bankedGold;
    coinEntries.slice(1).forEach(index => { gameState.inventory[index] = null; });
    return;
  }
  const emptyIndex = gameState.inventory.findIndex(entry => !entry);
  if (emptyIndex >= 0) gameState.inventory[emptyIndex] = { itemId: 'coin', qty: gameState.bankedGold };
  else gameState.inventory.push({ itemId: 'coin', qty: gameState.bankedGold });
}

export function renderInventory() {
  syncCoinItem();
  document.getElementById('inventoryTitle').textContent = t('inventory.title');
  renderItemGrid(document.getElementById('inventoryGrid'));
  const entries = gameState.inventory.filter(entry => entry && entry.qty > 0 && localizedItemDef(entry.itemId));
  showInventoryDetail(entries.find(entry => entry.itemId === inventorySelectedItem) || entries[0]);
}

export function setInventoryOpen(open) {
  if (open) closeOtherOverlays('inventory');
  gameState.activeOverlay = open ? 'inventory' : (gameState.activeOverlay === 'inventory' ? null : gameState.activeOverlay);
  const overlay = document.getElementById('inventoryOverlay');
  overlay.classList.toggle('open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  hideTooltip();
  if (open) renderInventory();
}
