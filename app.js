"use strict";

/**
 * =========================
 * CONFIG
 * =========================
 * NOTE: This is a front-end-only puzzle. Anyone can view app.js and see SECRET_CODE.
 * If you need real secrecy, you must validate server-side.
 */
const SECRET_CODE = "X47Y1ACGNJ"; // correct code

const NORMALIZE_INPUT = (s) =>
  (s || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "");

const ARTIFACTS = [
  {
    id: "A-113",
    title: "Ocean Survey Tile",
    type: "map",
    tags: ["wavefield", "tile", "aerial"],
    src: "./assets/island-water.png",
    caption: "High-frequency wave texture. No annotations.",
    meta: "Resolution: provided • Format: PNG",
  },
  {
    id: "B-204",
    title: "Harbor Ledger Scan",
    type: "scan",
    tags: ["ledger", "shipping", "numbers"],
    src: "./assets/decoy-1.png",
    caption: "A scan from a cargo ledger. Looks useful. Isn’t.",
    meta: "Scan batch: 07 • Contrast normalized",
  },
  {
    id: "C-318",
    title: "Compass Rose Draft",
    type: "diagram",
    tags: ["compass", "vector", "draft"],
    src: "./assets/decoy-2.png",
    caption: "A clean diagram intended to misdirect attention.",
    meta: "Draft: v3 • No embedded code",
  },
  {
    id: "D-409",
    title: "Islet Photo Stack",
    type: "photo",
    tags: ["archipelago", "telephoto", "sun"],
    src: "./assets/decoy-3.png",
    caption: "A photo that invites zooming. It won’t pay off.",
    meta: "Lens: long • Color: corrected",
  },
  {
    id: "E-522",
    title: "Weather Fax Print",
    type: "note",
    tags: ["fax", "noise", "grain"],
    src: "./assets/decoy-4.png",
    caption: "Classic-looking noise that suggests hidden text.",
    meta: "Paper: aged • Ink: uneven",
  },
  {
    id: "F-601",
    title: "Route Planning Sheet",
    type: "map",
    tags: ["routes", "grid", "coordinates"],
    src: "./assets/decoy-5.png",
    caption: "A route sheet designed to seem like a cipher grid.",
    meta: "Grid: stylized • No key present",
  },
];

/**
 * =========================
 * UTILITIES
 * =========================
 */
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

  // Count extra length as mismatches (this is the "how many wrong" behavior you asked for)
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
 * =========================
 * RENDER: ARTIFACT GRID
 * =========================
 */
function renderArtifacts(list) {
  const grid = document.getElementById("artifactGrid");
  grid.innerHTML = "";

  for (const a of list) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "artifact";
    card.setAttribute("aria-label", `Open artifact ${a.title} (${a.id})`);

    card.innerHTML = `
      <img class="artifact__img" src="${escapeHtml(a.src)}" alt="" loading="lazy" />
      <div class="artifact__body">
        <div class="artifact__title">
          <span>${escapeHtml(a.title)}</span>
          <span class="badge">${escapeHtml(a.id)}</span>
        </div>
        <div class="tagrow">
          ${a.tags.slice(0, 4).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
        </div>
        <div class="muted" style="font-size:13px;">${escapeHtml(a.caption)}</div>
      </div>
    `;

    card.addEventListener("click", () => openModal(a));
    grid.appendChild(card);
  }

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "card";
    empty.style.padding = "14px";
    empty.innerHTML = `<strong>No matches.</strong> <span class="muted">Try a different filter.</span>`;
    grid.appendChild(empty);
  }
}

/**
 * =========================
 * FILTERS
 * =========================
 */
function applyFilters() {
  const q = (document.getElementById("searchInput").value || "").trim().toLowerCase();
  const type = document.getElementById("typeFilter").value;

  const filtered = ARTIFACTS.filter(a => {
    const hay = `${a.id} ${a.title} ${a.type} ${a.tags.join(" ")}`.toLowerCase();
    const qOk = !q || hay.includes(q);
    const tOk = (type === "all") || (a.type === type);
    return qOk && tOk;
  });

  renderArtifacts(filtered);
}

/**
 * =========================
 * MODAL: IMAGE PREVIEW + ZOOM
 * =========================
 */
let currentZoom = 100;

function openModal(artifact) {
  const modal = document.getElementById("artifactModal");
  const title = document.getElementById("modalTitle");
  const meta = document.getElementById("modalMeta");
  const img = document.getElementById("modalImg");
  const caption = document.getElementById("modalCaption");
  const zoomRange = document.getElementById("zoomRange");
  const zoomLabel = document.getElementById("zoomLabel");

  title.textContent = artifact.title;
  meta.textContent = `${artifact.id} • Type: ${artifact.type} • Tags: ${artifact.tags.join(", ")}`;
  img.src = artifact.src;
  img.alt = `${artifact.title} preview`;
  caption.textContent = artifact.caption;

  currentZoom = 100;
  zoomRange.value = String(currentZoom);
  zoomLabel.textContent = `${currentZoom}%`;
  img.style.transform = `scale(${currentZoom / 100})`;

  modal.dataset.activeId = artifact.id;
  modal.showModal();
}

function closeModal() {
  const modal = document.getElementById("artifactModal");
  if (modal.open) modal.close();
}

function setZoom(val) {
  const img = document.getElementById("modalImg");
  const zoomRange = document.getElementById("zoomRange");
  const zoomLabel = document.getElementById("zoomLabel");

  currentZoom = Math.max(50, Math.min(300, val));
  zoomRange.value = String(currentZoom);
  zoomLabel.textContent = `${currentZoom}%`;
  img.style.transform = `scale(${currentZoom / 100})`;
}

/**
 * =========================
 * VALIDATION
 * =========================
 */
function validateCode(userRaw) {
  const user = NORMALIZE_INPUT(userRaw);
  const target = SECRET_CODE;

  if (!user) {
    setResult("bad", `⚠️ <strong>Enter a code.</strong> <span class="muted">Alphanumeric only.</span>`);
    return;
  }

  const mismatches = countMismatchesPositional(user, target);

  if (user === target) {
    setResult("ok", `✅ <strong>Access granted.</strong> <span class="muted">Code verified.</span>`);
    return;
  }

  const lengthDelta = Math.abs(user.length - target.length);
  const lengthNote = lengthDelta === 0
    ? `<span class="kpi">Length OK</span>`
    : `<span class="kpi">Length off by ${lengthDelta}</span>`;

  setResult(
    "bad",
    `❌ <strong>Not quite.</strong>
     <span class="kpi">${mismatches} wrong</span>
     ${lengthNote}
     <span class="muted">Refine and resubmit.</span>`
  );
}

/**
 * =========================
 * BOOT
 * =========================
 */
function init() {
  renderArtifacts(ARTIFACTS);

  document.getElementById("searchInput").addEventListener("input", applyFilters);
  document.getElementById("typeFilter").addEventListener("change", applyFilters);

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
    setResult("", `ℹ️ <span class="muted">Open artifacts, identify the correct one, then submit the code.</span>`);
    input.focus();
  });

  // Modal wiring
  document.getElementById("closeModalBtn").addEventListener("click", closeModal);

  const modal = document.getElementById("artifactModal");
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.getElementById("zoomRange").addEventListener("input", (e) => {
    setZoom(parseInt(e.target.value, 10));
  });

  document.getElementById("zoomInBtn").addEventListener("click", () => setZoom(currentZoom + 10));
  document.getElementById("zoomOutBtn").addEventListener("click", () => setZoom(currentZoom - 10));

  document.getElementById("copyArtifactIdBtn").addEventListener("click", async () => {
    const id = modal.dataset.activeId || "";
    try {
      await navigator.clipboard.writeText(id);
      setResult("", `📋 <strong>Copied.</strong> <span class="muted">Artifact ID ${escapeHtml(id)} copied.</span>`);
    } catch {
      setResult("bad", `⚠️ <strong>Copy failed.</strong> <span class="muted">Clipboard access blocked.</span>`);
    }
  });

  setResult("", `ℹ️ <span class="muted">Open artifacts, identify the correct one, then submit the code.</span>`);
}

init();
