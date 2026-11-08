/* lensiq-plate.js — LQPlate: Thai licence-plate reading for LENSIQ Gate (gate.html · parking.html · village.html).
 * Browser: window.LQPlate · Node: module.exports (everything except the ONNX / canvas parts is pure and unit-tested).
 * Privacy: nothing here sends or stores images. Reading runs on this device (ONNX Runtime Web WASM, no WebGL).
 * Human-in-the-loop: every read is a SUGGESTION that a guard confirms or corrects; nothing here opens a gate.
 *
 * PLATE TEXT (pure)
 *   normalize(s) -> string            NFC, Thai digits -> 0-9, drop spaces / dashes / dots, Latin upper-case
 *   parse(s, {moto}) -> {ok, kind:'car'|'moto', prefix, letters, number, key, line1, legacy, reason}
 *     car:  optional digit 1-9 + 2 Thai consonants + 1-4 digits ("1กข 2345", "กข 12"); legacy 1-consonant plates ok:true legacy:true
 *     moto: optional digit + 2-3 consonants (line 1) + 1-4 digits (line 3)   · digits never start with 0
 *     Latin look-alikes in the number part are repaired first: O->0, B->8, I/L->1 (OCR confusions)
 *   format(p|key) -> "1กข 2345"
 *   PROVINCES [{id, th, en}] 77 provinces + Betong (special plate) · provinceList(commonIds) common first
 *   provinceName(id, lang) · guessProvince(text) -> {id, score}|null  (fuzzy, a suggestion for the pick-list only)
 *   LOOKALIKE pairs ข/ช ด/ต บ/ป ผ/ฝ ภ/ถ ม/ฆ 0/O 8/B 1/I 1/ไ 1/ใ — substitution cost 0.5 in plateDist()
 *   plateDist(a, b) -> weighted edit distance · lev(a, b) -> plain Levenshtein (code points)
 *   match(read, list, {max=1, province, ignoreProvince}) -> [{item, dist, exact, provinceOk}] best first
 *   vote(reads, {minAgree}) -> {key, conf, agree, n, chars:[{c,p}], low:[i]}|null   multi-frame per-character vote
 *   leadAlternatives(vote, reads, {moto, leftCut}) -> {alts, leadCheck, reason}   leading-digit readings for the guard to pick
 *   ctcDecode(data, T, C, dict) -> {text, conf, chars:[{c,p}]}   greedy CTC (blank 0, dict 1..n, space last)
 *   fromOcr(lines:[{text, chars}], {moto}) -> {key, conf, chars, provinceText}|null  pick the plate line out of OCR lines
 * IMAGE (pure, on a grey Uint8Array)
 *   findCandidates(gray, W, H, opts) -> [{x,y,w,h,score}] normalised   classical edge-density plate finder (no model)
 *   findPlates(rgba, W, H, {extra}) -> [{x,y,w,h,score,src}]   plate finder (round 15): proposals from findCandidates on luma /
 *     night-stretched luma / colour contrast, flatRegions (plate background with character holes) and o.extra (model boxes)
 *     -> text lines stacked into plate boxes -> growToPlate (plate background extent) -> plateScore (aspect, flat
 *     connected background, ink, bands, background ends at the box) -> nesting rules -> NMS
 *   growToPlate(rgba, W, H, box) -> box grown to the plate background (never shrinks; stops at frame lines)
 *   iou · nms · blur3 · flatRegions · plateFeatures · yunetPriors / yunetDecode (LPD-YuNet priors + 4-corner quad)
 *   DEMO_SET · demoSpec(o) -> seeded synthetic scenes (drawn by GateKit.drawScene) · detEval(rows) -> per-category recall
 *   splitLines(gray, W, H) -> [{y0, y1}]   horizontal projection: text bands inside a plate crop
 *   lumaMean(gray) · isNight(at, {luma, from=18, to=6})
 * RECORDS (pure)
 *   toCSV(rows, cols) (formula-injection safe) · purge(records, now, cfg) -> {keep, drop}
 *   auditAppend(chain, entry) / auditVerify(chain) — append-only, hash-chained correction log (tamper-evident, FNV-1a)
 *   accuracy(rows, opts) -> report (plate-level, char-level, day/night split, CI-aware verdict via lensiq-sitecheck)
 * DOM (browser only)
 *   registerDetector(fn(canvas) -> Promise<[{x,y,w,h,score}]>) — plug a reviewed plate-detector model in; default = findPlates
 *   detect(canvas, {model: "auto"|true|false}) · loadPlateDet() (LPD-YuNet, OpenCV Zoo, Apache-2.0) · modelBoxes(canvas)
 *   loadOcr() -> Promise<{session, dict}> · recognize(canvas) -> {text, conf, chars}
 *   readPlate(canvas, box, {moto, grow}) — grows the box to the plate first; leftCut also when ink touches the crop's left edge
 *     or when a glyph sits left of the key (fromOcr leadSuspect / inkBefore) -> leadGuess "1"+key offered by leadAlternatives
 *   inkBefore(gray, W, H, band, keyChars, ocrLine, px) -> {x0, x1, narrow} | null   ink left of the key's first character
 *   grayOf(canvas|ImageData, maxW) -> {gray, W, H}
 */
(function (root, factory) {
  const site = typeof module !== "undefined" && module.exports ? require("./lensiq-sitecheck.js") : null;
  const m = factory(site);
  if (typeof module !== "undefined" && module.exports) module.exports = m; else /** @type {any} */ (root).LQPlate = m;
})(typeof self !== "undefined" ? self : this, function (siteMod) {
  "use strict";
  const hasDOM = typeof document !== "undefined";
  const g = /** @type {any} */ (typeof self !== "undefined" ? self : {});
  const Site = () => siteMod || g.LQSite || null;

  /* ---------------- plate text ---------------- */
  // Thai consonants used on plates: ก-ฮ without the obsolete ฃ ฅ
  const CONS = "กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ";
  const isCons = c => CONS.includes(c);
  const THDIG = "๐๑๒๓๔๕๖๗๘๙";
  function normalize(s) {
    let t = String(s == null ? "" : s).normalize("NFC");
    t = t.replace(/[๐-๙]/g, c => String(THDIG.indexOf(c)));
    return t.replace(/[\s\-–—._·,]+/g, "").toUpperCase();
  }
  const DIGIT_FIX = { O: "0", Q: "0", D: "0", B: "8", I: "1", L: "1", "|": "1", S: "5", Z: "2", G: "6" };
  function fixDigits(s) { return s.replace(/[OQDBILSZG|]/g, c => DIGIT_FIX[c]); }
  const RE_CAR = /^([1-9]?)([ก-ฮ]{2})([1-9][0-9]{0,3})$/;
  const RE_LEGACY = /^([ก-ฮ])([1-9][0-9]{0,3})$/;
  const RE_MOTO = /^([1-9]?)([ก-ฮ]{2,3})([1-9][0-9]{0,3})$/;
  /** @param {any} s @param {{moto?: boolean}} [o] */
  function parse(s, o = {}) {
    let t = normalize(s);
    const bad = reason => ({ ok: false, kind: o.moto ? "moto" : "car", prefix: "", letters: "", number: "", key: t, line1: "", legacy: false, reason });
    if (!t) return bad("empty");
    // repair Latin look-alikes after the last Thai letter (the number part) and a leading one before the letters
    const lastTh = Math.max(...[...t].map((c, i) => (/[ก-ฮ]/.test(c) ? i : -1)));
    if (lastTh >= 0) t = (/^[OQDBILSZG|]$/.test(t[0]) && lastTh > 0 ? fixDigits(t[0]) : t[0]) + t.slice(1, lastTh + 1) + fixDigits(t.slice(lastTh + 1));
    else return bad("no-letters");
    let m = (o.moto ? RE_MOTO : RE_CAR).exec(t), legacy = false;
    if (!m && !o.moto) { const l = RE_LEGACY.exec(t); if (l) { m = /** @type {any} */ (["", "", l[1], l[2]]); legacy = true; } }
    if (!m) return bad(/[^ก-ฮ0-9]/.test(t) ? "chars" : "format");
    if (![...m[2]].every(isCons)) return bad("letters");
    const key = m[1] + m[2] + m[3];
    return { ok: true, kind: o.moto ? "moto" : "car", prefix: m[1], letters: m[2], number: m[3], key, line1: m[1] + m[2] + " " + m[3], legacy, reason: "" };
  }
  function format(p) {
    if (!p) return "";
    if (typeof p === "string") { const q = parse(p); if (q.ok) return q.line1; const m = parse(p, { moto: true }); return m.ok ? m.line1 : p; }
    return p.line1 || format(p.key || "");
  }

  /* ---------------- provinces ---------------- */
  const PROV_RAW = "bangkok|กรุงเทพมหานคร|Bangkok;krabi|กระบี่|Krabi;kanchanaburi|กาญจนบุรี|Kanchanaburi;kalasin|กาฬสินธุ์|Kalasin;" +
    "kamphaengphet|กำแพงเพชร|Kamphaeng Phet;khonkaen|ขอนแก่น|Khon Kaen;chanthaburi|จันทบุรี|Chanthaburi;chachoengsao|ฉะเชิงเทรา|Chachoengsao;" +
    "chonburi|ชลบุรี|Chon Buri;chainat|ชัยนาท|Chai Nat;chaiyaphum|ชัยภูมิ|Chaiyaphum;chumphon|ชุมพร|Chumphon;chiangrai|เชียงราย|Chiang Rai;" +
    "chiangmai|เชียงใหม่|Chiang Mai;trang|ตรัง|Trang;trat|ตราด|Trat;tak|ตาก|Tak;nakhonnayok|นครนายก|Nakhon Nayok;nakhonpathom|นครปฐม|Nakhon Pathom;" +
    "nakhonphanom|นครพนม|Nakhon Phanom;nakhonratchasima|นครราชสีมา|Nakhon Ratchasima;nakhonsithammarat|นครศรีธรรมราช|Nakhon Si Thammarat;" +
    "nakhonsawan|นครสวรรค์|Nakhon Sawan;nonthaburi|นนทบุรี|Nonthaburi;narathiwat|นราธิวาส|Narathiwat;nan|น่าน|Nan;buengkan|บึงกาฬ|Bueng Kan;" +
    "buriram|บุรีรัมย์|Buri Ram;pathumthani|ปทุมธานี|Pathum Thani;prachuapkhirikhan|ประจวบคีรีขันธ์|Prachuap Khiri Khan;prachinburi|ปราจีนบุรี|Prachin Buri;" +
    "pattani|ปัตตานี|Pattani;ayutthaya|พระนครศรีอยุธยา|Phra Nakhon Si Ayutthaya;phayao|พะเยา|Phayao;phangnga|พังงา|Phangnga;phatthalung|พัทลุง|Phatthalung;" +
    "phichit|พิจิตร|Phichit;phitsanulok|พิษณุโลก|Phitsanulok;phetchaburi|เพชรบุรี|Phetchaburi;phetchabun|เพชรบูรณ์|Phetchabun;phrae|แพร่|Phrae;" +
    "phuket|ภูเก็ต|Phuket;mahasarakham|มหาสารคาม|Maha Sarakham;mukdahan|มุกดาหาร|Mukdahan;maehongson|แม่ฮ่องสอน|Mae Hong Son;yasothon|ยโสธร|Yasothon;" +
    "yala|ยะลา|Yala;roiet|ร้อยเอ็ด|Roi Et;ranong|ระนอง|Ranong;rayong|ระยอง|Rayong;ratchaburi|ราชบุรี|Ratchaburi;lopburi|ลพบุรี|Lop Buri;" +
    "lampang|ลำปาง|Lampang;lamphun|ลำพูน|Lamphun;loei|เลย|Loei;sisaket|ศรีสะเกษ|Si Sa Ket;sakonnakhon|สกลนคร|Sakon Nakhon;songkhla|สงขลา|Songkhla;" +
    "satun|สตูล|Satun;samutprakan|สมุทรปราการ|Samut Prakan;samutsongkhram|สมุทรสงคราม|Samut Songkhram;samutsakhon|สมุทรสาคร|Samut Sakhon;" +
    "sakaeo|สระแก้ว|Sa Kaeo;saraburi|สระบุรี|Saraburi;singburi|สิงห์บุรี|Sing Buri;sukhothai|สุโขทัย|Sukhothai;suphanburi|สุพรรณบุรี|Suphan Buri;" +
    "suratthani|สุราษฎร์ธานี|Surat Thani;surin|สุรินทร์|Surin;nongkhai|หนองคาย|Nong Khai;nongbualamphu|หนองบัวลำภู|Nong Bua Lam Phu;" +
    "angthong|อ่างทอง|Ang Thong;amnatcharoen|อำนาจเจริญ|Amnat Charoen;udonthani|อุดรธานี|Udon Thani;uttaradit|อุตรดิตถ์|Uttaradit;" +
    "uthaithani|อุทัยธานี|Uthai Thani;ubonratchathani|อุบลราชธานี|Ubon Ratchathani;betong|เบตง|Betong (special plate)";
  const PROVINCES = Object.freeze(PROV_RAW.split(";").map(r => { const [id, th, en] = r.split("|"); return Object.freeze({ id, th, en }); }));
  const PROV_BY = new Map(PROVINCES.map(p => [p.id, p]));
  function provinceName(id, lang = "th") { const p = PROV_BY.get(id); return p ? (lang === "th" ? p.th : p.en) : ""; }
  function provinceList(common = []) {
    const c = common.filter(id => PROV_BY.has(id)), set = new Set(c);
    return c.map(id => PROV_BY.get(id)).concat(PROVINCES.filter(p => !set.has(p.id)));
  }
  function guessProvince(text) {
    const t = String(text || "").replace(/[^ก-๛]/g, "");
    if (t.length < 2) return null;
    let best = null;
    for (const p of PROVINCES) {
      const d = lev(t, p.th), s = 1 - d / Math.max(t.length, p.th.length);
      if (!best || s > best.score) best = { id: p.id, score: Math.round(s * 100) / 100 };
    }
    return best && best.score >= 0.6 ? best : null;
  }

  /* ---------------- distance + matching ---------------- */
  // 1/ไ 1/ใ: on a thin Prompt-400-like "1" the Thai recogniser reads the vowel sara ai (round 15 review; plates never carry vowels)
  const LOOKALIKE = [["ข", "ช"], ["ด", "ต"], ["บ", "ป"], ["ผ", "ฝ"], ["ภ", "ถ"], ["ม", "ฆ"], ["0", "O"], ["8", "B"], ["1", "I"], ["1", "ไ"], ["1", "ใ"]];
  const LA = new Set(LOOKALIKE.flatMap(([a, b]) => [a + b, b + a]));
  const lookalike = (a, b) => LA.has(a + b);
  function editDP(a, b, sub) {
    const A = [...a], B = [...b], n = A.length, m = B.length;
    let prev = Array.from({ length: m + 1 }, (_, j) => j), cur = new Array(m + 1);
    for (let i = 1; i <= n; i++) {
      cur[0] = i;
      for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + sub(A[i - 1], B[j - 1]));
      [prev, cur] = [cur, prev];
    }
    return prev[m];
  }
  const lev = (a, b) => editDP(String(a), String(b), (x, y) => (x === y ? 0 : 1));
  const plateDist = (a, b) => editDP(normalize(a), normalize(b), (x, y) => (x === y ? 0 : lookalike(x, y) ? 0.5 : 1));
  /**
   * read: {key, province?} or a string · list: [{key|plate, province?, ...}] -> matches within max, best first.
   * Province: when both sides name one and they differ the entry is skipped (unless ignoreProvince); when the read has
   * no province the match stands with provinceOk:null — the guard checks the province on the screen.
   * @param {any} read @param {any[]} list @param {{max?: number, province?: string, ignoreProvince?: boolean}} [o]
   */
  function match(read, list, o = {}) {
    const key = normalize(typeof read === "string" ? read : read && read.key), prov = o.province || (read && read.province) || "";
    const max = o.max == null ? 1 : o.max, out = [];
    if (!key) return out;
    for (const item of list || []) {
      const k = normalize(item.key || item.plate || "");
      if (!k) continue;
      const pv = item.province || "";
      const provinceOk = prov && pv ? prov === pv : null;
      if (provinceOk === false && !o.ignoreProvince) continue;
      const dist = k === key ? 0 : plateDist(key, k);
      if (dist <= max) out.push({ item, dist, exact: dist === 0, provinceOk });
    }
    return out.sort((x, y) => x.dist - y.dist || (y.provinceOk === true ? 1 : 0) - (x.provinceOk === true ? 1 : 0));
  }

  /* ---------------- multi-frame voting ---------------- */
  /**
   * reads = [{key, conf, chars:[{c,p}]}] from several frames (keys from parse(): valid plates only). The length most
   * frames agree on wins; each position is then voted by summed per-character probability. -> the voted key (if it still
   * parses), its confidence (mean winning share), agree = share of frames whose whole key equals it, low = weak positions.
   */
  function vote(reads, o = {}) {
    const R = (reads || []).filter(r => r && r.key);
    if (!R.length) return null;
    const byLen = new Map();
    for (const r of R) { const L = [...r.key].length; byLen.set(L, (byLen.get(L) || 0) + (r.conf || 0.5)); }
    const L = [...byLen].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    const same = R.filter(r => [...r.key].length === L);
    const chars = [];
    for (let i = 0; i < L; i++) {
      const tally = new Map(); let tot = 0;
      for (const r of same) {
        const c = [...r.key][i], p = r.chars && r.chars[i] && r.chars[i].c === c ? r.chars[i].p : r.conf || 0.5;
        tally.set(c, (tally.get(c) || 0) + p); tot += p;
      }
      const [c, s] = [...tally].sort((a, b) => b[1] - a[1])[0];
      chars.push({ c, p: Math.round((tot ? (s / tot) * (s / same.length) : 0) * 1000) / 1000 });
    }
    let key = chars.map(x => x.c).join("");
    const moto = !!o.moto;
    if (!parse(key, { moto }).ok) { // the composite is not a plate: fall back to the most supported whole key
      const t = new Map(); for (const r of same) t.set(r.key, (t.get(r.key) || 0) + (r.conf || 0.5));
      key = [...t].sort((a, b) => b[1] - a[1])[0][0];
    }
    const agree = R.filter(r => r.key === key).length / R.length;
    const conf = Math.round(Math.min(1, chars.reduce((s, x) => s + x.p, 0) / chars.length) * 1000) / 1000;
    const low = chars.map((x, i) => (x.p < (o.lowP || 0.6) ? i : -1)).filter(i => i >= 0);
    return { key, conf, agree: Math.round(agree * 1000) / 1000, n: R.length, chars, low, line1: format(key) };
  }

  /**
   * Leading-digit safety net. Thai car plates may start with an optional digit 1-9 ("1กข 2345"); a thin "1" next to the
   * plate frame is the character OCR most often drops. Never drop or add it silently: return every plausible reading so
   * the guard picks one. Triggers: frames disagree about the prefix, the voted prefix is low-confidence, or the crop
   * touches the left edge of the frame (the digit may be cut off).
   * @param {any} v vote() result @param {any[]} reads per-frame reads @param {{moto?: boolean, leftCut?: boolean, lowP?: number}} [o]
   * @returns {{alts: string[], leadCheck: boolean, reason: string}}
   */
  function leadAlternatives(v, reads, o = {}) {
    const none = { alts: [], leadCheck: false, reason: "" };
    if (!v || !v.key) return none;
    const moto = !!o.moto, p = parse(v.key, { moto });
    if (!p.ok) return none;
    const body = p.letters + p.number, alts = new Map(), add = (k, w) => { if (parse(k, { moto }).ok) alts.set(k, (alts.get(k) || 0) + w); };
    add(v.key, 1e6);
    const R = (reads || []).filter(r => r && r.key);
    for (const r of R) { const q = parse(r.key, { moto }); if (q.ok && q.letters + q.number === body) add(q.key, r.conf || 0.5); }
    let reason = "";
    if (alts.size > 1) reason = "frames";
    if (p.prefix && v.chars && v.chars[0] && v.chars[0].p < (o.lowP || 0.75)) { add(body, 0.1); reason = reason || "lowconf"; }
    const leftCut = !!o.leftCut || R.some(r => r.leftCut);
    if (!p.prefix && leftCut) reason = reason || "edge";
    // a read that saw a thin glyph left of the letters (ink the recogniser skipped, or a 1-lookalike it dropped) offers "1"+body
    if (!p.prefix) for (const r of R) if (r.leadGuess) { const q = parse(r.leadGuess, { moto }); if (q.ok && q.letters + q.number === body) { add(q.key, 0.05); reason = reason || "lookalike"; } }
    const list = [...alts].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    return { alts: list.length > 1 ? list : [], leadCheck: !!reason, reason };
  }

  /* ---------------- OCR decode ---------------- */
  /** greedy CTC: data = Float32Array T*C (probabilities or logits), class 0 = blank, 1..dict.length = dict, last = space */
  function ctcDecode(data, T, C, dict) {
    let prev = -1, text = "", sum = 0, n = 0; const chars = [];
    const soft = !(data.length && data[0] >= 0 && data[0] <= 1);
    for (let t = 0; t < T; t++) {
      let bi = 0, bv = -Infinity, se = 0;
      for (let c = 0; c < C; c++) { const v = data[t * C + c]; if (v > bv) { bv = v; bi = c; } }
      let p = bv;
      if (soft) { for (let c = 0; c < C; c++) se += Math.exp(data[t * C + c] - bv); p = 1 / se; }
      if (bi !== 0 && bi !== prev) {
        const ch = bi <= dict.length ? dict[bi - 1] : " ";
        text += ch; chars.push({ c: ch, p: Math.round(p * 1000) / 1000, t }); sum += p; n++;
      }
      prev = bi;
    }
    return { text, conf: n ? Math.round((sum / n) * 1000) / 1000 : 0, chars, T };
  }
  /** a thin leading "1" read as a vowel / punctuation (never on a plate) — only before the first plate character */
  const ONE_LIKE = /^[ไใ!ⅼ\]\[]$/;
  /**
   * keep only plate characters of one OCR line, carrying per-character probabilities (and the CTC time step t when known).
   * A 1-lookalike (ไ ใ ! ⅼ [ ]) before the first plate character and directly before a consonant becomes "1" at half its
   * probability (look: true), so the low-confidence leading digit reaches leadAlternatives instead of being skipped.
   */
  function plateChars(line) {
    const out = [];
    const src = line.chars && line.chars.length ? line.chars : [...String(line.text || "")].map(c => ({ c, p: line.conf || 0.5 }));
    for (let k = 0; k < src.length; k++) {
      const x = src[k];
      let c = normalize(x.c);
      if (!c) continue;
      if (!out.length && ONE_LIKE.test(c)) {
        let j = k + 1; while (j < src.length && !normalize(src[j].c)) j++;
        if (j < src.length && /^[ก-ฮ]$/.test(normalize(src[j].c))) { out.push({ c: "1", p: Math.round((x.p || 0.5) * 500) / 1000, look: true, ...(x.t != null ? { t: x.t } : {}) }); continue; }
      }
      if (/[OQDBILSZG|]/.test(c)) c = fixDigits(c);
      if (/^[ก-ฮ0-9]$/.test(c)) out.push(x.t != null ? { c, p: x.p, t: x.t } : { c, p: x.p });
    }
    return out;
  }
  /**
   * lines = OCR results per text band of the crop, top to bottom. Car: the band that parses as line 1 (letters +
   * digits); the remaining Thai band is the province text. Motorcycle: band 1 (letters) + last band (digits).
   */
  function fromOcr(lines, o = {}) {
    const L = (lines || []).filter(l => l && (l.text || (l.chars && l.chars.length)));
    // line: index into `lines` of the band that holds the key's first character; skipped: plate characters before the key
    // on that band (a > 0 = OCR saw something left of the plate number that does not parse with it -> leadSuspect)
    const tryKey = (cs, line) => {
      const s = cs.map(x => x.c).join("");
      for (let a = 0; a < s.length; a++) for (let b = s.length; b > a + 1; b--) {
        const p = parse(s.slice(a, b), { moto: !!o.moto });
        if (p.ok && !p.legacy) {
          const sub = cs.slice(a, b);
          /** @type {{key: string, chars: any[], conf: number, line: number, leadSuspect?: string, leadGuess?: string}} */
          const r = { key: p.key, chars: sub, conf: sub.reduce((x, y) => x + y.p, 0) / sub.length, line };
          if (a > 0 && !p.prefix && /^[ก-ฮ]$/.test(s[a])) { r.leadSuspect = "skipped"; if (s[a - 1] === "1" || ONE_LIKE.test(s[a - 1])) r.leadGuess = "1" + p.key; }
          return r;
        }
      }
      return null;
    };
    if (o.moto && L.length >= 2) {
      const r = tryKey(plateChars(L[0]).concat(plateChars(L[L.length - 1])), 0);
      if (r) return { ...r, provinceText: L.length >= 3 ? L[1].text : "" };
    }
    for (let i = 0; i < L.length; i++) {
      const r = tryKey(plateChars(L[i]), i);
      if (r) return { ...r, provinceText: L.filter((_, j) => j !== i).map(l => l.text).join(" ") };
    }
    const all = tryKey(L.flatMap(plateChars), -1); // one band that holds both lines
    return all ? { ...all, provinceText: L.map(l => l.text).join(" ") } : null;
  }

  /* ---------------- image (pure) ---------------- */
  function lumaMean(gray) { let s = 0; for (let i = 0; i < gray.length; i++) s += gray[i]; return gray.length ? s / gray.length : 0; }
  /** night = dark frame (mean luma < 60 of 255) when the luma is known, else the clock (18:00-06:00) */
  function isNight(at, o = {}) {
    if (typeof o.luma === "number") return o.luma < (o.dark || 60);
    const h = new Date(at).getHours(), from = o.from == null ? 18 : o.from, to = o.to == null ? 6 : o.to;
    return from > to ? h >= from || h < to : h >= from && h < to;
  }
  /**
   * Classical plate finder: dense vertical edges (characters) inside a bright, roughly 1.5:1-6:1 box. No model, no
   * training data — a fallback that suggests where to read; the guard can always tap the plate instead.
   * gray: Uint8Array W*H. -> boxes normalised to the frame, best first.
   */
  function findCandidates(gray, W, H, o = {}) {
    const N = W * H, E = new Uint8Array(N);
    let s = 0, s2 = 0;
    const gx = new Float32Array(N);
    for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x, v = Math.abs(gray[i + 1] - gray[i - 1]); gx[i] = v; s += v; s2 += v * v; }
    const mean = s / N, sd = Math.sqrt(Math.max(0, s2 / N - mean * mean)), thr = Math.max(o.minEdge || 40, mean + 1.5 * sd);
    for (let i = 0; i < N; i++) E[i] = gx[i] >= thr ? 1 : 0;
    // integral image of edges -> density in a (2rx+1) x (2ry+1) window
    const I = new Uint32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += E[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
    const rx = Math.max(2, Math.round(W / 60)), ry = Math.max(1, Math.round(H / 90));
    const box = (x0, y0, x1, y1) => I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
    const D = new Uint8Array(N), dens = o.density || 0.18;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - rx), x1 = Math.min(W, x + rx + 1), y0 = Math.max(0, y - ry), y1 = Math.min(H, y + ry + 1);
      D[y * W + x] = box(x0, y0, x1, y1) / ((x1 - x0) * (y1 - y0)) >= dens ? 1 : 0;
    }
    // connected components (4-neighbour, iterative)
    const lab = new Int32Array(N), out = [], stack = [];
    let id = 0;
    for (let i = 0; i < N; i++) {
      if (!D[i] || lab[i]) continue;
      id++; let x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0;
      stack.push(i); lab[i] = id;
      while (stack.length) {
        const j = /** @type {number} */ (stack.pop()), x = j % W, y = (j - x) / W;
        area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        const nb = [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, y > 0 ? j - W : -1, y < H - 1 ? j + W : -1];
        for (const k of nb) if (k >= 0 && D[k] && !lab[k]) { lab[k] = id; stack.push(k); }
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1, ar = w / h, fill = area / (w * h);
      if (w < W * (o.minW || 0.05) || h < 4 || ar < (o.arMin || 1.3) || ar > (o.arMax || 6.5) || fill < 0.35) continue;
      // brightness contrast: plates are lighter than their surroundings (white / yellow / green background)
      let inS = 0, inN = 0;
      for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) { inS += gray[y * W + x]; inN++; }
      const edge = box(x0, y0, x1 + 1, y1 + 1) / (w * h);
      const arScore = Math.exp(-Math.abs(Math.log(ar / 2.3)));
      const score = Math.round(fill * arScore * Math.min(1, edge * 4) * (0.5 + inS / inN / 510) * 1000) / 1000;
      out.push({ x: x0 / W, y: y0 / H, w: w / W, h: h / H, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, o.max || 5);
  }
  /** text bands inside a plate crop: rows whose dark-pixel share exceeds a threshold, gaps of >= 2 rows split bands */
  function splitLines(gray, W, H) {
    const m = lumaMean(gray), dark = new Float32Array(H);
    for (let y = 0; y < H; y++) { let c = 0; for (let x = 0; x < W; x++) if (gray[y * W + x] < m * 0.75) c++; dark[y] = c / W; }
    const bands = []; let y0 = -1, gap = 0;
    for (let y = 0; y < H; y++) {
      const on = dark[y] > 0.04;
      if (on) { if (y0 < 0) y0 = y; gap = 0; } else if (y0 >= 0 && ++gap >= 2) { bands.push({ y0, y1: y - gap + 1 }); y0 = -1; gap = 0; }
    }
    if (y0 >= 0) bands.push({ y0, y1: H });
    const min = Math.max(3, H * 0.12);
    const B = bands.filter(b => b.y1 - b.y0 >= min);
    return B.length ? B : [{ y0: 0, y1: Math.round(H * 0.62) }, { y0: Math.round(H * 0.62), y1: H }];
  }

  /**
   * the plate itself inside a padded crop: skip dark margins (car body) and the plate's own frame line, so text bands are
   * not merged with the frame. -> {x0, y0, x1, y1} (exclusive ends), never smaller than half the crop
   */
  function trimBorder(gray, W, H) {
    const m = lumaMean(gray);
    let x0 = 0, y0 = 0, x1 = W, y1 = H;
    const rowB = y => { let c = 0; for (let x = x0; x < x1; x++) if (gray[y * W + x] > m) c++; return c / Math.max(1, x1 - x0); };
    const colB = x => { let c = 0; for (let y = y0; y < y1; y++) if (gray[y * W + x] > m) c++; return c / Math.max(1, y1 - y0); };
    for (let pass = 0; pass < 2; pass++) { // 0: dark margins outside the plate, 1: the frame line just inside its edge
      const lim = pass ? 0.35 : 0.5;
      if (pass === 0) {
        while (x0 < W * 0.25 && colB(x0) < lim) x0++;
        while (x1 > W * 0.75 && colB(x1 - 1) < lim) x1--;
        while (y0 < H * 0.25 && rowB(y0) < lim) y0++;
        while (y1 > H * 0.75 && rowB(y1 - 1) < lim) y1--;
      } else {
        const sx = Math.max(2, Math.round((x1 - x0) * 0.06)), sy = Math.max(2, Math.round((y1 - y0) * 0.1));
        const inL = () => { for (let x = x0; x < x0 + sx; x++) if (colB(x) < lim) { let e = x; while (e < x0 + 2 * sx && colB(e) < 0.6) e++; return e; } return x0; };
        const inR = () => { for (let x = x1 - 1; x >= x1 - sx; x--) if (colB(x) < lim) { let e = x; while (e > x1 - 2 * sx && colB(e) < 0.6) e--; return e + 1; } return x1; };
        const inT = () => { for (let y = y0; y < y0 + sy; y++) if (rowB(y) < lim) { let e = y; while (e < y0 + 2 * sy && rowB(e) < 0.6) e++; return e; } return y0; };
        const inB = () => { for (let y = y1 - 1; y >= y1 - sy; y--) if (rowB(y) < lim) { let e = y; while (e > y1 - 2 * sy && rowB(e) < 0.6) e--; return e + 1; } return y1; };
        const a = inL(), b = inR(); x0 = a; x1 = b;
        const c = inT(), d = inB(); y0 = c; y1 = d;
      }
    }
    if (x1 - x0 < W / 2) { x0 = 0; x1 = W; }
    if (y1 - y0 < H / 2) { y0 = 0; y1 = H; }
    return { x0, y0, x1, y1 };
  }

  /* ---------------- plate detector: proposals -> plate-level boxes -> ranking (pure, on RGBA) ---------------- */
  /** intersection over union of two {x, y, w, h} boxes (any unit) */
  function iou(a, b) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1), u = a.w * a.h + b.w * b.h - i;
    return u > 0 ? i / u : 0;
  }
  /** greedy non-maximum suppression, best score first */
  function nms(boxes, thr = 0.45) {
    const out = [];
    for (const b of (boxes || []).slice().sort((p, q) => q.score - p.score)) if (out.every(k => iou(k, b) < thr)) out.push(b);
    return out;
  }
  const union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };
  function lumaOf(rgba, W, H) { const g = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) g[i] = (rgba[4 * i] * 77 + rgba[4 * i + 1] * 150 + rgba[4 * i + 2] * 29) >> 8; return g; }
  /** colour contrast channel (max - min of R, G, B): finds coloured plates whose luma is close to the car body */
  function chromaOf(rgba, W, H) {
    const g = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) { const r = rgba[4 * i], gg = rgba[4 * i + 1], b = rgba[4 * i + 2]; g[i] = Math.max(r, gg, b) - Math.min(r, gg, b); }
    return g;
  }
  /** contrast stretch between the 2nd and 98th percentile (dark night frames) */
  function stretch(gray) {
    const h = new Uint32Array(256); for (const v of gray) h[v]++;
    const n = gray.length; let lo = 0, hi = 255, c = 0;
    for (let v = 0; v < 256; v++) { c += h[v]; if (c >= n * 0.02) { lo = v; break; } }
    c = 0; for (let v = 255; v >= 0; v--) { c += h[v]; if (c >= n * 0.02) { hi = v; break; } }
    if (hi - lo < 8) return gray;
    const out = new Uint8Array(n), k = 255 / (hi - lo);
    for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, Math.round((gray[i] - lo) * k)));
    return out;
  }
  /** 3 x 3 box blur of RGBA (sensor noise would otherwise let a plate background "leak" into a similar car body) */
  function blur3(rgba, W, H) {
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0, g2 = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const i = 4 * (yy * W + xx); r += rgba[i]; g2 += rgba[i + 1]; b += rgba[i + 2]; n++; }
      }
      const o = 4 * (y * W + x); out[o] = r / n; out[o + 1] = g2 / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
    return out;
  }
  /** dominant colour inside a pixel rectangle: the fullest 3-bit-per-channel bin, refined to the mean of its pixels */
  function dominant(rgba, W, x0, y0, x1, y1) {
    const hist = new Uint32Array(4096), bin = i => ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hist[bin(4 * (y * W + x))]++;
    let bi = 0; for (let k = 1; k < 4096; k++) if (hist[k] > hist[bi]) bi = k;
    let c = [((bi >> 8) << 4) + 8, (((bi >> 4) & 15) << 4) + 8, ((bi & 15) << 4) + 8], sd = 0;
    for (let pass = 0; pass < 2; pass++) { // refine: mean (and spread) of the pixels near the bin centre
      let r = 0, g = 0, b = 0, q = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = 4 * (y * W + x), dr = rgba[i] - c[0], dg = rgba[i + 1] - c[1], db = rgba[i + 2] - c[2];
        if (Math.abs(dr) <= 10 && Math.abs(dg) <= 10 && Math.abs(db) <= 10) { r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; q += (dr * dr + dg * dg + db * db) / 3; n++; }
      }
      if (!n) break;
      c = [r / n, g / n, b / n]; sd = Math.sqrt(q / n);
    }
    const res = /** @type {any} */ (c); res.sd = sd;
    return /** @type {number[] & {sd: number}} */ (res);
  }
  const median = a => { if (!a.length) return 0; const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
  /**
   * Grow a proposal box to the plate's own background. A finder / model box often covers only the text line (or starts a
   * little right of a thin leading "1"); the crop then silently loses characters. The plate background is the dominant
   * colour inside the box; from the box edges we walk outwards along each row / column while that colour continues
   * (gaps up to a character stroke are bridged, so ink inside the plate does not stop the walk) and take the median
   * extent. A side whose walk runs into the growth cap (the "background" continues, e.g. a white car body) is not grown.
   * Never shrinks the box. b and the result are normalised to the frame.
   * @param {Uint8Array|Uint8ClampedArray} rgba @param {number} W @param {number} H @param {{x:number,y:number,w:number,h:number}} b
   * @param {{tol?: number}} [o]
   */
  function growToPlate(rgba, W, H, b, o = {}) {
    const base = { x: b.x, y: b.y, w: b.w, h: b.h };
    let x0 = Math.max(0, Math.floor(b.x * W)), y0 = Math.max(0, Math.floor(b.y * H));
    let x1 = Math.min(W, Math.ceil((b.x + b.w) * W)), y1 = Math.min(H, Math.ceil((b.y + b.h) * H));
    if (x1 - x0 < 4 || y1 - y0 < 3) return { ...base, grew: false, bgShare: 0 };
    const bg = dominant(rgba, W, x0, y0, x1, y1), tol = o.tol || Math.max(12, Math.min(52, Math.round(3 * (bg.sd || 0) + 6)));
    const isBg = (x, y) => { const i = 4 * (y * W + x); return Math.abs(rgba[i] - bg[0]) <= tol && Math.abs(rgba[i + 1] - bg[1]) <= tol && Math.abs(rgba[i + 2] - bg[2]) <= tol; };
    let inBg = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (isBg(x, y)) inBg++;
    const share0 = inBg / ((x1 - x0) * (y1 - y0));
    if (share0 < 0.3) return { ...base, grew: false, bgShare: share0 }; // no flat background: not a plate-like box
    const bw0 = x1 - x0, bh0 = y1 - y0;
    // one side: walk from `from` towards `to` (exclusive); last background position reached, or null when the cap was hit
    const walk = (fixed, from, step, cap, gapMax, horiz, stop) => {
      let last = from - step, gap = 0, p = from;
      for (; p !== cap; p += step) {
        if (p === stop) return last; // a straight line across the plate (frame / plate edge): never walk through it
        if (horiz ? isBg(p, fixed) : isBg(fixed, p)) { last = p; gap = 0; } else if (++gap > gapMax) return last;
      }
      return gap > gapMax ? last : null; // reached the cap still inside the background
    };
    const side = (lines, from, step, cap, gapMax, horiz) => {
      const ext = [], hit = [];
      let stop = null; // first position where >= 90 % of the lines are not background (a frame line, not a character)
      for (let p = from; p !== cap && stop == null; p += step) {
        let nb = 0; for (const f of lines) if (!(horiz ? isBg(p, f) : isBg(f, p))) nb++;
        if (lines.length >= 4 && nb >= lines.length * 0.9) stop = p;
      }
      for (const f of lines) { const r = walk(f, from, step, cap, gapMax, horiz, stop); if (r == null) hit.push(f); else ext.push(r); }
      if (hit.length > lines.length / 2 || !ext.length) return from - step; // background runs past the cap: leave this side
      return median(ext);
    };
    const inner = (a, c) => { const m = Math.round((c - a) * 0.15), out = []; for (let v = a + m; v < c - m; v++) out.push(v); return out.length ? out : [Math.round((a + c) / 2)]; };
    for (let pass = 0; pass < 3; pass++) {
      if (pass !== 1) { // rows -> left / right
        const rows = inner(y0, y1), gap = Math.max(2, Math.round(Math.min(y1 - y0, (x1 - x0) / 3) * 0.45)), cap = Math.round(Math.max(bw0 * 0.6, (x1 - x0) * 0.6, (y1 - y0) * 2.5)) + 2;
        const L = side(rows, x0 - 1, -1, Math.max(-1, x0 - 1 - cap), gap, true), R = side(rows, x1, 1, Math.min(W, x1 + cap), gap, true);
        x0 = Math.min(x0, Math.max(0, L)); x1 = Math.max(x1, Math.min(W, R + 1));
      } else { // columns -> top / bottom
        const cols = inner(x0, x1), gap = Math.max(2, Math.round(Math.max(y1 - y0, (x1 - x0) / 4) * 0.8)), cap = Math.round(Math.max(bh0 * 1.6, (y1 - y0) * 1.6, (x1 - x0) * 0.5)) + 2;
        const T = side(cols, y0 - 1, -1, Math.max(-1, y0 - 1 - cap), gap, false), B = side(cols, y1, 1, Math.min(H, y1 + cap), gap, false);
        y0 = Math.min(y0, Math.max(0, T)); y1 = Math.max(y1, Math.min(H, B + 1));
      }
    }
    let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (isBg(x, y)) n++;
    const g = { x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H };
    const out = union(base, g);
    return { ...out, grew: out.w > base.w + 1e-9 || out.h > base.h + 1e-9, bgShare: n / ((x1 - x0) * (y1 - y0)), bg: bg.map(v => Math.round(v)) };
  }
  /**
   * Plate-likeness of a (grown) box, 0..1: aspect (car plate ~2.2:1, motorcycle ~1.45:1), a flat background covering
   * 40-90 % of the box, ink that contrasts with it (8-50 % of the box), and 1-3 text bands.
   */
  function plateScore(rgba, W, H, b) { return plateFeatures(rgba, W, H, b).score; }
  /** plateScore() with its parts: {score, ar, bgShare, ink, ring (share of the surrounding ring that is still background)} */
  function plateFeatures(rgba, W, H, b) {
    const none = { score: 0, ar: 0, bgShare: 0, ink: 0, ring: 1, conn: 0 };
    const x0 = Math.max(0, Math.floor(b.x * W)), y0 = Math.max(0, Math.floor(b.y * H)), x1 = Math.min(W, Math.ceil((b.x + b.w) * W)), y1 = Math.min(H, Math.ceil((b.y + b.h) * H));
    const w = x1 - x0, h = y1 - y0;
    if (w < 20 || h < 10) return none;
    const sizeS = Math.min(1, w / 40) * Math.min(1, h / 18);
    const ar = w / h, gs = (v, mu, s) => Math.exp(-Math.pow(Math.log(v / mu) / s, 2));
    const arS = Math.max(gs(ar, 2.2, 0.35), 0.9 * gs(ar, 1.45, 0.22));
    const bg = dominant(rgba, W, x0, y0, x1, y1), bgL = (bg[0] * 77 + bg[1] * 150 + bg[2] * 29) >> 8;
    let nb = 0, ni = 0; const gray = new Uint8Array(w * h), M = new Uint8Array(w * h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = 4 * (y * W + x), d = Math.max(Math.abs(rgba[i] - bg[0]), Math.abs(rgba[i + 1] - bg[1]), Math.abs(rgba[i + 2] - bg[2]));
      const l = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
      if (d <= 52) { nb++; M[(y - y0) * w + x - x0] = 1; } else if (Math.abs(l - bgL) >= 60 || d >= 110) ni++;
      gray[(y - y0) * w + x - x0] = bgL < 110 ? 255 - l : l; // dark-on-light for the band count
    }
    const N = w * h, bs = nb / N, is = ni / N;
    // the background must END at the box: a box whose surrounding ring is still plate background is only part of a plate
    const tol = Math.max(12, Math.min(52, Math.round(3 * (bg.sd || 0) + 6))), rw = Math.max(2, Math.round(h * 0.08));
    let rn = 0, rb = 0;
    for (let y = Math.max(0, y0 - rw); y < Math.min(H, y1 + rw); y++) for (let x = Math.max(0, x0 - rw); x < Math.min(W, x1 + rw); x++) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      const i = 4 * (y * W + x); rn++;
      if (Math.abs(rgba[i] - bg[0]) <= tol && Math.abs(rgba[i + 1] - bg[1]) <= tol && Math.abs(rgba[i + 2] - bg[2]) <= tol) rb++;
    }
    // a plate background is ONE connected surface around the characters; a box around text where the ink colour
    // dominates has many separate pieces (one per glyph)
    let big = 0; const st = [];
    for (let i = 0; i < w * h; i++) {
      if (M[i] !== 1) continue;
      let n = 0; M[i] = 2; st.push(i);
      while (st.length) {
        const j = /** @type {number} */ (st.pop()), x = j % w; n++;
        if (x > 0 && M[j - 1] === 1) { M[j - 1] = 2; st.push(j - 1); }
        if (x < w - 1 && M[j + 1] === 1) { M[j + 1] = 2; st.push(j + 1); }
        if (j >= w && M[j - w] === 1) { M[j - w] = 2; st.push(j - w); }
        if (j + w < w * h && M[j + w] === 1) { M[j + w] = 2; st.push(j + w); }
      }
      if (n > big) big = n;
    }
    const conn = nb ? big / nb : 0, connS = conn >= 0.7 ? 1 : conn <= 0.4 ? 0.2 : 0.2 + (conn - 0.4) / 0.3 * 0.8;
    const ring = rn ? rb / rn : 0, outS = ring <= 0.35 ? 1 : ring >= 0.85 ? 0.25 : 1 - (ring - 0.35) / 0.5 * 0.75;
    const bgS = bs < 0.3 ? 0 : bs < 0.45 ? (bs - 0.3) / 0.15 : bs > 0.94 ? 0.2 : 1;
    const inkS = is < 0.04 ? is / 0.04 * 0.5 : is > 0.55 ? 0.3 : 1;
    const nBands = splitLines(gray, w, h).length;
    const bandS = nBands >= 1 && nBands <= 3 ? 1 : 0.5;
    return { score: Math.round(arS * bgS * inkS * bandS * outS * sizeS * connS * 1000) / 1000, ar, bgShare: bs, ink: is, ring, conn };
  }
  /**
   * Flat-colour regions with holes (a plate background around its characters): smoothed frame (<= 240 px wide), flood fill
   * between neighbours that differ by <= o.diff per channel, components with a plate-like bounding box (aspect 0.9-6,
   * 35-95 % filled because the characters are holes). A proposal source that does not depend on text edges, so it also
   * finds small 3-line motorcycle plates. -> [{x, y, w, h, score}] normalised.
   * @param {Uint8Array|Uint8ClampedArray} rgba @param {number} W @param {number} H @param {{diff?: number, maxW?: number, max?: number}} [o]
   */
  function flatRegions(rgba, W, H, o = {}) {
    const k = Math.max(1, Math.ceil(W / (o.maxW || 240))), w = Math.floor(W / k), h = Math.floor(H / k), N = w * h;
    if (w < 8 || h < 8) return [];
    const C = new Float32Array(N * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { // box-filter down-sample (k x k) = smoothing
      let r = 0, gg = 0, b = 0;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { const i = 4 * ((y * k + dy) * W + x * k + dx); r += rgba[i]; gg += rgba[i + 1]; b += rgba[i + 2]; }
      const j = 3 * (y * w + x), n = k * k; C[j] = r / n; C[j + 1] = gg / n; C[j + 2] = b / n;
    }
    const S = new Float32Array(N * 3); // 3 x 3 blur
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
      let s2 = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) { s2 += C[3 * (yy * w + xx) + c]; n++; } }
      S[3 * (y * w + x) + c] = s2 / n;
    }
    const diff = o.diff || 14, lab = new Int32Array(N), out = [], stack = [];
    const near = (a, b) => Math.abs(S[3 * a] - S[3 * b]) <= diff && Math.abs(S[3 * a + 1] - S[3 * b + 1]) <= diff && Math.abs(S[3 * a + 2] - S[3 * b + 2]) <= diff;
    let id = 0;
    for (let i = 0; i < N; i++) {
      if (lab[i]) continue;
      id++; let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0;
      lab[i] = id; stack.push(i);
      while (stack.length) {
        const j = /** @type {number} */ (stack.pop()), x = j % w, y = (j - x) / w;
        area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && !lab[j - 1] && near(j, j - 1)) { lab[j - 1] = id; stack.push(j - 1); }
        if (x < w - 1 && !lab[j + 1] && near(j, j + 1)) { lab[j + 1] = id; stack.push(j + 1); }
        if (y > 0 && !lab[j - w] && near(j, j - w)) { lab[j - w] = id; stack.push(j - w); }
        if (y < h - 1 && !lab[j + w] && near(j, j + w)) { lab[j + w] = id; stack.push(j + w); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1, ar = bw / bh, fill = area / (bw * bh);
      if (bw < 10 || bh < 6 || bw > w * 0.7 || bh > h * 0.7 || ar < 0.9 || ar > 6 || fill < 0.35 || fill > 0.95) continue;
      out.push({ x: x0 / w, y: y0 / h, w: bw / w, h: bh / h, score: Math.round(fill * 1000) / 1000 });
    }
    return out.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, o.max || 12);
  }
  /**
   * Plate finder: proposals (classical edge-density finder on luma, contrast-stretched luma at night, and the colour
   * contrast channel; plus o.extra boxes, e.g. from a plate-detector model) -> stacked text lines merged into one plate
   * box (main line + province line, motorcycle 3-line plates) -> each grown to the plate background (growToPlate) ->
   * scored by plate structure (plateScore) -> NMS. -> [{x, y, w, h, score, src, prop}] normalised, best first.
   * @param {Uint8Array|Uint8ClampedArray} rgba @param {number} W @param {number} H
   * @param {{extra?: any[], max?: number}} [o]
   */
  function findPlates(rgba, W, H, o = {}) {
    const gray = lumaOf(rgba, W, H), props = [];
    const add = (arr, src) => { for (const b of arr) props.push({ x: b.x, y: b.y, w: b.w, h: b.h, score: b.score, src }); };
    add(findCandidates(gray, W, H, { max: 8, minW: 0.03 }), "edge");
    if (lumaMean(gray) < 80) add(findCandidates(stretch(gray), W, H, { max: 6, minW: 0.03 }), "edge-night");
    add(findCandidates(chromaOf(rgba, W, H), W, H, { max: 6, minW: 0.03, minEdge: 30 }), "colour");
    add(findCandidates(gray, W, H, { max: 8, minW: 0.02, density: 0.12, arMin: 0.9 }), "loose"); // small / 3-line plates
    add(flatRegions(rgba, W, H), "flat");
    for (const b of o.extra || []) props.push({ x: b.x, y: b.y, w: b.w, h: b.h, score: b.score == null ? 0.5 : b.score, src: b.src || "model" });
    const n0 = props.length;
    for (let i = 0; i < n0; i++) for (let j = 0; j < n0; j++) { // stack text lines into one plate box
      const a = props[i], c = props[j];
      if (i === j || c.y <= a.y) continue;
      const ov = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x), gap = c.y - (a.y + a.h);
      if (ov > 0.5 * Math.min(a.w, c.w) && gap < 0.9 * Math.max(a.h, c.h) && gap > -0.5 * Math.min(a.h, c.h)) props.push({ ...union(a, c), score: (a.score + c.score) / 2, src: "lines" });
    }
    const out = [], sm = blur3(rgba, W, H);
    for (const p of props) {
      const g = growToPlate(sm, W, H, p), f = plateFeatures(sm, W, H, g);
      if (f.score <= 0) continue;
      // a confident model box is not overruled by the hand-made structure score (dirty / embossed / framed plates)
      const sc = (p.src === "yunet" || p.src === "model") && p.score >= 0.9 && f.score >= 0.15 ? Math.max(f.score, 0.85 * p.score) : f.score * (0.5 + 0.5 * Math.min(1, p.score * 2));
      out.push({ x: g.x, y: g.y, w: g.w, h: g.h, score: Math.round(sc * 1000) / 1000, src: p.src, prop: { x: p.x, y: p.y, w: p.w, h: p.h }, ring: Math.round(f.ring * 100) / 100 });
    }
    // nesting: a CLOSED plate-like box (its surrounding ring is not its background) inside a much larger one means the
    // larger one is the vehicle body around the plate; an open box (ring still background) inside a plate-like box that
    // scores nearly as well is only a text line of that plate
    const pen = new Map();
    for (const a of out) for (const b of out) {
      if (a === b || b.w * b.h <= a.w * a.h * 1.3) continue;
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      if (ix * iy < 0.85 * a.w * a.h) continue;
      if (a.ring <= 0.35 && b.w * b.h >= a.w * a.h * 2.5 && a.score >= Math.max(0.5, 0.6 * b.score)) pen.set(b, Math.min(pen.get(b) || 1, 0.5));
      else if (a.ring > 0.35 && b.score >= 0.8 * a.score) pen.set(a, Math.min(pen.get(a) || 1, 0.7));
    }
    for (const [a, k] of pen) a.score = Math.round(a.score * k * 1000) / 1000;
    for (const a of out) delete a.ring;
    return nms(out, 0.5).slice(0, o.max || 5);
  }

  /* ---------------- LPD-YuNet decoding (OpenCV Zoo, Apache-2.0): priors + 4 corner points (pure) ---------------- */
  const YN = Object.freeze({ W: 320, H: 240, steps: [8, 16, 32, 64], min: [[10, 16, 24], [32, 48], [64, 96], [128, 192, 256]], variance: 0.1 });
  let ynPriors = null;
  function yunetPriors() {
    if (ynPriors) return ynPriors;
    const f2 = [Math.floor(Math.floor((YN.H + 1) / 2) / 2), Math.floor(Math.floor((YN.W + 1) / 2) / 2)], fm = [];
    let f = f2; for (let k = 0; k < 4; k++) { f = [Math.floor(f[0] / 2), Math.floor(f[1] / 2)]; fm.push(f); }
    const p = [];
    fm.forEach((m, k) => { for (let i = 0; i < m[0]; i++) for (let j = 0; j < m[1]; j++) for (const s of YN.min[k]) p.push((j + 0.5) * YN.steps[k] / YN.W, (i + 0.5) * YN.steps[k] / YN.H,
      s / YN.W, s / YN.H); });
    ynPriors = new Float32Array(p);
    return ynPriors;
  }
  /**
   * loc [N,14], conf [N,2], iou [N,1] -> [{x, y, w, h, score, quad:[x,y]*4}] normalised to the model input, after NMS.
   * score = sqrt(cls * clamp(iou)) as in the reference implementation.
   */
  function yunetDecode(loc, conf, iouS, o = {}) {
    const P = yunetPriors(), N = P.length / 4, thr = o.thr == null ? 0.6 : o.thr, out = [];
    for (let k = 0; k < N; k++) {
      const s = Math.sqrt(Math.max(0, conf[2 * k + 1]) * Math.min(1, Math.max(0, iouS[k])));
      if (s < thr) continue;
      const cx = P[4 * k], cy = P[4 * k + 1], sw = P[4 * k + 2], sh = P[4 * k + 3], q = [];
      for (const a of [4, 6, 10, 12]) q.push(cx + loc[14 * k + a] * YN.variance * sw, cy + loc[14 * k + a + 1] * YN.variance * sh);
      const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]], x = Math.min(...xs), y = Math.min(...ys);
      out.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, score: Math.round(s * 1000) / 1000, quad: q });
    }
    return nms(out, o.nms || 0.3);
  }

  /* ---------------- synthetic demo set (pure spec, seeded; drawn by GateKit.drawScene) ---------------- */
  /** mulberry32: small seeded PRNG -> () => [0, 1) */
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const PLATE_COLOURS = Object.freeze({
    white: { bg: "#fbfbf7", fg: "#111111" }, yellow: { bg: "#f5c400", fg: "#111111" }, green: { bg: "#1f7a3a", fg: "#ffffff" },
    red: { bg: "#fbfbf7", fg: "#c8102e" }, blue: { bg: "#fbfbf7", fg: "#1b3fa0" }
  });
  /**
   * The demo-set DEFINITION (fixed before any measurement — docs/GATE.md "Detection demo set"; do not tune it to a
   * result). 8 categories x perCat scenes on a 640 x 360 frame: white / yellow / green (white text) / red text / blue text
   * car plates in daylight, motorcycle 3-line plates (white, daylight), night (the five car colours in turn) and "none"
   * (no plate: false-trigger check).
   */
  const DEMO_SET = Object.freeze({
    seed: 20261108, perCat: 20, frame: [640, 360], cats: ["white", "yellow", "green", "red", "blue", "moto", "night", "none"],
    carW: [120, 280], carAspect: 240 / 112, motoW: [90, 170], motoAspect: 1.42, cx: [0.25, 0.75], cy: [0.45, 0.8], rot: [-6, 6],
    occlP: 0.25, occlFrac: [0.08, 0.18], noiseDay: 4, noiseNight: 10, nightScene: [0.18, 0.35], nightPlate: [0.55, 0.85], glareP: 0.5,
    bodies: ["#e8e8e8", "#b9bec6", "#2a2d33", "#8e1b1b", "#24477a", "#6d737f"], grounds: ["#4b5263", "#5a5f66", "#3d4148", "#6b6f73"]
  });
  /** -> [{i, cat, colour, key, text, line1, line3, prov, moto, night, bg, fg, cx, cy, pw, ph, rot, occl, body, ground, noise, glare, nightK, seed}] */
  function demoSpec(o = {}) {
    const D = { ...DEMO_SET, ...o }, R = rng(D.seed), out = [];
    const U = (a, b) => a + (b - a) * R(), pick = a => a[Math.floor(R() * a.length) % a.length];
    const digits = n => { let s = String(1 + Math.floor(R() * 9)); for (let k = 1; k < n; k++) s += String(Math.floor(R() * 10)); return s; };
    const COLS = Object.keys(PLATE_COLOURS);
    for (const cat of D.cats) for (let k = 0; k < D.perCat; k++) {
      const moto = cat === "moto", night = cat === "night", none = cat === "none";
      const colour = moto ? "white" : night ? COLS[k % COLS.length] : none ? "" : cat;
      const pre = R() < (moto ? 0.3 : 0.5) ? String(1 + Math.floor(R() * 9)) : "";
      let letters = pick([...CONS]) + pick([...CONS]); if (moto && R() < 0.3) letters += pick([...CONS]);
      const num = digits(1 + Math.floor(R() * 4)), key = pre + letters + num;
      const pw = Math.round(moto ? U(D.motoW[0], D.motoW[1]) : U(D.carW[0], D.carW[1])), ph = Math.round(pw / (moto ? D.motoAspect : D.carAspect));
      const [FW, FH] = D.frame, mx = pw / 2 + 10, my = ph / 2 + 10;
      const cx = Math.round(Math.min(FW - mx, Math.max(mx, U(D.cx[0], D.cx[1]) * FW))), cy = Math.round(Math.min(FH - my, Math.max(my, U(D.cy[0], D.cy[1]) * FH)));
      const occl = R() < D.occlP ? { side: pick(["l", "r", "b"]), frac: Math.round(U(D.occlFrac[0], D.occlFrac[1]) * 100) / 100 } : null;
      const c = colour ? PLATE_COLOURS[colour] : { bg: "", fg: "" };
      out.push({ i: out.length, cat, colour, key, text: pre + letters + " " + num, line1: pre + letters, line3: num, prov: pick(PROVINCES).id, moto, night, none,
        bg: c.bg, fg: c.fg, cx, cy, pw, ph, rot: Math.round(U(D.rot[0], D.rot[1]) * 10) / 10, occl, body: pick(D.bodies), ground: pick(D.grounds),
        noise: night ? D.noiseNight : D.noiseDay, glare: night && R() < D.glareP, nightK: [Math.round(U(D.nightScene[0], D.nightScene[1]) * 100) / 100, Math.round(U(D.nightPlate[0],
          D.nightPlate[1]) * 100) / 100],
        seed: Math.floor(R() * 4294967296) });
    }
    return out;
  }

  /* ---------------- detection evaluation (pure) ---------------- */
  /**
   * items = [{cat, truth:{x,y,w,h}|null, boxes:[...] best first, read?, key?, ms?, autoMin?}] -> per category:
   * det = top-1 box IoU >= 0.5 with the true plate, det3 = any of the top 3, read = exact plate key (when OCR ran),
   * fp = plate-less frames whose top box scores >= autoMin (would start an auto-read). Wilson 95 % intervals.
   */
  function detEval(items, o = {}) {
    const thr = o.iou || 0.5, autoMin = o.autoMin == null ? AUTO_MIN : o.autoMin, cats = {};
    for (const it of items || []) {
      const c = cats[it.cat] || (cats[it.cat] = { n: 0, det: 0, det3: 0, readN: 0, read: 0, fp: 0, neg: 0, ms: [] });
      const B = it.boxes || [];
      if (!it.truth) { c.neg++; if (B[0] && B[0].score >= autoMin) c.fp++; continue; }
      c.n++;
      if (B[0] && iou(B[0], it.truth) >= thr) c.det++;
      if (B.slice(0, 3).some(b => iou(b, it.truth) >= thr)) c.det3++;
      if (it.read != null) { c.readN++; if (normalize(it.read) === normalize(it.key)) c.read++; }
      if (it.ms != null) c.ms.push(it.ms);
    }
    const res = {};
    for (const [k, c] of Object.entries(cats)) {
      res[k] = { n: c.n, det: wilson(c.det, c.n), det3: wilson(c.det3, c.n), read: wilson(c.read, c.readN), neg: c.neg, fp: wilson(c.fp, c.neg),
        msMedian: c.ms.length ? median(c.ms) : null, target: c.n ? (c.det / c.n >= (o.target || 0.9) ? "met" : "not met") : "—" };
    }
    return res;
  }

  /* ---------------- records ---------------- */
  /** CSV with RFC 4180 quoting; cells starting with = + - @ are prefixed with ' (spreadsheet formula injection) */
  function toCSV(rows, cols) {
    const cell = v => {
      let s = v == null ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return "﻿" + [cols.map(c => cell(c.label || c.k)).join(",")].concat(rows.map(r => cols.map(c => cell(typeof c.v === "function" ? c.v(r) : r[c.k])).join(","))).join("\r\n");
  }
  const DAY = 86400000;
  /**
   * retention: records [{id, kind:'ev'|'img'|'rc'|'au'|'pass'|..., at}] · cfg = {imgDays=7 (7-30), logDays=90, receiptYears=5}
   * images older than imgDays, events/audit older than logDays, receipts older than receiptYears are dropped; other kinds stay.
   */
  function purge(records, now, cfg = {}) {
    const img = Math.min(30, Math.max(1, cfg.imgDays || 7)) * DAY, log = Math.max(1, cfg.logDays || 90) * DAY, rc = Math.max(1, cfg.receiptYears || 5) * 365.25 * DAY;
    const keep = [], drop = [];
    for (const r of records || []) {
      const age = now - (r.at || 0);
      const lim = r.kind === "img" ? img : r.kind === "ev" || r.kind === "au" || r.kind === "chk" ? log : r.kind === "rc" || r.kind === "shift" ? rc : Infinity;
      (age > lim ? drop : keep).push(r);
    }
    return { keep, drop };
  }
  function fnv(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ("0000000" + h.toString(16)).slice(-8); }
  const AUDIT_FIELDS = ["seq", "at", "ref", "field", "from", "to", "by", "why", "prev"];
  const auditBody = e => JSON.stringify(AUDIT_FIELDS.map(k => (e[k] == null ? "" : e[k])));
  /** append-only correction log: each entry carries the hash of the previous one; returns the new entry (chain unchanged) */
  function auditAppend(chain, e) {
    const last = chain && chain.length ? chain[chain.length - 1] : null;
    const x = { seq: last ? last.seq + 1 : 1, at: e.at || Date.now(), ref: String(e.ref || ""), field: String(e.field || ""), from: e.from == null ? "" : String(e.from), to: e.to == null ? "" : String(e.to), by: String(e.by || ""), why: String(e.why || ""), prev: last ? last.hash : "0" };
    return { ...x, hash: fnv(auditBody(x)) };
  }
  /** -> {ok, bad: first broken seq | null} — an edited, removed or reordered entry breaks the chain */
  function auditVerify(chain) {
    let prev = "0";
    for (let i = 0; i < (chain || []).length; i++) {
      const e = chain[i];
      if (e.seq !== i + 1 || e.prev !== prev || fnv(auditBody(e)) !== e.hash) return { ok: false, bad: e.seq || i + 1 };
      prev = e.hash;
    }
    return { ok: true, bad: null };
  }

  /* ---------------- on-site accuracy check ---------------- */
  // tapsDay: PROPOSAL (owner to confirm) — at most 10 % of daytime reads should need the guard to tap the plate; informational,
  // it does not change the verdict (docs/FIELD-PILOT.md)
  const TARGETS = { plate: 0.95, char: 0.98, minReads: 100, minNight: 30, tapsDay: 0.10 };
  function wilson(x, n) { const S = Site(); if (S) return S.wilson(x, n); if (!(n > 0)) return { x, n: 0, p: null, lo: 0, hi: 1 }; const z = 1.959964, p = x / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return { x, n, p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) }; }
  /**
   * rows = [{read: key the system suggested, truth: key the guard confirmed (or read when ticked ✓), ok?: guard tick,
   *          provRead?, provTruth?, night: boolean, tapped?: boolean (the guard had to tap / draw the plate box),
   *          manual?: true (saved with no system read at all — counted as a tap, left out of the accuracy numbers)}]
   *          — one per system read during the check, plus one per manual save.
   * -> {n, plate, char, day, night, province, taps, tapsNight, verdict, need, metrics:[{k, v, ci, target, ok}]}   (pure, no images)
   */
  function accuracy(rows, o = {}) {
    const tg = { ...TARGETS, ...(o.targets || {}) };
    // manual rows (saved with no system read: the finder missed and the guard typed the plate) count only for "taps needed"
    const ALL = (rows || []).filter(r => r && (r.truth || r.ok != null)), R = ALL.filter(r => !r.manual);
    const okOf = r => (r.ok != null ? !!r.ok : normalize(r.read) === normalize(r.truth));
    const part = A => wilson(A.filter(okOf).length, A.length);
    let cOk = 0, cN = 0;
    for (const r of R) {
      const t = [...normalize(r.truth || r.read || "")];
      if (!t.length) continue;
      const d = okOf(r) ? 0 : lev(normalize(r.read || ""), t.join(""));
      cN += t.length; cOk += Math.max(0, t.length - d);
    }
    const plate = part(R), char = wilson(cOk, cN), day = part(R.filter(r => !r.night)), night = part(R.filter(r => r.night));
    const PR = R.filter(r => r.provTruth);
    const province = wilson(PR.filter(r => r.provRead === r.provTruth).length, PR.length);
    const TR = ALL.filter(r => r.tapped != null || r.manual), TD = TR.filter(r => !r.night), TN = TR.filter(r => r.night);
    const tp = r => !!(r.tapped || r.manual);
    const taps = wilson(TD.filter(tp).length, TD.length), tapsNight = wilson(TN.filter(tp).length, TN.length);
    const S = Site(), checks = [];
    const chk = (w, t, group) => ({ v: w.p, lo: w.lo, hi: w.hi, ok: v => v >= t, bad: (lo, hi) => hi < t, sure: lo => lo >= t,
      need: () => ({ group, more: S && S.needMoreProp ? S.needMoreProp(w.x, w.n, t, ">=") : null }) });
    checks.push(chk(plate, tg.plate, "reads"), chk(char, tg.char, "reads"));
    const mins = [{ group: "reads", have: R.length, min: tg.minReads }, { group: "night", have: night.n, min: tg.minNight }];
    const enough = R.length >= tg.minReads && night.n >= tg.minNight;
    let j;
    if (S && S.judge) j = S.judge(enough, checks, mins);
    else {
      const pts = checks.every(c => c.v != null && c.ok(c.v)), fail = checks.some(c => c.v != null && c.bad(c.lo, c.hi));
      j = { verdict: fail ? "fail" : pts && enough && checks.every(c => c.sure(c.lo)) ? "pass" : pts ? "ontrack" : "more", need: mins.filter(m => m.have < m.min).map(m => ({ group: m.group, more: m.min - m.have })) };
    }
    const pct = w => (w.p == null ? "—" : (w.p * 100).toFixed(1) + "%"), ci = w => (w.p == null ? "—" : (w.lo * 100).toFixed(1) + "–" + (w.hi * 100).toFixed(1) + "%");
    const metrics = [
      { k: "plate", v: pct(plate), ci: ci(plate), target: "≥ " + tg.plate * 100 + "%", ok: plate.p == null ? null : plate.p >= tg.plate, n: plate.n },
      { k: "char", v: pct(char), ci: ci(char), target: "≥ " + tg.char * 100 + "%", ok: char.p == null ? null : char.p >= tg.char, n: char.n },
      { k: "day", v: pct(day), ci: ci(day), target: "—", ok: null, n: day.n },
      { k: "night", v: pct(night), ci: ci(night), target: "—", ok: null, n: night.n },
      { k: "province", v: pct(province), ci: ci(province), target: "—", ok: null, n: province.n },
      { k: "taps", v: pct(taps), ci: ci(taps), target: "≤ " + Math.round(tg.tapsDay * 100) + "%", ok: taps.p == null ? null : taps.p <= tg.tapsDay, n: taps.n },
      { k: "tapsNight", v: pct(tapsNight), ci: ci(tapsNight), target: "—", ok: null, n: tapsNight.n }
    ];
    return { kind: "gate", n: R.length, manual: ALL.length - R.length, plate, char, day, night, province, taps, tapsNight, verdict: j.verdict, need: j.need || [], metrics, targets: tg };
  }

  /* ---------------- DOM: detector + OCR hooks ---------------- */
  /** @type {null | ((c: HTMLCanvasElement) => Promise<any[]>)} */
  let detector = null, detAsProposals = false;
  /**
   * plug a reviewed plate-detector model in (e.g. the YOLOX-nano trained with tools/train-plate-detector.ipynb).
   * o.proposals: true = its boxes join the built-in finder as proposals (grown to the plate, scored, merged); false
   * (default, as before) = its boxes are used as they are.
   * @param {any} fn @param {{proposals?: boolean}} [o]
   */
  function registerDetector(fn, o = {}) { detector = typeof fn === "function" ? fn : null; detAsProposals = !!o.proposals; return !!detector; }
  function grayOf(src, maxW = 320) {
    const W0 = src.width, H0 = src.height, k = Math.min(1, maxW / W0), W = Math.max(1, Math.round(W0 * k)), H = Math.max(1, Math.round(H0 * k));
    let data;
    if (src.data) data = src.data;
    else {
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));
      x.drawImage(src, 0, 0, W, H); data = x.getImageData(0, 0, W, H).data;
    }
    const w = src.data ? W0 : W, h = src.data ? H0 : H, gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) gray[i] = (data[4 * i] * 77 + data[4 * i + 1] * 150 + data[4 * i + 2] * 29) >> 8;
    return { gray, W: w, H: h };
  }
  /** RGBA pixels of a canvas / ImageData, scaled to at most maxW wide -> {rgba, W, H} */
  function rgbaOf(src, maxW = 480) {
    if (src.data) return { rgba: src.data, W: src.width, H: src.height };
    const W0 = src.width, H0 = src.height, k = Math.min(1, maxW / W0), W = Math.max(1, Math.round(W0 * k)), H = Math.max(1, Math.round(H0 * k));
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));
    x.drawImage(src, 0, 0, W, H);
    return { rgba: x.getImageData(0, 0, W, H).data, W, H };
  }
  /** top box score at or above which the auto-read loop starts a read (findPlates scale, 0..1) */
  const AUTO_MIN = 0.25;
  /* LPD-YuNet (OpenCV Zoo, Apache-2.0, trained on Chinese plates): an optional second proposal source. Loaded on demand
   * (with the OCR model); never required — the classical finder works without it. */
  const DET_URL = "vendor/models/plate-det/license_plate_detection_lpd_yunet_2023mar.onnx";
  let detP = null, detS = null;
  function loadPlateDet() {
    if (detP) return detP;
    detP = (async () => {
      const ort = g.ort;
      if (!ort) throw new Error("ort");
      ort.env.wasm.wasmPaths = new URL("vendor/ort/", location.href).href;
      ort.env.wasm.numThreads = 1;
      const note = g.LQModels && g.LQModels.loading ? g.LQModels.loading({ label: "Plate finder (LPD-YuNet)", mb: 4.1, url: DET_URL }) : null;
      try {
        detS = await ort.InferenceSession.create(new URL(DET_URL, location.href).href, { executionProviders: ["wasm"], graphOptimizationLevel: "all", logSeverityLevel: 3 });
        if (note) note.done();
        return detS;
      } catch (e) { if (note) note.fail(); throw e; }
    })();
    detP.catch(() => { detP = null; });
    return detP;
  }
  /**
   * LPD-YuNet on the whole frame and on 2 x 2 overlapping tiles (the model wants the plate to fill a good part of its
   * 320 x 240 input). -> boxes normalised to the frame, after NMS. Needs loadPlateDet() first; [] otherwise.
   * @param {HTMLCanvasElement} canvas @param {{tiles?: boolean, thr?: number}} [o]
   */
  async function modelBoxes(canvas, o = {}) {
    if (!detS) return [];
    const ort = g.ort, Wf = canvas.width, Hf = canvas.height, out = [];
    const views = [[0, 0, 1, 1]];
    if (o.tiles !== false) for (const ty of [0, 0.4]) for (const tx of [0, 0.4]) views.push([tx, ty, 0.6, 0.6]);
    const c = document.createElement("canvas"); c.width = YN.W; c.height = YN.H;
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));
    for (const [vx, vy, vw, vh] of views) {
      x.drawImage(canvas, vx * Wf, vy * Hf, vw * Wf, vh * Hf, 0, 0, YN.W, YN.H);
      const d = x.getImageData(0, 0, YN.W, YN.H).data, P = YN.W * YN.H, buf = new Float32Array(3 * P);
      for (let i = 0; i < P; i++) { buf[i] = d[4 * i + 2]; buf[P + i] = d[4 * i + 1]; buf[2 * P + i] = d[4 * i]; } // BGR 0..255
      const r = await detS.run({ [detS.inputNames[0]]: new ort.Tensor("float32", buf, [1, 3, YN.H, YN.W]) });
      for (const b of yunetDecode(r.loc.data, r.conf.data, r.iou.data, { thr: o.thr })) {
        out.push({ x: vx + b.x * vw, y: vy + b.y * vh, w: b.w * vw, h: b.h * vh, score: b.score, src: "yunet", quad: b.quad.map((v, i) => (i % 2 ? vy + v * vh : vx + v * vw)) });
      }
    }
    return nms(out, 0.4);
  }
  /**
   * plate boxes for one frame, best first: a registered detector when there is one, else findPlates() over the classical
   * proposals plus LPD-YuNet boxes when that model is loaded. o.model: "auto" (default) = run the model only when the
   * classical top box scores < 0.6 (it costs ~0.5 s per frame on WASM), true = always, false = never.
   * @param {HTMLCanvasElement} canvas @param {{model?: boolean|"auto", tiles?: boolean, maxW?: number, max?: number}} [o]
   */
  async function detect(canvas, o = {}) {
    let own = [];
    if (detector) {
      try { const r = await detector(canvas); if (Array.isArray(r)) { if (!detAsProposals) return r; own = r.map(b => ({ ...b,
        src: b.src || "model" })); } } catch { /* fall back to the built-in finder */ }
    }
    const { rgba, W, H } = rgbaOf(canvas, o.maxW || 480), mode = o.model == null ? "auto" : o.model;
    let res = findPlates(rgba, W, H, { max: o.max, extra: own });
    if (mode && detS && (mode !== "auto" || !res[0] || res[0].score < 0.6)) {
      let extra = [];
      try { extra = await modelBoxes(canvas, o); } catch { extra = []; }
      if (extra.length) res = findPlates(rgba, W, H, { extra: own.concat(extra), max: o.max });
    }
    // the guard can always tap the plate instead (readNow(box)); docs/GATE.md has the measured detection rates
    return res;
  }
  const OCR_URL = "vendor/models/plate-ocr-th/th_ppocrv5_mobile_rec.onnx", DICT_URL = "vendor/models/plate-ocr-th/dict.txt";
  let ocrP = null;
  function loadOcr() {
    if (ocrP) return ocrP;
    ocrP = (async () => {
      const ort = g.ort;
      if (!ort) throw new Error("ort");
      ort.env.wasm.wasmPaths = new URL("vendor/ort/", location.href).href;
      ort.env.wasm.numThreads = 1;
      try { ort.env.logLevel = "error"; } catch { /* older runtime */ }
      const note = g.LQModels && g.LQModels.loading ? g.LQModels.loading({ label: "Thai OCR (PP-OCRv5)", mb: 7.5, url: OCR_URL }) : null;
      try {
        const [session, dictTxt] = await Promise.all([
          ort.InferenceSession.create(new URL(OCR_URL, location.href).href, { executionProviders: ["wasm"], graphOptimizationLevel: "all", logSeverityLevel: 3 }),
          fetch(DICT_URL).then(r => { if (!r.ok) throw new Error("dict " + r.status); return r.text(); })
        ]);
        if (note) note.done();
        return { session, dict: dictTxt.replace(/\r/g, "").split("\n").filter((l, i, a) => l.length || i < a.length - 1) };
      } catch (e) { if (note) note.fail(); throw e; }
    })();
    ocrP.catch(() => { ocrP = null; });
    return ocrP;
  }
  /** one text line (canvas) -> {text, conf, chars} with the PP-OCRv5 Thai recogniser */
  /**
   * Tight text crop for the recogniser. PP-OCR rec models are trained on detector crops where the text fills most of the
   * line height; a loose box (text ~45% of the height) makes the read flip between correct and garbage on near-identical
   * images. Finds the ink bounding box (dark-on-light, or light-on-dark -> inverted), adds margins relative to the text
   * height and returns a dark-on-white canvas. Returns the input unchanged when no ink is found.
   * @param {HTMLCanvasElement} src @param {{mv?: number, mh?: number}} [o]
   */
  function tightText(src, o = {}) {
    const W = src.width, H = src.height;
    if (!(W > 4 && H > 4)) return src;
    const d = /** @type {CanvasRenderingContext2D} */ (src.getContext("2d", { willReadFrequently: true })).getImageData(0, 0, W, H).data;
    const L = new Uint8Array(W * H); let mn = 255, mx = 0, sum = 0;
    for (let i = 0; i < W * H; i++) { const v = (d[4 * i] * 77 + d[4 * i + 1] * 150 + d[4 * i + 2] * 29) >> 8; L[i] = v; if (v < mn) mn = v; if (v > mx) mx = v; sum += v; }
    if (mx - mn < 40) return src;
    const thr = (mn + mx) / 2, dark = sum / (W * H) < thr; // background darker than the midpoint -> light text
    const ink = v => (dark ? v > thr : v < thr);
    const rows = new Uint16Array(H), cols = new Uint16Array(W);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink(L[y * W + x])) { rows[y]++; cols[x]++; }
    const minR = Math.max(1, Math.round(W * 0.004)), minC = 1;
    let y0 = 0, y1 = H - 1, x0 = 0, x1 = W - 1;
    while (y0 < H && rows[y0] < minR) y0++;
    while (y1 > y0 && rows[y1] < minR) y1--;
    while (x0 < W && cols[x0] < minC) x0++;
    while (x1 > x0 && cols[x1] < minC) x1--;
    if (y0 >= y1 || x0 >= x1) return src;
    const h = y1 - y0 + 1, my = Math.round(h * (o.mv == null ? 0.2 : o.mv)), mxp = Math.round(h * (o.mh == null ? 0.5 : o.mh));
    const t = document.createElement("canvas"); t.width = x1 - x0 + 1 + 2 * mxp; t.height = h + 2 * my;
    const tx = /** @type {CanvasRenderingContext2D} */ (t.getContext("2d"));
    tx.fillStyle = dark ? "#000" : "#fff"; tx.fillRect(0, 0, t.width, t.height);
    tx.drawImage(src, x0, y0, x1 - x0 + 1, h, mxp, my, x1 - x0 + 1, h);
    if (dark) { tx.globalCompositeOperation = "difference"; tx.fillStyle = "#fff"; tx.fillRect(0, 0, t.width, t.height); tx.globalCompositeOperation = "source-over"; }
    return t;
  }
  async function recognize(band) {
    const m = await loadOcr(), ort = g.ort, H = 48;
    const W = Math.max(16, Math.min(960, Math.round((band.width / band.height) * H / 8) * 8 || 16));
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d", { willReadFrequently: true }));
    x.drawImage(band, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, buf = new Float32Array(3 * H * W), P = H * W;
    for (let i = 0; i < P; i++) { // BGR, (v/255 - 0.5) / 0.5
      buf[i] = d[4 * i + 2] / 127.5 - 1; buf[P + i] = d[4 * i + 1] / 127.5 - 1; buf[2 * P + i] = d[4 * i] / 127.5 - 1;
    }
    const out = await m.session.run({ [m.session.inputNames[0]]: new ort.Tensor("float32", buf, [1, 3, H, W]) });
    const t = out[m.session.outputNames[0]], [, T, C] = t.dims;
    return { ...ctcDecode(t.data, T, C, m.dict), T, inW: band.width };
  }
  /**
   * read one plate: box (normalised, from detect() or the guard's tap) is cropped from canvas, split into text bands and
   * each band recognised. Test seam: on localhost with ?fakedet, window.__LQ_FAKE_PLATE(now) -> {text, conf, province}.
   */
  async function readPlate(canvas, box, o = {}) {
    const LQD = g.LQDetect;
    if (LQD && LQD.isTest && LQD.isTest() && typeof g.__LQ_FAKE_PLATE === "function") {
      const f = g.__LQ_FAKE_PLATE(Date.now());
      if (!f) return null;
      const p = parse(f.text, { moto: !!o.moto });
      return p.ok ? { key: p.key, conf: f.conf == null ? 0.9 : f.conf, chars: [...p.key].map(c => ({ c, p: f.conf == null ? 0.9 : f.conf })), provinceText: f.provinceText || "", province: f.province || "", fake: true } : null;
    }
    const W0 = canvas.width, H0 = canvas.height;
    let b = box || { x: 0, y: 0, w: 1, h: 1 };
    // a proposal box may cover only the text line or start right of a thin leading "1": grow it to the plate background
    // first (never shrinks). A guard's drawn box is grown too (a tight drag around the letters only must not lose the "1");
    // o.grow === false keeps a box exactly as given
    if (box && o.grow !== false) { const px = rgbaOf(canvas, 640), gb = growToPlate(blur3(px.rgba, px.W, px.H), px.W, px.H, box); b = { x: gb.x, y: gb.y, w: gb.w, h: gb.h }; }
    // asymmetric margin: the optional leading digit sits at the far left of the plate and a finder box that starts a
    // little too far right silently cut it ("1กข" -> "กข"), so look further left than right
    const pad = 0.04, padL = 0.18, x0 = Math.max(0, (b.x - padL * b.w) * W0), y0 = Math.max(0, (b.y - pad * b.h) * H0);
    const cw = Math.min(W0 - x0, b.w * (1 + padL + pad) * W0), ch = Math.min(H0 - y0, b.h * (1 + 2 * pad) * H0);
    if (!(cw > 8 && ch > 6)) return null;
    const crop = document.createElement("canvas"), sc = Math.min(4, Math.max(1, 240 / cw));
    crop.width = Math.round(cw * sc); crop.height = Math.round(ch * sc);
    /** @type {CanvasRenderingContext2D} */ (crop.getContext("2d")).drawImage(canvas, x0, y0, cw, ch, 0, 0, crop.width, crop.height);
    let g0 = grayOf(crop, crop.width);
    // light text on a dark plate (e.g. white on green / blue): the recogniser expects dark text on light, so invert first
    let mn = 255, mx = 0; for (const v of g0.gray) { if (v < mn) mn = v; if (v > mx) mx = v; }
    const inverted = mx - mn > 40 && lumaMean(g0.gray) < (mn + mx) / 2; // background darker than the ink/background midpoint
    if (inverted) {
      const cx = /** @type {CanvasRenderingContext2D} */ (crop.getContext("2d"));
      cx.globalCompositeOperation = "difference"; cx.fillStyle = "#fff"; cx.fillRect(0, 0, crop.width, crop.height); cx.globalCompositeOperation = "source-over";
      g0 = grayOf(crop, crop.width);
    }
    const tb = trimBorder(g0.gray, g0.W, g0.H);
    const W = tb.x1 - tb.x0, H = tb.y1 - tb.y0, gray = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) gray.set(g0.gray.subarray((y + tb.y0) * g0.W + tb.x0, (y + tb.y0) * g0.W + tb.x1), y * W);
    const bands = splitLines(gray, W, H), lines = [];
    // ink touching the left edge of the plate crop on the first text line = a character may be cut off -> leftCut
    let inkLeft = false;
    if (bands.length && W > 8) {
      const b0 = bands[0], m = lumaMean(gray); let ink = 0, n = 0;
      for (let y = b0.y0; y < b0.y1; y++) for (let x = 0; x < 2; x++) { n++; if (gray[y * W + x] < m * 0.75) ink++; }
      inkLeft = n > 0 && ink / n >= 0.2;
    }
    const PX = Math.round(H * 0.08);
    for (const bd of bands.slice(0, 3)) {
      const bc = document.createElement("canvas"), m = Math.max(1, Math.round((bd.y1 - bd.y0) * 0.12));
      const y = Math.max(0, bd.y0 - m), h = Math.min(H, bd.y1 + m) - y, px = PX;
      bc.width = W + 2 * px; bc.height = h;
      const bx = /** @type {CanvasRenderingContext2D} */ (bc.getContext("2d"));
      bx.fillStyle = "#fff"; bx.fillRect(0, 0, bc.width, h); // quiet zone left / right, as in the recogniser's training lines
      bx.drawImage(crop, tb.x0, tb.y0 + y, W, h, px, 0, W, h);
      lines.push(await recognize(bc));
    }
    const r = fromOcr(lines, o);
    const used = { x: b.x, y: b.y, w: b.w, h: b.h };
    if (!r) return { key: "", conf: 0, chars: [], provinceText: lines.map(l => l.text).join(" "), lines, box: used, inkLeft };
    const gp = guessProvince(r.provinceText);
    // a glyph the recogniser skipped entirely (thin "1" -> nothing) still leaves ink left of the key's first character
    const ib = r.line >= 0 && bands[r.line] && lines[r.line] ? inkBefore(gray, W, H, bands[r.line], r.chars, lines[r.line], PX) : null;
    const p0 = parse(r.key, { moto: !!o.moto });
    let leadGuess = r.leadGuess || "", leadSuspect = r.leadSuspect || "";
    if (ib && !p0.prefix) { leadSuspect = leadSuspect || "ink"; if (ib.narrow && !leadGuess) leadGuess = "1" + r.key; }
    return { ...r, province: gp ? gp.id : "", lines, inverted, box: used, inkLeft, inkBefore: ib, leadGuess, leadSuspect,
      leftCut: b.x - padL * b.w <= 0.002 || inkLeft || !!leadSuspect };
  }
  /**
   * Ink left of the plate number's first character on its own text band (pure): the recogniser sometimes drops a thin
   * leading "1" without a trace. chars = the key's characters with CTC time steps t, line = recognize() result (T, inW).
   * A run of ink columns before the first character's run, as tall as >= 55 % of the band and not a full-height frame
   * line, -> {x0, x1, narrow (narrower than 0.6 of the character pitch)} else null.
   * @param {Uint8Array} gray @param {number} W @param {number} H @param {{y0:number,y1:number}} bd @param {any[]} chars @param {any} line @param {number} px
   */
  function inkBefore(gray, W, H, bd, chars, line, px) {
    const ts = (chars || []).filter(c => c.t != null && !c.look);
    if (!ts.length || !line || !line.T || !line.inW || (chars[0] && chars[0].look)) return null;
    const toX = t => ((t + 0.5) * line.inW) / line.T - px;
    const x0 = toX(ts[0].t), pitch = ts.length > 1 ? Math.max(4, (toX(ts[ts.length - 1].t) - x0) / (ts.length - 1)) : Math.max(4, (bd.y1 - bd.y0) * 0.6);
    const m = lumaMean(gray), bh = bd.y1 - bd.y0, minC = Math.max(2, Math.round(bh * 0.12));
    const col = x => { let c = 0; for (let y = bd.y0; y < bd.y1; y++) if (gray[y * W + x] < m * 0.75) c++; return c; };
    const runs = []; let s = -1;
    for (let x = 0; x <= W; x++) { const on = x < W && col(x) >= minC; if (on && s < 0) s = x; else if (!on && s >= 0) { runs.push([s, x]); s = -1; } }
    if (!runs.length) return null;
    let k = 0, best = Infinity; runs.forEach((r, i) => { const d = x0 < r[0] ? r[0] - x0 : x0 >= r[1] ? x0 - r[1] + 1 : 0; if (d < best) { best = d; k = i; } });
    for (let i = k - 1; i >= 0; i--) {
      const [a, c] = runs[i]; let top = bd.y1, bot = bd.y0, full = 0;
      for (let x = a; x < c; x++) {
        for (let y = bd.y0; y < bd.y1; y++) if (gray[y * W + x] < m * 0.75) { if (y < top) top = y; if (y > bot) bot = y; }
        let d = 0; for (let y = 0; y < H; y++) if (gray[y * W + x] < m * 0.75) d++;
        if (d > H * 0.8) full++;
      }
      if (full > (c - a) / 2) continue; // the plate's frame line, not a glyph
      if (bot - top + 1 >= bh * 0.55) return { x0: a, x1: c, narrow: c - a < pitch * 0.6, pitch: Math.round(pitch) };
    }
    return null;
  }

  return { CONS, normalize, parse, format, PROVINCES, provinceName, provinceList, guessProvince, LOOKALIKE, lookalike, lev, plateDist, match, vote, leadAlternatives,
    ctcDecode, fromOcr, plateChars, lumaMean, isNight, findCandidates, splitLines, trimBorder, toCSV, purge, auditAppend, auditVerify, fnv, TARGETS, accuracy,
    registerDetector, grayOf, detect, loadOcr, recognize, tightText, readPlate, OCR_URL, hasDOM,
    inkBefore, ONE_LIKE, iou, nms, lumaOf, chromaOf, stretch, blur3, flatRegions, growToPlate, plateScore, plateFeatures, findPlates,
    YN, yunetPriors, yunetDecode, rng, PLATE_COLOURS, DEMO_SET, demoSpec, detEval,
    AUTO_MIN, DET_URL, loadPlateDet, modelBoxes, rgbaOf, plateDetReady: () => !!detS };
});
