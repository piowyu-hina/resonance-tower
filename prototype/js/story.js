// --- 對話系統 (見 worldview_design.md 靈魂任務) ---
// A dialogue "script" is an ordered array of { speaker, text } lines.
// `speaker` is a CHAR_DEFS id, so existing character full-art assets
// (`<id>_full.png`, already used by the 角色詳情 modal) double as dialogue
// portraits - no separate expression/portrait asset scheme needed yet.
//
// Content below is placeholder wiring to prove out the trigger -> dialogue ->
// unlock flow described in worldview_design_v2.md. Real script comes later
// (小初's actual contract story is still "再討論") - don't treat this text as
// final, and note it deliberately avoids any death/loss language per v2's
// scoped-down 死亡議題 rule for character-unlock content specifically.
const DIALOGUE_DEFS = {
  xiaochu_contract_placeholder: [
    { speaker: 'wuming', text: '……這附近怎麼有股奇怪的氣息？' },
    { speaker: 'xiaochu', text: '你看得到我？太好了，終於有人能看到我了！' },
    { speaker: 'xiaochu', text: '（暫定對話，正式契約劇情待補——見 worldview_design_v2.md）' },
  ],
};

// Dialogues can be queued (queueDialogue) rather than started immediately, so
// a trigger firing while another dialogue is already on screen doesn't get
// lost or clobber the one in progress - it just plays right after.
let dialogueQueue = [];
let dialogueScript = null;
let dialogueLineIndex = 0;
let dialogueOnDone = null;

function queueDialogue(scriptId, onDone = null) {
  if (!DIALOGUE_DEFS[scriptId]) return;
  dialogueQueue.push({ scriptId, onDone });
  if (activeOverlay !== 'dialogue') playNextQueuedDialogue();
}

function playNextQueuedDialogue() {
  if (dialogueQueue.length === 0) return;
  const next = dialogueQueue.shift();
  startDialogue(next.scriptId, next.onDone);
}

function startDialogue(scriptId, onDone) {
  const script = DIALOGUE_DEFS[scriptId];
  if (!script || script.length === 0) return;
  closeOtherOverlays('dialogue');
  activeOverlay = 'dialogue';
  dialogueScript = script;
  dialogueLineIndex = 0;
  dialogueOnDone = onDone || null;
  const overlay = document.getElementById('dialogueOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  renderDialogueLine();
}

function renderDialogueLine() {
  const line = dialogueScript[dialogueLineIndex];
  const def = CHAR_DEFS[line.speaker];
  document.getElementById('dialogueSpeakerName').textContent = def ? def.name : '';
  document.getElementById('dialogueText').textContent = line.text;
  const frame = document.getElementById('dialoguePortraitFrame');
  const img = document.getElementById('dialoguePortraitImg');
  frame.classList.remove('missing');
  if (def) {
    img.src = `assets/characters/${def.img}_full.png`;
    img.alt = `${def.name} 立繪`;
    img.onerror = () => frame.classList.add('missing');
  } else {
    frame.classList.add('missing');
  }
  document.getElementById('dialogueNextBtn').textContent = dialogueLineIndex === dialogueScript.length - 1 ? '結束' : '繼續 ▶';
}

function advanceDialogue() {
  if (!dialogueScript) return;
  dialogueLineIndex++;
  if (dialogueLineIndex >= dialogueScript.length) {
    closeDialogue();
    return;
  }
  renderDialogueLine();
}

// Also used as this overlay's OVERLAY_CLOSERS entry, so Escape or opening
// another overlay mid-dialogue skips the remaining lines but still resolves
// onDone (e.g. the unlock a quest-complete dialogue is gating) rather than
// leaving that quest stuck.
function closeDialogue() {
  const overlay = document.getElementById('dialogueOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  if (activeOverlay === 'dialogue') activeOverlay = null;
  dialogueScript = null;
  const cb = dialogueOnDone;
  dialogueOnDone = null;
  if (cb) cb();
  playNextQueuedDialogue();
}

function bindDialogueUI() {
  document.getElementById('dialogueModal').addEventListener('click', advanceDialogue);
}
