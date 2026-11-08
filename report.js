/* report.js — รายงานดวงของฉัน (report.html): the deliverables of the one-time reports sold on pricing.html.
 *
 *   report_basic   one full multi-section reading: 八字 BaZi + ทักษา Taksa + เลข 7 ตัว 9 ฐาน, each composed in full, plus
 *                  (round 12 — what the free pages do not give) a cross-system deep-dive on work / money / love (each
 *                  topic composed by all 3 systems, paragraphs already shown are not repeated), the next 3 months
 *                  (month pillar vs the Day Master) and a personalised 4-week plan merged from every system's remedies
 *   report_compat  two-person compatibility long form: 12-animal pair relation + Day-Master element relation + plan
 *   report_annual  12-month outlook for a chosen year: the year's zodiac reading, the BaZi luck period and one entry
 *                  per month (the month pillar's "ten god" against the Day Master, favourable elements)
 * Everything is computed on the device with the public engines (lifecal.js LifeCal, lifecal-kb.js LIFECAL_KB,
 * zodiac.js Zodiac, fortune-ai.js FortuneAI.compose — the writing assistant is not used), in TH / EN / 中文.
 * Birth dates never leave the device; only the finished text is saved when the member saves it.
 *
 * Redeem flow (browser):
 *   no API (GitHub Pages today)       -> "sample" mode: the full report is shown, labelled as a free demo sample,
 *                                         nothing is saved or charged
 *   API, FREE_MODE on                 -> free: generate; signed-in members get it saved to history automatically
 *   API, billing on                   -> sign-in required; POST /api/me/entitlements/use {feature} takes one report
 *                                         credit (server check) BEFORE the report is shown; then POST /api/me/saved;
 *                                         a failed save can be retried (the credit is not taken twice)
 * Print / PDF: the browser's print dialog with a print stylesheet (report.css). Pure builders are unit-tested in Node
 * (tests/unit/report.test.js). */
(function (root) {
  "use strict";
  /** @type {any} */
  var W = root;
  var isNode = typeof module !== "undefined" && module.exports;
  /** @param {string} n */
  var need = function (n) { return isNode ? require(n) : null; };
  var LC = W.LifeCal || need("./lifecal.js");
  var KB = W.LIFECAL_KB || need("./lifecal-kb.js");
  var ZD = W.Zodiac || need("./zodiac.js");
  var FA = W.FortuneAI || need("./fortune-ai.js");

  var TYPES = ["report_basic", "report_compat", "report_annual"];
  /** saved_readings.domain used for each report (backend FORTUNE_DOMAINS) */
  var DOMAIN = /** @type {Record<string, string>} */ ({ report_basic: "bazi", report_compat: "zodiac", report_annual: "lifegraph" });
  var SAVE_BUDGET = 15000; // bytes; the Worker refuses > 16 KB (members.js SAVED_MAX_BYTES)

  /* ---------------- texts (Thai default; zh / en in i18n/zh-report.js / en-report.js) ---------------- */
  var EL_TH = ["ไม้", "ไฟ", "ดิน", "ทอง", "น้ำ"];
  var GODS = /** @type {Record<string, {tone: string, title: string, text: string, tip: string}>} */ ({
    peer: { tone: "neutral", title: "เดือนแห่งเพื่อนร่วมทาง", text: "พลังของเดือนนี้เป็นธาตุเดียวกับเจ้าชะตาของคุณ งานที่ทำร่วมกับเพื่อนหรือทีมมักไปได้ดี แต่ควรแบ่งบทบาทให้ชัดเพื่อไม่ให้แย่งกันนำ", tip: "ชวนคนที่ไว้ใจทำเรื่องที่ค้างไว้ให้เสร็จด้วยกันสักเรื่อง" },
    output: { tone: "favourable", title: "เดือนแห่งการแสดงฝีมือ", text: "ความคิดสร้างสรรค์และการสื่อสารเด่น เหมาะกับการนำเสนอผลงาน เขียน สอน หรือเริ่มโปรเจกต์เล็ก ๆ ที่ใช้ฝีมือของคุณเอง", tip: "เลือกผลงานหนึ่งชิ้นแล้วแสดงให้คนที่เกี่ยวข้องเห็น" },
    wealth: { tone: "favourable", title: "เดือนแห่งการบริหารทรัพย์", text: "เรื่องรายได้และการจัดการเงินเด่น เป็นจังหวะดีสำหรับการวางแผนการเงินอย่างรอบคอบ มากกว่าการเสี่ยงโชค", tip: "ทบทวนรายจ่ายประจำและกันเงินออมไว้ก่อนใช้" },
    officer: { tone: "caution", title: "เดือนแห่งหน้าที่", text: "ความรับผิดชอบและบทบาทในงานเพิ่มขึ้น อาจรู้สึกกดดันบ้าง ควรจัดลำดับงานให้ชัดและพักให้พอ แรงกดดันนี้ช่วยให้คุณเติบโตได้", tip: "แบ่งงานใหญ่เป็นขั้นเล็ก ๆ และกันเวลาพักไว้ในตาราง" },
    resource: { tone: "favourable", title: "เดือนแห่งการเรียนรู้", text: "เหมาะกับการเรียนสิ่งใหม่ ขอคำแนะนำจากผู้ใหญ่ และดูแลใจตัวเอง ผู้ที่มีประสบการณ์มักยินดีช่วยถ้าคุณเอ่ยปาก", tip: "ลงเรียนหรืออ่านเรื่องใหม่สักเรื่อง แล้วจดสิ่งที่ได้" }
  });
  var PAIR_EL = /** @type {Record<string, string>} */ ({
    peer: "เจ้าชะตาของทั้งสองเป็นธาตุเดียวกัน ({a}) จึงเข้าใจวิธีคิดของกันและกันได้ง่าย แต่บางครั้งอาจต่างคนต่างยึดวิธีของตัวเอง ควรแบ่งบทบาทให้ชัดและผลัดกันนำ",
    output: "ธาตุ{a}ของคุณให้กำเนิดธาตุ{b}ของอีกฝ่าย คุณมักเป็นฝ่ายเติมพลังและดูแล ความสัมพันธ์จะยั่งยืนเมื่อคุณดูแลตัวเองด้วยและบอกความต้องการของตัวเองอย่างนุ่มนวล",
    resource: "ธาตุ{b}ของอีกฝ่ายให้กำเนิดธาตุ{a}ของคุณ อีกฝ่ายมักเป็นแรงหนุนให้คุณ ควรบอกขอบคุณและตอบแทนในแบบที่อีกฝ่ายชอบ",
    wealth: "ธาตุ{a}ของคุณข่มธาตุ{b}ของอีกฝ่ายตามวงห้าธาตุ คุณอาจเป็นฝ่ายตัดสินใจบ่อยกว่า ควรถามความเห็นของอีกฝ่ายก่อนและไม่ตัดสินใจแทน",
    officer: "ธาตุ{b}ของอีกฝ่ายข่มธาตุ{a}ของคุณตามวงห้าธาตุ บางครั้งคุณอาจรู้สึกถูกกดดัน ควรบอกความต้องการของตัวเองตรง ๆ อย่างนุ่มนวล และตกลงเรื่องสำคัญร่วมกัน"
  });

  /** @param {string} th @param {Record<string, any>} [vars] */
  var fill = function (th, vars) { return String(th).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; }); };
  /** default translator: Thai text with {vars} (the browser passes LQI18N.tf) */
  var T0 = function (/** @type {string} */ _k, /** @type {string} */ th, /** @type {any} */ vars) { return fill(th, vars); };

  /* ---------------- pure helpers ---------------- */
  /** Validates a birth input {y (CE), m, d, h?, mi?, noTime?, gender?}. Returns "" or an error key. @param {any} b */
  function validBirth(b) {
    if (!b || !Number.isInteger(b.y) || !Number.isInteger(b.m) || !Number.isInteger(b.d)) return "rp.err.date";
    if (b.y < 1900 || b.y > 2100) return "rp.err.year";
    if (b.m < 1 || b.m > 12 || b.d < 1 || b.d > new Date(Date.UTC(b.y, b.m, 0)).getUTCDate()) return "rp.err.date";
    return "";
  }
  /** stable seed for one input (the same birth data gives the same wording when printed again) @param {any[]} parts */
  function seedOf(parts) { var s = JSON.stringify(parts), h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  /** age in full years on date (y, m, d) @param {any} b @param {number} y @param {number} m @param {number} d */
  function ageOn(b, y, m, d) { var a = y - b.y; if (m < b.m || (m === b.m && d < b.d)) a--; return Math.max(0, a); }
  /** composed reading -> plain sections [{id, title, paragraphs}] (collapsed sections included, "main" ignored) @param {any} r */
  function plainSections(r) { return (r && r.sections || []).map(function (/** @type {any} */ s) { return { id: s.id, title: s.title || "", paragraphs: (s.paragraphs || []).slice() }; }); }
  /** @param {any} b */
  var withDefaults = function (b) { return Object.assign({ h: 12, mi: 0, tz: 7, noTime: false, gender: "female" }, b, { h: b.noTime ? 12 : b.h == null ? 12 : b.h, mi: b.noTime ? 0 : b.mi || 0 }); };

  /** One month of the outlook: the month pillar's ten god against the Day Master of chart B. @param {any} B @param {any} b
   *  @param {number} year @param {number} m @param {Function} t @param {((m: number) => string)|undefined} monthName */
  function monthEntry(B, b, year, m, t, monthName) {
    var P = LC.bazi({ y: year, m: m, d: 15, h: 12, mi: 0, tz: b.tz == null ? 7 : b.tz, noTime: false, gender: b.gender }).pillars.month;
    var mel = LC.STEM_EL[P.stem], god = LC.tenGod(B.dayMaster.el, mel), G = GODS[god];
    var fav = B.favour.indexOf(mel) >= 0;
    return {
      m: m, year: year, label: monthName ? monthName(m) : String(m), pillar: P.zh, god: god, tone: G.tone,
      title: t("rp.god." + god + ".title", G.title), text: t("rp.god." + god + ".text", G.text), tip: t("rp.god." + god + ".tip", G.tip),
      fav: fav ? t("rp.favMonth", "ธาตุของเดือนนี้ ({e}) เป็นธาตุที่หนุนผังของคุณ เหมาะกับการเริ่มเรื่องที่ตั้งใจไว้", { e: t("rp.el." + mel, EL_TH[mel]) }) : ""
    };
  }
  var DEEP = ["work", "money", "love"];
  var DEEP_TH = /** @type {Record<string, string>} */ ({ work: "การงานและการเรียน · มุมมองจาก 3 ศาสตร์", money: "การเงิน · มุมมองจาก 3 ศาสตร์", love: "ความรักและความสัมพันธ์ · มุมมองจาก 3 ศาสตร์" });
  /** Paragraphs of every part already in the report (so the deep-dive never repeats them). @param {any[]} parts */
  function usedParas(parts) { var s = new Set(); parts.forEach(function (p) { p.sections.forEach(function (/** @type {any} */ x) { x.paragraphs.forEach(function (/** @type {string} */ q) { s.add(q); }); }); }); return s; }
  /** Plan items of several composed readings, de-duplicated by text. @param {any[]} rs */
  function planPool(rs) {
    var seen = new Set(), out = /** @type {any[]} */ ([]);
    rs.forEach(function (r) { ((r && r.plan && r.plan.items) || []).forEach(function (/** @type {any} */ x) { if (x && x.t && !seen.has(x.t)) { seen.add(x.t); out.push({ for: x.for || "", t: x.t }); } }); });
    return out;
  }
  /**
   * 4-week plan: weeks 1–3 take two remedies each from the pool (the chart's own needs first), week 3 adds this month's
   * tip, week 4 is a review. @param {any[]} pool @param {any} month first month of the outlook @param {Function} t
   */
  function plan30Of(pool, month, t) {
    var weeks = [];
    for (var w = 0; w < 3; w++) {
      var items = pool.slice(w * 2, w * 2 + 2);
      if (!items.length && pool.length) items = [pool[w % pool.length]];
      if (w === 2 && month) items = items.concat([{ for: t("rp.plan30.month", "เดือนนี้"), t: month.tip }]);
      weeks.push({ n: w + 1, label: t("rp.week", "สัปดาห์ที่ {n}", { n: w + 1 }), items: items });
    }
    weeks.push({ n: 4, label: t("rp.week", "สัปดาห์ที่ {n}", { n: 4 }), items: [{ for: t("rp.plan30.reviewFor", "ทบทวน"), t: t("rp.plan30.review", "จดสั้น ๆ ว่าข้อไหนทำได้และรู้สึกอย่างไร เลือกข้อที่ได้ผลที่สุดทำต่อในเดือนถัดไป และปล่อยข้อที่ไม่เหมาะกับคุณ") }] });
    return { title: t("rp.plan30.title", "แผน 30 วันเฉพาะของคุณ"), note: t("rp.plan30.note", "รวมจากคำแนะนำของทั้ง 3 ศาสตร์ตามผังของคุณ เป็นกิจกรรมดูแลตัวเองเล็ก ๆ ไม่ใช่คำแนะนำทางการแพทย์หรือการเงิน"), weeks: weeks };
  }

  /**
   * @param {any} b birth @param {{lang?: string, t?: Function, now?: Date, monthName?: (m: number) => string}} [o]
   * @returns {any} {kind, lang, title, parts:[{id, title, headline, sections}], summary, plan, reminder}
   */
  function buildBasic(b, o) {
    o = o || {}; var t = o.t || T0, lang = o.lang || "th", now = o.now || new Date();
    b = withDefaults(b);
    var age = ageOn(b, now.getFullYear(), now.getMonth() + 1, now.getDate()), seed = seedOf(["basic", b.y, b.m, b.d, b.h, b.mi, b.noTime, b.gender]);
    var B = LC.bazi(b), Tk = LC.taksa(b), L7 = LC.lek7(b);
    var rb = FA.compose(KB.baziFacts(B, "overall", { age: age }), { lang: lang, seed: seed });
    var rt = FA.compose(KB.taksaFacts(Tk, "overall", { age: age }), { lang: lang, seed: seed + 1 });
    var rl = FA.compose(KB.lek7Facts(L7, "overall"), { lang: lang, seed: seed + 2 });
    var parts = [
      { id: "bazi", title: t("rp.part.bazi", "แปดอักษร (八字) · เจ้าชะตาและห้าธาตุ"), headline: [B.pillars.year.zh, B.pillars.month.zh, B.pillars.day.zh].concat(B.pillars.hour ? [B.pillars.hour.zh] : []).join(" "), sections: plainSections(rb) },
      { id: "taksa", title: t("rp.part.taksa", "ทักษา · ดาวประจำวันเกิดและภูมิทั้ง 8"), headline: "", sections: plainSections(rt) },
      { id: "lek7", title: t("rp.part.lek7", "เลข 7 ตัว 9 ฐาน · ฐานรวม"), headline: L7.sum.join(" · "), sections: plainSections(rl) }
    ];
    // cross-system deep-dive: each topic composed by all three systems, nothing already shown above is repeated
    var used = usedParas(parts), deepRs = /** @type {any[]} */ ([]), deepSecs = /** @type {any[]} */ ([]);
    DEEP.forEach(function (tp, i) {
      var rs = [FA.compose(KB.baziFacts(B, tp, { age: age }), { lang: lang, seed: seed + 10 + i }), FA.compose(KB.taksaFacts(Tk, tp, { age: age }), { lang: lang, seed: seed + 20 + i }), FA.compose(KB.lek7Facts(L7, tp), { lang: lang, seed: seed + 30 + i })];
      deepRs = deepRs.concat(rs);
      var paras = /** @type {string[]} */ ([]);
      rs.forEach(function (r) { (r.sections || []).filter(function (/** @type {any} */ s) { return s.id === tp; }).forEach(function (/** @type {any} */ s) { (s.paragraphs || []).forEach(function (/** @type {string} */ q) { if (q && !used.has(q)) { used.add(q); paras.push(q); } }); }); });
      if (paras.length) deepSecs.push({ id: tp, title: t("rp.deep." + tp, DEEP_TH[tp]), paragraphs: paras.slice(0, 8) });
    });
    if (deepSecs.length) parts.push({ id: "deep", title: t("rp.part.deep", "เจาะลึกรายหัวข้อ · 3 ศาสตร์ประกอบกัน"), headline: "", sections: deepSecs });
    // the next three months (month pillar vs the Day Master)
    var ahead = [0, 1, 2].map(function (k) { var mm = now.getMonth() + k, yy = now.getFullYear() + Math.floor(mm / 12); return monthEntry(B, b, yy, (mm % 12) + 1, t, o && o.monthName); });
    parts.push({ id: "ahead", title: t("rp.part.ahead", "3 เดือนข้างหน้า"), headline: "", sections: ahead.map(function (x) { return { id: "m" + x.m, title: x.label + " (" + x.pillar + ") · " + x.title, paragraphs: [x.text, "→ " + x.tip].concat(x.fav ? [x.fav] : []) }; }) });
    var plan30 = plan30Of(planPool([rb, rt, rl].concat(deepRs)), ahead[0], t);
    return {
      kind: "report_basic", lang: rb.lang || lang, title: t("rp.basic.title", "รายงานดวงพื้นฐาน"),
      parts: parts, ahead: ahead, plan30: plan30,
      summary: rb.summary || null, plan: rb.plan || null, reminder: rb.reminder || rt.reminder || ""
    };
  }

  /**
   * @param {any} a first person @param {any} b2 second person @param {{lang?: string, t?: Function}} [o]
   */
  function buildCompat(a, b2, o) {
    o = o || {}; var t = o.t || T0, lang = o.lang || "th";
    a = withDefaults(a); b2 = withDefaults(b2);
    var seed = seedOf(["compat", a.y, a.m, a.d, b2.y, b2.m, b2.d]);
    var za = ZD.zodiacYearOf(a.y, a.m, a.d, "chinese"), zb = ZD.zodiacYearOf(b2.y, b2.m, b2.d, "chinese");
    var C = ZD.compat(za.animal, zb.animal);
    var rz = FA.compose(ZD.compatFacts(C, "love"), { lang: lang, seed: seed });
    var Ba = LC.bazi(a), Bb = LC.bazi(b2);
    var rel = LC.tenGod(Ba.dayMaster.el, Bb.dayMaster.el);
    var el = function (/** @type {number} */ i) { return t("rp.el." + i, EL_TH[i]); };
    var elText = t("rp.pairEl." + rel, PAIR_EL[rel], { a: el(Ba.dayMaster.el), b: el(Bb.dayMaster.el) });
    var animals = function (/** @type {number} */ i) { return t("rp.animal." + i, ["ชวด", "ฉลู", "ขาล", "เถาะ", "มะโรง", "มะเส็ง", "มะเมีย", "มะแม", "วอก", "ระกา", "จอ", "กุน"][i]); };
    return {
      kind: "report_compat", lang: rz.lang || lang, title: t("rp.compat.title", "รายงานดวงคู่"),
      score: C.score, rel: C.rel, elRel: rel,
      parts: [
        { id: "pair", title: t("rp.part.pair", "ความเข้ากันตาม 12 นักษัตร"), headline: t("rp.pairHead", "ปี{a} กับ ปี{b} · {s}%", { a: animals(za.animal), b: animals(zb.animal), s: C.score }), sections: plainSections(rz) },
        { id: "elements", title: t("rp.part.elements", "ธาตุเจ้าชะตา (八字 日主) ของทั้งสอง"), headline: el(Ba.dayMaster.el) + " · " + el(Bb.dayMaster.el),
          sections: [{ id: "el", title: t("rp.sec.elements", "พลังห้าธาตุระหว่างกัน"), paragraphs: [elText, t("rp.pairElNote", "ห้าธาตุบอกแนวโน้มของการเติมพลังให้กันตามตำรา ไม่ได้ตัดสินว่าคู่ใดดีหรือไม่ดี ความเข้าใจและการกระทำของทั้งสองสำคัญที่สุด")] }] }
      ],
      summary: rz.summary || null, plan: rz.plan || null, reminder: rz.reminder || ""
    };
  }

  /**
   * @param {any} b birth @param {number} year Gregorian year of the outlook @param {{lang?: string, t?: Function, monthName?: (m: number) => string}} [o]
   */
  function buildAnnual(b, year, o) {
    o = o || {}; var t = o.t || T0, lang = o.lang || "th";
    b = withDefaults(b);
    var seed = seedOf(["annual", b.y, b.m, b.d, b.h, b.mi, b.noTime, b.gender, year]);
    var z = ZD.zodiacYearOf(b.y, b.m, b.d, "chinese");
    var R = ZD.annual(z.animal, year, z.year);
    var rng = (function (s) { return function () { s = (s + 0x6D2B79F5) >>> 0; var x = Math.imul(s ^ (s >>> 15), s | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; })(seed);
    var ry = FA.compose(ZD.buildFacts(R, "overall", { rng: rng }), { lang: lang, seed: seed });
    var B = LC.bazi(b);
    var rb = FA.compose(KB.baziFacts(B, "overall", { age: ageOn(b, year, 7, 1) }), { lang: lang, seed: seed + 1 });
    var timing = plainSections(rb).filter(function (s) { return s.id === "timing" || s.id === "overview"; });
    var months = [];
    for (var m = 1; m <= 12; m++) months.push(monthEntry(B, b, year, m, t, o.monthName));
    return {
      kind: "report_annual", lang: ry.lang || lang, title: t("rp.annual.title", "รายงานดวงรายปี {y}", { y: year }), year: year,
      parts: [
        { id: "year", title: t("rp.part.year", "ภาพรวมของปีตาม 12 นักษัตร"), headline: "", sections: plainSections(ry) },
        { id: "luck", title: t("rp.part.luck", "วัยจร 10 ปี (大运) ในปีนี้"), headline: "", sections: timing.length ? timing : plainSections(rb).slice(0, 2) }
      ],
      months: months,
      monthNote: t("rp.monthNote", "เสาเดือนของ 八字 เปลี่ยนตามสารท (ราววันที่ 4–8 ของแต่ละเดือน) รายการนี้ใช้เสาเดือนที่ครอบคลุมช่วงกลางเดือน"),
      summary: ry.summary || null, plan: ry.plan || rb.plan || null, reminder: ry.reminder || rb.reminder || ""
    };
  }

  /** utf-8 byte length @param {string} s */
  function bytes(s) { return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length; }
  /**
   * The report as a saved reading the Worker accepts (members.js cleanSaved: <= 12 sections x 12 paragraphs, <= 16 KB):
   * parts and months flattened to sections; trimmed from the end until it fits. {data, trimmed}
   * @param {any} rep
   */
  function toSaved(rep) {
    var secs = [];
    (rep.parts || []).forEach(function (/** @type {any} */ p) {
      p.sections.forEach(function (/** @type {any} */ s, /** @type {number} */ i) { secs.push({ id: (p.id + "-" + s.id).slice(0, 24), title: (i === 0 ? p.title + " · " : "") + s.title, paragraphs: s.paragraphs.slice(0, 12) }); });
    });
    if (rep.months && rep.months.length) {
      var half = [rep.months.slice(0, 6), rep.months.slice(6)];
      half.forEach(function (list, k) {
        secs.push({ id: "months-" + (k + 1), title: k ? "7–12" : "1–6", paragraphs: list.map(function (/** @type {any} */ x) { return x.label + " (" + x.pillar + ") · " + x.title + ": " + x.text + " " + x.tip + (x.fav ? " " + x.fav : ""); }) });
      });
    }
    // months first when there is not room for everything (they are the point of the annual report)
    if (rep.months) secs = secs.filter(function (s) { return /^months-/.test(s.id); }).concat(secs.filter(function (s) { return !/^months-/.test(s.id); }));
    // the personalised 4-week plan (basic report) is kept first, then the deep-dive, then the rest
    if (rep.plan30 && rep.plan30.weeks) {
      var p30 = { id: "plan30", title: rep.plan30.title, paragraphs: rep.plan30.weeks.map(function (/** @type {any} */ w) { return w.label + ": " + w.items.map(function (/** @type {any} */ x) { return (x.for ? x.for + " — " : "") + x.t; }).join(" · "); }) };
      var deep = secs.filter(function (s) { return /^deep-/.test(s.id); });
      secs = [p30].concat(deep, secs.filter(function (s) { return !/^deep-/.test(s.id); }));
    }
    var data = { lang: rep.lang || "th", summary: rep.summary ? { title: rep.summary.title, lines: (rep.summary.lines || []).slice(0, 6) } : undefined, plan: rep.plan ? { title: rep.plan.title, items: (rep.plan.items || []).slice(0, 5) } : undefined, sections: secs.slice(0, 12), reminder: rep.reminder || undefined };
    var trimmed = secs.length > 12;
    while (bytes(JSON.stringify(data)) > SAVE_BUDGET && data.sections.length) {
      var last = data.sections[data.sections.length - 1];
      if (last.paragraphs.length > 1) last.paragraphs.pop(); else data.sections.pop();
      trimmed = true;
    }
    return { data: data, trimmed: trimmed };
  }
  /** What the page may do in a mode: "sample" (no API) | "free" (API, FREE_MODE) | "paid". @param {any} cfg @param {boolean} api */
  function modeOf(cfg, api) { if (!api) return "sample"; return cfg && cfg.free_mode === true ? "free" : "paid"; } // fail closed: no config -> the server decides
  /** Report credits from GET /api/me/entitlements perks or /api/me credits ({feature: n} | [{feature, remaining}]). @param {any} ents @param {any} credits */
  function creditsOf(ents, credits) {
    var out = /** @type {Record<string, number>} */ ({});
    TYPES.forEach(function (f) { out[f] = 0; });
    var perks = ents && ents.perks;
    // GET /api/me/entitlements is current; /api/me credits may be from before the last redeem — used only without it
    if (perks) { TYPES.forEach(function (f) { var p = perks[f]; if (p) out[f] = Math.max(Number(p.credits) || 0, p.remaining != null && p.quota ? Number(p.remaining) || 0 : 0); }); return out; }
    var list = Array.isArray(credits) ? credits : credits && typeof credits === "object" ? Object.keys(credits).map(function (k) { return { feature: k, remaining: credits[k] && typeof credits[k] === "object" ? credits[k].remaining : credits[k] }; }) : [];
    list.forEach(function (/** @type {any} */ c) { if (c && TYPES.indexOf(c.feature) >= 0) out[c.feature] = Math.max(out[c.feature], Number(c.remaining) || 0); });
    return out;
  }

  var pure = { TYPES: TYPES, DOMAIN: DOMAIN, GODS: GODS, PAIR_EL: PAIR_EL, DEEP: DEEP, monthEntry: monthEntry, planPool: planPool, plan30Of: plan30Of, validBirth: validBirth, seedOf: seedOf, ageOn: ageOn, buildBasic: buildBasic, buildCompat: buildCompat, buildAnnual: buildAnnual, toSaved: toSaved, modeOf: modeOf, creditsOf: creditsOf, SAVE_BUDGET: SAVE_BUDGET };
  if (isNode) { module.exports = pure; return; }

  /* ============================ browser ============================ */
  var doc = root.document;
  var $ = function (/** @type {string} */ id) { return /** @type {any} */ (doc.getElementById(id)); };
  /** @param {string} key @param {string} thai @param {Record<string, any>} [vars] */
  var T = function (key, thai, vars) { return W.LQI18N && typeof W.LQI18N.tf === "function" ? W.LQI18N.tf(key, thai, vars) : fill(thai, vars); };
  var lang = function () { return W.LQI18N ? W.LQI18N.lang : "th"; };
  var locale = function () { return ({ th: "th-TH", en: "en-GB", zh: "zh-CN" })[lang()] || "th-TH"; };
  var monthName = function (/** @type {number} */ m) { try { return new Date(2001, m - 1, 15).toLocaleDateString(locale(), { month: "long" }); } catch (e) { return String(m); } };
  /** @param {string} tag @param {Record<string, any>|null} [attrs] @param {...any} kids */
  function h(tag, attrs, ...kids) {
    var e = doc.createElement(tag), a = attrs || {};
    for (var k in a) {
      if (k === "text") e.textContent = a[k];
      else if (k === "class") e.className = a[k];
      else if (a[k] !== false && a[k] != null) e.setAttribute(k, a[k] === true ? "" : String(a[k]));
    }
    kids.forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? doc.createTextNode(c) : c); });
    return e;
  }
  var M = function () { return W.LQMember; };
  var A = function () { return W.LQApi; };
  var st = /** @type {any} */ ({ type: "report_basic", mode: "sample", credits: null, last: null, saved: null, used: false });

  var params = new URLSearchParams(location.search);
  if (TYPES.indexOf(String(params.get("type"))) >= 0) st.type = String(params.get("type"));

  /* ---------------- form ---------------- */
  function fillSelects() {
    ["rpA", "rpB"].forEach(function (p) {
      var d = $(p + "Day"), m = $(p + "Month");
      if (d && !d.options.length) for (var i = 1; i <= 31; i++) d.appendChild(h("option", { value: i, text: String(i) }));
      if (m) {
        var keep = m.value;
        m.textContent = "";
        for (var j = 1; j <= 12; j++) m.appendChild(h("option", { value: j, text: monthName(j) }));
        if (keep) m.value = keep;
      }
    });
    var y = $("rpYear");
    if (y && !y.options.length) { var now = new Date().getFullYear(); for (var k = now - 1; k <= now + 2; k++) y.appendChild(h("option", { value: k, text: String(lang() === "th" ? k + 543 : k) })); y.value = String(now); }
    else if (y) Array.prototype.forEach.call(y.options, function (/** @type {HTMLOptionElement} */ op) { op.textContent = String(lang() === "th" ? +op.value + 543 : op.value); });
  }
  /** @param {string} p "rpA" | "rpB" */
  function readBirth(p) {
    var raw = String($(p + "Year").value || "").trim();
    if (!/^\d{4}$/.test(raw)) return { err: "rp.err.year" };
    var era = /** @type {any} */ (doc.querySelector('input[name="' + p + 'Era"]:checked'));
    var y = +raw - (era && era.value === "be" ? 543 : 0);
    var noTime = !!($(p + "NoTime") && $(p + "NoTime").checked);
    var tm = String(($(p + "Time") && $(p + "Time").value) || "12:00").split(":");
    var g = /** @type {any} */ (doc.querySelector('input[name="' + p + 'Gender"]:checked'));
    var b = { y: y, m: +$(p + "Month").value, d: +$(p + "Day").value, h: noTime ? 12 : +tm[0] || 0, mi: noTime ? 0 : +tm[1] || 0, noTime: noTime, tz: 7, gender: g ? g.value : "female" };
    var e = validBirth(b);
    return e ? { err: e } : b;
  }
  var ERR = /** @type {Record<string, string>} */ ({ "rp.err.year": "กรุณากรอกปีเกิด 4 หลัก (รองรับ ค.ศ. 1900–2100)", "rp.err.date": "วันที่นี้ไม่มีในปฏิทิน กรุณาตรวจวันและเดือน" });

  function setType(t) {
    st.type = t;
    doc.querySelectorAll("[data-rp-type]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-rp-type") === t)); });
    $("rpPersonB").hidden = t !== "report_compat";
    $("rpYearRow").hidden = t !== "report_annual";
    $("rpLegendA").textContent = t === "report_compat" ? T("rp.f.personA", "คุณ (ฝ่ายแรก)") : T("rp.f.birth", "วันเกิด");
    renderGate();
  }

  /* ---------------- mode / credits / gate ---------------- */
  function renderGate() {
    var g = $("rpGate"); g.textContent = "";
    var m = M(), signed = !!(m && m.signedIn && m.signedIn());
    var c = st.credits ? st.credits[st.type] : null;
    $("rpMode").textContent = st.mode === "sample" ? T("rp.mode.sample", "โหมดตัวอย่าง: ยังไม่เปิดขายรายงาน หน้านี้สร้างรายงานฉบับเต็มในเครื่องให้ดูเป็นตัวอย่างได้ฟรี ไม่มีการชำระเงิน และไม่บันทึกข้อมูลใด")
      : st.mode === "free" ? T("rp.mode.free", "ช่วงนี้ LENSIQ ใช้งานฟรี: สร้างรายงานได้โดยไม่ใช้เครดิต สมาชิกที่เข้าสู่ระบบจะได้รับการบันทึกรายงานไว้ในประวัติอัตโนมัติ")
      : T("rp.mode.paid", "รายงานฉบับนี้ใช้เครดิตรายงาน 1 ครั้ง (ตรวจสิทธิ์ที่เซิร์ฟเวอร์ก่อนแสดงผล) แล้วบันทึกไว้ในประวัติของบัญชีคุณ");
    doc.querySelectorAll("[data-rp-credit]").forEach(function (el) {
      var f = el.getAttribute("data-rp-credit"), n = st.credits ? st.credits[f] : null;
      el.textContent = st.mode === "paid" && n != null ? T("rp.credit.left", "เครดิตคงเหลือ {n}", { n: n }) : st.mode === "free" ? T("rp.credit.free", "ฟรีช่วงนี้") : T("rp.credit.sample", "ตัวอย่างฟรี");
    });
    var go = $("rpGo");
    go.disabled = false;
    if (st.mode === "paid" && !signed) {
      go.disabled = true;
      g.appendChild(h("p", { text: T("rp.gate.signin", "เข้าสู่ระบบเพื่อใช้สิทธิ์รายงานที่ซื้อไว้") }));
      var b = h("button", { type: "button", class: "btn primary", text: T("rp.gate.signinCta", "เข้าสู่ระบบด้วย Google") });
      b.addEventListener("click", function () { if (M()) M().signIn(); });
      g.appendChild(b);
    } else if (st.mode === "paid" && c != null && c < 1) {
      go.disabled = true;
      g.appendChild(h("p", null, T("rp.gate.none", "ยังไม่มีเครดิตของรายงานนี้") + " ", h("a", { href: "pricing.html", text: T("rp.gate.buy", "ดูราคารายงาน") })));
    } else if (st.mode === "free" && !signed && m && m.possible && m.possible()) {
      var b2 = h("button", { type: "button", class: "btn ghost", text: T("rp.gate.saveSignin", "เข้าสู่ระบบเพื่อบันทึกรายงานไว้ในบัญชี") });
      b2.addEventListener("click", function () { if (M()) M().signIn(); });
      g.appendChild(b2);
    }
  }
  function loadCredits() {
    var m = M();
    if (!m || !m.signedIn || !m.signedIn() || st.mode !== "paid") { st.credits = null; renderGate(); return; }
    var me = m.me() || {};
    st.credits = creditsOf(null, me.credits);
    renderGate();
    if (typeof m.entitlements === "function") m.entitlements().then(function (/** @type {any} */ r) { if (r && r.ok && r.j) { st.credits = creditsOf(r.j, me.credits); renderGate(); } });
  }
  function detectMode() {
    var a = A(), m = M();
    st.mode = modeOf(m && m.config ? m.config() : null, !!(a && a.enabled && a.enabled()));
    loadCredits();
  }

  /* ---------------- render ---------------- */
  function sectionsEl(list) {
    var f = doc.createDocumentFragment();
    list.forEach(function (/** @type {any} */ s) {
      var sec = h("section", { class: "rp-sec" });
      if (s.title) sec.appendChild(h("h4", { text: s.title }));
      s.paragraphs.forEach(function (/** @type {string} */ p) { sec.appendChild(h("p", { text: p })); });
      f.appendChild(sec);
    });
    return f;
  }
  function renderReport(rep) {
    var out = $("rpOut"); out.textContent = ""; out.hidden = false;
    out.setAttribute("lang", rep.lang === "zh" ? "zh-Hans" : rep.lang || "th");
    var head = h("header", { class: "rp-head" }, h("p", { class: "eyebrow", text: "LENSIQ" }), h("h2", { id: "rpOutH", tabindex: "-1", text: rep.title }));
    head.appendChild(h("p", { class: "rp-meta", text: T("rp.meta", "สร้างเมื่อ {d} · คำนวณในเครื่องจากตำรา ไม่ได้ใช้ผู้ช่วยเขียน", { d: new Date().toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }) }) }));
    if (st.mode === "sample") head.appendChild(h("p", { class: "rp-sample", role: "note", text: T("rp.sampleTag", "ตัวอย่างรายงาน (โหมดเดโม) — ไม่มีการชำระเงิน ไม่บันทึก") }));
    // personal cover line (name typed on this page only — never saved or sent) + table of contents
    var forName = String(($("rpName") && $("rpName").value) || "").trim().slice(0, 60);
    if (forName) head.appendChild(h("p", { class: "rp-for", text: T("rp.for", "จัดทำสำหรับ {name}", { name: forName }) }));
    out.appendChild(head);
    var toc = h("nav", { class: "rp-toc", "aria-label": T("rp.toc", "สารบัญ") }, h("p", { class: "rp-toch", text: T("rp.toc", "สารบัญ") }));
    var tl = h("ol");
    rep.parts.forEach(function (/** @type {any} */ p) { tl.appendChild(h("li", { text: p.title })); });
    if (rep.months) tl.appendChild(h("li", { text: T("rp.part.months", "รายเดือนตลอดปี") }));
    if (rep.plan30) tl.appendChild(h("li", { text: rep.plan30.title }));
    toc.appendChild(tl);
    if (rep.parts.length + (rep.months ? 1 : 0) + (rep.plan30 ? 1 : 0) > 2) out.appendChild(toc);
    if (rep.summary && rep.summary.lines && rep.summary.lines.length) {
      var sm = h("section", { class: "rp-summary" }, h("h3", { text: rep.summary.title || T("rp.summary", "สรุปสั้น") }));
      var ul = h("ul");
      rep.summary.lines.forEach(function (/** @type {any} */ l) { ul.appendChild(h("li", null, h("b", { text: l.k + " " }), l.t)); });
      sm.appendChild(ul); out.appendChild(sm);
    }
    rep.parts.forEach(function (/** @type {any} */ p) {
      var part = h("section", { class: "rp-part", "data-part": p.id }, h("h3", { text: p.title }));
      if (p.headline) part.appendChild(h("p", { class: "rp-headline", text: p.headline }));
      part.appendChild(sectionsEl(p.sections));
      out.appendChild(part);
    });
    if (rep.months) {
      var ms = h("section", { class: "rp-part rp-months", "data-part": "months" }, h("h3", { text: T("rp.part.months", "รายเดือนตลอดปี") }), h("p", { class: "rp-small", text: rep.monthNote }));
      var grid = h("ol", { class: "rp-mgrid" });
      rep.months.forEach(function (/** @type {any} */ x) {
        grid.appendChild(h("li", { class: "rp-month " + x.tone },
          h("p", { class: "rp-mlabel" }, h("b", { text: x.label }), " ", h("span", { lang: "zh-Hant", text: x.pillar })),
          h("p", { class: "rp-mtitle", text: x.title }), h("p", { text: x.text }), h("p", { class: "rp-tip", text: "→ " + x.tip }), x.fav ? h("p", { class: "rp-fav", text: x.fav }) : null));
      });
      ms.appendChild(grid); out.appendChild(ms);
    }
    if (rep.plan && rep.plan.items && rep.plan.items.length) {
      var pl = h("section", { class: "rp-plan" }, h("h3", { text: rep.plan.title || T("rp.plan", "แผนปรับ 3 ข้อ") }));
      var ol = h("ol");
      rep.plan.items.forEach(function (/** @type {any} */ x) { ol.appendChild(h("li", null, h("b", { text: x.for + " " }), x.t)); });
      pl.appendChild(ol); out.appendChild(pl);
    }
    if (rep.plan30 && rep.plan30.weeks) {
      var p30 = h("section", { class: "rp-plan rp-plan30", "data-part": "plan30" }, h("h3", { text: rep.plan30.title }), h("p", { class: "rp-small", text: rep.plan30.note }));
      var wl = h("ol", { class: "rp-weeks" });
      rep.plan30.weeks.forEach(function (/** @type {any} */ w) {
        var li = h("li", { class: "rp-week" }, h("p", { class: "rp-wlabel", text: w.label }));
        var ul2 = h("ul");
        w.items.forEach(function (/** @type {any} */ x) { ul2.appendChild(h("li", null, x.for ? h("b", { text: x.for + " " }) : null, x.t)); });
        li.appendChild(ul2); wl.appendChild(li);
      });
      p30.appendChild(wl); out.appendChild(p30);
    }
    if (rep.reminder) out.appendChild(h("p", { class: "rp-reminder", role: "note", text: rep.reminder }));
    out.appendChild(h("p", { class: "rp-small", text: T("rp.disclaimer", "เพื่อความบันเทิงตามความเชื่อ ไม่ใช่การพยากรณ์ทางวิทยาศาสตร์ ไม่ใช่คำแนะนำทางการแพทย์ การเงิน หรือการจ้างงาน") }));
    var act = h("div", { class: "rp-actions no-print" });
    var pr = h("button", { type: "button", class: "btn primary", id: "rpPrint", text: T("rp.print", "พิมพ์ / บันทึกเป็น PDF") });
    pr.addEventListener("click", function () { root.print(); });
    act.appendChild(pr);
    if (st.saveable) {
      var sv = h("button", { type: "button", class: "btn ghost", id: "rpSave", hidden: true, text: T("rp.saveRetry", "ลองบันทึกอีกครั้ง") });
      sv.addEventListener("click", function () { save(rep); });
      act.appendChild(sv);
    }
    act.appendChild(h("a", { class: "btn ghost", href: "account.html#history", text: T("rp.toHistory", "ประวัติของฉัน") }));
    out.appendChild(act);
    out.appendChild(h("p", { class: "rp-small no-print", id: "rpSaveMsg", role: "status", "aria-live": "polite" }));
    try { $("rpOutH").focus(); } catch (e) { /* ignore */ }
  }
  function save(rep) {
    var m = M(), msg = $("rpSaveMsg"), btn = $("rpSave");
    if (!m || !m.signedIn() || typeof m.save !== "function") return;
    var s = toSaved(rep);
    if (msg) msg.textContent = T("rp.saving", "กำลังบันทึกไว้ในประวัติ…");
    m.save(DOMAIN[rep.kind], rep.title, s.data).then(function (/** @type {any} */ r) {
      if (r && r.ok) { st.saved = r.j && r.j.id; if (btn) btn.hidden = true; if (msg) msg.textContent = s.trimmed ? T("rp.savedTrim", "บันทึกไว้ในประวัติแล้ว (ฉบับย่อให้พอดีพื้นที่ — พิมพ์ / PDF ได้ฉบับเต็ม)") : T("rp.saved", "บันทึกไว้ในประวัติของบัญชีแล้ว"); return; }
      if (btn) btn.hidden = false;
      if (msg) msg.textContent = r && r.j && r.j.code === "saved_full" ? T("rp.saveFull", "ประวัติเต็มแล้ว ลบรายการเก่าที่หน้าบัญชีของฉันแล้วกดลองบันทึกอีกครั้ง (เครดิตไม่ถูกหักซ้ำ)") : T("rp.saveFail", "บันทึกไม่สำเร็จ กดลองอีกครั้ง (เครดิตไม่ถูกหักซ้ำ) หรือพิมพ์ / บันทึกเป็น PDF ไว้ก่อน");
    });
  }

  function build() {
    var a = readBirth("rpA");
    if (a.err) return { err: a.err };
    var o = { lang: lang(), t: T, monthName: monthName };
    if (st.type === "report_compat") { var b = readBirth("rpB"); if (b.err) return { err: b.err }; return { rep: buildCompat(a, b, o) }; }
    if (st.type === "report_annual") return { rep: buildAnnual(a, +$("rpYear").value || new Date().getFullYear(), o) };    return { rep: buildBasic(a, o) };
  }
  $("rpForm").addEventListener("submit", function (/** @type {Event} */ e) {
    e.preventDefault();
    var msg = $("rpMsg"); msg.textContent = "";
    var r;
    try { r = build(); } catch (err) { msg.textContent = T("rp.err.build", "สร้างรายงานไม่สำเร็จ กรุณาลองใหม่ (ไม่มีการใช้เครดิต)"); return; }
    if (r.err) { msg.textContent = T(r.err, ERR[r.err] || ERR["rp.err.date"]); return; }
    var m = M(), signed = !!(m && m.signedIn && m.signedIn());
    st.saveable = signed && st.mode !== "sample";
    if (st.mode !== "paid") { st.last = r.rep; renderReport(r.rep); if (st.saveable) save(r.rep); return; }
    // paid: the server takes one credit first; the report is shown only when it says allowed
    if (!m || !signed || typeof m.useEntitlement !== "function") { msg.textContent = T("rp.gate.signin", "เข้าสู่ระบบเพื่อใช้สิทธิ์รายงานที่ซื้อไว้"); if (m && typeof m.signIn === "function") m.signIn(); return; }
    var go = $("rpGo"); go.disabled = true;
    msg.textContent = T("rp.checking", "กำลังตรวจสิทธิ์…");
    m.useEntitlement(st.type).then(function (/** @type {any} */ x) {
      go.disabled = false;
      if (!x || !x.ok || !x.j || !x.j.allowed) {
        msg.textContent = x && x.status === 429 ? T("rp.err.busy", "ตรวจสิทธิ์บ่อยเกินไป กรุณาลองใหม่ภายหลัง") : x && x.ok && x.j && x.j.allowed === false ? T("rp.gate.none", "ยังไม่มีเครดิตของรายงานนี้") : T("rp.err.check", "ตรวจสิทธิ์ไม่สำเร็จ ไม่มีการใช้เครดิต กรุณาลองใหม่");
        loadCredits();
        return;
      }
      msg.textContent = "";
      st.last = r.rep;
      renderReport(r.rep);
      save(r.rep);
      if (typeof m.refresh === "function") m.refresh(); // the account chip / account page see the new balance (lq-member -> loadCredits)
      loadCredits();
    });
  });
  doc.querySelectorAll("[data-rp-type]").forEach(function (b) { b.addEventListener("click", function () { setType(String(b.getAttribute("data-rp-type"))); }); });
  ["rpA", "rpB"].forEach(function (p) {
    var nt = $(p + "NoTime");
    if (nt) nt.addEventListener("change", function () { $(p + "Time").disabled = nt.checked; });
  });

  // Thai readers type the Buddhist-era year by default; English / 中文 readers the Common Era (until they choose)
  var eraTouched = false;
  doc.querySelectorAll('input[name$="Era"]').forEach(function (r) { r.addEventListener("change", function () { eraTouched = true; }); });
  function eraDefault() {
    if (eraTouched) return;
    var v = lang() === "th" ? "be" : "ce";
    doc.querySelectorAll('input[name$="Era"][value="' + v + '"]').forEach(function (r) { /** @type {HTMLInputElement} */ (r).checked = true; });
  }
  fillSelects();
  eraDefault();
  setType(st.type);
  detectMode();
  W.addEventListener("lq-member-ready", detectMode);
  W.addEventListener("lq-member", detectMode);
  W.addEventListener("lq-lang", function () {
    fillSelects(); eraDefault(); setType(st.type);
    // re-compose an on-screen report in the new language (same input, same seed); nothing is charged again
    if (st.last && !$("rpOut").hidden) { var r = build(); if (r.rep) { st.last = r.rep; renderReport(r.rep); } }
  });
  W.__rp = { state: st, build: build };
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
