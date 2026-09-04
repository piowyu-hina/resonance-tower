import { EVENT_IDLE_MS, ITEM_DEFS } from './constants.js';
import { activeAliveMembers, gameState, log } from './state.js';
import { addInventoryItem } from './shop.js';

const EVENT_RESULT_DELAY_MS = 1100;
const CRYSTAL_COUNT = 4;
const MUSHROOM_TARGET = Object.freeze([
  2, 1, 2,
  1, 2, 1,
  2, 1, 2,
]);
const MUSHROOM_LABELS = ['沉睡', '青色', '金色'];
const CRATE_SYMBOLS = ['❧', '●', '◆', '☼'];
const CRATE_TARGET = Object.freeze([0, 1, 2]);

export const EVENT_DEFS = Object.freeze([
  {
    id: 'abandoned-camp',
    kind: 'choice',
    image: 'abandoned_camp.png',
    title: '餘火未熄的營地',
    description: '林間留著一座剛被遺棄的營地。餘火、行囊與散落的銅扣，各自只能帶走一份收穫。',
    options: [
      { title: '靠近餘火', desc: '讓同行者休息，恢復 25% 最大生命。', apply: () => healPartyOutcome(0.25, '餘火驅散了身上的寒意') },
      { title: '翻找行囊', desc: '帶走一瓶尚未開封的治療藥水。', apply: () => itemOutcome('potion', 1, '在行囊深處找到了一瓶藥水') },
      { title: '收起銅扣', desc: '把仍有價值的零件換成 12 枚遠征金幣。', apply: () => goldOutcome(12, '收起散落在營地旁的銅扣') },
    ],
  },
  {
    id: 'flattened-herbs',
    kind: 'puzzle',
    puzzle: 'herb',
    image: 'flattened_herbs.png',
    title: '被踩亂的藥草圃',
    description: '幾株外形相近的藥草倒伏在泥地上。旅人手記只留下一句辨識方式。',
  },
  {
    id: 'crystal-echo',
    kind: 'puzzle',
    puzzle: 'crystal',
    image: 'crystal_tree_hollow.png',
    title: '樹洞裡的結晶回聲',
    description: '四枚結晶依序亮起，像是在確認來者是否聽得見它們的共鳴。記住光芒出現的順序。',
  },
  {
    id: 'two-color-spores',
    kind: 'puzzle',
    puzzle: 'mushroom',
    image: 'two_color_spores.png',
    title: '雙色孢子的菌環',
    description: '菌環裡的光會彼此牽動。讓金色與青色交錯排列，中央必須留下金色。',
  },
  {
    id: 'slime-trail-fork',
    kind: 'choice',
    image: 'slime_trail_fork.png',
    title: '分岔的黏液足跡',
    description: '兩道黏液痕跡在樹根前分開：一道微微發亮，另一道濃得幾乎發黑。',
    options: [
      { title: '沿著亮痕', desc: '選擇看得清楚的路，穩妥收集沿途金幣。', apply: () => goldOutcome(9, '沿著發亮的足跡找到一只破舊錢袋') },
      { title: '追蹤暗痕', desc: '可能找到結晶，也可能被藏在暗處的黏液襲擊。', apply: riskyTrailOutcome },
      { title: '繞過足跡', desc: '花一點時間整理呼吸，恢復 10% 最大生命。', apply: () => healPartyOutcome(0.1, '繞路時找到一處能短暫歇腳的樹蔭') },
    ],
  },
  {
    id: 'floating-bubbles',
    kind: 'puzzle',
    puzzle: 'bubble',
    image: 'floating_slime_bubbles.png',
    title: '漂浮的黏液泡',
    description: '黏液泡裡封著不同份量的魔力。挑選數枚泡泡，讓總量恰好符合中央的刻度。',
  },
  {
    id: 'sealed-supply-crate',
    kind: 'puzzle',
    puzzle: 'crate',
    image: 'slime_sealed_supply_crate.png',
    title: '被黏液封住的補給箱',
    description: '箱蓋上的三枚轉輪仍能活動。旁邊刻著一行模糊的提示：生長、流動，而後凝結。',
  },
  {
    id: 'rain-stone-shelter',
    kind: 'choice',
    image: 'rain_stone_shelter.png',
    title: '雨幕下的石棚',
    description: '驟雨把叢林洗成灰藍色。天然石棚暫時擋住雨勢，岩縫間則閃著細小光點。',
    options: [
      { title: '倚著石壁休息', desc: '等雨勢變小，恢復 20% 最大生命。', apply: () => healPartyOutcome(0.2, '雨聲掩去了戰鬥後的疲憊') },
      { title: '接取岩縫雨露', desc: '把帶有魔力的雨露裝成一瓶迅捷藥水。', apply: () => itemOutcome('speedPotion', 1, '岩縫滴下的雨露帶著輕盈魔力') },
      { title: '撬下發亮石片', desc: '取下一枚被雨水沖亮的魔物結晶。', apply: () => itemOutcome('monsterCrystal', 1, '石縫裡卡著一枚完整結晶') },
    ],
  },
]);

const eventById = new Map(EVENT_DEFS.map(event => [event.id, event]));
const runtime = {
  def: null,
  challenge: null,
  deadline: 0,
  onComplete: null,
  runId: 0,
  resolved: false,
  timers: new Set(),
  finishTimer: null,
  lastEventId: null,
  deck: [],
};

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function drawEventId() {
  if (!runtime.deck.length) {
    runtime.deck = shuffle(EVENT_DEFS.map(event => event.id));
    if (runtime.deck.length > 1 && runtime.deck[0] === runtime.lastEventId) {
      [runtime.deck[0], runtime.deck[1]] = [runtime.deck[1], runtime.deck[0]];
    }
  }
  const id = runtime.deck.shift();
  runtime.lastEventId = id;
  return id;
}

function schedule(fn, delay) {
  const timer = setTimeout(() => {
    runtime.timers.delete(timer);
    fn();
  }, delay);
  runtime.timers.add(timer);
  return timer;
}

function clearChallengeTimers() {
  runtime.timers.forEach(timer => clearTimeout(timer));
  runtime.timers.clear();
}

function result(message, tone = 'success', logType = 'good') {
  return { message, tone, logType };
}

function goldOutcome(amount, flavor) {
  gameState.runGold += amount;
  return result(`${flavor}，獲得 ${amount} 金幣。`);
}

function itemOutcome(itemId, amount, flavor) {
  addInventoryItem(itemId, amount, true);
  const item = ITEM_DEFS[itemId];
  return result(`${flavor}，獲得${item.name} ×${amount}。`);
}

function healPartyOutcome(pct, flavor) {
  let healed = 0;
  activeAliveMembers().forEach(character => {
    const amount = Math.max(1, Math.round(character.maxHp * pct));
    const actual = Math.min(amount, character.maxHp - character.curHp);
    character.curHp += actual;
    healed += actual;
  });
  return healed > 0
    ? result(`${flavor}，隊伍共恢復 ${healed} 生命。`)
    : result(`${flavor}。目前沒有需要恢復的傷勢。`, 'neutral', '');
}

function damagePartyOutcome(pct, flavor) {
  let damage = 0;
  activeAliveMembers().forEach(character => {
    const amount = Math.max(1, Math.round(character.maxHp * pct));
    const actual = Math.min(amount, Math.max(0, character.curHp - 1));
    character.curHp -= actual;
    damage += actual;
  });
  return result(`${flavor}，隊伍損失 ${damage} 生命。`, 'failure', 'warn');
}

function riskyTrailOutcome() {
  if (Math.random() < 0.62) return itemOutcome('monsterCrystal', 1, '暗痕盡頭黏著一枚尚未被帶走的結晶');
  return damagePartyOutcome(0.15, '藏在落葉下的黏液突然炸開');
}

function consolationOutcome(flavor) {
  gameState.runGold += 2;
  return result(`${flavor}。離開前仍撿到 2 枚金幣。`, 'failure', 'warn');
}

export function bindEventUI() {
  const overlay = document.getElementById('eventOverlay');
  if (!overlay || overlay.dataset.bound === 'true') return;
  overlay.dataset.bound = 'true';
  document.getElementById('eventSkipBtn').addEventListener('click', () => skipActiveEvent('skip'));
  document.getElementById('eventChallenge').addEventListener('click', handleChallengeClick);
}

export function startRandomEvent(onComplete) {
  return startEventById(drawEventId(), onComplete);
}

export function startEventById(eventId, onComplete = null) {
  const def = eventById.get(eventId);
  const overlay = document.getElementById('eventOverlay');
  if (!def || !overlay || gameState.activeOverlay) {
    if (onComplete) onComplete();
    return false;
  }

  clearChallengeTimers();
  if (runtime.finishTimer !== null) clearTimeout(runtime.finishTimer);
  runtime.def = def;
  runtime.challenge = null;
  runtime.deadline = 0;
  runtime.onComplete = onComplete;
  runtime.runId = gameState.runId;
  runtime.resolved = false;
  runtime.finishTimer = null;

  gameState.activeOverlay = 'event';
  gameState.currentEventId = def.id;
  document.getElementById('eventKind').textContent = def.kind === 'puzzle' ? '途中解謎' : '途中事件';
  document.getElementById('eventTitle').textContent = def.title;
  document.getElementById('eventDescription').textContent = def.description;
  const art = document.getElementById('eventSceneImage');
  art.src = `assets/events/${def.image}`;
  art.alt = def.title;
  const modal = document.getElementById('eventModal');
  modal.classList.remove('resolved', 'result-success', 'result-failure', 'result-neutral');
  const feedback = document.getElementById('eventFeedback');
  feedback.textContent = '';
  feedback.className = '';
  document.getElementById('eventSkipBtn').disabled = false;
  renderChallenge(def);
  resetEventIdleTimer();
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  return true;
}

function renderChallenge(def) {
  if (def.kind === 'choice') {
    renderChoiceEvent(def);
    return;
  }
  if (def.puzzle === 'crystal') renderCrystalPuzzle();
  if (def.puzzle === 'bubble') renderBubblePuzzle();
  if (def.puzzle === 'mushroom') renderMushroomPuzzle();
  if (def.puzzle === 'crate') renderCratePuzzle();
  if (def.puzzle === 'herb') renderHerbPuzzle();
}

function renderChoiceEvent(def) {
  runtime.challenge = { type: 'choice' };
  document.getElementById('eventChallenge').innerHTML = `
    <div class="eventChoices">
      ${def.options.map((option, index) => `
        <button type="button" class="eventChoice" data-event-action="choice" data-option-index="${index}">
          <b>${option.title}</b>
          <span>${option.desc}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function crystalSequence() {
  const sequence = [];
  while (sequence.length < 4) {
    const next = Math.floor(Math.random() * CRYSTAL_COUNT);
    if (next !== sequence[sequence.length - 1]) sequence.push(next);
  }
  return sequence;
}

function renderCrystalPuzzle() {
  runtime.challenge = { type: 'crystal', sequence: crystalSequence(), progress: 0, accepting: false, previewing: false };
  document.getElementById('eventChallenge').innerHTML = `
    <div class="eventPuzzleHeading">
      <span class="eventPuzzlePrompt">先看結晶亮起的順序</span>
      <button type="button" class="eventTinyBtn" data-event-action="crystal-replay">再看一次</button>
    </div>
    <div class="crystalSequence" aria-label="結晶順序謎題">
      ${Array.from({ length: CRYSTAL_COUNT }, (_, index) => `
        <button type="button" class="crystalButton crystal-${index}" data-event-action="crystal" data-index="${index}" aria-label="第 ${index + 1} 枚結晶">
          <img src="assets/item/monster_crystal.png" alt="">
          <span>${index + 1}</span>
        </button>
      `).join('')}
    </div>
    <div class="crystalProgress" aria-hidden="true">${runtime.challenge.sequence.map(() => '<i></i>').join('')}</div>
  `;
  playCrystalSequence();
}

function playCrystalSequence() {
  const state = runtime.challenge;
  if (!state || state.type !== 'crystal') return;
  clearChallengeTimers();
  state.progress = 0;
  state.accepting = false;
  state.previewing = true;
  updateCrystalProgress();
  const prompt = document.querySelector('#eventChallenge .eventPuzzlePrompt');
  if (prompt) prompt.textContent = '記住光芒的順序…';
  const replay = document.querySelector('[data-event-action="crystal-replay"]');
  if (replay) replay.disabled = true;

  state.sequence.forEach((crystalIndex, step) => {
    schedule(() => {
      const button = document.querySelector(`.crystalButton[data-index="${crystalIndex}"]`);
      if (button) button.classList.add('previewActive');
    }, 300 + step * 620);
    schedule(() => {
      const button = document.querySelector(`.crystalButton[data-index="${crystalIndex}"]`);
      if (button) button.classList.remove('previewActive');
    }, 680 + step * 620);
  });

  schedule(() => {
    state.previewing = false;
    state.accepting = true;
    if (prompt) prompt.textContent = '依照剛才的順序點擊';
    if (replay) replay.disabled = false;
    resetEventIdleTimer();
  }, 820 + state.sequence.length * 620);
}

function updateCrystalProgress() {
  document.querySelectorAll('.crystalProgress i').forEach((dot, index) => {
    dot.classList.toggle('complete', index < (runtime.challenge?.progress || 0));
  });
}

function renderBubblePuzzle() {
  const values = shuffle([1, 2, 3, 4, 5]);
  runtime.challenge = { type: 'bubble', values, selected: new Set(), target: 7 };
  document.getElementById('eventChallenge').innerHTML = `
    <div class="bubbleReadout">
      <span>目標魔力 <b>${runtime.challenge.target}</b></span>
      <span>目前總量 <strong id="bubbleTotal">0</strong></span>
    </div>
    <div class="bubbleChoices" aria-label="黏液泡選擇">
      ${values.map((value, index) => `
        <button type="button" class="bubbleButton bubbleTone-${index}" data-event-action="bubble" data-index="${index}" aria-pressed="false">
          <span>${value}</span>
        </button>
      `).join('')}
    </div>
    <button type="button" class="eventConfirmBtn" data-event-action="bubble-confirm" disabled>讓泡泡共鳴</button>
  `;
}

function updateBubblePuzzle() {
  const state = runtime.challenge;
  const total = [...state.selected].reduce((sum, index) => sum + state.values[index], 0);
  document.getElementById('bubbleTotal').textContent = total;
  document.getElementById('bubbleTotal').classList.toggle('over', total > state.target);
  document.querySelectorAll('.bubbleButton').forEach((button, index) => {
    const selected = state.selected.has(index);
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelector('[data-event-action="bubble-confirm"]').disabled = total !== state.target;
}

export function cycleMushroomPattern(states, index) {
  const row = Math.floor(index / 3);
  const col = index % 3;
  const affected = [[row, col], [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]];
  affected.forEach(([nextRow, nextCol]) => {
    if (nextRow < 0 || nextRow >= 3 || nextCol < 0 || nextCol >= 3) return;
    const targetIndex = nextRow * 3 + nextCol;
    states[targetIndex] = (states[targetIndex] + 1) % 3;
  });
  return states;
}

function renderMushroomPuzzle() {
  const states = [...MUSHROOM_TARGET];
  [0, 4, 8].forEach(index => cycleMushroomPattern(states, index));
  runtime.challenge = { type: 'mushroom', states, target: [...MUSHROOM_TARGET] };
  document.getElementById('eventChallenge').innerHTML = `
    <div class="mushroomInstructions">
      <span>點擊會依序切換沉睡、青色、金色，也會影響上下左右。</span>
      <span class="mushroomGoal" aria-label="目標排列">
        ${MUSHROOM_TARGET.map(state => `<i class="state-${state}"></i>`).join('')}
      </span>
    </div>
    <div class="mushroomGrid" aria-label="雙色孢子謎題">
      ${states.map((state, index) => `
        <button type="button" data-event-action="mushroom" data-index="${index}" class="mushroomCell state-${state}" aria-label="第 ${index + 1} 株，目前為${MUSHROOM_LABELS[state]}">
          <img src="assets/events/minigame/magic_mushroom_neutral.png" alt="">
        </button>
      `).join('')}
    </div>
  `;
}

function updateMushroomPuzzle() {
  const state = runtime.challenge;
  document.querySelectorAll('.mushroomCell').forEach((button, index) => {
    button.classList.remove('state-0', 'state-1', 'state-2');
    button.classList.add(`state-${state.states[index]}`);
    button.setAttribute('aria-label', `第 ${index + 1} 株，目前為${MUSHROOM_LABELS[state.states[index]]}`);
  });
}

function renderCratePuzzle() {
  runtime.challenge = { type: 'crate', symbols: [0, 0, 0] };
  document.getElementById('eventChallenge').innerHTML = `
    <div class="crateClue"><span>生長</span><i>→</i><span>流動</span><i>→</i><span>凝結</span></div>
    <div class="crateDials" aria-label="補給箱符號鎖">
      ${runtime.challenge.symbols.map((symbolIndex, index) => `
        <button type="button" data-event-action="crate-dial" data-index="${index}" aria-label="切換第 ${index + 1} 枚符號">
          <span>${CRATE_SYMBOLS[symbolIndex]}</span><small>點擊切換</small>
        </button>
      `).join('')}
    </div>
    <button type="button" class="eventConfirmBtn" data-event-action="crate-confirm">轉動鎖芯</button>
  `;
}

function updateCratePuzzle() {
  document.querySelectorAll('.crateDials button span').forEach((label, index) => {
    label.textContent = CRATE_SYMBOLS[runtime.challenge.symbols[index]];
  });
}

function renderHerbPuzzle() {
  const herbs = shuffle([
    { id: 'purple-round', image: 'herb_purple_round.png', correct: true },
    { id: 'purple-thorny', image: 'herb_purple_thorny.png', correct: false },
    { id: 'yellow-round', image: 'herb_yellow_round.png', correct: false },
    { id: 'blue-serrated', image: 'herb_blue_serrated.png', correct: false },
  ]);
  runtime.challenge = { type: 'herb', herbs };
  document.getElementById('eventChallenge').innerHTML = `
    <div class="herbClue">手記：紫色五瓣花、圓潤葉片，莖上沒有刺。</div>
    <div class="herbChoices" aria-label="選擇符合描述的藥草">
      ${herbs.map((herb, index) => `
        <button type="button" data-event-action="herb" data-index="${index}" aria-label="植株 ${index + 1}">
          <img src="assets/events/minigame/${herb.image}" alt="">
          <span>植株 ${index + 1}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function handleChallengeClick(event) {
  if (runtime.resolved || gameState.activeOverlay !== 'event') return;
  const button = event.target.closest('[data-event-action]');
  if (!button || button.disabled) return;
  resetEventIdleTimer();
  const action = button.dataset.eventAction;

  if (action === 'choice') {
    const option = runtime.def.options[Number(button.dataset.optionIndex)];
    if (option) resolveEvent(option.apply());
    return;
  }

  if (action === 'crystal-replay') {
    playCrystalSequence();
    return;
  }

  if (action === 'crystal') {
    const state = runtime.challenge;
    if (!state.accepting) return;
    const selected = Number(button.dataset.index);
    if (selected !== state.sequence[state.progress]) {
      button.classList.add('wrong');
      resolveEvent(consolationOutcome('結晶的回聲在錯誤的觸碰中散去'));
      return;
    }
    button.classList.add('correctPulse');
    schedule(() => button.classList.remove('correctPulse'), 260);
    state.progress++;
    updateCrystalProgress();
    if (state.progress >= state.sequence.length) {
      resolveEvent(itemOutcome('monsterCrystal', 1, '四枚結晶同時回應了你的順序'));
    }
    return;
  }

  if (action === 'bubble') {
    const index = Number(button.dataset.index);
    const selected = runtime.challenge.selected;
    if (selected.has(index)) selected.delete(index);
    else selected.add(index);
    updateBubblePuzzle();
    return;
  }

  if (action === 'bubble-confirm') {
    resolveEvent(itemOutcome('speedPotion', 1, '黏液泡凝成一小瓶輕盈的魔力液'));
    return;
  }

  if (action === 'mushroom') {
    cycleMushroomPattern(runtime.challenge.states, Number(button.dataset.index));
    updateMushroomPuzzle();
    const solved = runtime.challenge.states.every((state, index) => state === runtime.challenge.target[index]);
    if (solved) resolveEvent(itemOutcome('skillBook', 1, '雙色孢子排成完整的共鳴圖樣'));
    return;
  }

  if (action === 'crate-dial') {
    const index = Number(button.dataset.index);
    runtime.challenge.symbols[index] = (runtime.challenge.symbols[index] + 1) % CRATE_SYMBOLS.length;
    updateCratePuzzle();
    return;
  }

  if (action === 'crate-confirm') {
    const solved = runtime.challenge.symbols.every((symbol, index) => symbol === CRATE_TARGET[index]);
    resolveEvent(solved
      ? itemOutcome('potion', 1, '符號依序咬合，補給箱應聲開啟')
      : consolationOutcome('鎖芯發出沉悶聲響，箱上的黏液隨即重新凝固'));
    return;
  }

  if (action === 'herb') {
    const herb = runtime.challenge.herbs[Number(button.dataset.index)];
    resolveEvent(herb?.correct
      ? itemOutcome('statBook', 1, '你依照手記找到了真正的藥草，葉下還壓著一本能力書')
      : consolationOutcome('摘下的植株與手記描述並不相符'));
  }
}

export function resetEventIdleTimer() {
  if (gameState.activeOverlay !== 'event' || runtime.resolved) return;
  runtime.deadline = Date.now() + EVENT_IDLE_MS;
  gameState.eventCountdown = EVENT_IDLE_MS;
  updateEventCountdown();
}

function updateEventCountdown() {
  const remaining = Math.max(0, runtime.deadline - Date.now());
  gameState.eventCountdown = remaining;
  const countdown = document.getElementById('eventCountdown');
  const bar = document.getElementById('eventIdleBar');
  if (countdown) countdown.textContent = Math.ceil(remaining / 1000);
  if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, remaining / EVENT_IDLE_MS))})`;
}

export function tickEventIdle() {
  if (gameState.activeOverlay !== 'event' || runtime.resolved) return;
  updateEventCountdown();
  if (runtime.deadline <= Date.now()) skipActiveEvent('timeout');
}

export function skipActiveEvent(reason = 'skip') {
  if (gameState.activeOverlay !== 'event' || runtime.resolved) return false;
  if (reason === 'timeout' && runtime.def?.kind === 'puzzle') {
    resolveEvent(consolationOutcome('沒有停下腳步解開謎題'));
  } else {
    resolveEvent(result(reason === 'timeout' ? '沒有停留，隊伍繼續向叢林深處前進。' : '略過眼前的事物，繼續前進。', 'neutral', ''));
  }
  return true;
}

function resolveEvent(outcome) {
  if (runtime.resolved || gameState.activeOverlay !== 'event') return;
  runtime.resolved = true;
  clearChallengeTimers();
  gameState.eventCountdown = 0;
  const modal = document.getElementById('eventModal');
  modal.classList.add('resolved', `result-${outcome.tone}`);
  const feedback = document.getElementById('eventFeedback');
  feedback.textContent = outcome.message;
  feedback.className = outcome.tone;
  document.getElementById('eventSkipBtn').disabled = true;
  document.querySelectorAll('#eventChallenge button').forEach(button => { button.disabled = true; });
  if (outcome.logType) log(`事件「${runtime.def.title}」：${outcome.message}`, outcome.logType);
  runtime.finishTimer = setTimeout(finishActiveEvent, EVENT_RESULT_DELAY_MS);
}

function finishActiveEvent() {
  if (!runtime.def) return;
  clearChallengeTimers();
  const overlay = document.getElementById('eventOverlay');
  if (overlay) {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }
  const onComplete = runtime.onComplete;
  const sameRun = runtime.runId === gameState.runId;
  runtime.def = null;
  runtime.challenge = null;
  runtime.deadline = 0;
  runtime.onComplete = null;
  runtime.resolved = false;
  runtime.finishTimer = null;
  gameState.currentEventId = null;
  gameState.eventCountdown = 0;
  if (gameState.activeOverlay === 'event') gameState.activeOverlay = null;
  if (sameRun && onComplete) onComplete();
}
