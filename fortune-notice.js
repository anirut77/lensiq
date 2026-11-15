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
  const TH_CONT_NEXT = /^(?:และ|หรือ|แต่|ซึ่ง|ที่|ๆ|เพื่อ|จึง|ก็|แล้ว|ไม่|ได้|ให้|กับ|ของ|ใน(?!ฐานะ)|คือ|ว่า|เป็น|มาก|ด้วย|อยู่|ไว้|กัน|ไป|มา|เช่น|ได้แก่|เสริมด้วย|[\d(/–\-)])/;
  // "จาก…" after a space opens a new clause ("…ไม่ชอบเล่นเกมหัวใจ ‖ จากธาตุน้ำ คุณ…") unless a verb before it takes it ("ออกมา จาก…")
  // round 2: a reporting verb right after a name continues that sentence ("อัศวินไม้เท้า (Knight of Wands) ‖ สื่อว่า…")
  const TH_REPORT_NEXT = /^(?:สื่อว่า|สื่อถึง|บ่งบอก|ชี้ว่า|สะท้อน|แสดงว่า|หมายความว่า|หมายถึง|ตีความ|ตำราอ่าน|อ่านได้ว่า|แปลได้ว่า|ตามตำราอ่าน|ตามความเชื่อหมายถึง|ตำราให้ความหมาย|ซึ่งหมายความ|เน้นเรื่อง|ชวนให้|แนะให้|เป็นสัญญาณ|เตือนเบา)/;
  const TH_FROM = /^จาก/, TH_FROM_VERB = /(?:มา|ได้|ออก|ห่าง|พ้น|แยก|หลุด|กลับ|รับ|ไกล)$/;
  const TH_CONT_PREV = /(?:คือ|ว่า|และ|หรือ|ของ|ใน|กับ|จาก|ที่|ซึ่ง|เพื่อ|เช่น|ได้แก่|อย่าง|แบบ|โดย|ตาม|ทั้ง|ๆ|[(/–\-])$/;
  // quality round 2026-11-16 (R3): never between a number and its unit, inside a list ("อำนาจ ‖ บารมี และ…"), or right after a
  // lead that still needs its clause ("จากราศีอาทิตย์ ‖", "เรื่องการงาน ‖")
  const TH_UNIT = /^(?:ปี|เท่า|%|องศา|คน|วัน|เดือน|ครั้ง|ข้อ|ชั่วโมง|นาที|บาท|ใบ|ตัว|ดวง|ฐาน|ภพ|ช่วง|สัปดาห์|ขวบ)/;
  const TH_LIST_NEXT = /^\S{1,14} (?:\S{1,14} )?(?:และ|หรือ)\S/, TH_LEAD_PREV = /(?:^|\s)(?:สำหรับ|จาก|ดูที่|ส่วน|เรื่อง|ด้าน|ในฐานะ|ในส่วนของ|ตาม|เมื่อดูที่)\S*(?:\s+[一-鿿\d]+)?(?:\s*[(（][^)）]*[)）])?$/;
  // round 2: never right after a transition word ("…ที่สำคัญ ‖") or inside brackets ("(Six of ‖")
  const TH_TRANS_PREV = /(?:^|\s)(?:ที่สำคัญ|เช่นเดียวกัน|พร้อมกันนั้น|ในขณะเดียวกัน|ถ้ามีเวลา|นอกจากนี้|ในอีกมุมหนึ่ง|อีกด้านหนึ่ง|ถัดมา|อีกทั้ง|ในทำนองเดียวกัน|ที่น่าสังเกตคือ|อีกเรื่องหนึ่งคือ|ต่อจากนั้น|ยิ่งไปกว่านั้น|ขณะเดียวกัน)$/;
  const openBracket = (/** @type {string} */ a) => (a.match(/[(（]/g) || []).length > (a.match(/[)）]/g) || []).length;
  function cutsTh(p) {
    const out = [];
    for (let i = p.indexOf(" "); i >= 0; i = p.indexOf(" ", i + 1)) {
      if (p[i + 1] === " " || p[i - 1] === " ") continue;
      const a = p.slice(0, i), b = p.slice(i + 1);
      // soft: none of the hard breaks (after ๆ, number|unit, inside a list, after a lead + noun); ok: soft and a clean clause boundary
      const soft = !/ๆ$/.test(a) && !(/\d$/.test(a) && TH_UNIT.test(b)) && !(TH_LIST_NEXT.test(b) && !/[.!?)]$/.test(a)) && !TH_LEAD_PREV.test(a) && !/^(?:เช่น|ได้แก่|เสริมด้วย|และ|หรือ)/.test(b) && !TH_TRANS_PREV.test(a) && !openBracket(a);
      out.push({ at: i, soft, ok: soft && !TH_CONT_NEXT.test(b) && !TH_CONT_PREV.test(a) && !(TH_FROM.test(b) && TH_FROM_VERB.test(a)) && !TH_REPORT_NEXT.test(b) && !/^[(（]/.test(b) });
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
