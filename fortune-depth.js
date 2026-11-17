/* fortune-depth.js — the depth layer behind "อ่านเพิ่มเติม" (owner order 2026-11-17 item 3: the expanded part must be clearly
   longer and deeper than the summary and add new substance from the tradition's own material, never a few extra words).
   Generic engine only; the material is data in each discipline's knowledge files:
     LQ_DEPTH.build[domain](facts)  -> [{ sec, key, vars?, caution? }] in reading order (registered by the Thai kb file)
     LQ_DEPTH.text[lang][domain]    -> { key: text | [text] | { t, c } | fn(vars), _title?: section title, _name?: fn(id) }
   A text marked { c: true } (or an entry with caution: true) restrains or warns: compose() marks its paragraph caution, so the
   layout never folds it (owner rule). Entries are added only while the whole reading stays within its language's length
   cap (the composer's own cap, unchanged), never in a calm / crisis reading, and never twice. {X} in a text is filled from
   entry.vars; a var "@key" is that key's text, "#id" is the table's _name(id).
   Copied into fortune-read.js by tools/fortune-read-embed.mjs (no extra request on the reading pages). */
(function (root) {
  "use strict";
  const G = /** @type {any} */ (typeof globalThis !== "undefined" ? globalThis : root);
  // the composer's whole-reading caps (FULL_MAX th 3000, EN_FULL_MAX 3800, ZH_FULL_MAX 1500, read-more included): it trims
  // below them to leave room for its own glossary notes; the depth layer runs after those, so it fills up to the cap itself
  const CAP = { th: 2995, en: 3795, zh: 1495 };
  // the composer's shown-part range (MAIN_MIN / MAX, EN_MAIN, ZH_MAIN)
  const MAIN = { th: { min: 1500, max: 2500 }, en: { min: 1300, max: 2400 }, zh: { min: 520, max: 1000 } };
  const DEF_T = { th: "อ่านลึกตามตำรา", en: "In more depth", zh: "深入解读" };
  const reg = () => (G.LQ_DEPTH = G.LQ_DEPTH || { build: {}, text: { th: {}, en: {}, zh: {} } });
  const pick = (/** @type {any} */ v, /** @type {number} */ k) => (Array.isArray(v) ? v[(k >>> 0) % v.length] : v);
  /** text of one key: { t, c } with t filled, or null */
  function resolve(/** @type {any} */ T, /** @type {string} */ key, /** @type {any} */ vars, /** @type {string} */ lang) {
    vars = vars || {};
    let v = pick(T[key], vars.k || 0);
    if (typeof v === "function") v = v(vars, T);
    if (v == null || v === "") return null;
    const o = typeof v === "object" ? v : { t: v, c: false };
    let bad = false;
    const t = String(o.t).replace(/\{(\w+)\}/g, (m, k) => {
      const x = vars[k];
      if (x == null) { bad = true; return ""; }
      const s = String(x);
      if (s[0] === "@") { const r = resolve(T, s.slice(1), vars, lang); if (!r) bad = true; return r ? r.t : ""; }
      if (s[0] === "#") { const n = typeof T._name === "function" ? T._name(s.slice(1)) : null; if (!n) bad = true; return n || ""; }
      return s;
    }).replace(/\s{2,}/g, " ").trim();
    // English: a filled name ("the Nine of Cups") may open a sentence
    const t2 = lang === "en" ? t.replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase()) : t;
    return bad || !t2 ? null : { t: t2, c: !!o.c };
  }
  /** sentences long enough to count as a repeat (the composer's dup-sentence lint: zh >= 8 chars, else >= 20) */
  const unitsOf = (/** @type {string} */ t, /** @type {string} */ L) => (L === "zh" ? t.split(/(?<=[。！？])/) : L === "en" ? t.split(/(?<=[.!?])\s+/) : t.split(/\s+/))
    .map(x => x.trim()).filter(x => x.length >= (L === "zh" ? 8 : 20));
  /** append the discipline's depth entries to a composed reading; returns the caution texts (for compose's caution marks) */
  function apply(/** @type {any} */ out, /** @type {any} */ facts, /** @type {string} */ lang, /** @type {any} */ opts) {
    opts = opts || {};
    if (!out || out.source !== "local" || !facts || opts.calm || !Array.isArray(out.sections)) return [];
    const L = lang === "en" || lang === "zh" ? lang : "th", R = reg(), b = R.build[facts.domain], T = R.text[L] && R.text[L][facts.domain];
    if (typeof b !== "function" || !T) return [];
    let entries;
    try { entries = b(facts) || []; } catch (e) { return []; }
    const S = out.sections, cau = [], sep = L === "zh" ? 0 : 1, added = [];
    let len = S.reduce((n, s) => n + (s.paragraphs || []).reduce((m, p) => m + String(p).length + 1, 0), 0);
    const has = (/** @type {string} */ t) => S.some(s => (s.paragraphs || []).some(p => String(p).indexOf(t) >= 0));
    // opts.dup(sections) = the composer's near-duplicate count (cross-section, > 0.65): a depth text that adds one is not used
    let dups = opts.dup ? opts.dup(S) : 0;
    for (const e of entries) {
      const r = resolve(T, e.key, e.vars, L);
      if (!r || has(r.t) || unitsOf(r.t, L).some(has) || (opts.ok && !opts.ok(r.t)) || len + r.t.length + sep + 1 > CAP[L]) continue;
      let s = S.find(x => x.id === e.sec), made = false;
      if (!s) {
        s = S.find(x => x.id === "depth");
        if (!s) { s = { id: "depth", title: T["_title." + e.sec] || T._title || DEF_T[L], paragraphs: [], collapsed: true }; made = true; const at = S.findIndex(x => x.id === "advice"); S.splice(at < 0 ? S.length : at, 0, s); }
      }
      s.paragraphs.push(r.t);
      if (opts.dup) { const d = opts.dup(S); if (d > dups) { s.paragraphs.pop(); if (made) S.splice(S.indexOf(s), 1); continue; } }
      // FA.toHTML: what was shown in full stays shown; the depth text folds (s.main = the count shown before)
      if (s.main == null && !s.collapsed) s.main = s.paragraphs.length - 1;
      added.push(s);
      len += r.t.length + 1;
      if (r.c || e.caution) cau.push(r.t);
    }
    // a reading that was short (shown in full) keeps its shown part at the composer's minimum: depth text is shown in order
    const mainLen = () => S.filter(x => !x.collapsed).map(x => x.paragraphs.slice(0, typeof x.main === "number" ? x.main : x.paragraphs.length).join(" ")).join(" ").length;
    for (const x of added) {
      if (mainLen() >= MAIN[L].min) break;
      const next = x.collapsed ? x.paragraphs[0] : x.paragraphs[x.main];
      if (next == null || mainLen() + next.length > MAIN[L].max) break;
      if (x.collapsed) { x.collapsed = false; x.main = 1; } else x.main++;
      if (x.main >= x.paragraphs.length) delete x.main;
    }
    return cau;
  }
  const API = { apply, resolve, CAP, reg };
  if (typeof module !== "undefined" && module.exports && !Object.keys(module.exports).length) module.exports = API;
  root.LQFortuneDepth = API;
})(typeof window !== "undefined" ? window : globalThis);
