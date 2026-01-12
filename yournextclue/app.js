/* app.js — patched to WORK with your current index.html IDs and your latest rules */

const $ = (id) => document.getElementById(id);

/* =========================
   UI MAP (supports your HTML)
========================= */
const ui = {
  // Steps (your HTML uses step0..step4)
  stepTrivia: $("step0") || $("stepTrivia"),
  stepNote: $("step1") || $("stepNote"),
  stepRepair: $("step2") || $("stepRepair"),
  stepGrid: $("step3") || $("stepGrid"),
  stepReveal: $("step4") || $("stepReveal"),

  // Panels
  panelTitle: $("panelTitle"),
  panelDesc: $("panelDesc"),
  statusPill: $("statusPill"),

  // Stages (your HTML uses stageNotes, not stageNote)
  stageTrivia: $("stageTrivia"),
  stageNote: $("stageNotes") || $("stageNote"),
  stageRepair: $("stageRepair"),
  stageGrid: $("stageGrid"),
  stageReveal: $("stageReveal"),

  // Sidebar (your HTML uses p0Val..p3Val)
  objective: $("objective"),
  pTrivia: $("p0Val") || $("pTrivia"),
  pNote: $("p1Val") || $("pNote"),
  pRepair: $("p2Val") || $("pRepair"),
  pGrid: $("p3Val") || $("pGrid"),

  // Global controls
  resetProgress: $("resetProgress"),

  // Trivia
  streak: $("streak"),
  remaining: $("remaining"),
  category: $("category"),
  question: $("question"),
  answer: $("answer"),
  submitAnswer: $("submitAnswer"),
  triviaMsg: $("triviaMsg"),
  triviaTargetLabel: $("triviaTarget"), // exists in your HTML

  // Note (your HTML uses noteGuess + replayNote)
  noteStreak: $("noteStreak"),
  noteTarget: $("noteTarget"),
  playNote: $("playNote"),
  replayNote: $("replayNote"), // will be hidden
  noteAnswer: $("noteGuess") || $("noteAnswer"),
  submitNote: $("submitNote"),
  noteMsg: $("noteMsg"),

  // Repair (your HTML uses repairBroken + repairInput + newRepair)
  repairStreak: $("repairStreak"),
  repairTarget: $("repairTarget"),
  repairTimer: $("repairTimer"),
  repairPrompt: $("repairBroken") || $("repairPrompt"),
  repairAnswer: $("repairInput") || $("repairAnswer"),
  submitRepair: $("submitRepair"),
  newRepair: $("newRepair"),
  repairMsg: $("repairMsg"),

  // Grid (your HTML uses dirList + grid + regenGrid)
  gridStreak: $("gridStreak"),
  gridTarget: $("gridTarget"),
  gridSteps: $("dirList") || $("gridSteps"),
  gridBoard: $("grid") || $("gridBoard"),
  gridMsg: $("gridMsg"),
  resetGrid: $("regenGrid") || $("resetGrid"),

  // Reveal
  poemText: $("poemText"),
  revealMsg: $("revealMsg"),
  copyPoem: $("copyPoem"),
};

const OVERRIDE_CODE = "1324";

/* =========================
   UTIL
========================= */
function assertUI(){
  const required = [
    "panelTitle","panelDesc","statusPill",
    "stageTrivia","stageNote","stageRepair","stageGrid","stageReveal",
    "stepTrivia","stepNote","stepRepair","stepGrid",
    "objective","pTrivia","pNote","pRepair","pGrid",
    "streak","remaining","category","question","answer","submitAnswer","triviaMsg",
    "noteStreak","noteTarget","playNote","noteAnswer","submitNote","noteMsg",
    "repairStreak","repairTarget","repairTimer","repairPrompt","repairAnswer","submitRepair","repairMsg",
    "gridStreak","gridTarget","gridSteps","gridBoard","gridMsg","resetGrid",
    "poemText","revealMsg"
  ];
  const missing = required.filter(k => !ui[k]);
  if(missing.length){
    const msg = `Missing required DOM IDs: ${missing.join(", ")}`;
    console.error(msg);
    throw new Error(msg);
  }
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

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

function matchesAny(guess, truths){
  const g = norm(guess);
  if(!g) return false;
  for(const t of truths){
    if(!t) continue;
    const tn = norm(t);
    if(g === tn) return true;
    if(g.length >= 3 && tn.length >= 3 && (tn.includes(g) || g.includes(tn))) return true;

    // small typo tolerance for trivia
    const dist = levenshteinRaw(g, tn);
    const L = Math.max(g.length, tn.length);
    const ok =
      (L <= 4 && dist <= 1) ||
      (L <= 7 && dist <= 1) ||
      (L <= 12 && dist <= 2) ||
      (L > 12 && dist <= 3);
    if(ok) return true;
  }
  return false;
}

/* =========================
   APP STATE / FLOW
========================= */
const TESTS = ["trivia","note","repair","grid"]; // reveal is implicit final

const state = {
  stage: "trivia",        // currently VIEWED stage
  order: [],              // randomized gate order
  idx: 0,                 // active gate index inside order
  cleared: new Set(),     // cleared gates

  trivia: { target: 15, streak: 0, retired: new Set(), current: null },
  note:   { target: 5,  streak: 0, current: null },
  repair: { target: 3,  streak: 0, current: null, deadlineTs: 0, timerId: null },
  grid:   {
    target: 1,
    streak: 0,
    model: null,
    hideTimerId: null,
    hideAtTs: 0,
    backdoorSeq: [],
    backdoorClicks: [],
    lastClickTs: 0
  },

  poem: { json: null }
};

function activeGate(){
  if(state.idx >= state.order.length) return "reveal";
  return state.order[state.idx];
}

function gateLabel(key){
  if(key === "trivia") return "Trivia";
  if(key === "note") return "Music Notes";
  if(key === "repair") return "Repair";
  if(key === "grid") return "Grid";
  return key;
}

function setStage(stage, opts = {}){
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

  // hide Reveal tab permanently (you requested)
  if(stepMap.reveal) stepMap.reveal.style.display = "none";

  // Rename Notes tab
  if(stepMap.note) stepMap.note.childNodes.forEach?.(() => {});
  if(stepMap.note) {
    // preserve dot span if present
    const dot = stepMap.note.querySelector?.(".dot");
    stepMap.note.textContent = gateLabel("note");
    if(dot){
      stepMap.note.prepend(dot);
      stepMap.note.insertBefore(document.createTextNode(" "), dot.nextSibling);
    }
  }

  // Reset classes
  Object.values(stepMap).forEach(el => { if(el) el.className = "step"; });
  Object.values(stageMap).forEach(el => { if(el) el.classList.remove("show"); });

  // Mark done/active based on cleared + viewed stage
  for(const k of TESTS){
    const el = stepMap[k];
    if(!el) continue;
    if(state.cleared.has(k)) el.className = "step done";
  }
  const viewedEl = stepMap[stage];
  if(viewedEl && stage !== "reveal") viewedEl.className = state.cleared.has(stage) ? "step done" : "step active";

  // Show stage
  stageMap[stage].classList.add("show");

  // Panel copy (based on VIEWED stage)
  const active = activeGate();
  const locked = (stage !== "reveal" && stage !== active && !state.cleared.has(stage));

  if(stage === "trivia"){
    ui.panelTitle.textContent = "Test — Trivia";
    ui.panelDesc.innerHTML = `Get <b>${state.trivia.target} correct in a row</b>. Miss resets to 0.`;
    ui.objective.textContent = `${state.trivia.target} in a row`;
  } else if(stage === "note"){
    ui.panelTitle.textContent = "Test — Music Notes";
    ui.panelDesc.innerHTML = `Listen to a note and type the letter (<b>A–G</b>). Get <b>${state.note.target} in a row</b>.`;
    ui.objective.textContent = `${state.note.target} in a row`;
  } else if(stage === "repair"){
    ui.panelTitle.textContent = "Test — Sentence Repair";
    ui.panelDesc.innerHTML = `Fix the text. <b>2:30</b> time limit. Get <b>${state.repair.target} wins in a row</b>. Tolerance: <b>≤ 5 wrong characters</b>.`;
    ui.objective.textContent = `${state.repair.target} wins in a row`;
  } else if(stage === "grid"){
    ui.panelTitle.textContent = "Test — Grid Memory Path";
    ui.panelDesc.innerHTML = `Memorize <b>15 directions</b> (they hide after <b>30s</b>). Then click the full path on the grid.`;
    ui.objective.textContent = `1 correct`;
  } else {
    ui.panelTitle.textContent = "Access Granted";
    ui.panelDesc.textContent = "";
    ui.objective.textContent = "";
  }

  if(stage === "reveal"){
    ui.statusPill.textContent = "Unlocked";
  } else if(state.cleared.has(stage)){
    ui.statusPill.textContent = "Cleared";
  } else if(locked){
    ui.statusPill.textContent = "Locked";
  } else {
    ui.statusPill.textContent = "In progress";
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
    setMsg(ui.revealMsg, "All gates cleared. Decrypt the payload below.", "good");
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
   GLOBAL BACKDOOR: type 1324 anywhere
   Clears the CURRENT ACTIVE gate.
========================= */
let __overrideBuf = "";
let __overrideLastTs = 0;

function forceClearGate(msg = "Override accepted."){
  const active = activeGate();
  if(active === "reveal") return;

  // snap UI to the active gate so it feels consistent
  if(state.stage !== active) setStage(active);

  if(active === "trivia"){
    state.trivia.streak = state.trivia.target;
    ui.streak.textContent = String(state.trivia.streak);
    setMsg(ui.triviaMsg, msg, "good");
  } else if(active === "note"){
    state.note.streak = state.note.target;
    ui.noteStreak.textContent = String(state.note.streak);
    setMsg(ui.noteMsg, msg, "good");
  } else if(active === "repair"){
    stopRepairTimer();
    state.repair.streak = state.repair.target;
    ui.repairStreak.textContent = String(state.repair.streak);
    setMsg(ui.repairMsg, msg, "good");
  } else if(active === "grid"){
    state.grid.streak = state.grid.target;
    ui.gridStreak.textContent = String(state.grid.streak);
    setMsg(ui.gridMsg, msg, "good");
  }

  renderSide();
  setTimeout(() => advanceOrReveal(), 150);
}

function onGlobalOverrideKeydown(e){
  if(!/^\d$/.test(e.key)) return;
  const now = Date.now();
  if(now - __overrideLastTs > 1500) __overrideBuf = "";
  __overrideLastTs = now;

  __overrideBuf += e.key;
  if(__overrideBuf.length > OVERRIDE_CODE.length) __overrideBuf = __overrideBuf.slice(-OVERRIDE_CODE.length);

  if(__overrideBuf === OVERRIDE_CODE){
    __overrideBuf = "";
    forceClearGate("Override accepted.");
  }
}

window.addEventListener("keydown", onGlobalOverrideKeydown, { capture: true });

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
  if(activeGate() !== "trivia"){
    setMsg(ui.triviaMsg, `Trivia is not the active gate right now.`, "warn");
    return;
  }

  const rawGuess = ui.answer.value || "";
  if(isOverride(rawGuess)){ forceClearGate(); return; }

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
      setTimeout(() => advanceOrReveal(), 250);
      return;
    }

    setTimeout(pickTrivia, 250);
    return;
  }

  state.trivia.streak = 0;
  ui.streak.textContent = "0";
  renderSide();
  setMsg(ui.triviaMsg, `Incorrect. Answer: ${q.a}`, "bad");
  setTimeout(pickTrivia, 500);
}

/* =========================
   MUSIC NOTES (A–G only)
   (fixed octave; exactly 7 notes)
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
  setMsg(ui.noteMsg, "Click Play, then type A–G. Submit required.", "warn");
  if(autoPlay){
    try{ playTone(state.note.current.f, 750); } catch {}
  }
  setTimeout(() => ui.noteAnswer.focus(), 0);
}

function checkNoteAnswer(){
  if(activeGate() !== "note"){
    setMsg(ui.noteMsg, `Music Notes is not the active gate right now.`, "warn");
    return;
  }

  const raw = (ui.noteAnswer.value || "").trim();
  if(isOverride(raw)){ forceClearGate(); return; }

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
      setTimeout(() => advanceOrReveal(), 200);
      return;
    }

    setTimeout(() => newNoteRound(false), 250);
    return;
  }

  state.note.streak = 0;
  ui.noteStreak.textContent = "0";
  renderSide();
  setMsg(ui.noteMsg, `Incorrect.`, "bad");
  setTimeout(() => newNoteRound(false), 300);
}

/* =========================
   SENTENCE REPAIR (2:30, <= 5 wrong chars)
   “Less iffy”: soft canonicalization + better feedback.
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

function softCanon(s){
  // Normalizes common fat-finger variance without changing meaning/structure.
  return (s || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[’‘]/g,"'")
    .replace(/[“”]/g,'"')
    .replace(/\s*\n\s*/g, "\n")          // normalize line breaks
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s*([,.;:!?])\s*/g, "$1 ") // punctuation spacing
    .replace(/ +\n/g, "\n")
    .trim();
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
      setMsg(ui.repairMsg, "Time expired. Streak reset.", "bad");
      state.repair.streak = 0;
      ui.repairStreak.textContent = "0";
      renderSide();
      setTimeout(() => newRepairRound(true), 450);
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

function newRepairRound(showIntro=false){
  stopRepairTimer();
  const item = REPAIR_BANK[Math.floor(Math.random()*REPAIR_BANK.length)];
  state.repair.current = item;

  ui.repairPrompt.textContent = item.broken;
  ui.repairAnswer.value = "";
  if(showIntro){
    setMsg(ui.repairMsg, "Format: keep 1)–4) and line breaks. Submit required.", "warn");
  } else {
    setMsg(ui.repairMsg, "", "");
  }

  state.repair.deadlineTs = Date.now() + 150 * 1000; // 2:30
  startRepairTimer();
  setTimeout(() => ui.repairAnswer.focus(), 0);
}

function checkRepairAnswer(){
  if(activeGate() !== "repair"){
    setMsg(ui.repairMsg, `Repair is not the active gate right now.`, "warn");
    return;
  }

  const raw = ui.repairAnswer.value || "";
  if(isOverride(raw)){ forceClearGate(); return; }

  if(!state.repair.current){
    setMsg(ui.repairMsg, "No prompt loaded.", "bad");
    return;
  }

  if(state.repair.deadlineTs - Date.now() <= 0){
    setMsg(ui.repairMsg, "Time expired.", "bad");
    return;
  }

  const guess = softCanon(raw);
  const truth = softCanon(state.repair.current.fixed);

  const dist = levenshteinRaw(guess, truth);
  const tol = 5;

  if(dist <= tol){
    stopRepairTimer();
    state.repair.streak += 1;
    ui.repairStreak.textContent = String(state.repair.streak);
    renderSide();
    setMsg(ui.repairMsg, dist === 0 ? "Perfect." : "Accepted — minor variations within tolerance.", "good");

    if(state.repair.streak >= state.repair.target){
      setMsg(ui.repairMsg, "Gate cleared.", "good");
      setTimeout(() => advanceOrReveal(), 200);
      return;
    }

    setTimeout(() => newRepairRound(true), 250);
    return;
  }

  stopRepairTimer();
  state.repair.streak = 0;
  ui.repairStreak.textContent = "0";
  renderSide();

  if(dist <= 20){
    setMsg(ui.repairMsg, "Close, but outside tolerance. Recheck punctuation/wording and keep 1)–4) on separate lines.", "bad");
  } else {
    setMsg(ui.repairMsg, "Incorrect. Keep the same 4-line format (1)–4) and match the corrected text.", "bad");
  }

  setTimeout(() => newRepairRound(true), 450);
}

/* =========================
   GRID (15 directions; hide after 30s; click full path)
   Also includes click-based backdoor sequence relative to start.
========================= */
function makeGridModel(){
  const size = 9;     // 9x9
  const stepsN = 15;  // per request
  const dirs = ["U","D","L","R"];

  const start = {
    x: 2 + Math.floor(Math.random() * (size - 4)),
    y: 2 + Math.floor(Math.random() * (size - 4)),
  };

  let steps = [];
  let path = [{ x: start.x, y: start.y }];
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

    path.push({ x, y });
  }

  return {
    size,
    start,
    steps,
    path,                 // full expected sequence (start + 15 moves)
    progress: 0,          // how many correct clicks so far (0..15). click i expects path[i+1]
    clicks: [],           // clicked coords (excluding start)
    completeReady: false, // final point reached
  };
}

function dirToText(d){
  if(d === "U") return "Up";
  if(d === "D") return "Down";
  if(d === "L") return "Left";
  if(d === "R") return "Right";
  return d;
}

function clearGridHideTimer(){
  if(state.grid.hideTimerId){
    clearTimeout(state.grid.hideTimerId);
    state.grid.hideTimerId = null;
  }
}

function computeGridBackdoorSeq(start){
  // relative to start:
  // 1) +3 right, -2 up
  // 2) down by 2
  // 3) right by 4
  const a = { x: start.x + 3, y: start.y - 2 };
  const b = { x: a.x, y: a.y + 2 };
  const c = { x: b.x + 4, y: b.y };
  return [a,b,c];
}

function inBounds(m, p){
  return p.x >= 0 && p.y >= 0 && p.x < m.size && p.y < m.size;
}

function renderGrid(){
  const m = state.grid.model;
  if(!m) return;

  // directions (visible window)
  if(Date.now() < state.grid.hideAtTs){
    ui.gridSteps.innerHTML = m.steps
      .map((d,i) => `<div class="stepLine"><span class="mono">${String(i+1).padStart(2,"0")}</span> ${dirToText(d)}</div>`)
      .join("");
  } else {
    ui.gridSteps.innerHTML = `<div class="mono" style="opacity:.85;">Directions hidden. Click the full remembered path.</div>`;
  }

  // board
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

      const isStart = (x===m.start.x && y===m.start.y);
      if(isStart) cell.classList.add("start");

      // mark clicked path
      const clickedIdx = m.clicks.findIndex(p => p.x===x && p.y===y);
      if(clickedIdx >= 0) cell.classList.add("chosen");

      // last clicked highlight
      const last = m.clicks[m.clicks.length-1];
      if(last && last.x===x && last.y===y) cell.classList.add("lastPick");

      cell.addEventListener("click", () => onGridCellClick(x,y));

      ui.gridBoard.appendChild(cell);
    }
  }
}

function newGridRound(resetMsg=false){
  clearGridHideTimer();

  const m = makeGridModel();
  state.grid.model = m;

  // set hide timer
  state.grid.hideAtTs = Date.now() + 30 * 1000;
  state.grid.hideTimerId = setTimeout(() => {
    // rerender to hide text
    renderGrid();
    setMsg(ui.gridMsg, "Directions hidden. Now click the full remembered path.", "warn");
  }, 30 * 1000);

  // set backdoor sequence relative to start (clamped to bounds)
  const seq = computeGridBackdoorSeq(m.start);
  state.grid.backdoorSeq = seq.filter(p => inBounds(m, p));
  state.grid.backdoorClicks = [];
  state.grid.lastClickTs = 0;

  m.progress = 0;
  m.clicks = [];
  m.completeReady = false;

  renderGrid();
  setMsg(ui.gridMsg, resetMsg ? "Memorize directions (30s), then click the full path." : "Memorize directions (30s).", "warn");
}

function recordGridBackdoorClick(x,y){
  const now = Date.now();
  if(now - state.grid.lastClickTs > 4000){
    state.grid.backdoorClicks = [];
  }
  state.grid.lastClickTs = now;

  state.grid.backdoorClicks.push({x,y});
  if(state.grid.backdoorClicks.length > state.grid.backdoorSeq.length){
    state.grid.backdoorClicks = state.grid.backdoorClicks.slice(-state.grid.backdoorSeq.length);
  }

  const okLen = state.grid.backdoorClicks.length === state.grid.backdoorSeq.length;
  if(!okLen) return false;

  for(let i=0; i<state.grid.backdoorSeq.length; i++){
    const a = state.grid.backdoorClicks[i];
    const b = state.grid.backdoorSeq[i];
    if(!b || a.x !== b.x || a.y !== b.y) return false;
  }
  return true;
}

function onGridCellClick(x,y){
  if(activeGate() !== "grid"){
    setMsg(ui.gridMsg, `Grid is not the active gate right now.`, "warn");
    return;
  }

  const m = state.grid.model;
  if(!m) return;

  // click-based backdoor sequence
  if(recordGridBackdoorClick(x,y)){
    forceClearGate("Override accepted.");
    return;
  }

  // enforce memory phase: still allow clicking, but directions hide is the challenge
  // (no additional locking here)

  // If already complete-ready, require clicking final again to submit (submit-style)
  if(m.completeReady){
    const last = m.path[m.path.length - 1];
    if(x === last.x && y === last.y){
      // Submit: validate full path correctness
      checkGridChoice();
      return;
    } else {
      setMsg(ui.gridMsg, "Click the final cell again to submit.", "warn");
      return;
    }
  }

  // Determine expected next point in path (excluding start)
  const expected = m.path[m.progress + 1]; // progress 0 expects path[1]
  if(!expected){
    return;
  }

  if(x === expected.x && y === expected.y){
    m.clicks.push({x,y});
    m.progress += 1;

    if(m.progress === m.steps.length){
      m.completeReady = true;
      renderGrid();
      setMsg(ui.gridMsg, "Path complete. Click the final cell again to submit.", "warn");
      return;
    }

    renderGrid();
    setMsg(ui.gridMsg, `Good. (${m.progress}/${m.steps.length}) Keep going.`, "warn");
    return;
  }

  // wrong click => reset streak and regenerate (per your style)
  state.grid.streak = 0;
  ui.gridStreak.textContent = "0";
  renderSide();
  setMsg(ui.gridMsg, "Incorrect path. Streak reset. New grid.", "bad");
  setTimeout(() => newGridRound(true), 400);
}

function checkGridChoice(){
  const m = state.grid.model;
  if(!m){
    setMsg(ui.gridMsg, "No grid loaded.", "bad");
    return;
  }

  // must have completed all steps
  if(m.progress !== m.steps.length){
    setMsg(ui.gridMsg, "You must click the full path before submitting.", "bad");
    return;
  }

  // If they reached this point, path clicks were verified step-by-step.
  state.grid.streak += 1;
  ui.gridStreak.textContent = String(state.grid.streak);
  renderSide();
  setMsg(ui.gridMsg, "Correct. Gate cleared.", "good");

  if(state.grid.streak >= state.grid.target){
    setTimeout(() => advanceOrReveal(), 220);
    return;
  }

  setTimeout(() => newGridRound(true), 300);
}

/* =========================
   POEM.JSON DECRYPT (optional)
   If your reveal stage lacks inputs, we create them.
========================= */
function b64ToBytes(b64){
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for(let i=0; i<bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function decryptPoemJson(passphrase, poemJson){
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const salt = b64ToBytes(poemJson.kdf.saltB64);
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: poemJson.kdf.hash, salt, iterations: poemJson.kdf.iterations },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const iv = b64ToBytes(poemJson.cipher.ivB64);
  const ct = b64ToBytes(poemJson.cipher.ctB64);

  const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ct);
  return new TextDecoder().decode(ptBuf);
}

async function loadPoemJson(){
  const res = await fetch("./poem.json", { cache: "no-store" });
  if(!res.ok) throw new Error(`Failed to load poem.json: ${res.status}`);
  state.poem.json = await res.json();
}

function ensureRevealControls(){
  // Create fragment inputs + decrypt button if your HTML doesn't have them
  const host = ui.stageReveal;
  if(!host) return;

  if(host.querySelector?.("#fragA")) return; // already exists

  const wrap = document.createElement("div");
  wrap.style.marginTop = "12px";
  wrap.style.display = "flex";
  wrap.style.flexWrap = "wrap";
  wrap.style.gap = "10px";
  wrap.style.alignItems = "center";

  const a = document.createElement("input");
  a.id = "fragA";
  a.type = "text";
  a.autocomplete = "off";
  a.spellcheck = false;
  a.placeholder = "fragmentA";

  const b = document.createElement("input");
  b.id = "fragB";
  b.type = "text";
  b.autocomplete = "off";
  b.spellcheck = false;
  b.placeholder = "fragmentB";

  const btn = document.createElement("button");
  btn.id = "decryptPoemBtn";
  btn.className = "btn primary";
  btn.textContent = "Decrypt";

  wrap.appendChild(a);
  wrap.appendChild(b);
  wrap.appendChild(btn);

  // insert before poemText if possible
  const poem = ui.poemText;
  if(poem && poem.parentElement){
    poem.parentElement.insertBefore(wrap, poem);
  } else {
    host.appendChild(wrap);
  }

  // wire up
  btn.addEventListener("click", tryDecryptFromInputs);
  b.addEventListener("keydown", (e) => { if(e.key === "Enter") tryDecryptFromInputs(); });
}

async function tryDecryptFromInputs(){
  const pj = state.poem.json;
  if(!pj){
    setMsg(ui.revealMsg, "poem.json not loaded.", "bad");
    return;
  }

  const fragA = document.getElementById("fragA");
  const fragB = document.getElementById("fragB");
  if(!fragA || !fragB){
    setMsg(ui.revealMsg, "Missing fragment inputs.", "bad");
    return;
  }

  const a = (fragA.value || "").trim().toLowerCase().replace(/\s+/g,"");
  const b = (fragB.value || "").trim().toLowerCase().replace(/\s+/g,"");
  const pass = `${a}${b}`;

  if(pass.length < 4){
    setMsg(ui.revealMsg, "Enter fragmentA + fragmentB (lowercase, no spaces).", "warn");
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
   Full reset on every reload.
========================= */
function hardResetNoConfirm(){
  // stop timers
  stopRepairTimer();
  clearGridHideTimer();

  // reset state
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

  // fresh randomized order each reload
  state.order = shuffle(TESTS);

  // set labels
  if(ui.triviaTargetLabel) ui.triviaTargetLabel.textContent = String(state.trivia.target);
  ui.noteTarget.textContent = String(state.note.target);
  ui.repairTarget.textContent = String(state.repair.target);
  ui.gridTarget.textContent = String(state.grid.target);

  ui.remaining.textContent = String(triviaRemaining());

  // enter first active gate
  const first = activeGate();
  setStage(first);

  if(first === "trivia") pickTrivia();
  if(first === "note") newNoteRound(false);
  if(first === "repair") newRepairRound(true);
  if(first === "grid") newGridRound(true);

  renderSide();
}

async function init(){
  assertUI();

  // Hide Replay button if present (you requested)
  if(ui.replayNote) ui.replayNote.style.display = "none";

  // Top tabs should switch screens
  const navMap = [
    ["trivia", ui.stepTrivia],
    ["note", ui.stepNote],
    ["repair", ui.stepRepair],
    ["grid", ui.stepGrid]
  ];
  navMap.forEach(([key, el]) => {
    if(!el) return;
    el.style.cursor = "pointer";
    el.addEventListener("click", () => setStage(key, { fromNav: true }));
  });

  if(!window.TRIVIA_BANK || !Array.isArray(window.TRIVIA_BANK) || window.TRIVIA_BANK.length < 50){
    ui.question.textContent = "Trivia bank missing or invalid.";
    setMsg(ui.triviaMsg, "Ensure trivia_bank.js is loaded before app.js.", "bad");
    return;
  }

  // Load poem.json for final decrypt (optional)
  try{
    await loadPoemJson();
  } catch (e){
    console.error(e);
    setMsg(ui.revealMsg, "Warning: poem.json failed to load. Reveal stage will not decrypt.", "warn");
  }

  // Ensure reveal controls exist
  ensureRevealControls();

  // Full reset every reload
  hardResetNoConfirm();
}

/* =========================
   EVENTS
========================= */
// Trivia
ui.submitAnswer.addEventListener("click", checkTriviaAnswer);
ui.answer.addEventListener("keydown", (e) => { if(e.key === "Enter") checkTriviaAnswer(); });

// Note
ui.playNote.addEventListener("click", () => {
  if(activeGate() !== "note"){
    setMsg(ui.noteMsg, `Music Notes is not the active gate right now.`, "warn");
    return;
  }
  if(!state.note.current) newNoteRound(false);
  try{
    playTone(state.note.current.f, 750);
    setMsg(ui.noteMsg, "Played. Enter A–G, then submit.", "warn");
    ui.noteAnswer.focus();
  } catch (e){
    console.error(e);
    setMsg(ui.noteMsg, "Audio blocked. Click the page and try again.", "bad");
  }
});
ui.submitNote.addEventListener("click", checkNoteAnswer);
ui.noteAnswer.addEventListener("keydown", (e) => { if(e.key === "Enter") checkNoteAnswer(); });

// Repair
ui.submitRepair.addEventListener("click", checkRepairAnswer);
ui.repairAnswer.addEventListener("keydown", (e) => {
  // submit on Ctrl/Cmd+Enter
  if(e.key === "Enter" && (e.metaKey || e.ctrlKey)) checkRepairAnswer();
});
if(ui.newRepair){
  ui.newRepair.addEventListener("click", () => {
    if(activeGate() !== "repair"){
      setMsg(ui.repairMsg, `Repair is not the active gate right now.`, "warn");
      return;
    }
    newRepairRound(true);
  });
}

// Grid
ui.resetGrid.addEventListener("click", () => {
  if(activeGate() !== "grid"){
    setMsg(ui.gridMsg, `Grid is not the active gate right now.`, "warn");
    return;
  }
  newGridRound(true);
});

// Reveal: copy
if(ui.copyPoem){
  ui.copyPoem.addEventListener("click", async () => {
    try{
      await navigator.clipboard.writeText(ui.poemText.textContent || "");
      setMsg(ui.revealMsg, "Copied.", "good");
    } catch {
      setMsg(ui.revealMsg, "Copy failed (browser permissions).", "warn");
    }
  });
}

// Reset progress button (no confirm; full reset)
ui.resetProgress.addEventListener("click", () => hardResetNoConfirm());

// Init
window.addEventListener("load", () => { init(); });
