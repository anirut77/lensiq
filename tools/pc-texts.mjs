#!/usr/bin/env node
// tools/pc-texts.mjs — Product Check P1: the labelled over-claim TEXT set (design §5.3).
//
//   node tools/pc-texts.mjs SET.jsonl                        validate + counts per stratum
//   node tools/pc-texts.mjs SET.jsonl --labels-b B.jsonl     + Cohen's kappa (agentA in SET vs labeller B)
//        [--disagreements OUT.jsonl]                         + write the disagreements ("pending pharmacist adjudication")
//   node tools/pc-texts.mjs SET.jsonl --split OUT.json       write the fixed-seed 50/50 dev / held-out split
//   node tools/pc-texts.mjs SET.jsonl --json                 machine-readable report
//
// The set, the second labels and the split hold real advert / label text, so they live OUTSIDE the repo
// (~/LENSIQ-field/product-check/texts/). The tool refuses to read or write any of them inside the repo. Only this script,
// the rule draft (tools/pc-rules-draft.json) and the counts / checksums in docs/product-check/TEST-SETS.md are committed.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, realpathSync, existsSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SPLIT_SEED = "lensiq-pc-p1-text-2026-11-09";
export const LANGS = ["th", "en", "zh"];
export const CATEGORIES = ["drug", "supplement", "food", "herbal", "cosmetic"];
export const STRATA = ["overclaim", "compliant"];
export const FAMILY_OF = { drug: "D", food: "F", supplement: "F", herbal: "H", cosmetic: "C" };
const RULE_ID = /^[DFHC]\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PCT_ID = /^PCT-\d{4}$/;

/** True when `p` resolves to a path inside the repo (symlinks followed when the path exists). @param {string} p */
export function insideRepo(p, repo = REPO) {
  let abs = resolve(p);
  try { if (existsSync(abs)) abs = realpathSync(abs); } catch { /* keep the resolved path */ }
  let root = resolve(repo);
  try { root = realpathSync(root); } catch { /* keep */ }
  return abs === root || abs.startsWith(root + sep);
}

/** Throws when a data path is inside the repo (data stays out of git). @param {string} p */
export function assertOutsideRepo(p, repo = REPO) {
  if (insideRepo(p, repo)) throw new Error(`refusing to use ${p}: test-set data must stay outside the repo (e.g. ~/LENSIQ-field/product-check/)`);
}

/** Parse JSON Lines; throws with the line number on bad JSON. @param {string} text */
export function parseJsonl(text) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    try { out.push(JSON.parse(line)); } catch (e) { throw new Error(`line ${i + 1}: invalid JSON (${e.message})`); }
  });
  return out;
}

/** Validate one record; returns a list of problems (empty = valid). @param {any} r @param {Set<string>} [ruleIds] */
export function recordProblems(r, ruleIds) {
  const p = [];
  if (!r || typeof r !== "object") return ["not an object"];
  if (!PCT_ID.test(r.id ?? "")) p.push("id must look like PCT-0001");
  if (!LANGS.includes(r.lang)) p.push(`lang must be one of ${LANGS.join("/")}`);
  if (!CATEGORIES.includes(r.category)) p.push(`category must be one of ${CATEGORIES.join("/")}`);
  if (!STRATA.includes(r.stratum)) p.push(`stratum must be one of ${STRATA.join("/")}`);
  if (typeof r.text !== "string" || r.text.trim().length < 2) p.push("text is empty");
  if (!/^https?:\/\/\S+$/.test(r.source_url ?? "")) p.push("source_url must be an http(s) URL");
  if (!DATE.test(r.accessed ?? "")) p.push("accessed must be YYYY-MM-DD");
  if (typeof r.label_by !== "string" || !r.label_by) p.push("label_by is required");
  if (typeof r.notes !== "string") p.push("notes must be a string (may be empty)");
  if (!Array.isArray(r.expected_rule_ids)) p.push("expected_rule_ids must be an array (may be empty)");
  else {
    for (const id of r.expected_rule_ids) {
      if (!RULE_ID.test(id)) p.push(`bad rule id ${id}`);
      else if (ruleIds && !ruleIds.has(id)) p.push(`unknown rule id ${id}`);
      else if (FAMILY_OF[r.category] && id[0] !== FAMILY_OF[r.category]) p.push(`rule ${id} is outside the ${r.category} family (${FAMILY_OF[r.category]})`);
    }
    if (new Set(r.expected_rule_ids).size !== r.expected_rule_ids.length) p.push("duplicate rule ids");
  }
  return p;
}

/** Validate a whole set: per-record problems plus duplicate ids / texts. @param {any[]} rows @param {Set<string>} [ruleIds] */
export function validateSet(rows, ruleIds) {
  const problems = [];
  const ids = new Set(), texts = new Set();
  rows.forEach((r, i) => {
    for (const m of recordProblems(r, ruleIds)) problems.push(`${r?.id ?? "#" + (i + 1)}: ${m}`);
    if (ids.has(r?.id)) problems.push(`${r.id}: duplicate id`);
    ids.add(r?.id);
    const key = String(r?.text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (key && texts.has(key)) problems.push(`${r.id}: duplicate text`);
    texts.add(key);
  });
  return problems;
}

/** Counts per stratum key ("overclaim/supplement/th" etc.) and totals. @param {any[]} rows */
export function counts(rows) {
  const by = (f) => rows.reduce((m, r) => ((m[f(r)] = (m[f(r)] || 0) + 1), m), /** @type {Record<string, number>} */ ({}));
  const rules = {};
  for (const r of rows) for (const id of r.expected_rule_ids || []) rules[id] = (rules[id] || 0) + 1;
  return {
    total: rows.length,
    stratum: by(r => r.stratum),
    category: by(r => r.category),
    lang: by(r => r.lang),
    stratum_category: by(r => `${r.stratum}/${r.category}`),
    stratum_category_lang: by(r => `${r.stratum}/${r.category}/${r.lang}`),
    flagged: rows.filter(r => (r.expected_rule_ids || []).length > 0).length,
    rules,
  };
}

/** Cohen's kappa for two binary vectors (1 / 0). Returns {kappa, po, pe, n, a, b, both}. @param {number[]} x @param {number[]} y */
export function cohenKappa(x, y) {
  if (x.length !== y.length) throw new Error("kappa: vectors differ in length");
  const n = x.length;
  if (!n) return { kappa: NaN, po: NaN, pe: NaN, n: 0, a: 0, b: 0, both: 0 };
  let agree = 0, a = 0, b = 0, both = 0;
  for (let i = 0; i < n; i++) {
    if (x[i] === y[i]) agree++;
    a += x[i]; b += y[i]; if (x[i] && y[i]) both++;
  }
  const po = agree / n;
  const pe = (a / n) * (b / n) + (1 - a / n) * (1 - b / n);
  const kappa = pe === 1 ? (po === 1 ? 1 : 0) : (po - pe) / (1 - pe);
  return { kappa, po, pe, n, a, b, both };
}

/**
 * Agreement between labeller A (rows[].expected_rule_ids) and labeller B ({id -> rule_ids}).
 * Unit = (text, rule) pair over the text-detectable rules of the text's family; per family, overall (pooled), per rule,
 * and per text ("any flag" yes / no). @param {any[]} rows @param {Map<string,string[]>} bLabels @param {{id:string,family:string}[]} textRules
 */
export function agreement(rows, bLabels, textRules) {
  const fams = {};
  for (const r of textRules) (fams[r.family] ||= []).push(r.id);
  const vec = { ALL: [[], []] }, perRule = {}, anyFlag = [[], []];
  const disagreements = [];
  for (const row of rows) {
    const b = bLabels.get(row.id);
    if (!b) throw new Error(`labeller B has no label for ${row.id}`);
    const fam = FAMILY_OF[row.category];
    const A = new Set(row.expected_rule_ids), B = new Set(b);
    for (const id of fams[fam] || []) {
      const xa = A.has(id) ? 1 : 0, xb = B.has(id) ? 1 : 0;
      (vec[fam] ||= [[], []])[0].push(xa); vec[fam][1].push(xb);
      vec.ALL[0].push(xa); vec.ALL[1].push(xb);
      (perRule[id] ||= [[], []])[0].push(xa); perRule[id][1].push(xb);
    }
    anyFlag[0].push(A.size ? 1 : 0); anyFlag[1].push(B.size ? 1 : 0);
    const onlyA = [...A].filter(x => !B.has(x)).sort(), onlyB = [...B].filter(x => !A.has(x)).sort();
    if (onlyA.length || onlyB.length) {
      disagreements.push({
        id: row.id, category: row.category, stratum: row.stratum, a: [...A].sort(), b: [...B].sort(),
        only_a: onlyA, only_b: onlyB, status: "pending pharmacist adjudication",
      });
    }
  }
  const k = (v) => cohenKappa(v[0], v[1]);
  return {
    family: Object.fromEntries(Object.entries(vec).map(([f, v]) => [f, k(v)])),
    rule: Object.fromEntries(Object.entries(perRule).sort().map(([id, v]) => [id, k(v)])),
    any_flag: k(anyFlag),
    texts_with_disagreement: disagreements.length,
    disagreements,
  };
}

/** Deterministic 32-bit PRNG (mulberry32) seeded from a string via SHA-256. @param {string} seed */
export function seededRandom(seed) {
  let s = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stratified 50/50 split by category x stratum (overclaim / compliant) with a fixed seed. Within a stratum the ids are
 * sorted, shuffled (Fisher-Yates), and the first ceil(n/2) go to dev, so odd strata give dev one more.
 * @param {any[]} rows @param {string} [seed]
 */
export function split(rows, seed = SPLIT_SEED) {
  const rnd = seededRandom(seed);
  const groups = {};
  for (const r of rows) (groups[`${r.category}/${r.stratum}`] ||= []).push(r.id);
  const dev = [], heldout = [], strata = {};
  for (const key of Object.keys(groups).sort()) {
    const ids = groups[key].slice().sort();
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const nDev = Math.ceil(ids.length / 2);
    dev.push(...ids.slice(0, nDev)); heldout.push(...ids.slice(nDev));
    strata[key] = { dev: nDev, heldout: ids.length - nDev };
  }
  return { seed, method: "stratified by category x stratum; sorted ids, seeded Fisher-Yates, first ceil(n/2) -> dev", dev: dev.sort(), heldout: heldout.sort(), strata };
}

/** SHA-256 hex of a file's bytes. @param {string} file */
export const sha256File = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Text-detectable rules from the rule draft. @param {string} [file] */
export function loadTextRules(file = resolve(REPO, "tools", "pc-rules-draft.json")) {
  return JSON.parse(readFileSync(file, "utf8")).rules.filter(r => r.detect === "text").map(r => ({ id: r.id, family: r.family }));
}

function main(argv) {
  const args = argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const valued = new Set(["--labels-b", "--disagreements", "--split"]);
  const setFile = args.find((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
  if (!setFile) { console.error("usage: node tools/pc-texts.mjs SET.jsonl [--labels-b B.jsonl] [--disagreements OUT.jsonl] [--split OUT.json] [--json]"); return 2; }
  for (const p of [setFile, opt("--labels-b"), opt("--disagreements"), opt("--split")]) if (p) assertOutsideRepo(p);
  const textRules = loadTextRules();
  const rows = parseJsonl(readFileSync(setFile, "utf8"));
  const problems = validateSet(rows, new Set(textRules.map(r => r.id)));
  const report = { file: setFile, sha256: sha256File(setFile), problems, counts: counts(rows) };
  if (opt("--labels-b")) {
    const b = new Map(parseJsonl(readFileSync(opt("--labels-b"), "utf8")).map(x => [x.id, x.rule_ids]));
    const ag = agreement(rows, b, textRules);
    report.kappa = { family: ag.family, any_flag: ag.any_flag, rule: ag.rule, texts_with_disagreement: ag.texts_with_disagreement };
    if (opt("--disagreements")) writeFileSync(opt("--disagreements"), ag.disagreements.map(d => JSON.stringify(d)).join("\n") + "\n");
  }
  if (opt("--split")) {
    const s = split(rows);
    writeFileSync(opt("--split"), JSON.stringify(s, null, 1) + "\n");
    report.split = { file: opt("--split"), sha256: sha256File(opt("--split")), dev: s.dev.length, heldout: s.heldout.length, strata: s.strata };
  }
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${setFile}\n  sha256 ${report.sha256}\n  ${rows.length} texts, ${report.counts.flagged} with >= 1 rule, ${problems.length} problems`);
    for (const [k, v] of Object.entries(report.counts.stratum_category)) console.log(`  ${k.padEnd(22)} ${v}`);
    if (report.kappa) {
      for (const [f, v] of Object.entries(report.kappa.family)) console.log(`  kappa ${f.padEnd(4)} ${v.kappa.toFixed(3)} (n=${v.n} pairs, A=${v.a}, B=${v.b}, both=${v.both})`);
      console.log(`  kappa any-flag ${report.kappa.any_flag.kappa.toFixed(3)}; ${report.kappa.texts_with_disagreement} texts disagree`);
    }
    if (report.split) console.log(`  split dev ${report.split.dev} / held-out ${report.split.heldout}, sha256 ${report.split.sha256}`);
    for (const p of problems.slice(0, 20)) console.log("  ! " + p);
  }
  return problems.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv); } catch (e) { console.error(e.message); process.exitCode = 2; }
}
