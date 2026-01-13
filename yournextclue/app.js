(() => {
  "use strict";

  /* =========================
     CONFIG
  ========================= */
  const BACKDOOR = "1324";

  const TRIVIA = { target: 15 };
  const NOTES  = { target: 5 };

  const REPAIR = {
    ms: 210_000, // 3:30
    tol: 20,     // <= 20 wrong chars
    target: 3,
  };

  const GRID = {
    size: 9,        // 9x9
    stepsN: 15,     // directions
    memoMs: 30_000, // 30s
  };

  const POEM =
`Echoes of leaves still drift in your mind,
Lingering high where the treetops aligned.
In a new kind of height the answer now hides,
Somewhere the stairway quietly guides.
Beyond the floor where the busy feet roam,
Every step feels closer to home.
Deeper inside where the ceilings grow,
Riddles begin to softly glow.
Out of the noise and daily gloom,
Onward you move to a quieter room.
Mysteries wait for the ones who assume.`;

  /* =========================
     DOM HELPERS
  ========================= */
  const byId = (id) => document.getElementById(id);

  function show(el){ if (!el) return; el.hidden = false; el.style.display = ""; el.classList.add("show"); }
  function hide(el){ if (!el) return; el.hidden = true; el.style.display = "none"; el.classList.remove("show"); }
  function setText(el, t){ if (!el) return; el.textContent = t ?? ""; }
  function setHTML(el, h){ if (!el) return; el.innerHTML = h ?? ""; }

  function setMsg(el, text, kind){
    if (!el) return;
    el.textContent = text || "";
    el.className = "msg" + (kind ? ` ${kind}` : "");
  }

  function norm(s) {
    return (s || "")
      .toLowerCase()
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  }

  function isBackdoor(s){
    return norm(s) === BACKDOOR;
  }

  /* =========================
     UI
  ========================= */
  const ui = {
    // Top
    panelTitle: byId("panelTitle"),
    panelDesc: byId("panelDesc"),
    statusPill: byId("statusPill"),
    stepsNav: byId("stepsNav"),
    themeToggle: byId("themeToggle"),
    themeIcon: byId("themeIcon"),

    // Tabs
    stepTrivia: byId("stepTrivia"),
    stepNotes: byId("stepNotes"),
    stepRepair: byId("stepRepair"),
    stepGrid: byId("stepGrid"),

    // Stages
    stageTrivia: byId("stageTrivia"),
    stageNotes: byId("stageNotes"),
    stageRepair: byId("stageRepair"),
    stageGrid: byId("stageGrid"),
    stageReveal: byId("stageReveal"),

    // Sidebar
    side: byId("side"),
    objective: byId("objective"),
    objectiveDesc: byId("objectiveDesc"),
    pTrivia: byId("pTrivia"),
    pNotes: byId("pNotes"),
    pRepair: byId("pRepair"),
    pGrid: byId("pGrid"),

    /* TRIVIA */
    triviaStreak: byId("streak"),
    triviaTarget: byId("triviaTarget"),
    triviaRemaining: byId("remaining"),
    triviaCategory: byId("category"),
    triviaQuestion: byId("question"),
    triviaAnswer: byId("answer"),
    triviaSubmit: byId("submitAnswer"),
    triviaMsg: byId("triviaMsg"),
    resetProgress: byId("resetProgress"),

    /* NOTES */
    noteStreak: byId("noteStreak"),
    noteTarget: byId("noteTarget"),
    playNote: byId("playNote"),
    noteInput: byId("noteAnswer"),
    noteSubmit: byId("submitNote"),
    noteMsg: byId("noteMsg"),

    /* REPAIR */
    repairStreak: byId("repairStreak"),
    repairTarget: byId("repairTarget"),
    repairTimer: byId("repairTimer"),
    repairPrompt: byId("repairPrompt"),
    repairInput: byId("repairAnswer"),
    repairSubmit: byId("submitRepair"),
    repairNew: byId("newRepair"),
    repairMsg: byId("repairMsg"),

    /* GRID */
    gridStreak: byId("gridStreak"),
    gridTarget: byId("gridTarget"),
    gridTimer: byId("gridTimer"),
    gridSteps: byId("gridSteps"),
    gridBoard: byId("gridBoard"),
    gridSubmit: byId("submitGrid"),
    gridRegen: byId("resetGrid"),
    gridMsg: byId("gridMsg"),

    /* REVEAL */
    poemText: byId("poemText"),
    revealMsg: byId("revealMsg"),
  };

  /* =========================
     STATE
  ========================= */
  const state = {
    theme: "dark",

    order: ["trivia","notes","repair","grid"],
    idx: 0,
    gate: "trivia",
    cleared: new Set(),

    trivia: { streak: 0, retired: new Set(), current: null },
    notes:  { streak: 0, current: null, secretBuf: "" },
    repair: { streak: 0, current: null, deadlineTs: 0, timerId: null },
    grid:   {
      streak: 0,
      model: null,
      phase: "memo", // memo -> play
      memoDeadlineTs: 0,
      memoTimerId: null,
      clicked: [],
      expectedIndex: 0
    },
  };

  /* =========================
     THEME
  ========================= */
  function applyTheme(t){
    state.theme = (t === "light") ? "light" : "dark";
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.style.colorScheme = state.theme;
    try { localStorage.setItem("ync_theme", state.theme); } catch {}

    // per requirement: sun icon on dark, moon on light
    if (ui.themeIcon) {
      ui.themeIcon.className = (state.theme === "dark")
        ? "fa-solid fa-sun"
        : "fa-solid fa-moon";
    }
  }

  function initTheme(){
    let t = "dark";
    try { t = localStorage.getItem("ync_theme") || "dark"; } catch {}
    applyTheme(t);

    ui.themeToggle?.addEventListener("click", () => {
      applyTheme(state.theme === "dark" ? "light" : "dark");
    });
  }

  /* =========================
     NAV / STAGES
  ========================= */
  function showOnlyStage(g){
    hide(ui.stageTrivia);
    hide(ui.stageNotes);
    hide(ui.stageRepair);
    hide(ui.stageGrid);
    hide(ui.stageReveal);

    if (g === "trivia") show(ui.stageTrivia);
    if (g === "notes") show(ui.stageNotes);
    if (g === "repair") show(ui.stageRepair);
    if (g === "grid") show(ui.stageGrid);
    if (g === "reveal") show(ui.stageReveal);
  }

  function gateTitle(g){
    if (g === "trivia") return "Test — Trivia";
    if (g === "notes")  return "Test — Music Notes";
    if (g === "repair") return "Test — Sentence Repair";
    if (g === "grid")   return "Test — Grid Memory Path";
    if (g === "reveal") return "Access Granted";
    return "Gate";
  }

  function setTabState(){
    const map = [
      ["trivia", ui.stepTrivia],
      ["notes", ui.stepNotes],
      ["repair", ui.stepRepair],
      ["grid", ui.stepGrid],
    ];

    for (const [g, el] of map) {
      if (!el) continue;
      const active = (g === state.gate);
      const cleared = state.cleared.has(g);
      el.classList.toggle("active", active);
      el.classList.toggle("done", cleared);
      el.disabled = !active;
    }
  }

  function renderProgress(){
    setText(ui.triviaTarget, String(TRIVIA.target));
    setText(ui.noteTarget, String(NOTES.target));
    setText(ui.repairTarget, String(REPAIR.target));
    setText(ui.gridTarget, "1");

    setText(ui.triviaStreak, String(state.trivia.streak));
    setText(ui.noteStreak, String(state.notes.streak));
    setText(ui.repairStreak, String(state.repair.streak));
    setText(ui.gridStreak, String(state.grid.streak));

    setText(ui.pTrivia, `${state.trivia.streak} / ${TRIVIA.target}`);
    setText(ui.pNotes, `${state.notes.streak} / ${NOTES.target}`);
    setText(ui.pRepair, `${state.repair.streak} / ${REPAIR.target}`);
    setText(ui.pGrid, `${state.grid.streak} / 1`);
  }

  function setGate(g){
    state.gate = g;
    setTabState();
    showOnlyStage(g);

    setText(ui.panelTitle, gateTitle(g));
    setText(ui.statusPill, state.cleared.has(g) ? "Unlocked" : "In progress");

    if (g === "trivia") {
      setHTML(ui.panelDesc, `Answer <b>${TRIVIA.target}</b> correctly in a row. Miss resets streak.`);
      setText(ui.objective, `${TRIVIA.target} in a row`);
      setText(ui.objectiveDesc, "Answer each question and submit.");
      pickTrivia();
    }

    if (g === "notes") {
      setHTML(ui.panelDesc, `Press “Play note”, enter A–G, then Submit. Get <b>${NOTES.target}</b> in a row.`);
      setText(ui.objective, `${NOTES.target} in a row`);
      setText(ui.objectiveDesc, "Click Play note each round. Submit is required.");
      newNoteRound(false);
    }

    if (g === "repair") {
      setHTML(ui.panelDesc, `Fix the text. <b>3:30</b> limit. Get <b>${REPAIR.target}</b> wins in a row. Tolerance ≤ <b>${REPAIR.tol}</b>.`);
      setText(ui.objective, `${REPAIR.target} wins in a row`);
      setText(ui.objectiveDesc, "Keep numbering and line breaks. Submit is required.");
      newRepairRound(true);
    }

    if (g === "grid") {
      setHTML(ui.panelDesc, `Memorize <b>${GRID.stepsN}</b> directions for <b>30 seconds</b>. Then click the path and submit.`);
      setText(ui.objective, `1 correct`);
      setText(ui.objectiveDesc, "Click start first, then every step, then Submit.");
      newGridRound(true);
    }

    if (g === "reveal") {
      setText(ui.panelDesc, "");
      setText(ui.objective, "Completed");
      setText(ui.objectiveDesc, "All gates cleared.");
      enterReveal();
    }

    renderProgress();
  }

  function completeGate(g){
    state.cleared.add(g);
    state.idx += 1;

    if (state.idx >= state.order.length) {
      setGate("reveal");
      return;
    }
    setGate(state.order[state.idx]);
  }

  function enterReveal(){
    // Hide nav + side for a cleaner final screen
    if (ui.stepsNav) ui.stepsNav.style.display = "none";
    if (ui.side) ui.side.style.display = "none";
    setText(ui.statusPill, "Unlocked");

    setText(ui.poemText, POEM);
    setMsg(ui.revealMsg, "", "");
  }

  function shuffle(arr){
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* =========================
     TRIVIA
  ========================= */
  function triviaRemaining(){
    if (!window.TRIVIA_BANK || !Array.isArray(window.TRIVIA_BANK)) return 0;
    return window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id)).length;
  }

  function levenshteinRaw(a, b){
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

  function typoOk(guess, truth){
    const g = norm(guess);
    const t = norm(truth);
    if (!g || !t) return false;
    if (g === t) return true;
    const dist = levenshteinRaw(g, t);
    const L = Math.max(g.length, t.length);
    if (L <= 4) return dist <= 1;
    if (L <= 8) return dist <= 1;
    if (L <= 14) return dist <= 2;
    return dist <= 3;
  }

  function matchesAny(guess, truths){
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

  function pickTrivia(){
    if (!window.TRIVIA_BANK || !Array.isArray(window.TRIVIA_BANK) || window.TRIVIA_BANK.length < 10) {
      setText(ui.triviaQuestion, "Trivia bank missing or invalid.");
      setMsg(ui.triviaMsg, "Ensure trivia_bank.js loads before app.js.", "bad");
      return;
    }

    const pool = window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id));
    if (!pool.length) {
      setText(ui.triviaQuestion, "No trivia remaining in this session.");
      setMsg(ui.triviaMsg, "Reload to reset.", "warn");
      return;
    }

    const q = pool[Math.floor(Math.random() * pool.length)];
    state.trivia.current = q;

    setText(ui.triviaCategory, q.cat || "—");
    setText(ui.triviaQuestion, q.q || "—");
    if (ui.triviaAnswer) ui.triviaAnswer.value = "";
    setMsg(ui.triviaMsg, "", "");
    setText(ui.triviaRemaining, String(triviaRemaining()));
    setTimeout(() => ui.triviaAnswer?.focus?.(), 0);
  }

  function checkTrivia(){
    const raw = ui.triviaAnswer?.value || "";
    if (isBackdoor(raw)) {
      state.trivia.streak = TRIVIA.target;
      renderProgress();
      setMsg(ui.triviaMsg, "Accepted.", "good");
      completeGate("trivia");
      return;
    }

    const q = state.trivia.current;
    if (!q) return;

    const guess = norm(raw);
    if (!guess) {
      setMsg(ui.triviaMsg, "Enter an answer.", "bad");
      return;
    }

    state.trivia.retired.add(q.id);
    setText(ui.triviaRemaining, String(triviaRemaining()));

    const truths = [q.a, ...(q.alts || [])];
    const ok = matchesAny(raw, truths);

    if (ok) {
      state.trivia.streak += 1;
      renderProgress();
      setMsg(ui.triviaMsg, "Correct.", "good");

      if (state.trivia.streak >= TRIVIA.target) {
        setTimeout(() => completeGate("trivia"), 200);
      } else {
        setTimeout(pickTrivia, 220);
      }
      return;
    }

    state.trivia.streak = 0;
    renderProgress();
    setMsg(ui.triviaMsg, `Incorrect. Answer: ${q.a}`, "bad");
    setTimeout(pickTrivia, 450);
  }

  /* =========================
     MUSIC NOTES (stable tuning)
  ========================= */
  // One octave, equal temperament, standard reference
  const NOTE_BANK = [
    { n: "C", f: 261.625565 }, // C4
    { n: "D", f: 293.664768 }, // D4
    { n: "E", f: 329.627557 }, // E4
    { n: "F", f: 349.228231 }, // F4
    { n: "G", f: 391.995436 }, // G4
    { n: "A", f: 440.000000 }, // A4
    { n: "B", f: 493.883301 }, // B4
  ];

if (NOTE_BANK.length !== 7) {
  throw new Error(`NOTE_BANK must contain exactly 7 notes. Found: ${NOTE_BANK.length}`);
}
  
  const audio = { ctx: null, master: null };

  function ensureAudio(){
    if (audio.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.10;
    audio.master.connect(audio.ctx.destination);
  }

  function playTone(freq, ms = 700){
    ensureAudio();
    if (audio.ctx.state === "suspended") audio.ctx.resume();

    const now = audio.ctx.currentTime;

    const osc = audio.ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now);

    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.9, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);

    osc.connect(g);
    g.connect(audio.master);

    osc.start(now);
    osc.stop(now + ms / 1000 + 0.05);
  }

  function newNoteRound(){
    state.notes.current = NOTE_BANK[Math.floor(Math.random() * NOTE_BANK.length)];
    if (ui.noteInput) ui.noteInput.value = "";
    setMsg(ui.noteMsg, "Click Play note, enter A–G, then Submit.", "warn");
    setTimeout(() => ui.noteInput?.focus?.(), 0);
  }

  function checkNotes(){
    const raw = (ui.noteInput?.value || "").trim();

    // backdoor: either full input "1324" or typed digits buffer
    if (isBackdoor(raw) || state.notes.secretBuf === BACKDOOR) {
      state.notes.streak = NOTES.target;
      renderProgress();
      setMsg(ui.noteMsg, "Accepted.", "good");
      completeGate("notes");
      return;
    }

    if (!state.notes.current) {
      setMsg(ui.noteMsg, "No note loaded. Click Play note.", "bad");
      return;
    }

    const g = raw.toUpperCase().replace(/[^A-G]/g, "").slice(0, 1);
    if (!g) {
      setMsg(ui.noteMsg, "Enter a single letter A–G, then press Submit.", "bad");
      return;
    }

    const ok = (g === state.notes.current.n);
    if (ok) {
      state.notes.streak += 1;
      renderProgress();
      setMsg(ui.noteMsg, "Correct.", "good");

      if (state.notes.streak >= NOTES.target) {
        setTimeout(() => completeGate("notes"), 200);
      } else {
        setTimeout(newNoteRound, 220);
      }
      return;
    }

    state.notes.streak = 0;
    renderProgress();
    setMsg(ui.noteMsg, "Incorrect.", "bad");
    setTimeout(newNoteRound, 240);
  }

  /* =========================
     REPAIR
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
    // Keep line breaks meaningful; normalize whitespace within lines.
    const raw = (s || "").replace(/\r\n/g, "\n");
    const lines = raw.split("\n").map(l => l.trim());

    // Drop empty leading/trailing lines only
    while (lines.length && lines[0] === "") lines.shift();
    while (lines.length && lines[lines.length - 1] === "") lines.pop();

    return lines
      .map(l => l.replace(/[ \t]+/g, " "))
      .join("\n")
      .trim()
      .normalize("NFKC")
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"');
  }

  function stopRepairTimer(){
    if (state.repair.timerId) {
      clearInterval(state.repair.timerId);
      state.repair.timerId = null;
    }
  }

  function startRepairTimer(){
    stopRepairTimer();
    const tick = () => {
      const left = Math.max(0, state.repair.deadlineTs - Date.now());
      const s = Math.ceil(left / 1000);
      const mm = String(Math.floor(s / 60));
      const ss = String(s % 60).padStart(2, "0");
      setText(ui.repairTimer, `${mm}:${ss}`);
      if (left <= 0) {
        stopRepairTimer();
        state.repair.streak = 0;
        renderProgress();
        setMsg(ui.repairMsg, "Time expired. Streak reset.", "bad");
        setTimeout(() => newRepairRound(true), 350);
      }
    };
    state.repair.timerId = setInterval(tick, 200);
    tick();
  }

  function newRepairRound(showGuidance){
    stopRepairTimer();
    const item = REPAIR_BANK[Math.floor(Math.random() * REPAIR_BANK.length)];
    state.repair.current = item;

    setText(ui.repairPrompt, item.broken);
    if (ui.repairInput) ui.repairInput.value = "";

    setMsg(
      ui.repairMsg,
      showGuidance ? "Keep 4 numbered lines with the same line breaks. Fix errors, then Submit." : "",
      showGuidance ? "warn" : ""
    );

    state.repair.deadlineTs = Date.now() + REPAIR.ms;
    startRepairTimer();
    setTimeout(() => ui.repairInput?.focus?.(), 0);
  }

  function checkRepair(){
    const raw = ui.repairInput?.value || "";

    if (isBackdoor(raw)) {
      stopRepairTimer();
      state.repair.streak = REPAIR.target;
      renderProgress();
      setMsg(ui.repairMsg, "Accepted.", "good");
      completeGate("repair");
      return;
    }

    const item = state.repair.current;
    if (!item) {
      setMsg(ui.repairMsg, "No prompt loaded.", "bad");
      return;
    }

    const left = state.repair.deadlineTs - Date.now();
    if (left <= 0) {
      setMsg(ui.repairMsg, "Time expired.", "bad");
      return;
    }

    const guess = canonRepair(raw);
    const truth = canonRepair(item.fixed);

    const dist = levenshteinRaw(guess, truth);
    const ok = (guess === truth) || (dist <= REPAIR.tol);

    if (ok) {
      stopRepairTimer();
      state.repair.streak += 1;
      renderProgress();
      setMsg(ui.repairMsg, "Correct.", "good");

      if (state.repair.streak >= REPAIR.target) {
        setTimeout(() => completeGate("repair"), 200);
      } else {
        setTimeout(() => newRepairRound(true), 240);
      }
      return;
    }

    stopRepairTimer();
    state.repair.streak = 0;
    renderProgress();
    setMsg(ui.repairMsg, "Incorrect. Your entered path reset for this prompt; try a new prompt.", "bad");
    setTimeout(() => newRepairRound(true), 260);
  }

  /* =========================
     GRID (no self-overlap; no hints; wrong click resets)
  ========================= */
  function dirToText(d){
    return d === "U" ? "Up" : d === "D" ? "Down" : d === "L" ? "Left" : "Right";
  }

  function makeGridModelNoOverlap(){
    const size = GRID.size;
    const stepsN = GRID.stepsN;

    const attempts = 300;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const start = {
        x: 2 + Math.floor(Math.random() * (size - 4)),
        y: 2 + Math.floor(Math.random() * (size - 4)),
      };

      const visited = new Set([`${start.x},${start.y}`]);
      const steps = [];
      const path = [{ x: start.x, y: start.y }];

      let x = start.x, y = start.y;

      for (let i = 0; i < stepsN; i++) {
        const prev = steps[i - 1];

        const options = [];
        const tryPush = (d, nx, ny) => {
          const key = `${nx},${ny}`;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) return;
          if (visited.has(key)) return;
          // avoid immediate backtrack (redundant since visited blocks it, but keep clean)
          if (prev === "U" && d === "D") return;
          if (prev === "D" && d === "U") return;
          if (prev === "L" && d === "R") return;
          if (prev === "R" && d === "L") return;
          options.push({ d, nx, ny });
        };

        tryPush("U", x, y - 1);
        tryPush("D", x, y + 1);
        tryPush("L", x - 1, y);
        tryPush("R", x + 1, y);

        if (!options.length) break;

        const pick = options[Math.floor(Math.random() * options.length)];
        steps.push(pick.d);

        x = pick.nx; y = pick.ny;
        visited.add(`${x},${y}`);
        path.push({ x, y });

        if (i === stepsN - 1) {
          return { size, start, steps, path };
        }
      }
      // fallthrough -> retry
    }

    // Worst-case fallback: allow overlap (should be extremely rare)
    // but still keep app functional.
    const start = { x: 4, y: 4 };
    const steps = Array.from({ length: stepsN }, () => "R");
    const path = [{ x: start.x, y: start.y }];
    for (let i = 0; i < stepsN; i++) path.push({ x: start.x + i + 1, y: start.y });
    return { size, start, steps, path };
  }

  function stopGridMemoTimer(){
    if (state.grid.memoTimerId) {
      clearInterval(state.grid.memoTimerId);
      state.grid.memoTimerId = null;
    }
  }

  function renderDirections(m){
    const html = m.steps
      .map((d, i) => {
        const idx = String(i + 1).padStart(2, "0");
        return `<div class="stepLine"><span class="idx">${idx}</span><span>${dirToText(d)}</span></div>`;
      })
      .join("");
    setHTML(ui.gridSteps, html);
  }

  function renderGridBoard(m){
    if (!ui.gridBoard) return;
    ui.gridBoard.innerHTML = "";
    ui.gridBoard.style.setProperty("--n", String(m.size));

    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "gridCell";
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        cell.setAttribute("aria-label", `Cell ${x},${y}`);

        const isStart = (x === m.start.x && y === m.start.y);
        if (isStart) cell.classList.add("start");

        const idx = state.grid.clicked.findIndex(p => p.x === x && p.y === y);
        if (idx >= 0) cell.classList.add("selected");

        cell.addEventListener("click", () => onGridCellClick(x, y));
        ui.gridBoard.appendChild(cell);
      }
    }
  }

  function setGridPhase(phase){
    state.grid.phase = phase;

    if (phase === "memo") {
      // show directions, hide board
      if (ui.gridSteps) ui.gridSteps.style.display = "";
      if (ui.gridBoard?.parentElement) ui.gridBoard.parentElement.style.display = "none";
      if (ui.gridSubmit) ui.gridSubmit.disabled = true;
    } else {
      if (ui.gridSteps) ui.gridSteps.style.display = "none";
      if (ui.gridBoard?.parentElement) ui.gridBoard.parentElement.style.display = "";
      if (ui.gridSubmit) ui.gridSubmit.disabled = true;
    }
  }

  function startGridMemoCountdown(){
    stopGridMemoTimer();
    const tick = () => {
      const left = Math.max(0, state.grid.memoDeadlineTs - Date.now());
      const s = Math.ceil(left / 1000);
      const mm = String(Math.floor(s / 60));
      const ss = String(s % 60).padStart(2, "0");
      setText(ui.gridTimer, `${mm}:${ss}`);

      if (left <= 0) {
        stopGridMemoTimer();
        setGridPhase("play");
        state.grid.clicked = [];
        state.grid.expectedIndex = 0;
        if (ui.gridSubmit) ui.gridSubmit.disabled = true;
        setMsg(ui.gridMsg, "Directions hidden. Click start first, then every step, then press Submit.", "warn");
        renderGridBoard(state.grid.model);
      }
    };
    state.grid.memoTimerId = setInterval(tick, 200);
    tick();
  }

  function newGridRound(){
    stopGridMemoTimer();
    state.grid.model = makeGridModelNoOverlap();
    state.grid.clicked = [];
    state.grid.expectedIndex = 0;

    renderDirections(state.grid.model);
    renderGridBoard(state.grid.model);

    setGridPhase("memo");
    setMsg(ui.gridMsg, "Memorize the directions. The grid will appear when time expires.", "warn");

    state.grid.memoDeadlineTs = Date.now() + GRID.memoMs;
    startGridMemoCountdown();
  }

  function onGridCellClick(x, y){
    const m = state.grid.model;
    if (!m) return;

    if (state.grid.phase !== "play") {
      setMsg(ui.gridMsg, "Wait until the directions disappear.", "bad");
      return;
    }

    const expected = m.path[state.grid.expectedIndex];
    const isCorrect = expected && expected.x === x && expected.y === y;

    if (!isCorrect) {
      // reset without leaking expected location
      state.grid.clicked = [];
      state.grid.expectedIndex = 0;
      if (ui.gridSubmit) ui.gridSubmit.disabled = true;
      setMsg(ui.gridMsg, "Wrong cell. Your entered path was reset.", "bad");
      renderGridBoard(m);
      return;
    }

    state.grid.clicked.push({ x, y });
    state.grid.expectedIndex += 1;

    const needed = m.path.length;
    const have = state.grid.clicked.length;

    if (have < needed) {
      setMsg(ui.gridMsg, `Progress: ${have}/${needed}. Keep going.`, "warn");
      if (ui.gridSubmit) ui.gridSubmit.disabled = true;
    } else {
      setMsg(ui.gridMsg, "Path complete. Press Submit.", "warn");
      if (ui.gridSubmit) ui.gridSubmit.disabled = false;
    }

    renderGridBoard(m);
  }

  function checkGridPath(){
    const m = state.grid.model;
    if (!m) {
      setMsg(ui.gridMsg, "No grid loaded.", "bad");
      return;
    }
    if (state.grid.phase !== "play") {
      setMsg(ui.gridMsg, "Wait until directions disappear.", "bad");
      return;
    }

    if (isBackdoor((state.grid.clicked || []).map(p => `${p.x},${p.y}`).join("|"))) {
      state.grid.streak = 1;
      renderProgress();
      setMsg(ui.gridMsg, "Accepted.", "good");
      completeGate("grid");
      return;
    }

    const needed = m.path.length;
    if (state.grid.clicked.length !== needed) {
      setMsg(ui.gridMsg, `Incomplete path. You need ${needed} clicks total.`, "bad");
      return;
    }

    // already enforced during clicking; this is a final integrity check
    for (let i = 0; i < needed; i++) {
      if (state.grid.clicked[i].x !== m.path[i].x || state.grid.clicked[i].y !== m.path[i].y) {
        setMsg(ui.gridMsg, "Incorrect path. Regenerate and retry.", "bad");
        return;
      }
    }

    state.grid.streak = 1;
    renderProgress();
    setMsg(ui.gridMsg, "Correct.", "good");
    setTimeout(() => completeGate("grid"), 180);
  }

  /* =========================
     RESET + BOOT
  ========================= */
  function hardResetSession(){
    // timers
    stopRepairTimer();
    stopGridMemoTimer();

// fixed order; always start on Trivia
state.order = ["trivia", "notes", "repair", "grid"];
state.idx = 0;
state.cleared = new Set();
state.gate = "trivia";

    // trivia
    state.trivia.streak = 0;
    state.trivia.retired = new Set();
    state.trivia.current = null;

    // notes
    state.notes.streak = 0;
    state.notes.current = null;
    state.notes.secretBuf = "";

    // repair
    state.repair.streak = 0;
    state.repair.current = null;
    state.repair.deadlineTs = 0;

    // grid
    state.grid.streak = 0;
    state.grid.model = null;
    state.grid.phase = "memo";
    state.grid.memoDeadlineTs = 0;
    state.grid.clicked = [];
    state.grid.expectedIndex = 0;

    // clear messages
    setMsg(ui.triviaMsg, "", "");
    setMsg(ui.noteMsg, "", "");
    setMsg(ui.repairMsg, "", "");
    setMsg(ui.gridMsg, "", "");
    setMsg(ui.revealMsg, "", "");

    // reset inputs
    if (ui.triviaAnswer) ui.triviaAnswer.value = "";
    if (ui.noteInput) ui.noteInput.value = "";
    if (ui.repairInput) ui.repairInput.value = "";

    // ensure nav/side visible
    if (ui.stepsNav) ui.stepsNav.style.display = "";
    if (ui.side) ui.side.style.display = "";

    renderProgress();
    setGate(state.gate);
  }

  function wireEvents(){
    // Tabs are intentionally non-navigable: only active gate is enabled.
    ui.stepTrivia?.addEventListener("click", (e) => { e.preventDefault(); if (state.gate === "trivia") setGate("trivia"); });
    ui.stepNotes?.addEventListener("click",  (e) => { e.preventDefault(); if (state.gate === "notes")  setGate("notes"); });
    ui.stepRepair?.addEventListener("click", (e) => { e.preventDefault(); if (state.gate === "repair") setGate("repair"); });
    ui.stepGrid?.addEventListener("click",   (e) => { e.preventDefault(); if (state.gate === "grid")   setGate("grid"); });

    // Reset progress
    ui.resetProgress?.addEventListener("click", hardResetSession);

    // Trivia
    ui.triviaSubmit?.addEventListener("click", checkTrivia);
    ui.triviaAnswer?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") checkTrivia();
    });

    // Notes: restrict input to A–G or digits
    ui.noteInput?.addEventListener("input", () => {
      const v = ui.noteInput.value || "";
      const cleaned = v.toUpperCase().replace(/[^A-G0-9]/g, "").slice(0, 4);
      if (cleaned !== v) ui.noteInput.value = cleaned;
    });

    ui.noteInput?.addEventListener("keydown", (e) => {
      if (/^[0-9]$/.test(e.key)) {
        state.notes.secretBuf = (state.notes.secretBuf + e.key).slice(-4);
      }
    });

    ui.playNote?.addEventListener("click", () => {
      if (!state.notes.current) newNoteRound();
      try {
        playTone(state.notes.current.f, 720);
        setMsg(ui.noteMsg, "Played. Enter A–G, then press Submit.", "warn");
        ui.noteInput?.focus?.();
      } catch (err) {
        console.error(err);
        setMsg(ui.noteMsg, "Audio blocked. Click Play note again.", "bad");
      }
    });

    ui.noteSubmit?.addEventListener("click", checkNotes);

    // Repair
    ui.repairNew?.addEventListener("click", () => newRepairRound(true));
    ui.repairSubmit?.addEventListener("click", checkRepair);
    ui.repairInput?.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        checkRepair();
      }
    });

    // Grid
    ui.gridRegen?.addEventListener("click", newGridRound);
    ui.gridSubmit?.addEventListener("click", checkGridPath);
  }

  async function init(){
    // visible error surface (prevents silent “Loading…”)
    window.addEventListener("error", (e) => {
      try {
        const msg = e?.message || "Unknown error";
        console.error("YNC error:", e);
        setText(ui.panelDesc, `JS error: ${msg}`);
        setText(ui.statusPill, "Error");
      } catch {}
    });

    window.addEventListener("unhandledrejection", (e) => {
      try {
        const msg = e?.reason?.message || String(e?.reason || "Unhandled rejection");
        console.error("YNC rejection:", e?.reason);
        setText(ui.panelDesc, `JS error: ${msg}`);
        setText(ui.statusPill, "Error");
      } catch {}
    });

    initTheme();
    wireEvents();
    hardResetSession();
  }

  function boot(){
    init().catch((err) => {
      console.error("YNC init failed:", err);
      try {
        setText(ui.panelDesc, `JS init failed: ${err?.message || err}`);
        setText(ui.statusPill, "Error");
      } catch {}
    });
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
