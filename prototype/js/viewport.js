// A nested viewport keeps CSS units, fixed overlays, media queries and pointer
// coordinates in one 1600×900 coordinate system. Resizing never reloads play.
const DESIGN_WIDTH = 1600;
const DESIGN_HEIGHT = 900;
const stage = document.getElementById('viewportStage');
const frame = document.getElementById('gameFrame');
function fitGame() {
  const scale = Math.min(stage.clientWidth / DESIGN_WIDTH, stage.clientHeight / DESIGN_HEIGHT);
  frame.style.setProperty('--game-scale', String(scale));
}
new ResizeObserver(fitGame).observe(stage);
fitGame();
const gameUrl = new URL('game.html', window.location.href);
gameUrl.search = window.location.search;
gameUrl.hash = window.location.hash;
frame.src = gameUrl.href;
