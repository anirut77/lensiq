/* lensiq-sitecheck.js — on-site accuracy check ("ตรวจความแม่นยำหน้างาน") and camera health for the camera pages.
 *
 * Why: public benchmarks (ACCURACY.md) are not the customer's door, staff, cab or bottles. This module lets a shop run
 * a short, reproducible acceptance test on its own premises on day 1: the page runs as usual, a person labels what really
 * happened (taps each crossing, says who stood at the camera, follows a scripted eyes-closed prompt, marks good/bad
 * bottles), and the page computes its own accuracy on that site with 95% confidence intervals, a verdict against the
 * targets below, and recommended settings. Everything runs on the device: labels are timestamps and yes/no answers,
 * never images; the JSON export holds only those labels, the system's own events and the computed numbers.
 *
 * Also: frameStats()/createHealth() — a cheap per-camera health monitor (too dark, backlight, washed out, blurred,
 * camera shake, slow processing, people/faces too small) shown in the UI so a degraded camera is visible instead of
 * silently producing wrong counts. Thresholds were set from the robustness benchmark (ACCURACY.md §12 "Camera health indicator").
 *
 * Browser: window.LQSite · Node: require("./lensiq-sitecheck.js")
 *   wilson(x, n) -> {p, lo, hi}           poissonCI(k) -> {lo, hi}           needN(p, halfWidth) -> n
 *   matchCrossings(sys, truth, opts)       countReport(sys, truth, opts)       (store: door counting)
 *   createFaceTrial(opts)                  attendanceReport(trials)             (attendance: who stood at the camera)
 *   closureSchedule(opts)                  driverReport(input)                  (driver: prompted eyes-closed protocol)
 *   qcReport(rows, tol)                                                         (qc: operator-labelled bottles)
 *   visitorReport(sys, truth, opts)                                             (booth: visitor count vs tapped arrivals)
 *   demoReport(rows, opts)                                                      (signage: staff-labelled age band / gender)
 *   frameStats(img) · thumbShift(a, b) · createHealth(opts) · HEALTH            (camera health)
 *   createStall(opts) · videoClock(video) · stallStep(video, stats, now, opts)  (frozen-frame detection -> extra.stalled)
 *   renderReport(el, rep) · download(name, obj) · exportDoc(kind, payload) · history(key) · latestByCamera()
 *
 * Verdicts (round 10, CI-aware): every report has
 *   verdict     "pass"    = ผ่าน (ยืนยันแล้ว): enough data AND the whole 95% interval clears every target (Wilson lower
 *                           bound ≥ target for precision / recall / sensitivity / recognition; upper bound ≤ target for
 *                           stranger auto check-ins, QC misses / false rejects and false alarms; the bootstrap interval of
 *                           the net count error inside ±netErr)
 *               "ontrack" = every measured value meets its target but an interval still crosses it: "on target so far —
 *                           collect N more" (rep.need = [{group, more}], from needN() refined against the Wilson / Poisson /
 *                           bootstrap bound actually used)
 *               "more"    = some measured value is below its target (or missing) but the interval does not rule the target out
 *               "fail"    = some interval lies entirely on the wrong side of a target (or a serious error was seen)
 *   provisional the round-9 point verdict ("pass" | "more" | "fail": point estimates vs targets), kept for comparison
 */
(/** @param {any} root @param {() => any} factory */ function (root, factory) {
  const m = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = m; else root.LQSite = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const Z = 1.959964;
  const fin = v => typeof v === "number" && Number.isFinite(v);
  /** fmt("มี {a} คน", {a: 3}) — Thai sentences are written as one literal with {placeholders}, so each matches its
      dictionary template in i18n/zh-rt-sitecheck.js / en-rt-sitecheck.js (lensiq-i18n-rt translates the placeholders too) */
  const fmt = (t, o) => t.replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));
  const median = a => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const quant = (a, q) => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1)))); return s[i]; };

  /* ---------- statistics ---------- */
  /** Wilson score interval for x successes out of n. n = 0 -> p null, [0, 1]. */
  function wilson(x, n, z = Z) {
    if (!(n > 0)) return { x: x || 0, n: 0, p: null, lo: 0, hi: 1 };
    const p = x / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return { x, n, p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
  }
  function poissonCdf(k, mu) { let t = Math.exp(-mu), s = t; for (let i = 1; i <= k; i++) { t *= mu / i; s += t; } return s; }
  /** exact (Garwood) 95% interval of a Poisson count k, by bisection */
  function poissonCI(k, alpha = 0.05) {
    const solve = f => { let lo = 0, hi = Math.max(10, k * 4 + 20); for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m)) hi = m; else lo = m; } return (lo + hi) / 2; };
    const lo = k === 0 ? 0 : solve(mu => 1 - poissonCdf(k - 1, mu) >= alpha / 2);
    const hi = solve(mu => poissonCdf(k, mu) <= alpha / 2);
    return { k, lo, hi };
  }
  /** events needed so that the 95% interval of a proportion near p is about ±halfWidth */
  const needN = (p, halfWidth) => Math.ceil(Z * Z * Math.max(0.05, p) * Math.max(0.05, 1 - p) / (halfWidth * halfWidth));
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /**
   * How many MORE events (at the rate seen so far, x of n) until the Wilson bound clears the target:
   * side ">=" -> lower bound ≥ target, side "<=" -> upper bound ≤ target. needN() gives the first guess (normal
   * approximation), then the exact Wilson bound is searched. null = the observed rate itself does not meet the target
   * (more data cannot confirm it). deff (≥ 1) inflates the answer for clustered data (same people tested repeatedly).
   */
  function needMoreProp(x, n, target, side = ">=", deff = 1) {
    if (!(n > 0)) return null;
    const p = x / n, okAt = m => { const w = wilson(p * m, m); return side === ">=" ? w.lo >= target : w.hi <= target; };
    if (side === ">=" ? p <= target : p >= target) return null;
    if (okAt(n)) return 0;
    let a = n, b = Math.max(n + 1, needN(p, Math.abs(p - target)));
    while (!okAt(b) && b < 5e6) { a = b; b *= 2; }
    if (!okAt(b)) return null;
    while (b - a > 1) { const m = (a + b) >> 1; if (okAt(m)) b = m; else a = m; }
    return Math.ceil((b - n) * Math.max(1, deff || 1));
  }
  /** more exposure time (same unit as `t`) until the exact Poisson upper bound of k events in t is ≤ target per unit */
  function needMoreRate(k, t, target) {
    if (!(t > 0)) return null;
    const r = k / t; if (r >= target) return null;
    const okAt = T => poissonCI(Math.round(r * T)).hi / T <= target;
    if (okAt(t)) return 0;
    let a = t, b = t * 2; while (!okAt(b) && b < t * 1e4) { a = b; b *= 2; }
    if (!okAt(b)) return null;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (okAt(m)) b = m; else a = m; }
    return b - t;
  }
  /**
   * Cluster (or block) bootstrap of a pooled proportion: groups = [{x, n}] (one group = one person, or one time block of
   * frames). Resamples whole groups, so repeated trials of the same people — or neighbouring video frames — are not
   * treated as independent. null with fewer than 2 non-empty groups.
   */
  function clusterCI(groups, { reps = 2000, seed = 11 } = {}) {
    const G = groups.filter(g => g && g.n > 0); if (G.length < 2) return null;
    const r = rng(seed), est = [];
    for (let k = 0; k < reps; k++) { let x = 0, n = 0; for (let j = 0; j < G.length; j++) { const g = G[Math.floor(r() * G.length)]; x += g.x; n += g.n; } if (n) est.push(x / n); }
    const X = G.reduce((a, g) => a + g.x, 0), N = G.reduce((a, g) => a + g.n, 0);
    return { p: X / N, lo: quant(est, 0.025), hi: quant(est, 0.975), groups: G.length };
  }
  /** frames [{t, y: bool}] -> block-bootstrap interval of the share of y (blocks of blockMs; frames are not independent) */
  function blockPropCI(items, { blockMs = 10000, ...o } = {}) {
    const B = new Map();
    for (const f of items) { const k = Math.floor(f.t / blockMs); const g = B.get(k) || { x: 0, n: 0 }; g.n++; if (f.y) g.x++; B.set(k, g); }
    return clusterCI([...B.values()], o);
  }

  /* ---------- 1. door counting (store) ---------- */
  /**
   * Match the system's crossings with the person's taps. sys/truth = [{t: ms, dir: "in"|"out"}].
   * Humans tap late or early by a roughly constant amount, so the median offset of mutual-nearest pairs (within
   * maxLagMs) is removed first; then pairs within tolMs are matched greedily by time distance, one to one. Direction
   * is not required for a match; a matched pair with a different direction is a direction error.
   */
  function matchCrossings(sys, truth, { tolMs = 2000, maxLagMs = 4000 } = {}) {
    const S = sys.map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t), T = truth.map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t);
    const nearest = (arr, t) => { let best = null, bd = Infinity; for (const e of arr) { const d = Math.abs(e.t - t); if (d < bd) { bd = d; best = e; } } return best; };
    const lags = [];
    for (const s of S) { const t = nearest(T, s.t); if (t && Math.abs(t.t - s.t) <= maxLagMs && nearest(S, t.t) === s) lags.push(s.t - t.t); }
    const lag = lags.length >= 5 ? Math.max(-maxLagMs / 2, Math.min(maxLagMs / 2, median(lags))) : 0;
    const cand = [];
    for (const s of S) for (const t of T) { const d = Math.abs(s.t - lag - t.t); if (d <= tolMs) cand.push({ s, t, d }); }
    cand.sort((a, b) => a.d - b.d || a.s.t - b.s.t);
    const us = new Set(), ut = new Set(), pairs = [];
    for (const c of cand) if (!us.has(c.s.i) && !ut.has(c.t.i)) { us.add(c.s.i); ut.add(c.t.i); pairs.push({ sys: c.s, truth: c.t, dt: c.s.t - c.t.t, dirOk: c.s.dir === c.t.dir }); }
    return { pairs, lag, fp: S.filter(s => !us.has(s.i)), fn: T.filter(t => !ut.has(t.i)) };
  }
  /** block bootstrap (60-s blocks) of the net count error (counted − true) / true */
  function netErrorCI(sys, truth, { blockMs = 60000, reps = 2000, seed = 7 } = {}) {
    const all = sys.concat(truth); if (!truth.length || !all.length) return null;
    const t0 = Math.min(...all.map(e => e.t)), nb = Math.floor((Math.max(...all.map(e => e.t)) - t0) / blockMs) + 1;
    const bs = Array(nb).fill(0), bt = Array(nb).fill(0);
    sys.forEach(e => bs[Math.floor((e.t - t0) / blockMs)]++); truth.forEach(e => bt[Math.floor((e.t - t0) / blockMs)]++);
    if (nb < 3) return null;
    const r = rng(seed), est = [];
    for (let k = 0; k < reps; k++) { let a = 0, b = 0; for (let j = 0; j < nb; j++) { const i = Math.floor(r() * nb); a += bs[i]; b += bt[i]; } if (b > 0) est.push((a - b) / b); }
    return { lo: quant(est, 0.025), hi: quant(est, 0.975), blocks: nb };
  }
  const TARGETS = Object.freeze({
    store: { netErr: 0.10, precision: 0.85, dirAcc: 0.90, minTruth: 50 },
    attendance: { memberRecognised: 0.90, strangerAutoMax: 0.01, minMembers: 20, minStrangers: 20 },
    driver: { sensitivity: 0.90, falsePerHour: 1, minPrompts: 8 },
    qc: { falseReject: 0.02, miss: 0.02, minGood: 30, minBad: 10 },
    // booth (round 10): visitors the system created vs arrivals a person tapped; signage: staff-labelled passers
    booth: { netErr: 0.15, precision: 0.85, recall: 0.80, minTruth: 30 },
    signage: { gender: 0.90, band: 0.70, minRows: 50 }
  });
  /**
   * opts.stats (optional, from the page during the check): {hz: analysis rate, personH: median person height ÷ frame,
   * health: [issue codes seen], tiles: current tiling, swap}
   */
  function countReport(sys, truth, opts = {}) {
    const tg = { ...TARGETS.store, ...(opts.targets || {}) };
    const m = matchCrossings(sys, truth, opts), tp = m.pairs.length, dirOk = m.pairs.filter(p => p.dirOk).length;
    const nS = sys.length, nT = truth.length;
    const prec = wilson(tp, nS), rec = wilson(tp, nT), dir = wilson(dirOk, tp);
    const net = nT ? (nS - nT) / nT : null, netCI = netErrorCI(sys, truth, opts);
    const cnt = (a, d) => a.filter(e => e.dir === d).length;
    const rep = {
      kind: "store", n: { truth: nT, sys: nS, matched: tp, falseCount: m.fp.length, missed: m.fn.length, dirWrong: tp - dirOk },
      lagMs: Math.round(m.lag), net, netCI, precision: prec, recall: rec, dirAcc: dir,
      byDir: { truthIn: cnt(truth, "in"), truthOut: cnt(truth, "out"), sysIn: cnt(sys, "in"), sysOut: cnt(sys, "out") },
      targets: tg, recs: [], metrics: []
    };
    rep.metrics = [
      { k: "ยอดนับเทียบคนนับ", v: net == null ? "—" : `${nS} / ${nT} (${net >= 0 ? "+" : ""}${(net * 100).toFixed(1)}%)`, ci: netCI ? fmt("{a}% ถึง {b}%", { a: (netCI.lo * 100).toFixed(1), b: (netCI.hi * 100).toFixed(1) }) : "—", target: `±${tg.netErr * 100}%`, ok: net != null && Math.abs(net) <= tg.netErr, sure: !!netCI && netCI.lo >= -tg.netErr && netCI.hi <= tg.netErr },
      { k: "ครั้งที่นับแล้วถูก (ความแม่นยำ)", v: pctS(prec), ci: ciS(prec), target: `≥ ${tg.precision * 100}%`, ok: prec.p != null && prec.p >= tg.precision, sure: prec.p != null && prec.lo >= tg.precision },
      { k: "คนที่ผ่านแล้วถูกนับ (ความครบถ้วน)", v: pctS(rec), ci: ciS(rec), target: "—", ok: null },
      { k: "ทิศเข้า/ออกถูกต้อง", v: pctS(dir), ci: ciS(dir), target: `≥ ${tg.dirAcc * 100}%`, ok: dir.p != null && dir.p >= tg.dirAcc, sure: dir.p != null && dir.lo >= tg.dirAcc }
    ];
    const st = opts.stats || {}, R = rep.recs;
    if (tp >= 5 && dir.p != null && dir.p < 0.3) R.push("ทิศเข้า/ออกกลับด้านเกือบทั้งหมด — กด \"สลับทิศเข้า/ออก\" แล้วตรวจใหม่");
    if (fin(st.personH) && st.personH < 0.12) R.push(fmt("คนในภาพสูงเพียงราว {a}% ของภาพ (ควร ≥ 20%) — ติดกล้องใกล้ประตูขึ้น หรือเลือก \"คนตัวเล็ก/อยู่ไกล\"", { a: (st.personH * 100).toFixed(0) }));
    else if (fin(st.personH) && st.personH < 0.2 && rec.p != null && rec.p < 0.85 && !st.tiles) R.push("คนในภาพค่อนข้างเล็กและนับหลุดบ่อย — ลองตั้ง \"คนตัวเล็ก/อยู่ไกล\" เป็นแบ่งภาพซ้าย–ขวา แล้วตรวจใหม่");
    if (fin(st.hz) && st.hz < 4) R.push(fmt("ประมวลผลได้เพียง {a} ครั้ง/วินาที (ควร ≥ 5) — ลดจำนวนกล้อง ปิดการแบ่งภาพ หรือใช้เครื่องที่เร็วขึ้น", { a: st.hz.toFixed(1) }));
    if (prec.p != null && rec.p != null && prec.p < tg.precision && rec.p >= 0.85) R.push("นับเกิน (มีครั้งที่นับแต่ไม่มีคนผ่านจริง) — เปิด \"ลดการนับซ้ำ\" วาดเส้นนับให้ตั้งฉากกับทางเดินและห่างจากจุดที่คนยืนรอ");
    if (rec.p != null && rec.p < 0.8) R.push("นับไม่ครบ — ติดกล้องให้สูงขึ้นมองลงเฉียง ๆ ให้คนไม่บังกัน และวางเส้นนับตรงกลางภาพที่เห็นคนเต็มตัว");
    (st.health || []).forEach(c => { if (HEALTH_TH[c]) R.push("สภาพภาพระหว่างตรวจ: " + HEALTH_TH[c]); });
    applyJudge(rep, nT >= tg.minTruth, [
      netCheck(net, netCI, nT, tg.netErr, "crossings"),
      propCheck(prec, tg.precision, ">=", "crossings"),
      propCheck(dir, tg.dirAcc, ">=", "crossings")
    ], [{ group: "crossings", have: nT, min: tg.minTruth }]);
    if (nT < tg.minTruth) R.push(fmt("ต้องมีคนผ่านอย่างน้อย {a} ครั้ง (ตอนนี้ {b}) ช่วงความเชื่อมั่นจึงจะแคบพอ (ที่ {d} ครั้ง กว้างราว ±{c}%)", { a: tg.minTruth, b: nT, c: (Z * Math.sqrt(0.85 * 0.15 / Math.max(1, nT)) * 100).toFixed(0), d: nT }));
    return rep;
  }
  /* provisional (round-9) verdict: "pass" = enough data and every point estimate meets its target · "fail" = some
     interval lies entirely on the wrong side of a target · otherwise "more" (collect more events) */
  const hasCI = c => fin(c.lo) && fin(c.hi);
  function verdict(enough, checks) {
    let all = true;
    for (const c of checks) {
      if (c.v == null) { all = false; continue; }
      if (hasCI(c) && c.bad(c.lo, c.hi)) return "fail";
      if (!c.ok(c.v)) all = false;
    }
    return enough && all ? "pass" : "more";
  }
  /**
   * CI-aware verdict (see the header): checks = [{v, lo, hi, ok(v), bad(lo, hi), sure(lo, hi), need() -> {group, more}}],
   * mins = [{group, have, min}] minimum sample sizes. -> {verdict, provisional, need: [{group, more}]}
   */
  function judge(enough, checks, mins = []) {
    const provisional = verdict(enough, checks);
    const pointsOk = checks.every(c => c.v != null && c.ok(c.v));
    const sureAll = checks.every(c => hasCI(c) && c.sure(c.lo, c.hi));
    const need = new Map();
    const add = (g, m) => { if (g && fin(m) && m > 0) need.set(g, Math.max(need.get(g) || 0, Math.ceil(m))); };
    mins.forEach(m => add(m.group, m.min - m.have));
    if (pointsOk) checks.forEach(c => { if (!(hasCI(c) && c.sure(c.lo, c.hi)) && c.need) { const r = c.need(); if (r) add(r.group, r.more); } });
    const v = provisional === "fail" ? "fail" : pointsOk && sureAll && enough ? "pass" : pointsOk ? "ontrack" : "more";
    return { verdict: v, provisional, need: [...need].map(([group, more]) => ({ group, more })) };
  }
  function applyJudge(rep, enough, checks, mins) {
    const j = judge(enough, checks, mins);
    rep.verdict = j.verdict; rep.provisional = j.provisional; rep.need = j.need;
    // per-metric "sure" flag for the table (the whole interval clears the target)
    return j;
  }
  /** a Wilson-interval check: side ">=" (precision, recall, sensitivity) or "<=" (error rates) */
  function propCheck(w, target, side, group, deff = 1, ci = w) {
    return side === ">="
      ? { v: w.p, lo: ci.lo, hi: ci.hi, ok: v => v >= target, bad: (lo, hi) => hi < target, sure: lo => lo >= target, need: () => ({ group, more: needMoreProp(w.x, w.n, target, ">=", deff) }) }
      : { v: w.p, lo: ci.lo, hi: ci.hi, ok: v => v <= target, bad: lo => lo > target, sure: (lo, hi) => hi <= target, need: () => ({ group, more: needMoreProp(w.x, w.n, target, "<=", deff) }) };
  }
  /** net count error (bootstrap interval) inside ±t; need scales the interval width with 1/√n */
  function netCheck(net, ci, n, t, group) {
    return { v: net, lo: ci ? ci.lo : null, hi: ci ? ci.hi : null, ok: v => Math.abs(v) <= t, bad: (lo, hi) => hi < -t || lo > t, sure: (lo, hi) => lo >= -t && hi <= t,
      need: () => { if (!ci || !fin(net)) return null; const m = t - Math.abs(net); if (m <= 0) return null; const half = Math.max(net - ci.lo, ci.hi - net, 1e-9); return { group, more: Math.max(0, n * (half / m) * (half / m) - n) }; } };
  }
  const pctS = w => w.p == null ? "—" : `${(w.p * 100).toFixed(1)}% (${w.x}/${w.n})`;
  const FRAMES_NOTE = "เฟรมไม่เป็นอิสระต่อกัน — ช่วงความเชื่อมั่นจาก block bootstrap (สุ่มซ้ำทีละช่วงเวลา)";
  const ciS = w => w.p == null ? "—" : `${(w.lo * 100).toFixed(1)}–${(w.hi * 100).toFixed(1)}%`;

  /* ---------- 2. attendance: who stood at the camera ---------- */
  /**
   * One trial = one person stands at the camera for up to windowMs after the first face. step(obs, now) with
   * obs = {face: bool, label: id|null, confident: bool} for the largest face of the frame — the same 2-frame consensus
   * (createConfirm need 2 / 1.5 s) and "2 confident frames" rule as attendance.js. Returns null while undecided, then
   * {outcome: "auto"|"ask"|"none"|"noface", label, ms}.
   */
  function createFaceTrial({ windowMs = 6000, noFaceMs = 8000, gapMs = 1500 } = {}) {
    let t0 = null, first = null, cons = { label: null, n: 0, last: 0 }, sure = { label: null, n: 0, last: 0 }, ask = null, done = null;
    function step(obs, now) {
      if (done) return done;
      if (t0 == null) t0 = now;
      if (obs.face && first == null) first = now;
      if (obs.face && obs.label) {
        cons = cons.label === obs.label && now - cons.last <= gapMs ? { label: obs.label, n: cons.n + 1, last: now } : { label: obs.label, n: 1, last: now };
        if (obs.confident) sure = sure.label === obs.label && now - sure.last <= gapMs ? { label: obs.label, n: sure.n + 1, last: now } : { label: obs.label, n: 1, last: now };
        if (cons.n >= 2 && sure.label === obs.label && sure.n >= 2) return (done = { outcome: "auto", label: obs.label, ms: now - (first ?? now) });
        if (cons.n >= 2 && !ask) ask = { label: obs.label, at: now };
      }
      if (first != null && now - first >= windowMs) return (done = ask ? { outcome: "ask", label: ask.label, ms: ask.at - first } : { outcome: "none", label: null, ms: now - first });
      if (first == null && now - t0 >= noFaceMs) return (done = { outcome: "noface", label: null, ms: now - t0 });
      return null;
    }
    return { step, get done() { return done; } };
  }
  /** trials = [{truth: id|"stranger", outcome, label}] */
  function attendanceReport(trials, opts = {}) {
    const tg = { ...TARGETS.attendance, ...(opts.targets || {}) };
    const mem = trials.filter(t => t.truth !== "stranger" && t.outcome !== "noface"), str = trials.filter(t => t.truth === "stranger" && t.outcome !== "noface");
    const nf = trials.filter(t => t.outcome === "noface").length;
    const c = (a, f) => a.filter(f).length;
    const mAuto = c(mem, t => t.outcome === "auto" && t.label === t.truth), mAsk = c(mem, t => t.outcome === "ask" && t.label === t.truth);
    const mWrong = c(mem, t => (t.outcome === "auto" || t.outcome === "ask") && t.label !== t.truth), mWrongAuto = c(mem, t => t.outcome === "auto" && t.label !== t.truth);
    const sAuto = c(str, t => t.outcome === "auto"), sAsk = c(str, t => t.outcome === "ask");
    const recog = wilson(mAuto + mAsk, mem.length), auto = wilson(mAuto, mem.length), wrong = wilson(mWrong, mem.length);
    const fa = wilson(sAuto, str.length), sug = wilson(sAsk, str.length);
    // person-cluster bootstrap: the same people are usually tested many times, so trials are not independent — resample
    // whole people and use the wider of the Wilson and the cluster interval; the design effect inflates "collect N more"
    const byPerson = (a, key, hit) => { const M = new Map(); a.forEach(t => { const k = key(t); if (k == null) return; const g = M.get(k) || { x: 0, n: 0 }; g.n++; if (hit(t)) g.x++; M.set(k, g); }); return [...M.values()]; };
    const memG = byPerson(mem, t => t.truth, t => (t.outcome === "auto" || t.outcome === "ask") && t.label === t.truth);
    const strG = str.every(t => t.sid != null) ? byPerson(str, t => t.sid, t => t.outcome === "auto") : null;
    const widen = (w, cl) => cl ? { lo: Math.min(w.lo, cl.lo), hi: Math.max(w.hi, cl.hi) } : w;
    const deffOf = (w, cl) => cl && w.hi - w.lo > 1e-9 ? Math.max(1, Math.pow((cl.hi - cl.lo) / (w.hi - w.lo), 2)) : 1;
    const recogCl = clusterCI(memG), faCl = strG ? clusterCI(strG) : null;
    const recogCI = widen(recog, recogCl), faCI = widen(fa, faCl);
    const kindName = opts.kind || "attendance", cx = kindName === "customers";
    const rep = { kind: kindName, n: { members: mem.length, strangers: str.length, noFace: nf, memberAuto: mAuto, memberAsk: mAsk, memberWrong: mWrong, memberWrongAuto: mWrongAuto, strangerAuto: sAuto, strangerAsk: sAsk,
      distinctMembers: memG.length, distinctStrangers: strG ? strG.length : null },
      recognised: recog, recognisedCluster: recogCl, auto, wrong, strangerAuto: fa, strangerAutoCluster: faCl, strangerAsk: sug, targets: tg, recs: [] };
    const ub = str.length ? faCI.hi : null;
    rep.metrics = [
      { k: cx ? "สมาชิกที่ระบบจำได้ (รวมที่ให้แตะยืนยัน)" : "ผู้ลงทะเบียนที่ระบบจำได้ (รวมที่ให้กดยืนยัน)", v: pctS(recog), ci: ciS({ ...recog, ...recogCI }), target: `≥ ${tg.memberRecognised * 100}%`, ok: recog.p != null && recog.p >= tg.memberRecognised, sure: recog.p != null && recogCI.lo >= tg.memberRecognised,
        note: recogCl ? fmt("ทดสอบกับ {a} คน: ช่วงความเชื่อมั่นรวมการสุ่มซ้ำทีละคน (cluster bootstrap)", { a: memG.length }) : "" },
      { k: "…จำได้เองโดยไม่ต้องกดยืนยัน", v: pctS(auto), ci: ciS(auto), target: "—", ok: null },
      { k: cx ? "สมาชิกที่ถูกทักเป็นคนอื่น" : "ผู้ลงทะเบียนที่ถูกทักเป็นคนอื่น", v: pctS(wrong), ci: ciS(wrong), target: "0", ok: wrong.p != null && mWrongAuto === 0 },
      { k: cx ? "คนที่ไม่ใช่สมาชิกถูกเลือกเป็นสมาชิกอัตโนมัติ (ร้ายแรง)" : "คนนอกที่ถูกเช็คชื่ออัตโนมัติ (ร้ายแรง)", v: pctS(fa), ci: ub == null ? "—" : fmt("สูงสุดราว {a}%", { a: (ub * 100).toFixed(1) }), target: `≤ ${tg.strangerAutoMax * 100}%`, ok: fa.p != null && sAuto === 0, sure: ub != null && sAuto === 0 && ub <= tg.strangerAutoMax },
      { k: cx ? "คนที่ไม่ใช่สมาชิกที่ระบบเสนอชื่อให้แตะยืนยัน" : "คนนอกที่ระบบเสนอชื่อให้กดยืนยัน", v: pctS(sug), ci: ciS(sug), target: "—", ok: null }
    ];
    const R = rep.recs;
    if (sAuto > 0 || mWrongAuto > 0) R.push("มีการเช็คชื่อผิดคนโดยอัตโนมัติ — ลด \"ค่าความต่างใบหน้าสูงสุด\" ลงทีละ 0.03 แล้วตรวจใหม่ และให้เจ้าหน้าที่ดูรายการเช็คชื่อทุกวันจนกว่าจะตรวจผ่าน");
    if (recog.p != null && recog.p < 0.8) R.push("จำผู้ลงทะเบียนได้น้อย — ลงทะเบียนใหม่ ณ จุดที่ใช้งานจริงด้วยแสงเดียวกัน ให้หน้าตรงกล้องและใหญ่อย่างน้อย 1/5 ของภาพ");
    if (auto.p != null && recog.p != null && recog.p - auto.p > 0.3) R.push("ระบบไม่มั่นใจบ่อย (ต้องกดยืนยัน) — ปกติเมื่อมีผู้ลงทะเบียนน้อยกว่า 5 คน หรือแสงต่างจากตอนลงทะเบียน");
    if (sug.p != null && sug.p > 0.2) R.push("คนนอกถูกเสนอชื่อบ่อย — คงการกดยืนยันด้วยคนไว้ และอย่าเปิดให้เช็คชื่อโดยไม่มีเจ้าหน้าที่ดูแล");
    if (nf > 0) R.push(fmt("{a} รอบไม่พบใบหน้าเลย — ตรวจแสง มุมกล้อง และระยะยืน", { a: nf }));
    const gM = cx ? "cxMembers" : "members", gS = cx ? "cxStrangers" : "strangers";
    applyJudge(rep, mem.length >= tg.minMembers && str.length >= tg.minStrangers, [
      propCheck(recog, tg.memberRecognised, ">=", gM, deffOf(recog, recogCl), { ...recog, ...recogCI }),
      propCheck(fa, tg.strangerAutoMax, "<=", gS, deffOf(fa, faCl), { ...fa, ...faCI })
    ], [{ group: gM, have: mem.length, min: tg.minMembers }, { group: gS, have: str.length, min: tg.minStrangers }]);
    if (mWrongAuto + sAuto > 0) { rep.verdict = "fail"; rep.provisional = "fail"; rep.need = []; }
    else if (str.length && !(faCI.hi <= tg.strangerAutoMax)) {
      const nS = (rep.need.find(x => x.group === gS) || {}).more;
      R.push(cx ? fmt("ยังไม่มีการเลือกลูกค้าผิดคนโดยอัตโนมัติ — แต่ต้องทดสอบคนที่ไม่ใช่สมาชิกเพิ่มอีกราว {a} รอบ จึงจะยืนยันได้ว่าอัตราไม่เกิน {b}%", { a: nS || "—", b: tg.strangerAutoMax * 100 })
        : fmt("ยังไม่มีการเช็คชื่อผิดอัตโนมัติ — แต่ต้องทดสอบคนนอกเพิ่มอีกราว {a} รอบ จึงจะยืนยันได้ว่าอัตราไม่เกิน {b}%", { a: nS || "—", b: tg.strangerAutoMax * 100 }));
    }
    if (memG.length && memG.length < 5) R.push(fmt("ทดสอบผู้ลงทะเบียนเพียง {a} คน — ผลจากการทดสอบคนเดิมซ้ำหลายรอบอาจไม่เป็นตัวแทน ควรทดสอบ 5 คนขึ้นไป", { a: memG.length }));
    if (mem.length < tg.minMembers || str.length < tg.minStrangers) R.push(fmt("ต้องทดสอบผู้ลงทะเบียนอย่างน้อย {a} รอบ และคนนอกอย่างน้อย {b} รอบ (ตอนนี้ {c} / {d}) — คนนอก 0 ใน {e} รอบยังบอกได้เพียงว่าอัตราไม่เกินราว {f}%", { a: tg.minMembers, b: tg.minStrangers, c: mem.length, d: str.length, e: Math.max(1, str.length), f: (wilson(0, Math.max(1, str.length)).hi * 100).toFixed(0) }));
    return rep;
  }

  /* ---------- 3. driver: prompted eyes-closed protocol (parked car only) ---------- */
  /** seeded schedule: n prompts, each "close your eyes for closeMs", spread over durationMs after startMs */
  function closureSchedule({ durationMs = 300000, n = 8, closeMs = 3000, startMs = 20000, seed = Date.now() } = {}) {
    const r = rng(seed), slot = (durationMs - startMs - closeMs - 8000) / n, out = [];
    for (let i = 0; i < n; i++) out.push({ at: Math.round(startMs + i * slot + r() * Math.max(0, slot - closeMs - 6000)), closeMs });
    return out;
  }
  /**
   * input = {t0, durationMs, prompts: [{at (ms from t0), closeMs, skip?}], events: [{t (abs ms, start), at? (when raised), type, level}],
   *          frames: [{t, closed, face}]}
   * hit = a long_closure alert starting within [prompt, prompt + closeMs + 2 s]; false alarm = a long_closure / perclos /
   * microsleep alert outside every [prompt − 1 s, prompt + closeMs + 5 s]. Frame rates: "closed" frames 0.7 s into each
   * prompt until 0.3 s before its end, and "open" frames ≥ 1.5 s away from any prompt.
   */
  function driverReport(input, opts = {}) {
    const tg = { ...TARGETS.driver, ...(opts.targets || {}) };
    const { t0, durationMs } = input, P = (input.prompts || []).filter(p => !p.skip);
    const ev = (input.events || []).filter(e => ["long_closure", "perclos", "microsleep"].includes(e.type));
    const inWin = (t, a, b) => P.some(p => t >= t0 + p.at + a && t <= t0 + p.at + p.closeMs + b);
    let hits = 0; const lat = [];
    for (const p of P) {
      const e = ev.find(x => x.type === "long_closure" && x.t >= t0 + p.at && x.t <= t0 + p.at + p.closeMs + 2000);
      if (e) { hits++; lat.push((e.at ?? e.t) - (t0 + p.at)); }
    }
    const fas = ev.filter(e => !inWin(e.t, -1000, 5000)), alarms = fas.filter(e => e.type !== "microsleep");
    const closedF = [], openF = [];
    for (const f of input.frames || []) {
      if (!f.face) continue;
      if (P.some(p => f.t >= t0 + p.at + 700 && f.t <= t0 + p.at + p.closeMs - 300)) closedF.push(f);
      else if (!inWin(f.t, -1500, 1500)) openF.push(f);
    }
    const openMs = Math.max(1, durationMs - P.reduce((a, p) => a + p.closeMs + 6000, 0));
    const sens = wilson(hits, P.length), fpF = wilson(openF.filter(f => f.closed).length, openF.length), tpF = wilson(closedF.filter(f => f.closed).length, closedF.length);
    const ci = poissonCI(alarms.length), perH = 3600000 / openMs;
    // frame-level rates: neighbouring frames are not independent (15 fps of the same eyes) -> 10-s block bootstrap
    const fpB = blockPropCI(openF.map(f => ({ t: f.t, y: f.closed })), { blockMs: 10000 }), tpB = blockPropCI(closedF.map(f => ({ t: f.t, y: f.closed })), { blockMs: 3000 });
    const rep = { kind: "driver", n: { prompts: P.length, hits, falseAlarms: alarms.length, microsleepNotices: fas.length - alarms.length, openFrames: openF.length, closedFrames: closedF.length, noFaceFrames: (input.frames || []).filter(f => !f.face).length },
      sensitivity: sens, latencyMs: median(lat), falsePerHour: { v: alarms.length * perH, lo: ci.lo * perH, hi: ci.hi * perH, openMin: openMs / 60000 }, openFrameClosed: fpF, closedFrameClosed: tpF,
      openFrameClosedBlock: fpB, closedFrameClosedBlock: tpB, framesIndependent: false, distinctPeople: 1, targets: tg, recs: [] };
    rep.metrics = [
      { k: "การหลับตาตามคำสั่งที่ระบบเตือน", v: pctS(sens), ci: ciS(sens), target: `≥ ${tg.sensitivity * 100}%`, ok: sens.p != null && sens.p >= tg.sensitivity, sure: sens.p != null && sens.lo >= tg.sensitivity },
      { k: "เวลาตั้งแต่หลับตาถึงเตือน (มัธยฐาน)", v: rep.latencyMs == null ? "—" : fmt("{a} วินาที", { a: (rep.latencyMs / 1000).toFixed(1) }), ci: "—", target: "≤ 2.5 วินาที", ok: rep.latencyMs == null ? null : rep.latencyMs <= 2500 },
      { k: "เตือนผิดขณะลืมตา (ครั้ง/ชั่วโมง)", v: fmt("{a} ({b} ครั้งใน {c} นาที)", { a: rep.falsePerHour.v.toFixed(1), b: alarms.length, c: (openMs / 60000).toFixed(1) }), ci: `${rep.falsePerHour.lo.toFixed(1)}–${rep.falsePerHour.hi.toFixed(1)}`, target: `≤ ${tg.falsePerHour}`, ok: rep.falsePerHour.v <= tg.falsePerHour, sure: rep.falsePerHour.hi <= tg.falsePerHour },
      { k: "เฟรมลืมตาที่ถูกมองว่าหลับตา", v: pctS(fpF), ci: fpB ? ciS({ ...fpF, ...fpB }) : ciS(fpF), target: "—", ok: null, note: FRAMES_NOTE },
      { k: "เฟรมหลับตาที่ระบบเห็นว่าหลับตา", v: pctS(tpF), ci: tpB ? ciS({ ...tpF, ...tpB }) : ciS(tpF), target: "—", ok: null, note: FRAMES_NOTE }
    ];
    const R = rep.recs;
    if (sens.p != null && sens.p < tg.sensitivity && tpF.p != null && tpF.p < 0.7) R.push("ระบบเห็นการหลับตาไม่ชัด — ปรับเทียบใหม่ขณะลืมตาตามปกติ ติดกล้องให้อยู่ระดับสายตาตรงหน้าคนขับ และให้มีแสงที่ใบหน้า (กลางคืนต้องใช้กล้องอินฟราเรด)");
    if (alarms.length > 0 && fpF.p != null && fpF.p > 0.03) R.push("เตือนผิดขณะลืมตา — กด \"ปรับเทียบใหม่\" ในแสงที่ใช้ขับจริง ลดแสงสะท้อนบนแว่น และอย่าให้กล้องมองจากด้านล่างมากเกินไป");
    if (rep.n.noFaceFrames > 0.2 * Math.max(1, (input.frames || []).length)) R.push("ไม่พบใบหน้าในหลายเฟรม — ปรับมุมกล้องให้เห็นใบหน้าเต็ม และหลีกเลี่ยงแสงย้อนจากกระจกหน้า");
    const fph = rep.falsePerHour, openMin = openMs / 60000;
    applyJudge(rep, P.length >= tg.minPrompts, [
      propCheck(sens, tg.sensitivity, ">=", "prompts"),
      { v: fph.v, lo: fph.lo, hi: fph.hi, ok: v => v <= tg.falsePerHour, bad: lo => lo > tg.falsePerHour, sure: (lo, hi) => hi <= tg.falsePerHour,
        need: () => { const m = needMoreRate(alarms.length, openMin / 60, tg.falsePerHour); return { group: "openMin", more: m == null ? null : m * 60 }; } }
    ], [{ group: "prompts", have: P.length, min: tg.minPrompts }]);
    if (P.length < tg.minPrompts) R.push(fmt("ต้องทำตามคำสั่งหลับตาอย่างน้อย {a} ครั้ง (ตอนนี้ {b})", { a: tg.minPrompts, b: P.length }));
    R.push("ผลนี้เป็นการหลับตาโดยตั้งใจขณะจอดรถ ไม่ใช่อาการง่วงจริงระหว่างขับ — ใช้ตรวจว่ากล้อง มุม และแสงในรถคันนี้ใช้งานได้ ไม่ใช่การรับรองความปลอดภัย");
    return rep;
  }

  /* ---------- 4. QC: operator-labelled bottles ---------- */
  // metric key -> [reason code, how the page judges (">": reject when value > tol, "<": reject when value < tol), tol key, label]
  const QC_METRICS = {
    fill: ["under|over", ">", "fill", "ระดับน้ำ (px จากเป้า)"],
    capDE: ["capColor", ">", "capDE", "สีฝา ΔE"],
    capTilt: ["capTilt", ">", "capTilt", "ฝาเอียง (องศา)"],
    capHigh: ["capHigh", ">", "capHigh", "ฝายกสูง (px)"],
    labelSim: ["labelShift", "<", "labelSim", "ความคล้ายฉลาก (%)"],
    labelShift: ["labelShift", ">", "labelShift", "ฉลากเลื่อน (px)"],
    labelAngle: ["labelShift", ">", "labelAngle", "ฉลากเอียง (องศา)"]
  };
  /** values the page measured for one inspection result r (QC.inspect output) -> {fill, capDE, ...} (absolute values) */
  function qcValues(r) {
    const v = {};
    if (r.fill && fin(r.fill.dy)) { v.fill = Math.abs(r.fill.dy); v.fillTolPx = r.fill.tolPx; }
    if (r.cap) { if (fin(r.cap.de)) v.capDE = r.cap.de; if (fin(r.cap.dAngle)) v.capTilt = Math.abs(r.cap.dAngle); if (fin(r.cap.dTop)) v.capHigh = r.cap.dTop; }
    if (r.label) { if (fin(r.label.sim)) v.labelSim = r.label.sim; if (fin(r.label.shift)) v.labelShift = Math.abs(r.label.shift); if (fin(r.label.angle)) v.labelAngle = Math.abs(r.label.angle); }
    return v;
  }
  /** rows = [{pass, reasons, v: qcValues(r), truth: "good"|"bad"}] · tol = rec.tol (fill in px or %; fillTolPx per row) */
  function qcReport(rows, tol = {}, opts = {}) {
    const tg = { ...TARGETS.qc, ...(opts.targets || {}) };
    const L = rows.filter(r => r.truth === "good" || r.truth === "bad");
    const good = L.filter(r => r.truth === "good"), bad = L.filter(r => r.truth === "bad");
    const fr = good.filter(r => !r.pass), miss = bad.filter(r => r.pass);
    const frr = wilson(fr.length, good.length), mr = wilson(miss.length, bad.length);
    const rep = { kind: "qc", n: { good: good.length, bad: bad.length, falseReject: fr.length, missed: miss.length, unlabelled: rows.length - L.length }, falseReject: frr, miss: mr, targets: tg, recs: [], tolSuggest: [] };
    rep.metrics = [
      { k: "ขวดดีที่ถูกคัดทิ้ง", v: pctS(frr), ci: ciS(frr), target: `≤ ${tg.falseReject * 100}%`, ok: frr.p != null && frr.p <= tg.falseReject, sure: frr.p != null && frr.hi <= tg.falseReject },
      { k: "ขวดเสียที่หลุดผ่าน", v: pctS(mr), ci: ciS(mr), target: `≤ ${tg.miss * 100}%`, ok: mr.p != null && mr.p <= tg.miss, sure: mr.p != null && mr.hi <= tg.miss }
    ];
    const reasonCount = {};
    fr.forEach(r => r.reasons.forEach(k => { reasonCount[k] = (reasonCount[k] || 0) + 1; }));
    for (const [key, [reason, dirn, tk, label]] of Object.entries(QC_METRICS)) {
      const cur = key === "fill" ? null : tol[tk];
      const gv = good.map(r => r.v && r.v[key]).filter(fin), bv = bad.filter(r => reason.split("|").some(x => r.reasons.includes(x)) || r.pass).map(r => r.v && r.v[key]).filter(fin);
      const flagged = fr.filter(r => reason.split("|").some(x => r.reasons.includes(x))).length;
      if (!flagged || !gv.length) continue;
      // fill: work in px (tolPx of the row); suggestion converted back to the recipe's unit by the ratio
      const curPx = key === "fill" ? median(fr.map(r => r.v.fillTolPx).filter(fin)) : cur;
      if (!fin(curPx)) continue;
      const worstGood = dirn === ">" ? Math.max(...gv) : Math.min(...gv);
      const want = dirn === ">" ? worstGood * 1.1 + 0.2 : worstGood * 0.95;
      const badVals = bv.filter(x => dirn === ">" ? x > curPx : x < curPx);
      const sep = !badVals.length || (dirn === ">" ? Math.min(...badVals) > want : Math.max(...badVals) < want);
      const sugg = key === "fill" ? (tol.fillUnit === "%" ? +(tol.fill * want / curPx).toFixed(1) : +want.toFixed(1)) : +want.toFixed(dirn === "<" ? 0 : 1);
      rep.tolSuggest.push({ key, tol: tk, label, current: key === "fill" ? tol.fill : cur, suggest: sugg, separable: sep, goodFlagged: flagged });
      rep.recs.push(sep
        ? fmt("{a}: ขวดดี {b} ขวดถูกคัดทิ้งด้วยเกณฑ์นี้ — ปรับเกณฑ์จาก {c} เป็นราว {d}{e} (ขวดเสียที่ติดป้ายไว้ยังถูกคัดออก)", { a: label, b: flagged, c: key === "fill" ? tol.fill : cur, d: sugg, e: key === "fill" && tol.fillUnit === "%" ? "%" : "" })
        : fmt("{a}: ค่าของขวดดีและขวดเสียซ้อนกัน ปรับเกณฑ์อย่างเดียวไม่พอ — ตรวจแสง ตำแหน่งหยุดขวด และสอบเทียบขวดตัวอย่างใหม่", { a: label }));
    }
    if (miss.length) rep.recs.push(fmt("ขวดเสีย {a} ขวดที่ระบบให้ผ่าน — ตรวจว่าเป็นข้อบกพร่องที่ระบบไม่ได้ตรวจ (รอยขีดข่วน บุบ สิ่งแปลกปลอม) หรือเกณฑ์หลวมเกินไป", { a: miss.length }));
    if (Object.keys(reasonCount).length) rep.reasonCount = reasonCount;
    applyJudge(rep, good.length >= tg.minGood && bad.length >= tg.minBad, [
      propCheck(frr, tg.falseReject, "<=", "good"),
      propCheck(mr, tg.miss, "<=", "bad")
    ], [{ group: "good", have: good.length, min: tg.minGood }, { group: "bad", have: bad.length, min: tg.minBad }]);
    if (good.length < tg.minGood || bad.length < tg.minBad) rep.recs.push(fmt("ควรตรวจขวดดีอย่างน้อย {a} ขวด และขวดเสียที่รู้ข้อบกพร่องอย่างน้อย {b} ขวด (ตอนนี้ {c} / {d})", { a: tg.minGood, b: tg.minBad, c: good.length, d: bad.length }));
    return rep;
  }

  /* ---------- 5. booth: visitors the system created vs arrivals a person tapped ---------- */
  /**
   * sys = [{t}] the moment each new visitor (V###) was created, truth = [{t}] one tap per real arrival at the booth.
   * Same matching as the door check (tap lag removed, one to one) with a wider window: a visitor is created only after
   * PROMOTE_MS of continuous sight, so the system is later than the tap. Counts are what the booth dashboard reports.
   */
  function visitorReport(sys, truth, opts = {}) {
    const tg = { ...TARGETS.booth, ...(opts.targets || {}) };
    const S = sys.map(e => ({ t: e.t, dir: "in" })), T = truth.map(e => ({ t: e.t, dir: "in" }));
    const m = matchCrossings(S, T, { tolMs: opts.tolMs || 4000, maxLagMs: opts.maxLagMs || 6000 }), tp = m.pairs.length;
    const nS = S.length, nT = T.length, prec = wilson(tp, nS), rec = wilson(tp, nT);
    const net = nT ? (nS - nT) / nT : null, netCI = netErrorCI(S, T, opts);
    const rep = { kind: "booth", n: { truth: nT, sys: nS, matched: tp, falseCount: m.fp.length, missed: m.fn.length }, lagMs: Math.round(m.lag), net, netCI, precision: prec, recall: rec, targets: tg, recs: [] };
    rep.metrics = [
      { k: "ผู้เข้าชมที่ระบบนับเทียบคนนับ", v: net == null ? "—" : `${nS} / ${nT} (${net >= 0 ? "+" : ""}${(net * 100).toFixed(1)}%)`, ci: netCI ? fmt("{a}% ถึง {b}%", { a: (netCI.lo * 100).toFixed(1), b: (netCI.hi * 100).toFixed(1) }) : "—", target: `±${tg.netErr * 100}%`, ok: net != null && Math.abs(net) <= tg.netErr, sure: !!netCI && netCI.lo >= -tg.netErr && netCI.hi <= tg.netErr },
      { k: "ผู้เข้าชมที่ระบบนับแล้วมีคนมาจริง (ความแม่นยำ)", v: pctS(prec), ci: ciS(prec), target: `≥ ${tg.precision * 100}%`, ok: prec.p != null && prec.p >= tg.precision, sure: prec.p != null && prec.lo >= tg.precision },
      { k: "คนที่มาบูธแล้วถูกนับ (ความครบถ้วน)", v: pctS(rec), ci: ciS(rec), target: `≥ ${tg.recall * 100}%`, ok: rec.p != null && rec.p >= tg.recall, sure: rec.p != null && rec.lo >= tg.recall }
    ];
    const st = opts.stats || {}, R = rep.recs;
    if (prec.p != null && prec.p < tg.precision) R.push(opts.countOnly ? "นับเกิน — โหมดนับอย่างเดียวนับคนที่เดินออกแล้วกลับมา หรือถูกบังนานเป็นคนใหม่ ติดกล้องให้เห็นหน้าคนตรง ๆ และไม่ให้คนบังกัน" : "นับเกิน — คนเดียวถูกนับหลายครั้ง ติดกล้องระดับสายตาให้เห็นหน้าตรง และเพิ่มแสงที่ใบหน้า");
    if (rec.p != null && rec.p < tg.recall) R.push("นับไม่ครบ — ใบหน้าเล็ก หันข้าง หรือเดินผ่านเร็วเกินไป (ต้องเห็นต่อเนื่องอย่างน้อย 1 วินาที) ติดกล้องใกล้จุดที่คนหยุดชม");
    if (fin(st.faceW) && st.faceW < HEALTH.faceSmallWarn) R.push("ใบหน้าเล็กเกินไป — ให้เข้าใกล้กล้องมากขึ้น");
    (st.health || []).forEach(c => { if (HEALTH_TH[c]) R.push("สภาพภาพระหว่างตรวจ: " + HEALTH_TH[c]); });
    applyJudge(rep, nT >= tg.minTruth, [netCheck(net, netCI, nT, tg.netErr, "visitors"), propCheck(prec, tg.precision, ">=", "visitors"), propCheck(rec, tg.recall, ">=", "visitors")],
      [{ group: "visitors", have: nT, min: tg.minTruth }]);
    if (nT < tg.minTruth) R.push(fmt("ต้องมีผู้มาบูธอย่างน้อย {a} คน (ตอนนี้ {b}) ช่วงความเชื่อมั่นจึงจะแคบพอ", { a: tg.minTruth, b: nT }));
    return rep;
  }

  /* ---------- 6. signage: staff-labelled age band / gender of each passer ---------- */
  const BANDS = ["u18", "18_34", "35_54", "55p"], BAND_LBL = { u18: "ต่ำกว่า 18", "18_34": "18–34", "35_54": "35–54", "55p": "55+" };
  const GENDER_LBL = { male: "ชาย", female: "หญิง", unk: "ไม่แน่ใจ" };
  /**
   * rows = [{truthBand: u18|18_34|35_54|55p, truthGender: male|female, band: …|null (no estimate), gender: male|female|unk}]
   * one row per passer (the system's per-person estimate when the person leaves). Gender accuracy is counted only where
   * the system called a gender ("unk" = not called, its own rate); age band exact and within one band.
   */
  function demoReport(rows, opts = {}) {
    const tg = { ...TARGETS.signage, ...(opts.targets || {}) };
    const L = rows.filter(r => BANDS.includes(r.truthBand) || r.truthGender === "male" || r.truthGender === "female");
    const est = L.filter(r => r.band != null || (r.gender && r.gender !== "unk"));
    const gL = L.filter(r => r.truthGender === "male" || r.truthGender === "female"), gCalled = gL.filter(r => r.gender === "male" || r.gender === "female");
    const bL = L.filter(r => BANDS.includes(r.truthBand) && BANDS.includes(r.band));
    const gOk = wilson(gCalled.filter(r => r.gender === r.truthGender).length, gCalled.length), gCall = wilson(gCalled.length, gL.length);
    const bOk = wilson(bL.filter(r => r.band === r.truthBand).length, bL.length), b1 = wilson(bL.filter(r => Math.abs(BANDS.indexOf(r.band) - BANDS.indexOf(r.truthBand)) <= 1).length, bL.length);
    const cov = wilson(est.length, L.length);
    const conf = (keysT, keysS, tk, sk, a) => keysT.map(t => keysS.map(x => a.filter(r => r[tk] === t && (r[sk] || (sk === "gender" ? "unk" : null)) === x).length));
    const bandC = conf(BANDS, BANDS.concat([null]), "truthBand", "band", L.filter(r => BANDS.includes(r.truthBand)));
    const genC = conf(["male", "female"], ["male", "female", "unk"], "truthGender", "gender", gL);
    const rep = { kind: "signage", n: { labelled: L.length, estimated: est.length, genderLabelled: gL.length, genderCalled: gCalled.length, bandScored: bL.length }, gender: gOk, genderCalled: gCall, band: bOk, bandWithin1: b1, coverage: cov, confusion: { band: bandC, gender: genC }, targets: tg, recs: [] };
    rep.metrics = [
      { k: "ผู้ผ่านที่ระบบประมาณอายุ/เพศได้", v: pctS(cov), ci: ciS(cov), target: "—", ok: null },
      { k: "เพศถูก (เฉพาะที่ระบบระบุเพศ)", v: pctS(gOk), ci: ciS(gOk), target: `≥ ${tg.gender * 100}%`, ok: gOk.p != null && gOk.p >= tg.gender, sure: gOk.p != null && gOk.lo >= tg.gender },
      { k: "ระบบระบุเพศ (ไม่ใช่ \"ไม่แน่ใจ\")", v: pctS(gCall), ci: ciS(gCall), target: "—", ok: null },
      { k: "ช่วงอายุถูกตรงช่วง", v: pctS(bOk), ci: ciS(bOk), target: `≥ ${tg.band * 100}%`, ok: bOk.p != null && bOk.p >= tg.band, sure: bOk.p != null && bOk.lo >= tg.band },
      { k: "ช่วงอายุคลาดไม่เกิน 1 ช่วง", v: pctS(b1), ci: ciS(b1), target: "—", ok: null }
    ];
    rep.tables = [
      { title: "ตารางเทียบช่วงอายุ (แถว = ที่เจ้าหน้าที่ระบุ, คอลัมน์ = ที่ระบบประมาณ)", cols: BANDS.map(b => BAND_LBL[b]).concat(["ไม่ได้ประมาณ"]), rows: BANDS.map((b, i) => [BAND_LBL[b]].concat(bandC[i])) },
      { title: "ตารางเทียบเพศ (แถว = ที่เจ้าหน้าที่ระบุ, คอลัมน์ = ที่ระบบประมาณ)", cols: ["ชาย", "หญิง", "ไม่แน่ใจ"], rows: ["male", "female"].map((g, i) => [GENDER_LBL[g]].concat(genC[i])) }
    ];
    const R = rep.recs;
    if (cov.p != null && cov.p < 0.7) R.push("ระบบประมาณอายุ/เพศได้น้อย — ใบหน้าเล็กหรือหันข้าง ติดกล้องใกล้ระดับสายตาตรงจุดที่คนหยุดดูจอ");
    if (bOk.p != null && bOk.p < tg.band) R.push("ช่วงอายุคลาดบ่อย — ใช้ช่วงอายุเป็นแนวโน้มรวมเท่านั้น หรือปิด \"ใช้อายุ/เพศ\" และเลือกโฆษณาตามช่วงเวลาแทน");
    if (gOk.p != null && gOk.p < tg.gender) R.push("เพศคลาดบ่อยที่จุดนี้ — ตรวจแสงและมุมกล้อง อย่าใช้เพศเลือกโฆษณาจนกว่าจะตรวจผ่าน");
    (opts.health || []).forEach(c => { if (HEALTH_TH[c]) R.push("สภาพภาพระหว่างตรวจ: " + HEALTH_TH[c]); });
    applyJudge(rep, L.length >= tg.minRows, [propCheck(gOk, tg.gender, ">=", "passers"), propCheck(bOk, tg.band, ">=", "passers")], [{ group: "passers", have: L.length, min: tg.minRows }]);
    if (L.length < tg.minRows) R.push(fmt("ควรระบุผู้ผ่านอย่างน้อย {a} คน (ตอนนี้ {b}) หลายช่วงอายุและทั้งสองเพศ", { a: tg.minRows, b: L.length }));
    R.push("อายุและเพศที่เจ้าหน้าที่ระบุก็เป็นการประมาณด้วยสายตา — ถ้าไม่แน่ใจช่วงอายุของใคร ให้ข้ามคนนั้น");
    return rep;
  }

  /* ---------- camera health ---------- */
  /**
   * img = {data: RGBA, width, height} (a small downscale, ~160 px wide). Returns luma statistics, sharpness and a
   * 32×18 grey thumbnail for shake estimation. Costs well under 1 ms at 160×90.
   */
  function frameStats(img) {
    const { data, width: W, height: H } = img, n = W * H, Y = new Float32Array(n), hist = new Uint32Array(256);
    let sum = 0;
    for (let i = 0, j = 0; i < n; i++, j += 4) { const y = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]; Y[i] = y; sum += y; hist[Math.min(255, y | 0)]++; }
    const pAt = q => { let c = 0; const k = q * n; for (let v = 0; v < 256; v++) { c += hist[v]; if (c >= k) return v; } return 255; };
    let dark = 0, clip = 0; for (let v = 0; v < 35; v++) dark += hist[v]; for (let v = 245; v < 256; v++) clip += hist[v];
    // sharpness: mean |Laplacian| over pixels that are not clipped, relative to the image's own contrast
    let lap = 0, ln = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, c = Y[i]; if (c >= 245 || c < 3) continue;
      lap += Math.abs(4 * c - Y[i - 1] - Y[i + 1] - Y[i - W] - Y[i + W]); ln++;
    }
    const p5 = pAt(0.05), p50 = pAt(0.5), p95 = pAt(0.95), contrast = p95 - p5;
    // brightest / darkest of 4×3 cells (backlight = a very bright region next to a dark scene)
    const cells = [];
    for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < 4; cx++) {
      let s = 0, k = 0; const x0 = Math.floor(cx * W / 4), x1 = Math.floor((cx + 1) * W / 4), y0 = Math.floor(cy * H / 3), y1 = Math.floor((cy + 1) * H / 3);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += Y[y * W + x]; k++; }
      cells.push(k ? s / k : 0);
    }
    const TW = 32, TH = 18, thumb = new Float32Array(TW * TH);
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      let s = 0, k = 0; const x0 = Math.floor(tx * W / TW), x1 = Math.max(x0 + 1, Math.floor((tx + 1) * W / TW)), y0 = Math.floor(ty * H / TH), y1 = Math.max(y0 + 1, Math.floor((ty + 1) * H / TH));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += Y[y * W + x]; k++; }
      thumb[ty * TW + tx] = s / k;
    }
    return { mean: sum / n, p5, p50, p95, contrast, dark: dark / n, clip: clip / n, sharp: ln ? lap / ln / Math.max(16, contrast) * 100 : 0, cellMax: Math.max(...cells), cellMin: Math.min(...cells), thumb, tw: TW, th: TH, w: W };
  }
  /**
   * global shift between two thumbnails (±4 × ±3 cells) as a fraction of the frame. The match score is the MEDIAN absolute
   * difference over all cells, so a person walking through (a minority of cells) does not look like a camera move; the
   * shift is reported only when it explains the frame clearly better than "no move" (and a flat frame gives no shift).
   */
  function thumbShift(a, b, TW = 32, TH = 18) {
    if (!a || !b || a.length !== b.length) return null;
    const score = (sx, sy) => {
      const d = [];
      for (let y = Math.max(0, -sy); y < Math.min(TH, TH - sy); y++) for (let x = Math.max(0, -sx); x < Math.min(TW, TW - sx); x++) d.push(Math.abs(a[y * TW + x] - b[(y + sy) * TW + x + sx]));
      d.sort((p, q) => p - q); return d[d.length >> 1];
    };
    const s0 = score(0, 0); let best = { sx: 0, sy: 0, e: s0 };
    for (let sy = -3; sy <= 3; sy++) for (let sx = -4; sx <= 4; sx++) { if (!sx && !sy) continue; const e = score(sx, sy); if (e < best.e - 1e-6) best = { sx, sy, e }; }
    if (!(s0 > 2)) return { dx: 0, dy: 0 }; // flat frame: nothing to measure
    // sub-cell refinement: parabola through the scores either side of the best integer shift (the thumbnail is
    // 32 cells wide, so a 2% camera jitter is less than one cell)
    const sub = (em, e0, ep) => { const d = em + ep - 2 * e0; return d > 1e-6 ? Math.max(-0.5, Math.min(0.5, (em - ep) / (2 * d))) : 0; };
    const fx = best.sx + sub(score(best.sx - 1, best.sy), best.e, score(best.sx + 1, best.sy));
    const fy = best.sy + sub(score(best.sx, best.sy - 1), best.e, score(best.sx, best.sy + 1));
    return { dx: fx / TW, dy: fy / TH };
  }
  /* thresholds (enter / leave) — from the robustness benchmark, ACCURACY.md §12 "Camera health indicator" */
  const HEALTH = Object.freeze({
    darkWarn: 30, darkBad: 12, darkLeave: 38,       // median luma (0-255); YOLOX still counted PETS09 at 24 (benchmark)
    clipWarn: 0.30, clipLeave: 0.22,                // share of clipped pixels (overexposed)
    backClip: 0.05, backCell: 225, backMedian: 80,  // backlight: a bright cell + some clipping + a dark median, or
    backClip2: 0.15, backCell2: 215, backRest: 160, // a large clipped region (light source / bright door) beside unclipped cells
    contrastWarn: 45, contrastLeave: 55,            // p95 − p5 (fog, glare veil, dirty lens)
    sharpWarn: 4.5, sharpLeave: 5.5,                // mean |Laplacian| relative to contrast (×100)
    shakeWarn: 0.012, shakeShare: 0.4,              // share of 1-s steps with a global shift ≥ 1.2% of the frame
    hzWarn: 4, hzBad: 2,                            // analysed frames per second (store counts were measured at 5–10)
    smallWarn: 0.12, faceSmallWarn: 0.10,           // median person height / face width ÷ frame
    window: 8
  });
  const HEALTH_TH = {
    dark: "ภาพมืด — ภาพจริงในที่มืดมักเบลอและมีสัญญาณรบกวน ตรวจความแม่นยำหน้างานในแสงนี้ก่อนเชื่อตัวเลข หรือเพิ่มแสง",
    darkBad: "ภาพมืดมาก — ไม่ควรใช้ตัวเลขช่วงนี้ เพิ่มแสงหรือใช้กล้องอินฟราเรด",
    backlight: "ย้อนแสง — คนเป็นเงามืด อย่าหันกล้องเข้าหาประตูกระจก/หน้าต่าง หรือเพิ่มไฟด้านใน",
    bright: "ภาพสว่างจ้าเกินไป — ลดแสงที่ส่องเข้ากล้องหรือย้ายมุมกล้อง",
    lowContrast: "ภาพซีด/ฝ้า — เช็ดเลนส์ และหลีกเลี่ยงแสงสะท้อนเข้ากล้อง",
    blur: "ภาพไม่คมชัด — เช็ดเลนส์ ปรับโฟกัส หรือเพิ่มแสง",
    shake: "กล้องสั่นหรือขยับ — ยึดกล้องให้แน่น เส้นนับ/โซนจะคลาดเมื่อกล้องขยับ",
    slow: "ประมวลผลช้า — ลดจำนวนกล้อง ปิดการแบ่งภาพ หรือใช้เครื่องที่เร็วขึ้น",
    slowBad: "ประมวลผลช้ามาก — การนับข้ามเส้นจะหลุดบ่อย",
    small: "คนในภาพเล็กเกินไป — ติดกล้องใกล้ขึ้น หรือเลือก \"คนตัวเล็ก/อยู่ไกล\"",
    faceSmall: "ใบหน้าเล็กเกินไป — ให้เข้าใกล้กล้องมากขึ้น",
    stalled: "ไม่ได้รับภาพใหม่จากกล้อง — ตรวจสายหรือเปิดหน้านี้ค้างไว้"
  };
  /**
   * createHealth({kind}) — push(stats, extra) about once per second with frameStats() output and
   * extra = {hz, personH, faceW, stalled}. state() -> {level: 0 ok | 1 warn | 2 bad, issues: [{code, level, th}], text}.
   * Each issue uses the median of the last `window` samples with enter/leave thresholds, so it does not flicker.
   */
  function createHealth({ kind = "store", cfg = {} } = {}) {
    const C = { ...HEALTH, ...cfg }, S = [], on = new Set();
    let prevThumb = null;
    function push(s, x = {}) {
      const shift = s && prevThumb ? thumbShift(prevThumb, s.thumb, s.tw, s.th) : null;
      if (s) prevThumb = s.thumb;
      S.push({ s, x, shake: shift ? Math.max(Math.abs(shift.dx), Math.abs(shift.dy)) : null });
      while (S.length > C.window) S.shift();
      return state();
    }
    function state() {
      const ss = S.filter(e => e.s), m = k => median(ss.map(e => e.s[k])), mx = k => median(S.map(e => e.x[k]));
      const issues = [], set = (code, enter, leave, level = 1) => { if (enter || (on.has(code) && !leave)) { on.add(code); issues.push({ code, level, th: HEALTH_TH[code] }); } else on.delete(code); };
      if (ss.length >= 2) {
        const p50 = m("p50"), clip = m("clip"), cellMax = m("cellMax"), con = m("contrast"), sh = m("sharp");
        const cellMin = m("cellMin");
        const backAt = k => (clip >= C.backClip * k && cellMax >= C.backCell - (1 - k) * 25 && p50 <= C.backMedian + (1 - k) * 25) ||
          (clip >= C.backClip2 * k && cellMax >= C.backCell2 - (1 - k) * 25 && cellMin < C.backRest + (1 - k) * 25);
        const back = backAt(1);
        set("darkBad", p50 < C.darkBad, p50 >= C.darkBad + 5, 2);
        set("dark", !on.has("darkBad") && p50 < C.darkWarn && !back, p50 >= C.darkLeave || on.has("darkBad") || back);
        set("backlight", back, !backAt(0.6));
        set("bright", clip > C.clipWarn && !back, clip < C.clipLeave);
        set("lowContrast", con < C.contrastWarn && p50 >= C.darkWarn, con >= C.contrastLeave || p50 < C.darkWarn);
        set("blur", sh < C.sharpWarn && con >= C.contrastWarn && p50 >= C.darkWarn, sh >= C.sharpLeave || con < C.contrastWarn || p50 < C.darkWarn);
        const sk = S.map(e => e.shake).filter(fin);
        const share = sk.length >= 3 ? sk.filter(v => v >= C.shakeWarn).length / sk.length : 0;
        set("shake", share >= C.shakeShare, share < C.shakeShare / 2);
      }
      const hz = mx("hz");
      if (fin(hz) && S.length >= 3) { set("slowBad", hz < C.hzBad, hz >= C.hzBad + 0.5, 2); set("slow", hz < C.hzWarn && hz >= C.hzBad, hz >= C.hzWarn + 0.5 || hz < C.hzBad); }
      const ph = mx("personH"); if (fin(ph)) set("small", ph < C.smallWarn, ph >= C.smallWarn * 1.2); else on.delete("small");
      const fw = mx("faceW"); if (fin(fw)) set("faceSmall", fw < C.faceSmallWarn, fw >= C.faceSmallWarn * 1.2); else on.delete("faceSmall");
      set("stalled", !!(S.length && S[S.length - 1].x.stalled), !(S.length && S[S.length - 1].x.stalled), 2);
      const level = issues.reduce((a, i) => Math.max(a, i.level), 0);
      return { level, issues, codes: issues.map(i => i.code), text: issues.length ? issues.map(i => i.th).join(" · ") : "ภาพจากกล้องอยู่ในเกณฑ์ใช้งานได้", n: S.length };
    }
    return { push, state, reset() { S.length = 0; on.clear(); prevThumb = null; } };
  }
  /* browser helper: frameStats of a video/canvas element on a reusable 160-px canvas */
  function sampleElement(el, canvas) {
    const w0 = el.videoWidth || el.width, h0 = el.videoHeight || el.height; if (!w0 || !h0) return null;
    const W = 160, H = Math.max(9, Math.round(160 * h0 / w0));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(el, 0, 0, W, H);
    return frameStats(ctx.getImageData(0, 0, W, H));
  }

  /* ---------- frozen frames ("stalled") ---------- */
  /**
   * createStall({ms}) -> {note(now, clk, stats, {live}) -> bool}. clk = videoClock(video) = {frames (count of
   * requestVideoFrameCallback calls, null when the browser lacks it), time (video.currentTime), paused, ended}.
   * Stalled = no new frame for ms (rVFC; else currentTime frozen) — a camera that stopped delivering frames, a frozen
   * canvas/USB stream or an ended track — or, for a live camera, a bit-identical thumbnail for 3 × ms (real sensors
   * always have noise, so an exactly repeated picture is a frozen driver). A paused file video is not stalled.
   */
  function createStall({ ms = 3000 } = {}) {
    let lf = null, lt = null, fAt = 0, tAt = 0, prevThumb = null, thAt = 0;
    function note(now, clk, st, { live = true } = {}) {
      if (!clk) return false;
      if (clk.paused && !live) { fAt = tAt = thAt = now; return false; }
      if (clk.frames !== lf) { lf = clk.frames; fAt = now; }
      if (clk.time !== lt) { lt = clk.time; tAt = now; }
      if (st && st.thumb) {
        let same = !!prevThumb && prevThumb.length === st.thumb.length;
        if (same) for (let i = 0; i < st.thumb.length; i++) if (Math.abs(st.thumb[i] - prevThumb[i]) > 0.01) { same = false; break; }
        if (!same) thAt = now;
        prevThumb = Float32Array.from(st.thumb);
      } else if (!prevThumb) thAt = now;
      if (!fAt) fAt = now; if (!tAt) tAt = now; if (!thAt) thAt = now;
      if (!(clk.frames > 0) && !(clk.time > 0)) return !!clk.ended; // never started playing: nothing to judge yet
      // rVFC is authoritative once it has counted a frame (a MediaStream's currentTime keeps running on a frozen track)
      const noFrames = clk.frames > 0 ? now - fAt >= ms : now - tAt >= ms;
      return !!(clk.ended || noFrames || (live && now - thAt >= 3 * ms));
    }
    return { note, reset() { lf = lt = prevThumb = null; fAt = tAt = thAt = 0; } };
  }
  const CLK = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  /** {frames, time, paused, ended} of a <video>; installs one requestVideoFrameCallback counter per element */
  function videoClock(v) {
    if (!v) return null;
    let c = CLK && CLK.get(v);
    if (!c) {
      c = { frames: null };
      if (typeof v.requestVideoFrameCallback === "function") {
        c.frames = 0;
        const tick = () => { c.frames++; v.requestVideoFrameCallback(tick); };
        v.requestVideoFrameCallback(tick);
      }
      if (CLK) CLK.set(v, c);
    }
    const so = v.srcObject, tr = so && so.getVideoTracks ? so.getVideoTracks()[0] : null;
    return { frames: c.frames, time: v.currentTime, paused: !!v.paused, ended: !!(so && (!tr || tr.readyState === "ended")) };
  }
  const STALLS = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  /** convenience for the pages' 1-s health step: extra.stalled = stallStep(video, frameStats, now, {live}) */
  function stallStep(v, st, now, o = {}) {
    if (!v || !STALLS) return false;
    let s = STALLS.get(v); if (!s) { s = createStall(o); STALLS.set(v, s); }
    return s.note(now, videoClock(v), st, { live: o.live !== false && !!v.srcObject });
  }

  /* ---------- per-hour quality flags stored with the counts (round 10) ---------- */
  /**
   * q = {[hour 0-23]: {n, shake, dark, backlight, slow, offline, image}} = SECONDS per hour that the camera-health
   * monitor reported each problem (n = seconds sampled). Stored next to each hourly count bucket (st-day-*.quality,
   * booth-state.quality …) so insights and exports can grey or exclude the affected hours; the counts are never changed.
   * noteQuality(q, now, codes, {sec = 1, offline}) adds one sample; offline = camera disconnected / no frames.
   */
  const QUALITY_OF = { shake: "shake", dark: "dark", darkBad: "dark", backlight: "backlight", slow: "slow", slowBad: "slow", stalled: "offline", bright: "image", lowContrast: "image", blur: "image" };
  const QUALITY_KEYS = ["shake", "dark", "backlight", "slow", "offline", "image"];
  function noteQuality(q, now, codes = [], { sec = 1, offline = false } = {}) {
    if (!q || typeof q !== "object") return q;
    const h = new Date(now).getHours(), e = q[h] && typeof q[h] === "object" ? q[h] : (q[h] = { n: 0 });
    e.n = +((e.n || 0) + sec).toFixed(1);
    const hit = new Set(codes.map(c => QUALITY_OF[c]).filter(Boolean)); if (offline) hit.add("offline");
    hit.forEach(k => { e[k] = +((e[k] || 0) + sec).toFixed(1); });
    return q;
  }
  /** hours whose flagged time (any problem) reaches minSec (default 5 min) -> [{h, sec: {shake, …}, min}] sorted by hour */
  function flaggedHours(q, { minSec = 300 } = {}) {
    const out = [];
    if (!q || typeof q !== "object") return out;
    for (const [hk, e] of Object.entries(q)) {
      const h = +hk; if (!(h >= 0 && h < 24) || !e || typeof e !== "object") continue;
      const sec = {}; let worst = 0;
      for (const k of QUALITY_KEYS) if (fin(e[k]) && e[k] > 0) { sec[k] = e[k]; worst = Math.max(worst, e[k]); }
      if (worst >= minSec) out.push({ h, sec, min: Math.round(worst / 60) });
    }
    return out.sort((a, b) => a.h - b.h);
  }
  const QUALITY_TH = { shake: "กล้องสั่น", dark: "ภาพมืด", backlight: "ย้อนแสง", slow: "ประมวลผลช้า", offline: "กล้องออฟไลน์/ภาพค้าง", image: "ภาพไม่ชัด" };
  /** "ภาพมืด 12 นาที · กล้องสั่น 6 นาที" for one flaggedHours() entry */
  const qualityText = f => Object.entries(f.sec).filter(([, v]) => v >= 60).sort((x, y) => y[1] - x[1]).map(([k, v]) => fmt("{a} {b} นาที", { a: QUALITY_TH[k] || k, b: Math.round(v / 60) })).join(" · ");

  /* ---------- UI helpers ---------- */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const VERDICT_TH = { pass: "ผ่าน (ยืนยันแล้ว) — ทั้งช่วงความเชื่อมั่นผ่านเกณฑ์ที่หน้างานนี้", ontrack: "ตามเป้าจนถึงตอนนี้ — ยังยืนยันไม่ได้ เก็บข้อมูลเพิ่ม", fail: "ไม่ผ่านเกณฑ์ — แก้ตามคำแนะนำแล้วตรวจใหม่", more: "ยังสรุปไม่ได้ — เก็บข้อมูลเพิ่ม" };
  /** the round-9 point verdict, shown under the CI-aware one as "provisional" */
  const PROV_TH = { pass: "ค่าที่วัดได้ถึงเป้าทุกข้อ", more: "ค่าที่วัดได้ยังไม่ถึงเป้าบางข้อ หรือข้อมูลยังไม่พอ", fail: "ไม่ผ่านเกณฑ์" };
  /** "collect N more …" — one whole phrase per group (dictionary templates in i18n/*-rt-sitecheck.js) */
  const NEED_TH = {
    crossings: "คนผ่านเส้นนับ (อีกราว {n} ครั้ง)", members: "ผู้ลงทะเบียน (อีกราว {n} รอบ)", strangers: "คนนอก (อีกราว {n} รอบ)",
    cxMembers: "สมาชิก (อีกราว {n} รอบ)", cxStrangers: "คนที่ไม่ใช่สมาชิก (อีกราว {n} รอบ)", prompts: "คำสั่งหลับตา (อีกราว {n} ครั้ง)",
    openMin: "เวลาลืมตาปกติ (อีกราว {n} นาที)", good: "ขวดดี (อีกราว {n} ขวด)", bad: "ขวดเสีย (อีกราว {n} ขวด)",
    visitors: "ผู้มาบูธ (อีกราว {n} คน)", passers: "ผู้ผ่านหน้าจอ (อีกราว {n} คน)"
  };
  const needList = rep => (rep && rep.need || []).filter(x => NEED_TH[x.group] && x.more > 0).map(x => fmt(NEED_TH[x.group], { n: x.more >= 10000 ? "10000+" : Math.ceil(x.more) }));
  /** render a report (countReport / attendanceReport / driverReport / qcReport / visitorReport / demoReport) into el */
  function renderReport(el, rep) {
    if (!el) return;
    if (!rep) { el.innerHTML = ""; return; }
    const need = needList(rep);
    const needH = need.length && rep.verdict !== "pass" && rep.verdict !== "fail" ? `<p class="sc-need"><span>ต้องเก็บเพิ่ม:</span> ${need.map(x => `<span class="sc-need-i">${esc(x)}</span>`).join(" ")}</p>` : "";
    const provH = rep.provisional ? `<p class="sc-prov" data-v="${esc(rep.provisional)}"><span>ผลชั่วคราว (เทียบค่าที่วัดได้กับเป้า ไม่นับช่วงความเชื่อมั่น):</span> <b>${esc(PROV_TH[rep.provisional] || rep.provisional)}</b></p>` : "";
    const rowCls = m => m.ok === false ? "bad" : m.ok ? (m.sure === false ? "prov" : "ok") : "";
    const tables = (rep.tables || []).map(t => `<h4>${esc(t.title)}</h4><div class="table-wrap"><table class="sc-table sc-conf"><thead><tr><th></th>${t.cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${t.rows.map(r => `<tr><th>${esc(r[0])}</th>${r.slice(1).map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`).join("");
    el.innerHTML = fmt("<p class=\"sc-verdict\" data-v=\"{a}\"><b>{b}</b></p>{n}{p}\n      <div class=\"table-wrap\"><table class=\"sc-table\"><thead><tr><th>ตัวชี้วัด</th><th>ผลที่หน้างาน</th><th>ช่วงความเชื่อมั่น 95%</th><th>เป้า</th></tr></thead><tbody>{c}</tbody></table></div>{t}\n      {d}", { a: rep.verdict, b: esc(VERDICT_TH[rep.verdict]), n: needH, p: provH, t: tables, c:
      rep.metrics.map(m => `<tr class="${rowCls(m)}"><th>${esc(m.k)}${m.note ? `<small class="sc-note">${esc(m.note)}</small>` : ""}</th><td>${esc(m.v)}</td><td>${esc(m.ci)}</td><td>${esc(m.target)}</td></tr>`).join(""), d: rep.recs.length ? fmt("<h4>คำแนะนำ</h4><ul class=\"sc-recs\">{a}</ul>", { a: rep.recs.map(r => `<li>${esc(r)}</li>`).join("") }) : "" });
  }
  /** short status text for the panel pill / history: the CI-aware verdict (+ "collect N more" when on target so far) */
  const verdictText = rep => VERDICT_TH[rep.verdict] || rep.verdict;
  /**
   * mountPanel(el, {title, intro, steps[], body (html), startLabel, stopLabel}) — the common frame of the check panel.
   * Children by class: .sc-state .sc-start .sc-stop .sc-body .sc-live .sc-report .sc-export .sc-hist
   */
  function mountPanel(el, o) {
    el.innerHTML = fmt("<div class=\"report-head\"><h2>{a}</h2><span class=\"pill sc-state\">ยังไม่เริ่ม</span></div>\n      <p class=\"hint\">{b}</p>\n      <details class=\"phone-tip sc-proto\"><summary>ขั้นตอนการตรวจ</summary><ol>{c}</ol></details>\n      <div class=\"row-actions\"><button class=\"btn primary sc-start\" type=\"button\">{d}</button><button class=\"btn ghost sc-stop\" type=\"button\" disabled>{e}</button></div>\n      <div class=\"sc-body\">{f}</div>\n      <p class=\"sc-live\" role=\"status\" aria-live=\"polite\"></p>\n      <div class=\"sc-report\"></div>\n      <div class=\"row-actions\"><button class=\"btn ghost small sc-export\" type=\"button\" hidden>ส่งออกผลตรวจ (.json)</button></div>\n      <details class=\"sc-histbox\"><summary>ผลตรวจที่ผ่านมา</summary><ul class=\"sc-hist\"></ul></details>\n      <p class=\"hint\">คำนวณในเครื่องนี้ทั้งหมด ไม่บันทึกหรือส่งภาพ ไฟล์ที่ส่งออกมีเพียงเวลาที่กด ป้ายกำกับ เหตุการณ์ของระบบ และตัวเลขที่คำนวณได้</p>", { a: esc(o.title), b: esc(o.intro), c: o.steps.map(x => `<li>${esc(x)}</li>`).join(""), d: esc(o.startLabel || "เริ่มตรวจ"), e: esc(o.stopLabel || "จบและคำนวณ"), f: o.body || "" });
    const q = c => el.querySelector(c);
    return { el, q, state: q(".sc-state"), start: q(".sc-start"), stop: q(".sc-stop"), body: q(".sc-body"), live: q(".sc-live"), report: q(".sc-report"), exp: q(".sc-export"), hist: q(".sc-hist") };
  }
  /**
   * past results kept per page (summary numbers only, ≤ 20). item = {at, verdict, provisional?, summary, cam?, need?}
   * — `cam` (camera / station name) lets insights.html show the latest verdict per camera (latestByCamera).
   */
  function history(key) {
    const get = () => { try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : []; } catch { return []; } };
    return {
      list: get,
      add(item) { const a = get(); a.unshift({ v: 2, ...item }); try { localStorage.setItem(key, JSON.stringify(a.slice(0, 20))); } catch { /* ignore */ } },
      render(ul) { if (!ul) return; const a = get(); ul.innerHTML = a.length ? a.map(h => `<li><span>${esc(new Date(h.at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</span> <b data-v="${esc(h.verdict)}">${esc(VERDICT_TH[h.verdict] || h.verdict)}</b> <small>${esc(h.summary || "")}</small></li>`).join("") : "<li class=\"empty\">ยังไม่มีผลตรวจ</li>"; }
    };
  }
  /** the history keys of the camera pages (page -> localStorage key) — read-only use by insights.html */
  const HISTORY_KEYS = Object.freeze({ store: "st-sitecheck", customers: "cx-sitecheck", attendance: "att-sitecheck", driver: "dr-sitecheck", qc: "qc-sitecheck", booth: "booth-sitecheck", signage: "sg-sitecheck" });
  /**
   * latest result per (page, camera) from a localStorage-like object (getItem) or a snapshot {key: raw}:
   * -> [{page, cam, at, verdict, provisional, summary, need}] newest first. Items written before round 10 have no
   * camera name (cam "") and only the point verdict, which is reported as provisional.
   */
  function latestByCamera(src) {
    const raw = k => { try { return src && typeof src.getItem === "function" ? src.getItem(k) : src ? src[k] : null; } catch { return null; } };
    const out = [];
    for (const [page, key] of Object.entries(HISTORY_KEYS)) {
      let a; try { a = JSON.parse(raw(key)); } catch { a = null; }
      if (!Array.isArray(a)) continue;
      const seen = new Set();
      for (const h of a) {
        if (!h || typeof h !== "object" || !fin(h.at)) continue;
        const cam = typeof h.cam === "string" ? h.cam.slice(0, 60) : "";
        if (seen.has(cam)) continue; seen.add(cam);
        const old = h.v !== 2;
        out.push({ page, cam, at: h.at, verdict: old ? (h.verdict === "fail" ? "fail" : "more") : String(h.verdict || "more"), provisional: old ? h.verdict : h.provisional || null, summary: String(h.summary || "").slice(0, 200), need: Array.isArray(h.need) ? h.need : [], legacy: old });
      }
    }
    return out.sort((x, y) => y.at - x.at);
  }
  /** the exported document: labels, the system's events and the numbers only (no images, no face data) */
  function exportDoc(kind, payload) { return { format: "lensiq-sitecheck", v: 1, kind, created: new Date().toISOString(), note: "labels and computed numbers only — no images, video or face data", ...payload }; }
  function download(name, obj) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  /** health pill: element gets data-level, the label and (as title) the first issue — Thai, translated by lensiq-i18n-rt */
  function renderHealth(el, st) {
    if (!el || !st) return;
    const lab = st.level >= 2 ? "ภาพไม่พร้อม" : st.level ? "ภาพมีปัญหา" : st.n >= 2 ? "ภาพปกติ" : "กำลังตรวจภาพ";
    if (el.textContent !== lab) el.textContent = lab;
    el.dataset.level = String(st.level);
    const tip = st.issues.length ? st.issues[0].th : st.text;
    if (el.title !== tip) el.title = tip;
  }
  /** the issue line under a camera: one element per issue (each is a whole dictionary phrase), hidden when all is well */
  function renderHealthLine(el, st) {
    if (!el || !st) return;
    el.hidden = !st.level; el.dataset.level = String(st.level);
    const key = st.codes.join(",");
    if (el.dataset.codes === key) return;
    el.dataset.codes = key; el.textContent = "";
    st.issues.forEach((i, k) => { if (k) el.append(" "); const sp = document.createElement("span"); sp.className = "hl-issue"; sp.textContent = i.th; el.append(sp); });
  }

  return { TARGETS, HEALTH, HEALTH_TH, QC_METRICS, wilson, poissonCI, needN, needMoreProp, needMoreRate, clusterCI, blockPropCI, median, matchCrossings, netErrorCI, countReport, createFaceTrial, attendanceReport,
    closureSchedule, driverReport, qcValues, qcReport, visitorReport, demoReport, judge, frameStats, thumbShift, createHealth, createStall, videoClock, stallStep, sampleElement,
    noteQuality, flaggedHours, qualityText, QUALITY_KEYS, QUALITY_TH, renderReport, renderHealth, renderHealthLine, mountPanel, history, HISTORY_KEYS, latestByCamera, needList, verdictText, exportDoc, download, rng, fmt, VERDICT_TH, PROV_TH, NEED_TH, BANDS, BAND_LBL, GENDER_LBL };
});
