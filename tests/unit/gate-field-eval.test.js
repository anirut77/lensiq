// tests/unit/gate-field-eval.test.js — tools/plate-field-eval.mjs (owner plate-photo set): arguments, the "outside the repo"
// rule, the labelling sheet, folder matching, per-photo scoring (detection, exact read, false / wrong auto-reads before and
// after the plate-likeness guard, taps needed) and the report. Runs the whole tool on a tiny generated folder in the OS temp
// directory with the browser step injected (the browser path itself runs in tools/ and tests/e2e/gate-guard.e2e.mjs).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const repo = path.join(__dirname, "..", "..");
const load = () => import(path.join(repo, "tools", "plate-field-eval.mjs"));

/** a valid W x H grey PNG (no image library) */
function png(W, H) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => {
    const l = Buffer.alloc(4), c = Buffer.alloc(4), td = Buffer.concat([Buffer.from(t), d]);
    l.writeUInt32BE(d.length); c.writeUInt32BE(crc(td));
    return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc((W + 1) * H, 128); for (let y = 0; y < H; y++) raw[y * (W + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("plate-field-eval: arguments, defaults (owner folder, field label, full synthetic column)", async () => {
  const T = await load();
  const a = T.parseArgs([], { HOME: "/home/tum" });
  assert.equal(a.dir, path.resolve("/home/tum/LENSIQ-field/plates"));
  assert.equal(a.labels, path.join(a.dir, "plates-photo-labels.csv"));
  assert.equal(a.source, "field (owner photos)"); assert.equal(a.synthetic, 20); assert.equal(a.maxSide, 1920); assert.equal(a.split, "all");
  const b = T.parseArgs(["--dir", "/x", "--labels", "/y.csv", "--split", "heldout", "--synthetic", "0", "--seed", "7", "--json"], {});
  assert.deepEqual([b.dir, b.labels, b.split, b.synthetic, b.seed, b.json], [path.resolve("/x"), path.resolve("/y.csv"), "heldout", 0, 7, true]);
  assert.throws(() => T.parseArgs(["--split", "test"], {}), /split/);
  assert.throws(() => T.parseArgs(["--dir"], {}), /needs a value/);
  assert.throws(() => T.parseArgs(["--max-side", "100"], {}), /max-side/);
  assert.throws(() => T.parseArgs(["--nope"], {}), /unknown/);
});

test("plate-field-eval: photos must stay outside the repo (field-data/ is the only allowed folder inside it)", async () => {
  const T = await load();
  assert.throws(() => T.checkDir(path.join(repo, "docs")), /inside the repo/);
  assert.throws(() => T.checkDir(repo), /inside the repo/);
  assert.equal(T.checkDir(path.join(repo, "field-data", "plates")), true);
  assert.equal(T.checkDir(os.tmpdir()), true);
  // field-data/ is git-ignored (the one .gitignore line this story owns)
  assert.match(fs.readFileSync(path.join(repo, ".gitignore"), "utf8"), /^field-data\/$/m);
});

test("plate-field-eval: labelling sheet — template parses with its example rows skipped; errors are explicit", async () => {
  const T = await load();
  const tpl = fs.readFileSync(path.join(repo, "docs", "field-pilot", "plates-photo-labels.csv"), "utf8");
  const t = T.parseLabels(tpl);
  assert.deepEqual(t.errors, []); assert.equal(t.photos.size, 0, "EXAMPLE rows are skipped");
  assert.deepEqual(T.parseCsv(tpl)[0], ["file", "category", "plate", "province", "x0", "y0", "x1", "y1", "split", "sure", "notes"]);
  const { photos, errors } = T.parseLabels([
    "file,category,plate,province,x0,y0,x1,y1,split,sure,notes",
    "a.jpg,white,1กข 2345,bangkok,10,20,110,70,dev,y,\"quoted, with comma\"",
    "b.jpg,moto,1กข 123,,,,,,heldout,,",
    "b.jpg,yellow,71-0638,,,,,,heldout,,numbers-only plate",
    "c.jpg,none,,,,,,,,,sign",
    "d.jpg,white,?,,,,,,,,unreadable",
    "e.jpg,purple,กข 1,,,,,,,,",
    "f.jpg,white,กข 1,,5,5,1,1,,,",
    "c.jpg,white,กข 1,,,,,,,,"
  ].join("\r\n"));
  assert.equal(errors.length, 3, errors.join(" | "));
  assert.match(errors.join(" "), /purple/); assert.match(errors.join(" "), /x1 > x0/); assert.match(errors.join(" "), /labelled "none"/);
  const a = photos.get("a.jpg").plates[0];
  assert.deepEqual([a.key, a.standard, a.sure, a.box], ["1กข2345", true, true, [10, 20, 110, 70]]);
  const b = photos.get("b.jpg");
  assert.equal(b.plates.length, 2); assert.equal(b.plates[0].key, "1กข123"); assert.equal(b.plates[0].moto, true);
  assert.equal(b.plates[1].standard, false, "numbers-only plates are not scored for exact reads");
  assert.equal(photos.get("c.jpg").plates.length, 0);
  assert.equal(photos.get("d.jpg").plates[0].sure, false);
  assert.match(T.parseLabels("name,kind\nx,y").errors[0], /missing column/);
});

test("plate-field-eval: scoring — detection, exact, false / wrong auto-reads before -> guard -> shipped, taps", async () => {
  const T = await load();
  const { photos } = T.parseLabels([
    "file,category,plate,province,x0,y0,x1,y1",
    "p.jpg,white,กข 1234,,100,100,300,190", "q.jpg,green,ฒร 1387,,,,,,", "n.jpg,none,,,,,,,"
  ].join("\n"));
  const size = [1000, 500], plateBox = { x: 0.1, y: 0.2, w: 0.2, h: 0.18 }, elsewhere = { x: 0.6, y: 0.1, w: 0.2, h: 0.1 };
  const tr = (i, key, box, ok) => ({ i, read: { key, box }, guard: { ok, reasons: ok ? [] : ["word"] } });
  // p: top box = a sign read "บร64" (refused), 2nd box = the plate, read exactly -> shipped path reads it
  const p = T.scorePhoto(photos.get("p.jpg"), { size, auto: { trigger: { score: 0.9 }, cands: [], tried: [tr(0, "บร64", elsewhere, false), tr(1, "กข1234", plateBox, true)],
    picked: { i: 1, read: { key: "กข1234", box: plateBox }, guard: { ok: true } } }, taps: [{ key: "กข1234" }] });
  assert.deepEqual([p.det, p.before.false, p.guard1.proposal, p.after.exact, p.tapNeeded], [false, true, false, true, false]);
  // q: no labelled box; top read is one character off the label -> on the plate (by read), a wrong read, tap needed
  const q = T.scorePhoto(photos.get("q.jpg"), { size, taps: [null],
    auto: { trigger: { score: 0.5 }, cands: [], tried: [tr(0, "ฒช1387", elsewhere, true)], picked: { i: 0, read: { key: "ฒช1387", box: elsewhere } } } });
  assert.deepEqual([q.det, q.detBy, q.after.false, q.after.wrong, q.tapNeeded, q.tapRead], [true, "read", false, true, true, null]);
  // n: plate-less photo; a read that passes the guard is a false auto-read; without a trigger nothing is auto-read
  const n1 = T.scorePhoto(photos.get("n.jpg"), { size, auto: { trigger: { score: 0.9 }, tried: [tr(0, "รอ7", elsewhere, true)], picked: { i: 0, read: { key: "รอ7", box: elsewhere } } } });
  assert.deepEqual([n1.before.false, n1.after.false, n1.det, n1.tapNeeded], [true, true, null, null]);
  const n2 = T.scorePhoto(photos.get("n.jpg"), { size, auto: { trigger: null, tried: [tr(0, "รอ7", elsewhere, true)], picked: null } });
  assert.equal(n2.before.proposal, false);
  const s = T.summarize([p, q, n1, n2]);
  assert.equal(s["all plates"].photos, 2); assert.equal(s.none.photos, 2);
  assert.equal(s.none.before.false, 1); assert.equal(s.white.before.false, 1); assert.equal(s.white.guard1.false, 0);
  assert.equal(s["all plates"].after.exact.x, 1); assert.equal(s["all plates"].tapsNeeded.x, 1);
  const synthetic = { white: { n: 20, det: { x: 20 }, read: { x: 14 }, readG: { x: 14, n: 20 }, wrong: 3, wrongG: 2 }, none: { neg: 20, fpRead: { x: 1 }, fpReadG: { x: 0 } } };
  const rep = T.formatReport(s, { synthetic });
  assert.match(rep, /Source: field \(owner photos\)/);
  assert.match(rep, /synthetic \(demo set\)/);
  assert.match(rep, /white .*det 20\/20 · exact 14 → 14\/20 · wrong 3 → 2/);
  assert.match(rep, /none .*false auto-reads 1 → 0 of 20/);
});

test("plate-field-eval: ignore regions (labels v3) — a proposal inside one is neither rewarded nor a false auto-read", async () => {
  const T = await load();
  const { photos, errors } = T.parseLabels([
    "file,category,plate,province,x0,y0,x1,y1,split,sure,notes",
    "n.jpg,none,,,,,,,heldout,,street with a tiny far plate",
    "n.jpg,ignore,,,600,100,800,150,heldout,,tiny unreadable plate",
    "p.jpg,white,กข 1234,,100,100,300,190,dev,y,",
    "p.jpg,ignore,,,600,100,800,150,dev,,",
    "x.jpg,ignore,,,1,1,5,5,,,",
    "n.jpg,ignore,กข 1,,1,1,5,5,,,",
    "n.jpg,ignore,,,,,,,,,"
  ].join("\n"));
  assert.equal(errors.length, 3, errors.join(" | "));
  assert.match(errors.join(" "), /no plate text/); assert.match(errors.join(" "), /needs a box/); assert.match(errors.join(" "), /"x.jpg", which has no plate/);
  assert.equal(photos.get("n.jpg").cat, "none", "an ignore row never changes the photo's category");
  assert.deepEqual(photos.get("n.jpg").ignore, [[600, 100, 800, 150]]);
  assert.equal(photos.get("n.jpg").plates.length, 0);
  const size = [1000, 500], inIgn = { x: 0.6, y: 0.2, w: 0.2, h: 0.1 }, elsewhere = { x: 0.1, y: 0.7, w: 0.2, h: 0.1 }, plateBox = { x: 0.1, y: 0.2, w: 0.2, h: 0.18 };
  const auto = (key, box) => ({ trigger: { score: 0.9 }, tried: [{ i: 0, read: { key, box }, guard: { ok: true, reasons: [] } }], picked: { i: 0, read: { key, box } } });
  // plate-less photo: a read inside the ignore region is ignored (not false); elsewhere it is still a false auto-read
  const a = T.scorePhoto(photos.get("n.jpg"), { size, auto: auto("กข1234", inIgn) });
  assert.deepEqual([a.after.proposal, a.after.ignored, a.after.false, a.before.false], [true, true, false, false]);
  const b = T.scorePhoto(photos.get("n.jpg"), { size, auto: auto("กข1234", elsewhere) });
  assert.deepEqual([b.after.ignored, b.after.false], [false, true]);
  // a big box that only touches the region is not "in" it (IoU < 0.3 and less than half of it inside)
  assert.equal(T.inRegion({ x: 0.5, y: 0, w: 0.5, h: 1 }, { x: 0.6, y: 0.2, w: 0.2, h: 0.1 }), false);
  assert.equal(T.inRegion({ x: 0.61, y: 0.21, w: 0.05, h: 0.05 }, { x: 0.6, y: 0.2, w: 0.2, h: 0.1 }), true);
  // plate photo: a read in the ignore region is not a detection, not exact and not wrong, even with the right text
  const c = T.scorePhoto(photos.get("p.jpg"), { size, auto: auto("กข1234", inIgn), taps: [{ key: "" }] });
  assert.deepEqual([c.det, c.after.ignored, c.after.exact, c.after.wrong, c.after.false, c.tapNeeded], [false, true, false, false, false, true]);
  const d = T.scorePhoto(photos.get("p.jpg"), { size, auto: auto("กข1234", plateBox), taps: [{ key: "" }] });
  assert.deepEqual([d.det, d.after.ignored, d.after.exact], [true, false, true]);
  const s = T.summarize([a, b, c]);
  assert.equal(s.none.after.false, 1); assert.equal(s.none.after.ignored, 1);
  assert.match(T.formatReport(s), /none .*1 \(\+1 ignored\)/);
});

test("plate-field-eval: whole run on a tiny generated folder (browser step injected), missing / unlabelled photos listed", async () => {
  const T = await load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lq-plate-field-"));
  try {
    for (const f of ["IMG_1.png", "IMG_2.png", "IMG_3.png", "extra.png"]) fs.writeFileSync(path.join(dir, f), png(64, 32));
    fs.writeFileSync(path.join(dir, "notes.txt"), "not a photo");
    fs.writeFileSync(path.join(dir, "plates-photo-labels.csv"), [
      "file,category,plate,province,x0,y0,x1,y1,split,sure,notes",
      "EXAMPLE-0001.jpg,white,1กข 2345,,,,,,,y,example",
      "IMG_1.png,white,กข 1234,,8,8,40,24,,y,", "IMG_2.png,moto,1กข 123,,,,,,,y,", "IMG_3.png,none,,,,,,,,,sign", "gone.png,white,กข 1,,,,,,,,"
    ].join("\n"));
    let seen = null;
    const evaluate = async (items, o) => {
      seen = { files: items.map(x => x.file).sort(), o };
      const box = { x: 8 / 64, y: 8 / 32, w: 32 / 64, h: 16 / 32 };
      return { synthetic: null, results: items.map(ph => ({ file: ph.file, size: [64, 32], taps: ph.plates.map(p => (p.box ? { key: p.key } : null)),
        auto: ph.file === "IMG_1.png"
          ? { trigger: { score: 0.9 }, cands: [box], tried: [{ i: 0, read: { key: "กข1234", box }, guard: { ok: true, reasons: [] } }],
            picked: { i: 0, read: { key: "กข1234", box }, guard: { ok: true } } }
          : { trigger: { score: 0.9 }, cands: [box], tried: [{ i: 0, read: { key: "ห้อง1", box }, guard: { ok: false, reasons: ["word"] } }], picked: null } })) };
    };
    const a = T.parseArgs(["--dir", dir, "--synthetic", "0"], {});
    const out = await T.run(a, { evaluate });
    assert.deepEqual(seen.files, ["IMG_1.png", "IMG_2.png", "IMG_3.png"]);
    assert.equal(seen.o.maxSide, 1920);
    assert.deepEqual(out.missing, ["gone.png"]); assert.deepEqual(out.unlabelled, ["extra.png"]);
    assert.equal(out.source, "field (owner photos)");
    assert.equal(out.summary.white.after.exact.x, 1);
    assert.equal(out.summary.moto.tapsNeeded.x, 1);
    assert.equal(out.summary.none.after.false, 0);
    assert.match(T.formatReport(out.summary, { source: out.source }), /field \(owner photos\)/);
    await assert.rejects(T.run(T.parseArgs(["--dir", path.join(dir, "nope")], {}), { evaluate }), /not found/);
    await assert.rejects(T.run(T.parseArgs(["--dir", path.join(repo, "docs")], {}), { evaluate }), /inside the repo/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("plate-field-eval: photos that cannot be decoded (iPhone HEIC, a broken file) are listed and never stop the run", async () => {
  const T = await load();
  // file headers: what the tool sniffs before sending a photo to the browser
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(20)]);
  assert.equal(T.sniffType(png(4, 4)), "png");
  assert.equal(T.sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16])), "jpeg");
  assert.equal(T.sniffType(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")])), "webp");
  assert.equal(T.sniffType(heic), "heic");
  assert.equal(T.sniffType(Buffer.from("not a photo at all")), null);
  assert.match(T.CONVERT_HINT, /JPEG/); assert.ok(T.CONVERT.has(".heic") && T.CONVERT.has(".heif"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lq-plate-field-bad-"));
  try {
    fs.writeFileSync(path.join(dir, "IMG_1.png"), png(64, 32));
    fs.writeFileSync(path.join(dir, "IMG_2.HEIC"), heic); // iPhone default format
    fs.writeFileSync(path.join(dir, "IMG_3.jpg"), heic); // HEIC renamed to .jpg (some transfer apps do this)
    fs.writeFileSync(path.join(dir, "IMG_4.jpg"), Buffer.from("truncated garbage")); // cannot be decoded
    fs.writeFileSync(path.join(dir, "IMG_5.png"), png(64, 32)); // the browser fails on this one (injected)
    fs.writeFileSync(path.join(dir, "IMG_6.heic"), heic); // unlabelled HEIC
    fs.writeFileSync(path.join(dir, "plates-photo-labels.csv"), ["file,category,plate,province,x0,y0,x1,y1,split,sure,notes",
      "IMG_1.png,white,กข 1234,,,,,,,y,", "IMG_2.HEIC,white,กข 1,,,,,,,y,", "IMG_3.jpg,white,กข 2,,,,,,,y,", "IMG_4.jpg,white,กข 3,,,,,,,y,",
      "IMG_5.png,none,,,,,,,,,"].join("\n"));
    let sent = null;
    const evaluate = async items => {
      sent = items.map(x => [x.file, x.mime]);
      return { synthetic: null, results: items.map(ph => (ph.file === "IMG_5.png" ? { file: ph.file, error: "the browser could not decode this photo (EncodingError)" }
        : { file: ph.file, size: [64, 32], taps: [null], auto: { trigger: null, cands: [], tried: [], picked: null } })) };
    };
    const out = await T.run(T.parseArgs(["--dir", dir, "--synthetic", "0"], {}), { evaluate });
    assert.deepEqual(sent, [["IMG_1.png", "image/png"], ["IMG_5.png", "image/png"]], "only decodable photos reach the browser");
    assert.equal(out.n, 1, "only the decoded photo is counted");
    assert.deepEqual(out.failed.map(f => f.file).sort(), ["IMG_2.HEIC", "IMG_3.jpg", "IMG_4.jpg", "IMG_5.png"]);
    const why = Object.fromEntries(out.failed.map(f => [f.file, f.error]));
    assert.match(why["IMG_2.HEIC"], /convert to JPEG/); assert.match(why["IMG_3.jpg"], /HEIC.*convert to JPEG/);
    assert.match(why["IMG_4.jpg"], /could not decode/); assert.match(why["IMG_5.png"], /could not decode/);
    assert.deepEqual(out.unlabelledConvert, ["IMG_6.heic"]); assert.deepEqual(out.unlabelled, []);
    assert.equal(out.summary.white.photos, 1); assert.equal(out.summary.none, undefined, "a photo that failed is left out of every number");
    // every photo unreadable: still a result (all listed as failed), not a crash
    fs.writeFileSync(path.join(dir, "plates-photo-labels.csv"), "file,category,plate\nIMG_2.HEIC,white,กข 1\n");
    const all = await T.run(T.parseArgs(["--dir", dir, "--synthetic", "0"], {}), { evaluate: async () => assert.fail("nothing decodable to send") });
    assert.equal(all.n, 0); assert.equal(all.failed.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("plate-field-eval: a filled-in labelling sheet (plate numbers) is refused inside the repo; the unchanged template is fine", async () => {
  const T = await load();
  const tplPath = path.join(repo, "docs", "field-pilot", "plates-photo-labels.csv"), tpl = fs.readFileSync(tplPath, "utf8");
  assert.equal(T.checkLabels(tplPath, tpl), true, "the template has only EXAMPLE rows");
  assert.throws(() => T.checkLabels(tplPath, tpl + "IMG_1.jpg,white,1กข 2345,,,,,,,y,\n"), /inside the repo.*personal data/);
  assert.throws(() => T.checkLabels(path.join(repo, "labels.csv"), "file,category,plate\na.jpg,white,กข 1\n"), /inside the repo/);
  assert.equal(T.checkLabels(path.join(repo, "field-data", "labels.csv"), "file,category,plate\na.jpg,white,กข 1\n"), true);
  assert.equal(T.checkLabels(path.join(os.tmpdir(), "labels.csv"), "file,category,plate\na.jpg,white,กข 1\n"), true);
  // through run(): photos outside the repo, but --labels pointing at a filled-in sheet in the repo
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lq-plate-field-lbl-")), root = fs.mkdtempSync(path.join(os.tmpdir(), "lq-fake-repo-"));
  try {
    fs.writeFileSync(path.join(dir, "IMG_1.png"), png(64, 32));
    fs.mkdirSync(path.join(root, "docs"));
    fs.writeFileSync(path.join(root, "docs", "labels.csv"), "file,category,plate\nIMG_1.png,white,กข 1\n");
    await assert.rejects(T.run(T.parseArgs(["--dir", dir, "--labels", path.join(root, "docs", "labels.csv"), "--synthetic", "0"], {}),
      { root, evaluate: async () => assert.fail("must refuse before reading photos") }), /labelling sheet is inside the repo/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(root, { recursive: true, force: true }); }
});
