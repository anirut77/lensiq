/* lensiq-pc-lookup.js — Product Check risk-signal card (round 17, phase P4; design §4, §6). Browser: window.LQPCLookup and
 * the card in #pcClaimsSlot of medicine.html · Node: module.exports (pure parts, unit-tested in tests/unit/pc-lookup.test.js).
 *
 * ON THE DEVICE (no request to anyone but this site, which serves the tables):
 *   - Thai brand -> active ingredient / strength / dose form from TMT 2020-02-17 (CC BY), loaded as the few index shards a
 *     label needs (vendor/pc-drugs/tmt/, built by tools/pc-tmt-build.mjs from vendor/pc-drugs/tmt-2563.json);
 *   - Health Canada recalls (OGL-Canada) after the tap, from static shards (vendor/pc-recalls/hc/, tools/pc-hc-build.mjs);
 *   - NLEM 2567 membership of those ingredients (vendor/pc-drugs/nlem-2567.json);
 *   - the curated Thai warning list (vendor/pc-alerts/th.json: facts from Thai FDA announcements, source + date each);
 *   - P3 over-claim risk signals (LQClaims.detect) on the label text.
 * ONLY AFTER THE USER TAPS "check official sources" (with a one-line notice naming every source and country first):
 *   derived facts (registration numbers, GTINs, product names already found in TMT, ingredient names) go to the LENSIQ
 *   Worker /api/pc/* (backend/src/pc.js), which asks Thai FDA, openFDA, EU Safety Gate, RASFF, Health Canada, HSA, RxNav.
 *   Never the label text, never an image. Without the server every remote row reads "could not check".
 *
 * WORDING: "risk signal" / "found in <source> on <date>" only. Never a verdict word (no "illegal", "fake", "genuine",
 * "safe"); a source that did not answer is "could not check", never "no signal". Bottom line stays on the page.
 *
 *   normKey(s) · baseKey(name) · ocrFold(s) · regKey(s) · regCandidates(text)
 *   buildTmtIndex(tmt) -> idx          matchTmt(text, idx, {max}) -> [{name, via, matched, ingredients:[{name, n}], strengths, forms}]
 *   buildNlemIndex(nlem) -> idx        nlemFor(ingredient, idx) -> [{generic, category, forms}]
 *   alertsFor(text, alerts, regs?) -> [{entry, via: "reg"|"name"}]
 *   inferCategory({regs, tmt}) -> drug | food | cosmetic | herbal | undefined
 *   planLookups(facts) -> [{source, path, fact, kind}]      rowFor(step, response, today) -> card row model
 * Test hooks (browser): window.__LQ_PCL = {st, run(text, codes), check()}; window.__LQ_PC_FETCH replaces fetch for /api/pc.
 */
(function (root, factory) {
  const node = typeof module !== "undefined" && module.exports;
  const m = factory();
  if (node) module.exports = m;
  else { /** @type {any} */ (root).LQPCLookup = m; m.mount(root); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------------- normalisation ---------------- */
  const THAI_DIGIT = /[๐-๙]/g;
  /** Upper-case letters + digits only (Thai letters kept). @param {any} s */
  function normKey(s) {
    return String(s == null ? "" : s).normalize("NFKC").replace(THAI_DIGIT, d => String(d.charCodeAt(0) - 0x0e50)).toUpperCase().replace(/[^0-9A-Zก-๛]/g, "");
  }
  /** Name without parentheses and without tokens holding digits ("ZYCEL 200" -> "ZYCEL", "NUOSIC (ชมพู)" -> "NUOSIC"). @param {any} name */
  function baseKey(name) {
    const t = String(name == null ? "" : name).normalize("NFKC").toUpperCase().replace(/\([^)]*\)/g, " ");
    return normKey(t.split(/[\s\-/,+.]+/).filter(w => w && !/[0-9๐-๙]/.test(w)).join(" "));
  }
  const FOLD = { "0": "O", "1": "I", L: "I", "5": "S", "8": "B", "2": "Z", "6": "G" };
  /** OCR confusion fold (0/O, 1/I/L, 5/S, 8/B, 2/Z, 6/G) on a normKey. @param {string} k */
  const ocrFold = k => k.replace(/[0158L26]/g, c => FOLD[c] || c);
  /** Registration number -> lookup key (same fold as tools/pc-alerts-build.mjs regKey). @param {any} s */
  const regKey = s => String(s || "").normalize("NFKC").toUpperCase().replace(/[^0-9A-Zก-ฮ]/g, "");
  /** Thai registration-number candidates in free text (food, cosmetic, drug, herbal shapes), as printed. @param {any} text */
  function regCandidates(text) {
    const t = String(text || "").normalize("NFKC").replace(THAI_DIGIT, d => String(d.charCodeAt(0) - 0x0e50));
    const out = new Set();
    for (const re of [/(?<![0-9-])\d{2}-?\d-?\d{5}-?\d-?\d{4}(?![0-9-])/g, /(?<![0-9-])\d{2}-?\d-?\d{10}(?![0-9-])/g, /(?<![0-9A-Z])\d?[A-Zก-ฮ]{1,2}\s?\d{1,6}\/\d{2,4}(?![0-9])/gi]) {
      for (const m of t.matchAll(re)) out.add(m[0].trim());
    }
    return [...out];
  }

  /* ---------------- TMT: Thai brand -> ingredient ---------------- */
  /** Label words that are never a brand on their own: generic packaging and dose-form words chosen in advance (TABLET ...
   *  DAY), plus MINOR and TRIM added while tuning on the DEV split only (docs/product-check/P4-RESULTS.md §2.1). */
  const STOP = new Set(["TABLET", "TABLETS", "CAPSULE", "CAPSULES", "CREAM", "SYRUP", "INJECTION", "SOLUTION", "SUSPENSION", "OINTMENT", "LOTION", "POWDER",
    "DROPS", "GEL", "VITAMIN", "VITAMINS", "EXTRA", "FORTE", "PLUS", "ORAL", "SOFT", "HARD", "COATED", "FILM", "SUGAR", "WATER", "HERBAL", "NATURAL", "ORIGINAL",
    "BABY", "KIDS", "ADULT", "CHILD", "CHILDREN", "SPRAY", "NASAL", "EYE", "EAR", "SKIN", "HAIR", "FACE", "BODY", "WHITE", "BLACK", "GREEN", "BLUE", "RED", "GOLD",
    "COLLAGEN", "ZINC", "CALCIUM", "IRON", "FIBER", "PROTEIN", "SERUM", "MASK", "SOAP", "SHAMPOO", "TEA", "COFFEE", "MILK", "HONEY", "DRINK", "FRESH", "CLEAR",
    "SUPER", "MAX", "ULTRA", "ACTIVE", "CARE", "HEALTH", "BEAUTY", "LIFE", "SLIM", "LIGHT", "PURE", "DAILY", "NIGHT", "DAY", "MINOR", "TRIM"]);
  const MIN = { full: 4, base: 5, ocr: 6, edit: 7 };

  /**
   * Compact index (P4 review S7): each key maps to the row numbers of tmt.p only (one small int array per key); the
   * per-key facts (names, ingredients, strengths, forms) are aggregated lazily for the few keys a label matches.
   * @param {any} tmt table from vendor/pc-drugs/tmt-2563.json
   */
  function buildTmtIndex(tmt) {
    const full = new Map(), base = new Map(), ocr = new Map();
    const put = (/** @type {Map<string, number[]>} */ map, /** @type {string} */ key, /** @type {number} */ r) => { const a = map.get(key); if (a) a.push(r); else map.set(key, [r]); };
    const p = tmt.p;
    for (let r = 0; r < p.length; r++) {
      const fk = normKey(p[r][0]), bk = baseKey(p[r][0]);
      if (fk.length >= MIN.full) put(full, fk, r);
      if (bk.length >= MIN.base && !STOP.has(bk)) {
        put(base, bk, r);
        const ok = ocrFold(bk);
        if (ok.length >= MIN.ocr) put(ocr, ok, r);
      }
    }
    return { tmt, full, base, ocr, byLen: /** @type {Map<number, string[]>|null} */ (null) };
  }
  /* ---------- sharded TMT (owner decision 2026-11-10, review S7): built offline, loaded on demand ---------- */
  const TOKSPLIT = /[\s,;:|()[\]{}"'“”‘’®™©*•·]+/;
  /** Shard file name of an index key: the first two characters as hex code points ("ZY" -> "5a-59"). @param {string} key */
  const shardOf = key => [...key].slice(0, 2).map(c => /** @type {number} */ (c.codePointAt(0)).toString(16)).join("-");
  /** Every index key a label can look up (the same gram walk and key rules as matchTmt). @param {any} text */
  function tmtKeys(text) {
    const toks = String(text || "").normalize("NFKC").split(TOKSPLIT).filter(Boolean);
    const keys = new Set();
    for (let i = 0; i < toks.length; i++) {
      for (let n = Math.min(MAX_GRAM, toks.length - i); n >= 1; n--) {
        const words = toks.slice(i, i + n), gram = words.join(" ");
        const fk = normKey(gram), bk = baseKey(gram), ok = ocrGram(words);
        if (fk.length >= MIN.full) keys.add(fk);
        if (bk.length >= MIN.base) keys.add(bk);
        if (ok.length >= MIN.ocr) keys.add(ok);
      }
    }
    return keys;
  }
  /**
   * Build time (tools/pc-tmt-build.mjs): the index split by key prefix. Each shard holds every key of its prefix with the
   * rows behind it in table order (name, ingredient#, strength, form#; makers are not needed for matching).
   * @param {any} tmt @returns {Array<[string, {r: any[], f: any, b: any, o: any}]>}
   */
  function buildTmtShards(tmt) {
    /** @type {Map<string, any>} */ const shards = new Map();
    const put = (/** @type {string} */ m, /** @type {string} */ key, /** @type {number} */ r) => {
      const name = shardOf(key);
      if (!shards.has(name)) shards.set(name, { r: [], at: new Map(), f: {}, b: {}, o: {} });
      const sh = shards.get(name);
      let li = sh.at.get(r);
      if (li === undefined) { li = sh.r.length; sh.at.set(r, li); const row = tmt.p[r]; sh.r.push([row[0], row[1], row[2], row[3]]); }
      (sh[m][key] = sh[m][key] || []).push(li);
    };
    const p = tmt.p;
    for (let r = 0; r < p.length; r++) {
      const fk = normKey(p[r][0]), bk = baseKey(p[r][0]);
      if (fk.length >= MIN.full) put("f", fk, r);
      if (bk.length >= MIN.base && !STOP.has(bk)) {
        put("b", bk, r);
        const ok = ocrFold(bk);
        if (ok.length >= MIN.ocr) put("o", ok, r);
      }
    }
    return [...shards.keys()].sort().map(k => { const sh = shards.get(k); return [k, { r: sh.r, f: sh.f, b: sh.b, o: sh.o }]; });
  }
  /** An index over just the loaded shards (same shape buildTmtIndex returns). @param {any} meta @param {any[]} shards */
  function indexFromShards(meta, shards) {
    /** @type {any[]} */ const p = [];
    /** @type {Map<string, number[]>} */ const full = new Map(), base = new Map(), ocr = new Map();
    for (const sh of shards) {
      const off = p.length;
      for (const row of sh.r) p.push(row);
      const maps = /** @type {Array<[string, Map<string, number[]>]>} */ ([["f", full], ["b", base], ["o", ocr]]);
      for (const [m, map] of maps) for (const k of Object.keys(sh[m])) map.set(k, sh[m][k].map((/** @type {number} */ i) => i + off));
    }
    return { tmt: { ing: meta.ing, form: meta.form, p }, full, base, ocr, byLen: null };
  }
  /** Shard names a label needs (only those that exist). @param {any} text @param {any} meta */
  const tmtShardsFor = (text, meta) => { const have = new Set(meta.shards); return [...new Set([...tmtKeys(text)].map(shardOf))].filter(n => have.has(n)).sort(); };
  /**
   * matchTmt over the shards a label needs: load(name) -> shard JSON. The one-letter-off path needs the whole index and is
   * not available here (it is off by default). @param {any} text @param {any} meta @param {(name: string) => Promise<any>} load
   * @param {{max?: number}} [o]
   */
  async function matchTmtSharded(text, meta, load, o = {}) {
    const shards = await Promise.all(tmtShardsFor(text, meta).map(load));
    return matchTmt(text, indexFromShards(meta, shards), { max: o.max || 3 });
  }

  /* ---------- Health Canada recalls, sharded (owner decision 2026-11-10, review S5): on the device, static files ---------- */
  /** Same word fold the recall search always used. @param {any} s */
  const hcFold = s => String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  /**
   * Build time (tools/pc-hc-build.mjs): rows [NID, Title, Product, Issue, date, URL, Organization], newest first, become item
   * chunks plus word postings sharded by the first two letters of each word (3+ letters).
   * @param {any[][]} rows @param {number} [chunk] @returns {{chunks: any[][][], tokens: Map<string, Record<string, number[]>>}}
   */
  function buildHcShards(rows, chunk = 400) {
    const sorted = [...rows].sort((a, b) => (a[4] < b[4] ? 1 : a[4] > b[4] ? -1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const chunks = [], tokens = new Map();
    sorted.forEach((r, id) => {
      if (id % chunk === 0) chunks.push([]);
      chunks[chunks.length - 1].push(r);
      for (const w of new Set(hcFold(r[1] + " " + r[2]).split(" ").filter(x => x.length >= 3))) {
        const pre = w.slice(0, 2);
        if (!tokens.has(pre)) tokens.set(pre, {});
        const t = tokens.get(pre);
        (t[w] = t[w] || []).push(id);
      }
    });
    return { chunks, tokens };
  }
  /**
   * Every query word (3+ letters) must start a word of the title or product name, as before; newest first, at most 5.
   * loadTokens(prefix) / loadChunk(n) fetch one small static file each. Returns {items (newest 5), total (all matches)}.
   * @param {any} q @param {any} meta
   * @param {(p: string) => Promise<any>} loadTokens @param {(n: number) => Promise<any[]>} loadChunk
   */
  async function hcSearchSharded(q, meta, loadTokens, loadChunk) {
    const words = [...new Set(hcFold(q).split(" ").filter(w => w.length >= 3))];
    const none = { items: [], total: 0 };
    if (!words.length) return none;
    const have = new Set(meta.prefixes);
    /** @type {Set<number>|null} */ let ids = null;
    for (const w of words) {
      const pre = w.slice(0, 2);
      if (!have.has(pre)) return none;
      const t = await loadTokens(pre), got = new Set();
      for (const tok of Object.keys(t)) if (tok.startsWith(w)) for (const i of t[tok]) got.add(i);
      ids = ids ? new Set([...ids].filter(i => got.has(i))) : got;
      if (!ids.size) return none;
    }
    const top = [...(ids || [])].sort((a, b) => a - b).slice(0, 5);
    const size = meta.chunk;
    const chunks = new Map();
    for (const n of new Set(top.map(i => Math.floor(i / size)))) chunks.set(n, await loadChunk(n));
    const items = top.map(i => { const r = chunks.get(Math.floor(i / size))[i % size]; return { ref: r[0], title: r[1], product: r[2], reason: r[3], date: r[4], url: r[5], org: r[6] }; });
    return { items, total: (ids || new Set()).size };
  }

  /** Facts of the rows behind one key, in table order (same order the eager index used). @param {any} tmt @param {number[]} rows */
  function aggregate(tmt, rows) {
    const e = { names: new Map(), ing: new Map(), byName: new Map(), str: new Set(), form: new Set() };
    for (const r of rows) {
      const row = tmt.p[r];
      e.names.set(row[0], (e.names.get(row[0]) || 0) + 1);
      if (!e.byName.has(row[0])) e.byName.set(row[0], new Map());
      e.byName.get(row[0]).set(row[1], (e.byName.get(row[0]).get(row[1]) || 0) + 1);
      e.ing.set(row[1], (e.ing.get(row[1]) || 0) + 1);
      if (row[2]) e.str.add(row[2]);
      e.form.add(row[3]);
    }
    return e;
  }
  /** Keys of the OCR map by length, built only when one-letter-off matching is asked for. @param {any} idx */
  function byLen(idx) {
    if (!idx.byLen) { idx.byLen = new Map(); for (const k of idx.ocr.keys()) { if (!idx.byLen.has(k.length)) idx.byLen.set(k.length, []); idx.byLen.get(k.length).push(k); } }
    return idx.byLen;
  }
  /** Levenshtein distance <= 1. @param {string} a @param {string} b */
  function within1(a, b) {
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, d = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++d > 1) return false;
      if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
    }
    return d + (la - i) + (lb - j) <= 1;
  }
  const QUALITY = { exact: 4, base: 3, ocr: 2, edit: 1 };
  const MAX_GRAM = 6;
  /** Spaced, upper-case, OCR-folded form used to prefer the exact spelling among names that share a key. @param {string} s */
  const spaced = s => ocrFold(String(s).normalize("NFKC").toUpperCase().replace(/[^0-9A-Zก-๛]+/g, " ").trim()).replace(/ /g, "");
  const spacedKeep = s => ocrFold(String(s).normalize("NFKC").toUpperCase().replace(/[^0-9A-Zก-๛ ]+/g, "").replace(/\s+/g, " ").trim());
  /** OCR-path key of a token run: digit-only tokens (strengths) dropped, a trailing "-400" strength cut, each token folded. */
  function ocrGram(words) {
    const parts = words.filter(w => /[A-Za-z]/.test(w)).map(w => ocrFold(normKey(w.replace(/[-/][0-9][0-9.,%]*$/, ""))));
    return parts.length && parts.every(x => x.length) ? parts.join("") : "";
  }
  /**
   * Brand names of the TMT table found in label text. Best first: more words covered > exact name > name without strength >
   * OCR-folded (> one letter off, only with {edit: true}); then longer keys. @param {any} text @param {any} idx
   * @param {{max?: number, edit?: boolean}} [o]
   */
  function matchTmt(text, idx, o = {}) {
    const max = o.max || 3;
    const toks = String(text || "").normalize("NFKC").split(TOKSPLIT).filter(Boolean);
    const found = new Map();
    const add = (key, via, e, matched, n) => {
      const prev = found.get(key);
      // words that carry letters count (strength tokens such as "100" never outrank an exact name)
      const score = matched.split(" ").filter(w => /[A-Za-zก-๛]/.test(w)).length * 10000 + QUALITY[via] * 1000 + key.length;
      if (!prev || prev.score < score) found.set(key, { key, via, e, matched, score });
    };
    for (let i = 0; i < toks.length; i++) {
      for (let n = Math.min(MAX_GRAM, toks.length - i); n >= 1; n--) {
        const words = toks.slice(i, i + n), gram = words.join(" ");
        const fk = normKey(gram);
        if (fk.length >= MIN.full && idx.full.has(fk) && !STOP.has(fk)) add(fk, "exact", idx.full.get(fk), gram, n);
        const bk = baseKey(gram);
        if (bk.length >= MIN.base && idx.base.has(bk)) add(bk, "base", idx.base.get(bk), gram, n);
        const ok = ocrGram(words);
        if (ok.length >= MIN.ocr && idx.ocr.has(ok)) add(ok, "ocr", idx.ocr.get(ok), gram, n);
        else if (o.edit && n === 1 && ok.length >= MIN.edit) {
          for (const L of [ok.length - 1, ok.length, ok.length + 1]) {
            for (const k of byLen(idx).get(L) || []) if (k[0] === ok[0] && within1(ok, k)) add(k, "edit", idx.ocr.get(k), gram, n);
          }
        }
      }
    }
    const best = [...found.values()].sort((a, b) => b.score - a.score);
    const out = [], seen = new Set();
    for (const f of best) {
      const t = idx.tmt, e = aggregate(t, f.e);
      // the name spelt exactly like the text (spaces and OCR look-alikes aside) decides the order of ingredients
      const want = spacedKeep(f.matched), wantNs = spaced(f.matched);
      const names = [...e.names.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]);
      const exactName = names.find(nm => spacedKeep(nm) === want) || names.find(nm => spaced(nm) === wantNs);
      const counts = exactName ? e.byName.get(exactName) : e.ing;
      const ingredients = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([i, c]) => ({ name: t.ing[i], n: c }));
      for (const [i, c] of e.ing) if (!counts.has(i)) ingredients.push({ name: t.ing[i], n: c });
      const name = exactName || names[0];
      // a product sold under its generic name ("GLUCOSE", "VITAMIN C") named by one word says nothing about the brand:
      // ordinary label wording, not a product name (tuned on the dev split: non-drug texts)
      if (f.matched.split(" ").length === 1 && (normKey(name) === normKey(ingredients[0].name) || baseKey(name) === normKey(ingredients[0].name))) continue;
      if (/^VITAMIN[A-Z]{0,2}\d{0,2}$/.test(f.key) || /^VITAMINS?[A-Z]?$/.test(baseKey(f.matched))) continue; // "vitamin C" on a label is wording, not a brand
      const sig = ingredients[0].name + "|" + name; // one row per product, whichever path found it
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ name, key: f.key, via: f.via, matched: f.matched, ingredients, ambiguous: ingredients.length > 1, strengths: [...e.str].slice(0, 6),
        forms: [...e.form].map(i => t.form[i]).slice(0, 4) });
      if (out.length >= max) break;
    }
    // a shorter match inside a longer, better one ("ZYCEL" inside "ZYCEL 200") is the same product: keep the better one
    return out.filter((m, i) => !out.slice(0, i).some(b => b.key.includes(m.key) && b.ingredients[0].name === m.ingredients[0].name));
  }

  /* ---------------- NLEM ---------------- */
  const ingFold = s => String(s || "").toLowerCase().normalize("NFKC").split(/\s*\+\s*/).map(x => x.replace(/[^a-z0-9]+/g, " ").trim()).filter(Boolean).sort().join("+");
  /** @param {any} nlem table from vendor/pc-drugs/nlem-2567.json */
  function buildNlemIndex(nlem) {
    const m = new Map();
    for (const e of nlem.e) for (const k of [e[0], e[1]].filter(Boolean).map(ingFold)) { if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
    return { nlem, m };
  }
  /** @param {string} ingredient @param {any} idx */
  function nlemFor(ingredient, idx) {
    const seen = new Set();
    return (idx.m.get(ingFold(ingredient)) || []).filter(e => { const k = e[0] + e[3]; if (seen.has(k)) return false; seen.add(k); return true; })
      .map(e => ({ generic: e[0], category: e[3], forms: e[2], group: idx.nlem.groups[e[4]] || "" }));
  }

  /* ---------------- curated Thai warning list ---------------- */
  /** @param {any} text @param {any} alerts vendor/pc-alerts/th.json @param {string[]} [regs] extra numbers (e.g. from LQPC.findRegNumbers) */
  function alertsFor(text, alerts, regs = []) {
    const keys = new Set([...regCandidates(text), ...regs].map(regKey).filter(k => k.length >= 6));
    const t = normKey(text);
    const out = [];
    for (const e of (alerts && alerts.entries) || []) {
      if (e.reg_key && keys.has(e.reg_key)) { out.push({ entry: e, via: "reg" }); continue; }
      const names = [e.name_en, e.name_th].map(normKey).filter(k => k.length >= 8);
      if (names.some(k => t.includes(k))) out.push({ entry: e, via: "name" });
    }
    return out;
  }

  /* ---------------- category for the over-claim rules ---------------- */
  /** @param {{regs?: any[], tmt?: any[]}} f */
  function inferCategory(f) {
    const kinds = new Set((f.regs || []).filter(r => r.country === "TH").map(r => r.kind));
    if ((f.tmt || []).length || kinds.has("drug")) return "drug";
    if (kinds.has("herbal-or-drug")) return "herbal";
    if (kinds.has("cosmetic")) return "cosmetic";
    if (kinds.has("food")) return "supplement"; // the food rule families (F) cover supplements and food alike
    return undefined;
  }

  /* ---------------- remote lookup plan ---------------- */
  const TH_OP = { drug: "drug", "herbal-or-drug": "all", food: "food", cosmetic: "cosmetic", device: "device", advert: "advert" };
  const enc = encodeURIComponent;
  /** the Worker's limit for one POST /api/pc/batch (backend/src/pc.js BATCH_MAX) */
  const BATCH_MAX = 16;
  /**
   * Which derived fact goes to which source. @param {{regs?: {norm: string, country: string, kind: string}[], gtins?: string[],
   * names?: string[], ingredients?: string[]}} f
   */
  function planLookups(f) {
    const out = [], seen = new Set();
    const push = (source, path, fact, kind) => {
      const k = source + "|" + path;
      if (seen.has(k)) return;
      seen.add(k);
      const u = new URL(path, "https://x.invalid/"), req = { source, q: u.searchParams.get("q") || "" };
      for (const x of ["op", "by"]) if (u.searchParams.get(x)) req[x] = u.searchParams.get(x);
      // req = this lookup inside the one POST /api/pc/batch of a tap; Health Canada is searched on the device (local: true)
      out.push(source === "healthcanada" ? { source, path, fact, kind, req, local: true } : { source, path, fact, kind, req });
    };
    for (const r of (f.regs || []).slice(0, 4)) {
      if (r.country === "TH" && TH_OP[r.kind]) push("thfda", `/api/pc/thfda?op=${TH_OP[r.kind]}&q=${enc(r.norm)}`, r.norm, "reg");
      if (r.country === "SG" && r.kind === "sin") push("hsa", `/api/pc/hsa?q=${enc(r.norm)}`, r.norm, "reg");
      if (r.country === "US" && r.kind === "ndc") { push("ndc", `/api/pc/ndc?q=${enc(r.norm)}`, r.norm, "reg"); push("label", `/api/pc/label?by=ndc&q=${enc(r.norm)}`, r.norm, "reg"); }
    }
    for (const g of (f.gtins || []).slice(0, 2)) push("openfda", `/api/pc/openfda?by=gtin&q=${enc(g)}`, g, "gtin");
    for (const n of (f.names || []).slice(0, 2)) {
      for (const s of ["openfda", "safetygate", "rasff", "healthcanada"]) push(s, `/api/pc/${s}?by=name&q=${enc(n)}`, n, "name");
      if ((f.regs || []).some(r => r.country === "US")) push("dailymed", `/api/pc/dailymed?q=${enc(n)}`, n, "name");
    }
    for (const i of (f.ingredients || []).slice(0, 2)) push("rxnav", `/api/pc/rxnav?q=${enc(i)}`, i, "ingredient");
    return out.slice(0, BATCH_MAX); // one POST /api/pc/batch holds at most 16; earlier entries (numbers, barcodes) come first
  }
  /**
   * One card row from a Worker answer. state: signal (a risk signal to show) | found (a register fact) | none (checked,
   * nothing found) | could_not_check. @param {{source: string, fact: string, kind: string}} step @param {any} resp {ok, status, j} @param {string} today
   */
  function rowFor(step, resp, today) {
    const j = resp && resp.j;
    if (!resp || !resp.ok || !j || j.ok === false) return { ...step, state: "could_not_check", reason: (j && j.reason) || (resp && resp.status === 0 ? "no_server" : "upstream"), date: today };
    if (!Array.isArray(j.items)) return { ...step, state: "could_not_check", reason: "bad_response", date: today }; // not the documented shape
    const items = j.items;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(j.fetched || "")) ? String(j.fetched) : dayOf(j.fetched) || today; // a data date stays as it is
    const base = { ...step, date, items: items.slice(0, 3), credit: j.credit || "", testing_only: !!j.testing_only, total: Number(j.total) || items.length,
      window_from: /^\d{4}-\d{2}-\d{2}$/.test(String(j.window_from || "")) ? String(j.window_from) : "" };
    if (step.source === "thfda") {
      if (!items.length) return { ...base, state: "signal", signal: "not_in_register" };
      const bad = items.find(x => x.status === "cancelled" || x.status === "expired");
      return bad ? { ...base, state: "signal", signal: "register_status", status: bad.status, status_text: bad.status_text } : { ...base, state: "found", signal: "registered" };
    }
    if (["hsa", "ndc", "label", "dailymed", "rxnav"].includes(step.source)) return { ...base, state: items.length ? "found" : "none" };
    // recall / alert sources: a hit by name is a POSSIBLE match the user compares; a hit by barcode is stronger
    return items.length ? { ...base, state: "signal", signal: step.kind === "gtin" ? "recall_gtin" : "recall_name" } : { ...base, state: "none" };
  }

  /** Today on the device's own calendar (not UTC: in Bangkok UTC is still yesterday before 07:00). */
  const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  /** Worker timestamp -> local calendar day. @param {any} iso */
  const dayOf = iso => { const t = Date.parse(String(iso || "")); return Number.isNaN(t) ? "" : localDay(new Date(t)); };

  /* ======================================================================================================== */
  /* browser UI                                                                                                */
  /* ======================================================================================================== */
  function mount(W) {
    if (typeof document === "undefined") return;
    const start = () => {
      const slot = document.querySelector("#pcClaimsSlot");
      if (!slot || !document.querySelector("#tab-pc")) return;
      ui(W, slot);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  }

  function ui(W, slot) {
    const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? String(v[x]) : m));
    const T = (k, th, v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : fill(th, v));
    const lang = () => (W.LQI18N && typeof W.LQI18N.lang === "string" ? W.LQI18N.lang : "th");
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const raw = s => `<span translate="no">${esc(s)}</span>`;
    /** Escaped translation whose `rv` values (numbers, names, label words as read) stay as translate="no" spans, so a Thai
     *  number never counts as untranslated text in EN / ZH. */
    const TX = (k, th, v = {}, rv = {}) => {
      const vals = Object.values(rv), mk = Object.fromEntries(Object.keys(rv).map((x, i) => [x, "\u0001" + i + "\u0001"]));
      return esc(T(k, th, { ...v, ...mk })).replace(/\u0001(\d+)\u0001/g, (_, n) => raw(vals[Number(n)]));
    };
    const link = (href, text) => (/^https:\/\//.test(String(href || "")) ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>` : esc(text));
    /** @type {any} */
    const st = { text: "", codes: [], tables: null, loading: null, local: null, plan: [], rows: null, busy: false, matcher: null, hc: null, mode: "" };
    W.__LQ_PCL = { st };

    const SRC = () => ({
      thfda: T("md.pc.l.s.thfda", "ทะเบียน อย. (ไทย)"), hsa: T("md.pc.l.s.hsa", "ทะเบียนยา HSA (สิงคโปร์)"), openfda: T("md.pc.l.s.openfda", "รายการเรียกคืน openFDA (สหรัฐฯ)"),
      ndc: T("md.pc.l.s.ndc", "รหัสยา NDC ของ openFDA (สหรัฐฯ)"), label: T("md.pc.l.s.label", "ฉลากยา openFDA (สหรัฐฯ)"), dailymed: T("md.pc.l.s.dailymed", "DailyMed (สหรัฐฯ)"),
      rxnav: T("md.pc.l.s.rxnav", "RxNorm ชื่อตัวยาสากล (สหรัฐฯ)"), safetygate: T("md.pc.l.s.safetygate", "EU Safety Gate (สหภาพยุโรป)"),
      rasff: T("md.pc.l.s.rasff", "RASFF อาหารและอาหารสัตว์ (สหภาพยุโรป)"), healthcanada: T("md.pc.l.s.healthcanada", "การเรียกคืนสินค้าของ Health Canada (แคนาดา)")
    });
    const REASON = () => ({ no_server: T("md.pc.l.r.noServer", "เว็บไซต์นี้ยังไม่ได้ตั้งเซิร์ฟเวอร์ LENSIQ สำหรับการตรวจนี้"),
      switched_off: T("md.pc.l.r.off", "ผู้ดูแลระบบปิดแหล่งนี้ไว้"), link_out: T("md.pc.l.r.link", "ปิดการค้นอัตโนมัติไว้ ตรวจเองที่ oryor.com"),
      timeout: T("md.pc.l.r.timeout", "แหล่งข้อมูลตอบช้าเกินไป"), rate_limited: T("md.pc.l.r.rate", "มีการค้นมากเกินไป ลองใหม่ในอีกสักครู่"),
      bad_response: T("md.pc.l.r.bad", "แหล่งข้อมูลตอบกลับในรูปแบบที่อ่านไม่ได้"),
      testing_only_off: T("md.pc.l.r.testingOff", "ปิดในบิลด์นี้ เพราะยังไม่ได้ยืนยันสิทธิ์การใช้ข้อมูลของแหล่งนี้"),
      needs_setup: T("md.pc.l.r.setup", "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าสำหรับแหล่งนี้"), index_not_ready: T("md.pc.l.r.notReady", "ข้อมูลของแหล่งนี้ยังไม่พร้อมบนเซิร์ฟเวอร์") });
    const ISSUE = () => ({ contains: T("md.pc.l.i.contains", "ตรวจพบ {s}"), "exceeds-limit": T("md.pc.l.i.exceeds", "ปริมาณ {s} เกินเกณฑ์"),
      unregistered: T("md.pc.l.i.unreg", "ไม่ได้ขึ้นทะเบียน"), "no-number": T("md.pc.l.i.noNumber", "ไม่มีเลขทะเบียนบนฉลาก"),
      "number-of-other-product": T("md.pc.l.i.otherNo", "ใช้เลขทะเบียนของสินค้าอื่น"), "no-dates": T("md.pc.l.i.noDates", "ไม่ระบุวันผลิตหรือวันหมดอายุ"),
      recall: T("md.pc.l.i.recall", "สั่งเรียกคืน"), "fake-number": T("md.pc.l.i.fake", "เลขทะเบียนไม่มีในระบบ") });
    const STATUS = () => ({ active: T("md.pc.l.st.active", "คงอยู่"), cancelled: T("md.pc.l.st.cancelled", "ยกเลิก"), expired: T("md.pc.l.st.expired", "หมดอายุ"),
      pending: T("md.pc.l.st.pending", "รอดำเนินการ"), unknown: T("md.pc.l.st.unknown", "ไม่ทราบสถานะ") });
    const VIA = () => ({ exact: T("md.pc.l.via.exact", "ชื่อตรงกัน"), base: T("md.pc.l.via.base", "ชื่อตรงกันเมื่อไม่นับความแรง"),
      ocr: T("md.pc.l.via.ocr", "ชื่อใกล้เคียง (ตัวอักษรอาจอ่านผิด)"), edit: T("md.pc.l.via.edit", "ชื่อใกล้เคียง ต่างกันหนึ่งตัวอักษร") });

    async function tables() {
      if (st.tables) return st.tables;
      if (!st.loading) {
        const get = async u => { const r = await fetch(u, { credentials: "same-origin" }); if (!r.ok) throw new Error(u); return r.json(); };
        st.loading = Promise.all([get("vendor/pc-drugs/nlem-2567.json"), get("vendor/pc-alerts/th.json")])
          .then(([nlem, alerts]) => (st.tables = { nlem: buildNlemIndex(nlem), alerts }))
          .catch(() => (st.tables = { error: true }));
      }
      return st.loading;
    }
    /** Static shards from this site, loaded on demand and kept per page (failed loads are retried). @param {string} base */
    function shardLoader(base) {
      const cache = new Map();
      return (/** @type {string} */ name) => {
        if (!cache.has(name)) {
          cache.set(name, fetch(base + name + ".json", { credentials: "same-origin" }).then(r => { if (!r.ok) throw new Error(name); return r.json(); })
            .catch(e => { cache.delete(name); throw e; }));
        }
        return cache.get(name);
      };
    }
    /** TMT matching (owner decision 2026-11-10, review S7): only the index shards a label needs are loaded (vendor/pc-drugs/tmt/),
     *  never the whole table; the same matchTmt runs over them. */
    function tmtMatcher() {
      if (st.matcher) return st.matcher;
      const load = shardLoader("vendor/pc-drugs/tmt/");
      let meta = null;
      st.mode = "shards";
      st.matcher = async (/** @type {string} */ text) => { meta = meta || await load("meta"); return matchTmtSharded(text, meta, load, { max: 3 }); };
      return st.matcher;
    }
    /** Health Canada recalls on the device (owner decision 2026-11-10, review S5): word shards + item chunks, nothing sent. */
    function hcSearch() {
      if (st.hc) return st.hc;
      const load = shardLoader("vendor/pc-recalls/hc/");
      let meta = null;
      st.hc = async (/** @type {string} */ q) => {
        meta = meta || await load("meta");
        const r = await hcSearchSharded(q, meta, p => load("t/" + p), n => load("i/" + n));
        return { ok: true, items: r.items, total: r.total, fetched: meta.source.as_of, window_from: meta.source.window_from, credit: meta.credit.en, testing_only: false };
      };
      return st.hc;
    }
    const facts = () => {
      const P = W.LQPC;
      const regs = P && P.findRegNumbers ? P.findRegNumbers(st.text || "").map(r => ({ norm: r.norm, country: r.country, kind: r.kind })) : [];
      const gtins = st.codes.map(c => (P && P.barcodeInfo ? P.barcodeInfo(c.rawValue, c.format) : {})).filter(c => c.gtin && c.gtinValid).map(c => c.gtin);
      const tmt = st.local && st.local.tmt ? st.local.tmt : [];
      return { regs, gtins, names: tmt.filter(m => m.via !== "edit").map(m => m.name), ingredients: [...new Set(tmt.map(m => m.ingredients[0].name))], tmt };
    };

    async function run(text, codes) {
      st.text = String(text || ""); st.codes = Array.isArray(codes) ? codes : []; st.rows = null;
      if (!st.text.trim() && !st.codes.length) { slot.innerHTML = ""; return; }
      const t = await tables();
      const local = { tmt: [], nlem: [], alerts: [], claims: null, tablesError: !!t.error };
      if (!t.error) {
        try { local.tmt = await tmtMatcher()(st.text); } catch { local.tablesError = true; local.tmt = []; }
        local.nlem = local.tmt.map(m => ({ name: m.name, ing: m.ingredients[0].name, hits: nlemFor(m.ingredients[0].name, t.nlem) }));
        const P = W.LQPC;
        local.alerts = alertsFor(st.text, t.alerts, P && P.findRegNumbers ? P.findRegNumbers(st.text).map(r => r.norm) : []);
      }
      st.local = local;
      const f = facts();
      local.category = inferCategory(f);
      if (W.LQClaims && st.text.trim()) { try { local.claims = W.LQClaims.detect(st.text, { category: local.category }); } catch { local.claims = null; } }
      st.plan = planLookups(f);
      render();
    }
    W.__LQ_PCL.run = run;

    /** One POST /api/pc/batch per tap (review S6): the Worker fans out and counts ONE rate-limit hit. Derived facts only. */
    async function check() {
      if (st.busy || !st.plan.length) return;
      st.busy = true; render();
      const api = W.LQApi && W.LQApi.enabled && W.LQApi.enabled();
      const today = localDay();
      const remote = st.plan.filter(p => !p.local), local = st.plan.filter(p => p.local);
      const localRows = Promise.all(local.map(async step => {
        try { return rowFor(step, { ok: true, status: 200, j: await hcSearch()(step.req.q) }, today); }
        catch { return rowFor(step, { ok: false, status: 0, j: { reason: "bad_response" } }, today); }
      }));
      let rows;
      if (!remote.length) rows = [];
      else if (!api) rows = remote.map(step => rowFor(step, { ok: false, status: 0, j: null }, today));
      else {
        const f = W.__LQ_PC_FETCH || W.fetch.bind(W);
        const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ac ? setTimeout(() => ac.abort(), 30000) : null;
        let status = 0, j = null;
        try {
          const r = await f(W.LQApi.url("/api/pc/batch"), { method: "POST", credentials: "omit", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lookups: remote.map(p => p.req) }), signal: ac ? ac.signal : undefined });
          status = r.status;
          try { j = await r.json(); } catch { j = null; }
        } catch { status = 0; } finally { if (timer) clearTimeout(timer); }
        const results = j && j.ok === true && Array.isArray(j.results) && j.results.length === remote.length ? j.results : null;
        const why = status === 429 ? "rate_limited" : status === 0 ? "timeout" : "bad_response";
        rows = remote.map((step, k) => (results ? rowFor(step, { ok: results[k] && results[k].ok === true, status: Number(results[k] && results[k].status) || 0, j: results[k] }, today)
          : rowFor(step, { ok: false, status, j: { reason: why } }, today)));
      }
      const lr = await localRows;
      st.rows = st.plan.map(p => (p.local ? lr[local.indexOf(p)] : rows[remote.indexOf(p)]));
      st.busy = false;
      render();
    }
    W.__LQ_PCL.check = check;

    function render() {
      const L = st.local || { tmt: [], nlem: [], alerts: [], claims: null };
      const S = SRC(), I = ISSUE(), V = VIA();
      let h = `<section class="card md-res" id="pcLookup" data-k="info"><h3>${esc(T("md.pc.l.h", "สัญญาณเสี่ยงและข้อมูลจากแหล่งข้อมูลทางการ"))}</h3>` +
        `<p class="hint">${esc(T("md.pc.l.lead", "แสดงเฉพาะข้อเท็จจริงที่พบ พร้อมแหล่งที่มาและวันที่ ไม่ใช่คำตัดสินเกี่ยวกับตัวสินค้า"))}</p>`;
      // 1. curated Thai warning list (on device)
      if (L.alerts.length) {
        h += `<div class="md-cands" id="pcAlerts">` + L.alerts.map(a => {
          const e = a.entry, what = e.issues.map(c => fill(I[c] || c, { s: e.substances.join(", ") })).join(" · ");
          const head = a.via === "reg" ? T("md.pc.l.alertReg", "สัญญาณเสี่ยง: เลขทะเบียนนี้อยู่ในประกาศของ อย. เมื่อ {date}", { date: e.source_date })
            : T("md.pc.l.alertName", "สัญญาณเสี่ยง: ชื่อสินค้านี้ตรงกับสินค้าในประกาศของ อย. เมื่อ {date} เทียบเลขทะเบียนกับกล่อง", { date: e.source_date });
          const names = raw(e.name_th || e.name_en) + (e.name_th && e.name_en ? " · " + raw(e.name_en) : "") + (e.reg ? " · " + raw(e.reg) : "");
          return `<div class="md-cand" data-signal="alert-th" data-via="${a.via}"><p class="md-status" data-kind="err">${esc(head)}</p><p class="md-imp">${names}</p>` +
            `<p>${esc(what)}</p><p class="hint">${link(e.source_url, T("md.pc.l.alertSrc", "อ่านประกาศของ อย."))}</p></div>`;
        }).join("") + `</div>`;
      }
      // 2. what it is (TMT) + NLEM
      if (L.tmt.length) {
        h += `<h4>${esc(T("md.pc.l.tmtH", "ชื่อการค้าที่พบในบัญชียามาตรฐานไทย (TMT)"))}</h4><div class="md-cands" id="pcTmt">` + L.tmt.map((m, k) => {
          const nl = (L.nlem[k] && L.nlem[k].hits) || [];
          return `<div class="md-cand" data-tmt="${esc(m.via)}"><p class="md-imp">${raw(m.name)} → ${raw(m.ingredients[0].name)}</p>` +
            `<p class="hint">${esc(V[m.via] || m.via)}${m.via === "exact" ? "" : " · " + TX("md.pc.l.tmtRead", "อ่านได้: {t}", {}, { t: m.matched })}</p>` +
            (m.strengths.length ? `<p>${esc(T("md.pc.l.tmtStr", "ความแรงที่มีในบัญชี:"))} ${raw(m.strengths.slice(0, 4).join(" · "))}</p>` : "") +
            (m.forms.length ? `<p>${esc(T("md.pc.l.tmtForm", "รูปแบบยา:"))} ${raw(m.forms.join(" · "))}</p>` : "") +
            (m.ambiguous ? `<p class="md-status" data-kind="warn">${esc(T("md.pc.l.tmtAmb", "ชื่อนี้มีหลายตัวยาในบัญชี: {list} ตรวจตัวยาบนกล่อง",
              { list: m.ingredients.slice(0, 3).map(x => x.name).join(" / ") }))}</p>` : "") +
            `<p class="hint">${nl.length ? TX("md.pc.l.nlemIn", "ตัวยานี้อยู่ในบัญชียาหลักแห่งชาติ 2567 บัญชี {cat}", {}, { cat: nl.map(x => x.category).join(", ") })
              : esc(T("md.pc.l.nlemOut", "ไม่พบตัวยานี้ในบัญชียาหลักแห่งชาติ 2567 (เป็นข้อมูลเท่านั้น ไม่ใช่สัญญาณเสี่ยง)"))}</p></div>`;
        }).join("") + `</div><p class="hint">${esc(T("md.pc.l.tmtAsOf",
          "ข้อมูล TMT ณ วันที่ 17 ก.พ. 2563 ยาที่ขึ้นทะเบียนหลังจากนั้นจะไม่มีในบัญชี การไม่พบชื่อไม่ได้บอกอะไรเกี่ยวกับทะเบียนของสินค้า"))}</p>`;
      }
      // 3. over-claim risk signals (P3, on device)
      if (L.claims && L.claims.length) {
        const lg = lang() === "en" ? "en" : lang() === "zh" ? "zh" : "th";
        h += `<h4>${esc(T("md.pc.l.claimsH", "สัญญาณเสี่ยงคำโฆษณาเกินจริง ({n})", { n: L.claims.length }))}</h4><ul class="md-list" id="pcClaims">` +
          L.claims.slice(0, 8).map(c => `<li data-rule="${esc(c.rule_id)}">${c.absence ? TX("md.pc.l.claimMissing", "ไม่พบข้อความคำเตือนที่กำหนด: {m}", {}, { m: (c.missing || []).join(" · ") })
            : `<q translate="no">${esc(c.text)}</q>`} · ${esc((c.explain && c.explain[lg]) || c.rule_id)}${c.url ? " " + link(c.url, T("md.pc.l.basis", "ที่มาของกฎ")) : ""}</li>`).join("") + `</ul>` +
          (L.category ? "" : `<p class="hint">${esc(T("md.pc.l.claimsCat", "ไม่ทราบประเภทสินค้า จึงตรวจกฎของทุกประเภท"))}</p>`);
      } else if (L.claims) h += `<p class="hint" id="pcClaimsNone">${esc(T("md.pc.l.claimsNone", "ไม่พบคำที่เข้าข่ายกฎคำโฆษณาเกินจริงในข้อความที่อ่านได้ (ตรวจเฉพาะข้อความ ไม่ใช่คำรับรอง)"))}</p>`;
      // 4. official sources (opt-in)
      if (st.plan.length) {
        const sentPlan = st.plan.filter(p => !p.local);
        const used = [...new Set(sentPlan.map(p => p.source))].map(s => S[s] || s);
        const sent = [...new Set(sentPlan.map(p => p.fact))];
        h += `<h4>${esc(T("md.pc.l.offH", "ตรวจกับแหล่งข้อมูลทางการ"))}</h4>`;
        if (!st.rows) {
          h += `<p class="hint" id="pcLookupNotice">${TX("md.pc.l.notice", "เมื่อกดปุ่ม จะส่งเฉพาะ {facts} ผ่านเซิร์ฟเวอร์ LENSIQ ไปยัง: {sources} ไม่ส่งรูปหรือข้อความฉลาก",
            { sources: used.join(", ") }, { facts: sent.join(", ") })}</p><div class="md-row"><button class="btn primary" type="button" id="pcLookupGo"${st.busy ? " disabled" : ""}>` +
            `${esc(st.busy ? T("md.pc.l.busy", "กำลังตรวจ…") : T("md.pc.l.go", "ตรวจกับแหล่งข้อมูลทางการ"))}</button></div>`;
        } else h += `<div class="md-cands" id="pcLookupRows">${st.rows.map(rowHtml).join("")}</div>`;
      } else if (st.local) h += `<p class="hint" id="pcLookupNothing">${esc(T("md.pc.l.nothing", "ยังไม่มีเลขทะเบียน บาร์โค้ด หรือชื่อยาที่รู้จัก จึงยังตรวจกับแหล่งข้อมูลทางการไม่ได้"))}</p>`;
      // 5. could not check
      const cant = [];
      if (L.tablesError) cant.push(T("md.pc.l.cTables", "โหลดตารางข้อมูลยาและรายการเตือนในเครื่องไม่ได้"));
      if (st.rows) for (const r of st.rows.filter(x => x.state === "could_not_check")) cant.push(`${S[r.source] || r.source}: ${(REASON()[r.reason]) || T("md.pc.l.r.down", "แหล่งข้อมูลไม่ตอบ")}`);
      else if (st.plan.length) cant.push(T("md.pc.l.cNotYet", "ยังไม่ได้ตรวจกับแหล่งข้อมูลทางการ (ต้องกดปุ่มด้านบนก่อน)"));
      if (cant.length) h += `<div id="pcLookupCant"><h4>${esc(T("md.pc.l.cantH", "ตรวจไม่ได้"))}</h4><ul class="md-list">${cant.map(x => `<li data-cant>${esc(x)}</li>`).join("")}</ul></div>`;
      // P7: the opt-in "ask AI" step (lensiq-pc-ai.js) paints here, under the on-device and official results, never over them
      h += `<div id="pcAiSlot"></div>`;
      h += `<p class="hint">${esc(T("md.pc.l.credit",
        "ที่มา: TMT ฉบับ 17 ก.พ. 2563 โดย สมสท. (data.go.th, CC BY) ดัดแปลงเป็นตารางค้นหา · บัญชียาหลักแห่งชาติ 2567 (ราชกิจจานุเบกษา; ไฟล์ thai-nlem-api, MIT) · " +
        "รายการเตือนสรุปข้อเท็จจริงจากประกาศของ อย."))}</p></section>`;
      slot.innerHTML = h;
      try { W.dispatchEvent(new CustomEvent("lq-pc-card")); } catch { /* old browser: no AI step */ }
      const go = slot.querySelector("#pcLookupGo");
      if (go) go.addEventListener("click", check);
    }
    function rowHtml(r) {
      const S = SRC(), name = S[r.source] || r.source, it = (r.items || [])[0] || {}, ST = STATUS();
      let msg = "", kind = "", body = "";
      if (r.state === "could_not_check") { msg = TX("md.pc.l.row.cant", "ตรวจไม่ได้: {src}", { src: name }); kind = "warn"; }
      else if (r.signal === "not_in_register") { msg = TX("md.pc.l.row.notReg", "สัญญาณเสี่ยง: ไม่พบเลข {fact} ในทะเบียน อย. เมื่อ {date} ตรวจซ้ำที่ oryor.com หรือแอป ORYOR Smart",
        { date: r.date }, { fact: r.fact }); kind = "err"; }
      else if (r.signal === "register_status") { msg = TX("md.pc.l.row.status", "สัญญาณเสี่ยง: พบใน {src} เมื่อ {date} สถานะ {st}", { src: name, date: r.date, st: ST[r.status] ||
        r.status }); kind = "err"; }
      else if (r.signal === "registered") { msg = TX("md.pc.l.row.reg", "พบใน {src} เมื่อ {date} สถานะ {st} เทียบชื่อที่ขึ้นทะเบียนกับกล่อง", { src: name, date: r.date, st: ST[it.status] ||
        ST.unknown }); kind = "ok"; }
      else if (r.signal === "recall_gtin") { msg = TX("md.pc.l.row.recGtin", "สัญญาณเสี่ยง: บาร์โค้ดนี้พบใน {src} เมื่อ {date}", { src: name, date: it.date || r.date }); kind = "err"; }
      else if (r.signal === "recall_name") { msg = TX("md.pc.l.row.recName",
        "สัญญาณเสี่ยงที่ต้องเทียบ: พบรายการชื่อคล้ายกันใน {src} ({n} รายการ) ล่าสุดเมื่อ {date} เทียบชื่อและผู้ผลิตกับกล่อง", { src: name, n: r.total, date: it.date || r.date }); kind = "warn"; }
      else if (r.state === "found") { msg = TX("md.pc.l.row.found", "พบใน {src} เมื่อ {date}", { src: name, date: r.date }); kind = "ok"; }
      else { msg = TX("md.pc.l.row.none", "ไม่พบใน {src} ณ วันที่ {date} (ไม่ได้แปลว่าสินค้าปลอดภัย)", { src: name, date: r.date }); kind = ""; }
      for (const x of (r.items || []).slice(0, 3)) {
        const title = x.name_th || x.name_en || x.title || "";
        body += `<li>${raw([x.lcnno || x.ref, title, x.name_en && x.name_th ? x.name_en : "", x.reason, x.status_text, x.ingredients && x.ingredients.join ? x.ingredients.join(" + ") : x.ingredients]
          .filter(Boolean).join(" · "))}${x.date ? " · " + raw(x.date) : ""}${x.url ? " " + link(x.url, T("md.pc.l.open", "เปิดหน้าแหล่งข้อมูล")) : ""}</li>`;
      }
      return `<div class="md-cand" data-source="${esc(r.source)}" data-state="${esc(r.state)}"${r.signal ? ` data-signal="${esc(r.signal)}"` : ""}>` +
        `<p class="md-status"${kind ? ` data-kind="${kind}"` : ""}>${msg}</p>${body ? `<ul class="md-list">${body}</ul>` : ""}` +
        (r.window_from ? `<p class="hint" data-window>${esc(T("md.pc.l.hcWindow",
          "ค้นในรายการเรียกคืนที่ปรับปรุงตั้งแต่ {from} ถึง {to} (ไฟล์ข้อมูลของ Health Canada ค้นในเครื่องนี้ ไม่ได้ส่งข้อมูลออก)",
          { from: r.window_from, to: r.date }))}</p>` : "") +
        `<p class="hint">${TX(r.local ? "md.pc.l.searched" : "md.pc.l.sent", r.local ? "คำที่ค้นในเครื่อง: {fact}" : "ข้อมูลที่ส่ง: {fact}", {}, { fact: r.fact })}` +
        `${r.testing_only ? " · " + esc(T("md.pc.l.testing", "แหล่งนี้ใช้เพื่อทดสอบเท่านั้น (รอยืนยันสิทธิ์การใช้ข้อมูล)")) : ""}</p>` +
        (r.credit ? `<p class="hint" lang="en" translate="no">${esc(r.credit)}</p>` : "") + `</div>`;
    }

    W.addEventListener("lq-pc-text", ev => {
      const d = /** @type {any} */ (ev).detail || {};
      const pc = W.__LQ_PC && W.__LQ_PC.st;
      run(d.text || "", Array.isArray(d.codes) ? d.codes : (pc && pc.codes && pc.codes.codes) || []);
    });
    W.addEventListener("lq-lang", () => { if (st.local) render(); });
    W.addEventListener("pagehide", () => { st.text = ""; st.codes = []; st.local = null; st.rows = null; slot.innerHTML = ""; });
  }

  return { normKey, baseKey, ocrFold, regKey, regCandidates, buildTmtIndex, matchTmt, buildNlemIndex, nlemFor, alertsFor, inferCategory, planLookups, rowFor, localDay, STOP, mount,
    shardOf, tmtKeys, buildTmtShards, indexFromShards, tmtShardsFor, matchTmtSharded, hcFold, buildHcShards, hcSearchSharded };
});
