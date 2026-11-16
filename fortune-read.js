/* BEGIN fortune-notice.js (copied by tools/fortune-read-embed.mjs; edit fortune-notice.js, then run it) */
/* fortune-notice.js — the notice part of the fortune layout (owner order 2026-11-14, Part A1 + A5), loaded on every fortune page.
 *   A1  LINE: the one-line notice that replaced the old fun-only label (TH from the owner, EN / ZH translations)
 *   A5  every notice is one short line, the rest behind a real <button> "อ่านเพิ่มเติม / Read more / 阅读更多" (aria-expanded,
 *       aria-controls, Enter key, 44 px); the help line, the tap-to-call buttons and the crisis card are NEVER folded
 * The reading layout (fortune-read.js) builds on this file; pages without a reading (hub, planner, lucky colour) load only
 * this one. Tests: tests/unit/fortune-layout.test.js, tests/e2e/fortune-layout.e2e.mjs. */
(function (root) {
  "use strict";
  const LINE = {
    th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
    en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
    zh: "基于命理学原则，属个人信仰，请自行判断。",
  };
  const MORE = { th: "อ่านเพิ่มเติม", en: "Read more", zh: "阅读更多" };
  const LESS = { th: "ย่อลง", en: "Show less", zh: "收起" };
  const SEP = { th: " ", en: " ", zh: "" };
  const NOTE_MAX = { th: 140, en: 200, zh: 60 };
  const NEVER_COLLAPSE = [".lq-helpline", ".lq-call", ".fa-support", ".lq-support", "[data-lq-crisis-card]"];
  const langOf = l => (l === "en" || l === "zh" ? l : "th");
  // Thai has no sentence mark: cut only at a single space, never before a word that continues the clause, never after one
  // that leads into the next word.
  const TH_CONT_NEXT = /^(?:และ|หรือ|แต่|ซึ่ง|ที่|ๆ|เพื่อ|จึง|ก็|แล้ว|ไม่|ได้|ให้|กับ|ของ|ใน|จาก|คือ|ว่า|เป็น|มาก|ด้วย|อยู่|ไว้|กัน|ไป|มา|[\d(/–\-)])/;
  const TH_CONT_PREV = /(?:คือ|ว่า|และ|หรือ|ของ|ใน|กับ|จาก|ที่|ซึ่ง|เพื่อ|เช่น|ได้แก่|อย่าง|แบบ|โดย|ตาม|ทั้ง|[(/–\-])$/;
  function cutsTh(p) {
    const out = [];
    for (let i = p.indexOf(" "); i >= 0; i = p.indexOf(" ", i + 1)) {
      if (p[i + 1] === " " || p[i - 1] === " ") continue;
      out.push({ at: i, ok: !TH_CONT_NEXT.test(p.slice(i + 1)) && !TH_CONT_PREV.test(p.slice(0, i)) });
    }
    return out;
  }
  function cutsEn(p) { const out = []; const re = /[.!?]["”’)]? (?=["“(]?[A-Z0-9])/g; let m; while ((m = re.exec(p))) out.push({ at: m.index + m[0].length - 1, ok: true }); return out; }
  /* ---------- A5: one short line + the rest ---------- */
  function noticeSplit(text, lang) {
    lang = langOf(lang); text = String(text || "");
    const max = NOTE_MAX[lang];
    if (text.length <= max) return [text, ""];
    let at = -1;
    if (lang === "zh") {
      const m = /[。！？]/g; let x; while ((x = m.exec(text)) && x.index < max) at = x.index + 1;
      if (at < 0) { const c = text.lastIndexOf("，", max); at = c > 0 ? c + 1 : max; }
      return [text.slice(0, at), text.slice(at)];
    }
    const cuts = lang === "en" ? cutsEn(text) : cutsTh(text);
    const ok = cuts.filter(c => c.ok && c.at <= max);
    const pick = ok.find(c => c.at >= 30) || ok[ok.length - 1];
    at = pick ? pick.at : (cuts.filter(c => c.at <= max).pop() || { at: -1 }).at;
    if (at <= 0) return [text, ""];
    return [text.slice(0, at), text.slice(at + 1)];
  }

  const CSS = "button.lq-more{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:.35em 1.1em;" +
    "margin:.25em 0 .5em;border-radius:999px;border:1px solid rgba(103,79,242,.45);background:transparent;color:#4b36c9;font:inherit;font-size:.95em;" +
    "font-weight:600;cursor:pointer;max-width:100%;white-space:normal;text-align:center;line-height:1.3}" +
    "button.lq-more:hover{background:rgba(103,79,242,.08)}button.lq-more:focus-visible{outline:3px solid #674ff2;outline-offset:2px}" +
    ".lq-notice .lq-notice-more{display:none}.lq-notice.lq-open .lq-notice-more{display:inline}" +
    ".lq-notice button.lq-more{min-height:44px;padding:.2em .9em;margin:.2em 0 0 .4em;font-size:.88em;vertical-align:middle}" +
    "@media print{.lq-notice .lq-notice-more{display:block!important}button.lq-more{display:none!important}}" +
    "@media (prefers-color-scheme:dark){button.lq-more{color:#c9bcff;border-color:rgba(201,188,255,.5)}}";
  let uid = 0;
  function ensureStyle(doc) {
    try {
      if (!doc || !doc.head || doc.getElementById("lq-notice-style")) return;
      const s = doc.createElement("style"); s.id = "lq-notice-style"; s.textContent = CSS; doc.head.appendChild(s);
    } catch (e) { /* no DOM */ }
  }
  const pageLang = () => { try { return langOf(root.LQI18N && root.LQI18N.lang); } catch (e) { return "th"; } };
  const never = el => !!(el && el.closest && el.closest(NEVER_COLLAPSE.join(",")));
  function moreButton(doc, lang, ids, onToggle) {
    const b = doc.createElement("button");
    b.type = "button"; b.className = "chip lq-more"; b.textContent = MORE[lang]; // "chip" = the shared button class
    b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", ids.join(" ")); b.setAttribute("data-lq-lang", lang);
    const toggle = () => {
      const open = b.getAttribute("aria-expanded") !== "true", L = b.getAttribute("data-lq-lang") || lang;
      b.setAttribute("aria-expanded", open ? "true" : "false"); b.textContent = open ? LESS[L] : MORE[L];
      onToggle(open);
    };
    b.addEventListener("click", toggle);
    // Enter toggles on key down (the native click is suppressed, so it never toggles twice); Space keeps the native click
    b.addEventListener("keydown", e => { if (e.key === "Enter" && !e.repeat) { e.preventDefault(); toggle(); } });
    return b;
  }
  /** turn a plain-text notice into one short line + the rest behind read more (the help line / crisis card never) */
  function noticeify(el, lang) {
    if (!el || never(el) || el.firstElementChild) return el;
    lang = langOf(lang || (el.closest && el.closest("[lang]") && /^zh/.test(el.closest("[lang]").lang) ? "zh" : null) || pageLang());
    const [line, rest] = noticeSplit(el.textContent.trim(), lang);
    if (!rest) return el;
    const doc = el.ownerDocument;
    el.textContent = "";
    el.classList.add("lq-notice");
    const a = doc.createElement("span"); a.className = "lq-notice-line"; a.textContent = line; el.appendChild(a);
    const more = doc.createElement("span"); more.className = "lq-notice-more"; more.id = "lq-nm-" + (++uid);
    const inner = doc.createElement("span"); inner.textContent = SEP[lang] + rest; more.appendChild(inner);
    el.appendChild(moreButton(doc, lang, [more.id], open => el.classList.toggle("lq-open", open)));
    el.appendChild(more);
    return el;
  }
  /** static notices in the page markup: <x class="lq-notice"> … <span class="lq-notice-more">…</span>: add the button */
  function notices(scope) {
    const doc = (scope && scope.ownerDocument) || (scope && scope.nodeType === 9 ? scope : root.document);
    if (!doc || !doc.querySelectorAll) return;
    ensureStyle(doc);
    const lang = pageLang();
    for (const n of (scope || doc).querySelectorAll(".lq-notice")) {
      if (never(n)) continue;
      const more = n.querySelector(".lq-notice-more"); if (!more) continue;
      let b = [...n.querySelectorAll("button.lq-more")].find(x => x.closest(".lq-notice") === n);
      if (!b) { if (!more.id) more.id = "lq-nm-" + (++uid); b = moreButton(doc, lang, [more.id], open => n.classList.toggle("lq-open", open)); more.parentNode.insertBefore(b, more); }
      else { b.setAttribute("data-lq-lang", lang); b.textContent = b.getAttribute("aria-expanded") === "true" ? LESS[lang] : MORE[lang]; }
    }
  }
  if (root.document && root.addEventListener) {
    const doc = root.document, run = () => { try { notices(doc); } catch (e) { /* keep the page */ } };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", run); else run();
    root.addEventListener("lq-lang", run);
  }

  const api = { LINE, MORE, LESS, SEP, NOTE_MAX, NEVER_COLLAPSE, langOf, cutsTh, cutsEn, noticeSplit, pageLang, never, moreButton, noticeify, notices,
    ensureStyle };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LQNotice = api;
})(typeof window !== "undefined" ? window : globalThis);
/* BEGIN fortune-share loader */
/* Share and print on every fortune result (owner order 2026-11-16) come from fortune-share.js. Coordinator decision 2026-11-16
   (option B; owner rule: no budget increases): it is fetched only when the page is used (first touch, key, scroll or focus) or a
   reading is rendered after the page has loaded, never during the first page load. Tests: tests/unit/fortune-share-print.test.js. */
(function (root) {
  "use strict";
  const d = root.document;
  if (!d || root.LQShareLoader) return;
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    if (root.LQShare) return;
    const s = d.createElement("script"); s.src = "fortune-share.js?v=2"; s.async = true; (d.head || d.documentElement).appendChild(s);
  };
  for (const ev of ["pointerdown", "touchstart", "keydown", "scroll", "focusin"]) root.addEventListener(ev, go, { capture: true, passive: true, once: true });
  const ROOTS = "#frResult,#plResult,#hsResult,#trResult,#ssResult,#icResult,#lcResult,#nmResult,#fsReading,#drResult,#zdResult,#asResult,#rpOut";
  const shown = n => !!n && n.nodeType === 1 && (n.matches(".fa-section, .rp-part") || !!n.querySelector(".fa-section, .rp-part") || (n.matches(ROOTS) && !n.hidden));
  function watch() {
    try {
      const mo = new MutationObserver(ms => {
        for (const m of ms) if ((m.type === "attributes" && shown(m.target)) || [...m.addedNodes].some(shown)) { mo.disconnect(); go(); return; }
      });
      mo.observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    } catch (e) { /* no observer: the first touch / key / scroll / focus still loads it */ }
  }
  if (d.readyState === "complete") watch(); else root.addEventListener("load", watch, { once: true });
  // pages lend their symbol art to the card before the module is here: LQShareArt(rootSelector, fn) queues it
  if (!root.LQShareArt) { const q = []; root.LQShareArt = (sel, fn) => { q.push([sel, fn]); }; root.LQShareArt.q = q; }
  root.LQShareLoader = { load: go };
})(typeof window !== "undefined" ? window : globalThis);
/* END fortune-share loader */
/* END fortune-notice.js */
/* fortune-read.js — one shared reading layout for every fortune page (owner order 2026-11-14, Part A).
 *   A1  LINE: the one-line notice that replaced the old fun-only label (TH from the owner, EN / ZH translations)
 *   A2  readings regrouped under short headings, in short paragraphs, main point first; the words never change
 *       (plan() only cuts the composer's paragraphs at a space / sentence end, rejoined they are identical)
 *   A3  a short summary per group, the rest behind a real <button> "อ่านเพิ่มเติม / Read more / 阅读更多"
 *       (aria-expanded, aria-controls, keyboard by being a button, 44 px), an in-page menu for long readings
 *   A4  advice items (colour to wear, what to worship, whom to respect, direction) get small icons drawn for LENSIQ
 *       (inline SVG, MIT, see LICENSES/THIRD_PARTY.md and docs/CREDITS-MEDIA.md), colour swatches with the real colour
 *       and a text label, and the label "ตามความเชื่อ โปรดใช้วิจารณญาณ"; all marked data-lq-remedy (hidden in the crisis state)
 *   A5  every notice is one short line, the rest behind "อ่านเพิ่มเติม"; the help line and the crisis card are NEVER folded
 * A paragraph that carries an unfavourable / caution lead (straight or gentle) is always shown in full: the meaning a
 * discipline's rules produce is never tucked away. Tests: tests/unit/fortune-layout.test.js, tests/e2e/fortune-layout.e2e.mjs.
 * Loaded on every fortune page before fortune-ai.js; Node: require("./fortune-read.js") for the pure parts. */
(function (root) {
  "use strict";
  // the notice part (one-line notices, the read-more button, the help-line exception) lives in fortune-notice.js; pages without
  // a reading load only that file, reading pages get its copy at the top of this file (tools/fortune-read-embed.mjs: one request)
  const N = root.LQNotice || (typeof require === "function" ? require("./fortune-notice.js") : null);
  const { LINE, MORE, LESS, SEP, NOTE_MAX, NEVER_COLLAPSE, langOf, cutsTh, cutsEn, noticeSplit, pageLang, never, moreButton, noticeify, notices } = N;
  const TOC = { th: "หัวข้อในคำทำนายนี้", en: "In this reading", zh: "本次解读目录" };
  const BELIEF = { th: "ตามความเชื่อ โปรดใช้วิจารณญาณ", en: "According to belief, please use your own judgement", zh: "依据传统说法，请自行判断" };
  const HEADINGS = {
    th: { overview: "ภาพรวม", personality: "ตัวตน", work: "การงาน", money: "การเงิน", love: "ความรัก", social: "ผู้คนรอบตัว", timing: "จังหวะเวลา",
      health: "สุขภาพ", advice: "สิ่งที่ควรทำ", brief: "เรื่องอื่นโดยย่อ" },
    en: { overview: "Overview", personality: "Personality", work: "Work", money: "Money", love: "Love", social: "People around you", timing: "Timing",
      health: "Health", advice: "What to do", brief: "Other areas" },
    zh: { overview: "总览", personality: "性格", work: "事业", money: "财运", love: "感情", social: "人际", timing: "时机", health: "健康", advice: "建议", brief: "其他" },
  };
  const MAXLEN = { th: 220, en: 320, zh: 110 };
  const OVERVIEW_MAX = { th: 100, en: 120, zh: 46 }; // owner item 5: about 3 lines at 375 px

  /* ---------- A2: cut a paragraph into short parts (rejoined with SEP[lang] = the paragraph, word for word) ---------- */
  function split(p, lang, max) {
    lang = langOf(lang); max = max || MAXLEN[lang];
    p = String(p == null ? "" : p);
    if (p.length <= max) return [p];
    if (lang === "zh") {
      const sen = p.match(/[^。！？]*[。！？]+[”」』）)]*|[^。！？]+$/g) || [p];
      const out = []; let cur = "", n = 0;
      for (const s of sen) { if (cur && (cur.length + s.length > max || n >= 2)) { out.push(cur); cur = ""; n = 0; } cur += s; n++; }
      if (cur) out.push(cur);
      return out;
    }
    const cuts = lang === "en" ? cutsEn(p) : cutsTh(p);
    const pieces = Math.ceil(p.length / max), target = p.length / pieces;
    const out = []; let start = 0;
    while (p.length - start > max) {
      const inRange = cuts.filter(c => c.at > start && c.at - start <= max);
      if (!inRange.length) break;
      const good = inRange.filter(c => c.ok);
      const pick = good.find(c => c.at - start >= target * 0.8) || good[good.length - 1] || inRange[inRange.length - 1];
      if (pick.at - start < 12 && inRange.length > 1) { const later = inRange.find(c => c.at - start >= 12); if (later) { out.push(p.slice(start, later.at)); start = later.at + 1; continue; } }
      out.push(p.slice(start, pick.at)); start = pick.at + 1;
    }
    out.push(p.slice(start));
    return out.filter((x, i) => x.length || i === 0);
  }
  /** owner item 5: cut the start of the main point to about 3 lines at 375 px (OVERVIEW_MAX), at a sentence / clause / word
   *  boundary; the rest of the paragraph is split as usual. Rejoined with SEP[lang] the pieces are the paragraph, word for word. */
  function overviewCut(p, lang) {
    const max = OVERVIEW_MAX[lang];
    if (p.length <= max) return [p];
    let at = -1;
    if (lang === "zh") {
      const re = /[。！？；]/g; let m; while ((m = re.exec(p)) && m.index < max) at = m.index + 1;
      if (at < max * 0.4) { const re2 = /[，、]/g; let m2; while ((m2 = re2.exec(p)) && m2.index < max) at = Math.max(at, m2.index + 1); }
      if (at <= 0) return split(p, lang);
      return [p.slice(0, at)].concat(split(p.slice(at), lang));
    }
    const cuts = lang === "en" ? cutsEn(p) : cutsTh(p);
    const okc = cuts.filter(c => c.ok && c.at <= max && c.at >= max * 0.4);
    let c = okc[okc.length - 1];
    if (!c && lang === "en") { const cm = [...p.matchAll(/, /g)].map(m => m.index + 1).filter(i => i <= max && i >= max * 0.4); if (cm.length) c = { at: cm[cm.length - 1] }; }
    if (!c) { const any = lang === "en" ? [...p.matchAll(/ /g)].map(m => ({ at: m.index })) : cuts; c = any.filter(x => x.at <= max && x.at >= 12).pop(); }
    if (!c) return split(p, lang);
    at = c.at;
    return [p.slice(0, at)].concat(split(p.slice(at + 1), lang));
  }
  /** parts of a section: [{ text, para, visible, caution }]; the first part (the main point) and caution paragraphs are shown.
   *  opts.flags = the composer's marks (section.caution, one per paragraph): a marked paragraph is never cut or folded.
   *  Without opts.flags nothing is folded (every part visible): the layout never guesses which text is a caution.
   *  opts.leads (older callers / tests) also marks a paragraph holding a whole lead; it never makes anything less visible. */
  function plan(paragraphs, lang, opts) {
    lang = langOf(lang);
    const leads = (opts && opts.leads) || [], flags = opts && Array.isArray(opts.flags) ? opts.flags : null, parts = [];
    (paragraphs || []).forEach((p, k) => {
      const caution = !!(flags && flags[k]) || leads.some(l => l && String(p).includes(l));
      // owner item 5: the overview is the first ~3 lines of the main point (the start of the first paragraph), the rest folds
      const chunks = caution ? [String(p)] : k === 0 ? overviewCut(String(p), lang) : split(p, lang);
      chunks.forEach((t, j) => parts.push({ text: t, para: k, caution, visible: !flags || caution || (k === 0 && j === 0) }));
    });
    return parts;
  }
  /** the composer's marks of one section, or null when they are missing or do not line up with the paragraphs */
  const marksOf = s => (s && Array.isArray(s.caution) && Array.isArray(s.paragraphs) && s.caution.length === s.paragraphs.length ? s.caution : null);
  /** plan of one composed section (what the page shows): folds only when the composer marked the section */
  function planSection(s, lang) { return plan((s && s.paragraphs) || [], lang, { flags: marksOf(s) }); }
  /** marks for a rendered section, found by id and identical paragraph texts; null on any mismatch (then nothing folds) */
  function sectionFlags(res, id, texts) {
    const same = x => x && x.id === id && Array.isArray(x.paragraphs) && x.paragraphs.length === texts.length && x.paragraphs.every((p, i) => p === texts[i]);
    const s = ((res && res.sections) || []).find(same);
    return marksOf(s);
  }

  /* ---------- A4: colours, advice kinds, icons ---------- */
  const COLOURS = {
    th: [["น้ำเงิน", "#1e40af"], ["กรมท่า", "#1f2a5a"], ["บานเย็น", "#c2185b"], ["เลือดหมู", "#7f1d1d"], ["น้ำตาล", "#795548"], ["เขียว", "#2e7d32"], ["เหลือง", "#fbc02d"],
      ["ชมพู", "#ec6fa8"], ["ม่วง", "#7b1fa2"], ["แดง", "#d32f2f"], ["ส้ม", "#f57c00"], ["แสด", "#ff6f00"], ["ฟ้า", "#4fc3f7"], ["คราม", "#283593"], ["ขาว", "#ffffff"],
      ["ดำ", "#111111"], ["เทา", "#8e8e8e"], ["ครีม", "#f3e5c0"], ["ทอง", "#c9a227"], ["เงิน", "#c0c0c0"]],
    en: [["light blue", "#4fc3f7"], ["sky blue", "#4fc3f7"], ["navy", "#1f2a5a"], ["red", "#d32f2f"], ["pink", "#ec6fa8"], ["orange", "#f57c00"], ["yellow", "#fbc02d"],
      ["cream", "#f3e5c0"], ["beige", "#e8d8b8"], ["green", "#2e7d32"], ["blue", "#1e40af"], ["purple", "#7b1fa2"], ["violet", "#7b1fa2"], ["black", "#111111"],
      ["white", "#ffffff"], ["grey", "#8e8e8e"], ["gray", "#8e8e8e"], ["brown", "#795548"], ["gold", "#c9a227"], ["silver", "#c0c0c0"]],
    zh: [["粉红色", "#ec6fa8"], ["浅蓝色", "#4fc3f7"], ["天蓝色", "#4fc3f7"], ["深蓝色", "#1f2a5a"], ["藏青色", "#1f2a5a"], ["奶油色", "#f3e5c0"], ["咖啡色", "#795548"],
      ["红色", "#d32f2f"], ["粉色", "#ec6fa8"], ["橙色", "#f57c00"], ["黄色", "#fbc02d"], ["米色", "#f3e5c0"], ["绿色", "#2e7d32"], ["蓝色", "#1e40af"], ["紫色", "#7b1fa2"],
      ["黑色", "#111111"], ["白色", "#ffffff"], ["灰色", "#8e8e8e"], ["棕色", "#795548"], ["褐色", "#795548"], ["金色", "#c9a227"], ["银色", "#c0c0c0"]],
  };
  const hexOf = (lang, name) => (COLOURS[lang].find(c => c[0] === name) || [])[1];
  function coloursTh(text) {
    const out = [], names = COLOURS.th.map(c => c[0]);
    const piecesOf = seg => seg.split(/และ|หรือ|กับ|,|\/|、|\(|\)|\s+/).map(x => x.replace(/^สี/, "").replace(/[.,;:)”"]+$/, "").trim()).filter(Boolean);
    for (let i = text.indexOf("สี"); i >= 0; i = text.indexOf("สี", i + 2)) {
      const toks = text.slice(i).split(" ");
      const t0 = toks[0];
      let a = -1, al = 0;
      for (const w of ["คือ", "ได้แก่", "เช่น", "เป็น"]) { const j = t0.lastIndexOf(w); if (j > a) { a = j; al = w.length; } }
      const seg = a >= 0 ? t0.slice(a + al) : t0.slice(2);
      const first = piecesOf(seg);
      if (!first.length || !first.every(x => names.includes(x))) continue;
      first.forEach(x => out.push(x));
      for (const t of toks.slice(1)) {
        const ps = piecesOf(t);
        if (!ps.length) continue;
        if (!ps.every(x => names.includes(x))) break;
        ps.forEach(x => out.push(x));
      }
    }
    return out;
  }
  function coloursEn(text) {
    const out = [], re = /\bcolou?rs?\b([^.!?]*)/gi; let m;
    while ((m = re.exec(text))) {
      let seg = m[1]; const c = seg.indexOf(":");
      if (c >= 0) seg = seg.slice(c + 1); else { const k = seg.search(/\b(?:are|is|include|such as)\b/i); if (k < 0) continue; seg = seg.slice(k).replace(/^\w+(?: as)?/i, ""); }
      for (const piece of seg.split(/,|\/|\band\b|\bor\b/i)) {
        const w = piece.trim().toLowerCase().replace(/[^a-z ]/g, "").trim();
        if (!w) continue;
        const hit = COLOURS.en.find(x => w === x[0] || w.endsWith(" " + x[0]));
        if (!hit) break;
        out.push(hit[0]);
      }
    }
    return out;
  }
  function coloursZh(text) {
    const out = [], re = /(?:颜色|幸运色|色)[是为：:]?([^。！？]*)/g; let m;
    while ((m = re.exec(text))) {
      const seg = m[1];
      for (let i = 0; i < seg.length;) {
        const hit = COLOURS.zh.find(x => seg.startsWith(x[0], i));
        if (hit) { out.push(hit[0]); i += hit[0].length; } else i++;
      }
    }
    return out;
  }
  function colours(text, lang) {
    lang = langOf(lang); text = String(text || "");
    const names = lang === "zh" ? coloursZh(text) : lang === "en" ? coloursEn(text) : coloursTh(text);
    return [...new Set(names)].map(name => ({ name, hex: hexOf(lang, name) })).filter(c => c.hex);
  }
  const KINDS = {
    th: { worship: /บูชา|สักการะ|ไหว้พระ|ไหว้เจ้า|ไหว้ศาล|ทำบุญ|ใส่บาตร|ขอพร|สวดมนต์|ถวาย/, respect: /เคารพ|กตัญญู|ผู้ใหญ่|ผู้มีพระคุณ|บรรพบุรุษ|พ่อแม่|ไหว้(?!พระ|เจ้า|ศาล)/,
      direction: /ทิศ/ },
    en: { worship: /\b(?:worship|pray|prayers?|make merit|making merit|offerings?|temple|shrine|incense)\b/i,
      respect: /\b(?:pay(?:ing)? respects?|respect|elders?|ancestors?|gratitude|parents)\b/i,
      direction: /\b(?:directions?|facing|(?:north|south)(?:east|west)?|east|west)\b/i },
    zh: { worship: /供奉|拜佛|拜神|上香|祈福|寺|庙|烧香|行善|积德|祭/, respect: /孝|敬|尊重|长辈|祖先|感恩|父母/, direction: /方位|方向|朝向|东方|西方|南方|北方|东南|西南|东北|西北/ },
  };
  function adviceKinds(text, lang) {
    lang = langOf(lang); text = String(text || "");
    const out = [];
    if (colours(text, lang).length) out.push("colour");
    for (const k of ["worship", "respect", "direction"]) if (KINDS[lang][k].test(text)) out.push(k);
    return out;
  }
  // icons drawn by hand for LENSIQ (simple shapes; no picture of a deity, a temple or any real place); MIT like the repo
  const SVG = (body, label) => '<svg class="lq-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" data-icon="' + label + '">' + body + "</svg>";
  const OWN = "drawn by hand for LENSIQ in fortune-read.js (2026-11-14); simple geometric shapes, no source image";
  const MIT = "MIT (own work, LENSIQ; same licence as the repository)";
  const ICONS = {
    colour: { svg: SVG('<path d="M12 3.5c-4.9 0-8.5 3.6-8.5 8.1 0 4.4 3.6 8.4 8.2 8.4 1.2 0 1.8-.7 1.8-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 ' +
      '0-.9.7-1.6 1.6-1.6h1.9c2.7 0 4.5-1.9 4.5-4.4 0-3.7-3.8-6.5-8.5-6.5z"/>' +
      '<circle cx="7.6" cy="11.3" r="1.2"/><circle cx="10.4" cy="7.6" r="1.2"/><circle cx="14.8" cy="7.8" r="1.2"/>', "colour"), licence: MIT, source: OWN },
    worship: { svg: SVG('<path d="M12 5c1.9 2.1 2.6 4.5 2 7.6-.4 1.9-1.1 3.2-2 4.4-.9-1.2-1.6-2.5-2-4.4C9.4 9.5 10.1 7.1 12 5z"/>' +
      '<path d="M10 16.8c-2.7-.4-4.9-2.1-6-4.8 2.4-.4 4.4.1 5.8 1.3M14 16.8c2.7-.4 4.9-2.1 6-4.8-2.4-.4-4.4.1-5.8 1.3"/><path d="M5 19.5h14"/>', "worship"), licence: MIT, source: OWN },
    respect: { svg: SVG('<path d="M11.2 20V9.6c0-1.5-.6-2.9-1.6-4l-.8-.9c-.5-.5-1.3-.2-1.3.5v6.1L5.4 14c-.6.9-.7 2-.2 3l1.6 3"/>' +
      '<path d="M12.8 20V9.6c0-1.5.6-2.9 1.6-4l.8-.9c.5-.5 1.3-.2 1.3.5v6.1l2.1 2.7c.6.9.7 2 .2 3l-1.6 3"/>', "respect"), licence: MIT, source: OWN },
    direction: { svg: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2l-1.9 4.7-3.7 1.9 1.9-4.7z"/><path d="M12 3.5v1.6M12 18.9v1.6M3.5 12h1.6M18.9 12h1.6"/>', "direction"),
      licence: MIT, source: OWN },
  };

  /* ---------- DOM ---------- */
  // reading styles used by fortune-ai.js renderSections (moved here from fortune-ai.js, review round 2)
  const FA_CSS = ".fa-more{margin:.5em 0 .2em}.fa-more>summary{cursor:pointer;font-weight:600;opacity:.85;padding:.4em 0;min-height:44px;box-sizing:border-box;display:list-item}" +
    ".fa-more>summary:hover{opacity:1}.fa-more>summary:focus-visible{outline:2px solid currentColor;outline-offset:2px;border-radius:4px}.fa-more[open]>summary{margin-bottom:.3em}" +
    ".fa-summary{border:1px solid rgba(103,79,242,.28);background:rgba(103,79,242,.06);border-radius:14px;padding:.75em 1em;margin:.3em 0 1.1em}" +
    ".fa-summary h3{margin:0 0 .4em;font-size:1rem}.fa-summary ul{list-style:none;margin:0;padding:0;display:grid;gap:.45em}" +
    ".fa-summary li{line-height:1.55}.fa-summary li b{display:inline-block;min-width:5.5em;margin-right:.4em;color:#4b36c9;font-weight:600}" +
    ".fa-plan{border:1px solid rgba(34,160,90,.3);background:rgba(34,160,90,.06);border-radius:14px;padding:.75em 1em;margin:.3em 0 1.1em}" +
    ".fa-plan h3{margin:0 0 .4em;font-size:1rem}.fa-plan ol{margin:0;padding-left:1.2em;display:grid;gap:.4em;line-height:1.55}" +
    ".fa-reminder{margin:1.1em 0 .3em;padding:.7em .9em;border-left:3px solid rgba(103,79,242,.45);font-size:.92em;line-height:1.6;opacity:.9}" +
    "@media (prefers-color-scheme:dark){.fa-summary li b{color:#b9abff}}";
  const CSS = ".fa-section{scroll-margin-top:96px}.fa-section>p,.fa-section .lq-more-body>p{margin:.55em 0;line-height:1.75}" +
    ".fa-section .lq-gist{font-weight:500}.fa-section .lq-caution{border-left:3px solid rgba(214,120,0,.55);padding-left:.7em}" +
    ".lq-more-body{display:none}.lq-more-body.lq-open{display:block}" +
    // owner item 5: while a group is closed its overview never takes more than 3 lines (marked caution text is never clamped)
    ".fa-section[data-lq-grouped]:not(.lq-open)>p.lq-gist:not(.lq-caution){display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}" +
    ".lq-toc{margin:.4em 0 1em;padding:.6em .7em;border:1px solid rgba(103,79,242,.22);border-radius:14px;background:rgba(103,79,242,.04)}" +
    ".lq-toc p{margin:0 0 .4em;font-size:.88em;font-weight:600;opacity:.85}.lq-toc ul{display:flex;flex-wrap:wrap;gap:.4em;list-style:none;margin:0;padding:0}" +
    ".lq-toc a{display:inline-flex;align-items:center;min-height:44px;padding:0 .9em;border-radius:999px;border:1px solid rgba(103,79,242,.3);" +
    "text-decoration:none;color:inherit;font-size:.92em;background:#fff}.lq-toc a:focus-visible{outline:3px solid #674ff2;outline-offset:2px}" +
    ".lq-advice{display:flex;flex-wrap:wrap;align-items:center;gap:.4em .5em;margin:-.15em 0 .8em;font-size:.92em}" +
    ".lq-icon{width:1.35em;height:1.35em;flex:none;color:#674ff2}" +
    ".lq-sw{display:inline-flex;align-items:center;gap:.35em;padding:.15em .6em .15em .3em;border:1px solid rgba(0,0,0,.14);border-radius:999px;background:#fff;color:#222}" +
    ".lq-sw-chip{display:inline-block;width:1.15em;height:1.15em;border-radius:50%;border:1px solid rgba(0,0,0,.3);flex:none}" +
    ".lq-belief{flex-basis:100%;font-size:.84em;opacity:.78}" +
    "html[data-lq-crisis] [data-lq-remedy]{display:none!important}" +
    "@media print{.lq-more-body{display:block!important}}" +
    "@media (prefers-color-scheme:dark){.lq-toc a{background:transparent}.lq-icon{color:#b9abff}}";
  let uid = 0;
  function ensureStyle(doc) {
    try {
      if (!doc || !doc.head || doc.getElementById("lq-read-style")) return;
      N.ensureStyle(doc); const s = doc.createElement("style"); s.id = "lq-read-style"; s.textContent = CSS; doc.head.appendChild(s);
    } catch (e) { /* no DOM */ }
  }
  const STD_TITLES = () => {
    const FA = root.FortuneAI, t = {};
    try { for (const src of [FA.SECTION_TITLES, FA.en && FA.en.TITLES, FA.zh && FA.zh.TITLES]) if (src) for (const k in src) (t[k] = t[k] || []).push(src[k]); } catch (e) { /* none */ }
    (t.brief = t.brief || []).push("เรื่องอื่น ๆ โดยย่อ");
    return t;
  };
  const ADVICE_FRAME = { th: /ควร|ลอง|วิธีปรับ|สิ่งที่ทำได้|ข้อแนะนำ|เคล็ด|เลือก|ใส่|ใช้กับ|สีที่เข้ากับ|สีมงคล|ทิศที่ส่งเสริม|ไหว้|บูชา|ทำบุญ/,
    en: /\b(?:try|wear|choose|should|tip|remedy|suit|face|pay|make merit|pray)\b/i, zh: /建议|可以|不妨|穿|选择|宜|适合|朝|拜|供奉|孝/ };
  function adviceBox(doc, text, lang) {
    const kinds = adviceKinds(text, lang);
    if (!kinds.length) return null;
    const box = doc.createElement("div"); box.className = "lq-advice"; box.setAttribute("data-lq-remedy", "");
    for (const k of kinds) { const t = doc.createElement("span"); t.innerHTML = ICONS[k].svg; box.appendChild(t.firstChild); }
    for (const c of colours(text, lang)) {
      const s = doc.createElement("span"); s.className = "lq-sw"; s.setAttribute("data-hex", c.hex);
      const chip = doc.createElement("span"); chip.className = "lq-sw-chip"; chip.setAttribute("aria-hidden", "true"); chip.style.backgroundColor = c.hex;
      s.appendChild(chip); s.appendChild(doc.createTextNode(c.name)); box.appendChild(s);
    }
    const b = doc.createElement("span"); b.className = "lq-belief"; b.textContent = BELIEF[lang]; box.appendChild(b);
    return box;
  }
  function group(sec, lang, res, titles) {
    const doc = sec.ownerDocument;
    if (sec.getAttribute("data-lq-grouped")) return;
    sec.setAttribute("data-lq-grouped", "1");
    if (!sec.id) sec.id = "lq-g-" + (++uid);
    const id = sec.getAttribute("data-section") || "";
    const h = sec.querySelector("h3, h4");
    if (h && HEADINGS[lang][id] && (titles[id] || []).includes(h.textContent.trim())) { h.textContent = HEADINGS[lang][id]; h.removeAttribute("data-i18n"); }
    const ps = [];
    for (const n of [...sec.children]) {
      if (n.tagName === "P") { ps.push(n.textContent); n.remove(); }
      else if (n.tagName === "DETAILS" && n.classList.contains("fa-more")) { for (const p of n.querySelectorAll("p")) ps.push(p.textContent); n.remove(); }
    }
    const parts = plan(ps, lang, { flags: sectionFlags(res, id, ps) }); // review round 2 (F1): the composer's marks only
    const isAdvice = id === "advice";
    let body = null; const ids = [];
    for (const [i, x] of parts.entries()) {
      const p = doc.createElement("p"); p.textContent = x.text;
      if (i === 0) p.className = "lq-gist"; if (x.caution) p.classList.add("lq-caution");
      const box = (isAdvice || ADVICE_FRAME[lang].test(x.text)) ? adviceBox(doc, x.text, lang) : null;
      if (x.visible) { body = null; sec.appendChild(p); if (box) sec.appendChild(box); continue; }
      if (!body) { body = doc.createElement("div"); body.className = "lq-more-body"; body.id = "lq-mb-" + (++uid); ids.push(body.id); sec.appendChild(body); }
      body.appendChild(p); if (box) body.appendChild(box);
    }
    if (ids.length) {
      const bodies = ids.map(x => sec.querySelector("#" + x));
      sec.appendChild(moreButton(doc, lang, ids, open => { bodies.forEach(b => b.classList.toggle("lq-open", open)); sec.classList.toggle("lq-open", open); }));
    }
  }
  function toc(container, groups, lang, before) {
    const doc = container.ownerDocument;
    const nav = doc.createElement("nav"); nav.className = "lq-toc"; nav.setAttribute("aria-label", TOC[lang]); nav.setAttribute("data-lq-toc", "");
    const t = doc.createElement("p"); t.textContent = TOC[lang]; nav.appendChild(t);
    const ul = doc.createElement("ul");
    for (const g of groups) {
      const h = g.querySelector("h3, h4"); if (!h) continue;
      const li = doc.createElement("li"), a = doc.createElement("a");
      a.href = "#" + g.id; a.textContent = h.textContent.trim();
      a.addEventListener("click", e => { e.preventDefault(); try { g.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (x) { g.scrollIntoView(); }
        try { root.history.replaceState(null, "", "#" + g.id); } catch (x) { /* file: */ }
        const f = g.querySelector("h3, h4"); if (f) { f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); } });
      li.appendChild(a); ul.appendChild(li);
    }
    nav.appendChild(ul);
    if (before && before.parentNode) before.parentNode.insertBefore(nav, before); else container.insertBefore(nav, container.firstChild);
    return nav;
  }
  /** after FortuneAI.renderSections (or a page's own sections): group, fold, menu, advice icons, short reminder */
  function enhance(container, res, opts) {
    if (!container || !container.querySelectorAll) return container;
    const doc = container.ownerDocument || root.document; ensureStyle(doc);
    const lang = langOf((res && res.lang) || (opts && opts.lang) || pageLang());
    if (res && res.crisis) return container;
    for (const d of [...container.querySelectorAll("details.fa-more-sections")]) { for (const s of [...d.querySelectorAll(":scope > .fa-section")]) d.parentNode.insertBefore(s, d); d.remove(); }
    const groups = [...container.querySelectorAll(".fa-section")].filter(g => !never(g));
    const titles = STD_TITLES();
    for (const g of groups) group(g, lang, res, titles);
    for (const li of container.querySelectorAll(".fa-plan li")) { if (li.querySelector(".lq-advice")) continue; const box = adviceBox(doc, li.textContent, lang); if (box) li.appendChild(box); }
    const old = container.querySelector(":scope > nav.lq-toc[data-lq-toc]"); if (old) old.remove(); // only a menu this file made
    if (groups.length >= 4 && !(opts && opts.toc === false)) toc(container, groups, lang, groups[0]);
    for (const r of container.querySelectorAll(".fa-reminder")) noticeify(r, lang);
    return container;
  }
  // the reading layout runs through FortuneAI's documented extension point (decorate after every rendered reading; a support
  // card never reaches hooks). Queued here because this file loads before fortune-ai.js.
  const HOOK = { decorate(container, original, shown) { try { enhance(container, shown || original); } catch (e) { /* keep the plain reading */ } } };
  if (root.document) {
    try { if (root.FortuneAI && root.FortuneAI.registerHooks) root.FortuneAI.registerHooks(HOOK); else (root.LQFortuneHooks = root.LQFortuneHooks || []).push(HOOK); } catch (e) { /* none */ }
  }

  const api = { FA_CSS, OVERVIEW_MAX, LINE, MORE, LESS, TOC, BELIEF, HEADINGS, SEP, MAXLEN, NOTE_MAX, NEVER_COLLAPSE, ICONS, COLOURS,
    split, plan, planSection, sectionFlags, noticeSplit, colours, adviceKinds, enhance, noticeify, notices, ensureStyle };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LQRead = api;
})(typeof window !== "undefined" ? window : globalThis);
/* BEGIN fortune-restrain.js (copied by tools/fortune-read-embed.mjs; edit fortune-restrain.js, then run it) */
/* fortune-restrain.js — which fortune fact items RESTRAIN or WARN, as data (owner rule: caution / unfavourable text is never
   folded behind "อ่านเพิ่มเติม"; independent review 2026-11-15: word lists only catch the words they test, so every entry was
   tagged by reading it in TH / EN / ZH, per discipline; the per-discipline summary is in docs/FORTUNE-LAYOUT.md).
   TAGS[domain]["<areas>" | "all"] = space-separated item keys. "all" = the item's label and every meaning area (a sign the
   tradition names unfavourable, or every area restrains); otherwise the listed meaning areas (any language's text in that area
   holds back, delays, limits or warns). Keys are fact item ids; tarot ids drop their spread position ("card.past.swords04.r" ->
   "swords04.r"); a "*" matches one id part. Chart-dependent tags come from the engine as item.restrain (fengshui.js).
   A numbers sum ("sum.NN") reuses the text of its pair ("pair.NN"), so an untagged sum takes its pair's tag (plus overview,
   which carries the same text). Tips: facts.extras.restrainTips lists the tips the engine's data marks as restraining
   (numbers-kb.js goals[].tips[].avoid). fortune-ai.js marks every paragraph that carries a tagged entry's text as caution
   (sources), records each template filled with an unfavourable or tagged item at the fill site (fill), and records
   provenance(): area = a meaning area, "label", "tip" or "fill". */
(function (root) {
  "use strict";
  const TAGS = /** @type {Record<string, Record<string, string>>} */ ({
    "face": {
      "advice": "age.25 brow.sword eye.soft mountain.lead.east mouth.full palace.jie.high palace.xiongdi.high philtrum.long yintang.narrow zone.middle",
      "advice,money,personality": "element.fire",
      "advice,timing": "element.water",
      "timing": "element.wood"
    },
    "palm": {
      "advice": "element.water heart.curved life.close thumb.short",
      "money": "element.air element.fire head.sloping"
    },
    "horoscope": {
      "advice": "cn.year.0.fire cn.year.1.fire cn.year.3.fire cn.year.5.fire cn.year.6.fire cn.year.7.fire cn.year.8.fire cn.year.9.fire cn.year.10.fire" +
        " " + "num.lp.6 thai.day.1 thai.lagna.0 thai.lagna.3",
      "advice,money": "cn.year.2.earth cn.year.2.fire cn.year.2.metal cn.year.2.water cn.year.2.wood cn.year.4.fire cn.year.11.earth cn.year.11.fire" +
        " " + "cn.year.11.metal cn.year.11.water cn.year.11.wood thai.day.2 thai.rasi.0 thai.rasi.11",
      "money": "bazi.dm.2 bazi.god.BJ bazi.god.QS bazi.god.SG cn.year.4.earth cn.year.4.metal cn.year.4.water cn.year.4.wood num.lp.3 num.lp.5 num.lp.9" +
        " " + "thai.day.0 thai.day.5 thai.day.7 thai.rasi.8",
      "money,social": "bazi.god.JC",
      "work": "bazi.excess.fire bazi.excess.water bazi.excess.wood"
    },
    "tarot": {
      "advice,money,overview,work": "m10.r",
      "advice,money,work": "m10",
      "advice,overview": "spread.pattern",
      "all": "cups05 m15 m16 pentacles05 swords03 swords04 swords05 swords08 swords09 swords10 wands10",
      "love,money,overview,work": "cups02.r cups03.r cups04.r cups07.r cups08.r cups09.r cups12.r cups13.r cups14.r m00.r m02.r m03.r m04.r m07.r m08.r m09.r m12.r m13.r m14.r" +
        " " + "m16.r m17.r m18 m18.r m19.r pentacles01.r pentacles04.r pentacles05.r pentacles06.r pentacles09.r pentacles10.r pentacles11.r pentacles14.r" +
        " " + "swords03.r swords04.r swords05.r swords08.r swords09.r swords10.r swords11.r swords12.r swords13.r swords14.r wands01.r wands02.r wands03.r" +
        " " + "wands06.r wands07.r wands08.r wands11.r wands12.r wands13.r",
      "love,money,work": "cups01.r cups06.r cups11.r m01.r m06.r m11.r m21.r pentacles03.r pentacles08.r pentacles13.r swords02.r swords07.r wands05.r wands10.r",
      "love,overview,work": "swords02 wands05",
      "money": "cups03 swords07 wands02",
      "money,overview,work": "cups05.r cups10.r m05.r m12 m15.r m20.r pentacles02.r pentacles07.r pentacles12.r swords01.r swords06.r wands04.r wands09.r wands14.r",
      "money,work": "cups07 cups12 m00 m02 m05",
      "overview": "m09 m13 pair.cups04+cups05 pair.cups05+cups06 pair.m00+m13 pair.m06+m15 pair.m09+pentacles07 pair.m12+m13 pair.m12+swords02 pair.m13+m20" +
        " " + "pair.m14+swords04 pair.m15+m16 pair.m16+m17 pair.m16+m20 pair.m17+m18 pair.m17+swords03 pair.m18+m19 pair.m18+swords09 pair.m20+swords10" +
        " " + "pair.pentacles04+pentacles05 pair.pentacles05+pentacles06 pair.swords02+swords03 pair.swords03+swords04 pair.swords04+swords05" +
        " " + "pair.swords05+swords06 pair.swords07+swords08 pair.swords08+swords09 pair.swords09+swords10 pair.wands04+wands05 pair.wands09+wands10",
      "overview,work": "pentacles07",
      "work": "cups02 cups10 m07 m17 m20 pentacles02 pentacles04 pentacles09 pentacles12 pentacles14 swords01 swords06 swords11 swords13 wands01 wands04" +
        " " + "wands06 wands09 wands11 wands14"
    },
    "siamsee": {
      "advice,work": "siamsee.2",
      "all": "siamsee.4 siamsee.7 siamsee.11 siamsee.15 siamsee.18 siamsee.22 siamsee.25"
    },
    "fengshui": {
      "advice": "rec.bed.*",
      "all": "dir.quiet"
    },
    "numbers": {
      "advice,love": "pair.12 pair.21",
      "advice,money": "pair.18 pair.81",
      "advice": "pair.00 pair.11",
      "advice,personality": "pair.13 pair.25 pair.31 pair.33 pair.52",
      "all": "pair.03 pair.07 pair.08 pair.27 pair.28 pair.30 pair.37 pair.47 pair.58 pair.67 pair.70 pair.72 pair.73 pair.74 pair.76 pair.77 pair.80" +
        " " + "pair.82 pair.85 pair.88 sum.13 sum.18 sum.21 sum.25 sum.27 sum.28 sum.30 sum.31 sum.33 sum.37 sum.47 sum.52 sum.58 sum.67",
      "money,overview": "pair.38 pair.48 pair.78 pair.83 pair.84 pair.87 sum.38 sum.48",
      "overview,work": "pair.17 pair.71 sum.17 sum.71"
    },
    "iching": {
      "advice,love,money,overview,timing,work": "rel.26",
      "advice,love,money,overview,work": "hex.26",
      "advice,money": "hex.49 rel.49",
      "all": "hex.3 hex.5 hex.6 hex.10 hex.12 hex.23 hex.29 hex.33 hex.36 hex.39 hex.41 hex.44 hex.47 hex.52 hex.60 line.1 line.3 line.6 rel.3 rel.5 rel.6" +
        " " + "rel.10 rel.12 rel.23 rel.29 rel.33 rel.36 rel.39 rel.41 rel.44 rel.47 rel.52 rel.60",
      "love,money,overview,timing,work": "rel.25 rel.64",
      "love,money,overview,work": "hex.25 hex.64",
      "money": "hex.4 hex.18 hex.27 hex.32 hex.34 hex.51 hex.59 rel.4 rel.18 rel.27 rel.32 rel.34 rel.51 rel.59",
      "money,overview": "hex.28 hex.38",
      "money,overview,timing": "hex.20 hex.62 rel.20 rel.28 rel.38 rel.62",
      "money,timing": "hex.55 rel.55",
      "money,work": "hex.54 rel.54",
      "overview,social": "tri.lower.kan tri.upper.kan",
      "overview,timing": "hex.63 rel.63",
      "overview,timing,work": "rel.21",
      "overview,work": "hex.21",
      "personality,social": "tri.lower.gen tri.upper.gen"
    },
    "zodiac": {
      "advice": "animal.11",
      "all": "rel.break rel.clash rel.harm rel.same",
      "money": "animal.0 el.same",
      "money,overview": "el.power"
    },
    "astro": {
      "advice,money": "sun.11",
      "advice": "el.fire moon.2 moon.11 sun.2",
      "money": "sun.0 sun.4"
    },
    "dream": {
      "love,money,overview,work": "sym.turtle",
      "love": "sym.fish sym.stairs",
      "love,work": "sym.run",
      "money,overview": "sym.ex",
      "money": "sym.car sym.crocodile sym.dog sym.door sym.elder sym.elephant sym.flower sym.fly sym.friend sym.fruit sym.gold sym.hands sym.market" +
        " " + "sym.phone sym.ring sym.swim sym.teeth sym.tiger sym.tree sym.umbrella sym.win",
      "money,work": "sym.ancestor sym.book sym.buddha sym.candle sym.egg sym.flood sym.hair sym.merit sym.monk sym.naga sym.school sym.teacher sym.temple",
      "overview": "mood.confused sym.argue sym.cat sym.cave sym.chased sym.clock sym.fall sym.lost sym.mirror sym.monkey sym.thunder theme.inner",
      "overview,timing": "type",
      "work": "sym.bird sym.horse sym.mountain sym.river"
    },
    "bazi": {
      "advice,money": "luck.peer",
      "advice,work": "luck.officer",
      "all": "el.lo.earth el.lo.fire el.lo.metal el.lo.water el.lo.wood str.weak",
      "timing": "luck.wealth"
    },
    "taksa": {
      "all": "tk.kalakini.1 tk.kalakini.2 tk.kalakini.3 tk.kalakini.4 tk.kalakini.5 tk.kalakini.6 tk.kalakini.7 tk.kalakini.8"
    },
    "lek7": {
      "all": "l7.0.caution l7.1.caution l7.2.caution l7.3.caution l7.4.caution l7.5.caution l7.6.caution"
    },
    "lifegraph": {
      "all": "lg.now.care.caution lg.now.love.caution lg.now.money.caution",
      "timing": "lg.luck.wealth"
    }
  });
  const GLOB = /** @type {Record<string, Array<[RegExp, string[] | "all"]>>} */ ({}), EXACT = /** @type {Record<string, Record<string, string[] | "all">>} */ ({});
  for (const d of Object.keys(TAGS)) {
    GLOB[d] = []; EXACT[d] = {};
    for (const a of Object.keys(TAGS[d])) for (const k of TAGS[d][a].split(" ")) {
      const v = a === "all" ? "all" : a.split(",");
      if (k.indexOf("*") >= 0) GLOB[d].push([new RegExp("^" + k.replace(/[.]/g, "\\.").replace(/\*/g, "[^.]+") + "$"), v]); else EXACT[d][k] = v;
    }
  }
  const key = (/** @type {string} */ d, /** @type {string} */ id) => (d === "tarot" ? String(id).replace(/^card\.[a-z]+\./, "") : String(id));
  /** tag of one fact item: "all" | string[] (areas) | null; the engine's own item.restrain first, then the table */
  function of(/** @type {string} */ d, /** @type {any} */ it) {
    if (!it) return null;
    if (it.restrain === "all" || (Array.isArray(it.restrain) && it.restrain.length)) return it.restrain;
    const k = key(d, it.id || ""), E = EXACT[d];
    if (E && E[k]) return E[k];
    for (const [re, v] of GLOB[d] || []) if (re.test(k)) return v;
    const sum = d === "numbers" && /^sum\.(\d\d)$/.exec(k), p = sum && E && E["pair." + sum[1]];
    return p ? (p === "all" ? "all" : [...new Set(p.concat("overview"))]) : null;
  }
  const count = (/** @type {string} */ d) => (TAGS[d] ? Object.values(TAGS[d]).reduce((n, ks) => n + ks.split(" ").length, 0) : 0);
  /** the text of every tagged entry in a fact set, in the reading language: [{ id, area, text }]; tr(item) -> that language's item */
  function sources(/** @type {any} */ F, /** @type {(it: any) => any} */ tr) {
    const out = /** @type {Array<{id: string, area: string, text: string}>} */ ([]);
    for (const it of (F && F.items) || []) {
      const tag = of(F.domain, it); if (!tag) continue;
      const x = tr(it) || {}, ms = x.meanings || {};
      if (tag === "all") for (const t of [x.label, x.short]) if (t) out.push({ id: it.id, area: "label", text: String(t) });
      for (const a of tag === "all" ? Object.keys(ms) : tag) for (const t of [].concat(ms[a] || [])) if (t) out.push({ id: it.id, area: a, text: String(t) });
    }
    const tips = F && F.extras && Array.isArray(F.extras.restrainTips) ? F.extras.restrainTips : [];
    for (const t of tips) if (t) out.push({ id: "extras.tips", area: "tip", text: String(t) });
    return out;
  }
  /** fill site: a template filled with these items (or "named": every item whose name is in the text) is caution text when
   *  one of them is unfavourable (isCaution) or tagged ("all" only when allOnly); records { id, area: "fill", text } into rec.
   *  With m (a meaning the composer rewrote into text, Thai): records { id, area: the tagged area that meaning came from, text }
   *  when m is one of a tagged area's meanings of these items ("any": every item, and the restraining tips); clean = the
   *  composer's cleanMeaning. The rewritten text itself is never matched. */
  function fill(/** @type {any[]} */ rec, /** @type {any} */ F, /** @type {any} */ its, /** @type {string} */ text,
    /** @type {(it: any) => boolean} */ isCaution, /** @type {boolean} */ allOnly, /** @type {string} */ m, /** @type {(s: string) => string} */ clean) {
    if (!rec || !F || !text) return;
    if (m) return fromMeaning(rec, F, its, text, isCaution, String(m), clean || ((/** @type {string} */ s) => String(s || "").trim()));
    const names = (/** @type {any} */ it) => [it.short, it.label, String(it.label || "").replace(/\s*[(（][^)）]*[)）]/g, "").trim()];
    const named = (/** @type {any} */ it) => names(it).some(n => n && String(n).length >= 2 && text.indexOf(String(n)) >= 0);
    const byId = (/** @type {any} */ it) => (F.items || []).find((/** @type {any} */ x) => it && String(x.id) === String(it.id)) || it; // the engine's own item
    const list = its === "named" ? (F.items || []).filter(named) : [].concat(its || []).map(byId);
    for (const it of list) {
      const tag = it && of(F.domain, it);
      if (it && (isCaution(it) || (tag && (!allOnly || tag === "all")))) { rec.push({ id: String(it.id), area: "fill", text: String(text) }); return; }
    }
  }
  function fromMeaning(/** @type {any[]} */ rec, /** @type {any} */ F, /** @type {any} */ its, /** @type {string} */ text,
    /** @type {(it: any) => boolean} */ isCaution, /** @type {string} */ m, /** @type {(s: string) => string} */ clean) {
    const same = (/** @type {any} */ x) => { const c = clean(String(x || "")); return !!c && (c === m || (m.length >= 8 && (c.indexOf(m) >= 0 || m.indexOf(c) >= 0))); };
    const byId = (/** @type {any} */ it) => (F.items || []).find((/** @type {any} */ x) => it && String(x.id) === String(it.id)) || it;
    for (const it of its === "any" ? F.items || [] : [].concat(its || []).map(byId)) {
      if (!it) continue;
      const tag = of(F.domain, it), ms = it.meanings || {}, caution = isCaution(it);
      if (!tag && !caution) continue;
      for (const a of tag === "all" || caution || !tag ? Object.keys(ms) : tag) {
        if ([].concat(ms[a] || []).some(same)) { rec.push({ id: String(it.id), area: a, text: String(text) }); return; }
      }
    }
    const tips = F.extras && Array.isArray(F.extras.restrainTips) ? F.extras.restrainTips : [];
    if (its === "any" && tips.some(same)) rec.push({ id: "extras.tips", area: "tip", text: String(text) });
  }
  // the fragments fortune-ai.js markCaution matches: clauses / words of 12+ characters (6+ for Chinese), and the whole text
  function frags(/** @type {string} */ t, /** @type {string} */ lang) {
    const en = lang === "en", s = en ? t.toLowerCase() : t;
    return (lang === "zh" ? s.split(/[，。；！？]/) : en ? s.split(/[,.;:!?]\s+/) : s.split(" ")).concat([s]).map(x => x.trim()).filter(x => x.length >= (lang === "zh" ? 6 : 12));
  }
  /** provenance: every final paragraph that carries text from a tagged entry -> [{ section, para, id, area }] */
  function provenance(/** @type {any} */ out, /** @type {string} */ lang, /** @type {Array<{id: string, area: string, text: string}>} */ src) {
    const lc = (/** @type {string} */ t) => (lang === "en" ? t.toLowerCase() : t), fr = src.map(x => ({ x, f: frags(x.text, lang) })), res = /** @type {any[]} */ ([]);
    for (const s of (out && out.sections) || []) (s.paragraphs || []).forEach((/** @type {string} */ p, /** @type {number} */ i) => {
      const seen = new Set(), P = lc(String(p));
      for (const { x, f } of fr) if (!seen.has(x.id + "|" + x.area) && f.some(q => P.includes(q))) { seen.add(x.id + "|" + x.area); res.push({ section: s.id, para: i, id: x.id, area: x.area }); }
    });
    return res;
  }
  const API = { TAGS, of, count, sources, fill, provenance };
  // exports only from its own file: the copy inside fortune-read.js (tools/fortune-read-embed.mjs) leaves that module's exports alone
  if (typeof module !== "undefined" && module.exports && !Object.keys(module.exports).length) module.exports = API;
  root.LQFortuneRestrain = API;
})(typeof window !== "undefined" ? window : globalThis);
/* END fortune-restrain.js */
