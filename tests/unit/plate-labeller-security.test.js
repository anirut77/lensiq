// tests/unit/plate-labeller-security.test.js — independent review of gate-hall-h @ bac5e17 (2026-11-13):
// B1 path traversal and B2 DNS rebinding in tools/plate-labeller.mjs; S2 the locked split covers the held-out labels;
// S3 a blurred photo whose blur boxes changed after its export is refused, and no EXIF reaches blurred/ or dataset/;
// S4 plate-det-compare checks dataset/MANIFEST.json against the locked split, the seat-watch sheet names every session.
// Locked before the fixes (hash appended to evals-locks/gate-hall-h.sha256 and ~/LENSIQ-field/evals/gate-hall-h/).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");

const repo = path.join(__dirname, "..", "..");
const lab = () => import(path.join(repo, "tools", "plate-labeller.mjs"));
const prep = () => import(path.join(repo, "tools", "plate-train-prep.mjs"));
const cmp = () => import(path.join(repo, "tools", "plate-det-compare.mjs"));
const score = () => import(path.join(repo, "tools", "hall-seatwatch-score.mjs"));
const evalTool = () => import(path.join(repo, "tools", "plate-field-eval.mjs"));
const HEAD = "file,category,plate,province,x0,y0,x1,y1,split,sure,notes";

function png(W, H, extra) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => {
    const l = Buffer.alloc(4), c = Buffer.alloc(4), td = Buffer.concat([Buffer.from(t), d]);
    l.writeUInt32BE(d.length); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc((W + 1) * H, 128); for (let y = 0; y < H; y++) raw[y * (W + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), ...(extra ? [chunk(extra, Buffer.from("MM\0*"))] : []),
    chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const jpegWithExif = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10]), Buffer.from("Exif\0\0"), Buffer.alloc(8), Buffer.from([0xff, 0xd9])]);
const jpegPlain = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF\0"), Buffer.alloc(9), Buffer.from([0xff, 0xd9])]);

/** raw HTTP request (custom Host / Origin; the path is sent exactly as given, not normalised) */
function req(port, method, rawPath, headers = {}, body = null) {
  return new Promise((res, rej) => {
    const r = http.request({ host: "127.0.0.1", port, method, path: rawPath, headers: { Host: `127.0.0.1:${port}`, ...headers } }, x => {
      const parts = []; x.on("data", c => parts.push(c)); x.on("end", () => res({ status: x.statusCode, body: Buffer.concat(parts).toString("utf8") }));
    });
    r.on("error", rej); if (body) r.write(body); r.end();
  });
}
async function server() {
  const { start } = await lab();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lq-labsec-"));
  fs.mkdirSync(path.join(root, "photos"), { recursive: true });
  fs.writeFileSync(path.join(root, "photos", "a.png"), png(16, 12));
  const s = await start({ root });
  return { ...s, root, port: Number(new URL(s.url).port) };
}

test("B2: the start URL carries a random token; /api needs it, the right Host and (POST) the right Origin", async () => {
  const s = await server();
  try {
    assert.match(s.url, /^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{32}$/);
    assert.equal(s.token.length, 32);
    const T = { "X-LQ-Token": s.token };
    assert.equal((await req(s.port, "GET", "/api/state", T)).status, 200);
    assert.equal((await req(s.port, "GET", "/api/state", { ...T, Host: `localhost:${s.port}` })).status, 200);
    // DNS rebinding: a foreign Host is refused on every path, also with a matching Origin
    for (const p of ["/", "/api/state", "/lensiq-pc.js", "/photos/a.png?t=" + s.token])
      assert.equal((await req(s.port, "GET", p, { ...T, Host: `evil.example:${s.port}` })).status, 403, p);
    const body = JSON.stringify({ labels: HEAD + "\n", privacy: { v: 1, files: {} } });
    const J = { "Content-Type": "application/json" };
    assert.equal((await req(s.port, "POST", "/api/save", { ...J, ...T, Host: `evil.example:${s.port}`, Origin: `http://evil.example:${s.port}` }, body)).status, 403);
    assert.equal((await req(s.port, "POST", "/api/save", { ...J, ...T }, body)).status, 403, "POST without Origin");
    assert.equal((await req(s.port, "POST", "/api/save", { ...J, ...T, Origin: "http://evil.example" }, body)).status, 403);
    assert.equal((await req(s.port, "POST", "/api/save", { ...J, Origin: `http://127.0.0.1:${s.port}` }, body)).status, 403, "no token");
    assert.equal((await req(s.port, "GET", "/api/state")).status, 403, "no token");
    assert.equal((await req(s.port, "POST", "/api/save", { ...J, ...T, Origin: `http://127.0.0.1:${s.port}` }, body)).status, 200);
    // photos (plate images) also need the token (query: an <img> cannot send headers)
    assert.equal((await req(s.port, "GET", "/photos/a.png")).status, 403);
    assert.equal((await req(s.port, "GET", "/photos/a.png?t=" + s.token)).status, 200);
  } finally { await s.close(); }
});

test("B1: no path traversal, encoded slashes, backslashes or dot-dot; only an exact allow-list of tracked repo files", async () => {
  const s = await server();
  try {
    for (const p of ["/vendor/mediapipe/..%2f..%2fpackage.json", "/vendor/mediapipe/..%2F..%2Fpackage.json", "/vendor/mediapipe/%2e%2e/%2e%2e/package.json",
      "/vendor/mediapipe/../../package.json", "/vendor/mediapipe/..%5c..%5cpackage.json", "/vendor\\mediapipe\\x", "/photos/..%2fCONSENT.md?t=" + s.token,
      "/package.json", "/server.py", "/certs/dev.pem", "/backend/.dev.vars", "/vendor/mediapipe/", "/tools/plate-labeller.mjs"]) {
      const r = await req(s.port, "GET", p);
      assert.ok(r.status === 400 || r.status === 404, `${p} -> ${r.status}`);
      assert.doesNotMatch(r.body, /"name": "lensiq"|BEGIN|PRIVATE/);
    }
    for (const p of ["/", "/plate-labeller.js", "/lensiq-pc.js", "/lensiq-pc-run.js", "/lensiq-med.js", "/vendor/mediapipe/vision_bundle.mjs",
      "/vendor/models/face-gate/blaze_face_short_range.tflite"])
      assert.equal((await req(s.port, "GET", p)).status, 200, p);
    const { allowList } = await lab();
    const list = allowList();
    const tracked = new Set(execFileSync("git", ["ls-files"], { cwd: repo, encoding: "utf8" }).split("\n"));
    for (const [url, file] of list) {
      const rel = path.relative(repo, file).split(path.sep).join("/");
      assert.ok(tracked.has(rel), `${url} -> ${rel} is not a tracked repo file`);
      assert.doesNotMatch(url, /\.\.|\\|%/);
    }
  } finally { await s.close(); }
});

test("S3 server side: a blurred upload carrying EXIF is refused; the blur boxes' hash is recorded at export time", async () => {
  const s = await server();
  const { regionsHash } = await prep();
  try {
    const H = { "X-LQ-Token": s.token, Origin: `http://127.0.0.1:${s.port}` };
    fs.writeFileSync(path.join(s.root, "photos", "b.jpg"), jpegPlain());
    const priv = { v: 1, files: { "b.jpg": { checked: true, regions: [[1, 1, 5, 5, "face"]] } } };
    const save = await req(s.port, "POST", "/api/save", { ...H, "Content-Type": "application/json" }, JSON.stringify({ labels: HEAD + "\nb.jpg,none,,,,,,,,,\n", privacy: priv }));
    assert.equal(save.status, 200);
    assert.equal((await req(s.port, "POST", "/api/blurred/b.jpg", H, jpegWithExif())).status, 422, "EXIF refused");
    assert.equal((await req(s.port, "POST", "/api/blurred/b.jpg", H, jpegPlain())).status, 200);
    const idx = JSON.parse(fs.readFileSync(path.join(s.root, "labels", "blurred-index.json"), "utf8"));
    assert.equal(idx.files["b.jpg"].regions, regionsHash(priv.files["b.jpg"].regions));
  } finally { await s.close(); }
});

test("S3: hasExif (JPEG APP1 / PNG eXIf) and regionsHash (order-insensitive, kind ignored)", async () => {
  const { hasExif, regionsHash } = await prep();
  assert.equal(hasExif(jpegWithExif()), true);
  assert.equal(hasExif(jpegPlain()), false);
  assert.equal(hasExif(png(4, 4, "eXIf")), true);
  assert.equal(hasExif(png(4, 4)), false);
  assert.equal(regionsHash([[1, 2, 3, 4, "face"], [5, 6, 7, 8, "auto-face"]]), regionsHash([[5, 6, 7, 8, "x"], [1, 2, 3, 4, "y"]]));
  assert.notEqual(regionsHash([[1, 2, 3, 4]]), regionsHash([[1, 2, 3, 5]]));
});

test("S2: the locked split hash covers each photo's labels (text, box, category, sure, ignore); same files, other hash", async () => {
  const { makeSplit } = await prep();
  const { parseLabels } = await evalTool();
  const base = [HEAD, "a.jpg,white,กข 1234,,10,10,90,40,,,", "b.jpg,none,,,,,,,,,", "b.jpg,ignore,,,1,1,5,5,,,"];
  const h = rows => makeSplit(parseLabels(rows.join("\n")).photos);
  const s0 = h(base);
  for (const [i, row] of [[1, "a.jpg,white,กข 1235,,10,10,90,40,,,"], [1, "a.jpg,white,กข 1234,,10,10,91,40,,,"], [1, "a.jpg,yellow,กข 1234,,10,10,90,40,,,"],
    [1, "a.jpg,white,กข 1234,,10,10,90,40,,n,"], [3, "b.jpg,ignore,,,1,1,6,5,,,"]]) {
    const rows = base.slice(); rows[i] = row;
    const s1 = h(rows);
    assert.notEqual(s1.sha256, s0.sha256, row);
  }
  assert.equal(h(base).sha256, s0.sha256);
});

test("S3 CLI: export refuses a photo whose blur boxes changed after its blurred export, and a blurred file with EXIF", async () => {
  const { main, regionsHash } = await prep();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lq-labsec-root-"));
  const io = { log: () => {}, err: () => {}, lockRepo: path.join(root, "r.sha256"), lockField: path.join(root, "f.sha256") };
  await main(["init", "--root", root], io);
  const rows = [HEAD], priv = { v: 1, files: {} }, idx = { v: 1, files: {} };
  for (let i = 0; i < 30; i++) {
    const f = `p${i}.png`; fs.writeFileSync(path.join(root, "photos", f), png(32, 24));
    fs.writeFileSync(path.join(root, "blurred", f), i === 1 ? png(32, 24, "eXIf") : png(32, 24));
    rows.push(`${f},white,กข ${1000 + i},,2,2,20,10,,,`);
    priv.files[f] = { checked: true, regions: [[1, 1, 4, 4, "face"]] };
    idx.files[f] = { regions: regionsHash(i === 0 ? [[1, 1, 9, 9]] : priv.files[f].regions) }; // p0: boxes changed after export
  }
  fs.writeFileSync(path.join(root, "labels", "plates-photo-labels.csv"), rows.join("\n"));
  fs.writeFileSync(path.join(root, "labels", "privacy.json"), JSON.stringify(priv));
  fs.writeFileSync(path.join(root, "labels", "blurred-index.json"), JSON.stringify(idx));
  const out = []; io.log = x => out.push(x);
  assert.equal(await main(["split", "--root", root], io), 0);
  assert.equal(await main(["export", "--root", root], io), 0);
  const text = out.join("\n");
  assert.match(text, /p0\.png: blur boxes changed after the blurred export/);
  assert.match(text, /p1\.png: .*EXIF/);
  const man = JSON.parse(fs.readFileSync(path.join(root, "dataset", "MANIFEST.json"), "utf8"));
  assert.ok(!man.files.some(x => x.file === "p0.png" || x.file === "p1.png"));
  assert.equal(man.files.length, 28);
});

test("S4: plate-det-compare refuses a dataset whose MANIFEST does not match the locked split", async () => {
  const { checkManifest } = await cmp();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lq-labsec-man-"));
  fs.mkdirSync(path.join(root, "dataset")); fs.mkdirSync(path.join(root, "splits"));
  const lock = path.join(root, "locked.sha256");
  fs.writeFileSync(lock, "plate-split-v1 " + "a".repeat(64) + "\n");
  fs.writeFileSync(path.join(root, "dataset", "MANIFEST.json"), JSON.stringify({ rule: "plate-split-v1", sha256: "a".repeat(64), files: [] }));
  assert.equal(checkManifest(root, lock), true);
  fs.writeFileSync(path.join(root, "dataset", "MANIFEST.json"), JSON.stringify({ rule: "plate-split-v1", sha256: "b".repeat(64), files: [] }));
  assert.throws(() => checkManifest(root, lock), /does not match the locked split/);
  fs.writeFileSync(lock, "");
  assert.throws(() => checkManifest(root, lock), /not locked/);
});

test("S4: the seat-watch result sheet title names every session", async () => {
  const { formatSheet } = await score();
  const md = formatSheet({}, { sessions: ["S1", "S2"], date: "2026-11-20" });
  assert.match(md.split("\n")[0], /S1.*S2/);
});
