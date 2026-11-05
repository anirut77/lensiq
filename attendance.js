const MODEL_URL = "vendor/models/";
const MATCH_DISTANCE = 0.55; // ยิ่งต่ำยิ่งเข้มงวด
const $ = s => document.querySelector(s);
const video = $("#video"), overlay = $("#overlay"), banner = $("#banner"), camMsg = $("#camMsg");
const detOpts = () => new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { alert("พื้นที่จัดเก็บเต็มหรือถูกบล็อก"); } };
let people = load("att-people", []);  // {id,name,code,descriptor:number[]}
let logs = load("att-logs", []);      // {pid,name,code,session,date,time}

let mode = "checkin", scanning = false, ready = false, lastMsgAt = 0;
let matcher = null;

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

// ---------- โหลดโมเดลและกล้อง ----------
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

const camera = createCamera(video, {
  layout(c) {
    video.parentElement.classList.toggle("mirror", c.mirrored);
    if (video.videoWidth && (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight)) { overlay.width = video.videoWidth; overlay.height = video.videoHeight; }
  },
  onError: e => { ready = false; showCamError(camErrorText(e)); }
});
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

// เลือกตัวประมวลผล: WebGL (เร็วสุด) -> WASM -> CPU (ช้าสุดแต่ใช้ได้ทุกเครื่อง)
async function initBackend() {
  const tf = faceapi.tf;
  tf.setWasmPaths("vendor/");
  for (const name of ["webgl", "wasm", "cpu"]) {
    try {
      if (await tf.setBackend(name)) { await tf.ready(); console.info("face backend:", name); return name; }
    } catch (e) { console.warn("backend", name, "failed", e); }
  }
  throw new Error("ไม่มีตัวประมวลผลที่ใช้ได้");
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
  const models = initBackend().then(() => Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ]));

  const [c, m] = await Promise.allSettled([cam, models]);
  if (c.status === "rejected") return showCamError(camErrorText(c.reason));
  if (m.status === "rejected") return showCamError("โหลดโมเดลตรวจจับใบหน้าไม่สำเร็จ ไม่พบไฟล์โมเดลใน vendor/models (ตรวจว่ารันเว็บจากโฟลเดอร์โปรเจกต์ ไม่ได้เปิดไฟล์ตรง ๆ)");

  ready = true; camMsg.classList.add("hide");
  rebuildMatcher(); say("พร้อมใช้งาน");
}

function rebuildMatcher() {
  matcher = people.length
    ? new faceapi.FaceMatcher(people.map(p => new faceapi.LabeledFaceDescriptors(p.id, [new Float32Array(p.descriptor)])), MATCH_DISTANCE)
    : null;
}

// ---------- ลงทะเบียน ----------
async function capture(samples = 3) {
  const ds = [];
  for (let i = 0; i < samples; i++) {
    const r = await faceapi.detectAllFaces(video, detOpts()).withFaceLandmarks().withFaceDescriptors();
    if (r.length !== 1) throw new Error(r.length ? "พบใบหน้าหลายคน กรุณาให้เหลือคนเดียว" : "ไม่พบใบหน้า กรุณาหันหน้าตรงกล้อง");
    ds.push(r[0].descriptor);
    await new Promise(r => setTimeout(r, 350));
  }
  return Array.from(ds[0], (_, k) => ds.reduce((s, d) => s + d[k], 0) / ds.length);
}

$("#regForm").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, m = $("#regMsg"), btn = f.querySelector("button");
  const name = f.name.value.trim(), code = f.code.value.trim();
  const set = (t, c) => { m.textContent = t; m.className = "form-msg " + c; };
  if (!ready) return set("กล้องยังไม่พร้อม", "err");
  if (!name || !code) return set("กรุณากรอกชื่อและรหัส", "err");
  if (!f.consent.checked) return set("ต้องยินยอมการเก็บข้อมูลใบหน้าก่อน", "err");
  if (people.some(p => p.code === code)) return set("รหัสนี้ลงทะเบียนแล้ว", "err");
  btn.disabled = true; set("กำลังสแกน กรุณามองกล้องนิ่ง ๆ...", "");
  try {
    const descriptor = await capture();
    if (matcher) {
      const best = matcher.findBestMatch(new Float32Array(descriptor));
      if (best.label !== "unknown") {
        const dup = people.find(p => p.id === best.label);
        throw new Error(`ใบหน้านี้ลงทะเบียนแล้วในชื่อ ${dup.name}`);
      }
    }
    people.push({ id: crypto.randomUUID(), name, code, descriptor });
    store("att-people", people); rebuildMatcher(); renderPeople();
    f.reset(); set(`ลงทะเบียน ${name} สำเร็จ`, "ok");
  } catch (err) { set(err.message, "err"); }
  btn.disabled = false;
});

// ---------- สแกนเช็คชื่อ ----------
async function loop() {
  if (!scanning) return;
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (video.readyState < 2) { setTimeout(loop, 400); return; } // กล้องพักชั่วคราว (สลับแอป/สลับกล้อง)
  try {
    const results = await faceapi.detectAllFaces(video, detOpts()).withFaceLandmarks().withFaceDescriptors();
    results.forEach(r => {
      const hit = matcher ? matcher.findBestMatch(r.descriptor) : { label: "unknown" };
      const person = people.find(p => p.id === hit.label);
      const b = r.detection.box;
      ctx.lineWidth = 3; ctx.strokeStyle = person ? "#2ecc71" : "#e67e22";
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      if (person) checkIn(person); else if (Date.now() - lastMsgAt > 2500) { say("ไม่พบข้อมูลใบหน้านี้ในระบบ กรุณาลงทะเบียนก่อน", "warn"); lastMsgAt = Date.now(); }
    });
    if (!results.length && Date.now() - lastMsgAt > 2500) say("กำลังสแกน... กรุณาหันหน้าเข้าหากล้อง");
  } catch (e) { console.error(e); }
  setTimeout(loop, 400);
}

function checkIn(p) {
  const s = session(), d = day();
  if (!s) { say("กรุณากรอกหัวข้อ/รอบการอบรมก่อน", "warn"); lastMsgAt = Date.now(); return; }
  const already = logs.find(l => l.pid === p.id && l.session === s && l.date === d);
  lastMsgAt = Date.now();
  if (already) return say(`${p.name} เช็คชื่อแล้วเมื่อ ${already.time}`, "warn");
  const time = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  logs.push({ pid: p.id, name: p.name, code: p.code, session: s, date: d, time });
  store("att-logs", logs); renderLogs();
  say(`✓ เช็คชื่อสำเร็จ: ${p.name} (${time})`, "ok");
}

$("#startScan").onclick = () => {
  if (!ready) return say("กล้องยังไม่พร้อม — ดูข้อความในกรอบกล้อง หรือกดอนุญาตกล้องที่เบราว์เซอร์ แล้วรีเฟรช", "err");
  if (!people.length) return say("ยังไม่มีผู้ลงทะเบียน กรุณาลงทะเบียนใบหน้าก่อน", "warn");
  if (!session()) { needSession(); return say("กรุณากรอก \"หัวข้อ/รอบการอบรม\" ที่ช่องด้านบนก่อน แล้วกดเริ่มสแกนอีกครั้ง", "warn"); }
  scanning = !scanning;
  $("#startScan").textContent = scanning ? "หยุดสแกน" : "เริ่มสแกน";
  if (scanning) loop(); else { overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height); say("หยุดสแกนแล้ว"); }
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
  $("#people").innerHTML = people.map(p => `<li><span>${esc(p.name)} <small>${esc(p.code)}</small></span><button type="button" data-id="${p.id}" aria-label="ลบข้อมูลใบหน้าของ ${esc(p.name)}">ลบข้อมูล</button></li>`).join("");
}
$("#people").addEventListener("click", e => {
  const id = e.target.dataset.id; if (!id) return;
  const p = people.find(x => x.id === id);
  if (!confirm(`ลบข้อมูลใบหน้าของ ${p.name}? (บันทึกการเข้าเรียนเดิมยังอยู่)`)) return;
  people = people.filter(x => x.id !== id); store("att-people", people); rebuildMatcher(); renderPeople();
});
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

renderPeople(); renderLogs(); init();
