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
};

let sessionWords = [];
let hiddenIndices = [];
let totalWords = 0;
let currentWordIndex = 0, currentCharIndex = 0, correctChars = 0;
let startedAt = null, finishedAt = null, waitingNext = false;
let activeLevel = 'beginner';

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
const restartBtn = document.getElementById('restart-btn');

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

function finish(){
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
}

function resetSession(levelKey){
  activeLevel = levelKey;
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
  updateLevelUI(levelKey);
  renderWord(false);
}

document.addEventListener('keydown',(e)=>{
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
    currentCharIndex++; correctChars++; renderWord(false);
    if(currentCharIndex===cur.word.length){
      waitingNext=true;
      setTimeout(()=>{
        nextWord();
        const next=sessionWords[currentWordIndex];
        if(next?.word)speakWord(next.word);
      },1000);
    }
  }else renderWord(true);
});

levelTabs.forEach(btn => {
  btn.addEventListener('click', ()=>{
    resetSession(btn.dataset.level);
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
