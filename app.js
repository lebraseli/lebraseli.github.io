/* ====== CONFIG ====== */
const CODE1 = "X47Y1ACGNJ"; // island/water code
const PASS  = "1324";       // operator pass
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

function tryAgain(feedbackEl) {
  if (!feedbackEl) return;
  feedbackEl.innerHTML = `<span class="tryagain">TRY AGAIN</span>`;
  const node = feedbackEl.querySelector(".tryagain");
  window.setTimeout(() => node && node.classList.add("out"), 900);
  window.setTimeout(() => (feedbackEl.innerHTML = ""), 1200);
}

/* ====== “AI CHECK” (DETERMINISTIC UX GATE) ======
   Make it pass for reasonable descriptions, still reject spam like AAAAAA.
*/
function aiCheck(inputRaw) {
  const raw = (inputRaw || "").trim();
  if (raw.length < 16) {
    return { ok: false, reason: "Too short. Add a little more detail." };
  }

  // Hard reject obvious spam / repeated characters
  const only = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (only.length >= 8) {
    const up = only.toUpperCase();
    const uniqueChars = new Set(up.split(""));
    const uniquenessRatio = uniqueChars.size / up.length;
    // Relaxed threshold (avoid false negatives), still kills AAAAAA… patterns
    if (uniquenessRatio < 0.12) {
      return { ok: false, reason: "Low-effort input. Write a real description." };
    }
  }

  const text = raw.toLowerCase();

  // Token sanity (relaxed)
  const tokens = text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const uniq = new Set(tokens);
  if (tokens.length < 5 || uniq.size < 4) {
    return { ok: false, reason: "Add a bit more detail (a few distinct words)." };
  }

  // Concept groups: require (islands) AND (code-cue) AND (either water OR aerial)
  const islands = ["island", "islands", "archipelago", "isle", "atoll", "cay", "cays", "shore", "beach", "sand"];
  const water   = ["ocean", "sea", "water", "waves", "wave", "surf", "blue", "tide"];
  const aerial  = ["aerial", "overhead", "top down", "topdown", "bird", "satellite", "map", "from above"];
  const codecue = ["code", "cipher", "sequence", "letters", "numbers", "alphanumeric", "hidden", "decode", "message", "spells"];

  const hitIslands = islands.some(w => text.includes(w));
  const hitCode    = codecue.some(w => text.includes(w));
  const hitWater   = water.some(w => text.includes(w));
  const hitAerial  = aerial.some(w => text.includes(w));

  if (!hitIslands || !hitCode || !(hitWater || hitAerial)) {
    return {
      ok: false,
      reason: "Not plausible. Describe environment, objects, and what stands out."
    };
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

/* ====== STAGES ====== */
function goToStageCode1() {
  setVisible("stage-ai", false);
  setVisible("stage-code1", true);
  els.code1Input.value = "";
  els.code1Input.focus();
  showToast("Unlocked.");
}

/* ====== BLINK ====== */
let blinkInterval = null;
let blinkIsWhite = true;

function onBlinkKeydown(e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const v = normalizeSequence(els.blinkInput.value);
  if (v === PASS) {
    stopBlinking();
    goToOrigami();
  } else {
    // wrong pass: nothing happens
    els.blinkInput.value = "";
  }
}

function startBlinking() {
  setVisible("stage-code1", false);
  setVisible("stage-blink", true);

  // focus capture anywhere
  const focusBlink = () => els.blinkInput && els.blinkInput.focus();
  focusBlink();
  document.addEventListener("click", focusBlink, { capture: true });

  // infinite blinking white/black
  blinkIsWhite = true;
  const apply = () => {
    els.blinkStage.style.background = blinkIsWhite ? "#FFFFFF" : "#000000";
  };
  apply();

  if (blinkInterval) window.clearInterval(blinkInterval);
  blinkInterval = window.setInterval(() => {
    blinkIsWhite = !blinkIsWhite;
    apply();
  }, 1000);

  // allow immediate typing
  els.blinkInput.value = "";
  els.blinkInput.removeEventListener("keydown", onBlinkKeydown);
  els.blinkInput.addEventListener("keydown", onBlinkKeydown);
}

function stopBlinking() {
  if (blinkInterval) window.clearInterval(blinkInterval);
  blinkInterval = null;
  setVisible("stage-blink", false);
  els.blinkInput.removeEventListener("keydown", onBlinkKeydown);
}

/* ====== ORIGAMI (STAYS UNTIL PASS) ====== */
function onOrigamiKeydown(e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const v = normalizeSequence(els.origamiInput.value);
  els.origamiInput.value = "";

  if (v === PASS) {
    // proceed to final code entry
    els.origamiInput.removeEventListener("keydown", onOrigamiKeydown);
    setVisible("stage-origami", false);
    setVisible("stage-code2", true);
    els.code2Input.value = "";
    els.code2Input.focus();
  } else {
    // wrong: nothing happens
  }
}

function goToOrigami() {
  setVisible("stage-origami", true);

  // Ensure word is visible and stays
  els.origamiWord.style.left = "10%";
  els.origamiWord.style.opacity = "0.95";

  // Focus hidden full-screen input anywhere
  const focusOrigami = () => els.origamiInput && els.origamiInput.focus();
  focusOrigami();
  document.addEventListener("click", focusOrigami, { capture: true });

  els.origamiInput.value = "";
  els.origamiInput.removeEventListener("keydown", onOrigamiKeydown);
  els.origamiInput.addEventListener("keydown", onOrigamiKeydown);
}

/* ====== EVENTS ====== */
els.btnHints?.addEventListener("click", () => {
  showToast("Describe environment, objects, and what stands out.");
});

els.btnContrast?.addEventListener("click", () => {
  const on = document.body.classList.toggle("hc");
  els.btnContrast.setAttribute("aria-pressed", on ? "true" : "false");
});

/* AI gate */
els.aiValidate?.addEventListener("click", () => {
  const res = aiCheck(els.aiInput.value);

  // Only show the result box when there is content
  els.aiResult.textContent = res.reason || "";
  if (res.ok) {
    els.aiResult.classList.remove("result--bad");
    els.aiResult.classList.add("result--good");
    window.setTimeout(goToStageCode1, 450);
  } else {
    els.aiResult.classList.remove("result--good");
    els.aiResult.classList.add("result--bad");
  }
});

els.aiClear?.addEventListener("click", () => {
  els.aiInput.value = "";
  els.aiResult.textContent = "";
  els.aiResult.classList.remove("result--good", "result--bad");
  els.aiInput.focus();
});

/* CODE1 */
function validateCode1() {
  const guess = normalizeSequence(els.code1Input.value);
  const target = normalizeSequence(CODE1);

  if (guess === target) {
    els.code1Feedback.textContent = "Accepted.";
    window.setTimeout(() => {
      els.code1Feedback.textContent = "";
      startBlinking();
    }, 300);
    return;
  }

  tryAgain(els.code1Feedback);
}

els.code1Btn?.addEventListener("click", validateCode1);
els.code1Input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validateCode1();
});

/* CODE2 */
function validateCode2() {
  const guess = normalizeSequence(els.code2Input.value);
  const target = normalizeSequence(CODE2);

  if (guess === target) {
    els.code2Feedback.textContent = "Accepted.";
    window.setTimeout(() => {
      setVisible("stage-code2", false);
      setVisible("stage-done", true);
    }, 350);
    return;
  }

  tryAgain(els.code2Feedback);
}

els.code2Btn?.addEventListener("click", validateCode2);
els.code2Input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validateCode2();
});

/* On load */
window.addEventListener("load", () => {
  els.aiInput?.focus();
});
