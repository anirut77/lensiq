/* interview.js — Structured Interview Kit UI (interview.html). Pure parts are in interview-core.js (IVCore).
 * Everything lives in memory only: no localStorage, no uploads, no images/audio kept. The optional camera/mic
 * "delivery observation" needs explicit candidate opt-in and keeps only numbers while the page is open.
 * Test hooks: window.__LQ_IV (state, meter, helpers). ?fakedet on localhost: scripted faces via LQDetect.fake("c1"),
 * boxes may carry `yaw` (−1..1) to turn the synthetic head. */
(function () {
  "use strict";
  var W = /** @type {any} */ (window);
  var IV = W.IVCore;
  if (!IV || !document.getElementById("ivApp")) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var T = function (k, th, v) { return window.LQI18N ? window.LQI18N.tf(k, th, v) : th.replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var C = IV.COMPETENCIES;
  var cName = function (id) { return T("iv.c." + id + ".name", C[id].name); };
  var cTxt = function (id, f) { return T("iv.c." + id + "." + f, C[id][f]); };
  var toastH = null;
  function toast(msg) { var t = $("#ivToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastH); toastH = setTimeout(function () { t.classList.remove("show"); }, 2200); }

  var QS = new URLSearchParams(location.search);
  var S = { role: "sales", comps: IV.ROLES.sales.comps.slice(), cand: "", sheets: [], cur: -1, reveal: false, law: {}, delivery: null,
    org: { ack1: false, ack2: false, ack3: false, allow: false }, // organisation setting: interviewer viewing of delivery notes (off)
    region: QS.get("region") === "eu" ? "eu" : "th", // 'eu' = EU/EEA or regulated use: no emotion-like signals in employer flows
    candMode: QS.get("mode") === "practice" }; // candidate practice mode: candidate alone on own device, nothing to the employer

  /* ---------- tabs ---------- */
  function go(t) {
    $$(".iv .tab").forEach(function (b) { var on = b.dataset.t === t; b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    $$(".iv .pane").forEach(function (p) { p.hidden = p.id !== "pane-" + t; });
    if (t === "summary") renderSummary();
    if (t === "score") renderScore();
  }
  $$(".iv .tab").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.t); }); });
  $$("[data-goto]").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.goto); window.scrollTo(0, 0); }); });

  /* ---------- candidate practice mode (own device; employer tabs hidden; nothing leaves this page) ---------- */
  function setCandMode(on) {
    S.candMode = !!on;
    $("#ivApp").classList.toggle("iv-cand", S.candMode);
    $("#ivModeBtn").setAttribute("aria-pressed", S.candMode ? "true" : "false");
    $("#ivModeBtn").textContent = S.candMode ? T("iv.js.modeBack", "กลับไปโหมดผู้สัมภาษณ์") : T("iv.s.mode.cand", "โหมดฝึกซ้อมของผู้สมัคร (ใช้คนเดียว)");
    if (S.candMode) go("practice");
    else if (!$("#pane-practice").hidden) go("setup");
  }
  $("#ivModeBtn").addEventListener("click", function () { setCandMode(!S.candMode); window.scrollTo(0, 0); });

  /* ---------- jurisdiction: EU/EEA or regulated use hides emotion-like signals in employer flows ---------- */
  function syncRegion() {
    $("#ivRegion").value = S.region;
    $("#ivRegionState").textContent = S.region === "eu" ? T("iv.js.regEu", "โหมด EU/EEA เปิดอยู่: ไม่แสดงสัญญาณความตื่นเต้นที่สังเกตได้ในขั้นตอนของนายจ้าง ผู้สมัครยังดูได้ในโหมดฝึกซ้อมของตัวเอง")
      : T("iv.js.regTh", "โหมดทั่วไป: สัญญาณความตื่นเต้นที่สังเกตได้แสดงเป็นข้อสังเกตพร้อมข้อจำกัดทางวิทยาศาสตร์ เฉพาะเมื่อผู้สมัครยินยอม");
    $("#ivDRegionNote").hidden = S.region !== "eu";
  }
  $("#ivRegion").addEventListener("change", function () {
    S.region = $("#ivRegion").value === "eu" ? "eu" : "th"; syncRegion();
    liveTiles(); if (S.delivery && !$("#ivDResBody").hidden) renderResultBody(); renderSumDelivery();
  });

  /* ---------- setup ---------- */
  function renderComps() {
    $("#ivComps").innerHTML = IV.COMP_IDS.map(function (id) {
      return '<label class="check comp"><input type="checkbox" value="' + id + '"' + (S.comps.indexOf(id) >= 0 ? " checked" : "") + "> <span>" + esc(cName(id)) + "</span></label>";
    }).join("");
  }
  $("#ivComps").addEventListener("change", function () {
    S.comps = $$("#ivComps input:checked").map(function (i) { return i.value; });
    var preset = IV.ROLES[S.role].comps;
    if (S.role !== "custom" && preset.slice().sort().join() !== S.comps.slice().sort().join()) { S.role = "custom"; $("#ivRole").value = "custom"; }
    renderQuestions();
  });
  $("#ivRole").addEventListener("change", function () {
    S.role = $("#ivRole").value;
    if (S.role !== "custom") S.comps = IV.ROLES[S.role].comps.slice();
    renderComps(); renderQuestions();
  });
  $("#ivCand").addEventListener("input", function () { S.cand = $("#ivCand").value.replace(/[<>]/g, "").trim(); });
  function renderWho() {
    $("#ivWhoList").innerHTML = S.sheets.map(function (s, i) {
      return '<li><span class="who-n">' + esc(s.who) + '</span><span class="who-s">' + esc(s.submitted ? T("iv.js.submitted", "ส่งแล้ว") : T("iv.js.pending", "ยังไม่ส่ง")) +
        '</span><button type="button" class="who-del" data-i="' + i + '" aria-label="' + esc(T("iv.js.removeWho", "ลบ {n}", { n: s.who })) + '">×</button></li>';
    }).join("");
  }
  $("#ivWhoForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var n = $("#ivWho").value.replace(/[<>]/g, "").trim().slice(0, 40);
    if (!n) return;
    if (S.sheets.some(function (s) { return s.who === n; })) { toast(T("iv.js.dupWho", "มีชื่อนี้แล้ว")); return; }
    S.sheets.push({ who: n, scores: {}, notes: {}, consist: {}, submitted: false });
    if (S.cur < 0) S.cur = 0;
    $("#ivWho").value = ""; renderWho();
  });
  $("#ivWhoList").addEventListener("click", function (e) {
    var b = e.target.closest(".who-del"); if (!b) return;
    S.sheets.splice(+b.dataset.i, 1); S.cur = Math.min(S.cur, S.sheets.length - 1); renderWho();
  });
  function renderBias() {
    $("#ivBias").innerHTML = IV.BIASES.map(function (b) {
      return "<li><b>" + esc(T("iv.bias." + b.id + ".name", b.name)) + "</b> — " + esc(T("iv.bias." + b.id + ".tip", b.tip)) + "</li>";
    }).join("");
  }
  function renderLaw() {
    $("#ivLaw").innerHTML = IV.LAW.map(function (l) {
      return '<li><label class="check"><input type="checkbox" data-law="' + l.id + '"' + (S.law[l.id] ? " checked" : "") + "> <span><b>" + esc(T("iv.law." + l.id + ".topic", l.topic)) + "</b></span></label>" +
        '<p class="alt"><span>' + esc(T("iv.js.lawAlt", "ถามแทนว่า:")) + "</span> " + esc(T("iv.law." + l.id + ".alt", l.alt)) + '</p><p class="ref">' + esc(T("iv.law." + l.id + ".ref", l.ref)) + "</p></li>";
    }).join("");
    lawCount();
  }
  function lawCount() {
    var n = IV.LAW.filter(function (l) { return S.law[l.id]; }).length;
    $("#ivLawCount").textContent = T("iv.js.lawCount", "ทบทวนแล้ว {n}/{t} หัวข้อ", { n: n, t: IV.LAW.length });
  }
  $("#ivLaw").addEventListener("change", function (e) { var i = e.target.closest("[data-law]"); if (i) { S.law[i.dataset.law] = i.checked; lawCount(); } });
  /* 'questions you may not ask' guard: prompts a re-check (never blocks); also runs on evidence notes */
  function lawWarn(text) {
    var ids = IV.checkQuestion(text);
    if (!ids.length) return "";
    var names = ids.map(function (id) { var l = IV.LAW.filter(function (x) { return x.id === id; })[0]; return T("iv.law." + id + ".topic", l.topic); }).join(" · ");
    return T("iv.js.lawWarn", "อาจเกี่ยวกับหัวข้อที่ไม่ควรถามหรือใช้พิจารณา: {t} — ตัดออก หรือถามแทนด้วยคำถามที่เกี่ยวกับงาน (ดูรายการด้านบน)", { t: names });
  }
  function qCheck() {
    var v = $("#ivQCheck").value, w = lawWarn(v);
    $("#ivQCheckOut").textContent = w || (v.trim() ? T("iv.js.qcOk", "ไม่พบหัวข้อต้องห้ามจากคำสำคัญ — ยังควรตรวจว่าคำถามเกี่ยวกับงานจริง") : "");
  }
  $("#ivQCheck").addEventListener("input", qCheck);

  /* ---------- questions ---------- */
  function barsTable(id) {
    var lv = [[1, cTxt(id, "a1")], [2, T("iv.js.between", "ระหว่างระดับ 1 และ 3")], [3, cTxt(id, "a3")], [4, T("iv.js.between2", "ระหว่างระดับ 3 และ 5")], [5, cTxt(id, "a5")]];
    return '<ol class="bars">' + lv.map(function (x) { return '<li class="b' + x[0] + '"><b>' + x[0] + "</b><span>" + esc(x[1]) + "</span></li>"; }).join("") + "</ol>";
  }
  function renderQuestions() {
    $("#ivStar").innerHTML = IV.STAR_PROBES.map(function (p) { return "<li>" + esc(T("iv.star." + p.id, p.th)) + "</li>"; }).join("");
    $("#ivQList").innerHTML = S.comps.length ? S.comps.map(function (id, i) {
      return '<article class="card qcard" data-comp="' + id + '"><h2>' + (i + 1) + ". " + esc(cName(id)) + '</h2><p class="def">' + esc(cTxt(id, "def")) + "</p>" +
        '<div class="q"><span class="qk">' + esc(T("iv.js.qBeh", "คำถามเชิงพฤติกรรม (STAR)")) + "</span><p>" + esc(cTxt(id, "beh")) + "</p></div>" +
        '<div class="q"><span class="qk">' + esc(T("iv.js.qSit", "คำถามเชิงสถานการณ์")) + "</span><p>" + esc(cTxt(id, "sit")) + "</p></div>" +
        "<h3>" + esc(T("iv.js.barsH", "เกณฑ์ให้คะแนน (BARS)")) + "</h3>" + barsTable(id) + "</article>";
    }).join("") : '<p class="empty">' + esc(T("iv.js.noComps", "ยังไม่ได้เลือกสมรรถนะ")) + "</p>";
  }

  /* ---------- scoring ---------- */
  var allSubmitted = function () { return S.sheets.length > 0 && S.sheets.every(function (s) { return s.submitted; }); };
  function renderScore() {
    var has = S.sheets.length > 0;
    $("#ivScEmpty").hidden = has; $("#ivSheetActions").hidden = !has;
    $("#ivWhoSeg").innerHTML = S.sheets.map(function (s, i) {
      return '<button type="button" data-i="' + i + '" aria-pressed="' + (i === S.cur) + '">' + esc(s.who) + (s.submitted ? " ✓" : "") + "</button>";
    }).join("");
    if (!has) { $("#ivSheet").innerHTML = ""; return; }
    var sh = S.sheets[S.cur], lock = sh.submitted;
    $("#ivSheet").innerHTML = S.comps.map(function (id) {
      var v = sh.scores[id];
      return '<fieldset class="rate" data-comp="' + id + '"' + (lock ? " disabled" : "") + "><legend>" + esc(cName(id)) + "</legend>" +
        '<div class="nums" role="radiogroup" aria-label="' + esc(T("iv.js.rateAria", "คะแนน {c}", { c: cName(id) })) + '">' +
        [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" role="radio" data-v="' + n + '" aria-checked="' + (v === n) + '" title="' + esc(n === 1 ? cTxt(id, "a1") : n === 3 ? cTxt(id, "a3") : n === 5 ? cTxt(id, "a5") : "") + '">' + n + "</button>"; }).join("") +
        '</div><p class="anchor">' + esc(v === 1 ? cTxt(id, "a1") : v === 3 ? cTxt(id, "a3") : v === 5 ? cTxt(id, "a5") : v ? T("iv.js.betweenShort", "อยู่ระหว่างระดับที่บรรยายไว้") : "") + "</p>" +
        '<label class="field"><span>' + esc(T("iv.js.evidence", "หลักฐาน: ผู้สมัครเล่าว่าทำอะไร ผลเป็นอย่างไร")) + '</span><textarea rows="2" maxlength="2000" data-note="' + id + '">' + esc(sh.notes[id] || "") + "</textarea></label>" +
        '<p class="law-warn" data-warn="' + id + '" role="status">' + esc(lawWarn(sh.notes[id])) + "</p></fieldset>";
    }).join("") + consistHtml(sh, lock);
    $("#ivSubmit").hidden = lock; $("#ivUnlock").hidden = !lock;
    $("#ivScMsg").textContent = lock ? T("iv.js.locked", "{n} ส่งคะแนนแล้ว", { n: sh.who }) : "";
  }
  $("#ivWhoSeg").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { S.cur = +b.dataset.i; renderScore(); } });
  $("#ivSheet").addEventListener("click", function (e) {
    var b = e.target.closest(".nums button"); if (!b) return;
    var sh = S.sheets[S.cur]; if (!sh || sh.submitted) return;
    var id = b.closest("[data-comp]").dataset.comp, v = +b.dataset.v;
    sh.scores[id] = sh.scores[id] === v ? null : v;
    renderScore();
  });
  $("#ivSheet").addEventListener("input", function (e) {
    var t = e.target.closest("[data-note]"); if (!t || !S.sheets[S.cur]) return;
    S.sheets[S.cur].notes[t.dataset.note] = t.value;
    var w = $('#ivSheet [data-warn="' + t.dataset.note + '"]'); if (w) w.textContent = lawWarn(t.value);
  });
  /* answer consistency — the interviewer's own observation, NOT a judgement and never a true/false score */
  var CS_OPTS = [["", "iv.js.csNone", "ไม่ได้สังเกต"], ["yes", "iv.js.csYes", "เห็นชัด"], ["ask", "iv.js.csAsk", "ควรถามเพิ่ม / ตรวจสอบ"]];
  function consistHtml(sh, lock) {
    var cs = sh.consist || {};
    return '<fieldset class="rate consist"' + (lock ? " disabled" : "") + "><legend>" + esc(T("iv.js.csH", "ความสอดคล้องของคำตอบ (ข้อสังเกต ไม่ใช่การตัดสิน)")) + "</legend>" +
      '<p class="hint">' + esc(T("iv.js.csHint", "บันทึกสิ่งที่คุณสังเกตเอง ไม่มีคะแนนจริง/เท็จ และไม่รวมในคะแนนสมรรถนะ — \"ควรถามเพิ่ม\" หมายถึงถามเจาะหรือตรวจสอบบุคคลอ้างอิง ไม่ใช่ข้อสรุปว่าผู้สมัครพูดไม่จริง")) + "</p>" +
      IV.CONSIST.map(function (c) {
        return '<label class="field"><span>' + esc(T("iv.cs." + c.id, c.th)) + '</span><select data-consist="' + c.id + '">' +
          CS_OPTS.map(function (o) { return '<option value="' + o[0] + '"' + ((cs[c.id] || "") === o[0] ? " selected" : "") + ">" + esc(T(o[1], o[2])) + "</option>"; }).join("") + "</select></label>";
      }).join("") + "</fieldset>";
  }
  $("#ivSheet").addEventListener("change", function (e) {
    var t = e.target.closest("[data-consist]"), sh = S.sheets[S.cur]; if (!t || !sh || sh.submitted) return;
    sh.consist = sh.consist || {};
    if (t.value === "yes" || t.value === "ask") sh.consist[t.dataset.consist] = t.value; else delete sh.consist[t.dataset.consist];
  });
  $("#ivSubmit").addEventListener("click", function () {
    var sh = S.sheets[S.cur]; if (!sh) return;
    var missing = S.comps.filter(function (id) { return !IV.validScore(sh.scores[id]); });
    if (missing.length && !confirm(T("iv.js.missingQ", "ยังไม่ได้ให้คะแนน {n} สมรรถนะ ส่งเลยหรือไม่", { n: missing.length }))) return;
    sh.submitted = true; renderScore(); renderWho();
    toast(allSubmitted() ? T("iv.js.allIn", "ทุกคนส่งคะแนนแล้ว — ดูสรุปได้") : T("iv.js.sent", "ส่งคะแนนแล้ว"));
  });
  $("#ivUnlock").addEventListener("click", function () { var sh = S.sheets[S.cur]; if (sh) { sh.submitted = false; renderScore(); renderWho(); } });
  $("#ivExport").addEventListener("click", function () {
    var sh = S.sheets[S.cur]; if (!sh) { $("#ivExMsg").textContent = T("iv.s.sc.empty", "เพิ่มผู้สัมภาษณ์ในขั้นตั้งค่าก่อน"); return; }
    $("#ivExportOut").value = IV.exportSheet(sh, { role: S.role }); $("#ivExportOut").select();
    $("#ivExMsg").textContent = T("iv.js.exported", "คัดลอกข้อความนี้ส่งให้ผู้ประสานการสัมภาษณ์");
  });
  $("#ivImport").addEventListener("click", function () {
    try {
      var s = IV.importSheet($("#ivImportIn").value, S.comps);
      s.submitted = true;
      var i = S.sheets.findIndex(function (x) { return x.who === s.who; });
      if (i >= 0) S.sheets[i] = s; else S.sheets.push(s);
      if (S.cur < 0) S.cur = 0;
      $("#ivImportIn").value = ""; $("#ivExMsg").textContent = T("iv.js.imported", "นำเข้าคะแนนของ {n} แล้ว", { n: s.who });
      renderWho(); renderScore();
    } catch (e) { $("#ivExMsg").textContent = T("iv.js.importBad", "ข้อความคะแนนไม่ถูกต้อง"); }
  });

  /* ---------- summary ---------- */
  var AGREE = { high: ["iv.js.agHigh", "สอดคล้อง"], some: ["iv.js.agSome", "ต่างกันบ้าง"], low: ["iv.js.agLow", "ควรหารือ"] };
  function evidenceList(c) {
    var notes = c.scores.filter(function (r) { return r.note; });
    return notes.length ? '<ul class="ev">' + notes.map(function (r) { return "<li><b>" + esc(r.who) + (r.score ? " (" + r.score + ")" : "") + ":</b> " + esc(r.note) + "</li>"; }).join("") + "</ul>"
      : '<p class="hint">' + esc(T("iv.js.noEvidence", "ยังไม่มีหลักฐานที่จดไว้")) + "</p>";
  }
  function renderSummary() {
    var ready = allSubmitted() || S.reveal;
    $("#ivSumMeta").textContent = T("iv.js.meta", "ตำแหน่ง: {r} · ผู้สมัคร: {c} · ผู้สัมภาษณ์ {n} คน · {d}",
      { r: T("iv.r." + S.role, IV.ROLES[S.role].name), c: S.cand || "—", n: S.sheets.length, d: new Date().toLocaleDateString(({ zh: "zh-CN", en: "en-GB" })[String(window.LQI18N && window.LQI18N.lang)] || "th-TH") });
    $("#ivSumWait").hidden = ready; $("#ivSumBody").hidden = !ready;
    if (!ready) {
      var left = S.sheets.filter(function (s) { return !s.submitted; }).map(function (s) { return s.who; });
      $("#ivSumWaitT").textContent = S.sheets.length ? T("iv.js.waiting", "รอคะแนนจาก: {w} — ควรรอให้ทุกคนส่งก่อนดูสรุป เพื่อไม่ให้คะแนนของคนอื่นมีผล", { w: left.join(", ") }) : T("iv.s.sc.empty", "เพิ่มผู้สัมภาษณ์ในขั้นตั้งค่าก่อน");
      $("#ivReveal").hidden = !S.sheets.length;
      return;
    }
    var A = IV.aggregate(S.sheets, S.comps); S.lastAgg = A;
    $("#ivSumTiles").innerHTML = [
      [A.overall.rated + "/" + S.comps.length, T("iv.js.tRated", "สมรรถนะที่มีคะแนน")],
      [A.overall.agreePct == null ? "—" : A.overall.agreePct + "%", T("iv.js.tAgree", "สมรรถนะที่ความเห็นสอดคล้อง")],
      [A.overall.mean == null ? "—" : A.overall.mean.toFixed(2), T("iv.js.tMean", "ค่าเฉลี่ย (ประกอบการหารือ ไม่ใช่เกณฑ์ตัดสิน)")]
    ].map(function (x) { return '<div class="tile"><b>' + esc(x[0]) + '</b><span class="k">' + esc(x[1]) + "</span></div>"; }).join("");
    var head = "<thead><tr><th scope=\"col\">" + esc(T("iv.js.thComp", "สมรรถนะ")) + "</th>" + S.sheets.map(function (s) { return '<th scope="col">' + esc(s.who) + "</th>"; }).join("") +
      '<th scope="col">' + esc(T("iv.js.thMean", "เฉลี่ย")) + '</th><th scope="col">' + esc(T("iv.js.thRange", "ห่างกัน")) + '</th><th scope="col">' + esc(T("iv.js.thAgree", "ความสอดคล้อง")) + "</th></tr></thead>";
    var body = "<tbody>" + A.comps.map(function (c) {
      return '<tr data-comp="' + c.id + '"><th scope="row">' + esc(cName(c.id)) + "</th>" + S.sheets.map(function (s) { var v = s.scores[c.id]; return "<td>" + (IV.validScore(v) ? v : "—") + "</td>"; }).join("") +
        "<td>" + (c.mean == null ? "—" : c.mean.toFixed(1)) + "</td><td>" + (c.range == null ? "—" : c.range) + '</td><td><span class="ag ' + (c.agree || "na") + '">' +
        esc(c.agree ? T(AGREE[c.agree][0], AGREE[c.agree][1]) : T("iv.js.agNa", "ผู้ให้คะแนนไม่ถึง 2 คน")) + "</span></td></tr>";
    }).join("") + "</tbody>";
    $("#ivSumTable").innerHTML = head + body;
    var byId = {}; A.comps.forEach(function (c) { byId[c.id] = c; });
    var li = function (ids, empty) {
      return ids.length ? ids.map(function (id) { var c = byId[id]; return "<li><b>" + esc(cName(id)) + "</b> " + esc(T("iv.js.meanOf", "(เฉลี่ย {m})", { m: c.mean == null ? "—" : c.mean.toFixed(1) })) + evidenceList(c) + "</li>"; }).join("")
        : '<li class="hint">' + esc(empty) + "</li>";
    };
    $("#ivStr").innerHTML = li(A.strengths, T("iv.js.noStr", "ไม่มีสมรรถนะที่เฉลี่ยตั้งแต่ 4 และความเห็นสอดคล้อง"));
    $("#ivDev").innerHTML = li(A.develop, T("iv.js.noDev", "ไม่มีสมรรถนะที่เฉลี่ยไม่เกิน 2.5"));
    $("#ivDis").innerHTML = li(A.discuss, T("iv.js.noDis", "ไม่มี — คะแนนของทุกสมรรถนะห่างกันไม่เกิน 2"));
    $("#ivSumEarly").hidden = allSubmitted();
    renderSpread(); renderConsist();
    renderSumDelivery();
  }
  /* interviewer score-spread flag: a calibration prompt before discussion, not a fault-finding tool */
  var SPREAD = { lenient: ["iv.js.spLen", "ให้คะแนนสูงกว่าผู้สัมภาษณ์คนอื่นเฉลี่ย {d} คะแนน"], severe: ["iv.js.spSev", "ให้คะแนนต่ำกว่าผู้สัมภาษณ์คนอื่นเฉลี่ย {d} คะแนน"],
    narrow: ["iv.js.spNar", "ให้คะแนนเท่ากันทุกสมรรถนะ ({n} ข้อ) — ลองเทียบกับคำบรรยายพฤติกรรมแต่ละระดับอีกครั้ง"] };
  function renderSpread() {
    var rows = IV.raterSpread(S.sheets, S.comps).filter(function (r) { return r.flag; });
    $("#ivSumSpread").innerHTML = "<h3>" + esc(T("iv.js.spH", "การกระจายของคะแนนรายผู้สัมภาษณ์")) + '</h3><p class="hint">' + esc(T("iv.js.spHint", "ใช้ปรับมาตรฐานร่วมกันก่อนหารือ ให้แต่ละคนเล่าหลักฐานที่ใช้ ไม่ใช่การจับผิดผู้สัมภาษณ์")) + "</p>" +
      (S.sheets.length < 2 ? '<p class="hint">' + esc(T("iv.js.spNeed", "ต้องมีผู้สัมภาษณ์อย่างน้อย 2 คน")) + "</p>" :
        rows.length ? '<ul>' + rows.map(function (r) { return '<li data-spread="' + r.flag + '"><b>' + esc(r.who) + ":</b> " + esc(T(SPREAD[r.flag][0], SPREAD[r.flag][1], { d: r.dev == null ? "—" : Math.abs(r.dev).toFixed(1), n: r.n })) + "</li>"; }).join("") + "</ul>"
          : '<p class="hint">' + esc(T("iv.js.spNone", "ไม่พบผู้สัมภาษณ์ที่ให้คะแนนต่างจากคนอื่นอย่างเด่นชัด")) + "</p>");
  }
  function renderConsist() {
    var C = IV.consistency(S.sheets);
    var name = function (id) { var c = IV.CONSIST.filter(function (x) { return x.id === id; })[0]; return T("iv.cs." + id, c.th); };
    $("#ivSumConsist").innerHTML = "<h3>" + esc(T("iv.js.csH", "ความสอดคล้องของคำตอบ (ข้อสังเกต ไม่ใช่การตัดสิน)")) + "</h3>" +
      (C.observed ? "<ul>" + C.items.filter(function (i) { return i.n; }).map(function (i) { return '<li data-cs="' + i.id + '"><b>' + esc(name(i.id)) + ":</b> " + esc(T("iv.js.csCount", "เห็นชัด {y} · ควรถามเพิ่ม {a}", { y: i.yes, a: i.ask })) + "</li>"; }).join("") + "</ul>" +
        (C.followUp.length ? '<p class="hint">' + esc(T("iv.js.csFollow", "หัวข้อที่ควรถามเพิ่มหรือตรวจสอบ (เช่น บุคคลอ้างอิง): {t}", { t: C.followUp.map(name).join(" · ") })) + "</p>" : "")
        : '<p class="hint">' + esc(T("iv.js.csEmpty", "ยังไม่มีผู้สัมภาษณ์บันทึกข้อสังเกตนี้")) + "</p>") +
      '<p class="sci">' + esc(T("iv.js.sci", SCI_TH)) + "</p>";
  }
  /* interviewer-side delivery notes: only with the organisation setting (3 acknowledgements) AND after every
     interviewer has submitted (IVCore.deliveryView) — never before scoring, so the numbers cannot anchor the scores */
  var dView = function () { return IV.deliveryView({ org: S.org, delivery: S.delivery, submitted: allSubmitted() }); };
  function renderSumDelivery() {
    var v = dView(), box = $("#ivSumDelivery");
    $("#ivSumDNote").hidden = v !== "pending";
    $("#ivIncWrap").hidden = v !== "interviewer";
    if (v !== "interviewer") $("#ivIncDelivery").checked = false;
    var on = v === "interviewer" && $("#ivIncDelivery").checked;
    box.hidden = !on;
    box.innerHTML = on ? "<h3>" + esc(T("iv.js.sumDH", "ข้อสังเกตการนำเสนอ (ไม่ใช่การประเมินตัวบุคคล และไม่ใช้ให้คะแนน)")) + "</h3>" + tilesHtml(S.delivery.d, S.delivery.g) + signalsHtml(S.delivery.d, S.delivery.g, "employer") +
      '<p class="acc">' + esc(T("iv.s.acc", ACC_TH)) + "</p>" : "";
  }
  var ACC_TH = "การปรับให้เหมาะสม: ผู้สมัครที่มีความพิการ มีความหลากหลายทางระบบประสาท (เช่น ออทิสติก สมาธิสั้น) ใช้ภาษาที่สอง หรือมาจากวัฒนธรรมที่ไม่นิยมสบตา อาจได้ตัวเลขต่างไป กล้อง แสง และอุปกรณ์ก็มีผล — เสนอรูปแบบอื่นและปรับวิธีสัมภาษณ์ตามที่ผู้สมัครขอ และอย่าตีความตัวเลขเป็นความสามารถ";
  $("#ivReveal").addEventListener("click", function () { S.reveal = true; renderSummary(); });
  $("#ivIncDelivery").addEventListener("change", renderSumDelivery);
  $("#ivPrint").addEventListener("click", function () { go("summary"); window.print(); });
  $("#ivClear").addEventListener("click", function () {
    if (!confirm(T("iv.js.clearQ", "ลบคะแนน หลักฐาน และข้อสังเกตทั้งหมดของการสัมภาษณ์นี้หรือไม่"))) return;
    S.sheets = []; S.cur = -1; S.reveal = false; S.cand = ""; S.delivery = null; $("#ivCand").value = "";
    resetResultCard(); renderWho(); renderSummary(); toast(T("iv.js.cleared", "ล้างข้อมูลแล้ว"));
  });

  /* ---------- delivery meter (camera + mic; numbers only) ---------- */
  var FAKE = !!(window.LQDetect && LQDetect.isTest());
  var modelsP = null;
  function loadModels() {
    if (FAKE) return Promise.resolve("fake");
    if (!modelsP) modelsP = LQDetect.tfBackend().then(function (b) {
      return Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri("vendor/models/"), faceapi.nets.faceLandmark68Net.loadFromUri("vendor/models/")]).then(function () { return b; });
    }).catch(function (e) { modelsP = null; throw e; });
    return modelsP;
  }
  async function detect(video) {
    var W = video.videoWidth, H = video.videoHeight;
    if (FAKE) {
      return (LQDetect.fake("c1", performance.now()) || []).map(function (d) {
        var box = { x: d.x * W, y: d.y * H, w: d.w * W, h: d.h * H };
        return { box: box, pts: IV.synthPts(box, d.yaw || 0) };
      });
    }
    var rs = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 })).withFaceLandmarks();
    return rs.map(function (r) { var b = r.detection.box; return { box: { x: b.x, y: b.y, w: b.width, h: b.height }, pts: r.landmarks.positions.map(function (p) { return [p.x, p.y]; }) }; });
  }
  function createMeter(video, overlay) {
    var cam = LQCam.create(video, { facing: "user", ideal: { width: 640, height: 480 } });
    var m = { cam: cam, vad: IV.createVad(), samples: [], running: false, audio: null, mic: null, hasMic: false, hasCam: false, timer: null };
    m.reset = function () { m.vad.reset(); m.samples = []; };
    m.snapshot = function () { return { d: m.hasMic ? m.vad.result() : null, g: m.hasCam ? IV.gazeMetrics(m.samples) : null }; };
    m.start = async function () {
      m.reset(); m.running = true;
      var errs = [], gen = (m.gen = (m.gen || 0) + 1);
      // camera and microphone open independently: a microphone that is slow to answer (permission prompt, busy audio
      // device) never blocks the camera; it attaches whenever it arrives — or is released if the session already ended
      var attachMic = async function (stream) {
        if (!m.running || gen !== m.gen) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        m.mic = stream;
        var AC = window.AudioContext || window.webkitAudioContext;
        m.audio = new AC();
        if (m.audio.state === "suspended") await Promise.race([m.audio.resume(), sleep(2000)]);
        var src = m.audio.createMediaStreamSource(stream), an = m.audio.createAnalyser(); an.fftSize = 1024; src.connect(an);
        var buf = new Float32Array(an.fftSize);
        m.timer = setInterval(function () { an.getFloatTimeDomainData(buf); m.vad.push(IV.rmsDb(buf), performance.now()); }, 20);
        m.hasMic = true;
      };
      var micP = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }, video: false })
        .then(attachMic).catch(function (e) { errs.push(e); });
      try { await Promise.all([cam.start(), loadModels()]); m.hasCam = true; } catch (e) { errs.push(e); }
      await Promise.race([micP, sleep(m.hasCam ? 8000 : 20000)]);
      if (!m.hasCam && !m.hasMic) { m.running = false; throw errs[0] || new Error("no media"); }
      if (m.hasCam) loop();
      return errs;
    };
    async function loop() {
      var ctx = overlay.getContext("2d");
      while (m.running && cam.active) {
        if (video.videoWidth) {
          try {
            if (overlay.width !== video.videoWidth) { overlay.width = video.videoWidth; overlay.height = video.videoHeight; }
            var list = await detect(video), t = performance.now();
            list.sort(function (a, b) { return b.box.w * b.box.h - a.box.w * a.box.h; });
            var d = list[0], p = d ? IV.poseOf(d.pts) : null;
            m.samples.push(p ? { t: t, face: true, yaw: p.yaw, pitch: p.pitch, cx: p.cx, cy: p.cy, ipd: p.ipd } : { t: t, face: false });
            if (m.samples.length > 20000) m.samples.splice(0, 5000);
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            if (d) { ctx.strokeStyle = "#22d3ee"; ctx.lineWidth = 3; ctx.strokeRect(d.box.x, d.box.y, d.box.w, d.box.h); }
            if (m.onTick) m.onTick();
          } catch (e) { console.warn(e); }
        }
        await sleep(250);
      }
    }
    m.stop = function () {
      var snap = m.snapshot();
      m.running = false; m.gen = (m.gen || 0) + 1; clearInterval(m.timer); m.timer = null;
      try { cam.stop(); } catch (e) { /* ignore */ }
      if (m.mic) m.mic.getTracks().forEach(function (t) { t.stop(); });
      if (m.audio) m.audio.close().catch(function () {});
      m.mic = null; m.audio = null; m.hasCam = m.hasMic = false;
      overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
      return snap;
    };
    return m;
  }
  var BAND = { low: ["iv.js.bLow", "น้อย"], mid: ["iv.js.bMid", "ปานกลาง"], high: ["iv.js.bHigh", "มาก"] };
  /* observable signs of excitement — descriptive behaviour with the scientific caveat; flow 'employer' | 'practice' */
  var SCI_TH = "ข้อจำกัดทางวิทยาศาสตร์: ท่าทางและสีหน้าไม่ได้บอกอารมณ์ภายในอย่างน่าเชื่อถือ และต่างกันตามบุคคลและวัฒนธรรม (Barrett และคณะ, 2019) ส่วนคนทั่วไปแยกคำพูดจริงกับไม่จริงได้ถูกเพียงราว 54% ใกล้เคียงการเดา (Bond & DePaulo, 2006)";
  function signalsHtml(d, g, flow) {
    if (!IV.signalsAllowed(S.region, flow)) return '<p class="hint sig-off">' + esc(T("iv.js.sigOff", "โหมด EU/EEA: ไม่แสดงสัญญาณความตื่นเต้นที่สังเกตได้ในขั้นตอนของนายจ้าง (EU AI Act มาตรา 5(1)(f)) — ผู้สมัครดูได้ในโหมดฝึกซ้อมของตัวเอง")) + "</p>";
    var x = IV.excitementSignals(d, g); if (!x.available) return "";
    return '<div class="sig" data-seen="' + x.seen + '"><h4>' + esc(T("iv.js.sigH", "สัญญาณความตื่นเต้นที่สังเกตได้ (ข้อสังเกต ไม่ใช่การอ่านอารมณ์)")) + "</h4><ul>" +
      x.items.map(function (i) { return '<li class="' + (i.seen ? "seen" : "no") + '" data-sig="' + i.id + '">' + esc(T("iv.sig." + i.id, IV.SIGNALS[i.id], i.vars)) + " — " + esc(i.seen ? T("iv.js.sigSeen", "สังเกตเห็น") : T("iv.js.sigNot", "ไม่เด่น")) + "</li>"; }).join("") +
      '</ul><p class="hint">' + esc(T("iv.js.sigNote", "ความตื่นเต้นเป็นเรื่องปกติในการสัมภาษณ์ ไม่ได้บอกความสามารถ ความตั้งใจ หรือว่าคำตอบจริงหรือไม่ และห้ามใช้ให้คะแนน")) + '</p><p class="sci">' + esc(T("iv.js.sci", SCI_TH)) + "</p></div>";
  }
  function tilesHtml(d, g) {
    var t = [];
    if (g) {
      t.push([g.facePct + "%", T("iv.js.dFace", "เวลาที่เห็นใบหน้า")]);
      t.push([g.towardPct + "%", T("iv.js.dToward", "หันหน้าเข้าหากล้อง (ประมาณจากทิศทางศีรษะ)")]);
      t.push([g.movementBand ? T(BAND[g.movementBand][0], BAND[g.movementBand][1]) : "—", T("iv.js.dMove", "การขยับศีรษะ")]);
    }
    if (d) {
      t.push([Math.round(d.share * 100) + "%", T("iv.js.dSpeak", "สัดส่วนเวลาที่มีเสียงพูด")]);
      t.push([String(d.pauses), T("iv.js.dPauses", "ช่วงหยุด ≥ 0.5 วินาที")]);
      t.push([d.pauses ? (d.meanPauseMs / 1000).toFixed(1) + " s" : "—", T("iv.js.dPauseLen", "ความยาวช่วงหยุดเฉลี่ย")]);
      t.push([d.peakRate == null ? "—" : d.peakRate.toFixed(1) + "/s", T("iv.js.dPace", "จังหวะเสียงโดยประมาณ (ยอดพลังงานต่อวินาที)")]);
    }
    if (!t.length) return '<p class="hint">' + esc(T("iv.js.dNone", "ยังไม่มีข้อมูล")) + "</p>";
    return '<div class="tiles">' + t.map(function (x) { return '<div class="tile"><b>' + esc(x[0]) + '</b><span class="k">' + esc(x[1]) + "</span></div>"; }).join("") + "</div>";
  }
  function mediaErr(e) {
    var k = window.LQCam && LQCam.errorKind ? LQCam.errorKind(e) : "unknown";
    return k === "denied" ? T("iv.js.eDenied", "ไม่ได้รับอนุญาตให้ใช้กล้อง/ไมโครโฟน") : k === "insecure" ? T("iv.js.eHttps", "ต้องเปิดหน้านี้ผ่าน https:// หรือ localhost") :
      k === "notfound" ? T("iv.js.eNone", "ไม่พบกล้องหรือไมโครโฟน") : T("iv.js.eFail", "เปิดกล้อง/ไมโครโฟนไม่ได้: {m}", { m: (e && (e.message || e.name)) || "" });
  }

  /* organisation setting: interviewer viewing stays OFF unless all three acknowledgements are ticked */
  function syncOrg() {
    S.org.ack1 = $("#ivAck1").checked; S.org.ack2 = $("#ivAck2").checked; S.org.ack3 = $("#ivAck3").checked;
    var acks = S.org.ack1 && S.org.ack2 && S.org.ack3;
    $("#ivOrgAllow").disabled = !acks;
    if (!acks) $("#ivOrgAllow").checked = false;
    S.org.allow = $("#ivOrgAllow").checked;
    var on = IV.orgAllowed(S.org);
    $("#ivOrgState").textContent = on ? T("iv.js.orgOn", "เปิดอยู่: ผู้สัมภาษณ์จะเห็นข้อสังเกตหลังทุกคนส่งคะแนนแล้วเท่านั้น และผู้สมัครได้รับแจ้งในหน้ายินยอม")
      : acks ? T("iv.js.orgReady", "ปิดอยู่ (ค่าเริ่มต้น) — ยืนยันครบแล้ว เปิดได้ถ้าจำเป็น") : T("iv.js.orgOff", "ปิดอยู่ (ค่าเริ่มต้น) — ต้องยืนยันครบทั้งสามข้อก่อนจึงจะเปิดได้");
    $("#ivDOrgNote").hidden = !on;
    renderSumDelivery();
  }
  ["#ivAck1", "#ivAck2", "#ivAck3", "#ivOrgAllow"].forEach(function (s) { $(s).addEventListener("change", syncOrg); });

  /* delivery observation (interview): numbers are the candidate's */
  var dMeter = null;
  function resetResultCard() {
    $("#ivDResult").hidden = !S.delivery; $("#ivDResBody").hidden = true; $("#ivDOpen").hidden = !S.delivery;
    $("#ivDResTiles").innerHTML = ""; $("#ivDResTips").innerHTML = "";
  }
  function renderResultBody() {
    var d = S.delivery; if (!d) return;
    $("#ivDResTiles").innerHTML = tilesHtml(d.d, d.g) + signalsHtml(d.d, d.g, "employer");
    $("#ivDResTips").innerHTML = IV.practiceTips(d.d, d.g).map(function (t) { return '<li class="' + t.level + '" data-tip="' + t.id + '">' + esc(T("iv.tip." + t.id, TIPS[t.id], t.vars)) + "</li>"; }).join("");
  }
  var syncConsent = function () { $("#ivDStart").disabled = !($("#ivCOk1").checked && $("#ivCOk2").checked); };
  $("#ivCOk1").addEventListener("change", syncConsent); $("#ivCOk2").addEventListener("change", syncConsent);
  $("#ivDDecline").addEventListener("click", function () {
    $("#ivCOk1").checked = $("#ivCOk2").checked = false; syncConsent();
    $("#ivDMsg").textContent = T("iv.js.declined", "บันทึกว่าไม่ใช้กล้อง — ดำเนินการสัมภาษณ์ตามปกติ การปฏิเสธไม่มีผลต่อการพิจารณา");
  });
  $("#ivDStart").addEventListener("click", async function () {
    if (!($("#ivCOk1").checked && $("#ivCOk2").checked)) return;
    $("#ivDStart").disabled = true; $("#ivDMsg").textContent = T("iv.js.opening", "กำลังเปิดกล้องและไมโครโฟน...");
    dMeter = dMeter || createMeter($("#ivDVideo"), $("#ivDOverlay"));
    try {
      var errs = await dMeter.start();
      $("#ivDMsg").textContent = errs.length ? mediaErr(errs[0]) : "";
      $("#ivConsent").hidden = true; $("#ivDLive").hidden = false;
      $("#ivDEngine").textContent = T("iv.js.live", "กำลังวัด — ตัวเลขซ่อนจากผู้สัมภาษณ์ ไม่มีการบันทึกภาพหรือเสียง");
      setCandView(false);
      dMeter.onTick = liveTiles;
      clearInterval(dMeter.ui); dMeter.ui = setInterval(liveTiles, 1000);
    } catch (e) { $("#ivDMsg").textContent = mediaErr(e); syncConsent(); }
  });
  /* live numbers are rendered ONLY while the candidate view is open (otherwise not even in the DOM) */
  function setCandView(on) {
    $("#ivDCandView").hidden = !on; $("#ivDCandBtn").setAttribute("aria-pressed", on ? "true" : "false");
    $("#ivDCandBtn").textContent = on ? T("iv.js.candHide", "ซ่อนตัวเลข (หันจอกลับ)") : T("iv.s.d.candBtn", "มุมมองผู้สมัคร: แสดงตัวเลขสด");
    liveTiles();
  }
  function liveTiles() {
    if (!dMeter || $("#ivDCandView").hidden) { $("#ivDTiles").innerHTML = ""; return; }
    var s = dMeter.snapshot(); $("#ivDTiles").innerHTML = tilesHtml(s.d, s.g) + signalsHtml(s.d, s.g, "employer");
  }
  $("#ivDCandBtn").addEventListener("click", function () { setCandView($("#ivDCandView").hidden); });
  $("#ivDStop").addEventListener("click", function () {
    if (!dMeter) return;
    clearInterval(dMeter.ui); dMeter.onTick = null;
    S.delivery = dMeter.stop(); S.delivery.kept = false;
    setCandView(false);
    $("#ivDLive").hidden = true; $("#ivConsent").hidden = false;
    $("#ivCOk1").checked = $("#ivCOk2").checked = false; syncConsent();
    resetResultCard(); $("#ivDResState").textContent = "";
    renderSumDelivery();
  });
  $("#ivDOpen").addEventListener("click", function () { $("#ivDOpen").hidden = true; renderResultBody(); $("#ivDResBody").hidden = false; });
  $("#ivDKeep").addEventListener("click", function () {
    if (!S.delivery) return;
    S.delivery.kept = true;
    document.documentElement.classList.add("iv-print-fb");
    try { window.print(); } finally { document.documentElement.classList.remove("iv-print-fb"); }
    var keepForTeam = IV.orgAllowed(S.org);
    if (!keepForTeam) S.delivery = null; // the candidate has their copy; nothing stays for the interviewers
    resetResultCard(); $("#ivDResult").hidden = false; $("#ivDOpen").hidden = true;
    $("#ivDResState").textContent = keepForTeam ? T("iv.js.keptOrg", "ผู้สมัครเก็บผลแล้ว — ตามการตั้งค่าองค์กร ผู้สัมภาษณ์จะดูได้หลังส่งคะแนนครบ (ไม่ใช้ให้คะแนน)")
      : T("iv.js.kept", "ผู้สมัครเก็บผลแล้ว — ลบตัวเลขออกจากหน้านี้แล้ว ผู้สัมภาษณ์ไม่เห็นข้อมูลนี้");
    renderSumDelivery();
  });
  $("#ivDDiscard").addEventListener("click", function () {
    S.delivery = null; resetResultCard(); $("#ivDResult").hidden = false; $("#ivDOpen").hidden = true;
    $("#ivDResState").textContent = T("iv.js.discarded", "ทิ้งผลแล้ว — ไม่มีใครเห็นตัวเลขนี้อีก");
    renderSumDelivery();
  });

  /* ---------- practice mode ---------- */
  var P = { qs: [], i: 0, phase: "idle", t0: 0, limit: 120, timer: null, meter: null, results: [] };
  var PREP = 20;
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  function pRender() {
    var q = P.qs[P.i]; if (!q) return;
    $("#ivPCount").textContent = T("iv.js.pCount", "ข้อ {i}/{n}", { i: P.i + 1, n: P.qs.length });
    $("#ivPComp").textContent = cName(q.comp) + " · " + (q.kind === "beh" ? T("iv.js.qBeh", "คำถามเชิงพฤติกรรม (STAR)") : T("iv.js.qSit", "คำถามเชิงสถานการณ์"));
    $("#ivPQ").textContent = cTxt(q.comp, q.kind);
    $("#ivPPhase").textContent = P.phase === "prep" ? T("iv.js.pPrep", "เตรียมตัว") : P.phase === "answer" ? T("iv.js.pAnswer", "กำลังตอบ") : T("iv.js.pReview", "ทบทวน");
    $("#ivPNext").hidden = P.phase === "review";
    $("#ivPNext").textContent = P.phase === "prep" ? T("iv.js.pReady", "เริ่มตอบเลย") : T("iv.s.p.done", "ตอบเสร็จแล้ว");
  }
  function pTick() {
    var el = (performance.now() - P.t0) / 1000;
    if (P.phase === "prep") { $("#ivPTimer").textContent = fmt(PREP - el); if (el >= PREP) pAnswer(); }
    else if (P.phase === "answer") { $("#ivPTimer").textContent = fmt(P.limit - el); $("#ivPTimer").classList.toggle("over", el > P.limit); if (el >= P.limit) pReview(); }
  }
  function pPrep() { P.phase = "prep"; P.t0 = performance.now(); $("#ivPFeedback").hidden = true; pRender(); pTick(); }
  function pAnswer() { P.phase = "answer"; P.t0 = performance.now(); if (P.meter) P.meter.reset(); pRender(); pTick(); }
  function pReview() {
    P.phase = "review"; pRender();
    var snap = P.meter ? P.meter.snapshot() : { d: null, g: null };
    P.results[P.i] = snap;
    $("#ivPSelf").innerHTML = IV.STAR_PROBES.map(function (p) { return '<label class="check"><input type="checkbox" data-star="' + p.id + '"> <span>' + esc(T("iv.star." + p.id, p.th)) + "</span></label>"; }).join("");
    var tips = P.meter ? IV.practiceTips(snap.d, snap.g) : [];
    $("#ivPTips").innerHTML = (P.meter ? tips.map(function (t) { return '<li class="' + t.level + '" data-tip="' + t.id + '">' + esc(T("iv.tip." + t.id, TIPS[t.id], t.vars)) + "</li>"; }).join("") :
      '<li class="tip">' + esc(T("iv.js.pNoCam", "เปิดกล้องและไมโครโฟนในขั้นเริ่มฝึกเพื่อรับคำแนะนำเรื่องจังหวะการพูด หรือใช้รายการ STAR ด้านบนตรวจตัวเอง")) + "</li>") +
      (snap.d || snap.g ? '<li class="raw">' + tilesHtml(snap.d, snap.g) + signalsHtml(snap.d, snap.g, "practice") + "</li>" : "");
    $("#ivPFeedback").hidden = false;
    $("#ivPGo").textContent = P.i + 1 < P.qs.length ? T("iv.s.p.next", "ข้อต่อไป") : T("iv.js.pFinish", "จบการฝึก");
  }
  var TIPS = {
    frame: "เห็นใบหน้าเพียง {p}% ของเวลา ลองจัดกล้องให้อยู่ระดับสายตาและนั่งให้อยู่กลางภาพ",
    lookCam: "หันเข้าหากล้องประมาณ {p}% ของเวลา ถ้าสัมภาษณ์ออนไลน์ ลองมองที่กล้องบ้างเวลาสรุปประเด็นสำคัญ",
    lookOk: "หันเข้าหากล้องประมาณ {p}% ของเวลา ดีแล้ว",
    steady: "ศีรษะขยับค่อนข้างมาก ถ้าใช้กล้อง ลองวางกล้องให้มั่นคงและนั่งพิงพนัก",
    more: "มีเสียงพูดเพียง {p}% ของเวลาตอบ ลองเล่าตัวอย่างให้ครบ: สถานการณ์ งาน การกระทำ ผลลัพธ์",
    longPause: "มีช่วงเงียบยาวกว่า 2 วินาที {n} ครั้ง ไม่เป็นไร — ลองใช้ประโยคเชื่อม เช่น \"ขอคิดสักครู่\" หรือร่างโครง STAR ระหว่างเตรียมตัว",
    pauseOk: "มีการเว้นจังหวะ {n} ครั้ง การหยุดสั้น ๆ ช่วยให้ผู้ฟังตามทัน",
    breathe: "พูดต่อเนื่องเฉลี่ย {s} วินาทีต่อช่วง ลองเว้นจังหวะสั้น ๆ ระหว่างแต่ละส่วนของ STAR",
    slow: "จังหวะเสียงค่อนข้างเร็ว (ประมาณ {r} ครั้ง/วินาที) ลองพูดช้าลงเล็กน้อยในส่วนผลลัพธ์",
    short: "เวลาตอบสั้นเกินกว่าจะให้คำแนะนำได้ ลองตอบให้ยาวอย่างน้อย 10 วินาที"
  };
  async function pStart() {
    var role = $("#ivPRole").value, comps = IV.ROLES[role].comps;
    P.limit = +$("#ivPTime").value || 120; P.results = [];
    P.qs = shuffle(comps.map(function (c, i) { return { comp: c, kind: i % 2 ? "sit" : "beh" }; })).slice(0, 5);
    P.i = 0; $("#ivPMsg").textContent = "";
    if ($("#ivPCam").checked) {
      $("#ivPCamBox").hidden = false;
      P.meter = P.meter || createMeter($("#ivPVideo"), $("#ivPOverlay"));
      try { var errs = await P.meter.start(); if (errs.length) $("#ivPMsg").textContent = mediaErr(errs[0]); }
      catch (e) { $("#ivPMsg").textContent = mediaErr(e); $("#ivPCamBox").hidden = true; P.meter = null; }
    } else { $("#ivPCamBox").hidden = true; P.meter = null; }
    $("#ivPSetup").hidden = true; $("#ivPRun").hidden = false;
    clearInterval(P.timer); P.timer = setInterval(pTick, 250);
    pPrep();
  }
  function pEnd() {
    clearInterval(P.timer); P.timer = null; P.phase = "idle";
    if (P.meter && P.meter.running) P.meter.stop();
    $("#ivPRun").hidden = true; $("#ivPSetup").hidden = false; $("#ivPCamBox").hidden = true;
    $("#ivPMsg").textContent = T("iv.js.pDone", "จบการฝึกแล้ว ปิดกล้องและไมโครโฟนเรียบร้อย ไม่มีข้อมูลถูกบันทึก");
    renderPSum();
  }
  /* candidate's own practice summary: pace, pauses, talk time, eye-contact share (head-orientation proxy) + signals */
  function renderPSum() {
    var X = IV.practiceSummary(P.results);
    $("#ivPSum").hidden = !X.answers;
    if (!X.answers) { $("#ivPSumBody").innerHTML = ""; return; }
    var dash = function (v, suf) { return v == null ? "—" : v + (suf || ""); };
    var tiles = [
      [String(X.answers), T("iv.js.psAns", "คำตอบที่วัด")],
      [dash(X.talkPct, "%"), T("iv.js.psTalk", "เวลาที่พูด (สัดส่วนของเวลาตอบ)")],
      [dash(X.pausesPerMin), T("iv.js.psPause", "ช่วงหยุดต่อนาที")],
      [X.pace == null ? "—" : X.pace.toFixed(1) + "/s", T("iv.js.psPace", "จังหวะการพูด (ยอดพลังงานเสียงต่อวินาที)")],
      [dash(X.towardPct, "%"), T("iv.js.psEye", "สัดส่วนการมองกล้อง (ประมาณจากทิศทางศีรษะ)")]
    ];
    var sig = Object.keys(X.signals);
    $("#ivPSumBody").innerHTML = '<div class="tiles">' + tiles.map(function (x) { return '<div class="tile"><b>' + esc(x[0]) + '</b><span class="k">' + esc(x[1]) + "</span></div>"; }).join("") + "</div>" +
      '<div class="sig"><h4>' + esc(T("iv.js.sigH", "สัญญาณความตื่นเต้นที่สังเกตได้ (ข้อสังเกต ไม่ใช่การอ่านอารมณ์)")) + "</h4>" +
      (sig.length ? "<ul>" + sig.map(function (id) { return '<li class="seen" data-sig="' + id + '">' + esc(T("iv.sig." + id + ".short", SIG_SHORT[id])) + " — " + esc(T("iv.js.psSigN", "พบใน {k}/{n} คำตอบ", { k: X.signals[id], n: X.answers })) + "</li>"; }).join("") + "</ul>"
        : '<p class="hint">' + esc(T("iv.js.psSigNone", "ไม่พบสัญญาณที่เด่นในคำตอบที่วัด")) + "</p>") +
      '<p class="hint">' + esc(T("iv.js.psSigTip", "ความตื่นเต้นเป็นเรื่องปกติ ลองหายใจช้า ๆ ระหว่างเตรียมตัว และใช้โครง STAR ช่วยเรียงเรื่อง")) + '</p><p class="sci">' + esc(T("iv.js.sci", SCI_TH)) + "</p></div>";
  }
  var SIG_SHORT = { move: "ศีรษะขยับค่อนข้างมาก", away: "หันออกจากกล้องบ่อย", pauses: "หยุดสั้น ๆ บ่อย", pace: "จังหวะเสียงเร็ว", bursts: "พูดเป็นช่วงสั้น ๆ ต่อกัน" };
  $("#ivPSumPrint").addEventListener("click", function () {
    document.documentElement.classList.add("iv-print-ps");
    try { window.print(); } finally { document.documentElement.classList.remove("iv-print-ps"); }
  });
  $("#ivPSumClear").addEventListener("click", function () { P.results = []; renderPSum(); $("#ivPMsg").textContent = T("iv.js.psCleared", "ลบผลการฝึกแล้ว"); });
  $("#ivPStart").addEventListener("click", pStart);
  $("#ivPNext").addEventListener("click", function () { if (P.phase === "prep") pAnswer(); else if (P.phase === "answer") pReview(); });
  $("#ivPGo").addEventListener("click", function () { if (P.i + 1 < P.qs.length) { P.i++; pPrep(); } else pEnd(); });
  $("#ivPEnd").addEventListener("click", pEnd);

  window.addEventListener("pagehide", function () { if (dMeter && dMeter.running) dMeter.stop(); if (P.meter && P.meter.running) P.meter.stop(); });

  /* ---------- language ---------- */
  function renderAll() {
    renderComps(); renderBias(); renderLaw(); renderQuestions(); renderWho(); renderScore();
    if (!$("#pane-summary").hidden) renderSummary();
    if (S.delivery && !$("#ivDResBody").hidden) renderResultBody();
    syncOrg(); if (dMeter && dMeter.running) setCandView(!$("#ivDCandView").hidden);
    if (P.phase !== "idle") pRender();
    syncRegion(); setCandModeLabel(); if (!$("#ivPSum").hidden) renderPSum(); qCheck();
  }
  function setCandModeLabel() { $("#ivModeBtn").textContent = S.candMode ? T("iv.js.modeBack", "กลับไปโหมดผู้สัมภาษณ์") : T("iv.s.mode.cand", "โหมดฝึกซ้อมของผู้สมัคร (ใช้คนเดียว)"); }
  window.addEventListener("lq-lang", renderAll);
  renderAll();
  if (S.candMode) setCandMode(true);

  W.__LQ_IV = { S: S, P: P, go: go, setCandMode: setCandMode, renderPSum: renderPSum, get dMeter() { return dMeter; }, renderSummary: renderSummary, pReview: pReview, TIPS: TIPS };
})();
