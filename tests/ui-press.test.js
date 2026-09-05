import assert from 'node:assert/strict';
import { attachHoldRepeat } from '../prototype/js/ui-press.js';

global.window = new EventTarget();
global.document = new EventTarget();
document.hidden = false;
const timers = new Map();
let sequence = 0;
global.setTimeout = fn => { timers.set(++sequence, fn); return sequence; };
global.clearTimeout = id => timers.delete(id);
class Button extends EventTarget {
  isConnected = true;
  disabled = false;
  visible = true;
  capture = null;
  checkVisibility() { return this.visible; }
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; }
}
function fire(el, name, extra = {}) {
  const event = new Event(name, { cancelable: true });
  Object.assign(event, { button: 0, pointerId: 1, isPrimary: true, detail: 1 }, extra);
  el.dispatchEvent(event);
}
function advance() {
  const pending = [...timers.entries()];
  pending.forEach(([id, fn]) => { if (timers.delete(id)) fn(); });
}

// Exhausting the final book on pointerdown must not start a new timer after stop.
{
  const button = new Button();
  let steps = 0, stops = 0;
  const dispose = attachHoldRepeat(button, () => { steps++; return false; }, () => stops++);
  fire(button, 'pointerdown');
  advance();
  assert.equal(steps, 1);
  assert.equal(stops, 1);
  assert.equal(timers.size, 0);
  fire(button, 'pointerup');
  assert.equal(stops, 1);
  dispose();
}
for (const cancel of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture', 'blur', 'hidden', 'detach', 'invisible', 'dispose']) {
  const button = new Button();
  let steps = 0, stops = 0;
  const dispose = attachHoldRepeat(button, () => { steps++; return true; }, () => stops++);
  fire(button, 'pointerdown');
  advance();
  assert.equal(steps, 2);
  if (cancel === 'blur') window.dispatchEvent(new Event('blur'));
  else if (cancel === 'hidden') { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); }
  else if (cancel === 'detach') button.isConnected = false;
  else if (cancel === 'invisible') button.visible = false;
  else if (cancel === 'dispose') dispose();
  else fire(button, cancel);
  advance();
  advance();
  assert.equal(steps, 2, cancel + ' stops spending');
  assert.equal(stops, cancel === 'dispose' ? 0 : 1, cancel + ' cleans up once');
  assert.equal(timers.size, 0);
  dispose();
  document.hidden = false;
}
{
  const button = new Button();
  let steps = 0;
  const dispose = attachHoldRepeat(button, () => { steps++; return true; });
  fire(button, 'click', { detail: 0 });
  assert.equal(steps, 1, 'keyboard click upgrades once');
  fire(button, 'click', { detail: 1 });
  assert.equal(steps, 1, 'pointer click is not a second upgrade');
  button.disabled = true;
  fire(button, 'pointerdown');
  fire(button, 'click', { detail: 0 });
  assert.equal(steps, 1);
  assert.equal(timers.size, 0);
  dispose();
}
console.log('ui-press.test.js: all repeat lifecycle assertions passed');
