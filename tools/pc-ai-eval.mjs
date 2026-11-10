#!/usr/bin/env node
// tools/pc-ai-eval.mjs — P8 eval runner for the Product Check AI features (round 17 P7 builds it; the owner runs it with
// keys in P8). For EVERY configured model (each priced {provider, model} of backend/src/ai/adapters/prices.js, or
// --models) it puts that one model in the chain of pc_fields / pc_claims / pc_translate in the LOCAL D1, asks the LOCAL
// `wrangler dev` Worker over the real route (POST /v1/ai/<feature>: same gateway code, schema + verify checks), and
// reports per model and feature: accuracy / recall, cost (from the gateway's own settled cost) and latency.
//
//   node tools/pc-ai-eval.mjs [--base http://127.0.0.1:8787] [--origin http://localhost:8000]
//        [--models anthropic:claude-haiku-5-5,openai:gpt-6-luna]   default: every priced model ("*" rows skipped)
//        [--features pc_fields,pc_claims,pc_translate] [--limit N]  N items per set (cheap smoke run)
//        [--budget 50] [--per-model 10]                            USD; the run stops a model at its cap, everything at the budget
//        [--claims-data ~/LENSIQ-field/product-check/texts]       the P3 text set (outside the repo); held-out split only
//        [--out field-data/eval]                                  JSON + Markdown summary (git-ignored)
// Test sets (fixed before any run): docs/product-check/p7-ai-testset.json (pc_fields, pc_translate; synthetic) and the
// P3 held-out split (pc_claims; public dataset labelled by two AI agents, pharmacist adjudication pending): recall of the
// on-device rules alone vs on-device + AI (the uplift; P3 measured 65.5 % vs the 80 % target).
// Safety: refuses CI, a non-localhost base, and runs without AI_EVAL_LOCAL=1 (no settled cost = caps cannot be kept).
// Local evaluation mode (AI_EVAL_LOCAL=1, a localhost Worker URL AND a localhost Origin; owner decision 2026-11-10) is also what lets the P3
// advert snippets and short fragments through: in that mode ONLY the Worker skips its product-label filter (no label
// evidence / personal-document sign). The name guard and the dispensing refusal still apply: such an item is answered
// `bad_input` before any provider call and is counted here as a 0-cost fallback. Each feature row reports
// `label_filter_skipped` = items the filter would refuse on a deployed Worker (LQPCGuard.aiGate, same function).
// Providers without a key (or a required setting) are skipped: GET /v1/ai/providers shows an empty chain for them.
// Every text goes through lensiq-pc-guard.js first, as on the page. Never prints a key, a label text or a held-out text.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PC_FEATURES, REPO, TRIAL, assertLocalBase, assertNotCI, buildSettings, execLocal, settingsSql } from "./lib/ai-trial.mjs";

const require = createRequire(import.meta.url);
const Guard = require("../lensiq-pc-guard.js");
export const SOURCES = { pc_fields: "synthetic", pc_translate: "synthetic", pc_claims: "public dataset (labelled by two AI agents, pending pharmacist adjudication)" };

/* ---------------- scoring (pure) ---------------- */
export const norm = s => String(s == null ? "" : s).normalize("NFKC").toUpperCase().replace(/[^0-9A-Zก-๙぀-ヿ一-鿿가-힯]/g, "");
/** @param {any} item {text, expect} @param {any} got pc_fields json */
export function scoreFields(item, got) {
  const e = item.expect, g = got || {};
  const eq = (a, b) => (a == null || a === "" ? b == null || norm(b) === "" : norm(b) === norm(a));
  const brand = e.brand == null ? !g.brand : !!g.brand && (norm(g.brand) === norm(e.brand) || norm(g.brand).startsWith(norm(e.brand)));
  const gotRegs = (g.registration || []).map(r => norm(r.number));
  const regs = e.registration.every(x => gotRegs.includes(norm(x))) && (e.registration.length > 0 || gotRegs.length === 0);
  const textKey = norm(item.text);
  const invented = gotRegs.filter(x => x && !textKey.includes(x)).length;
  return { product_type: g.product_type === e.product_type, brand, registration: regs, lot: eq(e.lot, g.lot), expiry: eq(e.expiry, g.expiry), invented };
}
/** @param {any} item {lines: [{source, keep, terms}]} @param {any} got pc_translate json */
export function scoreTranslate(item, got) {
  const ws = s => String(s || "").replace(/\s+/g, "");
  const lines = (got && got.lines) || [];
  let covered = 0, kept = 0, keepN = 0, term = 0;
  for (const l of item.lines) {
    const hit = lines.find(x => ws(x.source) === ws(l.source) || ws(x.source).includes(ws(l.source)));
    keepN += l.keep.length;
    if (!hit) continue;
    covered++;
    const tr = String(hit.translation || "");
    kept += l.keep.filter(k => tr.includes(k)).length;
    if (!l.terms.length || l.terms.some(t => tr.toLowerCase().includes(t.toLowerCase()))) term++;
  }
  return { lines: item.lines.length, covered, keepN, kept, term };
}
const pctl = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };

/** Spend tracker: a call is started only while the worst call seen so far (x1.5) still fits the model cap and the total. */
export class Budget {
  /** @param {number} totalUsd @param {number} perModelUsd */
  constructor(totalUsd, perModelUsd) { this.cap = Math.round(totalUsd * 1e6); this.modelCap = Math.round(perModelUsd * 1e6); this.total = 0; this.by = new Map(); this.maxCall = 0; }
  /** @param {string} model */
  canCall(model) { const m = Math.ceil(this.maxCall * 1.5); return this.total + m <= this.cap && (this.by.get(model) || 0) + m <= this.modelCap; }
  /** @param {string} model @param {number} micros */
  add(model, micros) { const c = Math.max(0, Number(micros) || 0); this.total += c; this.by.set(model, (this.by.get(model) || 0) + c); this.maxCall = Math.max(this.maxCall, c); }
  /** @param {string} model */
  spentUsd(model) { return (model ? this.by.get(model) || 0 : this.total) / 1e6; }
}

/** Every priced model ("*" router rows need --models). */
export async function defaultModels() {
  const { PRICES } = await import("../backend/src/ai/adapters/prices.js");
  return [...new Set(PRICES.filter(p => p.model !== "*").map(p => p.provider + ":" + p.model))];
}

/**
 * The eval loop. deps: fetch (to the local Worker), setChain(provider, model) (writes the local D1), budget, sets, log.
 * @param {{base: string, origin: string, models: string[], features: string[], sets: any, budget: Budget, fetch: Function, setChain: Function, log?: Function, limit?: number}} o
 */
export async function runEval(o) {
  const log = o.log || (() => {});
  const out = [];
  const call = async (feature, provider, input) => {
    const t0 = Date.now();
    const r = await o.fetch(`${o.base}/v1/ai/${feature}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: o.origin },
      body: JSON.stringify({ consent: true, providers: [provider], mode: "text", input }) });
    let j = null;
    try { j = await r.json(); } catch { j = null; }
    return { status: r.status, j, ms: Date.now() - t0 };
  };
  let stopAll = "";
  for (const m of o.models) {
    const [provider, ...rest] = m.split(":"), model = rest.join(":");
    const row = { model: m, provider, skipped: "", stopped: "", features: {} };
    out.push(row);
    if (stopAll) { row.skipped = stopAll; continue; }
    await o.setChain(provider, model);
    const info = await (await o.fetch(`${o.base}/v1/ai/providers?feature=pc_claims`, { headers: { Origin: o.origin } })).json().catch(() => null);
    if (!info || !Array.isArray(info.chain) || !info.chain.length) { row.skipped = "no key / not configured"; log(`skip ${m}: no key or not configured`); continue; }
    for (const f of o.features) {
      const items = (o.sets[f] || []).slice(0, o.limit || undefined);
      const st = row.features[f] = { n: 0, ok: 0, fallback: {}, costMicros: 0, ms: [], results: [], labelFilterSkipped: 0 };
      for (const it of items) {
        if (!o.budget.canCall(m)) {
          row.stopped = o.budget.total + o.budget.maxCall * 1.5 > o.budget.cap ? "total budget" : "model cap";
          if (row.stopped === "total budget") stopAll = "total budget reached";
          break;
        }
        const red = Guard.redact(it.text);
        const input = f === "pc_fields" ? { text: red.text, script: it.script || "th" } : f === "pc_claims" ? { text: red.text, category: it.category } : { text: red.text, target: it.target || "th" };
        const gate = Guard.aiGate(red.text);
        if (!gate.allow && gate.reason !== "dispensing") st.labelFilterSkipped++;
        const r = await call(f, provider, input);
        const ev = r.j && r.j.eval;
        // refused by the Worker's own input checks (dispensing label or personal data left): no provider call, no cost
        if (!ev && r.status === 400 && r.j && r.j.reason === "bad_input") {
          st.n++; st.fallback.bad_input = (st.fallback.bad_input || 0) + 1; st.results.push({ id: it.id, json: null, item: it, redacted: red.text });
          continue;
        }
        if (!ev) throw new Error("the Worker sent no cost (set AI_EVAL_LOCAL=1 in backend/.dev.vars and restart wrangler dev): caps cannot be enforced, stopping");
        o.budget.add(m, ev.costMicros); st.costMicros += ev.costMicros; st.n++; st.ms.push(r.ms);
        if (r.j.ok) { st.ok++; st.results.push({ id: it.id, json: r.j.json, item: it, redacted: red.text }); }
        else { st.fallback[r.j.reason || "error"] = (st.fallback[r.j.reason || "error"] || 0) + 1; st.results.push({ id: it.id, json: null, item: it,
          redacted: red.text }); if (r.j.reason === "budget") { row.stopped = "feature budget"; break; } }
      }
      log(`${m} ${f}: ${st.ok}/${st.n} answered, ${(st.costMicros / 1e6).toFixed(4)} USD`);
      if (row.stopped) break;
    }
  }
  return out;
}

/** Per model x feature summary (no texts). @param {any[]} rows @param {any} claimsScore score() of tools/pc-claims-eval.mjs */
export function summarize(rows, claimsScore) {
  return rows.map(r => {
    const s = { model: r.model, skipped: r.skipped, stopped: r.stopped, features: {} };
    for (const [f, st] of Object.entries(r.features)) {
      const base = { n: st.n, answered: st.ok, fallbacks: st.fallback, label_filter_skipped: st.labelFilterSkipped || 0,
        cost_usd: st.costMicros / 1e6, cost_per_call_usd: st.n ? st.costMicros / 1e6 / st.n : null,
        p50_ms: pctl(st.ms, 0.5), p95_ms: pctl(st.ms, 0.95), source: SOURCES[f] };
      if (f === "pc_fields") {
        const sc = st.results.map(x => scoreFields(x.item, x.json));
        const k = key => sc.filter(x => x[key]).length;
        s.features[f] = { ...base, product_type: k("product_type"), brand: k("brand"), registration: k("registration"), lot: k("lot"), expiry: k("expiry"),
          invented_registration: sc.reduce((a, x) => a + x.invented, 0), of: sc.length };
      } else if (f === "pc_translate") {
        const sc = st.results.map(x => scoreTranslate(x.item, x.json));
        const sum = key => sc.reduce((a, x) => a + x[key], 0);
        s.features[f] = { ...base, lines: sum("lines"), covered: sum("covered"), keep: sum("keepN"), kept: sum("kept"), term_hits: sum("term") };
      } else if (f === "pc_claims" && claimsScore) {
        const rowsA = st.results.map(x => {
          const ai = x.json ? [...new Set(x.json.signals.map(y => y.rule_id))] : [];
          return { id: x.id, category: x.item.category, expected: x.item.expected, device: x.item.device, ai, union: [...new Set([...x.item.device, ...ai])] };
        });
        const sc = key => claimsScore(rowsA.map(x => ({ id: x.id, category: x.category, expected: x.expected, predicted: x[key] })));
        const d = sc("device"), a = sc("ai"), u = sc("union");
        s.features[f] = { ...base, device: d.overall, ai: a.overall, union: u.overall, recall_uplift: u.overall.recall != null && d.overall.recall != null ? u.overall.recall - d.overall.recall : null,
          compliant_false_flags_per100: { device: d.compliant.per100, union: u.compliant.per100 } };
      } else s.features[f] = base;
    }
    return s;
  });
}

/** @param {any[]} sum */
export function markdown(sum) {
  const p = x => (x == null ? "—" : (100 * x).toFixed(1) + " %");
  const L = ["| Model | Feature | n | answered | accuracy / recall | cost USD (per call) | p50 / p95 ms | source |", "|---|---|---|---|---|---|---|---|"];
  for (const r of sum) {
    if (r.skipped) { L.push(`| ${r.model} | — | — | — | skipped: ${r.skipped} | — | — | — |`); continue; }
    for (const [f, s] of Object.entries(r.features)) {
      const acc = f === "pc_fields" ? `type ${s.product_type}/${s.of}, brand ${s.brand}, reg ${s.registration}, lot ${s.lot}, exp ${s.expiry}; invented reg ${s.invented_registration}`
        : f === "pc_translate" ? `lines ${s.covered}/${s.lines}, numbers kept ${s.kept}/${s.keep}, terms ${s.term_hits}/${s.lines}`
          : s.union ? `recall device ${p(s.device.recall)} -> +AI ${p(s.union.recall)} (uplift ${p(s.recall_uplift)}); precision +AI ${p(s.union.precision)}` : "";
      const per = s.cost_per_call_usd == null ? "—" : s.cost_per_call_usd.toFixed(5);
      L.push(`| ${r.model} | ${f} | ${s.n} | ${s.answered} | ${acc} | ${s.cost_usd.toFixed(4)} (${per}) | ${s.p50_ms ?? "—"} / ${s.p95_ms ?? "—"} | ${s.source} |`);
    }
    if (r.stopped) L.push(`| ${r.model} | — | — | — | stopped: ${r.stopped} | — | — | — |`);
  }
  return L.join("\n");
}

/** Loads the fixed sets: fields + translate from the repo, claims (held-out) from outside the repo when present. */
export async function loadSets(claimsDir) {
  const t = JSON.parse(readFileSync(join(REPO, "docs", "product-check", "p7-ai-testset.json"), "utf8"));
  const sets = { pc_fields: t.fields, pc_translate: t.translate, pc_claims: [] };
  let claimsScore = null, claimsNote = "";
  if (claimsDir && existsSync(join(claimsDir, "set.jsonl"))) {
    const ce = await import("./pc-claims-eval.mjs");
    const res = ce.run(claimsDir, "heldout"); // runs the ON-DEVICE rules too (same code as P3)
    sets.pc_claims = res.rows.map(r => ({ id: r.id, text: r.text, category: r.category, expected: r.a, device: r.predicted }));
    claimsScore = ce.score;
    appendFileSync(join(claimsDir, "p7-ai-heldout-runs.jsonl"), JSON.stringify({ at: new Date().toISOString(), tool: "pc-ai-eval", texts: res.rows.length }) + "\n");
  } else claimsNote = "P3 text set not found: pc_claims skipped (pass --claims-data)";
  return { sets, claimsScore, claimsNote };
}

async function main() {
  assertNotCI();
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const base = assertLocalBase(opt("--base", "http://127.0.0.1:8787"));
  const origin = assertLocalBase(opt("--origin", "http://localhost:8000"));
  const budget = new Budget(Number(opt("--budget", TRIAL.totalUsd)), Number(opt("--per-model", TRIAL.perModelUsd)));
  const models = opt("--models") ? String(opt("--models")).split(",") : await defaultModels();
  const features = opt("--features") ? String(opt("--features")).split(",").filter(f => PC_FEATURES.includes(f)) : PC_FEATURES;
  const claimsDir = resolve(opt("--claims-data", join(homedir(), "LENSIQ-field", "product-check", "texts")));
  const outDir = resolve(opt("--out", join(REPO, "field-data", "eval")));
  const { sets, claimsScore, claimsNote } = await loadSets(claimsDir);
  if (claimsNote) console.log(claimsNote);
  const total = Number(opt("--budget", TRIAL.totalUsd));
  const setChain = async (provider, model) => {
    const chain = [{ provider, model }];
    execLocal(settingsSql(await buildSettings({ totalUsd: total, chains: { pc_fields: chain, pc_claims: chain, pc_translate: chain } })));
  };
  const rows = await runEval({ base, origin, models, features: features.filter(f => sets[f].length), sets, budget, fetch, setChain, log: console.log, limit: Number(opt("--limit", 0)) || undefined });
  const sum = summarize(rows, claimsScore);
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(join(outDir, `pc-ai-eval-${stamp}.json`), JSON.stringify({ at: new Date().toISOString(), budget_usd: total, spent_usd: budget.spentUsd(), summary: sum }, null, 1));
  const md = markdown(sum);
  writeFileSync(join(outDir, `pc-ai-eval-${stamp}.md`), md + "\n");
  console.log("\n" + md + `\n\nspent ${budget.spentUsd().toFixed(4)} USD of ${total}; written to ${outDir}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error("pc-ai-eval: " + (e && e.message ? e.message : e)); process.exit(1); });
