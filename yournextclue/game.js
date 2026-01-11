/* eslint-disable no-console */

// Minimal DOM helpers
const $ = (id) => document.getElementById(id);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const ui = {
  step1: $("step1"),
  step2: $("step2"),
  step3: $("step3"),

  panelTitle: $("panelTitle"),
  panelDesc: $("panelDesc"),
  poemStatus: $("poemStatus"),

  stage1: $("stage1"),
  stage2: $("stage2"),
  stage3: $("stage3"),

  canopy: $("canopy"),
  canopyScene: $("canopyScene"),
  l1Signal: $("l1Signal"),
  l1Target: $("l1Target"),
  l1Strikes: $("l1Strikes"),
  l1Outcome: $("l1Outcome"),
  l1Msg: $("l1Msg"),
  l1Reset: $("l1Reset"),

  stairs: $("stairs"),
  stairsScene: $("stairsScene"),
  l2Steps: $("l2Steps"),
  l2Target: $("l2Target"),
  l2Strikes: $("l2Strikes"),
  l2Outcome: $("l2Outcome"),
  l2Msg: $("l2Msg"),
  l2Reset: $("l2Reset"),

  objective: $("objective"),
  fragA: $("fragA"),
  fragB: $("fragB"),
  hardReset: $("hardReset"),

  pass: $("pass"),
  open: $("open"),
  qReset: $("qReset"),
  qMsg: $("qMsg"),
  unlockStatus: $("unlockStatus"),
  poemWrap: $("poemWrap"),
  poem: $("poem"),
  copyPoem: $("copyPoem"),
};

// Light obfuscation (this is a puzzle, not a security product)
function b64(s){ return atob(s); }
const FRAG_A = b64("U0lMRU5U");     // SILENT
const FRAG_B = b64("VVBTVEFJUlM="); // UPSTAIRS

const state = {
  stage: 1,

  gotA: false,
  gotB: false,

  // Lock 1
  l1: {
    strikes: 0,
    selected: [],
    targetIds: [],
    solved: false,
  },

  // Lock 2
  l2: {
    strikes: 0,
    picked: [],
    targetIds: [],
    solved: false,
  },

  poemDecrypted: false
};

function setMsg(el, text, kind){
  el.textContent = text || "";
  el.className = "msg" + (kind ? (" " + kind) : "");
}

function shake(el){
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

function progressUI(){
  ui.step1.className = "step" + (state.stage === 1 ? " active" : (state.stage > 1 ? " done" : ""));
  ui.step2.className = "step" + (state.stage === 2 ? " active" : (state.stage > 2 ? " done" : ""));
  ui.step3.className = "step" + (state.stage === 3 ? " active" : "");

  ui.stage1.classList.toggle("show", state.stage === 1);
  ui.stage2.classList.toggle("show", state.stage === 2);
  ui.stage3.classList.toggle("show", state.stage === 3);

  if(state.stage === 1){
    ui.panelTitle.textContent = "Lock 1 — The Canopy";
    ui.panelDesc.textContent = "Not everything that moves is useful. Trust what stays still. Read the canopy from high to low.";
    ui.objective.textContent = "Extract Fragment A";
  } else if(state.stage === 2){
    ui.panelTitle.textContent = "Lock 2 — The Stairwell";
    ui.panelDesc.textContent = "In a new kind of height, the path is obvious. Don’t measure it like a mountain.";
    ui.objective.textContent = "Extract Fragment B";
  } else {
    ui.panelTitle.textContent = "Lock 3 — The Quiet Room";
    ui.panelDesc.textContent = "Derive the passphrase from your fragments and decrypt the poem locally.";
    ui.objective.textContent = "Decrypt the poem";
  }

  if(state.gotA) ui.fragA.textContent = FRAG_A;
  if(state.gotB) ui.fragB.textContent = FRAG_B;
  if(state.poemDecrypted){
    ui.poemStatus.textContent = "Poem: decrypted";
  } else {
    ui.poemStatus.textContent = "Poem: encrypted";
  }
}

function setStage(n){
  state.stage = n;
  progressUI();
}

/* =========================
   LOCK 1 — CANOPY
   Goal: click ONLY still leaves, in strictly descending “height” (screen Y).
   No letters are revealed during attempts; only on solve.
========================= */

function rand(min, max){ return Math.random() * (max - min) + min; }
function choice(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

// Build deterministic “still” set with clear top→bottom ordering, plus drifting decoys.
// This is intentionally frustrating but fair: the only reliable signal is motion.
function buildCanopy(){
  ui.canopy.innerHTML = "";
  setMsg(ui.l1Msg, "", "");
  ui.l1Outcome.textContent = "No fragment acquired.";

  state.l1.strikes = 0;
  state.l1.selected = [];
  state.l1.solved = false;

  // Configure still leaves: 6 targets, positioned in descending y order with some x variety.
  const stillCount = FRAG_A.length; // 6
  const decoyCount = 9;

  const still = [];
  for(let i=0; i<stillCount; i++){
    still.push({
      id: `S${i}`,
      still: true,
      // ensure unique-ish y ordering: higher = smaller %
      y: 12 + i * 10.5 + rand(-1.4, 1.4),
      x: 18 + (i * 12) + rand(-8, 8),
      r: rand(-22, 22),
      s: rand(0.90, 1.07),
    });
  }

  const decoys = [];
  for(let i=0; i<decoyCount; i++){
    decoys.push({
      id: `D${i}`,
      still: false,
      y: rand(16, 78),
      x: rand(10, 92),
      r: rand(-26, 26),
      s: rand(0.86, 1.05),
    });
  }

  // Targets in the ONLY correct order: highest (smallest y) → lowest (largest y)
  still.sort((a,b) => a.y - b.y);
  state.l1.targetIds = still.map(o => o.id);

  const all = [...still, ...decoys].map(o => ({
    ...o,
    x: clamp(o.x, 8, 92)
  }));

  // Shuffle visual placement order so “DOM order” doesn’t help.
  all.sort(() => Math.random() - 0.5);

  ui.l1Target.textContent = String(stillCount);
  ui.l1Signal.textContent = "0";
  ui.l1Strikes.textContent = "0";

  for(const leaf of all){
    const el = document.createElement("div");
    el.className = "leaf" + (leaf.still ? "" : " decoy");
    el.style.left = `${leaf.x}%`;
    el.style.top = `${leaf.y}%`;
    el.style.setProperty("--r", `${leaf.r}deg`);
    el.style.setProperty("--s", `${leaf.s}`);
    el.dataset.id = leaf.id;
    el.dataset.still = leaf.still ? "1" : "0";

    el.addEventListener("click", () => onLeafClick(el));
    ui.canopy.appendChild(el);
  }
}

function l1Fail(reason){
  state.l1.strikes++;
  ui.l1Strikes.textContent = String(state.l1.strikes);
  setMsg(ui.l1Msg, reason, "bad");
  shake(ui.canopyScene);

  // Visually punish without revealing information
  ui.canopy.querySelectorAll(".leaf").forEach(el => el.classList.remove("selected"));
  state.l1.selected = [];
  ui.l1Signal.textContent = "0";

  // After repeated failures, increase frustration a bit: brief “leaf wilt” effect
  if(state.l1.strikes >= 3){
    ui.canopy.querySelectorAll(".leaf").forEach(el => {
      if(el.dataset.still === "0") return;
      el.style.opacity = "0.88";
    });
  }
}

function onLeafClick(el){
  if(state.l1.solved) return;

  const id = el.dataset.id;
  const isStill = el.dataset.still === "1";

  // Decoy click is immediate reset
  if(!isStill){
    l1Fail("Bad read. Motion is noise.");
    return;
  }

  // no double select
  if(state.l1.selected.includes(id)) return;

  // Must match strict order: targets[0], targets[1], ...
  const expected = state.l1.targetIds[state.l1.selected.length];
  if(id !== expected){
    l1Fail("Order violation. The canopy only reads high → low.");
    return;
  }

  state.l1.selected.push(id);
  el.classList.add("selected");
  ui.l1Signal.textContent = String(state.l1.selected.length);

  if(state.l1.selected.length === state.l1.targetIds.length){
    state.l1.solved = true;
    state.gotA = true;
    ui.l1Outcome.textContent = `Fragment A acquired: ${FRAG_A}`;
    setMsg(ui.l1Msg, "Signal locked. The canopy goes quiet.", "good");

    // Freeze leaves, drop decoys for flair
    ui.canopy.querySelectorAll(".leaf.decoy").forEach(d => d.classList.add("fall"));
    ui.fragA.textContent = FRAG_A;

    // Advance
    setTimeout(() => setStage(2), 650);
  } else {
    setMsg(ui.l1Msg, "Signal accepted.", "warn");
  }
}

/* =========================
   LOCK 2 — STAIRWELL
   “New kind of height” = stacking order (z-index), not Y-position.
   Goal: click only KEY steps in descending z-index sequence.
   No letters are shown until completion.
========================= */

function buildStairwell(){
  ui.stairs.innerHTML = "";
  setMsg(ui.l2Msg, "", "");
  ui.l2Outcome.textContent = "No fragment acquired.";

  state.l2.strikes = 0;
  state.l2.picked = [];
  state.l2.solved = false;

  const keyCount = FRAG_B.length; // 8
  const decoyCount = 10;

  // Create “key” steps with strictly descending z-index, but overlapping enough to hide the truth.
  const key = [];
  for(let i=0; i<keyCount; i++){
    // Higher “height” means higher z-index (on top)
    const z = 200 - i; // strict
    key.push({
      id: `K${i}`,
      key: true,
      z,
      x: 45 + i * 3.2 + rand(-7, 7),
      y: 60 - i * 4.5 + rand(-4, 4),
      rot: rand(-7, 7),
      scale: 0.95 + (z - 192) * 0.008 + rand(-0.02, 0.02),
      notch: 3
    });
  }

  // Decoys share similar positions and shadows to raise ambiguity.
  const decoy = [];
  for(let i=0; i<decoyCount; i++){
    decoy.push({
      id: `X${i}`,
      key: false,
      z: 140 + i, // mixed, some high-ish to mislead
      x: rand(18, 88),
      y: rand(18, 82),
      rot: rand(-10, 10),
      scale: rand(0.88, 1.04),
      notch: choice([1,2,4])
    });
  }

  // Target sequence: highest z → lowest z among key steps.
  key.sort((a,b) => b.z - a.z);
  state.l2.targetIds = key.map(o => o.id);

  const all = [...key, ...decoy];
  // Shuffle DOM insertion order; keep z-index controlling perception.
  all.sort(() => Math.random() - 0.5);

  ui.l2Target.textContent = String(keyCount);
  ui.l2Steps.textContent = "0";
  ui.l2Strikes.textContent = "0";

  for(const s of all){
    const el = document.createElement("div");
    el.className = "stepCard" + (s.key ? " key" : " bad");
    el.dataset.id = s.id;
    el.dataset.key = s.key ? "1" : "0";
    el.style.left = `${clamp(s.x, 8, 92)}%`;
    el.style.top = `${clamp(s.y, 10, 90)}%`;
    el.style.zIndex = String(s.z);
    el.style.setProperty("--rot", `${s.rot}deg`);
    el.style.setProperty("--scale", `${s.scale}`);

    const engrave = document.createElement("div");
    engrave.className = "engrave";
    for(let i=0; i<s.notch; i++){
      const n = document.createElement("div");
      n.className = "notch";
      engrave.appendChild(n);
    }
    el.appendChild(engrave);

    el.addEventListener("click", () => onStepClick(el));
    ui.stairs.appendChild(el);
  }
}

function l2Fail(reason){
  state.l2.strikes++;
  ui.l2Strikes.textContent = String(state.l2.strikes);
  setMsg(ui.l2Msg, reason, "bad");
  shake(ui.stairsScene);

  // Reset selection state without revealing the answer
  state.l2.picked = [];
  ui.l2Steps.textContent = "0";
  ui.stairs.querySelectorAll(".stepCard").forEach(el => el.classList.remove("locked"));
}

function onStepClick(el){
  if(state.l2.solved) return;

  const id = el.dataset.id;
  const isKey = el.dataset.key === "1";

  // Decoy immediately fails
  if(!isKey){
    l2Fail("Wrong metric. That step is loud, not high.");
    return;
  }

  // no double select
  if(state.l2.picked.includes(id)) return;

  const expected = state.l2.targetIds[state.l2.picked.length];
  if(id !== expected){
    l2Fail("Order violation. Height is not where it sits — it’s what sits on top.");
    return;
  }

  state.l2.picked.push(id);
  el.classList.add("locked");
  ui.l2Steps.textContent = String(state.l2.picked.length);

  if(state.l2.picked.length === state.l2.targetIds.length){
    state.l2.solved = true;
    state.gotB = true;
    ui.l2Outcome.textContent = `Fragment B acquired: ${FRAG_B}`;
    setMsg(ui.l2Msg, "The stairwell aligns. The room ahead goes quiet.", "good");
    ui.fragB.textContent = FRAG_B;

    // Drop decoys as flourish
    ui.stairs.querySelectorAll(".stepCard.bad").forEach(d => d.classList.add("fall"));

    setTimeout(() => setStage(3), 700);
  } else {
    setMsg(ui.l2Msg, "Accepted. Keep climbing.", "warn");
  }
}

/* =========================
   QUIET ROOM — decrypt poem.json using passphrase = fragmentA+fragmentB
========================= */

function normalize(s){
  return (s || "").toLowerCase().replace(/\s+/g, "");
}

function b64ToBytes(b64){
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deriveKey(passphrase, saltBytes, iterations){
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name:"PBKDF2", salt: saltBytes, iterations, hash:"SHA-256" },
    material,
    { name:"AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function decryptPoem(passphrase){
  const res = await fetch("./poem.json", { cache: "no-store" });
  if(!res.ok) throw new Error(`Failed to fetch poem.json (${res.status})`);
  const data = await res.json();

  const salt = b64ToBytes(data.kdf.saltB64);
  const iv = b64ToBytes(data.cipher.ivB64);
  const ct = b64ToBytes(data.cipher.ctB64);

  const key = await deriveKey(passphrase, salt, data.kdf.iterations);
  const ptBuf = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(ptBuf);
}

async function onDecrypt(){
  if(!state.gotA || !state.gotB){
    setMsg(ui.qMsg, "You don’t have both fragments yet.", "bad");
    return;
  }

  const expected = normalize(FRAG_A + FRAG_B);
  const got = normalize(ui.pass.value);

  if(!got){
    setMsg(ui.qMsg, "Enter the passphrase.", "bad");
    return;
  }
  if(got !== expected){
    setMsg(ui.qMsg, "Incorrect. Derive it from the fragments (A+B).", "bad");
    shake($("app"));
    return;
  }

  try{
    ui.unlockStatus.textContent = "Decrypting…";
    setMsg(ui.qMsg, "Decrypting locally…", "warn");
    const poem = await decryptPoem(got);

    ui.poem.textContent = poem;
    ui.poemWrap.hidden = false;
    ui.unlockStatus.textContent = "Unlocked";
    state.poemDecrypted = true;
    progressUI();
    setMsg(ui.qMsg, "Decrypted.", "good");
  } catch (e){
    console.error(e);
    ui.unlockStatus.textContent = "Locked";
    setMsg(ui.qMsg, "Decryption failed. If you changed poem.json, regenerate it to match.", "bad");
  }
}

/* =========================
   WIRING + RESET
========================= */

function hardReset(){
  // Global state
  state.stage = 1;
  state.gotA = false;
  state.gotB = false;
  state.poemDecrypted = false;

  // Lock state
  state.l1 = { strikes:0, selected:[], targetIds:[], solved:false };
  state.l2 = { strikes:0, picked:[], targetIds:[], solved:false };

  // UI state
  ui.fragA.textContent = "—";
  ui.fragB.textContent = "—";
  ui.pass.value = "";
  ui.poemWrap.hidden = true;
  ui.poem.textContent = "";
  ui.unlockStatus.textContent = "Locked";
  setMsg(ui.qMsg, "", "");

  buildCanopy();
  buildStairwell();
  setStage(1);
}

ui.l1Reset.addEventListener("click", () => buildCanopy());
ui.l2Reset.addEventListener("click", () => buildStairwell());
ui.hardReset.addEventListener("click", () => hardReset());

ui.open.addEventListener("click", () => onDecrypt());
ui.pass.addEventListener("keydown", (e) => { if(e.key === "Enter") onDecrypt(); });

ui.qReset.addEventListener("click", () => {
  ui.pass.value = "";
  ui.poemWrap.hidden = true;
  ui.poem.textContent = "";
  ui.unlockStatus.textContent = "Locked";
  state.poemDecrypted = false;
  progressUI();
  setMsg(ui.qMsg, "Reset.", "warn");
});

ui.copyPoem.addEventListener("click", async () => {
  try{
    await navigator.clipboard.writeText(ui.poem.textContent || "");
    setMsg(ui.qMsg, "Copied.", "good");
  } catch {
    setMsg(ui.qMsg, "Copy failed (browser permissions).", "bad");
  }
});

// Initialize
(function init(){
  if(!window.crypto?.subtle){
    $("app").innerHTML = `
      <div style="padding:24px">
        <div style="font-weight:800; font-size:18px; margin-bottom:6px;">Unsupported browser</div>
        <div style="color: rgba(255,255,255,.72); line-height:1.5;">
          This puzzle requires WebCrypto (crypto.subtle). Use a modern browser.
        </div>
      </div>
    `;
    return;
  }

  buildCanopy();
  buildStairwell();
  progressUI();
})();
