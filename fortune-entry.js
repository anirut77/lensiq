/* fortune-entry.js — fortune theme "ราตรีคราม" (owner approval 2026-11-17): the entry screen (a deity, its name and one
 * short blessing line, then the menu) and the menu card illustrations. Only on fortune.html and cat-fortune.html.
 * REVIEW TABLE = DEITIES below: only items with status "approved" (+ reviewedBy, reviewedAt) are ever shown; all ship
 * "pending Merit review". Rules, how to approve, preview flag and storage keys: docs/FORTUNE-THEME.md. */
(function (root) {
  "use strict";
  var V = "2"; // ?v= of art/fortune/* (bump with any art change)
  /** @type {Array<{id: string, tradition: string, src: string, name: Record<string, string>, bless: Record<string, string>,
   *   features: Record<string, string[]>, status: string, reviewedBy?: string, reviewedAt?: string}>} */
  var DEITIES = [
    { id: "ganesha", tradition: "hindu_brahman", src: "art/fortune/deity-ganesha.svg", status: "pending",
      name: { th: "พระพิฆเนศ", en: "Ganesha", zh: "象头神" },
      bless: { th: "ขอให้วันนี้เริ่มต้นอย่างราบรื่น", en: "May your day begin smoothly.", zh: "愿你今天开端顺遂。" },
      features: { th: ["เศียรช้าง หูใหญ่ งวงโค้ง", "งาข้างหนึ่งหัก (เอกทันต์)", "สี่กร: ขวาน บ่วง ประทานพร ถ้วยขนมโมทกะ", "ท้องใหญ่ ประทับบนบัว หนูพาหนะที่ฐาน"],
        en: ["elephant head, large ears, curved trunk", "one broken tusk (Ekadanta)", "four arms: axe, noose, blessing hand, bowl of modaka sweets",
          "round belly, lotus seat, mouse mount at the base"] } },
    { id: "lakshmi", tradition: "hindu_brahman", src: "art/fortune/deity-lakshmi.svg", status: "pending",
      name: { th: "พระแม่ลักษมี", en: "Lakshmi", zh: "拉克什米" },
      bless: { th: "ขอให้วันนี้มีสิ่งดีงามอยู่รอบตัว", en: "May good things surround your day.", zh: "愿美好常伴你今日。" },
      features: { th: ["ประทับบนดอกบัวบาน", "สองกรบนถือดอกบัว", "เหรียญไหลจากพระหัตถ์", "ถือหม้อน้ำ (กลศ) มงกุฎทรงสูง"],
        en: ["seated on an open lotus", "upper hands hold lotus flowers", "coins flowing from one hand", "holds a pot (kalasha), tall crown"] } },
    { id: "brahma", tradition: "hindu_brahman", src: "art/fortune/deity-brahma.svg", status: "pending",
      name: { th: "พระพรหม", en: "Brahma", zh: "梵天" },
      bless: { th: "ขอให้วันนี้คุณใจดีกับตัวเอง", en: "May you be kind to yourself today.", zh: "愿你今天善待自己。" },
      features: { th: ["สี่พักตร์ (เห็นสามพักตร์จากด้านหน้า) แต่ละพักตร์มีมงกุฎยอดแหลม", "ถือคัมภีร์และลูกประคำ", "ถือหม้อน้ำ อีกกรประทานพร",
        "ประทับบนบัว หงส์พาหนะที่ฐาน"],
        en: ["four faces (three seen from the front), each with a pointed crown", "holds a scripture and prayer beads",
          "holds a water pot, one hand in blessing", "lotus seat, swan (hamsa) mount at the base"] } },
    { id: "shiva", tradition: "hindu_brahman", src: "art/fortune/deity-shiva.svg", status: "pending",
      name: { th: "พระศิวะ", en: "Shiva", zh: "湿婆" },
      bless: { th: "ขอให้วันนี้ใจคุณนิ่งและแจ่มใส", en: "May your mind be still and clear today.", zh: "愿你今天心静而明朗。" },
      features: { th: ["ชฎามุ่นผมเป็นเกลียวสูง ประดับจันทร์เสี้ยว", "ตาที่สามกลางหน้าผาก", "นาคชูเศียรคล้องพระศอ สร้อยลูกประคำ", "ยืนถือตรีศูลผูกกลองบัณเฑาะว์ นุ่งหนังเสือ"],
        en: ["tall matted locks with a crescent moon", "third eye on the forehead", "serpent with raised hood around the neck, rudraksha beads",
          "standing with a tall trident and damaru drum, tiger-skin cloth"] } },
    { id: "vessavana", tradition: "buddhist_guardian", // a guardian king in Thai / Chinese Buddhist practice: stays pending; the owner's expert decides
      src: "art/fortune/deity-vessavana.svg", status: "pending",
      name: { th: "ท้าวเวสสุวรรณ", en: "Vessavana", zh: "毗沙门天" },
      bless: { th: "ขอให้วันนี้คุณรู้สึกปลอดภัยและอุ่นใจ", en: "May you feel safe and at ease today.", zh: "愿你今天平安自在。" },
      features: { th: ["ชฎายักษ์ยอดสูงหลายชั้น มีกรรเจียก", "ใบหน้าสงบ สง่า มีหนวด", "สองมือประคองกระบองตั้งตรงหน้า", "ยืนตรง ชุดทรงเครื่องมีอินทรธนูที่บ่า"],
        en: ["tall tiered giant's crown with ear ornaments", "calm, dignified face with a moustache", "both hands on a club standing upright",
          "standing guard, ornate dress with shoulder flares"] } },
    { id: "caishen", tradition: "chinese_folk", src: "art/fortune/deity-caishen.svg", status: "pending",
      name: { th: "ไฉ่ซิงเอี๊ยะ", en: "Caishen", zh: "财神" },
      bless: { th: "ขอให้วันนี้ใจสงบและมั่นคง", en: "Wishing you a calm and steady day.", zh: "愿你今日心安踏实。" },
      features: { th: ["หมวกขุนนางจีนปีกยาวสองข้าง", "ใบหน้ายิ้ม หนวดเคราสามสาย", "สองมือประคองก้อนเงินก้อนทอง (หยวนเปา)", "เสื้อขุนนางแขนกว้าง เหรียญจีนรูสี่เหลี่ยมที่ฐาน"],
        en: ["official's hat with two long wings", "smiling face, three-strand beard", "both hands hold a gold ingot (yuanbao)",
          "wide-sleeved official's robe, square-holed coins at the base"] } },
    { id: "shouxing", tradition: "chinese_folk", src: "art/fortune/deity-shouxing.svg", status: "pending",
      name: { th: "เทพซิ่ว", en: "Shou Xing", zh: "寿星" },
      bless: { th: "ขอให้วันนี้คุณได้พักและดูแลตัวเอง", en: "May you find time to rest and care for yourself today.", zh: "愿你今天好好休息，照顾自己。" },
      features: { th: ["หน้าผากสูงโหนก", "คิ้วยาว เคราขาวยาวถึงอก", "ถือลูกท้อแห่งอายุยืน", "ไม้เท้ายาวผูกน้ำเต้า"],
        en: ["high domed forehead", "long eyebrows, long beard to the chest", "holds the peach of longevity", "tall staff with a gourd tied on"] } }
  ];
  var SKIP = { th: "แตะที่ใดก็ได้เพื่อข้าม", en: "Tap anywhere to skip", zh: "轻触任意处跳过" };
  var PREVIEW = { th: "ตัวอย่างในเครื่อง ชื่อและคำอวยพรยังรอผู้รู้ตรวจ", en: "Local preview, names and lines pending Merit review", zh: "本机预览，名称与祝福语待审核" };
  var SECTION = /^(fortune|faceread|palm|horoscope|tarot|iching|bazi|taksa|lek7|numbers|fengshui|dream|zodiac|compat|astro|lifegraph|planner|luckycolor|report|petread|cat-fortune)\.html$/;
  var SEEN = "lq-fortune-entry", LAST = "lq-fortune-entry-last", CALM = "lq-fortune-calm";

  /** items the entry screen may use: approved ones; every item in a local preview */
  function eligible(list, preview) { return (list || []).filter(function (d) { return preview || d.status === "approved"; }); }
  /** a random item, not the one shown last time when another exists */
  function pick(list, last, rnd) {
    if (!list || !list.length) return null;
    var pool = list.filter(function (d) { return d.id !== last; });
    if (!pool.length) pool = list;
    return pool[Math.min(pool.length - 1, Math.floor((rnd || Math.random)() * pool.length))];
  }
  /** crisis / calm: the same signals as fortune-crisis.js */
  function isBlocked(doc, ss) {
    var el = doc && doc.documentElement;
    if (el && (el.hasAttribute("data-lq-crisis") || el.hasAttribute("data-lq-calm"))) return true;
    try { return !!ss && ss.getItem(CALM) === "1"; } catch (e) { return false; }
  }
  /** the local preview flag: localhost / 127.0.0.1 / file: only, never on the live site */
  function previewAllowed(loc) {
    if (!loc || !/(?:^\?|&)ftpreview=1(?:&|$)/.test(loc.search || "")) return false;
    return loc.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(loc.hostname || "");
  }
  /** does this page view start a new visit to the section? */
  function newVisit(ref, origin, navType) {
    if (navType === "reload" || navType === "back_forward") return false;
    if (!ref) return true;
    var u = String(ref);
    if (u.indexOf(origin + "/") !== 0) return true;
    var file = u.slice(origin.length + 1).split(/[?#]/)[0].split("/").pop() || "index.html";
    return !SECTION.test(file);
  }
  var api = { DEITIES: DEITIES, SKIP: SKIP, eligible: eligible, pick: pick, isBlocked: isBlocked, previewAllowed: previewAllowed, newVisit: newVisit };
  if (typeof module !== "undefined" && module.exports) { module.exports = api; return; }
  root.LQFortuneEntry = api;

  var doc = root.document, html = doc.documentElement;
  var ss = null, ls = null;
  try { ss = root.sessionStorage; } catch (e) { ss = null; }
  try { ls = root.localStorage; } catch (e) { ls = null; }
  var get = function (s, k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } };
  var set = function (s, k, v) { try { if (s) s.setItem(k, v); } catch (e) { /* storage blocked: harmless */ } };
  var q = root.location.search || "";
  var param = function (k) { var m = new RegExp("(?:^\\?|&)" + k + "=([^&]*)").exec(q); return m ? decodeURIComponent(m[1]) : null; };

  // ---------- menu card illustrations: the sprite is fetched once, only when a card comes near the screen ----------
  var sprite = null;
  function loadSprite() {
    if (!sprite) sprite = fetch("art/fortune/icons.svg?v=" + V).then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
      var src = new DOMParser().parseFromString(t, "image/svg+xml").documentElement;
      if (!src || src.nodeName !== "svg") return;
      var box = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
      box.setAttribute("aria-hidden", "true"); box.setAttribute("focusable", "false");
      box.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden");
      [].slice.call(src.querySelectorAll("symbol")).forEach(function (s) { box.appendChild(doc.importNode(s, true)); });
      doc.body.appendChild(box);
    }).catch(function () { /* offline: cards keep their words */ });
    return sprite;
  }
  function icons() {
    var slots = [].slice.call(doc.querySelectorAll("svg.ft-ill[data-ic]"));
    var fill = function (svg) {
      loadSprite().then(function () {
        if (svg.firstChild) return;
        var use = doc.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", "#ic-" + svg.getAttribute("data-ic"));
        svg.setAttribute("viewBox", "0 0 64 64");
        svg.appendChild(use);
      });
    };
    if (!("IntersectionObserver" in root)) { slots.forEach(fill); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { fill(/** @type {any} */ (e.target)); io.unobserve(e.target); } });
    }, { rootMargin: "240px 0px" });
    slots.forEach(function (s) { io.observe(s); });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", icons); else icons();

  // ---------- entry screen ----------
  var preview = previewAllowed(root.location);
  if (isBlocked(doc, ss)) return;
  /** @type {any} */
  var nav = null;
  try { nav = root.performance && performance.getEntriesByType && performance.getEntriesByType("navigation")[0]; } catch (e) { nav = null; }
  if (newVisit(doc.referrer, root.location.origin, nav && nav.type || "navigate") && ss) { try { ss.removeItem(SEEN); } catch (e) { /* blocked */ } }
  if (get(ss, SEEN) === "1") return;
  var pool = eligible(DEITIES, preview);
  if (!pool.length) return;
  var want = preview && param("deity");
  var d = (want && pool.filter(function (x) { return x.id === want; })[0]) || pick(pool, get(ls, LAST), Math.random);
  if (!d) return;
  set(ss, SEEN, "1");
  set(ls, LAST, d.id);
  var lang = param("lang") || get(ls, "lq-lang") || "th";
  if (!/^(th|en|zh)$/.test(lang)) lang = "th";

  var el = doc.createElement("div");
  el.id = "lqFtEntry"; el.className = "ft-entry";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", d.name[lang]);
  el.setAttribute("data-deity", d.id);
  var img = doc.createElement("img");
  img.className = "ft-entry-img"; img.alt = ""; img.width = 240; img.height = 300; img.decoding = "async";
  el.appendChild(img);
  [["ft-entry-nm", d.name[lang]], ["ft-entry-bl", d.bless[lang]], ["ft-entry-skip", SKIP[lang]]].concat(preview ? [["ft-entry-pv", PREVIEW[lang]]] : [])
    .forEach(function (p) { var x = doc.createElement("div"); x.className = p[0]; x.textContent = p[1]; el.appendChild(x); });
  html.classList.add("lq-ft-entry");
  html.appendChild(el);

  var reduce = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var hold = preview && param("hold") === "1";
  var done = false, timer = 0, started = false;
  function finish() {
    if (done) return;
    done = true; clearTimeout(timer);
    doc.removeEventListener("keydown", onKey, true);
    html.classList.remove("lq-ft-entry");
    if (reduce) { el.remove(); return; }
    el.classList.add("out");
    setTimeout(function () { el.remove(); }, 320);
  }
  function onKey(e) {
    if (e.key === "Escape" || e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); finish(); }
  }
  function start() {
    if (started || done) return;
    started = true;
    // a crisis or calm signal that arrived meanwhile: stop at once
    if (isBlocked(doc, ss)) { finish(); return; }
    root.requestAnimationFrame(function () { el.classList.add("in"); });
    if (!hold) timer = setTimeout(finish, 1500);
  }
  el.addEventListener("click", finish);
  doc.addEventListener("keydown", onKey, true);
  // the illustration is requested only now, when the entry screen really shows; without it the words still show
  img.onload = start;
  img.onerror = function () { img.remove(); start(); };
  img.src = d.src + "?v=" + V;
  setTimeout(start, 600); // slow network: never wait long
  setTimeout(function () { if (!hold) finish(); }, 4000); // safety net: the page is never left covered
})(typeof window !== "undefined" ? window : globalThis);
