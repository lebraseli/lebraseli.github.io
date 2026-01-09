/* app.js (FULL) */

/* ====== CONFIG ====== */
const CODE1 = "X47Y1ACGNJ"; // island/water code
const PASS  = "1324";       // operator pass
const CODE2 = "2357";       // burnt marks code

/* ====== HELPERS ====== */
function normalizeSequence(s) {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => el.classList.remove("show"), 2200);
}

/**
 * Animated visibility toggle:
 * - show: removes .hidden and fades/slides in
 * - hide: fades/slides out, then applies .hidden
 */
function setVisibleAnimated(id, visible, opts = {}) {
  const el = document.getElementById(id);
  if (!el) return;

  const {
    duration = 420,
    inTransform = "translateY(10px)",
    outTransform = "translateY(10px)",
    easing = "cubic-bezier(.2,.9,.2,1)"
  } = opts;

  const isHidden = el.classList.contains("hidden");
  if (visible && !isHidden && el.style.opacity === "1") return;
  if (!visible && isHidden) return;

  el.style.transition = `opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`;

  if (visible) {
    el.classList.remove("hidden");
    el.style.opacity = "0";
    el.style.transform = inTransform;
    void el.offsetWidth;
    requestAnimationFrame(() => {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    });
  } else {
    el.style.opacity = "0";
    el.style.transform = outTransform;
    window.setTimeout(() => {
      el.classList.add("hidden");
    }, duration + 30);
  }
}

function swapStages(fromId, toId, opts = {}) {
  if (fromId) setVisibleAnimated(fromId, false, opts.from || {});
  if (toId) {
    const delay = (opts.from && opts.from.duration) ? opts.from.duration : 420;
    window.setTimeout(() => {
      setVisibleAnimated(toId, true, opts.to || {});
      updateTopbarForStage(toId);
    }, delay);
  }
}

function setHintsEnabled(on) {
  const btn = document.getElementById("btnHints");
  if (!btn) return;
  btn.classList.toggle("hidden", !on);
}

/* Hide footer during full-screen stages */
function setFullscreenMode(on) {
  document.body.classList.toggle("fullscreen", !!on);
}

/* ====== “AI CHECK” (RELAXED RULE) ======
   Requirement: MUST pass if it includes the words "island" AND "code"
   (case-insensitive, anywhere in text).
*/
function aiCheck(inputRaw) {
  const raw = (inputRaw || "").trim();
  const text = raw.toLowerCase();

  if (text.includes("island") && text.includes("code")) {
    return { ok: true, reason: "AI check passed. Continue." };
  }

  if (raw.length < 14) {
    return { ok: false, reason: "Add a little more detail." };
  }
  return { ok: false, reason: "Not plausible. Describe environment, objects, and what stands out." };
}

/* ====== UI WIRING ====== */
const els = {
  btnHints: document.getElementById("btnHints"),
  btnContrast: document.getElementById("btnContrast"),

  aiInput: document.getElementById("aiInput"),
  aiValidate: document.getElementById("aiValidate"),
  aiClear: document.getElementById("aiClear"),
  aiResult: document.getElementById("aiResult"),

  code1Input: document.getElementById("code1Input"),
  code1Btn: document.getElementById("code1Btn"),
  code1Feedback: document.getElementById("code1Feedback"),

  thinkStage: document.getElementById("stage-think"),
  thinkText: document.getElementById("thinkText"),
  thinkInput: document.getElementById("thinkInput"),

  origamiStage: document.getElementById("stage-origami"),
  origamiWord: document.getElementById("origamiWord"),
  origamiInput: document.getElementById("origamiInput"),

  code2Input: document.getElementById("code2Input"),
  code2Btn: document.getElementById("code2Btn"),
  code2Feedback: document.getElementById("code2Feedback"),
};

function tryAgain(feedbackEl) {
  if (!feedbackEl) return;
  feedbackEl.innerHTML = `<span class="tryagain">TRY AGAIN</span>`;
  const node = feedbackEl.querySelector(".tryagain");
  window.setTimeout(() => node && node.classList.add("out"), 900);
  window.setTimeout(() => (feedbackEl.innerHTML = ""), 1200);
}

/* ====== TOPBAR / HINTS BEHAVIOR ====== */
function updateTopbarForStage(stageId) {
  // Only allow Hints on first 2 pages:
  const allowHints = (stageId === "stage-ai" || stageId === "stage-code1");
  setHintsEnabled(allowHints);
}

function showStageHint() {
  const stageAIVisible = !document.getElementById("stage-ai")?.classList.contains("hidden");
  const stageC1Visible = !document.getElementById("stage-code1")?.classList.contains("hidden");

  if (stageAIVisible) {
    showToast("Describe environment, objects, and what stands out.");
    return;
  }
  if (stageC1Visible) {
    showToast("Look again. Don’t assume it’s random.");
    return;
  }
}

/* ====== STAGE TRANSITIONS ====== */
function goToStageCode1() {
  swapStages("stage-ai", "stage-code1", {
    from: { duration: 420, outTransform: "translateY(8px)" },
    to:   { duration: 520, inTransform: "translateY(10px)" }
  });
  els.code1Input.value = "";
  window.setTimeout(() => els.code1Input.focus(), 560);
}

function goToThink() {
  setVisibleAnimated("stage-code1", false, { duration: 360, outTransform: "translateY(6px)" });

  window.setTimeout(() => {
    setFullscreenMode(true);
    setVisibleAnimated("stage-think", true, { duration: 520, inTransform: "translateY(0px)" });
    updateTopbarForStage("stage-think");

    syncThinkTheme();
    focusThink();

    // Reset animation classes (re-enter safe)
    els.thinkText.classList.remove("slide-in-left", "slide-out-right");
  }, 380);
}

function focusThink() {
  const focus = () => els.thinkInput && els.thinkInput.focus();
  focus();
  document.addEventListener("pointerdown", focus, { capture: true });
}

function syncThinkTheme() {
  const hc = document.body.classList.contains("hc");
  if (!els.thinkStage) return;
  els.thinkStage.style.background = hc ? "#000" : "#ffffff";
  els.thinkText.style.color = hc ? "#ffffff" : "#111";
}

function goToOrigamiWithGlide() {
  // Think text glides out right
  els.thinkText.classList.remove("slide-in-left", "slide-out-right");
  void els.thinkText.offsetWidth;
  els.thinkText.classList.add("slide-out-right");

  window.setTimeout(() => {
    setVisibleAnimated("stage-think", false, { duration: 220, outTransform: "translateY(0)" });

    window.setTimeout(() => {
      setVisibleAnimated("stage-origami", true, { duration: 420, inTransform: "translateY(0)" });
      updateTopbarForStage("stage-origami");

      syncOrigamiTheme();

      // Origami glides in from left and stays
      els.origamiWord.classList.remove("slide-out-right", "slide-in-left");
      void els.origamiWord.offsetWidth;
      els.origamiWord.classList.add("slide-in-left");

      focusOrigami();
    }, 260);
  }, 520);
}

function focusOrigami() {
  const focus = () => els.origamiInput && els.origamiInput.focus();
  focus();
  document.addEventListener("pointerdown", focus, { capture: true });
}

function syncOrigamiTheme() {
  const hc = document.body.classList.contains("hc");
  els.origamiStage.style.background = hc ? "#000" : "#f7f4ef";
  els.origamiWord.style.color = hc ? "#fff" : "#0c0f12";
}

function goToStageCode2() {
  // Keep fullscreen ON while transitioning so footer never flashes
  swapStages("stage-origami", "stage-code2", {
    from: { duration: 380, outTransform: "translateY(0)" },
    to:   { duration: 520, inTransform: "translateY(10px)" }
  });

  window.setTimeout(() => {
    // Return to normal layout (footer can be visible again here)
    setFullscreenMode(false);

    els.code2Input.value = "";
    els.code2Input.focus();
  }, 560);
}

/* ====== EVENTS ====== */
els.btnHints?.addEventListener("click", showStageHint);

els.btnContrast?.addEventListener("click", () => {
  const on = document.body.classList.toggle("hc");
  els.btnContrast.setAttribute("aria-pressed", on ? "true" : "false");

  // Re-sync stage-specific theming
  syncThinkTheme();
  syncOrigamiTheme();
});

els.aiValidate?.addEventListener("click", () => {
  const res = aiCheck(els.aiInput.value);

  els.aiResult.classList.remove("hidden");
  els.aiResult.textContent = res.reason;

  if (res.ok) {
    els.aiResult.style.borderStyle = "solid";
    els.aiResult.style.borderColor = "rgba(45,108,223,.35)";
    els.aiResult.style.background = "rgba(45,108,223,.08)";
    window.setTimeout(goToStageCode1, 380);
  } else {
    els.aiResult.style.borderStyle = "dashed";
    els.aiResult.style.borderColor = "rgba(207,46,46,.35)";
    els.aiResult.style.background = "rgba(207,46,46,.06)";
  }
});

els.aiClear?.addEventListener("click", () => {
  els.aiInput.value = "";
  els.aiResult.textContent = "";
  els.aiResult.classList.add("hidden");
  els.aiInput.focus();
});

function validateCode1() {
  const guess = normalizeSequence(els.code1Input.value);
  const target = normalizeSequence(CODE1);

  if (guess === target) {
    els.code1Feedback.textContent = "Accepted.";
    window.setTimeout(() => {
      els.code1Feedback.textContent = "";
      goToThink();
    }, 250);
    return;
  }
  tryAgain(els.code1Feedback);
}

els.code1Btn?.addEventListener("click", validateCode1);
els.code1Input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validateCode1();
});

/* THINK: Enter PASS immediately, no waiting, no blinking, no visible input box */
els.thinkInput?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const v = normalizeSequence(els.thinkInput.value);
  els.thinkInput.value = "";
  if (v === PASS) {
    goToOrigamiWithGlide();
  }
});

/* ORIGAMI: stays until PASS entered */
els.origamiInput?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const v = normalizeSequence(els.origamiInput.value);
  els.origamiInput.value = "";
  if (v === PASS) {
    els.origamiWord.classList.remove("slide-in-left");
    els.origamiWord.classList.add("slide-out-right");
    window.setTimeout(goToStageCode2, 360);
  }
});

function validateCode2() {
  const guess = normalizeSequence(els.code2Input.value);
  const target = normalizeSequence(CODE2);

  if (guess === target) {
    els.code2Feedback.textContent = "Accepted.";
    window.setTimeout(() => {
      swapStages("stage-code2", "stage-done", {
        from: { duration: 420, outTransform: "translateY(6px)" },
        to:   { duration: 520, inTransform: "translateY(10px)" }
      });
    }, 260);
    return;
  }
  tryAgain(els.code2Feedback);
}

els.code2Btn?.addEventListener("click", validateCode2);
els.code2Input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validateCode2();
});

/* ====== ON LOAD ====== */
window.addEventListener("load", () => {
  updateTopbarForStage("stage-ai");
  els.aiInput?.focus();
});
