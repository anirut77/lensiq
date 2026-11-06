/* lensiq-track.js — LQTrack: ตัวติดตามหลายเป้าหมาย (คน/ใบหน้า/มือ/วัตถุ) ใช้ร่วมกันทุกหน้า
 * Pure maths, no DOM. Browser: window.LQTrack · Node: module.exports (node --test tests/unit).
 * Privacy: track.det keeps the latest detection object in memory only; snapshot() never serialises it.
 *
 * API
 *   Box = {x,y,w,h} normalised 0..1 (top-left origin, UNMIRRORED source pixels / source size).
 *   iou(a,b) -> number · center(b) -> {x,y} · foot(b) -> {x,y} · dist2d(p,q) -> number   (same maths as store.js)
 *   toNorm(box, W, H) -> Box             accepts {x,y,width,height} (face-api) or {x,y,w,h} in px
 *   DEFAULTS = {IOU_MIN:0.15, DIST_MAX:0.12, MAX_MISSED_MS:1000, MIN_HITS:2, LOST_TTL_MS:0, REVIVE_DIST:0.24, MAX_TRACKS:40, ASSIGN:'greedy'}
 *   PRESET.person | PRESET.face | PRESET.hand | PRESET.object   (all ASSIGN:'hungarian')
 *   newTracker(cfg=DEFAULTS) -> T = {tracks:[], lost:[], nextId:1, cfg}
 *   updateTracker(T, dets, now, cfg=T.cfg) -> {seen, born, revived, removed}
 *     dets: [{x,y,w,h,score, ...extra}] — the whole det object is kept as track.det (latest).
 *     Track = {id, box, vx, vy, firstSeen, lastSeen, hits, score, prevCenter, confirmed (hits>=MIN_HITS), det}
 *     ASSIGN 'greedy'    == store.js updateTracker bit-for-bit (pairs scored ov-dd, sorted desc).
 *     ASSIGN 'hungarian' == lsa() on cost 1-(ov + max(0,1-dd/DIST_MAX))/2, same gate (ov>=IOU_MIN || dd<=DIST_MAX).
 *     LOST_TTL_MS>0: a track missed > MAX_MISSED_MS moves to T.lost (not reported as removed yet). An unmatched det whose
 *       centre is within REVIVE_DIST of a lost track's predicted centre revives it (same id; listed in `revived` and `seen`,
 *       never in `born`). A lost track is dropped (-> `removed`) once now - lastSeen > max(MAX_MISSED_MS, LOST_TTL_MS),
 *       i.e. LOST_TTL_MS is the total gap (from lastSeen) that can still be bridged.
 *     Backward compat: updateTracker(T, dets, now, store.ST_CFG) returns a superset of store.js {seen, removed}, same ids.
 *     MAX_TRACKS caps births per tracker (highest-score dets are born first); a cfg without MAX_TRACKS has no cap.
 *   lsa(cost:number[][]) -> Array<[row,col]>   Hungarian (Munkres, O(n^3)). Infinity = forbidden; rectangular allowed.
 *     Maximises the number of allowed pairs first, then minimises the total cost. Forbidden pairs are never returned.
 *   trackerCfgFor(base, camIntervalMs) -> cfg  MAX_MISSED_MS=max(base,3*ms) · DIST_MAX=min(0.3, base*max(1,ms/83)) · REVIVE_DIST=2*DIST_MAX
 *   assignUnique(cands:[{i,key,dist}], maxDist) -> Map<i,{key,dist}>  ascending dist, each i and key used once, dist>maxDist dropped
 *   createConfirm({need=2, windowMs=1500}) -> {hit(key,now)->'pending'|'confirmed'|'already', reset(key), prune(now)->key[], has(key)}
 *     'confirmed' is returned exactly once per presence; a key unseen for > windowMs is forgotten and can confirm again.
 *   pickPrimary(boxes, prevBox, {minIou=0.3, prefer='largest', lockOnly=false}) -> {index (-1 none), continuity, n}
 *     prefer: 'largest' | 'center' | 'imageLeft' | 'imageRight' | {x,y} (nearest to point). Score = area * prior.
 *     prevBox && best IoU >= minIou -> that box (continuity:true). prevBox && lockOnly && none >= minIou -> -1.
 *   matchFace(desc, gallery:[{label, d}], {maxDist=0.55, margin=0}) -> {label|'unknown', distance, second, ambiguous}
 *     nearest enrolled descriptor by Euclidean distance (face-api 128-D). Accepted only when distance < maxDist AND the
 *     runner-up (another label) is at least `margin` further away. margin 0.05 cut "member shown as someone else" 3–5x
 *     on LFW 1:N (tests/bench/face.bench.mjs, ACCURACY.md) for a ~1–5 point drop in recognition.
 *   snapshot(T) -> plain JSON {nextId, tracks:[...], lost:[...]} without det payloads (no descriptors ever).
 */
(function (root) {
  "use strict";

  // ---------- geometry (identical to store.js) ----------
  function iou(a, b) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const uni = a.w * a.h + b.w * b.h - inter;
    return uni > 0 ? inter / uni : 0;
  }
  const center = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const foot = b => ({ x: b.x + b.w / 2, y: Math.min(1, b.y + b.h) });
  const dist2d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

  function toNorm(box, W, H) {
    W = W || 1; H = H || 1;
    const w = box.w != null ? box.w : box.width, h = box.h != null ? box.h : box.height;
    return { x: box.x / W, y: box.y / H, w: w / W, h: h / H };
  }

  // ---------- config ----------
  const DEFAULTS = Object.freeze({ IOU_MIN: 0.15, DIST_MAX: 0.12, MAX_MISSED_MS: 1000, MIN_HITS: 2, LOST_TTL_MS: 0, REVIVE_DIST: 0.24, MAX_TRACKS: 40, ASSIGN: "greedy" });
  const PRESET = Object.freeze({
    person: Object.freeze({ ...DEFAULTS, ASSIGN: "hungarian" }),
    face: Object.freeze({ ...DEFAULTS, IOU_MIN: 0.3, DIST_MAX: 0.10, MAX_MISSED_MS: 1500, ASSIGN: "hungarian" }),
    hand: Object.freeze({ ...DEFAULTS, IOU_MIN: 0.2, DIST_MAX: 0.15, MAX_MISSED_MS: 800, ASSIGN: "hungarian" }),
    object: Object.freeze({ ...DEFAULTS, IOU_MIN: 0.3, DIST_MAX: 0.08, MAX_MISSED_MS: 1500, ASSIGN: "hungarian" })
  });

  function trackerCfgFor(base, camIntervalMs) {
    base = base || DEFAULTS;
    const ms = Number.isFinite(camIntervalMs) && camIntervalMs > 0 ? camIntervalMs : 83;
    const k = Math.max(1, ms / 83), DIST_MAX = Math.min(base.GATE_CAP || 0.3, base.DIST_MAX * k); // GATE_CAP: optional upper bound at low fps
    const out = { ...base, MAX_MISSED_MS: Math.max(base.MAX_MISSED_MS, 3 * ms), DIST_MAX, REVIVE_DIST: 2 * DIST_MAX };
    if (base.DIST_REL) out.DIST_REL = Math.min(1.5, base.DIST_REL * k);
    return out;
  }

  // ---------- Hungarian / linear sum assignment ----------
  function lsa(cost) {
    const R = cost.length, C = R ? Math.max(...cost.map(r => r.length)) : 0;
    if (!R || !C) return [];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      const v = cost[i][j];
      if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (lo === Infinity) return [];
    const n = Math.max(R, C);
    // shift to >= 0; one more forbidden cell always costs more than any finite difference
    const BIG = (hi - lo + 1) * (n + 1);
    const a = [];
    for (let i = 0; i < n; i++) {
      const row = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        if (i >= R || j >= C) { row[j] = 0; continue; } // dummy row/col
        const v = cost[i][j];
        row[j] = Number.isFinite(v) ? v - lo : BIG;
      }
      a.push(row);
    }
    // e-maxx Hungarian, 1-indexed potentials
    const u = new Float64Array(n + 1), v = new Float64Array(n + 1), p = new Int32Array(n + 1), way = new Int32Array(n + 1);
    for (let i = 1; i <= n; i++) {
      p[0] = i; let j0 = 0;
      const minv = new Float64Array(n + 1).fill(Infinity), used = new Uint8Array(n + 1);
      do {
        used[j0] = 1;
        const i0 = p[j0]; let delta = Infinity, j1 = 0;
        for (let j = 1; j <= n; j++) {
          if (used[j]) continue;
          const cur = a[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (let j = 0; j <= n; j++) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const out = [];
    for (let j = 1; j <= n; j++) {
      const i = p[j] - 1, c = j - 1;
      if (i < R && c < C && Number.isFinite(cost[i][c])) out.push([i, c]);
    }
    return out.sort((x, y) => x[0] - y[0]);
  }

  // ---------- tracker ----------
  function newTracker(cfg = DEFAULTS) { return { tracks: [], lost: [], nextId: 1, cfg }; }

  function predictBox(t, now, cfg) {
    const dt = Math.min(now - t.lastSeen, cfg.MAX_MISSED_MS);
    return { ...t.box, x: t.box.x + t.vx * dt, y: t.box.y + t.vy * dt };
  }
  function applyDet(t, d, now) {
    const c0 = center(t.box), c1 = center(d), dt = Math.max(1, now - t.lastSeen);
    t.vx = 0.6 * t.vx + 0.4 * (c1.x - c0.x) / dt;
    t.vy = 0.6 * t.vy + 0.4 * (c1.y - c0.y) / dt;
    t.prevCenter = c0;
    t.box = { x: d.x, y: d.y, w: d.w, h: d.h };
    t.lastSeen = now; t.hits++; t.score = d.score;
  }

  function updateTracker(T, dets, now, cfg) {
    cfg = cfg || T.cfg || DEFAULTS;
    if (!T.lost) T.lost = [];
    const minHits = cfg.MIN_HITS != null ? cfg.MIN_HITS : 2;
    const pool = cfg.LOST_TTL_MS > 0;
    const lostTtl = Math.max(cfg.MAX_MISSED_MS, cfg.LOST_TTL_MS || 0);
    const removed = [];
    if (pool) {
      // pool mode only (never in store.js-compatible mode): retire stale tracks and expired lost tracks BEFORE matching,
      // so a long gap is never bridged by the main matcher and an expired lost track is never revived.
      T.tracks = T.tracks.filter(t => {
        if (now - t.lastSeen > cfg.MAX_MISSED_MS) { T.lost.push(t); return false; }
        return true;
      });
      T.lost = T.lost.filter(t => {
        if (now - t.lastSeen > lostTtl) { removed.push(t.id); return false; }
        return true;
      });
    }
    const pred = T.tracks.map(t => predictBox(t, now, cfg));
    const matches = []; // [trackIndex, detIndex] in apply order
    let skip = null; // byte mode: low-score dets never give birth
    if (cfg.ASSIGN === "byte") {
      // ByteTrack-style two-stage association (Zhang et al. 2022): 1) all tracks vs confident dets (score >= HIGH),
      // 2) tracks still unmatched vs low-score dets (LOW <= score < HIGH) with a stricter IoU/distance gate — a person
      // half-hidden for a frame keeps his track instead of a gap and a new id. Gate is scale-aware: centre distance up
      // to max(DIST_MAX, DIST_REL × box height), so a near (big) person may move further than a far (small) one.
      const HIGH = cfg.HIGH != null ? cfg.HIGH : 0.5, LOW = cfg.LOW != null ? cfg.LOW : 0.2;
      const hi = [], lo = [];
      dets.forEach((d, j) => { const sc = d.score == null ? 1 : d.score; if (sc >= HIGH) hi.push(j); else if (sc >= LOW) lo.push(j); });
      const gate = i => Math.max(cfg.DIST_MAX, (cfg.DIST_REL || 0) * Math.max(T.tracks[i].box.h, pred[i].h));
      const costOf = (i, d, strict) => {
        const p = pred[i], ov = iou(p, d), dd = dist2d(center(p), center(d)), g = strict ? 0.5 * gate(i) : gate(i);
        const hr = d.h / Math.max(1e-6, p.h);
        if (hr > 2 || hr < 0.5) return Infinity;
        if (!(ov >= (strict ? Math.max(0.3, cfg.IOU_MIN) : cfg.IOU_MIN) || dd <= g)) return Infinity;
        return 1 - (ov + Math.max(0, 1 - dd / g)) / 2;
      };
      const ti = new Set();
      if (T.tracks.length && hi.length) for (const [i, k] of lsa(T.tracks.map((t, i) => hi.map(j => costOf(i, dets[j], false))))) { matches.push([i, hi[k]]); ti.add(i); }
      const rest = T.tracks.map((_, i) => i).filter(i => !ti.has(i));
      if (rest.length && lo.length) for (const [r, k] of lsa(rest.map(i => lo.map(j => costOf(i, dets[j], true))))) matches.push([rest[r], lo[k]]);
      skip = new Set(lo);
    } else if (cfg.ASSIGN === "hungarian") {
      const cost = T.tracks.map((t, i) => dets.map(d => {
        const ov = iou(pred[i], d), dd = dist2d(center(pred[i]), center(d));
        if (!(ov >= cfg.IOU_MIN || dd <= cfg.DIST_MAX)) return Infinity;
        return 1 - (ov + Math.max(0, 1 - dd / cfg.DIST_MAX)) / 2;
      }));
      if (T.tracks.length && dets.length) for (const m of lsa(cost)) matches.push(m);
    } else {
      // greedy — store.js:39-76 unchanged
      const pairs = [];
      T.tracks.forEach((t, i) => dets.forEach((d, j) => {
        const ov = iou(pred[i], d), dd = dist2d(center(pred[i]), center(d));
        if (ov >= cfg.IOU_MIN || dd <= cfg.DIST_MAX) pairs.push({ i, j, s: ov - dd });
      }));
      pairs.sort((a, b) => b.s - a.s);
      const ti = new Set(), dj = new Set();
      for (const p of pairs) {
        if (ti.has(p.i) || dj.has(p.j)) continue;
        ti.add(p.i); dj.add(p.j); matches.push([p.i, p.j]);
      }
    }
    const dj = new Set(), seen = [], born = [], revived = [];
    for (const [i, j] of matches) {
      const t = T.tracks[i], d = dets[j];
      dj.add(j); applyDet(t, d, now); t.det = d; t.confirmed = t.hits >= minHits;
      seen.push(t);
    }
    // revive from the lost pool (position only)
    let free = [];
    dets.forEach((d, j) => { if (!dj.has(j) && !(skip && skip.has(j)) && !(cfg.NEW_MIN > 0 && (d.score == null ? 1 : d.score) < cfg.NEW_MIN)) free.push(j); });
    if (cfg.LOST_TTL_MS > 0 && T.lost.length && free.length) {
      const cands = [];
      T.lost.forEach((t, li) => {
        const pc = center(predictBox(t, now, cfg));
        free.forEach(j => cands.push({ i: j, key: li, dist: dist2d(pc, center(dets[j])) }));
      });
      const got = assignUnique(cands, cfg.REVIVE_DIST != null ? cfg.REVIVE_DIST : 2 * cfg.DIST_MAX);
      const back = new Set();
      for (const [j, { key }] of got) {
        const t = T.lost[key], d = dets[j];
        applyDet(t, d, now); t.det = d; t.confirmed = t.hits >= minHits;
        back.add(key); dj.add(j); T.tracks.push(t); seen.push(t); revived.push(t);
      }
      if (back.size) T.lost = T.lost.filter((_, li) => !back.has(li));
      free = free.filter(j => !dj.has(j));
    }
    // births
    if (cfg.MAX_TRACKS > 0) {
      const room = Math.max(0, cfg.MAX_TRACKS - T.tracks.length);
      if (free.length > room) {
        const keep = new Set(free.slice().sort((a, b) => (dets[b].score || 0) - (dets[a].score || 0)).slice(0, room));
        free = free.filter(j => keep.has(j));
      }
    }
    for (const j of free) {
      const d = dets[j];
      const t = { id: T.nextId++, box: { x: d.x, y: d.y, w: d.w, h: d.h }, vx: 0, vy: 0, firstSeen: now, lastSeen: now, hits: 1, score: d.score, prevCenter: null };
      t.confirmed = t.hits >= minHits; t.det = d;
      T.tracks.push(t); seen.push(t); born.push(t);
    }
    // expiry
    T.tracks = T.tracks.filter(t => {
      if (now - t.lastSeen > cfg.MAX_MISSED_MS) {
        if (pool) T.lost.push(t); else removed.push(t.id);
        return false;
      }
      return true;
    });
    if (T.lost.length) {
      T.lost = T.lost.filter(t => {
        if (!pool || now - t.lastSeen > lostTtl) { removed.push(t.id); return false; }
        return true;
      });
    }
    return { seen, born, revived, removed };
  }

  // ---------- unique assignment / confirmation / primary pick ----------
  function assignUnique(cands, maxDist = Infinity) {
    const out = new Map(), keys = new Set();
    const list = cands.filter(c => c && Number.isFinite(c.dist) && c.dist <= maxDist).slice().sort((a, b) => a.dist - b.dist);
    for (const c of list) {
      if (out.has(c.i) || keys.has(c.key)) continue;
      out.set(c.i, { key: c.key, dist: c.dist }); keys.add(c.key);
    }
    return out;
  }

  function createConfirm({ need = 2, windowMs = 1500 } = {}) {
    const m = new Map(); // key -> {count, last, done}
    return {
      hit(key, now) {
        let s = m.get(key);
        if (s && now - s.last > windowMs) { m.delete(key); s = null; }
        if (!s) { s = { count: 0, last: now, done: false }; m.set(key, s); }
        s.count++; s.last = now;
        if (s.done) return "already";
        if (s.count >= need) { s.done = true; return "confirmed"; }
        return "pending";
      },
      reset(key) { m.delete(key); },
      prune(now) {
        const gone = [];
        for (const [k, s] of m) if (now - s.last > windowMs) { m.delete(k); gone.push(k); }
        return gone;
      },
      has(key) { return m.has(key); }
    };
  }

  function priorFor(b, prefer) {
    const c = center(b);
    if (prefer === "center") return 1 / (1 + 4 * dist2d(c, { x: 0.5, y: 0.5 }));
    if (prefer === "imageLeft") return 0.25 + 0.75 * Math.max(0, Math.min(1, 1 - c.x));
    if (prefer === "imageRight") return 0.25 + 0.75 * Math.max(0, Math.min(1, c.x));
    if (prefer && typeof prefer === "object" && Number.isFinite(prefer.x)) {
      const d = dist2d(c, prefer) * 10; return 1 / (1 + d * d);
    }
    return 1; // largest
  }
  function pickPrimary(boxes, prevBox, { minIou = 0.3, prefer = "largest", lockOnly = false } = {}) {
    const n = boxes ? boxes.length : 0;
    if (!n) return { index: -1, continuity: false, n: 0 };
    if (prevBox) {
      let bi = -1, bv = -1;
      boxes.forEach((b, i) => { const v = iou(prevBox, b); if (v > bv) { bv = v; bi = i; } });
      if (bv >= minIou) return { index: bi, continuity: true, n };
      if (lockOnly) return { index: -1, continuity: false, n };
    }
    let bi = 0, bs = -Infinity;
    boxes.forEach((b, i) => { const s = b.w * b.h * priorFor(b, prefer); if (s > bs) { bs = s; bi = i; } });
    return { index: bi, continuity: false, n };
  }

  function matchFace(desc, gallery, { maxDist = 0.55, margin = 0 } = {}) {
    let best = null, bd = Infinity, sd = Infinity, bthr = Infinity;
    if (desc && gallery) for (const g of gallery) {
      if (!g || !g.d || g.d.length !== desc.length) continue;
      let s = 0; for (let i = 0; i < desc.length; i++) { const v = desc[i] - g.d[i]; s += v * v; }
      const x = Math.sqrt(s);
      if (x < bd) { if (best !== g.label) sd = bd; bd = x; best = g.label; bthr = g.thr; } else if (x < sd && g.label !== best) sd = x;
    }
    const lim = Number.isFinite(bthr) ? Math.min(maxDist, bthr) : maxDist; // per-person limit (enrolGallery) can only tighten
    const ambiguous = bd < lim && sd - bd < margin;
    return { label: best != null && bd < lim && !ambiguous ? best : "unknown", distance: bd, second: sd, ambiguous, limit: lim };
  }

  /* ---------- face quality + enrolment helpers (attendance / customers / booth) ----------
   * faceQuality({box:{w,h} px, score, landmarks:[[x,y]|{x,y}]x68?, sharp?}) -> {size, score, yaw, sharp}
   *   size = min(w,h) px · yaw = 0 frontal .. 1 profile, from the nose tip (30) between the outer eye corners (36, 45).
   * qualityOk(q, {minSize=40, minScore=0.5, maxYaw=0.6, minSharp=0}) -> boolean   frames failing it are not matched. */
  const QUALITY = Object.freeze({ minSize: 40, minScore: 0.5, maxYaw: 0.6, minSharp: 0 }); // tests/bench/face1n.bench.mjs
  function faceQuality({ box, score = 1, landmarks = null, sharp = null } = {}) {
    const w = box ? (box.w != null ? box.w : box.width) : 0, h = box ? (box.h != null ? box.h : box.height) : 0;
    let yaw = 0;
    if (landmarks && landmarks.length >= 46) {
      const P = i => { const p = landmarks[i]; return Array.isArray(p) ? { x: p[0], y: p[1] } : p; };
      const l = P(36), r = P(45), n = P(30), span = r.x - l.x;
      yaw = span > 0 ? Math.min(1, Math.abs((n.x - l.x) / span - 0.5) * 2) : 1;
    }
    return { size: Math.round(Math.min(w, h)), score: Math.round(score * 1000) / 1000, yaw: Math.round(yaw * 1000) / 1000, sharp: sharp == null ? null : sharp };
  }
  function qualityOk(q, cfg = {}) {
    const c = { ...QUALITY, ...cfg };
    return !!q && q.size >= c.minSize && q.score >= c.minScore && q.yaw <= c.maxYaw && (q.sharp == null || q.sharp >= c.minSharp);
  }
  const fdist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const v = a[i] - b[i]; s += v * v; } return Math.sqrt(s); };
  /* enrolGallery(people:[{label, ds:[desc...]}], {maxDist, k=0.8, floor=0.4}) -> [{label, d, thr}]
   *   centroid (default): one entry per person = mean of its 2–3 enrolment photos; else one entry per photo. thr = clamp(k × distance to the
   *   nearest OTHER enrolled person, floor, maxDist): a member whose face is close to someone else's gets a stricter
   *   threshold, so the space between two look-alikes is not handed to strangers. */
  function enrolGallery(people, { maxDist = 0.55, k = 0.85, floor = 0.45, centroid = true } = {}) {
    const out = [];
    const mean = ds => Array.from(ds[0], (_, i) => ds.reduce((s, d) => s + d[i], 0) / ds.length);
    people = (people || []).map(p => { const ds = (p.ds || []).filter(d => d && d.length); return { label: p.label, ds: centroid && ds.length > 1 ? [mean(ds)] : ds }; });
    for (const p of people) {
      const ds = p.ds;
      let nn = Infinity;
      for (const q of people) if (q !== p && q.label !== p.label) for (const a of ds) for (const b of q.ds || []) { if (b && b.length === a.length) { const x = fdist(a, b); if (x < nn) nn = x; } }
      const thr = Number.isFinite(nn) ? Math.max(floor, Math.min(maxDist, k * nn)) : maxDist;
      for (const d of ds) out.push({ label: p.label, d, thr });
    }
    return out;
  }
  /* createConsensus({need=3, of=5, windowMs=4000}) -> {push(trackKey, label|'unknown', now) -> label|null, reset(key), prune(now)}
   *   multi-frame vote per face track: a label is returned once it is the match in `need` of the last `of` frames of
   *   that track (an 'unknown' frame counts as a vote against). */
  function createConsensus({ need = 3, of = 5, windowMs = 4000 } = {}) {
    const m = new Map();
    return {
      push(key, label, now) {
        let e = m.get(key); if (!e) m.set(key, e = { v: [], t: now });
        e.t = now; e.v.push(label); if (e.v.length > of) e.v.shift();
        if (label === "unknown") return null;
        let n = 0; for (const x of e.v) if (x === label) n++;
        return n >= need ? label : null;
      },
      reset(key) { m.delete(key); },
      prune(now) { for (const [k, e] of m) if (now - e.t > windowMs) m.delete(k); },
      size: () => m.size
    };
  }

  function snapshot(T) {
    const r4 = v => (Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : v);
    const one = t => ({
      id: t.id, box: { x: r4(t.box.x), y: r4(t.box.y), w: r4(t.box.w), h: r4(t.box.h) },
      vx: t.vx, vy: t.vy, firstSeen: t.firstSeen, lastSeen: t.lastSeen, hits: t.hits,
      score: Number.isFinite(t.score) ? t.score : null, confirmed: !!t.confirmed
    });
    return { nextId: T.nextId, tracks: (T.tracks || []).map(one), lost: (T.lost || []).map(one) };
  }

  const api = {
    iou, center, foot, dist2d, toNorm, DEFAULTS, PRESET, newTracker, updateTracker, lsa,
    trackerCfgFor, assignUnique, createConfirm, pickPrimary, matchFace, snapshot,
    QUALITY, faceQuality, qualityOk, enrolGallery, createConsensus
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQTrack = api;
})(typeof window !== "undefined" ? window : globalThis);
