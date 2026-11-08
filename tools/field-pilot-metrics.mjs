#!/usr/bin/env node
// tools/field-pilot-metrics.mjs — metrics of the field pilot (docs/FIELD-PILOT.md): real plate reads (LENSIQ Gate) and
// real medicine boxes (medicine.html), each OCR result against a human ground truth. No dependencies, no network, reads
// CSV text only (photos stay with the field team and never reach this tool).
//
//   node tools/field-pilot-metrics.mjs --plates plates.csv --medicine medicine.csv [--json] [--strict]
//        [--lower-bound] [--targets targets.json]
//
//   --json         print the full report as JSON instead of tables
//   --strict       exit 1 when any proposal threshold fails (sample size included)
//   --lower-bound  a rate threshold passes only when the Wilson 95 % LOWER bound reaches it (default: the point estimate)
//   --targets f    JSON object merged over PROPOSAL (owner-adjusted thresholds)
//
// Metrics (overall and per condition tag; tags in the `conditions` column separated by `;`):
//   exact     share of reads whose normalised OCR equals the normalised truth, Wilson 95 % CI
//   cer       character error rate = sum Levenshtein(ocr, truth) / sum len(truth) (normalised strings, code points)
//   edit      share of reads the guard / user edited before saving, Wilson 95 % CI
//   time      mean / median seconds to confirm
//   altHit    (plates) share of wrong first reads whose truth was among the alternatives offered (`|`-separated)
//   silent    "silent wrong saves": saved value != truth AND not edited (must be 0)
// Plates are normalised with LQPlate.normalize (lensiq-plate.js); registration numbers with LQMed.parseThaiReg
// (lensiq-med.js) when they parse, else the same text normalisation without spaces.
// Exit codes: 0 ok · 1 --strict and a threshold failed · 2 usage / input error.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const Plate = require("../lensiq-plate.js");
const Med = require("../lensiq-med.js");
const Site = require("../lensiq-sitecheck.js");

// PROPOSAL — starting values for the owner to adjust. Not industry standards.
export const PROPOSAL = {
  plateMinReads: 200,
  plateExactGoodLight: 0.95,
  plateExactNight: 0.85,
  plateSilentMax: 0,
  medMinBoxes: 100,
  medRegExact: 0.95,
  medSilentMax: 0
};
// rows that count as "good light": tagged day and none of these
export const BAD_LIGHT = ["night", "rain", "backlight", "low-light"];

/* ---------------- CSV ---------------- */
/** RFC 4180-ish: quotes, "" escapes, CRLF, BOM, blank lines skipped. -> [{header: value}] */
export function parseCSV(text) {
  const s = String(text).replace(/^﻿/, ""), rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === "\"") { if (s[i + 1] === "\"") { f += "\""; i++; } else q = false; } else f += c;
    } else if (c === "\"") q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(f); rows.push(row); row = []; f = "";
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  const data = rows.filter(r => r.some(v => v.trim() !== ""));
  if (!data.length) return [];
  const head = data[0].map(h => h.trim());
  return data.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] == null ? "" : r[i]).trim()])));
}

const yes = v => /^(1|y|yes|true|ใช่|แก้)$/i.test(String(v || "").trim());
const num = v => { const n = parseFloat(String(v || "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const tagsOf = v => [...new Set(String(v || "").split(";").map(t => t.trim().toLowerCase()).filter(Boolean))];

/* ---------------- normalisers ---------------- */
export const normPlate = s => Plate.normalize(s);
export function normReg(s) {
  const r = Med.parseThaiReg(s);
  return r.ok ? r.norm.replace(/\s+/g, "") : Med.normText(s).replace(/\s+/g, "");
}
export const normLot = s => Med.normText(s).replace(/\s+/g, "");
export const normExpiry = s => Med.normText(s).replace(/\s+/g, "").replace(/[.\-]/g, "/");

/* ---------------- metrics ---------------- */
const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };

/** items: [{ocr, truth, saved, edited, time}] already normalised -> metric block */
export function metrics(items) {
  let ex = 0, ed = 0, dist = 0, len = 0, silent = 0;
  const times = [];
  for (const it of items) {
    if (it.ocr === it.truth) ex++;
    if (it.edited) ed++;
    dist += Plate.lev(it.ocr, it.truth); len += [...it.truth].length;
    if (!it.edited && it.saved !== it.truth) silent++;
    if (it.time != null) times.push(it.time);
  }
  const n = items.length;
  return {
    n, exact: Site.wilson(ex, n), edit: Site.wilson(ed, n), cer: len ? dist / len : null, silent,
    timeMean: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null, timeMedian: median(times), timed: times.length
  };
}
function byTag(items) {
  const tags = [...new Set(items.flatMap(i => i.tags))].sort();
  return Object.fromEntries(tags.map(t => [t, metrics(items.filter(i => i.tags.includes(t)))]));
}

/** plate rows -> {n, skipped, overall, goodLight, night, byTag} */
export function platesReport(rows) {
  const items = [];
  let skipped = 0;
  for (const r of rows) {
    const truth = normPlate(r.ground_truth);
    if (!truth) { skipped++; continue; }
    const ocr = normPlate(r.ocr_result), edited = yes(r.guard_edited);
    const savedRaw = r.saved_value != null && r.saved_value !== "" ? r.saved_value : edited ? r.ground_truth : r.ocr_result;
    const alts = String(r.alternatives || "").split("|").map(normPlate).filter(Boolean);
    items.push({ ocr, truth, saved: normPlate(savedRaw), edited, time: num(r.confirm_s), tags: tagsOf(r.conditions), alts });
  }
  // wrong first reads whose truth was among the alternatives offered on the confirm screen
  const wrong = items.filter(i => i.ocr !== i.truth), altHit = Site.wilson(wrong.filter(i => i.alts.includes(i.truth)).length, wrong.length);
  const good = items.filter(i => i.tags.includes("day") && !i.tags.some(t => BAD_LIGHT.includes(t)));
  return { n: items.length, skipped, altHit, overall: metrics(items), goodLight: metrics(good), night: metrics(items.filter(i => i.tags.includes("night"))), byTag: byTag(items) };
}

export const MED_FIELDS = [["reg", normReg], ["lot", normLot], ["expiry", normExpiry]];
/** medicine rows -> {n, fields: {reg|lot|expiry: {n, skipped, overall, byTag}}} */
export function medicineReport(rows) {
  const fields = {};
  for (const [k, norm] of MED_FIELDS) {
    const items = [];
    let skipped = 0;
    for (const r of rows) {
      const truth = norm(r[`${k}_truth`] || "");
      if (!truth) { skipped++; continue; }
      const ocr = norm(r[`${k}_ocr`] || ""), edited = yes(r[`${k}_edited`]);
      const sv = r[`${k}_saved`];
      const saved = sv != null && sv !== "" ? norm(sv) : edited ? truth : ocr;
      items.push({ ocr, truth, saved, edited, time: num(r.confirm_s), tags: tagsOf(r.conditions) });
    }
    fields[k] = { n: items.length, skipped, overall: metrics(items), byTag: byTag(items) };
  }
  return { n: rows.length, fields };
}

/** -> [{id, label, value, target, ok}] against PROPOSAL (+ overrides) */
export function checkThresholds({ plates, medicine }, targets = {}, { lowerBound = false } = {}) {
  const T = { ...PROPOSAL, ...targets }, out = [];
  const rate = (id, label, w, t) => {
    const v = w.p == null ? null : lowerBound ? w.lo : w.p;
    out.push({ id, label, value: v, lo: w.lo, hi: w.hi, n: w.n, target: t, side: ">=", ok: v != null && v >= t });
  };
  const max = (id, label, v, t) => out.push({ id, label, value: v, target: t, side: "<=", ok: v <= t });
  const min = (id, label, v, t) => out.push({ id, label, value: v, target: t, side: ">=", ok: v >= t });
  if (plates) {
    min("plate.reads", "plate reads (sample size)", plates.n, T.plateMinReads);
    rate("plate.exact.goodLight", "plate exact, good light (day, no rain/backlight)", plates.goodLight.exact, T.plateExactGoodLight);
    rate("plate.exact.night", "plate exact, night", plates.night.exact, T.plateExactNight);
    max("plate.silent", "plate silent wrong saves", plates.overall.silent, T.plateSilentMax);
  }
  if (medicine) {
    min("med.boxes", "medicine boxes (sample size)", medicine.n, T.medMinBoxes);
    rate("med.reg.exact", "registration number exact", medicine.fields.reg.overall.exact, T.medRegExact);
    const sil = MED_FIELDS.reduce((a, [k]) => a + medicine.fields[k].overall.silent, 0);
    max("med.silent", "medicine silent wrong saves (reg + lot + expiry)", sil, T.medSilentMax);
  }
  return out;
}

/* ---------------- printing ---------------- */
const pct = v => (v == null ? "—" : (v * 100).toFixed(1) + "%");
const ci = w => (w.p == null ? "—" : `${(w.lo * 100).toFixed(1)}–${(w.hi * 100).toFixed(1)}%`);
const sec = v => (v == null ? "—" : v.toFixed(1));
function table(head, rows) {
  const all = [head, ...rows], w = head.map((_, i) => Math.max(...all.map(r => [...String(r[i])].length)));
  const line = r => r.map((c, i) => String(c) + " ".repeat(w[i] - [...String(c)].length)).join("  ").trimEnd();
  return [line(head), w.map(x => "-".repeat(x)).join("  "), ...rows.map(line)].join("\n");
}
const HEAD = ["group", "n", "exact", "95% CI", "CER", "edit", "edit CI", "t mean", "t median", "silent"];
const mrow = (name, m) => [name, m.n, pct(m.exact.p), ci(m.exact), pct(m.cer), pct(m.edit.p), ci(m.edit), sec(m.timeMean), sec(m.timeMedian), m.silent];

export function formatReport(rep) {
  const out = [];
  if (rep.plates) {
    const p = rep.plates;
    out.push(`PLATES — ${p.n} reads${p.skipped ? ` (${p.skipped} rows without ground truth skipped)` : ""}; truth among alternatives when the first read was wrong: ${pct(p.altHit.p)} of ${p.altHit.n} (${ci(p.altHit)})`);
    out.push(table(HEAD, [mrow("overall", p.overall), mrow("good light", p.goodLight), mrow("night", p.night),
      ...Object.entries(p.byTag).map(([t, m]) => mrow(`#${t}`, m))]));
  }
  if (rep.medicine) {
    for (const [k] of MED_FIELDS) {
      const f = rep.medicine.fields[k];
      out.push("", `MEDICINE ${k} — ${f.n} boxes${f.skipped ? ` (${f.skipped} without ${k} truth skipped)` : ""}`);
      out.push(table(HEAD, [mrow("overall", f.overall), ...Object.entries(f.byTag).map(([t, m]) => mrow(`#${t}`, m))]));
    }
  }
  out.push("", `THRESHOLDS (PROPOSAL — owner to adjust, not industry standards${rep.lowerBound ? "; rates judged on the Wilson 95% lower bound" : ""})`);
  out.push(table(["check", "value", "target", "result"], rep.checks.map(c => [c.label,
    c.id.includes("exact") ? pct(c.value) : c.value == null ? "—" : c.value,
    `${c.side} ${c.id.includes("exact") ? pct(c.target) : c.target}`, c.ok ? "PASS" : "FAIL"])));
  return out.join("\n");
}

/* ---------------- CLI ---------------- */
export function parseArgs(argv) {
  const a = { json: false, strict: false, lowerBound: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--json") a.json = true;
    else if (k === "--strict") a.strict = true;
    else if (k === "--lower-bound") a.lowerBound = true;
    else if (k === "--plates" || k === "--medicine" || k === "--targets") {
      if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`${k} needs a file`);
      a[k.slice(2)] = argv[++i];
    } else throw new Error(`unknown argument ${k}`);
  }
  if (!a.plates && !a.medicine) throw new Error("give --plates and/or --medicine");
  return a;
}

export function run(argv, { log = console.log, err = console.error } = {}) {
  let a;
  try { a = parseArgs(argv); } catch (e) {
    err(`field-pilot-metrics: ${e.message}\nusage: node tools/field-pilot-metrics.mjs --plates f.csv --medicine f.csv [--json] [--strict] [--lower-bound] [--targets t.json]`);
    return 2;
  }
  let rep;
  try {
    const targets = a.targets ? JSON.parse(readFileSync(a.targets, "utf8")) : {};
    const plates = a.plates ? platesReport(parseCSV(readFileSync(a.plates, "utf8"))) : null;
    const medicine = a.medicine ? medicineReport(parseCSV(readFileSync(a.medicine, "utf8"))) : null;
    rep = { plates, medicine, lowerBound: a.lowerBound, targets: { ...PROPOSAL, ...targets } };
    rep.checks = checkThresholds(rep, targets, { lowerBound: a.lowerBound });
    rep.pass = rep.checks.every(c => c.ok);
  } catch (e) { err(`field-pilot-metrics: ${e.message}`); return 2; }
  log(a.json ? JSON.stringify(rep, null, 2) : formatReport(rep));
  return a.strict && !rep.pass ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = run(process.argv.slice(2));
