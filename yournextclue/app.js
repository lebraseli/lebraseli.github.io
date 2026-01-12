/* app.js — Your Next Clue
   Drop-in replacement for /yournextclue/app.js

   Changes:
   - Auto-reset on reload.
   - Tabs switch gates; reveal not in nav.
   - Music Notes: fixed octave + cheat "1324" (requires submit).
   - Sentence Repair: 2:30 timer, allow up to 5 wrong characters.
   - Grid: 15 directions, hide after 30s, click full path.
   - Grid backdoor pattern (relative to start):
        1) +3 right
        2) -2 up
        3) +2 down
        4) +4 right
*/

const $ = (id) => document.getElementById(id);

const ui = {
  themeToggle: $("themeToggle"),

  stepTrivia: $("stepTrivia"),
  stepNote: $("stepNote"),
  stepRepair: $("stepRepair"),
  stepGrid: $("stepGrid"),

  panelTitle: $("panelTitle"),
  panelDesc: $("panelDesc"),
  statusPill: $("statusPill"),

  stageTrivia: $("stageTrivia"),
  stageNote: $("stageNote"),
  stageRepair: $("stageRepair"),
  stageGrid: $("stageGrid"),
  stageReveal: $("stageReveal"),

  objective: $("objective"),
  pTrivia: $("pTrivia"),
  pNote: $("pNote"),
  pRepair: $("pRepair"),
  pGrid: $("pGrid"),

  resetProgress: $("resetProgress"),

  streak: $("streak"),
  remaining: $("remaining"),
  category: $("category"),
  question: $("question"),
  answer: $("answer"),
  submitAnswer: $("submitAnswer"),
  triviaMsg: $("triviaMsg"),

  noteStreak: $("noteStreak"),
  noteTarget: $("noteTarget"),
  playNote: $("playNote"),
  noteAnswer: $("noteAnswer"),
  submitNote: $("submitNote"),
  noteMsg: $("noteMsg"),

  repairStreak: $("repairStreak"),
  repairTarget: $("repairTarget"),
  repairTimer: $("repairTimer"),
  repairPrompt: $("repairPrompt"),
  repairAnswer: $("repairAnswer"),
  submitRepair: $("submitRepair"),
  repairMsg: $("repairMsg"),

  gridStreak: $("gridStreak"),
  gridTarget: $("gridTarget"),
  gridSteps: $("gridSteps"),
  gridBoard: $("gridBoard"),
  gridMsg: $("gridMsg"),
  resetGrid: $("resetGrid"),

  poemText: $("poemText"),
  revealMsg: $("revealMsg"),
  fragA: $("fragA"),
  fragB: $("fragB"),
  decryptPoemBtn: $("decryptPoemBtn"),
};

function assertUI(){
  const required = Object.keys(ui).filter(k => ui[k] === null);
  if(required.length){
    throw new Error("Missing required DOM IDs: " + required.join(", "));
  }
}

const TESTS = ["trivia","note","repair","grid"];
const REPAIR_TIME_MS = 150000; // 2:30
const REPAIR_MAX_DIST = 5;
const NOTE_CHEAT = "1324";

/* =========================
   UTIL
========================= */
function setMsg(el, text, kind){
  el.textContent = text || "";
  el.className = "msg" + (kind ? (" " + kind) : "");
}

function norm(s){
  return (s||"")
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g,"'")
    .replace(/[^a-z0-9\s']/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function levenshteinRaw(a,b){
  const m=a.length, n=b.length;
  if(m===0) return n;
  if(n===0) return m;
  const dp=new Array(n+1);
  for(let j=0;j<=n;j++) dp[j]=j;
  for(let i=1;i<=m;i++){
    let prev=dp[0];
    dp[0]=i;
    for(let j=1;j<=n;j++){
      const tmp=dp[j];
      const cost=a[i-1]===b[j-1]?0:1;
      dp[j]=Math.min(dp[j]+1, dp[j-1]+1, prev+cost);
      prev=tmp;
    }
  }
  return dp[n];
}

function renderSide(state){
  ui.pTrivia.textContent = `${state.trivia.streak} / ${state.trivia.target}`;
  ui.pNote.textContent   = `${state.note.streak} / ${state.note.target}`;
  ui.pRepair.textContent = `${state.repair.streak} / ${state.repair.target}`;
  ui.pGrid.textContent   = `${state.grid.streak} / ${state.grid.target}`;
}

function setStage(state, stage){
  state.stage = stage;

  // show/hide sections
  ui.stageTrivia.hidden = true;
  ui.stageNote.hidden = true;
  ui.stageRepair.hidden = true;
  ui.stageGrid.hidden = true;
  ui.stageReveal.hidden = true;

  ui.stepTrivia.classList.remove("active");
  ui.stepNote.classList.remove("active");
  ui.stepRepair.classList.remove("active");
  ui.stepGrid.classList.remove("active");

  if(stage === "trivia"){ ui.stageTrivia.hidden=false; ui.stepTrivia.classList.add("active"); }
  if(stage === "note"){ ui.stageNote.hidden=false; ui.stepNote.classList.add("active"); }
  if(stage === "repair"){ ui.stageRepair.hidden=false; ui.stepRepair.classList.add("active"); }
  if(stage === "grid"){ ui.stageGrid.hidden=false; ui.stepGrid.classList.add("active"); }
  if(stage === "reveal"){ ui.stageReveal.hidden=false; }

  // panel copy
  if(stage === "trivia"){
    ui.panelTitle.textContent = "Trivia";
    ui.panelDesc.textContent = `Get ${state.trivia.target} correct in a row.`;
    ui.objective.textContent = `${state.trivia.target} in a row`;
  } else if(stage === "note"){
    ui.panelTitle.textContent = "Music Notes";
    ui.panelDesc.textContent = `A–G only. Get ${state.note.target} in a row. (Cheat: 1324)`;
    ui.objective.textContent = `${state.note.target} in a row`;
  } else if(stage === "repair"){
    ui.panelTitle.textContent = "Sentence Repair";
    ui.panelDesc.textContent = `2:30 limit. Up to ${REPAIR_MAX_DIST} wrong characters allowed.`;
    ui.objective.textContent = `${state.repair.target} wins in a row`;
  } else if(stage === "grid"){
    ui.panelTitle.textContent = "Grid";
    ui.panelDesc.textContent = `Memorize 15 directions (30s). Then click the full path.`;
    ui.objective.textContent = `1 correct`;
  } else {
    ui.panelTitle.textContent = "Access Granted";
    ui.panelDesc.textContent = "";
    ui.objective.textContent = "";
  }

  ui.statusPill.textContent = stage === "reveal" ? "Unlocked" : "In progress";
}

/* =========================
   STATE
========================= */
const state = {
  stage: "trivia",
  cleared: new Set(),
  trivia: { target: 15, streak: 0, retired: new Set(), current: null },
  note:   { target: 5,  streak: 0, current: null },
  repair: { target: 3,  streak: 0, current: null, deadlineTs: 0, timerId: null },
  grid:   { target: 1,  streak: 0, model: null, hideTimerId: null },
  poem:   { json: null }
};

function allCleared(){
  return TESTS.every(k => state.cleared.has(k));
}

function markCleared(which){
  state.cleared.add(which);
  if(allCleared()){
    setStage(state, "reveal");
    setMsg(ui.revealMsg, "Enter fragments and decrypt.", "warn");
  } else {
    // go to next uncleared
    const next = TESTS.find(k => !state.cleared.has(k));
    setStage(state, next);
  }
}

/* =========================
   TRIVIA
========================= */
function triviaRemaining(){
  return window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id)).length;
}

function pickTrivia(){
  const pool = window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id));
  const q = pool[Math.floor(Math.random()*pool.length)];
  state.trivia.current = q;
  ui.category.textContent = q.cat;
  ui.question.textContent = q.q;
  ui.answer.value = "";
  ui.remaining.textContent = String(triviaRemaining());
  setMsg(ui.triviaMsg, "", "");
}

function matchesAny(guess, truths){
  const g = norm(guess);
  for(const t of truths){
    if(norm(t) === g) return true;
  }
  return false;
}

function checkTrivia(){
  const raw = ui.answer.value || "";
  const q = state.trivia.current;
  if(!q){ pickTrivia(); return; }

  state.trivia.retired.add(q.id);
  ui.remaining.textContent = String(triviaRemaining());

  const ok = matchesAny(raw, [q.a, ...(q.alts||[])]);
  if(ok){
    state.trivia.streak++;
    ui.streak.textContent = String(state.trivia.streak);
    renderSide(state);
    setMsg(ui.triviaMsg, "Correct.", "good");
    if(state.trivia.streak >= state.trivia.target){
      setMsg(ui.triviaMsg, "Gate cleared.", "good");
      markCleared("trivia");
      return;
    }
  } else {
    state.trivia.streak = 0;
    ui.streak.textContent = "0";
    renderSide(state);
    setMsg(ui.triviaMsg, `Wrong. Answer: ${q.a}`, "bad");
  }
  pickTrivia();
}

/* =========================
   MUSIC NOTES
========================= */
const NOTE_BANK = [
  { n:"C", f:261.63 },
  { n:"D", f:293.66 },
  { n:"E", f:329.63 },
  { n:"F", f:349.23 },
  { n:"G", f:392.00 },
  { n:"A", f:440.00 },
  { n:"B", f:493.88 },
];

let audio = { ctx:null, master:null };

function ensureAudio(){
  if(audio.ctx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  audio.ctx = new Ctx();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.12;
  audio.master.connect(audio.ctx.destination);
}

function playTone(freq, ms=700){
  ensureAudio();
  if(audio.ctx.state === "suspended") audio.ctx.resume();

  const now = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = freq;
  osc.detune.value = 0;

  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(1.0, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + ms/1000);

  osc.connect(g);
  g.connect(audio.master);

  osc.start(now);
  osc.stop(now + ms/1000 + 0.03);
}

function newNoteRound(){
  state.note.current = NOTE_BANK[Math.floor(Math.random()*NOTE_BANK.length)];
  ui.noteAnswer.value = "";
  setMsg(ui.noteMsg, "Click Play. Type A–G (or 1324). Press Submit.", "warn");
}

function checkNote(){
  const raw = (ui.noteAnswer.value || "").trim();

  // cheat
  if(raw.replace(/\s+/g,"") === NOTE_CHEAT){
    state.note.streak = state.note.target;
    ui.noteStreak.textContent = String(state.note.streak);
    renderSide(state);
    setMsg(ui.noteMsg, "Cheat accepted. Gate cleared.", "good");
    markCleared("note");
    return;
  }

  const g = raw.toUpperCase().replace(/[^A-G]/g,"").slice(0,1);
  if(!g){
    setMsg(ui.noteMsg, "Enter A–G (or 1324).", "bad");
    return;
  }

  const ok = (state.note.current && g === state.note.current.n);
  if(ok){
    state.note.streak++;
    ui.noteStreak.textContent = String(state.note.streak);
    renderSide(state);
    setMsg(ui.noteMsg, "Correct.", "good");
    if(state.note.streak >= state.note.target){
      setMsg(ui.noteMsg, "Gate cleared.", "good");
      markCleared("note");
      return;
    }
    newNoteRound();
  } else {
    state.note.streak = 0;
    ui.noteStreak.textContent = "0";
    renderSide(state);
    setMsg(ui.noteMsg, "Wrong.", "bad");
    newNoteRound();
  }
}

/* =========================
   REPAIR (2:30, 5 chars)
========================= */
const REPAIR_BANK = [
  {
    broken:
`1) Thier going too the librery, but they dont no why.
2) The quick brown fox jump ovre the lazi dog; incredble.
3) I has ate three sandwhiches, and it were'nt enough.
4) When you finish, send it too me, ASAP please??`,
    fixed:
`1) They're going to the library, but they don't know why.
2) The quick brown fox jumped over the lazy dog; incredible.
3) I ate three sandwiches, and it wasn't enough.
4) When you finish, send it to me ASAP, please.`
  },
  {
    broken:
`1) Yesterday i recieve'd your email, and I replyed imediatly.
2) If you want too win, you must practise, everyday.
3) Our team are delivering result's, despite the constrain'ts.
4) Lets meet on monday at 3pm, bring you're notes.`,
    fixed:
`1) Yesterday I received your email, and I replied immediately.
2) If you want to win, you must practice every day.
3) Our team is delivering results, despite the constraints.
4) Let's meet on Monday at 3 p.m.; bring your notes.`
  },
  {
    broken:
`1) She said "its fine", then she left; angryly.
2) There was less people then expected, which were surprizing.
3) We need to adress the issue's, not ignore them.
4) This report dont include the latest number's, sadly.`,
    fixed:
`1) She said, "it's fine," then she left angrily.
2) There were fewer people than expected, which was surprising.
3) We need to address the issues, not ignore them.
4) This report doesn't include the latest numbers, sadly.`
  },
];

function canonRepair(s){
  return (s||"")
    .replace(/\r\n/g,"\n")
    .replace(/[ \t]+/g," ")
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’‘]/g,"'")
    .replace(/[“”]/g,'"');
}

function stopRepairTimer(){
  if(state.repair.timerId){
    clearInterval(state.repair.timerId);
    state.repair.timerId = null;
  }
}

function startRepairTimer(){
  stopRepairTimer();
  const tick = () => {
    const left = Math.max(0, state.repair.deadlineTs - Date.now());
    const s = Math.ceil(left/1000);
    const mm = String(Math.floor(s/60));
    const ss = String(s%60).padStart(2,"0");
    ui.repairTimer.textContent = `${mm}:${ss}`;
    if(left <= 0){
      stopRepairTimer();
      state.repair.streak = 0;
      ui.repairStreak.textContent = "0";
      renderSide(state);
      setMsg(ui.repairMsg, "Time expired. Streak reset.", "bad");
      newRepairRound(true);
    }
  };
  state.repair.timerId = setInterval(tick, 250);
  tick();
}

function newRepairRound(showMsg=false){
  stopRepairTimer();
  state.repair.current = REPAIR_BANK[Math.floor(Math.random()*REPAIR_BANK.length)];
  ui.repairPrompt.textContent = state.repair.current.broken;
  ui.repairAnswer.value = "";
  setMsg(ui.repairMsg, showMsg ? "2:30. Fix all 4 lines. ≤5 wrong characters allowed." : "", showMsg ? "warn" : "");
  state.repair.deadlineTs = Date.now() + REPAIR_TIME_MS;
  startRepairTimer();
}

function checkRepairAnswer(){
  const raw = ui.repairAnswer.value || "";
  const item = state.repair.current;
  if(!item) return;

  if(Date.now() > state.repair.deadlineTs){
    setMsg(ui.repairMsg, "Time expired.", "bad");
    return;
  }

  const guess = canonRepair(raw);
  const truth = canonRepair(item.fixed);
  const dist = levenshteinRaw(guess, truth);

  if(dist <= REPAIR_MAX_DIST){
    stopRepairTimer();
    state.repair.streak++;
    ui.repairStreak.textContent = String(state.repair.streak);
    renderSide(state);
    setMsg(ui.repairMsg, `Correct. (diff ${dist}/${REPAIR_MAX_DIST})`, "good");
    if(state.repair.streak >= state.repair.target){
      setMsg(ui.repairMsg, "Gate cleared.", "good");
      markCleared("repair");
      return;
    }
    newRepairRound(true);
  } else {
    stopRepairTimer();
    state.repair.streak = 0;
    ui.repairStreak.textContent = "0";
    renderSide(state);
    setMsg(ui.repairMsg, `Too many differences (${dist}). Allowed: ${REPAIR_MAX_DIST}.`, "bad");
    newRepairRound(true);
  }
}

/* =========================
   GRID (15 steps, hide after 30s, click full path)
========================= */
function makeGridModel(){
  const size = 11;
  const stepsN = 15;

  // choose start so cheat offsets are always in-bounds:
  // need x+7 <= size-1 and y-2 >= 0
  const start = {
    x: 1 + Math.floor(Math.random()*3),   // 1..3
    y: 2 + Math.floor(Math.random()*7),   // 2..8
  };

  let steps = [];
  let x = start.x, y = start.y;

  for(let i=0; i<stepsN; i++){
    const opts = [];
    if(y>0) opts.push("U");
    if(y<size-1) opts.push("D");
    if(x>0) opts.push("L");
    if(x<size-1) opts.push("R");

    const d = opts[Math.floor(Math.random()*opts.length)];
    steps.push(d);
    if(d==="U") y--;
    if(d==="D") y++;
    if(d==="L") x--;
    if(d==="R") x++;
  }

  // precompute full path coordinates
  const path = [{...start}];
  let px = start.x, py = start.y;
  for(const d of steps){
    if(d==="U") py--;
    if(d==="D") py++;
    if(d==="L") px--;
    if(d==="R") px++;
    path.push({x:px,y:py});
  }

  return {
    size,
    start,
    steps,
    path,
    stepsVisible: true,
    progress: 0,       // how many correct clicks so far
    visited: new Set(),// visited coords "x,y"
    cheatBuf: []       // last clicks for backdoor
  };
}

function renderGrid(){
  const m = state.grid.model;
  if(!m) return;

  // directions panel
  if(m.stepsVisible){
    ui.gridSteps.innerHTML = m.steps.map((d,i)=>`<div class="stepLine"><span class="mono">${String(i+1).padStart(2,"0")}</span> ${d}</div>`).join("");
  } else {
    ui.gridSteps.inner
