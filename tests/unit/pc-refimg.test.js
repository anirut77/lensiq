"use strict";
// tests/unit/pc-refimg.test.js — Product Check P9 reference-image library TOOLING (design §6.3, PC-D7, CTO-BRIEF L19). FIXED TEST,
// written before lensiq-pc-refimg.js and tools/pc-refimg.mjs and locked (sha256 in ~/LENSIQ-field/evals/p9/locked.sha256).
//   - a manifest must name licence, credit, source and date for every photo; only licence kinds of design §6.3 are
//     accepted; own photos of retail packs and agency images need the counsel answer (L19) before they are embedded;
//     user contributions are refused (org-accounts PDPA work first); photos inside the repo are refused;
//   - the library holds EMBEDDINGS ONLY: no image, no pixels, no data: URL, no file path — an allowlist of fields;
//   - matching: identity comes from text (GTIN / registration number); the image flag needs at least 3 references, is weak,
//     and is never shown alone; no verdict words;
//   - nothing is committed: no library and no photo under vendor/ until counsel answers L19.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");
const R = require("../../lensiq-pc-refimg.js");
const OUTSIDE = path.join(os.tmpdir(), "lq-refimg-test");
const entry = (o = {}) => ({ file: path.join(OUTSIDE, "a1.jpg"), key: { gtin: "8850123456787" }, licence: "synthetic", credit: "LENSIQ synthetic test image",
  source: "generated", date: "2026-11-11", ...o });
const man = entries => ({ schema: "lensiq-pc-refimg-manifest/1", entries });
const unit = (n, i, j = -1, w = 0.3) => { const v = new Float32Array(n); v[i] = 1; if (j >= 0) v[j] = w; const s = Math.hypot(...v); return v.map(x => x / s); };

test("manifest: licence, credit, source and date are required; only the licence kinds of design §6.3", () => {
  const ok = R.validateManifest(man([entry()]), { repoRoot: ROOT });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  for (const [bad, why] of [[{ licence: "unknown" }, "licence"], [{ licence: "" }, "licence"], [{ credit: "" }, "credit"], [{ source: "" }, "source"],
    [{ date: "yesterday" }, "date"], [{ key: {} }, "key"], [{ key: { gtin: "123" } }, "gtin"], [{ licence: "user-contribution" }, "user"],
    [{ file: "data:image/jpeg;base64,AAAA" }, "file"], [{ file: path.join(ROOT, "vendor", "x.jpg") }, "repo"]]) {
    const r = R.validateManifest(man([entry(bad)]), { repoRoot: ROOT });
    assert.equal(r.ok, false, why + " " + JSON.stringify(bad));
    assert.ok(r.errors.length >= 1);
  }
  assert.equal(R.validateManifest({ schema: "x", entries: [] }, { repoRoot: ROOT }).ok, false);
  assert.equal(R.validateManifest(man([]), { repoRoot: ROOT }).ok, false, "empty manifest");
});

test("manifest: own retail-pack photos and agency images wait for counsel (L19); a manufacturer licence needs its reference", () => {
  for (const lic of ["own-photo-retail-pack", "public-domain-us-gov"]) {
    const no = R.validateManifest(man([entry({ licence: lic })]), { repoRoot: ROOT });
    assert.equal(no.ok, false, lic);
    assert.ok(no.errors.some(e => /L19/.test(e)), lic + " names L19: " + no.errors);
    assert.equal(R.validateManifest(man([entry({ licence: lic })]), { repoRoot: ROOT, counsel: "L19-cleared" }).ok, true, lic);
  }
  assert.equal(R.validateManifest(man([entry({ licence: "manufacturer-written-licence" })]), { repoRoot: ROOT }).ok, false);
  assert.equal(R.validateManifest(man([entry({ licence: "manufacturer-written-licence", licence_ref: "LQ-LIC-2026-001" })]), { repoRoot: ROOT }).ok, true);
  assert.equal(R.validateManifest(man([entry({ licence: "user-contribution" })]), { repoRoot: ROOT, counsel: "L19-cleared" }).ok, false, "never in this tooling");
});

test("library: embeddings only, an allowlist of fields; no image, pixels, data: URL or file path", () => {
  const lib = R.buildLibrary([{ ...entry(), photo_sha256: "a".repeat(64), vec: unit(8, 0) }, { ...entry({ key: { reg: "1A 844/39" } }), photo_sha256: "b".repeat(64), vec: unit(8, 1) }],
    { embedder: "mnv2", built: "2026-11-11" });
  assert.equal(lib.schema, "lensiq-pc-refimg/1");
  assert.equal(lib.dim, 8);
  assert.equal(lib.embedder, "mnv2");
  const j = JSON.stringify(lib);
  assert.ok(!/data:|base64,|\.jpe?g|\.png|lq-refimg-test|"file"|"image"|"pixels"/i.test(j), j.slice(0, 300));
  for (const e of lib.entries) assert.deepEqual(Object.keys(e).sort(), ["credit", "date", "key", "licence", "licence_ref", "photo_sha256", "source", "vec"].filter(k => k in e).sort());
  assert.deepEqual(Array.from(R.decodeVec(lib.entries[0].vec)).map(x => +x.toFixed(5)), Array.from(unit(8, 0)).map(x => +x.toFixed(5)));
  assert.equal(R.validateLibrary(lib).ok, true);
  for (const plant of [e => { e.image = "x"; }, e => { e.credit = "data:image/png;base64,AAAA"; }, e => { e.vec = R.encodeVec(new Float32Array(4)); }, e => { e.file = "/tmp/a.jpg"; }]) {
    const bad = JSON.parse(j);
    plant(bad.entries[0]);
    assert.equal(R.validateLibrary(bad).ok, false, String(plant));
  }
});

test("matching: identity from text; at least 3 references; weak flag only, never alone, no verdict words", () => {
  const refs = [unit(16, 0, 1, 0.2), unit(16, 0, 2, 0.2), unit(16, 0, 3, 0.2)];
  const mk = vs => R.buildLibrary(vs.map((v, i) => ({ ...entry(), photo_sha256: String(i).repeat(64), vec: v })), { embedder: "mnv2", built: "2026-11-11" });
  const two = R.compare(mk(refs.slice(0, 2)), { gtin: "8850123456787" }, unit(16, 0, 4, 0.2));
  assert.equal(two.state, "too-few");
  assert.equal(two.n, 2);
  const lib = mk(refs);
  const same = R.compare(lib, { gtin: "08850123456787" }, unit(16, 0, 4, 0.2));
  assert.equal(same.state, "similar", JSON.stringify(same));
  const diff = R.compare(lib, { gtin: "8850123456787" }, unit(16, 9, 10, 0.5));
  assert.equal(diff.state, "looks-different", JSON.stringify(diff));
  for (const r of [two, same, diff]) { assert.equal(r.weak, true); assert.equal(r.standalone, false); }
  assert.equal(R.compare(lib, { gtin: "4006381333931" }, unit(16, 0)).state, "no-references");
  assert.equal(R.MIN_REFS, 3);
  assert.ok(!/fake|counterfeit|genuine|authentic|ปลอม|ของแท้|假冒|正品/i.test(JSON.stringify([two, same, diff]) + JSON.stringify(R.STATES || {})));
});

test("the tool refuses photos or output inside the repo before it starts a browser", () => {
  fs.mkdirSync(OUTSIDE, { recursive: true });
  const mf = path.join(OUTSIDE, "manifest.json");
  fs.writeFileSync(mf, JSON.stringify(man([entry({ file: path.join(ROOT, "index.html") })])));
  const r = spawnSync(process.execPath, [path.join(ROOT, "tools/pc-refimg.mjs"), "embed", "--manifest", mf, "--out", path.join(OUTSIDE, "lib.json")], { encoding: "utf8", timeout: 20000 });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /repo/i);
  fs.writeFileSync(mf, JSON.stringify(man([entry()])));
  const o = spawnSync(process.execPath, [path.join(ROOT, "tools/pc-refimg.mjs"), "embed", "--manifest", mf, "--out", path.join(ROOT, "vendor", "lib.json")], { encoding: "utf8", timeout: 20000 });
  assert.equal(o.status, 2, o.stdout + o.stderr);
  assert.ok(!fs.existsSync(path.join(ROOT, "vendor", "lib.json")));
});

test("nothing committed before counsel: no reference library, no pack photo", () => {
  assert.ok(!fs.existsSync(path.join(ROOT, "vendor", "pc-refimg")), "vendor/pc-refimg/ must not exist before L19 is answered");
  const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n");
  assert.ok(!files.some(f => /refimg/i.test(f) && /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(f)), "no reference photo in git");
});
