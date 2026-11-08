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
const VARIANTS = opt("--variants") ? opt("--variants").split(",") : null;

const hash = createHash("sha1"); for (const f of ["studio.js", "studio-core.js", "studio-qa.js", "photobooth-outfits.js", "photobooth-hq.js"]) hash.update(readFileSync(join(REPO, f))); hash.update(QUERY); if (has("--only")) hash.update("only:" + opt("--only"));
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
    // round 11: photo-suitability pre-flight (studio-qa.js photoSuitability) and the no-outfit clean-up counters (studio-core.js cleanLeftovers)
    Object.assign(R, await page.evaluate(() => { const S = window.__studio.state; return { pre: S.pre ? { ok: S.pre.ok, m: S.pre.m, fails: S.pre.items.filter(i => i.ok === false).map(i => i.k) } : null }; }));
    // --variants plain,cover: each garment rendered with the high-collar cover off and on (results g and g+cover); default = the page's own policy
    // --only none: the no-outfit render only (round 11: no-outfit clean-up + pre-flight measurements; outfit renders are unchanged)
    const runs = has("--only") && opt("--only") === "none" ? ["none"] : ["none", ...GARMENTS.flatMap(g => VARIANTS ? VARIANTS.map(v => v === "plain" ? g : g + "+" + v) : [g])];
    for (const gv of runs) {
      const [g, v] = gv.split("+"), key = g === "none" ? "none" : "v:" + g, t1 = Date.now();
      if (VARIANTS) await page.evaluate(m => { window.__studio.state.coverMode = m; }, v === "cover" ? "on" : "off");
      await page.evaluate(k => window.__studio.select(k), key);
      R.g[gv] = await page.evaluate(g => {
        const S = window.__studio.state, W = S.W, H = S.H, f = S.face;
        // the garment render (on screen when it passed, kept as S.draft when it was withheld)
        const rgba = S.draft ? S.draft.rgba : S.out, c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d").putImageData(new ImageData(rgba, W, H), 0, 0);
        const h = 360, cell = document.createElement("canvas"); cell.width = Math.round(W * h / H); cell.height = h; cell.getContext("2d").drawImage(c, 0, 0, cell.width, h);
        const nx = Math.max(0, Math.round(f.cx - f.fw * 1.15)), ny = Math.max(0, Math.round(f.eyeY - f.fw * .2)), nw = Math.min(W - nx, Math.round(f.fw * 2.3)), nh = Math.min(H - ny, Math.round(f.fw * 1.9));
        const nc = document.createElement("canvas"); nc.width = 300; nc.height = Math.round(300 * nh / nw); nc.getContext("2d").drawImage(c, nx, ny, nw, nh, 0, 0, nc.width, nc.height);
        window.__bq.cells.push([g + (S.variant ? "+" + S.variant : ""), cell, nc]);
        const q = S.qa;
        // jaw/ear crop at the standard scale (studio-qa.js jawCrop) of the garment render itself — the learned gate's input
        let crop = null, jf = null;
        if (g !== "none" && window.StudioQA.jawCrop) {
          const d = S.draft || { rgba: S.out, fgAlpha: S.fgAlpha }, C = window.StudioQA.jawCropOf({ ...S, out: d.rgba, fgAlpha: d.fgAlpha });
          jf = window.StudioQA.jawFeatures(C);
          const names = Object.keys(C.ch), all = new Uint8Array(C.w * C.h * names.length); names.forEach((k, i) => all.set(C.ch[k], i * C.w * C.h));
          let bin = ""; for (let i = 0; i < all.length; i += 8192) bin += String.fromCharCode.apply(null, all.subarray(i, i + 8192));
          crop = { w: C.w, h: C.h, names, jaw: C.jaw, chin: C.chin, eyeY: C.eyeY, b64: btoa(bin) };
        }
        // round 12: + nq = no-outfit check (StudioQA.noOutfitCheck) and whether the page fell back to the untouched original photo
        return { clean: g === "none" && S.cleanInfo ? { ...S.cleanInfo, fail: !!S.matteFail } : undefined, nq: S.noq && (g === "none" || S.shown === "safe" || S.shown === "plain") ? { pass: S.noq.pass, fails: S.noq.fails, m: S.noq.m, orig: !!S.origFallback } : undefined, shown: S.shown, pass: q ? q.pass : null, fails: q ? q.fails : [], m: q ? q.m : null, jf, conf: S.conf != null ? S.conf : null, variant: S.variant || null, crop, qaMs: Math.round(S.timings.qa || 0), renderMs: Math.round(S.timings.render || 0) };
      }, g);
      if (R.g[gv].crop) { const c = R.g[gv].crop; writeFileSync(join(DIR, `${it.id}_${gv}.crop.bin`), Buffer.from(c.b64, "base64")); delete c.b64; }
      R.g[gv].selMs = Date.now() - t1;
    }
    if (has("--sheets") && VARIANTS) {
      // blind review sheet: cells in a per-person random order under neutral codes (A, B, ...); the key stays in the cache directory
      const key = await page.evaluate(name => {
        const B = window.__bq, cells = B.cells.slice(), codes = "ABCDEFGHJKLMNP".split(""); let sd = [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
        const rnd = () => (sd = (sd * 1103515245 + 12345) >>> 0) / 4294967296; for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
        const h = 300, o = B.orig, oc = document.createElement("canvas"); oc.width = Math.round(o.width * h / o.height); oc.height = h; oc.getContext("2d").drawImage(o, 0, 0, oc.width, h);
        const all = [["original", oc, null, "original"], ...cells.map((c, i) => [codes[i], c[1], c[2], c[0]])], cols = 4, cw = 300, ch = 20 + h + 4 + 260;
        const s = document.createElement("canvas"); s.width = cols * (cw + 8); s.height = Math.ceil(all.length / cols) * (ch + 8); const x = s.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, s.width, s.height);
        all.forEach(([k, c, n], i) => { const X = (i % cols) * (cw + 8), Y = Math.floor(i / cols) * (ch + 8); x.fillStyle = "#000"; x.font = "bold 16px sans-serif"; x.fillText(name + "  " + k, X + 4, Y + 16);
          const k2 = Math.min(cw / c.width, h / c.height); x.drawImage(c, X, Y + 20, c.width * k2, c.height * k2); if (n) { const k3 = Math.min(cw / n.width, 260 / n.height); x.drawImage(n, X, Y + 24 + h, n.width * k3, n.height * k3); } });
        window.__bq.sheet = s.toDataURL("image/jpeg", .85);
        return Object.fromEntries(all.slice(1).map(a => [a[0], a[3]]));
      }, it.id);
      const url = await page.evaluate(() => window.__bq.sheet);
      writeFileSync(join(DIR, "sheet_" + it.id + ".jpg"), Buffer.from(url.split(",")[1], "base64"));
      writeFileSync(join(DIR, "sheetkey_" + it.id + ".json"), JSON.stringify(key));
    } else if (has("--sheets")) {
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
  console.log(table(["metric", "value [Wilson 95 % per render — too narrow, see the person-cluster block]"], [
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
// ---------------------------------------------------------------- stage 2b: round 10 (renders made with --variants plain,cover)
// policy of the page when the user picks an outfit: high-collar cover when the jaw strip is open (plain render's jawFeatures.open
// ≥ 0.5, studio.js COVER_OPEN), then the rule gate (studio-qa.js verdict); plus the learned-gate experiment (logistic regression on
// GATE_FEATS, trained on dev, person-grouped 5-fold CV on dev, then scored once on test). Labels: --labels tests/bench/studio-labels-r10.json
const hasCover = res.some(r => r.g[GARMENTS[0] + "+cover"]);
if (hasCover) {
  const rows = [];
  for (const r of res) { const L = labels[r.id] || {}; for (const g of GARMENTS) for (const v of ["", "+cover"]) { const x = r.g[g + v]; if (x && x.m && x.jf && L[g + v] != null) rows.push({ id: r.id, sp: r.split, g, cover: !!v, y: L[g + v], none: L.none, m: x.m, jf: x.jf, pass: !QA.verdict(x.m).length }); } }
  const X = r => QA.GATE_FEATS ? Object.keys(QA.GATE_FEATS).map(k => QA.GATE_FEATS[k](r.m, r.jf, r.cover)) : [];
  const fitLR = R => { const F = R.map(X), d = F[0].length, mu = Array(d).fill(0).map((_, j) => F.reduce((t, f) => t + f[j], 0) / F.length), sd = mu.map((m, j) => Math.sqrt(F.reduce((t, f) => t + (f[j] - m) ** 2, 0) / F.length) || 1), Z = F.map(f => f.map((v, j) => (v - mu[j]) / sd[j]));
    const w = Array(d).fill(0); let b = 0; for (let it = 0; it < 3000; it++) { const gw = Array(d).fill(0); let gb = 0; Z.forEach((z, i) => { const e = 1 / (1 + Math.exp(-(b + z.reduce((t, v, j) => t + v * w[j], 0)))) - R[i].y; gb += e; z.forEach((v, j) => { gw[j] += e * v; }); }); for (let j = 0; j < d; j++) w[j] -= .1 * (gw[j] + w[j]) / Z.length; b -= .1 * gb / Z.length; }
    return r => 1 / (1 + Math.exp(-(b + X(r).reduce((t, v, j) => t + (v - mu[j]) / sd[j] * w[j], 0)))); };
  const aucOf = (R, p) => { const pos = R.filter(r => r.y).map(p), neg = R.filter(r => !r.y).map(p); let a = 0; for (const u of pos) for (const v of neg) a += u > v ? 1 : u === v ? .5 : 0; return a / pos.length / neg.length; };
  const dev = rows.filter(r => r.sp === "dev"), ids = [...new Set(dev.map(r => r.id))].sort(), cvP = new Map();
  for (let k = 0; k < 5; k++) { const te = new Set(ids.filter((_, i) => i % 5 === k)), f = fitLR(dev.filter(r => !te.has(r.id))); for (const r of dev.filter(r => te.has(r.id))) cvP.set(r, f(r)); }
  const full = dev.length ? fitLR(dev) : null;
  for (const sp of [...new Set(rows.map(r => r.sp))].sort()) {
    const R = rows.filter(r => r.sp === sp), by = {}; for (const r of R) (by[r.id + "|" + r.g] = by[r.id + "|" + r.g] || {})[r.cover ? "c" : "p"] = r;
    let n = 0, pRaw = 0, cRaw = 0, fixed = 0, broke = 0, oldShow = 0, newShow = 0, shownN = 0, shownBad = 0, oShownN = 0, oShownBad = 0;
    for (const k in by) { const { p, c } = by[k]; if (!p || !c) continue; n++; pRaw += p.y; cRaw += c.y; if (p.y && !c.y) fixed++; if (!p.y && c.y) broke++;
      oldShow += p.pass ? p.y : p.none; if (p.pass) { oShownN++; oShownBad += p.y; }
      const v = p.jf.open >= .5 ? c : p; newShow += v.pass ? v.y : p.none; if (v.pass) { shownN++; shownBad += v.y; } }
    console.log(`\n== round 10, ${sp}: ${n} person × garment pairs (plain and high-collar renders)`);
    console.log(table(["metric", "value [Wilson 95 % per render — too narrow, see the person-cluster block]"], [
      ["outfit render with a visible defect, as before (plain)", ci(pRaw, n)],
      ["same with the high-collar cover", ci(cRaw, n)],
      ["defect fixed / introduced by the cover", `${fixed} / ${broke}`],
      ["round 9 page (plain + gate): what is shown is defective", ci(oldShow, n)],
      ["round 9: outfit renders shown that are defective", ci(oShownBad, oShownN)],
      ["round 10 page (auto cover + gate), outfit picked: what is shown is defective", ci(newShow, n)],
      ["round 10: outfit renders shown that are defective", ci(shownBad, shownN)],
      ["learned gate (LR) AUC — dev: 5-fold CV by person; test: model trained on all dev", sp === "dev" ? (cvP.size ? aucOf(R.filter(r => cvP.has(r)), r => cvP.get(r)).toFixed(3) : "—") : full ? aucOf(R, full).toFixed(3) : "—"]
    ]));
  }
}
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify({ dir: DIR, garments: GARMENTS, report }, null, 1));
// --log tests/bench/studio-gate-log-r10.json: the per-render gate results WITHOUT any image data (id, garment, variant, what the
// page showed, gate pass, fail reasons, QA measurements m, jaw-strip features jf, calibrated confidence, timings) — committed next to
// the label files so that tests/bench/studio-tables.mjs can recompute every ACCURACY.md §11 table without the portraits.
if (opt("--log")) writeFileSync(opt("--log"), gateLog(res, { query: QUERY, variants: VARIANTS, code: opt("--code", "") }));
export function gateLog(results, { query = "", variants = null, code = "" } = {}) {
  const people = {}, renders = [];
  for (const r of [...results].sort((a, b) => a.id.localeCompare(b.id))) {
    people[r.id] = { split: r.split, face: !!r.face, W: r.W, H: r.H, firstMs: r.first, wallMs: r.wall, err: r.err || null, ...(r.pre ? { pre: r.pre } : {}) };
    for (const [gv, v] of Object.entries(r.g)) {
      const [g, variant] = gv.split("+");
      renders.push({ id: r.id, g, v: g === "none" ? null : variant || "plain", ...(v.clean ? { clean: v.clean } : {}), ...(v.nq ? { nq: v.nq } : {}), shown: v.shown, pass: v.pass, fails: v.fails || [], variant: v.variant || null, conf: v.conf, qaMs: v.qaMs, renderMs: v.renderMs, selMs: v.selMs, jf: v.jf || null, m: v.m || null });
    }
  }
  const head = { about: "Per-render gate results of tests/bench/studio.bench.mjs (no images, no crops): one row per person x garment x variant. v = plain (cover off) | cover (cover on) | null (no outfit). shown = what studio.html put on screen; pass/fails = studio-qa.js verdict at render time; m = QA measurements; jf = jawFeatures of the garment render; conf = calibrated confidence; *Ms = timings in ms (headless Chrome, no WebGL).", code: code || "see git log for this file", query, variants, garments: GARMENTS };
  // one person / one render per line keeps the diff readable
  return JSON.stringify(head, null, 1).replace(/\n}$/, ",\n \"people\": {\n" + Object.entries(people).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n") + "\n },\n \"renders\": [\n" + renders.map(x => "  " + JSON.stringify(x)).join(",\n") + "\n ]\n}\n");
}
// round 11 (stats): person-cluster 95 % intervals are the default report. The per-render Wilson tables above treat the renders of
// one person as independent (they are not: design effect 2–4) and are kept only for comparison. The block below recomputes every
// §11 / §11b rate from the committed labels + per-render logs (tests/bench/studio-intervals.mjs); --no-cluster skips it.
if (!has("--no-cluster")) {
  const SI = await import("./studio-intervals.mjs");
  console.log("\n== person-cluster 95 % intervals (default; from the committed labels and per-render logs) + plain vs cover paired tests\n" + SI.markdown(SI.intervals(), SI.paired()));
}
export { QA };
