/* luckycolor.js — lucky-colour outfit mirror (luckycolor.html).
 * Camera -> clothing region below the face box -> dominant colour -> today's Thai day colours (ทักษาจร) for the chosen goal.
 * Segmentation, best first:
 *   1) MediaPipe Selfie Multiclass (Apache-2.0, vendor/models/selfie-multiclass-256-f16.onnx via PBHQ.multiclassParse):
 *      the "clothes" class, kept only below the face-skin box
 *   2) MediaPipe selfie segmenter (vendor/models/selfie_segmenter.tflite, needs WebGL): person mask minus the head band
 *   3) a fixed guide box over the chest (the user frames the shirt)
 *   ?fakeseg (tests): a scripted mask (window.__LQ_FAKE_SEG(w, h) -> {face:{x0,y0,x1,y1}, region:{x0,y0,x1,y1}} normalised)
 * Privacy: frames live only in memory while the mirror runs; nothing is drawn to storage, uploaded or kept. The only thing
 * stored is "lqlc-prefs" = {v:1, goal, day} (no image, no colour history). No face recognition, no emotion, no body scoring.
 */
/* global LQCam, PBHQ, LQLucky, LQI18N */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const T = (key, thai, vars) => window.LQI18N ? LQI18N.tf(key, thai, vars) : thai.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
  const L = LQLucky, PREFS = "lqlc-prefs";
  const FAKE = /[?&]fakeseg\b/.test(location.search);

  const FAM_TH = { red: "แดง", yellow: "เหลือง", cream: "ครีม", pink: "ชมพู", green: "เขียว", orange: "ส้ม", sky: "ฟ้า", navy: "น้ำเงิน",
    purple: "ม่วง", black: "ดำ", grey: "เทา", white: "ขาว", brown: "น้ำตาล" };
  const BHUMI_TH = { boriwan: "บริวาร", ayu: "อายุ", dech: "เดช", sri: "ศรี", mula: "มูละ", utsaha: "อุตสาหะ", montri: "มนตรี" };
  const MEAN_TH = { boriwan: "ทีมงานและคนรอบข้าง", ayu: "อารมณ์ดี สดชื่น", dech: "การงาน ความน่าเชื่อถือ", sri: "โชคลาภ เงินทอง เสน่ห์",
    mula: "ความมั่นคง หลักฐาน", utsaha: "ความขยันและพลังทำงาน", montri: "ผู้ใหญ่เอ็นดู มีคนสนับสนุน" };
  const GOAL_TH = { work: "การงาน", money: "การเงิน โชคลาภ", love: "ความรัก เสน่ห์", support: "ผู้ใหญ่อุปถัมภ์" };
  const DAY_TH = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
  const fam = k => T("lucky.fam." + k, FAM_TH[k] || k);
  const bhumiN = k => T("lucky.bh." + k, BHUMI_TH[k] || k);
  const meanN = k => T("lucky.mean." + k, MEAN_TH[k] || k);
  const goalN = k => T("lucky.goal." + k, GOAL_TH[k]);
  const dayN = d => T("lucky.day." + d, DAY_TH[d]);
  const famList = ks => ks.map(fam).join(T("lucky.or", " หรือ "));

  // ---------- prefs (per-viewer convenience only) ----------
  const st = { goal: "work", day: "auto", list: [], engine: null, busy: false, timer: 0, lastMask: null };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) || "null");
    if (p && L.GOALS[p.goal]) st.goal = p.goal;
    if (p && (p.day === "auto" || /^[0-6]$/.test(String(p.day)))) st.day = String(p.day);
  } catch { /* storage blocked: defaults */ }
  const save = () => { try { localStorage.setItem(PREFS, JSON.stringify({ v: 1, goal: st.goal, day: st.day })); } catch { /* ignore */ } };
  const today = () => (st.day === "auto" ? L.dayPlanet(new Date()) : +st.day);

  // ---------- rendering ----------
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const dot = (k, big) => { const s = el("span", "lc-dot" + (big ? " big" : "")); s.style.background = L.FAMILIES[k].hex; s.setAttribute("aria-hidden", "true"); return s; };

  function renderRec() {
    const d = today(), r = L.recommend(d, st.goal), box = $("#recBox");
    box.textContent = "";
    box.append(el("p", "lc-rec-h", T("lucky.recH", "สีเสริม{goal}ของ{day}", { goal: goalN(st.goal), day: dayN(d) })));
    for (const { main, part } of [{ main: true, part: r.primary }, { main: false, part: r.secondary }]) {
      const row = el("div", "lc-rec-row");
      const sw = el("span", "lc-dots"); part.families.forEach(k => sw.append(dot(k, main)));
      const txt = el("span", "lc-rec-t");
      txt.append(el("b", null, famList(part.families)));
      txt.append(el("small", null, (main ? T("lucky.recMain", "สีหลัก") : T("lucky.recSecond", "สีเสริม")) + " · " +
        T("lucky.bhumiOf", "ภูมิ{b}: {m}", { b: bhumiN(part.bhumi), m: meanN(part.bhumi) })));
      row.append(sw, txt); box.append(row);
    }
    for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".lc-goal"))) b.setAttribute("aria-pressed", String(b.dataset.goal === st.goal));
    $("#daySel").value = st.day;
  }

  function renderWeek() {
    const t = $("#week"); t.textContent = "";
    const cap = el("caption", "lc-cap", T("lucky.weekCap", "สีมงคลตามวันและเรื่องที่อยากเสริม")); t.append(cap);
    const head = el("tr"); head.append(el("th", null, T("lucky.weekDay", "วัน")));
    for (const g of Object.keys(L.GOALS)) { const th = el("th", null, goalN(g)); th.scope = "col"; head.append(th); }
    const thead = el("thead"); thead.append(head); t.append(thead);
    const tb = el("tbody"), now = today();
    for (let d = 0; d < 7; d++) {
      const tr = el("tr"); if (d === now) tr.className = "is-today";
      const th = el("th", null, dayN(d)); th.scope = "row"; tr.append(th);
      for (const g of Object.keys(L.GOALS)) {
        const p = L.recommend(d, g).primary, td = el("td");
        p.families.forEach(k => td.append(dot(k)));
        td.append(el("span", "lc-wk-t", famList(p.families)));
        tr.append(td);
      }
      tb.append(tr);
    }
    t.append(tb);
  }

  function renderResult(noClothes) {
    const ul = $("#swatches"), box = $("#match");
    ul.textContent = ""; box.textContent = "";
    if (noClothes) { box.append(el("p", "fk-small", T("lucky.noClothes", "ยังไม่เห็นเสื้อผ้าชัดพอ ลองถอยออกจากกล้องให้เห็นตั้งแต่ใบหน้าถึงเอว และเปิดไฟด้านหน้า"))); return; }
    if (!st.list.length) { box.append(el("p", "fk-small", T("lucky.waiting", "ยังไม่ได้ส่อง — เปิดกล้องแล้วผลจะขึ้นที่นี่"))); return; }
    for (const e of st.list.slice(0, 4)) {
      const li = el("li"); li.dataset.family = e.family;
      const sw = el("span", "lc-chip-sw"); sw.style.background = "rgb(" + e.rgb.join(",") + ")"; sw.setAttribute("aria-hidden", "true");
      li.append(sw, el("span", null, fam(e.family) + " " + Math.round(e.share * 100) + "%"));
      ul.append(li);
    }
    const d = today(), r = L.evaluate(st.list, d, st.goal), c = fam(r.family), g = goalN(st.goal), dn = dayN(d);
    box.dataset.level = String(r.level);
    const stars = el("p", "lc-level"); stars.setAttribute("aria-hidden", "true"); stars.textContent = r.level > 0 ? "★".repeat(r.level) + "☆".repeat(3 - r.level) : "✦";
    let msg;
    if (r.level === 3) msg = T("lucky.m3", "เยี่ยมเลย! สี{c}คือสีเสริม{g}ของ{day} (ภูมิ{b})", { c, g, day: dn, b: bhumiN(r.bhumi) });
    else if (r.level === 2) msg = T("lucky.m2", "ดีมาก สี{c}เป็นสีเสริม{g}ลำดับรองของ{day} (ภูมิ{b})", { c, g, day: dn, b: bhumiN(r.bhumi) });
    else if (r.level === 1) msg = T("lucky.m1", "สี{c}ช่วยเสริมเรื่อง{m}ใน{day} (ภูมิ{b})", { c, m: meanN(r.bhumi), day: dn, b: bhumiN(r.bhumi) });
    else msg = T("lucky.m0", "สี{c}เป็นสีพื้นที่ใส่ได้สบาย ๆ เข้ากับทุกวัน", { c });
    box.append(stars, el("p", "lc-msg", msg));
    if (r.accent.length) box.append(el("p", "lc-accent", T("lucky.accent", "อยากเสริม{g}เพิ่ม ลองเติมสี{a}สักชิ้น เช่น ผ้าพันคอ กระเป๋า เข็มขัด หรือสายนาฬิกา", { g, a: famList(r.accent) })));
    for (const s of r.support) box.append(el("p", "lc-accent", T("lucky.support", "สี{c}ในชุดก็ช่วยเสริม{g}ด้วย", { c: fam(s.family), g })));
  }

  function setEngine(kind) {
    st.engine = kind;
    const txt = {
      loading: T("lucky.eng.loading", "กำลังโหลดตัวแยกเสื้อผ้า (ครั้งแรกอาจใช้เวลาสักครู่)…"),
      multi: T("lucky.eng.multi", "พร้อม: แยกเสื้อผ้าใต้ใบหน้าด้วยโมเดลในเครื่อง"),
      person: T("lucky.eng.person", "พร้อม: แยกตัวคนแล้วตัดส่วนศีรษะออก (โหมดสำรอง)"),
      guide: T("lucky.eng.guide", "โหมดกรอบ: ยืนให้เสื้ออยู่ในกรอบเส้นประกลางภาพ"),
      fake: T("lucky.eng.fake", "โหมดทดสอบ: ใช้หน้ากากจำลอง"),
      off: ""
    };
    $("#engine").textContent = txt[kind] || "";
  }

  // ---------- segmentation engines ----------
  let mpSeg = null;
  const hasWebGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };
  async function loadEngine() {
    if (FAKE) return "fake";
    try { if (window.PBHQ && typeof ort !== "undefined") { await PBHQ.loadMulticlass(); return "multi"; } } catch (e) { console.warn("multiclass", e); }
    try {
      if (!hasWebGL() || /[?&](cpu|nogl)\b/.test(location.search)) throw new Error("no WebGL");
      const { FilesetResolver, ImageSegmenter } = await import(new URL("vendor/mediapipe/vision_bundle.mjs", location.href).href);
      const files = await FilesetResolver.forVisionTasks(new URL("vendor/mediapipe/wasm", location.href).href);
      mpSeg = await ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL("vendor/models/selfie_segmenter.tflite", location.href).href, delegate: "CPU" },
        runningMode: "VIDEO", outputConfidenceMasks: true, outputCategoryMask: false
      });
      return "person";
    } catch (e) { console.warn("segmenter", e.message || e); }
    return "guide";
  }

  function fakeMask(w, h) {
    const s = (window.__LQ_FAKE_SEG && window.__LQ_FAKE_SEG(w, h)) || { face: { x0: 0.4, y0: 0.06, x1: 0.6, y1: 0.3 }, region: { x0: 0.15, y0: 0.36, x1: 0.85, y1: 0.98 } };
    const mask = new Uint8Array(w * h), R = s.region; let n = 0;
    if (R) for (let y = Math.round(R.y0 * h); y < Math.round(R.y1 * h); y++) for (let x = Math.round(R.x0 * w); x < Math.round(R.x1 * w); x++) { mask[y * w + x] = 1; n++; }
    const f = s.face && { x0: s.face.x0 * w, y0: s.face.y0 * h, x1: s.face.x1 * w, y1: s.face.y1 * h };
    return { mask, w, h, face: f, n, noFace: !f };
  }

  const frame = document.createElement("canvas"), fx = frame.getContext("2d", { willReadFrequently: true });
  async function segment(video) {
    if (st.engine === "fake") return fakeMask(64, 64);
    if (st.engine === "multi") {
      const { prob, S } = await PBHQ.multiclassParse(frame, { x: 0, y: 0, w: frame.width, h: frame.height });
      return L.clothesMaskFromProb(prob, S);
    }
    if (st.engine === "person" && mpSeg) {
      const res = mpSeg.segmentForVideo(video, performance.now()), m = res.confidenceMasks && res.confidenceMasks[0];
      if (m) { const a = m.getAsFloat32Array(), out = L.personMask(a, m.width, m.height); res.close && res.close(); return out; }
    }
    return L.guideMask(64, 64);
  }

  // ---------- overlay ----------
  const ov = $("#ov"), ox = ov.getContext("2d");
  const mc = document.createElement("canvas"), mx = mc.getContext("2d");
  function drawOverlay(m) {
    const r = ov.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    ov.width = Math.max(1, Math.round(r.width * dpr)); ov.height = Math.max(1, Math.round(r.height * dpr));
    ox.clearRect(0, 0, ov.width, ov.height);
    if (!m) return;
    if (mc.width !== m.w || mc.height !== m.h) { mc.width = m.w; mc.height = m.h; }
    const id = mx.createImageData(m.w, m.h);
    for (let i = 0; i < m.mask.length; i++) if (m.mask[i]) { id.data[i * 4] = 34; id.data[i * 4 + 1] = 211; id.data[i * 4 + 2] = 238; id.data[i * 4 + 3] = 90; }
    mx.putImageData(id, 0, 0);
    ox.imageSmoothingEnabled = true; ox.drawImage(mc, 0, 0, ov.width, ov.height);
    ox.lineWidth = 2 * dpr; ox.setLineDash([8 * dpr, 6 * dpr]);
    const sx = ov.width / m.w, sy = ov.height / m.h;
    if (m.guide) { ox.strokeStyle = "#fff"; ox.strokeRect(0.3 * ov.width, 0.55 * ov.height, 0.4 * ov.width, 0.4 * ov.height); }
    else if (m.face && !m.face.approx) { ox.strokeStyle = "rgba(255,255,255,.85)"; ox.strokeRect(m.face.x0 * sx, m.face.y0 * sy, (m.face.x1 - m.face.x0 + 1) * sx, (m.face.y1 - m.face.y0 + 1) * sy); }
    ox.setLineDash([]);
  }

  // ---------- loop ----------
  const video = $("#video");
  const cam = LQCam.create(video, { facing: "user", ideal: { width: 640, height: 480 }, onChange: (c, ev) => { if (ev.type === "ended") stop(); } });
  async function tick() {
    st.timer = 0;
    if (!cam.active || st.busy) return;
    if (cam.paused || !video.videoWidth) { st.timer = setTimeout(tick, 500); return; }
    st.busy = true;
    try {
      const w = 320, h = Math.max(1, Math.round(320 * video.videoHeight / video.videoWidth));
      if (frame.width !== w || frame.height !== h) { frame.width = w; frame.height = h; }
      fx.drawImage(video, 0, 0, w, h);
      const m = await segment(video);
      if (!cam.active) return;
      const px = fx.getImageData(0, 0, w, h).data;
      drawOverlay(m);
      const small = m.n < m.w * m.h * 0.015;
      if (small) { st.list = []; renderResult(true); }
      else { const dc = L.dominantColors(px, w, h, m, { step: 2 }); st.list = L.smooth(st.list, dc.list, 0.5); renderResult(false); }
    } catch (e) { console.warn("analyse", e); }
    finally { st.busy = false; }
    if (cam.active) st.timer = setTimeout(tick, st.engine === "multi" ? 700 : 450);
  }

  async function start() {
    const b = $("#startCam"); b.disabled = true;
    try {
      await cam.start();
      $("#camEmpty").hidden = true;
      $("#cam").classList.toggle("mirrored", !!cam.mirrored);
      $("#stopCam").disabled = false;
      if (!st.engine || st.engine === "off") { setEngine("loading"); setEngine(await loadEngine()); }
      else setEngine(st.engine);
      if (cam.active) tick();
    } catch (e) {
      $("#engine").textContent = LQCam.errorText ? LQCam.errorText(e) : String(e.message || e);
      b.disabled = false;
    }
  }
  function stop() {
    clearTimeout(st.timer); st.timer = 0;
    cam.stop();
    drawOverlay(null);
    $("#camEmpty").hidden = false;
    $("#startCam").disabled = false; $("#stopCam").disabled = true;
    if (st.engine) $("#engine").textContent = T("lucky.stopped", "ปิดกล้องแล้ว ผลล่าสุดยังแสดงอยู่ ไม่มีภาพถูกเก็บไว้");
  }

  // ---------- wiring ----------
  $("#goals").addEventListener("click", e => {
    const b = e.target.closest(".lc-goal"); if (!b) return;
    st.goal = b.dataset.goal; save(); renderRec(); renderResult(false);
  });
  $("#daySel").addEventListener("change", e => { st.day = e.target.value; save(); renderRec(); renderWeek(); renderResult(false); });
  $("#startCam").addEventListener("click", start);
  $("#stopCam").addEventListener("click", stop);
  $("#clearPrefs").addEventListener("click", () => {
    try { localStorage.removeItem(PREFS); } catch { /* ignore */ }
    st.goal = "work"; st.day = "auto"; renderRec(); renderWeek(); renderResult(false);
    $("#clearMsg").textContent = T("lucky.cleared", "ลบค่าที่จำไว้แล้ว");
  });
  window.addEventListener("lq-lang", () => { renderRec(); renderWeek(); renderResult(false); if (st.engine && cam.active) setEngine(st.engine); });
  window.addEventListener("pagehide", () => { if (cam.active) stop(); });

  /* crisis flow v2 (owner decision 2026-11-13 §3): in a calm tab the goal picker, mirror and week table stay hidden
     (data-lq-remedy) and a neutral colour of the day is shown instead (the day planet's colour, no goal, no object) */
  function renderCalmDay() {
    const CR = window.LQFortuneCrisis;
    if (!CR || !CR.calmOn || !CR.calmOn(document)) return;
    let box = $("#lcCalmDay");
    if (!box) { box = el("section", "fk-block lc-calmday"); box.id = "lcCalmDay"; const ref = document.querySelector(".lc-opts"); if (ref) ref.before(box); else return; }
    box.textContent = "";
    const d = today(), fams = L.familiesOf(d);
    box.append(el("h2", null, T("lucky.calm.h", "สีประจำ{day}", { day: dayN(d) })));
    const row = el("p", "lc-rec-row"), sw = el("span", "lc-dots"); fams.forEach(k => sw.append(dot(k, true)));
    row.append(sw, el("b", null, famList(fams))); box.append(row);
    box.append(el("p", "fk-small", T("lucky.calm.note", "ตามความเชื่อ ใส่สีไหนก็ได้ตามที่สบายใจ วันนี้ดูแลตัวเองให้ดีก็พอ")));
  }
  renderRec(); renderWeek(); renderCalmDay();
  window.addEventListener("lq-lang", renderCalmDay);
  // test hook (numbers and colour names only — never pixels)
  window.__LQLC = { st, evaluate: () => L.evaluate(st.list, today(), st.goal), today };
})();
