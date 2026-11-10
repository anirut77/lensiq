#!/usr/bin/env node
// tools/pc-lookup-eval.mjs — Product Check P4: measures the lookups on the FIXED set docs/product-check/p4-testset.json.
//
//   node tools/pc-lookup-eval.mjs --tmt dev|heldout      TMT brand -> ingredient: hit / wrong-match / miss per query type
//                                                        (exact, label line, OCR noise) + latency; not-found set; spurious
//                                                        matches on non-drug label texts (P3 text set, same split, outside
//                                                        the repo: ~/LENSIQ-field/product-check/texts/)
//   node tools/pc-lookup-eval.mjs --alerts               curated Thai list cases (vendor/pc-alerts/th.json)
//   node tools/pc-lookup-eval.mjs --live                 registry + recall cases through backend/src/pc.js with the REAL
//                                                        network (build time only; never in CI) — hit / wrong / latency
//   node tools/pc-lookup-eval.mjs --down                 every source answering 500 / timing out (fake fetch): the route
//                                                        and the card model must say "could not check"
//   ... --json                                           machine-readable output
// Source label of every number: TMT / alerts / down = synthetic queries over public data (TMT 2020 CC BY, Thai FDA
// announcements); live = public sources called on the run date (Health Canada: the committed shards built from its file). No field (owner photo) numbers here.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const L = require(join(REPO, "lensiq-pc-lookup.js"));
const SET = JSON.parse(readFileSync(join(REPO, "docs/product-check/p4-testset.json"), "utf8"));
const a = process.argv.slice(2), opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
const pct = (n, d) => (d ? +((100 * n) / d).toFixed(1) : null);
/** Wilson 95 % interval (percent). */
export function wilson(k, n) {
  if (!n) return [null, null];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), w = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [+((100 * (c - w)) / d).toFixed(1), +((100 * (c + w)) / d).toFixed(1)];
}
const q = arr => { const s = [...arr].sort((x, y) => x - y); return s.length ? { p50: +s[Math.floor(s.length / 2)].toFixed(2), p95: +s[Math.min(s.length - 1,
  Math.floor(s.length * 0.95))].toFixed(2) } : {}; };

/** The page's path: matching over the on-demand shards of vendor/pc-drugs/tmt/ (read from disk here). */
const SHARD_DIR = join(REPO, "vendor/pc-drugs/tmt");
const SHARD_META = existsSync(join(SHARD_DIR, "meta.json")) ? JSON.parse(readFileSync(join(SHARD_DIR, "meta.json"), "utf8")) : null;
const loadShard = async name => JSON.parse(readFileSync(join(SHARD_DIR, name + ".json"), "utf8"));
async function tmtEval(split) {
  const tmt = JSON.parse(readFileSync(join(REPO, "vendor/pc-drugs/tmt-2563.json"), "utf8"));
  const t0 = performance.now();
  const idx = L.buildTmtIndex(tmt);
  const buildMs = performance.now() - t0;
  const cases = split === "heldout" ? SET.tmt_heldout : SET.tmt_dev;
  const out = { split, source: "synthetic queries over TMT 2020-02-17 (public dataset, CC BY)", index_ms: +buildMs.toFixed(0), by_query: {}, errors: [], sharded_identical: 0, sharded_differs: [] };
  for (const kind of ["exact", "label", "ocr"]) {
    let hit = 0, wrong = 0, miss = 0; const ms = [];
    for (const c of cases) {
      const s = performance.now();
      const m = L.matchTmt(c.queries[kind], idx, { max: 3 });
      const sm = SHARD_META ? await L.matchTmtSharded(c.queries[kind], SHARD_META, loadShard, { max: 3 }) : null;
      if (sm && JSON.stringify(sm) === JSON.stringify(m)) out.sharded_identical++; else out.sharded_differs.push(c.id + ":" + kind);
      ms.push(performance.now() - s);
      const pred = m.length ? m[0].ingredients[0].name : null;
      if (!pred) { miss++; out.errors.push({ id: c.id, kind, q: c.queries[kind], got: null }); }
      else if (c.expect_ingredients.includes(pred)) hit++;
      else { wrong++; out.errors.push({ id: c.id, kind, q: c.queries[kind], got: m[0].name + " -> " + pred, want: c.expect_ingredients }); }
    }
    out.by_query[kind] = { n: cases.length, hit_pct: pct(hit, cases.length), hit_ci: wilson(hit, cases.length), wrong_pct: pct(wrong, cases.length), wrong_ci: wilson(wrong, cases.length),
      miss_pct: pct(miss, cases.length), ms: q(ms) };
  }
  // not-found names (same for both splits: they never tune anything, reported once per run)
  let fm = 0; const fmList = [];
  for (const c of SET.tmt_notfound) {
    const m = L.matchTmt(c.query, idx);
    if (m.length) { fm++; fmList.push(`${c.query} -> ${m[0].name} (${m[0].via})`); }
    const sm = SHARD_META ? await L.matchTmtSharded(c.query, SHARD_META, loadShard, { max: 3 }) : null;
    if (sm && JSON.stringify(sm) === JSON.stringify(m)) out.sharded_identical++; else out.sharded_differs.push(c.id);
  }
  out.notfound = { n: SET.tmt_notfound.length, false_match_pct: pct(fm, SET.tmt_notfound.length), false_match_ci: wilson(fm, SET.tmt_notfound.length), list: fmList };
  // spurious matches on non-drug label texts (P3 set), same dev / held-out split as P3
  const dir = join(homedir(), "LENSIQ-field", "product-check", "texts");
  if (existsSync(join(dir, "set.jsonl")) && existsSync(join(dir, "split.json"))) {
    const sp = JSON.parse(readFileSync(join(dir, "split.json"), "utf8"));
    const ids = new Set(split === "heldout" ? sp.heldout || sp.held_out || sp.test : sp.dev);
    const texts = readFileSync(join(dir, "set.jsonl"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l))
      .filter(x => ids.has(x.id) && ["food", "cosmetic", "supplement"].includes(x.category));
    let sp1 = 0; const spl = [];
    for (const x of texts) {
      const m = L.matchTmt(x.text, idx);
      if (m.length) { sp1++; spl.push(`${x.id}: ${m.map(z => `${z.matched}->${z.name}(${z.via})`).join(", ")}`); }
      const sm = SHARD_META ? await L.matchTmtSharded(x.text, SHARD_META, loadShard) : null;
      if (sm && JSON.stringify(sm) === JSON.stringify(m)) out.sharded_identical++; else out.sharded_differs.push(x.id);
    }
    out.non_drug_texts = { source: "P3 labelled text set (public adverts / labels, outside the repo)", n: texts.length, with_any_match_pct: pct(sp1, texts.length),
      ci: wilson(sp1, texts.length), list: spl };
  } else out.non_drug_texts = { skipped: "P3 text set not found outside the repo" };
  return out;
}

function alertEval() {
  const alerts = JSON.parse(readFileSync(join(REPO, "vendor/pc-alerts/th.json"), "utf8"));
  const res = SET.alerts.map(c => { const m = L.alertsFor(c.q, alerts); const got = m.length ? "found" : "none"; return { id: c.id, q: c.q, expect: c.expect, got, ok: got === c.expect }; });
  return { source: "curated list built from Thai FDA announcements (public), synthetic queries", n: res.length, correct: res.filter(r => r.ok).length, cases: res,
    entries: alerts.entries.length, updated: alerts.updated };
}

async function liveEval() {
  const { pcRoute } = await import(join(REPO, "backend/src/pc.js"));
  const env = { ALLOWED_ORIGINS: "https://eval.example", PC_RATE_MIN: "120" };
  const call = async (path, params) => {
    const u = new URL("https://eval.example/api/pc/" + path + "?" + new URLSearchParams(params));
    const t = performance.now();
    const orig = console.log; console.log = () => {};
    try { const r = await pcRoute(new Request(u, { headers: { Origin: "https://eval.example" } }), env, u, {}); return { j: await r.json(), status: r.status, ms: performance.now() - t }; }
    finally { console.log = orig; }
  };
  const OP = { drug: "drug", food: "food", cosmetic: "cosmetic", herbal: "herbal", advert: "advert", device: "device" };
  const rows = [];
  for (const c of SET.registry) {
    const r = c.source === "hsa" ? await call("hsa", { q: c.q }) : await call("thfda", { op: OP[c.op], q: c.q });
    const items = r.j.items || [];
    const key = L.regKey(c.q);
    let got = !r.j.ok ? "could_not_check" : items.length ? "found" : "none";
    const wrong = got === "found" && c.source !== "hsa" && !items.every(x => L.regKey(x.lcnno) === key);
    if (got === "found" && c.status && items[0].status !== c.status) got = "found_status_differs";
    rows.push({ id: c.id, source: c.source || "thfda", op: c.op, expect: c.expect, got, wrong_match: wrong, ms: Math.round(r.ms), n: items.length,
      status: items[0] ? items[0].status : "", dropped_names: r.j.natural_person_names_dropped || 0 });
  }
  const HC = join(REPO, "vendor/pc-recalls/hc"), hcMeta = JSON.parse(readFileSync(join(HC, "meta.json"), "utf8"));
  for (const c of SET.recalls) {
    // Health Canada runs on the device from the committed shards (owner decision 2026-11-10); the rest through the Worker code
    const r = c.source === "healthcanada" ? await (async () => {
      const t = performance.now();
      const { items } = await L.hcSearchSharded(c.q, hcMeta, async p => JSON.parse(readFileSync(join(HC, "t", p + ".json"), "utf8")),
        async n => JSON.parse(readFileSync(join(HC, "i", n + ".json"), "utf8")));
      return { j: { ok: true, items }, ms: performance.now() - t };
    })() : await call(c.source, { by: c.by, q: c.q });
    const items = r.j.items || [];
    const got = !r.j.ok ? "could_not_check" : items.length ? "found" : "none";
    rows.push({ id: c.id, source: c.source, by: c.by, expect: c.expect, got, ref_found: c.ref ? items.some(x => x.ref === c.ref) : null, ms: Math.round(r.ms), n: items.length,
      first: items[0] ? `${items[0].ref} ${items[0].date}` : "" });
  }
  const ok = r => (r.expect === "found" ? (r.got === "found" || r.got === "found_status_differs") && (r.ref_found !== false) && !r.wrong_match : r.got === "none");
  const by = {};
  for (const r of rows) {
    const s = by[r.source] = by[r.source] || { n: 0, correct: 0, could_not_check: 0, wrong_match: 0, ms: [] };
    s.n++; if (ok(r)) s.correct++; if (r.got === "could_not_check") s.could_not_check++; if (r.wrong_match || (r.expect === "none" && r.got === "found")) s.wrong_match++;
    s.ms.push(r.ms);
  }
  for (const s of Object.values(by)) s.ms = q(s.ms);
  return { source: "live public sources, run " + new Date().toISOString(), by_source: by, rows };
}

async function downEval() {
  const { pcRoute } = await import(join(REPO, "backend/src/pc.js"));
  const env = { ALLOWED_ORIGINS: "https://eval.example", PC_RATE_MIN: "120" };
  const res = [];
  for (const c of SET.down) {
    const fetch = c.upstream === "timeout" ? async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; } : async () => new Response("down", { status: 500 });
    const u = new URL(`https://eval.example/api/pc/${c.source}?` + new URLSearchParams(c.source === "thfda" ? { op: "drug", q: "1A 844/39" } : { q: "paracetamol" }));
    const orig = console.log; console.log = () => {};
    let j; try { const r = await pcRoute(new Request(u, { headers: { Origin: "https://eval.example" } }), env, u, { fetch }); j = await r.json(); } finally { console.log = orig; }
    const row = L.rowFor({ source: c.source, fact: "x", kind: "name" }, { ok: false, status: 502, j }, "2026-11-10");
    res.push({ id: c.id, source: c.source, upstream: c.upstream, could_not_check: j.could_not_check === true && row.state === "could_not_check", reason: j.reason });
  }
  return { source: "synthetic (fake upstream)", n: res.length, correct: res.filter(r => r.could_not_check).length, cases: res };
}

const out = {};
if (a.includes("--tmt")) out.tmt = await tmtEval(opt("--tmt") === "heldout" ? "heldout" : "dev");
if (a.includes("--alerts")) out.alerts = alertEval();
if (a.includes("--down")) out.down = await downEval();
if (a.includes("--live")) out.live = await liveEval();
if (!Object.keys(out).length) { console.error("usage: --tmt dev|heldout | --alerts | --down | --live [--json]"); process.exit(2); }
if (a.includes("--json")) console.log(JSON.stringify(out, null, 1));
else {
  if (out.tmt) {
    const t = out.tmt;
    console.log(`TMT ${t.split} (index ${t.index_ms} ms):`);
    for (const [k, v] of Object.entries(t.by_query)) {
      console.log(`  ${k.padEnd(6)} n=${v.n} hit ${v.hit_pct}% [${v.hit_ci}] wrong ${v.wrong_pct}% [${v.wrong_ci}] miss ${v.miss_pct}%` +
        ` · ms p50 ${v.ms.p50} p95 ${v.ms.p95}`);
    }
    console.log(`  not-found n=${t.notfound.n} false match ${t.notfound.false_match_pct}% [${t.notfound.false_match_ci}] ${t.notfound.list.join("; ")}`);
    console.log(`  sharded path (vendor/pc-drugs/tmt/): ${t.sharded_identical} identical, ${t.sharded_differs.length} different ${t.sharded_differs.slice(0, 5).join(" ")}`);
    const nd = t.non_drug_texts;
    console.log(nd.skipped ? "  non-drug texts: " + nd.skipped : `  non-drug texts n=${nd.n} any TMT match ${nd.with_any_match_pct}% [${nd.ci}]`);
    if (a.includes("--errors")) { for (const e of t.errors) console.log("   ", JSON.stringify(e)); if (nd.list) for (const e of nd.list) console.log("    nd", e); }
  }
  if (out.alerts) console.log(`alerts: ${out.alerts.correct}/${out.alerts.n} correct (${out.alerts.entries} entries, updated ${out.alerts.updated})`);
  if (out.down) console.log(`down: ${out.down.correct}/${out.down.n} say "could not check"`);
  if (out.live) { for (const [k, v] of Object.entries(out.live.by_source)) {
    console.log(`live ${k.padEnd(13)} n=${v.n} correct ${v.correct} wrong ${v.wrong_match} could-not-check ${v.could_not_check}` +
      ` ms p50 ${v.ms.p50} p95 ${v.ms.p95}`);
  }
    for (const r of out.live.rows) console.log("   ", JSON.stringify(r)); }
}
