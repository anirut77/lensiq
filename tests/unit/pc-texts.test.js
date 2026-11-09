// tests/unit/pc-texts.test.js — Product Check P1 text-set tool (tools/pc-texts.mjs): schema validation, counts, Cohen's
// kappa, the fixed-seed stratified split and the "data stays outside the repo" guard. All fixtures are SYNTHETIC and built
// here; no real advert or label text is in the repo. Also checks the rule draft (tools/pc-rules-draft.json) is well formed.
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const ROOT = join(__dirname, "..", "..");
const TOOL = join(ROOT, "tools", "pc-texts.mjs");
const load = () => import(pathToFileURL(TOOL).href);

/** A synthetic row (fake text, example.invalid URL). */
function row(n, over = {}) {
  return {
    id: "PCT-" + String(n).padStart(4, "0"), lang: "en", category: "supplement", stratum: "compliant",
    text: `synthetic text number ${n}`, source_url: "https://example.invalid/" + n, accessed: "2026-11-09",
    publisher: "synthetic", expected_rule_ids: [], label_by: "agentA", notes: "", ...over,
  };
}

test("valid synthetic rows have no problems; bad fields are reported", async () => {
  const m = await load();
  const rules = new Set(["F06", "F13", "C01", "D01"]);
  assert.deepEqual(m.validateSet([row(1), row(2, { expected_rule_ids: ["F13"] })], rules), []);
  const bad = m.validateSet([
    row(1, { lang: "fr" }), row(2, { category: "pet" }), row(3, { accessed: "9/11/2026" }), row(4, { source_url: "ftp://x" }),
    row(5, { expected_rule_ids: ["C01"] }), row(6, { expected_rule_ids: "F13" }), row(7, { expected_rule_ids: ["F99"] }),
    row(8, { text: "synthetic text number 1" }), row(1),
  ], rules);
  const joined = bad.join("\n");
  for (const want of ["lang must be", "category must be", "accessed must be", "source_url must be", "outside the supplement family",
    "must be an array", "unknown rule id F99", "duplicate text", "duplicate id"]) assert.match(joined, new RegExp(want), want);
});

test("counts per stratum, category, language and rule", async () => {
  const m = await load();
  const c = m.counts([row(1), row(2, { stratum: "overclaim", expected_rule_ids: ["F06", "F13"] }), row(3, { lang: "th", category: "cosmetic", expected_rule_ids: ["C01"] })]);
  assert.equal(c.total, 3);
  assert.deepEqual(c.stratum, { compliant: 2, overclaim: 1 });
  assert.equal(c.stratum_category["compliant/cosmetic"], 1);
  assert.equal(c.flagged, 2);
  assert.deepEqual(c.rules, { F06: 1, F13: 1, C01: 1 });
});

test("Cohen's kappa matches hand-computed values", async () => {
  const m = await load();
  // 10 items: both yes 4, both no 4, A-only 1, B-only 1 -> po = 0.8, pe = 0.5*0.5 + 0.5*0.5 = 0.5, kappa = 0.6
  const a = [1, 1, 1, 1, 1, 0, 0, 0, 0, 0], b = [1, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const k = m.cohenKappa(a, b);
  assert.equal(k.po, 0.8); assert.equal(k.pe, 0.5); assert.ok(Math.abs(k.kappa - 0.6) < 1e-12);
  assert.equal(m.cohenKappa([1, 0, 1], [1, 0, 1]).kappa, 1);
  assert.equal(m.cohenKappa([0, 0, 0], [0, 0, 0]).kappa, 1, "all-negative perfect agreement counts as 1");
  assert.ok(m.cohenKappa([1, 0], [0, 1]).kappa < 0);
  assert.throws(() => m.cohenKappa([1], [1, 0]));
});

test("agreement: per family, per rule, any-flag, and disagreements marked for the pharmacist", async () => {
  const m = await load();
  const rules = [{ id: "F06", family: "F" }, { id: "F13", family: "F" }, { id: "C01", family: "C" }, { id: "C03", family: "C" }];
  const rows = [
    row(1, { expected_rule_ids: ["F13"] }), row(2, { expected_rule_ids: [] }),
    row(3, { category: "cosmetic", expected_rule_ids: ["C01"] }), row(4, { category: "cosmetic", expected_rule_ids: [] }),
  ];
  const b = new Map([["PCT-0001", ["F06", "F13"]], ["PCT-0002", []], ["PCT-0003", ["C01"]], ["PCT-0004", ["C03"]]]);
  const ag = m.agreement(rows, b, rules);
  assert.equal(ag.family.F.n, 4); // 2 texts x 2 F rules
  assert.equal(ag.family.C.n, 4);
  assert.equal(ag.family.ALL.n, 8);
  assert.equal(ag.texts_with_disagreement, 2);
  assert.deepEqual(ag.disagreements.map(d => [d.id, d.only_a, d.only_b, d.status]), [
    ["PCT-0001", [], ["F06"], "pending pharmacist adjudication"],
    ["PCT-0004", [], ["C03"], "pending pharmacist adjudication"],
  ]);
  assert.throws(() => m.agreement(rows, new Map(), rules), /no label for PCT-0001/);
});

test("split: stratified 50/50, deterministic for a fixed seed, every id exactly once", async () => {
  const m = await load();
  const rows = [];
  for (let i = 1; i <= 41; i++) rows.push(row(i, { category: i % 3 ? "supplement" : "drug", stratum: i % 2 ? "overclaim" : "compliant" }));
  const s1 = m.split(rows), s2 = m.split(rows);
  assert.deepEqual(s1, s2, "same seed -> same split");
  assert.equal(s1.seed, m.SPLIT_SEED);
  assert.equal(s1.dev.length + s1.heldout.length, rows.length);
  assert.equal(new Set([...s1.dev, ...s1.heldout]).size, rows.length);
  for (const [k, v] of Object.entries(s1.strata)) {
    const n = rows.filter(r => `${r.category}/${r.stratum}` === k).length;
    assert.equal(v.dev, Math.ceil(n / 2), k); assert.equal(v.heldout, Math.floor(n / 2), k);
  }
  assert.notDeepEqual(m.split(rows, "another-seed").dev, s1.dev, "a different seed gives a different split");
});

test("refuses data paths inside the repo; accepts a temp dir outside it", async () => {
  const m = await load();
  assert.equal(m.insideRepo(join(ROOT, "docs", "x.jsonl")), true);
  assert.throws(() => m.assertOutsideRepo(join(ROOT, "set.jsonl")), /outside the repo/);
  const dir = mkdtempSync(join(tmpdir(), "pc-texts-"));
  assert.equal(m.insideRepo(join(dir, "set.jsonl")), false);
  let code = 0;
  try { execFileSync(process.execPath, [TOOL, join(ROOT, "package.json")], { stdio: "pipe" }); } catch (e) { code = e.status; }
  assert.equal(code, 2, "CLI exits 2 on a set inside the repo");
});

test("CLI on a synthetic set outside the repo: counts, kappa, split file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pc-texts-"));
  const set = join(dir, "set.jsonl"), b = join(dir, "b.jsonl"), dis = join(dir, "dis.jsonl"), sp = join(dir, "split.json");
  const rows = [
    row(1, { expected_rule_ids: ["F13"], stratum: "overclaim" }), row(2), row(3, { category: "cosmetic" }),
    row(4, { category: "cosmetic", expected_rule_ids: ["C01"], stratum: "overclaim" }),
  ];
  writeFileSync(set, rows.map(r => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(b, rows.map(r => JSON.stringify({ id: r.id, rule_ids: r.expected_rule_ids, label_by: "agentB" })).join("\n") + "\n");
  const out = JSON.parse(execFileSync(process.execPath, [TOOL, set, "--labels-b", b, "--disagreements", dis, "--split", sp, "--json"], { encoding: "utf8" }));
  assert.equal(out.problems.length, 0);
  assert.equal(out.counts.total, 4);
  assert.equal(out.kappa.family.ALL.kappa, 1);
  assert.equal(out.kappa.texts_with_disagreement, 0);
  assert.equal(out.split.dev + out.split.heldout, 4);
  assert.match(out.sha256, /^[0-9a-f]{64}$/);
  assert.equal(JSON.parse(readFileSync(sp, "utf8")).seed, "lensiq-pc-p1-text-2026-11-09");
});

test("rule draft: ids unique, families match, every pattern compiles, wording is 'risk signal'", () => {
  const j = JSON.parse(readFileSync(join(ROOT, "tools", "pc-rules-draft.json"), "utf8"));
  const ids = j.rules.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const want of ["D01", "D12", "F01", "F18", "H01", "C01", "C06"]) assert.ok(ids.includes(want), want);
  assert.match(j.wording.en, /risk signal/i);
  assert.doesNotMatch(JSON.stringify(j.wording), /illegal/i);
  for (const r of j.rules) {
    assert.equal(r.family, r.id[0], r.id);
    assert.ok(["PRIMARY", "SECONDARY", "UNVERIFIED"].includes(r.status), r.id + " status");
    assert.ok(["text", "absence", "lookup", "image"].includes(r.detect), r.id + " detect");
    assert.match(r.url, /^https:\/\//, r.id + " url");
    assert.match(r.accessed, /^\d{4}-\d{2}-\d{2}$/, r.id);
    assert.ok(r.basis && r.changed_from_2564, r.id);
    for (const lang of ["th", "en", "zh"]) for (const p of r.patterns[lang]) assert.doesNotThrow(() => new RegExp(p, j.regex_flags), `${r.id} ${p}`);
    if (r.detect === "text") assert.ok(r.patterns.th.length + r.patterns.en.length > 0, r.id + " has patterns");
    assert.ok(Array.isArray(r.requires_context), r.id + " requires_context is an array");
  }
  // F18 only fires with kratom / cannabis context (machine-readable, P1 review fix)
  const f18 = j.rules.find(r => r.id === "F18");
  for (const w of ["กระท่อม", "ไมทราไจนีน", "กัญชา", "กัญชง", "CBD", "THC", "kratom", "cannabis", "hemp"]) assert.ok(f18.requires_context.includes(w), w);
  // "อย." (Thai FDA) must match but "อย่าง" (the word "like / manner") must not (P1 review fix)
  const anyTh = (id, s) => j.rules.find(r => r.id === id).patterns.th.some(p => new RegExp(p, j.regex_flags).test(s));
  assert.equal(anyTh("F05", "ผ่าน อย. รับรอง"), true);
  assert.equal(anyTh("F05", "ผ่านอย่างดีเยี่ยม"), false);
  assert.equal(anyTh("F05", "อย่างยืนยัน"), false);
  assert.equal(anyTh("C03", "อย.รับรอง"), true);
});
