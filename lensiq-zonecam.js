/* lensiq-zonecam.js — LQZoneCam: the camera + detector + zone-drawing runtime shared by queue.html, tables.html,
 * afterhours.html and bays.html (the quick-win pages of solutions.html). Browser only: window.LQZoneCam.
 * Reuses LQCam (lensiq-camera.js: fallback chain, reconnect, auto-pause), LQDetect (YOLOX-Nano on ORT WASM, COCO-SSD
 * fallback, ?fakedet test seam), LQTrack (anonymous track ids) and LQZones (pure zone maths).
 * Privacy: frames are analysed in memory and dropped. Nothing here stores, sends or exports an image. Track ids are
 * random per session and are never linked to a face or a name. Persisted keys hold zone shapes, settings and numbers.
 *
 * API
 *   T(key, thai, vars) -> text in the current language (LQI18N.tf; Thai default)
 *   create({key, root, classes=['person'], minScore=0.4, hz=5, anchorKind, engine, onFrame(dets, now), draw(ctx, W, H, now),
 *           demo(now) -> dets}) -> ZC
 *     root = element holding <video class="zc-video"> + <canvas class="zc-ov"> (+ optional .zc-switch)
 *     ZC = {start() -> Promise, startDemo(), stop(), get running, get demo, get kind, canvas, video, camera,
 *           toNorm(ev) -> {x,y} (unmirrored, 0..1), drawPoly(ctx, poly, {color, label, fill}), drawBoxes(ctx, dets)}
 *     dets passed to onFrame: [{x,y,w,h,score,label,id}] normalised, id = anonymous track id (0 before confirmed)
 *   polyEditor(zc, {onChange(points), onDone(poly)}) -> {begin(), finish() -> boolean, cancel(), get active, points}
 *     tap / click adds a point, tapping near the first point (or finish()) closes it, Escape cancels
 *   store.get(k, def) / store.set(k, v) / store.del(k)   localStorage wrapped in try/catch (numbers + shapes only)
 *   dayKey(d=new Date()) -> 'YYYY-MM-DD' · fmtMin(ms) -> '12 นาที' · fmtClock(ms) -> 'HH:MM:SS' · fmtMS(ms) -> 'm:ss'
 *   downloadCsv(name, rows[][]) -> void   UTF-8 BOM + CSV, formulas neutralised
 *   beep() -> void                        short tone (WebAudio), ignored where audio is blocked
 *   gate({box, ackKey, startBtns:[...], onAck}) -> boolean   PDPA notice acknowledgement before the camera starts
 *   createLog({list, statsEl, key, max=200}) -> {add({kind, zone, text}), mark(id, 'tp'|'fp'), items, tally(), clear(), render()}
 *     the event log of a page: every alert is something "for a person to check"; staff mark each as real / false alarm,
 *     which gives the on-site precision (LQZones.precision).
 */
(function (root) {
  "use strict";
  const W0 = /** @type {any} */ (root);
  const Z = () => W0.LQZones;
  const T = (key, thai, vars) => W0.LQI18N ? W0.LQI18N.tf(key, thai, vars) : String(thai).replace(/\{(\w+)\}/g, (m, k) => vars && vars[k] != null ? vars[k] : m);

  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
  };
  const pad = n => String(n).padStart(2, "0");
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtMin = ms => T("zc.min", "{n} นาที", { n: Math.max(0, Math.round(ms / 60000)) });
  const fmtMS = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
  const fmtClock = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  function downloadCsv(name, rows) {
    const cell = v => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const blob = new Blob(["﻿" + rows.map(r => r.map(cell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  let actx = null;
  function beep() {
    try {
      const AC = W0.AudioContext || W0.webkitAudioContext;
      if (!AC) return;
      actx = actx || new AC();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 880; g.gain.value = 0.08;
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.25);
    } catch { /* audio blocked */ }
  }

  // ---------- notice gate (PDPA): the operator confirms the camera notice is posted before the first start ----------
  /** @param {{box: any, ackKey: string, startBtns?: any[], onAck?: Function}} o */
  function gate({ box, ackKey, startBtns = [], onAck }) {
    const ok = !!store.get(ackKey, false);
    if (box) box.hidden = ok;
    startBtns.forEach(b => { if (b) b.disabled = !ok; });
    if (!ok && box) {
      const chk = box.querySelector("input[type=checkbox]"), btn = box.querySelector("button[data-ack]");
      const sync = () => { if (btn) btn.disabled = !(chk && chk.checked); };
      if (chk) chk.addEventListener("change", sync);
      sync();
      if (btn) btn.addEventListener("click", () => {
        if (chk && !chk.checked) return;
        store.set(ackKey, { at: Date.now() });
        box.hidden = true;
        startBtns.forEach(b => { if (b) b.disabled = false; });
        if (onAck) onAck();
      });
    }
    return ok;
  }

  // ---------- event log + on-site precision ----------
  function createLog({ list, statsEl, key, max = 200 }) {
    let items = store.get(key, []);
    if (!Array.isArray(items)) items = [];
    const save = () => store.set(key, items.slice(-max));
    function tally() {
      let tp = 0, fp = 0;
      for (const e of items) { if (e.v === "tp") tp++; else if (e.v === "fp") fp++; }
      return { tp, fp, open: items.filter(e => !e.v).length, ...Z().precision({ tp, fp }) };
    }
    function render() {
      if (list) {
        list.textContent = "";
        if (!items.length) {
          const li = document.createElement("li"); li.className = "zc-empty";
          li.textContent = T("zc.log.empty", "ยังไม่มีรายการ");
          list.appendChild(li);
        }
        for (const e of items.slice().reverse().slice(0, 50)) {
          const li = document.createElement("li");
          li.className = "zc-ev" + (e.v ? " done " + e.v : "");
          const tx = document.createElement("span"); tx.className = "zc-ev-t";
          tx.textContent = `${fmtClock(e.t)} · ${e.zone ? e.zone + " · " : ""}${e.text}`;
          li.appendChild(tx);
          if (e.alert) {
            if (!e.v) {
              const b1 = document.createElement("button"); b1.type = "button"; b1.className = "btn ghost small";
              b1.textContent = T("zc.log.tp", "ตรวจแล้ว: จริง"); b1.onclick = () => mark(e.id, "tp");
              const b2 = document.createElement("button"); b2.type = "button"; b2.className = "btn ghost small";
              b2.textContent = T("zc.log.fp", "แจ้งผิด"); b2.onclick = () => mark(e.id, "fp");
              li.append(b1, b2);
            } else {
              const s = document.createElement("span"); s.className = "pill";
              s.textContent = e.v === "tp" ? T("zc.log.isTp", "ยืนยันว่าจริง") : T("zc.log.isFp", "แจ้งผิด");
              li.appendChild(s);
            }
          }
          list.appendChild(li);
        }
      }
      if (statsEl) {
        const t = tally();
        statsEl.textContent = t.n
          ? T("zc.log.prec", "ความแม่นยำของการแจ้งเตือนที่ตรวจแล้ว {p}% ({tp}/{n}) · ช่วงความเชื่อมั่น 95% {lo}–{hi}% · รอตรวจ {open}",
            { p: Math.round(t.p * 100), tp: t.tp, n: t.n, lo: Math.round(t.lo * 100), hi: Math.round(t.hi * 100), open: t.open })
          : T("zc.log.precNone", "ยังไม่มีการแจ้งเตือนที่ตรวจแล้ว — กด \"ตรวจแล้ว: จริง\" หรือ \"แจ้งผิด\" ที่แต่ละรายการ เพื่อวัดความแม่นยำหน้างาน");
      }
    }
    function add({ kind, zone = "", text, alert = false }) {
      const e = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), kind, zone, text, alert, v: null };
      items.push(e); if (items.length > max) items = items.slice(-max);
      save(); render();
      return e;
    }
    function mark(id, v) { const e = items.find(x => x.id === id); if (e) { e.v = v; save(); render(); } }
    function clear() { items = []; save(); render(); }
    return { add, mark, tally, clear, render, get items() { return items; } };
  }

  // ---------- camera + detector ----------
  const COLORS = ["#22d3ee", "#a78bfa", "#facc15", "#34d399", "#fb923c", "#f472b6", "#60a5fa", "#f87171"];
  function create(opts) {
    const o = Object.assign({ key: "zc", classes: ["person"], minScore: 0.4, hz: 5, anchorKind: "foot" }, opts);
    const rootEl = o.root, video = rootEl.querySelector("video"), canvas = rootEl.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const TEST = !!(W0.LQDetect && LQDetect.isTest());
    let running = false, demo = false, timer = 0, model = null, kind = "test", demoT0 = 0, busy = false;
    const tracker = LQTrack.newTracker(/** @type {any} */ (Object.assign({}, LQTrack.PRESET.object || LQTrack.DEFAULTS, { MIN_HITS: 2 })));
    const camera = LQCam.create(video, {
      facing: "environment", persistKey: "lqz-cam-" + o.key,
      onChange: (c, ev) => { if (ev.type === "started" || ev.type === "resumed") layout(); },
      onError: (c, e) => { if (e && e.name !== "AbortError") engine(LQCam.errorText ? LQCam.errorText(e) : String(e), "err"); }
    });
    const sw = rootEl.parentElement && rootEl.parentElement.querySelector(".zc-switch");
    if (sw) camera.attach(sw);
    if (LQCam.offlineBadge) LQCam.offlineBadge(camera, rootEl);
    // the engine line is kept as a function so a language switch re-renders it (lq-lang)
    let engineFn = () => T("zc.idle", "กด \"เปิดกล้อง\" หรือ \"ดูตัวอย่าง (ข้อมูลจำลอง)\""), engineCls = "";
    function engine(msg, cls = "") {
      engineFn = typeof msg === "function" ? msg : () => msg; engineCls = cls;
      if (o.engine) { o.engine.textContent = engineFn(); o.engine.className = "engine " + cls; }
    }
    W0.addEventListener("lq-lang", () => engine(engineFn, engineCls));
    function layout() {
      const w = demo ? 960 : video.videoWidth || 640, h = demo ? 540 : video.videoHeight || 360;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      rootEl.classList.toggle("mirror", !demo && camera.mirrored);
      rootEl.style.aspectRatio = `${w} / ${h}`;
    }
    async function loadModel() {
      if (TEST) return "test";
      const yx = o.classes.map(n => Z().cocoIndex(n, "yolox")).filter(i => i >= 0);
      try {
        if (!W0.ort) throw new Error("no ort");
        model = await LQDetect.loadYolox(); kind = "yolox"; o._cls = yx; return "YOLOX-Nano";
      } catch (e) {
        console.warn("YOLOX unavailable, COCO-SSD fallback", e);
        model = await LQDetect.loadCoco(); kind = "coco";
        o._cls = o.classes.map(n => Z().cocoIndex(n, "coco")).filter(i => i >= 0);
        return "COCO-SSD";
      }
    }
    async function detect(now) {
      if (demo) return o.demo ? o.demo(now - demoT0) : [];
      if (TEST) {
        const f = LQDetect.fake(o.key, now);
        return (f || []).map(d => ({ ...d, label: d.label || "person" }));
      }
      if (!model || !video.videoWidth) return [];
      const r = await LQDetect.detectPeople(model, video, { classes: o._cls, minScore: o.minScore, detW: 416, max: 40, split: "auto" });
      return r.map(d => ({ ...d, label: Z().labelOf(d, kind) }));
    }
    function drawPoly(c, poly, { color = COLORS[0], label = "", fill = 0.12, dash = false } = {}) {
      if (!poly || poly.length < 2) return;
      const Wd = canvas.width, Hd = canvas.height;
      c.save();
      c.beginPath(); poly.forEach((p, i) => i ? c.lineTo(p.x * Wd, p.y * Hd) : c.moveTo(p.x * Wd, p.y * Hd));
      if (poly.length >= 3) c.closePath();
      if (fill && poly.length >= 3) { c.globalAlpha = fill; c.fillStyle = color; c.fill(); c.globalAlpha = 1; }
      c.lineWidth = Math.max(2, Wd / 320); c.strokeStyle = color; if (dash) c.setLineDash([8, 6]); c.stroke();
      c.restore();
      if (label) textAt(c, label, Z().polyCentroid(poly), color);
    }
    function textAt(c, text, p, color) {
      const Wd = canvas.width, Hd = canvas.height, fs = Math.max(14, Math.round(Wd / 40));
      c.save();
      c.font = `600 ${fs}px Prompt, Inter, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
      const x = p.x * Wd, y = p.y * Hd;
      if (!demo && camera.mirrored) { c.translate(x, 0); c.scale(-1, 1); c.translate(-x, 0); }
      const tw = c.measureText(text).width + 14;
      c.fillStyle = "rgba(14,20,48,.82)"; c.fillRect(x - tw / 2, y - fs * 0.75, tw, fs * 1.5);
      c.fillStyle = color || "#fff"; c.fillText(text, x, y);
      c.restore();
    }
    function drawBoxes(c, dets) {
      const Wd = canvas.width, Hd = canvas.height;
      c.save(); c.lineWidth = Math.max(2, Wd / 400);
      for (const d of dets) {
        c.strokeStyle = d.label === "person" ? "#f8fafc" : "#facc15";
        c.strokeRect(d.x * Wd, d.y * Hd, d.w * Wd, d.h * Hd);
        const a = Z().anchor(d, o.anchorKind);
        c.fillStyle = "#22d3ee"; c.beginPath(); c.arc(a.x * Wd, a.y * Hd, Math.max(3, Wd / 200), 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    // demo background: a plain floor plan, synthetic objects drawn as grey blocks (no imagery of people)
    function drawDemoBg(c, dets) {
      const Wd = canvas.width, Hd = canvas.height;
      c.fillStyle = "#1b2347"; c.fillRect(0, 0, Wd, Hd);
      c.strokeStyle = "rgba(255,255,255,.06)"; c.lineWidth = 1;
      for (let x = 0; x < Wd; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, Hd); c.stroke(); }
      for (let y = 0; y < Hd; y += 48) { c.beginPath(); c.moveTo(0, y); c.lineTo(Wd, y); c.stroke(); }
      c.fillStyle = "rgba(201,211,234,.45)";
      for (const d of dets) c.fillRect(d.x * Wd, d.y * Hd, d.w * Wd, d.h * Hd);
    }
    async function tick() {
      if (!running) return;
      const t0 = performance.now();
      if (!busy && (demo || TEST || (camera.active && !camera.paused))) {
        busy = true;
        try {
          layout();
          const raw = (await detect(t0)).filter(d => d && d.w > 0 && d.h > 0);
          LQTrack.updateTracker(tracker, raw, t0);
          const byDet = new Map();
          for (const tr of tracker.tracks) if (tr.lastSeen === t0 && tr.det) byDet.set(tr.det, tr.confirmed ? tr.id : 0);
          const dets = raw.map(d => ({ x: d.x, y: d.y, w: d.w, h: d.h, score: d.score, label: d.label, id: byDet.get(d) || 0 }));
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (demo) drawDemoBg(ctx, dets);
          if (o.onFrame) o.onFrame(dets, Date.now());
          if (o.draw) o.draw(ctx, canvas.width, canvas.height, t0);
          drawBoxes(ctx, dets);
          if (editorRef && editorRef.active) editorRef.paint(ctx);
        } catch (e) { console.error(e); engine(T("zc.err.frame", "ประมวลผลภาพไม่สำเร็จ: {m}", { m: e && e.message || e }), "err"); }
        finally { busy = false; }
      } else if (!running) return;
      else if (editorRef && editorRef.active) { // camera paused: keep the drawing visible
        if (o.draw) { ctx.clearRect(0, 0, canvas.width, canvas.height); o.draw(ctx, canvas.width, canvas.height, t0); }
        editorRef.paint(ctx);
      }
      timer = setTimeout(tick, Math.max(20, 1000 / o.hz - (performance.now() - t0)));
    }
    async function start() {
      if (running) stop();
      demo = false;
      engine(() => T("zc.loading", "กำลังเปิดกล้องและโหลดตัวตรวจจับ..."));
      try {
        if (!W0.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error("insecure"), { name: "Insecure" });
        const [, name] = await Promise.all([camera.start(), loadModel()]);
        running = true; layout();
        engine(() => name === "test"
          ? T("zc.readyTest", "พร้อม (โหมดทดสอบ: ตัวตรวจจับจำลอง)")
          : T("zc.ready", "พร้อมใช้งาน · ตัวตรวจจับ {d} · ประมวลผลในเครื่องนี้ ไม่บันทึกภาพ", { d: name }), "ok");
        tick();
      } catch (e) {
        console.error(e);
        const msg = e && e.name === "Insecure" ? T("zc.err.https", "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด")
          : LQCam.errorText ? LQCam.errorText(e) : String(e && e.message || e);
        engine(() => T("zc.err.start", "เริ่มไม่สำเร็จ: {m} — ลอง \"ดูตัวอย่าง (ข้อมูลจำลอง)\" ได้", { m: msg }), "err");
        try { camera.stop(); } catch { /* ignore */ }
      }
    }
    function startDemo() {
      if (running) stop();
      demo = true; running = true; demoT0 = performance.now(); layout();
      engine(() => T("zc.demo", "โหมดตัวอย่าง: ข้อมูลจำลอง ไม่ได้ใช้กล้อง"), "warn");
      tick();
    }
    function stop() {
      running = false; clearTimeout(timer);
      if (!demo) try { camera.stop(); } catch { /* ignore */ }
      tracker.tracks = []; tracker.lost = [];
      engine(() => T("zc.stopped", "หยุดแล้ว"));
    }
    function toNorm(ev) {
      const r = canvas.getBoundingClientRect();
      let x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
      if (!demo && camera.mirrored) x = 1 - x;
      return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    }
    let editorRef = null;
    const zc = {
      start, startDemo, stop, camera, video, canvas, toNorm, drawPoly, drawBoxes, textAt, COLORS,
      get running() { return running; }, get demo() { return demo; }, get kind() { return kind; },
      _setEditor(e) { editorRef = e; },
      repaint() {
        if (running) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (o.draw) o.draw(ctx, canvas.width, canvas.height, performance.now());
        if (editorRef && editorRef.active) editorRef.paint(ctx);
      }
    };
    layout();
    engine(engineFn);
    return zc;
  }

  // ---------- polygon editor ----------
  /** @param {any} zc @param {{onChange?: Function, onDone?: Function}} [opts] */
  function polyEditor(zc, { onChange, onDone } = {}) {
    let active = false, pts = [];
    const cv = zc.canvas;
    const near = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * cv.height / Math.max(1, cv.width)) < 0.03;
    function onUp(ev) {
      if (!active) return;
      ev.preventDefault();
      const p = zc.toNorm(ev);
      if (pts.length >= 3 && near(p, pts[0])) { finish(); return; }
      pts.push(p);
      if (onChange) onChange(pts.slice());
      zc.repaint();
    }
    function onKey(ev) { if (active && ev.key === "Escape") cancel(); }
    function begin() { active = true; pts = []; cv.classList.add("drawing"); if (onChange) onChange([]); zc.repaint(); }
    function finish() {
      if (!active) return false;
      const poly = W0.LQZones.normPoly(pts);
      if (!poly) return false;
      active = false; cv.classList.remove("drawing"); pts = [];
      if (onDone) onDone(poly);
      zc.repaint();
      return true;
    }
    function cancel() { active = false; pts = []; cv.classList.remove("drawing"); if (onChange) onChange(null); zc.repaint(); }
    function paint(c) {
      if (!pts.length) return;
      zc.drawPoly(c, pts, { color: "#facc15", fill: 0.08, dash: true });
      c.fillStyle = "#facc15";
      for (const p of pts) { c.beginPath(); c.arc(p.x * cv.width, p.y * cv.height, Math.max(4, cv.width / 160), 0, Math.PI * 2); c.fill(); }
    }
    cv.addEventListener("pointerup", onUp);
    document.addEventListener("keydown", onKey);
    const ed = { begin, finish, cancel, paint, get active() { return active; }, get points() { return pts.slice(); } };
    zc._setEditor(ed);
    return ed;
  }

  // ---------- page scaffold: wires the common controls of the four quick-win pages ----------
  /* page(cfg) — cfg = {ns, key, classes, anchorKind, hz, zoneName(i), maxZones=12, defaults:{...settings}, newDay(),
   *   onFrame(dets, now, P), draw(c, P), render(P), demoZones:[poly], demo(ms, P) -> dets, csv(P) -> rows[][], csvName,
   *   onZones(P), zoneExtra(li, zone, P)}
   * P (returned, also window.__LQZ) = {zc, zones, settings, day, log, alert(key, text, zone), clear(key, text, zone),
   *   saveZones(), saveDay(), render(), T}
   * Element ids used: gate, engine, alerts, cam, startCam, demoCam, stopCam, drawZone, finishZone, cancelZone, rectZone,
   *   drawMsg, zoneList, settingsForm, setMsg, log, logStats, exportCsv, clearData, printNotice. */
  function page(cfg) {
    const $ = id => /** @type {any} */ (document.getElementById(id));
    const ns = cfg.ns, max = cfg.maxZones || 12;
    const K = { zones: ns + "-zones", set: ns + "-settings", log: ns + "-log", ack: ns + "-ack", day: () => ns + "-day-" + dayKey() };
    const P = { T, zones: [], settings: {}, day: null, active: new Map() };
    let demoWall0 = 0;
    const loadZones = () => (store.get(K.zones, []) || []).map((z, i) => {
      const poly = z && W0.LQZones.normPoly(z.poly);
      return poly ? { id: String(z.id || "z" + (i + 1)).slice(0, 12), name: String(z.name || cfg.zoneName(i)).slice(0, 40), poly, ...(cfg.zoneFields ? cfg.zoneFields(z) : {}) } : null;
    }).filter(Boolean).slice(0, max);
    P.zones = loadZones();
    P.settings = Object.assign({}, cfg.defaults, store.get(K.set, {}) || {});
    const loadDay = () => { const d = store.get(K.day(), null); return d && d.date === dayKey() ? Object.assign(cfg.newDay(), d) : Object.assign(cfg.newDay(), { date: dayKey() }); };
    P.day = loadDay();
    P.saveZones = () => store.set(K.zones, P.zones.map(z => ({ ...z })));
    let lastDaySave = 0;
    P.saveDay = (force) => { const n = Date.now(); if (force || n - lastDaySave > 5000) { lastDaySave = n; store.set(K.day(), P.day); } };
    P.log = createLog({ list: $("log"), statsEl: $("logStats"), key: K.log });

    // alerts: banner per key + log entry; "for a person to check", never a verdict
    const alertsEl = $("alerts");
    P.alert = (key, text, zone = "", { test = false } = {}) => {
      if (P.active.has(key)) return;
      const div = document.createElement("div"); div.className = "alert zc-alert";
      const s = document.createElement("span"); s.textContent = text;
      const b = document.createElement("button"); b.type = "button"; b.className = "btn ghost small";
      b.textContent = T("zc.ack", "รับทราบ"); b.onclick = () => { div.remove(); P.active.delete(key); };
      div.append(s, b); if (alertsEl) alertsEl.appendChild(div);
      P.active.set(key, div);
      P.log.add({ kind: test ? "test" : "alert", zone, text, alert: !test });
      if (P.settings.sound) beep();
      if (cfg.onAlert) cfg.onAlert(key, P);
    };
    P.clear = (key, text, zone = "") => {
      const div = P.active.get(key);
      if (div) { div.remove(); P.active.delete(key); }
      if (text) P.log.add({ kind: "clear", zone, text });
    };

    const zc = create({
      key: cfg.key, root: $("cam"), classes: cfg.classes || ["person"], anchorKind: cfg.anchorKind || "foot", hz: cfg.hz || 5,
      minScore: cfg.minScore || 0.4, engine: $("engine"),
      onFrame: (dets, now) => {
        if (P.day.date !== dayKey()) { P.saveDay(true); P.day = Object.assign(cfg.newDay(), { date: dayKey() }); }
        // demo mode runs a faster clock (cfg.demoSpeed) so seat / leave timers are visible within seconds
        if (zc.demo && cfg.demoSpeed > 1) now = demoWall0 + (now - demoWall0) * cfg.demoSpeed;
        P.dets = dets;
        cfg.onFrame(dets, now, P);
        P.saveDay();
        renderSoon();
      },
      draw: c => {
        P.zones.forEach((z, i) => zc.drawPoly(c, z.poly, { color: (cfg.zoneColor && cfg.zoneColor(z, P)) || COLORS[i % COLORS.length], label: (cfg.zoneLabel && cfg.zoneLabel(z, P)) || z.name }));
        if (cfg.draw) cfg.draw(c, P);
      },
      demo: ms => cfg.demo ? cfg.demo(ms, P) : []
    });
    P.zc = zc;
    const drawMsg = $("drawMsg");
    const ed = polyEditor(zc, {
      onChange: pts => {
        if (!drawMsg) return;
        drawMsg.textContent = pts == null ? "" : T("zc.draw.hint", "แตะบนภาพเพื่อวางจุดมุมของโซน ({n} จุด) · แตะจุดแรกหรือกด \"เสร็จ\" เพื่อปิดโซน · Esc ยกเลิก", { n: pts.length });
        $("finishZone").hidden = pts == null; $("cancelZone").hidden = pts == null;
      },
      onDone: poly => addZone(poly)
    });
    function addZone(poly) {
      if (P.zones.length >= max) { if (drawMsg) drawMsg.textContent = T("zc.zone.max", "มีโซนครบ {n} โซนแล้ว", { n: max }); return null; }
      let n = 1; while (P.zones.some(z => z.id === "z" + n)) n++;
      const z = { id: "z" + n, name: cfg.zoneName(P.zones.length), poly, ...(cfg.zoneFields ? cfg.zoneFields({}) : {}) };
      P.zones.push(z); P.saveZones();
      if (drawMsg) drawMsg.textContent = T("zc.zone.added", "เพิ่ม \"{name}\" แล้ว", { name: z.name });
      $("finishZone").hidden = true; $("cancelZone").hidden = true;
      if (cfg.onZones) cfg.onZones(P);
      renderZones(); zc.repaint(); render();
      return z;
    }
    P.addZone = addZone;
    function renderZones() {
      const ul = $("zoneList"); if (!ul) return;
      ul.textContent = "";
      if (!P.zones.length) {
        const li = document.createElement("li"); li.className = "zc-empty";
        li.textContent = T("zc.zone.none", "ยังไม่มีโซน — กด \"วาดโซน\" แล้วแตะมุมของพื้นที่บนภาพ หรือกด \"เพิ่มโซนสี่เหลี่ยม\"");
        ul.appendChild(li); return;
      }
      P.zones.forEach((z, i) => {
        const li = document.createElement("li"); li.className = "zc-zone";
        const sw = document.createElement("i"); sw.className = "zc-sw"; sw.style.background = COLORS[i % COLORS.length];
        const inp = document.createElement("input"); inp.value = z.name; inp.maxLength = 40;
        inp.setAttribute("aria-label", T("zc.zone.name", "ชื่อโซน {n}", { n: i + 1 }));
        inp.addEventListener("change", () => { z.name = inp.value.trim().slice(0, 40) || cfg.zoneName(i); inp.value = z.name; P.saveZones(); zc.repaint(); render(); });
        const del = document.createElement("button"); del.type = "button"; del.className = "btn ghost small danger";
        del.textContent = T("zc.zone.del", "ลบ"); del.setAttribute("aria-label", T("zc.zone.delA", "ลบโซน {name}", { name: z.name }));
        del.onclick = () => { P.zones = P.zones.filter(x => x !== z); P.saveZones(); P.clear(z.id); if (cfg.onZones) cfg.onZones(P); renderZones(); zc.repaint(); render(); };
        li.append(sw, inp);
        if (cfg.zoneExtra) cfg.zoneExtra(li, z, P);
        li.append(del);
        ul.appendChild(li);
      });
    }
    P.renderZones = renderZones;

    // settings form <-> P.settings (inputs by name; checkbox = boolean, number = number, select/text = string)
    const form = $("settingsForm");
    function fillForm() {
      if (!form) return;
      for (const el of form.elements) {
        const inp = /** @type {HTMLInputElement} */ (el);
        if (!inp.name || !(inp.name in P.settings)) continue;
        if (inp.type === "checkbox") inp.checked = !!P.settings[inp.name];
        else inp.value = P.settings[inp.name] == null ? "" : String(P.settings[inp.name]);
      }
    }
    if (form) form.addEventListener("change", ev => {
      const inp = /** @type {HTMLInputElement} */ (ev.target);
      if (!inp.name) return;
      let v;
      if (inp.type === "checkbox") v = inp.checked;
      else if (inp.type === "number") {
        v = Number(inp.value);
        const lo = inp.min !== "" ? Number(inp.min) : -Infinity, hi = inp.max !== "" ? Number(inp.max) : Infinity;
        if (!Number.isFinite(v) || v < lo || v > hi) {
          v = cfg.defaults[inp.name]; inp.value = String(v);
          if ($("setMsg")) $("setMsg").textContent = T("zc.set.bad", "ค่าไม่ถูกต้อง ใช้ค่าเริ่มต้นแทน");
        }
        else if ($("setMsg")) $("setMsg").textContent = T("zc.set.ok", "บันทึกการตั้งค่าแล้ว");
      } else v = inp.value;
      P.settings[inp.name] = v; store.set(K.set, P.settings);
      if (cfg.onSettings) cfg.onSettings(P);
      render();
    });
    fillForm();

    let rq = 0;
    function render() { if (cfg.render) cfg.render(P); }
    function renderSoon() { if (!rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); }
    P.render = render;

    const startBtns = [$("startCam"), $("demoCam")];
    gate({ box: $("gate"), ackKey: K.ack, startBtns });
    $("startCam").addEventListener("click", async () => { await zc.start(); $("stopCam").disabled = !zc.running; });
    $("demoCam").addEventListener("click", () => {
      if (!P.zones.length && cfg.demoZones) { cfg.demoZones.forEach(p => addZone(W0.LQZones.normPoly(p))); }
      demoWall0 = Date.now();
      if (cfg.onDemo) cfg.onDemo(P);
      zc.startDemo(); $("stopCam").disabled = false;
    });
    $("stopCam").addEventListener("click", () => { zc.stop(); $("stopCam").disabled = true; P.saveDay(true); });
    $("drawZone").addEventListener("click", () => { ed.begin(); });
    $("finishZone").addEventListener("click", () => { if (!ed.finish() && drawMsg) drawMsg.textContent = T("zc.draw.need3", "ต้องมีอย่างน้อย 3 จุด"); });
    $("cancelZone").addEventListener("click", () => ed.cancel());
    $("rectZone").addEventListener("click", () => {
      const k = P.zones.length % 4, r = { x: 0.08 + (k % 2) * 0.46, y: 0.12 + (k >> 1) * 0.44, w: 0.4, h: 0.38 };
      addZone(W0.LQZones.rectPoly(r));
    });
    if ($("exportCsv")) $("exportCsv").addEventListener("click", () => downloadCsv(`${cfg.csvName || ns}-${dayKey()}.csv`, cfg.csv(P)));
    if ($("clearData")) $("clearData").addEventListener("click", () => {
      if (!confirm(T("zc.clear.q", "ลบสถิติวันนี้และรายการแจ้งเตือนทั้งหมดในเครื่องนี้? (โซนและการตั้งค่ายังอยู่)"))) return;
      Object.keys(localStorage).filter(k => k.startsWith(ns + "-day-")).forEach(k => store.del(k));
      P.log.clear(); P.day = Object.assign(cfg.newDay(), { date: dayKey() });
      if (cfg.onClear) cfg.onClear(P);
      render();
    });
    if ($("printNotice")) $("printNotice").addEventListener("click", () => print());
    W0.addEventListener("pagehide", () => P.saveDay(true));
    W0.addEventListener("lq-lang", () => { renderZones(); P.log.render(); render(); zc.repaint(); });
    renderZones(); P.log.render(); render(); zc.repaint();
    W0.__LQZ = P;
    return P;
  }

  W0.LQZoneCam = { T, create, polyEditor, store, dayKey, fmtMin, fmtMS, fmtClock, downloadCsv, beep, gate, createLog, page, COLORS };
})(window);
