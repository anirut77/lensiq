#!/usr/bin/env node
// tools/pc-advert-eval.mjs — Product Check "advert" capture (adverts option B, on-device rules only): DEV-split figures for
// tuning the over-claim rules as the advert card runs them (LQClaims.detect with kind "ad").
//
//   node tools/pc-advert-eval.mjs                 dev split of the P3 text set, both category modes, summary
//        [--misses]            also list the dev misses / false flags (unknown-category mode), for tuning
//        [--data DIR]          default ~/LENSIQ-field/product-check/texts (set.jsonl, split.json)
//        [--log FILE]          run log (appended), default ~/LENSIQ-field/evals/adverts/dev-runs.jsonl
//        [--json]              machine-readable summary
//
// DEV ONLY, by design: this tool refuses any other split and any data folder named texts-fresh. The P3 held-out split is
// spent, and the fresh advert set (~/LENSIQ-field/product-check/texts-fresh/) is scored once, blind, by a separate agent.
// Source of every figure: public-dataset quotes (P3 set), labels by an AI agent (agentA), dev split = the tuning set, so
// the figures are NOT independent. Data and logs stay outside the repo.
//
// Modes: "labelled" = the row's category is given (the user picked the product type on the card); "auto" = the card's
// default (LQPCAdvert.analyze: product type guessed from cue words, every family when unsure); "unknown" = no category and
// no guess (LQClaims.detect alone: the rules of every family run). Measures:
//   - pairs: (text, rule) recall / precision vs agentA over the rules in the row's category scope (as tools/pc-claims-eval)
//   - over-claim texts: share of over-claim texts with at least one expected rule where at least one expected rule is shown
//   - false flags per 100 compliant texts: every rule the card would show on a text with no expected rule
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

const pct = (/** @type {number|null} */ x) => (x == null ? "—" : (100 * x).toFixed(1) + " %");
const ci = (/** @type {number[]} */ c) => `[${(100 * c[0]).toFixed(1)}, ${(100 * c[1]).toFixed(1)}]`;

function main() {
  const args = process.argv.slice(2);
  const opt = (/** @type {string} */ k, /** @type {string|undefined} */ d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (opt("--split") && opt("--split") !== "dev") { console.error("pc-advert-eval: dev split only (held-out is spent; the fresh set is scored by a separate agent)"); process.exit(2); }
  const dir = resolve(opt("--data", join(homedir(), "LENSIQ-field", "product-check", "texts")) || "");
  const log = resolve(opt("--log", join(homedir(), "LENSIQ-field", "evals", "adverts", "dev-runs.jsonl")) || "");
  /** @type {any} */ let res;
  try { assertOutsideRepo(dir); assertOutsideRepo(log); res = runDev(dir); } catch (e) { console.error(String(/** @type {any} */ (e).message || e)); process.exit(2); }
  const hashes = { rules_sha256: sha256File(join(REPO, "lensiq-claims-rules.js")), engine_sha256: sha256File(join(REPO, "lensiq-claims.js")) };
  /** @type {Record<string, any>} */ const summary = { at: new Date().toISOString(), source: SOURCE, data: basename(dir), split: "dev", texts: res.texts, ...hashes };
  for (const m of MODES) {
    const p = res[m].pairs.overall, t = res[m].text;
    summary[m] = { pairs: { tp: p.tp, fp: p.fp, fn: p.fn, recall: p.recall, precision: p.precision },
      overclaim_texts: { n: t.overclaim.n, hit: t.overclaim.hit, recall: t.overclaim.recall },
      compliant: { n: t.compliant.n, flags: t.compliant.flags, per100: t.compliant.per100, flagged: t.compliant.flagged } };
  }
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
