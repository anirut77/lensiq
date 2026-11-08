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
 *   LOOKALIKE pairs ข/ช ด/ต บ/ป ผ/ฝ ภ/ถ ม/ฆ 0/O 8/B 1/I — substitution cost 0.5 in plateDist()
 *   plateDist(a, b) -> weighted edit distance · lev(a, b) -> plain Levenshtein (code points)
 *   match(read, list, {max=1, province, ignoreProvince}) -> [{item, dist, exact, provinceOk}] best first
 *   vote(reads, {minAgree}) -> {key, conf, agree, n, chars:[{c,p}], low:[i]}|null   multi-frame per-character vote
 *   leadAlternatives(vote, reads, {moto, leftCut}) -> {alts, leadCheck, reason}   leading-digit readings for the guard to pick
 *   ctcDecode(data, T, C, dict) -> {text, conf, chars:[{c,p}]}   greedy CTC (blank 0, dict 1..n, space last)
 *   fromOcr(lines:[{text, chars}], {moto}) -> {key, conf, chars, provinceText}|null  pick the plate line out of OCR lines
 * IMAGE (pure, on a grey Uint8Array)
 *   findCandidates(gray, W, H, opts) -> [{x,y,w,h,score}] normalised   classical edge-density plate finder (no model)
 *   splitLines(gray, W, H) -> [{y0, y1}]   horizontal projection: text bands inside a plate crop
 *   lumaMean(gray) · isNight(at, {luma, from=18, to=6})
 * RECORDS (pure)
 *   toCSV(rows, cols) (formula-injection safe) · purge(records, now, cfg) -> {keep, drop}
 *   auditAppend(chain, entry) / auditVerify(chain) — append-only, hash-chained correction log (tamper-evident, FNV-1a)
 *   accuracy(rows, opts) -> report (plate-level, char-level, day/night split, CI-aware verdict via lensiq-sitecheck)
 * DOM (browser only)
 *   registerDetector(fn(canvas) -> Promise<[{x,y,w,h,score}]>) — plug a reviewed plate-detector model in; default = findCandidates
 *   detect(canvas) · loadOcr() -> Promise<{session, dict}> · recognize(canvas) -> {text, conf, chars} · readPlate(canvas, box, {moto})
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
  const LOOKALIKE = [["ข", "ช"], ["ด", "ต"], ["บ", "ป"], ["ผ", "ฝ"], ["ภ", "ถ"], ["ม", "ฆ"], ["0", "O"], ["8", "B"], ["1", "I"]];
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
        text += ch; chars.push({ c: ch, p: Math.round(p * 1000) / 1000 }); sum += p; n++;
      }
      prev = bi;
    }
    return { text, conf: n ? Math.round((sum / n) * 1000) / 1000 : 0, chars };
  }
  /** keep only plate characters of one OCR line, carrying per-character probabilities */
  function plateChars(line) {
    const out = [];
    const src = line.chars && line.chars.length ? line.chars : [...String(line.text || "")].map(c => ({ c, p: line.conf || 0.5 }));
    for (const x of src) {
      let c = normalize(x.c);
      if (!c) continue;
      if (/[OQDBILSZG|]/.test(c)) c = fixDigits(c);
      if (/^[ก-ฮ0-9]$/.test(c)) out.push({ c, p: x.p });
    }
    return out;
  }
  /**
   * lines = OCR results per text band of the crop, top to bottom. Car: the band that parses as line 1 (letters +
   * digits); the remaining Thai band is the province text. Motorcycle: band 1 (letters) + last band (digits).
   */
  function fromOcr(lines, o = {}) {
    const L = (lines || []).filter(l => l && (l.text || (l.chars && l.chars.length)));
    const tryKey = (cs) => {
      const s = cs.map(x => x.c).join("");
      for (let a = 0; a < s.length; a++) for (let b = s.length; b > a + 1; b--) {
        const p = parse(s.slice(a, b), { moto: !!o.moto });
        if (p.ok && !p.legacy) {
          const sub = cs.slice(a, b);
          return { key: p.key, chars: sub, conf: sub.reduce((x, y) => x + y.p, 0) / sub.length };
        }
      }
      return null;
    };
    if (o.moto && L.length >= 2) {
      const r = tryKey(plateChars(L[0]).concat(plateChars(L[L.length - 1])));
      if (r) return { ...r, provinceText: L.length >= 3 ? L[1].text : "" };
    }
    for (let i = 0; i < L.length; i++) {
      const r = tryKey(plateChars(L[i]));
      if (r) return { ...r, provinceText: L.filter((_, j) => j !== i).map(l => l.text).join(" ") };
    }
    const all = tryKey(L.flatMap(plateChars)); // one band that holds both lines
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
      if (w < W * (o.minW || 0.05) || h < 4 || ar < 1.3 || ar > 6.5 || fill < 0.35) continue;
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
  const TARGETS = { plate: 0.95, char: 0.98, minReads: 100, minNight: 30 };
  function wilson(x, n) { const S = Site(); if (S) return S.wilson(x, n); if (!(n > 0)) return { x, n: 0, p: null, lo: 0, hi: 1 }; const z = 1.959964, p = x / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return { x, n, p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) }; }
  /**
   * rows = [{read: key the system suggested, truth: key the guard confirmed (or read when ticked ✓), ok?: guard tick,
   *          provRead?, provTruth?, night: boolean}] — one per auto read during the check.
   * -> {n, plate, char, day, night, province, verdict, need, metrics:[{k, v, ci, target, ok}]}   (pure, no images)
   */
  function accuracy(rows, o = {}) {
    const tg = { ...TARGETS, ...(o.targets || {}) };
    const R = (rows || []).filter(r => r && (r.truth || r.ok != null));
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
      { k: "province", v: pct(province), ci: ci(province), target: "—", ok: null, n: province.n }
    ];
    return { kind: "gate", n: R.length, plate, char, day, night, province, verdict: j.verdict, need: j.need || [], metrics, targets: tg };
  }

  /* ---------------- DOM: detector + OCR hooks ---------------- */
  /** @type {null | ((c: HTMLCanvasElement) => Promise<any[]>)} */
  let detector = null;
  function registerDetector(fn) { detector = typeof fn === "function" ? fn : null; return !!detector; }
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
  async function detect(canvas) {
    if (detector) { try { const r = await detector(canvas); if (Array.isArray(r)) return r; } catch { /* fall back to the classical finder */ } }
    const { gray, W, H } = grayOf(canvas, 320);
    // NOTE: the classical finder looks for a bright box, so dark plates (white text on green / blue) are usually not found;
    // the guard taps the plate instead (readNow(box)). A trained plate detector is on the roadmap (docs/GATE.md).
    return findCandidates(gray, W, H);
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
    return ctcDecode(t.data, T, C, m.dict);
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
    const W0 = canvas.width, H0 = canvas.height, b = box || { x: 0, y: 0, w: 1, h: 1 };
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
    for (const bd of bands.slice(0, 3)) {
      const bc = document.createElement("canvas"), m = Math.max(1, Math.round((bd.y1 - bd.y0) * 0.12));
      const y = Math.max(0, bd.y0 - m), h = Math.min(H, bd.y1 + m) - y, px = Math.round(H * 0.08);
      bc.width = W + 2 * px; bc.height = h;
      const bx = /** @type {CanvasRenderingContext2D} */ (bc.getContext("2d"));
      bx.fillStyle = "#fff"; bx.fillRect(0, 0, bc.width, h); // quiet zone left / right, as in the recogniser's training lines
      bx.drawImage(crop, tb.x0, tb.y0 + y, W, h, px, 0, W, h);
      lines.push(await recognize(bc));
    }
    const r = fromOcr(lines, o);
    if (!r) return { key: "", conf: 0, chars: [], provinceText: lines.map(l => l.text).join(" "), lines };
    const gp = guessProvince(r.provinceText);
    return { ...r, province: gp ? gp.id : "", lines, inverted, leftCut: b.x - padL * b.w <= 0.002 };
  }

  return { CONS, normalize, parse, format, PROVINCES, provinceName, provinceList, guessProvince, LOOKALIKE, lookalike, lev, plateDist, match, vote, leadAlternatives,
    ctcDecode, fromOcr, plateChars, lumaMean, isNight, findCandidates, splitLines, trimBorder, toCSV, purge, auditAppend, auditVerify, fnv, TARGETS, accuracy,
    registerDetector, grayOf, detect, loadOcr, recognize, tightText, readPlate, OCR_URL, hasDOM };
});
