// --- 對話與契約演出 ---
const DIALOGUE_DEFS = {
  xiaochu_contract: [
    { speaker: 'wuming', text: '……剛才那道光，是妳嗎？' },
    { speaker: 'xiaochu', text: '終於看見你了！我是小初。你也看得到我，對吧？' },
    { speaker: 'wuming', text: '看得到。可是妳剛才並不在這裡。' },
    { speaker: 'xiaochu', text: '我在另一側。每次你戰鬥，我都能感覺兩邊越來越靠近——直到剛才，終於連上了。' },
    { speaker: 'xiaochu', text: '你的世界有真正的劍，也有能親手交鋒的對手。可以讓我借你的身體戰鬥嗎？' },
    { speaker: 'wuming', text: '只能在我同意的時候，而且我要能隨時停下。' },
    { speaker: 'xiaochu', text: '當然！那就約好了。你願意借出雙手時，我一定會好好珍惜！' },
  ],
};

const DIALOGUE_PRESENTATION = {
  xiaochu_contract: {
    intro: 'soulResonance',
    resonanceArt: 'xiaochu_resonance_orb',
    outro: 'contractFormed',
    partner: 'xiaochu',
  },
};

let dialogueQueue = [];
let dialogueScript = null;
let dialogueScriptId = null;
let dialogueLineIndex = 0;
let dialogueOnDone = null;
let dialoguePhase = 'closed';

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
  dialogueScriptId = scriptId;
  dialogueScript = script;
  dialogueLineIndex = 0;
  dialogueOnDone = onDone || null;
  const overlay = document.getElementById('dialogueOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  const presentation = DIALOGUE_PRESENTATION[scriptId];
  if (presentation && presentation.intro === 'soulResonance') startSoulResonance();
  else beginDialogueLines();
}

function startSoulResonance() {
  dialoguePhase = 'intro';
  document.getElementById('dialogueModal').classList.add('presentationHidden');
  const intro = document.getElementById('soulResonance');
  const presentation = DIALOGUE_PRESENTATION[dialogueScriptId] || {};
  const orb = document.getElementById('soulResonanceOrb');
  orb.src = `assets/story/${presentation.resonanceArt || 'resonance_orb'}.png`;
  intro.classList.remove('playing');
  intro.setAttribute('aria-hidden', 'false');
  void intro.offsetWidth;
  intro.classList.add('playing');
}

function finishSoulResonance() {
  if (dialoguePhase !== 'intro') return;
  const intro = document.getElementById('soulResonance');
  intro.classList.remove('playing');
  intro.setAttribute('aria-hidden', 'true');
  beginDialogueLines();
}

function beginDialogueLines() {
  dialoguePhase = 'dialogue';
  document.getElementById('dialogueModal').classList.remove('presentationHidden');
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
    img.src = characterFullArtPath(line.speaker);
    img.alt = `${def.name} 立繪`;
    img.onerror = () => frame.classList.add('missing');
  } else {
    frame.classList.add('missing');
  }
  frame.classList.remove('lineEntering');
  void frame.offsetWidth;
  frame.classList.add('lineEntering');
}

function advanceDialogue() {
  if (dialoguePhase !== 'dialogue' || !dialogueScript) return;
  dialogueLineIndex++;
  if (dialogueLineIndex < dialogueScript.length) return renderDialogueLine();
  const presentation = DIALOGUE_PRESENTATION[dialogueScriptId];
  if (presentation && presentation.outro === 'contractFormed') startContractFormed(presentation.partner);
  else closeDialogue();
}

function startContractFormed(characterId) {
  const def = CHAR_DEFS[characterId];
  if (!def) return closeDialogue();
  dialoguePhase = 'outro';
  document.getElementById('dialogueModal').classList.add('presentationHidden');
  const img = document.getElementById('contractFormedCharacter');
  img.src = characterFullArtPath(characterId);
  img.alt = `${def.name} 立繪`;
  const circle = document.getElementById('contractFormedMagicCircle');
  const rarity = RARITY_DEFS[def.rarity];
  if (rarity && rarity.revealEffect) {
    circle.src = `assets/rarity/${rarity.revealEffect}.png`;
    circle.alt = `${rarity.label}契約魔法陣`;
    circle.hidden = false;
  } else {
    circle.removeAttribute('src');
    circle.alt = '';
    circle.hidden = true;
  }
  document.getElementById('contractFormedTitle').textContent = def.name;
  const outro = document.getElementById('contractFormed');
  outro.classList.remove('playing');
  outro.setAttribute('aria-hidden', 'false');
  void outro.offsetWidth;
  outro.classList.add('playing');
}

function finishContractFormed() {
  if (dialoguePhase === 'outro') closeDialogue();
}

function closeDialogue() {
  document.getElementById('soulResonance').classList.remove('playing');
  document.getElementById('soulResonance').setAttribute('aria-hidden', 'true');
  document.getElementById('contractFormed').classList.remove('playing');
  document.getElementById('contractFormed').setAttribute('aria-hidden', 'true');
  document.getElementById('dialogueModal').classList.remove('presentationHidden');
  const overlay = document.getElementById('dialogueOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  if (activeOverlay === 'dialogue') activeOverlay = null;
  dialoguePhase = 'closed';
  dialogueScript = null;
  dialogueScriptId = null;
  const cb = dialogueOnDone;
  dialogueOnDone = null;
  if (cb) cb();
  playNextQueuedDialogue();
}

function previewContract(characterId) {
  const def = CHAR_DEFS[characterId];
  const scriptId = def && def.unlock && def.unlock.contractDialogue;
  if (!scriptId || !DIALOGUE_DEFS[scriptId]) return;
  if (activeOverlay === 'dialogue') closeDialogue();
  queueDialogue(scriptId, () => unlockChar(characterId));
}

function runContractPreviewFromUrl() {
  const characterId = new URLSearchParams(window.location.search).get('testContract');
  if (characterId) previewContract(characterId);
}

function bindDialogueUI() {
  const orb = document.getElementById('soulResonanceOrb');
  orb.addEventListener('error', () => document.getElementById('soulResonance').classList.add('missingArt'));
  orb.addEventListener('load', () => document.getElementById('soulResonance').classList.remove('missingArt'));
  document.getElementById('dialogueModal').addEventListener('click', advanceDialogue);
  document.getElementById('soulResonance').addEventListener('click', finishSoulResonance);
  document.getElementById('contractFormed').addEventListener('click', finishContractFormed);
  document.addEventListener('keydown', event => {
    if (event.key === 'F8' && !event.repeat) {
      event.preventDefault();
      previewContract('xiaochu');
    }
  });
}
