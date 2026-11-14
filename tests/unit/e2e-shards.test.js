// tests/unit/e2e-shards.test.js — CI e2e shards (owner decision 2026-11-11, gate time option ค): the split covers every file
// exactly once for any shard count, and the shard check fails on every way a file could be missed or run twice. The CI
// workflow wires 3 shards, one site-wide check per shard, and two phone / language parts with every gate step in one part.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const load = () => import("../../tools/e2e-shards.mjs");
const CI = readFileSync(join(__dirname, "..", "..", ".github", "workflows", "ci.yml"), "utf8");

test("assign: every file in exactly one shard, for 1..6 shards, deterministic, balanced", async () => {
  const m = await load();
  const files = m.allFiles(), w = m.weights();
  assert.ok(files.length > 50, "found the e2e files");
  for (let n = 1; n <= 6; n++) {
    const a = m.assign(files, w, n);
    assert.equal(a.length, n);
    const flat = a.flat();
    assert.equal(flat.length, files.length, `n=${n}: no file twice`);
    assert.deepEqual([...flat].sort(), files, `n=${n}: no file missing`);
    assert.deepEqual(m.assign(files, w, n), a, `n=${n}: same split every time`);
  }
  const t = m.assign(files, w, 3).map(s => s.reduce((x, f) => x + (w[f] || 0), 0));
  assert.ok(Math.max(...t) - Math.min(...t) <= Math.max(...Object.values(w)), "shards within one file of each other: " + t);
  // a new file with no weight still lands somewhere, exactly once
  const more = [...files, "zz-new.e2e.mjs"];
  assert.equal(m.assign(more, w, 3).flat().filter(f => f === "zz-new.e2e.mjs").length, 1);
  assert.throws(() => m.assign(files, w, 0));
  assert.throws(() => m.parseShard("4/3"));
  assert.throws(() => m.parseShard("0/3"));
  assert.deepEqual(m.parseShard("2/3"), { i: 2, n: 3 });
});

test("checkManifests: OK only when every file ran exactly once in the shard it was given", async () => {
  const m = await load();
  const files = ["a.e2e.mjs", "b.e2e.mjs", "c.e2e.mjs", "d.e2e.mjs"];
  const sh = m.assign(files, {}, 3);
  const good = () => sh.map((s, i) => ({ shard: i + 1, total: 3, assigned: [...s], ran: [...s] }));
  assert.deepEqual(m.checkManifests(good(), files), []);
  const cases = [
    ["a shard missing", l => l.slice(1), /no manifest/],
    ["no manifest at all", () => [], /no shard manifest/],
    ["a file not run", l => { l[0].ran = l[0].ran.slice(1); return l; }, /did not run|ran 0 time/],
    ["a file run twice", l => { l[1].ran.push(l[0].ran[0]); l[1].assigned.push(l[0].ran[0]); return l; }, /ran 2 time/],
    ["a file never assigned", l => { l[0].assigned = l[0].assigned.filter(f => f !== "d.e2e.mjs"); l[0].ran = l[0].ran.filter(f => f !== "d.e2e.mjs");
      l[1].assigned = l[1].assigned.filter(f => f !== "d.e2e.mjs"); l[1].ran = l[1].ran.filter(f => f !== "d.e2e.mjs");
      l[2].assigned = l[2].assigned.filter(f => f !== "d.e2e.mjs"); l[2].ran = l[2].ran.filter(f => f !== "d.e2e.mjs"); return l; }, /d\.e2e\.mjs: ran 0 time/],
    ["an unknown file", l => { l[0].ran.push("x.e2e.mjs"); l[0].assigned.push("x.e2e.mjs"); return l; }, /not a test file/],
    ["ran a file it was not given", l => { const f = l[1].assigned.pop(); l[0].ran.push(f); l[1].ran = l[1].ran.filter(x => x !== f); return l; }, /was not given/],
    ["a shard reported twice", l => [...l, { ...l[0] }], /reported twice/],
    ["shard counts disagree", l => { l[2].total = 4; return l; }, /disagree/]
  ];
  for (const [name, f, re] of cases) {
    const errs = m.checkManifests(f(good()), files);
    assert.ok(errs.some(e => re.test(e)), `${name}: ${JSON.stringify(errs)}`);
  }
});

// 2026-11-14 (coordinator decision, option 1; re-lock recorded in evals-locks/phone-quality.sha256): the WebKit files
// form a 4th shard on macOS (Linux WebKit plays no camera video). The guarantees stay: every file in exactly one shard,
// the Linux shards balanced, all 4 manifests checked by the same job.
test("assign macLast: WebKit files only in the last shard, the rest exactly as assign(rest, n-1), every file once", async () => {
  const m = await load();
  const files = m.allFiles(), w = m.weights();
  const mac = files.filter(m.isMacFile);
  assert.ok(mac.length >= 2 && mac.every(f => /webkit/.test(f)), "WebKit files found: " + mac);
  for (let n = 2; n <= 6; n++) {
    const a = m.assign(files, w, n, { macLast: true });
    assert.equal(a.length, n);
    const flat = a.flat();
    assert.equal(flat.length, files.length, `n=${n}: no file twice`);
    assert.deepEqual([...flat].sort(), files, `n=${n}: no file missing`);
    assert.deepEqual(a[n - 1], [...mac].sort(), `n=${n}: the last shard is exactly the WebKit files`);
    assert.ok(a.slice(0, -1).flat().every(f => !m.isMacFile(f)), `n=${n}: no WebKit file in a Linux shard`);
    assert.deepEqual(a.slice(0, -1), m.assign(files.filter(f => !m.isMacFile(f)), w, n - 1), `n=${n}: Linux shards = the plain split`);
    assert.deepEqual(m.assign(files, w, n, { macLast: true }), a, `n=${n}: same split every time`);
  }
  assert.throws(() => m.assign(files, w, 1, { macLast: true }));
  // a new WebKit file lands on the macOS shard, a new other file on a Linux shard, each exactly once
  const more = [...files, "zz-new-webkit.e2e.mjs", "zz-new.e2e.mjs"];
  const b = m.assign(more, w, 4, { macLast: true });
  assert.ok(b[3].includes("zz-new-webkit.e2e.mjs") && b.flat().filter(f => f.startsWith("zz-new")).length === 2);
  assert.ok(b.slice(0, 3).flat().includes("zz-new.e2e.mjs"));
  const sh = m.assign(files, w, 4, { macLast: true });
  const good = () => sh.map((s, i) => ({ shard: i + 1, total: 4, assigned: [...s], ran: [...s] }));
  assert.deepEqual(m.checkManifests(good(), files), [], "4 manifests, every file once: OK");
  const noMac = good().slice(0, 3);
  assert.ok(m.checkManifests(noMac, files).some(e => /shard 4\/4: no manifest/.test(e)), "a missing macOS manifest fails the check");
});

test("ci.yml: 3 Linux e2e shards + the macOS WebKit shard with manifests and the check job; site checks once each; audit steps split into two parts", () => {
  assert.match(CI, /shard: \[1, 2, 3\]/);
  assert.match(CI, /npm run test:e2e:ci -- --shard=\$\{\{ matrix\.shard \}\}\/4 --mac-last --manifest=e2e-shard-\$\{\{ matrix\.shard \}\}\.json/);
  const macJob = CI.slice(CI.indexOf("  e2e-webkit-mac:"), CI.indexOf("  e2e-shards:"));
  assert.match(macJob, /runs-on: macos-latest/);
  assert.match(macJob, /npm run test:e2e:ci -- --shard=4\/4 --mac-last --manifest=e2e-shard-4\.json/);
  assert.match(macJob, /if: always\(\)\n\s+with:\n\s+name: e2e-shard-4\n\s+path: e2e-shard-4\.json/);
  assert.doesNotMatch(CI.slice(0, CI.indexOf("  e2e-webkit-mac:")), /playwright install/, "no WebKit install in the Linux jobs (no WebKit file runs there)");
  assert.match(CI, /e2e-shards:\n[\s\S]*?needs: \[e2e, e2e-webkit-mac\]\n\s+if: always\(\)[\s\S]*?node tools\/e2e-shards\.mjs --check e2e-shards/);
  for (const [k, re] of [[1, /check-site\.mjs/], [2, /check-external\.mjs/], [3, /check-csp\.mjs/]]) {
    const block = CI.split("\n      - name: ").find(b => re.test(b) && /matrix\.shard ==/.test(b));
    assert.ok(block && block.includes(`if: matrix.shard == ${k}`), `site check ${re} runs in shard ${k} only`);
  }
  assert.match(CI, /part: \[phone, language\]/);
  const audits = CI.slice(CI.indexOf("  browser-audits:"));
  const steps = audits.split("\n      - ").slice(1);
  const gate = steps.slice(steps.findIndex(s => s.startsWith("name: Thai + CJK fonts")) + 1);
  assert.ok(gate.length >= 9, "gate steps found");
  const parts = gate.map(s => (/matrix\.part == '(phone|language)'/.exec(s) || [])[1]);
  assert.ok(parts.every(Boolean), "every gate step belongs to exactly one part: " + JSON.stringify(parts));
  assert.deepEqual([...new Set(parts)].sort(), ["language", "phone"]);
});
