/* จดจำลูกค้าและประวัติเครื่องดื่ม — ประมวลผลในเบราว์เซอร์ ไม่เก็บรูปถ่าย */

// ================= ฟังก์ชันคำนวณ (ไม่พึ่ง DOM — ทดสอบได้) =================
const DAY = 86400000;
const SIZES = ["S", "M", "L"], SIZE_ADD = { S: 0, M: 10, L: 20 };
const SWEETS = [0, 25, 50, 100], TEMPS = ["เย็น", "ร้อน", "ปั่น"];
const LAPSED_DAYS = 30;

const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const unitPrice = (base, size) => base + (SIZE_ADD[size] || 0);

function ordersOf(orders, mid) { return orders.filter(o => o.mid === mid).sort((a, b) => a.time - b.time); }

/** จำนวนวันที่มาซื้อ (นับวันไม่ซ้ำ) */
function visitCount(list) { return new Set(list.map(o => dayKey(o.time))).size; }

/** เมนูที่สั่งบ่อย เรียงจากจำนวนแก้วมากไปน้อย (เสมอกัน -> สั่งล่าสุดก่อน) */
function favorites(list, n = 3) {
  const m = new Map();
  list.forEach(o => {
    const f = m.get(o.drinkId) || { drinkId: o.drinkId, name: o.name, cat: o.cat, count: 0, last: 0 };
    f.count += o.qty || 1; f.last = Math.max(f.last, o.time); f.name = o.name;
    m.set(o.drinkId, f);
  });
  return [...m.values()].sort((a, b) => b.count - a.count || b.last - a.last).slice(0, n);
}

/** ตัวเลือกที่ชอบ (ค่าที่พบบ่อยที่สุดของขนาด ความหวาน แบบ) */
function preferences(list) {
  const mode = k => {
    const c = new Map(); list.forEach(o => c.set(o[k], (c.get(o[k]) || 0) + (o.qty || 1)));
    let best = null, n = 0; c.forEach((v, key) => { if (v > n) { n = v; best = key; } });
    return best;
  };
  return list.length ? { size: mode("size"), sweet: mode("sweet"), temp: mode("temp") } : null;
}

/** ยอดขายต่อเมนูของทั้งร้าน */
function popularity(orders) {
  const m = new Map(); orders.forEach(o => m.set(o.drinkId, (m.get(o.drinkId) || 0) + (o.qty || 1)));
  return m;
}

/**
 * แนะนำเครื่องดื่ม:
 * 1) ลูกค้าใหม่ -> เมนูขายดีของร้าน
 * 2) เมนูที่ยังไม่เคยลองในหมวดที่ชอบที่สุด (เลือกตัวที่ขายดีที่สุดในร้าน)
 * 3) ลองครบหมวดแล้ว -> เมนูขายดีของร้านที่ยังไม่เคยลอง
 * 4) ลองครบทุกเมนูแล้ว -> เมนูโปรด
 */
function recommend(list, menu, allOrders) {
  const pop = popularity(allOrders), byPop = (a, b) => (pop.get(b.id) || 0) - (pop.get(a.id) || 0);
  const active = menu.filter(d => !d.hidden);
  if (!active.length) return null;
  if (!list.length) return { item: [...active].sort(byPop)[0], reason: "เมนูขายดีของร้าน" };
  const tried = new Set(list.map(o => o.drinkId));
  const catCount = new Map(); list.forEach(o => catCount.set(o.cat, (catCount.get(o.cat) || 0) + (o.qty || 1)));
  const favCat = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const sameCat = active.filter(d => d.cat === favCat && !tried.has(d.id)).sort(byPop);
  if (sameCat.length) return { item: sameCat[0], reason: `ชอบหมวด${favCat} แต่ยังไม่เคยลองเมนูนี้` };
  const untried = active.filter(d => !tried.has(d.id)).sort(byPop);
  if (untried.length) return { item: untried[0], reason: "เมนูขายดีที่ยังไม่เคยลอง" };
  const fav = favorites(list, 1)[0];
  return { item: active.find(d => d.id === fav.drinkId) || active[0], reason: "เมนูโปรดของคุณ" };
}

/** กลุ่มลูกค้า: new / regular / lapsed */
function segment(list, now = Date.now()) {
  if (!list.length) return "new";
  const last = list[list.length - 1].time;
  if (now - last > LAPSED_DAYS * DAY) return "lapsed";
  return visitCount(list) >= 2 ? "regular" : "new";
}
const SEG_TH = { new: "ลูกค้าใหม่", regular: "ลูกค้าประจำ", lapsed: "หายไปนาน" };

/** สรุปภาพรวมร้าน */
function storeStats(members, orders, now = Date.now()) {
  const revenue = orders.reduce((s, o) => s + o.price * (o.qty || 1), 0);
  const cups = orders.reduce((s, o) => s + (o.qty || 1), 0);
  const buyers = members.map(m => ordersOf(orders, m.id)).filter(l => l.length);
  const repeat = buyers.length ? buyers.filter(l => visitCount(l) >= 2).length / buyers.length : 0;
  const segs = { new: 0, regular: 0, lapsed: 0 };
  members.forEach(m => segs[segment(ordersOf(orders, m.id), now)]++);
  const tickets = new Set(orders.map(o => o.ticket || o.id)).size;
  return { revenue, cups, repeat, segs, avgTicket: tickets ? revenue / tickets : 0, tickets };
}

// ================= แอป (ทำงานเฉพาะในเบราว์เซอร์) =================
if (typeof document !== "undefined") (() => {
  const MODEL_URL = "vendor/models/";
  // วัดบน LFW (tests/bench/face.bench.mjs, ACCURACY.md): 0.50 = จำสมาชิกได้ ~78% (ลงทะเบียนภาพเดียว) แต่แทบไม่จำผิดคน
  // — ร้านค้าแสดงชื่อ/ประวัติการสั่ง จึงเลือกฝั่งปลอดภัย ; MATCH_MARGIN กันกรณีหน้าคล้ายสมาชิกสองคน
  // round 4 (tests/bench/face1n.bench.mjs): 0.55 + เกณฑ์รายคน 0.85 × ระยะถึงสมาชิกที่ใกล้ที่สุด (ไม่ต่ำกว่า 0.45) + คุณภาพภาพ
  //   + ลงทะเบียน 3 ท่า + ยืนยัน 2 เฟรม: LFW 100 คน จำได้ ~85–88% คนนอกถูกทัก < 1% (เดิม 0.50: 80% / 1.75%)
  // round 5 (LQTrack.FACE_RULES): 0.50 / 0.85 × nn (>= 0.44) / margin 0.09, all scaled to the enrolled group (gallerySpread),
  //   so a small or Asian-only member list is not looser than a large one (CASIA-FaceV5 20 members: strangers 6.5% -> 0.3%).
  //   Measured with 100 members (ACCURACY.md §2 round 5): LFW member recognised 85%, non-member offered a name ~0.4%
  //   (selected automatically ~0.05%); CASIA 69% / 0.2% — the same figures as the note in customers.html.
  //   A match that is not "confident" (or < 5 members enrolled) is never auto-selected: the cashier taps the name chip.
  const FACE_RULES = LQTrack.FACE_RULES, MATCH_DISTANCE = FACE_RULES.maxDist, MATCH_MARGIN = FACE_RULES.margin;
  const K = { members: "cx-members", orders: "cx-orders", menu: "cx-menu" };
  const DEFAULT_MENU = [
    ["อเมริกาโน่", "กาแฟ", 50], ["ลาเต้", "กาแฟ", 60], ["คาปูชิโน่", "กาแฟ", 60], ["มอคค่า", "กาแฟ", 65],
    ["ชาไทย", "ชา", 50], ["ชาเขียวมัทฉะลาเต้", "ชา", 60], ["ชามะนาว", "ชา", 45],
    ["โกโก้", "ช็อกโกแลต", 55], ["นมสดคาราเมล", "นม", 50],
    ["อิตาเลียนโซดาบลูฮาวาย", "โซดา", 45], ["น้ำผึ้งมะนาวโซดา", "โซดา", 45]
  ].map(([name, cat, price], i) => ({ id: "d" + (i + 1), name, cat, price }));

  const $ = s => document.querySelector(s);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const baht = n => "฿" + Math.round(n).toLocaleString("th-TH");
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { alert("พื้นที่จัดเก็บเต็มหรือถูกบล็อก"); } };
  const fmtTime = t => new Date(t).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  const daysAgo = t => { const d = Math.floor((Date.now() - t) / DAY); return d <= 0 ? "วันนี้" : d === 1 ? "เมื่อวาน" : `${d} วันก่อน`; };
  const optText = o => `${o.size} · หวาน ${o.sweet}% · ${o.temp}`;

  // cx-members = {id,name,phone,created,consentAt,lastSeen?,faceDeletedAt?} (ไม่มีค่าใบหน้า — insights.js อ่านคีย์นี้)
  // ค่าใบหน้าเข้ารหัสอยู่ใน lqv-cx-faces (lensiq-facevault.js) และแนบกลับเป็น m.descriptor ในหน่วยความจำเท่านั้น
  const FACE_KEY = "lqv-cx-faces", PRIV_KEY = "cx-privacy";
  let members = load(K.members, []);
  let faceState = "enc";
  const priv = Object.assign({ retentionDays: 365 }, load(PRIV_KEY, {}) || {});
  let orders = load(K.orders, []);     // {id,ticket,mid,drinkId,name,cat,size,sweet,temp,qty,price,time}
  let menu = load(K.menu, null) || DEFAULT_MENU;
  // เมนูตัวอย่างชุดเก่ามีสินค้าแบรนด์น้ำดื่ม — เปลี่ยนชื่อเฉพาะรายการตัวอย่าง (id เดิม) ประวัติออเดอร์เดิมไม่แตะ
  if (menu.some(d => /AQUALINE/.test(d.name))) {
    menu.forEach(d => { const n = DEFAULT_MENU.find(x => x.id === d.id); if (n && /AQUALINE/.test(d.name)) Object.assign(d, { name: n.name, cat: n.cat }); });
    store(K.menu, menu);
  }
  const saveQ = LQVault.queue();
  function saveMembers(opts) {
    const snap = members.slice();
    return saveQ(() => LQVault.splitSave(K.members, FACE_KEY, snap, "descriptor", localStorage, opts)
      .then(m => { if (m) showFaceState(m); return true; })
      .catch(e => { if (e.name === "VaultLockedError") showFaceState("locked"); else if (e.name === "VaultInsecureError") showFaceState("insecure"); else alert("พื้นที่จัดเก็บเต็มหรือถูกบล็อก"); return false; }));
  }
  function showFaceState(st) {
    faceState = st;
    const el = $("#faceState"); if (!el) return;
    el.textContent = LQVault.STATE_TH[st] || ""; el.className = "hint vault-state " + st;
  }
  // ลบเฉพาะค่าใบหน้าของสมาชิกที่ไม่ได้มาเกิน N วัน (ประวัติการสั่งยังอยู่ ค้นหาด้วยชื่อได้)
  function applyRetention() {
    const now = Date.now(), last = new Map();
    orders.forEach(o => { if (o.time > (last.get(o.mid) || 0)) last.set(o.mid, o.time); });
    const ids = new Set(LQVault.expired(members.map(m => ({ ...m, lastSeen: Math.max(m.lastSeen || 0, last.get(m.id) || 0) || undefined })), priv.retentionDays, now));
    if (!ids.size) return 0;
    members.forEach(m => { if (ids.has(m.id)) { delete m.descriptor; m.faceDeletedAt = now; m.faceExpired = true; } });
    saveMembers();
    return ids.size;
  }
  const storageReady = LQVault.splitLoad(K.members, FACE_KEY, "descriptor", localStorage, { stamp: true }).then(r => {
    members = r.records; showFaceState(r.state);
    const n = applyRetention();
    if (n) engine(`ลบข้อมูลใบหน้าของสมาชิกที่ไม่ได้มาเกิน ${priv.retentionDays} วันแล้ว ${n} คน`, "warn");
    if (current) current = members.find(m => m.id === current.id) || null;
    renderAnalytics();
  }).catch(e => console.error(e));
  const saveAll = () => { saveMembers(); store(K.orders, orders); store(K.menu, menu); };

  const video = $("#video"), camBox = $("#camBox"), overlay = $("#camOverlay");
  let ready = false, matcher = null, scanning = false, current = null;

  const engine = (msg, cls = "") => { const e = $("#engine"); e.textContent = msg; e.className = "engine " + cls; };
  const INSECURE_MSG = "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด";
  const TEST = !!(window.LQDetect && LQDetect.isTest()); // localhost + ?fakedet เท่านั้น
  const MAX_FACES = 4;
  // ---------- กล้อง (LQCam): เลือกกล้องหน้า/หลัง · สะท้อนภาพเฉพาะกล้องหน้า · ปิดกล้องเมื่อสลับแอปแล้วเปิดต่อ · จำกล้องที่เลือก ----------
  // กล้องตัวเดียว: กล่อง camBox ถูกย้ายไปมาระหว่างแท็บหน้าร้านกับสมัครสมาชิก (showTab)
  const camSwitch = $("#camSwitch");
  function layout(c = camera) {
    camBox.classList.toggle("mirror", c.mirrored);
    if (video.videoWidth && (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight)) { overlay.width = video.videoWidth; overlay.height = video.videoHeight; }
  }
  const camera = LQCam.create(video, {
    facing: "user", persistKey: "cx-cam",
    onChange: (c, ev) => { if (ev.type === "started" || ev.type === "resumed") layout(c); },
    onError: (c, e) => { if (e && e.name !== "AbortError") showInitError(e); }
  });
  video.addEventListener("resize", () => { if (camera.active) layout(); });
  camera.attach(camSwitch);
  if (LQCam.offlineBadge) LQCam.offlineBadge(camera, camBox); // "กล้องออฟไลน์ตั้งแต่ HH:MM" + เชื่อมต่อใหม่อัตโนมัติ

  // ---------- เริ่มระบบ ----------
  async function init() {
    engine("กำลังเปิดกล้องและโหลดโมเดล...");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("insecure"), { name: "Insecure" });
      // speed pass 2026-11-14: the face models are fetched only once the camera is open (nothing if it is refused)
      const camP = camera.start();
      const [, backend] = await Promise.all([
        camP,
        TEST ? Promise.resolve("test") : camP.then(() => LQDetect.tfBackend()).then(async b => {
          await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
          ]);
          return b;
        }),
        storageReady
      ]);
      ready = true; rebuildMatcher();
      engine(`พร้อมใช้งาน (ตัวประมวลผล: ${backend.toUpperCase()})`, "ok");
    } catch (e) { showInitError(e); }
  }
  function showInitError(e) {
    console.error(e);
    const m = { Insecure: INSECURE_MSG, NotAllowedError: "ไม่ได้รับอนุญาตให้ใช้กล้อง", NotFoundError: "ไม่พบกล้อง", NotReadableError: "กล้องถูกโปรแกรมอื่นใช้อยู่" }[e.name];
    engine(`ระบบไม่พร้อม: ${m || "โหลดโมเดลไม่สำเร็จ"} (${e.name}: ${e.message || "-"}) — ยังค้นหาสมาชิกด้วยชื่อได้`, "err");
    if (e.name === "Insecure") { const a = document.createElement("a"); a.href = "cameras.html"; a.textContent = "ดูวิธีเปิดผ่าน https"; a.className = "engine-link"; $("#engine").append(" ", a); }
    const b = document.createElement("button");
    b.className = "btn ghost"; b.type = "button"; b.textContent = "ลองใหม่"; b.style.cssText = "margin-left:10px;padding:4px 14px";
    b.onclick = init; $("#engine").append(b);
  }
  function rebuildMatcher() {
    const withFace = members.filter(m => m.descriptor);
    // คลังใบหน้าในหน่วยความจำ — LQTrack.matchFace: ระยะ < MATCH_DISTANCE และห่างจากสมาชิกอันดับสอง >= MATCH_MARGIN
    matcher = withFace.length ? LQTrack.enrolGallery(withFace.map(m => ({ label: m.id, ds: [new Float32Array(m.descriptor)] })), FACE_RULES) : null;
  }
  // 320 แล้ว 224 / 160 เมื่อไม่พบใบหน้า (หน้าใกล้กล้องมาก) — LQDetect.detectFacesCascade, ACCURACY.md §2
  const detectReal = () => LQDetect.detectFacesCascade(faceapi, video, { sizes: LQDetect.FACE_SIZES, scoreThreshold: 0.5 });
  // ใบหน้าทั้งหมดในภาพ เรียงจากใหญ่ไปเล็ก -> [{box:{x,y,width,height} พิกเซลวิดีโอ, descriptor|null, fake?}]
  async function detectFaces(max = MAX_FACES) {
    let faces;
    const fk = TEST ? LQDetect.fake("cx", performance.now()) : null;
    if (fk) {
      const W = video.videoWidth || overlay.width || 1, H = video.videoHeight || overlay.height || 1;
      faces = fk.map(d => ({ box: { x: d.x * W, y: d.y * H, width: d.w * W, height: d.h * H }, descriptor: d.descriptor ? Float32Array.from(d.descriptor) : null, fake: d }));
    } else {
      const r = await detectReal();
      faces = r.map(x => { const b = x.detection.box; return { box: { x: b.x, y: b.y, width: b.width, height: b.height }, descriptor: x.descriptor, q: LQTrack.faceQuality({ box: b, score: x.detection.score, landmarks: x.landmarks.positions }) }; });
    }
    return faces.sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height).slice(0, max);
  }
  function bestMatch(f, i) {
    if (TEST && typeof window.__LQ_FAKE_MATCH === "function") return window.__LQ_FAKE_MATCH(f.fake || f, i) || { label: "unknown", distance: 1 };
    if (!matcher || !f.descriptor) return { label: "unknown", distance: 1 };
    if (f.q && !LQTrack.qualityOk(f.q)) return { label: "unknown", distance: 1, lowq: true };
    const m = LQTrack.matchFace(f.descriptor, matcher, { maxDist: MATCH_DISTANCE, margin: MATCH_MARGIN });
    return { label: m.label, distance: m.distance, confident: m.confident };
  }
  // ทุกใบหน้า (สูงสุด 4) -> [{box, label, distance}] สมาชิกหนึ่งคนจับคู่ได้แค่ใบหน้าเดียว (ใกล้สุดได้ไป)
  async function detectAll() {
    const faces = await detectFaces();
    const ms = faces.map(bestMatch);
    const cands = [];
    ms.forEach((m, i) => { if (m.label !== "unknown" && members.some(x => x.id === m.label && x.descriptor)) cands.push({ i, key: m.label, dist: m.distance }); });
    const got = LQTrack.assignUnique(cands, Infinity); // matchFace already applied the (calibrated) limits
    const res = faces.map((f, i) => { const a = got.get(i); return { box: f.box, label: a ? a.key : "unknown", distance: a ? a.dist : ms[i].distance, confident: !!a && ms[i].confident !== false }; });
    drawFaces(res);
    return res;
  }
  // วาดทุกกรอบ สีตามผลจับคู่ · ป้ายชื่อกลับด้านเพราะแคนวาสถูกสะท้อนด้วย CSS
  function drawFaces(res) {
    const ctx = overlay.getContext("2d"); ctx.clearRect(0, 0, overlay.width, overlay.height);
    const fs = Math.max(14, Math.round(overlay.width / 36)), mir = camera.mirrored;
    ctx.font = `500 ${fs}px Prompt, sans-serif`; ctx.textBaseline = "bottom";
    for (const r of res) {
      const b = r.box, m = r.label !== "unknown" && members.find(x => x.id === r.label);
      const col = m ? "#2ecc71" : "#e67e22", text = m ? m.name : "ไม่ใช่สมาชิก";
      ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.strokeRect(b.x, b.y, b.width, b.height);
      const tw = ctx.measureText(text).width + 12, ty = Math.max(fs + 8, b.y);
      ctx.save();
      if (mir) { ctx.translate(b.x + b.width, 0); ctx.scale(-1, 1); } else ctx.translate(b.x, 0);
      ctx.fillStyle = col; ctx.fillRect(0, ty - fs - 8, tw, fs + 8);
      ctx.fillStyle = "#0e1430"; ctx.fillText(text, 6, ty - 3);
      ctx.restore();
    }
  }

  // ---------- สแกนหน้าร้าน ----------
  // นับเฟรมติดกันต่อคน (Map<label,count>) — ต้องตรงกัน 2 เฟรมกันการจำผิด
  // สมาชิก 1 คน -> เลือกอัตโนมัติ · 2 คนขึ้นไป -> ชิปให้แคชเชียร์แตะเลือก · ผู้ที่ไม่ใช่สมาชิกไม่แย่งสมาชิก
  async function scanLoop() {
    const streak = new Map(), sureN = new Map(); // sureN: เฟรมติดกันที่จับคู่ได้แบบมั่นใจ
    clearChips();
    while (scanning) {
      const t0 = performance.now();
      try {
        if (video.readyState < 2) { await sleep(300); continue; } // กล้องถูกพักขณะสลับแอป/สลับกล้อง
        const res = await detectAll();
        healthStep(res);
        if (!scanning) break;
        const seen = new Set(res.map(r => r.label));
        for (const k of [...streak.keys()]) if (!seen.has(k)) streak.delete(k);
        seen.forEach(k => streak.set(k, (streak.get(k) || 0) + 1));
        for (const r of res) if (r.label !== "unknown") sureN.set(r.label, r.confident ? (sureN.get(r.label) || 0) + 1 : 0);
        for (const k of [...sureN.keys()]) if (!seen.has(k)) sureN.delete(k);
        const present = res.filter(r => r.label !== "unknown").map(r => r.label);
        const confirmed = present.filter(k => streak.get(k) >= 2);
        if (!res.length) setStatus("กำลังสแกน... ไม่พบใบหน้า");
        else if (confirmed.length >= 2) { stopScan(false); showChips(confirmed); break; }
        else if (confirmed.length === 1 && present.length === 1 && (sureN.get(confirmed[0]) || 0) >= 2) { stopScan(); selectCustomer(confirmed[0], "สแกนใบหน้า"); break; }
        // จับคู่ได้แต่ไม่มั่นใจ: ไม่เลือกเอง ให้แคชเชียร์แตะชื่อยืนยัน (หรือค้นหาด้วยชื่อ/เบอร์)
        else if (confirmed.length === 1 && present.length === 1) { stopScan(false); showChips(confirmed, true); break; }
        else if (!present.length && streak.get("unknown") >= 2) { stopScan(); showUnknown(); break; }
        else {
          const n = Math.max(0, ...res.map(r => streak.get(r.label) || 0));
          setStatus(`กำลังยืนยันตัวตน... (${Math.min(2, n)}/2)${present.length > 1 ? ` · พบสมาชิก ${present.length} คน` : ""}`);
        }
      } catch (e) { console.error(e); }
      await sleep(Math.max(0, 300 - (performance.now() - t0)));
    }
  }
  const setStatus = t => { $("#scanStatus").textContent = t; };
  function clearChips() { $("#scanStatus").classList.remove("has-chips"); }
  function showChips(ids, unsure = false) {
    const ms = ids.map(id => members.find(m => m.id === id)).filter(Boolean);
    const el = $("#scanStatus");
    el.classList.add("has-chips");
    el.innerHTML = (unsure
      ? `<span class="chips-head">ไม่แน่ใจ อาจเป็นคุณ${esc(ms.map(m => m.name).join(", "))}</span>`
      : `<span class="chips-head">พบสมาชิก ${ms.length} คน: ${esc(ms.map(m => m.name).join(", "))}</span>`)
      + `<span class="chips">${ms.map(m => `<button type="button" class="chip" data-id="${esc(m.id)}">${esc(m.name)}</button>`).join("")}</span>`
      + `<span class="hint">${unsure ? "ถามชื่อลูกค้าก่อน แล้วแตะยืนยัน (หรือค้นหาด้วยชื่อ)" : "แตะชื่อลูกค้าที่กำลังสั่ง"}</span>`;
  }
  $("#scanStatus").addEventListener("click", e => { const b = e.target.closest("button.chip[data-id]"); if (b) { clearChips(); selectCustomer(b.dataset.id, "สแกนใบหน้า"); } });
  function stopScan(clear = true) { scanning = false; $("#scanToggle").textContent = "เริ่มสแกนลูกค้า"; if (clear) overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height); }
  $("#scanToggle").onclick = () => {
    if (SC) return ($("#scanStatus").textContent = "กำลังตรวจความแม่นยำ — กด \"จบและคำนวณ\" ก่อนสแกนลูกค้า");
    if (!ready) return ($("#scanStatus").textContent = "กล้องยังไม่พร้อม — ใช้ค้นหาด้วยชื่อแทนได้");
    if (scanning) return stopScan();
    if (!members.some(m => m.descriptor)) $("#scanStatus").textContent = "ยังไม่มีสมาชิกที่ลงทะเบียนใบหน้า";
    scanning = true; $("#scanToggle").textContent = "หยุดสแกน"; scanLoop();
  };
  $("#nextCustomer").onclick = () => { current = null; renderCustomer(); if (ready) { scanning = false; $("#scanToggle").click(); } };

  // ---------- การ์ดลูกค้า ----------
  function selectCustomer(id, via) {
    current = members.find(m => m.id === id) || null;
    if (current && via === "สแกนใบหน้า" && Date.now() - (current.lastSeen || 0) > 3600000) { current.lastSeen = Date.now(); saveMembers({ faces: false }); }
    clearChips(); $("#scanStatus").textContent = current ? `พบสมาชิกจาก${via}` : "";
    $("#search").value = ""; $("#searchResults").innerHTML = "";
    renderCustomer();
  }
  function showUnknown() {
    current = null; renderCustomer();
    $("#customerCard").innerHTML = `<div class="new-cust"><h2>ลูกค้าใหม่ 👋</h2><p class="hint">ไม่พบข้อมูลใบหน้านี้ในระบบสมาชิก</p>
      <div class="quick"><button class="btn primary" id="goEnroll" type="button">สมัครสมาชิก (สมัครใจ)</button><button class="btn ghost" id="skipEnroll" type="button">สั่งแบบไม่เป็นสมาชิก</button></div></div>`;
    $("#goEnroll").onclick = () => showTab("enroll");
    $("#skipEnroll").onclick = () => { $("#customerCard").innerHTML = `<p class="empty">ลูกค้าทั่วไป (ไม่บันทึกประวัติ)</p>`; };
  }
  function renderCustomer() {
    const card = $("#customerCard");
    $("#orderFor").textContent = current ? `— ${current.name}` : "— ลูกค้าทั่วไป";
    if (!current) { card.innerHTML = `<p class="empty">ยังไม่มีลูกค้า เริ่มสแกนหรือค้นหาด้วยชื่อ</p>`; return; }
    const list = ordersOf(orders, current.id), last = list.at(-1), favs = favorites(list), pref = preferences(list);
    const seg = segment(list), reco = recommend(list, menu, orders);
    card.innerHTML = `
      <div class="greet"><div><h2>สวัสดีคุณ${esc(current.name)}</h2>
        <div class="sub-line">มาแล้ว ${visitCount(list)} วัน · ${list.length ? "มาล่าสุด " + daysAgo(last.time) : "ยังไม่เคยสั่ง"}</div></div>
        <span class="badge ${seg === "regular" ? "regular" : seg === "lapsed" ? "lapsed" : "new"}">${SEG_TH[seg]}</span></div>
      ${last ? `<div class="last-order">ออเดอร์ล่าสุด: <b>${esc(last.name)}</b> (${esc(optText(last))}) × ${last.qty}<br><small class="hint">${fmtTime(last.time)}</small></div>` : ""}
      ${favs.length ? `<h3>เมนูที่สั่งบ่อย</h3><div class="bars" id="favBars"></div>` : ""}
      ${pref ? `<p class="hint">ชอบ: ขนาด ${pref.size} · หวาน ${pref.sweet}% · ${pref.temp}</p>` : ""}
      ${reco ? `<div class="reco">แนะนำ: <b>${esc(reco.item.name)}</b> — ${esc(reco.reason)}</div>` : ""}
      <div class="quick">
        ${last ? `<button class="btn primary" id="reorder" type="button">สั่งเหมือนเดิม (${esc(last.name)})</button>` : ""}
        ${reco ? `<button class="btn ghost" id="tryReco" type="button">ลองเมนูแนะนำ</button>` : ""}
      </div>`;
    if (favs.length) {
      const max = favs[0].count;
      $("#favBars").innerHTML = favs.map(f => `<div class="row"><span>${esc(f.name)}</span><div class="track"><div class="fill" style="width:${(f.count / max * 100).toFixed(0)}%"></div></div><span class="num">${f.count} แก้ว</span></div>`).join("");
    }
    if (last) $("#reorder").onclick = () => fillOrder({ drinkId: last.drinkId, size: last.size, sweet: last.sweet, temp: last.temp, qty: last.qty });
    if (reco) $("#tryReco").onclick = () => fillOrder({ drinkId: reco.item.id, ...(pref || {}), qty: 1 });
    if (pref) fillOrder({ ...pref, drinkId: favs[0]?.drinkId, qty: 1 }, false);
  }

  // ---------- ค้นหา ----------
  $("#search").addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    const res = q ? members.filter(m => m.name.toLowerCase().includes(q) || (m.phone || "").includes(q)).slice(0, 8) : [];
    $("#searchResults").innerHTML = res.map(m => `<li><button type="button" data-id="${m.id}">${esc(m.name)} <small>${esc(m.phone || "")}</small></button></li>`).join("") || (q ? `<li class="hint">ไม่พบ</li>` : "");
  });
  $("#searchResults").addEventListener("click", e => { const b = e.target.closest("button[data-id]"); if (b) selectCustomer(b.dataset.id, "การค้นหา"); });

  // ---------- ฟอร์มออเดอร์ ----------
  const orderState = { size: "M", sweet: 50, temp: "เย็น" };
  function renderSeg() {
    const vals = { size: SIZES, sweet: SWEETS, temp: TEMPS };
    document.querySelectorAll(".seg").forEach(el => {
      const n = el.dataset.name;
      el.innerHTML = vals[n].map(v => `<button type="button" data-v="${v}" class="${String(orderState[n]) === String(v) ? "on" : ""}">${n === "sweet" ? v + "%" : v}</button>`).join("");
    });
    updateTotal();
  }
  document.querySelectorAll(".seg").forEach(el => el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const n = el.dataset.name; orderState[n] = n === "sweet" ? +b.dataset.v : b.dataset.v; renderSeg();
  }));
  function renderDrinkSel() {
    const sel = $("#drinkSel"), prev = sel.value;
    const cats = [...new Set(menu.filter(d => !d.hidden).map(d => d.cat))];
    sel.innerHTML = cats.map(c => `<optgroup label="${esc(c)}">${menu.filter(d => d.cat === c && !d.hidden).map(d => `<option value="${d.id}">${esc(d.name)} — ${baht(d.price)}</option>`).join("")}</optgroup>`).join("");
    if (prev && menu.some(d => d.id === prev && !d.hidden)) sel.value = prev;
    $("#catList").innerHTML = cats.map(c => `<option value="${esc(c)}">`).join("");
    updateTotal();
  }
  function updateTotal() {
    const d = menu.find(x => x.id === $("#drinkSel").value), q = Math.max(1, +$("#orderForm").qty.value || 1);
    $("#orderTotal").textContent = d ? baht(unitPrice(d.price, orderState.size) * q) : "฿0";
  }
  $("#drinkSel").onchange = updateTotal;
  $("#orderForm").qty.oninput = updateTotal;
  function fillOrder(o, flash = true) {
    if (o.drinkId && menu.some(d => d.id === o.drinkId && !d.hidden)) $("#drinkSel").value = o.drinkId;
    ["size", "sweet", "temp"].forEach(k => { if (o[k] != null) orderState[k] = o[k]; });
    if (o.qty) $("#orderForm").qty.value = o.qty;
    renderSeg();
    if (flash) { $("#orderMsg").textContent = "เติมออเดอร์ให้แล้ว ตรวจแล้วกดบันทึก"; $("#orderMsg").className = "form-msg ok"; }
  }
  $("#orderForm").addEventListener("submit", e => {
    e.preventDefault();
    const d = menu.find(x => x.id === $("#drinkSel").value), qty = Math.min(20, Math.max(1, Math.floor(+e.target.qty.value || 1)));
    const msg = $("#orderMsg");
    if (!d) { msg.textContent = "กรุณาเลือกเครื่องดื่ม"; msg.className = "form-msg err"; return; }
    const price = unitPrice(d.price, orderState.size);
    if (current) {
      orders.push({ id: crypto.randomUUID(), ticket: crypto.randomUUID(), mid: current.id, drinkId: d.id, name: d.name, cat: d.cat, size: orderState.size, sweet: orderState.sweet, temp: orderState.temp, qty, price, time: Date.now() });
      store(K.orders, orders);
      msg.textContent = `บันทึก ${d.name} × ${qty} ให้คุณ${current.name} แล้ว (${baht(price * qty)})`;
      renderCustomer();
    } else msg.textContent = `ขาย ${d.name} × ${qty} (${baht(price * qty)}) — ลูกค้าทั่วไป ไม่บันทึกประวัติ`;
    msg.className = "form-msg ok";
  });

  // ---------- สมัครสมาชิก ----------
  // 3 ท่า (ตรง / หันซ้าย / หันขวาเล็กน้อย) × 2 เฟรมที่ผ่านเกณฑ์คุณภาพ แล้วเฉลี่ย (ใกล้เคียงการลงทะเบียน 3 ภาพที่วัดบน LFW)
  const POSES = ["มองตรงที่กล้อง", "หันหน้าไปทางซ้ายเล็กน้อย", "หันหน้าไปทางขวาเล็กน้อย"];
  async function capture(samples = 3, onPose = () => {}) {
    const ds = [];
    for (let i = 0; i < samples; i++) {
      onPose(POSES[i % POSES.length], i + 1, samples);
      if (i) await sleep(900);
      const got = [];
      for (let tries = 0; got.length < 2 && tries < 8; tries++) {
        const r = await detectFaces(Infinity); // สมัครสมาชิกได้ทีละหนึ่งใบหน้าเท่านั้น
        if (r.length !== 1) throw new Error(r.length ? "พบหลายใบหน้า กรุณาให้เหลือคนเดียวในกล้อง" : "ไม่พบใบหน้า กรุณามองกล้องตรง ๆ");
        if (!r[0].descriptor) throw new Error("อ่านลักษณะใบหน้าไม่สำเร็จ กรุณาลองใหม่");
        if (!r[0].q || LQTrack.qualityOk(r[0].q)) got.push(r[0].descriptor);
        await sleep(200);
      }
      if (!got.length) throw new Error("ภาพใบหน้าไม่ชัดหรือหันข้างมากเกินไป กรุณาเข้าใกล้กล้องและลองใหม่");
      ds.push(...got);
    }
    return Array.from(ds[0], (_, k) => +(ds.reduce((s, d) => s + d[k], 0) / ds.length).toFixed(5));
  }
  // สมัครด้วยใบหน้าได้เฉพาะเมื่อเข้ารหัสได้ — ไม่เช่นนั้นปิดปุ่มและบอกเหตุผล
  { const why = LQVault.enrollBlockReason(); if (why) { const m = $("#enrollMsg"); m.textContent = why; m.className = "form-msg err"; $("#enrollForm").querySelector("button[type=submit]").disabled = true; } }
  $("#enrollForm").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target, m = $("#enrollMsg"), btn = f.querySelector("button");
    const set = (t, c) => { m.textContent = t; m.className = "form-msg " + c; };
    const name = f.name.value.trim(), phone = f.phone.value.replace(/[^\d+]/g, "");
    if (!ready) return set("กล้องยังไม่พร้อม", "err");
    if (!name) return set("กรุณากรอกชื่อ", "err");
    if (!f.consent.checked) return set("ต้องได้รับความยินยอมจากลูกค้าก่อน", "err");
    if (faceState === "locked") return set(LQVault.STATE_TH.locked, "err");
    { const why = LQVault.enrollBlockReason(); if (why) return set(why, "err"); } // เข้ารหัสไม่ได้ = ไม่เก็บใบหน้า
    if (phone && members.some(x => x.phone === phone)) return set("เบอร์นี้เป็นสมาชิกอยู่แล้ว", "err");
    btn.disabled = true; set("กำลังสแกน กรุณามองกล้องนิ่ง ๆ...", "");
    try {
      const descriptor = await capture(3, (pose, i, n) => set(`กำลังสแกน ${i}/${n}: ${pose}...`, ""));
      if (matcher) {
        const best = LQTrack.matchFace(new Float32Array(descriptor), matcher, { maxDist: MATCH_DISTANCE });
        if (best.label !== "unknown") throw new Error(`ใบหน้านี้เป็นสมาชิกอยู่แล้ว (คุณ${members.find(x => x.id === best.label)?.name})`);
      }
      const now = Date.now();
      const mem = { id: crypto.randomUUID(), name, phone, descriptor, created: now, consentAt: now, lastSeen: now };
      members.push(mem);
      if (!(await saveMembers())) { members.pop(); throw new Error("บันทึกข้อมูลใบหน้าไม่สำเร็จ"); }
      rebuildMatcher();
      f.reset(); set(`สมัครสมาชิกคุณ${name} สำเร็จ`, "ok");
      selectCustomer(mem.id, "การสมัครสมาชิก"); renderAnalytics();
      setTimeout(() => showTab("pos"), 900);
    } catch (err) { set(err.message, "err"); }
    btn.disabled = false;
  });

  // ---------- วิเคราะห์ ----------
  function bars(el, rows, fmt) {
    const max = Math.max(1, ...rows.map(r => r[1]));
    el.className = "bars";
    el.innerHTML = rows.length ? rows.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${(v / max * 100).toFixed(1)}%"></div></div><span class="num">${fmt(v)}</span></div>`).join("") : `<p class="empty">ยังไม่มีข้อมูล</p>`;
  }
  // round 11: ป้ายแจ้งการลบอัตโนมัติ (วันใช้ล่าสุด = มาร้าน/สั่งล่าสุด เหมือน applyRetention)
  function renderExpiry() {
    const el = $("#expiryBanner"); if (!el) return;
    const last = new Map();
    orders.forEach(o => { if (o.time > (last.get(o.mid) || 0)) last.set(o.mid, o.time); });
    const withFace = members.filter(m => Array.isArray(m.descriptor)).map(m => ({ ...m, lastSeen: Math.max(m.lastSeen || 0, last.get(m.id) || 0) || undefined }));
    if (!withFace.length) { el.hidden = true; el.textContent = ""; return; }
    const soon = LQVault.expiringSoon(withFace, priv.retentionDays, 30);
    el.replaceChildren(); const sp = t => { const x = document.createElement("span"); x.textContent = t; el.append(x); };
    const F = (t, o) => t.replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));
    sp(F("ข้อมูลใบหน้าของสมาชิก {a} คนในเครื่องนี้จะถูกลบอัตโนมัติเมื่อไม่ได้มาเกิน {b} วัน", { a: withFace.length, b: priv.retentionDays }));
    if (soon.length) { el.append(" · "); sp(F("{a} คนจะถูกลบภายใน 30 วัน (เร็วสุดอีก {b} วัน)", { a: soon.length, b: soon[0].daysLeft })); }
    el.hidden = false;
  }
  function renderAnalytics() {
    renderExpiry();
    const s = storeStats(members, orders);
    $("#aTiles").innerHTML = [
      ["สมาชิก", members.length, `${s.segs.regular} ประจำ`],
      ["ยอดขายสมาชิก", baht(s.revenue), `${s.cups} แก้ว`],
      ["ยอดต่อบิล", baht(s.avgTicket), `${s.tickets} บิล`],
      ["อัตรากลับมาซื้อซ้ำ", Math.round(s.repeat * 100) + "%", "มา 2 วันขึ้นไป"]
    ].map(([k, v, sub]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`).join("");
    const pop = popularity(orders);
    bars($("#aTop"), [...pop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => [menu.find(d => d.id === id)?.name || orders.find(o => o.drinkId === id)?.name || id, n]), v => v + " แก้ว");
    bars($("#aSeg"), [["ลูกค้าใหม่", s.segs.new], ["ลูกค้าประจำ", s.segs.regular], ["หายไปนาน", s.segs.lapsed]], v => v + " คน");
    renderMemberTable();
  }
  function renderMemberTable() {
    const q = $("#memberFilter").value.trim().toLowerCase();
    const rows = members.filter(m => !q || m.name.toLowerCase().includes(q) || (m.phone || "").includes(q)).map(m => {
      const l = ordersOf(orders, m.id);
      return { m, l, fav: favorites(l, 1)[0], last: l.at(-1), seg: segment(l), spend: l.reduce((s, o) => s + o.price * o.qty, 0) };
    }).sort((a, b) => (b.last?.time || 0) - (a.last?.time || 0));
    $("#memberTable").innerHTML = `<thead><tr><th>ชื่อ</th><th>กลุ่ม</th><th class="n">จำนวนวันที่มา</th><th>เมนูโปรด</th><th>มาล่าสุด</th><th class="n">ยอดซื้อ</th></tr></thead><tbody>` +
      (rows.map(r => `<tr class="click" data-id="${r.m.id}"><td>${esc(r.m.name)}${r.m.descriptor ? "" : " <small class='hint'>(ไม่มีใบหน้า)</small>"}</td><td>${SEG_TH[r.seg]}</td><td class="n">${visitCount(r.l)}</td><td>${esc(r.fav?.name || "–")}</td><td>${r.last ? daysAgo(r.last.time) : "–"}</td><td class="n">${baht(r.spend)}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">ยังไม่มีสมาชิก</td></tr>`) + "</tbody>";
  }
  $("#memberFilter").addEventListener("input", renderMemberTable);
  $("#memberTable").addEventListener("click", e => { const tr = e.target.closest("tr[data-id]"); if (tr) renderProfile(tr.dataset.id); });

  function renderProfile(id) {
    const m = members.find(x => x.id === id), el = $("#profile");
    if (!m) { el.hidden = true; return; }
    const l = ordersOf(orders, id), pref = preferences(l), reco = recommend(l, menu, orders);
    el.hidden = false;
    el.innerHTML = `
      <div class="greet"><div><h2>คุณ${esc(m.name)}</h2><div class="sub-line">${esc(m.phone || "ไม่มีเบอร์")} · สมัคร ${fmtTime(m.created)}</div></div><span class="badge">${SEG_TH[segment(l)]}</span></div>
      <div class="tiles" style="margin-top:14px">
        <div class="tile"><div class="k">จำนวนวันที่มา</div><div class="v">${visitCount(l)}</div></div>
        <div class="tile"><div class="k">แก้วทั้งหมด</div><div class="v">${l.reduce((s, o) => s + o.qty, 0)}</div></div>
        <div class="tile"><div class="k">ยอดซื้อรวม</div><div class="v">${baht(l.reduce((s, o) => s + o.price * o.qty, 0))}</div></div>
        <div class="tile"><div class="k">ตัวเลือกที่ชอบ</div><div class="v" style="font-size:1rem">${pref ? `${pref.size} · ${pref.sweet}% · ${esc(pref.temp)}` : "–"}</div></div>
      </div>
      ${reco ? `<div class="reco">แนะนำครั้งหน้า: <b>${esc(reco.item.name)}</b> — ${esc(reco.reason)}</div>` : ""}
      <h3>ประวัติการสั่ง</h3>
      <div class="table-wrap"><table><thead><tr><th>เวลา</th><th>เมนู</th><th>ตัวเลือก</th><th class="n">จำนวน</th><th class="n">ยอด</th></tr></thead><tbody>
        ${l.slice().reverse().map(o => `<tr><td>${fmtTime(o.time)}</td><td>${esc(o.name)}</td><td>${esc(optText(o))}</td><td class="n">${o.qty}</td><td class="n">${baht(o.price * o.qty)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">ยังไม่มีออเดอร์</td></tr>`}
      </tbody></table></div>
      <div class="profile-actions">
        <button class="btn ghost" id="pSelect" type="button">เลือกลูกค้านี้ที่หน้าร้าน</button>
        ${m.descriptor ? `<button class="btn ghost danger" id="pDelFace" type="button">ลบข้อมูลใบหน้า (คงประวัติ)</button>` : ""}
        <button class="btn ghost danger" id="pDelAll" type="button">ลบสมาชิกและประวัติทั้งหมด</button>
      </div>`;
    $("#pSelect").onclick = () => { selectCustomer(id, "รายชื่อสมาชิก"); showTab("pos"); };
    if (m.descriptor) $("#pDelFace").onclick = () => {
      if (!confirm(`ลบข้อมูลใบหน้าของคุณ${m.name}? ระบบจะจำใบหน้าไม่ได้อีก แต่ยังค้นหาด้วยชื่อได้`)) return;
      delete m.descriptor; m.faceDeletedAt = Date.now(); saveMembers(); rebuildMatcher(); renderAnalytics(); renderProfile(id);
    };
    $("#pDelAll").onclick = () => {
      if (!confirm(`ลบคุณ${m.name} พร้อมข้อมูลใบหน้าและประวัติการสั่งทั้งหมด? ย้อนกลับไม่ได้`)) return;
      members = members.filter(x => x.id !== id); orders = orders.filter(o => o.mid !== id);
      if (current?.id === id) { current = null; renderCustomer(); }
      saveAll(); rebuildMatcher(); el.hidden = true; renderAnalytics();
    };
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const cell = v => { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
  $("#exportCsv").onclick = () => {
    if (!orders.length) return alert("ยังไม่มีออเดอร์");
    const head = ["เวลา", "สมาชิก", "เบอร์", "เมนู", "หมวด", "ขนาด", "ความหวาน", "แบบ", "จำนวน", "ราคาต่อแก้ว", "ยอด"];
    const rows = orders.map(o => { const m = members.find(x => x.id === o.mid); return [new Date(o.time).toISOString(), m?.name, m?.phone, o.name, o.cat, o.size, o.sweet, o.temp, o.qty, o.price, o.price * o.qty]; });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + [head, ...rows].map(r => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `customer-orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ---------- จัดการเมนู ----------
  function renderMenu() {
    $("#menuTable").innerHTML = `<thead><tr><th>เมนู</th><th>หมวด</th><th class="n">ราคา (S)</th><th class="n">ขายแล้ว</th><th></th></tr></thead><tbody>` +
      menu.map(d => `<tr${d.hidden ? ' style="opacity:.5"' : ""}><td>${esc(d.name)}</td><td>${esc(d.cat)}</td><td class="n">${baht(d.price)}</td><td class="n">${popularity(orders).get(d.id) || 0}</td>
        <td><button class="link" type="button" data-toggle="${d.id}">${d.hidden ? "แสดง" : "ซ่อน"}</button></td></tr>`).join("") + "</tbody>";
  }
  $("#menuTable").addEventListener("click", e => {
    const id = e.target.dataset.toggle; if (!id) return;
    const d = menu.find(x => x.id === id); d.hidden = !d.hidden; // ซ่อนแทนลบ เพื่อให้ประวัติเดิมยังอ้างอิงได้
    store(K.menu, menu); renderMenu(); renderDrinkSel();
  });
  $("#menuForm").addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target, name = f.name.value.trim(), cat = f.cat.value.trim(), price = Math.round(+f.price.value);
    const msg = $("#menuMsg");
    if (!name || !cat || !(price >= 0) || f.price.value === "") { msg.textContent = "กรอกชื่อ หมวด และราคาให้ครบ"; msg.className = "form-msg err"; return; }
    if (menu.some(d => d.name === name)) { msg.textContent = "มีเมนูนี้แล้ว"; msg.className = "form-msg err"; return; }
    menu.push({ id: "d" + Date.now().toString(36), name, cat, price });
    store(K.menu, menu); f.reset(); renderMenu(); renderDrinkSel();
    msg.textContent = `เพิ่ม ${name} แล้ว`; msg.className = "form-msg ok";
  });

  // ---------- แท็บ ----------
  function showTab(name) {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.t === name));
    ["pos", "enroll", "analytics", "menu"].forEach(n => $("#pane-" + n).hidden = n !== name);
    if (name === "enroll") $("#enrollCamSlot").append(camBox, camSwitch); else { $("#posCamActions").before(camBox); $("#posCamActions").append(camSwitch); }
    if (name !== "pos") stopScan();
    if (name === "analytics") renderAnalytics();
  }
  document.querySelectorAll(".tab").forEach(t => t.onclick = () => showTab(t.dataset.t));

  // ---------- ความเป็นส่วนตัวของข้อมูลใบหน้า ----------
  {
    const sel = $("#retention");
    sel.value = String(priv.retentionDays);
    if (sel.value !== String(priv.retentionDays)) { priv.retentionDays = 365; sel.value = "365"; }
    sel.addEventListener("change", () => {
      priv.retentionDays = +sel.value || 365; store(PRIV_KEY, priv);
      const n = applyRetention();
      if (n) { rebuildMatcher(); renderAnalytics(); }
      renderExpiry();
      $("#privMsg").textContent = n ? `ลบข้อมูลใบหน้าของสมาชิกที่ไม่ได้มาเกิน ${priv.retentionDays} วันแล้ว ${n} คน` : `ตั้งค่าแล้ว: ${priv.retentionDays} วัน`;
    });
  }
  // ลบข้อมูลใบหน้าทั้งหมด: ค่าใบหน้าที่เข้ารหัส + กุญแจใน IndexedDB ; สมาชิกและประวัติการสั่งยังอยู่ (ค้นหาด้วยชื่อได้)
  $("#wipeFaces").onclick = async () => {
    if (!confirm("ลบข้อมูลใบหน้าของสมาชิกทุกคน? ระบบจะจำใบหน้าไม่ได้อีก แต่สมาชิกและประวัติการสั่งยังอยู่ ย้อนกลับไม่ได้")) return;
    stopScan();
    const now = Date.now();
    members.forEach(m => { if (m.descriptor) m.faceDeletedAt = now; delete m.descriptor; });
    await saveQ(async () => { await LQVault.wipe([FACE_KEY]); store(K.members, members); });
    showFaceState(LQVault.supported() ? "enc" : LQVault.enrollBlockReason() ? "insecure" : "plain");
    rebuildMatcher(); renderAnalytics();
    $("#privMsg").textContent = "ลบข้อมูลใบหน้าทั้งหมดแล้ว";
  };
  // round 11: ลบข้อมูลชีวมิติทั้งหมดในเครื่องนี้ (ทุกหน้า: จดจำลูกค้า + เช็คชื่อ) และกุญแจทั้งหมดใน IndexedDB — สำหรับผู้ดูแล
  if ($("#wipeAllBio")) $("#wipeAllBio").onclick = async () => {
    if (!confirm("ลบข้อมูลชีวมิติ (ค่าใบหน้า) ทั้งหมดในเบราว์เซอร์เครื่องนี้ ทั้งระบบจดจำลูกค้าและเช็คชื่อ พร้อมกุญแจเข้ารหัส? สมาชิกและประวัติการสั่งยังอยู่ (ค้นหาด้วยชื่อได้) บันทึกการเข้าเรียนยังอยู่ ย้อนกลับไม่ได้")) return;
    stopScan();
    const now = Date.now();
    members.forEach(m => { if (m.descriptor) m.faceDeletedAt = now; delete m.descriptor; });
    await saveQ(async () => { await LQVault.wipeAll(); store(K.members, members); });
    showFaceState(LQVault.supported() ? "enc" : LQVault.enrollBlockReason() ? "insecure" : "plain");
    rebuildMatcher(); renderAnalytics();
    $("#privMsg").textContent = "ลบข้อมูลชีวมิติทั้งหมดในเครื่องนี้แล้ว";
  };

  // ---------- สุขภาพภาพ + ตรวจความแม่นยำหน้างาน (lensiq-sitecheck.js) ----------
  // สุขภาพภาพ: ความสว่าง ย้อนแสง ความคม ขนาดใบหน้า และภาพค้าง ทุก ~1 วินาทีระหว่างสแกน (ตัวเลขเท่านั้น ไม่เก็บภาพ)
  const SITE = /** @type {any} */ (window).LQSite || null;
  const HL = SITE ? { mon: SITE.createHealth({ kind: "customers" }), at: 0, fw: [], cv: document.createElement("canvas"), state: null } : null;
  function healthStep(res) {
    if (!HL) return;
    const W = video.videoWidth || 1;
    if (res && res.length) HL.fw.push(res[0].box.width / W);
    const t = performance.now(); if (t - HL.at < 1000) return; HL.at = t;
    let st = null; try { st = SITE.sampleElement(video, HL.cv); } catch { /* ignore */ }
    HL.state = HL.mon.push(st, { faceW: HL.fw.length ? SITE.median(HL.fw) : null, stalled: SITE.stallStep(video, st, t) }); HL.fw = [];
    if (SC) HL.state.codes.forEach(k => SC.health.add(k));
    const pill = $("#camHealth"), msg = $("#camHealthMsg");
    if (!pill) return;
    SITE.renderHealth(pill, HL.state); pill.hidden = false;
    SITE.renderHealthLine(msg, HL.state);
  }
  // ตรวจความแม่นยำ: ทีละรอบ — ผู้ทดสอบเลือกว่าใครยืนหน้ากล้อง (สมาชิก หรือ คนที่ไม่ใช่สมาชิก + หมายเลข) ระบบใช้กฎเดียวกับการสแกนหน้าร้าน
  // (2 เฟรมติดกัน + 2 เฟรมมั่นใจ = เลือกเอง · ไม่มั่นใจ = เสนอชื่อให้แตะ) แต่ไม่เลือกลูกค้า ไม่แก้ lastSeen และไม่บันทึกออเดอร์
  // ผลที่ส่งออกใช้รหัสแทนชื่อ (m1.. / s1..) ไม่มีชื่อ เบอร์ ภาพ หรือค่าใบหน้า
  let SC = null, SC_LAST = null;
  const scHist = SITE ? SITE.history("cx-sitecheck") : null;
  const scPanel = SITE && $("#scPanel") ? SITE.mountPanel($("#scPanel"), {
    title: "ตรวจความแม่นยำหน้างาน",
    intro: "ทดสอบการจำใบหน้าที่เคาน์เตอร์จริงของร้าน: ให้สมาชิกที่ลงทะเบียนแล้วและคนที่ไม่ใช่สมาชิกมายืนหน้ากล้องทีละคน ระบบใช้กฎเดียวกับการสแกนลูกค้า แต่ไม่เลือกลูกค้าและไม่บันทึกออเดอร์ระหว่างทดสอบ",
    steps: [
      "ลงทะเบียนสมาชิกทดสอบที่เคาน์เตอร์จริงก่อน (แนะนำอย่างน้อย 5 คน ระบบจึงปรับเกณฑ์ตามกลุ่มได้) และขอความยินยอมจากทุกคน รวมถึงคนที่มาช่วยทดสอบในฐานะคนที่ไม่ใช่สมาชิก",
      "กด \"เริ่มตรวจ\" แล้วในแต่ละรอบ เลือกว่าใครยืนหน้ากล้อง (คนที่ไม่ใช่สมาชิก: ใส่หมายเลขประจำคน คนเดิมใช้เลขเดิม) กด \"เริ่มรอบนี้\" ให้คนนั้นเดินมาที่เคาน์เตอร์ตามปกติ ระบบสรุปผลเองภายใน 6 วินาที",
      "ทดสอบสมาชิกอย่างน้อย 20 รอบ (หลายคน หลายช่วงเวลา) และคนที่ไม่ใช่สมาชิกอย่างน้อย 20 รอบจากหลายคน — การเลือกคนที่ไม่ใช่สมาชิกเป็นสมาชิกคือความผิดพลาดที่สำคัญที่สุด",
      "กด \"จบและคำนวณ\" แล้วเก็บไฟล์ผลตรวจไว้ ทำซ้ำเมื่อย้ายกล้อง เปลี่ยนแสง หรือมีสมาชิกเพิ่มมาก"
    ],
    body: `<div class="sc-trial" hidden><div class="sc-row"><label><span>ใครยืนหน้ากล้องรอบนี้</span><select class="sc-who" data-i18n-skip></select></label><label class="sc-sidbox" hidden><span>หมายเลขคนที่ไม่ใช่สมาชิก (คนเดิม = เลขเดิม)</span><input class="sc-sid" type="number" min="1" max="999" value="1"></label><button class="btn primary sc-go" type="button">เริ่มรอบนี้</button><button class="btn ghost small sc-undo" type="button">ลบรอบล่าสุด</button></div><p class="sc-now" role="status"></p><ul class="sc-list"></ul></div>`
  }) : null;
  const OUT_TH = { auto: "เลือกลูกค้าเอง", ask: "เสนอชื่อให้แตะยืนยัน", none: "ไม่รู้จัก (ลูกค้าใหม่)", noface: "ไม่พบใบหน้า" };
  const faceMembers = () => members.filter(m => m.descriptor);
  function scWho() {
    const sel = scPanel.q(".sc-who"), keep = sel.value;
    sel.innerHTML = faceMembers().map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join("") + `<option value="stranger">คนที่ไม่ใช่สมาชิก</option>`;
    if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
    scPanel.q(".sc-sidbox").hidden = sel.value !== "stranger";
  }
  function scRender() {
    const T = SC ? SC.trials : [], nm = id => id === "stranger" ? "คนที่ไม่ใช่สมาชิก" : (members.find(m => m.id === id) || { name: "?" }).name;
    scPanel.q(".sc-list").innerHTML = T.slice().reverse().map((t, i) => {
      const ok = t.truth === "stranger" ? t.outcome !== "auto" : t.label === t.truth && t.outcome !== "none";
      return SITE.fmt("<li data-truth=\"{a}\"><span>รอบ {b}: <b data-i18n-skip>{c}</b></span><small>{d}{e}</small></li>", { a: ok ? "good" : "bad", b: T.length - i, c: esc(nm(t.truth) + (t.truth === "stranger" ? " #" + t.sid : "")), d: esc(OUT_TH[t.outcome]), e: t.label ? `: <span data-i18n-skip>${esc(nm(t.label))}</span>` : "" });
    }).join("");
    const mem = T.filter(t => t.truth !== "stranger").length;
    scPanel.live.textContent = SC ? SITE.fmt("ทดสอบแล้ว {a} รอบ: สมาชิก {b} · คนที่ไม่ใช่สมาชิก {c}", { a: T.length, b: mem, c: T.length - mem }) : "";
  }
  async function scLoop() {
    while (SC) {
      const t0 = performance.now();
      try {
        if (video.readyState >= 2 && SC.cur) {
          const res = await detectAll();
          healthStep(res);
          const cur = SC && SC.cur;
          if (cur) {
            const f = res[0];
            const obs = { face: !!f, label: f && f.label !== "unknown" ? f.label : null, confident: !!(f && f.confident) };
            const r = cur.trial.step(obs, performance.now());
            scPanel.q(".sc-now").textContent = r ? SITE.fmt("ผล: {a}", { a: OUT_TH[r.outcome] }) : obs.face ? "กำลังดูใบหน้า..." : "รอให้ผู้ทดสอบมายืนหน้ากล้อง...";
            if (r) { SC.trials.push({ truth: cur.truth, sid: cur.sid, outcome: r.outcome, label: r.label, ms: Math.round(r.ms) }); SC.cur = null; scPanel.q(".sc-go").disabled = false; scRender(); }
          }
        } else if (video.readyState >= 2) healthStep([]);
      } catch (e) { console.error(e); }
      await sleep(Math.max(0, 300 - (performance.now() - t0)));
    }
    overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
  }
  function scStart() {
    if (SC) return;
    if (!ready) return engine("กล้องยังไม่พร้อม", "err");
    if (!faceMembers().length) return engine("ยังไม่มีสมาชิกที่ลงทะเบียนใบหน้า กรุณาสมัครสมาชิกก่อน", "warn");
    stopScan(); clearChips();
    SC = { trials: [], cur: null, startedAt: Date.now(), health: new Set(), n: faceMembers().length };
    scWho(); scPanel.q(".sc-trial").hidden = false; scPanel.start.disabled = true; scPanel.stop.disabled = false; scPanel.exp.hidden = true;
    scPanel.state.textContent = "กำลังตรวจ"; scPanel.state.dataset.s = "live"; SITE.renderReport(scPanel.report, null);
    scRender(); scLoop();
  }
  function scFinish() {
    if (!SC) return;
    const run = SC; SC = null;
    const rep = SITE.attendanceReport(run.trials.map(t => t.truth === "stranger" ? t : { truth: t.truth, outcome: t.outcome, label: t.label, ms: t.ms }), { kind: "customers" });
    rep.recs.push(...[...run.health].map(c => "สภาพภาพระหว่างตรวจ: " + SITE.HEALTH_TH[c]).filter(Boolean));
    SITE.renderReport(scPanel.report, rep);
    scPanel.q(".sc-trial").hidden = true; scPanel.start.disabled = false; scPanel.stop.disabled = true;
    scPanel.state.textContent = SITE.verdictText(rep); scPanel.state.dataset.s = rep.verdict;
    const ids = new Map(); const anon = id => id == null ? null : id === "stranger" ? "stranger" : (ids.has(id) ? ids.get(id) : ids.set(id, "m" + (ids.size + 1)).get(id));
    const sids = new Map(); const anonS = s => s == null ? null : (sids.has(s) ? sids.get(s) : sids.set(s, "s" + (sids.size + 1)).get(s));
    const cam = camera.label || "เคาน์เตอร์";
    const doc = SITE.exportDoc("customers", {
      startedAt: new Date(run.startedAt).toISOString(), enrolledWithFace: run.n,
      distinctMembers: rep.n.distinctMembers, distinctStrangers: rep.n.distinctStrangers,
      settings: { faceRules: { ...FACE_RULES }, confirmFrames: 2, confidentFrames: 2, windowMs: 6000, calibrated: run.n >= FACE_RULES.minCal },
      conditions: { health: [...run.health] },
      trials: run.trials.map(t => ({ truth: anon(t.truth), stranger: t.truth === "stranger" ? anonS(t.sid) : null, outcome: t.outcome, label: anon(t.label), ms: t.ms })),
      report: { verdict: rep.verdict, provisional: rep.provisional, pilot: rep.pilot ? rep.pilot.verdict : null, need: rep.need, n: rep.n, recognised: rep.recognised, recognisedCluster: rep.recognisedCluster, auto: rep.auto, wrong: rep.wrong, strangerAuto: rep.strangerAuto, strangerAsk: rep.strangerAsk, recs: rep.recs }
    });
    scPanel.exp.hidden = false; scPanel.exp.onclick = () => SITE.download(`lensiq-customers-check-${dayKey(run.startedAt)}.json`, doc);
    scHist.add({ at: run.startedAt, verdict: rep.verdict, provisional: rep.provisional, pilot: rep.pilot ? rep.pilot.verdict : null, need: rep.need, cam, summary: SITE.fmt("สมาชิก {a} รอบ จำได้ {b} · คนที่ไม่ใช่สมาชิก {c} รอบ ถูกเลือกผิด {d}", { a: rep.n.members, b: rep.recognised.p == null ? "—" : (rep.recognised.p * 100).toFixed(0) + "%", c: rep.n.strangers, d: rep.n.strangerAuto }) });
    scHist.render(scPanel.hist);
    SC_LAST = { rep, doc };
  }
  if (scPanel) {
    scPanel.start.addEventListener("click", scStart);
    scPanel.stop.addEventListener("click", scFinish);
    scPanel.q(".sc-who").addEventListener("change", () => { scPanel.q(".sc-sidbox").hidden = scPanel.q(".sc-who").value !== "stranger"; });
    scPanel.q(".sc-go").addEventListener("click", () => {
      if (!SC || SC.cur) return;
      const truth = scPanel.q(".sc-who").value, sid = truth === "stranger" ? Math.max(1, Math.round(+scPanel.q(".sc-sid").value || 1)) : undefined;
      SC.cur = { truth, sid, trial: SITE.createFaceTrial() };
      scPanel.q(".sc-go").disabled = true; scPanel.q(".sc-now").textContent = "รอให้ผู้ทดสอบมายืนหน้ากล้อง...";
    });
    scPanel.q(".sc-undo").addEventListener("click", () => { if (SC && SC.trials.length) { SC.trials.pop(); scRender(); } });
    scHist.render(scPanel.hist);
  }
  window.__CX_SC = { get active() { return SC; }, get last() { return SC_LAST; } };

  renderDrinkSel(); renderSeg(); renderCustomer(); renderMenu(); renderAnalytics(); init();
})();
