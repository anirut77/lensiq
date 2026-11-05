/* วิเคราะห์ผู้เข้าชมบูธ — นับคน จำผู้เข้าชมแบบไม่ระบุตัวตน (เก็บเฉพาะค่าลักษณะใบหน้าภายในวัน ไม่เก็บภาพ) */

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
  YAW_LIMIT: 0.35
};
const DWELL_BUCKETS = [[0, 5, "< 5 วิ"], [5, 15, "5–15 วิ"], [15, 30, "15–30 วิ"], [30, 60, "30–60 วิ"], [60, 180, "1–3 นาที"], [180, Infinity, "> 3 นาที"]];

const dayKey = (ts = Date.now()) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function dist(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return Math.sqrt(s); }
function blend(a, b, w) { return Array.from(a, (x, i) => +(x * (1 - w) + b[i] * w).toFixed(4)); }

function newState(name = "", date = dayKey()) {
  return { event: { name, date }, seq: 0, visitors: [], timeline: [], desc: {}, descDay: dayKey(), cands: [] };
}

function nearest(map, desc, used) {
  let best = null, bd = Infinity;
  for (const id in map) { if (used.has(id)) continue; const d = dist(map[id], desc); if (d < bd) { bd = d; best = id; } }
  return bd < CFG.MATCH ? best : null;
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

/* รับผลตรวจจับหนึ่งรอบ faces=[{desc,e,v,att,area}] คืน [{id|null, face}] */
function observe(S, faces, now) {
  const used = new Set(), out = [];
  const order = faces.map((f, i) => i).sort((a, b) => faces[b].area - faces[a].area);
  for (const i of order) {
    const f = faces[i];
    let id = nearest(S.desc, f.desc, used);
    if (id) {
      const v = S.visitors.find(x => x.id === id);
      touchVisitor(v, f, now);
      S.desc[id] = blend(S.desc[id], f.desc, 0.1);
      used.add(id); out[i] = { id, face: f }; continue;
    }
    // ยังไม่รู้จัก -> จับคู่กับใบหน้าที่รอการยืนยัน
    let c = S.cands.find(c => !used.has(c) && dist(c.desc, f.desc) < CFG.MATCH);
    if (!c) { c = { desc: Array.from(f.desc), first: now, last: now, obs: [] }; S.cands.push(c); }
    used.add(c);
    c.last = now; c.desc = blend(c.desc, f.desc, 0.3); c.obs.push(f);
    if (now - c.first >= CFG.PROMOTE_MS) {
      id = "V" + String(++S.seq).padStart(3, "0");
      const v = { id, first: c.first, last: c.first, dwell: 0, visits: 1, arrivals: [c.first], frames: 0, att: 0, emo: EMO.map(() => 0), vSum: 0, acts: [] };
      const step = (now - c.first) / Math.max(1, c.obs.length);
      c.obs.forEach((o, k) => touchVisitor(v, o, c.first + step * (k + 1)));
      S.visitors.push(v); S.desc[id] = c.desc;
      S.cands = S.cands.filter(x => x !== c);
      used.add(id);
    }
    out[i] = { id: id || null, face: f };
  }
  S.cands = S.cands.filter(c => now - c.last < CFG.CAND_TTL_MS);
  const slot = Math.floor(now / CFG.TIMELINE_MS) * CFG.TIMELINE_MS, last = S.timeline.at(-1);
  if (last && last.t === slot) last.n = Math.max(last.n, faces.length);
  else S.timeline.push({ t: slot, n: faces.length });
  if (S.timeline.length > 20000) S.timeline.splice(0, S.timeline.length - 20000);
  return out;
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

function purgeFaces(S) { S.desc = {}; S.cands = []; S.descDay = dayKey(); }
function autoPurge(S, now = Date.now()) { if (S.descDay !== dayKey(now)) { purgeFaces(S); return true; } return false; }

// ================= ส่วนหน้าจอ =================
// ---------- กล้องบนมือถือ/แท็บเล็ต: สลับหน้า/หลัง เลือกอุปกรณ์ หยุดเมื่อซ่อนหน้า ----------
const HTTPS_MSG = "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด";
function createCamera(video, { width = 1280, height = 720, onChange, onError } = {}) {
  const cam = { stream: null, facing: "user", deviceId: "", currentId: "", devices: [], mirror: true, active: false, paused: false };
  const escA = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  video.muted = true; video.playsInline = true; video.autoplay = true;
  video.setAttribute("playsinline", ""); video.setAttribute("muted", ""); video.setAttribute("autoplay", "");
  cam.stop = () => { cam.stream?.getTracks().forEach(t => t.stop()); cam.stream = null; cam.active = false; video.srcObject = null; };
  cam.start = async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(HTTPS_MSG), { name: "Insecure" });
    cam.stop();
    const base = { width: { ideal: width }, height: { ideal: height } };
    const want = cam.deviceId ? { ...base, deviceId: { exact: cam.deviceId } } : { ...base, facingMode: { ideal: cam.facing } };
    let s;
    try { s = await navigator.mediaDevices.getUserMedia({ video: want, audio: false }); }
    catch (e) {
      if (!["OverconstrainedError", "NotFoundError", "NotReadableError"].includes(e.name) || !(cam.deviceId || cam.facing !== "user")) throw e;
      cam.deviceId = ""; s = await navigator.mediaDevices.getUserMedia({ video: base, audio: false });
    }
    cam.stream = s; video.srcObject = s;
    try { await video.play(); } catch (e) { console.warn("video.play", e); }
    if (!video.videoWidth) await new Promise(r => { video.addEventListener("loadedmetadata", r, { once: true }); setTimeout(r, 3000); });
    const tr = s.getVideoTracks()[0], st = tr?.getSettings?.() || {}, label = tr?.label || "";
    try { cam.devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput" && d.deviceId); } catch { cam.devices = []; }
    const fm = st.facingMode || (/back|rear|environment|หลัง/i.test(label) ? "environment" : /front|user|หน้า|facetime/i.test(label) ? "user" : cam.deviceId ? "user" : cam.facing);
    cam.facing = fm === "environment" ? "environment" : "user";
    cam.mirror = cam.facing === "user"; // กลับด้านภาพพรีวิวเฉพาะกล้องหน้า
    cam.currentId = st.deviceId || "";
    cam.active = true;
    cam.renderControls?.();
    onChange?.(cam);
    return cam;
  };
  cam.flip = () => { cam.facing = cam.facing === "user" ? "environment" : "user"; cam.deviceId = ""; return cam.start(); };
  cam.use = id => { cam.deviceId = id; return cam.start(); };
  /* ปุ่มสลับกล้อง + ตัวเลือกกล้อง (แสดงเมื่อมีมากกว่า 1 ตัว) วางทับมุมขวาบนของกรอบกล้อง */
  cam.mountControls = host => {
    const box = document.createElement("div"); box.className = "cam-ctl"; box.hidden = true;
    box.innerHTML = `<button type="button" class="cam-flip" aria-label="สลับกล้องหน้า/หลัง" title="สลับกล้องหน้า/หลัง"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h11l-3-3M20 16H9l3 3"/></svg><span>สลับกล้อง</span></button><select class="cam-pick" aria-label="เลือกกล้อง"></select>`;
    host.append(box);
    const flip = box.querySelector(".cam-flip"), pick = box.querySelector(".cam-pick");
    const run = p => { box.classList.add("busy"); p.catch(e => onError?.(e)).finally(() => box.classList.remove("busy")); };
    flip.onclick = () => run(cam.flip());
    pick.onchange = () => run(cam.use(pick.value));
    cam.renderControls = () => {
      box.hidden = cam.devices.length < 2;
      pick.innerHTML = cam.devices.map((d, i) => `<option value="${escA(d.deviceId)}">${escA(d.label || "กล้อง " + (i + 1))}</option>`).join("");
      if (cam.currentId) pick.value = cam.currentId;
    };
  };
  // หยุดกล้องเมื่อสลับแอป/ล็อกจอ (ประหยัดแบตและคืนกล้องให้แอปอื่น) แล้วเปิดใหม่เมื่อกลับมา
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (cam.stream) { cam.paused = true; cam.stop(); onChange?.(cam); } }
    else if (cam.paused) { cam.paused = false; cam.start().catch(e => onError?.(e)); }
  });
  window.addEventListener("pagehide", () => { if (cam.stream) { cam.paused = true; cam.stop(); } });
  window.addEventListener("pageshow", e => { if (e.persisted && cam.paused) { cam.paused = false; cam.start().catch(err => onError?.(err)); } });
  return cam;
}
/* ข้อความเตือนเมื่อเปิดผ่าน http บนเครื่องอื่น (กล้องใช้ได้เฉพาะ https / localhost) */
function showHttpsNote(before) {
  if (window.isSecureContext || document.querySelector(".https-note")) return;
  const p = document.createElement("p"); p.className = "https-note"; p.setAttribute("role", "alert");
  p.innerHTML = `บนมือถือต้องเปิดผ่าน <b>https://</b> — ดูวิธีในหน้า <a href="cameras.html">ระบบทั้งหมด</a>`;
  before.before(p);
}

if (typeof document !== "undefined" && typeof faceapi !== "undefined") (() => {
  const KEY = "booth-state";
  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDur = s => s < 60 ? `${Math.round(s)} วิ` : `${Math.floor(s / 60)} นาที ${Math.round(s % 60)} วิ`;
  const fmtClock = ts => new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  const video = $("#video"), overlay = $("#overlay");

  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!S || !S.event) S = newState("", dayKey());
  S.cands = [];
  autoPurge(S);
  const persist = () => { try { const { cands, ...rest } = S; localStorage.setItem(KEY, JSON.stringify(rest)); } catch { engine("พื้นที่จัดเก็บเต็ม กรุณาส่งออกข้อมูลแล้วเริ่มงานใหม่", "err"); } };

  const ef = $("#eventForm");
  ef.name.value = S.event.name; ef.date.value = S.event.date || dayKey();

  let ready = false, running = false, lastFrame = [], fpsTimes = [];

  function engine(msg, cls = "") { const e = $("#engine"); e.textContent = msg; e.className = "engine " + cls; }

  async function initBackend() {
    const tf = faceapi.tf;
    tf.setWasmPaths("vendor/");
    for (const name of ["webgl", "wasm", "cpu"]) {
      try { if (await tf.setBackend(name)) { await tf.ready(); return name; } } catch (e) { console.warn(name, e); }
    }
    throw new Error("no backend");
  }

  const camBox = video.parentElement;
  function layoutCam() { // ขนาด overlay และสัดส่วนกรอบตามกล้องจริง (รองรับแนวตั้งบนมือถือ)
    const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
    if (overlay.width !== vw || overlay.height !== vh) { overlay.width = vw; overlay.height = vh; }
    camBox.style.aspectRatio = `${vw} / ${vh}`;
    camBox.classList.toggle("tall", vh > vw);
  }
  const camera = createCamera(video, {
    onChange: c => { camBox.classList.toggle("mirror", c.mirror); layoutCam(); if (!c.active && ready) engine("พักกล้องไว้ขณะสลับแอป จะเปิดใหม่อัตโนมัติเมื่อกลับมา"); else if (c.active && ready) engine("กล้องพร้อม" + (c.facing === "environment" ? " (กล้องหลัง)" : ""), "ok"); },
    onError: e => { console.error(e); engine(e.name === "Insecure" ? HTTPS_MSG : "เปิดกล้องไม่ได้: " + (e.message || e.name), "err"); if (e.name === "Insecure") showHttpsNote($("#engine")); }
  });
  camera.mountControls(camBox);
  video.addEventListener("resize", layoutCam);
  addEventListener("orientationchange", () => setTimeout(layoutCam, 350));

  async function init() {
    engine("กำลังเปิดกล้องและโหลดโมเดล...");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(HTTPS_MSG), { name: "Insecure" });
      const [, backend] = await Promise.all([
        camera.start(),
        initBackend().then(async b => {
          await Promise.all(["tinyFaceDetector", "faceLandmark68Net", "faceRecognitionNet", "faceExpressionNet"].map(n => faceapi.nets[n].loadFromUri("vendor/models/")));
          return b;
        })
      ]);
      layoutCam();
      ready = true;
      engine(`พร้อมใช้งาน (ตัวประมวลผล: ${backend.toUpperCase()}${backend === "webgl" ? "" : " — อาจช้ากว่าปกติ"})`, "ok");
    } catch (e) {
      console.error(e);
      if (e.name === "Insecure") showHttpsNote($("#engine"));
      const m = { Insecure: HTTPS_MSG, NotAllowedError: "ไม่ได้รับอนุญาตให้ใช้กล้อง", NotFoundError: "ไม่พบกล้อง", NotReadableError: "กล้องถูกโปรแกรมอื่นใช้อยู่" }[e.name];
      engine(`ระบบไม่พร้อม: ${m || "โหลดโมเดลไม่สำเร็จ"}${e.name === "Insecure" ? "" : ` (${e.name}: ${e.message || "-"})`}`, "err");
      const b = document.createElement("button");
      b.className = "btn ghost retry"; b.textContent = "ลองใหม่";
      b.onclick = init; $("#engine").append(b);
    }
  }

  const detOpts = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 });
  const center = pts => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });

  async function detect() {
    const rs = await faceapi.detectAllFaces(video, detOpts).withFaceLandmarks().withFaceDescriptors().withFaceExpressions();
    return rs.map(r => {
      const lm = r.landmarks, le = center(lm.getLeftEye()), re = center(lm.getRightEye()), nose = lm.getNose()[3];
      const yaw = (nose.x - (le.x + re.x) / 2) / (Math.abs(re.x - le.x) || 1);
      const e = EMO.map(k => +(r.expressions[k] || 0).toFixed(3));
      const b = r.detection.box;
      return { desc: r.descriptor, e, v: e.reduce((s, p, i) => s + p * VA[EMO[i]][0], 0), att: Math.abs(yaw) < CFG.YAW_LIMIT ? 1 : 0, area: b.width * b.height, box: b };
    });
  }

  function draw(res) {
    const ctx = overlay.getContext("2d"), W = overlay.width;
    ctx.clearRect(0, 0, W, overlay.height);
    ctx.font = "600 22px Prompt, sans-serif"; ctx.lineWidth = 3;
    res.forEach(({ id, face }) => {
      const b = face.box, x = camera.mirror ? W - b.x - b.width : b.x; // กล้องหน้า: วาดแบบกระจกให้ตรงกับวิดีโอ
      ctx.strokeStyle = id ? (face.att ? "#2ecc71" : "#e6a23c") : "#9fb1bc";
      ctx.strokeRect(x, b.y, b.width, b.height);
      const label = id || "กำลังจำ...";
      const tw = ctx.measureText(label).width + 12;
      ctx.fillStyle = "rgba(14,20,48,.85)"; ctx.fillRect(x, b.y - 30, tw, 28);
      ctx.fillStyle = "#fff"; ctx.fillText(label, x + 6, b.y - 9);
    });
  }

  async function loop() {
    let lastSave = 0, lastUi = 0;
    while (running) {
      const t0 = performance.now();
      if (!camera.active || !video.videoWidth) { await sleep(500); continue; } // กล้องพักอยู่ (สลับแอป/สลับกล้อง)
      try {
        const faces = await detect();
        if (!running) break;
        const now = Date.now();
        autoPurge(S, now);
        const res = observe(S, faces, now);
        lastFrame = res.filter(r => r.id).map(r => ({ id: r.id, area: r.face.area }));
        draw(res);
        fpsTimes.push(performance.now()); fpsTimes = fpsTimes.filter(t => t > performance.now() - 3000);
        $("#fps").textContent = `${faces.length} คนในกล้อง · ${(fpsTimes.length / 3).toFixed(1)} fps`;
        if (now - lastUi > 1000) { render(faces.length); lastUi = now; }
        if (now - lastSave > 5000) { persist(); lastSave = now; }
      } catch (e) { console.error(e); }
      await sleep(Math.max(0, 250 - (performance.now() - t0))); // สูงสุดประมาณ 4 fps และไม่ซ้อนงาน
    }
  }

  $("#toggle").onclick = () => {
    if (!ready) return engine($("#engine").textContent.startsWith("ระบบไม่พร้อม") ? $("#engine").textContent : "ระบบกำลังโหลด กรุณารอสักครู่", $("#engine").className.includes("err") ? "err" : "");
    running = !running;
    $("#toggle").textContent = running ? "หยุดนับ" : "เริ่มนับผู้เข้าชม";
    if (running) loop(); else { overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height); persist(); render(0); $("#fps").textContent = "หยุดแล้ว"; }
  };

  // ---------- กิจกรรม ----------
  function join() {
    const msg = $("#joinMsg"), set = (t, c) => { msg.textContent = t; msg.className = "form-msg " + c; };
    const act = $("#activity").value.trim() || "กิจกรรม";
    if (!running) return set("กรุณากดเริ่มนับผู้เข้าชมก่อน", "err");
    const target = lastFrame.slice().sort((a, b) => b.area - a.area)[0];
    if (!target) return set("ยังไม่พบใบหน้าที่ระบบจำได้ ให้ผู้เข้าร่วมหันหน้าเข้ากล้อง 1-2 วินาที", "err");
    const r = markActivity(S, target.id, act);
    set(r === "ok" ? `บันทึก ${target.id} เข้าร่วม "${act}" แล้ว` : `${target.id} เข้าร่วม "${act}" ไปแล้ว`, r === "ok" ? "ok" : "");
    persist(); render(lastFrame.length);
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
    persist(); render(0);
  });
  $("#purge").onclick = () => {
    if (!confirm("ลบข้อมูลลักษณะใบหน้าทั้งหมดของวันนี้? สถิติจะยังอยู่ แต่ระบบจะจำคนเดิมไม่ได้อีก (นับเป็นคนใหม่)")) return;
    purgeFaces(S); persist(); engine("ล้างข้อมูลใบหน้าแล้ว สถิติรวมยังอยู่", "ok");
  };
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
  let rsT, lastW = innerWidth; addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(() => { if (innerWidth !== lastW) { lastW = innerWidth; render(lastFrame.length); } }, 200); });
  render(0); init();
})();
