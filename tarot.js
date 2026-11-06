/* ไพ่ทาโรต์ & เซียมซี — LENSIQ
   ส่วนบน: ฟังก์ชันล้วน (สับไพ่ด้วย crypto, ไพ่ประจำวันแบบ seed ตามวันที่, ตีความ, สรุปภาพรวม, สถิติ) — ทดสอบได้ใน Node
   ส่วนล่าง: UI ในเบราว์เซอร์ (ทำงานเมื่อพบ #trApp)
   เพื่อความบันเทิงตามความเชื่อ ไม่ใช่การพยากรณ์ทางวิทยาศาสตร์ */
(function (root) {
  "use strict";
  var KB = root.TAROT_KB || (typeof require === "function" ? require("./tarot-kb.js") : null);

  /* ---------- สุ่มด้วย crypto.getRandomValues ---------- */
  function cryptoU32() {
    var c = (typeof globalThis !== "undefined" && globalThis.crypto) || root.crypto;
    var a = new Uint32Array(1); c.getRandomValues(a); return a[0];
  }
  /** จำนวนเต็มสุ่มแบบสม่ำเสมอ 0..n-1 (rejection sampling ไม่เอียง) */
  function randInt(n, u32) {
    u32 = u32 || cryptoU32;
    var lim = Math.floor(4294967296 / n) * n, x;
    do { x = u32(); } while (x >= lim);
    return x % n;
  }
  /** Fisher–Yates คืนอาร์เรย์ใหม่ */
  function shuffle(arr, u32) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = randInt(i + 1, u32); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  /** สำรับที่สับแล้ว [{id, rev}] — rev สุ่มเฉพาะเมื่อเปิดใช้ไพ่กลับหัว */
  function makeDeck(withReversed, u32) {
    return shuffle(KB.cards.map(function (c) { return c.id; }), u32).map(function (id) {
      return { id: id, rev: withReversed ? randInt(2, u32) === 1 : false };
    });
  }

  /* ---------- ไพ่ประจำวัน: seed จากวันที่ (เหมือนกันทั้งวัน) ---------- */
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function dailyCard(d) {
    var r = mulberry32(hashStr("lensiq-tarot-" + dayKey(d)));
    r(); return KB.cards[Math.floor(r() * KB.cards.length)];
  }

  /* ---------- ตีความ ---------- */
  function meaning(card, rev, topic) { return (rev ? card.reversed : card.upright)[topic || "general"]; }
  function interpret(card, rev, topic, pos) {
    var m = meaning(card, rev, topic);
    var text = m;
    if (pos && pos.advice) text = m + " — " + card.advice;
    return { lead: pos ? pos.lead : "", text: text, orient: rev ? "กลับหัว" : "ตั้งตรง" };
  }

  /** สรุปภาพรวมจากไพ่ที่เปิด: picks = [{id, rev}] ตามลำดับตำแหน่ง */
  function synthesize(picks, topic, spreadKey) {
    var S = KB.spreads[spreadKey], cards = picks.map(function (p) { return KB.byId[p.id]; });
    var n = picks.length, el = { fire: 0, water: 0, air: 0, earth: 0 }, majors = 0, rev = 0, courts = 0, aces = 0;
    cards.forEach(function (c, i) {
      el[c.element]++;
      if (c.arcana === "major") majors++;
      if (picks[i].rev) rev++;
      if (c.court) courts++;
      if (c.arcana === "minor" && c.n === 1) aces++;
    });
    var Y = KB.synth, lines = [];
    var ranked = Object.keys(el).sort(function (a, b) { return el[b] - el[a]; });
    var dom = n >= 3 && el[ranked[0]] > el[ranked[1]] && el[ranked[0]] / n >= 0.4 ? ranked[0] : null;
    if (n >= 3) {
      if (majors / n >= 0.5) lines.push(Y.majorsHigh);
      else if (majors > 0) lines.push(Y.majorsSome);
      else lines.push(Y.majorsNone);
      lines.push(dom ? KB.elements[dom].dom : Y.balanced);
      if (rev / n >= 0.5) lines.push(Y.reversedHigh);
      else if (rev === 0) lines.push(Y.reversedNone);
      if (courts >= 2) lines.push(Y.courts);
      if (aces >= 1) lines.push(Y.aces);
    } else {
      var c0 = cards[0];
      lines.push((c0.arcana === "major" ? "ไพ่ชุดใหญ่ — ข้อความสำคัญสำหรับวันนี้ " : "ไพ่ชุด" + KB.suits[c0.suit].th + " ธาตุ" + KB.elements[c0.element].th + " — ") + "พลังเด่นคือ " + c0.keywords.slice(0, 2).join(" และ "));
    }
    lines.push(Y.topicTip[topic]);
    // คำแนะนำหลัก: ตำแหน่งคำแนะนำ ถ้าไม่มีใช้ไพ่ใบสุดท้าย
    var advIdx = S.positions.findIndex(function (p) { return p.advice; });
    if (advIdx < 0) advIdx = n - 1;
    var advCard = cards[advIdx];
    var headline = n >= 3 && majors / n >= 0.5 ? "ช่วงเปลี่ยนแปลงสำคัญ" : dom ? "พลังธาตุ" + KB.elements[dom].th + " · " + KB.elements[dom].theme.split(" ")[0] : n >= 3 ? "สมดุลทุกด้าน" : cards[0].keywords[0];
    var keyIdx = n >= 3 ? (spreadKey === "celtic" ? 0 : 1) : 0;
    var keyCard = cards[keyIdx], keyPos = S.positions[keyIdx];
    var keyMessages = [
      headline + (n >= 3 ? " — " + (majors ? "ไพ่ชุดใหญ่ " + majors + " ใบ" : "ไพ่ชุดเล็กทั้งหมด") : ""),
      keyPos.th.replace(/^\d+ · /, "") + ": " + keyCard.th + " — " + keyCard.keywords.slice(0, 2).join(" · "),
      "คำแนะนำ: " + advCard.advice
    ];
    return { n: n, elements: el, dominant: dom, majors: majors, reversed: rev, courts: courts, aces: aces, lines: lines, headline: headline, advice: advCard.advice, adviceCard: advCard.id, keyMessages: keyMessages };
  }

  /** สถิติแบบไม่ระบุตัวตน (localStorage "tarot-stats") — รับ/คืนออบเจ็กต์ */
  function addStat(st, ids, topic, now) {
    st = st && typeof st === "object" ? st : {};
    var day = dayKey(new Date(now || Date.now()));
    var out = { v: 1, total: (st.total || 0) + 1, days: Object.assign({}, st.days || {}), cards: Object.assign({}, st.cards || {}), topics: Object.assign({}, st.topics || {}) };
    out.days[day] = (out.days[day] || 0) + 1;
    (ids || []).forEach(function (id) { out.cards[id] = (out.cards[id] || 0) + 1; });
    if (topic) out.topics[topic] = (out.topics[topic] || 0) + 1;
    return out;
  }

  /* ---------- ข้อเท็จจริงสำหรับ fortune-ai.js (สัญญา facts) ---------- */
  var POS_W = { heart: 0.95, today: 0.95, present: 0.9, situation: 0.9, you: 0.9, outcome: 0.88, advice: 0.86, future: 0.82, near: 0.8, crown: 0.78, trend: 0.8, bond: 0.85, other: 0.8,
    obstacle: 0.76, cross: 0.76, lesson: 0.74, root: 0.66, past: 0.62, self: 0.7, env: 0.62, hope: 0.68 };
  var TIME_LEAD = { past: "ที่ผ่านมา ", future: "ในระยะต่อไป ", near: "ในอีกไม่นานนี้ ", outcome: "ถ้าเดินต่อในทางนี้ ", trend: "ในวันข้างหน้า ", crown: "ในระยะยาว " };
  var TIME_TPL = ["พลังของ{A}และ{B}จะเข้ามามีบทบาทในเรื่องนี้มากขึ้น", "เรื่องของ{A}จะค่อย ๆ ชัดเจนขึ้นจนคุณสัมผัสได้", "จังหวะชีวิตจะพาคุณไปพบบทเรียนเรื่อง{B}", "สิ่งที่เกี่ยวกับ{A}จะเป็นตัวกำหนดทิศทางของเรื่องนี้"];
  // ตำแหน่งอดีต/รากเหง้า: ใช้กาลอดีต ไม่ใช้ "จะ…" (ไม่งั้นได้ "ที่ผ่านมา … จะเป็นตัวกำหนด")
  var PAST_TPL = ["พลังของ{A}และ{B}มีบทบาทกับเรื่องนี้มาตลอด", "เรื่องของ{A}ค่อย ๆ ก่อตัวจนกลายเป็นพื้นของสถานการณ์ตอนนี้", "คุณได้เรียนรู้เรื่อง{B}มาแล้วไม่น้อย", "สิ่งที่เกี่ยวกับ{A}เคยเป็นตัวกำหนดทิศทางของเรื่องนี้"];
  var PAST_POS = { past: 1, root: 1 };
  var FUTURE_RE = /จะ|ในอนาคต|เร็ว ๆ นี้|ข้างหน้า|ต่อจากนี้|ในวันข้างหน้า/;
  // ความหมายของไพ่ในตำแหน่งอดีต: เลือกสำนวนที่ไม่มีคำบอกอนาคตก่อน ถ้าไม่มีเลย ตัด "(กำลัง)จะ" ออกให้เป็นกาลปัจจุบัน/อดีต
  // "ตอนนี้/ช่วงนี้/กำลัง…" ในไพ่ตำแหน่งอดีตอ่านขัดกับตำแหน่ง → เปลี่ยนเป็น "ในช่วงที่ผ่านมา"
  var NOW_RE = /ตอนนี้|ช่วงนี้|ขณะนี้/g;
  function pastTense(arr) {
    var plain = arr.filter(function (x) { return !FUTURE_RE.test(x); });
    var out = plain.length ? plain : arr.filter(function (x) { return !/ในอนาคต|เร็ว ๆ นี้|ข้างหน้า|ต่อจากนี้/.test(x); }).map(function (x) { return x.replace(/(?:กำลัง)?จะ(?=\S)/g, ""); }).filter(Boolean);
    var noNow = out.filter(function (x) { return !/ตอนนี้|ช่วงนี้|ขณะนี้/.test(x); });
    return noNow.length ? noNow : out.map(function (x) { return x.replace(/กำลัง(?=เป็น)/g, "").replace(NOW_RE, "ในช่วงที่ผ่านมา"); });
  }
  var fillT = function (t, v) { return t.replace(/\{(\w+)\}/g, function (_, k) { return v[k] != null ? v[k] : ""; }); };
  var TOPIC_FA = { general: "overall", love: "love", work: "work", money: "money" };
  var pickR = function (r, a) { return a[Math.floor(r() * a.length)]; };
  /** picks = [{id, rev}] ตามลำดับตำแหน่ง; คืน facts ตามสัญญาของ fortune-ai.js */
  function buildFacts(picks, topic, spreadKey, opts) {
    opts = opts || {};
    var r = opts.rng || Math.random, S = KB.spreads[spreadKey], P = KB.patterns, items = [];
    var cards = picks.map(function (p) { return KB.byId[p.id]; }), Y = synthesize(picks, topic, spreadKey), n = picks.length;
    // 1) รูปแบบของทั้งชุด
    var pat = [pickR(r, P.overviewOpen[topic])];
    if (n >= 3) {
      pat.push(pickR(r, Y.majors / n >= 0.5 ? P.majorsHigh : Y.majors ? P.majorsSome : P.majorsNone));
      if (Y.dominant) pat.push(pickR(r, P.elementDominant[Y.dominant]));
      var miss = Object.keys(Y.elements).filter(function (k) { return !Y.elements[k]; });
      if (miss.length && n >= 5) pat.push(pickR(r, P.elementMissing[pickR(r, miss)]));
      pat.push(pickR(r, Y.reversed / n >= 0.5 ? P.reversedHigh : Y.reversed ? P.reversedSome : P.reversedNone));
      if (Y.courts >= 2) pat.push(pickR(r, P.courts));
      if (Y.aces) pat.push(pickR(r, P.aces));
      var half = Math.floor(n / 2), early = picks.slice(0, half).filter(function (p) { return p.rev; }).length, late = picks.slice(n - half).filter(function (p) { return p.rev; }).length;
      if (early >= Math.max(1, half - 1) && late === 0) pat.push(pickR(r, P.flow.rising));
      else if (late >= Math.max(1, half - 1) && early === 0) pat.push(pickR(r, P.flow.settling));
    }
    items.push({ id: "spread.pattern", group: "ภาพรวมของไพ่", label: "รูปแบบของไพ่ทั้งชุด", short: "ไพ่ทั้งชุด", evidence: S.th + " มีไพ่ชุดใหญ่ " + Y.majors + " ใบ" + (Y.reversed ? " กลับหัว " + Y.reversed + " ใบ" : " ไม่มีใบกลับหัว"),
      strength: 0.97, tags: ["overview", "advice"], meanings: { overview: pat, advice: P.topicClose[topic].slice() } });
    // 2) ไพ่แต่ละตำแหน่ง — ไม่ใช้กรอบประโยคเดียวกันซ้ำกับไพ่ใบอื่นในคำทำนายเดียว
    var usedT = {}, tCount = 0, tOff = Math.floor(r() * TIME_TPL.length);
    var uniq = function (arr, ids) { var out = arr.filter(function (x, j) { return !ids[j] || !usedT[ids[j]]; }); ids.forEach(function (t) { if (t) usedT[t] = 1; }); return out; };
    picks.forEach(function (p, i) {
      var c = cards[i], pos = S.positions[i], o = p.rev ? "r" : "u", ph = c.phr[o], T = c.phrTpl[o];
      var m = { overview: uniq(ph.general, T.general), love: uniq(ph.love, T.love), work: uniq(ph.work, T.work), money: uniq(ph.money, T.money) };
      var isPast = !!PAST_POS[pos.key];
      if (isPast) Object.keys(m).forEach(function (k) { var v = pastTense(m[k]); if (v.length) m[k] = v; else delete m[k]; });
      if (TIME_LEAD[pos.key]) { var kw = c.keywords; m.timing = [TIME_LEAD[pos.key] + fillT((isPast ? PAST_TPL : TIME_TPL)[(tOff + tCount++) % TIME_TPL.length], { A: kw[0], B: kw[1] })]; }
      if (pos.advice || pos.key === "outcome" || pos.key === "today" || i === n - 1) m.advice = uniq(c.phr.advice, c.phrTpl.advice);
      var w = (POS_W[pos.key] || 0.6) + (c.arcana === "major" ? 0.04 : 0);
      var posName = pos.th.replace(/^\d+ · /, "");
      items.push({ id: "card." + pos.key + "." + c.id + (p.rev ? ".r" : ""), group: posName, label: KB.readName(c) + " (" + KB.readEn(c) + ")" + (p.rev ? " กลับหัว" : ""), short: "ไพ่" + KB.readName(c) + (p.rev ? "กลับหัว" : ""),
        evidence: "ตำแหน่งที่ " + (i + 1) + " (" + posName + "): " + KB.readEn(c) + (p.rev ? " (กลับหัว)" : ""), strength: Math.min(1, w), tags: Object.keys(m), meanings: m });
    });
    // 3) คู่ไพ่ที่น่าสนใจ (สูงสุด 3 คู่)
    var pairs = [];
    for (var a = 0; a < n; a++) for (var b = a + 1; b < n; b++) { var notes = KB.pairNotes(picks[a].id, picks[b].id); if (notes) pairs.push([a, b, notes]); }
    pairs.slice(0, 3).forEach(function (q) {
      var A = cards[q[0]], B = cards[q[1]], m = { overview: q[2].slice() };
      items.push({ id: "pair." + KB.pairKey(A.id, B.id), group: "คู่ไพ่", label: "คู่ไพ่" + KB.readName(A) + "กับ" + KB.readName(B), short: "ไพ่คู่นี้", evidence: "ตำแหน่งที่ " + (q[0] + 1) + " และ " + (q[1] + 1), strength: 0.74, tags: Object.keys(m), meanings: m });
    });
    // 4) เลขซ้ำ / ไพ่ราชสำนักระดับเดียวกัน
    var nums = {}, ranks = {};
    cards.forEach(function (c) { if (c.arcana === "minor") { if (c.n <= 10) nums[c.n] = (nums[c.n] || 0) + 1; else ranks[c.n] = (ranks[c.n] || 0) + 1; } });
    Object.keys(nums).filter(function (k) { return nums[k] >= 2; }).slice(0, 1).forEach(function (k) {
      items.push({ id: "num." + k, group: "เลขของไพ่", label: "ไพ่เลข " + k + " ออกซ้ำ", short: "เลข " + k + " ที่ซ้ำกัน", evidence: nums[k] + " ใบ", strength: 0.6, tags: ["overview"], meanings: { overview: KB.numberNotes(+k) } });
    });
    Object.keys(ranks).filter(function (k) { return ranks[k] >= 2; }).slice(0, 1).forEach(function (k) {
      items.push({ id: "court." + k, group: "ไพ่ราชสำนัก", label: "ไพ่ราชสำนักระดับเดียวกัน", short: "ไพ่ราชสำนัก", evidence: ranks[k] + " ใบ", strength: 0.58, tags: ["overview", "social"], meanings: { overview: P.courtRank[k].slice(), social: P.courtRank[k].slice() } });
    });
    var nick = String(opts.nickname || "").trim();
    return { domain: "tarot", topic: TOPIC_FA[topic] || "overall", subject: nick && nick.length <= 12 && !/\s/.test(nick) ? { nickname: nick } : {},
      headline: Y.headline, items: items };
  }
  /** เซียมซี → facts */
  function siamseeFacts(s, opts) {
    opts = opts || {};
    var ph = KB.siamseePhr(s);
    return { domain: "siamsee", topic: opts.topic || "overall", subject: {}, headline: "เซียมซีใบที่ " + s.n + " (" + s.level + ")",
      items: [{ id: "siamsee." + s.n, group: "เซียมซี", label: "เซียมซีใบที่ " + s.n + " (" + s.level + ")", short: "เซียมซีใบนี้", evidence: s.verse.join(" "), strength: 0.95,
        tags: ["overview", "work", "money", "love", "advice", "timing"], meanings: { overview: ph.meaning, work: ph.work, money: ph.money, love: ph.love, advice: ph.mind, timing: ph.travel } }] };
  }
  /** ข้อความประจำการ์ดใบเดียวในตำแหน่ง (สุ่มสำนวนนำ + ความหมาย) */
  function positionText(card, rev, topic, pos, r) {
    r = r || Math.random;
    var m = pickR(r, card.phr[rev ? "r" : "u"][topic || "general"]);
    return pos ? pickR(r, KB.posLeads(pos.key, card, rev)) + " " + m : m;
  }

  var TR = { randInt: randInt, shuffle: shuffle, makeDeck: makeDeck, dayKey: dayKey, hashStr: hashStr, mulberry32: mulberry32, dailyCard: dailyCard,
    meaning: meaning, interpret: interpret, synthesize: synthesize, addStat: addStat, buildFacts: buildFacts, siamseeFacts: siamseeFacts, positionText: positionText };
  if (typeof module !== "undefined" && module.exports) module.exports = TR;
  else root.TR = TR;
})(typeof window !== "undefined" ? window : this);

if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("trApp")) (function () {
  "use strict";
  var KB = window.TAROT_KB, TR = window.TR;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var STATS_KEY = "tarot-stats", PREF_KEY = "tarot-prefs", IDLE_MS = 60000;
  var lsGet = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* โหมดส่วนตัว */ } };
  var prefs = Object.assign({ stats: true, reversed: true }, lsGet(PREF_KEY, {}));
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, reduced ? Math.min(ms, 60) : ms); }); };

  var st = { topic: "general", spread: "three", reversed: !!prefs.reversed, deck: null, picks: [], phase: "setup" };

  /* ---------- ภาษา (TH | 中文): ข้อความ UI ผ่าน T(), ชื่อ/ความหมายไพ่ภาษาจีนจาก i18n/zh-kb-tarot.js / zh-kb-siamsee.js ---------- */
  var T = function (k, th, v) { return window.LQI18N ? LQI18N.tf(k, th, v) : th.replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  var isZh = function () { return !!(window.LQI18N && LQI18N.lang === "zh"); };
  var first = function (x) { return Array.isArray(x) ? x[0] : x; };
  function zkItem(dom, key) { var Z = window.FORTUNE_ZH; return isZh() && Z && Z[dom] && Z[dom].items ? Z[dom].items[key] || null : null; }
  function cName(c) { var z = zkItem("tarot", c.id + ".u"); return z ? z.s : c.th; }
  function cKw(c) { return isZh() ? T("tarot.kw." + c.id, c.keywords.join("|")).split("|") : c.keywords; }
  function cMean(c, rev) {
    var z = zkItem("tarot", c.id + (rev ? ".r" : ".u"));
    return z ? { general: first(z.o), love: first(z.l), work: first(z.w), money: first(z.m) } : (rev ? c.reversed : c.upright);
  }
  function cAdv(c) { var z = zkItem("tarot", c.id + ".u"); return z ? first(z.a) : c.advice; }
  function orientTxt(rev) { return rev ? T("tarot.rev", "กลับหัว") : T("tarot.up", "ตั้งตรง"); }
  function topicName(k) { return T("tarot.topic." + k, KB.topics[k].th); }
  function spreadName(k) { return T("tarot.spread." + k, KB.spreads[k].th); }
  function spreadSub(k) { return T("tarot.spread." + k + ".sub", KB.spreads[k].sub); }
  function posName(k, i) { return T("tarot.pos." + k + "." + i, KB.spreads[k].positions[i].th); }
  function posLead(k, i) { return T("tarot.posLead." + k + "." + i, KB.spreads[k].positions[i].lead); }
  function elName(k) { return T("tarot.el." + k, KB.elements[k].th); }
  function suitName(k) { return T("tarot.suit." + k, KB.suits[k].th); }
  function headlineOf(Y, picks) {
    if (!isZh()) return Y.headline;
    var n = Y.n;
    if (n >= 3 && Y.majors / n >= 0.5) return T("tarot.hl.majors", Y.headline);
    if (Y.dominant) return T("tarot.hl.dom", Y.headline, { el: elName(Y.dominant), theme: T("tarot.elTheme." + Y.dominant, KB.elements[Y.dominant].theme) });
    if (n >= 3) return T("tarot.hl.balanced", Y.headline);
    return cKw(KB.byId[picks[0].id])[0];
  }
  function adviceOf(Y) { return isZh() ? cAdv(KB.byId[Y.adviceCard]) : Y.advice; }
  function keyMessagesOf(cur) {
    var Y = cur.synth; if (!isZh()) return Y.keyMessages;
    var n = Y.n, ki = n >= 3 ? (cur.spread === "celtic" ? 0 : 1) : 0, kc = KB.byId[cur.picks[ki].id];
    return [headlineOf(Y, cur.picks) + (n >= 3 ? " — " + (Y.majors ? T("tarot.km.majors", "ไพ่ชุดใหญ่ {n} ใบ", { n: Y.majors }) : T("tarot.km.allMinor", "ไพ่ชุดเล็กทั้งหมด")) : ""),
      posName(cur.spread, ki).replace(/^\d+ · /, "") + "：" + cName(kc) + " — " + cKw(kc).slice(0, 2).join(" · "),
      T("tarot.card.adv", "คำแนะนำ: ") + adviceOf(Y)];
  }
  var SS_LV = { "ดีมาก": "great", "ดี": "good", "ค่อยเป็นค่อยไป": "slow" };
  function ssView(s) {
    var z = zkItem("siamsee", "siamsee." + s.n);
    if (!z) return { level: s.level, verse: s.verse, meaning: s.meaning, cats: s };
    return { level: T("tarot.ss.lv." + (SS_LV[s.level] || "good"), s.level), verse: T("tarot.ss.verse." + s.n, s.verse.join("|")).split("|"), meaning: first(z.o),
      cats: { work: first(z.w), money: first(z.m), love: first(z.l), mind: first(z.a), travel: first(z.t) } };
  }

  function cardHTML(c, rev, flipped, extra) {
    return '<span class="tc-in"><span class="tc-back"></span><span class="tc-face"><img src="' + c.img + '" alt="' + esc(cName(c) + " (" + c.en + ")" + (rev ? " " + T("tarot.rev", "กลับหัว") : "")) + '" loading="lazy" decoding="async"></span></span>';
  }

  /* ---------- แท็บ ---------- */
  var tabs = [["tabTarot", "panelTarot", ""], ["tabDaily", "panelDaily", "daily"], ["tabSiamsee", "panelSiamsee", "siamsee"]];
  function selectTab(id, focus) {
    tabs.forEach(function (t) {
      var on = t[0] === id, b = document.getElementById(t[0]);
      b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
      document.getElementById(t[1]).hidden = !on;
      if (on && focus) b.focus();
      if (on) { try { history.replaceState(null, "", t[2] ? "#" + t[2] : location.pathname + location.search); } catch (e) { /* file:// */ } }
    });
    touch();
  }
  tabs.forEach(function (t, i) {
    var b = document.getElementById(t[0]);
    b.addEventListener("click", function () { selectTab(t[0]); });
    b.addEventListener("keydown", function (e) {
      var k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (k) { e.preventDefault(); selectTab(tabs[(i + k + tabs.length) % tabs.length][0], true); }
    });
  });

  /* ---------- ขั้น 1 ---------- */
  function renderSetup() {
    $("#trTopics").innerHTML = Object.keys(KB.topics).map(function (k) {
      var t = KB.topics[k];
      return '<label class="tr-opt"><input type="radio" name="topic" value="' + k + '"' + (k === st.topic ? " checked" : "") + '><b><span class="ic" aria-hidden="true">' + t.icon + "</span>" + esc(topicName(k)) + "</b></label>";
    }).join("");
    $("#trSpreads").innerHTML = KB.spreadOrder.map(function (k) {
      return '<label class="tr-opt"><input type="radio" name="spread" value="' + k + '"' + (k === st.spread ? " checked" : "") + "><b>" + esc(spreadName(k)) + "</b><small>" + esc(spreadSub(k)) + "</small></label>";
    }).join("");
  }
  renderSetup();
  $("#trReversed").checked = st.reversed;
  $("#trReversed").addEventListener("change", function () { st.reversed = this.checked; prefs.reversed = this.checked; lsSet(PREF_KEY, prefs); });
  $("#trTopics").addEventListener("change", function (e) {
    st.topic = e.target.value;
    // หัวข้อความรัก → แนะนำรูปแบบความรัก 5 ใบ (ถ้ายังเป็นค่าเริ่มต้น)
  });
  $("#trSpreads").addEventListener("change", function (e) { st.spread = e.target.value; });
  $("#trSetup").addEventListener("submit", function (e) { e.preventDefault(); startShuffle(); });

  function setStep(n) { document.querySelectorAll(".tr-steps span").forEach(function (s) { s.classList.toggle("on", +s.dataset.s === n); }); }

  /* ---------- ขั้น 2: สับ & เลือก ---------- */
  var fan = $("#trFan"), board = $("#trBoard"), pickSec = $("#trPick");
  async function startShuffle() {
    touch();
    st.deck = TR.makeDeck(st.reversed); st.picks = []; st.phase = "pick";
    $("#trSetup").hidden = true; $("#trResult").hidden = true; pickSec.hidden = false;
    $(".tr-fan-wrap").hidden = false; $(".tr-pick-actions").hidden = false; $("#trFanHint").hidden = false;
    $("#trReveal").hidden = true; $("#trCardImg").hidden = true;
    setStep(2);
    renderPickHead();
    renderBoard();
    pickSec.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    $("#trPickTitle").focus({ preventScroll: true });
    // แอนิเมชันสับ
    var deck = $("#trDeck"); fan.innerHTML = ""; fan.setAttribute("aria-busy", "true");
    deck.hidden = false; deck.classList.remove("go"); void deck.offsetWidth;
    if (!reduced) { deck.classList.add("go"); await wait(1350); }
    deck.classList.remove("go"); deck.hidden = true;
    renderFan(true);
    fan.removeAttribute("aria-busy");
  }
  function computeFan() {
    var W = fan.clientWidth || 320, n = st.deck.length;
    var fw = W < 500 ? 62 : W < 900 ? 74 : 86;
    var minStep = coarse ? 30 : 11;
    var fit = (W - fw - 64) / (n - 1);
    var step = Math.max(minStep, fit), fits = fit >= minStep;
    return { W: W, fw: fw, step: step, fits: fits, inner: Math.max(W, (n - 1) * step + fw + 24), n: n };
  }
  function renderFan(deal) {
    var L = computeFan();
    fan.style.setProperty("--fw", L.fw + "px");
    var inner = document.createElement("div"); inner.className = "tr-fan-inner"; inner.style.width = L.inner + "px";
    var html = "";
    st.deck.forEach(function (d, i) {
      var t = i / (L.n - 1);
      var rot = L.fits ? (t - 0.5) * 24 : (t - 0.5) * 6;
      var top = 24 + (L.fits ? Math.pow(Math.abs(t - 0.5) * 2, 2) * 16 : 0);
      var left = (L.fits ? 32 : 12) + i * L.step;
      html += '<button type="button" class="fcard' + (d.picked ? " gone" : "") + '" data-i="' + i + '" aria-label="' + esc(T("tarot.fanCard", "ไพ่ใบที่ {n}", { n: i + 1 })) + '" style="left:' + (deal && !reduced ? (L.inner - L.fw) / 2 : left) + "px;top:" + top + "px;transform:rotate(" + rot.toFixed(2) + 'deg)" data-left="' + left + '"></button>';
    });
    inner.innerHTML = html; fan.innerHTML = ""; fan.append(inner);
    fan.scrollLeft = (L.inner - L.W) / 2;
    if (deal && !reduced) {
      fan.classList.add("dealing");
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        inner.querySelectorAll(".fcard").forEach(function (b) { b.style.left = b.dataset.left + "px"; });
        setTimeout(function () { fan.classList.remove("dealing"); }, 600);
      }); });
    }
    $("#trFanHint").textContent = L.fits ? T("tarot.fanHintFit", "แตะหรือคลิกไพ่ใบที่ใจเลือก") : T("tarot.fanHintScroll", "ปัดหรือลากซ้าย–ขวาเพื่อดูไพ่ทั้ง 78 ใบ แล้วแตะใบที่ใจเลือก");
  }
  // ลากเพื่อเลื่อน (เมาส์) — ทัชใช้การเลื่อนปกติ
  var drag = null, dragMoved = false;
  fan.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") return; drag = { x: e.clientX, s: fan.scrollLeft }; dragMoved = false; });
  window.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) { dragMoved = true; fan.classList.add("dragging"); }
    if (dragMoved) fan.scrollLeft = drag.s - dx;
  });
  window.addEventListener("pointerup", function () { drag = null; fan.classList.remove("dragging"); setTimeout(function () { dragMoved = false; }, 0); });
  fan.addEventListener("click", function (e) {
    var b = e.target.closest(".fcard"); if (!b || dragMoved) return;
    pick(+b.dataset.i, b);
  });

  function boardMetrics() {
    var S = KB.spreads[st.spread], g = S.gap || 0.16, W = pickSec.clientWidth || 340;
    var maxCw = W < 600 ? 120 : st.spread === "celtic" ? 104 : 140;
    var cw = Math.floor(Math.min(maxCw, W / ((S.cols / 2) * (1 + g)) - 1));
    var lab = st.spread === "celtic" ? 22 : 40;
    return { S: S, cw: cw, g: g, u: cw * (1 + g) / 2, v: (cw * 12 / 7 + lab + cw * g * 0.5) / 2 };
  }
  function renderBoard() {
    var M = boardMetrics(), S = M.S;
    board.style.gridTemplateColumns = "repeat(" + S.cols + "," + M.u.toFixed(1) + "px)";
    board.style.gridTemplateRows = "repeat(" + S.rows + "," + M.v.toFixed(1) + "px)";
    board.innerHTML = S.positions.map(function (p, i) {
      var p2 = st.picks[i], pn = posName(st.spread, i), short = st.spread === "celtic" ? String(i + 1) : pn;
      var inner = p2 ? '<button type="button" class="tcard' + (p2.rev ? " rev" : "") + (p2.open ? " flip" : "") + '" data-i="' + i + '" aria-label="' + esc(pn) + " — " + esc(p2.open ? cName(KB.byId[p2.id]) : T("tarot.faceDown", "ไพ่คว่ำ")) + '" style="width:' + M.cw + 'px">' + cardHTML(KB.byId[p2.id], p2.rev) + "</button>"
        : '<span class="ph" style="width:' + M.cw + 'px" aria-hidden="true">' + (i + 1) + "</span>";
      return '<div class="slot' + (p.x ? " x" : "") + (!p2 && i === st.picks.length ? " next" : "") + '" style="grid-column:' + p.c + " / span 2;grid-row:" + p.r + ' / span 2">' + inner +
        '<span class="lbl" style="max-width:' + (M.cw + 8) + 'px">' + esc(short) + "</span></div>";
    }).join("");
  }
  board.addEventListener("click", function (e) {
    var b = e.target.closest(".tcard"); if (!b) return;
    var p = st.picks[+b.dataset.i]; if (p && p.open) openModal(p.id, p.rev, st.spread, +b.dataset.i);
  });
  function updateCount() {
    var need = KB.spreads[st.spread].positions.length;
    $("#trPickCount").textContent = T("tarot.pickCount", "เลือกแล้ว {a} / {b}", { a: st.picks.length, b: need });
  }
  /** หัวข้อขั้นเลือก/เปิดไพ่ ตามสถานะ (เรียกซ้ำเมื่อเปลี่ยนภาษา) */
  function renderPickHead() {
    var k = st.spread;
    if (st.phase === "reveal" || st.phase === "result") {
      $("#trPickTitle").textContent = T("tarot.yourCards", "ไพ่ของคุณ · {s} ({sub})", { s: spreadName(k), sub: spreadSub(k) });
      $("#trPickCount").textContent = T("tarot.tapFull", "แตะไพ่เพื่อดูความหมายเต็ม");
    } else {
      $("#trPickTitle").textContent = T("tarot.pickTitle", "ตั้งจิตถึงคำถาม แล้วเลือกไพ่ {n} ใบ", { n: KB.spreads[k].positions.length });
      updateCount();
    }
  }
  function pick(i, btn) {
    var need = KB.spreads[st.spread].positions.length;
    if (st.phase !== "pick" || st.picks.length >= need || st.deck[i].picked) return;
    touch();
    st.deck[i].picked = true; btn.classList.add("gone"); btn.disabled = true;
    st.picks.push({ id: st.deck[i].id, rev: st.deck[i].rev, open: false });
    renderBoard();
    var landed = board.querySelector('.tcard[data-i="' + (st.picks.length - 1) + '"]');
    if (landed && !reduced) landed.classList.add("land");
    updateCount();
    if (st.picks.length === need) {
      st.phase = "ready";
      $("#trReveal").hidden = false; $("#trFanHint").hidden = true; $(".tr-fan-wrap").hidden = true; $(".tr-pick-actions").hidden = true;
      board.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      $("#trReveal").focus({ preventScroll: true });
    }
  }
  $("#trReshuffle").addEventListener("click", startShuffle);
  $("#trBack").addEventListener("click", function () { resetTarot(); });
  $("#trAuto").addEventListener("click", function () {
    var need = KB.spreads[st.spread].positions.length;
    while (st.picks.length < need) {
      var free = st.deck.map(function (d, i) { return d.picked ? -1 : i; }).filter(function (i) { return i >= 0; });
      var i = free[TR.randInt(free.length)];
      var b = fan.querySelector('.fcard[data-i="' + i + '"]');
      pick(i, b || document.createElement("button"));
    }
  });
  var resizeT = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (!pickSec.hidden) { renderBoard(); if (st.phase === "pick") renderFan(false); } }, 150);
  });

  /* ---------- เปิดไพ่ & ผลลัพธ์ ---------- */
  var current = null;
  $("#trReveal").addEventListener("click", async function () {
    touch();
    this.hidden = true; st.phase = "reveal";
    renderPickHead();
    for (var i = 0; i < st.picks.length; i++) {
      st.picks[i].open = true;
      var b = board.querySelector('.tcard[data-i="' + i + '"]');
      if (b) { b.classList.add("flip"); b.setAttribute("aria-label", posName(st.spread, i) + " — " + cName(KB.byId[st.picks[i].id])); }
      await wait(st.picks.length > 5 ? 180 : 320);
    }
    await wait(400);
    showResult();
  });

  /* ---------- คำทำนายโดยละเอียด (ผ่าน fortune-ai.js; ถ้าไม่มีจะแสดงแบบย่อ) ---------- */
  var FA = window.FortuneAI || null, readings = {};
  function readingBlock(id, title) {
    return '<section class="tr-reading" id="' + id + '" aria-labelledby="' + id + '-h"><div class="rd-head"><h3 id="' + id + '-h">' + esc(title) + '</h3><span class="rd-src" id="' + id + '-src"></span></div>' +
      '<div class="rd-consent" id="' + id + '-consent"></div><div class="rd-body" id="' + id + '-body" aria-live="polite"><p class="muted">' + esc(T("tarot.composing", "กำลังเรียบเรียงคำทำนาย…")) + '</p></div>' +
      '<div class="rd-actions"><button type="button" class="btn ghost" id="' + id + '-again">' + esc(T("tarot.regen", "อ่านอีกสำนวน")) + '</button></div></section>';
  }
  function plainRender(el, res) {
    el.innerHTML = (res.sections || []).map(function (s) { return '<section class="fa-section"><h3>' + esc(s.title || "") + "</h3>" + (s.paragraphs || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</section>"; }).join("");
  }
  function localFallback(facts) {
    var sec = { id: "overview", title: topicName("general"), paragraphs: [] };
    facts.items.slice(0, 6).forEach(function (it) { var k = Object.keys(it.meanings)[0]; if (k) sec.paragraphs.push(it.label + " — " + it.meanings[k][0]); });
    return { source: "local", sections: [sec] };
  }
  /** ประโยคเด่นสั้น ๆ (≤ 60 ตัวอักษร) สำหรับการ์ดแชร์: ความหมายจาก facts ที่ปรากฏอยู่ในภาพรวมที่เรียบเรียงแล้ว (ไม่ใช้ประโยคเชื่อม) */
  function keyLines(res, facts, n) {
    var secs = res.sections || [], ov = secs.find(function (s) { return s.id === "overview"; }) || secs[0];
    if (isZh()) { // ภาษาจีน: ใช้ประโยคสั้นจากภาพรวมที่เรียบเรียงแล้ว (facts เป็นภาษาไทย)
      var zs = [];
      (ov ? ov.paragraphs : []).join("").split(/[。！？]/).forEach(function (x) { x = x.trim(); if (x.length >= 8 && x.length <= 40 && zs.length < n && !/[\u0E00-\u0E7F]/.test(x)) zs.push(x); });
      return zs;
    }
    var text = ov ? ov.paragraphs.join(" ") : "", all = secs.map(function (s) { return s.paragraphs.join(" "); }).join(" ");
    var cand = [];
    var okKey = function (k) { return ["overview", "personality", "advice"].indexOf(k) >= 0 || k === facts.topic || (facts.topic === "overall" && k !== "timing"); };
    (facts.items || []).forEach(function (it) { Object.keys(it.meanings).filter(okKey).forEach(function (k) { it.meanings[k].forEach(function (m) { cand.push({ m: m, w: it.strength + (text.indexOf(m) >= 0 ? 1 : all.indexOf(m) >= 0 ? 0.5 : 0) }); }); }); });
    cand.sort(function (a, b) { return b.w - a.w || a.m.length - b.m.length; });
    var out = [];
    [false, true].forEach(function (trunc) {
      cand.forEach(function (c) {
        if (out.length >= n || c.w < 1.3) return;
        var x = c.m.trim();
        if (x.length > 60) { if (!trunc) return; var cut = x.lastIndexOf(" ", 58); x = cut > 24 ? x.slice(0, cut) : ""; }
        if (x.length >= 16 && out.every(function (o) { return o.slice(0, 12) !== x.slice(0, 12); })) out.push(x);
      });
    });
    return out;
  }
  function bindReading(id, factsFn) {
    var root = document.getElementById(id); if (!root) return;
    var st2 = readings[id] = {};
    var body = document.getElementById(id + "-body"), src = document.getElementById(id + "-src");
    function run() {
      var seed = (Math.random() * 4294967296) >>> 0, r = FA && FA.rng ? FA.rng(seed) : Math.random;
      var facts = factsFn(r);
      var useAI = FA && FA.hasConsent ? FA.hasConsent() : false;
      var p = FA && FA.interpret ? FA.interpret(facts, { useAI: useAI, seed: seed, trace: true }) : Promise.resolve(localFallback(facts));
      root.setAttribute("aria-busy", "true");
      return p.catch(function () { return localFallback(facts); }).then(function (res) {
        st2.result = res; st2.lines = keyLines(res, facts, 3);
        if (FA && FA.renderSections) FA.renderSections(body, res, { aiBadge: false }); else plainRender(body, res);
        src.textContent = res.source === "ai" ? T("tarot.srcAI", "เรียบเรียงโดย AI (Claude)") : T("tarot.srcLocal", "เรียบเรียงในเครื่อง · สำนวนใหม่ทุกครั้ง");
        src.className = "rd-src" + (res.source === "ai" ? " ai" : "");
        root.removeAttribute("aria-busy");
      });
    }
    document.getElementById(id + "-again").addEventListener("click", function () { touch(); run(); });
    if (FA && FA.consentControl) FA.consentControl(document.getElementById(id + "-consent"), { onChange: function () { run(); } }).catch(function () { /* ไม่มีเซิร์ฟเวอร์ AI */ });
    return run();
  }

  function showResult() {
    st.phase = "result"; setStep(3);
    var Y = TR.synthesize(st.picks, st.topic, st.spread);
    current = { kind: "tarot", picks: st.picks.slice(), spread: st.spread, topic: st.topic, synth: Y };
    renderResult();
    $("#trResult").hidden = false;
    $("#trCardImg").hidden = true;
    if (prefs.stats) { lsSet(STATS_KEY, TR.addStat(lsGet(STATS_KEY, null), st.picks.map(function (p) { return p.id; }), st.topic)); renderStats(); }
    $("#trResult").scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    $("#trResTitle").focus({ preventScroll: true });
    touch();
  }
  /** วาดผลการเปิดไพ่จาก current (เรียกซ้ำเมื่อเปลี่ยนภาษา → เรียบเรียงคำทำนายใหม่ในภาษานั้น) */
  function renderResult() {
    var S = KB.spreads[current.spread], Y = current.synth, sk = current.spread, tk = current.topic, zh = isZh();
    var q = $("#trQuestion").value.trim();
    $("#trResMeta").innerHTML = esc(T("tarot.metaTopic", "หัวข้อ")) + " <b>" + esc(topicName(tk)) + "</b> · " + esc(spreadName(sk)) + " (" + esc(spreadSub(sk)) + ")" + (q ? "<br>" + esc(T("tarot.metaQ", "คำถาม: ")) + "<q>" + esc(q) + "</q>" : "");
    var bars = Object.keys(KB.elements).map(function (k) {
      var e = KB.elements[k], v = Y.elements[k];
      return '<div class="elbar"><span>' + e.icon + " " + esc(elName(k)) + '</span><i style="--w:' + Math.round(v / Y.n * 100) + "%;--c:" + e.color + '"></i><b>' + v + "</b></div>";
    }).join("");
    $("#trSynth").innerHTML = "<h3>" + esc(headlineOf(Y, current.picks)) + '</h3><div class="syn-grid"><div><div class="syn-bars" aria-label="' + esc(T("tarot.elAria", "จำนวนไพ่ตามธาตุ")) + '">' + bars + '</div><div class="syn-chips"><span>' + esc(T("tarot.chipMajor", "ชุดใหญ่ {a}/{n}", { a: Y.majors, n: Y.n })) + "</span><span>" + esc(T("tarot.chipRev", "กลับหัว {a}/{n}", { a: Y.reversed, n: Y.n })) + "</span>" +
      (Y.courts ? "<span>" + esc(T("tarot.chipCourt", "ราชสำนัก {a}", { a: Y.courts })) + "</span>" : "") + (Y.aces ? "<span>" + esc(T("tarot.chipAce", "เอซ {a}", { a: Y.aces })) + "</span>" : "") + '</div></div><div><p class="syn-advice"><b>' + esc(T("tarot.overallAdvice", "คำแนะนำโดยรวม")) + "</b><br>" + esc(adviceOf(Y)) + "</p></div></div>" + readingBlock("trRd", T("tarot.readingTitle", "คำทำนายโดยละเอียด"));
    var pk = current.picks, tp = tk, sp = sk;
    bindReading("trRd", function (r) { return TR.buildFacts(pk, tp, sp, { rng: r }); });
    $("#trReadings").innerHTML = pk.map(function (p, i) {
      var c = KB.byId[p.id], pos = S.positions[i], nm = cName(c), lead, text;
      if (zh) { lead = posLead(sk, i); text = cMean(c, p.rev)[tk] + (pos.advice ? " — " + cAdv(c) : ""); }
      else { lead = TR.interpret(c, p.rev, tk, pos).lead; text = TR.positionText(c, p.rev, tk, pos) + (pos.advice ? " — " + c.advice : ""); }
      return '<article class="tr-read"><button type="button" class="tcard flip' + (p.rev ? " rev" : "") + '" data-i="' + i + '" aria-label="' + esc(T("tarot.viewFull", "ดูความหมายเต็มของ {c}", { c: nm })) + '">' + cardHTML(c, p.rev) + "</button><div>" +
        '<span class="pos">' + esc(posName(sk, i)) + "</span><h3>" + esc(nm) + " <small>" + esc(c.en) + '</small><span class="orient' + (p.rev ? " r" : "") + '">' + esc(orientTxt(p.rev)) + "</span></h3>" +
        '<div class="kws">' + cKw(c).map(function (k) { return "<span>" + esc(k) + "</span>"; }).join("") + "</div>" +
        '<p class="lead-pos">' + esc(lead) + "</p><p>" + esc(text) + '</p><button type="button" class="btn ghost more" data-i="' + i + '">' + esc(T("tarot.more", "ดูความหมายเต็ม")) + "</button></div></article>";
    }).join("");
  }
  $("#trReadings").addEventListener("click", function (e) {
    var b = e.target.closest("[data-i]"); if (!b) return;
    var i = +b.dataset.i, p = current.picks[i]; openModal(p.id, p.rev, current.spread, i);
  });
  $("#trAgain").addEventListener("click", function () { resetTarot(); });

  function resetTarot() {
    st.phase = "setup"; st.picks = []; st.deck = null; current = current && current.kind === "tarot" ? null : current;
    pickSec.hidden = true; $("#trResult").hidden = true; $("#trSetup").hidden = false; setStep(1);
    if (document.body.classList.contains("tr-kiosk")) $("#trQuestion").value = "";
    if (!$("#panelTarot").hidden) $("#trSetup").scrollIntoView({ block: "start" });
    touch();
  }

  /* ---------- โมดัลรายละเอียดไพ่ ---------- */
  var modal = $("#trModal"), modalArgs = null;
  function openModal(id, rev, sk, pi) {
    modalArgs = [id, rev, sk, pi];
    renderModal();
    if (!modal.open) { if (modal.showModal) modal.showModal(); else modal.setAttribute("open", ""); }
    touch();
  }
  function renderModal() {
    var id = modalArgs[0], rev = modalArgs[1], sk = modalArgs[2], pi = modalArgs[3];
    var c = KB.byId[id], zh = isZh(), nm = cName(c);
    var dl = function (m) { return "<dl><dt>" + esc(topicName("general")) + "</dt><dd>" + esc(m.general) + "</dd><dt>" + esc(topicName("love")) + "</dt><dd>" + esc(m.love) + "</dd><dt>" + esc(topicName("work")) + "</dt><dd>" + esc(m.work) + "</dd><dt>" + esc(topicName("money")) + "</dt><dd>" + esc(m.money) + "</dd></dl>"; };
    $("#trModalBody").innerHTML = '<div class="md"><img src="' + c.img + '" alt="' + esc(nm) + '"' + (rev ? ' class="rev"' : "") + "><div>" +
      '<h2 id="trModalTitle">' + esc(nm) + (c.aka && !zh ? ' <small class="muted">(' + esc(c.aka) + ")</small>" : "") + "</h2>" +
      '<p class="sub">' + esc(c.en) + " · " + esc(c.arcana === "major" ? T("tarot.md.major", "ไพ่ชุดใหญ่ {num}", { num: c.numeral }) : T("tarot.md.minor", "ไพ่ชุดเล็ก ชุด{suit}", { suit: suitName(c.suit) })) + " · " + esc(T("tarot.md.el", "ธาตุ{el}", { el: elName(c.element) })) +
      (sk ? " · " + esc(T("tarot.md.pos", "ตำแหน่ง: {p}", { p: posName(sk, pi) })) : "") + (rev != null ? ' <span class="orient' + (rev ? " r" : "") + '">' + esc(orientTxt(rev)) + "</span>" : "") + "</p>" +
      '<div class="kws">' + cKw(c).map(function (k) { return "<span>" + esc(k) + "</span>"; }).join("") + "</div>" +
      "<h3>" + esc(T("tarot.md.up", "ความหมายไพ่ตั้งตรง")) + "</h3>" + dl(cMean(c, false)) + "<h3>" + esc(T("tarot.md.rev", "ความหมายไพ่กลับหัว")) + "</h3>" + dl(cMean(c, true)) +
      '<p class="adv"><b>' + esc(T("tarot.md.adv", "คำแนะนำ:")) + "</b> " + esc(cAdv(c)) + "</p></div></div>";
  }
  $("#trModalClose").addEventListener("click", function () { modal.close ? modal.close() : modal.removeAttribute("open"); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.close(); });

  /* ---------- ไพ่ประจำวัน ---------- */
  var daily = TR.dailyCard(new Date());
  function dateText() { try { return new Date().toLocaleDateString(isZh() ? "zh-CN" : "th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch (e) { return TR.dayKey(); } }
  function renderDailyStatic() {
    $("#trDailyDate").textContent = dateText();
    $("#trDailyImg").alt = cName(daily) + " (" + daily.en + ")";
    var b = $("#trDailyCard");
    if (b.classList.contains("flip")) { b.setAttribute("aria-label", T("tarot.dailyAriaOpen", "ไพ่ประจำวัน: {c} — แตะเพื่อดูความหมายเต็ม", { c: cName(daily) })); renderDailyText(); }
    else { b.setAttribute("aria-label", T("tarot.dailyAria", "แตะเพื่อเปิดไพ่ประจำวัน")); renderDailyDefault(); }
  }
  function renderDailyDefault() {
    $("#trDailyText").innerHTML = "<h2>" + esc(T("tarot.h21", "ไพ่ประจำวันนี้")) + '</h2><p class="muted">' + esc(T("tarot.dailyHint", "แตะไพ่เพื่อเปิดดูพลังของวันนี้")) + "</p>";
  }
  function renderDailyText() {
    var u = cMean(daily, false), img = $("#trDailyCardImg"), keep = img && !img.hidden ? img.src : "";
    $("#trDailyText").innerHTML = "<h2>" + esc(cName(daily)) + ' <small class="muted">' + esc(daily.en) + "</small></h2>" +
      '<div class="kws">' + cKw(daily).map(function (k) { return "<span>" + esc(k) + "</span>"; }).join("") + "</div>" +
      "<p>" + esc(u.general) + "</p><dl><dt>♥ " + esc(topicName("love")) + "</dt><dd>" + esc(u.love) + "</dd><dt>◆ " + esc(topicName("work")) + "</dt><dd>" + esc(u.work) + "</dd><dt>● " + esc(topicName("money")) + "</dt><dd>" + esc(u.money) + "</dd></dl>" +
      '<p class="syn-advice"><b>' + esc(T("tarot.dailyAdvice", "คำแนะนำวันนี้")) + "</b><br>" + esc(cAdv(daily)) + '</p><div class="tr-res-actions" style="margin-top:12px"><button class="btn primary big" id="trDailyShare" type="button">' + esc(T("tarot.dailyShare", "แชร์ไพ่ประจำวัน")) + '</button></div><img class="tr-cardimg" id="trDailyCardImg" alt="' + esc(T("tarot.dailyImgAlt", "การ์ดไพ่ประจำวันสำหรับแชร์")) + '" hidden>';
    $("#trDailyShare").addEventListener("click", function () { share(this, { kind: "daily" }, $("#trDailyCardImg")); });
    if (keep) { $("#trDailyCardImg").src = keep; $("#trDailyCardImg").hidden = false; }
  }
  $("#trDailyImg").src = daily.img;
  renderDailyStatic();
  $("#trDailyCard").addEventListener("click", function () {
    var b = this; if (b.classList.contains("flip")) { openModal(daily.id, false, null); return; }
    b.classList.add("flip");
    renderDailyStatic();
    touch();
  });

  /* ---------- เซียมซี ---------- */
  var ssBusy = false, ssCurrent = null;
  async function drawSiamsee() {
    if (ssBusy) return; ssBusy = true; touch();
    $("#ssDraw").disabled = true; $("#ssResult").hidden = true; $("#ssFall").hidden = true; $("#ssCardImg").hidden = true;
    var cup = $("#ssCup");
    cup.classList.add("shaking");
    if (navigator.vibrate && !reduced) { try { navigator.vibrate([60, 60, 60, 60, 60]); } catch (e) { /* ไม่รองรับ */ } }
    await wait(1600);
    cup.classList.remove("shaking");
    var s = KB.siamsee[TR.randInt(KB.siamsee.length)];
    ssCurrent = s;
    $("#ssFallNo").textContent = T("tarot.ss.fall", "ใบที่ {n}", { n: s.n });
    $("#ssFall").hidden = false;
    await wait(950);
    renderSiamsee();
    $("#ssResult").hidden = false;
    $("#ssDraw").disabled = false; ssBusy = false;
    if (prefs.stats) { lsSet(STATS_KEY, TR.addStat(lsGet(STATS_KEY, null), [], "siamsee")); renderStats(); }
    if (window.innerWidth < 900) $("#ssResult").scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    $("#ssTitle").focus({ preventScroll: true });
    touch();
  }
  /** วาดผลเซียมซีจาก ssCurrent (เรียกซ้ำเมื่อเปลี่ยนภาษา) */
  function renderSiamsee() {
    var s = ssCurrent, V = ssView(s);
    $("#ssFallNo").textContent = T("tarot.ss.fall", "ใบที่ {n}", { n: s.n });
    $("#ssNo").textContent = s.n;
    $("#ssTitle").textContent = T("tarot.ss.title", "เซียมซีใบที่ {n}", { n: s.n });
    $("#ssLevel").textContent = V.level;
    $("#ssVerse").textContent = V.verse.join("\n");
    $("#ssMeaning").textContent = V.meaning;
    $("#ssCats").innerHTML = KB.siamseeCats.map(function (c) { return '<li><b><span class="ic" aria-hidden="true">' + c.icon + "</span>" + esc(T("tarot.ss.cat." + c.key, c.th)) + "</b><span>" + esc(V.cats[c.key]) + "</span></li>"; }).join("");
    $("#ssRead").innerHTML = readingBlock("ssRd", T("tarot.readingTitle", "คำทำนายโดยละเอียด"));
    bindReading("ssRd", function () { return TR.siamseeFacts(s); });
  }
  $("#ssDraw").addEventListener("click", drawSiamsee);
  $("#ssAgain").addEventListener("click", function () { $("#ssResult").hidden = true; $("#ssFall").hidden = true; $("#ssCup").scrollIntoView({ block: "center" }); drawSiamsee(); });
  $("#ssShare").addEventListener("click", function () { share(this, { kind: "siamsee" }, $("#ssCardImg")); });

  /* ---------- เขย่ามือถือ (DeviceMotion) ---------- */
  var motionOn = false, lastShake = 0, prevA = null;
  var canMotion = typeof window.DeviceMotionEvent !== "undefined" && coarse;
  function onMotion(e) {
    var a = e.accelerationIncludingGravity || e.acceleration; if (!a || a.x == null) return;
    if (prevA) {
      var d = Math.abs(a.x - prevA.x) + Math.abs(a.y - prevA.y) + Math.abs(a.z - prevA.z);
      var now = Date.now();
      if (d > 24 && now - lastShake > 2200) { lastShake = now; handleShake(); }
    }
    prevA = { x: a.x, y: a.y, z: a.z };
  }
  function handleShake() {
    if (!$("#panelSiamsee").hidden) { if (!ssBusy) drawSiamsee(); }
    else if (!$("#panelTarot").hidden && st.phase === "pick" && st.picks.length === 0) { startShuffle(); toast(T("tarot.toast.reshuffled", "สับไพ่ใหม่แล้ว")); }
  }
  async function enableMotion() {
    if (motionOn) return true;
    try {
      if (typeof DeviceMotionEvent.requestPermission === "function") {
        var r = await DeviceMotionEvent.requestPermission(); // iOS ต้องเรียกจากการแตะ
        if (r !== "granted") { toast(T("tarot.toast.noPerm", "ไม่ได้รับสิทธิ์ตรวจจับการเขย่า ใช้ปุ่มแทนได้")); return false; }
      }
      window.addEventListener("devicemotion", onMotion);
      motionOn = true;
      renderShakeBtns();
      return true;
    } catch (e) { toast(T("tarot.toast.unsupported", "อุปกรณ์นี้ไม่รองรับการเขย่า ใช้ปุ่มแทนได้")); return false; }
  }
  function renderShakeBtns() {
    if (!motionOn) return;
    ["#trShake", "#ssShake"].forEach(function (s) { $(s).textContent = T("tarot.toast.ready", "พร้อมแล้ว — เขย่ามือถือได้เลย"); $(s).setAttribute("aria-pressed", "true"); });
  }
  if (canMotion) {
    $("#trShake").hidden = false; $("#ssShake").hidden = false;
    $("#trShake").addEventListener("click", function () { enableMotion().then(function (ok) { if (ok) toast(T("tarot.toast.shakeTarot", "เขย่ามือถือเพื่อสับไพ่ใหม่")); }); });
    $("#ssShake").addEventListener("click", function () { enableMotion().then(function (ok) { if (ok) toast(T("tarot.toast.shakeSs", "เขย่ามือถือเพื่อเสี่ยงเซียมซี")); }); });
  }

  /* ---------- การ์ดแชร์ 1080×1350 ---------- */
  function wrapTh(c, text, maxW) {
    var segs = (typeof Intl !== "undefined" && Intl.Segmenter) ? Array.from(new Intl.Segmenter(isZh() ? "zh" : "th", { granularity: "word" }).segment(text), function (s) { return s.segment; }) : text.split("");
    var lines = [], cur = "";
    segs.forEach(function (sg) { if (c.measureText(cur + sg).width > maxW && cur) { lines.push(cur.trim()); cur = sg.trimStart(); } else cur += sg; });
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }
  function loadImg(src) { return new Promise(function (res) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; }); }
  function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
  function drawBack(c, x, y, w, h) {
    var g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, "#1e2a5a"); g.addColorStop(1, "#0e1430");
    rr(c, x, y, w, h, 10); c.fillStyle = g; c.fill(); c.strokeStyle = "#22d3ee"; c.lineWidth = 2; c.stroke();
  }
  async function makeCard(opt) {
    try { await Promise.all([document.fonts.load("700 60px Prompt"), document.fonts.load("500 30px Prompt"), document.fonts.load("400 30px Prompt")]); } catch (e) { /* ฟอนต์ระบบ */ }
    var W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d"), F = "Prompt, system-ui, sans-serif";
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0e1430"); g.addColorStop(1, "#24195e");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    var rnd = TR.mulberry32(7); c.fillStyle = "rgba(165,243,252,.55)";
    for (var i = 0; i < 90; i++) { c.beginPath(); c.arc(rnd() * W, rnd() * H, rnd() * 2.2 + .4, 0, Math.PI * 2); c.fill(); }
    var rg = c.createRadialGradient(W / 2, 480, 40, W / 2, 480, 560); rg.addColorStop(0, opt.kind === "siamsee" ? "rgba(192,57,43,.45)" : "rgba(103,79,242,.45)"); rg.addColorStop(1, "rgba(14,20,48,0)");
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    // โลโก้
    c.save(); c.translate(72, 64);
    rr(c, 0, 0, 60, 60, 18); c.fillStyle = "rgba(255,255,255,.08)"; c.fill();
    c.strokeStyle = "#22d3ee"; c.lineWidth = 4; c.lineCap = "round";
    c.beginPath(); [[14, 24, 14, 14, 24, 14], [46, 24, 46, 14, 36, 14], [14, 36, 14, 46, 24, 46], [46, 36, 46, 46, 36, 46]].forEach(function (q) { c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.lineTo(q[4], q[5]); }); c.stroke();
    c.beginPath(); c.arc(30, 30, 8, 0, Math.PI * 2); c.fillStyle = "#8b78ff"; c.fill();
    c.restore();
    c.textBaseline = "middle"; c.textAlign = "left";
    c.font = "700 40px " + F; c.fillStyle = "#fff"; c.fillText("LENS", 148, 96); var lw = c.measureText("LENS").width; c.fillStyle = "#a99bff"; c.fillText("IQ", 148 + lw, 96);
    c.textAlign = "right"; c.font = "500 34px " + F; c.fillStyle = "#c9d0ea";
    c.fillText(opt.kind === "siamsee" ? T("tarot.card.kindSs", "เซียมซี") : opt.kind === "daily" ? T("tarot.card.kindDaily", "ไพ่ประจำวัน") : T("tarot.card.kindTarot", "ไพ่ทาโรต์"), W - 72, 96);
    c.textAlign = "center";
    var msgs, msgTop;
    if (opt.kind === "siamsee") {
      var s = ssCurrent, V = ssView(s);
      c.beginPath(); c.arc(W / 2, 330, 120, 0, Math.PI * 2); c.fillStyle = "#c0392b"; c.fill();
      c.lineWidth = 6; c.strokeStyle = "#f3c969"; c.stroke();
      c.fillStyle = "#fff"; c.font = "700 120px " + F; c.fillText(String(s.n), W / 2, 338);
      c.font = "600 54px " + F; c.fillText(T("tarot.ss.title", "เซียมซีใบที่ {n}", { n: s.n }), W / 2, 520);
      c.font = "500 32px " + F; c.fillStyle = "#f3c969"; c.fillText(T("tarot.card.lv", "ระดับ: {lv}", { lv: V.level }), W / 2, 580);
      c.font = "500 42px " + F; c.fillStyle = "#fdf6ea";
      V.verse.forEach(function (l, k) { c.fillText(l, W / 2, 668 + k * 62); });
      var sl = (readings.ssRd && readings.ssRd.lines) || [];
      msgs = sl.length >= 2 ? sl : [V.meaning, T("tarot.card.work", "การงาน: ") + V.cats.work, T("tarot.card.love", "ความรัก: ") + V.cats.love];
      msgTop = 830;
    } else {
      var picks, labels, sub;
      if (opt.kind === "daily") { picks = [{ id: daily.id, rev: false }]; labels = [""]; sub = dateText(); }
      else {
        var S = KB.spreads[current.spread];
        picks = current.picks; labels = S.positions.map(function (p, k) { return current.spread === "celtic" ? String(k + 1) : posName(current.spread, k); });
        sub = topicName(current.topic) + " · " + spreadName(current.spread) + " (" + spreadSub(current.spread) + ")";
      }
      c.font = "400 32px " + F; c.fillStyle = "#c9d0ea"; c.fillText(sub, W / 2, 190);
      var n = picks.length, rows = n > 5 ? 2 : 1, per = Math.ceil(n / rows), gap = 22;
      var cw = n === 1 ? 300 : Math.min(rows === 2 ? 148 : 220, (W - 160 - (per - 1) * gap) / per), chh = cw * 12 / 7;
      var imgs = await Promise.all(picks.map(function (p) { return loadImg(KB.byId[p.id].img); }));
      var y0 = 240;
      for (var r = 0; r < rows; r++) {
        var row = picks.slice(r * per, r * per + per), x0 = (W - (row.length * cw + (row.length - 1) * gap)) / 2;
        row.forEach(function (p, k) {
          var idx = r * per + k, x = x0 + k * (cw + gap), y = y0 + r * (chh + (n > 1 ? 56 : 20));
          c.save(); rr(c, x, y, cw, chh, 10); c.clip();
          if (imgs[idx]) {
            if (p.rev) { c.translate(x + cw / 2, y + chh / 2); c.rotate(Math.PI); c.drawImage(imgs[idx], -cw / 2, -chh / 2, cw, chh); }
            else c.drawImage(imgs[idx], x, y, cw, chh);
          } else drawBack(c, x, y, cw, chh);
          c.restore();
          rr(c, x, y, cw, chh, 10); c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 2; c.stroke();
          if (n > 1) { c.font = "400 " + (n > 5 ? 22 : 24) + "px " + F; c.fillStyle = "#c9d0ea"; c.fillText(wrapTh(c, labels[idx], cw + 16)[0] + (p.rev ? " ↻" : ""), x + cw / 2, y + chh + 26); }
        });
      }
      msgTop = y0 + rows * (chh + (n > 1 ? 56 : 20)) + 30;
      if (opt.kind === "daily") msgs = [cName(daily) + " — " + cKw(daily).slice(0, 3).join(" · "), cMean(daily, false).general, T("tarot.card.adv", "คำแนะนำ: ") + cAdv(daily)];
      else { var tl = (readings.trRd && readings.trRd.lines) || []; msgs = tl.length >= 2 ? [headlineOf(current.synth, current.picks)].concat(tl).slice(0, 3) : keyMessagesOf(current); }
    }
    // 3 ข้อความหลัก
    var space = 1250 - msgTop, boxH = Math.min(124, (space - 2 * 16) / 3), fs = boxH < 100 ? 28 : 32;
    c.font = "500 " + fs + "px " + F;
    msgs.slice(0, 3).forEach(function (m, k) {
      var y = msgTop + k * (boxH + 16);
      rr(c, 90, y, W - 180, boxH, 22); c.fillStyle = "rgba(255,255,255,.09)"; c.fill();
      c.fillStyle = k === 2 ? "#a5f3fc" : "#fff";
      var ls = wrapTh(c, m, W - 240).slice(0, 2);
      if (wrapTh(c, m, W - 240).length > 2) ls[1] = ls[1].replace(/.{1}$/, "") + "…";
      ls.forEach(function (l, j) { c.fillText(l, W / 2, y + boxH / 2 + (j - (ls.length - 1) / 2) * (fs * 1.35)); });
    });
    c.font = "400 24px " + F; c.fillStyle = "#8f9bc4";
    wrapTh(c, T("tarot.discShort", KB.disclaimerShort) + (opt.kind === "siamsee" ? T("tarot.card.footSs", " · กลอนแต่งขึ้นใหม่") : T("tarot.card.footTarot", " · ภาพไพ่ RWS 1909 สาธารณสมบัติ")), W - 160).forEach(function (l, k) { c.fillText(l, W / 2, 1290 + k * 30); });
    return cv;
  }
  var cardUrls = {};
  async function share(btn, opt, imgEl) {
    touch(); btn.disabled = true;
    try {
      var cv = await makeCard(opt);
      var blob = await new Promise(function (r) { cv.toBlob(r, "image/jpeg", 0.92); });
      if (cardUrls[opt.kind]) URL.revokeObjectURL(cardUrls[opt.kind]);
      var url = cardUrls[opt.kind] = URL.createObjectURL(blob);
      imgEl.src = url; imgEl.hidden = false;
      var name = "lensiq-" + (opt.kind === "siamsee" ? "siamsee" : opt.kind === "daily" ? "daily-tarot" : "tarot") + ".jpg";
      var file = new File([blob], name, { type: "image/jpeg" });
      btn.disabled = false; // อย่าล็อกปุ่มค้างระหว่างแผ่นแชร์ของระบบเปิดอยู่
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: T("tarot.shareTitle", "ไพ่ทาโรต์ & เซียมซี — LENSIQ"), text: T("tarot.discShort", KB.disclaimerShort) }); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
      var a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      toast(T("tarot.toast.saved", "บันทึกการ์ดแล้ว"));
    } catch (e) { console.error(e); toast(T("tarot.toast.fail", "สร้างการ์ดไม่สำเร็จ")); }
    finally { btn.disabled = false; }
  }
  $("#trShare").addEventListener("click", function () { if (current) share(this, { kind: "tarot" }, $("#trCardImg")); });

  function toast(msg) { var t = $("#trToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("show"); }, 2200); }

  /* ---------- สถิติ ---------- */
  function renderStats() {
    var s = lsGet(STATS_KEY, null), box = $("#trStats");
    if (!s || !s.total) { box.innerHTML = '<p class="muted">' + esc(T("tarot.stats.empty", "ยังไม่มีการเปิดไพ่ในเครื่องนี้")) + "</p>"; return; }
    var tp = s.topics || {}, keys = ["general", "love", "work", "money", "siamsee"];
    var top = Object.keys(s.cards || {}).sort(function (a, b) { return s.cards[b] - s.cards[a]; }).slice(0, 5);
    box.innerHTML = '<p class="stat-n"><b>' + s.total + "</b> " + esc(T("tarot.stats.times", "ครั้ง")) + " <small>(" + esc(T("tarot.stats.today", "วันนี้ {n}", { n: (s.days || {})[TR.dayKey()] || 0 })) + ")</small></p>" +
      keys.map(function (k) {
        var nm = k === "siamsee" ? T("tarot.tabSiamsee", "เซียมซี") : topicName(k), v = tp[k] || 0;
        return '<div class="elbar" style="grid-template-columns:4.6em 1fr 2em"><span>' + esc(nm) + '</span><i style="--w:' + Math.round(v / s.total * 100) + '%;--c:#674ff2"></i><b>' + v + "</b></div>";
      }).join("") + (top.length ? '<p class="stat-top">' + esc(T("tarot.stats.top", "ไพ่ที่ออกบ่อย: ")) + top.map(function (id) { return esc(KB.byId[id] ? cName(KB.byId[id]) : id) + " (" + s.cards[id] + ")"; }).join(", ") + "</p>" : "");
  }
  $("#trStatsOn").checked = !!prefs.stats;
  $("#trStatsOn").addEventListener("change", function () { prefs.stats = this.checked; lsSet(PREF_KEY, prefs); });
  $("#trStatsClear").addEventListener("click", function () { if (confirm(T("tarot.stats.confirm", "ล้างสถิติในเครื่องนี้?"))) { try { localStorage.removeItem(STATS_KEY); } catch (e) { /* ไม่เป็นไร */ } renderStats(); } });
  renderStats();

  /* ---------- โหมดบูธ ---------- */
  var idleT = null, idleTick = null, wasFs = false;
  function busy() { return st.phase !== "setup" || !$("#ssResult").hidden || $("#trDailyCard").classList.contains("flip"); }
  function resetAll() {
    if (modal.open) modal.close();
    resetTarot();
    $("#ssResult").hidden = true; $("#ssFall").hidden = true; $("#ssCardImg").hidden = true;
    var dc = $("#trDailyCard"); dc.classList.remove("flip");
    renderDailyStatic();
    $("#trQuestion").value = "";
    window.scrollTo(0, 0);
  }
  function touch() {
    clearTimeout(idleT); clearInterval(idleTick);
    var el = $("#trIdle"); el.hidden = true;
    if (!document.body.classList.contains("tr-kiosk") || !busy()) return;
    var until = Date.now() + IDLE_MS;
    idleTick = setInterval(function () {
      var left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 15) { el.hidden = false; el.textContent = T("tarot.idle", "กลับหน้าเริ่มต้นใน {n} วินาที — แตะเพื่ออยู่ต่อ", { n: left }); }
    }, 1000);
    idleT = setTimeout(function () { clearInterval(idleTick); el.hidden = true; resetAll(); }, IDLE_MS);
  }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { if (document.body.classList.contains("tr-kiosk")) touch(); }, { passive: true }); });
  function setKiosk(on) {
    document.body.classList.toggle("tr-kiosk", on);
    $("#trKiosk").setAttribute("aria-pressed", on ? "true" : "false");
    $("#trKioskExit").hidden = !on;
    if (on) {
      var de = document.documentElement;
      if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().then(function () { wasFs = true; }).catch(function () { /* iOS ไม่รองรับ */ });
      window.scrollTo(0, 0);
    } else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    touch();
  }
  $("#trKiosk").addEventListener("click", function () { setKiosk(!document.body.classList.contains("tr-kiosk")); });
  $("#trKioskExit").addEventListener("click", function () { setKiosk(false); });
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && wasFs) { wasFs = false; setKiosk(false); } });

  // แหล่งอ้างอิง
  function renderSources() {
    $("#trSources").innerHTML = KB.sources.map(function (s, i) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(T("tarot.src." + i, s.label)) + "</a></li>"; }).join("");
    $("#trCredit").textContent = T("tarot.credit", KB.imageCredit + " · รายละเอียดใน vendor/tarot/CREDITS.txt");
  }
  renderSources();

  // เปลี่ยนภาษา (และครั้งแรกตอนโหลด): วาดข้อความไดนามิกใหม่ทั้งหมด ผลที่แสดงอยู่จะเรียบเรียงคำทำนายใหม่ในภาษานั้น
  window.addEventListener("lq-lang", function () {
    renderSetup(); renderSources(); renderStats(); renderShakeBtns(); renderDailyStatic();
    if (!pickSec.hidden) { renderPickHead(); renderBoard(); if (st.phase === "pick" && st.deck) renderFan(false); }
    if (current && current.kind === "tarot" && !$("#trResult").hidden) renderResult();
    if (ssCurrent && !$("#ssResult").hidden) renderSiamsee();
    if (modalArgs && modal.open) renderModal();
  });

  if (location.hash === "#siamsee") selectTab("tabSiamsee"); else if (location.hash === "#daily") selectTab("tabDaily");
  window.__tr = { state: st, readings: readings, get current() { return current; }, makeCard: makeCard, resetAll: resetAll, drawSiamsee: drawSiamsee }; // ใช้ทดสอบ
})();
