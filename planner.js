/* planner.js — UI of planner.html (ฤกษ์มงคล: ขึ้นบ้านใหม่ / เปิดร้าน / เริ่มงาน).
   Logic: lensiq-planner.js (LQPlanner) on top of horoscope.js (HSCore) + horoscope-kb.js (weekday colours).
   TH text lives in the markup / here; EN / ZH: i18n/en-planner.js, i18n/zh-planner.js (keys "pl.*").
   Good days only; nothing is stored (no localStorage) and nothing leaves the device — the .ics file is built locally. */
if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("plApp")) (function () {
  "use strict";
  var W = /** @type {any} */ (window), P = W.LQPlanner, HS = W.HSCore, K = W.HSKB;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fill = function (th, v) { return String(th).replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  var T = function (k, th, v) { return window.LQI18N && window.LQI18N.tf ? window.LQI18N.tf(k, th, v) : fill(th, v); };
  var lang = function () { return (window.LQI18N && window.LQI18N.lang) || "th"; };

  var WD_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "พุธกลางคืน"];
  var ANIMAL_TH = ["ชวด", "ฉลู", "ขาล", "เถาะ", "มะโรง", "มะเส็ง", "มะเมีย", "มะแม", "วอก", "ระกา", "จอ", "กุน"];
  var MONTH_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  var EVENT_TH = { move: "ขึ้นบ้านใหม่", shop: "เปิดร้าน / กิจการ", work: "เริ่มงานใหม่" };
  var wdName = function (p) { return T("pl.wd." + p, WD_TH[p]); };
  var animalName = function (a) { return T("pl.an." + a, ANIMAL_TH[a]); };
  var bhumiName = function (b) { return T("pl.bh." + b, K.bhumi[b].th); };
  var colourName = function (p) { return T("pl.col." + p, K.days[p].color); };
  var eventName = function (e) { return T("pl.ev." + e, EVENT_TH[e]); };
  var monthName = function (m) { return T("pl.mon." + m, MONTH_TH[m - 1]); };
  var yearOut = function (y) { return lang() === "th" ? y + 543 : y; };

  var st = { res: null, ev: "move", sort: "date", picked: {} };

  /* ---------- form ---------- */
  function keep(el, html) { var v = el.value; el.innerHTML = html; if (v) el.value = v; }
  function renderOptions() {
    var now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1, opts = "";
    for (var i = 0; i < 13; i++) {
      var mm = (m - 1 + i) % 12 + 1, yy = y + Math.floor((m - 1 + i) / 12);
      opts += '<option value="' + yy + "-" + mm + '">' + esc(T("pl.monYear", "{m} {y}", { m: monthName(mm), y: yearOut(yy) })) + "</option>";
    }
    keep($("#plFrom"), opts);
    $$(".pl-wd").forEach(function (el) {
      keep(el, '<option value="">' + esc(T("pl.f.wdNone", "ไม่ระบุ")) + "</option>" +
        [0, 1, 2, 3, 7, 4, 5, 6].map(function (p) { return '<option value="' + p + '">' + esc(wdName(p)) + "</option>"; }).join(""));
    });
    $$(".pl-zd").forEach(function (el) {
      keep(el, '<option value="">' + esc(T("pl.f.zdNone", "ไม่ระบุ")) + "</option>" +
        ANIMAL_TH.map(function (_, a) { return '<option value="' + a + '">' + esc(animalName(a)) + "</option>"; }).join(""));
    });
  }
  renderOptions();

  // birth date → weekday (in memory only)
  $$(".pl-owner").forEach(function (fs) {
    var bd = $(".pl-bd", fs), note = $(".pl-bdnote", fs);
    bd.addEventListener("change", function () {
      var mt = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bd.value);
      if (!mt) { note.textContent = ""; return; }
      var wd = HS.weekday(+mt[1], +mt[2], +mt[3]);
      $(".pl-wd", fs).value = String(wd);
      note.textContent = T("pl.f.bdOut", "เกิดวัน{wd}", { wd: wdName(wd) }) + (wd === 3 ? " " + T("pl.f.bdWed", "ถ้าเกิดตั้งแต่ 18:00 น. ให้เลือก \"พุธกลางคืน\"") : "");
    });
  });
  $("#plAddOwner").addEventListener("click", function () {
    var box = $("#plOwner2"), open = box.hidden, btn = $("#plAddOwner");
    box.hidden = !open; btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? T("pl.f.remove2", "− ไม่ใส่เจ้าของคนที่ 2") : T("pl.f.add2", "+ เพิ่มเจ้าของคนที่ 2 (เช่น คู่สมรส หุ้นส่วน)");
    if (!open) { $$("select, input", box).forEach(function (el) { el.value = ""; }); $(".pl-bdnote", box).textContent = ""; }
  });

  function readForm() {
    var ev = ($("input[name=plEvent]:checked") || {}).value || "move";
    var fm = /^(\d{4})-(\d{1,2})$/.exec($("#plFrom").value) || [];
    var y = +fm[1], m = +fm[2], span = Math.max(1, Math.min(3, +$("#plSpan").value || 2));
    var now = new Date(), today = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
    var from = { y: y, m: m, d: 1 };
    if (y === today.y && m === today.m) from = today;
    var ey = y + Math.floor((m - 1 + span) / 12), em = (m - 1 + span) % 12 + 1;
    var to = HS.fromJD(HS.jdn(ey, em, 1) - 1);
    var owners = $$(".pl-owner").filter(function (fs) { return !fs.hidden; }).map(function (fs) {
      var w = $(".pl-wd", fs).value, z = $(".pl-zd", fs).value;
      return w === "" ? null : { planet: +w, animal: z === "" ? null : +z };
    }).filter(Boolean);
    return { event: ev, from: from, to: { y: to.y, m: to.m, d: to.d }, owners: owners };
  }

  /* ---------- result ---------- */
  function fmtDate(x) {
    var d = new Date(x.y, x.m - 1, x.d), l = lang();
    try {
      return new Intl.DateTimeFormat(l === "th" ? "th-TH-u-ca-buddhist" : l === "zh" ? "zh-CN" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
    } catch (e) { return x.d + " " + monthName(x.m) + " " + yearOut(x.y); }
  }
  function lunarText(L) {
    var mo = L.month === 8 && L.leap ? T("pl.lm.8b", "8 หลัง") : String(L.month);
    return L.waxing ? T("pl.lunar.up", "ขึ้น {d} ค่ำ เดือน {m}", { d: L.day, m: mo }) : T("pl.lunar.down", "แรม {d} ค่ำ เดือน {m}", { d: L.day, m: mo });
  }
  function reasonText(r) {
    var v = r.v || {}, vars = { d: v.d, m: v.m, n: v.n };
    if (v.planet != null) vars.birth = wdName(v.planet);
    if (v.wd != null) vars.day = wdName(v.wd);
    if (v.animal != null) vars.animal = animalName(v.animal);
    if (v.dayAnimal != null) vars.dayAnimal = animalName(v.dayAnimal);
    var s = T("pl.r." + r.id, P.TH[r.id], vars);
    if (v.star) s += " · " + T("pl.r.star", P.TH.star, { bhumi: bhumiName(v.bhumi), event: eventName(st.ev) });
    return s;
  }
  function sorted() {
    var a = st.res.slice();
    if (st.sort === "score") a.sort(function (p, q) { return q.score - p.score || (p.y - q.y) || (p.m - q.m) || (p.d - q.d); });
    return a;
  }
  var keyOf = function (x) { return x.y + "-" + x.m + "-" + x.d; };
  function swatch(p) { return '<span class="pl-sw" style="background:' + esc(K.days[p].hex) + '" aria-hidden="true"></span>'; }
  function renderResult() {
    if (!st.res) return;
    var f = st.form, max = P.maxScore(f);
    $("#plResH").textContent = T("pl.res.h", "วันดีสำหรับ{event} ({n} วัน)", { event: eventName(st.ev), n: st.res.length });
    $("#plResSub").textContent = T("pl.res.sub", "{a} – {b} · เรียงตามที่คุณเลือก ติ๊กวันที่สนใจเพื่อบันทึกลงปฏิทิน", { a: fmtDate(f.from), b: fmtDate(f.to) }) +
      (f.owners.length ? "" : " " + T("pl.res.noOwner", "(ยังไม่ได้ใส่วันเกิดของเจ้าของ ใส่เพิ่มเพื่อให้ตรงกับดวงของคุณมากขึ้น)"));
    $$(".pl-seg").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-sort") === st.sort)); });
    $("#plEmpty").hidden = st.res.length > 0;
    $("#plList").innerHTML = sorted().map(function (x) {
      var k = keyOf(x), id = "pl-" + k;
      var main = x.reasons.filter(function (r) { return !r.note; }), notes = x.reasons.filter(function (r) { return r.note; });
      return '<li class="pl-day' + (st.picked[k] ? " picked" : "") + '">' +
        '<label class="pl-pick fk-check" for="' + id + '"><input type="checkbox" id="' + id + '" data-k="' + k + '"' + (st.picked[k] ? " checked" : "") + ">" +
        ' <span class="pl-date">' + esc(fmtDate(x)) + "</span></label>" +
        '<div class="pl-meta"><span class="pl-chip">' + swatch(x.colour.day) + esc(T("pl.dayColour", "สีประจำวัน: {c}", { c: colourName(x.colour.day) })) + "</span>" +
        '<span class="pl-chip">' + esc(lunarText(x.lunar)) + "</span>" +
        '<span class="pl-chip">' + swatch(x.colour.lucky) + esc(T("pl.luckyColour", "สีเสื้อเสริมมงคล: {c}", { c: colourName(x.colour.lucky) })) + "</span>" +
        '<span class="pl-chip pl-score">' + esc(T("pl.score", "ตรงเกณฑ์ {s} จาก {max} คะแนน", { s: x.score, max: max })) + "</span></div>" +
        '<ul class="pl-why">' + main.map(function (r) { return "<li>" + esc(reasonText(r)) + "</li>"; }).join("") + "</ul>" +
        (notes.length ? '<p class="fk-small pl-note">' + notes.map(function (r) { return esc(reasonText(r)); }).join(" ") + "</p>" : "") +
        "</li>";
    }).join("");
    renderPicked();
  }
  function pickedDays() { return (st.res || []).filter(function (x) { return st.picked[keyOf(x)]; }); }
  function renderPicked() {
    var n = pickedDays().length;
    $("#plIcs").disabled = !n;
    $("#plPicked").textContent = n ? T("pl.x.picked", "เลือกแล้ว {n} วัน", { n: n }) : T("pl.x.none", "ยังไม่ได้เลือกวัน");
  }

  $("#plForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = readForm();
    if (!f.from.y) { $("#plMsg").textContent = T("pl.f.err", "กรุณาเลือกเดือน"); return; }
    $("#plMsg").textContent = "";
    st.form = f; st.ev = f.event; st.picked = {};
    st.res = P.plan(f);
    renderResult();
    $("#plResult").hidden = false;
    $("#plResH").focus();
  });
  $("#plList").addEventListener("change", function (e) {
    var t = e.target; if (!t || !t.getAttribute || !t.getAttribute("data-k")) return;
    st.picked[t.getAttribute("data-k")] = t.checked;
    var li = t.closest(".pl-day"); if (li) li.classList.toggle("picked", t.checked);
    renderPicked();
  });
  $$(".pl-seg").forEach(function (b) { b.addEventListener("click", function () { st.sort = b.getAttribute("data-sort"); renderResult(); }); });
  $("#plAgain").addEventListener("click", function () { $("#plResult").hidden = true; $("#plForm").scrollIntoView({ block: "start" }); });
  $("#plPrint").addEventListener("click", function () { window.print(); });

  function icsText() {
    var days = pickedDays().map(function (x) {
      var basis = x.reasons.map(reasonText).concat([T("pl.dayColour", "สีประจำวัน: {c}", { c: colourName(x.colour.day) }), lunarText(x.lunar) + " " + T("pl.ics.approx", "(โดยประมาณ)")]);
      return { y: x.y, m: x.m, d: x.d, title: T("pl.ics.title", "ฤกษ์{event} (วันที่เลือกไว้)", { event: eventName(st.ev) }),
        desc: basis.join("\n") + "\n\n" + T("pl.ics.disc", "เพื่อการวางแผนตามวัฒนธรรม ไม่ใช่การรับประกันผล ควรสอบถามผู้รู้ที่คุณเคารพอีกครั้ง · LENSIQ") };
    });
    return P.ics(days, { time: $("#plTime").value || null, uidHost: location.hostname || "lensiq.local" });
  }
  $("#plIcs").addEventListener("click", function () {
    if (!pickedDays().length) return;
    var blob = new Blob([icsText()], { type: "text/calendar;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "lensiq-auspicious-" + st.ev + ".ics"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  });

  window.addEventListener("lq-lang", function () {
    renderOptions(); renderResult();
    var b = $("#plAddOwner"), open = !$("#plOwner2").hidden;
    b.textContent = open ? T("pl.f.remove2", "− ไม่ใส่เจ้าของคนที่ 2") : T("pl.f.add2", "+ เพิ่มเจ้าของคนที่ 2 (เช่น คู่สมรส หุ้นส่วน)");
  });
  W.__pl = { st: st, icsText: icsText };
})();
