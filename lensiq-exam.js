/* lensiq-exam.js — LQExam: pure logic for LENSIQ Exam (exam-lab.html, exam-hall.html, exam-dashboard.html).
 * Browser: window.LQExam · Node: require("./lensiq-exam.js"). No DOM, no network, no images: only numbers and short ids.
 *
 * PRINCIPLE: the system FLAGS observations for a person (the invigilator) to go and check. It never decides misconduct,
 * never ends an exam, never shows a "cheating score" to a candidate, never infers emotion (EU AI Act Art 5(1)(f)) and
 * never identifies a person (no face matching: detection and head pose only). See docs/EXAM.md.
 *
 * API
 *   SIGNALS {id: {src:"lab"|"hall"|"browser"|"room", lvl, w, alone?, th}}   th = Thai label (key exam.sig.<id>)
 *   LEVELS ["ok","info","watch","check"] · LEVEL_TH {lvl: Thai} (key exam.lvl.<lvl>) · POINTS {info, watch, check}
 *   createGate({k=1, n=1, stages=[{ms, lvl}], cooldownMs}) -> {push(t, on) -> {active, dur, fire:[{lvl, stage}], ended, held}, reset()}
 *     debounce (k of the last n samples), persistence (stage.ms of continuous activity) and a cooldown per stage
 *     (a stage that fired less than cooldownMs ago is "held": counted, not emitted). One gate per seat + signal.
 *   createRisk({halfLifeMs=180000, aloneWindowMs=120000}) -> {add(seat, t, pts, {alone}), score(seat, t), level(seat, t),
 *     series(seat, t, {spanMs, n}), seats()}   exponentially decaying risk; "alone:false" contributions (gaze, head toward
 *     neighbour) count only while the seat has another contribution in aloneWindowMs, so they can never raise a flag alone
 *   levelOf(score) -> "ok"|"info"|"watch"|"check"   info ≥ 0.15, watch ≥ 1, check ≥ 2.5
 *   createRoomMonitor({windowMs=3000, frac=0.4, min=3, holdMs=20000}) -> {note(seat, t, nSeats) -> started:boolean, suppressed(t), mute(t, ms)}
 *     many seats moving at once (an announcement, noise, everyone standing) -> per-seat alerts suppressed for holdMs
 *   DEFAULTS (lab + hall thresholds) · PROFILE_KEYS · cleanProfile(p) · applyAccommodation(cfg, profile) -> cfg
 *   poseFrom68(pts) -> {yaw, pitchN, mar, ipd}   yaw in approx. degrees; pitchN = nose position between eyes and chin
 *   pitchDeg(pitchN, base) -> approx. degrees down vs the calibrated baseline · synth68(box, yawDeg, pitchDeg, mar) (test seam)
 *   calibrate(samples) -> {ok, yaw0, pitchN0, n, onePct, reason}
 *   lightingVerdict(stats) -> {ok, code:"ok"|"dark"|"bright"|"backlight"|"blur"|"flat", score}   (stats = LQSite.frameStats())
 *   createFrozen({ms=4000, eps=0.6}) -> {push(t, thumb) -> boolean}   identical thumbnails for ms = a frozen / looped feed
 *   isVirtualCamLabel(label) -> boolean   OBS / ManyCam / "virtual" camera names
 *   createLabMonitor(cfg?) -> {setBaseline(b), frame(t, obs), browser(t, type, data), cfg}   -> events [{sig, lvl, t, dur?, n?, local?}]
 *     lvl "prompt" = a gentle message to the candidate only (never sent); lvl "setup" = poor camera/light: "fix setup", not an alert
 *   pointInPoly(x, y, poly) · polyArea(poly) · polyCentroid(poly) · boxFracInPoly(box, poly, g=8) · seatOf(pt, seats)
 *   gridSeats({x, y, w, h}, rows, cols, ids?) -> [{id, poly}]
 *   createHallMonitor(seats, cfg?) -> {frame(t, {persons, phones}, {walk, elapsedMin}), mute(t, ms), state()} -> events
 *   cleanMsg(msg) -> {ok, msg}|{ok:false, error}   strict allowlist for everything sent between pages (no images, no names)
 *   createBoard({room}) -> dashboard state: ingest(msg, now), act(id, action, {who, note}, now), verdict(id, right), mute(now, ms),
 *     setProfile(seat, p), levels(now), queue(now), log(), summary(), precision(), csv(labels), spark(seat, now), toJSON(), load(json),
 *     keepClip(id, who, now) -> keep messages · clipsOf(alert) · clipState(alert) -> {st, days, t, n}|null   (opt-in evidence clip:
 *     "clip" status messages from the camera device; the video never leaves that device — lensiq-exam-clip.js)
 *   wilson(x, n) · median(a) · fmtDur(ms)
 */
(/** @param {any} root @param {() => any} factory */ function (root, factory) {
  const m = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = m; else root.LQExam = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const fin = v => typeof v === "number" && Number.isFinite(v);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- signals and levels ---------- */
  const SIGNALS = Object.freeze({
    noface: { src: "lab", lvl: "watch", w: 1, th: "ไม่เห็นใบหน้าในกล้อง" },
    multiface: { src: "lab", lvl: "check", w: 1, th: "เห็นมากกว่าหนึ่งใบหน้า" },
    headturn: { src: "lab", lvl: "info", w: 0.6, th: "หันศีรษะออกจากจอนาน" },
    phone: { src: "lab", lvl: "check", w: 1, th: "อาจมีโทรศัพท์ในภาพ" },
    object: { src: "lab", lvl: "watch", w: 0.8, th: "อาจมีหนังสือ แล็ปท็อป หรือจออื่นในภาพ" },
    mouth: { src: "lab", lvl: "info", w: 0.3, th: "ปากขยับต่อเนื่อง (ไม่มีการฟังเสียง)" },
    gaze: { src: "lab", lvl: "info", w: 0.2, alone: false, th: "สายตาออกนอกจอ (น้ำหนักต่ำ)" },
    frozen: { src: "lab", lvl: "watch", w: 0.8, th: "ภาพจากกล้องค้างหรือวนซ้ำ" },
    virtualcam: { src: "browser", lvl: "watch", w: 0.8, th: "กล้องอาจเป็นกล้องเสมือน" },
    away: { src: "browser", lvl: "info", w: 0.4, th: "สลับออกจากหน้าข้อสอบ" },
    fsexit: { src: "browser", lvl: "watch", w: 0.6, th: "ออกจากโหมดเต็มจอ" },
    clip: { src: "browser", lvl: "info", w: 0.2, th: "คัดลอก ตัด หรือคลิกขวา" },
    paste: { src: "browser", lvl: "info", w: 0.3, th: "วางข้อความ" },
    print: { src: "browser", lvl: "info", w: 0.3, th: "สั่งพิมพ์หรือกดปุ่มจับภาพหน้าจอ" },
    screens: { src: "browser", lvl: "watch", w: 0.8, th: "ต่อจอภาพที่สอง" },
    device: { src: "browser", lvl: "info", w: 0.2, th: "อุปกรณ์กล้องหรือไมค์เปลี่ยน" },
    net: { src: "browser", lvl: "info", w: 0.1, th: "อินเทอร์เน็ตหลุดหรือกลับมา" },
    reload: { src: "browser", lvl: "info", w: 0.2, th: "โหลดหน้าข้อสอบใหม่" },
    setup: { src: "room", lvl: "setup", w: 0, th: "ภาพไม่ชัดหรือแสงไม่พอ — ปรับการติดตั้ง ไม่ใช่การแจ้งเตือน" },
    empty: { src: "hall", lvl: "info", w: 0.2, th: "ที่นั่งว่าง" },
    back: { src: "hall", lvl: "info", w: 0, th: "กลับมาที่นั่ง" },
    early: { src: "hall", lvl: "watch", w: 0.6, th: "ออกจากที่นั่งก่อนเวลาขั้นต่ำ" },
    extra: { src: "hall", lvl: "watch", w: 1, th: "มีคนเพิ่มที่ที่นั่งนี้" },
    aisle: { src: "hall", lvl: "watch", w: 0.6, th: "มีคนยืนในทางเดินหรือระหว่างที่นั่ง" },
    lean: { src: "hall", lvl: "watch", w: 0.8, th: "เอนตัวเข้าเขตที่นั่งข้างเคียง" },
    neighbour: { src: "hall", lvl: "info", w: 0.3, alone: false, th: "หันศีรษะไปทางที่นั่งข้างเคียง (กล้องหน้าเท่านั้น)" },
    room: { src: "room", lvl: "info", w: 0, th: "หลายที่นั่งขยับพร้อมกัน — พักการแจ้งเตือนรายที่นั่งชั่วคราว" },
    roommute: { src: "room", lvl: "info", w: 0, th: "ผู้คุมสอบพักการแจ้งเตือนทั้งห้อง 60 วินาที" },
    note: { src: "room", lvl: "info", w: 0, th: "บันทึกของผู้คุมสอบ" }
  });
  const LEVELS = ["ok", "info", "watch", "check"];
  const LEVEL_TH = Object.freeze({ ok: "ปกติ", info: "ข้อมูล", watch: "เฝ้าดู", check: "ไปตรวจ", setup: "ปรับการติดตั้ง", prompt: "ข้อความถึงผู้สอบ" });
  const POINTS = Object.freeze({ info: 0.3, watch: 1, check: 2.5 });
  const rank = l => Math.max(0, LEVELS.indexOf(l));
  const maxLvl = (a, b) => (rank(b) > rank(a) ? b : a);
  function levelOf(s) { return s >= 2.5 ? "check" : s >= 1 ? "watch" : s >= 0.15 ? "info" : "ok"; }

  /* ---------- debounce / persistence / cooldown gate ---------- */
  /** @param {{k?: number, n?: number, stages?: {ms: number, lvl: string}[], cooldownMs?: number}} [o] */
  function createGate({ k = 1, n = 1, stages = [{ ms: 0, lvl: "info" }], cooldownMs = 90000 } = {}) {
    let buf = [], since = null, fired = new Set(), any = false;
    /** @type {Object<number, number>} */ const last = {};
    let held = 0;
    function push(t, on) {
      buf.push(on ? 1 : 0); if (buf.length > n) buf.shift();
      const active = buf.reduce((a, b) => a + b, 0) >= k;
      const out = { active, dur: 0, fire: [], ended: null, held: 0 };
      if (active) {
        if (since == null) since = t;
        out.dur = t - since;
        stages.forEach((s, i) => {
          if (fired.has(i) || out.dur < s.ms) return;
          fired.add(i);
          if (last[i] != null && t - last[i] < cooldownMs) { held++; out.held++; return; }
          last[i] = t; any = true; out.fire.push({ lvl: s.lvl, stage: i });
        });
      } else if (since != null) {
        out.ended = { dur: t - since, fired: any };
        since = null; fired = new Set(); any = false;
      }
      return out;
    }
    function reset() { buf = []; since = null; fired = new Set(); any = false; }
    return { push, reset, get held() { return held; }, get since() { return since; } };
  }

  /* ---------- decaying risk per seat ---------- */
  function createRisk({ halfLifeMs = 180000, aloneWindowMs = 120000 } = {}) {
    /** @type {Map<string, {t: number, pts: number, alone: boolean}[]>} */ const by = new Map();
    const dec = (pts, dt) => pts * Math.pow(0.5, dt / halfLifeMs);
    function add(seat, t, pts, { alone = true } = {}) {
      if (!fin(pts) || pts <= 0) return;
      const a = by.get(seat) || []; a.push({ t, pts, alone }); by.set(seat, a);
      while (a.length > 400) a.shift();
    }
    function score(seat, t) {
      const a = by.get(seat); if (!a) return 0;
      let s = 0, low = 0, other = false;
      for (const c of a) {
        if (c.t > t) continue;
        const v = dec(c.pts, t - c.t);
        if (c.alone) { s += v; if (t - c.t <= aloneWindowMs) other = true; } else low += v;
      }
      return s + (other ? low : 0);
    }
    function series(seat, t, { spanMs = 600000, n = 30 } = {}) {
      const out = [];
      for (let i = 0; i < n; i++) out.push(score(seat, t - spanMs + (spanMs * i) / (n - 1)));
      return out;
    }
    return { add, score, level: (seat, t) => levelOf(score(seat, t)), series, seats: () => [...by.keys()], clear: () => by.clear() };
  }

  /* ---------- room-level anomaly suppression ---------- */
  function createRoomMonitor({ windowMs = 3000, frac = 0.4, min = 3, holdMs = 20000 } = {}) {
    let notes = [], until = -Infinity;
    function note(seat, t, nSeats) {
      notes = notes.filter(x => t - x.t <= windowMs && x.seat !== seat); notes.push({ seat, t });
      const need = Math.max(min, Math.ceil(frac * Math.max(1, nSeats || 0)));
      if (notes.length >= need && t >= until) { until = t + holdMs; notes = []; return true; }
      return false;
    }
    return { note, suppressed: t => t < until, mute(t, ms = 60000) { until = Math.max(until, t + ms); }, get until() { return until; } };
  }

  /* ---------- thresholds + accommodation profiles ---------- */
  const DEFAULTS = Object.freeze({
    // lab (Mode B)
    noFacePromptMs: 5000, noFaceWatchMs: 10000, noFaceCheckMs: 30000,
    multiK: 3, multiN: 5, multiMs: 3000,
    yawDeg: 35, pitchDeg: 25, turnMs: 8000, turnRepeat: 3, turnWindowMs: 300000,
    phoneConf: 0.6, phoneK: 3, phoneN: 5, objConf: 0.5, allowBook: false, allowLaptop: false, allowScreen: false,
    mouth: true, mouthStd: 0.06, mouthMs: 5000, gaze: false,
    blurInfoMs: 2000, hiddenWatchMs: 5000, pasteWatchChars: 50, setupMs: 5000,
    cooldownMs: 90000,
    // hall (Mode A)
    emptyMs: 20000, earlyMs: 180000, minLeaveMin: 30, extraWatchMs: 5000, extraCheckMs: 15000, aisleMs: 8000,
    leanFrac: 0.25, leanMs: 4000, hallPhoneConf: 0.5, breaks: false,
    room: { windowMs: 3000, frac: 0.4, min: 3, holdMs: 20000 }
  });
  const PROFILE_KEYS = ["gazeOff", "noFaceX", "readAloud", "breaks", "ticX"];
  /** institution-set accommodations (no diagnosis is stored or shown): gazeOff, noFaceX 1–3, readAloud, breaks, ticX 1–2 */
  function cleanProfile(p) {
    p = p && typeof p === "object" ? p : {};
    return { gazeOff: !!p.gazeOff, noFaceX: clamp(+p.noFaceX || 1, 1, 3), readAloud: !!p.readAloud, breaks: !!p.breaks, ticX: clamp(+p.ticX || 1, 1, 2) };
  }
  const isPlainProfile = p => { const c = cleanProfile(p); return !c.gazeOff && c.noFaceX === 1 && !c.readAloud && !c.breaks && c.ticX === 1; };
  function applyAccommodation(cfg, profile) {
    const c = Object.assign({}, DEFAULTS, cfg || {}), p = cleanProfile(profile);
    c.noFacePromptMs *= p.noFaceX; c.noFaceWatchMs *= p.noFaceX; c.noFaceCheckMs *= p.noFaceX;
    if (p.gazeOff) c.gaze = false;
    if (p.readAloud) c.mouth = false;
    if (p.breaks) { c.breaks = true; c.emptyMs *= 3; c.noFaceCheckMs = Infinity; }
    if (p.ticX > 1) { c.turnMs *= p.ticX; c.turnRepeat = Math.ceil(c.turnRepeat * p.ticX); c.yawDeg += 10 * (p.ticX - 1); c.pitchDeg += 10 * (p.ticX - 1); c.mouthMs *= p.ticX; c.leanMs *= p.ticX; }
    c.profile = p;
    return c;
  }

  /* ---------- head pose from face-api 68 landmarks ---------- */
  const P = (pts, i) => { const p = pts[i]; return p ? { x: p.x != null ? p.x : p[0], y: p.y != null ? p.y : p[1] } : { x: 0, y: 0 }; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const NOSE_R = 0.9; // nose-tip depth / half face width (cylinder head model) -> yaw = asin(r / NOSE_R)
  const PITCH_K = 120; // degrees per unit of pitchN change (a proxy; thresholds are applied relative to the calibrated baseline)
  function poseFrom68(pts) {
    if (!pts || pts.length < 68) return null;
    const l = P(pts, 0), r = P(pts, 16), nose = P(pts, 30), eL = P(pts, 36), eR = P(pts, 45), chin = P(pts, 8);
    const dl = Math.abs(nose.x - l.x), dr = Math.abs(r.x - nose.x), rr = (dl - dr) / ((dl + dr) || 1);
    const yaw = Math.asin(clamp(rr / NOSE_R, -1, 1)) * 180 / Math.PI;
    const em = { x: (eL.x + eR.x) / 2, y: (eL.y + eR.y) / 2 }, span = chin.y - em.y;
    const pitchN = span > 0 ? (nose.y - em.y) / span : 0.45;
    const w = dist(P(pts, 60), P(pts, 64)) || 1;
    const mar = (dist(P(pts, 61), P(pts, 67)) + dist(P(pts, 62), P(pts, 66)) + dist(P(pts, 63), P(pts, 65))) / (2 * w);
    return { yaw, pitchN, mar, ipd: dist(eL, eR) };
  }
  const pitchDeg = (pitchN, base) => (pitchN - (fin(base) ? base : 0.45)) * PITCH_K;
  /** 68 points inside box {x,y,w,h} (px) for a given yaw / pitch (degrees) / mouth ratio — inverse of poseFrom68 (test seam) */
  function synth68(box, yawDeg = 0, pitchDegV = 0, mar = 0.05) {
    const { x, y, w, h } = box, cx = x + w / 2, pts = Array.from({ length: 68 }, () => ({ x: cx, y: y + h / 2 }));
    const rr = Math.sin(clamp(yawDeg, -80, 80) * Math.PI / 180) * NOSE_R, half = w / 2;
    pts[0] = { x, y: y + 0.4 * h }; pts[16] = { x: x + w, y: y + 0.4 * h };
    const eyeY = y + 0.38 * h, chinY = y + h, pN = 0.45 + pitchDegV / PITCH_K;
    pts[30] = { x: x + half + rr * half, y: eyeY + pN * (chinY - eyeY) };
    pts[36] = { x: x + 0.3 * w, y: eyeY }; pts[45] = { x: x + 0.7 * w, y: eyeY }; pts[8] = { x: cx, y: chinY };
    const mw = 0.3 * w, my = y + 0.8 * h, gap = mar * mw; // three vertical gaps of `gap` -> mar = 3 gap / (2 mw)
    pts[60] = { x: cx - mw / 2, y: my }; pts[64] = { x: cx + mw / 2, y: my };
    [[61, 67], [62, 66], [63, 65]].forEach(([a, b], i) => { const px = cx + (i - 1) * mw / 4; pts[a] = { x: px, y: my - gap / 1.5 / 2 }; pts[b] = { x: px, y: my + gap / 1.5 / 2 }; });
    return pts;
  }
  function median(a) { const s = a.filter(fin).sort((p, q) => p - q); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  /** samples = [{faces: n, yaw?, pitchN?}] collected during the calibration period */
  function calibrate(samples) {
    const all = (samples || []).length, one = (samples || []).filter(s => s && s.faces === 1 && fin(s.yaw) && fin(s.pitchN));
    const onePct = all ? one.length / all : 0;
    if (all < 5) return { ok: false, yaw0: 0, pitchN0: 0.45, n: one.length, onePct, reason: "short" };
    if (onePct < 0.6) return { ok: false, yaw0: 0, pitchN0: 0.45, n: one.length, onePct, reason: "face" };
    return { ok: true, yaw0: median(one.map(s => s.yaw)), pitchN0: median(one.map(s => s.pitchN)), n: one.length, onePct, reason: null };
  }

  /* ---------- camera quality ---------- */
  /** thresholds follow LQSite.HEALTH (store-camera benchmark), relaxed for a desk webcam a face fills; a heuristic —
      on-site checks decide (docs/EXAM.md) */
  function lightingVerdict(st) {
    if (!st || !fin(st.mean)) return { ok: false, code: "flat", score: 0 };
    const p50 = fin(st.p50) ? st.p50 : st.mean;
    let code = "ok";
    if (p50 < 30 || st.mean < 40) code = "dark";
    else if (st.clip > 0.3 || st.mean > 230) code = "bright";
    else if (st.cellMax >= 225 && st.clip >= 0.05 && p50 < 80) code = "backlight";
    else if (fin(st.contrast) && st.contrast < 30) code = "flat";
    else if (fin(st.sharp) && st.sharp < 2.5) code = "blur";
    const exp = 1 - Math.min(1, Math.abs(p50 - 128) / 110);
    const score = Math.round(100 * clamp(code === "ok" ? 0.55 + 0.45 * exp : 0.45 * exp, 0, 1));
    return { ok: code === "ok", code, score };
  }
  function createFrozen({ ms = 4000, eps = 0.6 } = {}) {
    let prev = null, since = null;
    return {
      push(t, thumb) {
        if (!thumb || !thumb.length) return false;
        if (prev && prev.length === thumb.length) {
          let d = 0; for (let i = 0; i < thumb.length; i++) d += Math.abs(thumb[i] - prev[i]);
          if (d / thumb.length < eps) { if (since == null) since = t; } else since = null;
        }
        prev = Float32Array.from(thumb);
        return since != null && t - since >= ms;
      },
      reset() { prev = null; since = null; }
    };
  }
  const isVirtualCamLabel = l => /\b(obs|manycam|virtual|snap ?camera|xsplit|droidcam|epoccam|camtwist|mmhmm|vcam|e2esoft|splitcam|youcam)\b/i.test(String(l || ""));

  /* ---------- Mode B: candidate page monitor ---------- */
  function createLabMonitor(cfg0) {
    const cfg = Object.assign({}, DEFAULTS, cfg0 || {});
    let base = { ok: false, yaw0: 0, pitchN0: 0.45 };
    const G = {
      noface: createGate({ k: 2, n: 3, stages: [{ ms: cfg.noFacePromptMs, lvl: "prompt" }, { ms: cfg.noFaceWatchMs, lvl: "watch" }, { ms: cfg.noFaceCheckMs, lvl: "check" }], cooldownMs: cfg.cooldownMs }),
      multiface: createGate({ k: cfg.multiK, n: cfg.multiN, stages: [{ ms: cfg.multiMs, lvl: "check" }], cooldownMs: cfg.cooldownMs }),
      headturn: createGate({ k: 3, n: 5, stages: [{ ms: cfg.turnMs, lvl: "info" }], cooldownMs: 0 }),
      phone: createGate({ k: cfg.phoneK, n: cfg.phoneN, stages: [{ ms: 0, lvl: "check" }], cooldownMs: cfg.cooldownMs }),
      object: createGate({ k: 3, n: 5, stages: [{ ms: 0, lvl: "watch" }], cooldownMs: cfg.cooldownMs }),
      mouth: createGate({ k: 3, n: 5, stages: [{ ms: cfg.mouthMs, lvl: "info" }], cooldownMs: 120000 }),
      setup: createGate({ k: 3, n: 5, stages: [{ ms: cfg.setupMs, lvl: "setup" }], cooldownMs: 60000 })
    };
    let turns = [], lastTurnWatch = -Infinity, mars = [], blurAt = null, hiddenAt = null, offAt = null;
    /** @type {Object<string, number>} */ const lastB = {};
    function frame(t, obs) {
      obs = obs || {};
      const faces = obs.faces || [], objs = obs.objects || [], q = obs.quality || { ok: true }, ev = [];
      const push = (sig, r, extra) => { for (const f of r.fire) ev.push(Object.assign({ sig, lvl: f.lvl, t, dur: Math.round(r.dur) }, extra || {})); };
      push("setup", G.setup.push(t, !q.ok), { code: q.code });
      const poor = !q.ok;
      // no face: poor light / camera -> "fix setup", never an alert
      if (!poor) {
        const r = G.noface.push(t, faces.length === 0);
        for (const f of r.fire) ev.push({ sig: "noface", lvl: f.lvl, t, dur: Math.round(r.dur), local: f.lvl === "prompt" || undefined });
        if (r.ended && r.ended.fired) ev.push({ sig: "noface", lvl: "end", t, dur: Math.round(r.ended.dur), local: true });
      } else G.noface.reset();
      push("multiface", G.multiface.push(t, faces.length >= 2), { n: faces.length });
      // head turned away vs the calibrated baseline (only when calibration succeeded, one face, good light)
      const f0 = faces.length === 1 ? faces[0] : null;
      if (base.ok && !poor) {
        const turned = !!f0 && fin(f0.yaw) && (Math.abs(f0.yaw - base.yaw0) > cfg.yawDeg || pitchDeg(f0.pitchN, base.pitchN0) > cfg.pitchDeg);
        const r = G.headturn.push(t, turned);
        if (r.fire.length) {
          turns = turns.filter(x => t - x <= cfg.turnWindowMs); turns.push(t);
          ev.push({ sig: "headturn", lvl: "info", t, dur: Math.round(r.dur), n: turns.length });
          if (turns.length >= cfg.turnRepeat && t - lastTurnWatch >= cfg.cooldownMs) { lastTurnWatch = t; ev.push({ sig: "headturn", lvl: "watch", t, n: turns.length }); }
        }
      }
      // mouth movement (Info only, no audio) — off with the read-aloud accommodation
      if (cfg.mouth && f0 && fin(f0.mar) && !poor) {
        mars = mars.filter(m => t - m.t <= 3000); mars.push({ t, v: f0.mar });
        const mean = mars.reduce((a, m) => a + m.v, 0) / mars.length;
        const sd = Math.sqrt(mars.reduce((a, m) => a + (m.v - mean) * (m.v - mean), 0) / mars.length);
        push("mouth", G.mouth.push(t, mars.length >= 4 && sd > cfg.mouthStd));
      }
      // objects: only on frames where the object detector ran (obs.objects given) — it runs at a lower rate than faces
      if (obs.objects) {
        push("phone", G.phone.push(t, objs.some(o => o.cls === "phone" && o.score >= cfg.phoneConf)));
        const notAllowed = o => o.score >= cfg.objConf && ((o.cls === "book" && !cfg.allowBook) || (o.cls === "laptop" && !cfg.allowLaptop) || (o.cls === "screen" && !cfg.allowScreen));
        const bad = objs.filter(notAllowed);
        push("object", G.object.push(t, bad.length > 0), bad.length ? { what: bad[0].cls } : undefined);
      }
      if (cfg.gaze && obs.gazeOff) ev.push({ sig: "gaze", lvl: "info", t });
      return ev;
    }
    /** browser signals: blur/focus, hidden/visible, fsexit, copy/cut/contextmenu, paste {len}, print, printscreen,
        screens {extended}, devicechange, offline/online, reload, virtualcam, frozen */
    function browser(t, type, d) {
      d = d || {};
      const once = (sig, lvl, gap, extra) => {
        const key = sig + ":" + lvl;
        if (lastB[key] != null && t - lastB[key] < gap) return [];
        lastB[key] = t; return [Object.assign({ sig, lvl, t }, extra || {})];
      };
      switch (type) {
        case "blur": blurAt = t; return [];
        case "focus": { if (blurAt == null) return []; const dur = t - blurAt; blurAt = null; return hiddenAt != null || dur < 300 ? [] : [{ sig: "away", lvl: "info", t, dur }]; }
        case "hidden": hiddenAt = t; return [];
        case "visible": {
          if (hiddenAt == null) return [];
          const dur = t - hiddenAt; hiddenAt = null; blurAt = null;
          return [{ sig: "away", lvl: dur >= cfg.hiddenWatchMs ? "watch" : "info", t, dur }];
        }
        case "fsexit": return once("fsexit", "watch", 30000).map(e => Object.assign(e, { prompt: true }));
        case "copy": case "cut": case "contextmenu": return once("clip", "info", 10000, { what: type });
        case "paste": return (d.len || 0) > cfg.pasteWatchChars ? once("paste", "watch", 30000, { n: d.len | 0 }) : once("paste", "info", 10000, { n: d.len | 0 });
        case "print": case "printscreen": return once("print", "info", 10000, { what: type });
        case "screens": return d.extended ? once("screens", "watch", 300000) : [];
        case "devicechange": return once("device", "info", 10000);
        case "offline": offAt = t; return once("net", "info", 5000, { what: "offline" });
        case "online": { const dur = offAt != null ? t - offAt : 0; offAt = null; return once("net", "info", 5000, { what: "online", dur }); }
        case "reload": return [{ sig: "reload", lvl: "info", t }];
        case "virtualcam": return once("virtualcam", "watch", 600000);
        case "frozen": return once("frozen", "watch", 60000);
        default: return [];
      }
    }
    return { cfg, frame, browser, setBaseline(b) { base = Object.assign({ ok: false, yaw0: 0, pitchN0: 0.45 }, b || {}); }, get baseline() { return base; } };
  }

  /* ---------- Mode A: hall geometry ---------- */
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function polyArea(poly) { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]); return Math.abs(a / 2); }
  function polyCentroid(poly) { let x = 0, y = 0; for (const p of poly) { x += p[0]; y += p[1]; } return [x / (poly.length || 1), y / (poly.length || 1)]; }
  /** fraction of box {x,y,w,h} inside poly, sampled on a g×g grid of cell centres */
  function boxFracInPoly(b, poly, g = 8) {
    let n = 0;
    for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) if (pointInPoly(b.x + ((i + 0.5) / g) * b.w, b.y + ((j + 0.5) / g) * b.h, poly)) n++;
    return n / (g * g);
  }
  /** seat whose polygon contains pt; overlapping polygons -> nearest centroid */
  function seatOf(pt, seats) {
    let best = null, bd = Infinity;
    for (const s of seats) {
      if (!pointInPoly(pt[0], pt[1], s.poly)) continue;
      const c = polyCentroid(s.poly), d = Math.hypot(c[0] - pt[0], c[1] - pt[1]);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  const SEAT_RE = /^[A-Za-z0-9_.-]{1,16}$/;
  function gridSeats(r, rows, cols, ids) {
    const out = [], gw = r.w / cols, gh = r.h / rows;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const x = r.x + j * gw, y = r.y + i * gh, k = i * cols + j;
      const id = ids && ids[k] != null ? String(ids[k]) : String(k + 1);
      out.push({ id, poly: [[x, y], [x + gw, y], [x + gw, y + gh], [x, y + gh]].map(p => p.map(v => Math.round(v * 1e4) / 1e4)) });
    }
    return out;
  }
  function cleanSeats(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).filter(s => s && SEAT_RE.test(String(s.id)) && Array.isArray(s.poly) && s.poly.length >= 3 && s.poly.length <= 24 &&
      s.poly.every(p => Array.isArray(p) && fin(p[0]) && fin(p[1]) && p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1) && !seen.has(String(s.id)) && seen.add(String(s.id)))
      .map(s => ({ id: String(s.id), poly: s.poly.map(p => [+p[0], +p[1]]) }));
  }

  function createHallMonitor(seats0, cfg0) {
    const cfg = Object.assign({}, DEFAULTS, cfg0 || {}), seats = cleanSeats(seats0);
    const room = createRoomMonitor(cfg.room || DEFAULTS.room);
    /** @type {Object<string, any>} */ const S = {};
    for (const s of seats) {
      const c = cfg.profiles && cfg.profiles[s.id] ? applyAccommodation(cfg, cfg.profiles[s.id]) : cfg;
      S[s.id] = {
        cfg: c, seen: false, emptySince: null, early: false,
        empty: createGate({ k: 3, n: 4, stages: [{ ms: c.emptyMs, lvl: "info" }], cooldownMs: 0 }),
        extra: createGate({ k: 3, n: 5, stages: [{ ms: cfg.extraWatchMs, lvl: "watch" }, { ms: cfg.extraCheckMs, lvl: "check" }], cooldownMs: cfg.cooldownMs }),
        lean: createGate({ k: 3, n: 5, stages: [{ ms: c.leanMs, lvl: "watch" }], cooldownMs: cfg.cooldownMs }),
        phone: createGate({ k: cfg.phoneK, n: cfg.phoneN, stages: [{ ms: 0, lvl: "check" }], cooldownMs: cfg.cooldownMs }),
        last: { n: 0, lean: 0 }
      };
    }
    // neighbours = seats in the same row (centroids within 0.6 × this seat's height): leaning is sideways; the row in
    // front / behind overlaps a seated person's box through perspective and would flag everyone
    const hOf = poly => { const ys = poly.map(p => p[1]); return Math.max(...ys) - Math.min(...ys); };
    const NB = {};
    for (const s of seats) { const c = polyCentroid(s.poly), h = hOf(s.poly); NB[s.id] = seats.filter(z => z !== s && Math.abs(polyCentroid(z.poly)[1] - c[1]) < 0.6 * h); }
    const aisle = createGate({ k: 3, n: 5, stages: [{ ms: cfg.aisleMs, lvl: "watch" }], cooldownMs: cfg.cooldownMs });
    let suppressedN = 0;
    /** persons/phones: [{x,y,w,h,score}] normalised to the frame */
    function frame(t, dets, o) {
      dets = dets || {}; o = o || {};
      const persons = dets.persons || [], phones = (dets.phones || []).filter(p => p.score >= cfg.hallPhoneConf), ev = [];
      const per = {}; seats.forEach(s => { per[s.id] = { n: 0, lean: 0, phone: false }; });
      let outside = 0;
      for (const b of persons) {
        const s = seatOf([b.x + b.w / 2, b.y + b.h / 2], seats);
        if (!s) { outside++; continue; }
        per[s.id].n++;
        let lean = 0;
        for (const z of NB[s.id]) lean = Math.max(lean, boxFracInPoly(b, z.poly));
        per[s.id].lean = Math.max(per[s.id].lean, lean);
      }
      for (const p of phones) { const s = seatOf([p.x + p.w / 2, p.y + p.h / 2], seats); if (s) per[s.id].phone = true; }
      // room-level anomaly: many seats change at once (occupancy or lean) -> suppress per-seat alerts for a while
      let roomStart = false;
      for (const s of seats) {
        const st = S[s.id], cur = per[s.id], moved = (cur.n > 0) !== (st.last.n > 0) || (cur.lean > cfg.leanFrac) !== (st.last.lean > cfg.leanFrac);
        if (moved && st.seen && room.note(s.id, t, seats.length)) roomStart = true;
        st.last = { n: cur.n, lean: cur.lean };
      }
      if (roomStart) ev.push({ sig: "room", lvl: "info", t, seat: "" });
      const quiet = room.suppressed(t);
      const emit = (seat, sig, lvl, extra) => {
        if (quiet && sig !== "phone" && sig !== "back" && sig !== "empty") { suppressedN++; return; }
        ev.push(Object.assign({ seat, sig, lvl, t }, extra || {}));
      };
      for (const s of seats) {
        const st = S[s.id], cur = per[s.id], c = st.cfg;
        if (cur.n > 0) st.seen = true;
        if (st.seen) {
          const r = st.empty.push(t, cur.n === 0);
          if (r.active && st.emptySince == null) st.emptySince = t - r.dur;
          for (const f of r.fire) emit(s.id, "empty", f.lvl, { dur: Math.round(r.dur) });
          if (r.active && !st.early && !c.breaks && fin(o.elapsedMin) && o.elapsedMin < cfg.minLeaveMin && r.dur >= cfg.earlyMs) { st.early = true; emit(s.id, "early", "watch", { dur: Math.round(r.dur) }); }
          if (r.ended) { if (r.ended.fired) emit(s.id, "back", "info", { dur: Math.round(r.ended.dur) }); st.emptySince = null; }
        }
        const rx = st.extra.push(t, cur.n >= 2 && !o.walk);
        for (const f of rx.fire) emit(s.id, "extra", f.lvl, { n: cur.n, dur: Math.round(rx.dur) });
        const rl = st.lean.push(t, cur.n >= 1 && cur.lean > cfg.leanFrac);
        for (const f of rl.fire) emit(s.id, "lean", f.lvl, { dur: Math.round(rl.dur) });
        const rp = st.phone.push(t, cur.phone);
        for (const f of rp.fire) emit(s.id, "phone", f.lvl);
      }
      const ra = aisle.push(t, outside > 0 && !o.walk);
      for (const f of ra.fire) emit("", "aisle", f.lvl, { n: outside, dur: Math.round(ra.dur) });
      return ev;
    }
    function state() {
      const out = {};
      for (const s of seats) out[s.id] = { occupied: S[s.id].last.n > 0, n: S[s.id].last.n, seen: S[s.id].seen, emptySince: S[s.id].emptySince };
      return { seats: out, suppressed: suppressedN, roomUntil: room.until };
    }
    return { seats, cfg, frame, state, mute: (t, ms) => room.mute(t, ms), suppressedUntil: () => room.until };
  }

  /* ---------- messages between pages (BroadcastChannel / relay / file) ---------- */
  const MSG_TYPES = ["ev", "hb", "prof", "mute", "clip", "keep"];
  const ROOM_RE = /^[A-Za-z0-9_.-]{1,24}$/, NODE_RE = /^[a-z0-9]{6,24}$/, CODE_RE = /^[a-z0-9_-]{1,16}$/i;
  const EV_KEYS = ["v", "type", "room", "node", "src", "seat", "sig", "lvl", "t", "dur", "n", "what", "code", "id"];
  const HB_KEYS = ["v", "type", "room", "node", "src", "name", "seats", "t", "fps", "q", "pos", "walk", "clip"];
  // evidence clip (opt-in, docs/EXAM.md): node -> board status of a clip that stays ON the camera device; board -> node "keep"
  const CLIP_KEYS = ["v", "type", "room", "node", "src", "seat", "t", "id", "st", "days"], KEEP_KEYS = ["v", "type", "room", "node", "t", "id"];
  const CLIP_ST = ["pending", "kept", "auto", "gone", "fail", "del"];
  const PROF_KEYS = ["v", "type", "room", "t", "profiles"], MUTE_KEYS = ["v", "type", "room", "t", "ms"];
  const LVL_OK = ["info", "watch", "check", "setup", "end"];
  const shortText = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
  function cleanMsg(m) {
    const bad = e => ({ ok: false, error: e });
    if (!m || typeof m !== "object" || Array.isArray(m)) return bad("not an object");
    let size = 0; try { size = JSON.stringify(m).length; } catch (e) { return bad("not JSON"); }
    if (size > 8192) return bad("too large");
    if (m.v !== 1 || !MSG_TYPES.includes(m.type)) return bad("version/type");
    if (!ROOM_RE.test(String(m.room || ""))) return bad("room");
    if (!fin(m.t) || m.t < 0 || m.t > 1e13) return bad("t");
    const keys = { ev: EV_KEYS, hb: HB_KEYS, prof: PROF_KEYS, mute: MUTE_KEYS, clip: CLIP_KEYS, keep: KEEP_KEYS }[m.type];
    const extra = Object.keys(m).filter(k => !keys.includes(k));
    if (extra.length) return bad("unknown key " + extra[0]); // reject the whole message: nothing unexpected leaves a device
    const out = { v: 1, type: m.type, room: m.room, t: Math.round(m.t) };
    if (m.type === "ev" || m.type === "hb" || m.type === "clip") {
      if (!NODE_RE.test(String(m.node || ""))) return bad("node");
      if (!["lab", "hall"].includes(m.src)) return bad("src");
      out.node = m.node; out.src = m.src;
    }
    if (m.type === "clip" || m.type === "keep") {
      if (m.type === "keep") { if (!NODE_RE.test(String(m.node || ""))) return bad("node"); out.node = m.node; }
      if (!CODE_RE.test(String(m.id || ""))) return bad("id");
      out.id = String(m.id);
    }
    if (m.type === "ev") {
      if (!Object.prototype.hasOwnProperty.call(SIGNALS, m.sig)) return bad("sig");
      if (!LVL_OK.includes(m.lvl)) return bad("lvl");
      const seat = m.seat == null ? "" : String(m.seat);
      if (seat && !SEAT_RE.test(seat)) return bad("seat");
      Object.assign(out, { sig: m.sig, lvl: m.lvl, seat });
      for (const k of ["dur", "n"]) if (m[k] != null) { if (!fin(m[k]) || m[k] < 0 || m[k] > 1e9) return bad(k); out[k] = Math.round(m[k]); }
      for (const k of ["what", "code", "id"]) if (m[k] != null) { if (!CODE_RE.test(String(m[k]))) return bad(k); out[k] = String(m[k]); }
    } else if (m.type === "hb") {
      out.name = shortText(m.name, 40);
      if (m.seats != null) { if (!Array.isArray(m.seats) || m.seats.length > 200 || !m.seats.every(s => SEAT_RE.test(String(s)))) return bad("seats"); out.seats = m.seats.map(String); }
      for (const k of ["fps", "q"]) if (m[k] != null) { if (!fin(m[k]) || m[k] < 0 || m[k] > 1000) return bad(k); out[k] = Math.round(m[k] * 10) / 10; }
      if (m.pos != null) { if (!["front", "back", "side", "desk"].includes(m.pos)) return bad("pos"); out.pos = m.pos; }
      if (m.walk != null) out.walk = !!m.walk;
      if (m.clip != null) out.clip = !!m.clip;
    } else if (m.type === "prof") {
      if (!m.profiles || typeof m.profiles !== "object" || Array.isArray(m.profiles)) return bad("profiles");
      const ps = {}, ids = Object.keys(m.profiles);
      if (ids.length > 200) return bad("profiles");
      for (const id of ids) { if (!SEAT_RE.test(id)) return bad("seat"); ps[id] = cleanProfile(m.profiles[id]); }
      out.profiles = ps;
    } else if (m.type === "mute") {
      if (!fin(m.ms) || m.ms < 0 || m.ms > 600000) return bad("ms");
      out.ms = Math.round(m.ms);
    } else if (m.type === "clip") {
      if (!CLIP_ST.includes(m.st)) return bad("st");
      const seat = m.seat == null ? "" : String(m.seat);
      if (seat && !SEAT_RE.test(seat)) return bad("seat");
      out.seat = seat; out.st = m.st;
      if (m.days != null) { if (!fin(m.days) || m.days < 1 || m.days > 365) return bad("days"); out.days = Math.round(m.days); }
    }
    return { ok: true, msg: out };
  }

  /* ---------- statistics ---------- */
  function wilson(x, n, z = 1.959964) {
    if (!(n > 0)) return { x: x || 0, n: 0, p: null, lo: 0, hi: 1 };
    const p = x / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return { x, n, p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
  }
  function fmtDur(ms) {
    const s = Math.max(0, Math.round((ms || 0) / 1000));
    return s < 60 ? s + " s" : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + " min";
  }

  /* ---------- dashboard board ---------- */
  const ACTIONS = ["going", "noissue", "note", "escalate"];
  function createBoard({ room = "", halfLifeMs = 180000 } = {}) {
    let alerts = [], log = [], seq = 0, muteUntil = -Infinity, suppressed = 0;
    /** @type {Object<string, any>} */ let clips = {}; // "<node>:<event id>" -> {st, t, days?, seat} — the clip itself never leaves the camera device
    /** @type {Object<string, any>} */ let profiles = {};
    /** @type {Object<string, any>} */ let nodes = {};
    const seatsSeen = new Set();
    let risk = createRisk({ halfLifeMs });
    const nextId = () => "a" + (++seq);
    const filtered = (ev) => {
      const p = profiles[ev.seat]; if (!p) return ev;
      if (p.gazeOff && (ev.sig === "gaze" || ev.sig === "neighbour")) return null;
      if (p.readAloud && ev.sig === "mouth") return null;
      if (p.breaks && ev.sig === "early") return Object.assign({}, ev, { lvl: "info" });
      return ev;
    };
    function ingest(msg, now) {
      const c = cleanMsg(msg); if (!c.ok) return { ok: false, error: c.error };
      const m = c.msg; now = fin(now) ? now : m.t;
      if (m.type === "hb") {
        nodes[m.node] = { node: m.node, src: m.src, name: m.name, seats: m.seats || [], fps: m.fps, q: m.q, pos: m.pos, walk: m.walk, clip: m.clip, last: now };
        (m.seats || []).forEach(s => seatsSeen.add(s)); return { ok: true, kind: "hb" };
      }
      if (m.type === "mute") { mute(now, m.ms); return { ok: true, kind: "mute" }; }
      if (m.type === "prof") { profiles = Object.assign({}, profiles, m.profiles); return { ok: true, kind: "prof" }; }
      if (m.type === "keep") return { ok: true, kind: "keep" };
      if (m.type === "clip") { clips[m.node + ":" + m.id] = { st: m.st, t: m.t, seat: m.seat, days: m.days }; return { ok: true, kind: "clip" }; }
      const ev = filtered(m); if (!ev) return { ok: true, kind: "filtered" };
      if (ev.seat) seatsSeen.add(ev.seat);
      if (ev.lvl === "end") return { ok: true, kind: "end" };
      const def = SIGNALS[ev.sig];
      const entry = { id: nextId(), t: ev.t, seat: ev.seat, sig: ev.sig, lvl: ev.lvl, dur: ev.dur, cnt: ev.n, src: ev.src, node: ev.node, what: ev.what };
      if (ev.id) entry.eids = [ev.id];
      if (ev.lvl === "setup" || def.w === 0) { log.push(Object.assign(entry, { kind: ev.lvl === "setup" ? "setup" : "log" })); return { ok: true, kind: entry.kind }; }
      if (ev.seat) risk.add(ev.seat, ev.t, POINTS[ev.lvl] * def.w, { alone: def.alone !== false });
      if (ev.lvl === "info") { log.push(Object.assign(entry, { kind: "info" })); return { ok: true, kind: "info" }; }
      if (now < muteUntil) { suppressed++; log.push(Object.assign(entry, { kind: "muted" })); return { ok: true, kind: "muted" }; }
      const open = alerts.find(a => a.seat === ev.seat && a.sig === ev.sig && (a.status === "open" || a.status === "going"));
      if (open) {
        open.n = (open.n || 1) + 1; open.last = ev.t; open.lvl = maxLvl(open.lvl, ev.lvl); if (ev.dur != null) open.dur = Math.max(open.dur || 0, ev.dur);
        if (ev.id && open.node === ev.node) (open.eids || (open.eids = [])).push(ev.id);
        return { ok: true, kind: "bump", id: open.id };
      }
      const a = Object.assign(entry, { kind: "alert", n: 1, last: ev.t, status: "open", acts: [], verdict: null });
      alerts.push(a); log.push(a);
      return { ok: true, kind: "alert", id: a.id };
    }
    function act(id, action, { who = "", note = "" } = {}, now) {
      const a = alerts.find(x => x.id === id);
      if (!a || !ACTIONS.includes(action)) return false;
      who = shortText(who, 40); note = shortText(note, 300);
      if (!who) return false; // every action names the invigilator
      a.acts.push({ a: action, who, t: fin(now) ? now : Date.now(), note });
      if (action === "going") a.status = a.status === "open" ? "going" : a.status;
      else if (action === "noissue") a.status = "closed";
      else if (action === "escalate") a.status = "escalated";
      return true;
    }
    function verdict(id, right) { const a = alerts.find(x => x.id === id); if (!a) return false; a.verdict = right == null ? null : right ? "right" : "wrong"; return true; }
    function mute(now, ms = 60000) { muteUntil = Math.max(muteUntil, now + ms); log.push({ id: nextId(), t: now, seat: "", sig: "roommute", lvl: "info", kind: "log", dur: ms }); }
    function setProfile(seat, p) { if (!SEAT_RE.test(String(seat))) return false; if (p == null || isPlainProfile(p)) delete profiles[seat]; else profiles[seat] = cleanProfile(p); return true; }
    function levels(now) { const out = {}; for (const s of new Set([...seatsSeen, ...risk.seats()])) { const sc = risk.score(s, now); out[s] = { score: Math.round(sc * 100) / 100, level: levelOf(sc) }; } return out; }
    function queue(now) {
      return alerts.filter(a => a.status === "open" || a.status === "going")
        .map(a => Object.assign({}, a, { seatLevel: risk.level(a.seat, now) }))
        .sort((x, y) => rank(y.lvl) - rank(x.lvl) || x.t - y.t);
    }
    const isResp = x => x.a !== "note" && x.a !== "keepclip"; // keeping a clip is not "responding" to the flag
    const firstResp = a => { const r = a.acts.find(isResp); return r ? r.t - a.t : null; };
    /** clips of an alert, newest first: [{key, node, id, st, t, days}] */
    function clipsOf(a) {
      if (!a || !a.eids || !a.node) return [];
      return a.eids.map(id => ({ key: a.node + ":" + id, node: a.node, id })).filter(c => clips[c.key]).map(c => Object.assign(c, clips[c.key])).sort((x, y) => y.t - x.t);
    }
    /** best clip state of an alert for its row: kept/auto > pending > fail > del > gone (null = no clip) */
    function clipState(a) {
      const order = ["kept", "auto", "pending", "fail", "del", "gone"], cs = clipsOf(a);
      if (!cs.length) return null;
      const best = cs.slice().sort((x, y) => order.indexOf(x.st) - order.indexOf(y.st))[0];
      return { st: best.st, days: best.days, t: best.t, n: cs.length };
    }
    /** invigilator taps "keep clip" on a flag: named action + the keep messages for the camera device(s) */
    function keepClip(id, who, now) {
      const a = alerts.find(x => x.id === id); who = shortText(who, 40);
      if (!a || !who) return [];
      const pend = clipsOf(a).filter(c => c.st === "pending");
      if (!pend.length) return [];
      const t = fin(now) ? now : Date.now();
      a.acts.push({ a: "keepclip", who, t, note: "" });
      return pend.map(c => ({ v: 1, type: "keep", room, node: c.node, t, id: c.id }));
    }
    function summary() {
      const byType = {}; alerts.forEach(a => { byType[a.sig] = (byType[a.sig] || 0) + 1; });
      const resp = alerts.map(firstResp).filter(fin);
      const early = [...new Set(log.filter(e => e.sig === "early" && e.lvl !== "info").map(e => e.seat))].sort();
      return {
        room, alerts: alerts.length, byType,
        acknowledged: alerts.filter(a => a.acts.some(isResp)).length,
        dismissed: alerts.filter(a => a.status === "closed").length,
        escalated: alerts.filter(a => a.status === "escalated").length,
        open: alerts.filter(a => a.status === "open" || a.status === "going").length,
        medianResponseS: resp.length ? Math.round(median(resp) / 1000) : null,
        earlyLeavers: early, info: log.filter(e => e.kind === "info").length,
        setup: log.filter(e => e.kind === "setup").length, muted: suppressed
      };
    }
    function precision() {
      const by = {};
      for (const a of alerts) { if (!a.verdict) continue; const b = by[a.sig] || (by[a.sig] = { right: 0, wrong: 0 }); b[a.verdict]++; }
      const out = {}; let R = 0, N = 0;
      for (const [k, b] of Object.entries(by)) { const n = b.right + b.wrong; out[k] = Object.assign({}, b, wilson(b.right, n)); R += b.right; N += n; }
      return { bySig: out, all: wilson(R, N) };
    }
    /** incident log rows, ALWAYS in time order (never ranked by suspicion) */
    function rows() {
      return log.filter(e => e.kind !== "info" || e.sig === "early" || e.sig === "empty" || e.sig === "back").slice().sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    }
    function csv(L) {
      L = L || {};
      const cell = v => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const label = e => (L.sig && L.sig(e.sig)) || SIGNALS[e.sig].th;
      const lvl = l => (L.lvl && L.lvl(l)) || LEVEL_TH[l] || l;
      const out = (L.outcome || (a => a.status || ""));
      const time = L.time || (t => new Date(t).toISOString());
      const head = L.head || ["เวลา", "ห้อง", "ที่นั่ง", "เหตุผล", "ระดับ", "ผู้ตรวจ", "ผลการตรวจ", "เวลาตอบสนอง (วินาที)", "บันทึก"];
      // evidence clip column only when this room used clips (the clip itself stays on the camera device)
      const anyClip = Object.keys(clips).length > 0, clipTxt = L.clip || (c => (c ? c.st : ""));
      const lines = [anyClip ? head.concat([L.clipHead || "คลิปหลักฐาน (อยู่ในเครื่องกล้อง)"]) : head].concat(rows().map(e => {
        const acts = e.acts || [], r = e.kind === "alert" ? firstResp(e) : null;
        const row = [time(e.t), room, e.seat, label(e) + (e.dur ? " (" + fmtDur(e.dur) + ")" : ""), lvl(e.lvl),
          [...new Set(acts.map(x => x.who))].join("; "), e.kind === "alert" ? out(e) : "", r != null ? Math.round(r / 1000) : "",
          acts.filter(x => x.note).map(x => x.note).join(" | ")];
        return anyClip ? row.concat([e.kind === "alert" ? clipTxt(clipState(e)) : ""]) : row;
      }));
      return "﻿" + lines.map(r => r.map(cell).join(",")).join("\r\n");
    }
    function toJSON() { return { v: 1, room, seq, alerts, log: log.filter(e => e.kind !== "alert"), muteUntil: fin(muteUntil) ? muteUntil : 0, suppressed, profiles, seats: [...seatsSeen], clips }; }
    function load(j) {
      if (!j || j.v !== 1 || !Array.isArray(j.alerts) || !Array.isArray(j.log)) return false;
      alerts = j.alerts.filter(a => a && SIGNALS[a.sig] && fin(a.t)); log = j.log.filter(e => e && SIGNALS[e.sig] && fin(e.t)).concat(alerts).sort((a, b) => a.t - b.t);
      seq = j.seq | 0; muteUntil = j.muteUntil || -Infinity; suppressed = j.suppressed | 0; profiles = {}; clips = {};
      for (const [k, c] of Object.entries(j.clips && typeof j.clips === "object" ? j.clips : {})) {
        if (c && CLIP_ST.includes(c.st) && /^[a-z0-9]{6,24}:[a-z0-9_-]{1,16}$/i.test(k)) clips[k] = { st: c.st, t: +c.t || 0, seat: String(c.seat || ""), days: fin(c.days) ? c.days : undefined };
      }
      for (const [k, p] of Object.entries(j.profiles || {})) if (SEAT_RE.test(k)) profiles[k] = cleanProfile(p);
      (j.seats || []).forEach(s => { if (SEAT_RE.test(String(s))) seatsSeen.add(String(s)); });
      risk = createRisk({ halfLifeMs });
      for (const e of log) if (e.seat && (e.kind === "alert" || e.kind === "info") && SIGNALS[e.sig].w > 0) risk.add(e.seat, e.t, (POINTS[e.lvl] || 0) * SIGNALS[e.sig].w, { alone: SIGNALS[e.sig].alone !== false });
      return true;
    }
    function addSeats(ids) { (ids || []).forEach(s => { if (SEAT_RE.test(String(s))) seatsSeen.add(String(s)); }); }
    return {
      ingest, act, verdict, mute, setProfile, levels, queue, summary, precision, rows, csv, toJSON, load, addSeats, keepClip, clipsOf, clipState, firstResp,
      spark: (seat, now, o) => risk.series(seat, now, o),
      get alerts() { return alerts; }, get log() { return log; }, get profiles() { return profiles; }, get nodes() { return nodes; },
      get room() { return room; }, get clips() { return clips; }, mutedUntil: () => muteUntil, seats: () => [...seatsSeen]
    };
  }

  return {
    SIGNALS, LEVELS, LEVEL_TH, POINTS, DEFAULTS, PROFILE_KEYS, ACTIONS, SEAT_RE, ROOM_RE, CLIP_ST,
    levelOf, createGate, createRisk, createRoomMonitor, cleanProfile, isPlainProfile, applyAccommodation,
    poseFrom68, pitchDeg, synth68, calibrate, lightingVerdict, createFrozen, isVirtualCamLabel, createLabMonitor,
    pointInPoly, polyArea, polyCentroid, boxFracInPoly, seatOf, gridSeats, cleanSeats, createHallMonitor,
    cleanMsg, createBoard, wilson, median, fmtDur
  };
});
