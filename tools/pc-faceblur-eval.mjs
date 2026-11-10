#!/usr/bin/env node
// tools/pc-faceblur-eval.mjs — Product Check: face BLUR before upload (owner decision 2026-11-10), measured on the fixed
// test set of docs/product-check/FACE-BLUR-RESULTS.md §1 (written before this tool was run). Runs the SAME code the tab runs
// (lensiq-pc-run.js faceRuns + faceBlur, lensiq-pc.js faceBlurPlan, PP-OCRv5 det + rec) in headless Chrome with WebGL
// (SwiftShader; MediaPipe's FaceDetector needs it), over
//   A. the pack set: the 281 public product photos of P2 (~/LENSIQ-field/product-check/public-photos; Open Food Facts /
//      Open Beauty Facts; source "public dataset, community-entered, unverified ground truth"), upload = P2 auto crop;
//   B. the real-face set: Open Images V7 validation images with "Human face" boxes (~/LENSIQ-field/face-blur; images
//      CC BY 2.0, annotations CC BY 4.0; source "public dataset"), upload = the whole frame at upload resolution.
// The detector runs ONCE per image (score >= 0.2, frame + 2 x 2 tiles + upload image); every setting of the sweep
// (threshold x tiles x padding) is then applied with LQPC.faceBlurPlan, and the pack upload images are blurred and read
// again only for region sets not seen before. Images and per-image outputs stay OUTSIDE the repo.
//
//   node tools/pc-faceblur-eval.mjs [--limit N] [--packs-only | --faces-only] [--out <json>]
//   node tools/pc-faceblur-eval.mjs --from <json>     summarise a saved run again (no browser)
//   node tools/pc-faceblur-eval.mjs --round3 [--packs <dir>] [--faces <dir>]   3 x 3 tiles + the close-up pass sweep
//   node tools/pc-faceblur-eval.mjs --resume          continue from <out>.partial (checkpoint every 10 images)
//
// Metrics (fixed before the run, §1.4): (a) label readable after blur = among packs whose OCR finds a brand / name token
// before blurring (LQPC.tokenHit), the share still found after; (b) real faces left unblurred = share of ground-truth face
// boxes with < 50 % of their area under blur regions, per face width at upload resolution; (c) packs without a person that
// get >= 1 region. Wilson 95 % intervals. Pick rule (§1.6): on dev, (a) >= 90 %, then the lowest (b).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir, tmpdir, cpus, totalmem, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const P = require("../lensiq-pc.js");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = n => argv.includes(n);
const PACKS = resolve(opt("--packs", join(homedir(), "LENSIQ-field", "product-check", "public-photos")));
const FACES = resolve(opt("--faces", join(homedir(), "LENSIQ-field", "face-blur")));
const OUT = resolve(opt("--out", join(FACES, "eval", `faceblur-${new Date().toISOString().slice(0, 10)}.json`)));
const LIMIT = +opt("--limit", 0) || 0;
if (OUT.startsWith(repo + "/")) { console.error("pc-faceblur-eval: --out must be outside the repo (data never in the repo)"); process.exit(2); }

/* ---------- fixed protocol (§1) ---------- */
const ROUND3 = has("--round3");
const THRESHOLDS = [0.3, 0.4, 0.5, 0.6, 0.7], TILES = [true, false], PADS = [0, 0.15, 0.3];
// detector configurations (round 2, 2026-11-10): the P2 2 x 2 tiles plus finer overlapping grids, optionally upscaled 2x
const CONFIGS_ALL = [{ id: "2x2", grid: 2, overlap: 1 / 3, upscale: 1 }, { id: "3x3", grid: 3, overlap: 0.2, upscale: 1 }, { id: "4x4", grid: 4, overlap: 0.2, upscale: 1 },
  { id: "3x3 up2", grid: 3, overlap: 0.2, upscale: 2 }, { id: "4x4 up2", grid: 4, overlap: 0.2, upscale: 2 }];
const CONFIGS = ROUND3 ? CONFIGS_ALL.filter(c => c.id === "3x3") : CONFIGS_ALL;

// round 3 (2026-11-10): the close-up pass = the whole frame letterboxed so it fills CLOSE of a 640 px square (LQPCRun.faceClose)
const CLOSE = [0.5, 0.65, 0.8];
const SETTINGS = ROUND3 ? [0.4, 0.5, 0.6].flatMap(threshold => [0, 0.15].flatMap(pad => [0, ...CLOSE].map(close => ({ cfg: "3x3", threshold, tiles: true, pad, close }))))
  : [...THRESHOLDS.flatMap(threshold => TILES.flatMap(tiles => PADS.map(pad => ({ cfg: "2x2", threshold, tiles, pad })))),
  ...CONFIGS.slice(1).flatMap(c => [0.4, 0.5, 0.6].flatMap(threshold => [0, 0.15].map(pad => ({ cfg: c.id, threshold, tiles: true, pad }))))];
const READABLE_MIN = 0.9;
const split = key => (/^[0-7]/.test(createHash("sha256").update("lensiq-faceblur:" + key).digest("hex")) ? "dev" : "held-out");
const SIZE_BUCKETS = [[0, 20, "< 20 px"], [20, 40, "20 - 40 px"], [40, 80, "40 - 80 px"], [80, 160, "80 - 160 px"], [160, Infinity, ">= 160 px"]];
const bucketOf = w => SIZE_BUCKETS.find(([a, b]) => w >= a && w < b)[2];
const SCRIPT_OF = { th: "th", cn: "cjk", jp: "cjk", kr: "ko", my: "latin", us: "latin", eu: "latin", de: "latin" };
const name = s => `${s.tiles ? (s.cfg || "2x2") + " tiles" : "no tiles"} · thr ${s.threshold.toFixed(1)} · pad ${s.pad.toFixed(2)}`
  + (ROUND3 ? ` · close ${s.close ? s.close.toFixed(2) : "off"}` : "");

// headless Chrome WITH WebGL (same wrapper as tools/pc-ondevice-eval.mjs; not required by the detector, kept for comparable numbers)
const realChrome = process.env.LQ_CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => existsSync(p));
const wrapDir = mkdtempSync(join(tmpdir(), "lq-pc-blur-"));
const wrapper = join(wrapDir, "chrome-webgl.sh");
writeFileSync(wrapper, [
  "#!/bin/bash", "args=()",
  `for a in "$@"; do case "$a" in --disable-webgl|--disable-3d-apis|--disable-gpu) ;; *) args+=("$a");; esac; done`,
  `exec ${JSON.stringify(realChrome)} --use-angle=swiftshader --enable-unsafe-swiftshader "\${args[@]}"`, ""
].join("\n"));
chmodSync(wrapper, 0o755);
process.env.LQ_CHROME = wrapper;
const { launch } = await import("../tests/e2e/cdp.mjs");
const { serve } = await import("./static-server.mjs");

const pct = x => (100 * x).toFixed(1) + " %";
const rate = (k, n) => { if (!n) return "n = 0"; const w = P.wilson(k, n); return `${k} / ${n} = ${pct(k / n)} [${pct(w.lo)} – ${pct(w.hi)}]`; };
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const p90 = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(0.9 * s.length))] : 0; };
const readJsonl = f => readFileSync(f, "utf8").trim().split("\n").map(l => JSON.parse(l));
function stateFor(det, s) {
  const st = det.states[s.cfg || "2x2"];
  if (!s.close) return st;
  const c = det.close[s.close];
  return { loaded: st.loaded && c.loaded, error: st.error || c.error || "", runs: [...st.runs, { scope: "close", faces: c.faces }] };
}
const planFor = (det, s) => P.faceBlurPlan(stateFor(det, s), det.w, det.h, { threshold: s.threshold, pad: s.pad, tiles: s.tiles,
  need: ["frame", ...(s.tiles ? ["tiles"] : []), ...(s.close ? ["close"] : []), "upload"], crop: det.crop, scale: det.scale });

const FROM = opt("--from", "");
const PARTIAL = OUT + ".partial";
const fresh = () => ({ tool: "tools/pc-faceblur-eval.mjs", date: new Date().toISOString(), machine: {}, settings: SETTINGS, packs: [], faces: [] });
const out = FROM ? JSON.parse(readFileSync(FROM, "utf8")) : has("--resume") && existsSync(PARTIAL) ? JSON.parse(readFileSync(PARTIAL, "utf8")) : fresh();
const checkpoint = () => { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(PARTIAL, JSON.stringify(out)); };
// robust to a browser that dies mid-run (seen once when other browser jobs ran on the same machine): every page call has a
// time limit, finished images are checkpointed, and the run restarts the browser and resumes up to 4 times
const limit = (p, ms, what) => Promise.race([p, new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(what + " timed out")), ms); t.unref(); })]);
if (!FROM) {
  for (let attempt = 1; ; attempt++) {
    try { await run(); break; } catch (e) {
      checkpoint();
      console.log(`run failed (attempt ${attempt}): ${(e && e.message) || e}; restarting the browser and resuming`);
      if (attempt >= 4) throw e;
    }
  }
}
async function run() {
const srv = await serve(repo);
const browser = await launch();
try {
  const page0 = await browser.newPage(null, { isolated: true });
  const page = { goto: u => limit(page0.goto(u), 60000, "goto"), waitFor: (x, ms) => page0.waitFor(x, ms), evaluate: (...a) => limit(page0.evaluate(...a), 300000, "evaluate") };
  await page.goto(`${srv.base}/medicine.html`);
  await page.waitFor("window.LQPCRun && window.LQPC", 15000);
  out.machine = { ...(await page.evaluate(() => ({ ua: navigator.userAgent, webgl2: !!document.createElement("canvas").getContext("webgl2") }))),
    cpu: cpus()[0] && cpus()[0].model, cores: cpus().length, ramGB: Math.round(totalmem() / 1073741824), os: `${platform()} ${release()}` };
  console.log("machine:", JSON.stringify(out.machine));
  // detector once per image: frame + tiles + upload image, every detection with score >= 0.2 (boxes in frame pixels)
  await page.evaluate(() => {
    window.__img = async (data, crop) => {
      const img = new Image(); img.src = "data:image/jpeg;base64," + data; await img.decode();
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0);
      return c;
    };
    window.__packs = {};
  });

  /* ---------- A. packs ---------- */
  if (!has("--faces-only")) {
    let rows = readJsonl(join(PACKS, "manifest.jsonl"));
    if (LIMIT) rows = rows.slice(0, LIMIT);
    const done = new Set(out.packs.map(x => x.file));
    for (const [i, r] of rows.entries()) {
      if (done.has(r.file)) continue;
      const b64 = readFileSync(join(PACKS, "images", r.file)).toString("base64"), script = SCRIPT_OF[r.country_stratum] || "th";
      const o = await page.evaluate(async (file, data, script, cfgs, closes) => {
        const R = window.LQPCRun, P = window.LQPC, c = await window.__img(data);
        const det = await R.detect(c);
        const crop = P.cropFromBoxes(det.boxes, c.width, c.height) || { x: 0, y: 0, w: c.width, h: c.height };
        const states = {}, ms = {};
        let fr;
        for (const k of cfgs) {
          const t0 = performance.now();
          fr = await R.faceRuns(c, crop, { tiles: true, grid: k.grid, overlap: k.overlap, upscale: k.upscale, maxSide: 1024 });
          ms[k.id] = performance.now() - t0;
          states[k.id] = { loaded: fr.loaded, error: fr.error || "", runs: fr.runs };
        }
        const close = {}, msClose = {};
        for (const f of closes) { const t0 = performance.now(); close[f] = await R.faceClose(c, f); msClose[f] = performance.now() - t0; }
        window.__packs[file] = { up: fr.upload, script };
        const before = await R.ocr(fr.upload, { script });
        return { w: c.width, h: c.height, crop, scale: fr.scale, upW: fr.upload.width, upH: fr.upload.height, ms, states, close, msClose, before: before.text };
      }, r.file, b64, script, CONFIGS, ROUND3 ? CLOSE : []);
      const hitBefore = P.tokenHit(o.before, r).hit;
      const row = { file: r.file, split: split(r.file), packArt: !!r.pack_art_person, script, w: o.w, h: o.h, crop: o.crop, scale: o.scale, upW: o.upW, upH: o.upH,
        ms: o.ms, states: o.states, close: o.close, msClose: o.msClose, hitBefore, per: [] };
      const cache = new Map();
      for (const s of SETTINGS) {
        const plan = planFor(row, s);
        const area = plan.regions.reduce((a, g) => a + g.w * g.h, 0) / (o.upW * o.upH);
        let hitAfter = hitBefore;
        if (plan.textOnly) hitAfter = null;
        else if (plan.regions.length && hitBefore != null) {
          const key = JSON.stringify(plan.regions);
          if (!cache.has(key)) {
            const text = await page.evaluate(async (file, regions) => {
              const R = window.LQPCRun, k = window.__packs[file], c = document.createElement("canvas");
              c.width = k.up.width; c.height = k.up.height; c.getContext("2d").drawImage(k.up, 0, 0);
              R.faceBlur(c, regions);
              return (await R.ocr(c, { script: k.script })).text;
            }, r.file, plan.regions);
            cache.set(key, P.tokenHit(text, r).hit);
          }
          hitAfter = cache.get(key);
        }
        row.per.push({ textOnly: plan.textOnly, reason: plan.reason, regions: plan.regions.length, area, hitAfter });
      }
      await page.evaluate(file => { delete window.__packs[file]; }, r.file);
      out.packs.push(row);
      if ((i + 1) % 10 === 0) checkpoint();
      if ((i + 1) % 20 === 0) console.log(`  packs ${i + 1} / ${rows.length}`);
    }
  }

  /* ---------- B. real faces ---------- */
  if (!has("--packs-only")) {
    let rows = readJsonl(join(FACES, "manifest.jsonl"));
    if (LIMIT) rows = rows.slice(0, LIMIT);
    const done = new Set(out.faces.map(x => x.id));
    for (const [i, r] of rows.entries()) {
      if (done.has(r.id)) continue;
      const b64 = readFileSync(join(FACES, "images", r.file)).toString("base64");
      const o = await page.evaluate(async (data, cfgs, closes) => {
        const R = window.LQPCRun, c = await window.__img(data), states = {}, ms = {};
        let fr;
        for (const k of cfgs) {
          const t0 = performance.now();
          fr = await R.faceRuns(c, null, { tiles: true, grid: k.grid, overlap: k.overlap, upscale: k.upscale, maxSide: 1024 });
          ms[k.id] = performance.now() - t0;
          states[k.id] = { loaded: fr.loaded, error: fr.error || "", runs: fr.runs };
        }
        const close = {}, msClose = {};
        for (const f of closes) { const t0 = performance.now(); close[f] = await R.faceClose(c, f); msClose[f] = performance.now() - t0; }
        const t1 = performance.now(); R.faceBlur(fr.upload, [{ x: 0, y: 0, w: Math.min(200, fr.upload.width), h: Math.min(200, fr.upload.height) }]); const msBlur = performance.now() - t1;
        return { w: c.width, h: c.height, crop: fr.crop, scale: fr.scale, upW: fr.upload.width, upH: fr.upload.height, ms, msBlur, states, close, msClose };
      }, b64, CONFIGS, ROUND3 ? CLOSE : []);
      // ground truth (normalised XMin, XMax, YMin, YMax) -> upload pixels
      const gt = r.faces.map(([x0, x1, y0, y1]) => ({ x: x0 * o.upW, y: y0 * o.upH, w: (x1 - x0) * o.upW, h: (y1 - y0) * o.upH }));
      const row = { id: r.id, group: r.group, split: r.split || split(r.id), w: o.w, h: o.h, crop: o.crop, scale: o.scale, upW: o.upW, upH: o.upH, ms: o.ms, msBlur: o.msBlur,
        states: o.states, close: o.close, msClose: o.msClose, gt: gt.map(b => ({ w: Math.round(b.w), rel: +(b.w / o.upW).toFixed(4), bucket: bucketOf(b.w) })), per: [] };
      if (row.split !== split(r.id)) throw new Error("split mismatch " + r.id);
      for (const s of SETTINGS) {
        const plan = planFor(row, s);
        row.per.push({ textOnly: plan.textOnly, reason: plan.reason, regions: plan.regions.length, cov: gt.map(b => +P.coverage(b, plan.regions).toFixed(3)) });
      }
      out.faces.push(row);
      if ((i + 1) % 10 === 0) checkpoint();
      if ((i + 1) % 20 === 0) console.log(`  faces ${i + 1} / ${rows.length}`);
    }
  }
} finally {
  await limit(browser.close(), 15000, "close").catch(() => {});
  await srv.close();
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log("raw output:", OUT);
}

/* ---------- summary ---------- */
function summary(si, sp) {
  const packs = out.packs.filter(r => !sp || r.split === sp), faces = out.faces.filter(r => !sp || r.split === sp);
  const scorable = packs.filter(r => r.hitBefore === true);
  const kept = scorable.filter(r => r.per[si].hitAfter === true).length;
  const clean = packs.filter(r => !r.packArt), art = packs.filter(r => r.packArt);
  const gts = faces.flatMap(r => r.gt.map((g, j) => ({ ...g, cov: r.per[si].cov[j], textOnly: r.per[si].textOnly })));
  const missed = gts.filter(g => g.textOnly ? false : g.cov < 0.5), missed90 = gts.filter(g => !g.textOnly && g.cov < 0.9);
  const closeUps = gts.filter(g => g.rel > 0.35);
  const textOnly = [...packs, ...faces].filter(r => r.per[si].textOnly).length;
  return {
    a: { k: kept, n: scorable.length }, b: { k: missed.length, n: gts.length }, b90: { k: missed90.length, n: gts.length },
    cu: { k: closeUps.filter(g => !g.textOnly && g.cov < 0.5).length, n: closeUps.length },
    bImg: { k: faces.filter(r => r.per[si].cov.some(c => c < 0.5) && !r.per[si].textOnly).length, n: faces.length },
    perBucket: Object.fromEntries(SIZE_BUCKETS.map(([, , l]) => { const g = gts.filter(x => x.bucket === l); return [l, { k: g.filter(x => !x.textOnly && x.cov < 0.5).length, n: g.length }]; })),
    c: { k: clean.filter(r => r.per[si].regions > 0).length, n: clean.length }, art: { k: art.filter(r => r.per[si].regions > 0).length, n: art.length },
    area: clean.length ? clean.reduce((s, r) => s + r.per[si].area, 0) / clean.length : 0, textOnly
  };
}
const R = (x) => (x.n ? x.k / x.n : 0);
const dev = SETTINGS.map((s, i) => ({ s, i, d: summary(i, "dev"), h: summary(i, "held-out") }));
const ok = dev.filter(x => R(x.d.a) >= READABLE_MIN);
const pool = ok.length ? ok : dev;
pool.sort((x, y) => (ok.length ? R(x.d.b) - R(y.d.b) || R(y.d.a) - R(x.d.a) : R(y.d.a) - R(x.d.a) || R(x.d.b) - R(y.d.b)) || x.s.threshold - y.s.threshold);
const pick = pool[0];
console.log(`\n## Sweep (dev picks; held-out shown for transparency only)\n`);
console.log("| Setting | (a) readable after blur, dev | (b) real faces unblurred, dev | (a) held-out | (b) held-out | (c) clean packs with a region (all)"
  + " | blurred area of clean packs (mean) | (b<90 %) dev | close-ups missed, dev |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const x of dev) {
  const all = summary(x.i, "");
  const cells = [x === pick ? "**" + name(x.s) + "**" : name(x.s), rate(x.d.a.k, x.d.a.n), rate(x.d.b.k, x.d.b.n), rate(x.h.a.k, x.h.a.n), rate(x.h.b.k, x.h.b.n),
    rate(all.c.k, all.c.n), pct(all.area), rate(x.d.b90.k, x.d.b90.n), rate(x.d.cu.k, x.d.cu.n)];
  console.log(`| ${cells.join(" | ")} |`);
}
console.log(`\npick rule: dev (a) >= ${pct(READABLE_MIN)}, then lowest dev (b); ${ok.length} of ${SETTINGS.length} settings pass (a). PICKED: ${name(pick.s)}`);
for (const [lab, sp] of [["dev", "dev"], ["held-out", "held-out"], ["all", ""]]) {
  const m = summary(pick.i, sp);
  console.log(`\n### Picked setting, ${lab}`);
  console.log(`(a) ${rate(m.a.k, m.a.n)} · (b) ${rate(m.b.k, m.b.n)} · images with >= 1 missed face ${rate(m.bImg.k, m.bImg.n)}`);
  console.log(`(c) ${rate(m.c.k, m.c.n)} · pack art with a region ${rate(m.art.k, m.art.n)} · text-only uploads ${m.textOnly}`);
  console.log(`(b, stricter: < 90 % of the face covered) ${rate(m.b90.k, m.b90.n)} · close-ups (face wider than 35 % of the image) missed ${rate(m.cu.k, m.cu.n)}`);
  console.log("| Face width at upload resolution | " + SIZE_BUCKETS.map(b => b[2]).join(" | ") + " |");
  console.log("|---|" + SIZE_BUCKETS.map(() => "---").join("|") + "|");
  console.log("| real faces unblurred | " + SIZE_BUCKETS.map(([, , l]) => rate(m.perBucket[l].k, m.perBucket[l].n)).join(" | ") + " |");
}
console.log("\nper-bucket (b) on dev for every setting:");
for (const x of dev) console.log(name(x.s), SIZE_BUCKETS.map(([, , l]) => `${l}: ${x.d.perBucket[l].k}/${x.d.perBucket[l].n}`).join(" · "));
const bms = out.faces.map(r => r.msBlur);
console.log(`\nlatency per detector configuration (faceRuns = frame + tiles + upload image; this machine; ms):`);
console.log("| Configuration | faces set (1,600 px) median | p90 | packs (400 px) median | p90 |\n|---|---|---|---|---|");
for (const k of CONFIGS) {
  const f = out.faces.map(r => r.ms[k.id]), p = out.packs.map(r => r.ms[k.id]);
  console.log(`| ${k.id} | ${Math.round(med(f))} | ${Math.round(p90(f))} | ${Math.round(med(p))} | ${Math.round(p90(p))} |`);
}
for (const f of ROUND3 ? CLOSE : []) {
  const a = out.faces.map(r => r.msClose[f]), b = out.packs.map(r => r.msClose[f]);
  console.log(`| + close-up pass ${f} (extra) | ${Math.round(med(a))} | ${Math.round(p90(a))} | ${Math.round(med(b))} | ${Math.round(p90(b))} |`);
}
console.log(`faceBlur 200 px region median ${med(bms).toFixed(1)} ms`);
const groups = JSON.stringify(out.faces.reduce((a, r) => ((a[r.group] = (a[r.group] || 0) + 1), a), {}));
console.log(`sets: packs ${out.packs.length} (dev ${out.packs.filter(r => r.split === "dev").length}, scorable ${out.packs.filter(r => r.hitBefore === true).length}),`
  + ` faces images ${out.faces.length} (dev ${out.faces.filter(r => r.split === "dev").length}), face boxes ${out.faces.reduce((s, r) => s + r.gt.length, 0)}; groups ${groups}`);
console.log(`detector errors / not loaded: ${[...out.packs, ...out.faces].filter(r => [...Object.values(r.states), ...Object.values(r.close || {})].some(x => !x.loaded || x.error)).length}`);
