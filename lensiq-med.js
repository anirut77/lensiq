/* lensiq-med.js — LQMed: pure logic of the LENSIQ medicine checker (medicine.html). Browser: window.LQMed · Node:
 * module.exports (no DOM here; unit-tested in tests/unit/med.test.js).
 *
 * WHAT IT IS: a drug-information reference / label reader. It parses codes the user typed, scanned or OCR'd, finds
 * CANDIDATE loose pills in NLM Pillbox data from features the user entered, and lays out sourced label text verbatim.
 * WHAT IT IS NOT: no diagnosis, no "you should take", no dose calculator, no ranking / "best for", no buy links, no
 * single definitive pill answer, no image classifier. Images never reach this module (it works on text only).
 *
 * CODES (pure)
 *   normText(s)                       NFKC, Thai digits -> 0-9, upper-case, collapse spaces
 *   parseThaiReg(s) -> {ok, digit, letter, seq, year, yearBE, suffix, norm}|{ok:false}   e.g. "1A 15/50", "2A 3/60 (NG)"
 *   findThaiReg(text) -> [parseThaiReg results] found anywhere in OCR / free text (OCR O->0, I->1 repaired in numbers)
 *   parseFoodNo(s) -> {ok, digits, norm:"XX-X-XXXXX-X-XXXX", dashed}   13-digit Thai food / supplement อย. number
 *   eanValid(digits) · parseBarcode(raw) -> {ok, type:'ean13'|'ean8'|'upca'|'other', digits, valid, thai, ndc10, ndcs[]}
 *   ndcSplits(ndc10) -> ["4-4-2","5-3-2","5-4-1" hyphenated forms] · parseNdc(s) -> {ok, ndc, product}
 *   classify(text, {from}) -> [{kind:'thai-reg'|'food'|'barcode'|'ndc'|'name', ...}]   what the user's input most likely is
 * LOOSE PILL CANDIDATES (pure, over vendor/pillbox/pillbox-2020-v1.json)
 *   COLORS, SHAPES                    picker values (Pillbox spelling)
 *   normImprint(s) -> "A12;B" sides   · imprintScore(query, rowImprint) -> {s, how}
 *   candidates(data, {imprint, color, shape, size, score}, {max=25, min=3}) -> {list, loose, withheld, reason, padded}
 *     strict pass = every chosen feature, shown only when it gives >= `min` rows. Otherwise an imprint-only pass is shown
 *     (padded:true) in which EVERY row carries loose:true, so no 1-2 rows stand out as "the" match. Fewer than `min`
 *     in total -> list [] and withheld = the count (never 1 or 2 answers).
 * ONLINE (opt-in by the page; text only)
 *   OPENFDA, RXNAV, cleanTerm(s) · openfdaLabelUrl({name|ndc|setid}) · rxnavApproxUrl(term) · rxnavPropsUrl(rxcui)
 *   rxnavCandidates(json) -> [{rxcui, score, name}] · labelSections(openfdaResult, {maxChars}) -> {title, generic, brand,
 *     sections:[{id, text, cut}], setid, effective, source, rx} verbatim label text, fixed order, nothing rephrased
 *   thfdaStatus(cncnm) -> 'active'|'cancelled'|'expired'|'pending'|'unknown' · thfdaKind(thakindnm) -> 'dangerous'|
 *     'special'|'household'|'nondangerous'|'unknown'
 *   dailymedUrl(setid) · pertentoUrl(newcode) · thfdaSearchUrl()
 * SAFETY (pure)
 *   emergency(text) -> {poison, self} — overdose / poisoning / self-harm wording in TH / EN / ZH -> the page shows the
 *     emergency card (1669, 1367, and 1323 for self-harm wording) before anything else
 * HISTORY (pure; the page keeps it only when the user opts in)
 *   historyAdd(list, entry, max=200) -> new list (newest first, de-duplicated by kind+q)
 *   toCSV(rows, cols) — formula-injection safe
 */
(function (root, factory) {
  const m = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = m; else /** @type {any} */ (root).LQMed = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------------- text ---------------- */
  const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
  function normText(s) {
    let t = String(s == null ? "" : s).normalize("NFKC");
    t = t.replace(/[๐-๙]/g, c => String(THAI_DIGITS.indexOf(c)));
    return t.toUpperCase().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, " ").trim();
  }
  const DIGIT_FIX = { O: "0", Q: "0", D: "0", I: "1", L: "1", "|": "1", Z: "2", S: "5", B: "8" };
  const fixDigits = s => s.replace(/[OQDILZSB|]/g, c => DIGIT_FIX[c]);

  /* ---------------- Thai drug registration number ---------------- */
  // <1|2><letter> <seq>/<BE yy> [(suffix)] — the Thai FDA web service accepts the spaced form "1A 333/56".
  // Traditional-medicine series (G, K) are also seen without the leading digit. Meanings of the digit / letter are not
  // asserted here (unverified); the only derived value is the Buddhist-Era year.
  const REG_RE = /(?:^|[^0-9A-Z])([12])?\s*([A-Z])\s*([0-9OIL]{1,5})\s*\/\s*([0-9OIL]{2})(?:\s*\(\s*([A-Z]{1,3})\s*\))?(?![0-9])/g;
  function regFrom(m) {
    const digit = m[1] || "", letter = m[2], seq = String(parseInt(fixDigits(m[3]), 10)), yy = fixDigits(m[4]);
    if (!/^\d+$/.test(seq) || !/^\d{2}$/.test(yy) || seq === "0") return null;
    if (!digit && !/[GK]/.test(letter)) return null;
    // a bare G / K right after a lot / expiry / batch word is a lot or date code ("LOT K 12/25", "EXP G 3/24"), not a registration
    if (!digit && /(?:LOT|EXP|EXPIRY|MFG|MFD|MFT|BATCH|B\.?\s?NO|NO|ครั้งที่ผลิต|วันหมดอายุ|หมดอายุ|ผลิต)\s*[.:#]?\s*$/.test(m.input.slice(0, m.index + m[0].indexOf(letter)))) return null;
    const suffix = m[5] || "";
    // without the leading digit the reading is less certain (callers rank these after the digit-led ones)
    return { ok: true, digit, letter, seq, year: yy, yearBE: 2500 + Number(yy), suffix, uncertain: !digit, norm: `${digit}${letter} ${seq}/${yy}${suffix ? ` (${suffix})` : ""}` };
  }
  function parseThaiReg(s) {
    const t = normText(s);
    REG_RE.lastIndex = 0;
    const m = REG_RE.exec(t);
    const r = m ? regFrom(m) : null;
    return r || { ok: false };
  }
  function findThaiReg(text) {
    const t = normText(text), out = [], seen = new Set();
    REG_RE.lastIndex = 0;
    let m;
    while ((m = REG_RE.exec(t))) {
      const r = regFrom(m);
      if (r && !seen.has(r.norm)) { seen.add(r.norm); out.push(r); }
      if (m[0].length === 0) REG_RE.lastIndex++;
    }
    return out.filter(r => !r.uncertain).concat(out.filter(r => r.uncertain));
  }

  /* ---------------- food / supplement number (13 digits, XX-X-XXXXX-X-XXXX) ---------------- */
  const FOOD_RE = /(?:^|[^0-9])(\d{2})([-\s.]?)(\d)\2(\d{5})\2(\d)\2(\d{4})(?![0-9])/;
  function parseFoodNo(s) {
    const t = normText(s), m = FOOD_RE.exec(t);
    if (!m) return { ok: false };
    const digits = m[1] + m[3] + m[4] + m[5] + m[6];
    return { ok: true, digits, dashed: !!m[2], norm: `${m[1]}-${m[3]}-${m[4]}-${m[5]}-${m[6]}` };
  }

  /* ---------------- barcodes, NDC ---------------- */
  function eanValid(d) {
    if (!/^\d{8}$|^\d{12,14}$/.test(d)) return false;
    let sum = 0;
    const body = d.slice(0, -1);
    for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === Number(d[d.length - 1]);
  }
  function ndcSplits(n10) {
    const d = String(n10 || "").replace(/\D/g, "");
    if (d.length !== 10) return [];
    return [`${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`, `${d.slice(0, 5)}-${d.slice(5, 8)}-${d.slice(8)}`, `${d.slice(0, 5)}-${d.slice(5, 9)}-${d.slice(9)}`];
  }
  function parseBarcode(raw) {
    let d = String(raw || "").replace(/[\s\u001d]/g, "");
    // GS1 element string (DataMatrix / GS1-128): (01) + GTIN-14 -> GTIN-13 when it starts with 0
    const gs1 = /^\(?01\)?(\d{14})/.exec(d);
    if (gs1 && d.length > 14) d = gs1[1][0] === "0" ? gs1[1].slice(1) : gs1[1];
    if (!/^\d{6,14}$/.test(d)) return { ok: false, digits: d };
    const type = d.length === 13 ? "ean13" : d.length === 12 ? "upca" : d.length === 8 ? "ean8" : "other";
    const valid = eanValid(d);
    let ndc10 = "";
    // US drug packs: UPC-A "3" + 10-digit NDC + check digit (also written as EAN-13 "03...")
    const upc = type === "ean13" && d[0] === "0" ? d.slice(1) : d;
    if (upc.length === 12 && upc[0] === "3") ndc10 = upc.slice(1, 11);
    return { ok: true, type, digits: d, valid, thai: type === "ean13" && d.startsWith("885"), ndc10, ndcs: ndcSplits(ndc10) };
  }
  function parseNdc(s) {
    const t = normText(s), m = /(?:^|[^0-9])(\d{4,5})-(\d{3,4})(?:-(\d{1,2}))?(?![0-9-])/.exec(t);
    if (!m) return { ok: false };
    const product = `${m[1]}-${m[2]}`, len = m[1].length + m[2].length + (m[3] ? m[3].length : 0);
    if (m[3] && len !== 10) return { ok: false };
    if (!m[3] && len !== 8 && len !== 9) return { ok: false };
    return { ok: true, ndc: m[3] ? `${product}-${m[3]}` : product, product };
  }

  /** What the input most likely is. from: 'barcode' (a scanner result) | 'text' (typed / OCR). Several kinds can apply. */
  function classify(text, o = {}) {
    const t = normText(text), out = [];
    if (!t) return out;
    if (o.from === "barcode") { const b = parseBarcode(t); if (b.ok) out.push({ kind: "barcode", ...b }); return out; }
    for (const r of findThaiReg(t)) out.push({ kind: "thai-reg", ...r });
    const f = parseFoodNo(t);
    // 13 plain digits that pass the EAN-13 check are read as a barcode (food numbers are printed with dashes)
    if (f.ok && (f.dashed || !eanValid(f.digits))) out.push({ kind: "food", ...f });
    const n = parseNdc(t);
    if (n.ok && !out.length) out.push({ kind: "ndc", ...n });
    const digits = t.replace(/[\s-]/g, "");
    if (/^(\d{8}|\d{12,14})$/.test(digits) && !(f.ok && f.dashed) && !n.ok) { const b = parseBarcode(digits); if (b.ok) out.push({ kind: "barcode", ...b }); }
    if (!out.length && /[A-Zก-๙\u4e00-\u9fff]{3,}/.test(t)) out.push({ kind: "name", q: cleanTerm(text) });
    return out;
  }

  /* ---------------- loose pill candidates ---------------- */
  const COLORS = ["WHITE", "YELLOW", "ORANGE", "PINK", "RED", "PURPLE", "BLUE", "TURQUOISE", "GREEN", "BROWN", "GRAY", "BLACK"];
  const SHAPES = ["ROUND", "OVAL", "CAPSULE", "RECTANGLE", "SQUARE", "TRIANGLE", "DIAMOND", "PENTAGON (5 SIDED)", "HEXAGON (6 SIDED)",
    "OCTAGON (8 SIDED)", "BULLET", "TEAR", "TRAPEZOID", "SEMI-CIRCLE", "DOUBLE CIRCLE", "CLOVER", "FREEFORM"];
  const LOOK = { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6" };
  const look = c => LOOK[c] || c;
  const alnum = s => normText(s).replace(/[^0-9A-Z]/g, "");
  /** "5892;V" / "5892 v" -> {sides:["5892","V"], joined:"5892V"} (the user's spaces / ; / slashes separate sides). */
  function normImprint(s) {
    const sides = normText(s).split(/[;/,|]+/).map(alnum).filter(Boolean);
    return { sides, joined: sides.join("") };
  }
  function wdist(a, b) { // weighted Levenshtein: look-alike substitutions (0/O, 1/I, 5/S, 8/B ...) cost 0.5
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 2) return 9;
    let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        const ca = a[i - 1], cb = b[j - 1], sub = ca === cb ? 0 : look(ca) === look(cb) ? 0.5 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  /** query (user) vs a Pillbox imprint: {s 0..1, how:'exact'|'side'|'fuzzy'|'partial'|''} */
  function imprintScore(q, rowImprint) {
    const Q = typeof q === "string" ? normImprint(q) : q;
    if (!Q.joined) return { s: 0, how: "" };
    const sides = String(rowImprint).split(";").map(alnum).filter(Boolean);
    const joinedA = sides.join(""), joinedB = sides.slice().reverse().join(""), qWords = normText(Q.sides.join(" ")).split(" ").join("");
    const qAll = Q.joined || qWords;
    if (qAll === joinedA || qAll === joinedB) return { s: 1, how: "exact" };
    if (sides.length > 1 && sides.includes(qAll)) return { s: 0.9, how: "side" };
    let best = 9;
    for (const c of [joinedA, joinedB, ...sides]) best = Math.min(best, wdist(qAll, c));
    if (qAll.length >= 3 && best <= 1) return { s: best <= 0.5 ? 0.8 : 0.7, how: "fuzzy" };
    if (qAll.length >= 6 && best <= 2) return { s: 0.55, how: "fuzzy" };
    if (qAll.length >= 3 && (joinedA.includes(qAll) || sides.some(x => x.startsWith(qAll)))) return { s: 0.5, how: "partial" };
    return { s: 0, how: "" };
  }
  function rowObj(data, r) {
    const setid = r[8] ? `${r[8].slice(0, 8)}-${r[8].slice(8, 12)}-${r[8].slice(12, 16)}-${r[8].slice(16, 20)}-${r[8].slice(20)}` : "";
    return { imprint: r[0], color: data.colors[r[1]] || "", shape: data.shapes[r[2]] || "", size: r[3], score: r[4], name: data.names[r[5]] || "",
      strength: data.strengths[r[6]] || "", rxcui: r[7] || 0, setid, source: data.sources[r[9]] || "", dea: data.dea[r[10]] || "", n: r[11] || 1 };
  }
  function candidates(data, f = {}, o = {}) {
    const max = o.max || 25, min = o.min == null ? 3 : o.min;
    const Q = normImprint(f.imprint || "");
    if (!data || !Array.isArray(data.rows)) return { list: [], loose: 0, withheld: 0, reason: "nodata" };
    if (!Q.joined) return { list: [], loose: 0, withheld: 0, reason: "noimprint" };
    const color = f.color ? String(f.color).toUpperCase() : "", shape = f.shape ? String(f.shape).toUpperCase() : "";
    const size = Number(f.size) > 0 ? Number(f.size) : 0, score = Number(f.score) > 0 ? Number(f.score) : 0;
    const colorIds = color ? new Set(data.colors.map((c, i) => [c, i]).filter(([c]) => c.split(";").includes(color)).map(([, i]) => i)) : null;
    const shapeId = shape ? data.shapes.indexOf(shape) : -1;
    const strict = [], loose = [];
    for (const r of data.rows) {
      const im = imprintScore(Q, r[0]);
      if (!im.s) continue;
      const okC = !colorIds || colorIds.has(r[1]), okS = shapeId < 0 || r[2] === shapeId;
      const okZ = !size || !r[3] || Math.abs(r[3] - size) <= 1, okN = !score || r[4] === score;
      const rank = im.s + (okC ? 0.1 : 0) + (okS ? 0.1 : 0) + (okZ ? 0.05 : 0) + (okN ? 0.02 : 0);
      const hit = { r, rank, how: im.how };
      if (okC && okS && okZ && okN) strict.push(hit); else if (im.s >= 0.7) loose.push(hit);
    }
    const by = (a, b) => b.rank - a.rank || (a.r[0] < b.r[0] ? -1 : a.r[0] > b.r[0] ? 1 : 0);
    strict.sort(by); loose.sort(by);
    if (strict.length >= min) {
      const pick = strict.slice(0, max).map(h => ({ ...rowObj(data, h.r), match: h.how, loose: false }));
      return { list: pick, loose: 0, withheld: 0, reason: "", padded: false, more: Math.max(0, strict.length - max) };
    }
    // Fewer than `min` rows match every chosen feature. Padding them with imprint-only rows would leave 1-2 rows that
    // "match" and stand out as the answer, so instead show an imprint-only pass: strict and loose rows together, ranked
    // by the imprint alone, every row flagged loose (no "matches what you entered" badge on any of them).
    const all = strict.concat(loose);
    if (all.length < min) return { list: [], loose: 0, withheld: all.length, reason: all.length ? "toofew" : "none", padded: false };
    const im = h => imprintScore(Q, h.r[0]).s;
    all.sort((a, b) => im(b) - im(a) || (a.r[0] < b.r[0] ? -1 : a.r[0] > b.r[0] ? 1 : 0) || a.r[5] - b.r[5]);
    const pick = all.slice(0, Math.max(min, Math.min(max, min + 2))).map(h => ({ ...rowObj(data, h.r), match: h.how, loose: true }));
    return { list: pick, loose: pick.length, withheld: 0, reason: "", padded: true, more: 0 };
  }

  /* ---------------- online sources (text only) ---------------- */
  const OPENFDA = "https://api.fda.gov", RXNAV = "https://rxnav.nlm.nih.gov";
  /** a drug name / code safe to put in a query: letters (any script, with combining marks such as Thai vowels/tone marks), digits, space and - . , ( ) / + only, max 80 */
  function cleanTerm(s) {
    return String(s == null ? "" : s).normalize("NFKC").replace(/[^\p{L}\p{M}\p{N}\s\-.,()/+]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function openfdaSearch(o) {
    if (o.setid && UUID.test(o.setid)) return `set_id:"${o.setid.toLowerCase()}"`;
    if (o.ndc) {
      const list = (Array.isArray(o.ndc) ? o.ndc : [o.ndc]).filter(n => /^\d{4,5}-\d{3,4}(-\d{1,2})?$/.test(n)).slice(0, 3);
      if (!list.length) return "";
      return list.map(n => (n.split("-").length === 3 ? `openfda.package_ndc:"${n}"` : `openfda.product_ndc:"${n}"`)).join(" ");
    }
    const t = cleanTerm(o.name).replace(/["\\]/g, "");
    if (!t || !/[A-Za-z]/.test(t)) return "";
    return `openfda.generic_name:"${t}" openfda.brand_name:"${t}" openfda.substance_name:"${t}"`;
  }
  function openfdaLabelUrl(o = {}) {
    const s = openfdaSearch(o);
    return s ? `${OPENFDA}/drug/label.json?search=${encodeURIComponent(s)}&limit=${Math.max(1, Math.min(5, o.limit || 3))}` : "";
  }
  function rxnavApproxUrl(term) {
    const t = cleanTerm(term);
    return t ? `${RXNAV}/REST/approximateTerm.json?term=${encodeURIComponent(t)}&maxEntries=6` : "";
  }
  const rxnavPropsUrl = rxcui => (/^\d{1,9}$/.test(String(rxcui)) ? `${RXNAV}/REST/rxcui/${rxcui}/properties.json` : "");
  function rxnavCandidates(j) {
    const c = j && j.approximateGroup && Array.isArray(j.approximateGroup.candidate) ? j.approximateGroup.candidate : [];
    const out = [], seen = new Set();
    for (const x of c) {
      const rxcui = String(x.rxcui || "");
      if (!/^\d+$/.test(rxcui) || seen.has(rxcui)) continue;
      seen.add(rxcui);
      out.push({ rxcui, score: Number(x.score) || 0, name: String(x.name || "").slice(0, 200), source: String(x.source || "") });
    }
    return out;
  }
  // label sections in a FIXED order (no ranking, nothing rephrased); ids are the openFDA field names
  const SECTIONS = ["boxed_warning", "purpose", "indications_and_usage", "dosage_and_administration", "contraindications", "do_not_use",
    "warnings", "warnings_and_cautions", "ask_doctor", "ask_doctor_or_pharmacist", "stop_use", "pregnancy_or_breast_feeding",
    "keep_out_of_reach_of_children", "overdosage", "storage_and_handling", "active_ingredient", "inactive_ingredient"];
  function labelSections(res, o = {}) {
    const maxChars = o.maxChars || 4000, f = (res && res.openfda) || {};
    const first = a => (Array.isArray(a) && a.length ? String(a[0]) : "");
    const sections = [];
    for (const id of SECTIONS) {
      const v = res && res[id];
      if (!Array.isArray(v) || !v.length) continue;
      const text = v.map(x => String(x)).join("\n\n").replace(/\r/g, "").trim();
      if (!text) continue;
      sections.push({ id, text: text.length > maxChars ? text.slice(0, maxChars) : text, cut: text.length > maxChars });
    }
    const setid = res && UUID.test(String(res.set_id || "")) ? String(res.set_id).toLowerCase() : "";
    const eff = String((res && res.effective_time) || "");
    return {
      generic: first(f.generic_name), brand: first(f.brand_name), manufacturer: first(f.manufacturer_name), rx: first(f.product_type),
      route: first(f.route), title: first(f.brand_name) || first(f.generic_name) || "", sections, setid,
      effective: /^\d{8}$/.test(eff) ? `${eff.slice(0, 4)}-${eff.slice(4, 6)}-${eff.slice(6)}` : "", source: setid ? dailymedUrl(setid) : ""
    };
  }
  const dailymedUrl = setid => (UUID.test(String(setid)) ? `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${String(setid).toLowerCase()}` : "");
  const pertentoUrl = code => (/^[A-Z0-9ก-๙]{6,40}$/.test(String(code)) ? `https://pertento.fda.moph.go.th/FDA_INFORMATION_DRUG/Home/Phar_Product_Inform_Page?Newcode=${encodeURIComponent(code)}` : "");
  const thfdaSearchUrl = () => "https://porta.fda.moph.go.th/FDA_SEARCH_ALL/MAIN/SEARCH_CENTER_MAIN.aspx";
  function thfdaStatus(s) {
    const t = String(s || "").trim();
    if (/^คงอยู่/.test(t)) return "active";
    if (/^ยกเลิก/.test(t)) return "cancelled";
    if (/^หมดอายุ/.test(t)) return "expired";
    if (/^รอ/.test(t)) return "pending";
    return "unknown";
  }
  function thfdaKind(s) {
    const t = String(s || "").trim();
    if (/^ยาควบคุมพิเศษ/.test(t)) return "special";
    if (/^ยาอันตราย/.test(t)) return "dangerous";
    if (/^ยาสามัญประจำบ้าน/.test(t)) return "household";
    if (/^ยาที่ไม่ใช่|^ไม่ใช่ยาอันตราย/.test(t)) return "nondangerous";
    return "unknown";
  }

  /* ---------------- safety ---------------- */
  // "a lot of tablets" = 5 or more; "do not take more than 8 tablets" (label wording, ห้าม…) is not an emergency
  const POISON = new RegExp([
    "เกินขนาด", "(กิน|ทาน|กลืน)ยา.{0,12}(เกิน|หมด|ผิด|ทั้งแผง|หลายเม็ด)", "เด็ก.{0,12}(กิน|กลืน|เผลอ)", "เผลอกิน", "ได้รับพิษ", "ยาพิษ", "หมดสติ", "ไม่รู้สึกตัว",
    "(?<!(ห้าม|ไม่ควร|อย่า)\\s?(รับประ)?)(?<!เ)(กิน|ทาน|กลืน).{0,16}([5-9]|\\d{2,})\\s*(เม็ด|แคปซูล|ช้อน)",
    "overdos", "too many (pills|tablets|capsules)", "swallow", "poison(?!\\s*(ivy|oak|sumac))", "unconscious", "not breathing",
    "(took|ate|swallowed|have taken|has taken|'ve taken|'s taken).{0,16}\\b([5-9]|\\d{2,})\\s*(tablets|pills|capsules|caps)\\b",
    "(took|ate|swallowed).{0,10}(a lot of|lots of|a whole (pack|box|bottle|strip)|the whole (pack|box|bottle|strip)|all (the|of the|my|his|her))",
    "过量", "误服", "误食", "吞服", "中毒", "昏迷", "吃了.{0,6}(很多|太多|一整|一大把|整盒|整瓶).{0,4}(药|片)", "吃了.{0,6}([5-9]|\\d{2,})\\s*(片|粒)"
  ].join("|"), "i");
  const SELF = /ฆ่าตัวตาย|อยากตาย|ทำร้ายตัวเอง|จบชีวิต|suicid|kill myself|end my life|self[- ]?harm|自杀|轻生|不想活/i;
  function emergency(text) {
    const t = String(text || "");
    const self = SELF.test(t);
    return { poison: POISON.test(t) || self, self };
  }

  /* ---------------- history / export ---------------- */
  function historyAdd(list, e, max = 200) {
    const items = Array.isArray(list) ? list : [];
    const entry = { at: Number(e.at) || Date.now(), kind: String(e.kind || "").slice(0, 16), q: String(e.q || "").slice(0, 120), r: String(e.r || "").slice(0, 200) };
    return [entry, ...items.filter(x => !(x.kind === entry.kind && x.q === entry.q))].slice(0, max);
  }
  function toCSV(rows, cols) {
    const cell = v => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [cols.map(cell).join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\r\n") + "\r\n";
  }

  return {
    normText, parseThaiReg, findThaiReg, parseFoodNo, eanValid, parseBarcode, ndcSplits, parseNdc, classify,
    COLORS, SHAPES, normImprint, wdist, imprintScore, candidates, rowObj,
    OPENFDA, RXNAV, cleanTerm, openfdaSearch, openfdaLabelUrl, rxnavApproxUrl, rxnavPropsUrl, rxnavCandidates, SECTIONS, labelSections,
    dailymedUrl, pertentoUrl, thfdaSearchUrl, thfdaStatus, thfdaKind, emergency, historyAdd, toCSV
  };
});
