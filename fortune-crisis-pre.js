/* fortune-crisis-pre.js — decision 84 option ข (crisis v3, 2026-11-17). Off unless window.LENSIQ_CRISIS_PRELINE is true
 * (lensiq-config.js ships false = option ก: the closing line at the end only). With the switch on, when the page's typed text
 * is an EXPLICIT PLAN (narrow listed set below, TH / EN / ZH), ONE short warm line with the single tel:1323 button is put
 * BEFORE the reading, in the same result area as the closing line; the reading still continues and nothing says "flagged".
 * Nothing typed is shown or stored. Copied into fortune-read.js by tools/fortune-read-embed.mjs (the reading pages); in Node
 * fortune-crisis.js adds plan / preHTML to its own exports. Tests: tests/unit/crisis-v3-pre.test.js,
 * tests/e2e/crisis-v3-pre{,-en,-zh}.e2e.mjs (locked before this file was written). */
(function (root) {
  "use strict";
  const TONE = /[็-์]/g;
  const TC = typeof module !== "undefined" && module.exports && typeof require === "function" ? require("./lensiq-thai-canon.js") : null;
  /** @param {any} s @returns {string} */
  const canon = s => { const C = TC || /** @type {any} */ (root).LQThaiCanon; return C ? C.canon(s) : String(s == null ? "" : s).normalize("NFC"); };
  /** @type {Record<string, string>} */
  const T2S = { 殺: "杀", 結: "结", 計: "计", 劃: "划", 備: "备", 會: "会", 準: "准", 東: "东", 經: "经", 決: "决" };
  const T2S_RE = new RegExp("[" + Object.keys(T2S).join("") + "]", "g");
  // Thai: matched without spaces and tone marks
  const PLAN_TH = new RegExp(("(?:คืนนี้|พรุ่งนี้|วันนี้)(?:ก็)?(?:จะ|ขอ)(?:จบชีวิต|ฆ่าตัวตาย)|จะ(?:ฆ่าตัวตาย|จบชีวิต(?:ตัวเอง)?)(?:คืนนี้|พรุ่งนี้|วันนี้)|" +
    "(?:วางแผน|ตั้งใจ)(?:ว่า)?(?:จะ)?(?:ฆ่าตัวตาย|จบชีวิต)").replace(TONE, ""));
  const SELF = "(?:kill myself|end my (?:own )?life|take my (?:own )?life)", WHEN = "(?:tonight|today|tomorrow)";
  const PLAN_EN = [
    new RegExp("\\b(?:planning|going|gonna|about) to " + SELF + "\\b"),
    new RegExp("\\b(?:planning|going|gonna|about) to end it(?: all)? " + WHEN + "\\b"),
    new RegExp("\\bi(?: will|'ll) (?:kill myself|end my (?:own )?life|end it(?: all)?) " + WHEN + "\\b"),
    new RegExp("\\b" + WHEN + ",? i(?: will|'ll| am going to|'m going to| am gonna|'m gonna) (?:kill myself|end my (?:own )?life|end it(?: all)?)\\b"),
    new RegExp("\\bi (?:have|made|'ve got|have got) a plan to " + SELF + "\\b"),
  ];
  const PLAN_ZH = /(?:今晚|今天|明天)我?(?:就|要|会)?(?:结束(?:自己的)?生命|自杀|去死)|(?:计划|打算|准备)好?了?要?(?:自杀|结束(?:自己的)?生命)/;
  /** true only for an explicit plan @param {any} text */
  function plan(text) {
    if (typeof text !== "string" || !text.trim()) return false;
    const t = canon(text), en = t.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ");
    const zh = t.replace(T2S_RE, c => T2S[c]).replace(/\s+/g, "");
    return PLAN_TH.test(t.replace(/\s+/g, "").replace(TONE, "")) || PLAN_EN.some(re => re.test(en)) || PLAN_ZH.test(zh);
  }
  /** the warm line (one short line; no statistics, nothing about the person's text) */
  const WARM = {
    th: "ถ้าตอนนี้รู้สึกหนักเกินไป คุยกับใครสักคนก่อนได้นะ มีคนพร้อมรับฟังเสมอ",
    en: "If things feel too heavy right now, you can talk to someone first. Someone is ready to listen.",
    zh: "如果此刻觉得太沉重，可以先找人聊聊，有人愿意倾听。",
  };
  const GO = { th: "โทร 1323", en: "Call 1323", zh: "拨打 1323" };
  const LABEL = { th: "อยากมีคนรับฟัง โทร 1323", en: "Want someone to listen? Call 1323", zh: "想找人倾听？拨打 1323" };
  const langOf = (/** @type {any} */ l) => (l === "en" || l === "zh" ? l : "th");
  const kit = () => /** @type {any} */ (root).LQHelpline || null;
  /** the pre-line as HTML @param {string} [lang] */
  function preHTML(lang) {
    const l = langOf(lang), K = kit();
    return '<aside class="lq-crisis-pre" role="note" aria-label="' + LABEL[l] + '"><p class="lq-crisis-pre-warm">' + WARM[l] + "</p>" +
      '<span class="lq-call-mini" data-lq-call="1323"><a class="lq-call-btn" href="tel:1323" aria-label="' + LABEL[l] + '">' + (K ? K.ICON : "") +
      '<b class="lq-call-mini-n">' + GO[l] + "</b></a></span></aside>";
  }
  const api = { plan, preHTML, WARM };
  // exports only from its own file: the copy inside fortune-read.js leaves that module's exports alone
  if (typeof module !== "undefined" && module.exports && !Object.keys(module.exports).length) module.exports = api;
  /** @type {any} */ (root).LQCrisisPre = api;
  const d = root.document;
  if (!d || typeof root.MutationObserver !== "function") return;

  const CSS = ".lq-crisis-pre{margin:0 0 14px;padding:12px 14px;border-radius:12px;background:#eef5fb;border:1px solid #cfe1f0}" +
    ".lq-crisis-pre-warm{margin:0 0 8px}";
  const on = () => /** @type {any} */ (root).LENSIQ_CRISIS_PRELINE === true;
  const FREE = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="tel"]';
  const typedPlan = () => { try { return Array.from(d.querySelectorAll(FREE)).some(e => plan(/** @type {any} */ (e).value)); } catch (e) { return false; } };
  const pageLang = () => { const I = /** @type {any} */ (root).LQI18N, h = d.documentElement.lang || ""; return langOf((I && I.lang) || (/^zh/.test(h) ? "zh" : h.slice(0, 2))); };
  /** put the one pre-line at the top of the result area that holds the closing line (or take it away) */
  function place() {
    try {
      const close = d.querySelector(".lq-helpline-result"), old = Array.from(d.querySelectorAll(".lq-crisis-pre"));
      const want = on() && !!close && d.documentElement.getAttribute("data-lq-crisis") === "1" && typedPlan();
      const area = close && (close.closest('[data-lq-result], [id$="Result"], #rpOut') || close.parentElement);
      if (!want || !area) { old.forEach(e => e.remove()); return; }
      if (old.length === 1 && area.firstElementChild === old[0]) return;
      old.forEach(e => e.remove());
      if (!d.getElementById("lq-crisis-pre-style") && d.head) { const st = d.createElement("style"); st.id = "lq-crisis-pre-style"; st.textContent = CSS; d.head.appendChild(st); }
      const tpl = d.createElement("template"); tpl.innerHTML = preHTML(pageLang());
      area.insertBefore(tpl.content.firstChild, area.firstChild);
    } catch (e) { /* never break the reading */ }
  }
  let queued = false;
  const later = () => { if (queued) return; queued = true; root.setTimeout(() => { queued = false; place(); }, 0); };
  try {
    new root.MutationObserver(recs => {
      for (const r of recs) for (const n of Array.from(r.addedNodes).concat(Array.from(r.removedNodes))) {
        const e = /** @type {any} */ (n);
        if (e && e.nodeType === 1 && (e.matches(".lq-helpline-result") || (e.querySelector && e.querySelector(".lq-helpline-result")))) { later(); return; }
      }
    }).observe(d.documentElement, { childList: true, subtree: true });
  } catch (e) { /* no observer */ }
})(typeof window !== "undefined" ? window : globalThis);
