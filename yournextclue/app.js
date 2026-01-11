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
  triviaRetired: "yn_trivia_retired_v6",
  triviaStreak: "yn_trivia_streak_v6",
  zoomSolved: "yn_zoom_solved_v4",
  zoomStreak: "yn_zoom_streak_v4",
  imgCache: "yn_img_cache_v4"
};

const OVERRIDE_CODE = "1324";

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

async function fadeSwap(el, updateFn, ms=220){
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

function isOverride(input){
  return norm(input) === OVERRIDE_CODE;
}

function setMsg(el, text, kind){
  el.textContent = text || "";
  el.className = "msg" + (kind ? (" " + kind) : "");
}

/* =========================
   REMOVE UNWANTED STATIC COPY (SAFE: NO HIDING)
========================= */

const UNWANTED_PHRASES = [
  "Policy: misses reset streaks. That’s the contract.",
  "Policy: misses reset streaks. That's the contract.",
  "If you want “AI evaluation,” you need a backend or a paid API key exposed to the client (not recommended).",
  "If you want \"AI evaluation,\" you need a backend or a paid API key exposed to the client (not recommended).",
  "No hand-holding.",
  "No hand-holding",
  "This system intentionally enforces pressure. Your team should feel friction, then have a clean “ohhhh” moment on the zoom gate.",
  "This system intentionally enforces pressure. Your team should feel friction, then have a clean \"ohhhh\" moment on the zoom gate.",
  "“Remove solved items” is enforced per browser via local storage. Different devices = fresh pool.",
  "\"Remove solved items\" is enforced per browser via local storage. Different devices = fresh pool.",
  "Images are fetched from Wikimedia Commons Featured pictures in real time (no assets needed). Judging uses fuzzy matching against title/metadata. It’s deterministic and good enough for humans.",
  "Images are fetched from Wikimedia Commons Featured pictures in real time (no assets needed). Judging uses fuzzy matching against title/metadata. It's deterministic and good enough for humans."
];

function stripUnwantedTextNodes(){
  try{
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let n;
    while((n = walker.nextNode())) nodes.push(n);

    for(const node of nodes){
      let t = node.nodeValue || "";
      let changed = false;
      for(const phrase of UNWANTED_PHRASES){
        if(t.includes(phrase)){
          t = t.split(phrase).join("");
          changed = true;
        }
      }
      if(changed){
        t = t.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
        node.nodeValue = t;
      }
    }
  } catch {}
}

function setStageSubtitle(stage){
  const el =
    document.getElementById("subtitle") ||
    document.getElementById("tagline") ||
    document.querySelector(".subtitle") ||
    document.querySelector("[data-role='subtitle']");
  if(!el) return;

  if(stage === "trivia") el.textContent = "Get 15 correct in a row.";
  else if(stage === "zoom") el.textContent = "Get 6 correct in a row.";
  else el.textContent = "";
}

/* =========================
   TYPO TOLERANCE (TRIVIA)
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

    // prevent 1-2 char hacks (e.g., "a")
    if(g.length >= 3 && tn.length >= 3 && (tn.includes(g) || g.includes(tn))) return true;

    if(typoOk(g, tn)) return true;
  }
  return false;
}

/* =========================
   STAGE CONTROL
========================= */

function setStage(stage){
  state.stage = stage;
  document.body.dataset.stage = stage;

  ui.stepTrivia.className = "step" + (stage === "trivia" ? " active" : (stage !== "trivia" ? " done" : ""));
  ui.stepZoom.className = "step" + (stage === "zoom" ? " active" : (stage === "reveal" ? " done" : ""));
  ui.stepReveal.className = "step" + (stage === "reveal" ? " active" : "");

  ui.stageTrivia.classList.toggle("show", stage === "trivia");
  ui.stageZoom.classList.toggle("show", stage === "zoom");
  ui.stageReveal.classList.toggle("show", stage === "reveal");

  if(stage === "trivia"){
    ui.panelTitle.textContent = "Stage 1 — Trivia Gate";
    ui.panelDesc.innerHTML = "Get <b>15 correct in a row</b>.";
    ui.statusPill.textContent = "Locked";
    ui.objective.textContent = "15 correct in a row";
  } else if(stage === "zoom"){
    ui.panelTitle.textContent = "Stage 2 — Zoom Gate";
    ui.panelDesc.innerHTML = "Identify a <b>small everyday object</b> from an extreme zoom. Get <b>6 correct in a row</b>.";
    ui.statusPill.textContent = "Partially unlocked";
    ui.objective.textContent = "6 correct in a row";
    if(ui.imgGuess) ui.imgGuess.placeholder = "e.g., key, coin, pen, mug, apple…";
  } else {
    ui.panelTitle.textContent = "Stage 3 — Reveal";
    ui.panelDesc.textContent = "";
    ui.statusPill.textContent = "Unlocked";
    ui.objective.textContent = "";
  }

  setStageSubtitle(stage);
  renderSide();
  stripUnwantedTextNodes();

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
    ui.question.textContent = "No trivia remaining in this session.";
    setMsg(ui.triviaMsg, "Reload the page to reset remaining.", "warn");
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

function bypassToZoom(){
  state.trivia.streak = state.trivia.target;
  ui.streak.textContent = String(state.trivia.streak);
  renderSide();
  setMsg(ui.triviaMsg, "Override accepted.", "good");

  setTimeout(async () => {
    setStage("zoom");
    const ok = await ensureImagePool(true);
    if(ok) await nextImage();
  }, 200);
}

function checkTriviaAnswer(){
  const rawGuess = ui.answer.value || "";
  if(isOverride(rawGuess)){
    bypassToZoom();
    return;
  }

  const q = state.trivia.current;
  if(!q) return;

  const guess = norm(rawGuess);
  if(!guess){
    setMsg(ui.triviaMsg, "Enter an answer.", "bad");
    return;
  }

  // retire on any attempt (session-only)
  state.trivia.retired.add(q.id);

  const truths = [q.a, ...(q.alts || [])];
  const ok = matchesAny(rawGuess, truths);

  if(ok){
    state.trivia.streak += 1;
    ui.streak.textContent = String(state.trivia.streak);
    ui.remaining.textContent = String(triviaRemaining());
    setMsg(ui.triviaMsg, "Correct.", "good");
    renderSide();

    if(state.trivia.streak >= state.trivia.target){
      setMsg(ui.triviaMsg, "Gate cleared.", "good");
      setTimeout(async () => {
        setStage("zoom");
        const ok2 = await ensureImagePool(true);
        if(ok2) await nextImage();
      }, 280);
      return;
    }

    setTimeout(pickTrivia, 520);
    return;
  }

  state.trivia.streak = 0;
  ui.streak.textContent = "0";
  ui.remaining.textContent = String(triviaRemaining());
  setMsg(ui.triviaMsg, `Incorrect. Answer: ${q.a}`, "bad");
  renderSide();

  setTimeout(pickTrivia, 900);
}

/* =========================
   ZOOM — SMALL OBJECT POOL (NO “IMAGE” ANSWERS)
========================= */

function getCachedImages(){
  try{
    const raw = localStorage.getItem(STORAGE.imgCache);
    if(!raw) return null;
    const obj = JSON.parse(raw);
    if(!obj || !Array.isArray(obj.items)) return null;
    if(Date.now() - (obj.ts || 0) > 7*24*3600*1000) return null;
    return obj.items;
  } catch { return null; }
}
function setCachedImages(items){
  localStorage.setItem(STORAGE.imgCache, JSON.stringify({ ts: Date.now(), items }));
}

function stripHtml(s){
  return (s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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

/**
 * We only accept images that can be classified as “small everyday objects”.
 * If we can’t classify them → they never enter the pool.
 */
const SMALL_OBJECT_LABELS = new Set([
  "key","coin","pen","pencil","marker","eraser","book","notebook",
  "mug","cup","bottle","spoon","fork","knife","plate",
  "apple","banana","orange","strawberry",
  "watch","ring","bracelet",
  "phone","calculator","remote",
  "scissors","tape","glue",
  "screw","bolt","nut","nail",
  "toy","dice","card",
  "flower"
]);

const LABEL_RULES = [
  { label:"key", keys:["key","keys","keyring"] },
  { label:"coin", keys:["coin","coins","penny","nickel","dime","quarter","euro"] },
  { label:"pen", keys:["pen","ballpoint","fountain pen"] },
  { label:"pencil", keys:["pencil","graphite pencil"] },
  { label:"marker", keys:["marker","felt tip","sharpie"] },
  { label:"eraser", keys:["eraser","rubber eraser"] },
  { label:"book", keys:["book","hardcover","paperback","book cover"] },
  { label:"notebook", keys:["notebook","journal","notepad"] },

  { label:"mug", keys:["mug"] },
  { label:"cup", keys:["cup","teacup","glass"] },
  { label:"bottle", keys:["bottle","water bottle"] },
  { label:"spoon", keys:["spoon","tablespoon","teaspoon"] },
  { label:"fork", keys:["fork"] },
  { label:"knife", keys:["knife","kitchen knife"] },
  { label:"plate", keys:["plate","dish","saucer"] },

  { label:"apple", keys:["apple"] },
  { label:"banana", keys:["banana"] },
  { label:"orange", keys:["orange","citrus"] },
  { label:"strawberry", keys:["strawberry","strawberries"] },

  { label:"watch", keys:["watch","wristwatch"] },
  { label:"ring", keys:["ring"] },
  { label:"bracelet", keys:["bracelet"] },

  { label:"phone", keys:["phone","smartphone","iphone","android phone"] },
  { label:"calculator", keys:["calculator"] },
  { label:"remote", keys:["remote","remote control"] },

  { label:"scissors", keys:["scissors"] },
  { label:"tape", keys:["tape","masking tape","duct tape"] },
  { label:"glue", keys:["glue","glue stick"] },

  { label:"screw", keys:["screw"] },
  { label:"bolt", keys:["bolt"] },
  { label:"nut", keys:["nut","hex nut"] },
  { label:"nail", keys:["nail","nails"] },

  { label:"toy", keys:["toy","lego","doll","action figure"] },
  { label:"dice", keys:["dice","die"] },
  { label:"card", keys:["playing card","cards"] },

  { label:"flower", keys:["flower","blossom"] },
];

function labelAliases(label){
  const map = {
    pen: ["ballpoint","fountain pen"],
    marker: ["felt tip","sharpie"],
    eraser: ["rubber"],
    phone: ["smartphone","cell phone","cellphone"],
    mug: ["cup"], // accept “cup” for mug
    cup: ["mug","glass"],
    bottle: ["water bottle"],
    scissors: ["shears"],
    card: ["playing card"],
    dice: ["die"],
  };
  return map[label] || [];
}

function classifySmallObject(item){
  const title = stripHtml(deriveAnswerFromTitle(item.title || ""));
  const obj = stripHtml(item.meta?.objectName || "");
  const desc = stripHtml(item.meta?.imageDescription || "");
  const blob = norm([title, obj, desc].join(" "));

  for(const r of LABEL_RULES){
    for(const k of r.keys){
      if(blob.includes(norm(k))) return r.label;
    }
  }
  return null;
}

function guessMatchesSmall(guess, item){
  const g = norm(guess);
  if(g.length < 3) return { ok:false, label:item._label || "object" };

  const label = item._label || "object";
  const truths = [label, ...labelAliases(label)];

  // Don’t accept substring hacks for short guesses.
  if(g.length < 3) return { ok:false, label };

  // strict-ish match: exact / typo / synonym (no “a”)
  if(matchesAny(guess, truths)) return { ok:true, label };

  // mild typo tolerance against the core label only
  if(typoOk(g, label)) return { ok:true, label };

  return { ok:false, label };
}

/* Wikimedia Commons category titles that skew toward small objects */
const OBJECT_CATEGORY_TITLES = [
  "Category:Keys",
  "Category:Coins",
  "Category:Pens",
  "Category:Pencils",
  "Category:Markers",
  "Category:Erasers",
  "Category:Books",
  "Category:Notebooks",

  "Category:Mugs",
  "Category:Cups",
  "Category:Bottles",
  "Category:Spoons",
  "Category:Forks",
  "Category:Knives",
  "Category:Plates",

  "Category:Apples",
  "Category:Bananas",
  "Category:Oranges",
  "Category:Strawberries",

  "Category:Watches",
  "Category:Rings",
  "Category:Bracelets",

  "Category:Mobile phones",
  "Category:Calculators",
  "Category:Remote controls",

  "Category:Scissors",
  "Category:Adhesive tape",
  "Category:Glue",

  "Category:Screws",
  "Category:Bolts",
  "Category:Nuts",
  "Category:Nails",

  "Category:Toys",
  "Category:Dice",
  "Category:Playing cards",

  "Category:Flowers"
];

async function fetchCategoryFileTitles(categoryTitle, limit=80){
  const base = "https://commons.wikimedia.org/w/api.php";
  const titles = [];
  let cmcontinue = null;

  while(titles.length < limit){
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: categoryTitle,
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

      const it = {
        pageid: p.pageid,
        title: p.title,
        url: ii.thumburl,
        meta: {
          objectName: ii.extmetadata?.ObjectName?.value || "",
          imageDescription: ii.extmetadata?.ImageDescription?.value || ""
        }
      };
      items.push(it);
    }
  }

  const uniq = new Map();
  for(const it of items){
    if(!uniq.has(String(it.pageid))) uniq.set(String(it.pageid), it);
  }
  return [...uniq.values()];
}

async function buildSmallObjectPool(target=220){
  // pull from multiple object categories; dedupe titles; fetch imageinfo; classify; keep only classifiable
  const titleSet = new Set();
  for(const cat of OBJECT_CATEGORY_TITLES){
    try{
      const t = await fetchCategoryFileTitles(cat, 80);
      for(const x of t) titleSet.add(x);
      if(titleSet.size >= target * 2) break;
      await sleep(60);
    } catch {}
  }

  const titles = [...titleSet].slice(0, target * 2);
  if(titles.length === 0) return [];

  const items = await fetchImageInfoForTitles(titles);

  const filtered = [];
  for(const it of items){
    const label = classifySmallObject(it);
    if(!label) continue;
    if(!SMALL_OBJECT_LABELS.has(label)) continue;
    it._label = label; // persist label so we never “answer: image”
    filtered.push(it);
  }

  // If we’re short, that’s OK: better small & solvable than huge & random.
  return filtered.slice(0, target);
}

async function ensureImagePool(allowUIMessage=false){
  if(allowUIMessage) setMsg(ui.zoomMsg, "Loading objects…", "warn");
  ui.imgMeta.hidden = true;

  const cached = getCachedImages();
  if(cached && cached.length >= 80){
    state.zoom.pool = cached;
    ui.imgPool.textContent = String(state.zoom.pool.length);
    if(allowUIMessage) setMsg(ui.zoomMsg, "", "");
    return true;
  }

  try{
    const items = await buildSmallObjectPool(240);
    if(!items || items.length < 40){
      state.zoom.pool = items || [];
      ui.imgPool.textContent = String(state.zoom.pool.length);
      if(allowUIMessage) setMsg(ui.zoomMsg, "Couldn’t load enough object images. Try Refresh image pool.", "bad");
      return state.zoom.pool.length > 0;
    }

    state.zoom.pool = items;
    setCachedImages(items);
    ui.imgPool.textContent = String(items.length);
    if(allowUIMessage) setMsg(ui.zoomMsg, "", "");
    return true;
  } catch (e){
    console.error(e);
    if(allowUIMessage) setMsg(ui.zoomMsg, "Failed to load objects (likely a blocker). Try Refresh with blockers off.", "bad");
    return false;
  }
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
    setMsg(ui.zoomMsg, "Object pool is empty. Click refresh image pool.", "bad");
    ui.imgPool.textContent = "0";
    return;
  }

  const available = state.zoom.pool.filter(x => !state.zoom.solved.has(String(x.pageid)));
  ui.imgPool.textContent = String(available.length);

  if(available.length === 0){
    setMsg(ui.zoomMsg, "No objects left. Refresh the pool.", "bad");
    return;
  }

  const item = available[Math.floor(Math.random() * available.length)];
  state.zoom.current = item;
  state.zoom.zoomed = true;

  // Extreme zoom, but "focused": bias toward center (object photos are usually centered)
  const ox = Math.floor(45 + (Math.random()*20 - 10));
  const oy = Math.floor(45 + (Math.random()*20 - 10));
  const scale = 7.0 + Math.random()*2.2; // MUCH more zoomed
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

function bypassToReveal(){
  state.zoom.streak = state.zoom.target;
  ui.zoomStreak.textContent = String(state.zoom.streak);
  renderSide();

  setStage("reveal");
  ui.poemText.textContent = POEM;
  ui.statusPill.textContent = "Unlocked";
}

async function checkImageGuess(){
  const raw = ui.imgGuess.value || "";
  if(isOverride(raw)){
    bypassToReveal();
    return;
  }

  const item = state.zoom.current;
  if(!item){
    setMsg(ui.zoomMsg, "No image loaded yet.", "bad");
    return;
  }

  const g = norm(raw);
  if(g.length < 3){
    setMsg(ui.zoomMsg, "Too short. Use 3+ characters (e.g., “key”, “coin”, “pen”).", "bad");
    return;
  }

  const result = guessMatchesSmall(raw, item);

  // Always reveal full image so there's an “oh” moment either way
  zoomOutNow();

  ui.imgMeta.hidden = false;
  ui.imgAnswer.textContent = item._label || result.label || "object";
  ui.imgTitle.textContent = item.title.replace(/^File:/i,"");

  if(result.ok){
    state.zoom.streak += 1;
    ui.zoomStreak.textContent = String(state.zoom.streak);

    state.zoom.solved.add(String(item.pageid));
    saveSet(STORAGE.zoomSolved, state.zoom.solved);

    setMsg(ui.zoomMsg, `Correct — ${item._label}.`, "good");

    if(state.zoom.streak >= state.zoom.target){
      setTimeout(() => {
        setStage("reveal");
        ui.poemText.textContent = POEM;
        ui.statusPill.textContent = "Unlocked";
      }, 320);
      return;
    }

    await sleep(650);
    await nextImage();
    renderSide();
    return;
  }

  // Wrong: show a meaningful object label (never “image”)
  state.zoom.streak = 0;
  ui.zoomStreak.textContent = "0";

  const lab = item._label || result.label || "object";
  setMsg(ui.zoomMsg, `Incorrect. It was a ${lab}.`, "bad");
  renderSide();

  await sleep(950);
  await nextImage();
}

/* =========================
   RESET / INIT
========================= */

function resetAllProgress(){
  if(!confirm("This will reset progress for this browser. Continue?")) return;

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
  try{
    if(!window.TRIVIA_BANK || !Array.isArray(window.TRIVIA_BANK) || window.TRIVIA_BANK.length < 200){
      ui.question.textContent = "Trivia bank missing or invalid.";
      setMsg(ui.triviaMsg, "Ensure trivia_bank.js is loaded before app.js.", "bad");
      return;
    }

    // ✅ Every reload: reset “remaining” and both streaks
    localStorage.removeItem(STORAGE.triviaRetired);
    localStorage.removeItem(STORAGE.triviaStreak);
    localStorage.removeItem(STORAGE.zoomStreak);

    state.trivia.retired = new Set();
    state.trivia.streak = 0;
    ui.streak.textContent = "0";

    // keep solved list (optional). delete this line if you want solved objects to reset on reload too.
    state.zoom.solved = loadSet(STORAGE.zoomSolved);

    state.zoom.streak = 0;
    ui.zoomStreak.textContent = "0";

    ui.remaining.textContent = String(triviaRemaining());
    ui.zoomTarget.textContent = String(state.zoom.target);

    triviaCard?.classList.add("swapFade","isIn");
    zoomWrap?.classList.add("swapFade","isIn");

    setStage("trivia");
    pickTrivia();
    renderSide();

    ensureImagePool(false).then(() => {
      ui.imgPool.textContent = String(state.zoom.pool.length || 0);
    });

    stripUnwantedTextNodes();
    setTimeout(stripUnwantedTextNodes, 250);
    setTimeout(stripUnwantedTextNodes, 900);
  } catch (e){
    console.error(e);
    const banner = document.createElement("div");
    banner.style.position = "fixed";
    banner.style.left = "12px";
    banner.style.right = "12px";
    banner.style.bottom = "12px";
    banner.style.zIndex = "9999";
    banner.style.padding = "12px 14px";
    banner.style.borderRadius = "12px";
    banner.style.background = "rgba(200,40,80,0.18)";
    banner.style.border = "1px solid rgba(200,40,80,0.35)";
    banner.style.color = "#fff";
    banner.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    banner.textContent = "App error. Open DevTools → Console to see the stack trace.";
    document.body.appendChild(banner);
  }
}

/* =========================
   EVENTS
========================= */

ui.submitAnswer.addEventListener("click", checkTriviaAnswer);
ui.answer.addEventListener("keydown", (e) => { if(e.key === "Enter") checkTriviaAnswer(); });
ui.resetProgress.addEventListener("click", resetAllProgress);

ui.refillImages.addEventListener("click", async () => {
  localStorage.removeItem(STORAGE.imgCache);
  setMsg(ui.zoomMsg, "Refreshing objects…", "warn");
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
