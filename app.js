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
   Requirement: pass if it includes the words "island" AND "code"
   (case-insensitive, singular/plural allowed). Still rejects obvious spam.
*/
function aiCheck(inputRaw) {
  const raw = (inputRaw || "").trim();
  const text = raw.toLowerCase();

  // reject extremely short
  if (raw.length < 10) {
    return { ok: false, reason: "Too short. Describe environment, objects, and what stands out." };
  }

  // reject obvious low-entropy spam like AAAAAA or repeated single token
  const compact = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (compact.length >= 6) {
    const upper = compact.toUpperCase();
    const uniqueChars = new Set(upper.split(""));
    const uniquenessRatio = uniqueChars.size / upper.length;
    if (uniquenessRatio < 0.18) {
      return { ok: false, reason: "Low-entropy input. Write a real description." };
    }
  }

  // PASS condition: contains island(s) and code (simple + forgiving)
  const hasIsland = /\bislands?\b/.test(text) || /\barchipelago\b/.test(text) || /\bisle\b/.test(text);
  const hasCode   = /\bcode\b/.test(text) || /\bcipher\b/.test(text) || /\bsequence\b/.test(text);

  if (hasIsland && hasCode) {
    return { ok: true, reason: "AI check passed. Continue." };
  }

  return { ok: false, reason: "Not plausible. Describe environment, objects, and what stands out." };
}

/* ====== UI WIRING ====== */
const els = {
  btnHints: document.getElementById("btnHints"),
  btnContrast: document.getElementById("btnContrast"),
  btnContrastThink: document.getElementById("btnContrastThink"),
  btnContrastOrigami: document.getElementById("btnContrastOrigami"),

  aiInput: document.getElementById("aiInput"),
  aiValidate: document.getElementById("aiValidate"),
  aiClear: document.getElementById("aiClear"),
  aiResult: document.getElementById("aiResult"),

  code1Input: document.getElementById("code1Input"),
  code1Btn: document.getElementById("code1Btn"),
  code1Feedback: document.getElementById("code1Feedback"),

  thinkStage: document.getElementById("stage-blink"),
  thinkInput: document.getElementById("blinkInput"),

  origamiStage: document.getElementById("stage-origami"),
  origamiWord: document.getElementById("origamiWord"),
  origamiInput: document.getElementById("origamiInput"),

  code2Input: document.getElementById("code2Input"),
  code2Btn: document.getElementById("code2Btn"),
  code2Feedback: document.getElementById("code2Feedback"),
};

/* ====== Stage Transitions ====== */
function goToStageCode1() {
  setVisible("stage-ai", false);
  setVisible("stage-code1", true);
  els.code1Input.value = "";
  els.code1Input.focus();
  showToast("Unlocked: sequence entry.");
}

function startThinkStage() {
  setVisible("stage-code1", false);
  setVisible("stage-blink", true);

  // Focus input anywhere
  const focusThink = () => els.thinkInput && els.thinkInput.focus();
  focusThink();
  document.addEventListener("click", focusThink, { capture: true });

  els.thinkInput.value = "";
  els.thinkInput.addEventListener("keydown", onThinkKeydown);
}

function stopThinkStage() {
  setVisible("stage-blink", false);
  els.thinkInput.removeEventListener("keydown", onThinkKeydown);
}

function onThinkKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const v = normalizeSequence(els.thinkInput.value);
    if (v === PASS) {
      stopThinkStage();
      goToOrigami();
    } else {
      // "Nothing happens if wrong"
      els.thinkInput.value = "";
    }
  }
}

function goToOrigami() {
  setVisible("stage-origami", true);

  // Keep the word visible until PASS is entered (no auto-fly-out)
  els.origamiStage.style.background = document.body.classList.contains("hc") ? "#0f141b" : "#f7f4ef";
  els.origamiWord.style.left = "10%";
  els.origamiWord.style.opacity = "0.95";

  const focusOrigami = () => els.origamiInput && els.origamiInput.focus();
  focusOrigami();
  document.addEventListener("click", focusOrigami, { capture: true });

  els.origamiInput.value = "";
  els.origamiInput.addEventListener("keydown", onOrigamiKeydown);
}

function onOrigamiKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const v = normalizeSequence(els.origamiInput.value);
    els.origamiInput.value = "";
    if (v === PASS) {
      els.origamiInput.removeEventListener("keydown", onOrigamiKeydown);
      setVisible("stage-origami", false);
      setVisible("stage-code2", true);
      els.code2Input.value = "";
      els.code2Input.focus();
    } else {
      // Nothing happens if wrong
    }
  }
}

/* ====== Event Listeners ====== */
function syncContrastButtons() {
  const on = document.body.classList.contains("hc");
  if (els.btnContrast) els.btnContrast.setAttribute("aria-pressed", on ? "true" : "false");
  if (els.btnContrastThink) els.btnContrastThink.setAttribute("aria-pressed", on ? "true" : "false");
  if (els.btnContrastOrigami) els.btnContrastOrigami.setAttribute("aria-pressed", on ? "true" : "false");
}

function toggleContrast() {
  document.body.classList.toggle("hc");
  syncContrastButtons();
}

if (els.btnHints) {
  els.btnHints.addEventListener("click", () => {
    showToast("Describe environment, objects, and what stands out.");
  });
}

if (els.btnContrast) els.btnContrast.addEventListener("click", toggleContrast);
if (els.btnContrastThink) els.btnContrastThink.addEventListener("click", toggleContrast);
if (els.btnContrastOrigami) els.btnContrastOrigami.addEventListener("click", toggleContrast);

els.aiValidate.addEventListener("click", () => {
  const res = aiCheck(els.aiInput.value);
  els.aiResult.textContent = res.reason;

  if (res.ok) {
    els.aiResult.style.borderStyle = "solid";
    els.aiResult.style.borderColor = "rgba(45,108,223,.35)";
    els.aiResult.style.background = "rgba(45,108,223,.08)";
    window.setTimeout(goToStageCode1, 400);
  } else {
    els.aiResult.style.borderStyle = "dashed";
    els.aiResult.style.borderColor = "rgba(207,46,46,.35)";
    els.aiResult.style.background = "rgba(207,46,46,.06)";
  }
});

els.aiClear.addEventListener("click", () => {
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
      startThinkStage(); // now the mellow “time to think” screen
    }, 350);
    return;
  }

  tryAgain(els.code1Feedback);
}

els.code1Btn.addEventListener("click", validateCode1);
els.code1Input.addEventListener("keydown", (e) => {
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
    }, 450);
    return;
  }

  tryAgain(els.code2Feedback);
}

els.code2Btn.addEventListener("click", validateCode2);
els.code2Input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validateCode2();
});

/* ====== On load ====== */
window.addEventListener("load", () => {
  syncContrastButtons();
  if (els.aiInput) els.aiInput.focus();
});
