/* =========================
   The Archive — single-page flow (GitHub Pages friendly)
   ========================= */

(() => {
  // === CONFIG ===
  const ISLAND_CODE = "X47Y1ACGNJ";
  const OPERATOR_CODE = "1324";
  const BURNT_CODE = "2357";

  // Flash pattern: 15 cycles of [white 1s, black 1s] = 30s total
  const FLASH_CYCLES = 15;
  const FLASH_STEP_MS = 1000;

  // === DOM ===
  const stageHost = document.getElementById("stageHost");
  const toast = document.getElementById("toast");
  const toastText = document.getElementById("toastText");
  const flashOverlay = document.getElementById("flashOverlay");

  const btnHints = document.getElementById("btnHints");
  const hintsModal = document.getElementById("hintsModal");
  const btnCloseHints = document.getElementById("btnCloseHints");
  const btnContrast = document.getElementById("btnContrast");

  // === Helpers ===
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Normalize: remove spaces + punctuation, keep only A-Z0-9, uppercase.
  function normalizeEntry(raw) {
    return (raw || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  function showToast(message = "TRY AGAIN", durationMs = 1200) {
    toastText.textContent = message;
    toast.classList.add("is-on");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.remove("is-on"), durationMs);
  }

  function setStage(html) {
    stageHost.innerHTML = html;
  }

  function focusFirstInput() {
    const el = stageHost.querySelector("input");
    if (el) el.focus();
  }

  function setHighContrast(on) {
    document.body.classList.toggle("hicontrast", on);
    btnContrast.setAttribute("aria-pressed", String(on));
  }

  // === Modal controls ===
  btnHints.addEventListener("click", () => hintsModal.showModal());
  btnCloseHints.addEventListener("click", () => hintsModal.close());
  hintsModal.addEventListener("click", (e) => {
    const rect = hintsModal.getBoundingClientRect();
    const inDialog =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inDialog) hintsModal.close();
  });

  // === High contrast toggle ===
  let hc = false;
  btnContrast.addEventListener("click", () => {
    hc = !hc;
    setHighContrast(hc);
  });

  // === Stages ===
  function stage1_interpretation() {
    setStage(`
      <h3>Step 1</h3>
      <p>
        Describe what you believe this evidence represents. Be specific.
      </p>

      <div class="formrow">
        <input id="interpretation" class="input" type="text" inputmode="text" autocomplete="off"
          placeholder="What is this, in plain terms?" aria-label="Interpretation" />
        <button id="btnContinue1" class="btn" type="button">Continue</button>
      </div>

      <div class="smallnote">
        Tip: If you're unsure, consult an AI tool to validate whether your interpretation is meaningful.
      </div>
    `);

    const input = stageHost.querySelector("#interpretation");
    const btn = stageHost.querySelector("#btnContinue1");

    const proceed = () => {
      const v = (input.value || "").trim();
      // Gate lightly: require some effort without mentioning “code”
      if (v.length < 6) {
        showToast("ADD DETAIL");
        return;
      }
      stage2_codeEntry();
    };

    btn.addEventListener("click", proceed);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") proceed();
    });

    focusFirstInput();
  }

  function stage2_codeEntry() {
    setStage(`
      <h3>Step 2</h3>
      <p>
        Submit what you extracted from the evidence.
      </p>

      <div class="formrow">
        <input id="codeEntry" class="input" type="text" inputmode="text" autocomplete="off"
          placeholder="Enter your extracted sequence" aria-label="Extracted sequence" />
        <button id="btnValidate" class="btn" type="button">Validate</button>
        <button id="btnReset" class="btn secondary" type="button">Reset</button>
      </div>

      <div class="smallnote">
        Case-insensitive. Spaces and punctuation are ignored.
      </div>
    `);

    const input = stageHost.querySelector("#codeEntry");
    const btnValidate = stageHost.querySelector("#btnValidate");
    const btnReset = stageHost.querySelector("#btnReset");

    const validate = async () => {
      const normalized = normalizeEntry(input.value);
      if (normalized !== ISLAND_CODE) {
        showToast("TRY AGAIN");
        return;
      }

      // Correct → flash sequence (30s), then operator gate
      input.blur();
      await runFlashSequence();
      stage3_operatorGate1();
    };

    btnValidate.addEventListener("click", validate);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") validate();
    });
    btnReset.addEventListener("click", () => {
      input.value = "";
      input.focus();
    });

    focusFirstInput();
  }

  async function runFlashSequence() {
    // Disable interactions visually
    stageHost.querySelectorAll("button,input").forEach(el => el.disabled = true);

    // Ensure overlay is above everything
    flashOverlay.classList.add("is-on");

    for (let i = 0; i < FLASH_CYCLES; i++) {
      // White 1s
      flashOverlay.style.background = "#FFFFFF";
      flashOverlay.classList.add("is-on");
      await sleep(FLASH_STEP_MS);

      // Black 1s
      flashOverlay.style.background = "#000000";
      await sleep(FLASH_STEP_MS);
    }

    // Remove overlay
    flashOverlay.classList.remove("is-on");
    flashOverlay.style.background = "#FFFFFF";
  }

  function stage3_operatorGate1() {
    setStage(`
      <h3>Operator Gate</h3>
      <p>
        Awaiting authorization.
      </p>

      <div class="formrow">
        <input id="op1" class="input" type="password" inputmode="numeric" autocomplete="off"
          placeholder="••••" aria-label="Operator authorization" />
        <button id="btnOp1" class="btn" type="button">Submit</button>
      </div>

      <div class="smallnote">
        No feedback is provided for incorrect entries.
      </div>
    `);

    const input = stageHost.querySelector("#op1");
    const btn = stageHost.querySelector("#btnOp1");

    const submit = () => {
      const v = normalizeEntry(input.value);
      if (v === OPERATOR_CODE) {
        stage3_showOrigami();
      } else {
        // Intentionally silent (do nothing)
        input.value = "";
      }
    };

    btn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });

    focusFirstInput();
  }

  function stage3_showOrigami() {
    setStage(`
      <h3>Message</h3>
      <div class="divider"></div>
      <div style="display:grid; place-items:center; padding: 24px 8px;">
        <div style="font-size: 40px; font-weight: 950; letter-spacing: -.03em;">Origami</div>
      </div>
      <div class="divider"></div>
      <div class="formrow">
        <button id="btnContinueAfterOrigami" class="btn" type="button">Continue</button>
      </div>
    `);

    stageHost.querySelector("#btnContinueAfterOrigami").addEventListener("click", () => {
      stage4_operatorGate2();
    });
  }

  function stage4_operatorGate2() {
    setStage(`
      <h3>Operator Gate</h3>
      <p>
        Awaiting authorization.
      </p>

      <div class="formrow">
        <input id="op2" class="input" type="password" inputmode="numeric" autocomplete="off"
          placeholder="••••" aria-label="Operator authorization" />
        <button id="btnOp2" class="btn" type="button">Submit</button>
      </div>

      <div class="smallnote">
        No feedback is provided for incorrect entries.
      </div>
    `);

    const input = stageHost.querySelector("#op2");
    const btn = stageHost.querySelector("#btnOp2");

    const submit = () => {
      const v = normalizeEntry(input.value);
      if (v === OPERATOR_CODE) {
        stage5_burntMarksCode();
      } else {
        // Silent
        input.value = "";
      }
    };

    btn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });

    focusFirstInput();
  }

  function stage5_burntMarksCode() {
    setStage(`
      <h3>Final Entry</h3>
      <p>
        Submit the sequence indicated by the burned marks.
      </p>

      <div class="formrow">
        <input id="burnt" class="input" type="text" inputmode="numeric" autocomplete="off"
          placeholder="Enter sequence" aria-label="Burned marks sequence" />
        <button id="btnBurnt" class="btn" type="button">Validate</button>
      </div>

      <div class="smallnote">
        Case-insensitive. Spaces and punctuation are ignored.
      </div>
    `);

    const input = stageHost.querySelector("#burnt");
    const btn = stageHost.querySelector("#btnBurnt");

    const validate = () => {
      const v = normalizeEntry(input.value);
      if (v !== BURNT_CODE) {
        showToast("TRY AGAIN");
        return;
      }
      stage6_success();
    };

    btn.addEventListener("click", validate);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") validate();
    });

    focusFirstInput();
  }

  function stage6_success() {
    setStage(`
      <h3>Confirmed</h3>
      <p>
        Proceed.
      </p>
      <div class="divider"></div>
      <div class="smallnote">
        (End of current web flow.)
      </div>
    `);
  }

  // === Boot ===
  stage1_interpretation();
})();
