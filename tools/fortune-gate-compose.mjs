#!/usr/bin/env node
// tools/fortune-gate-compose.mjs — LOCKED harness of the per-page gate (owner decision 86 ค, 2026-11-17). Composes a fixed input set
// with the reading modules of one tree and prints one sha256 per engine x language (and per report kind x language), so two trees
// (live main, or this repo with the live/ copies laid over it) can be compared byte for byte without a browser.
//   node tools/fortune-gate-compose.mjs <tree>      prints {"face|th": "<sha256>", …}
// Inputs (synthetic: engine-built facts, tools/fortune-review-export.mjs factsFor; FortuneAI.compose; no network):
//   15 engines x 6 inputs (lcg(777001 + k*7307), compose seed 9100 + i*53, gentle), TH / EN / ZH; report basic (2 births, now
//   2026-11-17), annual 2027 (1 birth) and compatibility (1 pair), TH / EN / ZH.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TREE = resolve(process.argv[2] || ".");
const require = createRequire(join(TREE, "x.js"));
const EX = await import(pathToFileURL(join(TREE, "tools", "fortune-review-export.mjs")).href);
const FA = require(join(TREE, "fortune-ai.js"));
const sha = x => createHash("sha256").update(JSON.stringify(x)).digest("hex");
const out = {};
for (const d of EX.DOMAINS) {
  const r = EX.lcg(777001 + EX.DOMAINS.indexOf(d) * 7307), facts = [];
  for (let i = 0; i < 6; i++) facts.push(EX.factsFor(d, i, r));
  for (const L of ["th", "en", "zh"]) {
    const res = facts.map((f, i) => { const g = FA.compose(JSON.parse(JSON.stringify(f)), { seed: 9100 + i * 53, lang: L, straight: false }); return [g.sections, g.summary || null, g.reminder || null, g.plan || null]; });
    out[d + "|" + L] = sha(res);
  }
}
// the report page (report.js and its dictionaries)
global.window = globalThis; globalThis.LQI18N_Q = globalThis.LQI18N_Q || [];
require(join(TREE, "i18n", "en-report.js")); require(join(TREE, "i18n", "zh-report.js"));
const dict = {}; for (const q of globalThis.LQI18N_Q) for (const L of Object.keys(q)) Object.assign(dict[L] = dict[L] || {}, q[L]);
const RP = require(join(TREE, "report.js"));
const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : "{" + k + "}"));
const tOf = L => (k, th, v) => fill(L === "th" ? th : (dict[L] && dict[L][k]) || th, v);
const B = [{ y: 1960, m: 3, d: 8, h: 7, mi: 10, gender: "female" }, { y: 1989, m: 10, d: 21, noTime: true, gender: "male" }];
for (const L of ["th", "en", "zh"]) {
  const t = tOf(L), strip = rep => (rep.parts || []).map(p => [p.id, p.title, (p.sections || []).map(s => [s.id, s.title, s.paragraphs])]);
  out["report-basic|" + L] = sha(B.map(b => strip(RP.buildBasic(b, { lang: L, t, now: new Date(2026, 10, 17) }))));
  out["report-annual|" + L] = sha(strip(RP.buildAnnual(B[0], 2027, { lang: L, t })));
  out["report-compat|" + L] = sha(strip(RP.buildCompat(B[0], B[1], { lang: L, t })));
}
console.log(JSON.stringify(out));
