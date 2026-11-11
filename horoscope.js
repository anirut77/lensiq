/* ดวงวันเดือนปีเกิด — LENSIQ (เพื่อความบันเทิง)
   ส่วนที่ 1: ฟังก์ชันคำนวณแบบ pure (ทดสอบด้วย Node ได้: require("./horoscope-kb.js"); require("./horoscope.js"))
   ส่วนที่ 2: ส่วนติดต่อผู้ใช้ (ทำงานเมื่อมี #hsApp)

   ดาราศาสตร์ (อ้างอิง Jean Meeus, Astronomical Algorithms 2nd ed.):
     - ตำแหน่งดวงอาทิตย์ VSOP87 แบบย่อ + นิวเทชัน + ความคลาดของแสง (บทที่ 25/32) ผิดพลาดไม่เกินราว 1 นาทีของเวลาเปลี่ยนสารท
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
  /** ลองจิจูดปรากฏของดวงอาทิตย์แบบเดิม (Meeus บทที่ 25 ความแม่นยำต่ำ ~0.01°) — เก็บไว้เทียบและเป็นทางสำรอง */
  function sunLongitudeLow(jde) {
    var T = (jde - 2451545) / 36525;
    var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    var M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
    var Om = 125.04 - 1934.136 * T;
    return norm360(L0 + C - 0.00569 - 0.00478 * sin(Om));
  }
  /* VSOP87 แบบย่อของโลก (Meeus ภาคผนวก III / ตาราง 32.A) — [A, B, C] → A·cos(B + C·τ), τ = พันปีจูเลียนจาก J2000 */
  var VSOP_L = [
    [[175347046, 0, 0], [3341656, 4.6692568, 6283.07585], [34894, 4.6261, 12566.1517], [3497, 2.7441, 5753.3849], [3418, 2.8289, 3.5231], [3136, 3.6277, 77713.7715],
      [2676, 4.4181, 7860.4194], [2343, 6.1352, 3930.2097], [1324, 0.7425, 11506.7698], [1273, 2.0371, 529.691], [1199, 1.1096, 1577.3435], [990, 5.233, 5884.927],
      [902, 2.045, 26.298], [857, 3.508, 398.149], [780, 1.179, 5223.694], [753, 2.533, 5507.553], [505, 4.583, 18849.228], [492, 4.205, 775.523], [357, 2.92, 0.067],
      [317, 5.849, 11790.629], [284, 1.899, 796.298], [271, 0.315, 10977.079], [243, 0.345, 5486.778], [206, 4.806, 2544.314], [205, 1.869, 5573.143], [202, 2.458, 6069.777],
      [156, 0.833, 213.299], [132, 3.411, 2942.463], [126, 1.083, 20.775], [115, 0.645, 0.98], [103, 0.636, 4694.003], [102, 0.976, 15720.839], [102, 4.267, 7.114],
      [99, 6.21, 2146.17], [98, 0.68, 155.42], [86, 5.98, 161000.69], [85, 1.3, 6275.96], [85, 3.67, 71430.7], [80, 1.81, 17260.15], [79, 3.04, 12036.46], [75, 1.76, 5088.63],
      [74, 3.5, 3154.69], [74, 4.68, 801.82], [70, 0.83, 9437.76], [62, 3.98, 8827.39], [61, 1.82, 7084.9], [57, 2.78, 6286.6], [56, 4.39, 14143.5], [56, 3.47, 6279.55],
      [52, 0.19, 12139.55], [52, 1.33, 1748.02], [51, 0.28, 5856.48], [49, 0.49, 1194.45], [41, 5.37, 8429.24], [41, 2.4, 19651.05], [39, 6.17, 10447.39], [37, 6.04, 10213.29],
      [37, 2.57, 1059.38], [36, 1.71, 2352.87], [36, 1.78, 6812.77], [33, 0.59, 17789.85], [30, 0.44, 83996.85], [30, 2.74, 1349.87], [25, 3.16, 4690.48]],
    [[628331966747, 0, 0], [206059, 2.678235, 6283.07585], [4303, 2.6351, 12566.1517], [425, 1.59, 3.523], [119, 5.796, 26.298], [109, 2.966, 1577.344], [93, 2.59, 18849.23],
      [72, 1.14, 529.69], [68, 1.87, 398.15], [67, 4.41, 5507.55], [59, 2.89, 5223.69], [56, 2.17, 155.42], [45, 0.4, 796.3], [36, 0.47, 775.52], [29, 2.65, 7.11], [21, 5.34, 0.98],
      [19, 1.85, 5486.78], [19, 4.97, 213.3], [17, 2.99, 6275.96], [16, 0.03, 2544.31], [16, 1.43, 2146.17], [15, 1.21, 10977.08], [12, 2.83, 1748.02], [12, 3.26, 5088.63],
      [12, 5.27, 1194.45], [12, 2.08, 4694], [11, 0.77, 553.57], [10, 1.3, 6286.6], [10, 4.24, 1349.87], [9, 2.7, 242.73], [9, 5.64, 951.72], [8, 5.3, 2352.87], [6, 2.65, 9437.76], [6, 4.67, 4690.48]],
    [[52919, 0, 0], [8720, 1.0721, 6283.0758], [309, 0.867, 12566.152], [27, 0.05, 3.52], [16, 5.19, 26.3], [16, 3.68, 155.42], [10, 0.76, 18849.23], [9, 2.06, 77713.77],
      [7, 0.83, 775.52], [5, 4.66, 1577.34], [4, 1.03, 7.11], [4, 3.44, 5573.14], [3, 5.14, 796.3], [3, 6.05, 5507.55], [3, 1.19, 242.73], [3, 6.12, 529.69], [3, 0.31, 398.15],
      [3, 2.28, 553.57], [2, 4.38, 5223.69], [2, 3.75, 0.98]],
    [[289, 5.844, 6283.076], [35, 0, 0], [17, 5.49, 12566.15], [3, 5.2, 155.42], [1, 4.72, 3.52], [1, 5.3, 18849.23], [1, 5.97, 242.73]],
    [[114, 3.142, 0], [8, 4.13, 6283.08], [1, 3.84, 12566.15]],
    [[1, 3.14, 0]]
  ];
  var VSOP_R = [
    [[100013989, 0, 0], [1670700, 3.0984635, 6283.07585], [13956, 3.05525, 12566.1517], [3084, 5.1985, 77713.7715], [1628, 1.1739, 5753.3849], [1576, 2.8469, 7860.4194],
      [925, 5.453, 11506.77], [542, 4.564, 3930.21], [472, 3.661, 5884.927], [346, 0.964, 5507.553], [329, 5.9, 5223.694], [307, 0.299, 5573.143], [243, 4.273, 11790.629],
      [212, 5.847, 1577.344], [186, 5.022, 10977.079], [175, 3.012, 18849.228], [110, 5.055, 5486.778], [98, 0.89, 6069.78], [86, 5.69, 15720.84], [86, 1.27, 161000.69]],
    [[103019, 1.10749, 6283.07585], [1721, 1.0644, 12566.1517], [702, 3.142, 0], [32, 1.02, 18849.23], [31, 2.84, 5507.55], [25, 1.32, 5223.69], [18, 1.42, 1577.34]],
    [[4359, 5.7846, 6283.0758], [124, 5.579, 12566.152], [12, 3.14, 0], [9, 3.63, 77713.77]],
    [[145, 4.273, 6283.076], [7, 3.92, 12566.15]],
    [[4, 2.56, 6283.08]]
  ];
  function vsopSum(tab, tau) {
    var tot = 0, tp = 1;
    for (var i = 0; i < tab.length; i++) { var s = 0, row = tab[i]; for (var j = 0; j < row.length; j++) s += row[j][0] * Math.cos(row[j][1] + row[j][2] * tau); tot += s * tp; tp *= tau; }
    return tot / 1e8;
  }
  /** ลองจิจูดปรากฏของดวงอาทิตย์ (องศา, ราศีจักรแบบสายนะ) จาก JDE (TT)
      VSOP87 แบบย่อ (Meeus บทที่ 25 วิธีความแม่นยำสูง) + แปลงเป็น FK5 + นิวเทชันในลองจิจูด (IAU 1980 พจน์หลัก) + ความคลาดของแสง
      ผิดพลาดราว 1–2 พิลิปดา ≈ ไม่เกิน 1 นาทีของเวลาเปลี่ยนสารท (แบบเดิมคลาดราว 3–11 นาที) */
  function sunLongitude(jde) {
    var tau = (jde - 2451545) / 365250, T = tau * 10;
    var L = vsopSum(VSOP_L, tau) / D2R, R = vsopSum(VSOP_R, tau);
    var th = L + 180 - 0.09033 / 3600; // geocentric + FK5
    var Om = 125.04452 - 1934.136261 * T, Ls = 280.4665 + 36000.7698 * T, Lm = 218.3165 + 481267.8813 * T;
    var dpsi = (-17.2 * sin(Om) - 1.32 * sin(2 * Ls) - 0.23 * sin(2 * Lm) + 0.21 * sin(2 * Om)) / 3600;
    return norm360(th + dpsi - 20.4898 / 3600 / R);
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

  /** เดือนจันทรคติไทย (ใช้ร่วมกันทุกหน้า: horoscope, taksa, lek7, lifegraph ผ่าน lifecal.js)
      ปฏิทินไทยวางอธิกมาสเป็น "เดือน 8 สองหน" เสมอ (ไม่ใช่ตามเดือนอธิกของจีนหรืออินเดีย) — จับหลักด้วยวันอาสาฬหบูชา:
        เดือน 8 (หรือ 8 หลังในปีอธิกมาส) = เดือนจันทร์ที่จันทร์เพ็ญแรกตกตั้งแต่ 00:00 ของ 5 ก.ค. (เวลาไทย) ของปีนั้นเป็นต้นไป
        ปีอธิกมาส = ปีที่ช่วงระหว่างเดือน 8 ของปีก่อนกับปีนั้นมี 13 เดือนจันทร์ (เดือนที่เพิ่มคือ 8 แรก)
      ตรวจกับวันวิสาขบูชา อาสาฬหบูชา ออกพรรษา และลอยกระทงที่ประกาศจริงปี 2012–2030 (tests/unit/lifecal.test.js)
      เป็นการคำนวณทางดาราศาสตร์ อาจต่างจากปฏิทินหลวง (สุริยยาตร) ได้หนึ่งวันในบางปี แต่เลขเดือนตรงกัน
      คืน {month 1–12, startJD (UT, จันทร์ดับต้นเดือน), leap (true = เดือน 8 หลังของปีอธิกมาส), firstEight, adhikamas} */
  /** จันทร์เพ็ญหลังจันทร์ดับลำดับ k (Meeus บทที่ 49 เฟส 0.5 พจน์หลัก) → JD (UT) */
  function fullMoonOf(k) {
    var kk = k + 0.5, T = kk / 1236.85, T2 = T * T, E = 1 - 0.002516 * T - 0.0000074 * T2;
    var M = 2.5534 + 29.1053567 * kk, Mp = 201.5643 + 385.81693528 * kk + 0.0107582 * T2, F = 160.7108 + 390.67050284 * kk - 0.0016118 * T2, Om = 124.7746 - 1.56375588 * kk;
    var jde = 2451550.09766 + 29.530588861 * kk + 0.00015437 * T2;
    jde += -0.40614 * sin(Mp) + 0.17302 * E * sin(M) + 0.01614 * sin(2 * Mp) + 0.01043 * sin(2 * F) + 0.00734 * E * sin(Mp - M) - 0.00515 * E * sin(Mp + M)
      + 0.00209 * E * E * sin(2 * M) - 0.00111 * sin(Mp - 2 * F) - 0.00057 * sin(Mp + 2 * F) + 0.00056 * E * sin(2 * Mp + M) - 0.00042 * sin(3 * Mp)
      + 0.00042 * E * sin(M + 2 * F) + 0.00038 * E * sin(M - 2 * F) - 0.00024 * E * sin(2 * Mp - M) - 0.00017 * sin(Om);
    return utFromTT(jde);
  }
  var asalhaCache = {};
  /** ดัชนี k ของจันทร์ดับที่เริ่มเดือน 8 (ที่มีอาสาฬหบูชา) ของปี ค.ศ. y */
  function asalhaK(y) {
    if (asalhaCache[y] != null) return asalhaCache[y];
    var lim = julianDay(y, 7, 5, 0) - 7 / 24; // 00:00 ของ 5 ก.ค. เวลาไทย (UT)
    var k = newMoonBefore(lim).k - 1;
    while (fullMoonOf(k) < lim) k++;
    return (asalhaCache[y] = k);
  }
  function thaiLunarMonth(jdUT) {
    var nm = newMoonBefore(jdUT), k = nm.k, y = fromJD(jdUT + 7 / 24).y;
    var kA = asalhaK(y); if (k < kA) { y -= 1; kA = asalhaK(y); }
    var kN = asalhaK(y + 1), n = k - kA, leapThis = kA - asalhaK(y - 1) === 13, leapNext = kN - kA === 13;
    var month, leap = false, first = false;
    if (n === 0) { month = 8; leap = leapThis; }
    else if (n <= 4) month = 8 + n;
    else if (leapNext && n === 12) { month = 8; first = true; }
    else month = n - 4; // n=5 → เดือนอ้าย (1) … n=11 → 7
    return { month: month, startJD: nm.jd, leap: leap, firstEight: first, adhikamas: n <= 4 ? leapThis : leapNext };
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
    // ไม่ให้ "เลขนำโชค" (เลี่ยงการใช้เป็นเลขเสี่ยงโชค) — ใช้ธาตุเสริมของวันเป็นคำพลังแทน
    return { weekday: wd, bhumi: bh, taksaToday: dayT, pillar: dp, rel: rel, todayEl: te, clash: clash, favEl: fav };
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

  /* ---------------- 十神 (สิบเทพ) ----------------
     เทียบก้านอื่นกับ日主: ธาตุเดียวกัน → 比肩/劫財, เราให้กำเนิด → 食神/傷官, เราข่ม → 偏財/正財,
     ข่มเรา → 七殺/正官, ให้กำเนิดเรา → 偏印/正印 (ขั้วหยินหยางเดียวกัน = ตัวแรก, ต่างขั้ว = ตัวหลัง) */
  var GOD_KEYS = ["BJ", "JC", "SS", "SG", "PC", "ZC", "QS", "ZG", "PY", "ZY"];
  var GOD_ZH = { BJ: "比肩", JC: "劫財", SS: "食神", SG: "傷官", PC: "偏財", ZC: "正財", QS: "七殺", ZG: "正官", PY: "偏印", ZY: "正印" };
  var GOD_TH = { BJ: "ปี่เกียน (เพื่อนร่วมทาง)", JC: "เกียบไช้ (คู่แข่งที่เป็นมิตร)", SS: "เส็กซิ้ง (พรสวรรค์)", SG: "เซียงกัว (ความคิดแหวกแนว)", PC: "เพียนไช้ (โชคลาภจร)", ZC: "เจี้ยไช้ (ทรัพย์ประจำ)", QS: "ชิกสัว (พลังท้าทาย)", ZG: "เจี้ยกัว (เกียรติและระเบียบ)", PY: "เพียนอิ่น (ปัญญาเฉพาะทาง)", ZY: "เจี้ยอิ่น (ผู้อุปถัมภ์)" };
  function tenGod(dmStem, s) {
    var same = (dmStem % 2) === (s % 2), r = relation(STEM_EL[dmStem], STEM_EL[s]);
    var pair = { same: ["BJ", "JC"], output: ["SS", "SG"], wealth: ["PC", "ZC"], power: ["QS", "ZG"], resource: ["PY", "ZY"] }[r];
    return same ? pair[0] : pair[1];
  }
  /** น้ำหนักสิบเทพทั้งดวง: ก้านบน (ยกเว้น日主) = 1, ก้านแฝงในกิ่ง = 0.6/0.3/0.1 (หรือ 1 / 0.7,0.3) */
  function tenGods(bz) {
    var dm = bz.day.stem, w = {}, pillars = [];
    GOD_KEYS.forEach(function (k) { w[k] = 0; });
    [["year", bz.year], ["month", bz.month], ["day", bz.day], ["hour", bz.hour]].forEach(function (x) {
      var p = x[1]; if (!p) return;
      var row = { pillar: x[0], stem: x[0] === "day" ? null : tenGod(dm, p.stem), hidden: [] };
      if (row.stem) w[row.stem] += 1;
      var hs = HIDDEN[p.branch], ww = hs.length === 1 ? [1] : hs.length === 2 ? [0.7, 0.3] : [0.6, 0.3, 0.1];
      hs.forEach(function (s, i) { var g = tenGod(dm, s); row.hidden.push(g); w[g] += ww[i]; });
      pillars.push(row);
    });
    GOD_KEYS.forEach(function (k) { w[k] = Math.round(w[k] * 10) / 10; });
    var ranked = GOD_KEYS.filter(function (k) { return w[k] > 0; }).sort(function (a, b) { return w[b] - w[a] || GOD_KEYS.indexOf(a) - GOD_KEYS.indexOf(b); });
    return { weights: w, ranked: ranked, pillars: pillars };
  }

  /* ---------------- ข้อเท็จจริงสำหรับ fortune-ai.js (สัญญา facts) ---------------- */
  var EL_TH = { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" };
  var PLANET_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "ราหู"];
  function thaiAnd(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(" ") + "และ" + a[a.length - 1]; }
  function firstCore(s) { return String(s || "").split("|")[0]; }
  function item(id, group, label, evidence, strength, tags, meanings, polarity) {
    var o = { id: id, group: group, label: label, evidence: evidence, strength: strength, tags: tags, meanings: meanings };
    if (polarity) o.polarity = polarity;
    return o;
  }
  var tagsOf = function (m) { return Object.keys(m); };
  function mergeM(a, b) { var o = {}; [a, b].forEach(function (m) { Object.keys(m || {}).forEach(function (k) { o[k] = (o[k] || []).concat(m[k]); }); }); return o; }
  /** P = ผล analyze(); opts: {topic: "overall"|"love"|"work"|"money", nickname} */
  function buildFacts(P, opts) {
    opts = opts || {};
    // short = ชื่อย่อที่ตัวเรียบเรียงใช้หลังเอ่ยชื่อเต็มครั้งแรก; evidence = ภาษาคนอ่าน (ตัวเลขเทคนิคอยู่ในตาราง)
    var K = KB, R = K.R, items = [], rnd = opts.rng || Math.random, usedF = {}, M = function (e, fo) { return K.meaningsRandom(e, fo, rnd, usedF); }, bz = P.bazi,
      push = function (it, short) { if (short) it.short = short; if (Object.keys(it.meanings).length) items.push(it); };
    var part = function (deg) { return deg < 10 ? "ช่วงต้นราศี" : deg < 20 ? "ช่วงกลางราศี" : "ช่วงปลายราศี"; };
    var pl = P.thaiDay.planet, d = K.days[pl], dayName = pl === 7 ? "พุธกลางคืน" : K.weekdayNames[pl];
    push(item("thai.day." + pl, "วันเกิด", "เกิดวัน" + dayName, "ดาว" + PLANET_TH[pl] + "ประจำวันเกิด สีประจำวันคือสี" + d.color, 0.9, null, M(R.days[pl])), "วันเกิด" + dayName);
    var ra = P.sunRasi.index;
    push(item("thai.rasi." + ra, "ราศีเกิด", "ราศี" + K.rasi[ra].th, "ดวงอาทิตย์อยู่" + part(P.sunRasi.deg) + " เป็นราศีธาตุ" + K.rasiEl[K.rasi[ra].el].replace(/^ธาตุ/, ""), 0.72, null, M(R.rasi[ra])), "ราศี" + K.rasi[ra].th);
    if (P.lagna) { var lg = P.lagna.index; push(item("thai.lagna." + lg, "ลัคนา", "ลัคนาราศี" + K.rasi[lg].th, "คำนวณจากเวลาเกิดโดยประมาณ", 0.66, null, M(R.lagna[lg])), "ลัคนา"); }
    var an = P.zodiac.thai.animal, yel = STEM_EL[cyc(P.zodiac.thai.year - 4).stem], ae = R.animals[an], ye = R.yearEl[yel];
    var combo = ["ในฐานะคนปี" + K.animals[an].th + "ธาตุ" + EL_TH[yel] + " คุณ" + firstCore(ae.p) + " และ" + firstCore(ye.p),
      "คนปี" + K.animals[an].th + "ธาตุ" + EL_TH[yel] + "อย่างคุณ" + firstCore(ae.p) + " ผสานกับธาตุ" + EL_TH[yel] + "ที่ทำให้คุณ" + firstCore(ye.p)];
    var am = mergeM(M(ae), M({ p: ye.p, w: ye.w, l: ye.l, a: ye.a }));
    am.personality = combo.concat(am.personality || []);
    push(item("cn.year." + an + "." + yel, "ปีนักษัตร", "ปี" + K.animals[an].th + " ธาตุ" + EL_TH[yel], "นับปีนักษัตรแบบไทย", 0.6, null, am), "ปี" + K.animals[an].th);
    var dms = bz.day.stem, dmEl = STEM_EL[dms];
    push(item("bazi.dm." + dms, "ปาจื้อ", "ธาตุประจำตัว" + EL_TH[dmEl] + K.stems[dms].yy + " " + K.stems[dms].th + " (" + STEMS[dms] + ")", "เสาวัน " + bz.day.gz + " — ธาตุประจำตัว" + EL_TH[dmEl], 0.85, null, M(R.dm[dms])), "ธาตุ" + EL_TH[dmEl] + K.stems[dms].yy);
    var f = P.favorable;
    push(item("bazi.strength." + (f.strong ? "strong" : "weak"), "ปาจื้อ", "ธาตุประจำตัวค่อนข้าง" + (f.strong ? "แข็ง" : "อ่อน"), "ธาตุที่หนุนตัวคุณมีราว " + Math.round(f.ratio * 100) + "% ของดวง", 0.45, null, M(R.strength[f.strong ? "strong" : "weak"])), "ธาตุที่" + (f.strong ? "แข็ง" : "อ่อน"));
    var tot = ELEMENTS.reduce(function (s, k) { return s + P.counts[k]; }, 0) || 1;
    var byCount = ELEMENTS.slice().sort(function (a, b) { return P.counts[b] - P.counts[a]; });
    if (P.counts[byCount[0]] / tot >= 0.34) push(item("bazi.excess." + byCount[0], "สมดุลห้าธาตุ", "ธาตุ" + EL_TH[byCount[0]] + "เด่นมาก", "ธาตุ" + EL_TH[byCount[0]] + "มีสัดส่วนราว " + Math.round(P.counts[byCount[0]] / tot * 100) + "% ของดวง", 0.55, null, M(R.excess[byCount[0]], { w: "W" })), "ธาตุ" + EL_TH[byCount[0]] + "ที่มีมาก");
    ELEMENTS.filter(function (k) { return P.counts[k] / tot < 0.07; }).slice(0, 2).forEach(function (k) {
      push(item("bazi.lack." + k, "สมดุลห้าธาตุ", "ธาตุ" + EL_TH[k] + "น้อย", P.counts[k] ? "ธาตุ" + EL_TH[k] + "มีเพียงเล็กน้อยในดวง" : "แทบไม่พบธาตุ" + EL_TH[k] + "ในดวง", 0.42, null, M(R.lack[k], { w: "W" }), "challenge"), "ธาตุ" + EL_TH[k] + "ที่ขาด");
    });
    var TG = tenGods(bz);
    TG.ranked.slice(0, 2).forEach(function (g, i) {
      var where = TG.pillars.filter(function (r) { return r.stem === g; }).map(function (r) { return { year: "ก้านปี", month: "ก้านเดือน", hour: "ก้านยาม" }[r.pillar]; });
      var nm = GOD_TH[g].split(" (")[0], desc = (GOD_TH[g].split(" (")[1] || "").replace(/\)$/, "");
      push(item("bazi.god." + g, "สิบเทพในดวง", nm + " (" + GOD_ZH[g] + ") หรือ “" + desc + "”", where.length ? "ปรากฏที่" + thaiAnd(where) : "แฝงอยู่ในกิ่งของดวง", i ? 0.44 : 0.5, null, M(R.gods[g])), nm);
    });
    var fe = K.elements[f.primary];
    push(item("bazi.useful." + f.primary, "ธาตุเสริม", "ธาตุเสริม" + EL_TH[f.primary], "ธาตุที่ช่วยถ่วงสมดุลให้ดวง", 0.48, null, M(R.useful[f.primary], { w: "W" })), "ธาตุ" + EL_TH[f.primary] + "ที่เสริมดวง");
    var lp = P.lifePath.value;
    push(item("num.lp." + lp, "เลขศาสตร์", "เลขชีวิต " + lp, "รวมเลขวันเดือนปีเกิดได้ " + P.lifePath.total + (P.lifePath.total !== lp ? " แล้วทอนเหลือ " + lp : ""), 0.7, null, M(R.lp[lp])), "เลขชีวิต");
    var dd = P.input.d;
    push(item("num.bday." + dd, "เลขศาสตร์", "เกิดวันที่ " + dd, "เลขวันเกิด " + P.birthday, 0.41, null, M({ p: R.bday[dd] })), "เลขวันที่ " + dd);
    if (P.name && P.name.sum) { var nr = reduceNum(P.name.sum, false); push(item("num.name." + nr, "เลขศาสตร์", "ผลรวมชื่อ " + P.name.sum, "ทอนแล้วเหลือ " + nr, 0.41, null, M(R.name[nr])), "ผลรวมชื่อ"); }
    items.forEach(function (it) { it.tags = tagsOf(it.meanings); });
    var nick = String(opts.nickname || "").trim();
    return {
      domain: "horoscope", topic: opts.topic || "overall",
      subject: nick && nick.length <= 12 && !/\s/.test(nick) ? { nickname: nick } : {},
      headline: "เกิดวัน" + (pl === 7 ? "พุธกลางคืน" : K.weekdayNames[pl]) + " · ราศี" + K.rasi[ra].th + " · ธาตุ" + EL_TH[dmEl] + " · เลขชีวิต " + lp,
      items: items,
      extras: { luckyColors: [fe.colors.split(" ")[0], K.days[P.taksa.sri].color], energyWords: ["ธาตุ" + fe.th], directions: [fe.dir.split(" /")[0]] }
    };
  }
  /** ข้อเท็จจริงดวงวันนี้ (D = daily(), mo = monthly()) */
  function buildDailyFacts(P, D, mo, opts) {
    opts = opts || {};
    var K = KB, R = K.R, items = [], rnd = opts.rng || Math.random, usedF = {}, dayO = { w: "dw", m: "dm", l: "dl", a: "da" }, monO = { w: "mw", m: "mw", l: "mw", a: "mw" };
    items.push(item("today.bhumi." + D.bhumi, "ทักษาจร", "วัน" + K.bhumi[D.bhumi].th + "ของคุณ", "ดาว" + PLANET_TH[D.weekday] + "วันนี้ตกภูมิ" + K.bhumi[D.bhumi].th + "ในทักษาวันเกิด", D.bhumi === "kalakini" ? 0.8 : 0.9, null, K.meaningsRandom(R.bhumi[D.bhumi], dayO), D.bhumi === "kalakini" ? "challenge" : ""));
    items.push(item("today.rel." + D.rel, "ปาจื้อวันนี้", "เสาวัน " + D.pillar.gz + " (" + K.relations[D.rel].th.split(" (")[0] + ")", "ธาตุวันนี้" + EL_TH[D.todayEl] + " เทียบธาตุประจำตัว", 0.7, null, K.meaningsRandom(R.rel[D.rel], dayO, rnd, usedF)));
    if (D.clash) items.push(item("today.clash", "ปาจื้อวันนี้", "กิ่งวันชงปีเกิด", "ตามความเชื่อ", 0.5, null, { timing: K.phr({ t: R.branch.clash }, "t"), advice: ["ใจเย็นและเผื่อเวลาให้ทุกเรื่อง แล้ววันนี้จะผ่านไปอย่างราบรื่น"] }, "challenge"));
    var mm = K.meaningsRandom(R.rel[mo.rel], monO, rnd, usedF); mm.timing = (mm.work || []).slice(0, 3);
    if (mo.branchRel === "clash" || mo.branchRel === "harmony" || mo.branchRel === "trine") mm.timing = mm.timing.concat(K.phr({ t: R.branch[mo.branchRel] }, "t"));
    items.push(item("month.rel." + mo.rel, "ดวงเดือนนี้", "เดือน " + mo.pillar.gz, "ธาตุเดือนเทียบธาตุประจำตัว", 0.55, null, { timing: mm.timing, advice: (mm.advice || []).slice(0, 2) }));
    items.forEach(function (it) { it.tags = tagsOf(it.meanings); if (!it.polarity) delete it.polarity; });
    return { domain: "horoscope", topic: opts.topic || "overall", subject: {}, headline: "วัน" + K.bhumi[D.bhumi].th + " · เสาวัน " + D.pillar.gz, items: items,
      extras: { luckyColors: [K.days[D.taksaToday.sri].color, K.days[D.taksaToday.dech].color], energyWords: ["ธาตุ" + K.elements[D.favEl].th], directions: [K.elements[D.favEl].dir.split(" /")[0]] } };
  }

  var HS = {
    julianDay: julianDay, jdn: jdn, fromJD: fromJD, localFromJD: localFromJD, weekday: weekday, toCE: toCE, validateDate: validateDate, daysInMonth: daysInMonth,
    deltaT: deltaT, ttFromUT: ttFromUT, utFromTT: utFromTT, sunLongitude: sunLongitude, sunLongitudeLow: sunLongitudeLow, solarTerm: solarTerm, sunAtLongitude: sunAtLongitude, newMoonJDE: newMoonJDE, newMoonBefore: newMoonBefore,
    chineseNewYear: chineseNewYear, gmst: gmst, ascendant: ascendant, ayanamsa: ayanamsa, sunRasi: sunRasi, lagna: lagna,
    taksa: taksa, bhumiOf: bhumiOf, thaiBirthDay: thaiBirthDay, thaiLunarMonth: thaiLunarMonth, thaiMonth5Start: thaiMonth5Start,
    bazi: bazi, dayPillarJDN: dayPillarJDN, elementCounts: elementCounts, relation: relation, favorable: favorable, zodiacYears: zodiacYears,
    sevenTable: sevenTable, lifePath: lifePath, birthdayNumber: birthdayNumber, reduceNum: reduceNum, thaiNameNumber: thaiNameNumber,
    branchRel: branchRel, compatibility: compatibility, daily: daily, monthly: monthly, analyze: analyze, addStat: addStat, cyc: cyc,
    STEMS: STEMS, BRANCHES: BRANCHES, STEM_EL: STEM_EL, BRANCH_EL: BRANCH_EL, HIDDEN: HIDDEN, ELEMENTS: ELEMENTS, GEN: GEN, CTRL: CTRL,
    TAKSA_ORDER: TAKSA_ORDER, BHUMI: BHUMI, PLANET_NUM: PLANET_NUM, TERM_NAMES: TERM_NAMES, pad2: pad2,
    tenGod: tenGod, tenGods: tenGods, GOD_KEYS: GOD_KEYS, GOD_ZH: GOD_ZH, GOD_TH: GOD_TH, buildFacts: buildFacts, buildDailyFacts: buildDailyFacts
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
  var current = null, lastPartner = null;

  /* ---------- ภาษา: ข้อความไทยเป็นค่าเริ่มต้น ภาษาจีนมาจาก i18n/zh-fortune-horoscope.js (LQI18N + window.HSKB_ZH) ---------- */
  var T = function (k, th, v) { return window.LQI18N ? window.LQI18N.tf(k, th, v) : th.replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  var isZh = function () { return !!(window.LQI18N && window.LQI18N.lang === "zh" && window.HSKB_ZH); };
  /** รวม KB ไทยกับข้อความจีน (เฉพาะช่องข้อความ ตัวเลข/สีคงเดิม) */
  function mergeKB(a, b) {
    if (b === undefined || b === null) return a;
    if (Array.isArray(a) && Array.isArray(b)) return a.map(function (x, i) { return i < b.length ? mergeKB(x, b[i]) : x; });
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      var o = {}; Object.keys(a).forEach(function (k) { o[k] = mergeKB(a[k], b[k]); });
      Object.keys(b).forEach(function (k) { if (!(k in a)) o[k] = b[k]; }); return o;
    }
    return b;
  }
  var K = KB, DAYS = KB.days, EL = KB.elements, zhKB = null;
  function syncKB() { K = isZh() ? (zhKB || (zhKB = mergeKB(KB, window.HSKB_ZH))) : KB; DAYS = K.days; EL = K.elements; }

  var thDate = function (y, m, d) { return isZh() ? y + "年" + m + "月" + d + "日" : d + " " + K.monthsShort[m - 1] + " " + (y + 543); };
  var thDateLong = function (y, m, d) { return isZh() ? y + "年" + m + "月" + d + "日" : d + " " + K.months[m - 1] + " พ.ศ. " + (y + 543); };
  var mdShort = function (m, d) { return isZh() ? m + "月" + d + "日" : d + " " + K.monthsShort[m - 1]; };
  var hm = function (h, mi) { return HS.pad2(h) + ":" + HS.pad2(mi); };
  var swatch = function (planet, label) { var d = DAYS[planet]; return '<span class="sw"><i style="background:' + d.hex + '"></i>' + esc(label || d.color) + "</span>"; };
  var elLabel = function (k) { return isZh() ? EL[k].zh : EL[k].zh + " " + EL[k].th; };
  var elChip = function (k) { return '<span class="elc" style="--c:' + EL[k].color + ";--s:" + EL[k].soft + '">' + esc(elLabel(k)) + "</span>"; };
  var elN = function (k) { return T("horoscope.x.el", "ธาตุ{n}", { n: EL[k].th }); };
  var rasiN = function (i) { return T("horoscope.x.rasi", "ราศี{n}", { n: K.rasi[i].th }); };
  var yearN = function (a) { return T("horoscope.x.year", "ปี{n}", { n: K.animals[a].th }); };
  var deity = function (d) { return T("horoscope.x.deity", "{p}ทรง{v}", { p: d.planet, v: d.vehicle }); };
  var elYY = function (stem, el) { return T("horoscope.x.elyy", "{el}{yy}", { el: EL[el].th, yy: K.stems[stem].yy }); };
  var stemLabel = function (s) { return isZh() ? HS.STEMS[s] + " · " + elYY(s, HS.STEM_EL[s]) : K.stems[s].th + " " + HS.STEMS[s]; };
  var bornOn = function (day) { return T("horoscope.x.born", "เกิด{d}", { d: day }); };

  /* ---------- ฟอร์ม ---------- */
  function fillDateSelects(dayEl, monEl) {
    var dv = dayEl.value, mv = monEl.value;
    dayEl.innerHTML = '<option value="">' + esc(T("horoscope.x.dayOpt", "วันที่")) + "</option>" + Array.from({ length: 31 }, function (_, i) { return '<option value="' + (i + 1) + '">' + (i + 1) + (isZh() ? "日" : "") + "</option>"; }).join("");
    monEl.innerHTML = '<option value="">' + esc(T("horoscope.x.monOpt", "เดือน")) + "</option>" + K.months.map(function (m, i) { return '<option value="' + (i + 1) + '">' + esc(m) + "</option>"; }).join("");
    dayEl.value = dv; monEl.value = mv;
  }
  function fillForm() {
    fillDateSelects($("#hsDay"), $("#hsMonth"));
    fillDateSelects($("#hsPDay"), $("#hsPMonth"));
    var pv = $("#hsProv").value, lv = $("#hsLunar").value;
    $("#hsProv").innerHTML = K.provinces.map(function (p, i) { return '<option value="' + i + '">' + esc(p[0]) + "</option>"; }).join("") + '<option value="custom">' + esc(T("horoscope.x.provCustom", "กำหนดละติจูด/ลองจิจูดเอง")) + "</option>";
    $("#hsLunar").innerHTML = '<option value="">' + esc(T("horoscope.x.lunarAuto", "คำนวณอัตโนมัติ (โดยประมาณ)")) + "</option>" + K.lunarMonths.slice(1).map(function (n, i) { return '<option value="' + (i + 1) + '">' + esc(n) + "</option>"; }).join("");
    if (pv) $("#hsProv").value = pv;
    $("#hsLunar").value = lv;
  }
  fillForm();
  $("#hsProv").addEventListener("change", function () { $("#hsLatLon").hidden = this.value !== "custom"; });
  $("#hsSunrise").checked = !!prefs.sunrise; $("#hsZi").value = prefs.zi; $("#hsHidden").checked = !!prefs.hidden;
  $("#hsSunrise").addEventListener("change", function () { prefs.sunrise = this.checked; savePrefs(); });
  $("#hsZi").addEventListener("change", function () { prefs.zi = this.value; savePrefs(); });
  $("#hsHidden").addEventListener("change", function () { prefs.hidden = this.checked; savePrefs(); });
  $("#hsNoTime").addEventListener("change", function () { $("#hsTime").disabled = this.checked; if (this.checked) $("#hsTime").value = ""; });

  var eraVal = function () { var r = document.querySelector('input[name="hsEra"]:checked'); return r ? r.value : "be"; };
  function eraText(y, era) {
    var ce = HS.toCE(y, era);
    return era === "be" ? T("horoscope.x.beToCe", "พ.ศ. {a} = ค.ศ. {b}", { a: y, b: ce }) : T("horoscope.x.ceToBe", "ค.ศ. {a} = พ.ศ. {b}", { a: y, b: ce + 543 });
  }
  function yearHint() {
    var raw = $("#hsYear").value.replace(/\D/g, ""), h = $("#hsYearHint");
    if ($("#hsYear").value !== raw) $("#hsYear").value = raw;
    if (raw.length < 4) { h.textContent = ""; return; }
    var y = +raw, era = eraVal();
    // ผู้ใช้ไทยมักพิมพ์ พ.ศ. — สลับระบบให้อัตโนมัติเมื่อเห็นชัดว่าเป็นอีกระบบ
    if (era === "ce" && y >= 2400) { document.querySelector('input[name="hsEra"][value="be"]').checked = true; era = "be"; }
    else if (era === "be" && y >= 1900 && y <= 2150) { document.querySelector('input[name="hsEra"][value="ce"]').checked = true; era = "ce"; }
    h.textContent = eraText(y, era);
  }
  $("#hsYear").addEventListener("input", yearHint);
  function eraHint() { var h = $("#hsYearHint"), raw = $("#hsYear").value; if (raw.length === 4) h.textContent = eraText(+raw, eraVal()); }
  document.querySelectorAll('input[name="hsEra"]').forEach(function (r) { r.addEventListener("change", eraHint); });

  function parseTime(v) { var m = /^(\d{1,2}):(\d{2})/.exec(v || ""); return m ? { h: +m[1], mi: +m[2] } : null; }
  function readDate(dEl, mEl, yEl, era) {
    var d = +dEl.value, m = +mEl.value, raw = yEl.value.replace(/\D/g, "");
    if (!d || !m) return { err: T("horoscope.x.errDM", "กรุณาเลือกวันที่และเดือนเกิด") };
    if (raw.length !== 4) return { err: T("horoscope.x.errYear", "กรุณากรอกปีเกิด 4 หลัก (พ.ศ. เช่น 2533 หรือ ค.ศ. เช่น 1990)") };
    var y = HS.toCE(+raw, era);
    var e = HS.validateDate(y, m, d);
    return e ? { err: T(e, e) } : { y: y, m: m, d: d }; // ข้อความจาก validateDate ใช้ตัวข้อความไทยเป็นคีย์แปล
  }
  function settings() {
    var pv = $("#hsProv").value, lat = 13.75, lon = 100.5, place = K.provinces[0][0], pi = 0;
    if (pv === "custom") { lat = parseFloat($("#hsLat").value); lon = parseFloat($("#hsLon").value); place = null; pi = -1; if (!isFinite(lat) || Math.abs(lat) > 66) lat = 13.75; if (!isFinite(lon) || Math.abs(lon) > 180) lon = 100.5; }
    else { pi = +pv || 0; var p = KB.provinces[pi]; lat = p[1]; lon = p[2]; place = p[0]; }
    return { lat: lat, lon: lon, place: place, placeIdx: pi, tz: parseFloat($("#hsTz").value), sunrise: $("#hsSunrise").checked, ziMode: $("#hsZi").value, hidden: $("#hsHidden").checked, lunarMonthOverride: +$("#hsLunar").value || null };
  }
  var placeName = function (inp) { return inp.placeIdx >= 0 && K.provinces[inp.placeIdx] ? K.provinces[inp.placeIdx][0] : T("horoscope.x.placeCustom", "พิกัดที่กำหนด"); };

  $("#hsForm").addEventListener("submit", function (e) {
    e.preventDefault(); touch();
    // crisis net first (review 2026-11-12): the raw name and every other field, before any calculation or reading
    if (crisisOn() || crisisHit($("#hsName").value) || crisisHit(pageFields())) { $("#hsErr").textContent = ""; showCrisis(); return; }
    // round 3: ambiguous distress or an unusual name → the gentle "are you okay?" step before ANY tab is drawn
    if (softHit()) { $("#hsErr").textContent = ""; showSoft(function () { $("#hsForm").requestSubmit(); }); return; }
    var err = $("#hsErr"); err.textContent = "";
    var dt = readDate($("#hsDay"), $("#hsMonth"), $("#hsYear"), eraVal());
    if (dt.err) { err.textContent = dt.err; return; }
    var t = $("#hsNoTime").checked ? null : parseTime($("#hsTime").value);
    var name = $("#hsName").value.trim();
    var inp = Object.assign({ y: dt.y, m: dt.m, d: dt.d, time: t, name: name }, settings());
    try { show(HS.analyze(inp)); } catch (ex) { console.error(ex); err.textContent = T("horoscope.x.errCalc", "คำนวณไม่สำเร็จ กรุณาตรวจสอบข้อมูล"); }
  });

  /* ---------- แท็บ ---------- */
  var tabs = Array.from(document.querySelectorAll('#hsTabs [role="tab"]'));
  function selectTab(tab, focus, noScroll) {
    tabs.forEach(function (t) {
      var on = t === tab; t.setAttribute("aria-selected", on ? "true" : "false"); t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
    if (focus) tab.focus();
    if (!noScroll) tab.scrollIntoView({ block: "nearest", inline: "nearest" });
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
  var plainDay = function (p) { return DAYS[p].name.replace(" (กลางวัน)", "").replace(" (ราหู)", "").replace("（白天）", "").replace("（罗睺）", ""); };
  // ป้ายในวง: บรรทัดดาว + บรรทัดภูมิ ซ้อนกันกลางช่อง (ไม่วางตามรัศมีแล้ว ป้ายยาวในทิศตะวันออก/ตะวันตกจึงไม่ทับกัน)
  // ช่องเหนือ/ใต้ดันออกด้านนอก ช่องเฉียงอยู่ด้านใน ป้ายที่อยู่ติดกันจึงไม่ชนกัน ขนาดตัวอักษร ≥ 15 หน่วย = ≥ 12 px ที่จอ 320 px
  // ชื่อภูมิในวงใช้คำสั้นจากไฟล์ภาษา (ชื่อเต็มพร้อมความหมายอยู่ในตารางข้าง ๆ และใน <title> ของแต่ละช่อง)
  var WHEEL_FS = 15, WHEEL_LH = 23;
  var tspans = function (x, lines, lh) { return lines.map(function (ln, i) { return '<tspan x="' + x + '" dy="' + (i ? lh : -(lines.length - 1) * lh / 2) + '">' + esc(ln) + "</tspan>"; }).join(""); };
  function taksaWheel(P) {
    var cx = 160, cy = 160, R = 150, r0 = 56, out = [];
    var pt = function (a, r) { return [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)]; };
    HS.TAKSA_ORDER.forEach(function (p) {
      var a = DIR_ANGLE[p], a0 = a - 22.5, a1 = a + 22.5;
      var p0 = pt(a0, R), p1 = pt(a1, R), q0 = pt(a1, r0), q1 = pt(a0, r0);
      var mine = p === P.thaiDay.planet, bh = HS.bhumiOf(P.thaiDay.planet, p), d = DAYS[p];
      out.push('<path d="M' + p0 + " A" + R + " " + R + " 0 0 1 " + p1 + " L" + q0 + " A" + r0 + " " + r0 + " 0 0 0 " + q1 + 'Z" fill="' + d.hex + '" fill-opacity="' + (mine ? 1 : 0.82) +
        '" stroke="#fff" stroke-width="' + (mine ? 4 : 2) + '"><title>' + esc(d.planet.replace("พระ", "") + " " + d.num + " · " + K.bhumi[bh].th) + "</title></path>");
      var vertical = Math.abs(Math.sin(a * Math.PI / 180)) > 0.99, c = pt(a, vertical ? 110 : 100);
      var fg = p === 1 ? "#3d2d00" : "#fff", x = c[0].toFixed(1), y = c[1].toFixed(1);
      var attr = '" fill="' + fg + '" font-size="' + WHEEL_FS + '" text-anchor="middle" dominant-baseline="middle"';
      out.push('<text x="' + x + '" y="' + (c[1] - WHEEL_LH / 2).toFixed(1) + attr + ' font-weight="600">' + esc(d.planet.replace("พระ", "")) + " " + d.num + "</text>");
      out.push('<text x="' + x + '" y="' + (+y + WHEEL_LH / 2).toFixed(1) + attr + ">" + esc(T("horoscope.x.wb." + bh, K.bhumi[bh].th)) + "</text>");
    });
    out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + (r0 - 4) + '" fill="#fff"/>');
    var me = P.thaiDay.planet, day = T("horoscope.x.wd." + me, me === 7 && !isZh() ? "วันพุธ|กลางคืน" : plainDay(me)).split("|");
    out.push('<text x="' + cx + '" y="' + (cy - 14 - (day.length - 1) * WHEEL_LH / 2) + '" font-size="' + WHEEL_FS + '" fill="#525c78" text-anchor="middle" dominant-baseline="middle">' +
      esc(T("horoscope.x.wheelOf", "ทักษาของ")) + "</text>");
    out.push('<text x="' + cx + '" y="' + (cy + 10) + '" font-size="16" font-weight="600" fill="#0e1430" text-anchor="middle" dominant-baseline="middle">' + tspans(cx, day, WHEEL_LH) + "</text>");
    out.push('<text x="' + cx + '" y="-8" font-size="' + WHEEL_FS + '" fill="#525c78" text-anchor="middle" dominant-baseline="middle">' + esc(T("horoscope.x.north", "เหนือ")) + "</text>");
    return '<svg class="hs-wheel" viewBox="4 -24 312 340" role="img" aria-label="' + esc(T("horoscope.x.wheelAria", "วงทักษา 8 ดาว พร้อมภูมิของคุณ")) + '">' + out.join("") + "</svg>";
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
    // ป้ายชื่อธาตุอยู่นอกวงกลมเสมอ (บนสำหรับจุดบน ล่างสำหรับจุดล่าง) "(ตัวเรา)" ขึ้นบรรทัดใหม่ ป้ายจึงไม่ล้นขอบซ้ายขวา
    // ตัวอักษร ≥ 16 หน่วย = ≥ 12 px ที่จอ 320 px; ตัวจีนกับจำนวนเว้นระยะไม่ให้กล่องตัวอักษรทับกัน
    order.forEach(function (k) {
      var e = EL[k], r = 22 + 14 * (c[k] / max), p = pos[k];
      if (k === dm) out.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (r + 6) + '" fill="none" stroke="#0e1430" stroke-width="2.5"/>');
      out.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + r + '" fill="' + e.color + '" fill-opacity="' + (c[k] ? 0.92 : 0.18) + '" stroke="' + e.color + '" stroke-width="' + (c[k] ? 0 : 1.5) + '" stroke-dasharray="' + (c[k] ? "" : "3 3") + '"/>');
      out.push('<text x="' + p[0] + '" y="' + (p[1] - 13) + '" font-size="18" font-weight="700" fill="' + (c[k] ? "#fff" : e.color) + '" text-anchor="middle" dominant-baseline="middle">' +
        e.zh + "</text>");
      out.push('<text x="' + p[0] + '" y="' + (p[1] + 13) + '" font-size="16" fill="' + (c[k] ? "#fff" : "#0e1430") + '" text-anchor="middle" dominant-baseline="middle">' + c[k] + "</text>");
      var lines = [((isZh() ? "" : e.th) + (k === fav ? " ★" : "")).trim(), k === dm ? T("horoscope.x.pentaMe", " (ตัวเรา)").trim() : ""].filter(Boolean);
      var below = p[1] > cy, edge = (k === dm ? r + 6 : r) + 4, lh = 19;
      var y0 = below ? p[1] + edge + 20 : p[1] - edge - 12 - (lines.length - 1) * lh;
      out.push('<text x="' + p[0] + '" y="' + y0 + '" font-size="16" fill="#0e1430" text-anchor="middle" font-weight="' + (k === fav ? 700 : 500) + '">' +
        lines.map(function (ln, i) { return '<tspan x="' + p[0] + '" dy="' + (i ? lh : 0) + '">' + esc(ln) + "</tspan>"; }).join("") + "</text>");
    });
    var aria = T("horoscope.x.pentaAria", "แผนภาพห้าธาตุ: ") + order.map(function (k) { return EL[k].th + " " + c[k]; }).join(", ");
    return '<svg class="hs-penta" viewBox="6 -44 328 400" role="img" aria-label="' + esc(aria) + '">' + out.join("") + "</svg>";
  }

  /* ---------- เนื้อหาแต่ละแท็บ ---------- */
  function pillarCell(label, p, isDay) {
    if (!p) return '<div class="pl pl-empty"><span class="pl-k">' + esc(label) + '</span><b class="pl-c">?</b><b class="pl-c">?</b><small>' + esc(T("horoscope.x.noTime", "ไม่ทราบเวลาเกิด")) + "</small></div>";
    var se = HS.STEM_EL[p.stem], be = HS.BRANCH_EL[p.branch], st = K.stems[p.stem], an = K.animals[p.branch];
    var hid = HS.HIDDEN[p.branch].map(function (s) { var e = HS.STEM_EL[s]; return '<i style="color:' + EL[e].color + '" title="' + esc(EL[e].th) + '">' + HS.STEMS[s] + "</i>"; }).join("");
    return '<div class="pl' + (isDay ? " pl-day" : "") + '"><span class="pl-k">' + esc(label + (isDay ? T("horoscope.x.plMe", " · ตัวเรา") : "")) + "</span>" +
      '<b class="pl-c" style="color:' + EL[se].color + '">' + HS.STEMS[p.stem] + '</b><small>' + esc(isZh() ? elYY(p.stem, se) : st.th + " · " + EL[se].th + st.yy) + "</small>" +
      '<b class="pl-c" style="color:' + EL[be].color + '">' + HS.BRANCHES[p.branch] + '</b><small>' + esc(isZh() ? an.th + " · " + EL[be].th : an.th + " (" + an.an + ")" + " · " + EL[be].th) + "</small>" +
      '<span class="pl-h" aria-label="' + esc(T("horoscope.x.hidden", "ก้านแฝง")) + '">' + esc(T("horoscope.x.hidden", "ก้านแฝง")) + " " + hid + "</span></div>";
  }
  function factCard(k, v, sub, color) {
    return '<div class="fact"' + (color ? ' style="--c:' + color + '"' : "") + '><span class="fact-k">' + k + '</span><b class="fact-v">' + v + "</b>" + (sub ? '<small>' + sub + "</small>" : "") + "</div>";
  }
  function colorAdvice(base) {
    var t = HS.taksa(base);
    return [["sri", T("horoscope.x.useSri", "โชคลาภ เสน่ห์")], ["dech", T("horoscope.x.useDech", "การงาน ความน่าเชื่อถือ")], ["montri", T("horoscope.x.useMontri", "ผู้ใหญ่เอ็นดู")], ["ayu", T("horoscope.x.useAyu", "สดชื่น อารมณ์ดี")]].map(function (x) { return '<li>' + swatch(t[x[0]]) + "<span><b>" + esc(K.bhumi[x[0]].th) + "</b> — " + esc(x[1]) + "</span></li>"; }).join("") +
      '<li class="soft">' + swatch(t.kalakini) + "<span><b>" + esc(K.bhumi.kalakini.th) + "</b> — " + esc(T("horoscope.x.kalaNote", "ตามความเชื่อแนะให้ลดการใช้สีนี้ในวันสำคัญ (ไม่ต้องกังวล ใช้ได้ตามสะดวก)")) + "</span></li>";
  }
  function dayTitle(P) { return DAYS[P.thaiDay.planet].name.replace(" (กลางวัน)", "").replace("（白天）", ""); }
  function thaiDayNote(P) {
    var t = P.thaiDay, n = [];
    if (t.shifted) n.push(T("horoscope.x.noteShift", "เกิดก่อน 6 โมงเช้า — ตามโหราศาสตร์ไทยนับเป็นวันก่อนหน้า (ปิดได้ในตั้งค่าเพิ่มเติม)"));
    if (t.rahu) n.push(T("horoscope.x.noteRahu", "เกิดวันพุธช่วง 18:00–05:59 จึงเป็น \"พุธกลางคืน\" ดาวประจำวันคือพระราหู"));
    if (t.maybeRahu) n.push(T("horoscope.x.noteMaybeRahu", "ถ้าเกิดวันพุธหลัง 18:00 น. จะนับเป็นพุธกลางคืน (ราหู) — ใส่เวลาเกิดเพื่อความแม่นยำ"));
    return n.map(function (s) { return '<p class="note">' + esc(s) + "</p>"; }).join("");
  }

  /* ---------- คำทำนายโดยละเอียด (ผ่าน fortune-ai.js; ถ้าไม่มีจะแสดงแบบย่อ) ---------- */
  var FA = window.FortuneAI || null, readings = {};
  var TOPIC_BTNS = [["overall", "ภาพรวม"], ["love", "ความรัก"], ["work", "การงาน"], ["money", "การเงิน"]];
  function readingBlock(id, title, withTopics) {
    return '<section class="hs-block hs-reading" id="' + id + '" aria-labelledby="' + id + '-h"><div class="rd-head"><h3 id="' + id + '-h">' + esc(title) + '</h3><span class="rd-src" id="' + id + '-src"></span></div>' +
      (withTopics ? '<div class="rd-topics" role="radiogroup" aria-label="' + esc(T("horoscope.x.topicAria", "หัวข้อที่สนใจ")) + '">' + TOPIC_BTNS.map(function (t, i) { return '<button type="button" role="radio" data-topic="' + t[0] + '" aria-checked="' + (i ? "false" : "true") + '">' + esc(T("horoscope.x.topic." + t[0], t[1])) + "</button>"; }).join("") + "</div>" : "") +
      '<div class="rd-consent" id="' + id + '-consent"></div><div class="rd-body" id="' + id + '-body" aria-live="polite"><p class="muted">' + esc(T("horoscope.x.composing", "กำลังเรียบเรียงคำทำนาย…")) + "</p></div>" +
      '<div class="rd-actions"><button type="button" class="btn ghost" id="' + id + '-again">' + esc(T("horoscope.x.again", "อ่านอีกสำนวน")) + "</button></div></section>";
  }
  function plainRender(el, res) {
    el.innerHTML = (res.sections || []).map(function (s) { return '<section class="fa-section"><h3>' + esc(s.title || "") + "</h3>" + (s.paragraphs || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</section>"; }).join("");
  }
  function localFallback(facts) {
    var sec = { id: "overview", title: T("horoscope.x.topic.overall", "ภาพรวม"), paragraphs: [] };
    facts.items.slice(0, 6).forEach(function (it) { var k = Object.keys(it.meanings)[0]; if (k) sec.paragraphs.push(it.label + " — " + it.meanings[k][0]); });
    return { source: "local", sections: [sec] };
  }
  /** ประโยคเด่นสั้น ๆ (≤ 60 ตัวอักษร) สำหรับการ์ดแชร์: ความหมายจาก facts ที่ปรากฏอยู่ในภาพรวมที่เรียบเรียงแล้ว (ไม่ใช้ประโยคเชื่อม) */
  function keyLines(res, facts, n) {
    var secs = res.sections || [], ov = secs.find(function (s) { return s.id === "overview"; }) || secs[0];
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
  function bindReading(id, factsFn, withTopics) {
    var root = document.getElementById(id); if (!root) return;
    var st = readings[id] = readings[id] || { topic: "overall" };
    var body = document.getElementById(id + "-body"), src = document.getElementById(id + "-src");
    function run() {
      var seed = (Math.random() * 4294967296) >>> 0, r = FA && FA.rng ? FA.rng(seed) : Math.random;
      var facts = factsFn(st.topic, r);
      st.facts = facts;
      var useAI = FA && FA.hasConsent ? FA.hasConsent() : false;
      var p = FA && FA.interpret ? FA.interpret(facts, { useAI: useAI, seed: seed, trace: true }) : Promise.resolve(localFallback(facts));
      root.setAttribute("aria-busy", "true");
      return p.catch(function () { return localFallback(facts); }).then(function (res) {
        if (!body.isConnected) return; // แท็บถูกสร้างใหม่ (เช่นสลับภาษา) ระหว่างรอ
        st.result = res; st.lines = isZh() ? [] : res && res.lang === "en" && FA && FA.en ? FA.en.keyLines(res, 3) : keyLines(res, facts, 3);
        if (FA && FA.renderSections) FA.renderSections(body, res, { aiBadge: false }); else plainRender(body, res);
        src.textContent = res.source === "ai" ? T("horoscope.x.srcAI", "เรียบเรียงโดยผู้ช่วยเขียนคำทำนาย (Claude โดย Anthropic)") : T("horoscope.x.srcLocal", "เรียบเรียงในเครื่อง · สำนวนใหม่ทุกครั้ง");
        src.className = "rd-src" + (res.source === "ai" ? " ai" : "");
        root.removeAttribute("aria-busy");
      });
    }
    st.run = run;
    document.getElementById(id + "-again").addEventListener("click", function () { touch(); run(); });
    if (withTopics) root.querySelectorAll(".rd-topics button").forEach(function (b) {
      b.setAttribute("aria-checked", String(b.dataset.topic === st.topic));
      b.addEventListener("click", function () {
        st.topic = b.dataset.topic; touch();
        root.querySelectorAll(".rd-topics button").forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
        run();
      });
    });
    if (FA && FA.consentControl) FA.consentControl(document.getElementById(id + "-consent"), { onChange: function () { run(); } }).catch(function () { /* ไม่มีเซิร์ฟเวอร์ AI */ });
    run();
  }

  function renderOverview(P) {
    var d = DAYS[P.thaiDay.planet], z = P.zodiac, ra = K.rasi[P.sunRasi.index], dm = EL[P.dayMaster], lp = K.numbers[P.lifePath.value];
    var html = '<div class="hero" style="--c:' + d.hex + '"><div class="hero-dot" aria-hidden="true">' + esc(d.short) + '</div><div><span class="hero-k">' + esc(T("horoscope.x.heroK", "เกิด{d} · สี{c}", { d: dayTitle(P), c: d.color })) + '</span><h3>' + esc(deity(d)) + "</h3><p>" + esc(d.desc) + "</p></div></div>" + thaiDayNote(P);
    html += '<div class="facts">' +
      factCard(esc(T("horoscope.x.fRasi", "ราศีเกิด (ไทย)")), esc(ra.sym + " " + rasiN(P.sunRasi.index)), esc(K.rasiEl[ra.el] + " · " + ra.trait)) +
      factCard(esc(T("horoscope.x.fLagna", "ลัคนา")), P.lagna ? esc(rasiN(P.lagna.index)) : "—", esc(P.lagna ? T("horoscope.x.approx", "คำนวณโดยประมาณ") : T("horoscope.x.needTime", "ใส่เวลาเกิดเพื่อคำนวณ"))) +
      factCard(esc(T("horoscope.x.fYear", "ปีนักษัตร")), esc(yearN(z.thai.animal)), esc((isZh() ? "" : K.animals[z.thai.animal].an + " · ") + elN(HS.STEM_EL[HS.cyc(z.thai.year - 4).stem]))) +
      factCard(esc(T("horoscope.x.fDm", "ธาตุประจำตัว (ปาจื้อ)")), esc(elLabel(P.dayMaster)), esc(stemLabel(P.bazi.day.stem)), dm.color) +
      factCard(esc(T("horoscope.x.fLp", "เลขชีวิต")), String(P.lifePath.value), esc(lp.k)) +
      factCard(esc(T("horoscope.x.fBuddha", "พระประจำวันเกิด")), esc(d.buddha), "") + "</div>";
    html += '<div class="hs-grid2"><section class="hs-block"><h3>' + esc(T("horoscope.x.traits", "นิสัยเด่น")) + '</h3><ul class="pills">' + d.traits.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      "</section>" +
      '<section class="hs-block"><h3>' + esc(T("horoscope.x.luckyColors", "สีมงคลประจำตัว (ตามทักษาวันเกิด)")) + '</h3><ul class="advice">' + colorAdvice(P.thaiDay.planet) + "</ul></section></div>";
    html += readingBlock("hsRd", T("fortune.common.readingDetail", "คำทำนายโดยละเอียด"), true);
    $("#pn-ov").innerHTML = html;
    bindReading("hsRd", function (topic, rng) { return HS.buildFacts(P, { topic: topic, nickname: $("#hsName").value, rng: rng }); }, true);
  }

  function renderThai(P) {
    var d = DAYS[P.thaiDay.planet], t = P.taksa, z = P.zodiac, ra = K.rasi[P.sunRasi.index], inp = P.input;
    var html = '<section class="hs-block"><h3>' + esc(T("horoscope.x.hDay", "วันเกิดและดาวประจำวัน")) + '</h3><div class="hs-grid2"><dl class="kv">' +
      "<dt>" + esc(T("horoscope.x.kDay", "วันเกิด")) + "</dt><dd>" + esc(d.name) + (P.thaiDay.shifted ? " <small>" + esc(T("horoscope.x.thaiCount", "(นับแบบไทย)")) + "</small>" : "") + "</dd>" +
      "<dt>" + esc(T("horoscope.x.kPlanet", "ดาวประจำวัน")) + "</dt><dd>" + esc(T("horoscope.x.planetNum", "{p} (เลข {n}, กำลัง {w})", { p: d.planet, n: d.num, w: d.power })) + "</dd>" +
      "<dt>" + esc(T("horoscope.x.kDeity", "เทวดาประจำวัน")) + "</dt><dd>" + esc(deity(d)) + "</dd>" +
      "<dt>" + esc(T("horoscope.x.kColor", "สีประจำวันเกิด")) + "</dt><dd>" + swatch(P.thaiDay.planet) + "</dd>" +
      "<dt>" + esc(T("horoscope.x.kDir", "ทิศของดาว")) + "</dt><dd>" + esc(d.dir) + "</dd>" +
      "<dt>" + esc(T("horoscope.x.fBuddha", "พระประจำวันเกิด")) + "</dt><dd><b>" + esc(d.buddha) + "</b><br><small>" + esc(d.buddhaNote) + "</small></dd></dl>" +
      "<div><p>" + esc(d.desc) + '</p><ul class="pills">' + d.traits.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" + thaiDayNote(P) + "</div></div></section>";
    html += '<section class="hs-block"><h3>' + esc(T("horoscope.x.hTaksa", "ทักษาปกรณ์ — ภูมิทั้ง 8 ของคุณ")) + '</h3><div class="hs-grid2 wheelgrid">' + taksaWheel(P) +
      '<div class="table-wrap"><table class="hs-table bhumi"><thead><tr><th scope="col">' + esc(T("horoscope.x.thBhumi", "ภูมิ")) + '</th><th scope="col">' + esc(T("horoscope.x.thPlanet", "ดาว")) + '</th><th scope="col">' + esc(T("horoscope.x.thColor", "สี")) + '</th><th scope="col">' + esc(T("horoscope.x.thMean", "ความหมาย")) + "</th></tr></thead><tbody>" +
      HS.BHUMI.map(function (b) { var p = t[b]; return '<tr' + (b === "kalakini" ? ' class="soft"' : "") + '><th scope="row">' + esc(K.bhumi[b].th) + "</th><td>" + esc(DAYS[p].planet) + " " + DAYS[p].num + "</td><td>" + swatch(p) + "</td><td>" + esc(K.bhumi[b].mean) + "</td></tr>"; }).join("") +
      '</tbody></table></div></div><p class="hs-small">' + esc(T("horoscope.x.taksaHow", "ลงภูมิ \"บริวาร\" ที่ดาววันเกิด แล้วเวียนขวาตามวงทักษา 1-2-3-4-7-5-8-6 (อาทิตย์ จันทร์ อังคาร พุธ เสาร์ พฤหัสบดี ราหู ศุกร์)")) +
      (isZh() ? "" : " · อักษรที่ตำราตั้งชื่อนิยมเลี่ยง (อักษรกาลกิณี): " + esc(DAYS[t.kalakini].letters)) + "</p></section>";
    // ตารางสีเสื้อ 7 วัน
    var cols = [["sri", T("horoscope.x.colSri", "ศรี · โชคลาภ")], ["dech", T("horoscope.x.colDech", "เดช · การงาน")], ["montri", T("horoscope.x.colMontri", "มนตรี · อุปถัมภ์")], ["ayu", T("horoscope.x.colAyu", "อายุ · สดชื่น")], ["kalakini", T("horoscope.x.colAvoid", "ควรเลี่ยง")]];
    var today = new Date().getDay();
    html += '<section class="hs-block"><h3>' + esc(T("horoscope.x.hColors", "สีเสื้อมงคล 7 วัน (ตามทักษาของวันที่สวมใส่)")) + '</h3><div class="table-wrap"><table class="hs-table colors"><thead><tr><th scope="col">' + esc(T("horoscope.x.thDay", "วัน")) + "</th>" + cols.map(function (c) { return '<th scope="col">' + esc(c[1]) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      [0, 1, 2, 3, 4, 5, 6].map(function (w) { var tk = HS.taksa(w); return '<tr' + (w === today ? ' class="today"' : "") + '><th scope="row">' + esc(K.weekdayNames[w]) + (w === today ? " <small>" + esc(T("horoscope.x.today", "วันนี้")) + "</small>" : "") + "</th>" + cols.map(function (c) { return '<td data-k="' + esc(c[1]) + '">' + swatch(tk[c[0]]) + "</td>"; }).join("") + "</tr>"; }).join("") +
      '</tbody></table></div><p class="hs-small">' + esc(T("horoscope.x.colorsNote", "คำนวณจากทักษาของวันที่สวมใส่ (เริ่มบริวารที่ดาวของวันนั้น) ตำราบางสำนักให้สีต่างไปเล็กน้อย สีที่ \"ควรเลี่ยง\" เป็นเพียงความเชื่อ ใส่ได้ตามสะดวก")) + "</p></section>";
    // ราศีและลัคนา
    var lag = P.lagna;
    html += '<div class="hs-grid2"><section class="hs-block"><h3>' + esc(T("horoscope.x.hRasi", "ราศีและลัคนา (แบบไทย นิรายนะ)")) + '</h3><dl class="kv">' +
      "<dt>" + esc(T("horoscope.x.kSunRasi", "ราศีเกิด (อาทิตย์สถิต)")) + "</dt><dd><b>" + esc(ra.sym + " " + rasiN(P.sunRasi.index)) + "</b> " + P.sunRasi.deg.toFixed(1) + "°<br><small>" + esc(K.rasiEl[ra.el] + T("horoscope.x.rangeApprox", " · ช่วงโดยประมาณ ") + ra.range) + "</small></dd>" +
      "<dt>" + esc(T("horoscope.x.fLagna", "ลัคนา")) + "</dt><dd>" + (lag ? "<b>" + esc(rasiN(lag.index)) + "</b> " + lag.deg.toFixed(1) + "°<br><small>" + esc(K.rasi[lag.index].trait) + "</small>" : esc(T("horoscope.x.needTimeLagna", "ใส่เวลาเกิดเพื่อคำนวณลัคนา"))) + "</dd>" +
      "</dl><p class=\"hs-small\">" + esc(T("horoscope.x.rasiHow", "คำนวณจากตำแหน่งดวงอาทิตย์จริงและอายนางศ์ลาหิรี (ใกล้เคียงสุริยยาตรของไทย ต่างกันราว 1°) ")) +
      (lag ? esc(T("horoscope.x.lagnaHow", "ลัคนาใช้พิกัด {place} ({lat}, {lon}) เวลา UTC{tz} — เป็นค่าโดยประมาณ ถ้าใกล้รอยต่อราศี (ต่ำกว่า 1° หรือเกิน 29°) ตำราไทยอาจได้ราศีข้างเคียง", { place: placeName(inp), lat: inp.lat.toFixed(2), lon: inp.lon.toFixed(2), tz: (inp.tz >= 0 ? "+" : "") + inp.tz })) : "") + "</p></section>";
    // ปีนักษัตร
    var c = z.chinese.cny;
    html += '<section class="hs-block"><h3>' + esc(T("horoscope.x.fYear", "ปีนักษัตร")) + '</h3><dl class="kv">' +
      "<dt>" + esc(T("horoscope.x.kThaiYear", "แบบไทย")) + "</dt><dd><b>" + esc(yearN(z.thai.animal)) + "</b> <small>" + esc(T("horoscope.x.thaiYearNote", "(เปลี่ยนวันขึ้น 1 ค่ำ เดือน 5 ≈ {d})", { d: thDate(z.thai.month5.y, z.thai.month5.m, z.thai.month5.d) })) + "</small></dd>" +
      "<dt>" + esc(T("horoscope.x.kCnYear", "แบบจีน (ตรุษจีน)")) + "</dt><dd><b>" + esc(yearN(z.chinese.animal)) + "</b> " + esc(elN(HS.STEM_EL[z.chinese.stem])) + " <small>" + esc(T("horoscope.x.cnyNote", "(ตรุษจีน {d})", { d: thDate(c.y, c.m, c.d) })) + "</small></dd>" +
      "<dt>" + esc(T("horoscope.x.kLichun", "ปาจื้อ (ลี่ชุน)")) + "</dt><dd><b>" + esc(yearN(z.lichun.animal)) + "</b> <small>" + esc(T("horoscope.x.lichunNote", "(เปลี่ยนวันลี่ชุน ≈ 4 ก.พ.)")) + "</small></dd></dl>" +
      (z.differ ? '<p class="note">' + esc(T("horoscope.x.differ", "วันเกิดของคุณอยู่ช่วงรอยต่อปีนักษัตร แต่ละระบบจึงให้ปีต่างกัน — ทุกแบบถูกต้องตามหลักของตัวเอง")) + "</p>" : "") +
      '<p class="hs-small">' + esc(T("horoscope.x.yearHow", "ตำราไทยส่วนใหญ่เปลี่ยนนักษัตรวันขึ้น 1 ค่ำ เดือน 5 (บางแหล่งระบุเดือนอ้าย และไม่ใช่วันสงกรานต์) วันจันทรคติที่นี่คำนวณจากดิถีจันทร์ดับ คลาดเคลื่อนได้ ±1 วัน")) + "</p>" +
      '<details class="hs-how" id="hsCnyBox"><summary>' + esc(T("horoscope.x.cnyTable", "ตารางวันตรุษจีน ค.ศ. 1930–2060")) + '</summary><div id="hsCny" class="cny"></div></details></section></div>';
    // เลข 7 ตัว
    var s = P.seven;
    var lmName = K.lunarMonths[inp.lunarMonthOverride || P.lunar.month];
    html += '<section class="hs-block"><h3>' + esc(T("horoscope.x.hSeven", "เลข 7 ตัว (3 ฐาน + ผลรวม)")) + '</h3><div class="table-wrap"><table class="hs-table seven"><tbody>' +
      K.sevenRows.map(function (r) { return '<tr><th scope="row">' + esc(r.th) + "</th>" + s[r.key].map(function (v, i) { return "<td><b>" + v + "</b><small>" + esc(r.pos[i]) + "</small></td>"; }).join("") + "</tr>"; }).join("") +
      '<tr class="sum"><th scope="row">' + esc(T("horoscope.x.sum", "ผลรวม")) + "</th>" + s.sum.map(function (v) { return "<td><b>" + v + "</b></td>"; }).join("") + "</tr></tbody></table></div>" +
      '<p class="hs-small">' + esc(T("horoscope.x.sevenHow", "ตั้งฐาน: วันเกิดเลข {a} · {lm}{lmNote} · {yr} เลข {c} — แต่ละแถวเริ่มที่เลขของตนแล้วนับเรียง 1–7 วนซ้ำ ผลรวมใช้ดูน้ำหนักของแต่ละภพ (ยิ่งมากยิ่งเด่น) นี่คือตารางพื้นฐาน ระบบเต็ม \"เลข 7 ตัว 9 ฐาน\" มีฐานเพิ่มเติม", {
        a: s.starts[0], lm: lmName, lmNote: inp.lunarMonthOverride ? T("horoscope.x.lmSet", " (กำหนดเอง)") : T("horoscope.x.lmAuto", " (คำนวณโดยประมาณจากดิถีจันทร์ดับ ปรับได้ในตั้งค่าเพิ่มเติม)"), yr: yearN(z.thai.animal), c: s.starts[2] })) + "</p>" +
      '<ul class="hs-small seven-top">' + topSeven(s).map(function (x) { return "<li><b>" + esc(x.pos) + "</b> (" + x.v + ") — " + esc(K.sevenMeaning[x.pos] || "") + "</li>"; }).join("") + "</ul></section>";
    $("#pn-th").innerHTML = html;
    $("#hsCnyBox").addEventListener("toggle", function () {
      var box = $("#hsCny"); if (!this.open || box.childElementCount) return;
      var rows = []; for (var y = 1930; y <= 2060; y++) { var q = HS.chineseNewYear(y); rows.push('<span' + (y === c.y ? ' class="on"' : "") + "><b>" + y + "</b> " + mdShort(q.m, q.d) + " <small>" + esc(K.animals[HS.cyc(y - 4).branch].th) + "</small></span>"); }
      box.innerHTML = rows.join("");
    });
  }
  function topSeven(s) {
    var names = K.sevenRows[0].pos, all = [];
    s.sum.forEach(function (v, i) { all.push({ v: v, pos: names[i] }); });
    return all.sort(function (a, b) { return b.v - a.v; }).slice(0, 3);
  }

  function renderBazi(P) {
    var b = P.bazi, dm = EL[P.dayMaster], f = P.favorable, fe = EL[f.primary], fe2 = EL[f.secondary];
    var yEl = EL[HS.STEM_EL[b.year.stem]];
    var html = '<section class="hs-block"><h3>' + esc(T("horoscope.x.hPillars", "สี่เสา (四柱八字)")) + '</h3><div class="pillars">' + pillarCell(T("horoscope.x.plYear", "ปี 年"), b.year) + pillarCell(T("horoscope.x.plMonth", "เดือน 月"), b.month) + pillarCell(T("horoscope.x.plDay", "วัน 日"), b.day, true) + pillarCell(T("horoscope.x.plHour", "ยาม 時"), b.hour) + "</div>" +
      '<p class="reading">' + esc(T("horoscope.x.pillarLine", "ปี{y} ธาตุ{ye} · เดือน{m} · วัน{d}", { y: K.animals[b.year.branch].th, ye: yEl.th, m: K.animals[b.month.branch].th, d: isZh() ? b.day.gz : K.stems[b.day.stem].th + K.animals[b.day.branch].th }) +
        (b.hour ? T("horoscope.x.pillarHour", " · ยาม{h}", { h: K.animals[b.hour.branch].th }) : "")) + "</p>" +
      (b.unsure ? '<p class="note">' + esc(T("horoscope.x.unsure", "วันเกิดตรงกับวันเปลี่ยนเดือนตามสุริยคติจีน ถ้าไม่ทราบเวลา เสาเดือนอาจเป็นเดือนข้างเคียง")) + "</p>" : "") +
      (P.input.time && P.input.time.h >= 23 ? '<p class="note">' + esc(T("horoscope.x.ziNote", "เกิดยามจื่อดึก (23:00 น. ขึ้นไป) ใช้วิธี: {m} (ปรับได้ในตั้งค่าเพิ่มเติม)", { m: b.ziMode === "23" ? T("horoscope.x.zi23", "เปลี่ยนวันตอน 23:00") : T("horoscope.x.zi00", "เปลี่ยนวันตอนเที่ยงคืน") })) + "</p>" : "") + "</section>";
    html += '<div class="hs-grid2"><section class="hs-block dm" style="--c:' + dm.color + ";--s:" + dm.soft + '"><span class="fact-k">' + esc(T("horoscope.x.dmK", "ธาตุประจำตัว (Day Master 日主)")) + '</span><h3 class="dm-h">' + esc(isZh() ? HS.STEMS[b.day.stem] + dm.zh + " · " + elYY(b.day.stem, P.dayMaster) : dm.zh + " " + K.stems[b.day.stem].th + " · " + dm.th + K.stems[b.day.stem].yy) + "</h3><p>" + esc(dm.dm) + "</p>" +
      '<p class="hs-small">' + esc(T("horoscope.x.strength", "ความแข็งของธาตุตัวเอง (ธาตุเดียวกัน + ธาตุที่หนุน): {p}% → {s}", { p: Math.round(f.ratio * 100), s: f.strong ? T("horoscope.x.strong", "ค่อนข้างแข็ง") : T("horoscope.x.weak", "ค่อนข้างอ่อน") })) + "</p></section>" +
      '<section class="hs-block"><h3>' + esc(T("horoscope.x.hUseful", "ธาตุเสริม (แบบง่าย)")) + "</h3><p>" + esc(T("horoscope.x.usefulEl", "ธาตุที่ช่วยให้สมดุล: ")) + elChip(f.primary) + " " + elChip(f.secondary) + "</p><dl class=\"kv\"><dt>" + esc(T("horoscope.x.kLuckyColor", "สีนำโชค")) + "</dt><dd>" + esc(fe.colors + " / " + fe2.colors) + "</dd><dt>" + esc(T("horoscope.x.kLuckyDir", "ทิศมงคล")) + "</dt><dd>" + esc(fe.dir) + "</dd><dt>" + esc(T("horoscope.x.kNum", "เลขเสริม")) + "</dt><dd>" + esc(fe.num) + "</dd><dt>" + esc(T("horoscope.x.kTip", "เคล็ดลับ")) + "</dt><dd>" + esc(fe.boost) + "</dd></dl>" +
      '<p class="hs-small">' + esc(T("horoscope.x.usefulHow", "หลักง่าย: ถ้าธาตุตัวเองแข็ง เสริมธาตุที่ช่วยระบาย ถ้าอ่อน เสริมธาตุแม่หรือธาตุเดียวกัน — เป็นการประเมินแบบย่อ ซินแสจริงพิจารณาฤดูเกิดและโครงสร้างดวงละเอียดกว่านี้")) + "</p></section></div>";
    html += '<section class="hs-block"><h3>' + esc(T("horoscope.x.hBalance", "สมดุลห้าธาตุ") + (P.input.hidden ? T("horoscope.x.balHidden", " (รวมก้านแฝง)") : T("horoscope.x.balPlain", " (ก้านบน + กิ่งล่าง)"))) + '</h3><div class="hs-grid2 pentagrid">' + pentagon(P) +
      '<div><div class="elbars">' + HS.ELEMENTS.map(function (k) { var tot = HS.ELEMENTS.reduce(function (s, x) { return s + P.counts[x]; }, 0) || 1; return '<div class="elbar"><span>' + esc(EL[k].th) + '</span><i style="--w:' + Math.round(P.counts[k] / tot * 100) + "%;--c:" + EL[k].color + '"></i><b>' + P.counts[k] + "</b></div>"; }).join("") + "</div>" +
      '<p class="hs-small">' + esc(T("horoscope.x.pentaLegend", "ลูกศรทึบ = วงจรให้กำเนิด (ไม้→ไฟ→ดิน→ทอง→น้ำ→ไม้) · เส้นประ = วงจรข่ม · วงขอบเข้ม = ธาตุตัวเรา · ★ = ธาตุเสริม")) + "</p></div></div></section>";
    var lc = HS.localFromJD(b.lichun, 7);
    html += '<details class="hs-how"><summary>' + esc(T("fortune.common.howCalc", "ดูวิธีคำนวณ")) + '</summary><ul class="hs-small">' +
      "<li>" + esc(T("horoscope.x.how1", "เสาปี: เปลี่ยนที่ลี่ชุน 立春 (อาทิตย์ลองจิจูด 315°) ปีนี้ตรงกับ {d} {t} น. (เวลาไทย)", { d: thDate(lc.y, lc.m, lc.d), t: hm(lc.h, lc.mi) })) + "</li>" +
      "<li>" + esc(T("horoscope.x.how2", "เสาเดือน: ลองจิจูดดวงอาทิตย์ขณะเกิด {l}° → เดือนที่ {n} นับจากเดือนขาล 寅 (เปลี่ยนทุก 30° ที่ 315°, 345°, 15° …)", { l: b.sunLon.toFixed(2), n: b.monthIndex + 1 })) + "</li>" +
      "<li>" + esc(T("horoscope.x.how3", "เสาวัน: จากเลขวันจูเลียน (1 ม.ค. 2000 = 戊午) รอบ 60 วัน")) + "</li>" +
      "<li>" + esc(T("horoscope.x.how4", "เสายาม: ช่วงละ 2 ชั่วโมงตามเวลานาฬิกา (ไม่ปรับเวลาสุริยะจริง) ก้านยามตามสูตร 五鼠遁")) + "</li>" +
      "<li>" + esc(T("horoscope.x.how5", "ตำแหน่งดวงอาทิตย์ตามสูตร VSOP87 แบบย่อ (Meeus) รวมนิวเทชันและความคลาดของแสง เวลาสารทคลาดไม่เกินราว 1 นาที ตรวจสอบกับตารางสารทที่หอดูดาวเผยแพร่ปี 2023–2026")) + "</li></ul></details>";
    $("#pn-bz").innerHTML = html;
  }

  function renderNum(P) {
    var lp = P.lifePath, n = K.numbers[lp.value], bd = K.numbers[P.birthday], inp = P.input;
    var html = '<div class="hs-grid2"><section class="hs-block bignum"><span class="fact-k">' + esc(T("horoscope.x.lpK", "เลขชีวิต (Life Path)")) + '</span><b class="big">' + lp.value + "</b><h3>" + esc(n.k) + "</h3><p>" + esc(n.t) + "</p>" +
      '<p class="hs-small">' + esc(T("horoscope.x.lpHow", "วิธีคิด: เดือน {m} → {a} · วัน {d} → {b} · ปี ค.ศ. {y} → {c} · รวม {t}{r} (เก็บเลขมาสเตอร์ 11, 22, 33 ไว้ ไม่ลดต่อ)", { m: inp.m, a: lp.parts[0], d: inp.d, b: lp.parts[1], y: inp.y, c: lp.parts[2], t: lp.total, r: lp.total !== lp.value ? " → " + lp.value : "" })) + "</p></section>" +
      '<section class="hs-block bignum"><span class="fact-k">' + esc(T("horoscope.x.bdK", "เลขวันเกิด (Birthday Number)")) + '</span><b class="big">' + P.birthday + "</b><h3>" + esc(bd.k) + "</h3><p>" + esc(bd.t) + "</p><p class=\"hs-small\">" + esc(T("horoscope.x.bdHow", "จากวันที่ {d} ลดเหลือหลักเดียว (ยกเว้น 11, 22)", { d: inp.d })) + "</p></section></div>";
    html += '<section class="hs-block"><h3>' + esc(T("horoscope.x.hName", "ผลรวมเลขชื่อ (เลขศาสตร์ไทย)")) + "</h3><label>" + esc(T("horoscope.x.nameLabel", "ชื่อที่ต้องการคำนวณ")) +
      '<input id="hsNameNum" type="text" maxlength="60" autocomplete="off" value="' + esc(plainName(inp.name)) + '" placeholder="' + esc(T("horoscope.x.namePh", "พิมพ์ชื่อภาษาไทย")) +
      '"></label><div id="hsNameOut" aria-live="polite"></div>' +
      '<p class="hs-small">' + esc(T("horoscope.x.nameNote", "ค่าพยัญชนะตามตารางที่เผยแพร่ทั่วไป (ก ด ถ ท ภ = 1, ข บ ป ง ช = 2 …) ส่วนสระและวรรณยุกต์ใช้ค่าที่พบบ่อย แต่ละสำนักกำหนดต่างกันเล็กน้อย ชื่อไม่ถูกบันทึก")) + "</p></section>";
    $("#pn-nu").innerHTML = html;
    var upd = function () {
      var o = $("#hsNameOut");
      var nameNum = $("#hsNameNum").value;
      if (crisisOn() || crisisHit(nameNum)) { crisisCard(o); return; } // crisis net first: the name-number field
      // round 3: only a plain name is broken into letters (nothing else typed is echoed back)
      if (nameNum.trim() && !plainName(nameNum)) { o.innerHTML = '<p class="muted">' + esc(T("horoscope.x.nameEmpty", "พิมพ์ชื่อเพื่อดูผลรวม")) + "</p>"; return; }
      var r = HS.thaiNameNumber(nameNum);
      if (!r.sum) { o.innerHTML = '<p class="muted">' + esc(T("horoscope.x.nameEmpty", "พิมพ์ชื่อเพื่อดูผลรวม")) + "</p>"; return; }
      var root = HS.reduceNum(r.sum, false), m = K.numbers[root];
      o.innerHTML = '<p class="namesum"><b>' + r.sum + "</b> → " + root + " · " + esc(m.k) + " — " + esc(m.t) + '</p><p class="letters">' + r.detail.map(function (x) { return "<span>" + esc(x[0]) + "<small>" + x[1] + "</small></span>"; }).join("") + "</p>";
    };
    $("#hsNameNum").addEventListener("input", upd); upd();
  }

  function renderToday(P) {
    var now = new Date(), td = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
    var D = HS.daily(P, td), bh = K.bhumi[D.bhumi], tk = D.taksaToday, rel = K.relations[D.rel];
    var mo = HS.monthly(P, HS.julianDay(td.y, td.m, td.d, now.getHours() + now.getMinutes() / 60) - 7 / 24), mrel = K.relations[mo.rel];
    var html = '<p class="today-h">' + esc(T("horoscope.x.todayH", "วัน{w}ที่ {d}", { w: K.weekdayNames[D.weekday], d: thDateLong(td.y, td.m, td.d) })) + "</p>";
    html += '<div class="hs-grid2"><section class="hs-block"><h3>' + esc(T("horoscope.x.hTaksaToday", "ทักษาจร: วันนี้เป็นวัน \"{b}\" ของคุณ", { b: bh.th })) + "</h3><p>" + esc(bh.day) + '</p><p class="hs-small">' + esc(T("horoscope.x.taksaTodayHow", "เทียบดาววันนี้ ({a}) กับทักษาวันเกิดของคุณ ({b})", { a: DAYS[D.weekday].planet, b: DAYS[P.thaiDay.planet].planet })) + "</p></section>" +
      '<section class="hs-block"><h3>' + esc(T("horoscope.x.hBaziToday", "ปาจื้อวันนี้: ")) + D.pillar.gz + " " + elChip(D.todayEl) + "</h3><p><b>" + esc(rel.th) + "</b> — " + esc(rel.day) + "</p>" +
      (D.clash ? '<p class="note">' + esc(T("horoscope.x.clashToday", "วันนี้กิ่งวันชงกับปีนักษัตรของคุณ (ตามความเชื่อ) แนะนำให้ใจเย็น ค่อย ๆ ตัดสินใจ แล้ววันจะผ่านไปอย่างราบรื่น")) + "</p>" : "") + "</section></div>";
    html += '<section class="hs-block"><h3>' + esc(T("horoscope.x.hColorToday", "สีเสื้อวันนี้")) + '</h3><ul class="advice">' +
      '<li>' + swatch(tk.sri) + "<span><b>" + esc(K.bhumi.sri.th) + "</b> — " + esc(T("horoscope.x.useSri", "โชคลาภ เสน่ห์")) + "</span></li><li>" + swatch(tk.dech) + "<span><b>" + esc(K.bhumi.dech.th) + "</b> — " + esc(T("horoscope.x.useDech", "การงาน ความน่าเชื่อถือ")) + "</span></li><li>" + swatch(tk.montri) + "<span><b>" + esc(K.bhumi.montri.th) + "</b> — " + esc(T("horoscope.x.useMontri", "ผู้ใหญ่เอ็นดู")) + "</span></li>" +
      '<li class="soft">' + swatch(tk.kalakini) + "<span><b>" + esc(T("horoscope.x.colAvoid", "ควรเลี่ยง")) + "</b> — " + esc(T("horoscope.x.avoidNote", "ตามความเชื่อ (ใส่ได้ถ้าจำเป็น ไม่ต้องกังวล)")) + "</span></li></ul>" +
      '<div class="facts small">' + factCard(esc(T("horoscope.x.fFavToday", "ธาตุเสริมวันนี้")), esc(elN(D.favEl)), esc(EL[D.favEl].boost || T("horoscope.x.favDefault", "ตามธาตุเสริมของดวง"))) + factCard(esc(T("horoscope.x.kLuckyDir", "ทิศมงคล")), esc(EL[D.favEl].dir), esc(T("horoscope.x.byFav", "ตามธาตุเสริม{e}", { e: EL[D.favEl].th }))) + factCard(esc(T("horoscope.x.fSriDir", "ทิศของดาวศรีวันนี้")), esc(DAYS[tk.sri].dir), esc(DAYS[tk.sri].planet)) + "</div></section>";
    html += '<section class="hs-block"><h3>' + esc(T("horoscope.x.hMonth", "ดวงเดือนนี้")) + "</h3><p>" + esc(T("horoscope.x.monthPillar", "เดือนตามสุริยคติจีน ")) + "<b>" + mo.pillar.gz + "</b> " + elChip(HS.STEM_EL[mo.pillar.stem]) + esc(T("horoscope.x.sunIn", " · อาทิตย์สถิตราศี{r}", { r: K.rasi[mo.sunRasi].th })) + "</p><p><b>" + esc(mrel.th) + "</b> — " + esc(isZh() ? mrel.day.replace(/今天/g, "本月") : mrel.day.replace("วันนี้", "เดือนนี้")) + "</p>" +
      (mo.branchRel === "clash" ? '<p class="note">' + esc(T("horoscope.x.clashMonth", "เดือนนี้ชงกับปีนักษัตรของคุณ (ตามความเชื่อ) ใช้ความรอบคอบ วางแผนล่วงหน้า แล้วทุกอย่างจะลงตัว")) + "</p>" : mo.branchRel === "harmony" || mo.branchRel === "trine" ? '<p class="note good">' + esc(T("horoscope.x.goodMonth", "เดือนนี้กิ่งเดือนประสานกับปีนักษัตรของคุณ — ช่วงดีสำหรับเริ่มต้นสิ่งใหม่และสร้างความร่วมมือ")) + "</p>" : "") + "</section>";
    html += readingBlock("hsTdRd", T("horoscope.x.todayDetail", "ดวงวันนี้โดยละเอียด"), false);
    $("#pn-td").innerHTML = html;
    bindReading("hsTdRd", function (topic, rng) { return HS.buildDailyFacts(P, D, mo, { topic: topic, rng: rng }); }, false);
  }

  /* ---------- ดวงคู่ ---------- */
  $("#hsPartner").addEventListener("submit", function (e) {
    e.preventDefault(); touch();
    if (crisisOn() || crisisHit($("#hsPName").value)) { lastPartner = null; crisisCard($("#hsCompat")); return; } // crisis net first: the partner name
    if (!current) return;
    var err = $("#hsPErr"); err.textContent = "";
    var raw = $("#hsPYear").value.replace(/\D/g, ""); $("#hsPYear").value = raw;
    var dt = readDate($("#hsPDay"), $("#hsPMonth"), $("#hsPYear"), "auto");
    if (dt.err) { err.textContent = dt.err; return; }
    var s = settings();
    var P2 = HS.analyze(Object.assign({}, s, { y: dt.y, m: dt.m, d: dt.d, time: parseTime($("#hsPTime").value), name: "", lunarMonthOverride: null }));
    lastPartner = { P2: P2, name: $("#hsPName").value.trim() };
    renderCompat(current, P2, lastPartner.name);
  });
  function renderCompat(P1, P2, pname) {
    var C = HS.compatibility(P1, P2), lv = K.compat.levels.find(function (l) { return C.score >= l[0]; });
    var who = pname || T("horoscope.x.other", "อีกคน");
    var vs = function (a, b) { return T("horoscope.x.vs", "{a} กับ {b}", { a: a, b: b }); };
    var line = function (w) {
      if (w.k === "zodiac") return "<li><b>" + esc(T("horoscope.x.fYear", "ปีนักษัตร")) + "</b> " + esc(vs(yearN(P1.zodiac.chinese.animal), yearN(P2.zodiac.chinese.animal))) + " — " + esc(K.R.compat.zodiac[w.rel]) + "</li>";
      if (w.k === "element") return "<li><b>" + esc(T("horoscope.x.cElement", "ธาตุประจำตัว")) + "</b> " + elChip(w.a) + " " + esc(T("horoscope.x.with", "กับ")) + " " + elChip(w.b) + " — " + esc(K.R.compat.element[w.rel]) + "</li>";
      if (w.k === "thaiday") return "<li><b>" + esc(T("horoscope.x.kDay", "วันเกิด")) + "</b> " + esc(vs(DAYS[P1.thaiDay.planet].name, DAYS[P2.thaiDay.planet].name)) + " — " + esc(w.friend ? K.compat.thaiFriend : w.same ? K.compat.thaiSame : (w.b1 === "kalakini" || w.b2 === "kalakini") ? K.compat.thaiCare : (["sri", "dech", "montri", "mula"].indexOf(w.b1) >= 0 || ["sri", "dech", "montri", "mula"].indexOf(w.b2) >= 0) ? K.compat.thaiGood : K.compat.thaiNeutral) + "</li>";
      if (w.k === "rasi") return "<li><b>" + esc(T("horoscope.x.cRasi", "ราศี")) + "</b> " + esc(vs(K.rasi[P1.sunRasi.index].th, K.rasi[P2.sunRasi.index].th)) + " — " + esc(K.R.compat.rasi[w.a === w.b ? "same" : w.pts >= 4 ? "good" : "other"]) + "</li>";
      return "<li><b>" + esc(T("horoscope.x.fLp", "เลขชีวิต")) + "</b> " + esc(vs(w.a, w.b)) + " — " + esc(K.R.compat.lp[w.pts >= 6 ? "group" : w.pts === 5 ? "same" : "other"]) + "</li>";
    };
    var R = 54, L = 2 * Math.PI * R;
    $("#hsCompat").innerHTML = '<section class="hs-block compat"><div class="ring"><svg viewBox="0 0 140 140" role="img" aria-label="' + esc(T("horoscope.x.compatAria", "ความเข้ากัน {s}%", { s: C.score })) + '"><circle cx="70" cy="70" r="' + R + '" fill="none" stroke="#eceffa" stroke-width="14"/><circle cx="70" cy="70" r="' + R + '" fill="none" stroke="#674ff2" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + (L * C.score / 100).toFixed(1) + " " + L.toFixed(1) + '" transform="rotate(-90 70 70)"/><text x="70" y="76" text-anchor="middle" font-size="30" font-weight="700" fill="#0e1430">' + C.score + '%</text></svg></div>' +
      "<div><h3>" + esc(lv[1]) + "</h3><p>" + esc(T("horoscope.x.compatWho", "คุณกับ{who} ({day} · {date}) — {desc}", { who: who, day: DAYS[P2.thaiDay.planet].name, date: thDate(P2.input.y, P2.input.m, P2.input.d), desc: lv[2] })) + '</p><ul class="why">' + C.why.map(line).join("") + '</ul><p class="hs-small">' + esc(T("horoscope.x.compatNote", "คะแนนเชิงบันเทิง (55–98%) รวมจากหลายศาสตร์ ความสัมพันธ์ที่ดีมาจากความเข้าใจและการใส่ใจกัน ไม่ใช่ตัวเลข")) + "</p></div></section>";
  }

  /* ---------- แสดงผล ---------- */
  var resultSec = $("#hsResult");
  function resultSub(P) {
    var inp = P.input, nm = plainName(inp.name);
    return (nm ? nm + " · " : "") + (isZh()
      ? T("horoscope.x.sub", "{day}出生 · {date}{time}", { day: dayTitle(P), date: thDateLong(inp.y, inp.m, inp.d), time: inp.time ? " " + hm(inp.time.h, inp.time.mi) : T("horoscope.x.noTimeSub", " (ไม่ระบุเวลา)") })
      : "เกิด" + dayTitle(P) + (P.thaiDay.rahu ? " " : "") + "ที่ " + thDateLong(inp.y, inp.m, inp.d) + (inp.time ? " เวลา " + hm(inp.time.h, inp.time.mi) + " น." : " (ไม่ระบุเวลา)"));
  }
  function renderAll(P) {
    $("#hsResSub").textContent = resultSub(P);
    renderOverview(P); renderThai(P); renderBazi(P); renderNum(P); renderToday(P);
  }
  /* crisis net (review 2026-11-12): a crisis signal in any field shows the support card INSTEAD of every reading tab;
     nothing typed is echoed (subtitle emptied) and the share card cannot be made */
  function crisisHit(v) { var FA = window.FortuneAI; return !!(v && FA && FA.crisis && FA.crisis.check(v)); }
  /* crisis state (owner order 2026-11-12): once the support card was shown on this page, every later request shows it again
     (no tab with lucky colours, boosting elements or remedies) until the page is reloaded */
  function crisisOn() { var FA = window.FortuneAI; return !!(FA && FA.crisis && FA.crisis.active && FA.crisis.active()); }
  function pageFields() { var FA = window.FortuneAI; return FA && FA.crisis && FA.crisis.fields ? FA.crisis.fields() : ""; }
  function crisisCard(box) {
    var FA = window.FortuneAI; box.innerHTML = "";
    if (FA && FA.crisis) FA.crisis.render(box, FA.crisis.result({ lang: (window.LQI18N && window.LQI18N.lang) || "th" }));
  }
  /* round 3: names are shown only when they are plain names; the soft step comes before any tab */
  function plainName(s) { var CRx = window.LQFortuneCrisis; return CRx ? CRx.plainName(s) : String(s || ""); }
  function softHit() { var CRx = window.LQFortuneCrisis; return !!(CRx && CRx.pageSoft()); }
  function clearResult() {
    current = null; lastPartner = null;
    ["pn-ov", "pn-th", "pn-bz", "pn-nu", "pn-td"].forEach(function (id) { document.getElementById(id).innerHTML = ""; });
    $("#hsCompat").innerHTML = ""; $("#hsResSub").textContent = ""; $("#hsCardImg").hidden = true;
    $("#hsTabs").hidden = true; $("#hsShare").hidden = true;
  }
  function showSoft(cont) {
    var CRx = window.LQFortuneCrisis;
    clearResult();
    var box = document.createElement("div"); $("#pn-ov").appendChild(box);
    CRx.renderSoft(box, (window.LQI18N && window.LQI18N.lang) || "th", function () { CRx.ack(); cont(); }, function () { showCrisis(); });
    resultSec.hidden = false; selectTab(tabs[0], false, true);
    resultSec.scrollIntoView({ block: "start" });
  }
  function showCrisis() {
    current = null; lastPartner = null;
    ["pn-ov", "pn-th", "pn-bz", "pn-nu", "pn-td"].forEach(function (id) { document.getElementById(id).innerHTML = ""; });
    $("#hsCompat").innerHTML = ""; $("#hsResSub").textContent = ""; $("#hsCardImg").hidden = true;
    $("#hsTabs").hidden = true; $("#hsShare").hidden = true;
    var box = document.createElement("div"); box.id = "hsRd"; $("#pn-ov").appendChild(box);
    crisisCard(box);
    resultSec.hidden = false; selectTab(tabs[0], false, true);
    resultSec.scrollIntoView({ block: "start" });
    box.setAttribute("tabindex", "-1"); box.focus({ preventScroll: true });
  }
  function show(P) {
    current = P; lastPartner = null;
    $("#hsTabs").hidden = false; $("#hsShare").hidden = false;
    renderAll(P);
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
    var P = current, d = DAYS[P.thaiDay.planet], b = P.bazi, z = P.zodiac, ra = K.rasi[P.sunRasi.index];
    try { await Promise.all([document.fonts.load("700 60px Prompt"), document.fonts.load("500 30px Prompt"), document.fonts.load("400 30px Prompt")]); } catch (e) { /* ใช้ฟอนต์ระบบ */ }
    var W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d"), F = isZh() ? "Prompt, 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif" : "Prompt, system-ui, sans-serif";
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0e1430"); g.addColorStop(1, "#1e2a5a"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    var rg = c.createRadialGradient(W / 2, 380, 30, W / 2, 380, 520); rg.addColorStop(0, d.hex + "88"); rg.addColorStop(1, "rgba(14,20,48,0)"); c.fillStyle = rg; c.fillRect(0, 0, W, H);
    // โลโก้
    c.save(); c.translate(72, 64); c.strokeStyle = "#22d3ee"; c.lineWidth = 4; c.lineCap = "round";
    rr(c, 0, 0, 60, 60, 18); c.fillStyle = "rgba(255,255,255,.08)"; c.fill();
    c.beginPath(); [[14, 24, 14, 14, 24, 14], [46, 24, 46, 14, 36, 14], [14, 36, 14, 46, 24, 46], [46, 36, 46, 46, 36, 46]].forEach(function (q) { c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.lineTo(q[4], q[5]); }); c.stroke();
    c.beginPath(); c.arc(30, 30, 8, 0, Math.PI * 2); c.fillStyle = "#8b78ff"; c.fill(); c.restore();
    c.textBaseline = "middle"; c.textAlign = "left"; c.font = "700 40px " + F; c.fillStyle = "#fff"; c.fillText("LENS", 148, 96);
    var lw = c.measureText("LENS").width; c.fillStyle = "#a99bff"; c.fillText("IQ", 148 + lw, 96);
    c.textAlign = "right"; c.font = "500 34px " + F; c.fillStyle = "#c9d0ea"; c.fillText(T("horoscope.x.cardTitle", "ดวงวันเดือนปีเกิด"), W - 72, 96);
    // วงกลมสีวันเกิด
    var cy = 330; c.beginPath(); c.arc(W / 2, cy, 150, 0, Math.PI * 2); c.fillStyle = d.hex; c.fill();
    c.lineWidth = 10; c.strokeStyle = "rgba(255,255,255,.85)"; c.stroke();
    c.textAlign = "center"; c.fillStyle = P.thaiDay.planet === 1 ? "#3d2d00" : "#fff"; c.font = "700 64px " + F; c.fillText(d.short.replace("(ค)", ""), W / 2, cy - 18);
    c.font = "500 30px " + F; c.fillText(T("horoscope.x.cardColor", "สี{c}", { c: d.color.split(" / ")[0] }), W / 2, cy + 46);
    c.fillStyle = "#fff"; c.font = "700 70px " + F; c.fillText(bornOn(dayTitle(P).replace(" (ราหู)", "")), W / 2, 560);
    c.font = "400 32px " + F; c.fillStyle = "#c9d0ea"; c.fillText(deity(d) + " · " + d.buddha, W / 2, 624);
    // สี่เสา
    var ps = [[T("horoscope.x.cYear", "ปี"), b.year], [T("horoscope.x.cMonth", "เดือน"), b.month], [T("horoscope.x.cDay", "วัน"), b.day], [T("horoscope.x.cHour", "ยาม"), b.hour]], bw = 190, gap = 24, x0 = (W - (bw * 4 + gap * 3)) / 2;
    ps.forEach(function (q, i) {
      var x = x0 + i * (bw + gap), y = 676; rr(c, x, y, bw, 276, 26); c.fillStyle = i === 2 ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.07)"; c.fill();
      c.fillStyle = "#c9d0ea"; c.font = "400 26px " + F; c.fillText(q[0], x + bw / 2, y + 34);
      if (!q[1]) { c.fillStyle = "#8f9bc4"; c.font = "500 60px " + F; c.fillText("?", x + bw / 2, y + 140); c.font = "400 22px " + F; c.fillText(T("horoscope.x.cNoTime", "ไม่ทราบเวลา"), x + bw / 2, y + 248); return; }
      c.font = "700 72px 'Noto Serif SC', 'Songti SC', serif";
      var cc = function (e) { return e === "metal" ? "#d5dae3" : EL[e].color; };
      c.fillStyle = cc(HS.STEM_EL[q[1].stem]); c.fillText(HS.STEMS[q[1].stem], x + bw / 2, y + 100);
      c.fillStyle = cc(HS.BRANCH_EL[q[1].branch]); c.fillText(HS.BRANCHES[q[1].branch], x + bw / 2, y + 180);
      c.fillStyle = "#fff"; c.font = "400 26px " + F; c.fillText(K.animals[q[1].branch].th, x + bw / 2, y + 248);
    });
    // ชิปข้อมูล
    var chips = [rasiN(P.sunRasi.index), yearN(z.thai.animal), elN(P.dayMaster), T("horoscope.x.cLp", "เลขชีวิต {n}", { n: P.lifePath.value })];
    c.font = "500 34px " + F;
    var cw = chips.map(function (t) { return c.measureText(t).width + 56; }), tot = cw.reduce(function (s, v) { return s + v; }, 0) + 16 * 3, cx = (W - tot) / 2;
    chips.forEach(function (t, i) { rr(c, cx, 982, cw[i], 70, 35); c.fillStyle = "rgba(255,255,255,.1)"; c.fill(); c.fillStyle = "#fff"; c.fillText(t, cx + cw[i] / 2, 1018); cx += cw[i] + 16; });
    void ra;
    // สีมงคลวันนี้
    var kl = (readings.hsRd && readings.hsRd.lines) || [];
    if (kl.length >= 2) {
      kl.slice(0, 3).forEach(function (t, i) { var fs = 30; c.font = "500 " + fs + "px " + F; while (c.measureText(t).width > W - 150 && fs > 20) { fs -= 2; c.font = "500 " + fs + "px " + F; } c.fillStyle = i ? "#e4e8f7" : "#a5f3fc"; c.fillText(t, W / 2, 1104 + i * 54); });
    } else {
    var tk = HS.taksa(new Date().getDay());
    c.font = "400 30px " + F; c.fillStyle = "#c9d0ea"; c.fillText(T("horoscope.x.cardColors", "สีเสื้อมงคลวันนี้"), W / 2, 1100);
    [tk.sri, tk.dech, tk.montri].forEach(function (p, i) {
      var x = W / 2 + (i - 1) * 250; c.beginPath(); c.arc(x - 70, 1160, 22, 0, Math.PI * 2); c.fillStyle = DAYS[p].hex; c.fill();
      c.fillStyle = "#fff"; c.textAlign = "left"; c.font = "500 28px " + F; c.fillText(K.bhumi[["sri", "dech", "montri"][i]].th + " " + DAYS[p].color.split(" / ")[0], x - 38, 1162); c.textAlign = "center";
    });
    }
    c.font = "400 24px " + F; c.fillStyle = "#8f9bc4"; c.fillText(K.disclaimerShort + T("horoscope.x.cardFoot", " · คำนวณในเครื่อง ไม่บันทึกข้อมูล"), W / 2, 1290);
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
      var file = new File([blob], isZh() ? "lensiq-horoscope.png" : "lensiq-ดวงวันเกิด.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: T("horoscope.x.shareTitle", "ดวงวันเดือนปีเกิด — LENSIQ"), text: bornOn(dayTitle(current)) + " · " + K.disclaimerShort }); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
      var a = document.createElement("a"); a.href = cardUrl; a.download = "lensiq-horoscope.png"; document.body.append(a); a.click(); a.remove();
      toast(T("horoscope.x.saved", "บันทึกการ์ดแล้ว"));
    } catch (e) { console.error(e); toast(T("horoscope.x.cardFail", "สร้างการ์ดไม่สำเร็จ")); }
    finally { b.disabled = false; }
  });
  $("#hsPrint").addEventListener("click", function () { touch(); window.print(); });
  $("#hsAgain").addEventListener("click", reset);

  function toast(msg) { var t = $("#hsToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("show"); }, 2200); }

  function reset() {
    resultSec.hidden = true; current = null; lastPartner = null;
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
    if (!st || !st.total) { box.innerHTML = '<p class="muted">' + esc(T("horoscope.x.statsEmpty", "ยังไม่มีการดูดวงในเครื่องนี้")) + "</p>"; return; }
    var dd = new Date(), today = dd.getFullYear() + "-" + HS.pad2(dd.getMonth() + 1) + "-" + HS.pad2(dd.getDate());
    var mx = Math.max.apply(null, K.animals.map(function (_, i) { return (st.zodiac || {})[i] || 0; })) || 1;
    box.innerHTML = '<p class="stat-n"><b>' + st.total + "</b> " + esc(T("horoscope.x.times", "ครั้ง")) + " <small>" + esc(T("horoscope.x.statsToday", "(วันนี้ {n})", { n: (st.days || {})[today] || 0 })) + "</small></p>" +
      '<div class="elbars z">' + K.animals.map(function (a, i) { var n = (st.zodiac || {})[i] || 0; return '<div class="elbar"><span>' + esc(a.th) + '</span><i style="--w:' + Math.round(n / mx * 100) + '%;--c:#674ff2"></i><b>' + n + "</b></div>"; }).join("") + "</div>";
  }
  $("#hsStatsOn").checked = !!prefs.stats;
  $("#hsStatsOn").addEventListener("change", function () { prefs.stats = this.checked; savePrefs(); });
  $("#hsStatsClear").addEventListener("click", function () { if (confirm(T("horoscope.x.statsConfirm", "ล้างสถิติในเครื่องนี้?"))) { try { localStorage.removeItem(STATS_KEY); } catch (e) { /* ไม่เป็นไร */ } renderStats(); } });
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
      if (left <= 15) { el.hidden = false; el.textContent = T("horoscope.x.idle", "กลับหน้าเริ่มต้นใน {n} วินาที — แตะเพื่ออยู่ต่อ", { n: left }); }
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

  // citation list: back office / docs only (owner order 2026-11-12, tools/fortune-sources.mjs)

  /* ---------- สลับภาษา: วาดข้อความที่ JS สร้างใหม่ทั้งหมด (คำทำนายจะเรียบเรียงใหม่ในภาษานั้น) ---------- */
  var lastLang = "th";
  window.addEventListener("lq-lang", function (e) {
    var was = K, lang = e && e.detail && e.detail.lang || "th", same = lang === lastLang;
    lastLang = lang;
    syncKB();
    if (was === K && current == null && same) return;
    fillForm(); renderStats(); eraHint();
    if (!current) return;
    var sel = tabs.find(function (t) { return t.getAttribute("aria-selected") === "true"; }) || tabs[0];
    renderAll(current);
    if (lastPartner) renderCompat(current, lastPartner.P2, lastPartner.name);
    selectTab(sel, false, true);
  });
  syncKB(); if (K !== KB) { fillForm(); renderStats(); }
  window.__hs = { get current() { return current; }, readings: readings, makeCard: makeCard, reset: reset, show: show }; // ใช้ทดสอบ
})();
