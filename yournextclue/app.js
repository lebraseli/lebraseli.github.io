/* Global TRIVIA_BANK is loaded from trivia_bank.js */

const $ = (id) => document.getElementById(id);

const ui = {
  // steps
  stepTrivia: $("stepTrivia"),
  stepNote: $("stepNote"),
  stepRepair: $("stepRepair"),
  stepGrid: $("stepGrid"),
  stepReveal: $("stepReveal"),

  // panel
  panelTitle: $("panelTitle"),
  panelDesc: $("panelDesc"),
  statusPill: $("statusPill"),

  // stages
  stageTrivia: $("stageTrivia"),
  stageNote: $("stageNote"),
  stageRepair: $("stageRepair"),
  stageGrid: $("stageGrid"),
  stageReveal: $("stageReveal"),

  // trivia
  streak: $("streak"),
  remaining: $("remaining"),
  category: $("category"),
  question: $("question"),
  answer: $("answer"),
  submitAnswer: $("submitAnswer"),
  triviaMsg: $("triviaMsg"),
  resetProgress: $("resetProgress"),

  // note
  noteStreak: $("noteStreak"),
  noteTarget: $("noteTarget"),
  noteStatus: $("noteStatus"),
  notePlay: $("notePlay"),
  noteReplay: $("noteReplay"),
  noteAnswer: $("noteAnswer"),
  noteSubmit: $("noteSubmit"),
  noteKeys: $("noteKeys"),
  noteMsg: $("noteMsg"),

  // repair
  repairStreak: $("repairStreak"),
  repairTarget: $("repairTarget"),
  repairTime: $("repairTime"),
  repairPrompt: $("repairPrompt"),
  repairInput: $("repairInput"),
  repairSubmit: $("repairSubmit"),
  repairNew: $("repairNew"),
  repairMsg: $("repairMsg"),

  // grid
  gridSize: $("gridSize"),
  gridBoard: $("gridBoard"),
  gridSteps: $("gridSteps"),
  gridStepsRaw: $("gridStepsRaw"),
  gridSubmit: $("gridSubmit"),
  gridNew: $("gridNew"),
  gridMsg: $("gridMsg"),

  // reveal
  poemText: $("poemText"),
  copyPoem: $("copyPoem"),

  // side
  objective: $("objective"),
  pTrivia: $("pTrivia"),
  pNote: $("pNote"),
  pRepair: $("pRepair"),
  pGrid: $("pGrid"),
};

const triviaCard = document.querySelector("#stageTrivia .qCard");

const STORAGE = {
  triviaRetired: "yn_trivia_retired_v7",
};

const OVERRIDE_CODE = "1324";

const POEM = [
  "Echoes of leaves still drift in your mind,",
  "Lingering high where the treetops aligned.",
  "In a new kind of height the answer now hides,",
  "Somewhere the stairway quietly guides.",
  "Beyond the floor where the busy feet roam,",
  "Every step feels closer to home.",
  "Deeper inside where the ceilings grow,",
  "Riddles begin to softly glow.",
  "Out of the noise and daily gloom,",
  "Onward you move to a quieter room.",
  "Mysteries wait for the ones who assume."
].join("\n");

const state = {
  stage: "trivia",

  trivia: { target: 15, streak: 0, retired: new Set(), current: null },

  note: { target: 5, streak: 0, current: null, played: false },

  repair: {
    target: 3,
    streak: 0,
    goodText: "",
    badText: "",
    deadlineMs: 0,
    timer: null
  },

  grid: {
    size: 11,
    steps: 20,
    round: null,
    selected: null
  }
};

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function fadeSwap(el, updateFn, ms=220){
  if(!el) { updateFn(); return; }
  el.classList.add("swapFade");
  el.classList.remove("isIn");
  el.classList.add("isOut");
  await sleep(ms);
  updateFn();
  requestAnimationFrame(() => {
    el.classList.remove("isOut");
    el.classList.add("isIn");
  });
}

/* =========================
   NORMALIZATION
========================= */

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

function normRepair(s){
  // preserve punctuation/case, tolerate whitespace differences
  return (s || "")
    .replace(/\r\n/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isOverride(input){
  return norm(input) === OVERRIDE_CODE;
}

function setMsg(el, text, kind){
  if(!el) return;
  el.textContent = text || "";
  el.className = "msg" + (kind ? (" " + kind) : "");
}

/* =========================
   TRIVIA TYPO TOLERANCE
========================= */

function levenshtein(a,b){
  a = norm(a); b = norm(b);
  const m = a.length, n = b.length;
  if(m === 0) return n;
  if(n === 0) return m;
  const dp = new Array(n+1);
  for(let j=0; j<=n; j++) dp[j] = j;
  for(let i=1; i<=m; i++){
    let prev = dp[0];
    dp[0] = i;
    for(let j=1; j<=n; j++){
      const temp = dp[j];
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j-1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

function typoOk(guess, truth){
  const g = norm(guess);
  const t = norm(truth);
  if(!g || !t) return false;
  if(g === t) return true;

  const dist = levenshtein(g, t);
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
   STAGE CONTROL
========================= */

const STAGE_ORDER = ["trivia","note","repair","grid","reveal"];

function stageIndex(stage){ return STAGE_ORDER.indexOf(stage); }

function setStage(stage){
  // cleanup timers if leaving repair
  if(state.stage === "repair" && stage !== "repair"){
    stopRepairTimer();
  }

  state.stage = stage;
  document.body.dataset.stage = stage;

  const idx = stageIndex(stage);

  const stepMap = [
    ["trivia", ui.stepTrivia],
    ["note", ui.stepNote],
    ["repair", ui.stepRepair],
    ["grid", ui.stepGrid],
    ["reveal", ui.stepReveal],
  ];

  for(const [name, el] of stepMap){
    if(!el) continue;
    const i = stageIndex(name);
    const isActive = i === idx;
    const isDone = i < idx;
    el.className = "step" + (isActive ? " active" : (isDone ? " done" : ""));
  }

  ui.stageTrivia.classList.toggle("show", stage === "trivia");
  ui.stageNote.classList.toggle("show", stage === "note");
  ui.stageRepair.classList.toggle("show", stage === "repair");
  ui.stageGrid.classList.toggle("show", stage === "grid");
  ui.stageReveal.classList.toggle("show", stage === "reveal");

  if(stage === "trivia"){
    ui.panelTitle.textContent = "Stage 1 — Trivia Gate";
    ui.panelDesc.innerHTML = "Get <b>15 correct in a row</b>.";
    ui.statusPill.textContent = "Locked";
    ui.objective.textContent = "15 correct in a row";
  } else if(stage === "note"){
    ui.panelTitle.textContent = "Stage 2 — Note Identification";
    ui.panelDesc.innerHTML = "Press Play, then identify the note (A–G). Get <b>5 correct in a row</b>.";
    ui.statusPill.textContent = "Partially unlocked";
    ui.objective.textContent = "5 correct in a row (notes)";
  } else if(stage === "repair"){
    ui.panelTitle.textContent = "Stage 3 — Sentence Repair";
    ui.panelDesc.innerHTML = "Fix 4 sentences containing <b>20 total errors</b>. <b>2:00</b> time limit. Get <b>3 passes in a row</b>.";
    ui.statusPill.textContent = "Partially unlocked";
    ui.objective.textContent = "3 passes in a row (sentence repair)";
  } else if(stage === "grid"){
    ui.panelTitle.textContent = "Stage 4 — Grid Navigation";
    ui.panelDesc.innerHTML = "Follow 20 random steps from the blue dot. Select the final intersection. Target is not marked.";
    ui.statusPill.textContent = "Partially unlocked";
    ui.objective.textContent = "Solve the grid navigation";
  } else {
    ui.panelTitle.textContent = "Stage 5 — Reveal";
    ui.panelDesc.textContent = "";
    ui.statusPill.textContent = "Unlocked";
    ui.objective.textContent = "";
  }

  renderSide();

  // enter-stage actions
  if(stage === "note"){
    initNoteStage();
  } else if(stage === "repair"){
    startRepairRound();
  } else if(stage === "grid"){
    newGridRound();
  } else if(stage === "reveal"){
    ui.poemText.textContent = POEM;
  }
}

function renderSide(){
  ui.pTrivia.textContent = `${state.trivia.streak} / ${state.trivia.target}`;
  ui.pNote.textContent = `${state.note.streak} / ${state.note.target}`;
  ui.pRepair.textContent = `${state.repair.streak} / ${state.repair.target}`;
  ui.pGrid.textContent = state.stage === "reveal" ? "Complete" : "—";
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
    setMsg(ui.triviaMsg, "Reload the page to reset remaining.", "warn");
    return;
  }

  const q = pool[Math.floor(Math.random() * pool.length)];
  state.trivia.current = q;

  fadeSwap(triviaCard, () => {
    ui.category.textContent = q.cat;
    ui.question.textContent = q.q;
    ui.answer.value = "";
    setMsg(ui.triviaMsg, "", "");
    ui.remaining.textContent = String(triviaRemaining());
  }, 180);

  setTimeout(() => ui.answer.focus(), 0);
}

function bypassToReveal(){
  setStage("reveal");
  ui.poemText.textContent = POEM;
  ui.statusPill.textContent = "Unlocked";
}

function checkTriviaAnswer(){
  const rawGuess = ui.answer.value || "";
  if(isOverride(rawGuess)){
    bypassToReveal();
    return;
  }

  const q = state.trivia.current;
  if(!q) return;

  const guess = norm(rawGuess);
  if(!guess){
    setMsg(ui.triviaMsg, "Enter an answer.", "bad");
    return;
  }

  // retire on any attempt (session-only)
  state.trivia.retired.add(q.id);

  const truths = [q.a, ...(q.alts || [])];
  const ok = matchesAny(rawGuess, truths);

  if(ok){
    state.trivia.streak += 1;
    ui.streak.textContent = String(state.trivia.streak);
    ui.remaining.textContent = String(triviaRemaining());
    setMsg(ui.triviaMsg, "Correct.", "good");
    renderSide();

    if(state.trivia.streak >= state.trivia.target){
      setMsg(ui.triviaMsg, "Gate cleared.", "good");
      setTimeout(() => {
        setStage("note");
      }, 280);
      return;
    }

    setTimeout(pickTrivia, 520);
    return;
  }

  state.trivia.streak = 0;
  ui.streak.textContent = "0";
  ui.remaining.textContent = String(triviaRemaining());
  setMsg(ui.triviaMsg, `Incorrect. Answer: ${q.a}`, "bad");
  renderSide();

  setTimeout(pickTrivia, 900);
}

/* =========================
   NOTE IDENTIFICATION (WebAudio)
========================= */

const NOTES = ["A","B","C","D","E","F","G"];
const NOTE_FREQ = {
  C: 261.63,
  D: 293.66,
  E: 329.63,
  F: 349.23,
  G: 392.00,
  A: 440.00,
  B: 493.88
};

let audioCtx = null;

function ensureAudioContext(){
  if(audioCtx) return audioCtx;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

async function resumeAudioIfNeeded(){
  const ctx = ensureAudioContext();
  if(ctx.state === "suspended") await ctx.resume();
}

function playNote(letter, durationSec = 0.9){
  const ctx = ensureAudioContext();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = "sine";
  osc.frequency.value = NOTE_FREQ[letter] || 440;

  filter.type = "lowpass";
  filter.frequency.value = 1800;

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
  gain.gain.linearRampToValueAtTime(0.13, now + 0.14);
  gain.gain.setValueAtTime(0.13, now + durationSec - 0.06);
  gain.gain.linearRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain).connect(filter).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec);
}

function newNoteRound(){
  state.note.current = NOTES[Math.floor(Math.random() * NOTES.length)];
  state.note.played = false;
  ui.noteStatus.textContent = "Ready";
  ui.noteReplay.disabled = true;
  ui.noteAnswer.value = "";
  setMsg(ui.noteMsg, "", "");
  setTimeout(() => ui.noteAnswer.focus(), 0);
}

function initNoteStage(){
  ui.noteTarget.textContent = String(state.note.target);
  ui.noteStreak.textContent = String(state.note.streak);
  ui.noteStatus.textContent = "Ready";
  ui.noteReplay.disabled = true;
  newNoteRound();
}

async function onNotePlay(isReplay=false){
  await resumeAudioIfNeeded();
  if(!state.note.current) newNoteRound();
  playNote(state.note.current);
  state.note.played = true;
  ui.noteStatus.textContent = isReplay ? "Replayed" : "Played";
  ui.noteReplay.disabled = false;
}

function submitNoteAnswer(letter){
  if(!state.note.current){
    newNoteRound();
    return;
  }

  if(!state.note.played){
    setMsg(ui.noteMsg, "Play the note first.", "warn");
    return;
  }

  const ok = letter === state.note.current;

  if(ok){
    state.note.streak += 1;
    ui.noteStreak.textContent = String(state.note.streak);
    setMsg(ui.noteMsg, "Correct.", "good");
    renderSide();

    if(state.note.streak >= state.note.target){
      setMsg(ui.noteMsg, "Gate cleared.", "good");
      setTimeout(() => setStage("repair"), 300);
      return;
    }

    newNoteRound();
    return;
  }

  state.note.streak = 0;
  ui.noteStreak.textContent = "0";
  setMsg(ui.noteMsg, "Incorrect. Streak reset.", "bad");
  renderSide();
  newNoteRound();
}

function submitNoteFromInput(){
  const raw = ui.noteAnswer.value || "";
  if(isOverride(raw)){
    bypassToReveal();
    return;
  }

  const t = raw.trim().toUpperCase();
  const letter = t[0] || "";
  if(!NOTES.includes(letter)){
    setMsg(ui.noteMsg, "Enter A–G.", "bad");
    return;
  }
  submitNoteAnswer(letter);
}

/* =========================
   SENTENCE REPAIR (20 errors total)
========================= */

const CLEAN_SENTENCES = [
  "The team reviewed the proposal and approved the final timeline.",
  "Please submit the updated report before the end of the day.",
  "We will prioritize reliability and reduce operational risk.",
  "The customer requested a detailed breakdown of the pricing model.",
  "After the incident, we published a postmortem and action items.",
  "Our approach improves accuracy without increasing latency.",
  "The product roadmap aligns with the quarterly objectives.",
  "She explained the results clearly and answered every question.",
  "The system logs indicated a transient network failure.",
  "They agreed to iterate quickly and validate assumptions with data.",
  "The meeting ended early because all decisions were finalized.",
  "We should confirm the requirements with stakeholders this week.",
  "The analyst documented the methodology and the key limitations.",
  "A consistent process prevents avoidable defects and rework.",
  "The vendor provided a replacement and extended the warranty.",
  "He reviewed the contract carefully and flagged the risky clauses.",
  "We can mitigate the issue by adding a safety check in the pipeline.",
  "The model performed well on the benchmark and generalization tests.",
  "The committee recommended a phased rollout to control risk.",
  "They updated the documentation to reflect the latest changes."
];

const TYPO_MAP = [
  ["the", "teh"],
  ["and", "adn"],
  ["with", "wiht"],
  ["before", "befor"],
  ["because", "becuase"],
  ["should", "shoudl"],
  ["their", "thier"],
  ["consistent", "consistant"],
  ["performance", "perfomance"],
  ["reliability", "reliablity"],
  ["documentation", "documantation"],
  ["requirements", "requrements"],
];

function randInt(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr){
  return arr[randInt(0, arr.length - 1)];
}
function escapeRegExp(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function findWordMatches(sentence, word){
  const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
  const matches = [];
  let m;
  while((m = re.exec(sentence)) !== null){
    matches.push({ index: m.index, length: m[0].length });
  }
  return matches;
}
function removeOnePunctuationCandidates(s){
  const punct = [",", ".", ";", ":", "!", "?"];
  const out = [];
  for(let i=0; i<s.length; i++){
    if(punct.includes(s[i])) out.push(i);
  }
  return out;
}
function flipCaseAt(s, i){
  const ch = s[i];
  const flipped = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
  return s.slice(0,i) + flipped + s.slice(i+1);
}
function insertDoubleSpaceAt(s, i){
  if(s[i] !== " ") return null;
  if(s[i+1] === " ") return null;
  return s.slice(0,i) + "  " + s.slice(i+1);
}
function removeSpaceAfterPunct(s, i){
  if(!s[i]) return null;
  if(s[i+1] !== " ") return null;
  return s.slice(0, i+1) + s.slice(i+2);
}
function swapTwoAdjacentLetters(s, i){
  if(i < 0 || i >= s.length - 1) return null;
  const a = s[i], b = s[i+1];
  if(!/[a-zA-Z]/.test(a) || !/[a-zA-Z]/.test(b)) return null;
  return s.slice(0,i) + b + a + s.slice(i+2);
}

function generateBadSentence(good, targetErrors=5){
  let bad = good;
  let applied = 0;
  let guard = 0;

  while(applied < targetErrors && guard++ < 500){
    const op = pick(["typo","punct","caps","space2","nospace","swap"]);
    const before = bad;

    if(op === "typo"){
      const [correct, wrong] = pick(TYPO_MAP);
      const matches = findWordMatches(bad, correct);
      if(matches.length){
        const m = pick(matches);
        bad = bad.slice(0, m.index) + wrong + bad.slice(m.index + m.length);
      }
    } else if(op === "punct"){
      const candidates = removeOnePunctuationCandidates(bad);
      if(candidates.length){
        const idx = pick(candidates);
        bad = bad.slice(0, idx) + bad.slice(idx + 1);
      }
    } else if(op === "caps"){
      const letters = [];
      for(let i=0; i<bad.length; i++) if(/[a-zA-Z]/.test(bad[i])) letters.push(i);
      if(letters.length){
        const idx = pick(letters);
        bad = flipCaseAt(bad, idx);
      }
    } else if(op === "space2"){
      const spaces = [];
      for(let i=0; i<bad.length; i++) if(bad[i] === " ") spaces.push(i);
      if(spaces.length){
        const idx = pick(spaces);
        const maybe = insertDoubleSpaceAt(bad, idx);
        if(maybe) bad = maybe;
      }
    } else if(op === "nospace"){
      const candidates = [];
      for(let i=0; i<bad.length - 1; i++){
        if(/[.,;:!?]/.test(bad[i]) && bad[i+1] === " ") candidates.push(i);
      }
      if(candidates.length){
        const idx = pick(candidates);
        const maybe = removeSpaceAfterPunct(bad, idx);
        if(maybe) bad = maybe;
      }
    } else if(op === "swap"){
      const idx = randInt(0, Math.max(0, bad.length - 2));
      const maybe = swapTwoAdjacentLetters(bad, idx);
      if(maybe) bad = maybe;
    }

    if(bad !== before) applied++;
  }

  if(applied !== targetErrors){
    throw new Error("Failed to generate required errors.");
  }

  return { good, bad };
}

function buildSentenceRepairRound(){
  const picked = [];
  let guard = 0;

  while(picked.length < 4 && guard++ < 400){
    const s = pick(CLEAN_SENTENCES);
    if(picked.some(x => x.good === s)) continue;
    try{
      picked.push(generateBadSentence(s, 5));
    } catch {}
  }

  if(picked.length < 4){
    // fallback: if bank too small/unstable
    throw new Error("Could not assemble 4 sentences. Expand CLEAN_SENTENCES.");
  }

  const goodText = picked.map(x => x.good).join("\n");
  const badText = picked.map(x => x.bad).join("\n");

  return { goodText, badText };
}

function formatMMSS(totalSeconds){
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s/60)).padStart(2,"0");
  const ss = String(s%60).padStart(2,"0");
  return `${mm}:${ss}`;
}

function startRepairRound(){
  stopRepairTimer();

  const round = buildSentenceRepairRound();
  state.repair.goodText = round.goodText;
  state.repair.badText = round.badText;

  fadeSwap(ui.repairPrompt, () => {
    ui.repairPrompt.textContent = state.repair.badText;
  }, 160);

  ui.repairInput.value = "";
  setMsg(ui.repairMsg, "Timer started. Submit before it expires.", "warn");

  state.repair.deadlineMs = Date.now() + 120_000;
  ui.repairTime.textContent = "02:00";

  state.repair.timer = setInterval(tickRepair, 200);
  tickRepair();

  setTimeout(() => ui.repairInput.focus(), 0);
}

function tickRepair(){
  const leftMs = state.repair.deadlineMs - Date.now();
  const leftSec = Math.ceil(leftMs / 1000);
  ui.repairTime.textContent = formatMMSS(leftSec);
  if(leftMs <= 0){
    submitRepair(true);
  }
}

function stopRepairTimer(){
  if(state.repair.timer){
    clearInterval(state.repair.timer);
    state.repair.timer = null;
  }
}

function submitRepair(isTimeout=false){
  if(!state.repair.timer) return;
  stopRepairTimer();

  const raw = ui.repairInput.value || "";
  if(isOverride(raw)){
    bypassToReveal();
    return;
  }

  const user = normRepair(raw);
  const good = normRepair(state.repair.goodText);

  const pass = !isTimeout && user === good;

  if(pass){
    state.repair.streak += 1;
    ui.repairStreak.textContent = String(state.repair.streak);
    setMsg(ui.repairMsg, "Pass.", "good");
    renderSide();

    if(state.repair.streak >= state.repair.target){
      setMsg(ui.repairMsg, "Gate cleared.", "good");
      setTimeout(() => setStage("grid"), 350);
      return;
    }

    setTimeout(startRepairRound, 600);
    return;
  }

  state.repair.streak = 0;
  ui.repairStreak.textContent = "0";
  renderSide();

  if(isTimeout){
    setMsg(ui.repairMsg, "Time expired. Streak reset.", "bad");
  } else {
    setMsg(ui.repairMsg, "Incorrect. Streak reset.", "bad");
  }

  setTimeout(startRepairRound, 850);
}

/* =========================
   GRID NAV
========================= */

function genGridRound(size=11, steps=20){
  const dirs = ["U","D","L","R"];

  let startX = randInt(0, size-1);
  let startY = randInt(0, size-1);

  for(let attempt=0; attempt<200; attempt++){
    let x = startX;
    let y = startY;
    const seq = [];

    for(let i=0; i<steps; i++){
      // choose direction that stays in bounds
      let chosen = null;
      for(let g=0; g<20 && !chosen; g++){
        const d = pick(dirs);
        const nx = x + (d === "R") - (d === "L");
        const ny = y + (d === "D") - (d === "U");
        if(nx >= 0 && nx < size && ny >= 0 && ny < size){
          chosen = d;
          x = nx; y = ny;
          seq.push(d);
        }
      }
      if(!chosen){
        // restart attempt
        break;
      }
    }

    const target = { x, y };
    const start = { x: startX, y: startY };

    // enforce "target intersection doesn't have anything on it" => not the start dot
    if(target.x === start.x && target.y === start.y){
      startX = randInt(0, size-1);
      startY = randInt(0, size-1);
      continue;
    }

    if(seq.length === steps){
      return { size, steps, start, seq, target };
    }
  }

  // fallback (should never happen)
  return { size, steps, start: {x:0,y:0}, seq: Array(steps).fill("R"), target: {x:steps % size, y:0} };
}

function dirArrow(d){
  if(d === "U") return "↑";
  if(d === "D") return "↓";
  if(d === "L") return "←";
  return "→";
}

function renderGrid(){
  const r = state.grid.round;
  if(!r) return;

  ui.gridSize.textContent = `${r.size} × ${r.size}`;
  ui.gridBoard.style.setProperty("--gridN", String(r.size));

  ui.gridSteps.textContent = r.seq.map(dirArrow).join(" ");
  ui.gridStepsRaw.textContent = r.seq.join(" ");

  ui.gridBoard.innerHTML = "";
  state.grid.selected = null;

  for(let y=0; y<r.size; y++){
    for(let x=0; x<r.size; x++){
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);

      if(x === r.start.x && y === r.start.y){
        cell.classList.add("start");
        const dot = document.createElement("div");
        dot.className = "dotStart";
        cell.appendChild(dot);
      }

      cell.addEventListener("click", () => selectGridCell(x,y));
      ui.gridBoard.appendChild(cell);
    }
  }

  setMsg(ui.gridMsg, "Select a cell, then submit.", "warn");
}

function selectGridCell(x,y){
  state.grid.selected = { x, y };

  const cells = ui.gridBoard.querySelectorAll(".cell");
  cells.forEach(c => c.classList.remove("selected"));

  const r = state.grid.round;
  const idx = y * r.size + x;
  const el = ui.gridBoard.children[idx];
  if(el) el.classList.add("selected");
}

function newGridRound(){
  state.grid.round = genGridRound(state.grid.size, state.grid.steps);
  renderGrid();
}

function submitGrid(){
  const r = state.grid.round;
  if(!r) return;

  if(!state.grid.selected){
    setMsg(ui.gridMsg, "Pick a cell first.", "bad");
    return;
  }

  const ok = state.grid.selected.x === r.target.x && state.grid.selected.y === r.target.y;

  if(ok){
    setMsg(ui.gridMsg, "Correct. Gate cleared.", "good");
    ui.pGrid.textContent = "Complete";
    setTimeout(() => setStage("reveal"), 450);
    return;
  }

  setMsg(ui.gridMsg, "Incorrect. New grid generated.", "bad");
  setTimeout(newGridRound, 650);
}

/* =========================
   RESET / INIT
========================= */

function resetAllProgress(){
  if(!confirm("This will reset progress for this browser. Continue?")) return;

  localStorage.removeItem(STORAGE.triviaRetired);

  state.trivia.retired = new Set();
  state.trivia.streak = 0;
  state.trivia.current = null;

  state.note.streak = 0;
  state.note.current = null;
  state.note.played = false;

  state.repair.streak = 0;
  state.repair.goodText = "";
  state.repair.badText = "";
  stopRepairTimer();

  state.grid.round = null;
  state.grid.selected = null;

  ui.streak.textContent = "0";
  ui.noteStreak.textContent = "0";
  ui.repairStreak.textContent = "0";

  setMsg(ui.triviaMsg, "Progress reset.", "warn");
  setMsg(ui.noteMsg, "", "");
  setMsg(ui.repairMsg, "", "");
  setMsg(ui.gridMsg, "", "");

  setStage("trivia");
  pickTrivia();
  renderSide();
}

function init(){
  try{
    if(!window.TRIVIA_BANK || !Array.isArray(window.TRIVIA_BANK) || window.TRIVIA_BANK.length < 200){
      ui.question.textContent = "Trivia bank missing or invalid.";
      setMsg(ui.triviaMsg, "Ensure trivia_bank.js is loaded before app.js.", "bad");
      return;
    }

    // Reset session progress on reload (matches your current behavior)
    localStorage.removeItem(STORAGE.triviaRetired);

    state.trivia.retired = new Set();
    state.trivia.streak = 0;
    ui.streak.textContent = "0";

    state.note.streak = 0;
    ui.noteStreak.textContent = "0";
    ui.noteTarget.textContent = String(state.note.target);

    state.repair.streak = 0;
    ui.repairStreak.textContent = "0";
    ui.repairTarget.textContent = String(state.repair.target);
    ui.repairTime.textContent = "02:00";

    ui.remaining.textContent = String(triviaRemaining());

    triviaCard?.classList.add("swapFade","isIn");

    setStage("trivia");
    pickTrivia();
    renderSide();
  } catch (e){
    console.error(e);
    const banner = document.createElement("div");
    banner.style.position = "fixed";
    banner.style.left = "12px";
    banner.style.right = "12px";
    banner.style.bottom = "12px";
    banner.style.zIndex = "9999";
    banner.style.padding = "12px 14px";
    banner.style.borderRadius = "12px";
    banner.style.background = "rgba(200,40,80,0.18)";
    banner.style.border = "1px solid rgba(200,40,80,0.35)";
    banner.style.color = "#fff";
    banner.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    banner.textContent = "App error. Open DevTools → Console to see the stack trace.";
    document.body.appendChild(banner);
  }
}

/* =========================
   EVENTS
========================= */

// Trivia
ui.submitAnswer.addEventListener("click", checkTriviaAnswer);
ui.answer.addEventListener("keydown", (e) => { if(e.key === "Enter") checkTriviaAnswer(); });
ui.resetProgress.addEventListener("click", resetAllProgress);

// Note
ui.notePlay.addEventListener("click", () => onNotePlay(false));
ui.noteReplay.addEventListener("click", () => onNotePlay(true));
ui.noteSubmit.addEventListener("click", submitNoteFromInput);
ui.noteAnswer.addEventListener("keydown", (e) => { if(e.key === "Enter") submitNoteFromInput(); });

ui.noteKeys.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-note]");
  if(!btn) return;
  const n = String(btn.dataset.note || "").toUpperCase();
  if(NOTES.includes(n)) submitNoteAnswer(n);
});

// Keyboard shortcuts (Note stage only)
window.addEventListener("keydown", (e) => {
  if(state.stage !== "note") return;

  // don't hijack when user is typing in an input/textarea unless it's the note input
  const tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : "";
  const activeIsNoteInput = document.activeElement === ui.noteAnswer;
  if((tag === "textarea" || tag === "input") && !activeIsNoteInput) return;

  const k = String(e.key || "").toUpperCase();
  if(NOTES.includes(k)){
    submitNoteAnswer(k);
  }
});

// Repair
ui.repairSubmit.addEventListener("click", () => submitRepair(false));
ui.repairInput.addEventListener("keydown", (e) => {
  // Ctrl/Cmd+Enter submits
  if((e.ctrlKey || e.metaKey) && e.key === "Enter"){
    submitRepair(false);
  }
});
ui.repairNew.addEventListener("click", () => {
  state.repair.streak = 0;
  ui.repairStreak.textContent = "0";
  renderSide();
  setMsg(ui.repairMsg, "New round generated. Streak reset.", "warn");
  startRepairRound();
});

// Grid
ui.gridSubmit.addEventListener("click", submitGrid);
ui.gridNew.addEventListener("click", newGridRound);

// Reveal
ui.copyPoem.addEventListener("click", async () => {
  try{ await navigator.clipboard.writeText(POEM); } catch {}
});

window.addEventListener("load", init);
