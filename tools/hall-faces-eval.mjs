#!/usr/bin/env node
// tools/hall-faces-eval.mjs — Exam hall, small and distant faces (owner order 2026-11-18 night):
//   (a) BlazeFace full-range (dense and sparse) instead of the short-range detector inside today's Face Landmarker
//   (b) tiled inference (SAHI-style slices + whole frame, merged) on a 1920 x 1080 stream
//   (a + b) both together
// on a SYNTHETIC locked set: drawn faces (tools/look-synth-face.js, no photo of any person) scaled to 16 / 24 / 32 / 48 /
// 64 px face width in drawn hall scenes (tools/hall-faces-scene.js). Protocol: ~/LENSIQ-field/evals/hall-faces/PROTOCOL.md
// (locked with the frames before any measurement). Evaluation code only: no product file is changed.
//
//   node tools/hall-faces-eval.mjs --probe     renderer sanity on seeds OUTSIDE the set (large faces only); no lock needed
//   node tools/hall-faces-eval.mjs --build     render the set into ~/LENSIQ-field/evals/hall-faces/ (frames/*.jpg + manifest.jsonl)
//   node tools/hall-faces-eval.mjs --run       measure (refuses unless every input is locked: tools/eval-guard.mjs)
//   node tools/hall-faces-eval.mjs --report [--held-out]   tables from results/raw.json (+ held-out for the pick only)
// Measurement-only runtime and models (MediaPipe Tasks Vision 1.2.2; BlazeFace full-range dense + sparse) stay OUTSIDE
// the repo: --vendor <dir> (default ~/LENSIQ-field/evals/hall-faces/vendor), sha256-checked before use.
import { assertFreeSpace } from "./disk-guard.mjs";
import { assertLocked } from "./eval-guard.mjs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir, tmpdir, cpus, totalmem, platform, release } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const XF = require("../lensiq-exam-face.js");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = n => argv.includes(n);
const PHASE = "hall-faces";
const DIR = join(homedir(), "LENSIQ-field", "evals", PHASE);
const FRAMES = join(DIR, "frames");
const RES = join(DIR, "results");
const sha = b => createHash("sha256").update(b).digest("hex");

/* ---------- measurement-only files (outside the repo) ---------- */
const VENDOR = resolve(opt("--vendor", join(DIR, "vendor")));
const VENDOR_MOUNT = "/__eval-vendor";
const VENDOR_FILES = {
  "mediapipe-1.2.2/vision_bundle.mjs": "b65acb59b370cd6561afd9d04c29ed7a87e7ed6386922ac1b263af1f1ad06b7d",
  "mediapipe-1.2.2/wasm/vision_wasm_internal.js": "f2b9c17131ea79716ec6bf07b117a087b2749a6f8a1e2f1f2e77a9382092db5b",
  "mediapipe-1.2.2/wasm/vision_wasm_internal.wasm": "f5bd25147ac89d506074293ce2675969b10e827180db95a0d9689c2ed80764ab",
  "legacy/face_detection_full_range.tflite": "3698b18f063835bc609069ef052228fbe86d9c9a6dc8dcb7c7c2d69aed2b181b",
  "legacy/face_detection_full_range_sparse.tflite": "2c3728e6da56f21e21a320433396fb06d40d9088f2247c05e5635a688d45dfe1"
};
function checkVendor() {
  const fail = why => { console.error(`hall-faces-eval: ${why} (vendor folder ${VENDOR}; it must be outside the repo)`); process.exit(2); };
  if ((VENDOR + "/").startsWith(repo + "/")) fail("vendor folder inside the repo");
  for (const [f, want] of Object.entries(VENDOR_FILES)) {
    const p = join(VENDOR, f);
    if (!existsSync(p)) fail("missing file " + f);
    const got = sha(readFileSync(p)); if (got !== want) fail(`sha256 of ${f} is ${got}, expected ${want}`);
  }
}

/* ---------- fixed set and protocol (PROTOCOL.md) ---------- */
const SIZES = [16, 24, 32, 48, 64];
const PER_SIZE = 20, NEG = { empty: 15, backs: 15 };
const W = 1920, H = 1080;
function specs() {
  const out = [];
  SIZES.forEach((s, si) => {
    for (let i = 0; i < PER_SIZE; i++) {
      out.push({ id: `s${s}-${String(i).padStart(2, "0")}`, seed: 1000 * (si + 1) + i, W, H, sizePx: s, kind: "faces", split: i % 2 ? "held-out" : "dev" });
    }
  });
  for (const [kind, n] of Object.entries(NEG)) {
    for (let i = 0; i < n; i++) {
      out.push({ id: `${kind}-${String(i).padStart(2, "0")}`, seed: (kind === "empty" ? 7000 : 8000) + i, W, H, sizePx: 0, kind, split: i % 2 ? "held-out" : "dev" });
    }
  }
  return out;
}
const ENGINES = ["lm8", "short", "dense", "sparse"];
const TILES = [640, 480, 320];
const CONFS = [0.5, 0.3];
/** options (fixed before the run): engine x tiles (0 = whole frame only) x conf; lm8 has no score: whole frame, its own 0.5 */
function options() {
  const o = [{ key: "lm8:t0@0.5", eng: "lm8", tiles: 0, conf: 0.5, group: "current" }];
  for (const eng of ["short", "dense", "sparse"]) for (const tiles of [0, ...TILES]) for (const conf of CONFS) {
    const group = eng === "short" ? (tiles ? "b" : "current-detector") : (tiles ? "a+b" : "a");
    o.push({ key: `${eng}:t${tiles}@${conf}`, eng, tiles, conf, group });
  }
  return o;
}
/** match rule (PROTOCOL.md §4): a detection matches a drawn face when its centre lies inside the face box and its width is
 *  0.4 – 2.5 x the face width; one detection per face, greedy by score; every unmatched detection is a false positive. */
function match(gt, dets) {
  const used = new Set(), hit = new Array(gt.length).fill(false);
  const order = dets.map((d, i) => i).sort((a, b) => dets[b].score - dets[a].score);
  for (const i of order) {
    const d = dets[i], cx = d.box.x + d.box.w / 2, cy = d.box.y + d.box.h / 2;
    let best = -1, bestDist = Infinity;
    gt.forEach((g, j) => {
      if (hit[j]) return;
      if (cx < g.x || cx > g.x + g.w || cy < g.y || cy > g.y + g.h) return;
      if (d.box.w < 0.4 * g.w || d.box.w > 2.5 * g.w) return;
      const dist = Math.hypot(cx - (g.x + g.w / 2), cy - (g.y + g.h / 2)); if (dist < bestDist) { bestDist = dist; best = j; }
    });
    if (best >= 0) { hit[best] = true; used.add(i); }
  }
  return { hit, fp: dets.length - used.size };
}
function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}
const pct = v => (v * 100).toFixed(1) + " %";
const frac = (k, n) => { const [lo, hi] = wilson(k, n).map(v => Math.min(1, Math.max(0, v))); return `${k} / ${n} = ${pct(n ? k / n : 0)} [${pct(lo)} – ${pct(hi)}]`; };

/* ---------- browser kit ---------- */
const limit = (p, ms, what) => Promise.race([p, new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(what + " timed out")), ms); t.unref(); })]);
async function kit(needVendor) {
  assertFreeSpace({ label: "tools/hall-faces-eval.mjs" }); // exit 75 under 5 GB free
  if (needVendor) checkVendor();
  const realChrome = process.env.LQ_CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => existsSync(p));
  const wrapDir = mkdtempSync(join(tmpdir(), "lq-hallfaces-"));
  const wrapper = join(wrapDir, "chrome-webgl.sh");
  writeFileSync(wrapper, ["#!/bin/bash", "args=()",
    `for a in "$@"; do case "$a" in --disable-webgl|--disable-3d-apis|--disable-gpu) ;; *) args+=("$a");; esac; done`,
    `exec ${JSON.stringify(realChrome)} --use-angle=swiftshader --enable-unsafe-swiftshader "\${args[@]}"`, ""].join("\n"));
  chmodSync(wrapper, 0o755);
  process.env.LQ_CHROME = wrapper;
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const { serve } = await import("./static-server.mjs");
  const { PAGE_LIB } = await import("./hall-faces-page.mjs");
  const mounts = needVendor ? { [VENDOR_MOUNT]: VENDOR } : {};
  return { PAGE_LIB, srv: await serve(repo, { mounts }), browser: await launch() };
}
async function openPage(k) {
  const p0 = await k.browser.newPage(null, { isolated: true });
  const page = { evaluate: (...a) => limit(p0.evaluate(...a), 900000, "evaluate"), send: (m, p) => p0.send(m, p), close: () => p0.close(), raw: p0 };
  await limit(p0.goto(`${k.srv.base}/exam-hall.html`), 60000, "goto");
  await p0.waitFor("window.LQExam && window.LQDetect", 20000);
  await page.evaluate(k.PAGE_LIB, VENDOR_MOUNT);
  return page;
}

/* ---------- --probe: renderer sanity, seeds outside the set, large faces ---------- */
async function probe() {
  const k = await kit(true);
  try {
    const page = await openPage(k);
    const sizes = [64, 96, 128];
    const frames = [];
    for (const s of sizes) {
      for (let i = 0; i < 2; i++) {
        const sp = { seed: 900000 + s * 10 + i, W: 1280, H: 720, sizePx: s, kind: "faces" };
        frames.push({ s, ...(await page.evaluate(async x => window.__hf.build(x), sp)) });
      }
    }
    for (const eng of ["short", "dense", "lm8"]) {
      const p = eng === "short" ? page : await openPage(k);
      await p.evaluate(async e => window.__hf.init(e), eng);
      for (const s of sizes) {
        let n = 0, h = 0, fp = 0;
        for (const f of frames.filter(x => x.s === s)) {
          const r = await p.evaluate(async (b, t) => window.__hf.frame(b, t), f.jpeg, []);
          const m = match(f.gt.faces, r.whole.filter(d => d.s >= 0.5).map(d => ({ box: d, score: d.s })));
          n += m.hit.length; h += m.hit.filter(Boolean).length; fp += m.fp;
        }
        console.log(`probe ${eng} whole 1280x720 face ${s}px: ${h} / ${n} found, ${fp} false`);
      }
      if (p !== page) await p.close();
    }
    if (has("--save")) {
      const d = join(tmpdir(), "lq-hallfaces-probe"); mkdirSync(d, { recursive: true });
      frames.forEach((f, i) => writeFileSync(join(d, `p${i}-${f.s}.jpg`), Buffer.from(f.jpeg, "base64")));
      console.log("probe frames in", d);
    }
  } finally { await k.browser.close(); await k.srv.close(); }
}

/* ---------- --build ---------- */
async function build() {
  if (existsSync(join(DIR, "manifest.jsonl"))) { console.error("hall-faces-eval: the set exists already (locked sets are never rebuilt in place)"); process.exit(2); }
  mkdirSync(FRAMES, { recursive: true });
  const k = await kit(false);
  const rows = [];
  try {
    const page = await openPage(k);
    for (const sp of specs()) {
      const r = await page.evaluate(async s => window.__hf.build(s), sp);
      const file = `frames/${sp.id}.jpg`, buf = Buffer.from(r.jpeg, "base64");
      writeFileSync(join(DIR, file), buf);
      rows.push({ id: sp.id, file, sha256: sha(buf), seed: sp.seed, W: sp.W, H: sp.H, sizePx: sp.sizePx, kind: sp.kind, split: sp.split, faces: r.gt.faces, backs: r.gt.backs, persons: r.gt.persons });
    }
  } finally { await k.browser.close(); await k.srv.close(); }
  writeFileSync(join(DIR, "manifest.jsonl"), rows.map(r => JSON.stringify(r)).join("\n") + "\n");
  const nf = rows.reduce((a, r) => a + r.faces.length, 0);
  console.log(`built ${rows.length} frames, ${nf} faces -> ${DIR}`);
  for (const s of SIZES) console.log(`  ${s} px: ${rows.filter(r => r.sizePx === s).reduce((a, r) => a + r.faces.length, 0)} faces`);
}

/* ---------- --run ---------- */
const readJsonl = f => readFileSync(f, "utf8").trim().split("\n").map(l => JSON.parse(l));
async function run() {
  const rows = readJsonl(join(DIR, "manifest.jsonl"));
  const inputs = ["PROTOCOL.md", "manifest.jsonl", ...rows.map(r => r.file)];
  const g = assertLocked(PHASE, inputs); // refuses unless every input is locked and committed
  console.log("eval-guard: locked inputs OK", typeof g === "object" && g && g.lockFile ? g.lockFile : "");
  const k = await kit(true);
  const out = { tool: "tools/hall-faces-eval.mjs", date: new Date().toISOString(), machine: {}, frames: {}, latency: {} };
  const latIds = rows.filter(r => r.kind === "faces" && r.sizePx === 32).slice(0, 10).map(r => r.id).concat(rows.filter(r => r.kind === "faces" && r.sizePx === 48).slice(0, 10).map(r => r.id));
  const b64 = id => readFileSync(join(DIR, rows.find(r => r.id === id).file)).toString("base64");
  try {
    for (const eng of ENGINES) {
      const page = await openPage(k);
      const init = await page.evaluate(async e => window.__hf.init(e), eng);
      console.log("engine", JSON.stringify(init));
      if (!out.machine.ua) out.machine = { ...(await page.evaluate(() => ({ ua: navigator.userAgent }))), cpu: cpus()[0] && cpus()[0].model, cores: cpus().length,
        ramGB: Math.round(totalmem() / 1073741824), os: `${platform()} ${release()}` };
      const tiles = eng === "lm8" ? [] : TILES;
      let n = 0;
      for (const r of rows) {
        const o = await page.evaluate(async (b, t) => window.__hf.frame(b, t), b64(r.id), tiles);
        (out.frames[r.id] = out.frames[r.id] || {})[eng] = o;
        if (++n % 40 === 0) console.log(`  ${eng}: ${n} / ${rows.length}`);
      }
      const lost = page.raw.consoleLog.concat(page.raw.consoleErrors).filter(m => m.text && /WebGL context|CONTEXT_LOST|Too many active/i.test(m.text));
      if (lost.length) throw new Error("WebGL context lost with " + eng + ": " + lost[0].text);
      const cfgs = eng === "lm8" ? [{ tiles: 0, conf: 0.5 }] : [0, ...TILES].map(t => ({ tiles: t, conf: 0.5 }));
      const lat = latIds.map(b64);
      for (const rate of [1, 4]) {
        await page.send("Emulation.setCPUThrottlingRate", { rate });
        out.latency["x" + rate] = Object.assign(out.latency["x" + rate] || {}, await page.evaluate(async (d, c) => window.__hf.latency(d, c, 1), lat, cfgs));
      }
      await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      // 4K (3840 x 2160, the locked frames scaled x2): timing only, unthrottled, 5 frames
      out.latency.x1_4k = Object.assign(out.latency.x1_4k || {}, await page.evaluate(async (d, c) => window.__hf.latency(d, c, 2), lat.slice(0, 5), cfgs));
      console.log(`  ${eng} done`);
      await page.close();
    }
  } finally { await k.browser.close(); await k.srv.close(); }
  mkdirSync(RES, { recursive: true });
  const f = join(RES, `raw-${out.date.slice(0, 10)}.json`);
  writeFileSync(f, JSON.stringify(out));
  writeFileSync(join(RES, "LATEST"), basename(f) + "\n");
  console.log("wrote", f);
}

/* ---------- --report ---------- */
function combine(frameOut, o) {
  const e = frameOut[o.eng]; if (!e) return null;
  const all = e.whole.concat(o.tiles ? e["t" + o.tiles] : []).filter(d => d.s >= o.conf).map(d => ({ box: { x: d.x, y: d.y, w: d.w, h: d.h }, score: d.s }));
  return XF.mergeFaces(all);
}
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const p90 = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)] : NaN; };
function score(rows, raw, o) {
  const per = Object.fromEntries(SIZES.map(s => [s, { k: 0, n: 0 }]));
  let fpFaces = 0, fpNeg = 0, nFaceFrames = 0, nNeg = 0, negFramesWithFp = 0;
  for (const r of rows) {
    const dets = combine(raw.frames[r.id] || {}, o); if (!dets) return null;
    const m = match(r.faces, dets);
    if (r.kind === "faces") { per[r.sizePx].n += r.faces.length; per[r.sizePx].k += m.hit.filter(Boolean).length; fpFaces += m.fp; nFaceFrames++; }
    else { fpNeg += m.fp; nNeg++; if (m.fp) negFramesWithFp++; }
  }
  const lat = k => { const L = raw.latency[k] || {}; const v = L[`${o.eng}:t${o.tiles}@0.5:${W}x${H}`] || L[`${o.eng}:t${o.tiles}@0.5:${2 * W}x${2 * H}`]; return v || null; };
  return { per, fpFaces, fpNeg, nFaceFrames, nNeg, negFramesWithFp, fpAll: (fpFaces + fpNeg) / Math.max(1, nFaceFrames + nNeg), x1: lat("x1"), x4: lat("x4"), k4: lat("x1_4k") };
}
/** pick rule (PROTOCOL.md §6), dev only: among options with FP <= 0.05 per frame (all dev frames) and median sweep
 *  <= 1000 ms unthrottled on 1920 x 1080, the highest 24 + 32 + 48 px recall; ties: faster. No eligible option = no pick. */
function pick(devScores) {
  const ok = devScores.filter(x => x.s && x.s.fpAll <= 0.05 && x.s.x1 && median(x.s.x1.ms) <= 1000);
  const rec = s => [24, 32, 48].reduce((a, z) => a + s.per[z].k, 0) / Math.max(1, [24, 32, 48].reduce((a, z) => a + s.per[z].n, 0));
  ok.sort((a, b) => rec(b.s) - rec(a.s) || median(a.s.x1.ms) - median(b.s.x1.ms));
  return ok[0] || null;
}
function table(title, rows, raw, opts) {
  const L = [`#### ${title}`, "", `| Option | group | ${SIZES.map(s => s + " px").join(" | ")} | FP / face frame | FP / no-face frame (frames with FP) | FP / frame all |`,
    `|---|---|${SIZES.map(() => "---").join("|")}|---|---|---|`];
  for (const o of opts) {
    const s = score(rows, raw, o); if (!s) continue;
    const fpF = (s.fpFaces / Math.max(1, s.nFaceFrames)).toFixed(3), fpN = (s.fpNeg / Math.max(1, s.nNeg)).toFixed(3);
    L.push(`| ${o.key} | ${o.group} | ${SIZES.map(z => frac(s.per[z].k, s.per[z].n)).join(" | ")} | ${fpF} | ${fpN} (${s.negFramesWithFp} / ${s.nNeg}) | ${s.fpAll.toFixed(3)} |`);
  }
  return L.join("\n") + "\n";
}
function speedTable(raw, opts) {
  const L = ["#### Speed (ms per full sweep = whole frame + tiles + merge; median / p90; 20 locked frames; headless Chrome, CPU delegate)", "",
    "| Option | passes 1080p | 1080p x1 | sweeps/s x1 | 1080p x4 (emulated mid-range) | sweeps/s x4 | tile overhead vs whole (x1) | passes 4K | 4K x1 (5 frames) |",
    "|---|---|---|---|---|---|---|---|---|"];
  const seen = new Set();
  for (const o of opts) {
    const k = `${o.eng}:t${o.tiles}`; if (seen.has(k)) continue; seen.add(k);
    const g = (rate, w, h) => (raw.latency[rate] || {})[`${o.eng}:t${o.tiles}@0.5:${w}x${h}`];
    const a = g("x1", W, H), b = g("x4", W, H), c = g("x1_4k", 2 * W, 2 * H), base = g("x1", W, H) && (raw.latency.x1 || {})[`${o.eng}:t0@0.5:${W}x${H}`];
    if (!a) continue;
    const mp = v => median(v.ms).toFixed(0) + " / " + p90(v.ms).toFixed(0), fps = v => (1000 / median(v.ms)).toFixed(1);
    const over = base ? "× " + (median(a.ms) / median(base.ms)).toFixed(1) : "–";
    L.push(`| ${k} | ${a.passes} | ${mp(a)} | ${fps(a)} | ${b ? mp(b) : "–"} | ${b ? fps(b) : "–"} | ${over} | ${c ? c.passes : "–"} | ${c ? median(c.ms).toFixed(0) : "–"} |`);
  }
  return L.join("\n") + "\n";
}
function report() {
  const rows = readJsonl(join(DIR, "manifest.jsonl"));
  const rf = opt("--raw", null) || join(RES, readFileSync(join(RES, "LATEST"), "utf8").trim());
  const raw = JSON.parse(readFileSync(rf, "utf8"));
  const opts = options();
  const dev = rows.filter(r => r.split === "dev"), held = rows.filter(r => r.split === "held-out");
  let md = `### Hall faces, synthetic locked set (source: synthetic; ${raw.date}; ${raw.machine.cpu}, ${raw.machine.ramGB} GB, ${raw.machine.ua})\n\n`;
  md += table("Dev (every option)", dev, raw, opts) + "\n";
  const p = pick(opts.map(o => ({ o, s: score(dev, raw, o) })));
  md += `Pick (PROTOCOL.md §6, dev only): **${p ? p.o.key : "none: no option met FP <= 0.05 per frame and <= 1000 ms per sweep"}**\n\n`;
  if (has("--held-out")) {
    md += table("Held-out (the pick, and the current pass for reference)", held, raw, opts.filter(o => o.key === "lm8:t0@0.5" || (p && o.key === p.o.key))) + "\n";
    md += table("All frames (every option, descriptive; printed after the pick was fixed)", rows, raw, opts) + "\n";
  }
  md += speedTable(raw, opts);
  const outMd = join(RES, "tables.md"); writeFileSync(outMd, md); console.log(md); console.log("wrote", outMd);
}

if (has("--probe")) await probe();
else if (has("--build")) await build();
else if (has("--run")) await run();
else if (has("--report")) report();
else { console.log("usage: --probe | --build | --run | --report [--held-out] [--raw <file>]"); process.exit(1); }
