/* app.js — Your Next Clue (hardened)
   Goals:
   - Works even if index.html IDs differ (supports your older + newer variants).
   - Reload ALWAYS resets progress + returns to Trivia (theme persists).
   - Tabs switch stages (Reveal tab hidden/ignored if present).
   - Sentence Repair: 2:30 timer, tolerance <= 5 wrong characters, clearer format expectations.
   - Music Notes: single octave, only 7 notes; backdoor accepts 1324 (not shown to players).
   - Grid: 15 directions shown for 30s with ticking clock; directions fully disappear; user must click the FULL path then submit.
   - Backdoor 1324 exists for EVERY gate:
       Trivia: type 1324 and Submit
       Music Notes: submit 1, then 3, then 2, then 4 (or submit 1324 once)
       Repair: type 1324 and Submit
       Grid: secret click-path override (described below) OR (optional) type 1324 if you add a grid input in HTML
       Reveal: entering 1324 in either fragment box grants access (shows "Override accepted" + skips decrypt)

   Grid backdoor (hidden, no UI hint):
     From the BLUE start dot:
       click cell ( +3 right, -2 up ),
       then click cell ( +3 right,  0 net )  i.e., down by 2 from previous,
       then click cell ( +7 right,  0 net )  i.e., right by 4 from previous,
     then Submit Path.
*/

(() => {
  "use strict";

  /* =========================
     DOM UTIL (robust)
  ========================= */
  const $ = (id) => document.getElementById(id);
  const gid = (...ids) => {
    for (const id of ids) {
      const el = $(id);
      if (el) return el;
    }
    return null;
  };
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function on(el, evt, fn, opts) {
    if (!el) return;
    el.addEventListener(evt, fn, opts);
  }

  function setText(el, txt) {
    if (!el) return;
    el.textContent = txt ?? "";
  }

  function setHTML(el, html) {
    if (!el) return;
    el.innerHTML = html ?? "";
  }

  function show(el, yes) {
    if (!el) return;
    el.style.display = yes ? "" : "none";
  }

  function setMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "msg" + (kind ? (" " + kind) : "");
  }

  /* =========================
     NORMALIZATION / DISTANCE
  ========================= */
  const OVERRIDE_CODE = "1324";

  function normSimple(s) {
    return (s || "")
      .toLowerCase()
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, "");
  }

  function isOverride(raw) {
    return normSimple(raw) === OVERRIDE_CODE;
  }

  // More conservative for repair comparisons: keep punctuation mostly intact,
  // normalize quotes + line endings + trailing spaces.
  function canonRepair(s) {
    const lines = (s || "")
      .replace(/\r\n/g, "\n")
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .split("\n")
      .map((ln) => ln.replace(/[ \t]+/g, " ").replace(/[ \t]+$/g, ""));
    // preserve line breaks; trim only outer whitespace
    return lines.join("\n").trim();
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

  /* Trivia matching helpers (your original idea kept) */
  function normTrivia(s) {
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

  function typoOk(guess, truth) {
    const g = normTrivia(guess);
    const t = normTrivia(truth);
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
    const g = normTrivia(guess);
    if (!g) return false;

    for (const t of truths) {
      if (!t) continue;
      const tn = normTrivia(t);
      if (g === tn) return true;
      if (g.length >= 3 && tn.length >= 3 && (tn.includes(g) || g.includes(tn))) return true;
      if (typoOk(g, tn)) return true;
    }
    return false;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* =========================
     UI BINDINGS (supports both ID sets)
  ========================= */
  const ui = {
    // Header/brand
    panelTitle: gid("panelTitle"),
    panelDesc: gid("panelDesc"),
    statusPill: gid("statusPill"),
    toggleTheme: gid("toggleTheme", "themeToggle", "toggle", "themeBtn"),

    // Nav tabs / steps (multiple variants)
    nav: gid("stepsNav", "tabsNav", "navTabs"),
    stepTrivia: gid("stepTrivia", "tabTrivia", "step0"),
    stepNote: gid("stepNote", "tabNote", "tabNotes", "tabMusic", "step1"),
    stepRepair: gid("stepRepair", "tabRepair", "step2"),
    stepGrid: gid("stepGrid", "tabGrid", "step3"),
    stepReveal: gid("stepReveal", "tabReveal", "step4"),

    // Stages containers
    stageTrivia: gid("stageTrivia"),
    stageNote: gid("stageNote", "stageNotes", "stageMusic", "stageMusicNotes"),
    stageRepair: gid("stageRepair"),
    stageGrid: gid("stageGrid"),
    stageReveal: gid("stageReveal"),

    // Sidebar / progress blocks (multiple variants)
    side: gid("side", "sidebar"),
    objective: gid("objective"),
    objectiveDesc: gid("objectiveDesc"),
    implNote: gid("implNote", "implementationNote"),
    pTrivia: gid("pTrivia", "p0Val"),
    pNote: gid("pNote", "p1Val"),
    pRepair: gid("pRepair", "p2Val"),
    pGrid: gid("pGrid", "p3Val"),

    // Controls
    resetProgress: gid("resetProgress", "resetBtn"),

    // Trivia
    streak: gid("streak"),
    triviaTarget: gid("triviaTarget"),
    remaining: gid("remaining"),
    category: gid("category"),
    question: gid("question"),
    answer: gid("answer"),
    submitAnswer: gid("submitAnswer"),
    triviaMsg: gid("triviaMsg"),

    // Notes
    noteStreak: gid("noteStreak"),
    noteTarget: gid("noteTarget"),
    playNote: gid("playNote"),
    noteAnswer: gid("noteAnswer", "noteGuess"),
    submitNote: gid("submitNote"),
    noteMsg: gid("noteMsg"),

    // Repair
    repairStreak: gid("repairStreak"),
    repairTarget: gid("repairTarget"),
    repairTimer: gid("repairTimer"),
    repairPrompt: gid("repairPrompt", "repairBroken"),
    repairAnswer: gid("repairAnswer", "repairInput"),
    submitRepair: gid("submitRepair"),
    repairMsg: gid("repairMsg"),

    // Grid (supports old + new)
    gridStreak: gid("gridStreak"),
    gridTarget: gid("gridTarget"),
    gridSteps: gid("gridSteps", "dirList"),
    gridBoard: gid("gridBoard", "grid"),
    gridMsg: gid("gridMsg"),
    resetGrid: gid("resetGrid", "regenGrid", "regen", "regenBtn"),
    submitGrid: gid("submitGrid", "gridSubmit"),

    // Grid timers (optional IDs; we’ll populate if present)
    gridVisLabel: gid("gridVisLabel", "gridVisibilityLabel"),
    gridVisValue: gid("gridVisValue", "gridVisibilityValue", "gridClock", "gridTimer"),

    // Reveal
    poemText: gid("poemText"),
    revealMsg: gid("revealMsg"),
    fragA: gid("fragA"),
    fragB: gid("fragB"),
    decryptPoemBtn: gid("decryptPoemBtn"),
  };

  function hasCoreUI() {
    // We avoid "fail fast" now; we degrade gracefully.
    return !!(ui.stageTrivia && ui.stageRepair && ui.stageGrid);
  }

  /* =========================
     THEME (persist)
  ========================= */
  const THEME_KEY = "ync_theme";

  function applyTheme(theme) {
    // Your CSS can key off body[data-theme="light"|"dark"]
    document.body.dataset.theme = theme;
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    applyTheme(saved === "light" ? "light" : "dark");
    on(ui.toggleTheme, "click", () => {
      const cur = document.body.dataset.theme === "light" ? "light" : "dark";
      const next = cur === "light" ? "dark" : "light";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }

  /* =========================
     APP STATE
  ========================= */
  const STAGES = ["trivia", "note", "repair", "grid"]; // reveal is implicit final
  const state = {
    stage: "trivia",
    order: [...STAGES], // keep stable order; users can click tabs anyway
    cleared: new Set(),

    trivia: { target: 15, streak: 0, retired: new Set(), current: null },
    note: { target: 5, streak: 0, current: null, backdoorProgress: 0 }, // 1324 sequence
    repair: { target: 3, streak: 0, current: null, deadlineTs: 0, timerId: null, secs: 150, tol: 5 },
    grid: {
      target: 1,
      streak: 0,
      model: null,
      visSecs: 30,
      visDeadlineTs: 0,
      visTimerId: null,
      chosenPath: [], // list of {x,y}
    },

    poem: { json: null },
  };

  function renderSide() {
    // Sidebar progress values (support multiple layouts)
    if (ui.pTrivia) setText(ui.pTrivia, `${state.trivia.streak} / ${state.trivia.target}`);
    if (ui.pNote) setText(ui.pNote, `${state.note.streak} / ${state.note.target}`);
    if (ui.pRepair) setText(ui.pRepair, `${state.repair.streak} / ${state.repair.target}`);
    if (ui.pGrid) setText(ui.pGrid, `${state.grid.streak} / ${state.grid.target}`);

    // Optional pill status
    if (ui.statusPill) {
      if (state.stage === "reveal") setText(ui.statusPill, "Unlocked");
      else setText(ui.statusPill, state.cleared.has(state.stage) ? "Cleared" : "In progress");
    }
  }

  function setPanelCopy(stage) {
    if (!ui.panelTitle || !ui.panelDesc) return;

    if (stage === "trivia") {
      setText(ui.panelTitle, "Test — Trivia");
      setHTML(ui.panelDesc, `Get <b>${state.trivia.target}</b> correct in a row. Miss resets streak.`);
      if (ui.objective) setText(ui.objective, `${state.trivia.target} in a row`);
      if (ui.objectiveDesc) setText(ui.objectiveDesc, "Answer carefully. Minor spacing/punctuation is tolerated.");
      if (ui.implNote) setText(ui.implNote, "Trivia answers are case-insensitive; minor typos are tolerated.");
      return;
    }

    if (stage === "note") {
      setText(ui.panelTitle, "Test — Music Notes");
      setHTML(ui.panelDesc, `Listen to a note and type <b>A–G</b>. Get <b>${state.note.target}</b> in a row.`);
      if (ui.objective) setText(ui.objective, `${state.note.target} in a row`);
      if (ui.objectiveDesc) setText(ui.objectiveDesc, "Single octave only. Submission is mandatory.");
      if (ui.implNote) setText(ui.implNote, "Audio requires a user click at least once due to browser policy.");
      return;
    }

    if (stage === "repair") {
      setText(ui.panelTitle, "Test — Sentence Repair");
      setHTML(
        ui.panelDesc,
        `Fix the text. <b>2:30</b> time limit. Get <b>${state.repair.target}</b> wins in a row. Tolerance: ≤ <b>${state.repair.tol}</b> character errors.`
      );
      if (ui.objective) setText(ui.objective, `${state.repair.target} wins in a row`);
      if (ui.objectiveDesc) setText(
        ui.objectiveDesc,
        "Keep the same numbering and line breaks. Minor fat-finger mistakes are tolerated."
      );
      if (ui.implNote) setText(ui.implNote, "Comparison is character-level after quote/whitespace normalization.");
      return;
    }

    if (stage === "grid") {
      setText(ui.panelTitle, "Test — Grid Memory Path");
      setHTML(
        ui.panelDesc,
        `Memorize <b>15</b> directions. They hide after <b>${state.grid.visSecs}s</b>. Then click the full path and submit.`
      );
      if (ui.objective) setText(ui.objective, `${state.grid.target} correct`);
      if (ui.objectiveDesc) setText(ui.objectiveDesc, "Directions vanish. You must reconstruct the entire path from memory.");
      if (ui.implNote) setText(ui.implNote, "Directions hide after 30 seconds. Click the full remembered path, then submit.");
      return;
    }

    if (stage === "reveal") {
      setText(ui.panelTitle, "Access Granted");
      setText(ui.panelDesc, "");
      if (ui.objective) setText(ui.objective, "");
      if (ui.objectiveDesc) setText(ui.objectiveDesc, "");
      if (ui.implNote) setText(ui.implNote, "");
      return;
    }
  }

  function setStage(stage) {
    state.stage = stage;
    document.body.dataset.stage = stage;

    // Stage show/hide
    const mapStageEl = {
      trivia: ui.stageTrivia,
      note: ui.stageNote,
      repair: ui.stageRepair,
      grid: ui.stageGrid,
      reveal: ui.stageReveal,
    };

    for (const k of Object.keys(mapStageEl)) {
      const el = mapStageEl[k];
      if (!el) continue;
      el.classList.toggle("show", k === stage);
      // support older CSS: show class only; stage display is CSS
      if (k === stage) el.style.display = "";
      else el.style.display = "none";
    }

    // Nav styling + click behavior
    const navItems = [
      { k: "trivia", el: ui.stepTrivia },
      { k: "note", el: ui.stepNote },
      { k: "repair", el: ui.stepRepair },
      { k: "grid", el: ui.stepGrid },
    ];

    for (const it of navItems) {
      if (!it.el) continue;
      it.el.classList.remove("active", "done");
      if (it.k === stage) it.el.classList.add("active");
      if (state.cleared.has(it.k)) it.el.classList.add("done");
    }

    // Hide reveal tab if it exists (per your instruction)
    if (ui.stepReveal) show(ui.stepReveal, false);

    // Reveal mode: hide progress + tabs (but keep brand + theme toggle)
    const inReveal = stage === "reveal";
    if (ui.side) show(ui.side, !inReveal);
    if (ui.nav) show(ui.nav, !inReveal);
    // If tabs container isn't captured by ui.nav, hide common wrappers
    const possibleNavWrappers = [
      gid("stepsNav", "tabsNav", "navTabs"),
      q(".steps"),
      q(".tabs"),
    ].filter(Boolean);
    for (const w of possibleNavWrappers) show(w, !inReveal);

    setPanelCopy(stage);
    renderSide();

    // Stage-specific autofocus
    if (stage === "trivia" && ui.answer) setTimeout(() => ui.answer.focus(), 0);
    if (stage === "note" && ui.noteAnswer) setTimeout(() => ui.noteAnswer.focus(), 0);
    if (stage === "repair" && ui.repairAnswer) setTimeout(() => ui.repairAnswer.focus(), 0);
  }

  function maybeUnlockReveal() {
    const allCleared = STAGES.every((k) => state.cleared.has(k));
    if (allCleared) {
      setStage("reveal");
      if (ui.revealMsg) setMsg(ui.revealMsg, "All gates cleared. Enter fragments to decrypt.", "good");
      return true;
    }
    return false;
  }

  function markCleared(stageKey) {
    state.cleared.add(stageKey);
    renderSide();
    if (!maybeUnlockReveal()) {
      // Keep user where they are; they can click tabs.
      // Auto-advance to next uncleared stage (optional).
      const next = STAGES.find((k) => !state.cleared.has(k));
      if (next) setStage(next);
    }
  }

  /* =========================
     TRIVIA
  ========================= */
  function triviaRemaining() {
    const bank = window.TRIVIA_BANK;
    if (!Array.isArray(bank)) return 0;
    return bank.filter((q) => !state.trivia.retired.has(q.id)).length;
  }

  function pickTrivia() {
    const bank = window.TRIVIA_BANK;
    if (!Array.isArray(bank) || bank.length < 10) {
      if (ui.question) setText(ui.question, "Trivia bank missing or invalid.");
      setMsg(ui.triviaMsg, "Ensure trivia_bank.js is loaded before app.js.", "bad");
      return;
    }

    const pool = bank.filter((q) => !state.trivia.retired.has(q.id));
    if (pool.length === 0) {
      if (ui.question) setText(ui.question, "No trivia remaining in this session.");
      setMsg(ui.triviaMsg, "Reload to reset remaining.", "warn");
      return;
    }

    const qx = pool[Math.floor(Math.random() * pool.length)];
    state.trivia.current = qx;

    if (ui.category) setText(ui.category, qx.cat);
    if (ui.question) setText(ui.question, qx.q);
    if (ui.answer) ui.answer.value = "";
    setMsg(ui.triviaMsg, "", "");
    if (ui.remaining) setText(ui.remaining, String(triviaRemaining()));
    setTimeout(() => ui.answer?.focus?.(), 0);
  }

  function checkTriviaAnswer() {
    const raw = ui.answer?.value ?? "";
    if (isOverride(raw)) {
      state.trivia.streak = state.trivia.target;
      if (ui.streak) setText(ui.streak, String(state.trivia.streak));
      setMsg(ui.triviaMsg, "Override accepted.", "good");
      markCleared("trivia");
      return;
    }

    const qx = state.trivia.current;
    if (!qx) return;

    const guess = normTrivia(raw);
    if (!guess) {
      setMsg(ui.triviaMsg, "Enter an answer.", "bad");
      return;
    }

    // retire on any attempt
    state.trivia.retired.add(qx.id);
    if (ui.remaining) setText(ui.remaining, String(triviaRemaining()));

    const truths = [qx.a, ...(qx.alts || [])];
    const ok = matchesAny(raw, truths);

    if (ok) {
      state.trivia.streak += 1;
      if (ui.streak) setText(ui.streak, String(state.trivia.streak));
      setMsg(ui.triviaMsg, "Correct.", "good");
      renderSide();

      if (state.trivia.streak >= state.trivia.target) {
        setMsg(ui.triviaMsg, "Gate cleared.", "good");
        markCleared("trivia");
        return;
      }
      setTimeout(pickTrivia, 250);
      return;
    }

    state.trivia.streak = 0;
    if (ui.streak) setText(ui.streak, "0");
    renderSide();
    setMsg(ui.triviaMsg, `Incorrect. Answer: ${qx.a}`, "bad");
    setTimeout(pickTrivia, 450);
  }

  /* =========================
     MUSIC NOTES (single octave)
  ========================= */
  const NOTE_BANK = [
    { n: "C", f: 261.63 },
    { n: "D", f: 293.66 },
    { n: "E", f: 329.63 },
    { n: "F", f: 349.23 },
    { n: "G", f: 392.0 },
    { n: "A", f: 440.0 },
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

  function newNoteRound(autoPlay = false) {
    state.note.current = NOTE_BANK[Math.floor(Math.random() * NOTE_BANK.length)];
    if (ui.noteAnswer) ui.noteAnswer.value = "";
    setMsg(ui.noteMsg, "Click Play, then type A–G, then press Submit.", "warn");
    if (autoPlay) {
      try { playTone(state.note.current.f, 750); } catch {}
    }
    setTimeout(() => ui.noteAnswer?.focus?.(), 0);
  }

  function noteBackdoorProgressReset() {
    state.note.backdoorProgress = 0;
  }

  function checkNoteAnswer() {
    const raw = (ui.noteAnswer?.value ?? "").trim();

    // Backdoor path: accept "1324" either in one shot, or as 1->3->2->4 across submits.
    if (isOverride(raw)) {
      state.note.streak = state.note.target;
      if (ui.noteStreak) setText(ui.noteStreak, String(state.note.streak));
      setMsg(ui.noteMsg, "Override accepted.", "good");
      renderSide();
      markCleared("note");
      return;
    }

    const digits = raw.replace(/[^0-9]/g, "");
    if (digits.length === 1) {
      const seq = OVERRIDE_CODE;
      const expected = seq[state.note.backdoorProgress];
      if (digits === expected) {
        state.note.backdoorProgress += 1;
        // do NOT reveal progress
        if (state.note.backdoorProgress >= seq.length) {
          state.note.streak = state.note.target;
          if (ui.noteStreak) setText(ui.noteStreak, String(state.note.streak));
          setMsg(ui.noteMsg, "Override accepted.", "good");
          renderSide();
          markCleared("note");
          return;
        }
        // Continue; don't penalize; load next note silently
        if (ui.noteAnswer) ui.noteAnswer.value = "";
        setMsg(ui.noteMsg, "Recorded.", "warn");
        return;
      } else {
        // wrong digit: reset backdoor attempt
        noteBackdoorProgressReset();
      }
    } else if (digits.length > 1) {
      // If user typed multiple digits not exactly 1324, reset the sequence attempt.
      noteBackdoorProgressReset();
    }

    if (!state.note.current) {
      setMsg(ui.noteMsg, "No note loaded. Click Play.", "bad");
      return;
    }

    const g = raw.toUpperCase().replace(/[^A-G]/g, "").slice(0, 1);
    if (!g) {
      setMsg(ui.noteMsg, "Enter a single letter A–G, then press Submit.", "bad");
      return;
    }

    const ok = g === state.note.current.n;
    if (ok) {
      state.note.streak += 1;
      if (ui.noteStreak) setText(ui.noteStreak, String(state.note.streak));
      renderSide();
      setMsg(ui.noteMsg, "Correct.", "good");

      if (state.note.streak >= state.note.target) {
        setMsg(ui.noteMsg, "Gate cleared.", "good");
        markCleared("note");
        return;
      }

      setTimeout(() => newNoteRound(false), 250);
      return;
    }

    state.note.streak = 0;
    if (ui.noteStreak) setText(ui.noteStreak, "0");
    renderSide();
    setMsg(ui.noteMsg, "Incorrect. Streak reset.", "bad");
    setTimeout(() => newNoteRound(false), 300);
  }

  /* =========================
     SENTENCE REPAIR (2:30, tolerance <= 5 chars)
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
      const mm = String(Math.floor(s / 60));
      const ss = String(s % 60).padStart(2, "0");
      if (ui.repairTimer) setText(ui.repairTimer, `${mm}:${ss}`);
      if (left <= 0) {
        stopRepairTimer();
        state.repair.streak = 0;
        if (ui.repairStreak) setText(ui.repairStreak, "0");
        renderSide();
        setMsg(ui.repairMsg, "Time expired. Streak reset.", "bad");
        setTimeout(() => newRepairRound(true), 450);
      }
    };
    state.repair.timerId = setInterval(tick, 200);
    tick();
  }

  function newRepairRound(resetMsg = false) {
    stopRepairTimer();
    const item = REPAIR_BANK[Math.floor(Math.random() * REPAIR_BANK.length)];
    state.repair.current = item;

    if (ui.repairPrompt) setText(ui.repairPrompt, item.broken);
    if (ui.repairAnswer) ui.repairAnswer.value = "";
    if (ui.repairTarget) setText(ui.repairTarget, String(state.repair.target));

    // clearer instruction, not "iffy"
    const formatHint =
      "Format required: keep exactly 4 lines, numbered 1) .. 4), with the same line breaks. Then press Submit.";
    setMsg(ui.repairMsg, resetMsg ? formatHint : "", resetMsg ? "warn" : "");

    state.repair.deadlineTs = Date.now() + state.repair.secs * 1000; // 2:30
    startRepairTimer();
    setTimeout(() => ui.repairAnswer?.focus?.(), 0);
  }

  function looksLikeRepairFormat(s) {
    const t = canonRepair(s);
    const lines = t.split("\n");
    if (lines.length < 4) return false;
    // Only require that the first 4 non-empty lines begin with 1) 2) 3) 4)
    const nonEmpty = lines.filter((ln) => ln.trim().length > 0);
    if (nonEmpty.length < 4) return false;
    const req = ["1)", "2)", "3)", "4)"];
    for (let i = 0; i < 4; i++) {
      if (!nonEmpty[i].trim().startsWith(req[i])) return false;
    }
    return true;
  }

  function checkRepairAnswer() {
    const raw = ui.repairAnswer?.value ?? "";

    if (isOverride(raw)) {
      stopRepairTimer();
      state.repair.streak = state.repair.target;
      if (ui.repairStreak) setText(ui.repairStreak, String(state.repair.streak));
      renderSide();
      setMsg(ui.repairMsg, "Override accepted.", "good");
      markCleared("repair");
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

    if (!looksLikeRepairFormat(raw)) {
      setMsg(
        ui.repairMsg,
        "Invalid format. Keep 4 lines with numbering 1) 2) 3) 4) and the same line breaks.",
        "bad"
      );
      return;
    }

    const guess = canonRepair(raw);
    const truth = canonRepair(state.repair.current.fixed);

    const dist = levenshteinRaw(guess, truth);
    const ok = dist <= state.repair.tol;

    if (ok) {
      stopRepairTimer();
      state.repair.streak += 1;
      if (ui.repairStreak) setText(ui.repairStreak, String(state.repair.streak));
      renderSide();
      setMsg(ui.repairMsg, `Correct (distance ${dist} ≤ ${state.repair.tol}).`, "good");

      if (state.repair.streak >= state.repair.target) {
        setMsg(ui.repairMsg, "Gate cleared.", "good");
        markCleared("repair");
        return;
      }

      setTimeout(() => newRepairRound(true), 250);
      return;
    }

    stopRepairTimer();
    state.repair.streak = 0;
    if (ui.repairStreak) setText(ui.repairStreak, "0");
    renderSide();
    setMsg(ui.repairMsg, `Incorrect (distance ${dist} > ${state.repair.tol}). Streak reset.`, "bad");
    setTimeout(() => newRepairRound(true), 350);
  }

  /* =========================
     GRID (15 directions, visible 30s, click full path + submit)
  ========================= */
  function makeGridModel() {
    const size = 9;        // 9x9 intersections
    const stepsN = 15;     // 15 directions
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

      // reduce immediate undo
      const prev = steps[i - 1];
      const filtered = options.filter((d) => {
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

    const pathPoints = [];
    // path includes the start plus each step endpoint
    let px = start.x, py = start.y;
    pathPoints.push({ x: px, y: py });
    for (const d of steps) {
      if (d === "U") py -= 1;
      if (d === "D") py += 1;
      if (d === "L") px -= 1;
      if (d === "R") px += 1;
      pathPoints.push({ x: px, y: py });
    }

    return { size, start, steps, pathPoints };
  }

  function dirToText(d) {
    if (d === "U") return "Up";
    if (d === "D") return "Down";
    if (d === "L") return "Left";
    if (d === "R") return "Right";
    return d;
  }

  function stopGridVisTimer() {
    if (state.grid.visTimerId) {
      clearInterval(state.grid.visTimerId);
      state.grid.visTimerId = null;
    }
  }

  function renderGridDirections(visible) {
    const m = state.grid.model;
    if (!ui.gridSteps || !m) return;

    if (!visible) {
      setHTML(ui.gridSteps, "");
      ui.gridSteps.classList.add("hidden");
      return;
    }

    ui.gridSteps.classList.remove("hidden");
    // Full-space list: keep it simple; CSS can handle scroll.
    const html = m.steps
      .map((d, i) => {
        const n = String(i + 1).padStart(2, "0");
        return `<div class="stepLine"><span class="mono">${n}</span> ${dirToText(d)}</div>`;
      })
      .join("");
    setHTML(ui.gridSteps, html);
  }

  function renderGridBoard() {
    const m = state.grid.model;
    if (!ui.gridBoard || !m) return;

    // Support two CSS models:
    // - your older one expects buttons with class "gridCell"
    // - your older CSS expects ".cell" in ".board"
    ui.gridBoard.innerHTML = "";
    ui.gridBoard.style.setProperty("--n", String(m.size));
    ui.gridBoard.style.setProperty("--gridN", String(m.size));

    // chosenPath highlights
    const chosenSet = new Set(state.grid.chosenPath.map((p) => `${p.x},${p.y}`));
    const startKey = `${m.start.x},${m.start.y}`;

    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        const btn = document.createElement("button");
        btn.type = "button";

        // Try to match whatever CSS you currently have
        btn.className = "gridCell cell";
        btn.dataset.x = String(x);
        btn.dataset.y = String(y);
        btn.setAttribute("aria-label", `Intersection ${x},${y}`);

        const key = `${x},${y}`;
        if (key === startKey) btn.classList.add("start");
        if (chosenSet.has(key)) btn.classList.add("chosen", "selected");

        // Draw the dot on start
        if (key === startKey) {
          const dot = document.createElement("div");
          dot.className = "dotStart";
          btn.appendChild(dot);
        }

        on(btn, "click", () => {
          // Append path clicks until length = pathPoints length
          if (!state.grid.model) return;
          if (state.grid.chosenPath.length >= state.grid.model.pathPoints.length) return;

          // Allow re-clicking last selected to "unselect last" (quality-of-life)
          const last = state.grid.chosenPath[state.grid.chosenPath.length - 1];
          if (last && last.x === x && last.y === y) {
            state.grid.chosenPath.pop();
            renderGridBoard();
            setMsg(ui.gridMsg, "Last step removed.", "warn");
            return;
          }

          state.grid.chosenPath.push({ x, y });
          renderGridBoard();

          const need = state.grid.model.pathPoints.length;
          const have = state.grid.chosenPath.length;
          setMsg(ui.gridMsg, `Path recorded (${have}/${need}). Press Submit when done.`, "warn");
        });

        ui.gridBoard.appendChild(btn);
      }
    }
  }

  function startGridVisibilityTimer() {
    stopGridVisTimer();

    state.grid.visDeadlineTs = Date.now() + state.grid.visSecs * 1000;
    renderGridDirections(true);

    const tick = () => {
      const leftMs = state.grid.visDeadlineTs - Date.now();
      const left = Math.max(0, Math.ceil(leftMs / 1000));

      // Optional "Visibility" clock UI if present; otherwise use gridMsg
      if (ui.gridVisValue) setText(ui.gridVisValue, `0:${String(left).padStart(2, "0")}`);
      if (ui.gridVisLabel) setText(ui.gridVisLabel, "Visibility");

      if (left <= 0) {
        stopGridVisTimer();
        renderGridDirections(false);
        setMsg(ui.gridMsg, "Directions hidden. Reconstruct the full path from memory, then submit.", "warn");
      }
    };

    state.grid.visTimerId = setInterval(tick, 200);
    tick();
  }

  function newGridRound(resetMsg = false) {
    stopGridVisTimer();
    state.grid.model = makeGridModel();
    state.grid.chosenPath = [];

    // Reset/labels
    if (ui.gridTarget) setText(ui.gridTarget, String(state.grid.target));
    if (ui.gridStreak) setText(ui.gridStreak, String(state.grid.streak));

    renderGridBoard();

    // Show directions for 30s, then hide
    startGridVisibilityTimer();

    setMsg(
      ui.gridMsg,
      resetMsg
        ? "Memorize the 15 directions. They will disappear in 30 seconds."
        : "Memorize the 15 directions. They will disappear in 30 seconds.",
      "warn"
    );
  }

  function pathEquals(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
    }
    return true;
  }

  function gridBackdoorHit() {
    const m = state.grid.model;
    if (!m) return false;

    // Your described secret pattern relative to start:
    // 1) start + (3 right, 2 up)
    // 2) then down by 2  => start + (3 right, 0)
    // 3) then right by 4 => start + (7 right, 0)
    const p1 = { x: m.start.x + 3, y: m.start.y - 2 };
    const p2 = { x: m.start.x + 3, y: m.start.y + 0 };
    const p3 = { x: m.start.x + 7, y: m.start.y + 0 };

    // Must be in-bounds
    const inb = (p) => p.x >= 0 && p.y >= 0 && p.x < m.size && p.y < m.size;
    if (!inb(p1) || !inb(p2) || !inb(p3)) return false;

    // We accept either [p1,p2,p3] or [start,p1,p2,p3]
    const ch = state.grid.chosenPath;
    if (ch.length === 3 && pathEquals(ch, [p1, p2, p3])) return true;
    if (ch.length === 4 && pathEquals(ch, [m.start, p1, p2, p3])) return true;

    return false;
  }

  function checkGridPath() {
    const m = state.grid.model;
    if (!m) {
      setMsg(ui.gridMsg, "No grid loaded.", "bad");
      return;
    }

    // Backdoor for grid (hidden)
    if (gridBackdoorHit()) {
      state.grid.streak = state.grid.target;
      if (ui.gridStreak) setText(ui.gridStreak, String(state.grid.streak));
      renderSide();
      setMsg(ui.gridMsg, "Override accepted.", "good");
      markCleared("grid");
      return;
    }

    const need = m.pathPoints.length;
    const have = state.grid.chosenPath.length;

    if (have !== need) {
      setMsg(ui.gridMsg, `Incomplete path. You selected ${have}/${need}. Click the full path, then submit.`, "bad");
      return;
    }

    const ok = pathEquals(state.grid.chosenPath, m.pathPoints);
    if (ok) {
      state.grid.streak += 1;
      if (ui.gridStreak) setText(ui.gridStreak, String(state.grid.streak));
      renderSide();
      setMsg(ui.gridMsg, "Correct. Gate cleared.", "good");
      markCleared("grid");
      return;
    }

    // Incorrect path => reset streak + new grid
    state.grid.streak = 0;
    if (ui.gridStreak) setText(ui.gridStreak, "0");
    renderSide();
    setMsg(ui.gridMsg, "Incorrect path. Streak reset. New grid generated.", "bad");
    setTimeout(() => newGridRound(true), 450);
  }

  /* =========================
     POEM.JSON DECRYPT
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
        iterations: poemJson.kdf.iterations,
      },
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
      if (!res.ok) throw new Error(`Failed to load poem.json: ${res.status}`);
      state.poem.json = await res.json();
    } catch (e) {
      console.error(e);
      setMsg(ui.revealMsg, "Warning: poem.json failed to load. Decrypt may not work.", "warn");
    }
  }

  async function tryDecryptFromInputs() {
    // Reveal backdoor: if either fragment is 1324, grant "override" (no decrypt required)
    const aRaw = (ui.fragA?.value ?? "").trim();
    const bRaw = (ui.fragB?.value ?? "").trim();
    if (isOverride(aRaw) || isOverride(bRaw) || isOverride(aRaw + bRaw)) {
      if (ui.poemText) setText(ui.poemText, "Override accepted.");
      setMsg(ui.revealMsg, "Override accepted.", "good");
      return;
    }

    const pj = state.poem.json;
    if (!pj) {
      setMsg(ui.revealMsg, "poem.json not loaded.", "bad");
      return;
    }

    const a = aRaw.toLowerCase().replace(/\s+/g, "");
    const b = bRaw.toLowerCase().replace(/\s+/g, "");
    const pass = `${a}${b}`;

    if (pass.length < 4) {
      setMsg(ui.revealMsg, "Enter fragmentA and fragmentB (lowercase, no spaces).", "warn");
      return;
    }

    try {
      const poem = await decryptPoemJson(pass, pj);
      if (ui.poemText) setText(ui.poemText, poem);
      setMsg(ui.revealMsg, "Decryption successful.", "good");
    } catch (e) {
      console.error(e);
      if (ui.poemText) setText(ui.poemText, "");
      const hint = pj?.hint ? ` ${pj.hint}` : "";
      setMsg(ui.revealMsg, `Decryption failed.${hint}`, "bad");
    }
  }

  /* =========================
     RESET / INIT
  ========================= */
  function hardResetProgress({ silent = false } = {}) {
    // stop timers
    stopRepairTimer();
    stopGridVisTimer();

    // reset state
    state.cleared = new Set();
    state.stage = "trivia";

    state.trivia.streak = 0;
    state.trivia.retired = new Set();
    state.trivia.current = null;

    state.note.streak = 0;
    state.note.current = null;
    state.note.backdoorProgress = 0;

    state.repair.streak = 0;
    state.repair.current = null;
    state.repair.deadlineTs = 0;

    state.grid.streak = 0;
    state.grid.model = null;
    state.grid.chosenPath = [];

    // UI counters
    if (ui.streak) setText(ui.streak, "0");
    if (ui.noteStreak) setText(ui.noteStreak, "0");
    if (ui.repairStreak) setText(ui.repairStreak, "0");
    if (ui.gridStreak) setText(ui.gridStreak, "0");

    // targets
    if (ui.triviaTarget) setText(ui.triviaTarget, String(state.trivia.target));
    if (ui.noteTarget) setText(ui.noteTarget, String(state.note.target));
    if (ui.repairTarget) setText(ui.repairTarget, String(state.repair.target));
    if (ui.gridTarget) setText(ui.gridTarget, String(state.grid.target));

    // clear messages
    setMsg(ui.triviaMsg, "", "");
    setMsg(ui.noteMsg, "", "");
    setMsg(ui.repairMsg, "", "");
    setMsg(ui.gridMsg, "", "");
    setMsg(ui.revealMsg, "", "");

    if (ui.poemText) setText(ui.poemText, "");
    if (ui.fragA) ui.fragA.value = "";
    if (ui.fragB) ui.fragB.value = "";

    // Always begin at Trivia on reload/reset
    setStage("trivia");

    // Boot stages
    pickTrivia();
    newNoteRound(false);
    newRepairRound(true);
    newGridRound(true);

    // But user lands on Trivia
    setStage("trivia");
    renderSide();

    if (!silent) {
      // optional toast
      setMsg(ui.triviaMsg, "Progress reset.", "warn");
    }
  }

  function wireTabNavigation() {
    const tabs = [
      { k: "trivia", el: ui.stepTrivia },
      { k: "note", el: ui.stepNote },
      { k: "repair", el: ui.stepRepair },
      { k: "grid", el: ui.stepGrid },
    ];
    for (const t of tabs) {
      on(t.el, "click", () => {
        // Never allow direct "reveal" tab; it should not exist.
        setStage(t.k);
        // stage-specific behaviors
        if (t.k === "trivia" && !state.trivia.current) pickTrivia();
        if (t.k === "note" && !state.note.current) newNoteRound(false);
        if (t.k === "repair" && !state.repair.current) newRepairRound(true);
        if (t.k === "grid" && !state.grid.model) newGridRound(true);
      });
    }

    // If your HTML uses generic pills without IDs, try a fallback:
    // look for elements containing text labels and wire them.
    const maybePills = qa("button, .step, .tab").filter((el) => {
      const tx = (el.textContent || "").trim().toLowerCase();
      return ["trivia", "music notes", "notes", "repair", "grid"].includes(tx);
    });

    for (const el of maybePills) {
      const tx = (el.textContent || "").trim().toLowerCase();
      if (tx === "trivia") on(el, "click", () => setStage("trivia"));
      if (tx === "notes" || tx === "music notes") on(el, "click", () => setStage("note"));
      if (tx === "repair") on(el, "click", () => setStage("repair"));
      if (tx === "grid") on(el, "click", () => setStage("grid"));
    }
  }

  function wireEvents() {
    // Global reset button: no confirm; you asked for clean resets.
    on(ui.resetProgress, "click", () => hardResetProgress({ silent: false }));

    // Trivia
    on(ui.submitAnswer, "click", checkTriviaAnswer);
    on(ui.answer, "keydown", (e) => {
      if (e.key === "Enter") checkTriviaAnswer();
    });

    // Notes
    on(ui.playNote, "click", () => {
      if (!state.note.current) newNoteRound(false);
      try {
        playTone(state.note.current.f, 750);
        setMsg(ui.noteMsg, "Played. Enter A–G, then press Submit.", "warn");
        ui.noteAnswer?.focus?.();
      } catch (e) {
        console.error(e);
        setMsg(ui.noteMsg, "Audio blocked. Click the page and try again.", "bad");
      }
    });
    on(ui.submitNote, "click", checkNoteAnswer);

    // IMPORTANT: keyboard entry should NOT auto-submit; user must press Submit.
    // So we only prevent form submission defaults; do not call checkNoteAnswer on Enter.
    on(ui.noteAnswer, "keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        // keep focus; require clicking Submit
      }
    });

    // Repair
    on(ui.submitRepair, "click", checkRepairAnswer);
    // Avoid Ctrl+Enter auto; keep manual submit only (but allow Ctrl+Enter if you want)
    on(ui.repairAnswer, "keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        checkRepairAnswer();
      }
    });

    // Grid
    on(ui.resetGrid, "click", () => newGridRound(true));
    on(ui.submitGrid, "click", checkGridPath);

    // If no submit button exists, enable "double click to submit" on board
    on(ui.gridBoard, "dblclick", () => checkGridPath);

    // Reveal
    on(ui.decryptPoemBtn, "click", tryDecryptFromInputs);
    on(ui.fragB, "keydown", (e) => {
      if (e.key === "Enter") tryDecryptFromInputs();
    });

    wireTabNavigation();
  }

  async function init() {
    if (!hasCoreUI()) {
      console.error("Core UI elements missing. Check index.html IDs.");
      return;
    }

    initTheme();

    // ALWAYS reset progress on load; start on Trivia tab.
    hardResetProgress({ silent: true });

    // Validate trivia
    if (!window.TRIVIA_BANK || !Array.isArray(window.TRIVIA_BANK) || window.TRIVIA_BANK.length < 20) {
      if (ui.question) setText(ui.question, "Trivia bank missing or invalid.");
      setMsg(ui.triviaMsg, "Ensure trivia_bank.js is loaded before app.js.", "bad");
    } else {
      if (ui.remaining) setText(ui.remaining, String(triviaRemaining()));
    }

    // Load poem.json (optional)
    await loadPoemJson();

    // Wire handlers
    wireEvents();

    // Ensure first tab is Trivia after everything
    setStage("trivia");
    pickTrivia();
  }

  window.addEventListener("load", init);
})();
