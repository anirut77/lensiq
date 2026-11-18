#!/usr/bin/env node
// tools/style-s4-eval.mjs — measures Style S4 (lensiq-outfit.js: flat-lay colour extraction, colour harmony, lucky-colour
// link) on the LOCKED synthetic set ~/LENSIQ-field/evals/style-s4/ (set.json from gen-set.mjs, drawn by render.mjs, targets
// in targets.json). Source label: synthetic (no people, no photos). Refuses to measure unless every input is locked and
// committed (tools/eval-guard.mjs). Writes results-<UTC date>.json and .md next to the set; prints the table.
//   node tools/style-s4-eval.mjs
// Metrics (docs/STYLE-DESIGN.md §4.2, synthetic stand-ins for sets D and E):
//   harmony: Spearman rho between the 0-100 score and the expected class rating (150 combinations), AUC clash vs tonal,
//            class means in the fixed order; extraction: per garment CIEDE2000 to the nearest extracted colour, LQLucky
//            family agreement, exact garment count, per condition; lucky link: family of the main colour; speed.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertLocked, EVALS_ROOT, REPO } from "./eval-guard.mjs";
import { assertFreeSpace } from "./disk-guard.mjs";

const PHASE = "style-s4", DIR = join(EVALS_ROOT, PHASE);
const FILES = ["set.json", "render.mjs", "targets.json", "gen-set.mjs", "README.md"];
assertFreeSpace({ label: "style-s4-eval" });
assertLocked(PHASE, FILES);

const require = createRequire(import.meta.url);
const C = require(join(REPO, "lensiq-colour.js"));
const O = require(join(REPO, "lensiq-outfit.js"));
const L = require(join(REPO, "lensiq-luckycolor.js"));
const set = JSON.parse(readFileSync(join(DIR, "set.json"), "utf8"));
const T = JSON.parse(readFileSync(join(DIR, "targets.json"), "utf8"));
const { renderFlatlay } = await import(pathToFileURL(join(DIR, "render.mjs")).href);

const rank = xs => { const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), r = new Array(xs.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
const pearson = (x, y) => { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sx * sy); };
const spearman = (x, y) => pearson(rank(x), rank(y));
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); if (!s.length) return NaN; const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const wilson = (k, n) => { if (!n) return [NaN, NaN]; const z = 1.96, p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d; return [c - h, c + h]; };
const r2 = v => Math.round(v * 100) / 100, pct = (k, n) => `${(100 * k / n).toFixed(1)} % (${k}/${n}) [${wilson(k, n).map(v => (100 * v).toFixed(1)).join("-")}]`;

// ---- harmony ----
const hs = set.harmony.map(h => ({ id: h.id, cls: h.cls, expected: h.expected, score: O.harmony(h.colours.map(c => ({ lab: c.lab, share: c.share }))).score }));
const rho = spearman(hs.map(h => h.score), hs.map(h => h.expected));
const byCls = {};
for (const h of hs) (byCls[h.cls] = byCls[h.cls] || []).push(h.score);
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const clsMean = Object.fromEntries(Object.entries(byCls).map(([k, v]) => [k, r2(mean(v))]));
let wins = 0, tot = 0;
for (const a of byCls.tonal) for (const b of byCls.clash) { tot++; wins += a > b ? 1 : a === b ? 0.5 : 0; }
const auc = wins / tot;
const incr = order => order.every((k, i) => i === 0 || clsMean[order[i - 1]] < clsMean[k]);

// ---- extraction + lucky link ----
const ext = {}, lucky = { k: 0, n: 0 }, ms = [];
for (const e of set.flatlay) {
  const img = renderFlatlay(e);
  let gains;
  if (e.card) { const cs = C.cardStats(img, e.card, { target: e.card.lin }); gains = cs.ok ? cs.gains : undefined; }
  const t0 = process.hrtime.bigint();
  const r = O.extract(img, { gains, card: e.card || null });
  ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
  const c = ext[e.cond] = ext[e.cond] || { dE: [], fam: 0, n: 0, count: 0, imgs: 0 };
  c.imgs++; if (r.colours.length === e.garments.length) c.count++;
  for (const g of e.garments) {
    const best = r.colours.length ? r.colours.reduce((b, x) => (C.deltaE2000(x.lab, g.lab) < C.deltaE2000(b.lab, g.lab) ? x : b)) : null;
    c.n++; c.dE.push(best ? C.deltaE2000(best.lab, g.lab) : 100);
    const tr = C.hexToRgb(g.hex);
    if (best && L.classify(...best.rgb) === L.classify(...tr)) c.fam++;
  }
  if (e.cond !== "cast-nocard") {
    const area = g => g.shape === "round" ? Math.PI / 4 * g.box.w * g.box.h : g.shape === "tee" ? g.box.w * g.box.h * (0.32 + 0.68 * 0.56) : g.box.w * g.box.h;
    const truth = e.garments.map(g => ({ rgb: C.hexToRgb(g.hex), lab: g.lab, share: area(g) }));
    const ts = truth.reduce((s, x) => s + x.share, 0); truth.forEach(x => { x.share /= ts; });
    truth.sort((a, b) => b.share - a.share);
    if (r.colours.length) { lucky.n++; if (O.lucky(r.colours, 0, "work", L).family === O.lucky(truth, 0, "work", L).family) lucky.k++; }
    else lucky.n++;
  }
}
const extRows = Object.entries(ext).map(([cond, c]) => ({ cond, garments: c.n, images: c.imgs, dE_median: r2(q(c.dE, 0.5)), dE_p90: r2(q(c.dE, 0.9)),
  family: c.fam / c.n, familyTxt: pct(c.fam, c.n), count: c.count / c.imgs, countTxt: pct(c.count, c.imgs) }));
const msMed = r2(q(ms, 0.5));

// ---- verdicts ----
const X = T.extraction, verdict = [];
verdict.push(["harmony Spearman rho", r2(rho), ">= " + T.harmony.spearman_min, rho >= T.harmony.spearman_min]);
verdict.push(["harmony AUC tonal vs clash", r2(auc), ">= " + T.harmony.auc_clash_vs_tonal_min, auc >= T.harmony.auc_clash_vs_tonal_min]);
verdict.push(["pair class means increasing " + T.harmony.class_means_strictly_increasing_pairs.join(" < "), T.harmony.class_means_strictly_increasing_pairs.map(k => clsMean[k]).join(" < "), "strictly increasing", incr(T.harmony.class_means_strictly_increasing_pairs)]);
verdict.push(["triple class means increasing " + T.harmony.triples_order.join(" < "), T.harmony.triples_order.map(k => clsMean[k]).join(" < "), "strictly increasing", incr(T.harmony.triples_order)]);
for (const row of extRows) {
  const tgt = X.conditions_with_targets.includes(row.cond);
  verdict.push([`extraction ${row.cond}: garment dE00 median`, row.dE_median, tgt ? "<= " + X.garment_de2000_median_max : "reported", tgt ? row.dE_median <= X.garment_de2000_median_max : null]);
  verdict.push([`extraction ${row.cond}: garment dE00 p90`, row.dE_p90, tgt ? "<= " + X.garment_de2000_p90_max : "reported", tgt ? row.dE_p90 <= X.garment_de2000_p90_max : null]);
  verdict.push([`extraction ${row.cond}: lucky-colour family agreement`, row.familyTxt, tgt ? ">= " + X.family_agreement_min * 100 + " %" : "reported", tgt ? row.family >= X.family_agreement_min : null]);
  verdict.push([`extraction ${row.cond}: exact garment count`, row.countTxt, tgt ? ">= " + X.count_exact_min * 100 + " %" : "reported", tgt ? row.count >= X.count_exact_min : null]);
}
verdict.push(["lucky link: main colour family = truth (neutral + cast-card)", pct(lucky.k, lucky.n), ">= " + T.lucky_link.main_family_agreement_min * 100 + " %", lucky.k / lucky.n >= T.lucky_link.main_family_agreement_min]);
verdict.push(["speed: extract 640x480 median ms (this machine)", msMed, "<= " + T.speed.extract_640x480_ms_median_max, msMed <= T.speed.extract_640x480_ms_median_max]);

const stamp = new Date().toISOString().slice(0, 10);
const md = [`# Style S4 results ${new Date().toISOString()} (source: synthetic; set ${set.version}, ${set.harmony.length} combinations, ${set.flatlay.length} flat lays)`, "",
  "| Metric | Value | Target | Pass |", "|---|---|---|---|",
  ...verdict.map(v => `| ${v[0]} | ${v[1]} | ${v[2]} | ${v[3] === null ? "reported" : v[3] ? "yes" : "NO"} |`), "",
  "Class means (0-100): " + Object.entries(clsMean).map(([k, v]) => `${k} ${v}`).join(", ")].join("\n");
writeFileSync(join(DIR, `results-${stamp}.json`), JSON.stringify({ when: new Date().toISOString(), source: "synthetic", rho, auc, clsMean, extRows, lucky, msMed, verdict, harmony: hs }, null, 1));
writeFileSync(join(DIR, `results-${stamp}.md`), md + "\n");
console.log(md);
process.exitCode = verdict.every(v => v[3] !== false) ? 0 : 1;
