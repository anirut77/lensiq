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
  // notes: docs/FORTUNE-AI-NOTES.md #R1
  const N = root.LQNotice || (typeof require === "function" ? require("./fortune-notice.js") : null);
  const { LINE, MORE, LESS, SEP, NOTE_MAX, NEVER_COLLAPSE, langOf, cutsEn, noticeSplit, pageLang, never, moreButton, noticeify, notices } = N;
  // notes: docs/FORTUNE-AI-NOTES.md #R2
  const TH_CONT_NEXT = /^(?:และ|หรือ|แต่|ซึ่ง|ที่|ๆ|เพื่อ|จึง|ก็|แล้ว|ไม่|ได้|ให้|กับ|ของ|ใน(?!ฐานะ)|คือ|ว่า|เป็น|มาก|ด้วย|อยู่|ไว้|กัน|ไป|มา|เช่น|ได้แก่|เสริมด้วย|[\d(/–\-)])/;
  // notes: docs/FORTUNE-AI-NOTES.md #R3
  const TH_REPORT_NEXT = /^(?:สื่อว่า|สื่อถึง|บ่งบอก|ชี้ว่า|สะท้อน|แสดงว่า|หมายความว่า|หมายถึง|ตีความ|ตำราอ่าน|อ่านได้ว่า|แปลได้ว่า|ตามตำราอ่าน|ตามความเชื่อหมายถึง|ตำราให้ความหมาย|ซึ่งหมายความ|เน้นเรื่อง|ชวนให้|แนะให้|เป็นสัญญาณ|เตือนเบา)/;
  const TH_FROM = /^จาก/, TH_FROM_VERB = /(?:มา|ได้|ออก|ห่าง|พ้น|แยก|หลุด|กลับ|รับ|ไกล)$/;
  const TH_CONT_PREV = /(?:คือ|ว่า|และ|หรือ|ของ|ใน|กับ|จาก|ที่|ซึ่ง|เพื่อ|เช่น|ได้แก่|อย่าง|แบบ|โดย|ตาม|ทั้ง|ๆ|[(/–\-])$/;
  // notes: docs/FORTUNE-AI-NOTES.md #R4
  const TH_UNIT = /^(?:ปี|เท่า|%|องศา|คน|วัน|เดือน|ครั้ง|ข้อ|ชั่วโมง|นาที|บาท|ใบ|ตัว|ดวง|ฐาน|ภพ|ช่วง|สัปดาห์|ขวบ)/;
  const TH_LIST_NEXT = /^\S{1,14} (?:\S{1,14} )?(?:และ|หรือ)\S/, TH_LEAD_PREV = /(?:^|\s)(?:สำหรับ|จาก|ดูที่|ส่วน|เรื่อง|ด้าน|ในฐานะ|ในส่วนของ|ในมุมของ|ตาม|เมื่อดูที่)\S*(?:\s+[一-鿿\d]+)?(?:\s*[(（][^)）]*[)）])?$/;
  // notes: docs/FORTUNE-AI-NOTES.md #R5
  const TH_TRANS_PREV = /(?:^|\s)(?:ที่สำคัญ|เช่นเดียวกัน|พร้อมกันนั้น|ในขณะเดียวกัน|ถ้ามีเวลา|นอกจากนี้|ในอีกมุมหนึ่ง|อีกด้านหนึ่ง|ถัดมา|อีกทั้ง|ในทำนองเดียวกัน|ที่น่าสังเกตคือ|อีกเรื่องหนึ่งคือ|ต่อจากนั้น|ยิ่งไปกว่านั้น|ขณะเดียวกัน)$/;
  const openBracket = (/** @type {string} */ a) => (a.match(/[(（]/g) || []).length > (a.match(/[)）]/g) || []).length;
  // notes: docs/FORTUNE-AI-NOTES.md #R6
  const TH_TAG_END = /(?:^|\s)ในตำรา\S*$|(?:^|\s)ชาวปี(?:ชวด|ฉลู|ขาล|เถาะ|มะโรง|มะเส็ง|มะเมีย|มะแม|วอก|ระกา|จอ|กุน)$|(?:^|\s)(?:เช่น|คือ|ว่า|ได้แก่)$/;
  const TH_LISTS = [/ปี(?:ชวด|ฉลู|ขาล|เถาะ|มะโรง|มะเส็ง|มะเมีย|มะแม|วอก|ระกา|จอ|กุน)/, /^วัน(?:อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส\S*|ศุกร์|เสาร์)$/,
    /^(?:สี)?(?:แดง|ส้ม|เหลือง|เขียว|ฟ้า|น้ำเงิน|ม่วง|ชมพู|ขาว|ดำ|เทา|ทอง|เงิน|น้ำตาล|ครีม)$/, /^(?:ทิศ)?(?:เหนือ|ใต้|ตะวันออก|ตะวันตก|ตะวันออกเฉียง\S+|ตะวันตกเฉียง\S+)$/];
  const listCut = (/** @type {string} */ a, /** @type {string} */ b) => {
    const x = (a.split(" ").pop() || "").replace(/^(?:และ|หรือ)/, ""), y = (b.split(" ")[0] || "").replace(/^(?:และ|หรือ)/, "");
    return TH_LISTS.some(re => re.test(x) && (re.test(y) || (/^(?:และ|หรือ)/.test(b) && re.test(b.replace(/^(?:และ|หรือ)\s?/, "").split(" ")[0] || ""))));
  };
  function cutsTh(p) {
    const out = [];
    for (let i = p.indexOf(" "); i >= 0; i = p.indexOf(" ", i + 1)) {
      if (p[i + 1] === " " || p[i - 1] === " ") continue;
      const a = p.slice(0, i), b = p.slice(i + 1);
      // notes: docs/FORTUNE-AI-NOTES.md #R7
      if (/^[ๆ一-鿿(（]/.test(b)) continue;
      // notes: docs/FORTUNE-AI-NOTES.md #R8
      if (/^["“'‘「]/.test(b) || /["“”]$/.test(a) || (/^\d/.test(b) && /[ก-๎A-Za-z]$/.test(a)) || /(?:^|\s)(?:ใน)?(?:ปี|เดือน)\s?\d{1,4}$/.test(a) || listCut(a, b)) continue;
      // notes: docs/FORTUNE-AI-NOTES.md #R9
      const soft = !/ๆ$/.test(a) && !(/\d$/.test(a) && TH_UNIT.test(b)) && !(TH_LIST_NEXT.test(b) && !/[.!?)]$/.test(a)) && !TH_LEAD_PREV.test(a) && !/^(?:เช่น|ได้แก่|เสริมด้วย|และ|หรือ)/.test(b) && !TH_TRANS_PREV.test(a) && !openBracket(a) && !TH_TAG_END.test(a) && !(/[)）]$/.test(a) && TH_REPORT_NEXT.test(b));
      const mild = !/ๆ$/.test(a) && !TH_LEAD_PREV.test(a) && !TH_TRANS_PREV.test(a) && !openBracket(a) && !TH_TAG_END.test(a) && !/^(?:เช่น|ได้แก่)/.test(b);
      out.push({ at: i, soft, mild, ok: soft && !TH_CONT_NEXT.test(b) && !TH_CONT_PREV.test(a) && !(TH_FROM.test(b) && TH_FROM_VERB.test(a)) && !TH_REPORT_NEXT.test(b) && !/^[(（]/.test(b) });
    }
    return out;
  }
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
  const OVERVIEW_MAX = { th: 100, en: 140, zh: 50 }; // owner item 5: about 3 lines at 375 px (EN / ZH: room for one whole sentence, quality round 2026-11-16)

  // notes: docs/FORTUNE-AI-NOTES.md #R10
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
      const good = inRange.filter(c => c.ok);
      // notes: docs/FORTUNE-AI-NOTES.md #R11
      const pick = good.find(c => c.at - start >= target * 0.8) || good[good.length - 1] || inRange.filter(c => c.soft !== false).pop() || (start === 0 ? inRange.filter(c => c.mild).pop() : null) || cuts.find(c => c.at > start + max && c.soft !== false);
      if (!pick) break;
      if (pick.at - start < 12 && inRange.length > 1) { const later = inRange.find(c => c.at - start >= 12); if (later) { out.push(p.slice(start, later.at)); start = later.at + 1; continue; } }
      out.push(p.slice(start, pick.at)); start = pick.at + 1;
    }
    out.push(p.slice(start));
    return out.filter((x, i) => x.length || i === 0);
  }
  // notes: docs/FORTUNE-AI-NOTES.md #R12
  function overviewCut(p, lang) {
    const max = OVERVIEW_MAX[lang];
    if (p.length <= max) return [p];
    let at = -1;
    if (lang === "zh") {
      // quality round 2026-11-16 (R3): a short first sentence is better than a cut after a comma
      const re = /[。！？；]/g; let m; while ((m = re.exec(p)) && m.index < max) at = m.index + 1;
      if (at <= 0) { const re2 = /[，、]/g; let m2; while ((m2 = re2.exec(p)) && m2.index < max) at = Math.max(at, m2.index + 1); }
      if (at <= 0) return split(p, lang);
      return [p.slice(0, at)].concat(split(p.slice(at), lang));
    }
    const cuts = lang === "en" ? cutsEn(p) : cutsTh(p);
    const okc = cuts.filter(c => c.ok && c.at <= max && c.at >= max * 0.4);
    const th = lang === "th", within = x => x.at <= max, past = f => x => x.at > max && x.at <= max * f;
    // notes: docs/FORTUNE-AI-NOTES.md #R13
    let c = okc[okc.length - 1] || cuts.filter(x => x.ok && within(x) && x.at >= (th ? 40 : 12)).pop() ||
      (th ? cuts.filter(x => x.soft && within(x) && x.at >= 40).pop() || cuts.find(x => x.ok && past(1.15)(x)) || cuts.find(x => x.soft && past(1.15)(x)) : null);
    if (!c && th) c = cuts.filter(x => x.ok && within(x) && x.at >= 12).pop() || null; // notes: docs/FORTUNE-AI-NOTES.md #R14
    const clen = x => p.slice(0, x.at).replace(/\s*[(（][^)）]*[)）]/g, "").length;
    if (c && th && (c.at < 40 || clen(c) < 45)) { const nx = cuts.find(x => (x.ok || x.soft) && x.at > 60 && clen(x) >= 45 && x.at <= max); if (nx) c = nx; else if (c.at < 40 && p.length <= max * 1.6) return [p];
      // notes: docs/FORTUNE-AI-NOTES.md #R15
      else if (clen(c) < 30) { const nx2 = cuts.find(x => (x.ok || x.soft) && x.at >= 40 && clen(x) >= 45 && x.at <= max * 1.35); if (nx2) c = nx2; } } // … not a bare name
    if (!c && p.length <= max * 1.25) return [p];
    // notes: docs/FORTUNE-AI-NOTES.md #R16
    if (!c && lang === "en") { const s1 = cuts.find(x => x.at > max && x.at <= max * 1.25); if (s1) c = s1; }
    if (!c && lang === "en") { const cm = [...p.matchAll(/, /g)].map(m => m.index + 1).filter(i => i <= max && i >= max * 0.4); if (cm.length) c = { at: cm[cm.length - 1] }; }
    if (!c && th) c = cuts.find(x => x.soft && past(2)(x)) || null;
    if (!c && th && p.length <= max * 1.6) return [p]; // never a visible end that strands a word group
    if (!c) { const any = lang === "en" ? [...p.matchAll(/ /g)].map(m => ({ at: m.index })) : cuts.filter(x => x.soft); c = any.filter(x => x.at <= max && x.at >= 12).pop(); }
    if (!c) return split(p, lang);
    at = c.at;
    return [p.slice(0, at)].concat(split(p.slice(at + 1), lang));
  }
  // notes: docs/FORTUNE-AI-NOTES.md #R17
  function plan(paragraphs, lang, opts) {
    lang = langOf(lang);
    const leads = (opts && opts.leads) || [], flags = opts && Array.isArray(opts.flags) ? opts.flags : null, parts = [];
    (paragraphs || []).forEach((p, k) => {
      const caution = !!(flags && flags[k]) || leads.some(l => l && String(p).includes(l));
      // notes: docs/FORTUNE-AI-NOTES.md #R18
      const chunks = caution ? [String(p)] : k === 0 ? overviewCut(String(p), lang) : split(p, lang);
      chunks.forEach((t, j) => parts.push({ text: t, para: k, caution, visible: !flags || caution || (k === 0 && j === 0) }));
    });
    return parts;
  }
  /** the composer's marks of one section, or null when they are missing or do not line up with the paragraphs */
  const marksOf = s => (s && Array.isArray(s.caution) && Array.isArray(s.paragraphs) && s.caution.length === s.paragraphs.length ? s.caution : null);
  /** plan of one composed section (what the page shows): folds only when the composer marked the section */
  function planSection(s, lang) { return plan((s && s.paragraphs) || [], lang, { flags: marksOf(s) }); }
  // notes: docs/FORTUNE-AI-NOTES.md #R19
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
  // notes: docs/FORTUNE-AI-NOTES.md #R20
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
    // notes: docs/FORTUNE-AI-NOTES.md #R21
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
  // notes: docs/FORTUNE-AI-NOTES.md #R22
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
/* BEGIN fortune-brief.js (copied by tools/fortune-read-embed.mjs; edit fortune-brief.js, then run it) */
/* fortune-brief.js — two composer helpers of fortune-ai.js, split out so fortune-ai.js stays under its size cap (eslint.config.mjs).
   The 15 reading pages get it inside fortune-read.js (tools/fortune-read-embed.mjs; no extra request, speed budget), as
   window.LQFortuneBrief; fortune-ai.js requires it in Node.
   fortune-ai.js passes its own functions and tables in (no copies here), so both files always use the same rules.
   - repeatsUsed: a knowledge-base line that repeats a long phrase already used in the reading (a siam si slip's image in the
     overview and again in a group read as the same sentence twice)
   - briefMore: a short "in brief" group (under 90 characters) gets one more line on the same areas from what was found, a fuller
     wording of the same line, or the practical step the topic groups give; still too short, the composer leaves it out
   - closeAfter: the EN / ZH "pick one of these" closer only after two or more tips in the same group
   Quality round 3 (2026-11-16). Based on traditional beliefs; readers use their own judgement. */
(function (root) {
  "use strict";
  function make(D) {
    const RUN = 12;
    function repeatsUsed(ctx, c) {
      const t = String(c).replace(/\s+/g, "");
      if (t.length < RUN) return false;
      for (const u of ctx.used) {
        const v = String(u).replace(/\s+/g, "");
        if (v === t || v.length < RUN) continue;
        for (let i = 0; i + RUN <= t.length; i += 2) if (v.indexOf(t.slice(i, i + RUN)) >= 0) return true;
      }
      return false;
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B1
    const NEAR = { personality: ["overview"], social: ["personality", "overview"], timing: ["overview"], work: ["personality", "overview"], money: ["overview"], love: ["personality"], advice: [] };
    // notes: docs/FORTUNE-AI-NOTES.md #B2
    const readsOk = t => !D.grammarIssues(t).length && !D.thJoinIssues(t) && !/คือ[^\s]{0,30}คือ/.test(t);
    const say = (ctx, id, it, m) => { ctx.sec = id; ctx.secUnits = 1; ctx.gFirst = false; const u = D.itemSentence(ctx, it, m, "first"); return u && u.text ? D.tidy(u.text) : ""; };
    function moreLine(ctx, b, line) {
      const own = D.SECTION_KEYS[b.id] || [];
      for (const keys of [own, NEAR[b.id] || []]) {
        if (!keys.length) continue;
        for (const it of ctx.F.items.filter(x => D.hasKeys(x, keys))) {
          const m = D.pickMeaning(ctx, it, keys, b.id); if (!m) continue;
          if (keys !== own && (D.topicsIn(m).some(t => t !== b.id) || D.offTopic(m, b.id))) continue;
          const t = say(ctx, b.id, it, m);
          if (t && D.isSafe(t) && readsOk(line + " " + t)) return line + " " + t;
        }
      }
      return null;
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B3
    function fullerLine(ctx, b, line) {
      const own = D.SECTION_KEYS[b.id] || [];
      let best = null;
      for (const it of ctx.F.items.filter(x => D.hasKeys(x, own))) for (const k of own) for (const m0 of it.meanings[k] || []) {
        const c = D.cleanMeaning(m0);
        if (!c || ctx.used.has(c) || !D.isSafe(c) || D.offTopic(c, b.id) || D.loveOnlyIn(c, b.id) || repeatsUsed(ctx, c)) continue;
        if (![...ctx.used].some(u => String(u).length >= 6 && c.indexOf(u) >= 0 && line.indexOf(u) >= 0)) continue;
        if (!best || c.length > best.c.length) best = { it, c };
      }
      const t = best && say(ctx, b.id, best.it, best.c), full = t && D.BRIEF_TH[b.id] + " " + t;
      if (!full || !D.isSafe(full) || !readsOk(full)) return null;
      D.markUsed(ctx, best.c);
      return full;
    }
    // the practical step for this area that the topic groups give after a finding (same remedy table, same labels)
    function stepLine(ctx, b, line) {
      const it = ctx.F.items.find(x => D.hasKeys(x, D.SECTION_KEYS[b.id] || []));
      const rm = it && D.remedyFor(ctx.F, it, b.id);
      if (!rm || ctx.remedyKeys.has(rm.key) || !D.isSafe(rm.th) || D.offTopic(rm.th, b.id)) return null;
      ctx.remedyKeys.add(rm.key);
      return line + " " + D.pick(ctx.r, D.TRAD_REMEDY.has(rm.cat) ? D.REMEDY_FRAMES_TH : D.REMEDY_FRAMES_GENERAL_TH) + rm.th.replace(/^ตามตำรา/, "");
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B4
    function briefMore(ctx, briefs, lines) {
      briefs.forEach((b, i) => {
        lines[i] = moreLine(ctx, b, lines[i]) || lines[i];
        if (lines[i].length < 90) lines[i] = fullerLine(ctx, b, lines[i]) || lines[i];
      });
    }
    void stepLine;

    // notes: docs/FORTUNE-AI-NOTES.md #B5
    const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const PAREN = /\s*[(（][^)）]*[)）]/g;
    const VERB_TH = "(?:ตามตำรา|ตำรา)?(?:บ่งบอกว่า|สื่อว่า|ชี้ว่า|สะท้อนว่า|หมายความว่า|แสดงว่า|ตีความได้ว่า|แปลได้ว่า|อ่านได้ว่า|บอกว่า|อ่านว่า)";
    const LEAD_TH = "(?:ตาม|ในมุมของ|จาก|ดูที่|สำหรับ|ส่วน|ด้วย|ในส่วนของ|เมื่อดูที่)";
    // a rest that continues the clause it was cut from cannot open a group
    const TH_TAIL = /^(?:และ|หรือ|แต่|ซึ่ง|ที่|ได้\s?\d|ได้ |ของ|กับ|ว่า|ให้|ก็|จึง|[\d(（])/;
    // notes: docs/FORTUNE-AI-NOTES.md #B6
    const HEDGE = { th: /^(?:ตามความเชื่อ(?:ไทย|จีน)?(?:แล้ว)?|ตามตำรา(?:ไทย|จีน)?|ในตำรา(?:ไทย|จีน)?|ตามศาสตร์\S+)\s+(?=\S)/, en: /^(?:Traditionally|In traditional readings),\s+/, zh: /^(?:按传统说法|按照传统说法|传统上)，/ };
    function namesOf(items, lang) {
      const out = new Set();
      for (const it of items || []) for (const n of [it.label, it.short]) {
        if (!n) continue;
        const b = String(n).replace(PAREN, "").trim();
        for (const x of [String(n), b, b.replace(/\s*[\d.,]+\s*%?$/, "").trim()]) if (x.length >= 2) out.add(x);
      }
      return [...out].sort((a, b) => b.length - a.length);
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B7
    const PERSON_X = /^(?:ปกป้อง|ทุ่มเท|มีเป้าหมาย|รู้ใจ|รู้ตัว|เดินถูกทาง|บริหาร|โดดเด่น|ฉลาด|เชื่อมโยง|มีปัญญา|รู้จัก|จริงใจ|ช่วยเหลือ|รับฟัง|เปิดเผย|อบอุ่น|มีอารมณ์|มีเครือข่าย|มีรายได้|เก็บเล็กผสมน้อย|ลงมือ|เห็นอกเห็นใจ)/;
    const personTh = t => !/^คุณ/.test(t) && !D.isImperative(t) && (D.roleOf(t) === "vpPerson" || D.TRAIT_TH.test(t) || PERSON_X.test(t));
    // notes: docs/FORTUNE-AI-NOTES.md #B8
    const BARE_TH = new RegExp("^(?:มี(?!ความหมาย|โอกาสที่จะเกิด|ตัวเลือก|ทาง|สิ่ง|เรื่อง|ข่าว|อุปสรรค|ปัญหา|แรง|เป้าหมายร่วม|คนคอย|หลาย)|เป็น(?!ปี|ช่วง|จังหวะ|เวลา|สัญญาณ|ลาง|วัน|เดือน|เรื่อง|ภาพ)|" +
      "โรแมนติก|ประณีต|ประนีประนอม|อารมณ์ดี|มั่นคง|เข้ากับ|เด็ดขาด|ยุติธรรม|ลึกซึ้ง|หนักแน่น|ฉลาด|อ่อนโยน|อ่อนหวาน|ใจ(?:ดี|เย็น|กว้าง|ร้อน|อ่อน|สู้)|ช่าง(?:คิด|สังเกต|พูด|เจรจา)|" +
      "เก่ง|รัก(?!ษา)|ชอบ|มัก|กล้า|ขยัน|ร่าเริง|อบอุ่น|จริงใจ|ซื่อ|ละเอียด|รอบคอบ|อดทน|มุ่งมั่น|สุขุม|ทะเยอทะยาน|ตรงไปตรงมา|เปิดเผย|มั่นใจ|เรียบร้อย|สดใส|" +
      "คล่องแคล่ว|คุยเก่ง|พูดเก่ง|ยืดหยุ่น|ปรับตัว|สร้างสรรค์|มองการณ์|เห็นอกเห็นใจ|เอาใจใส่|ใส่ใจ|ให้ความสำคัญ|ถนัด|เหมาะกับ(?!การ)|ดู(?:อบอุ่น|สดใส|เรียบร้อย|น่า|เป็นคน|ดี)|" +
      "รักสงบ|น่าเชื่อถือ|น่ารัก|ทำงาน(?:เก่ง|ได้ดี|หนัก)|พูดจา|คิดเร็ว|คิดลึก)");
    const HAVE_TH = /^(?:สติปัญญา|ปัญญา|เสน่ห์|รสนิยม|บารมี|วาทศิลป์|ไหวพริบ)/;
    const ADVICE_HAVE = /^มี\S*ไว้(?:\s|$)/;
    const FINDING_PRED = /^(?:เป็น(?:จุด|พลัง|ด้าน|ส่วน|หลัก|แรง|ตัว|สัญญาณ|ภาพ|ไพ่|ฐาน|ภพ|ภูมิ)|มีพลัง(?:ปานกลาง|มาก|น้อย|เด่น)|อยู่ใน|อยู่ที่)/;
    const subjOf = t => (/^คุณ/.test(t) || D.isImperative(t) || ADVICE_HAVE.test(t) || FINDING_PRED.test(t) ? "" : HAVE_TH.test(t) ? "คุณมี" : personTh(t) || BARE_TH.test(t) ? "คุณ" : "");
    // notes: docs/FORTUNE-AI-NOTES.md #B9
    const INSTR_OK = /^(?:ลอง|เลือก|จัด|ตั้ง(?!แต่|ใจ)|ใช้|เก็บ|เช็ก|ตรวจ|พัก|ปรึกษา|วางแผน|วาง|ให้|เริ่ม|ฝึก|อย่า|ควร|รักษา|เขียน|จด|แบ่ง|ชวน|ทบทวน|ระวัง|เตรียม|ออม|หมั่น|ทดลอง|ฉลอง|หยุด|ประกาศ|พัฒนา|เปิดใจ|หา(?!ก)|ทำ(?!งาน|ให้)|คุย|ขอ|ฟัง|อ่าน|เดิน|ปล่อย|มอง(?!การณ์)|ดูแล|เติม|หล่อเลี้ยง|ติดตาม|กล้า(?=พูด|เลือก|ลอง|ขอ)|ใจดีกับ|มีเงินสำรอง|มี\S*ไว้(?:\s|$))/;
    const QUALITY_TH = /^(?:สัญชาตญาณ|สติปัญญา|ปัญญา|เสน่ห์|รสนิยม|บารมี|วาทศิลป์|ไหวพริบ)/;
    function startTh(t, names) {
      if (!t || names.some(n => n.length >= 2 && t.startsWith(n)) || INSTR_OK.test(t) || D.isImperative(t)) return t;
      if (/^\d/.test(t)) return t; // the lead that carried the number is restored by the caller (framesTh never strips it)
      if (/^เหมาะกับการ/.test(t)) return "ช่วงนี้" + t;
      if (QUALITY_TH.test(t)) return "คุณมี" + t;
      const k = /^(\S{2,12}?)คือ(?=หลัก|สิ่ง|กุญแจ)/.exec(t); // a bare keyword ("รองรับคือหลักที่ช่วย…")
      if (k && VERB_KEY.test(k[1])) return "การ" + t;
      // "เป็นปีที่ดี…" → "ปีนี้เป็นปีที่ดี…", "เป็นช่วง…" → "ตอนนี้เป็นช่วง…", "เป็นจังหวะ…" → "ช่วงนี้เป็นจังหวะ…"
      if (/^เป็นปี/.test(t)) return "ปีนี้" + t;
      if (/^เป็น(?:ช่วง|เวลา)/.test(t)) return "ตอนนี้" + t;
      if (/^เป็นจังหวะ/.test(t)) return "ช่วงนี้" + t;
      // notes: docs/FORTUNE-AI-NOTES.md #B43
      return PRED_TH.test(t) ? "คุณ" + t : t;
    }
    const VERB_KEY = /^(?:รองรับ|ใส่ใจ|ลงมือ|อดทน|รอคอย|ปล่อยวาง|ร่วมมือ|ฟื้นฟู|เริ่มต้น|ถ่อมตน|ยืดหยุ่น|ระมัดระวัง|แบ่งปัน|เปิดใจ|ฟัง|รับฟัง|ปรับตัว|ตั้งใจ|เตรียมพร้อม|สื่อสาร|สร้าง|ขยาย|ซ่อมแซม|ยึดมั่น|หยุดพัก|ให้|รับ|เดินหน้า|ถอย|รักษา|ดูแล|อ่อนน้อม|ซื่อสัตย์|เพิ่มพูน|ลด|ละ|รวม|แยก|สะสม)/;
    const PRED_TH = /^(?:สะสม|ผสาน|เด่น(?!ชัด)|สื่อสาร|กว้างไกล|ดู(?!แล|ที่)|เจรจา|ปิดงาน|ได้รับ|สร้าง|รู้จัก|รู้ใจ|เข้าใจ|เข้ากับ|ชอบ|รัก(?!ษา)|มัก|มีความ|มีพลัง|มีเสน่ห์|มีโอกาส|มีชื่อเสียง|เป็นคน|เป็นที่|ทำงาน|คิด|พูด|ใจ(?:ดี|เย็น|กว้าง|ร้อน|อ่อน|สู้)|กล้า|อ่อนโยน|อ่อนหวาน|มั่นใจ|มั่นคง|ละเอียด|ปรับตัว|ยืดหยุ่น|เปิดเผย|มองการณ์|ประณีต|โรแมนติก|อบอุ่น|มุ่งมั่น|ขยัน|อดทน|สุขุม|ซื่อ|จริงใจ|ร่าเริง|เก่ง|ถนัด|เหมาะกับ(?!การ)|ห่วงใย|ใส่ใจ|เอาใจใส่|ให้ความสำคัญ|ทุ่มเท|ฉลาด|ช่าง(?:คิด|สังเกต|พูด|เจรจา)|ตัดสินใจ|รับผิดชอบ|วางแผนเก่ง|เก็บออม|หาเงิน|ใช้จ่าย)/;
    const subjTh = t => subjOf(t) + t;
    function openTh(t, names) {
      for (const n of names) {
        const e = esc(n), m = new RegExp("^(?:คน)?" + LEAD_TH + "\\s?" + e + "(?:\\s?[(（][^)）]*[)）])?(?:\\s?" + VERB_TH + "|\\s+(?:ว่ากันว่า|เชื่อกันว่า|ตามความเชื่อแล้ว|ตามตำรา)?)\\s?").exec(t) ||
          new RegExp("^" + e + "(?:\\s?[(（][^)）]*[)）])?\\s?(?:ตาม(?:ความเชื่อ)?\\s?)?" + VERB_TH + "\\s?").exec(t);
        if (!m) continue;
        const rest = t.slice(m[0].length), out = subjTh(rest);
        ST.name = n;
        // notes: docs/FORTUNE-AI-NOTES.md #B10
        if (rest.length < 15 || TH_TAIL.test(rest) || D.isImperative(rest)) return t;
        if (/^คุณ(?:เหมาะกับ|เป็นคน|มีความ|มักจะ|ชอบ)/.test(out) && out.split(" ")[0].length < 60 && !ST.kept) { ST.kept = 1; return t; }
        // notes: docs/FORTUNE-AI-NOTES.md #B11
        const sp = out.split(" ");
        if (/^คุณ/.test(out) && sp[0].length < 30 && sp.length > 1 && D.roleOf(sp.slice(1).join(" ")) === "vpPerson" && !ST.kept) { ST.kept = 1; return t; }
        return out;
      }
      // notes: docs/FORTUNE-AI-NOTES.md #B12
      const b = /^(\S{2,20}นี้)\s+(?=\S)/.exec(t);
      if (b && names.indexOf(b[1]) >= 0 && t.length - b[0].length >= 15 && !TH_TAIL.test(t.slice(b[0].length))) return subjTh(t.slice(b[0].length));
      const h = HEDGE.th.exec(t);
      return h && t.length - h[0].length >= 15 && !TH_TAIL.test(t.slice(h[0].length)) ? t.slice(h[0].length) : t;
    }
    const EN_VERB = "(?:also )?(?:is traditionally read to mean|is read to mean|are read to mean|suggests?|shows?|means?|indicates?|points to|reflects?|says?|adds?)(?: that)?";
    function openEn(t, names) {
      const lo = t.toLowerCase();
      for (const n of names) {
        const e = esc(n.toLowerCase()), m = new RegExp("^(?:looking at|as for|with|start with|starting with|turning to|when it comes to) (?:the |your )?" + e + "(?:\\s?\\([^)]*\\))?[,:] ").exec(lo) ||
          new RegExp("^(?:(?:traditionally|in traditional readings), )?(?:the |your )?" + e + "(?:\\s?\\([^)]*\\))?,? " + EN_VERB + ",? ").exec(lo);
        if (!m) continue;
        const rest = t.slice(m[0].length);
        if (rest.length < 20 || /^(?:and|or|but|which|that)\b/.test(rest)) return t;
        ST.name = t.slice(m.index, m[0].length).match(new RegExp(e, "i"))[0].replace(/^The /, "the "); return D.cap(rest);
      }
      const h = HEDGE.en.exec(t);
      return h ? D.cap(t.slice(h[0].length)) : t;
    }
    function openZh(t, names) {
      const c = /^([^，。：]{1,32})[，：]/.exec(t);
      if (c && names.some(n => c[1].indexOf(n) >= 0) && (/^(?:从|就|说到|先看|再看|至于|按|根据)/.test(c[1]) || /(?:显示|说明|提示|表示|意味着|意思是|来看|而言|这边)$/.test(c[1])) && t.length - c[0].length >= 6) return (ST.name = names.find(n => c[1].indexOf(n) >= 0)), t.slice(c[0].length);
      const h = HEDGE.zh.exec(t);
      return h && t.length - h[0].length >= 6 ? t.slice(h[0].length) : t;
    }
    const OPEN = { th: openTh, en: openEn, zh: openZh };
    const LABEL = { th: /^\S{2,12}:\s/, en: /^[A-Z][a-z]+:\s/, zh: /^\S{1,4}方面：/ };
    // Thai frames over the wrong kind of line, and the same source lead twice
    function framesTh(q, names, seen) {
      q = q.replace(/ชวนให้ให้/g, "ชวนให้");
      q = q.replace(new RegExp("ปีนี้" + VERB_TH + "(?:คุณ(?=หาก|ถ้า|เมื่อ))?", "g"), "ปีนี้ ").replace(/ปีนี้ (?=คุณ|เป็น)/g, "ปีนี้");
      q = q.replace(new RegExp("(\\S*?)(" + VERB_TH + ")\\s?(?=\\S)", "g"), (all, pre, v, at, s) => {
        const rest = s.slice(at + all.length);
        // round 7: a person who says it ("เพื่อนบอกว่าคุยด้วยแล้วสนุก") is reported speech, not a source over an instruction
        if (/(?:เพื่อน|คน|ใคร|หัวหน้า|ผู้ใหญ่|คนรัก|ลูกค้า|ทีม)$/.test(pre)) return all;
        if (D.isImperative(rest)) return pre + (/^(?:คุณ)?อย่า/.test(rest) ? "เตือนว่า" : /^(?:ให้|พูด|ดู)/.test(rest) ? "ชวนคุณ" : "ชวนให้");
        return all + subjOf(rest);
      }).replace(/(ชวนให้|ชวนคุณ|เตือนว่า)\s?(?:คุณ)?ควร/g, "$1");
      for (const n of names) {
        const e = esc(n);
        q = q.replace(new RegExp("(^|\\s)((?:ตาม|ในมุมของ|ด้วย)" + e + ")\\s(?=\\S)", "g"), (all, sp, lead, at, s) => {
          // notes: docs/FORTUNE-AI-NOTES.md #B13
          const rest = s.slice(at + all.length);
          if (/^(?:หน้าผาก|โหนกแก้ม|คาง|ฝ่ามือ|นิ้ว|จมูก|คิ้ว|ริมฝีปาก|ดวงตา|ใบหู)/.test(rest)) return sp;
          return all + subjOf(rest);
        });
        q = q.replace(new RegExp("(^|\\s)((?:สำหรับ|จาก|ดูที่|ส่วน|ในส่วนของ)" + e + ")\\s(?=\\S)", "g"), (all, sp, lead, at, s) => all + subjOf(s.slice(at + all.length)));
        let head = false;
        q = q.replace(new RegExp("(^|\\s)(ตาม|ในมุมของ|จาก|ดูที่|สำหรับ)(" + e + ")(?=[\\s(])", "g"), (all, sp, lead, nm, at) => {
          const k = lead + nm; seen[k] = (seen[k] || 0) + 1;
          if (seen[k] === 1) return all;
          if (at === 0 && !/^\s*\d/.test(q.slice(all.length))) { head = true; return ""; } // a group never opens with a contrastive "ส่วน…": the content opens it
          const alt = "ส่วน" + nm; seen[alt] = (seen[alt] || 0) + 1;
          return sp + (seen[alt] === 1 ? alt : nm);
        });
        if (head) q = subjTh(q.replace(/^\s*(?:\([^)]*\)\s*)?/, ""));
      }
      return q;
    }
    function leadsOther(q, lang, names, seen) {
      if (!names.length) return q;
      const e = names.map(n => esc(lang === "en" ? n.toLowerCase() : n)).join("|"); // one pass: the longest name wins at each place
      const re = lang === "en" ? new RegExp("(^|\\. )(?:Looking at|As for) (?:the |your )?(?:" + e + ")(?:\\s?\\([^)]*\\))?, ", "gi") : new RegExp("(^|[。！？])(?:从(?:" + e + ")来看|说到(?:" + e + ")|就(?:" + e + ")而言)[，：]", "g");
      // notes: docs/FORTUNE-AI-NOTES.md #B14
      return q.replace(re, (all, sp) => {
        const k = all.replace(/^[.。！？\s]+/, "").toLowerCase().replace(/\s?\d.*$/, ""), n = seen[k] = (seen[k] || 0) + 1;
        const ka = k.replace(/^looking at/, "as for");
        return n === 1 ? all : lang === "en" && ka !== k && !seen[ka] ? (seen[ka] = 1, all.replace(/Looking at /i, "As for ")) : sp;
      })
        .replace(/(^|\. )([a-z])/g, (all, sp, ch) => (lang === "en" ? sp + ch.toUpperCase() : all));
    }
    function closerLast(s, lang) {
      const res = (D.CLOSE[lang] || []).map(c => new RegExp("(?:^|(?<=[\\s。！？]))" + esc(c).replace(/\\\{N\\\}/g, "\\S{1,12}?").replace(/\\\{(?:T|TW)\\\}/g, "\\S{1,24}?") + (lang === "zh" ? "。" : lang === "en" ? "\\." : "(?=\\s|$)")));
      for (let i = 0; i < s.paragraphs.length; i++) for (const re of res) {
        const m = re.exec(s.paragraphs[i]); if (!m) continue;
        const after = s.paragraphs[i].slice(m.index + m[0].length).trim();
        if (!after && i === s.paragraphs.length - 1) return;
        s.paragraphs[i] = (s.paragraphs[i].slice(0, m.index) + (lang === "zh" ? "" : " ") + after).trim();
        if (!s.paragraphs[i]) s.paragraphs.splice(i, 1);
        const last = s.paragraphs.length - 1;
        if (last >= 0) s.paragraphs[last] = s.paragraphs[last] + (lang === "zh" ? "" : " ") + m[0].trim(); else s.paragraphs.push(m[0].trim());
        return;
      }
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B15
    const SLOT = { TW: "\\S{1,30}?", X: ".{1,90}?", D: ".{0,30}?" };
    const someRe = lang => (((D.FALLBACK_LINE || {})[lang] || {}).some || []).map(f => new RegExp("^" + esc(f).replace(/\\\{(TW|X|D)\\\}/g, (a, k) => SLOT[k]) +
      (lang === "zh" ? "。" : lang === "en" ? "\\.\\s*" : "\\s+")));
    // notes: docs/FORTUNE-AI-NOTES.md #B16
    function sourced(line, lang, items, done) {
      const lo = lang === "en" ? line.toLowerCase() : line, low = x => (lang === "en" ? String(x).toLowerCase() : String(x));
      for (const it of items || []) for (const k of Object.keys(it.meanings || {})) for (const m of [].concat(it.meanings[k] || [])) {
        const c = String(m).trim(), key = low(c).slice(0, lang === "zh" ? 7 : 18);
        if (!it.label || key.length < (lang === "zh" ? 5 : 12) || lo.indexOf(key) < 0) continue;
        // notes: docs/FORTUNE-AI-NOTES.md #B17
        const bare = String(it.label).replace(PAREN, "").trim(), det = (String(it.label).match(/[(（]([^)）]*)[)）]/) || [])[1] || "";
        if (done && done.has(it.id)) return line; // one finding's source once per brief (a siam si slip is not repeated per line)
        let tail = "";
        if (lo.indexOf(low(bare)) < 0) tail = lang === "th" || !det ? bare : bare + (lang === "zh" ? "，" : ", ") + det;
        else if (lang !== "th" && det && lo.indexOf(low(det)) < 0) tail = det;
        // notes: docs/FORTUNE-AI-NOTES.md #B18
        if (tail && det && emptyCite(tail, lang) && !emptyCite(det, lang)) tail = bare + (lang === "zh" ? "，" : ", ") + det;
        if (!tail || tail.length < 2 || emptyCite(tail, lang) || /五黄|二黑|ห้าเหลือง|สองดำ|ดาว ?[25](?!\d)|\b(?:five yellow|two black|star [25])\b/i.test(tail)) return line;
        if (done) done.add(it.id);
        if (lang === "th") return line + " (" + tail + ")";
        // right after the sentence that carries the finding (not after a gloss that follows it)
        const at = lo.indexOf(key), rel = line.slice(at).search(lang === "zh" ? /[。！？]/ : /[.!?](?:\s|$)/), cut = rel < 0 ? line.length : at + rel;
        return line.slice(0, cut) + (lang === "zh" ? "（" + tail + "）" : " (" + tail + ")") + line.slice(cut);
      }
      return line;
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B19
    let ST = { kept: 0 };
    // notes: docs/FORTUNE-AI-NOTES.md #B20
    function briefPolish(lines, items, st) {
      ST = st || { kept: 0 }; const names = namesOf(items, "th"); const done = new Set();
      lines.forEach((q, i) => { const m = LABEL.th.exec(q); if (!m) return; const o = openTh(q.slice(m[0].length), names), t = /\)$/.test(o) ? o : sourced(o, "th", items, done); lines[i] = m[0] + t; });
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B21
    const units = (t, lang) => { if (lang === "en") return String(t).toLowerCase().match(/[a-z']+/g) || []; const c = [...String(t).replace(/[\s，。、：；！？,.()（）]/g, "")]; return c.slice(1).map((x, i) => c[i] + x); }; // words, or character pairs
    function nearCopy(f, all, lang) {
      const a = units(f, lang); if (a.length < 4) return false;
      const sens = lang === "zh" ? all.split(/(?<=[。！？])/) : lang === "en" ? all.split(/(?<=[.!?])\s/) : all.split(/\s+/);
      for (const x of sens) {
        const b = units(x, lang); if (b.length < 4) continue;
        const B = new Map(); for (const w of b) B.set(w, (B.get(w) || 0) + 1);
        let n = 0; for (const w of a) if (B.get(w)) { n++; B.set(w, B.get(w) - 1); }
        if (2 * n / (a.length + b.length) >= 0.6) return true;
      }
      return false;
    }
    const firstSen = (t, lang) => (lang === "zh" ? String(t).split(/(?<=[。！？])/)[0] : lang === "en" ? String(t).split(/(?<=[.!?])\s/)[0] : String(t).split(" ")[0]).trim();
    function bracketsTidy(q, lang) {
      const core = t => String(t).replace(/[,，、].*$/, "").trim().toLowerCase();
      let out = String(q).replace(/[(（]([^()（）]{1,80})[)）](\s?)[(（]([^()（）]{1,80})[)）]/g, (a, x, sp, y) => {
        const cx = core(x), cy = core(y);
        if (!cx || !cy || (cx.indexOf(cy) < 0 && cy.indexOf(cx) < 0)) return a;
        const keep = x.length >= y.length ? x : y;
        return lang === "zh" ? "（" + keep + "）" : "(" + keep + ")";
      });
      if (lang === "th") out = out.replace(/\(([^()]{1,80})\)/g, (a, x) => "(" + x.replace(/，\s?/g, ", ").replace(/、/g, ", ").replace(/[：]/g, ": ") + ")");
      return out;
    }
    function polish(secs, lang, items, st) {
      ST = st || { kept: 0 }; CITED = {};
      const names = namesOf(items, lang), seen = {}, open = OPEN[lang], some = someRe(lang);
      const before = (secs || []).map(s => s.paragraphs.slice()), dup0 = new Set(D.nearDupPairs ? D.nearDupPairs(secs, lang).map(x => x.a + "|" + x.b) : []);
      for (const s of secs || []) {
        if (s.id !== "overview" && s.paragraphs.length) {
          for (const re of some) { const m = re.exec(s.paragraphs[0]); if (m && s.paragraphs[0].length - m[0].length >= 20 && !(lang === "th" && s.paragraphs.join(" ").length - m[0].length < 90)) s.paragraphs[0] = s.paragraphs[0].slice(m[0].length); }
          // the source in brackets once per brief (a one-finding reading does not repeat its slip on every line)
          const done = new Set();
          if (s.id === "brief" && lang !== "th") s.paragraphs = s.paragraphs.map(q => { const m = LABEL[lang].exec(q); if (!m) return q; const o0 = open(q.slice(m[0].length), names), others = secs.filter(x => x !== s).map(x => x.paragraphs.join(" ")).join(" "), o = nearCopy(firstSen(o0, lang), others, lang) ? q.slice(m[0].length) : o0, t = /[)）][.。]?$/.test(o) ? o : sourced(o, lang, items, done); return m[0] + t; });
          else if (s.id !== "brief") {
            ST.name = "";
            const p0 = s.paragraphs[0], o = open(p0, names), f = firstSen(o, lang), rest = secs.filter(x => x !== s).map(x => x.paragraphs.join(" ")).join(" ") + " " + o.slice(f.length);
            // notes: docs/FORTUNE-AI-NOTES.md #B22
            let o2 = o;
            const short = () => lang === "th" && s.paragraphs.join(" ").length - (p0.length - o2.length) < 90;
            // notes: docs/FORTUNE-AI-NOTES.md #B23
            if (short() && ST.name && o !== p0) o2 = emptyCite(ST.name.replace(PAREN, "").trim(), "th") ? o : placeTh(o.replace(/\s+$/, ""), ST.name, items);
            // notes: docs/FORTUNE-AI-NOTES.md #B24
            if (lang !== "th" && GLOSS_LINE[lang].test(f) && ST.name && o !== p0) { const nmg = String(ST.name).replace(PAREN, "").trim(); s.paragraphs[0] = lang === "zh" ? nmg + "：" + o : D.cap(nmg) + ": " + o.replace(/^In\b/, "in"); }
            else if (!short() && !(lang !== "th" && f.length >= 10 && nearCopy(f, rest, lang)) && !(lang !== "th" && GLOSS_LINE[lang].test(f))) { s.paragraphs[0] = o2; if (o2 !== p0 && ST.name) cite(s, lang, ST.name, items); }
          }
        }
        if (s.id === "overview" && lang !== "th") overviewLeads(s, lang, names, items);
        orphans(s, lang, names);
        s.paragraphs = s.paragraphs.map(q => (lang === "th" ? framesTh(q, names, seen) : leadsOther(q, lang, names, seen)));
        // notes: docs/FORTUNE-AI-NOTES.md #B25
        if (lang !== "th" && s.id !== "overview") { alsoPlain(s, lang, names); glossFirst(s, lang); }
        if (lang !== "th") s.paragraphs = s.paragraphs.map(q => unstack(q, lang));
        if (lang === "th" && s.id !== "overview") {
          let seenTh = "";
          s.paragraphs = s.paragraphs.map(q => { const out = q.replace(/ตำรายัง(บอก|ชี้|อ่าน|มอง)(?:ด้วย)?(ว่า)?/g, (a, v, w, at) => (names.some(n => n.length >= 3 && (seenTh + q.slice(0, at)).indexOf(n) >= 0) ? a : "ตำรา" + v + (w || ""))); seenTh += " " + out; return out; });
        }
        closerLast(s, lang);
      }
      // notes: docs/FORTUNE-AI-NOTES.md #B26
      if (lang === "th") for (const s of secs || []) if (s.id !== "brief" && s.id !== "advice" && s.paragraphs[0]) s.paragraphs[0] = startTh(subjTh(s.paragraphs[0]), names);
      for (const s of secs || []) s.paragraphs = s.paragraphs.map(q => bracketsTidy(q, lang));
      // notes: docs/FORTUNE-AI-NOTES.md #B27
      (secs || []).forEach((s, i) => { if (lang === "th" && s.paragraphs.join(" ").length < 90 && before[i].join(" ").length >= 90) s.paragraphs = before[i]; });
      const fresh = D.nearDupPairs ? D.nearDupPairs(secs, lang).filter(x => !dup0.has(x.a + "|" + x.b)) : [];
      if (fresh.length) {
        const bad = new Set(fresh.flatMap(x => [x.a, x.b]));
        (secs || []).forEach((s, i) => {
          if (!s.paragraphs.some(p => [...bad].some(b => p.indexOf(b) >= 0))) return;
          s.paragraphs = before[i];
          // notes: docs/FORTUNE-AI-NOTES.md #B28
          if (s.id === "overview" && lang !== "th") overviewLeads(s, lang, names, items, secs.filter(x => x !== s).map(x => x.paragraphs.join(" ")).join(" "));
        });
      }
      return secs;
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B29
    const CONNECT_TH = "ที่สำคัญ|สำคัญคือ|ยิ่งไปกว่านั้น|เพิ่มเติม|ด้านหนึ่ง|นอกเหนือจากนี้|นอกจากนี้|พร้อมกันนั้น|อีกทั้ง|ถัดมา|ในทางกลับกัน|ขณะที่|อีกด้านหนึ่ง|ในอีกมุมหนึ่ง|ในขณะเดียวกัน|เช่นเดียวกัน|ในทำนองเดียวกัน|อีกความหมาย|ตำรายัง|ตำราบางสำนัก|ข้อแนะนำ|สิ่งที่ลงมือ|สิ่งที่ทำได้|ก้าวแรก|ถ้าเลือกทำ|วิธีปรับ|วิธีเสริม|เคล็ด|อีกข้อ|ในส่วนของ|ส่วน|ดูที่|ลอง|ถ้า|หาก|แต่";
    const itemOf = (items, name, lang) => (items || []).find(it => namesOf([it], lang).indexOf(name) >= 0) || null;
    // notes: docs/FORTUNE-AI-NOTES.md #B30
    function endTh(t, it, names) {
      const s = t.replace(/^คุณ(?:มี)?/, "");
      let best = -1;
      for (const k of Object.keys((it && it.meanings) || {})) for (const m0 of [].concat(it.meanings[k] || [])) {
        const m = String(m0).trim().replace(/^คุณ/, "");
        if (m.length < 14 || s.slice(0, 8) !== m.slice(0, 8)) continue;
        const tail = m.slice(-8), at = t.indexOf(tail, 8), e = at + tail.length;
        // the meaning's own end: near its length and at a word break (never inside a later line)
        if (at > 0 && e <= m.length + 24 && (e === t.length || /\s/.test(t[e])) && e > best) best = e;
      }
      if (best > 0) return best;
      const re = new RegExp("\\s(?=" + CONNECT_TH + (names.length ? "|(?:ตาม|ในมุมของ|จาก|สำหรับ|ด้วย)?(?:" + names.map(esc).join("|") + ")" : "") + ")", "g");
      let cut = t.length;
      for (const m of t.matchAll(re)) if (m.index >= 20) { cut = m.index; break; }
      // notes: docs/FORTUNE-AI-NOTES.md #B31
      const st = stemsTh(names);
      for (const m of t.matchAll(/\s(?=\S)/g)) {
        if (m.index < 20 || m.index >= cut) continue;
        const head = t.slice(m.index + 1, m.index + 1 + 24);
        if (st.some(x => head.indexOf(x) >= 0)) { cut = m.index; break; }
      }
      return cut;
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B32
    const KIND_TH = /^(?:ธาตุประจำตัว|ธาตุ|เจ้าชะตา|วันเกิด|เกิดวัน|ลัคนาราศี|ราศี|มือธาตุ|เลขชีวิต)/;
    const stemsTh = names => [...new Set(names.flatMap(n => [n, n.replace(KIND_TH, "").split(/[\s(（]/)[0]]))].filter(x => x.length >= 4);
    // round 6 (RECHECK-5 D4): a citation must name a finding, not a time, a topic or "this slip"
    const EMPTY_CITE = {
      th: /^(?:ปีนี้|เซียมซีใบนี้|\S{1,14}นี้|การงาน|การเงิน|ความรัก|ตัวตน)$/,
      en: /^(?:this |that |these |the (?:older|younger) person$|the success theme$|the winning dream$|(?:work|money|love)$)/i,
      zh: /^(?:今年|这|本|工作$|事业$|财运$|感情$|爱情$)/,
    };
    const emptyCite = (nm, lang) => EMPTY_CITE[lang].test(String(nm).trim());
    // notes: docs/FORTUNE-AI-NOTES.md #B33
    const GENERIC = /^(?:pair|slip|kua|card|line|star|house|area|year|month|element|planet|sign|hand|face|dream|คู่|ไพ่|เส้น|ดาว|ภพ|ภูมิ|数对|签|卦|命卦|星|宫)$/i;
    // notes: docs/FORTUNE-AI-NOTES.md #B44
    const OWN_SUBJ = { en: /^(?:By tradition,? )?(?:Your|The|A|An|This|That|Its|His|Her|Their|My|your|the|a|an|this|that) [a-z]/, zh: /^(?:你的|这|那)/ };
    const BACKREF = { th: /อีกความหมายหนึ่งคือ|ตำรายัง/, en: /\bAnother side of this\b/i, zh: /另一层意思是/ };
    const numbered = (n, lang) => (/\d/.test(n) && /[(（][^)）]+[)）]\s*$/.test(n) ? n.replace(/\s*[(（]([^)）]+)[)）]\s*$/, (a, x) => (lang === "zh" ? "，" : ", ") + x).trim() : n.replace(PAREN, "").trim());
    const caseOf = (name, items, lang) => (lang === "en" ? namesOf(items, lang).find(n => n.toLowerCase() === String(name).toLowerCase()) || String(name) : String(name));
    const REPORT_AFTER = /^\s*(?:ตามตำรา|ตามความเชื่อ|ว่ากันว่า|เชื่อกันว่า|หมายความว่า|บ่งบอกว่า|ชี้ว่า|สะท้อนว่า|แสดงว่า|สื่อว่า|ตีความ|อ่านได้ว่า|แปลได้ว่า|บอกว่า|หมายถึง)/;
    function placeTh(t, name, items) {
      const it = itemOf(items, name, "th"), vars = it ? namesOf([it], "th") : [String(name)], nm = String(name).replace(PAREN, "").trim();
      let end = endTh(t, it, namesOf(items, "th").filter(n => vars.indexOf(n) < 0));
      if (REPORT_AFTER.test(t.slice(end))) end = t.length;
      const tail = t.slice(end);
      return t.slice(0, end).replace(/\s+$/, "") + " (" + nm + ")" + (tail && !/^\s/.test(tail) ? " " : "") + tail;
    }
    let CITED = {};
    const names0 = (items, lang) => namesOf(items, lang).filter(n => !GENERIC.test(n));
    function cite(s, lang, name, items) {
      name = caseOf(name, items, lang);
      if (/^(?:this|that|the) (?:year|month|time|period)$/i.test(String(name).trim())) return;
      const nm = numbered(String(name), lang), it = itemOf(items, name, lang), lo = x => (lang === "en" ? String(x).toLowerCase() : String(x));
      if (nm.length < 2 || emptyCite(nm, lang) || emptyCite(String(name).replace(PAREN, "").trim(), lang)) return;
      const vars0 = (it ? namesOf([it], lang) : [String(name)]).filter(v => v.length >= 2 && !GENERIC.test(v.trim()));
      // "kua number" (the name without its number) would match "your kua number" in a glossary line
      const vars = vars0.filter(v => !vars0.some(w => w !== v && /\d/.test(w) && w.replace(/\s*[\d.,]+\s*%?$/, "").replace(PAREN, "").trim() === v.trim())), alt = vars.map(v => esc(lang === "en" ? v.toLowerCase() : v)).join("|");
      // the back-reference to what is about to be named
      s.paragraphs = s.paragraphs.map(q => (lang === "th" ? q.replace(new RegExp("อีกความหมายของ(?:" + alt + ")(?:\\s?[(（][^)）]*[)）])?คือ", "g"), "อีกความหมายหนึ่งคือ")
        : lang === "en" ? q.replace(new RegExp("\\bAnother side of (?:the |your )?(?:" + alt + ")(?:\\s?\\([^)]*\\))? is\\b", "gi"), "Another side of this is")
          : q.replace(new RegExp("(^|[。！？])(?:" + alt + ")(?:（[^）]*）)?的另一层意思是", "g"), "$1另一层意思是")));
      const p0 = s.paragraphs[0];
      if (lo(p0).indexOf("(" + lo(nm)) >= 0 || p0.indexOf("（" + nm) >= 0) return;
      let end;
      if (lang === "th") end = endTh(p0, it, namesOf(items, "th").filter(n => vars.indexOf(n) < 0));
      else { const m = (lang === "zh" ? /[。！？]/ : /[.!?](?=\s|$)/).exec(p0); end = m ? m.index : p0.length; }
      // notes: docs/FORTUNE-AI-NOTES.md #B34
      const all0 = lo(s.paragraphs.join(" "));
      if ((CITED[nm] || 0) >= 2 && names0(items, lang).some(n => vars.indexOf(n) < 0 && n.length >= 3 && all0.indexOf(lo(n)) >= 0) &&
        !s.paragraphs.some(q => BACKREF[lang].test(q) || (lang !== "th" && (q.split(/(?<=[.!?。！？])\s*/).some(x => ALSO_LINE[lang].test(x) || GLOSS_LINE[lang].test(x)))))) return;
      // named again (anywhere after the opened start) before any back-reference: the reader already sees it
      const after = lo(p0.slice(1) + " " + s.paragraphs.slice(1).join(" ")), br = after.search(BACKREF[lang]);
      const at = Math.min(...vars.map(v => { const i = after.indexOf(lo(v)); return i < 0 ? Infinity : i; }));
      if (at < Infinity && (br < 0 || at < br)) return;
      // notes: docs/FORTUNE-AI-NOTES.md #B35
      if (lang !== "th") {
        const rest = p0.slice(end + 1), pr = lang === "zh" ? /^\s*它/ : /^\s+It (?!would|could|may|might|can|helps?|pays|takes|is (?:time|worth))/;
        if (pr.test(rest) && !OWN_SUBJ[lang].test(p0)) { const it2 = lang === "zh" ? /[。！？]/.exec(rest) : /[.!?](?=\s|$)/.exec(rest); if (it2) end = end + 1 + it2.index; }
        else if (pr.test(rest)) { const nmx = lang === "en" ? D.cap(String(name).replace(PAREN, "").trim()) : String(name).replace(PAREN, "").trim(); s.paragraphs[0] = p0.slice(0, end + 1) + rest.replace(lang === "zh" ? /^(\s*)它/ : /^(\s+)It /, (a, sp) => sp + nmx + (lang === "zh" ? "" : " ")); return; }
      }
      // notes: docs/FORTUNE-AI-NOTES.md #B36
      if (lang === "th" && /^\s*(?:ตามตำรา|ตามความเชื่อ|ว่ากันว่า|เชื่อกันว่า|หมายความว่า|บ่งบอกว่า|ชี้ว่า|สะท้อนว่า|แสดงว่า|สื่อว่า|ตีความ|อ่านได้ว่า|แปลได้ว่า|บอกว่า|หมายถึง)/.test(p0.slice(end))) end = p0.length;
      const tail = p0.slice(end);
      s.paragraphs[0] = p0.slice(0, end).replace(/\s+$/, "") + (lang === "zh" ? "（" + nm + "）" : " (" + nm + ")") + (lang === "th" && tail && !/^\s/.test(tail) ? " " : "") + tail;
      CITED[nm] = (CITED[nm] || 0) + 1;
    }
    // round 6 (RECHECK-5 D3)
    const GLOSS_LINE = {
      en: /^(?:In (?:Thai number reading|Eight Mansions|Taksa|BaZi|Chinese face reading|palm reading|palmistry|the I Ching|Siam Si|astrology)\b|Siam Si is\b|A hexagram is\b|The five mountains are\b|The twelve palaces are\b|Face reading splits\b|Each Chinese year carries\b)/,
      zh: /^(?:在(?:泰式数字|八宅|塔克萨|八字|面相|手相|易经)[^，。]{0,8}(?:里|中)|求签是|面相把|十二宫是|五岳是|卦是)/,
    };
    const ALSO_LINE = { en: /^((?:The |Your )?[A-Z][^,.]{0,60}?) (?:also (shows?|says?|means?|suggests?|points? to)|(adds?)) that\b/, zh: /^([^，。：；！？]{1,24}?)(?:也提示|还说明|也说明)/ };
    function alsoPlain(s, lang, names) {
      const lo = x => (lang === "en" ? String(x).toLowerCase() : String(x)), nn = names.filter(n => n.length >= 2 && !GENERIC.test(n)).map(lo);
      let seen = "";
      s.paragraphs = s.paragraphs.map(q => (lang === "zh" ? q.split(/(?<=[。！？])/) : q.split(/(?<=[.!?])\s+/)).map(x => {
        let y = x;
        if (!nn.some(n => lo(seen).indexOf(n) >= 0)) {
          // nothing named before: "X also shows that…" → "X shows that…"; "X也提示，…" → "X提示，…"
          if (lang === "en") y = x.replace(ALSO_LINE.en, (a, sub, v, add) => sub + " " + (add ? (/s$/.test(add) ? "shows" : "show") : v) + " that");
          else y = x.replace(/^([^，。：；！？]{1,24}?)(?:也提示|还说明|也说明)/, (a, sub) => sub + (/提示/.test(a) ? "提示" : "说明"));
        }
        seen += " " + y;
        return y;
      }).join(lang === "zh" ? "" : " "));
    }
    const SYSTEMS_EN = "Taksa|BaZi|Eight Mansions|Thai number reading|Chinese face reading|palm reading|the I Ching|Siam Si";
    const SYSTEMS_ZH = "塔克萨|八字|八宅|面相|泰式数字|手相|易经";
    function unstack(q, lang) {
      if (lang === "en") return q
        .replace(new RegExp("(^|[.!?]\\s+)(?:Traditionally, |In traditional readings, )?((?:the |your |a )?[A-Za-z][^,.]{1,60}?)(?:,? (?:also |traditionally )?(?:is read to mean|means?|shows?|suggests?|adds?|indicates?|points? to|reflects?) that),? in (" + SYSTEMS_EN + ")\\b", "g"), (a, sp, x, sys) => sp + D.cap(x.trim()) + ": in " + sys)
        .replace(/(^|[.!?]\s+)(?:Turning to|When it comes to|As for|Looking at) this element's energy, ([a-z])/g, (a, sp, c) => sp + c.toUpperCase());
      return q
        .replace(new RegExp("(^|[。！？])(?:(?:再看|先看|说到|就|从)([^，。：；！？]{1,16}?)(?:而言|这边|来看)?|([^，。：；！？]{1,16}?)(?:而言|这边|来看|也提示|还说明|提示|显示|说明))，在(" + SYSTEMS_ZH + ")", "g"), (a, sp, x1, x2, sys) => { const x = x1 || x2; return /^(?:这股五行能量|这)$/.test(x) ? sp + "在" + sys : sp + x + "：在" + sys; })
        // notes: docs/FORTUNE-AI-NOTES.md #B45
        .replace(/^(\S{1,4}方面：)(?:先看|再看|说到)([^：，。]{1,12})：([^。！？]*)([。！？]?)/, "$1$3（$2）$4")
        .replace(/(^|[。！？])(?:这股五行能量这边|就这股五行能量而言|说到这股五行能量|从这股五行能量来看)，/g, "$1");
    }
    function glossFirst(s, lang) {
      const q = s.paragraphs[0] || "", f = (lang === "zh" ? q.split(/(?<=[。！？])/) : q.split(/(?<=[.!?])\s+/))[0] || "";
      if (!GLOSS_LINE[lang].test(f)) return;
      const m = lang === "zh" ? /（([^（）]{1,30})）。$/.exec(f) : /\s\(([^()]{2,80})\)\.$/.exec(f);
      if (!m) return;
      const body = f.slice(0, m.index) + (lang === "zh" ? "。" : ".");
      s.paragraphs[0] = (lang === "zh" ? m[1] + "：" + body : D.cap(m[1]) + ": " + body) + q.slice(f.length);
    }
    function orphans(s, lang, names) {
      const lo = x => (lang === "en" ? String(x).toLowerCase() : String(x)), alt = names.filter(n => n.length >= 2).map(n => esc(lang === "en" ? n.toLowerCase() : n)).join("|");
      if (!alt) return;
      const re = lang === "th" ? new RegExp("อีกความหมายของ(" + alt + ")(?:\\s?[(（][^)）]*[)）])?คือ\\s?", "g")
        : lang === "en" ? new RegExp("\\bAnother side of ((?:the |your )?(?:" + alt + ")(?:\\s?\\([^)]*\\))?) is that ", "gi")
          : new RegExp("(" + alt + ")((?:（[^）]*）)?)\\s?的另一层意思是，?", "g");
      let seen = "";
      s.paragraphs = s.paragraphs.map(q => {
        const out = q.replace(re, (all, x, x2, at) => {
          const nm = lang === "en" ? x.replace(/^(?:the |your )/i, "") : x;
          if (lo(seen + " " + q.slice(0, at)).indexOf(lo(nm)) >= 0) return all; // a second side of what the group already named
          if (lang === "th") return "ความหมายของ" + x + "คือ"; // notes: docs/FORTUNE-AI-NOTES.md #B37
          return "\u0001" + (lang === "zh" ? x + (x2 || "") : x.replace(/^(?:the |your )/i, m => m.toLowerCase())) + "\u0002";
        }).replace(lang === "zh" ? /\u0001([^\u0002]*)\u0002([^。！？]*)([。！？]?)/g : /\u0001([^\u0002]*)\u0002([^.!?]*(?:\([^)]*\)[^.!?]*)*)([.!?]?)/g, (all, x, body, end) => {
          const nm = x.replace(/\s?[(（][^)）]*[)）]$/, "").replace(/^(?:the |your )/i, ""), b = lang === "en" ? D.cap(body.trim()) : body;
          return lo(b).indexOf(lo(nm)) >= 0 || emptyCite(nm, lang) || emptyCite(x, lang) ? b + end : b + (lang === "zh" ? "（" + x + "）" : " (" + x + ")") + end;
        });
        seen += " " + out;
        return out;
      });
    }
    const OV_LEAD = { en: /^(?:Looking at|As for|With|Start with|Starting with|Turning to|Traditionally|In traditional readings)\b/, zh: /^(?:从|就|说到|先看|再看|至于|按|根据)/ };
    let OV_ITEMS = [];
    // notes: docs/FORTUNE-AI-NOTES.md #B38
    const dupOf = (r, safe, acc, lang) => !D.nearDupPairs ? nearCopy(r, safe + " " + acc.join(" "), lang) :
      D.nearDupPairs([{ id: "o", paragraphs: [safe] }, { id: "v", paragraphs: [acc.concat(r).join(lang === "zh" ? "" : " ")] }], lang).some(p => r.indexOf(String(p.a).trim()) >= 0 || r.indexOf(String(p.b).trim()) >= 0);
    function overviewLeads(s, lang, names, items, safe) {
      OV_ITEMS = items || [];
      const split = q => (lang === "zh" ? String(q).split(/(?<=[。！？])/) : String(q).split(/(?<=[.!?])\s+/)), acc = [];
      const pickSafe = x => { for (const c of [false, true]) { const r = conv(x, c); if (r === x) return x; if (!dupOf(r, safe, acc, lang)) { acc.push(r); return r; } } acc.push(x); return x; };
      OV_PROPER = namesOf(items || [], lang).filter(n => /^[A-Z]/.test(n));
      s.paragraphs = s.paragraphs.map(q => { HEDGE_PARA = q; return split(q).map(x => (safe != null ? pickSafe(x) : conv(x, false))).join(lang === "zh" ? "" : " "); }).map(q => {
        // notes: docs/FORTUNE-AI-NOTES.md #B39
        q = lang === "zh" ? q.replace(/(（[^（）]{2,40}）。)它(?=也|还)/g, "$1这") : q.replace(/(\s\([^()]{2,80}\)\.\s+)It also\b/g, "$1This also");
        const re = lang === "zh" ? /([^。！？]*)（([^（）]{2,40})）。(它[^。！？]*[。！？])/g : /([^.!?]*)\s\(([^()]{2,80})\)\.\s+(It (?!would|could|may|might|can|helps?|pays|takes|is (?:time|worth))[^.!?]*[.!?])/g;
        return q.replace(re, (a, pre, x, itS) => {
          // the line before has its own subject: "It" means that subject; the citation moves after the "It" line instead
          if (OWN_SUBJ[lang].test(pre.trim())) return lang === "zh" ? pre + "。" + itS.replace(/。$/, "（" + x + "）。") : pre + ". " + itS.replace(/([.!?])$/, " (" + x + ")$1");
          return lang === "zh" ? pre + "。" + x.replace(/，.*$/, "") + itS.slice(1) : pre + ". " + D.cap(x.replace(/, .*$/, "")) + " " + itS.slice(3);
        });
      });
      function conv(x, colon) {
        ST.name = "";
        // "按命盘，…" / "按泰国占星，…" (a system, not a finding): "命盘上，…"
        if (lang === "zh") { const a = /^按(?:照)?([^，。：]{2,8}?)(?:的看法|的说法)?，(?=\S)/.exec(x); if (a && !/传统/.test(a[1])) return a[1] + "上，" + x.slice(a[0].length); }
        let o = OPEN[lang](x, names);
        if (o === x || !ST.name) return x;
        // "Looking at your Sun in Cancer, with your Cancer Sun, you are…": the inner lead goes too
        if (lang === "en") { const w = /^With (?:your |the |a )?[^,]{3,40}, (?=[a-z])/.exec(o); if (w) o = D.cap(o.slice(w[0].length)); }
        const full = caseOf(String(ST.name).trim(), OV_ITEMS, lang), nm = numbered(full, lang);
        // round 6 (D2): "Looking at the One White star, it stands for…" → "The One White star stands for…"
        if (lang === "en" && /^It /.test(o)) return D.cap(full.replace(PAREN, "").trim()) + " " + o.slice(3).replace(/^is /, "is ");
        if (lang === "zh" && /^它/.test(o)) return full.replace(PAREN, "").trim() + o.slice(1);
        if (emptyCite(nm, lang) || emptyCite(full.replace(PAREN, "").trim(), lang)) return lang === "en" ? hedged(o, x) : o;
        // notes: docs/FORTUNE-AI-NOTES.md #B40
        const other = names.some(n => n.length >= 2 && (lang === "en" ? n.toLowerCase() : n) !== (lang === "en" ? full.toLowerCase() : full) && full.indexOf(n) < 0 && (lang === "en" ? o.toLowerCase() : o).indexOf(lang === "en" ? n.toLowerCase() : n) >= 0);
        if (/^(?:your verse|签诗|签文)/i.test(o) || OV_LEAD[lang].test(o) || other || colon) return lang === "zh" ? full + "：" + o : D.cap(full) + ": " + o.replace(/^(?:Your|Traditionally|In)\b/, w => w.toLowerCase());
        if ((lang === "en" ? o.toLowerCase() : o).indexOf(lang === "en" ? nm.toLowerCase() : nm) >= 0) return o;
        if (lang === "zh" && /^日主./.test(nm) && o.indexOf(nm.slice(2)) >= 0) return o; // "你的日主是庚金" already names 日主庚金
        const m = (lang === "zh" ? /[。！？]$/ : /[.!?]$/).exec(o), body = m ? o.slice(0, -1) : o;
        return (lang === "en" ? hedged(body, x) : body) + (lang === "zh" ? "（" + nm + "）" : " (" + nm + ")") + (m ? m[0] : "");
      }
    }
    // notes: docs/FORTUNE-AI-NOTES.md #B41
    const HEDGE_WORD = /\b(?:tradition(?:al|ally)?|belief|believed|folk|folklore|by custom)\b/i;
    const CALC = /\b(?:adding up|add up|digits?|reduc(?:e|ing)|calculat\w*|computed|counted from|sum of)\b/i;
    const PROPER_EN = /^(?:Thai|Chinese|Buddhist|Taksa|BaZi|I Ching|Siam|Lek|Sun|Moon|Mercury|Venus|Mars|Jupiter|Saturn|Rahu|Ketu|Pair|Slip|Kua|Eight Mansions|Period|Sheng Qi|Yan Nian|Tian Yi|Fu Wei|Day Master|Western|Tarot|I\b)/;
    let HEDGE_PARA = "";
    const hedged = (o, x) => {
      if (!/^(?:Traditionally|In traditional readings)\b/.test(x) || HEDGE_WORD.test(o) || HEDGE_WORD.test(HEDGE_PARA) || CALC.test(o.replace(/\([^)]*\)/g, ""))) return o;
      HEDGE_PARA += " By tradition";
      return "By tradition, " + (PROPER_EN.test(o) || OV_PROPER.some(n => o.startsWith(n)) ? o : o.replace(/^([A-Z])(?=[a-z]|\s)/, c => c.toLowerCase()));
    };
    let OV_PROPER = [];
    const PICK_ONE = /挑一条最适合你的|Pick the one suggestion/;
    const TIP_SEN = {
      en: new RegExp("^(?:Try|It would help|A good next step|This is a good time to|A simple adjustment|Set aside|Pick|Keep|Plan|Take|Make|Spend|Give|Write|" +
        "Ask|Talk|Rest|Start|Check|Save|Choose|Wear|Add|Place|Face|Turn|Put|Avoid|Leave|Note|Use)\\b"),
      zh: /建议|不妨|试着|可以先|可以|记得|调整的方法|先把|多留|留意|别急/,
    };
    function closeAfter(draw, s, lang) {
      const parts = s.flatMap(x => (lang === "zh" ? String(x).split(/(?<=[。！？])/) : String(x).split(/(?<=[.!?])\s+/)));
      const tips = parts.filter(x => TIP_SEN[lang].test(x.trim())).length;
      for (let k = 0; k < 6; k++) { const c = draw(); if (!PICK_ONE.test(c) || tips >= 2) return c; }
      return lang === "zh" ? "把这次解读当作参考，最后还是按自己的判断来决定" : "These are tendencies in traditional teachings, and what you actually do matters more";
    }
    return { repeatsUsed, briefMore, closeAfter, polish, briefPolish };
  }
  // notes: docs/FORTUNE-AI-NOTES.md #B42
  if (typeof module !== "undefined" && module.exports && !Object.keys(module.exports).length) module.exports = make;
  root.LQFortuneBrief = make;
})(typeof window !== "undefined" ? window : globalThis);
/* END fortune-brief.js */
/* BEGIN lensiq-crisis-takeover.js (copied by tools/fortune-read-embed.mjs; edit lensiq-crisis-takeover.js, then run it) */
/* lensiq-crisis-takeover.js — crisis-net hotfix 2026-11-16 (docs/INCIDENT-2026-11-16-CRISIS-LEAK.md). Loaded right after
 * fortune-crisis.js on every fortune page with an input or a result (not the fortune.html hub: no input, no result). Uses
 * window.LQFortuneCrisis at call time. Exposes window.LQCrisisTakeover(cardOrContainer); FortuneAI.crisis.render calls it.
 * Fixed tests (locked before this file was written): tests/e2e/crisis-net-hotfix-{a,b,c,d}.e2e.mjs, tests/unit/crisis-input-inventory.test.js. */
(function (root) {
  "use strict";
  if (!root.document) return;
  /** @returns {any} */
  const CR = () => /** @type {any} */ (root).LQFortuneCrisis || {};
  const FREE_TEXT = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="tel"]';
  // round 2: fortune-crisis.js may fail to load: then the crisis state is the <html> flag, the net is FortuneAI's own patterns
  // (fortune-ai.js) and the page fields are read here, so the early net still shows the card
  const FAC = () => (/** @type {any} */ (root).FortuneAI || {}).crisis || {};
  const ATTR = "data-lq-crisis";
  const active = (/** @type {any} */ d) => !!(CR().active ? CR().active(d) : d && d.documentElement.getAttribute(ATTR) === "1");
  const setActive = (/** @type {any} */ d) => { if (CR().setActive) CR().setActive(d); else d.documentElement.setAttribute(ATTR, "1"); };
  const check = (/** @type {any} */ t) => !!(CR().check ? CR().check(t) : FAC().check && FAC().check(t));
  const fields = (/** @type {any} */ d) => (CR().fields ? CR().fields(d) : Array.from(d.querySelectorAll(FREE_TEXT)).map((/** @type {any} */ e) => e.value).filter(Boolean).join("\n"));
  const helpLine = (/** @type {any} */ d, /** @type {string} */ l) => CR().helpLine(d, l);
  /* ---------------- crisis-net hotfix 2026-11-16 (owner order a + b; docs/INCIDENT-2026-11-16-CRISIS-LEAK.md) ----------------
     (a) takeover(card): when the support card is shown, NOTHING from the result area stays visible: every result root of the
     page (an element with data-lq-result or an id ending in "Result" or "Stats") is swept: the branch that holds the card stays, every
     other element is marked data-lq-crisis-hide (hidden by html[data-lq-crisis] [data-lq-crisis-hide], so page code that sets
     .hidden = false later cannot bring it back): reading text, score rings, letter strips, face / palm maps, charts, share /
     print buttons, prices. Kept: the card, the help lines, forms and the boxes the visitor types into. Then the screen
     scrolls to the card (below the sticky top bar). Roots that never held the card are swept the same way.
     (b) the crisis check runs BEFORE any format or validation check: a capture-phase "submit" listener on the window runs
     before every form's own handler; with a crisis signal in any free-text field of the page (or the page already in the
     crisis state) it stops the page's handler and shows the card in the form's slot (data-lq-crisis-slot="<selector>", else
     a .lq-crisis-slot right after the form, outside any remedy / paid block). Boxes that reformat while typing (type=tel,
     type=search, data-lq-crisis-live) are checked on "input" before the page's formatter. Forms whose page handler already
     runs the net first on every field and draws the card in its own place carry data-lq-crisis-own and are left to it.
     Shared helper for pages on other branches: window.LQCrisisTakeover(cardOrContainer) (see the incident record). */
  const HIDE = "data-lq-crisis-hide";
  // round 2: the "report a problem with this reading" button (lensiq-report.js) goes too
  const TAKEOVER_CSS = "html[data-lq-crisis] [" + HIDE + "],html[data-lq-crisis] .lq-rp-wrap{display:none!important}";
  // the page's reading counters ("1 today") go too: they change with the reading just made
  const ROOTS = '[data-lq-result], [id$="Result"], [id$="Stats"]';
  const KEEP = ".fa-support, .fa-soft, .lq-helpline, #lqHelpTop, .lq-crisis-slot, form, script, style, template";
  const FIELD = FREE_TEXT + ", select";
  /** hide every child of el that does not hold the card, a form or a field (recursing into the ones that do)
   *  @param {any} el @param {any} card */
  function sweep(el, card) {
    for (const c of Array.from(el.children || [])) {
      if (card && (c === card || c.contains(card))) { c.removeAttribute(HIDE); if (c !== card) sweep(c, card); continue; }
      if (c.matches(KEEP)) continue;
      if (c.matches(FIELD) || c.querySelector(FIELD) || c.querySelector(".fa-support, .lq-crisis-slot")) { sweep(c, card); continue; }
      c.setAttribute(HIDE, "");
    }
  }
  /** scroll so the card's heading is the first thing below the sticky top bar @param {any} card */
  function toCard(card) {
    const d = card.ownerDocument, w = d && d.defaultView;
    if (!w) return;
    const go = () => {
      try {
        if (!card.isConnected) return;
        const h = card.querySelector("h3") || card, nav = d.querySelector(".nav");
        const navB = nav ? Math.max(0, nav.getBoundingClientRect().bottom) : 0, b = h.getBoundingClientRect();
        if (b.top < navB + 4 || b.bottom > w.innerHeight - 8) w.scrollTo(0, Math.max(0, w.scrollY + b.top - navB - 12));
      } catch (e) { /* no layout */ }
    };
    go();
    try { w.requestAnimationFrame(go); w.setTimeout(go, 450); w.setTimeout(go, 1100); } catch (e) { /* no timers */ }
  }
  /** (a) the card replaces every result area of the page; the screen scrolls to it @param {any} target the card or its container */
  function takeover(target) {
    try {
      const d = target && target.ownerDocument;
      if (!d || !d.querySelectorAll) return;
      const card = target.matches && target.matches(".fa-support") ? target : (target.querySelector && target.querySelector(".fa-support")) || target;
      if (!active(d)) setActive(d);
      if (!d.getElementById("lq-takeover-style") && d.head) { const st = d.createElement("style"); st.id = "lq-takeover-style"; st.textContent = TAKEOVER_CSS; d.head.appendChild(st); }
      for (let a = card; a && a !== d.body; a = a.parentElement) { a.removeAttribute(HIDE); if (a.hidden) a.hidden = false; }
      const roots = Array.from(d.querySelectorAll(ROOTS)).filter(r => !Array.from(d.querySelectorAll(ROOTS)).some(o => o !== r && o.contains(r)));
      for (const r of roots) {
        if (r.contains(card)) sweep(r, card);
        else if (r.matches(KEEP) || r.querySelector(FIELD)) sweep(r, null);
        else r.setAttribute(HIDE, "");
      }
      toCard(card);
    } catch (e) { /* never break the card */ }
  }
  /** the card container for a form or field: data-lq-crisis-slot, else a slot after the form (outside remedy / paid blocks) @param {any} el */
  function slotFor(el) {
    const d = el.ownerDocument, form = el.closest ? el.closest("form") || el : el;
    const sel = form.getAttribute && form.getAttribute("data-lq-crisis-slot"), named = sel ? d.querySelector(sel) : null;
    if (named) return named;
    const after = (form.closest && form.closest("[data-lq-remedy], [data-lq-upsell]")) || form;
    let slot = after.nextElementSibling;
    if (!(slot && slot.classList.contains("lq-crisis-slot"))) { slot = d.createElement("div"); slot.className = "lq-crisis-slot"; slot.tabIndex = -1; after.insertAdjacentElement("afterend", slot); }
    return slot;
  }
  /** show the support card in slot (FortuneAI draws it; renderSupport calls takeover) @param {any} slot */
  function cardIn(slot) {
    const FA = /** @type {any} */ (root).FortuneAI, d = slot.ownerDocument;
    for (let a = slot; a && a !== d.body; a = a.parentElement) { a.removeAttribute(HIDE); if (a.hidden) a.hidden = false; }
    const lang = (root.LQI18N && root.LQI18N.lang) || "th";
    if (FA && FA.crisis && FA.crisis.render) FA.crisis.render(slot, FA.crisis.result({ lang: lang === "en" || lang === "zh" ? lang : "th" }));
    else { setActive(d); slot.textContent = ""; slot.appendChild(helpLine(d, lang)); }
    takeover(slot);
    try { slot.focus({ preventScroll: true }); } catch (e) { /* no focus */ }
  }
  /** (b) the crisis net first: true when it stopped the event and showed the card @param {any} el form or field @param {string} [text] */
  function first(el, text) {
    try {
      const d = el && el.ownerDocument;
      if (!d) return false;
      if (!(active(d) || check(text != null ? text : fields(d)))) return false;
      cardIn(slotFor(el));
      return true;
    } catch (e) { return false; }
  }
  const LIVE = 'input[type="search"], input[type="tel"], [data-lq-crisis-live]';
  // .lq-merit: lensiq-merit.js checks its interest form itself and draws the card in its panel (tests/e2e/merit-crisis.e2e.mjs)
  const own = (/** @type {any} */ el) => !!(el && el.closest && el.closest("[data-lq-crisis-own], .lq-merit"));
  try {
    if (root.document && typeof root.addEventListener === "function") {
      root.addEventListener("submit", e => {
        const f = /** @type {any} */ (e.target);
        if (!f || !f.matches || !f.matches("form") || own(f)) return;
        if (first(f)) { e.preventDefault(); e.stopImmediatePropagation(); }
      }, true);
      root.addEventListener("input", e => {
        const t = /** @type {any} */ (e.target);
        if (!t || !t.matches || !t.matches(LIVE) || own(t)) return;
        if (check(t.value) && first(t, t.value)) e.stopImmediatePropagation(); // before the page's formatter strips the text
      }, true);
    }
  } catch (e) { /* no DOM */ }

  // round 2: after a language switch or a resize the card is brought back to the first screen
  const back = () => { try { const c = root.document.querySelector(".fa-support"); if (c && active(root.document)) root.setTimeout(() => toCard(c), 300); } catch (e) { /* no DOM */ } };
  try { root.addEventListener("lq-lang", back); root.addEventListener("resize", back); } catch (e) { /* no events */ }
  /** @type {any} */ (root).LQCrisisTakeover = takeover;
  /** @type {any} */ (root).LQCrisisFirst = first;
})(typeof window !== "undefined" ? window : globalThis);
/* END lensiq-crisis-takeover.js */
