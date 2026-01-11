/* Global TRIVIA_BANK is loaded from trivia_bank.js */

const $ = (id) => document.getElementById(id);

const ui = {
  stepTrivia: $("stepTrivia"),
  stepZoom: $("stepZoom"),
  stepReveal: $("stepReveal"),

  panelTitle: $("panelTitle"),
  panelDesc: $("panelDesc"),
  statusPill: $("statusPill"),

  stageTrivia: $("stageTrivia"),
  stageZoom: $("stageZoom"),
  stageReveal: $("stageReveal"),

  streak: $("streak"),
  remaining: $("remaining"),
  category: $("category"),
  question: $("question"),
  answer: $("answer"),
  submitAnswer: $("submitAnswer"),
  triviaMsg: $("triviaMsg"),
  resetProgress: $("resetProgress"),

  zoomStreak: $("zoomStreak"),
  zoomTarget: $("zoomTarget"),
  imgPool: $("imgPool"),
  refillImages: $("refillImages"),
  zoomFrame: $("zoomFrame"),
  zoomImg: $("zoomImg"),
  zoomPill: $("zoomPill"),
  imgGuess: $("imgGuess"),
  submitGuess: $("submitGuess"),
  zoomOut: $("zoomOut"),
  zoomMsg: $("zoomMsg"),
  imgMeta: $("imgMeta"),
  imgAnswer: $("imgAnswer"),
  imgTitle: $("imgTitle"),

  poemText: $("poemText"),
  copyPoem: $("copyPoem"),

  objective: $("objective"),
  pTrivia: $("pTrivia"),
  pZoom: $("pZoom"),
};

const triviaCard = document.querySelector("#stageTrivia .qCard");
const zoomWrap = document.querySelector("#stageZoom .zoomWrap");

const STORAGE = {
  triviaRetired: "yn_trivia_retired_v3",
  triviaStreak: "yn_trivia_streak_v3",
  zoomSolved: "yn_zoom_solved_v1",
  zoomStreak: "yn_zoom_streak_v1",
  imgCache: "yn_img_cache_v3" // bumped again due to fallback logic
};

const POEM = [
  "Echoes of leaves still drift in your mind,",
  "Lingering high where the treetops aligned.",
  "In a new kind of height the answer now hides,",
  "Somewhere the stairway quietly guides.",
  "Beyond the floor where the busy feet roam,",
  "Every step feels closer to home.",
  "Deeper inside where the ceilings grow,",
  "Riddles begin to softly glow.",
  "Out of the noise and daily gloom,",
  "Onward you move to a quieter room.",
  "Mysteries wait for the ones who assume."
].join("\n");

const state = {
  stage: "trivia",
  trivia: { target: 15, streak: 0, retired: new Set(), current: null },
  zoom: { target: 6, streak: 0, solved: new Set(), pool: [], current: null, zoomed: true }
};

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function fadeSwap(el, updateFn, ms=240){
  if(!el) { updateFn(); return; }
  el.classList.add("swapFade");
  el.classList.remove("isIn");
  el.classList.add("isOut");
  await sleep(ms);
  updateFn();
  requestAnimationFrame(() => {
    el.classList.remove("isOut");
    el.classList.add("isIn");
  });
}

function loadSet(key){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}
function saveSet(key, set){
  localStorage.setItem(key, JSON.stringify([...set]));
}
function loadInt(key, fallback=0){
  const v = Number(localStorage.getItem(key));
  return Number.isFinite(v) ? v : fallback;
}
function saveInt(key, v){
  localStorage.setItem(key, String(v));
}

/* Normalization (for typo tolerance, punctuation/case differences) */
function norm(s){
  return (s || "")
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g,"'")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function setMsg(el, text, kind){
  el.textContent = text || "";
  el.className = "msg" + (kind ? (" " + kind) : "");
}

/* =========================
   TYPO-TOLERANT MATCHING (TRIVIA + ZOOM)
========================= */

function levenshtein(a,b){
  a = norm(a); b = norm(b);
  const m = a.length, n = b.length;
  if(m === 0) return n;
  if(n === 0) return m;
  const dp = new Array(n+1);
  for(let j=0; j<=n; j++) dp[j] = j;
  for(let i=1; i<=m; i++){
    let prev = dp[0];
    dp[0] = i;
    for(let j=1; j<=n; j++){
      const temp = dp[j];
      const cost = a[i-1] === b[j-1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j-1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

function typoOk(guess, truth){
  const g = norm(guess);
  const t = norm(truth);
  if(!g || !t) return false;
  if(g === t) return true;

  const dist = levenshtein(g, t);
  const L = Math.max(g.length, t.length);

  if(L <= 4) return dist <= 1;
  if(L <= 7) return dist <= 1;
  if(L <= 12) return dist <= 2;
  return dist <= 3;
}

function matchesAny(guess, truths){
  const g = norm(guess);
  if(!g) return false;
  for(const t of truths){
    if(!t) continue;
    const tn = norm(t);
    if(g === tn) return true;
    if(g.length >= 3 && (tn.includes(g) || g.includes(tn))) return true;
    if(typoOk(g, tn)) return true;
  }
  return false;
}

function similarity(a,b){
  a = norm(a); b = norm(b);
  if(!a || !b) return 0;
  if(a === b) return 1;
  const dist = levenshtein(a,b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - (dist / maxLen);
}

/* =========================
   STAGE CONTROL
========================= */

function setStage(stage){
  state.stage = stage;

  ui.stepTrivia.className = "step" + (stage === "trivia" ? " active" : (stage !== "trivia" ? " done" : ""));
  ui.stepZoom.className = "step" + (stage === "zoom" ? " active" : (stage === "reveal" ? " done" : ""));
  ui.stepReveal.className = "step" + (stage === "reveal" ? " active" : "");

  ui.stageTrivia.classList.toggle("show", stage === "trivia");
  ui.stageZoom.classList.toggle("show", stage === "zoom");
  ui.stageReveal.classList.toggle("show", stage === "reveal");

  if(stage === "trivia"){
    ui.panelTitle.textContent = "Stage 1 — Trivia Gate";
    ui.panelDesc.innerHTML = "Get <b>15 correct in a row</b>. Any miss resets streak to 0. Any attempted question is removed on this device.";
    ui.statusPill.textContent = "Locked";
    ui.objective.textContent = "15 correct trivia answers in a row";
  } else if(stage === "zoom"){
    ui.panelTitle.textContent = "Stage 2 — Zoom Gate";
    ui.panelDesc.innerHTML = "Identify the subject from a brutal zoom crop. Get <b>6 in a row</b>. Wrong shows the reveal, then you move on.";
    ui.statusPill.textContent = "Partially unlocked";
    ui.objective.textContent = "6 correct zoom identifications in a row";
  } else {
    ui.panelTitle.textContent = "Stage 3 — Reveal";
    ui.panelDesc.textContent = "You cleared both gates.";
    ui.statusPill.textContent = "Unlocked";
    ui.objective.textContent = "Read the payload";
  }

  // Auto-load zoom pool when entering zoom stage (prevents Pool 0 + no image)
  if(stage === "zoom"){
    setTimeout(async () => {
      if(state.zoom.pool.length === 0){
        const ok = await ensureImagePool(true);
        if(ok && !state.zoom.current) await nextImage();
      } else if(!state.zoom.current){
        await nextImage();
      }
    }, 0);
  }

  renderSide();
}

function renderSide(){
  ui.pTrivia.textContent = `${state.trivia.streak} / ${state.trivia.target}`;
  ui.pZoom.textContent = `${state.zoom.streak} / ${state.zoom.target}`;
}

/* =========================
   TRIVIA
========================= */

function triviaRemaining(){
  return window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id)).length;
}

function pickTrivia(){
  const pool = window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id));
  if(pool.length === 0){
    ui.question.textContent = "No trivia remaining on this device.";
    setMsg(ui.triviaMsg, "Reset progress to replay.", "warn");
    return;
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  state.trivia.current = q;

  fadeSwap(triviaCard, () => {
    ui.category.textContent = q.cat;
    ui.question.textContent = q.q;
    ui.answer.value = "";
    setMsg(ui.triviaMsg, "", "");
    ui.remaining.textContent = String(triviaRemaining());
  }, 180);

  setTimeout(() => ui.answer.focus(), 0);
}

function checkTriviaAnswer(){
  const q = state.trivia.current;
  if(!q) return;

  const rawGuess = ui.answer.value;
  const guess = norm(rawGuess);
  if(!guess){
    setMsg(ui.triviaMsg, "Enter an answer.", "bad");
    return;
  }

  // Retire on any attempt
  state.trivia.retired.add(q.id);
  saveSet(STORAGE.triviaRetired, state.trivia.retired);

  // Typo-tolerant correctness
  const truths = [q.a, ...(q.alts || [])];
  const ok = matchesAny(rawGuess, truths);

  if(ok){
    state.trivia.streak += 1;
    saveInt(STORAGE.triviaStreak, state.trivia.streak);
    ui.streak.textContent = String(state.trivia.streak);
    ui.remaining.textContent = String(triviaRemaining());
    setMsg(ui.triviaMsg, "Correct.", "good");
    renderSide();

    if(state.trivia.streak >= state.trivia.target){
      setMsg(ui.triviaMsg, "Gate cleared. Proceeding.", "good");
      setTimeout(async () => {
        setStage("zoom");
        const ok2 = await ensureImagePool(true);
        if(ok2) await nextImage();
      }, 650);
      return;
    }

    setTimeout(pickTrivia, 520);
    return;
  }

  // Wrong: show the answer (question is retired anyway)
  state.trivia.streak = 0;
  saveInt(STORAGE.triviaStreak, 0);
  ui.streak.textContent = "0";
  ui.remaining.textContent = String(triviaRemaining());
  setMsg(ui.triviaMsg, `Incorrect. Answer: ${q.a}`, "bad");
  renderSide();

  setTimeout(pickTrivia, 900);
}

/* =========================
   ZOOM (robust Wikimedia fetch + fallback)
========================= */

function getCachedImages(){
  try{
    const raw = localStorage.getItem(STORAGE.imgCache);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || !Array.isArray(obj.items)) return null;
    // TTL: 7 days
    if(Date.now() - (obj.ts || 0) > 7*24*3600*1000) return null;
    return obj.items;
  } catch { return null; }
}
function setCachedImages(items){
  localStorage.setItem(STORAGE.imgCache, JSON.stringify({ ts: Date.now(), items }));
}

async function fetchFeaturedFileTitles(limit=450){
  const base = "https://commons.wikimedia.org/w/api.php";
  const titles = [];
  let cmcontinue = null;

  while(titles.length < limit){
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: "Category:Featured_pictures",
      cmtype: "file",
      cmlimit: "50",
      format: "json",
      origin: "*"
    });
    if(cmcontinue) params.set("cmcontinue", cmcontinue);

    const res = await fetch(`${base}?${params.toString()}`, { cache: "no-store" });
    if(!res.ok) break;

    const data = await res.json();
    const cms = data?.query?.categorymembers || [];
    for(const it of cms){
      if(it?.title) titles.push(it.title);
    }
    cmcontinue = data?.continue?.cmcontinue;
    if(!cmcontinue || cms.length === 0) break;
  }

  return titles.slice(0, limit);
}

async function fetchImageInfoForTitles(titles){
  const base = "https://commons.wikimedia.org/w/api.php";
  const items = [];

  for(let i=0; i<titles.length; i+=40){
    const chunk = titles.slice(i, i+40);
    const params = new URLSearchParams({
      action: "query",
      prop: "imageinfo",
      titles: chunk.join("|"),
      iiprop: "url|extmetadata",
      iiurlwidth: "2400",
      format: "json",
      origin: "*"
    });

    const res = await fetch(`${base}?${params.toString()}`, { cache: "no-store" });
    if(!res.ok) continue;

    const data = await res.json();
    const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
    for(const p of pages){
      const ii = p.imageinfo?.[0];
      if(!ii?.thumburl) continue;
      items.push({
        pageid: p.pageid,
        title: p.title,
        url: ii.thumburl,
        meta: {
          objectName: ii.extmetadata?.ObjectName?.value || "",
          imageDescription: ii.extmetadata?.ImageDescription?.value || ""
        }
      });
    }
  }

  const uniq = new Map();
  for(const it of items){
    if(!uniq.has(String(it.pageid))) uniq.set(String(it.pageid), it);
  }
  return [...uniq.values()];
}

async function fetchFeaturedImagesRobust(target=400){
  const titles = await fetchFeaturedFileTitles(target + 60);
  if(titles.length === 0) return [];
  const items = await fetchImageInfoForTitles(titles);
  return items.slice(0, target);
}

// Fallback: random Commons files
async function fetchRandomImages(target=250){
  const base = "https://commons.wikimedia.org/w/api.php";
  const items = [];
  const seen = new Set();

  for(let attempt=0; attempt<12 && items.length < target; attempt++){
    const params = new URLSearchParams({
      action: "query",
      generator: "random",
      grnnamespace: "6",
      grnlimit: "50",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "2400",
      format: "json",
      origin: "*"
    });

    const res = await fetch(`${base}?${params.toString()}`, { cache: "no-store" });
    if(!res.ok) continue;

    const data = await res.json();
    const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
    for(const p of pages){
      const ii = p.imageinfo?.[0];
      if(!ii?.thumburl) continue;
      if(seen.has(String(p.pageid))) continue;
      seen.add(String(p.pageid));

      items.push({
        pageid: p.pageid,
        title: p.title,
        url: ii.thumburl,
        meta: {
          objectName: ii.extmetadata?.ObjectName?.value || "",
          imageDescription: ii.extmetadata?.ImageDescription?.value || ""
        }
      });
      if(items.length >= target) break;
    }

    await sleep(120);
  }

  return items;
}

async function ensureImagePool(allowUIMessage=false){
  if(allowUIMessage) setMsg(ui.zoomMsg, "Loading image pool…", "warn");
  ui.imgMeta.hidden = true;

  const cached = getCachedImages();
  if(cached && cached.length >= 60){
    state.zoom.pool = cached;
    ui.imgPool.textContent = String(state.zoom.pool.length);
    if(allowUIMessage) setMsg(ui.zoomMsg, "Image pool ready.", "good");
    return true;
  }

  let items = [];
  try{
    items = await fetchFeaturedImagesRobust(320);
  } catch (e){
    console.warn("Featured fetch failed:", e);
  }

  if(!items || items.length < 40){
    if(allowUIMessage) setMsg(ui.zoomMsg, "Featured pool failed. Falling back to random Commons files…", "warn");
    try{
      const fallback = await fetchRandomImages(240);
      items = (items || []).concat(fallback);
    } catch (e){
      console.warn("Random fallback failed:", e);
    }
  }

  const uniq = new Map();
  for(const it of (items || [])){
    if(it && it.pageid != null && it.url) uniq.set(String(it.pageid), it);
  }
  const finalItems = [...uniq.values()];

  state.zoom.pool = finalItems;
  ui.imgPool.textContent = String(finalItems.length);

  if(finalItems.length === 0){
    const hint =
      "No images returned. This is usually a blocker (Brave Shields/uBlock/Privacy Badger) or a restrictive network. " +
      "Disable blockers for this site, then click “Refresh image pool”.";
    if(allowUIMessage) setMsg(ui.zoomMsg, hint, "bad");
    return false;
  }

  setCachedImages(finalItems);
  if(allowUIMessage) setMsg(ui.zoomMsg, "Image pool ready.", "good");
  return true;
}

function deriveAnswerFromTitle(title){
  let t = title || "";
  t = t.replace(/^file:/i, "");
  try { t = decodeURIComponent(t); } catch {}
  t = t.replace(/_/g, " ");
  t = t.replace(/\.[a-z0-9]{2,5}$/i, "");
  t = t.replace(/\s*\([^)]*\)\s*/g, " ");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t;
}

function stripHtml(s){
  return (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function guessMatches(guess, item){
  const g = norm(guess);
  if(!g) return { ok:false, score:0 };

  const titleAns = deriveAnswerFromTitle(item.title);
  const obj = stripHtml(item.meta?.objectName || "");
  const desc = stripHtml(item.meta?.imageDescription || "");

  const truths = [titleAns, obj].filter(Boolean);

  for(const t of truths){
    const tn = norm(t);
    if(tn && (tn.includes(g) || g.includes(tn))) return { ok:true, score:0.98 };
  }

  let best = 0;
  for(const t of truths){
    best = Math.max(best, similarity(g, t));
  }
  if(desc && g.length >= 6 && norm(desc).includes(g)) best = Math.max(best, 0.82);

  return { ok: best >= 0.78, score: best };
}

function setZoom(scale, ox, oy){
  ui.zoomFrame.style.setProperty("--scale", String(scale));
  ui.zoomFrame.style.setProperty("--ox", `${ox}%`);
  ui.zoomFrame.style.setProperty("--oy", `${oy}%`);
}

async function nextImage(){
  ui.imgMeta.hidden = true;
  ui.imgGuess.value = "";
  setMsg(ui.zoomMsg, "", "");
  ui.zoomImg.classList.remove("broken");

  if(state.zoom.pool.length === 0){
    setMsg(ui.zoomMsg, "Image pool is empty. Click refresh image pool.", "bad");
    ui.imgPool.textContent = "0";
    return;
  }

  const available = state.zoom.pool.filter(x => !state.zoom.solved.has(String(x.pageid)));
  ui.imgPool.textContent = String(available.length);

  if(available.length === 0){
    setMsg(ui.zoomMsg, "No images left in your pool. Refresh the pool.", "bad");
    return;
  }

  const item = available[Math.floor(Math.random() * available.length)];
  state.zoom.current = item;
  state.zoom.zoomed = true;

  const ox = Math.floor(15 + Math.random()*70);
  const oy = Math.floor(15 + Math.random()*70);
  const scale = 4.8 + Math.random()*2.2;
  setZoom(scale, ox, oy);

  ui.zoomPill.textContent = "Zoomed";

  await fadeSwap(zoomWrap, () => {
    ui.zoomImg.src = item.url;
    ui.imgAnswer.textContent = "—";
    ui.imgTitle.textContent = "—";
  }, 180);

  ui.zoomImg.onload = () => ui.imgGuess.focus();
  ui.zoomImg.onerror = () => {
    ui.zoomImg.classList.add("broken");
    setMsg(ui.zoomMsg, "Image failed to load. Skipping.", "warn");
    state.zoom.solved.add(String(item.pageid));
    saveSet(STORAGE.zoomSolved, state.zoom.solved);
    setTimeout(nextImage, 650);
  };
}

function zoomOutNow(){
  if(!state.zoom.current) return;
  state.zoom.zoomed = false;
  setZoom(1.0, 50, 50);
  ui.zoomPill.textContent = "Zoomed out";
}

async function checkImageGuess(){
  const item = state.zoom.current;
  if(!item){
    setMsg(ui.zoomMsg, "No image loaded yet.", "bad");
    return;
  }

  const guess = ui.imgGuess.value;
  if(!guess.trim()){
    setMsg(ui.zoomMsg, "Enter a guess.", "bad");
    return;
  }

  const result = guessMatches(guess, item);

  zoomOutNow();

  const answer = deriveAnswerFromTitle(item.title);
  ui.imgMeta.hidden = false;
  ui.imgAnswer.textContent = answer;
  ui.imgTitle.textContent = item.title.replace(/^File:/i,"");

  if(result.ok){
    state.zoom.streak += 1;
    ui.zoomStreak.textContent = String(state.zoom.streak);

    state.zoom.solved.add(String(item.pageid));
    saveSet(STORAGE.zoomSolved, state.zoom.solved);

    saveInt(STORAGE.zoomStreak, state.zoom.streak);

    setMsg(ui.zoomMsg, `Correct.`, "good");

    if(state.zoom.streak >= state.zoom.target){
      setTimeout(() => {
        setStage("reveal");
        ui.poemText.textContent = POEM;
        ui.statusPill.textContent = "Unlocked";
      }, 650);
      return;
    }

    await sleep(700);
    await nextImage();
    renderSide();
    return;
  }

  state.zoom.streak = 0;
  saveInt(STORAGE.zoomStreak, 0);
  ui.zoomStreak.textContent = "0";

  setMsg(ui.zoomMsg, `Incorrect. Answer: ${answer}`, "bad");
  renderSide();

  await sleep(1100);
  await nextImage();
}

/* =========================
   RESET / INIT
========================= */

function resetAllProgress(){
  if(!confirm("This will reset trivia + zoom progress for this browser. Continue?")) return;

  localStorage.removeItem(STORAGE.triviaRetired);
  localStorage.removeItem(STORAGE.triviaStreak);
  localStorage.removeItem(STORAGE.zoomSolved);
  localStorage.removeItem(STORAGE.zoomStreak);
  localStorage.removeItem(STORAGE.imgCache);

  state.trivia.retired = new Set();
  state.trivia.streak = 0;

  state.zoom.solved = new Set();
  state.zoom.streak = 0;
  state.zoom.pool = [];
  state.zoom.current = null;

  ui.streak.textContent = "0";
  ui.zoomStreak.textContent = "0";
  ui.imgPool.textContent = "0";

  setMsg(ui.triviaMsg, "Progress reset.", "warn");
  setMsg(ui.zoomMsg, "", "");

  setStage("trivia");
  pickTrivia();
  renderSide();
}

function init(){
  if(!window.TRIVIA_BANK || !Array.isArray(window.TRIVIA_BANK) || window.TRIVIA_BANK.length < 200){
    ui.question.textContent = "Trivia bank missing or invalid.";
    setMsg(ui.triviaMsg, "Ensure trivia_bank.js is loaded before app.js.", "bad");
    return;
  }

  state.trivia.retired = loadSet(STORAGE.triviaRetired);
  state.trivia.streak = loadInt(STORAGE.triviaStreak, 0);
  ui.streak.textContent = String(state.trivia.streak);

  state.zoom.solved = loadSet(STORAGE.zoomSolved);
  state.zoom.streak = loadInt(STORAGE.zoomStreak, 0);
  ui.zoomStreak.textContent = String(state.zoom.streak);

  ui.remaining.textContent = String(triviaRemaining());
  ui.zoomTarget.textContent = String(state.zoom.target);

  triviaCard?.classList.add("swapFade","isIn");
  zoomWrap?.classList.add("swapFade","isIn");

  setStage("trivia");
  pickTrivia();
  renderSide();

  // background prefetch so zoom stage is ready when you get there
  ensureImagePool(false).then((ok) => {
    ui.imgPool.textContent = String(state.zoom.pool.length || 0);
    // do NOT auto-start zoom here; only when stage becomes zoom
  });
}

/* =========================
   EVENTS
========================= */

ui.submitAnswer.addEventListener("click", checkTriviaAnswer);
ui.answer.addEventListener("keydown", (e) => { if(e.key === "Enter") checkTriviaAnswer(); });
ui.resetProgress.addEventListener("click", resetAllProgress);

ui.refillImages.addEventListener("click", async () => {
  localStorage.removeItem(STORAGE.imgCache);
  setMsg(ui.zoomMsg, "Refreshing image pool…", "warn");
  const ok = await ensureImagePool(true);
  if(ok) await nextImage();
});

ui.submitGuess.addEventListener("click", checkImageGuess);
ui.imgGuess.addEventListener("keydown", (e) => { if(e.key === "Enter") checkImageGuess(); });
ui.zoomOut.addEventListener("click", zoomOutNow);

ui.copyPoem.addEventListener("click", async () => {
  try{ await navigator.clipboard.writeText(POEM); } catch {}
});

window.addEventListener("load", init);
