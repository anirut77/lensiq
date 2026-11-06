/* วิเคราะห์ผู้เข้าชมบูธ — นับคน จำผู้เข้าชมแบบไม่ระบุตัวตน (ค่าลักษณะใบหน้าอยู่ในหน่วยความจำ/แท็บนี้ภายในวัน ไม่เก็บภาพ) */

// ================= ส่วนคำนวณ (ไม่ใช้ DOM ทดสอบแยกได้) =================
const EMO = ["neutral", "happy", "surprised", "sad", "angry", "fearful", "disgusted"];
const EMO_TH = { neutral: "เฉย ๆ", happy: "มีความสุข", surprised: "ประหลาดใจ", sad: "เศร้า", angry: "โกรธ", fearful: "กลัว", disgusted: "รังเกียจ" };
const VA = { neutral: [0, 0], happy: [0.8, 0.5], surprised: [0.2, 0.85], sad: [-0.7, -0.4], angry: [-0.7, 0.6], fearful: [-0.6, 0.7], disgusted: [-0.7, 0.3] };
const CFG = {
  MATCH: 0.5,          // ระยะห่างค่าลักษณะใบหน้าที่ถือว่าเป็นคนเดิม
  PROMOTE_MS: 1000,    // เห็นต่อเนื่องอย่างน้อย 1 วิ จึงนับเป็นผู้เข้าชม
  CAND_TTL_MS: 3000,   // ใบหน้าที่ยังไม่ยืนยัน หายไปเกินนี้ทิ้ง
  RETURN_GAP_MS: 60000,// หายไปเกิน 60 วิแล้วกลับมา = กลับมาเยี่ยมซ้ำ
  MAX_STEP_MS: 2000,   // ช่วงห่างสูงสุดที่ยังนับรวมเป็นเวลาอยู่หน้าบูธ
  STOP_S: 5,           // หยุดชมตั้งแต่ 5 วิขึ้นไป
  TIMELINE_MS: 5000,   // ความละเอียดกราฟจำนวนคนในกล้อง
  YAW_LIMIT: 0.35,
  MAX_FACES: 6,        // วิเคราะห์ไม่เกิน 6 ใบหน้าต่อภาพ (ใหญ่สุดก่อน)
  RECHECK_EVERY: 10,   // ตรวจตัวตนของแทร็กที่ผูกแล้วซ้ำทุก 10 ภาพ
  TRACK_EMA: 0.3       // ค่าเฉลี่ยค่าลักษณะใบหน้าต่อแทร็ก (เก็บในหน่วยความจำเท่านั้น)
};
const DWELL_BUCKETS = [[0, 5, "< 5 วิ"], [5, 15, "5–15 วิ"], [15, 30, "15–30 วิ"], [30, 60, "30–60 วิ"], [60, 180, "1–3 นาที"], [180, Infinity, "> 3 นาที"]];
const LQT = typeof LQTrack !== "undefined" ? LQTrack : typeof require === "function" ? require("./lensiq-track.js") : null;

const dayKey = (ts = Date.now()) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function dist(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }
function blend(a, b, w) { return Array.from(a, (x, i) => +(x * (1 - w) + b[i] * w).toFixed(4)); }

function newState(name = "", date = dayKey()) {
  return { event: { name, date }, seq: 0, visitors: [], timeline: [], desc: {}, descDay: dayKey(), cands: [] };
}

/* สถานะระหว่างทำงาน (ไม่บันทึกลงที่เก็บข้อมูล): ตัวติดตามตำแหน่งใบหน้า + แทร็ก -> ผู้เข้าชม + ค่าเฉลี่ยค่าลักษณะใบหน้าต่อแทร็ก */
const RUNTIME = new WeakMap();
function newRuntime() { return { T: LQT.newTracker(LQT.PRESET.face), bind: new Map(), desc: new Map(), cand: new Map(), frame: 0 }; }
function runtime(S) { let R = RUNTIME.get(S); if (!R) { R = newRuntime(); RUNTIME.set(S, R); } return R; }

function nearest(map, desc, used) {
  let best = null, bd = Infinity;
  for (const id in map) { if (used.has(id)) continue; const d = dist(map[id], desc); if (d < bd) { bd = d; best = id; } }
  return bd < CFG.MATCH ? best : null;
}
/* ผู้รอยืนยันที่ใกล้ที่สุด (เดิมใช้ตัวแรกที่เข้าเกณฑ์) */
function nearestCand(cands, desc, used) {
  let best = null, bd = CFG.MATCH;
  for (const c of cands) { if (used.has(c)) continue; const d = dist(c.desc, desc); if (d < bd) { bd = d; best = c; } }
  return best;
}

function touchVisitor(v, f, now) {
  const gap = now - v.last;
  if (gap > CFG.RETURN_GAP_MS) { v.visits++; v.arrivals.push(now); }
  else v.dwell += Math.min(gap, CFG.MAX_STEP_MS) / 1000;
  v.last = now; v.frames++;
  if (f.att) v.att++;
  f.e.forEach((p, i) => { v.emo[i] += p; });
  v.vSum += f.v;
}

function promote(S, c, now) {
  const id = "V" + String(++S.seq).padStart(3, "0");
  const v = { id, first: c.first, last: c.first, dwell: 0, visits: 1, arrivals: [c.first], frames: 0, att: 0, emo: EMO.map(() => 0), vSum: 0, acts: [] };
  const step = (now - c.first) / Math.max(1, c.obs.length);
  c.obs.forEach((o, k) => touchVisitor(v, o, c.first + step * (k + 1)));
  S.visitors.push(v); S.desc[id] = c.desc;
  S.cands = S.cands.filter(x => x !== c);
  return id;
}

/* รับผลตรวจจับหนึ่งรอบ faces=[{desc,e,v,att,area,box:{x,y,w,h} 0..1,score?}]
 * คืน [{id|null, face, tid, confirmed, box}] เฉพาะใบหน้าที่วิเคราะห์ (ไม่เกิน MAX_FACES)
 * ตำแหน่ง (แทร็ก) เป็นตัวยึดตัวตน: ค้นค่าลักษณะใบหน้า (nearest) เฉพาะแทร็กใหม่ แทร็กที่ยังไม่ผูก หรือทุก RECHECK_EVERY ภาพ */
function observe(S, faces, now, R = runtime(S)) {
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
    const d = R.desc.get(t.id);
    for (const id in S.desc) { if (usedV.has(id)) continue; const dd = dist(S.desc[id], d); if (dd < CFG.MATCH) pairs.push({ i: k, key: id, dist: dd }); }
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
      touchVisitor(S.visitors.find(x => x.id === id), f, now);
      S.desc[id] = S.desc[id] ? blend(S.desc[id], d, 0.1) : Array.from(d);
    } else {
      let c = R.cand.get(t.id);
      if (c && (!S.cands.includes(c) || usedC.has(c))) c = null;
      if (!c) c = nearestCand(S.cands, d, usedC);
      if (!c) { c = { desc: Array.from(d), first: now, last: now, obs: [] }; S.cands.push(c); }
      usedC.add(c); R.cand.set(t.id, c);
      c.last = now; c.desc = blend(c.desc, f.desc, 0.3);
      if (c.obs.length < 50) c.obs.push(f);
      if (now - c.first >= CFG.PROMOTE_MS) { id = promote(S, c, now); R.bind.set(t.id, id); R.cand.delete(t.id); }
    }
    out.push({ id, face: f, tid: t.id, confirmed: !!t.confirmed, box: t.box });
  }
  S.cands = S.cands.filter(c => now - c.last < CFG.CAND_TTL_MS);
  // กราฟจำนวนคน: นับเฉพาะแทร็กที่ยืนยันแล้วและผูกกับผู้เข้าชม
  const n = out.filter(r => r.id && r.confirmed).length;
  const slot = Math.floor(now / CFG.TIMELINE_MS) * CFG.TIMELINE_MS, last = S.timeline.at(-1);
  if (last && last.t === slot) last.n = Math.max(last.n, n);
  else S.timeline.push({ t: slot, n });
  if (S.timeline.length > 20000) S.timeline.splice(0, S.timeline.length - 20000);
  return out;
}
const inFrameCount = res => res.filter(r => r.id && r.confirmed).length;

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
  const hourly = []; for (let h = h0; h <= h1; h++) hourly.push({ label: String(h).padStart(2, "0") + ":00", value: hours[h] || 0 });
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

function purgeFaces(S) { S.desc = {}; S.cands = []; S.descDay = dayKey(); RUNTIME.delete(S); }
function autoPurge(S, now = Date.now()) { if (S.descDay !== dayKey(now)) { purgeFaces(S); S.descDay = dayKey(now); return true; } return false; }

/* ความเป็นส่วนตัว: remember=false (ค่าเริ่มต้น) -> 'booth-state' ใน localStorage ไม่มี desc เลย
 * ค่าลักษณะใบหน้าอยู่ใน sessionStorage 'booth-desc' (หายเมื่อปิดแท็บ) / remember=true -> เก็บใน 'booth-state' ภายในวัน */
function serializeState(S, remember) {
  const { cands, desc, ...rest } = S;
  return remember
    ? { state: JSON.stringify({ ...rest, desc: desc || {} }), session: null }
    : { state: JSON.stringify(rest), session: JSON.stringify({ day: S.descDay, desc: desc || {} }) };
}
function restoreState(lsRaw, ssRaw, remember, now = Date.now()) {
  let S = null, ss = null;
  try { S = JSON.parse(lsRaw); } catch { S = null; }
  try { ss = JSON.parse(ssRaw); } catch { ss = null; }
  if (!S || typeof S !== "object" || !S.event) S = newState("", dayKey(now));
  if (!Array.isArray(S.visitors)) S.visitors = [];
  if (!Array.isArray(S.timeline)) S.timeline = [];
  if (!Number.isFinite(S.seq)) S.seq = S.visitors.length;
  const legacy = S.desc && typeof S.desc === "object" ? S.desc : null;
  const sess = ss && ss.desc && typeof ss.desc === "object" && ss.day === S.descDay ? ss.desc : null;
  // remember: ใช้ค่าจาก localStorage (ข้อมูลเดิมก่อนมีตัวเลือกนี้ก็อ่านได้) / ไม่จำ: ใช้ค่าของแท็บนี้ หรือย้ายค่าเดิมมาไว้ในแท็บ
  S.desc = (remember ? legacy || sess : sess || legacy) || {};
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
  const KEY = "booth-state", DESC_KEY = "booth-desc", PREF_KEY = "booth-prefs";
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDur = s => s < 60 ? `${Math.round(s)} วิ` : `${Math.floor(s / 60)} นาที ${Math.round(s % 60)} วิ`;
  const fmtClock = ts => new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const video = $("#video"), overlay = $("#overlay");
  const TEST = typeof LQDetect !== "undefined" && LQDetect.isTest();
  const ssGet = k => { try { return sessionStorage.getItem(k); } catch { return null; } };

  let prefs = { v: 1, remember: false };
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY)); if (p && typeof p === "object") prefs.remember = p.remember === true; } catch {}

  let S = restoreState(localStorage.getItem(KEY), ssGet(DESC_KEY), prefs.remember);
  const persist = () => {
    const o = serializeState(S, prefs.remember);
    try { localStorage.setItem(KEY, o.state); } catch { engine("พื้นที่จัดเก็บเต็ม กรุณาส่งออกข้อมูลแล้วเริ่มงานใหม่", "err"); }
    try { if (o.session) sessionStorage.setItem(DESC_KEY, o.session); else sessionStorage.removeItem(DESC_KEY); } catch {}
  };
  persist(); // ล้าง desc เดิมออกจาก localStorage ทันทีเมื่อไม่ได้เลือกจำ

  const ef = $("#eventForm");
  ef.name.value = S.event.name; ef.date.value = S.event.date || dayKey();

  let ready = false, running = false, lastFrame = [], fpsTimes = [];

  function engine(msg, cls = "") { const e = $("#engine"); e.textContent = msg; e.className = "engine " + cls; }

  const camBox = video.parentElement, camBtn = $("#camStart");
  function layoutCam() { // ขนาด overlay และสัดส่วนกรอบตามกล้องจริง (รองรับแนวตั้งบนมือถือ)
    const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
    if (overlay.width !== vw || overlay.height !== vh) { overlay.width = vw; overlay.height = vh; }
    camBox.style.aspectRatio = `${vw} / ${vh}`;
    camBox.classList.toggle("tall", vh > vw);
  }
  const camState = () => {
    const on = camera.active;
    camBox.classList.toggle("on", on);
    camBox.classList.toggle("mirror", camera.mirrored);
    camBtn.textContent = on ? "ปิดกล้อง" : "เริ่มกล้อง";
    camBtn.classList.toggle("primary", !on); camBtn.classList.toggle("ghost", on);
  };
  const camErr = e => {
    if (!e || e.name === "AbortError") return;
    console.warn(e);
    if (e.name === "Insecure") { engine(HTTPS_MSG, "err"); showHttpsNote($("#engine")); }
    else engine("เปิดกล้องไม่ได้: " + LQCam.errorText(e), "err");
  };
  const camera = LQCam.create(video, {
    facing: "user", ideal: { width: 1280, height: 720 }, persistKey: "booth-cam",
    onChange: (c, ev) => {
      camState(); layoutCam();
      if (ev.type === "paused" && ready) engine("พักกล้องไว้ขณะสลับแอป จะเปิดใหม่อัตโนมัติเมื่อกลับมา");
      else if ((ev.type === "started" || ev.type === "resumed") && ready) engine("กล้องพร้อม" + (c.facing === "environment" ? " (กล้องหลัง)" : "") + (running ? "" : " — กด เริ่มนับผู้เข้าชม"), "ok");
      else if (ev.type === "ended") engine("กล้องหลุดการเชื่อมต่อ กด เริ่มกล้อง อีกครั้ง", "err");
    },
    onError: (c, e) => camErr(e)
  });
  const ctl = document.createElement("div"); ctl.className = "cam-ctl"; camBox.append(ctl);
  video.addEventListener("resize", layoutCam);
  addEventListener("orientationchange", () => setTimeout(layoutCam, 350));

  // กล้องเปิดเมื่อกดปุ่มเท่านั้น (ไม่ขอสิทธิ์กล้องตอนโหลดหน้า)
  camBtn.onclick = async () => {
    if (camera.active) {
      if (running) toggleCount();
      camera.stop(); camState(); overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
      engine(ready ? "ปิดกล้องแล้ว" : $("#engine").textContent); return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return camErr(Object.assign(new Error(HTTPS_MSG), { name: "Insecure" }));
    camBtn.disabled = true; engine("กำลังเปิดกล้อง...");
    try {
      await camera.start();
      if (!ctl.childElementCount) camera.attach(ctl);
      layoutCam(); camState();
      if (ready) engine("กล้องพร้อม — กด เริ่มนับผู้เข้าชม", "ok");
      else engine("กล้องพร้อม กำลังโหลดโมเดล...");
    } catch (e) { camErr(e); }
    finally { camBtn.disabled = false; }
  };

  let backendName = "";
  async function init() {
    engine("กำลังโหลดโมเดลวิเคราะห์ใบหน้า...");
    try {
      if (TEST) backendName = "test";
      else {
        backendName = await LQDetect.tfBackend();
        await Promise.all(["tinyFaceDetector", "faceLandmark68Net", "faceRecognitionNet", "faceExpressionNet"].map(n => faceapi.nets[n].loadFromUri("vendor/models/")));
      }
      ready = true;
      engine(`โมเดลพร้อม (ตัวประมวลผล: ${backendName.toUpperCase()}${backendName === "webgl" ? "" : " — อาจช้ากว่าปกติ"}) — ${camera.active ? "กด เริ่มนับผู้เข้าชม" : "กด เริ่มกล้อง"}`, "ok");
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

  // โหมดทดสอบ (?fakedet บน localhost): กรอบจากสคริปต์ทดสอบ ค่าลักษณะใบหน้าสังเคราะห์ ไม่โหลดโมเดล
  function fakeFaces(now) {
    const dets = LQDetect.fake(camera.deviceId || "c1", now) || [];
    return dets.map((d, i) => {
      const desc = d.desc || Array.from({ length: 128 }, (_, k) => (k === (d.person ?? i) % 128 ? 1 : 0));
      const e = EMO.map((_, k) => (k ? 0 : 1));
      return { desc, e, v: 0, att: 1, area: d.w * d.h, box: { x: d.x, y: d.y, w: d.w, h: d.h }, score: d.score };
    });
  }
  async function detect(now) {
    if (TEST) return fakeFaces(now);
    const W = video.videoWidth, H = video.videoHeight;
    const rs = await faceapi.detectAllFaces(video, detOpts).withFaceLandmarks().withFaceDescriptors().withFaceExpressions();
    return rs.map(r => {
      const lm = r.landmarks, le = center(lm.getLeftEye()), re = center(lm.getRightEye()), nose = lm.getNose()[3];
      const yaw = (nose.x - (le.x + re.x) / 2) / (Math.abs(re.x - le.x) || 1);
      const e = EMO.map(k => +(r.expressions[k] || 0).toFixed(3));
      const b = r.detection.box;
      return { desc: r.descriptor, e, v: e.reduce((s, p, i) => s + p * VA[EMO[i]][0], 0), att: Math.abs(yaw) < CFG.YAW_LIMIT ? 1 : 0, area: b.width * b.height, box: LQT.toNorm(b, W, H), score: r.detection.score };
    });
  }

  let picked = null; // กรอบที่เจ้าหน้าที่แตะล่าสุด (เน้นสี)
  function draw(res) {
    const ctx = overlay.getContext("2d"), W = overlay.width, H = overlay.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = "600 22px Prompt, sans-serif"; ctx.lineWidth = 3;
    res.forEach(({ id, face, box: b, confirmed }) => {
      const bw = b.w * W, bh = b.h * H, y = b.y * H;
      const x = camera.mirrored ? W - (b.x + b.w) * W : b.x * W; // กล้องหน้า: วาดแบบกระจกให้ตรงกับวิดีโอ ตัวอักษรไม่กลับด้าน
      ctx.strokeStyle = id && picked && picked.id === id && performance.now() - picked.at < 2500 ? "#22d3ee" : id && confirmed ? (face.att ? "#2ecc71" : "#e6a23c") : "#9fb1bc";
      ctx.strokeRect(x, y, bw, bh);
      const label = id || "กำลังจำ...";
      const tw = ctx.measureText(label).width + 12, ly = Math.max(30, y);
      ctx.fillStyle = "rgba(14,20,48,.85)"; ctx.fillRect(x, ly - 30, tw, 28);
      ctx.fillStyle = "#fff"; ctx.fillText(label, x + 6, ly - 9);
    });
  }

  async function loop() {
    let lastSave = 0, lastUi = 0;
    while (running) {
      const t0 = performance.now();
      if (!camera.active || !video.videoWidth) { await sleep(500); continue; } // กล้องพักอยู่ (สลับแอป/สลับกล้อง)
      try {
        const faces = await detect(Date.now());
        if (!running) break;
        const now = Date.now();
        if (autoPurge(S, now)) persist();
        const res = observe(S, faces, now);
        lastFrame = res.map(r => ({ id: r.id, tid: r.tid, box: { ...r.box }, confirmed: r.confirmed }));
        draw(res);
        const n = inFrameCount(res);
        fpsTimes.push(performance.now()); fpsTimes = fpsTimes.filter(t => t > performance.now() - 3000);
        $("#fps").textContent = `${n} คนในกล้อง · ${(fpsTimes.length / 3).toFixed(1)} fps`;
        if (now - lastUi > 1000) { render(n); lastUi = now; }
        if (now - lastSave > 5000) { persist(); lastSave = now; }
      } catch (e) { console.warn(e); }
      await sleep(Math.max(0, 250 - (performance.now() - t0))); // สูงสุดประมาณ 4 fps และไม่ซ้อนงาน
    }
  }

  function toggleCount() {
    if (!running) {
      if (!ready) return engine($("#engine").className.includes("err") ? $("#engine").textContent : "ระบบกำลังโหลดโมเดล กรุณารอสักครู่", $("#engine").className.includes("err") ? "err" : "");
      if (!camera.active) return engine("กด เริ่มกล้อง ก่อน แล้วจึงเริ่มนับผู้เข้าชม", "err");
    }
    running = !running;
    $("#toggle").textContent = running ? "หยุดนับ" : "เริ่มนับผู้เข้าชม";
    if (running) loop(); else { lastFrame = []; overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height); persist(); render(0); $("#fps").textContent = "หยุดแล้ว"; }
  }
  $("#toggle").onclick = toggleCount;

  // ---------- กิจกรรม: แตะกรอบใบหน้าบนภาพเพื่อเลือกผู้เข้าร่วม ----------
  const joinMsg = (t, c) => { const msg = $("#joinMsg"); msg.textContent = t; msg.className = "form-msg " + c; };
  function markJoin(id) {
    const act = $("#activity").value.trim() || "กิจกรรม";
    const r = markActivity(S, id, act);
    picked = { id, at: performance.now() };
    joinMsg(r === "ok" ? `บันทึก ${id} เข้าร่วม "${act}" แล้ว` : r === "already" ? `${id} เข้าร่วม "${act}" ไปแล้ว` : `ไม่พบ ${id}`, r === "ok" ? "ok" : r === "already" ? "" : "err");
    persist(); render(inFrameCount(lastFrame));
  }
  function join() {
    if (!running) return joinMsg("กรุณากดเริ่มนับผู้เข้าชมก่อน", "err");
    const known = lastFrame.filter(r => r.id);
    if (!known.length) return joinMsg("ยังไม่พบใบหน้าที่ระบบจำได้ ให้ผู้เข้าร่วมหันหน้าเข้ากล้อง 1-2 วินาที", "err");
    if (known.length > 1) return joinMsg(`มี ${known.length} คนในกล้อง แตะกรอบใบหน้าของผู้เข้าร่วมบนภาพ`, "");
    markJoin(known[0].id);
  }
  overlay.addEventListener("click", ev => {
    if (!running) return joinMsg("กรุณากดเริ่มนับผู้เข้าชมก่อน แล้วแตะกรอบใบหน้า", "err");
    const r = overlay.getBoundingClientRect(); if (!r.width || !r.height) return;
    let fx = (ev.clientX - r.left) / r.width; const fy = (ev.clientY - r.top) / r.height;
    if (camera.mirrored) fx = 1 - fx;
    const hit = hitBox(lastFrame, fx, fy);
    if (!hit) return joinMsg("ไม่พบกรอบใบหน้าตรงจุดที่แตะ", "err");
    if (!hit.id) return joinMsg("ระบบยังจำคนนี้ไม่ได้ รอ 1-2 วินาทีแล้วแตะอีกครั้ง", "err");
    markJoin(hit.id);
  });
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
      if (it.value > 0) svgEl("path", { class: "bar", d: `M${x + 2},${H - B}V${H - B - h + Math.min(4, h)}q0,-${Math.min(4, h)} ${Math.min(4, w / 2)},-${Math.min(4, h)}H${x + 2 + w - Math.min(4, w / 2)}q${Math.min(4, w / 2)},0 ${Math.min(4, w / 2)},${Math.min(4, h)}V${H - B}Z` }, svg);
      if (i % every === 0) svgEl("text", { x: x + bw / 2, y: H - 8, "text-anchor": "middle" }, svg).textContent = it.label;
      const hit = svgEl("rect", { x, y: T, width: bw, height: H - T - B, fill: "transparent" }, svg);
      const tipFn = ev => showTip(`<b>${esc(it.label)}</b><br>${it.value} ${unit}`, ev.clientX, ev.clientY);
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
      ["Valence เฉลี่ย", (m.valence > 0 ? "+" : "") + m.valence.toFixed(2), "บวก / ลบ"]
    ].map(([k, v, s]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");
    const acts = Object.entries(m.acts);
    $("#acts").innerHTML = acts.length ? acts.map(([a, n]) => `<li><span>${esc(a)}</span><b>${n} คน</b></li>`).join("") : `<li class="empty">ยังไม่มีผู้เข้าร่วม</li>`;
    barChart($("#hourly"), m.hourly);
    lineChart($("#crowd"), m.timeline.filter(p => p.t > Date.now() - 12 * 3600e3));
    barChart($("#dwell"), m.dwellHist);
    barChart($("#emo"), m.emoCount);
    const rows = S.visitors.slice().reverse().slice(0, 300).map(v => {
      const s = visitorStats(v);
      return `<tr><td>${v.id}</td><td>${fmtClock(v.first)}</td><td>${fmtClock(v.last)}</td><td class="n">${fmtDur(v.dwell)}</td><td class="n">${v.visits}</td><td>${EMO_TH[s.dom]}</td><td class="n">${(s.valence > 0 ? "+" : "") + s.valence.toFixed(2)}</td><td class="n">${Math.round(s.attRate * 100)}%</td><td>${esc(v.acts.join(", ") || "–")}</td></tr>`;
    }).join("");
    $("#visitors").innerHTML = `<thead><tr><th>รหัส</th><th>เห็นครั้งแรก</th><th>ล่าสุด</th><th class="n">เวลาอยู่</th><th class="n">ครั้งที่มา</th><th>สีหน้าหลัก</th><th class="n">Valence</th><th class="n">มองบูธ</th><th>กิจกรรม</th></tr></thead><tbody>${rows || `<tr><td colspan="9" class="hint">ยังไม่มีผู้เข้าชม</td></tr>`}</tbody>`;
  }

  // ---------- ตั้งค่างาน / ความเป็นส่วนตัว ----------
  ef.addEventListener("submit", e => {
    e.preventDefault();
    if (!ef.name.value.trim()) return ef.name.focus();
    if (S.visitors.length && !confirm("เริ่มงานใหม่จะลบข้อมูลทั้งหมดของงานเดิม (ควรส่งออกก่อน) ต้องการดำเนินการต่อ?")) return;
    S = newState(ef.name.value.trim(), ef.date.value || dayKey());
    lastFrame = [];
    persist(); render(0);
  });
  $("#purge").onclick = () => {
    if (!confirm("ลบข้อมูลลักษณะใบหน้าทั้งหมดของวันนี้? สถิติจะยังอยู่ แต่ระบบจะจำคนเดิมไม่ได้อีก (นับเป็นคนใหม่)")) return;
    purgeFaces(S); lastFrame = []; persist(); engine("ล้างข้อมูลใบหน้าแล้ว สถิติรวมยังอยู่", "ok");
  };
  const NOTICE = {
    off: "พื้นที่นี้มีการวิเคราะห์ภาพจากกล้องแบบไม่ระบุตัวตน เพื่อนับจำนวนผู้เข้าชมและวัดความสนใจต่อบูธ ระบบไม่บันทึกภาพหรือวิดีโอ ค่าลักษณะใบหน้าใช้เพียงเพื่อไม่ให้นับคนซ้ำ อยู่ในเครื่องนี้ระหว่างเปิดหน้าเท่านั้น และถูกลบเมื่อปิดหน้าหรือขึ้นวันใหม่ หากไม่ต้องการเข้าร่วม กรุณาแจ้งเจ้าหน้าที่",
    on: "พื้นที่นี้มีการวิเคราะห์ภาพจากกล้องแบบไม่ระบุตัวตน เพื่อนับจำนวนผู้เข้าชมและวัดความสนใจต่อบูธ ระบบไม่บันทึกภาพหรือวิดีโอ ค่าลักษณะใบหน้าใช้เพียงเพื่อไม่ให้นับคนซ้ำ เก็บไว้ในเครื่องนี้ไม่เกินสิ้นวันและถูกลบอัตโนมัติเมื่อขึ้นวันใหม่ หากไม่ต้องการเข้าร่วม กรุณาแจ้งเจ้าหน้าที่"
  };
  const remember = $("#remember");
  const applyPrefs = () => { remember.checked = prefs.remember; $("#notice").textContent = prefs.remember ? NOTICE.on : NOTICE.off; };
  remember.onchange = () => {
    prefs.remember = remember.checked;
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
    persist(); applyPrefs();
    engine(prefs.remember ? "จะจำผู้เข้าชมเมื่อรีเฟรชหน้า (เก็บค่าลักษณะใบหน้าในเครื่องนี้ภายในวัน)" : "ไม่เก็บค่าลักษณะใบหน้าในเครื่องแล้ว ใช้เฉพาะระหว่างเปิดหน้านี้", "ok");
  };
  applyPrefs();
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
    const rows = S.visitors.map(v => { const s = visitorStats(v); return [S.event.name, v.id, iso(v.first), iso(v.last), v.dwell.toFixed(1), v.visits, s.stopped ? 1 : 0, s.engaged ? 1 : 0, s.attRate.toFixed(2), s.dom, s.valence.toFixed(3), v.acts.join("; ")]; });
    download(`lensiq-booth-${S.event.date}.csv`, "﻿" + [head, ...rows].map(r => r.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  };
  $("#exportJson").onclick = () => {
    const m = aggregate(S, Date.now(), 0);
    const { timeline, ...summary } = m;
    download(`lensiq-booth-summary-${S.event.date}.json`, JSON.stringify({ event: S.event, generated: new Date().toISOString(), summary, crowdTimeline: timeline }, null, 1), "application/json");
  };

  window.addEventListener("beforeunload", persist);
  document.addEventListener("visibilitychange", () => { if (document.hidden) persist(); }); // มือถือไม่ยิง beforeunload เสมอ
  let rsT, lastW = innerWidth; addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; render(inFrameCount(lastFrame)); } }, 200); });
  if (TEST) window.__booth = { get S() { return S; }, get lastFrame() { return lastFrame; }, get ready() { return ready; }, get running() { return running; }, persist, camera, overlay };
  render(0); init();
})();

if (typeof module !== "undefined" && module.exports) module.exports = { CFG, EMO, dayKey, dist, blend, newState, newRuntime, runtime, nearest, nearestCand, observe, inFrameCount, hitBox, visitorStats, aggregate, markActivity, purgeFaces, autoPurge, serializeState, restoreState };
