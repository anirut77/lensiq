const MODEL_URL = "vendor/models/";
// ค่าความต่างใบหน้าสูงสุดที่ยอมรับ (ยิ่งต่ำยิ่งเข้มงวด) — ตั้งค่าได้ เก็บใน att-settings
// retentionDays: ลบการลงทะเบียนใบหน้าที่ไม่ได้ใช้เกินกี่วัน (ค่าเริ่ม 365)
// round 5: 0.50 (ACCURACY.md §2) — the page scales it to the enrolled group (LQTrack.FACE_RULES / gallerySpread)
// liveness (round 11): ให้หันหน้าซ้าย–ขวาเล็กน้อยก่อนเช็คชื่อ — ปิดไว้เป็นค่าเริ่มต้น (LQTrack.createLiveness, ยังไม่ได้วัดผล)
const settings = Object.assign({ matchDistance: 0.50, retentionDays: 365, liveness: false }, (() => { try { return JSON.parse(localStorage.getItem("att-settings")) || {}; } catch { return {}; } })());
const MAX_FACES = 5;
const TEST = !!(window.LQDetect && LQDetect.isTest()); // localhost + ?fakedet เท่านั้น
const $ = s => document.querySelector(s);
const video = $("#video"), overlay = $("#overlay"), banner = $("#banner"), camMsg = $("#camMsg");
// ตรวจใบหน้าที่ 320 ถ้าไม่พบเลยลองอีกรอบที่ 160 (หน้าที่อยู่ใกล้กล้องมาก) — LQDetect.detectFacesCascade, ACCURACY.md §2
const detectReal = () => LQDetect.detectFacesCascade(faceapi, video, { sizes: LQDetect.FACE_SIZES, scoreThreshold: 0.5 });

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { alert("พื้นที่จัดเก็บเต็มหรือถูกบล็อก"); } };
// att-people = {id,name,code,created,lastSeen} (ไม่มีค่าใบหน้า) ; ค่าใบหน้าเข้ารหัสอยู่ใน lqv-att-faces (lensiq-facevault.js)
// ในหน่วยความจำแนบกลับเป็น p.descriptor:number[] ; ข้อมูลรุ่นเก่าที่มี descriptor ใน att-people ถูกย้าย+เข้ารหัสอัตโนมัติ
const FACE_KEY = "lqv-att-faces";
let people = [];
let logs = load("att-logs", []);      // {pid,name,code,session,date,time}
let faceState = "enc";
const saveQ = LQVault.queue();
function savePeople(opts) {
  const snap = people.slice();
  return saveQ(() => LQVault.splitSave("att-people", FACE_KEY, snap, "descriptor", localStorage, opts)
    .then(m => { if (m) showFaceState(m); return true; })
    .catch(e => { if (e.name === "VaultLockedError") showFaceState("locked"); else if (e.name === "VaultInsecureError") showFaceState("insecure"); else alert("พื้นที่จัดเก็บเต็มหรือถูกบล็อก"); return false; }));
}
function showFaceState(st) {
  faceState = st;
  const el = $("#faceState"); if (!el) return;
  el.textContent = LQVault.STATE_TH[st] || ""; el.className = "vault-state " + st;
}
function applyRetention() {
  const ids = new Set(LQVault.expired(people, settings.retentionDays));
  if (!ids.size) return 0;
  people = people.filter(p => !ids.has(p.id)); savePeople();
  return ids.size;
}
const storageReady = LQVault.splitLoad("att-people", FACE_KEY, "descriptor", localStorage, { stamp: true }).then(r => {
  people = r.records; showFaceState(r.state);
  const n = applyRetention();
  if (n) say(`ลบข้อมูลใบหน้าที่ไม่ได้ใช้เกิน ${settings.retentionDays} วันแล้ว ${n} คน`, "warn");
  renderPeople();
}).catch(e => { console.error(e); people = load("att-people", []); renderPeople(); });

let mode = "checkin", scanning = false, ready = false, lastMsgAt = 0;
let matcher = null;
/* เกณฑ์รอบ 5 (LQTrack.FACE_RULES): ระยะ 0.50 · เกณฑ์รายคน 0.85 × ระยะถึงคนที่ใกล้ที่สุด (ไม่ต่ำกว่า 0.44) · ห่างอันดับสอง 0.09
   ทั้งหมดคูณด้วยสเกลของกลุ่มที่ลงทะเบียน (ระยะกลางระหว่างผู้ลงทะเบียน ÷ 0.736) — กลุ่มที่หน้าใกล้กันในโมเดล (เช่น ใบหน้าเอเชีย)
   ได้เกณฑ์เข้มขึ้นตามสัดส่วน ; ผลที่ไม่ "มั่นใจ" (ระยะ > 0.85 × เกณฑ์ หรือผู้ลงทะเบียน < 5 คน) ต้องให้คนกดยืนยันก่อนบันทึก */
const FACE_RULES = LQTrack.FACE_RULES;
const MATCH_MARGIN = FACE_RULES.margin;
const sure = new Map();  // pid -> {n, last}: จำนวนเฟรมที่จับคู่ได้แบบมั่นใจ (รีเซ็ตเมื่อหายไปเกิน 1.5 วินาที)
const asks = new Map();  // pid -> เวลาเริ่มถาม: จับคู่ได้แต่ไม่มั่นใจ รอให้คนกดยืนยัน
const declined = new Set(); // pid ที่ถูกกด "ไม่ใช่" ระหว่างการปรากฏครั้งนี้
const lastSaid = new Map();   // pid -> เวลาแจ้งล่าสุด (กันข้อความซ้ำรายคน)
const lastResult = new Map(); // pid -> {kind, text} ผลเช็คชื่อล่าสุดของคนนั้น
const confirm2 = LQTrack.createConfirm({ need: 2, windowMs: 1500 }); // ต้องเห็นตรงกัน 2 เฟรมก่อนบันทึก
const liveGate = LQTrack.createLiveness({ windowMs: 8000, turn: 0.3 }); // ใช้เฉพาะเมื่อเปิด settings.liveness
const waitLive = new Set(); // pid ที่ยืนยันใบหน้าแล้ว รอหันหน้า
const LIVE_TXT = "กรุณาหันหน้าไปทางซ้ายหรือขวาเล็กน้อย แล้วหันกลับ (ตรวจว่าเป็นคนจริง)";

$("#date").value = new Date().toISOString().slice(0, 10);
const session = () => $("#session").value.trim();
const day = () => $("#date").value;

function say(msg, cls = "") {
  banner.textContent = msg; banner.className = "banner " + cls;
  const sm = $("#scanMsg"); sm.textContent = msg; sm.className = "form-msg scan-msg " + cls; // แสดงใกล้ปุ่มด้วย
}
function needSession() {
  const el = $("#session");
  el.classList.add("invalid"); el.scrollIntoView({ block: "center", behavior: "smooth" }); el.focus();
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- กล้อง (LQCam): เลือกกล้องหน้า/หลัง · สะท้อนภาพเฉพาะกล้องหน้า · ปิดกล้องเมื่อสลับแอปแล้วเปิดต่อ · จำกล้องที่เลือก ----------
const INSECURE_MSG = "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด";
function layout(c = camera) {
  video.parentElement.classList.toggle("mirror", c.mirrored);
  if (video.videoWidth && (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight)) { overlay.width = video.videoWidth; overlay.height = video.videoHeight; }
}
const camera = LQCam.create(video, {
  facing: "user", persistKey: "att-cam",
  onChange: (c, ev) => { if (ev.type === "started" || ev.type === "resumed") layout(c); },
  onError: (c, e) => { if (e && e.name === "AbortError") return; ready = false; showCamError(camErrorText(e)); }
});
video.addEventListener("resize", () => { if (camera.active) layout(); });
camera.attach($("#camSwitch"));
// กล้องหลุด: LQCam เชื่อมต่อใหม่เอง (1, 2, 4 … 30 วินาที) และแสดง "กล้องออฟไลน์ตั้งแต่ HH:MM" ใต้ภาพ
if (LQCam.offlineBadge) LQCam.offlineBadge(camera, $("#camHealth") ? $("#camHealth").parentElement : video.parentElement);
function showCamError(text) {
  camMsg.classList.remove("hide");
  camMsg.innerHTML = "";
  const p = document.createElement("div");
  p.textContent = text;
  const b = document.createElement("button");
  b.className = "btn primary"; b.textContent = "ลองใหม่"; b.style.marginTop = "14px";
  b.onclick = init;
  p.append(document.createElement("br"), b);
  if (!window.isSecureContext) { const a = document.createElement("a"); a.href = "cameras.html"; a.className = "btn ghost cam-link"; a.textContent = "ดูวิธีในหน้า ระบบทั้งหมด"; p.append(" ", a); }
  camMsg.append(p);
  say("ระบบกล้องไม่พร้อม: " + text, "err");
}

function camErrorText(e) {
  if (!window.isSecureContext || !navigator.mediaDevices)
    return `${INSECURE_MSG} (ตอนนี้เปิดจาก ${location.origin} — บนคอมพิวเตอร์ใช้ http://localhost:8000 ได้)`;
  switch (e && e.name) {
    case "NotAllowedError": case "SecurityError":
      return "ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณากดไอคอนแม่กุญแจข้าง URL แล้วเลือก \"อนุญาต\" กล้อง จากนั้นกดลองใหม่";
    case "NotFoundError": case "OverconstrainedError":
      return "ไม่พบกล้องในอุปกรณ์นี้ กรุณาเสียบเว็บแคมแล้วกดลองใหม่";
    case "NotReadableError": case "AbortError":
      return "กล้องถูกใช้งานโดยโปรแกรมอื่นอยู่ (เช่น Zoom/Teams) กรุณาปิดแล้วกดลองใหม่";
    default:
      return "เปิดกล้องไม่สำเร็จ: " + (e && e.message ? e.message : "ไม่ทราบสาเหตุ");
  }
}


async function init() {
  ready = false;
  camMsg.classList.remove("hide");
  camMsg.textContent = "กำลังเปิดกล้องและโหลดโมเดลตรวจจับใบหน้า...";
  say("กำลังเตรียมระบบ...");

  // เปิดกล้องและโหลดโมเดลพร้อมกัน เพื่อให้รู้สาเหตุที่แท้จริงของแต่ละส่วน
  const cam = (async () => {
    await camera.start();
  })();
  // เลือกตัวประมวลผล: WebGL -> WASM -> CPU (?cpu ข้าม WebGL) · โหมดทดสอบ (?fakedet) ไม่โหลดโมเดล
  // speed pass 2026-11-14: the face models are fetched only once the camera is open (nothing if it is refused)
  const models = TEST ? Promise.resolve() : cam.then(() => LQDetect.tfBackend()).then(() => Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ]));

  const [c, m] = await Promise.allSettled([cam, models, storageReady]);
  if (c.status === "rejected") return showCamError(camErrorText(c.reason));
  if (m.status === "rejected") return showCamError("โหลดโมเดลตรวจจับใบหน้าไม่สำเร็จ ไม่พบไฟล์โมเดลใน vendor/models (ตรวจว่ารันเว็บจากโฟลเดอร์โปรเจกต์ ไม่ได้เปิดไฟล์ตรง ๆ)");

  ready = true; camMsg.classList.add("hide");
  rebuildMatcher(); say("พร้อมใช้งาน");
}

function rebuildMatcher() {
  // คลังใบหน้าในหน่วยความจำ [{label:id, d}] — จับคู่ด้วย LQTrack.matchFace (ระยะ < matchDistance และต้องห่างอันดับสองอย่างน้อย MATCH_MARGIN)
  // + เกณฑ์รายคน (LQTrack.enrolGallery): คนที่หน้าคล้ายผู้ลงทะเบียนอื่นได้เกณฑ์เข้มขึ้น = 0.85 × ระยะถึงคนที่ใกล้ที่สุด (ไม่ต่ำกว่า 0.45)
  //   วัดบน LFW 1:N 100 คน (tests/bench/face1n.bench.mjs): คนนอกถูกจับคู่ 8.4% -> ต่ำกว่า 1% (ACCURACY.md)
  const withFace = people.filter(p => Array.isArray(p.descriptor));
  matcher = withFace.length ? LQTrack.enrolGallery(withFace.map(p => ({ label: p.id, ds: [new Float32Array(p.descriptor)] })), { ...FACE_RULES, maxDist: settings.matchDistance }) : null;
}

// ---------- ตรวจจับใบหน้า ----------
// คืน [{box:{x,y,width,height} (พิกเซลของวิดีโอ), descriptor:Float32Array|null, fake?}] เรียงจากใบใหญ่ไปเล็ก
async function detectFaces(max = MAX_FACES) {
  let faces;
  const fk = TEST ? LQDetect.fake("att", performance.now()) : null;
  if (fk) {
    const W = video.videoWidth || overlay.width || 1, H = video.videoHeight || overlay.height || 1;
    faces = fk.map(d => ({ box: { x: d.x * W, y: d.y * H, width: d.w * W, height: d.h * H }, descriptor: d.descriptor ? Float32Array.from(d.descriptor) : null, fake: d, cues: d.cues || null }));
  } else {
    const r = await detectReal();
    // q = คุณภาพภาพใบหน้า (ขนาด คะแนน หันข้าง) — เฟรมที่ไม่ผ่าน LQTrack.qualityOk ไม่ถูกนำไปจับคู่
    faces = r.map(x => { const b = x.detection.box; return { box: { x: b.x, y: b.y, width: b.width, height: b.height }, descriptor: x.descriptor, q: LQTrack.faceQuality({ box: b, score: x.detection.score, landmarks: x.landmarks.positions }), cues: LQTrack.liveCues(x.landmarks.positions) }; });
  }
  return faces.sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height).slice(0, max);
}
// ใบหน้าตรงกับใครที่สุด -> {label, distance} (label = id ผู้ลงทะเบียน หรือ "unknown")
function bestMatch(f, i) {
  if (TEST && typeof window.__LQ_FAKE_MATCH === "function") return window.__LQ_FAKE_MATCH(f.fake || f, i) || { label: "unknown", distance: 1 };
  if (!matcher || !f.descriptor) return { label: "unknown", distance: 1 };
  if (f.q && !LQTrack.qualityOk(f.q)) return { label: "unknown", distance: 1, lowq: true };
  const m = LQTrack.matchFace(f.descriptor, matcher, { maxDist: settings.matchDistance, margin: MATCH_MARGIN });
  return { label: m.label, distance: m.distance, confident: m.confident };
}

// ---------- ลงทะเบียน (หนึ่งใบหน้าเท่านั้น) ----------
// ลงทะเบียนจาก 3 ท่า (ตรง / หันซ้ายเล็กน้อย / หันขวาเล็กน้อย) แล้วเฉลี่ย — ใกล้เคียงการลงทะเบียน 3 ภาพที่วัดบน LFW
// (จำได้ 80% -> 88% ที่ 100 คน) ; แต่ละท่าใช้ 2 เฟรมที่ผ่านเกณฑ์คุณภาพ
const POSES = ["มองตรงที่กล้อง", "หันหน้าไปทางซ้ายเล็กน้อย", "หันหน้าไปทางขวาเล็กน้อย"];
async function capture(samples = 3, onPose = () => {}) {
  const ds = [];
  for (let i = 0; i < samples; i++) {
    onPose(POSES[i % POSES.length], i + 1, samples);
    if (i) await new Promise(r => setTimeout(r, 900)); // เวลาให้ขยับหน้า
    const got = [];
    for (let tries = 0; got.length < 2 && tries < 8; tries++) {
      const r = await detectFaces(Infinity);
      if (r.length !== 1) throw new Error(r.length ? "พบใบหน้าหลายคน กรุณาให้เหลือคนเดียว" : "ไม่พบใบหน้า กรุณาหันหน้าตรงกล้อง");
      if (!r[0].descriptor) throw new Error("อ่านลักษณะใบหน้าไม่สำเร็จ กรุณาลองใหม่");
      if (!r[0].q || LQTrack.qualityOk(r[0].q)) got.push(r[0].descriptor);
      await new Promise(r => setTimeout(r, 200));
    }
    if (!got.length) throw new Error("ภาพใบหน้าไม่ชัดหรือหันข้างมากเกินไป กรุณาเข้าใกล้กล้องและลองใหม่");
    ds.push(...got);
  }
  return Array.from(ds[0], (_, k) => ds.reduce((s, d) => s + d[k], 0) / ds.length);
}

// ลงทะเบียนใบหน้าได้เฉพาะเมื่อเข้ารหัสได้ (https/localhost + WebCrypto + IndexedDB) — ไม่เช่นนั้นปิดปุ่มและบอกเหตุผล
{ const why = LQVault.enrollBlockReason(); if (why) { const m = $("#regMsg"); m.textContent = why; m.className = "form-msg err"; $("#regForm").querySelector("button[type=submit],button").disabled = true; } }
$("#regForm").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, m = $("#regMsg"), btn = f.querySelector("button");
  const name = f.name.value.trim(), code = f.code.value.trim();
  const set = (t, c) => { m.textContent = t; m.className = "form-msg " + c; };
  if (!ready) return set("กล้องยังไม่พร้อม", "err");
  if (!name || !code) return set("กรุณากรอกชื่อและรหัส", "err");
  if (!f.consent.checked) return set("ต้องยินยอมการเก็บข้อมูลใบหน้าก่อน", "err");
  if (faceState === "locked") return set(LQVault.STATE_TH.locked, "err");
  { const why = LQVault.enrollBlockReason(); if (why) return set(why, "err"); } // เข้ารหัสไม่ได้ (เช่น ไม่ใช่ https) = ไม่เก็บใบหน้า
  if (people.some(p => p.code === code)) return set("รหัสนี้ลงทะเบียนแล้ว", "err");
  { const why = HR() && HR().blockFace(code); if (why) return set(why, "err"); } // employee chose PIN/QR only: no face data
  btn.disabled = true; set("กำลังสแกน กรุณามองกล้องนิ่ง ๆ...", "");
  try {
    const descriptor = await capture(3, (pose, i, n) => set(`กำลังสแกน ${i}/${n}: ${pose}...`, ""));
    if (matcher) {
      const best = LQTrack.matchFace(new Float32Array(descriptor), matcher, { maxDist: settings.matchDistance });
      if (best.label !== "unknown") {
        const dup = people.find(p => p.id === best.label);
        throw new Error(`ใบหน้านี้ลงทะเบียนแล้วในชื่อ ${dup.name}`);
      }
    }
    const now = Date.now();
    people.push({ id: crypto.randomUUID(), name, code, descriptor, created: now, lastSeen: now });
    if (!(await savePeople())) { people.pop(); throw new Error("บันทึกข้อมูลใบหน้าไม่สำเร็จ"); }
    rebuildMatcher(); renderPeople();
    f.reset(); set(`ลงทะเบียน ${name} สำเร็จ`, "ok");
  } catch (err) { set(err.message, "err"); }
  btn.disabled = false;
});

// ---------- สแกนเช็คชื่อ (หลายคนพร้อมกัน) ----------
const TIME = () => new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const RES_CLS = { ok: "ok", dup: "warn", pending: "", ask: "warn", unknown: "unknown", err: "err" };
let unknownAt = 0;

async function loop() {
  if (!scanning) return;
  const ctx = overlay.getContext("2d");
  if (video.readyState < 2) { ctx.clearRect(0, 0, overlay.width, overlay.height); setTimeout(loop, 400); return; } // กล้องพักชั่วคราว
  try {
    const faces = await detectFaces();
    if (!scanning) return;
    const now = performance.now();
    healthStep(faces);
    if (SCA) { attCheckStep(faces, now, ctx); setTimeout(loop, 300); return; } // ตรวจความแม่นยำ: ไม่บันทึกการเข้าเรียน
    // จับคู่แบบไม่ซ้ำ: แต่ละคนถูกใช้ได้ครั้งเดียวต่อเฟรม ใบหน้าที่ใกล้ที่สุดได้ไป ที่เหลือถือว่าไม่รู้จัก
    const cands = [];
    const conf = new Map();
    faces.forEach((f, i) => { const m = bestMatch(f, i); if (m.label !== "unknown" && people.some(p => p.id === m.label)) { cands.push({ i, key: m.label, dist: m.distance }); conf.set(i, m.confident !== false); } });
    const got = LQTrack.assignUnique(cands, Infinity);
    const rows = faces.map((f, i) => {
      const a = got.get(i), p = a && people.find(x => x.id === a.key);
      if (!p) return { f, kind: "unknown", name: "ไม่รู้จัก", text: "ไม่พบในระบบ กรุณาลงทะเบียน" };
      // รอหันหน้า (liveness): คนที่ยืนยัน 2 เฟรมแล้วแต่ยังไม่ผ่าน นับเป็น "confirmed" ต่อไปจนกว่าจะผ่านหรือหายจากกล้อง
      const st0 = confirm2.hit(p.id, now), st = st0 === "already" && waitLive.has(p.id) ? "confirmed" : st0;
      const live = !settings.liveness || liveGate.step(p.id, f.cues, now) === "live";
      if (declined.has(p.id)) return { f, kind: "unknown", name: "ไม่รู้จัก", text: "ไม่พบในระบบ กรุณาลงทะเบียน" };
      if (conf.get(i)) { const s = sure.get(p.id); sure.set(p.id, { n: (s && now - s.last <= 1500 ? s.n : 0) + 1, last: now }); }
      const isSure = (sure.get(p.id) || { n: 0 }).n >= 2;
      if (st === "pending") return { f, kind: "pending", name: p.name, text: "กำลังยืนยันตัวตน..." };
      // จับคู่ได้แต่ไม่มั่นใจ: ไม่บันทึกเอง แสดงปุ่มให้เจ้าของใบหน้า/เจ้าหน้าที่กดยืนยัน (หรือรอจนได้เฟรมที่มั่นใจ 2 เฟรม)
      if ((st === "confirmed" && !isSure) || (asks.has(p.id) && !isSure)) {
        if (!asks.has(p.id)) asks.set(p.id, now);
        return { f, kind: "ask", name: p.name, pid: p.id, text: "ไม่แน่ใจ — กรุณากดยืนยันตัวตน" };
      }
      if ((st === "confirmed" || asks.has(p.id)) && !live) { waitLive.add(p.id); return { f, kind: "pending", name: p.name, text: LIVE_TXT }; }
      if (st === "confirmed" || asks.has(p.id)) {
        asks.delete(p.id); waitLive.delete(p.id);
        if (Date.now() - (p.lastSeen || 0) > 3600000) { p.lastSeen = Date.now(); savePeople({ faces: false }); } // นับวันเก็บข้อมูลจากการใช้ล่าสุด
        const r = checkIn(p);
        if (r.kind === "err") confirm2.reset(p.id); // เช่น ยังไม่กรอกหัวข้อ ให้ลองใหม่เฟรมถัดไป
        else lastResult.set(p.id, r);
        notify(p, r);
        return { f, name: p.name, ...r };
      }
      return { f, name: p.name, ...(lastResult.get(p.id) || { kind: "dup", text: "เช็คชื่อแล้ว" }) };
    });
    for (const k of confirm2.prune(now)) { asks.delete(k); declined.delete(k); sure.delete(k); liveGate.reset(k); waitLive.delete(k); }
    draw(ctx, rows);
    renderFaceResults(rows);
    const unk = rows.filter(r => r.kind === "unknown").length;
    if (unk) unknownAt = Date.now();
    showUnknownNote(unk);
    if (!faces.length && Date.now() - lastMsgAt > 2500) say("กำลังสแกน... กรุณาหันหน้าเข้าหากล้อง");
  } catch (e) { console.error(e); }
  setTimeout(loop, 400);
}

// ป้ายชื่อบนกรอบ: แคนวาสถูกสะท้อนด้วย CSS จึงต้องกลับด้านตัวอักษรกลับ
function draw(ctx, rows) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  const mir = camera.mirrored, fs = Math.max(14, Math.round(overlay.width / 36));
  ctx.font = `500 ${fs}px Prompt, sans-serif`; ctx.textBaseline = "bottom";
  for (const r of rows) {
    const b = r.f.box, col = r.kind === "ok" || r.kind === "dup" ? "#2ecc71" : r.kind === "pending" || r.kind === "ask" ? "#22d3ee" : r.kind === "err" ? "#e74c3c" : "#e67e22";
    ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.strokeRect(b.x, b.y, b.width, b.height);
    const label = r.kind === "unknown" ? "ไม่รู้จัก" : r.kind === "ask" ? r.name + " ?" : r.name, tw = ctx.measureText(label).width + 12, ty = Math.max(fs + 8, b.y);
    ctx.save();
    if (mir) { ctx.translate(b.x + b.width, 0); ctx.scale(-1, 1); } else ctx.translate(b.x, 0);
    ctx.fillStyle = col; ctx.fillRect(0, ty - fs - 8, tw, fs + 8);
    ctx.fillStyle = "#0e1430"; ctx.fillText(label, 6, ty - 3);
    ctx.restore();
  }
}

function renderFaceResults(rows) {
  const el = $("#faceResults");
  const shown = rows.filter(r => r.kind !== "unknown");
  const unk = rows.length - shown.length;
  const html = shown.map(r => `<li class="fr ${RES_CLS[r.kind]}" data-kind="${r.kind}"><span>${esc(r.name)}</span><small>${esc(r.text)}</small>`
    + (r.kind === "ask" ? `<span class="ask-btns"><button type="button" class="btn primary" data-yes="${esc(r.pid)}">ยืนยัน ใช่ ${esc(r.name)}</button><button type="button" class="btn ghost" data-no="${esc(r.pid)}">ไม่ใช่</button></span>` : "") + `</li>`).join("")
    + (unk ? `<li class="fr unknown" data-kind="unknown"><span>ไม่รู้จัก${unk > 1 ? ` ${unk} คน` : ""}</span><small>ไม่พบในระบบ</small></li>` : "");
  if (el.dataset.html !== html || (html && !el.childElementCount)) { el.innerHTML = html; el.dataset.html = html; } // ไม่สร้างปุ่มใหม่ทุกเฟรม (กดได้)
}
// ยืนยันด้วยคน: "ใช่" = บันทึกการเข้าเรียน · "ไม่ใช่" = ไม่นับคนนี้จนกว่าใบหน้าจะหายจากกล้อง
$("#faceResults").addEventListener("click", e => {
  const yes = e.target.closest("[data-yes]"), no = e.target.closest("[data-no]");
  const id = yes ? yes.dataset.yes : no ? no.dataset.no : null, p = id && people.find(x => x.id === id);
  if (!p || !asks.has(id)) return;
  asks.delete(id);
  noteField(!no);
  if (no) { declined.add(id); say(`ไม่บันทึก ${p.name}`, ""); return; }
  if (settings.liveness && !liveGate.isLive(id)) { asks.set(id, Date.now()); say(LIVE_TXT, "warn"); return; }
  const r = checkIn(p);
  if (r.kind !== "err") lastResult.set(p.id, r);
  notify(p, r);
});
// แจ้งเตือนใบหน้าที่ไม่รู้จัก: บรรทัดแยก ไม่ทับข้อความสำเร็จ
function showUnknownNote(n) {
  const el = $("#unknownNote");
  if (n) { el.textContent = `พบใบหน้าที่ไม่อยู่ในระบบ ${n} คน — ลงทะเบียนที่แท็บ "ลงทะเบียนใบหน้า"`; el.hidden = false; }
  else if (Date.now() - unknownAt > 2500) el.hidden = true;
}
function notify(p, r) {
  const t = Date.now();
  if (r.kind !== "ok" && t - (lastSaid.get(p.id) || 0) < 2500) return; // จำกัดความถี่รายคน
  lastSaid.set(p.id, t); lastMsgAt = t;
  if (r.msg) return say(r.msg, RES_CLS[r.kind]);
  say(r.kind === "ok" ? `✓ เช็คชื่อสำเร็จ: ${p.name} (${r.time})` : r.kind === "dup" ? `${p.name} ${r.text}` : r.text, RES_CLS[r.kind]);
}

// บันทึกการเข้าเรียน -> {kind:'ok'|'dup'|'err', text, time?}
// employee mode (attendance-hr.js): a face check-in becomes a time punch (in / out / break) instead of a training log
const HR = () => { const h = /** @type {any} */ (window).LQHR; return h && h.active() ? h : null; };
function checkIn(p) {
  if (HR()) return HR().facePunch(p);
  const s = session(), d = day();
  if (!s) return { kind: "err", text: "กรุณากรอกหัวข้อ/รอบการอบรมก่อน" };
  const already = logs.find(l => l.pid === p.id && l.session === s && l.date === d);
  if (already) return { kind: "dup", text: `เช็คชื่อแล้วเมื่อ ${already.time}`, time: already.time };
  const time = TIME();
  logs.push({ pid: p.id, name: p.name, code: p.code, session: s, date: d, time });
  store("att-logs", logs); renderLogs();
  return { kind: "ok", text: `เช็คชื่อสำเร็จ ${time}`, time };
}

// round 12: แท็บถูกซ่อน/จอดับ = กล้องหยุด — Wake Lock ระหว่างสแกน และแจ้งเมื่อกลับมาว่าหยุดสแกนไปนานเท่าไร
const UA = LQCam.unattended ? LQCam.unattended({ container: document.getElementById("uaBox") || document.getElementById("banner").parentNode, isRunning: () => scanning, tag: "หยุดสแกน",
  gapText: "แท็บถูกซ่อนหรือจอดับ {a}–{b} ({m}) — ระหว่างนั้นไม่ได้สแกนใบหน้า คนที่มาในช่วงนี้ยังไม่ถูกบันทึกเวลา · เปิดแท็บนี้ไว้ด้านหน้าและตั้งจอไม่ให้ดับเอง" }) : null;
$("#startScan").onclick = () => {
  if (!ready) return say("กล้องยังไม่พร้อม — ดูข้อความในกรอบกล้อง หรือกดอนุญาตกล้องที่เบราว์เซอร์ แล้วรีเฟรช", "err");
  if (!people.length) return say("ยังไม่มีผู้ลงทะเบียน กรุณาลงทะเบียนใบหน้าก่อน", "warn");
  if (!session() && !HR()) { needSession(); return say("กรุณากรอก \"หัวข้อ/รอบการอบรม\" ที่ช่องด้านบนก่อน แล้วกดเริ่มสแกนอีกครั้ง", "warn"); }
  scanning = !scanning;
  $("#startScan").textContent = scanning ? "หยุดสแกน" : "เริ่มสแกน";
  if (UA) { if (scanning) UA.start(); else UA.stop(); }
  if (scanning) loop(); else { overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height); $("#faceResults").innerHTML = ""; $("#unknownNote").hidden = true; say("หยุดสแกนแล้ว"); }
};

// ---------- แสดงผล ----------
function renderLogs() {
  const s = session(), d = day();
  const today = logs.filter(l => l.date === d && (!s || l.session === s));
  $("#todayCount").textContent = today.length;
  $("#recent").innerHTML = today.slice().reverse().map(l => `<li><span><span translate="no" data-i18n-skip>${esc(l.name)}</span> <small translate="no" data-i18n-skip>${esc(l.code)}</small></span><small>${esc(l.time)}</small></li>`).join("");
  $("#logBody").innerHTML = logs.slice().reverse().map(l =>
    `<tr><td>${esc(l.date)} ${esc(l.time)}</td><td translate="no" data-i18n-skip>${esc(l.name)}</td><td translate="no" data-i18n-skip>${esc(l.code)}</td><td translate="no" data-i18n-skip>${esc(l.session)}</td></tr>`).join("")
    || `<tr><td colspan="4">ยังไม่มีบันทึก</td></tr>`;
}
// round 11: ป้ายแจ้งการลบอัตโนมัติ (ข้อมูลใบหน้าในเครื่องนี้ + คนที่จะหมดอายุภายใน 30 วัน)
function renderExpiry() {
  const el = $("#expiryBanner"); if (!el) return;
  const withFace = people.filter(p => Array.isArray(p.descriptor));
  if (!withFace.length) { el.hidden = true; el.textContent = ""; return; }
  const soon = LQVault.expiringSoon(withFace, settings.retentionDays, 30);
  el.replaceChildren(); const sp = t => { const x = document.createElement("span"); x.textContent = t; el.append(x); };
  const F = (t, o) => t.replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));
  sp(F("ข้อมูลใบหน้า {a} คนในเครื่องนี้จะถูกลบอัตโนมัติเมื่อไม่ได้ใช้เกิน {b} วัน", { a: withFace.length, b: settings.retentionDays }));
  if (soon.length) { el.append(" · "); sp(F("{a} คนจะถูกลบภายใน 30 วัน (เร็วสุดอีก {b} วัน)", { a: soon.length, b: soon[0].daysLeft })); }
  el.hidden = false;
}
function renderPeople() {
  renderExpiry();
  $("#peopleCount").textContent = people.length;
  $("#people").innerHTML = people.map(p => `<li><span><span translate="no" data-i18n-skip>${esc(p.name)}</span> <small translate="no" data-i18n-skip>${esc(p.code)}</small>${Array.isArray(p.descriptor) ? "" : ' <small class="hint">(อ่านข้อมูลใบหน้าไม่ได้)</small>'}</span><button type="button" data-id="${p.id}" aria-label="ลบข้อมูลใบหน้าของ ${esc(p.name)}">ลบข้อมูล</button></li>`).join("");
}
$("#people").addEventListener("click", e => {
  const id = e.target.dataset.id; if (!id) return;
  const p = people.find(x => x.id === id);
  if (!confirm(`ลบข้อมูลใบหน้าของ ${p.name}? (บันทึกการเข้าเรียนเดิมยังอยู่)`)) return;
  const before = people;
  people = people.filter(x => x.id !== id);
  savePeople().then(ok => { if (!ok) { people = before; say("ลบไม่สำเร็จ — " + LQVault.STATE_TH.locked, "err"); } rebuildMatcher(); renderPeople(); });
  rebuildMatcher(); renderPeople();
});
// ลบข้อมูลใบหน้าทั้งหมด: ลบการลงทะเบียน ค่าใบหน้าที่เข้ารหัส และกุญแจใน IndexedDB (บันทึกการเข้าเรียนยังอยู่)
$("#wipeFaces").onclick = async () => {
  if (!confirm("ลบข้อมูลใบหน้าของผู้ลงทะเบียนทั้งหมด? ทุกคนต้องลงทะเบียนใหม่ (บันทึกการเข้าเรียนเดิมยังอยู่) ย้อนกลับไม่ได้")) return;
  if (scanning) $("#startScan").click();
  people = [];
  await saveQ(async () => { await LQVault.wipe([FACE_KEY]); try { localStorage.removeItem("att-people"); } catch {} });
  showFaceState(LQVault.supported() ? "enc" : LQVault.enrollBlockReason() ? "insecure" : "plain");
  rebuildMatcher(); renderPeople(); say("ลบข้อมูลใบหน้าทั้งหมดแล้ว", "ok");
};
// round 11: ลบข้อมูลชีวมิติทั้งหมดในเครื่องนี้ (ทุกหน้า: เช็คชื่อ + จดจำลูกค้า) และกุญแจทั้งหมดใน IndexedDB — สำหรับผู้ดูแล
if ($("#wipeAllBio")) $("#wipeAllBio").onclick = async () => {
  if (!confirm("ลบข้อมูลชีวมิติ (ค่าใบหน้า) ทั้งหมดในเบราว์เซอร์เครื่องนี้ ทั้งระบบเช็คชื่อและจดจำลูกค้า พร้อมกุญแจเข้ารหัส? ทุกคนต้องลงทะเบียนใบหน้าใหม่ บันทึกการเข้าเรียนและประวัติการสั่งยังอยู่ ย้อนกลับไม่ได้")) return;
  if (scanning) $("#startScan").click();
  people = [];
  await saveQ(() => LQVault.wipeAll());
  showFaceState(LQVault.supported() ? "enc" : LQVault.enrollBlockReason() ? "insecure" : "plain");
  rebuildMatcher(); renderPeople(); say("ลบข้อมูลชีวมิติทั้งหมดในเครื่องนี้แล้ว", "ok");
};
{
  const sel = $("#retention");
  sel.value = String(settings.retentionDays);
  if (sel.value !== String(settings.retentionDays)) { settings.retentionDays = 365; sel.value = "365"; }
  sel.addEventListener("change", () => {
    settings.retentionDays = +sel.value || 365;
    store("att-settings", settings);
    const n = applyRetention();
    if (n) { rebuildMatcher(); renderPeople(); say(`ลบข้อมูลใบหน้าที่ไม่ได้ใช้เกิน ${settings.retentionDays} วันแล้ว ${n} คน`, "warn"); }
    else renderExpiry();
  });
}
["#session", "#date"].forEach(s => $(s).addEventListener("input", () => { $(s).classList.remove("invalid"); renderLogs(); }));

// ---------- ส่งออก / ล้าง ----------
$("#exportCsv").onclick = () => {
  if (!logs.length) return say("ยังไม่มีข้อมูลให้ส่งออก", "warn");
  const cell = v => { v = String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
  const rows = [["วันที่", "เวลา", "ชื่อ", "รหัส", "หัวข้ออบรม"], ...logs.map(l => [l.date, l.time, l.name, l.code, l.session])];
  const csv = "﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `attendance-${day()}.csv`; a.click(); URL.revokeObjectURL(a.href);
};
$("#clearLogs").onclick = () => {
  if (logs.length && confirm("ล้างบันทึกการเช็คชื่อทั้งหมด? ย้อนกลับไม่ได้")) { logs = []; store("att-logs", logs); renderLogs(); }
};

// ---------- แท็บ ----------
document.querySelectorAll(".tab").forEach(t => t.onclick = () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
  ["checkin", "register", "records", "check", "pin"].forEach(n => { const el = $("#pane-" + n); if (el) el.hidden = n !== t.dataset.t; });
  mode = t.dataset.t;
  if (mode !== "check" && SCA) scaFinish();
  if (mode !== "checkin" && mode !== "check" && mode !== "pin" && scanning) $("#startScan").click();
  if (mode === "check" && SCA) scaWho();
});

// ---------- ตั้งค่าความเข้มงวด ----------
{
  const inp = $("#matchDist"), out = $("#matchDistVal");
  inp.value = settings.matchDistance; out.textContent = (+settings.matchDistance).toFixed(2);
  inp.addEventListener("input", () => {
    settings.matchDistance = Math.min(0.7, Math.max(0.3, +inp.value || 0.50));
    out.textContent = settings.matchDistance.toFixed(2);
    store("att-settings", settings); rebuildMatcher();
  });
  const lv = $("#liveness");
  if (lv) {
    lv.checked = !!settings.liveness;
    lv.addEventListener("change", () => { settings.liveness = lv.checked; store("att-settings", settings); });
  }
}

// ---------- สุขภาพภาพ + ตรวจความแม่นยำหน้างาน (lensiq-sitecheck.js) ----------
// สุขภาพภาพ: ความสว่าง ย้อนแสง ความคม และขนาดใบหน้า ทุก ~1 วินาทีระหว่างสแกน (ตัวเลขเท่านั้น)
const SITE = /** @type {any} */ (window).LQSite || null;
const HL = SITE ? { mon: SITE.createHealth({ kind: "attendance" }), at: 0, fw: [], cv: document.createElement("canvas"), state: null } : null;
function healthStep(faces) {
  if (!HL) return;
  const W = video.videoWidth || 1;
  if (faces.length) HL.fw.push(faces[0].box.width / W);
  const t = performance.now(); if (t - HL.at < 1000) return; HL.at = t;
  let st = null; try { st = SITE.sampleElement(video, HL.cv); } catch { /* ignore */ }
  HL.state = HL.mon.push(st, { faceW: HL.fw.length ? SITE.median(HL.fw) : null, stalled: SITE.stallStep(video, st, t) }); HL.fw = [];
  if (SCA) HL.state.codes.forEach(k => SCA.health.add(k));
  const pill = $("#camHealth"), msg = $("#camHealthMsg");
  if (!pill) return;
  SITE.renderHealth(pill, HL.state); pill.hidden = false;
  SITE.renderHealthLine(msg, HL.state);
}
// การยืนยันด้วยคนระหว่างใช้งานจริง (นับครั้งเท่านั้น): ระบบเสนอชื่อแล้วคนกด "ยืนยัน" หรือ "ไม่ใช่"
const fieldStats = Object.assign({ yes: 0, no: 0, since: Date.now() }, load("att-fieldcheck", {}));
function noteField(ok) { fieldStats[ok ? "yes" : "no"]++; store("att-fieldcheck", fieldStats); renderField(); }
function renderField() {
  const el = $("#scField"); if (!el) return;
  const n = fieldStats.yes + fieldStats.no;
  el.textContent = n ? SITE.fmt("ระหว่างใช้งานจริง ระบบเสนอชื่อให้ยืนยัน {a} ครั้ง: ถูกคน {b} · ไม่ใช่ {c}{d}", { a: n, b: fieldStats.yes, c: fieldStats.no, d: SITE ? SITE.fmt(" (เสนอชื่อถูก {a}%, ช่วงความเชื่อมั่น {b}–{c}%)", { a: (SITE.wilson(fieldStats.yes, n).p * 100).toFixed(0), b: (SITE.wilson(fieldStats.yes, n).lo * 100).toFixed(0), c: (SITE.wilson(fieldStats.yes, n).hi * 100).toFixed(0) }) : "" }) : "ระหว่างใช้งานจริง: ยังไม่มีการกดยืนยันหรือปฏิเสธชื่อที่ระบบเสนอ";
}
// ตรวจความแม่นยำ: ทีละรอบ — ผู้ทดสอบเลือกว่าใครยืนหน้ากล้อง (ผู้ลงทะเบียน หรือ คนนอก) แล้วกดเริ่มรอบ ระบบดูใบหน้าไม่เกิน 6 วินาที
// ด้วยกฎเดียวกับการเช็คชื่อจริง แต่ไม่บันทึกการเข้าเรียน · ผลที่ส่งออกใช้รหัสแทนชื่อ (m1, m2, ...) ไม่มีชื่อ ภาพ หรือค่าใบหน้า
let SCA = null, SCA_LAST = null;
const scaHist = SITE ? SITE.history("att-sitecheck") : null;
const scaPanel = SITE && $("#scPanel") ? SITE.mountPanel($("#scPanel"), {
  title: "ตรวจความแม่นยำหน้างาน",
  intro: "ทดสอบการจำใบหน้าที่จุดเช็คชื่อจริงของคุณ: ให้ผู้ลงทะเบียนและคนที่ไม่ได้ลงทะเบียนมายืนหน้ากล้องทีละคน ระบบใช้กฎเดียวกับการเช็คชื่อ แต่ไม่บันทึกการเข้าเรียนระหว่างทดสอบ",
  steps: [
    "ลงทะเบียนผู้ทดสอบที่จุดใช้งานจริงก่อน (แนะนำอย่างน้อย 5 คน ระบบจึงปรับเกณฑ์ตามกลุ่มได้) และขอความยินยอมจากทุกคน รวมถึงคนนอกที่มาช่วยทดสอบ",
    "กด \"เริ่มตรวจ\" แล้วในแต่ละรอบ เลือกว่าใครยืนหน้ากล้อง กด \"เริ่มรอบนี้\" ให้คนนั้นเดินเข้ามายืนตามปกติ ระบบจะสรุปผลเองภายใน 6 วินาที",
    "ทดสอบผู้ลงทะเบียนอย่างน้อย 20 รอบ (หลายคน หลายช่วงเวลา) และคนนอกอย่างน้อย 20 รอบ — คนนอกคือการทดสอบที่สำคัญที่สุด",
    "กด \"จบและคำนวณ\" แล้วเก็บไฟล์ผลตรวจไว้ ทำซ้ำเมื่อย้ายกล้อง เปลี่ยนแสง หรือมีผู้ลงทะเบียนเพิ่มมาก"
  ],
  body: `<div class="sc-trial" hidden><div class="sc-row"><label><span>ใครยืนหน้ากล้องรอบนี้</span><select class="sc-who" data-i18n-skip></select></label><label class="sc-sidl" hidden><span>คนนอกคนที่ (คนเดิม = เลขเดิม)</span><input class="sc-sid" type="number" min="1" max="999" value="1" inputmode="numeric"></label><button class="btn primary sc-go" type="button">เริ่มรอบนี้</button><button class="btn ghost small sc-undo" type="button">ลบรอบล่าสุด</button></div><p class="sc-now" role="status"></p><ul class="sc-list"></ul></div><p class="hint" id="scField"></p>`
}) : null;
const OUT_TH = { auto: "จำได้เอง", ask: "เสนอชื่อให้กดยืนยัน", none: "ไม่รู้จัก", noface: "ไม่พบใบหน้า" };
function scaWho() {
  const sel = scaPanel.q(".sc-who"), keep = sel.value;
  sel.innerHTML = people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("") + `<option value="stranger">คนที่ไม่ได้ลงทะเบียน (คนนอก)</option>`;
  if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
}
function scaRender() {
  const T = SCA ? SCA.trials : [], nm = id => id === "stranger" ? "คนนอก" : (people.find(p => p.id === id) || { name: "?" }).name;
  scaPanel.q(".sc-list").innerHTML = T.slice().reverse().map((t, i) => {
    const ok = t.truth === "stranger" ? t.outcome !== "auto" : t.label === t.truth && t.outcome !== "none";
    return SITE.fmt("<li data-truth=\"{a}\"><span>รอบ {b}: <b data-i18n-skip>{c}</b></span><small>{d}{e}</small></li>", { a: ok ? "good" : "bad", b: T.length - i, c: esc(nm(t.truth)), d: esc(OUT_TH[t.outcome]), e: t.label ? `: <span data-i18n-skip>${esc(nm(t.label))}</span>` : "" });
  }).join("");
  const mem = T.filter(t => t.truth !== "stranger").length;
  scaPanel.live.textContent = SCA ? SITE.fmt("ทดสอบแล้ว {a} รอบ: ผู้ลงทะเบียน {b} · คนนอก {c}", { a: T.length, b: mem, c: T.length - mem }) : "";
}
function attCheckStep(faces, now, ctx) {
  const f = faces[0], m = f ? bestMatch(f, 0) : null;
  const obs = { face: !!f, label: m && m.label !== "unknown" && people.some(p => p.id === m.label) ? m.label : null, confident: !!(m && m.confident !== false) };
  draw(ctx, faces.map((x, i) => ({ f: x, kind: i === 0 && obs.label ? (obs.confident ? "pending" : "ask") : "unknown", name: "ทดสอบ" })));
  const cur = SCA.cur;
  if (!cur) return;
  const r = cur.trial.step(obs, now);
  scaPanel.q(".sc-now").textContent = r ? SITE.fmt("ผล: {a}", { a: OUT_TH[r.outcome] }) : obs.face ? "กำลังดูใบหน้า..." : "รอให้ผู้ทดสอบมายืนหน้ากล้อง...";
  if (r) { SCA.trials.push({ truth: cur.truth, outcome: r.outcome, label: r.label, ms: Math.round(r.ms), ...(cur.truth === "stranger" ? { sid: cur.sid } : {}) }); SCA.cur = null; scaPanel.q(".sc-go").disabled = false; scaRender(); }
}
function scaStart() {
  if (SCA) return;
  if (!ready) return say("กล้องยังไม่พร้อม", "err");
  if (!people.length) return say("ยังไม่มีผู้ลงทะเบียน กรุณาลงทะเบียนใบหน้าก่อน", "warn");
  SCA = { trials: [], cur: null, startedAt: Date.now(), health: new Set(), ownScan: !scanning, n: people.length };
  scaWho(); scaPanel.q(".sc-sidl").hidden = scaPanel.q(".sc-who").value !== "stranger"; scaPanel.q(".sc-trial").hidden = false; scaPanel.start.disabled = true; scaPanel.stop.disabled = false; scaPanel.exp.hidden = true;
  scaPanel.state.textContent = "กำลังตรวจ"; scaPanel.state.dataset.s = "live"; SITE.renderReport(scaPanel.report, null);
  if (!scanning) { scanning = true; $("#startScan").textContent = "หยุดสแกน"; loop(); }
  scaRender();
}
function scaFinish() {
  if (!SCA) return;
  const run = SCA; SCA = null;
  if (run.ownScan && scanning) { scanning = false; $("#startScan").textContent = "เริ่มสแกน"; overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height); }
  const rep = SITE.attendanceReport(run.trials);
  rep.recs.push(...[...run.health].map(c => "สภาพภาพระหว่างตรวจ: " + SITE.HEALTH_TH[c]).filter(Boolean));
  SITE.renderReport(scaPanel.report, rep);
  scaPanel.q(".sc-trial").hidden = true; scaPanel.start.disabled = false; scaPanel.stop.disabled = true;
  scaPanel.state.textContent = SITE.verdictText(rep); scaPanel.state.dataset.s = rep.verdict;
  const ids = new Map(); const anon = id => id == null ? null : id === "stranger" ? "stranger" : (ids.has(id) ? ids.get(id) : ids.set(id, "m" + (ids.size + 1)).get(id));
  const doc = SITE.exportDoc("attendance", {
    startedAt: new Date(run.startedAt).toISOString(), enrolled: run.n, settings: { matchDistance: settings.matchDistance, confirmFrames: 2, confidentFrames: 2, windowMs: 6000 },
    conditions: { health: [...run.health] }, trials: run.trials.map(t => ({ truth: anon(t.truth), outcome: t.outcome, label: anon(t.label), ms: t.ms, ...(t.sid != null ? { sid: "s" + t.sid } : {}) })),
    distinctPeople: { members: rep.n.distinctMembers, strangers: rep.n.distinctStrangers },
    fieldConfirmations: { ...fieldStats }, report: { verdict: rep.verdict, provisional: rep.provisional, pilot: rep.pilot ? rep.pilot.verdict : null, need: rep.need, n: rep.n, recognised: rep.recognised, recognisedCluster: rep.recognisedCluster, strangerAutoCluster: rep.strangerAutoCluster, auto: rep.auto, wrong: rep.wrong, strangerAuto: rep.strangerAuto, strangerAsk: rep.strangerAsk, recs: rep.recs }
  });
  scaPanel.exp.hidden = false; scaPanel.exp.onclick = () => SITE.download(`lensiq-attendance-check-${day()}.json`, doc);
  scaHist.add({ at: run.startedAt, verdict: rep.verdict, provisional: rep.provisional, pilot: rep.pilot ? rep.pilot.verdict : null, need: rep.need, cam: camera.label || "จุดเช็คชื่อ", summary: SITE.fmt("ผู้ลงทะเบียน {a} รอบ จำได้ {b} · คนนอก {c} รอบ เช็คชื่อผิด {d}", { a: rep.n.members, b: rep.recognised.p == null ? "—" : (rep.recognised.p * 100).toFixed(0) + "%", c: rep.n.strangers, d: rep.n.strangerAuto }) });
  scaHist.render(scaPanel.hist);
  SCA_LAST = { rep, doc };
}
if (scaPanel) {
  scaPanel.start.addEventListener("click", scaStart);
  scaPanel.stop.addEventListener("click", scaFinish);
  scaPanel.q(".sc-go").addEventListener("click", () => {
    if (!SCA || SCA.cur) return;
    const who = scaPanel.q(".sc-who").value;
    SCA.cur = { truth: who, sid: who === "stranger" ? Math.max(1, Math.min(999, +scaPanel.q(".sc-sid").value || 1)) : null, trial: SITE.createFaceTrial() };
    scaPanel.q(".sc-go").disabled = true; scaPanel.q(".sc-now").textContent = "รอให้ผู้ทดสอบมายืนหน้ากล้อง...";
  });
  scaPanel.q(".sc-undo").addEventListener("click", () => { if (SCA && SCA.trials.length) { SCA.trials.pop(); scaRender(); } });
  // คนนอก: ใส่หมายเลขเพื่อให้ระบบรู้ว่าทดสอบคนนอกกี่คน (คนเดิมทดสอบซ้ำไม่นับเป็นหลักฐานอิสระ — cluster bootstrap)
  scaPanel.q(".sc-who").addEventListener("change", () => { scaPanel.q(".sc-sidl").hidden = scaPanel.q(".sc-who").value !== "stranger"; });
  scaHist.render(scaPanel.hist); renderField();
}
// bridge for attendance-hr.js (employee time attendance): read-only view of this page's state + the status line
window.__ATT_CORE = { get people() { return people; }, get ready() { return ready; }, get scanning() { return scanning; }, say, video, isTest: TEST };
window.__ATT_SC = { get active() { return SCA; }, get last() { return SCA_LAST; }, get field() { return { ...fieldStats }; } };

// sales demo mode (?demo=1, lensiq-demo.js): no camera and no face models — the demo is PIN / QR on sample employees
function demoNoCamera() {
  const txt = () => /** @type {any} */ (window).LQDemo.t("demo.att.cam", "โหมดสาธิต: ไม่เปิดกล้อง ลงเวลาด้วย PIN หรือบัตร QR ได้ตามปกติ");
  const show = () => { camMsg.classList.remove("hide"); camMsg.textContent = txt(); say(txt(), "warn"); };
  show(); window.addEventListener("lq-lang", show);
}
renderPeople(); renderLogs();
if (/** @type {any} */ (window).LQDemo && /** @type {any} */ (window).LQDemo.on) demoNoCamera(); else init();
