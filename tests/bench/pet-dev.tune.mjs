#!/usr/bin/env node
// tests/bench/pet-dev.tune.mjs — TUNING ONLY on the fortune-pet DEV split (~/LENSIQ-field/evals/fortune-pet/dev, Oxford-IIIT
// Pet trainval images disjoint from the locked manifest.json). Never run on the locked set: thresholds are chosen here, then
// measured once with tests/bench/pet.bench.mjs on the locked set. Prints found / species / head-covered per score threshold
// for the raw YOLOX cat / dog boxes (person boxes separately).
import { join } from "node:path";
import { readFileSync, statSync, createReadStream } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { openBench, pct, table } from "./lib.mjs";

const DIR = join(homedir(), "LENSIQ-field", "evals", "fortune-pet", "dev");
const M = JSON.parse(readFileSync(join(DIR, "dev.json"), "utf8"));
const img = await new Promise(res => {
  const root = join(DIR, "images");
  const srv = createServer((q, r) => {
    const name = decodeURIComponent(new URL(q.url, "http://x").pathname.slice(1));
    if (!/^[A-Za-z0-9_-]+\.jpg$/.test(name)) { r.writeHead(404); return r.end(); }
    let st; try { st = statSync(join(root, name)); } catch { r.writeHead(404); return r.end(); }
    r.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": st.size, "Access-Control-Allow-Origin": "*" });
    createReadStream(join(root, name)).pipe(r);
  });
  srv.listen(0, "127.0.0.1", () => res({ base: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() }));
});
const b = await openBench();
const rows = [];
try {
  await b.page.evaluate(() => new Promise((ok, no) => { const s = document.createElement("script"); s.src = "/lensiq-pet.js"; s.onload = ok; s.onerror = no; document.head.appendChild(s); }));
  await b.page.waitFor("window.LQPet && LQPet.loadDetector", 10000);
  for (const it of M.items) {
    const r = await b.page.evaluate(async (u) => {
      window.__m = window.__m || await LQPet.loadDetector();
      const im = new Image(); im.crossOrigin = "anonymous"; im.src = u; await im.decode();
      const d = await LQDetect.detectYolox(window.__m, im, { classes: [15, 16], minScore: 0.03, max: 20 });
      // second look: the top box cropped (padded 15 %) and run again, cat vs dog score sums inside the crop; also mirrored
      const top = d.slice().sort((a, b) => b.score - a.score)[0]; let crop = null, flip = null;
      if (top) {
        const W = im.naturalWidth, H = im.naturalHeight, px = top.w * 0.15, py = top.h * 0.15;
        const x0 = Math.max(0, top.x - px), y0 = Math.max(0, top.y - py), x1 = Math.min(1, top.x + top.w + px), y1 = Math.min(1, top.y + top.h + py);
        const c = document.createElement("canvas"); c.width = Math.round((x1 - x0) * W); c.height = Math.round((y1 - y0) * H);
        c.getContext("2d").drawImage(im, x0 * W, y0 * H, c.width, c.height, 0, 0, c.width, c.height);
        const dc = await LQDetect.detectYolox(window.__m, c, { classes: [15, 16], minScore: 0.03, max: 20 });
        crop = { cat: dc.filter(x => x.cls === 15).reduce((a, x) => a + x.score, 0), dog: dc.filter(x => x.cls === 16).reduce((a, x) => a + x.score, 0) };
        const f = document.createElement("canvas"); f.width = c.width; f.height = c.height; const fx = f.getContext("2d"); fx.translate(f.width, 0); fx.scale(-1, 1); fx.drawImage(c, 0, 0);
        const df = await LQDetect.detectYolox(window.__m, f, { classes: [15, 16], minScore: 0.03, max: 20 });
        flip = { cat: df.filter(x => x.cls === 15).reduce((a, x) => a + x.score, 0), dog: df.filter(x => x.cls === 16).reduce((a, x) => a + x.score, 0) };
      }
      return { d: d.map(x => ({ x: x.x, y: x.y, w: x.w, h: x.h, s: x.score, c: x.cls })), W: im.naturalWidth, H: im.naturalHeight, crop, flip };
    }, `${img.base}/${it.name}.jpg`);
    rows.push({ it, ...r });
  }
} finally { await b.done(); img.close(); }
const cover = (it, p, W, H) => { const [x0, y0, x1, y1] = it.head; const iw = Math.max(0, Math.min(x1, (p.x + p.w) * W) - Math.max(x0, p.x * W)), ih = Math.max(0,
  Math.min(y1, (p.y + p.h) * H) - Math.max(y0, p.y * H)); return iw * ih / ((x1 - x0) * (y1 - y0)); };
const out = [];
for (const t of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
  let found = 0, sp = 0, head = 0;
  for (const r of rows) {
    const c = r.d.filter(x => x.s >= t).sort((a, b2) => b2.s - a.s)[0];
    if (!c) continue; found++;
    if ((c.c === 15 ? "cat" : "dog") === r.it.species) sp++;
    if (cover(r.it, c, r.W, r.H) >= 0.8) head++;
  }
  out.push([t, pct(found / rows.length), pct(sp / rows.length), pct(head / Math.max(1, found))]);
}
const iou = (a, b2) => { const x = Math.max(a.x, b2.x), y = Math.max(a.y, b2.y), x2 = Math.min(a.x + a.w, b2.x + b2.w), y2 = Math.min(a.y + a.h, b2.y + b2.h);
  const i = Math.max(0, x2 - x) * Math.max(0, y2 - y); return i / (a.w * a.h + b2.w * b2.h - i); };
const rules = {
  top: r => { const c = r.d.slice().sort((a, b2) => b2.s - a.s)[0]; return c ? (c.c === 15 ? "cat" : "dog") : null; },
  sumOverlap: r => { const c = r.d.slice().sort((a, b2) => b2.s - a.s)[0]; if (!c) return null; let cs = 0, ds = 0; for (const x of r.d) if (iou(x, c) > 0.3) {
    if (x.c === 15) cs += x.s; else ds += x.s; } return cs >= ds ? "cat" : "dog"; },
  crop: r => r.crop ? (r.crop.cat + 1e-9 >= r.crop.dog ? "cat" : "dog") : null,
  frameCrop: r => { const c = r.d.slice().sort((a, b2) => b2.s - a.s)[0]; if (!c) return null; let cs = 0, ds = 0; for (const x of r.d) if (iou(x, c) > 0.3) {
    if (x.c === 15) cs += x.s; else ds += x.s; } cs += r.crop.cat; ds += r.crop.dog; return cs >= ds ? "cat" : "dog"; },
  frameCropFlip: r => { const c = r.d.slice().sort((a, b2) => b2.s - a.s)[0]; if (!c) return null; let cs = 0, ds = 0; for (const x of r.d) if (iou(x, c) > 0.3) {
    if (x.c === 15) cs += x.s; else ds += x.s; } cs += r.crop.cat + r.flip.cat; ds += r.crop.dog + r.flip.dog; return cs >= ds ? "cat" : "dog"; },
};
const found = rows.filter(r => r.d.some(x => x.s >= 0.1));
console.log(table(["species rule (found at 0.1)", "species correct / all"], Object.entries(rules).map(([k, f]) => [k, pct(found.filter(r => f(r) === r.it.species).length / rows.length)])));
console.log(`DEV n=${rows.length} (tuning only)`);
console.log(table(["min score", "found", "species correct", "head covered"], out));
