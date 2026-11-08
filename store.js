/* วิเคราะห์หน้าร้าน — นับคนเข้า/ออก โซน คิว ฮีตแมป (ประมวลผลในเบราว์เซอร์ เก็บเฉพาะตัวเลขสรุป ไม่เก็บภาพ) */

// ================= ส่วนคำนวณ (ไม่ใช้ DOM ทดสอบแยกได้ด้วย Node) =================
const ST_CFG = {
  MAX_MISSED_MS: 1000,  // หายจากภาพได้นานสุดก่อนลบ track (บังกันชั่วคราว)
  IOU_MIN: 0.15,        // IoU ต่ำสุดที่ยังจับคู่ได้
  DIST_MAX: 0.12,       // ระยะศูนย์กลาง (สัดส่วนภาพ) สูงสุดที่ยังจับคู่ได้
  MIN_HITS: 2,          // เห็นอย่างน้อย 2 เฟรมจึงยืนยันเป็นคน
  LINE_MARGIN: 0.012,   // ระยะห่างจากเส้นที่ถือว่าอยู่ฝั่งใดฝั่งหนึ่งแน่นอน (กันสั่น)
  ZONE_MIN_MS: 1000,    // อยู่ในโซนอย่างน้อย 1 วิ จึงนับเป็นการเข้าโซน
  HEAT_W: 64, HEAT_H: 48
};

const dayKey = (ts = Date.now()) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/* ตัวติดตามที่ใช้ร่วมกันทุกหน้า (lensiq-track.js) — เบราว์เซอร์: window.LQTrack · Node: require */
const ST_LQT = typeof LQTrack !== "undefined" ? LQTrack : (typeof require === "function" ? require("./lensiq-track.js") : null);

/* กล่อง {x,y,w,h} พิกัดสัดส่วน 0..1 — คณิตเดียวกับ LQTrack จึงใช้ของ LQTrack */
const iou = ST_LQT.iou, center = ST_LQT.center, foot = ST_LQT.foot, dist2d = ST_LQT.dist2d;

/* สี่เหลี่ยมจากจุดลากสองจุด (ลากทิศไหนก็ได้) */
function normRect(p, q) {
  const clamp = v => Math.max(0, Math.min(1, v));
  const x = clamp(Math.min(p.x, q.x)), y = clamp(Math.min(p.y, q.y));
  return { x, y, w: clamp(Math.max(p.x, q.x)) - x, h: clamp(Math.max(p.y, q.y)) - y };
}
const pointInRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// ---------- ตัวติดตาม (Centroid + IoU) ----------
function newTracker() { return { tracks: [], nextId: 1 }; }

/* dets=[{x,y,w,h,score}] คืน { seen: track ที่เห็นในเฟรมนี้, removed: id ที่ถูกลบ } */
function updateTracker(T, dets, now, cfg = ST_CFG) {
  // ทำนายตำแหน่งด้วยความเร็วคงที่ เพื่อรองรับคนเดินขณะถูกบัง
  const pred = T.tracks.map(t => {
    const dt = Math.min(now - t.lastSeen, cfg.MAX_MISSED_MS);
    return { ...t.box, x: t.box.x + t.vx * dt, y: t.box.y + t.vy * dt };
  });
  const pairs = [];
  T.tracks.forEach((t, i) => dets.forEach((d, j) => {
    const ov = iou(pred[i], d), dd = dist2d(center(pred[i]), center(d));
    if (ov >= cfg.IOU_MIN || dd <= cfg.DIST_MAX) pairs.push({ i, j, s: ov - dd });
  }));
  pairs.sort((a, b) => b.s - a.s);
  const ti = new Set(), dj = new Set(), seen = [];
  for (const p of pairs) {
    if (ti.has(p.i) || dj.has(p.j)) continue;
    ti.add(p.i); dj.add(p.j);
    const t = T.tracks[p.i], d = dets[p.j];
    const c0 = center(t.box), c1 = center(d), dt = Math.max(1, now - t.lastSeen);
    t.vx = 0.6 * t.vx + 0.4 * (c1.x - c0.x) / dt;
    t.vy = 0.6 * t.vy + 0.4 * (c1.y - c0.y) / dt;
    t.prevCenter = c0;
    t.box = { x: d.x, y: d.y, w: d.w, h: d.h };
    t.lastSeen = now; t.hits++; t.score = d.score;
    seen.push(t);
  }
  dets.forEach((d, j) => {
    if (dj.has(j)) return;
    const t = { id: T.nextId++, box: { x: d.x, y: d.y, w: d.w, h: d.h }, vx: 0, vy: 0, firstSeen: now, lastSeen: now, hits: 1, score: d.score, prevCenter: null };
    T.tracks.push(t); seen.push(t);
  });
  const removed = [];
  T.tracks = T.tracks.filter(t => {
    if (now - t.lastSeen > cfg.MAX_MISSED_MS) { removed.push(t.id); return false; }
    return true;
  });
  return { seen, removed };
}

// ---------- เส้นนับคน ----------
/* ด้านของจุดเทียบเส้น a->b: +1 / -1 หรือ 0 ถ้าใกล้เส้นเกิน margin */
function lineSide(line, p, margin = 0) {
  const dx = line.b.x - line.a.x, dy = line.b.y - line.a.y, len = Math.hypot(dx, dy) || 1;
  const s = (dx * (p.y - line.a.y) - dy * (p.x - line.a.x)) / len;
  return s > margin ? 1 : s < -margin ? -1 : 0;
}
function segmentsIntersect(p1, p2, q1, q2) {
  const o = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  const on = (a, b, c) => Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
  const o1 = o(p1, p2, q1), o2 = o(p1, p2, q2), o3 = o(q1, q2, p1), o4 = o(q1, q2, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && on(p1, p2, q1)) || (o2 === 0 && on(p1, p2, q2)) || (o3 === 0 && on(q1, q2, p1)) || (o4 === 0 && on(q1, q2, p2));
}
/* mem = {side, pt} จุดล่าสุดที่อยู่ฝั่งชัดเจน (เก็บต่อ track)
   คืน "in" | "out" | null ; ฝั่ง -1 -> +1 = เข้า (สลับได้ด้วย swap) */
function checkCrossing(mem, line, p, swap = false, margin = ST_CFG.LINE_MARGIN) {
  const side = lineSide(line, p, margin);
  if (side === 0) return null;
  let dir = null;
  if (mem.side && side !== mem.side && segmentsIntersect(mem.pt, p, line.a, line.b)) {
    dir = (side === 1) !== swap ? "in" : "out";
  }
  mem.side = side; mem.pt = { x: p.x, y: p.y };
  return dir;
}

/* crossStep: checkCrossing + hysteresis band + confirmation (round 4) — mem per track, cfg = {band, bandRel, confirm}
   - band: ต้องออกห่างเส้นอย่างน้อย max(band, bandRel × ความสูงกล่อง) จึงถือว่าอยู่ฝั่งนั้น (กล่องใหญ่ = สั่นมาก = แถบกว้าง)
   - confirm: ต้องอยู่ฝั่งใหม่ต่อเนื่อง `confirm` เฟรมจึงนับ (ถ้าย้อนกลับก่อน = ไม่นับ) — กันการสลับรหัสระหว่างคนสองคนที่เส้น
   คืน "in" | "out" | null (นับช้ากว่าเดิม confirm-1 เฟรม) */
function crossStep(mem, line, p, swap, cfg, boxH = 0) {
  const margin = Math.max(cfg.band != null ? cfg.band : ST_CFG.LINE_MARGIN, (cfg.bandRel || 0) * boxH);
  const side = lineSide(line, p, margin);
  if (side === 0) return null;
  if (mem.pend) {
    if (side === mem.pend.side) {
      if (++mem.pend.n >= (cfg.confirm || 1)) { const d = mem.pend.dir; mem.pend = null; mem.side = side; mem.pt = { x: p.x, y: p.y }; return d; }
      return null;
    }
    mem.pend = null; // กลับฝั่งเดิมก่อนยืนยัน = ไม่นับ
  }
  let dir = null;
  if (mem.side && side !== mem.side && segmentsIntersect(mem.pt, p, line.a, line.b)) {
    const d = (side === 1) !== swap ? "in" : "out";
    if ((cfg.confirm || 1) > 1) { mem.pend = { dir: d, side, n: 1 }; return null; }
    dir = d;
  }
  mem.side = side; mem.pt = { x: p.x, y: p.y };
  return dir;
}

// ---------- ข้อมูลรายวัน ----------
function newDay(date = dayKey()) {
  // zones: คีย์ "<slot>:<zoneId>" (zv 2) · byCam: {slot: {name, in, out}} ; in/out/peak เป็นยอดรวมทุกกล้อง
  // ฟิลด์เสริม (ตัวเลขล้วน): hourlyOcc/hourlyQ = คนในร้าน/คิวสูงสุดรายชั่วโมง · staff = จำนวนพนักงานที่ตรวจพบ
  // slaBreach = จำนวนครั้งที่ลูกค้ารอคิวนานเกินเป้า · dedup = {suppressed, revived} จากการลดการนับซ้ำ
  return { date, in: 0, out: 0, occ: 0, peak: 0, peakAt: 0, maxQueue: 0, hourly: { in: Array(24).fill(0), out: Array(24).fill(0) }, zones: {}, byCam: {}, zv: 2,
    hourlyOcc: Array(24).fill(0), hourlyQ: Array(24).fill(0), staff: 0, slaBreach: 0, dedup: { suppressed: 0, revived: 0 } };
}
/* เติมฟิลด์เสริมให้วันที่บันทึกด้วยรุ่นเก่า (ไม่แตะค่าที่มีอยู่) */
function ensureDay(d) {
  const z24 = a => Array.isArray(a) && a.length === 24 ? a : Array(24).fill(0);
  d.hourlyOcc = z24(d.hourlyOcc); d.hourlyQ = z24(d.hourlyQ);
  if (!(d.staff >= 0)) d.staff = 0;
  if (!(d.slaBreach >= 0)) d.slaBreach = 0;
  if (!d.dedup || typeof d.dedup !== "object") d.dedup = { suppressed: 0, revived: 0 };
  if (!d.byCam) d.byCam = {};
  return d;
}
/* บันทึกการข้ามเส้น คนในร้านไม่ต่ำกว่า 0 */
function applyCrossing(day, dir, now) {
  const h = new Date(now).getHours();
  if (dir === "in") { day.in++; day.hourly.in[h]++; day.occ++; }
  else if (dir === "out") { day.out++; day.hourly.out[h]++; day.occ = Math.max(0, day.occ - 1); }
  if (day.occ > day.peak) { day.peak = day.occ; day.peakAt = now; }
  if (Array.isArray(day.hourlyOcc)) day.hourlyOcc[h] = Math.max(day.hourlyOcc[h] || 0, day.occ);
  return day.occ;
}

// ---------- โซน ----------
/* live = {zoneId: {trackId: {t0,last,counted}}}
   obs = [{id, foot}] track ที่เห็นในเฟรมนี้ ; alive = Set ของ id ที่ยังมีชีวิต (รวมที่ถูกบังชั่วคราว) */
function zoneStep(live, zones, obs, alive, day, now, minMs = ST_CFG.ZONE_MIN_MS) {
  const seenIds = new Set(obs.map(o => o.id));
  const counts = {};
  for (const z of zones) {
    const L = live[z.id] || (live[z.id] = {});
    const zs = day.zones[z.id] || (day.zones[z.id] = { name: z.name, visits: 0, dwellSum: 0, dwellN: 0, peak: 0 });
    zs.name = z.name;
    const inside = new Set();
    for (const o of obs) if (pointInRect(o.foot, z)) {
      inside.add(o.id);
      const e = L[o.id] || (L[o.id] = { t0: now, last: now, counted: false });
      e.last = now;
      if (!e.counted && now - e.t0 >= minMs) { e.counted = true; zs.visits++; }
    }
    for (const id in L) {
      const n = +id;
      if (inside.has(n)) continue;
      if (alive.has(n) && !seenIds.has(n)) continue; // ถูกบังชั่วคราว ยังถือว่าอยู่ในโซน
      const e = L[id];
      if (e.counted) { zs.dwellSum += e.last - e.t0; zs.dwellN++; }
      delete L[id];
    }
    counts[z.id] = Object.keys(L).length;
    zs.peak = Math.max(zs.peak, counts[z.id]);
  }
  for (const zid in live) if (!zones.some(z => z.id === zid)) delete live[zid];
  return counts;
}
/* ปิดทุกการอยู่ในโซน (เช่น หยุดกล้อง/ขึ้นวันใหม่) */
function closeZones(live, day) {
  for (const zid in live) {
    const zs = day.zones[zid];
    for (const id in live[zid]) { const e = live[zid][id]; if (zs && e.counted) { zs.dwellSum += e.last - e.t0; zs.dwellN++; } }
    delete live[zid];
  }
}
const avgDwellSec = zs => zs && zs.dwellN ? zs.dwellSum / zs.dwellN / 1000 : 0;
function queueInfo(count, serviceSec) { return { length: count, waitSec: count * serviceSec }; }
/* อัตราการซื้อโดยประมาณ = จำนวนครั้งเข้าโซนแคชเชียร์ / จำนวนคนเข้าร้าน (null ถ้ายังไม่มีคนเข้า) */
function conversion(day, cashierId) {
  if (!cashierId || !day.in) return null;
  const v = day.zones[cashierId]?.visits || 0;
  return Math.min(1, v / day.in);
}

// ---------- ฮีตแมป ----------
function newHeat(w = ST_CFG.HEAT_W, h = ST_CFG.HEAT_H) { return { w, h, data: new Float32Array(w * h) }; }
/* เพิ่มน้ำหนักที่จุด p (สัดส่วน 0..1) แบบเกาส์เซียนรัศมี 2 ช่อง */
function heatAdd(H, p, weight = 1) {
  const cx = Math.min(H.w - 1, Math.max(0, Math.floor(p.x * H.w)));
  const cy = Math.min(H.h - 1, Math.max(0, Math.floor(p.y * H.h)));
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= H.w || y >= H.h) continue;
    H.data[y * H.w + x] += weight * Math.exp(-(dx * dx + dy * dy) / 2);
  }
}
function heatMax(H) { let m = 0; for (const v of H.data) if (v > m) m = v; return m; }
/* ไล่สี น้ำเงิน -> ฟ้า -> เขียว -> เหลือง -> แดง ; t 0..1 */
function heatColor(t) {
  const stops = [[0, [42, 120, 214]], [0.25, [56, 190, 220]], [0.5, [80, 190, 90]], [0.75, [245, 200, 50]], [1, [220, 50, 40]]];
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i], k = (t - t0) / (t1 - t0);
      return c0.map((c, j) => Math.round(c + (c1[j] - c) * k));
    }
  }
  return stops.at(-1)[1];
}
/* แปลงเป็น RGBA (ใช้รากที่สองให้จุดเบาเห็นชัดขึ้น) ช่องว่างโปร่งใส */
function heatToRGBA(H, alpha = 200) {
  const out = new Uint8ClampedArray(H.w * H.h * 4), m = heatMax(H);
  if (!m) return out;
  for (let i = 0; i < H.data.length; i++) {
    const t = Math.sqrt(H.data[i] / m);
    if (t < 0.04) continue;
    const [r, g, b] = heatColor(t);
    out.set([r, g, b, Math.round(alpha * Math.min(1, t * 1.6))], i * 4);
  }
  return out;
}

// ---------- ถอดผลโมเดล COCO-SSD ----------
/* boxes: [N*4] (ymin,xmin,ymax,xmax สัดส่วน) ; scores: [N*C] ; class index 0 = person
   คืน [{x,y,w,h,score}] หลังกรองคะแนนและ NMS */
function decodePersons(boxes, scores, N, C, minScore = 0.4, iouThr = 0.5, maxOut = 20) {
  const cand = [];
  for (let i = 0; i < N; i++) {
    const sc = scores[i * C];
    if (sc < minScore) continue;
    const y1 = Math.max(0, boxes[i * 4]), x1 = Math.max(0, boxes[i * 4 + 1]), y2 = Math.min(1, boxes[i * 4 + 2]), x2 = Math.min(1, boxes[i * 4 + 3]);
    if (x2 <= x1 || y2 <= y1) continue;
    cand.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, score: sc });
  }
  return nms(cand, iouThr, maxOut);
}
function nms(cand, iouThr = 0.5, maxOut = 20) {
  cand = cand.slice().sort((a, b) => b.score - a.score);
  const keep = [];
  for (const c of cand) {
    if (keep.length >= maxOut) break;
    if (keep.every(k => iou(k, c) <= iouThr)) keep.push(c);
  }
  return keep;
}

// ---------- หลายกล้อง (1–4) ----------
const ST_SLOTS = ["c1", "c2", "c3", "c4"];
/* โซนของแต่ละกล้องใช้รหัส "<slot>:<zoneId>" ใน day.zones จึงไม่ชนกันข้ามกล้อง */
const nsZone = (slot, zid) => `${slot}:${zid}`;
/* ความกว้างภาพที่ส่งเข้าโมเดลตามจำนวนกล้อง (ประหยัดเวลาประมวลผลรวม) */
const autoDetW = n => n <= 1 ? 416 : n === 2 ? 352 : 320;
/* สถานะต่อกล้อง (อยู่ในหน่วยความจำเท่านั้น) */
/* ค่าตัวติดตามของหน้าร้าน (ปรับจากผลวัด tests/bench/people.bench.mjs บน MOT17 + PETS09 + TUD — ดู ACCURACY.md):
   DIST_MAX 0.12 -> 0.09 (กันรหัสสลับระหว่างคนที่เดินสวนกันซึ่งทำให้นับข้ามเส้นเกิน) · MAX_MISSED_MS 1000 -> 2000 (ถูกบังสั้น ๆ ไม่ขึ้นรหัสใหม่)
   ผลรวม 5 วิดีโอ ที่ 5 ภาพ/วินาที: ความคลาดเคลื่อนรายทิศ 39% -> 19% · ความแม่นของเหตุการณ์ข้ามเส้น 60% -> 72% */
/* ตัวติดตามของหน้าร้าน (round 4, tests/bench/people.bench.mjs — ปรับบน PETS09/TUD, ตรวจกับ MOT17 แยก):
   - ASSIGN 'byte': จับคู่สองขั้น กล่องมั่นใจ (>= HIGH) ก่อน แล้วจึงกล่องคะแนนต่ำ (LOW..HIGH) ต่อ track เดิมเท่านั้น
     (คนถูกบังครึ่งตัวไม่ทำให้ track ขาด) ; คนใหม่เกิดจากกล่องมั่นใจ >= NEW_MIN เท่านั้น
   - CROSS: แถบกันสั่นรอบเส้น = max(1.2% ของภาพ, 8% ของความสูงคน) และต้องอยู่ฝั่งใหม่ 2 เฟรมติดจึงนับ (กันรหัสสลับที่เส้น)
   ตัวตรวจจับต้องส่งกล่องตั้งแต่คะแนน ST_DET_MIN (= LOW) ขึ้นไป */
const ST_DET_MIN = 0.3;
/* round 5 — CROSS.flushLost: ข้ามเส้นแล้วหายไปก่อนครบการยืนยัน (ถูกบัง/ออกนอกภาพ ไม่ได้ย้อนกลับ) = นับ
   (เดิม: ไม่นับ -> นับขาดในฝูงชน) ; ทดลองบน PETS09/TUD + ชุดจำลองการถูกบัง/คะแนนต่ำ แล้วตรวจกับ MOT17
   (ลอง HIGH 0.4 ด้วย — MOT17 ที่ 5 ภาพ/วินาที นับเกิน +56% จึงไม่ใช้ ; ดู ACCURACY.md ส่วนที่ 1) */
const ST_TRACK = Object.freeze({ ...ST_LQT.PRESET.person, DIST_MAX: 0.09, MAX_MISSED_MS: 2000, ASSIGN: "byte", HIGH: 0.5, LOW: ST_DET_MIN, NEW_MIN: 0.5,
  CROSS: Object.freeze({ band: 0.012, bandRel: 0.08, confirm: 2, flushLost: true }) });
/* ค่าเดิม (round 4) — ไว้เทียบในชุดวัด */
const ST_TRACK_R4 = Object.freeze({ ...ST_TRACK, CROSS: Object.freeze({ band: 0.012, bandRel: 0.08, confirm: 2 }) });
/* ค่าเดิม (round 3) — ไว้เทียบในชุดวัด */
const ST_TRACK_R3 = Object.freeze({ ...ST_LQT.PRESET.person, DIST_MAX: 0.09, MAX_MISSED_MS: 2000 });
function newPipe() { return { tracker: ST_LQT.newTracker(ST_TRACK), lineMem: {}, zoneLive: {}, zoneCounts: {}, lastSeen: [], boxes: new Map(), reid: null, staff: null, lastNow: 0 }; }

// ---------- ลดการนับซ้ำ: re-ID ด้วยค่าลักษณะภาพ (MobileNetV2) — อยู่ในหน่วยความจำเท่านั้น ----------
/* ไม่บันทึกลงที่เก็บข้อมูลใด ๆ ไม่ส่งออกจากเครื่อง ล้างเมื่อหยุดกล้องหรือขึ้นวันใหม่ (pipe ถูกสร้างใหม่)
   วัดบน M1 / WASM SIMD (ไม่มี thread): MobileNetV2 224×224 ≈ 20 ms ต่อครั้ง (p90 21 ms) ทำเป็นชุดก็ไม่เร็วขึ้น (≈18.5 ms/ภาพ)
   COCO-SSD 416 px ≈ 48 ms → งบต่อรอบ K = 2 ครั้ง (≈ 40 ms) เฉพาะ track ใหม่ที่อาจเป็นคนเดิม การข้ามเส้น และเติมคลัง
   SIM_MIN = ความคล้าย (cosine) ขั้นต่ำ · MARGIN = ต้องชนะอันดับสองอย่างน้อยเท่านี้ · LOST_TTL_MS = จำคนที่หายจากภาพได้นานสุด
   REVIVE_DIST = ระยะ (สัดส่วนภาพ) สูงสุดระหว่างจุดที่หายกับจุดที่โผล่ใหม่ · CHECK_MS = ตรวจ track ใหม่ภายในกี่ ms หลังเกิด
   CROSS_WINDOW_MS = ไม่นับคนเดิมข้ามเส้นทิศเดิมซ้ำภายในช่วงนี้ · REFRESH_MS = อัปเดตค่าลักษณะของ track ทุก ๆ */
const REID_CFG = Object.freeze({ SIM_MIN: 0.82, MARGIN: 0.03, LOST_TTL_MS: 8000, REVIVE_DIST: 0.6, CHECK_MS: 2000, CROSS_WINDOW_MS: 10000, K: 2, REFRESH_MS: 3000, EMA: 0.3, STAFF_SIM: 0.86 });
function l2norm(v) {
  let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1, o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i] / n;
  return o;
}
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}
function newReid(cfg) {
  return { cfg: { ...REID_CFG, ...(cfg || {}) }, alias: new Map(), gal: new Map(), lost: new Map(), lastCross: new Map(), recent: [], checked: new Map(), staffGal: [], stats: { embeds: 0, revived: 0, suppressed: 0, skipped: 0 } };
}
const canonOf = (R, id) => (R && R.alias.has(id) ? R.alias.get(id) : id);
/* บันทึก/ผสมค่าลักษณะของคน canon (EMA แล้ว L2) */
function reidRemember(R, canon, emb, now) {
  const e = l2norm(emb), g = R.gal.get(canon);
  if (!g) { R.gal.set(canon, { emb: e, n: 1, at: now }); return; }
  const a = R.cfg.EMA, m = new Float32Array(e.length);
  for (let i = 0; i < e.length; i++) m[i] = (1 - a) * g.emb[i] + a * e[i];
  g.emb = l2norm(m); g.n++; g.at = now;
}
/* หาคนที่หายไปไม่นาน (R.lost) ที่คล้าย emb ที่สุด — ต้องคล้าย >= SIM_MIN ชนะอันดับสอง >= MARGIN อยู่ไม่ไกลเกิน REVIVE_DIST
   exclude = canon ที่ยังเห็นอยู่ในภาพ (คนละคนแน่นอน) คืน {canon, sim} | null */
function reidMatch(R, emb, now, box, exclude) {
  const c = R.cfg, p = box ? center(box) : null;
  let best = null, bs = -1, second = -1;
  for (const [canon, L] of R.lost) {
    if (exclude && exclude.has(canon)) continue;
    if (now - L.at > c.LOST_TTL_MS) continue;
    if (p && L.box && dist2d(p, center(L.box)) > c.REVIVE_DIST) continue;
    const s = cosine(emb, L.emb);
    if (s > bs) { second = bs; bs = s; best = canon; } else if (s > second) second = s;
  }
  if (best == null || bs < c.SIM_MIN || bs - Math.max(0, second) < c.MARGIN) return null;
  return { canon: best, sim: bs };
}
/* ตัดสินว่าจะนับการข้ามเส้นนี้หรือไม่ (คนเดิมข้ามทิศเดิมซ้ำภายใน CROSS_WINDOW_MS = ไม่นับ)
   คนเดิม = canon เดียวกัน หรือค่าลักษณะคล้ายคนที่เพิ่งข้ามทิศเดียวกันและตอนนี้ไม่อยู่ในภาพแล้ว (กันรหัสสลับ/ถูกบัง)
   ข้ามกลับทิศตรงข้ามนับตามปกติ (เข้าแล้วออก) — คืน {count, reason:'same-id'|'re-id'|null} */
function crossDecision(R, canon, dir, now, emb, active) {
  const c = R.cfg;
  R.recent = R.recent.filter(r => now - r.t <= c.CROSS_WINDOW_MS);
  const lc = R.lastCross.get(canon);
  if (lc && lc.dir === dir && now - lc.t <= c.CROSS_WINDOW_MS) { R.stats.suppressed++; return { count: false, reason: "same-id" }; }
  if (emb && !(lc && now - lc.t <= c.CROSS_WINDOW_MS)) {
    for (const r of R.recent) {
      if (r.canon === canon || r.dir !== dir || (active && active.has(r.canon))) continue;
      const rl = R.lastCross.get(r.canon);
      if (rl && rl.dir !== dir) continue; // คนนั้นข้ามกลับไปแล้ว
      if (cosine(r.emb, emb) >= c.SIM_MIN) { R.lastCross.set(canon, { dir, t: r.t }); R.stats.suppressed++; return { count: false, reason: "re-id" }; }
    }
  }
  R.lastCross.set(canon, { dir, t: now });
  if (emb) R.recent.push({ t: now, dir, canon, emb });
  return { count: true, reason: null };
}

// ---------- ไม่นับพนักงาน: โซนพนักงาน (เช่น หลังเคาน์เตอร์) ----------
/* S = {ms: Map<canon, ms ในโซน>, flagged: Set<canon>} ; obs = [{id(canon), foot}] ; dt = เวลาตั้งแต่เฟรมก่อน (ms)
   ใครอยู่ในโซนพนักงานสะสมเกิน minMs (ในวันนั้น ตามรหัสที่ติดตามได้) = พนักงาน ไม่นับตั้งแต่นั้น คืนรายการที่เพิ่งถูกระบุ */
function newStaff() { return { ms: new Map(), flagged: new Set() }; }
function staffStep(S, zone, obs, dt, minMs) {
  const fresh = [];
  if (!zone || !(minMs > 0)) return fresh;
  dt = Math.max(0, Math.min(1000, dt || 0));
  for (const o of obs) {
    if (S.flagged.has(o.id) || !pointInRect(o.foot, zone)) continue;
    const v = (S.ms.get(o.id) || 0) + dt;
    S.ms.set(o.id, v);
    if (v >= minMs) { S.flagged.add(o.id); fresh.push(o.id); }
  }
  return fresh;
}

/* ประมวลผลหนึ่งเฟรมของหนึ่งกล้องลง `day` ที่ใช้ร่วมกัน
   cam = {slot, name, role:'door'|'zone'|'both', line, swap, zones:[{id,name,x,y,w,h}], staffZone?:{x,y,w,h}}
   opt (ไม่บังคับ — ไม่ส่ง = พฤติกรรมเดิมทุกอย่าง):
     reid: bool · embed(box) -> Float32Array|null (เรียกได้ไม่เกิน K ครั้งต่อเฟรม) · reidCfg · staffMs: เวลาในโซนพนักงานที่ถือว่าเป็นพนักงาน
   - นับข้ามเส้นเฉพาะ role door/both ; โซนเฉพาะ role zone/both ; พนักงานไม่ถูกนับเส้น/โซน/ฮีตแมป
   - day.in/out/peak เป็นยอดรวม ; day.byCam[slot] = {name, in, out}
   คืน {conf, obs, crossings:[{id, dir}], suppressed:[{id, dir, reason}], revived:[{id, canon, sim}], staff:[canon ใหม่]} */
function stepCam(pipe, cam, day, dets, now, tcfg, opt) {
  tcfg = tcfg || ST_LQT.trackerCfgFor(ST_TRACK, 0);
  opt = opt || {};
  const { seen, removed } = ST_LQT.updateTracker(pipe.tracker, dets, now, tcfg);
  if (!pipe.boxes) pipe.boxes = new Map();
  const R = opt.reid ? (pipe.reid || (pipe.reid = newReid(opt.reidCfg))) : null;
  const staffOn = !!(cam.staffZone && opt.staffMs > 0);
  const SF = staffOn ? (pipe.staff || (pipe.staff = newStaff())) : pipe.staff;
  const dt = pipe.lastNow ? now - pipe.lastNow : 0; pipe.lastNow = now;
  const res = { conf: [], obs: [], crossings: [], suppressed: [], revived: [], staff: [] };
  // track ที่หายไป: ไม่มี re-ID = ลืมทันที (เดิม) ; มี re-ID และมีค่าลักษณะ = ย้ายไปคลังคนที่หายไปไม่นาน
  for (const id of removed) {
    const cid = canonOf(R, id), box = pipe.boxes.get(id);
    pipe.boxes.delete(id);
    if (R) {
      R.alias.delete(id); R.checked.delete(id);
      const g = R.gal.get(cid);
      if (g) { R.lost.set(cid, { emb: g.emb, at: now, box }); continue; }
      R.gal.delete(cid);
    }
    if (SF && !SF.flagged.has(cid)) SF.ms.delete(cid);
    delete pipe.lineMem[cid];
  }
  if (R) for (const [cid, L] of R.lost) if (now - L.at > R.cfg.LOST_TTL_MS) { R.lost.delete(cid); R.gal.delete(cid); delete pipe.lineMem[cid]; if (SF) SF.ms.delete(cid); }
  const conf = seen.filter(t => t.hits >= (tcfg.MIN_HITS ?? ST_CFG.MIN_HITS));
  conf.forEach(t => pipe.boxes.set(t.id, t.box));
  // งบการคำนวณค่าลักษณะ: K ครั้งต่อเฟรม
  let budget = R ? R.cfg.K : 0;
  const embed = t => {
    if (!R || typeof opt.embed !== "function") return null;
    if (budget <= 0) { R.stats.skipped++; return null; }
    budget--;
    let e = null; try { e = opt.embed(t.box); } catch { e = null; }
    if (!e || !e.length) return null;
    R.stats.embeds++;
    return e;
  };
  if (R) {
    const active = new Set(conf.map(t => canonOf(R, t.id)));
    // 1) track ใหม่ที่อาจเป็นคนเดิมที่ถูกบัง -> ใช้รหัสเดิม
    for (const t of conf) {
      if (R.checked.get(t.id) || R.alias.has(t.id)) continue;
      if (now - t.firstSeen > R.cfg.CHECK_MS) { R.checked.set(t.id, true); continue; }
      if (!R.lost.size && !R.staffGal.length) { R.checked.set(t.id, true); continue; }
      const e = embed(t); if (!e) continue;
      R.checked.set(t.id, true);
      const m = R.lost.size ? reidMatch(R, e, now, t.box, active) : null;
      if (m) {
        // ใช้รหัสเดิม ; ความจำเส้นนับเริ่มใหม่จากจุดที่โผล่ (ไม่เดาการข้ามเส้นระหว่างถูกบัง) — ถ้าเดินข้ามทิศเดิมซ้ำภายในช่วงที่ตั้ง จะไม่ถูกนับ
        R.alias.set(t.id, m.canon); R.lost.delete(m.canon);
        delete pipe.lineMem[t.id]; delete pipe.lineMem[m.canon];
        reidRemember(R, m.canon, e, now); active.add(m.canon); R.stats.revived++;
        res.revived.push({ id: t.id, canon: m.canon, sim: m.sim });
      } else reidRemember(R, t.id, e, now);
      const cid = canonOf(R, t.id);
      if (SF && !SF.flagged.has(cid) && R.staffGal.some(s => cosine(s, R.gal.get(cid).emb) >= R.cfg.STAFF_SIM)) { SF.flagged.add(cid); res.staff.push(cid); }
    }
  }
  const cidOf = t => canonOf(R, t.id);
  conf.forEach(t => { t.cid = cidOf(t); t.staff = !!(SF && SF.flagged.has(t.cid)); });
  // 2) โซนพนักงาน
  if (staffOn) {
    const fresh = staffStep(SF, cam.staffZone, conf.map(t => ({ id: t.cid, foot: foot(t.box) })), dt, opt.staffMs);
    for (const cid of fresh) {
      res.staff.push(cid);
      if (R && R.gal.has(cid)) R.staffGal.push(R.gal.get(cid).emb);
    }
    if (res.staff.length) conf.forEach(t => { t.staff = SF.flagged.has(t.cid); });
  }
  if (res.staff.length) {
    day.staff = (day.staff || 0) + res.staff.length;
    // ไม่นับเวลาในโซนของพนักงานตั้งแต่นี้ (ยอดเข้าโซนที่นับไปแล้วคงไว้)
    for (const zid in pipe.zoneLive) for (const cid of res.staff) delete pipe.zoneLive[zid][cid];
  }
  pipe.lastSeen = conf;
  res.conf = conf;
  if (!day.byCam) day.byCam = {};
  const bc = day.byCam[cam.slot] || (day.byCam[cam.slot] = { name: cam.name || cam.slot, in: 0, out: 0 });
  if (cam.name) bc.name = cam.name;
  const role = cam.role || "both";
  const active = new Set(conf.map(t => t.cid));
  const lineTracks = conf.slice();
  if (cam.line && role !== "zone" && tcfg.CROSS && tcfg.CROSS.flushLost) {
    // flushLost (round 5, ทางเลือก): track ที่ข้ามเส้นแล้วรอยืนยัน แต่หายไปก่อนครบ (ถูกบัง/ออกนอกภาพ) — ยังไม่ย้อนกลับ = นับ
    const seenIds = new Set(conf.map(t => t.id));
    for (const o of pipe.tracker.tracks) {
      const m = !seenIds.has(o.id) && pipe.lineMem[canonOf(R, o.id)];
      if (m && m.pend) lineTracks.push({ ...o, cid: canonOf(R, o.id), flush: true, staff: !!(SF && SF.flagged.has(canonOf(R, o.id))) });
    }
  }
  if (cam.line && role !== "zone") for (const t of lineTracks) {
    const mem = pipe.lineMem[t.cid] || (pipe.lineMem[t.cid] = {});
    let dir;
    if (t.flush) { dir = mem.pend.dir; mem.side = mem.pend.side; mem.pend = null; } else
    dir = tcfg.CROSS ? crossStep(mem, cam.line, center(t.box), !!cam.swap, tcfg.CROSS, t.box.h) : checkCrossing(mem, cam.line, center(t.box), !!cam.swap);
    if (!dir || t.staff) continue;
    if (R) {
      let e = R.gal.has(t.cid) ? R.gal.get(t.cid).emb : null;
      if (!e) { const x = embed(t); if (x) { reidRemember(R, t.cid, x, now); e = R.gal.get(t.cid).emb; } }
      const d = crossDecision(R, t.cid, dir, now, e, active);
      if (!d.count) { res.suppressed.push({ id: t.cid, dir, reason: d.reason }); continue; }
    }
    applyCrossing(day, dir, now); bc[dir]++; t.flash = { dir, until: now + 800 }; res.crossings.push({ id: t.cid, dir, box: t.box });
  }
  if (R) {
    // 3) เติมคลังค่าลักษณะ (เพื่อให้กู้รหัสได้เมื่อถูกบัง) แล้ว 4) อัปเดตค่าเก่า
    for (const t of conf) if (budget > 0 && !R.gal.has(t.cid)) { const e = embed(t); if (e) reidRemember(R, t.cid, e, now); }
    for (const t of conf) { const g = R.gal.get(t.cid); if (budget > 0 && g && now - g.at > R.cfg.REFRESH_MS) { const e = embed(t); if (e) reidRemember(R, t.cid, e, now); } }
    if (!day.dedup || typeof day.dedup !== "object") day.dedup = { suppressed: 0, revived: 0 };
    day.dedup.suppressed += res.suppressed.length; day.dedup.revived += res.revived.length;
  }
  const people = conf.filter(t => !t.staff);
  const obs = people.map(t => ({ id: t.cid, foot: foot(t.box) }));
  const zones = role === "door" ? [] : (cam.zones || []).map(z => ({ ...z, id: nsZone(cam.slot, z.id) }));
  const alive = new Set(pipe.tracker.tracks.map(t => canonOf(R, t.id)).filter(cid => !(SF && SF.flagged.has(cid))));
  pipe.zoneCounts = zoneStep(pipe.zoneLive, zones, obs, alive, day, now);
  res.obs = obs;
  return res;
}
/* เวลารอคิวที่วัดจริง: live = pipe.zoneLive[queueZoneId] -> {n, maxWaitMs} */
function queueWait(live, now) {
  let n = 0, mx = 0;
  for (const id in live || {}) { n++; mx = Math.max(mx, now - live[id].t0); }
  return { n, maxWaitMs: mx };
}
/* นับครั้งที่รอเกินเป้า (ครั้งละคน) — ทำเครื่องหมาย e.sla ในรายการโซนคิว คืนจำนวนที่เพิ่ง "เกิน" */
function slaStep(live, now, slaMs) {
  let n = 0;
  if (!(slaMs > 0)) return 0;
  for (const id in live || {}) { const e = live[id]; if (!e.sla && now - e.t0 > slaMs) { e.sla = true; n++; } }
  return n;
}
/* ย้ายข้อมูลรูปแบบกล้องเดียว -> หลายกล้อง (เรียกซ้ำได้ ผลเหมือนเดิม ไม่ลบข้อมูลเดิม)
   get(key) -> string|null ; set(key, string) ; keys = รายชื่อคีย์ทั้งหมด (สำหรับ st-day-*)
   - st-cams มี c1 · เส้น/โซน/swap/detW เดิมใน st-settings -> st-cam-c1 (ค่าเดิมยังอยู่ใน st-settings)
   - โซนคิว/แคชเชียร์ -> st-settings.queueZone / cashierZone ("c1:<id>") · st-settings.sv = 2
   - st-heat -> st-heat-c1 (เก็บคีย์เดิมไว้หนึ่งรุ่น)
   - st-day-*.zones เติม "c1:" หน้าคีย์หนึ่งครั้ง (day.zv = 2) และ byCam.c1 จากยอดเดิม
   คืนรายการสิ่งที่เปลี่ยน */
function migrateStore(get, set, keys = []) {
  const J = (k, d) => { try { const v = JSON.parse(get(k)); return v ?? d; } catch { return d; } };
  const done = [];
  if (get("st-cams") == null) {
    set("st-cams", JSON.stringify({ v: 1, cams: [{ slot: "c1", deviceId: "", label: "", name: "กล้อง 1", role: "both" }] }));
    done.push("st-cams");
  }
  const S = J("st-settings", null);
  if (S && typeof S === "object" && !Array.isArray(S)) {
    const zs = Array.isArray(S.zones) ? S.zones.filter(z => z && typeof z === "object" && z.id) : [];
    if (get("st-cam-c1") == null && (S.line || zs.length || S.swap || (S.detW && S.detW !== 416))) {
      set("st-cam-c1", JSON.stringify({
        line: S.line || null, swap: !!S.swap,
        zones: zs.map(z => ({ id: z.id, name: z.name, x: z.x, y: z.y, w: z.w, h: z.h })),
        detW: S.detW && S.detW !== 416 ? S.detW : 0
      }));
      done.push("st-cam-c1");
    }
    if (S.sv !== 2) {
      const q = zs.find(z => z.queue), c = zs.find(z => z.cashier);
      const out = { ...S, sv: 2 };
      if (out.queueZone == null) out.queueZone = q ? nsZone("c1", q.id) : "";
      if (out.cashierZone == null) out.cashierZone = c ? nsZone("c1", c.id) : "";
      set("st-settings", JSON.stringify(out));
      done.push("st-settings");
    }
  }
  if (get("st-heat") != null && get("st-heat-c1") == null) { set("st-heat-c1", get("st-heat")); done.push("st-heat-c1"); }
  for (const k of keys) {
    if (!/^st-day-\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const d = J(k, null);
    if (!d || typeof d !== "object" || d.zv === 2) continue;
    const zones = {};
    for (const [id, z] of Object.entries(d.zones || {})) zones[id.includes(":") ? id : nsZone("c1", id)] = z;
    const out = { ...d, zones, zv: 2 };
    if (!out.byCam && (d.in || d.out)) out.byCam = { c1: { name: "กล้อง 1", in: d.in || 0, out: d.out || 0 } };
    set(k, JSON.stringify(out));
    done.push(k);
  }
  return done;
}
/* ชื่อโซนสำหรับแสดง: เติมชื่อกล้องเมื่อมีหลายกล้อง */
function zoneLabel(day, key, z) {
  const i = key.indexOf(":"), cams = Object.keys(day.byCam || {});
  if (i < 0 || cams.length < 2) return z.name;
  const bc = day.byCam[key.slice(0, i)];
  return bc ? `${bc.name} · ${z.name}` : z.name;
}

// ---------- คุณภาพภาพรายชั่วโมง (round 10) ----------
// day.quality = {[ชั่วโมง]: {n, shake, dark, backlight, slow, offline, image}} = วินาทีที่ตัวตรวจสุขภาพภาพพบปัญหา (รวมทุกกล้อง)
// เก็บคู่กับยอดรายชั่วโมงเพื่อให้รายงาน/insights ทำเครื่องหมายหรือไม่นับชั่วโมงที่ภาพมีปัญหา — ไม่แก้ยอดนับเลย
const stSite = () => typeof LQSite !== "undefined" ? LQSite : (typeof require === "function" ? (() => { try { return require("./lensiq-sitecheck.js"); } catch { return null; } })() : null);
/** ข้อความปัญหาภาพของชั่วโมง h ("" = ไม่มีปัญหาหรือไม่มีข้อมูล) — เกณฑ์ ≥ 5 นาที */
function hourQuality(d, h) {
  const S = stSite(); if (!S || !d || !d.quality || !d.quality[h]) return "";
  const f = S.flaggedHours({ [h]: d.quality[h] })[0];
  return f ? (S.qualityText(f) || "มีปัญหาภาพ") : "";
}
/* round 12: day.qualityCam = {[slot]: {[ชั่วโมง]: …}} = แบบเดียวกับ day.quality แต่แยกกล้อง — บอกได้ว่ากล้องไหนมีปัญหา
   (day.quality รวมทุกกล้องยังเก็บเหมือนเดิม) -> ชื่อกล้องที่ชั่วโมง h มีปัญหาภาพ ≥ 5 นาที */
function qualityCams(d, h) {
  const S = stSite(); if (!S || !d || !d.qualityCam || typeof d.qualityCam !== "object") return [];
  return Object.keys(d.qualityCam).sort().filter(slot => { const q = d.qualityCam[slot]; return q && q[h] && S.flaggedHours({ [h]: q[h] }).length; })
    .map(slot => (d.byCam && d.byCam[slot] && d.byCam[slot].name) || slot);
}
/* round 12: กลับมาหลังแท็บถูกซ่อน/จอดับ (กล้องหยุดไประยะหนึ่ง) — ปิดโซนที่ค้าง และเริ่มติดตามคนใหม่ ไม่ให้ track เก่าก่อนช่วงหยุด
   ถูกจับคู่กับคนใหม่แล้วเกิดการข้ามเส้นปลอม ; ยอดที่นับแล้ว ค่าลักษณะ (re-ID) และสถานะพนักงานคงไว้ */
function resumePipe(pipe, day) {
  if (!pipe) return pipe;
  closeZones(pipe.zoneLive, day);
  pipe.tracker = ST_LQT.newTracker(ST_TRACK); pipe.lineMem = {}; pipe.boxes = new Map(); pipe.lastSeen = []; pipe.lastNow = 0;
  return pipe;
}

// ---------- CSV ----------
function csvCell(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function buildCsv(days, cashierId) {
  const rows = [["รายชั่วโมง"], ["วันที่", "ชั่วโมง", "เข้า", "ออก", "คุณภาพภาพ (ชั่วโมงที่มีปัญหา ยอดอาจคลาดเคลื่อน)"]];
  days.forEach(d => d.hourly.in.forEach((v, h) => { if (v || d.hourly.out[h]) rows.push([d.date, String(h).padStart(2, "0") + ":00", v, d.hourly.out[h], hourQuality(d, h)]); }));
  rows.push([], ["สรุปรายวัน"], ["วันที่", "เข้า", "ออก", "คนในร้านสูงสุด", "เวลาที่สูงสุด", "คิวสูงสุด", "อัตราการซื้อโดยประมาณ (%)", "พนักงานที่ไม่นับ", "รอคิวเกินเป้า (ครั้ง)", "ตัดการนับซ้ำ (ครั้ง)"]);
  days.forEach(d => {
    const c = conversion(d, cashierId);
    rows.push([d.date, d.in, d.out, d.peak, d.peakAt ? new Date(d.peakAt).toTimeString().slice(0, 5) : "", d.maxQueue, c == null ? "" : (c * 100).toFixed(1), d.staff || 0, d.slaBreach || 0, (d.dedup && d.dedup.suppressed) || 0]);
  });
  rows.push([], ["รายกล้อง"], ["วันที่", "กล้อง", "เข้า", "ออก"]);
  days.forEach(d => Object.keys(d.byCam || {}).sort().forEach(s => { const b = d.byCam[s]; rows.push([d.date, b.name || s, b.in || 0, b.out || 0]); }));
  rows.push([], ["โซน"], ["วันที่", "โซน", "จำนวนครั้งที่เข้า", "เวลาอยู่เฉลี่ย (วินาที)", "คนพร้อมกันสูงสุด"]);
  days.forEach(d => Object.entries(d.zones).forEach(([k, z]) => rows.push([d.date, zoneLabel(d, k, z), z.visits, avgDwellSec(z).toFixed(1), z.peak])));
  return "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\n");
}
/* ช่วงชั่วโมงที่มีข้อมูล (อย่างน้อย 08–20) */
function activeHours(d) {
  const act = []; for (let h = 0; h < 24; h++) if (d.hourly.in[h] || d.hourly.out[h]) act.push(h);
  return act.length ? [Math.min(...act), Math.max(...act)] : null;
}
/* CSV รายชั่วโมง: ทุกชั่วโมงตั้งแต่ชั่วโมงแรกถึงชั่วโมงสุดท้ายที่มีคนเข้า/ออกของแต่ละวัน (รวมชั่วโมงที่เป็น 0)
   คนในร้านสิ้นชั่วโมง = ยอดสะสม เข้า−ออก (ไม่ต่ำกว่า 0) · target = เป้าคนเข้าต่อชั่วโมง (0 = ไม่มี) */
function buildHourlyCsv(days, target = 0) {
  const rows = [["วันที่", "ชั่วโมง", "เข้า", "ออก", "สุทธิ", "คนในร้านสิ้นชั่วโมง (ประมาณ)", "คนในร้านสูงสุด", "คิวสูงสุด", "เป้าคนเข้า", "ถึงเป้า", "คุณภาพภาพ (ชั่วโมงที่มีปัญหา ยอดอาจคลาดเคลื่อน)"]];
  for (const d of days) {
    const r = activeHours(d); if (!r) continue;
    let cum = 0;
    for (let h = 0; h < r[0]; h++) cum = Math.max(0, cum + (d.hourly.in[h] || 0) - (d.hourly.out[h] || 0));
    for (let h = r[0]; h <= r[1]; h++) {
      const i = d.hourly.in[h] || 0, o = d.hourly.out[h] || 0;
      cum = Math.max(0, cum + i - o);
      rows.push([d.date, `${String(h).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:59`, i, o, i - o, cum,
        (d.hourlyOcc && d.hourlyOcc[h]) || 0, (d.hourlyQ && d.hourlyQ[h]) || 0, target > 0 ? target : "", target > 0 ? (i >= target ? "ใช่" : "ไม่") : "", hourQuality(d, h)]);
    }
  }
  return "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\n");
}

// ---------- สรุปวันนี้ (ข้อความสั้นภาษาไทย) ----------
const fmtSecTh = s => s < 60 ? `${Math.round(s)} วิ` : `${Math.floor(s / 60)} นาที${Math.round(s % 60) ? ` ${Math.round(s % 60)} วิ` : ""}`;
const hh = h => String(h).padStart(2, "0");
/* o = {cashierId, hourlyTarget, slaSec, staffOffset, nowHour, clock(ts)->'HH:MM'} คืนรายการประโยคสั้น */
function daySummary(d, o = {}) {
  const out = [];
  if (!d || !(d.in || d.out)) return ["ยังไม่มีคนเข้า–ออกวันนี้"];
  let bh = -1, bv = 0;
  for (let h = 0; h < 24; h++) if ((d.hourly.in[h] || 0) > bv) { bv = d.hourly.in[h]; bh = h; }
  out.push(`เข้าร้าน ${d.in} คน${bh >= 0 ? ` · คนเข้ามากสุดช่วง ${hh(bh)}:00–${hh(bh + 1 === 24 ? 0 : bh + 1)}:00 (${bv} คน)` : ""}`);
  if (d.peak) {
    const t = d.peakAt ? (o.clock ? o.clock(d.peakAt) : new Date(d.peakAt).toTimeString().slice(0, 5)) : "";
    out.push(`คนในร้านพร้อมกันสูงสุด ${d.peak} คน${t ? ` เวลา ${t}` : ""}`);
  }
  const c = conversion(d, o.cashierId);
  if (c != null) {
    const p = Math.round(c * 100);
    out.push(`อัตราการซื้อโดยประมาณ ${p}% — ${p >= 40 ? "สูง ลูกค้าส่วนใหญ่ไปถึงแคชเชียร์" : p >= 20 ? "ปานกลาง" : "ต่ำ หลายคนเดินดูแล้วไม่ซื้อ ลองดูโซนที่คนอยู่นาน"}`);
  }
  let bz = null, bd = 0;
  for (const [k, z] of Object.entries(d.zones || {})) { if (k === o.cashierId || !z.dwellN) continue; const s = avgDwellSec(z); if (s > bd) { bd = s; bz = zoneLabel(d, k, z); } }
  if (bz) out.push(`โซนที่ลูกค้าอยู่นานสุด: ${bz} (เฉลี่ย ${fmtSecTh(bd)})`);
  if (d.maxQueue) out.push(`คิวยาวสุด ${d.maxQueue} คน${o.slaSec > 0 ? (d.slaBreach ? ` · รอนานเกิน ${fmtSecTh(o.slaSec)} ${d.slaBreach} ครั้ง ควรเพิ่มจุดชำระเงินช่วงคนเยอะ` : ` · ไม่มีใครรอเกิน ${fmtSecTh(o.slaSec)}`) : ""}`);
  if (o.hourlyTarget > 0) {
    const r = activeHours(d);
    if (r) {
      const last = Math.min(r[1], o.nowHour != null ? o.nowHour : 23);
      let hit = 0, n = 0;
      for (let h = r[0]; h <= last; h++) { n++; if ((d.hourly.in[h] || 0) >= o.hourlyTarget) hit++; }
      if (n) out.push(`ถึงเป้าคนเข้า ${o.hourlyTarget} คน/ชม. ${hit} จาก ${n} ชั่วโมง`);
    }
  }
  if (d.staff || o.staffOffset) out.push(`ไม่นับพนักงาน: ${[d.staff ? `ตรวจพบจากโซนพนักงาน ${d.staff} คน` : "", o.staffOffset ? `หักจากคนในร้าน ${o.staffOffset} คน` : ""].filter(Boolean).join(" · ")}`);
  if (d.dedup && (d.dedup.suppressed || d.dedup.revived)) out.push(`ลดการนับซ้ำ: ไม่นับข้ามเส้นซ้ำ ${d.dedup.suppressed} ครั้ง · ต่อรหัสคนเดิมหลังถูกบัง ${d.dedup.revived} ครั้ง`);
  return out;
}

if (typeof module !== "undefined") module.exports = { ST_TRACK, ST_TRACK_R3, ST_TRACK_R4, ST_DET_MIN, REID_CFG, l2norm, cosine, newReid, canonOf, reidRemember, reidMatch, crossDecision, newStaff, staffStep, queueWait, slaStep, ensureDay, buildHourlyCsv, hourQuality, qualityCams, resumePipe, daySummary, activeHours, ST_CFG, ST_SLOTS, dayKey, iou, center, foot, normRect, pointInRect, newTracker, updateTracker, lineSide, segmentsIntersect, checkCrossing, crossStep, newDay, applyCrossing, zoneStep, closeZones, avgDwellSec, queueInfo, conversion, newHeat, heatAdd, heatMax, heatColor, heatToRGBA, buildCsv, decodePersons, nms, nsZone, autoDetW, newPipe, stepCam, migrateStore, zoneLabel };

// ================= ส่วนหน้าจอ =================
if (typeof document !== "undefined") (() => {
  const P = "st-";
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDur = s => s < 60 ? `${Math.round(s)} วิ` : `${Math.floor(s / 60)} นาที ${Math.round(s % 60)} วิ`;
  const fmtClock = ts => new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(P + k)); return v ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { engine("พื้นที่จัดเก็บเต็ม กรุณาส่งออก CSV แล้วล้างข้อมูล", "err"); } };
  const grid = $("#camGrid");

  try { migrateStore(k => localStorage.getItem(k), (k, v) => localStorage.setItem(k, v), Object.keys(localStorage)); }
  catch (e) { console.warn("migrateStore", e); }

  // ---- สถานะ ----
  // G = ค่าตั้งรวม (st-settings) ; ค่าต่อกล้องอยู่ใน cam.settings (st-cam-<slot>) = {line, swap, zones, detW, tiles}
  const G = Object.assign({ maxOcc: 20, serviceSec: 60, queueAlert: 5, heatOn: false, queueZone: "", cashierZone: "",
    queueSlaSec: 300, hourlyTarget: 0, reid: false, reidWindowSec: 10, staffMin: 15, staffOffset: 0, kpiScope: "all" }, load("settings", {}));
  let day = ensureDay(Object.assign(newDay(), load("day-" + dayKey(), {})));
  const pipes = new Map(), heats = new Map();
  let model = null, detName = "", delegateUsed = "", running = false, wakeLock = null, fileCam = null, fileUrl = null;
  let lastDash = 0, lastSave = 0, tool = "none", sel = "c1";
  const detectErrors = {};
  let agg = null; // เชื่อมหลายเครื่อง (ตั้งค่าด้านล่าง)

  const persistSettings = () => save("settings", G);
  const persistDay = () => save("day-" + day.date, day);
  const camSet = c => (c.settings = Object.assign({ line: null, swap: false, zones: [], detW: 0, tiles: "", staffZone: null }, c.settings || {}));
  const persistCam = c => { camSet(c); c.saveSettings(); };
  const pipeOf = slot => pipes.get(slot) || pipes.set(slot, newPipe()).get(slot);
  function heatOf(slot) {
    let h = heats.get(slot);
    if (!h) { h = newHeat(); const a = load("heat-" + slot, null); if (Array.isArray(a) && a.length === h.data.length) h.data.set(a); heats.set(slot, h); }
    return h;
  }
  const persistHeat = () => heats.forEach((h, slot) => save("heat-" + slot, Array.from(h.data, v => Math.round(v * 10) / 10)));
  // กล้องที่กำลังใช้ (สด/ไฟล์) และรายการที่บันทึกไว้ (เมื่อยังไม่เปิดกล้อง)
  const srcCams = () => fileCam ? [fileCam] : hub.cams;
  const storedCams = () => LQCam.parseCams(localStorage.getItem(P + "cams")).cams.map(e => ({ slot: e.slot, name: e.name || `กล้อง ${e.slot.slice(1)}`, role: e.role, settings: Object.assign({ line: null, swap: false, zones: [], detW: 0, tiles: "", staffZone: null }, load("cam-" + e.slot, {})) }));
  const cfgList = () => { const s = srcCams(); return s.length ? s : storedCams(); };
  const selCam = () => { const s = srcCams(); return s.find(c => c.slot === sel) || s[0] || null; };
  const zoneCount = id => { let n = 0; pipes.forEach(p => { n += p.zoneCounts[id] || 0; }); return n; };
  const zoneDef = id => { for (const c of cfgList()) for (const z of camSet(c).zones) if (nsZone(c.slot, z.id) === id) return { cam: c, z }; return null; };

  function engine(msg, cls = "") { const e = $("#engine"); e.textContent = msg; e.className = "engine " + cls; }

  // ---- กล้องหลายตัว (LQCam hub) ----
  const STATUS_TH = { idle: "ปิด", starting: "กำลังเปิด", live: "ทำงาน", paused: "พัก", error: "ผิดพลาด" };
  function buildTile(c) {
    const t = document.createElement("div");
    t.className = "st-tile";
    t.innerHTML = `<div class="tile-head">
        <input class="cam-name" maxlength="40" aria-label="ชื่อกล้อง">
        <select class="cam-role" aria-label="หน้าที่ของกล้อง"><option value="both">นับเข้า–ออก + โซน</option><option value="door">นับเข้า–ออก (ประตู)</option><option value="zone">โซนอย่างเดียว</option></select>
        <span class="pill st-status"></span><span class="pill st-hz">—</span><span class="pill st-health" hidden></span>
        <button class="btn ghost small cam-del" type="button">ลบกล้อง</button>
      </div>
      <div class="cam"></div>
      <p class="cam-health" role="status" hidden></p>
      <p class="cam-warn">อย่าให้เส้นนับ/โซนเดียวกันอยู่ในกล้องสองตัว (นับซ้ำ)</p>`;
    t.querySelector(".cam").append(c.video, c.overlay);
    c.overlay.setAttribute("aria-label", "ภาพจากกล้องพร้อมเส้นนับและโซน");
    const nm = t.querySelector(".cam-name"), rl = t.querySelector(".cam-role");
    nm.value = c.name; rl.value = ["both", "door", "zone"].includes(c.role) ? c.role : "both";
    nm.addEventListener("change", () => {
      const v = nm.value.trim() || c.name;
      if (c === fileCam) c.name = v; else hub.rename(c.slot, v);
      nm.value = c.name; if (day.byCam[c.slot]) day.byCam[c.slot].name = c.name;
      renderZoneEditor(); renderDash();
    });
    rl.addEventListener("change", () => {
      if (c === fileCam) c.role = rl.value; else hub.setRole(c.slot, rl.value);
      const p = pipes.get(c.slot); if (p) { closeZones(p.zoneLive, day); p.lineMem = {}; p.zoneCounts = {}; }
      renderDash(); draw(c);
    });
    t.querySelector(".cam-del").addEventListener("click", e => { e.stopPropagation(); removeCam(c); });
    t.addEventListener("click", () => select(c.slot));
    const lay = () => layout(c);
    c.video.addEventListener("loadedmetadata", lay); c.video.addEventListener("resize", lay);
    bindDraw(c);
    camSet(c);
    return t;
  }
  function layout(c) {
    const box = c.tile && c.tile.querySelector(".cam");
    if (box && c.video.videoWidth) box.style.aspectRatio = `${c.video.videoWidth} / ${c.video.videoHeight}`;
    sizeOverlay(c);
  }
  function tileUi() {
    const cams = srcCams();
    grid.classList.toggle("multi", cams.length > 1);
    $("#gridEmpty").hidden = cams.length > 0;
    for (const c of cams) {
      if (!c.tile) continue;
      c.tile.classList.toggle("sel", c.slot === (selCam() || {}).slot && cams.length > 1);
      const st = c.tile.querySelector(".st-status");
      st.textContent = STATUS_TH[c.status] || c.status; st.dataset.s = c.status;
      c.tile.querySelector(".cam-del").hidden = c === fileCam;
    }
    $("#addCam").disabled = !!fileCam || hub.cams.length >= 4;
  }
  function makeHub() {
    return LQCam.createHub({
      ns: "st", grid, tile: buildTile, facing: "environment",
      onChange(h, ev) {
        if (ev.type === "added" || ev.type === "removed") { syncSched(); renderZoneEditor(); renderDash(); }
        if (ev.type === "started" || ev.type === "resumed") { const c = h.cam(ev.slot); if (c) setTimeout(() => layout(c), 0); }
        // ถอดกล้องทุกตัว/กล้องหยุดทำงานระหว่างวิเคราะห์: หยุดอย่างเป็นระบบ (บันทึกยอด) และแสดงปุ่มลองใหม่ แทนการค้างว่า "กำลังวิเคราะห์"
        if (ev.type === "reconnected" && running) engine("กล้องกลับมาเชื่อมต่อแล้ว — นับต่อ", "ok");
        // round 10: กล้องหลุดแต่ LQCam กำลังเชื่อมต่อใหม่เอง (offlineSince) -> วิเคราะห์ต่อ บันทึกยอด และแจ้งสถานะ ; ปุ่ม "หยุด" ยังใช้ได้ตามเดิม
        if (running && !fileCam && h === hub && h.cams.length && h.cams.every(c => !c.active && c.status === "error") && h.cams.some(c => c.offlineSince)) {
          if (ev.type === "ended") { persistDay(); engine("กล้องหลุด — กำลังเชื่อมต่อใหม่อัตโนมัติ (ยอดที่นับแล้วบันทึกไว้แล้ว กด \"หยุด\" ถ้าต้องการหยุดนับ)", "warn"); }
        } else if (running && !fileCam && h === hub && h.cams.length && h.cams.every(c => !c.active && c.status === "error")) {
          setTimeout(() => { if (running && !fileCam && hub.cams.every(c => !c.active)) { stopSource(); showError(Object.assign(new Error("กล้องถูกถอดหรือหยุดทำงาน"), { name: "Ended" }), startCamera); } }, 0);
        }
        tileUi();
      }
    });
  }
  let hub = makeHub();
  function select(slot) {
    if (sel === slot) return;
    sel = slot; tileUi(); renderZoneEditor(); syncForm(); drawHeatPreview();
  }

  // ---- กันจอดับระหว่างวิเคราะห์ (มือถือที่ตั้งเป็นกล้องประจำจุด) ----
  // round 12: LQCam.unattended — Wake Lock + แจ้งเตือนเมื่อแท็บถูกซ่อน/จอดับ + บันทึกช่วงที่หยุดเป็น "กล้องออฟไลน์" (ตัวเลขเท่านั้น)
  const UA = LQCam.unattended ? LQCam.unattended({ container: $("#uaBox") || $("#engine").parentNode, isRunning: () => running && !fileCam, onGap: g => onHiddenGap(g) }) : null;
  function onHiddenGap(g) {
    if (!running || fileCam) return;
    if (dayKey(g.to) !== day.date) { pipes.forEach(p => { closeZones(p.zoneLive, day); p.reid = null; p.staff = null; }); persistDay(); day = newDay(dayKey(g.to)); }
    if (SITE) {
      SITE.noteGap(day.quality || (day.quality = {}), g.from, g.to);
      const QC = day.qualityCam || (day.qualityCam = {});
      for (const c of srcCams()) SITE.noteGap(QC[c.slot] || (QC[c.slot] = {}), g.from, g.to);
    }
    (day.gaps || (day.gaps = [])).push({ from: g.from, to: g.to }); while (day.gaps.length > 50) day.gaps.shift();
    pipes.forEach(p => resumePipe(p, day));
    if (SC && !SC.file) SC.hiddenMs = (SC.hiddenMs || 0) + g.ms;
    persistDay(); renderDash();
  }
  async function keepAwake(on) {
    if (UA) { if (on) UA.start(); else UA.stop(); return; }
    try {
      if (on && !wakeLock && navigator.wakeLock && document.visibilityState === "visible") { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); }
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { console.warn("wakeLock", e); }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && running) keepAwake(true); });

  // ---- โหลดโมเดล: YOLOX-Nano (Apache-2.0, ONNX Runtime WASM) เป็นหลัก ; COCO-SSD (TF.js) สำรอง — ไม่ต้องใช้ WebGL ----
  // ?coco = บังคับใช้ COCO-SSD (เทียบผล/เครื่องที่โหลด ONNX ไม่ได้)
  async function loadDetector() {
    if (LQDetect.isTest()) { delegateUsed = "test"; return null; }
    if (model) return model;
    engine("กำลังโหลดโมเดลตรวจจับคน...");
    const forceCoco = new URLSearchParams(location.search).has("coco");
    if (!forceCoco && typeof ort !== "undefined") {
      try { model = await LQDetect.loadYolox("vendor/models/yolox/yolox_nano_416.onnx"); delegateUsed = "wasm"; detName = "YOLOX-Nano"; return model; }
      catch (e) { console.warn("YOLOX ใช้ไม่ได้ ใช้ COCO-SSD แทน", e); }
    }
    try {
      if (typeof faceapi === "undefined") throw new Error("ไม่พบไลบรารี vendor/face-api.js");
      delegateUsed = await LQDetect.tfBackend();
      model = await LQDetect.loadCoco("vendor/models/cocossd/model.json"); detName = "COCO-SSD";
      return model;
    } catch (e) { throw Object.assign(e, { model: true }); }
  }

  // ---- ลดการนับซ้ำ: MobileNetV2 (vendor/models/mobilenet — ตัวเดียวกับหน้าสแกนสินค้า) ----
  // ค่าลักษณะภาพอยู่ใน pipe.reid (หน่วยความจำ) เท่านั้น ; ตัด crop จากภาพย่อที่ใช้ตรวจจับคนเฟรมเดียวกัน
  const RS = { model: null, loading: null, ms: 0, n: 0, err: "", t0: 0 };
  const cropCv = document.createElement("canvas"); cropCv.width = cropCv.height = 224;
  const fakeEmb = () => LQDetect.isTest() && typeof window.__LQ_FAKE_EMB === "function";
  function loadReid() {
    if (fakeEmb()) return Promise.resolve(true);
    if (RS.model) return Promise.resolve(true);
    if (RS.loading) return RS.loading;
    RS.loading = (async () => {
      try {
        if (typeof faceapi === "undefined" || !faceapi.tf?.loadGraphModel) throw new Error("ไม่พบ TensorFlow.js");
        RS.model = await LQDetect.loadEmbedder("vendor/models/mobilenet/model.json"); RS.err = ""; return true;
      } catch (e) { console.warn("reid model", e); RS.err = e.message || String(e); return false; }
      finally { RS.loading = null; renderReidInfo(); }
    })();
    return RS.loading;
  }
  /* ภาพต้นทางของเฟรมนี้: ภาพย่อที่ส่งเข้า COCO-SSD (ตรงกับกล่อง) หรือวาดจากวิดีโอ (โหมดทดสอบ) */
  function frameSrc(c) {
    if (c._srcTick === c._tick && c._src) return c._src;
    let src = c._small && c._small.width > 1 && c._detTick === c._tick ? c._small : null;
    if (!src) {
      const v = c.video, W = v.videoWidth, H = v.videoHeight; if (!W || !H) return null;
      const cv = c._rsrc || (c._rsrc = document.createElement("canvas")), w = Math.min(416, W), h = Math.round(H * w / W);
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      cv.getContext("2d").drawImage(v, 0, 0, w, h); src = cv;
    }
    c._src = src; c._srcTick = c._tick; return src;
  }
  function embedderFor(c, now) {
    if (!G.reid) return null;
    if (fakeEmb()) return box => { const e = window.__LQ_FAKE_EMB(c.slot, box, now); RS.n++; return e ? Float32Array.from(e) : null; };
    if (!RS.model) return null;
    // ตัด crop + MobileNetV2 = LQDetect.embedBox (โค้ดเดียวกับชุดวัดความแม่นยำ tests/bench)
    return box => {
      const src = frameSrc(c); if (!src) return null;
      const t = performance.now();
      const v = LQDetect.embedBox(RS.model, src, box, { pad: 0.04, canvas: cropCv });
      if (!v) return null;
      const ms = performance.now() - t; RS.ms = RS.ms ? RS.ms * 0.9 + ms * 0.1 : ms; RS.n++;
      return v;
    };
  }
  function renderReidInfo() {
    const el = $("#reidInfo"); if (!el) return;
    let st = { emb: 0, rev: 0, sup: 0, skip: 0 };
    pipes.forEach(p => { if (p.reid) { st.emb += p.reid.stats.embeds; st.rev += p.reid.stats.revived; st.sup += p.reid.stats.suppressed; st.skip += p.reid.stats.skipped; } });
    const base = "ค่าลักษณะภาพอยู่ในหน่วยความจำเท่านั้น ไม่บันทึก ไม่ส่งออก ลบทิ้งเมื่อกดหยุดหรือขึ้นวันใหม่";
    if (!G.reid) { el.textContent = "ลดการนับซ้ำ (ปิดอยู่): ใช้ค่าลักษณะภาพของคน (MobileNetV2) ต่อรหัสเดิมเมื่อคนถูกบังชั่วคราว และไม่นับข้ามเส้นซ้ำ — " + base; return; }
    if (RS.err) { el.textContent = `โหลดโมเดลลดการนับซ้ำไม่สำเร็จ (${RS.err}) — นับแบบปกติ`; return; }
    if (RS.loading) { el.textContent = "กำลังโหลดโมเดลลดการนับซ้ำ (MobileNetV2 ~14 MB)..."; return; }
    el.textContent = `ลดการนับซ้ำ: เปิด${RS.ms ? ` · ${RS.ms.toFixed(0)} ms/ครั้ง (สูงสุด 2 ครั้งต่อรอบ)` : ""} · คำนวณแล้ว ${st.emb} ครั้ง · ต่อรหัสเดิม ${st.rev} · ไม่นับซ้ำ ${st.sup} — ${base}`;
  }

  /* ตรวจจับคนหนึ่งเฟรมของกล้องหนึ่งตัว (ย่อภาพเหลือกว้าง detW px — 416/352/320 ตามจำนวนกล้อง) คืนกล่องพิกัดสัดส่วน */
  async function detectPeople(c) {
    const fk = LQDetect.fake(c.slot, performance.now());
    if (fk) return fk;
    if (!model) return [];
    const detW = camSet(c).detW || autoDetW(srcCams().filter(x => x.active).length);
    const tm = /^(\d)x(\d)$/.exec(camSet(c).tiles || ""); // แบ่งภาพเพื่อเห็นคนตัวเล็ก/อยู่ไกล (โมเดลย่อทุกภาพเหลือขนาดคงที่: YOLOX 416², COCO-SSD 300²)
    const r = await LQDetect.detectPeople(model, c.video, { detW, minScore: ST_DET_MIN, canvas: c._small || (c._small = document.createElement("canvas")), tiles: tm ? { cols: +tm[1], rows: +tm[2], overlap: 0.2 } : null });
    c._detTick = c._tick;
    return r;
  }

  function showError(e, retry) {
    console.error(e);
    const kind = LQCam.errorKind(e);
    const m = e.name === "MediaError" ? "เปิดไฟล์วิดีโอไม่ได้ ลองไฟล์ MP4/WebM อื่น" : LQCam.errorText(e);
    engine(`ระบบไม่พร้อม: ${e.model ? "โหลดโมเดลตรวจจับคนไม่สำเร็จ" : m || "เกิดข้อผิดพลาด"} (${e.name}: ${e.message || "-"})`, "err");
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn ghost retry"; b.textContent = "ลองใหม่"; b.onclick = retry;
    $("#engine").append(" ", b);
    if (kind === "insecure") { const a = document.createElement("a"); a.href = "cameras.html"; a.className = "engine-link"; a.textContent = "ดูวิธีเปิดผ่าน https"; $("#engine").append(" ", a); }
  }
  const engineRunning = label => engine(`กำลังวิเคราะห์ (${label}) — ${detName ? detName + " · " : ""}ตัวประมวลผล: ${delegateUsed.toUpperCase()}${delegateUsed === "webgl" || delegateUsed === "test" ? "" : " อาจช้ากว่าปกติ"}`, "ok");

  // ---- ตัวจัดคิวประมวลผล (หนึ่งกล้องต่อหนึ่งรอบ ไม่ซ้อนกัน) ----
  const sched = LQCam.createScheduler({ targetHz: 10 });
  const schedKeys = new Set();
  function syncSched() {
    const cams = srcCams();
    for (const c of cams) {
      if (schedKeys.has(c.slot) && c._sched === sched) continue;
      sched.add(c.slot, () => tick(c), { cam: c }); schedKeys.add(c.slot); c._sched = sched;
    }
    for (const k of [...schedKeys]) if (!cams.some(c => c.slot === k)) { sched.remove(k); schedKeys.delete(k); }
    for (const c of cams) sched.setEnabled(c.slot, true);
  }
  async function tick(c) {
    if (!running || !c.active || c.video.readyState < 2 || c.video.paused) return;
    try {
      c._tick = (c._tick || 0) + 1;
      const dets = await detectPeople(c);
      if (!running) return;
      detectErrors[c.slot] = 0;
      process(c, dets, Date.now());
    } catch (e) {
      console.error(e);
      if ((detectErrors[c.slot] = (detectErrors[c.slot] || 0) + 1) >= 5) { stopSource(); showError(Object.assign(e, { model: true }), startCamera); }
    }
  }

  // ---- แหล่งภาพ ----
  function stopSource() {
    running = false; keepAwake(false); sched.stop();
    hub.stopAll();
    if (fileCam) { fileCam.video.pause(); fileCam.video.removeAttribute("src"); fileCam.video.load(); fileCam.active = false; fileCam.status = "idle"; }
    if (fileUrl) { URL.revokeObjectURL(fileUrl); fileUrl = null; }
    pipes.forEach(p => closeZones(p.zoneLive, day)); pipes.clear();
    persistDay(); persistHeat();
    $("#stop").disabled = true; $("#fps").textContent = "—";
    srcCams().forEach(c => draw(c)); tileUi(); renderDash();
  }
  function dropFileCam() {
    if (!fileCam) return;
    fileCam.tile.remove(); fileCam = null; syncSched();
  }

  async function startCamera() {
    stopSource(); dropFileCam();
    engine("กำลังเปิดกล้อง...");
    try {
      if (hub.cams.length) await hub.startAll();
      else await hub.restore();
      if (!hub.cams.length) await hub.add({});
      const live = hub.cams.filter(c => c.active);
      if (!live.length) throw hub.cams.find(c => c.lastError)?.lastError || Object.assign(new Error("no camera"), { name: "NotFoundError" });
      if (!live.some(c => c.slot === sel)) sel = live[0].slot;
      await begin(live.length > 1 ? `กล้อง ${live.length} ตัว` : "กล้อง");
    } catch (e) { stopSource(); showError(e, startCamera); }
  }
  async function addCamera() {
    if (fileCam) { stopSource(); dropFileCam(); }
    try {
      if (!running) { await startCamera(); return; } // ยังไม่ได้เปิด: เปิดกล้องที่ตั้งไว้ก่อน (กดอีกครั้งเพื่อเพิ่ม)
      engine("กำลังเพิ่มกล้อง...");
      const c = await hub.add({});
      sel = c.slot; syncSched(); tileUi(); renderZoneEditor(); syncForm();
      engineRunning(`กล้อง ${hub.cams.filter(x => x.active).length} ตัว`);
    } catch (e) {
      console.warn(e);
      engine(LQCam.errorText(e) || "เพิ่มกล้องไม่สำเร็จ", e.name === "CapacityError" ? "warn" : "err");
      tileUi();
    }
  }
  function removeCam(c) {
    if (c === fileCam) return;
    const s = camSet(c);
    if ((s.line || s.zones.length) && !confirm(`ลบ "${c.name}" พร้อมเส้นนับและโซนของกล้องนี้? (สถิติที่นับแล้วยังอยู่)`)) return;
    const p = pipes.get(c.slot); if (p) closeZones(p.zoneLive, day);
    pipes.delete(c.slot); heats.delete(c.slot);
    try { localStorage.removeItem(P + "heat-" + c.slot); } catch { /* ignore */ }
    for (const k of ["queueZone", "cashierZone"]) if (G[k] && G[k].startsWith(c.slot + ":")) G[k] = "";
    persistSettings(); persistDay();
    hub.remove(c.slot);
    if (!hub.cams.some(x => x.active)) { running = false; sched.stop(); $("#stop").disabled = true; }
    tileUi(); renderZoneEditor(); renderDash(); drawHeatPreview();
  }

  async function startFile(file) {
    stopSource();
    hub.destroy(); hub = makeHub(); // หยุดและซ่อนกล้องสด (การตั้งค่ากล้องยังอยู่)
    if (fileCam) fileCam.tile.remove();
    try {
      const video = document.createElement("video"), overlay = document.createElement("canvas");
      video.muted = true; video.playsInline = true; video.setAttribute("playsinline", ""); video.loop = true;
      const st = storedCams().find(e => e.slot === "c1");
      fileCam = {
        slot: "c1", name: st ? st.name : "กล้อง 1", role: st ? st.role : "both", video, overlay, status: "live", active: true,
        settings: load("cam-c1", {}), saveSettings() { save("cam-c1", this.settings); },
        intervalMsEma: 0, lastInferAt: 0, frames: 0, inferMsEma: 0,
        noteInfer(t0, ms) { if (this.lastInferAt) this.intervalMsEma = this.intervalMsEma ? this.intervalMsEma * 0.8 + (t0 - this.lastInferAt) * 0.2 : t0 - this.lastInferAt; this.lastInferAt = t0; this.frames++; this.inferMsEma = this.inferMsEma ? this.inferMsEma * 0.8 + ms * 0.2 : ms; }
      };
      fileCam.tile = buildTile(fileCam); fileCam.tile.dataset.slot = "c1"; grid.append(fileCam.tile);
      sel = "c1"; tileUi(); renderZoneEditor(); syncForm();
      fileUrl = URL.createObjectURL(file);
      video.src = fileUrl;
      await new Promise((res, rej) => {
        if (video.readyState >= 1) return res();
        video.addEventListener("loadedmetadata", res, { once: true });
        video.addEventListener("error", () => rej(Object.assign(new Error(video.error?.message || "media error"), { name: "MediaError" })), { once: true });
      });
      await video.play();
      layout(fileCam);
      await begin("ไฟล์วิดีโอ: " + file.name);
    } catch (e) { stopSource(); showError(e.name === "NotSupportedError" ? Object.assign(e, { name: "MediaError" }) : e, () => $("#file").click()); }
  }

  async function begin(label) {
    await loadDetector();
    if (G.reid) loadReid();
    running = true; $("#stop").disabled = false; keepAwake(true);
    engineRunning(label);
    srcCams().forEach(c => layout(c));
    syncSched(); sched.start(); tileUi(); renderZoneEditor(); syncForm(); renderDash();
  }

  function process(c, dets, now) {
    if (dayKey(now) !== day.date) {
      // วันใหม่: ปิดโซน และล้างค่าลักษณะภาพ/สถานะพนักงานของเมื่อวาน (หน่วยความจำเท่านั้น)
      pipes.forEach(p => { closeZones(p.zoneLive, day); p.reid = null; p.staff = null; });
      persistDay(); day = newDay(dayKey(now));
    }
    const s = camSet(c), pipe = pipeOf(c.slot);
    const tcfg = ST_LQT.trackerCfgFor(ST_TRACK, c.intervalMsEma);
    const embed = embedderFor(c, now);
    const opt = { reid: !!(G.reid && embed), embed, reidCfg: { CROSS_WINDOW_MS: Math.max(2, +G.reidWindowSec || 10) * 1000 }, staffMs: (+G.staffMin || 0) * 60000 };
    if (pipe.reid) pipe.reid.cfg.CROSS_WINDOW_MS = opt.reidCfg.CROSS_WINDOW_MS;
    if (!opt.reid && pipe.reid) pipe.reid = null; // ปิดลดการนับซ้ำ -> ลบค่าลักษณะทันที
    const r = stepCam(pipe, { slot: c.slot, name: c.name, role: c.role, line: s.line, swap: s.swap, zones: s.zones, staffZone: s.staffZone }, day, dets, now, tcfg, opt);
    healthStep(c, dets, now); scObserve(c, r, dets);
    if (G.queueZone) {
      const qn = zoneCount(G.queueZone), h = new Date(now).getHours();
      day.maxQueue = Math.max(day.maxQueue, qn); day.hourlyQ[h] = Math.max(day.hourlyQ[h] || 0, qn);
      if (G.queueZone.startsWith(c.slot + ":")) day.slaBreach += slaStep(pipe.zoneLive[G.queueZone], now, (+G.queueSlaSec || 0) * 1000);
    }
    const H = heatOf(c.slot); r.obs.forEach(o => heatAdd(H, o.foot));
    draw(c, now);
    if (now - lastDash > 1000) { lastDash = now; renderDash(); }
    if (now - lastSave > 10000) { lastSave = now; persistDay(); persistHeat(); }
  }

  // ---- วาดภาพซ้อน (ต่อกล้อง) ----
  function sizeOverlay(c) {
    const r = c.overlay.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    c.overlay.width = Math.max(1, Math.round(r.width * dpr)); c.overlay.height = Math.max(1, Math.round(r.height * dpr));
    draw(c);
  }
  const heatCanvas = document.createElement("canvas");
  function paintHeat(ctx, H, w, h) {
    heatCanvas.width = H.w; heatCanvas.height = H.h;
    heatCanvas.getContext("2d").putImageData(new ImageData(heatToRGBA(H), H.w, H.h), 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(heatCanvas, 0, 0, w, h); ctx.restore();
  }
  function paintLine(ctx, line, swap, w, h, k) {
    const ax = line.a.x * w, ay = line.a.y * h, bx = line.b.x * w, by = line.b.y * h;
    ctx.lineWidth = 3 * k; ctx.strokeStyle = "#8b7bff"; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    // ลูกศรทิศ "เข้า" ชี้ไปฝั่ง +1 (หรือ -1 ถ้าสลับ)
    let nx = -(by - ay), ny = bx - ax; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    if (swap) { nx = -nx; ny = -ny; }
    const mx = (ax + bx) / 2, my = (ay + by) / 2, len = 34 * k;
    ctx.strokeStyle = ctx.fillStyle = "#2a78d6"; ctx.lineWidth = 3 * k;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + nx * len, my + ny * len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx + nx * (len + 9 * k), my + ny * (len + 9 * k));
    ctx.lineTo(mx + nx * len - ny * 7 * k, my + ny * len + nx * 7 * k); ctx.lineTo(mx + nx * len + ny * 7 * k, my + ny * len - nx * 7 * k); ctx.fill();
    label(ctx, "เข้า", mx + nx * (len + 22 * k), my + ny * (len + 22 * k), "#2a78d6", k, true);
    label(ctx, "ออก", mx - nx * 22 * k, my - ny * 22 * k, "#eb6834", k, true);
  }
  function label(ctx, text, x, y, bg, k, centered = false) {
    ctx.font = `500 ${12 * k}px Prompt, sans-serif`;
    const tw = ctx.measureText(text).width + 10 * k, th = 18 * k;
    const lx = centered ? x - tw / 2 : x, ly = centered ? y - th / 2 : y;
    ctx.fillStyle = bg; ctx.fillRect(lx, ly, tw, th);
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(text, lx + 5 * k, ly + th / 2);
  }
  function paintZones(ctx, c, w, h, k, counts) {
    camSet(c).zones.forEach(z => {
      const id = nsZone(c.slot, z.id), col = id === G.queueZone ? "#eb6834" : id === G.cashierZone ? "#1a7f4b" : "#6cc4e3";
      ctx.strokeStyle = col; ctx.lineWidth = 2 * k; ctx.setLineDash([6 * k, 4 * k]);
      ctx.strokeRect(z.x * w, z.y * h, z.w * w, z.h * h); ctx.setLineDash([]);
      label(ctx, counts ? `${z.name} · ${counts[id] || 0}` : z.name, z.x * w + 2 * k, z.y * h + 2 * k, col, k);
    });
  }
  function paintStaff(ctx, z, w, h, k) {
    ctx.save(); ctx.fillStyle = "rgba(90,100,112,.18)"; ctx.fillRect(z.x * w, z.y * h, z.w * w, z.h * h);
    ctx.strokeStyle = "#5b6670"; ctx.lineWidth = 2 * k; ctx.setLineDash([3 * k, 3 * k]); ctx.strokeRect(z.x * w, z.y * h, z.w * w, z.h * h); ctx.restore();
    label(ctx, "โซนพนักงาน", z.x * w + 2 * k, z.y * h + z.h * h - 20 * k, "#5b6670", k);
  }
  function draw(c, now = Date.now()) {
    if (!c || !c.overlay) return;
    const ctx = c.overlay.getContext("2d"), w = c.overlay.width, h = c.overlay.height, k = devicePixelRatio || 1, s = camSet(c);
    const pipe = pipes.get(c.slot);
    ctx.clearRect(0, 0, w, h);
    if (G.heatOn) paintHeat(ctx, heatOf(c.slot), w, h);
    if (c.role !== "door") paintZones(ctx, c, w, h, k, pipe ? pipe.zoneCounts : {});
    if (s.line && c.role !== "zone") paintLine(ctx, s.line, s.swap, w, h, k);
    if (s.staffZone) paintStaff(ctx, s.staffZone, w, h, k);
    for (const t of pipe ? pipe.lastSeen : []) {
      const b = t.box, fl = t.flash && t.flash.until > now ? t.flash.dir : null;
      ctx.strokeStyle = t.staff ? "#9aa3ad" : fl === "in" ? "#2a78d6" : fl === "out" ? "#eb6834" : "#ffffff";
      ctx.lineWidth = (fl ? 4 : 2) * k;
      ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);
      label(ctx, `#${t.cid ?? t.id}${t.staff ? " พนักงาน" : fl ? (fl === "in" ? " เข้า" : " ออก") : ""}`, b.x * w, Math.max(0, b.y * h - 18 * k), t.staff ? "#5b6670" : fl === "in" ? "#2a78d6" : fl === "out" ? "#eb6834" : "#0e1430", k);
      const f = foot(b); ctx.fillStyle = "#8b7bff"; ctx.beginPath(); ctx.arc(f.x * w, f.y * h, 4 * k, 0, Math.PI * 2); ctx.fill();
    }
    const drag = c._drag;
    if (drag) {
      ctx.strokeStyle = "#8b7bff"; ctx.lineWidth = 2 * k; ctx.setLineDash([5 * k, 4 * k]);
      if (tool === "line") { ctx.beginPath(); ctx.moveTo(drag.a.x * w, drag.a.y * h); ctx.lineTo(drag.b.x * w, drag.b.y * h); ctx.stroke(); }
      else { const r = normRect(drag.a, drag.b); ctx.strokeRect(r.x * w, r.y * h, r.w * w, r.h * h); }
      ctx.setLineDash([]);
    }
  }
  const drawAll = () => srcCams().forEach(c => draw(c));

  // ---- วาดเส้น/โซนด้วยการลาก (บนภาพของกล้องที่เลือก) ----
  function bindDraw(c) {
    const ov = c.overlay;
    const ptOf = e => { const r = ov.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
    ov.addEventListener("pointerdown", e => {
      select(c.slot);
      if (tool === "none" || !e.isPrimary) return;
      e.preventDefault(); ov.setPointerCapture?.(e.pointerId); const p = ptOf(e); c._drag = { a: p, b: p }; draw(c);
    });
    ov.addEventListener("pointermove", e => { if (c._drag && e.isPrimary) { e.preventDefault(); c._drag.b = ptOf(e); draw(c); } });
    ov.addEventListener("pointerup", e => {
      if (!c._drag) return;
      c._drag.b = ptOf(e);
      const { a, b } = c._drag; c._drag = null;
      const s = camSet(c);
      if (tool === "line" && Math.hypot(b.x - a.x, b.y - a.y) > 0.03) {
        s.line = { a, b }; if (pipes.get(c.slot)) pipes.get(c.slot).lineMem = {}; persistCam(c);
        $("#drawMsg").textContent = `บันทึกเส้นนับของ "${c.name}" แล้ว ลูกศรสีน้ำเงินคือทิศ "เข้า" กด "สลับทิศ" หากกลับด้าน`;
      } else if (tool === "staff") {
        const r = normRect(a, b);
        if (r.w > 0.03 && r.h > 0.03) {
          s.staffZone = r; persistCam(c);
          $("#drawMsg").textContent = `บันทึกโซนพนักงานของ "${c.name}" แล้ว — คนที่อยู่ในโซนนี้เกิน ${G.staffMin} นาทีจะไม่ถูกนับ`;
        }
      } else if (tool === "zone") {
        const r = normRect(a, b);
        if (r.w > 0.03 && r.h > 0.03) {
          const names = ["ชั้นวางสินค้า", "แคชเชียร์", "จุดรอคิว", "โปรโมชัน"];
          const used = new Set(cfgList().flatMap(x => camSet(x).zones.map(z => z.name)));
          const name = names.find(n => !used.has(n)) || `โซน ${s.zones.length + 1}`;
          s.zones.push({ id: "z" + Date.now().toString(36), name, ...r });
          persistCam(c); renderZoneEditor();
          $("#drawMsg").textContent = `เพิ่มโซน "${name}" ใน "${c.name}" แล้ว แก้ชื่อและกำหนดเป็นโซนคิว/แคชเชียร์ได้ในรายการโซน`;
        }
      }
      draw(c); renderDash(); drawHeatPreview();
    });
    ov.addEventListener("pointercancel", () => { c._drag = null; draw(c); });
  }
  document.querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", () => {
    tool = b.dataset.tool;
    document.querySelectorAll("[data-tool]").forEach(x => x.setAttribute("aria-pressed", x === b));
    grid.classList.toggle("drawing", tool !== "none");
    const many = srcCams().length > 1 ? " (แตะภาพของกล้องที่ต้องการ)" : "";
    $("#drawMsg").textContent = { line: "ลากนิ้วหรือเมาส์บนภาพเพื่อวาดเส้นนับคนเข้า/ออก (เช่น ขวางประตู)" + many, zone: "ลากนิ้วหรือเมาส์บนภาพเพื่อวาดสี่เหลี่ยมโซน" + many, staff: "ลากบริเวณที่มีแต่พนักงาน (เช่น หลังเคาน์เตอร์) — หนึ่งโซนต่อกล้อง" + many, none: "" }[tool];
  }));

  // ---- รายการโซน (ของกล้องที่เลือก) ----
  function renderZoneEditor() {
    const box = $("#zoneList"), c = selCam() || cfgList()[0];
    $("#zoneCam").textContent = c && cfgList().length > 1 ? `กล้อง: ${c.name}` : "";
    const zones = c ? camSet(c).zones : [];
    if (!zones.length) { box.innerHTML = `<p class="hint">ยังไม่มีโซน${c && cfgList().length > 1 ? "ในกล้องนี้" : ""} เลือก "ลากโซน" แล้วลากบนภาพ</p>`; return; }
    box.innerHTML = zones.map(z => { const id = nsZone(c.slot, z.id); return `<div class="zrow" data-id="${esc(z.id)}">
      <input class="zname" aria-label="ชื่อโซน" maxlength="30" value="${esc(z.name)}">
      <label class="chk"><input type="checkbox" data-flag="queueZone" ${G.queueZone === id ? "checked" : ""}>คิว</label>
      <label class="chk"><input type="checkbox" data-flag="cashierZone" ${G.cashierZone === id ? "checked" : ""}>แคชเชียร์</label>
      <button class="btn ghost danger" type="button" data-del aria-label="ลบโซน ${esc(z.name)}">ลบ</button></div>`; }).join("");
  }
  const editCam = () => selCam();
  $("#zoneList").addEventListener("input", e => {
    const row = e.target.closest(".zrow"), c = editCam(); if (!row || !c || !e.target.classList.contains("zname")) return;
    const z = camSet(c).zones.find(x => x.id === row.dataset.id); if (!z) return;
    z.name = e.target.value.trim() || "โซน";
    persistCam(c); draw(c);
  });
  $("#zoneList").addEventListener("change", e => {
    const row = e.target.closest(".zrow"), flag = e.target.dataset.flag, c = editCam(); if (!row || !flag || !c) return;
    const id = nsZone(c.slot, row.dataset.id);
    G[flag] = e.target.checked ? id : (G[flag] === id ? "" : G[flag]); // มีได้หนึ่งโซนรวมทุกกล้อง
    persistSettings(); renderZoneEditor(); drawAll(); renderDash();
  });
  $("#zoneList").addEventListener("click", e => {
    if (!e.target.matches("[data-del]")) return;
    const c = editCam(); if (!c) return;
    const zid = e.target.closest(".zrow").dataset.id, id = nsZone(c.slot, zid), s = camSet(c);
    s.zones = s.zones.filter(z => z.id !== zid);
    const p = pipes.get(c.slot); if (p) delete p.zoneLive[id];
    for (const k of ["queueZone", "cashierZone"]) if (G[k] === id) G[k] = "";
    persistCam(c); persistSettings(); renderZoneEditor(); draw(c); renderDash();
  });

  // ---- แดชบอร์ด ----
  /* ตัวเลขที่แสดง: เครื่องนี้ หรือรวมทุกเครื่อง (เมื่อเป็นเครื่องหลักและเลือก "รวมทุกเครื่อง") */
  function viewDay() {
    const M = agg && agg.merged ? agg.merged() : null;
    $("#kpiScope").hidden = !M;
    document.querySelectorAll("#kpiScope [data-scope]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.scope === (G.kpiScope === "local" ? "local" : "all"))));
    if (!M || G.kpiScope === "local") return { all: false, d: day, n: M ? M.rows.length : 1 };
    const d = { ...day, in: M.in, out: M.out, occ: M.occ, peak: M.peak, peakAt: M.peak > day.peak ? 0 : day.peakAt, maxQueue: M.maxQueue, hourly: { in: M.hourlyIn, out: M.hourlyOut } };
    return { all: true, d, n: M.rows.length };
  }
  function renderDash() {
    const V = viewDay(), D = V.d, now = Date.now(), hNow = new Date(now).getHours();
    const qd = G.queueZone ? zoneDef(G.queueZone) : null, cd = G.cashierZone ? zoneDef(G.cashierZone) : null;
    const qi = qd ? queueInfo(zoneCount(G.queueZone), G.serviceSec) : null;
    let qw = { n: 0, maxWaitMs: 0 };
    pipes.forEach(p => { const w = queueWait(p.zoneLive[G.queueZone], now); if (w.maxWaitMs > qw.maxWaitMs) qw = w; });
    const conv = conversion(day, cd ? G.cashierZone : null);
    const off = Math.max(0, +G.staffOffset || 0), occ = Math.max(0, D.occ - off);
    const occAlert = occ >= G.maxOcc, occNear = !occAlert && G.maxOcc >= 5 && occ >= Math.ceil(G.maxOcc * 0.9);
    const qAlert = qi && qi.length >= G.queueAlert, slaAlert = qi && G.queueSlaSec > 0 && qw.maxWaitMs > G.queueSlaSec * 1000;
    const tile = (k, v, s = "", cls = "") => `<div class="tile ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    const scopeTxt = V.all ? ` (รวม ${V.n} เครื่อง)` : "";
    const hIn = D.hourly.in[hNow] || 0;
    $("#tiles").innerHTML =
      tile("เข้าวันนี้" + scopeTxt, D.in, "คน", "in") + tile("ออกวันนี้" + scopeTxt, D.out, "คน", "out") +
      tile("คนในร้านตอนนี้", occ, `${off ? `ไม่นับพนักงาน ${off} คน · ` : ""}สูงสุดที่ตั้งไว้ ${G.maxOcc} คน`, occAlert ? "hot" : occNear ? "warm" : "") +
      tile("สูงสุดวันนี้", D.peak, D.peakAt ? "เวลา " + fmtClock(D.peakAt) : V.all ? "ประมาณจากรายชั่วโมง" : "") +
      tile("คิวตอนนี้", qi ? `${qi.length} คน` : "—", qi ? `รอประมาณ ${fmtDur(qi.waitSec)}${qw.n ? ` · รอนานสุด ${fmtDur(qw.maxWaitMs / 1000)}` : ""}` : "ยังไม่กำหนดโซนคิว", qAlert || slaAlert ? "hot" : "") +
      tile("อัตราการซื้อโดยประมาณ", conv == null ? "—" : (conv * 100).toFixed(0) + "%", cd ? `เข้าโซน${esc(cd.z.name)} / คนเข้าร้าน${V.all ? " (เครื่องนี้)" : ""}` : "ยังไม่กำหนดโซนแคชเชียร์") +
      (G.hourlyTarget > 0 ? tile("ชั่วโมงนี้ / เป้า", `${hIn} / ${G.hourlyTarget}`, hIn >= G.hourlyTarget ? "ถึงเป้าแล้ว" : `อีก ${G.hourlyTarget - hIn} คน`, hIn >= G.hourlyTarget ? "in" : "") : "");
    const bc = Object.keys(day.byCam || {}).sort().map(s => day.byCam[s]).filter(b => b.in || b.out);
    $("#byCam").innerHTML = bc.length > 1 || cfgList().length > 1 ? bc.map(b => `<span class="pill">${esc(b.name)}: เข้า ${b.in} · ออก ${b.out}</span>`).join("") : "";
    const al = [];
    if (occAlert) al.push(["", `คนในร้านถึง ${occ} คน (เกินหรือเท่ากับที่กำหนด ${G.maxOcc} คน)${off ? ` · หักพนักงาน ${off} คนแล้ว` : ""}`]);
    else if (occNear) al.push(["warn", `คนในร้าน ${occ} คน ใกล้ถึงที่กำหนด ${G.maxOcc} คน`]);
    if (qAlert) al.push(["", `คิวยาว ${qi.length} คน รอประมาณ ${fmtDur(qi.waitSec)} — ควรเปิดจุดชำระเงินเพิ่ม`]);
    if (slaAlert) al.push(["", `ลูกค้ารอคิวนาน ${fmtDur(qw.maxWaitMs / 1000)} เกินเป้า ${fmtDur(G.queueSlaSec)}`]);
    $("#alerts").innerHTML = al.map(([cls, a]) => `<div class="alert ${cls}">${esc(a)}</div>`).join("");
    $("#sumScope").textContent = V.all ? `รวม ${V.n} เครื่อง` : "";
    $("#summary").innerHTML = daySummary(D, { cashierId: V.all ? null : (cd ? G.cashierZone : null), hourlyTarget: G.hourlyTarget, slaSec: V.all ? 0 : G.queueSlaSec, staffOffset: off, nowHour: D.date === dayKey(now) ? hNow : 23, clock: fmtClock })
      .map(t => `<li>${esc(t)}</li>`).join("");
    renderReidInfo();
    const many = cfgList().length > 1;
    const rows = cfgList().flatMap(c => camSet(c).zones.map(z => ({ c, z, id: nsZone(c.slot, z.id) })));
    $("#zoneTable").innerHTML = `<thead><tr><th>โซน</th><th class="n">อยู่ตอนนี้</th><th class="n">เข้าวันนี้ (ครั้ง)</th><th class="n">เวลาอยู่เฉลี่ย</th></tr></thead><tbody>` +
      (rows.length ? rows.map(({ c, z, id }) => { const zs = day.zones[id]; return `<tr><td>${many ? esc(c.name) + " · " : ""}${esc(z.name)}${id === G.queueZone ? " <span class=\"tag q\">คิว</span>" : ""}${id === G.cashierZone ? " <span class=\"tag c\">แคชเชียร์</span>" : ""}</td><td class="n">${zoneCount(id)}</td><td class="n">${zs?.visits || 0}</td><td class="n">${zs?.dwellN ? fmtDur(avgDwellSec(zs)) : "—"}</td></tr>`; }).join("")
        : `<tr><td colspan="4" class="empty">ยังไม่มีโซน</td></tr>`) + "</tbody>";
    drawHourly(D); drawHeatPreview();
    if (agg) agg.render();
  }
  document.querySelectorAll("#kpiScope [data-scope]").forEach(b => b.addEventListener("click", () => { G.kpiScope = b.dataset.scope; persistSettings(); renderDash(); }));

  let hourlyDay = day;
  const escHtml = x => String(x).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  /** ใต้กราฟรายชั่วโมง: แต่ละชั่วโมงที่ถูกทำเครื่องหมายเป็นข้อความแยก (แปลได้ทีละวลี) */
  const fmtQualityNote = list => "ชั่วโมงที่ภาพจากกล้องมีปัญหา (แถบสีเทา ยอดอาจคลาดเคลื่อน): " + list.map(([h, t]) => `${String(h).padStart(2, "0")}:00 ${t}`).join(" · ");
  function drawHourly(D = hourlyDay) {
    const day = hourlyDay = D;
    const c = $("#hourly"), dpr = devicePixelRatio || 1, W = c.clientWidth || 500, Hh = 220;
    c.width = W * dpr; c.height = Hh * dpr; c.style.height = Hh + "px";
    const ctx = c.getContext("2d"); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, Hh);
    const act = []; for (let h = 0; h < 24; h++) if (day.hourly.in[h] || day.hourly.out[h]) act.push(h);
    const h0 = Math.min(8, ...act), h1 = Math.max(20, ...act), n = h1 - h0 + 1;
    let max = Math.max(1, G.hourlyTarget || 0); for (let h = h0; h <= h1; h++) max = Math.max(max, day.hourly.in[h], day.hourly.out[h]);
    const step = max <= 5 ? 1 : Math.ceil(max / 4 / 5) * 5, top = Math.ceil(max / step) * step;
    const L = 34, R = 8, T = 12, B = 26, pw = W - L - R, ph = Hh - T - B;
    ctx.font = "11px Prompt, sans-serif"; ctx.textBaseline = "middle"; ctx.textAlign = "right";
    for (let v = 0; v <= top; v += step) {
      const y = T + ph - v / top * ph;
      ctx.strokeStyle = v ? "#e6edf1" : "#9fb1bc"; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke();
      ctx.fillStyle = "#52514e"; ctx.fillText(v, L - 6, y);
    }
    const gw = pw / n, bw = Math.max(2, Math.min(14, gw * 0.36));
    // ชั่วโมงที่ภาพจากกล้องมีปัญหา ≥ 5 นาที (day.quality): พื้นหลังสีเทาลาย — ยอดยังอยู่ครบ แต่อาจคลาดเคลื่อน
    const flagged = new Set();
    for (let h = h0; h <= h1; h++) if (hourQuality(day, h)) {
      flagged.add(h);
      ctx.fillStyle = "rgba(120,130,140,.16)"; ctx.fillRect(L + (h - h0) * gw + 1, T, gw - 2, ph);
    }
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let h = h0; h <= h1; h++) {
      const gx = L + (h - h0) * gw + gw / 2;
      ctx.globalAlpha = flagged.has(h) ? 0.45 : 1;
      [["in", "#2a78d6", -1], ["out", "#eb6834", 1]].forEach(([k, col, side]) => {
        const v = day.hourly[k][h], bh = v / top * ph;
        if (!v) return;
        ctx.fillStyle = col; ctx.fillRect(gx + (side < 0 ? -bw - 1 : 1), T + ph - bh, bw, bh);
      });
      ctx.globalAlpha = 1;
      if (n <= 14 || (h - h0) % 2 === 0) { ctx.fillStyle = flagged.has(h) ? "#8a5a00" : "#52514e"; ctx.fillText(String(h).padStart(2, "0") + (flagged.has(h) ? "!" : ""), gx, T + ph + 6); }
    }
    const qn = $("#hourlyQuality");
    if (qn) { qn.hidden = !flagged.size; qn.textContent = flagged.size ? fmtQualityNote([...flagged].map(h => { const cs = qualityCams(day, h); return [h, hourQuality(day, h) + (cs.length ? ` (${cs.join(", ")})` : "")]; })) : ""; }
    if (G.hourlyTarget > 0) {
      const y = T + ph - G.hourlyTarget / top * ph;
      ctx.save(); ctx.strokeStyle = "#1a7f4b"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke(); ctx.restore();
      ctx.fillStyle = "#1a7f4b"; ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(`เป้า ${G.hourlyTarget}`, W - R, y - 2);
    }
    c.setAttribute("aria-label", "กราฟคนเข้าออกรายชั่วโมง: " + (act.map(h => `${h}:00 เข้า ${day.hourly.in[h]} ออก ${day.hourly.out[h]}`).join(", ") || "ยังไม่มีข้อมูล"));
  }
  $("#hourly").addEventListener("pointermove", e => {
    const c = $("#hourly"), r = c.getBoundingClientRect(), tip = $("#tooltip");
    const day = hourlyDay;
    const act = []; for (let h = 0; h < 24; h++) if (day.hourly.in[h] || day.hourly.out[h]) act.push(h);
    const h0 = Math.min(8, ...act), h1 = Math.max(20, ...act), n = h1 - h0 + 1;
    const i = Math.floor((e.clientX - r.left - 34) / ((r.width - 42) / n));
    if (i < 0 || i >= n) { tip.hidden = true; return; }
    const h = h0 + i;
    const qh = hourQuality(day, h);
    tip.innerHTML = `<b>${String(h).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:59</b><br>เข้า ${day.hourly.in[h]} · ออก ${day.hourly.out[h]}` + (qh ? `<br><span class="q-flag">ภาพมีปัญหา: ${escHtml(qh)}</span>` : "");
    tip.hidden = false; tip.style.left = e.clientX + 14 + "px"; tip.style.top = e.clientY + 14 + "px";
  });
  $("#hourly").addEventListener("pointerleave", () => { $("#tooltip").hidden = true; });

  // ---- ฮีตแมป (ต่อกล้อง พื้นหลังเรียบ ไม่มีภาพคน) ----
  function renderHeatImage(cv, c, w, h, withLegend) {
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"), k = w / 640;
    ctx.fillStyle = "#eef2f5"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#dde5ea"; ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += w / 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += h / 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    if (!c) return;
    paintHeat(ctx, heatOf(c.slot), w, h);
    paintZones(ctx, c, w, h, k, null);
    const s = camSet(c); if (s.line) paintLine(ctx, s.line, s.swap, w, h, k);
    if (withLegend) {
      ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.fillRect(10 * k, h - 40 * k, 330 * k, 30 * k);
      for (let i = 0; i < 100; i++) { const [r, g, b] = heatColor(i / 99); ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(16 * k + i * k, h - 30 * k, k + 1, 10 * k); }
      ctx.fillStyle = "#16303f"; ctx.font = `${11 * k}px Prompt, sans-serif`; ctx.textBaseline = "middle";
      ctx.fillText(`น้อย → มาก · ฮีตแมป ${c.name} ${day.date}`, 122 * k, h - 25 * k);
    }
  }
  const heatCam = () => selCam() || cfgList().find(c => c.slot === sel) || cfgList()[0] || null;
  const heatSize = c => { const v = c && c.video; const ar = v && v.videoWidth ? v.videoWidth / v.videoHeight : 4 / 3; return [1280, Math.round(1280 / ar)]; };
  function drawHeatPreview() {
    const c = heatCam(), [w, h] = heatSize(c);
    $("#heatCam").textContent = c && cfgList().length > 1 ? `กล้อง: ${c.name}` : "";
    renderHeatImage($("#heatPreview"), c, w / 2, h / 2, false);
  }
  $("#heatOn").checked = !!G.heatOn;
  $("#heatOn").addEventListener("change", e => { G.heatOn = e.target.checked; persistSettings(); drawAll(); });
  $("#heatReset").addEventListener("click", () => { const c = heatCam(); if (!c) return; heatOf(c.slot).data.fill(0); persistHeat(); drawAll(); drawHeatPreview(); });
  $("#heatPng").addEventListener("click", () => {
    const c = heatCam(), cv = document.createElement("canvas"), [w, h] = heatSize(c);
    renderHeatImage(cv, c, w, h, true);
    cv.toBlob(b => download(b, `heatmap-${c ? c.slot + "-" : ""}${day.date}.png`), "image/png");
  });
  function download(blob, name) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- ปุ่มต่าง ๆ / ตั้งค่า ----
  $("#startCam").addEventListener("click", startCamera);
  $("#addCam").addEventListener("click", addCamera);
  $("#file").addEventListener("change", e => { const f = e.target.files[0]; if (f) startFile(f); e.target.value = ""; });
  $("#stop").addEventListener("click", () => { stopSource(); engine("หยุดวิเคราะห์แล้ว ข้อมูลสรุปถูกบันทึกไว้"); });
  $("#swap").addEventListener("click", () => {
    const c = selCam(); if (!c) { $("#drawMsg").textContent = "เปิดกล้องก่อน"; return; }
    const s = camSet(c); s.swap = !s.swap; persistCam(c); draw(c); drawHeatPreview(); $("#drawMsg").textContent = `สลับทิศเข้า/ออกของ "${c.name}" แล้ว`;
  });
  $("#clearLine").addEventListener("click", () => {
    const c = selCam(); if (!c) return;
    camSet(c).line = null; if (pipes.get(c.slot)) pipes.get(c.slot).lineMem = {}; persistCam(c); draw(c); drawHeatPreview();
  });
  $("#clearStaff").addEventListener("click", () => {
    const c = selCam(); if (!c) return;
    camSet(c).staffZone = null; persistCam(c); draw(c); $("#drawMsg").textContent = `ลบโซนพนักงานของ "${c.name}" แล้ว`;
  });
  $("#resetOcc").addEventListener("click", () => { day.occ = 0; persistDay(); renderDash(); });
  const sf = $("#settingsForm");
  const af = $("#accForm");
  function syncForm() {
    ["maxOcc", "serviceSec", "queueAlert", "queueSlaSec", "hourlyTarget"].forEach(k => { sf[k].value = G[k]; });
    const c = selCam(); sf.tiles.value = c ? camSet(c).tiles || "" : "";
    af.reid.checked = !!G.reid; ["reidWindowSec", "staffMin", "staffOffset"].forEach(k => { af[k].value = G[k]; });
  }
  const ZERO_OK = new Set(["queueSlaSec", "hourlyTarget", "staffOffset"]);
  function numInput(e, msgEl) {
    const n = e.target.name, raw = +e.target.value, v = n === "staffMin" ? Math.round(raw * 100) / 100 : Math.round(raw);
    const ok = e.target.value !== "" && Number.isFinite(raw) && (ZERO_OK.has(n) ? v >= 0 : v > 0);
    if (!ok) { msgEl.textContent = ZERO_OK.has(n) ? "กรุณาใส่ตัวเลข 0 ขึ้นไป" : "กรุณาใส่ตัวเลขมากกว่า 0"; msgEl.className = "form-msg err"; return false; }
    G[n] = v; persistSettings(); renderDash();
    msgEl.textContent = "บันทึกแล้ว"; msgEl.className = "form-msg ok"; return true;
  }
  sf.addEventListener("input", e => {
    const n = e.target.name;
    if (n === "tiles") { const c = selCam(); if (c) { camSet(c).tiles = /^\dx\d$/.test(e.target.value) ? e.target.value : ""; persistCam(c); } $("#setMsg").textContent = "บันทึกแล้ว"; $("#setMsg").className = "form-msg ok"; }
    else numInput(e, $("#setMsg"));
  });
  sf.addEventListener("submit", e => e.preventDefault());
  af.addEventListener("input", e => {
    if (e.target.name !== "reid") { numInput(e, $("#accMsg")); return; }
    G.reid = e.target.checked; persistSettings();
    if (!G.reid) pipes.forEach(p => { p.reid = null; }); // ลบค่าลักษณะภาพทันที
    else if (running) loadReid();
    $("#accMsg").textContent = G.reid ? "เปิดลดการนับซ้ำแล้ว" : "ปิดลดการนับซ้ำแล้ว (ลบค่าลักษณะภาพในหน่วยความจำแล้ว)"; $("#accMsg").className = "form-msg ok";
    renderReidInfo();
  });
  af.addEventListener("submit", e => e.preventDefault());

  const allDays = () => Object.keys(localStorage).filter(k => /^st-day-\d{4}-\d{2}-\d{2}$/.test(k)).sort()
    .map(k => k === P + "day-" + day.date ? day : ensureDay(Object.assign(newDay(k.slice(P.length + 4)), load(k.slice(P.length), {}))));
  $("#exportCsv").addEventListener("click", () => {
    persistDay();
    download(new Blob([buildCsv(allDays(), G.cashierZone)], { type: "text/csv;charset=utf-8" }), `store-analytics-${day.date}.csv`);
  });
  $("#exportHourly").addEventListener("click", () => {
    persistDay();
    download(new Blob([buildHourlyCsv(allDays(), G.hourlyTarget)], { type: "text/csv;charset=utf-8" }), `store-hourly-${day.date}.csv`);
  });
  $("#clearData").addEventListener("click", () => {
    if (!confirm("ลบสถิติทุกวัน ฮีตแมป และยอดจากเครื่องอื่นที่เก็บไว้ทั้งหมด? (การตั้งค่ากล้อง เส้น โซน และการจับคู่ยังอยู่)")) return;
    Object.keys(localStorage).filter(k => k.startsWith(P + "day-") || k.startsWith(P + "agg-") || k === P + "heat" || k.startsWith(P + "heat-")).forEach(k => localStorage.removeItem(k));
    day = newDay(); heats.forEach(h => h.data.fill(0)); pipes.forEach(p => { p.zoneLive = {}; p.reid = null; p.staff = null; });
    renderDash(); drawAll(); engine("ลบข้อมูลสถิติแล้ว", "ok");
  });
  $("#printNotice").addEventListener("click", () => {
    const w = window.open("", "_blank", "width=700,height=500");
    if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>ป้ายแจ้งความเป็นส่วนตัว</title><body style="font-family:Prompt,sans-serif;padding:40px;font-size:22px;line-height:1.7"><h2>ประกาศความเป็นส่วนตัว (PDPA)</h2><p>${esc($("#notice").textContent)}</p></body>`);
    w.document.close(); w.focus(); w.print();
  });

  // อัตราประมวลผลต่อกล้อง + จำนวนคนที่เห็น
  setInterval(() => {
    const st = sched.stats();
    let ppl = 0;
    for (const c of srcCams()) {
      const hz = running && st[c.slot] ? st[c.slot].hz : 0;
      if (c.tile) c.tile.querySelector(".st-hz").textContent = running ? `${hz} Hz` : "—";
      ppl += (pipes.get(c.slot)?.lastSeen.length) || 0;
    }
    if (running) $("#fps").textContent = `${ppl} คน`;
  }, 1000);

  let rsT = 0; const onResize = () => { clearTimeout(rsT); rsT = setTimeout(() => { srcCams().forEach(c => sizeOverlay(c)); renderDash(); }, 120); };
  window.addEventListener("resize", onResize); window.addEventListener("orientationchange", onResize);
  window.addEventListener("beforeunload", () => { pipes.forEach(p => closeZones(p.zoneLive, day)); persistDay(); persistHeat(); });
  setInterval(() => { if (!running && dayKey() !== day.date) { day = newDay(); pipes.forEach(p => { p.reid = null; p.staff = null; }); renderDash(); } }, 60000);

  // ---- เชื่อมหลายเครื่อง ("1 เครื่องต่อ 1 จุด") — ส่ง/รับเฉพาะตัวเลขสรุปรายวัน (lensiq-agg.js) ----
  // ค่าตั้ง (มี token/รหัสจับคู่) อยู่ใน lq-agg ไม่ใช่ st- จึงไม่ถูกรวมในไฟล์สำรองของหน้าแดชบอร์ดรวม
  // ยอดจากเครื่องอื่นแคชไว้ที่ st-agg-YYYY-MM-DD (ตัวเลขล้วน) ให้หน้า insights อ่านได้
  agg = (() => {
    const A = window.LQAgg, CFG_KEY = "lq-agg", PUSH_MS = 15000, POLL_MS = 5000, ONLINE_MS = 60000;
    const staticHost = /\.github\.io$/i.test(location.hostname) || location.protocol === "file:";
    let cfg = {};
    try { const v = JSON.parse(localStorage.getItem(CFG_KEY)); if (v && typeof v === "object") cfg = v; } catch { /* ignore */ }
    cfg = Object.assign({ role: "", hub: "", name: "", code: "", node: "", token: "", pending: {}, lastOk: 0 }, cfg);
    if (!cfg.pending || typeof cfg.pending !== "object") cfg.pending = {};
    const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ } };
    let server = null, pair = null, devices = [], skew = 0, backoff = 0, nextTry = 0, busy = false, pollT = 0, offline = false;
    const hubBase = () => { try { return new URL(cfg.hub || location.origin).origin; } catch { return location.origin; } };
    const fmtCode = c => (A.normCode(c).match(/.{1,4}/g) || []).join("-");
    function msg(t, cls = "") { const m = $("#aggMsg"); m.hidden = !t; m.textContent = t || ""; m.className = "engine agg-msg " + cls; }
    async function api(path, { method = "GET", token = "", body, keepalive = false, base = location.origin } = {}) {
      const headers = {};
      if (token) headers.Authorization = "Bearer " + token;
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), keepalive, cache: "no-store", credentials: "omit" });
      let j = null; try { j = await r.json(); } catch { /* not json */ }
      return { ok: r.ok, status: r.status, j: j || {} };
    }
    async function probe(base) {
      if (staticHost && base === location.origin) return false;
      try { const r = await api("/api/agg/status", { base }); return r.ok && r.j.ok ? r.j : false; } catch { return false; }
    }
    function noServer() {
      msg(staticHost
        ? "หน้านี้เปิดจากเว็บสาธิต (GitHub Pages) ซึ่งไม่มีเซิร์ฟเวอร์กลาง การรวมยอดอัตโนมัติใช้ได้เมื่อเปิดหน้านี้จากคอมพิวเตอร์ในร้านที่รัน ./start.sh mobile (ดูวิธีในหน้า ระบบทั้งหมด) — ระหว่างนี้ใช้ \"ส่งต่อด้วยไฟล์\" ด้านล่าง"
        : "ไม่พบเซิร์ฟเวอร์ LENSIQ ที่ที่อยู่นี้ (เช่น เปิดด้วยเว็บเซิร์ฟเวอร์ธรรมดา) ให้รัน ./start.sh mobile บนคอมพิวเตอร์เครื่องหลัก หรือใช้ \"ส่งต่อด้วยไฟล์\" ด้านล่าง", "warn");
      $("#aggManual").open = true;
    }
    const cacheOf = date => load("agg-" + date, null);
    const packsOf = date => A.cachePacks(cacheOf(date), date);

    // ---------- เครื่องหลัก ----------
    const ago = t => { const s = Math.max(0, Math.round((Date.now() + skew - t) / 1000)); return s < 60 ? "เมื่อสักครู่" : s < 3600 ? `${Math.floor(s / 60)} นาทีที่แล้ว` : fmtClock(t - skew); };
    function render() {
      if (cfg.role !== "hub") return;
      const packs = packsOf(day.date), M = A.mergeDay(day, packs);
      const tile = (k, v, s = "", cls = "") => `<div class="tile ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
      const setHtml = (el, h) => { if (el._h !== h) { el._h = h; el.innerHTML = h; } }; // ไม่สร้างปุ่มใหม่ถ้าไม่มีอะไรเปลี่ยน
      setHtml($("#aggTiles"), tile("เข้ารวม", M.in, `${M.rows.length} เครื่อง`, "in") + tile("ออกรวม", M.out, "คน", "out") +
        tile("คนในร้านรวม", M.occ, "ประมาณ") + tile("สูงสุดรวม", M.peak, "ประมาณ") + tile("คิวสูงสุด", M.maxQueue, "คน"));
      const st = r => r.local ? "" : r.src === "import" ? `<span class="st-imp">นำเข้าไฟล์</span>` : (Date.now() + skew - r.t) < ONLINE_MS ? `<span class="st-on">ออนไลน์</span>` : `<span class="st-off">ขาดการติดต่อ</span>`;
      const rows = M.rows.map(r => `<tr><td>${esc(r.name)}${r.local ? " (เครื่องหลัก)" : ""}</td><td>${st(r)}</td><td class="n">${r.in}</td><td class="n">${r.out}</td><td class="n">${r.peak}</td><td>${r.local ? "ตอนนี้" : r.t ? esc(ago(r.t)) : "—"}</td><td>${r.local ? "" : `<button class="btn ghost small rm" type="button" data-rm="${esc(r.id)}" data-src="${esc(r.src)}" aria-label="ลบ ${esc(r.name)}">ลบ</button>`}</td></tr>`);
      const paired = devices.filter(d => !packs.some(p => p.node === d.node)).map(d => `<tr><td>${esc(d.name)}</td><td><span class="st-off">ยังไม่ส่งข้อมูลวันนี้</span></td><td class="n">0</td><td class="n">0</td><td class="n">0</td><td>${d.seen ? esc(ago(d.seen)) : "—"}</td><td><button class="btn ghost small rm" type="button" data-rm="${esc(d.node)}" data-src="hub" aria-label="ลบ ${esc(d.name)}">ลบ</button></td></tr>`);
      setHtml($("#aggTable"), `<thead><tr><th>เครื่อง</th><th>สถานะ</th><th class="n">เข้า</th><th class="n">ออก</th><th class="n">สูงสุด</th><th>อัปเดต</th><th></th></tr></thead><tbody>` +
        (rows.length + paired.length ? rows.join("") + paired.join("") + `<tr class="total"><td>รวม</td><td></td><td class="n">${M.in}</td><td class="n">${M.out}</td><td class="n">${M.peak}</td><td></td><td></td></tr>`
          : `<tr><td colspan="7" class="empty">ยังไม่มีเครื่องลูก — จับคู่มือถือด้วยรหัสด้านบน</td></tr>`) + "</tbody>");
      $("#aggState").textContent = `เครื่องหลัก · ${packs.length} เครื่องลูก`;
    }
    function mergeServer(j, dates) {
      for (const date of dates) {
        const c = A.cacheFromServer(cacheOf(date), j.dates && j.dates[date]);
        if (c) save("agg-" + date, c); else try { localStorage.removeItem(P + "agg-" + date); } catch { /* ignore */ }
      }
      devices = Array.isArray(j.devices) ? j.devices.filter(d => d && A.NODE_RE.test(d.node)).map(d => ({ node: d.node, name: String(d.name || d.node).slice(0, 40), seen: +d.seen || 0 })) : [];
      if (+j.now) skew = +j.now - Date.now();
    }
    async function poll() {
      clearTimeout(pollT);
      if (cfg.role !== "hub") return;
      if (server && cfg.code) {
        try {
          const r = await api(`/api/agg?date=${day.date}`, { token: A.normCode(cfg.code) });
          if (r.status === 401) { msg("รหัสจับคู่ไม่ถูกต้องหรือถูกเปลี่ยนแล้ว", "err"); if (!server.local) { cfg.code = ""; saveCfg(); hubUi(); } }
          else if (!r.ok) msg(r.j.error || `เซิร์ฟเวอร์ตอบกลับ ${r.status}`, "warn");
          else { mergeServer(r.j, [day.date]); if (offline) { offline = false; msg(""); } }
        } catch { offline = true; msg("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กำลังลองใหม่...", "warn"); }
      }
      renderDash(); // การ์ดภาพรวมใช้ยอดรวมด้วย (renderDash เรียก render ของแผงนี้)
      if (cfg.role === "hub" && server) pollT = setTimeout(poll, POLL_MS);
    }
    function hubUi() {
      const local = !!(server && server.local);
      $("#aggCodeBox").hidden = !(local && pair);
      $("#aggViewForm").hidden = !server || local || !!cfg.code;
      if (pair) {
        $("#aggCode").textContent = pair.code;
        const base = (pair.urls && pair.urls[0]) || (local && /^(localhost|127\.|\[::1\])/.test(location.host) ? "" : location.origin);
        $("#aggLink").textContent = base ? `บนมือถือแต่ละเครื่อง เปิด ${base}/store.html แล้วเลือก "เครื่องลูก" ใส่รหัสนี้ หรือเปิดลิงก์จับคู่` :
          "เซิร์ฟเวอร์เปิดให้เฉพาะเครื่องนี้ (./start.sh) — ให้รัน ./start.sh mobile เพื่อให้มือถือในวง Wi‑Fi เดียวกันเชื่อมได้ แล้วเปิด https://<IP เครื่องนี้>:8443/store.html บนมือถือ";
        $("#aggCopyLink").hidden = !base;
        $("#aggCopyLink").dataset.link = base ? `${base}/store.html#lq-pair=${A.normCode(pair.code)}` : "";
      } else $("#aggLink").textContent = "";
    }
    async function startHub() {
      server = await probe(location.origin);
      if (cfg.role !== "hub") return;
      if (!server) { noServer(); hubUi(); renderDash(); return; }
      msg("");
      if (server.local) {
        try { const r = await api("/api/agg/pair"); if (r.ok) { pair = r.j; cfg.code = r.j.code; saveCfg(); } } catch { /* ignore */ }
      }
      hubUi(); poll();
    }

    // ---------- เครื่องลูก ----------
    function nodeUi() {
      const f = $("#aggJoinForm"), paired = !!cfg.token;
      f.nodeName.value = f.nodeName.value || cfg.name || ""; f.hub.value = f.hub.value || cfg.hub || location.origin;
      f.code.closest("label").hidden = paired; f.hub.closest("label").hidden = paired;
      $("#aggJoin").hidden = paired; $("#aggUnpair").hidden = !paired; f.nodeName.readOnly = paired;
      const n = Object.keys(cfg.pending).length;
      $("#aggNodeInfo").textContent = paired
        ? `จับคู่กับ ${hubBase()} แล้ว · ส่งทุก ${PUSH_MS / 1000} วินาทีระหว่างวิเคราะห์${cfg.lastOk ? " · ส่งล่าสุด " + fmtClock(cfg.lastOk) : ""}${n ? ` · รอส่ง ${n} วัน${offline ? " (ออฟไลน์ จะส่งให้เองเมื่อเชื่อมต่อได้)" : ""}` : ""}`
        : "ใส่ชื่อเครื่องและรหัสจับคู่ที่แสดงบนเครื่องหลัก แล้วกด จับคู่";
      if (cfg.role === "node") $("#aggState").textContent = paired ? (offline ? "เครื่องลูก · ออฟไลน์" : "เครื่องลูก · เชื่อมแล้ว") : "เครื่องลูก · ยังไม่จับคู่";
    }
    const packNow = () => A.packFromDay(day, cfg.name || "เครื่องไม่มีชื่อ", cfg.node);
    function queue() {
      const p = packNow(); cfg.pending[p.date] = p;
      const ds = Object.keys(cfg.pending).sort(); ds.slice(0, Math.max(0, ds.length - 7)).forEach(d => delete cfg.pending[d]);
      saveCfg();
    }
    const failed = () => { offline = true; backoff = Math.min(120000, backoff ? backoff * 2 : 5000); nextTry = Date.now() + backoff; };
    async function flush(force = false) {
      if (cfg.role !== "node" || !cfg.token || busy || (!force && Date.now() < nextTry)) return;
      busy = true;
      try {
        for (const date of Object.keys(cfg.pending).sort()) {
          const p = cfg.pending[date];
          let r;
          try { r = await api("/api/agg", { method: "POST", token: cfg.token, body: p, base: hubBase() }); } catch { failed(); return; }
          if (r.ok) { if (cfg.pending[date] === p) delete cfg.pending[date]; cfg.lastOk = Date.now(); offline = false; backoff = 0; nextTry = 0; if ($("#aggMsg").classList.contains("warn")) msg(""); continue; }
          if (r.status === 401) { cfg.token = ""; msg("เครื่องหลักยกเลิกการจับคู่เครื่องนี้แล้ว กรุณาจับคู่ใหม่", "err"); return; }
          if (r.status === 400 || r.status === 413) { delete cfg.pending[date]; msg("เครื่องหลักไม่รับข้อมูลวันที่ " + date + ": " + (r.j.error || r.status), "warn"); continue; }
          failed(); if (r.j.error) msg(r.j.error, "warn"); return; // 429 / 5xx -> ลองใหม่ภายหลัง
        }
      } finally { busy = false; saveCfg(); nodeUi(); }
    }
    async function pushNow() { if (cfg.role !== "node" || !cfg.token) return; queue(); await flush(true); }
    async function join(e) {
      e.preventDefault();
      const f = $("#aggJoinForm"), name = f.nodeName.value.replace(/\s+/g, " ").trim().slice(0, 40), code = A.normCode(f.code.value);
      let hub = f.hub.value.trim() || location.origin;
      try { hub = new URL(hub).origin; } catch { return msg("ที่อยู่เครื่องหลักไม่ถูกต้อง (เช่น https://192.168.1.20:8443)", "err"); }
      if (!name) return msg("กรุณาตั้งชื่อเครื่องนี้ เช่น ประตูหน้า", "err");
      if (code.length < 8) return msg("กรุณาใส่รหัสจับคู่จากเครื่องหลัก", "err");
      if (location.protocol === "https:" && hub.startsWith("http:")) return msg("หน้านี้เปิดแบบ https จึงส่งไปยังเครื่องหลักแบบ http ไม่ได้ — ใช้ที่อยู่ https://", "err");
      msg("กำลังจับคู่...");
      const s = await probe(hub);
      if (!s) { if (hub === location.origin) return noServer(); return msg(`เชื่อมต่อ ${hub} ไม่ได้ ตรวจว่าอยู่ Wi‑Fi เดียวกัน เครื่องหลักรัน ./start.sh mobile และเปิดหน้านี้จากที่อยู่ของเครื่องหลัก`, "err"); }
      if (!A.NODE_RE.test(cfg.node || "")) cfg.node = A.newNodeId();
      try {
        const r = await api("/api/agg/join", { method: "POST", token: code, body: { name, node: cfg.node }, base: hub });
        if (!r.ok) return msg(r.status === 401 ? "รหัสจับคู่ไม่ถูกต้อง" : r.j.error || `จับคู่ไม่สำเร็จ (${r.status})`, "err");
        Object.assign(cfg, { hub: hub === location.origin ? "" : hub, name: r.j.name || name, node: r.j.node, token: r.j.token }); f.code.value = "";
        saveCfg(); msg(`จับคู่แล้ว — เครื่องนี้ "${cfg.name}" จะส่งเฉพาะตัวเลขสรุปไปยังเครื่องหลัก`, "ok");
        nodeUi(); await pushNow();
      } catch { msg("เชื่อมต่อเครื่องหลักไม่ได้", "err"); }
    }

    // ---------- ส่งต่อด้วยไฟล์ ----------
    function exportPack() {
      if (!A.NODE_RE.test(cfg.node || "")) { cfg.node = A.newNodeId(); saveCfg(); }
      pipes.forEach(p => closeZones(p.zoneLive, day)); persistDay();
      const name = cfg.name || $("#aggJoinForm").nodeName.value.trim() || `เครื่อง ${cfg.node.slice(-4)}`;
      return A.packFromDay(day, name, cfg.node);
    }
    function importText(text) {
      let obj; try { obj = JSON.parse(text); } catch { return { ok: false, error: "ไม่ใช่ไฟล์ JSON" }; }
      const r = A.cleanPack(obj);
      if (!r.ok) return r;
      if (!r.pack.node) return { ok: false, error: "ไฟล์ไม่มีรหัสเครื่อง" };
      if (r.pack.node === cfg.node) return { ok: false, error: "ไฟล์นี้ส่งออกจากเครื่องนี้เอง (จะนับซ้ำ)" };
      save("agg-" + r.pack.date, A.cacheUpsert(cacheOf(r.pack.date), r.pack, "import"));
      renderDash();
      return { ok: true, pack: r.pack };
    }

    // ---------- บทบาท ----------
    function setRole(role, { init = false } = {}) {
      if (!["", "hub", "node"].includes(role)) role = "";
      if (!init && cfg.role === "node" && role !== "node" && cfg.token && !confirm("เปลี่ยนบทบาท? เครื่องนี้จะหยุดส่งยอดให้เครื่องหลัก (การจับคู่ยังอยู่)")) return;
      cfg.role = role; saveCfg();
      document.querySelectorAll("#aggPanel [data-role]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.role === role)));
      $("#aggHub").hidden = role !== "hub"; $("#aggNode").hidden = role !== "node";
      clearTimeout(pollT); msg("");
      if (role === "") $("#aggState").textContent = "ใช้เครื่องเดียว";
      if (role === "hub") { $("#aggState").textContent = "เครื่องหลัก"; startHub(); }
      if (!init) renderDash();
      if (role === "node") {
        nodeUi();
        if (!cfg.token && hubBase() === location.origin) probe(location.origin).then(s => { if (!s && cfg.role === "node") noServer(); });
        else flush(true);
      }
    }
    document.querySelectorAll("#aggPanel [data-role]").forEach(b => b.addEventListener("click", () => setRole(b.dataset.role)));
    $("#aggJoinForm").addEventListener("submit", join);
    $("#aggUnpair").addEventListener("click", () => {
      if (!confirm("เลิกจับคู่เครื่องนี้? ข้อมูลที่ส่งไปแล้วยังอยู่ที่เครื่องหลัก")) return;
      cfg.token = ""; cfg.pending = {}; saveCfg(); nodeUi(); msg("เลิกจับคู่แล้ว");
    });
    $("#aggViewForm").addEventListener("submit", e => { e.preventDefault(); const c = A.normCode(e.target.code.value); if (c.length < 8) return msg("กรุณาใส่รหัสจับคู่", "err"); cfg.code = fmtCode(c); saveCfg(); hubUi(); poll(); });
    $("#aggRotate").addEventListener("click", async () => {
      if (!confirm("เปลี่ยนรหัสจับคู่? เครื่องที่จับคู่แล้วยังส่งได้ตามเดิม แต่รหัสเดิมจะใช้จับคู่เครื่องใหม่ไม่ได้")) return;
      try { const r = await api("/api/agg/pair/rotate", { method: "POST" }); if (r.ok) { pair = { ...pair, code: r.j.code }; cfg.code = r.j.code; saveCfg(); hubUi(); msg("เปลี่ยนรหัสแล้ว", "ok"); } else msg(r.j.error || "เปลี่ยนรหัสไม่สำเร็จ", "err"); } catch { msg("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", "err"); }
    });
    $("#aggCopyLink").addEventListener("click", async () => {
      const link = $("#aggCopyLink").dataset.link; if (!link) return;
      try { await navigator.clipboard.writeText(link); msg("คัดลอกลิงก์จับคู่แล้ว ส่งให้มือถือที่จะใช้เป็นจุดนับ (ลิงก์มีรหัสจับคู่ อย่าส่งให้คนนอก)", "ok"); }
      catch { $("#aggLink").textContent = link; }
    });
    $("#aggTable").addEventListener("click", async e => {
      const b = e.target.closest("button[data-rm]"); if (!b) return;
      const id = b.dataset.rm, name = b.closest("tr").firstElementChild.textContent;
      if (!confirm(`ลบ "${name}" ออกจากยอดรวม?${b.dataset.src === "hub" ? " เครื่องนั้นจะต้องจับคู่ใหม่" : ""}`)) return;
      if (b.dataset.src === "hub" && server) {
        try { const r = await api(`/api/agg/node/${encodeURIComponent(id)}`, { method: "DELETE", token: A.normCode(cfg.code) }); if (!r.ok) return msg(r.j.error || "ลบไม่สำเร็จ", "err"); } catch { return msg("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", "err"); }
      }
      Object.keys(localStorage).filter(k => k.startsWith(P + "agg-")).forEach(k => { const c = load(k.slice(P.length), null); if (c && c.nodes && c.nodes[id]) { delete c.nodes[id]; save(k.slice(P.length), c); } });
      devices = devices.filter(d => d.node !== id); renderDash(); poll();
    });
    $("#aggExport").addEventListener("click", () => {
      const p = exportPack();
      download(new Blob([JSON.stringify(p, null, 1)], { type: "application/json" }), `lensiq-agg-${p.date}-${p.node.slice(-6)}.json`);
      msg(`ส่งออกสรุปวันที่ ${p.date} แล้ว (ตัวเลขสรุปเท่านั้น) — นำไฟล์ไปกด "นำเข้าสรุปจากเครื่องอื่น" ที่เครื่องหลัก`, "ok");
    });
    $("#aggImport").addEventListener("change", async e => {
      const files = [...e.target.files]; e.target.value = "";
      const res = [];
      for (const f of files) { const r = f.size > A.LIM.bytes * 2 ? { ok: false, error: "ไฟล์ใหญ่เกินไป" } : importText(await f.text()); res.push(r.ok ? `✓ ${r.pack.name} (${r.pack.date})` : `✗ ${f.name}: ${r.error}`); }
      const ok = res.every(s => s.startsWith("✓"));
      msg((ok ? "นำเข้าแล้ว: " : "") + res.join(" · ") + (ok && cfg.role !== "hub" ? " — เลือก \"เครื่องหลัก\" เพื่อดูยอดรวม" : ""), ok ? "ok" : "err");
    });
    // ส่งยอดเป็นระยะระหว่างวิเคราะห์ และส่งค้างที่ยังไม่สำเร็จ
    setInterval(() => { if (cfg.role === "node" && cfg.token) { if (running) queue(); if (Object.keys(cfg.pending).length) flush(); } }, PUSH_MS);
    addEventListener("online", () => { nextTry = 0; flush(true); if (cfg.role === "hub") poll(); });
    // ปิด/สลับหน้า: ส่งยอดล่าสุดแบบ keepalive (sendBeacon ใส่ header Authorization ไม่ได้) และเก็บไว้ในคิวเผื่อส่งไม่ถึง
    addEventListener("pagehide", () => {
      if (cfg.role !== "node" || !cfg.token) return;
      try {
        queue();
        fetch(hubBase() + "/api/agg", { method: "POST", keepalive: true, cache: "no-store", credentials: "omit", headers: { Authorization: "Bearer " + cfg.token, "Content-Type": "application/json" }, body: JSON.stringify(cfg.pending[day.date]) }).catch(() => {});
      } catch { /* ignore */ }
    });
    $("#stop").addEventListener("click", () => { pushNow(); });

    // ลิงก์จับคู่ store.html#lq-pair=CODE -> บทบาทเครื่องลูก กรอกรหัสให้ (ลบออกจากแถบที่อยู่ทันที)
    const m = location.hash.match(/lq-pair=([A-Za-z0-9-]{8,24})/);
    if (m) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ }
      if (!cfg.token) { cfg.role = "node"; $("#aggJoinForm").code.value = fmtCode(m[1]); setTimeout(() => $("#aggPanel").scrollIntoView({ block: "start" }), 300); }
    }
    setRole(cfg.role, { init: true });
    /* ยอดรวมทุกเครื่อง (เฉพาะบทบาทเครื่องหลัก) สำหรับการ์ดภาพรวม */
    const merged = () => cfg.role === "hub" ? A.mergeDay(day, packsOf(day.date)) : null;
    return { render, merged, poll, flush, pushNow, exportPack, importText, setRole, get cfg() { return cfg; }, get server() { return server; } };
  })();

  // ---- สุขภาพภาพจากกล้อง + ตรวจความแม่นยำหน้างาน (lensiq-sitecheck.js) ----
  // สุขภาพภาพ: ทุก ~1 วินาทีต่อกล้อง วัดความสว่าง ย้อนแสง ความคม กล้องสั่น อัตราประมวลผล และขนาดคนในภาพ (ตัวเลขเท่านั้น ไม่เก็บภาพ)
  const SITE = /** @type {any} */ (window).LQSite || null;
  function healthStep(c, dets, now) {
    if (!SITE) return;
    const H = c._hl || (c._hl = { mon: SITE.createHealth({ kind: "store" }), at: 0, ph: [], cv: document.createElement("canvas"), state: null });
    for (const d of dets) if (d.score >= 0.5 && H.ph.length < 200) H.ph.push(d.h);
    if (now - H.at < 1000) return;
    const sec = LQCam.sampleSec ? LQCam.sampleSec(H.at, now) : 1; // round 12: วินาทีจริงระหว่างสองตัวอย่าง (ลูปที่ถูกหน่วงไม่นับเป็น 1 วินาที)
    H.at = now;
    let st = null; try { st = SITE.sampleElement(c.video, H.cv); } catch { /* ภาพจากแหล่งอื่น (cross-origin) อ่านไม่ได้ */ }
    const hz = c.intervalMsEma ? 1000 / c.intervalMsEma : null;
    const stalled = SITE.stallStep(c.video, st, now, { live: c !== fileCam });
    H.state = H.mon.push(st, { hz, personH: H.ph.length >= 2 ? SITE.median(H.ph) : null, stalled });
    H.ph = [];
    // เก็บวินาทีที่ภาพมีปัญหาไว้กับยอดรายชั่วโมงของวันนี้ (ตัวเลขเท่านั้น)
    SITE.noteQuality(day.quality || (day.quality = {}), Date.now(), H.state.codes, { sec });
    { const QC = day.qualityCam || (day.qualityCam = {}); SITE.noteQuality(QC[c.slot] || (QC[c.slot] = {}), Date.now(), H.state.codes, { sec }); }
    if (SC && SC.slot === c.slot) { H.state.codes.forEach(k => SC.health.add(k)); if (Number.isFinite(hz)) SC.hz.push(hz); }
    if (!c.tile) return;
    const pill = c.tile.querySelector(".st-health"), line = c.tile.querySelector(".cam-health");
    SITE.renderHealth(pill, H.state); pill.hidden = false;
    SITE.renderHealthLine(line, H.state);
  }

  // กล้องหลุด (track ended — LQCam เชื่อมต่อใหม่เอง): ทุก 1 วินาทีที่กล้องออฟไลน์นับเป็นเวลา offline ของชั่วโมงนั้น
  if (SITE) setInterval(() => {
    if (!running) return;
    for (const c of srcCams()) if (c !== fileCam && (c.offlineSince || c.status === "error")) {
      SITE.noteQuality(day.quality || (day.quality = {}), Date.now(), [], { offline: true });
      const QC = day.qualityCam || (day.qualityCam = {}); SITE.noteQuality(QC[c.slot] || (QC[c.slot] = {}), Date.now(), [], { offline: true });
    }
  }, 1000);

  // ตรวจความแม่นยำหน้างาน: คนกด "+ เข้า"/"+ ออก" ทุกครั้งที่มีคนข้ามเส้นจริง แล้วเทียบกับยอดของระบบ (เวลา ± 2 วินาที หลังหักความช้าของการกด)
  // กับไฟล์วิดีโอ: เวลา = ตำแหน่งในวิดีโอ (หยุดวิดีโอแล้วกดได้) และจบเองเมื่อวิดีโอจบ
  let SC = null;
  const scHist = SITE ? SITE.history(P + "sitecheck") : null;
  const scPanel = SITE && $("#scPanel") ? SITE.mountPanel($("#scPanel"), {
    title: "ตรวจความแม่นยำหน้างาน",
    intro: "ทดสอบการนับเข้า–ออกที่ประตูร้านของคุณเอง: ระหว่างที่ระบบนับ ให้คนหนึ่งคนดูประตูแล้วกดปุ่มทุกครั้งที่มีคนเดินข้ามเส้นจริง ระบบจะคำนวณความแม่นยำที่หน้างานนี้พร้อมช่วงความเชื่อมั่น และแนะนำการตั้งค่า",
    steps: [
      "ติดกล้องและวาดเส้นนับบนกล้องที่เลือกให้เรียบร้อย (ใช้กล้องสด หรือไฟล์วิดีโอที่ถ่ายจากประตูร้านเอง)",
      "กด \"เริ่มตรวจ\" แล้วดูประตู ทุกครั้งที่มีคนเดินข้ามเส้น กด \"+ เข้า\" หรือ \"+ ออก\" (คีย์บอร์ด: ลูกศรขึ้น = เข้า, ลูกศรลง = ออก, Backspace = ลบครั้งล่าสุด)",
      "กดให้ตรงจังหวะที่คนข้ามเส้น ช้าหรือเร็วเท่า ๆ กันได้ ระบบหักความช้าของการกดให้เอง",
      "เก็บอย่างน้อย 50 ครั้ง (ช่วงที่มีคนเข้าออกปกติ ราว 15–30 นาที) แล้วกด \"จบและคำนวณ\"",
      "ทำซ้ำในช่วงแสงต่างกัน (กลางวัน/เย็น) และหลังย้ายกล้องหรือเปลี่ยนเส้นนับ เก็บไฟล์ผลตรวจไว้เป็นหลักฐานการรับมอบงาน"
    ],
    body: `<div class="sc-taps" hidden><button class="btn primary sc-in" type="button">+ เข้า</button><button class="btn primary sc-out" type="button">+ ออก</button><button class="btn ghost small sc-undo" type="button">ลบครั้งล่าสุด</button></div>`
  }) : null;
  const scClock = c => c === fileCam ? c.video.currentTime * 1000 : performance.now();
  function scObserve(c, r, dets) {
    if (!SC || SC.slot !== c.slot) return;
    const t = scClock(c);
    for (const x of r.crossings) SC.sys.push({ t, dir: x.dir });
    for (const d of dets) if (d.score >= 0.5 && SC.ph.length < 20000) SC.ph.push(d.h);
  }
  function scLive() {
    if (!scPanel || !SC) return;
    const n = (a, d) => a.filter(e => e.dir === d).length, c = selCam();
    const el = c ? (scClock(c) - SC.t0) / 1000 : 0;
    scPanel.live.textContent = SITE.fmt("คนกด: เข้า {a} · ออก {b} | ระบบนับ: เข้า {c} · ออก {d} | เวลา {e}", { a: n(SC.truth, "in"), b: n(SC.truth, "out"), c: n(SC.sys, "in"), d: n(SC.sys, "out"), e: fmtDur(Math.max(0, el)) });
  }
  function scTap(dir) {
    if (!SC) return;
    const c = srcCams().find(x => x.slot === SC.slot);
    if (!c) return;
    SC.truth.push({ t: scClock(c), dir }); scLive();
  }
  function scStart() {
    if (!SITE || SC) return;
    const c = selCam();
    if (!running || !c || !c.active) return engine("เปิดกล้องหรือไฟล์วิดีโอก่อน แล้วจึงเริ่มตรวจ", "warn");
    const s = camSet(c);
    if (!s.line || c.role === "zone") return engine("กล้องที่เลือกยังไม่มีเส้นนับ — ลากเส้นนับก่อนเริ่มตรวจ", "warn");
    SC = { slot: c.slot, name: c.name, file: c === fileCam, t0: scClock(c), startedAt: Date.now(), sys: [], truth: [], ph: [], hz: [], health: new Set(), line: s.line, swap: !!s.swap, tiles: s.tiles || "" };
    if (c === fileCam) { c.video.loop = false; c.video.addEventListener("ended", scFinish, { once: true }); }
    scPanel.start.disabled = true; scPanel.stop.disabled = false; scPanel.q(".sc-taps").hidden = false; scPanel.exp.hidden = true;
    scPanel.state.textContent = "กำลังตรวจ"; scPanel.state.dataset.s = "live"; SITE.renderReport(scPanel.report, null);
    scLive(); scPanel.q(".sc-in").focus();
  }
  function scFinish() {
    if (!SC) return;
    const run = SC; SC = null;
    const c = srcCams().find(x => x.slot === run.slot);
    if (c && c === fileCam) c.video.loop = true;
    const T = run.truth.map(e => ({ t: e.t - run.t0, dir: e.dir })), Sy = run.sys.map(e => ({ t: e.t - run.t0, dir: e.dir }));
    const stats = { hz: run.hz.length ? SITE.median(run.hz) : null, personH: run.ph.length ? SITE.median(run.ph) : null, health: [...run.health], tiles: run.tiles, hiddenMs: run.hiddenMs || 0 };
    const rep = SITE.countReport(Sy, T, { stats });
    SITE.renderReport(scPanel.report, rep);
    scPanel.start.disabled = false; scPanel.stop.disabled = true; scPanel.q(".sc-taps").hidden = true;
    scPanel.state.textContent = SITE.verdictText(rep); scPanel.state.dataset.s = rep.verdict;
    const doc = SITE.exportDoc("store", {
      camera: run.name, source: run.file ? "video file" : "live camera", startedAt: new Date(run.startedAt).toISOString(), durationSec: Math.round(Math.max(0, ...T.map(e => e.t), ...Sy.map(e => e.t)) / 1000),
      settings: { line: run.line, swap: run.swap, tiles: run.tiles, reid: !!G.reid, detector: detName || "", backend: delegateUsed || "" },
      conditions: stats, truth: T, system: Sy, distinctPeople: null, distinctPeopleNote: "door crossings by unidentified people (a person may cross more than once)",
      report: { verdict: rep.verdict, provisional: rep.provisional, pilot: rep.pilot ? rep.pilot.verdict : null, need: rep.need, n: rep.n, lagMs: rep.lagMs, net: rep.net, netCI: rep.netCI, precision: rep.precision, recall: rep.recall, dirAcc: rep.dirAcc, byDir: rep.byDir, recs: rep.recs, short: rep.short || null, hiddenMs: rep.hiddenMs || 0 }
    });
    scPanel.exp.hidden = false;
    scPanel.exp.onclick = () => SITE.download(`lensiq-store-check-${dayKey(run.startedAt)}.json`, doc);
    scHist.add({ at: run.startedAt, verdict: rep.verdict, provisional: rep.provisional, pilot: rep.pilot ? rep.pilot.verdict : null, need: rep.need, cam: run.name, summary: SITE.fmt("{a}: ระบบ {b} / คนนับ {c} · แม่นยำ {d}", { a: run.name, b: rep.n.sys, c: rep.n.truth, d: rep.precision.p == null ? "—" : (rep.precision.p * 100).toFixed(0) + "%" }) });
    scHist.render(scPanel.hist);
    SCLAST = { rep, doc };
  }
  let SCLAST = null;
  if (scPanel) {
    scPanel.start.addEventListener("click", scStart);
    scPanel.stop.addEventListener("click", scFinish);
    scPanel.q(".sc-in").addEventListener("click", () => scTap("in"));
    scPanel.q(".sc-out").addEventListener("click", () => scTap("out"));
    scPanel.q(".sc-undo").addEventListener("click", () => { if (SC && SC.truth.length) { SC.truth.pop(); scLive(); } });
    document.addEventListener("keydown", e => {
      if (!SC || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || "")) return;
      if (e.key === "ArrowUp") { e.preventDefault(); scTap("in"); } else if (e.key === "ArrowDown") { e.preventDefault(); scTap("out"); }
      else if (e.key === "Backspace") { e.preventDefault(); if (SC.truth.length) { SC.truth.pop(); scLive(); } }
    });
    setInterval(() => { if (SC) scLive(); }, 1000);
    $("#stop").addEventListener("click", () => { if (SC) scFinish(); });
    scHist.render(scPanel.hist);
  }

  // สำหรับการทดสอบอัตโนมัติ (อ่านอย่างเดียว ไม่มีภาพ)
  window.__ST = { get day() { return day; }, get hub() { return hub; }, get running() { return running; }, sched, pipes, G, agg, reidStats: () => ({ ms: RS.ms, n: RS.n, loaded: !!RS.model || fakeEmb(), err: RS.err }), renderDash, get sitecheck() { return SC; }, get sitecheckLast() { return SCLAST; }, scTap: d => scTap(d), scFinish: () => scFinish() };

  sel = (storedCams()[0] || {}).slot || "c1";
  tileUi(); renderZoneEditor(); syncForm(); renderDash();
  if (window.isSecureContext) engine("พร้อม — กด \"เปิดกล้อง\" หรือ \"ใช้ไฟล์วิดีโอทดสอบ\" แล้ววาดเส้นนับและโซนบนภาพ (เพิ่มกล้องได้สูงสุด 4 ตัว)");
  else { engine("บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด (ไฟล์วิดีโอทดสอบยังใช้ได้)", "warn"); const a = document.createElement("a"); a.href = "cameras.html"; a.className = "engine-link"; a.textContent = "ดูวิธี"; $("#engine").append(" ", a); }
})();
