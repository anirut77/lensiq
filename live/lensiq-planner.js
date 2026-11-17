/* lensiq-planner.js — ฤกษ์มงคล (ขึ้นบ้านใหม่ / เปิดร้าน / เริ่มงาน) — pure logic, testable in Node.
 *
 *   LQPlanner.lunarDay(y, m, d)  -> {waxing, day 1–15, month 1–12, leap, phra, approx:true}
 *   LQPlanner.plan(opts)         -> good candidate days only, each with the reasons ("basis") that made it a candidate
 *   LQPlanner.ics(days, opts)    -> iCalendar text (RFC 5545) for the days the user ticked
 *
 * Reuses horoscope.js (HSCore): Julian day, new-moon search (Meeus ch. 49), the shared Thai lunar-month rule
 * (thaiLunarMonth — the same function the horoscope / taksa / lek7 pages use), taksa (ทักษาปกรณ์), Chinese day pillar.
 *
 * Rules (round-14 spec S2-E2, fortune hard bans):
 *   - GOOD DAYS ONLY. A day that does not qualify is simply not listed: there is no "bad day" label, no warning of bad
 *     luck, illness, accident, death, disaster or infidelity, no lottery numbers and no paid remedies.
 *   - Every candidate shows its basis: weekday (and its colour), lunar phase (ข้างขึ้น), lunar month, the owners' birth
 *     weekday (taksa position of that weekday) and, if given, the owners' zodiac year vs the day's Chinese branch.
 *   - Lunar day is APPROXIMATE (±1 day): the official Thai calendar is arithmetic (ปักขคณนา / สุริยยาตร); here
 *     ขึ้น 15 ค่ำ = the Bangkok date of (astronomical full moon − 12 h). Checked against the announced Buddhist holidays
 *     (tests/unit/planner.test.js) — the page tells the user to confirm with a Thai calendar.
 *   - Nothing is stored or sent: birth weekday / zodiac year are used in memory only.
 * For cultural planning, not a guarantee. */
(function (root) {
  "use strict";
  var HS = root.HSCore || (typeof require === "function" ? (function () { try { var hsPath = "./horoscope.js"; return require(hsPath); } catch (e) { return null; } })() : null);

  var D2R = Math.PI / 180, sin = function (d) { return Math.sin(d * D2R); };
  var pad2 = function (n) { return String(n).padStart(2, "0"); };
  var EVENTS = ["move", "shop", "work"];

  /* ---------------- ปฏิทินจันทรคติ (โดยประมาณ) ---------------- */
  /** จันทร์เพ็ญหลังจันทร์ดับลำดับ k (Meeus บทที่ 49 เฟส 0.5 พจน์หลัก) → JD (UT) — same terms as horoscope.js fullMoonOf (not exported there) */
  function fullMoonOf(k) {
    var kk = k + 0.5, T = kk / 1236.85, T2 = T * T, E = 1 - 0.002516 * T - 0.0000074 * T2;
    var M = 2.5534 + 29.1053567 * kk, Mp = 201.5643 + 385.81693528 * kk + 0.0107582 * T2, F = 160.7108 + 390.67050284 * kk - 0.0016118 * T2, Om = 124.7746 - 1.56375588 * kk;
    var jde = 2451550.09766 + 29.530588861 * kk + 0.00015437 * T2;
    jde += -0.40614 * sin(Mp) + 0.17302 * E * sin(M) + 0.01614 * sin(2 * Mp) + 0.01043 * sin(2 * F) + 0.00734 * E * sin(Mp - M) - 0.00515 * E * sin(Mp + M)
      + 0.00209 * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp)
      + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F) - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om);
    return HS.utFromTT(jde);
  }
  /** JDN of the Bangkok (UTC+7) calendar date of an instant */
  function bkkDay(jdUT) { var f = HS.fromJD(jdUT + 7 / 24); return HS.jdn(f.y, f.m, f.d); }
  /** JDN of "ขึ้น 15 ค่ำ" of lunation k (approximate: Bangkok date of full moon − 12 h) */
  function day15(k) { return bkkDay(fullMoonOf(k) - 0.5); }

  /** ข้างขึ้น/ข้างแรม ค่ำที่ เดือนจันทรคติ ของวันที่ (ค.ศ.) — approximate, ±1 day */
  function lunarDay(y, m, d) {
    var D = HS.jdn(y, m, d);
    var k = HS.newMoonBefore(HS.julianDay(y, m, d, 12) - 7 / 24).k;
    // waxing = D within the 15 days ending on some lunation's "ขึ้น 15"; otherwise waning after the latest one before D
    var kRef = null, waxing = false, day = 0, kk, p;
    for (kk = k - 1; kk <= k + 1; kk++) { p = day15(kk); if (D <= p && D >= p - 14) { kRef = kk; waxing = true; day = 15 - (p - D); break; } }
    if (kRef === null) {
      for (kk = k + 1; kk >= k - 1; kk--) { p = day15(kk); if (p < D) { kRef = kk; day = Math.min(15, D - p); break; } }
    }
    var lm = HS.thaiLunarMonth(fullMoonOf(kRef));
    // วันพระ: ขึ้น 8, ขึ้น 15, แรม 8, วันสุดท้ายของข้างแรม (แรม 14 หรือ 15)
    var lastWaning = !waxing && D + 1 === day15(kRef + 1) - 14;
    var phra = (waxing && (day === 8 || day === 15)) || (!waxing && (day === 8 || lastWaning));
    return { waxing: waxing, day: day, month: lm.month, leap: !!lm.leap, firstEight: !!lm.firstEight, phra: phra, approx: true };
  }

  /* ---------------- เกณฑ์ (เฉพาะด้านดี) ---------------- */
  // ภูมิทักษาที่นับเป็น "วันดี" ของเจ้าของ (กาลกิณีไม่แสดงเลย ไม่เตือน)
  var BHUMI_PTS = { sri: 2, dech: 2, montri: 2, mula: 2 };
  // ภูมิที่ตรงกับงานแต่ละแบบ: +1 (ภูมิหลัก) และภูมิเสริมที่ปกติเป็นกลาง แต่เข้ากับงานนั้น
  var EVENT_STAR = { move: "mula", shop: "sri", work: "dech" };
  var EVENT_EXTRA = { move: "ayu", shop: "boriwan", work: "utsaha" };
  // วันที่นิยมตามความเชื่อทั่วไป (ตำราต่างกัน) — 0 อาทิตย์ … 6 เสาร์
  var EVENT_DAYS = { move: [1, 3, 4, 5], shop: [0, 3, 4, 5], work: [1, 3, 4] };
  var MIN_SCORE = 3;

  // Thai wording (EN/ZH: i18n/en-planner.js, zh-planner.js under the same keys "pl.r.<id>")
  var TH = {
    "waxing": "ข้างขึ้น {d} ค่ำ: จันทร์กำลังสว่างขึ้น ตามความเชื่อเป็นช่วงเจริญงอกงาม นิยมใช้เริ่มสิ่งใหม่",
    "full": "ขึ้น 15 ค่ำ: จันทร์เต็มดวง หมายถึงความเต็มเปี่ยมสมบูรณ์",
    "evenMonth": "เดือน {m} เป็นเดือนคู่: ตำราขึ้นบ้านใหม่หลายสายนิยมเดือนคู่",
    "wd.move.1": "วันจันทร์: ดาวจันทร์ ความร่มเย็นและความอบอุ่นในบ้าน นิยมใช้ขึ้นบ้านใหม่",
    "wd.move.3": "วันพุธ: ดาวพุธ ความราบรื่นและการติดต่อสื่อสาร นิยมใช้ขึ้นบ้านใหม่",
    "wd.move.4": "วันพฤหัสบดี: ดาวพฤหัสบดี ครูและความเจริญมั่นคง นิยมใช้ขึ้นบ้านใหม่",
    "wd.move.5": "วันศุกร์: ดาวศุกร์ ความสุขและความรักในครอบครัว นิยมใช้ขึ้นบ้านใหม่",
    "wd.shop.0": "วันอาทิตย์: ดาวอาทิตย์ ชื่อเสียงและความโดดเด่น นิยมใช้เปิดกิจการ",
    "wd.shop.3": "วันพุธ: ดาวพุธ การค้าและการเจรจา นิยมใช้เปิดร้าน",
    "wd.shop.4": "วันพฤหัสบดี: ดาวพฤหัสบดี ความเจริญและผู้ใหญ่อุปถัมภ์ นิยมใช้เปิดกิจการ",
    "wd.shop.5": "วันศุกร์: ดาวศุกร์ โชคลาภและเสน่ห์ต่อลูกค้า นิยมใช้เปิดร้าน",
    "wd.work.1": "วันจันทร์: ดาวจันทร์ เสน่ห์และความเป็นมิตรกับคนรอบตัว นิยมใช้เริ่มงานใหม่",
    "wd.work.3": "วันพุธ: ดาวพุธ การสื่อสารและการเรียนรู้ นิยมใช้เริ่มงานใหม่",
    "wd.work.4": "วันพฤหัสบดี: วันครู ความเจริญก้าวหน้า นิยมใช้เริ่มงานหรือเริ่มเรียน",
    "bh.sri": "เจ้าของคนที่ {n} (เกิด{birth}): วัน{day}ตกภูมิศรี เสริมโชคลาภ เงินทอง และเสน่ห์",
    "bh.dech": "เจ้าของคนที่ {n} (เกิด{birth}): วัน{day}ตกภูมิเดช เสริมการงานและความน่าเชื่อถือ",
    "bh.montri": "เจ้าของคนที่ {n} (เกิด{birth}): วัน{day}ตกภูมิมนตรี มีผู้ใหญ่และคนรอบตัวสนับสนุน",
    "bh.mula": "เจ้าของคนที่ {n} (เกิด{birth}): วัน{day}ตกภูมิมูละ เสริมหลักฐานและความมั่นคง",
    "bh.ayu": "เจ้าของคนที่ {n} (เกิด{birth}): วัน{day}ตกภูมิอายุ บ้านสดชื่น อยู่สบายใจ",
    "bh.boriwan": "เจ้าของคนที่ {n} (เกิด{birth}): วัน{day}ตกภูมิบริวาร เสริมทีมงานและลูกค้าประจำ",
    "bh.utsaha": "เจ้าของคนที่ {n} (เกิด{birth}): วัน{day}ตกภูมิอุตสาหะ เสริมความขยันและพลังทำงาน",
    "star": "ภูมิ{bhumi}ตรงกับงาน{event}โดยตรง",
    "zHarmony": "เจ้าของคนที่ {n} (ปี{animal}): วันนักษัตร{dayAnimal}เป็นคู่หกประสาน (六合) กับปีเกิด ตามปฏิทินจีน",
    "zTrine": "เจ้าของคนที่ {n} (ปี{animal}): วันนักษัตร{dayAnimal}อยู่กลุ่มสามประสาน (三合) เดียวกับปีเกิด ตามปฏิทินจีน",
    "zSame": "เจ้าของคนที่ {n} (ปี{animal}): วันนักษัตรเดียวกับปีเกิด ตามปฏิทินจีน",
    "phra": "วันพระ: นิยมทำบุญตักบาตรควบคู่ หากจะนิมนต์พระควรติดต่อวัดล่วงหน้า"
  };

  /** weekday 0..6 (อาทิตย์ = 0) */
  function weekday(y, m, d) { return HS.weekday(y, m, d); }

  /**
   * @param {{event:string, from:{y:number,m:number,d:number}, to:{y:number,m:number,d:number},
   *          owners?:Array<{planet:number, animal?:number|null}>, min?:number}} o
   *   planet 0..7 = birth weekday (7 = พุธกลางคืน/ราหู); animal 0..11 = ปีนักษัตร (ชวด = 0), optional
   * @returns {Array<{y:number,m:number,d:number,wd:number,lunar:object,score:number,reasons:Array<{id:string,v:object}>,colour:{day:number,lucky:number}}>}
   */
  function plan(o) {
    var ev = EVENTS.indexOf(o.event) >= 0 ? o.event : "move";
    var owners = (o.owners || []).filter(function (w) { return w && w.planet >= 0 && w.planet <= 7; }).slice(0, 3);
    var a = HS.jdn(o.from.y, o.from.m, o.from.d), b = HS.jdn(o.to.y, o.to.m, o.to.d);
    if (b < a) { var t = a; a = b; b = t; }
    b = Math.min(b, a + 400); // at most ~13 months per run
    var min = o.min == null ? MIN_SCORE : o.min, out = [];
    for (var j = a; j <= b; j++) {
      var dt = HS.fromJD(j), y = dt.y, m = dt.m, d = dt.d, wd = weekday(y, m, d);
      var L = lunarDay(y, m, d), score = 0, reasons = [], skip = false;
      if (L.waxing) { score += 2; reasons.push({ id: L.day === 15 ? "full" : "waxing", v: { d: L.day } }); }
      if (EVENT_DAYS[ev].indexOf(wd) >= 0) { score += 1; reasons.push({ id: "wd." + ev + "." + wd, v: {} }); }
      if (ev === "move" && L.month % 2 === 0) { score += 1; reasons.push({ id: "evenMonth", v: { m: L.month } }); }
      var branch = HS.dayPillarJDN(j).branch;
      owners.forEach(function (w, i) {
        var bh = HS.bhumiOf(w.planet, wd);
        if (bh === "kalakini") { skip = true; return; } // not listed — never shown as a warning
        var pts = BHUMI_PTS[bh] || (EVENT_EXTRA[ev] === bh ? 1 : 0);
        if (pts) {
          if (EVENT_STAR[ev] === bh) pts += 1;
          score += pts; reasons.push({ id: "bh." + bh, v: { n: i + 1, planet: w.planet, wd: wd, bhumi: bh, star: EVENT_STAR[ev] === bh } });
        }
        if (w.animal != null && w.animal >= 0 && w.animal <= 11) {
          var rel = HS.branchRel(w.animal, branch);
          if (rel === "clash") { skip = true; return; } // not listed, no warning
          var zid = { harmony: "zHarmony", trine: "zTrine", same: "zSame" }[rel];
          if (zid) { score += 1; reasons.push({ id: zid, v: { n: i + 1, animal: w.animal, dayAnimal: branch } }); }
        }
      });
      if (skip || score < min) continue;
      if (L.phra) reasons.push({ id: "phra", v: {}, note: true });
      out.push({ y: y, m: m, d: d, wd: wd, lunar: L, score: score, reasons: reasons, colour: { day: wd, lucky: HS.taksa(wd).sri } });
    }
    return out;
  }

  /** maximum score a day can reach for this event / owners (used for the "matches n of N" label) */
  function maxScore(o) {
    var owners = (o.owners || []).filter(function (w) { return w && w.planet >= 0 && w.planet <= 7; });
    return 3 + (o.event === "move" ? 1 : 0) + owners.reduce(function (s, w) { return s + 3 + (w.animal != null && w.animal >= 0 ? 1 : 0); }, 0);
  }

  /* ---------------- iCalendar ---------------- */
  var icsEsc = function (s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); };
  var utf8Len = function (ch) { var c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; };
  /** RFC 5545 §3.1: fold lines longer than 75 octets (never inside a UTF-8 sequence) */
  function fold(line) {
    var out = [], cur = "", n = 0, lim = 75;
    for (var ch of line) {
      var l = utf8Len(ch);
      if (n + l > lim) { out.push(cur); cur = " "; n = 1; lim = 75; }
      cur += ch; n += l;
    }
    out.push(cur);
    return out.join("\r\n");
  }
  var ymd = function (x) { return x.y + pad2(x.m) + pad2(x.d); };
  /**
   * @param {Array<{y:number,m:number,d:number,title:string,desc?:string}>} days
   * @param {{time?:string|null, stamp?:Date, uidHost?:string}} [opts] time "HH:MM" Bangkok time (1 h event), else all-day
   */
  function ics(days, opts) {
    opts = opts || {};
    var now = opts.stamp || new Date();
    var stamp = now.getUTCFullYear() + pad2(now.getUTCMonth() + 1) + pad2(now.getUTCDate()) + "T" + pad2(now.getUTCHours()) + pad2(now.getUTCMinutes()) + pad2(now.getUTCSeconds()) + "Z";
    var tm = /^(\d{1,2}):(\d{2})$/.exec(opts.time || "");
    var L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LENSIQ//Auspicious date planner//TH", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    days.forEach(function (x, i) {
      L.push("BEGIN:VEVENT", "UID:" + ymd(x) + "-" + i + "-" + stamp + "@" + (opts.uidHost || "lensiq.local"), "DTSTAMP:" + stamp);
      if (tm) {
        // Asia/Bangkok has no DST: convert to UTC so every calendar app reads it the same way
        var h = +tm[1], mi = +tm[2], j = HS.julianDay(x.y, x.m, x.d, h + mi / 60) - 7 / 24, s = HS.fromJD(j), e = HS.fromJD(j + 1 / 24);
        var z = function (q) { return q.y + pad2(q.m) + pad2(q.d) + "T" + pad2(q.h) + pad2(q.mi) + "00Z"; };
        L.push("DTSTART:" + z(s), "DTEND:" + z(e));
      } else {
        var nx = HS.fromJD(HS.jdn(x.y, x.m, x.d) + 1);
        L.push("DTSTART;VALUE=DATE:" + ymd(x), "DTEND;VALUE=DATE:" + ymd(nx), "TRANSP:TRANSPARENT");
      }
      L.push("SUMMARY:" + icsEsc(x.title));
      if (x.desc) L.push("DESCRIPTION:" + icsEsc(x.desc));
      L.push("END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return L.map(fold).join("\r\n") + "\r\n";
  }

  var API = { EVENTS: EVENTS, TH: TH, MIN_SCORE: MIN_SCORE, EVENT_DAYS: EVENT_DAYS, EVENT_STAR: EVENT_STAR, fullMoonOf: fullMoonOf,
    lunarDay: lunarDay, plan: plan, maxScore: maxScore, ics: ics, fold: fold, weekday: weekday };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.LQPlanner = API;
})(typeof window !== "undefined" ? window : globalThis);
