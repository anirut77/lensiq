// tests/unit/plate-train-prep.test.js — the Thai plate-detector training path for the owner's own photos (stream H,
// 2026-11-13): tools/plate-train-prep.mjs (folder rule, the FIXED train / val / test split rule, privacy regions and the
// "faces checked" gate, COCO export without plate text, the held-out labels for the field eval) and the comparison rule of
// tools/plate-det-compare.mjs (a trained detector replaces nothing unless it beats the shipped detector on the locked
// field test split). Locked before the tools were written (hashes in ~/LENSIQ-field/evals/gate-hall-h/locked.sha256).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");

const repo = path.join(__dirname, "..", "..");
const prep = () => import(path.join(repo, "tools", "plate-train-prep.mjs"));
const cmp = () => import(path.join(repo, "tools", "plate-det-compare.mjs"));
const evalTool = () => import(path.join(repo, "tools", "plate-field-eval.mjs"));

/** a valid W x H grey PNG (no image library) */
function png(W, H) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => {
    const l = Buffer.alloc(4), c = Buffer.alloc(4), td = Buffer.concat([Buffer.from(t), d]); l.writeUInt32BE(d.length); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc((W + 1) * H, 128); for (let y = 0; y < H; y++) raw[y * (W + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
/** a minimal baseline JPEG header with an SOF0 of W x H (enough for the size reader) */
function jpegHead(W, H) {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, H >> 8, H & 255, W >> 8, W & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF\0"), Buffer.alloc(9), sof, Buffer.from([0xff, 0xd9])]);
}
const HEAD = "file,category,plate,province,x0,y0,x1,y1,split,sure,notes";

test("split rule: frozen and versioned, 70 / 15 / 15 by a salted SHA-256 of the group key", async () => {
  const { SPLIT_RULE, bucket } = await prep();
  assert.ok(Object.isFrozen(SPLIT_RULE));
  assert.deepEqual({ ...SPLIT_RULE }, { version: "plate-split-v1", salt: "lensiq-plate-split:v1", train: 70, val: 15 });
  for (const key of ["กข1234", "photo-none:IMG_0001.jpg", "1กข2345"]) {
    const v = parseInt(crypto.createHash("sha256").update(SPLIT_RULE.salt + ":" + key).digest("hex").slice(0, 8), 16) % 100;
    assert.equal(bucket(key), v < 70 ? "train" : v < 85 ? "val" : "test", key);
  }
  // roughly 70 / 15 / 15 over many keys
  const n = { train: 0, val: 0, test: 0 };
  for (let i = 0; i < 4000; i++) n[bucket("k" + i)]++;
  assert.ok(Math.abs(n.train / 4000 - 0.7) < 0.03 && Math.abs(n.val / 4000 - 0.15) < 0.03 && Math.abs(n.test / 4000 - 0.15) < 0.03, JSON.stringify(n));
});

test("split groups: photos sharing a plate (also across two photos with two plates) stay in ONE split; plate-less photos are their own group", async () => {
  const { groups, makeSplit } = await prep();
  const { parseLabels } = await evalTool();
  const { photos } = parseLabels([HEAD,
    "a.jpg,white,กข 1234,,,,,,,,", "b.jpg,white,กข 1234,,,,,,,,",            // same car twice
    "c.jpg,white,กข 1234,,,,,,,,", "c.jpg,yellow,1ทก 77,,,,,,,,",           // c links 1234 with 1ทก77
    "d.jpg,yellow,1ทก 77,,,,,,,,",                                            // so a, b, c, d are one group
    "e.jpg,moto,1กข 123,,,,,,,,", "n1.jpg,none,,,,,,,,,", "n2.jpg,none,,,,,,,,,"].join("\n"));
  const g = groups(photos);
  assert.equal(g.get("a.jpg"), g.get("d.jpg"));
  assert.equal(g.get("b.jpg"), g.get("c.jpg"));
  assert.notEqual(g.get("a.jpg"), g.get("e.jpg"));
  assert.notEqual(g.get("n1.jpg"), g.get("n2.jpg"));
  assert.equal(g.get("n1.jpg"), "photo-none:n1.jpg");
  const s = makeSplit(photos);
  assert.equal(s.rule, "plate-split-v1");
  assert.equal(new Set(["a.jpg", "b.jpg", "c.jpg", "d.jpg"].map(f => s.files[f])).size, 1);
  assert.equal(Object.keys(s.files).length, 7);
  assert.match(s.sha256, /^[0-9a-f]{64}$/);
  // deterministic: the same photos in another order give the same split and hash
  const again = makeSplit(new Map([...photos.entries()].reverse()));
  assert.deepEqual(again.files, s.files); assert.equal(again.sha256, s.sha256);
});

test("split lock: written once per rule version; a different split under the same version is refused (no silent re-split)", async () => {
  const { lockSplit } = await prep();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lq-ptp-"));
  const lock = path.join(dir, "locked.sha256");
  const s = { rule: "plate-split-v1", sha256: "a".repeat(64), files: { "x.jpg": "test" } };
  assert.equal(lockSplit(s, lock).locked, true);
  assert.equal(lockSplit(s, lock).locked, false, "same split again: nothing new");
  assert.throws(() => lockSplit({ ...s, sha256: "b".repeat(64) }, lock), /already locked/);
  assert.match(fs.readFileSync(lock, "utf8"), /plate-split-v1 a{64}/);
});

test("folder rule: the training root must be OUTSIDE the repo (photos of plates and people are personal data)", async () => {
  const { checkRoot, paths } = await prep();
  assert.throws(() => checkRoot(path.join(repo, "field-data", "plates-train"), repo), /outside the repo/);
  assert.throws(() => checkRoot(repo, repo), /outside the repo/);
  assert.equal(checkRoot(path.join(os.homedir(), "LENSIQ-field", "plates-train"), repo), true);
  const p = paths("/x/plates-train");
  assert.deepEqual(Object.keys(p).sort(), ["blurred", "consent", "dataset", "labels", "photos", "privacy", "runs", "splits"]);
  assert.equal(p.photos, "/x/plates-train/photos");
  assert.equal(p.labels, "/x/plates-train/labels/plates-photo-labels.csv");
  assert.equal(p.privacy, "/x/plates-train/labels/privacy.json");
});

test("privacy file: every photo needs 'checked' by a person; boxes kept in pixels with a kind; bad entries listed", async () => {
  const { parsePrivacy } = await prep();
  const r = parsePrivacy(JSON.stringify({ v: 1, files: {
    "a.jpg": { checked: true, regions: [[10, 10, 50, 60, "face"], [100, 20, 140, 70, "auto-face"]] },
    "b.jpg": { checked: false, regions: [] },
    "c.jpg": { checked: true, regions: [[5, 5, 4, 9, "face"]] }
  } }));
  assert.equal(r.files["a.jpg"].checked, true);
  assert.equal(r.files["a.jpg"].regions.length, 2);
  assert.equal(r.files["b.jpg"].checked, false);
  assert.equal(r.errors.length, 1); assert.match(r.errors[0], /c\.jpg/);
  assert.equal(parsePrivacy("not json").errors.length, 1);
});

test("image size: JPEG (SOF) and PNG headers, no image library", async () => {
  const { imageSize } = await prep();
  assert.deepEqual(imageSize(png(37, 21)), [37, 21]);
  assert.deepEqual(imageSize(jpegHead(1920, 1080)), [1920, 1080]);
  assert.equal(imageSize(Buffer.from("nope")), null);
});

test("COCO export: one class 'plate' (id 1), boxes only, NO plate text or province in the training files", async () => {
  const { buildCoco } = await prep();
  const c = buildCoco([
    { name: "train_000000.jpg", width: 1280, height: 720, plates: [{ box: [100, 200, 260, 270], text: "กข 1234", province: "bangkok" }] },
    { name: "train_000001.jpg", width: 800, height: 600, plates: [] }
  ]);
  assert.deepEqual(c.categories, [{ id: 1, name: "plate" }]);
  assert.equal(c.images.length, 2); assert.equal(c.annotations.length, 1);
  assert.deepEqual(c.annotations[0].bbox, [100, 200, 160, 70]);
  assert.equal(c.annotations[0].category_id, 1); assert.equal(c.annotations[0].area, 160 * 70);
  const s = JSON.stringify(c);
  assert.doesNotMatch(s, /กข|1234|bangkok|province|text|plate"\s*:\s*"/);
});

test("export: only photos marked 'faces checked' AND blurred are exported; unchecked ones are listed, never copied", async () => {
  const { exportDataset, makeSplit } = await prep();
  const { parseLabels } = await evalTool();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lq-ptp-root-"));
  for (const d of ["photos", "blurred", "labels"]) fs.mkdirSync(path.join(root, d));
  const names = Array.from({ length: 12 }, (_, i) => `p${i}.png`);
  const rows = [HEAD];
  names.forEach((f, i) => {
    fs.writeFileSync(path.join(root, "photos", f), png(64, 48));
    if (i !== 3) fs.writeFileSync(path.join(root, "blurred", f), png(64, 48)); // p3 not blurred yet
    rows.push(i < 10 ? `${f},white,กข ${1000 + i},,4,4,40,20,,,` : `${f},none,,,,,,,,,`);
  });
  const text = rows.join("\n");
  fs.writeFileSync(path.join(root, "labels", "plates-photo-labels.csv"), text);
  const privacy = { v: 1, files: Object.fromEntries(names.map((f, i) => [f, { checked: i !== 5, regions: [] }])) }; // p5 unchecked
  fs.writeFileSync(path.join(root, "labels", "privacy.json"), JSON.stringify(privacy));
  const { photos } = parseLabels(text);
  const split = makeSplit(photos);
  const r = exportDataset({ root, photos, privacy: privacy.files, split });
  assert.deepEqual(r.refused.map(x => x.file).sort(), ["p3.png", "p5.png"]);
  assert.match(r.refused.find(x => x.file === "p5.png").why, /not checked/);
  assert.match(r.refused.find(x => x.file === "p3.png").why, /not blurred/);
  const parts = ["train", "val", "test"];
  let n = 0;
  for (const part of parts) {
    const j = JSON.parse(fs.readFileSync(path.join(root, "dataset", "annotations", `${part}.json`), "utf8"));
    n += j.images.length;
    for (const im of j.images) assert.ok(fs.existsSync(path.join(root, "dataset", `${part}2017`, im.file_name)));
    assert.doesNotMatch(JSON.stringify(j), /กข/);
  }
  assert.equal(n, 10);
  // the held-out labels for the field eval: plate text kept there only (eval needs it), split column = heldout
  const held = fs.readFileSync(path.join(root, "dataset", "test2017", "plates-photo-labels.csv"), "utf8");
  const testFiles = JSON.parse(fs.readFileSync(path.join(root, "dataset", "annotations", "test.json"), "utf8")).images.map(i => i.file_name);
  for (const f of testFiles) assert.match(held, new RegExp(`^${f.replace(".", "\\.")},`, "m"));
  for (const line of held.trim().split("\n").slice(1)) assert.equal(line.split(",")[8], "heldout");
  // a mapping file says which original photo became which exported file (stays outside the repo)
  assert.ok(fs.existsSync(path.join(root, "dataset", "MANIFEST.json")));
});

test("compare rule: the trained detector is adopted only if it beats the shipped one on the locked field test split", async () => {
  const { RULE, decide } = await cmp();
  assert.ok(Object.isFrozen(RULE));
  assert.equal(RULE.version, "plate-compare-v1");
  assert.equal(RULE.minPlatePhotos, 60); assert.equal(RULE.minNonePhotos, 15); assert.equal(RULE.maxExtraMs, 600);
  const s = (o = {}) => ({ platePhotos: 90, nonePhotos: 20, det: 40, exact: 30, falseNone: 0, falsePlate: 0, wrong: 2, taps: 60, msMedian: 1500, ...o });
  const ok = decide(s(), s({ det: 60, exact: 34, taps: 56, msMedian: 1900 }));
  assert.equal(ok.adopt, true, JSON.stringify(ok));
  assert.equal(ok.rules.length, 7);
  assert.equal(decide(s(), s({ det: 40 })).adopt, false, "detection must be strictly better");
  assert.equal(decide(s(), s({ det: 60, exact: 29 })).adopt, false, "exact reads may not drop");
  assert.equal(decide(s(), s({ det: 60, falseNone: 1 })).adopt, false, "no extra false auto-read on plate-less photos");
  assert.equal(decide(s(), s({ det: 60, falsePlate: 1 })).adopt, false);
  assert.equal(decide(s(), s({ det: 60, wrong: 3 })).adopt, false, "no extra wrong text");
  assert.equal(decide(s(), s({ det: 60, taps: 61 })).adopt, false, "taps needed may not rise");
  assert.equal(decide(s(), s({ det: 60, msMedian: 2101 })).adopt, false, "at most +600 ms per photo");
  const small = decide(s({ platePhotos: 59 }), s({ platePhotos: 59, det: 60 }));
  assert.equal(small.adopt, null); assert.match(small.note, /not enough/);
});

test("compare: field summary -> the numbers the rule reads (shipped path)", async () => {
  const { fromRun } = await cmp();
  const W = (x, n) => ({ x, n, p: n ? x / n : null });
  const run = { summary: { "all plates": { photos: 90, det: W(40, 90), after: { exact: W(30, 70), false: 1, wrong: 2 }, tapsNeeded: W(60, 90) },
    none: { photos: 20, after: { false: 0 } } }, results: [{ ms: 1000 }, { ms: 2000 }, { ms: 1500 }] };
  assert.deepEqual(fromRun(run), { platePhotos: 90, nonePhotos: 20, det: 40, exact: 30, falseNone: 0, falsePlate: 1, wrong: 2, taps: 60, msMedian: 1500 });
});

test("plate-field-eval: --det-model takes a trained ONNX from OUTSIDE the repo; inside the repo it must be under vendor/models/", async () => {
  const { parseArgs, checkModel } = await evalTool();
  const a = parseArgs(["--det-model", "/tmp/x/plate.onnx"], { HOME: "/h" });
  assert.equal(a.detModel, "/tmp/x/plate.onnx");
  assert.equal(parseArgs([], { HOME: "/h" }).detModel, null);
  assert.equal(checkModel("/tmp/x/plate.onnx", repo), true);
  assert.equal(checkModel(path.join(repo, "vendor", "models", "plate-det-th", "p.onnx"), repo), true);
  assert.throws(() => checkModel(path.join(repo, "docs", "p.onnx"), repo), /vendor\/models/);
  assert.throws(() => checkModel("/tmp/x/plate.txt", repo), /\.onnx/);
});
