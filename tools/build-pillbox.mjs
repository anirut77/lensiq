#!/usr/bin/env node
// tools/build-pillbox.mjs — builds the slim, deduplicated Pillbox imprint index used by medicine.html (loose-pill
// candidate search) from NLM's retired Pillbox CSV (public domain, US products only, frozen 2020-10).
//
//   node tools/build-pillbox.mjs <pillbox.csv> [out.json]
//   default out: vendor/pillbox/pillbox-2020-v1.json
//
// Download (59 MB, NOT committed): https://datadiscovery.nlm.nih.gov/api/views/crzr-uvwg/rows.csv?accessType=DOWNLOAD
// The CSV is treated as untrusted data: it is parsed as text, every field is length-capped and only the columns below
// are kept. Rows without an imprint are dropped (colour + shape alone match thousands of products). Rows that share
// imprint + colour + shape + size + score + name + strength are merged; `n` counts the merged SPL rows and one setid is
// kept for the DailyMed source link (an active, non-stale SPL is preferred). Images are never used.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [csvPath, outArg] = process.argv.slice(2);
if (!csvPath) { console.error("usage: node tools/build-pillbox.mjs <pillbox.csv> [out.json]"); process.exit(2); }
const out = outArg ? resolve(outArg) : join(repo, "vendor", "pillbox", "pillbox-2020-v1.json");

/** RFC 4180 rows (quoted fields, "" escapes, CRLF or LF). */
function* rows(s) {
  let f = "", r = [], q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { r.push(f); f = ""; }
    else if (c === "\n") { r.push(f); yield r; r = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || r.length) { r.push(f); yield r; }
}

const cap = (s, n) => String(s || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const it = rows(readFileSync(csvPath, "utf8"));
const H = it.next().value;
const ix = Object.fromEntries(H.map((h, i) => [h, i]));
for (const k of ["splimprint", "splcolor_text", "splshape_text", "splsize", "splscore", "medicine_name", "spl_strength", "rxcui", "setid", "source", "dea_schedule_name", "stale", "marketing_act_code"])
  if (!(k in ix)) { console.error("missing column " + k); process.exit(1); }

const tables = { colors: [], shapes: [], names: [], strengths: [], sources: [], dea: [] };
const idx = {};
const tid = (t, v) => { const m = (idx[t] = idx[t] || new Map()); if (!m.has(v)) { m.set(v, tables[t].length); tables[t].push(v); } return m.get(v); };
const merged = new Map();
let total = 0, noImprint = 0;
for (const r of it) {
  if (r.length < H.length - 2) continue;
  total++;
  const imprint = cap(r[ix.splimprint], 40).toUpperCase();
  if (!imprint) { noImprint++; continue; }
  const color = cap(r[ix.splcolor_text], 40).toUpperCase(), shape = cap(r[ix.splshape_text], 24).toUpperCase();
  const size = Math.max(0, Math.min(99, Math.round(Number(r[ix.splsize]) || 0)));
  const score = Math.max(0, Math.min(9, parseInt(r[ix.splscore], 10) || 0));
  const name = cap(r[ix.medicine_name], 80), strength = cap(r[ix.spl_strength], 160).replace(/;\s*$/, "");
  const key = [imprint, color, shape, size, score, name.toUpperCase(), strength].join("|");
  const setid = /^[0-9a-f-]{36}$/i.test(r[ix.setid]) ? r[ix.setid].toLowerCase() : "";
  const good = r[ix.stale] !== "True" && r[ix.marketing_act_code] === "active";
  const prev = merged.get(key);
  if (prev) { prev.n++; if (good && !prev.good && setid) { prev.setid = setid; prev.good = true; } continue; }
  merged.set(key, {
    imprint, c: tid("colors", color), s: tid("shapes", shape), size, score, nm: tid("names", name), st: tid("strengths", strength),
    rxcui: parseInt(r[ix.rxcui], 10) || 0, setid, src: tid("sources", cap(r[ix.source], 8)), dea: tid("dea", cap(r[ix.dea_schedule_name], 6)), n: 1, good
  });
}
const list = [...merged.values()].sort((a, b) => (a.imprint < b.imprint ? -1 : a.imprint > b.imprint ? 1 : a.nm - b.nm));
const data = {
  format: "lensiq-pillbox-slim/1",
  source: "U.S. National Library of Medicine (NLM) Pillbox, retired 2021-01-29; data frozen 2020-10",
  source_url: "https://datadiscovery.nlm.nih.gov/api/views/crzr-uvwg/rows.csv?accessType=DOWNLOAD",
  license: "Public domain (U.S. Government work). See vendor/pillbox/LICENSE.txt",
  nlm_warning: "These files will not be updated and should not be used for pill identification.",
  built: new Date().toISOString().slice(0, 10),
  stats: { csv_rows: total, without_imprint: noImprint, rows: list.length },
  cols: ["imprint", "color", "shape", "size_mm", "score", "name", "strength", "rxcui", "setid", "source", "dea", "n"],
  ...tables,
  rows: list.map(x => [x.imprint, x.c, x.s, x.size, x.score, x.nm, x.st, x.rxcui, x.setid.replace(/-/g, ""), x.src, x.dea, x.n])
};
writeFileSync(out, JSON.stringify(data));
console.log(`${total} CSV rows, ${noImprint} without imprint, ${list.length} merged rows -> ${out}`);
