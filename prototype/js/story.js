import { CHAR_DEFS, RARITY_DEFS } from './constants.js';
import {
  gameState, unlockChar, characterFullArtPath, RESONANCE_STATES, setResonanceState,
  CHAPTER1_STATES, setChapter1State,
} from './state.js';
import { closeOtherOverlays, overlayUiState } from './ui-overlays.js';
import { render } from './ui-main.js';
import { afterAnimationPaint, beginManagedTransition, playTransientAnimation } from './transitions.js';
import { t, formatLocaleNumber } from './i18n.js';
import { endRun } from './combat.js';

// --- 對話與契約演出 ---
export const DIALOGUE_DEFS = {
  chapter1_defeat: [
    { speaker: 'wuming', text: '不要……' },
    { speaker: 'wuming', text: '我還不想死……！' },
    { speaker: 'narrator', text: '遺跡之主的攻擊敲碎了無名胸前的傳送石。', effect: 'teleportStoneBreak' },
    { speaker: 'narrator', text: '碎片間迸出白光。無名眼前，遺跡之主的輪廓逐漸模糊。' },
    { speaker: 'narrator', text: '無名再也看不見眼前的巨影。光芒散去時，他已從遺跡中消失。' },
  ],
  chapter1_goddess: [
    { speaker: 'narrator', text: '無名睜開眼睛。柔和的光映入眼底，耳邊已經聽不見遺跡中的轟鳴。' },
    { speaker: 'wuming', text: '這裡是……天堂嗎？' },
    { speaker: 'goddess', text: '是的。' },
    { speaker: 'wuming', text: '妳、妳是誰？' },
    { speaker: 'goddess', text: '我是管理這裡的女神。' },
    { speaker: 'wuming', text: '所以……我已經死了嗎？' },
    { speaker: 'goddess', text: '嗯……算是死了一半吧。' },
    { speaker: 'wuming', text: '死了一半？' },
    { speaker: 'goddess', text: '你被攻擊的時候，那條項鍊把你傳送到了這裡。' },
    { speaker: 'narrator', text: '無名低下頭。胸前已經沒有那枚熟悉的墜飾。' },
    { speaker: 'wuming', text: '奶奶給我的那條……是它救了我？' },
    { speaker: 'goddess', text: '嗯。那原本是我很久以前用的傳送石，只要它破裂，就會把持有者送回這裡。' },
    { speaker: 'wuming', text: '為什麼奶奶會有女神的東西……？' },
    { speaker: 'goddess', text: '我弄丟它很久了。沒想到會在人間，再次把人送回來。' },
    { speaker: 'narrator', text: '無名想起最後逼近的攻擊，不自覺縮了縮肩膀。' },
    { speaker: 'wuming', text: '如果沒有它……' },
    { speaker: 'goddess', text: '那一擊會殺死你。傳送石把你帶走時，你還剩下一口氣。' },
    { speaker: 'wuming', text: '那我還能回去嗎？' },
    { speaker: 'goddess', text: '正常來說，來到這裡的人不能回去。' },
    { speaker: 'wuming', text: '怎麼這樣……' },
    { speaker: 'narrator', text: '無名低下頭，努力眨了眨眼睛。' },
    { speaker: 'goddess', text: '先、先不要哭！' },
    { speaker: 'goddess', text: '雖然普通的死者不能回去，但是你還沒有完全死掉。' },
    { speaker: 'goddess', text: '只要你願意幫我完成一件事，我就能讓你以神之代理人的身分回到人間。' },
    { speaker: 'wuming', text: '真的嗎？' },
    { speaker: 'goddess', text: '真的。' },
    { speaker: 'wuming', text: '我要做什麼？' },
    { speaker: 'narrator', text: '女神收起笑容，放輕了聲音。' },
    { speaker: 'goddess', text: '有幾個孩子，已經死了，卻還留在人間。' },
    { speaker: 'wuming', text: '她們也回不了家嗎？' },
    { speaker: 'goddess', text: '她們還有放不下的事。有些事沒做完，有些心願還沒能實現……所以一直沒有走到這裡。' },
    { speaker: 'wuming', text: '那妳不能直接帶她們回來嗎？' },
    { speaker: 'goddess', text: '我不能強迫還有留戀的靈魂離開。她們需要一個還活著的人，聽她們說話，陪她們走一段路。' },
    { speaker: 'wuming', text: '我能幫得上忙嗎？' },
    { speaker: 'goddess', text: '先找到她們，聽聽她們想做什麼。如果你們願意同行，就可以締結靈魂契約。' },
    { speaker: 'goddess', text: '有了契約，她們就能住進你的身體裡。' },
    { speaker: 'wuming', text: '住、住進我的身體？' },
    { speaker: 'wuming', text: '聽起來好可怕……' },
    { speaker: 'goddess', text: '不會啦！她們都是好孩子。' },
    { speaker: 'goddess', text: '大概。' },
    { speaker: 'wuming', text: '妳剛剛是不是說了「大概」？' },
    { speaker: 'goddess', text: '沒有喔。' },
    { speaker: 'wuming', text: '可是，她們進來以後……我還會是我嗎？' },
    { speaker: 'goddess', text: '當然。你還是你，她們也還是她們。你願意的時候，可以把身體借給她們；不願意，就說不。' },
    { speaker: 'goddess', text: '契約會讓你的靈魂成為她們返回這裡的道路。等你有一天真正走完自己的人生，就能帶著她們一起來到這裡。' },
    { speaker: 'wuming', text: '所以不是要我完成任務以後立刻死掉吧？' },
    { speaker: 'goddess', text: '當然不是！你正常地活著就好。' },
    { speaker: 'wuming', text: '太好了……' },
    { speaker: 'wuming', text: '可是，要怎麼和她們締結契約？' },
    { speaker: 'goddess', text: '等你們都願意了，就帶她回你家吧。' },
    { speaker: 'wuming', text: '我家？' },
    { speaker: 'goddess', text: '嗯。我會在你家留下祝福，契約儀式只有在那裡才能成立。' },
    { speaker: 'wuming', text: '那契約的時候要說什麼？' },
    { speaker: 'goddess', text: '要說……' },
    { speaker: 'narrator', text: '女神張開嘴，又停了下來。無名等著她繼續。' },
    { speaker: 'goddess', text: '我忘記了。' },
    { speaker: 'wuming', text: '怎麼會忘記這麼重要的事情！' },
    { speaker: 'goddess', text: '等一下！我以前有位愛旅行的朋友，曾經記下他見過的一場契約儀式。' },
    { speaker: 'goddess', text: '那本書現在應該被叫作《旅人手記》吧？' },
    { speaker: 'wuming', text: '《旅人手記》？' },
    { speaker: 'wuming', text: '我家裡好像就有一本。' },
    { speaker: 'goddess', text: '真的嗎？那就沒問題了！' },
    { speaker: 'goddess', text: '照著裡面的誓言，把你願意答應的事說清楚，也聽聽對方的回答。' },
    { speaker: 'wuming', text: '如果她不願意呢？' },
    { speaker: 'goddess', text: '那就不締約。能聽她說說話，也很好啊。' },
    { speaker: 'goddess', text: '找到那些孩子之後，記得帶她們回家，好好和她們談談。' },
    { speaker: 'goddess', text: '不要只把她們當成任務。要不要締結契約，最後必須由你們一起決定。' },
    { speaker: 'wuming', text: '嗯，我知道了。' },
    { speaker: 'goddess', text: '那麼，從現在開始，你就是我的代理人了。' },
    { speaker: 'narrator', text: '光芒包圍無名。' },
  ],
  chapter1_home_return: [
    { speaker: 'wuming', text: '我、我真的回來了……' },
    { speaker: 'narrator', text: '無名低頭看向原本受傷的地方，又慢慢握緊手掌。手指隨著他的心意收攏。' },
    { speaker: 'narrator', text: '他長長吐出一口氣，肩膀終於放鬆下來。' },
    { speaker: 'wuming', text: '對了，《旅人手記》！' },
    { speaker: 'narrator', text: '無名翻找了一會兒，從幾本舊書底下抽出一本手記，拂去封面上的灰塵。' },
    { speaker: 'wuming', text: '找到了！' },
  ],
  chapter1_after_book: [
    { speaker: 'narrator', text: '無名看著最後一頁，手指停在「我也沒有」那行字旁。' },
    { speaker: 'wuming', text: '他明明救了大家……' },
    { speaker: 'narrator', text: '屋裡很安靜。過了一會兒，無名才慢慢翻回記著誓言的那一頁。' },
    { speaker: 'wuming', text: '原來以前真的發生過類似的事情……' },
    { speaker: 'wuming', text: '那些和他一起戰鬥的人，最後也陪著他嗎？' },
    { speaker: 'narrator', text: '書裡沒有答案。無名的目光停在兩行誓言上，試著輕聲念了開頭，又停住。' },
    { speaker: 'wuming', text: '不過，這個契約台詞也太害羞了吧……' },
    { speaker: 'wuming', text: '可是，我要去哪裡找那些孩子？' },
    { speaker: 'narrator', text: '無名望向窗外，肚子卻在這時叫了一聲。' },
    { speaker: 'wuming', text: '……也是，總不能一直坐在這裡等。' },
    { speaker: 'wuming', text: '今天的伙食費還沒有著落，先填飽肚子要緊！' },
    { speaker: 'narrator', text: '他把手記放在桌上，拿起出門用的劍。' },
  ],
  xiaochu_encounter: [
    { speaker: 'xiaochu_orb', text: '哇，好厲害！' },
    { speaker: 'wuming', text: '誰、誰在說話？' },
    { speaker: 'xiaochu_orb', text: '是我啦！' },
    { speaker: 'wuming', text: '靈魂球在說話！' },
    { speaker: 'xiaochu_orb', text: '什麼靈魂球？我是小初啦！' },
    { speaker: 'wuming', text: '那麼...小初小姐？' },
    { speaker: 'xiaochu_orb', text: '嗯！' },
    { speaker: 'wuming', text: '妳怎麼會出現在這裡？' },
    { speaker: 'xiaochu_orb', text: '不知道！' },
    { speaker: 'xiaochu_orb', text: '不過，看你打怪好有趣！我可以跟著你嗎？' },
    { speaker: 'wuming', text: '嗯...好啊。' },
    { speaker: 'xiaochu_orb', text: '太好了！那你繼續吧，我還想看！' },
  ],
  xiaochu_village: [
    { speaker: 'xiaochu_orb', text: '哇，好漂亮的村莊！那邊還有商店耶！' },
    { speaker: 'narrator', text: '小初興奮地飛到商店前。' },
    { speaker: 'xiaochu_orb', text: '哈囉！' },
    { speaker: 'xiaochu_orb', text: '我要這個！' },
    { speaker: 'narrator', text: '商人沒有任何反應。' },
    { speaker: 'xiaochu_orb', text: '...他聽不見我嗎？' },
    { speaker: 'wuming', text: '看來...他好像也看不到妳。' },
    { speaker: 'xiaochu_orb', text: '原來...除了你，這裡沒有人聽得見我啊。' },
    { speaker: 'wuming', text: '對了，我們先回家吧。' },
    { speaker: 'wuming', text: '我記得有一本書，好像提過這種情況。' },
    { speaker: 'xiaochu_orb', text: '嗯...' },
  ],
  xiaochu_home_search: [
    { speaker: 'wuming', text: '我記得...應該放在這裡才對。' },
    { speaker: 'wuming', text: '找到了！' },
  ],
  xiaochu_after_book: [
    { speaker: 'wuming', text: '這和我們的情況...好像有點像。' },
    { speaker: 'xiaochu_orb', text: '...' },
    { speaker: 'xiaochu_orb', text: '我不喜歡這個故事的結局。' },
    { speaker: 'wuming', text: '嗯...' },
    { speaker: 'xiaochu_orb', text: '不過...你說的「像」，是指你也會一個人對著空氣說話嗎？' },
    { speaker: 'wuming', text: '...我是說，書裡那個會變成不同模樣的人。' },
    { speaker: 'xiaochu_orb', text: '所以，只要念出書裡的話，我就可以使用你的身體嗎？' },
    { speaker: 'wuming', text: '我不知道。' },
    { speaker: 'wuming', text: '妳想試試看嗎？' },
    { speaker: 'xiaochu_orb', text: '嗯！想要！' },
    { speaker: 'xiaochu_orb', text: '不過...如果害你也被追殺，怎麼辦？' },
    { speaker: 'wuming', text: '那就一起想辦法吧。' },
    { speaker: 'wuming', text: '至少，我不想因為害怕，就假裝沒有聽見妳。' },
    { speaker: 'xiaochu_orb', text: '那...嗯...跟我求婚吧！' },
    { speaker: 'wuming', text: '不是求婚吧！' },
  ],
  xiaochu_oath: [
    { speaker: 'wuming', text: '小初。' },
    { speaker: 'xiaochu_orb', text: '嗯...' },
    { speaker: 'wuming', text: '我在此立誓。' },
    { speaker: 'wuming', text: '從今以後，無論生老病死，我都將與妳共同進退。' },
    { speaker: 'wuming', text: '只要妳仍願意與我同行，我便不讓妳獨自走完這段路。' },
    { speaker: 'xiaochu_orb', text: '那我也立誓！' },
    { speaker: 'xiaochu_orb', text: '從今以後，不管發生什麼事，我都會和你共同進退。' },
    { speaker: 'xiaochu_orb', text: '你願意把身體借給我的時候，我一定會好好珍惜；你不願意的時候，我絕不勉強！' },
  ],
  xiaochu_contract_prepare: [
    { speaker: 'wuming', text: '那...我要開始囉。' },
    { speaker: 'xiaochu_orb', text: '嗯...我準備好了！' },
  ],
  xiaochu_first_possession: [
    { speaker: 'xiaochu', text: '哇！我有人類的模樣了！' },
    { speaker: 'xiaochu', text: '而且...我好像變得跟你差不多大了！' },
    { speaker: 'xiaochu', text: '這就是我的模樣嗎？好可愛！' },
    { speaker: 'wuming', text: '哈哈哈...成功了呢。' },
    { speaker: 'wuming', text: '不過，要怎麼把身體借給妳？' },
    { speaker: 'narrator', text: '締結誓約後，小初腦中忽然浮現出某種方法。' },
    { speaker: 'xiaochu', text: '奇怪...我好像知道該怎麼做。' },
    { speaker: 'xiaochu', text: '我試試看！' },
    { speaker: 'wuming', text: '等——' },
    { speaker: 'xiaochu_kiss', text: '小初親吻了無名。光芒閃過，兩人的位置交換了。' },
    { speaker: 'xiaochu', text: '哇！是盾牌！還有劍！' },
    { speaker: 'xiaochu', text: '真的出現了！' },
    { speaker: 'narrator', text: '小初興奮地揮動手中的劍。' },
    { speaker: 'xiaochu', text: '我現在就想出去冒險！' },
    { speaker: 'wuming', text: '等一下！我變成靈魂了！' },
    { speaker: 'wuming', text: '要怎麼變回去？' },
    { speaker: 'xiaochu', text: '嗯...跟我剛才一樣，不就好了嗎？' },
    { speaker: 'wuming', text: '還、還要再親一次嗎...' },
    { speaker: 'wuming', text: '我覺得好害羞...' },
    { speaker: 'xiaochu', text: '這有什麼好害羞的？我們都結婚了。' },
    { speaker: 'wuming', text: '才沒有結婚...' },
    { speaker: 'xiaochu', text: '真是的，過來吧。' },
    { speaker: 'xiaochu_kiss', text: '小初再次親吻無名。光芒散去後，兩人恢復了原本的狀態。' },
    { speaker: 'wuming', text: '哇，變回來了！' },
    { speaker: 'xiaochu', text: '是吧！' },
    { speaker: 'xiaochu', text: '說好了喔！之後一定要讓我去冒險！' },
    { speaker: 'wuming', text: '嗯。下一次，我們一起去吧。' },
  ],
};

export const DIALOGUE_PRESENTATION = {
  chapter1_goddess: {
    intro: 'heavenArrival',
    outro: 'heavenDeparture',
    backdrop: 'heaven',
  },
  xiaochu_oath: {
    outro: 'contractFormed',
    partner: 'xiaochu',
  },
};

export const STORY_SPEAKERS = {
  goddess: { name: '女神', art: 'assets/story/goddess.png', goddess: true },
  xiaochu_orb: { name: '小初', art: 'assets/story/xiaochu_resonance_orb.png', orb: true },
  xiaochu_kiss: { name: '', art: 'assets/story/xiaochu_kiss.png', scene: true },
  narrator: { name: '', narration: true },
};

export const JOURNAL_PAGES = [
  `我在這座城停留的第三天，第一次聽見「靈魂使者」這個稱呼。\n\n居民提到他時，總會刻意壓低聲音。\n\n他們說，那是一個能在戰鬥中變換身形的男人。前一刻還握著劍，下一刻卻可能拿起法杖；不只外貌，就連聲音和舉止也會完全改變。\n\n我問那究竟是什麼力量，沒有人能夠回答。\n\n他們只說，那個男人一定受到了某種詛咒。`,
  `那天夜裡，我經過他的住處，看見窗內亮起了不同顏色的光。\n\n光映在窗框上，屋裡傳來交談聲。一個聲音低些，另一個輕些，像是正在商量什麼。\n\n可是透過窗戶，我只看見他一個人。\n\n不久後，他面向空著的椅子，鄭重地念出一段誓言。\n\n「我在此立誓。從今以後，無論生老病死，我都將與你共同進退。」\n\n「只要你仍願意與我同行，我便不讓你獨自走完這段路。」\n\n另一道聲音回應了他。風掠過街道，我沒能聽清每一個字，只聽見最後那句：\n\n「我願意。」`,
  `回應結束的瞬間，窗內亮得讓我抬手遮住了眼睛。\n\n等我再看時，屋裡已經站著另一個人。身形、衣著，連扶著椅背的姿勢都不同了。\n\n我守在街邊，沒有看見任何人進出。\n\n隔天問起這件事，附近的居民卻不願多談。有人說那只是幻術，也有人說他被魔物附了身。\n\n我把那晚聽清的誓言記了下來。另一個人說過什麼，我不敢憑猜測補上。\n\n我只記得，他念完後沒有催促，而是安靜地等著，直到那個聲音回答。\n\n那個男人或許從來都不是在自言自語。`,
  `我準備離開的前夕，魔物攻進了城。\n\n城門旁，一名握劍的戰士替還沒逃走的人擋住去路上的魔物。光芒閃過，同一個位置站起一名術士，抬手攔下追來的火焰。\n\n那是靈魂使者。我第一次親眼看見，那些不同的人如何接連使用同一具身體戰鬥。\n\n直到魔王被他封印，街上的人才能走出藏身處。那天，大家都說是他救了這座城。\n\n後來，我卻在廣場上聽見了處死他的宣令。宣令官說，這份力量不受王室控制，今日能封印魔王，來日也可能危及王國。\n\n他被帶走時，我站在人群裡。身邊的人一個接一個低下頭，沒有人開口。\n\n我也沒有。\n\n我始終不知道，那晚回應誓言的究竟是誰。\n\n如果那些看不見的同伴真的存在，我只希望在最後一段路上，他並不是獨自一人。`,
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
  seenDialogueSpeakers: new Set(),
  lineEffectLocked: false,
};

let journalPageTransition = null;
let heavenTransitionRun = null;
let dialogueLineEffectRun = null;
let presentationRun = null;

function heavenTransitionDuration(normalDuration) {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 250 : normalDuration;
}

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
  storyState.seenDialogueSpeakers.clear();
  storyState.lineEffectLocked = false;
  storyState.dialogueOnDone = onDone || null;
  const presentation = DIALOGUE_PRESENTATION[scriptId];
  const overlay = document.getElementById('dialogueOverlay');
  overlay.classList.toggle('heavenDialogue', presentation?.backdrop === 'heaven');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  if (presentation && presentation.intro === 'soulResonance') startSoulResonance();
  else if (presentation && presentation.intro === 'heavenArrival') startHeavenArrival();
  else beginDialogueLines();
}

function resetHeavenTransitionStage() {
  const stage = document.getElementById('heavenTransition');
  stage.classList.remove('playing', 'arrival', 'departure');
  stage.setAttribute('aria-hidden', 'true');
}

function resetTeleportStoneBreak() {
  const stage = document.getElementById('teleportStoneBreak');
  stage.classList.remove('playing');
  stage.setAttribute('aria-hidden', 'true');
  storyState.lineEffectLocked = false;
}

function playTeleportStoneBreak() {
  dialogueLineEffectRun?.cancel();
  const stage = document.getElementById('teleportStoneBreak');
  stage.classList.remove('playing');
  stage.setAttribute('aria-hidden', 'false');
  void stage.offsetWidth;
  stage.classList.add('playing');
  storyState.lineEffectLocked = true;
  dialogueLineEffectRun = beginManagedTransition('chapter1-teleport-stone-break');
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 250 : 2200;
  dialogueLineEffectRun.after(duration, () => {
    dialogueLineEffectRun?.finish();
    dialogueLineEffectRun = null;
    resetTeleportStoneBreak();
  });
}

export function startHeavenArrival() {
  storyState.dialoguePhase = 'intro';
  document.getElementById('dialogueModal').classList.add('presentationHidden');
  const stage = document.getElementById('heavenTransition');
  stage.classList.remove('playing', 'departure');
  stage.classList.add('arrival');
  stage.setAttribute('aria-hidden', 'false');
  void stage.offsetWidth;
  stage.classList.add('playing');
  stage.focus();
  heavenTransitionRun = beginManagedTransition('chapter1-heaven-transition');
  heavenTransitionRun.after(heavenTransitionDuration(4400), finishHeavenArrival);
}

export function finishHeavenArrival() {
  if (storyState.dialoguePhase !== 'intro' || !document.getElementById('heavenTransition').classList.contains('arrival')) return;
  heavenTransitionRun?.finish();
  heavenTransitionRun = null;
  resetHeavenTransitionStage();
  beginDialogueLines();
}

export function startHeavenDeparture() {
  storyState.dialoguePhase = 'outro';
  document.getElementById('dialogueModal').classList.add('presentationHidden');
  const stage = document.getElementById('heavenTransition');
  stage.classList.remove('playing', 'arrival');
  stage.classList.add('departure');
  stage.setAttribute('aria-hidden', 'false');
  void stage.offsetWidth;
  stage.classList.add('playing');
  stage.focus();
  heavenTransitionRun = beginManagedTransition('chapter1-heaven-transition');
  heavenTransitionRun.after(heavenTransitionDuration(3000), finishHeavenDeparture);
}

export function finishHeavenDeparture() {
  if (storyState.dialoguePhase !== 'outro' || !document.getElementById('heavenTransition').classList.contains('departure')) return;
  heavenTransitionRun?.finish();
  heavenTransitionRun = null;
  resetHeavenTransitionStage();
  closeDialogue();
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
  presentationRun = beginManagedTransition('story-presentation');
  presentationRun.after(heavenTransitionDuration(3000), finishSoulResonance);
}

export function finishSoulResonance() {
  if (storyState.dialoguePhase !== 'intro') return;
  presentationRun?.finish();
  presentationRun = null;
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
  const firstSpeakerAppearance = !storyState.seenDialogueSpeakers.has(line.speaker);
  const def = CHAR_DEFS[line.speaker];
  const special = STORY_SPEAKERS[line.speaker];
  document.getElementById('dialogueSpeakerName').textContent = def
    ? `${def.name}${line.thought ? '（心想）' : ''}`
    : (special ? special.name : '');
  const text = document.getElementById('dialogueText');
  text.textContent = line.text;
  const frame = document.getElementById('dialoguePortraitFrame');
  const img = document.getElementById('dialoguePortraitImg');
  if (speakerChanged) {
    frame.classList.remove('missing', 'orbSpeaker', 'sceneArt', 'narration', 'goddessSpeaker', 'goddessReturning');
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
      frame.classList.toggle('goddessSpeaker', !!special.goddess);
      frame.classList.toggle('goddessReturning', !!special.goddess && !firstSpeakerAppearance);
    } else if (special && special.narration) {
      img.removeAttribute('src');
      img.alt = '';
      frame.classList.add('narration');
    } else {
      frame.classList.add('missing');
    }
  }
  if (speakerChanged && !frame.classList.contains('narration') && (line.speaker !== 'goddess' || firstSpeakerAppearance)) {
    playTransientAnimation(img, 'lineEntering');
  } else if (speakerChanged && line.speaker === 'goddess') {
    img.classList.remove('lineEntering');
  }
  playTransientAnimation(text, 'lineEntering');
  storyState.seenDialogueSpeakers.add(line.speaker);
  storyState.lastDialogueSpeaker = line.speaker;
  if (line.effect === 'teleportStoneBreak') playTeleportStoneBreak();
}

export function startCharacterEncounter(characterId, onDone) {
  if (characterId !== 'xiaochu') return onDone();
  queueDialogue('xiaochu_encounter', () => {
    setResonanceState('xiaochu', RESONANCE_STATES.FOLLOWING);
    if (onDone) onDone();
  });
}

export function startChapter1DefeatSequence() {
  queueDialogue('chapter1_defeat', () => queueDialogue('chapter1_goddess', finishChapter1Goddess));
}

function finishChapter1Goddess() {
  endRun();
  setChapter1State(CHAPTER1_STATES.HOME_RETURN);
  overlayUiState.prepLocation = 'home';
  overlayUiState.homeMode = 'menu';
  render();
  queueDialogue('chapter1_home_return', () => {
    setChapter1State(CHAPTER1_STATES.JOURNAL_PENDING);
    render();
  });
}

export function renderJournalPage() {
  const chapter = JOURNAL_CHAPTERS.find(chapter => chapter.id === storyState.journalChapterId) || JOURNAL_CHAPTERS[0];
  document.getElementById('journalChapterTitle').textContent = t(chapter.titleKey);
  document.getElementById('journalChapterOrdinal').textContent = `CHAPTER ${JOURNAL_CHAPTERS.indexOf(chapter) + 1}`;
  gameState.journalReading.chapterId = chapter.id;
  gameState.journalReading.pages[chapter.id] = storyState.journalPage;
  const page = document.getElementById('journalPageText');
  page.textContent = chapter.pages[storyState.journalPage];
  page.scrollTop = 0;
  document.getElementById('journalPageNumber').textContent = t('format.page', {
    current: formatLocaleNumber(storyState.journalPage + 1),
    total: formatLocaleNumber(chapter.pages.length),
  });
  document.getElementById('journalNextBtn').textContent = t(
    storyState.journalPage === chapter.pages.length - 1 ? (journalStoryReading() ? 'journal.done' : 'journal.contentsBack') : 'journal.next',
  );
  document.getElementById('journalPrevBtn').disabled = storyState.journalPage === 0;
}

export const JOURNAL_CHAPTERS = [{ id: 'shapeshifter', titleKey: 'journal.chapter.shapeshifter', pages: JOURNAL_PAGES }];

function journalStoryReading() {
  if (storyState.journalPreview) return false;
  return gameState.chapter1State === CHAPTER1_STATES.JOURNAL_READING ||
    gameState.resonanceState.xiaochu === RESONANCE_STATES.BOOK_READING;
}

function openJournalChapter(id, resume = false) {
  const chapter = JOURNAL_CHAPTERS.find(entry => entry.id === id);
  if (!chapter) return;
  resetJournalPageTurn();
  storyState.journalChapterId = id;
  storyState.journalPage = resume ? Math.min(chapter.pages.length - 1, gameState.journalReading.pages[id] || 0) : 0;
  document.getElementById('journalContents').hidden = true;
  document.querySelector('.journalBook').hidden = false;
  document.getElementById('journalContentsBtn').hidden = journalStoryReading();
  renderJournalPage();
  document.getElementById('journalNextBtn').focus();
}

export function showJournalContents() {
  if (journalStoryReading()) return;
  resetJournalPageTurn();
  document.querySelector('.journalBook').hidden = true;
  document.getElementById('journalContents').hidden = false;
  document.getElementById('journalContentsBtn').hidden = true;
  const list = document.getElementById('journalChapterList');
  list.replaceChildren();
  JOURNAL_CHAPTERS.forEach((chapter, index) => {
    const button = document.createElement('button');
    button.className = 'journalChapterEntry';
    const number = document.createElement('span');
    number.textContent = String(index + 1).padStart(2, '0');
    const title = document.createElement('b');
    title.textContent = t(chapter.titleKey);
    const copy = document.createElement('span');
    copy.className = 'journalEntryCopy';
    const excerpt = document.createElement('small');
    excerpt.className = 'journalEntryExcerpt';
    excerpt.textContent = chapter.pages[0].split('\n\n')[0];
    const pages = document.createElement('small');
    pages.className = 'journalEntryPages';
    pages.textContent = t('journal.pageCount', { count: formatLocaleNumber(chapter.pages.length) });
    copy.append(title, excerpt, pages);
    button.append(number, copy);
    button.addEventListener('click', () => openJournalChapter(chapter.id));
    list.append(button);
  });
  const resume = document.getElementById('journalResumeBtn');
  resume.hidden = !Object.hasOwn(gameState.journalReading.pages, gameState.journalReading.chapterId);
  (resume.hidden ? list.querySelector('button') : resume).focus();
}

export function openTravelJournal({ preview = false } = {}) {
  closeOtherOverlays('journal');
  storyState.journalPreview = preview;
  gameState.activeOverlay = 'journal';
  storyState.journalPage = 0;
  if (!preview && gameState.resonanceState.xiaochu === RESONANCE_STATES.BOOK_PENDING) setResonanceState('xiaochu', RESONANCE_STATES.BOOK_READING);
  if (!preview && gameState.chapter1State === CHAPTER1_STATES.JOURNAL_PENDING) setChapter1State(CHAPTER1_STATES.JOURNAL_READING);
  const overlay = document.getElementById('journalOverlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  if (journalStoryReading()) openJournalChapter('shapeshifter');
  else showJournalContents();
}

export function closeTravelJournal(finished = false) {
  resetJournalPageTurn();
  const overlay = document.getElementById('journalOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  if (gameState.activeOverlay === 'journal') gameState.activeOverlay = null;
  if (!storyState.journalPreview && gameState.resonanceState.xiaochu === RESONANCE_STATES.BOOK_READING && finished) {
    queueDialogue('xiaochu_after_book', () => {
      setResonanceState('xiaochu', RESONANCE_STATES.OATH_READY);
      render();
    });
  }
  if (!storyState.journalPreview && gameState.chapter1State === CHAPTER1_STATES.JOURNAL_READING && finished) {
    queueDialogue('chapter1_after_book', () => {
      setChapter1State(CHAPTER1_STATES.COMPLETE);
      render();
    });
  }
}

export function advanceTravelJournal() {
  const chapter = JOURNAL_CHAPTERS.find(entry => entry.id === storyState.journalChapterId) || JOURNAL_CHAPTERS[0];
  if (storyState.journalPage < chapter.pages.length - 1) {
    const page = document.getElementById('journalPageText');
    const turningLeaf = document.getElementById('journalTurningLeaf');
    const nextButton = document.getElementById('journalNextBtn');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (turningLeaf.classList.contains('turning')) return;
    if (reducedMotion) {
      storyState.journalPage++;
      renderJournalPage();
      return;
    }

    document.getElementById('journalTurningPageText').textContent = page.textContent;
    document.getElementById('journalTurningPageText').scrollTop = page.scrollTop;
    document.getElementById('journalTurningPageNumber').textContent = t('format.page', {
      current: formatLocaleNumber(storyState.journalPage + 1),
      total: formatLocaleNumber(chapter.pages.length),
    });
    nextButton.disabled = true;
    storyState.journalPage++;
    renderJournalPage();
    journalPageTransition?.cancel();
    const transition = beginManagedTransition('journalPageTurn');
    journalPageTransition = transition;
    const finishTurn = () => transition.finish(() => {
      turningLeaf.classList.remove('turning');
      turningLeaf.setAttribute('aria-hidden', 'true');
      document.getElementById('journalTurningPageText').textContent = '';
      nextButton.disabled = false;
      if (gameState.activeOverlay === 'journal') nextButton.focus();
      if (journalPageTransition === transition) journalPageTransition = null;
    });
    transition.listen(turningLeaf, 'animationend', event => {
      if (event.target === turningLeaf) afterAnimationPaint(finishTurn);
    });
    turningLeaf.classList.remove('turning');
    void turningLeaf.offsetWidth;
    turningLeaf.classList.add('turning');
    transition.after(1100, finishTurn);
  } else {
    if (journalStoryReading()) closeTravelJournal(true);
    else showJournalContents();
  }
}

function resetJournalPageTurn() {
  journalPageTransition?.cancel();
  journalPageTransition = null;
  const turningLeaf = document.getElementById('journalTurningLeaf');
  if (!turningLeaf) return;
  turningLeaf.classList.remove('turning');
  turningLeaf.setAttribute('aria-hidden', 'true');
  document.getElementById('journalTurningPageText').textContent = '';
  document.getElementById('journalNextBtn').disabled = false;
}

export function openContractPanel() {
  const hasPendingSoul = gameState.resonanceState.xiaochu === RESONANCE_STATES.OATH_READY;
  if (!hasPendingSoul && gameState.resonanceState.xiaochu !== RESONANCE_STATES.CONTRACTED) return;
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
  if (gameState.resonanceState.xiaochu === RESONANCE_STATES.CONTRACTED) return openContractPanel();
  if (gameState.resonanceState.xiaochu !== RESONANCE_STATES.OATH_READY) return;
  queueDialogue('xiaochu_contract_prepare', openContractPanel);
}

export function closeContractPanel() {
  const overlay = document.getElementById('contractOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  if (gameState.activeOverlay === 'contract') gameState.activeOverlay = null;
}

export function confirmXiaochuContract() {
  if (gameState.resonanceState.xiaochu !== RESONANCE_STATES.OATH_READY) return;
  closeContractPanel();
  setResonanceState('xiaochu', RESONANCE_STATES.CONTRACTING);
  queueDialogue('xiaochu_oath', () => {
    queueDialogue('xiaochu_first_possession', () => {
      setResonanceState('xiaochu', RESONANCE_STATES.CONTRACTED);
      unlockChar('xiaochu');
      render();
    });
  });
}

export function advanceDialogue() {
  if (storyState.dialoguePhase !== 'dialogue' || !storyState.dialogueScript || storyState.lineEffectLocked) return;
  storyState.dialogueLineIndex++;
  if (storyState.dialogueLineIndex < storyState.dialogueScript.length) return renderDialogueLine();
  const presentation = DIALOGUE_PRESENTATION[storyState.dialogueScriptId];
  if (presentation && presentation.outro === 'contractFormed') startContractFormed(presentation.partner);
  else if (presentation && presentation.outro === 'heavenDeparture') startHeavenDeparture();
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
  presentationRun = beginManagedTransition('story-presentation');
  presentationRun.after(heavenTransitionDuration(3200), finishContractFormed);
}

export function finishContractFormed() {
  if (storyState.dialoguePhase === 'outro') closeDialogue();
}

export function closeDialogue() {
  presentationRun?.cancel();
  presentationRun = null;
  heavenTransitionRun?.cancel();
  heavenTransitionRun = null;
  dialogueLineEffectRun?.cancel();
  dialogueLineEffectRun = null;
  resetHeavenTransitionStage();
  resetTeleportStoneBreak();
  document.getElementById('soulResonance').classList.remove('playing');
  document.getElementById('soulResonance').setAttribute('aria-hidden', 'true');
  document.getElementById('contractFormed').classList.remove('playing');
  document.getElementById('contractFormed').setAttribute('aria-hidden', 'true');
  document.getElementById('dialogueModal').classList.remove('presentationHidden');
  const overlay = document.getElementById('dialogueOverlay');
  overlay.classList.remove('heavenDialogue');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  if (gameState.activeOverlay === 'dialogue') gameState.activeOverlay = null;
  storyState.dialoguePhase = 'closed';
  storyState.dialogueScript = null;
  storyState.dialogueScriptId = null;
  storyState.lastDialogueSpeaker = null;
  storyState.seenDialogueSpeakers.clear();
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
    if (event.target.closest('#soulResonance, #contractFormed, #heavenTransition')) return;
    if (storyState.dialoguePhase === 'dialogue') advanceDialogue();
  });
  document.getElementById('travelJournalBtn').addEventListener('click', openTravelJournal);
  document.getElementById('journalCloseBtn').addEventListener('click', () => closeTravelJournal(false));
  document.getElementById('journalNextBtn').addEventListener('click', advanceTravelJournal);
  document.getElementById('journalContentsBtn').addEventListener('click', showJournalContents);
  document.getElementById('journalResumeBtn').addEventListener('click', () => openJournalChapter(gameState.journalReading.chapterId, true));
  document.getElementById('journalPrevBtn').addEventListener('click', () => {
    if (document.getElementById('journalTurningLeaf').classList.contains('turning') || storyState.journalPage <= 0) return;
    storyState.journalPage--;
    renderJournalPage();
  });
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
      if (storyState.dialoguePhase === 'dialogue' && !event.repeat) advanceDialogue();
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
      if (gameState.activeOverlay === 'dialogue' &&
          (storyState.dialoguePhase !== 'dialogue' || storyState.lineEffectLocked)) return;
      previewContract('xiaochu');
    }
  });
}
