/* ====== CONFIG ====== */
const CODE1 = "X47Y1ACGNJ"; // island/water code
const PASS  = "1324";       // operator pass
const CODE2 = "2357";       // final code

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
  showToast._t = window.setTimeout(() => el.classList.remove("show"), 2000);
}

function setVisible(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

function setResult(msg, ok = false) {
  const el = document.getElementById("aiResult");
  if (!el) return;

  if (!msg) {
    el.textContent = "";
    el.classList.add("hidden");
    el.style.borderStyle = "";
    el.style.borderColor = "";
    el.style.background = "";
    return;
  }

  el.classList.remove("hidden");
  el.textContent = msg;

  if (ok) {
    el.style.borderStyle = "solid";
    el.style.borderColor = "rgba(45,108,223,.35)";
    el.style.background = "rgba(45,108,223,.08)";
  } else {
    el.style.borderStyle = "dashed";
    el.style.borderColor = "rgba(207,46,46,.35)";
    el.style.background = "rgba(207,46,46,.06)";
  }
}

function tryAgain(feedbackEl) {
  if (!feedbackEl) return;
  feedbackEl.innerHTML = `<span class="tryagain">TRY AGAIN</span>`;
  const node = feedbackEl.querySelector(".tryagain");
  window.setTimeout(() => node && node.classList.add("out"), 900);
  window.setTimeout(() => (feedbackEl.innerHTML = ""), 1200);
}

/* ====== “AI CHECK” (DETERMINISTIC, LESS PICKY) ======
   Accepts reasonable descriptions without requiring hyper-specific phrasing.
*/
function aiCheck(inputRaw) {
  const raw = (inputRaw || "").trim();
  if (raw.length < 14) {
    return { ok: false, reason: "Too short. Add one more detail." };
  }

  // Reject obvious spam (e.g., AAAAAA, repeating single char)
  const compact = raw.replace(/[^a-zA-Z0-9]/g, "");
  if (compact.length >= 10) {
    const up = compact.toUpperCase();
    const unique = new Set(up.split(""));
    const uniquenessRatio = unique.size / up.length;
    if (uniquenessRatio < 0.10) {
      return { ok: false, reason: "Low-effort input. Write a real description." };
    }
  }

  // Token sanity
  const text = raw.toLowerCase();
  const tokens = text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const uniqTokens = new Set(tokens);
  if (uniqTokens.size < 4) {
    return { ok: false, reason: "Add a few more distinct words." };
  }

  // Concept groups: need 2 of 4 (very forgiving)
  const groups = {
    water:  ["ocean","sea","water","waves","wave","blue","tide"],
    islands:["island","islands","archipelago","shore","beach","sand","atoll","isle","cay","cays"],
    aerial: ["aerial","overhead","top","topdown","top-down","birdseye","bird's-eye","satellite","map","from above"],
    codecue:["code","cipher","sequence","letters","numbers","alphanumeric","decode","message","hidden"]
  };

  const hits = {
    water:  groups.water.some(w => text.includes(w)),
    islands:groups.islands.some(w => text.includes(w)),
    aerial: groups.aerial.some(w => text.includes(w)),
    codecue:groups.codecue.some(w => text.includes(w))
  };

  const score = Object.values(hits).filter(Boolean).length;

  // If they mention islands + ocean OR islands + code OR ocean + code, that's enough.
  const strongPair =
    (hits.islands && hits.water) ||
    (hits.islands && hits.codecue) ||
    (hits.water && hits.codecue);

  if (!(score >= 2 || strongPair)) {
    return { ok: false, reason: "Not plausible. Mention environment and what you notice in it." };
  }

  return { ok: true, reason: "AI check passed. Continue." };
}

/* ====== ELEMENTS ====== */
const els = {
  btnHints: document.getElementById("btnHints"),
  btnContrast: document.getElementById("btnContrast"),

  aiInput: document.getElementById("aiInput"),
  aiValidate: document.getElementById("aiValidate"),
  aiClear: document.getElementById("aiClear"),

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
  setVisible("stage-code2", false);
  setVisible("stage-done", false);
  if (els.code1Input) {
    els.code1Input.value = "";
    els.code1Input.focus();
  }
}

function startBlinking() {
  setVisible("stage-code1", false);
  setVisible("stage-blink", true);

  // capture keyboard anywhere
  const focusBlink = () => els.blinkInput && els.blinkInput.focus();
  focusBlink();
  document.addEventListener("click", focusBlink, { capture: true });

  // infinite blinking white/black every 1s
  let isWhite = true;
  const apply = () => {
    if (els.blinkStage) els.blinkStage.style.background = isWhite ? "#FFFFFF" : "#000000";
  };
  apply();

  // keep interval handle on function object
  if (startBlinking._t) window.clearInterval(startBlinking._t);
  startBlinking._t = window.setInterval(() => {
    isWhite = !isWhite;
    apply();
  }, 1000);

  // immediate entry allowed
  els.blinkInput.value = "";
  els.blinkInput.addEventListener("keydown", onBlinkKeydown, { passive: false });
}

function stopBlinking() {
  if (startBlinking._t) window.clearInterval(startBlinking._t);
  startBlinking._t = null;
  setVisible("stage-blink", false);
  if (els.blinkInput) els.blinkInput.removeEventListener("keydown", onBlinkKeydown);
}

function onBlinkKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const v = normalizeSequence(els.blinkInput.value);
    if (v === PASS) {
      stopBlinking();
      goToOrigami();
    } else {
      // Nothing happens if wrong; clear input quietly.
      els.blinkInput.value = "";
    }
  }
}

function goToOrigami() {
  setVisible("stage-origami", true);

  // off-white background (not #FFFFFF)
  if (els.origamiStage) els.origamiStage.style.background = "#f7f4ef";

  // glide-in from left (once)
  els.origamiWord.style.transition =
    "left 900ms cubic-bezier(.2,.9,.2,1), opacity 500ms ease";
  els.origamiWord.style.left = "-40%";
  els.origamiWord.style.opacity = "0.95";
  void els.origamiWord.offsetWidth; // force layout
  els.origamiWord.style.left = "10%";

  // focus input anywhere
  const focusOrigami = () => els.origamiInput && els.origamiInput.focus();
  focusOrigami();
  document.addEventListener("click", focusOrigami, { capture: true });

  // stay visible until PASS is entered
  els.origamiInput.value = "";
  els.origamiInput.addEventListener("keydown", onOrigamiKeydown, { passive: false });
}

function onOrigamiKeydown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const v = normalizeSequence(els.origamiInput.value);
    els.origamiInput.value = "";

    if (v === PASS) {
      // glide out right, then proceed
      els.origamiWord.style.left = "120%";
      window.setTimeout(() => {
        els.origamiInput.removeEventListener("keydown", onOrigamiKeydown);
        setVisible("stage-origami", false);
        setVisible("stage-code2", true);
        if (els.code2Input) {
          els.code2Input.value = "";
          els.code2Input.focus();
        }
      }, 900);
    } else {
      // nothing happens if wrong
    }
  }
}

/* ====== VALIDATION ====== */
function validateCode1() {
  const guess = normalizeSequence(els.code1Input.value);
  const target = normalizeSequence(CODE1);

  if (guess === target) {
    if (els.code1Feedback) els.code1Feedback.textContent = "Accepted.";
    window.setTimeout(() => {
      if (els.code1Feedback) els.code1Feedback.textContent = "";
      startBlinking();
    }, 350);
    return;
  }

  tryAgain(els.code1Feedback);
}

function validateCode2() {
  const guess = normalizeSequence(els.code2Input.value);
  const target = normalizeSequence(CODE2);

  if (guess === target) {
    if (els.code2Feedback) els.code2Feedback.textContent = "Accepted.";
    window.setTimeout(() => {
      setVisible("stage-code2", false);
      setVisible("stage-done", true);
    }, 450);
    return;
  }

  tryAgain(els.code2Feedback);
}

/* ====== EVENTS ====== */
els.btnHints?.addEventListener("click", () => {
  showToast("Describe environment, objects, and what stands out.");
});

els.btnContrast?.addEventListener("click", () => {
  const on = document.body.classList.toggle("hc");
  els.btnContrast.setAttribute("aria-pressed", on ? "true" : "false");
});

els.aiValidate?.addEventListener("click", () => {
  const res = aiCheck(els.aiInput.value);
  setResult(res.reason, res.ok);

  if (res.ok) {
    window.setTimeout(() => {
      setResult("", false);
      goToStageCode1();
    }, 450);
  }
});

els.aiClear?.addEventListener("click", () => {
  els.aiInput.value = "";
  setResult("", false);
  els.aiInput.focus();
});

els.code1Btn?.addEventListener("click", validateCode1);
els.code1Input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validateCode1();
});

els.code2Btn?.addEventListener("click", validateCode2);
els.code2Input?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") validateCode2();
});

/* ====== INIT ====== */
window.addEventListener("load", () => {
  els.aiInput?.focus();
});
