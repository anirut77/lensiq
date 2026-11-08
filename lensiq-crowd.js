/* lensiq-crowd.js — LQCrowd: the pure maths behind crowd.html (crowd counting & density, entry/exit line, dwell, visitors per
 * hour, conversion, shopfront funnel). No DOM. Browser: window.LQCrowd · Node: module.exports (tests/unit/crowd.test.js).
 * Privacy: works on anonymous normalised boxes, random per-session track ids and numbers. Nothing here sees a frame,
 * a face or a name, and nothing it returns can be turned back into an image of a person. The day record holds counts only.
 *
 * LINE CROSSING (same semantics as store.js lineSide / crossStep — tests/unit/crowd.test.js compares them on random tracks)
 *   lineSide(line, p, margin=0) -> 1 | -1 | 0      line = {a:{x,y}, b:{x,y}}; 0 = within `margin` of the line
 *   crossStep(mem, line, p, swap, cfg={band, bandRel, confirm}, boxH=0) -> 'in' | 'out' | null   (mem kept per track)
 *   CROSS = {band: 0.012, bandRel: 0.08, confirm: 2}   store.js round-4 defaults (hysteresis band + 2-frame confirmation)
 *   createLineCounter({cross=CROSS, forgetMs=5000}) -> {update(dets[{id,x,y,w,h}], line, swap, now) -> [{id, dir}], reset()}
 *     anchor = foot point (bottom centre); dets with id 0 (unconfirmed track) are ignored.
 *
 * DENSITY GRID (heatmap of person-seconds by foot position)
 *   newGrid(cols=24, rows=14) -> {cols, rows, d:number[]} · gridAdd(G, p, w=1) · gridMax(G) · gridNorm(G) -> 0..100 ints
 *   heatColor(t 0..1) -> [r,g,b]   blue -> cyan -> green -> yellow -> red (same ramp as store.js)
 *
 * DAY RECORD (numbers only; crowd.js persists it per day in localStorage)
 *   newDay(date) -> {date, peak, peakAt, in, out, hourly:{in, out, occSum, occMs, peak, uniq} (24 each),
 *                    minutes:{"<minute of day>": [personMsSum, ms, max]}, heat:grid, zones:{}, conv:{}, funnel:{pass, stop}}
 *     funnel: pass = anonymous ids seen in a "pass" or "stop" zone, stop = ids that stayed >= stopSec in a "stop" zone; entered = day.in
 *   ensureDay(d) -> d with any missing field filled (older / partial records)
 *   addMinute(day, minuteOfDay, count, dtMs) · hourAvg(day, h) -> number|null · peakHours(day, n=3) -> [{h, avg, peak}]
 *   series(day, fromMin, toMin) -> [{m, avg, max}] (missing minutes are skipped)
 *   zoneStat(day, zone) -> the zone's {name, role, visits, dwellSum, dwellN, peak, occSum, occMs} (created on demand)
 *   avgDwellSec(zs) -> seconds|0 · density(count, areaM2) -> people per m² | null
 *   rate(num, den) -> 0..1 | null   (conversion / funnel step; null when the denominator is 0 or unknown)
 *   funnelRates({pass, stop, enter}) -> {stopRate, enterRate, overall}
 *   densityLevel(perM2) -> 'low'|'busy'|'crowded'|'critical'|null   guide bands 0-1 / 1-2 / 2-4 / >4 people per m²
 *   aggDay(day, zones) -> store.js-shaped day for LQAgg.packFromDay (in/out/peak/hourly + zones "c1:<id>")
 *
 * STORAGE BUDGET (localStorage is ~5 MB for the whole origin, shared with every other LENSIQ page)
 *   compactDay(day) -> the same record without the per-minute map (only today's chart needs it) and with rounded numbers
 *     (a past day shrinks from ~50-75 KB to a few KB)
 *   planPrune(keys, prefix, today, keep=DAY_KEEP) -> {compact:[key], drop:[key]}   pure: which "<prefix>YYYY-MM-DD" records
 *     to compact (past days) and drop (beyond the newest `keep` days, today always kept). DAY_KEEP = 60 until counsel sets a default.
 */
(function (root) {
  "use strict";

  // ---------- line crossing ----------
  // TODO(shared module): copied from store.js (a page script, not importable). Keep in sync; tests/unit/crowd.test.js compares
  // both on random tracks so a fix in one that is not made in the other turns the test red. Later: move into a small shared file.
  const CROSS = Object.freeze({ band: 0.012, bandRel: 0.08, confirm: 2 });
  function lineSide(line, p, margin = 0) {
    const dx = line.b.x - line.a.x, dy = line.b.y - line.a.y, len = Math.hypot(dx, dy) || 1;
    const s = (dx * (p.y - line.a.y) - dy * (p.x - line.a.x)) / len;
    return s > margin ? 1 : s < -margin ? -1 : 0;
  }
  function segmentsIntersect(p1, p2, q1, q2) {
    const o = (a, b, c) => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
    const on = (a, b, c) => Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);
    const o1 = o(p1, p2, q1), o2 = o(p1, p2, q2), o3 = o(q1, q2, p1), o4 = o(q1, q2, p2);
    if (o1 !== o2 && o3 !== o4) return true;
    return (o1 === 0 && on(p1, p2, q1)) || (o2 === 0 && on(p1, p2, q2)) || (o3 === 0 && on(q1, q2, p1)) || (o4 === 0 && on(q1, q2, p2));
  }
  function crossStep(mem, line, p, swap, cfg = CROSS, boxH = 0) {
    const margin = Math.max(cfg.band != null ? cfg.band : 0.012, (cfg.bandRel || 0) * boxH);
    const side = lineSide(line, p, margin);
    if (side === 0) return null;
    if (mem.pend) {
      if (side === mem.pend.side) {
        if (++mem.pend.n >= (cfg.confirm || 1)) { const d = mem.pend.dir; mem.pend = null; mem.side = side; mem.pt = { x: p.x, y: p.y }; return d; }
        return null;
      }
      mem.pend = null; // went back before the confirmation: not counted
    }
    let dir = null;
    if (mem.side && side !== mem.side && segmentsIntersect(mem.pt, p, line.a, line.b)) {
      const d = (side === 1) !== swap ? "in" : "out";
      if ((cfg.confirm || 1) > 1) { mem.pend = { dir: d, side, n: 1 }; return null; }
      dir = d;
    }
    mem.side = side; mem.pt = { x: p.x, y: p.y };
    return dir;
  }
  const foot = b => ({ x: b.x + b.w / 2, y: Math.min(1, b.y + b.h) });
  function createLineCounter({ cross = CROSS, forgetMs = 5000 } = {}) {
    const mem = new Map(); // id -> {side, pt, pend, last}
    return {
      update(dets, line, swap, now) {
        const out = [];
        if (!line || !line.a || !line.b) return out;
        for (const d of dets || []) {
          if (!d || !d.id) continue;
          let m = mem.get(d.id);
          if (!m) { m = { side: 0, pt: null, pend: null, last: now }; mem.set(d.id, m); }
          m.last = now;
          const dir = crossStep(m, line, foot(d), !!swap, cross, d.h || 0);
          if (dir) out.push({ id: d.id, dir });
        }
        for (const [id, m] of mem) if (now - m.last > forgetMs) mem.delete(id);
        return out;
      },
      reset() { mem.clear(); },
      get size() { return mem.size; }
    };
  }

  // ---------- density grid ----------
  function newGrid(cols = 24, rows = 14) { return { cols, rows, d: Array(cols * rows).fill(0) }; }
  function gridAdd(G, p, w = 1) {
    if (!G || !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !(w > 0)) return;
    const cx = Math.min(G.cols - 1, Math.max(0, Math.floor(p.x * G.cols)));
    const cy = Math.min(G.rows - 1, Math.max(0, Math.floor(p.y * G.rows)));
    G.d[cy * G.cols + cx] += w;
  }
  function gridMax(G) { let m = 0; for (const v of (G && G.d) || []) if (v > m) m = v; return m; }
  function gridNorm(G) { const m = gridMax(G); return (G.d || []).map(v => m ? Math.round(100 * v / m) : 0); }
  /** @type {Array<{t: number, c: number[]}>} */
  const RAMP = [{ t: 0, c: [42, 120, 214] }, { t: 0.25, c: [56, 190, 220] }, { t: 0.5, c: [80, 190, 90] }, { t: 0.75, c: [245, 200, 50] }, { t: 1, c: [220, 50, 40] }];
  /** @param {number} t @returns {number[]} */
  function heatColor(t) {
    t = Math.max(0, Math.min(1, Number(t) || 0));
    for (let i = 1; i < RAMP.length; i++) {
      if (t <= RAMP[i].t) {
        const a = RAMP[i - 1], b = RAMP[i], k = (t - a.t) / (b.t - a.t);
        return a.c.map((c, j) => Math.round(c + (b.c[j] - c) * k));
      }
    }
    return RAMP[RAMP.length - 1].c.slice();
  }

  // ---------- day record ----------
  const z24 = () => Array(24).fill(0);
  function newDay(date = "") {
    return { date, peak: 0, peakAt: 0, in: 0, out: 0,
      hourly: { in: z24(), out: z24(), occSum: z24(), occMs: z24(), peak: z24(), uniq: z24() },
      minutes: {}, heat: newGrid(), zones: {}, conv: {}, funnel: { pass: 0, stop: 0 } };
  }
  const num = v => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
  function ensureDay(d) {
    const base = newDay(d && typeof d.date === "string" ? d.date : "");
    if (!isObj(d)) return base;
    for (const k of ["peak", "peakAt", "in", "out"]) d[k] = num(d[k]);
    if (!isObj(d.hourly)) d.hourly = base.hourly;
    for (const k of Object.keys(base.hourly)) {
      const a = d.hourly[k];
      d.hourly[k] = Array.isArray(a) && a.length === 24 ? a.map(num) : z24();
    }
    if (!isObj(d.minutes)) d.minutes = {};
    const g = d.heat;
    if (!isObj(g) || !Array.isArray(g.d) || g.d.length !== (g.cols | 0) * (g.rows | 0) || !(g.cols > 0)) d.heat = base.heat;
    else g.d = g.d.map(num);
    if (!isObj(d.zones)) d.zones = {};
    if (!isObj(d.conv)) d.conv = {};
    if (!isObj(d.funnel)) d.funnel = base.funnel;
    for (const k of ["pass", "stop"]) d.funnel[k] = num(d.funnel[k]);
    return d;
  }
  function addMinute(day, m, count, dtMs) {
    if (!(dtMs > 0) || !(m >= 0 && m < 1440)) return;
    const k = String(m | 0), r = day.minutes[k] || (day.minutes[k] = [0, 0, 0]);
    r[0] += count * dtMs; r[1] += dtMs; r[2] = Math.max(r[2], count);
  }
  function hourAvg(day, h) { const ms = day.hourly.occMs[h]; return ms > 0 ? day.hourly.occSum[h] / ms : null; }
  function peakHours(day, n = 3) {
    const out = [];
    for (let h = 0; h < 24; h++) { const a = hourAvg(day, h); if (a != null && day.hourly.occMs[h] >= 60000) out.push({ h, avg: a, peak: day.hourly.peak[h] }); }
    return out.sort((x, y) => y.avg - x.avg || y.peak - x.peak || x.h - y.h).slice(0, n);
  }
  function series(day, fromMin = 0, toMin = 1439) {
    const out = [];
    for (let m = Math.max(0, fromMin); m <= Math.min(1439, toMin); m++) {
      const r = day.minutes[String(m)];
      if (r && r[1] > 0) out.push({ m, avg: r[0] / r[1], max: r[2] });
    }
    return out;
  }
  function zoneStat(day, z) {
    return day.zones[z.id] || (day.zones[z.id] = { name: z.name, role: z.role || "area", visits: 0, dwellSum: 0, dwellN: 0, peak: 0, occSum: 0, occMs: 0 });
  }
  const avgDwellSec = zs => zs && zs.dwellN ? zs.dwellSum / zs.dwellN / 1000 : 0;
  const density = (count, areaM2) => areaM2 > 0 ? count / areaM2 : null;
  const rate = (a, b) => b > 0 && Number.isFinite(a) && a >= 0 ? a / b : null;
  function funnelRates({ pass = 0, stop = 0, enter = 0 } = {}) {
    return { stopRate: rate(stop, pass), enterRate: rate(enter, stop), overall: rate(enter, pass) };
  }
  function densityLevel(d) {
    if (d == null || !Number.isFinite(d)) return null;
    return d > 4 ? "critical" : d > 2 ? "crowded" : d > 1 ? "busy" : "low";
  }
  function aggDay(day, zones) {
    const out = { date: day.date, in: day.in, out: day.out, occ: Math.max(0, day.in - day.out), peak: day.peak, peakAt: day.peakAt,
      maxQueue: 0, hourly: { in: day.hourly.in.slice(), out: day.hourly.out.slice() }, zones: {}, byCam: {} };
    for (const z of zones || []) {
      const zs = day.zones[z.id];
      if (zs) out.zones["c1:" + z.id] = { name: z.name, visits: zs.visits, dwellSum: zs.dwellSum, dwellN: zs.dwellN, peak: zs.peak };
    }
    return out;
  }

  // ---------- storage budget ----------
  const DAY_KEEP = 60;
  const r2 = v => Math.round(v * 100) / 100;
  function compactDay(day) {
    const d = ensureDay(day);
    d.minutes = {};
    for (const k of Object.keys(d.hourly)) d.hourly[k] = d.hourly[k].map(Math.round);
    d.heat.d = d.heat.d.map(r2);
    for (const zs of Object.values(d.zones)) if (isObj(zs)) for (const k of ["dwellSum", "occSum", "occMs"]) zs[k] = Math.round(num(zs[k]));
    return d;
  }
  function planPrune(keys, prefix, today, keep = DAY_KEEP) {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const days = [...new Set(keys || [])].filter(k => typeof k === "string" && k.startsWith(prefix) && re.test(k.slice(prefix.length)))
      .sort().reverse(); // newest first (ISO dates sort lexically)
    const past = days.filter(k => k.slice(prefix.length) !== today);
    const room = Math.max(0, (keep | 0) - (days.length > past.length ? 1 : 0));
    return { compact: past.slice(0, room), drop: past.slice(room) };
  }

  const api = { CROSS, lineSide, segmentsIntersect, crossStep, foot, createLineCounter, newGrid, gridAdd, gridMax, gridNorm, heatColor,
    newDay, ensureDay, addMinute, hourAvg, peakHours, series, zoneStat, avgDwellSec, density, rate, funnelRates, densityLevel, aggDay,
    DAY_KEEP, compactDay, planPrune };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQCrowd = api;
})(typeof window !== "undefined" ? window : globalThis);
