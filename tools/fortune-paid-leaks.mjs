#!/usr/bin/env node
// tools/fortune-paid-leaks.mjs — the two fortune-paid leak counts on a LOCKED set (owner night order 2026-11-15, item 3).
//   node tools/fortune-paid-leaks.mjs [phase]      default phase: fortune-paid-fresh-2026-11-16
// Refuses to run unless ~/LENSIQ-field/evals/<phase>/{set.json, detect.json, README.md} are locked and committed
// (tools/eval-guard.mjs). Composes every reading of the set with the local composer (no network), splits it with the paid switch
// on (in this process only) and counts:
//   A  negative-state text in a paid part: detect.negative words, or text from a topic area fortune-negstate.js tags
//   B  caution or guidance text in a paid part: a caution-marked paragraph, text of a caution / restraining item or a caution
//      lead, text of a guidance field of the facts (advice meanings, feng-shui placement items, extras, plan), or
//      detect.caution / detect.guidance words
// Prints readings / parts per count and up to 40 examples; appends the result to <phase>/runs.log. Synthetic data.
import { createRequire } from "node:module";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const phase = process.argv[2] || "fortune-paid-fresh-2026-11-16";
const lock = assertLocked(phase, ["set.json", "detect.json", "README.md"]);
const dir = phaseDir(phase);
const SET = JSON.parse(readFileSync(join(dir, "set.json"), "utf8")), DET = JSON.parse(readFileSync(join(dir, "detect.json"), "utf8"));
for (const f of readdirSync(join(repo, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(join(repo, "i18n", f));
const FA = require(join(repo, "fortune-ai.js")), RD = require(join(repo, "fortune-read.js")), P = require(join(repo, "fortune-paid.js"));
const NS = require(join(repo, "fortune-negstate.js")), RS = require(join(repo, "fortune-restrain.js"));
const X = await import(join(repo, "tools", "fortune-review-export.mjs"));

const re = (o, l) => new RegExp(o[l], "i");
const flat = x => (Array.isArray(x) ? x.flatMap(flat) : x && typeof x === "object" ? Object.values(x).flatMap(flat) : typeof x === "string" ? [x] : []);
const tr = (d, it, l) => { try { return (l === "en" ? FA.en.item(d, it) : l === "zh" ? FA.zh.item(d, it) : it) || it; } catch (e) { return it; } };
function frags(m, l) {
  m = String(m || "").trim();
  if (l === "zh") return m.split(/[，。；！？、：:]/).map(x => x.trim()).filter(x => x.length >= 8);
  if (l === "en") return m.split(/[,;:.!?]\s+|\s+(?:and|but|so|or)\s+/).map(x => x.trim().toLowerCase()).filter(x => x.length >= 25);
  return m.split(/\s+/).filter(x => x.length >= 14);
}
const has = (t, q, l) => (l === "en" ? String(t).toLowerCase().includes(q) : String(t).includes(q));
const PLACEMENT = /^(?:dir|rec|room|photo|year|month)\./;
const leadsOf = l => [...new Set(flat(FA.straight.LEADS[l]).concat(flat((FA.straight.NATAL_LEADS || {})[l]), flat(FA._internal.cautionLeads(l))))]
  .map(s => s.replace(/[.。]$/, "")).filter(s => s.length >= 10);
const LEADS = Object.fromEntries(["th", "en", "zh"].map(l => [l, leadsOf(l)]));

const out = { phase, lock: lock.lockCommit, readings: 0, partsPaid: 0, A: { readings: 0, parts: 0 }, B: { readings: 0, parts: 0 }, ex: [] };
for (const c of SET.cells) {
  const r = X.lcg(c.lcg); let got = 0;
  for (let i = c.from; i < c.from + 600 && got < c.want; i++) {
    let f; try { f = X.factsFor(c.d, i, r); } catch (e) { continue; }
    const res = FA.compose(f, { seed: c.composeSeed + i, lang: c.lang, straight: c.straight });
    if (!res || res.crisis || !(res.sections || []).length) continue;
    got++; out.readings++;
    const d = f.domain || c.d, l = c.lang;
    const neg = [], caut = [], guide = [];
    for (const it of f.items || []) {
      const ms = (tr(d, it, l) || {}).meanings || {};
      const na = NS.of(d, it); if (na) for (const a of na) neg.push(...[].concat(ms[a] || []));
      const rt = RS.of(d, it), isC = it.tone === "caution" || it.polarity === "challenge" || (c.straight && FA.straight.LABEL_NEG.test(String(it.label || "")));
      if (isC || rt === "all") caut.push(...Object.values(ms).flatMap(flat)); else if (Array.isArray(rt)) for (const a of rt) caut.push(...[].concat(ms[a] || []));
      if (d === "fengshui" && PLACEMENT.test(String(it.id || ""))) guide.push(...Object.values(ms).flatMap(flat)); else guide.push(...[].concat(ms.advice || []));
      if (d === "fengshui" && /^kua\./.test(String(it.id || ""))) guide.push(...[].concat(ms.overview || []));
    }
    const ex = f.extras || {}; for (const k of ["luckyColors", "directions", "energyWords", "tips", "restrainTips"]) guide.push(...flat(ex[k]));
    guide.push(...((res.plan && res.plan.items) || []).map(x => String(x.t || "")));
    const NF = [...new Set(neg.flatMap(m => frags(m, l)))], CF = [...new Set(caut.flatMap(m => frags(m, l)))], GF = [...new Set(guide.flatMap(m => frags(m, l)))];
    globalThis.LENSIQ_FORTUNE_PAID = true;
    let sp; try { sp = P.split(res, { lang: l, straight: c.straight }); } finally { delete globalThis.LENSIQ_FORTUNE_PAID; }
    let a = false, b = false;
    res.sections.forEach((s, k) => {
      const parts = RD.planSection(s, l), paid = sp.groups[k].paid;
      for (const t of paid) {
        out.partsPaid++;
        const pa = parts.find(p => p.text === t);
        const wA = (t.match(re(DET.negative, l)) || [])[0] || NF.find(q => has(t, q, l));
        const wB = (pa && s.caution && s.caution[pa.para] ? "caution-marked paragraph" : "") || LEADS[l].find(q => t.includes(q)) || CF.find(q => has(t, q, l)) ||
          GF.find(q => has(t, q, l)) || (t.match(re(DET.caution, l)) || [])[0] || (t.match(re(DET.guidance, l)) || [])[0];
        if (wA) { out.A.parts++; a = true; if (out.ex.length < 40) out.ex.push(`A ${c.d} ${l} ${c.straight ? "S" : "G"} ${s.id} [${String(wA).slice(0, 30)}] ${t.slice(0, 110)}`); }
        if (wB) { out.B.parts++; b = true; if (out.ex.length < 40) out.ex.push(`B ${c.d} ${l} ${c.straight ? "S" : "G"} ${s.id} [${String(wB).slice(0, 30)}] ${t.slice(0, 110)}`); }
      }
    });
    if (a) out.A.readings++; if (b) out.B.readings++;
  }
}
const line = `${new Date().toISOString()} ${phase} lock ${out.lock}: readings ${out.readings}, paid parts ${out.partsPaid}, ` +
  `A negative-state ${out.A.readings} readings / ${out.A.parts} parts, B caution-guidance ${out.B.readings} readings / ${out.B.parts} parts`;
console.log(line); for (const e of out.ex) console.log("  " + e);
appendFileSync(join(dir, "runs.log"), line + "\n");
