/* lifecal-ui.js — หน้า bazi.html · taksa.html · lek7.html · lifegraph.html (ใช้ร่วมกัน เลือกตาม data-page)
   คำนวณด้วย lifecal.js คำอ่านจาก lifecal-kb.js + fortune-ai.js · ภาษาจีนจาก i18n/zh-fortune-lifecal.js และ i18n/zh-kb-lifecal.js
   ไม่บันทึกวันเกิด · เพื่อความบันเทิงตามความเชื่อ */
if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("lcApp")) (function () {
  "use strict";
  var LC = window.LifeCal, KB = window.LIFECAL_KB, FK = window.FortuneKit, HS = window.HSCore, $ = FK.$, esc = FK.esc;
  var app = $("#lcApp"), page = app.getAttribute("data-page");
  var T = function (k, th, v) { return window.LQI18N ? window.LQI18N.tf(k, th, v) : String(th).replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  var isZh = function () { return !!(window.LQI18N && window.LQI18N.lang === "zh"); };
  var isEn = function () { return !!(window.LQI18N && window.LQI18N.lang === "en"); };
  // ปี: ไทย = พ.ศ., อังกฤษ/จีน = ค.ศ.
  var yearOut = function (y) { return isZh() || isEn() ? y : y + 543; };
  var months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  var st = { b: null, res: null, msg: null };
  var EL_COL = ["#2f9e44", "#e8590c", "#b08900", "#868e96", "#1c7ed6"];
  var EL_ZH = "木火土金水";
  var EL_EN = ["Wood", "Fire", "Earth", "Metal", "Water"];
  var elName = function (e) { return isZh() ? EL_ZH[e] : isEn() ? EL_EN[e] : KB.EL[e].th; };
  var planetName = function (p) { return T("lc.planet." + p, KB.PLANET[p].th); };
  var bhumiName = function (b) { return T("lc.bhumi." + b, KB.BHUMI_TH[b].th); };
  var godName = function (g) { return T("lc.god." + g, KB.GOD[g].th); };
  var domName = function (d) { return T("lc.dom." + d, KB.DOM_TH[d]); };
  var sysName = function (s) { return T("lc.sys." + s, { taksa: "ทักษา", bazi: "八字", west: "ตะวันตก" }[s]); };
  var SIGN_TH = ["เมษ", "พฤษภ", "เมถุน", "กรกฎ", "สิงห์", "กันย์", "ตุลย์", "พิจิก", "ธนู", "มังกร", "กุมภ์", "มีน"];
  var SIGN_ZH = ["白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"];
  var SIGN_EN = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  var signName = function (i) { return isZh() ? SIGN_ZH[i] : isEn() ? SIGN_EN[i] : "ราศี" + SIGN_TH[i]; };

  /* ---------- ฟอร์ม ---------- */
  function keep(sel, fn) { var el = $(sel); if (!el) return; var v = el.value; fn(el); if (v) el.value = v; }
  function renderOptions() {
    keep("#lcDay", function (el) { el.innerHTML = '<option value="">' + esc(T("lc.day", "วันที่")) + "</option>" + Array.from({ length: 31 }, function (_, i) { return "<option>" + (i + 1) + "</option>"; }).join(""); });
    keep("#lcMonth", function (el) { el.innerHTML = '<option value="">' + esc(T("lc.month", "เดือน")) + "</option>" + months.map(function (m, i) { return '<option value="' + (i + 1) + '">' + esc(T("lc.monthN", m, { m: i + 1 })) + "</option>"; }).join(""); });
    keep("#lcTz", function (el) { el.innerHTML = [[7, "lc.tz7", "ประเทศไทย (UTC+7)"], [8, "lc.tz8", "จีน ไต้หวัน สิงคโปร์ มาเลเซีย (UTC+8)"], [9, "lc.tz9", "ญี่ปุ่น เกาหลี (UTC+9)"], [0, "lc.tz0", "UTC"]].map(function (z) { return '<option value="' + z[0] + '">' + esc(T(z[1], z[2])) + "</option>"; }).join(""); });
  }
  renderOptions();
  function showMsg() { $("#lcMsg").textContent = st.msg ? T(st.msg, st.msg) : ""; }
  function readForm() {
    var d = +$("#lcDay").value, m = +$("#lcMonth").value, raw = $("#lcYear").value.trim();
    var era = document.querySelector('input[name="lcEra"]:checked').value, y = HS.toCE(+raw, era);
    var err = HS.validateDate(y, m, d); if (err) return { err: err };
    if (y < 1900 || y > 2100) return { err: "lc.yearRange" };
    var noTime = $("#lcNoTime").checked, tm = ($("#lcTime").value || "12:00").split(":");
    var g = document.querySelector('input[name="lcGender"]:checked');
    return { y: y, m: m, d: d, h: noTime ? 12 : +tm[0], mi: noTime ? 0 : +tm[1] || 0, noTime: noTime, tz: $("#lcTz") ? +$("#lcTz").value : 7, gender: g ? g.value : "female" };
  }
  $("#lcForm").addEventListener("submit", function (e) {
    e.preventDefault(); st.msg = null; showMsg();
    var b = readForm();
    if (b.err) { st.msg = b.err === "lc.yearRange" ? "lc.yearRange" : b.err; if (b.err === "lc.yearRange") $("#lcMsg").textContent = T("lc.yearRange", "รองรับปีเกิด ค.ศ. 1900–2100"); else showMsg(); return; }
    st.b = b; compute(); render(true);
  });
  $("#lcAgain").addEventListener("click", function () { $("#lcResult").hidden = true; $("#lcForm").reset(); st.b = st.res = null; $("#lcForm").scrollIntoView({ block: "start" }); });
  $("#lcPrint").addEventListener("click", function () { window.print(); });

  var ageNow = function (b) { var n = new Date(), a = n.getFullYear() - b.y; if (n.getMonth() + 1 < b.m || (n.getMonth() + 1 === b.m && n.getDate() < b.d)) a--; return Math.max(0, a); };
  function compute() {
    var b = st.b, R = { age: ageNow(b) };
    if (page === "bazi" || page === "lifegraph") R.bazi = LC.bazi(b);
    if (page === "taksa" || page === "lifegraph") R.taksa = LC.taksa(b);
    if (page === "lek7") R.lek7 = LC.lek7(b);
    if (page === "lifegraph") { R.west = LC.progressedSunChanges(b); R.curves = KB.lifeCurves(R.bazi, R.taksa, R.west); }
    st.res = R;
  }
  var pz = function (p) { return '<span class="lc-gz"><b style="--c:' + EL_COL[LC.STEM_EL[p.stem]] + '">' + LC.STEMS[p.stem] + '</b><b style="--c:' + EL_COL[LC.BRANCH_EL[p.branch]] + '">' + LC.BRANCHES[p.branch] + "</b></span>"; };
  var bar = function (label, v, col) { return '<div class="elbar"><span>' + esc(label) + '</span><i style="--w:' + Math.max(2, v) + "%;--c:" + col + '"></i><b>' + v + "%</b></div>"; };

  /* ---------- 八字 ---------- */
  function renderBazi(B) {
    var P = B.pillars, cols = [["year", "lc.p.year", "ปี"], ["month", "lc.p.month", "เดือน"], ["day", "lc.p.day", "วัน"], ["hour", "lc.p.hour", "ยาม"]];
    var h = '<table class="lc-table lc-pillars"><caption>' + esc(T("lc.pillarsCap", "สี่เสาชะตา (天干 ก้านฟ้า · 地支 กิ่งดิน)")) + "</caption><thead><tr>" + cols.map(function (c) { return '<th scope="col">' + esc(T(c[1], c[2])) + "</th>"; }).join("") + "</tr></thead><tbody><tr>" +
      cols.map(function (c) { return "<td>" + (P[c[0]] ? pz(P[c[0]]) : '<span class="muted">' + esc(T("lc.noHour", "ไม่ทราบเวลา")) + "</span>") + "</td>"; }).join("") + "</tr></tbody></table>";
    h += '<dl class="fk-kv"><div><dt>' + esc(T("lc.dm", "เจ้าชะตา (日主)")) + "</dt><dd>" + esc(LC.STEMS[B.dayMaster.stem] + " · " + elName(B.dayMaster.el) + (B.dayMaster.yang ? T("lc.yang", "หยาง") : T("lc.yin", "หยิน"))) + "</dd></div>" +
      "<div><dt>" + esc(T("lc.strength", "กำลังเจ้าชะตา")) + "</dt><dd>" + esc(T("lc.str." + B.strength, KB.STRENGTH[B.strength].th)) + "</dd></div>" +
      "<div><dt>" + esc(T("lc.favour", "ธาตุที่หนุน")) + "</dt><dd>" + esc(B.favour.map(elName).join(" · ")) + "</dd></div>" +
      "<div><dt>" + esc(T("lc.jie", "สารทก่อนเกิด / ถัดไป")) + "</dt><dd>" + esc(B.jie.prev.name + " → " + B.jie.next.name) + "</dd></div></dl>";
    h += '<h3 class="lc-h">' + esc(T("lc.elH", "สมดุลห้าธาตุ (รวมก้านแฝงในกิ่ง)")) + "</h3>" + B.elementShare.map(function (v, e) { return bar(elName(e), v, EL_COL[e]); }).join("");
    h += '<table class="lc-table"><caption>' + esc(T("lc.luckCap", "วัยจร 10 ปี (大运) · เริ่มอายุ {a} ปี · เดิน{d}", { a: B.luck.startAge, d: B.luck.forward ? T("lc.fwd", "ตามเข็ม") : T("lc.bwd", "ทวนเข็ม") })) + "</caption><thead><tr><th scope=\"col\">" + esc(T("lc.ages", "อายุ")) + '</th><th scope="col">' + esc(T("lc.pillar", "เสา")) + '</th><th scope="col">' + esc(T("lc.god", "สิบเทพ")) + "</th></tr></thead><tbody>" +
      B.luck.pillars.map(function (l) { var cur = st.res.age >= l.from && st.res.age < l.to; return "<tr" + (cur ? ' class="lc-cur" aria-current="true"' : "") + "><td>" + Math.floor(l.from) + "–" + Math.floor(l.to) + "</td><td>" + pz(l.pillar) + "</td><td>" + esc(godName(l.stemGod)) + (l.fav >= 1 ? ' <span class="lc-fav">' + esc(T("lc.favMark", "ธาตุหนุน")) + "</span>" : "") + "</td></tr>"; }).join("") + "</tbody></table>";
    return h;
  }
  /* ---------- ทักษา ---------- */
  function renderTaksa(Tk) {
    var h = '<dl class="fk-kv"><div><dt>' + esc(T("lc.birthPlanet", "ดาวประจำวันเกิด")) + "</dt><dd>" + esc(planetName(Tk.birth.planet)) + "</dd></div></dl>";
    h += '<table class="lc-table"><caption>' + esc(T("lc.bhumiCap", "ภูมิทั้งแปด (นับจากดาววันเกิดตามวงทักษา)")) + '</caption><thead><tr><th scope="col">' + esc(T("lc.bhumi", "ภูมิ")) + '</th><th scope="col">' + esc(T("lc.planet", "ดาว")) + '</th><th scope="col">' + esc(T("lc.color", "สีประจำดาว")) + "</th></tr></thead><tbody>" +
      LC.BHUMI.map(function (b) { var p = Tk.bhumi[b], care = KB.BHUMI_TH[b].tone === "caution"; return "<tr" + (care ? ' class="lc-care"' : "") + "><td>" + esc(bhumiName(b)) + "</td><td>" + esc(planetName(p)) + "</td><td>" + esc(T("lc.pcolor." + p, KB.PLANET[p].color)) + "</td></tr>"; }).join("") + "</tbody></table>";
    h += '<table class="lc-table"><caption>' + esc(T("lc.mahaCap", "มหาทักษา (อายุจร) 108 ปี")) + '</caption><thead><tr><th scope="col">' + esc(T("lc.ages", "อายุ")) + '</th><th scope="col">' + esc(T("lc.planet", "ดาว")) + '</th><th scope="col">' + esc(T("lc.bhumi", "ภูมิ")) + "</th></tr></thead><tbody>" +
      Tk.maha.filter(function (m) { return m.from < 100; }).map(function (m) { var cur = st.res.age >= m.from && st.res.age < m.to; return "<tr" + (cur ? ' class="lc-cur" aria-current="true"' : "") + "><td>" + m.from + "–" + m.to + "</td><td>" + esc(planetName(m.planet)) + "</td><td>" + esc(bhumiName(m.bhumi)) + "</td></tr>"; }).join("") + "</tbody></table>";
    return h;
  }
  /* ---------- เลข 7 ตัว ---------- */
  function renderLek7(L) {
    var hi = L.sum.indexOf(Math.max.apply(null, L.sum)), lo = L.sum.indexOf(Math.min.apply(null, L.sum));
    var rows = [["lc.r1", "ฐาน 1 วันเกิด"], ["lc.r2", "ฐาน 2 เดือน (จันทรคติ เดือน {m})"], ["lc.r3", "ฐาน 3 ปีนักษัตร"]];
    var h = '<table class="lc-table lc-l7"><caption>' + esc(T("lc.l7Cap", "ผังเลข 7 ตัว (ฐาน 1–4)")) + '</caption><thead><tr><th scope="col"></th>' + KB.HOUSE.map(function (x, i) { return '<th scope="col">' + esc(T("lc.house." + i, x.th)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      L.rows.map(function (r, i) { return '<tr><th scope="row">' + esc(T(rows[i][0], rows[i][1], { m: L.lunarMonth + (L.secondEight ? T("lc.second8", " หลัง") : "") })) + "</th>" + r.map(function (v) { return "<td>" + v + "</td>"; }).join("") + "</tr>"; }).join("") +
      '<tr class="lc-sum"><th scope="row">' + esc(T("lc.r4", "ฐาน 4 ฐานรวม")) + "</th>" + L.sum.map(function (v, i) { return "<td" + (i === hi ? ' class="lc-hi"' : i === lo ? ' class="lc-lo"' : "") + ">" + v + "</td>"; }).join("") + "</tr></tbody></table>";
    h += '<p class="fk-small">' + esc(T("lc.l7Note", "ช่องที่สูงสุดคือจุดแข็ง ช่องที่ต่ำสุดคือด้านที่ควรค่อย ๆ เติม (เดือนจันทรคติเป็นค่าประมาณ)")) + "</p>";
    return h;
  }
  /* ---------- กราฟชีวิต (SVG) ---------- */
  var DOM_COL = { work: "#4b36c9", money: "#b08900", love: "#d6336c", care: "#0c8599" };
  var DOM_DASH = { work: "", money: "8 5", love: "2 4", care: "12 4 2 4" };
  var SYS_COL = { taksa: "#e8590c", bazi: "#2f9e44", west: "#1c7ed6" };
  function chartSVG(C, age) {
    var W = 760, H = 340, L = 44, Rr = 14, Tp = 18, B = 40, x = function (a) { return L + a / 96 * (W - L - Rr); }, y = function (v) { return Tp + (100 - v) / 100 * (H - Tp - B); };
    var tid = "lcChartT", did = "lcChartD";
    var s = '<svg class="lc-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-labelledby="' + tid + " " + did + '"><title id="' + tid + '">' + esc(T("lc.chartTitle", "กราฟชีวิต อายุ 0–96 ปี")) + '</title><desc id="' + did + '">' + esc(T("lc.chartDesc", "เส้นพลังการงาน การเงิน ความรัก และการดูแลตัวเอง เส้นแนวตั้งคือจุดเปลี่ยนจากแต่ละระบบ ตารางด้านล่างแสดงข้อมูลเดียวกัน")) + "</desc>";
    for (var g = 0; g <= 100; g += 25) s += '<line class="lc-grid" x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y(g) + '" y2="' + y(g) + '"/><text class="lc-ax" x="' + (L - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + g + "</text>";
    for (var a = 0; a <= 96; a += 12) s += '<text class="lc-ax" x="' + x(a) + '" y="' + (H - B + 18) + '" text-anchor="middle">' + a + "</text>";
    s += '<text class="lc-ax" x="' + (W - Rr) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(T("lc.ageAxis", "อายุ (ปี)")) + "</text>";
    C.turns.forEach(function (t) { s += '<line class="lc-turn" x1="' + x(t.age) + '" x2="' + x(t.age) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="' + SYS_COL[t.sys] + '"><title>' + esc(sysName(t.sys) + " · " + Math.round(t.age)) + "</title></line>"; });
    if (age <= 96) s += '<line class="lc-now" x1="' + x(age) + '" x2="' + x(age) + '" y1="' + Tp + '" y2="' + (H - B) + '"/><text class="lc-ax lc-nowt" x="' + x(age) + '" y="' + (Tp - 4) + '" text-anchor="middle">' + esc(T("lc.now", "ตอนนี้")) + "</text>";
    C.doms.forEach(function (d, k) {
      s += '<polyline class="lc-line" fill="none" stroke="' + DOM_COL[d] + '" stroke-dasharray="' + DOM_DASH[d] + '" points="' + C.points.map(function (p) { return x(p.age).toFixed(1) + "," + y(p.v[k]).toFixed(1); }).join(" ") + '"/>';
      var pk = C.peaks[k]; s += '<circle cx="' + x(pk.peak) + '" cy="' + y(pk.peakV) + '" r="4.5" fill="' + DOM_COL[d] + '"><title>' + esc(T("lc.peakOf", "จุดสูงสุดของ{d} อายุ {a}", { d: domName(d), a: pk.peak })) + "</title></circle>";
    });
    s += "</svg>";
    var leg = '<ul class="lc-legend">' + C.doms.map(function (d) { return '<li><svg width="34" height="10" aria-hidden="true"><line x1="0" x2="34" y1="5" y2="5" stroke="' + DOM_COL[d] + '" stroke-width="3" stroke-dasharray="' + DOM_DASH[d] + '"/></svg>' + esc(domName(d)) + "</li>"; }).join("") +
      Object.keys(SYS_COL).map(function (k) { return '<li><svg width="12" height="14" aria-hidden="true"><line x1="6" x2="6" y1="0" y2="14" stroke="' + SYS_COL[k] + '" stroke-width="2"/></svg>' + esc(T("lc.turnOf", "จุดเปลี่ยน · {s}", { s: sysName(k) })) + "</li>"; }).join("") + "</ul>";
    return s + leg;
  }
  function renderLife(R) {
    var C = R.curves, h = chartSVG(C, R.age);
    h += '<h3 class="lc-h">' + esc(T("lc.peaksH", "จุดสูงสุดและช่วงที่ควรเดินอย่างรอบคอบ")) + '</h3><ul class="lc-peaks">' + C.peaks.map(function (p) { return "<li><b>" + esc(domName(p.dom)) + "</b> " + esc(T("lc.peakLine", "สูงสุดราวอายุ {a} · ควรระวังราวอายุ {b}", { a: p.peak, b: p.low })) + "</li>"; }).join("") + "</ul>";
    h += '<h3 class="lc-h">' + esc(T("lc.turnsH", "จุดเปลี่ยน (บอกระบบที่มา)")) + '</h3><ul class="lc-turns">' + C.turns.filter(function (t) { return t.age <= 96; }).map(function (t) {
      var what = t.sys === "taksa" ? T("lc.tTaksa", "เข้ามหาทักษาดาว{p} (ภูมิ{b})", { p: planetName(t.planet), b: bhumiName(t.bhumi) }) : t.sys === "bazi" ? T("lc.tBazi", "เข้าวัยจร {z} · {g}", { z: t.pillar, g: godName(t.god) }) : t.key === "saturn" ? T("lc.tSaturn", "รอบดาวเสาร์คืนตำแหน่ง (Saturn return)") : T("lc.tProg", "ดวงอาทิตย์จรเข้า{s}", { s: signName(t.sign) });
      return '<li><span class="lc-sys" style="--c:' + SYS_COL[t.sys] + '">' + esc(sysName(t.sys)) + "</span> " + esc(T("lc.ageN", "อายุ {a}", { a: Math.round(t.age) })) + " · " + esc(what) + "</li>";
    }).join("") + "</ul>";
    // ตารางช่วงอายุ (ข้อมูลเดียวกับกราฟ — ทางเลือกสำหรับโปรแกรมอ่านหน้าจอ)
    h += '<div class="lc-scroll"><table class="lc-table lc-bands"><caption>' + esc(T("lc.bandsCap", "ระดับพลังเฉลี่ยทุก 6 ปี (0–100)")) + '</caption><thead><tr><th scope="col">' + esc(T("lc.ages", "อายุ")) + "</th>" + C.doms.map(function (d) { return '<th scope="col">' + esc(domName(d)) + "</th>"; }).join("") + '<th scope="col">' + esc(T("lc.from", "ที่มา")) + "</th></tr></thead><tbody>" +
      KB.BANDS(6).map(function (bd) { var S = KB.bandSummary(C, bd[0], bd[1]), cur = R.age >= bd[0] && R.age < bd[1]; return "<tr" + (cur ? ' class="lc-cur" aria-current="true"' : "") + "><td>" + bd[0] + "–" + bd[1] + "</td>" + S.avg.map(function (v) { var tn = KB.TONE_OF(v); return '<td class="lc-t-' + tn + '">' + v + "</td>"; }).join("") +
        "<td>" + esc(T("lc.bandFrom", "มหาทักษาดาว{p}", { p: planetName(S.maha.planet) }) + (S.luck ? " · " + T("lc.bandLuck", "วัยจร {z}", { z: S.luck.pillar.zh }) : "") + (S.saturn ? " · " + T("lc.bandSat", "รอบดาวเสาร์") : "")) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    return h;
  }

  var DOMAIN = { bazi: "bazi", taksa: "taksa", lek7: "lek7", lifegraph: "lifegraph" };
  function factsFor(topic) {
    var R = st.res;
    if (page === "bazi") return KB.baziFacts(R.bazi, topic, { age: R.age });
    if (page === "taksa") return KB.taksaFacts(R.taksa, topic, { age: R.age });
    if (page === "lek7") return KB.lek7Facts(R.lek7, topic);
    return KB.lifeFacts(R.bazi, R.taksa, R.west, R.curves, R.age, topic);
  }
  function render(focus) {
    var R = st.res, b = st.b; if (!R) return;
    $("#lcResult").hidden = false;
    $("#lcResTitle").textContent = T("lc.resTitle." + page, { bazi: "ผังแปดอักษร", taksa: "ผังทักษา", lek7: "ผังเลข 7 ตัว", lifegraph: "กราฟชีวิต" }[page]) + " · " + T("lc.bornOn", "เกิด {d}/{m}/{y}", { d: b.d, m: b.m, y: yearOut(b.y) });
    $("#lcChart").innerHTML = page === "bazi" ? renderBazi(R.bazi) : page === "taksa" ? renderTaksa(R.taksa) : page === "lek7" ? renderLek7(R.lek7) : renderLife(R);
    $("#lcReadWrap").innerHTML = FK.readingBlock("lcRd", T("lc.rdTitle", "คำอ่านตามตำรา"), true);
    FK.bindReading("lcRd", DOMAIN[page], function (topic) { return factsFor(topic); }, { withTopics: true });
    if (focus) $("#lcResTitle").focus();
  }
  window.addEventListener("lq-lang", function () { renderOptions(); showMsg(); if (st.res && !$("#lcResult").hidden) render(false); });
  window.__lc = { state: st, compute: compute, render: render, page: page };
})();
