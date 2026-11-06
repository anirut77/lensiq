/* วิเคราะห์อารมณ์จากใบหน้าแบบ Neuromarketing — ประมวลผลในเบราว์เซอร์ทั้งหมด ไม่บันทึกภาพ */
const MODEL_URL = "vendor/models/";
const EMO = ["neutral", "happy", "surprised", "sad", "angry", "fearful", "disgusted"];
const EMO_TH = { neutral: "เฉย ๆ", happy: "มีความสุข", surprised: "ประหลาดใจ", sad: "เศร้า", angry: "โกรธ", fearful: "กลัว", disgusted: "รังเกียจ" };
// ตำแหน่งบนแบบจำลอง Circumplex ของ Russell [valence, arousal]
const VA = { neutral: [0, 0], happy: [0.8, 0.5], surprised: [0.2, 0.85], sad: [-0.7, -0.4], angry: [-0.7, 0.6], fearful: [-0.6, 0.7], disgusted: [-0.7, 0.3] };
const YAW_LIMIT = 0.35;     // หันหน้าเกินนี้ถือว่าไม่ได้มองจอ
const SAMPLE_MS = 200;      // ช่วงเวลาสุ่มตัวอย่างขั้นต่ำ
const STORE_KEY = "nm-sessions";

const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = v => v == null ? "–" : Math.round(v * 100) + "%";
const sgn = v => v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(2);
const fmtT = t => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, "0")}`; };
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

const video = $("#video"), camDiv = video.parentElement, camOverlay = $("#camOverlay");
let ready = false, busy = false;
let sessions = [];
try { sessions = JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { sessions = []; }
const mediaURLs = new Map(); // id -> objectURL (ใช้ย้อนดูสื่อได้ในรอบการใช้งานนี้)
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(sessions)); } catch { alert("พื้นที่จัดเก็บเต็ม กรุณาส่งออกแล้วลบผลเก่า"); } };

function engine(msg, cls = "") { const e = $("#engine"); e.textContent = msg; e.className = "engine " + cls; }

// ---------- กล้องบนมือถือ/แท็บเล็ต: สลับหน้า/หลัง เลือกอุปกรณ์ หยุดเมื่อซ่อนหน้า ----------
const HTTPS_MSG = "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด";
/* ข้อความเตือนเมื่อเปิดผ่าน http บนเครื่องอื่น (กล้องใช้ได้เฉพาะ https / localhost) */
function showHttpsNote(before) {
  if (window.isSecureContext || document.querySelector(".https-note")) return;
  const p = document.createElement("p"); p.className = "https-note"; p.setAttribute("role", "alert");
  p.innerHTML = `บนมือถือต้องเปิดผ่าน <b>https://</b> — ดูวิธีในหน้า <a href="cameras.html">ระบบทั้งหมด</a>`;
  before.before(p);
}

function layoutCam() { // overlay ใช้ขนาดจริงของกล้อง กรอบตามสัดส่วนกล้อง (แนวตั้งบนมือถือ)
  const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
  if (camOverlay.width !== vw || camOverlay.height !== vh) { camOverlay.width = vw; camOverlay.height = vh; }
  camDiv.style.aspectRatio = `${vw} / ${vh}`;
  camDiv.classList.toggle("tall", vh > vw);
}
// กล้อง: LQCam (สลับหน้า/หลัง เลือกอุปกรณ์ พักเมื่อซ่อนหน้า เปิดใหม่เมื่อกลับมา) — ไม่บันทึกภาพ
const camera = LQCam.create(video, {
  facing: "user", ideal: { width: 1280, height: 720 }, persistKey: null,
  onChange: (c, ev) => {
    if (ev.type === "started") { camDiv.classList.toggle("mirror", c.mirrored); layoutCam(); if (ready) engine("กล้องพร้อม" + (c.facing === "environment" ? " (กล้องหลัง)" : ""), "ok"); }
    else if (ev.type === "paused" && ready) engine("พักกล้องไว้ขณะสลับแอป จะเปิดใหม่อัตโนมัติเมื่อกลับมา");
    else if (ev.type === "ended") engine("สัญญาณกล้องหลุด — เลือกกล้องใหม่หรือรีเฟรชหน้า", "err");
  },
  onError: (c, e) => { if (e.name === "AbortError") return; console.warn(e); if (e.name === "Insecure") showHttpsNote($("#engine")); engine(e.name === "Insecure" ? HTTPS_MSG : "เปิดกล้องไม่ได้: " + LQCam.errorText(e), "err"); }
});
{ const ctl = document.createElement("div"); ctl.className = "cam-ctl"; camDiv.append(ctl); camera.attach(ctl); }
video.addEventListener("resize", layoutCam);
addEventListener("orientationchange", () => setTimeout(layoutCam, 350));

// ---------- เริ่มระบบ ----------
async function init() {
  engine("กำลังเปิดกล้องและโหลดโมเดล...");
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(HTTPS_MSG), { name: "Insecure" });
    const [, backend] = await Promise.all([
      camera.start(),
      TEST ? Promise.resolve("test") : LQDetect.tfBackend().then(async b => {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
        ]);
        return b;
      })
    ]);
    layoutCam();
    ready = true;
    engine(`พร้อมใช้งาน (ตัวประมวลผล: ${backend.toUpperCase()}${backend === "webgl" ? "" : " — อาจช้ากว่าปกติ"})`, "ok");
  } catch (e) {
    console.warn(e);
    if (e.name === "Insecure") showHttpsNote($("#engine"));
    const m = { Insecure: HTTPS_MSG, NotAllowedError: "ไม่ได้รับอนุญาตให้ใช้กล้อง", NotFoundError: "ไม่พบกล้อง", NotReadableError: "กล้องถูกโปรแกรมอื่นใช้อยู่" }[e.name];
    engine("ระบบไม่พร้อม: " + (m || "โหลดโมเดลไม่สำเร็จ") + (e.name === "Insecure" ? "" : ` (${e.name}: ${e.message || "-"})`), "err");
    const b = document.createElement("button");
    b.className = "btn ghost retry"; b.textContent = "ลองใหม่";
    b.onclick = init; $("#engine").append(b);
  }
}

// ---------- วิเคราะห์ 1 เฟรม ----------
const detOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 });
const center = pts => ({ x: mean(pts.map(p => p.x)), y: mean(pts.map(p => p.y)) });

const MAX_FACES = 4;
const TEST = typeof LQDetect !== "undefined" && LQDetect.isTest(); // ?fakedet บน localhost: ใบหน้าจำลอง ไม่โหลดโมเดล
let primBox = null; // กล่องผู้เข้าร่วมเฟรมก่อน (ปกติ 0..1) ใช้รักษาความต่อเนื่อง — อยู่ในหน่วยความจำเท่านั้น
const resetPrimary = () => { primBox = null; };

/* ใบหน้าจำลองสำหรับโหมดทดสอบ: landmark ตา/จมูกจากกล่อง + expression ที่กำหนด */
function fakeFace(d, W, H) {
  const x = d.x * W, y = d.y * H, w = d.w * W, h = d.h * H, yaw = d.yaw || 0;
  const eye = cx => Array.from({ length: 6 }, (_, k) => ({ x: cx + (k - 2.5) * 0.03 * w, y: y + 0.4 * h }));
  const ex = d.expressions || { neutral: 0.3, happy: 0.7 };
  return { box: { x, y, width: w, height: h }, le: eye(x + 0.3 * w), re: eye(x + 0.7 * w), nose: { x: x + (0.5 + yaw * 0.4) * w, y: y + 0.6 * h }, ex };
}

async function detectFaces() {
  const W = video.videoWidth, H = video.videoHeight;
  if (TEST) return (LQDetect.fake("neuro", performance.now()) || []).slice(0, MAX_FACES).map(d => fakeFace(d, W, H));
  const rs = await faceapi.detectAllFaces(video, detOpts).withFaceLandmarks().withFaceExpressions();
  return rs.sort((a, b) => b.detection.score - a.detection.score).slice(0, MAX_FACES)
    .map(r => ({ box: r.detection.box, le: r.landmarks.getLeftEye(), re: r.landmarks.getRightEye(), nose: r.landmarks.getNose()[3], ex: r.expressions }));
}

/* ผลต่อเฟรม: ค่าเดิมทั้งหมดมาจากใบหน้าหลัก (ผู้เข้าร่วม) + faces = จำนวนใบหน้าในภาพ */
async function analyze() {
  if (!camera.active || !video.videoWidth) return { face: 0, att: 0, e: null, v: null, a: null, eng: 0, faces: 0 }; // กล้องพักอยู่
  const faces = await detectFaces();
  const W = video.videoWidth, H = video.videoHeight;
  const boxes = faces.map(f => LQTrack.toNorm(f.box, W, H));
  const pick = LQTrack.pickPrimary(boxes, primBox, { prefer: "center", minIou: 0.3 });
  const ctx = camOverlay.getContext("2d");
  ctx.clearRect(0, 0, camOverlay.width, camOverlay.height);
  // ใบหน้าอื่นแสดงจาง ๆ (ไม่นำมาคำนวณ)
  ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(255,255,255,.3)";
  faces.forEach((f, i) => { if (i !== pick.index) ctx.strokeRect(f.box.x, f.box.y, f.box.width, f.box.height); });
  ctx.setLineDash([]);
  if (pick.index < 0) return { face: 0, att: 0, e: null, v: null, a: null, eng: 0, faces: faces.length };
  primBox = boxes[pick.index];
  const r = faces[pick.index], le = center(r.le), re = center(r.re), nose = r.nose;
  const eyeDist = Math.abs(re.x - le.x) || 1;
  const yaw = (nose.x - (le.x + re.x) / 2) / eyeDist;
  const att = Math.abs(yaw) < YAW_LIMIT ? 1 : 0;
  const e = EMO.map(k => +(r.ex[k] || 0).toFixed(3));
  const v = e.reduce((s, p, i) => s + p * VA[EMO[i]][0], 0);
  const a = e.reduce((s, p, i) => s + p * VA[EMO[i]][1], 0);
  const eng = att ? 1 - e[0] : 0; // Expressiveness ขณะมองจอ
  const b = r.box;
  ctx.lineWidth = 3; ctx.strokeStyle = att ? "#2ecc71" : "#e67e22"; ctx.strokeRect(b.x, b.y, b.width, b.height);
  return { face: 1, att, e, v: +v.toFixed(3), a: +a.toFixed(3), eng: +eng.toFixed(3), faces: faces.length };
}

// ---------- ทดสอบสื่อ ----------
const setup = $("#setup");
setup.file.addEventListener("change", () => { $("#durWrap").hidden = !setup.file.files[0]?.type.startsWith("image/"); });

let test = null;
setup.addEventListener("submit", async e => {
  e.preventDefault();
  const msg = $("#setupMsg"), fail = t => { msg.textContent = t; msg.className = "form-msg err"; };
  const file = setup.file.files[0];
  if (!ready) return fail("ระบบยังไม่พร้อม: " + $("#engine").textContent.replace("ลองใหม่", ""));
  if (!setup.test.value.trim() || !setup.pid.value.trim()) return fail("กรุณากรอกชื่อการทดสอบและรหัสผู้เข้าร่วม");
  if (!file || !/^(video|image)\//.test(file.type)) return fail("กรุณาเลือกไฟล์วิดีโอหรือภาพ");
  if (!setup.consent.checked) return fail("ต้องได้รับความยินยอมจากผู้เข้าร่วมก่อน");
  msg.textContent = "";
  stopLive();

  const url = URL.createObjectURL(file), isVideo = file.type.startsWith("video/");
  const el = document.createElement(isVideo ? "video" : "img");
  el.src = url; if (isVideo) el.playsInline = true;
  $("#stageMedia").replaceChildren(el);
  $("#stage").hidden = false;
  try { await $("#stage").requestFullscreen?.(); } catch {}

  test = {
    id: crypto.randomUUID(), test: setup.test.value.trim(), pid: setup.pid.value.trim(),
    date: new Date().toISOString(), media: file.name, type: isVideo ? "video" : "image",
    samples: [], running: true, el, url, imgDur: Math.min(120, Math.max(3, +setup.dur.value || 10)), start: performance.now()
  };
  if (isVideo) {
    el.addEventListener("ended", finishTest, { once: true });
    try { await el.play(); } catch { el.muted = true; await el.play(); }
  }
  resetPrimary(); $("#stageMulti").hidden = true;
  testLoop();
});

const testTime = () => test.type === "video" ? test.el.currentTime : (performance.now() - test.start) / 1000;

async function testLoop() {
  while (test && test.running) {
    const t0 = performance.now();
    const t = testTime();
    if (test.type === "image" && t >= test.imgDur) { finishTest(); break; }
    if (test.type === "video" && test.el.paused && !test.el.ended) { await sleep(100); continue; }
    try {
      const s = await analyze();
      if (!test || !test.running) break;
      test.samples.push({ t: +t.toFixed(2), ...s });
      $("#stageFace").textContent = !s.face ? "ไม่พบใบหน้า" : s.att ? "กำลังมองจอ" : "หันหน้าออก";
      $("#stageFace").className = "pill " + (s.att ? "on" : "off");
      $("#stageMulti").hidden = !(s.faces > 1);
    } catch (err) { console.error(err); }
    $("#stageTime").textContent = testTime().toFixed(1) + " วิ";
    await sleep(Math.max(0, SAMPLE_MS - (performance.now() - t0)));
  }
}

function finishTest() {
  if (!test || !test.running) return;
  test.running = false;
  const duration = +testTime().toFixed(2);
  if (test.type === "video") test.el.pause();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  $("#stage").hidden = true;
  const { id, url, samples } = test;
  if (samples.length < 3) { alert("ข้อมูลน้อยเกินไป ไม่บันทึกผล (ลองให้ใบหน้าอยู่ในกล้อง)"); URL.revokeObjectURL(url); test = null; return; }
  sessions.push({ id, test: test.test, pid: test.pid, date: test.date, media: test.media, type: test.type, duration, samples });
  mediaURLs.set(id, url);
  save(); test = null;
  setup.pid.value = ""; setup.consent.checked = false;
  renderSessionList(id); showTab("report");
}
$("#stopTest").onclick = finishTest;
document.addEventListener("keydown", e => { if (e.key === "Escape" && test) finishTest(); });

// ---------- ประมวลผลสรุป ----------
function binSamples(samples, size = 1) {
  const n = Math.max(1, Math.ceil((samples.at(-1)?.t || 0) / size + 0.0001));
  const bins = Array.from({ length: n }, (_, i) => ({ t: i * size, s: [] }));
  samples.forEach(s => bins[Math.min(n - 1, Math.floor(s.t / size))].s.push(s));
  return bins.map(b => {
    const face = b.s.filter(x => x.face);
    return {
      t: b.t,
      att: b.s.length ? mean(b.s.map(x => x.att)) : null,
      eng: b.s.length ? mean(b.s.map(x => x.eng)) : null,
      v: face.length ? mean(face.map(x => x.v)) : null,
      a: face.length ? mean(face.map(x => x.a)) : null
    };
  });
}

function summarize(ses) {
  const S = ses.samples, face = S.filter(s => s.face), look = S.filter(s => s.att);
  const emo = EMO.map((_, i) => mean(face.map(s => s.e[i])) || 0);
  const bins = binSamples(S);
  const valid = bins.filter(b => b.v != null);
  const by = (k, dir) => valid.length ? valid.reduce((m, b) => (dir * b[k] > dir * m[k] ? b : m)) : null;
  return {
    faceRate: S.length ? face.length / S.length : 0,
    attention: S.length ? look.length / S.length : 0,
    engagement: mean(S.map(s => s.eng)) || 0,
    valence: mean(face.map(s => s.v)),
    arousal: mean(face.map(s => s.a)),
    positive: face.length ? face.filter(s => s.v > 0.15).length / face.length : 0,
    negative: face.length ? face.filter(s => s.v < -0.15).length / face.length : 0,
    emo, bins,
    peaks: { best: by("v", 1), worst: by("v", -1), eng: valid.length ? bins.reduce((m, b) => (b.eng ?? -1) > (m.eng ?? -1) ? b : m) : null }
  };
}

// ---------- ส่วนประกอบกราฟ ----------
const tip = $("#tooltip");
function showTip(html, x, y) {
  tip.innerHTML = html; tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(innerWidth - w - 8, x + 14) + "px";
  tip.style.top = Math.max(8, y - h - 10) + "px";
}
const hideTip = () => { tip.hidden = true; };
const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent?.append(n); return n; };

function tiles(el, items) {
  el.innerHTML = items.map(([k, v, s]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ""}</div>`).join("");
}

function emoBars(el, probs) {
  el.className = "bars";
  el.innerHTML = EMO.map((k, i) => `<div class="row"><span>${EMO_TH[k]}</span><div class="track"><div class="fill" style="width:${(probs[i] * 100).toFixed(1)}%"></div></div><span class="num">${pct(probs[i])}</span></div>`).join("");
}

/* กราฟเส้นตามเวลา: series=[{key,name,color}], แกน y เดียว, crosshair + tooltip, คลิกเพื่อกระโดดไปเวลานั้น */
function lineChart(el, data, { series, yMin, yMax, yTicks, yFmt, zero, onSeek, xMax }) {
  // ความกว้างตามกล่องจริง (1 หน่วย ≈ 1px) ตัวอักษรบนมือถือจึงไม่เล็กลง
  const W = Math.max(280, Math.min(760, Math.round(el.clientWidth || 640))), H = W < 420 ? 180 : 200, L = 44, R = 12, T = 10, B = 26;
  const tMax = xMax ?? Math.max(1, data.at(-1)?.t || 1);
  const x = t => L + (t / tMax) * (W - L - R), y = v => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img" });
  yTicks.forEach(v => { svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === zero ? "zero" : "grid" }, svg); svgEl("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, svg).textContent = yFmt(v); });
  const step = [5, 10, 15, 30, 60, 120, 300, 600].find(st => tMax / st <= Math.max(3, Math.floor((W - L - R) / 56))) || 600;
  for (let t = 0; t <= tMax + 0.001; t += step) svgEl("text", { x: x(t), y: H - 6, "text-anchor": "middle" }, svg).textContent = fmtT(t);
  series.forEach(s => {
    let d = "", pen = false;
    data.forEach(p => { const v = p[s.key]; if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(p.t).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    svgEl("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
  });
  const cross = svgEl("line", { y1: T, y2: H - B, class: "cross", visibility: "hidden" }, svg);
  const dots = series.map(s => svgEl("circle", { r: 4, fill: s.color, stroke: "#fff", "stroke-width": 2, visibility: "hidden" }, svg));
  const hit = svgEl("rect", { x: L, y: 0, width: W - L - R, height: H, fill: "transparent", style: onSeek ? "cursor:pointer" : "" }, svg);
  const nearest = ev => {
    const r = svg.getBoundingClientRect(), t = ((ev.clientX - r.left) * W / r.width - L) / (W - L - R) * tMax;
    return data.reduce((m, p) => Math.abs(p.t - t) < Math.abs(m.t - t) ? p : m, data[0]);
  };
  const move = ev => {
    if (!data.length) return;
    const p = nearest(ev);
    cross.setAttribute("x1", x(p.t)); cross.setAttribute("x2", x(p.t)); cross.setAttribute("visibility", "visible");
    series.forEach((s, i) => { const v = p[s.key]; dots[i].setAttribute("visibility", v == null ? "hidden" : "visible"); if (v != null) { dots[i].setAttribute("cx", x(p.t)); dots[i].setAttribute("cy", y(v)); } });
    showTip(`<b>${fmtT(p.t)}</b>` + series.map(s => `<div class="r"><span><i class="sw" style="background:${s.color}"></i>${s.name}</span><span>${p[s.key] == null ? "ไม่พบใบหน้า" : yFmt(p[s.key])}</span></div>`).join("") + (onSeek ? `<div class="s" style="color:var(--muted);font-size:.75rem;margin-top:4px">แตะ/คลิกเพื่อดูสื่อช่วงนี้</div>` : ""), ev.clientX, ev.clientY);
  };
  hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
  hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); dots.forEach(d => d.setAttribute("visibility", "hidden")); hideTip(); });
  if (onSeek) hit.addEventListener("click", ev => data.length && onSeek(nearest(ev).t));
  const legend = series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}</div>` : "";
  el.innerHTML = legend; el.append(svg);
}

function circumplex(el, trail) {
  const S = 300, P = 30, c = S / 2, r = c - P;
  const svg = svgEl("svg", { viewBox: `0 0 ${S} ${S}`, class: "chart", role: "img", "aria-label": "แผนที่อารมณ์ Valence และ Arousal" });
  svgEl("circle", { cx: c, cy: c, r, fill: "none", class: "grid" }, svg);
  svgEl("line", { x1: P, x2: S - P, y1: c, y2: c, class: "zero" }, svg);
  svgEl("line", { y1: P, y2: S - P, x1: c, x2: c, class: "zero" }, svg);
  [["ตื่นเต้น / ชอบมาก", S - 6, 18, "end"], ["เครียด / ไม่พอใจ", 6, 18, "start"], ["เบื่อ / เศร้า", 6, S - 8, "start"], ["ผ่อนคลาย / พอใจ", S - 6, S - 8, "end"]]
    .forEach(([t, x, y, a]) => { svgEl("text", { x, y, "text-anchor": a }, svg).textContent = t; });
  svgEl("text", { x: S - P + 4, y: c - 6, "text-anchor": "end" }, svg).textContent = "บวก →";
  svgEl("text", { x: c + 6, y: P + 12 }, svg).textContent = "↑ ตื่นตัว";
  trail.forEach((p, i) => {
    const last = i === trail.length - 1;
    svgEl("circle", { cx: c + p.v * r, cy: c - p.a * r, r: last ? 8 : 4, fill: "var(--series-1)", "fill-opacity": last ? 1 : 0.15 + 0.5 * i / trail.length, stroke: last ? "#fff" : "none", "stroke-width": 2 }, svg);
  });
  el.replaceChildren(svg);
}

// ---------- วิเคราะห์สด ----------
let live = false, liveHist = [];
function stopLive() { live = false; $("#liveToggle").textContent = "เริ่มวิเคราะห์สด"; }
$("#liveToggle").onclick = async () => {
  if (!ready) return engine("ระบบยังไม่พร้อม", "err");
  if (live) return stopLive();
  live = true; liveHist = []; resetPrimary(); $("#liveToggle").textContent = "หยุด";
  const t0 = performance.now();
  let ema = null;
  while (live) {
    const s0 = performance.now();
    try {
      const s = await analyze();
      const t = (performance.now() - t0) / 1000;
      if (s.face) ema = ema ? { v: ema.v * 0.6 + s.v * 0.4, a: ema.a * 0.6 + s.a * 0.4, e: ema.e.map((x, i) => x * 0.6 + s.e[i] * 0.4) } : { v: s.v, a: s.a, e: s.e };
      liveHist.push({ t, v: s.face ? ema.v : null, a: s.face ? ema.a : null, att: s.att, eng: s.eng });
      liveHist = liveHist.filter(p => p.t > t - 60);
      const recent = liveHist.filter(p => p.t > t - 10);
      tiles($("#liveTiles"), [
        ["Valence", s.face ? sgn(ema.v) : "–", "บวก / ลบ"],
        ["Arousal", s.face ? sgn(ema.a) : "–", "ระดับตื่นตัว"],
        ["Attention", pct(mean(recent.map(p => p.att))), "10 วิล่าสุด"],
        ["Engagement", pct(mean(recent.map(p => p.eng))), "10 วิล่าสุด"]
      ]);
      emoBars($("#liveBars"), ema ? ema.e : EMO.map(() => 0));
      circumplex($("#liveCircumplex"), liveHist.filter(p => p.v != null).slice(-20));
      const base = Math.max(0, t - 60);
      lineChart($("#liveLine"), liveHist.map(p => ({ ...p, t: p.t - base })), { series: [{ key: "v", name: "Valence", color: "var(--valence)" }], yMin: -1, yMax: 1, yTicks: [-1, -0.5, 0, 0.5, 1], yFmt: v => sgn(v), zero: 0, xMax: 60 });
    } catch (e) { console.error(e); }
    await sleep(Math.max(0, SAMPLE_MS - (performance.now() - s0)));
  }
};

// ---------- รายงาน ----------
function renderSessionList(selectId) {
  const sel = $("#sessionSel");
  sel.innerHTML = sessions.slice().reverse().map(s => `<option value="${s.id}">${esc(s.test)} · ${esc(s.pid)} · ${new Date(s.date).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</option>`).join("");
  if (selectId) sel.value = selectId;
  renderReport(); renderCompare();
}
$("#sessionSel").onchange = renderReport;

function renderReport() {
  const ses = sessions.find(s => s.id === $("#sessionSel").value), body = $("#reportBody");
  if (!ses) { body.innerHTML = `<p class="empty">ยังไม่มีผลการทดสอบ เริ่มจากแท็บ "ทดสอบสื่อ"</p>`; return; }
  const m = summarize(ses), url = mediaURLs.get(ses.id);
  body.innerHTML = `
    <div class="tiles" id="rTiles"></div>
    <div class="grid2" style="margin-top:16px">
      <div><h3>Attention และ Engagement ตามเวลา</h3><div id="rEng"></div>
           <h3>Valence (บวก/ลบ) ตามเวลา</h3><div id="rVal"></div></div>
      <div>
        <div class="media-review" id="rMedia">${url ? "" : `<p class="hint">ไฟล์สื่อ "${esc(ses.media)}" ไม่ได้ถูกเก็บไว้ (ย้อนดูได้เฉพาะรอบที่ทดสอบในหน้านี้)</p>`}</div>
        <h3>จังหวะสำคัญ (Peak moments)</h3><ul class="peaks" id="rPeaks"></ul>
        <h3>สัดส่วนอารมณ์เฉลี่ย</h3><div id="rEmo"></div>
      </div>
    </div>`;
  tiles($("#rTiles"), [
    ["Attention", pct(m.attention), "เวลาที่มองจอ"],
    ["Engagement", pct(m.engagement), "การแสดงออกขณะดู"],
    ["Valence เฉลี่ย", sgn(m.valence), `บวก ${pct(m.positive)} · ลบ ${pct(m.negative)}`],
    ["Arousal เฉลี่ย", sgn(m.arousal), "ระดับตื่นตัว"],
    ["ความยาว", fmtT(ses.duration), `${ses.samples.length} เฟรม`]
  ]);
  let mediaEl = null;
  if (url) {
    mediaEl = document.createElement(ses.type === "video" ? "video" : "img");
    mediaEl.src = url; if (ses.type === "video") mediaEl.controls = true;
    $("#rMedia").append(mediaEl);
  }
  const seek = t => { if (mediaEl && ses.type === "video") { mediaEl.currentTime = t; mediaEl.play(); } };
  const opts = { onSeek: mediaEl && ses.type === "video" ? seek : null, xMax: ses.duration };
  lineChart($("#rEng"), m.bins, { ...opts, series: [{ key: "att", name: "Attention", color: "var(--series-1)" }, { key: "eng", name: "Engagement", color: "var(--series-2)" }], yMin: 0, yMax: 1, yTicks: [0, 0.25, 0.5, 0.75, 1], yFmt: pct, zero: 0 });
  lineChart($("#rVal"), m.bins, { ...opts, series: [{ key: "v", name: "Valence", color: "var(--valence)" }], yMin: -1, yMax: 1, yTicks: [-1, -0.5, 0, 0.5, 1], yFmt: sgn, zero: 0 });
  const pk = [["ช่วงที่รู้สึกบวกที่สุด", m.peaks.best, b => "Valence " + sgn(b.v)], ["ช่วงที่รู้สึกลบที่สุด", m.peaks.worst, b => "Valence " + sgn(b.v)], ["ช่วงที่มี Engagement สูงสุด", m.peaks.eng, b => "Engagement " + pct(b.eng)]];
  $("#rPeaks").innerHTML = pk.map(([k, b, f], i) => b ? `<li><span>${k}: <b>${f(b)}</b></span>${opts.onSeek ? `<button data-t="${b.t}">${fmtT(b.t)}</button>` : `<span>${fmtT(b.t)}</span>`}</li>` : "").join("") || `<li>ไม่พบใบหน้าเพียงพอ</li>`;
  $("#rPeaks").onclick = e => { const t = e.target.dataset.t; if (t != null) seek(+t); };
  emoBars($("#rEmo"), m.emo);
}

function renderCompare() {
  const groups = {};
  sessions.forEach(s => (groups[s.test] ||= []).push(summarize(s)));
  const keys = Object.keys(groups);
  $("#compare").innerHTML = keys.length ? `<thead><tr><th>ชิ้นงาน</th><th class="n">ผู้เข้าร่วม</th><th class="n">Attention</th><th class="n">Engagement</th><th class="n">Valence</th><th class="n">ช่วงบวก</th><th class="n">ช่วงลบ</th></tr></thead><tbody>` +
    keys.map(k => { const g = groups[k], av = f => mean(g.map(f).filter(x => x != null)); return `<tr><td>${esc(k)}</td><td class="n">${g.length}</td><td class="n">${pct(av(x => x.attention))}</td><td class="n">${pct(av(x => x.engagement))}</td><td class="n">${sgn(av(x => x.valence))}</td><td class="n">${pct(av(x => x.positive))}</td><td class="n">${pct(av(x => x.negative))}</td></tr>`; }).join("") + "</tbody>"
    : `<tbody><tr><td class="empty">ยังไม่มีข้อมูล</td></tr></tbody>`;
}

// ---------- ส่งออก / ลบ ----------
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const cell = v => { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v) && isNaN(+v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
$("#exportCsv").onclick = () => {
  const ses = sessions.find(s => s.id === $("#sessionSel").value); if (!ses) return;
  const head = ["test", "participant", "time_s", "face", "attention", "engagement", "valence", "arousal", ...EMO];
  const rows = ses.samples.map(s => [ses.test, ses.pid, s.t, s.face, s.att, s.eng, s.v, s.a, ...(s.e || EMO.map(() => ""))]);
  download(`lensiq-neuro-${ses.test}-${ses.pid}.csv`.replace(/[\\/:*?"<>|]+/g, "_"), "﻿" + [head, ...rows].map(r => r.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
};
$("#exportJson").onclick = () => sessions.length && download("lensiq-neuro-all-sessions.json", JSON.stringify(sessions, null, 1), "application/json");
$("#delSession").onclick = () => {
  const id = $("#sessionSel").value; if (!id || !confirm("ลบผลการทดสอบนี้?")) return;
  sessions = sessions.filter(s => s.id !== id); save(); renderSessionList();
};

// ---------- แท็บ ----------
function showTab(name) {
  document.querySelectorAll(".tab").forEach(t => { t.classList.toggle("active", t.dataset.t === name); t.setAttribute("aria-selected", t.dataset.t === name ? "true" : "false"); });
  ["test", "live", "report", "about"].forEach(n => $("#pane-" + n).hidden = n !== name);
  // ย้ายกล้องไปแท็บที่ใช้งาน
  (name === "live" ? $("#liveToggle") : $("#camHint")).before(camDiv);
  if (name !== "live") stopLive();
  hideTip();
  if (name === "report") renderReport(); // วาดกราฟใหม่ตามความกว้างจริงเมื่อแท็บแสดงผล
}
let rsT, lastW = innerWidth; // มือถือยิง resize ตอนแถบ URL ซ่อน/แสดง: วาดใหม่เฉพาะเมื่อความกว้างเปลี่ยน
addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(() => { if (innerWidth === lastW) return; lastW = innerWidth; if (!$("#pane-report").hidden) renderReport(); }, 250); });
document.querySelectorAll(".tab").forEach(t => t.onclick = () => showTab(t.dataset.t));

renderSessionList(); init();
