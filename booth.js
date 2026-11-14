/* วิเคราะห์ผู้เข้าชมบูธ — นับคน จำผู้เข้าชมแบบไม่ระบุตัวตน (ค่าลักษณะใบหน้าอยู่ในหน่วยความจำ/แท็บนี้ภายในวัน ไม่เก็บภาพ) */

// ================= ส่วนคำนวณ (ไม่ใช้ DOM ทดสอบแยกได้) =================
const EMO = ["neutral", "happy", "surprised", "sad", "angry", "fearful", "disgusted"];
const EMO_TH = { neutral: "เฉย ๆ", happy: "มีความสุข", surprised: "ประหลาดใจ", sad: "เศร้า", angry: "โกรธ", fearful: "กลัว", disgusted: "รังเกียจ" };
const VA = { neutral: [0, 0], happy: [0.8, 0.5], surprised: [0.2, 0.85], sad: [-0.7, -0.4], angry: [-0.7, 0.6], fearful: [-0.6, 0.7], disgusted: [-0.7, 0.3] };
const LQT = typeof LQTrack !== "undefined" ? LQTrack : typeof require === "function" ? require("./lensiq-track.js") : null;
/* โหมดจำผู้เข้าชม (round 10): ใช้กฎเดียวกับหน้าจดจำลูกค้า LQTrack.FACE_RULES — ระยะสูงสุด maxDist (0.50) และ margin (0.09):
   ใบหน้าที่ใกล้ผู้เข้าชมสองคนพอ ๆ กัน (อันดับ 1 กับ 2 ห่างกันน้อยกว่า MARGIN) ถือว่ากำกวม ไม่รวมเข้ากับใคร (นับเป็นคนใหม่ดีกว่ารวมคนสองคน)
   โหมดนับอย่างเดียวไม่ใช้ค่าลักษณะใบหน้าจึงไม่ได้รับผล */
const FACE_RULES = (LQT && LQT.FACE_RULES) || { maxDist: 0.5, margin: 0.09 };
const CFG = {
  MATCH: FACE_RULES.maxDist, // ระยะห่างค่าลักษณะใบหน้าที่ถือว่าเป็นคนเดิม (LQTrack.FACE_RULES.maxDist)
  MARGIN: FACE_RULES.margin, // อันดับ 2 ต้องไกลกว่าอันดับ 1 อย่างน้อยเท่านี้ (LQTrack.FACE_RULES.margin)
  PROMOTE_MS: 1000,    // เห็นต่อเนื่องอย่างน้อย 1 วิ จึงนับเป็นผู้เข้าชม
  CAND_TTL_MS: 3000,   // ใบหน้าที่ยังไม่ยืนยัน หายไปเกินนี้ทิ้ง
  RETURN_GAP_MS: 60000,// หายไปเกิน 60 วิแล้วกลับมา = กลับมาเยี่ยมซ้ำ
  MAX_STEP_MS: 2000,   // ช่วงห่างสูงสุดที่ยังนับรวมเป็นเวลาอยู่หน้าบูธ
  STOP_S: 5,           // หยุดชมตั้งแต่ 5 วิขึ้นไป
  ENGAGE_S: 30,        // อยู่ที่บูธตั้งแต่ 30 วิขึ้นไป (ขั้นที่ 3 ของกรวยความสนใจ)
  TIMELINE_MS: 5000,   // ความละเอียดกราฟจำนวนคนในกล้อง
  YAW_LIMIT: 0.35,
  MAX_FACES: 6,        // วิเคราะห์ไม่เกิน 6 ใบหน้าต่อภาพ (ใหญ่สุดก่อน)
  RECHECK_EVERY: 10,   // ตรวจตัวตนของแทร็กที่ผูกแล้วซ้ำทุก 10 ภาพ
  TRACK_EMA: 0.3       // ค่าเฉลี่ยค่าลักษณะใบหน้าต่อแทร็ก (เก็บในหน่วยความจำเท่านั้น)
};
const DWELL_BUCKETS = [[0, 5, "< 5 วิ"], [5, 15, "5–15 วิ"], [15, 30, "15–30 วิ"], [30, 60, "30–60 วิ"], [60, 180, "1–3 นาที"], [180, Infinity, "> 3 นาที"]];
/* lensiq-sitecheck.js: สุขภาพภาพ/ธงคุณภาพรายชั่วโมง (เบราว์เซอร์: window.LQSite · Node: require ; ไม่มีไฟล์ = ข้ามส่วนนี้) */
const SITECHK = typeof window !== "undefined" && /** @type {any} */ (window).LQSite ? /** @type {any} */ (window).LQSite : typeof require === "function" ? (() => { try { return require("./lensiq-sitecheck.js"); } catch { return null; } })() : null;
/* ชั่วโมงที่สุขภาพภาพมีปัญหารวม ≥ 5 นาที (S.quality = {[ชั่วโมง]: {n, shake, dark, backlight, slow, offline, image}} หน่วยวินาที) -> {h: ข้อความ} */
function qualityFlags(S) {
  const out = {};
  if (!SITECHK || !S || !S.quality) return out;
  for (const f of SITECHK.flaggedHours(S.quality)) out[f.h] = SITECHK.qualityText(f) || SITECHK.fmt("มีปัญหาภาพ {a} นาที", { a: f.min });
  return out;
}

const dayKey = (ts = Date.now()) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function dist(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }
function blend(a, b, w) { return Array.from(a, (x, i) => +(x * (1 - w) + b[i] * w).toFixed(4)); }

function newState(name = "", date = dayKey()) {
  return { event: { name, date }, seq: 0, visitors: [], timeline: [], desc: {}, descDay: dayKey(), cands: [], quality: {} };
}

/* สถานะระหว่างทำงาน (ไม่บันทึกลงที่เก็บข้อมูล): ตัวติดตามตำแหน่งใบหน้า + แทร็ก -> ผู้เข้าชม + ค่าเฉลี่ยค่าลักษณะใบหน้าต่อแทร็ก
 * หลายกล้อง: ตัวติดตามแยกต่อกล้อง (runtime(S, slot)) แต่ผู้เข้าชม/ค่าลักษณะใบหน้า (S.visitors, S.desc, S.cands) ใช้ร่วมกัน
 * คนเดียวกันที่กล้องสองตัวเห็นจึงจับคู่ได้กับ V### เดิม (ระยะ < CFG.MATCH) และนับครั้งเดียว — เฉพาะภายในแท็บ/วันนี้เท่านั้น */
const RUNTIME = new WeakMap();
function newRuntime() { return { T: LQT.newTracker(/** @type {any} */ (LQT.PRESET.face)), bind: new Map(), desc: new Map(), cand: new Map(), frame: 0 }; }
function runtime(S, cam = "") {
  let M = RUNTIME.get(S); if (!M) { M = new Map(); RUNTIME.set(S, M); }
  let R = M.get(cam); if (!R) { R = newRuntime(); M.set(cam, R); }
  return R;
}
function dropRuntime(S, cam = "") { const M = RUNTIME.get(S); if (M) M.delete(cam); }

/* ใกล้สุดภายใน MATCH และอันดับสองห่างออกไปอย่างน้อย MARGIN — ไม่เช่นนั้นถือว่ากำกวม (null) */
function nearest(map, desc, used) {
  let best = null, bd = Infinity, sd = Infinity;
  for (const id in map) { if (used.has(id)) continue; const d = dist(map[id], desc); if (d < bd) { sd = bd; bd = d; best = id; } else if (d < sd) sd = d; }
  return bd < CFG.MATCH && sd - bd >= CFG.MARGIN ? best : null;
}
/* ผู้รอยืนยันที่ใกล้ที่สุด (เดิมใช้ตัวแรกที่เข้าเกณฑ์) — กำกวม (สองรายใกล้พอ ๆ กัน) = ไม่รวม */
function nearestCand(cands, desc, used) {
  let best = null, bd = Infinity, sd = Infinity;
  for (const c of cands) { if (used.has(c) || !c.desc) continue; const d = dist(c.desc, desc); if (d < bd) { sd = bd; bd = d; best = c; } else if (d < sd) sd = d; }
  return bd < CFG.MATCH && sd - bd >= CFG.MARGIN ? best : null;
}

/* cam: ช่องกล้อง ('c1'..) -> v.cams[cam] = {f: เห็นครั้งแรก, l: ล่าสุด, d: วินาทีที่กล้องนี้เห็น} (ตัวเลขเท่านั้น)
 * primary=false (กล้องเสริม): นับตัวตนและเวลาอยู่ในพื้นที่บูธ แต่ไม่นับการมอง/สีหน้า (วัดจากกล้องหลักหน้าบูธเท่านั้น) */
function touchVisitor(v, f, now, cam = "", primary = true) {
  const gap = now - v.last;
  if (gap > CFG.RETURN_GAP_MS) { v.visits++; v.arrivals.push(now); }
  else if (gap > 0) v.dwell += Math.min(gap, CFG.MAX_STEP_MS) / 1000;
  v.last = Math.max(v.last, now);
  if (cam) {
    const C = v.cams || (v.cams = {}), e = C[cam] || (C[cam] = { f: now, l: now, d: 0 }), g = now - e.l;
    if (g > 0 && g <= CFG.RETURN_GAP_MS) e.d = +(e.d + Math.min(g, CFG.MAX_STEP_MS) / 1000).toFixed(2);
    e.l = Math.max(e.l, now);
  }
  if (!primary) return;
  v.frames++;
  if (f.att) v.att++;
  f.e.forEach((p, i) => { v.emo[i] += p; });
  v.vSum += f.v;
}

function promote(S, c, now) {
  const id = "V" + String(++S.seq).padStart(3, "0");
  const v = { id, first: c.first, last: c.first, dwell: 0, visits: 1, arrivals: [c.first], frames: 0, att: 0, emo: EMO.map(() => 0), vSum: 0, acts: [] };
  const step = (now - c.first) / Math.max(1, c.obs.length);
  c.obs.forEach((o, k) => touchVisitor(v, o.f || o, c.first + step * (k + 1), o.cam || "", o.primary !== false));
  S.visitors.push(v); if (c.desc) S.desc[id] = c.desc; // โหมดนับอย่างเดียว: ไม่มีค่าลักษณะใบหน้า
  S.cands = S.cands.filter(x => x !== c);
  return id;
}

/* รับผลตรวจจับหนึ่งรอบ faces=[{desc,e,v,att,area,box:{x,y,w,h} 0..1,score?}]
 * คืน [{id|null, face, tid, confirmed, box}] เฉพาะใบหน้าที่วิเคราะห์ (ไม่เกิน MAX_FACES)
 * ตำแหน่ง (แทร็ก) เป็นตัวยึดตัวตน: ค้นค่าลักษณะใบหน้า (nearest) เฉพาะแทร็กใหม่ แทร็กที่ยังไม่ผูก หรือทุก RECHECK_EVERY ภาพ */
/* โหมด "นับอย่างเดียว" (count-only, DPIA R2): ไม่ใช้ค่าลักษณะใบหน้าเลย — ตัวตน = แทร็กตำแหน่งในภาพของกล้องนี้
 * (ตัวติดตามมีคลังแทร็กที่หายไปไม่เกิน COUNT_LOST_MS เพื่อต่อแทร็กเมื่อถูกบังชั่วครู่) ; เห็นต่อเนื่อง PROMOTE_MS = ผู้เข้าชม
 * ข้อจำกัด: คนที่ออกไปแล้วกลับมา หรือคนเดียวกันที่กล้องสองตัวเห็น นับเป็นผู้เข้าชมใหม่ (นับเกินได้) */
const COUNT_TRACK = Object.freeze({ ...LQT.PRESET.face, LOST_TTL_MS: 4000, REVIVE_DIST: 0.15 });
function observeCount(S, faces, now, R, opts) {
  const cam = opts.cam || "", primary = opts.primary !== false;
  R.frame++;
  const kept = faces.map((f, i) => i).sort((a, b) => faces[b].area - faces[a].area).slice(0, CFG.MAX_FACES);
  const dets = kept.map(i => { const b = faces[i].box || { x: 0, y: 0, w: 0, h: 0 }; return { x: b.x, y: b.y, w: b.w, h: b.h, score: faces[i].score == null ? 1 : faces[i].score, fi: i }; });
  const { seen, removed } = LQT.updateTracker(R.T, dets, now, COUNT_TRACK);
  for (const tid of removed) { R.bind.delete(tid); R.cand.delete(tid); }
  const hasV = id => S.visitors.some(v => v.id === id), out = [];
  for (const t of seen) {
    const f = faces[t.det.fi];
    let id = R.bind.get(t.id) || null;
    if (id && hasV(id)) touchVisitor(S.visitors.find(x => x.id === id), f, now, cam, primary);
    else {
      id = null;
      let c = R.cand.get(t.id);
      if (!c) { c = { desc: null, first: now, last: now, obs: [] }; R.cand.set(t.id, c); }
      c.last = now;
      if (c.obs.length < 50) c.obs.push({ f, cam, primary });
      if (now - c.first >= CFG.PROMOTE_MS) { id = promote(S, c, now); R.bind.set(t.id, id); R.cand.delete(t.id); }
    }
    out.push({ id, face: f, tid: t.id, confirmed: !!t.confirmed, box: t.box });
  }
  if (opts.timeline !== false) noteTimeline(S, out.filter(r => r.id && r.confirmed).length, now);
  return out;
}

function observe(S, faces, now, R = runtime(S), opts = {}) {
  if (opts.countOnly) return observeCount(S, faces, now, R, opts);
  const cam = opts.cam || "", primary = opts.primary !== false;
  R.frame++;
  const kept = faces.map((f, i) => i).sort((a, b) => faces[b].area - faces[a].area).slice(0, CFG.MAX_FACES);
  const dets = kept.map(i => { const b = faces[i].box || { x: 0, y: 0, w: 0, h: 0 }; return { x: b.x, y: b.y, w: b.w, h: b.h, score: faces[i].score == null ? 1 : faces[i].score, fi: i }; });
  const { seen, born, removed } = LQT.updateTracker(R.T, dets, now);
  for (const tid of removed) { R.bind.delete(tid); R.desc.delete(tid); R.cand.delete(tid); }
  const isBorn = new Set(born.map(t => t.id)), recheck = R.frame % CFG.RECHECK_EVERY === 0;
  const hasV = id => S.visitors.some(v => v.id === id);
  for (const t of seen) {
    const f = faces[t.det.fi], p = R.desc.get(t.id);
    R.desc.set(t.id, p ? blend(p, f.desc, CFG.TRACK_EMA) : Array.from(f.desc));
  }
  // 1) แทร็กที่ผูกแล้วและไม่ถึงรอบตรวจซ้ำ คงตัวตนเดิม
  const usedV = new Set(), need = [];
  for (const t of seen) {
    const vid = R.bind.get(t.id);
    if (vid && hasV(vid) && !isBorn.has(t.id) && !recheck && !usedV.has(vid)) usedV.add(vid);
    else need.push(t);
  }
  // 2) ที่เหลือจับคู่กับผู้เข้าชมที่รู้จักแบบไม่ซ้ำกัน ระยะใกล้สุดก่อน
  const pairs = [];
  need.forEach((t, k) => {
    const d = R.desc.get(t.id), mine = [];
    let b1 = Infinity, b2 = Infinity;
    for (const id in S.desc) { if (usedV.has(id)) continue; const dd = dist(S.desc[id], d); if (dd < b1) { b2 = b1; b1 = dd; } else if (dd < b2) b2 = dd; if (dd < CFG.MATCH) mine.push({ i: k, key: id, dist: dd }); }
    if (b2 - b1 >= CFG.MARGIN) pairs.push(...mine); // กำกวม: ไม่จับคู่กับผู้เข้าชมคนใดเลย
  });
  const got = LQT.assignUnique(pairs, CFG.MATCH);
  for (const g of got.values()) usedV.add(g.key);
  need.forEach((t, k) => {
    const g = got.get(k);
    if (g) {
      R.bind.set(t.id, g.key);
      const c = R.cand.get(t.id); if (c) { S.cands = S.cands.filter(x => x !== c); R.cand.delete(t.id); }
      return;
    }
    const prev = R.bind.get(t.id);
    if (prev && hasV(prev) && !usedV.has(prev)) usedV.add(prev); // ค่าใบหน้าเปลี่ยน (หันหน้า/เบลอ) แต่ตำแหน่งต่อเนื่อง = คนเดิม
    else R.bind.delete(t.id);
  });
  // 3) อัปเดตผู้เข้าชม / ผู้รอยืนยัน
  const usedC = new Set(), out = [];
  for (const t of seen) {
    const f = faces[t.det.fi], d = R.desc.get(t.id);
    let id = R.bind.get(t.id) || null;
    if (id) {
      touchVisitor(S.visitors.find(x => x.id === id), f, now, cam, primary);
      S.desc[id] = S.desc[id] ? blend(S.desc[id], d, 0.1) : Array.from(d);
    } else {
      let c = R.cand.get(t.id);
      if (c && (!S.cands.includes(c) || usedC.has(c))) c = null;
      if (!c) c = nearestCand(S.cands, d, usedC);
      if (!c) { c = { desc: Array.from(d), first: now, last: now, obs: [] }; S.cands.push(c); }
      usedC.add(c); R.cand.set(t.id, c);
      c.last = now; c.desc = blend(c.desc, f.desc, 0.3);
      if (c.obs.length < 50) c.obs.push({ f, cam, primary });
      if (now - c.first >= CFG.PROMOTE_MS) { id = promote(S, c, now); R.bind.set(t.id, id); R.cand.delete(t.id); }
    }
    out.push({ id, face: f, tid: t.id, confirmed: !!t.confirmed, box: t.box });
  }
  S.cands = S.cands.filter(c => now - c.last < CFG.CAND_TTL_MS);
  // กราฟจำนวนคน: นับเฉพาะแทร็กที่ยืนยันแล้วและผูกกับผู้เข้าชม (หลายกล้อง: หน้าเว็บนับรวมแบบไม่ซ้ำแล้วเรียก noteTimeline เอง)
  if (opts.timeline !== false) noteTimeline(S, out.filter(r => r.id && r.confirmed).length, now);
  return out;
}
function noteTimeline(S, n, now) {
  const slot = Math.floor(now / CFG.TIMELINE_MS) * CFG.TIMELINE_MS, last = S.timeline.at(-1);
  if (last && last.t === slot) last.n = Math.max(last.n, n);
  else S.timeline.push({ t: slot, n });
  if (S.timeline.length > 20000) S.timeline.splice(0, S.timeline.length - 20000);
}
const inFrameCount = res => res.filter(r => r.id && r.confirmed).length;
/* จำนวนคนในกล้องรวมทุกตัวแบบไม่ซ้ำ: frames = [[{id, confirmed}], ...] ต่อกล้อง */
const inFrameUnion = frames => new Set(frames.flatMap(res => res.filter(r => r.id && r.confirmed).map(r => r.id))).size;

/* บทบาทกล้อง: มีกล้องหลัก (หน้าบูธ) หนึ่งตัวเสมอ ที่เหลือเป็นกล้องเสริม — คงกล้องหลักตัวแรกที่ตั้งไว้ ไม่มีก็ใช้ตัวแรก */
function normalizeRoles(cams) {
  const list = (cams || []).filter(Boolean);
  const pi = Math.max(0, list.findIndex(c => c.role === "primary"));
  return list.map((c, i) => ({ slot: c.slot, role: i === pi ? "primary" : "aux" }));
}

/* สถิติต่อกล้อง (โซน) + ผู้เข้าชมที่กล้องมากกว่าหนึ่งตัวเห็น (นับครั้งเดียวในยอดรวม) */
function camStats(S, cams, inFrameBySlot = {}) {
  const V = S.visitors;
  const rows = (cams || []).map(c => {
    const seen = V.filter(v => v.cams && v.cams[c.slot]), d = seen.map(v => v.cams[c.slot].d || 0);
    return { slot: c.slot, name: c.name || c.slot, role: c.role || "aux", unique: seen.length, avgDwell: d.length ? d.reduce((s, x) => s + x, 0) / d.length : 0, stopped: d.filter(x => x >= CFG.STOP_S).length, inFrame: inFrameBySlot[c.slot] || 0 };
  });
  return { rows, unique: V.length, multi: V.filter(v => v.cams && Object.keys(v.cams).length > 1).length };
}
/* ผู้เข้าชมใหม่รายชั่วโมงของแต่ละกล้อง (จากครั้งแรกที่กล้องนั้นเห็น) */
function hourlyByCam(S, slots) {
  const out = {};
  for (const s of slots) { const h = Array(24).fill(0); S.visitors.forEach(v => { const e = v.cams && v.cams[s]; if (e) h[new Date(e.f).getHours()]++; }); out[s] = h; }
  return out;
}

/* จุดที่แตะบนภาพ (0..1 พิกัดภาพจริง ไม่กลับด้าน) -> กรอบที่ถูกแตะ (กรอบเล็กสุดที่ครอบจุด หรือกรอบที่ใกล้ที่สุดในระยะ 0.08) */
function hitBox(frame, fx, fy, slack = 0.08) {
  let best = null, ba = Infinity;
  for (const r of frame) { const b = r.box; if (fx >= b.x && fx <= b.x + b.w && fy >= b.y && fy <= b.y + b.h && b.w * b.h < ba) { ba = b.w * b.h; best = r; } }
  if (best) return best;
  let bd = slack;
  for (const r of frame) { const b = r.box, d = Math.hypot(fx - Math.max(b.x, Math.min(fx, b.x + b.w)), fy - Math.max(b.y, Math.min(fy, b.y + b.h))); if (d <= bd) { bd = d; best = r; } }
  return best;
}

function visitorStats(v) {
  const emoAvg = v.emo.map(x => v.frames ? x / v.frames : 0);
  const dom = EMO[emoAvg.indexOf(Math.max(...emoAvg))];
  const attRate = v.frames ? v.att / v.frames : 0;
  const stopped = v.dwell >= CFG.STOP_S;
  return { dom, attRate, valence: v.frames ? v.vSum / v.frames : 0, stopped, engaged: stopped && attRate >= 0.5, expressive: 1 - emoAvg[0] };
}

function aggregate(S, now = Date.now(), currentInFrame = 0) {
  const V = S.visitors, st = V.map(visitorStats);
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const hours = {};
  V.forEach(v => { const h = new Date(v.first).getHours(); hours[h] = (hours[h] || 0) + 1; });
  const hs = Object.keys(hours).map(Number);
  const h0 = hs.length ? Math.min(...hs, 9) : 9, h1 = hs.length ? Math.max(...hs, 18) : 18;
  const qf = qualityFlags(S);
  const hourly = []; for (let h = h0; h <= h1; h++) hourly.push({ label: String(h).padStart(2, "0") + ":00", value: hours[h] || 0, flag: qf[h] || null });
  const emoCount = EMO.map(k => ({ label: EMO_TH[k], value: st.filter(s => s.dom === k).length }));
  const dwellHist = DWELL_BUCKETS.map(([a, b, label]) => ({ label, value: V.filter(v => v.dwell >= a && v.dwell < b).length }));
  const acts = {};
  V.forEach(v => v.acts.forEach(a => { acts[a] = (acts[a] || 0) + 1; }));
  return {
    unique: V.length,
    inFrame: currentInFrame,
    returning: V.filter(v => v.visits > 1).length,
    avgDwell: avg(V.map(v => v.dwell)),
    stopped: st.filter(s => s.stopped).length,
    passers: st.filter(s => !s.stopped).length,
    engaged: st.filter(s => s.engaged).length,
    participants: V.filter(v => v.acts.length).length,
    // กรวยความสนใจ: ผ่าน (กล้องเห็น ≥ 1 วิ) -> หยุดชม ≥ 5 วิ -> อยู่ ≥ 30 วิ -> ร่วมกิจกรรม
    funnel: { passed: V.length, stopped: V.filter(v => v.dwell >= CFG.STOP_S).length, engaged: V.filter(v => v.dwell >= CFG.ENGAGE_S).length, joined: V.filter(v => v.acts.length).length },
    valence: avg(st.map(s => s.valence)),
    hourly, emoCount, dwellHist, acts,
    timeline: S.timeline
  };
}

function markActivity(S, id, activity) {
  const v = S.visitors.find(x => x.id === id);
  if (!v) return "notfound";
  if (v.acts.includes(activity)) return "already";
  v.acts.push(activity); return "ok";
}

/* ส่งออกสถิติรวมเท่านั้น (ไม่มีรหัสผู้เข้าชม ไม่มีข้อมูลรายคน ไม่เก็บข้อมูลติดต่อ) */
function buildStatsCsv(S, cams = [], now = Date.now(), expr = true) {
  const m = aggregate(S, now, 0), cs = camStats(S, cams), f = m.funnel, pct = n => f.passed ? (n / f.passed * 100).toFixed(1) : "0.0";
  // quality_flag (round 10): ปัญหาภาพของชั่วโมงนั้น (≥ 5 นาที) — ยอดไม่ถูกแก้ ใช้ประกอบการอ่านตัวเลขเท่านั้น
  const out = [["section", "key", "label", "value", "pct_of_passed", "quality_flag"]], qf = qualityFlags(S);
  const row = (...r) => out.push(r);
  row("event", "name", S.event.name || "", S.event.date || "", "");
  row("summary", "unique", "ผู้เข้าชมไม่ซ้ำ (ทุกกล้อง)", m.unique, "");
  row("summary", "returning", "กลับมาซ้ำ", m.returning, "");
  row("summary", "avg_dwell_s", "เวลาเฉลี่ย (วินาที)", m.avgDwell.toFixed(1), "");
  row("summary", "avg_valence", "Valence เฉลี่ย", expr ? m.valence.toFixed(3) : "", ""); // expr=false: customer mode, not measured
  row("summary", "seen_by_2plus_cams", "เห็นมากกว่า 1 กล้อง (นับครั้งเดียว)", cs.multi, "");
  [["passed", "ผ่าน"], ["stopped", "หยุดชม ≥ 5 วิ"], ["engaged", "อยู่ ≥ 30 วิ"], ["joined", "ร่วมกิจกรรม"]].forEach(([k, l]) => row("funnel", k, l, f[k], pct(f[k])));
  m.hourly.forEach(h => row("hourly", h.label, "ผู้เข้าชมใหม่", h.value, "", h.flag || ""));
  const hb = hourlyByCam(S, cams.map(c => c.slot));
  cs.rows.forEach(r => {
    row("camera", r.slot, r.name, r.unique, pct(r.unique));
    row("camera_avg_dwell_s", r.slot, r.name, r.avgDwell.toFixed(1), "");
    row("camera_stopped", r.slot, r.name, r.stopped, "");
    hb[r.slot].forEach((n, h) => { if (n) row("camera_hourly", `${r.slot}@${String(h).padStart(2, "0")}:00`, r.name, n, "", qf[h] || ""); });
  });
  m.dwellHist.forEach(d => row("dwell", d.label, "คน", d.value, ""));
  m.emoCount.forEach(e => row("expression", e.label, "คน", e.value, ""));
  Object.entries(m.acts).forEach(([a, n]) => row("activity", a, "คน", n, pct(n)));
  if (SITECHK) for (const f of SITECHK.flaggedHours(S.quality)) row("quality_hour", String(f.h).padStart(2, "0") + ":00", "ชั่วโมงที่ภาพจากกล้องมีปัญหา ≥ 5 นาที (ยอดอาจคลาดเคลื่อน ข้อมูลยังเก็บครบ)", f.min, "", qf[f.h]);
  const cell = v => { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v) && isNaN(+v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
  return "\ufeff" + out.map(r => r.concat(Array(Math.max(0, 6 - r.length)).fill("")).map(cell).join(",")).join("\r\n");
}

function purgeFaces(S) { S.desc = {}; S.cands = []; S.descDay = dayKey(); RUNTIME.delete(S); }
function autoPurge(S, now = Date.now()) { if (S.descDay !== dayKey(now)) { purgeFaces(S); S.descDay = dayKey(now); return true; } return false; }

/* ความเป็นส่วนตัว: 'booth-state' ใน localStorage ไม่มี desc เลยทุกโหมด
 * ค่าลักษณะใบหน้าของแท็บนี้อยู่ใน sessionStorage 'booth-desc' (หายเมื่อปิดแท็บ)
 * remember=true -> เพิ่มสำเนา {day, desc} ที่เข้ารหัส (lensiq-facevault.js) ใน localStorage 'lqv-booth-desc' ภายในวัน */
function serializeState(S, remember) {
  const { cands: _cands, desc, ...rest } = S;
  const d = { day: S.descDay, desc: desc || {} };
  return { state: JSON.stringify(rest), session: JSON.stringify(d), vault: remember ? d : null };
}
/* vault = {day, desc} ที่ถอดรหัสจาก 'lqv-booth-desc' แล้ว (ถ้ามี) ; desc ใน booth-state = ข้อมูลรุ่นเก่า (ไม่เข้ารหัส) */
function restoreState(lsRaw, ssRaw, remember, now = Date.now(), vault = null) {
  let S = null, ss = null;
  try { S = JSON.parse(lsRaw); } catch { S = null; }
  try { ss = JSON.parse(ssRaw); } catch { ss = null; }
  if (!S || typeof S !== "object" || !S.event) S = newState("", dayKey(now));
  if (!Array.isArray(S.visitors)) S.visitors = [];
  if (!Array.isArray(S.timeline)) S.timeline = [];
  if (!Number.isFinite(S.seq)) S.seq = S.visitors.length;
  if (!S.quality || typeof S.quality !== "object" || Array.isArray(S.quality)) S.quality = {};
  const legacy = S.desc && typeof S.desc === "object" ? S.desc : null;
  const sess = ss && ss.desc && typeof ss.desc === "object" && ss.day === S.descDay ? ss.desc : null;
  const enc = remember && vault && vault.desc && typeof vault.desc === "object" && vault.day === S.descDay ? vault.desc : null;
  // ค่าของแท็บนี้ก่อน แล้วจึงสำเนาที่เข้ารหัส (เมื่อเลือกจำ) ; ค่าเดิมรุ่นเก่าใน booth-state ถูกย้ายออกเมื่อบันทึกครั้งถัดไป
  S.desc = sess || enc || legacy || {};
  S.cands = [];
  autoPurge(S, now);
  return S;
}

// ================= ส่วนหน้าจอ =================
const HTTPS_MSG = "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด";
/* ข้อความเตือนเมื่อเปิดผ่าน http บนเครื่องอื่น (กล้องใช้ได้เฉพาะ https / localhost) */
function showHttpsNote(before) {
  if (window.isSecureContext || document.querySelector(".https-note")) return;
  const p = document.createElement("p"); p.className = "https-note"; p.setAttribute("role", "alert");
  p.innerHTML = `บนมือถือต้องเปิดผ่าน <b>https://</b> — ดูวิธีในหน้า <a href="cameras.html">ระบบทั้งหมด</a>`;
  before.before(p);
}

if (typeof document !== "undefined" && typeof faceapi !== "undefined" && typeof LQCam !== "undefined") (() => {
  const KEY = "booth-state", DESC_KEY = "booth-desc", PREF_KEY = "booth-prefs", VAULT_KEY = "lqv-booth-desc";
  const V = typeof LQVault !== "undefined" ? LQVault : null, vaultQ = V ? V.queue() : f => f();
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDur = s => s < 60 ? `${Math.round(s)} วิ` : `${Math.floor(s / 60)} นาที ${Math.round(s % 60)} วิ`;
  const fmtClock = ts => new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const TEST = typeof LQDetect !== "undefined" && LQDetect.isTest();
  const ssGet = k => { try { return sessionStorage.getItem(k); } catch { return null; } };

  // mode: "count" = นับอย่างเดียว ไม่ใช้ค่าลักษณะใบหน้า (ค่าเริ่มต้น — DPIA R2 เมื่อไม่ได้ขอความยินยอม) | "recognise" = จำผู้เข้าชมที่กลับมา
  let prefs = { v: 1, remember: false, mode: "count" };
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY)); if (p && typeof p === "object") { prefs.remember = p.remember === true; prefs.mode = p.mode === "recognise" ? "recognise" : "count"; if (typeof p.ackAt === "string" && !isNaN(Date.parse(p.ackAt))) prefs.ackAt = p.ackAt; } } catch {}
  const countOnly = () => prefs.mode !== "recognise";
  // round 16: customer mode (the default) never loads face_expression_model (F5); only the research demo toggle
  // (lensiq-research.js, per device, lockable by the operator) allows it. Counts, dwell and attention are unchanged.
  const EXPR_OK = () => window.LENSIQ_PROFILE === "demo" && /** @type {any} */ (window).LENSIQ_EXPRESSION === true;
  const EXPR_OFF_TH = "ปิดโมเดลสีหน้าในโหมดลูกค้า — ไม่วัดสีหน้าหลักและ Valence";
  if (countOnly()) prefs.remember = false; // นับอย่างเดียว = ไม่มีค่าใบหน้าให้จำ

  let S = restoreState(localStorage.getItem(KEY), ssGet(DESC_KEY), prefs.remember);
  if (countOnly() && (Object.keys(S.desc || {}).length || S.cands.length)) purgeFaces(S); // ค่าใบหน้าจากโหมดเดิม/รุ่นเก่า ลบทิ้ง
  let vaultPending = false; // มีงานเขียนสำเนาเข้ารหัสรออยู่แล้ว -> ไม่ต้องต่อคิวซ้ำ (เขียนค่าล่าสุดของ S ตอนถึงคิว)
  const persist = () => {
    const o = serializeState(S, prefs.remember);
    try { localStorage.setItem(KEY, o.state); } catch { engine("พื้นที่จัดเก็บเต็ม กรุณาส่งออกข้อมูลแล้วเริ่มงานใหม่", "err"); }
    try { sessionStorage.setItem(DESC_KEY, o.session); } catch {}
    if (!V) return;
    if (o.vault) {
      if (vaultPending) return;
      vaultPending = true;
      vaultQ(() => {
        vaultPending = false;
        const d = serializeState(S, prefs.remember).vault;
        if (!d) return;
        // ข้อมูลรายวันที่ลบเองทุกวันอยู่แล้ว: ซองเดิมที่ถอดไม่ได้ (กุญแจหาย) เขียนทับได้
        return V.write(VAULT_KEY, d, localStorage, { force: true }).catch(e => console.warn(e));
      });
    } else if (localStorage.getItem(VAULT_KEY) != null) vaultQ(() => V.wipe([VAULT_KEY]));
  };
  // จำผู้เข้าชม: ถอดรหัสสำเนาของวันนี้ (อยู่ในคิวก่อนการเขียนใด ๆ) แล้วใช้ ถ้าแท็บนี้ยังไม่มีค่าของตัวเอง
  if (V && prefs.remember) vaultQ(() => V.read(VAULT_KEY).then(r => {
    if (r.state === "locked" || !r.data) return;
    const S2 = restoreState(localStorage.getItem(KEY), null, true, Date.now(), r.data);
    if (!Object.keys(S.desc).length && Object.keys(S2.desc).length) S.desc = S2.desc;
  }).catch(e => console.warn(e)));
  persist(); // ล้าง desc เดิม (ไม่เข้ารหัส) ออกจาก booth-state ทันที

  const ef = $("#eventForm");
  ef.name.value = S.event.name; ef.date.value = S.event.date || dayKey();

  let ready = false, running = false, fpsTimes = [];
  const frames = new Map(); // slot -> ผลล่าสุดของกล้องนั้น [{id, tid, box, confirmed, cam}]
  const lastFrameAll = () => { const out = []; for (const c of orderedCams()) out.push(...(frames.get(c.slot) || [])); return out; };
  const inFrameNow = () => inFrameUnion([...frames.values()]);

  function engine(msg, cls = "") { const e = $("#engine"); e.textContent = msg; e.className = "engine " + cls; }

  // ---------- กล้อง (LQCam hub): กล้องหลักหน้าบูธ + กล้องเสริมได้อีก 2 ตัว ใช้คลังผู้เข้าชมชุดเดียวกัน ----------
  const ROLE_TH = { primary: "กล้องหลัก (หน้าบูธ)", aux: "กล้องเสริม" };
  const STATUS_TH = { idle: "ปิด", starting: "กำลังเปิด", live: "ทำงาน", paused: "พัก", error: "ผิดพลาด" };
  const grid = $("#camGrid"), camBtn = $("#camStart"), addBtn = $("#addCam");
  const mirrored = c => !!c && c.facing !== "environment"; // กล้องหน้า: แสดงแบบกระจก
  const primaryCam = () => hub.cams.find(c => c.role === "primary") || hub.cams[0] || null;
  const orderedCams = () => { const p = primaryCam(); return p ? [p, ...hub.cams.filter(c => c !== p)] : []; };
  const anyActive = () => hub.cams.some(c => c.active);
  const savedCams = () => LQCam.parseCams(localStorage.getItem("booth-cams")).cams;
  const statCams = () => (hub.cams.length ? hub.cams : savedCams()).map(c => ({ slot: c.slot, name: c.name, role: c.role }));

  function buildTile(c) {
    const t = document.createElement("div");
    t.className = "bt-tile";
    t.innerHTML = `<div class="tile-head">
        <input class="cam-name" maxlength="40" aria-label="ชื่อจุด/โซนของกล้อง">
        <select class="cam-role" aria-label="หน้าที่ของกล้อง"><option value="primary">${ROLE_TH.primary}</option><option value="aux">${ROLE_TH.aux}</option></select>
        <span class="pill bt-status"></span>
        <span class="pill lq-health" hidden></span>
        <button class="btn ghost sm cam-del" type="button">ลบกล้อง</button>
      </div>
      <div class="cam"><p class="cam-off">กำลังเปิดกล้อง...</p><div class="cam-ctl"></div></div>
      <p class="cam-health" hidden></p>`;
    const box = t.querySelector(".cam");
    box.prepend(c.video, c.overlay);
    c.overlay.setAttribute("aria-label", "ภาพกล้อง แตะกรอบใบหน้าเพื่อบันทึกผู้เข้าร่วมกิจกรรม");
    const nm = /** @type {HTMLInputElement} */ (t.querySelector(".cam-name")), rl = /** @type {HTMLSelectElement} */ (t.querySelector(".cam-role"));
    nm.value = c.name;
    nm.addEventListener("change", () => { hub.rename(c.slot, nm.value.trim() || c.name); nm.value = c.name; render(inFrameNow()); });
    rl.addEventListener("change", () => setPrimary(rl.value === "primary" ? c.slot : (orderedCams().find(x => x !== c) || c).slot));
    t.querySelector(".cam-del").addEventListener("click", () => removeCam(c));
    c.overlay.addEventListener("click", ev => tapBox(c, ev));
    const lay = () => layoutCam(c);
    c.video.addEventListener("loadedmetadata", lay); c.video.addEventListener("resize", lay);
    return t;
  }
  function layoutCam(c) { // ขนาด overlay และสัดส่วนกรอบตามกล้องจริง (รองรับแนวตั้งบนมือถือ)
    const box = c.tile && c.tile.querySelector(".cam"); if (!box) return;
    const vw = c.video.videoWidth, vh = c.video.videoHeight; if (!vw) return;
    if (c.overlay.width !== vw || c.overlay.height !== vh) { c.overlay.width = vw; c.overlay.height = vh; }
    box.style.aspectRatio = `${vw} / ${vh}`;
    box.classList.toggle("tall", vh > vw);
  }
  function camState() {
    const on = anyActive(), multi = hub.cams.length > 1;
    grid.classList.toggle("multi", multi);
    $("#camPlaceholder").hidden = hub.cams.length > 0;
    for (const c of hub.cams) {
      if (!c.tile) continue;
      const box = c.tile.querySelector(".cam");
      box.classList.toggle("on", c.active); box.classList.toggle("mirror", mirrored(c));
      c.tile.classList.toggle("primary", c === primaryCam());
      const st = c.tile.querySelector(".bt-status"); st.textContent = STATUS_TH[c.status] || c.status; st.dataset.s = c.status;
      const rl = c.tile.querySelector(".cam-role"); rl.value = c === primaryCam() ? "primary" : "aux"; rl.disabled = !multi;
      c.tile.querySelector(".cam-del").hidden = !multi;
    }
    camBtn.textContent = on ? "ปิดกล้อง" : "เริ่มกล้อง";
    camBtn.classList.toggle("primary", !on); camBtn.classList.toggle("ghost", on);
    addBtn.disabled = !on || hub.cams.length >= 3;
  }
  const camErr = e => {
    if (!e || e.name === "AbortError") return;
    console.warn(e);
    if (e.name === "Insecure") { engine(HTTPS_MSG, "err"); showHttpsNote($("#engine")); }
    else engine("เปิดกล้องไม่ได้: " + LQCam.errorText(e), e.name === "CapacityError" ? "" : "err");
  };
  const hub = LQCam.createHub({
    ns: "booth", max: 3, grid, tile: buildTile, facing: "user", idealOne: { width: 1280, height: 720 }, idealMany: { width: 640, height: 480 }, frameRateMany: 15,
    onChange(h, ev) {
      const c = ev.slot ? h.cam(ev.slot) : null;
      if (ev.type === "added" || ev.type === "removed") syncSched();
      if (c && (ev.type === "started" || ev.type === "resumed")) { setTimeout(() => layoutCam(c), 0); if (c.tile && !c.tile.querySelector(".cam-ctl").childElementCount && h.cams.length === 1) c.attach(c.tile.querySelector(".cam-ctl")); }
      if (ev.type === "paused" && ready) engine("พักกล้องไว้ขณะสลับแอป จะเปิดใหม่อัตโนมัติเมื่อกลับมา");
      else if (ev.type === "resumed" && ready) engine("กล้องพร้อม" + (running ? "" : " — กด เริ่มนับผู้เข้าชม"), "ok");
      else if (ev.type === "reconnected") engine("กล้องกลับมาเชื่อมต่อแล้ว", "ok"); // LQCam reconnects an ended track by itself (round 10)
      else if (ev.type === "ended") { frames.delete(ev.slot); engine(`${c ? c.name : "กล้อง"} หลุดการเชื่อมต่อ${anyActive() ? " — กล้องที่เหลือยังนับต่อ" : " กด เริ่มกล้อง อีกครั้ง"}`, "err"); }
      camState();
    }
  });
  function applyRoles() {
    for (const r of normalizeRoles(hub.cams)) { const c = hub.cam(r.slot); if (c && c.role !== r.role) hub.setRole(r.slot, r.role); }
    syncSched(); camState();
  }
  function setPrimary(slot) {
    hub.cams.forEach(c => hub.setRole(c.slot, c.slot === slot ? "primary" : "aux"));
    applyRoles(); render(inFrameNow());
  }

  // เปิดกล้องเมื่อกดปุ่มเท่านั้น (ไม่ขอสิทธิ์กล้องตอนโหลดหน้า)
  async function legacyDevice() { // หน้าเดิมจำกล้องไว้ที่ 'booth-cam' {deviceId,label}
    let p = null; try { p = JSON.parse(localStorage.getItem("booth-cam")); } catch { p = null; }
    const id = typeof p === "string" ? p : p && p.deviceId;
    if (!id) return "";
    const list = await LQCam.listCameras();
    return list.some(d => d.deviceId === id) ? id : (p && p.label && (list.find(d => d.label === p.label) || {}).deviceId) || "";
  }
  camBtn.onclick = async () => {
    if (anyActive()) {
      if (running) toggleCount();
      hub.stopAll(); frames.clear(); hub.cams.forEach(c => c.overlay.getContext("2d").clearRect(0, 0, c.overlay.width, c.overlay.height));
      camState(); engine(ready ? "ปิดกล้องแล้ว" : $("#engine").textContent); return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return camErr(Object.assign(new Error(HTTPS_MSG), { name: "Insecure" }));
    camBtn.disabled = true; engine("กำลังเปิดกล้อง...");
    try {
      if (hub.cams.length) await hub.startAll();
      else {
        await hub.restore();
        if (!hub.cams.length) await hub.add({ deviceId: (await legacyDevice()) || undefined, role: "primary", name: "หน้าบูธ" });
      }
      applyRoles();
      if (!anyActive()) throw hub.cams.find(c => c.lastError)?.lastError || Object.assign(new Error("no camera"), { name: "NotFoundError" });
      const n = hub.cams.filter(c => c.active).length;
      engine(`กล้องพร้อม${n > 1 ? ` ${n} ตัว` : ""}${ready ? " — กด เริ่มนับผู้เข้าชม" : " กำลังโหลดโมเดล..."}`, ready ? "ok" : "");
      if (!ready) loadOnce(); // speed pass 2026-11-14: the face models are fetched once a camera is open
    } catch (e) { camErr(e); }
    finally { camBtn.disabled = false; camState(); }
  };
  addBtn.onclick = async () => {
    if (!anyActive()) return engine("กด เริ่มกล้อง ก่อน แล้วจึงเพิ่มกล้องเสริม", "err");
    addBtn.disabled = true; engine("กำลังเพิ่มกล้องเสริม...");
    try {
      const c = await hub.add({ role: "aux", name: `จุดเสริม ${hub.cams.length}` });
      applyRoles();
      engine(`เพิ่ม "${c.name}" แล้ว — ผู้เข้าชมที่กล้องหลายตัวเห็นนับครั้งเดียว (ตั้งชื่อจุดได้ที่ช่องชื่อกล้อง)`, "ok");
    } catch (e) {
      if (e.name === "CapacityError") engine(`${LQCam.errorText(e)} — ใช้กล้องหลักตัวเดียวนับต่อ`, "");
      else camErr(e);
    } finally { camState(); }
  };
  function removeCam(c) {
    if (hub.cams.length < 2) return;
    if (!confirm(`ลบ "${c.name}"? (สถิติที่นับแล้วยังอยู่)`)) return;
    frames.delete(c.slot); dropRuntime(S, c.slot);
    hub.remove(c.slot); applyRoles(); render(inFrameNow());
  }

  let backendName = "", initP = null;
  /** first camera open (or test mode): start loading the models once; a failed load can be retried (button) */
  function loadOnce() { if (!initP) initP = init().finally(() => { if (!ready) initP = null; }); return initP; }
  async function init() {
    engine("กำลังโหลดโมเดลวิเคราะห์ใบหน้า...");
    try {
      if (TEST) backendName = "test";
      else {
        backendName = await LQDetect.tfBackend();
        const nets = ["tinyFaceDetector", "faceLandmark68Net", "faceRecognitionNet"].concat(EXPR_OK() ? ["faceExpressionNet"] : []);
        await Promise.all(nets.map(n => faceapi.nets[n].loadFromUri("vendor/models/")));
      }
      ready = true;
      engine(`โมเดลพร้อม (ตัวประมวลผล: ${backendName.toUpperCase()}${backendName === "webgl" ? "" : " — อาจช้ากว่าปกติ"}) — ${anyActive() ? "กด เริ่มนับผู้เข้าชม" : "กด เริ่มกล้อง"}`, "ok");
    } catch (e) {
      console.warn(e);
      engine(`ระบบไม่พร้อม: โหลดโมเดลไม่สำเร็จ (${e.name}: ${e.message || "-"})`, "err");
      const b = document.createElement("button");
      b.className = "btn ghost retry"; b.type = "button"; b.textContent = "ลองใหม่";
      b.onclick = init; $("#engine").append(b);
    }
  }

  const detOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
  const center = pts => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

  // โหมดทดสอบ (?fakedet บน localhost): กรอบจากสคริปต์ทดสอบ (key = ช่องกล้อง) ค่าลักษณะใบหน้าสังเคราะห์ (d.person) ไม่โหลดโมเดล
  function fakeFaces(c, now) {
    const dets = LQDetect.fake(c.slot, now) || [];
    return dets.map((d, i) => {
      const desc = countOnly() ? null : d.desc || Array.from({ length: 128 }, (_, k) => (k === (d.person ?? i) % 128 ? 1 : 0));
      const e = EMO.map((_, k) => (k ? 0 : 1));
      return { desc, e, v: 0, att: 1, area: d.w * d.h, box: { x: d.x, y: d.y, w: d.w, h: d.h }, score: d.score };
    });
  }
  // กล้องเสริม: ตรวจใบหน้า + ค่าลักษณะใบหน้าเท่านั้น (ไม่วิเคราะห์สีหน้า ประหยัดการประมวลผล)
  async function detect(c, now) {
    if (TEST) return fakeFaces(c, now);
    const video = c.video, W = video.videoWidth, H = video.videoHeight, primary = c === primaryCam();
    const co = countOnly(); // นับอย่างเดียว: ไม่คำนวณค่าลักษณะใบหน้าเลย (ไม่มีข้อมูลชีวมิติ)
    let q = faceapi.detectAllFaces(video, detOpts).withFaceLandmarks();
    if (!co) q = q.withFaceDescriptors();
    if (primary && EXPR_OK()) q = q.withFaceExpressions();
    const rs = await q;
    return rs.map(r => {
      const lm = r.landmarks, le = center(lm.getLeftEye()), re = center(lm.getRightEye()), nose = lm.getNose()[3];
      const yaw = (nose.x - (le.x + re.x) / 2) / (Math.abs(re.x - le.x) || 1);
      const e = r.expressions ? EMO.map(k => +(r.expressions[k] || 0).toFixed(3)) : EMO.map((_, k) => (k ? 0 : 1));
      const b = r.detection.box;
      return { desc: co ? null : r.descriptor, e, v: e.reduce((s, p, i) => s + p * VA[EMO[i]][0], 0), att: Math.abs(yaw) < CFG.YAW_LIMIT ? 1 : 0, area: b.width * b.height, box: LQT.toNorm(b, W, H), score: r.detection.score };
    });
  }

  let picked = null; // กรอบที่เจ้าหน้าที่แตะล่าสุด (เน้นสี)
  function draw(c, res) {
    const ctx = c.overlay.getContext("2d"), W = c.overlay.width, H = c.overlay.height, mir = mirrored(c);
    ctx.clearRect(0, 0, W, H);
    ctx.font = "600 22px Prompt, sans-serif"; ctx.lineWidth = 3;
    res.forEach(({ id, face, box: b, confirmed }) => {
      const bw = b.w * W, bh = b.h * H, y = b.y * H;
      const x = mir ? W - (b.x + b.w) * W : b.x * W; // กล้องหน้า: วาดแบบกระจกให้ตรงกับวิดีโอ ตัวอักษรไม่กลับด้าน
      ctx.strokeStyle = id && picked && picked.id === id && performance.now() - picked.at < 2500 ? "#22d3ee" : id && confirmed ? (face.att ? "#2ecc71" : "#e6a23c") : "#9fb1bc";
      ctx.strokeRect(x, y, bw, bh);
      const label = id || "กำลังจำ...";
      const tw = ctx.measureText(label).width + 12, ly = Math.max(30, y);
      ctx.fillStyle = "rgba(14,20,48,.85)"; ctx.fillRect(x, ly - 30, tw, 28);
      ctx.fillStyle = "#fff"; ctx.fillText(label, x + 6, ly - 9);
    });
  }

  // ---------- ประมวลผล: ตัวจัดคิวเดียว หนึ่งกล้องต่อรอบ ไม่ซ้อนงาน (กล้องหลักได้รอบมากกว่า) ----------
  const sched = LQCam.createScheduler({ targetHz: 4 });
  const schedKeys = new Set();
  let lastSave = 0, lastUi = 0;
  function syncSched() {
    for (const c of hub.cams) sched.add(c.slot, () => tick(c), { weight: c === primaryCam() ? 2 : 1, cam: c }), schedKeys.add(c.slot);
    for (const k of [...schedKeys]) if (!hub.cam(k)) { sched.remove(k); schedKeys.delete(k); frames.delete(k); }
    sched.setTargetHz(Math.min(8, 4 * Math.max(1, hub.cams.filter(c => c.active).length)));
  }
  async function tick(c) {
    if (!running || !c.active || !c.video.videoWidth) return; // กล้องพักอยู่ (สลับแอป/สลับกล้อง)
    const faces = await detect(c, Date.now());
    if (!running || !hub.cam(c.slot)) return;
    const now = Date.now();
    if (autoPurge(S, now)) persist();
    const nV0 = S.visitors.length;
    const res = observe(S, faces, now, runtime(S, c.slot), { cam: c.slot, primary: c === primaryCam(), timeline: false, countOnly: countOnly() });
    if (SCB && S.visitors.length > nV0) { for (let k = nV0; k < S.visitors.length; k++) SCB.sys.push({ t: now }); scbLive(); }
    healthStep(c, faces, now);
    frames.set(c.slot, res.map(r => ({ id: r.id, tid: r.tid, box: { ...r.box }, confirmed: r.confirmed, cam: c.slot })));
    draw(c, res);
    const n = inFrameNow();
    noteTimeline(S, n, now);
    fpsTimes.push(performance.now()); fpsTimes = fpsTimes.filter(t => t > performance.now() - 3000);
    const nc = hub.cams.filter(x => x.active).length;
    $("#fps").textContent = `${n} คนในกล้อง · ${(fpsTimes.length / 3 / Math.max(1, nc)).toFixed(1)} fps${nc > 1 ? ` × ${nc} กล้อง` : ""}`;
    if (now - lastUi > 1000) { render(n); lastUi = now; }
    if (now - lastSave > 5000) { persist(); lastSave = now; }
  }

  function toggleCount() {
    if (!running) {
      if (!ready) return engine($("#engine").className.includes("err") ? $("#engine").textContent : "ระบบกำลังโหลดโมเดล กรุณารอสักครู่", $("#engine").className.includes("err") ? "err" : "");
      if (!anyActive()) return engine("กด เริ่มกล้อง ก่อน แล้วจึงเริ่มนับผู้เข้าชม", "err");
    }
    running = !running;
    $("#toggle").textContent = running ? "หยุดนับ" : "เริ่มนับผู้เข้าชม";
    if (running) { syncSched(); sched.start(); if (UA) UA.start(); }
    else {
      if (UA) UA.stop();
      if (SCB) scbFinish();
      sched.stop(); frames.clear();
      hub.cams.forEach(c => c.overlay.getContext("2d").clearRect(0, 0, c.overlay.width, c.overlay.height));
      persist(); render(0); $("#fps").textContent = "หยุดแล้ว";
    }
  }
  $("#toggle").onclick = toggleCount;

  // ---------- สุขภาพภาพต่อกล้อง + ธงคุณภาพรายชั่วโมง + ตรวจความแม่นยำหน้างาน (lensiq-sitecheck.js) ----------
  // ทุก ~1 วินาทีต่อกล้อง: ความสว่าง ย้อนแสง ความคม กล้องสั่น ภาพค้าง อัตราประมวลผล และขนาดใบหน้า (ตัวเลขเท่านั้น ไม่เก็บภาพ)
  const SITE = /** @type {any} */ (window).LQSite || null;
  function healthStep(c, faces, now) {
    if (!SITE) return;
    const H = c._hl || (c._hl = { mon: SITE.createHealth({ kind: "booth" }), at: 0, fw: [], cv: document.createElement("canvas"), state: null, stateAt: 0 });
    for (const f of faces) if (f.box && H.fw.length < 200) H.fw.push(f.box.w);
    if (now - H.at < 1000) return;
    H.at = now;
    let st = null; try { st = SITE.sampleElement(c.video, H.cv); } catch { /* ภาพอ่านไม่ได้ */ }
    const hz = c.intervalMsEma ? 1000 / c.intervalMsEma : null, faceW = H.fw.length >= 2 ? SITE.median(H.fw) : null;
    H.state = H.mon.push(st, { hz, faceW, stalled: SITE.stallStep(c.video, st, performance.now()) }); H.stateAt = now;
    if (SCB && c === primaryCam()) { H.state.codes.forEach(k => SCB.health.add(k)); if (faceW != null) SCB.fw.push(faceW); }
    H.fw = [];
    if (!c.tile) return;
    const pill = c.tile.querySelector(".lq-health"), line = c.tile.querySelector(".cam-health");
    SITE.renderHealth(pill, H.state); pill.hidden = false;
    SITE.renderHealthLine(line, H.state);
  }
  // round 12: แท็บถูกซ่อน/จอดับ = กล้องหยุด (autoPause) — Wake Lock, แจ้งเตือนเมื่อกลับมา, บันทึกช่วงที่หยุดเป็นวินาทีจริง ("กล้องออฟไลน์")
  // และล้างผลเฟรมล่าสุด (คนในกล้องตอนนี้) เพื่อเริ่มติดตามใหม่หลังกลับมา
  const UA = LQCam.unattended ? LQCam.unattended({ container: $("#uaBox") || $("#engine").parentNode, isRunning: () => running, onGap: g => {
    if (SITE) SITE.noteGap(S.quality || (S.quality = {}), g.from, g.to);
    (S.gaps || (S.gaps = [])).push({ from: g.from, to: g.to }); while (S.gaps.length > 50) S.gaps.shift();
    if (SCB) SCB.hiddenMs = (SCB.hiddenMs || 0) + g.ms;
    frames.clear(); persist();
  } }) : null;
  let qAt = 0;
  // ธงคุณภาพรายชั่วโมง: ระหว่างนับ ทุก 1 วินาที บันทึกวินาทีที่กล้องหลักมีปัญหาภาพ และวินาทีที่กล้องใดหลุด/ออฟไลน์ ลง S.quality (ตัวเลขเท่านั้น)
  setInterval(() => {
    if (!SITE || !running) return;
    const now = Date.now(), p = primaryCam(), H = p && p._hl;
    const codes = H && H.state && now - H.stateAt < 2500 ? H.state.codes : [];
    const offline = hub.cams.some(c => c.offlineSince || c.status === "error");
    const sec = LQCam.sampleSec ? LQCam.sampleSec(qAt, now) : 1; qAt = now; // round 12: วินาทีจริง (ตัวจับเวลาถูกหน่วงเมื่อแท็บไม่อยู่ด้านหน้า)
    if (document.hidden) return; // ช่วงที่ซ่อนอยู่บันทึกครั้งเดียวตอนกลับมา (noteGap)
    SITE.noteQuality(S.quality || (S.quality = {}), now, codes, { offline, sec });
  }, 1000);

  // ตรวจความแม่นยำหน้างาน: เจ้าหน้าที่กด "+1 ผู้มาบูธ" ทุกครั้งที่มีคนมาที่บูธจริง แล้วเทียบกับเวลาที่ระบบสร้างผู้เข้าชมใหม่ (V###)
  let SCB = null, SCB_LAST = null;
  const scbHist = SITE ? SITE.history("booth-sitecheck") : null;
  const scbPanel = SITE && $("#scPanel") ? SITE.mountPanel($("#scPanel"), {
    title: "ตรวจความแม่นยำหน้างาน",
    intro: "ทดสอบการนับผู้เข้าชมที่บูธของคุณเอง: ระหว่างที่ระบบนับ ให้เจ้าหน้าที่หนึ่งคนดูหน้าบูธแล้วกดปุ่มทุกครั้งที่มีคนมาที่บูธจริง ระบบจะเทียบกับยอดที่นับได้ พร้อมช่วงความเชื่อมั่นและคำแนะนำ",
    steps: [
      "เปิดกล้องและกด \"เริ่มนับผู้เข้าชม\" ให้ระบบนับตามปกติ (ใช้โหมดการนับที่จะใช้จริง)",
      "กด \"เริ่มตรวจ\" แล้วกด \"+1 ผู้มาบูธ\" ทุกครั้งที่มีคนเดินเข้ามาที่บูธและหันมาทางกล้อง (คีย์บอร์ด: ลูกศรขึ้น) กดผิดให้กด \"ลบครั้งล่าสุด\"",
      "คนเดิมที่กลับมาภายใน 1 นาทีไม่ต้องกดซ้ำ — กดเฉพาะคนที่มาใหม่",
      "เก็บอย่างน้อย 30 คน ในช่วงที่มีคนมาบูธตามปกติ แล้วกด \"จบและคำนวณ\"",
      "ทำซ้ำเมื่อย้ายกล้อง เปลี่ยนแสง หรือเปลี่ยนโหมดการนับ เก็บไฟล์ผลตรวจไว้"
    ],
    body: `<div class="sc-taps" hidden><button class="btn primary sc-in" type="button">${"+1 ผู้มาบูธ"}</button><button class="btn ghost small sc-undo" type="button">${"ลบครั้งล่าสุด"}</button></div>`
  }) : null;
  function scbLive() {
    if (!scbPanel || !SCB) return;
    scbPanel.live.textContent = SITE.fmt("เจ้าหน้าที่กด {a} คน · ระบบนับผู้เข้าชมใหม่ {b} คน | เวลา {c}", { a: SCB.truth.length, b: SCB.sys.length, c: fmtDur((Date.now() - SCB.t0) / 1000) });
  }
  function scbTap() { if (!SCB) return; SCB.truth.push({ t: Date.now() }); scbLive(); }
  function scbStart() {
    if (!SITE || SCB) return;
    if (!running || !anyActive()) return engine("เริ่มกล้องและเริ่มนับผู้เข้าชมก่อน แล้วจึงเริ่มตรวจ", "err");
    const p = primaryCam();
    SCB = { t0: Date.now(), startedAt: Date.now(), truth: [], sys: [], health: new Set(), fw: [], cam: p ? p.name : "", mode: prefs.mode, cams: hub.cams.filter(c => c.active).length };
    scbPanel.start.disabled = true; scbPanel.stop.disabled = false; scbPanel.q(".sc-taps").hidden = false; scbPanel.exp.hidden = true;
    scbPanel.state.textContent = "กำลังตรวจ"; scbPanel.state.dataset.s = "live"; SITE.renderReport(scbPanel.report, null);
    scbLive(); scbPanel.q(".sc-in").focus();
  }
  function scbFinish() {
    if (!SCB) return;
    const run = SCB; SCB = null;
    const T = run.truth.map(e => ({ t: e.t - run.t0 })), Sy = run.sys.map(e => ({ t: e.t - run.t0 }));
    const stats = { faceW: run.fw.length ? SITE.median(run.fw) : null, health: [...run.health], hiddenMs: run.hiddenMs || 0 };
    const rep = SITE.visitorReport(Sy, T, { stats, countOnly: run.mode !== "recognise" });
    SITE.renderReport(scbPanel.report, rep);
    scbPanel.start.disabled = false; scbPanel.stop.disabled = true; scbPanel.q(".sc-taps").hidden = true;
    scbPanel.state.textContent = SITE.verdictText(rep); scbPanel.state.dataset.s = rep.verdict;
    const doc = SITE.exportDoc("booth", {
      camera: run.cam, startedAt: new Date(run.startedAt).toISOString(), durationSec: Math.round((Date.now() - run.t0) / 1000),
      settings: { mode: run.mode, consentAckAt: prefs.ackAt || null, cameras: run.cams, match: CFG.MATCH, margin: CFG.MARGIN, promoteMs: CFG.PROMOTE_MS, backend: backendName },
      conditions: stats, truth: T, system: Sy,
      report: { verdict: rep.verdict, provisional: rep.provisional, pilot: rep.pilot ? rep.pilot.verdict : null, need: rep.need, n: rep.n, lagMs: rep.lagMs, net: rep.net, netCI: rep.netCI, precision: rep.precision, recall: rep.recall, recs: rep.recs, short: rep.short || null, hiddenMs: rep.hiddenMs || 0 }
    });
    scbPanel.exp.hidden = false;
    scbPanel.exp.onclick = () => SITE.download(`lensiq-booth-check-${dayKey(run.startedAt)}.json`, doc);
    scbHist.add({ at: run.startedAt, verdict: rep.verdict, provisional: rep.provisional, pilot: rep.pilot ? rep.pilot.verdict : null, need: rep.need, cam: run.cam, summary: SITE.fmt("{a}: ระบบ {b} / คนนับ {c} · แม่นยำ {d}", { a: run.cam, b: rep.n.sys, c: rep.n.truth, d: rep.precision.p == null ? "—" : (rep.precision.p * 100).toFixed(0) + "%" }) });
    scbHist.render(scbPanel.hist);
    SCB_LAST = { rep, doc };
  }
  if (scbPanel) {
    scbPanel.el.classList.add("sc-panel");
    scbPanel.start.addEventListener("click", scbStart);
    scbPanel.stop.addEventListener("click", scbFinish);
    scbPanel.q(".sc-in").addEventListener("click", scbTap);
    scbPanel.q(".sc-undo").addEventListener("click", () => { if (SCB && SCB.truth.length) { SCB.truth.pop(); scbLive(); } });
    document.addEventListener("keydown", e => {
      if (!SCB || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target && /** @type {HTMLElement} */ (e.target).tagName) || "")) return;
      if (e.key === "ArrowUp") { e.preventDefault(); scbTap(); }
    });
    setInterval(() => { if (SCB) scbLive(); }, 1000);
    scbHist.render(scbPanel.hist);
  }
  /** @type {any} */ (window).__BT_SC = { get active() { return SCB; }, get last() { return SCB_LAST; }, tap: () => scbTap(), finish: () => scbFinish() };

  // ---------- กิจกรรม: แตะกรอบใบหน้าบนภาพเพื่อเลือกผู้เข้าร่วม ----------
  const joinMsg = (t, c) => { const msg = $("#joinMsg"); msg.textContent = t; msg.className = "form-msg " + c; };
  function markJoin(id) {
    const act = $("#activity").value.trim() || "กิจกรรม";
    const r = markActivity(S, id, act);
    picked = { id, at: performance.now() };
    joinMsg(r === "ok" ? `บันทึก ${id} เข้าร่วม "${act}" แล้ว` : r === "already" ? `${id} เข้าร่วม "${act}" ไปแล้ว` : `ไม่พบ ${id}`, r === "ok" ? "ok" : r === "already" ? "" : "err");
    persist(); render(inFrameNow());
  }
  function join() {
    if (!running) return joinMsg("กรุณากดเริ่มนับผู้เข้าชมก่อน", "err");
    const known = [...new Set(lastFrameAll().filter(r => r.id).map(r => r.id))];
    if (!known.length) return joinMsg("ยังไม่พบใบหน้าที่ระบบจำได้ ให้ผู้เข้าร่วมหันหน้าเข้ากล้อง 1-2 วินาที", "err");
    if (known.length > 1) return joinMsg(`มี ${known.length} คนในกล้อง แตะกรอบใบหน้าของผู้เข้าร่วมบนภาพ`, "");
    markJoin(known[0]);
  }
  function tapBox(c, ev) {
    if (!running) return joinMsg("กรุณากดเริ่มนับผู้เข้าชมก่อน แล้วแตะกรอบใบหน้า", "err");
    const r = c.overlay.getBoundingClientRect(); if (!r.width || !r.height) return;
    let fx = (ev.clientX - r.left) / r.width; const fy = (ev.clientY - r.top) / r.height;
    if (mirrored(c)) fx = 1 - fx;
    const hit = hitBox(frames.get(c.slot) || [], fx, fy);
    if (!hit) return joinMsg("ไม่พบกรอบใบหน้าตรงจุดที่แตะ", "err");
    if (!hit.id) return joinMsg("ระบบยังจำคนนี้ไม่ได้ รอ 1-2 วินาทีแล้วแตะอีกครั้ง", "err");
    markJoin(hit.id);
  }
  $("#join").onclick = join;
  document.addEventListener("keydown", e => {
    if (e.code === "Space" && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); join(); }
  });

  // ---------- กราฟ ----------
  const tip = $("#tooltip");
  const showTip = (html, x, y) => { tip.innerHTML = html; tip.hidden = false; tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, x + 14) + "px"; tip.style.top = Math.max(8, y - tip.offsetHeight - 10) + "px"; };
  const hideTip = () => { tip.hidden = true; };
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent?.append(n); return n; };
  const niceMax = m => { if (m <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(m))); return Math.ceil(m / p * 2) / 2 * p; };

  const chartW = (el, def = 560) => Math.max(280, Math.min(760, Math.round(el.clientWidth || def))); // 1 หน่วย ≈ 1px ตัวอักษรไม่เล็กลงบนมือถือ
  function barChart(el, items, unit = "คน") {
    const W = chartW(el), H = W < 420 ? 180 : 200, L = 36, R = 8, T = 10, B = 28;
    const max = niceMax(Math.max(1, ...items.map(i => i.value)));
    const y = v => T + (1 - v / max) * (H - T - B), bw = (W - L - R) / items.length;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img" });
    [0, 0.25, 0.5, 0.75, 1].forEach(f => { const v = max * f; svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: f ? "grid" : "zero" }, svg); svgEl("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, svg).textContent = Math.round(v); });
    const every = Math.ceil(items.length / Math.max(3, Math.floor((W - L - R) / 52)));
    items.forEach((it, i) => {
      const x = L + i * bw, h = Math.max(0, H - B - y(it.value)), w = Math.max(2, bw - 4);
      if (it.flag) svgEl("rect", { x: x + 1, y: T, width: Math.max(2, bw - 2), height: H - T - B, class: "q-flag" }, svg);
      if (it.value > 0) svgEl("path", { class: it.flag ? "bar flagged" : "bar", d: `M${x + 2},${H - B}V${H - B - h + Math.min(4, h)}q0,-${Math.min(4, h)} ${Math.min(4, w / 2)},-${Math.min(4, h)}H${x + 2 + w - Math.min(4, w / 2)}q${Math.min(4, w / 2)},0 ${Math.min(4, w / 2)},${Math.min(4, h)}V${H - B}Z` }, svg);
      if (i % every === 0) svgEl("text", { x: x + bw / 2, y: H - 8, "text-anchor": "middle" }, svg).textContent = it.label;
      const hit = svgEl("rect", { x, y: T, width: bw, height: H - T - B, fill: "transparent" }, svg);
      const tipFn = ev => showTip(`<b>${esc(it.label)}</b><br>${it.value} ${unit}${it.flag ? `<br><span class="q-tip"><span>${"ภาพจากกล้องมีปัญหาในชั่วโมงนี้:"}</span> <span>${esc(it.flag)}</span></span>` : ""}`, ev.clientX, ev.clientY);
      hit.addEventListener("pointermove", tipFn); hit.addEventListener("pointerdown", tipFn);
      hit.addEventListener("pointerleave", hideTip);
    });
    el.replaceChildren(svg);
  }

  function lineChart(el, data) {
    const W = chartW(el), H = W < 420 ? 180 : 200, L = 36, R = 8, T = 10, B = 28;
    if (data.length < 2) { el.innerHTML = `<p class="hint">ยังไม่มีข้อมูลเพียงพอ</p>`; return; }
    const t0 = data[0].t, t1 = data.at(-1).t, max = niceMax(Math.max(1, ...data.map(d => d.n)));
    const x = t => L + (t - t0) / (t1 - t0) * (W - L - R), y = v => T + (1 - v / max) * (H - T - B);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img" });
    [0, 0.5, 1].forEach(f => { const v = max * f; svgEl("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: f ? "grid" : "zero" }, svg); svgEl("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, svg).textContent = Math.round(v); });
    const nT = W < 420 ? 2 : 4;
    for (let k = 0; k <= nT; k++) { const t = t0 + (t1 - t0) * k / nT; svgEl("text", { x: x(t), y: H - 8, "text-anchor": k === 0 ? "start" : k === nT ? "end" : "middle" }, svg).textContent = fmtClock(t); }
    // ช่วงที่ไม่มีข้อมูลนานเกิน 1 นาที (หยุดนับ) ไม่ลากเส้นเชื่อม
    let d = ""; data.forEach((p, i) => { const gap = i && p.t - data[i - 1].t > 60000; d += `${!i || gap ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.n).toFixed(1)}`; });
    svgEl("path", { d, fill: "none", stroke: "var(--series-1)", "stroke-width": 2, "stroke-linejoin": "round" }, svg);
    const cross = svgEl("line", { y1: T, y2: H - B, class: "cross", visibility: "hidden" }, svg);
    const dot = svgEl("circle", { r: 4, fill: "var(--series-1)", stroke: "#fff", "stroke-width": 2, visibility: "hidden" }, svg);
    const hit = svgEl("rect", { x: L, y: 0, width: W - L - R, height: H, fill: "transparent" }, svg);
    const move = ev => {
      const r = svg.getBoundingClientRect(), t = t0 + ((ev.clientX - r.left) * W / r.width - L) / (W - L - R) * (t1 - t0);
      const p = data.reduce((m, q) => Math.abs(q.t - t) < Math.abs(m.t - t) ? q : m, data[0]);
      cross.setAttribute("x1", x(p.t)); cross.setAttribute("x2", x(p.t)); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", x(p.t)); dot.setAttribute("cy", y(p.n)); dot.setAttribute("visibility", "visible");
      showTip(`<b>${fmtClock(p.t)}</b><br>สูงสุด ${p.n} คนในกล้อง`, ev.clientX, ev.clientY);
    };
    hit.addEventListener("pointermove", move); hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); hideTip(); });
    el.replaceChildren(svg);
  }

  // ---------- แสดงผล ----------
  function render(inFrame = 0) {
    const m = aggregate(S, Date.now(), inFrame);
    $("#tiles").innerHTML = [
      ["ผู้เข้าชมทั้งหมด", m.unique, "คนไม่ซ้ำ"],
      ["ในกล้องตอนนี้", m.inFrame, running ? "กำลังนับ" : "หยุดนับ"],
      ["หยุดชม ≥ 5 วิ", m.stopped, `เดินผ่าน ${m.passers} คน`],
      ["สนใจบูธ", m.engaged, "หยุดชมและหันมองบูธ"],
      ["กลับมาซ้ำ", m.returning, "หายไป > 1 นาทีแล้วกลับมา"],
      ["เวลาเฉลี่ย", fmtDur(m.avgDwell), "ต่อคน"],
      ["เข้าร่วมกิจกรรม", m.participants, "คน"],
      EXPR_OK() ? ["Valence เฉลี่ย", (m.valence > 0 ? "+" : "") + m.valence.toFixed(2), "บวก / ลบ"] : ["Valence เฉลี่ย", "–", "ปิดในโหมดลูกค้า"]
    ].map(([k, v, s]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");
    // กรวยความสนใจ
    const F = m.funnel, stages = [["ผ่านบูธ", F.passed, "กล้องเห็น ≥ 1 วิ"], ["หยุดชม", F.stopped, "≥ 5 วิ"], ["อยู่นาน", F.engaged, "≥ 30 วิ"], ["ร่วมกิจกรรม", F.joined, "เจ้าหน้าที่บันทึก"]];
    $("#funnel").innerHTML = stages.map(([k, n, s]) => { const p = F.passed ? n / F.passed * 100 : 0; return `<li><div class="fn-k"><b>${k}</b><span>${s}</span></div><div class="fn-bar"><i style="width:${Math.max(n ? 2 : 0, p).toFixed(1)}%"></i></div><div class="fn-v">${n}<small>${F.passed ? Math.round(p) + "%" : "–"}</small></div></li>`; }).join("");
    // ต่อกล้อง/โซน (ยอดรวมด้านบนนับคนซ้ำระหว่างกล้องเพียงครั้งเดียว)
    const inBy = {}; for (const [slot, res] of frames) inBy[slot] = inFrameCount(res);
    const cs = camStats(S, statCams(), inBy);
    $("#camStats").innerHTML = `<thead><tr><th>กล้อง / จุด</th><th>หน้าที่</th><th class="n">ผู้เข้าชม</th><th class="n">เวลาเฉลี่ยที่จุดนี้</th><th class="n">หยุด ≥ 5 วิ</th><th class="n">ในกล้องตอนนี้</th></tr></thead><tbody>${cs.rows.map(r => `<tr><td>${esc(r.name)}</td><td>${ROLE_TH[r.role] || ROLE_TH.aux}</td><td class="n">${r.unique}</td><td class="n">${r.unique ? fmtDur(r.avgDwell) : "–"}</td><td class="n">${r.stopped}</td><td class="n">${r.inFrame}</td></tr>`).join("") || `<tr><td colspan="6" class="hint">ยังไม่ได้เปิดกล้อง</td></tr>`}</tbody><tfoot><tr><td>รวม (ไม่ซ้ำ)</td><td></td><td class="n">${cs.unique}</td><td colspan="3">เห็นมากกว่า 1 กล้อง ${cs.multi} คน (นับครั้งเดียว)</td></tr></tfoot>`;
    const acts = Object.entries(m.acts);
    $("#acts").innerHTML = acts.length ? acts.map(([a, n]) => `<li><span>${esc(a)}</span><b>${n} คน</b></li>`).join("") : `<li class="empty">ยังไม่มีผู้เข้าร่วม</li>`;
    barChart($("#hourly"), m.hourly);
    const qn = $("#qualityNote"); if (qn) { const fl = m.hourly.filter(h => h.flag); qn.hidden = !fl.length; qn.innerHTML = fl.length ? `<span>${"ชั่วโมงที่แรเงา: ภาพจากกล้องมีปัญหา ≥ 5 นาที ยอดอาจคลาดเคลื่อน (ข้อมูลยังเก็บครบ)"}</span> ${fl.map(h => `<span class="q-item"><b>${esc(h.label)}</b> <span>${esc(h.flag)}</span></span>`).join(" ")}` : ""; }
    lineChart($("#crowd"), m.timeline.filter(p => p.t > Date.now() - 12 * 3600e3));
    barChart($("#dwell"), m.dwellHist);
    if (EXPR_OK()) barChart($("#emo"), m.emoCount); else $("#emo").innerHTML = `<p class="hint expr-off">${EXPR_OFF_TH}</p>`;
    const ex = EXPR_OK();
    const rows = S.visitors.slice().reverse().slice(0, 300).map(v => {
      const s = visitorStats(v);
      return `<tr><td>${v.id}</td><td>${fmtClock(v.first)}</td><td>${fmtClock(v.last)}</td><td class="n">${fmtDur(v.dwell)}</td><td class="n">${v.visits}</td>` +
        `<td>${ex ? EMO_TH[s.dom] : "–"}</td><td class="n">${ex ? (s.valence > 0 ? "+" : "") + s.valence.toFixed(2) : "–"}</td><td class="n">${Math.round(s.attRate * 100)}%</td><td>${esc(v.acts.join(", ") || "–")}</td></tr>`;
    }).join("");
    $("#visitors").innerHTML = `<thead><tr><th>รหัส</th><th>เห็นครั้งแรก</th><th>ล่าสุด</th><th class="n">เวลาอยู่</th><th class="n">ครั้งที่มา</th><th>สีหน้าหลัก</th><th class="n">Valence</th><th class="n">มองบูธ</th><th>กิจกรรม</th></tr></thead><tbody>${rows || `<tr><td colspan="9" class="hint">ยังไม่มีผู้เข้าชม</td></tr>`}</tbody>`;
  }

  // ---------- ตั้งค่างาน / ความเป็นส่วนตัว ----------
  ef.addEventListener("submit", e => {
    e.preventDefault();
    if (!ef.name.value.trim()) return ef.name.focus();
    if (S.visitors.length && !confirm("เริ่มงานใหม่จะลบข้อมูลทั้งหมดของงานเดิม (ควรส่งออกก่อน) ต้องการดำเนินการต่อ?")) return;
    S = newState(ef.name.value.trim(), ef.date.value || dayKey());
    frames.clear();
    persist(); render(0);
  });
  $("#purge").onclick = () => {
    if (!confirm("ลบข้อมูลลักษณะใบหน้าทั้งหมดของวันนี้? สถิติจะยังอยู่ แต่ระบบจะจำคนเดิมไม่ได้อีก (นับเป็นคนใหม่)")) return;
    purgeFaces(S); frames.clear(); persist();
    if (V) vaultQ(() => V.wipe([VAULT_KEY])); // ลบสำเนาเข้ารหัสและกุญแจด้วย
    engine("ล้างข้อมูลใบหน้าแล้ว สถิติรวมยังอยู่", "ok");
  };
  const NOTICE = {
    off: "พื้นที่นี้มีการวิเคราะห์ภาพจากกล้องแบบไม่ระบุตัวตน เพื่อนับจำนวนผู้เข้าชมและวัดความสนใจต่อบูธ ระบบไม่บันทึกภาพหรือวิดีโอ ค่าลักษณะใบหน้าใช้เพียงเพื่อไม่ให้นับคนซ้ำ อยู่ในเครื่องนี้ระหว่างเปิดหน้าเท่านั้น และถูกลบเมื่อปิดหน้าหรือขึ้นวันใหม่ หากไม่ต้องการเข้าร่วม กรุณาแจ้งเจ้าหน้าที่",
    on: "พื้นที่นี้มีการวิเคราะห์ภาพจากกล้องแบบไม่ระบุตัวตน เพื่อนับจำนวนผู้เข้าชมและวัดความสนใจต่อบูธ ระบบไม่บันทึกภาพหรือวิดีโอ ค่าลักษณะใบหน้าใช้เพียงเพื่อไม่ให้นับคนซ้ำ เก็บไว้ในเครื่องนี้ไม่เกินสิ้นวันและถูกลบอัตโนมัติเมื่อขึ้นวันใหม่ หากไม่ต้องการเข้าร่วม กรุณาแจ้งเจ้าหน้าที่"
  };
  NOTICE.count = "พื้นที่นี้มีการวิเคราะห์ภาพจากกล้องแบบไม่ระบุตัวตน เพื่อนับจำนวนผู้เข้าชมและเวลาที่อยู่หน้าบูธ ระบบติดตามเพียงตำแหน่งของใบหน้าในภาพ ไม่สร้างค่าลักษณะใบหน้า ไม่จดจำหรือระบุตัวบุคคล และไม่บันทึกภาพหรือวิดีโอ หากไม่ต้องการเข้าร่วม กรุณาแจ้งเจ้าหน้าที่";
  const remember = $("#remember"), modeSel = $("#boothMode");
  const applyPrefs = () => {
    remember.checked = prefs.remember && !countOnly(); remember.disabled = countOnly(); modeSel.value = prefs.mode;
    $("#notice").textContent = countOnly() ? NOTICE.count : prefs.remember ? NOTICE.on : NOTICE.off;
  };
  // round 12: เปิดโหมดจดจำใบหน้าได้หลังผู้ดูแลยืนยันว่าติดป้ายแจ้ง/ขอความยินยอมแล้วเท่านั้น — บันทึกเวลาที่ยืนยัน (prefs.ackAt) ลงไฟล์ส่งออก
  // (ค่าที่ตั้งไว้ก่อนรอบ 12 ยังทำงานเหมือนเดิม แต่จะเห็นกล่องให้ยืนยันจนกว่าจะกดยืนยัน)
  const SITE_FMT = (t, o) => t.replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));
  const AB = LQCam.ackBox({ label: "ยืนยันว่าติดป้ายแจ้งที่บูธแล้ว ผู้เข้าชมทราบว่ามีการใช้ค่าลักษณะใบหน้าเพื่อจำคนที่กลับมา และมีช่องทางขอไม่เข้าร่วม (ตาม PDPA ต้องขอความยินยอมโดยชัดแจ้ง)", okText: "ยืนยันและเปิดโหมดจดจำ" });
  const ack = AB.el; ack.id = "boothAck";
  modeSel.closest("label, .field, div")?.after(ack);
  const ackCb = AB.cb, ackOk = AB.ok;
  const ackUi = () => {
    AB.at.textContent = prefs.ackAt ? SITE_FMT("ยืนยันการแจ้ง/ความยินยอมเมื่อ {t}", { t: new Date(prefs.ackAt).toLocaleString() }) : "";
    if (!countOnly() && !prefs.ackAt) { ack.hidden = false; ackOk.textContent = "ยืนยันการแจ้ง/ความยินยอม"; }
  };
  ackOk.onclick = () => {
    if (!ackCb.checked) return;
    prefs.ackAt = new Date().toISOString(); ack.hidden = true; ackCb.checked = false; ackOk.disabled = true;
    if (countOnly()) { modeSel.value = "recognise"; setMode(); } else { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {} ackUi(); }
  };
  modeSel.onchange = () => {
    if (modeSel.value === "recognise" && countOnly()) {
      modeSel.value = prefs.mode; ack.hidden = false; ackOk.textContent = "ยืนยันและเปิดโหมดจดจำ"; ackCb.focus();
      return engine("ก่อนเปิดโหมดจดจำผู้เข้าชม: ติ๊กยืนยันว่าติดป้ายแจ้งและขอความยินยอมแล้ว", "warn");
    }
    setMode();
  };
  function setMode() {
    ack.hidden = true;
    prefs.mode = modeSel.value === "recognise" ? "recognise" : "count";
    if (countOnly()) { prefs.remember = false; purgeFaces(S); if (V) vaultQ(() => V.wipe([VAULT_KEY])); } // เปลี่ยนเป็นนับอย่างเดียว = ลบค่าใบหน้าที่มีทันที
    else RUNTIME.delete(S); // เริ่มแทร็กใหม่ด้วยค่าลักษณะใบหน้า
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
    persist(); applyPrefs();
    engine(countOnly() ? "โหมดนับอย่างเดียว: ไม่ใช้ข้อมูลใบหน้า คนที่กลับมาจะนับเป็นผู้เข้าชมใหม่" : "โหมดจำผู้เข้าชมที่กลับมา: ใช้ค่าลักษณะใบหน้า ต้องติดป้ายแจ้งและขอความยินยอม", "ok");
    ackUi();
  }
  remember.onchange = () => {
    prefs.remember = remember.checked;
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
    persist(); applyPrefs();
    engine(prefs.remember ? "จะจำผู้เข้าชมเมื่อรีเฟรชหน้า (เก็บค่าลักษณะใบหน้าในเครื่องนี้ภายในวัน)" : "ไม่เก็บค่าลักษณะใบหน้าในเครื่องแล้ว ใช้เฉพาะระหว่างเปิดหน้านี้", "ok");
  };
  applyPrefs(); ackUi();
  setInterval(() => { if (autoPurge(S)) { persist(); engine("ขึ้นวันใหม่: ลบข้อมูลใบหน้าของเมื่อวานแล้ว", "ok"); } }, 60000);
  $("#printNotice").onclick = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>ป้ายแจ้ง</title><body style="font-family:Prompt,sans-serif;padding:60px;text-align:center"><h1 style="font-size:40px">แจ้งการใช้กล้องวิเคราะห์</h1><p style="font-size:26px;line-height:1.7">${esc($("#notice").textContent)}</p><p style="font-size:20px;color:#555">${esc(S.event.name || "")}</p></body>`);
    w.document.close(); w.print();
  };

  // ---------- ส่งออก ----------
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const cell = v => { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v) && isNaN(+v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
  const iso = ts => new Date(ts).toISOString();
  $("#exportCsv").onclick = () => {
    const head = ["event", "visitor_id", "first_seen", "last_seen", "dwell_s", "visits", "stopped", "engaged", "attention_rate", "dominant_expression", "avg_valence", "activities"];
    const ex = EXPR_OK(); // customer mode: expression columns left empty (not measured)
    const rows = S.visitors.map(v => {
      const s = visitorStats(v);
      return [S.event.name, v.id, iso(v.first), iso(v.last), v.dwell.toFixed(1), v.visits, s.stopped ? 1 : 0, s.engaged ? 1 : 0, s.attRate.toFixed(2),
        ex ? s.dom : "", ex ? s.valence.toFixed(3) : "", v.acts.join("; ")];
    });
    download(`lensiq-booth-${S.event.date}.csv`, "﻿" + [head, ...rows].map(r => r.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  };
  $("#exportStats").onclick = () => { persist(); download(`lensiq-booth-stats-${S.event.date}.csv`, buildStatsCsv(S, statCams(), Date.now(), EXPR_OK()), "text/csv;charset=utf-8"); };
  $("#exportJson").onclick = () => {
    const m = aggregate(S, Date.now(), 0);
    const { timeline, ...summary } = m;
    const cs = camStats(S, statCams());
    download(`lensiq-booth-summary-${S.event.date}.json`, JSON.stringify({ event: S.event, generated: new Date().toISOString(), summary, cameras: cs.rows.map(({ inFrame, ...r }) => r), seenByMultipleCams: cs.multi, hourlyByCam: hourlyByCam(S, cs.rows.map(r => r.slot)), crowdTimeline: timeline }, null, 1), "application/json");
  };

  window.addEventListener("beforeunload", persist);
  document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); }); // มือถือไม่ยิง beforeunload เสมอ
  let rsT, lastW = innerWidth; addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; render(inFrameNow()); } }, 200); });
  // ทดสอบ: camera = มุมมองของกล้องหลัก (เข้ากันกับชุดทดสอบเดิม) · cams = กล้องทั้งหมดใน hub
  const camera = { get active() { return anyActive(); }, get mirrored() { return mirrored(primaryCam()); }, get deviceId() { return primaryCam()?.deviceId || ""; } };
  if (TEST) window.__booth = { get S() { return S; }, get lastFrame() { return lastFrameAll(); }, get frames() { return frames; }, get ready() { return ready; }, get running() { return running; }, persist, camera, get overlay() { return primaryCam()?.overlay; }, get cams() { return orderedCams(); }, hub, sched };
  // speed pass 2026-11-14: no model download at page load; test mode (?fakedet) loads no model, so it is ready at once
  render(0);
  if (TEST) loadOnce(); else engine("กด เริ่มกล้อง — โมเดลจะโหลดเมื่อเปิดกล้อง");
})();

if (typeof module !== "undefined" && module.exports) module.exports = { CFG, EMO, qualityFlags, dayKey, dist, blend, newState, newRuntime, runtime, dropRuntime, nearest, nearestCand, observe, noteTimeline, inFrameCount, inFrameUnion, normalizeRoles, camStats, hourlyByCam, buildStatsCsv, touchVisitor, hitBox, visitorStats, aggregate, markActivity, purgeFaces, autoPurge, serializeState, restoreState };
