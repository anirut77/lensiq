#!/usr/bin/env node
// tools/plate-det-eval.mjs — measures the LENSIQ Gate plate DETECTOR (lensiq-plate.js: findPlates + optional LPD-YuNet)
// on the synthetic demo set (LQPlate.DEMO_SET, drawn by GateKit.drawScene) and, optionally, on real photos with
// hand-labelled plate boxes. Runs headless Chrome (tests/e2e/cdp.mjs) against a local static server; nothing leaves the
// machine and nothing is written into the repo.
//
//   node tools/plate-det-eval.mjs [--seed N] [--per-cat N] [--ocr N|all] [--no-model|--model-always] [--baseline] [--json]
//        [--images DIR --gt gt.json]
//
//   --seed N      demo-set seed (default DEMO_SET.seed = the development set; docs/GATE.md also reports a held-out seed)
//   --per-cat N   scenes per category (default DEMO_SET.perCat)
//   --ocr N|all   also read the top box with the real Thai OCR for the first N scenes of each category (exact-read rate)
//   --no-model    classical proposals only (do not load LPD-YuNet)
//   --model-always  run LPD-YuNet on every frame (default "auto": only when the classical top box scores < 0.6, as shipped)
//   --baseline    the round-14 finder alone (findCandidates on a 320-px grey frame), for before / after numbers
//   --images DIR --gt gt.json   real photos: gt.json = {"file.jpg": [[x0, y0, x1, y1], ...]} in pixels. Photos are read
//                 from DIR and passed to the page as data: URLs — keep them OUT of the repo (licences, people, plates).
//   --json        print the full result as JSON
//
// Metrics: det = the TOP box has IoU >= 0.5 with the true plate (what auto-read uses); det3 = any of the top 3;
// read = exact plate key; fp = plate-less scenes whose top box would start an auto-read (score >= LQPlate.AUTO_MIN).
// Wilson 95 % intervals. Target (docs/GATE.md): det >= 90 % per category — reported as met / not met, never tuned for.
// Exit codes: 0 ok · 2 usage / browser error.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const a = { json: false, model: "auto", baseline: false, ocr: 0, seed: null, perCat: null, images: null, gt: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => { if (argv[i + 1] == null || argv[i + 1].startsWith("--")) throw new Error(`${k} needs a value`); return argv[++i]; };
    if (k === "--json") a.json = true;
    else if (k === "--no-model") a.model = false;
    else if (k === "--model-always") a.model = true;
    else if (k === "--baseline") { a.baseline = true; a.model = false; }
    else if (k === "--seed") a.seed = parseInt(v(), 10);
    else if (k === "--per-cat") a.perCat = parseInt(v(), 10);
    else if (k === "--ocr") { const x = v(); a.ocr = x === "all" ? 1e9 : parseInt(x, 10) || 0; }
    else if (k === "--images") a.images = v();
    else if (k === "--gt") a.gt = v();
    else throw new Error(`unknown argument ${k}`);
  }
  if (!!a.images !== !!a.gt) throw new Error("--images and --gt go together");
  if (a.seed != null && !(a.seed > 0)) throw new Error("--seed must be a positive integer");
  return a;
}

const pct = w => (w && w.p != null ? (w.p * 100).toFixed(1) + "%" : "—");
const ci = w => (w && w.p != null ? `${(w.lo * 100).toFixed(1)}–${(w.hi * 100).toFixed(1)}%` : "—");
function table(head, rows) {
  const all = [head, ...rows], w = head.map((_, i) => Math.max(...all.map(r => [...String(r[i])].length)));
  const line = r => r.map((c, i) => String(c) + " ".repeat(w[i] - [...String(c)].length)).join("  ").trimEnd();
  return [line(head), w.map(x => "-".repeat(x)).join("  "), ...rows.map(line)].join("\n");
}
export function formatSummary(sum) {
  const rows = Object.entries(sum).map(([k, s]) => k === "none"
    ? [k, s.neg, "—", "—", "—", "—", `${s.fp.x}/${s.neg} (${pct(s.fp)})`, "—", s.msMedian == null ? "—" : s.msMedian]
    : [k, s.n, `${s.det.x}/${s.n} ${pct(s.det)}`, ci(s.det), `${pct(s.det3)}`, s.read.n ? `${s.read.x}/${s.read.n} ${pct(s.read)}` : "—", "—", s.target, s.msMedian == null ? "—" : s.msMedian]);
  return table(["category", "n", "det top-1", "95% CI", "det top-3", "exact read", "false trigger", "90% target", "ms (median)"], rows);
}

async function main() {
  let a;
  try { a = parseArgs(process.argv.slice(2)); } catch (e) {
    console.error(`plate-det-eval: ${e.message}\nusage: node tools/plate-det-eval.mjs [--seed N] [--per-cat N] [--ocr N|all] [--no-model] [--baseline] [--json] [--images DIR --gt gt.json]`);
    return 2;
  }
  const { serve } = await import(pathToFileURL(join(repo, "tools/static-server.mjs")).href);
  const { launch } = await import(pathToFileURL(join(repo, "tests/e2e/cdp.mjs")).href);
  const srv = await serve(repo);
  let browser = null;
  try {
    browser = await launch();
    const page = await browser.newPage(null, { initScripts: ["window.confirm=()=>true;"] });
    await page.goto(`${srv.base}/parking.html?cpu`);
    await page.waitFor("!!(window.GateKit && window.GateKit.demoEval && window.LQPlate)", 15000);
    const opts = { model: a.model, baseline: a.baseline, ocr: a.ocr || 0, ...(a.seed ? { seed: a.seed } : {}), ...(a.perCat ? { perCat: a.perCat } : {}) };
    const t0 = Date.now();
    const demo = await page.evaluate(async o => {
      const r = await window.GateKit.demoEval(o);
      return { summary: r.summary, set: r.set, rows: r.rows, model: window.LQPlate.plateDetReady() };
    }, opts);
    const out = { options: opts, modelLoaded: demo.model, ms: Date.now() - t0, set: { ...demo.set, seed: a.seed || demo.set.seed, perCat: a.perCat || demo.set.perCat },
      summary: demo.summary, rows: demo.rows };
    if (a.images) {
      const gt = JSON.parse(readFileSync(a.gt, "utf8")), files = readdirSync(a.images).filter(f => gt[f]);
      const imgs = files.map(f => ({ f, url: `data:image/${extname(f).slice(1).replace("jpg", "jpeg")};base64,` + readFileSync(join(a.images, f)).toString("base64"), gt: gt[f] }));
      out.photos = await page.evaluate(async (imgs, o) => {
        const P = window.LQPlate, res = [];
        if (o.model) { try { await P.loadPlateDet(); } catch { /* classical only */ } }
        for (const im of imgs) {
          const el = new Image(); el.src = im.url; await el.decode();
          const c = document.createElement("canvas"); c.width = el.naturalWidth; c.height = el.naturalHeight; c.getContext("2d").drawImage(el, 0, 0);
          const t1 = performance.now();
          const boxes = o.baseline ? (g => P.findCandidates(g.gray, g.W, g.H))(P.grayOf(c, 320)) : await P.detect(c, { model: o.model });
          const ms = Math.round(performance.now() - t1);
          const truths = im.gt.map(([x0, y0, x1, y1]) => ({ x: x0 / c.width, y: y0 / c.height, w: (x1 - x0) / c.width, h: (y1 - y0) / c.height }));
          res.push({ f: im.f, size: [c.width, c.height], ms, top: boxes.slice(0, 3).map(b => ({ src: b.src || "", score: b.score, iou: Math.max(...truths.map(t => +P.iou(b, t).toFixed(2))) })),
            plates: truths.map(t => ({ top1: !!boxes[0] && P.iou(boxes[0], t) >= 0.5, top3: boxes.slice(0, 3).some(b => P.iou(b, t) >= 0.5),
              best: boxes.length ? +Math.max(...boxes.map(b => P.iou(b, t))).toFixed(2) : 0 })) });
        }
        return res;
      }, imgs, opts);
    }
    if (a.json) console.log(JSON.stringify(out, null, 1));
    else {
      const how = a.baseline ? "BASELINE (round-14 finder)" : !a.model ? "classical only"
        : demo.model ? `classical + LPD-YuNet (${a.model === true ? "every frame" : "auto"})` : "classical (LPD-YuNet failed to load)";
      console.log(`LENSIQ Gate plate detector — demo set seed ${out.set.seed}, ${out.set.perCat} per category, ${how}, ${out.ms} ms`);
      console.log(formatSummary(out.summary));
      if (out.photos) {
        const P = out.photos.flatMap(p => p.plates), t1 = P.filter(x => x.top1).length, t3 = P.filter(x => x.top3).length;
        console.log(`\nREAL PHOTOS — ${out.photos.length} images, ${P.length} plates: top-1 ${t1}/${P.length}, top-3 ${t3}/${P.length}`);
        console.log(table(["photo", "size", "plates top-1/top-3 (best IoU)", "top boxes (src score IoU)", "ms"], out.photos.map(p => [p.f, p.size.join("x"),
          p.plates.map(x => `${x.top1 ? "Y" : "n"}/${x.top3 ? "Y" : "n"} (${x.best})`).join(" "), p.top.map(b => `${b.src} ${b.score} ${b.iou}`).join(" | ") || "—", p.ms])));
      }
    }
    return 0;
  } catch (e) { console.error("plate-det-eval:", e && e.stack || e); return 2; }
  finally { try { if (browser) await browser.close(); } catch { /* already gone */ } await srv.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
