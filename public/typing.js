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
    const cur = items[currentWordIndex];
    if (cur?.word) speakWord(cur.word);
  }
});

/* ===== タイピングロジック ===== */
const totalWords = items.length;
let currentWordIndex = 0, currentCharIndex = 0, correctChars = 0;
let startedAt = null, finishedAt = null, waitingNext = false;

const hudRemaining = document.getElementById('hud-remaining');
const wordDisplay = document.getElementById('word-display');
const meaningEl = document.getElementById('meaning-display');
const endScreen = document.getElementById('end-screen');
const finalWpmEl = document.getElementById('final-wpm');
const finalCharsEl = document.getElementById('final-chars');
const finalTimeEl = document.getElementById('final-time');
const scoreInput = document.getElementById('score-input');

function pad2(n){return n.toString().padStart(2,'0');}
function renderRemaining(){
  // left単語数
  hudRemaining.textContent = `: ${Math.max(totalWords - currentWordIndex,0)} / ${totalWords}`;
}
function renderWord(showWrong=false){
  const cur = items[currentWordIndex] || {word:'',meaning:''};
  const word = cur.word||'', meaning = cur.meaning||'';
  let html='';
  for(let i=0;i<word.length;i++){
    const ch = word[i];
    if(i<currentCharIndex) html+=`<span class="char char--correct">${ch}</span>`;
    else if(i===currentCharIndex){
      html+=`<span class="char ${showWrong?'char--wrong':'char--todo'} char--current">${ch}</span>`;
    }else html+=`<span class="char char--todo">${ch}</span>`;
  }
  wordDisplay.innerHTML=html;
  meaningEl.textContent=meaning;
  renderRemaining();
}
function finish(){
  finishedAt=Date.now();
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

document.addEventListener('keydown',(e)=>{
  if(waitingNext||endScreen.style.display==='block')return;
  if(!startedAt&&e.key&&e.key.length===1){
    startedAt=Date.now();
    const cur0=items[currentWordIndex];
    if(cur0?.word)speakWord(cur0.word);
  }
  const cur=items[currentWordIndex]||{word:''};
  const expected=cur.word[currentCharIndex];
  if(!expected||!e.key||e.key.length!==1)return;
  if(e.key.toLowerCase()===expected.toLowerCase()){
    currentCharIndex++; correctChars++; renderWord(false);
    if(currentCharIndex===cur.word.length){
      waitingNext=true;
      setTimeout(()=>{
        nextWord();
        const next=items[currentWordIndex];
        if(next?.word)speakWord(next.word);
      },1000);
    }
  }else renderWord(true);
});
renderWord(false);

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
