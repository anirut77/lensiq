#!/usr/bin/env node
// tools/pc-lookup-testset.mjs — Product Check P4: writes the FIXED lookup test set (docs/product-check/p4-testset.json)
// BEFORE any matching code exists. Run once; the file is committed and never regenerated to fit results.
//
//   node tools/pc-lookup-testset.mjs [--tmt DIR] [--out FILE]
//
// Strata (all facts only; no label text, no images):
//   tmt_dev / tmt_heldout   Thai brand -> active ingredient pairs from the TMT 2020-02-17 snapshot (CC BY, data.go.th),
//                           split by a fixed-seed hash of the trade name (20 % held-out). Each name gives 3 queries:
//                           exact name, a label-like line (name + strength + dose form), an OCR-noise variant.
//   tmt_notfound            names that must NOT match: synthetic nonsense brands (checked absent) and real brands first
//                           registered after Feb 2020 (checked absent from the snapshot).
//   registry / recalls / alerts / down   hand-entered from live calls on 2026-11-10 (research notes in P4-RESULTS.md).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readXls } from "./lib/xls-biff8.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TMT = arg("--tmt", join(homedir(), "LENSIQ-field", "drug-data", "tmt-2020-ccby"));
const OUT = arg("--out", join(REPO, "docs", "product-check", "p4-testset.json"));
export const SEED = "lensiq-pc-p4-2026-11-10";
const h = s => parseInt(createHash("sha256").update(SEED + "|" + s).digest("hex").slice(0, 8), 16);

const rows = readXls(readFileSync(join(TMT, "mastertmt_20200217.xls"))).sheets[0].rows.slice(1).filter(r => r && r[7]);
const byName = new Map();
for (const r of rows) {
  const name = r[7].trim();
  if (!byName.has(name)) byName.set(name, { ingredients: new Set(), rows: [] });
  byName.get(name).ingredients.add(r[1].trim().toLowerCase());
  byName.get(name).rows.push(r);
}
const upperKeys = new Set([...byName.keys()].map(k => k.toUpperCase().replace(/[^A-Z0-9ก-๙]+/g, "")));
const CONF = { O: "0", I: "1", S: "5", B: "8", L: "1", Z: "2", G: "6" };
function ocrNoise(name) {
  const toks = name.split(/([^A-Za-z]+)/); // letter runs and the separators between them
  let best = -1;
  toks.forEach((t, i) => { if (/^[A-Za-z]{6,}$/.test(t) && (best < 0 || t.length > toks[best].length)) best = i; });
  if (best < 0) return name.toLowerCase().replace(/\s+/g, "  ");
  const t = toks[best];
  let j = -1;
  for (let k = 2; k < t.length - 1; k++) if (CONF[t[k].toUpperCase()]) { j = k; break; }
  toks[best] = j >= 0 ? t.slice(0, j) + CONF[t[j].toUpperCase()] + t.slice(j + 1) : t.slice(0, 2) + t.slice(3); // confusion, else a dropped letter
  return toks.join("").toLowerCase();
}
// candidates: names with at least 4 Latin letters (what OCR reads on most Thai packs; 80 names are Thai script) or Thai script
const cands = [...byName.keys()].filter(n => (n.match(/[A-Za-z]/g) || []).length >= 4 || /[ก-๙]{3}/.test(n));
cands.sort((a, b) => h(a) - h(b) || (a < b ? -1 : 1));
const pick = (held, n) => cands.filter(c => (h("split|" + c) % 5 === 0) === held).slice(0, n);
const make = (names, split) => names.map((name, i) => {
  const e = byName.get(name), r = e.rows[0];
  return { id: `P4-TMT-${split === "dev" ? "D" : "H"}${String(i + 1).padStart(3, "0")}`, split, name,
    expect_ingredients: [...e.ingredients].sort(),
    queries: { exact: name, label: `${name} ${r[2]} ${r[3]}`.replace(/\s+/g, " ").trim(), ocr: ocrNoise(name) } };
});

// not found: synthetic nonsense (deterministic letters, absent) + real post-Feb-2020 brands (absent in the snapshot)
const letters = "BCDFGHJKLMNPRSTVWXZ", vowels = "AEIOU";
const synth = [];
for (let k = 0; synth.length < 30 && k < 1000; k++) {
  let s = ""; const x = h("synth|" + k);
  for (let j = 0; j < 4; j++) s += letters[(x >>> (j * 5)) % letters.length] + vowels[(x >>> (j * 3 + 1)) % 5];
  s = s.slice(0, 6 + (x % 3));
  if (!upperKeys.has(s)) synth.push(s);
}
const POST2020 = ["PAXLOVID", "LAGEVRIO", "EVUSHELD", "COMIRNATY", "SPIKEVAX", "VAXZEVRIA", "MOUNJARO", "WEGOVY", "LEQEMBI", "BEYFORTUS",
  "VEKLURY", "XOCOVA", "RONAPREVE", "KISUNLA", "AREXVY"];
const real = POST2020.filter(n => ![...upperKeys].some(k => k.startsWith(n)));
const notfound = [...synth.map((n, i) => ({ id: `P4-NF-S${String(i + 1).padStart(2, "0")}`, kind: "synthetic", query: n })),
  ...real.map((n, i) => ({ id: `P4-NF-R${String(i + 1).padStart(2, "0")}`, kind: "post-2020 brand", query: n }))];

const set = {
  version: 1, written: "2026-11-10", seed: SEED,
  note: "Fixed before any P4 matching code. Do not regenerate to fit results. TMT names / ingredients: TMT 2020-02-17 snapshot, CC BY (data.go.th), facts only.",
  tmt_dev: make(pick(false, 150), "dev"),
  tmt_heldout: make(pick(true, 150), "heldout"),
  tmt_notfound: notfound,
  // Thai FDA register (GET_DATA_* operations), live 2026-11-10: one known-registered number per category + well-formed absent ones
  registry: [
    { id: "P4-REG-01", op: "drug", q: "1A 844/39", expect: "found", status: "active", name_en: "TYLENOL 500" },
    { id: "P4-REG-02", op: "food", q: "10-1-02141-1-0375", expect: "found", status: "active" },
    { id: "P4-REG-03", op: "cosmetic", q: "13-1-6800016755", expect: "found", status: "active" },
    { id: "P4-REG-04", op: "herbal", q: "G123/45", expect: "found", status: "active" },
    { id: "P4-REG-05", op: "advert", q: "ฆท.1377/2564", expect: "found" },
    { id: "P4-REG-06", op: "device", q: "69-1-3-2-0000467", expect: "found", note: "one row per model / size; all rows share the number" },
    { id: "P4-REG-07", op: "cosmetic", q: "12-1-6900003013", expect: "found", status: "cancelled", note: "named in an FDA warning (alert list)" },
    { id: "P4-REG-08", op: "food", q: "13-2-06463-5-0326", expect: "found", status: "active", note: "register still active, but named in an FDA warning: the alert must still show" },
    { id: "P4-REG-N1", op: "drug", q: "1A 9999/99", expect: "none" },
    { id: "P4-REG-N2", op: "food", q: "10-1-99999-9-9999", expect: "none" },
    { id: "P4-REG-N3", op: "cosmetic", q: "13-1-6899999999", expect: "none" },
    { id: "P4-REG-N4", op: "herbal", q: "G9999/99", expect: "none" },
    { id: "P4-REG-N5", op: "device", q: "64-1-3-2-9999999", expect: "none" },
    { id: "P4-REG-N6", op: "cosmetic", q: "10-2-6600188171", expect: "none", note: "publicly reported fake cosmetic number" },
    { id: "P4-REG-S1", source: "hsa", q: "SIN09110P", expect: "found", name_en: "PANADOL EXTRA CAPLET" },
    { id: "P4-REG-S2", source: "hsa", q: "zzqxlensiqnotreal", expect: "none" }
  ],
  // recall / alert sources, live 2026-11-10 (ids are the sources' own)
  recalls: [
    { id: "P4-REC-01", source: "openfda", by: "gtin", q: "712199083411", expect: "found", ref: "H-0130-2027" },
    { id: "P4-REC-02", source: "openfda", by: "name", q: "Synjardy", expect: "found", ref: "D-0657-2026" },
    { id: "P4-REC-03", source: "safetygate", by: "name", q: "5D EXTREME Whitening Face Cream", expect: "found", ref: "SR/01376/26" },
    { id: "P4-REC-04", source: "rasff", by: "name", q: "pine nuts", expect: "found", ref: "2026.9864" },
    { id: "P4-REC-05", source: "healthcanada", by: "name", q: "Organic Roasted Black Soybeans", expect: "found", ref: "77435" },
    { id: "P4-REC-N1", source: "openfda", by: "name", q: "zzqxlensiqnotreal", expect: "none" },
    { id: "P4-REC-N2", source: "safetygate", by: "name", q: "zzqxlensiqnotreal", expect: "none" },
    { id: "P4-REC-N3", source: "rasff", by: "name", q: "zzqxlensiqnotreal", expect: "none" },
    { id: "P4-REC-N4", source: "healthcanada", by: "name", q: "zzqxlensiqnotreal", expect: "none" }
  ],
  // curated Thai list (vendor/pc-alerts/th.json): numbers that must raise the alert, and a registered number that must not
  alerts: [
    { id: "P4-AL-01", q: "12-1-6900003013", expect: "found" },
    { id: "P4-AL-02", q: "13-2-06463-5-0326", expect: "found" },
    { id: "P4-AL-03", q: "1314650052", expect: "none", note: "partial digits: must not match 13-1-13465-5-0052" },
    { id: "P4-AL-04", q: "1A 844/39", expect: "none" }
  ],
  // every source answering 5xx / timing out / switched off: the card must say "could not check", never "no signal"
  down: ["thfda", "openfda", "safetygate", "rasff", "hsa", "healthcanada", "dailymed", "rxnav"].map((s, i) => ({ id: `P4-DOWN-${i + 1}`, source: s, upstream: i % 2 ? "timeout" : "500" }))
};
writeFileSync(OUT, JSON.stringify(set, null, 1) + "\n");
console.log(`wrote ${OUT}: dev ${set.tmt_dev.length}, held-out ${set.tmt_heldout.length}, not-found ${notfound.length} (${real.length} real), ` +
  `registry ${set.registry.length}, recalls ${set.recalls.length}, alerts ${set.alerts.length}, down ${set.down.length}`);
