#!/usr/bin/env node
// tools/crowd-ladder.mjs — synthetic crowd density ladder for crowd.html's person detector (owner order 2026-11-18, Crowd (a)/(c)).
// EVALUATION ONLY: no product file changes. Source label of every number: "synthetic (rendered figures, no real photos)".
//
//   node tools/crowd-ladder.mjs render [--out ~/LENSIQ-field/evals/crowd-ladder] [--dev]
//       Renders the fixed ladder in headless Chrome (canvas, seeded PRNG): drawn human figures on a drawn floor, no photos,
//       no real people. Two camera geometries (see SCENES): "near" (entrance / shop camera, 2.5 m high, 47.6 m² of floor in
//       view, people 24–57 % of the frame height) and "far" (event / plaza camera, 6 m high, 595 m² in view, people 7–27 %).
//       People per frame: LEVELS[scene]; SEEDS images per level; 1280×720 JPEG. Writes <out>/<scene>-n<N>-s<k>.jpg,
//       <out>/ladder-truth.json (every person's box, depth, visible fraction, head visible fraction) and <out>/PROTOCOL.md
//       (the pass rule, written before any measurement). --dev writes a separate dev set (other seeds, prefix "dev-") to
//       --out (required, outside the evals folder) for a renderer sanity check only; it is never scored as a result.
//   node tools/crowd-ladder.mjs run --out <results.json outside the repo> [--variants shipped,shipped-nocap,tiles3x2,tiles4x3,tiles6x4]
//       Refuses unless every ladder file is locked (tools/eval-guard.mjs, phase "crowd-ladder"). Runs the page's own
//       lensiq-detect.js detectPeople (YOLOX-Nano 416, ORT Web WASM, no WebGL, the page's minScore / split / box cap read
//       from lensiq-zonecam.js) on every image, per variant, and scores the count against the ground truth.
//   node tools/crowd-ladder.mjs score --in <results.json>      prints the Markdown tables again from a results file.
import { assertFreeSpace } from "./disk-guard.mjs";
import { assertLocked, EVALS_ROOT } from "./eval-guard.mjs";
import { pagePipeline } from "./crowd-eval.mjs";
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PHASE = "crowd-ladder";
export const SET_DIR = join(EVALS_ROOT, PHASE);
export const FRAME = { w: 1280, h: 720 };
export const SEEDS = 5;
/** pinhole camera, zero tilt: ground point at depth z (m) -> y = horizon + f·cam/z; person height px = f·1.7/z */
export const SCENES = {
  near: { f: 900, cam: 2.5, horizon: 120, zMax: 9, label: "near: entrance / shop camera 2.5 m high" },
  far: { f: 900, cam: 6, horizon: 40, zMax: 30, label: "far: event / plaza camera 6 m high" }
};
export const LEVELS = { near: [5, 10, 20, 40, 80, 160], far: [5, 10, 20, 40, 80, 160, 320] };
/** variants: tiles = full frame + C×R tiles (overlap 0.2), the round 16 experiment path of lensiq-detect.js */
export const VARIANTS = {
  shipped: { label: "as shipped (416, 2 halves, page cap)", tiles: null, cap: "page" },
  "shipped-nocap": { label: "as shipped, box cap 300", tiles: null, cap: 300 },
  tiles3x2: { label: "full + 3×2 tiles (7 runs)", tiles: [3, 2], cap: 300 },
  tiles4x3: { label: "full + 4×3 tiles (13 runs)", tiles: [4, 3], cap: 300 },
  tiles6x4: { label: "full + 6×4 tiles (25 runs, not phone-viable)", tiles: [6, 4], cap: 300 }
};
/** pass rule (PROTOCOL.md): a variant "works" at a level when MAPE <= 15 % AND |bias| <= 15 % of the true count
 *  (the medium acceptance band of RESEARCH-R15 §B), over the SEEDS images of that level */
export const PASS = { mape: 15, bias: 15 };

/** area of floor in view (m²) where a standing person's feet are inside the frame */
export function sceneArea(s, W = FRAME.w, H = FRAME.h) {
  const zMin = s.f * s.cam / (H - s.horizon);
  return (W / (2 * s.f)) * (s.zMax ** 2 - zMin ** 2);
}
export const fileName = (scene, n, k, dev = false) => `${dev ? "dev-" : ""}${scene}-n${n}-s${k}.jpg`;
export function ladderFiles(dev = false) {
  const out = [];
  for (const [scene, lv] of Object.entries(LEVELS)) for (const n of lv) for (let k = 0; k < SEEDS; k++) out.push({ scene, n, k, file: fileName(scene, n, k, dev), seed: seedOf(scene, n, k, dev) });
  return out;
}
export function seedOf(scene, n, k, dev = false) {
  let h = 2166136261; const s = `${dev ? "dev" : "ladder"}:v1:${scene}:${n}:${k}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

// ---------- scoring (pure) ----------
/** [{app, ref}] -> {n, mae, mape, bias, biasPct} */
export function stats(pairs) {
  const n = pairs.length; if (!n) return { n: 0 };
  const r1 = v => Math.round(v * 10) / 10;
  const mae = pairs.reduce((s, p) => s + Math.abs(p.app - p.ref), 0) / n;
  const mape = 100 * pairs.reduce((s, p) => s + Math.abs(p.app - p.ref) / p.ref, 0) / n;
  const bias = pairs.reduce((s, p) => s + p.app - p.ref, 0) / n;
  const biasPct = 100 * pairs.reduce((s, p) => s + (p.app - p.ref) / p.ref, 0) / n;
  return { n, mae: r1(mae), mape: r1(mape), bias: r1(bias), biasPct: r1(biasPct), refMean: r1(pairs.reduce((s, p) => s + p.ref, 0) / n), appMean: r1(pairs.reduce((s, p) => s + p.app, 0) / n) };
}
export const passes = s => s.n > 0 && s.mape <= PASS.mape && Math.abs(s.biasPct) <= PASS.bias;
/** greedy IoU >= thr matching of detections to truth boxes -> {tp, fp, fn} */
export function match(dets, truth, thr = 0.5) {
  const iou = (a, b) => { const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1); return i / (a.w * a.h + b.w * b.h - i || 1); };
  const used = new Set(); let tp = 0;
  for (const d of dets.slice().sort((a, b) => b.score - a.score)) {
    let best = -1, bi = -1;
    truth.forEach((t, i) => { if (used.has(i)) return; const v = iou(d, t); if (v > best) { best = v; bi = i; } });
    if (best >= thr) { used.add(bi); tp++; }
  }
  return { tp, fp: dets.length - tp, fn: truth.length - tp };
}

// ---------- renderer (runs in the page; self-contained) ----------
async function renderInPage(cfg) {
  const { W, H, scene: S, n, seed } = cfg;
  let st = seed >>> 0;
  const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const zMin = S.f * S.cam / (H - S.horizon);
  const yOf = z => S.horizon + S.f * S.cam / z;
  // ----- background: wall / buildings above the horizon, a textured floor below
  const wall = x.createLinearGradient(0, 0, 0, S.horizon + 40);
  const wallTone = pick([[196, 190, 178], [170, 178, 186], [210, 200, 186], [150, 160, 170]]);
  wall.addColorStop(0, `rgb(${wallTone.map(v => v - 30).join(",")})`); wall.addColorStop(1, `rgb(${wallTone.join(",")})`);
  x.fillStyle = wall; x.fillRect(0, 0, W, S.horizon + 2);
  for (let i = 0; i < 8; i++) { // windows / posters / shop fronts
    const w = lerp(60, 200, rnd()), h = lerp(S.horizon * 0.3, S.horizon * 0.8, rnd());
    x.fillStyle = `rgba(${pick(["60,70,90", "120,90,60", "40,50,60", "200,210,220", "150,40,40"])},0.7)`;
    x.fillRect(rnd() * W, S.horizon - h - rnd() * 10, w, h);
  }
  const floorTone = pick([[128, 124, 118], [150, 144, 132], [110, 112, 116], [160, 150, 140]]);
  const fl = x.createLinearGradient(0, S.horizon, 0, H);
  fl.addColorStop(0, `rgb(${floorTone.map(v => v + 20).join(",")})`); fl.addColorStop(1, `rgb(${floorTone.map(v => v - 15).join(",")})`);
  x.fillStyle = fl; x.fillRect(0, S.horizon, W, H - S.horizon);
  x.strokeStyle = "rgba(60,60,60,0.25)"; x.lineWidth = 1;
  for (let z = zMin; z < S.zMax * 1.5; z += 1) { const y = yOf(z); x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
  for (let X = -40; X <= 40; X += 1) { x.beginPath(); x.moveTo(W / 2 + S.f * X / zMin, yOf(zMin)); x.lineTo(W / 2 + S.f * X / (S.zMax * 3), yOf(S.zMax * 3)); x.stroke(); }
  for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "255,255,255"},${0.03 + 0.05 * rnd()})`; x.fillRect(rnd() * W, S.horizon + rnd() * (H - S.horizon), 2, 2); }
  // ----- people: uniform over the floor area, at least 0.40 m apart (centre to centre)
  const people = [];
  const halfW = z => (W / 2) * z / S.f;
  let tries = 0;
  while (people.length < n && tries < n * 4000) {
    tries++;
    const z = Math.sqrt(zMin ** 2 + rnd() * (S.zMax ** 2 - zMin ** 2));
    const hw = halfW(z) - 0.3; if (hw <= 0) continue;
    const X = (rnd() * 2 - 1) * hw;
    if (people.some(p => (p.X - X) ** 2 + (p.z - z) ** 2 < 0.40 ** 2)) continue;
    people.push({ X, z });
  }
  // ----- clutter (not people): poles, bins, planters
  const clutter = [];
  for (let i = 0; i < 6; i++) { const z = lerp(zMin, S.zMax, rnd()); clutter.push({ X: (rnd() * 2 - 1) * (halfW(z) - 0.3), z, kind: pick(["pole", "bin", "planter"]) }); }
  const skins = [[241, 204, 177], [224, 172, 138], [198, 134, 96], [160, 102, 66], [112, 72, 48], [233, 190, 160]];
  const cloth = [[30, 40, 70], [200, 40, 40], [240, 240, 240], [20, 20, 20], [60, 120, 60], [220, 180, 60], [90, 90, 100], [120, 60, 140], [40, 110, 170], [230, 120, 150], [150, 110, 80]];
  const hairs = [[20, 16, 14], [40, 28, 20], [70, 50, 30], [10, 10, 10], [120, 90, 60], [200, 190, 180]];
  const col = (a, k = 0) => `rgb(${a.map(v => Math.max(0, Math.min(255, Math.round(v + k)))).join(",")})`;
  people.forEach(p => {
    p.hm = lerp(1.55, 1.9, rnd());
    p.facing = pick(["front", "back", "side", "front", "back"]);
    p.skin = pick(skins); p.hair = pick(hairs); p.top = pick(cloth); p.bottom = pick(cloth.slice(0, 8)).map(v => v * 0.7);
    p.stride = rnd() * 0.5 - 0.25; p.swing = rnd() * 0.5 - 0.25; p.bag = rnd() < 0.2; p.longHair = rnd() < 0.3; p.skirt = rnd() < 0.12;
  });
  // draw one figure; fillOverride = solid id colour for the visibility buffer
  function figure(ctx, p, idBody, idHead) {
    const sc = S.f / p.z, Hp = p.hm * sc, fx = W / 2 + S.f * p.X / p.z, fy = yOf(p.z);
    const side = p.facing === "side", shW = Hp * (side ? 0.13 : 0.24), hipW = Hp * (side ? 0.12 : 0.18);
    const headH = Hp * 0.13, headW = headH * 0.8, legL = Hp * 0.47, torsoT = fy - legL - Hp * 0.30, hipY = fy - legL;
    const solid = idBody != null;
    const fill = (rgb, k) => solid ? idBody : col(rgb, k);
    if (!solid) { ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(fx, fy, Hp * 0.16, Hp * 0.035, 0, 0, 7); ctx.fill(); }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const seg = (x0, y0, x1, y1, w0, w1, style) => { // tapered limb segment with round ends
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      ctx.fillStyle = style; ctx.beginPath();
      ctx.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2); ctx.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
      ctx.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2); ctx.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(x0, y0, w0 / 2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x1, y1, w1 / 2, 0, 7); ctx.fill();
    };
    if (!solid) { ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = Math.max(1, Hp * 0.008); }
    // legs: thigh + calf with a knee bend, shoes
    const legW = Hp * 0.1;
    for (const s of [-1, 1]) {
      const a = p.stride * s, hx = fx + s * hipW * 0.27, ax = hx + Math.sin(a) * legL, kx = (hx + ax) / 2 + Math.sin(a) * legL * 0.04, ky = hipY + legL * 0.5;
      seg(hx, hipY, kx, ky, legW, legW * 0.78, fill(p.bottom, s * 10 - 5));
      seg(kx, ky, ax, fy - legW * 0.45, legW * 0.78, legW * 0.55, fill(p.bottom, s * 10 - 12));
      ctx.fillStyle = solid ? idBody : "rgb(28,26,30)"; ctx.beginPath(); ctx.ellipse(ax + (side ? legW * 0.35 : 0), fy - legW * 0.25, legW * (side ? 0.8 : 0.5), legW * 0.3, 0, 0, 7); ctx.fill();
    }
    if (p.skirt) { ctx.fillStyle = fill(p.bottom, 10); ctx.beginPath(); ctx.moveTo(fx - hipW * 0.55, hipY - Hp * 0.02); ctx.lineTo(fx + hipW * 0.55, hipY - Hp * 0.02);
      ctx.lineTo(fx + hipW * 0.85, hipY + legL * 0.45); ctx.lineTo(fx - hipW * 0.85, hipY + legL * 0.45); ctx.fill(); }
    // torso: rounded shoulders, chest, waist taper, shaded
    if (!solid) { const g = ctx.createLinearGradient(fx - shW / 2, 0, fx + shW / 2, 0); g.addColorStop(0, col(p.top, -40)); g.addColorStop(0.45, col(p.top, 12));
      g.addColorStop(1, col(p.top, -50)); ctx.fillStyle = g; } else ctx.fillStyle = idBody;
    const sy0 = torsoT + Hp * 0.03;
    ctx.beginPath(); ctx.moveTo(fx - shW * 0.5, sy0 + Hp * 0.02);
    ctx.quadraticCurveTo(fx - shW * 0.5, sy0 - Hp * 0.025, fx - shW * 0.2, sy0 - Hp * 0.03);
    ctx.lineTo(fx + shW * 0.2, sy0 - Hp * 0.03); ctx.quadraticCurveTo(fx + shW * 0.5, sy0 - Hp * 0.025, fx + shW * 0.5, sy0 + Hp * 0.02);
    ctx.quadraticCurveTo(fx + shW * 0.44, sy0 + Hp * 0.14, fx + hipW * 0.5, hipY + Hp * 0.01);
    ctx.lineTo(fx - hipW * 0.5, hipY + Hp * 0.01); ctx.quadraticCurveTo(fx - shW * 0.44, sy0 + Hp * 0.14, fx - shW * 0.5, sy0 + Hp * 0.02); ctx.closePath(); ctx.fill();
    if (!solid) { ctx.fillStyle = col(p.bottom, -20); ctx.fillRect(fx - hipW * 0.5, hipY - Hp * 0.012, hipW, Hp * 0.022); } // belt line
    // arms: upper arm (sleeve), forearm (skin), hand; elbow slightly bent
    const armW = Hp * 0.065, armL = Hp * 0.36;
    for (const s of side ? [1] : [-1, 1]) {
      const a = p.swing * s, sx = fx + s * shW * 0.43, sy = sy0, ex = sx + Math.sin(a) * armL * 0.48 + s * Hp * 0.012, ey = sy + Math.cos(a) * armL * 0.48;
      const hx = ex + Math.sin(a + 0.15 * s) * armL * 0.5, hy = ey + Math.cos(a + 0.15 * s) * armL * 0.5;
      seg(sx, sy, ex, ey, armW, armW * 0.85, fill(p.top, -25));
      seg(ex, ey, hx, hy, armW * 0.75, armW * 0.6, fill(p.skin, -12));
      ctx.fillStyle = fill(p.skin, -5); ctx.beginPath(); ctx.ellipse(hx, hy + armW * 0.25, armW * 0.42, armW * 0.55, 0, 0, 7); ctx.fill();
    }
    if (p.bag) { ctx.fillStyle = solid ? idBody : col([60, 40, 30]); ctx.fillRect(fx + shW * 0.45, hipY - Hp * 0.12, Hp * 0.09, Hp * 0.11); }
    // neck + head (ears, hair volume)
    ctx.fillStyle = fill(p.skin, -18); ctx.fillRect(fx - headW * 0.22, torsoT - Hp * 0.04, headW * 0.44, Hp * 0.075);
    const hcx = fx, hcy = torsoT - Hp * 0.03 - headH / 2;
    ctx.fillStyle = solid ? idHead : col(p.skin);
    ctx.beginPath(); ctx.ellipse(hcx, hcy, headW / 2, headH / 2, 0, 0, 7); ctx.fill();
    if (!side) { ctx.beginPath(); ctx.ellipse(hcx - headW * 0.5, hcy + headH * 0.02, headW * 0.09, headH * 0.13, 0, 0, 7);
      ctx.ellipse(hcx + headW * 0.5, hcy + headH * 0.02, headW * 0.09, headH * 0.13, 0, 0, 7); ctx.fill(); }
    if (!solid && p.facing !== "back") { const g = ctx.createRadialGradient(hcx - headW * 0.15, hcy - headH * 0.1, 1, hcx, hcy, headW * 0.6); g.addColorStop(0, "rgba(255,255,255,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0.18)"); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(hcx, hcy, headW / 2, headH / 2, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = solid ? idHead : col(p.hair);
    if (p.facing === "back") { ctx.beginPath(); ctx.ellipse(hcx, hcy - headH * 0.02, headW * 0.54, headH * 0.53, 0, 0, 7); ctx.fill(); }
    else { ctx.beginPath(); ctx.ellipse(hcx, hcy - headH * 0.16, headW * 0.56, headH * 0.4, 0, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); }
    if (p.longHair) { ctx.fillRect(hcx - headW * 0.55, hcy - headH * 0.15, headW * 0.16, headH * 0.85); ctx.fillRect(hcx + headW * 0.39, hcy - headH * 0.15, headW * 0.16, headH * 0.85); }
    if (!solid && p.facing === "front" && headH > 12) { ctx.shadowBlur = 0; ctx.fillStyle = "rgba(30,20,20,0.8)";
      ctx.fillRect(hcx - headW * 0.24, hcy - headH * 0.02, headW * 0.12, headH * 0.06); ctx.fillRect(hcx + headW * 0.12, hcy - headH * 0.02, headW * 0.12, headH * 0.06);
      ctx.fillStyle = "rgba(120,50,50,0.6)"; ctx.fillRect(hcx - headW * 0.14, hcy + headH * 0.24, headW * 0.28, headH * 0.04); ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(hcx - headW * 0.04, hcy + headH * 0.02, headW * 0.08, headH * 0.16); }
    ctx.shadowBlur = 0;
    const top = hcy - headH * 0.55, armReach = Math.max(shW / 2 + armW, Math.abs(Math.sin(p.swing)) * armL + shW * 0.46 + armW);
    const legReach = Math.abs(Math.sin(p.stride)) * legL + hipW * 0.28 + legW;
    const half = Math.max(armReach, legReach, hipW * 0.85);
    return { x: fx - half, y: top, w: 2 * half + (p.bag ? 0 : 0), h: fy - top + legW * 0.1, headH, Hp, hc: [hcx, hcy, headW / 2, headH / 2], fx, fy };
  }
  function clutterDraw(ctx, o) {
    const sc = S.f / o.z, fx = W / 2 + S.f * o.X / o.z, fy = yOf(o.z);
    if (o.kind === "pole") { ctx.fillStyle = "rgb(80,85,90)"; ctx.fillRect(fx - sc * 0.04, fy - sc * 2.6, sc * 0.08, sc * 2.6); ctx.fillStyle = "rgb(220,200,40)";
      ctx.fillRect(fx - sc * 0.25, fy - sc * 2.6, sc * 0.5, sc * 0.3); }
    if (o.kind === "bin") { ctx.fillStyle = "rgb(40,90,50)"; ctx.fillRect(fx - sc * 0.25, fy - sc * 0.9, sc * 0.5, sc * 0.9); }
    if (o.kind === "planter") { ctx.fillStyle = "rgb(120,80,50)"; ctx.fillRect(fx - sc * 0.5, fy - sc * 0.5, sc * 1.0, sc * 0.5); ctx.fillStyle = "rgb(50,120,50)"; ctx.beginPath();
      ctx.ellipse(fx, fy - sc * 0.8, sc * 0.6, sc * 0.45, 0, 0, 7); ctx.fill(); }
  }
  // painter's order: far first
  const items = people.map((p, i) => ({ z: p.z, p, i })).concat(clutter.map(o => ({ z: o.z, o }))).sort((a, b) => b.z - a.z);
  const idc = document.createElement("canvas"); idc.width = W; idc.height = H;
  const ix = idc.getContext("2d"); ix.imageSmoothingEnabled = false; ix.fillStyle = "#000"; ix.fillRect(0, 0, W, H);
  const enc = v => `rgb(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255})`;
  const geo = [];
  for (const it of items) {
    if (it.o) { clutterDraw(x, it.o); ix.save(); ix.globalCompositeOperation = "source-over"; ix.restore(); // clutter occludes people in the id buffer too
      ix.fillStyle = "#000"; const sc = S.f / it.o.z, fx = W / 2 + S.f * it.o.X / it.o.z, fy = yOf(it.o.z);
      if (it.o.kind === "pole") ix.fillRect(fx - sc * 0.04, fy - sc * 2.6, sc * 0.08, sc * 2.6), ix.fillRect(fx - sc * 0.25, fy - sc * 2.6, sc * 0.5, sc * 0.3);
      if (it.o.kind === "bin") ix.fillRect(fx - sc * 0.25, fy - sc * 0.9, sc * 0.5, sc * 0.9);
      if (it.o.kind === "planter") { ix.fillRect(fx - sc * 0.5, fy - sc * 0.5, sc, sc * 0.5); ix.beginPath(); ix.ellipse(fx, fy - sc * 0.8, sc * 0.6, sc * 0.45, 0, 0, 7); ix.fill(); }
      continue; }
    geo[it.i] = figure(x, it.p, null, null);
    figure(ix, it.p, enc(2 * (it.i + 1)), enc(2 * (it.i + 1) + 1));
  }
  // visible pixel counts per person (body + head) from the id buffer; totals from drawing each figure alone
  const id = ix.getImageData(0, 0, W, H).data, vis = new Map();
  for (let j = 0; j < id.length; j += 4) { const v = (id[j] << 16) | (id[j + 1] << 8) | id[j + 2]; if (v) vis.set(v, (vis.get(v) || 0) + 1); }
  const solo = document.createElement("canvas"), sx = solo.getContext("2d");
  const truth = people.map((p, i) => {
    const g = geo[i], pad = Math.ceil(g.Hp * 0.25) + 4;
    const bx = Math.max(0, Math.floor(g.x) - pad), by = Math.max(0, Math.floor(g.y) - pad), bw = Math.min(W, Math.ceil(g.x + g.w) + pad) - bx, bh = Math.min(H, Math.ceil(g.y + g.h) + pad) - by;
    let tot = 0, totH = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    if (bw > 0 && bh > 0) {
      solo.width = bw; solo.height = bh; sx.fillStyle = "#000"; sx.fillRect(0, 0, bw, bh); sx.setTransform(1, 0, 0, 1, -bx, -by);
      figure(sx, p, enc(2 * (i + 1)), enc(2 * (i + 1) + 1));
      sx.setTransform(1, 0, 0, 1, 0, 0);
      const d = sx.getImageData(0, 0, bw, bh).data;
      for (let j = 0, q = 0; j < d.length; j += 4, q++) { const v = (d[j] << 16) | (d[j + 1] << 8) | d[j + 2];
        const isB = v === 2 * (i + 1), isH = v === 2 * (i + 1) + 1; if (!isB && !isH) continue;
        if (isB) tot++; else totH++;
        const px = bx + (q % bw), py = by + Math.floor(q / bw); if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    }
    const vb = vis.get(2 * (i + 1)) || 0, vh = vis.get(2 * (i + 1) + 1) || 0;
    const r4 = v => Math.round(v * 10000) / 10000;
    return { x: r4(x0 / W), y: r4(y0 / H), w: r4((x1 + 1 - x0) / W), h: r4((y1 + 1 - y0) / H), z: Math.round(p.z * 100) / 100, heightPx: Math.round(g.Hp), headPx: Math.round(g.headH),
      visible: tot + totH ? Math.round(100 * Math.min(1, (vb + vh) / (tot + totH))) / 100 : 0, headVisible: totH ? Math.round(100 * Math.min(1, vh / totH)) / 100 : 0 };
  });
  // camera look: slight blur + sensor noise, then JPEG
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const ox = out.getContext("2d"); ox.filter = "blur(0.6px)"; ox.drawImage(c, 0, 0); ox.filter = "none";
  const img = ox.getImageData(0, 0, W, H), d = img.data;
  for (let j = 0; j < d.length; j += 4) { const e = (rnd() - 0.5) * 10; d[j] += e; d[j + 1] += e; d[j + 2] += e; }
  ox.putImageData(img, 0, 0);
  return { jpeg: out.toDataURL("image/jpeg", 0.88), truth, placed: people.length, tries };
}

// ---------- detection (runs in crowd.html) ----------
async function detectInPage(cfg) {
  const Wd = /** @type {any} */ (window), D = Wd.LQDetect, Z = Wd.LQZones;
  const model = await D.loadYolox();
  const cls = ["person"].map(nm => Z.cocoIndex(nm, "yolox")).filter(i => i >= 0);
  const out = [];
  for (const f of cfg.files) {
    const im = new Image(); im.src = f.url; await im.decode();
    const row = { file: f.file, v: {} };
    for (const v of cfg.variants) {
      const opts = { classes: cls, minScore: cfg.pipe.minScore, detW: cfg.pipe.detW, max: v.cap === "page" ? cfg.pipe.max : v.cap, split: v.tiles ? null : cfg.pipe.split };
      if (v.tiles) opts.tiles = { cols: v.tiles[0], rows: v.tiles[1], overlap: 0.2 };
      const t0 = performance.now();
      const det = await D.detectPeople(model, im, opts);
      const ms = performance.now() - t0;
      const people = det.filter(d => d && d.w > 0 && d.h > 0 && Z.labelOf(d, "yolox") === "person");
      const boxes = people.map(d => ({ x: +d.x.toFixed(4), y: +d.y.toFixed(4), w: +d.w.toFixed(4), h: +d.h.toFixed(4), score: +d.score.toFixed(3) }));
      row.v[v.key] = { count: people.length, ms: Math.round(ms), boxes };
    }
    out.push(row);
  }
  return out;
}

// ---------- CLI ----------
function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const [k, v] = a.slice(2).split("="); o[k] = v != null ? v : (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true); } else o._.push(a);
  }
  return o;
}
const insideRepo = p => { const r = resolve(p); return r === repo || r.startsWith(repo + sep); };
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm", ".onnx": "application/octet-stream", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
function serve(setDir) {
  const srv = createServer((req, res) => {
    let p; try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    let base = repo;
    if (p.startsWith("/__set/")) { base = resolve(setDir); p = "/" + p.slice(7).split("/").pop(); }
    const f = normalize(join(base, p.endsWith("/") ? p + "index.html" : p));
    if (!f.startsWith(base + sep) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[extname(f).toLowerCase()] || "application/octet-stream", "Content-Length": statSync(f).size });
    createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () => r({ srv, base: `http://127.0.0.1:${srv.address().port}` })));
}

function sceneLine(k, s) {
  const zMin = s.f * s.cam / (FRAME.h - s.horizon), a = sceneArea(s);
  return `- **${k}** (${s.label}): floor in view ${a.toFixed(1)} m², depth ${zMin.toFixed(2)}–${s.zMax} m, ` +
    `person height ${Math.round(s.f * 1.7 / zMin)}–${Math.round(s.f * 1.7 / s.zMax)} px (1.7 m person). ` +
    `People per frame: ${LEVELS[k].join(" / ")} = ${LEVELS[k].map(n => (n / a).toFixed(2)).join(" / ")} people/m².`;
}
const PROTOCOL = () => `# Crowd density ladder v1 (synthetic) — protocol, written before any measurement

Source label for every number from this set: **synthetic (rendered figures, no real photos)**. Generator:
\`tools/crowd-ladder.mjs render\` (seeded; Chrome canvas). Frame ${FRAME.w}×${FRAME.h} JPEG q0.88, blur 0.6 px, sensor noise ±5.

Scenes (pinhole camera, zero tilt, people 1.55–1.90 m, at least 0.40 m apart, uniform over the floor in view, 6 non-person
objects per image: poles, bins, planters):
${Object.entries(SCENES).map(([k, s]) => sceneLine(k, s)).join("\n")}

${SEEDS} images per level, ${ladderFiles().length} images. \`ladder-truth.json\` holds every person's box, depth, pixel height, the
share of the figure that is visible (occlusion by people in front and by objects) and the share of the head that is visible.

Reference count = **people placed** (the number an operator wants). Secondary reference, reported alongside: people whose head
is at least 50 % visible (the human counting kit's rule, docs/CROWD-ACCURACY.md).

Measured: the count of person boxes from \`LQDetect.detectPeople\` (the page's YOLOX-Nano 416, minScore, split and box cap,
read from lensiq-zonecam.js) on each still image; the tracker and 5-frame median are not involved (a still gives the same
number every frame). Variants: ${Object.entries(VARIANTS).map(([k, v]) => `\`${k}\` (${v.label})`).join(", ")}.

Pass rule per scene, level and variant (fixed now): **works** when MAPE ≤ ${PASS.mape} % and |mean signed error| ≤ ${PASS.bias} % of the
true count over the ${SEEDS} images (the medium acceptance band of RESEARCH-R15 §B). The break point of a variant is the lowest
density level that does not work. Also reported, not used for the rule: IoU ≥ 0.5 matches (true / false detections), time
per image on this Mac (M1, 1 thread WASM, not a phone).

Limits stated in advance: drawn figures are not real people; COCO-trained YOLOX may find them easier or harder than real
people; the ladder measures how the count changes with density and pixel size, not field accuracy.

Renderer check before the lock (disclosed): a separate dev set (other seeds, never scored as a result) was run at 5 and
10 people per frame only, variants shipped and tiles3x2. Version 1 of the figures (stick-like limbs) was found in 52 % of
isolated near figures: the drawing, not the density, decided the result. The figures were redrawn once (tapered limbs,
knees, shoulders, hands, ears, soft edge shading); isolated figures were then found at 92 % (near) and 92–100 % (far).
The minimum spacing was lowered from 0.45 m to 0.40 m because 160 people could not be placed in the near scene (random
packing limit). Nothing else was tuned; levels, variants and the pass rule were fixed before that check.
`;

async function cmdRender(o) {
  const dev = !!o.dev;
  const out = resolve(String(o.out || (dev ? "" : SET_DIR)));
  if (!o.out && dev) throw new Error("--dev needs --out <folder outside the evals folder>");
  if (insideRepo(out)) throw new Error("--out must be outside the repo");
  if (dev && out.startsWith(EVALS_ROOT)) throw new Error("the dev set must not go into the evals folder");
  mkdirSync(out, { recursive: true });
  assertFreeSpace({ label: "tools/crowd-ladder.mjs" });
  const { launch } = await import(pathToFileURL(join(repo, "tests/e2e/cdp.mjs")).href);
  const browser = await launch();
  const truth = { _about: "Synthetic crowd density ladder v1 (tools/crowd-ladder.mjs). Rendered figures, no real photos. Boxes normalised to the frame.",
    frame: FRAME, scenes: Object.fromEntries(Object.entries(SCENES).map(([k, s]) => [k, { ...s, areaM2: Math.round(sceneArea(s) * 10) / 10 }])), levels: LEVELS, seeds: SEEDS, images: {} };
  try {
    const page = await browser.newPage("about:blank");
    for (const f of ladderFiles(dev)) {
      const r = await page.evaluate(renderInPage, { W: FRAME.w, H: FRAME.h, scene: SCENES[f.scene], n: f.n, seed: f.seed });
      if (r.placed !== f.n) throw new Error(`${f.file}: placed ${r.placed} of ${f.n}`);
      writeFileSync(join(out, f.file), Buffer.from(r.jpeg.split(",")[1], "base64"));
      truth.images[f.file] = { scene: f.scene, n: f.n, seed: f.seed, people: r.truth };
      process.stdout.write(".");
    }
    await page.close();
  } finally { await browser.close(); }
  writeFileSync(join(out, "ladder-truth.json"), JSON.stringify(truth) + "\n");
  if (!dev) writeFileSync(join(out, "PROTOCOL.md"), PROTOCOL());
  console.log(`\nwrote ${Object.keys(truth.images).length} images + ladder-truth.json${dev ? "" : " + PROTOCOL.md"} to ${out}`);
}

export const lockedInputs = () => ["PROTOCOL.md", "ladder-truth.json", ...ladderFiles().map(f => f.file)];

async function cmdRun(o) {
  const dir = o.set ? resolve(String(o.set)) : SET_DIR;
  const dev = !!o.dev;
  if (!o.out) throw new Error("--out <results.json outside the repo> is required");
  if (insideRepo(String(o.out))) throw new Error("--out must be outside the repo");
  if (!dev) assertLocked(PHASE, lockedInputs()); // refuses unless every input file is locked and committed
  const truth = JSON.parse(readFileSync(join(dir, "ladder-truth.json"), "utf8"));
  const keys = String(o.variants || Object.keys(VARIANTS).join(",")).split(",");
  const variants = keys.map(k => { if (!VARIANTS[k]) throw new Error("unknown variant " + k); return { key: k, ...VARIANTS[k] }; });
  const only = o.files ? String(o.files).split(",") : null;
  const files = Object.keys(truth.images).filter(f => !only || only.includes(f));
  assertFreeSpace({ label: "tools/crowd-ladder.mjs" });
  const { launch } = await import(pathToFileURL(join(repo, "tests/e2e/cdp.mjs")).href);
  const pipe = pagePipeline();
  const { srv, base } = await serve(dir);
  const browser = await launch();
  const res = { _about: "Results of tools/crowd-ladder.mjs run. Source: synthetic (rendered figures, no real photos).", generated: new Date().toISOString(),
    device: `${platform()} ${release()} · ${(cpus()[0] || {}).model || "cpu"}`, pipeline: pipe, set: dev ? "DEV (not a result)" : `${PHASE} (locked)`, variants, rows: [] };
  try {
    const page = await browser.newPage(`${base}/crowd.html?cpu`, { timeout: 60000 });
    res.browser = await page.evaluate(() => navigator.userAgent.replace(/^.*(HeadlessChrome\/[\d.]+|Chrome\/[\d.]+).*$/, "$1"));
    for (let i = 0; i < files.length; i += 5) {
      const chunk = files.slice(i, i + 5).map(f => ({ file: f, url: `${base}/__set/${encodeURIComponent(f)}` }));
      const r = await page.evaluate(detectInPage, { files: chunk, variants, pipe });
      res.rows.push(...r); process.stdout.write(".");
    }
    await page.close();
  } finally { await browser.close(); srv.close(); }
  writeFileSync(resolve(String(o.out)), JSON.stringify(res) + "\n");
  console.log("\nwrote " + resolve(String(o.out)));
  report(res, truth);
}

export function summarise(res, truth) {
  const out = [];
  const keys = res.variants.map(v => v.key);
  for (const [scene, lv] of Object.entries(truth.levels)) for (const n of lv) {
    const rows = res.rows.filter(r => truth.images[r.file] && truth.images[r.file].scene === scene && truth.images[r.file].n === n);
    if (!rows.length) continue;
    const ppl = rows.map(r => truth.images[r.file].people);
    const headVis = ppl.map(p => p.filter(q => q.headVisible >= 0.5).length);
    const hpx = ppl.flat().map(q => q.heightPx).sort((a, b) => a - b), med = hpx[hpx.length >> 1];
    const occl = ppl.flat().filter(q => q.visible < 0.5).length / ppl.flat().length;
    const row = { scene, n, density: Math.round(1000 * n / truth.scenes[scene].areaM2) / 1000, images: rows.length,
      headVisibleMean: Math.round(10 * headVis.reduce((a, b) => a + b, 0) / rows.length) / 10,
      medHeightPx: med, occludedShare: Math.round(100 * occl), v: {} };
    for (const k of keys) {
      const pairs = rows.map(r => ({ app: r.v[k].count, ref: truth.images[r.file].n }));
      const pairsVis = rows.map((r, i) => ({ app: r.v[k].count, ref: Math.max(1, headVis[i]) }));
      const m = rows.map(r => match(r.v[k].boxes, truth.images[r.file].people)).reduce((a, b) => ({ tp: a.tp + b.tp, fp: a.fp + b.fp, fn: a.fn + b.fn }), { tp: 0, fp: 0, fn: 0 });
      const ms = rows.map(r => r.v[k].ms).sort((a, b) => a - b);
      const s = stats(pairs);
      row.v[k] = { ...s, works: passes(s), vsHeadVisible: stats(pairsVis), recall: Math.round(100 * m.tp / (m.tp + m.fn)), precision: m.tp + m.fp ? Math.round(100 * m.tp / (m.tp + m.fp)) : null,
        capped: rows.filter(r => r.v[k].count >= (res.variants.find(v => v.key === k).cap === "page" ? res.pipeline.max : 300)).length, msMedian: ms[ms.length >> 1] };
    }
    out.push(row);
  }
  return out;
}
export function breakPoints(sum, keys) {
  const out = {};
  for (const scene of [...new Set(sum.map(r => r.scene))]) for (const k of keys) {
    const rows = sum.filter(r => r.scene === scene);
    const fail = rows.find(r => !r.v[k].works);
    const lastOk = [...rows].reverse().find(r => r.v[k].works && (!fail || r.n < fail.n));
    out[`${scene}|${k}`] = { firstFail: fail ? { n: fail.n, density: fail.density } : null, lastWorking: lastOk ? { n: lastOk.n, density: lastOk.density } : null };
  }
  return out;
}
function report(res, truth) {
  const sum = summarise(res, truth), keys = res.variants.map(v => v.key);
  console.log(`\nSource: synthetic (rendered figures, no real photos). Set: ${res.set}. ${res.device}, ${res.browser || ""}. Pipeline: ${JSON.stringify(res.pipeline)}\n`);
  for (const scene of [...new Set(sum.map(r => r.scene))]) {
    console.log(`### ${scene}\n`);
    console.log(`| People / frame | people/m² | median height px | figures < 50 % visible | ${keys.map(k => `${k}: mean count · MAPE · bias % · works`).join(" | ")} |`);
    console.log(`|---|---|---|---|${keys.map(() => "---").join("|")}|`);
    for (const r of sum.filter(x => x.scene === scene)) {
      const cell = k => { const v = r.v[k]; return `${v.appMean} · ${v.mape} % · ${v.biasPct > 0 ? "+" : ""}${v.biasPct} % · ${v.works ? "yes" : "NO"}`; };
      console.log(`| ${r.n} | ${r.density} | ${r.medHeightPx} | ${r.occludedShare} % | ${keys.map(cell).join(" | ")} |`);
    }
    console.log(`\n| People / frame | head ≥ 50 % visible (mean) | ${keys.map(k => `${k}: recall · precision (IoU 0.5) · MAPE vs head-visible · at cap · ms/image`).join(" | ")} |`);
    console.log(`|---|---|${keys.map(() => "---").join("|")}|`);
    for (const r of sum.filter(x => x.scene === scene)) {
      const cell = k => { const v = r.v[k]; return `${v.recall} % · ${v.precision} % · ${v.vsHeadVisible.mape} % · ${v.capped}/${r.images} · ${v.msMedian}`; };
      console.log(`| ${r.n} | ${r.headVisibleMean} | ${keys.map(cell).join(" | ")} |`);
    }
    console.log("");
  }
  console.log("Break points (first level that fails the pass rule):");
  for (const [k, v] of Object.entries(breakPoints(sum, keys))) {
    const ok = v.lastWorking ? `${v.lastWorking.n}/frame (${v.lastWorking.density}/m²)` : "none";
    console.log(`  ${k}: last working ${ok} · first failing ${v.firstFail ? `${v.firstFail.n}/frame (${v.firstFail.density}/m²)` : "none (all levels work)"}`);
  }
  return sum;
}
function cmdScore(o) {
  const res = JSON.parse(readFileSync(resolve(String(o.in)), "utf8"));
  const truth = JSON.parse(readFileSync(join(o.set ? resolve(String(o.set)) : SET_DIR, "ladder-truth.json"), "utf8"));
  if (o.json) { console.log(JSON.stringify({ summary: summarise(res, truth), breakPoints: breakPoints(summarise(res, truth), res.variants.map(v => v.key)) }, null, 1)); return; }
  report(res, truth);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = args(process.argv.slice(2)), cmd = o._[0];
  const run = { render: cmdRender, run: cmdRun, score: cmdScore }[cmd];
  if (!run) { console.log("usage: node tools/crowd-ladder.mjs render|run|score [options] — see the header of this file"); process.exit(cmd ? 2 : 0); }
  Promise.resolve(run(o)).catch(e => { console.error(e && e.stack || e); process.exit(1); });
}
