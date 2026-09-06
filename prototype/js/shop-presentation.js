// Presentation only: observe successful synchronous transactions, never alter balances.
import { shopGold } from './shop.js';
import { gameState } from './state.js';
import { localizedItemDef } from './constants.js';

const modal = document.getElementById('shopModal');
const receipt = document.createElement('div');
receipt.className = 'shopReceipt';
receipt.setAttribute('role', 'status');
receipt.setAttribute('aria-live', 'polite');
receipt.hidden = true;
modal.append(receipt);
let receiptTimer;
const balancesBeforeClick = new WeakMap();
document.getElementById('shopOverlay').addEventListener('click', event => {
  if (gameState.activeOverlay === 'shop') balancesBeforeClick.set(event, shopGold());
}, true);
function clearReceipt() {
  clearTimeout(receiptTimer);
  receipt.hidden = true;
  receipt.textContent = '';
}
function animate(element, frames, duration) {
  if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  element.getAnimations().forEach(animation => animation.cancel());
  element.animate(frames, { duration, easing: 'ease-out' });
}
document.getElementById('shopOverlay').addEventListener('click', event => {
  const target = event.target.closest('button');
  if (target?.id === 'shopLeaveBtn' || event.target.id === 'shopOverlay') clearReceipt();
  if (target?.matches('.shopKeeperArt, #shopDialogue')) {
    animate(document.querySelector('.shopKeeperArt img'), [{transform:'rotate(0deg)'}, {transform:'rotate(-1deg) translateY(-3px)'}, {transform:'rotate(0deg)'}], 420);
  }
  if (!target || gameState.activeOverlay !== 'shop') return;
  const row = target.closest('.shopBuyRow');
  const selling = target.matches('#shopSellOneBtn, #shopSellAllBtn');
  if (!row && !selling) return;
  const before = balancesBeforeClick.get(event);
  if (before === undefined) return;
  queueMicrotask(() => {
    if (gameState.activeOverlay !== 'shop') return;
    const delta = shopGold() - before;
    if (!delta) return;
    clearReceipt();
    if (row) receipt.textContent = `${localizedItemDef(row.dataset.itemId).name} +1`;
    else {
      const coin = document.createElement('img');
      coin.src = 'assets/item/coin.png';
      coin.alt = '';
      coin.width = 24;
      coin.height = 24;
      receipt.append(coin, ` +${delta}`);
    }
    receipt.hidden = false;
    animate(receipt, [{opacity:0, transform:'translateY(8px)'}, {opacity:1, transform:'translateY(0)'}], 220);
    animate(document.getElementById('shopWallet'), [{transform:'scale(1)'}, {transform:'scale(1.08)'}, {transform:'scale(1)'}], 360);
    if (row) animate(row.querySelector('img'), [{transform:'translateY(0)'}, {transform:'translateY(-8px)'}, {transform:'translateY(0)'}], 380);
    receiptTimer = setTimeout(clearReceipt, 2000);
  });
});
new MutationObserver(() => {
  if (document.getElementById('shopOverlay').getAttribute('aria-hidden') === 'true') clearReceipt();
}).observe(document.getElementById('shopOverlay'), {attributes:true, attributeFilter:['aria-hidden']});
