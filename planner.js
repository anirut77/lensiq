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
  var EVENT_TH = { move: "ขึ้นบ้านใหม่", shop: "เปิดร้าน / กิจการ", work: "เริ่มงานใหม่", wedding: "แต่งงาน", engage: "หมั้น / สู่ขอ",
    regmarry: "จดทะเบียนสมรส", ordain: "บวช", bdaymerit: "ทำบุญวันเกิด", haircut: "โกนผมไฟ", pillar: "ยกเสาเอก", pile: "ลงเสาเข็ม",
    spirit: "ตั้งศาลพระภูมิ", shrine: "ตั้งหิ้งพระ", compreg: "จดทะเบียนบริษัท", newco: "เริ่มกิจการใหม่", contract: "เซ็นสัญญา",
    branch: "เปิดสาขา", car: "ออกรถใหม่", journey: "เดินทางไกล", waikru: "ไหว้ครู", launch: "เปิดตัวสินค้า" };
  var wdName = function (p) { return T("pl.wd." + p, WD_TH[p]); };
  var animalName = function (a) { return T("pl.an." + a, ANIMAL_TH[a]); };
  var bhumiName = function (b) { return T("pl.bh." + b, K.bhumi[b].th); };
  var colourName = function (p) { return T("pl.col." + p, K.days[p].color); };
  var eventName = function (e) { return T("pl.ev." + e, EVENT_TH[e]); };
  var monthName = function (m) { return T("pl.mon." + m, MONTH_TH[m - 1]); };
  var yearOut = function (y) { return lang() === "th" ? y + 543 : y; };

  var st = { res: null, ev: "move", sort: "date", picked: {} };

  /* ---------- grouped occasion chooser (owner order 2026-11-18): groups first, a tap opens one group, a second tap closes it.
     The added occasions' rules and wording (lensiq-planner-occ.js, i18n/*-planner-occ.js) load on the first tap, not with the page. ---------- */
  var occReady = null;
  function loadOcc() {
    if (occReady) return occReady;
    var add = function (src) {
      return new Promise(function (res) {
        var sc = document.createElement("script"); sc.src = src; sc.async = false;
        sc.onload = sc.onerror = function () { res(); }; document.head.appendChild(sc);
      });
    };
    occReady = Promise.all([add("lensiq-planner-occ.js?v=3"), add("i18n/zh-planner-occ.js?v=3")]).then(function () {
      var I = W.LQI18N; return I && I.loadSiblings && String(lang()) === "en" ? I.loadSiblings("en") : null;
    }).then(function () { renderResult(); });
    return occReady;
  }
  function syncGroups() {
    $$("input[name=plGroup]").forEach(function (g) { var p = $('.pl-occs[data-group="' + g.value + '"]'); if (p) p.hidden = !g.checked; });
    $("#plCur").textContent = eventName(($("input[name=plEvent]:checked") || {}).value || "move");
  }
  $$(".pl-grp").forEach(function (lb) {
    lb.addEventListener("click", function (e) {
      e.preventDefault();
      var g = $("input", lb), was = g.checked;
      $$("input[name=plGroup]").forEach(function (x) { x.checked = false; });
      g.checked = !was; if (!was) { g.focus({ preventScroll: true }); loadOcc(); }
      syncGroups();
    });
  });
  $$("input[name=plGroup]").forEach(function (g) { g.addEventListener("change", function () { syncGroups(); loadOcc(); }); });
  $$("input[name=plEvent]").forEach(function (r) { r.addEventListener("change", syncGroups); });
  syncGroups();

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
  /* "Modern practice" label (owner decisions 114–117): an occasion or a rule that does not come from a traditional text */
  function modernTag() { return '<span class="pl-modern">' + esc(T("pl.modern", P.MODERN_TH)) + "</span>"; }
  function whyHtml(ev) {
    var h = "<b>" + esc(T("pl.why.belief", "ตามความเชื่อ โปรดใช้วิจารณญาณ")) + "</b> ";
    var c = P.SRC_CLASS && P.SRC_CLASS[ev];
    if (c && c.cls === "modern") h += modernTag() + " ";
    h += esc(T("pl.why." + ev, P.WHY[ev] || ""));
    var mr = P.modernRules ? P.modernRules(ev) : [];
    if (mr.length) h += '<span class="pl-modline">' + modernTag() + " " +
      esc(mr.map(function (k) { return T("pl.modern.rule." + k, P.RULE_TH[k]); }).join(", ")) + "</span>";
    return h;
  }
  function reasonLi(r) {
    var modern = P.reasonClass && P.reasonClass(st.ev, r.id) === "modern";
    return '<li data-r="' + esc(r.id) + '">' + esc(reasonText(r)) + (modern ? " " + modernTag() : "") + "</li>";
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
    $("#plWhy").innerHTML = whyHtml(st.ev);
    var needOwner = P.OCC[st.ev] && P.OCC[st.ev].needsOwner && !f.owners.length;
    $("#plEmpty").textContent = needOwner ? T("pl.emptyOwner", "งานนี้ดูจากวันเกิดของเจ้าของงาน ใส่วันเกิดในช่องเจ้าของ แล้วกดหาวันดีอีกครั้ง")
      : T("pl.empty", "ช่วงนี้ยังไม่มีวันที่ตรงเกณฑ์ ลองดูเพิ่มเป็น 3 เดือน หรือเลือกเดือนถัดไป");
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
        '<span class="pl-chip" data-lq-remedy>' + swatch(x.colour.lucky) + esc(T("pl.luckyColour", "สีเสื้อเสริมมงคล: {c}", { c: colourName(x.colour.lucky) })) + "</span>" +
        '<span class="pl-chip pl-score">' + esc(T("pl.score", "ตรงเกณฑ์ {s} จาก {max} คะแนน", { s: x.score, max: max })) + "</span></div>" +
        '<ul class="pl-why">' + main.map(reasonLi).join("") + "</ul>" +
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
    var run = function () {
      st.form = f; st.ev = f.event; st.picked = {};
      st.res = P.plan(f);
      renderResult();
      $("#plResult").hidden = false;
      $("#plResH").focus();
    };
    // the three first occasions are in lensiq-planner.js (same tick, as before); the others wait for their rules
    if (P.EVENTS.indexOf(f.event) >= 0) run();
    else loadOcc().then(function () {
      if (P.EVENTS.indexOf(f.event) >= 0) run();
      else { occReady = null; $("#plMsg").textContent = T("pl.f.loadErr", "โหลดข้อมูลงานนี้ไม่สำเร็จ ตรวจการเชื่อมต่อแล้วกดหาวันดีอีกครั้ง"); }
    });
  });
  $("#plList").addEventListener("change", function (e) {
    var t = e.target; if (!t || !t.getAttribute || !t.getAttribute("data-k")) return;
    st.picked[t.getAttribute("data-k")] = t.checked;
    var li = t.closest(".pl-day"); if (li) li.classList.toggle("picked", t.checked);
    renderPicked();
  });
  $$(".pl-seg").forEach(function (b) { b.addEventListener("click", function () { st.sort = b.getAttribute("data-sort"); renderResult(); }); });
  $("#plAgain").addEventListener("click", function () { $("#plResult").hidden = true; $("#plForm").scrollIntoView({ block: "start" }); });
  // #plPrint: the shared print of fortune-share.js (owner order 2026-11-16), which also adds the share button next to it
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
    renderOptions(); renderResult(); syncGroups();
    var b = $("#plAddOwner"), open = !$("#plOwner2").hidden;
    b.textContent = open ? T("pl.f.remove2", "− ไม่ใส่เจ้าของคนที่ 2") : T("pl.f.add2", "+ เพิ่มเจ้าของคนที่ 2 (เช่น คู่สมรส หุ้นส่วน)");
  });
  W.__pl = { st: st, icsText: icsText };
})();
/* BEGIN fortune-readbar.js (copied by tools/fortune-read-embed.mjs; edit fortune-readbar.js, then run it) */
/* fortune-readbar.js — sticky "read" bar on the fortune reading pages (owner order 2026-11-16 item 3, review of 08c7b6f:
 * "the main action is on the first screen" means the button that gives the reading). The page's own read / submit button is
 * marked data-lq-read; while that button is below the visible area (and no reading is on screen) a compact bar at the bottom
 * shows a copy of it (same label, page language, 44 px+); a tap clicks the real button, so validation, the crisis net and the
 * reading flow are the page's own. Hidden when the real button or a reading is on screen, when the page is in the crisis state
 * (html[data-lq-crisis]) or a help card is shown, and in print. Bottom of the screen only: it never covers the top bar's help
 * control. Solid white (owner report 2026-11-18: page text showed through the .96 white). Single source;
 * tools/fortune-read-embed.mjs copies it into fortune-read.js (reading pages) and planner.js. */
(function (root) {
  "use strict";
  var doc = root.document;
  if (!doc || !doc.querySelector || root.__lqReadbar) return;
  root.__lqReadbar = true;
  /** @type {any} */ var bar = null, btn = null, real = null, raf = 0;
  /** @returns {any} */
  function pick() {
    var all = doc.querySelectorAll("[data-lq-read]");
    for (var i = 0; i < all.length; i++) if (all[i].getClientRects().length) return all[i];
    return null;
  }
  function onScreen(e) { var r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < root.innerHeight && r.width > 0; }
  function readingShown() {
    var r = doc.querySelectorAll(".fa-section, .fa-support, [data-lq-result]");
    for (var i = 0; i < r.length; i++) if (r[i].getClientRects().length && onScreen(r[i])) return true;
    return false;
  }
  // a form field has focus, or the on-screen keyboard shrinks the visual viewport: the bar would cover the field (review 2026-11-17)
  function typing() {
    var a = doc.activeElement, vv = root.visualViewport;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !(bar && bar.contains(a))) return true;
    return !!vv && vv.height < root.innerHeight * 0.75;
  }
  function build() {
    var st = doc.createElement("style");
    st.textContent = ".lq-readbar{position:fixed;left:0;right:0;bottom:0;z-index:55;padding:8px 16px calc(8px + env(safe-area-inset-bottom));" +
      "background:#fff;border-top:1px solid #e3e7f0;box-shadow:0 -6px 18px rgba(14,20,48,.08)}" +
      ".lq-readbar .btn{display:flex;width:100%;max-width:520px;min-height:48px;margin:0 auto}.lq-readbar[hidden]{display:none}" +
      "@media print{.lq-readbar{display:none!important}}";
    doc.head.appendChild(st);
    bar = doc.createElement("div"); bar.className = "lq-readbar"; bar.hidden = true;
    btn = doc.createElement("button"); btn.type = "button"; btn.className = "btn primary big";
    btn.addEventListener("click", function (/** @type {any} */ e) {
      if (!real || real.disabled) return;
      var y = root.scrollY, r = real;
      r.click();
      if (!e.detail) r.focus(); // keyboard: focus moves to the page's own button before the bar hides
      // the page did not move to its result: bring the form's button (and what it shows below it) into view
      root.setTimeout(function () { if (root.scrollY === y && r.isConnected) r.scrollIntoView({ block: "center" }); }, 250);
    });
    bar.appendChild(btn); doc.body.appendChild(bar);
  }
  function sync() {
    raf = 0;
    real = pick();
    var crisis = doc.documentElement.hasAttribute("data-lq-crisis");
    var show = !!real && !crisis && !typing() && real.getBoundingClientRect().top > root.innerHeight - 8 && !readingShown();
    if (show && !bar) build();
    if (!bar) return;
    if (show) {
      btn.textContent = (real.textContent || "").replace(/\s+/g, " ").trim();
      btn.disabled = !!real.disabled;
    }
    if (bar.hidden === show) { bar.hidden = !show; doc.body.style.paddingBottom = show ? bar.offsetHeight + "px" : ""; }
  }
  function later() { if (!raf) raf = root.requestAnimationFrame(sync); }
  ["scroll", "resize", "lq-lang"].forEach(function (t) { root.addEventListener(t, later, { passive: true }); });
  ["input", "change", "click", "focusin", "focusout"].forEach(function (t) { doc.addEventListener(t, later, true); });
  if (root.visualViewport) root.visualViewport.addEventListener("resize", later);
  if (root.MutationObserver) {
    var mo = new root.MutationObserver(function () { sync(); }); // crisis flag / button state: at once, not on the next frame
    mo.observe(doc.documentElement, { attributes: true, attributeFilter: ["data-lq-crisis"] });
    // the page enables its button later (dream: after the symbols are found)
    // the real button entering or leaving the screen (also at the end of a smooth scroll): no polling
    var io = root.IntersectionObserver ? new root.IntersectionObserver(later) : null;
    var watch = function () {
      var r = doc.querySelectorAll("[data-lq-read]");
      for (var i = 0; i < r.length; i++) { mo.observe(r[i], { attributes: true, attributeFilter: ["disabled"] }); if (io) io.observe(r[i]); }
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", watch); else watch();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", later); else later();
  root.addEventListener("load", later);
})(typeof window !== "undefined" ? window : globalThis);
/* END fortune-readbar.js */
