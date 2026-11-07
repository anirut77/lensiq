/* creative.js — Creative Lab (creative.html): predicted attention, clarity metrics, A/B comparison and marketing-psychology
 * guide cards for still creatives. Everything runs in this browser tab: images are decoded into in-memory canvases, never
 * uploaded, never written to storage (no localStorage/IndexedDB use on this page). Metrics: creative-core.js; text of
 * the cards: creative-guide.js. All user-facing strings go through T(key, thai) so 中文 (i18n/zh-creative.js) and a future
 * English dictionary only need the same keys.
 * Test seams (localhost only via LQDetect): ?fakedet + window.__LQ_FAKE_DET("creative") -> scripted faces, no models.
 * window.__LQ_CR exposes the state for tests/e2e/creative.e2e.mjs (numbers only, no pixels). */
(function () {
  "use strict";
  const C = window.LQCreative, G = window.LQCreativeGuide;
  const T = (key, thai, vars) => window.LQI18N ? window.LQI18N.tf(key, thai, vars) : String(thai).replace(/\{(\w+)\}/g, (m, k) => vars && vars[k] != null ? vars[k] : m);
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (v, d = 0) => v == null || !Number.isFinite(v) ? "–" : (v * 100).toFixed(d) + "%";
  const tick = () => new Promise(r => setTimeout(r, 0));
  const MAX_ITEMS = 4, SHOW_SIDE = 1600, WORK_SIDE = 512, MODEL_URL = "vendor/models/";
  const TEST = !!(window.LQDetect && LQDetect.isTest());

  const TYPES = {
    brand: { th: "แบรนด์/โลโก้", col: "#674ff2" }, product: { th: "สินค้า", col: "#0891b2" }, cta: { th: "ปุ่ม/CTA", col: "#e8590c" },
    price: { th: "ราคา/โปรโมชั่น", col: "#c2255c" }, message: { th: "ข้อความหลัก", col: "#2b8a3e" }
  };
  const typeName = t => T("cr.s.type." + t, TYPES[t] ? TYPES[t].th : t);

  /** @type {any[]} */
  const items = [];
  let cur = -1, view = "heat", drawType = null, seq = 0;
  const state = { items, get cur() { return cur; }, busy: 0, faceModel: "idle" };
  window.__LQ_CR = state;

  function engine(msg, cls = "") { const e = $("#engine"); e.textContent = msg; e.className = "engine " + cls; e.removeAttribute("data-i18n"); }

  // ------------------------------------------------------------------ tabs
  function showTab(t) {
    document.querySelectorAll(".tab").forEach(b => { const on = b.dataset.t === t; b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    document.querySelectorAll(".pane").forEach(p => { p.hidden = p.id !== "pane-" + t; });
    if (t === "compare") renderCompare();
  }
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => showTab(b.dataset.t)));
  document.querySelectorAll("[data-goto]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); showTab(a.dataset.goto); $("#tab-" + a.dataset.goto).focus(); }));

  // ------------------------------------------------------------------ faces (face-api, loaded on first use)
  let facePromise = null;
  function loadFaces() {
    if (!facePromise) {
      state.faceModel = "loading";
      engine(T("cr.js.facesload", "กำลังโหลดตัวตรวจใบหน้า (ประมาณ 0.5 MB ครั้งแรก)…"));
      facePromise = LQDetect.tfBackend().then(() => Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL), faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
      ])).then(() => { state.faceModel = "ready"; }, e => { state.faceModel = "error"; console.warn(e); throw e; });
    }
    return facePromise;
  }
  /** -> {faces:[{x,y,w,h,score,yaw,dir}], ok} normalised to the image */
  async function detectFaces(canvas) {
    const fake = window.LQDetect && LQDetect.fake("creative", 0);
    if (fake) return { ok: true, faces: fake.map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h, score: f.score ?? 0.9, yaw: f.yaw || 0, dir: (f.yaw || 0) > 0.16 ? 1 : (f.yaw || 0) < -0.16 ? -1 : 0 })) };
    if (TEST) return { ok: true, faces: [] };         // ?fakedet without scripted faces: no model download
    if (typeof faceapi === "undefined") return { ok: false, faces: [] };
    try {
      await loadFaces();
      const W = canvas.width, H = canvas.height;
      const rs = await faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 })).withFaceLandmarks();
      return { ok: true, faces: rs.slice(0, 12).map(r => {
        const b = r.detection.box, g = C.gaze({ le: r.landmarks.getLeftEye(), re: r.landmarks.getRightEye(), nose: r.landmarks.getNose()[3] });
        return { x: b.x / W, y: b.y / H, w: b.width / W, h: b.height / H, score: +r.detection.score.toFixed(3), yaw: g.yaw, dir: g.dir };
      }) };
    } catch (e) { console.warn(e); return { ok: false, faces: [] }; }
  }

  // ------------------------------------------------------------------ loading images (in memory only)
  async function decode(file) {
    if (window.createImageBitmap) { try { return await createImageBitmap(file); } catch (e) { /* fall back to <img> */ } }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.decoding = "async"; img.src = url; await img.decode(); return img;
    } finally { URL.revokeObjectURL(url); }
  }
  function toCanvas(src, side) {
    const sw = src.width || src.naturalWidth, sh = src.height || src.naturalHeight, s = C.fitSize(sw, sh, side);
    const c = document.createElement("canvas"); c.width = s.w; c.height = s.h;
    const x = c.getContext("2d", { willReadFrequently: true }); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, s.w, s.h);
    return c;
  }
  const jpegBpp = c => new Promise(res => { try { c.toBlob(b => res(b ? b.size * 8 / (c.width * c.height) : null), "image/jpeg", 0.8); } catch (e) { res(null); } });

  async function addFiles(files) {
    const list = Array.from(files || []).filter(f => /^image\//.test(f.type));
    const msg = $("#upMsg"); msg.textContent = "";
    if (!list.length) { msg.textContent = T("cr.js.noimg", "กรุณาเลือกไฟล์ภาพ"); return; }
    const room = MAX_ITEMS - items.length;
    if (room <= 0) { msg.textContent = T("cr.js.full", "เลือกได้สูงสุด {n} ภาพ ลบภาพเดิมก่อน", { n: MAX_ITEMS }); return; }
    if (list.length > room) msg.textContent = T("cr.js.toomany", "ใช้ {n} ภาพแรก (สูงสุด {max} ภาพ)", { n: room, max: MAX_ITEMS });
    state.busy++;
    try {
      for (const f of list.slice(0, room)) {
        const name = (f.name || "image").replace(/\.[a-z0-9]+$/i, "").slice(0, 40);
        engine(T("cr.js.analyzing", "กำลังวิเคราะห์ {name}…", { name }));
        let src;
        try { src = await decode(f); } catch (e) { msg.textContent = T("cr.js.decode", "เปิดภาพนี้ไม่ได้: {name}", { name }); continue; }
        const it = { id: ++seq, name, show: toCanvas(src, SHOW_SIDE), regions: [] };
        if (src.close) src.close();
        await analyse(it);
        items.push(it);
        select(items.length - 1);
        await tick();
      }
      engine(T("cr.js.ready", "วิเคราะห์แล้ว {n} ภาพ — ผลเป็นค่าคาดการณ์", { n: items.length }) + (state.faceModel === "error" ? " · " + T("cr.js.facefail", "ตรวจใบหน้าไม่ได้ ผลส่วนอื่นยังใช้ได้") : ""), "ok");
    } finally { state.busy--; }
  }

  async function analyse(it) {
    const work = toCanvas(it.show, WORK_SIDE), wx = work.getContext("2d", { willReadFrequently: true });
    const img = wx.getImageData(0, 0, work.width, work.height);
    it.W = it.show.width; it.H = it.show.height;
    await tick();
    const texts = C.detectText(img);
    const fr = await detectFaces(it.show);
    it.facesOk = fr.ok;
    it.faces = fr.faces;
    await tick();
    it.comp = C.components(img);
    it.map = C.combine(it.comp, { faces: it.faces, texts });
    it.order = C.fixationOrder(it.map, { n: 5 });
    await tick();
    it.texts = texts.map(r => ({ ...r, ...(C.textContrast(img, r) || { ratio: null, level: "n/a" }) })).filter(t => t.ratio != null);
    it.textArea = C.rectsArea(texts);
    it.palette = C.palette(img);
    it.edge = C.edgeDensity(img);
    it.colours = C.colourCount(img);
    it.complexity = C.complexityScore(it.edge, it.colours);
    it.colorful = C.colorfulness(img);
    it.bpp = await jpegBpp(work);
    it.img = img; // kept in memory for region colour checks; dropped when the item is removed
    it.thumb = toCanvas(it.show, 120);
    refresh(it);
  }
  /** recompute everything that depends on the marked regions */
  function refresh(it) {
    it.regionsR = C.regionReport(it.map, it.regions, it.order).map(r => ({ ...r, distinct: C.distinctiveness(it.img, r) }));
    it.faces.forEach(f => { f.targets = C.gazeTargets(f, f.dir, it.regions).map(r => r.type); });
    it.metrics = { name: it.name, regions: it.regionsR, order: it.order, textArea: it.textArea, texts: it.texts, complexity: it.complexity, faces: it.faces, palette: it.palette };
    it.findings = C.findings(it.metrics);
  }

  // ------------------------------------------------------------------ item list
  function renderItems() {
    const ul = $("#items"); ul.textContent = "";
    items.forEach((it, i) => {
      const li = document.createElement("li"); li.className = "item" + (i === cur ? " on" : "");
      const b = document.createElement("button"); b.type = "button"; b.className = "item-pick"; b.setAttribute("aria-pressed", i === cur ? "true" : "false");
      b.append(it.thumb); const s = document.createElement("span"); s.textContent = String.fromCharCode(65 + i) + " · " + it.name; b.append(s);
      b.addEventListener("click", () => select(i));
      const x = document.createElement("button"); x.type = "button"; x.className = "item-del"; x.textContent = "×";
      x.setAttribute("aria-label", T("cr.js.remove", "ลบ {name}", { name: it.name }));
      x.addEventListener("click", () => removeItem(i));
      li.append(b, x); ul.append(li);
    });
    $("#emptyState").hidden = items.length > 0;
    $("#work").hidden = !items.length; $("#findCard").hidden = !items.length;
  }
  function removeItem(i) {
    const it = items.splice(i, 1)[0];
    if (it) { it.img = null; it.show.width = it.show.height = 0; }
    cur = Math.min(cur, items.length - 1);
    renderAll();
    if (!items.length) engine(T("cr.s.engine0", "เลือกภาพเพื่อเริ่ม"));
  }
  function select(i) { cur = i; renderAll(); }
  function renderAll() { renderItems(); if (cur >= 0) { drawView(); renderResults(); renderFindings(); } renderCompare(); }

  // ------------------------------------------------------------------ viewer
  const canvas = $("#view");
  function heatColour(v) { // 0..1 -> rgba, blue -> cyan -> green -> yellow -> red
    const stops = [[0, 40, 90, 220], [0.3, 0, 200, 230], [0.5, 40, 200, 60], [0.7, 250, 220, 0], [1, 230, 30, 20]];
    let k = 1; while (k < stops.length - 1 && v > stops[k][0]) k++;
    const a = stops[k - 1], b = stops[k], t = Math.max(0, Math.min(1, (v - a[0]) / (b[0] - a[0] || 1)));
    return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
  }
  function mapLayer(it, mode) {
    const { w, h, data } = it.map, c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"), im = x.createImageData(w, h);
    let mx = 0; for (let i = 0; i < data.length; i++) if (data[i] > mx) mx = data[i];
    for (let i = 0; i < data.length; i++) {
      const v = mx > 0 ? data[i] / mx : 0;
      if (mode === "heat") { const [r, g, b] = heatColour(v); im.data.set([r, g, b, v < 0.12 ? 0 : Math.round(255 * Math.min(0.72, 0.15 + 0.6 * v))], 4 * i); }
      else im.data.set([8, 12, 30, Math.round(255 * 0.86 * (1 - Math.pow(v, 0.6)))], 4 * i);
    }
    x.putImageData(im, 0, 0);
    return c;
  }
  let drag = null;
  function drawView() {
    const it = items[cur]; if (!it) return;
    canvas.width = it.W; canvas.height = it.H;
    const x = canvas.getContext("2d"), W = it.W, H = it.H, u = Math.max(W, H) / 600;
    x.drawImage(it.show, 0, 0);
    if (view !== "orig") { x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(mapLayer(it, view), 0, 0, W, H); }
    if ($("#showDet").checked) {
      x.setLineDash([6 * u, 4 * u]); x.lineWidth = 2 * u;
      x.strokeStyle = "#22d3ee"; it.texts.forEach(t => x.strokeRect(t.x * W, t.y * H, t.w * W, t.h * H));
      x.strokeStyle = "#ffd43b";
      it.faces.forEach(f => {
        x.strokeRect(f.x * W, f.y * H, f.w * W, f.h * H);
        if (f.dir) { const cx = (f.x + f.w / 2) * W, cy = (f.y + f.h / 2) * H, L = f.w * W * 0.9 * f.dir; x.setLineDash([]); x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + L, cy); x.lineTo(cx + L - 10 * u * f.dir, cy - 7 * u); x.moveTo(cx + L, cy); x.lineTo(cx + L - 10 * u * f.dir, cy + 7 * u); x.stroke(); x.setLineDash([6 * u, 4 * u]); }
      });
      x.setLineDash([]);
    }
    const rects = it.regions.slice(); if (drag && drag.r) rects.push({ ...drag.r, type: drag.type, tmp: true });
    rects.forEach(r => {
      const col = TYPES[r.type] ? TYPES[r.type].col : "#fff";
      x.lineWidth = 3 * u; x.strokeStyle = "#fff"; x.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H);
      x.lineWidth = 2 * u; x.strokeStyle = col; x.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H);
      if (!r.tmp) {
        const lab = typeName(r.type); x.font = `500 ${Math.round(13 * u)}px Prompt, sans-serif`;
        const tw = x.measureText(lab).width + 10 * u; x.fillStyle = col; x.fillRect(r.x * W, Math.max(0, r.y * H - 20 * u), tw, 20 * u);
        x.fillStyle = "#fff"; x.fillText(lab, r.x * W + 5 * u, Math.max(0, r.y * H - 20 * u) + 15 * u);
      }
    });
    if ($("#showOrder").checked) it.order.forEach((o, k) => {
      const cx = o.x * W, cy = o.y * H, R = 15 * u;
      x.beginPath(); x.arc(cx, cy, R, 0, 2 * Math.PI); x.fillStyle = "rgba(14,20,48,.85)"; x.fill(); x.lineWidth = 2.5 * u; x.strokeStyle = "#fff"; x.stroke();
      x.fillStyle = "#fff"; x.font = `600 ${Math.round(16 * u)}px Prompt, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(k + 1), cx, cy + u);
      x.textAlign = "start"; x.textBaseline = "alphabetic";
    });
  }
  const posOf = e => { const b = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)), y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)) }; };
  canvas.addEventListener("pointerdown", e => {
    if (!drawType || cur < 0) return;
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    drag = { a: posOf(e), type: drawType, r: null };
  });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    const p = posOf(e), a = drag.a;
    drag.r = { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) };
    drawView();
  });
  const endDrag = () => {
    if (!drag) return;
    const r = drag.r, t = drag.type; drag = null;
    if (r && r.w > 0.015 && r.h > 0.015) addRegion(t, r); else drawView();
  };
  canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);

  function addRegion(type, r, i = cur) {
    const it = items[i]; if (!it || !TYPES[type]) return;
    const q = { x: Math.max(0, r.x), y: Math.max(0, r.y), w: Math.min(r.w, 1 - Math.max(0, r.x)), h: Math.min(r.h, 1 - Math.max(0, r.y)) };
    it.regions.push({ id: ++seq, type, ...q });
    refresh(it);
    if (i === cur) { drawView(); renderResults(); renderFindings(); }
    renderCompare();
  }
  state.addRegion = addRegion;
  state.select = select;

  function setDrawType(t) {
    drawType = drawType === t ? null : t;
    document.querySelectorAll("#typeSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.type === drawType ? "true" : "false"));
    canvas.classList.toggle("drawing", !!drawType);
  }
  document.querySelectorAll("#typeSeg button").forEach(b => { b.setAttribute("aria-pressed", "false"); b.addEventListener("click", () => setDrawType(b.dataset.type)); });
  document.querySelectorAll("#viewSeg button").forEach(b => b.addEventListener("click", () => {
    view = b.dataset.v;
    document.querySelectorAll("#viewSeg button").forEach(q => q.setAttribute("aria-pressed", q === b ? "true" : "false"));
    drawView();
  }));
  $("#showOrder").addEventListener("change", drawView);
  $("#showDet").addEventListener("change", drawView);
  $("#addCenter").addEventListener("click", () => addRegion(drawType || "brand", { x: 0.35, y: 0.35, w: 0.3, h: 0.3 }));
  $("#useText").addEventListener("click", () => {
    const it = items[cur]; if (!it) return;
    const t = it.texts.slice().sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (t) addRegion("message", t); else $("#upMsg").textContent = T("cr.js.notext", "ไม่พบกรอบข้อความในภาพนี้");
  });
  $("#clearRegions").addEventListener("click", () => { const it = items[cur]; if (!it) return; it.regions = []; refresh(it); renderAll(); });

  // ------------------------------------------------------------------ results
  const POS = { t: "บน", m: "กลาง", b: "ล่าง", l: "ซ้าย", c: "กลาง", r: "ขวา" };
  function posName(x, y) {
    const v = y < 1 / 3 ? "t" : y < 2 / 3 ? "m" : "b", h = x < 1 / 3 ? "l" : x < 2 / 3 ? "c" : "r";
    if (v === "m" && h === "c") return T("cr.js.pos.mc", "กลางภาพ");
    return T("cr.js.pos." + v + h, (h === "c" ? "กลาง" : POS[h]) + (v === "m" ? "กลาง" : POS[v]));
  }
  const BAND = { low: "ต่ำ", medium: "ปานกลาง", high: "สูง" };
  const CFB = { none: "แทบไม่มีสี", slight: "สีน้อย", moderate: "ปานกลาง", average: "ค่อนข้างสด", quite: "สด", high: "สดมาก", extreme: "สดจัด" };
  const LEVEL = { AAA: "AAA", AA: "AA", "AA-large": "AA เฉพาะตัวใหญ่", fail: "ไม่ผ่าน" };
  function tile(k, v, s) { return `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div>${s ? `<div class="s">${esc(s)}</div>` : ""}</div>`; }

  function renderResults() {
    const it = items[cur]; if (!it) return;
    const o0 = it.order[0], pass = it.texts.filter(t => t.level !== "fail").length;
    $("#tiles").innerHTML =
      tile(T("cr.js.t.first", "จุดแรกที่คาดว่าจะมอง"), o0 ? posName(o0.x, o0.y) : "–", o0 ? T("cr.js.t.firsts", "{p} ของความสนใจรอบจุดนี้", { p: pct(o0.share) }) : "") +
      tile(T("cr.js.t.cx", "ความซับซ้อน"), it.complexity + "/100", T("cr.js.band." + C.complexityBand(it.complexity), BAND[C.complexityBand(it.complexity)]) + " · " + T("cr.js.t.edge", "ขอบ {p}", { p: pct(it.edge, 1) }) + (it.bpp ? " · JPEG " + it.bpp.toFixed(2) + " bpp" : "")) +
      tile(T("cr.js.t.cf", "ความสดของสี"), Math.round(it.colorful), T("cr.js.cf." + C.colorfulBand(it.colorful), CFB[C.colorfulBand(it.colorful)])) +
      tile(T("cr.js.t.text", "พื้นที่ข้อความ"), pct(it.textArea), T("cr.js.t.blocks", "{n} กรอบ", { n: it.texts.length })) +
      tile(T("cr.js.t.wcag", "ผ่านเกณฑ์ความต่างสี"), it.texts.length ? `${pass}/${it.texts.length}` : "–", T("cr.js.t.wcags", "WCAG 2.x")) +
      tile(T("cr.js.t.faces", "ใบหน้า"), it.facesOk ? String(it.faces.length) : "–", it.facesOk ? "" : T("cr.js.t.facena", "ตรวจไม่ได้"));

    $("#orderList").innerHTML = it.order.map((o, k) => {
      const hit = it.regionsR.filter(r => r.rank === k + 1).map(r => typeName(r.type));
      return `<li><b>${k + 1}</b> <span>${esc(posName(o.x, o.y))}</span> <span class="muted">${esc(T("cr.js.share", "{p} ของความสนใจ", { p: pct(o.share) }))}</span>${hit.length ? ` <span class="tag">${esc(hit.join(", "))}</span>` : ""}</li>`;
    }).join("");

    const rt = $("#regionTable");
    if (!it.regionsR.length) rt.innerHTML = `<tbody><tr><td class="muted">${esc(T("cr.js.noreg", "ยังไม่ได้ทำเครื่องหมายพื้นที่"))}</td></tr></tbody>`;
    else rt.innerHTML = `<thead><tr><th>${esc(T("cr.js.h.type", "พื้นที่"))}</th><th class="n">${esc(T("cr.js.h.share", "ความสนใจ"))}</th><th class="n">${esc(T("cr.js.h.area", "ขนาด"))}</th><th class="n">${esc(T("cr.js.h.lift", "หนาแน่น"))}</th><th class="n">${esc(T("cr.js.h.rank", "ลำดับ"))}</th></tr></thead><tbody>` +
      it.regionsR.map(r => `<tr><td><i class="sw" style="background:${TYPES[r.type].col}"></i>${esc(typeName(r.type))}</td><td class="n">${pct(r.share)}</td><td class="n">${pct(r.area)}</td><td class="n">${r.lift.toFixed(1)}×</td><td class="n">${r.rank || "–"}</td></tr>`).join("") + "</tbody>";

    const tt = $("#textTable"), tx = it.texts.slice().sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 8);
    if (!tx.length) tt.innerHTML = `<tbody><tr><td class="muted">${esc(T("cr.js.notext", "ไม่พบกรอบข้อความในภาพนี้"))}</td></tr></tbody>`;
    else tt.innerHTML = `<thead><tr><th>${esc(T("cr.js.h.sample", "ตัวอย่างสี"))}</th><th class="n">${esc(T("cr.js.h.ratio", "อัตราส่วน"))}</th><th>${esc(T("cr.js.h.level", "ระดับ"))}</th><th>${esc(T("cr.js.h.size", "ขนาด"))}</th></tr></thead><tbody>` +
      tx.map(t => `<tr><td><span class="aa" style="color:${C.hex(t.fg)};background:${C.hex(t.bg)}">Aa</span></td><td class="n">${t.ratio.toFixed(1)}:1</td><td class="lv lv-${t.level === "fail" ? "fail" : "ok"}">${esc(T("cr.js.lv." + t.level, LEVEL[t.level] || t.level))}</td><td>${esc(t.large ? T("cr.js.large", "ตัวใหญ่") : T("cr.js.normal", "ปกติ"))}</td></tr>`).join("") + "</tbody>";

    const DIR = { "-1": T("cr.js.dir.l", "หันไปทางซ้ายของภาพ"), "0": T("cr.js.dir.c", "มองตรงมาที่ผู้ชม"), "1": T("cr.js.dir.r", "หันไปทางขวาของภาพ") };
    $("#faceList").innerHTML = !it.facesOk ? `<p class="muted">${esc(T("cr.js.facefail", "ตรวจใบหน้าไม่ได้ ผลส่วนอื่นยังใช้ได้"))}</p>`
      : !it.faces.length ? `<p class="muted">${esc(T("cr.f.gaze.none", G.FINDINGS["f.gaze.none"]))}</p>`
      : `<ul class="faces">` + it.faces.map((f, k) => `<li><b>${k + 1}.</b> ${esc(posName(f.x + f.w / 2, f.y + f.h / 2))} — ${esc(DIR[String(f.dir)])}${f.targets && f.targets.length ? ` → <span class="tag">${esc(f.targets.map(typeName).join(", "))}</span>` : ""}</li>`).join("") + "</ul>";

    const fams = [];
    $("#palette").innerHTML = `<div class="swatches">` + it.palette.map(p => {
      if (!fams.includes(p.family) && p.share >= 0.04) fams.push(p.family);
      return `<div class="swatch"><i style="background:${p.hex}"></i><b>${p.hex}</b><span>${esc(T("cr.c." + p.family + ".name", G.COLOURS[p.family].name))} · ${pct(p.share)}</span></div>`;
    }).join("") + `</div><div class="cnotes">` + fams.slice(0, 4).map(f => {
      const c = G.COLOURS[f];
      return `<details><summary>${esc(T("cr.c." + f + ".name", c.name))}</summary><p>${esc(T("cr.c." + f + ".gen", c.gen))}</p><p><b>${esc(T("cr.js.mkt.th", "ตลาดไทย:"))}</b> ${esc(T("cr.c." + f + ".th", c.th))}</p><p><b>${esc(T("cr.js.mkt.cn", "ตลาดจีน:"))}</b> ${esc(T("cr.c." + f + ".cn", c.cn))}</p></details>`;
    }).join("") + "</div>";

    const rl = $("#regionList"); rl.textContent = "";
    it.regionsR.forEach(r => {
      const li = document.createElement("li");
      const s = document.createElement("span"); s.innerHTML = `<i class="sw" style="background:${TYPES[r.type].col}"></i>${esc(typeName(r.type))} · ${pct(r.share)}`;
      const b = document.createElement("button"); b.type = "button"; b.className = "btn ghost danger"; b.textContent = T("cr.js.del", "ลบ");
      b.setAttribute("aria-label", T("cr.js.delreg", "ลบพื้นที่ {t}", { t: typeName(r.type) }));
      b.addEventListener("click", () => { it.regions = it.regions.filter(q => q.id !== r.id); refresh(it); renderAll(); });
      li.append(s, b); rl.append(li);
    });
  }

  // ------------------------------------------------------------------ guide cards
  const STATUS = { good: "ทำได้ดี", tip: "ควรปรับ", info: "ข้อมูล" };
  function refsHtml(refs) { return `<ul class="refs">` + refs.map(r => `<li><a href="${esc(r[1])}" target="_blank" rel="noopener">${esc(r[0])}</a></li>`).join("") + "</ul>"; }
  function cardHtml(c, f) {
    const k = "cr.g." + c.id + ".";
    return `<article class="gcard${f ? " st-" + f.status : ""}" data-card="${c.id}"><header><h3>${esc(T(k + "title", c.title))}</h3>${f ? `<span class="badge">${esc(T("cr.js.st." + f.status, STATUS[f.status]))}</span>` : ""}</header>` +
      (f ? `<p class="found">${esc(T("cr." + f.key, G.FINDINGS[f.key], f.vars))}</p>` : "") +
      (f ? `<p class="tip"><b>${esc(T("cr.js.try", "ลองทำ:"))}</b> ${esc(T(k + "tip", c.tip))}</p><details><summary>${esc(T("cr.js.more", "หลักการและหลักฐาน"))}</summary>` : "") +
      `<p>${esc(T(k + "what", c.what))}</p><p class="ev"><b>${esc(T("cr.js.ev", "หลักฐาน:"))}</b> ${esc(T(k + "ev", c.ev))}</p>` +
      (f ? "" : `<p class="tip"><b>${esc(T("cr.js.try", "ลองทำ:"))}</b> ${esc(T(k + "tip", c.tip))}</p>`) + refsHtml(c.refs) + (f ? "</details>" : "") + "</article>";
  }
  function renderFindings() {
    const it = items[cur]; if (!it) return;
    const order = { tip: 0, good: 1, info: 2 }, byId = {};
    it.findings.forEach(f => { if (!byId[f.id] || order[f.status] < order[byId[f.id].status]) byId[f.id] = f; });
    $("#findings").innerHTML = G.CARDS.filter(c => byId[c.id]).sort((a, b) => order[byId[a.id].status] - order[byId[b.id].status]).map(c => cardHtml(c, byId[c.id])).join("");
  }
  function renderGuide() {
    $("#guideCards").innerHTML = G.CARDS.map(c => cardHtml(c, null)).join("");
    $("#colourRefs").innerHTML = G.COLOUR_REFS.map(r => `<li><a href="${esc(r[1])}" target="_blank" rel="noopener">${esc(r[0])}</a></li>`).join("");
  }

  // ------------------------------------------------------------------ compare
  function renderCompare() {
    const body = $("#cmpBody"); if (!body) return;
    if (items.length < 2) { body.innerHTML = `<p class="empty">${esc(T("cr.s.cmp.empty", "ต้องมีอย่างน้อย 2 ภาพ"))}</p>`; return; }
    const res = C.compare(items.map(it => it.metrics)), L = i => String.fromCharCode(65 + i);
    const keyShare = it => { const R = it.regionsR.filter(r => C.KEY_TYPES.includes(r.type)); return R.length ? pct(R.reduce((a, r) => a + r.share, 0)) : "–"; };
    const keyRank = it => { const R = it.regionsR.filter(r => C.KEY_TYPES.includes(r.type) && r.rank); return R.length ? String(Math.min(...R.map(r => r.rank))) : "–"; };
    const rows = [
      [T("cr.js.c.score", "คะแนนคาดการณ์ (0–100)"), it => { const s = C.score(it.metrics).total; return s == null ? "–" : String(Math.round(s * 100)); }],
      [T("cr.js.c.key", "ความสนใจต่อแบรนด์+สินค้า+CTA+ราคา"), keyShare],
      [T("cr.js.c.rank", "ลำดับแรกที่ถึงพื้นที่สำคัญ"), keyRank],
      [T("cr.js.t.cx", "ความซับซ้อน"), it => it.complexity + "/100"],
      [T("cr.js.t.cf", "ความสดของสี"), it => String(Math.round(it.colorful))],
      [T("cr.js.t.text", "พื้นที่ข้อความ"), it => pct(it.textArea)],
      [T("cr.js.t.wcag", "ผ่านเกณฑ์ความต่างสี"), it => it.texts.length ? it.texts.filter(t => t.level !== "fail").length + "/" + it.texts.length : "–"],
      [T("cr.js.t.faces", "ใบหน้า"), it => it.facesOk ? String(it.faces.length) : "–"],
      [T("cr.js.c.gaze", "ใบหน้าหันไปทางพื้นที่สำคัญ"), it => it.faces.some(f => (f.targets || []).some(t => C.KEY_TYPES.includes(t))) ? T("cr.js.yes", "ใช่") : T("cr.js.no", "ไม่")]
    ];
    let html = `<div class="table-wrap"><table class="cmp"><thead><tr><th>${esc(T("cr.js.c.metric", "ตัวชี้วัด"))}</th>` +
      items.map((it, i) => `<th class="n">${L(i)} · ${esc(it.name)}</th>`).join("") + "</tr></thead><tbody>" +
      rows.map(r => `<tr><td>${esc(r[0])}</td>` + items.map((it, i) => `<td class="n${res.winner === i ? " win" : ""}">${esc(r[1](it))}</td>`).join("") + "</tr>").join("") + "</tbody></table></div>";
    let rec;
    if (res.winner != null) {
      const w = items[res.winner];
      rec = `<p class="rec-main">${esc(T("cr.js.c.win", "แนะนำให้นำ {l} · {name} ไปทดสอบจริงก่อน", { l: L(res.winner), name: w.name }))}</p>` +
        (res.why.length ? `<p>${esc(T("cr.js.c.why", "เด่นกว่าในเรื่อง: {list}", { list: res.why.map(k => T("cr.p." + k, G.PARTS[k])).join(", ") }))}</p>` : "");
    } else rec = `<p class="rec-main">${esc(T("cr.js.c.close", "คะแนนคาดการณ์สูสีกัน — ตัดสินจากแบบจำลองไม่ได้ ควรทดสอบ A/B กับผู้ชมจริง"))}</p>`;
    if (!res.sameRegions) rec += `<p class="muted">${esc(T("cr.js.c.noreg", "ทำเครื่องหมายแบรนด์ สินค้า หรือ CTA ในทุกภาพ เพื่อให้เทียบเรื่องความสนใจได้"))}</p>`;
    body.innerHTML = html + `<div class="rec" role="status">${rec}</div>`;
  }

  // ------------------------------------------------------------------ wiring
  const fileIn = $("#file"), drop = $("#drop");
  fileIn.addEventListener("change", () => { const f = fileIn.files; addFiles(f).finally(() => { fileIn.value = ""; }); });
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
  window.addEventListener("lq-lang", () => { renderGuide(); renderAll(); });
  state.addFiles = addFiles;
  renderGuide();
  renderItems();
})();
