/* app.js (FULL) */

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

/* ====== “AI CHECK” (LOOSER GATE) ======
   Requirement (per your latest spec):
   Pass if it includes the words "island" AND "code" (case-insensitive).
   Still block obvious spam like "AAAAAA".
*/
function aiCheck(inputRaw) {
  const raw = (inputRaw || "").trim();
  const text = raw.toLowerCase();

  // Hard reject ultra-short / repeated-char spam
  if (raw.length < 8) {
    return { ok: false, reason: "Too short. Describe what you see." };
  }

  const onlyLettersDigits = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (onlyLettersDigits.length > 0) {
    const uniqueChars = new Set(onlyLettersDigits.toUpperCase().split(""));
    const uniquenessRatio = uniqueChars.size / onlyLettersDigits.length;
    if (uniquenessRatio < 0.14) {
      return { ok: false, reason: "Low-effort input. Write a real description." };
    }
  }

  const hasIsland = /\bisland(s)?\b/.test(text);
  const hasCode   = /\bcode\b/.test(text);

  if (hasIsland && hasCode) {
    return { ok: true, reason: "AI check passed. Continue." };
  }

  return { ok: false, reason: "Not plausible. Describe environment, objects, and what stands out." };
}

/* ====== ELEMENTS ====== */
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
  thinkInput: document.getElementById("thinkInput"),

  origamiStage: document.getElementById("stage-origami"),
  origamiInput: document.getElementById("origamiInput"),

  code2Input: document.getElementById("code2Input"),
  code2Btn: document.getElementById("code2Btn"),
  code2Feedback: document.getElementById("code2Feedback"),
};

/* ====== STAGE MANAGEMENT ====== */
const STAGES = ["stage-ai", "stage-code1", "stage-think", "stage-origami", "stage-code2", "stage-done"];

function showOnly(stageId) {
  STAGES.forEach(id => setVisible(id, id === stageId));
}

function getCurrentStage() {
  for (const id of STAGES) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains("hidden")) return id;
  }
  return "stage-ai";
}

/* Per-page hints */
function hintForStage(stageId) {
  switch (stageId) {
    case "stage-ai":
      return "Describe environment, objects, and what stands out.";
    case "stage-code1":
      return "Open the image and inspect closely.";
    case "stage-think":
      return "Wait for the operator to proceed.";
    case "stage-origami":
      return "Think folding and alignment.";
    case "stage-code2":
      return "Enter the next code.";
    default:
      return "Proceed.";
  }
}

/* ====== BUTTONS ====== */
els.btnHints.addEventListener("click", () => {
  showToast(hintForStage(getCurrentStage()));
});

els.btnContrast.addEventListener("click", () => {
  const on = document.body.classList.toggle("hc");
  els.btnContrast.setAttribute("aria-pressed", on ? "true" : "false");
});

/* ====== AI CHECK WIRING ====== */
els.aiValidate.addEventListener("click", () => {
  const res = aiCheck(els.aiInput.value);

  // Show feedback only when there's something to say (removes the “random box” idle state)
  els.aiResult.textContent = res.reason;
  els.aiResult.classList.remove("hidden");

  if (res.ok) {
    els.aiResult.style.borderStyle = "solid";
    els.aiResult.style.borderColor = "rgba(45,108,223,.35)";
    els.aiResult.style.background = "rgba(45,108,223,.08)";
    window.setTimeout(() => {
      showOnly("stage-code1");
      els.code1Input.value = "";
      els.code1Input.focus();
      showToast("Unlocked: sequence entry.");
    }, 450);
  } else {
    els.aiResult.style.borderStyle = "dashed";
    els.aiResult.style.borderColor = "rgba(207,46,46,.35)";
    els.aiResult.style.background = "rgba(207,46,46,.06)";
  }
});

els.aiClear.addEventListener("click", () => {
  els.aiInput.value = "";
  els.aiResult.textContent = "";
  els.aiResult.classList.add("hidden");
  els.aiResult.style.borderColor = "";
  els.aiResult.style.background = "";
  els.aiInput.focus();
});

/* ====== CODE 1 ====== */
function validateCode1() {
  const guess = normalizeSequence(els.code1Input.value);
  const target = normalizeSequence(CODE1);

  if (guess === target) {
    els.code1Feedback.textContent = "Accepted.";
    window.setTimeout(() => {
      els.code1Feedback.textContent = "";
      goToThink();
    }, 350);
    return;
  }
  tryAgain(els.code1Feedback);
}

els.code1Btn.addEventListener("click", validateCode1);
els.code1Input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validateCode1();
});

/* ====== THINK STAGE (“This is time to think.”) ======
   - No flashing
   - No extra High Contrast button (header is the only one)
   - No visible textbox, but user can type anywhere; ENTER submits PASS.
*/
function goToThink() {
  showOnly("stage-think");

  // Ensure we can type immediately without clicking
  const focusThink = () => els.thinkInput && els.thinkInput.focus();
  focusThink();

  // Capture typing even if they click around
  document.addEventListener("click", focusThink, { capture: true });

  els.thinkInput.value = "";
  els.thinkInput.addEventListener("keydown", onThinkKeydown);
}

function leaveThink() {
  els.thinkInput.removeEventListener("keydown", onThinkKeydown);
}

function onThinkKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const v = normalizeSequence(els.thinkInput.value);
    els.thinkInput.value = "";
    if (v === PASS) {
      leaveThink();
      goToOrigami();
    } else {
      // “Nothing happens if wrong” → do nothing
    }
  }
}

/* ====== ORIGAMI ======
   - Word stays until PASS is entered
   - Header remains available (Hints + High Contrast)
*/
function goToOrigami() {
  showOnly("stage-origami");

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
      showOnly("stage-code2");
      els.code2Input.value = "";
      els.code2Input.focus();
    } else {
      // nothing if wrong
    }
  }
}

/* ====== CODE 2 ====== */
function validateCode2() {
  const guess = normalizeSequence(els.code2Input.value);
  const target = normalizeSequence(CODE2);

  if (guess === target) {
    els.code2Feedback.textContent = "Accepted.";
    window.setTimeout(() => {
      showOnly("stage-done");
    }, 450);
    return;
  }
  tryAgain(els.code2Feedback);
}

els.code2Btn.addEventListener("click", validateCode2);
els.code2Input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validateCode2();
});

/* ====== INIT ====== */
window.addEventListener("load", () => {
  showOnly("stage-ai");
  els.aiInput && els.aiInput.focus();
});
