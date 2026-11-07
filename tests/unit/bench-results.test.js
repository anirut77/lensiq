"use strict";
// node --test tests/unit/bench-results.test.js — tests/bench/results.mjs: committed benchmark summaries are numbers only
// (no images, no dataset files), carry a reproduce command and a dataset fingerprint (or a note why there is none), and
// headlines.json matches docs/accuracy-figures.json (what the pages quote).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const root = path.join(__dirname, "..", "..");
const lib = () => import(path.join(root, "tests", "bench", "results.mjs"));

test("every committed summary in tests/bench/results/ validates", async () => {
  const { validate, OUT } = await lib();
  const files = fs.readdirSync(OUT).filter(f => f.endsWith(".json"));
  assert.ok(files.includes("headlines.json"));
  for (const f of files) assert.deepEqual(validate(JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")), f), [], f);
  // nothing but JSON summaries in the folder (never images or dataset files)
  for (const f of fs.readdirSync(OUT)) assert.match(f, /\.json$/, "unexpected file " + f);
});

test("headlines.json is current with docs/accuracy-figures.json", async () => {
  const { OUT } = await lib();
  const h = JSON.parse(fs.readFileSync(path.join(OUT, "headlines.json"), "utf8"));
  const fig = JSON.parse(fs.readFileSync(path.join(root, "docs", "accuracy-figures.json"), "utf8"));
  assert.deepEqual(Object.keys(h.figures).sort(), Object.keys(fig.figures).sort(), "run: node tests/bench/results.mjs headlines");
  for (const [k, v] of Object.entries(fig.figures)) assert.equal(h.figures[k].value, v.value, k + " — run: node tests/bench/results.mjs headlines");
});

test("assertNumbersOnly refuses images and blobs; validate needs a fingerprint or a reason", async () => {
  const { assertNumbersOnly, validate } = await lib();
  assert.throws(() => assertNumbersOnly({ a: "data:image/png;base64,AAAA" }), /data: image/);
  assert.throws(() => assertNumbersOnly({ a: "Q".repeat(3000) }), /base64/);
  assert.doesNotThrow(() => assertNumbersOnly({ recall: 0.37, rows: [{ seq: "MOT17-02", net: -0.026 }] }));
  const ok = { format: "lensiq-bench-summary", reproduce: "node x", datasets: { mot: { sha256: "a".repeat(64) } } };
  assert.deepEqual(validate(ok), []);
  assert.ok(validate({ ...ok, datasets: { mot: { sha256: null } } }).some(e => /no fingerprint and no note/.test(e)));
  assert.ok(validate({ ...ok, datasets: { mot: { sha256: "xyz" } } }).some(e => /64 hex/.test(e)));
});

test("hashDir: stable, order-independent, sensitive to content and names", async () => {
  const { hashDir } = await lib();
  const a = fs.mkdtempSync(path.join(os.tmpdir(), "lq-hash-"));
  try {
    fs.mkdirSync(path.join(a, "s")); fs.writeFileSync(path.join(a, "s", "1.txt"), "one"); fs.writeFileSync(path.join(a, "2.txt"), "two");
    fs.writeFileSync(path.join(a, ".lq-cache"), "ignored");
    const h1 = hashDir(a);
    assert.equal(h1.files, 2); assert.match(h1.sha256, /^[0-9a-f]{64}$/);
    assert.equal(hashDir(a).sha256, h1.sha256);
    fs.writeFileSync(path.join(a, "2.txt"), "TWO");
    assert.notEqual(hashDir(a).sha256, h1.sha256);
  } finally { fs.rmSync(a, { recursive: true, force: true }); }
});
