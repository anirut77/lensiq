#!/usr/bin/env node
// tests/bench/checkout.bench.mjs — camera barcode reading of the checkout page (checkout.js initBarcode/barcodeTick:
// native BarcodeDetector with every supported format) on SYNTHETIC camera scenes. No dataset needed.
//
//   node tests/bench/checkout.bench.mjs [--n 60] [--json out.json]
//
// Codes are drawn by a renderer written for this benchmark (tests/bench/bench-page2.js: EAN-13 / UPC-A and Code 128-B)
// on a 640×480 "package" scene, then degraded one factor at a time (size, rotation, tilt, can curvature, defocus, motion
// blur, noise, dim light, glare, JPEG, occlusion) plus a random "hand-held" mix and empty scenes (false reads).
// A read is correct when checkout.js findByBarcode() would match the true product (UPC-A = EAN-13 with a leading 0).
// Note: BarcodeDetector is provided by the OS/browser (macOS: Apple Vision; Android: ML Kit; Windows/Linux desktop
// Chrome: usually NOT available, the page then falls back to a USB scanner/typing). Results are for this platform only.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, openBench, pct, table } from "./lib.mjs";

const require = createRequire(import.meta.url);
const CO = require(join(REPO, "checkout.js"));
const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const N = +opt("--n", 60), FR = 4; // 4 frames = 1 s of the page's 250 ms barcode ticks

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const ck = ds => { const s = ds.split("").reverse().reduce((a, d, i) => a + (+d) * (i % 2 ? 1 : 3), 0); return String((10 - s % 10) % 10); };
const ean = r => { const b = "885" + Array.from({ length: 9 }, () => (r() * 10) | 0).join(""); return b + ck(b); };
const upc = r => { const b = Array.from({ length: 11 }, () => (r() * 10) | 0).join(""); return b + ck(b); }; // 12 digits
const C128CH = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789-";
const sku = r => Array.from({ length: 8 }, () => C128CH[(r() * C128CH.length) | 0]).join("");

const COND = [
  ["baseline (module 2 px ≈ 37 mm code fills 35% of width)", {}],
  ["small: module 1.25 px (code 22% of width)", { mod: 1.25 }],
  ["small: module 1 px (18%)", { mod: 1 }],
  ["tiny: module 0.75 px (13%)", { mod: 0.75 }],
  ["large: module 4 px", { mod: 4 }],
  ["rotated 30°", { rot: 30 }], ["rotated 45°", { rot: 45 }], ["rotated 90°", { rot: 90 }], ["upside down 180°", { rot: 180 }],
  ["tilted 45° away", { tilt: 45 }], ["tilted 65° away", { tilt: 65 }],
  ["on a can, ±30° wrap", { curve: 30 }], ["on a can, ±50° wrap", { curve: 50 }],
  ["defocus blur σ 1 px", { blur: 1 }], ["defocus blur σ 2 px", { blur: 2 }], ["defocus blur σ 3 px", { blur: 3 }],
  ["motion blur 6 px", { motion: 6 }], ["motion blur 12 px", { motion: 12 }],
  ["sensor noise σ 15", { noise: 15 }], ["sensor noise σ 35", { noise: 35 }],
  ["dim light (35% exposure)", { light: 0.35 }], ["glare spot", { glare: 0.8 }],
  ["JPEG quality 0.3", { jpeg: 0.3 }], ["JPEG quality 0.1", { jpeg: 0.1 }],
  ["15% of code covered", { occlude: 0.15 }], ["30% of code covered", { occlude: 0.3 }]
];
const base = { mod: 2, noise: 4, jpeg: 0.85 };
const handheld = r => ({ mod: 1 + r() * 2, rot: (r() - 0.5) * 60, tilt: r() * 40, blur: r() < 0.5 ? r() * 1.5 : 0, motion: r() < 0.3 ? r() * 6 : 0, noise: 3 + r() * 12, jpeg: 0.5 + r() * 0.4, light: 0.5 + r() * 0.7, curve: r() < 0.3 ? r() * 40 : 0 });

const b = await openBench();
const out = { date: new Date().toISOString(), n: N, rows: [] };
try {
  out.formats = await b.page.evaluate("LQB2.barcodeFormats()");
  if (!out.formats || !out.formats.length) { console.log("skip checkout barcode benchmark: BarcodeDetector not available in this Chrome/OS"); process.exit(0); }
  const run = async (label, mk) => {
    const res = {};
    for (const kind of ["ean", "upc", "c128"]) {
      const r = rng(label.length * 1000 + kind.length), specs = [];
      for (let i = 0; i < N; i++) { const t = kind === "c128" ? sku(r) : kind === "upc" ? upc(r) : ean(r); specs.push({ seed: (r() * 1e9) | 0, kind: kind === "upc" ? "ean" : kind, text: kind === "upc" ? "0" + t : t, truth: t, ...mk(r) }); }
      // FR frames per code (hand/camera moves a little between the page's 250 ms barcode ticks: new jitter + noise)
      const flat = specs.flatMap(sp => Array.from({ length: FR }, (_, k) => ({ ...sp, seed: sp.seed + k })));
      const all = [];
      for (let i = 0; i < flat.length; i += 24) all.push(...await b.page.evaluate(`LQB2.barcodeScenes(${JSON.stringify(flat.slice(i, i + 24))})`));
      let ok = 0, bad = 0, ms = [];
      const ex = [], gate = { 1: { ok: 0, bad: 0 }, 2: { ok: 0, bad: 0 } };
      specs.forEach((sp, i) => {
        const prod = [{ id: "p", barcode: sp.truth }], seq = all.slice(i * FR, i * FR + FR), row = seq[0];
        const vals = (row.codes || []).map(c => c.v);
        if (vals.some(v => CO.findByBarcode(prod, v))) ok++;
        if (vals.some(v => !CO.findByBarcode(prod, v))) { bad++; if (ex.length < 3) ex.push({ truth: sp.truth, got: row.codes }); }
        ms.push(row.ms);
        // what the page adds to the cart over these frames: createCodeGates (page default multi-code, clearMs 1200)
        for (const mf of [1, 2]) {
          const G = CO.createCodeGates({ clearMs: 1200, minFrames: mf }), added = [];
          seq.forEach((fr, k) => added.push(...G.step((fr.codes || []).map(c => ({ rawValue: c.v })), k * 250)));
          if (added.some(v => CO.findByBarcode(prod, v))) gate[mf].ok++;
          if (added.some(v => !CO.findByBarcode(prod, v))) gate[mf].bad++;
        }
      });
      res[kind] = { n: specs.length, read: ok / specs.length, misread: bad / specs.length, ms: ms.sort((a, c) => a - c)[ms.length >> 1], misreadExamples: ex,
        gate1: { added: gate[1].ok / specs.length, wrong: gate[1].bad / specs.length }, gate2: { added: gate[2].ok / specs.length, wrong: gate[2].bad / specs.length } };
    }
    out.rows.push({ label, ...res });
    process.stderr.write(".");
  };
  for (const [label, c] of COND) await run(label, () => ({ ...base, ...c }));
  await run("random hand-held mix (size, angle, tilt, blur, noise, light, JPEG, curvature)", handheld);
  // empty scenes: any read is a false read
  const neg = Array.from({ length: 5 * N }, (_, i) => ({ seed: 7000 + i, text: null, ...base, noise: 4 + (i % 4) * 6 }));
  let fp = 0;
  for (let i = 0; i < neg.length; i += 25) for (const row of await b.page.evaluate(`LQB2.barcodeScenes(${JSON.stringify(neg.slice(i, i + 25))})`)) if ((row.codes || []).length) fp++;
  out.empty = { n: neg.length, falseReads: fp };
} finally { await b.done(); }

console.log(`\n## Checkout camera barcode reading — native BarcodeDetector (${process.platform}), ${N} codes per symbology per condition, single frame\n`);
console.log("formats: " + out.formats.join(", "));
console.log(table(["condition", "EAN-13 read", "UPC-A read", "Code 128 read", "misread (any)", "median ms"],
  out.rows.map(r => [r.label, pct(r.ean.read, 0), pct(r.upc.read, 0), pct(r.c128.read, 0), pct((r.ean.misread + r.upc.misread + r.c128.misread) / 3, 1), r.ean.ms])));
const av = (r, g, k) => (r.ean[g][k] + r.upc[g][k] + r.c128[g][k]) / 3;
console.log(`\n### What reaches the cart within 1 s (${FR} barcode ticks), all three symbologies averaged\n`);
console.log(table(["condition", "1 agreeing read: right item added", "wrong code added", "2 agreeing reads: right item added", "wrong code added"],
  out.rows.map(r => [r.label, pct(av(r, "gate1", "added"), 0), pct(av(r, "gate1", "wrong"), 1), pct(av(r, "gate2", "added"), 0), pct(av(r, "gate2", "wrong"), 1)])));
const tot = g => out.rows.reduce((a, r) => a + av(r, g, "wrong"), 0) / out.rows.length;
console.log(`mean wrong-code rate over all conditions: 1 read ${pct(tot("gate1"), 2)} · 2 reads ${pct(tot("gate2"), 2)}`);
console.log(`\nempty scenes (no barcode): ${out.empty.falseReads} false reads in ${out.empty.n}`);
if (opt("--json")) { writeFileSync(opt("--json"), JSON.stringify(out, null, 1)); console.log("wrote " + opt("--json")); }
