/* fortune-notice.js: fortune notices. docs/FORTUNE-LAYOUT.md (keep this file small: speed budget) */
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
    } catch (e) { }
  }
  const pageLang = () => { try { return langOf(root.LQI18N && root.LQI18N.lang); } catch (e) { return "th"; } };
  const never = el => !!(el && el.closest && el.closest(NEVER_COLLAPSE.join(",")));
  function moreButton(doc, lang, ids, onToggle) {
    const b = doc.createElement("button");
    b.type = "button"; b.className = "chip lq-more"; b.textContent = MORE[lang];
    b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", ids.join(" ")); b.setAttribute("data-lq-lang", lang);
    const toggle = () => {
      const open = b.getAttribute("aria-expanded") !== "true", L = b.getAttribute("data-lq-lang") || lang;
      b.setAttribute("aria-expanded", open ? "true" : "false"); b.textContent = open ? LESS[L] : MORE[L];
      onToggle(open);
    };
    b.addEventListener("click", toggle);
    b.addEventListener("keydown", e => { if (e.key === "Enter" && !e.repeat) { e.preventDefault(); toggle(); } });
    return b;
  }
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
    const doc = root.document, run = () => { try { notices(doc); } catch (e) { } };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", run); else run();
    root.addEventListener("lq-lang", run);
  }

  const api = { LINE, MORE, LESS, SEP, NOTE_MAX, NEVER_COLLAPSE, langOf, cutsTh, cutsEn, noticeSplit, pageLang, never, moreButton, noticeify, notices,
    ensureStyle };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LQNotice = api;
})(typeof window !== "undefined" ? window : globalThis);
/* BEGIN fortune-share loader */
/* docs/FORTUNE-SHARE-PRINT.md */
(function (w) {
  "use strict";
  const d = w.document;
  if (!d || w.LQShareLoader) return;
  const R = "#frResult,#plResult,#hsResult,#trResult,#ssResult,#icResult,#lcResult,#nmResult,#fsReading,#drResult,#zdResult,#asResult,#rpOut";
  let done = 0;
  const go = () => {
    if (done || w.LQShare || !d.querySelector(R + ",#recBox,.ft-hero")) return;
    done = 1; const s = d.createElement("script"); s.src = "fortune-share.js?v=4"; s.async = true; d.head.appendChild(s);
  };
  for (const e of ["pointerdown", "touchstart", "keydown", "scroll", "focusin"]) w.addEventListener(e, go, { capture: true, passive: true, once: true });
  const sh = n => n.nodeType === 1 && (n.matches(".fa-section,.rp-part") || !!n.querySelector(".fa-section,.rp-part") || (n.matches(R) && !n.hidden));
  const watch = () => {
    try {
      const mo = new MutationObserver(ms => { for (const m of ms) if ((m.type === "attributes" && sh(m.target)) || [...m.addedNodes].some(sh)) { mo.disconnect(); go(); return; } });
      mo.observe(d.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    } catch (e) { }
  };
  if (d.readyState === "complete") watch(); else w.addEventListener("load", watch, { once: true });
  if (!w.LQShareArt) { const q = []; w.LQShareArt = (x, f) => { q.push([x, f]); }; w.LQShareArt.q = q; }
  w.LQShareLoader = { load: go };
})(typeof window !== "undefined" ? window : globalThis);
/* END fortune-share loader */
