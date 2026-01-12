/* app.js (patched)
   Drop-in replacement for /yournextclue/app.js

   Goals implemented:
   - Always reset progress on reload; always start at Trivia.
   - Tabs navigate, but only the CURRENT active gate is clickable (no going back after completion, no skipping ahead).
   - Remove Reveal tab behavior (JS hides it if present).
   - Backdoor code "1324" works for EVERY gate (Trivia, Music Notes, Repair, Grid).
   - Music Notes: single octave (7 fixed notes), no replay, never auto-submit via keyboard.
   - Sentence Repair: 2:30 timer, <= 5 wrong characters allowed, clearer formatting expectations.
   - Grid: 15 directions shown for 30s while grid is hidden; then directions disappear, grid appears;
           must click the FULL path (start first, then each step) and press Submit.
           Also includes a secret grid-click backdoor pattern.

   NOTE: This file is tolerant of several HTML ID variants.
*/

(() => {
  "use strict";

  /* =========================
     CONFIG
  ========================= */
  const BACKDOOR = "1324";

  const GATES = ["trivia", "notes", "repair", "grid"]; // reveal is implicit final

  const GRID = {
    size: 9,           // 9x9 intersections
    stepsN: 15,        // 15 directions
    memoMs: 30_000,    // 30 seconds directions visibility
  };

  const REPAIR = {
    ms: 150_000,       // 2:30
    tol: 5,            // <= 5 wrong characters
    target: 3,         // 3 wins in a row
  };

  const TRIVIA = { target: 15 };
  const NOTES  = { target: 5 };

  /* =========================
     DOM HELPERS (ID tolerant)
  ========================= */
  const byId = (id) => document.getElementById(id) || null;

  function firstEl(...candidates) {
    for (const c of candidates) {
      if (!c) continue;
      if (typeof c === "string") {
        const el = byId(c);
        if (el) return el;
        const q = document.querySelector(c);
        if (q) return q;
      } else if (c instanceof HTMLElement) {
        return c;
      }
    }
    return null;
  }

  function els(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text ?? "";
  }

  function setHTML(el, html) {
    if (!el) return;
    el.innerHTML = html ?? "";
  }

  function show(el) {
    if (!el) return;
    el.style.display = "";
    el.hidden = false;
    el.classList.add("show");
  }

  function hide(el) {
    if (!el) return;
    el.style.display = "none";
    el.hidden = true;
    el.classList.remove("show");
  }

  function setMsg(el, text, kind) {
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

  function isBackdoor(s) {
    return norm(s) === BACKDOOR;
  }

  /* =========================
     UI MAP (supports multiple HTML variants)
  ========================= */
  const ui = {
    // Top header / panels
    panelTitle: firstEl("panelTitle", "#panelTitle", '[data-role="panelTitle"]'),
    panelDesc:  firstEl("panelDesc", "#panelDesc",  '[data-role="panelDesc"]'),
    statusPill: firstEl("statusPill", "#statusPill", '[data-role="statusPill"]'),

    // Tabs container (new UI) or steps nav (older UI)
    tabsNav: firstEl("#tabsNav", "#stepsNav", '[data-role="tabs"]', '[aria-label="progress"]'),

    // Individual tabs (try data-gate first, then legacy ids)
    tabTrivia: firstEl('[data-gate="trivia"]', "#stepTrivia", "#step0", "#tabTrivia"),
    tabNotes:  firstEl('[data-gate="notes"]',  "#stepNote", "#stepNotes", "#step1", "#tabNotes"),
    tabRepair: firstEl('[data-gate="repair"]', "#stepRepair", "#step2", "#tabRepair"),
    tabGrid:   firstEl('[data-gate="grid"]',   "#stepGrid", "#step3", "#tabGrid"),
    tabReveal: firstEl('[data-gate="reveal"]', "#stepReveal", "#step4", "#tabReveal"),

    // Stages (sections)
    stageTrivia: firstEl("#stageTrivia", '[data-stage="trivia"]'),
    stageNotes:  firstEl("#stageNotes", "#stageNote", '[data-stage="notes"]'),
    stageRepair: firstEl("#stageRepair", '[data-stage="repair"]'),
    stageGrid:   firstEl("#stageGrid", '[data-stage="grid"]'),
    stageReveal: firstEl("#stageReveal", '[data-stage="reveal"]'),

    // Sidebar / progress area (may be hidden on reveal)
    side:        firstEl(".side", "#side", '[data-role="side"]'),
    objective:   firstEl("#objective", '[data-role="objective"]'),
    objectiveDesc: firstEl("#objectiveDesc", '[data-role="objectiveDesc"]'),

    // Progress values (multiple variants)
    pTrivia: firstEl("#pTrivia", "#p0Val", '[data-progress="trivia"]'),
    pNotes:  firstEl("#pNote", "#pNotes", "#p1Val", '[data-progress="notes"]'),
    pRepair: firstEl("#pRepair", "#p2Val", '[data-progress="repair"]'),
    pGrid:   firstEl("#pGrid", "#p3Val", '[data-progress="grid"]'),
    implNote: firstEl("#implNote", '[data-role="implNote"]'),

    // Theme toggle
    toggleTheme: firstEl("#toggleTheme", '[data-action="toggle-theme"]', 'button:has-text("Toggle theme")'),

    /* TRIVIA */
    triviaStreak: firstEl("#streak", '[data-role="triviaStreak"]'),
    triviaTarget: firstEl("#triviaTarget", '[data-role="triviaTarget"]'),
    triviaRemaining: firstEl("#remaining", '[data-role="triviaRemaining"]'),
    triviaCategory: firstEl("#category", '[data-role="triviaCategory"]'),
    triviaQuestion: firstEl("#question", '[data-role="triviaQuestion"]'),
    triviaAnswer: firstEl("#answer", '[data-role="triviaAnswer"]'),
    triviaSubmit: firstEl("#submitAnswer", '[data-action="trivia-submit"]'),
    triviaMsg: firstEl("#triviaMsg", '[data-role="triviaMsg"]'),

    /* NOTES */
    noteStreak: firstEl("#noteStreak", '[data-role="noteStreak"]'),
    noteTarget: firstEl("#noteTarget", '[data-role="noteTarget"]'),
    playNote: firstEl("#playNote", '[data-action="note-play"]'),
    replayNote: firstEl("#replayNote", '[data-action="note-replay"]'), // we will hide if exists
    noteInput: firstEl("#noteGuess", "#noteAnswer", '[data-role="noteInput"]'),
    noteSubmit: firstEl("#submitNote", '[data-action="note-submit"]'),
    noteMsg: firstEl("#noteMsg", '[data-role="noteMsg"]'),

    /* REPAIR */
    repairStreak: firstEl("#repairStreak", '[data-role="repairStreak"]'),
    repairTarget: firstEl("#repairTarget", '[data-role="repairTarget"]'),
    repairTimer: firstEl("#repairTimer", '[data-role="repairTimer"]'),
    repairTol: firstEl("#repairTol", '[data-role="repairTol"]'), // optional chip
    repairBroken: firstEl("#repairBroken", "#repairPrompt", '[data-role="repairBroken"]'),
    repairInput: firstEl("#repairInput", "#repairAnswer", '[data-role="repairInput"]'),
    repairSubmit: firstEl("#submitRepair", '[data-action="repair-submit"]'),
    repairNew: firstEl("#newRepair", '[data-action="repair-new"]'),
    repairMsg: firstEl("#repairMsg", '[data-role="repairMsg"]'),

    /* GRID */
    gridVisibility: firstEl("#gridVisibility", '[data-role="gridVisibility"]'),
    gridHint: firstEl("#gridHint", '[data-role="gridHint"]'),
    dirList: firstEl("#dirList", "#gridSteps", '[data-role="dirList"]'),
    gridBoardWrap: firstEl(".gridBoard", '[data-role="gridBoardWrap"]'),
    gridBoard: firstEl("#grid", "#gridBoard", '[data-role="gridBoard"]'),
    gridMsg: firstEl("#gridMsg", '[data-role="gridMsg"]'),
    gridStreak: firstEl("#gridStreak", '[data-role="gridStreak"]'),
    gridTarget: firstEl("#gridTarget", '[data-role="gridTarget"]'),
    regenGrid: firstEl("#regenGrid", "#resetGrid", '[data-action="grid-regen"]'),
    submitPath: firstEl("#submitPath", "#submitGrid", '[data-action="grid-submit"]'),

    /* REVEAL */
    fragA: firstEl("#fragA", "#fragmentA", '[data-role="fragA"]'),
    fragB: firstEl("#fragB", "#fragmentB", '[data-role="fragB"]'),
    decryptBtn: firstEl("#decryptPoemBtn", "#decryptBtn", '[data-action="decrypt"]'),
    poemText: firstEl("#poemText", '[data-role="poemText"]'),
    revealMsg: firstEl("#revealMsg", '[data-role="revealMsg"]'),
  };

  /* =========================
     STATE
  ========================= */
  const state = {
    gate: "trivia",
    idx: 0,
    cleared: new Set(),

    trivia: { streak: 0, retired: new Set(), current: null },
    notes:  { streak: 0, current: null, secretBuf: "" },
    repair: { streak: 0, current: null, deadlineTs: 0, timerId: null },
    grid:   {
      streak: 0,
      model: null,
      phase: "memo",           // memo -> play
      memoDeadlineTs: 0,
      memoTimerId: null,
      clicked: [],             // clicked cell sequence in play phase
    },

    poem: { json: null },

    theme: "dark",
  };

  /* =========================
     THEME (persist theme only)
  ========================= */
  function applyTheme(t) {
    state.theme = (t === "light") ? "light" : "dark";
    document.documentElement.dataset.theme = state.theme;
    // Some CSS uses color-scheme; keep in sync if present
    document.documentElement.style.colorScheme = state.theme;
    try { localStorage.setItem("ync_theme", state.theme); } catch {}
  }

  function initTheme() {
    let t = "dark";
    try {
      t = localStorage.getItem("ync_theme") || "dark";
    } catch {}
    applyTheme(t);
    if (ui.toggleTheme) {
      ui.toggleTheme.addEventListener("click", () => {
        applyTheme(state.theme === "dark" ? "light" : "dark");
      });
    }
  }

  /* =========================
     TABS / NAV (only active gate clickable)
  ========================= */
  function gateTabEl(g) {
    if (g === "trivia") return ui.tabTrivia;
    if (g === "notes")  return ui.tabNotes;
    if (g === "repair") return ui.tabRepair;
    if (g === "grid")   return ui.tabGrid;
    if (g === "reveal") return ui.tabReveal;
    return null;
  }

  function setTabState() {
    // Hide reveal tab if it exists
    if (ui.tabReveal) hide(ui.tabReveal);

    for (const g of GATES) {
      const el = gateTabEl(g);
      if (!el) continue;

      const isActive = (g === state.gate);
      const isCleared = state.cleared.has(g);
      const isFuture = (GATES.indexOf(g) > state.idx);

      // Rules:
      // - Only CURRENT ACTIVE gate is clickable.
      // - Completed gates are not clickable.
      // - Future gates are not clickable.
      const clickable = isActive && !isCleared && !isFuture;

      el.classList.toggle("active", isActive);
      el.classList.toggle("done", isCleared);
      el.classList.toggle("locked", !clickable);

      el.setAttribute("aria-current", isActive ? "page" : "false");
      el.setAttribute("aria-disabled", clickable ? "false" : "true");

      if ("disabled" in el) el.disabled = !clickable;

      // Ensure cursor/interaction is dead if locked (covers div tabs)
      el.style.pointerEvents = clickable ? "auto" : "none";
      el.style.opacity = clickable ? "" : "0.75";
    }
  }

  function wireTabs() {
    const map = [
      ["trivia", ui.tabTrivia],
      ["notes", ui.tabNotes],
      ["repair", ui.tabRepair],
      ["grid", ui.tabGrid],
    ];

    for (const [g, el] of map) {
      if (!el) continue;
      el.addEventListener("click", (e) => {
        e.preventDefault();
        // Only allow if it is the current active gate (setTabState enforces)
        if (g !== state.gate) return;
        setGate(g);
      });
    }
  }

  /* =========================
     STAGE SWITCHING + COPY
  ========================= */
  function showOnlyStage(g) {
    const stages = {
      trivia: ui.stageTrivia,
      notes: ui.stageNotes,
      repair: ui.stageRepair,
      grid: ui.stageGrid,
      reveal: ui.stageReveal,
    };
    for (const k of Object.keys(stages)) hide(stages[k]);
    show(stages[g]);
    document.body.dataset.stage = g;
  }

  function renderProgress() {
    // Side progress numbers
    const triviaTxt = `${state.trivia.streak} / ${TRIVIA.target}`;
    const notesTxt  = `${state.notes.streak} / ${NOTES.target}`;
    const repairTxt = `${state.repair.streak} / ${REPAIR.target}`;
    const gridTxt   = `${state.grid.streak} / 1`;

    setText(ui.pTrivia, triviaTxt);
    setText(ui.pNotes, notesTxt);
    setText(ui.pRepair, repairTxt);
    setText(ui.pGrid, gridTxt);

    // In-stage KPIs (if present)
    setText(ui.triviaStreak, String(state.trivia.streak));
    setText(ui.triviaTarget, String(TRIVIA.target));
    setText(ui.noteStreak, String(state.notes.streak));
    setText(ui.noteTarget, String(NOTES.target));
    setText(ui.repairStreak, String(state.repair.streak));
    setText(ui.repairTarget, String(REPAIR.target));
    setText(ui.gridStreak, String(state.grid.streak));
    setText(ui.gridTarget, "1");

    // Repair tolerance chip if present
    if (ui.repairTol) setText(ui.repairTol, `≤ ${REPAIR.tol} wrong chars`);
  }

  function setGate(g) {
    state.gate = g;
    setTabState();
    showOnlyStage(g);

    // Gate-specific panel header + sidebar note
    if (g === "trivia") {
      setText(ui.panelTitle, "Test — Trivia");
      setHTML(ui.panelDesc, `Answer <b>${TRIVIA.target}</b> correctly in a row. Miss resets streak.`);
      setText(ui.statusPill, "In progress");
      setText(ui.objective, `${TRIVIA.target} in a row`);
      setText(ui.objectiveDesc, "Answer each question. Submit is required.");
      if (ui.implNote) setText(ui.implNote, "Trivia: case-insensitive; minor spacing/punctuation tolerated. Backdoor exists.");
    } else if (g === "notes") {
      setText(ui.panelTitle, "Test — Music Notes");
      setHTML(ui.panelDesc, `Press “Play note”, then type the letter (A–G). Get <b>${NOTES.target}</b> in a row. Submit is required.`);
      setText(ui.statusPill, "In progress");
      setText(ui.objective, `${NOTES.target} in a row`);
      setText(ui.objectiveDesc, "Audio is single-octave A–G only. Keyboard never auto-submits.");
      if (ui.implNote) setText(ui.implNote, "Music Notes: WebAudio single octave; submit is mandatory; backdoor exists.");
    } else if (g === "repair") {
      setText(ui.panelTitle, "Test — Sentence Repair");
      setHTML(ui.panelDesc, `Fix the text. <b>2:30</b> limit. Get <b>${REPAIR.target}</b> wins in a row. Tolerance: ≤ <b>${REPAIR.tol}</b> wrong characters.`);
      setText(ui.statusPill, "In progress");
      setText(ui.objective, `${REPAIR.target} wins in a row`);
      setText(ui.objectiveDesc, "Keep the same numbering and line breaks. Submit is required.");
      if (ui.implNote) setText(ui.implNote, "Repair: strict format (line breaks + numbering). ≤ 5 wrong characters allowed. Backdoor exists.");
    } else if (g === "grid") {
      setText(ui.panelTitle, "Test — Grid Memory Path");
      setHTML(ui.panelDesc, `Memorize <b>${GRID.stepsN}</b> directions for <b>30 seconds</b> (grid hidden). Then directions disappear and you must click the full path and submit.`);
      setText(ui.statusPill, "In progress");
      setText(ui.objective, `1 correct`);
      setText(ui.objectiveDesc, "During memo phase: directions only. After 30s: click start, then each step, then submit.");
      if (ui.implNote) setText(ui.implNote, "Grid: directions visible 30s; grid hidden; then click full remembered path + submit. Backdoor exists.");
    }

    renderProgress();

    // Gate startup hooks
    if (g === "trivia") pickTrivia();
    if (g === "notes") newNoteRound(false);
    if (g === "repair") newRepairRound(true);
    if (g === "grid") newGridRound(true);
  }

  function completeGate(g) {
    state.cleared.add(g);
    state.idx = Math.min(state.idx + 1, GATES.length);

    // Immediately advance to next gate or reveal
    if (state.idx >= GATES.length) {
      enterReveal();
      return;
    }
    const next = GATES[state.idx];
    setGate(next);
  }

  function enterReveal() {
    state.gate = "reveal";
    showOnlyStage("reveal");
    document.body.classList.add("revealOnly");

    // Hide tabs + sidebar/progress entirely on reveal
    if (ui.tabsNav) hide(ui.tabsNav);
    if (ui.side) hide(ui.side);

    // Also hide any lingering “progress” blocks inside reveal layouts if they exist
    els('[data-role="progress"], .progress, #progress').forEach(hide);

    // Clean header copy: keep brand + toggle theme only (HTML controls layout; JS ensures content)
    setText(ui.panelTitle, "Access Granted");
    setText(ui.statusPill, "Unlocked");
    setText(ui.panelDesc, "");

    setMsg(ui.revealMsg, "All gates cleared. Enter fragmentA + fragmentB, then decrypt.", "good");

    // Focus first input if present
    if (ui.fragA) setTimeout(() => ui.fragA.focus(), 0);
  }

  /* =========================
     TRIVIA
  ========================= */
  function triviaRemaining() {
    if (!window.TRIVIA_BANK || !Array.isArray(window.TRIVIA_BANK)) return 0;
    return window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id)).length;
  }

  function shufflePick(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
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

  function pickTrivia() {
    if (!window.TRIVIA_BANK || !Array.isArray(window.TRIVIA_BANK) || window.TRIVIA_BANK.length < 10) {
      setText(ui.triviaQuestion, "Trivia bank missing or invalid.");
      setMsg(ui.triviaMsg, "Ensure trivia_bank.js loads before app.js.", "bad");
      return;
    }

    const pool = window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id));
    if (pool.length === 0) {
      setText(ui.triviaQuestion, "No trivia remaining in this session.");
      setMsg(ui.triviaMsg, "Reload to reset.", "warn");
      return;
    }

    const q = shufflePick(pool);
    state.trivia.current = q;

    setText(ui.triviaCategory, q.cat || "—");
    setText(ui.triviaQuestion, q.q || "—");
    if (ui.triviaAnswer) ui.triviaAnswer.value = "";
    setMsg(ui.triviaMsg, "", "");
    setText(ui.triviaRemaining, String(triviaRemaining()));
    setTimeout(() => ui.triviaAnswer?.focus?.(), 0);
  }

  function checkTrivia() {
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

    // retire on any attempt
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
     MUSIC NOTES (single octave, 7 fixed notes)
  ========================= */
  const NOTE_BANK = [
    { n: "C", f: 261.63 },
    { n: "D", f: 293.66 },
    { n: "E", f: 329.63 },
    { n: "F", f: 349.23 },
    { n: "G", f: 392.00 },
    { n: "A", f: 440.00 },
    { n: "B", f: 493.88 },
  ];

  const audio = { ctx: null, master: null };

  function ensureAudio() {
    if (audio.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.12;
    audio.master.connect(audio.ctx.destination);
  }

  function playTone(freq, ms = 650) {
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

  function newNoteRound(autoPlay = false) {
    state.notes.current = NOTE_BANK[Math.floor(Math.random() * NOTE_BANK.length)];
    state.notes.secretBuf = "";
    if (ui.noteInput) ui.noteInput.value = "";
    setMsg(ui.noteMsg, "Click Play note, then enter A–G and press Submit.", "warn");
    if (autoPlay) {
      try { playTone(state.notes.current.f, 650); } catch {}
    }
    setTimeout(() => ui.noteInput?.focus?.(), 0);
  }

  function checkNotes() {
    const raw = (ui.noteInput?.value || "").trim();

    // Backdoor for notes: "1324" typed and then Submit
    // Works even if the input is single-char by also tracking digits typed (secretBuf)
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
        setTimeout(() => newNoteRound(false), 240);
      }
      return;
    }

    state.notes.streak = 0;
    renderProgress();
    setMsg(ui.noteMsg, "Incorrect.", "bad");
    setTimeout(() => newNoteRound(false), 260);
  }

  /* =========================
     SENTENCE REPAIR (2:30, <=5 wrong chars)
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
    return (s || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .normalize("NFKC")
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"');
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
      setText(ui.repairTimer, `${mm}:${ss}`);

      if (left <= 0) {
        stopRepairTimer();
        state.repair.streak = 0;
        renderProgress();
        setMsg(ui.repairMsg, "Time expired. Streak reset.", "bad");
        setTimeout(() => newRepairRound(true), 450);
      }
    };
    state.repair.timerId = setInterval(tick, 200);
    tick();
  }

  function newRepairRound(showGuidance) {
    stopRepairTimer();
    const item = REPAIR_BANK[Math.floor(Math.random() * REPAIR_BANK.length)];
    state.repair.current = item;

    // Put broken text into the right element
    if (ui.repairBroken) {
      // Some HTML uses <pre>; some uses <div>. Use textContent always.
      ui.repairBroken.textContent = item.broken;
    }

    if (ui.repairInput) ui.repairInput.value = "";

    // Clear + guidance
    if (showGuidance) {
      setMsg(
        ui.repairMsg,
        "Format required: keep 4 lines, keep the same numbering (1)–(4), keep line breaks. Fix only the errors, then press Submit.",
        "warn"
      );
    } else {
      setMsg(ui.repairMsg, "", "");
    }

    state.repair.deadlineTs = Date.now() + REPAIR.ms;
    startRepairTimer();
    setTimeout(() => ui.repairInput?.focus?.(), 0);
  }

  function checkRepair() {
    const raw = ui.repairInput?.value || "";

    // Backdoor
    if (isBackdoor(raw)) {
      stopRepairTimer();
      state.repair.streak = REPAIR.target;
      renderProgress();
      setMsg(ui.repairMsg, "Accepted.", "good");
      completeGate("repair");
      return;
    }

    if (!state.repair.current) {
      setMsg(ui.repairMsg, "No prompt loaded.", "bad");
      return;
    }

    const left = state.repair.deadlineTs - Date.now();
    if (left <= 0) {
      setMsg(ui.repairMsg, "Time expired.", "bad");
      return;
    }

    const guess = canonRepair(raw);
    const truth = canonRepair(state.repair.current.fixed);

    // Character-level tolerance via edit distance on canonicalized strings.
    const dist = levenshteinRaw(guess, truth);
    const ok = (guess === truth) || (dist <= REPAIR.tol);

    if (ok) {
      stopRepairTimer();
      state.repair.streak += 1;
      renderProgress();
      setMsg(ui.repairMsg, `Correct. (distance ${dist} ≤ ${REPAIR.tol})`, "good");

      if (state.repair.streak >= REPAIR.target) {
        setTimeout(() => completeGate("repair"), 200);
      } else {
        setTimeout(() => newRepairRound(true), 220);
      }
      return;
    }

    stopRepairTimer();
    state.repair.streak = 0;
    renderProgress();
    setMsg(
      ui.repairMsg,
      `Incorrect (distance ${dist} > ${REPAIR.tol}). Keep 4 numbered lines with the same line breaks.`,
      "bad"
    );
    setTimeout(() => newRepairRound(true), 350);
  }

  /* =========================
     GRID (15 directions, hide grid for 30s, click full path)
  ========================= */
  function dirToText(d) {
    return d === "U" ? "Up" : d === "D" ? "Down" : d === "L" ? "Left" : d === "R" ? "Right" : d;
  }

  function makeGridModel() {
    const size = GRID.size;
    const stepsN = GRID.stepsN;

    // start near center-ish
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

      // avoid immediate undo when possible
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

    // Build the full path cells: start + each step position
    const path = [{ x: start.x, y: start.y }];
    let px = start.x, py = start.y;
    for (const d of steps) {
      if (d === "U") py -= 1;
      if (d === "D") py += 1;
      if (d === "L") px -= 1;
      if (d === "R") px += 1;
      path.push({ x: px, y: py });
    }

    return { size, start, steps, path };
  }

  function stopGridMemoTimer() {
    if (state.grid.memoTimerId) {
      clearInterval(state.grid.memoTimerId);
      state.grid.memoTimerId = null;
    }
  }

  function setGridPhase(phase) {
    state.grid.phase = phase;

    // “Memo” phase: show directions full width, hide entire grid area
    // “Play” phase: directions hidden, show grid full width
    const directionsEl = ui.dirList;
    const boardWrap = ui.gridBoardWrap || ui.gridBoard;

    if (phase === "memo") {
      if (directionsEl) {
        directionsEl.style.display = "";
        directionsEl.style.visibility = "visible";
      }
      if (boardWrap) {
        boardWrap.style.display = "none";
      }

      // Try to make left content fill space (common layouts use gridWrap)
      const gridWrap = firstEl(".gridWrap", '[data-role="gridWrap"]');
      if (gridWrap) {
        gridWrap.style.gridTemplateColumns = "1fr";
      }
    } else {
      if (directionsEl) {
        // Completely disappear after 30s (not just faded)
        directionsEl.style.display = "none";
        directionsEl.style.visibility = "hidden";
      }
      if (boardWrap) {
        boardWrap.style.display = "";
      }

      const gridWrap = firstEl(".gridWrap", '[data-role="gridWrap"]');
      if (gridWrap) {
        // Show board full width (directions are gone)
        gridWrap.style.gridTemplateColumns = "1fr";
      }
    }
  }

  function renderDirections(m) {
    if (!ui.dirList) return;
    // Fill the whole space: use a block list (works with your CSS)
    const html = m.steps
      .map((d, i) => `<div class="stepLine"><span class="mono">${String(i + 1).padStart(2, "0")}</span> ${dirToText(d)}</div>`)
      .join("");
    setHTML(ui.dirList, html);
  }

  function renderGridBoard(m) {
    if (!ui.gridBoard) return;

    ui.gridBoard.innerHTML = "";
    ui.gridBoard.style.setProperty("--n", String(m.size));

    // If CSS expects other var name
    ui.gridBoard.style.setProperty("--gridN", String(m.size));

    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "gridCell cell"; // support either class
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        cell.setAttribute("aria-label", `Cell ${x},${y}`);

        const isStart = (x === m.start.x && y === m.start.y);
        if (isStart) cell.classList.add("start");

        // Highlight clicked path in green-ish via existing "selected/chosen" styles
        const idx = state.grid.clicked.findIndex(p => p.x === x && p.y === y);
        if (idx >= 0) cell.classList.add("selected", "chosen");

        // Add start dot element if CSS uses it
        if (isStart) {
          const dot = document.createElement("div");
          dot.className = "dotStart";
          cell.appendChild(dot);
        }

        cell.addEventListener("click", () => {
          if (state.grid.phase !== "play") return;

          // Collect path clicks in order
          state.grid.clicked.push({ x, y });

          // Soft guidance
          const needed = (m.path.length);
          const have = state.grid.clicked.length;
          if (have < needed) {
            setMsg(ui.gridMsg, `Path step ${have}/${needed}. Keep clicking the path, then press Submit.`, "warn");
          } else if (have === needed) {
            setMsg(ui.gridMsg, "Path length complete. Press Submit.", "warn");
          } else {
            setMsg(ui.gridMsg, "Too many clicks. Press Regenerate to retry.", "bad");
          }

          renderGridBoard(m);
        });

        ui.gridBoard.appendChild(cell);
      }
    }
  }

  function startGridMemoCountdown() {
    stopGridMemoTimer();
    const tick = () => {
      const left = Math.max(0, state.grid.memoDeadlineTs - Date.now());
      const s = Math.ceil(left / 1000);
      const mm = String(Math.floor(s / 60)).padStart(1, "0");
      const ss = String(s % 60).padStart(2, "0");
      if (ui.gridVisibility) setText(ui.gridVisibility, `${mm}:${ss}`);

      if (left <= 0) {
        stopGridMemoTimer();
        // directions disappear; grid appears
        setGridPhase("play");
        setMsg(ui.gridMsg, "Directions hidden. Now click the full remembered path (start first), then press Submit.", "warn");
      }
    };
    state.grid.memoTimerId = setInterval(tick, 200);
    tick();
  }

  function newGridRound(resetMsg) {
    stopGridMemoTimer();
    state.grid.model = makeGridModel();
    state.grid.clicked = [];

    const m = state.grid.model;

    // Phase 1: memo
    setGridPhase("memo");
    renderDirections(m);

    // Grid board should exist but hidden initially; render now so it is ready
    renderGridBoard(m);

    // Messaging
    if (resetMsg) {
      setMsg(ui.gridMsg, "Memorize the 15 directions. Grid is hidden for 30 seconds.", "warn");
    } else {
      setMsg(ui.gridMsg, "Memorize the 15 directions. Grid is hidden for 30 seconds.", "warn");
    }

    state.grid.memoDeadlineTs = Date.now() + GRID.memoMs;
    startGridMemoCountdown();
  }

  function isGridBackdoorPattern(m, clicked) {
    // Secret click backdoor relative to START:
    // "third to the right second to the top, then the one down by 2, then the one to the right 4"
    //
    // Interpreted as three clicks (in order) relative to the start cell:
    //   p1 = start + ( +3, -2 )
    //   p2 = p1    + (  0, +2 )
    //   p3 = p2    + ( +4,  0 )
    //
    // You (the owner) can click exactly these 3 cells (then press Submit) to pass the grid gate.
    if (!m || !clicked || clicked.length !== 3) return false;

    const p1 = { x: m.start.x + 3, y: m.start.y - 2 };
    const p2 = { x: p1.x,          y: p1.y + 2 };
    const p3 = { x: p2.x + 4,      y: p2.y };

    // Ensure within bounds; if not, treat as not available for that round.
    const inb = (p) => p.x >= 0 && p.y >= 0 && p.x < m.size && p.y < m.size;
    if (![p1, p2, p3].every(inb)) return false;

    return (
      clicked[0].x === p1.x && clicked[0].y === p1.y &&
      clicked[1].x === p2.x && clicked[1].y === p2.y &&
      clicked[2].x === p3.x && clicked[2].y === p3.y
    );
  }

  function checkGridPath() {
    const m = state.grid.model;
    if (!m) {
      setMsg(ui.gridMsg, "No grid loaded.", "bad");
      return;
    }

    // Backdoor option 1: secret 3-click pattern (then Submit)
    if (isGridBackdoorPattern(m, state.grid.clicked)) {
      state.grid.streak = 1;
      renderProgress();
      setMsg(ui.gridMsg, "Accepted.", "good");
      completeGate("grid");
      return;
    }

    if (state.grid.phase !== "play") {
      setMsg(ui.gridMsg, "Wait until directions disappear, then click the path.", "bad");
      return;
    }

    const needed = m.path.length;
    const clicked = state.grid.clicked;

    if (clicked.length !== needed) {
      setMsg(ui.gridMsg, `Incorrect path length. Expected ${needed} clicks (start + ${GRID.stepsN} steps).`, "bad");
      state.grid.streak = 0;
      renderProgress();
      return;
    }

    // Exact sequence match
    for (let i = 0; i < needed; i++) {
      if (clicked[i].x !== m.path[i].x || clicked[i].y !== m.path[i].y) {
        setMsg(ui.gridMsg, `Incorrect path at step ${i + 1}. Regenerate and retry.`, "bad");
        state.grid.streak = 0;
        renderProgress();
        return;
      }
    }

    // Success
    state.grid.streak = 1;
    renderProgress();
    setMsg(ui.gridMsg, "Correct.", "good");
    setTimeout(() => completeGate("grid"), 180);
  }

  /* =========================
     POEM DECRYPT (unchanged)
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

  async function loadPoemJson() {
    try {
      const res = await fetch("./poem.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`poem.json HTTP ${res.status}`);
      state.poem.json = await res.json();
    } catch (e) {
      console.error(e);
      state.poem.json = null;
    }
  }

  async function tryDecrypt() {
    if (!state.poem.json) {
      setMsg(ui.revealMsg, "poem.json failed to load.", "bad");
      return;
    }
    const a = (ui.fragA?.value || "").trim().toLowerCase().replace(/\s+/g, "");
    const b = (ui.fragB?.value || "").trim().toLowerCase().replace(/\s+/g, "");
    const pass = `${a}${b}`;

    if (pass.length < 4) {
      setMsg(ui.revealMsg, "Enter fragmentA and fragmentB (lowercase, no spaces).", "warn");
      return;
    }

    try {
      const poem = await decryptPoemJson(pass, state.poem.json);
      if (ui.poemText) ui.poemText.textContent = poem;
      setMsg(ui.revealMsg, "Decryption successful.", "good");
    } catch (e) {
      console.error(e);
      if (ui.poemText) ui.poemText.textContent = "";
      const hint = state.poem.json?.hint ? ` ${state.poem.json.hint}` : "";
      setMsg(ui.revealMsg, `Decryption failed.${hint}`, "bad");
    }
  }

  /* =========================
     HARD RESET (always on load)
  ========================= */
  function hardResetSession() {
    // Stop timers
    stopRepairTimer();
    stopGridMemoTimer();

    // Reset gate progression
    state.idx = 0;
    state.cleared = new Set();
    state.gate = "trivia";

    // Reset per-gate state
    state.trivia.streak = 0;
    state.trivia.retired = new Set();
    state.trivia.current = null;

    state.notes.streak = 0;
    state.notes.current = null;
    state.notes.secretBuf = "";

    state.repair.streak = 0;
    state.repair.current = null;
    state.repair.deadlineTs = 0;

    state.grid.streak = 0;
    state.grid.model = null;
    state.grid.phase = "memo";
    state.grid.memoDeadlineTs = 0;
    state.grid.clicked = [];

    // Clear messages
    setMsg(ui.triviaMsg, "", "");
    setMsg(ui.noteMsg, "", "");
    setMsg(ui.repairMsg, "", "");
    setMsg(ui.gridMsg, "", "");
    setMsg(ui.revealMsg, "", "");

    // Inputs
    if (ui.triviaAnswer) ui.triviaAnswer.value = "";
    if (ui.noteInput) ui.noteInput.value = "";
    if (ui.repairInput) ui.repairInput.value = "";
    if (ui.fragA) ui.fragA.value = "";
    if (ui.fragB) ui.fragB.value = "";
    if (ui.poemText) ui.poemText.textContent = "";

    // Reveal layout reset
    document.body.classList.remove("revealOnly");
    if (ui.tabsNav) show(ui.tabsNav);
    if (ui.side) show(ui.side);

    // Hide replay button (explicit request)
    if (ui.replayNote) hide(ui.replayNote);

    // Ensure Reveal tab is gone
    if (ui.tabReveal) hide(ui.tabReveal);

    // Ensure we start on Trivia UI
    renderProgress();
    setGate("trivia");
  }

  /* =========================
     WIRING
  ========================= */
  function wireEvents() {
    // Trivia
    ui.triviaSubmit?.addEventListener("click", checkTrivia);
    ui.triviaAnswer?.addEventListener("keydown", (e) => {
      // Enter is fine, but still requires action; Enter triggers submit here
      if (e.key === "Enter") checkTrivia();
    });

    // Notes
    ui.playNote?.addEventListener("click", () => {
      if (!state.notes.current) newNoteRound(false);
      try {
        playTone(state.notes.current.f, 650);
        setMsg(ui.noteMsg, "Played. Enter A–G, then press Submit.", "warn");
        ui.noteInput?.focus?.();
      } catch (e) {
        console.error(e);
        setMsg(ui.noteMsg, "Audio blocked. Click Play note again.", "bad");
      }
    });

    // Explicitly remove replay usage
    if (ui.replayNote) {
      hide(ui.replayNote);
      ui.replayNote.replaceWith(ui.replayNote.cloneNode(true)); // detach any old listeners
    }

    // Capture digits for secret buffer (so 1324 works even if input is 1 char)
    ui.noteInput?.addEventListener("keydown", (e) => {
      // Never auto-submit; do nothing on Enter.
      if (e.key === "Enter") {
        e.preventDefault();
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        state.notes.secretBuf = (state.notes.secretBuf + e.key).slice(-4);
      } else if (!/^[A-Ga-g]$/.test(e.key)) {
        // If user types other stuff, don't reset; just ignore.
      }
    });

    ui.noteSubmit?.addEventListener("click", checkNotes);

    // Repair
    ui.repairSubmit?.addEventListener("click", checkRepair);
    ui.repairNew?.addEventListener("click", () => newRepairRound(true));
    ui.repairInput?.addEventListener("keydown", (e) => {
      // Ctrl/Cmd+Enter submits (optional)
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        checkRepair();
      }
    });

    // Grid
    ui.regenGrid?.addEventListener("click", () => newGridRound(true));
    ui.submitPath?.addEventListener("click", checkGridPath);

    // Reveal decrypt
    ui.decryptBtn?.addEventListener("click", tryDecrypt);
    ui.fragB?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") tryDecrypt();
    });
  }

  /* =========================
     INIT
  ========================= */
  async function init() {
    initTheme();
    wireTabs();
    wireEvents();
    await loadPoemJson();

    // Always hard reset on every load
    hardResetSession();
  }

  window.addEventListener("load", init);
})();
