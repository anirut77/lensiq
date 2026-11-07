#!/usr/bin/env node
// tests/bench/photobooth.bench.mjs — the photo booth ID photo (photobooth.html, "รูปติดบัตร") with a drawn outfit, on the same
// public-domain portraits as the studio benchmark (tests/bench/studio-portraits.json, persons split dev/test).
//
//   python3 -I tests/bench/fetch_datasets.py /path/to/data portraits
//   LQ_BENCH_DATA=/path/to/data node tests/bench/photobooth.bench.mjs [--render] [--sheets] [--split dev|test|all] [--ids d01,d02]
//                                                                    [--labels labels.json] [--dir cacheDir] [--json out.json]
//
// Stage 1 (--render, headless Chrome without WebGL, the page as deployed): every portrait goes through the same processing as a
//   camera capture (window.__pb.idFromImage: face landmarks, MODNet cut-out, quality check), then the ID photo is rendered with no
//   outfit and with the two outfits the civil-service presets choose ("สอบ/สมัครราชการ" = civil, "ราชการ (ชุดกากี)" = khaki).
//   Per render we store the outfit check (studio-qa.js boothCheck: straight hair cut, gap at the neck, original clothes showing)
//   and what the page shows by default. Round 10 ships the no-outfit photo first for every outfit (all 124 outfit renders were
//   defective), the outfit only as a marked draft on request; the check result is listed on the draft.
//   --sheets writes one blind review sheet per portrait (cells in a random order under neutral codes, no check output); sheets are
//   photos of people and stay in the cache directory outside the repo.
// Stage 2: joins the cached results with labels ({ id: { none, civil, khaki } }, 1 = visible defect) and reports, per split, the
//   defect rate of the outfit render, of what the page shows with the check on, and the check's recall / precision.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { CACHE, REPO, needData, serve, dataUrl, pct, table } from "./lib.mjs";
import { launch } from "../e2e/cdp.mjs";
import { createRequire } from "node:module";
const QA = createRequire(import.meta.url)(join(REPO, "studio-qa.js"));

const args = process.argv.slice(2), has = n => args.includes(n), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const root = needData("portraits", "photo booth ID (public-domain portraits) benchmark");
const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));
const split = opt("--split", "all"), ids = opt("--ids") ? new Set(opt("--ids").split(",")) : null;
const items = index.filter(it => (split === "all" || it.split === split) && (!ids || ids.has(it.id)));
export const OUTFITS = ["civil", "khaki"];
const hash = createHash("sha1"); for (const f of ["photobooth.js", "photobooth-outfits.js", "photobooth-hq.js", "photobooth-layout.js", "studio-qa.js"]) hash.update(readFileSync(join(REPO, f)));
const DIR = opt("--dir") || join(CACHE, "photobooth-" + hash.digest("hex").slice(0, 10)); mkdirSync(DIR, { recursive: true });

if (has("--render")) {
  const s = await serve(), browser = await launch();
  const page = await browser.newPage(`${s.base}/photobooth.html?cpu`, { timeout: 60000 });
  await page.waitFor(`typeof window.__pb === "object" && /ตรวจจับใบหน้าพร้อม/.test(document.getElementById("engine").textContent) && /MODNet/.test(document.getElementById("engine").textContent) && !/กำลังโหลด/.test(document.getElementById("engine").textContent)`, 180000);
  await page.evaluate(() => document.querySelector('.tab[data-t="id"]').click());
  await page.evaluate(() => new Promise(r => setTimeout(r, 1500)));
  for (const it of items) {
    const out = join(DIR, it.id + ".json");
    if (existsSync(out) && !has("--force")) continue;
    const t0 = Date.now();
    await page.evaluate(async url => {
      const im = new Image(); im.src = url; await im.decode();
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; c.getContext("2d").drawImage(im, 0, 0);
      await window.__pb.idFromImage(c);
    }, dataUrl(join("portraits", it.f)));
    const R = { id: it.id, split: it.split, wall: Date.now() - t0, g: {} };
    R.face = await page.evaluate(() => !!(window.__pb.idState.cap && window.__pb.idState.cap.face && window.__pb.idState.cap.face.P));
    const cells = [];
    for (const g of ["none", ...OUTFITS]) {
      const r = await page.evaluate(g => {
        const c = window.__pb.renderIdPhoto({ outfit: g }), shown = window.__pb.selectOutfit(g);
        window.__pbq = window.__pbq || {}; window.__pbq[g] = c.toDataURL("image/png");
        return { qa: c.qa || null, shown };
      }, g);
      R.g[g] = r; cells.push(g);
    }
    // round 11: what the mandatory "review before print" step finds on the no-outfit photo (StudioQA.idLeftovers + idSpecCheck), and the cut-out clean-up
    R.review = await page.evaluate(() => { window.__pb.selectOutfit("none"); const r = window.__pb.idReview(window.__pb.renderIdPhoto({ outfit: "none" })), cap = window.__pb.idState.cap;
      return r ? { findings: r.findings.map(f => f.k), spec: r.spec ? r.spec.items.filter(i => !i.ok).map(i => i.k) : null, cleaned: cap.cleaned ? { removed: cap.cleaned.removed, mainFrac: cap.cleaned.mainFrac, failed: !!cap.cleaned.failed } : null } : null; });
    if (has("--sheets")) {
      const key = await page.evaluate(async name => {
        const order = ["none", "civil", "khaki"], codes = ["A", "B", "C"]; let sd = [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 11) >>> 0;
        const rnd = () => (sd = (sd * 1103515245 + 12345) >>> 0) / 4294967296; for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        const ims = await Promise.all(order.map(async g => { const im = new Image(); im.src = window.__pbq[g]; await im.decode(); return im; }));
        const k = 2, w = ims[0].width * k, h = ims[0].height * k, s = document.createElement("canvas"); s.width = 3 * (w + 10); s.height = h + 26; const x = s.getContext("2d");
        x.fillStyle = "#fff"; x.fillRect(0, 0, s.width, s.height); x.imageSmoothingQuality = "high";
        ims.forEach((im, i) => { x.fillStyle = "#000"; x.font = "bold 16px sans-serif"; x.fillText(name + "  " + codes[i], i * (w + 10) + 4, 18); x.drawImage(im, i * (w + 10), 24, w, h); });
        window.__pbq.sheet = s.toDataURL("image/jpeg", .88);
        return Object.fromEntries(codes.map((c, i) => [c, order[i]]));
      }, it.id);
      const url = await page.evaluate(() => window.__pbq.sheet);
      writeFileSync(join(DIR, "sheet_" + it.id + ".jpg"), Buffer.from(url.split(",")[1], "base64"));
      writeFileSync(join(DIR, "sheetkey_" + it.id + ".json"), JSON.stringify(key));
    }
    writeFileSync(out, JSON.stringify(R));
    console.log(it.id, it.split, `${R.wall} ms`, R.face ? "" : "(no landmarks)", Object.entries(R.g).map(([k, v]) => `${k}:${v.shown}${v.qa && v.qa.fails.length ? "(" + v.qa.fails.join("+") + ")" : ""}`).join(" "));
  }
  await browser.close(); s.close();
}

const wilson = (k, n) => { if (!n) return [NaN, NaN]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [Math.max(0, c - h), Math.min(1, c + h)]; };
const ci = (k, n) => n ? `${pct(k / n)} [${pct(wilson(k, n)[0])}–${pct(wilson(k, n)[1])}] (${k}/${n})` : "—";
const lfile = opt("--labels");
const labels = lfile && existsSync(lfile) ? JSON.parse(readFileSync(lfile, "utf8")).labels : {};
const res = items.map(it => existsSync(join(DIR, it.id + ".json")) ? JSON.parse(readFileSync(join(DIR, it.id + ".json"), "utf8")) : null).filter(Boolean);
if (!res.length) { console.log(`no cached renders in ${DIR} — run with --render`); process.exit(0); }
const report = {};
console.log("renders: " + DIR);
for (const sp of [...new Set(res.map(r => r.split))].sort()) {
  const R = res.filter(r => r.split === sp);
  let n = 0, fb = 0, rawBad = 0, shownBad = 0, safeShown = 0, tp = 0, fp = 0, fn = 0, tn = 0, safeBad = 0, safeN = 0;
  for (const r of R) {
    const L = labels[r.id] || {}; if (L.none != null) { safeN++; safeBad += L.none; }
    for (const g of OUTFITS) {
      const v = r.g[g], y = L[g]; if (!v || y == null || L.none == null) continue;
      // the page's decision, recomputed from the stored measurements with the current limits (studio-qa.js BOOTH_LIMITS)
      n++; const withheld = !v.qa || !v.qa.m || v.qa.fails.includes("no-matte") || QA.boothVerdict(v.qa.m).length > 0; if (withheld) fb++;
      rawBad += y; shownBad += withheld ? L.none : y; safeShown += L.none;
      if (withheld && y) tp++; else if (withheld) fp++; else if (y) fn++; else tn++;
    }
  }
  report[sp] = { persons: R.length, renders: n, fallback: fb, rawBad, shownBad, tp, fp, fn, tn, safeBad, safeN };
  console.log(`\n== ${sp}: ${R.length} people × ${OUTFITS.length} outfits (${n} labelled renders)`);
  console.log(table(["metric", "value [Wilson 95 % per render — too narrow, see the person-cluster block]"], [
    ["outfit render with a visible defect (no check)", ci(rawBad, n)],
    ["if the check alone decided: what is shown with a defect", ci(shownBad, n)],
    ["as shipped (no-outfit photo first, outfit only as a draft on request): shown with a defect", ci(safeShown, n)],
    ["outfit withheld → no-outfit photo", ci(fb, n)],
    ["check recall: defective outfit renders withheld", ci(tp, tp + fn)],
    ["check precision: withheld renders that were defective", ci(tp, tp + fp)],
    ["outfit renders shown that still have a defect", ci(fn, fn + tn)],
    ["no-outfit ID photo itself defective", ci(safeBad, safeN)]
  ]));
}
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ dir: DIR, outfits: OUTFITS, report }, null, 1));
// --log tests/bench/photobooth-gate-log-r10.json: per-render check results WITHOUT image data (id, outfit, what the page showed,
// boothCheck pass / fails / measurements, timings) — read by tests/bench/studio-tables.mjs (ACCURACY.md §11b)
if (opt("--log")) {
  const people = {}, renders = [];
  for (const r of [...res].sort((a, b) => a.id.localeCompare(b.id))) {
    people[r.id] = { split: r.split, face: !!r.face, wallMs: r.wall, ...(r.review ? { review: r.review } : {}) };
    for (const [g, v] of Object.entries(r.g)) renders.push({ id: r.id, g, shown: v.shown, pass: v.qa ? v.qa.pass : null, fails: v.qa ? v.qa.fails : [], m: v.qa ? v.qa.m : null });
  }
  const head = { about: "Per-render results of tests/bench/photobooth.bench.mjs (no images): one row per person x outfit. shown = what photobooth.html showed by default; pass/fails/m = studio-qa.js boothCheck at render time.", code: opt("--code", "see git log for this file"), outfits: OUTFITS };
  writeFileSync(opt("--log"), JSON.stringify(head, null, 1).replace(/\n}$/, ",\n \"people\": {\n" + Object.entries(people).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n },\n \"renders\": [\n" + renders.map(x => "  " + JSON.stringify(x)).join(",\n") + "\n ]\n}\n"));
}

// round 11 (stats): person-cluster 95 % intervals are the default report. The per-render Wilson tables above treat the renders of
// one person as independent (they are not: design effect 2–4) and are kept only for comparison. The block below recomputes every
// §11 / §11b rate from the committed labels + per-render logs (tests/bench/studio-intervals.mjs); --no-cluster skips it.
if (!has("--no-cluster")) {
  const SI = await import("./studio-intervals.mjs");
  console.log("\n== person-cluster 95 % intervals (default; from the committed labels and per-render logs) + plain vs cover paired tests\n" + SI.markdown(SI.intervals(), SI.paired()));
}
