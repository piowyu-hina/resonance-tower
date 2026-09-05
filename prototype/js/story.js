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
import { XIAOCHU_DIALOGUES } from './xiaochu-story.js';

// --- 對話與契約演出 ---
export const DIALOGUE_DEFS = {
  ...XIAOCHU_DIALOGUES,
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
    {"speaker":"narrator","text":"無名清掉眼前最後一隻怪物，放下劍，喘了口氣。", wumingBeat: 'idle'},
    {"speaker":"narrator","text":"草叢忽然晃動。一隻史萊姆從裡面跳了出來。", slimeBeat: 'enter'},
    {"speaker":"xiaochu_voice","text":"右邊！牠要跳過去了！"},
    {"speaker":"narrator","text":"無名下意識往旁邊閃。史萊姆擦過他的身側，落在地上。", slimeBeat: 'hop', wumingBeat: 'dodge'},
    {"speaker":"wuming","text":"誰……？"},
    {"speaker":"xiaochu_voice","text":"先別看這邊！牠轉過來了！"},
    {"speaker":"narrator","text":"史萊姆縮起身體。", slimeBeat: 'crouch'},
    {"speaker":"xiaochu_voice","text":"就是現在，揮劍！"},
    {"speaker":"narrator","text":"無名揮下劍。史萊姆卻突然彈起，撞進他的懷裡。", slimeBeat: 'hit', wumingBeat: 'hit'},
    {"speaker":"wuming","text":"嗚哇！"},
    {"speaker":"narrator","text":"無名跌坐在地。史萊姆落下後，再次朝他跳來。", slimeBeat: 'hop'},
    {"speaker":"narrator","text":"這次無名沒有急著揮劍。他側身躲過撞擊，趁史萊姆落地時補上一劍。", slimeBeat: 'defeat', wumingBeat: 'strike'},
    {"speaker":"narrator","text":"四周安靜下來。", slimeBeat: 'gone'},
    {"speaker":"wuming","text":"……剛才是誰叫我揮劍的？"},
    {"speaker":"xiaochu_voice","text":"……"},
    {"speaker":"wuming","text":"我有聽到喔。"},
    {"speaker":"xiaochu_voice","text":"你聽得到？"},
    {"speaker":"narrator","text":"無名轉過頭。一名披著紅色斗篷的金髮少女站在樹旁，睜大眼睛望著他。"},
    {"speaker":"wuming","text":"妳喊那麼大聲。"},
    {"speaker":"xiaochu_unknown","text":"不是，我是說……"},
    {"speaker":"narrator","text":"少女往前走了兩步。"},
    {"speaker":"xiaochu_unknown","text":"你真的聽得到我？"},
    {"speaker":"wuming","text":"……聽得到啊。"},
    {"speaker":"xiaochu_unknown","text":"也看得到？"},
    {"speaker":"wuming","text":"嗯。"},
    {"speaker":"narrator","text":"少女張了張嘴，卻沒有立刻說話。"},
    {"speaker":"wuming","text":"怎麼了？"},
    {"speaker":"xiaochu_unknown","text":"沒、沒什麼！"},
    {"speaker":"narrator","text":"她低頭看見無名仍坐在地上。"},
    {"speaker":"xiaochu_unknown","text":"啊……你還好嗎？"},
    {"speaker":"wuming","text":"剛才那一下有點痛。"},
    {"speaker":"xiaochu_unknown","text":"對不起。"},
    {"speaker":"wuming","text":"妳不是說那時候可以揮劍嗎？"},
    {"speaker":"xiaochu_unknown","text":"我以為來得及……"},
    {"speaker":"wuming","text":"牠縮起來的時候，通常還會再跳一次。"},
    {"speaker":"xiaochu_unknown","text":"……原來是這樣。"},
    {"speaker":"wuming","text":"妳以前打過史萊姆嗎？"},
    {"speaker":"narrator","text":"少女移開視線。"},
    {"speaker":"xiaochu_unknown","text":"沒有。"},
    {"speaker":"wuming","text":"一次都沒有？"},
    {"speaker":"xiaochu_unknown","text":"……一次都沒有。"},
    {"speaker":"wuming","text":"那妳剛才怎麼喊得那麼有把握？"},
    {"speaker":"xiaochu_unknown","text":"我有練過劍啊！只是……"},
    {"speaker":"narrator","text":"她的聲音小了下去。"},
    {"speaker":"xiaochu_unknown","text":"練習的時候，不會有東西突然撞過來。"},
    {"speaker":"narrator","text":"無名扶著膝蓋站起身，拍掉衣服上的泥土。"},
    {"speaker":"wuming","text":"不過，第一次有幫上忙。"},
    {"speaker":"xiaochu_unknown","text":"第一次？"},
    {"speaker":"wuming","text":"妳叫我閃開的時候。"},
    {"speaker":"xiaochu_unknown","text":"……嗯。"},
    {"speaker":"narrator","text":"少女終於露出一點笑容。"},
    {"speaker":"xiaochu_unknown","text":"下次我會看準一點。"},
    {"speaker":"wuming","text":"還有下次啊？"},
    {"speaker":"xiaochu_unknown","text":"啊，不是！我是說，如果你不介意的話……"},
    {"speaker":"narrator","text":"她看了看無名，又看向他手中的劍。"},
    {"speaker":"xiaochu_unknown","text":"我可以跟著你嗎？"},
    {"speaker":"wuming","text":"妳也要走這條路？"},
    {"speaker":"xiaochu_unknown","text":"都可以。"},
    {"speaker":"wuming","text":"都可以？"},
    {"speaker":"xiaochu_unknown","text":"我只是……想找個人說說話。"},
    {"speaker":"narrator","text":"無名看著她，想起女神說過的那些孩子。"},
    {"speaker":"wuming","text":"……妳一直都在這裡嗎？"},
    {"speaker":"xiaochu_unknown","text":"有一陣子了。"},
    {"speaker":"wuming","text":"都沒有人看得到妳？"},
    {"speaker":"narrator","text":"少女搖了搖頭。"},
    {"speaker":"xiaochu_unknown","text":"你是第一個停下來回答我的人。"},
    {"speaker":"narrator","text":"無名把劍收好。"},
    {"speaker":"wuming","text":"那就一起走吧。"},
    {"speaker":"xiaochu_unknown","text":"真的？"},
    {"speaker":"wuming","text":"嗯。不過妳先不要叫我揮劍。"},
    {"speaker":"xiaochu_unknown","text":"……知道了。"},
    {"speaker":"narrator","text":"兩人走了幾步，少女忽然追到他身旁。"},
    {"speaker":"xiaochu","text":"對了，我叫小初！"},
    {"speaker":"wuming","text":"我叫無名。"},
    {"speaker":"xiaochu","text":"無名……"},
    {"speaker":"xiaochu","text":"剛才撞到的地方，真的沒事嗎？"},
    {"speaker":"wuming","text":"妳現在才擔心啊？"},
    {"speaker":"xiaochu","text":"我剛才也有擔心！"},
  ],
};

export const DIALOGUE_PRESENTATION = {
  xiaochu_encounter: { backdrop: 'forest' },
  xiaochu_home: { backdrop: 'home' },
  xiaochu_trust: { backdrop: 'forest' },
  xiaochu_choice: { backdrop: 'home' },
  xiaochu_oath: { backdrop: 'home', outro: 'contractFormed', partner: 'xiaochu' },
  xiaochu_after: { backdrop: 'home' },
  chapter1_goddess: {
    intro: 'heavenArrival',
    outro: 'heavenDeparture',
    backdrop: 'heaven',
  },
};

export const STORY_SPEAKERS = {
  goddess: { name: '女神', art: 'assets/story/goddess.png', goddess: true },
  xiaochu_voice: { name: '？？？', narration: true },
  xiaochu_unknown: { name: '？？？', art: 'assets/characters/xiaochu_full_2.png' },
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
let slimeStoryRun = null;

function resetStorySlime() {
  if (slimeStoryRun) storyState.lineEffectLocked = false;
  slimeStoryRun?.cancel();
  slimeStoryRun = null;
  const actor = document.getElementById('storySlime');
  actor.hidden = true;
  actor.removeAttribute('data-beat');
  const wuming = document.getElementById('storyWuming');
  wuming.hidden = true;
  wuming.removeAttribute('data-beat');
  document.getElementById('dialogueModal').classList.remove('slimeScene');
}

function renderStorySlime(line) {
  if (storyState.dialogueScriptId !== 'xiaochu_encounter') return resetStorySlime();
  const actor = document.getElementById('storySlime');
  const wuming = document.getElementById('storyWuming');
  if (line.wumingBeat) {
    wuming.hidden = false;
    wuming.querySelector('img').src = characterFullArtPath('wuming');
    wuming.dataset.beat = line.wumingBeat;
    document.getElementById('dialogueModal').classList.add('slimeScene');
  }
  if (!line.slimeBeat) return;
  if (line.slimeBeat === 'gone') return resetStorySlime();
  actor.hidden = false;
  actor.style.setProperty('--slime-contact-x', `${wuming.offsetLeft + wuming.offsetWidth * .6 - actor.offsetLeft - actor.offsetWidth / 2}px`);
  wuming.style.setProperty('--wuming-strike-x', `${Math.max(0, actor.offsetLeft - wuming.offsetLeft - wuming.offsetWidth * 1.25)}px`);
  document.getElementById('dialogueModal').classList.add('slimeScene');
  actor.removeAttribute('data-beat');
  void actor.offsetWidth;
  actor.dataset.beat = line.slimeBeat;
  storyState.lineEffectLocked = true;
  slimeStoryRun = beginManagedTransition('story-slime');
  const run = slimeStoryRun;
  run.after(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 50 : 900, () => run.finish(() => {
    storyState.lineEffectLocked = false;
    slimeStoryRun = null;
  }));
}

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
  resetStorySlime();
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
  overlay.classList.toggle('forestDialogue', presentation?.backdrop === 'forest');
  overlay.classList.toggle('homeDialogue', presentation?.backdrop === 'home');
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
  renderStorySlime(line);
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
      img.src = line.speaker === 'xiaochu' ? STORY_SPEAKERS.xiaochu_unknown.art : characterFullArtPath(line.speaker);
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
    gameState.xiaochuStoryChapter = 0;
    if (onDone) onDone();
  });
}

export function talkToXiaochu() {
  if (gameState.activeOverlay || gameState.partyLocked || overlayUiState.prepLocation !== 'home' ||
      gameState.resonanceState.xiaochu !== RESONANCE_STATES.FOLLOWING) return;
  const chapter = gameState.xiaochuStoryChapter;
  if (chapter !== 0 && chapter !== 2) return;
  queueDialogue(chapter === 0 ? 'xiaochu_home' : 'xiaochu_choice', () => {
    gameState.xiaochuStoryChapter = chapter + 1;
    if (chapter === 2) setResonanceState('xiaochu', RESONANCE_STATES.OATH_READY);
    render();
  });
}

export function tryXiaochuTravelStory(onDone) {
  if (gameState.resonanceState.xiaochu !== RESONANCE_STATES.FOLLOWING || gameState.xiaochuStoryChapter !== 1) return false;
  queueDialogue('xiaochu_trust', () => {
    gameState.xiaochuStoryChapter = 2;
    onDone();
  });
  return true;
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

function openJournalChapter(id) {
  const chapter = JOURNAL_CHAPTERS.find(entry => entry.id === id);
  if (!chapter) return;
  resetJournalPageTurn();
  storyState.journalChapterId = id;
  storyState.journalPage = 0;
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
  list.querySelector('button')?.focus();
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
    setResonanceState('xiaochu', RESONANCE_STATES.FOLLOWING, { force: true });
    render();
  }
  if (!storyState.journalPreview && gameState.chapter1State === CHAPTER1_STATES.JOURNAL_READING && finished) {
    queueDialogue('chapter1_after_book', () => {
      setChapter1State(CHAPTER1_STATES.COMPLETE);
      render();
    });
  }
}

export function advanceTravelJournal() {
  if (document.getElementById('journalTurningLeaf').classList.contains('turning')) return;
  const chapter = JOURNAL_CHAPTERS.find(entry => entry.id === storyState.journalChapterId) || JOURNAL_CHAPTERS[0];
  if (storyState.journalPage < chapter.pages.length - 1) {
    turnJournalPage(1);
  } else {
    if (journalStoryReading()) closeTravelJournal(true);
    else showJournalContents();
  }
}

function turnJournalPage(direction) {
    const chapter = JOURNAL_CHAPTERS.find(entry => entry.id === storyState.journalChapterId) || JOURNAL_CHAPTERS[0];
    const target = storyState.journalPage + direction;
    if (target < 0 || target >= chapter.pages.length) return;
    const page = document.getElementById('journalPageText');
    const turningLeaf = document.getElementById('journalTurningLeaf');
    const readingLeaf = document.querySelector('.journalReadingLeaf');
    const nextButton = document.getElementById('journalNextBtn');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (turningLeaf.classList.contains('turning')) return;
    if (reducedMotion) {
      storyState.journalPage = target;
      renderJournalPage();
      return;
    }

    document.getElementById('journalTurningPageText').textContent = page.textContent;
    document.getElementById('journalTurningPageText').scrollTop = page.scrollTop;
    document.getElementById('journalTurningPageNumber').textContent = t('format.page', {
      current: formatLocaleNumber(storyState.journalPage + 1),
      total: formatLocaleNumber(chapter.pages.length),
    });
    storyState.journalPage = target;
    renderJournalPage();
    nextButton.disabled = true;
    document.getElementById('journalPrevBtn').disabled = true;
    document.getElementById('journalContentsBtn').disabled = true;
    journalPageTransition?.cancel();
    const transition = beginManagedTransition('journalPageTurn');
    journalPageTransition = transition;
    const finishTurn = () => transition.finish(() => {
      turningLeaf.classList.remove('turning');
      readingLeaf.classList.remove('pageTurning', 'pageTurningBack');
      turningLeaf.setAttribute('aria-hidden', 'true');
      document.getElementById('journalTurningPageText').textContent = '';
      nextButton.disabled = false;
      document.getElementById('journalPrevBtn').disabled = storyState.journalPage === 0;
      document.getElementById('journalContentsBtn').disabled = false;
      if (gameState.activeOverlay === 'journal') {
        (direction < 0 && storyState.journalPage > 0 ? document.getElementById('journalPrevBtn') : nextButton).focus();
      }
      if (journalPageTransition === transition) journalPageTransition = null;
    });
    transition.listen(turningLeaf, 'animationend', event => {
      if (event.target === turningLeaf) afterAnimationPaint(finishTurn);
    });
    turningLeaf.classList.remove('turning');
    void turningLeaf.offsetWidth;
    turningLeaf.classList.add('turning');
    readingLeaf.classList.toggle('pageTurningBack', direction < 0);
    readingLeaf.classList.add('pageTurning');
    transition.after(1100, finishTurn);
}

function resetJournalPageTurn() {
  journalPageTransition?.cancel();
  journalPageTransition = null;
  const turningLeaf = document.getElementById('journalTurningLeaf');
  if (!turningLeaf) return;
  turningLeaf.classList.remove('turning');
  document.querySelector('.journalReadingLeaf').classList.remove('pageTurning', 'pageTurningBack');
  turningLeaf.setAttribute('aria-hidden', 'true');
  document.getElementById('journalTurningPageText').textContent = '';
  document.getElementById('journalNextBtn').disabled = false;
  document.getElementById('journalPrevBtn').disabled = storyState.journalPage === 0;
  document.getElementById('journalContentsBtn').disabled = false;
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
  if (gameState.partyLocked || overlayUiState.prepLocation !== 'home') return;
  openContractPanel();
}

export function closeContractPanel() {
  const overlay = document.getElementById('contractOverlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  if (gameState.activeOverlay === 'contract') gameState.activeOverlay = null;
}

export function confirmXiaochuContract() {
  if (gameState.resonanceState.xiaochu !== RESONANCE_STATES.OATH_READY ||
      gameState.partyLocked || overlayUiState.prepLocation !== 'home' || gameState.activeOverlay !== 'contract') return;
  closeContractPanel();
  setResonanceState('xiaochu', RESONANCE_STATES.CONTRACTING);
  queueDialogue('xiaochu_oath', () => {
    setResonanceState('xiaochu', RESONANCE_STATES.CONTRACTED);
    gameState.xiaochuStoryChapter = 4;
    unlockChar('xiaochu');
    queueDialogue('xiaochu_after', render);
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
  img.src = characterId === 'xiaochu' ? STORY_SPEAKERS.xiaochu_unknown.art : characterFullArtPath(characterId);
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
  resetStorySlime();
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
  overlay.classList.remove('forestDialogue');
  overlay.classList.remove('homeDialogue');
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
  queueDialogue('xiaochu_encounter');
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
  document.getElementById('xiaochuTalkBtn').addEventListener('click', talkToXiaochu);
  document.getElementById('journalCloseBtn').addEventListener('click', () => closeTravelJournal(false));
  document.getElementById('journalNextBtn').addEventListener('click', advanceTravelJournal);
  document.getElementById('journalContentsBtn').addEventListener('click', showJournalContents);
  document.getElementById('journalPrevBtn').addEventListener('click', () => {
    turnJournalPage(-1);
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
