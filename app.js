/* ====== CONFIG ====== */
const CODE1 = "X47Y1ACGNJ"; // island/water code
const PASS = "1324";        // operator pass
const CODE2 = "2357";       // burnt marks code

/* ====== HELPERS ====== */
function normalizeSequence(s) {
  return (s || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => el.classList.remove("show"), 2200);
}

function setVisible(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

/* ====== “AI CHECK” (DETERMINISTIC SEMANTIC GATE) ======
   Goal: reject low-effort (AAAAAA), require multiple independent concepts.
*/
function aiCheck(inputRaw) {
  const raw = (inputRaw || "").trim();

  // 1) Hard reject ultra-short / single-token / repeated char spam
  if (raw.length < 28) {
    return { ok: false, reason: "Too short. Describe the scene with more detail." };
  }

  const onlyLettersDigits = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (onlyLettersDigits.length > 0) {
    const uniqueChars = new Set(onlyLettersDigits.toUpperCase().split(""));
    const uniquenessRatio = uniqueChars.size / onlyLettersDigits.length;
    if (uniquenessRatio < 0.18) {
      return { ok: false, reason: "Low-entropy input. Write a real description." };
    }
  }

  // 2) Tokenize
  const text = raw.toLowerCase();
  const tokens = text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const uniqTokens = new Set(tokens);
  if (tokens.length < 8 || uniqTokens.size < 6) {
    return { ok: false, reason: "Not enough distinct words. Be more specific." };
  }

  // 3) Required concept groups (must hit at least 3 groups)
  const water = ["ocean", "sea", "water", "waves", "wave", "surf", "blue", "tide"];
  const islands = ["island", "islands", "archipelago", "isle", "atoll", "cays", "shore", "beach", "sand"];
  const aerial = ["aerial", "overhead", "topdown", "top-down", "birdseye", "bird's-eye", "map", "satellite"];
  const codecue = ["code", "cipher", "sequence", "letters", "numbers", "alphanumeric", "hidden", "decode", "message"];

  const hits = {
    water: water.some(w => text.includes(w)),
    islands: islands.some(w => text.includes(w)),
    aerial: aerial.some(w => text.includes(w.replace("topdown","top")) || text.includes(w)),
    codecue: codecue.some(w => text.includes(w)),
  };

  const score = Object.values(hits).filter(Boolean).length;

  if (score < 3) {
    return {
      ok: false,
      reason: "Not plausible. Mention what environment it is, what objects are present, and what makes it actionable."
    };
  }

  // 4) Soft plausibility: ensure nouns exist beyond water/islands
  const extraSignals = ["texture", "pattern", "shapes", "tiny", "scattered", "cluster", "forming", "arranged", "different"];
  const hasExtra = extraSignals.some(w => text.includes(w));
  if (!hasExtra) {
    return { ok: false, reason: "Add one more concrete observation about layout/pattern." };
  }

  return { ok: true, reason: "AI check passed. Continue." };
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

  blinkStage: document.getElementById("stage-blink"),
  blinkInput: document.getElementById("blinkInput"),

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

/* ====== Stage Transitions ====== */
function goToStageCode1() {
  setVisible("stage-ai", false);
  setVisible("stage-code1", true);
  els.code1Input.value = "";
  els.code1Input.focus();
  showToast("Unlocked.");
}

let blinkInterval = null;
let blinkIsWhite = true;

function startBlinking() {
  setVisible("stage-code1", false);
  setVisible("stage-blink", true);

  const focusBlink = () => els.blinkInput && els.blinkInput.focus();
  focusBlink();
  document.addEventListener("click", focusBlink, { capture: true });

  blinkIsWhite = true;
  const apply = () => {
    els.blinkStage.style.background = blinkIsWhite ? "#FFFFFF" : "#000000";
  };
  apply();
  blinkInterval = window.setInterval(() => {
    blinkIsWhite = !blinkIsWhite;
    apply();
  }, 1000);

  els.blinkInput.value = "";
  els.blinkInput.addEventListener("keydown", onBlinkKeydown);
}

function stopBlinking() {
  if (blinkInterval) window.clearInterval(blinkInterval);
  blinkInterval = null;
  setVisible("stage-blink", false);
  els.blinkInput.removeEventListener("keydown", onBlinkKeydown);
}

function onBlinkKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const v = normalizeSequence(els.blinkInput.value);
    if (v === PASS) {
      stopBlinking();
      goToOrigami();
    } else {
      els.blinkInput.value = "";
      // Wrong pass: do nothing.
    }
  }
}

let origamiTimer = null;
let origamiReadyForSecondPass = false;

function goToOrigami() {
  setVisible("stage-origami", true);

  els.origamiStage.style.background = "#f7f4ef";

  els.origamiWord.style.transition = "left 900ms cubic-bezier(.2,.9,.2,1), opacity 500ms ease";
  els.origamiWord.style.left = "-40%";
  els.origamiWord.style.opacity = "0.95";
  void els.origamiWord.offsetWidth;
  els.origamiWord.style.left = "10%";

  const focusOrigami = () => els.origamiInput && els.origamiInput.focus();
  focusOrigami();
  document.addEventListener("click", focusOrigami, { capture: true });

  window.clearTimeout(origamiTimer);
  origamiTimer = window.setTimeout(() => {
    els.origamiWord.style.left = "120%";
  }, 30000);

  origamiReadyForSecondPass = true;
  els.origamiInput.value = "";
  els.origamiInput.addEventListener("keydown", onOrigamiKeydown);
}

function onOrigamiKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const v = normalizeSequence(els.origamiInput.value);
    els.origamiInput.value = "";

    if (!origamiReadyForSecondPass) return;

    if (v === PASS) {
      els.origamiInput.removeEventListener("keydown", onOrigamiKeydown);
      setVisible("stage-origami", false);
      setVisible("stage-code2", true);
      els.code2Input.value = "";
      els.code2Input.focus();
    } else {
      // Wrong pass: do nothing.
    }
  }
}

/* ====== Event Listeners ====== */
els.btnHints?.addEventListener("click", () => {
  showToast("Hint: describe the environment and the key visual elements.");
});

els.btnContrast?.addEventListener("click", () => {
  const on = document.body.classList.toggle("hc");
  els.btnContrast.setAttribute("aria-pressed", on ? "true" : "false");
});

els.aiValidate?.addEventListener("click", () => {
  const res = aiCheck(els.aiInput.value);
  els.aiResult.textContent = res.reason;

  if (res.ok) {
    els.aiResult.style.borderStyle = "solid";
    els.aiResult.style.borderColor = "rgba(45,108,223,.35)";
    els.aiResult.style.background = "rgba(45,108,223,.08)";
    window.setTimeout(goToStageCode1, 650);
  } else {
    els.aiResult.style.borderStyle = "dashed";
    els.aiResult.style.borderColor = "rgba(207,46,46,.35)";
    els.aiResult.style.background = "rgba(207,46,46,.06)";
  }
});

els.aiClear?.addEventListener("click", () => {
  els.aiInput.value = "";
  els.aiResult.textContent = "";
  els.aiResult.style.borderColor = "";
  els.aiResult.style.background = "";
  els.aiInput.focus();
});

function validateCode1() {
  const guess = normalizeSequence(els.code1Input.value);
  const target = normalizeSequence(CODE1);

  if (guess === target) {
    els.code1Feedback.textContent = "Accepted.";
    window.setTimeout(() => {
      els.code1Feedback.textContent = "";
      startBlinking();
    }, 450);
    return;
  }

  tryAgain(els.code1Feedback);
}

els.code1Btn?.addEventListener("click", validateCode1);
els.code1Input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validateCode1();
});

function validateCode2() {
  const guess = normalizeSequence(els.code2Input.value);
  const target = normalizeSequence(CODE2);

  if (guess === target) {
    els.code2Feedback.textContent = "Accepted.";
    window.setTimeout(() => {
      setVisible("stage-code2", false);
      setVisible("stage-done", true);
    }, 500);
    return;
  }

  tryAgain(els.code2Feedback);
}

els.code2Btn?.addEventListener("click", validateCode2);
els.code2Input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validateCode2();
});

window.addEventListener("load", () => {
  els.aiInput?.focus();
});
