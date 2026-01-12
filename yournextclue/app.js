/* app.js — YourNextClue (GitHub Pages friendly, no persistence of progress)
   - Repair: 2:30, accept <= 5 char-level mistakes (edit distance on canonical text)
   - Grid: 15 directions visible for 30s, then hidden; user must click full path + submit
   - Music Notes: accepts A–G OR backdoor "1324" (single submit or sequence across submits)
   - Tabs: switch to current/done stages only; no Reveal tab
   - Reload always resets (handles BFCache)
*/

const $ = (id) => document.getElementById(id);

const ui = {
  // Top tabs
  stepTrivia: $("stepTrivia"),
  stepNote: $("stepNote"),
  stepRepair: $("stepRepair"),
  stepGrid: $("stepGrid"),
  themeToggle: $("themeToggle"),

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

  // Note
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
  repairAnswer: $("repairAnswer"),
  submitRepair: $("submitRepair"),
  repairMsg: $("repairMsg"),

  // Grid
  gridStreak: $("gridStreak"),
  gridTarget: $("gridTarget"),
  gridTimer: $("gridTimer"),
  gridSteps: $("gridSteps"),
  gridBoard: $("gridBoard"),
  gridMsg: $("gridMsg"),
  resetGrid: $("resetGrid"),
  submitGrid: $("submitGrid"),

  // Reveal
  poemText: $("poemText"),
  revealMsg: $("revealMsg"),
  fragA: $("fragA"),
  fragB: $("fragB"),
  decryptPoemBtn: $("decryptPoemBtn"),
};

function assertUI() {
  const required = Object.entries(ui).filter(([, v]) => v == null).map(([k]) => k);
  if (required.length) throw new Error(`Missing DOM IDs: ${required.join(", ")}`);
}

function setMsg(el, text, kind) {
  el.textContent = text || "";
  el.className = "msg" + (kind ? ` ${kind}` : "");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function norm(s) {
  return (s || "")
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function levenshteinRaw(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function typoOk(guess, truth) {
  const g = norm(guess);
  const t = norm(truth);
  if (!g || !t) return false;
  if (g === t) return true;
  const dist = levenshteinRaw(g, t);
  const L = Math.max(g.length, t.length);
  if (L <= 4) return dist <= 1;
  if (L <= 7) return dist <= 1;
  if (L <= 12) return dist <= 2;
  return dist <= 3;
}

function matchesAny(guess, truths) {
  const g = norm(guess);
  if (!g) return false;
  for (const t of truths) {
    if (!t) continue;
    const tn = norm(t);
    if (g === tn) return true;
    if (g.length >= 3 && tn.length >= 3 && (tn.includes(g) || g.includes(tn))) return true;
    if (typoOk(g, tn)) return true;
  }
  return false;
}

/* =========================
   APP STATE / FLOW
========================= */
const TESTS = ["trivia", "note", "repair", "grid"]; // reveal is final

const state = {
  stage: "trivia",
  order: [],
  idx: 0,

  trivia: { target: 15, streak: 0, retired: new Set(), current: null },
  note:   { target: 5,  streak: 0, current: null, backdoor: "" },
  repair: { target: 3,  streak: 0, current: null, deadlineTs: 0, timerId: null },
  grid:   { target: 1,  streak: 0, model: null },

  poem: { json: null }
};

function expectedStageKey() {
  return state.order[state.idx] || null;
}

function isUnlocked(stageKey) {
  const pos = state.order.indexOf(stageKey);
  if (pos === -1) return false;
  return pos <= state.idx; // done OR current
}

function setStage(stageKey) {
  state.stage = stageKey;
  document.body.dataset.stage = stageKey;

  // Show correct stage
  const stageEls = {
    trivia: ui.stageTrivia,
    note: ui.stageNote,
    repair: ui.stageRepair,
    grid: ui.stageGrid,
    reveal: ui.stageReveal
  };
  Object.values(stageEls).forEach(el => el.classList.remove("show"));
  stageEls[stageKey].classList.add("show");

  // Tabs state
  const stepEls = {
    trivia: ui.stepTrivia,
    note: ui.stepNote,
    repair: ui.stepRepair,
    grid: ui.stepGrid
  };

  Object.entries(stepEls).forEach(([key, el]) => {
    el.className = "step";
    const pos = state.order.indexOf(key);
    if (pos !== -1 && pos < state.idx) el.classList.add("done");
    if (key === stageKey) el.classList.add("active");

    // lock styling for future stages
    if (pos !== -1 && pos > state.idx) el.classList.add("locked");
    el.disabled = (pos !== -1 && pos > state.idx);
  });

  // Panel copy
  if (stageKey === "trivia") {
    ui.panelTitle.textContent = "Test — Trivia";
    ui.panelDesc.innerHTML = `Get <b>${state.trivia.target} correct in a row</b>. Miss resets to 0.`;
    ui.statusPill.textContent = "In progress";
    ui.objective.textContent = `${state.trivia.target} in a row`;
  } else if (stageKey === "note") {
    ui.panelTitle.textContent = "Test — Music Notes";
    ui.panelDesc.innerHTML = `Listen to a note and type the letter (<b>A–G</b>). Get <b>${state.note.target} in a row</b>. Submit is mandatory.`;
    ui.statusPill.textContent = "In progress";
    ui.objective.textContent = `${state.note.target} in a row`;
  } else if (stageKey === "repair") {
    ui.panelTitle.textContent = "Test — Sentence Repair";
    ui.panelDesc.innerHTML = `Fix the text. <b>2:30</b> time limit. Get <b>${state.repair.target} wins in a row</b>. Tolerance: ≤ <b>5</b> character errors.`;
    ui.statusPill.textContent = "In progress";
    ui.objective.textContent = `${state.repair.target} wins in a row`;
  } else if (stageKey === "grid") {
    ui.panelTitle.textContent = "Test — Grid Navigation";
    ui.panelDesc.innerHTML = `Memorize <b>15</b> directions (visible for <b>30 seconds</b>), then click the full path and <b>Submit</b>.`;
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

function renderSide() {
  ui.pTrivia.textContent = `${state.trivia.streak} / ${state.trivia.target}`;
  ui.pNote.textContent   = `${state.note.streak} / ${state.note.target}`;
  ui.pRepair.textContent = `${state.repair.streak} / ${state.repair.target}`;
  ui.pGrid.textContent   = `${state.grid.streak} / ${state.grid.target}`;
}

function markCleared(stageKey) {
  // Only advance if they cleared the EXPECTED stage in the randomized order.
  const expected = expectedStageKey();
  if (stageKey !== expected) {
    // already-done or out-of-order stage; do not advance
    return;
  }

  state.idx += 1;
  if (state.idx >= state.order.length) {
    setStage("reveal");
    setMsg(ui.revealMsg, "Enter fragmentA + fragmentB, then decrypt.", "warn");
    return;
  }

  const next = expectedStageKey();
  setStage(next);

  if (next === "trivia") pickTrivia();
  if (next === "note") newNoteRound(false);
  if (next === "repair") newRepairRound(true);
  if (next === "grid") newGridRound(true);
}

/* =========================
   TRIVIA
========================= */
function triviaRemaining() {
  return window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id)).length;
}

function pickTrivia() {
  const pool = window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id));
  if (pool.length === 0) {
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

function checkTriviaAnswer() {
  const q = state.trivia.current;
  if (!q) return;

  const rawGuess = ui.answer.value || "";
  const guess = norm(rawGuess);
  if (!guess) { setMsg(ui.triviaMsg, "Enter an answer.", "bad"); return; }

  // retire on any attempt
  state.trivia.retired.add(q.id);
  ui.remaining.textContent = String(triviaRemaining());

  const truths = [q.a, ...(q.alts || [])];
  const ok = matchesAny(rawGuess, truths);

  if (ok) {
    state.trivia.streak += 1;
    ui.streak.textContent = String(state.trivia.streak);
    renderSide();
    setMsg(ui.triviaMsg, "Correct.", "good");

    if (state.trivia.streak >= state.trivia.target) {
      setMsg(ui.triviaMsg, "Test cleared.", "good");
      setTimeout(() => markCleared("trivia"), 250);
      return;
    }
    setTimeout(pickTrivia, 250);
    return;
  }

  state.trivia.streak = 0;
  ui.streak.textContent = "0";
  renderSide();
  setMsg(ui.triviaMsg, `Incorrect. Answer: ${q.a}`, "bad");
  setTimeout(pickTrivia, 450);
}

/* =========================
   MUSIC NOTES (A–G) + BACKDOOR 1324
========================= */
const NOTE_BANK = [
  // fixed, single octave (no variance)
  { n: "C", f: 261.63 },
  { n: "D", f: 293.66 },
  { n: "E", f: 329.63 },
  { n: "F", f: 349.23 },
  { n: "G", f: 392.00 },
  { n: "A", f: 440.00 },
  { n: "B", f: 493.88 },
];

let audio = { ctx: null, master: null };

function ensureAudio() {
  if (audio.ctx) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  audio.ctx = new Ctx();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.12;
  audio.master.connect(audio.ctx.destination);
}

function playTone(freq, ms = 750) {
  ensureAudio();
  if (audio.ctx.state === "suspended") audio.ctx.resume();

  const now = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = freq;

  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(1.0, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);

  osc.connect(g);
  g.connect(audio.master);

  osc.start(now);
  osc.stop(now + ms / 1000 + 0.03);
}

function newNoteRound() {
  state.note.current = NOTE_BANK[Math.floor(Math.random() * NOTE_BANK.length)];
  ui.noteAnswer.value = "";
  setMsg(ui.noteMsg, "Click Play, then type A–G and press Submit.", "warn");
  setTimeout(() => ui.noteAnswer.focus(), 0);
}

function noteBackdoorStep(raw) {
  // Accept either a full "1324" submit or 1->3->2->4 across submits.
  const onlyDigits = (raw || "").replace(/\D/g, "");
  if (!onlyDigits) return false;

  if (onlyDigits.includes("1324") || (raw || "").trim() === "1324") {
    state.note.backdoor = "1324";
    return true;
  }

  // accumulate digits in order
  for (const ch of onlyDigits) {
    const next = state.note.backdoor + ch;
    if ("1324".startsWith(next)) {
      state.note.backdoor = next;
    } else if (ch === "1") {
      // restart if they re-enter 1
      state.note.backdoor = "1";
    } else {
      state.note.backdoor = "";
    }
  }
  return state.note.backdoor === "1324";
}

function checkNoteAnswer() {
  const raw = (ui.noteAnswer.value || "").trim();

  // backdoor
  if (noteBackdoorStep(raw)) {
    state.note.streak = state.note.target;
    ui.noteStreak.textContent = String(state.note.streak);
    renderSide();
    setMsg(ui.noteMsg, "Accepted.", "good");
    markCleared("note");
    return;
  }

  if (!state.note.current) {
    setMsg(ui.noteMsg, "No note loaded. Click Play.", "bad");
    return;
  }

  const letter = raw.toUpperCase().replace(/[^A-G]/g, "").slice(0, 1);
  if (!letter) {
    setMsg(ui.noteMsg, "Enter a single letter A–G (or use 1324 backdoor).", "bad");
    return;
  }

  const ok = (letter === state.note.current.n);
  if (ok) {
    state.note.streak += 1;
    ui.noteStreak.textContent = String(state.note.streak);
    renderSide();
    setMsg(ui.noteMsg, "Correct.", "good");

    if (state.note.streak >= state.note.target) {
      setMsg(ui.noteMsg, "Test cleared.", "good");
      setTimeout(() => markCleared("note"), 200);
      return;
    }

    // next note
    setTimeout(() => newNoteRound(), 250);
    return;
  }

  state.note.streak = 0;
  ui.noteStreak.textContent = "0";
  renderSide();
  setMsg(ui.noteMsg, "Incorrect.", "bad");
  setTimeout(() => newNoteRound(), 250);
}

/* =========================
   SENTENCE REPAIR (2:30) — allow <= 5 wrong chars
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

function canonRepair(s) {
  // Canonicalize only the “petty” stuff, keep numbering/line breaks meaningful.
  return (s || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stopRepairTimer() {
  if (state.repair.timerId) {
    clearInterval(state.repair.timerId);
    state.repair.timerId = null;
  }
}

function startRepairTimer() {
  stopRepairTimer();
  const tick = () => {
    const left = Math.max(0, state.repair.deadlineTs - Date.now());
    const s = Math.ceil(left / 1000);
    const mm = String(Math.floor(s / 60)).padStart(1, "0");
    const ss = String(s % 60).padStart(2, "0");
    ui.repairTimer.textContent = `${mm}:${ss}`;

    if (left <= 0) {
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

function newRepairRound(withMsg = false) {
  stopRepairTimer();
  const item = REPAIR_BANK[Math.floor(Math.random() * REPAIR_BANK.length)];
  state.repair.current = item;

  ui.repairPrompt.textContent = item.broken;
  ui.repairAnswer.value = "";

  if (withMsg) {
    setMsg(ui.repairMsg, "Format required: 4 lines starting with 1) 2) 3) 4).", "warn");
  } else {
    setMsg(ui.repairMsg, "", "");
  }

  state.repair.deadlineTs = Date.now() + 150 * 1000; // 2:30
  startRepairTimer();
  setTimeout(() => ui.repairAnswer.focus(), 0);
}

function checkRepairAnswer() {
  if (!state.repair.current) { setMsg(ui.repairMsg, "No prompt loaded.", "bad"); return; }

  const left = state.repair.deadlineTs - Date.now();
  if (left <= 0) { setMsg(ui.repairMsg, "Time expired.", "bad"); return; }

  const guess = canonRepair(ui.repairAnswer.value || "");
  if (!guess) { setMsg(ui.repairMsg, "Paste your corrected text.", "bad"); return; }

  const truth = canonRepair(state.repair.current.fixed);

  // Character-level tolerance via edit distance <= 5
  const dist = levenshteinRaw(guess, truth);
  const ok = dist <= 5;

  if (ok) {
    stopRepairTimer();
    state.repair.streak += 1;
    ui.repairStreak.textContent = String(state.repair.streak);
    renderSide();
    setMsg(ui.repairMsg, `Accepted (distance ${dist} ≤ 5).`, "good");

    if (state.repair.streak >= state.repair.target) {
      setMsg(ui.repairMsg, "Test cleared.", "good");
      setTimeout(() => markCleared("repair"), 200);
      return;
    }
    setTimeout(() => newRepairRound(true), 250);
    return;
  }

  stopRepairTimer();
  state.repair.streak = 0;
  ui.repairStreak.textContent = "0";
  renderSide();
  setMsg(ui.repairMsg, `Incorrect (distance ${dist} > 5). Streak reset.`, "bad");
  setTimeout(() => newRepairRound(true), 450);
}

/* =========================
   GRID NAV — 15 directions, hide after 30s, click full path + submit
   Backdoor: relative to start, click these in order then Submit:
     1) +3 right, -2 up
     2) then down 2
     3) then right 4
========================= */
function makeGridModel() {
  const size = 9;      // 9x9
  const stepsN = 15;   // 15 directions
  const start = {
    x: 2 + Math.floor(Math.random() * (size - 4)),
    y: 2 + Math.floor(Math.random() * (size - 4)),
  };

  const steps = [];
  let x = start.x, y = start.y;

  for (let i = 0; i < stepsN; i++) {
    const options = [];
    if (y > 0) options.push("U");
    if (y < size - 1) options.push("D");
    if (x > 0) options.push("L");
    if (x < size - 1) options.push("R");

    const prev = steps[i - 1];
    const filtered = options.filter(d => {
      if (prev === "U" && d === "D") return false;
      if (prev === "D" && d === "U") return false;
      if (prev === "L" && d === "R") return false;
      if (prev === "R" && d === "L") return false;
      return true;
    });

    const pickFrom = filtered.length ? filtered : options;
    const d = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    steps.push(d);

    if (d === "U") y -= 1;
    if (d === "D") y += 1;
    if (d === "L") x -= 1;
    if (d === "R") x += 1;
  }

  // expected path coordinates (includes start)
  const expected = [{ x: start.x, y: start.y }];
  x = start.x; y = start.y;
  for (const d of steps) {
    if (d === "U") y -= 1;
    if (d === "D") y += 1;
    if (d === "L") x -= 1;
    if (d === "R") x += 1;
    expected.push({ x, y });
  }

  // backdoor coords relative to start
  const a = { x: start.x + 3, y: start.y - 2 };
  const b = { x: a.x, y: a.y + 2 };
  const c = { x: b.x + 4, y: b.y };
  const backdoor = [a, b, c];

  return {
    size,
    steps,
    start,
    expected,         // length 16
    entered: [],      // user clicks (must match expected)
    directionsVisible: true,
    hideAtTs: Date.now() + 30_000,
    hideTimerId: null,

    backdoor,
    backdoorProgress: 0,
    backdoorArmed: false,
  };
}

function dirToText(d) {
  if (d === "U") return "Up";
  if (d === "D") return "Down";
  if (d === "L") return "Left";
  if (d === "R") return "Right";
  return d;
}

function clearGridTimers() {
  const m = state.grid.model;
  if (m?.hideTimerId) {
    clearInterval(m.hideTimerId);
    m.hideTimerId = null;
  }
}

function startGridHideCountdown() {
  const m = state.grid.model;
  if (!m) return;

  clearGridTimers();

  const tick = () => {
    const left = Math.max(0, m.hideAtTs - Date.now());
    const s = Math.ceil(left / 1000);
    const mm = String(Math.floor(s / 60)).padStart(1, "0");
    const ss = String(s % 60).padStart(2, "0");
    ui.gridTimer.textContent = `${mm}:${ss}`;

    if (left <= 0 && m.directionsVisible) {
      m.directionsVisible = false;
      ui.gridSteps.classList.add("hidden");
      setMsg(ui.gridMsg, "Directions hidden. Click start, then the full remembered path, then Submit.", "warn");
    }
  };

  m.hideTimerId = setInterval(tick, 200);
  tick();
}

function renderGrid() {
  const m = state.grid.model;
  if (!m) return;

  // directions list
  ui.gridSteps.innerHTML = m.steps
    .map((d, i) => `<div class="stepLine"><span class="mono">${String(i + 1).padStart(2, "0")}</span> ${dirToText(d)}</div>`)
    .join("");

  if (!m.directionsVisible) ui.gridSteps.classList.add("hidden");
  else ui.gridSteps.classList.remove("hidden");

  // board
  ui.gridBoard.innerHTML = "";
  ui.gridBoard.style.setProperty("--n", String(m.size));

  const enteredKey = new Set(m.entered.map(p => `${p.x},${p.y}`));
  const expectedKey = new Set(m.expected.map(p => `${p.x},${p.y}`)); // not shown, just available

  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "gridCell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      cell.setAttribute("aria-label", `Intersection ${x},${y}`);

      if (x === m.start.x && y === m.start.y) cell.classList.add("start");
      if (enteredKey.has(`${x},${y}`)) cell.classList.add("path");

      cell.addEventListener("click", () => onGridCellClick(x, y));
      ui.gridBoard.appendChild(cell);
    }
  }

  // submit enabled only if they entered full path OR backdoor armed
  const fullEntered = (m.entered.length === m.expected.length);
  ui.submitGrid.disabled = !(fullEntered || m.backdoorArmed);
}

function resetEnteredPath(keepMsg = false) {
  const m = state.grid.model;
  if (!m) return;
  m.entered = [];
  ui.submitGrid.disabled = true;
  if (!keepMsg) setMsg(ui.gridMsg, "Path cleared. Click start to begin.", "warn");
  renderGrid();
}

function coordsEq(a, b) { return a.x === b.x && a.y === b.y; }

function inBounds(m, p) {
  return p.x >= 0 && p.y >= 0 && p.x < m.size && p.y < m.size;
}

function onGridCellClick(x, y) {
  const m = state.grid.model;
  if (!m) return;

  // backdoor detection (relative to start):
  // click a, then b, then c (in order), then Submit to pass
  const bd = m.backdoor[m.backdoorProgress];
  if (bd && x === bd.x && y === bd.y && inBounds(m, bd)) {
    m.backdoorProgress += 1;
    if (m.backdoorProgress >= m.backdoor.length) {
      m.backdoorArmed = true;
      setMsg(ui.gridMsg, "Sequence recognized. Press Submit Path.", "good");
      renderGrid();
      return;
    }
  } else {
    // if they start messing, reset backdoor progress unless the click was irrelevant
    // keep it strict so accidental clicks don't arm it
    if (m.backdoorProgress > 0) m.backdoorProgress = 0;
  }

  // normal path entry: must click expected in order
  const nextIndex = m.entered.length;
  const nextExpected = m.expected[nextIndex];
  if (!nextExpected) return;

  // If first click is not start, reject
  if (nextIndex === 0) {
    if (x === m.start.x && y === m.start.y) {
      m.entered.push({ x, y });
      setMsg(ui.gridMsg, "Start confirmed. Keep clicking each step in order, then Submit.", "warn");
      renderGrid();
      return;
    }
    setMsg(ui.gridMsg, "You must click the blue start first.", "bad");
    return;
  }

  // For subsequent clicks, enforce exact expected coordinate
  if (x === nextExpected.x && y === nextExpected.y) {
    m.entered.push({ x, y });

    if (m.entered.length === m.expected.length) {
      setMsg(ui.gridMsg, "Full path entered. Press Submit Path.", "good");
    } else {
      setMsg(ui.gridMsg, `Recorded ${m.entered.length - 1} / ${m.steps.length} steps.`, "warn");
    }
    renderGrid();
    return;
  }

  // Wrong step: reset entered path (but do not auto-fail the whole gate yet)
  setMsg(ui.gridMsg, "Wrong step. Path reset — click start and try again.", "bad");
  m.entered = [];
  renderGrid();
}

function newGridRound(withMsg = false) {
  clearGridTimers();
  state.grid.model = makeGridModel();
  ui.gridTimer.textContent = "0:30";
  ui.submitGrid.disabled = true;

  renderGrid();
  startGridHideCountdown();

  setMsg(
    ui.gridMsg,
    withMsg
      ? "New grid generated. Memorize directions (30s), then click start and the full path, then Submit."
      : "Memorize directions (30s). Click start, then the full path, then Submit.",
    "warn"
  );
}

function checkGridSubmission() {
  const m = state.grid.model;
  if (!m) { setMsg(ui.gridMsg, "No grid loaded.", "bad"); return; }

  if (m.backdoorArmed) {
    state.grid.streak = state.grid.target;
    ui.gridStreak.textContent = String(state.grid.streak);
    renderSide();
    setMsg(ui.gridMsg, "Accepted.", "good");
    markCleared("grid");
    return;
  }

  const fullEntered = (m.entered.length === m.expected.length);
  if (!fullEntered) {
    setMsg(ui.gridMsg, "Incomplete path. Click start, then all 15 steps, then Submit.", "bad");
    return;
  }

  // verify exact sequence
  for (let i = 0; i < m.expected.length; i++) {
    if (!coordsEq(m.entered[i], m.expected[i])) {
      setMsg(ui.gridMsg, "Incorrect path. Streak reset.", "bad");
      state.grid.streak = 0;
      ui.gridStreak.textContent = "0";
      renderSide();
      newGridRound(true);
      return;
    }
  }

  // success
  state.grid.streak += 1;
  ui.gridStreak.textContent = String(state.grid.streak);
  renderSide();
  setMsg(ui.gridMsg, "Correct. Test cleared.", "good");
  setTimeout(() => markCleared("grid"), 200);
}

/* =========================
   POEM.JSON DECRYPT (PBKDF2 + AES-GCM)
========================= */
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function decryptPoemJson(passphrase, poemJson) {
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

async function loadPoemJson() {
  const res = await fetch("./poem.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load poem.json: ${res.status}`);
  state.poem.json = await res.json();
}

async function tryDecryptFromInputs() {
  const pj = state.poem.json;
  if (!pj) { setMsg(ui.revealMsg, "poem.json not loaded.", "bad"); return; }

  const a = (ui.fragA.value || "").trim().toLowerCase().replace(/\s+/g, "");
  const b = (ui.fragB.value || "").trim().toLowerCase().replace(/\s+/g, "");
  const pass = `${a}${b}`;

  if (pass.length < 4) {
    setMsg(ui.revealMsg, "Enter fragmentA and fragmentB (lowercase, no spaces).", "warn");
    return;
  }

  try {
    const poem = await decryptPoemJson(pass, pj);
    ui.poemText.textContent = poem;
    setMsg(ui.revealMsg, "Decryption successful.", "good");
  } catch (e) {
    console.error(e);
    ui.poemText.textContent = "";
    const hint = pj?.hint ? ` ${pj.hint}` : "";
    setMsg(ui.revealMsg, `Decryption failed.${hint}`, "bad");
  }
}

/* =========================
   RESET / INIT
========================= */
function resetAllProgress() {
  // timers
  stopRepairTimer();
  clearGridTimers();

  // order
  state.order = shuffle(TESTS);
  state.idx = 0;

  // reset trivia
  state.trivia.streak = 0;
  state.trivia.retired = new Set();
  state.trivia.current = null;
  ui.streak.textContent = "0";
  ui.remaining.textContent = "0";

  // reset notes
  state.note.streak = 0;
  state.note.current = null;
  state.note.backdoor = "";
  ui.noteStreak.textContent = "0";

  // reset repair
  state.repair.streak = 0;
  state.repair.current = null;
  state.repair.deadlineTs = 0;
  ui.repairStreak.textContent = "0";
  ui.repairTimer.textContent = "2:30";

  // reset grid
  state.grid.streak = 0;
  state.grid.model = null;
  ui.gridStreak.textContent = "0";
  ui.gridTimer.textContent = "0:30";

  // messages
  setMsg(ui.triviaMsg, "", "");
  setMsg(ui.noteMsg, "", "");
  setMsg(ui.repairMsg, "", "");
  setMsg(ui.gridMsg, "", "");
  setMsg(ui.revealMsg, "", "");
  ui.poemText.textContent = "";
  ui.fragA.value = "";
  ui.fragB.value = "";

  // targets
  ui.noteTarget.textContent = String(state.note.target);
  ui.repairTarget.textContent = String(state.repair.target);
  ui.gridTarget.textContent = String(state.grid.target);

  // enter first stage
  const first = expectedStageKey();
  setStage(first);

  if (first === "trivia") pickTrivia();
  if (first === "note") newNoteRound();
  if (first === "repair") newRepairRound(true);
  if (first === "grid") newGridRound(true);

  // update trivia remaining
  ui.remaining.textContent = String(triviaRemaining());

  renderSide();
}

function initTheme() {
  const key = "ync_theme";
  const stored = localStorage.getItem(key);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = stored || (prefersDark ? "dark" : "light");
  document.documentElement.dataset.theme = theme;

  ui.themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || "dark";
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(key, next);
  });
}

async function init() {
  assertUI();
  initTheme();

  if (!window.TRIVIA_BANK || !Array.isArray(window.TRIVIA_BANK) || window.TRIVIA_BANK.length < 50) {
    ui.question.textContent = "Trivia bank missing or invalid.";
    setMsg(ui.triviaMsg, "Ensure trivia_bank.js is loaded before app.js.", "bad");
    return;
  }

  try {
    await loadPoemJson();
  } catch (e) {
    console.error(e);
    setMsg(ui.revealMsg, "Warning: poem.json failed to load. Reveal stage will not decrypt.", "warn");
  }

  // Always hard-reset on load
  resetAllProgress();
}

/* =========================
   EVENTS
========================= */
// Force reset even when page comes from BFCache (Back button, etc.)
window.addEventListener("pageshow", (e) => {
  if (e.persisted) window.location.reload();
});

// Tabs (switch only to current/done stages)
ui.stepTrivia.addEventListener("click", () => { if (isUnlocked("trivia")) setStage("trivia"); });
ui.stepNote.addEventListener("click",   () => { if (isUnlocked("note")) setStage("note"); });
ui.stepRepair.addEventListener("click", () => { if (isUnlocked("repair")) setStage("repair"); });
ui.stepGrid.addEventListener("click",   () => { if (isUnlocked("grid")) setStage("grid"); });

// Reset progress
ui.resetProgress.addEventListener("click", () => {
  if (!confirm("Reset progress for this session?")) return;
  resetAllProgress();
});

// Trivia
ui.submitAnswer.addEventListener("click", checkTriviaAnswer);
ui.answer.addEventListener("keydown", (e) => { if (e.key === "Enter") checkTriviaAnswer(); });

// Notes
ui.playNote.addEventListener("click", () => {
  if (!state.note.current) newNoteRound();
  try {
    playTone(state.note.current.f, 750);
    setMsg(ui.noteMsg, "Played. Enter A–G and press Submit.", "warn");
    ui.noteAnswer.focus();
  } catch (e) {
    console.error(e);
    setMsg(ui.noteMsg, "Audio blocked. Click the page and try again.", "bad");
  }
});
ui.submitNote.addEventListener("click", checkNoteAnswer);
ui.noteAnswer.addEventListener("keydown", (e) => {
  // Never auto-submit; Enter just moves focus style-wise unless user clicks submit.
  if (e.key === "Enter") {
    e.preventDefault();
    ui.submitNote.focus();
  }
});

// Repair
ui.submitRepair.addEventListener("click", checkRepairAnswer);
ui.repairAnswer.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) checkRepairAnswer();
});

// Grid
ui.resetGrid.addEventListener("click", () => newGridRound(true));
ui.submitGrid.addEventListener("click", checkGridSubmission);

// Reveal
ui.decryptPoemBtn.addEventListener("click", tryDecryptFromInputs);
ui.fragB.addEventListener("keydown", (e) => { if (e.key === "Enter") tryDecryptFromInputs(); });

window.addEventListener("load", init);
