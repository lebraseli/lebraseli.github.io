"use strict";

/**
 * IMPORTANT SECURITY NOTE (blunt):
 * This is a static GitHub Pages site. Anyone can view app.js and read SECRET_CODE.
 * If you require real secrecy, you need server-side validation (Worker/Function).
 */
const SECRET_CODE = "X47Y1ACGNJ";

const NORMALIZE_INPUT = (s) =>
  (s || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "");

const EVIDENCE = {
  id: "E-001",
  title: "Island/Water Evidence",
  type: "map",
  tags: ["archipelago", "wavefield", "aerial"],
  src: "./assets/island-water.png",
  caption: "Single evidence tile. Use zoom to locate the embedded sequence.",
  meta: "PNG • User-provided • High detail recommended",
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[m]));
}

function countMismatchesPositional(a, b) {
  const minLen = Math.min(a.length, b.length);
  let mismatches = 0;
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) mismatches++;
  }
  mismatches += Math.abs(a.length - b.length);
  return mismatches;
}

function setResult(kind, html) {
  const el = document.getElementById("result");
  el.classList.remove("result--ok", "result--bad");
  if (kind === "ok") el.classList.add("result--ok");
  if (kind === "bad") el.classList.add("result--bad");
  el.innerHTML = html;
}

/**
 * Render single evidence card
 */
function renderEvidence() {
  const host = document.getElementById("evidenceCardHost");
  host.innerHTML = "";

  const card = document.createElement("button");
  card.type = "button";
  card.className = "artifact";
  card.setAttribute("aria-label", `Open evidence ${EVIDENCE.title} (${EVIDENCE.id})`);

  card.innerHTML = `
    <img class="artifact__img" src="${escapeHtml(EVIDENCE.src)}" alt="" loading="lazy" />
    <div class="artifact__body">
      <div class="artifact__title">
        <span>${escapeHtml(EVIDENCE.title)}</span>
        <span class="badge">${escapeHtml(EVIDENCE.id)}</span>
      </div>
      <div class="tagrow">
        ${EVIDENCE.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
      </div>
      <div class="muted" style="font-size:13px;">${escapeHtml(EVIDENCE.caption)}</div>
    </div>
  `;

  card.addEventListener("click", () => openModal(EVIDENCE));
  host.appendChild(card);
}

/**
 * Modal: image preview + zoom
 */
let currentZoom = 100;

function openModal(item) {
  const modal = document.getElementById("evidenceModal");
  const title = document.getElementById("modalTitle");
  const meta = document.getElementById("modalMeta");
  const img = document.getElementById("modalImg");
  const caption = document.getElementById("modalCaption");
  const zoomRange = document.getElementById("zoomRange");
  const zoomLabel = document.getElementById("zoomLabel");

  title.textContent = item.title;
  meta.textContent = `${item.id} • ${item.type} • Tags: ${item.tags.join(", ")}`;
  img.src = item.src;
  img.alt = `${item.title} preview`;
  caption.textContent = item.caption;

  currentZoom = 100;
  zoomRange.value = String(currentZoom);
  zoomLabel.textContent = `${currentZoom}%`;
  img.style.transform = `scale(${currentZoom / 100})`;

  modal.dataset.activeId = item.id;
  modal.showModal();
}

function closeModal() {
  const modal = document.getElementById("evidenceModal");
  if (modal.open) modal.close();
}

function setZoom(val) {
  const img = document.getElementById("modalImg");
  const zoomRange = document.getElementById("zoomRange");
  const zoomLabel = document.getElementById("zoomLabel");

  currentZoom = Math.max(50, Math.min(350, val));
  zoomRange.value = String(currentZoom);
  zoomLabel.textContent = `${currentZoom}%`;
  img.style.transform = `scale(${currentZoom / 100})`;
}

/**
 * Validation + success instructions (your updated narrative)
 */
function validateCode(userRaw) {
  const user = NORMALIZE_INPUT(userRaw);
  const target = SECRET_CODE;

  if (!user) {
    setResult("bad", `⚠️ <strong>Code required.</strong> <span class="muted">Enter the extracted alphanumeric sequence.</span>`);
    return;
  }

  const mismatches = countMismatchesPositional(user, target);

  if (user === target) {
    setResult("ok", `
      ✅ <strong>Verified.</strong>
      <span class="muted">Proceed to the next stage.</span>
      <div class="divider" style="margin:12px 0;"></div>
      <div>
        <div style="font-weight:700; margin-bottom:6px;">Next instruction (read carefully):</div>
        <div class="muted" style="line-height:1.55;">
          You will be given a separate parchment-style page with a horizontal number line labeled <strong>0–9</strong>,
          including tick marks. The parchment edge will be <strong>burned</strong> at specific positions along that line.
          <br/><br/>
          Interpret each burn as a selected digit. <strong>Order does not matter</strong>—collect the digits you find and enter them when prompted on the next page.
        </div>
      </div>
    `);
    return;
  }

  const lengthDelta = Math.abs(user.length - target.length);
  const lengthNote = lengthDelta === 0
    ? `<span class="kpi">Length OK</span>`
    : `<span class="kpi">Length off by ${lengthDelta}</span>`;

  setResult(
    "bad",
    `❌ <strong>Incorrect.</strong>
     <span class="kpi">${mismatches} wrong</span>
     ${lengthNote}
     <span class="muted">Re-check the evidence and resubmit.</span>`
  );
}

/**
 * Boot
 */
function init() {
  renderEvidence();

  const hintPanel = document.getElementById("hintPanel");
  const toggleHintsBtn = document.getElementById("toggleHintsBtn");
  toggleHintsBtn.addEventListener("click", () => {
    const nowHidden = hintPanel.classList.toggle("is-hidden");
    toggleHintsBtn.setAttribute("aria-pressed", String(!nowHidden));
  });

  const toggleContrastBtn = document.getElementById("toggleContrastBtn");
  toggleContrastBtn.addEventListener("click", () => {
    document.documentElement.classList.toggle("high-contrast");
    const enabled = document.documentElement.classList.contains("high-contrast");
    toggleContrastBtn.setAttribute("aria-pressed", String(enabled));
  });

  const form = document.getElementById("codeForm");
  const input = document.getElementById("codeInput");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    validateCode(input.value);
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    input.value = "";
    setResult("", `ℹ️ <span class="muted">Open the evidence, extract the sequence, then submit it.</span>`);
    input.focus();
  });

  // Modal wiring
  document.getElementById("closeModalBtn").addEventListener("click", closeModal);

  const modal = document.getElementById("evidenceModal");
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.getElementById("zoomRange").addEventListener("input", (e) => {
    setZoom(parseInt(e.target.value, 10));
  });

  document.getElementById("zoomInBtn").addEventListener("click", () => setZoom(currentZoom + 10));
  document.getElementById("zoomOutBtn").addEventListener("click", () => setZoom(currentZoom - 10));

  document.getElementById("copyEvidenceIdBtn").addEventListener("click", async () => {
    const id = modal.dataset.activeId || "";
    try {
      await navigator.clipboard.writeText(id);
      setResult("", `📋 <strong>Copied.</strong> <span class="muted">Evidence ID ${escapeHtml(id)} copied.</span>`);
    } catch {
      setResult("bad", `⚠️ <strong>Copy failed.</strong> <span class="muted">Clipboard access blocked.</span>`);
    }
  });

  setResult("", `ℹ️ <span class="muted">Open the evidence, extract the sequence, then submit it.</span>`);
}

init();
