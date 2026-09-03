function renderShopDialogue() {
  if (lastShopDialogueMode !== shopMode) {
    shopDialogueIndex = 0;
    lastShopDialogueMode = shopMode;
  }
  const lines = SHOP_DIALOGUE_KEYS[shopMode] || SHOP_DIALOGUE_KEYS.town;
  document.getElementById('shopDialogueText').textContent = t(lines[shopDialogueIndex % lines.length]);
}

function buildShopUI() {
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
    shopTab = 'buy';
    resetShopIdleTimer();
    renderShopView();
  });
  document.getElementById('shopSellTab').addEventListener('click', () => {
    shopTab = 'sell';
    resetShopIdleTimer();
    renderShopView();
  });
  document.querySelector('.shopKeeperPanel').addEventListener('click', () => {
    shopDialogueIndex += 1;
    renderShopDialogue();
  });
}

function renderShopView() {
  const shopOpen = activeOverlay === 'shop';
  const overlay = document.getElementById('shopOverlay');
  overlay.classList.toggle('open', shopOpen);
  overlay.setAttribute('aria-hidden', String(!shopOpen));
  if (!shopOpen) {
    wasShopOpen = false;
    return;
  }
  if (!wasShopOpen || lastShopTabMode !== shopMode) {
    shopTab = 'buy';
    lastShopTabMode = shopMode;
  }
  wasShopOpen = true;
  document.getElementById('shopTitle').textContent = t(shopMode === 'town' ? 'shop.town' : 'shop.dungeon');
  const shopWallet = document.getElementById('shopWallet');
  const shopCoinIcon = 'coin.png';
  shopWallet.innerHTML = `<img src="assets/item/${shopCoinIcon}" alt="">${shopGold()}`;
  const buyTab = document.getElementById('shopBuyTab');
  const sellTab = document.getElementById('shopSellTab');
  buyTab.classList.toggle('active', shopTab === 'buy');
  sellTab.classList.toggle('active', shopTab === 'sell');
  buyTab.setAttribute('aria-selected', String(shopTab === 'buy'));
  sellTab.setAttribute('aria-selected', String(shopTab === 'sell'));
  document.getElementById('shopBuySection').hidden = shopTab !== 'buy';
  document.getElementById('shopSellSection').hidden = shopTab !== 'sell';
  renderShopDialogue();
  document.getElementById('shopCountdown').textContent = shopMode === 'town'
    ? ''
    : (shopAutoLeave
      ? t('shop.autoLeaveIn', { seconds: formatLocaleNumber(Math.ceil(shopCountdown / 1000)) })
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
  autoLeaveBtn.style.display = shopMode === 'dungeon' ? '' : 'none';
  autoLeaveBtn.textContent = t(shopAutoLeave ? 'shop.disableCountdown' : 'shop.enableCountdown');
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

function attachInventoryDrag(slot, index) {
  slot.addEventListener('dragstart', e => {
    if (!inventory[index]) {
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
    [inventory[inventoryDragFrom], inventory[index]] = [inventory[index], inventory[inventoryDragFrom]];
    inventoryDragFrom = null;
    renderInventory();
  });
  slot.addEventListener('dragend', () => {
    inventoryDragFrom = null;
    document.querySelectorAll('.inventorySlot').forEach(el => el.classList.remove('dragging', 'dragTarget'));
  });
}

function renderItemGrid(grid) {
  grid.innerHTML = '';
  inventory.forEach((entry, index) => {
    const slot = document.createElement('div');
    slot.className = `inventorySlot${entry ? '' : ' empty'}`;
    slot.dataset.slotIndex = index;
    slot.draggable = !!entry;
    grid.appendChild(slot);
    attachInventoryDrag(slot, index);

    if (!entry) return;
    const item = localizedItemDef(entry.itemId);
    if (!item || entry.qty <= 0) return;
    slot.innerHTML = `
      <img src="assets/item/${item.img}.png" alt="${item.name}" draggable="false">
      <span class="inventoryQty">×${entry.qty}</span>
      <span class="inventoryItemName">${item.name}</span>
    `;
    if (entry.itemId !== 'coin') attachItemTooltip(slot, item, entry);
  });
}

function syncCoinItem() {
  const coinEntries = [];
  inventory.forEach((entry, index) => {
    if (entry && entry.itemId === 'coin') coinEntries.push(index);
  });
  if (bankedGold <= 0) {
    coinEntries.forEach(index => { inventory[index] = null; });
    return;
  }
  if (coinEntries.length > 0) {
    inventory[coinEntries[0]].qty = bankedGold;
    coinEntries.slice(1).forEach(index => { inventory[index] = null; });
    return;
  }
  const emptyIndex = inventory.findIndex(entry => !entry);
  if (emptyIndex >= 0) inventory[emptyIndex] = { itemId: 'coin', qty: bankedGold };
  else inventory.push({ itemId: 'coin', qty: bankedGold });
}

function renderInventory() {
  syncCoinItem();
  document.getElementById('inventoryTitle').textContent = t('inventory.title');
  renderItemGrid(document.getElementById('inventoryGrid'));
}

function setInventoryOpen(open) {
  if (open) closeOtherOverlays('inventory');
  activeOverlay = open ? 'inventory' : (activeOverlay === 'inventory' ? null : activeOverlay);
  const overlay = document.getElementById('inventoryOverlay');
  overlay.classList.toggle('open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  hideTooltip();
  if (open) renderInventory();
}
