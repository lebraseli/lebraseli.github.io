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

function setVisible(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

/* ====== “AI CHECK” (DETERMINISTIC UX GATE, FORGIVING) ====== */
function aiCheck(inputRaw) {
  const raw = (inputRaw || "").trim();
  const text = raw.toLowerCase();

  if (raw.length < 16) return { ok: false, reason: "Too short. Write one or two complete sentences." };

  const stripped = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (stripped.length >= 10) {
    const first = stripped[0];
    if (stripped.split("").every(ch => ch === first)) {
      return { ok: false, reason: "Low-effort input. Write a real description." };
    }
  }

  const tokens = text.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const uniqTokens = new Set(tokens);
  if (tokens.length < 5 || uniqTokens.size < 4) {
    return { ok: false, reason: "Add a bit more detail (environment + what you notice)." };
  }

  const water   = ["ocean","sea","water","waves","wave","blue","tide","surf"];
  const islands = ["island","islands","archipelago","isle","atoll","cay","shore","beach","sand"];
  const aerial  = ["aerial","overhead","top","topdown","top-down","bird","satellite","map"];
  const codecue = ["code","cipher","sequence","letters","numbers","alphanumeric","decode","message","hidden"];
  const pattern = ["pattern","shapes","forming","arranged","spelled","layout","cluster","scattered","middle"];

  const hitWater  = water.some(w => text.includes(w));
  const hitIsles  = islands.some(w => text.includes(w));
  const hitAerial = aerial.some(w => text.includes(w));
  const hitCode   = codecue.some(w => text.includes(w));
  const hitPat    = pattern.some(w => text.includes(w));

  const ok = (hitIsles && hitWater) || (hitIsles && (hitCode || hitPat)) || (hitIsles && hitAerial);

  if (!ok) return { ok: false, reason: "Not plausible. Mention what environment it is and what stands out." };
  return { ok: true, reason: "Check passed. Proceed." };
}

/* ====== UI ====== */
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

/* ====== STAGES ====== */
function goToStageCode1() {
  setVisible("stage-ai", false);
  setVisible("stage-code1", true);
  els.code1Input.value = "";
  els.code1Input.focus();
  showToast("Unlocked.");
}

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
    els.blinkInput.value = ""; // wrong = silent reset
  }
}

function startBlinking() {
  setVisible("stage-code1", false);
  setVisible("stage-blink", true);

  // Immediate focus and keep it sticky
  const focusBlink = () => els.blinkInput && els.blinkInput.focus();
  focusBlink();

  // Ensure any click refocuses, but don't stack listeners repeatedly
  document.removeEventListener("pointerdown", focusBlink, true);
  document.addEventListener("pointerdown", focusBlink, true);

  // Start blinking immediately (no delay)
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

  // Capture Enter immediately
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

let origamiTimer = null;

function onOrigamiKeydown(e) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const v = normalizeSequence(els.origamiInput.value);
  els.origamiInput.value = "";
  if (v === PASS) {
    els.origamiInput.removeEventListener("keydown", onOrigamiKeydown);
    setVisible("stage-origami", false);
    setVisible("stage-code2", true);
    els.code2Input.value = "";
    els.code2Input.focus();
  }
}

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
  document.removeEventListener("pointerdown", focusOrigami, true);
  document.addEventListener("pointerdown", focusOrigami, true);

  window.clearTimeout(origamiTimer);
  origamiTimer = window.setTimeout(() => {
    els.origamiWord.style.left = "120%";
  }, 30000);

  els.origamiInput.value = "";
  els.origamiInput.removeEventListener("keydown", onOrigamiKeydown);
  els.origamiInput.addEventListener("keydown", onOrigamiKeydown);
}

/* ====== EVENTS ====== */
if (els.btnHints) {
  els.btnHints.addEventListener("click", () => showToast("Describe environment + objects + what stands out."));
}
if (els.btnContrast) {
  els.btnContrast.addEventListener("click", () => {
    const on = document.body.classList.toggle("hc");
    els.btnContrast.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

if (els.aiValidate) {
  els.aiValidate.addEventListener("click", () => {
    const res = aiCheck(els.aiInput.value);
    els.aiResult.textContent = res.reason;

    if (res.ok) {
      els.aiResult.style.borderStyle = "solid";
      els.aiResult.style.borderColor = "rgba(45,108,223,.35)";
      els.aiResult.style.background = "rgba(45,108,223,.08)";
      window.setTimeout(goToStageCode1, 350);
    } else {
      els.aiResult.style.borderStyle = "dashed";
      els.aiResult.style.borderColor = "rgba(207,46,46,.35)";
      els.aiResult.style.background = "rgba(207,46,46,.06)";
    }
  });
}

if (els.aiClear) {
  els.aiClear.addEventListener("click", () => {
    els.aiInput.value = "";
    els.aiResult.textContent = "";
    els.aiResult.style.borderColor = "";
    els.aiResult.style.background = "";
    els.aiInput.focus();
  });
}

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

if (els.code1Btn) els.code1Btn.addEventListener("click", validateCode1);
if (els.code1Input) els.code1Input.addEventListener("keydown", (e) => { if (e.key === "Enter") validateCode1(); });

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

if (els.code2Btn) els.code2Btn.addEventListener("click", validateCode2);
if (els.code2Input) els.code2Input.addEventListener("keydown", (e) => { if (e.key === "Enter") validateCode2(); });

window.addEventListener("load", () => {
  if (els.aiInput) els.aiInput.focus();
});
