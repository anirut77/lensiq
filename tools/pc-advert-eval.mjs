#!/usr/bin/env node
// tools/pc-advert-eval.mjs — Product Check "advert" capture (adverts option B, on-device rules only): DEV-split figures for
// tuning the over-claim rules as the advert card runs them (LQClaims.detect with kind "ad").
//
//   node tools/pc-advert-eval.mjs                 dev split of the P3 text set, both category modes, summary
//        [--misses]            also list the dev misses / false flags (unknown-category mode), for tuning
//        [--data DIR]          default ~/LENSIQ-field/product-check/texts (set.jsonl, split.json)
//        [--log FILE]          run log (appended), default ~/LENSIQ-field/evals/adverts/dev-runs.jsonl
//        [--json]              machine-readable summary
//   node tools/pc-advert-eval.mjs --fresh [DIR]   the SPENT first fresh advert set (default ~/LENSIQ-field/evals/adverts/fresh:
//        blind-input.jsonl, labels-A.jsonl, labels-B.jsonl), consensus rule (both labellers), modes "released" (product type
//        chosen by the user = the row's category, as the page runs) and "default" (no type: guessed, else every family);
//        by language and category; [--misses] lists the released-mode misses / false flags. Also takes the spent fresh2
//        folder (--fresh ~/LENSIQ-field/evals/adverts/fresh2). Refuses texts-fresh* / fresh3+.
//
// DEV ONLY, by design: this tool refuses any other split, any data folder named texts-fresh* and any later locked set
// (fresh3+). The first fresh set and fresh2 are spent (one independent run each, 2026-11-11) and are development sets
// now. The P3 held-out split is spent; the next locked set (texts-fresh-3) is scored once, blind, by a separate agent.
// Source of every figure: public-dataset quotes (P3 set), labels by an AI agent (agentA), dev split = the tuning set, so
// the figures are NOT independent. Data and logs stay outside the repo.
//
// Modes: "labelled" = the row's category is given (the user picked the product type on the card); "auto" = the card's
// default (LQPCAdvert.analyze: product type guessed from cue words, every family when unsure); "unknown" = no category and
// no guess (LQClaims.detect alone: the rules of every family run). Measures:
//   - pairs: (text, rule) recall / precision vs agentA over the rules in the row's category scope (as tools/pc-claims-eval)
//   - over-claim texts: share of over-claim texts with at least one expected rule where at least one expected rule is shown
//   - false flags per 100 compliant texts: every rule the card would show on a text with no expected rule
import { appendFileSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, EVALS_ROOT, phaseOf } from "./eval-guard.mjs";
import { assertOutsideRepo, REPO, score, sha256File, wilson } from "./pc-claims-eval.mjs";

const req = createRequire(import.meta.url);
const LQClaims = req("../lensiq-claims.js");
const LQPCAdvert = req("../lensiq-pc-advert.js");
export const MODES = ["labelled", "auto", "unknown"];
export const SOURCE = "dev, synthetic/public quotes, not independent (P3 public-dataset texts, agentA labels, tuning split)";

const readJsonl = (/** @type {string} */ p) => readFileSync(p, "utf8").split("\n").filter(l => l.trim()).map(l => JSON.parse(l));

/**
 * Text-level measures. @param {Array<{stratum?: string, expected: string[], predicted: string[]}>} rows
 */
export function textMeasures(rows) {
  const over = rows.filter(r => r.stratum === "overclaim" && r.expected.length);
  const hit = over.filter(r => r.expected.some(i => r.predicted.includes(i))).length;
  const anyFlag = over.filter(r => r.predicted.length).length;
  const clean = rows.filter(r => !r.expected.length);
  const flags = clean.reduce((a, r) => a + r.predicted.length, 0);
  const flagged = clean.filter(r => r.predicted.length).length;
  return {
    overclaim: { n: over.length, hit, recall: over.length ? hit / over.length : null, ci: wilson(hit, over.length), anyFlag },
    compliant: { n: clean.length, flags, per100: clean.length ? 100 * flags / clean.length : null, flagged, flagged_ci: wilson(flagged, clean.length) }
  };
}

/**
 * Is dir the evals folder or inside it? Decided on real paths (realpathSync.native: symlinks resolved, and on a
 * case-insensitive disk the stored case), so a symlink or a case-different path cannot skip the guard.
 * @param {string} dir @param {string} [root]
 */
export function inEvalsFolder(dir, root = EVALS_ROOT) {
  const real = (/** @type {string} */ p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };
  const d = real(dir), r = real(root);
  return d === r || d.startsWith(r.endsWith(sep) ? r : r + sep);
}

/** Dev split only. @param {string} dir */
export function runDev(dir) {
  assertOutsideRepo(dir);
  if (/texts-fresh/.test(resolve(dir))) throw new Error("refusing texts-fresh: the fresh set is scored once by a separate agent, never used here");
  const set = readJsonl(join(dir, "set.jsonl"));
  const sp = JSON.parse(readFileSync(join(dir, "split.json"), "utf8"));
  const ids = new Set(sp.dev || []);
  if (!ids.size) throw new Error("split.json has no dev list");
  const dev = set.filter(r => ids.has(r.id));
  /** @type {Record<string, any>} */ const out = { texts: dev.length };
  for (const mode of MODES) {
    const rows = dev.map(r => {
      const flags = mode === "unknown" ? LQClaims.detect(r.text, { lang: r.lang, kind: "ad" })
        : LQPCAdvert.analyze(r.text, { category: mode === "labelled" ? r.category : undefined }).flags;
      return { id: r.id, lang: r.lang, category: r.category, stratum: r.stratum, text: r.text, expected: /** @type {string[]} */ (r.expected_rule_ids || []),
        predicted: /** @type {string[]} */ ([...new Set(flags.map((/** @type {any} */ f) => f.rule_id))]), flags };
    });
    out[mode] = { rows, pairs: score(rows), text: textMeasures(rows) };
  }
  return out;
}

/** Folders that hold locked, unscored sets: never read here. @param {string} dir */
export function assertNotLocked(dir) {
  // spent and allowed for development: evals/adverts/fresh (first set), evals/adverts/fresh2 (spent 2026-11-11).
  // Never: the texts-fresh* collection folders (texts-fresh-3 is the coming held-out set), fresh3+, any held-out split.
  if (/texts-fresh|fresh-?[3-9]|held-?out/i.test(resolve(dir))) {
    throw new Error("refusing a locked set (texts-fresh*, fresh3+, held-out): scored once by a separate agent, never used here");
  }
}

/**
 * Fresh-set measures (as the independent scorer of 2026-11-11 counts them): "overclaim" = both labellers flagged, "compliant"
 * = both empty, the rest "disagree" (left out of recall and false flags). @param {any[]} rows
 */
export function freshMeasures(rows) {
  const over = rows.filter(r => r.cls === "overclaim"), comp = rows.filter(r => r.cls === "compliant");
  const hitAny = over.filter(r => r.predicted.length).length;
  const hitCons = over.filter(r => r.consensus.some((/** @type {string} */ i) => r.predicted.includes(i))).length;
  const flags = comp.reduce((a, r) => a + r.predicted.length, 0);
  const flagged = comp.filter(r => r.predicted.length).length;
  let tp = 0, fp = 0, fn = 0;
  for (const r of rows) {
    for (const i of r.predicted) if (r.consensus.includes(i)) tp++; else fp++;
    for (const i of r.consensus) if (!r.predicted.includes(i)) fn++;
  }
  return { overclaim: over.length, hit_any: hitAny, recall_any: over.length ? hitAny / over.length : null, recall_any_ci: wilson(hitAny, over.length),
    hit_consensus_rule: hitCons, recall_consensus_rule: over.length ? hitCons / over.length : null,
    rule: { tp, fp, fn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null },
    compliant: comp.length, flags, per100: comp.length ? 100 * flags / comp.length : null, flagged };
}

/** The spent first fresh set, both modes, with breakdowns. @param {string} dir */
export function runFresh(dir) {
  assertOutsideRepo(dir);
  assertNotLocked(dir);
  const input = readJsonl(join(dir, "blind-input.jsonl"));
  const ids = (/** @type {any} */ r) => [...new Set(((r && r.rules) || []).map((/** @type {any} */ x) => String(x.rule_id)))];
  const A = new Map(readJsonl(join(dir, "labels-A.jsonl")).map(r => [r.id, ids(r)]));
  const B = new Map(readJsonl(join(dir, "labels-B.jsonl")).map(r => [r.id, ids(r)]));
  /** @type {Record<string, any>} */ const out = { texts: input.length };
  for (const mode of ["released", "default"]) {
    const rows = input.map(r => {
      const a = A.get(r.id) || [], b = B.get(r.id) || [];
      const res = LQPCAdvert.analyze(r.text, { category: mode === "released" ? r.category : undefined });
      return { id: r.id, lang: r.lang, category: r.category, text: r.text, flags: res.flags,
        cls: a.length && b.length ? "overclaim" : !a.length && !b.length ? "compliant" : "disagree",
        consensus: a.filter(x => b.includes(x)), A: a, B: b,
        predicted: /** @type {string[]} */ ([...new Set(res.flags.map((/** @type {any} */ f) => f.rule_id))]) };
    });
    /** @type {Record<string, any>} */ const by = { overall: freshMeasures(rows) };
    for (const l of ["th", "en", "zh"]) by["lang " + l] = freshMeasures(rows.filter(r => r.lang === l));
    for (const c of ["supplement", "food", "herbal", "drug", "cosmetic"]) by["cat " + c] = freshMeasures(rows.filter(r => r.category === c));
    out[mode] = { rows, by };
  }
  return out;
}

/** Dev split breakdown by language and category (agentA labels). @param {any[]} rows */
function devBreakdown(rows) {
  /** @type {Record<string, any>} */ const by = {};
  const one = (/** @type {any[]} */ rs) => {
    const t = textMeasures(rs), p = score(rs).overall;
    const over = rs.filter(r => r.stratum === "overclaim" && r.expected.length);
    return { overclaim: over.length, any: over.filter(r => r.predicted.length).length, hit: t.overclaim.hit, rule_recall: p.recall, rule_precision: p.precision,
      compliant: t.compliant.n, flags: t.compliant.flags, per100: t.compliant.per100 };
  };
  by.overall = one(rows);
  for (const l of ["th", "en", "zh"]) by["lang " + l] = one(rows.filter(r => r.lang === l));
  for (const c of ["supplement", "food", "herbal", "drug", "cosmetic"]) by["cat " + c] = one(rows.filter(r => r.category === c));
  return by;
}

const pct = (/** @type {number|null} */ x) => (x == null ? "—" : (100 * x).toFixed(1) + " %");
const ci = (/** @type {number[]} */ c) => `[${(100 * c[0]).toFixed(1)}, ${(100 * c[1]).toFixed(1)}]`;

function main() {
  const args = process.argv.slice(2);
  const opt = (/** @type {string} */ k, /** @type {string|undefined} */ d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (opt("--split") && opt("--split") !== "dev") { console.error("pc-advert-eval: dev split only (held-out is spent; the fresh set is scored by a separate agent)"); process.exit(2); }
  const dir = resolve(opt("--data", join(homedir(), "LENSIQ-field", "product-check", "texts")) || "");
  const log = resolve(opt("--log", join(homedir(), "LENSIQ-field", "evals", "adverts", "dev-runs.jsonl")) || "");
  if (args.includes("--fresh")) return mainFresh(args, opt, log);
  /** @type {any} */ let res;
  try {
    assertOutsideRepo(dir); assertOutsideRepo(log); assertNotLocked(dir);
    // eval-guard (owner rule 2026-11-13): a dev set kept in the evals folder must be locked and committed like any other set
    if (inEvalsFolder(dir)) {
      const g = assertLocked(phaseOf(dir), ["set.jsonl", "split.json"]);
      console.error(`eval-guard OK: phase ${g.phase}, ${g.files.length} files in ${g.lockFile} (commit ${g.lockCommit})`);
    }
    res = runDev(dir);
  } catch (e) { console.error(String(/** @type {any} */ (e).message || e)); process.exit(2); }
  const hashes = { rules_sha256: sha256File(join(REPO, "lensiq-claims-rules.js")), engine_sha256: sha256File(join(REPO, "lensiq-claims.js")) };
  /** @type {Record<string, any>} */ const summary = { at: new Date().toISOString(), source: SOURCE, data: basename(dir), split: "dev", texts: res.texts, ...hashes };
  for (const m of MODES) {
    const p = res[m].pairs.overall, t = res[m].text;
    summary[m] = { pairs: { tp: p.tp, fp: p.fp, fn: p.fn, recall: p.recall, precision: p.precision },
      overclaim_texts: { n: t.overclaim.n, hit: t.overclaim.hit, recall: t.overclaim.recall },
      compliant: { n: t.compliant.n, flags: t.compliant.flags, per100: t.compliant.per100, flagged: t.compliant.flagged },
      by: devBreakdown(res[m].rows) };
  }
  summary.advert_sha256 = sha256File(join(REPO, "lensiq-pc-advert.js"));
  mkdirSync(dirname(log), { recursive: true });
  appendFileSync(log, JSON.stringify(summary) + "\n");
  if (args.includes("--json")) { console.log(JSON.stringify(summary, null, 1)); return; }
  console.log(`# Advert rules, ${SOURCE}\nlensiq-claims-rules.js sha256 ${hashes.rules_sha256}\nlensiq-claims.js sha256 ${hashes.engine_sha256}\nlogged to ${log}\n`);
  console.log("| Mode | Pairs recall [95 % CI] | Pairs precision | Over-claim texts caught [95 % CI] | False flags / 100 compliant | Compliant texts flagged [95 % CI] |");
  console.log("|---|---|---|---|---|---|");
  for (const m of MODES) {
    const p = res[m].pairs.overall, t = res[m].text;
    console.log(`| ${m} | ${pct(p.recall)} ${ci(p.recall_ci)} (${p.tp}/${p.tp + p.fn}) | ${pct(p.precision)} (${p.tp}/${p.tp + p.fp}) | ` +
      `${pct(t.overclaim.recall)} ${ci(t.overclaim.ci)} (${t.overclaim.hit}/${t.overclaim.n}) | ` +
      `${t.compliant.per100 == null ? "—" : t.compliant.per100.toFixed(1)} (${t.compliant.flags} on ${t.compliant.n}) | ${t.compliant.flagged}/${t.compliant.n} ${ci(t.compliant.flagged_ci)} |`);
  }
  console.log("\n| Mode | Slice | Over-claim texts with >= 1 signal | with an expected rule | Rule recall / precision | False flags / 100 compliant |\n|---|---|---|---|---|---|");
  for (const m of ["labelled", "auto"]) {
    for (const [k, v] of Object.entries(summary[m].by)) {
      console.log(`| ${m} | ${k} | ${v.any}/${v.overclaim} | ${v.hit}/${v.overclaim} | ${pct(v.rule_recall)} / ${pct(v.rule_precision)} | ` +
        `${v.per100 == null ? "—" : v.per100.toFixed(1)} (${v.flags} on ${v.compliant}) |`);
    }
  }
  if (args.includes("--misses")) {
    for (const m of MODES) {
      console.log(`\n## dev misses / false flags, ${m} mode (vs agentA)`);
      for (const r of res[m].rows) {
        const fn = r.expected.filter((/** @type {string} */ i) => !r.predicted.includes(i));
        const fp = r.predicted.filter((/** @type {string} */ i) => !r.expected.includes(i));
        if (!fn.length && !fp.length) continue;
        const found = r.flags.filter((/** @type {any} */ f) => fp.includes(f.rule_id)).map((/** @type {any} */ f) => `${f.rule_id}:"${f.text || f.evidence}"`).join(" ");
        console.log(`${r.id} [${r.category}/${r.stratum}/${r.lang}] FN ${fn.join(",") || "-"} FP ${fp.join(",") || "-"} ${found}\n   ${r.text.replace(/\s+/g, " ").slice(0, 400)}`);
      }
    }
  }
}

/** @param {string[]} args @param {Function} opt @param {string} log */
function mainFresh(args, opt, log) {
  const i = args.indexOf("--fresh");
  const next = args[i + 1];
  const dir = resolve(next && !next.startsWith("--") ? next : join(homedir(), "LENSIQ-field", "evals", "adverts", "fresh"));
  /** @type {any} */ let res;
  try {
    assertOutsideRepo(log);
    // eval-guard (owner rule 2026-11-13): the set is in ~/LENSIQ-field/evals/<phase>/ and its hashes are committed in evals-locks/
    const g = assertLocked(phaseOf(dir), ["blind-input.jsonl", "labels-A.jsonl", "labels-B.jsonl"]);
    console.error(`eval-guard OK: phase ${g.phase}, ${g.files.length} files in ${g.lockFile} (commit ${g.lockCommit})`);
    res = runFresh(dir);
  } catch (e) { console.error(String(/** @type {any} */ (e).message || e)); process.exit(2); }
  const hashes = { rules_sha256: sha256File(join(REPO, "lensiq-claims-rules.js")), engine_sha256: sha256File(join(REPO, "lensiq-claims.js")),
    advert_sha256: sha256File(join(REPO, "lensiq-pc-advert.js")) };
  const src = `dev: SPENT advert set ${basename(dir)} (its one independent run is done), consensus of labellers A and B; tuning data now, not independent`;
  /** @type {Record<string, any>} */ const summary = { at: new Date().toISOString(), source: src, data: "adverts/" + basename(dir), split: "spent-fresh",
    texts: res.texts, ...hashes };
  for (const m of ["released", "default"]) summary[m] = Object.fromEntries(Object.entries(res[m].by).map(([k, v]) => [k, { ...v, recall_any_ci: undefined }]));
  mkdirSync(dirname(log), { recursive: true });
  appendFileSync(log, JSON.stringify(summary) + "\n");
  if (args.includes("--json")) { console.log(JSON.stringify(summary, null, 1)); return; }
  console.log(`# Advert rules on the spent fresh set, ${src}\nlensiq-claims-rules.js sha256 ${hashes.rules_sha256}\nlensiq-pc-advert.js sha256 ${hashes.advert_sha256}\nlogged to ${log}\n`);
  console.log("| Mode | Slice | Recall: >= 1 signal | Consensus-rule recall | Rule precision / recall vs consensus | False flags / 100 compliant | Compliant flagged |\n|---|---|---|---|---|---|---|");
  for (const m of ["released", "default"]) {
    for (const [k, v] of Object.entries(res[m].by)) {
      const all = `${pct(v.recall_any)}${k === "overall" ? " " + ci(v.recall_any_ci) : ""} (${v.hit_any}/${v.overclaim})`;
      console.log(`| ${m} | ${k} | ${all} | ${pct(v.recall_consensus_rule)} (${v.hit_consensus_rule}/${v.overclaim}) | ` +
        `${pct(v.rule.precision)} (${v.rule.tp}/${v.rule.tp + v.rule.fp}) / ${pct(v.rule.recall)} (${v.rule.tp}/${v.rule.tp + v.rule.fn}) | ` +
        `${v.per100 == null ? "—" : v.per100.toFixed(1)} (${v.flags} on ${v.compliant}) | ${v.flagged}/${v.compliant} |`);
    }
  }
  if (args.includes("--misses")) {
    console.log("\n## released-mode misses / false flags (vs consensus; disagreements marked)");
    for (const r of res.released.rows) {
      const fn = r.consensus.filter((/** @type {string} */ x) => !r.predicted.includes(x));
      const fp = r.predicted.filter((/** @type {string} */ x) => !r.consensus.includes(x));
      if (!fn.length && !fp.length) continue;
      const found = r.flags.filter((/** @type {any} */ f) => fp.includes(f.rule_id)).map((/** @type {any} */ f) => `${f.rule_id}:"${f.evidence}"`).join(" ");
      console.log(`${r.id} [${r.category}/${r.cls}/${r.lang}] A ${r.A.join(",") || "-"} B ${r.B.join(",") || "-"} ` +
        `FN ${fn.join(",") || "-"} FP ${fp.join(",") || "-"} ${found}\n   ${r.text.replace(/\s+/g, " ").slice(0, 400)}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
