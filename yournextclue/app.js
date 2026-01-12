/* app.js — Your Next Clue
   - Tabs at top switch stages (Reveal has no tab).
   - Full reset on every reload (no persistence).
   - Repair allows up to 3 mistakes (word-level tolerance) and enforces 4-line numbered format.
*/

const $ = (id) => document.getElementById(id);

const ui = {
  // Tabs
  stepTrivia: $("stepTrivia"),
  stepNote: $("stepNote"),
  stepRepair: $("stepRepair"),
  stepGrid: $("stepGrid"),

  // Theme
  themeToggle: $("themeToggle"),

  // Panels
  panelTitle: $("panelTitle"),
  panelDesc: $("panelDesc"),
  statusPill: $("statusPill"),
  objective: $("objective"),

  // Global
  resetProgress: $("resetProgress"),

  // Stages
  stageTrivia: $("stageTrivia"),
  stageNote: $("stageNote"),
  stageRepair: $("stageRepair"),
  stageGrid: $("stageGrid"),
  stageReveal: $("stageReveal"),

  // Sidebar progress
  pTrivia: $("pTrivia"),
  pNote: $("pNote"),
  pRepair: $("pRepair"),
  pGrid: $("pGrid"),

  // Trivia
  streak: $("streak"),
  triviaTarget: $("triviaTarget"),
  remaining: $("remaining"),
  category: $("category"),
  question: $("question"),
  answer: $("answer"),
  submitAnswer: $("submitAnswer"),
  triviaMsg: $("triviaMsg"),

  // Music notes
  noteStreak: $("noteStreak"),
  noteTarget: $("noteTarget"),
  playNote: $("playNote"),
  noteAnswer: $("noteAnswer"),
  submitNote: $("submitNote"),
  noteMsg: $("noteMsg"),

  // Repair
  repairStreak: $("repairStreak"),
  repairTarget: $("repairTarget"),
  repairTimer: $("repairTimer"),
  repairPrompt: $("repairPrompt"),
  repairFormat: $("repairFormat"),
  repairAnswer: $("repairAnswer"),
  submitRepair: $("submitRepair"),
  repairMsg: $("repairMsg"),

  // Grid
  gridStreak: $("gridStreak"),
  gridTarget: $("gridTarget"),
  gridSteps: $("gridSteps"),
  gridBoard: $("gridBoard"),
  gridMsg: $("gridMsg"),
  resetGrid: $("resetGrid"),

  // Reveal
  poemText: $("poemText"),
  revealMsg: $("revealMsg"),
  fragA: $("fragA"),
  fragB: $("fragB"),
  decryptPoemBtn: $("decryptPoemBtn"),
};

const OVERRIDE_CODE = "1324";
const TESTS = ["trivia", "note", "repair", "grid"];
const REPAIR_ALLOWED_MISTAKES = 3;

/* =========================
   UTIL
========================= */
function assertUI() {
  const required = [
    "stepTrivia","stepNote","stepRepair","stepGrid",
    "panelTitle","panelDesc","statusPill","objective","resetProgress",
    "stageTrivia","stageNote","stageRepair","stageGrid","stageReveal",
    "pTrivia","pNote","pRepair","pGrid",
    "streak","triviaTarget","remaining","category","question","answer","submitAnswer","triviaMsg",
    "noteStreak","noteTarget","playNote","noteAnswer","submitNote","noteMsg",
    "repairStreak","repairTarget","repairTimer","repairPrompt","repairFormat","repairAnswer","submitRepair","repairMsg",
    "gridStreak","gridTarget","gridSteps","gridBoard","gridMsg","resetGrid",
    "poemText","revealMsg","fragA","fragB","decryptPoemBtn"
  ];

  const missing = required.filter(k => !ui[k]);
  if (missing.length) {
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
    .replace(/[^a-z0-9\s']/g, " ")
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

function levenshteinTokens(aTokens, bTokens){
  const a = aTokens, b = bTokens;
  const m = a.length, n = b.length;
  if(m === 0) return n;
  if(n === 0) return m;

  const dp = new Array(n + 1);
  for(let j=0; j<=n; j++) dp[j] = j;

  for(let i=1; i<=m; i++){
    let prev = dp[0];
    dp[0] = i;
    for(let j=1; j<=n; j++){
      const tmp = dp[j];
      const cost = (a[i-1] === b[j-1]) ? 0 : 1;
      dp[j] = Math.min(
        dp[j] + 1,      // delete
        dp[j-1] + 1,    // insert
        prev + cost     // substitute
      );
      prev = tmp;
    }
  }
  return dp[n];
}

/* =========================
   THEME
========================= */
function preferredTheme(){
  const saved = localStorage.getItem("ync_theme");
  if(saved === "light" || saved === "dark") return saved;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(t){
  document.documentElement.dataset.theme = t;
  ui.themeToggle.textContent = (t === "dark") ? "Dark" : "Light";
}

function toggleTheme(){
  const cur = document.documentElement.dataset.theme || preferredTheme();
  const next = (cur === "dark") ? "light" : "dark";
  localStorage.setItem("ync_theme", next);
  applyTheme(next);
}

/* =========================
   APP STATE / FLOW
========================= */
const state = {
  stage: "trivia",
  initialized: new Set(),
  cleared: new Set(),

  trivia: { target: 15, streak: 0, retired: new Set(), current: null },
  note:   { target: 5,  streak: 0, current: null },
  repair: { target: 3,  streak: 0, current: null, deadlineTs: 0, timerId: null },
  grid:   { target: 1,  streak: 0, model: null },

  poem: { json: null }
};

function allCleared(){
  return TESTS.every(k => state.cleared.has(k));
}

function renderSide(){
  ui.pTrivia.textContent = `${state.trivia.streak} / ${state.trivia.target}`;
  ui.pNote.textContent   = `${state.note.streak} / ${state.note.target}`;
  ui.pRepair.textContent = `${state.repair.streak} / ${state.repair.target}`;
  ui.pGrid.textContent   = `${state.grid.streak} / ${state.grid.target}`;
}

function renderTabs(){
  const tabMap = {
    trivia: ui.stepTrivia,
    note: ui.stepNote,
    repair: ui.stepRepair,
    grid: ui.stepGrid
  };

  for(const [k, el] of Object.entries(tabMap)){
    el.className = "step";
    if(state.cleared.has(k)) el.classList.add("done");
    if(state.stage === k) el.classList.add("active");
  }

  // Reveal has no tab; remove active highlight when revealing
  if(state.stage === "reveal"){
    Object.values(tabMap).forEach(el => el.classList.remove("active"));
  }
}

function showStage(stage){
  state.stage = stage;
  document.body.dataset.stage = stage;

  // Hide all
  ui.stageTrivia.classList.remove("show");
  ui.stageNote.classList.remove("show");
  ui.stageRepair.classList.remove("show");
  ui.stageGrid.classList.remove("show");
  ui.stageReveal.classList.remove("show");

  // Show selected
  const map = {
    trivia: ui.stageTrivia,
    note: ui.stageNote,
    repair: ui.stageRepair,
    grid: ui.stageGrid,
    reveal: ui.stageReveal
  };
  map[stage].classList.add("show");

  // Panel copy
  if(stage === "trivia"){
    ui.panelTitle.textContent = "Test — Trivia";
    ui.panelDesc.innerHTML = `Get <b>${state.trivia.target} correct in a row</b>. Miss resets to 0.`;
    ui.statusPill.textContent = state.cleared.has("trivia") ? "Cleared" : "In progress";
    ui.objective.textContent = `${state.trivia.target} in a row`;
  } else if(stage === "note"){
    ui.panelTitle.textContent = "Test — Music Notes";
    ui.panelDesc.innerHTML = `Listen to a note and type the letter (<b>A–G</b>). Get <b>${state.note.target} in a row</b>.`;
    ui.statusPill.textContent = state.cleared.has("note") ? "Cleared" : "In progress";
    ui.objective.textContent = `${state.note.target} in a row`;
  } else if(stage === "repair"){
    ui.panelTitle.textContent = "Test — Sentence Repair";
    ui.panelDesc.innerHTML = `Fix the text. <b>2:00</b> limit. Up to <b>${REPAIR_ALLOWED_MISTAKES}</b> accidental mistakes allowed. Get <b>${state.repair.target} wins in a row</b>.`;
    ui.statusPill.textContent = state.cleared.has("repair") ? "Cleared" : "In progress";
    ui.objective.textContent = `${state.repair.target} wins in a row`;
  } else if(stage === "grid"){
    ui.panelTitle.textContent = "Test — Grid Navigation";
    ui.panelDesc.innerHTML = `Follow <b>20</b> directions from the blue start dot. Click the final intersection.`;
    ui.statusPill.textContent = state.cleared.has("grid") ? "Cleared" : "In progress";
    ui.objective.textContent = `1 correct`;
  } else {
    ui.panelTitle.textContent = "Access Granted";
    ui.panelDesc.textContent = "";
    ui.statusPill.textContent = "Unlocked";
    ui.objective.textContent = "";
  }

  renderTabs();
  renderSide();
}

function ensureStageInitialized(stage){
  if(state.initialized.has(stage)) return;

  if(stage === "trivia") pickTrivia();
  if(stage === "note") newNoteRound();
  if(stage === "repair") newRepairRound(true);
  if(stage === "grid") newGridRound(true);

  state.initialized.add(stage);
}

function setStage(stage){
  showStage(stage);
  ensureStageInitialized(stage);
}

function markClearedAndAdvance(which){
  state.cleared.add(which);
  renderTabs();

  if(allCleared()){
    setStage("reveal");
    setMsg(ui.revealMsg, "Enter fragmentA + fragmentB, then decrypt.", "warn");
    return;
  }

  const remaining = TESTS.filter(k => !state.cleared.has(k));
  const next = remaining[Math.floor(Math.random() * remaining.length)];
  setStage(next);
}

/* =========================
   TRIVIA
========================= */
function triviaRemaining(){
  return window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id)).length;
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
    markClearedAndAdvance("trivia");
    return;
  }

  const q = state.trivia.current;
  if(!q) return;

  const guess = norm(rawGuess);
  if(!guess){
    setMsg(ui.triviaMsg, "Enter an answer.", "bad");
    return;
  }

  // retire on any attempt
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
      setMsg(ui.triviaMsg, "Gate cleared.", "good");
      setTimeout(() => markClearedAndAdvance("trivia"), 250);
      return;
    }

    setTimeout(pickTrivia, 250);
    return;
  }

  state.trivia.streak = 0;
  ui.streak.textContent = "0";
  renderSide();
  setMsg(ui.triviaMsg, `Incorrect. Answer: ${q.a}`, "bad");
  setTimeout(pickTrivia, 650);
}

/* =========================
   MUSIC NOTES (7 notes, single octave)
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

let audio = {
  ctx: null,
  master: null,
};

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
  osc.frequency.value = freq;     // fixed frequencies only (single octave)
  osc.detune.value = 0;           // no drift

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
  setMsg(ui.noteMsg, "Click Play, then type A–G (Submit required).", "warn");
}

function setNoteInput(letter){
  ui.noteAnswer.value = (letter || "").toUpperCase().replace(/[^A-G]/g,"").slice(0,1);
  ui.noteAnswer.focus();
}

function checkNoteAnswer(){
  const raw = (ui.noteAnswer.value || "").trim();

  if(isOverride(raw)){
    state.note.streak = state.note.target;
    ui.noteStreak.textContent = String(state.note.streak);
    renderSide();
    setMsg(ui.noteMsg, "Override accepted.", "good");
    markClearedAndAdvance("note");
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
      setMsg(ui.noteMsg, "Gate cleared.", "good");
      setTimeout(() => markClearedAndAdvance("note"), 220);
      return;
    }

    setTimeout(() => newNoteRound(), 220);
    return;
  }

  state.note.streak = 0;
  ui.noteStreak.textContent = "0";
  renderSide();
  setMsg(ui.noteMsg, "Incorrect.", "bad");
  setTimeout(() => newNoteRound(), 260);
}

/* =========================
   SENTENCE REPAIR (2 minutes, <=3 mistakes)
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
    const mm = String(Math.floor(s/60)).padStart(1,"0");
    const ss = String(s%60).padStart(2,"0");
    ui.repairTimer.textContent = `${mm}:${ss}`;
    if(left <= 0){
      stopRepairTimer();
      setMsg(ui.repairMsg, "Time expired. Streak reset.", "bad");
      state.repair.streak = 0;
      ui.repairStreak.textContent = "0";
      renderSide();
      setTimeout(() => newRepairRound(true), 500);
    }
  };
  state.repair.timerId = setInterval(tick, 250);
  tick();
}

function newRepairRound(showIntroMsg=false){
  stopRepairTimer();
  const item = REPAIR_BANK[Math.floor(Math.random()*REPAIR_BANK.length)];
  state.repair.current = item;

  ui.repairPrompt.textContent = item.broken;
  ui.repairFormat.textContent = `1) ...
2) ...
3) ...
4) ...`;
  ui.repairAnswer.value = "";
  setMsg(ui.repairMsg, showIntroMsg ? `2 minutes. Output 4 numbered lines. Up to ${REPAIR_ALLOWED_MISTAKES} mistakes allowed.` : "", showIntroMsg ? "warn" : "");
  state.repair.deadlineTs = Date.now() + 2*60*1000;
  startRepairTimer();
  setTimeout(() => ui.repairAnswer.focus(), 0);
}

function extractNumberedLines(raw){
  const lines = (raw || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if(lines.length !== 4){
    return { ok:false, msg:"Format error: paste exactly 4 non-empty lines (1)–(4)." };
  }

  const out = [];
  for(let i=0; i<4; i++){
    const n = i + 1;
    const m = lines[i].match(/^(\d)\s*[\)\.\:\-]\s*(.+)$/);
    if(!m || Number(m[1]) !== n){
      return { ok:false, msg:`Format error: line ${n} must start with "${n})" (or "${n}."), then a space.` };
    }
    out.push(m[2].trim());
  }
  return { ok:true, body: out.join("\n") };
}

function canonRepairForScoring(s){
  // Word-level scoring. Ignores punctuation differences; counts word insert/delete/substitute as 1 mistake.
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g,"'")
    .replace(/[“”]/g,'"')
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function checkRepairAnswer(){
  const raw = ui.repairAnswer.value || "";

  if(isOverride(raw)){
    stopRepairTimer();
    state.repair.streak = state.repair.target;
    ui.repairStreak.textContent = String(state.repair.streak);
    renderSide();
    setMsg(ui.repairMsg, "Override accepted.", "good");
    markClearedAndAdvance("repair");
    return;
  }

  if(!state.repair.current){
    setMsg(ui.repairMsg, "No prompt loaded.", "bad");
    return;
  }

  if(Date.now() > state.repair.deadlineTs){
    setMsg(ui.repairMsg, "Time expired.", "bad");
    return;
  }

  const g1 = extractNumberedLines(raw);
  if(!g1.ok){
    setMsg(ui.repairMsg, g1.msg, "bad");
    return;
  }

  const t1 = extractNumberedLines(state.repair.current.fixed);
  if(!t1.ok){
    // should never happen unless bank is corrupted
    setMsg(ui.repairMsg, "Internal format error in answer key.", "bad");
    return;
  }

  const guess = canonRepairForScoring(g1.body);
  const truth = canonRepairForScoring(t1.body);

  const gTok = guess ? guess.split(" ") : [];
  const tTok = truth ? truth.split(" ") : [];

  const mistakes = levenshteinTokens(gTok, tTok);
  const ok = mistakes <= REPAIR_ALLOWED_MISTAKES;

  if(ok){
    stopRepairTimer();
    state.repair.streak += 1;
    ui.repairStreak.textContent = String(state.repair.streak);
    renderSide();
    setMsg(ui.repairMsg, `Correct (mistakes: ${mistakes}/${REPAIR_ALLOWED_MISTAKES}).`, "good");

    if(state.repair.streak >= state.repair.target){
      setMsg(ui.repairMsg, "Gate cleared.", "good");
      setTimeout(() => markClearedAndAdvance("repair"), 220);
      return;
    }

    setTimeout(() => newRepairRound(true), 280);
    return;
  }

  stopRepairTimer();
  state.repair.streak = 0;
  ui.repairStreak.textContent = "0";
  renderSide();
  setMsg(ui.repairMsg, `Too many mistakes (${mistakes}). Streak reset.`, "bad");
  setTimeout(() => newRepairRound(true), 450);
}

/* =========================
   GRID NAV (20 steps)
========================= */
function makeGridModel(){
  const size = 9;
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

  const target = { x, y };
  return { size, start, steps, target, chosen: null };
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

      const isStart = (x===m.start.x && y===m.start.y);
      const isChosen = (m.chosen && x===m.chosen.x && y===m.chosen.y);

      if(isStart) cell.classList.add("start");
      if(isChosen) cell.classList.add("chosen");

      cell.addEventListener("click", () => {
        // click once selects; click again submits (handled by container listener)
        m.chosen = { x, y };
        renderGrid();
        setMsg(ui.gridMsg, "Selection recorded. Click the same point again to submit.", "warn");
      });

      ui.gridBoard.appendChild(cell);
    }
  }
}

function newGridRound(showMsg=false){
  state.grid.model = makeGridModel();
  renderGrid();
  setMsg(ui.gridMsg, showMsg ? "Click the final intersection, then click it again to submit." : "Click an intersection to select.", "warn");
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
    setMsg(ui.gridMsg, "Correct. Gate cleared.", "good");
    setTimeout(() => markClearedAndAdvance("grid"), 240);
    return;
  }

  state.grid.streak = 0;
  ui.gridStreak.textContent = "0";
  renderSide();
  setMsg(ui.gridMsg, "Incorrect. Streak reset.", "bad");
  setTimeout(() => newGridRound(true), 350);
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

  try{
    const poem = await decryptPoemJson(pass, pj);
    ui.poemText.textContent = poem;
    setMsg(ui.revealMsg, "Decryption successful.", "good");
  } catch (e){
    console.error(e);
    ui.poemText.textContent = "";
    const hint = pj?.hint ? ` ${pj.hint}` : "";
    setMsg(ui.revealMsg, `Decryption failed.${hint}`, "bad");
  }
}

/* =========================
   RESET / INIT
========================= */
function hardResetProgress(){
  // timers
  stopRepairTimer();

  // reset state
  state.initialized = new Set();
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
  ui.triviaTarget.textContent = String(state.trivia.target);
  ui.noteStreak.textContent = "0";
  ui.noteTarget.textContent = String(state.note.target);
  ui.repairStreak.textContent = "0";
  ui.repairTarget.textContent = String(state.repair.target);
  ui.gridStreak.textContent = "0";
  ui.gridTarget.textContent = String(state.grid.target);

  setMsg(ui.triviaMsg, "", "");
  setMsg(ui.noteMsg, "", "");
  setMsg(ui.repairMsg, "", "");
  setMsg(ui.gridMsg, "", "");
  setMsg(ui.revealMsg, "", "");

  ui.poemText.textContent = "";
  ui.fragA.value = "";
  ui.fragB.value = "";

  // pick a random starting stage
  const first = shuffle(TESTS)[0];
  setStage(first);

  // counters
  ui.remaining.textContent = String(triviaRemaining());
  renderSide();
}

async function init(){
  assertUI();

  applyTheme(preferredTheme());
  ui.themeToggle.addEventListener("click", toggleTheme);

  // Top tabs: always switch view
  [ui.stepTrivia, ui.stepNote, ui.stepRepair, ui.stepGrid].forEach(btn => {
    btn.addEventListener("click", () => setStage(btn.dataset.stage));
  });

  if(!window.TRIVIA_BANK || !Array.isArray(window.TRIVIA_BANK) || window.TRIVIA_BANK.length < 50){
    ui.question.textContent = "Trivia bank missing or invalid.";
    setMsg(ui.triviaMsg, "Ensure trivia_bank.js is loaded before app.js.", "bad");
    return;
  }

  try{
    await loadPoemJson();
  } catch (e){
    console.error(e);
    setMsg(ui.revealMsg, "Warning: poem.json failed to load. Reveal stage will not decrypt.", "warn");
  }

  // Full reset every page load (as requested)
  hardResetProgress();

  // Events: Trivia
  ui.submitAnswer.addEventListener("click", checkTriviaAnswer);
  ui.answer.addEventListener("keydown", (e) => { if(e.key === "Enter") checkTriviaAnswer(); });

  // Events: Music notes
  ui.playNote.addEventListener("click", () => {
    if(!state.note.current) newNoteRound();
    try{
      playTone(state.note.current.f, 700);
      setMsg(ui.noteMsg, "Played. Enter A–G, then Submit.", "warn");
      ui.noteAnswer.focus();
    } catch (e){
      console.error(e);
      setMsg(ui.noteMsg, "Audio blocked. Click Play again.", "bad");
    }
  });
  ui.submitNote.addEventListener("click", checkNoteAnswer);
  ui.noteAnswer.addEventListener("keydown", (e) => { if(e.key === "Enter") checkNoteAnswer(); });

  // On-screen note buttons: fill only (no submit)
  document.querySelectorAll(".noteBtn").forEach(btn => {
    btn.addEventListener("click", () => setNoteInput(btn.dataset.note));
  });

  // Hotkeys (A–G) in note stage: fill only (no submit)
  window.addEventListener("keydown", (e) => {
    if(state.stage !== "note") return;
    if(e.metaKey || e.ctrlKey || e.altKey) return;

    const k = (e.key || "").toUpperCase();
    if(/^[A-G]$/.test(k)){
      // Do not auto-submit; only fill
      setNoteInput(k);
    }
  });

  // Events: Repair
  ui.submitRepair.addEventListener("click", checkRepairAnswer);
  ui.repairAnswer.addEventListener("keydown", (e) => {
    if(e.key === "Enter" && (e.metaKey || e.ctrlKey)) checkRepairAnswer();
  });

  // Events: Grid
  ui.resetGrid.addEventListener("click", () => newGridRound(true));
  ui.gridBoard.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".gridCell");
    if(!btn) return;

    const x = Number(btn.dataset.x);
    const y = Number(btn.dataset.y);
    const m = state.grid.model;
    if(!m || !m.chosen) return;

    // submit only when clicking chosen again
    if(m.chosen.x === x && m.chosen.y === y){
      checkGridChoice();
    }
  });

  // Reveal
  ui.decryptPoemBtn.addEventListener("click", tryDecryptFromInputs);
  ui.fragB.addEventListener("keydown", (e) => { if(e.key === "Enter") tryDecryptFromInputs(); });

  // Manual reset button (still available)
  ui.resetProgress.addEventListener("click", () => {
    if(confirm("Reset progress for this session?")) hardResetProgress();
  });
}

window.addEventListener("load", init);
