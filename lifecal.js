/* lifecal.js — ปฏิทินและการคำนวณดวงชะตาของ LENSIQ (ทำงานในเครื่องล้วน ทดสอบได้ใน Node)
 *
 *  ดาราศาสตร์ (Meeus, Astronomical Algorithms ฉบับย่อ):
 *    sunLongitude(jd)        ลองจิจูดปรากฏของดวงอาทิตย์ (องศา) จาก HSCore (VSOP87 แบบย่อ) เวลาสารทคลาดไม่เกินราว 1 นาที
 *    solarTermJD(year, lon)  เวลาที่ดวงอาทิตย์อยู่ที่ลองจิจูด lon ในปีนั้น (สารท 24 ฤดู / 二十四节气)
 *    newMoonJD(k)            จันทร์ดับลำดับที่ k (นับจาก 6 ม.ค. 2000) ความคลาดเคลื่อนไม่กี่ชั่วโมง
 *  八字 Four Pillars:  bazi({y,m,d,h,mi,tz,gender})  ปีเปลี่ยนที่ลี่ชุน (立春 ลองจิจูด 315°) เดือนเปลี่ยนที่ "เจี๋ย" 12 สารท
 *    วันใช้รอบ 60 จาก Julian Day Number (ตรวจกับ 1 ม.ค. 2000 = 戊午) ยามจื่อ (23:00) นับเป็นวันถัดไป
 *    大运 วัยจร 10 ปี: ทิศเดินตามเพศและหยินหยางของก้านปี อายุเริ่ม = จำนวนวันถึงเจี๋ยถัดไป/ก่อนหน้า ÷ 3
 *  ทักษา:  taksa({y,m,d,h,mi})  ดาวประจำวันเกิด (พุธกลางคืนหลัง 18:00 = ราหู, วันไทยเปลี่ยนตอน 06:00) ภูมิทั้ง 8 และมหาทักษา 108 ปี
 *  เลข 7 ตัว 9 ฐาน:  lek7(...)  ฐานวัน เดือน (จันทรคติไทย โดยประมาณ) ปีนักษัตร และฐานรวม (ฐาน 1–4)
 *  ตะวันตก: progressedSunChanges(birth) อายุที่ดวงอาทิตย์จร (secondary progression) เปลี่ยนราศี และรอบดาวเสาร์คืนตำแหน่ง (Saturn return) โดยประมาณ
 *  เพื่อความบันเทิงตามความเชื่อ ไม่ใช่การพยากรณ์ทางวิทยาศาสตร์ */
(function (root) {
  "use strict";
  var D2R = Math.PI / 180;
  var norm = function (x) { x %= 360; return x < 0 ? x + 360 : x; };
  var mod = function (a, n) { return ((a % n) + n) % n; };

  /* ---------- Julian Day ---------- */
  function jdn(y, m, d) { // Gregorian civil date → Julian Day Number (เที่ยงวัน)
    var a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
    return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  }
  function jd(y, m, d, h, mi, tz) { return jdn(y, m, d) - 0.5 + ((h || 0) + (mi || 0) / 60 - (tz || 0)) / 24; } // UT
  function fromJD(J, tz) { // → {y,m,d,h,mi} ตามเวลาท้องถิ่น tz
    var z = J + 0.5 + (tz || 0) / 24, Z = Math.floor(z), F = z - Z, A = Z;
    if (Z >= 2299161) { var al = Math.floor((Z - 1867216.25) / 36524.25); A = Z + 1 + al - Math.floor(al / 4); }
    var B = A + 1524, C = Math.floor((B - 122.1) / 365.25), Dd = Math.floor(365.25 * C), E = Math.floor((B - Dd) / 30.6001);
    var day = B - Dd - Math.floor(30.6001 * E), m = E < 14 ? E - 1 : E - 13, y = m > 2 ? C - 4716 : C - 4715;
    var mins = Math.round(F * 1440); if (mins >= 1440) { mins -= 1440; var t = fromJD(J + 1 / 1440, tz); return t; }
    return { y: y, m: m, d: day, h: Math.floor(mins / 60), mi: mins % 60 };
  }
  var DT = 69 / 86400; // ΔT สำรอง ≈ 69 วินาที (ใช้เมื่อไม่มี horoscope.js)
  // ใช้ตำแหน่งดวงอาทิตย์ชุดเดียวกับ horoscope.js (VSOP87 แบบย่อ + นิวเทชัน + ความคลาดของแสง, ΔT ตามปี) ให้ทุกหน้าได้เวลาสารทตรงกัน
  var HSC = root.HSCore || (typeof require === "function" ? (function () { try { return require("./horoscope.js"); } catch (e) { return null; } })() : null);

  /* ---------- ดวงอาทิตย์ ---------- */
  function sunLongitude(J) { // J = JD (UT)
    var H = HSC || root.HSCore;
    if (H && H.ttFromUT && H.sunLongitude) return H.sunLongitude(H.ttFromUT(J));
    var T = (J + DT - 2451545) / 36525; // สำรอง: Meeus บทที่ 25 แบบความแม่นยำต่ำ
    var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    var M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * D2R;
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
    var om = (125.04 - 1934.136 * T) * D2R;
    return norm(L0 + C - 0.00569 - 0.00478 * Math.sin(om));
  }
  /** เวลา (JD, UT) ที่ดวงอาทิตย์อยู่ที่ลองจิจูด lon ใกล้กับ J0 */
  function sunAt(lon, J0) {
    var J = J0;
    for (var i = 0; i < 12; i++) { var dl = norm(lon - sunLongitude(J) + 180) - 180; J += dl / 360 * 365.2422; if (Math.abs(dl) < 1e-6) break; }
    return J;
  }
  /** สารทในปีปฏิทิน y ที่ลองจิจูด lon (เช่น 315 = ลี่ชุน ราว 4 ก.พ.) */
  function solarTermJD(y, lon) {
    var guess = jd(y, 3, 21, 0, 0, 0) + norm(lon) / 360 * 365.2422; // วสันตวิษุวัต (0°) ≈ 21 มี.ค.
    var J = sunAt(lon, guess);
    // ให้อยู่ในปีปฏิทินเดียวกัน
    var t = fromJD(J, 0); if (t.y > y) J = sunAt(lon, J - 365.2422); else if (t.y < y) J = sunAt(lon, J + 365.2422);
    return J;
  }
  // เจี๋ย 12 สารทที่เริ่มเดือนจีน: 立春315 惊蛰345 清明15 立夏45 芒种75 小暑105 立秋135 白露165 寒露195 立冬225 大雪255 小寒285
  var JIE = [315, 345, 15, 45, 75, 105, 135, 165, 195, 225, 255, 285];
  var jieLon = function (idx) { return JIE[mod(idx, 12)]; };
  var JIE_ZH = ["立春", "惊蛰", "清明", "立夏", "芒种", "小暑", "立秋", "白露", "寒露", "立冬", "大雪", "小寒"];
  /** เจี๋ยก่อนหน้า/ถัดไปของเวลา J → { prev:{jd, idx}, next:{jd, idx} } (idx 0 = 立春 = เดือนอิน 寅) */
  function jieAround(J) {
    var lon = sunLongitude(J), k = Math.floor(norm(lon - 315) / 30); // เดือนอินเริ่มที่ 315°
    var prevLon = norm(315 + 30 * k), nextLon = norm(prevLon + 30);
    var back = norm(lon - prevLon) / 360 * 365.2422, fwd = norm(nextLon - lon) / 360 * 365.2422;
    return { prev: { jd: sunAt(prevLon, J - back), idx: k }, next: { jd: sunAt(nextLon, J + fwd), idx: (k + 1) % 12 } };
  }

  /* ---------- ดวงจันทร์ (จันทร์ดับ — Meeus บทที่ 49 พจน์หลัก) ---------- */
  function newMoonJD(k) {
    var T = k / 1236.85, E = 1 - 0.002516 * T;
    var J = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T;
    var M = (2.5534 + 29.1053567 * k) * D2R, Mp = (201.5643 + 385.81693528 * k) * D2R, F = (160.7108 + 390.67050284 * k) * D2R, Om = (124.7746 - 1.56375588 * k) * D2R;
    J += -0.4072 * Math.sin(Mp) + 0.17241 * E * Math.sin(M) + 0.01608 * Math.sin(2 * Mp) + 0.01039 * Math.sin(2 * F) + 0.00739 * E * Math.sin(Mp - M)
      - 0.00514 * E * Math.sin(Mp + M) + 0.00208 * E * E * Math.sin(2 * M) - 0.00111 * Math.sin(Mp - 2 * F) - 0.00057 * Math.sin(Mp + 2 * F)
      + 0.00056 * E * Math.sin(2 * Mp + M) - 0.00042 * Math.sin(3 * Mp) + 0.00042 * E * Math.sin(M + 2 * F) - 0.00017 * Math.sin(Om);
    return J - DT;
  }
  /** จันทร์ดับล่าสุดก่อนหรือเท่ากับ J */
  function newMoonBefore(J) {
    var k = Math.floor((J - 2451550.09766) / 29.530588861) + 1;
    while (newMoonJD(k) > J) k--;
    return { k: k, jd: newMoonJD(k) };
  }

  /* ---------- 八字 ---------- */
  var STEMS = "甲乙丙丁戊己庚辛壬癸", BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
  var STEM_EL = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]; // 0 ไม้ 1 ไฟ 2 ดิน 3 ทอง 4 น้ำ
  var BRANCH_EL = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];
  // ก้านแฝงในกิ่ง (藏干): หลัก กลาง เศษ
  var HIDDEN = [[9], [5, 9, 7], [0, 2, 4], [1], [4, 1, 9], [2, 6, 4], [3, 5], [5, 3, 1], [6, 8, 4], [7], [4, 7, 3], [8, 0]];
  var HIDDEN_W = [1, 0.5, 0.3];
  var EL_KEYS = ["wood", "fire", "earth", "metal", "water"];
  var gen = function (e) { return (e + 1) % 5; };   // e ให้กำเนิด gen(e)
  var ctl = function (e) { return (e + 2) % 5; };   // e ข่ม ctl(e)
  var pillar = function (i60) { return { i: mod(i60, 60), stem: mod(i60, 10), branch: mod(i60, 12), zh: STEMS[mod(i60, 10)] + BRANCHES[mod(i60, 12)] }; };
  var cycleIndex = function (s, b) { for (var i = 0; i < 60; i++) if (i % 10 === s && i % 12 === b) return i; return -1; };
  /** ความสัมพันธ์สิบเทพ (十神) ของธาตุ e เทียบกับเจ้าชะตา dm (ระดับธาตุ) */
  function tenGod(dmEl, e) {
    if (e === dmEl) return "peer";        // 比劫
    if (e === gen(dmEl)) return "output"; // 食伤
    if (e === ctl(dmEl)) return "wealth"; // 财
    if (ctl(e) === dmEl) return "officer"; // 官杀
    return "resource";                     // 印
  }
  /** ถ้าไม่ทราบเวลาเกิด: วันนั้นมีลี่ชุน/เจี๋ยตกอยู่ระหว่างวันหรือไม่ (เสาปี/เสาเดือนจึงขึ้นกับเวลาเกิด)
      → null หรือ { year: bool (ลี่ชุน), month: bool, term: ชื่อจีนของสารท, idx, at: {y,m,d,h,mi} เวลาท้องถิ่น } */
  function pillarUnsure(y, m, d, tz) {
    var J0 = jd(y, m, d, 0, 0, tz), J1 = jd(y, m, d, 23, 59, tz);
    var a = jieAround(J0), b1 = jieAround(J1);
    if (a.prev.idx === b1.prev.idx) return null;
    var idx = b1.prev.idx, at = b1.prev.jd;
    return { year: idx === 0, month: true, term: JIE_ZH[idx], idx: idx, at: fromJD(at, tz) };
  }
  /* ---------- เขตเวลาตามประวัติ (IANA) และเวลาสุริยะจริง — รอบ 12 ----------
     เวลาเกิดเป็น "เวลานาฬิกาท้องถิ่น" ของวันนั้น: ไทยก่อน 1 เม.ย. 1920 ใช้เวลาเฉลี่ยกรุงเทพฯ (UTC+6:42:04),
     จีนแผ่นดินใหญ่มีเวลาออมแสง 1986–1991, สิงคโปร์/มาเลเซียใช้ UTC+7:30 ก่อนปี 1982 ฯลฯ
     zoneOffset ใช้ฐานข้อมูลเขตเวลาของเบราว์เซอร์ (Intl) ถ้าไม่มีใช้ตารางสำรองด้านล่าง (เฉพาะกฎที่ผู้ประเมินระบุ) */
  var ZONES = [
    { id: "Asia/Bangkok", lon: 100.5, key: "lc.zone.bkk", th: "ไทย · กรุงเทพฯ (ตามประวัติ)" },
    { id: "Asia/Shanghai", lon: 116.4, key: "lc.zone.sha", th: "จีนแผ่นดินใหญ่ · ปักกิ่ง (ตามประวัติ)" },
    { id: "Asia/Hong_Kong", lon: 114.2, key: "lc.zone.hkg", th: "ฮ่องกง (ตามประวัติ)" },
    { id: "Asia/Taipei", lon: 121.5, key: "lc.zone.tpe", th: "ไต้หวัน · ไทเป (ตามประวัติ)" },
    { id: "Asia/Singapore", lon: 103.8, key: "lc.zone.sin", th: "สิงคโปร์ (ตามประวัติ)" },
    { id: "Asia/Kuala_Lumpur", lon: 101.7, key: "lc.zone.kul", th: "มาเลเซีย · กัวลาลัมเปอร์ (ตามประวัติ)" },
    { id: "Asia/Ho_Chi_Minh", lon: 106.7, key: "lc.zone.sgn", th: "เวียดนาม · โฮจิมินห์ (ตามประวัติ)" },
    { id: "Asia/Jakarta", lon: 106.8, key: "lc.zone.jkt", th: "อินโดนีเซีย · จาการ์ตา (ตามประวัติ)" },
    { id: "Asia/Manila", lon: 121.0, key: "lc.zone.mnl", th: "ฟิลิปปินส์ · มะนิลา (ตามประวัติ)" },
    { id: "Asia/Yangon", lon: 96.2, key: "lc.zone.rgn", th: "เมียนมา · ย่างกุ้ง (ตามประวัติ)" },
    { id: "Asia/Tokyo", lon: 139.7, key: "lc.zone.tyo", th: "ญี่ปุ่น · โตเกียว (ตามประวัติ)" },
    { id: "Asia/Seoul", lon: 127.0, key: "lc.zone.sel", th: "เกาหลีใต้ · โซล (ตามประวัติ)" },
    { id: "Asia/Kolkata", lon: 77.2, key: "lc.zone.del", th: "อินเดีย · นิวเดลี (ตามประวัติ)" },
    { id: "Europe/London", lon: -0.1, key: "lc.zone.lon", th: "สหราชอาณาจักร · ลอนดอน (ตามประวัติ)" },
    { id: "America/New_York", lon: -74.0, key: "lc.zone.nyc", th: "สหรัฐฯ ตะวันออก · นิวยอร์ก (ตามประวัติ)" },
    { id: "America/Los_Angeles", lon: -118.2, key: "lc.zone.lax", th: "สหรัฐฯ ตะวันตก · ลอสแอนเจลิส (ตามประวัติ)" },
    { id: "Australia/Sydney", lon: 151.2, key: "lc.zone.syd", th: "ออสเตรเลีย · ซิดนีย์ (ตามประวัติ)" },
  ];
  // ตารางสำรอง: [จนถึง (UT, ms), offset ชั่วโมง] ตามลำดับเวลา; ช่วงออมแสงของจีนเป็น [เริ่ม, จบ] เวลาท้องถิ่น 02:00
  var U = function (y, m, d, h, mi) { return Date.UTC(y, m - 1, d, h || 0, mi || 0); };
  var FALLBACK = {
    "Asia/Bangkok": [[U(1920, 3, 31, 17, 17), 6 + 42 / 60 + 4 / 3600], [Infinity, 7]],
    "Asia/Singapore": [[U(1905, 5, 31, 17, 4), 6 + 55 / 60 + 25 / 3600], [U(1932, 12, 31, 17), 7], [U(1941, 8, 31, 16, 40), 7 + 20 / 60], [U(1942, 2, 15, 16, 30), 7.5], [U(1945, 9, 11, 15), 9], [U(1981, 12, 31, 16, 30), 7.5], [Infinity, 8]],
    "Asia/Shanghai": [[Infinity, 8]],
  };
  FALLBACK["Asia/Kuala_Lumpur"] = FALLBACK["Asia/Singapore"];
  var CN_DST = { 1986: [[5, 4], [9, 14]], 1987: [[4, 12], [9, 13]], 1988: [[4, 17], [9, 11]], 1989: [[4, 16], [9, 17]], 1990: [[4, 15], [9, 16]], 1991: [[4, 14], [9, 15]] };
  function fallbackOffset(zone, y, m, d, h, mi) {
    var rows = FALLBACK[zone]; if (!rows) return null;
    var ut = U(y, m, d, h, mi) - rows[rows.length - 1][1] * 3600000, off = rows[rows.length - 1][1];
    for (var i = 0; i < rows.length; i++) if (ut < rows[i][0]) { off = rows[i][1]; break; }
    if (zone === "Asia/Shanghai" && CN_DST[y]) { var r = CN_DST[y], t = U(y, m, d, h, mi); if (t >= U(y, r[0][0], r[0][1], 2) && t < U(y, r[1][0], r[1][1], 2)) off = 9; }
    return off;
  }
  var fmtCache = {};
  function intlOffsetAt(zone, t) {
    var f = fmtCache[zone] || (fmtCache[zone] = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    var p = {}; f.formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000) / 3600000;
  }
  /** offset (ชั่วโมง) ของเขตเวลา IANA ณ เวลานาฬิกาท้องถิ่น y-m-d h:mi → { offset, source: "intl" | "table" | "default" } */
  function zoneOffset(zone, y, m, d, h, mi, opts) {
    var noIntl = opts && opts.noIntl;
    if (!noIntl && typeof Intl !== "undefined" && Intl.DateTimeFormat) {
      try {
        var local = U(y, m, d, h, mi), o = intlOffsetAt(zone, local);
        o = intlOffsetAt(zone, local - o * 3600000);
        if (isFinite(o)) return { offset: Math.round(o * 3600) / 3600, source: "intl" };
      } catch (e) { /* ไม่มีข้อมูลเขตเวลา → ตารางสำรอง */ }
    }
    var fb = fallbackOffset(zone, y, m, d, h, mi);
    return fb != null ? { offset: fb, source: "table" } : { offset: 7, source: "default" };
  }
  /** สมการเวลา (นาที, ±~1 นาที): เวลาสุริยะปรากฏ − เวลาสุริยะเฉลี่ย */
  function equationOfTime(y, m, d) { var n = jdn(y, m, d) - jdn(y, 1, 1) + 1, B = 2 * Math.PI * (n - 81) / 364; return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); }
  /** เวลาสุริยะจริง ณ ลองจิจูด lon (องศาตะวันออก) ของขณะ J (UT) → { at: {y,m,d,h,mi}, eot } */
  function trueSolar(J, lon) { var mean = fromJD(J, lon / 15), e = equationOfTime(mean.y, mean.m, mean.d); return { at: fromJD(J + e / 1440, lon / 15), eot: e }; }
  /** "UTC+07:00" / "UTC+06:42" */
  function fmtOffset(o) { var s = o < 0 ? "-" : "+", a = Math.abs(o), hh = Math.floor(a + 1e-9), mm = Math.round((a - hh) * 60); if (mm === 60) { hh++; mm = 0; } return "UTC" + s + String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0"); }

  /** b = { y, m, d, h, mi, tz (ชั่วโมง, ค่าเริ่ม 7), gender: "male"|"female", noTime, solarLon (ไม่บังคับ: ลองจิจูด °E → ยาม/วันใช้เวลาสุริยะจริง) } */
  function bazi(b) {
    var tz = b.tz == null ? 7 : b.tz, h = b.noTime ? 12 : b.h || 0, mi = b.noTime ? 0 : b.mi || 0;
    var J = jd(b.y, b.m, b.d, h, mi, tz);
    // ปี: เปลี่ยนที่ลี่ชุน
    var lichun = solarTermJD(b.y, 315), yy = J >= lichun ? b.y : b.y - 1;
    var yearP = pillar(yy - 4);
    // เดือน: จากเจี๋ย
    var ja = jieAround(J), mIdx = ja.prev.idx; // 0 = 寅
    var firstStem = mod((yearP.stem % 5) * 2 + 2, 10);
    var mStem = mod(firstStem + mIdx, 10), mBranch = mod(2 + mIdx, 12);
    var monthP = pillar(cycleIndex(mStem, mBranch));
    // วัน: ยามจื่อ 23:00 เริ่มวันใหม่
    // เวลาสุริยะจริง (ถ้าเลือก): ยามและการขึ้นวันใหม่ตอน 23:00 ใช้เวลาสุริยะ ณ ลองจิจูดที่เกิด (ปี/เดือนยังใช้เวลาสารทจริง)
    var sol = !b.noTime && b.solarLon != null && b.solarLon !== "" && isFinite(+b.solarLon) && Math.abs(+b.solarLon) <= 180 ? trueSolar(J, +b.solarLon) : null;
    var dY = sol ? sol.at.y : b.y, dMo = sol ? sol.at.m : b.m, dD = sol ? sol.at.d : b.d, dh = sol ? sol.at.h : h;
    var dn = jdn(dY, dMo, dD) + (!b.noTime && dh >= 23 ? 1 : 0);
    var dayP = pillar(dn + 49);
    var hourP = null;
    if (!b.noTime) { var hb = Math.floor(((dh + 1) % 24) / 2), hs = mod((dayP.stem % 5) * 2 + hb, 10); hourP = pillar(cycleIndex(hs, hb)); }
    var pillars = [yearP, monthP, dayP].concat(hourP ? [hourP] : []);
    // สมดุลห้าธาตุ: ก้าน 1.0 + ก้านแฝงในกิ่ง 1.0/0.5/0.3
    var el = [0, 0, 0, 0, 0];
    pillars.forEach(function (p) { el[STEM_EL[p.stem]] += 1; HIDDEN[p.branch].forEach(function (s, k) { el[STEM_EL[s]] += HIDDEN_W[k]; }); });
    var total = el.reduce(function (a, x) { return a + x; }, 0);
    var dm = dayP.stem, dmEl = STEM_EL[dm];
    // กำลังเจ้าชะตา: ธาตุเดียวกัน + ธาตุที่ให้กำเนิด เทียบกับทั้งหมด (+ ฤดูของกิ่งเดือนถ้าหนุน)
    var resourceEl = mod(dmEl - 1, 5), support = el[dmEl] + el[resourceEl];
    var season = BRANCH_EL[monthP.branch], seasonal = season === dmEl || season === resourceEl;
    var ratio = support / total + (seasonal ? 0.08 : -0.04);
    var strength = ratio >= 0.55 ? "strong" : ratio <= 0.4 ? "weak" : "balanced";
    var favour = strength === "weak" ? [resourceEl, dmEl] : strength === "strong" ? [gen(dmEl), ctl(dmEl), mod(dmEl + 3, 5)] : [gen(dmEl), resourceEl];
    // 大运
    var yang = yearP.stem % 2 === 0, male = b.gender !== "female", forward = yang === male;
    var days = forward ? ja.next.jd - J : J - ja.prev.jd;
    var startAge = Math.round(days / 3 * 10) / 10; // 3 วัน = 1 ปี
    var luck = [];
    for (var k = 1; k <= 9; k++) {
      var p = pillar(monthP.i + (forward ? k : -k)), from = startAge + (k - 1) * 10;
      luck.push({ n: k, pillar: p, from: from, to: from + 10, stemGod: tenGod(dmEl, STEM_EL[p.stem]), branchGod: tenGod(dmEl, BRANCH_EL[p.branch]),
        fav: (favour.indexOf(STEM_EL[p.stem]) >= 0 ? 1 : 0) + (favour.indexOf(BRANCH_EL[p.branch]) >= 0 ? 1 : 0) });
    }
    var order = el.map(function (v, i) { return [v, i]; }).sort(function (a, c) { return c[0] - a[0]; });
    return {
      input: { y: b.y, m: b.m, d: b.d, h: b.noTime ? null : h, mi: b.noTime ? null : mi, tz: tz, gender: male ? "male" : "female" },
      pillars: { year: yearP, month: monthP, day: dayP, hour: hourP },
      dayMaster: { stem: dm, el: dmEl, zh: STEMS[dm], yang: dm % 2 === 0 },
      elements: el.map(function (v) { return Math.round(v * 10) / 10; }), elementShare: el.map(function (v) { return Math.round(v / total * 100); }),
      strongest: order[0][1], weakest: order[4][1], strength: strength, favour: favour,
      luck: { forward: forward, startAge: startAge, pillars: luck },
      jie: { prev: { name: JIE_ZH[ja.prev.idx], at: fromJD(ja.prev.jd, tz) }, next: { name: JIE_ZH[ja.next.idx], at: fromJD(ja.next.jd, tz) } },
      lichun: fromJD(lichun, tz), cycleYear: yy, unsure: b.noTime ? pillarUnsure(b.y, b.m, b.d, tz) : null,
      solar: sol ? { lon: +b.solarLon, at: sol.at, eotMin: Math.round(sol.eot), offsetMin: Math.round((+b.solarLon / 15 - tz) * 60 + sol.eot) } : null,
    };
  }
  /** วัยจรที่ครอบคลุมอายุ age */
  function luckAt(B, age) { var L = B.luck.pillars; for (var i = 0; i < L.length; i++) if (age >= L[i].from && age < L[i].to) return L[i]; return age < B.luck.startAge ? null : L[L.length - 1]; }

  /* ---------- ทักษา ---------- */
  // ดาว: 1 อาทิตย์ 2 จันทร์ 3 อังคาร 4 พุธ 5 พฤหัสบดี 6 ศุกร์ 7 เสาร์ 8 ราหู — เรียงตามวงทักษา
  var TAKSA_ORDER = [1, 2, 3, 4, 7, 5, 8, 6];
  var BHUMI = ["boriwan", "ayu", "det", "sri", "mula", "utsaha", "montri", "kalakini"];
  var MAHA_YEARS = { 1: 6, 2: 15, 3: 8, 4: 17, 5: 19, 6: 21, 7: 10, 8: 12 }; // รวม 108 ปี
  /** วันในสัปดาห์ (0 = อาทิตย์) ของวันที่ตามปฏิทิน */
  var weekday = function (y, m, d) { return mod(jdn(y, m, d) + 1, 7); };
  /** ดาวประจำวันเกิดแบบไทย: วันเปลี่ยนตอน 06:00 (ก่อนรุ่งเช้า = วันก่อนหน้า) พุธหลัง 18:00 = ราหู */
  function birthPlanet(b) {
    var y = b.y, m = b.m, d = b.d, h = b.noTime ? 12 : b.h || 0;
    var wd = weekday(y, m, d);
    if (!b.noTime && h < 6) wd = mod(wd - 1, 7);
    var planet = wd + 1; // อาทิตย์=1 … เสาร์=7
    if (wd === 3 && !b.noTime && (h >= 18 || h < 6)) planet = 8;
    // ไม่ทราบเวลา: วันพุธอาจเป็นพุธกลางคืน (ราหู) ถ้าเกิดหลัง 18:00 · ทุกวันอาจนับเป็นวันก่อนหน้าถ้าเกิดก่อน 06:00
    var unsure = b.noTime ? { maybeRahu: wd === 3, preDawnWeekday: mod(wd - 1, 7), preDawnPlanet: mod(wd - 1, 7) === 3 ? 8 : mod(wd - 1, 7) + 1 } : null;
    return { weekday: wd, planet: planet, rahuNight: planet === 8, unsure: unsure };
  }
  function taksa(b) {
    var bp = birthPlanet(b), start = TAKSA_ORDER.indexOf(bp.planet);
    var bhumi = {}, of = {};
    for (var i = 0; i < 8; i++) { var p = TAKSA_ORDER[(start + i) % 8]; bhumi[BHUMI[i]] = p; of[p] = BHUMI[i]; }
    // มหาทักษา: เริ่มที่ดาววันเกิด เดินตามวง
    var maha = [], age = 0;
    for (var round = 0; round < 2 && age < 110; round++) for (var j = 0; j < 8 && age < 110; j++) {
      var q = TAKSA_ORDER[(start + j) % 8], len = MAHA_YEARS[q];
      maha.push({ planet: q, from: age, to: age + len, bhumi: of[q] }); age += len;
    }
    return { birth: bp, bhumi: bhumi, bhumiOf: of, maha: maha, y: b.y };
  }
  function mahaAt(T, age) { for (var i = 0; i < T.maha.length; i++) if (age >= T.maha[i].from && age < T.maha[i].to) return T.maha[i]; return T.maha[T.maha.length - 1]; }

  /* ---------- เดือนจันทรคติไทย ----------
     ใช้ฟังก์ชันเดียวกับ horoscope.js (HSCore.thaiLunarMonth) เพื่อให้ทุกหน้าได้เดือนเดียวกัน — อธิกมาสวางเป็นเดือน 8 สองหนแบบไทย */
  var HS = root.HSCore || (typeof require === "function" ? (function () { try { return require("./horoscope.js"); } catch (e) { return null; } })() : null);
  function thaiLunarMonth(b) {
    var tz = b.tz == null ? 7 : b.tz, J = jd(b.y, b.m, b.d, 12, 0, tz);
    var H = HS || root.HSCore;
    var t = H.thaiLunarMonth(J);
    return { month: t.month, secondEight: !!t.leap, firstEight: !!t.firstEight, adhikamas: !!t.adhikamas };
  }
  /* ---------- เลข 7 ตัว 9 ฐาน (ฐาน 1–4) ----------
     ฐาน 1 วันเกิด (อาทิตย์ = 1) ฐาน 2 เดือนจันทรคติ ฐาน 3 ปีนักษัตร (ชวด = 1) — แต่ละแถว 7 ช่องนับเพิ่มทีละ 1 วนใน 1–7
     ฐาน 4 (ฐานรวม) = ผลรวมของสามแถวในแต่ละช่อง ช่องที่ 1–7 อ่านเป็นภพ ตนุ กดุมภะ สหัชชะ พันธุ ปุตตะ อริ ปัตนิ */
  var wrap7 = function (n) { return mod(n - 1, 7) + 1; };
  var row7 = function (start) { var r = []; for (var i = 0; i < 7; i++) r.push(wrap7(start + i)); return r; };
  /* รอบ 11: กฎเดียวทั้งเว็บ — ปีนักษัตรไทยเปลี่ยนวันขึ้น 1 ค่ำ เดือน 5 (คำนวณโดย HSCore.zodiacYears ตัวเดียวกับหน้าดวงชะตา)
     กฎเดิม (สงกรานต์ 13 เมษายน) ยังมีให้ใช้เป็น zodiacYearSongkran และแสดงเป็นหมายเหตุเมื่อสองแบบให้ปีต่างกัน */
  function zodiacYearSongkran(b) { // เส้นแบ่งโดยประมาณ: 13 เมษายน
    var y = b.y; if (b.m < 4 || (b.m === 4 && b.d < 13)) y -= 1;
    return mod(y - 4, 12); // 0 = ชวด
  }
  function zodiacYearThai(b) {
    var H = HS || root.HSCore;
    if (H && typeof H.zodiacYears === "function") {
      try {
        var tz = b.tz == null ? 7 : b.tz, z = H.zodiacYears(b.y, b.m, b.d, jd(b.y, b.m, b.d, b.noTime ? 12 : b.h || 0, b.noTime ? 0 : b.mi || 0, tz), tz);
        if (z && z.thai && isFinite(z.thai.year)) return mod(z.thai.year - 4, 12);
      } catch (e) { /* ใช้เส้นแบ่งโดยประมาณ */ }
    }
    return zodiacYearSongkran(b);
  }
  function lek7(b) {
    var bp = birthPlanet(b), lm = thaiLunarMonth(b), za = zodiacYearThai(b), zs = zodiacYearSongkran(b);
    var r1 = row7(bp.weekday + 1), r2 = row7(lm.month), r3 = row7(za + 1);
    var sum = r1.map(function (v, i) { return v + r2[i] + r3[i]; });
    return { rows: [r1, r2, r3], sum: sum, weekday: bp.weekday, unsure: bp.unsure, lunarMonth: lm.month, secondEight: lm.secondEight, zodiac: za, zodiacSongkran: zs, zodiacRuleDiffers: zs !== za, total: sum.reduce(function (a, x) { return a + x; }, 0) };
  }

  /* ---------- ตะวันตก ---------- */
  /** อายุที่ดวงอาทิตย์จรแบบ secondary progression (1 วันหลังเกิด = 1 ปีของชีวิต) ย้ายราศี */
  function progressedSunChanges(b, maxAge) {
    var tz = b.tz == null ? 7 : b.tz, J0 = jd(b.y, b.m, b.d, b.noTime ? 12 : b.h || 0, b.noTime ? 0 : b.mi || 0, tz);
    var lon0 = sunLongitude(J0), out = [], sign0 = Math.floor(lon0 / 30);
    for (var s = 1; s <= 4; s++) {
      var target = norm((sign0 + s) * 30), J = sunAt(target, J0 + norm(target - lon0) / 0.9856), age = Math.round((J - J0) * 10) / 10;
      if (age > (maxAge || 100)) break;
      out.push({ age: age, sign: mod(sign0 + s, 12) });
    }
    return { natalSign: sign0, changes: out };
  }
  // รอบดาวเสาร์ (คาบดาราคติ 29.457 ปี) — ช่วงเวลาที่ตำราตะวันตกถือเป็นจุดเปลี่ยนวัย
  var SATURN_RETURNS = [29.5, 58.9, 88.4];

  var api = {
    jdn: jdn, jd: jd, fromJD: fromJD, sunLongitude: sunLongitude, sunAt: sunAt, solarTermJD: solarTermJD, jieAround: jieAround, newMoonJD: newMoonJD, newMoonBefore: newMoonBefore,
    STEMS: STEMS, BRANCHES: BRANCHES, JIE: JIE, jieLon: jieLon, STEM_EL: STEM_EL, BRANCH_EL: BRANCH_EL, HIDDEN: HIDDEN, EL_KEYS: EL_KEYS, JIE_ZH: JIE_ZH, tenGod: tenGod, bazi: bazi, pillarUnsure: pillarUnsure, luckAt: luckAt, pillar: pillar,
    TAKSA_ORDER: TAKSA_ORDER, BHUMI: BHUMI, MAHA_YEARS: MAHA_YEARS, weekday: weekday, birthPlanet: birthPlanet, taksa: taksa, mahaAt: mahaAt,
    ZONES: ZONES, zoneOffset: zoneOffset, equationOfTime: equationOfTime, trueSolar: trueSolar, fmtOffset: fmtOffset,
    thaiLunarMonth: thaiLunarMonth, zodiacYearThai: zodiacYearThai, zodiacYearSongkran: zodiacYearSongkran, lek7: lek7, progressedSunChanges: progressedSunChanges, SATURN_RETURNS: SATURN_RETURNS,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LifeCal = api;
})(typeof window !== "undefined" ? window : globalThis);
