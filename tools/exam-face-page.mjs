// tools/exam-face-page.mjs — the in-page part of tools/exam-face-eval.mjs (runs inside headless Chrome on a LENSIQ page).
// window.__ef = {init, frame, fake, renders, wasmLatency}. Frames: 640 x 480, image letterboxed on #808080 (§1.1).
// OLD = LQExamFace.createFaceApi() (= exam-lab on main), NEW = LQExamFace.createMediaPipe() at each detection threshold.
export async function PAGE_LIB() {
  const FW = 640, FH = 480, MIN_FACE = 24;
  const load = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
  if (!window.LQDetect) await load("lensiq-detect.js");
  if (!window.LQExamFace) await load("lensiq-exam-face.js");
  const F = window.LQExamFace;
  const ef = { old: null, news: {}, oldBackend: "" };
  const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  async function source(data) {
    const img = new Image(); img.src = "data:image/jpeg;base64," + data; await img.decode();
    const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = canvas(Math.round(img.naturalWidth * s), Math.round(img.naturalHeight * s));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return { c, nw: img.naturalWidth, nh: img.naturalHeight };
  }
  function frameOf(src) {
    const c = canvas(FW, FH), g = c.getContext("2d");
    g.fillStyle = "#808080"; g.fillRect(0, 0, FW, FH);
    const s = Math.min(FW / src.width, FH / src.height), w = src.width * s, h = src.height * s, ox = (FW - w) / 2, oy = (FH - h) / 2;
    g.drawImage(src, ox, oy, w, h);
    return { c, map: (x0, x1, y0, y1) => ({ x: ox + x0 * w, y: oy + y0 * h, w: (x1 - x0) * w, h: (y1 - y0) * h }) };
  }
  function rng(str) {
    let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    let a = h >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function dark(c, id) {
    const g = c.getContext("2d"), d = g.getImageData(0, 0, c.width, c.height), r = rng("dark:" + id), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const u = Math.max(1e-9, r()), v = r(), n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * 3;
      for (let k = 0; k < 3; k++) p[i + k] = Math.max(0, Math.min(255, Math.round(p[i + k] * 0.3 + n)));
    }
    g.putImageData(d, 0, 0);
  }
  function mask(c, b) {
    const g = c.getContext("2d"), x0 = b.x + 0.06 * b.w, x1 = b.x + 0.94 * b.w, y0 = b.y + 0.55 * b.h, y1 = b.y + 0.98 * b.h, r = 0.12 * b.w;
    g.save(); g.strokeStyle = "#e8eef2"; g.lineWidth = Math.max(1, b.w / 60);
    g.beginPath(); g.moveTo(x0, y0 + 0.1 * (y1 - y0)); g.lineTo(b.x - 0.02 * b.w, b.y + 0.42 * b.h); g.moveTo(x1, y0 + 0.1 * (y1 - y0)); g.lineTo(b.x + 1.02 * b.w, b.y + 0.42 * b.h); g.stroke();
    g.fillStyle = "#a9cbe0"; g.beginPath();
    g.moveTo(x0 + r, y0); g.lineTo(x1 - r, y0); g.quadraticCurveTo(x1, y0, x1, y0 + r); g.lineTo(x1, y1 - r); g.quadraticCurveTo(x1, y1, x1 - r, y1);
    g.lineTo(x0 + r, y1); g.quadraticCurveTo(x0, y1, x0, y1 - r); g.lineTo(x0, y0 + r); g.quadraticCurveTo(x0, y0, x0 + r, y0); g.closePath(); g.fill();
    g.strokeStyle = "#8fb3cc"; g.lineWidth = Math.max(1, b.w / 80);
    for (const f of [0.3, 0.5, 0.7]) { g.beginPath(); g.moveTo(x0 + 0.04 * b.w, y0 + f * (y1 - y0)); g.lineTo(x1 - 0.04 * b.w, y0 + f * (y1 - y0)); g.stroke(); }
    g.restore();
  }
  const r1 = v => Math.round(v * 10) / 10;
  const box1 = b => (b ? { x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h) } : null);
  const pose1 = p => (p ? { yaw: p.yaw, pitchN: p.pitchN, mar: p.mar } : null);
  async function detectAll(c) {
    const out = { old: null, new: {} };
    let t0 = performance.now();
    const o = await ef.old.detect(c);
    out.old = { ms: performance.now() - t0, faces: o.map(f => ({ box: box1(f.box), yaw: f.yaw, pitchN: f.pitchN, mar: f.mar })) };
    for (const [t, e] of Object.entries(ef.news)) {
      t0 = performance.now();
      const r = e.raw(c), ms = performance.now() - t0;
      const L = r.faceLandmarks || [], M = r.facialTransformationMatrixes || [];
      out.new[t] = {
        ms, faces: L.map((l, i) => ({
          box: box1(F.boxOf(l, FW, FH)), mx: pose1(F.poseFromMesh(l, FW, FH, { pose: "matrix", matrix: M[i] })), m68: pose1(F.poseFromMesh(l, FW, FH, { pose: "mesh68" }))
        }))
      };
    }
    return out;
  }
  ef.init = async thresholds => {
    ef.old = F.createFaceApi(); await ef.old.init(); ef.oldBackend = ef.old.backend;
    for (const t of thresholds) { const e = F.createMediaPipe({ options: { minFaceDetectionConfidence: t } }); await e.init(); ef.news[t] = e; }
    const w = canvas(FW, FH); w.getContext("2d").fillRect(0, 0, FW, FH);
    await detectAll(w); // warm-up, not timed in the results
    return { oldBackend: ef.oldBackend, news: Object.keys(ef.news), opts: Object.values(ef.news)[0].options };
  };
  ef.frame = async (data, variant, faces, id) => {
    const s = await source(data), fr = frameOf(s.c);
    const all = faces.map(f => fr.map(...f));
    const gt = all.filter(b => b.w >= MIN_FACE), ignore = all.filter(b => b.w < MIN_FACE);
    if (variant === "D1") dark(fr.c, id);
    if (variant === "D2") for (const b of gt) mask(fr.c, b);
    let lum = 0;
    { const d = fr.c.getContext("2d").getImageData(0, 0, FW, FH).data; for (let i = 0; i < d.length; i += 16) lum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; lum /= d.length / 16; }
    return { nw: s.nw, nh: s.nh, lum: Math.round(lum), gt: gt.map(box1), ignore: ignore.map(box1), ...(await detectAll(fr.c)) };
  };
  ef.fake = async i => {
    const COLORS = [[220, 40, 40], [40, 160, 60], [40, 80, 220], [200, 160, 20]], c = canvas(FW, FH), g = c.getContext("2d");
    const [r, gg, b] = COLORS[i % 4], ph = Math.floor(i / 4) * 0.2;
    g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(0, 0, FW, FH); g.fillStyle = "#fff"; g.fillRect((0.1 + 0.5 * ph) * FW, 0.25 * FH, 0.2 * FW, 0.5 * FH);
    return detectAll(c);
  };
  /* ---------- head-turn renders (§1.3) ---------- */
  function delaunay(pts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); }
    const d = Math.max(maxX - minX, maxY - minY) * 20, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    const P = pts.concat([[mx - d, my - d], [mx + d, my - d], [mx, my + d]]), n = pts.length;
    const circ = (a, b, c) => {
      const [ax, ay] = P[a], [bx, by] = P[b], [cx, cy] = P[c], D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
      const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
      return { a, b, c, x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
    };
    let tris = [circ(n, n + 1, n + 2)];
    for (let i = 0; i < n; i++) {
      const [px, py] = P[i], bad = [], keep = [];
      for (const t of tris) ((px - t.x) ** 2 + (py - t.y) ** 2 < t.r2 ? bad : keep).push(t);
      const edges = new Map();
      for (const t of bad) for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { const k = u < v ? u + "," + v : v + "," + u; edges.set(k, edges.has(k) ? null : [u, v]); }
      tris = keep;
      for (const e of edges.values()) if (e) tris.push(circ(e[0], e[1], i));
    }
    return tris.filter(t => t.a < n && t.b < n && t.c < n).map(t => [t.a, t.b, t.c]);
  }
  const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  function render(S, V, tris, yawDeg, pitchDeg) {
    const out = canvas(FW, FH), g = out.getContext("2d");
    g.fillStyle = "#808080"; g.fillRect(0, 0, FW, FH);
    let cx = 0, cy = 0, cz = 0; for (const v of V) { cx += v[0]; cy += v[1]; cz += v[2]; } cx /= V.length; cy /= V.length; cz /= V.length;
    let minX = Infinity, maxX = -Infinity; for (const v of V) { minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]); }
    const k = 200 / (maxX - minX), a = yawDeg * Math.PI / 180, p = pitchDeg * Math.PI / 180;
    const Q = V.map(([x, y, z]) => {
      x -= cx; y -= cy; z -= cz;
      const y1 = y * Math.cos(p) - z * Math.sin(p), z1 = y * Math.sin(p) + z * Math.cos(p); // pitch down: nose (z < 0) moves down
      const x2 = x * Math.cos(a) - z1 * Math.sin(a), z2 = x * Math.sin(a) + z1 * Math.cos(a); // yaw > 0: nose (z < 0) moves right
      return [320 + k * x2, 230 + k * y1, z2];
    });
    const order = tris.map(t => ({ t, z: (Q[t[0]][2] + Q[t[1]][2] + Q[t[2]][2]) / 3 })).sort((u, v) => v.z - u.z);
    for (const { t } of order) {
      const [i, j, l] = t, s0 = V[i], s1 = V[j], s2 = V[l], d0 = Q[i], d1 = Q[j], d2 = Q[l];
      const sa = area2(s0, s1, s2), da = area2(d0, d1, d2);
      if (Math.sign(sa) !== Math.sign(da) || Math.abs(da) < 1e-6) continue; // back face
      // affine map source triangle -> destination triangle
      const den = (s0[0] * (s1[1] - s2[1]) + s1[0] * (s2[1] - s0[1]) + s2[0] * (s0[1] - s1[1]));
      if (Math.abs(den) < 1e-9) continue;
      const A = (d0[0] * (s1[1] - s2[1]) + d1[0] * (s2[1] - s0[1]) + d2[0] * (s0[1] - s1[1])) / den;
      const C = (d0[0] * (s2[0] - s1[0]) + d1[0] * (s0[0] - s2[0]) + d2[0] * (s1[0] - s0[0])) / den;
      const E = (d0[0] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[0] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[0] * (s0[0] * s1[1] - s1[0] * s0[1])) / den;
      const B = (d0[1] * (s1[1] - s2[1]) + d1[1] * (s2[1] - s0[1]) + d2[1] * (s0[1] - s1[1])) / den;
      const D = (d0[1] * (s2[0] - s1[0]) + d1[1] * (s0[0] - s2[0]) + d2[1] * (s1[0] - s0[0])) / den;
      const Fv = (d0[1] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[1] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[1] * (s0[0] * s1[1] - s1[0] * s0[1])) / den;
      const mx = (d0[0] + d1[0] + d2[0]) / 3, my = (d0[1] + d1[1] + d2[1]) / 3;
      const grow = q => { const dx = q[0] - mx, dy = q[1] - my, L = Math.hypot(dx, dy) || 1; return [q[0] + dx / L * 0.8, q[1] + dy / L * 0.8]; };
      const e0 = grow(d0), e1 = grow(d1), e2 = grow(d2);
      g.save(); g.beginPath(); g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]); g.lineTo(e2[0], e2[1]); g.closePath(); g.clip();
      g.setTransform(A, B, C, D, E, Fv); g.drawImage(S, 0, 0); g.restore();
    }
    return out;
  }
  ef.renders = async (data, poses) => {
    const s = await source(data), S = s.c, eng = ef.news["0.5"] || Object.values(ef.news).pop();
    const r = eng.raw(S), L = r.faceLandmarks || [];
    if (L.length !== 1) return { skip: "faces=" + L.length };
    const a = F.matrixAngles(r.facialTransformationMatrixes[0].data);
    if (!a || Math.abs(a.yaw) > 15 || Math.abs(a.pitch) > 15) return { skip: "not frontal", yaw0: a && a.yaw, pitch0: a && a.pitch };
    const V = L[0].map(l => [l.x * S.width, l.y * S.height, l.z * S.width]);
    const tris = delaunay(V.map(v => [v[0], v[1]]));
    const out = [];
    for (const P of poses) out.push({ yaw: P.yaw, pitch: P.pitch, ...(await detectAll(render(S, V, tris, P.yaw, P.pitch))) });
    return { yaw0: a.yaw, pitch0: a.pitch, tris: tris.length, poses: out };
  };
  ef.wasmLatency = async datas => {
    const tf = window.faceapi.tf, prev = tf.getBackend();
    await tf.setBackend("wasm"); await tf.ready();
    const ms = [];
    const w = canvas(FW, FH); await ef.old.detect(w); // warm-up on wasm
    for (const d of datas) { const s = await source(d), fr = frameOf(s.c); const t0 = performance.now(); await ef.old.detect(fr.c); ms.push(performance.now() - t0); }
    await tf.setBackend(prev); await tf.ready();
    return { backend: "wasm", ms };
  };
  window.__ef = ef;
  return true;
}
