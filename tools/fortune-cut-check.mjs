#!/usr/bin/env node
// tools/fortune-cut-check.mjs — acceptance Q2 "No cut text" for the fortune pages (docs/acceptance/fortune-pages.md Q2,
// docs/acceptance/faceread.md Q2): "0 % cut summary bullets, 30 profiles × 3 languages". Owner inbox entry 18 (2026-11-23):
// the summary bullet cut mid-sentence goes to 0 on a locked probe set. MEASURES ONLY: it changes no product file.
//
// Input: the locked synthetic profile set ~/LENSIQ-field/evals/fortune-90/q2-profiles.json (30 per reading domain, 16
// domains incl. Siam Si and the report page; built by `gen` from the depth-audit generator with a NEW seed base, so it is not
// the depth set). This harness file is locked too (evals-locks/fortune-90.sha256). assertLocked() refuses to run otherwise.
//
// Path measured: engine -> facts -> FortuneAI.compose (local composer, no network) in TH, EN and ZH, gentle and straight
// (report: LQReport.buildBasic in TH / EN / ZH, gentle only: the report page has no straight mode). The bullets are the "สรุปสั้น / Summary / 简要总结" lines as the pages render them
// (fortune-read.js and report.js print l.t as is; no CSS clamps it).
//
// Definition of a CUT bullet (fixed before any measurement; stricter than tests/unit/fortune-gist.test.js, which only forbids a
// cut inside a word):
//   S1 source end   the bullet's tail (its last 12..40 characters, trailing . 。 and spaces removed) is looked up in the
//                   reading's sources: first the engine facts' own strings (meanings, tips, labels), then the composed text
//                   (sections, composer sentences). In the first pool where it is found, the bullet is NOT cut when at least
//                   one occurrence is followed by nothing, or by a sentence end (. ! ? 。 ！ ？ ; ；) — i.e. the bullet ends where
//                   its source sentence ends. Otherwise (every occurrence continues the same sentence) it is CUT.
//   S2 dangling     the bullet ends on a connector that needs more words after it (TH และ หรือ แต่ ซึ่ง ที่ เพราะ คือ ว่า เช่น
//                   โดย จึง ให้ ของ กับ ใน ตาม จาก เพื่อ ถ้า หาก; EN and or but with of to the a an such as e.g. like for;
//                   ZH 和 或 但 的 比如 例如 以及 并且 而 、 ， ：) — CUT.
//   S3 marks        the bullet ends on "…" / "..." or has an unclosed bracket or quote — CUT.
// A bullet whose tail is found in no source gets only S2 / S3 and is counted as "unmatched"; the run is INVALID (exit 2) when
// unmatched bullets exceed 5 % of all bullets, so a broken matcher cannot pass.
// Result: per page × language: readings, readings with >= 1 cut bullet, bullets, cut bullets, unmatched. Target: 0 cut bullets
// overall (every page, every language, both modes). Exit 0 = target met, 1 = cut bullets found, 2 = invalid run.
//
//   node tools/fortune-cut-check.mjs gen               write q2-profiles.json (refuses to overwrite)
//   node tools/fortune-cut-check.mjs [--json out] [--show N]   measure (refuses unless locked and committed)
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";
import { makeProfiles, factsOf } from "./fortune-depth-audit.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const PHASE = "fortune-90";
const SET = "q2-profiles.json";
const LANGS = ["th", "en", "zh"], MODES = ["gentle", "straight"];
const NOW = new Date("2026-11-23T12:00:00+07:00");

export const TERM = /^[\s]*[.!?。！？;；]/u;
export const DANGLE = {
  th: /(?:และ|หรือ|แต่|ซึ่ง|ที่|เพราะ|คือ|ว่า|เช่น|โดย|จึง|ให้|ของ|กับ|ใน|ตาม|จาก|เพื่อ|ถ้า|หาก)$/u,
  en: /(?:\b(?:and|or|but|with|of|to|the|a|an|such as|e\.g|like|for)|,|:)$/iu,
  zh: /(?:和|或|但|的|比如|例如|以及|并且|而|、|，|：)$/u
};
const PAIRS = [["(", ")"], ["[", "]"], ["（", "）"], ["「", "」"], ["“", "”"], ["《", "》"]];
export function balanced(t) {
  for (const [o, c] of PAIRS) { let d = 0; for (const ch of t) { if (ch === o) d++; else if (ch === c && --d < 0) return false; } if (d) return false; }
  return ((t.match(/"/g) || []).length % 2) === 0;
}
function strings(x, out, depth) {
  if (depth > 7 || x == null) return out;
  if (typeof x === "string") { if (x.length >= 8) out.push(x); return out; }
  if (Array.isArray(x)) { for (const y of x) strings(y, out, depth + 1); return out; }
  if (typeof x === "object") for (const k of Object.keys(x)) strings(x[k], out, depth + 1);
  return out;
}

/** classify one bullet: { cut: bool, rules: [...], matched: bool } */
export function classify(t, lang, pools) {
  const rules = [];
  const body = String(t || "").replace(/[.。\s]+$/u, "");
  if (/(?:…|\.\.\.)$/u.test(String(t || "").trim())) rules.push("S3");
  if (!balanced(body)) rules.push("S3");
  if (DANGLE[lang].test(body)) rules.push("S2");
  let matched = false;
  for (const pool of pools) {
    let found = false, ends = false;
    for (let L = Math.min(body.length, 40); L >= 12 && !found; L--) {
      const tail = body.slice(-L);
      for (const s of pool) for (let i = s.indexOf(tail); i >= 0; i = s.indexOf(tail, i + 1)) {
        found = true;
        const rest = s.slice(i + L);
        if (!rest.trim() || TERM.test(rest)) ends = true;
      }
    }
    if (found) { matched = true; if (!ends) rules.push("S1"); break; }
  }
  return { cut: rules.length > 0, rules: Array.from(new Set(rules)), matched };
}

let M = null;
function load() {
  if (M) return M;
  M = { FA: require(join(repo, "fortune-ai.js")), RP: require(join(repo, "report.js")) };
  return M;
}
function readingOf(p, lang, mode) {
  const { FA, RP } = load();
  if (p.domain === "report") {
    const rep = RP.buildBasic(p.input, { lang, now: NOW }); // the report page has no straight mode: gentle only
    const facts = ["bazi", "taksa", "lek7"].map(d => factsOf(Object.assign({}, p, { domain: d, topic: "overall" }), NOW));
    const comp = (rep.parts || []).flatMap(x => (x.sections || []).flatMap(s => s.paragraphs || []).concat(x.headline || []));
    return { summary: rep.summary, pools: [strings(facts, [], 0), comp.map(String)] };
  }
  const facts = factsOf(p, NOW);
  const res = FA.compose(facts, { seed: p.seed, lang, straight: mode === "straight", trace: true });
  const comp = (res._sentences || []).concat((res.sections || []).flatMap(s => s.paragraphs || [])).map(String);
  return { summary: res.summary, pools: [strings(facts, [], 0), comp] };
}

export function measure(set) {
  const cells = {}, bad = [];
  let lines = 0, unmatched = 0, cut = 0, readings = 0;
  for (const p of set.profiles) for (const lang of LANGS) for (const mode of (p.domain === "report" ? ["gentle"] : MODES)) {
    const rd = readingOf(p, lang, mode);
    readings++;
    const key = p.domain + "\t" + lang;
    const c = cells[key] = cells[key] || { readings: 0, cutReadings: 0, bullets: 0, cut: 0, unmatched: 0 };
    c.readings++;
    let any = false;
    for (const l of (rd.summary && rd.summary.lines) || []) {
      lines++; c.bullets++;
      const r = classify(l.t, lang, rd.pools);
      if (!r.matched) { unmatched++; c.unmatched++; }
      if (r.cut) { cut++; c.cut++; any = true; bad.push({ id: p.id, lang, mode, k: l.k, t: l.t, rules: r.rules }); }
    }
    if (any) c.cutReadings++;
  }
  return { readings, lines, unmatched, cut, cells, bad };
}

function main() {
  const argv = process.argv.slice(2), dir = phaseDir(PHASE);
  if (argv[0] === "gen") {
    mkdirSync(dir, { recursive: true });
    const out = join(dir, SET);
    if (existsSync(out)) { console.error("refusing to overwrite " + out); process.exit(1); }
    const s = makeProfiles(20261123);
    s.phase = PHASE; s.made = "2026-11-23"; s.now = NOW.toISOString(); s.langs = LANGS; s.modes = MODES;
    s.note = "synthetic only; no image of a person; seed base 20261123 (not the fortune-depth set)";
    writeFileSync(out, JSON.stringify(s, null, 1) + "\n");
    console.log("wrote " + out + " (" + s.profiles.length + " profiles)");
    return;
  }
  assertLocked(PHASE, [SET, "fortune-cut-check.mjs"]);
  const set = JSON.parse(readFileSync(join(dir, SET), "utf8"));
  const R = measure(set);
  const ji = argv.indexOf("--json"), si = argv.indexOf("--show");
  console.log("| page | lang | readings | readings with a cut bullet | bullets | cut bullets | unmatched |");
  console.log("|---|---|---:|---:|---:|---:|---:|");
  for (const [k, c] of Object.entries(R.cells)) {
    const [d, lang] = k.split("\t");
    console.log(`| ${d} | ${lang} | ${c.readings} | ${c.cutReadings} (${(100 * c.cutReadings / c.readings).toFixed(1)} %) | ${c.bullets} | ${c.cut} | ${c.unmatched} |`);
  }
  const share = R.lines ? R.unmatched / R.lines : 1;
  console.log(`\nTotal: ${R.readings} readings, ${R.lines} bullets, ${R.cut} cut (${(100 * R.cut / Math.max(1, R.lines)).toFixed(2)} %), unmatched ${R.unmatched} (${(100 * share).toFixed(2)} %)`);
  const n = si >= 0 ? +argv[si + 1] || 20 : 0;
  for (const b of R.bad.slice(0, n)) console.log(b.id, b.lang, b.mode, b.rules.join(","), JSON.stringify(b.t));
  if (ji >= 0) writeFileSync(argv[ji + 1], JSON.stringify({ at: new Date().toISOString(), phase: PHASE, ...R }, null, 1));
  if (share > 0.05) { console.log("INVALID: unmatched bullets over 5 %"); process.exit(2); }
  process.exit(R.cut ? 1 : 0);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
