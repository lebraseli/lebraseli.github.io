/* app.js (cleaned + redesigned)
   Drop-in replacement for /yournextclue/app.js

   Changes implemented:
   - Grid tab + Grid gate removed from flow (Trivia -> Music Notes -> Repair -> Reveal).
   - Theme toggle is a sun icon and works (supports multiple toggles via [data-action="toggle-theme"]).
   - Reveal is a dedicated, headerless final view (no top header), with top-right sun icon toggle.
   - Reveal shows the provided poem (static).
   - Progress always resets on reload (theme persists).
*/

(() => {
  "use strict";

  /* =========================
     CONFIG
  ========================= */
  const BACKDOOR = "1324";
  const GATES = ["trivia", "notes", "repair"]; // Grid removed

  const TRIVIA = { target: 15 };
  const NOTES  = { target: 5 };
  const REPAIR  = { ms: 150_000, tol: 5, target: 3 }; // 2:30, <= 5 wrong chars, 3 wins

  const FINAL_POEM =
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
  const byId = (id) => document.getElementById(id) || null;

  function firstEl(...candidates) {
    for (const c of candidates) {
      if (!c) continue;
      if (typeof c === "string") {
        const elById = byId(c);
        if (elById) return elById;
        const elQ = document.querySelector(c);
        if (elQ) return elQ;
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
     UI MAP
  ========================= */
  const ui = {
    // Header / nav
    tabsNav: firstEl("#stepsNav", '[data-role="tabs"]', '[aria-label="sections"]'),

    tabTrivia: firstEl("#stepTrivia", '[data-gate="trivia"]'),
    tabNotes:  firstEl("#stepNote",  '[data-gate="notes"]'),
    tabRepair: firstEl("#stepRepair",'[data-gate="repair"]'),

    // Panel header copy
    panelTitle: firstEl("#panelTitle", '[data-role="panelTitle"]'),
    panelDesc:  firstEl("#panelDesc",  '[data-role="panelDesc"]'),
    statusPill: firstEl("#statusPill", '[data-role="statusPill"]'),

    // Stages
    stageTrivia: firstEl("#stageTrivia", '[data-stage="trivia"]'),
    stageNotes:  firstEl("#stageNote",  "#stageNotes", '[data-stage="notes"]'),
    stageRepair: firstEl("#stageRepair", '[data-stage="repair"]'),
    stageReveal: firstEl("#stageReveal", '[data-stage="reveal"]'),

    // Sidebar
    side: firstEl(".side", "#side", '[data-role="side"]'),
    objective: firstEl("#objective", '[data-role="objective"]'),

    // Progress values
    pTrivia: firstEl("#pTrivia", '[data-progress="trivia"]'),
    pNotes:  firstEl("#pNote",   "#pNotes", '[data-progress="notes"]'),
    pRepair: firstEl("#pRepair", '[data-progress="repair"]'),

    // Theme toggles (icon buttons)
    themeToggles: () => els('[data-action="toggle-theme"], #themeToggle, #revealThemeToggle'),

    // Reset
    resetProgress: firstEl("#resetProgress"),

    /* TRIVIA */
    triviaStreak: firstEl("#streak"),
    triviaTarget: firstEl("#triviaTarget"),
    triviaRemaining: firstEl("#remaining"),
    triviaCategory: firstEl("#category"),
    triviaQuestion: firstEl("#question"),
    triviaAnswer: firstEl("#answer"),
    triviaSubmit: firstEl("#submitAnswer"),
    triviaMsg: firstEl("#triviaMsg"),

    /* NOTES */
    noteStreak: firstEl("#noteStreak"),
    noteTarget: firstEl("#noteTarget"),
    playNote: firstEl("#playNote"),
    noteInput: firstEl("#noteAnswer", "#noteGuess"),
    noteSubmit: firstEl("#submitNote"),
    noteMsg: firstEl("#noteMsg"),

    /* REPAIR */
    repairStreak: firstEl("#repairStreak"),
    repairTarget: firstEl("#repairTarget"),
    repairTimer: firstEl("#repairTimer"),
    repairBroken: firstEl("#repairPrompt", "#repairBroken"),
    repairInput: firstEl("#repairAnswer", "#repairInput"),
    repairSubmit: firstEl("#submitRepair"),
    repairMsg: firstEl("#repairMsg"),

    /* REVEAL */
    poemText: firstEl("#poemText"),
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

    theme: "dark",
  };

  /* =========================
     THEME
  ========================= */
  function applyTheme(t) {
    state.theme = (t === "light") ? "light" : "dark";
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.style.colorScheme = state.theme;
    try { localStorage.setItem("ync_theme", state.theme); } catch {}
  }

  function initTheme() {
    let t = "dark";
    try { t = localStorage.getItem("ync_theme") || "dark"; } catch {}
    applyTheme(t);

    const toggles = ui.themeToggles();
    toggles.forEach((btn) => {
      btn.addEventListener("click", () => {
        applyTheme(state.theme === "dark" ? "light" : "dark");
      });
    });
  }

  /* =========================
     NAV / TABS (only active gate clickable)
  ========================= */
  function gateTabEl(g) {
    if (g === "trivia") return ui.tabTrivia;
    if (g === "notes")  return ui.tabNotes;
    if (g === "repair") return ui.tabRepair;
    return null;
  }

  function setTabState() {
    for (const g of GATES) {
      const el = gateTabEl(g);
      if (!el) continue;

      const isActive  = (g === state.gate);
      const isCleared = state.cleared.has(g);
      const isFuture  = (GATES.indexOf(g) > state.idx);

      const clickable = isActive && !isCleared && !isFuture;

      el.classList.toggle("active", isActive);
      el.classList.toggle("done", isCleared);
      el.classList.toggle("locked", !clickable);

      el.setAttribute("aria-current", isActive ? "page" : "false");
      el.setAttribute("aria-disabled", clickable ? "false" : "true");

      if ("disabled" in el) el.disabled = !clickable;
      el.style.pointerEvents = clickable ? "auto" : "none";
      el.style.opacity = clickable ? "" : "0.75";
    }
  }

  function wireTabs() {
    const map = [
      ["trivia", ui.tabTrivia],
      ["notes",  ui.tabNotes],
      ["repair", ui.tabRepair],
    ];

    for (const [g, el] of map) {
      if (!el) continue;
      el.addEventListener("click", (e) => {
        e.preventDefault();
        if (g !== state.gate) return;
        setGate(g);
      });
    }
  }

  /* =========================
     STAGE SWITCHING + PROGRESS
  ========================= */
  function showOnlyStage(g) {
    const stages = {
      trivia: ui.stageTrivia,
      notes:  ui.stageNotes,
      repair: ui.stageRepair,
      reveal: ui.stageReveal,
    };
    for (const k of Object.keys(stages)) hide(stages[k]);
    show(stages[g]);
    document.body.dataset.stage = g;
  }

  function renderProgress() {
    setText(ui.pTrivia, `${state.trivia.streak} / ${TRIVIA.target}`);
    setText(ui.pNotes,  `${state.notes.streak} / ${NOTES.target}`);
    setText(ui.pRepair, `${state.repair.streak} / ${REPAIR.target}`);

    setText(ui.triviaStreak, String(state.trivia.streak));
    setText(ui.triviaTarget, String(TRIVIA.target));
    setText(ui.noteStreak, String(state.notes.streak));
    setText(ui.noteTarget, String(NOTES.target));
    setText(ui.repairStreak, String(state.repair.streak));
    setText(ui.repairTarget, String(REPAIR.target));
  }

  function setGate(g) {
    state.gate = g;
    setTabState();
    showOnlyStage(g);

    if (g === "trivia") {
      setText(ui.panelTitle, "Test — Trivia");
      setHTML(ui.panelDesc, `Answer <b>${TRIVIA.target}</b> correctly in a row. Miss resets streak.`);
      setText(ui.statusPill, "In progress");
      if (ui.objective) setText(ui.objective, `${TRIVIA.target} in a row`);
      renderProgress();
      pickTrivia();
      return;
    }

    if (g === "notes") {
      setText(ui.panelTitle, "Test — Music Notes");
      setHTML(ui.panelDesc, `Press “Play note”, then type the letter (A–G). Get <b>${NOTES.target}</b> in a row. Submit is required.`);
      setText(ui.statusPill, "In progress");
      if (ui.objective) setText(ui.objective, `${NOTES.target} in a row`);
      renderProgress();
      newNoteRound(false);
      return;
    }

    if (g === "repair") {
      setText(ui.panelTitle, "Test — Sentence Repair");
      setHTML(ui.panelDesc, `Fix the text. <b>2:30</b> limit. Get <b>${REPAIR.target}</b> wins in a row. Tolerance: ≤ <b>${REPAIR.tol}</b> wrong characters.`);
      setText(ui.statusPill, "In progress");
      if (ui.objective) setText(ui.objective, `${REPAIR.target} wins in a row`);
      renderProgress();
      newRepairRound(true);
      return;
    }
  }

  function completeGate(g) {
    state.cleared.add(g);
    state.idx = Math.min(state.idx + 1, GATES.length);

    if (state.idx >= GATES.length) {
      enterReveal();
      return;
    }

    setGate(GATES[state.idx]);
  }

  function enterReveal() {
    state.gate = "reveal";
    document.body.classList.add("revealOnly");

    // Hard-hide navigation and sidebar
    if (ui.tabsNav) hide(ui.tabsNav);
    if (ui.side) hide(ui.side);

    showOnlyStage("reveal");

    // Set poem (static final payload)
    if (ui.poemText) ui.poemText.textContent = FINAL_POEM;

    // Defensive: clear panel header copy (CSS hides panelHead in reveal)
    setText(ui.panelTitle, "");
    setText(ui.panelDesc, "");
    setText(ui.statusPill, "");
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

  function newNoteRound() {
    state.notes.current = NOTE_BANK[Math.floor(Math.random() * NOTE_BANK.length)];
    state.notes.secretBuf = "";
    if (ui.noteInput) ui.noteInput.value = "";
    setMsg(ui.noteMsg, "Click Play note, then enter A–G and press Submit.", "warn");
    setTimeout(() => ui.noteInput?.focus?.(), 0);
  }

  function checkNotes() {
    const raw = (ui.noteInput?.value || "").trim();

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
        setTimeout(newNoteRound, 240);
      }
      return;
    }

    state.notes.streak = 0;
    renderProgress();
    setMsg(ui.noteMsg, "Incorrect.", "bad");
    setTimeout(newNoteRound, 260);
  }

  /* =========================
     SENTENCE REPAIR
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

    if (ui.repairBroken) ui.repairBroken.textContent = item.broken;
    if (ui.repairInput) ui.repairInput.value = "";

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

    if (state.repair.deadlineTs - Date.now() <= 0) {
      setMsg(ui.repairMsg, "Time expired.", "bad");
      return;
    }

    const guess = canonRepair(raw);
    const truth = canonRepair(state.repair.current.fixed);

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
     HARD RESET (always on load)
  ========================= */
  function hardResetSession() {
    stopRepairTimer();

    state.idx = 0;
    state.cleared = new Set();
    state.gate = "trivia";

    state.trivia.streak = 0;
    state.trivia.retired = new Set();
    state.trivia.current = null;

    state.notes.streak = 0;
    state.notes.current = null;
    state.notes.secretBuf = "";

    state.repair.streak = 0;
    state.repair.current = null;
    state.repair.deadlineTs = 0;

    document.body.classList.remove("revealOnly");

    // Restore nav + sidebar (enterReveal hides them)
    if (ui.tabsNav) show(ui.tabsNav);
    if (ui.side) show(ui.side);

    // Clear messages
    setMsg(ui.triviaMsg, "", "");
    setMsg(ui.noteMsg, "", "");
    setMsg(ui.repairMsg, "", "");

    // Inputs
    if (ui.triviaAnswer) ui.triviaAnswer.value = "";
    if (ui.noteInput) ui.noteInput.value = "";
    if (ui.repairInput) ui.repairInput.value = "";

    renderProgress();
    setGate("trivia");
  }

  /* =========================
     WIRING
  ========================= */
  function wireEvents() {
    // Reset progress button
    ui.resetProgress?.addEventListener("click", hardResetSession);

    // Trivia
    ui.triviaSubmit?.addEventListener("click", checkTrivia);
    ui.triviaAnswer?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") checkTrivia();
    });

    // Notes
    ui.playNote?.addEventListener("click", () => {
      if (!state.notes.current) newNoteRound();
      try {
        playTone(state.notes.current.f, 650);
        setMsg(ui.noteMsg, "Played. Enter A–G, then press Submit.", "warn");
        ui.noteInput?.focus?.();
      } catch (err) {
        console.error(err);
        setMsg(ui.noteMsg, "Audio blocked. Click Play note again.", "bad");
      }
    });

    // Capture digits for backdoor buffer (1324)
    ui.noteInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        return;
      }
      if (/^[0-9]$/.test(e.key)) {
        state.notes.secretBuf = (state.notes.secretBuf + e.key).slice(-4);
      }
    });

    ui.noteSubmit?.addEventListener("click", checkNotes);

    // Repair
    ui.repairSubmit?.addEventListener("click", checkRepair);
    ui.repairInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        checkRepair();
      }
    });
  }

  /* =========================
     INIT
  ========================= */
  function init() {
    initTheme();
    wireTabs();
    wireEvents();

    // Always hard reset on load
    hardResetSession();
  }

  window.addEventListener("load", init);
})();
