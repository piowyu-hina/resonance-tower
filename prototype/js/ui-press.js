// A repeat owns one cancellable timeout, never a free-running interval.
// The disposer is called before replacing the button or closing its panel.
export function attachHoldRepeat(el, step, onStop = () => {}) {
  let timer = null;
  let active = false;
  let pointerId = null;
  const stop = (notify = true) => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const wasActive = active;
    active = false;
    window.removeEventListener('blur', blur);
    document.removeEventListener('visibilitychange', visibility);
    if (pointerId !== null && el.hasPointerCapture?.(pointerId)) el.releasePointerCapture(pointerId);
    pointerId = null;
    if (wasActive && notify) onStop();
  };
  const blur = () => stop();
  const visibility = () => { if (document.hidden) stop(); };
  const run = () => {
    timer = null;
    if (!active) return;
    if (!el.isConnected || el.disabled || (el.checkVisibility && !el.checkVisibility())) return stop();
    if (!step()) return stop();
    if (active) timer = setTimeout(run, 90);
  };
  const down = event => {
    if (event.button !== 0 || event.isPrimary === false || active || el.disabled) return;
    event.preventDefault();
    active = true;
    pointerId = event.pointerId;
    el.setPointerCapture?.(pointerId);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    run();
  };
  const up = () => stop();
  // Native keyboard/screen-reader activation has no pointerdown. Upgrade
  // once per click; pointer clicks have already been handled by the hold.
  const click = event => {
    if (event.detail !== 0 || active || el.disabled || !el.isConnected) return;
    step();
    onStop();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('click', click);
  const endings = ['pointerup', 'pointerleave', 'pointercancel', 'lostpointercapture'];
  endings.forEach(name => el.addEventListener(name, up));
  return () => {
    stop(false);
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('click', click);
    endings.forEach(name => el.removeEventListener(name, up));
  };
}
