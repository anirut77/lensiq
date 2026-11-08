/* lensiq-zones.js — LQZones: zone / timer / line-cross maths shared by the quick-win pages (queue, tables, afterhours, bays).
 * Pure, no DOM. Browser: window.LQZones · Node: module.exports (tests/unit/zones.test.js).
 * Privacy: everything here works on anonymous boxes (normalised 0..1) and numbers; nothing identifies a person.
 *
 * GEOMETRY  (Point = {x,y} normalised, Poly = Point[] with >= 3 points, Box = {x,y,w,h} normalised top-left)
 *   pointInPolygon(p, poly) -> boolean       ray casting (even-odd); a point exactly on the left/top edge counts as inside
 *   polyArea(poly) -> number (>= 0)          shoelace
 *   polyCentroid(poly) -> Point              area centroid (vertex mean for a degenerate polygon)
 *   anchor(box, kind='foot'|'center') -> Point   foot = bottom centre (where a person stands), center = box centre
 *   boxInZone(box, poly, kind='foot') -> boolean
 *   coverage(box, poly, n=12) -> 0..1        share of the polygon (sampled on an n×n grid of its bounding box) inside the box
 *   normPoly(raw, {min=3, max=24}) -> Poly|null   clamps to 0..1, drops non-numbers, null when < min points
 *   rectPoly({x,y,w,h}) -> Poly              4 corners clockwise
 *   segCross(p0, p1, a, b) -> 0 | 1 | -1     movement p0->p1 crossed segment a-b: +1 from the positive side of a->b, -1 the other way
 *
 * TIMERS / STATE (time = ms numbers the caller passes in; nothing reads a clock)
 *   createHysteresis({onMs=1500, offMs=3000}) -> {update(key, present, now) -> {on, changed, since}, state(key), reset(key?), keys()}
 *     becomes ON after `present` held continuously for onMs; OFF after absent continuously for offMs (no flicker).
 *   createCooldown(ms) -> {ready(key, now), fire(key, now) -> boolean (true = fired, false = still cooling), reset(key?)}
 *   createDwell({graceMs=1500}) -> {update(zoneKey, ids:Iterable, now) -> {active:[{id, ms}], ended:[{id, ms}]}, active(zoneKey, now), reset()}
 *     per zone, per anonymous track id: entry time; an id missing for > graceMs ends its visit (ms = lastSeen - enter).
 *   createSmoother(n=5) -> {push(v) -> median of last n, value(), reset()}
 *   median(arr) -> number|0
 *
 * RULES
 *   createThresholdAlert({holdMs=20000, clearMs=20000, cooldownMs=300000}) ->
 *     {update(key, over:boolean, now) -> 'raise'|'clear'|null, isOn(key)}   hysteresis + cooldown between raises
 *     (a condition that turns on during the cooldown raises when the cooldown ends, if it still holds)
 *   queueWait({count, serviceSec, counters=1, recentWaits=[]}) -> {estSec, measuredSec|null, sec}
 *     estSec = count × serviceSec / counters; measuredSec = median of recent completed waits; sec = max of the two known
 *   tableStep(tbl, persons, now, cfg) -> {tbl, event:null|'seated'|'left'|'cleared'}
 *     tbl = {state:'free'|'occupied'|'clearing', since, seatedAt, presentSince, absentSince, turns, seatMsSum}
 *     cfg = {seatMs=60000 (people present that long = seated), leaveMs=90000 (empty that long = left),
 *            autoClearMs=0 (0 = staff taps "cleared"), minSeatMs=120000 (shorter visits do not need clearing)}
 *   clearTable(tbl, now) -> {tbl, event:'cleared'}
 *   parseHM("22:30") -> minutes|null ·  inSchedule(date:{day 0-6, min}, windows:[{days:[0..6], from:"22:00", to:"06:00"}]) -> boolean
 *     a window that ends before it starts runs overnight (its days are the days it STARTS on)
 *   precision({tp, fp}) -> {n, p|null, lo, hi}   alert precision + Wilson 95 % interval (on-site check: staff mark each alert)
 *
 * COCO CLASSES
 *   COCO80 = names in YOLOX order (80) · cocoIndex(name, kind='yolox'|'coco') -> index for LQDetect classes
 *   (COCO-SSD's score tensor has 90 slots = the original COCO ids - 1; YOLOX has the 80 contiguous classes.)
 *   labelOf(det, kind) -> name ('person' when det has no cls/label — e.g. a scripted test box)
 */
(function (root) {
  "use strict";

  // ---------- geometry ----------
  function pointInPolygon(p, poly) {
    if (!p || !poly || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > p.y) !== (b.y > p.y)) {
        const xCross = (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x;
        if (p.x < xCross) inside = !inside;
      }
    }
    return inside;
  }
  function polyArea(poly) {
    if (!poly || poly.length < 3) return 0;
    let s = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j].x * poly[i].y - poly[i].x * poly[j].y);
    return Math.abs(s) / 2;
  }
  function polyCentroid(poly) {
    if (!poly || !poly.length) return { x: 0, y: 0 };
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const f = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
      a += f; cx += (poly[j].x + poly[i].x) * f; cy += (poly[j].y + poly[i].y) * f;
    }
    if (Math.abs(a) < 1e-12) {
      return { x: poly.reduce((s, p) => s + p.x, 0) / poly.length, y: poly.reduce((s, p) => s + p.y, 0) / poly.length };
    }
    return { x: cx / (3 * a), y: cy / (3 * a) };
  }
  function anchor(box, kind = "foot") {
    return kind === "center" ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : { x: box.x + box.w / 2, y: Math.min(1, box.y + box.h) };
  }
  const boxInZone = (box, poly, kind = "foot") => pointInPolygon(anchor(box, kind), poly);
  function coverage(box, poly, n = 12) {
    if (!box || !poly || poly.length < 3) return 0;
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const p of poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    let inPoly = 0, inBox = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const q = { x: x0 + (i + 0.5) * (x1 - x0) / n, y: y0 + (j + 0.5) * (y1 - y0) / n };
      if (!pointInPolygon(q, poly)) continue;
      inPoly++;
      if (q.x >= box.x && q.x <= box.x + box.w && q.y >= box.y && q.y <= box.y + box.h) inBox++;
    }
    return inPoly ? inBox / inPoly : 0;
  }
  const clamp01 = v => Math.max(0, Math.min(1, v));
  function normPoly(raw, { min = 3, max = 24 } = {}) {
    if (!Array.isArray(raw)) return null;
    const out = [];
    for (const p of raw) {
      if (!p || typeof p !== "object") continue;
      const x = Number(p.x), y = Number(p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      out.push({ x: Math.round(clamp01(x) * 10000) / 10000, y: Math.round(clamp01(y) * 10000) / 10000 });
      if (out.length >= max) break;
    }
    return out.length >= min ? out : null;
  }
  const rectPoly = r => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
  // side of point p relative to the directed line a->b: >0 left, <0 right (image coordinates: y down)
  const side = (p, a, b) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  function segCross(p0, p1, a, b) {
    const s0 = side(p0, a, b), s1 = side(p1, a, b);
    if (s0 === 0 || s1 === 0 || (s0 > 0) === (s1 > 0)) return 0;
    // the movement must actually pass through the segment a-b (not its extension)
    const t0 = side(a, p0, p1), t1 = side(b, p0, p1);
    if ((t0 > 0) === (t1 > 0) && t0 !== 0 && t1 !== 0) return 0;
    return s0 > 0 ? 1 : -1;
  }

  // ---------- timers / state ----------
  function createHysteresis({ onMs = 1500, offMs = 3000 } = {}) {
    const S = new Map();
    function update(key, present, now) {
      let s = S.get(key);
      if (!s) { s = { on: false, since: now, presentSince: null, absentSince: null }; S.set(key, s); }
      let changed = false;
      if (present) {
        s.absentSince = null;
        if (s.presentSince == null) s.presentSince = now;
        if (!s.on && now - s.presentSince >= onMs) { s.on = true; s.since = now; changed = true; }
      } else {
        s.presentSince = null;
        if (s.absentSince == null) s.absentSince = now;
        if (s.on && now - s.absentSince >= offMs) { s.on = false; s.since = now; changed = true; }
      }
      return { on: s.on, changed, since: s.since };
    }
    return {
      update,
      state: key => S.get(key) || null,
      reset: key => { if (key == null) S.clear(); else S.delete(key); },
      keys: () => [...S.keys()]
    };
  }
  function createCooldown(ms) {
    const last = new Map();
    const ready = (key, now) => !last.has(key) || now - last.get(key) >= ms;
    return {
      ready,
      fire(key, now) { if (!ready(key, now)) return false; last.set(key, now); return true; },
      reset: key => { if (key == null) last.clear(); else last.delete(key); }
    };
  }
  function createDwell({ graceMs = 1500 } = {}) {
    const Z = new Map(); // zoneKey -> Map<id, {enter, last}>
    function update(zoneKey, ids, now) {
      let m = Z.get(zoneKey);
      if (!m) { m = new Map(); Z.set(zoneKey, m); }
      for (const id of ids) {
        const v = m.get(id);
        if (v) v.last = now; else m.set(id, { enter: now, last: now });
      }
      const ended = [];
      for (const [id, v] of m) if (now - v.last > graceMs) { ended.push({ id, ms: v.last - v.enter }); m.delete(id); }
      return { active: active(zoneKey, now), ended };
    }
    function active(zoneKey, now) {
      const m = Z.get(zoneKey);
      return m ? [...m].map(([id, v]) => ({ id, ms: now - v.enter })).sort((a, b) => b.ms - a.ms) : [];
    }
    return { update, active, reset: () => Z.clear() };
  }
  function median(arr) {
    const a = (arr || []).filter(Number.isFinite).slice().sort((x, y) => x - y);
    if (!a.length) return 0;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function createSmoother(n = 5) {
    let buf = [];
    return {
      push(v) { buf.push(v); if (buf.length > n) buf = buf.slice(-n); return median(buf); },
      value: () => median(buf),
      reset() { buf = []; }
    };
  }

  // ---------- rules ----------
  function createThresholdAlert({ holdMs = 20000, clearMs = 20000, cooldownMs = 300000 } = {}) {
    const H = createHysteresis({ onMs: holdMs, offMs: clearMs }), C = createCooldown(cooldownMs);
    const on = new Map();
    return {
      update(key, over, now) {
        const r = H.update(key, !!over, now);
        if (r.on && !on.get(key)) {
          // still cooling down: stays quiet; raises once the cooldown ends if the condition still holds
          if (!C.fire(key, now)) return null;
          on.set(key, true); return "raise";
        }
        if (!r.on && on.get(key)) { on.set(key, false); return "clear"; }
        return null;
      },
      isOn: key => !!on.get(key),
      reset() { H.reset(); C.reset(); on.clear(); }
    };
  }
  function queueWait({ count = 0, serviceSec = 60, counters = 1, recentWaits = [] } = {}) {
    const c = Math.max(1, counters | 0 || 1);
    const estSec = Math.max(0, count) * Math.max(0, serviceSec) / c;
    const done = (recentWaits || []).filter(v => Number.isFinite(v) && v > 0);
    const measuredSec = done.length >= 3 ? median(done) : null;
    return { estSec, measuredSec, sec: Math.round(Math.max(estSec, measuredSec || 0)) };
  }
  const TABLE_CFG = { seatMs: 60000, leaveMs: 90000, autoClearMs: 0, minSeatMs: 120000 };
  function newTable(now = 0) { return { state: "free", since: now, seatedAt: null, presentSince: null, absentSince: null, turns: 0, seatMsSum: 0 }; }
  function tableStep(tbl, persons, now, cfg = {}) {
    const c = { ...TABLE_CFG, ...cfg };
    const t = { ...(tbl || newTable(now)) };
    const present = persons > 0;
    let event = null;
    if (present) { t.absentSince = null; if (t.presentSince == null) t.presentSince = now; }
    else { t.presentSince = null; if (t.absentSince == null) t.absentSince = now; }
    if ((t.state === "free" || t.state === "clearing") && present && now - t.presentSince >= c.seatMs) {
      // new party sits down (a table nobody cleared is treated as cleared by the new seating)
      t.state = "occupied"; t.since = now; t.seatedAt = t.presentSince; event = "seated";
    } else if (t.state === "occupied" && !present && now - t.absentSince >= c.leaveMs) {
      const stay = Math.max(0, t.absentSince - t.seatedAt);
      t.turns += 1; t.seatMsSum += stay;
      t.state = stay >= c.minSeatMs ? "clearing" : "free"; t.since = now; t.seatedAt = null; event = "left";
    } else if (t.state === "clearing" && c.autoClearMs > 0 && !present && now - t.since >= c.autoClearMs) {
      t.state = "free"; t.since = now; event = "cleared";
    }
    return { tbl: t, event };
  }
  function clearTable(tbl, now) { return { tbl: { ...tbl, state: "free", since: now, seatedAt: null }, event: "cleared" }; }
  function parseHM(s) {
    const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(s || ""));
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    return h <= 24 && mi < 60 && h * 60 + mi <= 1440 ? h * 60 + mi : null;
  }
  function inSchedule(at, windows) {
    if (!at || !Array.isArray(windows)) return false;
    const day = at.day, min = at.min;
    for (const w of windows) {
      const f = parseHM(w.from), t = parseHM(w.to);
      if (f == null || t == null) continue;
      const days = Array.isArray(w.days) && w.days.length ? w.days : [0, 1, 2, 3, 4, 5, 6];
      if (f === t) { if (days.includes(day)) return true; continue; } // 24 h on those days
      if (f < t) { if (days.includes(day) && min >= f && min < t) return true; continue; }
      // overnight: from f on its start day until t the next morning
      if (days.includes(day) && min >= f) return true;
      if (days.includes((day + 6) % 7) && min < t) return true;
    }
    return false;
  }
  function precision({ tp = 0, fp = 0 } = {}) {
    const n = tp + fp;
    if (!n) return { n: 0, p: null, lo: 0, hi: 1 };
    const p = tp / n, z = 1.96, d = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return { n, p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
  }

  // ---------- COCO classes ----------
  const COCO80 = Object.freeze(["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
    "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra",
    "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite",
    "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", "knife",
    "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
    "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone",
    "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"]);
  // original COCO category ids (1..90 with gaps) of the 80 classes, in the same order
  const COCO_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38,
    39, 40, 41, 42, 43, 44, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 67, 70, 72, 73, 74, 75, 76,
    77, 78, 79, 80, 81, 82, 84, 85, 86, 87, 88, 89, 90];
  function cocoIndex(name, kind = "yolox") {
    const i = COCO80.indexOf(name);
    if (i < 0) return -1;
    return kind === "coco" ? COCO_IDS[i] - 1 : i;
  }
  function labelOf(det, kind = "yolox") {
    if (!det) return null;
    if (typeof det.label === "string") return det.label;
    if (det.cls == null) return "person";
    if (kind === "coco") { const i = COCO_IDS.indexOf(det.cls + 1); return i >= 0 ? COCO80[i] : null; }
    return COCO80[det.cls] || null;
  }

  const api = {
    pointInPolygon, polyArea, polyCentroid, anchor, boxInZone, coverage, normPoly, rectPoly, segCross,
    createHysteresis, createCooldown, createDwell, createSmoother, median,
    createThresholdAlert, queueWait, TABLE_CFG, newTable, tableStep, clearTable, parseHM, inSchedule, precision,
    COCO80, COCO_IDS, cocoIndex, labelOf
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQZones = api;
})(typeof window !== "undefined" ? window : globalThis);
