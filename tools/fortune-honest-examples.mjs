#!/usr/bin/env node
// tools/fortune-honest-examples.mjs — the before/after examples for docs/FORTUNE-HONEST-READINGS.md (owner order 2026-11-12, Part C).
// Every example is produced by the real code path (FortuneAI.compose, the same call the pages make) on fixed inputs:
// engine-built facts from tools/fortune-review-export.mjs factsFor(domain, i, lcg(seed)), the first fact set whose topic is the
// one wanted and that has a finding the discipline marks unfavourable, then composed twice with the same seed:
//   gentle  = { straight: false }  (what users get today, and what anyone gets who has not confirmed they are an adult)
//   straight = { straight: true }  (the proposed "read it straight" wording)
// Only the paragraphs that differ are printed. Every sentence of the straight text is checked against the hard limits
// (FortuneAI.straight.hardLimit) and the straight safety filter; the result is printed per example.
// Readings that mention dates or ages depend on today's date, so re-running on another day can change those words.
//   node tools/fortune-honest-examples.mjs > /tmp/examples.md
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
for (const f of readdirSync(join(repo, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(join(repo, "i18n", f));
const FA = require(join(repo, "fortune-ai.js"));
const X = await import(join(repo, "tools", "fortune-review-export.mjs"));
const TOPICS = ["overall", "love", "work", "money"];
const isCaution = it => it.tone === "caution" || it.polarity === "challenge";

export const EXAMPLES = [
  { n: 1, d: "bazi", lang: "th", topic: "money", seed: 11 },
  { n: 2, d: "taksa", lang: "th", topic: "overall", seed: 12 },
  { n: 3, d: "lek7", lang: "th", topic: "work", seed: 13 },
  { n: 4, d: "zodiac", lang: "th", topic: "love", seed: 14 },
  { n: 5, d: "horoscope", lang: "th", topic: "overall", seed: 15 },
  { n: 6, d: "numbers", lang: "th", topic: "work", seed: 16 },
  { n: 7, d: "tarot", lang: "en", topic: "love", seed: 17 },
  { n: 8, d: "bazi", lang: "en", topic: "work", seed: 18 },
  { n: 9, d: "zodiac", lang: "zh", topic: "money", seed: 19 },
  { n: 10, d: "horoscope", lang: "zh", topic: "overall", seed: 20 },
];

function factsFor(d, topic) {
  const r = X.lcg(2026 + d.length * 101);
  for (let i = 0; i < 400; i++) {
    const f = X.factsFor(d, i, r);
    if (TOPICS[i % 4] === topic && (f.items || []).some(isCaution)) return { f, i };
  }
  throw new Error("no fact set for " + d + "/" + topic);
}
const paras = res => (res.sections || []).flatMap(s => (s.paragraphs || []).map(p => ({ id: s.id, title: s.title, p })));

export function build(ex) {
  const { f, i } = factsFor(ex.d, ex.topic);
  const g = FA.compose(f, { seed: ex.seed, lang: ex.lang, straight: false }), s = FA.compose(f, { seed: ex.seed, lang: ex.lang, straight: true });
  const G = paras(g), S = paras(s), gSet = new Set(G.map(x => x.p)), sSet = new Set(S.map(x => x.p));
  // the paragraph that carries the straight lead (and its gentle counterpart) is shown first
  const leads = Object.values(FA.straight.LEADS[ex.lang]).flat(), hasLead = x => leads.some(l => x.p.includes(l.replace(/[.。]$/, "")));
  const firstBy = (list, f) => list.filter(f).concat(list.filter(x => !f(x)));
  const after = firstBy(S.filter(x => !gSet.has(x.p)), hasLead);
  const ids = new Set(after.slice(0, 2).map(x => x.id)), before = firstBy(G.filter(x => !sSet.has(x.p)), x => ids.has(x.id));
  const limits = new Set(), unsafe = [];
  for (const x of S) for (const t of FA.safety.sentences(x.p)) { const h = FA.straight.hardLimit(t); if (h) limits.add(h); if (!FA.straight.isSafe(t)) unsafe.push(t); }
  const cautions = f.items.filter(isCaution).map(it => it.label || it.id);
  return { ex, i, cautions, before, after, limits: [...limits], unsafe, gMode: g.mode, sMode: s.mode };
}

function md(r) {
  const { ex } = r, L = [];
  L.push(`### ${ex.n}. ${ex.d} · ${ex.lang.toUpperCase()} · topic ${ex.topic}`);
  L.push("", `Input: \`factsFor("${ex.d}", ${r.i}, lcg(${2026 + ex.d.length * 101}))\`, seed ${ex.seed}. Unfavourable finding(s) by the discipline's rules: ${r.cautions.join("; ")}.`, "");
  L.push("**Before (today, gentle):**", "");
  for (const x of r.before.slice(0, 2)) L.push("> [" + (x.title || x.id) + "] " + x.p, ">");
  if (L[L.length - 1] === ">") L.pop();
  L.push("", "**After (straight):**", "");
  for (const x of r.after.slice(0, 2)) L.push("> [" + (x.title || x.id) + "] " + x.p, ">");
  if (L[L.length - 1] === ">") L.pop();
  L.push("", `Hard limit hit in the straight text: ${r.limits.length ? r.limits.join(", ") : "none"} · sentences failing the straight filter: ${r.unsafe.length}`, "");
  return L.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = [];
  for (const ex of EXAMPLES) out.push(md(build(ex)));
  // gentle-mode example: an adult who has not confirmed (or a visitor under 18) gets exactly the gentle text
  const ex = { n: 11, d: "bazi", lang: "th", topic: "money", seed: 11 };
  const { f } = factsFor(ex.d, ex.topic);
  globalThis.LENSIQ_FORTUNE_STRAIGHT = true;
  const store = new Map(); globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  FA.straight.set({ adult: false, straight: true });
  const r = FA.compose(f, { seed: ex.seed, lang: ex.lang });
  const g = FA.compose(f, { seed: ex.seed, lang: ex.lang, straight: false });
  const same = X.readingText(r) === X.readingText(g);
  const first = paras(r).find(x => /ควร|ตำรา/.test(x.p)) || paras(r)[0];
  out.push(`### Gentle-mode example (flag on, adult NOT confirmed) · bazi · TH · topic money`, "",
    `Same input as example 1. Mode: ${r.mode}; identical to today's gentle reading: ${same ? "yes" : "NO"}.`, "", "> [" + (first.title || first.id) + "] " + first.p, "");
  console.log(out.join("\n"));
}
