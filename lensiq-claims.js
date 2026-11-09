/* lensiq-claims.js — LQClaims: Product Check over-claim RISK SIGNALS on label / listing text (design §5.1). Browser:
 * window.LQClaims (load lensiq-claims-rules.js first) · Node: module.exports. Pure text logic, no DOM, no network;
 * unit-tested in tests/unit/pc-claims.test.js, measured by tools/pc-claims-eval.mjs.
 *
 * WHAT IT IS: deterministic rules (data in lensiq-claims-rules.js, generated from tools/pc-rules-draft.json) that point at
 * wording which is a RISK SIGNAL under a named Thai rule, with the exact text found and where it is.
 * WHAT IT IS NOT: a legal finding. No output ever says a product is illegal; a pharmacist or counsel confirms.
 *
 *   normalize(text) -> {text, start[], end[]}  folded text + for every folded UTF-16 unit the [start, end) of the
 *       original text it came from: zero-width characters removed; full-width / compatibility forms folded (NFKC per
 *       character, Thai left as is); Thai digits -> 0-9; curly quotes / dashes folded; whitespace runs -> one space
 *       (dropped between two Thai letters, where OCR adds stray spaces); decomposed sara am (nikhahit + aa) -> ำ;
 *       เ + เ (a common typing slip for แ) -> แ.
 *   detect(text, {category, lang, context, wholeLabel, kind}) -> [{rule_id, family, span:{start,end}, text, severity,
 *       basis, url, explain:{th,en,zh}, label}] sorted by position. `text` is always text.slice(span.start, span.end).
 *       category: drug | supplement | food | herbal | cosmetic (rules outside the category's scope never fire; omitted =
 *       every family). Patterns of all three languages run whatever `lang` says, because labels mix scripts.
 *       context: product-record text for requires_context rules (F18). wholeLabel: the text is a COMPLETE supplement
 *       label (kind "label", default) or advert (kind "ad") -> the F15 absence check runs and reports missing lines.
 *   missingWarnings(text, kind="label") -> [{id, text}] required supplement warning lines not found
 *   explain(ruleId) -> {th, en, zh} one-line "risk signal" explanation
 *   RULES, ALLOW (approved nutrient-function statements, each with source + url), MASKS, DATA
 */
(function (root, factory) {
  const node = typeof module !== "undefined" && module.exports;
  const m = factory(node ? require("./lensiq-claims-rules.js") : /** @type {any} */ (root).LQClaimsRules);
  if (node) module.exports = m; else /** @type {any} */ (root).LQClaims = m;
})(typeof self !== "undefined" ? self : this, function (DATA) {
  "use strict";
  if (!DATA || !Array.isArray(DATA.rules)) throw new Error("LQClaims: lensiq-claims-rules.js must be loaded first");

  /* ---------------- normalisation with an exact map back to the original ---------------- */
  const ZW = /[​-‍⁠﻿­᠎]/;
  const WS = /\s/;
  const THAI_LETTER = /[ก-๏]/;
  const FOLD = { "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "“": "\"", "”": "\"", "„": "\"",
    "‟": "\"", "″": "\"", "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-" };

  /** @param {any} input @returns {{text: string, start: number[], end: number[]}} */
  function normalize(input) {
    const src = String(input == null ? "" : input);
    let out = "";
    /** @type {number[]} */ const start = [];
    /** @type {number[]} */ const end = [];
    const push = (/** @type {string} */ s, /** @type {number} */ a, /** @type {number} */ b) => {
      for (let k = 0; k < s.length; k++) { out += s[k]; start.push(a); end.push(b); }
    };
    let i = 0;
    while (i < src.length) {
      const cp = /** @type {number} */ (src.codePointAt(i));
      const w = cp > 0xffff ? 2 : 1;
      const ch = src.slice(i, i + w);
      if (cp === 0x0E4D) { // nikhahit + aa -> sara am; nikhahit + tone + aa -> tone + sara am
        if (src[i + 1] === "า") { push("ำ", i, i + 2); i += 2; continue; }
        if (/[่-๋]/.test(src[i + 1] || "") && src[i + 2] === "า") { push(src[i + 1] + "ำ", i, i + 3); i += 3; continue; }
      }
      if (cp === 0x0E40 && src[i + 1] === "\u0E40") { push("\u0E41", i, i + 2); i += 2; continue; } // เ + เ typed for แ
      if (ZW.test(ch)) { i += w; continue; }
      if (WS.test(ch)) {
        let j = i;
        while (j < src.length && (WS.test(src[j]) || ZW.test(src[j]))) j++;
        const prev = out[out.length - 1] || "";
        const next = src[j] || "";
        if (out.length && j < src.length && !(THAI_LETTER.test(prev) && THAI_LETTER.test(next))) push(" ", i, j);
        i = j;
        continue;
      }
      if (cp >= 0x0E50 && cp <= 0x0E59) { push(String(cp - 0x0E50), i, i + w); i += w; continue; }
      if (cp >= 0x0E00 && cp <= 0x0E7F) { push(ch, i, i + w); i += w; continue; }
      let n = ch.normalize("NFKC");
      n = n.replace(/[‐-―‘-‟′″−]/g, c => FOLD[c] || c);
      if (WS.test(n)) n = n.replace(/\s+/g, " "); // NFKC can turn a compatibility space into a plain one
      push(n, i, i + w);
      i += w;
    }
    return { text: out, start, end };
  }

  /* ---------------- compiled data ---------------- */
  /** @param {string} p @param {string} [flags] */
  function rx(p, flags = "giu") {
    try { return new RegExp(p, flags); } catch { return new RegExp(p, flags.replace("u", "")); }
  }
  const escapeRe = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /** An approved statement as a pattern: any spacing between Thai letters, flexible spacing / final dot in English. */
  function allowPattern(/** @type {string} */ text, /** @type {string} */ lang) {
    const t = normalize(text).text;
    if (lang === "th") return rx([...t.replace(/\s+/g, "")].map(escapeRe).join("\\s?"));
    return rx(t.split(/\s+/).map(escapeRe).join("[\\s-]+") + "\\.?");
  }

  const RULES = DATA.rules;
  const BY_ID = Object.fromEntries(RULES.map((/** @type {any} */ r) => [r.id, r]));
  const LANGS = ["th", "en", "zh"];
  const COMPILED = RULES.map((/** @type {any} */ r) => ({
    rule: r,
    res: LANGS.flatMap(l => ((r.patterns && r.patterns[l]) || []).map((/** @type {string} */ p) => rx(p))),
    ex: (r.exclude || []).map((/** @type {string} */ p) => rx(p)),
    ctx: (r.requires_context || []).length ? rx((r.requires_context || []).map(escapeRe).join("|")) : null,
    verbs: r.verbs ? rx(LANGS.map(l => r.verbs[l]).filter(Boolean).join("|")) : null
  }));
  const VERBS = rx(LANGS.map(l => DATA.claim_verbs[l]).filter(Boolean).join("|"));
  const MASKS = DATA.masks.map((/** @type {any} */ m) => ({ ...m, re: rx(m.pattern) }));
  const ALLOW = DATA.allow.map((/** @type {any} */ a) => ({
    ...a, source: DATA.allow_source.source, url: a.lang === "th" ? DATA.allow_source.url_th : DATA.allow_source.url_en
  }));
  const ALLOW_RE = ALLOW.map((/** @type {any} */ a) => allowPattern(a.text, a.lang));
  const ALLOW_CATS = ["food", "supplement"];

  /** All [start, end) matches of a global regex in s. @param {RegExp} re @param {string} s */
  function spans(re, s) {
    /** @type {Array<[number, number]>} */ const out = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      out.push([m.index, m.index + m[0].length]);
    }
    return out;
  }
  const overlaps = (/** @type {number[]} */ a, /** @type {number[]} */ b) => a[0] < b[1] && b[0] < a[1];

  /* ---------------- explanations (TH / EN / ZH): always "risk signal", never "illegal" ---------------- */
  /** @param {string} id */
  function explain(id) {
    const r = BY_ID[id];
    if (!r) return { th: "", en: "", zh: "" };
    return {
      th: `สัญญาณเสี่ยงตาม ${r.id}: ${r.title_th} ควรให้เภสัชกรหรือที่ปรึกษากฎหมายตรวจข้อความนี้ ไม่ใช่คำตัดสินทางกฎหมาย`,
      en: `Risk signal under ${r.id}: ${r.title_en}. A pharmacist or counsel should check this wording; it is not a legal finding.`,
      zh: `${r.id} 风险信号：${r.title_zh}。请药剂师或法律顾问核实此措辞；这不是法律结论。`
    };
  }

  /* ---------------- F15: required supplement warning lines ---------------- */
  /** @param {any} text @param {"label"|"ad"} [kind] */
  function missingWarnings(text, kind = "label") {
    const n = normalize(text).text;
    const list = DATA.warnings[kind === "ad" ? "ad" : "label"];
    return list.filter((/** @type {any} */ w) => !rx(w.pattern).test(n)).map((/** @type {any} */ w) => ({ id: w.id, text: w.text }));
  }

  /* ---------------- detection ---------------- */
  /** @param {any} rule @param {string|undefined} cat */
  const inScope = (rule, cat) => !cat || rule.category.includes(cat);

  /**
   * @param {any} text
   * @param {{category?: string, lang?: string, context?: string, wholeLabel?: boolean, kind?: "label"|"ad"}} [opts]
   */
  function detect(text, opts = {}) {
    const orig = String(text == null ? "" : text);
    const cat = opts.category ? String(opts.category).toLowerCase() : undefined;
    const N = normalize(orig);
    const s = N.text;
    /** @type {any[]} */ const out = [];
    if (s) {
      const masked = MASKS.flatMap((/** @type {any} */ m) => spans(m.re, s));
      const allowed = !cat || ALLOW_CATS.includes(cat) ? ALLOW_RE.flatMap((/** @type {RegExp} */ re) => spans(re, s)) : [];
      const verbsAt = (/** @type {RegExp} */ re) => spans(re, s).filter(v => !masked.some(m => overlaps(v, m)));
      const verbs = verbsAt(VERBS);
      const ctxText = s + " " + normalize(opts.context || "").text;
      for (const c of COMPILED) {
        const r = c.rule;
        if (r.detect !== "text" || !c.res.length || !inScope(r, cat)) continue;
        if (c.ctx && !(c.ctx.lastIndex = 0, c.ctx.test(ctxText))) continue;
        let hits = c.res.flatMap((/** @type {RegExp} */ re) => spans(re, s));
        if (!hits.length) continue;
        const exAt = c.ex.flatMap((/** @type {RegExp} */ re) => spans(re, s));
        hits = hits.filter(h => !masked.some(m => overlaps(h, m)) && !allowed.some(a => overlaps(h, a)) && !exAt.some(e => overlaps(h, e)));
        if (r.requires_claim_verb) {
          const W = r.claim_window || 40;
          const vs = c.verbs ? verbsAt(c.verbs) : verbs;
          hits = hits.filter(h => vs.some(v => v[0] < h[1] + W && v[1] > h[0] - W));
        }
        // merge overlapping hits of one rule, trim spaces, map back to the original text
        hits.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
        /** @type {Array<[number, number]>} */ const merged = [];
        for (const h of hits) {
          const last = merged[merged.length - 1];
          if (last && h[0] < last[1]) last[1] = Math.max(last[1], h[1]); else merged.push([h[0], h[1]]);
        }
        for (let [a, b] of merged) {
          while (a < b && s[a] === " ") a++;
          while (b > a && s[b - 1] === " ") b--;
          if (a >= b) continue;
          const span = { start: N.start[a], end: N.end[b - 1] };
          out.push(flag(r, span, orig.slice(span.start, span.end)));
        }
      }
    }
    if (opts.wholeLabel && cat === "supplement" && BY_ID.F15) {
      const missing = missingWarnings(orig, opts.kind === "ad" ? "ad" : "label");
      if (missing.length) out.push({ ...flag(BY_ID.F15, { start: 0, end: 0 }, ""), absence: true, missing: missing.map(m => m.text) });
    }
    return out.sort((x, y) => x.span.start - y.span.start || (x.rule_id < y.rule_id ? -1 : x.rule_id > y.rule_id ? 1 : 0));
  }

  /** @param {any} r @param {{start: number, end: number}} span @param {string} found */
  function flag(r, span, found) {
    return {
      rule_id: r.id, family: r.family, span, text: found, severity: r.severity, basis: r.basis, url: r.url,
      status: r.status, explain: explain(r.id), label: { th: "สัญญาณเสี่ยง", en: "risk signal", zh: "风险信号" }
    };
  }

  return { normalize, detect, explain, missingWarnings, RULES, ALLOW, MASKS: DATA.masks, DATA };
});
