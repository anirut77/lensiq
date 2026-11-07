/* interview.js — Structured Interview Kit UI (interview.html). Pure parts are in interview-core.js (IVCore).
 * Everything lives in memory only: no localStorage, no uploads, no images/audio kept. The optional camera/mic
 * "delivery observation" needs explicit candidate opt-in and keeps only numbers while the page is open.
 * Test hooks: window.__LQ_IV (state, meter, helpers). ?fakedet on localhost: scripted faces via LQDetect.fake("c1"),
 * boxes may carry `yaw` (−1..1) to turn the synthetic head. */
(function () {
  "use strict";
  var IV = window.IVCore;
  if (!IV || !document.getElementById("ivApp")) return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var T = function (k, th, v) { return window.LQI18N ? LQI18N.tf(k, th, v) : th.replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var C = IV.COMPETENCIES;
  var cName = function (id) { return T("iv.c." + id + ".name", C[id].name); };
  var cTxt = function (id, f) { return T("iv.c." + id + "." + f, C[id][f]); };
  function toast(msg) { var t = $("#ivToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("show"); }, 2200); }

  var S = { role: "sales", comps: IV.ROLES.sales.comps.slice(), cand: "", sheets: [], cur: -1, reveal: false, law: {}, delivery: null };

  /* ---------- tabs ---------- */
  function go(t) {
    $$(".iv .tab").forEach(function (b) { var on = b.dataset.t === t; b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    $$(".iv .pane").forEach(function (p) { p.hidden = p.id !== "pane-" + t; });
    if (t === "summary") renderSummary();
    if (t === "score") renderScore();
  }
  $$(".iv .tab").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.t); }); });
  $$("[data-goto]").forEach(function (b) { b.addEventListener("click", function () { go(b.dataset.goto); window.scrollTo(0, 0); }); });

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
    S.role = this.value;
    if (S.role !== "custom") S.comps = IV.ROLES[S.role].comps.slice();
    renderComps(); renderQuestions();
  });
  $("#ivCand").addEventListener("input", function () { S.cand = this.value.replace(/[<>]/g, "").trim(); });
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
    S.sheets.push({ who: n, scores: {}, notes: {}, submitted: false });
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
        '<label class="field"><span>' + esc(T("iv.js.evidence", "หลักฐาน: ผู้สมัครเล่าว่าทำอะไร ผลเป็นอย่างไร")) + '</span><textarea rows="2" maxlength="2000" data-note="' + id + '">' + esc(sh.notes[id] || "") + "</textarea></label></fieldset>";
    }).join("");
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
  $("#ivSheet").addEventListener("input", function (e) { var t = e.target.closest("[data-note]"); if (t && S.sheets[S.cur]) S.sheets[S.cur].notes[t.dataset.note] = t.value; });
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
      { r: T("iv.r." + S.role, IV.ROLES[S.role].name), c: S.cand || "—", n: S.sheets.length, d: new Date().toLocaleDateString(window.LQI18N && LQI18N.lang === "zh" ? "zh-CN" : "th-TH") });
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
    renderSumDelivery();
  }
  function renderSumDelivery() {
    var box = $("#ivSumDelivery"), on = $("#ivIncDelivery").checked && S.delivery;
    box.hidden = !on;
    box.innerHTML = on ? "<h3>" + esc(T("iv.js.sumDH", "ข้อสังเกตการนำเสนอ (ไม่ใช่การประเมินตัวบุคคล และไม่ใช้ให้คะแนน)")) + "</h3>" + tilesHtml(S.delivery.d, S.delivery.g) +
      '<p class="hint">' + esc(T("iv.s.d.cv3", "การสบตา การขยับตัว และจังหวะการพูดต่างกันตามวัฒนธรรม ภาษา ความพิการ และความถนัด ไม่ได้บอกความสามารถในการทำงาน")) + "</p>" : "";
  }
  $("#ivReveal").addEventListener("click", function () { S.reveal = true; renderSummary(); });
  $("#ivIncDelivery").addEventListener("change", renderSumDelivery);
  $("#ivPrint").addEventListener("click", function () { go("summary"); window.print(); });
  $("#ivClear").addEventListener("click", function () {
    if (!confirm(T("iv.js.clearQ", "ลบคะแนน หลักฐาน และข้อสังเกตทั้งหมดของการสัมภาษณ์นี้หรือไม่"))) return;
    S.sheets = []; S.cur = -1; S.reveal = false; S.cand = ""; S.delivery = null; $("#ivCand").value = "";
    $("#ivDResult").hidden = true; renderWho(); renderSummary(); toast(T("iv.js.cleared", "ล้างข้อมูลแล้ว"));
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
      var errs = [];
      try { await Promise.all([cam.start(), loadModels()]); m.hasCam = true; } catch (e) { errs.push(e); }
      try {
        m.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }, video: false });
        var AC = window.AudioContext || window.webkitAudioContext;
        m.audio = new AC(); if (m.audio.state === "suspended") await m.audio.resume();
        var src = m.audio.createMediaStreamSource(m.mic), an = m.audio.createAnalyser(); an.fftSize = 1024; src.connect(an);
        var buf = new Float32Array(an.fftSize);
        m.timer = setInterval(function () { an.getFloatTimeDomainData(buf); m.vad.push(IV.rmsDb(buf), performance.now()); }, 20);
        m.hasMic = true;
      } catch (e) { errs.push(e); }
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
      m.running = false; clearInterval(m.timer); m.timer = null;
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

  /* delivery observation (interview) */
  var dMeter = null;
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
      $("#ivDEngine").textContent = T("iv.js.live", "กำลังสังเกต — ไม่มีการบันทึกภาพหรือเสียง");
      dMeter.onTick = liveTiles; liveTiles();
      clearInterval(dMeter.ui); dMeter.ui = setInterval(liveTiles, 1000);
    } catch (e) { $("#ivDMsg").textContent = mediaErr(e); syncConsent(); }
  });
  function liveTiles() { if (dMeter) { var s = dMeter.snapshot(); $("#ivDTiles").innerHTML = tilesHtml(s.d, s.g); } }
  $("#ivDStop").addEventListener("click", function () {
    if (!dMeter) return;
    clearInterval(dMeter.ui); dMeter.onTick = null;
    S.delivery = dMeter.stop();
    $("#ivDLive").hidden = true; $("#ivConsent").hidden = false; $("#ivDResult").hidden = false;
    $("#ivCOk1").checked = $("#ivCOk2").checked = false; syncConsent();
    $("#ivDResTiles").innerHTML = tilesHtml(S.delivery.d, S.delivery.g);
  });
  $("#ivDDiscard").addEventListener("click", function () { S.delivery = null; $("#ivDResult").hidden = true; $("#ivDResTiles").innerHTML = ""; renderSumDelivery(); });

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
      (snap.d || snap.g ? '<li class="raw">' + tilesHtml(snap.d, snap.g) + "</li>" : "");
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
  }
  $("#ivPStart").addEventListener("click", pStart);
  $("#ivPNext").addEventListener("click", function () { if (P.phase === "prep") pAnswer(); else if (P.phase === "answer") pReview(); });
  $("#ivPGo").addEventListener("click", function () { if (P.i + 1 < P.qs.length) { P.i++; pPrep(); } else pEnd(); });
  $("#ivPEnd").addEventListener("click", pEnd);

  window.addEventListener("pagehide", function () { if (dMeter && dMeter.running) dMeter.stop(); if (P.meter && P.meter.running) P.meter.stop(); });

  /* ---------- language ---------- */
  function renderAll() {
    renderComps(); renderBias(); renderLaw(); renderQuestions(); renderWho(); renderScore();
    if (!$("#pane-summary").hidden) renderSummary();
    if (S.delivery) $("#ivDResTiles").innerHTML = tilesHtml(S.delivery.d, S.delivery.g);
    if (P.phase !== "idle") pRender();
  }
  window.addEventListener("lq-lang", renderAll);
  renderAll();

  window.__LQ_IV = { S: S, P: P, go: go, get dMeter() { return dMeter; }, renderSummary: renderSummary, pReview: pReview, TIPS: TIPS };
})();
