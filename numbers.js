/* numbers.js — เลขมงคล (LENSIQ)
 * ส่วนที่ 1: NMCore — ฟังก์ชันคำนวณล้วน (ทดสอบด้วย Node ได้ ไม่แตะ DOM/storage)
 * ส่วนที่ 2: UI — ทำงานเฉพาะในเบราว์เซอร์
 * ความเป็นส่วนตัว: คำนวณในเบราว์เซอร์ ไม่ส่งและไม่บันทึกตัวเลข/ชื่อ สถิติเก็บเพียงจำนวนครั้งและประเภท
 */
(function (root) {
  "use strict";
  const KB = (typeof module !== "undefined" && module.exports) ? require("./numbers-kb.js") : root.NM_KB;

  /* ======================= NMCore ======================= */
  const onlyDigits = s => String(s == null ? "" : s).replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 0x0E50)).replace(/\D/g, "");
  const isThaiMobile = d => /^0[689]\d{8}$/.test(d);
  const pairKey = p => (p[0] <= p[1] ? p[0] + p[1] : p[1] + p[0]);
  const reduceDigit = n => { n = Math.abs(n); while (n > 9) n = String(n).split("").reduce((a, c) => a + +c, 0); return n; };
  const sumDigits = d => String(d).split("").reduce((a, c) => a + (+c || 0), 0);

  function pairInfo(p) {
    const k = pairKey(p), e = KB.pairs[k];
    const g = KB.grades[e[0]], a = KB.digits[+p[0]], b = KB.digits[+p[1]];
    const order = p[0] === p[1] ? "เลขเบิ้ล เน้นพลัง" + a.q + "เป็นสองเท่า" : "เลข " + p[0] + " นำ: เริ่มจาก" + a.q + " แล้วส่งต่อเป็น" + b.q;
    return { pair: p, key: k, grade: e[0], gradeTh: g.th, pts: g.pts, care: e[0] === "c", tags: e[1].slice(), name: e[2], phrases: e[3].slice(), order };
  }

  /** คู่เลขที่อยู่ติดกัน: mode "last7" = 7 ตัวท้าย (6 คู่), "all" = ทุกคู่ ตำแหน่งนับจากหลักแรกของเลขเต็ม (เริ่ม 1) */
  function extractPairs(d, mode) {
    d = String(d);
    const start = mode === "last7" && d.length > 7 ? d.length - 7 : 0;
    const out = [];
    for (let i = start; i < d.length - 1; i++) out.push({ pair: d[i] + d[i + 1], pos: [i + 1, i + 2] });
    const m = out.length;
    out.forEach((p, k) => { p.weight = k === m - 1 ? 1.6 : k === m - 2 ? 1.3 : 1; p.emph = k === m - 1 ? "คู่ท้ายสุด" : k === m - 2 ? "คู่รองท้าย" : ""; });
    return { start: start + 1, pairs: out };
  }

  const ROOT_GRADE = { 0: "c", 1: "n", 2: "n", 3: "n", 4: "n", 5: "g", 6: "g", 7: "n", 8: "n", 9: "g" };
  /** ความหมายผลรวม 1–99 (เกิน 99 จะทอนเป็น 2 หลักก่อน) kind: phone | plate | name | house | account */
  function sumInfo(s, kind) {
    let sum = s;
    while (sum > 99) sum = sumDigits(sum);
    const r = reduceDigit(sum), rd = KB.digits[r];
    const notable = (KB.sumNotable[kind] || KB.sumNotable.phone).indexOf(sum) >= 0;
    const plateCare = kind === "plate" && KB.plateCareSums.indexOf(sum) >= 0;
    let grade, phrases, name, tags, plain;
    if (sum < 10) {
      grade = ROOT_GRADE[sum]; phrases = rd.m.slice(); plain = phrases; name = "เลข " + sum + " ดาว" + rd.planet; tags = ["personality"];
    } else {
      const p = pairInfo(String(sum));
      grade = p.grade; name = p.name; tags = p.tags;
      // plain = ความหมายล้วน (ใช้ในคำทำนาย ตัวเรียบเรียงเอ่ยชื่อ "ผลรวม NN" ให้เอง); phrases = มีคำนำ "ผลรวม NN …" สำหรับแสดงในหน้า
      plain = p.phrases.slice();
      phrases = p.phrases.map((t, i) => KB.sumIntro[i % KB.sumIntro.length].replace(/\{s\}/g, sum) + " " + t);
    }
    if (notable && grade !== "G") grade = grade === "c" ? "n" : "G";
    if (plateCare && grade !== "c") grade = "n";
    const rootLine = "ทอนเป็นเลขโดดได้ " + r + " (" + rd.planet + ") หมายถึง" + rd.q;
    const extra = plateCare ? "ตามบางตำราผลรวมนี้ชวนให้ขับขี่อย่างใจเย็นและตรวจเช็กรถสม่ำเสมอ ซึ่งเป็นนิสัยดีของผู้ขับขี่ทุกคนอยู่แล้ว" : "";
    return { sum, raw: s, root: r, grade, gradeTh: KB.grades[grade].th, pts: KB.grades[grade].pts, notable, name, tags, phrases, plain, rootLine, extra };
  }

  /** รูปแบบตัวเลขที่จดจำง่าย (ในช่วงที่วิเคราะห์) offset = ตำแหน่งเริ่มของช่วงในเลขเต็ม */
  function detectPatterns(d, offset) {
    d = String(d); offset = offset || 1;
    const out = [], P = (i, n) => "ตำแหน่งที่ " + (offset + i) + "–" + (offset + i + n - 1);
    for (let i = 0; i < d.length;) { let j = i; while (j + 1 < d.length && d[j + 1] === d[i]) j++; const n = j - i + 1; if (n >= 3) out.push({ id: "run", label: "เลขซ้ำ " + n + " ตัว (" + d.slice(i, j + 1) + ")", evidence: P(i, n), digit: +d[i], bonus: 12 }); i = j + 1; }
    for (const step of [1, -1]) for (let i = 0; i < d.length;) { let j = i; while (j + 1 < d.length && +d[j + 1] - +d[j] === step) j++; const n = j - i + 1; if (n >= 3) out.push({ id: step > 0 ? "up" : "down", label: (step > 0 ? "เลขเรียงขึ้น " : "เลขเรียงลง ") + d.slice(i, j + 1), evidence: P(i, n), bonus: 10 }); i = j > i ? j : i + 1; }
    let best = null;
    for (let n = Math.min(d.length, 7); n >= 4 && !best; n--) for (let i = 0; i + n <= d.length; i++) { const s = d.slice(i, i + n); if (s === s.split("").reverse().join("") && new Set(s).size > 1) { best = { id: "mirror", label: "เลขกระจก " + s, evidence: P(i, n), bonus: 12 }; break; } }
    if (best) out.push(best);
    for (let i = 0; i + 4 <= d.length; i++) { const s = d.slice(i, i + 4); if (s[0] === s[2] && s[1] === s[3] && s[0] !== s[1]) { out.push({ id: "abab", label: "คู่ซ้ำสลับ " + s, evidence: P(i, 4), bonus: 10 }); break; } }
    if (d.length >= 4) { const t = d.slice(-4); if (t[0] === t[1] && t[2] === t[3] && t[0] !== t[2]) out.push({ id: "aabb", label: "ท้ายเบิ้ลคู่ " + t, evidence: P(d.length - 4, 4), bonus: 8 }); }
    if (d.indexOf("0") < 0 && d.length >= 4) out.push({ id: "nozero", label: "ไม่มีเลข 0 ในช่วงที่อ่าน", evidence: "ตำราส่วนใหญ่ถือว่าอ่านพลังได้ต่อเนื่อง", bonus: 8 });
    return out;
  }

  function weightedPairs(list) {
    if (!list.length) return { score: 0, items: [] };
    let s = 0, w = 0;
    const items = list.map(p => { const i = Object.assign({}, pairInfo(p.pair), p); s += i.pts * p.weight; w += p.weight; return i; });
    return { score: Math.round(s / w), items };
  }
  const patScore = pats => Math.min(100, 50 + pats.reduce((a, p) => a + p.bonus, 0));

  /** วิเคราะห์ชุดตัวเลข (เบอร์ บ้าน บัญชี) */
  function analyzeDigits(d, opts) {
    opts = opts || {};
    const kind = opts.kind || "phone", mode = opts.mode || (kind === "phone" ? "last7" : "all");
    const ex = extractPairs(d, mode), seg = d.slice(ex.start - 1);
    const wp = weightedPairs(ex.pairs);
    const sum = sumInfo(sumDigits(d), kind);
    const patterns = detectPatterns(seg, ex.start);
    const ps = patScore(patterns);
    const W = { pairs: 0.65, sum: 0.2, pattern: 0.15 };
    const score = Math.round(wp.score * W.pairs + sum.pts * W.sum + ps * W.pattern);
    return {
      kind, mode, digits: d, segStart: ex.start, pairs: wp.items, sum, patterns, score,
      breakdown: [
        { id: "pairs", th: "คู่เลข (" + wp.items.length + " คู่ ถ่วงน้ำหนักคู่ท้าย)", w: W.pairs, v: wp.score },
        { id: "sum", th: "ผลรวม " + sum.sum + " (" + sum.gradeTh + ")", w: W.sum, v: sum.pts },
        { id: "pattern", th: "รูปแบบจำง่าย (" + patterns.length + " แบบ)", w: W.pattern, v: ps },
      ],
    };
  }

  function analyzePhone(input, mode) {
    const d = onlyDigits(input);
    if (!d) return { error: "กรุณากรอกเบอร์มือถือ" };
    if (!isThaiMobile(d)) return { error: "เบอร์มือถือไทยต้องมี 10 หลัก ขึ้นต้นด้วย 06 08 หรือ 09" };
    return Object.assign(analyzeDigits(d, { kind: "phone", mode: mode === "all" ? "all" : "last7" }), { display: formatPhone(d), masked: maskPhone(d) });
  }
  function analyzeHouse(input) {
    const raw = String(input || "").trim(), d = onlyDigits(raw);
    if (d.length < 1 || d.length > 10) return { error: "กรอกบ้านเลขที่หรือเลขห้อง 1–10 หลัก" };
    const r = d.length === 1 ? { kind: "house", mode: "all", digits: d, segStart: 1, pairs: [], sum: sumInfo(+d, "house"), patterns: [], score: 0, breakdown: [] } : analyzeDigits(d, { kind: "house", mode: "all" });
    if (d.length === 1) { r.score = Math.round(r.sum.pts); r.breakdown = [{ id: "sum", th: "เลขโดด " + d, w: 1, v: r.sum.pts }]; }
    return Object.assign(r, { display: raw.replace(/[^\d/\-]/g, "").slice(0, 16) || d, masked: maskHouse(raw) });
  }
  function analyzeAccount(input) {
    const d = onlyDigits(input);
    if (d.length < 4 || d.length > 7) return { error: "กรอกเฉพาะ 4–7 ตัวท้ายของเลขบัญชี (ไม่ต้องกรอกเลขเต็ม)" };
    return Object.assign(analyzeDigits(d, { kind: "account", mode: "all" }), { display: d, masked: maskAccount(d) });
  }

  /* ---------- ตัวอักษรไทย ---------- */
  const LV = {};
  Object.keys(KB.letterValues).forEach(v => { for (const ch of KB.letterValues[v]) LV[ch] = +v; });
  const letterValue = ch => LV[ch] || 0;
  function weekdayById(id) { return KB.weekdays.find(w => w.id === id) || null; }
  function kalaFound(text, wd) { if (!wd) return []; const out = []; for (const ch of text) if (wd.kala.indexOf(ch) >= 0 && out.indexOf(ch) < 0) out.push(ch); return out; }

  function analyzeName(input, weekdayId) {
    const name = String(input || "").normalize("NFC").replace(/\s+/g, "");
    if (!/[ก-ฮ]/.test(name)) return { error: "กรอกชื่อเป็นภาษาไทยอย่างน้อย 1 ตัวอักษร" };
    const chars = [], skipped = [];
    let total = 0;
    for (const ch of name) { const v = letterValue(ch); if (v) { chars.push({ ch, v }); total += v; } else skipped.push(ch); }
    const sum = sumInfo(total, "name"), wd = weekdayById(weekdayId), kala = kalaFound(name, wd);
    const kalaPts = !wd ? null : kala.length ? 60 : 100;
    const score = kalaPts == null ? sum.pts : Math.round(sum.pts * 0.75 + kalaPts * 0.25);
    return {
      kind: "name", total, chars, skipped, sum, weekday: wd, kala, score, pairs: [], patterns: [], masked: "ชื่อ " + chars.length + " ตัวอักษร",
      breakdown: [{ id: "sum", th: "ผลรวมค่าอักษร " + total + " (" + sum.gradeTh + ")", w: kalaPts == null ? 1 : 0.75, v: sum.pts }].concat(kalaPts == null ? [] : [{ id: "kala", th: kala.length ? "มีอักษรที่บางตำราให้ใส่ใจ (" + kala.join(" ") + ")" : "ไม่พบอักษรกาลกิณีของ" + wd.th, w: 0.25, v: kalaPts }]),
    };
  }

  /** ทะเบียนรถ เช่น "1กข 2345" "กข-2345" (ไม่ต้องใส่จังหวัด) */
  function analyzePlate(input, weekdayId) {
    const raw = String(input || "").normalize("NFC").replace(/[๐-๙]/g, c => String(c.charCodeAt(0) - 0x0E50));
    const m = raw.replace(/[\s\-.]/g, "").match(/^(\d?)([ก-ฮ]{1,3})(\d{1,4})$/);
    if (!m) return { error: "รูปแบบทะเบียนเช่น 1กข 2345 หรือ กข 1234 (ตัวอักษร 1–3 ตัว ตามด้วยเลข 1–4 หลัก)" };
    const lead = m[1], letters = m[2], num = m[3];
    const letterVals = Array.from(letters).map(ch => ({ ch, v: letterValue(ch) }));
    const total = sumDigits(lead + num) + letterVals.reduce((a, l) => a + l.v, 0);
    const sum = sumInfo(total, "plate");
    const ex = extractPairs(num, "all");
    const ex2 = ex.pairs.map(p => Object.assign({}, p, { pos: p.pos.map(x => x + lead.length + letters.length) }));
    const wp = weightedPairs(ex2);
    const wd = weekdayById(weekdayId), kala = kalaFound(letters, wd);
    const patterns = detectPatterns(num, lead.length + letters.length + 1).filter(p => p.id !== "nozero" || num.length >= 4);
    const parts = [];
    if (wp.items.length) parts.push({ id: "pairs", th: "คู่เลขบนป้าย (" + wp.items.length + " คู่)", w: 0.45, v: wp.score });
    parts.push({ id: "sum", th: "ผลรวมทั้งป้าย " + sum.sum + " (" + sum.gradeTh + ")", w: wp.items.length ? 0.4 : 0.85, v: sum.pts });
    parts.push(wd ? { id: "kala", th: kala.length ? "อักษรที่บางตำราให้ใส่ใจ (" + kala.join(" ") + ")" : "ไม่พบอักษรกาลกิณีของ" + wd.th, w: 0.15, v: kala.length ? 60 : 100 }
      : { id: "pattern", th: "รูปแบบจำง่าย (" + patterns.length + " แบบ)", w: 0.15, v: patScore(patterns) });
    const score = Math.round(parts.reduce((a, p) => a + p.w * p.v, 0));
    return { kind: "plate", lead, letters, num, letterVals, total, sum, pairs: wp.items, patterns, weekday: wd, kala, score, breakdown: parts, display: (lead + letters + " " + num).trim(), masked: maskPlate(lead, letters, num) };
  }

  /* ---------- พลังประจำวัน (สี ทิศ คำพลัง — ไม่ใช่ตัวเลข ไม่ใช้เพื่อเสี่ยงโชค) ---------- */
  function dailyEnergy(weekdayId, date) {
    const wd = weekdayById(weekdayId) || KB.weekdays[0];
    date = date || new Date();
    const today = KB.weekdays[[0, 1, 2, 3, 5, 6, 7][date.getDay()]];
    let seed = date.getFullYear() * 400 + (date.getMonth() + 1) * 32 + date.getDate() + wd.num * 7;
    const r = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    r();
    const word = KB.dailyWords[Math.floor(r() * KB.dailyWords.length)];
    const direction = KB.dailyDirections[Math.floor(r() * KB.dailyDirections.length)];
    const same = today.id === wd.id || (today.id === "wed" && wd.id === "wedn");
    return { weekday: wd, today, color: today.color, birthColor: wd.color, direction, word,
      notes: ["สี" + today.color + "เป็นสีประจำ" + today.th + "ตามธรรมเนียมไทย",
        same ? "วันนี้ตรงกับวันเกิดของคุณ สี" + wd.color + "จึงเป็นทั้งสีวันนี้และสีประจำตัว" : "สี" + wd.color + "เป็นสีประจำ" + wd.th + " ใช้เป็นสีเสริมความมั่นใจได้",
        "ทิศและคำพลังสุ่มจากวันที่และวันเกิด เปลี่ยนใหม่ทุกวัน"] };
  }

  /* ---------- ปิดบังตัวเลขบนการ์ดแชร์ ---------- */
  function maskPhone(d) { d = onlyDigits(d); return d.length < 8 ? "x".repeat(Math.max(0, d.length - 2)) + d.slice(-2) : d.slice(0, 2) + "x-xxx-" + d.slice(-4); }
  function formatPhone(d) { return d.length === 10 ? d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6) : d; }
  function maskAccount(d) { d = onlyDigits(d); return "xxx-" + d.slice(-4); }
  function maskHouse(s) { const d = onlyDigits(s); return d.length <= 2 ? "เลขที่ x" + d.slice(-1) : "เลขที่ " + "x".repeat(d.length - 2) + d.slice(-2); }
  function maskPlate(lead, letters, num) { return (lead ? "x" : "") + letters + " " + "x".repeat(Math.max(0, num.length - 2)) + num.slice(-2); }

  /* ---------- เปรียบเทียบหลายเบอร์ ---------- */
  function compare(list, mode) {
    return (list || []).map(s => String(s || "").trim()).filter(Boolean).slice(0, 5).map((s, i) => {
      const r = analyzePhone(s, mode);
      if (r.error) return { idx: i, input: s, error: r.error };
      return { idx: i, display: r.display, score: r.score, sum: r.sum.sum, best: r.pairs.filter(p => p.grade === "G").map(p => p.pair), care: r.pairs.filter(p => p.care).map(p => p.pair), last: r.pairs[r.pairs.length - 1], r };
    }).sort((a, b) => (b.score || -1) - (a.score || -1));
  }

  /* ---------- นับว่าตรงเป้าหมายแค่ไหน ---------- */
  function goalMatch(r) {
    const have = (r.pairs || []).map(p => p.pair);
    return Object.keys(KB.goals).map(k => { const g = KB.goals[k], hit = have.filter((p, i) => g.pairs.indexOf(p) >= 0 && have.indexOf(p) === i); return { id: k, th: g.th, hit, tips: g.tips }; });
  }

  /* ---------- facts สำหรับ fortune-ai.js ----------
     privacy: ใส่เฉพาะคู่/ผลรวม/รูปแบบที่เด่น ไม่ใส่เลขเต็ม; opts.forAI = true จะตัดตำแหน่งออกด้วย */
  const KIND_TH = { phone: "เบอร์มือถือ", plate: "ทะเบียนรถ", house: "บ้านเลขที่/เลขห้อง", account: "เลขบัญชี (ตัวท้าย)", name: "ชื่อ" };
  const PATTERN_TH = { run: "เลขซ้ำติดกัน", up: "เลขเรียงขึ้น", down: "เลขเรียงลง", mirror: "เลขกระจก (อ่านกลับได้)", abab: "คู่ซ้ำสลับ", aabb: "ท้ายเบิ้ลคู่", nozero: "ไม่มีเลข 0 ในช่วงที่อ่าน" };
  // หัวข้อที่สำนวนหนึ่งพูดถึง (ดูจากคำในประโยค) — ใช้วางสำนวนให้ตรงหัวข้อ
  const TOPIC_WORDS = { love: /ความรัก|คนรัก|คู่รัก|แฟน|หัวใจ|ความสัมพันธ์|คนที่รัก|คู่ครอง/, money: /เงิน|ทรัพย์|รายได้|ลงทุน|การเงิน|ค้าขาย|ออม/, work: /งาน|อาชีพ|ตำแหน่ง|ธุรกิจ|ทีม/ };
  const phraseTopics = x => Object.keys(TOPIC_WORDS).filter(k => TOPIC_WORDS[k].test(x));
  // สำนวนนี้วางใต้หัวข้อ t ได้ไหม: สำนวนกลาง ๆ ได้ทุกหัวข้อ, สำนวนที่พูดถึงหัวข้อใดได้เฉพาะหัวข้อนั้น (มิตรภาพรับสำนวนงานได้)
  const fitsTag = (x, t) => { const on = phraseTopics(x); return !on.length || on.indexOf(t) >= 0 || (t === "social" && on.indexOf("love") < 0 && on.indexOf("money") < 0); };
  const noDigitRef = (x, lead) => String(x).replace(/^เลข \d+ ?/, lead);
  function buildFacts(r, topic, opts) {
    opts = opts || {};
    const ai = !!opts.forAI;
    const items = [], seen = {};
    (r.pairs || []).forEach(p => {
      if (seen[p.pair]) { if (!ai) seen[p.pair].evidence += ", " + p.pos.join("–"); seen[p.pair].strength = Math.min(1, seen[p.pair].strength + 0.08); return; }
      // แต่ละสำนวนวางเฉพาะหัวข้อที่มันพูดถึงจริง (สำนวนเรื่องคนรักไม่ไปอยู่ใต้หัวข้อการเงิน/มิตรภาพ)
      // สำนวนกลาง ๆ (ไม่มีคำของหัวข้อใด) ใช้ได้กับทุกหัวข้อของคู่นี้
      const plain = p.phrases.filter((x, i) => !(p.care && i === 1));
      const meanings = {};
      p.tags.forEach(t => {
        const fit = plain.filter(x => fitsTag(x, t));
        if (fit.length) meanings[t] = fit;
      });
      if (!Object.keys(meanings).length) meanings[p.tags[0]] = plain;
      if (p.care) meanings.advice = [p.phrases[1]];
      // forAI: ไม่ใส่ตัวเลขของคู่ ไม่ใส่ตำแหน่ง — ใช้เพียงชื่อหมวดความหมายและระดับ
      const it = ai ? {
        id: "pair." + (items.length + 1), group: "คู่เลข", label: p.name, short: p.name,
        evidence: "ระดับ" + p.gradeTh,
      } : {
        id: "pair." + p.pair, group: "คู่เลข", label: "คู่ " + p.pair + " (" + p.name + ")", short: "คู่ " + p.pair,
        evidence: "คู่ " + p.pair + " ตำแหน่งที่ " + p.pos.join("–") + (p.emph ? " · " + p.emph : ""),
      };
      Object.assign(it, { strength: +(p.pts / 100 * (0.6 + 0.25 * p.weight)).toFixed(3), tags: Object.keys(meanings), meanings, grade: p.grade });
      if (p.care) it.polarity = "challenge";
      seen[p.pair] = it; items.push(it);
    });
    items.sort((a, b) => b.strength - a.strength);
    // forAI: ส่งเพียงคู่เด่น 3 + คู่ควรใส่ใจ 1 (ไม่มีลำดับ/ตำแหน่ง) จึงประกอบกลับเป็นเลขเต็มไม่ได้
    const nTop = ai ? 3 : 5, nCare = ai ? 1 : 2;
    const top = items.filter(i => i.tags.indexOf("advice") < 0).slice(0, nTop).concat(items.filter(i => i.tags.indexOf("advice") >= 0).slice(0, nCare));
    if (top[0] && !top[0].polarity) { const k0 = top[0].tags.find(t => t !== "advice"); if (k0) top[0].meanings.overview = top[0].meanings[k0].slice(); }
    const s = r.sum, rd = KB.digits[s.root];
    let sumItem;
    if (ai) {
      // ไม่ส่งค่าผลรวม (บ้านเลขหลักเดียว ผลรวม = เลขเต็ม) — ส่งเพียงชื่อหมวดและความหมาย
      const base = s.sum < 10 ? rd.m.map(x => noDigitRef(x, "ผลรวมนี้")) : pairInfo(String(s.sum)).phrases;
      const rootLine = "เลขโดดหลังทอนเป็นของ" + rd.planet + " หมายถึง" + rd.q;
      sumItem = { id: "sum", group: "ผลรวม", label: "ผลรวม" + (s.sum < 10 ? "พลัง" + rd.planet : s.name), short: "ผลรวม", evidence: "ผลรวมระดับ" + s.gradeTh, strength: +(s.pts / 100 * 0.9).toFixed(3), tags: ["overview"].concat(s.tags), meanings: { overview: base.map(p => p + " " + rootLine) } };
      s.tags.forEach(t => { const fit = base.filter(x => fitsTag(x, t)); sumItem.meanings[t] = fit.length ? fit : base; });
    } else {
      const base = s.plain || s.phrases;
      sumItem = { id: "sum." + s.sum, group: "ผลรวม", label: "ผลรวม " + s.sum + " (" + s.name + ")", short: "ผลรวม " + s.sum, evidence: (r.kind === "name" || r.kind === "plate" ? "ผลรวมค่าอักษรและตัวเลข " : "ผลรวมทุกหลัก ") + s.raw + (s.raw !== s.sum ? " → " + s.sum : ""), strength: +(s.pts / 100 * 0.9).toFixed(3), tags: ["overview"].concat(s.tags), meanings: { overview: base.map(p => p + " " + s.rootLine) } };
      s.tags.forEach(t => { const fit = base.filter(x => fitsTag(x, t)); sumItem.meanings[t] = fit.length ? fit : base; });
    }
    if (s.extra) { sumItem.tags.push("advice"); sumItem.meanings.advice = [s.extra]; }
    top.push(sumItem);
    (r.patterns || []).slice(0, 3).forEach(p => {
      const dm = p.digit != null ? KB.digits[p.digit].m : null;
      const label = ai ? PATTERN_TH[p.id] || "รูปแบบจำง่าย" : p.label;
      // ความหมายเฉพาะของรูปแบบนั้น (KB.patterns) — เลขซ้ำเพิ่มความหมายของเลขที่ซ้ำด้วย
      const pm = KB.patterns[p.id] || { personality: [] }, meanings = {};
      for (const t in pm) meanings[t] = pm[t].slice();
      if (dm) meanings.personality.push("เรื่อง" + KB.digits[p.digit].q + "ถูกเน้นให้ชัดกว่าปกติ เพราะพลังของเลขที่ซ้ำทบกันหลายชั้น");
      // ไม่มีเลข 0: หลักฐานคือเหตุผลตามตำรา (ข้อความในหน้าเว็บยังใช้ evidence เดิม)
      const ev = ai ? "" : p.id === "nozero" ? "ตำราเลขศาสตร์มองเลข 0 เป็นช่องว่างของพลัง" : p.evidence;
      top.push({ id: "pattern." + p.id, group: "รูปแบบตัวเลข", label, evidence: ev, strength: 0.5, tags: Object.keys(meanings), meanings });
    });
    if (r.kala && r.kala.length) {
      const kl = ai ? "บางตัว" : " " + r.kala.join(" ");
      top.push({ id: "kala", group: "อักษรตามวันเกิด", label: ai ? "อักษรที่ตำราให้ใส่ใจ" : "อักษร " + r.kala.join(" "), evidence: "ตามตารางกาลกิณี" + r.weekday.th, strength: 0.4, tags: ["advice"],
        meanings: { advice: ["ตามบางตำรา อักษร" + kl + " เป็นอักษรที่คน" + r.weekday.th + "ให้ใส่ใจ หากชอบความสบายใจจะเลือกเลี่ยงก็ได้ แต่ไม่ได้มีผลร้ายใด ๆ", "อักษร" + kl + " เป็นเพียงความเชื่อตามวันเกิด ความตั้งใจและการกระทำของคุณสำคัญกว่าเสมอ"] } });
    }
    const gm = r.kind === "phone" ? goalMatch(r) : [];
    // ข้อแนะนำเลือกเบอร์ต้องไม่ขัดกับผลของเลขนี้: ไม่บอกให้เลี่ยงคู่ที่อยู่ในเลข (คู่นั้นมีคำอธิบายแบบ "ควรใส่ใจ" ของตัวเองแล้ว)
    // และไม่ยกคู่ที่ตำราจัดว่าควรระวังเป็นตัวอย่างที่ดี — ตัดสินจากระดับในคลังความรู้ (KB.pairs) เสมอ
    const have = new Set((r.pairs || []).map(p => p.pair));
    const tipOk = t => { if (typeof t === "string") return true; if ((t.avoid || []).some(x => have.has(x))) return false; return (t.good || []).every(x => (KB.pairs[pairKey(x)] || [])[0] !== "c"); };
    const want = (topic && KB.goals[topic] ? KB.goals[topic].tips : KB.generalTips).filter(tipOk).map(t => t.t || t);
    const goalTips = gm.filter(g => g.hit.length && (!topic || topic === "overall" || g.id === topic)).map(g => ai ? "เบอร์นี้มีคู่เลขที่ตรงกับเป้าหมายด้าน" + g.th : "เบอร์นี้มีคู่ " + g.hit.join(" และ ") + " ซึ่งตรงกับเป้าหมายด้าน" + g.th);
    const extras = { tips: want.slice(0, 3).concat(goalTips) };
    if (r.weekday) extras.luckyColors = [r.weekday.color];
    return {
      domain: "numbers", topic: topic || "overall", subject: {},
      headline: ai ? KIND_TH[r.kind] + " คะแนนพลังรวม " + r.score + "/100" : KIND_TH[r.kind] + " คะแนน " + r.score + "/100 · ผลรวม " + s.sum,
      items: top,
      extras,
    };
  }
  /** คำพลังจากผล (ชื่อหมวดของคู่เด่น) — แทนการให้ "เลขนำโชค" */
  function strengthWords(r) {
    const out = [];
    (r.pairs || []).filter(p => p.grade === "G" || p.grade === "g").forEach(p => { if (out.indexOf(p.name) < 0 && out.length < 4) out.push(p.name); });
    if (out.length < 4 && r.sum && r.sum.grade !== "c" && out.indexOf(r.sum.name) < 0) out.push(r.sum.name);
    return out;
  }

  /* ---------- สถิติไม่ระบุตัวตน (ไม่เก็บตัวเลข) ---------- */
  function addStat(st, type, now) {
    st = st && typeof st === "object" ? st : {};
    const d = new Date(now || Date.now());
    const day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const out = { v: 1, total: (st.total || 0) + 1, days: Object.assign({}, st.days || {}), types: Object.assign({}, st.types || {}) };
    out.days[day] = (out.days[day] || 0) + 1;
    out.types[type] = (out.types[type] || 0) + 1;
    return out;
  }

  const NMCore = { onlyDigits, isThaiMobile, pairKey, pairInfo, extractPairs, sumDigits, reduceDigit, sumInfo, detectPatterns, analyzeDigits, analyzePhone, analyzeHouse, analyzeAccount, analyzeName, analyzePlate, letterValue, dailyEnergy, strengthWords, maskPhone, maskAccount, maskHouse, maskPlate, compare, goalMatch, buildFacts, addStat, KIND_TH, KB };
  if (typeof module !== "undefined" && module.exports) { module.exports = NMCore; return; }
  root.NMCore = NMCore;
  if (typeof document === "undefined") return;

  /* ======================= UI ======================= */
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* โหมดส่วนตัว */ } };
  const STATS_KEY = "nm-stats", PREF_KEY = "nm-prefs", IDLE_MS = 60000;
  const prefs = Object.assign({ stats: true, ai: false }, lsGet(PREF_KEY, {}));
  const F = root.FortuneAI || null;
  let mode = "phone", current = null, currentFacts = null, aiEnabled = false, narrSeq = 0;

  /* ---------- i18n (ไทยเป็นค่าเริ่มต้น จีนมาจาก i18n/zh-fortune-numbers.js และ i18n/zh-kb-numbers.js) ---------- */
  const T = (k, th, v) => root.LQI18N ? root.LQI18N.tf(k, th, v) : String(th).replace(/\{(\w+)\}/g, (m, x) => v && v[x] != null ? v[x] : m);
  const isZh = () => !!(root.LQI18N && root.LQI18N.lang === "zh");
  const isEn = () => !!(root.LQI18N && root.LQI18N.lang === "en");
  /** โหมดแปล (จีนหรืออังกฤษ): ใช้คีย์ T() และคลัง zh-kb / en-kb แทนข้อความไทยที่ประกอบในเครื่อง */
  const trL = () => isZh() || isEn();
  const zkItem = id => { const D = isEn() ? root.FORTUNE_EN && root.FORTUNE_EN.numbers : isZh() ? root.FORTUNE_ZH && root.FORTUNE_ZH.numbers : null; return D && D.items ? D.items[id] || null : null; };
  /** ชื่อจากคลัง: zh "24 · 魅力沟通" → "魅力沟通"; en "pair 24 (the charming communicator)" → "The charming communicator" */
  const kbName = n => { n = String(n); if (!isEn()) return n.split(" · ").slice(1).join(" · "); const m = /\(([^()]+)\)\s*$/.exec(n); const t = m ? m[1] : n; return t.charAt(0).toUpperCase() + t.slice(1); };
  const cap = t => { t = String(t || ""); return isEn() ? t.charAt(0).toUpperCase() + t.slice(1) : t; };
  const first = v => Array.isArray(v) ? v[0] : v;
  const kindName = k => T("numbers.kind." + k, KIND_TH[k]);
  const gradeName = g => T("numbers.grade." + g, KB.grades[g].th);
  const planetName = n => T("numbers.dp." + n, KB.digits[n].planet);
  const digitQ = n => T("numbers.dq." + n, KB.digits[n].q);
  const wdName = w => T("numbers.wd." + w.id, w.th);
  const wdColor = w => T("numbers.wdc." + w.id, w.color);
  /** ชื่อคู่เลข (ไม่มีตัวเลข) เช่น "คู่เสน่ห์เจรจา" / "魅力沟通" */
  const pairNameL = pair => { const z = zkItem("pair." + pair); return z ? kbName(z.n) : KB.pairs[pairKey(pair)][2]; };
  /** สำนวนที่แสดงในการ์ดคู่เลข */
  const pairTextL = p => { const z = zkItem("pair." + p.pair); if (!z) return p.phrases[p.care ? 1 : 0]; return p.care && z.a ? T("numbers.care", "{a}", { a: first(z.a) }) : cap(first(z.o)); };
  const pairOrderL = p => !trL() ? p.order : p.pair[0] === p.pair[1] ? T("numbers.order.double", "", { q: digitQ(+p.pair[0]) }) : T("numbers.order.lead", "", { d: p.pair[0], a: digitQ(+p.pair[0]), b: digitQ(+p.pair[1]) });
  const sumNameL = s => !trL() ? s.name : s.sum < 10 ? T("numbers.digitName", "", { n: s.sum, p: planetName(s.sum) }) : pairNameL(String(s.sum));
  const sumTextL = s => {
    if (!trL()) return s.phrases[0];
    if (s.sum < 10) { const z = zkItem("sum." + s.sum); return z ? cap(first(z.o)) : s.phrases[0]; }
    const z = zkItem("pair." + s.sum); return z ? T("numbers.sum.intro", "", { s: s.sum, t: first(z.o) }) : s.phrases[0];
  };
  const sumRootL = s => !trL() ? s.rootLine : T("numbers.sum.root", "", { r: s.root, p: planetName(s.root), q: digitQ(s.root) });
  const sumExtraL = s => !s.extra ? "" : T("numbers.sum.plateCare", s.extra);
  const emphL = e => e === "คู่ท้ายสุด" ? T("numbers.emph.last", e) : e === "คู่รองท้าย" ? T("numbers.emph.second", e) : e;
  function patLabelL(p) {
    if (!trL()) return p.label;
    const ds = (String(p.label).match(/\d+/g) || []);
    if (p.id === "run") { const d = (String(p.label).match(/\((\d+)\)/) || [])[1] || ds[ds.length - 1] || ""; return T("numbers.pat.run", "", { d, n: d.length }); }
    if (p.id === "nozero") return T("numbers.pat.nozero", p.label);
    return T("numbers.pat." + p.id, p.label, { d: ds[ds.length - 1] || "" });
  }
  function patEvidenceL(p) {
    if (!trL()) return p.evidence;
    if (p.id === "nozero") return T("numbers.pat.nozeroEv", p.evidence);
    const m = /(\d+)–(\d+)/.exec(p.evidence || ""); return m ? T("numbers.pat.posRange", "", { a: m[1], b: m[2] }) : p.evidence;
  }
  function breakdownL(r, b) {
    if (!trL()) return b.th;
    const g = b.id === "sum" ? gradeName(r.sum.grade) : "";
    if (b.id === "pairs") return r.kind === "plate" ? T("numbers.bd.platePairs", b.th, { n: r.pairs.length }) : T("numbers.bd.pairs", b.th, { n: r.pairs.length });
    if (b.id === "sum") {
      if (r.kind === "house" && r.digits && r.digits.length === 1) return T("numbers.bd.single", b.th, { d: r.digits });
      if (r.kind === "name") return T("numbers.bd.nameSum", b.th, { t: r.total, g });
      if (r.kind === "plate") return T("numbers.bd.plateSum", b.th, { s: r.sum.sum, g });
      return T("numbers.bd.sum", b.th, { s: r.sum.sum, g });
    }
    if (b.id === "pattern") return T("numbers.bd.pattern", b.th, { n: r.patterns.length });
    if (b.id === "kala") return r.kala.length ? T("numbers.bd.kalaYes", b.th, { k: r.kala.join(" ") }) : T("numbers.bd.kalaNo", b.th, { wd: wdName(r.weekday) });
    return b.th;
  }
  /** คำพลังจากผล (ตามภาษาปัจจุบัน) — ตรรกะเดียวกับ strengthWords */
  function strengthWordsL(r) {
    if (!trL()) return strengthWords(r);
    const out = [];
    (r.pairs || []).filter(p => p.grade === "G" || p.grade === "g").forEach(p => { const n = pairNameL(p.pair); if (out.indexOf(n) < 0 && out.length < 4) out.push(n); });
    const sn = r.sum ? sumNameL(r.sum) : "";
    if (out.length < 4 && r.sum && r.sum.grade !== "c" && out.indexOf(sn) < 0) out.push(sn);
    return out;
  }
  const goalTipL = (gid, i, t) => T("numbers.goalTip." + gid + "." + i, t.t || t);

  const TABS = ["phone", "plate", "house", "account", "name", "daily", "compare"];
  function setTab(t, focus) {
    mode = t;
    document.querySelectorAll(".nm-tab").forEach(b => { const on = b.dataset.tab === t; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    document.querySelectorAll("[data-for]").forEach(el => { el.hidden = el.dataset.for.split(" ").indexOf(t) < 0; });
    $("#nmErr").textContent = "";
    const go = { daily: "ดูพลังประจำวัน", compare: "เปรียบเทียบ", name: "วิเคราะห์ชื่อ", plate: "วิเคราะห์ทะเบียน" }[t];
    $("#nmGo").textContent = go ? T("numbers.go." + t, go) : T("numbers.go.default", "วิเคราะห์เลขมงคล");
    $("#nmWdHint").textContent = t === "daily" ? T("numbers.hint.daily", "(จำเป็นสำหรับพลังประจำวัน)") : t === "plate" || t === "name" ? T("numbers.hint.kala", "(ไม่บังคับ — ใช้ดูอักษรกาลกิณี)") : T("numbers.hint.opt", "(ไม่บังคับ)");
  }
  document.querySelectorAll(".nm-tab").forEach(b => b.addEventListener("click", () => { setTab(b.dataset.tab); hideResults(); }));
  $("#nmTabs").addEventListener("keydown", e => {
    const i = TABS.indexOf(mode); let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length; else if (e.key === "ArrowLeft") n = (i - 1 + TABS.length) % TABS.length; else if (e.key === "Home") n = 0; else if (e.key === "End") n = TABS.length - 1;
    if (n >= 0) { e.preventDefault(); setTab(TABS[n], true); hideResults(); }
  });

  // จัดรูปแบบเบอร์ระหว่างพิมพ์ (ยอมรับเลขไทย)
  $("#nmPhone").addEventListener("input", function () { const d = onlyDigits(this.value).slice(0, 10); const f = d.length > 6 ? d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6) : d.length > 3 ? d.slice(0, 3) + "-" + d.slice(3) : d; if (f !== this.value) this.value = f; });
  $("#nmAcct").addEventListener("input", function () { const d = onlyDigits(this.value).slice(0, 7); if (d !== this.value) this.value = d; });

  function hideResults() { $("#nmResult").hidden = true; $("#nmDaily").hidden = true; $("#nmCompare").hidden = true; current = null; lastDaily = null; lastCompare = null; $("#nmCardImg").hidden = true; }
  let lastDaily = null, lastCompare = null;

  $("#nmForm").addEventListener("submit", e => {
    e.preventDefault(); touch();
    const wdId = $("#nmWd").value, err = $("#nmErr");
    err.textContent = "";
    let r;
    if (mode === "daily") {
      if (!wdId) { err.textContent = T("numbers.err.wd", "เลือกวันเกิดก่อน แล้วกดอีกครั้ง"); $("#nmWd").focus(); return; }
      hideResults(); renderDaily(dailyEnergy(wdId)); stat("daily"); return;
    }
    if (mode === "compare") {
      const list = Array.from(document.querySelectorAll(".nm-cmp-in")).map(i => i.value);
      const rows = compare(list, $("#nmAll").checked ? "all" : "last7");
      if (!rows.length) { err.textContent = T("numbers.err.cmp", "กรอกอย่างน้อย 1 เบอร์ (สูงสุด 5 เบอร์)"); return; }
      hideResults(); renderCompare(rows); stat("compare"); return;
    }
    if (mode === "phone") r = analyzePhone($("#nmPhone").value, $("#nmAll").checked ? "all" : "last7");
    else if (mode === "plate") r = analyzePlate($("#nmPlate").value, wdId);
    else if (mode === "house") r = analyzeHouse($("#nmHouse").value);
    else if (mode === "account") r = analyzeAccount($("#nmAcct").value);
    else r = analyzeName($("#nmName").value, wdId);
    if (r.error) { err.textContent = T(r.error, r.error); return; }
    hideResults(); current = r; renderResult(r); stat(mode);
  });

  /* ---------- แสดงผล ---------- */
  const GCLS = { G: "g2", g: "g1", n: "n", c: "c" };
  function scoreWord(s) { return s >= 85 ? T("numbers.score.w1", "พลังเด่นมาก") : s >= 72 ? T("numbers.score.w2", "พลังดี") : s >= 58 ? T("numbers.score.w3", "พลังสมดุล") : T("numbers.score.w4", "พลังเรียบง่าย ค่อย ๆ เติม"); }
  function renderResult(r, quiet) {
    const sec = $("#nmResult"); sec.hidden = false;
    $("#nmResKind").textContent = kindName(r.kind);
    $("#nmResNum").textContent = r.kind === "name" ? $("#nmName").value.trim() : r.display;
    $("#nmScore").textContent = r.score;
    $("#nmRing").style.setProperty("--p", r.score);
    $("#nmScoreWord").textContent = scoreWord(r.score);
    $("#nmBreak").innerHTML = r.breakdown.map(b => '<li><span>' + esc(breakdownL(r, b)) + '</span><i class="bar" style="--w:' + b.v + '%"></i><b>' + b.v + '</b><small>× ' + Math.round(b.w * 100) + "%</small></li>").join("") +
      '<li class="tot"><span>' + esc(T("numbers.bd.total", "รวม (ถ่วงน้ำหนัก)")) + '</span><i></i><b>' + r.score + "</b><small>/100</small></li>";
    // แถบตัวเลข/ตัวอักษร
    let strip = "";
    if (r.kind === "name") strip = r.chars.map(c => '<span class="cell"><b>' + esc(c.ch) + "</b><small>" + c.v + "</small></span>").join("");
    else if (r.kind === "plate") strip = (r.lead ? '<span class="cell"><b>' + r.lead + "</b><small>" + r.lead + "</small></span>" : "") + r.letterVals.map(l => '<span class="cell lt' + (r.kala.indexOf(l.ch) >= 0 ? " kala" : "") + '"><b>' + esc(l.ch) + "</b><small>" + l.v + "</small></span>").join("") + '<span class="gap"></span>' + Array.from(r.num).map(c => '<span class="cell on"><b>' + c + "</b></span>").join("");
    else strip = Array.from(r.digits).map((c, i) => '<span class="cell' + (i + 1 >= r.segStart ? " on" : "") + '"><b>' + c + "</b><small>" + (i + 1) + "</small></span>").join("");
    $("#nmStrip").innerHTML = strip;
    $("#nmStripCap").textContent = r.kind === "phone" ? (r.mode === "last7" ? T("numbers.strip.last7", "ไฮไลต์ = 7 ตัวท้ายที่ใช้อ่านคู่เลข (ตัวเลขเล็ก = ตำแหน่ง)") : T("numbers.strip.all", "อ่านคู่เลขทุกคู่ (ตัวเลขเล็ก = ตำแหน่ง)")) : r.kind === "plate" ? T("numbers.strip.plate", "ตัวเลขเล็ก = ค่าของตัวอักษรตามตารางเลขศาสตร์") : r.kind === "name" ? T("numbers.strip.name", "ตัวเลขเล็ก = ค่าของแต่ละอักษร/สระ/วรรณยุกต์") + (r.skipped.length ? T("numbers.strip.skip", " (ข้ามอักขระที่ไม่มีในตาราง {n} ตัว)", { n: r.skipped.length }) : "") : T("numbers.strip.pos", "ตัวเลขเล็ก = ตำแหน่ง");
    // คู่เลข
    $("#nmPairsBlock").hidden = !r.pairs.length;
    $("#nmPairs").innerHTML = r.pairs.map(p => '<li class="pr ' + GCLS[p.grade] + '"><div class="pr-h"><b class="pr-n">' + p.pair + '</b><span class="pr-g">' + esc(gradeName(p.grade)) + '</span><span class="pr-pos">' + esc(T("numbers.pos", "ตำแหน่ง {p}", { p: p.pos.join("–") }) + (p.emph ? " · " + emphL(p.emph) : "")) + '</span></div><p class="pr-name">' + esc(pairNameL(p.pair)) + "</p><p>" + esc(pairTextL(p)) + '</p><p class="pr-o">' + esc(pairOrderL(p)) + "</p></li>").join("");
    // ผลรวม
    const s = r.sum;
    $("#nmSum").innerHTML = '<div class="sum-n ' + GCLS[s.grade] + '"><b>' + s.sum + "</b><span>" + esc(gradeName(s.grade)) + "</span></div><div><p class=\"sum-name\">" + esc(sumNameL(s)) + (s.notable ? ' <span class="badge">' + esc(T("numbers.sum.badge", "ผลรวมยอดนิยม")) + '</span>' : "") + "</p><p>" + esc(sumTextL(s)) + '</p><p class="nm-small">' + esc(sumRootL(s)) + (s.raw !== s.sum ? esc(T("numbers.sum.raw", " · ผลรวมจริง {raw} ทอนเป็น {s}", { raw: s.raw, s: s.sum })) : "") + "</p>" + (s.extra ? '<p class="nm-small">' + esc(sumExtraL(s)) + "</p>" : "") + "</div>";
    // รูปแบบ
    $("#nmPatBlock").hidden = !r.patterns.length;
    $("#nmPats").innerHTML = r.patterns.map(p => "<li><b>" + esc(patLabelL(p)) + "</b> <small>" + esc(patEvidenceL(p)) + " · +" + p.bonus + "</small></li>").join("");
    // อักษรกาลกิณี
    const kb = $("#nmKala");
    if (r.kind === "plate" || r.kind === "name") {
      kb.hidden = false;
      const zh = trL();
      kb.innerHTML = !r.weekday ? '<p class="nm-small">' + esc(T("numbers.kala.pick", "เลือกวันเกิดด้านบน (ไม่บังคับ) เพื่อดูอักษรที่บางตำราแนะให้ใส่ใจ")) + '</p>' :
        r.kala.length ? (zh ? "<p>" + esc(T("numbers.kala.yes", "", { k: r.kala.join(" "), wd: wdName(r.weekday) })) + "</p>" : "<p>ตามบางตำรา อักษร <b>" + esc(r.kala.join(" ")) + "</b> เป็นอักษรที่คน" + esc(r.weekday.th) + "ให้ใส่ใจ (กาลกิณี) — เป็นเพียงความเชื่อ ไม่ได้มีผลร้ายใด ๆ หากชอบความสบายใจ ครั้งหน้าจะเลือกเลี่ยงก็ได้</p>") + (r.weekday.kalaNote ? '<p class="nm-small">' + esc(T("numbers.kalaNote." + r.weekday.id, r.weekday.kalaNote)) + "</p>" : "") :
        "<p>" + esc(T("numbers.kala.no", "ไม่พบอักษรกาลกิณีของ{wd} ({k}) — สบายใจได้", { wd: zh ? wdName(r.weekday) : r.weekday.th, k: r.weekday.kala.split("").join(" ") })) + "</p>";
    } else kb.hidden = true;
    // เป้าหมาย (เฉพาะเบอร์)
    const gb = $("#nmGoals");
    gb.hidden = r.kind !== "phone";
    if (r.kind === "phone") $("#nmGoalList").innerHTML = goalMatch(r).map(g => '<li><h4>' + esc(T("numbers.goal." + g.id, g.th)) + ' <span class="badge' + (g.hit.length ? " on" : "") + '">' + esc(g.hit.length ? T("numbers.goal.hit", "มี {n} คู่ตรงเป้า", { n: g.hit.length }) : T("numbers.goal.none", "ยังไม่มีคู่ตรงเป้า")) + "</span></h4>" + (g.hit.length ? '<p class="nm-small">' + esc(T("numbers.goal.found", "คู่ที่พบ: {p}", { p: g.hit.join(", ") })) + "</p>" : "") + "<ul>" + g.tips.map((t, i) => "<li>" + esc(goalTipL(g.id, i, t)) + "</li>").join("") + "</ul></li>").join("");
    const sw = strengthWordsL(r);
    $("#nmWordsBlock").hidden = !sw.length;
    $("#nmWords").innerHTML = sw.map(n => "<span>" + esc(n) + "</span>").join("");
    narrate();
    if (quiet) return;
    $("#nmResTitle").focus({ preventScroll: true });
    sec.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function renderDaily(L, quiet) {
    const box = $("#nmDaily"); box.hidden = false; lastDaily = L;
    const zh = trL(), wi = KB.dailyWords.indexOf(L.word), di = KB.dailyDirections.indexOf(L.direction);
    const word = zh ? { w: T("numbers.dw." + wi + ".w", L.word.w), p: T("numbers.dw." + wi + ".p", L.word.p) } : L.word;
    const same = L.today.id === L.weekday.id || (L.today.id === "wed" && L.weekday.id === "wedn");
    const notes = zh ? [T("numbers.daily.n1", "", { c: wdColor(L.today), wd: wdName(L.today) }),
      same ? T("numbers.daily.n2same", "", { c: wdColor(L.weekday) }) : T("numbers.daily.n2", "", { c: wdColor(L.weekday), wd: wdName(L.weekday) }),
      T("numbers.daily.n3", "")] : L.notes;
    const head = zh ? T("numbers.daily.head", "", { b: wdName(L.weekday), t: wdName(L.today) }) : "วันเกิด" + L.weekday.th.replace(/^วัน/, "") + " · วันนี้" + L.today.th.replace(/^วัน/, "");
    $("#nmDailyBody").innerHTML = '<p class="nm-small">' + esc(head) + '</p><dl class="dy-grid">' +
      "<div><dt>" + esc(T("numbers.daily.color", "สีวันนี้")) + "</dt><dd>" + esc(zh ? wdColor(L.today) : L.color) + "</dd></div><div><dt>" + esc(T("numbers.daily.birth", "สีเสริมของคุณ")) + "</dt><dd>" + esc(zh ? wdColor(L.weekday) : L.birthColor) + "</dd></div><div><dt>" + esc(T("numbers.daily.dir", "ทิศเสริมพลัง")) + "</dt><dd>" + esc(T("numbers.dir." + di, L.direction)) + "</dd></div><div><dt>" + esc(T("numbers.daily.word", "คำพลังวันนี้")) + "</dt><dd>" + esc(word.w) + "</dd></div></dl>" +
      '<p class="dy-word">' + esc(word.p) + '</p><ul class="nm-small">' + notes.map(n => "<li>" + esc(n) + "</li>").join("") + '</ul><p class="nm-small">' + esc(T("numbers.daily.foot", "เพื่อความสนุกและเป็นกำลังใจเล็ก ๆ เท่านั้น ไม่ใช่คำแนะนำในการตัดสินใจเรื่องสำคัญ")) + '</p>';
    if (!quiet) box.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function renderCompare(rows, quiet) {
    const box = $("#nmCompare"); box.hidden = false; lastCompare = rows;
    const L = { s: esc(T("numbers.th2", "คะแนน")), u: esc(T("numbers.th3", "ผลรวม")), b: esc(T("numbers.th4", "คู่เด่นมาก")), c: esc(T("numbers.th5", "คู่ควรระวัง")) };
    $("#nmCmpBody").innerHTML = rows.map((r, i) => r.error ? '<tr><th scope="row">—</th><td colspan="4">' + esc(r.input) + ' <small class="err">' + esc(T(r.error, r.error)) + "</small></td></tr>" :
      '<tr' + (i === 0 ? ' class="top"' : "") + '><th scope="row">' + esc(r.display) + (i === 0 ? ' <span class="badge on">' + esc(T("numbers.cmp.top", "คะแนนสูงสุด")) + '</span>' : "") + '</th><td data-l="' + L.s + '"><b>' + r.score + '</b></td><td data-l="' + L.u + '">' + r.sum + '</td><td data-l="' + L.b + '">' + (r.best.join(", ") || "—") + '</td><td data-l="' + L.c + '">' + (esc(r.care.join(", ")) || esc(T("numbers.cmp.none", "ไม่มี"))) + "</td></tr>").join("");
    if (!quiet) box.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /* ---------- คำอ่าน (fortune-ai.js) ---------- */
  function fallbackRender(res, box) {
    box.innerHTML = (res.sections || []).map(s => '<section class="nr-sec"><h4>' + esc(s.title) + "</h4>" + (s.paragraphs || []).map(p => "<p>" + esc(p) + "</p>").join("") + "</section>").join("") || '<p class="nm-small">' + esc(T("numbers.noReading", "ยังไม่มีคำอ่าน")) + '</p>';
  }
  function renderNarr(res) {
    const box = $("#nmNarr");
    let done = false;
    if (F && typeof F.renderSections === "function") {
      try { F.renderSections(box, res, { aiBadge: false, showNote: false }); done = box.childNodes.length > 0 || !(res.sections || []).length; } catch (e) { done = false; }
    }
    if (!done) fallbackRender(res, box);
    const ai = res.source === "ai";
    const b = $("#nmSrc"); b.textContent = ai ? T("numbers.src.ai", "เรียบเรียงโดย Claude AI") : T("numbers.src.local", "เรียบเรียงในเครื่อง"); b.className = "src-badge " + (ai ? "ai" : "local");
    $("#nmNarrNote").textContent = res.note || "";
  }
  async function narrate(again) {
    const box = $("#nmNarr");
    if (!current) return;
    const my = ++narrSeq, useAI = !!(aiEnabled && (F && typeof F.hasConsent === "function" ? F.hasConsent() : prefs.ai));
    const topic = $("#nmTopic").value;
    currentFacts = buildFacts(current, topic, { forAI: useAI });
    if (!F) { box.innerHTML = '<p class="nm-small">' + esc(T("numbers.noComposer", "ไม่พบตัวเรียบเรียงคำอ่าน (fortune-ai.js)")) + '</p>'; return; }
    $("#nmAgain2").disabled = true; box.setAttribute("aria-busy", "true");
    if (useAI) box.innerHTML = '<p class="nm-small">' + esc(T("numbers.loading", "กำลังเรียบเรียงคำอ่าน...")) + '</p>';
    let res;
    try {
      if (again && typeof F.regenerate === "function") res = await F.regenerate(currentFacts, { useAI });
      if (!res || !Array.isArray(res.sections)) res = await F.interpret(currentFacts, { useAI });
    } catch (e) { res = F.compose ? F.compose(currentFacts) : { source: "local", sections: [] }; }
    if (my !== narrSeq) return;
    renderNarr(res);
    $("#nmAgain2").disabled = false; box.removeAttribute("aria-busy");
  }
  $("#nmAgain2").addEventListener("click", () => { touch(); narrate(true); });
  $("#nmTopic").addEventListener("change", () => { if (current) narrate(); });

  function setupConsent() {
    const wrap = $("#nmConsent");
    if (!F || typeof F.status !== "function") { wrap.hidden = true; return; }
    F.status().then(st => {
      aiEnabled = !!(st && st.enabled);
      if (!aiEnabled) { wrap.hidden = true; return; }
      wrap.hidden = false;
      if (typeof F.consentControl === "function") {
        wrap.replaceChildren();
        Promise.resolve(F.consentControl(wrap, { onChange: () => { if (current) narrate(); } })).then(el => { if (!el) wrap.hidden = true; }).catch(() => { wrap.hidden = true; });
        return;
      }
      const cb = $("#nmAI"); cb.checked = !!prefs.ai;
      cb.addEventListener("change", () => { prefs.ai = cb.checked; lsSet(PREF_KEY, prefs); narrate(); });
    }).catch(() => { wrap.hidden = true; });
  }

  /* ---------- การ์ดแชร์ 1080×1350 (ปิดบังตัวเลข) ---------- */
  function wrapText(c, text, x, y, maxW, lh, maxLines) {
    const words = text.split(/(\s+)/); let line = "", n = 0;
    const flush = () => { c.fillText(line.trim(), x, y + n * lh); n++; line = ""; };
    for (const w of words) {
      const t = line + w;
      if (c.measureText(t).width > maxW && line.trim()) { if (n === maxLines - 1) { c.fillText(line.trim().replace(/.$/, "…"), x, y + n * lh); return n + 1; } flush(); line = w.trimStart(); }
      else if (c.measureText(t).width > maxW) { let s = ""; for (const ch of t) { if (c.measureText(s + ch).width > maxW) { line = s; flush(); s = ""; if (n >= maxLines) return n; } s += ch; } line = s; }
      else line = t;
    }
    if (line.trim()) flush();
    return n;
  }
  async function makeCard() {
    const r = current, W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const c = cv.getContext("2d");
    try { await document.fonts.load("600 40px Prompt"); await document.fonts.load("400 30px Prompt"); } catch (e) { /* ใช้ฟอนต์ระบบ */ }
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0e1430"); g.addColorStop(1, "#2a1f6b"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.08; c.fillStyle = "#fff"; c.font = "700 420px Prompt, sans-serif"; c.textAlign = "right"; c.fillText(String(r.sum.sum), W - 30, 520); c.globalAlpha = 1;
    c.textAlign = "left"; c.fillStyle = "#22d3ee"; c.font = "600 34px Prompt, sans-serif"; c.fillText(T("numbers.card.brand", "LENSIQ · เลขมงคล"), 80, 120);
    c.fillStyle = "#c9d0ea"; c.font = "400 36px Prompt, sans-serif"; c.fillText(kindName(r.kind), 80, 200);
    c.fillStyle = "#fff"; c.font = "600 88px Prompt, sans-serif"; c.fillText(r.kind === "house" && trL() ? String(r.masked).replace(/^เลขที่ /, isEn() ? "No. " : "门牌 ") : r.kind === "name" && trL() ? T("numbers.kind.name", "ชื่อ") + " · " + r.chars.length : r.masked, 80, 300);
    // วงคะแนน
    const cx = 220, cy = 520, R = 130;
    c.lineWidth = 26; c.strokeStyle = "rgba(255,255,255,.12)"; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = "#facc15"; c.lineCap = "round"; c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * r.score / 100); c.stroke();
    c.fillStyle = "#fff"; c.textAlign = "center"; c.font = "700 96px Prompt, sans-serif"; c.fillText(String(r.score), cx, cy + 30);
    c.font = "400 28px Prompt, sans-serif"; c.fillStyle = "#c9d0ea"; c.fillText(T("numbers.card.score", "คะแนน / 100"), cx, cy + 76);
    c.textAlign = "left"; c.fillStyle = "#facc15"; c.font = "600 46px Prompt, sans-serif"; c.fillText(scoreWord(r.score), 410, 470);
    c.fillStyle = "#fff"; c.font = "400 34px Prompt, sans-serif"; c.fillText(T("numbers.card.sum", "ผลรวม {s} · {g}", { s: r.sum.sum, g: gradeName(r.sum.grade) }), 410, 530);
    c.fillStyle = "#c9d0ea"; c.font = "400 30px Prompt, sans-serif"; wrapText(c, sumNameL(r.sum), 410, 580, 600, 40, 2);
    // คู่เด่น
    const best = r.pairs.filter(p => !p.care).sort((a, b) => b.pts * b.weight - a.pts * a.weight).filter((p, i, a) => a.findIndex(q => q.pair === p.pair) === i).slice(0, 3);
    let y = 720;
    c.fillStyle = "#22d3ee"; c.font = "600 34px Prompt, sans-serif"; c.fillText(best.length ? T("numbers.card.best", "คู่เลขเด่น") : T("numbers.card.sumMeaning", "ความหมายผลรวม"), 80, y); y += 30;
    if (best.length) best.forEach(p => {
      y += 24; c.fillStyle = "rgba(255,255,255,.08)"; c.beginPath(); c.roundRect ? c.roundRect(80, y, W - 160, 130, 22) : c.rect(80, y, W - 160, 130); c.fill();
      c.fillStyle = "#facc15"; c.font = "700 64px Prompt, sans-serif"; c.fillText(p.pair, 110, y + 88);
      c.fillStyle = "#fff"; c.font = "600 32px Prompt, sans-serif"; c.fillText(pairNameL(p.pair), 250, y + 52);
      c.fillStyle = "#c9d0ea"; c.font = "400 26px Prompt, sans-serif"; wrapText(c, trL() ? cap(first((zkItem("pair." + p.pair) || {}).o || p.phrases[0])) : p.phrases[0], 250, y + 94, W - 360, 34, 1);
      y += 130;
    });
    else { c.fillStyle = "#fff"; c.font = "400 32px Prompt, sans-serif"; wrapText(c, sumTextL(r.sum), 80, y + 50, W - 160, 46, 5); }
    c.fillStyle = "#c9d0ea"; c.font = "400 26px Prompt, sans-serif"; c.textAlign = "center";
    c.fillText(T("numbers.card.foot", "{d} · ไม่ใช้เพื่อการพนัน", { d: T("numbers.disclaimerShort", KB.disclaimerShort) }), W / 2, H - 70);
    return cv;
  }
  let cardUrl = null;
  $("#nmShare").addEventListener("click", async function () {
    if (!current) return; touch();
    const b = this; b.disabled = true;
    try {
      const cv = await makeCard();
      const blob = await new Promise(res => cv.toBlob(res, "image/png"));
      if (cardUrl) URL.revokeObjectURL(cardUrl);
      cardUrl = URL.createObjectURL(blob);
      const im = $("#nmCardImg"); im.src = cardUrl; im.hidden = false;
      const file = new File([blob], "lensiq-เลขมงคล.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: T("numbers.share.title", "เลขมงคล — LENSIQ"), text: T("numbers.share.text", "{k} คะแนน {s}/100 · {d}", { k: kindName(current.kind), s: current.score, d: T("numbers.disclaimerShort", KB.disclaimerShort) }) }); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
      const a = document.createElement("a"); a.href = cardUrl; a.download = "lensiq-numbers.png"; document.body.append(a); a.click(); a.remove();
      toast(T("numbers.toast.saved", "บันทึกการ์ดแล้ว (ตัวเลขถูกปิดบังบางส่วน)"));
    } catch (e) { console.error(e); toast(T("numbers.toast.fail", "สร้างการ์ดไม่สำเร็จ")); }
    finally { b.disabled = false; }
  });
  $("#nmPrint").addEventListener("click", () => { touch(); window.print(); });
  $("#nmAgain").addEventListener("click", reset);

  function toast(msg) { const t = $("#nmToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 2200); }
  function reset() {
    hideResults();
    if (cardUrl) { URL.revokeObjectURL(cardUrl); cardUrl = null; }
    ["#nmPhone", "#nmPlate", "#nmHouse", "#nmAcct", "#nmName"].forEach(s => { $(s).value = ""; });
    document.querySelectorAll(".nm-cmp-in").forEach(i => { i.value = ""; });
    if (document.body.classList.contains("nm-kiosk")) $("#nmWd").value = "";
    $("#nmApp").scrollIntoView({ block: "start" });
  }

  /* ---------- สถิติ ---------- */
  const TYPE_TH = { phone: "เบอร์มือถือ", plate: "ทะเบียนรถ", house: "บ้าน/ห้อง", account: "บัญชี", name: "ชื่อ", daily: "พลังประจำวัน", lucky: "เลขนำโชค (เดิม)", compare: "เปรียบเทียบ" };
  function stat(type) { if (prefs.stats) { lsSet(STATS_KEY, addStat(lsGet(STATS_KEY, null), type)); renderStats(); } }
  function renderStats() {
    const st = lsGet(STATS_KEY, null), box = $("#nmStats");
    if (!st || !st.total) { box.innerHTML = '<p class="nm-small">' + esc(T("numbers.stats.none", "ยังไม่มีการวิเคราะห์ในเครื่องนี้")) + '</p>'; return; }
    const d = new Date(), today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    box.innerHTML = '<p class="stat-n"><b>' + st.total + "</b> " + esc(T("numbers.stats.total", "ครั้ง")) + " <small>" + esc(T("numbers.stats.today", "(วันนี้ {n})", { n: (st.days || {})[today] || 0 })) + "</small></p>" +
      Object.keys(TYPE_TH).filter(k => (st.types || {})[k]).map(k => { const n = st.types[k]; return '<div class="stbar"><span>' + esc(T("numbers.type." + k, TYPE_TH[k])) + '</span><i style="--w:' + Math.round(n / st.total * 100) + '%"></i><b>' + n + "</b></div>"; }).join("");
  }
  $("#nmStatsOn").checked = !!prefs.stats;
  $("#nmStatsOn").addEventListener("change", function () { prefs.stats = this.checked; lsSet(PREF_KEY, prefs); });
  $("#nmStatsClear").addEventListener("click", () => { if (confirm(T("numbers.confirmClear", "ล้างสถิติในเครื่องนี้?"))) { try { localStorage.removeItem(STATS_KEY); } catch (e) { /* ไม่เป็นไร */ } renderStats(); } });
  renderStats();

  /* ---------- โหมดบูธ ---------- */
  let idleT = null, idleTick = null, wasFs = false;
  function touch() {
    clearTimeout(idleT); clearInterval(idleTick);
    const el = $("#nmIdle"); el.hidden = true;
    if (!document.body.classList.contains("nm-kiosk")) return;
    if ($("#nmResult").hidden && $("#nmDaily").hidden && $("#nmCompare").hidden) return;
    const until = Date.now() + IDLE_MS;
    idleTick = setInterval(() => { const left = Math.ceil((until - Date.now()) / 1000); if (left <= 15) { el.hidden = false; el.textContent = T("numbers.idle", "กลับหน้าเริ่มต้นใน {n} วินาที — แตะเพื่ออยู่ต่อ", { n: left }); } }, 1000);
    idleT = setTimeout(() => { clearInterval(idleTick); el.hidden = true; reset(); }, IDLE_MS);
  }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(ev => document.addEventListener(ev, () => { if (document.body.classList.contains("nm-kiosk")) touch(); }, { passive: true }));
  function setKiosk(on) {
    document.body.classList.toggle("nm-kiosk", on);
    $("#nmKiosk").setAttribute("aria-pressed", on ? "true" : "false");
    $("#nmKioskExit").hidden = !on;
    if (on) {
      const de = document.documentElement;
      if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().then(() => { wasFs = true; }).catch(() => {});
      $("#nmApp").scrollIntoView({ block: "start" });
    } else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    touch();
  }
  $("#nmKiosk").addEventListener("click", () => setKiosk(!document.body.classList.contains("nm-kiosk")));
  $("#nmKioskExit").addEventListener("click", () => setKiosk(false));
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && wasFs) { wasFs = false; setKiosk(false); } });

  // วันเกิด/แหล่งอ้างอิง/ตารางอักษรจาก KB (เรนเดอร์ใหม่เมื่อสลับภาษา)
  function renderKbText() {
    const sel = $("#nmWd"), v = sel.value;
    sel.querySelectorAll("option[data-wd]").forEach(o => o.remove());
    sel.insertAdjacentHTML("beforeend", KB.weekdays.map(w => '<option data-wd value="' + w.id + '">' + esc(wdName(w)) + "</option>").join(""));
    sel.value = v;
    $("#nmSources").innerHTML = KB.sources.map((s, i) => '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(T("numbers.srcl." + i, s.label)) + "</a></li>").join("");
    renderLetterTables();
    $("#nmTips").innerHTML = KB.generalTips.map((t, i) => "<li>" + esc(T("numbers.tip." + i, t)) + "</li>").join("");
  }
  // ตารางค่าอักษรไทย/อักษรกาลกิณี: เรนเดอร์เมื่อเปิด "ดูวิธีคำนวณ" เท่านั้น (ข้อมูลอักษรไทยล้วน ไม่ต้องแสดงตอนปิด)
  function renderLetterTables() {
    const open = !!($("#nmLetterTable").closest("details") || {}).open;
    if (!open) { $("#nmLetterTable").innerHTML = ""; $("#nmKalaTable").innerHTML = ""; return; }
    $("#nmLetterTable").innerHTML = Object.keys(KB.letterValues).map(v => '<tr><th scope="row">' + v + '</th><td lang="th">' + esc(KB.letterValues[v].split("").map(ch => /[ก-ฮ]/.test(ch) ? ch : "◌" + ch).join(" ").replace(/◌([เแโใไา])/g, "$1")) + "</td></tr>").join("");
    $("#nmKalaTable").innerHTML = KB.weekdays.map(w => '<tr><th scope="row">' + esc(wdName(w)) + '</th><td><span lang="th">' + esc(w.kala.split("").join(" ")) + "</span>" + (w.kalaNote ? " <small>(" + esc(T("numbers.kalaNote." + w.id, w.kalaNote)).replace(/[\u0E00-\u0E7F]+/g, m => '<span lang="th">' + m + "</span>") + ")</small>" : "") + "</td></tr>").join("");
  }
  renderKbText();
  { const dt = $("#nmLetterTable").closest("details"); if (dt) dt.addEventListener("toggle", renderLetterTables); }
  setTab("phone");
  // สลับภาษา: เรนเดอร์ข้อความไดนามิกใหม่ และเรียบเรียงคำอ่านใหม่จาก facts เดิม (fortune-ai เลือกภาษาเอง)
  root.addEventListener("lq-lang", () => {
    setTab(mode); renderKbText(); renderStats();
    if (current && !$("#nmResult").hidden) renderResult(current, true);
    if (lastDaily && !$("#nmDaily").hidden) renderDaily(lastDaily, true);
    if (lastCompare && !$("#nmCompare").hidden) renderCompare(lastCompare, true);
  });
  setupConsent();
  root.__nm = { get current() { return current; }, get facts() { return currentFacts; }, makeCard, reset, setTab };
})(typeof window !== "undefined" ? window : globalThis);
