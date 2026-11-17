/* fortune-depth.js — the depth layer behind "อ่านเพิ่มเติม" (owner order 2026-11-17 item 3: the expanded part must be clearly
   longer and deeper than the summary and add new substance from the tradition's own material, never a few extra words).
   Generic engine only; the material is data in each discipline's knowledge files:
     LQ_DEPTH.build[domain](facts)  -> [{ sec, key, vars?, caution? }] in reading order (registered by the Thai kb file);
                                       without a builder, facts.depth (set by the engine) is the list
     LQ_DEPTH.text[lang][domain]    -> { key: text | [text] | { t, c } | fn(vars), _title?: section title, _name?: fn(id) }
   A text marked { c: true } (or an entry with caution: true) restrains or warns: compose() marks its paragraph caution, so the
   layout never folds it (owner rule). Entries are added only while the whole reading stays within its language's length
   cap (the composer's own cap, unchanged), never in a calm / crisis reading, and never twice.
   facts.depth (when an engine computes its own layers) is enumerable on purpose: it holds derived keys and the computed
   numbers the texts use, so the semantic lint finds every number's evidence; the AI path's compactFacts never sends it. {X} in a text is filled from
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
    // the headline already names the result: "…คือเซียมซีใบที่ 21 (ดี) จากเซียมซีใบที่ 21 (ดี) ซึ่ง…" keeps one (review 2026-11-18)
    const H = String(facts.headline || "").trim();
    if (H.length >= 6) {
      const esc = (/** @type {string} */ t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), e = esc(H), bare = H.replace(/\s*[(（][^)）]*[)）]\s*$/, "");
      const again = bare !== H && bare.length >= 6 ? "(?:" + e + "|" + esc(bare) + ")" : e, re = new RegExp("(" + e + ")\\s+(?:จาก)?" + again, "g");
      const it = (facts.items || []).find((/** @type {any} */ x) => x && x.label === H), short = it && it.short, re2 = new RegExp("^(?:จาก)?" + again + "\\s*");
      for (const s of out.sections) {
        const P = s.paragraphs = (s.paragraphs || []).map((/** @type {string} */ p) => String(p).replace(re, "$1"));
        // across paragraphs ("…คือเซียมซีใบที่ 1 (ดีมาก)" | "เซียมซีใบที่ 1 (ดีมาก) แสดงว่า…"): the second names it by its short name
        for (let i = 0; short && i + 1 < P.length; i++) if (P[i].trim().endsWith(H) && re2.test(P[i + 1])) P[i + 1] = P[i + 1].replace(re2, short + " ");
      }
    }
    const L = lang === "en" || lang === "zh" ? lang : "th", R = reg(), b = R.build[facts.domain] || (Array.isArray(facts.depth) ? () => facts.depth : null), T = R.text[L] && R.text[L][facts.domain];
    if (typeof b !== "function" || !T) return [];
    let entries;
    try { entries = b(facts) || []; } catch (e) { return []; }
    const S = out.sections, cau = [], sep = L === "zh" ? 0 : 1, added = [];
    let len = S.reduce((n, s) => n + (s.paragraphs || []).reduce((m, p) => m + String(p).length + 1, 0), 0);
    const has = (/** @type {string} */ t) => S.some(s => (s.paragraphs || []).some(p => String(p).indexOf(t) >= 0));
    // opts.dup(sections) = the composer's count of near-duplicates + lint + semantic findings: a depth text that adds one is not used
    let dups = opts.dup ? opts.dup(S) : 0;
    for (const e of entries) {
      const r = resolve(T, e.key, e.vars, L);
      if (!r || has(r.t) || unitsOf(r.t, L).some(has) || (opts.ok && !opts.ok(r.t)) || len + r.t.length + sep + 1 > CAP[L]) continue;
      let s = S.find(x => x.id === e.sec), made = false;
      if (!s) {
        // no section of its own: the overview takes it as a whole folded paragraph (a new section's first paragraph would be
        // cut at ~3 lines, so the fold would start mid-sentence; independent review 2026-11-18)
        s = S.find(x => x.id === "depth") || S.find(x => x.id === "overview");
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
  /** tarot (independent review 2026-11-18): a caution paragraph often carries non-caution sentences too (the opener, the
   *  section lead-in, the spread description), and a caution paragraph is shown whole. Split each such paragraph into runs
   *  of sentences: a sentence that overlaps any caution text (the composer's own caution record, matched as whole texts
   *  and as the same >= 12 / 6-char pieces markCaution uses) stays in a caution run; the other sentences become their own
   *  paragraphs, which fold. Text and order are unchanged; every caution text stays in a shown paragraph. */
  function splitCaution(/** @type {any} */ out, /** @type {any} */ facts, /** @type {string} */ lang, /** @type {string[]} */ rec, /** @type {any} */ opts) {
    if (!out || out.source !== "local" || !facts || facts.domain !== "tarot" || (opts && opts.calm) || !Array.isArray(out.sections)) return out;
    const L = lang === "en" || lang === "zh" ? lang : "th", en = L === "en", lc = (/** @type {string} */ t) => (en ? t.toLowerCase() : t);
    const pieces = [...new Set(rec.map(t => lc(String(t))).flatMap(t => (L === "zh" ? t.split(/[，。；！？]/) : en ? t.split(/[,.;:!?]\s+/) : t.split(" ")).concat([t]))
      .map(x => x.trim()).filter(x => x.length >= (L === "zh" ? 6 : 12)))];
    const sentRe = L === "zh" ? /[^。！？]+[。！？]*/g : en ? /[^.!?]+[.!?]*\s*/g : /\S+\s*/g;
    for (const s of out.sections) {
      const P = s.paragraphs || [], next = [], map = [];
      P.forEach((p0, i) => {
        map[i] = next.length;
        const p = String(p0), lp = lc(p), hit = new Array(p.length).fill(false);
        for (const x of pieces) for (let k = lp.indexOf(x); k >= 0; k = lp.indexOf(x, k + 1)) for (let j = k; j < k + x.length; j++) hit[j] = true;
        if (!hit.some(Boolean)) { next.push(p); return; }
        // sentences with their positions (Thai: the composer's own sentence splitter), never cut inside brackets
        const units = [];
        if (L === "th" && opts && typeof opts.sentences === "function") {
          let at = 0;
          for (const x of opts.sentences(p)) { const k = p.indexOf(x, at); if (k < 0) { units.length = 0; break; } units.push({ i: at, t: p.slice(at, k + x.length) }); at = k + x.length; }
          if (units.length) units[units.length - 1].t += p.slice(at); else units.push({ i: 0, t: p });
        } else { let m; sentRe.lastIndex = 0; while ((m = sentRe.exec(p)) && m[0]) units.push({ i: m.index, t: m[0] }); }
        const open = (/** @type {string} */ t) => (t.match(/[(（]/g) || []).length - (t.match(/[)）]/g) || []).length;
        const whole = [];
        for (const u of units) { const w = whole[whole.length - 1]; if (w && open(w.t) > 0) w.t += u.t; else whole.push({ i: u.i, t: u.t }); }
        const runs = [];
        for (const u of whole) {
          const c = hit.slice(u.i, u.i + u.t.length).some(Boolean), last = runs[runs.length - 1];
          if (last && last.c === c) last.t += u.t; else runs.push({ c, t: u.t });
        }
        // a short non-caution run (under 40 chars) stays with its neighbour: no one-word paragraphs
        const merged = [];
        for (const r of runs) { const prev = merged[merged.length - 1]; if (prev && (!r.c && r.t.trim().length < 40 || !prev.c && prev.t.trim().length < 40)) { prev.t += r.t; prev.c = prev.c || r.c; } else merged.push(r); }
        // a piece the composer's own lint flags (a dangling "…ที่น่าสังเกตคือ", a "คือ…" start) is joined back to its neighbour
        const bad = (/** @type {{t: string}} */ r) => !!(opts && opts.lintP && opts.lintP(r.t.trim()));
        for (let guard = 0; merged.length > 1 && guard < 50; guard++) {
          const i = merged.findIndex(bad);
          if (i < 0) break;
          const j = i + 1 < merged.length ? i + 1 : i - 1, a = Math.min(i, j);
          merged.splice(a, 2, { c: merged[a].c || merged[a + 1].c, t: merged[a].t + merged[a + 1].t });
        }
        merged.map(r => r.t.trim()).filter(Boolean).forEach(t => next.push(t));
      });
      if (next.length === P.length) continue;
      if (typeof s.main === "number") s.main = s.main >= P.length ? next.length : map[s.main];
      s.paragraphs = next;
    }
    return out;
  }
  const API = { apply, splitCaution, resolve, CAP, reg };
  if (typeof module !== "undefined" && module.exports && !Object.keys(module.exports).length) module.exports = API;
  root.LQFortuneDepth = API;
})(typeof window !== "undefined" ? window : globalThis);
