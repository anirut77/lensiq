/* ดวงวันเดือนปีเกิด — LENSIQ (เพื่อความบันเทิง)
   ส่วนที่ 1: ฟังก์ชันคำนวณแบบ pure (ทดสอบด้วย Node ได้: require("./horoscope-kb.js"); require("./horoscope.js"))
   ส่วนที่ 2: ส่วนติดต่อผู้ใช้ (ทำงานเมื่อมี #hsApp)

   ดาราศาสตร์ (อ้างอิง Jean Meeus, Astronomical Algorithms 2nd ed.):
     - ตำแหน่งดวงอาทิตย์แบบความแม่นยำต่ำ (บทที่ 25) ผิดพลาด ~0.01° ≈ ±15 นาทีของเวลาเปลี่ยนสารท
     - ดิถีจันทร์ดับ (บทที่ 49) ผิดพลาดไม่เกินไม่กี่นาที
     - เวลาดาราคติกรีนิช (บทที่ 12) และสูตรลัคนา (บทที่ 14 / มาตรฐาน)
     - ΔT ตามพหุนาม Espenak & Meeus (NASA Eclipse Web Site)
     - อายนางศ์ลาหิรี (Lahiri) แบบเชิงเส้นโดยประมาณ ใช้แทนอายนางศ์สุริยยาตรของไทย (ต่างกันราว 1°) */
(function (root) {
  "use strict";
  var KB = root.HSKB || (typeof require === "function" ? (function () { try { return require("./horoscope-kb.js"); } catch (e) { return null; } })() : null);

  var D2R = Math.PI / 180;
  var norm360 = function (x) { x %= 360; return x < 0 ? x + 360 : x; };
  var mod = function (a, n) { return ((a % n) + n) % n; };
  var sin = function (d) { return Math.sin(d * D2R); };
  var cos = function (d) { return Math.cos(d * D2R); };
  var pad2 = function (n) { return String(n).padStart(2, "0"); };

  /* ---------------- ปฏิทิน ---------------- */
  /** Julian Day (UT) จากวันเวลาแบบเกรกอเรียน (h = ชั่วโมงทศนิยม) */
  function julianDay(y, m, d, h) {
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + (h || 0) / 24 + B - 1524.5;
  }
  /** Julian Day Number (จำนวนเต็ม) ของวันที่ตามปฏิทินนั้น ๆ */
  function jdn(y, m, d) { return Math.floor(julianDay(y, m, d, 12)); }
  /** แปลง JD → {y,m,d,h,mi} (Meeus บทที่ 7) */
  function fromJD(jd) {
    var z = Math.floor(jd + 0.5), f = jd + 0.5 - z, A = z;
    if (z >= 2299161) { var al = Math.floor((z - 1867216.25) / 36524.25); A = z + 1 + al - Math.floor(al / 4); }
    var B = A + 1524, C = Math.floor((B - 122.1) / 365.25), Dd = Math.floor(365.25 * C), E = Math.floor((B - Dd) / 30.6001);
    var dayF = B - Dd - Math.floor(30.6001 * E) + f, d = Math.floor(dayF);
    var m = E < 14 ? E - 1 : E - 13, y = m > 2 ? C - 4716 : C - 4715;
    var mins = Math.round((dayF - d) * 1440);
    if (mins >= 1440) { var n = fromJD(jd + 1 / 2880); return n; }
    return { y: y, m: m, d: d, h: Math.floor(mins / 60), mi: mins % 60 };
  }
  /** แปลง JD (UT) → วันเวลาท้องถิ่นตามเขตเวลา tz (ชั่วโมง) */
  function localFromJD(jd, tz) { return fromJD(jd + tz / 24); }
  function daysInMonth(y, m) { return [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }
  /** 0 = อาทิตย์ ... 6 = เสาร์ */
  function weekday(y, m, d) { return mod(jdn(y, m, d) + 1, 7); }
  /** รับปีที่ผู้ใช้พิมพ์ (พ.ศ. หรือ ค.ศ.) → ค.ศ.  era: "be" | "ce" | "auto" (≥ 2400 ถือเป็น พ.ศ.) */
  function toCE(year, era) {
    year = Number(year);
    if (!isFinite(year)) return NaN;
    if (era === "be" || (era !== "ce" && year >= 2400)) return year - 543;
    return year;
  }
  function validateDate(y, m, d) {
    if (!(y >= 1900 && y <= 2100)) return "ปีเกิดต้องอยู่ระหว่าง ค.ศ. 1900–2100 (พ.ศ. 2443–2643)";
    if (!(m >= 1 && m <= 12)) return "กรุณาเลือกเดือน";
    if (!(d >= 1 && d <= daysInMonth(y, m))) return "วันที่ไม่ถูกต้องสำหรับเดือนนี้";
    return "";
  }

  /* ---------------- ΔT (วินาที) ---------------- */
  function deltaT(year) {
    var t;
    if (year < 1900) { t = year - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t * t * t - 0.0004473624 * Math.pow(t, 4) + Math.pow(t, 5) / 233174; }
    if (year < 1920) { t = year - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * Math.pow(t, 4); }
    if (year < 1941) { t = year - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t; }
    if (year < 1961) { t = year - 1950; return 29.07 + 0.407 * t - t * t / 233 + t * t * t / 2547; }
    if (year < 1986) { t = year - 1975; return 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718; }
    if (year < 2005) { t = year - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t + 0.000651814 * Math.pow(t, 4) + 0.00002373599 * Math.pow(t, 5); }
    if (year < 2050) { t = year - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
    if (year < 2150) return -20 + 32 * Math.pow((year - 1820) / 100, 2) - 0.5628 * (2150 - year);
    t = (year - 1820) / 100; return -20 + 32 * t * t;
  }
  var yearOfJD = function (jd) { return 2000 + (jd - 2451545) / 365.25; };
  var ttFromUT = function (jd) { return jd + deltaT(yearOfJD(jd)) / 86400; };
  var utFromTT = function (jde) { return jde - deltaT(yearOfJD(jde)) / 86400; };

  /* ---------------- ดวงอาทิตย์ ---------------- */
  /** ลองจิจูดปรากฏของดวงอาทิตย์ (องศา, ราศีจักรแบบสายนะ) จาก JDE (TT) — Meeus บทที่ 25 */
  function sunLongitude(jde) {
    var T = (jde - 2451545) / 36525;
    var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    var M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
    var Om = 125.04 - 1934.136 * T;
    return norm360(L0 + C - 0.00569 - 0.00478 * sin(Om));
  }
  /** เวลา (JD, UT) ที่ดวงอาทิตย์มีลองจิจูด lon ครั้งแรกหลัง/ใกล้ jdGuess */
  function sunAtLongitude(lon, jdGuess) {
    var jde = jdGuess;
    for (var i = 0; i < 50; i++) {
      var diff = norm360(lon - sunLongitude(jde) + 180) - 180;
      jde += diff * 365.2422 / 360;
      if (Math.abs(diff) < 1e-7) break;
    }
    return utFromTT(jde);
  }
  /** เวลา (JD, UT) ของสารท/จุดเปลี่ยนที่ลองจิจูด lon ในปี ค.ศ. year (lon 0 = วสันตวิษุวัต ~20 มี.ค.) */
  function solarTerm(year, lon) {
    var guess = julianDay(year, 3, 21, 0) + norm360(lon) / 360 * 365.2422;
    // 小寒 285°–驚蟄 345° อยู่ต้นปีปฏิทิน (ม.ค.–มี.ค.) → ให้อยู่ในปี year เดียวกัน; 冬至 270° = ธ.ค. ปีเดียวกัน
    if (lon > 280) guess -= 365.2422;
    return sunAtLongitude(lon, guess);
  }
  var TERM_NAMES = ["春分", "清明", "穀雨", "立夏", "小滿", "芒種", "夏至", "小暑", "大暑", "立秋", "處暑", "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至", "小寒", "大寒", "立春", "雨水", "驚蟄"];

  /* ---------------- ดวงจันทร์: จันทร์ดับ (new moon) ---------------- */
  function newMoonJDE(k) {
    var T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    var jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
    var E = 1 - 0.002516 * T - 0.0000074 * T2;
    var M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3;
    var Mp = 201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4;
    var F = 160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4;
    var Om = 124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;
    var c = -0.4072 * sin(Mp) + 0.17241 * E * sin(M) + 0.01608 * sin(2 * Mp) + 0.01039 * sin(2 * F) + 0.00739 * E * sin(Mp - M)
      - 0.00514 * E * sin(Mp + M) + 0.00208 * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F)
      + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp) + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F)
      - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om) - 0.00007 * sin(Mp + 2 * M) + 0.00004 * sin(2 * Mp - 2 * F)
      + 0.00004 * sin(3 * M) + 0.00003 * sin(Mp + M - 2 * F) + 0.00003 * sin(2 * Mp + 2 * F) - 0.00003 * sin(Mp + M + 2 * F)
      + 0.00003 * sin(Mp - M + 2 * F) - 0.00002 * sin(Mp - M - 2 * F) - 0.00002 * sin(3 * Mp + M) + 0.00002 * sin(4 * Mp);
    var A = [
      [299.77 + 0.107408 * k - 0.009173 * T2, 0.000325], [251.88 + 0.016321 * k, 0.000165], [251.83 + 26.651886 * k, 0.000164],
      [349.42 + 36.412478 * k, 0.000126], [84.66 + 18.206239 * k, 0.00011], [141.74 + 53.303771 * k, 0.000062],
      [207.14 + 2.453732 * k, 0.00006], [154.84 + 7.30686 * k, 0.000056], [34.52 + 27.261239 * k, 0.000047],
      [207.19 + 0.121824 * k, 0.000042], [291.34 + 1.844379 * k, 0.00004], [161.72 + 24.198154 * k, 0.000037],
      [239.56 + 25.513099 * k, 0.000035], [331.55 + 3.592518 * k, 0.000023]
    ];
    var add = 0; A.forEach(function (a) { add += a[1] * sin(a[0]); });
    return jde + c + add;
  }
  /** จันทร์ดับ (JD, UT) ที่เกิดก่อนหรือเท่ากับ jd */
  function newMoonBefore(jd) {
    var k = Math.floor((jd - 2451550.09766) / 29.530588861) + 1;
    var t = utFromTT(newMoonJDE(k));
    while (t > jd) { k--; t = utFromTT(newMoonJDE(k)); }
    while (true) { var n = utFromTT(newMoonJDE(k + 1)); if (n <= jd) { k++; t = n; } else break; }
    return { k: k, jd: t };
  }
  var nmByK = function (k) { return utFromTT(newMoonJDE(k)); };

  /* ---------------- ปีใหม่จีน (ตรุษจีน) ---------------- */
  /** วัน (เลขวันจูเลียน) ตามปฏิทินเวลาปักกิ่ง UTC+8 */
  var bjDay = function (jd) { return Math.floor(jd + 0.5 + 8 / 24); };
  /** เดือน 11 จีน (มีเหมายัน) — คืนดัชนี k ของจันทร์ดับที่เริ่มเดือนนั้น */
  function month11K(year) {
    var ws = solarTerm(year, 270), d = bjDay(ws);
    var nm = newMoonBefore(ws + 1), k = nm.k;
    while (bjDay(nmByK(k)) > d) k--;
    while (bjDay(nmByK(k + 1)) <= d) k++;
    return k;
  }
  /** วันตรุษจีน (ปีใหม่จีน) ของปี ค.ศ. year → {y,m,d} ตามกฎปฏิทินจีนปัจจุบัน (เวลา UTC+8, เดือนอธิกมาสคือเดือนแรกที่ไม่มีจงชี่) */
  var cnyCache = {};
  function chineseNewYear(year) {
    if (cnyCache[year]) return cnyCache[year];
    var k11 = month11K(year - 1), k11b = month11K(year), n = k11b - k11, kNY = k11 + 2;
    if (n === 13) {
      // หาเดือนแรกที่ไม่มีจงชี่ (ลองจิจูดพหุคูณ 30°)
      for (var i = 1; i < 13; i++) {
        var a = bjDay(nmByK(k11 + i)), b = bjDay(nmByK(k11 + i + 1));
        var lonA = sunLongitude(ttFromUT(nmByK(k11 + i))), next = Math.ceil(lonA / 30) * 30;
        var zq = bjDay(sunAtLongitude(norm360(next), nmByK(k11 + i) + 10));
        var has = zq >= a && zq < b;
        if (!has) { if (i <= 2) kNY = k11 + 3; break; }
      }
    }
    var dd = fromJD(nmByK(kNY) + 8 / 24);
    var out = { y: dd.y, m: dd.m, d: dd.d };
    cnyCache[year] = out; return out;
  }

  /* ---------------- ดาราคติ / ลัคนา ---------------- */
  function gmst(jdUT) {
    var T = (jdUT - 2451545) / 36525;
    return norm360(280.46061837 + 360.98564736629 * (jdUT - 2451545) + 0.000387933 * T * T - T * T * T / 38710000);
  }
  function obliquity(jde) { var T = (jde - 2451545) / 36525; return 23.4392911 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T; }
  /** อายนางศ์ลาหิรี (องศา) โดยประมาณ: 23.857° ที่ J2000 + 50.29"/ปี */
  function ayanamsa(jd) { return 23.857092 + (jd - 2451545) / 365.25 * 0.0139694; }
  /** ลัคนา (องศาสายนะ) จาก JD (UT), ละติจูด, ลองจิจูดตะวันออก */
  function ascendant(jdUT, lat, lon) {
    var ramc = norm360(gmst(jdUT) + lon), eps = obliquity(ttFromUT(jdUT));
    var asc = Math.atan2(cos(ramc), -(sin(ramc) * cos(eps) + Math.tan(lat * D2R) * sin(eps))) / D2R;
    return norm360(asc);
  }
  var sidereal = function (lonTrop, jd) { return norm360(lonTrop - ayanamsa(jd)); };

  /* ---------------- โหราศาสตร์ไทย ---------------- */
  /* ดาว/วัน: 0 อาทิตย์ 1 จันทร์ 2 อังคาร 3 พุธ 4 พฤหัสบดี 5 ศุกร์ 6 เสาร์ 7 ราหู (พุธกลางคืน)
     เลขดาว (ทักษา): อาทิตย์1 จันทร์2 อังคาร3 พุธ4 พฤหัส5 ศุกร์6 เสาร์7 ราหู8 */
  var PLANET_NUM = [1, 2, 3, 4, 5, 6, 7, 8];
  /** ลำดับดาวในวงทักษา (เวียนขวา): 1 2 3 4 7 5 8 6  → เป็นรหัสดาว 0..7 */
  var TAKSA_ORDER = [0, 1, 2, 3, 6, 4, 7, 5];
  var BHUMI = ["boriwan", "ayu", "dech", "sri", "mula", "utsaha", "montri", "kalakini"];
  /** ทักษาปกรณ์: เริ่ม "บริวาร" ที่ดาวประจำวันเกิด แล้วเวียนตามลำดับทักษา → {ภูมิ: รหัสดาว} */
  function taksa(planet) {
    var start = TAKSA_ORDER.indexOf(planet), out = {};
    BHUMI.forEach(function (b, i) { out[b] = TAKSA_ORDER[(start + i) % 8]; });
    return out;
  }
  /** ภูมิของดาว p ในทักษาของ base */
  function bhumiOf(base, p) { var t = taksa(base); for (var k in t) if (t[k] === p) return k; return null; }

  /** วันเกิดแบบไทย
      time: {h, mi} หรือ null (ไม่ทราบเวลา), sunrise: true = เปลี่ยนวันตอน 06:00 (ตามโหราศาสตร์ไทย) */
  function thaiBirthDay(y, m, d, time, sunrise) {
    var wd = weekday(y, m, d), shifted = false;
    if (time && sunrise && time.h < 6) { wd = mod(wd - 1, 7); shifted = true; }
    var night = false;
    if (time && wd === 3) {
      if (shifted) night = true; // ก่อน 06:00 ของวันพฤหัส → พุธกลางคืน
      else if (time.h >= 18) night = true;
    }
    return { weekday: wd, planet: night ? 7 : wd, rahu: night, shifted: shifted, unknownTime: !time, maybeRahu: !time && wd === 3 };
  }

  var RASI_BOUND = 30;
  /** ราศีแบบไทย (นิรายนะ) ของดวงอาทิตย์: 0 เมษ ... 11 มีน */
  function sunRasi(jdUT) { var s = sidereal(sunLongitude(ttFromUT(jdUT)), jdUT); return { index: Math.floor(s / RASI_BOUND), lon: s, deg: s % 30 }; }
  function lagna(jdUT, lat, lon) { var a = ascendant(jdUT, lat, lon), s = sidereal(a, jdUT); return { index: Math.floor(s / 30), lon: s, deg: s % 30, tropical: a }; }

  /** เดือนจันทรคติไทยโดยประมาณ: ราศี (นิรายนะ) ของอาทิตย์ ณ จันทร์ดับต้นเดือน → มีน = เดือน 5, เมษ = 6 ... (ระบบอมานตะ)
      คืน {month 1–12, startJD (UT, วันขึ้น 1 ค่ำ โดยประมาณ), leap} */
  function thaiLunarMonth(jdUT) {
    var nm = newMoonBefore(jdUT);
    var sgn = function (k) { var j = nmByK(k); return Math.floor(sidereal(sunLongitude(ttFromUT(j)), j) / 30); };
    var s = sgn(nm.k), sPrev = sgn(nm.k - 1);
    var month = mod(s + 6, 12) || 12; // มีน(11) → 5, เมษ(0) → 6, ... พิจิก(7) → 1 (อ้าย)
    return { month: month, startJD: nm.jd, leap: s === sPrev };
  }
  /** วันขึ้น 1 ค่ำ เดือน 5 (โดยประมาณ) ของปี ค.ศ. year → JD (UT) ของจันทร์ดับต้นเดือน */
  function thaiMonth5Start(year) {
    var j = julianDay(year, 2, 15, 0);
    for (var i = 0; i < 6; i++) {
      var nm = newMoonBefore(j + 29.6 * i + 29.6);
      var t = thaiLunarMonth(nm.jd + 1);
      if (t.month === 5 && !t.leap) return nm.jd;
    }
    return julianDay(year, 4, 1, 0);
  }

  /* ---------------- ปีนักษัตร / ปาจื้อ ---------------- */
  var STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
  var BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
  var STEM_EL = ["wood", "wood", "fire", "fire", "earth", "earth", "metal", "metal", "water", "water"];
  var BRANCH_EL = ["water", "earth", "wood", "wood", "earth", "fire", "fire", "earth", "metal", "metal", "earth", "water"];
  var HIDDEN = [[9], [5, 9, 7], [0, 2, 4], [1], [4, 1, 9], [2, 6, 4], [3, 5], [5, 3, 1], [6, 8, 4], [7], [4, 7, 3], [8, 0]];
  var ELEMENTS = ["wood", "fire", "earth", "metal", "water"];
  var GEN = { wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood" };   // 生
  var CTRL = { wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood" };  // 克
  var pillar = function (s, b) { return { stem: mod(s, 10), branch: mod(b, 12), gz: STEMS[mod(s, 10)] + BRANCHES[mod(b, 12)] }; };
  /** ลำดับ 60 กลับเป็น (stem, branch) */
  var cyc = function (n) { return pillar(n, n); };

  /** เสาวัน จาก JDN: 2000-01-01 (JDN 2451545) = 戊午 */
  function dayPillarJDN(n) { return pillar(n + 9, n + 1); }

  /** โหราศาสตร์จีนสี่เสา
      input: {y,m,d, time:{h,mi}|null, tz (ชม.), ziMode: "23" (เปลี่ยนวันตอน 23:00 — ค่าเริ่มต้น) | "00" (เปลี่ยนวันเที่ยงคืน, ยามจื่อดึกใช้ก้านของวันถัดไป)} */
  function bazi(o) {
    var tz = o.tz == null ? 7 : o.tz, t = o.time, hh = t ? t.h + t.mi / 60 : 12;
    var jd = julianDay(o.y, o.m, o.d, hh) - tz / 24;
    // ปี: ตัดที่ 立春 (315°)
    var lc = solarTerm(o.y, 315), yr = jd >= lc ? o.y : o.y - 1;
    var yp = pillar(yr - 4, yr - 4);
    // เดือน: ตามลองจิจูดดวงอาทิตย์ ณ ขณะเกิด (เดือน 寅 เริ่ม 315°)
    var lam = sunLongitude(ttFromUT(jd)), mi = Math.floor(norm360(lam - 315) / 30); // 0 = 寅
    var mp = pillar((yp.stem % 5) * 2 + 2 + mi, 2 + mi);
    // วัน
    var n = jdn(o.y, o.m, o.d), ziNext = false;
    if (t && t.h >= 23) { if ((o.ziMode || "23") === "23") n += 1; else ziNext = true; }
    var dp = dayPillarJDN(n);
    var hp = null;
    if (t) {
      var hb = Math.floor(((t.h + 1) % 24) / 2);
      var ds = ziNext ? dayPillarJDN(n + 1).stem : dp.stem;
      hp = pillar((ds % 5) * 2 + hb, hb);
    }
    // ใกล้จุดเปลี่ยน (ไม่ทราบเวลา): ตรวจว่าทั้งวันอยู่เดือน/ปีเดียวกันหรือไม่
    var unsure = null;
    if (!t) {
      var j0 = julianDay(o.y, o.m, o.d, 0) - tz / 24, j1 = j0 + 1;
      var m0 = Math.floor(norm360(sunLongitude(ttFromUT(j0)) - 315) / 30), m1 = Math.floor(norm360(sunLongitude(ttFromUT(j1)) - 315) / 30);
      if (m0 !== m1) unsure = "month";
    }
    return { year: yp, month: mp, day: dp, hour: hp, jd: jd, sunLon: lam, lichun: lc, monthIndex: mi, unsure: unsure, ziMode: o.ziMode || "23" };
  }
  /** นับธาตุ (ก้านบน + กิ่งล่าง) — hidden: true = กิ่งล่างกระจายตามก้านแฝง (0.6/0.3/0.1) */
  function elementCounts(bz, hidden) {
    var c = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
    [bz.year, bz.month, bz.day, bz.hour].forEach(function (p) {
      if (!p) return;
      c[STEM_EL[p.stem]] += 1;
      if (!hidden) c[BRANCH_EL[p.branch]] += 1;
      else {
        var hs = HIDDEN[p.branch], w = hs.length === 1 ? [1] : hs.length === 2 ? [0.7, 0.3] : [0.6, 0.3, 0.1];
        hs.forEach(function (s, i) { c[STEM_EL[s]] += w[i]; });
      }
    });
    ELEMENTS.forEach(function (k) { c[k] = Math.round(c[k] * 10) / 10; });
    return c;
  }
  /** ความสัมพันธ์ธาตุ a → b จากมุมมอง a */
  function relation(a, b) {
    if (a === b) return "same";
    if (GEN[b] === a) return "resource";  // b ให้กำเนิด a
    if (GEN[a] === b) return "output";    // a ให้กำเนิด b
    if (CTRL[a] === b) return "wealth";   // a ข่ม b
    return "power";                       // b ข่ม a
  }
  var parentOf = function (e) { for (var k in GEN) if (GEN[k] === e) return k; };
  var controllerOf = function (e) { for (var k in CTRL) if (CTRL[k] === e) return k; };
  /** ธาตุเสริม (แบบง่าย): ถ้าธาตุตัวเอง+ธาตุแม่ ≥ ครึ่งหนึ่ง = "แข็ง" → เสริมธาตุที่ระบาย (ลูก/ที่ข่ม/ที่ถูกข่ม) ที่น้อยที่สุด
      ถ้า "อ่อน" → เสริมธาตุแม่หรือธาตุเดียวกันที่น้อยกว่า */
  function favorable(dm, counts) {
    var total = ELEMENTS.reduce(function (s, k) { return s + counts[k]; }, 0) || 1;
    var support = counts[dm] + counts[parentOf(dm)], ratio = support / total;
    var strong = ratio >= 0.5;
    var pool = strong ? [GEN[dm], CTRL[dm], controllerOf(dm)] : [parentOf(dm), dm];
    var pick = pool.slice().sort(function (a, b) { return counts[a] - counts[b] || pool.indexOf(a) - pool.indexOf(b); });
    return { strong: strong, ratio: Math.round(ratio * 100) / 100, primary: pick[0], secondary: pick[1], pool: pool };
  }
  /** ปีนักษัตร: branch index (0 ชวด) ของปี ค.ศ. ที่ "เริ่ม" แล้ว */
  var animalOfYear = function (y) { return mod(y - 4, 12); };
  /** ปีนักษัตรตาม 3 ขอบเขต: ตรุษจีน, ลี่ชุน (ปาจื้อ), และแบบไทย (ขึ้น 1 ค่ำ เดือน 5 โดยประมาณ) */
  function zodiacYears(y, m, d, jdUT, tz) {
    var cny = chineseNewYear(y), before = m < cny.m || (m === cny.m && d < cny.d);
    var cnyYear = before ? y - 1 : y;
    var lcYear = jdUT >= solarTerm(y, 315) ? y : y - 1;
    var m5 = thaiMonth5Start(y), m5d = localFromJD(m5, tz == null ? 7 : tz);
    var thYear = jdn(y, m, d) >= jdn(m5d.y, m5d.m, m5d.d) ? y : y - 1;
    return {
      chinese: { year: cnyYear, animal: animalOfYear(cnyYear), stem: mod(cnyYear - 4, 10), cny: cny },
      lichun: { year: lcYear, animal: animalOfYear(lcYear) },
      thai: { year: thYear, animal: animalOfYear(thYear), month5: { y: m5d.y, m: m5d.m, d: m5d.d } },
      differ: cnyYear !== lcYear || cnyYear !== thYear
    };
  }

  /* ---------------- เลข 7 ตัว (3 ฐาน + ผลรวม) ---------------- */
  var wrap7 = function (n) { return mod(n - 1, 7) + 1; };
  /** dayNum 1–7 (อาทิตย์=1), lunarMonth 1–12 (อ้าย=1), animal 0–11 (ชวด=0 → เลข 1) */
  function sevenTable(dayNum, lunarMonth, animal) {
    var row = function (start) { var r = []; for (var i = 0; i < 7; i++) r.push(wrap7(start + i)); return r; };
    var r1 = row(dayNum), r2 = row(wrap7(lunarMonth)), r3 = row(wrap7(animal + 1));
    var sum = r1.map(function (v, i) { return v + r2[i] + r3[i]; });
    return { day: r1, month: r2, year: r3, sum: sum, starts: [dayNum, lunarMonth, animal + 1] };
  }

  /* ---------------- เลขศาสตร์ ---------------- */
  var digitSum = function (n) { return String(n).split("").reduce(function (s, c) { return s + (+c || 0); }, 0); };
  var MASTER = [11, 22, 33];
  function reduceNum(n, keepMaster) {
    while (n > 9 && !(keepMaster && MASTER.indexOf(n) >= 0)) n = digitSum(n);
    return n;
  }
  /** Life Path ตามวิธีของ numerology.com: ลดเดือน/วัน/ปีแยกกัน (เก็บเลขมาสเตอร์) แล้วรวม */
  function lifePath(y, m, d) {
    var a = reduceNum(m, true), b = reduceNum(d, true), c = reduceNum(digitSum(y), true);
    var total = a + b + c;
    return { value: reduceNum(total, true), parts: [a, b, c], total: total };
  }
  var birthdayNumber = function (d) { return reduceNum(d, true); };
  /** ผลรวมเลขชื่อภาษาไทย ตามตารางใน KB (ไม่รู้จัก = 0) */
  function thaiNameNumber(name, table) {
    table = table || (KB && KB.thaiLetterValues) || {};
    var detail = [], sum = 0;
    Array.from(String(name || "").normalize("NFC")).forEach(function (ch) {
      if (/\s/.test(ch)) return;
      var v = table[ch];
      if (v == null) { if (/[A-Za-z]/.test(ch)) v = mod(ch.toUpperCase().charCodeAt(0) - 65, 9) + 1; else v = 0; }
      if (v) { sum += v; detail.push([ch, v]); }
    });
    return { sum: sum, reduced: sum ? reduceNum(sum, false) : 0, detail: detail };
  }

  /* ---------------- ดวงคู่ ---------------- */
  var SIX_HARMONY = [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]];
  var TRINES = [[8, 0, 4], [2, 6, 10], [5, 9, 1], [11, 3, 7]];
  var THAI_FRIEND = [[0, 4], [1, 3], [2, 5], [6, 7]]; // อาทิตย์-พฤหัส, จันทร์-พุธ, อังคาร-ศุกร์, เสาร์-ราหู
  var LP_GROUPS = [[1, 5, 7], [2, 4, 8], [3, 6, 9]];
  var RASI_EL = ["fire", "earth", "air", "water"];
  function branchRel(a, b) {
    if (a === b) return "same";
    if (SIX_HARMONY.some(function (p) { return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a); })) return "harmony";
    if (TRINES.some(function (t) { return t.indexOf(a) >= 0 && t.indexOf(b) >= 0; })) return "trine";
    if (mod(a - b, 12) === 6) return "clash";
    return "neutral";
  }
  var lpRoot = function (n) { return n > 9 ? reduceNum(n, false) : n; };
  /** p1/p2: ผลจาก analyze() — คืนคะแนนเชิงบันเทิง 55–98 พร้อมเหตุผล */
  function compatibility(p1, p2) {
    var score = 62, why = [];
    var br = branchRel(p1.zodiac.chinese.animal, p2.zodiac.chinese.animal);
    score += { harmony: 14, trine: 11, same: 6, neutral: 2, clash: -6 }[br]; why.push({ k: "zodiac", rel: br });
    var e1 = STEM_EL[p1.bazi.day.stem], e2 = STEM_EL[p2.bazi.day.stem], er = relation(e1, e2);
    var ep = { same: 6, resource: 9, output: 9, wealth: 2, power: 2 }[er]; score += ep; why.push({ k: "element", rel: er, a: e1, b: e2 });
    var a = p1.thaiDay.planet, b = p2.thaiDay.planet;
    var friend = THAI_FRIEND.some(function (p) { return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a); });
    var bh1 = bhumiOf(a, b), bh2 = bhumiOf(b, a);
    var tp = friend ? 10 : a === b ? 6 : (["sri", "dech", "montri", "mula"].indexOf(bh1) >= 0 || ["sri", "dech", "montri", "mula"].indexOf(bh2) >= 0) ? 5 : (bh1 === "kalakini" || bh2 === "kalakini") ? -3 : 2;
    score += tp; why.push({ k: "thaiday", friend: friend, same: a === b, b1: bh1, b2: bh2 });
    var re1 = RASI_EL[p1.sunRasi.index % 4], re2 = RASI_EL[p2.sunRasi.index % 4];
    var rp = re1 === re2 ? 5 : ((re1 === "fire" && re2 === "air") || (re1 === "air" && re2 === "fire") || (re1 === "earth" && re2 === "water") || (re1 === "water" && re2 === "earth")) ? 4 : 1;
    score += rp; why.push({ k: "rasi", a: re1, b: re2, pts: rp });
    var l1 = lpRoot(p1.lifePath.value), l2 = lpRoot(p2.lifePath.value);
    var lp = LP_GROUPS.some(function (g) { return g.indexOf(l1) >= 0 && g.indexOf(l2) >= 0; }) ? 6 : l1 === l2 ? 5 : 1;
    score += lp; why.push({ k: "lifepath", a: p1.lifePath.value, b: p2.lifePath.value, pts: lp });
    return { score: Math.max(55, Math.min(98, score)), why: why };
  }

  /* ---------------- ดวงรายวัน ---------------- */
  /** today: {y,m,d}; profile: ผล analyze() */
  function daily(profile, today) {
    var wd = weekday(today.y, today.m, today.d);
    var bh = bhumiOf(profile.thaiDay.planet, wd);               // วันนี้เป็นภูมิอะไรของดวงเรา
    var dayT = taksa(wd);                                        // สีเสื้อของวันนี้ (ทักษาจร)
    var dp = dayPillarJDN(jdn(today.y, today.m, today.d));
    var dm = STEM_EL[profile.bazi.day.stem], te = STEM_EL[dp.stem];
    var rel = relation(dm, te);
    var clash = branchRel(profile.zodiac.lichun.animal, dp.branch) === "clash";
    var fav = profile.favorable.primary;
    // เลขนำโชค: เลขดาวของ "ศรี" วันนี้ + เลขเหอถูของธาตุเสริม (水1/6 火2/7 木3/8 金4/9 土5/0)
    var hetu = { water: [1, 6], fire: [2, 7], wood: [3, 8], metal: [4, 9], earth: [5, 0] }[fav];
    var lucky = [PLANET_NUM[dayT.sri], hetu[0], hetu[1]].filter(function (v, i, a) { return a.indexOf(v) === i; });
    var lp = profile.lifePath.value; if (lucky.indexOf(lpRoot(lp)) < 0) lucky.push(lpRoot(lp));
    return { weekday: wd, bhumi: bh, taksaToday: dayT, pillar: dp, rel: rel, todayEl: te, clash: clash, lucky: lucky.slice(0, 4), favEl: fav };
  }
  /** ดวงรายเดือน: เสาเดือนปัจจุบัน (ตามสารท) เทียบธาตุประจำตัว */
  function monthly(profile, jdUT) {
    var b = bazi(Object.assign({}, fromJD(jdUT + 7 / 24), { time: { h: 12, mi: 0 }, tz: 7 }));
    var dm = STEM_EL[profile.bazi.day.stem];
    return { pillar: b.month, rel: relation(dm, STEM_EL[b.month.stem]), branchRel: branchRel(profile.zodiac.lichun.animal, b.month.branch), sunRasi: sunRasi(jdUT).index };
  }

  /* ---------------- วิเคราะห์ครบชุด ---------------- */
  /** input: {y,m,d (ค.ศ.), time:{h,mi}|null, tz, lat, lon, sunrise (bool), ziMode, name, hidden (bool), lunarMonthOverride} */
  function analyze(inp) {
    var tz = inp.tz == null ? 7 : inp.tz, lat = inp.lat == null ? 13.75 : inp.lat, lon = inp.lon == null ? 100.5 : inp.lon;
    var t = inp.time || null, hh = t ? t.h + t.mi / 60 : 12;
    var jd = julianDay(inp.y, inp.m, inp.d, hh) - tz / 24;
    var td = thaiBirthDay(inp.y, inp.m, inp.d, t, inp.sunrise !== false);
    var bz = bazi({ y: inp.y, m: inp.m, d: inp.d, time: t, tz: tz, ziMode: inp.ziMode });
    var counts = elementCounts(bz, !!inp.hidden);
    var dm = STEM_EL[bz.day.stem];
    var lm = thaiLunarMonth(jd);
    var zy = zodiacYears(inp.y, inp.m, inp.d, jd, tz);
    var lunarMonth = inp.lunarMonthOverride || lm.month;
    return {
      input: inp, jd: jd, thaiDay: td, taksa: taksa(td.planet),
      sunRasi: sunRasi(jd), lagna: t ? lagna(jd, lat, lon) : null,
      lunar: lm, zodiac: zy, bazi: bz, counts: counts, dayMaster: dm, favorable: favorable(dm, counts),
      seven: sevenTable(PLANET_NUM[td.weekday], lunarMonth, zy.thai.animal),
      lifePath: lifePath(inp.y, inp.m, inp.d), birthday: birthdayNumber(inp.d),
      name: inp.name ? thaiNameNumber(inp.name) : null
    };
  }

  /** สถิติแบบไม่ระบุตัวตน "hs-stats" {v,total,days:{YYYY-MM-DD:n},zodiac:{0..11:n}} */
  function addStat(st, animal, now) {
    st = st && typeof st === "object" ? st : {};
    var d = new Date(now || Date.now()), key = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    var out = { v: 1, total: (st.total || 0) + 1, days: Object.assign({}, st.days || {}), zodiac: Object.assign({}, st.zodiac || {}) };
    out.days[key] = (out.days[key] || 0) + 1;
    out.zodiac[animal] = (out.zodiac[animal] || 0) + 1;
    return out;
  }

  var HS = {
    julianDay: julianDay, jdn: jdn, fromJD: fromJD, localFromJD: localFromJD, weekday: weekday, toCE: toCE, validateDate: validateDate, daysInMonth: daysInMonth,
    deltaT: deltaT, sunLongitude: sunLongitude, solarTerm: solarTerm, sunAtLongitude: sunAtLongitude, newMoonJDE: newMoonJDE, newMoonBefore: newMoonBefore,
    chineseNewYear: chineseNewYear, gmst: gmst, ascendant: ascendant, ayanamsa: ayanamsa, sunRasi: sunRasi, lagna: lagna,
    taksa: taksa, bhumiOf: bhumiOf, thaiBirthDay: thaiBirthDay, thaiLunarMonth: thaiLunarMonth, thaiMonth5Start: thaiMonth5Start,
    bazi: bazi, dayPillarJDN: dayPillarJDN, elementCounts: elementCounts, relation: relation, favorable: favorable, zodiacYears: zodiacYears,
    sevenTable: sevenTable, lifePath: lifePath, birthdayNumber: birthdayNumber, reduceNum: reduceNum, thaiNameNumber: thaiNameNumber,
    branchRel: branchRel, compatibility: compatibility, daily: daily, monthly: monthly, analyze: analyze, addStat: addStat, cyc: cyc,
    STEMS: STEMS, BRANCHES: BRANCHES, STEM_EL: STEM_EL, BRANCH_EL: BRANCH_EL, HIDDEN: HIDDEN, ELEMENTS: ELEMENTS, GEN: GEN, CTRL: CTRL,
    TAKSA_ORDER: TAKSA_ORDER, BHUMI: BHUMI, PLANET_NUM: PLANET_NUM, TERM_NAMES: TERM_NAMES, pad2: pad2
  };
  if (typeof module !== "undefined" && module.exports) module.exports = HS;
  root.HSCore = HS;
})(typeof window !== "undefined" ? window : globalThis);

/* ===================================================================================== */
/* ================================== ส่วนติดต่อผู้ใช้ ================================== */
/* ===================================================================================== */
if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("hsApp")) (function () {
  "use strict";
  var HS = window.HSCore, KB = window.HSKB;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var STATS_KEY = "hs-stats", PREF_KEY = "hs-prefs", IDLE_MS = 60000;
  var lsGet = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* โหมดส่วนตัว */ } };
  var prefs = Object.assign({ stats: true, sunrise: true, zi: "23", hidden: false }, lsGet(PREF_KEY, {}));
  var savePrefs = function () { lsSet(PREF_KEY, prefs); };
  var current = null;
  var DAYS = KB.days, EL = KB.elements;

  var thDate = function (y, m, d) { return d + " " + KB.monthsShort[m - 1] + " " + (y + 543); };
  var thDateLong = function (y, m, d) { return d + " " + KB.months[m - 1] + " พ.ศ. " + (y + 543); };
  var hm = function (h, mi) { return HS.pad2(h) + ":" + HS.pad2(mi); };
  var elName = function (k) { return "ธาตุ" + EL[k].th; };
  var swatch = function (planet, label) { var d = DAYS[planet]; return '<span class="sw"><i style="background:' + d.hex + '"></i>' + esc(label || d.color) + "</span>"; };
  var elChip = function (k) { return '<span class="elc" style="--c:' + EL[k].color + ";--s:" + EL[k].soft + '">' + esc(EL[k].zh + " " + EL[k].th) + "</span>"; };

  /* ---------- ฟอร์ม ---------- */
  function fillDateSelects(dayEl, monEl) {
    dayEl.innerHTML = '<option value="">วันที่</option>' + Array.from({ length: 31 }, function (_, i) { return '<option value="' + (i + 1) + '">' + (i + 1) + "</option>"; }).join("");
    monEl.innerHTML = '<option value="">เดือน</option>' + KB.months.map(function (m, i) { return '<option value="' + (i + 1) + '">' + m + "</option>"; }).join("");
  }
  fillDateSelects($("#hsDay"), $("#hsMonth"));
  fillDateSelects($("#hsPDay"), $("#hsPMonth"));
  $("#hsProv").innerHTML = KB.provinces.map(function (p, i) { return '<option value="' + i + '">' + esc(p[0]) + "</option>"; }).join("") + '<option value="custom">กำหนดละติจูด/ลองจิจูดเอง</option>';
  $("#hsLunar").innerHTML += KB.lunarMonths.slice(1).map(function (n, i) { return '<option value="' + (i + 1) + '">' + n + "</option>"; }).join("");
  $("#hsProv").addEventListener("change", function () { $("#hsLatLon").hidden = this.value !== "custom"; });
  $("#hsSunrise").checked = !!prefs.sunrise; $("#hsZi").value = prefs.zi; $("#hsHidden").checked = !!prefs.hidden;
  $("#hsSunrise").addEventListener("change", function () { prefs.sunrise = this.checked; savePrefs(); });
  $("#hsZi").addEventListener("change", function () { prefs.zi = this.value; savePrefs(); });
  $("#hsHidden").addEventListener("change", function () { prefs.hidden = this.checked; savePrefs(); });
  $("#hsNoTime").addEventListener("change", function () { $("#hsTime").disabled = this.checked; if (this.checked) $("#hsTime").value = ""; });

  var eraVal = function () { var r = document.querySelector('input[name="hsEra"]:checked'); return r ? r.value : "be"; };
  function yearHint() {
    var raw = $("#hsYear").value.replace(/\D/g, ""), h = $("#hsYearHint");
    if ($("#hsYear").value !== raw) $("#hsYear").value = raw;
    if (raw.length < 4) { h.textContent = ""; return; }
    var y = +raw, era = eraVal();
    // ผู้ใช้ไทยมักพิมพ์ พ.ศ. — สลับระบบให้อัตโนมัติเมื่อเห็นชัดว่าเป็นอีกระบบ
    if (era === "ce" && y >= 2400) { document.querySelector('input[name="hsEra"][value="be"]').checked = true; era = "be"; }
    else if (era === "be" && y >= 1900 && y <= 2150) { document.querySelector('input[name="hsEra"][value="ce"]').checked = true; era = "ce"; }
    var ce = HS.toCE(y, era);
    h.textContent = era === "be" ? "พ.ศ. " + y + " = ค.ศ. " + ce : "ค.ศ. " + y + " = พ.ศ. " + (ce + 543);
  }
  $("#hsYear").addEventListener("input", yearHint);
  document.querySelectorAll('input[name="hsEra"]').forEach(function (r) { r.addEventListener("change", function () { var h = $("#hsYearHint"), raw = $("#hsYear").value; if (raw.length === 4) { var y = +raw, ce = HS.toCE(y, eraVal()); h.textContent = eraVal() === "be" ? "พ.ศ. " + y + " = ค.ศ. " + ce : "ค.ศ. " + y + " = พ.ศ. " + (ce + 543); } }); });

  function parseTime(v) { var m = /^(\d{1,2}):(\d{2})/.exec(v || ""); return m ? { h: +m[1], mi: +m[2] } : null; }
  function readDate(dEl, mEl, yEl, era) {
    var d = +dEl.value, m = +mEl.value, raw = yEl.value.replace(/\D/g, "");
    if (!d || !m) return { err: "กรุณาเลือกวันที่และเดือนเกิด" };
    if (raw.length !== 4) return { err: "กรุณากรอกปีเกิด 4 หลัก (พ.ศ. เช่น 2533 หรือ ค.ศ. เช่น 1990)" };
    var y = HS.toCE(+raw, era);
    var e = HS.validateDate(y, m, d);
    return e ? { err: e } : { y: y, m: m, d: d };
  }
  function settings() {
    var pv = $("#hsProv").value, lat = 13.75, lon = 100.5, place = "กรุงเทพมหานคร";
    if (pv === "custom") { lat = parseFloat($("#hsLat").value); lon = parseFloat($("#hsLon").value); place = "พิกัดที่กำหนด"; if (!isFinite(lat) || Math.abs(lat) > 66) lat = 13.75; if (!isFinite(lon) || Math.abs(lon) > 180) lon = 100.5; }
    else { var p = KB.provinces[+pv || 0]; lat = p[1]; lon = p[2]; place = p[0]; }
    return { lat: lat, lon: lon, place: place, tz: parseFloat($("#hsTz").value), sunrise: $("#hsSunrise").checked, ziMode: $("#hsZi").value, hidden: $("#hsHidden").checked, lunarMonthOverride: +$("#hsLunar").value || null };
  }

  $("#hsForm").addEventListener("submit", function (e) {
    e.preventDefault(); touch();
    var err = $("#hsErr"); err.textContent = "";
    var dt = readDate($("#hsDay"), $("#hsMonth"), $("#hsYear"), eraVal());
    if (dt.err) { err.textContent = dt.err; return; }
    var t = $("#hsNoTime").checked ? null : parseTime($("#hsTime").value);
    var name = $("#hsName").value.trim();
    var inp = Object.assign({ y: dt.y, m: dt.m, d: dt.d, time: t, name: name }, settings());
    try { show(HS.analyze(inp)); } catch (ex) { console.error(ex); err.textContent = "คำนวณไม่สำเร็จ กรุณาตรวจสอบข้อมูล"; }
  });

  /* ---------- แท็บ ---------- */
  var tabs = Array.from(document.querySelectorAll('#hsTabs [role="tab"]'));
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
    tab.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selectTab(t); touch(); });
    t.addEventListener("keydown", function (e) {
      var j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
      if (j == null) return; e.preventDefault(); selectTab(tabs[(j + tabs.length) % tabs.length], true);
    });
  });

  /* ---------- SVG: วงทักษา 8 ดาว ---------- */
  // ตำแหน่งทิศ: อาทิตย์ NE, จันทร์ E, อังคาร SE, พุธ S, เสาร์ SW, พฤหัส W, ราหู NW, ศุกร์ N
  var DIR_ANGLE = { 0: -45, 1: 0, 2: 45, 3: 90, 6: 135, 4: 180, 7: 225, 5: 270 };
  function taksaWheel(P) {
    var cx = 160, cy = 160, R = 150, r0 = 58, out = [];
    var pt = function (a, r) { return [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)]; };
    HS.TAKSA_ORDER.forEach(function (p) {
      var a = DIR_ANGLE[p], a0 = a - 22.5, a1 = a + 22.5;
      var p0 = pt(a0, R), p1 = pt(a1, R), q0 = pt(a1, r0), q1 = pt(a0, r0);
      var mine = p === P.thaiDay.planet, bh = HS.bhumiOf(P.thaiDay.planet, p), d = DAYS[p];
      out.push('<path d="M' + p0 + " A" + R + " " + R + " 0 0 1 " + p1 + " L" + q0 + " A" + r0 + " " + r0 + " 0 0 0 " + q1 + 'Z" fill="' + d.hex + '" fill-opacity="' + (mine ? 1 : 0.82) + '" stroke="#fff" stroke-width="' + (mine ? 4 : 2) + '"/>');
      var l1 = pt(a, 120), l2 = pt(a, 88);
      var fg = p === 1 ? "#3d2d00" : "#fff";
      out.push('<text x="' + l1[0].toFixed(1) + '" y="' + l1[1].toFixed(1) + '" fill="' + fg + '" font-size="13" font-weight="600" text-anchor="middle" dominant-baseline="middle">' + esc(d.planet.replace("พระ", "")) + " " + d.num + "</text>");
      out.push('<text x="' + l2[0].toFixed(1) + '" y="' + l2[1].toFixed(1) + '" fill="' + fg + '" font-size="12" text-anchor="middle" dominant-baseline="middle">' + esc(KB.bhumi[bh].th) + "</text>");
    });
    out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (r0 - 4) + '" fill="#fff"/>');
    out.push('<text x="' + cx + '" y="' + (cy - 9) + '" font-size="13" fill="#525c78" text-anchor="middle">ทักษาของ</text>');
    out.push('<text x="' + cx + '" y="' + (cy + 12) + '" font-size="15" font-weight="600" fill="#0e1430" text-anchor="middle">' + esc(DAYS[P.thaiDay.planet].name.replace(" (กลางวัน)", "").replace(" (ราหู)", "")) + "</text>");
    out.push('<text x="' + cx + '" y="8" font-size="11" fill="#525c78" text-anchor="middle" dominant-baseline="hanging">เหนือ</text>');
    return '<svg class="hs-wheel" viewBox="-6 -6 332 332" role="img" aria-label="วงทักษา 8 ดาว พร้อมภูมิของคุณ">' + out.join("") + "</svg>";
  }

  /* ---------- SVG: ห้าธาตุ (รูปห้าเหลี่ยม) ---------- */
  function pentagon(P) {
    var cx = 170, cy = 168, R = 112, order = HS.ELEMENTS, c = P.counts, fav = P.favorable.primary, dm = P.dayMaster;
    var max = Math.max.apply(null, order.map(function (k) { return c[k]; })) || 1;
    var pos = {}; order.forEach(function (k, i) { var a = (-90 + 72 * i) * Math.PI / 180; pos[k] = [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
    var out = ['<defs><marker id="hsArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#9aa3bd"/></marker></defs>'];
    var shorten = function (a, b, s) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); return [a[0] + dx * s / L, a[1] + dy * s / L, b[0] - dx * s / L, b[1] - dy * s / L]; };
    order.forEach(function (k) {
      var g = shorten(pos[k], pos[HS.GEN[k]], 40); out.push('<line x1="' + g[0] + '" y1="' + g[1] + '" x2="' + g[2] + '" y2="' + g[3] + '" stroke="#9aa3bd" stroke-width="2" marker-end="url(#hsArr)"/>');
      var t = shorten(pos[k], pos[HS.CTRL[k]], 42); out.push('<line x1="' + t[0] + '" y1="' + t[1] + '" x2="' + t[2] + '" y2="' + t[3] + '" stroke="#c9cfe0" stroke-width="1.5" stroke-dasharray="4 4"/>');
    });
    order.forEach(function (k) {
      var e = EL[k], r = 20 + 16 * (c[k] / max), p = pos[k];
      if (k === dm) out.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (r + 6) + '" fill="none" stroke="#0e1430" stroke-width="2.5"/>');
      out.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + r + '" fill="' + e.color + '" fill-opacity="' + (c[k] ? 0.92 : 0.18) + '" stroke="' + e.color + '" stroke-width="' + (c[k] ? 0 : 1.5) + '" stroke-dasharray="' + (c[k] ? "" : "3 3") + '"/>');
      out.push('<text x="' + p[0] + '" y="' + (p[1] - 5) + '" font-size="16" font-weight="700" fill="' + (c[k] ? "#fff" : e.color) + '" text-anchor="middle" dominant-baseline="middle">' + e.zh + "</text>");
      out.push('<text x="' + p[0] + '" y="' + (p[1] + 12) + '" font-size="11" fill="' + (c[k] ? "#fff" : "#0e1430") + '" text-anchor="middle" dominant-baseline="middle">' + c[k] + "</text>");
      var ly = p[1] + (p[1] > cy ? r + 16 : -r - 12);
      out.push('<text x="' + p[0] + '" y="' + ly + '" font-size="13" fill="#0e1430" text-anchor="middle" font-weight="' + (k === fav ? 700 : 500) + '">' + esc(e.th) + (k === dm ? " (ตัวเรา)" : "") + (k === fav ? " ★" : "") + "</text>");
    });
    return '<svg class="hs-penta" viewBox="0 0 340 340" role="img" aria-label="แผนภาพห้าธาตุ: ' + order.map(function (k) { return EL[k].th + " " + c[k]; }).join(", ") + '">' + out.join("") + "</svg>";
  }

  /* ---------- เนื้อหาแต่ละแท็บ ---------- */
  function pillarCell(label, p, isDay) {
    if (!p) return '<div class="pl pl-empty"><span class="pl-k">' + label + '</span><b class="pl-c">?</b><b class="pl-c">?</b><small>ไม่ทราบเวลาเกิด</small></div>';
    var se = HS.STEM_EL[p.stem], be = HS.BRANCH_EL[p.branch], st = KB.stems[p.stem], an = KB.animals[p.branch];
    var hid = HS.HIDDEN[p.branch].map(function (s) { var e = HS.STEM_EL[s]; return '<i style="color:' + EL[e].color + '" title="' + esc(EL[e].th) + '">' + HS.STEMS[s] + "</i>"; }).join("");
    return '<div class="pl' + (isDay ? " pl-day" : "") + '"><span class="pl-k">' + label + (isDay ? " · ตัวเรา" : "") + "</span>" +
      '<b class="pl-c" style="color:' + EL[se].color + '">' + HS.STEMS[p.stem] + '</b><small>' + esc(st.th) + " · " + esc(EL[se].th + st.yy) + "</small>" +
      '<b class="pl-c" style="color:' + EL[be].color + '">' + HS.BRANCHES[p.branch] + '</b><small>' + esc(an.th + " (" + an.an + ")") + " · " + esc(EL[be].th) + "</small>" +
      '<span class="pl-h" aria-label="ก้านแฝง">ก้านแฝง ' + hid + "</span></div>";
  }
  function factCard(k, v, sub, color) {
    return '<div class="fact"' + (color ? ' style="--c:' + color + '"' : "") + '><span class="fact-k">' + k + '</span><b class="fact-v">' + v + "</b>" + (sub ? '<small>' + sub + "</small>" : "") + "</div>";
  }
  function colorAdvice(base) {
    var t = HS.taksa(base);
    return [["sri", "โชคลาภ เสน่ห์"], ["dech", "การงาน ความน่าเชื่อถือ"], ["montri", "ผู้ใหญ่เอ็นดู"], ["ayu", "สดชื่น อารมณ์ดี"]].map(function (x) { return '<li>' + swatch(t[x[0]]) + "<span><b>" + KB.bhumi[x[0]].th + "</b> — " + x[1] + "</span></li>"; }).join("") +
      '<li class="soft">' + swatch(t.kalakini) + "<span><b>กาลกิณี</b> — ตามความเชื่อแนะให้ลดการใช้สีนี้ในวันสำคัญ (ไม่ต้องกังวล ใช้ได้ตามสะดวก)</span></li>";
  }
  function dayTitle(P) { return DAYS[P.thaiDay.planet].name.replace(" (กลางวัน)", ""); }
  function thaiDayNote(P) {
    var t = P.thaiDay, n = [];
    if (t.shifted) n.push("เกิดก่อน 6 โมงเช้า — ตามโหราศาสตร์ไทยนับเป็นวันก่อนหน้า (ปิดได้ในตั้งค่าเพิ่มเติม)");
    if (t.rahu) n.push("เกิดวันพุธช่วง 18:00–05:59 จึงเป็น \"พุธกลางคืน\" ดาวประจำวันคือพระราหู");
    if (t.maybeRahu) n.push("ถ้าเกิดวันพุธหลัง 18:00 น. จะนับเป็นพุธกลางคืน (ราหู) — ใส่เวลาเกิดเพื่อความแม่นยำ");
    return n.map(function (s) { return '<p class="note">' + esc(s) + "</p>"; }).join("");
  }

  function renderOverview(P) {
    var d = DAYS[P.thaiDay.planet], z = P.zodiac, ra = KB.rasi[P.sunRasi.index], dm = EL[P.dayMaster], lp = KB.numbers[P.lifePath.value];
    var yEl = HS.STEM_EL[P.bazi.year.stem];
    var html = '<div class="hero" style="--c:' + d.hex + '"><div class="hero-dot" aria-hidden="true">' + esc(d.short) + '</div><div><span class="hero-k">เกิด' + esc(dayTitle(P)) + " · สี" + esc(d.color) + '</span><h3>' + esc(d.planet) + "ทรง" + esc(d.vehicle) + "</h3><p>" + esc(d.desc) + "</p></div></div>" + thaiDayNote(P);
    html += '<div class="facts">' +
      factCard("ราศีเกิด (ไทย)", esc(ra.sym + " ราศี" + ra.th), esc(KB.rasiEl[ra.el] + " · " + ra.trait)) +
      factCard("ลัคนา", P.lagna ? esc("ราศี" + KB.rasi[P.lagna.index].th) : "—", P.lagna ? "คำนวณโดยประมาณ" : "ใส่เวลาเกิดเพื่อคำนวณ") +
      factCard("ปีนักษัตร", esc("ปี" + KB.animals[z.thai.animal].th), esc(KB.animals[z.thai.animal].an + " · ธาตุ" + EL[HS.STEM_EL[HS.cyc(z.thai.year - 4).stem]].th)) +
      factCard("ธาตุประจำตัว (ปาจื้อ)", esc(dm.zh + " " + dm.th), esc(KB.stems[P.bazi.day.stem].th + " " + HS.STEMS[P.bazi.day.stem]), dm.color) +
      factCard("เลขชีวิต", String(P.lifePath.value), esc(lp.k)) +
      factCard("พระประจำวันเกิด", esc(d.buddha), "") + "</div>";
    html += '<div class="hs-grid2"><section class="hs-block"><h3>นิสัยเด่น</h3><ul class="pills">' + d.traits.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      "<p>คุณมีพลังของ" + esc(d.planet) + "ผสานกับ" + esc(elName(P.dayMaster)) + " — " + esc(dm.dm) + " ปีนักษัตร" + esc(KB.animals[z.thai.animal].th) + "เสริมให้" + esc(KB.animals[z.thai.animal].trait) + " และเลขชีวิต " + P.lifePath.value + " บอกว่าคุณเป็น" + esc(lp.k) + " " + esc(lp.t) + "</p></section>" +
      '<section class="hs-block"><h3>สีมงคลประจำตัว (ตามทักษาวันเกิด)</h3><ul class="advice">' + colorAdvice(P.thaiDay.planet) + "</ul></section></div>";
    $("#pn-ov").innerHTML = html;
    void yEl;
  }

  function renderThai(P) {
    var d = DAYS[P.thaiDay.planet], t = P.taksa, z = P.zodiac, ra = KB.rasi[P.sunRasi.index], inp = P.input;
    var html = '<section class="hs-block"><h3>วันเกิดและดาวประจำวัน</h3><div class="hs-grid2"><dl class="kv">' +
      "<dt>วันเกิด</dt><dd>" + esc(d.name) + (P.thaiDay.shifted ? " <small>(นับแบบไทย)</small>" : "") + "</dd>" +
      "<dt>ดาวประจำวัน</dt><dd>" + esc(d.planet) + " (เลข " + d.num + ", กำลัง " + d.power + ")</dd>" +
      "<dt>เทวดาประจำวัน</dt><dd>" + esc(d.planet) + "ทรง" + esc(d.vehicle) + "</dd>" +
      "<dt>สีประจำวันเกิด</dt><dd>" + swatch(P.thaiDay.planet) + "</dd>" +
      "<dt>ทิศของดาว</dt><dd>" + esc(d.dir) + "</dd>" +
      "<dt>พระประจำวันเกิด</dt><dd><b>" + esc(d.buddha) + "</b><br><small>" + esc(d.buddhaNote) + "</small></dd></dl>" +
      "<div><p>" + esc(d.desc) + '</p><ul class="pills">' + d.traits.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" + thaiDayNote(P) + "</div></div></section>";
    html += '<section class="hs-block"><h3>ทักษาปกรณ์ — ภูมิทั้ง 8 ของคุณ</h3><div class="hs-grid2 wheelgrid">' + taksaWheel(P) +
      '<div class="table-wrap"><table class="hs-table bhumi"><thead><tr><th scope="col">ภูมิ</th><th scope="col">ดาว</th><th scope="col">สี</th><th scope="col">ความหมาย</th></tr></thead><tbody>' +
      HS.BHUMI.map(function (b) { var p = t[b]; return '<tr' + (b === "kalakini" ? ' class="soft"' : "") + '><th scope="row">' + esc(KB.bhumi[b].th) + "</th><td>" + esc(DAYS[p].planet) + " " + DAYS[p].num + "</td><td>" + swatch(p) + "</td><td>" + esc(KB.bhumi[b].mean) + "</td></tr>"; }).join("") +
      '</tbody></table></div></div><p class="hs-small">ลงภูมิ "บริวาร" ที่ดาววันเกิด แล้วเวียนขวาตามวงทักษา 1-2-3-4-7-5-8-6 (อาทิตย์ จันทร์ อังคาร พุธ เสาร์ พฤหัสบดี ราหู ศุกร์) · อักษรที่ตำราตั้งชื่อนิยมเลี่ยง (อักษรกาลกิณี): ' + esc(DAYS[t.kalakini].letters) + "</p></section>";
    // ตารางสีเสื้อ 7 วัน
    var cols = [["sri", "ศรี · โชคลาภ"], ["dech", "เดช · การงาน"], ["montri", "มนตรี · อุปถัมภ์"], ["ayu", "อายุ · สดชื่น"], ["kalakini", "ควรเลี่ยง"]];
    var today = new Date().getDay();
    html += '<section class="hs-block"><h3>สีเสื้อมงคล 7 วัน (ตามทักษาของวันที่สวมใส่)</h3><div class="table-wrap"><table class="hs-table colors"><thead><tr><th scope="col">วัน</th>' + cols.map(function (c) { return '<th scope="col">' + c[1] + "</th>"; }).join("") + "</tr></thead><tbody>" +
      [0, 1, 2, 3, 4, 5, 6].map(function (w) { var tk = HS.taksa(w); return '<tr' + (w === today ? ' class="today"' : "") + '><th scope="row">' + esc(KB.weekdayNames[w]) + (w === today ? " <small>วันนี้</small>" : "") + "</th>" + cols.map(function (c) { return '<td data-k="' + esc(c[1]) + '">' + swatch(tk[c[0]]) + "</td>"; }).join("") + "</tr>"; }).join("") +
      '</tbody></table></div><p class="hs-small">คำนวณจากทักษาของวันที่สวมใส่ (เริ่มบริวารที่ดาวของวันนั้น) ตำราบางสำนักให้สีต่างไปเล็กน้อย สีที่ "ควรเลี่ยง" เป็นเพียงความเชื่อ ใส่ได้ตามสะดวก</p></section>';
    // ราศีและลัคนา
    var lag = P.lagna;
    html += '<div class="hs-grid2"><section class="hs-block"><h3>ราศีและลัคนา (แบบไทย นิรายนะ)</h3><dl class="kv">' +
      "<dt>ราศีเกิด (อาทิตย์สถิต)</dt><dd><b>" + esc(ra.sym + " ราศี" + ra.th) + "</b> " + P.sunRasi.deg.toFixed(1) + "°<br><small>" + esc(KB.rasiEl[ra.el] + " · ช่วงโดยประมาณ " + ra.range) + "</small></dd>" +
      "<dt>ลัคนา</dt><dd>" + (lag ? "<b>ราศี" + esc(KB.rasi[lag.index].th) + "</b> " + lag.deg.toFixed(1) + "°<br><small>" + esc(KB.rasi[lag.index].trait) + "</small>" : "ใส่เวลาเกิดเพื่อคำนวณลัคนา") + "</dd>" +
      "</dl><p class=\"hs-small\">คำนวณจากตำแหน่งดวงอาทิตย์จริงและอายนางศ์ลาหิรี (ใกล้เคียงสุริยยาตรของไทย ต่างกันราว 1°) " + (lag ? "ลัคนาใช้พิกัด " + esc(inp.place || "") + " (" + inp.lat.toFixed(2) + ", " + inp.lon.toFixed(2) + ") เวลา UTC" + (inp.tz >= 0 ? "+" : "") + inp.tz + " — เป็นค่าโดยประมาณ ถ้าใกล้รอยต่อราศี (ต่ำกว่า 1° หรือเกิน 29°) ตำราไทยอาจได้ราศีข้างเคียง" : "") + "</p></section>";
    // ปีนักษัตร
    var c = z.chinese.cny;
    html += '<section class="hs-block"><h3>ปีนักษัตร</h3><dl class="kv">' +
      "<dt>แบบไทย</dt><dd><b>ปี" + esc(KB.animals[z.thai.animal].th) + "</b> <small>(เปลี่ยนวันขึ้น 1 ค่ำ เดือน 5 ≈ " + thDate(z.thai.month5.y, z.thai.month5.m, z.thai.month5.d) + ")</small></dd>" +
      "<dt>แบบจีน (ตรุษจีน)</dt><dd><b>ปี" + esc(KB.animals[z.chinese.animal].th) + "</b> ธาตุ" + esc(EL[HS.STEM_EL[z.chinese.stem]].th) + " <small>(ตรุษจีน " + thDate(c.y, c.m, c.d) + ")</small></dd>" +
      "<dt>ปาจื้อ (ลี่ชุน)</dt><dd><b>ปี" + esc(KB.animals[z.lichun.animal].th) + "</b> <small>(เปลี่ยนวันลี่ชุน ≈ 4 ก.พ.)</small></dd></dl>" +
      (z.differ ? '<p class="note">วันเกิดของคุณอยู่ช่วงรอยต่อปีนักษัตร แต่ละระบบจึงให้ปีต่างกัน — ทุกแบบถูกต้องตามหลักของตัวเอง</p>' : "") +
      '<p class="hs-small">ตำราไทยส่วนใหญ่เปลี่ยนนักษัตรวันขึ้น 1 ค่ำ เดือน 5 (บางแหล่งระบุเดือนอ้าย และไม่ใช่วันสงกรานต์) วันจันทรคติที่นี่คำนวณจากดิถีจันทร์ดับ คลาดเคลื่อนได้ ±1 วัน</p>' +
      '<details class="hs-how" id="hsCnyBox"><summary>ตารางวันตรุษจีน ค.ศ. 1930–2060</summary><div id="hsCny" class="cny"></div></details></section></div>';
    // เลข 7 ตัว
    var s = P.seven;
    var lmName = KB.lunarMonths[inp.lunarMonthOverride || P.lunar.month];
    html += '<section class="hs-block"><h3>เลข 7 ตัว (3 ฐาน + ผลรวม)</h3><div class="table-wrap"><table class="hs-table seven"><tbody>' +
      KB.sevenRows.map(function (r) { return '<tr><th scope="row">' + esc(r.th) + "</th>" + s[r.key].map(function (v, i) { return "<td><b>" + v + "</b><small>" + esc(r.pos[i]) + "</small></td>"; }).join("") + "</tr>"; }).join("") +
      '<tr class="sum"><th scope="row">ผลรวม</th>' + s.sum.map(function (v) { return "<td><b>" + v + "</b></td>"; }).join("") + "</tr></tbody></table></div>" +
      '<p class="hs-small">ตั้งฐาน: วันเกิดเลข ' + s.starts[0] + " · " + esc(lmName) + (inp.lunarMonthOverride ? " (กำหนดเอง)" : " (คำนวณโดยประมาณจากดิถีจันทร์ดับ ปรับได้ในตั้งค่าเพิ่มเติม)") + " · ปี" + esc(KB.animals[z.thai.animal].th) + " เลข " + s.starts[2] + " — แต่ละแถวเริ่มที่เลขของตนแล้วนับเรียง 1–7 วนซ้ำ ผลรวมใช้ดูน้ำหนักของแต่ละภพ (ยิ่งมากยิ่งเด่น) นี่คือตารางพื้นฐาน ระบบเต็ม \"เลข 7 ตัว 9 ฐาน\" มีฐานเพิ่มเติม</p>" +
      '<ul class="hs-small seven-top">' + topSeven(s).map(function (x) { return "<li><b>" + esc(x.pos) + "</b> (" + x.v + ") — " + esc(KB.sevenMeaning[x.pos] || "") + "</li>"; }).join("") + "</ul></section>";
    $("#pn-th").innerHTML = html;
    $("#hsCnyBox").addEventListener("toggle", function () {
      var box = $("#hsCny"); if (!this.open || box.childElementCount) return;
      var rows = []; for (var y = 1930; y <= 2060; y++) { var q = HS.chineseNewYear(y); rows.push('<span' + (y === c.y ? ' class="on"' : "") + "><b>" + y + "</b> " + q.d + " " + KB.monthsShort[q.m - 1] + " <small>" + esc(KB.animals[HS.cyc(y - 4).branch].th) + "</small></span>"); }
      box.innerHTML = rows.join("");
    });
  }
  function topSeven(s) {
    var names = KB.sevenRows[0].pos, all = [];
    s.sum.forEach(function (v, i) { all.push({ v: v, pos: names[i] }); });
    return all.sort(function (a, b) { return b.v - a.v; }).slice(0, 3);
  }

  function renderBazi(P) {
    var b = P.bazi, dm = EL[P.dayMaster], f = P.favorable, fe = EL[f.primary], fe2 = EL[f.secondary];
    var yEl = EL[HS.STEM_EL[b.year.stem]];
    var html = '<section class="hs-block"><h3>สี่เสา (四柱八字)</h3><div class="pillars">' + pillarCell("ปี 年", b.year) + pillarCell("เดือน 月", b.month) + pillarCell("วัน 日", b.day, true) + pillarCell("ยาม 時", b.hour) + "</div>" +
      '<p class="reading">ปี' + esc(KB.animals[b.year.branch].th) + " ธาตุ" + esc(yEl.th) + " · เดือน" + esc(KB.animals[b.month.branch].th) + " · วัน" + esc(KB.stems[b.day.stem].th + KB.animals[b.day.branch].th) + (b.hour ? " · ยาม" + esc(KB.animals[b.hour.branch].th) : "") + "</p>" +
      (b.unsure ? '<p class="note">วันเกิดตรงกับวันเปลี่ยนเดือนตามสุริยคติจีน ถ้าไม่ทราบเวลา เสาเดือนอาจเป็นเดือนข้างเคียง</p>' : "") +
      (P.input.time && P.input.time.h >= 23 ? '<p class="note">เกิดยามจื่อดึก (23:00 น. ขึ้นไป) ใช้วิธี: ' + (b.ziMode === "23" ? "เปลี่ยนวันตอน 23:00" : "เปลี่ยนวันตอนเที่ยงคืน") + " (ปรับได้ในตั้งค่าเพิ่มเติม)</p>" : "") + "</section>";
    html += '<div class="hs-grid2"><section class="hs-block dm" style="--c:' + dm.color + ";--s:" + dm.soft + '"><span class="fact-k">ธาตุประจำตัว (Day Master 日主)</span><h3 class="dm-h">' + esc(dm.zh + " " + KB.stems[b.day.stem].th + " · " + dm.th + KB.stems[b.day.stem].yy) + "</h3><p>" + esc(dm.dm) + "</p>" +
      '<p class="hs-small">ความแข็งของธาตุตัวเอง (ธาตุเดียวกัน + ธาตุที่หนุน): ' + Math.round(f.ratio * 100) + "% → " + (f.strong ? "ค่อนข้างแข็ง" : "ค่อนข้างอ่อน") + "</p></section>" +
      '<section class="hs-block"><h3>ธาตุเสริม (แบบง่าย)</h3><p>ธาตุที่ช่วยให้สมดุล: ' + elChip(f.primary) + " " + elChip(f.secondary) + "</p><dl class=\"kv\"><dt>สีนำโชค</dt><dd>" + esc(fe.colors + " / " + fe2.colors) + "</dd><dt>ทิศมงคล</dt><dd>" + esc(fe.dir) + "</dd><dt>เลขเสริม</dt><dd>" + esc(fe.num) + "</dd><dt>เคล็ดลับ</dt><dd>" + esc(fe.boost) + "</dd></dl>" +
      '<p class="hs-small">หลักง่าย: ถ้าธาตุตัวเองแข็ง เสริมธาตุที่ช่วยระบาย ถ้าอ่อน เสริมธาตุแม่หรือธาตุเดียวกัน — เป็นการประเมินแบบย่อ ซินแสจริงพิจารณาฤดูเกิดและโครงสร้างดวงละเอียดกว่านี้</p></section></div>';
    html += '<section class="hs-block"><h3>สมดุลห้าธาตุ' + (P.input.hidden ? " (รวมก้านแฝง)" : " (ก้านบน + กิ่งล่าง)") + '</h3><div class="hs-grid2 pentagrid">' + pentagon(P) +
      '<div><div class="elbars">' + HS.ELEMENTS.map(function (k) { var tot = HS.ELEMENTS.reduce(function (s, x) { return s + P.counts[x]; }, 0) || 1; return '<div class="elbar"><span>' + esc(EL[k].th) + '</span><i style="--w:' + Math.round(P.counts[k] / tot * 100) + "%;--c:" + EL[k].color + '"></i><b>' + P.counts[k] + "</b></div>"; }).join("") + "</div>" +
      '<p class="hs-small">ลูกศรทึบ = วงจรให้กำเนิด (ไม้→ไฟ→ดิน→ทอง→น้ำ→ไม้) · เส้นประ = วงจรข่ม · วงขอบเข้ม = ธาตุตัวเรา · ★ = ธาตุเสริม</p></div></div></section>';
    var lc = HS.localFromJD(b.lichun, 7);
    html += '<details class="hs-how"><summary>ดูวิธีคำนวณ</summary><ul class="hs-small">' +
      "<li>เสาปี: เปลี่ยนที่ลี่ชุน 立春 (อาทิตย์ลองจิจูด 315°) ปีนี้ตรงกับ " + thDate(lc.y, lc.m, lc.d) + " " + hm(lc.h, lc.mi) + " น. (เวลาไทย)</li>" +
      "<li>เสาเดือน: ลองจิจูดดวงอาทิตย์ขณะเกิด " + b.sunLon.toFixed(2) + "° → เดือนที่ " + (b.monthIndex + 1) + " นับจากเดือนขาล 寅 (เปลี่ยนทุก 30° ที่ 315°, 345°, 15° …)</li>" +
      "<li>เสาวัน: จากเลขวันจูเลียน (1 ม.ค. 2000 = 戊午) รอบ 60 วัน</li>" +
      "<li>เสายาม: ช่วงละ 2 ชั่วโมงตามเวลานาฬิกา (ไม่ปรับเวลาสุริยะจริง) ก้านยามตามสูตร 五鼠遁</li>" +
      "<li>ตำแหน่งดวงอาทิตย์ตามสูตร Meeus ความแม่นยำราว ±15 นาที ตรวจสอบกับตารางสารทของหอดูดาวญี่ปุ่นปี 2024–2025</li></ul></details>";
    $("#pn-bz").innerHTML = html;
  }

  function renderNum(P) {
    var lp = P.lifePath, n = KB.numbers[lp.value], bd = KB.numbers[P.birthday], inp = P.input;
    var html = '<div class="hs-grid2"><section class="hs-block bignum"><span class="fact-k">เลขชีวิต (Life Path)</span><b class="big">' + lp.value + "</b><h3>" + esc(n.k) + "</h3><p>" + esc(n.t) + "</p>" +
      '<p class="hs-small">วิธีคิด: เดือน ' + inp.m + " → " + lp.parts[0] + " · วัน " + inp.d + " → " + lp.parts[1] + " · ปี ค.ศ. " + inp.y + " → " + lp.parts[2] + " · รวม " + lp.total + (lp.total !== lp.value ? " → " + lp.value : "") + " (เก็บเลขมาสเตอร์ 11, 22, 33 ไว้ ไม่ลดต่อ)</p></section>" +
      '<section class="hs-block bignum"><span class="fact-k">เลขวันเกิด (Birthday Number)</span><b class="big">' + P.birthday + "</b><h3>" + esc(bd.k) + "</h3><p>" + esc(bd.t) + "</p><p class=\"hs-small\">จากวันที่ " + inp.d + " ลดเหลือหลักเดียว (ยกเว้น 11, 22)</p></section></div>";
    html += '<section class="hs-block"><h3>ผลรวมเลขชื่อ (เลขศาสตร์ไทย)</h3><label>ชื่อที่ต้องการคำนวณ<input id="hsNameNum" type="text" maxlength="60" autocomplete="off" value="' + esc(inp.name || "") + '" placeholder="พิมพ์ชื่อภาษาไทย"></label><div id="hsNameOut" aria-live="polite"></div>' +
      '<p class="hs-small">ค่าพยัญชนะตามตารางที่เผยแพร่ทั่วไป (ก ด ถ ท ภ = 1, ข บ ป ง ช = 2 …) ส่วนสระและวรรณยุกต์ใช้ค่าที่พบบ่อย แต่ละสำนักกำหนดต่างกันเล็กน้อย ชื่อไม่ถูกบันทึก</p></section>';
    $("#pn-nu").innerHTML = html;
    var upd = function () {
      var r = HS.thaiNameNumber($("#hsNameNum").value), o = $("#hsNameOut");
      if (!r.sum) { o.innerHTML = '<p class="muted">พิมพ์ชื่อเพื่อดูผลรวม</p>'; return; }
      var root = HS.reduceNum(r.sum, false), m = KB.numbers[root];
      o.innerHTML = '<p class="namesum"><b>' + r.sum + "</b> → " + root + " · " + esc(m.k) + " — " + esc(m.t) + '</p><p class="letters">' + r.detail.map(function (x) { return "<span>" + esc(x[0]) + "<small>" + x[1] + "</small></span>"; }).join("") + "</p>";
    };
    $("#hsNameNum").addEventListener("input", upd); upd();
  }

  function renderToday(P) {
    var now = new Date(), td = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
    var D = HS.daily(P, td), bh = KB.bhumi[D.bhumi], tk = D.taksaToday, rel = KB.relations[D.rel];
    var mo = HS.monthly(P, HS.julianDay(td.y, td.m, td.d, now.getHours() + now.getMinutes() / 60) - 7 / 24), mrel = KB.relations[mo.rel];
    var html = '<p class="today-h">' + esc("วัน" + KB.weekdayNames[D.weekday] + "ที่ " + thDateLong(td.y, td.m, td.d)) + "</p>";
    html += '<div class="hs-grid2"><section class="hs-block"><h3>ทักษาจร: วันนี้เป็นวัน "' + esc(bh.th) + '" ของคุณ</h3><p>' + esc(bh.day) + '</p><p class="hs-small">เทียบดาววันนี้ (' + esc(DAYS[D.weekday].planet) + ") กับทักษาวันเกิดของคุณ (" + esc(DAYS[P.thaiDay.planet].planet) + ")</p></section>" +
      '<section class="hs-block"><h3>ปาจื้อวันนี้: ' + D.pillar.gz + " " + elChip(D.todayEl) + "</h3><p><b>" + esc(rel.th) + "</b> — " + esc(rel.day) + "</p>" +
      (D.clash ? '<p class="note">วันนี้กิ่งวันชงกับปีนักษัตรของคุณ (ตามความเชื่อ) แนะนำให้ใจเย็น ค่อย ๆ ตัดสินใจ แล้ววันจะผ่านไปอย่างราบรื่น</p>' : "") + "</section></div>";
    html += '<section class="hs-block"><h3>สีเสื้อวันนี้</h3><ul class="advice">' +
      '<li>' + swatch(tk.sri) + "<span><b>ศรี</b> — โชคลาภ เสน่ห์</span></li><li>" + swatch(tk.dech) + "<span><b>เดช</b> — การงาน ความน่าเชื่อถือ</span></li><li>" + swatch(tk.montri) + "<span><b>มนตรี</b> — ผู้ใหญ่เอ็นดู</span></li>" +
      '<li class="soft">' + swatch(tk.kalakini) + "<span><b>ควรเลี่ยง</b> — ตามความเชื่อ (ใส่ได้ถ้าจำเป็น ไม่ต้องกังวล)</span></li></ul>" +
      '<div class="facts small">' + factCard("เลขนำโชค", D.lucky.join(" · "), "จากดาวศรีวันนี้ ธาตุเสริม และเลขชีวิต") + factCard("ทิศมงคล", esc(EL[D.favEl].dir), "ตามธาตุเสริม" + esc(EL[D.favEl].th)) + factCard("ทิศของดาวศรีวันนี้", esc(DAYS[tk.sri].dir), esc(DAYS[tk.sri].planet)) + "</div></section>";
    html += '<section class="hs-block"><h3>ดวงเดือนนี้</h3><p>เดือนตามสุริยคติจีน <b>' + mo.pillar.gz + "</b> " + elChip(HS.STEM_EL[mo.pillar.stem]) + " · อาทิตย์สถิตราศี" + esc(KB.rasi[mo.sunRasi].th) + "</p><p><b>" + esc(mrel.th) + "</b> — " + esc(mrel.day.replace("วันนี้", "เดือนนี้")) + "</p>" +
      (mo.branchRel === "clash" ? '<p class="note">เดือนนี้ชงกับปีนักษัตรของคุณ (ตามความเชื่อ) ใช้ความรอบคอบ วางแผนล่วงหน้า แล้วทุกอย่างจะลงตัว</p>' : mo.branchRel === "harmony" || mo.branchRel === "trine" ? '<p class="note good">เดือนนี้กิ่งเดือนประสานกับปีนักษัตรของคุณ — ช่วงดีสำหรับเริ่มต้นสิ่งใหม่และสร้างความร่วมมือ</p>' : "") + "</section>";
    $("#pn-td").innerHTML = html;
  }

  /* ---------- ดวงคู่ ---------- */
  $("#hsPartner").addEventListener("submit", function (e) {
    e.preventDefault(); touch();
    if (!current) return;
    var err = $("#hsPErr"); err.textContent = "";
    var raw = $("#hsPYear").value.replace(/\D/g, ""); $("#hsPYear").value = raw;
    var dt = readDate($("#hsPDay"), $("#hsPMonth"), $("#hsPYear"), "auto");
    if (dt.err) { err.textContent = dt.err; return; }
    var s = settings();
    var P2 = HS.analyze(Object.assign({}, s, { y: dt.y, m: dt.m, d: dt.d, time: parseTime($("#hsPTime").value), name: "", lunarMonthOverride: null }));
    renderCompat(current, P2, $("#hsPName").value.trim());
  });
  function renderCompat(P1, P2, pname) {
    var C = HS.compatibility(P1, P2), lv = KB.compat.levels.find(function (l) { return C.score >= l[0]; });
    var who = pname ? esc(pname) : "อีกคน";
    var line = function (w) {
      if (w.k === "zodiac") return "<li><b>ปีนักษัตร</b> ปี" + esc(KB.animals[P1.zodiac.chinese.animal].th) + " กับ ปี" + esc(KB.animals[P2.zodiac.chinese.animal].th) + " — " + esc(KB.branchRel[w.rel]) + "</li>";
      if (w.k === "element") return "<li><b>ธาตุประจำตัว</b> " + elChip(w.a) + " กับ " + elChip(w.b) + " — " + esc({ same: "ธาตุเดียวกัน เข้าใจกันง่าย", resource: "อีกฝ่ายเป็นธาตุที่หนุนคุณ", output: "คุณเป็นธาตุที่หนุนอีกฝ่าย", wealth: "คุณช่วยวางกรอบให้อีกฝ่ายได้ดี", power: "อีกฝ่ายช่วยให้คุณมีวินัยขึ้น" }[w.rel]) + "</li>";
      if (w.k === "thaiday") return "<li><b>วันเกิด</b> " + esc(DAYS[P1.thaiDay.planet].name) + " กับ " + esc(DAYS[P2.thaiDay.planet].name) + " — " + esc(w.friend ? KB.compat.thaiFriend : w.same ? KB.compat.thaiSame : (w.b1 === "kalakini" || w.b2 === "kalakini") ? KB.compat.thaiCare : (["sri", "dech", "montri", "mula"].indexOf(w.b1) >= 0 || ["sri", "dech", "montri", "mula"].indexOf(w.b2) >= 0) ? KB.compat.thaiGood : KB.compat.thaiNeutral) + "</li>";
      if (w.k === "rasi") return "<li><b>ราศี</b> " + esc(KB.rasi[P1.sunRasi.index].th) + " กับ " + esc(KB.rasi[P2.sunRasi.index].th) + " — " + esc(w.a === w.b ? KB.compat.rasiSame : w.pts >= 4 ? KB.compat.rasiGood : KB.compat.rasiOther) + "</li>";
      return "<li><b>เลขชีวิต</b> " + w.a + " กับ " + w.b + " — " + esc(w.pts >= 6 ? KB.compat.lpGood : w.pts === 5 ? KB.compat.lpSame : KB.compat.lpOther) + "</li>";
    };
    var R = 54, L = 2 * Math.PI * R;
    $("#hsCompat").innerHTML = '<section class="hs-block compat"><div class="ring"><svg viewBox="0 0 140 140" role="img" aria-label="ความเข้ากัน ' + C.score + '%"><circle cx="70" cy="70" r="' + R + '" fill="none" stroke="#eceffa" stroke-width="14"/><circle cx="70" cy="70" r="' + R + '" fill="none" stroke="#674ff2" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + (L * C.score / 100).toFixed(1) + " " + L.toFixed(1) + '" transform="rotate(-90 70 70)"/><text x="70" y="76" text-anchor="middle" font-size="30" font-weight="700" fill="#0e1430">' + C.score + '%</text></svg></div>' +
      "<div><h3>" + esc(lv[1]) + "</h3><p>คุณกับ" + who + " (" + esc(DAYS[P2.thaiDay.planet].name) + " · " + thDate(P2.input.y, P2.input.m, P2.input.d) + ") — " + esc(lv[2]) + '</p><ul class="why">' + C.why.map(line).join("") + '</ul><p class="hs-small">คะแนนเชิงบันเทิง (55–98%) รวมจากหลายศาสตร์ ความสัมพันธ์ที่ดีมาจากความเข้าใจและการใส่ใจกัน ไม่ใช่ตัวเลข</p></div></section>';
  }

  /* ---------- แสดงผล ---------- */
  var resultSec = $("#hsResult");
  function show(P) {
    current = P;
    var inp = P.input;
    $("#hsResSub").textContent = (inp.name ? inp.name + " · " : "") + "เกิด" + dayTitle(P) + (P.thaiDay.rahu ? " " : "") + "ที่ " + thDateLong(inp.y, inp.m, inp.d) + (inp.time ? " เวลา " + hm(inp.time.h, inp.time.mi) + " น." : " (ไม่ระบุเวลา)");
    renderOverview(P); renderThai(P); renderBazi(P); renderNum(P); renderToday(P);
    $("#hsCompat").innerHTML = "";
    resultSec.hidden = false; selectTab(tabs[0]);
    $("#hsCardImg").hidden = true;
    if (prefs.stats) { lsSet(STATS_KEY, HS.addStat(lsGet(STATS_KEY, null), P.zodiac.thai.animal)); renderStats(); }
    resultSec.scrollIntoView({ block: "start" });
    $("#hsResTitle").focus({ preventScroll: true });
    touch();
  }

  /* ---------- การ์ดแชร์ 1080×1350 ---------- */
  function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
  async function makeCard() {
    var P = current, d = DAYS[P.thaiDay.planet], dm = EL[P.dayMaster], b = P.bazi, z = P.zodiac, ra = KB.rasi[P.sunRasi.index];
    try { await Promise.all([document.fonts.load("700 60px Prompt"), document.fonts.load("500 30px Prompt"), document.fonts.load("400 30px Prompt")]); } catch (e) { /* ใช้ฟอนต์ระบบ */ }
    var W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d"), F = "Prompt, system-ui, sans-serif";
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0e1430"); g.addColorStop(1, "#1e2a5a"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    var rg = c.createRadialGradient(W / 2, 380, 30, W / 2, 380, 520); rg.addColorStop(0, d.hex + "88"); rg.addColorStop(1, "rgba(14,20,48,0)"); c.fillStyle = rg; c.fillRect(0, 0, W, H);
    // โลโก้
    c.save(); c.translate(72, 64); c.strokeStyle = "#22d3ee"; c.lineWidth = 4; c.lineCap = "round";
    rr(c, 0, 0, 60, 60, 18); c.fillStyle = "rgba(255,255,255,.08)"; c.fill();
    c.beginPath(); [[14, 24, 14, 14, 24, 14], [46, 24, 46, 14, 36, 14], [14, 36, 14, 46, 24, 46], [46, 36, 46, 46, 36, 46]].forEach(function (q) { c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.lineTo(q[4], q[5]); }); c.stroke();
    c.beginPath(); c.arc(30, 30, 8, 0, Math.PI * 2); c.fillStyle = "#8b78ff"; c.fill(); c.restore();
    c.textBaseline = "middle"; c.textAlign = "left"; c.font = "700 40px " + F; c.fillStyle = "#fff"; c.fillText("LENS", 148, 96);
    var lw = c.measureText("LENS").width; c.fillStyle = "#a99bff"; c.fillText("IQ", 148 + lw, 96);
    c.textAlign = "right"; c.font = "500 34px " + F; c.fillStyle = "#c9d0ea"; c.fillText("ดวงวันเดือนปีเกิด", W - 72, 96);
    // วงกลมสีวันเกิด
    var cy = 330; c.beginPath(); c.arc(W / 2, cy, 150, 0, Math.PI * 2); c.fillStyle = d.hex; c.fill();
    c.lineWidth = 10; c.strokeStyle = "rgba(255,255,255,.85)"; c.stroke();
    c.textAlign = "center"; c.fillStyle = P.thaiDay.planet === 1 ? "#3d2d00" : "#fff"; c.font = "700 64px " + F; c.fillText(d.short.replace("(ค)", ""), W / 2, cy - 18);
    c.font = "500 30px " + F; c.fillText("สี" + d.color.split(" / ")[0], W / 2, cy + 46);
    c.fillStyle = "#fff"; c.font = "700 70px " + F; c.fillText("เกิด" + dayTitle(P).replace(" (ราหู)", ""), W / 2, 560);
    c.font = "400 32px " + F; c.fillStyle = "#c9d0ea"; c.fillText(d.planet + "ทรง" + d.vehicle + " · " + d.buddha, W / 2, 624);
    // สี่เสา
    var ps = [["ปี", b.year], ["เดือน", b.month], ["วัน", b.day], ["ยาม", b.hour]], bw = 190, gap = 24, x0 = (W - (bw * 4 + gap * 3)) / 2;
    ps.forEach(function (q, i) {
      var x = x0 + i * (bw + gap), y = 676; rr(c, x, y, bw, 276, 26); c.fillStyle = i === 2 ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.07)"; c.fill();
      c.fillStyle = "#c9d0ea"; c.font = "400 26px " + F; c.fillText(q[0], x + bw / 2, y + 34);
      if (!q[1]) { c.fillStyle = "#8f9bc4"; c.font = "500 60px " + F; c.fillText("?", x + bw / 2, y + 140); c.font = "400 22px " + F; c.fillText("ไม่ทราบเวลา", x + bw / 2, y + 248); return; }
      c.font = "700 72px 'Noto Serif SC', 'Songti SC', serif";
      var cc = function (e) { return e === "metal" ? "#d5dae3" : EL[e].color; };
      c.fillStyle = cc(HS.STEM_EL[q[1].stem]); c.fillText(HS.STEMS[q[1].stem], x + bw / 2, y + 100);
      c.fillStyle = cc(HS.BRANCH_EL[q[1].branch]); c.fillText(HS.BRANCHES[q[1].branch], x + bw / 2, y + 180);
      c.fillStyle = "#fff"; c.font = "400 26px " + F; c.fillText(KB.animals[q[1].branch].th, x + bw / 2, y + 248);
    });
    // ชิปข้อมูล
    var chips = ["ราศี" + ra.th, "ปี" + KB.animals[z.thai.animal].th, "ธาตุ" + dm.th, "เลขชีวิต " + P.lifePath.value];
    c.font = "500 34px " + F;
    var cw = chips.map(function (t) { return c.measureText(t).width + 56; }), tot = cw.reduce(function (s, v) { return s + v; }, 0) + 16 * 3, cx = (W - tot) / 2;
    chips.forEach(function (t, i) { rr(c, cx, 982, cw[i], 70, 35); c.fillStyle = "rgba(255,255,255,.1)"; c.fill(); c.fillStyle = "#fff"; c.fillText(t, cx + cw[i] / 2, 1018); cx += cw[i] + 16; });
    // สีมงคลวันนี้
    var tk = HS.taksa(new Date().getDay());
    c.font = "400 30px " + F; c.fillStyle = "#c9d0ea"; c.fillText("สีเสื้อมงคลวันนี้", W / 2, 1100);
    [tk.sri, tk.dech, tk.montri].forEach(function (p, i) {
      var x = W / 2 + (i - 1) * 250; c.beginPath(); c.arc(x - 70, 1160, 22, 0, Math.PI * 2); c.fillStyle = DAYS[p].hex; c.fill();
      c.fillStyle = "#fff"; c.textAlign = "left"; c.font = "500 28px " + F; c.fillText(["ศรี", "เดช", "มนตรี"][i] + " " + DAYS[p].color.split(" / ")[0], x - 38, 1162); c.textAlign = "center";
    });
    c.font = "400 24px " + F; c.fillStyle = "#8f9bc4"; c.fillText(KB.disclaimerShort + " · คำนวณในเครื่อง ไม่บันทึกข้อมูล", W / 2, 1290);
    return cv;
  }
  var cardUrl = null;
  $("#hsShare").addEventListener("click", async function () {
    if (!current) return; touch();
    var b = this; b.disabled = true;
    try {
      var cv = await makeCard();
      var blob = await new Promise(function (r) { cv.toBlob(r, "image/png"); });
      if (cardUrl) URL.revokeObjectURL(cardUrl);
      cardUrl = URL.createObjectURL(blob);
      var im = $("#hsCardImg"); im.src = cardUrl; im.hidden = false;
      var file = new File([blob], "lensiq-ดวงวันเกิด.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "ดวงวันเดือนปีเกิด — LENSIQ", text: "เกิด" + dayTitle(current) + " · " + KB.disclaimerShort }); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
      var a = document.createElement("a"); a.href = cardUrl; a.download = "lensiq-horoscope.png"; document.body.append(a); a.click(); a.remove();
      toast("บันทึกการ์ดแล้ว");
    } catch (e) { console.error(e); toast("สร้างการ์ดไม่สำเร็จ"); }
    finally { b.disabled = false; }
  });
  $("#hsPrint").addEventListener("click", function () { touch(); window.print(); });
  $("#hsAgain").addEventListener("click", reset);

  function toast(msg) { var t = $("#hsToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("show"); }, 2200); }

  function reset() {
    resultSec.hidden = true; current = null;
    $("#hsCardImg").hidden = true; if (cardUrl) { URL.revokeObjectURL(cardUrl); cardUrl = null; }
    $("#hsForm").reset(); $("#hsPartner").reset(); $("#hsCompat").innerHTML = ""; $("#hsYearHint").textContent = ""; $("#hsErr").textContent = "";
    $("#hsTime").disabled = false; $("#hsLatLon").hidden = true;
    $("#hsSunrise").checked = !!prefs.sunrise; $("#hsZi").value = prefs.zi; $("#hsHidden").checked = !!prefs.hidden;
    ["pn-ov", "pn-th", "pn-bz", "pn-nu", "pn-td"].forEach(function (id) { document.getElementById(id).innerHTML = ""; });
    $("#hsStage").scrollIntoView({ block: "start" });
    touch();
  }

  /* ---------- สถิติบูธ (ไม่ระบุตัวตน) ---------- */
  function renderStats() {
    var st = lsGet(STATS_KEY, null), box = $("#hsStats");
    if (!st || !st.total) { box.innerHTML = '<p class="muted">ยังไม่มีการดูดวงในเครื่องนี้</p>'; return; }
    var dd = new Date(), today = dd.getFullYear() + "-" + HS.pad2(dd.getMonth() + 1) + "-" + HS.pad2(dd.getDate());
    var mx = Math.max.apply(null, KB.animals.map(function (_, i) { return (st.zodiac || {})[i] || 0; })) || 1;
    box.innerHTML = '<p class="stat-n"><b>' + st.total + "</b> ครั้ง <small>(วันนี้ " + ((st.days || {})[today] || 0) + ")</small></p>" +
      '<div class="elbars z">' + KB.animals.map(function (a, i) { var n = (st.zodiac || {})[i] || 0; return '<div class="elbar"><span>' + esc(a.th) + '</span><i style="--w:' + Math.round(n / mx * 100) + '%;--c:#674ff2"></i><b>' + n + "</b></div>"; }).join("") + "</div>";
  }
  $("#hsStatsOn").checked = !!prefs.stats;
  $("#hsStatsOn").addEventListener("change", function () { prefs.stats = this.checked; savePrefs(); });
  $("#hsStatsClear").addEventListener("click", function () { if (confirm("ล้างสถิติในเครื่องนี้?")) { try { localStorage.removeItem(STATS_KEY); } catch (e) { /* ไม่เป็นไร */ } renderStats(); } });
  renderStats();

  /* ---------- โหมดบูธ ---------- */
  var idleT = null, idleTick = null, wasFs = false;
  function touch() {
    clearTimeout(idleT); clearInterval(idleTick);
    var el = $("#hsIdle"); el.hidden = true;
    if (!document.body.classList.contains("hs-kiosk") || resultSec.hidden) return;
    var until = Date.now() + IDLE_MS;
    idleTick = setInterval(function () {
      var left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 15) { el.hidden = false; el.textContent = "กลับหน้าเริ่มต้นใน " + left + " วินาที — แตะเพื่ออยู่ต่อ"; }
    }, 1000);
    idleT = setTimeout(function () { clearInterval(idleTick); el.hidden = true; reset(); }, IDLE_MS);
  }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { if (document.body.classList.contains("hs-kiosk")) touch(); }, { passive: true }); });
  function setKiosk(on) {
    document.body.classList.toggle("hs-kiosk", on);
    $("#hsKiosk").setAttribute("aria-pressed", on ? "true" : "false");
    $("#hsKioskExit").hidden = !on;
    if (on) {
      var de = document.documentElement;
      if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().then(function () { wasFs = true; }).catch(function () { /* iOS ไม่รองรับ */ });
      $("#hsStage").scrollIntoView({ block: "start" });
    } else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    touch();
  }
  $("#hsKiosk").addEventListener("click", function () { setKiosk(!document.body.classList.contains("hs-kiosk")); });
  $("#hsKioskExit").addEventListener("click", function () { setKiosk(false); });
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && wasFs) { wasFs = false; setKiosk(false); } });

  $("#hsSources").innerHTML = KB.sources.map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + "</a></li>"; }).join("");
  window.__hs = { get current() { return current; }, makeCard: makeCard, reset: reset, show: show }; // ใช้ทดสอบ
})();
