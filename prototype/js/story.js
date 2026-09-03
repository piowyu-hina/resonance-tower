import { CHAR_DEFS, RARITY_DEFS } from './constants.js';
import { gameState, unlockChar, characterFullArtPath } from './state.js';
import { closeOtherOverlays } from './ui-overlays.js';
import { render } from './ui-main.js';
import { playTransientAnimation } from './transitions.js';
import { t, formatLocaleNumber } from './i18n.js';

// --- 對話與契約演出 ---
export const DIALOGUE_DEFS = {
  xiaochu_encounter: [
    { speaker: 'xiaochu_orb', text: '哇，好厲害！' },
    { speaker: 'wuming', text: '誰、誰在說話？' },
    { speaker: 'xiaochu_orb', text: '是我啦！' },
    { speaker: 'wuming', text: '靈魂球在說話！' },
    { speaker: 'xiaochu_orb', text: '什麼靈魂球？我是小初啦！' },
    { speaker: 'wuming', text: '那麼……小初小姐？' },
    { speaker: 'xiaochu_orb', text: '嗯！' },
    { speaker: 'wuming', text: '妳怎麼會出現在這裡？' },
    { speaker: 'xiaochu_orb', text: '不知道！' },
    { speaker: 'xiaochu_orb', text: '不過，看你打怪好有趣！我可以跟著你嗎？' },
    { speaker: 'wuming', text: '嗯……好啊。' },
    { speaker: 'xiaochu_orb', text: '太好了！那你繼續吧，我還想看！' },
  ],
  xiaochu_village: [
    { speaker: 'xiaochu_orb', text: '哇，好漂亮的村莊！那邊還有商店耶！' },
    { speaker: 'narrator', text: '小初興奮地飛到商店前。' },
    { speaker: 'xiaochu_orb', text: '哈囉！' },
    { speaker: 'xiaochu_orb', text: '我要這個！' },
    { speaker: 'narrator', text: '商人沒有任何反應。' },
    { speaker: 'xiaochu_orb', text: '……' },
    { speaker: 'wuming', text: '看來……他好像看不到妳。' },
    { speaker: 'wuming', text: '對了，我們先回家吧。' },
    { speaker: 'wuming', text: '我記得有一本書，好像提過這種情況。' },
    { speaker: 'xiaochu_orb', text: '嗯……' },
  ],
  xiaochu_home_search: [
    { speaker: 'wuming', text: '我記得……應該放在這裡才對。' },
    { speaker: 'wuming', text: '找到了！' },
  ],
  xiaochu_after_book: [
    { speaker: 'wuming', text: '這和我們的情況……好像有點像。' },
    { speaker: 'xiaochu_orb', text: '你是說，他一個人瘋瘋癲癲，像在跟空氣說話那樣嗎？' },
    { speaker: 'wuming', text: '……我是說，書裡那個會變成不同模樣的人。' },
    { speaker: 'xiaochu_orb', text: '所以，只要念出書裡的話，我就可以使用你的身體嗎？' },
    { speaker: 'wuming', text: '我不知道。' },
    { speaker: 'wuming', text: '妳想試試看嗎？' },
    { speaker: 'xiaochu_orb', text: '嗯！想要！' },
    { speaker: 'xiaochu_orb', text: '不過……如果害你也被追殺，怎麼辦？' },
    { speaker: 'wuming', text: '那就到時候再想辦法吧。' },
    { speaker: 'xiaochu_orb', text: '那……嗯……跟我求婚吧！' },
    { speaker: 'wuming', text: '不是求婚吧！' },
  ],
  xiaochu_oath: [
    { speaker: 'wuming', text: '小初。' },
    { speaker: 'xiaochu_orb', text: '嗯……' },
    { speaker: 'wuming', text: '我在此立誓。' },
    { speaker: 'wuming', text: '從今以後，無論生老病死，我都將與妳共同進退。' },
    { speaker: 'wuming', text: '妳若生存，我也生存；妳若死亡，我也將死亡。' },
  ],
  xiaochu_contract_prepare: [
    { speaker: 'wuming', text: '那……我要開始囉。' },
    { speaker: 'xiaochu_orb', text: '嗯……我準備好了！' },
  ],
  xiaochu_first_possession: [
    { speaker: 'xiaochu', text: '哇！我有人類的模樣了！' },
    { speaker: 'xiaochu', text: '而且……我好像變得跟你差不多大了！' },
    { speaker: 'xiaochu', text: '這就是我的模樣嗎？好可愛！' },
    { speaker: 'wuming', text: '哈哈哈……成功了呢。' },
    { speaker: 'wuming', text: '不過，要怎麼把身體借給妳？' },
    { speaker: 'narrator', text: '締結誓約後，小初腦中忽然浮現出某種方法。' },
    { speaker: 'xiaochu', text: '奇怪……我好像知道該怎麼做。' },
    { speaker: 'xiaochu', text: '我試試看！' },
    { speaker: 'wuming', text: '等——' },
    { speaker: 'xiaochu_kiss', text: '小初親吻了無名。光芒閃過，兩人的位置交換了。' },
    { speaker: 'xiaochu', text: '哇！是盾牌！還有劍！' },
    { speaker: 'xiaochu', text: '真的出現了！' },
    { speaker: 'narrator', text: '小初興奮地揮動手中的劍。' },
    { speaker: 'xiaochu', text: '我現在就想出去冒險！' },
    { speaker: 'wuming', text: '等一下！我變成靈魂了！' },
    { speaker: 'wuming', text: '要怎麼變回去？' },
    { speaker: 'xiaochu', text: '嗯……跟我剛才一樣，不就好了嗎？' },
    { speaker: 'wuming', text: '還、還要再親一次嗎……' },
    { speaker: 'wuming', text: '我覺得好害羞……' },
    { speaker: 'xiaochu', text: '這有什麼好害羞的？我們都結婚了。' },
    { speaker: 'wuming', text: '才沒有結婚……' },
    { speaker: 'xiaochu', text: '真是的，過來吧。' },
    { speaker: 'xiaochu_kiss', text: '小初再次親吻無名。光芒散去後，兩人恢復了原本的狀態。' },
    { speaker: 'wuming', text: '哇，變回來了！' },
    { speaker: 'xiaochu', text: '是吧！' },
    { speaker: 'xiaochu', text: '說好了喔！之後一定要讓我去冒險！' },
  ],
};

export const DIALOGUE_PRESENTATION = {
  xiaochu_oath: {
    outro: 'contractFormed',
    partner: 'xiaochu',
  },
};

export const STORY_SPEAKERS = {
  xiaochu_orb: { name: '小初', art: 'assets/story/xiaochu_resonance_orb.png', orb: true },
  xiaochu_kiss: { name: '', art: 'assets/story/xiaochu_kiss.png', scene: true },
  narrator: { name: '', narration: true },
};

export const JOURNAL_PAGES = [
  `很久以前，曾經有一位被稱為「靈魂使者」的人。\n\n戰鬥時，他會不斷變換身形。前一刻還握著劍，下一刻卻可能拿著法杖，甚至連說話的聲音和舉止都判若兩人。\n\n因為這副怪異的模樣，人們厭惡他、排斥他，甚至不願意靠近他。\n\n即便如此，當魔物侵襲城鎮時，他仍然選擇挺身而出。最後，他獨自封印了魔王。\n\n不過……他最後還是遭到王室殺害。`,
  `有人曾經看見他的家中發出不同顏色的光。\n\n紅色、黃色、黑色、白色……每次出現的光芒都不相同。\n\n發光以前，好像還能聽見他念著某種誓言。聽起來，簡直就像結婚誓詞一樣。\n\n「我在此立誓，從今以後，無論生老病死，我都將與你共同進退。」\n\n「你若生存，我也生存；你若死亡，我也將死亡。」`,
  `誓言結束後，整棟房子便會被光芒籠罩。\n\n光是把這些話寫下來，我都覺得渾身發麻……他到底是怎麼當面念出來的？\n\n城裡的人都討厭他。他偶爾會獨自發笑，也經常在沒有其他人的房間裡自言自語。\n\n有時，人們還會看見不同的人從他家中走出來。直到他封印魔王以後，大家才終於知道，那些看似不同的人，其實一直使用著同一具身體。`,
  `我覺得他很厲害。\n\n明明一直被大家討厭，他最後還是使用自己的能力保護了所有人。\n\n我討厭王室。\n\n他救了所有人的性命，王室卻選擇殺死他。\n\n——緋雨`,
];

export const storyState = {
  journalPage: 0,
  dialogueQueue: [],
  dialogueScript: null,
  dialogueScriptId: null,
  dialogueLineIndex: 0,
  dialogueOnDone: null,
  dialoguePhase: 'closed',
  lastDialogueSpeaker: null,
};

export function queueDialogue(scriptId, onDone = null) {
  if (!DIALOGUE_DEFS[scriptId]) return;
  storyState.dialogueQueue.push({ scriptId, onDone });
  if (gameState.activeOverlay !== 'dialogue') playNextQueuedDialogue();
}

export function playNextQueuedDialogue() {
  if (storyState.dialogueQueue.length === 0) return;
  const next = storyState.dialogueQueue.shift();
  startDialogue(next.scriptId, next.onDone);
}

export function startDialogue(scriptId, onDone) {
  const script = DIALOGUE_DEFS[scriptId];
  if (!script || script.length === 0) return;
  closeOtherOverlays('dialogue');
  gameState.activeOverlay = 'dialogue';
  storyState.dialogueScriptId = scriptId;
  storyState.dialogueScript = script;
  storyState.dialogueLineIndex = 0;
  storyState.lastDialogueSpeaker = null;
  storyState.dialogueOnDone = onDone || null;
  const overlay = document.getElementById('dialogueOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  const presentation = DIALOGUE_PRESENTATION[scriptId];
  if (presentation && presentation.intro === 'soulResonance') startSoulResonance();
  else beginDialogueLines();
}

export function startSoulResonance() {
  storyState.dialoguePhase = 'intro';
  document.getElementById('dialogueModal').classList.add('presentationHidden');
  const intro = document.getElementById('soulResonance');
  const presentation = DIALOGUE_PRESENTATION[storyState.dialogueScriptId] || {};
  const orb = document.getElementById('soulResonanceOrb');
  orb.src = `assets/story/${presentation.resonanceArt || 'resonance_orb'}.png`;
  intro.classList.remove('playing');
  intro.setAttribute('aria-hidden', 'false');
  void intro.offsetWidth;
  intro.classList.add('playing');
  intro.focus();
}

export function finishSoulResonance() {
  if (storyState.dialoguePhase !== 'intro') return;
  const intro = document.getElementById('soulResonance');
  intro.classList.remove('playing');
  intro.setAttribute('aria-hidden', 'true');
  beginDialogueLines();
}

export function beginDialogueLines() {
  storyState.dialoguePhase = 'dialogue';
  document.getElementById('dialogueModal').classList.remove('presentationHidden');
  renderDialogueLine();
}

export function renderDialogueLine() {
  const line = storyState.dialogueScript[storyState.dialogueLineIndex];
  const speakerChanged = line.speaker !== storyState.lastDialogueSpeaker;
  const def = CHAR_DEFS[line.speaker];
  const special = STORY_SPEAKERS[line.speaker];
  document.getElementById('dialogueSpeakerName').textContent = def ? def.name : (special ? special.name : '');
  const text = document.getElementById('dialogueText');
  text.textContent = line.text;
  const frame = document.getElementById('dialoguePortraitFrame');
  const img = document.getElementById('dialoguePortraitImg');
  if (speakerChanged) {
    frame.classList.remove('missing', 'orbSpeaker', 'sceneArt', 'narration');
    if (def) {
      img.src = characterFullArtPath(line.speaker);
      img.alt = `${def.name} 立繪`;
      img.onerror = () => frame.classList.add('missing');
    } else if (special && special.art) {
      img.src = special.art;
      img.alt = special.name;
      img.onerror = () => frame.classList.add('missing');
      frame.classList.toggle('orbSpeaker', !!special.orb);
      frame.classList.toggle('sceneArt', !!special.scene);
    } else if (special && special.narration) {
      img.removeAttribute('src');
      img.alt = '';
      frame.classList.add('narration');
    } else {
      frame.classList.add('missing');
    }
  }
  if (speakerChanged && !frame.classList.contains('narration')) playTransientAnimation(img, 'lineEntering');
  playTransientAnimation(text, 'lineEntering');
  storyState.lastDialogueSpeaker = line.speaker;
}

export function startCharacterEncounter(characterId, onDone) {
  if (characterId !== 'xiaochu') return onDone();
  queueDialogue('xiaochu_encounter', () => {
    gameState.resonanceState.xiaochu = 'following';
    if (onDone) onDone();
  });
}

export function renderJournalPage() {
  const page = document.getElementById('journalPageText');
  page.textContent = JOURNAL_PAGES[storyState.journalPage];
  playTransientAnimation(page, 'pageTurning');
  document.getElementById('journalPageNumber').textContent = t('format.page', {
    current: formatLocaleNumber(storyState.journalPage + 1),
    total: formatLocaleNumber(JOURNAL_PAGES.length),
  });
  document.getElementById('journalNextBtn').textContent = t(
    storyState.journalPage === JOURNAL_PAGES.length - 1 ? 'journal.done' : 'journal.next',
  );
}

export function openTravelJournal() {
  closeOtherOverlays('journal');
  gameState.activeOverlay = 'journal';
  storyState.journalPage = 0;
  if (gameState.resonanceState.xiaochu === 'bookPending') gameState.resonanceState.xiaochu = 'bookReading';
  renderJournalPage();
  const overlay = document.getElementById('journalOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.getElementById('journalNextBtn').focus();
}

export function closeTravelJournal(finished = false) {
  const overlay = document.getElementById('journalOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  if (gameState.activeOverlay === 'journal') gameState.activeOverlay = null;
  if (gameState.resonanceState.xiaochu === 'bookReading' && finished) {
    queueDialogue('xiaochu_after_book', () => {
      gameState.resonanceState.xiaochu = 'oathReady';
      render();
    });
  }
}

export function advanceTravelJournal() {
  if (storyState.journalPage < JOURNAL_PAGES.length - 1) {
    storyState.journalPage++;
    renderJournalPage();
  } else {
    closeTravelJournal(true);
  }
}

export function openContractPanel() {
  const hasPendingSoul = gameState.resonanceState.xiaochu === 'oathReady';
  if (!hasPendingSoul && gameState.resonanceState.xiaochu !== 'contracted') return;
  closeOtherOverlays('contract');
  gameState.activeOverlay = 'contract';
  const panel = document.querySelector('#contractOverlay .contractPanel');
  panel.classList.remove('confirming');
  document.getElementById('contractConfirm').hidden = true;
  const soulButton = document.getElementById('xiaochuSoulBtn');
  soulButton.hidden = !hasPendingSoul;
  soulButton.disabled = false;
  document.getElementById('contractEmpty').hidden = hasPendingSoul;
  const overlay = document.getElementById('contractOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  (hasPendingSoul ? document.getElementById('xiaochuSoulBtn') : document.getElementById('contractCloseBtn')).focus();
}

export function beginContractPreparation() {
  if (gameState.resonanceState.xiaochu === 'contracted') return openContractPanel();
  if (gameState.resonanceState.xiaochu !== 'oathReady') return;
  queueDialogue('xiaochu_contract_prepare', openContractPanel);
}

export function closeContractPanel() {
  const overlay = document.getElementById('contractOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  if (gameState.activeOverlay === 'contract') gameState.activeOverlay = null;
}

export function confirmXiaochuContract() {
  if (gameState.resonanceState.xiaochu !== 'oathReady') return;
  closeContractPanel();
  gameState.resonanceState.xiaochu = 'contracting';
  queueDialogue('xiaochu_oath', () => {
    queueDialogue('xiaochu_first_possession', () => {
      gameState.resonanceState.xiaochu = 'contracted';
      unlockChar('xiaochu');
      render();
    });
  });
}

export function advanceDialogue() {
  if (storyState.dialoguePhase !== 'dialogue' || !storyState.dialogueScript) return;
  storyState.dialogueLineIndex++;
  if (storyState.dialogueLineIndex < storyState.dialogueScript.length) return renderDialogueLine();
  const presentation = DIALOGUE_PRESENTATION[storyState.dialogueScriptId];
  if (presentation && presentation.outro === 'contractFormed') startContractFormed(presentation.partner);
  else closeDialogue();
}

export function startContractFormed(characterId) {
  const def = CHAR_DEFS[characterId];
  if (!def) return closeDialogue();
  storyState.dialoguePhase = 'outro';
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
  outro.focus();
}

export function finishContractFormed() {
  if (storyState.dialoguePhase === 'outro') closeDialogue();
}

export function closeDialogue() {
  document.getElementById('soulResonance').classList.remove('playing');
  document.getElementById('soulResonance').setAttribute('aria-hidden', 'true');
  document.getElementById('contractFormed').classList.remove('playing');
  document.getElementById('contractFormed').setAttribute('aria-hidden', 'true');
  document.getElementById('dialogueModal').classList.remove('presentationHidden');
  const overlay = document.getElementById('dialogueOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  if (gameState.activeOverlay === 'dialogue') gameState.activeOverlay = null;
  storyState.dialoguePhase = 'closed';
  storyState.dialogueScript = null;
  storyState.dialogueScriptId = null;
  storyState.lastDialogueSpeaker = null;
  const cb = storyState.dialogueOnDone;
  storyState.dialogueOnDone = null;
  if (cb) cb();
  playNextQueuedDialogue();
}

export function previewContract(characterId) {
  if (characterId !== 'xiaochu') return;
  if (gameState.activeOverlay === 'dialogue') closeDialogue();
  queueDialogue('xiaochu_oath', () => queueDialogue('xiaochu_first_possession'));
}

export function runContractPreviewFromUrl() {
  const characterId = new URLSearchParams(window.location.search).get('testContract');
  if (characterId) previewContract(characterId);
}

export function bindDialogueUI() {
  const orb = document.getElementById('soulResonanceOrb');
  orb.addEventListener('error', () => document.getElementById('soulResonance').classList.add('missingArt'));
  orb.addEventListener('load', () => document.getElementById('soulResonance').classList.remove('missingArt'));
  document.getElementById('dialogueOverlay').addEventListener('click', event => {
    if (event.target.closest('#soulResonance, #contractFormed')) return;
    if (storyState.dialoguePhase === 'dialogue') advanceDialogue();
  });
  document.getElementById('soulResonance').addEventListener('click', finishSoulResonance);
  document.getElementById('contractFormed').addEventListener('click', finishContractFormed);
  document.getElementById('travelJournalBtn').addEventListener('click', openTravelJournal);
  document.getElementById('journalCloseBtn').addEventListener('click', () => closeTravelJournal(false));
  document.getElementById('journalNextBtn').addEventListener('click', advanceTravelJournal);
  document.getElementById('contractFacilityBtn').addEventListener('click', beginContractPreparation);
  document.getElementById('contractCloseBtn').addEventListener('click', closeContractPanel);
  document.getElementById('xiaochuSoulBtn').addEventListener('click', () => {
    document.querySelector('#contractOverlay .contractPanel').classList.add('confirming');
    document.getElementById('xiaochuSoulBtn').disabled = true;
    document.getElementById('contractConfirm').hidden = false;
    document.getElementById('contractConfirmBtn').focus();
  });
  document.getElementById('contractCancelBtn').addEventListener('click', () => {
    document.querySelector('#contractOverlay .contractPanel').classList.remove('confirming');
    document.getElementById('xiaochuSoulBtn').disabled = false;
    document.getElementById('contractConfirm').hidden = true;
    document.getElementById('xiaochuSoulBtn').focus();
  });
  document.getElementById('contractConfirmBtn').addEventListener('click', confirmXiaochuContract);
  document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && gameState.activeOverlay === 'dialogue') {
      event.preventDefault();
      if (storyState.dialoguePhase === 'intro') finishSoulResonance();
      else if (storyState.dialoguePhase === 'dialogue') advanceDialogue();
      else if (storyState.dialoguePhase === 'outro') finishContractFormed();
      return;
    }
    if (event.key === 'Escape' && gameState.activeOverlay === 'journal') {
      event.preventDefault();
      closeTravelJournal(false);
      return;
    }
    if (event.key === 'Escape' && gameState.activeOverlay === 'contract') {
      event.preventDefault();
      closeContractPanel();
      return;
    }
    if (event.key === 'F8' && !event.repeat) {
      event.preventDefault();
      previewContract('xiaochu');
    }
  });
}
