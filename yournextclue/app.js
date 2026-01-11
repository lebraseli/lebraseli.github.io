/* app.js
   Requires:
     trivia_bank.js sets window.TRIVIA_BANK = [...]
     poem.json exists next to index.html (./poem.json) and contains the PBKDF2 + AES-GCM bundle.
*/

const $ = (id) => document.getElementById(id);

const ui = {
  // Theme / global
  themeToggle: $("themeToggle"),
  resetProgress: $("resetProgress"),

  // Steps
  stepTrivia: $("stepTrivia"),
  stepNote: $("stepNote"),
  stepRepair: $("stepRepair"),
  stepGrid: $("stepGrid"),
  stepReveal: $("stepReveal"),

  // Panels
  panelTitle: $("panelTitle"),
  panelDesc: $("panelDesc"),
  statusPill: $("statusPill"),

  // Stages
  stageTrivia: $("stageTrivia"),
  stageNote: $("stageNote"),
  stageRepair: $("stageRepair"),
  stageGrid: $("stageGrid"),
  stageReveal: $("stageReveal"),

  // Sidebar
  objective: $("objective"),
  pTrivia: $("pTrivia"),
  pNote: $("pNote"),
  pRepair: $("pRepair"),
  pGrid: $("pGrid"),

  // Trivia
  streak: $("streak"),
  remaining: $("remaining"),
  category: $("category"),
  question: $("question"),
  answer: $("answer"),
  submitAnswer: $("submitAnswer"),
  triviaMsg: $("triviaMsg"),

  // Note
  noteStreak: $("noteStreak"),
  noteTarget: $("noteTarget"),
  playNote: $("playNote"),
  replayNote: $("replayNote"),
  noteAnswer: $("noteAnswer"),
  submitNote: $("submitNote"),
  noteKeys: $("noteKeys"),
  noteMsg: $("noteMsg"),

  // Repair
  repairStreak: $("repairStreak"),
  repairTarget: $("repairTarget"),
  repairTimer: $("repairTimer"),
  repairPrompt: $("repairPrompt"),
  repairAnswer: $("repairAnswer"),
  submitRepair: $("submitRepair"),
  newRepair: $("newRepair"),
  repairMsg: $("repairMsg"),

  // Grid
  gridStreak: $("gridStreak"),
  gridTarget: $("gridTarget"),
  gridSteps: $("gridSteps"),
  gridBoard: $("gridBoard"),
  gridMsg: $("gridMsg"),
  resetGrid: $("resetGrid"),
  submitGrid: $("submitGrid"),

  // Reveal / Poem
  poemText: $("poemText"),
  revealMsg: $("revealMsg"),
  fragA: $("fragA"),
  fragB: $("fragB"),
  decryptPoemBtn: $("decryptPoemBtn"),
  copyPoem: $("copyPoem"),
};

const OVERRIDE_CODE = "1324";

/* =========================
   UTIL
========================= */
function assertUI(){
  const required = [
    "themeToggle","resetProgress",
    "stepTrivia","stepNote","stepRepair","stepGrid","stepReveal",
    "panelTitle","panelDesc","statusPill",
    "stageTrivia","stageNote","stageRepair","stageGrid","stageReveal",
    "objective","pTrivia","pNote","pRepair","pGrid",
    "streak","remaining","category","question","answer","submitAnswer","triviaMsg",
    "noteStreak","noteTarget","playNote","replayNote","noteAnswer","submitNote","noteKeys","noteMsg",
    "repairStreak","repairTarget","repairTimer","repairPrompt","repairAnswer","submitRepair","newRepair","repairMsg",
    "gridStreak","gridTarget","gridSteps","gridBoard","gridMsg","resetGrid","submitGrid",
    "poemText","revealMsg","fragA","fragB","decryptPoemBtn","copyPoem"
  ];

  const missing = required.filter(k => !ui[k]);
  if(missing.length){
    const msg = `Missing required DOM IDs: ${missing.join(", ")}`;
    console.error(msg);
    throw new Error(msg);
  }
}

function norm(s){
  return (s || "")
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g,"'")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isOverride(input){
  return norm(input) === OVERRIDE_CODE;
}

function setMsg(el, text, kind){
  el.textContent = text || "";
  el.className = "msg" + (kind ? (" " + kind) : "");
}

function shuffle(arr){
  const a = [...arr];
  for(let i=a.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function levenshteinRaw(a,b){
  const m = a.length, n = b.length;
  if(m === 0) return n;
  if(n === 0) return m;
  const dp = new Array(n+1);
  for(let j=0; j<=n; j++) dp[j] = j;
  for(let i=1; i<=m; i++){
    let prev = dp[0];
    dp[0] = i;
    for(let j=1; j<=n; j++){
      const tmp = dp[j];
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j-1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

/* Trivia tolerance */
function levenshtein(a,b){ return levenshteinRaw(norm(a), norm(b)); }

function typoOk(guess, truth){
  const g = norm(guess);
  const t = norm(truth);
  if(!g || !t) return false;
  if(g === t) return true;

  const dist = levenshteinRaw(g, t);
  const L = Math.max(g.length, t.length);
  if(L <= 4) return dist <= 1;
  if(L <= 7) return dist <= 1;
  if(L <= 12) return dist <= 2;
  return dist <= 3;
}

function matchesAny(guess, truths){
  const g = norm(guess);
  if(!g) return false;

  for(const t of truths){
    if(!t) continue;
    const tn = norm(t);
    if(g === tn) return true;

    if(g.length >= 3 && tn.length >= 3 && (tn.includes(g) || g.includes(tn))) return true;
    if(typoOk(g, tn)) return true;
  }
  return false;
}

/* =========================
   THEME (system default + persisted toggle)
========================= */
const THEME_KEY = "ync_theme"; // "dark" | "light" | "system"

function getThemeSetting(){
  const v = localStorage.getItem(THEME_KEY);
  return (v === "dark" || v === "light" || v === "system") ? v : "system";
}

function setThemeSetting(v){
  localStorage.setItem(THEME_KEY, v);
  applyThemeSetting();
}

function applyThemeSetting(){
  const root = document.documentElement;
  const setting = getThemeSetting();

  if(setting === "dark" || setting === "light"){
    root.dataset.theme = setting;
  } else {
    delete root.dataset.theme; // system
  }

  const effectiveDark = root.dataset.theme
    ? (root.dataset.theme === "dark")
    : window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;

  ui.themeToggle.textContent = `Theme: ${setting === "system" ? (effectiveDark ? "System (Dark)" : "System (Light)") : (setting === "dark" ? "Dark" : "Light")}`;
}

function cycleTheme(){
  const cur = getThemeSetting();
  if(cur === "system") return setThemeSetting("dark");
  if(cur === "dark") return setThemeSetting("light");
  return setThemeSetting("system");
}

/* =========================
   APP STATE / FLOW
========================= */
const TESTS = ["trivia","note","repair","grid"]; // reveal is implicit final

const state = {
  stage: "trivia",
  order: [],
  idx: 0,
  cleared: new Set(),

  trivia: { target: 15, streak: 0, retired: new Set(), current: null },
  note:   { target: 5,  streak: 0, current: null },
  repair: { target: 3,  streak: 0, current: null, deadlineTs: 0, timerId: null },
  grid:   { target: 1,  streak: 0, model: null },

  poem: { json: null }
};

function setStage(stage){
  state.stage = stage;
  document.body.dataset.stage = stage;

  const stepMap = {
    trivia: ui.stepTrivia,
    note: ui.stepNote,
    repair: ui.stepRepair,
    grid: ui.stepGrid,
    reveal: ui.stepReveal
  };

  const stageMap = {
    trivia: ui.stageTrivia,
    note: ui.stageNote,
    repair: ui.stageRepair,
    grid: ui.stageGrid,
    reveal: ui.stageReveal
  };

  Object.values(stepMap).forEach(el => el.className = "step");
  Object.values(stageMap).forEach(el => el.classList.remove("show"));

  for(let i=0; i<state.order.length; i++){
    const key = state.order[i];
    const el = stepMap[key];
    if(!el) continue;
    if(i < state.idx) el.className = "step done";
    else if(i === state.idx && stage !== "reveal") el.className = "step active";
    else el.className = "step";
  }
  if(stage === "reveal") ui.stepReveal.className = "step active";

  stageMap[stage].classList.add("show");

  if(stage === "trivia"){
    ui.panelTitle.textContent = "Test — Trivia";
    ui.panelDesc.innerHTML = `Get <b>${state.trivia.target} correct in a row</b>. Miss resets to 0.`;
    ui.statusPill.textContent = "In progress";
    ui.objective.textContent = `${state.trivia.target} in a row`;
  } else if(stage === "note"){
    ui.panelTitle.textContent = "Test — Note ID";
    ui.panelDesc.innerHTML = `Listen to a note and type the letter (<b>A–G</b>). Get <b>${state.note.target} in a row</b>.`;
    ui.statusPill.textContent = "In progress";
    ui.objective.textContent = `${state.note.target} in a row`;
  } else if(stage === "repair"){
    ui.panelTitle.textContent = "Test — Sentence Repair";
    ui.panelDesc.innerHTML = `Fix the text. <b>2:00</b> time limit. Get <b>${state.repair.target} wins in a row</b>.`;
    ui.statusPill.textContent = "In progress";
    ui.objective.textContent = `${state.repair.target} wins in a row`;
  } else if(stage === "grid"){
    ui.panelTitle.textContent = "Test — Grid Navigation";
    ui.panelDesc.innerHTML = `Follow <b>20</b> directions from the blue start dot. Select the final intersection.`;
    ui.statusPill.textContent = "In progress";
    ui.objective.textContent = `1 correct`;
  } else {
    ui.panelTitle.textContent = "Access Granted";
    ui.panelDesc.textContent = "";
    ui.statusPill.textContent = "Unlocked";
    ui.objective.textContent = "";
  }

  renderSide();
}

function renderSide(){
  ui.pTrivia.textContent = `${state.trivia.streak} / ${state.trivia.target}`;
  ui.pNote.textContent   = `${state.note.streak} / ${state.note.target}`;
  ui.pRepair.textContent = `${state.repair.streak} / ${state.repair.target}`;
  ui.pGrid.textContent   = `${state.grid.streak} / ${state.grid.target}`;
}

function advanceOrReveal(){
  const justCleared = state.order[state.idx];
  state.cleared.add(justCleared);

  state.idx += 1;
  if(state.idx >= state.order.length){
    setStage("reveal");
    setMsg(ui.revealMsg, "Enter fragmentA + fragmentB, then decrypt.", "warn");
    return;
  }

  const next = state.order[state.idx];
  setStage(next);

  if(next === "trivia") pickTrivia();
  if(next === "note") newNoteRound(true);
  if(next === "repair") newRepairRound(true);
  if(next === "grid") newGridRound(true);
}

/* =========================
   TRIVIA
========================= */
function triviaRemaining(){
  return window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id)).length;
}

function pickTrivia(){
  const pool = window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id));
  if(pool.length === 0){
    ui.question.textContent = "No trivia remaining in this session.";
    setMsg(ui.triviaMsg, "Reload to reset remaining.", "warn");
    return;
  }

  const q = pool[Math.floor(Math.random() * pool.length)];
  state.trivia.current = q;

  ui.category.textContent = q.cat;
  ui.question.textContent = q.q;
  ui.answer.value = "";
  setMsg(ui.triviaMsg, "", "");
  ui.remaining.textContent = String(triviaRemaining());
  setTimeout(() => ui.answer.focus(), 0);
}

function checkTriviaAnswer(){
  const rawGuess = ui.answer.value || "";
  if(isOverride(rawGuess)){
    state.trivia.streak = state.trivia.target;
    ui.streak.textContent = String(state.trivia.streak);
    renderSide();
    setMsg(ui.triviaMsg, "Override accepted.", "good");
    advanceOrReveal();
    return;
  }

  const q = state.trivia.current;
  if(!q) return;

  const guess = norm(rawGuess);
  if(!guess){
    setMsg(ui.triviaMsg, "Enter an answer.", "bad");
    return;
  }

  state.trivia.retired.add(q.id);
  ui.remaining.textContent = String(triviaRemaining());

  const truths = [q.a, ...(q.alts || [])];
  const ok = matchesAny(rawGuess, truths);

  if(ok){
    state.trivia.streak += 1;
    ui.streak.textContent = String(state.trivia.streak);
    renderSide();
    setMsg(ui.triviaMsg, "Correct.", "good");

    if(state.trivia.streak >= state.trivia.target){
      setMsg(ui.triviaMsg, "Test cleared.", "good");
      setTimeout(() => advanceOrReveal(), 280);
      return;
    }

    setTimeout(pickTrivia, 350);
    return;
  }

  state.trivia.streak = 0;
  ui.streak.textContent = "0";
  renderSide();
  setMsg(ui.triviaMsg, `Incorrect. Answer: ${q.a}`, "bad");
  setTimeout(pickTrivia, 700);
}

/* =========================
   NOTE ID (A–G only)
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

let audio = { ctx: null, master: null };

function ensureAudio(){
  if(audio.ctx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  audio.ctx = new Ctx();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.12;
  audio.master.connect(audio.ctx.destination);
}

function playTone(freq, ms=750){
  ensureAudio();
  if(audio.ctx.state === "suspended") audio.ctx.resume();

  const now = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = freq;

  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(1.0, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + ms/1000);

  osc.connect(g);
  g.connect(audio.master);

  osc.start(now);
  osc.stop(now + ms/1000 + 0.03);
}

function newNoteRound(autoPlay=false){
  state.note.current = NOTE_BANK[Math.floor(Math.random()*NOTE_BANK.length)];
  ui.noteAnswer.value = "";
  setMsg(ui.noteMsg, "Click Play, then type A–G.", "warn");
  if(autoPlay){
    try{ playTone(state.note.current.f, 750); } catch {}
  }
  setTimeout(() => ui.noteAnswer.focus(), 0);
}

function checkNoteAnswer(){
  const raw = (ui.noteAnswer.value || "").trim();

  if(isOverride(raw)){
    state.note.streak = state.note.target;
    ui.noteStreak.textContent = String(state.note.streak);
    renderSide();
    setMsg(ui.noteMsg, "Override accepted.", "good");
    advanceOrReveal();
    return;
  }

  if(!state.note.current){
    setMsg(ui.noteMsg, "No note loaded. Click Play.", "bad");
    return;
  }

  const g = raw.toUpperCase().replace(/[^A-G]/g,"").slice(0,1);
  if(!g){
    setMsg(ui.noteMsg, "Enter a single letter A–G.", "bad");
    return;
  }

  const ok = (g === state.note.current.n);
  if(ok){
    state.note.streak += 1;
    ui.noteStreak.textContent = String(state.note.streak);
    renderSide();
    setMsg(ui.noteMsg, "Correct.", "good");

    if(state.note.streak >= state.note.target){
      setMsg(ui.noteMsg, "Test cleared.", "good");
      setTimeout(() => advanceOrReveal(), 250);
      return;
    }

    setTimeout(() => newNoteRound(false), 350);
    return;
  }

  state.note.streak = 0;
  ui.noteStreak.textContent = "0";
  renderSide();
  setMsg(ui.noteMsg, "Incorrect.", "bad");
  setTimeout(() => newNoteRound(false), 450);
}

function buildNoteKeys(){
  ui.noteKeys.innerHTML = "";
  for(const n of ["A","B","C","D","E","F","G"]){
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn ghost";
    b.textContent = n;
    b.addEventListener("click", () => {
      ui.noteAnswer.value = n;
      checkNoteAnswer();
    });
    ui.noteKeys.appendChild(b);
  }
}

/* =========================
   SENTENCE REPAIR (2 minutes)
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
  return (s || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’‘]/g,"'")
    .replace(/[“”]/g,'"');
}

function startRepairTimer(){
  stopRepairTimer();
  const tick = () => {
    const left = Math.max(0, state.repair.deadlineTs - Date.now());
    const s = Math.ceil(left/1000);
    const mm = String(Math.floor(s/60)).padStart(1,"0");
    const ss = String(s%60).padStart(2,"0");
    ui.repairTimer.textContent = `${mm}:${ss}`;
    if(left <= 0){
      stopRepairTimer();
      setMsg(ui.repairMsg, "Time expired. Streak reset.", "bad");
      state.repair.streak = 0;
      ui.repairStreak.textContent = "0";
      renderSide();
      setTimeout(() => newRepairRound(false), 650);
    }
  };
  state.repair.timerId = setInterval(tick, 250);
  tick();
}

function stopRepairTimer(){
  if(state.repair.timerId){
    clearInterval(state.repair.timerId);
    state.repair.timerId = null;
  }
}

function newRepairRound(resetMsg=false){
  stopRepairTimer();
  const item = REPAIR_BANK[Math.floor(Math.random()*REPAIR_BANK.length)];
  state.repair.current = item;

  ui.repairPrompt.textContent = item.broken;
  ui.repairAnswer.value = "";
  setMsg(ui.repairMsg, resetMsg ? "2 minutes. Fix everything." : "", resetMsg ? "warn" : "");
  state.repair.deadlineTs = Date.now() + 2*60*1000;
  startRepairTimer();
  setTimeout(() => ui.repairAnswer.focus(), 0);
}

function checkRepairAnswer(){
  const raw = ui.repairAnswer.value || "";
  if(isOverride(raw)){
    stopRepairTimer();
    state.repair.streak = state.repair.target;
    ui.repairStreak.textContent = String(state.repair.streak);
    renderSide();
    setMsg(ui.repairMsg, "Override accepted.", "good");
    advanceOrReveal();
    return;
  }

  if(!state.repair.current){
    setMsg(ui.repairMsg, "No prompt loaded.", "bad");
    return;
  }

  const left = state.repair.deadlineTs - Date.now();
  if(left <= 0){
    setMsg(ui.repairMsg, "Time expired.", "bad");
    return;
  }

  const guess = canonRepair(raw);
  const truth = canonRepair(state.repair.current.fixed);

  const dist = levenshteinRaw(guess, truth);
  const ok = (guess === truth) || dist <= 6;

  if(ok){
    stopRepairTimer();
    state.repair.streak += 1;
    ui.repairStreak.textContent = String(state.repair.streak);
    renderSide();
    setMsg(ui.repairMsg, "Correct.", "good");

    if(state.repair.streak >= state.repair.target){
      setMsg(ui.repairMsg, "Test cleared.", "good");
      setTimeout(() => advanceOrReveal(), 250);
      return;
    }

    setTimeout(() => newRepairRound(true), 350);
    return;
  }

  stopRepairTimer();
  state.repair.streak = 0;
  ui.repairStreak.textContent = "0";
  renderSide();
  setMsg(ui.repairMsg, "Incorrect. Streak reset.", "bad");
  setTimeout(() => newRepairRound(true), 550);
}

/* =========================
   GRID NAV (20 steps)
========================= */
function makeGridModel(){
  const size = 9; // 9x9 intersections
  const stepsN = 20;

  const start = {
    x: 2 + Math.floor(Math.random() * (size - 4)),
    y: 2 + Math.floor(Math.random() * (size - 4)),
  };

  let steps = [];
  let x = start.x, y = start.y;

  for(let i=0; i<stepsN; i++){
    const options = [];
    if(y > 0) options.push("U");
    if(y < size-1) options.push("D");
    if(x > 0) options.push("L");
    if(x < size-1) options.push("R");

    const prev = steps[i-1];
    const filtered = options.filter(d => {
      if(prev === "U" && d === "D") return false;
      if(prev === "D" && d === "U") return false;
      if(prev === "L" && d === "R") return false;
      if(prev === "R" && d === "L") return false;
      return true;
    });

    const pickFrom = filtered.length ? filtered : options;
    const d = pickFrom[Math.floor(Math.random()*pickFrom.length)];
    steps.push(d);

    if(d === "U") y -= 1;
    if(d === "D") y += 1;
    if(d === "L") x -= 1;
    if(d === "R") x += 1;
  }

  return { size, start, steps, target: { x, y }, chosen: null };
}

function dirToText(d){
  if(d === "U") return "Up";
  if(d === "D") return "Down";
  if(d === "L") return "Left";
  if(d === "R") return "Right";
  return d;
}

function renderGrid(){
  const m = state.grid.model;
  if(!m) return;

  ui.gridSteps.innerHTML = m.steps
    .map((d,i) => `<div class="stepLine"><span class="mono">${String(i+1).padStart(2,"0")}</span> ${dirToText(d)}</div>`)
    .join("");

  ui.gridBoard.innerHTML = "";
  ui.gridBoard.style.setProperty("--n", String(m.size));

  for(let y=0; y<m.size; y++){
    for(let x=0; x<m.size; x++){
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "gridCell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.setAttribute("aria-label", `Intersection ${x},${y}`);

      if(x===m.start.x && y===m.start.y) cell.classList.add("start");
      if(m.chosen && x===m.chosen.x && y===m.chosen.y) cell.classList.add("chosen");

      ui.gridBoard.appendChild(cell);
    }
  }
}

function newGridRound(resetMsg=false){
  state.grid.model = makeGridModel();
  renderGrid();
  setMsg(ui.gridMsg, resetMsg ? "New grid generated. Select the final intersection, then submit." : "Select an intersection, then submit.", "warn");
}

function checkGridChoice(){
  const m = state.grid.model;
  if(!m){
    setMsg(ui.gridMsg, "No grid loaded.", "bad");
    return;
  }
  if(!m.chosen){
    setMsg(ui.gridMsg, "Select an intersection first.", "bad");
    return;
  }

  const ok = (m.chosen.x === m.target.x && m.chosen.y === m.target.y);

  if(ok){
    state.grid.streak += 1;
    ui.gridStreak.textContent = String(state.grid.streak);
    renderSide();
    setMsg(ui.gridMsg, "Correct. Test cleared.", "good");

    if(state.grid.streak >= state.grid.target){
      setTimeout(() => advanceOrReveal(), 260);
      return;
    }
    setTimeout(() => newGridRound(true), 350);
    return;
  }

  state.grid.streak = 0;
  ui.gridStreak.textContent = "0";
  renderSide();
  setMsg(ui.gridMsg, "Incorrect. Streak reset.", "bad");
  setTimeout(() => newGridRound(true), 450);
}

/* =========================
   POEM.JSON DECRYPT (PBKDF2 + AES-GCM)
========================= */
function b64ToBytes(b64){
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for(let i=0; i<bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function decryptPoemJson(passphrase, poemJson){
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const salt = b64ToBytes(poemJson.kdf.saltB64);
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: poemJson.kdf.hash,
      salt,
      iterations: poemJson.kdf.iterations
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const iv = b64ToBytes(poemJson.cipher.ivB64);
  const ct = b64ToBytes(poemJson.cipher.ctB64);

  const ptBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    ct
  );

  return new TextDecoder().decode(ptBuf);
}

async function loadPoemJson(){
  const res = await fetch("./poem.json", { cache: "no-store" });
  if(!res.ok) throw new Error(`Failed to load poem.json: ${res.status}`);
  state.poem.json = await res.json();
}

async function tryDecryptFromInputs(){
  const pj = state.poem.json;
  if(!pj){
    setMsg(ui.revealMsg, "poem.json not loaded.", "bad");
    return;
  }

  const a = (ui.fragA.value || "").trim().toLowerCase().replace(/\s+/g,"");
  const b = (ui.fragB.value || "").trim().toLowerCase().replace(/\s+/g,"");
  const pass = `${a}${b}`;

  if(pass.length < 4){
    setMsg(ui.revealMsg, "Enter fragmentA and fragmentB (lowercase, no spaces).", "warn");
    return;
  }

  ui.decryptPoemBtn.disabled = true;
  ui.decryptPoemBtn.textContent = "Decrypting…";

  try{
    const poem = await decryptPoemJson(pass, pj);
    ui.poemText.textContent = poem;
    setMsg(ui.revealMsg, "Decryption successful.", "good");
  } catch (e){
    console.error(e);
    ui.poemText.textContent = "";
    const hint = pj?.hint ? ` ${pj.hint}` : "";
    setMsg(ui.revealMsg, `Decryption failed.${hint}`, "bad");
  } finally {
    ui.decryptPoemBtn.disabled = false;
    ui.decryptPoemBtn.textContent = "Decrypt";
  }
}

async function copyPoem(){
  const text = ui.poemText.textContent || "";
  if(!text){
    setMsg(ui.revealMsg, "Nothing to copy yet.", "warn");
    return;
  }
  try{
    await navigator.clipboard.writeText(text);
    setMsg(ui.revealMsg, "Copied to clipboard.", "good");
  } catch {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try{
      document.execCommand("copy");
      setMsg(ui.revealMsg, "Copied to clipboard.", "good");
    } catch {
      setMsg(ui.revealMsg, "Copy failed (browser permission).", "bad");
    } finally {
      document.body.removeChild(ta);
    }
  }
}

/* =========================
   RESET / INIT
========================= */
function resetAllProgress(){
  if(!confirm("This will reset progress for this browser session. Continue?")) return;

  stopRepairTimer();

  state.idx = 0;
  state.cleared = new Set();

  state.trivia.streak = 0;
  state.trivia.retired = new Set();
  state.trivia.current = null;

  state.note.streak = 0;
  state.note.current = null;

  state.repair.streak = 0;
  state.repair.current = null;
  state.repair.deadlineTs = 0;

  state.grid.streak = 0;
  state.grid.model = null;

  ui.streak.textContent = "0";
  ui.noteStreak.textContent = "0";
  ui.repairStreak.textContent = "0";
  ui.gridStreak.textContent = "0";

  setMsg(ui.triviaMsg, "", "");
  setMsg(ui.noteMsg, "", "");
  setMsg(ui.repairMsg, "", "");
  setMsg(ui.gridMsg, "", "");
  setMsg(ui.revealMsg, "", "");

  ui.poemText.textContent = "";
  ui.fragA.value = "";
  ui.fragB.value = "";

  state.order = shuffle(TESTS);

  const first = state.order[0];
  setStage(first);
  if(first === "trivia") pickTrivia();
  if(first === "note") newNoteRound(true);
  if(first === "repair") newRepairRound(true);
  if(first === "grid") newGridRound(true);

  renderSide();
}

async function init(){
  assertUI();

  applyThemeSetting();
  window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
    if(getThemeSetting() === "system") applyThemeSetting();
  });

  buildNoteKeys();

  if(!window.TRIVIA_BANK || !Array.isArray(window.TRIVIA_BANK) || window.TRIVIA_BANK.length < 50){
    ui.question.textContent = "Trivia bank missing or invalid.";
    setMsg(ui.triviaMsg, "Ensure trivia_bank.js is loaded before app.js.", "bad");
    return;
  }

  state.order = shuffle(TESTS);
  state.idx = 0;

  ui.noteTarget.textContent = String(state.note.target);
  ui.repairTarget.textContent = String(state.repair.target);
  ui.gridTarget.textContent = String(state.grid.target);

  ui.streak.textContent = "0";
  ui.noteStreak.textContent = "0";
  ui.repairStreak.textContent = "0";
  ui.gridStreak.textContent = "0";
  ui.remaining.textContent = String(triviaRemaining());

  try{
    await loadPoemJson();
    setMsg(ui.revealMsg, "Ready to decrypt when unlocked.", "warn");
  } catch (e){
    console.error(e);
    setMsg(ui.revealMsg, "Warning: poem.json failed to load. Reveal stage will not decrypt.", "warn");
  }

  const first = state.order[0];
  setStage(first);

  if(first === "trivia") pickTrivia();
  if(first === "note") newNoteRound(false);
  if(first === "repair") newRepairRound(true);
  if(first === "grid") newGridRound(true);

  renderSide();
}

/* =========================
   EVENTS
========================= */
// Theme
ui.themeToggle.addEventListener("click", cycleTheme);

// Trivia
ui.submitAnswer.addEventListener("click", checkTriviaAnswer);
ui.answer.addEventListener("keydown", (e) => { if(e.key === "Enter") checkTriviaAnswer(); });

// Note
ui.playNote.addEventListener("click", () => {
  if(!state.note.current) newNoteRound(false);
  try{
    playTone(state.note.current.f, 750);
    setMsg(ui.noteMsg, "Played. Enter A–G.", "warn");
    ui.noteAnswer.focus();
  } catch (e){
    console.error(e);
    setMsg(ui.noteMsg, "Audio blocked. Interact with the page and try again.", "bad");
  }
});
ui.replayNote.addEventListener("click", () => {
  if(!state.note.current){
    setMsg(ui.noteMsg, "No note loaded yet. Click Play.", "warn");
    return;
  }
  try{
    playTone(state.note.current.f, 750);
    setMsg(ui.noteMsg, "Replayed. Enter A–G.", "warn");
    ui.noteAnswer.focus();
  } catch (e){
    console.error(e);
    setMsg(ui.noteMsg, "Audio blocked. Interact with the page and try again.", "bad");
  }
});
ui.submitNote.addEventListener("click", checkNoteAnswer);
ui.noteAnswer.addEventListener("keydown", (e) => { if(e.key === "Enter") checkNoteAnswer(); });

// Repair
ui.submitRepair.addEventListener("click", checkRepairAnswer);
ui.repairAnswer.addEventListener("keydown", (e) => {
  if(e.key === "Enter" && (e.metaKey || e.ctrlKey)) checkRepairAnswer();
});
ui.newRepair.addEventListener("click", () => newRepairRound(true));

// Grid
ui.resetGrid.addEventListener("click", () => newGridRound(true));
ui.submitGrid.addEventListener("click", checkGridChoice);

// Grid selection: click selects, click same again submits; dblclick submits immediately
ui.gridBoard.addEventListener("click", (e) => {
  const btn = e.target?.closest?.(".gridCell");
  if(!btn) return;
  const x = Number(btn.dataset.x);
  const y = Number(btn.dataset.y);
  const m = state.grid.model;
  if(!m) return;

  if(m.chosen && m.chosen.x === x && m.chosen.y === y){
    checkGridChoice();
    return;
  }

  m.chosen = { x, y };
  renderGrid();
  setMsg(ui.gridMsg, "Selection recorded. Click again or press Submit.", "warn");
});

ui.gridBoard.addEventListener("dblclick", (e) => {
  const btn = e.target?.closest?.(".gridCell");
  if(!btn) return;
  const x = Number(btn.dataset.x);
  const y = Number(btn.dataset.y);
  const m = state.grid.model;
  if(!m) return;
  m.chosen = { x, y };
  renderGrid();
  checkGridChoice();
});

// Reveal
ui.decryptPoemBtn.addEventListener("click", tryDecryptFromInputs);
ui.fragB.addEventListener("keydown", (e) => { if(e.key === "Enter") tryDecryptFromInputs(); });
ui.copyPoem.addEventListener("click", copyPoem);

// Reset
ui.resetProgress.addEventListener("click", resetAllProgress);

// Init
window.addEventListener("load", () => { init(); });
