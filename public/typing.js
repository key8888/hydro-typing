/* ====== Web Speech (TTS) 発音 ====== */
let ttsEnabled = true;
let ttsVoice = null;

function pickEnglishVoice(voices) {
  if (!voices || !voices.length) return null;
  const byLang = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  const preferNames = ['Google US English', 'Samantha', 'Alex', 'Microsoft Aria', 'Microsoft Zira'];
  for (const name of preferNames) {
    const hit = byLang.find(v => v.name.includes(name));
    if (hit) return hit;
  }
  return byLang[0] || voices[0];
}

function initVoices() {
  try {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    ttsVoice = pickEnglishVoice(voices);
  } catch {}
}

function speakWord(text) {
  if (!ttsEnabled || !text) return;
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
  try { window.speechSynthesis.cancel(); } catch {}
  const utt = new SpeechSynthesisUtterance(text);
  if (ttsVoice) utt.voice = ttsVoice;
  utt.rate = 0.9; utt.pitch = 1.0; utt.volume = 1.0;
  try { window.speechSynthesis.speak(utt); } catch {}
}

if ('speechSynthesis' in window) {
  initVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', initVoices);
}

document.getElementById('tts-toggle')?.addEventListener('change', (e) => {
  ttsEnabled = e.target.checked;
  if (!ttsEnabled) {
    try { window.speechSynthesis.cancel(); } catch {}
  } else {
    const cur = sessionWords[currentWordIndex];
    if (cur?.word) speakWord(cur.word);
  }
});

/* ===== タイピングロジック ===== */
const baseWords = items;
const levelConfigs = {
  beginner: {
    label: '初級',
    description: '0〜300の単語から30語を出題します。',
    count: 30,
    poolStart: 0,
    poolEnd: 300,
    hideMode: 'none',
  },
  intermediate: {
    label: '中級',
    description: '全単語から40語。頭文字は伏せ字になり、正しくタイプすると表示されます。',
    count: 40,
    poolStart: 0,
    poolEnd: null,
    hideMode: 'head',
  },
  advanced: {
    label: '上級',
    description: '全単語から50語。ランダムな2〜3文字が伏せ字になります。',
    count: 50,
    poolStart: 0,
    poolEnd: null,
    hideMode: 'partial',
  },
  'coinget-intermediate': {
    /*
     * コインゲット（中級）
     * タイピング内容は INTERMEDIATE と同一（40語 / 頭文字伏せ字）。
     * isCoinMode: true により、終了時にコイン計算APIが呼ばれる。
     * このモードに入るには管理者発行の4桁パスワードが必要。
     */
    label: 'COIN GET 中級',
    description: '全単語から40語。コインを獲得できます。',
    count: 4, //4 for testing, can be changed to 40 for real use
    poolStart: 0,
    poolEnd: null,
    hideMode: 'head',
    isCoinMode: true,
  },
  'coinget-advanced': {
    /*
     * コインゲット（上級）
     * タイピング内容は ADVANCED と同一（50語 / ランダム2〜3文字伏せ字）。
     * コイン計算式は管理者がカスタマイズ可能（デフォルト: wpm * 3 + 20）。
     */
    label: 'COIN GET 上級',
    description: '全単語から50語。コインを獲得できます。',
    count: 5, //5 for testing, can be changed to 50 for real use
    poolStart: 0,
    poolEnd: null,
    hideMode: 'partial',
    isCoinMode: true,
  },
};

let sessionWords = [];
let hiddenIndices = [];
let totalWords = 0;
let currentWordIndex = 0, currentCharIndex = 0, correctChars = 0;
let startedAt = null, finishedAt = null, waitingNext = false;
let activeLevel = 'beginner';
/* コインゲットモード用の状態変数 */
let isCoinMode = false;        // 現在のセッションがコインゲットモードかどうか
let pendingCoinLevel = null;   // パスワード認証後に開始する予定のレベルキー

const hudRemaining = document.getElementById('hud-remaining');
const wordDisplay = document.getElementById('word-display');
const meaningEl = document.getElementById('meaning-display');
const endScreen = document.getElementById('end-screen');
const finalWpmEl = document.getElementById('final-wpm');
const finalCharsEl = document.getElementById('final-chars');
const finalTimeEl = document.getElementById('final-time');
const scoreInput = document.getElementById('score-input');
const levelTitle = document.getElementById('level-title');
const levelDescription = document.getElementById('level-description');
const levelTabs = document.querySelectorAll('.level-tab');
const coinTabs = document.querySelectorAll('.coin-tab'); // コインゲットモード用タブ
const restartBtn = document.getElementById('restart-btn');

/* パスワードダイアログ関連のDOM要素 */
const pwDialog = document.getElementById('pw-dialog');
const pwInput = document.getElementById('pw-input');
const pwError = document.getElementById('pw-error');
const pwSubmit = document.getElementById('pw-submit');
const pwCancel = document.getElementById('pw-cancel');
/* コイン獲得結果表示関連のDOM要素 */
const coinResult = document.getElementById('coin-result');
const coinsEarnedEl = document.getElementById('coins-earned');
const coinsTotalEl = document.getElementById('coins-total');

function pad2(n){return n.toString().padStart(2,'0');}

function shuffle(arr){
  const copy = arr.slice();
  for(let i=copy.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [copy[i],copy[j]]=[copy[j],copy[i]];
  }
  return copy;
}

function buildHiddenSet(mode, word){
  const set=new Set();
  if(!word) return set;
  if(mode==='head' && word.length>0){
    set.add(0);
  } else if(mode==='partial'){
    const hideCount=Math.min(word.length, 2 + Math.floor(Math.random()*2)); // 2 or 3
    while(set.size<hideCount){
      const idx=Math.floor(Math.random()*word.length);
      set.add(idx);
      if(set.size===word.length) break;
    }
  }
  return set;
}

function pickWords(levelKey){
  const cfg=levelConfigs[levelKey];
  const end = cfg.poolEnd ?? baseWords.length;
  const pool = baseWords.slice(cfg.poolStart, end);
  const sampled = shuffle(pool).slice(0, cfg.count);
  hiddenIndices = sampled.map(w => buildHiddenSet(cfg.hideMode, w.word));
  return sampled;
}

function renderRemaining(){
  hudRemaining.textContent = `: ${Math.max(totalWords - currentWordIndex,0)} / ${totalWords}`;
}

function renderWord(showWrong=false){
  const cur = sessionWords[currentWordIndex] || {word:'',meaning:''};
  const word = cur.word||'', meaning = cur.meaning||'';
  const hiddenSet = hiddenIndices[currentWordIndex] || new Set();
  let html='';
  for(let i=0;i<word.length;i++){
    const ch = word[i];
    const stillHidden = hiddenSet.has(i) && i>=currentCharIndex;
    const classes=['char'];
    if(i<currentCharIndex) classes.push('char--correct');
    else if(i===currentCharIndex) classes.push(showWrong?'char--wrong':'char--todo','char--current');
    else classes.push('char--todo');
    if(stillHidden) classes.push('char--hidden');
    const displayChar = (i<currentCharIndex || !stillHidden) ? ch : '•';
    html+=`<span class="${classes.join(' ')}">${displayChar}</span>`;
  }
  wordDisplay.innerHTML=html;
  meaningEl.textContent=meaning;
  renderRemaining();
}

async function finish(){
  finishedAt=Date.now();
  waitingNext=false;
  const elapsedMs=Math.max(1,finishedAt-(startedAt??finishedAt));
  const minutes=elapsedMs/60000;
  const wpm=Math.round((correctChars/5)/minutes);
  wordDisplay.style.display='none';
  meaningEl.style.display='none';
  endScreen.style.display='block';
  finalWpmEl.textContent=String(wpm);
  finalCharsEl.textContent=String(correctChars);
  finalTimeEl.textContent=(elapsedMs/1000).toFixed(1);
  scoreInput.value=String(wpm);

  /*
   * コインゲットモードの場合：
   * 1. 通常のスコア保存フォームを非表示にする
   * 2. fetch で /typing/coin/save に POST し、WPMとモードからコインを計算してもらう
   * 3. サーバーは計算式を評価 → コイン加算 → 結果を返す
   * 4. 獲得コイン数と累計残高を画面に表示
   *
   * URLSearchParams (form-urlencoded) を使用することで、
   * CORS preflight を回避しつつサーバーの body parser と互換性を保つ。
   */
  if (isCoinMode) {
    scoreInput.closest('form').style.display = 'none';
    try {
      const formData = new URLSearchParams();
      formData.append('wpm', String(wpm));
      formData.append('mode', activeLevel);
      const res = await fetch('/typing/coin/save', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        coinsEarnedEl.textContent = String(data.coinsEarned);
        coinsTotalEl.textContent = String(data.totalCoins);
        coinResult.style.display = 'block';
      }
    } catch {}
  } else {
    coinResult.style.display = 'none';
    scoreInput.closest('form').style.display = '';
  }
}

function nextWord(){
  currentWordIndex++; currentCharIndex=0; waitingNext=false;
  if(currentWordIndex>=totalWords) finish();
  else renderWord(false);
}

function updateLevelUI(levelKey){
  const cfg=levelConfigs[levelKey];
  levelTitle.textContent = `${cfg.label} · ${cfg.count} words`;
  levelDescription.textContent = cfg.description;
  levelTabs.forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.level===levelKey);
  });
  // コインゲットタブも通常タブと同様に active 状態を更新
  coinTabs.forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.level===levelKey);
  });
}

function resetSession(levelKey){
  activeLevel = levelKey;
  // levelConfig に isCoinMode フラグがあればコインモードと判定
  isCoinMode = !!levelConfigs[levelKey]?.isCoinMode;
  sessionWords = pickWords(levelKey);
  totalWords = sessionWords.length;
  currentWordIndex = 0;
  currentCharIndex = 0;
  correctChars = 0;
  startedAt = null;
  finishedAt = null;
  waitingNext = false;
  endScreen.style.display='none';
  wordDisplay.style.display='block';
  meaningEl.style.display='block';
  // コイン結果表示をリセット、スコア保存フォームを再表示
  coinResult.style.display='none';
  scoreInput.closest('form').style.display='';
  updateLevelUI(levelKey);
  renderWord(false);
}

document.addEventListener('keydown',(e)=>{
  /* パスワードダイアログ表示中はタイピング入力を無視する */
  if (pwDialog && pwDialog.style.display !== 'none') return;
  if(waitingNext||endScreen.style.display==='block')return;
  if(!startedAt&&e.key&&e.key.length===1){
    startedAt=Date.now();
    const cur0=sessionWords[currentWordIndex];
    if(cur0?.word)speakWord(cur0.word);
  }
  const cur=sessionWords[currentWordIndex]||{word:''};
  const expected=cur.word[currentCharIndex];
  if(!expected||!e.key||e.key.length!==1)return;
  if(e.key.toLowerCase()===expected.toLowerCase()){
    currentCharIndex++; correctChars++;
    // OW theme: correct key flash
    wordDisplay.classList.add('typing-word--correct');
    setTimeout(() => wordDisplay.classList.remove('typing-word--correct'), 120);
    renderWord(false);
    if(currentCharIndex===cur.word.length){
      waitingNext=true;
      setTimeout(()=>{
        nextWord();
        const next=sessionWords[currentWordIndex];
        if(next?.word)speakWord(next.word);
      },1000);
    }
  }else {
    // OW theme: wrong key flash
    wordDisplay.classList.add('typing-word--wrong');
    setTimeout(() => wordDisplay.classList.remove('typing-word--wrong'), 200);
    renderWord(true);
  }
});

levelTabs.forEach(btn => {
  btn.addEventListener('click', ()=>{
    resetSession(btn.dataset.level);
  });
});

/* ===== コインゲットモード：パスワードダイアログ ===== */
/*
 * コインゲットモードのフロー：
 * 1. ユーザーが COIN GET タブをクリック
 * 2. showPasswordDialog(levelKey) で4桁入力ダイアログを表示
 * 3. ユーザーがパスワードを入力 → UNLOCK クリック
 * 4. fetch POST /typing/coin/verify でサーバー検証
 * 5. 成功 → ダイアログを閉じ、resetSession(levelKey) でモード開始
 * 6. 失敗 → エラーメッセージを表示（ダイアログは開いたまま）
 *
 * 注意：hidePasswordDialog() は pendingCoinLevel を null にクリアするため、
 * 呼び出し前にローカル変数へ退避する必要がある（バグ修正済み）。
 */
function showPasswordDialog(levelKey) {
  pendingCoinLevel = levelKey;
  pwDialog.style.display = 'flex';
  pwInput.value = '';
  pwError.style.display = 'none';
  pwInput.focus();
}

function hidePasswordDialog() {
  pwDialog.style.display = 'none';
  pendingCoinLevel = null;
}

pwSubmit?.addEventListener('click', async () => {
  const pw = pwInput.value.trim();
  if (!/^\d{4}$/.test(pw)) {
    pwError.textContent = 'Enter a 4-digit password';
    pwError.style.display = 'block';
    return;
  }
  try {
    const formData = new URLSearchParams();
    formData.append('password', pw);
    const res = await fetch('/typing/coin/verify', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.success) {
      /*
       * hidePasswordDialog() が pendingCoinLevel を null で上書きしてしまうため、
       * 先にローカル変数に退避しておく。
       * （hidePasswordDialog → pendingCoinLevel=null → if(pendingCoinLevel) が常に偽になるバグの修正）
       */
      const level = pendingCoinLevel;
      hidePasswordDialog();
      if (level) resetSession(level);
    } else {
      pwError.textContent = 'Invalid or expired password';
      pwError.style.display = 'block';
    }
  } catch {
    pwError.textContent = 'Server error. Try again.';
    pwError.style.display = 'block';
  }
});

/* キャンセルボタン：ダイアログを閉じて pendingCoinLevel をクリア */
pwCancel?.addEventListener('click', () => {
  hidePasswordDialog();
});

/* Enter キーで送信、Escape キーでキャンセル */
pwInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') pwSubmit?.click();
  if (e.key === 'Escape') hidePasswordDialog();
});

/* ダイアログ外側（オーバーレイ）クリックで閉じる */
pwDialog?.addEventListener('click', (e) => {
  if (e.target === pwDialog) hidePasswordDialog();
});

/* コインゲットタブのクリックでパスワードダイアログを表示 */
coinTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    showPasswordDialog(btn.dataset.level);
  });
});

restartBtn?.addEventListener('click', ()=>{
  resetSession(activeLevel);
});

resetSession('beginner');

/* 履歴の日付整形 */
(function(){
  const cells=document.querySelectorAll('.js-date');
  const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  for(const td of cells){
    const d=new Date(td.textContent?.trim()??'');
    if(!isNaN(d))td.textContent=`${weekday[d.getDay()]} ${month[d.getMonth()]} ${pad2(d.getDate())} ${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
})();
