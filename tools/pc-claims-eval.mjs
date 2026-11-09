#!/usr/bin/env node
// tools/pc-claims-eval.mjs — Product Check P3: score lensiq-claims.js on the labelled over-claim TEXT set (design §5.3).
//
//   node tools/pc-claims-eval.mjs --split dev                   dev half: tables + the misses / false flags (tuning)
//   node tools/pc-claims-eval.mjs --split heldout               held-out half: tables only (no texts), scored ONCE
//        [--data DIR]          default ~/LENSIQ-field/product-check/texts (set.jsonl, split.json, labels-agentB.jsonl)
//        [--labels a|b|agree]  which reference to print the per-rule table for (default a); the summary has all three
//        [--out FILE]          also write the per-rule confusion table (CSV) — must be outside the repo
//        [--json]              machine-readable report
//
// Unit = (text, rule) pair over the text-detectable rules of the text's category scope (as in tools/pc-texts.mjs).
// "a" = agentA labels (set.jsonl expected_rule_ids), "b" = agentB (labels-agentB.jsonl), "agree" = only texts where A and
// B give the same rule set. Both labellers are AI agents; the pharmacist's adjudication is pending.
// The data holds real advert / label text, so this tool refuses any data or output path inside the repo, never prints
// held-out texts, and appends every held-out run (time + SHA-256 of the rule files) to DIR/p3-heldout-runs.jsonl.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_LABEL = "public dataset (labelled by two AI agents, pending pharmacist adjudication)";
const LQClaims = createRequire(import.meta.url)("../lensiq-claims.js");

/** True when `p` resolves inside the repo (symlinks followed when the path exists). @param {string} p */
export function insideRepo(p, repo = REPO) {
  let abs = resolve(p);
  try { if (existsSync(abs)) abs = realpathSync(abs); } catch { /* keep */ }
  let root = resolve(repo);
  try { root = realpathSync(root); } catch { /* keep */ }
  return abs === root || abs.startsWith(root + sep);
}
/** @param {string} p */
export function assertOutsideRepo(p, repo = REPO) {
  if (insideRepo(p, repo)) throw new Error(`refusing to use ${p}: test-set data must stay outside the repo (e.g. ~/LENSIQ-field/product-check/)`);
}

/** Wilson score 95 % interval for k successes in n. @param {number} k @param {number} n */
export function wilson(k, n, z = 1.959963984540054) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)];
}

/** Text-detectable rule ids in scope for a category. @param {string} category */
export function scopeRules(category) {
  return LQClaims.RULES.filter((/** @type {any} */ r) => r.detect === "text" && r.category.includes(category)).map((/** @type {any} */ r) => r.id);
}

/**
 * Score predictions against a reference. rows: [{id, category, stratum, expected:[ids], predicted:[ids]}].
 * @param {Array<{id: string, category: string, stratum?: string, expected: string[], predicted: string[]}>} rows
 */
export function score(rows) {
  /** @type {Record<string, {tp: number, fp: number, fn: number}>} */ const perRule = {};
  const cell = (/** @type {string} */ id) => (perRule[id] = perRule[id] || { tp: 0, fp: 0, fn: 0 });
  let compliantTexts = 0, compliantFlags = 0, compliantFlagged = 0;
  for (const r of rows) {
    const scope = new Set(scopeRules(r.category));
    const exp = new Set(r.expected.filter(i => scope.has(i)));
    const pred = new Set(r.predicted.filter(i => scope.has(i)));
    for (const id of pred) { if (exp.has(id)) cell(id).tp++; else cell(id).fp++; }
    for (const id of exp) if (!pred.has(id)) cell(id).fn++;
    if (!exp.size) { compliantTexts++; compliantFlags += pred.size; if (pred.size) compliantFlagged++; }
  }
  const sum = (/** @type {Array<{tp: number, fp: number, fn: number}>} */ cs) => cs.reduce((a, c) => ({ tp: a.tp + c.tp, fp: a.fp + c.fp, fn: a.fn + c.fn }), { tp: 0, fp: 0, fn: 0 });
  const stats = (/** @type {{tp: number, fp: number, fn: number}} */ c) => ({
    ...c,
    precision: c.tp + c.fp ? c.tp / (c.tp + c.fp) : null, precision_ci: wilson(c.tp, c.tp + c.fp),
    recall: c.tp + c.fn ? c.tp / (c.tp + c.fn) : null, recall_ci: wilson(c.tp, c.tp + c.fn)
  });
  /** @type {Record<string, any>} */ const families = {};
  for (const f of ["D", "F", "H", "C"]) {
    const cs = Object.entries(perRule).filter(([id]) => id[0] === f).map(([, c]) => c);
    families[f] = stats(sum(cs));
  }
  return {
    texts: rows.length,
    overall: stats(sum(Object.values(perRule))),
    families,
    rules: Object.fromEntries(Object.keys(perRule).sort().map(id => [id, stats(perRule[id])])),
    compliant: {
      texts: compliantTexts, flags: compliantFlags, per100: compliantTexts ? 100 * compliantFlags / compliantTexts : null,
      textsFlagged: compliantFlagged, textsFlagged_ci: wilson(compliantFlagged, compliantTexts)
    }
  };
}

const readJsonl = (/** @type {string} */ p) => readFileSync(p, "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
export const sha256File = (/** @type {string} */ p) => createHash("sha256").update(readFileSync(p)).digest("hex");

/** Load the set, split and agentB labels, and run the detector on one split. @param {string} dir @param {"dev"|"heldout"} split */
export function run(dir, split) {
  assertOutsideRepo(dir);
  const set = readJsonl(join(dir, "set.jsonl"));
  const sp = JSON.parse(readFileSync(join(dir, "split.json"), "utf8"));
  const ids = new Set(split === "dev" ? sp.dev : (sp.heldout || sp.held_out || sp.test));
  if (!ids.size) throw new Error("split.json has no " + split + " list");
  const bPath = join(dir, "labels-agentB.jsonl");
  const B = existsSync(bPath) ? Object.fromEntries(readJsonl(bPath).map(r => [r.id, r.rule_ids || []])) : {};
  const rows = set.filter(r => ids.has(r.id)).map(r => {
    const flags = LQClaims.detect(r.text, { category: r.category, lang: r.lang });
    return { id: r.id, lang: r.lang, category: r.category, stratum: r.stratum, text: r.text, a: r.expected_rule_ids || [], b: B[r.id] || [],
      predicted: [...new Set(flags.map((/** @type {any} */ f) => f.rule_id))], flags };
  });
  const same = (/** @type {string[]} */ x, /** @type {string[]} */ y) => x.slice().sort().join() === y.slice().sort().join();
  return {
    rows,
    a: score(rows.map(r => ({ ...r, expected: r.a }))),
    b: score(rows.map(r => ({ ...r, expected: r.b }))),
    agree: score(rows.filter(r => same(r.a, r.b)).map(r => ({ ...r, expected: r.a })))
  };
}

const pct = (/** @type {number|null} */ x) => (x == null ? "—" : (100 * x).toFixed(1) + " %");
const ci = (/** @type {number[]} */ c) => `[${(100 * c[0]).toFixed(1)}, ${(100 * c[1]).toFixed(1)}]`;

/** Markdown summary table (overall + families) for one score. @param {any} s */
export function summaryTable(s) {
  const lines = ["| Scope | TP | FP | FN | Precision [95 % CI] | Recall [95 % CI] |", "|---|---|---|---|---|---|"];
  const row = (/** @type {string} */ name, /** @type {any} */ c) =>
    lines.push(`| ${name} | ${c.tp} | ${c.fp} | ${c.fn} | ${pct(c.precision)} ${ci(c.precision_ci)} | ${pct(c.recall)} ${ci(c.recall_ci)} |`);
  row("All", s.overall);
  for (const f of ["F", "D", "H", "C"]) row(f, s.families[f]);
  const c = s.compliant;
  const per100 = c.per100 == null ? "—" : c.per100.toFixed(1);
  lines.push("", `Texts: ${s.texts}. Texts with no expected rule: ${c.texts}; false flags on them: ${c.flags} = ${per100} per 100;` +
    ` texts with any flag: ${c.textsFlagged} ${ci(c.textsFlagged_ci)}`);
  return lines.join("\n");
}
/** Per-rule confusion table (CSV). @param {any} s */
export function ruleCsv(s) {
  const out = ["rule,tp,fp,fn,precision,recall"];
  for (const [id, c] of Object.entries(s.rules)) out.push([id, c.tp, c.fp, c.fn, c.precision == null ? "" : c.precision.toFixed(3), c.recall == null ? "" : c.recall.toFixed(3)].join(","));
  return out.join("\n") + "\n";
}

function main() {
  const args = process.argv.slice(2);
  const opt = (/** @type {string} */ k, /** @type {string|undefined} */ d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const split = opt("--split");
  if (split !== "dev" && split !== "heldout") { console.error("usage: node tools/pc-claims-eval.mjs --split dev|heldout [--data DIR] [--labels a|b|agree] [--out FILE] [--json]"); process.exit(2); }
  const dir = resolve(opt("--data", join(homedir(), "LENSIQ-field", "product-check", "texts")));
  const out = opt("--out");
  try { assertOutsideRepo(dir); if (out) assertOutsideRepo(resolve(out)); } catch (e) { console.error(String(e.message || e)); process.exit(2); }
  const rulesHash = sha256File(join(REPO, "lensiq-claims-rules.js"));
  const engineHash = sha256File(join(REPO, "lensiq-claims.js"));
  const res = run(dir, split);
  const which = /** @type {"a"|"b"|"agree"} */ (opt("--labels", "a"));
  if (split === "heldout") {
    appendFileSync(join(dir, "p3-heldout-runs.jsonl"), JSON.stringify({ at: new Date().toISOString(), rules_sha256: rulesHash, engine_sha256: engineHash, texts: res.rows.length }) + "\n");
  }
  if (out) writeFileSync(resolve(out), ruleCsv(res[which]));
  if (args.includes("--json")) {
    const strip = { a: res.a, b: res.b, agree: res.agree, split, rules_sha256: rulesHash, engine_sha256: engineHash, source: SOURCE_LABEL };
    console.log(JSON.stringify(strip, null, 1));
    return;
  }
  console.log(`# ${split} — ${SOURCE_LABEL}\nlensiq-claims-rules.js sha256 ${rulesHash}\nlensiq-claims.js sha256 ${engineHash}\n`);
  for (const k of /** @type {const} */ (["a", "b", "agree"])) console.log(`## vs ${k === "a" ? "agentA" : k === "b" ? "agentB" : "A = B subset"}\n${summaryTable(res[k])}\n`);
  for (const k of /** @type {const} */ (["a", "b", "agree"])) console.log(`## per rule (vs ${k})\n` + ruleCsv(res[k]));
  if (split === "dev") {
    console.log("## dev misses / false flags (vs agentA)");
    for (const r of res.rows) {
      const scope = new Set(scopeRules(r.category));
      const fn = r.a.filter((/** @type {string} */ i) => scope.has(i) && !r.predicted.includes(i));
      const fp = r.predicted.filter(i => !r.a.includes(i));
      if (!fn.length && !fp.length) continue;
      const found = r.flags.filter((/** @type {any} */ f) => fp.includes(f.rule_id)).map((/** @type {any} */ f) => `${f.rule_id}:"${f.text}"`).join(" ");
      console.log(`${r.id} [${r.category}/${r.stratum}/${r.lang}] FN ${fn.join(",") || "-"} FP ${fp.join(",") || "-"} ${found}\n   ${r.text.replace(/\s+/g, " ").slice(0, 400)}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
