const MODEL_URL = "vendor/models/";
// ค่าความต่างใบหน้าสูงสุดที่ยอมรับ (ยิ่งต่ำยิ่งเข้มงวด) — ตั้งค่าได้ เก็บใน att-settings
// retentionDays: ลบการลงทะเบียนใบหน้าที่ไม่ได้ใช้เกินกี่วัน (ค่าเริ่ม 365)
const settings = Object.assign({ matchDistance: 0.55, retentionDays: 365 }, (() => { try { return JSON.parse(localStorage.getItem("att-settings")) || {}; } catch { return {}; } })());
const MAX_FACES = 5;
const TEST = !!(window.LQDetect && LQDetect.isTest()); // localhost + ?fakedet เท่านั้น
const $ = s => document.querySelector(s);
const video = $("#video"), overlay = $("#overlay"), banner = $("#banner"), camMsg = $("#camMsg");
const detOpts = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

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
/* ต้องใกล้กว่าคนอันดับสองอย่างน้อยเท่านี้จึงยอมรับ (กันเช็คชื่อผิดคน) — วัดบน LFW: ผิดคนลดจาก 0.88% เหลือ 0.24% ที่ 100 คน (ACCURACY.md) */
const MATCH_MARGIN = 0.05;
const lastSaid = new Map();   // pid -> เวลาแจ้งล่าสุด (กันข้อความซ้ำรายคน)
const lastResult = new Map(); // pid -> {kind, text} ผลเช็คชื่อล่าสุดของคนนั้น
const confirm2 = LQTrack.createConfirm({ need: 2, windowMs: 1500 }); // ต้องเห็นตรงกัน 2 เฟรมก่อนบันทึก

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
  const models = TEST ? Promise.resolve() : LQDetect.tfBackend().then(() => Promise.all([
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
  const withFace = people.filter(p => Array.isArray(p.descriptor));
  matcher = withFace.length ? withFace.map(p => ({ label: p.id, d: new Float32Array(p.descriptor) })) : null;
}

// ---------- ตรวจจับใบหน้า ----------
// คืน [{box:{x,y,width,height} (พิกเซลของวิดีโอ), descriptor:Float32Array|null, fake?}] เรียงจากใบใหญ่ไปเล็ก
async function detectFaces(max = MAX_FACES) {
  let faces;
  const fk = TEST ? LQDetect.fake("att", performance.now()) : null;
  if (fk) {
    const W = video.videoWidth || overlay.width || 1, H = video.videoHeight || overlay.height || 1;
    faces = fk.map(d => ({ box: { x: d.x * W, y: d.y * H, width: d.w * W, height: d.h * H }, descriptor: d.descriptor ? Float32Array.from(d.descriptor) : null, fake: d }));
  } else {
    const r = await faceapi.detectAllFaces(video, detOpts()).withFaceLandmarks().withFaceDescriptors();
    faces = r.map(x => { const b = x.detection.box; return { box: { x: b.x, y: b.y, width: b.width, height: b.height }, descriptor: x.descriptor }; });
  }
  return faces.sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height).slice(0, max);
}
// ใบหน้าตรงกับใครที่สุด -> {label, distance} (label = id ผู้ลงทะเบียน หรือ "unknown")
function bestMatch(f, i) {
  if (TEST && typeof window.__LQ_FAKE_MATCH === "function") return window.__LQ_FAKE_MATCH(f.fake || f, i) || { label: "unknown", distance: 1 };
  if (!matcher || !f.descriptor) return { label: "unknown", distance: 1 };
  const m = LQTrack.matchFace(f.descriptor, matcher, { maxDist: settings.matchDistance, margin: MATCH_MARGIN });
  return { label: m.label, distance: m.distance };
}

// ---------- ลงทะเบียน (หนึ่งใบหน้าเท่านั้น) ----------
async function capture(samples = 3) {
  const ds = [];
  for (let i = 0; i < samples; i++) {
    const r = await detectFaces(Infinity);
    if (r.length !== 1) throw new Error(r.length ? "พบใบหน้าหลายคน กรุณาให้เหลือคนเดียว" : "ไม่พบใบหน้า กรุณาหันหน้าตรงกล้อง");
    if (!r[0].descriptor) throw new Error("อ่านลักษณะใบหน้าไม่สำเร็จ กรุณาลองใหม่");
    ds.push(r[0].descriptor);
    await new Promise(r => setTimeout(r, 350));
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
  btn.disabled = true; set("กำลังสแกน กรุณามองกล้องนิ่ง ๆ...", "");
  try {
    const descriptor = await capture();
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
const RES_CLS = { ok: "ok", dup: "warn", pending: "", unknown: "unknown", err: "err" };
let unknownAt = 0;

async function loop() {
  if (!scanning) return;
  const ctx = overlay.getContext("2d");
  if (video.readyState < 2) { ctx.clearRect(0, 0, overlay.width, overlay.height); setTimeout(loop, 400); return; } // กล้องพักชั่วคราว
  try {
    const faces = await detectFaces();
    if (!scanning) return;
    const now = performance.now();
    // จับคู่แบบไม่ซ้ำ: แต่ละคนถูกใช้ได้ครั้งเดียวต่อเฟรม ใบหน้าที่ใกล้ที่สุดได้ไป ที่เหลือถือว่าไม่รู้จัก
    const cands = [];
    faces.forEach((f, i) => { const m = bestMatch(f, i); if (m.label !== "unknown" && people.some(p => p.id === m.label)) cands.push({ i, key: m.label, dist: m.distance }); });
    const got = LQTrack.assignUnique(cands, settings.matchDistance);
    const rows = faces.map((f, i) => {
      const a = got.get(i), p = a && people.find(x => x.id === a.key);
      if (!p) return { f, kind: "unknown", name: "ไม่รู้จัก", text: "ไม่พบในระบบ กรุณาลงทะเบียน" };
      const st = confirm2.hit(p.id, now);
      if (st === "pending") return { f, kind: "pending", name: p.name, text: "กำลังยืนยันตัวตน..." };
      if (st === "confirmed") {
        if (Date.now() - (p.lastSeen || 0) > 3600000) { p.lastSeen = Date.now(); savePeople({ faces: false }); } // นับวันเก็บข้อมูลจากการใช้ล่าสุด
        const r = checkIn(p);
        if (r.kind === "err") confirm2.reset(p.id); // เช่น ยังไม่กรอกหัวข้อ ให้ลองใหม่เฟรมถัดไป
        else lastResult.set(p.id, r);
        notify(p, r);
        return { f, name: p.name, ...r };
      }
      return { f, name: p.name, ...(lastResult.get(p.id) || { kind: "dup", text: "เช็คชื่อแล้ว" }) };
    });
    confirm2.prune(now);
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
    const b = r.f.box, col = r.kind === "ok" || r.kind === "dup" ? "#2ecc71" : r.kind === "pending" ? "#22d3ee" : r.kind === "err" ? "#e74c3c" : "#e67e22";
    ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.strokeRect(b.x, b.y, b.width, b.height);
    const label = r.kind === "unknown" ? "ไม่รู้จัก" : r.name, tw = ctx.measureText(label).width + 12, ty = Math.max(fs + 8, b.y);
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
  el.innerHTML = shown.map(r => `<li class="fr ${RES_CLS[r.kind]}" data-kind="${r.kind}"><span>${esc(r.name)}</span><small>${esc(r.text)}</small></li>`).join("")
    + (unk ? `<li class="fr unknown" data-kind="unknown"><span>ไม่รู้จัก${unk > 1 ? ` ${unk} คน` : ""}</span><small>ไม่พบในระบบ</small></li>` : "");
}
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
  say(r.kind === "ok" ? `✓ เช็คชื่อสำเร็จ: ${p.name} (${r.time})` : r.kind === "dup" ? `${p.name} ${r.text}` : r.text, RES_CLS[r.kind]);
}

// บันทึกการเข้าเรียน -> {kind:'ok'|'dup'|'err', text, time?}
function checkIn(p) {
  const s = session(), d = day();
  if (!s) return { kind: "err", text: "กรุณากรอกหัวข้อ/รอบการอบรมก่อน" };
  const already = logs.find(l => l.pid === p.id && l.session === s && l.date === d);
  if (already) return { kind: "dup", text: `เช็คชื่อแล้วเมื่อ ${already.time}`, time: already.time };
  const time = TIME();
  logs.push({ pid: p.id, name: p.name, code: p.code, session: s, date: d, time });
  store("att-logs", logs); renderLogs();
  return { kind: "ok", text: `เช็คชื่อสำเร็จ ${time}`, time };
}

$("#startScan").onclick = () => {
  if (!ready) return say("กล้องยังไม่พร้อม — ดูข้อความในกรอบกล้อง หรือกดอนุญาตกล้องที่เบราว์เซอร์ แล้วรีเฟรช", "err");
  if (!people.length) return say("ยังไม่มีผู้ลงทะเบียน กรุณาลงทะเบียนใบหน้าก่อน", "warn");
  if (!session()) { needSession(); return say("กรุณากรอก \"หัวข้อ/รอบการอบรม\" ที่ช่องด้านบนก่อน แล้วกดเริ่มสแกนอีกครั้ง", "warn"); }
  scanning = !scanning;
  $("#startScan").textContent = scanning ? "หยุดสแกน" : "เริ่มสแกน";
  if (scanning) loop(); else { overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height); $("#faceResults").innerHTML = ""; $("#unknownNote").hidden = true; say("หยุดสแกนแล้ว"); }
};

// ---------- แสดงผล ----------
function renderLogs() {
  const s = session(), d = day();
  const today = logs.filter(l => l.date === d && (!s || l.session === s));
  $("#todayCount").textContent = today.length;
  $("#recent").innerHTML = today.slice().reverse().map(l => `<li><span>${esc(l.name)} <small>${esc(l.code)}</small></span><small>${esc(l.time)}</small></li>`).join("");
  $("#logBody").innerHTML = logs.slice().reverse().map(l =>
    `<tr><td>${esc(l.date)} ${esc(l.time)}</td><td>${esc(l.name)}</td><td>${esc(l.code)}</td><td>${esc(l.session)}</td></tr>`).join("")
    || `<tr><td colspan="4">ยังไม่มีบันทึก</td></tr>`;
}
function renderPeople() {
  $("#peopleCount").textContent = people.length;
  $("#people").innerHTML = people.map(p => `<li><span>${esc(p.name)} <small>${esc(p.code)}</small>${Array.isArray(p.descriptor) ? "" : ' <small class="hint">(อ่านข้อมูลใบหน้าไม่ได้)</small>'}</span><button type="button" data-id="${p.id}" aria-label="ลบข้อมูลใบหน้าของ ${esc(p.name)}">ลบข้อมูล</button></li>`).join("");
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
{
  const sel = $("#retention");
  sel.value = String(settings.retentionDays);
  if (sel.value !== String(settings.retentionDays)) { settings.retentionDays = 365; sel.value = "365"; }
  sel.addEventListener("change", () => {
    settings.retentionDays = +sel.value || 365;
    store("att-settings", settings);
    const n = applyRetention();
    if (n) { rebuildMatcher(); renderPeople(); say(`ลบข้อมูลใบหน้าที่ไม่ได้ใช้เกิน ${settings.retentionDays} วันแล้ว ${n} คน`, "warn"); }
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
  ["checkin", "register", "records"].forEach(n => $("#pane-" + n).hidden = n !== t.dataset.t);
  mode = t.dataset.t;
  if (mode !== "checkin" && scanning) $("#startScan").click();
});

// ---------- ตั้งค่าความเข้มงวด ----------
{
  const inp = $("#matchDist"), out = $("#matchDistVal");
  inp.value = settings.matchDistance; out.textContent = (+settings.matchDistance).toFixed(2);
  inp.addEventListener("input", () => {
    settings.matchDistance = Math.min(0.7, Math.max(0.3, +inp.value || 0.55));
    out.textContent = settings.matchDistance.toFixed(2);
    store("att-settings", settings); rebuildMatcher();
  });
}

renderPeople(); renderLogs(); init();
