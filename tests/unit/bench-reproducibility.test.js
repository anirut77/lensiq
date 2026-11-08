"use strict";
// node --test tests/unit/bench-reproducibility.test.js — round 12 reproducibility tooling: the dataset manifest
// (tests/bench/results.mjs manifest: file-list fingerprints, "not reproducible here: datasets absent"), the figure ->
// bench map behind the headline statuses and the --strict check, the soak drift report (tests/bench/soak.mjs) and the
// held-out camera-health scoring (tests/bench/health-holdout.mjs).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const root = path.join(__dirname, "..", "..");
const results = () => import(path.join(root, "tests", "bench", "results.mjs"));

test("hashList: file-list fingerprint (names + sizes) is stable and sensitive to a missing / truncated file", async () => {
  const { hashList } = await results();
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "lq-list-"));
  try {
    fs.mkdirSync(path.join(d, "a")); fs.writeFileSync(path.join(d, "a", "1.jpg"), "xxxx"); fs.writeFileSync(path.join(d, "2.txt"), "yy");
    const h = hashList(d);
    assert.equal(h.files, 2); assert.equal(h.bytes, 6); assert.match(h.listSha256, /^[0-9a-f]{64}$/);
    assert.equal(hashList(d).listSha256, h.listSha256);
    fs.writeFileSync(path.join(d, "2.txt"), "y"); assert.notEqual(hashList(d).listSha256, h.listSha256, "truncated");
    fs.rmSync(path.join(d, "a", "1.jpg")); assert.equal(hashList(d).files, 1);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test("buildManifest: present datasets get a fingerprint; absent ones say 'not reproducible here: datasets absent'", async () => {
  const { buildManifest, validate, ABSENT } = await results();
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "lq-man-"));
  try {
    fs.mkdirSync(path.join(d, "mot")); fs.writeFileSync(path.join(d, "mot", "gt.txt"), "1,2,3");
    const m = buildManifest(d);
    assert.equal(m.datasets.mot.status, "present"); assert.match(m.datasets.mot.listSha256, /^[0-9a-f]{64}$/);
    assert.equal(m.datasets.lfw.status, "absent"); assert.ok(m.datasets.lfw.note.startsWith(ABSENT));
    assert.equal(m.benches.people.reproducibleHere, true); assert.equal(m.benches.people.status, "reproducible here");
    assert.equal(m.benches.face.reproducibleHere, false); assert.match(m.benches.face.status, /datasets absent: lfw, utk/);
    assert.equal(m.benches.qc.reproducibleHere, true, "synthetic benches need no data");
    assert.deepEqual(validate(m, "manifest"), []);
    assert.ok(buildManifest("").benches.people.status.startsWith(ABSENT));
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test("every customer-facing figure maps to a bench; headlines carry an explicit status, never a bare null", async () => {
  const { benchOfFigure, BENCHES, unfingerprinted } = await results();
  const fig = JSON.parse(fs.readFileSync(path.join(root, "docs", "accuracy-figures.json"), "utf8"));
  for (const k of Object.keys(fig.figures)) assert.ok(BENCHES[benchOfFigure(k)], k + " has no bench");
  const h = JSON.parse(fs.readFileSync(path.join(root, "tests", "bench", "results", "headlines.json"), "utf8"));
  for (const [k, v] of Object.entries(h.datasets)) assert.ok(v.sha256 || (typeof v.status === "string" && v.status.length > 10), k);
  for (const [k, v] of Object.entries(h.figures)) assert.ok(typeof v.status === "string" && v.bench, k);
  // --strict lists what still has to be re-run (all of it today: no dataset on this machine)
  const u = unfingerprinted(h);
  assert.ok(u.some(x => /^dr2s \(driver-session: (lfwfull|cew)\)$/.test(x)));
  assert.ok(!u.some(x => /^qc/.test(x)), "synthetic qc figures need no fingerprint");
  const ok = { ...h, datasets: Object.fromEntries(Object.keys(h.datasets).map(n => [n, { sha256: "a".repeat(64) }])) };
  assert.deepEqual(unfingerprinted(ok), []);
  // the committed manifest exists and validates
  assert.ok(fs.existsSync(path.join(root, "tests", "bench", "results", "manifest.json")));
});

test("soak drift report: flags leaks / rate drop / under-recorded hidden time, quiet on a stable run", async () => {
  const { drift } = await import(path.join(root, "tests", "bench", "soak.mjs"));
  const rows = Array.from({ length: 25 }, (_, i) => ({ min: i * 5, heapMB: 4 + 0.001 * i, rssMB: 800, nodes: 5000, hz: 5, exceptions: 0, offlineSec: 600, gaps: 4 }));
  const ok = drift(rows, { injectedHiddenSec: 600 });
  assert.equal(ok.verdict, "stable", ok.flags.join());
  const leak = rows.map(r => ({ ...r, heapMB: 4 + r.min / 60 * 12, hz: r.min > 60 ? 3 : 5, offlineSec: 300 }));
  const bad = drift(leak, { injectedHiddenSec: 600 });
  assert.equal(bad.verdict, "check");
  assert.ok(bad.flags.some(f => /heap grows/.test(f)) && bad.flags.some(f => /rate dropped 40%/.test(f)) && bad.flags.some(f => /under-recorded/.test(f)), bad.flags.join("; "));
  const short = rows.slice(0, 5).map(r => ({ ...r, heapMB: 4 + r.min }));
  assert.ok(!drift(short).flags.some(f => /heap/.test(f)), "slopes from < 60 min are not flagged");
});

test("health hold-out: shipped thresholds are scored on sequences the tuning never saw", async () => {
  const H = await import(path.join(root, "tests", "bench", "health-holdout.mjs"));
  const out = { degrade: "shake:0.02", tracking: [{ per: [{ seq: "PETS09-S2L1", countErr: 0.22, evP: 0.79 }, { seq: "MOT17-04", countErr: 0.3, evP: 0.7 }] }],
    health: { "PETS09-S2L1": { anyWarn: 0.92, flags: { shake: 0.92 } }, "MOT17-04": { anyWarn: 0.2, flags: {} } } };
  const cases = H.casesOf(out);
  assert.equal(cases.length, 2);
  const r = H.report(cases);
  assert.equal(r.tuneScore.caught, 1); assert.equal(r.holdoutScore.missed, 1);
  assert.deepEqual(r.holdoutScore.missedCases, ["MOT17-04 shake:0.02"]);
  assert.equal(r.status, "measured");
  assert.match(H.report(cases.slice(0, 1)).status, /no hold-out cases/);
  assert.equal(H.HARM.netErr, 0.10);
});
