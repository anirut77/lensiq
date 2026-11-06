/* ราศีตะวันตก (Big Three: อาทิตย์ · จันทร์ · ลัคนา) — LENSIQ
   ส่วนบน: ฟังก์ชันล้วน — ทดสอบใน Node
     ดวงอาทิตย์: HSCore.sunLongitude (Meeus บทที่ 25, ~0.01°)
     ดวงจันทร์: Meeus บทที่ 47 ตัดเหลือพจน์หลัก 34 พจน์ + นิวเทชันอย่างง่าย (ความคลาดเคลื่อน ~0.02° ≈ 2–3 นาทีของเวลา)
     ลัคนา: HSCore.ascendant (เวลาดาราคติกรีนิช Meeus บทที่ 12 + สูตรลัคนามาตรฐาน)
   ส่วนล่าง: UI ในเบราว์เซอร์ (ทำงานเมื่อพบ #asApp) — วัน เวลา และสถานที่เกิดคำนวณในเครื่อง ไม่ส่งและไม่บันทึก
   เพื่อความบันเทิงตามความเชื่อ ไม่ใช่การพยากรณ์ทางวิทยาศาสตร์ */
(function (root) {
  "use strict";
  var KB = root.ASTRO_KB || (typeof require === "function" ? require("./astro-kb.js") : null);
  var HS = root.HSCore || (typeof require === "function" ? require("./horoscope.js") : null);
  var FK = root.FortuneKit || (typeof require === "function" ? require("./fortune-kit.js") : null);
  var D2R = Math.PI / 180, sin = function (d) { return Math.sin(d * D2R); };
  var norm360 = function (x) { x %= 360; return x < 0 ? x + 360 : x; };
  var mod = function (a, n) { return ((a % n) + n) % n; };

  // Meeus ตาราง 47.A: [D, M, M', F, Σl (หน่วย 1e-6 องศา)]
  var MOON_TERMS = [
    [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618], [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332],
    [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066], [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
    [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528], [0, 0, 1, -2, 10980], [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034],
    [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888], [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
    [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665], [0, 1, -2, 0, -2689], [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390],
    [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236], [0, 1, 2, 0, -2120], [0, 2, 0, 0, -2069]
  ];
  /** ลองจิจูดปรากฏของดวงจันทร์ (องศา, สายนะ) จาก JDE (TT) */
  function moonLongitude(jde) {
    var T = (jde - 2451545) / 36525, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    var Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
    var D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
    var M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
    var Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
    var F = 93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
    var E = 1 - 0.002516 * T - 0.0000074 * T2;
    var A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.29 * T;
    var sl = 0;
    MOON_TERMS.forEach(function (t) { var e = Math.abs(t[1]) === 1 ? E : Math.abs(t[1]) === 2 ? E * E : 1; sl += t[4] * e * sin(t[0] * D + t[1] * M + t[2] * Mp + t[3] * F); });
    sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
    var Om = 125.04452 - 1934.136261 * T;
    return norm360(Lp + sl / 1e6 - 0.00478 * sin(Om));
  }
  var ttFromUT = function (jd) { return jd + HS.deltaT(2000 + (jd - 2451545) / 365.25) / 86400; };
  var signOf = function (lon) { return Math.floor(norm360(lon) / 30); };
  var pos = function (lon) { return { lon: lon, sign: signOf(lon), deg: lon % 30 }; };
  function sunAt(jdUT) { return pos(HS.sunLongitude(ttFromUT(jdUT))); }
  function moonAt(jdUT) { return pos(moonLongitude(ttFromUT(jdUT))); }
  /** inp: {y,m,d (ค.ศ.), time:{h,mi}|null, tz (ชม.), lat, lon} */
  function chart(inp) {
    var tz = inp.tz == null ? 7 : inp.tz, t = inp.time, h = t ? t.h + t.mi / 60 : 12;
    var jd = HS.julianDay(inp.y, inp.m, inp.d, h) - tz / 24;
    var sun = sunAt(jd), moon = moonAt(jd), asc = null, notes = [];
    if (t && inp.lat != null && inp.lon != null && Math.abs(inp.lat) < 66) asc = pos(HS.ascendant(jd, inp.lat, inp.lon));
    var moonAlt = null, sunAlt = null;
    if (!t) {
      var j0 = HS.julianDay(inp.y, inp.m, inp.d, 0) - tz / 24, j1 = j0 + 1439 / 1440;
      var m0 = moonAt(j0).sign, m1 = moonAt(j1).sign, s0 = sunAt(j0).sign, s1 = sunAt(j1).sign;
      if (m0 !== m1) { moonAlt = [m0, m1]; notes.push("moon"); }
      if (s0 !== s1) { sunAlt = [s0, s1]; notes.push("sun"); }
    }
    var w = { fire: 0, earth: 0, air: 0, water: 0 }, md = { cardinal: 0, fixed: 0, mutable: 0 };
    [[sun, 3], [moon, 2], [asc, 2]].forEach(function (x) { if (!x[0]) return; var S = KB.SIGNS[x[0].sign]; w[S.el] += x[1]; md[S.mode] += x[1]; });
    var dom = Object.keys(w).sort(function (a, b) { return w[b] - w[a]; })[0];
    var domMode = Object.keys(md).sort(function (a, b) { return md[b] - md[a]; })[0];
    return { input: inp, jd: jd, sun: sun, moon: moon, asc: asc, moonAlt: moonAlt, sunAlt: sunAlt, notes: notes, elements: w, modes: md, dominant: dom, dominantMode: domMode };
  }
  /** ราศีอาทิตย์จากวันที่อย่างเดียว (เที่ยงวัน เวลาไทย) */
  function sunSignOf(y, m, d, tz) { return chart({ y: y, m: m, d: d, time: { h: 12, mi: 0 }, tz: tz == null ? 7 : tz }).sun.sign; }
  /** ดวงจันทร์วันนี้ เทียบราศีอาทิตย์ → เรือน 0..11 */
  function daily(sunSign, now) {
    now = now || new Date();
    var jd = now.getTime() / 86400000 + 2440587.5, moon = moonAt(jd);
    return { moon: moon, house: mod(moon.sign - sunSign, 12) };
  }
  var signName = function (i) { return "ราศี" + KB.SIGNS[i].th; };

  /* ---------- facts ---------- */
  function buildFacts(C, topic) {
    var S = KB.SIGNS[C.sun.sign], M = KB.SIGNS[C.moon.sign], items = [];
    items.push({ id: "sun." + C.sun.sign, group: "ราศีอาทิตย์ (ตัวตน)", label: "ดวงอาทิตย์ใน" + signName(C.sun.sign) + " (" + S.en + ")", short: "ราศีอาทิตย์", evidence: S.kw.join(" "),
      strength: 0.96, tags: ["personality", "work", "money", "love", "social", "advice"], meanings: { personality: S.p.slice(), work: S.w.slice(), money: S.m.slice(), love: S.l.slice(), social: S.s.slice(), advice: [S.a] } });
    var mm = { personality: [M.moon[0]], love: [M.moon[1]], advice: [M.a] };
    items.push({ id: "moon." + C.moon.sign, group: "ราศีจันทร์ (อารมณ์)", label: "ดวงจันทร์ใน" + signName(C.moon.sign) + " (" + M.en + ")", short: "ราศีจันทร์", evidence: C.moonAlt ? "ดวงจันทร์ย้ายราศีในวันเกิด" : "",
      strength: C.moonAlt ? 0.72 : 0.88, tags: Object.keys(mm), meanings: mm });
    if (C.asc) {
      var A = KB.SIGNS[C.asc.sign], am = { social: A.rise.slice(), personality: [A.rise[0]] };
      items.push({ id: "asc." + C.asc.sign, group: "ราศีลัคนา (ภาพลักษณ์)", label: "ลัคนาใน" + signName(C.asc.sign) + " (" + A.en + ")", short: "ลัคนา", strength: 0.84, tags: Object.keys(am), meanings: am });
    }
    var E = KB.ELEMENTS[C.dominant], md = KB.MODES[C.dominantMode];
    items.push({ id: "el." + C.dominant, group: "ธาตุเด่น", label: E.th + "เด่นในดวง", short: E.th, evidence: E.kw, strength: 0.7, tags: ["overview", "advice"], meanings: { overview: E.o.slice(), advice: [E.a] } });
    items.push({ id: "mode." + C.dominantMode, group: "คุณภาพของราศี", label: md.th, short: md.th.split(" ")[0], strength: 0.6, tags: ["personality"], meanings: { personality: [md.o] } });
    if (C.sun.sign === C.moon.sign) items.push({ id: "same.sun.moon", group: "จุดเด่น", label: "อาทิตย์และจันทร์อยู่ราศีเดียวกัน", short: "อาทิตย์กับจันทร์", strength: 0.75, tags: ["overview"], meanings: { overview: ["ดวงอาทิตย์และดวงจันทร์อยู่ราศีเดียวกัน ความคิดกับความรู้สึกของคุณจึงไปในทางเดียวกันอย่างชัดเจน"] } });
    return { domain: "astro", topic: topic || "overall", subject: {}, headline: "อาทิตย์" + S.th + " · จันทร์" + M.th + (C.asc ? " · ลัคนา" + KB.SIGNS[C.asc.sign].th : ""), items: items };
  }
  function dailyFacts(sunSign, D, topic) {
    var H = KB.HOUSES[D.house], S = KB.SIGNS[sunSign], Mo = KB.SIGNS[D.moon.sign];
    return {
      domain: "astro", topic: topic || "overall", subject: {}, headline: "ดวงจันทร์วันนี้ใน" + signName(D.moon.sign),
      items: [
        { id: "day.house." + D.house, group: "ดวงวันนี้", label: "ดวงจันทร์ผ่าน" + H.th + " ของชาว" + signName(sunSign), short: "ดวงจันทร์วันนี้", strength: 0.95, tags: ["overview", "advice", "timing"], meanings: { overview: [H.o], advice: [H.a], timing: ["อารมณ์ของวันนี้ได้กลิ่นอายของ" + signName(D.moon.sign) + " คือ" + Mo.kw.join(" ") ] } },
        { id: "day.sun." + sunSign, group: "ราศีของคุณ", label: "ชาว" + signName(sunSign), short: signName(sunSign), strength: 0.7, tags: ["work", "love", "money"], meanings: { work: [S.w[0]], love: [S.l[0]], money: [S.m[0]] } }
      ]
    };
  }

  var AS = { moonLongitude: moonLongitude, sunAt: sunAt, moonAt: moonAt, chart: chart, sunSignOf: sunSignOf, daily: daily, signOf: signOf, signName: signName, buildFacts: buildFacts, dailyFacts: dailyFacts, ttFromUT: ttFromUT, MOON_TERMS: MOON_TERMS };
  if (typeof module !== "undefined" && module.exports) module.exports = AS;
  root.Astro = AS;
})(typeof window !== "undefined" ? window : globalThis);

/* ================================ UI ================================ */
if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("asApp")) (function () {
  "use strict";
  var AS = window.Astro, KB = window.ASTRO_KB, FK = window.FortuneKit, HS = window.HSCore, HSKB = window.HSKB, $ = FK.$, esc = FK.esc;
  var st = { chart: null, sign: null };
  var EL_COL = { fire: "#e8590c", earth: "#8d6e3f", air: "#1c7ed6", water: "#5f3dc4" };
  var g = function (i) { return KB.SIGNS[i].gl + "︎"; };

  var tabs = [["tabChart", "panelChart"], ["tabSigns", "panelSigns"]];
  function selectTab(id, focus) {
    tabs.forEach(function (t) { var b = document.getElementById(t[0]), on = t[0] === id; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; document.getElementById(t[1]).hidden = !on; if (on && focus) b.focus(); });
  }
  tabs.forEach(function (t, i) {
    var b = document.getElementById(t[0]);
    b.addEventListener("click", function () { selectTab(t[0]); });
    b.addEventListener("keydown", function (e) { var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) { e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length][0], true); } });
  });

  $("#asDay").innerHTML = '<option value="">วันที่</option>' + Array.from({ length: 31 }, function (_, i) { return "<option>" + (i + 1) + "</option>"; }).join("");
  $("#asMonth").innerHTML = '<option value="">เดือน</option>' + HSKB.months.map(function (m, i) { return '<option value="' + (i + 1) + '">' + m + "</option>"; }).join("");
  $("#asProv").innerHTML = HSKB.provinces.map(function (p, i) { return '<option value="' + i + '">' + esc(p[0]) + "</option>"; }).join("") + '<option value="custom">กำหนดละติจูด/ลองจิจูดเอง</option>';
  $("#asProv").addEventListener("change", function () { $("#asLatLon").hidden = this.value !== "custom"; });
  $("#asNoTime").addEventListener("change", function () { $("#asTime").disabled = this.checked; if (this.checked) $("#asTime").value = ""; });

  var stats = FK.statsPanel({
    box: "asStats", toggle: "asStatsOn", clear: "asStatsClear", key: "as-stats", prefKey: "as-prefs",
    render: function (s) { var nm = function (k) { return KB.SIGNS[k] ? KB.SIGNS[k].th : k; }; return '<p class="fk-small">ราศีอาทิตย์</p>' + FK.bars(s.sun, s.total, nm, 5) + '<p class="fk-small">ราศีจันทร์</p>' + FK.bars(s.moon, s.total, nm, 3); }
  });

  function wheel(C) {
    var cx = 160, cy = 160, R = 150, r = 112, out = [];
    // วงราศี: เมษเริ่มทางซ้าย (มุม 180°) ทวนเข็มนาฬิกาตามธรรมเนียมแผนภูมิ
    var pt = function (lon, rad) { var a = (180 - lon) * Math.PI / 180; return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)]; };
    for (var i = 0; i < 12; i++) {
      var a0 = pt(i * 30, R), a1 = pt(i * 30, r), mid = pt(i * 30 + 15, (R + r) / 2), S = KB.SIGNS[i];
      out.push('<line x1="' + a0[0].toFixed(1) + '" y1="' + a0[1].toFixed(1) + '" x2="' + a1[0].toFixed(1) + '" y2="' + a1[1].toFixed(1) + '" stroke="#c9d0ea"/>');
      out.push('<text x="' + mid[0].toFixed(1) + '" y="' + mid[1].toFixed(1) + '" text-anchor="middle" dominant-baseline="central" font-size="17" fill="' + EL_COL[S.el] + '">' + g(i) + "</text>");
    }
    out.unshift('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="#fff" stroke="#b9c1dd"/><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#f5f7fc" stroke="#b9c1dd"/>');
    var mark = function (p, sym, col, rad, lbl) {
      if (!p) return;
      var q = pt(p.lon, rad), e = pt(p.lon, r);
      out.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + e[0].toFixed(1) + '" y2="' + e[1].toFixed(1) + '" stroke="' + col + '" stroke-width="1.5" opacity=".5"/>');
      out.push('<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="15" fill="' + col + '"/><text x="' + q[0].toFixed(1) + '" y="' + q[1].toFixed(1) + '" text-anchor="middle" dominant-baseline="central" font-size="' + (lbl ? 13 : 16) + '" fill="#fff" font-weight="600">' + sym + "</text>");
    };
    mark(C.sun, "☉︎", "#e8590c", 88); mark(C.moon, "☽︎", "#5f3dc4", 62); mark(C.asc, "ASC", "#0891b2", 38, true);
    return '<svg class="as-wheel" viewBox="0 0 320 320" role="img" aria-label="แผนภูมิราศี: อาทิตย์' + esc(KB.SIGNS[C.sun.sign].th) + " จันทร์" + esc(KB.SIGNS[C.moon.sign].th) + (C.asc ? " ลัคนา" + esc(KB.SIGNS[C.asc.sign].th) : "") + '">' + out.join("") + "</svg>";
  }
  function bigCard(role, p, sub, alt) {
    if (!p) return '<div class="as-big muted"><p class="as-role">' + role + '</p><p class="as-gl">?</p><p>ระบุเวลาและสถานที่เกิดเพื่อคำนวณลัคนา</p></div>';
    var S = KB.SIGNS[p.sign];
    return '<div class="as-big" style="--c:' + EL_COL[S.el] + '"><p class="as-role">' + role + '</p><p class="as-gl" aria-hidden="true">' + g(p.sign) + "</p><h3>ราศี" + esc(S.th) + ' <small lang="en">' + S.en + "</small></h3><p class=\"fk-small\">" + Math.floor(p.deg) + "° · " + esc(KB.ELEMENTS[S.el].th) + "</p>" + (alt ? '<p class="as-alt">' + alt + "</p>" : "") + '<p class="as-sub">' + esc(sub) + "</p></div>";
  }
  function readInput() {
    var d = +$("#asDay").value, m = +$("#asMonth").value, raw = $("#asYear").value.trim();
    var era = document.querySelector('input[name="asEra"]:checked').value, y = HS.toCE(+raw, era), err = HS.validateDate(y, m, d);
    if (err) return { err: err };
    var tm = /^(\d{1,2}):(\d{2})/.exec($("#asTime").value || ""), time = !$("#asNoTime").checked && tm ? { h: +tm[1], mi: +tm[2] } : null;
    var lat, lon, pv = $("#asProv").value;
    if (pv === "custom") { lat = parseFloat($("#asLat").value); lon = parseFloat($("#asLon").value); if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 66 || Math.abs(lon) > 180) return { err: "ละติจูด/ลองจิจูดไม่ถูกต้อง (ละติจูดไม่เกิน ±66°)" }; }
    else { var P = HSKB.provinces[+pv]; lat = P[1]; lon = P[2]; }
    return { y: y, m: m, d: d, time: time, tz: +$("#asTz").value, lat: lat, lon: lon };
  }
  $("#asForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var inp = readInput(); $("#asMsg").textContent = inp.err || "";
    if (inp.err) return;
    showChart(AS.chart(inp));
  });
  function showChart(C) {
    st.chart = C;
    var alt = function (a) { return a ? "วันนั้นดวงจันทร์ย้ายจากราศี" + KB.SIGNS[a[0]].th + "ไปราศี" + KB.SIGNS[a[1]].th + " ระบุเวลาเกิดเพื่อความแม่นยำ" : ""; };
    $("#asResult").hidden = false;
    $("#asWheel").innerHTML = wheel(C);
    $("#asBig").innerHTML = bigCard("☉ ราศีอาทิตย์ · ตัวตน", C.sun, KB.SIGNS[C.sun.sign].kw.join(" · "), C.sunAlt ? "วันนั้นดวงอาทิตย์ย้ายราศีพอดี ระบุเวลาเกิดเพื่อความแม่นยำ" : "") +
      bigCard("☽ ราศีจันทร์ · อารมณ์", C.moon, KB.SIGNS[C.moon.sign].moon[0], alt(C.moonAlt)) +
      bigCard("ASC ลัคนา · ภาพลักษณ์", C.asc, C.asc ? KB.SIGNS[C.asc.sign].rise[0] : "");
    var tot = 0; Object.keys(C.elements).forEach(function (k) { tot += C.elements[k]; });
    $("#asBal").innerHTML = '<h3>สมดุลธาตุ</h3>' + Object.keys(C.elements).map(function (k) { return '<div class="elbar"><span>' + esc(KB.ELEMENTS[k].th) + '</span><i style="--w:' + Math.round(C.elements[k] / tot * 100) + "%;--c:" + EL_COL[k] + '"></i><b>' + C.elements[k] + "</b></div>"; }).join("") +
      '<p class="fk-small">ธาตุเด่น: <b>' + esc(KB.ELEMENTS[C.dominant].th) + "</b> · " + esc(KB.MODES[C.dominantMode].th) + " (น้ำหนัก อาทิตย์ 3 · จันทร์ 2 · ลัคนา 2)</p>";
    $("#asReadWrap").innerHTML = FK.readingBlock("asRd", "คำทำนายตามแผนภูมิเกิด", true);
    FK.bindReading("asRd", "astro", function (topic) { return AS.buildFacts(C, topic); }, { withTopics: true });
    renderDaily(C.sun.sign, "#asDaily", "asDayRd");
    stats.add({ sun: C.sun.sign, moon: C.moon.sign, asc: C.asc ? C.asc.sign : null });
    $("#asResTitle").focus(); kiosk.touch();
  }
  function renderDaily(sign, sel, rid) {
    var D = AS.daily(sign), H = KB.HOUSES[D.house];
    $(sel).innerHTML = '<div class="fk-block"><h3>ดวงวันนี้ของชาวราศี' + esc(KB.SIGNS[sign].th) + '</h3><p>ดวงจันทร์วันนี้อยู่ราศี<b>' + esc(KB.SIGNS[D.moon.sign].th) + "</b> " + g(D.moon.sign) + " — ผ่าน<b>" + esc(H.th) + "</b> นับจากราศีของคุณ</p><p>" + esc(H.o) + '</p><p class="fk-small">ดวงจันทร์ย้ายราศีทุก 2–3 วัน คำทำนายรายวันจึงเปลี่ยนตาม</p></div>' + FK.readingBlock(rid, "คำทำนายวันนี้", true);
    FK.bindReading(rid, "astro", function (topic) { return AS.dailyFacts(sign, D, topic); }, { withTopics: true });
  }
  function reset() { $("#asResult").hidden = true; $("#asCardImg").hidden = true; $("#asForm").reset(); $("#asTime").disabled = false; $("#asLatLon").hidden = true; st.chart = null; }
  $("#asAgain").addEventListener("click", function () { reset(); $("#asForm").scrollIntoView({ block: "start" }); });
  $("#asPrint").addEventListener("click", function () { window.print(); });
  $("#asShare").addEventListener("click", function () {
    var C = st.chart; if (!C) return;
    var lines = (FK.readings.asRd || {}).lines || [], trio = [["☉", C.sun], ["☽", C.moon], ["ASC", C.asc]].filter(function (x) { return x[1]; });
    FK.share(this, {
      kind: "ราศีตะวันตก", glow: "rgba(34,211,238,.32)", artH: 360,
      title: trio.map(function (x) { return KB.SIGNS[x[1].sign].th; }).join(" · "), sub: "อาทิตย์ · จันทร์" + (C.asc ? " · ลัคนา" : ""),
      msgs: (lines.length >= 2 ? lines.slice(0, 2) : [KB.SIGNS[C.sun.sign].p[0], KB.SIGNS[C.moon.sign].moon[0]]).concat(["ธาตุเด่น: " + KB.ELEMENTS[C.dominant].th + " — " + KB.ELEMENTS[C.dominant].kw]),
      foot: KB.disclaimerShort + " · ราศีแบบสายนะ (Tropical)",
      art: function (c, x, y, w, h) {
        var n = trio.length, cw = 220, gap = 30, x0 = x + (w - (n * cw + (n - 1) * gap)) / 2;
        trio.forEach(function (t, i) {
          var S = KB.SIGNS[t[1].sign], xx = x0 + i * (cw + gap);
          FK.rr(c, xx, y + 20, cw, h - 40, 28); c.fillStyle = "rgba(255,255,255,.09)"; c.fill();
          c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#a5f3fc"; c.font = "600 34px Prompt, sans-serif"; c.fillText(t[0], xx + cw / 2, y + 70);
          c.fillStyle = "#fff"; c.font = "120px 'Segoe UI Symbol','Apple Symbols','Noto Sans Symbols',serif"; c.fillText(S.gl + "︎", xx + cw / 2, y + 180);
          c.font = "600 40px Prompt, sans-serif"; c.fillStyle = "#f3c969"; c.fillText(S.th, xx + cw / 2, y + 290);
        });
      }
    }, "lensiq-astro.jpg", $("#asCardImg"), "ราศีตะวันตก — LENSIQ");
  });

  /* ราศีทั้ง 12 (เลือกราศีอาทิตย์เร็ว ๆ) */
  $("#asSignGrid").innerHTML = KB.SIGNS.map(function (S, i) { return '<button type="button" class="as-sign" data-i="' + i + '" style="--c:' + EL_COL[S.el] + '"><span class="as-gl" aria-hidden="true">' + g(i) + "</span><b>" + esc(S.th) + "</b><small>" + esc(S.dates) + "</small></button>"; }).join("");
  $("#asSignGrid").addEventListener("click", function (e) {
    var b = e.target.closest(".as-sign"); if (!b) return;
    var i = +b.dataset.i, S = KB.SIGNS[i];
    document.querySelectorAll(".as-sign").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
    $("#asSignRes").hidden = false;
    $("#asSignRes").innerHTML = '<div class="fk-block"><h2 tabindex="-1" id="asSignTitle">' + g(i) + " ราศี" + esc(S.th) + ' <small lang="en">' + S.en + '</small></h2><p class="fk-small">' + esc(S.dates) + " · " + esc(KB.ELEMENTS[S.el].th) + " · " + esc(KB.MODES[S.mode].th) + " · ดาวเจ้าเรือน" + esc(S.ruler) + '</p><ul class="fk-chips">' + S.kw.map(function (k) { return "<li>" + esc(k) + "</li>"; }).join("") + "</ul><p>" + esc(S.p[0]) + "</p></div><div id=\"asSignDaily\"></div>";
    renderDaily(i, "#asSignDaily", "asSignDayRd");
    stats.add({ sun: i, quick: 1 });
    $("#asSignTitle").focus();
  });

  var kiosk = FK.kiosk({ toggle: "asKiosk", exit: "asKioskExit", idle: "asIdle", busy: function () { return !$("#asResult").hidden || !$("#asSignRes").hidden; }, reset: function () { reset(); $("#asSignRes").hidden = true; selectTab("tabChart"); } });
  $("#asSources").innerHTML = KB.sources.map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + "</a></li>"; }).join("");
  if (location.hash === "#signs") selectTab("tabSigns");
  window.__as = { state: st, showChart: showChart };
})();
