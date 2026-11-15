/* 12 นักษัตร · ดวงรายปี · ปีชง · คู่มงคล — LENSIQ
   ส่วนบน: ฟังก์ชันล้วน (ความสัมพันธ์กิ่งดิน, ปีนักษัตรจากวันเกิดตามขอบเขตตรุษจีน/ลี่ชุน/ไทย, คะแนนรายปี, facts)
           ใช้ HSCore (horoscope.js) คำนวณตรุษจีนและลี่ชุนด้วยสูตรดาราศาสตร์ของ Meeus
   ส่วนล่าง: UI ในเบราว์เซอร์ (ทำงานเมื่อพบ #zdApp) — วันเกิดคำนวณในเครื่อง ไม่ส่งและไม่บันทึก
   ตามความเชื่อ (โปรดใช้วิจารณญาณ) ไม่ใช่การพยากรณ์ทางวิทยาศาสตร์ */
(function (root) {
  "use strict";
  var KB = root.ZODIAC_KB || (typeof require === "function" ? require("./zodiac-kb.js") : null);
  var HS = root.HSCore || (typeof require === "function" ? require("./horoscope.js") : null);
  var FK = root.FortuneKit || (typeof require === "function" ? require("./fortune-kit.js") : null);
  var mod = function (a, n) { return ((a % n) + n) % n; };

  var PAIRS = function (list) { var s = {}; list.forEach(function (p) { s[p[0] + "-" + p[1]] = s[p[1] + "-" + p[0]] = 1; }); return s; };
  var HARMONY = PAIRS([[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]]);
  var HARM = PAIRS([[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]]);
  var BREAK = PAIRS([[0, 9], [6, 3], [4, 1], [10, 7], [2, 11], [5, 8]]);
  var PUNISH = PAIRS([[2, 5], [5, 8], [2, 8], [1, 10], [10, 7], [1, 7], [0, 3]]);
  var TRINES = [[8, 0, 4], [2, 6, 10], [5, 9, 1], [11, 3, 7]];
  var ORDER = ["clash", "same", "harmony", "trine", "harm", "punish", "break", "neutral"];

  /** ความสัมพันธ์ของกิ่ง a (ปีเกิด) กับ b (ปีที่ดู / อีกฝ่าย) — ลำดับความสำคัญ: ชง > ตัวเอง > หกประสาน > สามประสาน > ไห่ > เฮ้ง > ผั่ว */
  function relation(a, b) {
    a = mod(a, 12); b = mod(b, 12);
    var k = a + "-" + b;
    if (mod(a - b, 12) === 6) return "clash";
    if (a === b) return "same";
    if (HARMONY[k]) return "harmony";
    if (TRINES.some(function (t) { return t.indexOf(a) >= 0 && t.indexOf(b) >= 0; })) return "trine";
    if (HARM[k]) return "harm";
    if (PUNISH[k]) return "punish";
    if (BREAK[k]) return "break";
    return "neutral";
  }
  /** เป็น "ปีชง" (เต็มหรือร่วม) ตามความเชื่อไทยหรือไม่ */
  function isChong(rel) { return ["clash", "same", "harm", "punish", "break"].indexOf(rel) >= 0; }
  var animalOfYear = function (y) { return mod(y - 4, 12); };
  var stemOfYear = function (y) { return mod(y - 4, 10); };
  var elementOfYear = function (y) { return HS.STEM_EL[stemOfYear(y)]; };
  var yinYangOfYear = function (y) { return stemOfYear(y) % 2 ? "หยิน" : "หยาง"; };
  /** ปีนักษัตรของวันที่ (ค.ศ.) ตามขอบเขต boundary: "chinese" | "lichun" | "thai" */
  function zodiacYearOf(y, m, d, boundary) {
    var jd = HS.julianDay(y, m, d, 12) - 7 / 24, z = HS.zodiacYears(y, m, d, jd, 7);
    var o = z[boundary] || z.chinese;
    return { year: o.year, animal: animalOfYear(o.year), element: elementOfYear(o.year), cny: z.chinese.cny, differ: z.differ };
  }
  /** ปีนักษัตรปัจจุบัน (ตามตรุษจีน) ณ วันที่ today */
  function currentYear(today) {
    today = today || new Date();
    return zodiacYearOf(today.getFullYear(), today.getMonth() + 1, today.getDate(), "chinese").year;
  }
  /** ธาตุ a เทียบธาตุ b (มุมของ a): same | resource (b ให้กำเนิด a) | output (a ให้กำเนิด b) | wealth (a ข่ม b) | power (b ข่ม a) */
  function elRel(self, other) {
    if (self === other) return "same";
    if (HS.GEN[other] === self) return "resource";
    if (HS.GEN[self] === other) return "output";
    if (HS.CTRL[self] === other) return "wealth";
    return "power";
  }
  /** ธาตุเชื่อมเมื่อธาตุข่มกัน (A ให้กำเนิด X และ X ให้กำเนิด B) */
  function bridge(from, to) { var x = HS.GEN[from]; return HS.GEN[x] === to ? x : null; }
  /** ธาตุ/สีเสริมดวงของปี */
  function luckyElements(birthEl, yearEl) {
    var r = elRel(birthEl, yearEl), out = [];
    if (r === "power") out.push(bridge(yearEl, birthEl));
    else if (r === "wealth") out.push(bridge(birthEl, yearEl));
    if (r !== "resource") { for (var k in HS.GEN) if (HS.GEN[k] === birthEl) out.push(k); }
    out.push(birthEl);
    return out.filter(function (x, i, a) { return x && a.indexOf(x) === i; }).slice(0, 2);
  }
  var BASE = { harmony: 90, trine: 87, neutral: 80, break: 72, punish: 71, harm: 70, same: 69, clash: 66 };
  var ELB = { same: { social: 5 }, resource: { work: 5, love: 3 }, output: { love: 6, work: 2 }, wealth: { money: 8 }, power: { work: 4, money: -2 } };
  /** ดวงรายปี: animal = กิ่งปีเกิด 0..11, birthYear (ค.ศ., ไม่บังคับ — ใช้ธาตุปีเกิด), year = ปีที่ดู */
  function annual(animal, year, birthYear) {
    var ya = animalOfYear(year), rel = relation(animal, ya), yEl = elementOfYear(year);
    var bEl = birthYear != null ? elementOfYear(birthYear) : KB.ANIMALS[animal].el;
    var er = elRel(bEl, yEl), b = BASE[rel], e = ELB[er];
    var clamp = function (x) { return Math.max(55, Math.min(96, Math.round(x))); };
    var sc = { overall: clamp(b + (er === "resource" || er === "wealth" ? 3 : er === "power" ? -1 : 1)), work: clamp(b + (e.work || 0)), money: clamp(b + (e.money || 0) - 1), love: clamp(b + (e.love || 0) + (rel === "harmony" ? 3 : 0)) };
    var supports = [];
    for (var k = 0; k < 12; k++) if (k !== animal && (relation(animal, k) === "harmony" || relation(animal, k) === "trine")) supports.push(k);
    return {
      animal: animal, year: year, yearAnimal: ya, yearElement: yEl, yearYY: yinYangOfYear(year), birthElement: bEl, rel: rel, chong: isChong(rel), elRel: er, scores: sc,
      lucky: luckyElements(bEl, yEl), supports: supports, clashWith: mod(animal + 6, 12), direction: KB.ANIMALS[animal].dir
    };
  }
  /** ตารางปีชงของปี year: [{animal, rel}] */
  function chongTable(year) { var ya = animalOfYear(year); return KB.ANIMALS.map(function (_, i) { return { animal: i, rel: relation(i, ya) }; }); }
  function compat(a, b) { var rel = relation(a, b); return { a: a, b: b, rel: rel, score: KB.COMPAT[rel].score }; }
  // "งูใหญ่ (มังกร)" ในวงเล็บของชื่อปี → "งูใหญ่หรือมังกร" (ไม่ให้เกิดวงเล็บซ้อน "ปีมะโรง (งูใหญ่ (มังกร))")
  function anFlat(a) { return String(a.an).replace(/\s*[(（]([^)）]+)[)）]\s*$/, "หรือ$1"); }
  function yearName(y) { var a = KB.ANIMALS[animalOfYear(y)], e = KB.ELEMENTS[elementOfYear(y)]; return "ปี" + a.th + " (" + anFlat(a) + ") ธาตุ" + e.th; }

  /* ---------- facts ---------- */
  function buildFacts(R, topic, opts) {
    opts = opts || {};
    var r = opts.rng || Math.random, A = KB.ANIMALS[R.animal], Y = KB.ANIMALS[R.yearAnimal], REL = KB.REL[R.rel], ER = KB.ELREL[R.elRel], items = [];
    items.push({ id: "animal." + R.animal, group: "ปีเกิด", label: "ปี" + A.th + " (" + anFlat(A) + ")", short: "ชาวปี" + A.th, evidence: "นักษัตร" + A.an + " " + A.zh + " ธาตุ" + KB.ELEMENTS[R.birthElement].th,
      strength: 0.84, tags: ["personality", "work", "money", "love", "social", "advice"], meanings: { personality: A.p.slice(), work: A.w.slice(), money: A.m.slice(), love: A.l.slice(), social: A.s.slice(), advice: [A.a] } });
    var rm = { overview: REL.o.slice(), work: REL.w.slice(), money: REL.m.slice(), love: REL.l.slice(), advice: REL.a.slice(), timing: REL.t.slice() };
    items.push({ id: "rel." + R.rel, group: "ปี " + R.year + " (พ.ศ. " + (R.year + 543) + ")", label: (REL.th === "ปีปกติ" ? "ปีปกติ" : REL.badge.split(" · ").pop()) + "ในปี" + Y.th, short: REL.th === "ปีปกติ" ? "ปีนี้" : "ปี" + REL.th, evidence: yearName(R.year),
      strength: 0.95, polarity: REL.tone === "care" ? "challenge" : undefined, tags: Object.keys(rm), meanings: rm });
    var em = { overview: [ER.o], work: [ER.w], money: [ER.m], love: [ER.l] };
    items.push({ id: "el." + R.elRel, group: "พลังธาตุ", label: ER.th + " (ธาตุ" + KB.ELEMENTS[R.yearElement].th + "กับธาตุ" + KB.ELEMENTS[R.birthElement].th + ")", short: "พลังธาตุของปี", strength: 0.78, tags: Object.keys(em), meanings: em });
    if (R.supports.length) {
      var names = R.supports.map(function (k) { return "ปี" + KB.ANIMALS[k].th; });
      var sm = { social: ["คนที่เกิด" + names.join(" ") + " เป็นคู่เสริมดวงของคุณตามตำรา ร่วมงานหรือทำกิจกรรมด้วยกันแล้วพลังดีจะเพิ่มขึ้น"], love: ["ตามตำรา คนที่เกิด" + names.slice(0, 2).join("หรือ") + "มักเข้าใจคุณได้ง่าย"] };
      items.push({ id: "support", group: "คู่มงคล", label: "นักษัตรคู่เสริมดวง", short: "คู่เสริมดวง", strength: 0.66, tags: Object.keys(sm), meanings: sm });
    }
    for (var i = items.length - 1; i >= 0; i--) if (!items[i].polarity) delete items[i].polarity;
    return {
      domain: "zodiac", topic: topic || "overall", subject: {}, headline: "ชาวปี" + A.th + "ใน" + yearName(R.year) + " · " + REL.th, items: items,
      extras: { luckyColors: R.lucky.map(function (e) { return KB.ELEMENTS[e].colors.join(" / "); }), directions: [R.direction], tips: [FK.pickR(r, REL.a)] }
    };
  }
  function compatFacts(C, topic) {
    var A = KB.ANIMALS[C.a], B = KB.ANIMALS[C.b], X = KB.COMPAT[C.rel];
    var m = { love: X.l.slice(), work: X.w.slice(), overview: [X.l[0]] };
    return {
      // variant "pair": ตัวเรียบเรียงใช้ประโยคเปิดของการดูคู่ (ไม่ใช่ประโยคเปิดของดวงรายปี)
      domain: "zodiac", variant: "pair", topic: topic || "love", subject: {}, headline: "คู่ปี" + A.th + "กับปี" + B.th,
      items: [
        { id: "pair." + C.rel, group: "ความเข้ากัน", label: X.th + " ระหว่างปี" + A.th + "กับปี" + B.th, short: "คู่นี้", strength: 0.95, tags: Object.keys(m), meanings: m, polarity: C.score < 75 ? "challenge" : undefined },
        { id: "a." + C.a, group: "ฝ่ายแรก", label: "ชาวปี" + A.th, short: "ปี" + A.th, strength: 0.7, tags: ["love", "personality"], meanings: { love: A.l.slice(), personality: A.p.slice(0, 2) } },
        // อีกฝ่าย: ใช้คำอ่านบุคคลที่สาม (KB.ANIMALS[i].pl/.ps) ซึ่งขึ้นต้นด้วย "อีกฝ่าย" อยู่แล้ว จึงเป็น plain
        { id: "b." + C.b, group: "อีกฝ่าย", label: "อีกฝ่าย (ชาวปี" + B.th + ")", short: "อีกฝ่าย", plain: true, strength: 0.68, tags: ["love", "social"], meanings: { love: B.pl.slice(), social: B.ps.slice() } }
      ].map(function (it) { if (!it.polarity) delete it.polarity; return it; })
    };
  }

  var ZD = {
    relation: relation, isChong: isChong, animalOfYear: animalOfYear, stemOfYear: stemOfYear, elementOfYear: elementOfYear, zodiacYearOf: zodiacYearOf, currentYear: currentYear,
    elRel: elRel, bridge: bridge, luckyElements: luckyElements, annual: annual, chongTable: chongTable, compat: compat, yearName: yearName, anFlat: anFlat, buildFacts: buildFacts, compatFacts: compatFacts, ORDER: ORDER
  };
  if (typeof module !== "undefined" && module.exports) module.exports = ZD;
  root.Zodiac = ZD;
})(typeof window !== "undefined" ? window : globalThis);

/* ================================ UI ================================ */
if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("zdApp")) (function () {
  "use strict";
  var ZD = window.Zodiac, KB = window.ZODIAC_KB, FK = window.FortuneKit, HS = window.HSCore, $ = FK.$, esc = FK.esc;
  var nowYear = ZD.currentYear(), st = { animal: null, birthYear: null, year: nowYear, res: null, note: null, pair: null, msg: null, pairMsg: false };
  var TONE_CLS = { care: "care", good: "good", ok: "ok" };
  var months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

  /* ---------- ภาษา (ไทยเป็นค่าเริ่มต้น · จีนจาก i18n/zh-fortune-zodiac.js และ i18n/zh-kb-zodiac.js) ---------- */
  var T = function (k, th, v) { return window.LQI18N ? window.LQI18N.tf(k, th, v) : th.replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  var isZh = function () { return !!(window.LQI18N && window.LQI18N.lang === "zh"); };
  var ZK = function (k) { var D = isZh() && window.FORTUNE_ZH && window.FORTUNE_ZH.zodiac; return (D && D.items && D.items[k]) || null; };
  var one = function (v) { return Array.isArray(v) ? v[0] : v; };
  var GZ_S = "甲乙丙丁戊己庚辛壬癸", GZ_B = "子丑寅卯辰巳午未申酉戌亥";
  function anName(i) { return T("zodiac.an." + i, KB.ANIMALS[i].th); }                 // ไทย: ชวด · จีน: 鼠
  function anSub(i) { return isZh() ? KB.ANIMALS[i].zh : KB.ANIMALS[i].an; }             // ไทย: หนู · จีน: 子
  function elName(e) { return isZh() ? KB.ELEMENTS[e].zh : KB.ELEMENTS[e].th; }
  function colors(e) { return T("zodiac.color." + e, KB.ELEMENTS[e].colors.join("|")).split("|"); }
  function dirName(i) { return T("zodiac.dir." + i, KB.ANIMALS[i].dir); }
  function traits(i) { return T("zodiac.traits." + i, KB.ANIMALS[i].traits.join("|")).split("|"); }
  function relName(rel) { var z = ZK("rel." + rel); return z ? z.n : KB.REL[rel].th; }
  function badge(rel) { return T("zodiac.badge." + rel, KB.REL[rel].badge); }
  function elRelName(er) { var z = ZK("el." + er); return z ? z.n : KB.ELREL[er].th; }
  function compatName(rel) { var z = ZK("compat." + rel); return z ? z.n : KB.COMPAT[rel].th; }
  function compatLine(rel) { var z = ZK("compat." + rel); return z && z.l ? one(z.l) : KB.COMPAT[rel].l[0]; }
  function relLine(rel) { var z = ZK("rel." + rel); return z && z.o ? one(z.o) : KB.REL[rel].o[0]; }
  function anLine(i) { var z = ZK("animal." + i); return z && z.p ? one(z.p) : KB.ANIMALS[i].p[0]; }
  function monthName(m) { return T("zodiac.month", months[m - 1], { m: m }); }
  function yearName(y) {
    var a = ZD.animalOfYear(y), A = KB.ANIMALS[a], e = ZD.elementOfYear(y);
    return T("zodiac.yearName", "ปี{th} ({an}) ธาตุ{el}", { th: A.th, an: ZD.anFlat(A), el: KB.ELEMENTS[e].th, gz: GZ_S[ZD.stemOfYear(y)] + GZ_B[a], zan: T("zodiac.an." + a, A.th), zel: KB.ELEMENTS[e].zh });
  }
  var yearOpt = function (y) { return T("zodiac.yearOpt", "{name} · พ.ศ. {be}", { name: yearName(y), be: y + 543, y: y }); };

  /* แท็บ */
  var tabs = [["tabYear", "panelYear"], ["tabChong", "panelChong"], ["tabPair", "panelPair"]];
  function selectTab(id, focus) {
    tabs.forEach(function (t) { var b = document.getElementById(t[0]), on = t[0] === id; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; document.getElementById(t[1]).hidden = !on; if (on && focus) b.focus(); });
  }
  tabs.forEach(function (t, i) {
    var b = document.getElementById(t[0]);
    b.addEventListener("click", function () { selectTab(t[0]); });
    b.addEventListener("keydown", function (e) { var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) { e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length][0], true); } });
  });

  /* ตัวเลือก (สร้างใหม่ตอนสลับภาษาโดยคงค่าที่เลือกไว้) */
  var animalBtns = function (name) { return KB.ANIMALS.map(function (a, i) { return '<label class="fk-opt zd-an"><input type="radio" name="' + name + '" value="' + i + '"><span class="zd-emo" aria-hidden="true">' + a.emo + "</span><b>" + esc(anName(i)) + "</b><small>" + esc(anSub(i)) + "</small></label>"; }).join(""); };
  function keep(sel, fn) { var el = $(sel), v = el.value; fn(el); if (v) el.value = v; }
  function keepRadio(box, name, fn) { var c = document.querySelector('input[name="' + name + '"]:checked'), v = c ? c.value : null; fn(); if (v != null) { var n = $(box).querySelector('input[value="' + v + '"]'); if (n) n.checked = true; } }
  function renderOptions() {
    keepRadio("#zdAnimals", "zdAnimal", function () { $("#zdAnimals").innerHTML = animalBtns("zdAnimal"); });
    keepRadio("#zdPairA", "zdA", function () { $("#zdPairA").innerHTML = animalBtns("zdA"); });
    keepRadio("#zdPairB", "zdB", function () { $("#zdPairB").innerHTML = animalBtns("zdB"); });
    keep("#zdDay", function (el) { el.innerHTML = '<option value="">' + esc(T("zodiac.dayPh", "วันที่")) + "</option>" + Array.from({ length: 31 }, function (_, i) { return "<option>" + (i + 1) + "</option>"; }).join(""); });
    keep("#zdMonth", function (el) { el.innerHTML = '<option value="">' + esc(T("zodiac.monthPh", "เดือน")) + "</option>" + months.map(function (m, i) { return '<option value="' + (i + 1) + '">' + esc(monthName(i + 1)) + "</option>"; }).join(""); });
    keep("#zdBoundary", function (el) { el.innerHTML = Object.keys(KB.boundaries).map(function (k) { return '<option value="' + k + '">' + esc(T("zodiac.bd." + k, KB.boundaries[k])) + "</option>"; }).join(""); });
    var yo = [nowYear, nowYear + 1].map(function (y) { return '<option value="' + y + '">' + esc(yearOpt(y)) + "</option>"; }).join("");
    keep("#zdYear", function (el) { el.innerHTML = yo; });
    keep("#zdChongYear", function (el) { el.innerHTML = yo; });
  }
  renderOptions();

  var stats = FK.statsPanel({
    box: "zdStats", toggle: "zdStatsOn", clear: "zdStatsClear", key: "zd-stats", prefKey: "zd-prefs",
    render: function (s) { return '<p class="fk-small">' + esc(T("zodiac.statAnimal", "ปีนักษัตรของผู้เล่น")) + "</p>" + FK.bars(s.animal, s.total, function (k) { return KB.ANIMALS[k] ? T("zodiac.yearOf", "ปี{a}", { a: anName(k) }) : k; }, 6) + '<p class="fk-small">' + esc(T("zodiac.statRel", "สถานะปีชง")) + "</p>" + FK.bars(s.rel, s.total, function (k) { return KB.REL[k] ? relName(k) : k; }, 4); }
  });

  function readBirth() {
    var d = +$("#zdDay").value, m = +$("#zdMonth").value, raw = $("#zdBirthYear").value.trim();
    if (!d && !m && !raw) return { none: true };
    var era = document.querySelector('input[name="zdEra"]:checked').value, y = HS.toCE(+raw, era);
    var err = HS.validateDate(y, m, d);
    if (err) return { err: err };
    return { y: y, m: m, d: d };
  }
  /** ข้อความแจ้งเตือน: ข้อความไทยจาก horoscope.js ใช้เป็นคีย์ของพจนานุกรมจีน */
  function showMsg() { $("#zdMsg").textContent = st.msg ? T(st.msg, st.msg) : ""; }
  function noteText() {
    var n = st.note; if (!n) return "";
    if (n.manual) return T("zodiac.noteManual", "เลือกปีนักษัตรเอง (ใช้ธาตุประจำนักษัตร)");
    return T("zodiac.noteBirth", "เกิดปี{a} ธาตุ{el} (ตรุษจีนปี พ.ศ. {be} ตรงกับ {d} {month})", { a: anName(n.animal), el: elName(n.element), be: n.y + 543, y: n.y, d: n.cny.d, m: n.cny.m, month: monthName(n.cny.m) }) +
      (n.differ ? T("zodiac.noteDiffer", " · ขอบเขตปีแต่ละตำราให้ผลต่างกันสำหรับวันเกิดนี้") : "");
  }
  $("#zdForm").addEventListener("submit", function (e) {
    e.preventDefault();
    st.msg = null; showMsg();
    var b = readBirth(), picked = document.querySelector('input[name="zdAnimal"]:checked');
    st.year = +$("#zdYear").value;
    if (b.err) { st.msg = b.err; showMsg(); return; }
    if (!b.none) {
      var z = ZD.zodiacYearOf(b.y, b.m, b.d, $("#zdBoundary").value);
      st.animal = z.animal; st.birthYear = z.year;
      st.note = { animal: z.animal, element: z.element, y: b.y, cny: z.cny, differ: z.differ };
    } else if (picked) { st.animal = +picked.value; st.birthYear = null; st.note = { manual: true }; }
    else { st.msg = "กรุณาเลือกปีนักษัตร หรือกรอกวันเกิด"; showMsg(); return; }
    showYear();
  });
  function scoreBars(sc) {
    return [["overall", "ภาพรวม"], ["work", "การงาน"], ["money", "การเงิน"], ["love", "ความรัก"]].map(function (x) { return '<div class="elbar"><span>' + esc(T("zodiac.topic." + x[0], x[1])) + '</span><i style="--w:' + sc[x[0]] + '%;--c:#674ff2"></i><b>' + sc[x[0]] + "</b></div>"; }).join("");
  }
  /** วาดผลรายปี (ใช้ทั้งตอนได้ผลและตอนสลับภาษา) */
  function renderYear() {
    var R = st.res, A = KB.ANIMALS[R.animal], REL = KB.REL[R.rel], dt = function (k, th) { return "<dt>" + esc(T("zodiac.dt." + k, th)) + "</dt>"; };
    $("#zdHero").innerHTML = '<span class="zd-big" aria-hidden="true">' + A.emo + '</span><div><h2 id="zdResTitle" tabindex="-1">' + esc(T("zodiac.heroTitle", "ชาวปี{a} ({an}) ใน{year}", { a: anName(R.animal), an: isZh() ? A.an : ZD.anFlat(A), year: yearName(R.year) })) + '</h2><p class="zd-badge ' + TONE_CLS[REL.tone] + '">' + esc(badge(R.rel)) + "</p><p class=\"fk-small\">" + esc(noteText()) + "</p></div>";
    $("#zdFacts").innerHTML = '<dl class="fk-kv"><div>' + dt("year", "ปีที่ดู") + "<dd>" + esc(T("zodiac.yearVal", "พ.ศ. {be} · {a}", { be: R.year + 543, y: R.year, a: anName(R.yearAnimal) })) + " " + KB.ANIMALS[R.yearAnimal].emo + "</dd></div>" +
      "<div>" + dt("el", "ธาตุของปี") + "<dd>" + esc(elRelName(R.elRel)) + "</dd></div>" +
      "<div>" + dt("color", "สีเสริมดวง") + "<dd>" + R.lucky.map(function (e) { return '<span class="zd-sw" style="--c:' + KB.ELEMENTS[e].hex + '"></span>' + esc(colors(e)[0]); }).join(" ") + "</dd></div>" +
      "<div>" + dt("dir", "ทิศประจำนักษัตร") + "<dd>" + esc(dirName(R.animal)) + "</dd></div>" +
      "<div>" + dt("support", "คู่เสริมดวง") + "<dd>" + R.supports.map(function (k) { return KB.ANIMALS[k].emo + " " + esc(anName(k)); }).join(" · ") + "</dd></div>" +
      "<div>" + dt("clash", "คู่ชง") + "<dd>" + KB.ANIMALS[R.clashWith].emo + " " + esc(anName(R.clashWith)) + "</dd></div></dl>" +
      '<h3 class="zd-h">' + esc(T("zodiac.powerH", "พลังปี (ตามความเชื่อ)")) + "</h3>" + scoreBars(R.scores) +
      '<p class="zd-traits">' + traits(R.animal).map(function (t) { return '<span class="fk-chip">' + esc(t) + "</span>"; }).join(" ") + "</p>";
    $("#zdReadWrap").innerHTML = FK.readingBlock("zdRd", T("zodiac.rdTitle", "คำทำนายดวงรายปี"), true);
    FK.bindReading("zdRd", "zodiac", function (topic, r) { return ZD.buildFacts(R, topic, { rng: r }); }, { withTopics: true });
  }
  function showYear() {
    var R = st.res = ZD.annual(st.animal, st.year, st.birthYear);
    $("#zdResult").hidden = false;
    renderYear();
    stats.add({ animal: R.animal, rel: R.rel });
    $("#zdResTitle").focus(); kiosk.touch();
  }
  function resetYear() { $("#zdResult").hidden = true; $("#zdCardImg").hidden = true; $("#zdForm").reset(); st.res = null; st.msg = null; showMsg(); }
  $("#zdAgain").addEventListener("click", function () { resetYear(); $("#zdForm").scrollIntoView({ block: "start" }); });
  $("#zdPrint").addEventListener("click", function () { window.print(); });
  function emojiArt(emos) {
    return function (c, x, y, w, h) {
      c.textAlign = "center"; c.textBaseline = "middle";
      c.beginPath(); c.arc(x + w / 2, y + h / 2, h / 2 - 10, 0, Math.PI * 2); c.fillStyle = "rgba(255,255,255,.08)"; c.fill(); c.strokeStyle = "#f3c969"; c.lineWidth = 5; c.stroke();
      c.font = (emos.length > 1 ? 150 : 210) + "px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
      if (emos.length > 1) { c.fillText(emos[0], x + w / 2 - 110, y + h / 2 + 8); c.fillText(emos[1], x + w / 2 + 110, y + h / 2 + 8); c.font = "600 70px Prompt"; c.fillStyle = "#f3c969"; c.fillText("+", x + w / 2, y + h / 2); }
      else c.fillText(emos[0], x + w / 2, y + h / 2 + 10);
    };
  }
  $("#zdShare").addEventListener("click", function () {
    var R = st.res; if (!R) return;
    var A = KB.ANIMALS[R.animal], lines = (FK.readings.zdRd || {}).lines || [];
    FK.share(this, { kind: T("zodiac.cardKind", "12 นักษัตร"), glow: "rgba(192,57,43,.4)", artH: 380, art: emojiArt([A.emo]), title: T("zodiac.cardTitle", "ชาวปี{a} · {year}", { a: anName(R.animal), year: yearName(R.year) }), sub: badge(R.rel),
      msgs: (lines.length >= 2 ? lines.slice(0, 2) : [relLine(R.rel), anLine(R.animal)]).concat([T("zodiac.cardLuck", "สีเสริมดวง: {c} · ทิศ{d}", { c: R.lucky.map(function (e) { return colors(e)[0]; }).join(" · "), d: dirName(R.animal) })]), foot: T("zodiac.cardFoot", KB.disclaimerShort) },
      "lensiq-zodiac.jpg", $("#zdCardImg"), T("zodiac.shareTitle", "12 นักษัตร — LENSIQ"));
  });

  /* ตารางปีชง */
  function renderChong() {
    var y = +$("#zdChongYear").value, TB = ZD.chongTable(y);
    var groups = [["full", "ชงเต็ม", ["clash"], "care"], ["co", "ชงร่วม", ["same", "harm", "punish", "break"], "care"], ["good", "ปีเสริมดวง", ["harmony", "trine"], "good"], ["neutral", "ปีปกติ", ["neutral"], "ok"]];
    $("#zdChongGrid").innerHTML = groups.map(function (g) {
      var list = TB.filter(function (t) { return g[2].indexOf(t.rel) >= 0; });
      return '<section class="zd-group ' + g[3] + '"><h3>' + esc(T("zodiac.grp." + g[0], g[1])) + " <small>(" + list.length + ")</small></h3><ul>" +
        list.map(function (t) { var A = KB.ANIMALS[t.animal]; return "<li><span aria-hidden=\"true\">" + A.emo + "</span> <b>" + esc(T("zodiac.yearOf", "ปี{a}", { a: anName(t.animal) })) + "</b> <small>" + esc(badge(t.rel)) + "</small></li>"; }).join("") + "</ul></section>";
    }).join("");
    $("#zdChongNote").textContent = T("zodiac.chongNote", "{name} (พ.ศ. {be}) — สำนักต่าง ๆ ในไทยอาจนับชงร่วมต่างกันเล็กน้อย ตารางนี้ใช้ ชง冲 ไห่害 เฮ้ง刑 ผั่ว破 ตามตำรากิ่งดิน", { name: yearName(y), be: y + 543, y: y });
  }
  $("#zdChongYear").addEventListener("change", renderChong);
  renderChong();

  /* คู่มงคล */
  function renderPair() {
    var C = st.pair, A = KB.ANIMALS[C.a], B = KB.ANIMALS[C.b];
    $("#zdPairRes").innerHTML = '<div class="fk-block zd-pairhead"><p class="zd-pairemo" aria-hidden="true">' + A.emo + " + " + B.emo + '</p><h2 tabindex="-1" id="zdPairTitle">' + esc(T("zodiac.pairTitle", "ปี{a} กับ ปี{b}", { a: anName(C.a), b: anName(C.b) })) + '</h2><p class="zd-badge ' + (C.score >= 85 ? "good" : C.score >= 75 ? "ok" : "care") + '">' + esc(compatName(C.rel)) + " · " + C.score + '%</p><p>' + esc(compatLine(C.rel)) + "</p></div>" + FK.readingBlock("zdPairRd", T("zodiac.pairRdTitle", "คำทำนายคู่"), true, "love");
    FK.bindReading("zdPairRd", "zodiac", function (topic) { return ZD.compatFacts(C, topic); }, { withTopics: true, topic: "love" });
  }
  function showPairMsg() { $("#zdPairMsg").textContent = st.pairMsg ? T("zodiac.pairMsg", "กรุณาเลือกปีนักษัตรของทั้งสองฝ่าย") : ""; }
  $("#zdPairForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var a = document.querySelector('input[name="zdA"]:checked'), b = document.querySelector('input[name="zdB"]:checked');
    if (!a || !b) { st.pairMsg = true; showPairMsg(); return; }
    st.pairMsg = false; showPairMsg();
    st.pair = ZD.compat(+a.value, +b.value);
    $("#zdPairRes").hidden = false;
    renderPair();
    stats.add({ pair: st.pair.rel });
    $("#zdPairTitle").focus();
  });

  var kiosk = FK.kiosk({ toggle: "zdKiosk", exit: "zdKioskExit", idle: "zdIdle", busy: function () { return !$("#zdResult").hidden || !$("#zdPairRes").hidden; }, reset: function () { resetYear(); $("#zdPairRes").hidden = true; $("#zdPairForm").reset(); st.pair = null; selectTab("tabYear"); } });
  // citation list: back office / docs only (owner order 2026-11-12, tools/fortune-sources.mjs)

  /* สลับภาษา: วาดข้อความแบบไดนามิกใหม่ และประกอบคำทำนายใหม่จาก facts เดิม */
  window.addEventListener("lq-lang", function () {
    renderOptions(); renderChong(); showMsg(); showPairMsg();
    if (stats.render) stats.render();
    if (st.res && !$("#zdResult").hidden) renderYear();
    if (st.pair && !$("#zdPairRes").hidden) renderPair();
  });

  if (location.hash === "#chong") selectTab("tabChong"); else if (location.hash === "#pair") selectTab("tabPair");
  window.__zd = { state: st, showYear: showYear };
})();
