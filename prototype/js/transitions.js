// Shared lifecycle for finite UI animations and timed screen transitions.
// A new run with the same key cancels every timer/listener from the old run,
// preventing late callbacks from mutating a newer screen.
const managedTransitions = new Map();
const transientAnimationRuns = new WeakMap();

function afterAnimationPaint(callback) {
  requestAnimationFrame(() => requestAnimationFrame(callback));
}

function beginManagedTransition(key) {
  managedTransitions.get(key)?.cancel();
  let active = true;
  const cleanups = new Set();

  const transition = {
    get active() { return active; },
    after(delayMs, callback) {
      let timerId = null;
      const dispose = () => clearTimeout(timerId);
      timerId = setTimeout(() => {
        cleanups.delete(dispose);
        if (active) callback();
      }, delayMs);
      cleanups.add(dispose);
      return transition;
    },
    listen(element, eventName, callback) {
      const listener = event => {
        if (active) callback(event);
      };
      const dispose = () => element.removeEventListener(eventName, listener);
      element.addEventListener(eventName, listener);
      cleanups.add(dispose);
      return transition;
    },
    finish(callback) {
      if (!active) return false;
      active = false;
      cleanups.forEach(dispose => dispose());
      cleanups.clear();
      if (managedTransitions.get(key) === transition) managedTransitions.delete(key);
      if (callback) callback();
      return true;
    },
    cancel() {
      return transition.finish();
    },
  };

  managedTransitions.set(key, transition);
  return transition;
}

function playTransientAnimation(element, className) {
  if (!element) return;
  let elementRuns = transientAnimationRuns.get(element);
  if (!elementRuns) {
    elementRuns = new Map();
    transientAnimationRuns.set(element, elementRuns);
  }
  elementRuns.get(className)?.cancel();
  const transition = beginManagedTransition({ element, className });
  elementRuns.set(className, transition);
  const cleanup = () => transition.finish(() => {
    element.classList.remove(className);
    if (elementRuns.get(className) === transition) elementRuns.delete(className);
  });

  element.classList.remove(className);
  void element.offsetWidth;
  transition.listen(element, 'animationend', event => {
    if (event.target === element) afterAnimationPaint(cleanup);
  });
  element.classList.add(className);
  // Hidden tabs and display changes may suppress animationend. All current
  // transient animations are <= .35s, so this fallback cannot cut one off.
  transition.after(600, cleanup);
}

function removeAfterAnimation(element, fallbackMs) {
  if (!element) return;
  const transition = beginManagedTransition(element);
  const remove = () => transition.finish(() => element.remove());
  transition.listen(element, 'animationend', event => {
    if (event.target === element) afterAnimationPaint(remove);
  });
  transition.after(fallbackMs, remove);
}
