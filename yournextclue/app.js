/* Global TRIVIA_BANK is loaded from trivia_bank.js */

const $ = (id) => document.getElementById(id);

const ui = {
  // steps
  stepTrivia: $("stepTrivia"),
  stepZoom: $("stepZoom"),
  stepReveal: $("stepReveal"),

  // panel
  panelTitle: $("panelTitle"),
  panelDesc: $("panelDesc"),
  statusPill: $("statusPill"),

  // stages
  stageTrivia: $("stageTrivia"),
  stageZoom: $("stageZoom"),
  stageReveal: $("stageReveal"),

  // trivia
  streak: $("streak"),
  remaining: $("remaining"),
  category: $("category"),
  question: $("question"),
  answer: $("answer"),
  submitAnswer: $("submitAnswer"),
  triviaMsg: $("triviaMsg"),
  resetProgress: $("resetProgress"),

  // zoom
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

  // reveal
  poemText: $("poemText"),
  copyPoem: $("copyPoem"),

  // side progress
  objective: $("objective"),
  pTrivia: $("pTrivia"),
  pZoom: $("pZoom"),
};

const STORAGE = {
  // Trivia: “retired” means attempted (right OR wrong) and will not reappear
  triviaRetired: "yn_trivia_retired_v2",
  triviaStreak: "yn_trivia_streak_v2",

  // Zoom
  zoomSolved: "yn_zoom_solved_v1",
  zoomStreak: "yn_zoom_streak_v1",
  imgCache: "yn_img_cache_v1"
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
  stage: "trivia", // trivia | zoom | reveal

  trivia: {
    target: 15,
    streak: 0,
    retired: new Set(),
    current: null
  },

  zoom: {
    target: 6,
    streak: 0,
    solved: new Set(),
    pool: [],
    current: null,
    zoomed: true
  }
};

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

function norm(s){
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[’‘]/g,"'")
    .replace(/[^a-z0-9%+\/\s\.\-\^\(\)=|]/g,"") // allow a few math tokens
    .replace(/\s+/g," ")
    .trim();
}

function setMsg(el, text, kind){
  el.textContent = text || "";
  el.className = "msg" + (kind ? (" " + kind) : "");
}

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
    ui.panelDesc.innerHTML = "Get <b>15 correct in a row</b>. Any miss resets the streak to 0. Any attempted question is removed on this device.";
    ui.statusPill.textContent = "Locked";
    ui.objective.textContent = "15 correct trivia answers in a row";
  } else if(stage === "zoom"){
    ui.panelTitle.textContent = "Stage 2 — Zoom Gate";
    ui.panelDesc.innerHTML = "Identify what you’re seeing. Start zoomed-in. If you’re wrong, it zooms out and you move on. Get <b>6 in a row</b>.";
    ui.statusPill.textContent = "Partially unlocked";
    ui.objective.textContent = "6 correct zoom identifications in a row";
  } else {
    ui.panelTitle.textContent = "Stage 3 — Reveal";
    ui.panelDesc.textContent = "You cleared both gates.";
    ui.statusPill.textContent = "Unlocked";
    ui.objective.textContent = "Read the payload";
  }

  renderSide();
}

function renderSide(){
  ui.pTrivia.textContent = `${state.trivia.streak} / ${state.trivia.target}`;
  ui.pZoom.textContent = `${state.zoom.streak} / ${state.zoom.target}`;
}

/* =========================
   Trivia Gate (retire on right OR wrong, never reveal correct answer)
========================= */

function triviaRemaining(){
  return window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id)).length;
}

function pickTrivia(){
  const pool = window.TRIVIA_BANK.filter(q => !state.trivia.retired.has(q.id));
  if(pool.length === 0){
    ui.question.textContent = "No trivia remaining on this device.";
    setMsg(ui.triviaMsg, "Reset progress to replay the full bank.", "warn");
    return;
  }

  const q = pool[Math.floor(Math.random() * pool.length)];
  state.trivia.current = q;

  ui.category.textContent = q.cat;
  ui.question.textContent = q.q;
  ui.answer.value = "";
  ui.answer.focus();
  setMsg(ui.triviaMsg, "", "");
  ui.remaining.textContent = String(triviaRemaining());
}

function checkTriviaAnswer(){
  const q = state.trivia.current;
  if(!q) return;

  const guess = norm(ui.answer.value);
  if(!guess){
    setMsg(ui.triviaMsg, "Enter an answer.", "bad");
    return;
  }

  // Retire the question no matter what (attempted = removed)
  state.trivia.retired.add(q.id);
  saveSet(STORAGE.triviaRetired, state.trivia.retired);

  const correct = new Set([norm(q.a), ...(q.alts || []).map(norm)]);
  const ok = correct.has(guess);

  if(ok){
    state.trivia.streak += 1;
    saveInt(STORAGE.triviaStreak, state.trivia.streak);
    ui.streak.textContent = String(state.trivia.streak);
    setMsg(ui.triviaMsg, "Correct.", "good");

    ui.remaining.textContent = String(triviaRemaining());
    renderSide();

    if(state.trivia.streak >= state.trivia.target){
      setMsg(ui.triviaMsg, "Gate cleared. Proceeding.", "good");
      setTimeout(async () => {
        setStage("zoom");
        await ensureImagePool();
        nextImage();
      }, 650);
      return;
    }

    setTimeout(pickTrivia, 350);
    return;
  }

  // Wrong: reset streak, do NOT reveal the answer
  state.trivia.streak = 0;
  saveInt(STORAGE.triviaStreak, 0);
  ui.streak.textContent = "0";
  setMsg(ui.triviaMsg, "Incorrect. Streak reset.", "bad");

  ui.remaining.textContent = String(triviaRemaining());
  renderSide();
  setTimeout(pickTrivia, 650);
}

/* =========================
   Zoom Gate (unchanged core; still metadata/fuzzy match)
========================= */

async function fetchFeaturedImages(target=400){
  const base = "https://commons.wikimedia.org/w/api.php";
  let cont = null;
  const out = [];

  while(out.length < target){
    const params = new URLSearchParams({
      action: "query",
      generator: "categorymembers",
      gcmtitle: "Category:Featured_pictures",
      gcmtype: "file",
      gcmlimit: "50",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "2400",
      format: "json",
      origin: "*"
    });

    if(cont){
      for(const [k,v] of Object.entries(cont)) params.set(k, v);
    }

    const url = `${base}?${params.toString()}`;
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) break;

    const data = await res.json();
    const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
    for(const p of pages){
      const ii = p.imageinfo?.[0];
      if(!ii?.thumburl) continue;
      out.push({
        pageid: p.pageid,
        title: p.title,
        url: ii.thumburl,
        meta: {
          objectName: ii.extmetadata?.ObjectName?.value || "",
          imageDescription: ii.extmetadata?.ImageDescription?.value || ""
        }
      });
    }

    if(!data.continue) break;
    cont = data.continue;
    if(pages.length === 0) break;
  }

  const uniq = new Map();
  for(const item of out){
    if(!uniq.has(item.pageid)) uniq.set(item.pageid, item);
  }
  return [...uniq.values()].slice(0, target);
}

function getCachedImages(){
  try{
    const raw = localStorage.getItem(STORAGE.imgCache);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || !Array.isArray(obj.items)) return null;
    if(Date.now() - (obj.ts || 0) > 7*24*3600*1000) return null;
    return obj.items;
  } catch {
    return null;
  }
}
function setCachedImages(items){
  localStorage.setItem(STORAGE.imgCache, JSON.stringify({ ts: Date.now(), items }));
}

async function ensureImagePool(){
  setMsg(ui.zoomMsg, "Loading image pool…", "warn");
  ui.imgMeta.hidden = true;

  const cached = getCachedImages();
  if(cached && cached.length >= 120){
    state.zoom.pool = cached;
    ui.imgPool.textContent = String(state.zoom.pool.length);
    setMsg(ui.zoomMsg, "Image pool ready.", "good");
    return;
  }

  try{
    const items = await fetchFeaturedImages(420);
    state.zoom.pool = items;
    setCachedImages(items);
    ui.imgPool.textContent = String(state.zoom.pool.length);
    setMsg(ui.zoomMsg, "Image pool ready.", "good");
  } catch (e){
    console.error(e);
    setMsg(ui.zoomMsg, "Failed to load images (network/CORS). Try refresh.", "bad");
  }
}

function deriveAnswerFromTitle(title){
  let t = title || "";
  t = t.replace(/^file:/i, "");
  t = decodeURIComponent(t);
  t = t.replace(/_/g, " ");
  t = t.replace(/\.[a-z0-9]{2,5}$/i, "");
  t = t.replace(/\s*\([^)]*\)\s*/g, " ");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t;
}

function stripHtml(s){
  return (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

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
function similarity(a,b){
  a = norm(a); b = norm(b);
  if(!a || !b) return 0;
  if(a === b) return 1;
  const dist = levenshtein(a,b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - (dist / maxLen);
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

  if(desc){
    if(g.length >= 6 && norm(desc).includes(g)) best = Math.max(best, 0.82);
  }

  const ok = best >= 0.78;
  return { ok, score: best };
}

function setZoom(scale, ox, oy){
  ui.zoomFrame.style.setProperty("--scale", String(scale));
  ui.zoomFrame.style.setProperty("--ox", `${ox}%`);
  ui.zoomFrame.style.setProperty("--oy", `${oy}%`);
}

function nextImage(){
  ui.imgMeta.hidden = true;
  ui.imgGuess.value = "";
  ui.imgGuess.focus();
  setMsg(ui.zoomMsg, "", "");

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
  ui.zoomImg.src = item.url;

  ui.imgAnswer.textContent = "—";
  ui.imgTitle.textContent = "—";
}

function zoomOutNow(){
  if(!state.zoom.current) return;
  state.zoom.zoomed = false;
  setZoom(1.0, 50, 50);
  ui.zoomPill.textContent = "Zoomed out";
}

function checkImageGuess(){
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

    setMsg(ui.zoomMsg, `Correct. (match score ${result.score.toFixed(2)})`, "good");

    if(state.zoom.streak >= state.zoom.target){
      setTimeout(() => {
        setStage("reveal");
        ui.poemText.textContent = POEM;
        ui.statusPill.textContent = "Unlocked";
      }, 650);
      return;
    }

    setTimeout(nextImage, 900);
  } else {
    state.zoom.streak = 0;
    saveInt(STORAGE.zoomStreak, 0);
    ui.zoomStreak.textContent = "0";
    setMsg(ui.zoomMsg, `Incorrect. Streak reset. (best score ${result.score.toFixed(2)})`, "bad");
    setTimeout(nextImage, 1100);
  }

  renderSide();
}

/* =========================
   Reset / init
========================= */

function resetAllProgress(){
  if(!confirm("This will reset trivia progress + zoom progress for this browser. Continue?")) return;

  localStorage.removeItem(STORAGE.triviaRetired);
  localStorage.removeItem(STORAGE.triviaStreak);
  localStorage.removeItem(STORAGE.zoomSolved);
  localStorage.removeItem(STORAGE.zoomStreak);

  state.trivia.retired = new Set();
  state.trivia.streak = 0;

  state.zoom.solved = new Set();
  state.zoom.streak = 0;

  ui.streak.textContent = "0";
  ui.zoomStreak.textContent = "0";

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

  setStage("trivia");
  pickTrivia();
  renderSide();
}

/* =========================
   Event wiring
========================= */

ui.submitAnswer.addEventListener("click", checkTriviaAnswer);
ui.answer.addEventListener("keydown", (e) => { if(e.key === "Enter") checkTriviaAnswer(); });
ui.resetProgress.addEventListener("click", resetAllProgress);

ui.refillImages.addEventListener("click", async () => {
  localStorage.removeItem(STORAGE.imgCache);
  await ensureImagePool();
  nextImage();
});

ui.submitGuess.addEventListener("click", checkImageGuess);
ui.imgGuess.addEventListener("keydown", (e) => { if(e.key === "Enter") checkImageGuess(); });
ui.zoomOut.addEventListener("click", zoomOutNow);

ui.copyPoem.addEventListener("click", async () => {
  try{ await navigator.clipboard.writeText(POEM); } catch {}
});

window.addEventListener("load", init);
