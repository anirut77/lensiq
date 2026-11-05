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

/* กล่อง {x,y,w,h} พิกัดสัดส่วน 0..1 */
function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}
const center = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const foot = b => ({ x: b.x + b.w / 2, y: Math.min(1, b.y + b.h) });
const dist2d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

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
  return { date, in: 0, out: 0, occ: 0, peak: 0, peakAt: 0, maxQueue: 0, hourly: { in: Array(24).fill(0), out: Array(24).fill(0) }, zones: {} };
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
  rows.push([], ["โซน"], ["วันที่", "โซน", "จำนวนครั้งที่เข้า", "เวลาอยู่เฉลี่ย (วินาที)", "คนพร้อมกันสูงสุด"]);
  days.forEach(d => Object.values(d.zones).forEach(z => rows.push([d.date, z.name, z.visits, avgDwellSec(z).toFixed(1), z.peak])));
  return "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\n");
}

if (typeof module !== "undefined") module.exports = { ST_CFG, dayKey, iou, center, foot, normRect, pointInRect, newTracker, updateTracker, lineSide, segmentsIntersect, checkCrossing, newDay, applyCrossing, zoneStep, closeZones, avgDwellSec, queueInfo, conversion, newHeat, heatAdd, heatMax, heatColor, heatToRGBA, buildCsv, decodePersons, nms };

// ================= ส่วนหน้าจอ =================
if (typeof document !== "undefined") (() => {
  const P = "st-";
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDur = s => s < 60 ? `${Math.round(s)} วิ` : `${Math.floor(s / 60)} นาที ${Math.round(s % 60)} วิ`;
  const fmtClock = ts => new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(P + k)); return v ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch { engine("พื้นที่จัดเก็บเต็ม กรุณาส่งออก CSV แล้วล้างข้อมูล", "err"); } };
  const video = $("#video"), overlay = $("#overlay"), cam = $("#cam");

  // ---- สถานะ ----
  const S = Object.assign({ line: null, swap: false, zones: [], maxOcc: 20, serviceSec: 60, queueAlert: 5, detW: 416, heatOn: false }, load("settings", {}));
  let day = Object.assign(newDay(), load("day-" + dayKey(), {}));
  const heat = newHeat();
  { const h = load("heat", null); if (h && h.length === heat.data.length) heat.data.set(h); }
  let tracker = newTracker(), lineMem = {}, zoneLive = {}, zoneCounts = {}, lastSeen = [];
  let detector = null, delegateUsed = "", running = false, fileUrl = null, wakeLock = null;
  let detectErrors = 0, lastProc = 0, lastTs = 0, fpsTimes = [], lastDash = 0, lastSave = 0, tool = "none", drag = null;

  const persistSettings = () => save("settings", S);
  const persistDay = () => save("day-" + day.date, day);
  const persistHeat = () => save("heat", Array.from(heat.data, v => Math.round(v * 10) / 10));
  const zoneBy = flag => S.zones.find(z => z[flag]);

  function engine(msg, cls = "") { const e = $("#engine"); e.textContent = msg; e.className = "engine " + cls; }
  // ---------- กล้อง (มือถือ/แท็บเล็ต): เลือกกล้องหน้า/หลัง · สะท้อนภาพเฉพาะกล้องหน้า · ปิดกล้องเมื่อสลับแอปแล้วเปิดต่อ ----------
  const INSECURE_MSG = "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด";
  function createCamera(video, o = {}) {
    const opt = { facing: "user", constraints: {}, layout() {}, onError(e) { console.error(e); }, ...o };
    const BACK = /back|rear|environment|หลัง/i;
    let stream = null, want = { facing: opt.facing, deviceId: "" }, cur = { facing: opt.facing, deviceId: "" }, devices = [], resume = false;
    const uis = [];
    const gum = v => navigator.mediaDevices.getUserMedia({ video: { ...opt.constraints, ...v }, audio: false });
    function halt() { stream?.getTracks().forEach(t => t.stop()); stream = null; if (video.srcObject) video.srcObject = null; }
    async function start(next) {
      if (next) want = { facing: next.facing || want.facing, deviceId: next.deviceId || "" };
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("insecure context"), { name: "Insecure" });
      halt();
      let s;
      try { s = await gum(want.deviceId ? { deviceId: { exact: want.deviceId } } : { facingMode: { ideal: want.facing } }); }
      catch (e) { if (!want.deviceId || !/Overconstrained|NotFound/.test(e.name)) throw e; want.deviceId = ""; s = await gum({ facingMode: { ideal: want.facing } }); }
      stream = s;
      const tr = s.getVideoTracks()[0], st = tr?.getSettings?.() || {};
      cur = { deviceId: st.deviceId || want.deviceId, facing: st.facingMode || (BACK.test(tr?.label || "") ? "environment" : "user") };
      if (tr) tr.addEventListener("ended", () => { if (stream === s) stream = null; });
      video.muted = true; video.playsInline = true; video.setAttribute("playsinline", ""); video.setAttribute("muted", "");
      video.srcObject = s;
      try { await video.play(); } catch (e) { if (e.name !== "AbortError") throw e; }
      if (!video.videoWidth) await new Promise(r => video.addEventListener("loadedmetadata", r, { once: true }));
      opt.layout(api); refreshDevices();
      return s;
    }
    async function refreshDevices() {
      try { devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput"); } catch { devices = []; }
      for (const ui of uis) {
        ui.hidden = devices.length < 2;
        const [flip, sel] = ui.children;
        flip.textContent = cur.facing === "environment" ? "ใช้กล้องหน้า" : "ใช้กล้องหลัง";
        sel.innerHTML = devices.map((d, i) => `<option value="${d.deviceId.replace(/"/g, "&quot;")}">${(d.label || "กล้อง " + (i + 1)).replace(/[<&]/g, "")}</option>`).join("");
        if (cur.deviceId) sel.value = cur.deviceId;
      }
    }
    function switchTo(n) {
      if (!stream) { want = { facing: n.facing || want.facing, deviceId: n.deviceId || "" }; cur = { ...cur, ...want }; return refreshDevices(); }
      start(n).catch(opt.onError);
    }
    const api = {
      start, refreshDevices,
      stop() { resume = false; halt(); },
      get active() { return !!stream && stream.active; },
      get mirrored() { return cur.facing !== "environment"; },
      attach(el) {
        uis.push(el); el.hidden = true;
        el.innerHTML = `<button class="btn ghost" type="button">ใช้กล้องหลัง</button><select aria-label="เลือกกล้อง"></select>`;
        el.children[0].onclick = () => switchTo({ facing: cur.facing === "environment" ? "user" : "environment" });
        el.children[1].onchange = e => switchTo({ deviceId: e.target.value });
        refreshDevices();
      }
    };
    video.addEventListener("resize", () => { if (stream) opt.layout(api); });
    let rt = 0; const relayout = () => { clearTimeout(rt); rt = setTimeout(() => { if (stream) opt.layout(api); }, 150); };
    addEventListener("resize", relayout); addEventListener("orientationchange", relayout);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { if (stream) { resume = true; halt(); } }
      else if (resume) { resume = false; start().catch(opt.onError); }
    });
    addEventListener("pagehide", halt);
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return api;
  }

  // หน้าร้านใช้กล้องหลังเป็นค่าเริ่มต้น (มือถือตั้งเป็นกล้องประจำจุด) และไม่สะท้อนภาพ เพื่อให้เส้นนับ/โซนตรงกับพื้นที่จริง
  const camera = createCamera(video, {
    facing: "environment", constraints: { width: { ideal: 1280 }, height: { ideal: 720 } },
    layout() { if (video.videoWidth) cam.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`; sizeOverlay(); },
    onError: e => { stopSource(); showError(e, startCamera); }
  });
  camera.attach($("#camSwitch"));
  // กันจอดับระหว่างวิเคราะห์ (มือถือที่ตั้งเป็นกล้องประจำจุด)
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock && document.visibilityState === "visible") { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); }
      else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { console.warn("wakeLock", e); }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && running) keepAwake(true); });

  // ---- โหลดโมเดล (TensorFlow.js COCO-SSD ใน face-api.js — ไม่ต้องใช้ WebGL) ----
  async function initBackend() {
    const tf = faceapi.tf;
    tf.setWasmPaths("vendor/");
    const order = new URLSearchParams(location.search).has("cpu") ? ["wasm", "cpu"] : ["webgl", "wasm", "cpu"];
    for (const name of order) {
      try { if (await tf.setBackend(name)) { await tf.ready(); return name; } } catch (e) { console.warn(name, e); }
    }
    throw new Error("ไม่มีตัวประมวลผล TensorFlow.js ที่ใช้ได้");
  }
  async function loadDetector() {
    if (detector) return detector;
    engine("กำลังโหลดโมเดลตรวจจับคน...");
    try {
      if (typeof faceapi === "undefined") throw new Error("ไม่พบไลบรารี vendor/face-api.js");
      delegateUsed = await initBackend();
      const tf = faceapi.tf;
      const model = await tf.loadGraphModel(new URL("vendor/models/cocossd/model.json", location.href).href);
      // อุ่นเครื่องหนึ่งครั้ง
      const warm = tf.zeros([1, 180, 320, 3], "int32");
      (await model.executeAsync(warm)).forEach(t => t.dispose()); warm.dispose();
      detector = model; return detector;
    } catch (e) { throw Object.assign(e, { model: true }); }
  }

  /* ตรวจจับคนหนึ่งเฟรม (ย่อภาพเหลือกว้าง ~320px เพื่อความเร็ว) คืนกล่องพิกัดสัดส่วน */
  const small = document.createElement("canvas");
  async function detectPeople() {
    const tf = faceapi.tf, W = video.videoWidth, H = video.videoHeight;
    const sw = Math.min(S.detW || 416, W), sh = Math.round(H * sw / W);
    if (small.width !== sw || small.height !== sh) { small.width = sw; small.height = sh; }
    small.getContext("2d", { willReadFrequently: true }).drawImage(video, 0, 0, sw, sh);
    const input = tf.tidy(() => tf.browser.fromPixels(small).expandDims(0));
    let outs;
    try { outs = await detector.executeAsync(input); } finally { input.dispose(); }
    try {
      const bt = outs.find(t => t.shape.length === 4 && t.shape[3] === 4), st = outs.find(t => t !== bt);
      const [scores, boxes] = await Promise.all([st.data(), bt.data()]);
      return decodePersons(boxes, scores, st.shape[1], st.shape[2], 0.4, 0.5, 20);
    } finally { outs.forEach(t => t.dispose()); }
  }

  function showError(e, retry) {
    console.error(e);
    const m = { Insecure: INSECURE_MSG, NotAllowedError: "ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์", NotFoundError: "ไม่พบกล้องในเครื่องนี้ ลองใช้ไฟล์วิดีโอทดสอบแทน", OverconstrainedError: "ไม่พบกล้องในเครื่องนี้ ลองใช้ไฟล์วิดีโอทดสอบแทน", NotReadableError: "กล้องถูกโปรแกรมอื่นใช้อยู่", MediaError: "เปิดไฟล์วิดีโอไม่ได้ ลองไฟล์ MP4/WebM อื่น" }[e.name];
    engine(`ระบบไม่พร้อม: ${e.model ? "โหลดโมเดลตรวจจับคนไม่สำเร็จ" : m || "เกิดข้อผิดพลาด"} (${e.name}: ${e.message || "-"})`, "err");
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn ghost retry"; b.textContent = "ลองใหม่"; b.onclick = retry;
    $("#engine").append(" ", b);
    if (e.name === "Insecure") { const a = document.createElement("a"); a.href = "cameras.html"; a.className = "engine-link"; a.textContent = "ดูวิธีเปิดผ่าน https"; $("#engine").append(" ", a); }
  }

  // ---- แหล่งภาพ ----
  function stopSource() {
    running = false; keepAwake(false);
    camera.stop();
    video.pause(); video.removeAttribute("src"); video.srcObject = null; video.load();
    if (fileUrl) { URL.revokeObjectURL(fileUrl); fileUrl = null; }
    closeZones(zoneLive, day); persistDay();
    tracker = newTracker(); lineMem = {}; zoneCounts = {}; lastSeen = [];
    $("#stop").disabled = true; $("#fps").textContent = "—";
    draw(); renderDash();
  }

  async function startCamera() {
    stopSource();
    engine("กำลังเปิดกล้อง...");
    try {
      video.loop = false;
      await camera.start();
      await begin("กล้อง");
    } catch (e) { stopSource(); showError(e, startCamera); }
  }

  async function startFile(file) {
    stopSource();
    try {
      fileUrl = URL.createObjectURL(file);
      video.src = fileUrl; video.loop = true;
      await begin("ไฟล์วิดีโอ: " + file.name);
    } catch (e) { stopSource(); showError(e.name === "NotSupportedError" ? Object.assign(e, { name: "MediaError" }) : e, () => $("#file").click()); }
  }

  async function begin(label) {
    await new Promise((res, rej) => {
      if (video.readyState >= 1) return res();
      video.addEventListener("loadedmetadata", res, { once: true });
      video.addEventListener("error", () => rej(Object.assign(new Error(video.error?.message || "media error"), { name: "MediaError" })), { once: true });
    });
    await video.play();
    cam.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    sizeOverlay();
    await loadDetector();
    running = true; $("#stop").disabled = false; keepAwake(true);
    engine(`กำลังวิเคราะห์ (${label}) — ตัวประมวลผล: ${delegateUsed.toUpperCase()}${delegateUsed === "webgl" ? "" : " อาจช้ากว่าปกติ"}`, "ok");
    requestAnimationFrame(loop);
  }

  // ---- วนตรวจจับ ~12 fps (ไม่ซ้อนกัน หากเครื่องช้าจะลด fps เอง) ----
  let busy = false;
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    const t = performance.now();
    if (busy || t - lastProc < 80 || video.readyState < 2 || video.paused) return;
    lastProc = t; busy = true;
    detectPeople().then(dets => {
      detectErrors = 0;
      if (!running) return;
      process(dets, Date.now());
      const t2 = performance.now();
      fpsTimes.push(t2); while (fpsTimes.length && t2 - fpsTimes[0] > 1000) fpsTimes.shift();
      $("#fps").textContent = `${fpsTimes.length} fps · ${lastSeen.length} คน`;
    }).catch(e => {
      console.error(e);
      if (++detectErrors >= 5) { stopSource(); showError(Object.assign(e, { model: true }), () => begin("ลองใหม่")); }
    }).finally(() => { busy = false; });
  }

  function process(dets, now) {
    if (dayKey(now) !== day.date) { closeZones(zoneLive, day); persistDay(); day = newDay(dayKey(now)); }
    const { seen, removed } = updateTracker(tracker, dets, now);
    removed.forEach(id => delete lineMem[id]);
    const conf = seen.filter(t => t.hits >= ST_CFG.MIN_HITS);
    lastSeen = conf;
    if (S.line) for (const t of conf) {
      const mem = lineMem[t.id] || (lineMem[t.id] = {});
      const dir = checkCrossing(mem, S.line, center(t.box), S.swap);
      if (dir) { applyCrossing(day, dir, now); t.flash = { dir, until: now + 800 }; }
    }
    const obs = conf.map(t => ({ id: t.id, foot: foot(t.box) }));
    zoneCounts = zoneStep(zoneLive, S.zones, obs, new Set(tracker.tracks.map(t => t.id)), day, now);
    const q = zoneBy("queue");
    if (q) day.maxQueue = Math.max(day.maxQueue, zoneCounts[q.id] || 0);
    obs.forEach(o => heatAdd(heat, o.foot));
    draw(now);
    if (now - lastDash > 1000) { lastDash = now; renderDash(); }
    if (now - lastSave > 10000) { lastSave = now; persistDay(); persistHeat(); }
  }

  // ---- วาดภาพซ้อน ----
  function sizeOverlay() {
    const r = overlay.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    overlay.width = Math.max(1, Math.round(r.width * dpr)); overlay.height = Math.max(1, Math.round(r.height * dpr));
    draw();
  }
  const heatCanvas = document.createElement("canvas");
  function paintHeat(ctx, w, h) {
    heatCanvas.width = heat.w; heatCanvas.height = heat.h;
    const hc = heatCanvas.getContext("2d");
    hc.putImageData(new ImageData(heatToRGBA(heat), heat.w, heat.h), 0, 0);
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(heatCanvas, 0, 0, w, h); ctx.restore();
  }
  function paintLine(ctx, line, w, h, k) {
    const ax = line.a.x * w, ay = line.a.y * h, bx = line.b.x * w, by = line.b.y * h;
    ctx.lineWidth = 3 * k; ctx.strokeStyle = "#8b7bff"; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    // ลูกศรทิศ "เข้า" ชี้ไปฝั่ง +1 (หรือ -1 ถ้าสลับ)
    let nx = -(by - ay), ny = bx - ax; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
    if (S.swap) { nx = -nx; ny = -ny; }
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
  function paintZones(ctx, w, h, k, counts) {
    S.zones.forEach(z => {
      const col = z.queue ? "#eb6834" : z.cashier ? "#1a7f4b" : "#6cc4e3";
      ctx.strokeStyle = col; ctx.lineWidth = 2 * k; ctx.setLineDash([6 * k, 4 * k]);
      ctx.strokeRect(z.x * w, z.y * h, z.w * w, z.h * h); ctx.setLineDash([]);
      label(ctx, counts ? `${z.name} · ${counts[z.id] || 0}` : z.name, z.x * w + 2 * k, z.y * h + 2 * k, col, k);
    });
  }
  function draw(now = Date.now()) {
    const ctx = overlay.getContext("2d"), w = overlay.width, h = overlay.height, k = devicePixelRatio || 1;
    ctx.clearRect(0, 0, w, h);
    if (S.heatOn) paintHeat(ctx, w, h);
    paintZones(ctx, w, h, k, zoneCounts);
    if (S.line) paintLine(ctx, S.line, w, h, k);
    for (const t of lastSeen) {
      const b = t.box, fl = t.flash && t.flash.until > now ? t.flash.dir : null;
      ctx.strokeStyle = fl === "in" ? "#2a78d6" : fl === "out" ? "#eb6834" : "#ffffff";
      ctx.lineWidth = (fl ? 4 : 2) * k;
      ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);
      label(ctx, `#${t.id}${fl ? (fl === "in" ? " เข้า" : " ออก") : ""}`, b.x * w, Math.max(0, b.y * h - 18 * k), fl === "in" ? "#2a78d6" : fl === "out" ? "#eb6834" : "#0e1430", k);
      const f = foot(b); ctx.fillStyle = "#8b7bff"; ctx.beginPath(); ctx.arc(f.x * w, f.y * h, 4 * k, 0, Math.PI * 2); ctx.fill();
    }
    if (drag) {
      ctx.strokeStyle = "#8b7bff"; ctx.lineWidth = 2 * k; ctx.setLineDash([5 * k, 4 * k]);
      if (tool === "line") { ctx.beginPath(); ctx.moveTo(drag.a.x * w, drag.a.y * h); ctx.lineTo(drag.b.x * w, drag.b.y * h); ctx.stroke(); }
      else { const r = normRect(drag.a, drag.b); ctx.strokeRect(r.x * w, r.y * h, r.w * w, r.h * h); }
      ctx.setLineDash([]);
    }
  }

  // ---- วาดเส้น/โซนด้วยการลาก ----
  // วาดด้วยนิ้วหรือเมาส์ (Pointer Events + touch-action:none บนแคนวาสขณะเลือกเครื่องมือ)
  const ptOf = e => { const r = overlay.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) }; };
  overlay.addEventListener("pointerdown", e => {
    if (tool === "none") return;
    if (!e.isPrimary) return;
    e.preventDefault(); overlay.setPointerCapture?.(e.pointerId); const p = ptOf(e); drag = { a: p, b: p }; draw();
  });
  overlay.addEventListener("pointermove", e => { if (drag && e.isPrimary) { e.preventDefault(); drag.b = ptOf(e); draw(); } });
  overlay.addEventListener("pointerup", e => {
    if (!drag) return;
    drag.b = ptOf(e);
    const { a, b } = drag; drag = null;
    if (tool === "line" && Math.hypot(b.x - a.x, b.y - a.y) > 0.03) {
      S.line = { a, b }; lineMem = {}; persistSettings();
      $("#drawMsg").textContent = "บันทึกเส้นนับแล้ว ลูกศรสีน้ำเงินคือทิศ \"เข้า\" กด \"สลับทิศ\" หากกลับด้าน";
    } else if (tool === "zone") {
      const r = normRect(a, b);
      if (r.w > 0.03 && r.h > 0.03) {
        const names = ["ชั้นวางสินค้า", "แคชเชียร์", "จุดรอคิว", "โปรโมชัน"];
        const name = names.find(n => !S.zones.some(z => z.name === n)) || `โซน ${S.zones.length + 1}`;
        S.zones.push({ id: "z" + Date.now().toString(36), name, queue: false, cashier: false, ...r });
        persistSettings(); renderZoneEditor();
        $("#drawMsg").textContent = `เพิ่มโซน "${name}" แล้ว แก้ชื่อและกำหนดเป็นโซนคิว/แคชเชียร์ได้ในรายการโซน`;
      }
    }
    draw(); renderDash();
  });
  overlay.addEventListener("pointercancel", () => { drag = null; draw(); });
  document.querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", () => {
    tool = b.dataset.tool;
    document.querySelectorAll("[data-tool]").forEach(x => x.setAttribute("aria-pressed", x === b));
    overlay.classList.toggle("drawing", tool !== "none");
    $("#drawMsg").textContent = { line: "ลากนิ้วหรือเมาส์บนภาพเพื่อวาดเส้นนับคนเข้า/ออก (เช่น ขวางประตู)", zone: "ลากนิ้วหรือเมาส์บนภาพเพื่อวาดสี่เหลี่ยมโซน", none: "" }[tool];
  }));

  // ---- รายการโซน ----
  function renderZoneEditor() {
    const box = $("#zoneList");
    if (!S.zones.length) { box.innerHTML = `<p class="hint">ยังไม่มีโซน เลือก "ลากโซน" แล้วลากบนภาพ</p>`; return; }
    box.innerHTML = S.zones.map(z => `<div class="zrow" data-id="${z.id}">
      <input class="zname" aria-label="ชื่อโซน" maxlength="30" value="${esc(z.name)}">
      <label class="chk"><input type="checkbox" data-flag="queue" ${z.queue ? "checked" : ""}>คิว</label>
      <label class="chk"><input type="checkbox" data-flag="cashier" ${z.cashier ? "checked" : ""}>แคชเชียร์</label>
      <button class="btn ghost danger" type="button" data-del aria-label="ลบโซน ${esc(z.name)}">ลบ</button></div>`).join("");
  }
  $("#zoneList").addEventListener("input", e => {
    const row = e.target.closest(".zrow"); if (!row) return;
    const z = S.zones.find(x => x.id === row.dataset.id);
    if (e.target.classList.contains("zname")) z.name = e.target.value.trim() || "โซน";
    persistSettings(); draw();
  });
  $("#zoneList").addEventListener("change", e => {
    const row = e.target.closest(".zrow"), flag = e.target.dataset.flag; if (!row || !flag) return;
    S.zones.forEach(z => { z[flag] = z.id === row.dataset.id ? e.target.checked : false; }); // มีได้โซนละหนึ่ง
    persistSettings(); renderZoneEditor(); draw(); renderDash();
  });
  $("#zoneList").addEventListener("click", e => {
    if (!e.target.matches("[data-del]")) return;
    const id = e.target.closest(".zrow").dataset.id;
    S.zones = S.zones.filter(z => z.id !== id); delete zoneLive[id];
    persistSettings(); renderZoneEditor(); draw(); renderDash();
  });

  // ---- แดชบอร์ด ----
  function renderDash() {
    const q = zoneBy("queue"), cz = zoneBy("cashier");
    const qi = q ? queueInfo(zoneCounts[q.id] || 0, S.serviceSec) : null;
    const conv = conversion(day, cz?.id);
    const occAlert = day.occ >= S.maxOcc, qAlert = qi && qi.length >= S.queueAlert;
    const tile = (k, v, s = "", cls = "") => `<div class="tile ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    $("#tiles").innerHTML =
      tile("เข้าวันนี้", day.in, "คน", "in") + tile("ออกวันนี้", day.out, "คน", "out") +
      tile("คนในร้านตอนนี้", day.occ, `สูงสุดที่ตั้งไว้ ${S.maxOcc} คน`, occAlert ? "hot" : "") +
      tile("สูงสุดวันนี้", day.peak, day.peakAt ? "เวลา " + fmtClock(day.peakAt) : "") +
      tile("คิวตอนนี้", qi ? `${qi.length} คน` : "—", qi ? `รอประมาณ ${fmtDur(qi.waitSec)}` : "ยังไม่กำหนดโซนคิว", qAlert ? "hot" : "") +
      tile("อัตราการซื้อโดยประมาณ", conv == null ? "—" : (conv * 100).toFixed(0) + "%", cz ? `เข้าโซน${esc(cz.name)} / คนเข้าร้าน` : "ยังไม่กำหนดโซนแคชเชียร์");
    const al = [];
    if (occAlert) al.push(`คนในร้านถึง ${day.occ} คน (เกินหรือเท่ากับที่กำหนด ${S.maxOcc} คน)`);
    if (qAlert) al.push(`คิวยาว ${qi.length} คน รอประมาณ ${fmtDur(qi.waitSec)} — ควรเปิดจุดชำระเงินเพิ่ม`);
    $("#alerts").innerHTML = al.map(a => `<div class="alert">${esc(a)}</div>`).join("");
    $("#zoneTable").innerHTML = `<thead><tr><th>โซน</th><th class="n">อยู่ตอนนี้</th><th class="n">เข้าวันนี้ (ครั้ง)</th><th class="n">เวลาอยู่เฉลี่ย</th></tr></thead><tbody>` +
      (S.zones.length ? S.zones.map(z => { const zs = day.zones[z.id]; return `<tr><td>${esc(z.name)}${z.queue ? " <span class=\"tag q\">คิว</span>" : ""}${z.cashier ? " <span class=\"tag c\">แคชเชียร์</span>" : ""}</td><td class="n">${zoneCounts[z.id] || 0}</td><td class="n">${zs?.visits || 0}</td><td class="n">${zs?.dwellN ? fmtDur(avgDwellSec(zs)) : "—"}</td></tr>`; }).join("")
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

  // ---- ฮีตแมป (พื้นหลังเรียบ ไม่มีภาพคน) ----
  function renderHeatImage(c, w, h, withLegend) {
    c.width = w; c.height = h;
    const ctx = c.getContext("2d"), k = w / 640;
    ctx.fillStyle = "#eef2f5"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#dde5ea"; ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += w / 16) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += h / 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    paintHeat(ctx, w, h);
    paintZones(ctx, w, h, k, null);
    if (S.line) paintLine(ctx, S.line, w, h, k);
    if (withLegend) {
      ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.fillRect(10 * k, h - 40 * k, 250 * k, 30 * k);
      for (let i = 0; i < 100; i++) { const [r, g, b] = heatColor(i / 99); ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(16 * k + i * k, h - 30 * k, k + 1, 10 * k); }
      ctx.fillStyle = "#16303f"; ctx.font = `${11 * k}px Prompt, sans-serif`; ctx.textBaseline = "middle";
      ctx.fillText(`น้อย → มาก · ฮีตแมปตำแหน่งยืน ${day.date}`, 122 * k, h - 25 * k);
    }
  }
  const heatSize = () => { const ar = video.videoWidth ? video.videoWidth / video.videoHeight : 4 / 3; return [1280, Math.round(1280 / ar)]; };
  function drawHeatPreview() { const [w, h] = heatSize(); renderHeatImage($("#heatPreview"), w / 2, h / 2, false); }
  $("#heatOn").checked = S.heatOn;
  $("#heatOn").addEventListener("change", e => { S.heatOn = e.target.checked; persistSettings(); draw(); });
  $("#heatReset").addEventListener("click", () => { heat.data.fill(0); persistHeat(); draw(); drawHeatPreview(); });
  $("#heatPng").addEventListener("click", () => {
    const c = document.createElement("canvas"), [w, h] = heatSize();
    renderHeatImage(c, w, h, true);
    c.toBlob(b => download(b, `heatmap-${day.date}.png`), "image/png");
  });
  function download(blob, name) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---- ปุ่มต่าง ๆ / ตั้งค่า ----
  $("#startCam").addEventListener("click", startCamera);
  $("#file").addEventListener("change", e => { const f = e.target.files[0]; if (f) startFile(f); e.target.value = ""; });
  $("#stop").addEventListener("click", () => { stopSource(); engine("หยุดวิเคราะห์แล้ว ข้อมูลสรุปถูกบันทึกไว้"); });
  $("#swap").addEventListener("click", () => { S.swap = !S.swap; persistSettings(); draw(); $("#drawMsg").textContent = "สลับทิศเข้า/ออกแล้ว"; });
  $("#clearLine").addEventListener("click", () => { S.line = null; lineMem = {}; persistSettings(); draw(); drawHeatPreview(); });
  $("#resetOcc").addEventListener("click", () => { day.occ = 0; persistDay(); renderDash(); });
  const sf = $("#settingsForm");
  ["maxOcc", "serviceSec", "queueAlert", "detW"].forEach(k => { sf[k].value = S[k]; });
  sf.addEventListener("input", e => {
    const v = Math.round(+e.target.value);
    if (!(v > 0)) { $("#setMsg").textContent = "กรุณาใส่ตัวเลขมากกว่า 0"; $("#setMsg").className = "form-msg err"; return; }
    S[e.target.name] = v; persistSettings(); renderDash();
    $("#setMsg").textContent = "บันทึกแล้ว"; $("#setMsg").className = "form-msg ok";
  });
  sf.addEventListener("submit", e => e.preventDefault());

  const allDays = () => Object.keys(localStorage).filter(k => k.startsWith(P + "day-")).sort()
    .map(k => k === P + "day-" + day.date ? day : Object.assign(newDay(k.slice(P.length + 4)), load(k.slice(P.length), {})));
  $("#exportCsv").addEventListener("click", () => {
    persistDay();
    download(new Blob([buildCsv(allDays(), zoneBy("cashier")?.id)], { type: "text/csv;charset=utf-8" }), `store-analytics-${day.date}.csv`);
  });
  $("#clearData").addEventListener("click", () => {
    if (!confirm("ลบสถิติทุกวันและฮีตแมปทั้งหมด? (การตั้งค่าเส้นและโซนยังอยู่)")) return;
    Object.keys(localStorage).filter(k => k.startsWith(P + "day-") || k === P + "heat").forEach(k => localStorage.removeItem(k));
    day = newDay(); heat.data.fill(0); zoneLive = {};
    renderDash(); draw(); engine("ลบข้อมูลสถิติแล้ว", "ok");
  });
  $("#printNotice").addEventListener("click", () => {
    const w = window.open("", "_blank", "width=700,height=500");
    if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>ป้ายแจ้งความเป็นส่วนตัว</title><body style="font-family:Prompt,sans-serif;padding:40px;font-size:22px;line-height:1.7"><h2>ประกาศความเป็นส่วนตัว (PDPA)</h2><p>${esc($("#notice").textContent)}</p></body>`);
    w.document.close(); w.focus(); w.print();
  });

  let rsT = 0; const onResize = () => { clearTimeout(rsT); rsT = setTimeout(() => { sizeOverlay(); renderDash(); }, 120); };
  window.addEventListener("resize", onResize); window.addEventListener("orientationchange", onResize);
  window.addEventListener("beforeunload", () => { closeZones(zoneLive, day); persistDay(); persistHeat(); });
  setInterval(() => { if (!running && dayKey() !== day.date) { day = newDay(); renderDash(); } }, 60000);

  renderZoneEditor(); sizeOverlay(); renderDash();
  if (window.isSecureContext) engine("พร้อม — กด \"เปิดกล้อง\" หรือ \"ใช้ไฟล์วิดีโอทดสอบ\" แล้ววาดเส้นนับและโซนบนภาพ");
  else { engine(INSECURE_MSG + " (ไฟล์วิดีโอทดสอบยังใช้ได้)", "warn"); const a = document.createElement("a"); a.href = "cameras.html"; a.className = "engine-link"; a.textContent = "ดูวิธี"; $("#engine").append(" ", a); }
})();
