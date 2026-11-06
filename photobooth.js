/* ตู้ถ่ายรูป: ตู้สติ๊กเกอร์ + รูปติดบัตร — ประมวลผลในเบราว์เซอร์ ไม่ส่งภาพออกนอกเครื่อง */
const L = window.PBLayout;
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mk = (w, h) => Object.assign(document.createElement("canvas"), { width: w, height: h });
const video = $("#video"), preview = $("#preview"), pctx = preview.getContext("2d");
const out = $("#out"), octx = out.getContext("2d");
/* i18n (TH/中文): ข้อความตามภาษาที่เลือกผ่าน LQI18N — ไม่มีคำแปลใช้ภาษาไทยเดิม; {name} เติมจาก vars */
const tr = (k, th, vars) => window.LQI18N && LQI18N.tf ? LQI18N.tf(k, th, vars) : vars ? th.replace(/\{(\w+)\}/g, (m, n) => n in vars ? String(vars[n]) : m) : th;

let camOK = false, faceOK = false, seg = null, mode = "booth", busy = false;
const engineMsgs = {};
function engine() {
  const e = $("#engine"), parts = Object.values(engineMsgs);
  const cls = parts.some(p => p.c === "err") ? "err" : parts.some(p => p.c === "warn") ? "warn" : parts.length >= 3 ? "ok" : "";
  e.textContent = parts.map(p => typeof p.t === "function" ? p.t() : p.t).join(" · ") || tr("photobooth.js.engine.prep", "กำลังเตรียมระบบ...");
  e.className = "engine " + cls;
}
const status = (k, t, c) => { engineMsgs[k] = { t, c }; engine(); }; // t = ข้อความ หรือฟังก์ชันคืนข้อความ (แปลใหม่เมื่อเปลี่ยนภาษา)
/* ข้อความใต้ปุ่มถ่าย: เก็บฟังก์ชันไว้ เพื่อแสดงใหม่เป็นภาษาที่เลือกเมื่อเปลี่ยนภาษา */
let hintFn = null;
const setHint = f => { hintFn = f; $("#shootHint").textContent = f(); };

// ---------- กล้องบนมือถือ/แท็บเล็ต: สลับหน้า/หลัง เลือกอุปกรณ์ หยุดเมื่อซ่อนหน้า ----------
const HTTPS_MSG = () => tr("photobooth.js.https", "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด");
/* ปุ่มสลับกล้อง + ตัวเลือกกล้อง (แสดงเมื่อมีกล้อง ≥ 2 ตัว) วางทับมุมขวาบนของกรอบกล้อง — กล้องเองใช้ LQCam.create (lensiq-camera.js) */
function mountCamCtl(host, cam, onError) {
  const escA = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const box = document.createElement("div"); box.className = "cam-ctl"; box.hidden = true;
  box.innerHTML = `<button type="button" class="cam-flip" aria-label="${escA(tr("photobooth.js.cam.flipAria", "สลับกล้องหน้า/หลัง"))}" title="${escA(tr("photobooth.js.cam.flipAria", "สลับกล้องหน้า/หลัง"))}" data-i18n-attr="aria-label:photobooth.js.cam.flipAria;title:photobooth.js.cam.flipAria"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h11l-3-3M20 16H9l3 3"/></svg><span data-i18n="photobooth.js.cam.flip">${escA(tr("photobooth.js.cam.flip", "สลับกล้อง"))}</span></button><select class="cam-pick" aria-label="${escA(tr("photobooth.js.cam.pick", "เลือกกล้อง"))}" data-i18n-attr="aria-label:photobooth.js.cam.pick"></select>`;
  host.append(box);
  const flip = box.querySelector(".cam-flip"), pick = box.querySelector(".cam-pick");
  const run = p => { box.classList.add("busy"); p.catch(e => { if (e?.name !== "AbortError") onError?.(e); }).finally(() => box.classList.remove("busy")); };
  flip.onclick = () => run(cam.flip());
  pick.onchange = () => run(cam.start(pick.value));
  return () => {
    const devs = cam.devices.filter(d => d.deviceId);
    box.hidden = devs.length < 2;
    pick.innerHTML = devs.map((d, i) => `<option value="${escA(d.deviceId)}">${escA(d.label || tr("photobooth.js.cam.n", "กล้อง {n}", { n: i + 1 }))}</option>`).join("");
    if (cam.deviceId) pick.value = cam.deviceId;
  };
}
/* ข้อความเตือนเมื่อเปิดผ่าน http บนเครื่องอื่น (กล้องใช้ได้เฉพาะ https / localhost) */
function showHttpsNote(before) {
  if (window.isSecureContext || document.querySelector(".https-note")) return;
  const p = document.createElement("p"); p.className = "https-note"; p.setAttribute("role", "alert");
  p.innerHTML = tr("photobooth.js.httpsHtml", `บนมือถือต้องเปิดผ่าน <b>https://</b> — ดูวิธีในหน้า <a href="cameras.html">ระบบทั้งหมด</a>`);
  before.before(p);
}

// ---------- สุ่มแบบกำหนดค่าได้ (ฉาก/ลวดลายเหมือนเดิมทุกครั้ง) ----------
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const lin = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; };

// ---------- ฉากหลัง ----------
const BGS = {
  none: { get name() { return tr("photobooth.js.bg.none", "ต้นฉบับ"); } },
  white: { get name() { return tr("photobooth.js.bg.white", "ขาว"); }, draw: (c, w, h) => { c.fillStyle = "#fff"; c.fillRect(0, 0, w, h); } },
  pink: { get name() { return tr("photobooth.js.bg.pink", "ชมพู"); }, draw: (c, w, h) => { c.fillStyle = "#ffd3e2"; c.fillRect(0, 0, w, h); } },
  mint: { get name() { return tr("photobooth.js.bg.mint", "มินต์"); }, draw: (c, w, h) => { c.fillStyle = "#c9f0e1"; c.fillRect(0, 0, w, h); } },
  navy: { get name() { return tr("photobooth.js.bg.navy", "กรมท่า"); }, draw: (c, w, h) => { c.fillStyle = "#0e1430"; c.fillRect(0, 0, w, h); } },
  sunset: { get name() { return tr("photobooth.js.bg.sunset", "พระอาทิตย์ตก"); }, draw: (c, w, h) => { c.fillStyle = lin(c, 0, 0, 0, h, ["#ff9a8b", "#ff6a88", "#ff99ac"]); c.fillRect(0, 0, w, h); } },
  pastel: { get name() { return tr("photobooth.js.bg.pastel", "พาสเทล"); }, draw: (c, w, h) => { c.fillStyle = lin(c, 0, 0, w, h, ["#a1c4fd", "#c2e9fb", "#fbc2eb"]); c.fillRect(0, 0, w, h); } },
  studio: { get name() { return tr("photobooth.js.bg.studio", "สตูดิโอ"); }, draw: (c, w, h) => { const g = c.createRadialGradient(w / 2, h * 0.4, h * 0.1, w / 2, h / 2, w * 0.8); g.addColorStop(0, "#d9dde0"); g.addColorStop(1, "#6b7378"); c.fillStyle = g; c.fillRect(0, 0, w, h); } },
  sky: {
    get name() { return tr("photobooth.js.bg.sky", "ท้องฟ้า"); }, draw: (c, w, h) => {
      c.fillStyle = lin(c, 0, 0, 0, h, ["#4a9be8", "#a9d6ff", "#e8f5ff"]); c.fillRect(0, 0, w, h);
      const r = rng(7); c.fillStyle = "rgba(255,255,255,.9)";
      for (let i = 0; i < 6; i++) { const x = r() * w, y = r() * h * 0.6, s = (0.05 + r() * 0.06) * w; [[0, 0, 1], [s * .8, s * .1, .8], [-s * .8, s * .15, .75], [s * .3, -s * .4, .8]].forEach(([dx, dy, k]) => { c.beginPath(); c.arc(x + dx, y + dy, s * k, 0, 7); c.fill(); }); }
    }
  },
  beach: {
    get name() { return tr("photobooth.js.bg.beach", "ชายหาด"); }, draw: (c, w, h) => {
      c.fillStyle = lin(c, 0, 0, 0, h * .55, ["#5fb6f2", "#bfe6ff"]); c.fillRect(0, 0, w, h * .55);
      c.fillStyle = "#ffe08a"; c.beginPath(); c.arc(w * .8, h * .18, h * .08, 0, 7); c.fill();
      c.fillStyle = lin(c, 0, h * .5, 0, h * .75, ["#1e8fc6", "#47c1d9"]); c.fillRect(0, h * .5, w, h * .25);
      c.fillStyle = "rgba(255,255,255,.7)"; for (let x = 0; x < w; x += w / 10) { c.beginPath(); c.ellipse(x + w / 20, h * .74, w / 22, h * .012, 0, 0, 7); c.fill(); }
      c.fillStyle = lin(c, 0, h * .74, 0, h, ["#f6dfae", "#e8c88a"]); c.fillRect(0, h * .74, w, h * .26);
    }
  },
  bokeh: {
    get name() { return tr("photobooth.js.bg.bokeh", "แสงโบเก้"); }, draw: (c, w, h) => {
      c.fillStyle = lin(c, 0, 0, w, h, ["#c9bcff", "#674ff2", "#0e1430"]); c.fillRect(0, 0, w, h);
      const r = rng(11);
      for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, s = (0.008 + r() * 0.04) * w; c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = Math.max(1, s * .12); c.beginPath(); c.arc(x, y, s, 0, 7); c.stroke(); c.fillStyle = "rgba(255,255,255,.18)"; c.fill(); c.fillStyle = "rgba(255,255,255,.8)"; c.beginPath(); c.arc(x - s * .35, y - s * .35, s * .18, 0, 7); c.fill(); }
    }
  }
};
function drawBg(c, key, x, y, w, h) { c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.translate(x, y); BGS[key].draw(c, w, h); c.restore(); }

// ---------- ธีมกรอบ ----------
function heart(c, x, y, s) { c.beginPath(); c.moveTo(x, y + s * .3); c.bezierCurveTo(x, y, x - s * .5, y, x - s * .5, y + s * .3); c.bezierCurveTo(x - s * .5, y + s * .6, x, y + s * .8, x, y + s); c.bezierCurveTo(x, y + s * .8, x + s * .5, y + s * .6, x + s * .5, y + s * .3); c.bezierCurveTo(x + s * .5, y, x, y, x, y + s * .3); c.fill(); }
function star(c, x, y, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = Math.PI / 5 * i - Math.PI / 2, rr = i % 2 ? r * .45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); }
const THEMES = {
  lensiq: {
    name: "LENSIQ", text: "#c9bcff", sub: "#a5f3fc", head: "LENSIQ", headFont: '700 44px Prompt, sans-serif',
    paper(c, W, H) {
      c.fillStyle = lin(c, 0, 0, 0, H, ["#0e1430", "#1e2a5a", "#0e1430"]); c.fillRect(0, 0, W, H);
      const r = rng(3); for (let i = 0; i < 46; i++) { c.fillStyle = i % 3 ? "rgba(103,79,242,.22)" : "rgba(34,211,238,.18)"; c.beginPath(); c.arc(r() * W, r() * H, 3 + r() * 14, 0, 7); c.fill(); }
    },
    cell(c, x, y, w, h) { // มุมกรอบแบบช่องมองภาพ
      c.strokeStyle = "rgba(201,188,255,.55)"; c.lineWidth = 2; rrect(c, x - 2, y - 2, w + 4, h + 4, 12); c.stroke();
      const k = Math.min(w, h) * .12; c.strokeStyle = "#22d3ee"; c.lineWidth = 5; c.lineCap = "round";
      [[x - 8, y - 8, 1, 1], [x + w + 8, y - 8, -1, 1], [x - 8, y + h + 8, 1, -1], [x + w + 8, y + h + 8, -1, -1]].forEach(([px, py, dx, dy]) => { c.beginPath(); c.moveTo(px, py + dy * k); c.lineTo(px, py); c.lineTo(px + dx * k, py); c.stroke(); });
      c.lineCap = "butt";
    }
  },
  pastel: {
    get name() { return tr("photobooth.js.theme.pastel", "พาสเทลน่ารัก"); }, text: "#d14d82", sub: "#9a5b77", head: "♡ so cute ♡", headFont: '600 36px Prompt, sans-serif',
    paper(c, W, H) { c.fillStyle = "#ffd6e7"; c.fillRect(0, 0, W, H); c.fillStyle = "rgba(255,255,255,.7)"; for (let y = 10; y < H; y += 36) for (let x = (y / 36 % 2) * 18 + 10; x < W; x += 36) { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); } },
    cell(c, x, y, w, h) { c.strokeStyle = "#fff"; c.lineWidth = 8; rrect(c, x - 4, y - 4, w + 8, h + 8, 18); c.stroke(); c.fillStyle = "#ff8fb8"; heart(c, x + w - 24, y + h - 40, 34); c.fillStyle = "#ffd36b"; star(c, x + 24, y + 24, 16); }
  },
  thai: {
    get name() { return tr("photobooth.js.theme.thai", "เทศกาลไทย"); }, text: "#f2c14e", sub: "#ffe3a3", get head() { return tr("photobooth.js.theme.thaiHead", "สนุกสุขสันต์"); }, headFont: '600 40px Prompt, sans-serif',
    paper(c, W, H) {
      c.fillStyle = "#8c1c13"; c.fillRect(0, 0, W, H); c.strokeStyle = "rgba(242,193,78,.22)"; c.lineWidth = 2;
      for (let i = -H; i < W + H; i += 40) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + H, H); c.stroke(); c.beginPath(); c.moveTo(i, H); c.lineTo(i + H, 0); c.stroke(); }
      const cols = ["#f2c14e", "#2a9d8f", "#e76f51", "#ffffff", "#6a4c93"];
      for (let x = 0, i = 0; x < W; x += 34, i++) { c.fillStyle = cols[i % cols.length]; c.beginPath(); c.moveTo(x, 8); c.lineTo(x + 30, 8); c.lineTo(x + 15, 34); c.closePath(); c.fill(); }
      c.strokeStyle = "#f2c14e"; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 8); c.lineTo(W, 8); c.stroke();
    },
    cell(c, x, y, w, h) { c.strokeStyle = "#f2c14e"; c.lineWidth = 5; c.strokeRect(x - 3, y - 3, w + 6, h + 6); c.lineWidth = 1.5; c.strokeRect(x - 10, y - 10, w + 20, h + 20); }
  },
  birthday: {
    get name() { return tr("photobooth.js.theme.birthday", "วันเกิด"); }, text: "#e05a47", sub: "#8a6d3b", head: "Happy Birthday!", headFont: '600 38px Prompt, sans-serif',
    paper(c, W, H) {
      c.fillStyle = "#fff7e0"; c.fillRect(0, 0, W, H); const r = rng(5), cols = ["#e05a47", "#2a78d6", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"];
      for (let i = 0; i < 160; i++) { c.save(); c.translate(r() * W, r() * H); c.rotate(r() * 3); c.fillStyle = cols[i % cols.length]; c.fillRect(-5, -2, 10, 4); c.restore(); }
      [[40, "#e05a47"], [W - 40, "#2a78d6"]].forEach(([x, col]) => { c.strokeStyle = "#8a6d3b"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, 62); c.quadraticCurveTo(x + 8, 90, x, 120); c.stroke(); c.fillStyle = col; c.beginPath(); c.ellipse(x, 38, 20, 25, 0, 0, 7); c.fill(); });
    },
    cell(c, x, y, w, h) { c.strokeStyle = "#fff"; c.lineWidth = 6; c.strokeRect(x - 3, y - 3, w + 6, h + 6); }
  },
  plain: {
    get name() { return tr("photobooth.js.theme.plain", "เรียบ"); }, text: "#222", sub: "#777", head: "", headFont: "",
    paper(c, W, H) { c.fillStyle = "#fff"; c.fillRect(0, 0, W, H); },
    cell(c, x, y, w, h) { c.strokeStyle = "#e5e5e5"; c.lineWidth = 1; c.strokeRect(x - .5, y - .5, w + 1, h + 1); }
  }
};

// ---------- กล้อง / การแยกฉากหลัง ----------
function grab(w, h, mirror) { // ครอปภาพจากกล้องแบบ cover
  const c = mk(w, h), x = c.getContext("2d"), vw = video.videoWidth, vh = video.videoHeight;
  const s = Math.max(w / vw, h / vh), sw = w / s, sh = h / s;
  if (mirror) { x.translate(w, 0); x.scale(-1, 1); }
  // กล้องแนวตั้ง (มือถือ): ครอปค่อนขึ้นด้านบนเล็กน้อย ให้เห็นศีรษะเต็ม
  x.drawImage(video, (vw - sw) / 2, (vh - sh) * (vh > vw ? .4 : .5), sw, sh, 0, 0, w, h);
  return c;
}
let lastTs = 0;
function segment(src) {
  if (!seg) return null;
  try {
    const ts = Math.max(lastTs + 1, performance.now()); lastTs = ts;
    const r = seg.segmentForVideo(src, ts), m = r.confidenceMasks && r.confidenceMasks[0];
    if (!m) { r.close && r.close(); return null; }
    const w = m.width, h = m.height, f = m.getAsFloat32Array(), c = mk(w, h), x = c.getContext("2d"), id = x.createImageData(w, h);
    for (let i = 0; i < f.length; i++) id.data[i * 4 + 3] = Math.max(0, Math.min(255, (f[i] - 0.3) / 0.4 * 255));
    x.putImageData(id, 0, 0); r.close && r.close();
    return c;
  } catch (e) { console.warn("segment", e); return null; }
}
const tmp = mk(1, 1), tctx = tmp.getContext("2d");
function personLayer(shot) { // ภาพคนที่ตัดฉากหลังแล้ว
  tmp.width = shot.img.width; tmp.height = shot.img.height;
  tctx.globalCompositeOperation = "source-over"; tctx.drawImage(shot.img, 0, 0);
  tctx.globalCompositeOperation = "destination-in"; tctx.drawImage(shot.mask, 0, 0, tmp.width, tmp.height);
  tctx.globalCompositeOperation = "source-over";
  return tmp;
}
function composeCell(c, shot, x, y, w, h, bgKey) {
  const p = shot.person || (shot.mask && personLayer(shot)); // shot.person = ตัดแบบคุณภาพสูง (MODNet + Guided Filter)
  if (bgKey !== "none" && p) { drawBg(c, bgKey, x, y, w, h); c.drawImage(p, x, y, w, h); }
  else c.drawImage(shot.img, x, y, w, h);
}

async function init() {
  status("cam", () => tr("photobooth.js.st.camOpening", "กำลังเปิดกล้อง..."), "");
  const camP = camera.start().catch(camErr);

  const face = (async () => {
    if (FAKE) return; // ?fakedet บน localhost: ตัวตรวจจับจำลองสำหรับทดสอบ ไม่โหลดโมเดล
    await LQDetect.tfBackend();
    await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri("vendor/models/"), faceapi.nets.faceLandmark68Net.loadFromUri("vendor/models/")]);
    try { await faceapi.nets.faceExpressionNet.loadFromUri("vendor/models/"); exprOK = true; } catch (e) { console.warn("expression model", e); }
  })().then(() => { faceOK = true; status("face", () => tr("photobooth.js.st.faceOk", "ตรวจจับใบหน้าพร้อม"), "ok"); },
    e => { console.error(e); status("face", () => tr("photobooth.js.st.faceErr", "ตรวจจับใบหน้าไม่ได้ (โหมดรูปติดบัตรจัดตำแหน่งอัตโนมัติไม่ได้)"), "warn"); });

  const segP = (async () => {
    // กราฟ ImageSegmenter ของ MediaPipe ต้องใช้ GL แม้เลือก CPU delegate: ไม่มี WebGL (หรือ ?cpu) = ข้ามไปเลย ไม่พ่น error
    if (window.LQDetect && (!LQDetect.hasWebGL() || /[?&](cpu|nogl)\b/.test(location.search))) throw Object.assign(new Error("no WebGL"), { name: "NoWebGL" });
    const { FilesetResolver, ImageSegmenter } = await import("./vendor/mediapipe/vision_bundle.mjs");
    const files = await FilesetResolver.forVisionTasks(new URL("vendor/mediapipe/wasm", location.href).href);
    let last;
    // ไม่มี WebGL (หรือ ?cpu): ข้าม GPU delegate ที่จะล้มเหลวและพ่น error ลงคอนโซล
    for (const delegate of ["GPU", "CPU"]) {
      try {
        return await ImageSegmenter.createFromOptions(files, {
          baseOptions: { modelAssetPath: new URL("vendor/models/selfie_segmenter.tflite", location.href).href, delegate },
          runningMode: "VIDEO", outputConfidenceMasks: true, outputCategoryMask: false
        });
      } catch (e) { last = e; console.warn("segmenter", delegate, e); }
    }
    throw last;
  })().then(s => { seg = s; status("seg", () => tr("photobooth.js.st.segOk", "เปลี่ยนฉากหลังอัตโนมัติพร้อม"), "ok"); },
    e => { if (e.name === "NoWebGL") console.warn("segmenter skipped: no WebGL"); else console.error(e); status("seg", () => tr("photobooth.js.st.segErr", "เปลี่ยนฉากหลังไม่ได้ในเครื่องนี้ (ใช้ภาพต้นฉบับแทน)"), "warn"); renderBgSwatches(); });

  // โหลด MODNet ล่วงหน้า (ใช้ตอนกดถ่าย เพื่อขอบผม/ขอบตัวเนียน)
  status("hq", () => tr("photobooth.js.st.hqLoading", "กำลังโหลดโมเดลตัดพื้นหลังความละเอียดสูง..."), "");
  const hqP = PBHQ.loadMatting().then(() => status("hq", () => tr("photobooth.js.st.hqOk", "ตัดพื้นหลังความละเอียดสูง (MODNet) พร้อม"), "ok"),
    e => { console.warn(e); status("hq", () => tr("photobooth.js.st.hqErr", "ตัดพื้นหลังความละเอียดสูงไม่ได้ ใช้แบบมาตรฐาน + เกลาขอบแทน"), "warn"); });

  await Promise.allSettled([camP, face, segP, hqP]);
  renderBgSwatches();
}

// ---------- กล้อง ----------
let renderCamCtl = () => {};
const camera = LQCam.create(video, {
  facing: "user", ideal: { width: 1280, height: 720 },
  onChange: (c, ev) => {
    if (ev.type === "devices") { renderCamCtl(); return; }
    camOK = c.active && !!video.videoWidth; syncPreview();
    if (ev.type === "ended") { status("cam", () => tr("photobooth.js.st.camEnded", "สัญญาณกล้องหลุด — โหลดหน้าใหม่หรือเลือกกล้องอีกครั้ง"), "err"); return; }
    if (ev.type === "error") return;
    const camKey = c.active ? (c.facing === "environment" ? ["photobooth.js.st.camBack", "กล้องหลังพร้อม"] : ["photobooth.js.st.camOk", "กล้องพร้อม"]) : ["photobooth.js.st.camPaused", "พักกล้องไว้ขณะสลับแอป"];
    status("cam", () => tr(camKey[0], camKey[1]), c.active ? "ok" : "");
  },
  onError: (c, e) => { if (e?.name !== "AbortError") camErr(e); }
});
const FAKE = !!(window.LQDetect && LQDetect.isTest());
/* ทุกใบหน้าในภาพ เรียงจากใหญ่ไปเล็ก (ใบหน้าแรก = ใช้จัดตำแหน่ง) — รูปติดบัตรต้องมีคนเดียว */
async function detectFaces(src, size, thr, expr) {
  const W = src.videoWidth || src.width, H = src.videoHeight || src.height;
  let list;
  if (FAKE) list = (LQDetect.fake(camera.deviceId || "c1", performance.now()) || []).map(d => {
    const box = { x: d.x * W, y: d.y * H, width: d.w * W, height: d.h * H }, c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // จุดจำลองเฉพาะที่ถ่ายอัตโนมัติใช้ (หางตา 36/45, ปลายจมูก 30); ไม่มีเมธอดของ face-api จึงครอปกึ่งกลางตอนถ่ายจริง
    const positions = Array.from({ length: 68 }, () => ({ ...c }));
    positions[36] = { x: box.x + box.width * .3, y: box.y + box.height * .4 }; positions[45] = { x: box.x + box.width * .7, y: box.y + box.height * .4 };
    positions[30] = { x: c.x, y: box.y + box.height * .6 };
    return { detection: { box, score: d.score }, landmarks: { positions } };
  });
  else {
    let q = faceapi.detectAllFaces(src, new faceapi.TinyFaceDetectorOptions({ inputSize: size, scoreThreshold: thr })).withFaceLandmarks();
    if (expr) q = q.withFaceExpressions();
    list = await q;
  }
  return list.sort((a, b) => b.detection.box.width * b.detection.box.height - a.detection.box.width * a.detection.box.height);
}
const MULTI_HINT = () => tr("photobooth.js.multi", "มีบุคคลอื่นในภาพ ให้อยู่คนเดียวในกรอบ");
function camErr(e) {
  console.warn(e); camOK = false;
  if (e.name === "Insecure") showHttpsNote($("#engine"));
  status("cam", () => e.name === "Insecure" ? HTTPS_MSG() : tr("photobooth.js.camErr", "เปิดกล้องไม่ได้: ") + ({ NotAllowedError: tr("photobooth.js.camErr.denied", "ไม่ได้รับอนุญาต"), NotFoundError: tr("photobooth.js.camErr.notFound", "ไม่พบกล้อง"), NotReadableError: tr("photobooth.js.camErr.busy", "กล้องถูกโปรแกรมอื่นใช้อยู่") }[e.name] || e.message), "err");
}
renderCamCtl = mountCamCtl($(".preview"), camera, camErr);
/* ขนาดพรีวิว: ตู้สติ๊กเกอร์ = 4:3 ตามช่องภาพจริง, รูปติดบัตร = ตามสัดส่วนกล้อง (แนวตั้งบนมือถือ) */
function previewDims() {
  if (mode !== "id") return [800, 600];
  const vw = video.videoWidth || 4, vh = video.videoHeight || 3, k = 800 / Math.max(vw, vh);
  return [Math.round(vw * k), Math.round(vh * k)];
}
function syncPreview() {
  const [w, h] = previewDims(), box = $(".preview");
  if (preview.width !== w || preview.height !== h) { preview.width = w; preview.height = h; }
  box.style.setProperty("--pv-ar", `${w} / ${h}`);
  box.classList.toggle("tall", h > w);
}
video.addEventListener("resize", syncPreview);
addEventListener("resize", syncPreview);
addEventListener("orientationchange", () => setTimeout(syncPreview, 350));

// ---------- พรีวิวสด ----------
let previewBusy = false;
function loop() {
  requestAnimationFrame(loop);
  if (!camOK || previewBusy || busy || !video.videoWidth) return;
  previewBusy = true;
  const W = preview.width, H = preview.height;
  try {
    if (mode === "booth") {
      const f = grab(W, H, camera.mirrored);
      const shot = { img: f, mask: booth.bg !== "none" ? segment(f) : null };
      pctx.clearRect(0, 0, W, H); composeCell(pctx, shot, 0, 0, W, H, booth.bg);
    } else {
      const f = grab(W, H, camera.mirrored), mask = segment(f);
      if (mask) { pctx.fillStyle = idState.bg; pctx.fillRect(0, 0, W, H); pctx.drawImage(personLayer({ img: f, mask }), 0, 0); }
      else pctx.drawImage(f, 0, 0);
    }
  } finally { previewBusy = false; }
}
requestAnimationFrame(loop);

// ---------- นับถอยหลัง ----------
let timerSec = 3;
document.querySelectorAll("#timerSel button").forEach(b => b.onclick = () => { timerSec = +b.dataset.s; document.querySelectorAll("#timerSel button").forEach(x => x.classList.toggle("on", x === b)); });
async function countdown(n = timerSec) {
  const el = $("#count");
  for (let i = n; i > 0; i--) { el.textContent = i; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); await sleep(900); }
  el.textContent = "";
  const fl = $("#flash"); fl.classList.add("on"); setTimeout(() => fl.classList.remove("on"), 60);
}

// =====================================================================
// ตู้สติ๊กเกอร์
// =====================================================================
const booth = { theme: "lensiq", bg: "none", n: 4, layout: "strip", shots: [], stickers: [] };
const STICKERS = ["📸", "😎", "❤️", "⭐", "🎉", "🌸", "👑", "🦄", "🎈", "✨", "🎂", "🇹🇭"];

function thumbLayout(c, key) { // วาดตัวอย่างธีม
  const Lo = L.boothLayout(4, "strip"), s = c.width / Lo.W;
  c.getContext("2d").save(); const x = c.getContext("2d"); x.scale(s, s);
  renderBoothTo(x, Lo, key, Lo.cells.map(() => null), "", false, []);
  x.restore();
}
function renderBoothTo(c, Lo, themeKey, shots, caption, showDate, stickers) {
  const th = THEMES[themeKey];
  th.paper(c, Lo.W, Lo.H);
  if (th.head) { c.fillStyle = th.text; c.font = th.headFont; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(th.head, Lo.W / 2, Lo.head.h / 2 + 12); }
  Lo.cells.forEach((cell, i) => {
    c.save(); rrect(c, cell.x, cell.y, cell.w, cell.h, 10); c.clip();
    if (shots[i]) composeCell(c, shots[i], cell.x, cell.y, cell.w, cell.h, booth.bg);
    else { c.fillStyle = "#c9d4da"; c.fillRect(cell.x, cell.y, cell.w, cell.h); c.fillStyle = "#9fb1bc"; c.beginPath(); c.arc(cell.x + cell.w / 2, cell.y + cell.h * .42, cell.h * .17, 0, 7); c.fill(); c.beginPath(); c.ellipse(cell.x + cell.w / 2, cell.y + cell.h, cell.w * .3, cell.h * .32, 0, Math.PI, 0); c.fill(); }
    c.restore();
    th.cell(c, cell.x, cell.y, cell.w, cell.h);
  });
  const fy = Lo.foot.y + Lo.foot.h / 2;
  c.textAlign = "center"; c.textBaseline = "middle";
  if (caption) { c.fillStyle = th.text; c.font = `600 ${Math.round(Lo.W / 18)}px Prompt, sans-serif`; c.fillText(caption, Lo.W / 2, showDate ? fy - 18 : fy); }
  if (showDate) { c.fillStyle = th.sub; c.font = `400 ${Math.round(Lo.W / 32)}px Prompt, sans-serif`; c.fillText(new Date().toLocaleDateString(tr("photobooth.js.dateLocale", "th-TH"), { dateStyle: "long" }), Lo.W / 2, caption ? fy + 26 : fy); }
  stickers.forEach(s => { c.font = `${s.s}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; c.fillText(s.ch, s.x, s.y); });
}
function boothLayoutNow() { return L.boothLayout(booth.shots.length || booth.n, (booth.shots.length || booth.n) >= 2 ? booth.layout : "strip"); }
function renderBooth() {
  if (!booth.shots.length) return;
  const Lo = boothLayoutNow(); out.width = Lo.W; out.height = Lo.H;
  renderBoothTo(octx, Lo, booth.theme, booth.shots, $("#caption").value.trim(), $("#showDate").checked, booth.stickers);
}

function renderThemes() {
  $("#themes").innerHTML = "";
  Object.entries(THEMES).forEach(([k, t]) => {
    const b = document.createElement("button"); b.className = "choice" + (k === booth.theme ? " on" : ""); b.type = "button";
    const c = mk(90, 280); thumbLayout(c, k); b.append(c, t.name);
    b.onclick = () => { booth.theme = k; renderThemes(); renderBooth(); };
    $("#themes").append(b);
  });
}
function renderBgSwatches() {
  $("#bgs").innerHTML = "";
  Object.entries(BGS).forEach(([k, b]) => {
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "swatch" + (k === booth.bg ? " on" : ""); btn.title = b.name;
    const c = mk(60, 60), x = c.getContext("2d");
    if (b.draw) b.draw(x, 60, 60); else { x.fillStyle = "#9fb1bc"; x.fillRect(0, 0, 60, 60); x.fillStyle = "#fff"; x.font = "26px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("📷", 30, 28); }
    const label = document.createElement("span"); label.textContent = b.name;
    btn.append(c, label);
    if (k !== "none" && !seg) btn.disabled = true, btn.style.opacity = .35;
    btn.onclick = () => { booth.bg = k; renderBgSwatches(); renderBooth(); };
    $("#bgs").append(btn);
  });
}
document.querySelectorAll("#shots button").forEach(b => b.onclick = () => { booth.n = +b.dataset.n; document.querySelectorAll("#shots button").forEach(x => x.classList.toggle("on", x === b)); syncLayoutBtns(); });
document.querySelectorAll("#layoutSel button").forEach(b => b.onclick = () => { if (b.disabled) return; booth.layout = b.dataset.l; document.querySelectorAll("#layoutSel button").forEach(x => x.classList.toggle("on", x === b)); renderBooth(); });
function syncLayoutBtns() { document.querySelectorAll("#layoutSel button").forEach(b => b.disabled = booth.n === 1); }
$("#caption").oninput = renderBooth; $("#showDate").onchange = renderBooth;

async function shootBooth() {
  booth.shots = []; booth.stickers = [];
  for (let i = 0; i < booth.n; i++) {
    const vi = { i: i + 1, n: booth.n };
    setHint(() => tr("photobooth.js.hint.pose", "ภาพที่ {i} / {n} — เตรียมโพสท่า!", vi));
    busy = false; await countdown(3); busy = true;
    const img = grab(800, 600, camera.mirrored);
    booth.shots.push({ img, mask: segment(img) });
    await sleep(500);
  }
  if (booth.bg !== "none" || seg) { // ตัดพื้นหลังคุณภาพสูงทีละภาพหลังถ่ายครบ
    for (let i = 0; i < booth.shots.length; i++) {
      const vi = { i: i + 1, n: booth.shots.length };
      setHint(() => tr("photobooth.js.hint.refine", "กำลังเกลาขอบภาพที่ {i} / {n}...", vi));
      await sleep(30);
      try { const r = await PBHQ.cutout(booth.shots[i].img, booth.shots[i].mask); if (r) booth.shots[i].person = r.canvas; } catch (e) { console.warn(e); }
    }
  }
  busy = false;
  setHint(() => tr("photobooth.js.hint.boothDone", "ถ่ายเสร็จแล้ว เปลี่ยนธีม ฉากหลัง ข้อความ หรือเพิ่มสติ๊กเกอร์ได้ที่ผลลัพธ์"));
  showBoothResult();
}
function showBoothResult(keep) { // keep = วาดใหม่ตอนเปลี่ยนภาษา (ไม่เลื่อนหน้าจอ)
  $("#result").hidden = false; $("#resultTitle").textContent = tr("photobooth.js.res.booth", "ภาพตู้สติ๊กเกอร์");
  $("#resultActions").innerHTML = "";
  current = { canvas: () => out, name: "lensiq-photobooth", title: $("#caption").value.trim() || "LENSIQ Photo Booth" };
  resultActions(true);
  const side = $("#resultSide");
  side.innerHTML = `<h3>${tr("photobooth.js.st.h", "สติ๊กเกอร์")}</h3><div class="stickers"></div><p>${tr("photobooth.js.st.help", "แตะเพื่อเพิ่ม ลากบนภาพเพื่อย้าย แตะสองครั้งเพื่อลบ")}</p><div class="row-actions"><button class="btn ghost" type="button" id="undoSt">${tr("photobooth.js.st.undo", "ลบอันล่าสุด")}</button><button class="btn ghost" type="button" id="clearSt">${tr("photobooth.js.st.clear", "ล้างทั้งหมด")}</button></div>`;
  STICKERS.forEach(ch => { const b = document.createElement("button"); b.type = "button"; b.textContent = ch; b.onclick = () => { const Lo = boothLayoutNow(); booth.stickers.push({ ch, x: Lo.W / 2 + (Math.random() - .5) * Lo.W * .4, y: Lo.H / 2 + (Math.random() - .5) * Lo.H * .3, s: Math.round(Lo.W / 7) }); renderBooth(); }; side.querySelector(".stickers").append(b); });
  $("#clearSt").onclick = () => { booth.stickers = []; renderBooth(); };
  $("#undoSt").onclick = () => { booth.stickers.pop(); renderBooth(); };
  out.classList.add("drag");
  renderBooth();
  if (!keep) $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
}
// ลากสติ๊กเกอร์
let dragging = null;
const outPt = e => { const r = out.getBoundingClientRect(); return { x: (e.clientX - r.left) * out.width / r.width, y: (e.clientY - r.top) * out.height / r.height }; };
const hitSticker = p => [...booth.stickers].reverse().find(s => Math.hypot(s.x - p.x, s.y - p.y) < s.s * .6);
out.addEventListener("pointerdown", e => { if (mode !== "booth") return; const p = outPt(e), s = hitSticker(p); if (s) { dragging = { s, dx: s.x - p.x, dy: s.y - p.y }; out.setPointerCapture(e.pointerId); } });
out.addEventListener("pointermove", e => { if (!dragging) return; const p = outPt(e); dragging.s.x = p.x + dragging.dx; dragging.s.y = p.y + dragging.dy; renderBooth(); });
out.addEventListener("pointerup", () => { dragging = null; });
out.addEventListener("dblclick", e => { if (mode !== "booth") return; const s = hitSticker(outPt(e)); if (s) { booth.stickers.splice(booth.stickers.indexOf(s), 1); renderBooth(); } });

// =====================================================================
// รูปติดบัตร
// =====================================================================
let exprOK = false;
const idState = { size: "1", bg: "#ffffff", outfit: "none", cap: null, paper: "4x6", copies: 0, marks: true, purpose: null };
const OUTFITS = {
  none: "ไม่ใส่ชุด", civil: "ชุดข้าราชการปกติขาว", khaki: "ชุดกากี", suit: "สูทสากลเทาเข้ม", suit_navy: "สูทกรมท่า",
  shirt_tie: "เชิ้ตขาวผูกเนคไท", lady: "สูทสุภาพสตรีกรมท่า", lady_black: "สูทสุภาพสตรีดำ", student: "นักศึกษาชาย", student_f: "นักศึกษาหญิง"
};
// เลือกวัตถุประสงค์ -> ตั้งชุด/ขนาด/ฉากหลังให้อัตโนมัติ
const PURPOSES = {
  gov: { get label() { return tr("photobooth.js.purpose.gov", "สอบ/สมัครราชการ"); }, outfit: "civil", size: "1", bg: "#ffffff" },
  govk: { get label() { return tr("photobooth.js.purpose.govk", "ราชการ (ชุดกากี)"); }, outfit: "khaki", size: "1", bg: "#ffffff" },
  jobm: { get label() { return tr("photobooth.js.purpose.jobm", "สมัครงาน (ชาย)"); }, outfit: "suit_navy", size: "1", bg: "#d7e7f7" },
  jobf: { get label() { return tr("photobooth.js.purpose.jobf", "สมัครงาน (หญิง)"); }, outfit: "lady", size: "1", bg: "#d7e7f7" },
  stm: { get label() { return tr("photobooth.js.purpose.stm", "นักศึกษาชาย"); }, outfit: "student", size: "1", bg: "#d7e7f7" },
  stf: { get label() { return tr("photobooth.js.purpose.stf", "นักศึกษาหญิง"); }, outfit: "student_f", size: "1", bg: "#d7e7f7" },
  raw: { get label() { return tr("photobooth.js.purpose.raw", "เอกสารที่ห้ามตกแต่ง"); }, outfit: "none", size: "2", bg: "#ffffff" }
};
function renderPurposes() {
  $("#idPurpose").innerHTML = Object.entries(PURPOSES).map(([k, p]) => `<button type="button" data-k="${k}" class="${k === idState.purpose ? "on" : ""}">${p.label}</button>`).join("");
  $("#idPurpose").querySelectorAll("button").forEach(b => b.onclick = () => {
    const p = PURPOSES[b.dataset.k];
    Object.assign(idState, { purpose: b.dataset.k, outfit: p.outfit, size: p.size, bg: p.bg });
    document.querySelectorAll("#idBg button").forEach(x => x.classList.toggle("on", x.dataset.c === p.bg));
    renderPurposes(); renderIdSizes(); syncGuide(); renderOutfitChoices(); renderId();
  });
}
/* ชุดภาพวาดแบบเวกเตอร์ย้ายไปไว้ที่ photobooth-outfits.js (ใช้ร่วมกับ studio.html) */
const drawOutfit = PBOutfits.draw;
// =====================================================================
// เทมเพลตจากรูปจริง (ชุด / กรอบ / ฉากหลัง) — เก็บใน IndexedDB
// =====================================================================
const TPL = { outfits: new Map(), items: [] };
/** รายการชุด: ชุดจากรูปจริงขึ้นก่อน ตามด้วยชุดภาพวาด */
function outfitList() {
  return [["none", tr("pbo.none", OUTFITS.none)], ...[...TPL.outfits].map(([id, t]) => ["tpl:" + id, t.name]), ...Object.entries(OUTFITS).filter(([k]) => k !== "none").map(([k, n]) => [k, tr("pbo." + k, n) + tr("pbo.drawn", " (ภาพวาด)")])];
}
function registerTemplate(item, canvas) {
  const key = "tpl:" + item.id;
  if (item.kind === "outfit") TPL.outfits.set(item.id, { name: item.name, canvas, anchor: item.anchor });
  else if (item.kind === "frame") THEMES[key] = { name: item.name, text: "#333", sub: "#777", head: "", paper(c, W, H) { c.fillStyle = "#fff"; c.fillRect(0, 0, W, H); }, cell(c, x, y, w, h) { c.drawImage(canvas, x, y, w, h); } };
  else if (item.kind === "bg") BGS[key] = { name: item.name, draw(c, w, h) { const s = Math.max(w / canvas.width, h / canvas.height); c.drawImage(canvas, (w - canvas.width * s) / 2, (h - canvas.height * s) / 2, canvas.width * s, canvas.height * s); } };
}
function unregisterTemplate(item) {
  const key = "tpl:" + item.id;
  TPL.outfits.delete(item.id); delete THEMES[key]; delete BGS[key];
  if (idState.outfit === key) idState.outfit = "none";
  if (booth.theme === key) booth.theme = "lensiq";
  if (booth.bg === key) booth.bg = "none";
}
async function loadTemplates() {
  try {
    TPL.items = await PBTpl.all();
    for (const it of TPL.items) registerTemplate(it, await PBTpl.blobToCanvas(it.blob));
  } catch (e) { console.warn("templates", e); }
  renderOutfitChoices(); renderThemes(); renderBgSwatches(); renderTplList(); renderId();
}

/** ผสานชุดเข้ากับแสงของภาพ (studio-core.js): สีของแสง gray-world, แสงซ้าย/ขวาตามใบหน้า, สีผิวคอนายแบบ -> ผิวผู้ถ่าย, grain เท่าภาพจริง
 *  ถ้าไม่มี StudioCore หรือเกิดข้อผิดพลาด จะข้ามไป (ผลเหมือนเดิม) */
function harmonizeLayer(lx, t, cx, u, W, H) {
  const hm = idState.cap && idState.cap.harm, SC = window.StudioCore; if (!hm || !SC) return;
  try {
    const id = lx.getImageData(0, 0, W, H), k = u / hm.fw; // k = อัตราย่อภาพ (noise ลดลงตามสัดส่วน)
    const res = SC.harmonizeGarment(id.data, W, H, { gray: hm.gray, skin: hm.skin, lr: hm.lr, noise: hm.noise * Math.min(1, k), cx, fw: u }, { gray: null });
    id.data.set(res); lx.putImageData(id, 0, 0);
  } catch (e) { console.warn("harmonize", e); }
}
/** วางชุดจากรูปจริง: ปรับขนาดให้ความกว้างหน้าเท่ากัน วางคางตรงกัน จับคู่ความสว่าง และเพิ่มเงาใต้คาง */
function drawRealOutfit(x, t, cx, chinY, u, userLum, W, H) {
  const a = t.anchor, s = u / a.fw;
  const auto = a.faceLum && userLum ? Math.min(1.25, Math.max(.8, userLum / a.faceLum)) : 1;
  const b = auto * (+$("#oBright").value / 100);
  const layer = mk(W, H), lx = layer.getContext("2d");
  lx.filter = `brightness(${b.toFixed(3)})`;
  lx.drawImage(t.canvas, cx - a.cx * s, chinY - a.chinY * s, t.canvas.width * s, t.canvas.height * s);
  lx.filter = "none";
  harmonizeLayer(lx, t, cx, u, W, H);
  lx.globalCompositeOperation = "source-atop"; // เงาจากคางตกลงบนคอเสื้อ
  const sy = chinY + a.faceH * s * .55, g = lx.createRadialGradient(cx, sy, 0, cx, sy, u * .75);
  g.addColorStop(0, "rgba(0,0,0,.32)"); g.addColorStop(1, "rgba(0,0,0,0)");
  lx.fillStyle = g; lx.fillRect(0, 0, W, H);
  x.drawImage(layer, 0, 0);
}

function renderOutfitChoices() {
  $("#outfits").innerHTML = "";
  outfitList().forEach(([k, name]) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "choice" + (k === idState.outfit ? " on" : "");
    const c = mk(90, 108), x = c.getContext("2d"); x.fillStyle = "#e9eef1"; x.fillRect(0, 0, 90, 108);
    if (k.startsWith("tpl:")) { // รูปตัวอย่างชุดจริง
      const t = TPL.outfits.get(k.slice(4)), cv = t.canvas, s = Math.min(84 / cv.width, 70 / cv.height);
      x.fillStyle = "#e0b48f"; x.beginPath(); x.ellipse(45, 22, 13, 17, 0, 0, 7); x.fill();
      x.drawImage(cv, 45 - cv.width * s / 2, 108 - cv.height * s, cv.width * s, cv.height * s);
    } else {
      x.fillStyle = "#e0b48f"; x.beginPath(); x.ellipse(45, 40, 18, 23, 0, 0, 7); x.fill(); x.fillRect(38, 55, 14, 14);
      drawOutfit(x, k, 45, 62, 34, 108);
    }
    b.append(c);
    const label = document.createElement("span"); label.textContent = name; b.append(label);
    if (k.startsWith("tpl:")) { const tag = document.createElement("span"); tag.className = "tag-real"; tag.textContent = tr("photobooth.js.real", "ภาพจริง"); b.append(tag); }
    b.onclick = () => { idState.outfit = k; renderOutfitChoices(); renderId(); };
    $("#outfits").append(b);
  });
}
function renderIdSizes() {
  $("#idSize").innerHTML = Object.entries(L.ID_SIZES).map(([k, s]) => `<button type="button" data-k="${k}" class="${k === idState.size ? "on" : ""}">${tr("photobooth.js.size." + k, s.label)}</button>`).join("");
  $("#idSize").querySelectorAll("button").forEach(b => b.onclick = () => { idState.size = b.dataset.k; renderIdSizes(); syncGuide(); renderId(); });
}
function syncGuide() { const s = L.ID_SIZES[idState.size]; $("#idGuide").style.setProperty("--ar", s.w / s.h); }
document.querySelectorAll("#idBg button").forEach(b => b.onclick = () => { idState.bg = b.dataset.c; document.querySelectorAll("#idBg button").forEach(x => x.classList.toggle("on", x === b)); renderId(); });
["#oScale", "#oX", "#oY", "#adjBright", "#adjSmooth"].forEach(s => $(s).oninput = renderId);

// ถ่ายอัตโนมัติ: เมื่อหน้าตรง อยู่กลางกรอบ ขนาดพอดี และนิ่งต่อเนื่อง ~1.5 วินาที
let autoStreak = 0, autoLast = null;
async function autoShootTick() {
  const on = $("#autoShoot").checked && mode === "id" && camOK && faceOK && !busy && !$("#count").textContent && !$("#shoot").disabled;
  if (on) {
    try {
      const all = await detectFaces(video, 224, .5, false), r = all[0], n = all.length;
      let good = false;
      if (n > 1) { setHint(MULTI_HINT); autoLast = null; } // ไม่ถ่ายอัตโนมัติเมื่อมีคนอื่นในภาพ
      else if (r) {
        const P = r.landmarks.positions, vw = video.videoWidth, vh = video.videoHeight;
        const eyeMid = { x: (P[36].x + P[45].x) / 2, y: (P[36].y + P[45].y) / 2 }, ed = Math.hypot(P[45].x - P[36].x, P[45].y - P[36].y);
        const yaw = Math.abs((P[30].x - eyeMid.x) / ed), tilt = Math.abs(Math.atan2(P[45].y - P[36].y, P[45].x - P[36].x)) * 57.3;
        const fw = r.detection.box.width / vw, centered = Math.abs(eyeMid.x / vw - .5) < .12 && eyeMid.y / vh > .25 && eyeMid.y / vh < .55;
        const still = autoLast ? Math.hypot(eyeMid.x - autoLast.x, eyeMid.y - autoLast.y) < ed * .08 : false;
        autoLast = eyeMid;
        good = yaw < .1 && tilt < 5 && fw > .15 && fw < .5 && centered && still;
        const hk = good ? ["good", "ดีมาก นิ่งไว้..."] : yaw >= .1 ? ["yaw", "มองตรงกล้อง"] : tilt >= 5 ? ["tilt", "ตั้งศีรษะให้ตรง"] : fw <= .15 ? ["closer", "ขยับเข้าใกล้กล้องอีกนิด"] : fw >= .5 ? ["farther", "ถอยห่างจากกล้องเล็กน้อย"] : !centered ? ["center", "เลื่อนใบหน้าให้อยู่กลางกรอบ"] : ["still", "อยู่นิ่ง ๆ"];
        setHint(() => tr("photobooth.js.auto." + hk[0], hk[1]));
      } else setHint(() => tr("photobooth.js.auto.noFace", "ไม่พบใบหน้า มองตรงกล้อง"));
      autoStreak = good ? autoStreak + 1 : 0;
      $("#idGuide").classList.toggle("auto-ring", good);
      if (autoStreak >= 3) { autoStreak = 0; $("#idGuide").classList.remove("auto-ring"); $("#autoShoot").checked = false; $("#shoot").click(); }
    } catch (e) { console.warn(e); }
  } else { autoStreak = 0; $("#idGuide").classList.remove("auto-ring"); }
  setTimeout(autoShootTick, 500);
}

async function shootId() {
  busy = false; await countdown(3); busy = true;
  const vw = video.videoWidth, vh = video.videoHeight, img = mk(vw, vh);
  img.getContext("2d").drawImage(video, 0, 0); // ไม่กลับด้าน: รูปติดบัตรต้องเหมือนจริง
  const mask = segment(img);
  let face = null, qc = null, nFaces = 0;
  if (faceOK) {
    const all = await detectFaces(img, 416, .4, exprOK), r = all[0]; // ใบหน้าใหญ่สุดใช้จัดตำแหน่ง
    nFaces = all.length;
    if (r && r.landmarks && r.landmarks.getJawOutline) {
      const lm = r.landmarks, jaw = lm.getJawOutline(), ctr = p => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });
      let a = ctr(lm.getLeftEye()), b = ctr(lm.getRightEye()); if (a.x > b.x) [a, b] = [b, a];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      face = { cx: mid.x, eyeY: mid.y, chinY: mid.y + Math.hypot(jaw[8].x - mid.x, jaw[8].y - mid.y), angle: Math.atan2(b.y - a.y, b.x - a.x), fw: Math.hypot(jaw[16].x - jaw[0].x, jaw[16].y - jaw[0].y) };
      qc = qualityCheck(img, r, face, a, b, nFaces);
      face.P = lm.positions.map(p => ({ x: p.x, y: p.y }));
    }
  }
  busy = false;
  if (!face) {
    const fk = faceOK ? ["photobooth.js.id.noFace", "ไม่พบใบหน้า กรุณาหันหน้าตรง แสงพอ แล้วถ่ายใหม่ (ใช้การครอปกึ่งกลางแทน)"] : ["photobooth.js.id.noDetector", "ระบบตรวจจับใบหน้าไม่พร้อม ใช้การครอปกึ่งกลางแทน"];
    setHint(() => tr(fk[0], fk[1]));
    face = { cx: vw / 2, eyeY: vh * .4, chinY: vh * .62, angle: 0, fw: vh * .3 };
  } else setHint(nFaces > 1 ? () => MULTI_HINT() + tr("photobooth.js.id.multiAligned", " (จัดตำแหน่งจากใบหน้าที่ใหญ่ที่สุด ควรถ่ายใหม่)") : () => tr("photobooth.js.id.aligned", "จัดตำแหน่งอัตโนมัติแล้ว เลือกชุดและปรับตำแหน่งได้ทางซ้าย"));
  let person = null, method = "";
  const hint = hintFn;
  setHint(() => tr("photobooth.js.id.cutting", "กำลังตัดพื้นหลังและเกลาขอบความละเอียดสูง..."));
  await sleep(30);
  try { const r = await PBHQ.cutout(img, mask); if (r) { person = r.canvas; method = r.method; } } catch (e) { console.warn(e); }
  if (!person && mask) { const p = personLayer({ img, mask }); person = mk(p.width, p.height); person.getContext("2d").drawImage(p, 0, 0); method = "MediaPipe"; }
  setHint(() => hint() + (method ? tr("photobooth.js.id.method", " · ตัดพื้นหลังด้วย {method}", { method }) : ""));
  let faceLum = null; // ความสว่างผิวหน้าผู้ถ่าย ใช้จับคู่แสงกับชุดจากรูปจริง
  if (face.P) { const bx = { x: face.cx - face.fw * .2, y: face.eyeY + (face.chinY - face.eyeY) * .1, w: face.fw * .4, h: (face.chinY - face.eyeY) * .5 }; faceLum = PBTpl.meanLum(img.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, img.width, img.height).data, img.width, bx); }
  let harm = null; // สถิติแสง/สีผิว/noise ของภาพผู้ถ่าย สำหรับผสานชุดจากรูปจริงให้กลมกลืน
  if (window.StudioCore && face.P) {
    try {
      const SC = StudioCore, W = img.width, H = img.height, px = img.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
      const fb = { x: face.cx - face.fw * .3, y: face.eyeY, w: face.fw * .6, h: (face.chinY - face.eyeY) * .7 };
      const half = (x0) => PBTpl.meanLum(px, W, { x: x0, y: fb.y, w: fb.w / 2, h: fb.h });
      harm = { gray: SC.grayWorld(px, W, H, null, { neutral: true }).mean, skin: SC.labStats(px, W, H, null, { box: fb, step: 2 }), lr: [half(fb.x), half(fb.x + fb.w / 2)], noise: SC.estimateNoise(px, W, H, null, 3), fw: face.fw };
      if (!harm.lr[0] || !harm.lr[1]) harm.lr = null;
    } catch (e) { console.warn("harm", e); }
  }
  idState.cap = { img, mask, person, face, qc, method, rt: {}, faceLum, harm };
  showIdResult();
}

/* ตรวจคุณภาพรูปติดบัตรจากจุดบนใบหน้า (ค่าประมาณ ไม่ใช่การรับรองของหน่วยงาน) */
function qualityCheck(img, r, face, eyeL, eyeR, nFaces = 1) {
  const lm = r.landmarks, P = lm.positions, d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const ear = e => (d(e[1], e[5]) + d(e[2], e[4])) / (2 * d(e[0], e[3]) || 1);
  const eyesOpen = Math.min(ear(lm.getLeftEye()), ear(lm.getRightEye()));
  const mouthGap = d(P[62], P[66]) / face.fw;
  const yaw = (P[30].x - (eyeL.x + eyeR.x) / 2) / (d(eyeL, eyeR) || 1);
  const tilt = face.angle * 180 / Math.PI;
  // ความสว่างซ้าย/ขวาของใบหน้า และความคมชัด
  const bx = r.detection.box, W = 64, H = 64, c = mk(W, H), x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, bx.x, bx.y, bx.width, bx.height, 0, 0, W, H);
  const px = x.getImageData(0, 0, W, H).data, lum = i => .299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2];
  let L = 0, R = 0, n = 0, lap = 0, lapN = 0; const g = [];
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) { const v = lum((yy * W + xx) * 4); g.push(v); if (xx < W / 2) L += v; else R += v; n++; }
  for (let yy = 1; yy < H - 1; yy++) for (let xx = 1; xx < W - 1; xx++) { const i = yy * W + xx; const v = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W]; lap += v * v; lapN++; }
  L /= n / 2; R /= n / 2;
  const bright = (L + R) / 2, balance = Math.abs(L - R) / Math.max(1, (L + R) / 2), sharp = lap / lapN;
  const ex = r.expressions, neutral = ex ? (ex.neutral || 0) : null, smile = ex ? (ex.happy || 0) : null;
  // ข้อความแต่ละข้อเป็นฟังก์ชัน: แปลตามภาษาที่เลือกตอนแสดงผล
  const q = (k, th, v) => () => tr("photobooth.js.qc." + k, th, v), deg = { deg: Math.abs(tilt).toFixed(1) };
  const items = [
    [nFaces <= 1, q("single", "มีบุคคลเดียวในภาพ"), q("singleBad", "มีบุคคลอื่นในภาพ รูปติดบัตรต้องมีผู้ถ่ายคนเดียว ควรถ่ายใหม่")],
    [Math.abs(yaw) < .12, q("yaw", "หน้าตรง ไม่หันซ้าย/ขวา"), q("yawBad", "หน้าเอียงไปด้านข้าง ควรมองตรงกล้อง")],
    [Math.abs(tilt) < 6, q("tilt", "ศีรษะตรง (ปรับเอียงให้แล้ว {deg}°)", deg), q("tiltBad", "ศีรษะเอียง {deg}° ระบบหมุนแก้ให้แล้ว แต่ควรถ่ายใหม่ให้ตรง", deg)],
    [eyesOpen > .2, q("eyes", "ลืมตาปกติ"), q("eyesBad", "ตาอาจปิดหรือหรี่ ควรถ่ายใหม่")],
    [mouthGap < .04, q("mouth", "ปิดปาก"), q("mouthBad", "ปากเปิด ควรปิดปากสนิท")],
    [neutral == null || neutral > .5 || smile < .5, q("expr", "สีหน้าปกติ/สุภาพ"), q("exprBad", "ยิ้มกว้างเกินไปสำหรับรูปราชการ")],
    [bright > 70 && bright < 210, q("light", "แสงพอดี"), bright <= 70 ? q("dark", "ภาพมืดเกินไป เพิ่มแสงด้านหน้า") : q("bright", "ภาพสว่างเกินไป")],
    [balance < .25, q("even", "แสงสม่ำเสมอทั้งสองข้างใบหน้า"), q("evenBad", "แสงไม่เท่ากัน มีเงาด้านหนึ่งของใบหน้า")],
    [sharp > 60, q("sharp", "ภาพคมชัด"), q("sharpBad", "ภาพอาจเบลอ ให้นิ่งขณะถ่าย")]
  ];
  return { items, pass: items.filter(i => i[0]).length, total: items.length };
}
function renderIdPhoto({ outfit = idState.outfit, res = 1 } = {}) { // คืน canvas รูปติดบัตร 300 DPI (res<1 = ภาพตัวอย่าง)
  const s = L.ID_SIZES[idState.size], W = Math.round(L.cmToPx(s.w) * res), H = Math.round(L.cmToPx(s.h) * res), c = mk(W, H), x = c.getContext("2d");
  const { img, person, face } = idState.cap;
  x.fillStyle = idState.bg; x.fillRect(0, 0, W, H);
  const cr = L.idCrop(face, { w: W, h: H }), sc = cr.scale;
  const ex = (face.cx - cr.sx) * sc, ey = (face.eyeY - cr.sy) * sc;
  const bright = +$("#adjBright").value / 100, smooth = +$("#adjSmooth").value / 100;
  // ผิวเนียนแบบรักษาขอบ เฉพาะบริเวณผิวหน้า (ตา คิ้ว ปาก ผม คมเหมือนเดิม) — แคชตามระดับ
  let base = person || img;
  if (smooth > 0 && face.P) { const key = smooth.toFixed(2); base = idState.cap.rt[key] ||= PBHQ.retouch(base, face.P, smooth); }
  const drawPerson = () => { x.filter = `brightness(${bright}) contrast(1.03)`; x.save(); x.translate(ex, ey); x.rotate(-face.angle); x.scale(sc, sc); x.translate(-face.cx, -face.eyeY); x.drawImage(base, 0, 0); x.restore(); x.filter = "none"; };
  drawPerson();
  if (outfit === "none") return c;
  const k = +$("#oScale").value / 100, u = face.fw * sc * k;
  const chinOut = ey + (face.chinY - face.eyeY) * sc, ox = ex + (+$("#oX").value / 100) * W, oy = chinOut + (+$("#oY").value / 100) * H;
  if (outfit.startsWith("tpl:")) { const t = TPL.outfits.get(outfit.slice(4)); if (t) drawRealOutfit(x, t, ox, oy, u, idState.cap.faceLum, W, H); }
  else drawOutfit(x, outfit, ox, oy, u, H);
  // วาดศีรษะทับอีกครั้ง (เหนือคาง) เพื่อไม่ให้คอเสื้อบังคาง/ผม
  x.save(); x.beginPath(); x.rect(0, 0, W, chinOut + u * .03); x.clip(); drawPerson(); x.restore();
  return c;
}
function renderGallery() { // แสดงทุกชุดบนใบหน้าจริงของผู้ถ่าย
  const g = $("#outfitGallery"); if (!g || !idState.cap) return;
  g.innerHTML = "";
  outfitList().forEach(([k, name]) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "choice" + (k === idState.outfit ? " on" : "");
    b.append(renderIdPhoto({ outfit: k, res: .35 }), name);
    b.onclick = () => { idState.outfit = k; renderOutfitChoices(); renderId(); };
    g.append(b);
  });
}
function renderSheet(photo) {
  const p = L.PAPERS[idState.paper], s = L.ID_SIZES[idState.size];
  const t = L.tileSheet(p, s, { max: idState.copies || Infinity }), c = mk(t.W, t.H), x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, t.W, t.H);
  t.pos.forEach(q => {
    x.drawImage(photo, q.x, q.y, q.w, q.h);
    if (idState.marks) { x.strokeStyle = "#9a9a9a"; x.lineWidth = 2; const m = 22, o = 6;
      [[q.x, q.y, -1, -1], [q.x + q.w, q.y, 1, -1], [q.x, q.y + q.h, -1, 1], [q.x + q.w, q.y + q.h, 1, 1]].forEach(([px, py, dx, dy]) => { x.beginPath(); x.moveTo(px + dx * o, py); x.lineTo(px + dx * (o + m), py); x.moveTo(px, py + dy * o); x.lineTo(px, py + dy * (o + m)); x.stroke(); }); }
  });
  x.fillStyle = "#888"; x.font = "24px Prompt, sans-serif"; x.textAlign = "center";
  x.fillText(tr("photobooth.js.sheet.foot", "{size} × {n} รูป · 300 DPI · สั่งพิมพ์ขนาดจริง 100% (ห้ามย่อ/ขยาย)", { size: tr("photobooth.js.size." + idState.size, s.label), n: t.count }), t.W / 2, t.H - 18);
  return { canvas: c, info: t };
}
// ---------- AI เปลี่ยนชุดให้สมจริง (ปิดไว้จนกว่าจะตั้งค่า API key ที่เซิร์ฟเวอร์) ----------
let aiEnabled = false, aiReason = null, aiNC = false;
fetch("/api/tryon/status").then(r => r.ok ? r.json() : null).then(s => { aiEnabled = !!(s && s.enabled); aiReason = s && s.reason || null; aiNC = !!(s && s.noncommercial); }).catch(() => {});
/** เหตุผลที่ AI ปิดอยู่ (จาก /api/tryon/status: reason) — แสดงให้ผู้ดูแลรู้ว่าต้องตั้งค่าอะไร */
const aiReasonText = () => ({
  "no-token": tr("photobooth.js.ai.r.noToken", "ยังไม่ได้ตั้งค่า API key ของ Replicate ที่เซิร์ฟเวอร์"),
  "no-model": tr("photobooth.js.ai.r.noModel", "ยังไม่ได้เลือกโมเดลที่มีสิทธิ์ใช้เชิงพาณิชย์"),
  "license-not-attested": tr("photobooth.js.ai.r.license", "ผู้ดูแลยังไม่ยืนยันสัญญาอนุญาตของโมเดล"),
  "model-is-noncommercial": tr("photobooth.js.ai.r.nc", "โมเดลที่ตั้งไว้ห้ามใช้เชิงพาณิชย์ จึงปิดไว้")
}[aiReason] || tr("photobooth.js.ai.r.offline", "ไม่พบเซิร์ฟเวอร์ AI (เปิดหน้าแบบไฟล์ static)"));
const aiKey = () => [idState.outfit, idState.size, idState.bg, ...["#oScale", "#oX", "#oY", "#oBright", "#adjBright", "#adjSmooth"].map(s => $(s).value)].join("|");
function aiPanelHTML() {
  if (!aiEnabled) return `<h3>${tr("photobooth.js.ai.h", "✨ AI ปรับชุดให้สมจริง")}</h3><p class="note">${tr("photobooth.js.ai.off2", "ยังไม่เปิดใช้งาน: {r}", { r: String(aiReasonText()).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c])) })}</p>`;
  return `<h3>${tr("photobooth.js.ai.h", "✨ AI ปรับชุดให้สมจริง")}</h3>
    ${aiNC ? `<p class="note">${tr("photobooth.js.ai.ncDemo", "โหมดสาธิตเท่านั้น: โมเดลนี้ห้ามใช้เชิงพาณิชย์")}</p>` : ""}
    <p class="note">${tr("photobooth.js.ai.note", "ใช้ได้กับชุดที่มีป้าย \"ภาพจริง\" รูปจะถูกส่งไปประมวลผลที่ Replicate (ต่างประเทศ) ใช้เวลา ~20-60 วินาที")}</p>
    <label class="check"><input type="checkbox" id="aiConsent"><span>${tr("photobooth.js.ai.consent", "ผู้ถ่ายยินยอมให้ส่งรูปไปประมวลผลด้วย AI ภายนอก")}</span></label>
    <button class="btn ghost full" type="button" id="aiRun">${tr("photobooth.js.ai.run", "✨ สร้างภาพด้วย AI")}</button><p class="hint" id="aiMsg"></p>`;
}
async function runAI() {
  const msg = t => { $("#aiMsg").textContent = t; };
  if (!idState.outfit.startsWith("tpl:")) return msg(tr("photobooth.js.ai.needReal", "กรุณาเลือกชุดที่มีป้าย \"ภาพจริง\" ก่อน"));
  if (!$("#aiConsent").checked) return msg(tr("photobooth.js.ai.needConsent", "ต้องได้รับความยินยอมจากผู้ถ่ายก่อน"));
  const t = TPL.outfits.get(idState.outfit.slice(4));
  const human = renderIdPhoto({ outfit: "none" });
  const garment = mk(t.canvas.width + 40, t.canvas.height + 40), gx = garment.getContext("2d");
  gx.fillStyle = "#fff"; gx.fillRect(0, 0, garment.width, garment.height); gx.drawImage(t.canvas, 20, 20);
  const fd = new FormData();
  fd.append("human", await PBTpl.toBlob(human), "human.png");
  fd.append("garment", await PBTpl.toBlob(garment), "garment.png");
  fd.append("desc", t.name); fd.append("consent", "yes");
  $("#aiRun").disabled = true; msg(tr("photobooth.js.ai.busy", "กำลังสร้างภาพด้วย AI..."));
  try {
    const r = await fetch("/api/tryon", { method: "POST", body: fd });
    if (!r.ok) { let e = tr("photobooth.js.ai.fail", "ไม่สำเร็จ"); try { e = (await r.json()).error || e; } catch {} throw new Error(e); }
    const bmp = await createImageBitmap(await r.blob());
    const c = mk(human.width, human.height), cx = c.getContext("2d"), s = Math.max(c.width / bmp.width, c.height / bmp.height);
    cx.drawImage(bmp, (c.width - bmp.width * s) / 2, (c.height - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    idState.ai = { key: aiKey(), photo: c };
    renderId(); msg(tr("photobooth.js.ai.done", "สร้างภาพสำเร็จ (ถ้าเปลี่ยนชุดหรือปรับค่า จะกลับไปใช้ภาพปกติ)"));
  } catch (e) { msg("AI: " + e.message); }
  finally { $("#aiRun").disabled = false; }
}

function renderId() {
  if (mode !== "id" || !idState.cap) return;
  const photo = idState.ai && idState.ai.key === aiKey() ? idState.ai.photo : renderIdPhoto(), sheet = renderSheet(photo);
  out.width = sheet.canvas.width; out.height = sheet.canvas.height; octx.drawImage(sheet.canvas, 0, 0);
  idState.last = { photo, sheet: sheet.canvas };
  const info = $("#sheetInfo"); if (info) info.textContent = tr("photobooth.js.sheet.info", "{n} รูป (สูงสุด {max} รูปต่อแผ่น)", { n: sheet.info.count, max: sheet.info.capacity });
  clearTimeout(renderId.t); renderId.t = setTimeout(renderGallery, 120); // หน่วงเล็กน้อยเวลาลากแถบปรับ
}
function showIdResult(keep) { // keep = วาดใหม่ตอนเปลี่ยนภาษา (ไม่เลื่อนหน้าจอ)
  $("#result").hidden = false; $("#resultTitle").textContent = tr("photobooth.js.res.id", "รูปติดบัตร (แผ่นพิมพ์)");
  $("#resultActions").innerHTML = "";
  current = { canvas: () => idState.last.photo, name: "lensiq-id-photo", title: tr("photobooth.js.res.idTitle", "รูปติดบัตร") };
  addAction(tr("photobooth.js.act.sheet", "⬇ แผ่นพิมพ์ PNG"), () => downloadCanvas(idState.last.sheet, "lensiq-id-sheet"), true);
  addAction(tr("photobooth.js.act.single", "⬇ รูปเดี่ยว PNG"), () => downloadCanvas(idState.last.photo, "lensiq-id-photo"));
  addAction(tr("photobooth.js.act.printReal", "🖨 พิมพ์ขนาดจริง"), printResult);
  addAction(tr("photobooth.js.act.shareSingle", "แชร์รูปเดี่ยว"), () => shareCurrent());
  addAction(tr("photobooth.js.act.handoff", "ส่งต่อ"), openHandoff);
  addAction(tr("photobooth.js.act.retake", "ถ่ายใหม่"), () => $("#shoot").click());
  const qc = idState.cap.qc;
  $("#resultSide").innerHTML = `
    <h3>${tr("photobooth.js.res.gallery", "เลือกชุดจากรูปของคุณ")}</h3><div class="choices gallery" id="outfitGallery"></div>
    ${aiPanelHTML()}
    <h3>${tr("photobooth.js.qc.h", "ตรวจคุณภาพรูป")} ${qc ? tr("photobooth.js.qc.pass", "(ผ่าน {pass}/{total})", { pass: qc.pass, total: qc.total }) : ""}</h3>
    ${qc ? `<ul class="qc">${qc.items.map(([ok, good, bad]) => `<li class="${ok ? "ok" : "warn"}">${(ok ? good : bad)()}</li>`).join("")}</ul>${qc.pass < qc.total ? `<p class="note">${tr("photobooth.js.qc.retake", "แนะนำให้ถ่ายใหม่ตามข้อที่มีเครื่องหมาย !")}</p>` : ""}` : `<p class="note">${tr("photobooth.js.qc.none", "ตรวจคุณภาพไม่ได้ เพราะไม่พบใบหน้า")}</p>`}
    <h3>${tr("photobooth.js.res.paper", "กระดาษ")}</h3><select id="paper">${Object.entries(L.PAPERS).map(([k, p]) => `<option value="${k}" ${k === idState.paper ? "selected" : ""}>${tr("photobooth.js.paper." + k, p.label)}</option>`).join("")}</select>
    <h3>${tr("photobooth.js.res.copies", "จำนวนรูป")}</h3><select id="copies"><option value="0">${tr("photobooth.js.res.full", "เต็มแผ่น")}</option>${[1, 2, 4, 6, 8, 10, 12].map(n => `<option value="${n}" ${n === idState.copies ? "selected" : ""}>${tr("photobooth.js.res.nCopies", "{n} รูป", { n })}</option>`).join("")}</select>
    <label class="check"><input type="checkbox" id="marks" ${idState.marks ? "checked" : ""}><span>${tr("photobooth.js.res.marks", "แสดงเส้นตัด")}</span></label>
    <p id="sheetInfo"></p>
    <p>${seg ? "" : tr("photobooth.js.res.noSeg", "เครื่องนี้เปลี่ยนสีฉากหลังอัตโนมัติไม่ได้ ควรถ่ายหน้าผนังสีขาว/ฟ้าเรียบ ")}${tr("photobooth.js.res.rules", "ตรวจสอบว่าหน้าตรง ไม่ใส่แว่นกันแดด และเห็นใบหูตามข้อกำหนดของหน่วยงาน")}</p>`;
  $("#paper").onchange = e => { idState.paper = e.target.value; renderId(); };
  $("#copies").onchange = e => { idState.copies = +e.target.value; renderId(); };
  $("#marks").onchange = e => { idState.marks = e.target.checked; renderId(); };
  if ($("#aiRun")) $("#aiRun").onclick = runAI;
  out.classList.remove("drag");
  renderId();
  if (!keep) $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- ทั่วไป ----------
function addAction(label, fn, primary) { const b = document.createElement("button"); b.type = "button"; b.className = "btn " + (primary ? "primary" : "ghost"); b.textContent = label; b.onclick = fn; $("#resultActions").append(b); return b; }
function resultActions() { // ตู้สติ๊กเกอร์: แชร์ / ดาวน์โหลด / พิมพ์ / ส่งต่อ
  const canShare = !!navigator.share;
  addAction(canShare ? tr("photobooth.js.act.share", "แชร์ภาพ") : tr("photobooth.js.act.download", "⬇ ดาวน์โหลด"), () => canShare ? shareCurrent() : downloadCanvas(out, current.name), true);
  if (canShare) addAction(tr("photobooth.js.act.download", "⬇ ดาวน์โหลด"), () => downloadCanvas(out, current.name));
  addAction(tr("photobooth.js.act.print", "🖨 พิมพ์"), printResult);
  addAction(tr("photobooth.js.act.handoff", "ส่งต่อ"), openHandoff);
  addAction(tr("photobooth.js.act.retake", "ถ่ายใหม่"), () => { $(".stage").scrollIntoView({ behavior: "smooth", block: "start" }); $("#shoot").click(); });
}
let current = null; // ผลลัพธ์ที่กำลังแสดง { canvas(), name, title }
const fileStamp = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const canvasBlob = c => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error(tr("photobooth.js.err.blob", "สร้างไฟล์ภาพไม่สำเร็จ"))), "image/png"));
function saveBlob(blob, filename) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function downloadCanvas(c, name) { canvasBlob(c).then(b => saveBlob(b, `${name}-${fileStamp()}.png`)).catch(e => toast(e.message)); }
function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2600); }
/* แชร์ไฟล์ภาพผ่าน Web Share (มือถือ) ถ้าไม่รองรับไฟล์ให้ดาวน์โหลดแทน */
async function shareCurrent() {
  if (!current) return;
  const c = current.canvas(), blob = await canvasBlob(c), file = new File([blob], `${current.name}-${fileStamp()}.png`, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: current.title }); return; }
    catch (e) { if (e.name === "AbortError") return; console.warn("share", e); }
  }
  saveBlob(blob, file.name); toast(tr("photobooth.js.toast.noShare", "อุปกรณ์นี้แชร์ไฟล์ไม่ได้ ดาวน์โหลดภาพให้แทนแล้ว"));
}
/* ส่งต่อแบบไม่ใช้ QR: แสดงภาพให้กดค้างบันทึก/AirDrop, คัดลอกภาพ, ดาวน์โหลด หรือเปิดในแท็บใหม่ */
let handoffBlob = null, handoffURL = "";
async function openHandoff() {
  if (!current) return;
  const dlg = $("#handoff");
  try { handoffBlob = await canvasBlob(current.canvas()); } catch (e) { return toast(e.message); }
  if (handoffURL) URL.revokeObjectURL(handoffURL);
  handoffURL = URL.createObjectURL(handoffBlob); $("#handoffImg").src = handoffURL;
  $("#hoCopy").hidden = !(navigator.clipboard?.write && window.ClipboardItem);
  $("#hoShare").hidden = !navigator.share;
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
}
$("#hoClose").onclick = () => $("#handoff").close ? $("#handoff").close() : $("#handoff").removeAttribute("open");
$("#handoff").addEventListener("click", e => { if (e.target === $("#handoff")) $("#hoClose").click(); });
$("#hoSave").onclick = () => handoffBlob && saveBlob(handoffBlob, `${current.name}-${fileStamp()}.png`);
$("#hoOpen").onclick = () => handoffURL && window.open(handoffURL, "_blank", "noopener");
$("#hoShare").onclick = () => shareCurrent();
$("#hoCopy").onclick = async () => {
  try { await navigator.clipboard.write([new ClipboardItem({ "image/png": handoffBlob })]); toast(tr("photobooth.js.toast.copied", "คัดลอกภาพแล้ว วางในแชตหรืออีเมลได้เลย")); }
  catch (e) { console.warn(e); toast(tr("photobooth.js.toast.copyFail", "คัดลอกไม่ได้ในเบราว์เซอร์นี้ ใช้วิธีกดค้างที่ภาพแทน")); }
};
/* พิมพ์เฉพาะภาพผลลัพธ์ (รูปติดบัตรพิมพ์ตามขนาดกระดาษจริง) */
function printResult() {
  const root = document.documentElement, isId = mode === "id";
  root.classList.toggle("print-id", isId);
  if (isId) { const p = L.PAPERS[idState.paper]; root.style.setProperty("--print-w", p.w + "cm"); }
  window.print();
}
addEventListener("afterprint", () => document.documentElement.classList.remove("print-id"));

// ---------- โหมดคีออสก์ (เต็มจอ ซ่อนเมนู) ----------
const kioskBtn = $("#kiosk"), root = document.documentElement;
const kioskLabel = on => on ? tr("photobooth.js.kioskExit", "ออกจากโหมดคีออสก์") : tr("pb.kiosk", "⛶ โหมดคีออสก์");
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
function setKiosk(on) {
  root.classList.toggle("pb-kiosk", on);
  kioskBtn.setAttribute("aria-pressed", on ? "true" : "false");
  kioskBtn.textContent = kioskLabel(on);
  syncPreview(); scrollTo(0, 0);
}
kioskBtn.onclick = async () => {
  const on = !root.classList.contains("pb-kiosk");
  setKiosk(on);
  try {
    if (on) await (root.requestFullscreen ? root.requestFullscreen({ navigationUI: "hide" }) : root.webkitRequestFullscreen?.());
    else if (fsEl()) await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen?.());
  } catch (e) { console.warn("fullscreen", e); } // iPhone ไม่รองรับเต็มจอ: ใช้โหมดซ่อนเมนูอย่างเดียว
};
["fullscreenchange", "webkitfullscreenchange"].forEach(ev => document.addEventListener(ev, () => { if (!fsEl() && root.classList.contains("pb-kiosk")) setKiosk(false); }));
$("#shoot").onclick = async () => {
  if (!camOK) { setHint(() => tr("photobooth.js.hint.camNotReady", "กล้องยังไม่พร้อม ดูสถานะด้านบน")); return; }
  if (busy || $("#count").textContent) return;
  $("#shoot").disabled = true;
  try { mode === "booth" ? await shootBooth() : await shootId(); }
  catch (e) { console.error(e); setHint(() => tr("photobooth.js.hint.shootFail", "ถ่ายไม่สำเร็จ: ") + e.message); }
  finally { busy = false; $("#shoot").disabled = false; }
};
// ---------- หน้าจัดการเทมเพลต ----------
let tplPrep = null, tplFinal = null, assetKind = "frame";
const tplMsg = (t, cls = "") => { $("#tplMsg").textContent = t; $("#tplMsg").className = "hint " + cls; };
function showTplPreview() {
  tplFinal = PBTpl.finalizeOutfit(tplPrep, +$("#tplNeck").value / 100);
  const c = $("#tplCanvas"), f = tplFinal.canvas, a = tplFinal.anchor;
  c.width = f.width; c.height = f.height; const x = c.getContext("2d"); x.drawImage(f, 0, 0);
  x.strokeStyle = "#e67e22"; x.lineWidth = Math.max(2, f.width / 200); x.setLineDash([8, 6]); // เส้นแสดงตำแหน่งคางที่จะวางให้ตรงกับผู้ถ่าย
  x.beginPath(); x.moveTo(a.cx - a.fw / 2, a.chinY); x.lineTo(a.cx + a.fw / 2, a.chinY); x.stroke();
}
$("#tplFile").onchange = async () => {
  const f = $("#tplFile").files[0]; if (!f) return;
  $("#tplSave").disabled = true; tplMsg(tr("photobooth.js.tpl.busy", "กำลังตัดพื้นหลังและหาตำแหน่งคอ... (อาจใช้เวลาสักครู่)"));
  try {
    tplPrep = await PBTpl.prepareOutfit(f);
    showTplPreview(); $("#tplSave").disabled = false;
    if (!$("#tplName").value) $("#tplName").value = f.name.replace(/\.[^.]+$/, "");
    tplMsg(tplPrep.anchor.faceLum != null ? tr("photobooth.js.tpl.face", "พบใบหน้านายแบบ ตัดศีรษะออกแล้ว ปรับ \"ระดับคอเสื้อ\" ให้พอดีคอปก (เส้นประ = ตำแหน่งคาง)") : tr("photobooth.js.tpl.png", "ไฟล์ชุดพื้นใส: ประมาณตำแหน่งคอจากรูปทรง อาจต้องปรับแถบตำแหน่งตอนใช้งาน"), "ok");
  } catch (e) { console.error(e); tplPrep = null; tplMsg(e.message ? tr(e.message, e.message) : tr("photobooth.js.tpl.fail", "ประมวลผลไม่สำเร็จ"), "err"); }
};
$("#tplNeck").oninput = () => tplPrep && showTplPreview();
$("#tplSave").onclick = async () => {
  if (!tplFinal) return;
  const item = { id: crypto.randomUUID(), kind: "outfit", name: $("#tplName").value.trim() || tr("photobooth.js.tpl.defName", "ชุดของฉัน"), anchor: tplFinal.anchor, blob: await PBTpl.toBlob(tplFinal.canvas), created: Date.now() };
  try { await PBTpl.put(item); } catch (e) { return tplMsg(tr("photobooth.js.saveFail", "บันทึกไม่สำเร็จ: ") + e.message, "err"); }
  TPL.items.push(item); registerTemplate(item, tplFinal.canvas);
  idState.outfit = "tpl:" + item.id;
  renderOutfitChoices(); renderTplList(); renderId();
  tplMsg(tr("photobooth.js.tpl.saved", "บันทึก \"{name}\" แล้ว เลือกใช้ได้ที่แท็บรูปติดบัตร", { name: item.name }), "ok");
  $("#tplFile").value = ""; $("#tplName").value = ""; tplPrep = tplFinal = null; $("#tplSave").disabled = true;
};
document.querySelectorAll("#assetKind button").forEach(b => b.onclick = () => { assetKind = b.dataset.k; document.querySelectorAll("#assetKind button").forEach(x => x.classList.toggle("on", x === b)); });
$("#assetSave").onclick = async () => {
  const f = $("#assetFile").files[0], m = $("#assetMsg");
  if (!f) { m.textContent = tr("photobooth.js.asset.noFile", "กรุณาเลือกไฟล์"); return; }
  try {
    const c = await PBTpl.fileToCanvas(f);
    const item = { id: crypto.randomUUID(), kind: assetKind, name: $("#assetName").value.trim() || f.name.replace(/\.[^.]+$/, ""), blob: await PBTpl.toBlob(c), created: Date.now() };
    await PBTpl.put(item); TPL.items.push(item); registerTemplate(item, c);
    renderThemes(); renderBgSwatches(); renderTplList();
    m.textContent = tr("photobooth.js.asset.saved", "บันทึก \"{name}\" แล้ว เลือกใช้ได้ที่แท็บตู้สติ๊กเกอร์", { name: item.name }); $("#assetFile").value = ""; $("#assetName").value = "";
  } catch (e) { console.error(e); m.textContent = tr("photobooth.js.saveFail", "บันทึกไม่สำเร็จ: ") + e.message; }
};
function renderTplList() {
  const el = $("#tplList"); if (!el) return;
  const kindTh = { outfit: tr("photobooth.js.kind.outfit", "ชุด"), frame: tr("photobooth.js.kind.frame", "กรอบรูป"), bg: tr("photobooth.js.kind.bg", "ฉากหลัง") };
  el.innerHTML = TPL.items.length ? "" : `<p class="hint">${tr("pb.asset.none", "ยังไม่มี")}</p>`;
  TPL.items.forEach(it => {
    const d = document.createElement("div"); d.className = "tpl-item";
    const img = document.createElement("img"); img.alt = it.name; img.src = URL.createObjectURL(it.blob); img.onload = () => URL.revokeObjectURL(img.src);
    const name = document.createElement("div"); name.textContent = `${kindTh[it.kind]}: ${it.name}`;
    const del = document.createElement("button"); del.type = "button"; del.textContent = tr("photobooth.js.tpl.del", "ลบ");
    del.onclick = async () => { if (!confirm(tr("photobooth.js.tpl.delQ", "ลบ \"{name}\"?", { name: it.name }))) return; await PBTpl.del(it.id); TPL.items = TPL.items.filter(x => x.id !== it.id); unregisterTemplate(it); renderOutfitChoices(); renderThemes(); renderBgSwatches(); renderTplList(); renderId(); };
    d.append(img, name, del); el.append(d);
  });
}
$("#oBright").oninput = renderId;

document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
  mode = t.dataset.t;
  document.querySelectorAll(".tab").forEach(x => { x.classList.toggle("active", x === t); x.setAttribute("aria-selected", x === t ? "true" : "false"); });
  $("#pane-tpl").hidden = mode !== "tpl"; $("#mainLayout").hidden = mode === "tpl";
  if (mode === "tpl") { $("#result").hidden = true; return; }
  $("#opts-booth").hidden = mode !== "booth"; $("#opts-id").hidden = mode !== "id"; $("#idGuide").hidden = mode !== "id";
  syncPreview();
  setHint(mode === "id" ? () => tr("photobooth.js.hint.id", "หน้าตรง มองกล้อง ให้ใบหน้าอยู่ในกรอบวงรี ไหล่ตรง") : () => tr("pb.shootHint", "ยืนห่างกล้องประมาณ 1 เมตร ให้เห็นศีรษะและไหล่ แสงส่องด้านหน้า"));
  if (mode === "booth" && booth.shots.length) showBoothResult(); else if (mode === "id" && idState.cap) showIdResult(); else $("#result").hidden = true;
});

renderThemes(); renderBgSwatches(); renderOutfitChoices(); renderIdSizes(); renderPurposes(); syncGuide(); syncLayoutBtns(); syncPreview(); autoShootTick(); loadTemplates();
document.fonts?.ready.then(renderThemes);
init();
// เปลี่ยนภาษา (TH/中文): วาดข้อความที่สร้างจากสคริปต์ใหม่ทั้งหมดให้เป็นภาษาที่เลือก
window.addEventListener("lq-lang", () => {
  engine(); renderThemes(); renderBgSwatches(); renderOutfitChoices(); renderIdSizes(); renderPurposes(); renderTplList();
  if (hintFn) $("#shootHint").textContent = hintFn();
  kioskBtn.textContent = kioskLabel(root.classList.contains("pb-kiosk"));
  if (!$("#result").hidden) { if (mode === "booth" && booth.shots.length) showBoothResult(true); else if (mode === "id" && idState.cap) showIdResult(true); }
});
