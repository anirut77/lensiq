#!/usr/bin/env node
// tools/look-preview-eval.mjs — the fixed synthetic measurement of the look preview (protocol docs/LOOK-PREVIEW-EVAL.md,
// locked in evals-locks/beauty-look.sha256 before lensiq-look-preview.js existed). Runs the page's own geometry
// (lensiq-look-preview.js) on MediaPipe Face Landmarker output for the drawn faces of tools/look-synth-face.js, in headless
// Chrome with SwiftShader WebGL. No photo of a person is used or written anywhere.
//
//   node tools/look-preview-eval.mjs [--limit N]      per-face results -> ~/LENSIQ-field/evals/beauty-look/preview-<date>.json
//                                                      summary          -> tools/look-preview-results.json (read by the unit test)
import { mkdtempSync, writeFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir, homedir, cpus, platform, release } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { assertLocked } from "./eval-guard.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// eval guard (docs/EVAL-LOCKS.md): the locked set (protocol + face generator) lives in ~/LENSIQ-field/evals/beauty-look/set/,
// its sha256 is committed in evals-locks/beauty-look.sha256; the page runs the repo copy of the generator, which must be the
// same bytes as the guarded copy.
const SET = ["set/LOOK-PREVIEW-EVAL.md", "set/look-synth-face.js"];
const guard = assertLocked("beauty-look", SET);
const sha = p => createHash("sha256").update(readFileSync(p)).digest("hex");
for (const [rel, f] of [["docs/LOOK-PREVIEW-EVAL.md", guard.files[0]], ["tools/look-synth-face.js", guard.files[1]]]) {
  if (sha(join(repo, rel)) !== f.sha256) { console.error(`look-preview-eval: ${rel} differs from the locked set copy ${f.path}`); process.exit(1); }
}
console.log(`eval-guard: beauty-look locked (${guard.lockFile} @ ${guard.lockCommit})`);
const argv = process.argv.slice(2);
const LIMIT = +(argv[argv.indexOf("--limit") + 1] || 0) || 0;
const OUTDIR = join(homedir(), "LENSIQ-field", "evals", "beauty-look");
const SEEDS = { dev: [1000, 1059], held: [1060, 1119] };
const TARGETS = {
  lip: { contourMedian: 0.05, contourP90: 0.08, iouMedian: 0.8 },
  liner: { contourMedian: 0.04, contourP90: 0.06 },
  brow: { iouMedian: 0.6, coverageMedian: 0.85 },
  "brow-arch": { deltaEMedian: 8 },
  jitter: 0.008,
  glasses: { anchorMedian: 0.05, anchorP90: 0.08 }
};

const realChrome = process.env.LQ_CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => existsSync(p));
const wrapDir = mkdtempSync(join(tmpdir(), "lq-look-"));
const wrapper = join(wrapDir, "chrome-webgl.sh");
writeFileSync(wrapper, ["#!/bin/bash", "args=()", `for a in "$@"; do case "$a" in --disable-webgl|--disable-3d-apis|--disable-gpu) ;; *) args+=("$a");; esac; done`,
  `exec ${JSON.stringify(realChrome)} --use-angle=swiftshader --enable-unsafe-swiftshader "\${args[@]}"`, ""].join("\n"));
chmodSync(wrapper, 0o755);
process.env.LQ_CHROME = wrapper;
const { launch } = await import("../tests/e2e/cdp.mjs");
const { serve } = await import("./static-server.mjs");

/* ---------------- in-page part ---------------- */
async function PAGE() {
  const load = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  await load("tools/look-synth-face.js"); await load("lensiq-look-preview.js");
  const SF = window.LQSynthFace, LP = window.LQLookPreview, W = 640, H = 480;
  const { FilesetResolver, FaceLandmarker } = await import("/vendor/mediapipe/vision_bundle.mjs");
  const files = await FilesetResolver.forVisionTasks("/vendor/mediapipe/wasm");
  const base = { baseOptions: { modelAssetPath: "/vendor/models/face-landmarker/face_landmarker_lm.task", delegate: "CPU" } };
  const img = await FaceLandmarker.createFromOptions(files, Object.assign({}, base, LP.MP_OPTIONS, { runningMode: "IMAGE" }));
  const vid = await FaceLandmarker.createFromOptions(files, Object.assign({}, base, LP.MP_OPTIONS));
  const canvas = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function densify(ps, closed) {
    const out = [], n = ps.length, m = closed ? n : n - 1;
    for (let i = 0; i < m; i++) { const a = ps[i], b = ps[(i + 1) % n], k = Math.max(1, Math.ceil(d2(a, b))); for (let j = 0; j < k; j++) out.push([a[0] + (b[0] - a[0]) * j / k,
      a[1] + (b[1] - a[1]) * j / k]); }
    if (!closed) out.push(ps[n - 1]);
    return out;
  }
  function contour(A, B, closed) {
    const a = densify(A, closed), b = densify(B, closed);
    const one = (P, Q) => P.reduce((s, p) => s + Math.min(...Q.map(q => d2(p, q))), 0) / P.length;
    return (one(a, b) + one(b, a)) / 2;
  }
  function mask(poly) { const c = canvas(), g = c.getContext("2d"); g.fillStyle = "#fff"; g.beginPath(); poly.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0],
    p[1])); g.closePath(); g.fill(); return g.getImageData(0, 0, W, H).data; }
  function iou(A, B) { const a = mask(A), b = mask(B); let i = 0, u = 0, cb = 0; for (let k = 0; k < a.length; k += 4) { const x = a[k] > 127,
    y = b[k] > 127; if (x && y) i++; if (x || y) u++; if (y) cb++; } return { iou: u ? i / u : 0, cover: cb ? i / cb : 0 }; }
  const centroid = ps => ps.reduce((s, p) => [s[0] + p[0] / ps.length, s[1] + p[1] / ps.length], [0, 0]);
  const pair = (preds, gts) => gts.map(g => preds.slice().sort((x, y) => d2(centroid(x), centroid(g)) - d2(centroid(y), centroid(g)))[0]);
  const lab = (r, g, b) => {
    const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const R = f(r), G = f(g), B = f(b);
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const h = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))];
  };
  function noise(c, seed) {
    const g = c.getContext("2d"), id = g.getImageData(0, 0, W, H), d = id.data; let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < d.length; i += 4) { const n = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd()) * 4; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(id, 0, 0);
  }
  const toLms = f => f.map(p => ({ x: p.x, y: p.y, z: p.z }));
  window.__lp = {
    face(seed) {
      const c = canvas(), g = c.getContext("2d", { willReadFrequently: true }), p = SF.params(seed), gt = SF.draw(g, W, H, p);
      const res = img.detect(c), f = res.faceLandmarks && res.faceLandmarks[0];
      const r = { seed, ipd: gt.ipd, skin: p.skin, roll: +p.roll.toFixed(1), found: !!f };
      if (!f) return r;
      const lms = toLms(f), u = gt.ipd;
      const L = LP.lips(lms, W, H);
      r.lip = { contour: contour(L.outer, gt.lipOuter, true) / u, ...iou(L.outer, gt.lipOuter) };
      const ln = LP.liner(lms, W, H, "thin").map(e => e.base);
      const lids = pair(ln, gt.eyes.map(e => e.upper));
      r.liner = { contour: gt.eyes.reduce((s, e, i) => s + contour(lids[i], e.upper, false), 0) / 2 / u };
      const bw = pair(LP.brows(lms, W, H, "fill"), gt.brows);
      const bi = gt.brows.map((b, i) => iou(bw[i], b));
      r.brow = { iou: (bi[0].iou + bi[1].iou) / 2, cover: (bi[0].cover + bi[1].cover) / 2 };
      const ga = LP.glasses(lms, W, H);
      const pts = [ga.outerR, ga.innerR, ga.outerL, ga.innerL, ga.mid];
      const gts = [gt.eyes[0].outer, gt.eyes[0].inner, gt.eyes[1].outer, gt.eyes[1].inner, [(gt.eyes[0].inner[0] + gt.eyes[1].inner[0]) / 2, (gt.eyes[0].inner[1] + gt.eyes[1].inner[1]) / 2]];
      r.glasses = { anchor: pts.reduce((s, q, i) => s + d2(q, gts[i]), 0) / 5 / u };
      // brow-arch erase step: mean ΔE76 of the erased brow area vs the skin just below the brow (from the untouched frame)
      const before = g.getImageData(0, 0, W, H).data;
      LP.eraseBrows(g, lms, W, H);
      const after = g.getImageData(0, 0, W, H).data;
      const th = p.roll * Math.PI / 180, down = [-Math.sin(th), Math.cos(th)];
      let sum = 0, n = 0;
      gt.brows.forEach(b => {
        const mb = mask(b), mBelow = mask(b.map(q => [q[0] + down[0] * u * 0.13, q[1] + down[1] * u * 0.13]));
        let ref = [0, 0, 0], k = 0;
        for (let i = 0; i < mb.length; i += 4) if (mBelow[i] > 127 && mb[i] < 128) { const l = lab(before[i], before[i + 1], before[i + 2]); ref = [ref[0] + l[0], ref[1] + l[1], ref[2] + l[2]]; k++; }
        if (!k) return; ref = ref.map(v => v / k);
        for (let i = 0; i < mb.length; i += 4) if (mb[i] > 127) { const l = lab(after[i], after[i + 1], after[i + 2]); sum += Math.hypot(l[0] - ref[0], l[1] - ref[1], l[2] - ref[2]); n++; }
      });
      r.archDeltaE = n ? sum / n : null;
      return r;
    },
    jitter(seed, t0) {
      const p = SF.params(seed), sm = LP.smoother(), seq = [], raw = []; let t = t0, ms = 0, frames = 0;
      for (let f = 0; f < 30; f++) {
        const c = canvas(), g = c.getContext("2d", { willReadFrequently: true }), gt = SF.draw(g, W, H, p, { jitter: 1, frame: f });
        noise(c, seed * 100 + f);
        t += 33;
        const a = performance.now();
        const res = vid.detectForVideo(c, t), fl = res.faceLandmarks && res.faceLandmarks[0];
        let pts = null, rpts = null;
        if (fl) {
          const lms = toLms(fl), s = sm(lms, t);
          LP.draw(g, s, W, H, { kind: "lip", lip: ["#c2455a"] });
          const P = m => [].concat(LP.lips(m, W, H).outer, ...LP.liner(m, W, H, "thin").map(e => e.base), ...LP.brows(m, W, H, "fill"));
          pts = P(s); rpts = P(lms);
        }
        ms += performance.now() - a; frames++;
        seq.push(pts); raw.push(rpts);
        if (f === 0) seq.ipd = gt.ipd;
      }
      const rms = arr => { let s = 0, k = 0; for (let f = 6; f < arr.length; f++) { if (!arr[f] || !arr[f - 1]) return null; for (let i = 0; i < arr[f].length; i++) { s += Math.pow(d2(arr[f][i],
        arr[f - 1][i]), 2); k++; } } return Math.sqrt(s / k); };
      const js = rms(seq), jr = rms(raw);
      return { seed, t, jitter: js == null ? null : js / seq.ipd, jitterRaw: jr == null ? null : jr / seq.ipd, msPerFrame: ms / frames };
    }
  };
  return { ua: navigator.userAgent };
}

/* ---------------- run ---------------- */
const srv = await serve(repo);
const browser = await launch();
const out = { tool: "tools/look-preview-eval.mjs", protocol: "docs/LOOK-PREVIEW-EVAL.md", date: new Date().toISOString(), source: "synthetic",
  machine: { cpu: cpus()[0] && cpus()[0].model, cores: cpus().length, os: `${platform()} ${release()}`, browser: "headless Chrome + SwiftShader WebGL (CPU)" }, faces: [], jitter: [] };
try {
  const page = await browser.newPage(null, { isolated: true, timeout: 600000 });
  await page.goto(`${srv.base}/about.html`);
  Object.assign(out.machine, await page.evaluate(PAGE));
  const seeds = [];
  for (const [split, [a, b]] of Object.entries(SEEDS)) for (let s = a; s <= b; s++) seeds.push({ s, split });
  // --limit: a smoke run on DEV faces only (held-out is looked at once, in the full run)
  const devOnly = seeds.filter(x => x.split === "dev"), todo = LIMIT ? devOnly.filter((x, i) => i % Math.ceil(devOnly.length / LIMIT) === 0) : seeds;
  for (const { s, split } of todo) { const r = await page.evaluate(sd => window.__lp.face(sd), s); r.split = split; out.faces.push(r); process.stdout.write("."); }
  let t = 0;
  for (const { s, split } of todo.filter(x => x.split === (LIMIT ? "dev" : "held"))) { const r = await page.evaluate((sd, t0) => window.__lp.jitter(sd, t0), s,
    t); t = r.t + 10000; r.split = split; out.jitter.push(r); process.stdout.write("j"); }
  console.log("");
} finally { await browser.close(); srv.close && srv.close(); }

/* ---------------- summary ---------------- */
const q = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); if (!a.length) return null; return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))]; };
const r3 = v => (v == null ? null : +v.toFixed(3));
function summary(split) {
  const F = out.faces.filter(f => f.split === split), n = F.length, inf = v => (v == null ? Infinity : v);
  const col = fn => F.map(f => (f.found ? fn(f) : null));
  const worst = (fn, bad) => col(fn).map(v => (v == null ? bad : v));
  const J = out.jitter.filter(j => j.split === split);
  const jit = J.map(j => inf(j.jitter)), jitRaw = J.map(j => inf(j.jitterRaw));
  const s = {
    n, detected: F.filter(f => f.found).length,
    lip: { contourMedian: r3(q(worst(f => f.lip.contour, Infinity), 0.5)), contourP90: r3(q(worst(f => f.lip.contour, Infinity), 0.9)), iouMedian: r3(q(worst(f => f.lip.iou, 0), 0.5)) },
    liner: { contourMedian: r3(q(worst(f => f.liner.contour, Infinity), 0.5)), contourP90: r3(q(worst(f => f.liner.contour, Infinity), 0.9)) },
    brow: { iouMedian: r3(q(worst(f => f.brow.iou, 0), 0.5)), coverageMedian: r3(q(worst(f => f.brow.cover, 0), 0.5)) },
    "brow-arch": { deltaEMedian: r3(q(worst(f => f.archDeltaE, Infinity), 0.5)) },
    glasses: { anchorMedian: r3(q(worst(f => f.glasses.anchor, Infinity), 0.5)), anchorP90: r3(q(worst(f => f.glasses.anchor, Infinity), 0.9)) },
    jitter: { median: J.length ? r3(q(jit, 0.5)) : null, rawMedian: J.length ? r3(q(jitRaw, 0.5)) : null, n: J.length },
    fpsHeadless: J.length ? +(1000 / (J.reduce((a, j) => a + j.msPerFrame, 0) / J.length)).toFixed(1) : null
  };
  return s;
}
const held = summary(LIMIT ? "dev" : "held"), dev = summary("dev");
const T = TARGETS, jok = held.jitter.median != null && held.jitter.median <= T.jitter;
const kinds = {
  lip: { pass: held.lip.contourMedian <= T.lip.contourMedian && held.lip.contourP90 <= T.lip.contourP90 && held.lip.iouMedian >= T.lip.iouMedian && jok },
  liner: { pass: held.liner.contourMedian <= T.liner.contourMedian && held.liner.contourP90 <= T.liner.contourP90 && jok },
  brow: { pass: held.brow.iouMedian >= T.brow.iouMedian && held.brow.coverageMedian >= T.brow.coverageMedian && jok },
  "brow-arch": { pass: held["brow-arch"].deltaEMedian <= T["brow-arch"].deltaEMedian && held.brow.iouMedian >= T.brow.iouMedian && jok },
  glasses: { pass: held.glasses.anchorMedian <= T.glasses.anchorMedian && held.glasses.anchorP90 <= T.glasses.anchorP90 }
};
for (const k of Object.keys(kinds)) Object.assign(kinds[k], { source: "synthetic", split: "held-out", n: held.n });
const results = { protocol: "docs/LOOK-PREVIEW-EVAL.md", tool: "tools/look-preview-eval.mjs", date: out.date.slice(0, 10), source: "synthetic",
  note: "Drawn synthetic faces (no real people): frontal, closed mouth, no glasses. Not a claim about real faces; field numbers need >= 20 consenting adult volunteers. fps is headless desktop Chrome (SwiftShader), not a phone.",
  targets: T, heldOut: held, dev, kinds, hairColour: { measured: false, why: "the hair segmentation model is not wired into the eval page in this round; hair colour stays an illustration card" },
  machine: out.machine, limited: LIMIT || null };
mkdirSync(OUTDIR, { recursive: true });
const day = out.date.slice(0, 10);
writeFileSync(join(OUTDIR, `preview-${day}${LIMIT ? "-limit" + LIMIT : ""}.json`), JSON.stringify(out, null, 1));
if (!LIMIT) writeFileSync(join(repo, "tools", "look-preview-results.json"), JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify({ heldOut: held, dev, kinds }, null, 1));
process.exit(0);
