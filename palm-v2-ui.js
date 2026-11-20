/* palm-v2-ui.js — page part of the palm reading upgrade v1 (palm.html). Runs ONLY when window.LENSIQ_PALM_V2 === true
   (lensiq-config.js ships false). Uses PalmV2 (palm-v2.js + palm-v2-detect.js + palm-v2-kb.js), LQCam (lensiq-camera.js),
   PalmCore (palm.js, guide outline only), LQFortuneCrisis (crisis v3, owner decision 2026-11-17: with a crisis signal the reading
   continues gently, no card replaces it, no share / print / paid content, one warm line with the 1323 button at the end).
   Loaded by palm.js only when the switch is on; the line finder runs in a Web Worker (palm-v2-worker.js), main thread fallback.
   Flow: choose own / another person's hand (consent line first) and left / right -> rear camera with the hand outline, live
   hints, automatic capture after a steady green count or the manual button -> full-resolution still (ImageCapture.takePhoto,
   else the full track frame) or an uploaded photo -> 7 taps (tier 1) or automatic hand points (LENSIQ_PALM_LANDMARKS, demo
   profile only, tier 2-U) -> classical line finder -> three layers on the photo (found solid / "not found" dashed guide /
   added by you) -> list of every line of the school with its status -> reading of found / added / confirmed lines -> print and
   share card drawn by the same layer function. The photo stays in memory on this device; sessionStorage holds line geometry
   only (PalmV2.serialize). Nothing is sent anywhere. */
(function () {
  "use strict";
  if (typeof window === "undefined" || typeof document === "undefined" || window.LENSIQ_PALM_V2 !== true) return;
  var WIN = /** @type {any} */ (window), box = document.getElementById("plV2"), PV = WIN.PalmV2;
  if (!box || !PV || !PV.detect) return;
  var $ = function (s) { return box.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(box.querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var lang = function () { var l = /** @type {string} */ (WIN.LQI18N && WIN.LQI18N.lang); return l === "en" || l === "zh" ? l : "th"; };
  var T = function (k) { return PV.T(k, lang()); };
  var LOCAL = {
    title: ["ดูลายมือ (รุ่นใหม่ ทดลอง)", "Palm reading (new, trial)", "看手相（新版，试用）"],
    start: ["เปิดกล้อง", "Open camera", "打开摄像头"], snap: ["ถ่ายภาพ", "Take photo", "拍照"], stop: ["ปิดกล้อง", "Close camera", "关闭摄像头"],
    upload: ["อัปโหลดรูป", "Upload a photo", "上传照片"], read: ["อ่านลายมือ", "Read my palm", "解读手相"], again: ["ถ่ายใหม่", "New photo", "重新拍摄"],
    print: ["พิมพ์", "Print", "打印"], share: ["การ์ดผล", "Result card", "结果卡片"],
    tapUndo: ["ย้อนจุด", "Undo point", "撤销上一点"], auto: ["ถ่ายอัตโนมัติเมื่อกรอบเป็นสีเขียว", "Takes the photo by itself when the outline turns green", "轮廓变绿时自动拍照"],
    card: ["การ์ดผลอ่านลายมือ (ไม่มีภาพมือ)", "Palm reading card (no photo of the hand)", "手相解读卡片（不含手部照片）"],
    canvasAria: ["ภาพฝ่ามือพร้อมเส้นที่พบ เส้นประที่ไม่พบ และเส้นที่เพิ่มเอง", "Palm photo with the lines found, dashed guides not found, and lines you added", "手掌照片：已找到的掌纹、未找到的虚线和自行添加的掌纹"]
  };
  var L = function (k) { var e = LOCAL[k]; return e ? e[{ th: 0, en: 1, zh: 2 }[lang()]] : k; };
  var CR = function () { return window.LQFortuneCrisis || null; };
  var FA = function () { return window.FortuneAI || null; };

  var S = { mode: "self", side: "right", school: "thai", photo: null, W: 0, H: 0, taps: [], hand: null, F: null, det: null, crop: null,
    st: PV.newState({ side: "right", school: "thai" }), tracing: null, trace: null, adjusting: null, drag: null, busy: false, lastStill: null,
    layouts: {}, beforeGreen: false, resultShown: false, source: "image", facing: null, mirrored: null, quality: null, sideAsk: null };

  /* ---------- the legacy flow stays in the page but hidden while v2 is on ---------- */
  ["plStage", "plEdit", "plResult", "plEngine"].forEach(function (id) { var e = document.getElementById(id); if (e) e.hidden = true; });
  var steps = /** @type {HTMLElement|null} */ (document.querySelector(".pl-steps")); if (steps) steps.hidden = true;
  // the page's nickname field (#plNick, covered by the crisis net and its inventory) moves into the v2 panel; v2 never shows or
  // sends what is typed there
  var nickLabel = document.getElementById("plNick") && document.getElementById("plNick").closest("label");
  var nickSlot = box.querySelector("#pv2NickSlot");
  if (nickLabel && nickSlot) nickSlot.appendChild(nickLabel);
  box.hidden = false;

  /* ---------- texts ---------- */
  function renderTexts() {
    $$("[data-pv2-t]").forEach(function (e) { e.textContent = T(e.getAttribute("data-pv2-t")); });
    $$("[data-pv2-l]").forEach(function (e) { e.textContent = L(e.getAttribute("data-pv2-l")); });
    $$("[data-pv2-school]").forEach(function (b) { b.textContent = PV.schoolName(b.getAttribute("data-pv2-school"), lang()); });
    $("#pv2Canvas").setAttribute("aria-label", L("canvasAria"));
    $("#pv2Card").setAttribute("alt", L("card"));
    $("#pv2LmNote").textContent = T("lm.label");
  }

  /* ---------- choices: own / another person's hand, consent, side, school ---------- */
  function renderChoices() {
    $$("[data-pv2-mode]").forEach(function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-pv2-mode") === S.mode)); });
    $$("[data-pv2-side]").forEach(function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-pv2-side") === S.side)); });
    $$("[data-pv2-school]").forEach(function (b) { b.setAttribute("aria-checked", String(b.getAttribute("data-pv2-school") === S.school)); });
    var gate = PV.cameraGate({ mode: S.mode, consent: $("#pv2Consent").checked });
    $("#pv2ConsentWrap").hidden = !gate.consentRequired;
    $("#pv2Start").disabled = !gate.open;
    $("#pv2File").disabled = !gate.open; // an uploaded photo of another person's hand needs the same consent (review round 1, a)
    var up = $("#pv2File").closest("label"); if (up) up.classList.toggle("pv2-off", !gate.open);
  }
  box.addEventListener("click", function (e) {
    var t = /** @type {any} */ (e.target), b = t && t.closest ? t.closest("[data-pv2-mode],[data-pv2-side],[data-pv2-school]") : null;
    if (!b) return;
    if (b.hasAttribute("data-pv2-mode")) { S.mode = b.getAttribute("data-pv2-mode"); $("#pv2Consent").checked = false; if (S.mode === "other") stopCam(); }
    if (b.hasAttribute("data-pv2-side")) { S.side = b.getAttribute("data-pv2-side"); S.st.side = S.side; if (S.sideAsk === S.side) S.sideAsk = null; renderSideAsk(); save(); }
    if (b.hasAttribute("data-pv2-school")) { setSchool(b.getAttribute("data-pv2-school")); }
    renderChoices();
  });
  $("#pv2Consent").addEventListener("change", /** @this {HTMLInputElement} */ function () { if (!this.checked && S.mode === "other") stopCam(); renderChoices(); });

  /* ---------- camera, live hints, automatic and manual capture ---------- */
  var video = $("#pv2Video"), ov = $("#pv2Guide"), octx = ov.getContext("2d"), cam = null, loop = 0, shutter = PV.createAutoShutter({ countMs: 2400 });
  var small = document.createElement("canvas"), prevC = null, lastHint = "noHand", hintSince = 0, shownHint = "";
  function getCam() {
    if (cam || !window.LQCam) return cam;
    // no flash (owner order 2026-11-20): the torch is never turned on (PV.CAM_OPTS.torch false) and is switched off where supported
    cam = window.LQCam.create(video, { facing: PV.CAM_OPTS.facing, ideal: { width: 3840, height: 2160 }, torch: PV.CAM_OPTS.torch, // "ideal" never fails for being too high
      onChange: function (c, ev) { if (ev.type === "started") startLoop(); } });
    return cam;
  }
  function stopCam() { if (cam) cam.stop(); cancelAnimationFrame(loop); loop = 0; $("#pv2Cam").classList.remove("live"); $("#pv2Snap").hidden = true; $("#pv2Stop").hidden = true;
    $("#pv2Count").hidden = true; }
  $("#pv2Start").addEventListener("click", function () {
    var gate = PV.cameraGate({ mode: S.mode, consent: $("#pv2Consent").checked });
    if (!gate.open) return;
    var c = getCam(); if (!c) return;
    shutter.reset();
    c.start().then(function () { if (c.torchSupported && c.setTorch) c.setTorch(false); $("#pv2Cam").classList.add("live"); $("#pv2Snap").hidden = false; $("#pv2Stop").hidden = false; startLoop(); })
      .catch(function (e) { msg(window.LQCam.errorText ? window.LQCam.errorText(e) : String(e && e.message || e)); });
  });
  $("#pv2Stop").addEventListener("click", stopCam);
  function startLoop() {
    if (loop) return;
    var last = 0;
    var tick = function (t) {
      loop = requestAnimationFrame(tick);
      if (t - last < 250 || !video.videoWidth) return;
      last = t;
      liveCheck(t);
    };
    loop = requestAnimationFrame(tick);
  }
  function guideContour(w, h) {
    var PC = window.PalmCore;
    if (PC && PC.guideTemplate) { try { return PC.guideTemplate(S.side, w, h, { mirrored: false }).contour; } catch (e) { /* fall back */ } }
    return [[w * 0.3, h * 0.9], [w * 0.28, h * 0.45], [w * 0.36, h * 0.15], [w * 0.64, h * 0.15], [w * 0.72, h * 0.45], [w * 0.7, h * 0.9]];
  }
  function liveCheck(t) {
    var vw = video.videoWidth, vh = video.videoHeight, sw = 160, sh = Math.round(sw * vh / vw);
    small.width = sw; small.height = sh;
    var sx = small.getContext("2d", { willReadFrequently: true });
    sx.drawImage(video, 0, 0, sw, sh);
    var px = sx.getImageData(0, 0, sw, sh).data;
    var hand = PV.handFromSkin(px, sw, sh), roi = { x: Math.round(sw * 0.3), y: Math.round(sh * 0.4), w: Math.round(sw * 0.4), h: Math.round(sh * 0.3) };
    var c = hand.found ? [hand.offset, hand.fill] : null;
    hand.still = !!(c && prevC && Math.abs(c[0] - prevC[0]) < 0.02 && Math.abs(c[1] - prevC[1]) < 0.03);
    prevC = c;
    var m = PV.captureMetrics(px, sw, sh, roi);
    var hint = PV.captureHint({ metrics: m, hand: hand });
    if (hint !== lastHint) { lastHint = hint; hintSince = t; }
    if (t - hintSince >= 300 && shownHint !== hint) { shownHint = hint; $("#pv2Hint").textContent = PV.hintText(hint, lang(), S.mode === "other");
      $("#pv2Hint").dataset.s = hint === "ok" ? "ok" : "wait"; }
    drawGuide(hint === "ok");
    var f = shutter.feed({ ok: hint === "ok", moved: !hand.still, now: t });
    var cnt = $("#pv2Count");
    if (f.counting) { cnt.hidden = false; cnt.textContent = String(Math.ceil(f.left / 800)); } else cnt.hidden = true;
    if (f.fire) snap(true, false);
  }
  function drawGuide(ok) {
    var r = ov.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    ov.width = Math.max(1, Math.round(r.width * dpr)); ov.height = Math.max(1, Math.round(r.height * dpr));
    var w = ov.width, h = ov.height, P = guideContour(w, h);
    octx.clearRect(0, 0, w, h);
    octx.lineWidth = Math.max(3, w / 160); octx.setLineDash(ok ? [] : [w / 50, w / 80]);
    octx.strokeStyle = ok ? "#22c55e" : "rgba(255,255,255,0.9)";
    octx.beginPath(); P.forEach(function (q, i) { if (i) octx.lineTo(q[0], q[1]); else octx.moveTo(q[0], q[1]); }); octx.closePath(); octx.stroke();
    octx.setLineDash([]);
  }
  $("#pv2Snap").addEventListener("click", function () { var m = shutter.manual({ ok: lastHint === "ok" }); snap(false, m.beforeGreen); });
  function snap(auto, beforeGreen) {
    if (S.busy || !cam || !cam.stream) return;
    var track = cam.stream.getVideoTracks()[0];
    S.busy = true;
    PV.grabStill({ track: track, video: video, ImageCapture: /** @type {any} */ (window).ImageCapture }).then(function (r) {
      S.lastStill = { source: r.source, width: r.width, height: r.height, auto: !!auto };
      // the still is the raw track frame / photo: its pixels are never mirrored (a mirrored preview is CSS only)
      var set = track && track.getSettings ? track.getSettings() : {};
      S.source = "camera"; S.facing = (set && set.facingMode) || (cam && cam.facing) || "environment"; S.mirrored = false;
      $("#pv2Consent").checked = PV.consentAfterCapture({ mode: S.mode, consent: true }) && S.mode !== "other";
      S.beforeGreen = !!beforeGreen;
      // another person's hand: the consent tick is cleared, so the camera closes; own hand: the live check pauses and the camera
      // closes once the 7 points are tapped (runDetect)
      if (S.mode === "other") stopCam(); else { cancelAnimationFrame(loop); loop = 0; $("#pv2Count").hidden = true; }
      renderChoices();
      S.busy = false;
      return usePhoto(r.image);
    }).catch(function (e) { S.busy = false; console.error(e); });
  }
  $("#pv2File").addEventListener("change", /** @this {HTMLInputElement} */ function () {
    var f = this.files && this.files[0]; if (!f) return;
    S.beforeGreen = false; S.source = "upload"; S.facing = null; S.mirrored = null; // facing unknown: read as not mirrored, a disagreement asks
    var p = window.createImageBitmap ? window.createImageBitmap(f, { imageOrientation: "from-image" }) : Promise.reject(new Error("no createImageBitmap"));
    p.then(usePhoto).catch(function (e) { console.error(e); });
    this.value = "";
  });
  /** test / smoke hook: an image handed to the page like a camera still (no-flash check only); {source: "upload"} = the upload rules */
  function useImageUrl(url, o) {
    S.source = o && o.source === "upload" ? "upload" : "image"; S.facing = (o && o.facing) || null; S.mirrored = o && o.mirrored != null ? !!o.mirrored : null;
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = url; }).then(usePhoto);
  }

  /* ---------- photo in memory (full resolution), 7 taps ---------- */
  var cv = $("#pv2Canvas"), cx = cv.getContext("2d");
  function usePhoto(img) {
    var W = img.width || img.naturalWidth, H = img.height || img.naturalHeight;
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    c.getContext("2d").drawImage(img, 0, 0, W, H);
    if (img.close) try { img.close(); } catch (e) { /* not a bitmap */ }
    if (S.mode === "other") { $("#pv2Consent").checked = PV.consentAfterCapture({ mode: S.mode, consent: true }); renderChoices(); } // one tick per photo
    S.photo = c; S.W = W; S.H = H; S.taps = []; S.hand = null; S.F = null; S.det = null; S.tracing = null; S.adjusting = null; S.quality = null; S.sideAsk = null;
    S.lastDetectMs = null; renderSideAsk();
    S.st = PV.newState({ side: S.side, school: S.school });
    $("#pv2Work").hidden = false; $("#pv2Result").hidden = true; S.resultShown = false;
    $("#pv2List").innerHTML = "";
    msg(S.beforeGreen ? T("capture.beforeGreen") : "");
    layoutCanvas();
    // automatic hand points (owner decision D-P1): palm.js's MediaPipe hand model (tier 2-U), only with LENSIQ_PALM_LANDMARKS (demo
    // profile; off in customer builds); otherwise, or when it finds no hand, the 7-tap mode (tier 1)
    var P0 = WIN.__palm, lm = WIN.LENSIQ_PALM_LANDMARKS === true && P0 && P0.loadModels && P0.detectHand ?
      { detect: function (src) { return P0.loadModels().then(function () { return P0.detectHand(src, false); }); } } : null;
    $("#pv2LmNote").hidden = !lm;
    if (lm) {
      setTapMsg(T("detect.busy"));
      return lm.detect(c).then(function (h) {
        if (h && h.pts && WIN.PalmCore) { S.hand = WIN.PalmCore.handFromLandmarks(h.pts); return runDetect(); }
        startTaps();
      }).catch(function () { startTaps(); });
    }
    startTaps();
    return Promise.resolve();
  }
  function startTaps() { S.taps = []; setTapMsg(); redraw(); try { cv.scrollIntoView({ block: "center", behavior: "instant" }); } catch (e) { /* old browser */ } }
  function setTapMsg(text) {
    var n = S.taps.length, k = PV.TAP_ORDER[n];
    $("#pv2TapMsg").textContent = text != null ? text : k ? (n + 1) + "/7 · " + T("tap." + k) + " — " + T("tap.why") : "";
    $("#pv2TapUndo").hidden = !(n > 0 && n < 7 && !S.hand);
  }
  $("#pv2TapUndo").addEventListener("click", function () { S.taps.pop(); setTapMsg(); redraw(); });

  /* ---------- canvas geometry ---------- */
  var VIEW = { k: 1, dpr: 1 };
  function layoutCanvas() {
    if (!S.photo) return;
    var wrap = cv.parentElement, cssW = Math.max(200, Math.min(640, (wrap && wrap.clientWidth) || 360)), dpr = Math.min(2, window.devicePixelRatio || 1);
    var cssH = Math.round(cssW * S.H / S.W);
    cv.style.width = cssW + "px"; cv.style.height = cssH + "px";
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    VIEW.k = cv.width / S.W; VIEW.dpr = dpr;
  }
  var imgToCanvas = function (p) { return [p[0] * VIEW.k, p[1] * VIEW.k]; };
  function imgToClient(p) { var r = cv.getBoundingClientRect(), c = imgToCanvas(p); return [r.left + c[0] * r.width / cv.width, r.top + c[1] * r.height / cv.height]; }
  function clientToImg(x, y) { var r = cv.getBoundingClientRect(); return [(x - r.left) * cv.width / r.width / VIEW.k, (y - r.top) * cv.height / r.height / VIEW.k]; }
  function uvToClient(q) { return imgToClient(S.F.toImg(q)); }
  function screenToPx() { var F = S.F; return function (q) { return imgToCanvas(F.toImg(q)); }; }
  function markOutside() {
    if (!S.F) return;
    var G = PV.guides(S.school);
    PV.LINES.forEach(function (id) {
      var P = G[id].cp.map(S.F.toImg), out = P.filter(function (p) { return p[0] < 0 || p[1] < 0 || p[0] > S.W || p[1] > S.H; }).length;
      S.st.lines[id].outside = out * 2 > P.length;
    });
  }
  function redraw() {
    if (!S.photo) return;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.drawImage(S.photo, 0, 0, cv.width, cv.height);
    if (!S.F) { // tap dots
      S.taps.forEach(function (p, i) { var c = imgToCanvas(p); cx.beginPath(); cx.arc(c[0], c[1], 6 * VIEW.dpr, 0, Math.PI * 2); cx.fillStyle = "#22d3ee"; cx.fill();
        cx.fillStyle = "#0b1020"; cx.font = (10 * VIEW.dpr) + "px sans-serif"; cx.fillText(String(i + 1), c[0] - 3 * VIEW.dpr, c[1] + 3 * VIEW.dpr); });
      return;
    }
    markOutside();
    var toPx = screenToPx();
    S.layouts.screen = { toPx: toPx, pw: S.F.pw * VIEW.k };
    PV.drawLineLayer(cx, S.st, "screen", { toPx: toPx, lang: lang(), scale: VIEW.dpr, focus: S.adjusting });
    if (S.trace && S.trace.length > 1) {
      cx.save(); cx.setLineDash([]); cx.lineWidth = 3 * VIEW.dpr; cx.strokeStyle = PV.COLORS[S.tracing] || "#fff"; cx.globalAlpha = 1;
      cx.beginPath(); S.trace.forEach(function (p, i) { var c = imgToCanvas(p); if (i) cx.lineTo(c[0], c[1]); else cx.moveTo(c[0], c[1]); }); cx.stroke(); cx.restore();
    }
  }
  window.addEventListener("resize", function () { if (S.photo) { layoutCanvas(); redraw(); } });

  /* ---------- pointer: taps, tracing, adjusting ---------- */
  cv.addEventListener("pointerdown", function (e) {
    if (!S.photo) return;
    var p = clientToImg(e.clientX, e.clientY);
    if (!S.F && !S.hand) {
      S.taps.push(p); setTapMsg(); redraw();
      if (S.taps.length === 7) {
        var t = {}; PV.TAP_ORDER.forEach(function (k, i) { t[k] = S.taps[i]; });
        S.hand = PV.handFromTaps(t); runDetect();
      }
      return;
    }
    if (S.tracing) { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic event */ } S.trace = [p]; return; }
    if (S.adjusting) {
      var Ln = S.st.lines[S.adjusting]; if (!Ln || !Ln.cp) return;
      var best = -1, bd = 1e9;
      Ln.cp.forEach(function (q, i) { var c = uvToClient(q), d = Math.hypot(c[0] - e.clientX, c[1] - e.clientY); if (d < bd) { bd = d; best = i; } });
      if (best >= 0 && bd <= 28) { e.preventDefault(); S.drag = best; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } }
    }
  });
  cv.addEventListener("pointermove", function (e) {
    if (S.tracing && S.trace) { S.trace.push(clientToImg(e.clientX, e.clientY)); redraw(); return; }
    if (S.adjusting && S.drag != null) { var Ln = S.st.lines[S.adjusting]; Ln.cp[S.drag] = S.F.toUV(clientToImg(e.clientX, e.clientY)); redraw(); }
  });
  function pointerEnd(e) {
    if (S.tracing && S.trace) {
      S.trace.push(clientToImg(e.clientX, e.clientY));
      var id = S.tracing, uv = S.trace.map(S.F.toUV).map(snapToRidge);
      S.trace = null;
      var r = PV.setLine(S.st, id, { status: "added", cp: uv });
      if (!r.ok) { msg(T(r.error === "tooShort" ? "trace.tooShort" : "trace.help")); redraw(); return; }
      S.tracing = null; cv.classList.remove("pv2-drawing"); msg("");
      changed(); return;
    }
    if (S.adjusting && S.drag != null) {
      S.drag = null;
      var L0 = S.st.lines[S.adjusting];
      PV.setLine(S.st, S.adjusting, { status: L0.status, cp: L0.cp });
      changed();
    }
  }
  cv.addEventListener("pointerup", pointerEnd);
  cv.addEventListener("pointercancel", function () { S.trace = null; S.drag = null; redraw(); });
  /** move a traced point to the strongest crease within 0.02 palm widths across the trace (the finder's ridge map) */
  function snapToRidge(q, i, all) { return snapAll(all)[i]; }
  var snapCache = { src: null, out: null };
  /** move traced points to the strongest crease within 0.02 palm widths across the trace (the finder's ridge map); the offsets
      are median-filtered so the trace never zigzags between neighbouring creases */
  function snapAll(all) {
    if (snapCache.src === all) return snapCache.out;
    var D = S.det && S.det._D;
    if (!D) { snapCache = { src: all, out: all }; return all; }
    var s = D.s, R = Math.round(0.02 * s), base = [], offs = [];
    all.forEach(function (q, i) {
      var x = (q[0] - PV.DET.u0) * s, y = (q[1] - PV.DET.v0) * s * D.asp;
      var a = all[Math.max(0, i - 2)], b = all[Math.min(all.length - 1, i + 2)], tx = (b[0] - a[0]) * s, ty = (b[1] - a[1]) * s * D.asp, tl = Math.hypot(tx, ty) || 1;
      var nx = -ty / tl, ny = tx / tl, best = 0, bk = 0;
      for (var k = -R; k <= R; k++) { var xx = Math.round(x + nx * k), yy = Math.round(y + ny * k); if (xx < 0 || yy < 0 || xx >= D.w || yy >= D.h) continue; var v = D.R[yy * D.w + xx];
        if (v > best) { best = v; bk = k; } }
      base.push([x, y, nx, ny]); offs.push(best >= 0.35 ? bk : 0);
    });
    var out = base.map(function (p, i) {
      var w = offs.slice(Math.max(0, i - 3), i + 4).sort(function (m, n) { return m - n; }), k = w[Math.floor(w.length / 2)];
      return [PV.DET.u0 + (p[0] + p[2] * k) / s, PV.DET.v0 + (p[1] + p[3] * k) / (s * D.asp)];
    });
    snapCache = { src: all, out: out };
    return out;
  }

  /* ---------- line finding ---------- */
  function runDetect() {
    S.busy = true; setTapMsg(T("detect.busy"));
    return new Promise(function (res) { setTimeout(res, 30); }).then(function () {
      var F0 = PV.frameFromHand(S.hand);
      // photo minimum (owner order 2026-11-20, PROVISIONAL; 171 ก, 170 ก): uploads and manual stills before green palm width /
      // blow-out (on the full-resolution photo), camera stills on green blow-out only;
      // sharpness is measured for review (S.quality.sharp) and never blocks or is shown
      var qv = photoCheck(F0);
      S.quality = qv;
      if (!qv.ok) {
        stopCam();
        S.det = null; S.F = F0; S.st = PV.newState({ side: S.side, school: S.school }); S.busy = false; setTapMsg("");
        checkSide();
        msg(T("quality.retake")); // every line stays "not found"; tracing by hand still works on this photo
        changed();
        return;
      }
      var corners = [[-0.4, -0.15], [1.35, -0.15], [1.35, 1.25], [-0.4, 1.25]].map(F0.toImg);
      var xs = corners.map(function (p) { return p[0]; }), ys = corners.map(function (p) { return p[1]; });
      var rx = Math.max(0, Math.floor(Math.min.apply(null, xs))), ry = Math.max(0, Math.floor(Math.min.apply(null, ys)));
      var rw = Math.min(S.W, Math.ceil(Math.max.apply(null, xs))) - rx, rh = Math.min(S.H, Math.ceil(Math.max.apply(null, ys))) - ry;
      var f = Math.min(1, 360 / Math.max(1, F0.pw)), cw = Math.max(1, Math.round(rw * f)), ch = Math.max(1, Math.round(rh * f));
      var c = document.createElement("canvas"); c.width = cw; c.height = ch;
      var g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(S.photo, rx, ry, rw, rh, 0, 0, cw, ch);
      var px = g.getImageData(0, 0, cw, ch).data;
      var mp = function (p) { return p ? [(p[0] - rx) * f, (p[1] - ry) * f] : p; };
      var h = S.hand, hc = { source: h.source, wrist: mp(h.wrist), mcp: { index: mp(h.mcp.index), middle: mp(h.mcp.middle), ring: mp(h.mcp.ring), pinky: mp(h.mcp.pinky) }, tip: {},
        thumbBase: null, pts: null };
      stopCam();
      return findLines(px, cw, ch, hc, S.school).then(function (det) {
      S.det = det; S.lastDetectMs = det.ms;
      S.F = F0;
      var st = PV.newState({ side: S.side, school: S.school, asp: S.det.asp });
      PV.applyDetection(st, S.det);
      S.st = st;
      S.busy = false; setTapMsg("");
      checkSide();
      msg(S.det.lowRes ? T("capture.lowRes") : S.beforeGreen ? T("capture.beforeGreen") : "");
      changed();
      });
    }).catch(function (e) { S.busy = false; console.error(e); setTapMsg(""); });
  }
  /** the B2.3 measure on the palm ROI of the full-resolution photo (a crop, scaled so the palm is at most 1024 px wide) */
  function photoCheck(F0) {
    var corners = [[0, 0.05], [1, 0.05], [1, 0.95], [0, 0.95]].map(F0.toImg);
    var xs = corners.map(function (p) { return p[0]; }), ys = corners.map(function (p) { return p[1]; });
    var qx = Math.max(0, Math.floor(Math.min.apply(null, xs)) - 2), qy = Math.max(0, Math.floor(Math.min.apply(null, ys)) - 2);
    var qw = Math.max(1, Math.min(S.W, Math.ceil(Math.max.apply(null, xs)) + 2) - qx), qh = Math.max(1, Math.min(S.H, Math.ceil(Math.max.apply(null, ys)) + 2) - qy);
    var f = Math.min(1, 1024 / Math.max(1, F0.pw)), cw = Math.max(1, Math.round(qw * f)), ch = Math.max(1, Math.round(qh * f));
    var c = document.createElement("canvas"); c.width = cw; c.height = ch;
    var g = c.getContext("2d", { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(S.photo, qx, qy, qw, qh, 0, 0, cw, ch);
    var mp = function (p) { return p ? [(p[0] - qx) * f, (p[1] - qy) * f] : p; }, h = S.hand;
    var hc = { wrist: mp(h.wrist), mcp: { index: mp(h.mcp.index), middle: mp(h.mcp.middle), ring: mp(h.mcp.ring), pinky: mp(h.mcp.pinky) }, tip: {} };
    var q = PV.photoQuality(g.getImageData(0, 0, cw, ch).data, cw, ch, hc, { pw: F0.pw });
    var v = PV.qualityVerdict(q, { source: S.source === "upload" ? "upload" : "camera", beforeGreen: S.source === "camera" && !!S.beforeGreen });
    return { ok: v.ok, fails: v.fails, source: S.source, beforeGreen: S.source === "camera" && !!S.beforeGreen, pw: Math.round(q.pw), sharp: Math.round(q.sharp * 100) / 100, clip: Math.round(q.clip * 10000) / 10000 };
  }
  /* handedness (owner order 2026-11-20): from the thumb position (landmark geometry), never the model's label; a disagreement with the
     user's left / right choice asks the user and the reading waits for the answer; the choice is never changed silently */
  function checkSide() {
    var geo = PV.handSide({ hand: S.hand, facing: S.facing, mirrored: S.mirrored });
    var chk = PV.sideCheck(S.side, geo);
    S.sideAsk = chk.ask ? chk.detected : null;
    renderSideAsk();
  }
  function renderSideAsk() {
    var el = $("#pv2SideAsk"); if (!el) return;
    el.hidden = !S.sideAsk;
    $("#pv2SideAskText").textContent = S.sideAsk ? PV.sideAskText(S.sideAsk, S.side, lang()) : "";
    $("#pv2Read").disabled = !!S.sideAsk;
  }
  box.addEventListener("click", function (e) {
    var t = /** @type {any} */ (e.target), b = t && t.closest ? t.closest("[data-pv2-side-answer]") : null;
    if (!b) return;
    S.side = b.getAttribute("data-pv2-side-answer") === "left" ? "left" : "right"; S.st.side = S.side; S.sideAsk = null;
    renderChoices(); renderSideAsk(); save();
    if (S.resultShown) renderReading();
  });
  /* the line finder runs in a Web Worker so the phone never freezes (review round 1, d); main-thread fallback */
  var worker = null, workerBroken = false, jobN = 0;
  function findLines(px, w, h, hand, school) {
    if (!workerBroken && typeof Worker === "function") {
      try { if (!worker) worker = new Worker("palm-v2-worker.js?v=3"); } catch (e) { workerBroken = true; }
    }
    if (!worker || workerBroken) return new Promise(function (res) { setTimeout(function () { res(PV.detect(px, w, h, hand, { school: school })); }, 0); });
    var id = ++jobN;
    return new Promise(function (res, rej) {
      var done = function (ev) {
        var d = ev.data || {};
        if (d.id !== id) return;
        worker.removeEventListener("message", done); worker.removeEventListener("error", fail);
        if (d.error) rej(new Error(d.error)); else res(d.det);
      };
      var fail = function () {
        worker.removeEventListener("message", done); worker.removeEventListener("error", fail);
        workerBroken = true; res(PV.detect(px, w, h, hand, { school: school }));
      };
      worker.addEventListener("message", done); worker.addEventListener("error", fail);
      var copy = new Uint8ClampedArray(px); // the photo crop goes to the worker on this device only, and is not kept
      worker.postMessage({ id: id, rgba: copy, w: w, h: h, hand: hand, school: school }, [copy.buffer]);
    });
  }
  function setSchool(school) {
    if (PV.SCHOOLS.indexOf(school) < 0) return;
    S.school = school;
    var old = S.st, st = PV.newState({ side: S.side, school: school, asp: old.asp });
    PV.LINES.forEach(function (id) { var L0 = old.lines[id];
      if (L0.status === "added" || L0.status === "absentConfirmed" || (L0.status === "found" && L0.edited)) st.lines[id] = JSON.parse(JSON.stringify(L0)); });
    if (S.det) PV.applyDetection(st, { lines: PV.classify(S.det._D, school), asp: S.det.asp });
    S.st = st;
    if (S.F) changed(); else save();
  }

  /* ---------- list below the photo ---------- */
  function renderList() {
    if (!S.F) { $("#pv2List").innerHTML = ""; return; }
    var rows = PV.listRows(S.st, lang());
    $("#pv2List").innerHTML = rows.map(function (r) {
      var acts = [];
      if (r.status === "notFound" && !S.st.lines[r.id].outside) acts.push(["trace", T("btn.trace")]);
      if (r.status === "notFound") acts.push(["absent", T("btn.absent")]);
      if (r.status === "found" || r.status === "added") { acts.push(["adjust", S.adjusting === r.id ? T("btn.done") : T("btn.adjust")]); acts.push(["remove", T("btn.remove")]); }
      if (r.status === "absentConfirmed") acts.push(["undo", T("btn.undo")]);
      var shape = r.status === "found" ? "pv2-solid" : r.status === "added" ? "pv2-added" : r.status === "notFound" ? "pv2-dashed" : "pv2-none";
      return '<li data-line="' + r.id + '" data-status="' + r.status + '"><span class="pv2-sw ' + shape + '" style="--c:' + PV.COLORS[r.id] + '" aria-hidden="true"></span>' +
        '<span class="pv2-num">' + r.num + '</span><b class="pv2-name">' + esc(r.name) + '</b> <span class="pv2-status">' + esc(r.label) +
        (r.note ? ' · <small class="pv2-note2">' + esc(r.note) + "</small>" : "") + '</span><p class="pv2-about">' + esc(r.about) + "</p>" +
        '<div class="pv2-acts">' + acts.map(function (a) { return '<button type="button" class="btn ghost" data-act="' + a[0] + '">' + esc(a[1]) + "</button>"; }).join("") + "</div></li>";
    }).join("");
  }
  $("#pv2List").addEventListener("click", function (e) {
    var t = /** @type {any} */ (e.target), b = t && t.closest ? t.closest("[data-act]") : null; if (!b) return;
    var id = b.closest("[data-line]").getAttribute("data-line"), act = b.getAttribute("data-act");
    if (act === "trace") { S.tracing = id; S.adjusting = null; S.trace = null; cv.classList.add("pv2-drawing"); msg(T("trace.help")); try { cv.scrollIntoView({ block: "center", behavior: "instant" });
      } catch (x) { /* old browser */ } redraw(); return; }
    if (act === "absent") PV.setLine(S.st, id, { status: "absentConfirmed" });
    if (act === "undo" || act === "remove") { PV.setLine(S.st, id, { status: "notFound" }); if (S.adjusting === id) S.adjusting = null; }
    if (act === "adjust") { S.adjusting = S.adjusting === id ? null : id; msg(S.adjusting ? T("adjust.help") : ""); if (S.adjusting) try { cv.scrollIntoView({ block: "center", behavior: "instant" });
      } catch (x) { /* old */ } }
    changed();
  });
  function changed() { save(); renderList(); redraw(); if (S.resultShown) renderReading(); }
  function save() { try { sessionStorage.setItem(PV.STORE_KEY, PV.serialize(S.st)); } catch (e) { /* private mode: memory only */ } }
  function msg(t) { $("#pv2Msg").textContent = t || ""; }

  /* ---------- reading (crisis first) ---------- */
  function crisisNow() {
    var cr = CR(), fa = FA(), text = "";
    var nk = /** @type {HTMLInputElement|null} */ (document.getElementById("plNick"));
    try { text = cr && cr.fields ? cr.fields(document) : nk ? nk.value : ""; } catch (e) { text = nk ? nk.value : ""; }
    if (cr && cr.active && cr.active(document)) return true;
    if (cr && cr.check) return !!cr.check(text);
    return !!(fa && fa.crisis && fa.crisis.check && fa.crisis.check(text));
  }
  /* crisis v3 (owner decision 2026-11-17, unchanged): with a crisis signal the page is put in the crisis state and the reading
     CONTINUES (all palm v2 texts are gentle; no straight mode here); no card replaces it; share / print / card and any paid content
     are hidden (fortune-crisis.js CALM_CSS hides [id$=Share] / [id$=Print]; the card image is not made); one warm line with the
     1323 button is docked at the END of the result (calmDock); the typed text is never echoed. */
  $("#pv2Read").addEventListener("click", function () {
    var res = $("#pv2Result");
    res.hidden = false; S.resultShown = true;
    if (crisisNow()) {
      var cr = CR();
      if (cr && cr.setActive) cr.setActive(document); else document.documentElement.setAttribute("data-lq-crisis", "1");
      $("#pv2Card").hidden = true; $("#pv2PrintImg").hidden = true;
    }
    renderReading();
    try { res.scrollIntoView({ block: "start", behavior: "instant" }); } catch (e) { /* old browser */ }
  });
  function renderReading() {
    var rd = PV.readingFor(S.st, { lang: lang() }), out = $("#pv2Reading");
    var head = S.school !== "thai" ? '<p class="pv2-draft">' + esc(T("draft.school")) + "</p>" : "";
    // the nickname (#plNick) titles the reading only when it is a plain name and the page is not calm (crisis v3: no echo)
    var nk = /** @type {HTMLInputElement|null} */ (document.getElementById("plNick")), nick = nk ? nk.value.trim() : "", cr0 = CR();
    var calm = cr0 && cr0.calmOn ? cr0.calmOn(document) : document.documentElement.hasAttribute("data-lq-crisis");
    $("#pv2ResTitle").textContent = nick && !calm && cr0 && cr0.plainName && cr0.plainName(nick) ? T("reading.title") + " · " + nick : T("reading.title");
    out.innerHTML = head + (rd.items.length ? rd.items.map(function (i) {
      var mark = i.status === "added" ? ' <small>(' + esc(T("status.added")) + ")</small>" : "";
      return '<section class="fa-section" data-line="' + i.id + '"><h4>' + esc(i.title) + mark + "</h4><p>" + esc(i.text) + "</p></section>";
    }).join("") : '<p class="pv2-empty">' + esc(T("guide.note")) + "</p>") + '<p class="pv2-small">' + esc(T("readingUsesOnly")) + "</p>";
    var cr = CR(); if (cr && cr.calmDock) cr.calmDock(out, lang()); // crisis v3: one help line at the end of the result
  }

  /* ---------- print and share card: the same layer function ---------- */
  $("#pv2Print").addEventListener("click", function () {
    if (!S.F || crisisNow()) return;
    var pc = $("#pv2PrintCanvas"), Wp = Math.min(1400, S.W), p = Wp / S.W, Hp = Math.round(S.H * p), extra = 70;
    pc.width = Wp; pc.height = Hp + extra;
    var g = pc.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, pc.width, pc.height);
    g.drawImage(S.photo, 0, 0, Wp, Hp);
    var F = S.F, toPx = function (q) { var a = F.toImg(q); return [a[0] * p, a[1] * p]; }, sc = Math.max(1, Wp / 600);
    S.layouts.print = { toPx: toPx, pw: F.pw * p };
    PV.drawLineLayer(g, S.st, "print", { toPx: toPx, lang: lang(), scale: sc });
    g.setLineDash([]); g.globalAlpha = 1; g.fillStyle = "#111111"; g.font = Math.round(14 * sc) + "px system-ui, sans-serif"; g.textBaseline = "middle";
    g.fillText(T("legend"), 12 * sc, Hp + extra / 2);
    var img = $("#pv2PrintImg"); img.src = pc.toDataURL("image/png"); img.hidden = false;
    setTimeout(function () { window.print(); }, 60);
  });
  $("#pv2Share").addEventListener("click", function () {
    if (!S.F || crisisNow()) return;
    var c = document.createElement("canvas"); c.width = 1080; c.height = 1350; c.dataset.pv2Target = "share";
    var g = c.getContext("2d"), l = lang();
    var bg = g.createLinearGradient(0, 0, 0, 1350); bg.addColorStop(0, "#0e1430"); bg.addColorStop(1, "#1e2a5a"); g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
    // a drawn palm outline (no photo of the hand), the found and added lines only
    var toPx = function (q) { return [300 + q[0] * 480, 330 + q[1] * 560]; };
    S.layouts.share = { toPx: toPx, pw: 480 };
    var outline = [[-0.14, -0.02], [1.1, 0.0], [1.14, 0.5], [1.05, 1.0], [0.75, 1.12], [0.2, 1.12], [-0.1, 0.95], [-0.2, 0.5]].map(toPx);
    g.setLineDash([]); g.globalAlpha = 1; g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,0.35)"; g.fillStyle = "rgba(255,255,255,0.06)";
    g.beginPath(); outline.forEach(function (q, i) { if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.closePath(); g.fill(); g.stroke();
    [[0.0, -0.55], [0.33, -0.62], [0.66, -0.56], [1.0, -0.4]].forEach(function (t, i) { var b = toPx([i / 3, 0]), e = toPx(t); g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(e[0], e[1]);
      g.lineWidth = 58; g.lineCap = "round"; g.strokeStyle = "rgba(255,255,255,0.06)"; g.stroke(); });
    PV.drawLineLayer(g, S.st, "share", { toPx: toPx, lang: l, scale: 2.2 });
    g.fillStyle = "#ffffff"; g.font = "bold 54px system-ui, sans-serif"; g.textBaseline = "alphabetic"; g.fillText(L("title").replace(/\s*\(.*\)|（.*）/, ""), 60, 110);
    g.font = "32px system-ui, sans-serif"; g.fillStyle = "#c9d0ea"; g.fillText(PV.schoolName(S.school, l), 60, 165);
    var names = PV.readingFor(S.st, { lang: l }).items.map(function (i) {
      return (PV.LINES.indexOf(i.id) + 1) + " " + i.title + (i.status === "absentConfirmed" ? " (" + T("status.absentConfirmed") + ")" : ""); });
    g.font = "28px system-ui, sans-serif"; g.fillStyle = "#ffffff";
    names.slice(0, 6).forEach(function (t, i) { g.fillText(t, 60, 1050 + i * 40); });
    g.font = "24px system-ui, sans-serif"; g.fillStyle = "#c9d0ea"; g.fillText("LENSIQ · " + T("belief"), 60, 1310);
    var img = $("#pv2Card"); img.src = c.toDataURL("image/png"); img.hidden = false;
  });
  $("#pv2Again").addEventListener("click", function () {
    S.photo = null; S.F = null; S.hand = null; S.det = null; $("#pv2Work").hidden = true; $("#pv2Result").hidden = true; S.resultShown = false;
    $("#pv2Card").hidden = true; $("#pv2PrintImg").hidden = true; S.sideAsk = null; renderSideAsk(); renderChoices();
    try { $("#pv2Capture").scrollIntoView({ block: "start", behavior: "instant" }); } catch (e) { /* old browser */ }
  });

  window.addEventListener("lq-lang", function () { renderTexts(); renderSideAsk(); if (S.quality && !S.quality.ok) msg(T("quality.retake"));
    setTapMsg(S.busy ? T("detect.busy") : undefined); renderList(); redraw();
    if (S.resultShown && !document.querySelector(".fa-support")) renderReading(); shownHint = ""; });
  renderTexts(); renderChoices();

  /* ---------- test hook (also handy for the owner's smoke look): state, geometry; no photo is exposed ---------- */
  function layout(target) {
    var Lo = S.layouts[target]; if (!Lo || !S.F) return null;
    var G = PV.guides(S.school), simian = ["found", "added"].indexOf(S.st.lines.simian.status) >= 0;
    return { pw: Lo.pw, lines: PV.LINES.map(function (id) {
      var Ln = S.st.lines[id], cp = Ln.status === "notFound" ? G[id].cp : Ln.cp;
      return { id: id, status: Ln.status, hidden: !!Ln.outside || (simian && (id === "heart" || id === "head")), px: cp ? PV.catmull(cp, 40).map(Lo.toPx) : null };
    }) };
  }
  WIN.__palmV2 = {
    ready: true,
    get busy() { return S.busy; },
    get lastStill() { return S.lastStill; },
    get lastDetectMs() { return S.lastDetectMs; },
    get quality() { return S.quality; },
    get sideAsk() { return S.sideAsk; },
    state: function () { return JSON.parse(PV.serialize(S.st)) && { side: S.st.side, school: S.st.school, lines: JSON.parse(JSON.stringify(S.st.lines)) }; },
    useImage: useImageUrl,
    imgToClient: imgToClient,
    uvToClient: uvToClient,
    layout: layout,
    redraw: redraw,
    setLine: function (id, o) { var r = PV.setLine(S.st, id, o); changed(); return r; }
  };
})();
