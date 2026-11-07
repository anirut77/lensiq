#!/usr/bin/env node
// tests/bench/studio.bench.mjs — what the studio (studio.html) actually SHOWS, on public-domain portraits.
//
//   python3 -I tests/bench/fetch_datasets.py /path/to/data portraits
//   LQ_BENCH_DATA=/path/to/data node tests/bench/studio.bench.mjs [--render] [--split dev|test|all] [--ids d01,d02] [--sheets] [--query close=0]
//                                                                [--labels tests/bench/studio-labels.json] [--json out.json]
//
// Stage 1 (--render, headless Chrome WITHOUT WebGL = ONNX Runtime / TF.js on WASM, as on an M1 without a GPU): the real
//   page studio.html?cpu. For every portrait: __studio.load(photo), then each garment in GARMENTS is selected exactly as
//   a click would. Per render we store the quality-gate result (studio-qa.js, the same call studio.js makes), what the
//   page put on screen (ST.shown: "garment" | "safe"), every QA measurement, and timings. "none" (background + retouch
//   only, the safe composition) is rendered too. Cached in $LQ_BENCH_CACHE/studio-<code hash>/<id>.json.
//   --sheets also writes one review sheet per portrait (original, safe render, each garment render; full view + neck
//   crop). Sheets carry NO QA output, so they can be labelled blind. They are photos of people: they stay in the cache
//   directory outside the repo and are never committed.
// Stage 2 (Node): joins the cached results with the labels file (one verdict per render: 1 = visible defect, 0 = clean;
//   see the criteria in the labels file) and reports, per split:
//   - visible-defect rate of what the page SHOWS (gate on) vs. what it would show without the gate (always the garment),
//   - fallback rate (garment withheld), QA agreement with the labels (precision / recall of "QA fail" for "defect"),
//   all with Wilson 95 % intervals. Persons, not renders, define the split: no test person was used for tuning.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { CACHE, REPO, needData, serve, dataUrl, pct, table } from "./lib.mjs";
import { launch } from "../e2e/cdp.mjs";

const require = createRequire(import.meta.url);
const QA = require(join(REPO, "studio-qa.js"));
const args = process.argv.slice(2), has = n => args.includes(n), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const root = needData("portraits", "studio (public-domain portraits) benchmark");
const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));
const split = opt("--split", "all");
const ids = opt("--ids") ? new Set(opt("--ids").split(",")) : null;
const items = index.filter(it => (split === "all" || it.split === split) && (!ids || ids.has(it.id)));
// --query "close=0": extra studio.html query (an ablation); it is part of the cache key
const QUERY = opt("--query", "");
export const GARMENTS = ["civil", "khaki", "suit_navy", "lady"];

const hash = createHash("sha1"); for (const f of ["studio.js", "studio-core.js", "studio-qa.js", "photobooth-outfits.js", "photobooth-hq.js"]) hash.update(readFileSync(join(REPO, f))); hash.update(QUERY);
// --dir reuses a cache made by another code version (stage 2 only; the report prints which directory it read)
const DIR = opt("--dir") || join(CACHE, "studio-" + hash.digest("hex").slice(0, 10)); mkdirSync(DIR, { recursive: true });

// ---------------------------------------------------------------- stage 1
if (has("--render")) {
  const s = await serve(), browser = await launch();
  const page = await browser.newPage(`${s.base}/studio.html?cpu${QUERY ? "&" + QUERY : ""}`, { timeout: 60000 });
  await page.waitFor(`/Multiclass/.test(document.getElementById("stEngine").textContent) && /MODNet/.test(document.getElementById("stEngine").textContent) && !/กำลังโหลด/.test(document.getElementById("stEngine").textContent)`, 120000);
  await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
  for (const it of items) {
    const out = join(DIR, it.id + ".json");
    if (existsSync(out) && !has("--force")) continue;
    const t0 = Date.now();
    await page.evaluate(async url => {
      const im = new Image(); im.src = url; await im.decode();
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; c.getContext("2d").drawImage(im, 0, 0);
      window.__bq = { orig: c, cells: [] }; window.__studio.state.phase = "x"; window.__studio.load(c);
    }, dataUrl(join("portraits", it.f)));
    const st = await page.waitFor(`(window.__studio.state.phase === "done" || window.__studio.state.phase === "error") && { ph: window.__studio.state.phase, err: window.__studio.state.err, t: window.__studio.state.timings, face: !!(window.__studio.state.face && window.__studio.state.face.detected), W: window.__studio.state.W, H: window.__studio.state.H }`, 600000);
    const R = { id: it.id, split: it.split, wall: Date.now() - t0, first: Math.round(st.t.firstResult || 0), face: st.face, err: st.err, W: st.W, H: st.H, g: {} };
    for (const g of ["none", ...GARMENTS]) {
      const key = g === "none" ? "none" : "v:" + g, t1 = Date.now();
      await page.evaluate(k => window.__studio.select(k), key);
      R.g[g] = await page.evaluate(g => {
        const S = window.__studio.state, W = S.W, H = S.H, f = S.face;
        // the garment render (on screen when it passed, kept as S.draft when it was withheld)
        const rgba = S.draft ? S.draft.rgba : S.out, c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").putImageData(new ImageData(rgba, W, H), 0, 0);
        const h = 360, cell = document.createElement("canvas"); cell.width = Math.round(W * h / H); cell.height = h; cell.getContext("2d").drawImage(c, 0, 0, cell.width, h);
        const nx = Math.max(0, Math.round(f.cx - f.fw * 1.15)), ny = Math.max(0, Math.round(f.eyeY - f.fw * .2)), nw = Math.min(W - nx, Math.round(f.fw * 2.3)), nh = Math.min(H - ny, Math.round(f.fw * 1.9));
        const nc = document.createElement("canvas"); nc.width = 300; nc.height = Math.round(300 * nh / nw); nc.getContext("2d").drawImage(c, nx, ny, nw, nh, 0, 0, nc.width, nc.height);
        window.__bq.cells.push([g, cell, nc]);
        const q = S.qa;
        return { shown: S.shown, pass: q ? q.pass : null, fails: q ? q.fails : [], m: q ? q.m : null, qaMs: Math.round(S.timings.qa || 0), renderMs: Math.round(S.timings.render || 0) };
      }, g);
      R.g[g].selMs = Date.now() - t1;
    }
    if (has("--sheets")) {
      const url = await page.evaluate(name => {
        const B = window.__bq, h = 360, o = B.orig, oc = document.createElement("canvas"); oc.width = Math.round(o.width * h / o.height); oc.height = h; oc.getContext("2d").drawImage(o, 0, 0, oc.width, h);
        const cells = [["original", oc, null], ...B.cells], cw = Math.max(...cells.map(c => c[1].width)), nh = Math.max(...cells.map(c => c[2] ? c[2].height : 0));
        const s = document.createElement("canvas"); s.width = (Math.max(cw, 300) + 6) * cells.length; s.height = 20 + h + 6 + nh; const x = s.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, s.width, s.height);
        cells.forEach(([k, c, n], i) => { const X = i * (Math.max(cw, 300) + 6); x.fillStyle = "#000"; x.font = "14px sans-serif"; x.fillText(name + " " + k, X + 4, 15); x.drawImage(c, X, 20); if (n) x.drawImage(n, X, 20 + h + 6); });
        return s.toDataURL("image/jpeg", .88);
      }, it.id);
      writeFileSync(join(DIR, "sheet_" + it.id + ".jpg"), Buffer.from(url.split(",")[1], "base64"));
    }
    writeFileSync(out, JSON.stringify(R));
    console.log(it.id, it.split, "first", R.first, "ms", Object.entries(R.g).map(([k, v]) => `${k}:${v.shown}${v.fails.length ? "(" + v.fails.join("+") + ")" : ""} qa ${v.qaMs}`).join(" "));
  }
  await browser.close(); s.close();
}

// ---------------------------------------------------------------- stage 2
const wilson = (k, n) => { if (!n) return [NaN, NaN]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [Math.max(0, c - h), Math.min(1, c + h)]; };
const ci = (k, n) => n ? `${pct(k / n)} [${pct(wilson(k, n)[0])}–${pct(wilson(k, n)[1])}] (${k}/${n})` : "—";
const lfile = opt("--labels", join(REPO, "tests/bench/studio-labels.json"));
const labels = existsSync(lfile) ? JSON.parse(readFileSync(lfile, "utf8")).labels : {};
const res = items.map(it => existsSync(join(DIR, it.id + ".json")) ? JSON.parse(readFileSync(join(DIR, it.id + ".json"), "utf8")) : null).filter(Boolean);
if (!res.length) { console.log(`no cached renders in ${DIR} — run with --render`); process.exit(0); }
const report = {};
console.log("renders: " + DIR);
for (const sp of [...new Set(res.map(r => r.split))].sort()) {
  const R = res.filter(r => r.split === sp);
  let n = 0, fb = 0, shownBad = 0, rawBad = 0, tp = 0, fp = 0, fn = 0, tn = 0, unl = 0, safeBad = 0, safeN = 0;
  const qaMs = [], first = [];
  for (const r of R) {
    first.push(r.first);
    const L = labels[r.id] || {}, ln = L.none;
    if (ln != null) { safeN++; safeBad += ln; }
    for (const g of GARMENTS) {
      const v = r.g[g]; if (!v) continue;
      qaMs.push(v.qaMs);
      const lg = L[g]; if (lg == null || ln == null) { unl++; continue; }
      n++;
      const withheld = v.shown === "safe"; if (withheld) fb++;
      rawBad += lg; shownBad += withheld ? ln : lg;
      if (withheld && lg) tp++; else if (withheld) fp++; else if (lg) fn++; else tn++;
    }
  }
  const med = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };
  report[sp] = { persons: R.length, renders: n, unlabelled: unl, fallback: fb, shownBad, rawBad, tp, fp, fn, tn, safeBad, safeN, qaMedianMs: med(qaMs), firstMedianMs: med(first) };
  console.log(`\n== ${sp}: ${R.length} people × ${GARMENTS.length} garments (${n} labelled renders${unl ? `, ${unl} unlabelled` : ""})`);
  console.log(table(["metric", "value [Wilson 95 %]"], [
    ["visible defect in what is SHOWN (gate on)", ci(shownBad, n)],
    ["visible defect without the gate (garment always shown)", ci(rawBad, n)],
    ["garment withheld → safe composition (fallback rate)", ci(fb, n)],
    ["garment shown (coverage)", ci(n - fb, n)],
    ["QA recall: defective garment renders caught", ci(tp, tp + fn)],
    ["QA precision: withheld renders that were defective", ci(tp, tp + fp)],
    ["QA false alarm: clean renders withheld", ci(fp, fp + tn)],
    ["QA agreement with labels", ci(tp + tn, n)],
    ["safe composition (no garment) itself defective", ci(safeBad, safeN)],
    ["median QA time per render (ms)", String(report[sp].qaMedianMs)],
    ["median first result after load (ms)", String(report[sp].firstMedianMs)]
  ]));
}
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ dir: DIR, garments: GARMENTS, report }, null, 1));
export { QA };
