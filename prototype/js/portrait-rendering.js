// Share display-resolution rasterization across portrait overlays. Keep scene
// scaling unchanged and do not reset the mode when another overlay remains open.
const overlays = ['shopOverlay', 'characterDetailOverlay', 'dialogueOverlay']
  .map(id => document.getElementById(id)).filter(Boolean);
function syncPortraitRendering() {
  const open = overlays.some(el => el.getAttribute('aria-hidden') === 'false');
  try {
    if (window.parent !== window && window.parent.document.getElementById('gameFrame')?.contentWindow === window) {
      window.parent.document.documentElement.classList.toggle('portraitRasterMode', open);
    }
  } catch { /* Cross-origin hosts own their rendering; direct game.html is unchanged. */ }
}
const observer = new MutationObserver(syncPortraitRendering);
for (const overlay of overlays) observer.observe(overlay, {attributes:true, attributeFilter:['aria-hidden']});
syncPortraitRendering();
