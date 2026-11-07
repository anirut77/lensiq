/* fengshui.js — ฮวงจุ้ย (LENSIQ)
 * ส่วนที่ 1: FSCore — ฟังก์ชันคำนวณล้วน (ทดสอบด้วย Node ได้): ลี่ชุน/เดือนสุริยคติ, เลขกัว, ดาวเหิน, ทิศจากเข็มทิศ,
 *           ผังบ้าน 3×3, วิเคราะห์ภาพห้อง, สร้าง facts สำหรับ fortune-ai.js
 * ส่วนที่ 2: ส่วนติดต่อผู้ใช้ (เบราว์เซอร์เท่านั้น)
 * ไม่ส่งวันเกิดหรือรูปออกจากเครื่อง — ส่งให้ AI เฉพาะผลคำนวณเมื่อผู้ใช้ยินยอม
 */
(function (root) {
  "use strict";
  var KB = root.FS_KB || (typeof require === "function" ? require("./fengshui-kb.js") : null);
  var DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  var D2R = Math.PI / 180;
  var norm = function (a) { return ((a % 360) + 360) % 360; };
  var mod9 = function (n) { var r = ((n % 9) + 9) % 9; return r === 0 ? 9 : r; };

  /* ---------- ดาราศาสตร์: ลองจิจูดปรากฏของดวงอาทิตย์ (Meeus ความแม่นยำต่ำ ~0.01°) ---------- */
  function jdOf(ms) { return ms / 86400000 + 2440587.5; }
  function sunLongitude(ms) {
    var T = (jdOf(ms) - 2451545) / 36525;
    var L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
    var M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * D2R;
    var C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M) + (0.019993 - 0.000101 * T) * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
    var om = (125.04 - 1934.136 * T) * D2R;
    return norm(L0 + C - 0.00569 - 0.00478 * Math.sin(om));
  }
  /** เวลาที่ดวงอาทิตย์อยู่ที่ลองจิจูด lon ในปี ค.ศ. year (คืน ms UTC) */
  function termInstant(year, lon) {
    var jan1 = Date.UTC(year, 0, 1), guess = jan1 + norm(lon - 280) / 360 * 365.2422 * 86400000;
    var lo = guess - 6 * 86400000, hi = guess + 6 * 86400000;
    var diff = function (t) { var d = sunLongitude(t) - lon; return ((d + 540) % 360) - 180; };
    for (var i = 0; i < 50; i++) { var mid = (lo + hi) / 2; if (diff(mid) < 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  /** วันที่ตามเวลาจีน (UTC+8) ของจุดเวลา ms → {y,m,d} */
  function cnDate(ms) { var d = new Date(ms + 8 * 3600000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; }
  function lichun(year) { return cnDate(termInstant(year, 315)); }

  /** ปีสุริยคติจีนของวันเกิด (ไม่มีเวลาเกิด) — boundary: "before" | "same" | "near" | null */
  function solarYear(y, m, d) {
    var L = lichun(y), cmp = (m - L.m) * 40 + (d - L.d);
    var r = { year: cmp < 0 ? y - 1 : y, lichun: L, boundary: null };
    if (cmp === 0) r.boundary = "same";
    else if (Math.abs(cmp) <= 1) r.boundary = "near";
    if (cmp < 0 && m <= 2) r.shifted = true;
    return r;
  }
  /** แปลงปีที่ผู้ใช้กรอก: era "be" | "ce" | "auto" */
  function toCE(year, era) {
    year = parseInt(year, 10); if (!isFinite(year)) return NaN;
    if (era === "be" || (era === "auto" && year > 2300)) return year - 543;
    return year;
  }
  function validDate(y, m, d) { var t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; }

  /* ---------- เลขกัว ---------- */
  /** formula: "yang" (สูตรดั้งเดิมของเพศชาย) | "yin" (สูตรดั้งเดิมของเพศหญิง) */
  function kuaRaw(solarY, formula) { var r = solarY % 9; return formula === "yin" ? mod9(r + 4) : mod9(11 - r); }
  function kuaEffective(k, formula) { return k === 5 ? (formula === "yin" ? 8 : 2) : k; }
  function kuaGroup(k) { return [1, 3, 4, 9].indexOf(k) >= 0 ? "east" : "west"; }
  function kua(solarY, formula) {
    var raw = kuaRaw(solarY, formula), eff = kuaEffective(raw, formula);
    return { raw: raw, kua: eff, formula: formula, group: kuaGroup(eff), stars: KB.kuaTable[eff], solarYear: solarY };
  }
  /** ดาวแปดคฤหาสน์ของทิศหนึ่งสำหรับเลขกัว */
  function starOfDir(k, dir) { var t = KB.kuaTable[k]; for (var s in t) if (t[s] === dir) return s; return null; }

  /* ---------- ดาวเหิน ---------- */
  function annualCenter(solarY) { return mod9(11 - (solarY % 9)); }
  /** ผังดาว: center → {C,NW,W,NE,S,N,SW,E,SE} (บินตามลำดับเลขเพิ่มขึ้น) */
  function flyChart(center) {
    var out = {};
    KB.flightPath.forEach(function (p, i) { out[p] = mod9(center + i); });
    return out;
  }
  /** เดือนสุริยคติ (0 = ขาล เริ่มที่ลี่ชุน) และดาวกลางเดือน สำหรับวันที่ปฏิทิน (เที่ยงวันเวลาจีน) */
  function monthInfo(y, m, d) {
    var t = Date.UTC(y, m - 1, d, 4); // 12:00 UTC+8
    var k = Math.floor(norm(sunLongitude(t) - 315) / 30);
    var sy = (m <= 2 && k >= 10) ? y - 1 : y;
    var br = ((sy - 4) % 12 + 12) % 12;
    var start = [0, 3, 6, 9].indexOf(br) >= 0 ? 8 : [1, 4, 7, 10].indexOf(br) >= 0 ? 5 : 2;
    return { k: k, solarYear: sy, branch: br, center: mod9(start - k), yearCenter: annualCenter(sy) };
  }

  /* ---------- เข็มทิศ ---------- */
  function headingToDir(h) { return DIRS[Math.round(norm(h) / 45) % 8]; }
  /** ทิศที่กล้องหลังชี้ (ตั้งโทรศัพท์) หรือทิศขอบบนเครื่อง (วางราบ) จากมุมออยเลอร์ W3C (alpha อ้างอิงทิศเหนือจริง) */
  function headingFromEuler(alpha, beta, gamma, screenAngle) {
    var a = alpha * D2R, b = beta * D2R, g = gamma * D2R;
    var ca = Math.cos(a), sa = Math.sin(a), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
    var bx = -ca * sg - sa * sb * cg, by = -sa * sg + ca * sb * cg; // เวกเตอร์กล้องหลัง (x=ตะวันออก, y=เหนือ)
    if (Math.hypot(bx, by) > 0.45) return norm(Math.atan2(bx, by) / D2R);
    return norm(360 - alpha + (screenAngle || 0)); // วางราบ: ใช้ขอบบนของเครื่อง
  }
  function angDiff(a, b) { return ((a - b + 540) % 360) - 180; }
  /** ค่าเฉลี่ยเชิงมุมแบบหน่วง (กันเข็มสั่น) */
  function smoothHeading(prev, next, k) { if (prev == null) return norm(next); return norm(prev + angDiff(next, prev) * (k == null ? 0.25 : k)); }

  /* ---------- ผังบ้าน 3×3 (หน้าบ้านอยู่ด้านล่างของจอ) ---------- */
  var CELL_THETA = [315, 0, 45, 270, null, 90, 225, 180, 135];
  /** facing = ทิศที่ประตูหลักหันออก (มองจากในบ้านออกไป) → ทิศของแต่ละช่อง (index 0..8 แถวบนซ้าย→ล่างขวา) */
  function planSectors(facing) {
    var F = KB.dirs[facing].deg;
    return CELL_THETA.map(function (th) { return th == null ? "C" : headingToDir(F + 180 + th); });
  }

  /* ---------- คำแนะนำรายโซน ---------- */
  function sectorAdvice(dir, star, rooms, kuaN) {
    var S = KB.flying[star], B = KB.bagua[dir], E = KB.elements[S.element];
    rooms = rooms || [];
    var w = rooms.length ? Math.max.apply(null, rooms.map(function (r) { return KB.rooms[r].weight; })) : 0.4;
    var personal = kuaN && dir !== "C" ? starOfDir(kuaN, dir) : null;
    var prio = S.care * w + (S.boost ? S.boost * 0.4 * w : 0) + (rooms.indexOf("door") >= 0 ? 0.5 : 0);
    var cureEl = S.care ? E.generates : (function () { for (var k in KB.elements) if (KB.elements[k].generates === S.element) return k; return S.element; })();
    var lines = [];
    lines.push((S.care ? "ควรจัดให้สงบ: " : "เสริมได้: ") + S.cure);
    rooms.forEach(function (r) { if (S.care && KB.roomStarNote[r] && (r === "bath" || r === "kitchen")) lines.push(KB.roomStarNote[r]); });
    if (rooms.indexOf("bath") >= 0 && !S.care) lines.push("ดาวมงคลตกที่ห้องน้ำ — ไม่เป็นไร ดูแลให้สะอาด แห้ง และเปิดไฟให้สว่าง");
    return {
      dir: dir, star: star, starInfo: S, bagua: B, rooms: rooms, personal: personal,
      level: S.care ? (S.care >= 3 ? "high" : "mid") : "good",
      priority: Math.round(prio * 100) / 100, cureElement: cureEl, lines: lines
    };
  }

  /* ---------- วิเคราะห์ภาพห้อง (ImageData-like: {data,width,height}) ---------- */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d > 1e-6) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function pixelElement(r, g, b) {
    var hsl = rgbToHsl(r, g, b), h = hsl[0], s = hsl[1], l = hsl[2];
    if (l < 0.16) return "water";
    if (s < 0.12 || l > 0.93) return l < 0.25 ? "water" : "metal";
    if (s < 0.3 && h >= 15 && h < 70) return "earth";
    if (h < 15 || h >= 290) return "fire";
    if (h < 70) return h < 35 && s > 0.6 && l > 0.35 ? "fire" : "earth";
    if (h < 170) return "wood";
    if (h < 260) return "water";
    return "fire";
  }
  function analyzeImage(img) {
    var w = img.width, h = img.height, p = img.data, n = w * h;
    var lumSum = 0, satSum = 0, cnt = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
    var gray = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var r = p[i * 4], g = p[i * 4 + 1], b = p[i * 4 + 2];
      var y = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; gray[i] = y; lumSum += y;
      satSum += rgbToHsl(r, g, b)[1];
      cnt[pixelElement(r, g, b)]++;
    }
    var edges = 0, tot = 0;
    for (var yy = 1; yy < h - 1; yy++) for (var xx = 1; xx < w - 1; xx++) {
      var k = yy * w + xx;
      var gx = gray[k - w + 1] + 2 * gray[k + 1] + gray[k + w + 1] - gray[k - w - 1] - 2 * gray[k - 1] - gray[k + w - 1];
      var gy = gray[k + w - 1] + 2 * gray[k + w] + gray[k + w + 1] - gray[k - w - 1] - 2 * gray[k - w] - gray[k - w + 1];
      if (Math.hypot(gx, gy) > 0.35) edges++;
      tot++;
    }
    var shares = {}; Object.keys(cnt).forEach(function (e) { shares[e] = cnt[e] / n; });
    var dom = Object.keys(shares).sort(function (a, b) { return shares[b] - shares[a]; })[0];
    return { brightness: lumSum / n, saturation: satSum / n, edgeDensity: tot ? edges / tot : 0, shares: shares, dominant: dom };
  }
  function photoAdvice(a, star) {
    var P = KB.photo, out = [];
    if (a.brightness < 0.32) out.push({ k: "dark", t: P.dark });
    else if (a.brightness > 0.78) out.push({ k: "veryBright", t: P.veryBright });
    else out.push({ k: "bright", t: P.bright });
    if (a.edgeDensity > 0.14) out.push({ k: "busy", t: P.busy });
    else if (a.edgeDensity < 0.06) out.push({ k: "calm", t: P.calm });
    var E = KB.elements[a.dominant];
    out.push({ k: "dominant", t: P.dominant.replace("{el}", E.th).replace("{colors}", E.colors.slice(0, 2).join("/")) });
    if (star) {
      var S = KB.flying[star], want;
      if (S.care) want = KB.elements[S.element].generates;
      else { want = S.element; for (var k in KB.elements) if (KB.elements[k].generates === S.element) want = k; }
      if (a.dominant === want || (!S.care && a.dominant === S.element)) out.push({ k: "balance", t: P.balanceGood });
      else { var W = KB.elements[want]; out.push({ k: "balanceTip", el: want, t: P.balanceTip.replace("{el}", W.th).replace("{colors}", W.colors.slice(0, 2).join("/")) }); }
    }
    return out;
  }

  /* ---------- สถิติไม่ระบุตัวตน fs-stats {v,total,days:{},kua:{}} ---------- */
  function addStat(st, k, now) {
    st = st && typeof st === "object" ? st : {};
    var d = new Date(now || Date.now());
    var day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var out = { v: 1, total: (st.total || 0) + 1, days: Object.assign({}, st.days || {}), kua: Object.assign({}, st.kua || {}) };
    out.days[day] = (out.days[day] || 0) + 1;
    if (k) out.kua[k] = (out.kua[k] || 0) + 1;
    return out;
  }

  /* ---------- facts สำหรับ fortune-ai.js ---------- */
  var dirTh = function (d) { return KB.dirs[d].th; };
  // ชื่อภาษาไทยก่อน อักษรจีนอยู่ในวงเล็บ เช่น "坎 ขั้น" → "ขั้น (坎)", "กลุ่มตะวันออก (東四命)" → "กลุ่มตะวันออก"
  function triTh(t) { var m = /^([\u2E80-\u9FFF]+)\s+(.+)$/.exec(String(t || "")); return m ? m[2] + " (" + m[1] + ")" : String(t || ""); }
  function noCn(t) { return String(t || "").replace(/\s*\([^)]*[\u2E80-\u9FFF][^)]*\)/g, ""); }
  function buildFacts(st) {
    var items = [], extras = { luckyColors: [], directions: [], tips: [] };
    var K = st.kua, now = st.now || new Date();
    var mi = monthInfo(now.getFullYear(), now.getMonth() + 1, now.getDate());
    var yc = mi.yearCenter, YS = KB.flying[yc], MS = KB.flying[mi.center];
    var chart = flyChart(yc);
    var five = Object.keys(chart).filter(function (p) { return chart[p] === 5; })[0];
    var two = Object.keys(chart).filter(function (p) { return chart[p] === 2; })[0];
    items.push({
      id: "year.center." + yc, group: "ดาวประจำปี", label: "ปี " + mi.solarYear + " ดาว " + yc + " " + YS.th + " เข้าศูนย์กลาง", short: "ดาวประจำปี",
      evidence: "ผังดาวเหินรายปี (ลั่วซู) · ปีเริ่มที่ลี่ชุน", strength: 0.8, tags: ["overview", "timing"],
      meanings: {
        overview: [
          // ไม่พูดชื่อดาวซ้ำกับป้ายชื่อ ("…เข้าศูนย์กลาง บ่งบอกว่าปีนี้ดาว … เข้าศูนย์กลาง")
          "บรรยากาศของทั้งปีเน้นเรื่อง" + YS.theme,
          "ตลอดปีนี้ ตำราผูกพลังกลางบ้านไว้กับ" + YS.theme
        ],
        timing: [
          "โซน" + dirTh(five) + "มีดาว 5 เหลืองประจำปี ตำราแนะนำให้จัดให้สงบ เลี่ยงงานทุบเจาะในโซนนี้ถ้าเลื่อนได้ ส่วนโซน" + dirTh(two) + "มีดาว 2 ดำ ควรจัดให้โล่งและอากาศถ่ายเท",
          "ปีนี้ควรลดการรบกวนในโซน" + dirTh(five) + " (ดาว 5) และโซน" + dirTh(two) + " (ดาว 2) จัดให้เรียบร้อย ใช้ของตกแต่งโทนโลหะเพื่อให้รู้สึกสงบ"
        ]
      }
    });
    items.push({
      id: "month.center." + mi.center, group: "ดาวประจำเดือน", label: "เดือน" + KB.monthNames[mi.k].replace(/\s*\([^)]*\)/, "") + " ดาว " + mi.center + " " + MS.th + " เข้าศูนย์กลาง", short: "ดาวประจำเดือน",
      evidence: "เดือนสุริยคติจีน (เริ่มตามสารทจีน 12 จุด)", strength: 0.5, tags: ["timing"],
      meanings: { timing: [
        "จังหวะของเดือนนี้เน้น" + MS.theme,
        "ตลอดเดือนนี้ ลองใช้พื้นที่กลางบ้านให้โปร่งและสว่าง"
      ] }
    });
    if (K) {
      var I = KB.kuaInfo[K.kua], G = KB.groups[K.group], EL = KB.elements[I.element], T = KB.kuaTable[K.kua];
      items.push({
        id: "kua." + K.kua, group: "เลขกัว", label: "เลขกัว " + K.kua + " " + G.th, short: "เลขกัว " + K.kua,
        evidence: "ปีสุริยคติ " + K.solarYear + (K.raw === 5 ? " (ได้ 5 ใช้ " + K.kua + ")" : ""), strength: 1, tags: ["overview", "personality"],
        meanings: {
          overview: [
            "เลขกัวของคุณคือ " + K.kua + " ตรงกับตรีแกรม" + triTh(I.trigram) + " อยู่ใน" + noCn(G.th) + " ทิศที่เข้ากับคุณตามตำราคือ" + G.dirs.slice(0, -1).map(dirTh).join(" ") + " และ" + dirTh(G.dirs[G.dirs.length - 1]),
            "ตามศาสตร์ปาจ้าย คุณเป็นคน" + noCn(G.th) + " เลขกัว " + K.kua + " ธาตุ" + EL.th + " ทิศหลักที่ส่งเสริมคือ" + dirTh(T.shengqi)
          ],
          personality: [
            "ธาตุ" + EL.th + "ของเลขกัว " + K.kua + " มักสะท้อนความเป็นคน" + I.vibe.join(" ") ,
            "ตำราเปรียบเลขกัว " + K.kua + " กับตรีแกรม" + noCn(triTh(I.trigram)) + " ผู้ที่มีพลังแบบนี้มักถูกมองว่า" + I.vibe[0] + "และ" + I.vibe[1]
          ]
        }
      });
      var s1 = KB.stars8;
      items.push({ id: "dir.shengqi", group: "ทิศมงคล", label: "ทิศ" + dirTh(T.shengqi) + " (เซิงชี่)", short: "ทิศเซิงชี่", strength: 0.9, tags: ["work", "money"],
        meanings: {
          work: ["หันหน้าโต๊ะทำงานไปทาง" + dirTh(T.shengqi) + " (เซิงชี่ " + s1.shengqi.cn + ") ช่วยเสริมความรู้สึกกระตือรือร้นและกล้าเริ่มสิ่งใหม่", "ทิศพลังก้าวหน้าของคุณคือ" + dirTh(T.shengqi) + " เหมาะกับการนั่งวางแผนงานหรือประชุมสำคัญ"],
          money: ["ประตูหรือมุมทำงานที่เปิดรับทาง" + dirTh(T.shengqi) + " ตามตำราเชื่อว่าช่วยให้โอกาสใหม่ๆ ไหลเข้ามา", "ลองจัดมุมวางแผนการเงินให้หันไปทาง" + dirTh(T.shengqi) + " แล้วตั้งเป้าเล็กๆ ที่ทำได้จริง"]
        } });
      items.push({ id: "dir.tianyi", group: "ทิศมงคล", label: "ทิศ" + dirTh(T.tianyi) + " (เทียนอี)", short: "ทิศเทียนอี", strength: 0.75, tags: ["advice"],
        meanings: { advice: ["หัวเตียงที่ชี้ไปทาง" + dirTh(T.tianyi) + " (เทียนอี พลังฟื้นฟู) ช่วยให้รู้สึกได้พักผ่อนเต็มที่", "ทิศ" + dirTh(T.tianyi) + "เป็นทิศพลังฟื้นฟูของคุณ เหมาะกับมุมพักผ่อนหรือโต๊ะอาหาร"] } });
      items.push({ id: "dir.yannian", group: "ทิศมงคล", label: "ทิศ" + dirTh(T.yannian) + " (เหยียนเหนียน)", short: "ทิศเหยียนเหนียน", strength: 0.7, tags: ["love", "social"],
        meanings: {
          love: ["ทิศ" + dirTh(T.yannian) + " (เหยียนเหนียน) คือทิศความสัมพันธ์ หัวเตียงคู่หรือมุมนั่งคุยที่หันทางนี้ช่วยให้บรรยากาศอบอุ่น", "ถ้าอยากให้บ้านมีบทสนทนาดีๆ ลองจัดโซฟาหันไปทาง" + dirTh(T.yannian)],
          social: ["มุมรับแขกที่หันไปทาง" + dirTh(T.yannian) + " ตามตำราช่วยเรื่องมิตรภาพและความร่วมมือ", "โต๊ะประชุมที่หันทาง" + dirTh(T.yannian) + " เหมาะกับการคุยตกลงร่วมกัน"]
        } });
      items.push({ id: "dir.fuwei", group: "ทิศมงคล", label: "ทิศ" + dirTh(T.fuwei) + " (ฟูเว่ย)", short: "ทิศฟูเว่ย", strength: 0.6, tags: ["personality", "advice"],
        meanings: {
          personality: ["ทิศ" + dirTh(T.fuwei) + " (ฟูเว่ย) คือทิศพลังมั่นคงของคุณ เหมาะกับช่วงที่อยากทบทวนตัวเอง", "เมื่ออยากมีสมาธิ ลองนั่งหันหน้าไปทาง" + dirTh(T.fuwei)],
          advice: ["มุมอ่านหนังสือหรือนั่งสมาธิที่หันทาง" + dirTh(T.fuwei) + " ช่วยให้ใจนิ่ง", "หัวเตียงทาง" + dirTh(T.fuwei) + " เป็นอีกทางเลือกสำหรับการนอนสงบ"]
        } });
      var low = ["huohai", "wugui", "liusha", "jueming"].map(function (s) { return dirTh(T[s]); });
      items.push({ id: "dir.quiet", group: "ทิศที่ควรจัดให้โปร่ง", label: "ทิศ" + low.slice(0, -1).join(" ") + " และ" + low[low.length - 1], short: "ทิศกลุ่มนี้", strength: 0.4, tags: ["advice"],
        meanings: { advice: ["ทิศ" + low.join(" ") + " เป็นทิศที่ควรจัดให้โปร่งหรือใช้น้อยสำหรับคุณ เหมาะเป็นห้องน้ำ ห้องเก็บของ หรือทางเดิน", "ถ้าโต๊ะหรือเตียงจำเป็นต้องอยู่ทาง" + low[3] + " ไม่ต้องกังวล ใช้ทิศมงคลข้ออื่นช่วย เช่น ปรับมุมหันหน้าเล็กน้อย"] } });
      extras.directions = ["shengqi", "tianyi", "yannian", "fuwei"].map(function (s) { return dirTh(T[s]) + " (" + KB.stars8[s].th + ")"; });
      extras.luckyColors = EL.colors.slice(0, 3).concat(KB.elements[Object.keys(KB.elements).filter(function (k) { return KB.elements[k].generates === I.element; })[0]].colors.slice(0, 1));
    }
    // ทิศที่บันทึกจากเข็มทิศ
    var recLabel = { door: "ประตูหลัก", desk: "โต๊ะทำงาน", bed: "หัวเตียง" }, recVerb = { door: "หันไปทาง", desk: "หันหน้าไปทาง", bed: "หันไปทาง" };
    var recTag = { door: "money", desk: "work", bed: "love" };
    Object.keys(st.recorded || {}).forEach(function (k) {
      var dir = st.recorded[k]; if (!dir) return;
      var s = K ? starOfDir(K.kua, dir) : null, S8 = s ? KB.stars8[s] : null;
      var good = S8 && S8.good, txt;
      if (!S8) txt = recLabel[k] + recVerb[k] + dirTh(dir);
      else if (good) txt = recLabel[k] + recVerb[k] + dirTh(dir) + " ซึ่งตรงกับทิศ" + S8.th + " (" + S8.name + ") ของคุณ เป็นการจัดวางที่ส่งเสริมดี";
      else txt = recLabel[k] + recVerb[k] + dirTh(dir) + " ซึ่งเป็น" + S8.name + "ของคุณ ลองปรับมุมไปทาง" + dirTh(K.stars.shengqi) + "หรือ" + dirTh(K.stars.tianyi) + "ถ้าทำได้ หรือเสริมด้วยแสงและความเป็นระเบียบ";
      var m = {}; m[recTag[k]] = [txt, txt]; m.advice = [txt];
      items.push({ id: "rec." + k + "." + dir, group: "ทิศที่วัดได้", label: recLabel[k] + "ที่" + recVerb[k] + dirTh(dir), short: recLabel[k], evidence: "เข็มทิศ " + (st.recordedDeg && st.recordedDeg[k] != null ? Math.round(st.recordedDeg[k]) + "°" : ""), strength: good ? 0.85 : 0.65, tags: [recTag[k], "advice"], meanings: m });
    });
    // ห้องในผังบ้าน
    (st.rooms || []).forEach(function (r) {
      var A = r.advice, S = A.starInfo, R = KB.rooms[r.room], B = A.bagua;
      var tag = B.tag === "personality" ? "personality" : B.tag;
      var m = {
        timing: [R.th + "อยู่โซน" + dirTh(A.dir) + " ปีนี้ดาว " + A.star + " " + S.th + " ประจำโซน — " + S.theme, "ปีนี้" + R.th + "ได้ดาว " + A.star + " " + S.th + " (" + S.cn + ") " + (S.care ? "ตำราแนะนำให้จัดให้สงบ ลดการรบกวน" : "ถือเป็นโซนที่เสริมได้")],
        advice: [R.th + " (โซน" + dirTh(A.dir) + "): " + S.cure, "สำหรับ" + R.th + " " + S.cure]
      };
      m[tag] = (m[tag] || []).concat(["โซน" + dirTh(A.dir) + "ตามปากั้วคือเรื่อง" + B.area + " " + R.th + "ที่อยู่ตรงนี้ลองเติมสี" + B.colors.map(function (c) { return c[0]; }).join("/") + " หรือ " + B.items]);
      items.push({ id: "room." + r.room + "." + A.dir + ".s" + A.star, group: "ผังบ้าน", label: R.th + "โซน" + dirTh(A.dir) + " (ดาว " + A.star + ")", short: R.th, evidence: "ปากั้ว: " + B.short, strength: Math.min(1, 0.4 + A.priority / 6), tags: ["timing", "advice", tag], meanings: m });
    });
    // ภาพห้อง
    (st.photos || []).forEach(function (ph, i) {
      var txt = ph.advice.map(function (a) { return a.t; }).join(" ");
      items.push({ id: "photo." + i, group: "ภาพห้อง", label: ph.label, evidence: "ความสว่าง " + Math.round(ph.a.brightness * 100) + "% · ความหนาแน่นขอบ " + Math.round(ph.a.edgeDensity * 100) + "%", strength: 0.5, tags: ["advice"], meanings: { advice: [ph.label + ": " + txt] } });
      ph.advice.forEach(function (a) { if (a.k === "dark" || a.k === "busy") extras.tips.push(a.t); });
    });
    extras.tips = extras.tips.concat(KB.tips.general.slice(0, 2));
    return {
      domain: "fengshui", topic: st.topic || "overall", subject: {},
      headline: K ? "เลขกัว " + K.kua + " · " + KB.groups[K.group].th : "ดาวประจำปี " + yc + " " + YS.th,
      items: items, extras: extras
    };
  }

  var FSCore = {
    sunLongitude: sunLongitude, termInstant: termInstant, lichun: lichun, cnDate: cnDate, solarYear: solarYear, toCE: toCE, validDate: validDate,
    kuaRaw: kuaRaw, kuaEffective: kuaEffective, kuaGroup: kuaGroup, kua: kua, starOfDir: starOfDir,
    annualCenter: annualCenter, flyChart: flyChart, monthInfo: monthInfo,
    headingToDir: headingToDir, headingFromEuler: headingFromEuler, angDiff: angDiff, smoothHeading: smoothHeading,
    planSectors: planSectors, sectorAdvice: sectorAdvice, analyzeImage: analyzeImage, photoAdvice: photoAdvice, pixelElement: pixelElement,
    addStat: addStat, buildFacts: buildFacts, DIRS: DIRS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = FSCore;
  root.FSCore = FSCore;
})(typeof window !== "undefined" ? window : globalThis);

/* ===================================================================================== */
/* ================================== ส่วนติดต่อผู้ใช้ ================================== */
/* ===================================================================================== */
if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("fsApp")) (function () {
  "use strict";
  var FS = window.FSCore, KB = window.FS_KB, AI = window.FortuneAI;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var STATS_KEY = "fs-stats", PREF_KEY = "fs-prefs", IDLE_MS = 90000;
  var lsGet = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* โหมดส่วนตัว */ } };
  var prefs = Object.assign({ stats: true }, lsGet(PREF_KEY, {}));
  var TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  /* ---------- i18n: ไทยเป็นค่าเริ่มต้น จีนจาก i18n/zh-fortune-fengshui.js (คีย์ตาม id ใน fengshui-kb.js) ---------- */
  var T = function (k, th, v) { return window.LQI18N ? LQI18N.tf(k, th, v) : String(th).replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  var isZh = function () { return !!(window.LQI18N && LQI18N.lang === "zh"); };
  var dirTh = function (d) { return T("fengshui.dir." + d, KB.dirs[d].th); };
  var zoneTh = function (d) { return isZh() ? T("fengshui.zone." + d, KB.dirs[d].th) : KB.dirs[d].th; };
  var abbrL = function (d) { return T("fengshui.abbr." + d, KB.dirs[d].abbr); };
  var monL = function (m) { return T("fengshui.mon." + m, TH_MONTHS[m - 1]); };
  var s8L = function (s, f) { return T("fengshui.s8." + s + "." + f, KB.stars8[s][f]); };
  var flyL = function (n) { return T("fengshui.fly." + n, KB.flying[n].th); };
  var flyF = function (n, f) { return T("fengshui.fly." + n + "." + f, KB.flying[n][f]); };
  var elL = function (e) { return T("fengshui.el." + e, KB.elements[e].th); };
  var elColors = function (e, n) { return isZh() ? T("fengshui.elc." + e, "").split("/").slice(0, n) : KB.elements[e].colors.slice(0, n); };
  var bgL = function (d, f) { return T("fengshui.bg." + d + "." + f, KB.bagua[d][f]); };
  var bgColor = function (d, i) { return T("fengshui.bgc." + d + "." + i, KB.bagua[d].colors[i][0]); };
  var roomL = function (r) { return T("fengshui.room." + r, KB.rooms[r].th); };
  var iconL = function (r) { return T("fengshui.icon." + r, KB.rooms[r].icon); };
  var grpL = function (g) { return T("fengshui.grp." + g, KB.groups[g].th); };
  var triL = function (k) { return isZh() ? T("fengshui.tri." + k, KB.kuaInfo[k].trigram) : KB.kuaInfo[k].trigram; };
  var brL = function (i) { return T("fengshui.br." + i, KB.branches[i]); };
  var mnL = function (i) { return T("fengshui.mn." + i, KB.monthNames[i]); };
  /** ชื่อดาวแปดคฤหาสน์ + อักษรจีน (ภาษาจีนแสดงครั้งเดียว) */
  var _s8Full = function (s) { return isZh() ? s8L(s, "th") : KB.stars8[s].th + " " + KB.stars8[s].cn; };
  var photoText = function (a, ph) {
    if (!isZh()) return a.t;
    var P = KB.photo;
    if (a.k === "dominant") return T("fengshui.photo.dominant", P.dominant, { el: elL(ph.a.dominant), colors: elColors(ph.a.dominant, 2).join("/") });
    if (a.k === "balance") return T("fengshui.photo.balanceGood", P.balanceGood);
    if (a.k === "balanceTip") return T("fengshui.photo.balanceTip", P.balanceTip, { el: elL(a.el), colors: elColors(a.el, 2).join("/") });
    return T("fengshui.photo." + a.k, a.t);
  };
  var photoLabel = function (p) { return !isZh() || !p.rooms ? p.label : p.rooms.length ? T("fengshui.photo.zone", "", { r: p.rooms.map(roomL).join(" + "), d: p.dir === "C" ? "" : zoneTh(p.dir) }).replace("（区）", "（中宫）") : T("fengshui.photo.label", p.label); };

  var state = {
    kuaSet: null,      // { solar, options:[kua objects], active: index, gender }
    recorded: {}, recordedDeg: {},
    facing: "", cells: [[], [], [], [], [], [], [], [], []], tool: "bed", view: "year",
    photos: [], counted: false, seed: null, lastFacts: null
  };
  var activeKua = function () { return state.kuaSet ? state.kuaSet.options[state.kuaSet.active] : null; };

  function toast(msg) { var t = $("#fsToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("show"); }, 2400); }

  /* ================= 1) เลขกัว ================= */
  function initForm() {
    var dSel = $("#fsDay"), mSel = $("#fsMonth");
    var dv = dSel.value, mv = mSel.value;
    dSel.innerHTML = '<option value="">' + T("fengshui.sel.day", "วัน") + '</option>' + Array.from({ length: 31 }, function (_, i) { return '<option value="' + (i + 1) + '">' + (i + 1) + "</option>"; }).join("");
    mSel.innerHTML = '<option value="">' + T("fengshui.sel.month", "เดือน") + '</option>' + TH_MONTHS.map(function (m, i) { return '<option value="' + (i + 1) + '">' + monL(i + 1) + "</option>"; }).join("");
    dSel.value = dv; mSel.value = mv;
  }
  initForm();
  $("#fsKuaForm").addEventListener("submit", function (e) {
    e.preventDefault(); touch();
    var msg = $("#fsKuaMsg"); msg.textContent = ""; msg.className = "fs-msg";
    var d = +$("#fsDay").value, m = +$("#fsMonth").value, era = $("#fsEra").value, yIn = $("#fsYear").value.trim();
    var y = FS.toCE(yIn, era);
    var g = (document.querySelector('input[name="fsGender"]:checked') || {}).value || "n";
    var err = !d || !m ? T("fengshui.err.date", "เลือกวันและเดือนเกิด") : !isFinite(y) ? T("fengshui.err.year", "กรอกปีเกิด") : (y < 1900 || y > new Date().getFullYear() + 1) ? T("fengshui.err.range", "ปีเกิดอยู่นอกช่วงที่รองรับ (ค.ศ. 1900 ขึ้นไป) — ตรวจว่าเลือก พ.ศ./ค.ศ. ถูกต้อง") : !FS.validDate(y, m, d) ? T("fengshui.err.invalid", "วันที่นี้ไม่มีในปฏิทิน") : "";
    if (err) { msg.textContent = err; msg.classList.add("err"); return; }
    var sol = FS.solarYear(y, m, d);
    var forms = g === "m" ? ["yang"] : g === "f" ? ["yin"] : ["yang", "yin"];
    state.kuaSet = { solar: sol, gender: g, active: 0, ce: y, options: forms.map(function (f) { var k = FS.kua(sol.year, f); k.solarYear = sol.year; return k; }) };
    renderKua();
    if (!state.counted && prefs.stats) { lsSet(STATS_KEY, FS.addStat(lsGet(STATS_KEY, null), activeKua().kua)); state.counted = true; renderStats(); }
    refreshAll();
    $("#fsKuaOut").scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
  function renderKua() {
    var S = state.kuaSet, box = $("#fsKuaOut"); if (!S) { box.hidden = true; return; }
    box.hidden = false;
    var sol = S.solar, L = sol.lichun;
    var note = isZh() ? T("fengshui.kua.note", "", { y: sol.year, be: sol.year + 543, ce: S.ce, m: monL(L.m), d: L.d }) : "คำนวณจากปีสุริยคติจีน " + sol.year + " (พ.ศ. " + (sol.year + 543) + ") · ลี่ชุนปี " + S.ce + " ตรงกับ " + L.d + " " + TH_MONTHS[L.m - 1];
    if (sol.shifted) note += T("fengshui.kua.shifted", " — คุณเกิดก่อนลี่ชุน จึงนับเป็นปีก่อนหน้า");
    if (sol.boundary === "same") note += T("fengshui.kua.same", " — คุณเกิดตรงวันลี่ชุนพอดี ผลขึ้นกับเวลาเกิด (ก่อน/หลังช่วงเปลี่ยนปี) ลองดูทั้งปี {a} และ {b}", { a: sol.year - 1, b: sol.year });
    else if (sol.boundary === "near") note += T("fengshui.kua.near", " — วันเกิดใกล้ลี่ชุน ตำราบางสำนักใช้เวลาเกิดประกอบ");
    var cards = S.options.map(function (k, i) {
      var I = KB.kuaInfo[k.kua], E = KB.elements[I.element];
      var fl = S.options.length > 1 ? '<span class="fs-pill">' + (k.formula === "yang" ? T("fengshui.kua.yang", "สูตรหยาง (ตำราใช้กับเพศชาย)") : T("fengshui.kua.yin", "สูตรหยิน (ตำราใช้กับเพศหญิง)")) + "</span>" : "";
      return '<button type="button" class="fs-kcard' + (i === S.active ? " on" : "") + '" data-i="' + i + '" aria-pressed="' + (i === S.active) + '" style="--el:' + E.color + '">' +
        fl + '<span class="fs-knum">' + k.kua + '</span><span class="fs-kmeta"><b>' + esc(T("fengshui.kua.title", "เลขกัว {k}", { k: k.kua })) + (k.raw === 5 ? " <small>" + esc(T("fengshui.kua.raw5", "(คำนวณได้ 5 ใช้ {k})", { k: k.kua })) + "</small>" : "") + "</b><span>" + esc(grpL(k.group)) + "</span><span>" + esc(T("fengshui.kua.elem", "{t} · ธาตุ{e}", { t: triL(k.kua), e: elL(I.element) })) + "</span></span></button>";
    }).join("");
    var groupTxt = S.options.length > 1
      ? '<p class="fs-small">' + esc(T("fengshui.genderNote", KB.genderNote)) + "</p>" + ["east", "west"].map(function (g) { return '<p class="fs-group"><b>' + esc(grpL(g)) + "</b> " + esc(T("fengshui.grp." + g + ".text", KB.groups[g].text)) + "</p>"; }).join("")
      : '<p class="fs-group">' + esc(T("fengshui.grp." + activeKua().group + ".text", KB.groups[activeKua().group].text)) + "</p>";
    box.innerHTML = '<div class="fs-kcards">' + cards + "</div>" + (S.options.length > 1 ? '<p class="fs-small">' + esc(T("fengshui.kua.tap", "แตะการ์ดเพื่อเลือกชุดทิศที่ใช้ในเข็มทิศและผังบ้าน")) + '</p>' : "") +
      '<p class="fs-note">' + esc(note) + "</p>" + groupTxt + '<div id="fsDirTable"></div>';
    box.querySelectorAll(".fs-kcard").forEach(function (b) { b.addEventListener("click", function () { S.active = +b.dataset.i; renderKua(); refreshAll(); }); });
    renderDirTable();
  }
  function renderDirTable() {
    var k = activeKua(), host = $("#fsDirTable"); if (!k || !host) return;
    var rows = KB.starOrder.map(function (s) {
      var S8 = KB.stars8[s], dir = k.stars[s];
      return '<tr class="' + (S8.good ? "good" : "quiet") + '"><th scope="row"><span class="fs-dot"></span>' + esc(dirTh(dir)) + (isZh() ? "" : ' <small>' + KB.dirs[dir].abbr + "</small>") + "</th><td><b>" + esc(s8L(s, "th")) + "</b>" + (isZh() ? "" : " <span class=\"cn\">" + S8.cn + "</span>") + "<br><small>" + esc(s8L(s, "name")) + "</small></td><td>" + esc(s8L(s, "meaning")) + '</td><td class="uses">' + esc(s8L(s, "uses")) + "</td></tr>";
    }).join("");
    host.innerHTML = '<h3 class="fs-sub">' + esc(T("fengshui.dt.title", "ทิศทั้ง 8 ของเลขกัว {k}", { k: k.kua })) + '</h3><div class="table-wrap"><table class="fs-table"><thead><tr><th scope="col">' + esc(T("fengshui.dt.dir", "ทิศ")) + '</th><th scope="col">' + esc(T("fengshui.dt.star", "ดาว")) + '</th><th scope="col">' + esc(T("fengshui.dt.meaning", "ความหมายตามตำรา")) + '</th><th scope="col">' + esc(T("fengshui.dt.uses", "ใช้กับ")) + '</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<div class="fs-tips3">' + [["desk", "โต๊ะทำงาน"], ["bed", "หัวเตียง"], ["door", "ประตูและหน้าบ้าน"]].map(function (t) { return '<div><h4>' + esc(T("fengshui.tip." + t[0], t[1])) + "</h4><ul>" + KB.tips[t[0]].map(function (x, i) { return "<li>" + esc(T("fengshui.tips." + t[0] + "." + i, x)) + "</li>"; }).join("") + "</ul></div>"; }).join("") + "</div>";
  }

  /* ================= 2) เข็มทิศ AR ================= */
  var video = $("#fsVideo"), arCv = $("#fsAr"), arCtx = arCv.getContext("2d"), arBox = $("#fsArBox");
  var heading = null, rawHeading = null, sensor = false, accuracy = null, rafOn = false, manual = false;
  var slider = $("#fsHeadingSlider");
  function setHeading(h, fromSensor) {
    rawHeading = h; heading = FS.smoothHeading(heading, h, fromSensor ? 0.2 : 1);
    if (fromSensor) { sensor = true; }
    if (!rafOn) { rafOn = true; requestAnimationFrame(drawAR); }
  }
  function onOrient(e) {
    if (manual) return;
    var h = null;
    if (typeof e.webkitCompassHeading === "number" && !isNaN(e.webkitCompassHeading)) { h = e.webkitCompassHeading; accuracy = e.webkitCompassAccuracy; }
    else if (e.alpha != null && (e.absolute || e.type === "deviceorientationabsolute")) {
      var ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      h = FS.headingFromEuler(e.alpha, e.beta || 0, e.gamma || 0, ang);
    }
    if (h == null) return;
    setHeading(h, true);
    $("#fsCalib").hidden = !(accuracy != null && (accuracy < 0 || accuracy > 25));
  }
  async function startCompass() {
    touch();
    var st = $("#fsCompassState");
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        var p = await DeviceOrientationEvent.requestPermission();
        if (p !== "granted") throw new Error("denied");
      }
      if ("ondeviceorientationabsolute" in window) window.addEventListener("deviceorientationabsolute", onOrient);
      else window.addEventListener("deviceorientation", onOrient);
      st.textContent = T("fengshui.cmp.wait", "กำลังรอสัญญาณเข็มทิศ...");
      setTimeout(function () {
        if (!sensor) { st.textContent = T("fengshui.cmp.none", "ไม่พบเข็มทิศในอุปกรณ์นี้ — ใช้แถบเลื่อนตั้งทิศเอง"); showManual(true); }
        else st.textContent = T("fengshui.cmp.ready", "เข็มทิศพร้อม · {c}", { c: T("fengshui.compass.calib", KB.compass.calib) });
      }, 1800);
    } catch (e) { st.textContent = T("fengshui.cmp.denied", "ไม่ได้รับอนุญาตให้ใช้เข็มทิศ — ใช้แถบเลื่อนตั้งทิศเองได้"); showManual(true); }
    startCam();
    if (heading == null) setHeading(+slider.value, false);
  }
  /* กล้องผ่านโมดูลกลาง LQCam: ลำดับสำรองเมื่อกล้องไม่รองรับ, หยุด/เปิดเองเมื่อสลับแอปหรือออกจากหน้า (visibilitychange/pagehide/pageshow)
     และปุ่มสลับ/เลือกกล้องบนภาพ AR (ซ่อนเมื่อมีกล้องตัวเดียว) — ไม่มีกล้องก็ยังใช้เข็มทิศได้ */
  function camNote(msg) { var n = $("#fsCamNote"); n.hidden = !msg; n.textContent = msg || ""; }
  function camErrMsg(e) {
    if (e && e.name === "Insecure") return T("fengshui.cam.insecure", "เปิดกล้องได้เฉพาะ https:// หรือ localhost — เข็มทิศยังใช้ได้โดยไม่มีภาพกล้อง");
    var t = window.LQCam && LQCam.errorText ? LQCam.errorText(e) : "";
    if (isZh() && /[\u0E00-\u0E7F]/.test(t)) t = "";
    return T("fengshui.cam.fail", "เปิดกล้องไม่ได้{t} — เข็มทิศยังใช้ได้โดยไม่มีภาพกล้อง", { t: t ? ": " + t : " (" + ((e && e.name) || "error") + ")" });
  }
  function camLive(on) { arBox.classList.toggle("live", !!on); video.style.transform = on && cam && cam.mirrored ? "scaleX(-1)" : ""; }
  var cam = window.LQCam ? LQCam.create(video, {
    facing: "environment", ideal: { width: 1280, height: 720 }, autoPause: true,
    onChange: function (c, ev) {
      if (ev.type === "started" || ev.type === "resumed") { camLive(true); camNote(""); }
      else if (ev.type === "paused" || ev.type === "stopped" || ev.type === "ended") camLive(false);
    },
    onError: function (c, e) { camLive(false); camNote(camErrMsg(e)); }
  }) : null;
  if (cam) { var camUi = document.createElement("div"); camUi.className = "fs-cam-ui"; arBox.appendChild(camUi); cam.attach(camUi); }
  async function startCam() {
    if (!cam) { camNote(camErrMsg({ name: "Insecure" })); return; }
    if (cam.active) return;
    try { await cam.start(); }
    catch (e) { if (e.name === "AbortError" && /superseded/.test(e.message)) return; camLive(false); camNote(camErrMsg(e)); }
  }
  function _stopCam() { if (cam) cam.stop(); camLive(false); }
  function showManual(on) { $("#fsManual").hidden = !on; manual = on && !sensor ? true : manual; }
  $("#fsCompassStart").addEventListener("click", startCompass);
  $("#fsManualToggle").addEventListener("click", function () { manual = !manual; this.setAttribute("aria-pressed", manual); $("#fsManual").hidden = !manual && sensor; if (manual) setHeading(+slider.value, false); });
  slider.addEventListener("input", function () { manual = true; heading = null; setHeading(+slider.value, false); });

  function dirColor(dir) {
    var k = activeKua(); if (!k) return { fill: "rgba(34,211,238,.25)", stroke: "#22d3ee", label: "" };
    var s = FS.starOfDir(k.kua, dir), g = KB.stars8[s].good;
    return g ? { fill: "rgba(34,197,94,.30)", stroke: "#4ade80", label: s8L(s, "th"), good: true } : { fill: "rgba(245,158,11,.22)", stroke: "#fbbf24", label: T("fengshui.ar.low", "ใช้น้อย"), good: false };
  }
  function resizeAR() {
    var r = arBox.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(200, Math.round(r.width * dpr)), h = Math.max(200, Math.round(r.height * dpr));
    if (arCv.width !== w || arCv.height !== h) { arCv.width = w; arCv.height = h; }
    return dpr;
  }
  function drawAR() {
    rafOn = false;
    var dpr = resizeAR(), W = arCv.width, H = arCv.height, c = arCtx;
    c.clearRect(0, 0, W, H);
    if (heading == null) return;
    var h = heading, F = "Prompt, system-ui, sans-serif", FOV = 60, px = W / FOV;
    // แถบทิศด้านบน
    var tapeY = 18 * dpr, tapeH = 64 * dpr;
    c.fillStyle = "rgba(14,20,48,.55)"; c.fillRect(0, tapeY, W, tapeH);
    for (var a = -40; a <= 40; a += 5) {
      var deg = Math.round(h + a); var x = W / 2 + (deg - h) * px;
      var dd = ((deg % 360) + 360) % 360;
      if (dd % 5) continue;
      c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = dpr;
      c.beginPath(); c.moveTo(x, tapeY + tapeH); c.lineTo(x, tapeY + tapeH - (dd % 45 === 0 ? 16 : dd % 15 === 0 ? 10 : 5) * dpr); c.stroke();
    }
    FS.DIRS.forEach(function (d) {
      var rel = FS.angDiff(KB.dirs[d].deg, h); if (Math.abs(rel) > FOV / 2 + 15) return;
      var x = W / 2 + rel * px, col = dirColor(d);
      // แถบสีโซน ±22.5°
      c.fillStyle = col.fill; c.fillRect(x - 22.5 * px, tapeY + tapeH, 45 * px, 8 * dpr);
      c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
      c.font = "600 " + 18 * dpr + "px " + F; c.fillText(abbrL(d), x, tapeY + 20 * dpr);
      c.font = "400 " + 12 * dpr + "px " + F; c.fillStyle = col.stroke;
      c.fillText((col.label ? col.label + " · " : "") + bgL(d, "short"), x, tapeY + 42 * dpr);
    });
    // เส้นกลาง
    c.strokeStyle = "#facc15"; c.lineWidth = 3 * dpr; c.beginPath(); c.moveTo(W / 2, tapeY - 6 * dpr); c.lineTo(W / 2, tapeY + tapeH + 14 * dpr); c.stroke();
    // เข็มทิศวงกลม
    var R = Math.min(W, H) * 0.26, cx = W / 2, cy = H - R - 20 * dpr;
    c.save(); c.translate(cx, cy);
    c.beginPath(); c.arc(0, 0, R + 6 * dpr, 0, Math.PI * 2); c.fillStyle = "rgba(14,20,48,.6)"; c.fill();
    c.rotate(-h * Math.PI / 180);
    FS.DIRS.forEach(function (d) {
      var col = dirColor(d), a0 = (KB.dirs[d].deg - 22.5 - 90) * Math.PI / 180, a1 = (KB.dirs[d].deg + 22.5 - 90) * Math.PI / 180;
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, a0, a1); c.closePath(); c.fillStyle = col.fill; c.fill(); c.strokeStyle = "rgba(255,255,255,.25)"; c.lineWidth = dpr; c.stroke();
      var am = (KB.dirs[d].deg - 90) * Math.PI / 180;
      c.save(); c.translate(Math.cos(am) * R * 0.7, Math.sin(am) * R * 0.7); c.rotate(h * Math.PI / 180);
      c.fillStyle = d === "N" ? "#f87171" : "#fff"; c.textAlign = "center"; c.textBaseline = "middle";
      c.font = "600 " + Math.max(11, R * 0.13) + "px " + F; c.fillText(abbrL(d), 0, 0);
      c.restore();
    });
    c.restore();
    c.fillStyle = "#facc15"; c.beginPath(); c.moveTo(cx, cy - R - 12 * dpr); c.lineTo(cx - 8 * dpr, cy - R + 4 * dpr); c.lineTo(cx + 8 * dpr, cy - R + 4 * dpr); c.closePath(); c.fill();
    // ข้อความสถานะ
    var d0 = FS.headingToDir(h), k = activeKua();
    $("#fsHeadingNum").textContent = Math.round(h) + "°";
    $("#fsHeadingDir").textContent = dirTh(d0);
    var s0 = k ? KB.stars8[FS.starOfDir(k.kua, d0)] : null;
    var s0k = k ? FS.starOfDir(k.kua, d0) : null;
    $("#fsHeadingInfo").innerHTML = (s0 ? '<span class="fs-tag ' + (s0.good ? "good" : "quiet") + '">' + esc(s8L(s0k, "th") + " · " + s8L(s0k, "name")) + "</span> " : '<span class="fs-tag">' + esc(T("fengshui.ar.needKua", "คำนวณเลขกัวก่อนเพื่อดูทิศมงคลส่วนตัว")) + '</span> ') + '<span class="fs-tag">' + esc(T("fengshui.ar.bagua", "ปากั้ว: {a}", { a: bgL(d0, "area") })) + "</span>";
    if (!manual) slider.value = Math.round(h);
    if (sensor && !manual && Math.abs(FS.angDiff(rawHeading, heading)) > 0.5) { rafOn = true; requestAnimationFrame(drawAR); }
  }
  window.addEventListener("resize", function () { if (!rafOn && heading != null) { rafOn = true; requestAnimationFrame(drawAR); } });
  document.querySelectorAll("[data-rec]").forEach(function (b) {
    b.addEventListener("click", function () {
      touch();
      if (heading == null) { toast(T("fengshui.toast.needHeading", "กด เริ่มเข็มทิศ ก่อน หรือใช้แถบเลื่อน")); return; }
      var k = b.dataset.rec, dir = FS.headingToDir(heading);
      state.recorded[k] = dir; state.recordedDeg[k] = heading;
      if (k === "door") { state.facing = dir; $("#fsFacing").value = dir; }
      toast(isZh() ? T("fengshui.toast.rec", "", { w: T("fengshui.rec.what." + k, ""), d: dirTh(dir), deg: Math.round(heading) }) : "บันทึก" + b.textContent.replace("บันทึก", "") + ": " + dirTh(dir) + " (" + Math.round(heading) + "°)");
      refreshAll();
    });
  });
  function renderRecorded() {
    var k = activeKua(), lab = { door: T("fengshui.rec.door", "ประตูหลัก (หันออก)"), desk: T("fengshui.rec.desk", "โต๊ะ (ทิศที่หันหน้า)"), bed: T("fengshui.rec.bed", "หัวเตียง") };
    var rows = Object.keys(lab).filter(function (x) { return state.recorded[x]; }).map(function (x) {
      var dir = state.recorded[x], sk = k ? FS.starOfDir(k.kua, dir) : null, s = sk ? KB.stars8[sk] : null;
      return '<li class="' + (s ? (s.good ? "good" : "quiet") : "") + '"><b>' + esc(lab[x]) + "</b><span>" + esc(dirTh(dir)) + " · " + Math.round(state.recordedDeg[x] || KB.dirs[dir].deg) + "°</span>" +
        (s ? "<small>" + esc(s8L(sk, "th") + " — " + (s.good ? s8L(sk, "name") : T("fengshui.rec.move", "ลองขยับมุมไปทาง{a} หรือ {b} ถ้าทำได้", { a: dirTh(k.stars.shengqi), b: dirTh(k.stars.tianyi) }))) + "</small>" : "") + "</li>";
    });
    $("#fsRecList").innerHTML = rows.length ? rows.join("") : '<li class="muted">' + esc(T("fengshui.rec.none", "ยังไม่ได้บันทึกทิศ")) + '</li>';
  }
  function renderCompassText() {
    $("#fsHelpDoor").textContent = T("fengshui.compass.door", KB.compass.door); $("#fsHelpDesk").textContent = T("fengshui.compass.desk", KB.compass.desk); $("#fsHelpBed").textContent = T("fengshui.compass.bed", KB.compass.bed);
    $("#fsCalib").textContent = T("fengshui.compass.calib", KB.compass.calib); $("#fsManualHint").textContent = T("fengshui.compass.desktop", KB.compass.desktop);
    if (heading == null) { $("#fsHeadingDir").textContent = T("fengshui.ar.notStarted", "ยังไม่เริ่ม"); $("#fsHeadingInfo").innerHTML = '<span class="fs-tag">' + esc(T("fengshui.ar.startHint", "กด เริ่มเข็มทิศ แล้วหันโทรศัพท์ไปรอบๆ")) + "</span>"; }
  }
  renderCompassText();

  /* ================= 3) ผังบ้าน ================= */
  var facingSel = $("#fsFacing");
  function renderPlanControls() {
    var fv = facingSel.value;
    facingSel.innerHTML = '<option value="">' + esc(T("fengshui.facing.ph", "เลือกทิศหน้าบ้าน")) + '</option>' + FS.DIRS.map(function (d) { return '<option value="' + d + '">' + esc(dirTh(d)) + "</option>"; }).join("");
    facingSel.value = fv;
    $("#fsTools").innerHTML = KB.roomOrder.map(function (r) { return '<button type="button" class="fs-tool" data-room="' + r + '" aria-pressed="' + (r === state.tool) + '">' + esc(roomL(r)) + "</button>"; }).join("") + '<button type="button" class="fs-tool" data-room="erase" aria-pressed="' + (state.tool === "erase") + '">' + esc(T("fengshui.tool.erase", "ลบห้อง")) + '</button>';
  }
  renderPlanControls();
  facingSel.addEventListener("change", function () { state.facing = this.value; if (this.value) { state.recorded.door = this.value; state.recordedDeg.door = KB.dirs[this.value].deg; } refreshAll(); });
  $("#fsTools").addEventListener("click", function (e) {
    var b = e.target.closest(".fs-tool"); if (!b) return;
    state.tool = b.dataset.room;
    this.querySelectorAll(".fs-tool").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
  });
  document.querySelectorAll('input[name="fsView"]').forEach(function (r) { r.addEventListener("change", function () { state.view = this.value; renderPlan(); }); });
  function charts() {
    var now = new Date(), mi = FS.monthInfo(now.getFullYear(), now.getMonth() + 1, now.getDate());
    return { mi: mi, year: FS.flyChart(mi.yearCenter), month: FS.flyChart(mi.center) };
  }
  function renderPlan() {
    var grid = $("#fsGrid"), ch = charts(), k = activeKua();
    $("#fsYearInfo").innerHTML = isZh() ? esc(T("fengshui.plan.year", "", { y: ch.mi.solarYear, b: brL(ch.mi.branch), yc: ch.mi.yearCenter, ys: flyL(ch.mi.yearCenter), m: mnL(ch.mi.k), mc: ch.mi.center, ms: flyL(ch.mi.center) })) : "ปีฮวงจุ้ย <b>" + ch.mi.solarYear + "</b> (ปี" + KB.branches[ch.mi.branch] + ") ดาวกลางปี <b>" + ch.mi.yearCenter + " " + KB.flying[ch.mi.yearCenter].th + "</b> · เดือน" + KB.monthNames[ch.mi.k] + " ดาวกลางเดือน <b>" + ch.mi.center + " " + KB.flying[ch.mi.center].th + "</b>";
    if (!state.facing) { grid.innerHTML = '<p class="fs-empty">' + esc(T("fengshui.plan.empty", "เลือกทิศหน้าบ้าน หรือบันทึกทิศประตูหลักด้วยเข็มทิศ แล้วผัง 9 ช่องจะปรากฏ")) + '</p>'; grid.classList.add("empty"); $("#fsAdvice").innerHTML = ""; renderPhotoTargets(); return; }
    grid.classList.remove("empty");
    var secs = FS.planSectors(state.facing), chart = state.view === "month" ? ch.month : ch.year;
    grid.innerHTML = secs.map(function (d, i) {
      var star = chart[d], S = KB.flying[star], B = KB.bagua[d], rooms = state.cells[i];
      var pk = k && d !== "C" ? FS.starOfDir(k.kua, d) : null, personal = pk ? KB.stars8[pk] : null;
      var aria = isZh() ? T("fengshui.cell.aria", "", { d: dirTh(d), n: star, s: flyL(star), b: bgL(d, "short") }) + (rooms.length ? T("fengshui.cell.rooms", "", { r: rooms.map(roomL).join("、") }) : "")
        : dirTh(d) + " ดาว " + star + " " + S.th + " ปากั้ว " + B.short + (rooms.length ? " ห้อง: " + rooms.map(function (r) { return KB.rooms[r].th; }).join(", ") : "");
      return '<button type="button" class="fs-cell ' + (S.care ? (S.care >= 3 ? "high" : "mid") : "ok") + (i === 7 ? " front" : "") + '" data-i="' + i + '" aria-label="' + esc(aria) + '">' +
        '<span class="c-dir">' + esc(abbrL(d)) + '</span><span class="c-star">' + star + '</span><span class="c-name">' + esc(flyL(star)) + '</span><span class="c-bg">' + esc(bgL(d, "short")) + "</span>" +
        (personal ? '<span class="c-p ' + (personal.good ? "good" : "quiet") + '">' + esc(s8L(pk, "th")) + "</span>" : "") +
        '<span class="c-rooms">' + rooms.map(function (r) { return "<i>" + esc(iconL(r)) + "</i>"; }).join("") + "</span></button>";
    }).join("");
    renderAdvice(secs, chart);
    renderPhotoTargets();
  }
  $("#fsGrid").addEventListener("click", function (e) {
    var b = e.target.closest(".fs-cell"); if (!b) return; touch();
    var i = +b.dataset.i, list = state.cells[i];
    if (state.tool === "erase") state.cells[i] = [];
    else {
      var at = list.indexOf(state.tool);
      if (at >= 0) list.splice(at, 1); else {
        if (state.tool === "door") state.cells.forEach(function (l) { var j = l.indexOf("door"); if (j >= 0) l.splice(j, 1); });
        list.push(state.tool);
      }
    }
    renderPlan(); refreshNarrativeHint();
    var nb = document.querySelector('.fs-cell[data-i="' + i + '"]'); if (nb) nb.focus();
  });
  function adviceList(secs, chart) {
    var k = activeKua(), marked = [];
    secs.forEach(function (d, i) { if (state.cells[i].length) marked.push(FS.sectorAdvice(d, chart[d], state.cells[i], k && k.kua)); });
    var all = marked.length ? marked : secs.map(function (d) { return FS.sectorAdvice(d, chart[d], [], k && k.kua); });
    return { list: all.sort(function (a, b) { return b.priority - a.priority; }), marked: !!marked.length };
  }
  function renderAdvice(secs, chart) {
    var r = adviceList(secs, chart), k = activeKua();
    var zh = isZh();
    $("#fsAdvice").innerHTML = '<h3 class="fs-sub">' + esc(r.marked ? T("fengshui.adv.marked", "ลำดับสิ่งที่ควรดูแลในห้องที่ทำเครื่องหมาย") : T("fengshui.adv.all", "ภาพรวมทุกโซน (แตะช่องเพื่อทำเครื่องหมายห้อง)")) + "</h3><ol class=\"fs-adv\">" + r.list.map(function (a) {
      var S = a.starInfo, E = KB.elements[a.cureElement];
      var per = a.personal ? KB.stars8[a.personal] : null;
      // ข้อความแนะนำรายโซน (sectorAdvice) สร้างใหม่ตามภาษาจากข้อมูลเดียวกัน
      var lines = !zh ? a.lines : [S.care ? T("fengshui.line.calm", "", { c: flyF(a.star, "cure") }) : T("fengshui.line.boost", "", { c: flyF(a.star, "cure") })]
        .concat(a.rooms.filter(function (x) { return S.care && (x === "bath" || x === "kitchen"); }).map(function (x) { return T("fengshui.rsn." + x, KB.roomStarNote[x]); }))
        .concat(a.rooms.indexOf("bath") >= 0 && !S.care ? [T("fengshui.line.bathGood", "")] : []);
      var zone = zh ? (a.dir === "C" ? zoneTh("C") : T("fengshui.adv.zone", "", { d: zoneTh(a.dir) })) : "โซน" + dirTh(a.dir);
      return '<li class="' + a.level + '"><div class="a-h"><span class="a-star">' + a.star + "</span><b>" + esc((a.rooms.length ? a.rooms.map(roomL).join(" + ") + " · " : "") + zone) + '</b><span class="a-lv">' + esc(a.level === "high" ? T("fengshui.adv.high", "ควรจัดให้สงบ (สำคัญ)") : a.level === "mid" ? T("fengshui.adv.mid", "ควรจัดให้สงบ") : T("fengshui.adv.good", "เสริมได้")) + "</span></div>" +
        '<p class="a-theme">' + (zh ? esc(T("fengshui.adv.theme", "", { n: a.star + " " + flyL(a.star), e: elL(S.element), t: flyF(a.star, "theme") })) : 'ดาว ' + a.star + " " + S.th + " (" + S.cn + ", ธาตุ" + KB.elements[S.element].th + "): " + esc(S.theme)) + "</p>" +
        "<ul>" + lines.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") +
        "<li>" + esc(T("fengshui.adv.bagua", "ปากั้ว: {a} — สี ", { a: bgL(a.dir, "area") })) + a.bagua.colors.map(function (c, ci) { return '<i class="sw" style="background:' + c[1] + '"></i>' + esc(bgColor(a.dir, ci)); }).join(" ") + " · " + esc(bgL(a.dir, "items")) + "</li>" +
        '<li>' + esc(T("fengshui.adv.cure", "ธาตุที่ช่วยปรับ: ")) + '<i class="sw" style="background:' + E.color + '"></i>' + esc(elL(a.cureElement)) + " — " + esc(T("fengshui.eli." + a.cureElement, E.items)) + esc(T("fengshui.adv.mat", " (วัสดุ: {m})", { m: T("fengshui.elm." + a.cureElement, E.materials) })) + "</li>" +
        (per ? "<li>" + esc(zh ? T("fengshui.adv.personal", "", { k: k.kua, s: s8L(a.personal, "th"), n: s8L(a.personal, "name") }) : "สำหรับเลขกัว " + k.kua + ": โซนนี้เป็นทิศ" + per.th + " (" + per.name + ")") + "</li>" : "") + "</ul></li>";
    }).join("") + "</ol>";
  }

  /* ---------- ภาพห้อง ---------- */
  function renderPhotoTargets() {
    var sel = $("#fsPhotoFor"), secs = state.facing ? FS.planSectors(state.facing) : null, opts = ['<option value="">' + esc(T("fengshui.photo.overall", "ภาพรวม (ไม่ระบุโซน)")) + '</option>'];
    if (secs) secs.forEach(function (d, i) { if (state.cells[i].length) opts.push('<option value="' + i + '">' + esc(state.cells[i].map(roomL).join(" + ") + " · " + dirTh(d)) + "</option>"); });
    var v = sel.value; sel.innerHTML = opts.join(""); if (Array.prototype.some.call(sel.options, function (o) { return o.value === v; })) sel.value = v;
  }
  $("#fsPhoto").addEventListener("change", async function () {
    var f = this.files && this.files[0]; this.value = ""; if (!f) return; touch();
    try {
      var bmp = await loadImg(f), S = 160, sc = Math.min(1, S / Math.max(bmp.width, bmp.height));
      var w = Math.max(8, Math.round(bmp.width * sc)), h = Math.max(8, Math.round(bmp.height * sc));
      var cv = document.createElement("canvas"); cv.width = w; cv.height = h; var c = cv.getContext("2d", { willReadFrequently: true });
      c.drawImage(bmp, 0, 0, w, h);
      var a = FS.analyzeImage(c.getImageData(0, 0, w, h));
      var idx = $("#fsPhotoFor").value, star = null, label = "ภาพห้อง", proom = [], pdir = null;
      if (idx !== "" && state.facing) {
        var d = FS.planSectors(state.facing)[+idx], ch = charts();
        star = ch.year[d]; label = state.cells[+idx].map(function (r) { return KB.rooms[r].th; }).join(" + ") + " (โซน" + KB.dirs[d].th + ")";
        proom = state.cells[+idx].slice(); pdir = d;
      }
      var adv = FS.photoAdvice(a, star);
      state.photos = state.photos.filter(function (p) { return p.idx !== idx; }).concat([{ idx: idx, label: label, a: a, advice: adv, rooms: proom, dir: pdir }]);
      var thumb = cv.toDataURL("image/jpeg", 0.7);
      state.lastThumb = thumb;
      renderPhotos(thumb);
      if (bmp.close) bmp.close();
    } catch (e) { console.error(e); toast(T("fengshui.toast.photoFail", "อ่านรูปไม่สำเร็จ")); }
  });
  function loadImg(f) {
    if (window.createImageBitmap) return createImageBitmap(f).catch(function () { return viaImg(f); });
    return viaImg(f);
  }
  function viaImg(f) { return new Promise(function (res, rej) { var u = URL.createObjectURL(f), im = new Image(); im.onload = function () { URL.revokeObjectURL(u); res(im); }; im.onerror = rej; im.src = u; }); }
  function renderPhotos(lastThumb) {
    var box = $("#fsPhotoOut");
    box.innerHTML = state.photos.map(function (p, i) {
      var bars = KB.elementOrder.map(function (e) { var E = KB.elements[e], pc = Math.round(p.a.shares[e] * 100); return '<div class="elbar"><span>' + esc(elL(e)) + '</span><i style="--w:' + pc + "%;--c:" + E.color + '"></i><b>' + pc + "%</b></div>"; }).join("");
      return '<article class="fs-ph">' + (i === state.photos.length - 1 && lastThumb ? '<img src="' + lastThumb + '" alt="' + esc(T("fengshui.photo.alt", "ภาพห้องที่อัปโหลด (ย่อ)")) + '">' : "") + "<div><h4>" + esc(photoLabel(p)) + '</h4><p class="fs-small">' + esc(T("fengshui.photo.stats", "ความสว่างเฉลี่ย {b}% · ความหนาแน่นขอบ (ตัวแทนความรก) {e}%", { b: Math.round(p.a.brightness * 100), e: Math.round(p.a.edgeDensity * 100) })) + "</p>" + bars +
        "<ul>" + p.advice.map(function (a) { return "<li>" + esc(photoText(a, p)) + "</li>"; }).join("") + "</ul></div></article>";
    }).join("") + (state.photos.length ? '<p class="fs-small">' + esc(T("fengshui.photo.note", KB.photo.note)) + "</p>" : "");
  }

  /* ================= 4) คำทำนาย (fortune-ai) ================= */
  function collect() {
    var k = activeKua(), ch = charts(), rooms = [];
    if (state.facing) {
      var secs = FS.planSectors(state.facing);
      secs.forEach(function (d, i) { state.cells[i].forEach(function (r) { rooms.push({ room: r, advice: FS.sectorAdvice(d, ch.year[d], [r], k && k.kua) }); }); });
    }
    return { kua: k, recorded: state.recorded, recordedDeg: state.recordedDeg, rooms: rooms, photos: state.photos, topic: $("#fsTopic").value, now: new Date() };
  }
  function refreshNarrativeHint() {
    var st = collect(), n = st.rooms.length;
    $("#fsReadHint").textContent = (st.kua ? T("fengshui.hint.kua", "เลขกัว {k}", { k: st.kua.kua }) : T("fengshui.hint.noKua", "ยังไม่ได้คำนวณเลขกัว")) + T("fengshui.hint.rest", " · ทิศที่บันทึก {r} · ห้องในผัง {n} · ภาพห้อง {p}", { r: Object.keys(st.recorded).length, n: n, p: st.photos.length });
  }
  async function readFortune(again) {
    touch();
    AI = AI || window.FortuneAI; // fortune-ai.js loads after this file: look it up when reading (plan + reminder + language)
    var btn = $("#fsReadBtn"), out = $("#fsReading"), facts = FS.buildFacts(collect());
    state.lastFacts = facts;
    btn.disabled = true; $("#fsAgain").disabled = true;
    out.setAttribute("aria-busy", "true");
    var consent = $("#fsConsent").checked, res;
    try {
      if (AI && typeof AI.interpret === "function") res = await AI.interpret(facts, { useAI: consent, seed: again ? undefined : undefined });
      else res = { source: "local", sections: [{ id: "overview", title: T("fengshui.overview", "ภาพรวม"), paragraphs: facts.items.map(function (it) { var m = it.meanings, k0 = Object.keys(m)[0]; return m[k0][0]; }) }] };
    } catch (e) { console.error(e); res = { source: "local", sections: [], note: T("fengshui.readFail", "เรียบเรียงไม่สำเร็จ") }; }
    renderReading(res, facts);
    btn.disabled = false; $("#fsAgain").disabled = false; $("#fsAgain").hidden = false;
    out.removeAttribute("aria-busy");
    $("#fsShareRow").hidden = false;
    if (!again) $("#fsReadTitle").focus();
  }
  function renderReading(res, facts) {
    var host = $("#fsSections"), used = false;
    AI = AI || window.FortuneAI;
    $("#fsReading").hidden = false;
    var badge = $("#fsSource");
    badge.textContent = res.source === "ai" ? T("fengshui.src.ai", "เรียบเรียงโดยผู้ช่วยเขียนคำทำนาย (Claude โดย Anthropic) จากผลคำนวณเท่านั้น") : T("fengshui.src.local", "เรียบเรียงในเครื่อง ไม่ส่งข้อมูลออก");
    badge.className = "fs-badge " + (res.source === "ai" ? "ai" : "local");
    if (AI && typeof AI.renderSections === "function") {
      try { host.innerHTML = ""; var r = AI.renderSections(host, res, { domain: "fengshui" }); if (typeof r === "string") host.innerHTML = r; else if (r && r.nodeType && r !== host) host.append(r); /* renderSections fills host itself and returns it */ used = host.childNodes.length > 0; } catch (e) { used = false; }
    }
    if (!used) {
      host.innerHTML = (res.sections || []).map(function (s) {
        return '<article class="fs-sec"><h3>' + esc(s.title || "") + "</h3>" + (s.paragraphs || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</article>";
      }).join("") + (res.note ? '<p class="fs-small">' + esc(res.note) + "</p>" : "");
    }
    var ex = isZh() ? extrasZh(facts) : (facts.extras || {});
    $("#fsExtras").innerHTML = (ex.luckyColors && ex.luckyColors.length ? "<div><h4>" + esc(T("fengshui.ex.colors", "สีมงคล")) + "</h4><p>" + ex.luckyColors.map(esc).join(" · ") + "</p></div>" : "") +
      (ex.directions && ex.directions.length ? "<div><h4>" + esc(T("fengshui.ex.dirs", "ทิศมงคล")) + "</h4><p>" + ex.directions.map(esc).join(" · ") + "</p></div>" : "") +
      (ex.tips && ex.tips.length ? "<div><h4>" + esc(T("fengshui.ex.tips", "เคล็ดลับ")) + "</h4><ul>" + ex.tips.slice(0, 4).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" : "");
  }
  /** extras ภาษาจีน: สร้างจากข้อมูลเดียวกับ buildFacts (สีของธาตุเลขกัว + ธาตุที่ให้กำเนิด, ทิศมงคล 4 ทิศ, เคล็ดลับจากภาพและทั่วไป) */
  function extrasZh(facts) {
    var k = activeKua(), out = { luckyColors: [], directions: [], tips: [] };
    if (k) {
      var el = KB.kuaInfo[k.kua].element, gen = Object.keys(KB.elements).filter(function (e) { return KB.elements[e].generates === el; })[0];
      out.luckyColors = elColors(el, 3).concat(elColors(gen, 1));
      out.directions = ["shengqi", "tianyi", "yannian", "fuwei"].map(function (s) { return dirTh(k.stars[s]) + "（" + s8L(s, "th") + "）"; });
    }
    state.photos.forEach(function (ph) { ph.advice.forEach(function (a) { if (a.k === "dark" || a.k === "busy") out.tips.push(photoText(a, ph)); }); });
    out.tips = out.tips.concat(KB.tips.general.slice(0, 2).map(function (t, i) { return T("fengshui.tips.general." + i, t); }));
    return out;
  }
  $("#fsReadBtn").addEventListener("click", function () { readFortune(false); });
  $("#fsAgain").addEventListener("click", function () { readFortune(true); });
  (function aiStatus() {
    var lab = $("#fsConsentWrap");
    if (!AI || typeof AI.status !== "function") { lab.hidden = true; return; }
    AI.status().then(function (s) { lab.hidden = !(s && s.enabled); }).catch(function () { lab.hidden = true; });
  })();

  /* ---------- การ์ดแชร์ 1080×1350 ---------- */
  function wrapTh(c, text, maxW) {
    var segs = (typeof Intl !== "undefined" && Intl.Segmenter) ? Array.from(new Intl.Segmenter("th", { granularity: "word" }).segment(text), function (s) { return s.segment; }) : text.split("");
    var lines = [], cur = "";
    segs.forEach(function (sg) { if (c.measureText(cur + sg).width > maxW && cur) { lines.push(cur.trim()); cur = sg.trimStart(); } else cur += sg; });
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
  async function makeCard() {
    try { await Promise.all([document.fonts.load("700 60px Prompt"), document.fonts.load("500 30px Prompt"), document.fonts.load("400 30px Prompt")]); } catch (e) { /* ใช้ฟอนต์ระบบ */ }
    var k = activeKua(), ch = charts();
    var W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d"), F = "Prompt, system-ui, sans-serif";
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0e1430"); g.addColorStop(1, "#1e2a5a"); c.fillStyle = g; c.fillRect(0, 0, W, H);
    var elc = k ? KB.elements[KB.kuaInfo[k.kua].element].color : "#674ff2";
    var rg = c.createRadialGradient(W / 2, 400, 30, W / 2, 400, 520); rg.addColorStop(0, elc + "88"); rg.addColorStop(1, "rgba(14,20,48,0)"); c.fillStyle = rg; c.fillRect(0, 0, W, H);
    c.textBaseline = "middle"; c.textAlign = "left";
    c.font = "700 40px " + F; c.fillStyle = "#fff"; c.fillText("LENS", 72, 92); var lw = c.measureText("LENS").width; c.fillStyle = "#a99bff"; c.fillText("IQ", 72 + lw, 92);
    c.textAlign = "right"; c.font = "500 34px " + F; c.fillStyle = "#c9d0ea"; c.fillText(T("fengshui.card.brand", "ฮวงจุ้ย"), W - 72, 92);
    // วงทิศ 8 ทิศ
    var cx = W / 2, cy = 400, R = 230;
    FS.DIRS.forEach(function (d) {
      var good = k ? KB.stars8[FS.starOfDir(k.kua, d)].good : true;
      var a0 = (KB.dirs[d].deg - 22.5 - 90) * Math.PI / 180, a1 = (KB.dirs[d].deg + 22.5 - 90) * Math.PI / 180;
      c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a0, a1); c.closePath();
      c.fillStyle = good ? "rgba(74,222,128,.32)" : "rgba(251,191,36,.16)"; c.fill(); c.strokeStyle = "rgba(255,255,255,.25)"; c.lineWidth = 2; c.stroke();
      var am = (KB.dirs[d].deg - 90) * Math.PI / 180;
      c.textAlign = "center"; c.fillStyle = d === "N" ? "#fca5a5" : "#fff"; c.font = "600 30px " + F;
      c.fillText(abbrL(d), cx + Math.cos(am) * R * 0.78, cy + Math.sin(am) * R * 0.78);
    });
    c.beginPath(); c.arc(cx, cy, 110, 0, Math.PI * 2); c.fillStyle = "#0e1430"; c.fill(); c.strokeStyle = elc; c.lineWidth = 8; c.stroke();
    c.fillStyle = "#fff"; c.textAlign = "center"; c.font = "700 120px " + F; c.fillText(k ? String(k.kua) : String(ch.mi.yearCenter), cx, cy + 6);
    c.font = "400 26px " + F; c.fillStyle = "#c9d0ea"; c.fillText(k ? T("fengshui.card.kua", "เลขกัว") : T("fengshui.card.yc", "ดาวกลางปี"), cx, cy + 82);
    var y = 700;
    c.font = "700 64px " + F; c.fillStyle = "#fff";
    c.fillText(k ? (isZh() ? grpL(k.group) : KB.groups[k.group].th.replace(/ \(.+\)/, "")) : T("fengshui.card.chart", "ผังดาวปี {y}", { y: ch.mi.solarYear }), W / 2, y); y += 80;
    if (k) {
      var TS = k.stars;
      [["shengqi", T("fengshui.card.work", "การงาน")], ["tianyi", T("fengshui.card.rest", "พักผ่อน")], ["yannian", T("fengshui.card.rel", "ความสัมพันธ์")], ["fuwei", T("fengshui.card.focus", "สมาธิ")]].forEach(function (p, i) {
        var col = i % 2, row = Math.floor(i / 2), bx = 120 + col * 430, by = y + row * 104;
        c.fillStyle = "rgba(255,255,255,.08)"; rr(c, bx, by, 410, 88, 26); c.fill();
        c.textAlign = "left"; c.fillStyle = "#4ade80"; c.font = "600 28px " + F; c.fillText(dirTh(TS[p[0]]), bx + 26, by + 28);
        c.fillStyle = "#c9d0ea"; c.font = "400 24px " + F; c.fillText(p[1] + " · " + s8L(p[0], "th"), bx + 26, by + 60);
      });
      y += 250;
    } else y += 40;
    c.textAlign = "center"; c.font = "500 32px " + F; c.fillStyle = "#facc15";
    var five = Object.keys(ch.year).filter(function (p) { return ch.year[p] === 5; })[0];
    wrapTh(c, isZh() ? T("fengshui.card.year", "", { y: ch.mi.solarYear, n: ch.mi.yearCenter, s: flyL(ch.mi.yearCenter), d: zoneTh(five) }) : "ปี " + ch.mi.solarYear + ": ดาว " + ch.mi.yearCenter + " " + KB.flying[ch.mi.yearCenter].th + " กลางบ้าน · โซน" + dirTh(five) + "ควรจัดให้สงบ", W - 160).slice(0, 2).forEach(function (l, i) { c.fillText(l, W / 2, y + i * 44); });
    y += 130;
    if (k) {
      c.font = "400 30px " + F; c.fillStyle = "#c9d0ea"; c.fillText(T("fengshui.card.colors", "สีมงคล: {c}", { c: elColors(KB.kuaInfo[k.kua].element, 3).join(" · ") }), W / 2, y);
    }
    c.font = "400 24px " + F; c.fillStyle = "#8f9bc4";
    wrapTh(c, T("fengshui.card.foot", "{d} · คำนวณในเครื่อง ไม่บันทึกวันเกิด", { d: T("fengshui.disclaimerShort", KB.disclaimerShort) }), W - 160).forEach(function (l, i) { c.fillText(l, W / 2, 1290 + i * 30); });
    return cv;
  }
  var cardUrl = null;
  $("#fsShare").addEventListener("click", async function () {
    touch(); var b = this; b.disabled = true;
    try {
      var cv = await makeCard(), blob = await new Promise(function (r) { cv.toBlob(r, "image/png"); });
      if (cardUrl) URL.revokeObjectURL(cardUrl);
      cardUrl = URL.createObjectURL(blob);
      var im = $("#fsCardImg"); im.src = cardUrl; im.hidden = false;
      var file = new File([blob], "lensiq-fengshui.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: T("fengshui.share.title", "ฮวงจุ้ย — LENSIQ"), text: T("fengshui.disclaimerShort", KB.disclaimerShort) }); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
      var a = document.createElement("a"); a.href = cardUrl; a.download = "lensiq-fengshui.png"; document.body.append(a); a.click(); a.remove();
      toast(T("fengshui.toast.saved", "บันทึกการ์ดแล้ว"));
    } catch (e) { console.error(e); toast(T("fengshui.toast.fail", "สร้างการ์ดไม่สำเร็จ")); }
    finally { b.disabled = false; }
  });

  /* ---------- สถิติ ---------- */
  function renderStats() {
    var st = lsGet(STATS_KEY, null), box = $("#fsStats");
    if (!st || !st.total) { box.innerHTML = '<p class="muted">' + esc(T("fengshui.stats.none", "ยังไม่มีการใช้งานในเครื่องนี้")) + '</p>'; return; }
    var d = new Date(), today = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    box.innerHTML = '<p class="stat-n"><b>' + st.total + "</b> " + esc(T("fengshui.stats.total", "ครั้ง")) + " <small>" + esc(T("fengshui.stats.today", "(วันนี้ {n})", { n: st.days && st.days[today] || 0 })) + "</small></p>" +
      [1, 2, 3, 4, 6, 7, 8, 9].map(function (n) { var v = (st.kua && st.kua[n]) || 0; return '<div class="elbar"><span>' + esc(T("fengshui.stats.kua", "กัว {n}", { n: n })) + '</span><i style="--w:' + Math.round(v / st.total * 100) + "%;--c:" + (KB.groups[[1, 3, 4, 9].indexOf(n) >= 0 ? "east" : "west"] && ([1, 3, 4, 9].indexOf(n) >= 0 ? "#2f9e5b" : "#8a94a6")) + '"></i><b>' + v + "</b></div>"; }).join("");
  }
  $("#fsStatsOn").checked = !!prefs.stats;
  $("#fsStatsOn").addEventListener("change", function () { prefs.stats = this.checked; lsSet(PREF_KEY, prefs); });
  $("#fsStatsClear").addEventListener("click", function () { if (confirm(T("fengshui.confirmClear", "ล้างสถิติในเครื่องนี้?"))) { try { localStorage.removeItem(STATS_KEY); } catch (e) { /* ไม่เป็นไร */ } renderStats(); } });

  /* ---------- โหมดบูธ ---------- */
  var idleT = null, idleTick = null, wasFs = false;
  var isKiosk = function () { return document.body.classList.contains("fs-kiosk"); };
  function touch() {
    clearTimeout(idleT); clearInterval(idleTick);
    var el = $("#fsIdle"); el.hidden = true;
    if (!isKiosk()) return;
    var until = Date.now() + IDLE_MS;
    idleTick = setInterval(function () { var left = Math.ceil((until - Date.now()) / 1000); if (left <= 15) { el.hidden = false; el.textContent = T("fengshui.idle", "เริ่มใหม่สำหรับคนถัดไปใน {n} วินาที — แตะเพื่ออยู่ต่อ", { n: left }); } }, 1000);
    idleT = setTimeout(function () { clearInterval(idleTick); el.hidden = true; resetAll(); }, IDLE_MS);
  }
  ["pointerdown", "keydown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { if (isKiosk()) touch(); }, { passive: true }); });
  function setKiosk(on) {
    document.body.classList.toggle("fs-kiosk", on);
    $("#fsKiosk").setAttribute("aria-pressed", on ? "true" : "false");
    $("#fsKioskExit").hidden = !on;
    if (on) { var de = document.documentElement; if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().then(function () { wasFs = true; }).catch(function () {}); }
    else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    touch();
  }
  $("#fsKiosk").addEventListener("click", function () { setKiosk(!isKiosk()); });
  $("#fsKioskExit").addEventListener("click", function () { setKiosk(false); });
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && wasFs) { wasFs = false; setKiosk(false); } });
  function resetAll() {
    state.kuaSet = null; state.recorded = {}; state.recordedDeg = {}; state.facing = ""; state.cells = [[], [], [], [], [], [], [], [], []]; state.photos = []; state.counted = false;
    $("#fsKuaForm").reset(); $("#fsKuaOut").hidden = true; $("#fsFacing").value = ""; $("#fsReading").hidden = true; $("#fsShareRow").hidden = true; $("#fsAgain").hidden = true;
    $("#fsCardImg").hidden = true; if (cardUrl) { URL.revokeObjectURL(cardUrl); cardUrl = null; }
    $("#fsPhotoOut").innerHTML = ""; state.lastThumb = null;
    refreshAll(); window.scrollTo({ top: 0 });
  }
  $("#fsReset").addEventListener("click", resetAll);

  function refreshAll() {
    renderDirTable(); renderRecorded(); renderPlan(); refreshNarrativeHint();
    if (heading != null && !rafOn) { rafOn = true; requestAnimationFrame(drawAR); }
  }

  // แหล่งอ้างอิง/ข้อความจาก KB
  function renderKbText() {
    $("#fsSources").innerHTML = KB.sources.map(function (s, i) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(T("fengshui.srcl." + i, s.label)) + "</a></li>"; }).join("");
    $("#fsSourcesNote").textContent = T("fengshui.sourcesNote", KB.sourcesNote);
    $("#fsLichunNote").textContent = T("fengshui.lichunNote", KB.lichunNote);
    $("#fsPeriodNote").textContent = T("fengshui.period", KB.period.text) + " · " + T("fengshui.baguaNote", KB.baguaNote);
    $("#fsElNote").textContent = T("fengshui.elementsNote", KB.elementsNote);
    $("#fsThaiTips").innerHTML = KB.tips.thai.map(function (t, i) { return "<li>" + esc(T("fengshui.tips.thai." + i, t)) + "</li>"; }).join("");
  }
  renderKbText();
  renderStats(); refreshAll();
  // สลับภาษา: เรนเดอร์ข้อความไดนามิกใหม่ และเรียบเรียงคำทำนายใหม่จาก facts ชุดเดิม (fortune-ai เลือกภาษาเอง)
  window.addEventListener("lq-lang", function () {
    initForm(); renderPlanControls(); renderCompassText(); renderKbText(); renderStats();
    if (state.kuaSet) renderKua();
    refreshAll();
    if (state.photos.length) renderPhotos(state.lastThumb);
    if (!$("#fsReading").hidden && state.lastFacts) readFortune(true);
  });
  window.__fs = { state: state, makeCard: makeCard, setHeading: function (h) { manual = true; heading = null; setHeading(h, false); }, buildFacts: function () { return FS.buildFacts(collect()); } }; // ใช้ทดสอบ
})();
