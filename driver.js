/* เฝ้าระวังความง่วงคนขับ — EAR / MAR / PERCLOS บน landmark 68 จุด (ประมวลผลในเครื่อง ไม่บันทึกภาพ)
   แนวทางจาก muskanvk/Drowsiness-Detection-System-for-Drivers และ PyImageSearch (Eye Aspect Ratio) */

// ================= ส่วนคำนวณ (ไม่ใช้ DOM ทดสอบด้วย Node ได้) =================
const DR_DEFAULTS = {
  earRatio: 0.85,         // เกณฑ์หลับตา = ค่า EAR ปกติ × 0.85 (วัดแล้ว: landmark ของ face-api แทบไม่ขยับตอนหลับตา — EAR หลับ/ลืม ≈ 0.86–0.93
                          // ×0.7 แบบ dlib จับตาปิดได้ < 1% ต่อเฟรม; ×0.85 จับได้ 18–43% โดยตาเปิดถูกนับเป็นปิด ≤ 0.1% — ดู ACCURACY.md / tests/bench/driver.bench.mjs)
  earFallback: 0.25,      // ใช้เมื่อปรับเทียบไม่สำเร็จ
  earMin: 0.12, earMax: 0.35,
  eyeDelta: 3,            // ตัวจำแนกภาพตา: ปิด = คะแนน > ค่าปกติของคนขับตอนปรับเทียบ + 3 (เลือกบนชุด Open/Closed Eyes เท่านั้น)
  eyeAdaptive: true,      // เกณฑ์ตาปิดปรับตามค่าปกติของช่วงขับจริง (แสง/มุมเปลี่ยนจากตอนปรับเทียบ) — เพิ่มได้อย่างเดียว ไม่ลดต่ำกว่าค่าปรับเทียบ
  eyeAdaptWindowMs: 10000, eyeAdaptQ: 0.2, eyeAdaptMin: 15, eyeAdaptMaxRise: 6, // ค่าปกติ = เปอร์เซ็นไทล์ 20 ของ 10 วิล่าสุด (ตาต้องปิด > 80% ของเวลาจึงจะดึงค่าขึ้น)
                          // วัดแล้ว: ปรับเทียบภาพหนึ่ง ขับอีกภาพ (คนเดียวกัน) ตาเปิดถูกนับเป็นปิด 12.5% ต่อเฟรมถ้าไม่ปรับ — ดู ACCURACY.md §5 / tests/bench/driver-session.bench.mjs
  eyeMaxBase: 2,          // ค่าปกติ > 2 = ตอนปรับเทียบภาพตาก็ดูเหมือนปิดแล้ว (แว่นดำ/มืด/ย้อนแสง) -> ไม่ใช้ตัวจำแนก ใช้ EAR แทน
  calibMinSamples: 10,
  blinkMaxMs: 500,        // หลับตาสั้นกว่านี้ = กะพริบตา
  longCloseMs: 1500,      // หลับตานานเกิน 1.5 วิ = เตือน (ระดับ 2)
  dangerCloseMs: 3000,    // เกิน 3 วิ = อันตราย (ระดับ 3)
  perclosWindowMs: 60000, perclosWarn: 0.15, perclosClear: 0.12, perclosMinMs: 20000,
  maxGapMs: 500,          // ช่วงห่างเฟรมสูงสุดที่นับรวม PERCLOS
  marYawn: 0.5, yawnMs: 1500,
  yawLimit: 0.35, distractMs: 2500, distractDangerMs: 5000,
  faceMissingMs: 3000,
  nodDelta: 0.2, nodWindowMs: 700,
  countWindowMs: 10 * 60000,
  breakWarnings: 3, breakWindowMs: 30 * 60000,
  transientMs: 3000
};
const DR_TYPES = {
  microsleep: "หลับใน (microsleep)", long_closure: "หลับตานาน", yawn: "หาว", nod: "ศีรษะตก/สัปหงก",
  distraction: "ละสายตาจากถนน", face_missing: "ไม่พบใบหน้า", perclos: "PERCLOS สูง", break: "แนะนำให้พัก"
};
const DR_LEVELS = ["ปกติ", "เฝ้าระวัง", "เตือน", "อันตราย"];

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = pts => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
function median(a) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/* EAR = (|p2-p6| + |p3-p5|) / (2|p1-p4|) — รับ 6 จุดตามลำดับ landmark */
function eyeAspectRatio(p) { const w = d2(p[0], p[3]); return w ? (d2(p[1], p[5]) + d2(p[2], p[4])) / (2 * w) : 0; }
/* MAR ปากด้านใน (60–67): 60/64 = มุมปาก, 61-62-63 บน, 67-66-65 ล่าง */
function mouthAspectRatio(p) { const w = d2(p[0], p[4]); return w ? (d2(p[1], p[7]) + d2(p[2], p[6]) + d2(p[3], p[5])) / (3 * w) : 0; }

/* รับ landmark 68 จุด [{x,y}] คืนค่าวัดที่ไม่ขึ้นกับระยะห่างจากกล้อง (หารด้วยระยะห่างระหว่างตา) */
function faceMetrics(pts) {
  const L = pts.slice(36, 42), R = pts.slice(42, 48);
  const earL = eyeAspectRatio(L), earR = eyeAspectRatio(R);
  const cl = mean(L), cr = mean(R), mid = mean([cl, cr]), iod = d2(cl, cr) || 1, nose = pts[30];
  return {
    earL, earR, ear: (earL + earR) / 2,
    mar: mouthAspectRatio(pts.slice(60, 68)),
    yaw: (nose.x - mid.x) / iod,     // หันซ้าย/ขวา
    pitch: (nose.y - mid.y) / iod    // ก้ม/เงย (ระยะแนวตั้งปลายจมูกถึงเส้นตา)
  };
}

/* ตัวจำแนกตาปิด/เปิดจากภาพดวงตา (eye-patch classifier) — เสริม EAR เพราะ landmark ของ face-api แทบไม่ขยับตอนหลับตา
   ภาพตาเทาขนาด 32×16 รอบจุด 6 จุดของตาแต่ละข้าง (กว้าง 1.8 × ความกว้างตา) -> ย่อ 16×8 -> ปรับค่าเฉลี่ย 0 / SD 1 -> โลจิสติกเชิงเส้น
   128 น้ำหนัก + bias + EAR (ตาขวาของภาพกลับซ้าย-ขวา ให้หันทางเดียวกัน) ฝึกด้วยชุด Open/Closed Eyes (ODC-BY 1.0) เท่านั้น
   วัดผลบน CEW (ภาพจริง) โดยไม่ใช้ปรับค่า — ดู ACCURACY.md §5 / tests/bench/driver.bench.mjs */
const EYE_PATCH = { w: 32, h: 16, widthScale: 1.8 };
/* กรอบภาพตาในพิกัดภาพต้นฉบับจาก landmark 6 จุดของตาหนึ่งข้าง */
function eyePatchRect(p) {
  const c = mean(p), w = d2(p[0], p[3]) * EYE_PATCH.widthScale;
  return { x: c.x - w / 2, y: c.y - w / 4, w, h: w / 2 };
}
/* เทา 32×16 (Uint8 512 ค่า) -> เวกเตอร์ 128 ค่า (16×8, mean 0, SD ~1) */
function eyeVec(g, mirror = false) {
  const v = new Float64Array(128);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
    const xx = mirror ? 15 - x : x;
    v[y * 16 + xx] = (g[2 * y * 32 + 2 * x] + g[2 * y * 32 + 2 * x + 1] + g[(2 * y + 1) * 32 + 2 * x] + g[(2 * y + 1) * 32 + 2 * x + 1]) / 4;
  }
  let m = 0; for (const a of v) m += a; m /= 128;
  let s = 0; for (const a of v) s += (a - m) ** 2; s = Math.sqrt(s / 128) + 1;
  for (let k = 0; k < 128; k++) v[k] = (v[k] - m) / s;
  return v;
}
/* คะแนนตาปิด (logit เฉลี่ยสองตา, > thr = ปิด) จากภาพตาซ้ายของภาพ (landmark 36–41) และขวาของภาพ (42–47) + EAR */
function eyeClosedScore(gA, gB, ear, model = EYE_MODEL) {
  if (!gA || !gB || !Number.isFinite(ear)) return NaN;
  let z = 0;
  for (const [g, mir] of [[gA, false], [gB, true]]) {
    const v = eyeVec(g, mir);
    let s = model.b + model.e * (ear - 0.3) * 20;
    for (let k = 0; k < 128; k++) s += model.w[k] * v[k];
    z += s;
  }
  return z / 2;
}
const EYE_MODEL = {
  b: 0.891, e: -0.136,          // bias, น้ำหนัก (EAR − 0.3) × 20
  w: [ // 16×8 ตามแถว (บน -> ล่าง), ตาซ้ายของภาพ; ตาขวาของภาพใช้แบบกลับซ้าย-ขวา
    -0.232, -0.212, -0.079, 0.065, 0.121, 0.095, 0.121, 0.137, 0.147, 0.132, 0.07, -0.052, -0.121, -0.115, -0.059, 0.04,
    -0.191, -0.076, -0.041, 0.054, 0.122, 0.165, 0.192, 0.207, 0.14, 0.042, 0.069, -0.009, -0.16, -0.063, -0.013, 0.036,
    -0.013, 0.012, 0.055, 0.113, 0.178, 0.264, 0.344, 0.27, 0.23, 0.165, 0.073, 0.062, 0.021, 0.014, -0.007, 0.036,
    0.131, 0.099, 0.175, 0.102, 0.171, 0.14, 0.136, 0.067, 0.107, 0.025, 0.02, 0.04, 0.057, 0.067, 0.093, 0.002,
    0.164, 0.157, 0.126, -0.027, -0.132, -0.073, -0.068, 0.088, 0.12, -0.112, -0.151, -0.089, -0.063, 0.011, -0.029, 0.047,
    0.078, 0.034, -0.06, -0.069, -0.193, -0.187, -0.173, -0.134, 0.014, -0.197, -0.28, -0.17, 0.041, -0.006, -0.151, -0.06,
    -0.019, 0.051, -0.029, -0.071, -0.182, -0.199, -0.178, -0.175, -0.068, -0.1, -0.18, -0.102, -0.044, 0.018, -0.08, -0.082,
    -0.15, -0.042, 0.035, 0.051, -0.075, -0.157, -0.143, -0.183, -0.119, -0.015, -0.014, 0.001, 0.084, 0.056, -0.027, -0.103
  ]
};

/* ค่าปกติของตาในช่วงขับ: เปอร์เซ็นไทล์ q ของคะแนนตาล่าสุด (null เมื่อยังน้อยกว่า min เฟรม) — เปอร์เซ็นไทล์ต่ำ = ตาเปิด
   จึงไม่ถูกดึงขึ้นด้วยการหลับตาจริง เว้นแต่หลับเกิน (1 − q) ของหน้าต่าง */
function adaptiveEyeBase(scores, q = DR_DEFAULTS.eyeAdaptQ, min = DR_DEFAULTS.eyeAdaptMin) {
  const s = scores.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length < min ? null : s[Math.floor(q * (s.length - 1))];
}

/* PERCLOS: สัดส่วนเวลาที่หลับตาในหน้าต่างเลื่อน (ถ่วงด้วยเวลาจริงระหว่างเฟรม) */
function createPerclos(windowMs = 60000, maxGapMs = 500) {
  let q = [], closedMs = 0, totalMs = 0, lastT = null, lastC = false;
  return {
    push(t, closed) {
      if (lastT != null) {
        const dt = Math.min(t - lastT, maxGapMs);
        if (dt > 0) { q.push({ t, dt, c: lastC }); totalMs += dt; if (lastC) closedMs += dt; }
      }
      lastT = t; lastC = closed;
      while (q.length && q[0].t <= t - windowMs) { const o = q.shift(); totalMs -= o.dt; if (o.c) closedMs -= o.dt; }
      if (totalMs < 1e-6) { totalMs = 0; closedMs = 0; }
    },
    gap() { lastT = null; },
    value() { return totalMs > 0 ? Math.max(0, closedMs) / totalMs : 0; },
    coverage() { return totalMs; }
  };
}

function calibrate(samples, ratio = DR_DEFAULTS.earRatio, cfgIn = {}) {
  const cfg = { ...DR_DEFAULTS, ...cfgIn };
  const ok = samples.filter(s => s && s.face && Number.isFinite(s.ear));
  if (ok.length < cfg.calibMinSamples) return { ok: false, n: ok.length, ear: null, thr: cfg.earFallback, yaw: 0, pitch: null, mar: null, eyeBase: null, eyeThr: null };
  const ear = median(ok.map(s => s.ear));
  const thr = Math.min(cfg.earMax, Math.max(cfg.earMin, ear * ratio));
  // ตัวจำแนกภาพตาใช้เฉพาะเมื่อมีค่าปกติของคนขับเอง (ค่าสัมบูรณ์ข้ามกล้อง/แสงไม่น่าเชื่อถือ: ภาพจริง CEW ตาเปิดถูกนับเป็นปิด 20%)
  const es = ok.map(s => s.eyeScore).filter(Number.isFinite);
  const eyeBase = es.length >= cfg.calibMinSamples ? median(es) : null;
  const eyeThr = eyeBase != null && eyeBase <= cfg.eyeMaxBase ? +(eyeBase + cfg.eyeDelta).toFixed(3) : null;
  return { ok: true, n: ok.length, ear: +ear.toFixed(4), thr: +thr.toFixed(3), yaw: median(ok.map(s => s.yaw)), pitch: median(ok.map(s => s.pitch)), mar: median(ok.map(s => s.mar)),
    eyeBase: eyeBase == null ? null : +eyeBase.toFixed(3), eyeThr };
}

function fatigueScore({ perclos = 0, yawns = 0, nods = 0, microsleeps = 0, longClosures = 0 } = {}) {
  const p = Math.min(50, (perclos / 0.30) * 50);  // PERCLOS 30% = 50 คะแนน
  const y = Math.min(20, yawns * 7);
  const n = Math.min(20, nods * 10);
  const m = Math.min(30, microsleeps * 8 + longClosures * 15);
  return Math.round(Math.min(100, p + y + n + m));
}

const countRecent = (events, now, windowMs, minLevel = 1, exclude = "break") =>
  events.filter(e => e.type !== exclude && e.level >= minLevel && e.t > now - windowMs && e.t <= now).length;

function shouldRecommendBreak(events, now, n = DR_DEFAULTS.breakWarnings, windowMs = DR_DEFAULTS.breakWindowMs) {
  return countRecent(events, now, windowMs, 2) >= n;
}

/* คะแนนความปลอดภัย 0–100 ของเที่ยว: หักตามระดับเหตุการณ์ต่อชั่วโมง (ขั้นต่ำคิด 1 ชม.) และความล้าสูงสุด */
function safetyScore(events, durationMs, maxFatigue = 0) {
  const W = { 1: 2, 2: 6, 3: 15 };
  const pen = events.filter(e => e.type !== "break").reduce((s, e) => s + (W[e.level] || 0), 0);
  const hours = Math.max(1, durationMs / 3600000);
  return Math.max(0, Math.min(100, Math.round(100 - pen / hours - Math.max(0, maxFatigue - 30) * 0.3)));
}

function summarizeTrip(trip, events, endT) {
  const counts = {}; let maxLevel = 0;
  events.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; maxLevel = Math.max(maxLevel, e.level); });
  const durationMs = Math.max(0, endT - trip.start);
  return {
    id: trip.id, driver: trip.driver, plate: trip.plate, start: trip.start, end: endT, durationMs,
    counts, total: events.filter(e => e.type !== "break").length, maxLevel,
    maxFatigue: trip.maxFatigue || 0, maxPerclos: +(trip.maxPerclos || 0).toFixed(3),
    safety: safetyScore(events, durationMs, trip.maxFatigue || 0),
    thr: trip.thr, baseEar: trip.baseEar, calibrated: !!trip.calibrated, aborted: !!trip.aborted,
    occupantsMax: trip.occupantsMax || 0   // จำนวนใบหน้าสูงสุดที่เห็นพร้อมกัน (ค่ารวม ไม่เก็บข้อมูลรายบุคคล)
  };
}

/* เลือกใบหน้าคนขับจากทุกใบหน้าในภาพ (กล่องปกติ 0..1 พิกัดภาพจริงไม่กลับด้าน)
   - ยังไม่ล็อก: เลือกตามฝั่งที่นั่ง (ขนาดกล่อง × น้ำหนักฝั่ง) — คนขับนั่งขวา กล้องหันเข้าหาคน -> ฝั่งซ้ายของภาพ
   - ล็อกแล้ว (prevBox): ต้องซ้อนทับกล่องเดิม IoU ≥ 0.3 ไม่งั้นลองเทียบกับกล่องที่ปรับเทียบไว้ (anchor)
     ไม่ตรงทั้งคู่ -> index -1 = ไม่พบใบหน้าคนขับ (face_missing) ห้ามสลับไปจับผู้โดยสาร */
const DR_MAX_FACES = 4;
function pickDriver(boxes, prevBox, seatSide = "right", anchor = null) {
  const T = typeof LQTrack !== "undefined" ? LQTrack : require("./lensiq-track.js");
  const C = typeof LQCam !== "undefined" ? LQCam : require("./lensiq-camera.js");
  const prefer = C.mapSeatToImage(seatSide, true);
  const r = T.pickPrimary(boxes, prevBox, { prefer, lockOnly: prevBox != null, minIou: 0.3 });
  if (r.index < 0 && anchor && prevBox && anchor !== prevBox) return T.pickPrimary(boxes, anchor, { prefer, lockOnly: true, minIou: 0.3 });
  return r;
}

/* ใบหน้าจำลองสำหรับโหมดทดสอบ ?fakedet (localhost เท่านั้น): สร้าง landmark 68 จุดจากกล่อง + ค่า ear/mar ที่กำหนด */
function synthFace(d, W, H) {
  const x = d.x * W, y = d.y * H, w = d.w * W, h = d.h * H, ear = d.ear ?? 0.3, mar = d.mar ?? 0.1;
  const c = { x: x + w / 2, y: y + h / 2 }, pts = Array.from({ length: 68 }, () => ({ ...c }));
  const eye = (i0, cx, cy) => {
    const ew = 0.2 * w, hh = ear * ew / 2;
    [[-ew / 2, 0], [-ew / 6, -hh], [ew / 6, -hh], [ew / 2, 0], [ew / 6, hh], [-ew / 6, hh]].forEach(([dx, dy], k) => { pts[i0 + k] = { x: cx + dx, y: cy + dy }; });
  };
  eye(36, x + 0.3 * w, y + 0.4 * h); eye(42, x + 0.7 * w, y + 0.4 * h);
  const mw = 0.3 * w, mh = mar * mw / 2, mx = x + 0.5 * w, my = y + 0.78 * h;
  [[-mw / 2, 0], [-mw / 4, -mh], [0, -mh], [mw / 4, -mh], [mw / 2, 0], [mw / 4, mh], [0, mh], [-mw / 4, mh]].forEach(([dx, dy], k) => { pts[60 + k] = { x: mx + dx, y: my + dy }; });
  pts[30] = { x: x + 0.5 * w, y: y + 0.6 * h };
  return { pts, box: { x, y, width: w, height: h }, score: d.score ?? 0.9 };
}

const csvCell = v => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = rows => "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");

/* ตัวตรวจจับเหตุการณ์ (state machine) — ป้อนทีละเฟรม {t, face, ear, mar, yaw, pitch}
   เหตุการณ์ถูกสร้างตอนเริ่มเกิด (t = เวลาเริ่ม) แล้วอัปเดต dur/level ในออบเจ็กต์เดิมจนจบ */
function createMonitor(baseline = {}, cfgIn = {}) {
  const cfg = { ...DR_DEFAULTS, ...cfgIn };
  const B = { thr: baseline.thr ?? cfg.earFallback, yaw: baseline.yaw ?? 0, pitch: baseline.pitch ?? null, eyeThr: baseline.eyeThr ?? null };
  const pc = createPerclos(cfg.perclosWindowMs, cfg.maxGapMs);
  const log = [], blinks = [], eyeWin = [];
  let start = null, out = [], maxFatigue = 0, maxPerclos = 0, lastBreak = -Infinity, transient = { level: 0, until: -Infinity };
  const st = { miss: null, missEv: null, eye: null, eyeEv: null, mouth: null, mouthEv: null, look: null, lookEv: null, nodActive: false, nodHist: [], percEv: null };

  function emit(t, type, level, detail = "", now = t) {
    const e = { t, type, level, dur: 0, detail };
    log.push(e); out.push(e);
    if (type === "microsleep" || type === "yawn" || type === "nod" || type === "break") transient = { level: Math.max(level, now < transient.until ? transient.level : 0), until: now + cfg.transientMs };
    return e;
  }
  function endEye(t, reopened) {
    if (st.eye == null) return;
    const d = t - st.eye;
    if (st.eyeEv) st.eyeEv.dur = d;
    else if (reopened) { if (d < cfg.blinkMaxMs) blinks.push(t); else emit(st.eye, "microsleep", 1, "", t).dur = d; }
    st.eye = null; st.eyeEv = null;
  }
  function endMouth(t) { if (st.mouthEv) st.mouthEv.dur = t - st.mouth; st.mouth = null; st.mouthEv = null; }
  function endLook(t) { if (st.lookEv) st.lookEv.dur = t - st.look; st.look = null; st.lookEv = null; }

  function update(s) {
    const t = s.t; out = [];
    if (start == null) start = t;
    let closed = false, eyeMode = false, eyeThrNow = B.eyeThr, yawDev = 0, pitchRel = null;
    if (!s.face) {
      if (st.miss == null) st.miss = t;
      endEye(t, false); endMouth(t); endLook(t); st.nodHist = []; pc.gap();
      if (!st.missEv && t - st.miss >= cfg.faceMissingMs) st.missEv = emit(st.miss, "face_missing", 2, "", t);
      if (st.missEv) st.missEv.dur = t - st.miss;
    } else {
      st.miss = null; st.missEv = null;
      // ภาพตา (ตัวจำแนก) เมื่อปรับเทียบแล้วและเฟรมนี้ตัดภาพตาได้; ไม่เช่นนั้นใช้ EAR < เกณฑ์ (เดิม)
      eyeMode = B.eyeThr != null && Number.isFinite(s.eyeScore);
      eyeThrNow = B.eyeThr;
      if (eyeMode && cfg.eyeAdaptive) {
        eyeWin.push({ t, v: s.eyeScore });
        while (eyeWin.length && eyeWin[0].t <= t - cfg.eyeAdaptWindowMs) eyeWin.shift();
        // ใช้เมื่อหน้าต่างเต็ม ≥ 80% แล้วเท่านั้น: ช่วงแรกหลังปรับเทียบ (แสงเดียวกัน) ใช้เกณฑ์ปรับเทียบ การหลับตาตั้งแต่เริ่มจึงไม่ถูกกลืนเป็นค่าปกติ
        const b = t - eyeWin[0].t >= cfg.eyeAdaptWindowMs * 0.8 ? adaptiveEyeBase(eyeWin.map(w => w.v), cfg.eyeAdaptQ, cfg.eyeAdaptMin) : null;
        if (b != null) eyeThrNow = Math.min(B.eyeThr + cfg.eyeAdaptMaxRise, Math.max(B.eyeThr, b + cfg.eyeDelta));
      }
      closed = eyeMode ? s.eyeScore > eyeThrNow : s.ear < B.thr;
      pc.push(t, closed);
      // ตา: กะพริบ / หลับใน / หลับตานาน
      if (closed) {
        if (st.eye == null) st.eye = t;
        const d = t - st.eye;
        if (!st.eyeEv && d >= cfg.longCloseMs) st.eyeEv = emit(st.eye, "long_closure", 2, "", t);
        if (st.eyeEv) { st.eyeEv.dur = d; if (d >= cfg.dangerCloseMs) st.eyeEv.level = 3; }
      } else endEye(t, true);
      // หาว: MAR สูงต่อเนื่อง
      if (s.mar > cfg.marYawn) {
        if (st.mouth == null) st.mouth = t;
        const d = t - st.mouth;
        if (!st.mouthEv && d >= cfg.yawnMs) {
          const prev = log.filter(e => e.type === "yawn" && e.t > t - cfg.countWindowMs).length;
          st.mouthEv = emit(st.mouth, "yawn", prev >= 2 ? 2 : 1, "", t);
        }
        if (st.mouthEv) st.mouthEv.dur = d;
      } else if (s.mar < cfg.marYawn * 0.8) endMouth(t);
      // ละสายตา: หันหน้าเกินเกณฑ์ต่อเนื่อง
      yawDev = Math.abs(s.yaw - B.yaw);
      if (yawDev > cfg.yawLimit) {
        if (st.look == null) st.look = t;
        const d = t - st.look;
        if (!st.lookEv && d >= cfg.distractMs) st.lookEv = emit(st.look, "distraction", 2, "", t);
        if (st.lookEv) { st.lookEv.dur = d; if (d >= cfg.distractDangerMs) st.lookEv.level = 3; }
      } else if (yawDev < cfg.yawLimit * 0.8) endLook(t);
      // ศีรษะตก: อัตราส่วนแนวตั้งจมูก–ตา เปลี่ยนจากค่าปกติอย่างฉับพลัน (ภายใน nodWindowMs)
      if (B.pitch && yawDev < cfg.yawLimit) {
        pitchRel = (s.pitch - B.pitch) / Math.abs(B.pitch);
        const a = Math.abs(pitchRel);
        st.nodHist.push({ t, a });
        st.nodHist = st.nodHist.filter(h => h.t >= t - cfg.nodWindowMs);
        if (!st.nodActive && a > cfg.nodDelta && st.nodHist.some(h => h.a < cfg.nodDelta / 2)) { st.nodActive = true; emit(t, "nod", 2, `${Math.round(pitchRel * 100)}%`, t); }
        else if (st.nodActive && a < cfg.nodDelta / 2) st.nodActive = false;
      }
    }
    // PERCLOS
    const perclos = pc.value(), cover = pc.coverage(), ready = cover >= cfg.perclosMinMs;
    if (ready) maxPerclos = Math.max(maxPerclos, perclos);
    if (!st.percEv && ready && perclos > cfg.perclosWarn) st.percEv = emit(t, "perclos", 2, `${Math.round(perclos * 100)}%`, t);
    else if (st.percEv) {
      st.percEv.dur = t - st.percEv.t;
      if (perclos < cfg.perclosClear) st.percEv = null;
      else if (perclos * 100 > parseFloat(st.percEv.detail)) st.percEv.detail = `${Math.round(perclos * 100)}%`;
    }
    // คะแนนความล้า (10 นาทีล่าสุด)
    const recent = type => log.filter(e => e.type === type && e.t > t - cfg.countWindowMs).length;
    const fatigue = fatigueScore({ perclos: cover >= 10000 ? perclos : 0, yawns: recent("yawn"), nods: recent("nod"), microsleeps: recent("microsleep"), longClosures: recent("long_closure") });
    maxFatigue = Math.max(maxFatigue, fatigue);
    // แนะนำให้พัก: เตือน (ระดับ ≥2) ครบ N ครั้งใน 30 นาที
    if (t - lastBreak >= cfg.breakWindowMs && shouldRecommendBreak(log, t, cfg.breakWarnings, cfg.breakWindowMs)) { lastBreak = t; emit(t, "break", 2, "", t); }
    // ระดับการแจ้งเตือนขณะนี้
    const reasons = [];
    const act = (ev, type) => { if (ev) reasons.push(type); return ev ? ev.level : 0; };
    let level = Math.max(act(st.eyeEv, "long_closure"), act(st.lookEv, "distraction"), act(st.missEv, "face_missing"), act(st.percEv, "perclos"));
    if (t < transient.until) level = Math.max(level, transient.level);
    if (fatigue >= 50) level = Math.max(level, 1);
    while (blinks.length && blinks[0] <= t - 60000) blinks.shift();
    const elapsed = Math.min(60000, t - start);
    return {
      events: out, level, reasons,
      metrics: {
        ear: s.face ? s.ear : null, mar: s.face ? s.mar : null, closed, thr: B.thr,
        eyeScore: s.face && Number.isFinite(s.eyeScore) ? s.eyeScore : null, eyeThr: B.eyeThr, eyeThrNow, eyeMode,
        perclos, perclosReady: ready, blinkRate: elapsed >= 10000 ? blinks.length * 60000 / elapsed : null,
        closedMs: st.eye != null ? t - st.eye : 0, yawDev, pitchRel, fatigue, maxFatigue, maxPerclos
      }
    };
  }
  function finish(t) { endEye(t, false); endMouth(t); endLook(t); if (st.missEv) st.missEv.dur = t - st.miss; if (st.percEv) st.percEv.dur = t - st.percEv.t; return log; }
  return { update, finish, log, setThreshold(v) { B.thr = v; }, get baseline() { return { ...B }; }, get maxFatigue() { return maxFatigue; }, get maxPerclos() { return maxPerclos; } };
}

/* round 12: ความพร้อมรายคนขับ — ระบบไม่ถือว่า "พร้อมช่วยเตือน" คนขับคนใดจนกว่าการตรวจตามคำสั่งหลับตา (ตรวจความแม่นยำหน้างาน)
   ในรถคันนั้นจะเตือนได้อย่างน้อย DR_READY.min ของคำสั่งหลับตา (อย่างน้อย DR_READY.minPrompts ครั้ง) — ระบบยังทำงานได้ตามเดิม
   แต่แสดงสถานะ "ยังไม่ยืนยัน" ชัดเจน ; rec = {at, hits, prompts} ล่าสุดของคนขับคนนั้น (เก็บในเครื่อง "dr-ready") */
const DR_READY = Object.freeze({ min: 0.70, minPrompts: 8, maxAgeDays: 30 });
const driverKey = name => String(name || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
function driverReadiness(rec, now = Date.now(), cfg = DR_READY) {
  if (!rec || !(rec.prompts > 0)) return { state: "unverified" };
  const rate = rec.hits / rec.prompts, ageDays = (now - (+rec.at || 0)) / 86400000;
  if (rec.prompts < cfg.minPrompts) return { state: "incomplete", rate, hits: rec.hits, prompts: rec.prompts, at: rec.at };
  if (ageDays > cfg.maxAgeDays) return { state: "stale", rate, hits: rec.hits, prompts: rec.prompts, at: rec.at };
  return { state: rate >= cfg.min ? "ok" : "low", rate, hits: rec.hits, prompts: rec.prompts, at: rec.at };
}

if (typeof module !== "undefined") module.exports = { DR_READY, driverKey, driverReadiness, DR_DEFAULTS, DR_TYPES, DR_LEVELS, EYE_PATCH, EYE_MODEL, eyePatchRect, eyeVec, eyeClosedScore, eyeAspectRatio, mouthAspectRatio, faceMetrics, adaptiveEyeBase, createPerclos, calibrate, fatigueScore, countRecent, shouldRecommendBreak, safetyScore, summarizeTrip, csvCell, toCsv, createMonitor, median, pickDriver, synthFace, DR_MAX_FACES };

// ================= ส่วนหน้าจอ =================
if (typeof document !== "undefined" && typeof faceapi !== "undefined" && typeof LQCam !== "undefined") (() => {
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDur = ms => { const s = Math.round(ms / 1000); return s < 60 ? `${s} วิ` : s < 3600 ? `${Math.floor(s / 60)} นาที ${s % 60} วิ` : `${Math.floor(s / 3600)} ชม. ${Math.floor(s % 3600 / 60)} นาที`; };
  const fmtClock = ts => new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fmtDate = ts => new Date(ts).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { engine("พื้นที่จัดเก็บเต็ม กรุณาส่งออก CSV แล้วล้างข้อมูล", "err"); return false; } };
  const K = { trips: "dr-trips", events: "dr-events", current: "dr-current", settings: "dr-settings", cam: "dr-cam" };
  const video = $("#video"), overlay = $("#overlay");

  function engine(msg, cls = "") { const e = $("#engine"); e.textContent = msg; e.className = "engine " + cls; }

  // ---------- การตั้งค่า ----------
  const SEATS = ["right", "left", "auto"];
  const settings = { ratio: DR_DEFAULTS.earRatio, marYawn: 0.5, breakN: 3, inputSize: 224, speech: true, seatSide: "right", ...load(K.settings, {}) };
  if (!SEATS.includes(settings.seatSide)) settings.seatSide = "right";
  const sf = $("#settings");
  const syncSettingsUI = () => { sf.ratio.value = settings.ratio; sf.marYawn.value = settings.marYawn; sf.breakN.value = settings.breakN; sf.inputSize.value = settings.inputSize; sf.speech.checked = settings.speech; sf.seatSide.value = settings.seatSide; };
  syncSettingsUI();
  sf.addEventListener("change", () => {
    const num = (v, lo, hi, d) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    settings.ratio = num(sf.ratio.value, 0.5, 0.95, DR_DEFAULTS.earRatio);
    settings.marYawn = num(sf.marYawn.value, 0.3, 1, 0.5);
    settings.breakN = Math.round(num(sf.breakN.value, 1, 10, 3));
    settings.inputSize = sf.inputSize.value === "320" ? 320 : 224;
    settings.speech = sf.speech.checked;
    const seat = SEATS.includes(sf.seatSide.value) ? sf.seatSide.value : "right";
    if (seat !== settings.seatSide) { settings.seatSide = seat; if (phase !== "trip") clearLock(); }
    syncSettingsUI(); save(K.settings, settings);
    detOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: settings.inputSize, scoreThreshold: 0.4 });
  });

  // ---------- เสียงเตือน ----------
  const alarm = (() => {
    let ctx = null, level = 0, timer = null, tone = null, muted = load("dr-muted", false);
    const ensure = () => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); } catch {} };
    const beep = (f = 880, ms = 180, vol = 0.25) => {
      if (!ctx || muted) return;
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = "square"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.setValueAtTime(vol, t + ms / 1000); g.gain.linearRampToValueAtTime(0, t + ms / 1000 + 0.02);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + ms / 1000 + 0.05);
    };
    const stopAll = () => { clearInterval(timer); timer = null; if (tone) { try { tone.o.stop(); tone.lfo.stop(); } catch {} tone = null; } };
    const startTone = () => { // เสียงต่อเนื่องแบบไซเรน
      if (!ctx || muted) return;
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = 1000; lfo.type = "square"; lfo.frequency.value = 3; lg.gain.value = 250;
      lfo.connect(lg).connect(o.frequency); g.gain.value = 0.22;
      o.connect(g).connect(ctx.destination); o.start(); lfo.start(); tone = { o, lfo };
    };
    function set(l) {
      if (l === level) return;
      const prev = level; level = l; stopAll();
      if (muted) return;
      if (l === 1 && prev < 1) beep(660, 150, 0.15);
      if (l === 2) { beep(); timer = setInterval(() => { beep(); setTimeout(() => beep(), 250); }, 900); }
      if (l === 3) startTone();
    }
    return {
      ensure, set, beep,
      get muted() { return muted; },
      toggle() { muted = !muted; save("dr-muted", muted); stopAll(); if (muted) window.speechSynthesis?.cancel(); else { const l = level; level = 0; set(l); } return muted; }
    };
  })();
  let lastSpeak = 0;
  function speak(text, force = false) {
    if (!settings.speech || alarm.muted || !window.speechSynthesis) return;
    if (!force && Date.now() - lastSpeak < 15000) return;
    lastSpeak = Date.now();
    const u = new SpeechSynthesisUtterance(text); u.lang = "th-TH"; u.rate = 1;
    const v = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith("th")); if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  const muteBtn = $("#mute");
  const syncMute = () => { muteBtn.textContent = alarm.muted ? "เปิดเสียงเตือน" : "ปิดเสียงเตือน"; muteBtn.setAttribute("aria-pressed", alarm.muted); };
  syncMute();
  muteBtn.onclick = () => { alarm.ensure(); alarm.toggle(); syncMute(); };
  $("#testSound").onclick = () => { alarm.ensure(); alarm.beep(); setTimeout(() => alarm.beep(), 250); speak("ทดสอบเสียง กรุณาพักรถ", true); };

  // ---------- กล้อง / โมเดล ----------
  const TEST = LQDetect.isTest(); // ?fakedet บน localhost: ใช้ใบหน้าจำลอง ไม่โหลดโมเดล
  let ready = false, modelsReady = false;
  let detOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: settings.inputSize, scoreThreshold: 0.4 });

  function listCameras() {
    const sel = $("#camSel"), devs = cam.devices;
    sel.innerHTML = devs.map((d, i) => `<option value="${esc(d.deviceId)}"${d.deviceId === cam.deviceId ? " selected" : ""}>${esc(d.label || `กล้อง ${i + 1}`)}</option>`).join("") || `<option value="">ไม่พบกล้อง</option>`;
  }

  function fitOverlay() { if (video.videoWidth && (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight)) { overlay.width = video.videoWidth; overlay.height = video.videoHeight; } }
  video.addEventListener("resize", fitOverlay); // หมุนจอ -> ขนาดภาพจากกล้องเปลี่ยน
  // กล้องหน้า (หันเข้าหาคนขับ) เป็นค่าเริ่มต้น · dr-cam เก็บ {deviceId,label} (อ่านค่าเดิมที่เป็นสตริงได้)
  // ปิดกล้องเมื่อสลับแอป/ล็อกจอ และเปิดใหม่เมื่อกลับมา (autoPause — ระหว่างนั้นหยุดตรวจ ไม่นับเป็น "ไม่พบใบหน้า")
  const cam = LQCam.create(video, {
    facing: "user", ideal: { width: 640, height: 480 }, persistKey: K.cam,
    onChange: (c, ev) => {
      if (ev.type === "started") {
        fitOverlay();
        $("#cam").classList.toggle("mirror", c.mirrored); // กลับด้านภาพเฉพาะกล้องหน้า
      } else if (ev.type === "devices") listCameras();
      else if (ev.type === "resumed") { if (trip) engine("กลับมาเฝ้าระวังต่อแล้ว", "ok"); }
      else if (ev.type === "ended") { if (trip) engine("สัญญาณกล้องหลุด กรุณาตรวจสอบสายกล้องแล้วกดลองใหม่", "err"); addRetry(); }
      else if (ev.type === "reconnected") { if (trip) engine("กล้องกลับมาเชื่อมต่อแล้ว — เฝ้าระวังต่อ", "ok"); }
    },
    onError: (c, err) => { if (err.name !== "AbortError") { engine(`เปิดกล้องไม่สำเร็จ: ${cameraError(err) || err.message}`, "err"); addRetry(); } }
  });

  function addRetry() {
    if ($("#engine button")) return;
    const b = document.createElement("button");
    b.className = "btn ghost"; b.type = "button"; b.textContent = "ลองใหม่"; b.style.cssText = "margin-left:10px;padding:4px 14px";
    b.onclick = init; $("#engine").append(b);
  }

  function cameraError(e) {
    const m = {
      Insecure: "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด",
      NotAllowedError: "ไม่ได้รับอนุญาตให้ใช้กล้อง — กดไอคอนกล้องที่แถบที่อยู่เพื่ออนุญาต แล้วกดลองใหม่",
      SecurityError: "เบราว์เซอร์บล็อกการใช้กล้อง",
      NotFoundError: "ไม่พบกล้อง — ตรวจสอบการต่อกล้องหน้ารถ/กล้อง IR",
      NotReadableError: "กล้องถูกโปรแกรมอื่นใช้อยู่ — ปิดโปรแกรมนั้นแล้วกดลองใหม่",
      OverconstrainedError: "กล้องที่เลือกไม่รองรับการตั้งค่านี้ ลองเลือกกล้องอื่น",
      AbortError: "เปิดกล้องไม่สำเร็จ ลองใหม่อีกครั้ง",
      Ended: "สัญญาณกล้องหลุด"
    }[e.name];
    return m;
  }

  async function init() {
    ready = false;
    engine("กำลังเปิดกล้องและโหลดโมเดล...");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("insecure"), { name: "Insecure" });
      // speed pass 2026-11-14: the face models are fetched only once the camera is open (nothing if it is refused)
      const camP = cam.start();
      const [, backend] = await Promise.all([
        camP,
        TEST ? Promise.resolve("test") : modelsReady ? LQDetect.tfBackend() : camP.then(() => LQDetect.tfBackend()).then(async b => {
          await Promise.all(["tinyFaceDetector", "faceLandmark68Net"].map(n => faceapi.nets[n].loadFromUri("vendor/models/")));
          modelsReady = true; return b;
        })
      ]);
      await cam.refreshDevices();
      ready = true;
      engine(`พร้อมใช้งาน (ตัวประมวลผล: ${backend.toUpperCase()}${backend === "webgl" ? "" : " — ใช้โหมดประหยัด ขนาดภาพตรวจจับ " + settings.inputSize + " px"})`, "ok");
      if (!trip) $("#stateText").textContent = "พร้อม — กรอกข้อมูลแล้วกดเริ่มเที่ยว";
    } catch (e) {
      console.warn(e);
      const m = cameraError(e);
      engine(`ระบบไม่พร้อม: ${m || "โหลดโมเดลไม่สำเร็จ"} (${e.name}: ${e.message || "-"})`, "err");
      addRetry();
      if (e.name === "Insecure" && !$("#engine a")) { const a = document.createElement("a"); a.href = "cameras.html"; a.className = "btn ghost"; a.style.cssText = "margin-left:10px;padding:4px 14px"; a.textContent = "วิธีเปิดผ่าน https"; $("#engine").append(a); }
    }
  }

  async function switchCam(run) {
    try {
      engine("กำลังสลับกล้อง...");
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("insecure"), { name: "Insecure" });
      await run();
      clearLock(); // มุมกล้องเปลี่ยน -> ล้างกล้องคนขับที่ล็อกไว้
      listCameras();
      engine((cam.facing === "environment" ? "ใช้กล้องหลัง" : "ใช้กล้องหน้า") + (trip ? " — แนะนำให้กดปรับเทียบใหม่" : ""), "ok");
    } catch (err) { if (err.name !== "AbortError") { engine(`สลับกล้องไม่สำเร็จ: ${cameraError(err) || err.message}`, "err"); addRetry(); } }
  }
  $("#flipCam").onclick = () => switchCam(() => cam.flip());
  $("#camSel").onchange = e => { const id = e.target.value; if (id) switchCam(() => cam.start(id)); };

  // ---------- การตรวจจับ ----------
  // ล็อกคนขับ: prevBox = กล่องคนขับเฟรมล่าสุด, anchor = กล่องตอนปรับเทียบเสร็จ (ปกติ 0..1 เก็บในหน่วยความจำเท่านั้น)
  let prevBox = null, anchor = null;
  function clearLock() { prevBox = null; anchor = null; }

  /* ตรวจทุกใบหน้า (สูงสุด 4) แล้วเลือกคนขับ -> {f: ใบหน้าคนขับหรือ null, others: ใบหน้าอื่น, n} */
  async function detect() {
    const W = video.videoWidth, H = video.videoHeight;
    let faces;
    if (TEST) faces = (LQDetect.fake("driver", performance.now()) || []).slice(0, DR_MAX_FACES).map(d => synthFace(d, W, H));
    else {
      const rs = await faceapi.detectAllFaces(video, detOpts).withFaceLandmarks();
      faces = rs.sort((a, b) => b.detection.score - a.detection.score).slice(0, DR_MAX_FACES)
        .map(r => ({ pts: r.landmarks.positions.map(p => ({ x: p.x, y: p.y })), box: r.detection.box, score: r.detection.score }));
    }
    const boxes = faces.map(f => LQTrack.toNorm(f.box, W, H));
    const pick = pickDriver(boxes, prevBox, settings.seatSide, anchor);
    if (pick.index >= 0) prevBox = boxes[pick.index];
    return { f: pick.index >= 0 ? faces[pick.index] : null, others: faces.filter((_, i) => i !== pick.index), n: faces.length };
  }

  /* ภาพตาเทา 32×16 จากเฟรมวิดีโอ (เรขาคณิตเดียวกับชุดทดสอบ tests/bench) — อยู่ในหน่วยความจำเท่านั้น ไม่บันทึก */
  const eyeCv = document.createElement("canvas"); eyeCv.width = EYE_PATCH.w; eyeCv.height = EYE_PATCH.h;
  const eyeCtx = eyeCv.getContext("2d", { willReadFrequently: true });
  function eyeGray(src, p) {
    const r = eyePatchRect(p);
    if (!(r.w >= 6)) return null;
    eyeCtx.clearRect(0, 0, EYE_PATCH.w, EYE_PATCH.h);
    eyeCtx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, EYE_PATCH.w, EYE_PATCH.h);
    const d = eyeCtx.getImageData(0, 0, EYE_PATCH.w, EYE_PATCH.h).data, g = new Uint8Array(EYE_PATCH.w * EYE_PATCH.h);
    for (let i = 0; i < g.length; i++) g[i] = (d[4 * i] * 0.299 + d[4 * i + 1] * 0.587 + d[4 * i + 2] * 0.114) | 0;
    return g;
  }
  function eyeScoreOf(f, m) {
    if (TEST || !f || !m) return NaN; // โหมดทดสอบ ?fakedet ไม่มีภาพจริง -> ใช้ EAR
    try { return eyeClosedScore(eyeGray(video, f.pts.slice(36, 42)), eyeGray(video, f.pts.slice(42, 48)), m.ear); } catch { return NaN; }
  }

  function drawFace(f, m, others = []) {
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    // ใบหน้าอื่น (ผู้โดยสาร) แสดงจาง ๆ ไม่นำมาคำนวณ
    ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(255,255,255,.22)";
    others.forEach(o => ctx.strokeRect(o.box.x, o.box.y, o.box.width, o.box.height));
    ctx.setLineDash([]);
    if (!f) return;
    const poly = (a, b, color) => { ctx.strokeStyle = color; ctx.beginPath(); for (let i = a; i <= b; i++) ctx[i === a ? "moveTo" : "lineTo"](f.pts[i].x, f.pts[i].y); ctx.closePath(); ctx.stroke(); };
    ctx.lineWidth = 2;
    const eyeC = m && m.closed ? "#ff4d4d" : "#3ddc84";
    poly(36, 41, eyeC); poly(42, 47, eyeC);
    poly(60, 67, m && m.mar > settings.marYawn ? "#ffb020" : "#6cc4e3");
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(f.pts[30].x, f.pts[30].y, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = "rgba(61,220,132,.8)"; ctx.strokeRect(f.box.x, f.box.y, f.box.width, f.box.height);
  }

  // ---------- เที่ยววิ่ง ----------
  let trip = null, monitor = null, running = false, phase = "idle", calibSamples = [], series = [], fpsTimes = [], lastLevel = 0, lastSave = 0;
  const allEvents = load(K.events, []), trips = load(K.trips, []);

  // เที่ยวที่ค้างจากการปิดหน้าเว็บกลางคัน -> ปิดเป็น "สิ้นสุดผิดปกติ"
  (() => {
    const cur = load(K.current, null);
    if (!cur || !cur.trip) return;
    const evs = allEvents.filter(e => e.trip === cur.trip.id);
    trips.unshift(summarizeTrip({ ...cur.trip, aborted: true }, evs, cur.last || cur.trip.start));
    save(K.trips, trips); localStorage.removeItem(K.current);
  })();

  function persist() {
    if (!trip) return;
    save(K.events, allEvents.slice(-5000));
    save(K.current, { trip: { ...trip, ...peak() }, last: Date.now() });
  }

  const tf = $("#tripForm");
  tf.driver.value = load("dr-lastDriver", ""); tf.plate.value = load("dr-lastPlate", "");
  tf.addEventListener("submit", e => {
    e.preventDefault();
    if (trip) return;
    const msg = $("#tripMsg"), set = (t, c) => { msg.textContent = t; msg.className = "form-msg " + c; };
    const driver = tf.driver.value.trim(), plate = tf.plate.value.trim();
    if (!driver) { tf.driver.focus(); return set("กรุณากรอกชื่อคนขับ", "err"); }
    if (!plate) { tf.plate.focus(); return set("กรุณากรอกทะเบียนรถ", "err"); }
    if (!ready) return set($("#engine").className.includes("err") ? "กล้องหรือโมเดลยังไม่พร้อม — ดูข้อความด้านบนแล้วกดลองใหม่" : "ระบบกำลังโหลด กรุณารอสักครู่", "err");
    set("", "");
    save("dr-lastDriver", driver); save("dr-lastPlate", plate);
    alarm.ensure();
    trip = { id: "T" + Date.now().toString(36).toUpperCase(), driver, plate, start: Date.now(), thr: null, baseEar: null, calibrated: false, occupantsMax: 0 };
    $("#summary").hidden = true;
    document.body.classList.add("on-trip");
    $("#tripInfo").textContent = `${driver} · ${plate}`;
    $("#alerts").innerHTML = `<li class="empty">ยังไม่มีการแจ้งเตือน</li>`;
    startCalibration();
    if (!running) { running = true; loop(); }
    if (UA) UA.start();
    { const r = driverReadiness(load("dr-ready", {})[driverKey(driver)]); if (r.state !== "ok") set("เริ่มเที่ยวแล้ว — ยังไม่ได้ยืนยันว่าระบบช่วยเตือนคนขับคนนี้ได้ (ดูสถานะความพร้อม) ระวังเป็นพิเศษและอย่าพึ่งเสียงเตือน", "err"); renderReady(); }
  });

  function startCalibration() {
    phase = "calib"; calibSamples = []; series = []; clearLock();
    $("#calib").hidden = false;
    $("#stateText").textContent = "กำลังปรับเทียบ";
    setLevel(0);
    const t0 = performance.now();
    const tick = () => {
      if (phase !== "calib") return;
      const left = 5 - (performance.now() - t0) / 1000;
      if (left > 0) { $("#calibCount").textContent = Math.ceil(left); return requestAnimationFrame(tick); }
      finishCalibration();
    };
    tick();
  }

  function finishCalibration() {
    const c = calibrate(calibSamples, settings.ratio);
    $("#calib").hidden = true;
    trip.thr = c.thr; trip.baseEar = c.ear; trip.calibrated = c.ok; trip.eyeThr = c.eyeThr;
    anchor = prevBox; // กล่องคนขับตอนปรับเทียบ = จุดยึดสำหรับล็อกคนขับ
    monitor = createMonitor(c, { marYawn: settings.marYawn, breakWarnings: settings.breakN });
    $("#thr").value = c.thr.toFixed(3);
    $("#baseInfo").textContent = c.ok ? `ค่า EAR ปกติ ${c.ear.toFixed(3)} × ${settings.ratio} (จาก ${c.n} เฟรม)${c.eyeThr != null ? ` · ตรวจหลับตาด้วยภาพดวงตา (ค่าปกติ ${c.eyeBase.toFixed(2)}, ปิดเมื่อ > ${c.eyeThr.toFixed(2)}) และใช้ EAR เมื่อตัดภาพตาไม่ได้` : " · ใช้ EAR อย่างเดียว"}` : `ปรับเทียบไม่สำเร็จ (พบใบหน้า ${c.n} เฟรม) — ใช้ค่าเริ่มต้น 0.25 และปิดการตรวจศีรษะตก`;
    setCalWarn(!c.ok ? "fail" : c.eyeThr == null ? "ear" : "");
    if (!c.ok) engine("ปรับเทียบไม่สำเร็จ: ไม่พบใบหน้าชัดเจนพอ ใช้เกณฑ์ค่าเริ่มต้น 0.25 — ปรับมุมกล้องแล้วกด \"ปรับเทียบใหม่\" ได้", "warn");
    else engine(`ปรับเทียบแล้ว เกณฑ์หลับตา EAR < ${c.thr.toFixed(3)}`, "ok");
    phase = "trip";
    persist();
  }

  // คำเตือนที่ปิดไม่ได้ (ไม่มีปุ่มปิด): ปรับเทียบไม่สำเร็จ หรือใช้ EAR อย่างเดียว — หายเมื่อปรับเทียบใหม่สำเร็จด้วยภาพดวงตา หรือจบเที่ยว
  function setCalWarn(kind) {
    const box = $("#calWarn");
    if (!box) return;
    box.hidden = !kind; box.dataset.kind = kind || "";
    $("#calWarnFail").hidden = kind !== "fail"; $("#calWarnEar").hidden = kind !== "ear";
    document.body.classList.toggle("cal-degraded", !!kind);
  }
  const peak = () => ({ maxFatigue: Math.max(trip.maxFatigue || 0, monitor?.maxFatigue || 0), maxPerclos: Math.max(trip.maxPerclos || 0, monitor?.maxPerclos || 0) });
  $("#recal").onclick = () => { if (trip && phase === "trip") { if (monitor) { monitor.finish(Date.now()); Object.assign(trip, peak()); } startCalibration(); } };
  $("#thr").addEventListener("change", e => {
    const v = parseFloat(e.target.value);
    if (!monitor || !Number.isFinite(v)) return;
    const c = Math.min(0.4, Math.max(0.08, v)); e.target.value = c.toFixed(3);
    monitor.setThreshold(c); trip.thr = c;
  });

  async function loop() {
    let lastUi = 0;
    while (running) {
      const t0 = performance.now();
      if (!cam.active || video.readyState < 2) { await sleep(250); continue; }
      try {
        const { f, others, n } = await detect();
        if (!running) break;
        if (trip && n > (trip.occupantsMax || 0)) trip.occupantsMax = n;
        const now = Date.now();
        const m = f ? faceMetrics(f.pts) : null;
        if (m) m.eyeScore = eyeScoreOf(f, m);
        healthStep(f);
        fpsTimes.push(performance.now()); fpsTimes = fpsTimes.filter(t => t > performance.now() - 3000);
        const fps = fpsTimes.length / 3;
        $("#fps").textContent = `${fps.toFixed(1)} fps · ${Math.round(performance.now() - t0)} ms/เฟรม`;
        $("#fps").className = "pill" + (fpsTimes.length >= 6 && fps < 8 ? " slow" : "");
        if (phase === "calib") {
          calibSamples.push(m ? { face: true, ...m } : { face: false });
          drawFace(f, null, others);
        } else if (phase === "trip" && monitor) {
          const r = monitor.update(m ? { t: now, face: true, ...m } : { t: now, face: false });
          drawFace(f, r.metrics, others);
          series.push({ t: now, ear: r.metrics.ear, closed: r.metrics.closed });
          while (series.length && series[0].t < now - 60000) series.shift();
          r.events.forEach(ev => { ev.trip = trip.id; allEvents.push(ev); onEvent(ev); });
          scdFrame(now, r, m);
          setLevel(r.level, r.reasons);
          if (now - lastUi > 200) { renderLive(r.metrics, now); lastUi = now; }
          if (r.events.length || now - lastSave > 5000) { persist(); lastSave = now; }
        }
      } catch (e) { console.error(e); }
      await sleep(Math.max(0, 66 - (performance.now() - t0))); // สูงสุด ~15 fps ไม่ซ้อนงาน
    }
  }

  function onEvent(ev) {
    const ul = $("#alerts");
    ul.querySelector(".empty")?.remove();
    const li = document.createElement("li");
    li.className = "l" + ev.level;
    li.innerHTML = `<span>${fmtClock(ev.t)}</span><b>${esc(DR_TYPES[ev.type])}</b><em>${DR_LEVELS[ev.level]}</em>`;
    ul.prepend(li);
    while (ul.children.length > 6) ul.lastChild.remove();
    if (ev.type === "break") { $("#breakBanner").hidden = false; speak("ตรวจพบสัญญาณความง่วงหลายครั้ง แนะนำให้พักรถ", true); }
    else if (ev.level >= 3) speak("อันตราย กรุณาพักรถ", true);
    else if (ev.type === "distraction") speak("กรุณามองถนน");
    else if (ev.level >= 2) speak("กรุณาพักรถ");
  }
  $("#breakOk").onclick = () => { $("#breakBanner").hidden = true; };

  function setLevel(level, reasons = []) {
    const st = $("#status");
    st.className = "status l" + level;
    st.querySelector("b").textContent = DR_LEVELS[level];
    $("#stateText").textContent = phase === "calib" ? "กำลังปรับเทียบ" : reasons.length ? reasons.map(r => DR_TYPES[r]).join(" · ") : level ? "ตรวจพบสัญญาณความล้า" : "ขับขี่ปกติ";
    $("#flash").className = level >= 2 ? "flash f" + level : "flash";
    alarm.set(level);
    if (level >= 3 && lastLevel < 3) speak("อันตราย กรุณาพักรถ", true);
    lastLevel = level;
  }

  // ---------- แสดงผลสด ----------
  function renderLive(m, now) {
    const set = (id, v) => { $(id).textContent = v; };
    set("#vEar", m.ear == null ? "—" : m.ear.toFixed(3));
    set("#vBlink", m.blinkRate == null ? "…" : Math.round(m.blinkRate));
    set("#vPerclos", m.perclosReady ? `${(m.perclos * 100).toFixed(0)}%` : `${(m.perclos * 100).toFixed(0)}%*`);
    $("#vPerclos").parentElement.classList.toggle("hot", m.perclosReady && m.perclos > DR_DEFAULTS.perclosWarn);
    const mine = allEvents.filter(e => e.trip === trip.id), cnt = t => mine.filter(e => e.type === t).length;
    set("#vYawn", cnt("yawn")); set("#vNod", cnt("nod")); set("#vMicro", cnt("microsleep") + cnt("long_closure"));
    set("#vTime", fmtDur(now - trip.start));
    gauge(m.fatigue);
    spark(m.thr);
  }

  function gauge(v) {
    $("#gArc").setAttribute("stroke-dasharray", `${v} 100`);
    $("#gArc").setAttribute("class", "g-val " + (v >= 60 ? "hi" : v >= 30 ? "mid" : "lo"));
    $("#gNum").textContent = v;
    $("#gLabel").textContent = v >= 60 ? "ล้ามาก" : v >= 30 ? "เริ่มล้า" : "สดชื่น";
  }

  function spark(thr) {
    const c = $("#spark"), dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const pad = 4, maxY = 0.45, now = Date.now();
    const x = t => pad + (1 - (now - t) / 60000) * (W - 2 * pad), y = v => H - pad - Math.min(v, maxY) / maxY * (H - 2 * pad);
    ctx.fillStyle = "rgba(255,77,77,.18)"; // ช่วงที่หลับตา
    for (let i = 1; i < series.length; i++) if (series[i - 1].closed) ctx.fillRect(x(series[i - 1].t), pad, x(series[i].t) - x(series[i - 1].t), H - 2 * pad);
    ctx.strokeStyle = "#ffb020"; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad, y(thr)); ctx.lineTo(W - pad, y(thr)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#ffb020"; ctx.font = "12px Prompt, sans-serif"; ctx.fillText(`เกณฑ์ ${thr.toFixed(2)}`, pad + 4, y(thr) - 5);
    ctx.strokeStyle = "#6cc4e3"; ctx.lineWidth = 2; ctx.beginPath();
    let pen = false;
    for (const p of series) { if (p.ear == null) { pen = false; continue; } ctx[pen ? "lineTo" : "moveTo"](x(p.t), y(p.ear)); pen = true; }
    ctx.stroke();
  }

  // ---------- จบเที่ยว ----------
  $("#stop").onclick = stopTrip;
  function stopTrip() {
    if (!trip) return;
    if (SCD) scdFinish();
    running = false; if (UA) UA.stop();
    const end = Date.now();
    let evs = [];
    if (monitor) monitor.finish(end);
    evs = allEvents.filter(e => e.trip === trip.id);
    const s = summarizeTrip({ ...trip, ...peak() }, evs, end);
    trips.unshift(s);
    save(K.trips, trips); save(K.events, allEvents.slice(-5000)); localStorage.removeItem(K.current);
    trip = null; monitor = null; phase = "idle"; clearLock();
    document.body.classList.remove("on-trip");
    exitDriving();
    setLevel(0); $("#breakBanner").hidden = true; $("#calib").hidden = true; setCalWarn("");
    drawFace(null);
    $("#stateText").textContent = "จบเที่ยวแล้ว";
    showSummary(s); renderHistory();
  }

  function showSummary(s) {
    const box = $("#summary"); box.hidden = false;
    const types = Object.keys(DR_TYPES).filter(k => s.counts[k]);
    box.innerHTML = `<h2>สรุปเที่ยว ${esc(s.driver)} · ${esc(s.plate)}</h2>
      <div class="tiles">
        <div class="tile"><div class="k">ระยะเวลา</div><div class="v">${fmtDur(s.durationMs)}</div></div>
        <div class="tile"><div class="k">เหตุการณ์ทั้งหมด</div><div class="v">${s.total}</div></div>
        <div class="tile"><div class="k">ความล้าสูงสุด</div><div class="v">${s.maxFatigue}</div><div class="s">จาก 100</div></div>
        <div class="tile"><div class="k">คะแนนความปลอดภัย</div><div class="v ${s.safety >= 80 ? "good" : s.safety >= 60 ? "" : "bad"}">${s.safety}</div><div class="s">จาก 100</div></div>
      </div>
      <ul class="acts">${types.length ? types.map(k => `<li><span>${DR_TYPES[k]}</span><b>${s.counts[k]} ครั้ง</b></li>`).join("") : `<li class="empty">ไม่พบเหตุการณ์ความเสี่ยง</li>`}</ul>
      <p class="hint">PERCLOS สูงสุด ${(s.maxPerclos * 100).toFixed(0)}% · เกณฑ์หลับตา EAR ${s.thr != null ? s.thr.toFixed(3) : "—"}${s.calibrated ? "" : " (ค่าเริ่มต้น)"}${s.occupantsMax > 1 ? ` · พบใบหน้าในรถสูงสุด ${s.occupantsMax} คน (ติดตามเฉพาะคนขับ)` : ""}</p>`;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderHistory() {
    const t = $("#history");
    if (!trips.length) { t.innerHTML = `<tbody><tr><td class="empty">ยังไม่มีประวัติเที่ยววิ่ง</td></tr></tbody>`; return; }
    t.innerHTML = `<thead><tr><th>เริ่ม</th><th>คนขับ</th><th>ทะเบียน</th><th class="n">ระยะเวลา</th><th>เหตุการณ์</th><th class="n">ความล้าสูงสุด</th><th class="n">คะแนนปลอดภัย</th></tr></thead><tbody>` +
      trips.map(s => `<tr><td>${fmtDate(s.start)}${s.aborted ? ' <span class="tag">สิ้นสุดผิดปกติ</span>' : ""}</td><td>${esc(s.driver)}</td><td>${esc(s.plate)}</td><td class="n">${fmtDur(s.durationMs)}</td>
        <td class="wrap">${Object.keys(s.counts).filter(k => k !== "break").map(k => `${DR_TYPES[k]} ${s.counts[k]}`).join(", ") || "—"}${s.counts.break ? ` · แนะนำพัก ${s.counts.break}` : ""}</td>
        <td class="n">${s.maxFatigue}</td><td class="n"><b class="${s.safety >= 80 ? "good" : s.safety >= 60 ? "" : "bad"}">${s.safety}</b></td></tr>`).join("") + "</tbody>";
  }

  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  const histMsg = t => { $("#histMsg").textContent = t; };
  $("#csvTrips").onclick = () => {
    if (!trips.length) return histMsg("ยังไม่มีข้อมูลให้ส่งออก");
    const iso = ts => new Date(ts).toLocaleString("sv-SE");
    download(`driver-trips-${stamp()}.csv`, toCsv([
      ["รหัสเที่ยว", "คนขับ", "ทะเบียน", "เริ่ม", "สิ้นสุด", "ระยะเวลา(นาที)", ...Object.keys(DR_TYPES).map(k => DR_TYPES[k]), "เหตุการณ์รวม", "ความล้าสูงสุด", "PERCLOS สูงสุด(%)", "คะแนนความปลอดภัย", "เกณฑ์ EAR", "ปรับเทียบสำเร็จ", "สิ้นสุดผิดปกติ"],
      ...trips.map(s => [s.id, s.driver, s.plate, iso(s.start), iso(s.end), (s.durationMs / 60000).toFixed(1), ...Object.keys(DR_TYPES).map(k => s.counts[k] || 0), s.total, s.maxFatigue, (s.maxPerclos * 100).toFixed(1), s.safety, s.thr ?? "", s.calibrated ? "ใช่" : "ไม่", s.aborted ? "ใช่" : ""])
    ]));
    histMsg("");
  };
  $("#csvEvents").onclick = () => {
    if (!allEvents.length) return histMsg("ยังไม่มีเหตุการณ์ให้ส่งออก");
    const info = Object.fromEntries(trips.map(s => [s.id, s]));
    if (trip) info[trip.id] = trip;
    download(`driver-events-${stamp()}.csv`, toCsv([
      ["รหัสเที่ยว", "คนขับ", "ทะเบียน", "เวลา", "ประเภท", "ระดับ", "ระยะเวลา(วิ)", "รายละเอียด"],
      ...allEvents.map(e => [e.trip, info[e.trip]?.driver || "", info[e.trip]?.plate || "", new Date(e.t).toLocaleString("sv-SE"), DR_TYPES[e.type] || e.type, DR_LEVELS[e.level], (e.dur / 1000).toFixed(1), e.detail])
    ]));
    histMsg("");
  };
  $("#clearData").onclick = () => {
    if (trip) return histMsg("กรุณาจบเที่ยวก่อนล้างข้อมูล");
    if (!confirm("ลบประวัติเที่ยววิ่ง เหตุการณ์ และการตั้งค่าทั้งหมดของหน้านี้ในเครื่องนี้?")) return;
    Object.keys(localStorage).filter(k => k.startsWith("dr-")).forEach(k => localStorage.removeItem(k));
    trips.length = 0; allEvents.length = 0;
    $("#summary").hidden = true; renderHistory(); histMsg("ลบข้อมูลแล้ว");
  };

  // round 12: แท็บถูกซ่อน/จอดับ = กล้องหยุด (autoPause) = ระบบไม่ได้เฝ้าระวัง — แจ้งเมื่อกลับมาว่าหยุดไปนานเท่าไร
  // และบันทึกเป็นเหตุการณ์ในเที่ยว (ตัวเลขเท่านั้น) ; ป้ายแท็บขึ้น "[หยุดเฝ้าระวัง]" ระหว่างซ่อน
  const UA = LQCam.unattended ? LQCam.unattended({ container: $("#uaBox") || $("#engine").parentNode, isRunning: () => running && !!trip, tag: "หยุดเฝ้าระวัง",
    gapText: "แท็บถูกซ่อนหรือจอดับ {a}–{b} ({m}) — ระหว่างนั้นระบบไม่ได้เฝ้าระวังการหลับตาเลย · เปิดหน้านี้ไว้ด้านหน้าตลอดการขับ (โหมดขับขี่)", onGap: g => {
    if (trip) { (trip.gaps || (trip.gaps = [])).push({ from: g.from, to: g.to }); while (trip.gaps.length > 50) trip.gaps.shift(); }
  } }) : null;
  // ---------- โหมดขับขี่ (เต็มจอ) ----------
  let wakeLock = null;
  async function enterDriving() {
    document.body.classList.add("driving");
    $("#driveMode").textContent = "ออกจากโหมดขับขี่";
    try { await document.documentElement.requestFullscreen?.(); } catch {}
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
  }
  function exitDriving() {
    if (!document.body.classList.contains("driving")) return;
    document.body.classList.remove("driving");
    $("#driveMode").textContent = "โหมดขับขี่";
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    try { wakeLock?.release(); } catch {} wakeLock = null;
  }
  $("#driveMode").onclick = () => document.body.classList.contains("driving") ? exitDriving() : enterDriving();
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) exitDriving(); });
  document.addEventListener("visibilitychange", async () => { if (document.visibilityState === "visible" && document.body.classList.contains("driving") && !wakeLock) { try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {} } });
  window.addEventListener("beforeunload", persist);

  // ---------- สุขภาพภาพ + ตรวจความแม่นยำหน้างาน (lensiq-sitecheck.js) ----------
  const SITE = /** @type {any} */ (window).LQSite || null;
  if (LQCam.offlineBadge && $("#cam")) LQCam.offlineBadge(cam, $("#cam").parentElement); // "กล้องออฟไลน์ตั้งแต่ HH:MM" ระหว่างเชื่อมต่อใหม่
  const HL = SITE ? { mon: SITE.createHealth({ kind: "driver" }), at: 0, fw: [], cv: document.createElement("canvas"), state: null } : null;
  function healthStep(f) {
    if (!HL) return;
    if (f && f.box && video.videoWidth) HL.fw.push(f.box.width / video.videoWidth);
    const t = performance.now(); if (t - HL.at < 1000) return; HL.at = t;
    let st = null; try { st = SITE.sampleElement(video, HL.cv); } catch { /* ignore */ }
    const hz = fpsTimes.length / 3;
    HL.state = HL.mon.push(st, { faceW: HL.fw.length ? SITE.median(HL.fw) : null, hz: fpsTimes.length >= 6 ? hz : null, stalled: SITE.stallStep(video, st, t) }); HL.fw = [];
    if (SCD) HL.state.codes.forEach(k => SCD.health.add(k));
    const pill = $("#camHealth"), msg = $("#camHealthMsg");
    if (!pill) return;
    SITE.renderHealth(pill, HL.state); pill.hidden = false;
    SITE.renderHealthLine(msg, HL.state);
  }
  // ตรวจความแม่นยำ (จอดรถเท่านั้น): ระบบสั่ง "หลับตา 3 วินาที" เป็นระยะแบบสุ่ม คนขับทำตาม ระบบวัดว่าเตือนครบทุกครั้งไหม
  // และเตือนผิดขณะลืมตากี่ครั้ง — ใช้กล้อง มุม แสง และคนขับจริงของรถคันนี้ (ไม่ใช่อาการง่วงจริง)
  let SCD = null, SCD_LAST = null;
  const scdHist = SITE ? SITE.history("dr-sitecheck") : null;
  const scdPanel = SITE && $("#scPanel") ? SITE.mountPanel($("#scPanel"), {
    title: "ตรวจความแม่นยำในรถคันนี้ (จอดรถเท่านั้น)",
    intro: "ทดสอบกล้อง มุมกล้อง แสง และคนขับจริงของรถคันนี้: ระบบจะสั่งให้หลับตา 3 วินาทีเป็นระยะแบบสุ่ม แล้ววัดว่าเตือนได้ครบไหม และเตือนผิดขณะลืมตากี่ครั้ง ห้ามทำขณะรถเคลื่อนที่",
    steps: [
      "จอดรถในที่ปลอดภัย ดับเครื่องหรือเข้าเกียร์จอด นั่งตำแหน่งคนขับตามปกติ",
      "เริ่มเที่ยวและปรับเทียบตามปกติ แล้วเลือกระยะเวลาและกด \"เริ่มตรวจ\"",
      "มองตรงไปข้างหน้าตามปกติ (กะพริบตาได้) เมื่อได้ยินเสียงและเห็นคำว่า \"หลับตา\" ให้หลับตาค้างไว้จนได้ยินเสียงสัญญาณลืมตา",
      "ถ้าไม่ได้ทำตามในรอบใด กด \"ข้ามรอบล่าสุด\" รอบนั้นจะไม่ถูกนับ",
      "ทำซ้ำในแสงกลางวัน กลางคืน และเมื่อใส่แว่น เก็บไฟล์ผลตรวจไว้ ผลนี้ไม่ใช่การรับรองความปลอดภัย"
    ],
    body: `<div class="sc-row"><label><span>ระยะเวลาทดสอบ</span><select class="sc-dur"><option value="3">3 นาที (หลับตา 5 ครั้ง)</option><option value="5" selected>5 นาที (หลับตา 8 ครั้ง)</option><option value="10">10 นาที (หลับตา 14 ครั้ง)</option></select></label><button class="btn ghost small sc-skip" type="button" hidden>ข้ามรอบล่าสุด</button></div><p class="sc-prompt" hidden></p>`
  }) : null;
  function scdTick() {
    if (!SCD) return;
    const el = Date.now() - SCD.t0, box = scdPanel.q(".sc-prompt");
    if (el >= SCD.durationMs) return scdFinish();
    const cur = SCD.prompts.find(p => el >= p.at && el < p.at + p.closeMs), next = SCD.prompts.find(p => p.at > el);
    if (cur && SCD.on !== cur) { SCD.on = cur; alarm.ensure(); alarm.beep(520, 250, 0.2); speak("หลับตา", true); }
    if (!cur && SCD.on) { SCD.on = null; alarm.beep(980, 120, 0.2); setTimeout(() => alarm.beep(980, 120, 0.2), 180); }
    box.hidden = false; box.dataset.on = cur ? "1" : "0";
    box.textContent = cur ? SITE.fmt("หลับตาค้างไว้ {a}", { a: Math.ceil((cur.at + cur.closeMs - el) / 1000) }) : next ? SITE.fmt("ลืมตาตามปกติ มองตรงไปข้างหน้า (คำสั่งถัดไปในราว {a} วินาที)", { a: Math.max(1, Math.round((next.at - el) / 1000)) }) : "ลืมตาตามปกติ · ใกล้จบการทดสอบ";
    const done = SCD.prompts.filter(p => p.at + p.closeMs <= el).length;
    scdPanel.live.textContent = SITE.fmt("หลับตาแล้ว {a}/{b} ครั้ง · เตือนทั้งหมด {c} ครั้ง · เหลือเวลา {d}", { a: done, b: SCD.prompts.length, c: SCD.events.filter(e => e.type === "long_closure").length, d: fmtDur(SCD.durationMs - el) });
  }
  function scdStart() {
    if (!SITE || SCD) return;
    if (phase !== "trip" || !monitor) return engine("เริ่มเที่ยวและปรับเทียบให้เสร็จก่อน แล้วจึงเริ่มตรวจ (จอดรถเท่านั้น)", "warn");
    const min = +scdPanel.q(".sc-dur").value || 5, n = min <= 3 ? 5 : min >= 10 ? 14 : 8;
    SCD = { t0: Date.now(), durationMs: min * 60000, prompts: SITE.closureSchedule({ durationMs: min * 60000, n, closeMs: 3000, startMs: 15000, seed: Date.now() }), events: [], frames: [], health: new Set(), on: null, timer: 0, calibrated: !!trip.calibrated, eyeMode: trip.eyeThr != null };
    SCD.timer = setInterval(scdTick, 100);
    scdPanel.start.disabled = true; scdPanel.stop.disabled = false; scdPanel.exp.hidden = true; scdPanel.q(".sc-skip").hidden = false;
    scdPanel.state.textContent = "กำลังตรวจ"; scdPanel.state.dataset.s = "live"; SITE.renderReport(scdPanel.report, null);
    scdTick();
  }
  function scdFrame(now, r, m) {
    if (!SCD) return;
    if (SCD.frames.length < 40000) SCD.frames.push({ t: now, face: !!m, closed: !!r.metrics.closed });
    for (const ev of r.events) SCD.events.push({ t: ev.t, at: now, type: ev.type, level: ev.level });
  }
  function scdFinish() {
    if (!SCD) return;
    const run = SCD; SCD = null; clearInterval(run.timer);
    const el = Math.min(run.durationMs, Date.now() - run.t0);
    const prompts = run.prompts.filter(p => p.at + p.closeMs + 2000 <= el); // รอบที่ยังไม่ครบเวลาไม่นับ
    const rep = SITE.driverReport({ t0: run.t0, durationMs: el, prompts, events: run.events, frames: run.frames });
    rep.recs.push(...[...run.health].map(c => "สภาพภาพระหว่างตรวจ: " + SITE.HEALTH_TH[c]).filter(Boolean));
    if (!run.calibrated) rep.recs.unshift("การปรับเทียบไม่สำเร็จ ผลนี้ใช้เกณฑ์ค่าเริ่มต้น — ปรับมุมกล้องแล้วปรับเทียบใหม่ก่อนตรวจอีกครั้ง");
    SITE.renderReport(scdPanel.report, rep);
    const box = scdPanel.q(".sc-prompt"); box.hidden = true;
    scdPanel.start.disabled = false; scdPanel.stop.disabled = true; scdPanel.q(".sc-skip").hidden = true;
    scdPanel.state.textContent = SITE.verdictText(rep); scdPanel.state.dataset.s = rep.verdict;
    const doc = SITE.exportDoc("driver", {
      startedAt: new Date(run.t0).toISOString(), durationSec: Math.round(el / 1000),
      settings: { ratio: settings.ratio, inputSize: settings.inputSize, eyeClassifier: run.eyeMode, calibrated: run.calibrated, adaptive: DR_DEFAULTS.eyeAdaptive },
      conditions: { health: [...run.health] }, prompts: prompts.map(p => ({ atSec: p.at / 1000, closeSec: p.closeMs / 1000, skipped: !!p.skip })),
      events: run.events.map(e => ({ tSec: +((e.t - run.t0) / 1000).toFixed(2), raisedSec: +((e.at - run.t0) / 1000).toFixed(2), type: e.type, level: e.level })),
      distinctPeople: 1, framesIndependent: false,
      report: { verdict: rep.verdict, provisional: rep.provisional, pilot: rep.pilot ? rep.pilot.verdict : null, need: rep.need, n: rep.n, sensitivity: rep.sensitivity, openFrameClosedBlock: rep.openFrameClosedBlock, closedFrameClosedBlock: rep.closedFrameClosedBlock, latencyMs: rep.latencyMs, falsePerHour: rep.falsePerHour, openFrameClosed: rep.openFrameClosed, closedFrameClosed: rep.closedFrameClosed, recs: rep.recs }
    });
    scdPanel.exp.hidden = false; scdPanel.exp.onclick = () => SITE.download(`lensiq-driver-check-${stamp()}.json`, doc);
    scdHist.add({ at: run.t0, verdict: rep.verdict, provisional: rep.provisional, pilot: rep.pilot ? rep.pilot.verdict : null, need: rep.need, cam: cam.label || "กล้องในรถ", summary: SITE.fmt("เตือนครบ {a}/{b} · เตือนผิด {c}", { a: rep.n.hits, b: rep.n.prompts, c: rep.n.falseAlarms }) });
    scdHist.render(scdPanel.hist);
    SCD_LAST = { rep, doc };
    noteReady(rep);
  }
  if (scdPanel) {
    scdPanel.start.addEventListener("click", scdStart);
    scdPanel.stop.addEventListener("click", scdFinish);
    scdPanel.q(".sc-skip").addEventListener("click", () => { if (!SCD) return; const el = Date.now() - SCD.t0; const p = SCD.prompts.filter(x => x.at <= el).pop(); if (p) { p.skip = true; engine("ข้ามรอบล่าสุดแล้ว — รอบนั้นไม่ถูกนับ", "ok"); } });
    scdHist.render(scdPanel.hist);
  }
  window.__DR_SC = { get active() { return SCD; }, get last() { return SCD_LAST; }, finish: () => scdFinish() };

  // ---------- round 12: ความพร้อมรายคนขับ (ผลตรวจตามคำสั่งหลับตาล่าสุดของคนขับคนนี้) ----------
  const readyName = () => (trip && trip.driver) || ($("#tripForm") && $("#tripForm").driver.value) || "";
  function renderReady() {
    const el = $("#drReady"); if (!el) return;
    const name = readyName().trim();
    if (!name) { el.hidden = true; return; }
    const r = driverReadiness(load("dr-ready", {})[driverKey(name)]), pct = r.rate == null ? "" : Math.round(r.rate * 100);
    const d = r.at ? new Date(r.at).toLocaleDateString() : "";
    const minP = Math.round(DR_READY.min * 100);
    el.hidden = false; el.dataset.s = r.state === "ok" ? "ok" : "no";
    el.textContent = r.state === "ok" ? SITE_FMT("ผ่านการทดสอบกับคนขับคนนี้: เตือนได้ {a}/{b} ครั้ง ({c}%) เมื่อ {d} — ยังเป็นเพียงเครื่องช่วยเตือน ไม่ใช่อุปกรณ์ความปลอดภัย", { a: r.hits, b: r.prompts, c: pct, d })
      : r.state === "low" ? SITE_FMT("ยังไม่พร้อมช่วยเตือนคนขับคนนี้: ทดสอบแล้วเตือนได้ {a}/{b} ครั้ง ({c}%) ต่ำกว่า {e}% — ปรับมุมกล้องและแสง (ตอนกลางคืนใช้กล้องอินฟราเรด) แล้วตรวจใหม่", { a: r.hits, b: r.prompts, c: pct, e: minP })
      : r.state === "incomplete" ? SITE_FMT("ยังไม่พร้อมช่วยเตือนคนขับคนนี้: ทดสอบไปเพียง {b} คำสั่ง (ต้องอย่างน้อย {f}) — ทำ \"ตรวจความแม่นยำหน้างาน\" ให้ครบ", { b: r.prompts, f: DR_READY.minPrompts })
      : r.state === "stale" ? SITE_FMT("ผลทดสอบของคนขับคนนี้เก่ากว่า {g} วัน ({d}) — ตรวจใหม่ก่อนใช้ ยังไม่ถือว่าพร้อมช่วยเตือน", { g: DR_READY.maxAgeDays, d })
      : SITE_FMT("ยังไม่ได้ทดสอบกับคนขับคนนี้ จึงยังไม่ถือว่าพร้อมช่วยเตือน — ทำ \"ตรวจความแม่นยำหน้างาน\" (คำสั่งหลับตา) ในรถคันนี้ให้เตือนได้อย่างน้อย {e}% ก่อนใช้งานจริง", { e: minP });
  }
  const SITE_FMT = (t, o) => t.replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));
  function noteReady(rep) {
    const name = readyName().trim(); if (!name || !rep || !rep.n) return;
    const all = load("dr-ready", {}); all[driverKey(name)] = { at: Date.now(), hits: rep.n.hits || 0, prompts: rep.n.prompts || 0, verdict: rep.verdict };
    save("dr-ready", all); renderReady();
  }
  if ($("#tripForm")) $("#tripForm").driver.addEventListener("input", renderReady);
  renderReady();

  if (TEST) window.__LQ_DR = { get series() { return series.slice(); }, get phase() { return phase; }, get locked() { return !!prevBox; }, get anchor() { return anchor; }, get trip() { return trip; }, get camId() { return cam.deviceId; } };
  renderHistory(); gauge(0);
  init();
})();
