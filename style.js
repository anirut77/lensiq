/* style.js — Style MVP page: personal colour palette with the white-balance step (docs/STYLE-DESIGN.md §1.1-§1.3, §1.5,
 * §3.3, §5). OFF by default: lensiq-config.js LENSIQ_STYLE must be exactly true (owner approval), otherwise this file
 * stops at its first statement and the page keeps showing the static "not available yet" notice; nothing is loaded.
 *
 * Everything runs on this device. The camera opens only when the user presses the button; frames live in memory while
 * it runs; the camera stops as soon as the result is shown. Nothing is uploaded, logged or stored, except the opt-in
 * "remember my palette" (localStorage "lq-style-palette": season ids, swatch hex, undertone band, date).
 * Models: MediaPipe Face Landmarker (Apache-2.0, vendored, facial-movement scores not requested) for the skin patches,
 * MediaPipe Selfie Multiclass (Apache-2.0, vendored) for the hair mask. No other face model is loaded on this page.
 * Test seams (only when the switch is on): ?fakelm (window.__LQ_FAKE_LM -> 478 normalised points), ?fakeseg
 * (window.__LQ_FAKE_SEG -> {hair: {x0, y0, x1, y1}} normalised). Test hook: window.__style = {state, cardPng()}.
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window);
  // The off switch comes first: while it is off nothing below runs (no script, model, content file or camera).
  if (W.LENSIQ_STYLE !== true) return;

  const $ = s => /** @type {any} */ (document.querySelector(s));
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m));
  const T = (k, th, v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : fill(th, v));
  const L = () => { const l = (W.LQI18N && W.LQI18N.lang) || "th"; return /^zh/.test(l) ? "zh" : /^en/.test(l) ? "en" : "th"; };
  const flag = n => new RegExp("[?&]" + n + "=1(&|$)").test(location.search);
  const abs = p => new URL(p, location.href).href;
  const KEY = "lq-style-palette", TARGET = { grey: 0.18, white: 0.9, paper: 0.85 }, N_FRAMES = 30, MAX_MS = 9000;
  const state = { step: "boot", camera: false, frames: 0, card: null, result: null, saved: null, drapes: null, engine: "", hair: "" };
  let C = null, S = null, content = null, cam = null, landmarker = null, timer = 0;
  let work = null, wx = null, tapAt = null, okStreak = 0, run = null, drapeIdx = 0;
  W.__style = { state, cardPng };

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = () => res(undefined); s.onerror = () => rej(new Error("load " + src));
      document.head.appendChild(s);
    });
  }
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); return true; } catch (e) { return false; } },
    del() { try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } }
  };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const nameOf = o => (o && (o[L()] || o.th)) || "";

  /* ---------- steps ---------- */
  const SECTIONS = { start: "#styStart", light: "#styLight", card: "#styCam", measure: "#styCam", drapes: "#styCam", result: "#styResult", saved: "#styResult" };
  function showStep(step) {
    state.step = step;
    for (const id of ["#styStart", "#styLight", "#styCam", "#styResult"]) $(id).hidden = SECTIONS[step] !== id;
    $("#styDrapes").hidden = step !== "drapes";
    $("#styCardOk").hidden = step === "drapes";
    for (const id of ["#styDrapeL", "#styDrapeR"]) $(id).hidden = step !== "drapes";
    if (step === "start") $("#styGoC").hidden = !savedPalette();
  }
  function savedPalette() {
    const raw = store.get();
    if (!raw || !S) return null;
    try { return S.fromSaved(JSON.parse(raw), content); } catch (e) { return null; }
  }
  const msg = (k, th, v) => { $("#styCardMsg").textContent = T(k, th, v); };

  /* ---------- engines (on device) ---------- */
  async function loadFace() {
    if (flag("fakelm") && typeof W.__LQ_FAKE_LM === "function") { state.engine = "fake"; return; }
    const { FilesetResolver, FaceLandmarker } = await import(abs("vendor/mediapipe/vision_bundle.mjs"));
    const files = await FilesetResolver.forVisionTasks(abs("vendor/mediapipe/wasm"));
    landmarker = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: abs("vendor/models/face-landmarker/face_landmarker_lm.task"), delegate: "CPU" },
      runningMode: "VIDEO", numFaces: 2, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false
    });
    state.engine = "landmarker";
  }
  async function loadHair() {
    if (flag("fakeseg") && typeof W.__LQ_FAKE_SEG === "function") { state.hair = "fake"; return; }
    try {
      if (typeof W.ort === "undefined") await loadScript("vendor/ort/ort.wasm.min.js");
      if (!W.PBHQ) await loadScript("photobooth-hq.js?v=7");
      await W.PBHQ.loadMulticlass();
      state.hair = "multiclass";
    } catch (e) { console.warn("hair mask unavailable", e); state.hair = "none"; } // season then uses the skin only
  }
  function faces(w, h) {
    if (state.engine === "fake") { const p = W.__LQ_FAKE_LM(w, h); return p ? [p] : []; }
    if (!landmarker) return [];
    const r = landmarker.detectForVideo($("#styVideo"), performance.now());
    return (r && r.faceLandmarks) || [];
  }
  async function hairMask(w, h) {
    if (state.hair === "fake") {
      const b = (W.__LQ_FAKE_SEG(w, h) || {}).hair, mw = 64, mh = 48, data = new Float32Array(mw * mh);
      if (b) for (let y = Math.floor(b.y0 * mh); y < Math.ceil(b.y1 * mh); y++) for (let x = Math.floor(b.x0 * mw); x < Math.ceil(b.x1 * mw); x++) data[y * mw + x] = 1;
      return { data, w: mw, h: mh };
    }
    if (state.hair !== "multiclass") return null;
    const { prob, S: n } = await W.PBHQ.multiclassParse(work, { x: 0, y: 0, w: work.width, h: work.height });
    return { data: prob.subarray(n * n, 2 * n * n), w: n, h: n }; // class 1 = hair
  }
  /** face box widened to the hair and ears, so the card search ignores the person */
  function faceBox(lm, w, h) {
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (const p of lm) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const fw = (x1 - x0) * w, fh = (y1 - y0) * h;
    return { x: x0 * w - 0.25 * fw, y: y0 * h - 0.6 * fh, w: 1.5 * fw, h: 1.8 * fh };
  }

  /* ---------- camera ---------- */
  async function openCamera() {
    showStep("card");
    msg("sty.cam.opening", "กำลังเปิดกล้องบนเครื่องนี้…");
    state.card = null; okStreak = 0; tapAt = null; $("#styCardOk").disabled = true;
    try {
      if (!W.LQCam) await loadScript("lensiq-camera.js?v=4");
      await loadFace();
    } catch (e) { console.warn(e); msg("sty.cam.engineErr", "โหลดตัวหาตำแหน่งแก้มบนเครื่องไม่สำเร็จ ลองเปิดหน้านี้ใหม่"); return; }
    loadHair(); // in the background: the card step does not need it
    try {
      cam = W.LQCam.create($("#styVideo"), { facing: "user", ideal: { width: 640, height: 480 }, reconnect: false });
      await cam.start();
      state.camera = true;
      try { await $("#styVideo").play(); } catch (e) { /* autoplay already running */ }
      msg("sty.cam.findCard", "ถือการ์ดไว้ข้างแก้มให้อยู่ในภาพ");
      tick();
    } catch (e) { $("#styCardMsg").textContent = W.LQCam && W.LQCam.errorText ? W.LQCam.errorText(e) : String((e && e.message) || e); }
  }
  function stopCamera() {
    clearTimeout(timer); timer = 0;
    if (cam) { try { cam.stop(); } catch (e) { /* already stopped */ } }
    state.camera = false;
    const ov = $("#styOverlay"); ov.getContext("2d").clearRect(0, 0, ov.width, ov.height);
  }
  async function lockWhiteBalance() {
    // Chrome on Android can hold white balance / exposure after the card step; iOS Safari cannot (the card stays in frame)
    try {
      const tr = cam && cam.stream && cam.stream.getVideoTracks ? cam.stream.getVideoTracks()[0] : null;
      const caps = tr && tr.getCapabilities ? tr.getCapabilities() : {};
      const adv = {};
      if (caps.whiteBalanceMode && caps.whiteBalanceMode.includes("manual")) adv.whiteBalanceMode = "manual";
      if (caps.exposureMode && caps.exposureMode.includes("manual")) adv.exposureMode = "manual";
      if (Object.keys(adv).length) await tr.applyConstraints({ advanced: [adv] });
    } catch (e) { /* not supported: per-frame card correction still applies */ }
  }
  function drawBox(box, ok) {
    const ov = $("#styOverlay"), ox = ov.getContext("2d");
    ox.clearRect(0, 0, ov.width, ov.height);
    if (!box) return;
    ox.lineWidth = Math.max(3, ov.width / 160); ox.strokeStyle = ok ? "#16a34a" : "#f59e0b";
    ox.strokeRect(box.x, box.y, box.w, box.h);
  }
  function findCard(img, lm) {
    const ex = faceBox(lm, img.width, img.height);
    const at = tapAt || (state.step === "measure" && run && run.box ? { x: run.box.x + run.box.w / 2, y: run.box.y + run.box.h / 2 } : null);
    let det = C.detectCard(img, { exclude: ex, at });
    if (!det && at && !tapAt) det = C.detectCard(img, { exclude: ex });
    if (!det) return null;
    return C.cardStats(img, det.box, { target: TARGET[$("#styCardType").value] || 0.18 });
  }
  const CARD_MSG = {
    clipped: ["sty.card.clipped", "การ์ดสว่างเกินไป (ขาวจัดจนสีหาย) ลดแสงที่ส่องการ์ดหรือใช้การ์ดสีเทา"],
    small: ["sty.card.small", "การ์ดเล็กเกินไปในภาพ ถือให้ใกล้กล้องขึ้น"],
    uneven: ["sty.card.uneven", "แสงบนการ์ดไม่สม่ำเสมอ หันการ์ดให้รับแสงเดียวกับใบหน้า"],
    dark: ["sty.card.dark", "การ์ดมืดเกินไป หันหน้าและการ์ดเข้าหาแสง"]
  };
  async function tick() {
    if (!state.camera) return;
    const video = $("#styVideo");
    try {
      if (video.readyState >= 2 && video.videoWidth && state.step !== "drapes") {
        const w = video.videoWidth, h = video.videoHeight, ov = $("#styOverlay");
        if (!work) { work = document.createElement("canvas"); wx = work.getContext("2d", { willReadFrequently: true }); }
        if (work.width !== w || work.height !== h) { work.width = w; work.height = h; ov.width = w; ov.height = h; }
        wx.drawImage(video, 0, 0, w, h);
        const img = wx.getImageData(0, 0, w, h), fs = faces(w, h);
        if (state.step === "card") cardStep(img, fs);
        else if (state.step === "measure") await measureStep(img, fs);
      }
    } catch (e) { console.warn(e); }
    if (state.camera) timer = setTimeout(tick, 33);
  }
  function cardStep(img, fs) {
    if (fs.length !== 1) {
      state.card = null; okStreak = 0; $("#styCardOk").disabled = true; drawBox(null, false);
      if (fs.length > 1) msg("sty.cam.many", "มีมากกว่าหนึ่งคนในภาพ วัดทีละคน"); else msg("sty.cam.noFace", "ยังไม่พบใบหน้า หันหน้าเข้าหากล้องในที่มีแสง");
      return;
    }
    const st = findCard(img, fs[0]);
    if (!st) { state.card = null; okStreak = 0; $("#styCardOk").disabled = true; drawBox(null, false); msg("sty.cam.noCard", "ยังหาการ์ดไม่พบ ถือการ์ดไว้ข้างแก้ม หรือแตะที่การ์ดในภาพ"); return; }
    state.card = { ok: st.ok, reasons: st.reasons, box: st.box };
    okStreak = st.ok ? okStreak + 1 : 0;
    drawBox(st.box, st.ok);
    if (st.ok) msg("sty.cam.ready", "การ์ดพร้อม");
    else { const m = CARD_MSG[st.reasons[0]] || CARD_MSG.uneven; msg(m[0], m[1]); }
    $("#styCardOk").disabled = okStreak < 3;
  }
  async function startMeasure() {
    if (!state.card || !state.card.ok) return;
    await lockWhiteBalance();
    run = { frames: [], total: 0, cardOk: 0, t0: performance.now(), mask: null, box: state.card.box };
    tapAt = null;
    state.frames = 0;
    showStep("measure");
    msg("sty.cam.measuring", "กำลังวัด… อยู่นิ่ง ๆ และให้การ์ดอยู่ในภาพ");
  }
  async function measureStep(img, fs) {
    run.total++;
    const st = fs.length === 1 ? findCard(img, fs[0]) : null;
    if (st && st.ok) { run.cardOk++; run.box = st.box; }
    drawBox(st && st.box, !!(st && st.ok));
    if (fs.length === 1 && (run.total % 4 === 1 || !run.mask)) { try { run.mask = await hairMask(img.width, img.height); } catch (e) { run.mask = null; } }
    const f = S.measureFrame(img, { landmarks: fs.length === 1 ? fs[0] : null, card: st, hairMask: run.mask, makeup: $("#styMakeup").checked });
    run.frames.push(f);
    state.frames = run.frames.filter(x => x.ok).length;
    msg("sty.cam.progress", "กำลังวัด… {n}/{t}", { n: Math.min(state.frames, N_FRAMES), t: N_FRAMES });
    if (state.frames >= N_FRAMES || performance.now() - run.t0 > MAX_MS) startDrapes();
  }

  /* ---------- virtual drapes (design §1.2 step 4, S-D2: on by default, skippable) ---------- */
  function startDrapes() {
    state.drapes = { warmth: "skip", value: "skip", chroma: "skip" };
    drapeIdx = 0;
    showStep("drapes");
    showPair();
    msg("sty.drape.msg", "ดูภาพของคุณกับสีทั้งสองฝั่ง แล้วเลือกฝั่งที่คุณชอบ ระบบไม่ตัดสินว่าแบบไหนดีกว่า");
  }
  function showPair() {
    const d = content.drapes[drapeIdx];
    if (!d) { finish(); return; }
    for (const el of document.querySelectorAll("#styDrapes .sty-drape-pair")) /** @type {HTMLElement} */ (el).hidden = el.getAttribute("data-dim") !== d.dim;
    $("#styDrapeL").style.background = d.a.hex; $("#styDrapeR").style.background = d.b.hex;
  }
  function chooseDrape(dim, side) {
    if (state.step !== "drapes" || !content.drapes[drapeIdx] || content.drapes[drapeIdx].dim !== dim) return;
    state.drapes[dim] = side; drapeIdx++;
    showPair();
  }

  /* ---------- result ---------- */
  function finish() {
    if (!run) return;
    stopCamera();
    const r = S.result(run.frames, { drapes: state.drapes, makeup: $("#styMakeup").checked, cardShare: run.total ? run.cardOk / run.total : 0 }, content);
    state.result = r; state.saved = null; run.frames = []; // frames are dropped with the result (colours only are kept)
    showStep("result");
    render();
  }
  const BAND_TXT = {
    cool: ["sty.band.cool", "อันเดอร์โทนเย็น"], "neutral-cool": ["sty.band.ncool", "อันเดอร์โทนกลางค่อนเย็น"], neutral: ["sty.band.neutral", "อันเดอร์โทนกลาง"],
    "neutral-warm": ["sty.band.nwarm", "อันเดอร์โทนกลางค่อนอุ่น"], warm: ["sty.band.warm", "อันเดอร์โทนอุ่น"], unsure: ["sty.band.unsure", "ยังบอกอันเดอร์โทนไม่ได้"]
  };
  const WHY = {
    warmth: { pos: ["sty.why.warm", "สีที่กลมกลืนกับคุณค่อนไปทางโทนอุ่น (อมเหลือง)"], neg: ["sty.why.cool", "สีที่กลมกลืนกับคุณค่อนไปทางโทนเย็น (อมฟ้าและชมพู)"],
      mid: ["sty.why.tmid", "โทนอุ่นและเย็นใกล้เคียงกัน"] },
    value: { pos: ["sty.why.light", "สีที่กลมกลืนกับคุณค่อนไปทางโทนอ่อน"], neg: ["sty.why.deep", "สีที่กลมกลืนกับคุณค่อนไปทางโทนเข้ม"],
      mid: ["sty.why.vmid", "อยู่ระหว่างโทนอ่อนและโทนเข้ม"] },
    chroma: { pos: ["sty.why.clear", "สีที่กลมกลืนกับคุณค่อนไปทางสีสดใส"], neg: ["sty.why.soft", "สีที่กลมกลืนกับคุณค่อนไปทางสีหม่นนุ่ม"],
      mid: ["sty.why.cmid", "อยู่ระหว่างสีสดและสีหม่น"] }
  };
  const CONF = { high: ["sty.conf.high", "สูง"], medium: ["sty.conf.medium", "กลาง"], low: ["sty.conf.low", "ต่ำ"] };
  const ROLES = [["base", "sty.role.base", "สีพื้นฐาน"], ["accent", "sty.role.accent", "สีเน้น"], ["metal", "sty.role.metal", "โลหะ"],
    ["away", "sty.role.away", "สีที่ใช้ห่างจากใบหน้าได้ดี (กางเกง กระโปรง รองเท้า)"]];
  const UNSURE = { frames: ["sty.un.frames", "ภาพที่ใช้ได้น้อยเกินไป"], card: ["sty.un.card", "ไม่เห็นการ์ดในภาพเกือบตลอดการวัด"],
    spread: ["sty.un.spread", "ผลแต่ละภาพต่างกันมาก แสงอาจเปลี่ยนหรือผสมกันหลายแบบ"] };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const season = id => content.seasons.find(s => s.id === id);

  function view() {
    if (state.result && state.result.status === "ok") {
      const r = state.result;
      return { ok: true, seasons: r.seasons, band: r.undertone.band, pos: r.undertone.pos, position: r.position, why: r.why, palette: r.palette, conf: r.confidence };
    }
    if (state.saved) {
      const s = state.saved, pal = S.palette(s.seasons[0], content), byHex = {};
      for (const k of Object.keys(content.colours)) byHex[content.colours[k].hex] = content.colours[k];
      const palette = s.swatches.map(hex => {
        const p = pal.find(x => x.hex === hex);
        return { hex, role: p ? p.role : "accent", name: (byHex[hex] || {}).name || { th: hex, en: hex, zh: hex } };
      });
      return { ok: true, seasons: s.seasons, band: s.undertone, pos: (S.BANDS.indexOf(s.undertone) + 0.5) / S.BANDS.length, position: null, why: [], palette, conf: null, date: s.date };
    }
    return { ok: false };
  }
  function render() {
    const v = view(), r = state.result;
    const un = $("#styUnsure"), parts = ["#styUndertone", "#stySeasons", "#styChart", "#styWhy", "#styPalette", "#styConf"];
    un.textContent = "";
    if (!v.ok) {
      un.hidden = false;
      un.appendChild(el("p", "", T("sty.res.unsure", "ยังสรุปไม่ได้ ลองใหม่ใต้แสงธรรมชาติ")));
      const ul = el("ul", "sty-list");
      for (const k of (r && r.reasons) || []) { const m = UNSURE[k]; if (m) ul.appendChild(el("li", "", T(m[0], m[1]))); }
      un.appendChild(ul);
      for (const p of parts) $(p).hidden = true;
      $("#styRemember").disabled = true; $("#styDownload").disabled = true;
    } else {
      un.hidden = true;
      for (const p of parts) $(p).hidden = false;
      $("#styRemember").disabled = false; $("#styDownload").disabled = false;
      renderUndertone(v); renderSeasons(v); renderChart(v); renderWhy(v); renderPalette(v);
      $("#styConf").hidden = !v.conf;
      if (v.conf) $("#styConf").textContent = T("sty.conf", "ความมั่นใจของผล: {c}", { c: T(CONF[v.conf][0], CONF[v.conf][1]) });
    }
    $("#styRemember").checked = !!savedPalette();
    $("#styForget").hidden = !savedPalette();
    const t = content.thresholds;
    $("#styMeta").textContent = T("sty.res.meta", "ข้อมูลสี ณ วันที่ {d} · เกณฑ์ชั่วคราว {v} ยังไม่ได้วัดกับคนจริง", { d: content.version, v: t.version }) +
      (v.date ? " · " + T("sty.res.savedOn", "บันทึกไว้เมื่อ {d}", { d: v.date }) : "");
  }
  function renderUndertone(v) {
    const box = $("#styUndertone"), b = BAND_TXT[v.band] || BAND_TXT.unsure;
    box.textContent = "";
    box.appendChild(el("b", "", T(b[0], b[1])));
    const bar = el("div", "sty-bar"), dot = el("span", "sty-bar-dot");
    dot.setAttribute("data-band", v.band); dot.style.left = (Math.max(0, Math.min(1, v.pos)) * 100).toFixed(1) + "%";
    dot.setAttribute("role", "img"); dot.setAttribute("aria-label", T(b[0], b[1]));
    bar.appendChild(dot); box.appendChild(bar);
    const ends = el("div", "sty-bar-ends");
    ends.appendChild(el("span", "", T("sty.end.cool", "เย็น"))); ends.appendChild(el("span", "", T("sty.end.warm", "อุ่น")));
    box.appendChild(ends);
  }
  function renderSeasons(v) {
    const box = $("#stySeasons");
    box.textContent = "";
    v.seasons.forEach((id, i) => {
      const s = season(id); if (!s) return;
      const d = el("div", "sty-season");
      d.setAttribute("data-season", id);
      const nm = { s: nameOf(s.name) };
      d.appendChild(el("b", "", i === 0 ? T("sty.res.closest", "ใกล้เคียงที่สุด: {s}", nm) : T("sty.res.next", "รองลงมา: {s}", nm)));
      d.appendChild(el("span", "sty-small", T("sty.res.alt", "อีกชื่อหนึ่ง: {a} · {d}", { a: nameOf(s.alt), d: nameOf(s.desc) })));
      box.appendChild(d);
    });
  }
  function renderChart(v) {
    const box = $("#styChart");
    box.textContent = "";
    if (!v.position) { box.hidden = true; return; }
    const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg"), sz = 240, m = 28, k = (sz - 2 * m) / 3;
    const X = w => m + (w + 1.5) * k, Y = val => m + (1.5 - val) * k;
    svg.setAttribute("viewBox", `0 0 ${sz} ${sz}`); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", T("sty.chart.aria", "ตำแหน่งที่วัดได้: แกนนอนเย็นถึงอุ่น แกนตั้งเข้มถึงอ่อน"));
    const add = (tag, attrs, text) => {
      const e = document.createElementNS(NS, tag);
      for (const a in attrs) e.setAttribute(a, String(attrs[a]));
      if (text) e.textContent = text;
      svg.appendChild(e);
      return e;
    };
    add("rect", { x: m, y: m, width: sz - 2 * m, height: sz - 2 * m, fill: "none", stroke: "#94a3b8" });
    add("line", { x1: sz / 2, y1: m, x2: sz / 2, y2: sz - m, stroke: "#cbd5e1" });
    add("line", { x1: m, y1: sz / 2, x2: sz - m, y2: sz / 2, stroke: "#cbd5e1" });
    const lbl = (x, y, t, anchor) => add("text", { x, y, "font-size": 11, fill: "#334155", "text-anchor": anchor || "middle" }, t);
    lbl(m, sz - 8, T("sty.end.cool", "เย็น"), "start"); lbl(sz - m, sz - 8, T("sty.end.warm", "อุ่น"), "end");
    lbl(sz / 2, 16, T("sty.axis.light", "อ่อน")); lbl(sz / 2, sz - 8, T("sty.axis.deep", "เข้ม"));
    for (const p of content.parents) {
      const ss = content.seasons.filter(s => s.parent === p.id), cx = ss.reduce((a, s) => a + s.pos.warmth, 0) / ss.length, cy = ss.reduce((a, s) => a + s.pos.value, 0) / ss.length;
      lbl(X(cx), Y(cy), nameOf(p.name));
    }
    add("circle", { cx: X(v.position.warmth), cy: Y(v.position.value), r: 7, fill: "#674ff2", stroke: "#fff", "stroke-width": 2, "data-dot": "1" });
    box.appendChild(svg);
  }
  function renderWhy(v) {
    const ul = $("#styWhy");
    ul.textContent = "";
    for (const w of v.why) { const m = WHY[w.dim] && WHY[w.dim][w.dir]; if (m) ul.appendChild(el("li", "", T(m[0], m[1]))); }
    ul.hidden = !v.why.length;
  }
  function renderPalette(v) {
    const box = $("#styPalette");
    box.textContent = "";
    box.appendChild(el("p", "sty-notice", T("sty.res.palette", "สีที่กลมกลืนกับโทนสีของคุณ")));
    for (const [role, k, th] of ROLES) {
      const items = v.palette.filter(p => p.role === role);
      if (!items.length) continue;
      box.appendChild(el("h3", "", T(k, th)));
      const grid = el("div", "sty-swatches");
      for (const p of items) {
        const d = el("div", "sty-sw"), i = el("i");
        d.setAttribute("data-hex", p.hex); i.style.background = p.hex;
        d.appendChild(i); d.appendChild(el("span", "", nameOf(p.name) + " · " + p.hex));
        grid.appendChild(d);
      }
      box.appendChild(grid);
    }
  }

  /* ---------- palette card PNG: swatches and text only, never a picture of the person ---------- */
  function wrap(ctx, text, x, y, maxW, lh) {
    const words = String(text).split(/(\s+)/);
    let line = "";
    for (const w of words) {
      if (ctx.measureText(line + w).width > maxW && line.trim()) { ctx.fillText(line.trim(), x, y); y += lh; line = w.trimStart(); } else line += w;
    }
    if (line.trim()) { ctx.fillText(line.trim(), x, y); y += lh; }
    return y;
  }
  async function cardPng() {
    const v = view();
    if (!v.ok) return null;
    const Wd = 1080, cols = 4, sw = 228, sh = 150, gap = 16, rows = Math.ceil(v.palette.length / cols), Hd = 520 + rows * (sh + 70) + 160;
    const c = document.createElement("canvas"), x = c.getContext("2d");
    c.width = Wd; c.height = Hd;
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, Wd, Hd);
    x.fillStyle = "#0e1430"; x.font = "bold 46px sans-serif"; x.fillText(T("sty.png.title", "พาเลตสีของฉัน"), 60, 100);
    x.font = "30px sans-serif"; x.fillStyle = "#334155";
    let y = 160;
    v.seasons.forEach((id, i) => {
      const s = season(id);
      if (!s) return;
      x.fillText(i ? T("sty.res.next", "รองลงมา: {s}", { s: nameOf(s.name) }) : T("sty.res.closest", "ใกล้เคียงที่สุด: {s}", { s: nameOf(s.name) }), 60, y);
      y += 46;
    });
    const b = BAND_TXT[v.band] || BAND_TXT.unsure;
    x.fillText(T(b[0], b[1]), 60, y); y += 40;
    x.fillText(T("sty.res.palette", "สีที่กลมกลืนกับโทนสีของคุณ"), 60, y + 30); y += 70;
    v.palette.forEach((p, i) => {
      const cx = 60 + (i % cols) * (sw + gap), cy = y + Math.floor(i / cols) * (sh + 70);
      x.fillStyle = p.hex; x.fillRect(cx, cy, sw, sh);
      x.strokeStyle = "#cbd5e1"; x.lineWidth = 2; x.strokeRect(cx, cy, sw, sh);
      x.fillStyle = "#0e1430"; x.font = "22px sans-serif"; x.fillText(nameOf(p.name), cx, cy + sh + 30);
      x.fillStyle = "#475569"; x.font = "18px sans-serif"; x.fillText(p.hex, cx, cy + sh + 54);
    });
    y += rows * (sh + 70) + 30;
    x.fillStyle = "#334155"; x.font = "22px sans-serif";
    y = wrap(x, T("sty.disclaimer", "ระบบซีซันสีเป็นความชอบเชิงอัตวิสัย ผลนี้เป็นคำแนะนำด้านสี ไม่ใช่การประเมินตัวคุณ"), 60, y, Wd - 120, 32);
    x.fillStyle = "#64748b"; x.font = "18px sans-serif"; x.fillText("LENSIQ", 60, Math.min(Hd - 30, y + 30));
    const blob = await new Promise(res => c.toBlob(res, "image/png"));
    return { w: Wd, h: Hd, type: blob ? blob.type : "", blob };
  }
  async function download() {
    const r = await cardPng();
    if (!r || !r.blob) return;
    const url = URL.createObjectURL(r.blob), a = document.createElement("a");
    a.href = url; a.download = "lensiq-palette.png"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ---------- wiring ---------- */
  function reset() {
    stopCamera();
    state.result = null; state.saved = null; state.card = null; state.frames = 0; state.drapes = null; run = null; tapAt = null; okStreak = 0;
    showStep("start");
  }
  function wire() {
    $("#styGoA").addEventListener("click", () => showStep("light"));
    $("#styGoC").addEventListener("click", () => { const s = savedPalette(); if (!s) return; state.saved = s; state.result = null; showStep("saved"); render(); });
    $("#styBack").addEventListener("click", () => showStep("start"));
    $("#styOpen").addEventListener("click", () => openCamera());
    $("#styStop").addEventListener("click", () => reset());
    $("#styCardOk").addEventListener("click", () => startMeasure());
    $("#stySkipDrapes").addEventListener("click", () => { if (state.step === "drapes") finish(); });
    for (const b of document.querySelectorAll("#styDrapes [data-dim][data-side]")) {
      b.addEventListener("click", () => chooseDrape(b.getAttribute("data-dim"), b.getAttribute("data-side")));
    }
    $("#styOverlay").addEventListener("click", ev => {
      if (state.step !== "card") return;
      const ov = $("#styOverlay"), rc = ov.getBoundingClientRect();
      if (!ov.width || !rc.width) return;
      const k = Math.min(rc.width / ov.width, rc.height / ov.height), ox = (rc.width - ov.width * k) / 2, oy = (rc.height - ov.height * k) / 2;
      const xr = (ev.clientX - rc.left - ox) / k, y = (ev.clientY - rc.top - oy) / k;
      tapAt = { x: ov.width - xr, y }; // the preview is mirrored
      okStreak = 0;
    });
    $("#styRemember").addEventListener("change", () => {
      if ($("#styRemember").checked) {
        const s = state.result ? S.toSaved(state.result, today()) : state.saved;
        if (!s || !store.set(JSON.stringify(s))) $("#styRemember").checked = false;
      } else store.del();
      $("#styForget").hidden = !savedPalette();
    });
    $("#styForget").addEventListener("click", () => {
      store.del(); $("#styRemember").checked = false; $("#styForget").hidden = true;
      if (state.step === "saved") reset();
    });
    $("#styDownload").addEventListener("click", () => { download(); });
    $("#styAgain").addEventListener("click", () => reset());
    W.addEventListener("lq-lang", () => {
      document.title = T("sty.title", "สีและสไตล์ส่วนตัว (ทดลอง) | LENSIQ");
      if (state.step === "result" || state.step === "saved") render();
    });
    W.addEventListener("pagehide", () => stopCamera());
  }

  async function boot() {
    $("#styOff").hidden = true;
    $("#styApp").hidden = false;
    document.title = T("sty.title", "สีและสไตล์ส่วนตัว (ทดลอง) | LENSIQ");
    try {
      await loadScript("lensiq-colour.js?v=1");
      await loadScript("lensiq-style.js?v=1");
      C = W.LQColour; S = W.LQStyle;
      const r = await fetch("vendor/style/content.json?v=1", { credentials: "same-origin" });
      if (!r.ok) throw new Error("content " + r.status);
      content = await r.json();
    } catch (e) {
      console.warn(e);
      $("#styStart").textContent = T("sty.loadErr", "โหลดข้อมูลสีไม่สำเร็จ ลองเปิดหน้านี้ใหม่");
      return;
    }
    wire();
    showStep("start");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
