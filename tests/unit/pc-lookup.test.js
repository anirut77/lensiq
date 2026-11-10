"use strict";
// tests/unit/pc-lookup.test.js — Product Check P4 (lensiq-pc-lookup.js + the build tools): the fixed test set is
// unchanged, the committed tables carry credit / "data as of" / checksums and nothing personal, the TMT matcher holds its
// measured numbers on the dev AND held-out splits (docs/product-check/P4-RESULTS.md), the curated Thai list matches by
// exact number only, the remote plan sends derived facts only, a source that does not answer is "could not check", and
// no verdict word appears in the card text (TH / EN / ZH). No network.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync, existsSync, statSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const L = require(join(ROOT, "lensiq-pc-lookup.js"));
const rd = p => readFileSync(join(ROOT, p), "utf8");
const SET = JSON.parse(rd("docs/product-check/p4-testset.json"));
const TMT = JSON.parse(rd("vendor/pc-drugs/tmt-2563.json"));
const NLEM = JSON.parse(rd("vendor/pc-drugs/nlem-2567.json"));
const ALERTS = JSON.parse(rd("vendor/pc-alerts/th.json"));
let IDX = null;
const idx = () => (IDX = IDX || L.buildTmtIndex(TMT));

test("the fixed test set is the one written before the matcher (checksum, counts)", () => {
  const sha = createHash("sha256").update(readFileSync(join(ROOT, "docs/product-check/p4-testset.json"))).digest("hex");
  assert.equal(sha, "a21a63b50c907c7c418c02127011e731a920d218fb90f2e1f62da95d321e4a32", "p4-testset.json changed: never regenerate it to fit results");
  assert.deepEqual([SET.tmt_dev.length, SET.tmt_heldout.length, SET.tmt_notfound.length, SET.registry.length, SET.recalls.length, SET.alerts.length, SET.down.length],
    [150, 150, 45, 16, 9, 4, 8]);
  const dev = new Set(SET.tmt_dev.map(c => c.name));
  assert.ok(SET.tmt_heldout.every(c => !dev.has(c.name)), "dev and held-out share no name");
});

test("TMT table: derived columns only, credit, data as of 2020-02-17, CC BY source, sensible size", () => {
  assert.equal(TMT.schema, "lensiq-pc-tmt/1");
  assert.equal(TMT.source.id, "tmt-2563");
  assert.equal(TMT.source.as_of, "2020-02-17");
  assert.match(TMT.source.licence, /Creative Commons Attribution/);
  assert.match(TMT.source.input_sha256, /^[0-9a-f]{64}$/);
  assert.equal(TMT.source.input_rows, 30683);
  for (const l of ["th", "en", "zh"]) assert.ok(TMT.credit[l] && /TMT/.test(TMT.credit[l]), "credit " + l);
  assert.deepEqual(TMT.columns, ["trade_name", "ingredient#", "strength", "dose_form#", "manufacturer#"]);
  assert.ok(TMT.p.length > 25000 && TMT.p.every(r => r.length === 5 && typeof r[0] === "string" && TMT.ing[r[1]] !== undefined && TMT.form[r[3]] !== undefined));
  assert.ok(statSync(join(ROOT, "vendor/pc-drugs/tmt-2563.json")).size < 1.5 * 1024 * 1024, "keep the table under 1.5 MB");
  assert.ok(!/FSN|TPUCode/.test(JSON.stringify(TMT.p.slice(0, 50))));
});

test("NLEM table: MIT notice kept, Gazette cross-check recorded as pending, removed rows dropped", () => {
  assert.equal(NLEM.schema, "lensiq-pc-nlem/1");
  assert.ok(NLEM.e.length > 900 && NLEM.e.every(e => /^(ก|ข|ค|ง|จ\(1\)|จ\(2\))$/.test(e[3])));
  assert.equal(NLEM.source.removed_dropped, 5);
  assert.equal(NLEM.source.gazette_checked, false);
  assert.match(NLEM.source.gazette_note, /L32/);
  assert.match(rd("vendor/pc-drugs/LICENSE-thai-nlem-api.txt"), /MIT License/);
  for (const l of ["th", "en", "zh"]) assert.ok(NLEM.credit[l]);
});

test("curated Thai list: facts only, every entry verified on its official page, valid codes", async () => {
  const B = await import(join(ROOT, "tools/pc-alerts-build.mjs"));
  assert.equal(ALERTS.schema, "lensiq-pc-alerts/1");
  assert.ok(ALERTS.entries.length >= 5);
  const src = JSON.parse(rd("tools/pc-alerts-th.src.json"));
  assert.deepEqual(B.validate(src).errors, []);
  for (const e of ALERTS.entries) {
    assert.match(e.source_url, /^https:\/\/([a-z0-9-]+\.)*(go\.th|oryor\.com)\//, e.id);
    assert.match(e.source_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(e.verified && e.verified.ok === true, e.id + " verified on its page");
    assert.ok(e.issues.every(i => ALERTS.issue_codes.includes(i)));
    for (const v of Object.values(e)) if (typeof v === "string") assert.ok(v.length <= 160, "no copied sentences: " + e.id);
    if (e.reg) assert.equal(e.reg_key, L.regKey(e.reg));
  }
  // validation refuses copied text, non-government sources and unknown issue codes
  const bad = B.validate({ entries: [{ id: "TH-2026-9999", category: "cosmetic", name_en: "X", issues: ["fake"], source_url: "https://news.example/x", source_date: "2026-01-01",
    reg_note: "x".repeat(200) }] }).errors.join("\n");
  assert.match(bad, /issues must be codes/); assert.match(bad, /Thai government page/); assert.match(bad, /longer than 160/);
  // the page check needs number + name + Thai date
  const e = ALERTS.entries.find(x => x.reg);
  const [y, m, d] = e.source_date.split("-").map(Number);
  const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const page = `ประกาศ ${d} ${months[m - 1]} ${y + 543} ผลิตภัณฑ์ ${e.name_en} เลข ${e.reg}`;
  assert.equal(B.pageHasFacts(e, page).ok, true);
  assert.equal(B.pageHasFacts(e, page.replace(e.reg, "00-0-0000000000")).ok, false);
});

test("alertsFor: the fixed cases, exact number match only (no partial digits)", () => {
  for (const c of SET.alerts) assert.equal(L.alertsFor(c.q, ALERTS).length ? "found" : "none", c.expect, c.id);
  // the same number printed without dashes, in Thai digits, inside a longer label
  const e = ALERTS.entries.find(x => x.reg === "13-2-06463-5-0326");
  assert.equal(L.alertsFor("เลขสารบบอาหาร 1320646350326 ผลิตภัณฑ์", ALERTS)[0].entry.id, e.id);
  assert.equal(L.alertsFor("อย. ๑๓-๒-๐๖๔๖๓-๕-๐๓๒๖", ALERTS)[0].via, "reg");
  assert.deepEqual(L.alertsFor("13-2-06463-5-0327", ALERTS), []);
});

/** hit / wrong / miss of the top match on one split and query type */
function score(cases, kind) {
  let hit = 0, wrong = 0;
  for (const c of cases) {
    const m = L.matchTmt(c.queries[kind], idx(), { max: 3 });
    if (!m.length) continue;
    if (c.expect_ingredients.includes(m[0].ingredients[0].name)) hit++; else wrong++;
  }
  return { hit: hit / cases.length, wrong: wrong / cases.length };
}
test("TMT matcher keeps its measured numbers (dev + held-out; P4-RESULTS.md)", () => {
  const floor = { dev: { exact: 1, label: 1, ocr: 0.88 }, heldout: { exact: 1, label: 1, ocr: 0.92 } };
  for (const [split, cases] of [["dev", SET.tmt_dev], ["heldout", SET.tmt_heldout]]) {
    for (const kind of ["exact", "label", "ocr"]) {
      const s = score(cases, kind);
      assert.ok(s.hit >= floor[split][kind], `${split} ${kind} hit ${s.hit}`);
      assert.ok(s.wrong <= 0.02, `${split} ${kind} wrong ${s.wrong}`);
    }
  }
  for (const c of SET.tmt_notfound) assert.deepEqual(L.matchTmt(c.query, idx()), [], "not-found " + c.query);
});

test("TMT matcher: ordinary label wording is not a brand; ambiguity is shown, not hidden", () => {
  // known limit, kept visible (P4-RESULTS.md): a single word that is also a TMT product sold under its generic name
  // ("glucose" -> GLUCOSE) still matches; the matcher was frozen before the held-out run, the fix is proposed for P5+
  for (const t of ["Vitamin C 1000 mg tablets", "Biotin helps maintain hair", "minor cuts and scrapes", "TABLETS 10 x 10", "natural essential care"]) {
    assert.deepEqual(L.matchTmt(t, idx()).map(m => m.name), [], t);
  }
  const m = L.matchTmt("ZYCEL 200 celecoxib 200 mg capsule", idx());
  assert.equal(m[0].name, "ZYCEL 200"); assert.equal(m[0].ingredients[0].name, "celecoxib"); assert.equal(m[0].via, "exact");
  const amb = L.matchTmt("SIMEX", idx());
  assert.ok(amb.length && amb[0].ambiguous && amb[0].ingredients.length > 1, "a name with several ingredients is flagged");
});

test("TMT shards (owner decision 2026-11-10, review S7): committed, small, and matching over them is IDENTICAL to the full index", async () => {
  const dir = join(ROOT, "vendor/pc-drugs/tmt");
  const meta = JSON.parse(rd("vendor/pc-drugs/tmt/meta.json"));
  assert.equal(meta.schema, "lensiq-pc-tmt-shards/1");
  assert.equal(meta.source.as_of, "2020-02-17");
  for (const l of ["th", "en", "zh"]) assert.ok(meta.credit[l]);
  const files = require("node:fs").readdirSync(dir).filter(n => n !== "meta.json");
  assert.deepEqual(files.map(n => n.replace(/\.json$/, "")).sort(), [...meta.shards].sort());
  let total = 0;
  for (const n of files) { const b = statSync(join(dir, n)).size; total += b; assert.ok(b < 64 * 1024, n + " is " + b + " B"); }
  assert.ok(total < 2.5 * 1024 * 1024, "all shards " + total);
  const load = async name => JSON.parse(readFileSync(join(dir, name + ".json"), "utf8"));
  // identical results: every dev + held-out query and the not-found names (the eval also runs the non-drug texts)
  const qs = [...SET.tmt_dev, ...SET.tmt_heldout].flatMap(c => Object.values(c.queries)).concat(SET.tmt_notfound.map(c => c.query));
  for (const q of qs) assert.deepEqual(await L.matchTmtSharded(q, meta, load), L.matchTmt(q, idx(), { max: 3 }), q);
  // a label needs only a few small shards
  const label = "TYLENOL 500 Reg. No. 1A 844/39 รักษาหายขาด 100% ไม่มีผลข้างเคียง อย. 13-2-06463-5-0326 paracetamol 500 mg tablets";
  const need = L.tmtShardsFor(label, meta);
  const bytes = need.reduce((a, n) => a + statSync(join(dir, n + ".json")).size, 0);
  assert.ok(need.length <= 40 && bytes < 400 * 1024, `${need.length} shards, ${bytes} B`);
  // the builder writes exactly what is committed (the --check of tools/pc-tmt-build.mjs, on the committed table)
  const T = await import(join(ROOT, "tools/pc-tmt-build.mjs"));
  const fresh = T.shardFiles(TMT);
  assert.equal(Object.keys(fresh).length, files.length + 1);
  for (const n of ["meta.json", files[0], files[files.length - 1]]) assert.equal(fresh[n], rd("vendor/pc-drugs/tmt/" + n), n);
});

test("Health Canada shards (owner decision 2026-11-10, review S5): OGL credit, data date, same results as a full scan", async () => {
  const dir = "vendor/pc-recalls/hc/";
  const meta = JSON.parse(rd(dir + "meta.json"));
  assert.equal(meta.schema, "lensiq-pc-hc-recalls/1");
  assert.match(meta.credit.en, /Open Government Licence – Canada/);
  for (const l of ["th", "en", "zh"]) assert.ok(meta.credit[l]);
  assert.match(meta.source.as_of, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(meta.source.items > 1000 && meta.chunks === Math.ceil(meta.source.items / meta.chunk));
  let tok = 0, items = 0;
  for (const p of meta.prefixes) { const b = statSync(join(ROOT, dir, "t", p + ".json")).size; tok += b; assert.ok(b < 64 * 1024, p); }
  for (let n = 0; n < meta.chunks; n++) { const b = statSync(join(ROOT, dir, "i", n + ".json")).size; items += b; assert.ok(b < 64 * 1024, "chunk " + n); }
  assert.ok(tok + items < 3 * 1024 * 1024);
  const all = [];
  for (let n = 0; n < meta.chunks; n++) all.push(...JSON.parse(rd(dir + "i/" + n + ".json")));
  assert.ok(all.every(r => /^https:\/\/recalls-rappels\.canada\.ca\//.test(r[5]) && !String(r).includes("What you should do")));
  const lt = async p => JSON.parse(rd(dir + "t/" + p + ".json")), lc = async n => JSON.parse(rd(dir + "i/" + n + ".json"));
  // the old full scan (every word must start a word of title + product; newest first)
  const scanAll = q => { const ws = [...new Set(L.hcFold(q).split(" ").filter(w => w.length >= 3))]; if (!ws.length) return [];
    return all.filter(r => { const t = " " + L.hcFold(r[1] + " " + r[2]) + " "; return ws.every(w => t.includes(" " + w)); }).map(r => r[0]); };
  for (const q of ["Organic Roasted Black Soybeans", "peanut butter", "zzqxlensiqnotreal", "milk chocolate", "baby", "recall", "x", "Listeria ready meals", "TYLENOL", "cream"]) {
    const r = await L.hcSearchSharded(q, meta, lt, lc), full = scanAll(q);
    assert.deepEqual(r.items.map(x => x.ref), full.slice(0, 5), q);
    assert.equal(r.total, full.length, q + ": total = every match, not just the 5 shown (re-review 9)");
  }
  assert.deepEqual((await L.hcSearchSharded("Organic Roasted Black Soybeans", meta, lt, lc)).items.map(x => x.ref), ["77435"]);
  assert.ok((await L.hcSearchSharded("peanut", meta, lt, lc)).total > 5, "a common word has more matches than shown");
  assert.match(meta.source.window_from, /^\d{4}-\d{2}-\d{2}$/);
  // the card states the window (re-review 10) and the total; a local row says "searched on this device"
  const row = L.rowFor({ source: "healthcanada", fact: "x", kind: "name", local: true }, { ok: true, status: 200,
    j: { ok: true, items: [{ ref: "1" }], total: 9, fetched: meta.source.as_of, window_from: meta.source.window_from } }, "2026-11-10");
  assert.deepEqual([row.total, row.window_from, row.date], [9, meta.source.window_from, meta.source.as_of]);
  // the builder: shape guard, 3-year window, off-site links dropped (fixture: one real OGL item + two synthetic)
  const H = await import(join(ROOT, "tools/pc-hc-build.mjs"));
  const fx = JSON.parse(readFileSync(join(__dirname, "fixtures/pc/healthcanada-open-data.json"), "utf8"));
  assert.throws(() => H.hcFiles("<html>", {}, { sha256: "" }), /open-data shape/);
  assert.throws(() => H.hcFiles({ a: { NID: "1" } }, {}, { sha256: "" }), /open-data shape/, "an object that is not the numbered file");
  assert.throws(() => H.hcFiles({ 0: fx[0], 2: fx[0] }, {}, { sha256: "", minItems: 1 }), /open-data shape/, "gaps in the numbering");
  // re-review 8: a truncated file never replaces the shards; incomplete items and bad dates are refused on purpose
  assert.equal(H.MIN_ITEMS, 10000);
  assert.throws(() => H.hcFiles(fx, {}, { sha256: "" }), /only 3 items \(minimum 10000\)/);
  const many = n => Array.from({ length: n }, (_, i) => ({ ...fx[0], NID: String(i) }));
  assert.throws(() => H.hcFiles([...many(98), { NID: "x", URL: fx[0].URL }, { Title: "t" }], {}, { sha256: "", minItems: 1 }), /98 of 100 items have NID, URL and Title/);
  assert.throws(() => H.hcFiles([...many(98), { ...fx[0], "Last updated": "2026-13-45" }, { ...fx[0], "Last updated": "10/11/2026" }], {}, { sha256: "", minItems: 1 }),
    /98 of 100 dated items have a valid/, "malformed dates are refused on purpose, not by a stray RangeError");
  assert.doesNotThrow(() => H.hcFiles([...many(99), { ...fx[0], "Last updated": "2026-02-30" }], { id: "hc" }, { sha256: "", minItems: 1 }), "99 % valid is enough");
  const und = JSON.parse(H.hcFiles([...many(50), ...Array.from({ length: 50 }, (_, i) => ({ ...fx[0], NID: "u" + i, "Last updated": "" }))], { id: "hc" },
    { sha256: "", minItems: 1 })["meta.json"]);
  assert.equal(und.source.undated_skipped, 50, "undated items (vehicle recalls in the real file) are skipped and counted");
  assert.equal(JSON.parse(H.hcFiles({ 0: fx[0], 1: fx[1], 2: fx[2] }, { id: "hc" }, { sha256: "", minItems: 1 })["meta.json"]).source.items, 1, "the file's numbered object");
  const f = H.hcFiles(fx, { id: "hc" }, { sha256: "0", minItems: 1 });
  const fm = JSON.parse(f["meta.json"]);
  assert.deepEqual([fm.source.items, fm.source.as_of, fm.chunks], [1, "2026-11-07", 1]);
  assert.deepEqual(JSON.parse(f["i/0.json"]).map(r => r[0]), ["77435"]);
});

test("NLEM lookup: single and combined ingredients, order-insensitive", () => {
  const n = L.buildNlemIndex(NLEM);
  assert.ok(L.nlemFor("paracetamol", n).length >= 1);
  assert.ok(L.nlemFor("Magnesium hydroxide + Aluminium hydroxide", n).some(x => x.category === "ก"));
  assert.deepEqual(L.nlemFor("lqtestaminophen", n), []);
});

test("normalisers", () => {
  assert.equal(L.normKey(" Zycel-200 ® "), "ZYCEL200");
  assert.equal(L.baseKey("NUOSIC (ชมพู) 500 mg"), "NUOSICMG");
  assert.equal(L.baseKey("ZYCEL 200"), "ZYCEL");
  assert.equal(L.ocrFold("HI8ICET"), "HIBICET");
  assert.equal(L.regKey("13-2-06463-5-0326"), "1320646350326");
  assert.deepEqual(L.regCandidates("Reg. No. 1A 844/39 · อย. 10-1-02141-1-0375 · G123/45"), ["10-1-02141-1-0375", "1A 844/39", "G123/45"]);
  assert.equal(L.inferCategory({ regs: [{ country: "TH", kind: "cosmetic" }], tmt: [] }), "cosmetic");
  assert.equal(L.inferCategory({ regs: [], tmt: [{}] }), "drug");
  assert.equal(L.inferCategory({ regs: [], tmt: [] }), undefined);
});

test("planLookups: derived facts only, each to the sources that cover it, capped", () => {
  const plan = L.planLookups({
    regs: [{ norm: "1A 844/39", country: "TH", kind: "drug" }, { norm: "13-1-6800016755", country: "TH", kind: "cosmetic" }, { norm: "SIN09110P", country: "SG", kind: "sin" },
      { norm: "50580-590", country: "US", kind: "ndc" }],
    gtins: ["712199083411"], names: ["TYLENOL 500", "ZYCEL 200", "THIRD"], ingredients: ["paracetamol", "celecoxib", "third"]
  });
  const paths = plan.map(p => p.path);
  assert.ok(paths.includes("/api/pc/thfda?op=drug&q=1A%20844%2F39"));
  assert.ok(paths.includes("/api/pc/thfda?op=cosmetic&q=13-1-6800016755"));
  assert.ok(paths.includes("/api/pc/hsa?q=SIN09110P"));
  assert.ok(paths.includes("/api/pc/openfda?by=gtin&q=712199083411"));
  for (const s of ["openfda", "safetygate", "rasff", "healthcanada"]) assert.ok(paths.includes(`/api/pc/${s}?by=name&q=TYLENOL%20500`), s);
  assert.ok(!paths.some(p => /THIRD|third/.test(p)), "at most two names / ingredients");
  assert.ok(paths.every(p => /^\/api\/pc\/[a-z]+\?/.test(p)), "only the LENSIQ Worker, never a third party");
  assert.deepEqual(L.planLookups({}), []);
  // the batch body (review S6): one request object per lookup, the same derived fact, nothing else
  const th = plan.find(p => p.source === "thfda" && p.fact === "1A 844/39");
  assert.deepEqual(th.req, { source: "thfda", q: "1A 844/39", op: "drug" });
  assert.deepEqual(plan.find(p => p.kind === "gtin").req, { source: "openfda", q: "712199083411", by: "gtin" });
  assert.ok(plan.every(p => Object.keys(p.req).every(k => ["source", "q", "op", "by"].includes(k))));
  assert.ok(plan.length <= 16, "fits one batch (BATCH_MAX 16)");
  assert.ok(plan.filter(p => p.source === "healthcanada").every(p => p.local === true), "Health Canada is searched on the device, never sent");
  assert.ok(plan.filter(p => p.source !== "healthcanada").every(p => !p.local));
  assert.equal(new Set(plan.map(p => JSON.stringify(p.req))).size, plan.length, "no duplicate lookups");
});

test("rowFor: could not check, register signals, recalls by name are 'compare', never 'no signal' on failure", () => {
  const today = "2026-11-10";
  assert.equal(L.rowFor({ source: "thfda", fact: "x", kind: "reg" }, { ok: false, status: 0, j: null }, today).reason, "no_server");
  assert.equal(L.rowFor({ source: "rasff", fact: "x", kind: "name" }, { ok: false, status: 502, j: { ok: false, could_not_check: true, reason: "timeout" } }, today).state, "could_not_check");
  const nr = L.rowFor({ source: "thfda", fact: "x", kind: "reg" }, { ok: true, status: 200, j: { ok: true, items: [], fetched: "2026-11-10T01:00:00Z" } }, today);
  assert.deepEqual([nr.state, nr.signal, nr.date], ["signal", "not_in_register", "2026-11-10"]);
  const cx = L.rowFor({ source: "thfda", fact: "x", kind: "reg" }, { ok: true, status: 200, j: { ok: true, items: [{ status: "cancelled", status_text: "ยกเลิก" }] } }, today);
  assert.deepEqual([cx.state, cx.signal, cx.status], ["signal", "register_status", "cancelled"]);
  assert.equal(L.rowFor({ source: "thfda", fact: "x", kind: "reg" }, { ok: true, status: 200, j: { ok: true, items: [{ status: "active" }] } }, today).state, "found");
  assert.equal(L.rowFor({ source: "openfda", fact: "x", kind: "name" }, { ok: true, status: 200, j: { ok: true, items: [{ ref: "D-1" }] } }, today).signal, "recall_name");
  assert.equal(L.rowFor({ source: "openfda", fact: "1", kind: "gtin" }, { ok: true, status: 200, j: { ok: true, items: [{ ref: "D-1" }] } }, today).signal, "recall_gtin");
  assert.equal(L.rowFor({ source: "healthcanada", fact: "x", kind: "name" }, { ok: true, status: 200, j: { ok: true, items: [] } }, today).state, "none");
  // a 200 without the documented items array is NOT "not found" (review B1 / S1)
  for (const j of [{ ok: true }, { ok: true, items: "x" }, { ok: true, items: null }]) {
    const r = L.rowFor({ source: "thfda", fact: "x", kind: "reg" }, { ok: true, status: 200, j }, today);
    assert.deepEqual([r.state, r.reason], ["could_not_check", "bad_response"]);
  }
});

test("wording: no verdict word in the card text (TH defaults, EN, ZH)", () => {
  const src = rd("lensiq-pc-lookup.js");
  const th = [...src.matchAll(/TX?\("md\.pc\.l\.[\w.]+",\s*"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
  global.window = {};
  delete require.cache[require.resolve(join(ROOT, "i18n/en-med.js"))]; delete require.cache[require.resolve(join(ROOT, "i18n/zh-med.js"))];
  require(join(ROOT, "i18n/en-med.js")); require(join(ROOT, "i18n/zh-med.js"));
  const q = global.window.LQI18N_Q;
  const other = [...q.map(x => x.en || {}), ...q.map(x => x.zh || {})].flatMap(d => Object.entries(d)).filter(([k]) => k.startsWith("md.pc.l.")).map(([, v]) => v);
  delete global.window;
  assert.ok(th.length >= 60 && other.length >= 140);
  const BAN = /illegal|fake|counterfeit|genuine|authentic|ผิดกฎหมาย|ปลอม|ของแท้|ของจริง|违法|非法|假冒|假货|正品|真伪/i;
  for (const s of [...th, ...other]) assert.ok(!BAN.test(s), "verdict word in: " + s);
  // every key used by the card exists in EN and ZH
  const keys = [...new Set([...src.matchAll(/TX?\("(md\.pc\.l\.[\w.]+)"/g)].map(m => m[1]))];
  global.window = {};
  delete require.cache[require.resolve(join(ROOT, "i18n/en-med.js"))]; delete require.cache[require.resolve(join(ROOT, "i18n/zh-med.js"))];
  require(join(ROOT, "i18n/en-med.js")); require(join(ROOT, "i18n/zh-med.js"));
  const en = Object.assign({}, ...global.window.LQI18N_Q.map(x => x.en || {})), zh = Object.assign({}, ...global.window.LQI18N_Q.map(x => x.zh || {}));
  delete global.window;
  assert.deepEqual(keys.filter(k => !en[k] || !zh[k]), []);
});

test("build tools: licence guard refuses unrecorded sources; TMT / NLEM builders are pure and drop what they must", async () => {
  const S = await import(join(ROOT, "tools/lib/pc-drug-source.mjs"));
  assert.throws(() => S.requireAllowed("tmt-2568", "tmt"), /not recorded as allowed/);
  assert.throws(() => S.requireAllowed("tmt-current", "tmt"), /not recorded as allowed/);
  assert.throws(() => S.requireAllowed("https://example.com/x.xls", "tmt"), /unknown source/);
  assert.throws(() => S.requireAllowed("nlem-2567", "tmt"), /not tmt/);
  assert.equal(S.requireAllowed("tmt-2563", "tmt").files["mastertmt_20200217.xls"],
    "https://data.go.th/dataset/ca6ec620-369c-4f56-a8d6-56f1541e5ddf/resource/caa41e90-aa41-41c0-9316-2b73a1f45cec/download/mastertmt_20200217.xls");
  assert.throws(() => S.fieldDir({ id: "x", dir: "x" }, ROOT), /outside the repo/);
  const T = await import(join(ROOT, "tools/pc-tmt-build.mjs"));
  const head = ["TPUCode", "ActiveIngredient", "Strength", "Dosageform", "Contvalue", "Contunit", "DispUnit", "TradeName", "Manufacturer", "FSN", "Status"];
  const rows = [head, ["1", "Paracetamol", "500 mg", "Tablet", "", "", "", "LQ TEST 500", "LQ LABS", "FSN TEXT", "0"],
    ["2", "Paracetamol", "500 mg", "Tablet", "10", "", "", "LQ TEST 500", "LQ LABS", "FSN TEXT 2", "0"], ["3", "x", "", "", "", "", "", "LQ OLD", "M", "", "1"]];
  const t = T.buildTmtTable(rows, { id: "t", as_of: "2020-02-17" }, { sha256: "0".repeat(64) });
  assert.deepEqual(t.p, [["LQ TEST 500", 0, "500 mg", 0, 0]], "pack-size duplicates merged, inactive rows dropped, ingredient lower-cased");
  assert.equal(t.source.inactive_rows_dropped, 1);
  assert.ok(!JSON.stringify(t).includes("FSN TEXT"));
  assert.throws(() => T.buildTmtTable([["TradeName"]], {}, { sha256: "" }), /column missing/);
  const N = await import(join(ROOT, "tools/pc-nlem-build.mjs"));
  const C = await import(join(ROOT, "tools/lib/csv.mjs"));
  const csv = C.parseCsv('name1,name2,generic name,syn name,dosage,ED,ประเภทยา,เงื่อนไข,edit\nGI,"Antacids\n",Simeticone,Simethicone,"tab, susp",ก ,,,\nGI,x,Gone,,tab,ข,,,ตัดออก\n');
  assert.equal(csv[1][1], "Antacids\n");
  const n = N.buildNlemTable(csv, { id: "n" }, { sha256: "" });
  assert.deepEqual(n.e.map(e => [e[0], e[3]]), [["Simeticone", "ก"]]);
  assert.equal(n.source.removed_dropped, 1);
  const X = await import(join(ROOT, "tools/lib/xls-biff8.mjs"));
  assert.throws(() => X.readXls(Buffer.from("not an xls file at all, just text....")), /not a CFB/);
});

test("medicine.html loads the card after the P2 tab and the P3 rules; the hook stays minimal", () => {
  const html = rd("medicine.html");
  const i = s => html.indexOf(`<script src="${s}`);
  assert.ok(i("lensiq-pc-ui.js") > 0 && i("lensiq-claims-rules.js") > i("lensiq-pc-ui.js") && i("lensiq-claims.js") > i("lensiq-claims-rules.js") && i("lensiq-pc-lookup.js") > i("lensiq-claims.js"));
  assert.ok(html.includes('<div id="pcClaimsSlot"></div>'));
  assert.match(rd("lensiq-pc-ui.js"), /"lq-pc-text", \{ detail: \{ text: st\.text, script: st\.script,\s*codes:/);
  assert.ok(existsSync(join(ROOT, "vendor/pc-drugs/tmt-2563.json")) && existsSync(join(ROOT, "vendor/pc-alerts/th.json")));
});
