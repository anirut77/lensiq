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

// ---------- ข้อมูลรายวัน ----------
function newDay(date = dayKey()) {
  // zones: คีย์ "<slot>:<zoneId>" (zv 2) · byCam: {slot: {name, in, out}} ; in/out/peak เป็นยอดรวมทุกกล้อง
  return { date, in: 0, out: 0, occ: 0, peak: 0, peakAt: 0, maxQueue: 0, hourly: { in: Array(24).fill(0), out: Array(24).fill(0) }, zones: {}, byCam: {}, zv: 2 };
}
/* บันทึกการข้ามเส้น คนในร้านไม่ต่ำกว่า 0 */
function applyCrossing(day, dir, now) {
  const h = new Date(now).getHours();
  if (dir === "in") { day.in++; day.hourly.in[h]++; day.occ++; }
  else if (dir === "out") { day.out++; day.hourly.out[h]++; day.occ = Math.max(0, day.occ - 1); }
  if (day.occ > day.peak) { day.peak = day.occ; day.peakAt = now; }
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
function newPipe() { return { tracker: ST_LQT.newTracker(ST_LQT.PRESET.person), lineMem: {}, zoneLive: {}, zoneCounts: {}, lastSeen: [] }; }
/* ประมวลผลหนึ่งเฟรมของหนึ่งกล้องลง `day` ที่ใช้ร่วมกัน
   cam = {slot, name, role:'door'|'zone'|'both', line, swap, zones:[{id,name,x,y,w,h}]}
   - นับข้ามเส้นเฉพาะ role door/both ; โซนเฉพาะ role zone/both
   - day.in/out/peak เป็นยอดรวม ; day.byCam[slot] = {name, in, out}
   คืน {conf, obs, crossings:[{id, dir}]} */
function stepCam(pipe, cam, day, dets, now, tcfg) {
  tcfg = tcfg || ST_LQT.trackerCfgFor(ST_LQT.PRESET.person, 0);
  const { seen, removed } = ST_LQT.updateTracker(pipe.tracker, dets, now, tcfg);
  removed.forEach(id => delete pipe.lineMem[id]);
  const conf = seen.filter(t => t.hits >= (tcfg.MIN_HITS ?? ST_CFG.MIN_HITS));
  pipe.lastSeen = conf;
  if (!day.byCam) day.byCam = {};
  const bc = day.byCam[cam.slot] || (day.byCam[cam.slot] = { name: cam.name || cam.slot, in: 0, out: 0 });
  if (cam.name) bc.name = cam.name;
  const role = cam.role || "both", crossings = [];
  if (cam.line && role !== "zone") for (const t of conf) {
    const mem = pipe.lineMem[t.id] || (pipe.lineMem[t.id] = {});
    const dir = checkCrossing(mem, cam.line, center(t.box), !!cam.swap);
    if (dir) { applyCrossing(day, dir, now); bc[dir]++; t.flash = { dir, until: now + 800 }; crossings.push({ id: t.id, dir }); }
  }
  const obs = conf.map(t => ({ id: t.id, foot: foot(t.box) }));
  const zones = role === "door" ? [] : (cam.zones || []).map(z => ({ ...z, id: nsZone(cam.slot, z.id) }));
  const alive = new Set(pipe.tracker.tracks.map(t => t.id));
  pipe.zoneCounts = zoneStep(pipe.zoneLive, zones, obs, alive, day, now);
  return { conf, obs, crossings };
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

// ---------- CSV ----------
function csvCell(v) { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function buildCsv(days, cashierId) {
  const rows = [["รายชั่วโมง"], ["วันที่", "ชั่วโมง", "เข้า", "ออก"]];
  days.forEach(d => d.hourly.in.forEach((v, h) => { if (v || d.hourly.out[h]) rows.push([d.date, String(h).padStart(2, "0") + ":00", v, d.hourly.out[h]]); }));
  rows.push([], ["สรุปรายวัน"], ["วันที่", "เข้า", "ออก", "คนในร้านสูงสุด", "เวลาที่สูงสุด", "คิวสูงสุด", "อัตราการซื้อโดยประมาณ (%)"]);
  days.forEach(d => {
    const c = conversion(d, cashierId);
    rows.push([d.date, d.in, d.out, d.peak, d.peakAt ? new Date(d.peakAt).toTimeString().slice(0, 5) : "", d.maxQueue, c == null ? "" : (c * 100).toFixed(1)]);
  });
  rows.push([], ["รายกล้อง"], ["วันที่", "กล้อง", "เข้า", "ออก"]);
  days.forEach(d => Object.keys(d.byCam || {}).sort().forEach(s => { const b = d.byCam[s]; rows.push([d.date, b.name || s, b.in || 0, b.out || 0]); }));
  rows.push([], ["โซน"], ["วันที่", "โซน", "จำนวนครั้งที่เข้า", "เวลาอยู่เฉลี่ย (วินาที)", "คนพร้อมกันสูงสุด"]);
  days.forEach(d => Object.entries(d.zones).forEach(([k, z]) => rows.push([d.date, zoneLabel(d, k, z), z.visits, avgDwellSec(z).toFixed(1), z.peak])));
  return "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\n");
}

if (typeof module !== "undefined") module.exports = { ST_CFG, ST_SLOTS, dayKey, iou, center, foot, normRect, pointInRect, newTracker, updateTracker, lineSide, segmentsIntersect, checkCrossing, newDay, applyCrossing, zoneStep, closeZones, avgDwellSec, queueInfo, conversion, newHeat, heatAdd, heatMax, heatColor, heatToRGBA, buildCsv, decodePersons, nms, nsZone, autoDetW, newPipe, stepCam, migrateStore, zoneLabel };

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
  // G = ค่าตั้งรวม (st-settings) ; ค่าต่อกล้องอยู่ใน cam.settings (st-cam-<slot>) = {line, swap, zones, detW}
  const G = Object.assign({ maxOcc: 20, serviceSec: 60, queueAlert: 5, heatOn: false, queueZone: "", cashierZone: "" }, load("settings", {}));
  let day = Object.assign(newDay(), load("day-" + dayKey(), {}));
  if (!day.byCam) day.byCam = {};
  const pipes = new Map(), heats = new Map();
  let model = null, delegateUsed = "", running = false, wakeLock = null, fileCam = null, fileUrl = null;
  let lastDash = 0, lastSave = 0, tool = "none", sel = "c1";
  const detectErrors = {};

  const persistSettings = () => save("settings", G);
  const persistDay = () => save("day-" + day.date, day);
  const camSet = c => (c.settings = Object.assign({ line: null, swap: false, zones: [], detW: 0 }, c.settings || {}));
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
  const storedCams = () => LQCam.parseCams(localStorage.getItem(P + "cams")).cams.map(e => ({ slot: e.slot, name: e.name || `กล้อง ${e.slot.slice(1)}`, role: e.role, settings: Object.assign({ line: null, swap: false, zones: [], detW: 0 }, load("cam-" + e.slot, {})) }));
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
        <span class="pill st-status"></span><span class="pill st-hz">—</span>
        <button class="btn ghost small cam-del" type="button">ลบกล้อง</button>
      </div>
      <div class="cam"></div>
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
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock && document.visibilityState === "visible") { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); }
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { console.warn("wakeLock", e); }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && running) keepAwake(true); });

  // ---- โหลดโมเดล (COCO-SSD ผ่าน LQDetect — WASM/CPU ได้ ไม่ต้องใช้ WebGL) ----
  async function loadDetector() {
    if (LQDetect.isTest()) { delegateUsed = "test"; return null; }
    if (model) return model;
    engine("กำลังโหลดโมเดลตรวจจับคน...");
    try {
      if (typeof faceapi === "undefined") throw new Error("ไม่พบไลบรารี vendor/face-api.js");
      delegateUsed = await LQDetect.tfBackend();
      model = await LQDetect.loadCoco("vendor/models/cocossd/model.json");
      return model;
    } catch (e) { throw Object.assign(e, { model: true }); }
  }

  /* ตรวจจับคนหนึ่งเฟรมของกล้องหนึ่งตัว (ย่อภาพเหลือกว้าง detW px — 416/352/320 ตามจำนวนกล้อง) คืนกล่องพิกัดสัดส่วน */
  async function detectPeople(c) {
    const fk = LQDetect.fake(c.slot, performance.now());
    if (fk) return fk;
    if (!model) return [];
    const detW = camSet(c).detW || autoDetW(srcCams().filter(x => x.active).length);
    return LQDetect.detectCoco(model, c.video, { detW, canvas: c._small || (c._small = document.createElement("canvas")) });
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
  const engineRunning = label => engine(`กำลังวิเคราะห์ (${label}) — ตัวประมวลผล: ${delegateUsed.toUpperCase()}${delegateUsed === "webgl" || delegateUsed === "test" ? "" : " อาจช้ากว่าปกติ"}`, "ok");

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
    running = true; $("#stop").disabled = false; keepAwake(true);
    engineRunning(label);
    srcCams().forEach(c => layout(c));
    syncSched(); sched.start(); tileUi(); renderZoneEditor(); syncForm(); renderDash();
  }

  function process(c, dets, now) {
    if (dayKey(now) !== day.date) { pipes.forEach(p => closeZones(p.zoneLive, day)); persistDay(); day = newDay(dayKey(now)); }
    const s = camSet(c), pipe = pipeOf(c.slot);
    const tcfg = ST_LQT.trackerCfgFor(ST_LQT.PRESET.person, c.intervalMsEma);
    const r = stepCam(pipe, { slot: c.slot, name: c.name, role: c.role, line: s.line, swap: s.swap, zones: s.zones }, day, dets, now, tcfg);
    if (G.queueZone) day.maxQueue = Math.max(day.maxQueue, zoneCount(G.queueZone));
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
  function draw(c, now = Date.now()) {
    if (!c || !c.overlay) return;
    const ctx = c.overlay.getContext("2d"), w = c.overlay.width, h = c.overlay.height, k = devicePixelRatio || 1, s = camSet(c);
    const pipe = pipes.get(c.slot);
    ctx.clearRect(0, 0, w, h);
    if (G.heatOn) paintHeat(ctx, heatOf(c.slot), w, h);
    if (c.role !== "door") paintZones(ctx, c, w, h, k, pipe ? pipe.zoneCounts : {});
    if (s.line && c.role !== "zone") paintLine(ctx, s.line, s.swap, w, h, k);
    for (const t of pipe ? pipe.lastSeen : []) {
      const b = t.box, fl = t.flash && t.flash.until > now ? t.flash.dir : null;
      ctx.strokeStyle = fl === "in" ? "#2a78d6" : fl === "out" ? "#eb6834" : "#ffffff";
      ctx.lineWidth = (fl ? 4 : 2) * k;
      ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);
      label(ctx, `#${t.id}${fl ? (fl === "in" ? " เข้า" : " ออก") : ""}`, b.x * w, Math.max(0, b.y * h - 18 * k), fl === "in" ? "#2a78d6" : fl === "out" ? "#eb6834" : "#0e1430", k);
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
    $("#drawMsg").textContent = { line: "ลากนิ้วหรือเมาส์บนภาพเพื่อวาดเส้นนับคนเข้า/ออก (เช่น ขวางประตู)" + many, zone: "ลากนิ้วหรือเมาส์บนภาพเพื่อวาดสี่เหลี่ยมโซน" + many, none: "" }[tool];
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
  function renderDash() {
    const qd = G.queueZone ? zoneDef(G.queueZone) : null, cd = G.cashierZone ? zoneDef(G.cashierZone) : null;
    const qi = qd ? queueInfo(zoneCount(G.queueZone), G.serviceSec) : null;
    const conv = conversion(day, cd ? G.cashierZone : null);
    const occAlert = day.occ >= G.maxOcc, qAlert = qi && qi.length >= G.queueAlert;
    const tile = (k, v, s = "", cls = "") => `<div class="tile ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    $("#tiles").innerHTML =
      tile("เข้าวันนี้", day.in, "คน", "in") + tile("ออกวันนี้", day.out, "คน", "out") +
      tile("คนในร้านตอนนี้", day.occ, `สูงสุดที่ตั้งไว้ ${G.maxOcc} คน`, occAlert ? "hot" : "") +
      tile("สูงสุดวันนี้", day.peak, day.peakAt ? "เวลา " + fmtClock(day.peakAt) : "") +
      tile("คิวตอนนี้", qi ? `${qi.length} คน` : "—", qi ? `รอประมาณ ${fmtDur(qi.waitSec)}` : "ยังไม่กำหนดโซนคิว", qAlert ? "hot" : "") +
      tile("อัตราการซื้อโดยประมาณ", conv == null ? "—" : (conv * 100).toFixed(0) + "%", cd ? `เข้าโซน${esc(cd.z.name)} / คนเข้าร้าน` : "ยังไม่กำหนดโซนแคชเชียร์");
    const bc = Object.keys(day.byCam || {}).sort().map(s => day.byCam[s]).filter(b => b.in || b.out);
    $("#byCam").innerHTML = bc.length > 1 || cfgList().length > 1 ? bc.map(b => `<span class="pill">${esc(b.name)}: เข้า ${b.in} · ออก ${b.out}</span>`).join("") : "";
    const al = [];
    if (occAlert) al.push(`คนในร้านถึง ${day.occ} คน (เกินหรือเท่ากับที่กำหนด ${G.maxOcc} คน)`);
    if (qAlert) al.push(`คิวยาว ${qi.length} คน รอประมาณ ${fmtDur(qi.waitSec)} — ควรเปิดจุดชำระเงินเพิ่ม`);
    $("#alerts").innerHTML = al.map(a => `<div class="alert">${esc(a)}</div>`).join("");
    const many = cfgList().length > 1;
    const rows = cfgList().flatMap(c => camSet(c).zones.map(z => ({ c, z, id: nsZone(c.slot, z.id) })));
    $("#zoneTable").innerHTML = `<thead><tr><th>โซน</th><th class="n">อยู่ตอนนี้</th><th class="n">เข้าวันนี้ (ครั้ง)</th><th class="n">เวลาอยู่เฉลี่ย</th></tr></thead><tbody>` +
      (rows.length ? rows.map(({ c, z, id }) => { const zs = day.zones[id]; return `<tr><td>${many ? esc(c.name) + " · " : ""}${esc(z.name)}${id === G.queueZone ? " <span class=\"tag q\">คิว</span>" : ""}${id === G.cashierZone ? " <span class=\"tag c\">แคชเชียร์</span>" : ""}</td><td class="n">${zoneCount(id)}</td><td class="n">${zs?.visits || 0}</td><td class="n">${zs?.dwellN ? fmtDur(avgDwellSec(zs)) : "—"}</td></tr>`; }).join("")
        : `<tr><td colspan="4" class="empty">ยังไม่มีโซน</td></tr>`) + "</tbody>";
    drawHourly(); drawHeatPreview();
  }

  function drawHourly() {
    const c = $("#hourly"), dpr = devicePixelRatio || 1, W = c.clientWidth || 500, Hh = 220;
    c.width = W * dpr; c.height = Hh * dpr; c.style.height = Hh + "px";
    const ctx = c.getContext("2d"); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, W, Hh);
    const act = []; for (let h = 0; h < 24; h++) if (day.hourly.in[h] || day.hourly.out[h]) act.push(h);
    const h0 = Math.min(8, ...act), h1 = Math.max(20, ...act), n = h1 - h0 + 1;
    let max = 1; for (let h = h0; h <= h1; h++) max = Math.max(max, day.hourly.in[h], day.hourly.out[h]);
    const step = max <= 5 ? 1 : Math.ceil(max / 4 / 5) * 5, top = Math.ceil(max / step) * step;
    const L = 34, R = 8, T = 12, B = 26, pw = W - L - R, ph = Hh - T - B;
    ctx.font = "11px Prompt, sans-serif"; ctx.textBaseline = "middle"; ctx.textAlign = "right";
    for (let v = 0; v <= top; v += step) {
      const y = T + ph - v / top * ph;
      ctx.strokeStyle = v ? "#e6edf1" : "#9fb1bc"; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke();
      ctx.fillStyle = "#52514e"; ctx.fillText(v, L - 6, y);
    }
    const gw = pw / n, bw = Math.max(2, Math.min(14, gw * 0.36));
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let h = h0; h <= h1; h++) {
      const gx = L + (h - h0) * gw + gw / 2;
      [["in", "#2a78d6", -1], ["out", "#eb6834", 1]].forEach(([k, col, side]) => {
        const v = day.hourly[k][h], bh = v / top * ph;
        if (!v) return;
        ctx.fillStyle = col; ctx.fillRect(gx + (side < 0 ? -bw - 1 : 1), T + ph - bh, bw, bh);
      });
      if (n <= 14 || (h - h0) % 2 === 0) { ctx.fillStyle = "#52514e"; ctx.fillText(String(h).padStart(2, "0"), gx, T + ph + 6); }
    }
    c.setAttribute("aria-label", "กราฟคนเข้าออกรายชั่วโมง: " + (act.map(h => `${h}:00 เข้า ${day.hourly.in[h]} ออก ${day.hourly.out[h]}`).join(", ") || "ยังไม่มีข้อมูล"));
  }
  $("#hourly").addEventListener("pointermove", e => {
    const c = $("#hourly"), r = c.getBoundingClientRect(), tip = $("#tooltip");
    const act = []; for (let h = 0; h < 24; h++) if (day.hourly.in[h] || day.hourly.out[h]) act.push(h);
    const h0 = Math.min(8, ...act), h1 = Math.max(20, ...act), n = h1 - h0 + 1;
    const i = Math.floor((e.clientX - r.left - 34) / ((r.width - 42) / n));
    if (i < 0 || i >= n) { tip.hidden = true; return; }
    const h = h0 + i;
    tip.innerHTML = `<b>${String(h).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:59</b><br>เข้า ${day.hourly.in[h]} · ออก ${day.hourly.out[h]}`;
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
  $("#resetOcc").addEventListener("click", () => { day.occ = 0; persistDay(); renderDash(); });
  const sf = $("#settingsForm");
  function syncForm() {
    ["maxOcc", "serviceSec", "queueAlert"].forEach(k => { sf[k].value = G[k]; });
    const c = selCam(); sf.detW.value = String(c ? camSet(c).detW || 0 : 0);
  }
  sf.addEventListener("input", e => {
    const v = Math.round(+e.target.value), n = e.target.name;
    if (n === "detW") { const c = selCam(); if (c) { camSet(c).detW = v || 0; persistCam(c); } }
    else {
      if (!(v > 0)) { $("#setMsg").textContent = "กรุณาใส่ตัวเลขมากกว่า 0"; $("#setMsg").className = "form-msg err"; return; }
      G[n] = v; persistSettings(); renderDash();
    }
    $("#setMsg").textContent = "บันทึกแล้ว"; $("#setMsg").className = "form-msg ok";
  });
  sf.addEventListener("submit", e => e.preventDefault());

  const allDays = () => Object.keys(localStorage).filter(k => /^st-day-\d{4}-\d{2}-\d{2}$/.test(k)).sort()
    .map(k => k === P + "day-" + day.date ? day : Object.assign(newDay(k.slice(P.length + 4)), load(k.slice(P.length), {})));
  $("#exportCsv").addEventListener("click", () => {
    persistDay();
    download(new Blob([buildCsv(allDays(), G.cashierZone)], { type: "text/csv;charset=utf-8" }), `store-analytics-${day.date}.csv`);
  });
  $("#clearData").addEventListener("click", () => {
    if (!confirm("ลบสถิติทุกวันและฮีตแมปทั้งหมด? (การตั้งค่ากล้อง เส้น และโซนยังอยู่)")) return;
    Object.keys(localStorage).filter(k => k.startsWith(P + "day-") || k === P + "heat" || k.startsWith(P + "heat-")).forEach(k => localStorage.removeItem(k));
    day = newDay(); heats.forEach(h => h.data.fill(0)); pipes.forEach(p => { p.zoneLive = {}; });
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
  setInterval(() => { if (!running && dayKey() !== day.date) { day = newDay(); renderDash(); } }, 60000);

  // สำหรับการทดสอบอัตโนมัติ (อ่านอย่างเดียว ไม่มีภาพ)
  window.__ST = { get day() { return day; }, get hub() { return hub; }, get running() { return running; }, sched, pipes, G };

  sel = (storedCams()[0] || {}).slot || "c1";
  tileUi(); renderZoneEditor(); syncForm(); renderDash();
  if (window.isSecureContext) engine("พร้อม — กด \"เปิดกล้อง\" หรือ \"ใช้ไฟล์วิดีโอทดสอบ\" แล้ววาดเส้นนับและโซนบนภาพ (เพิ่มกล้องได้สูงสุด 4 ตัว)");
  else { engine("บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด (ไฟล์วิดีโอทดสอบยังใช้ได้)", "warn"); const a = document.createElement("a"); a.href = "cameras.html"; a.className = "engine-link"; a.textContent = "ดูวิธี"; $("#engine").append(" ", a); }
})();
