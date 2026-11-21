// tests/unit/palm-trace.test.js — owner decision 174 ก (night order A4, 2026-11-21): the local tap-to-trace labelling tool for
// the owner's own palm photos (tools/palm-trace/). The owner taps along each main line (life, head, heart, fate); the tool
// exports a JSON label file (ground truth for the palm-line measurement) that holds the image width / height, one polyline per
// line in normalised coordinates, the labeller, a timestamp and the tool version: never image data, never EXIF.
// Locked with tools/eval-guard.mjs (evals-locks/palm-trace.sha256) BEFORE the product code.
// Covers: the JSON schema (build + strict validation), the normaliser, the line state (tap / undo / clear / not visible),
// the file name, TH / EN / ZH text, and the loopback-only server (tools/palm-trace/serve.mjs).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const repo = path.join(__dirname, "..", "..");
const DIR = path.join(repo, "tools", "palm-trace");
const core = () => require(path.join(DIR, "palm-trace-core.js"));
const SHA = "a".repeat(64);
const META = { width: 900, height: 1200, labeller: "owner", hand: "left", imageName: "palm-01.jpg", imageSha256: SHA, now: new Date("2026-11-21T01:02:03Z") };

/** a state with life traced (3 taps), head not visible, heart traced (2 taps), fate not labelled */
function sample(C) {
  let s = C.newState();
  s = C.addPoint(s, "life", [0.3, 0.2]); s = C.addPoint(s, "life", [0.25, 0.4]); s = C.addPoint(s, "life", [0.3, 0.7]);
  s = C.markNotVisible(s, "head");
  s = C.addPoint(s, "heart", [0.2, 0.3]); s = C.addPoint(s, "heart", [0.8, 0.25]);
  return s;
}

test("constants: schema id, tool version, the four main lines, the three statuses", () => {
  const C = core();
  assert.equal(C.SCHEMA, "lensiq-palm-trace/1");
  assert.match(C.TOOL_VERSION, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(C.LINES, ["life", "head", "heart", "fate"]);
  assert.deepEqual(C.STATUS, ["traced", "notVisible", "notLabelled"]);
});

test("normaliser: pixels -> [0, 1] of width / height, 4 decimals, clamped; bad sizes throw", () => {
  const C = core();
  assert.deepEqual(C.normPoint(450, 600, 900, 1200), [0.5, 0.5]);
  assert.deepEqual(C.normPoint(0, 0, 900, 1200), [0, 0]);
  assert.deepEqual(C.normPoint(900, 1200, 900, 1200), [1, 1]);
  assert.deepEqual(C.normPoint(-5, 1300, 900, 1200), [0, 1], "outside the photo is clamped to its edge");
  assert.deepEqual(C.normPoint(1, 2, 3, 7), [0.3333, 0.2857], "rounded to 4 decimals");
  for (const [w, h] of [[0, 10], [10, 0], [-1, 10], [NaN, 10], [10, Infinity]]) assert.throws(() => C.normPoint(1, 1, w, h), /size|width|height/i);
  assert.throws(() => C.normPoint(NaN, 1, 10, 10), /point|finite/i);
});

test("normaliser: a tap on the displayed canvas maps to the photo whatever the zoom / scroll (bounding rect)", () => {
  const C = core();
  // canvas shown at 360 x 480 css px at page offset (10, 50): a tap at its centre is the photo centre
  assert.deepEqual(C.clientToNorm(10 + 180, 50 + 240, { left: 10, top: 50, width: 360, height: 480 }), [0.5, 0.5]);
  // zoom 3x and scrolled: the rect starts left of / above the viewport (negative), same photo point
  assert.deepEqual(C.clientToNorm(-500 + 540, -700 + 720, { left: -500, top: -700, width: 1080, height: 1440 }), [0.5, 0.5]);
  assert.deepEqual(C.clientToNorm(10 + 90, 50 + 360, { left: 10, top: 50, width: 360, height: 480 }), [0.25, 0.75]);
  // round trip back to photo pixels
  assert.deepEqual(C.toPx([0.25, 0.75], 900, 1200), [225, 900]);
});

test("line state: tap adds a point, undo removes the last, clear empties, not visible drops the points; inputs never mutate", () => {
  const C = core();
  const s0 = C.newState();
  for (const id of C.LINES) assert.deepEqual(s0.lines[id], { status: "notLabelled", points: [] });
  const s1 = C.addPoint(s0, "life", [0.1, 0.2]);
  assert.deepEqual(s0.lines.life.points, [], "addPoint returns a new state");
  assert.deepEqual(s1.lines.life, { status: "traced", points: [[0.1, 0.2]] });
  const s2 = C.addPoint(s1, "life", [0.1, 0.2]);
  assert.equal(s2.lines.life.points.length, 1, "the same point twice in a row is one point (double tap)");
  const s3 = C.addPoint(s2, "life", [0.12345, 0.5]);
  assert.deepEqual(s3.lines.life.points[1], [0.1235, 0.5], "points are stored rounded to 4 decimals");
  const s4 = C.undo(s3, "life");
  assert.deepEqual(s4.lines.life.points, [[0.1, 0.2]]);
  const s5 = C.undo(s4, "life");
  assert.deepEqual(s5.lines.life, { status: "notLabelled", points: [] }, "undo of the last point -> not labelled");
  assert.deepEqual(C.undo(s5, "life"), s5, "undo on an empty line changes nothing");
  const nv = C.markNotVisible(s3, "life");
  assert.deepEqual(nv.lines.life, { status: "notVisible", points: [] });
  assert.deepEqual(C.undo(nv, "life").lines.life, { status: "notLabelled", points: [] }, "undo of 'not visible' -> not labelled");
  const back = C.addPoint(nv, "life", [0.4, 0.4]);
  assert.deepEqual(back.lines.life, { status: "traced", points: [[0.4, 0.4]] }, "a tap on a not-visible line traces it again");
  assert.deepEqual(C.clearLine(s3, "life").lines.life, { status: "notLabelled", points: [] });
  assert.deepEqual(C.clearLine(s3, "life").lines.head, s3.lines.head, "clear touches only its line");
  assert.throws(() => C.addPoint(s0, "sun", [0.1, 0.1]), /line/i, "only the four main lines");
  assert.throws(() => C.addPoint(s0, "life", [1.2, 0.1]), /point|range/i, "points outside [0, 1] are refused");
  let big = C.newState();
  for (let i = 0; i < C.MAX_POINTS; i++) big = C.addPoint(big, "fate", [i / C.MAX_POINTS, 0.5]);
  assert.throws(() => C.addPoint(big, "fate", [0.999, 0.9]), /max|points/i, "at most MAX_POINTS per line");
});

test("schema: buildLabel gives exactly the documented fields, all four lines, and validates", () => {
  const C = core();
  const { label, errors } = C.buildLabel(sample(C), META);
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(label).sort(), ["coordSpace", "createdAt", "hand", "image", "labeller", "lines", "schema", "tool"]);
  assert.equal(label.schema, C.SCHEMA);
  assert.deepEqual(label.tool, { name: "palm-trace", version: C.TOOL_VERSION });
  assert.equal(label.labeller, "owner");
  assert.equal(label.createdAt, "2026-11-21T01:02:03.000Z");
  assert.equal(label.hand, "left");
  assert.deepEqual(label.image, { width: 900, height: 1200, name: "palm-01.jpg", sha256: SHA });
  assert.equal(label.coordSpace, C.COORD_SPACE);
  assert.deepEqual(Object.keys(label.lines), C.LINES, "every main line present, in order");
  assert.deepEqual(label.lines.life, { status: "traced", points: [[0.3, 0.2], [0.25, 0.4], [0.3, 0.7]] });
  assert.deepEqual(label.lines.head, { status: "notVisible", points: [] });
  assert.deepEqual(label.lines.heart, { status: "traced", points: [[0.2, 0.3], [0.8, 0.25]] });
  assert.deepEqual(label.lines.fate, { status: "notLabelled", points: [] });
  assert.deepEqual(C.validateLabel(label), []);
  assert.deepEqual(C.validateLabel(JSON.parse(JSON.stringify(label))), [], "survives a JSON round trip");
  // optional photo identity: no name, no hash (crypto.subtle missing) still valid
  const b = C.buildLabel(sample(C), { ...META, imageName: "", imageSha256: null });
  assert.deepEqual(b.errors, []);
  assert.deepEqual(b.label.image, { width: 900, height: 1200, name: "", sha256: null });
});

test("schema: buildLabel refuses incomplete work (1-point line, no line at all, no photo size, no labeller)", () => {
  const C = core();
  const one = C.addPoint(C.newState(), "life", [0.5, 0.5]);
  assert.ok(C.buildLabel(one, META).errors.some(e => /life/.test(e) && /2|two|points/i.test(e)), "a traced line needs >= 2 points");
  assert.ok(C.buildLabel(C.newState(), META).errors.length > 0, "nothing traced or marked: nothing to export");
  assert.ok(C.buildLabel(sample(C), { ...META, width: 0 }).errors.length > 0);
  assert.ok(C.buildLabel(sample(C), { ...META, height: 10.5 }).errors.length > 0, "integer pixel sizes");
  assert.ok(C.buildLabel(sample(C), { ...META, labeller: "  " }).errors.length > 0, "a labeller is required");
  assert.ok(C.buildLabel(sample(C), { ...META, labeller: "x".repeat(65) }).errors.length > 0, "labeller <= 64 characters");
  assert.ok(C.buildLabel(sample(C), { ...META, hand: "both" }).errors.length > 0, "hand is left / right / unknown");
});

test("schema: validateLabel is strict, so no photo bytes, thumbnail or EXIF can ride along", () => {
  const C = core();
  const good = C.buildLabel(sample(C), META).label;
  const bad = mut => { const j = JSON.parse(JSON.stringify(good)); mut(j); return C.validateLabel(j); };
  const cases = {
    "extra top-level key (thumbnail)": j => { j.thumbnail = "data:image/jpeg;base64,/9j/4AAQ"; },
    "image.data": j => { j.image.data = "iVBORw0KGgo="; },
    "image.exif": j => { j.image.exif = { Make: "x" }; },
    "extra key on a line": j => { j.lines.life.preview = "x"; },
    "unknown line": j => { j.lines.sun = { status: "traced", points: [[0, 0], [1, 1]] }; },
    "missing line": j => { delete j.lines.fate; },
    "wrong schema": j => { j.schema = "lensiq-palm-trace/0"; },
    "point out of range": j => { j.lines.life.points[0] = [1.5, 0.2]; },
    "point not a pair": j => { j.lines.life.points[0] = [0.1, 0.2, 0.3]; },
    "point not a number": j => { j.lines.life.points[0] = ["0.1", 0.2]; },
    "traced with 1 point": j => { j.lines.heart.points = [[0.1, 0.1]]; },
    "notVisible with points": j => { j.lines.head.points = [[0.1, 0.1]]; },
    "notLabelled with points": j => { j.lines.fate.points = [[0.1, 0.1]]; },
    "bad status": j => { j.lines.fate.status = "absent"; },
    "name with a folder path": j => { j.image.name = "/Users/someone/Pictures/palm.jpg"; },
    "name as a data URL": j => { j.image.name = "data:image/png;base64,AAAA"; },
    "bad sha256": j => { j.image.sha256 = "xyz"; },
    "bad timestamp": j => { j.createdAt = "yesterday"; },
    "bad tool": j => { j.tool = { name: "palm-trace", version: C.TOOL_VERSION, build: "x" }; },
    "bad coordSpace": j => { j.coordSpace = "pixels"; },
    "width not integer": j => { j.image.width = 900.5; },
    "not an object": () => {}
  };
  for (const [name, mut] of Object.entries(cases)) {
    const errs = name === "not an object" ? C.validateLabel(null) : bad(mut);
    assert.ok(Array.isArray(errs) && errs.length > 0, "must be refused: " + name);
  }
  // the exported text: no data URL, no base64 blob, no EXIF word, small
  const text = C.labelJson(good);
  assert.equal(typeof text, "string");
  assert.deepEqual(JSON.parse(text), good);
  assert.ok(!/data:|base64|exif/i.test(text), "no image data or EXIF words in the file");
  assert.ok(text.length < 4096, "a few points are a few hundred bytes, got " + text.length);
  assert.throws(() => C.labelJson({ ...good, extra: 1 }), /invalid|label/i, "labelJson refuses an invalid label");
});

test("file name: <photo stem>.palm-trace.json, safe characters only, never a path", () => {
  const C = core();
  assert.equal(C.labelFileName("IMG_0042.JPG"), "IMG_0042.palm-trace.json");
  assert.equal(C.labelFileName("my palm (1).jpeg"), "my_palm_1.palm-trace.json");
  assert.equal(C.labelFileName("../../etc/passwd"), "passwd.palm-trace.json");
  assert.equal(C.labelFileName(""), "palm.palm-trace.json");
  assert.equal(C.labelFileName("ภาพมือ.jpg"), "palm.palm-trace.json", "non-ASCII stem falls back to a safe name");
});

test("TH / EN / ZH: every text key in all three languages, none empty; unknown language falls back to Thai", () => {
  const C = core();
  assert.deepEqual(Object.keys(C.T).sort(), ["en", "th", "zh"]);
  const keys = Object.keys(C.T.th).sort();
  assert.ok(keys.length >= 20, "the page has at least 20 texts, got " + keys.length);
  for (const lang of ["en", "zh"]) assert.deepEqual(Object.keys(C.T[lang]).sort(), keys, lang + " has the same keys as th");
  for (const lang of ["th", "en", "zh"]) for (const k of keys) assert.ok(typeof C.T[lang][k] === "string" && C.T[lang][k].trim(), lang + "." + k + " is empty");
  for (const id of C.LINES) for (const lang of ["th", "en", "zh"]) assert.ok(C.t(lang, "line_" + id), lang + " name of line " + id);
  for (const k of ["title", "local_only", "open_photo", "undo", "clear", "not_visible", "export"]) assert.ok(keys.includes(k), "key " + k);
  assert.match(C.T.th.local_only, /เครื่อง/);
  assert.equal(C.t("fr", "title"), C.T.th.title);
  assert.match(C.T.zh.title, /[一-鿿]/, "Chinese title in Chinese characters");
  assert.match(C.T.th.title, /[฀-๿]/, "Thai title in Thai");
});

test("page files: exist, Content-Security-Policy blocks every connection, no remote URL, no storage of images", () => {
  for (const f of ["index.html", "palm-trace.js", "palm-trace-core.js", "palm-trace.css", "serve.mjs"]) assert.ok(fs.existsSync(path.join(DIR, f)), f);
  const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
  const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html) || [])[1] || "";
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.ok(!/https?:\/\//.test(csp), "no remote origin in the policy");
  const page = ["index.html", "palm-trace.js", "palm-trace-core.js", "palm-trace.css"].map(f => fs.readFileSync(path.join(DIR, f), "utf8")).join("\n");
  assert.ok(!/(?:src|href)=["']https?:/i.test(page), "no remote script / style / link");
  assert.ok(!/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\s*\(/.test(page.replace(/\/\/.*$/gm, "")), "no network API call in the page code");
  assert.ok(!/localStorage\.setItem\([^)]*(image|photo|bitmap|dataUrl|toDataURL)/i.test(page), "never stores the photo");
  assert.ok(!/toDataURL|toBlob/.test(page), "the photo is never re-encoded");
});

/** raw request to the loopback server (custom Host, path sent as given) */
function raw(port, method, p, headers = {}) {
  return new Promise((res, rej) => {
    const r = http.request({ host: "127.0.0.1", port, method, path: p, headers: { Host: "127.0.0.1:" + port, ...headers } }, x => {
      let b = ""; x.on("data", d => { b += d; }); x.on("end", () => res({ status: x.statusCode, headers: x.headers, body: b }));
    });
    r.on("error", rej); r.end();
  });
}

test("serve.mjs: loopback only, exact file allow-list, GET only, Host checked, no-store + CSP headers", async () => {
  const { startTraceServer } = await import(path.join(DIR, "serve.mjs"));
  const srv = await startTraceServer({ port: 0 });
  try {
    assert.equal(srv.address().address, "127.0.0.1", "bound to 127.0.0.1 only");
    const port = srv.address().port;
    for (const p of ["/", "/index.html", "/palm-trace.js", "/palm-trace-core.js", "/palm-trace.css"]) {
      const r = await raw(port, "GET", p);
      assert.equal(r.status, 200, p);
      assert.match(String(r.headers["content-security-policy"]), /connect-src 'none'/, p + " CSP header");
      assert.equal(r.headers["cache-control"], "no-store", p);
      assert.equal(r.headers["x-content-type-options"], "nosniff", p);
      assert.equal(r.headers["referrer-policy"], "no-referrer", p);
    }
    for (const p of ["/serve.mjs", "/../../package.json", "/..%2f..%2fpackage.json", "/%2e%2e/%2e%2e/server.py", "/tools/palm-trace/index.html",
      "/palm-trace.js/../../../CLAUDE.md", "/photos/x.jpg", "/x.palm-trace.json"]) {
      const r = await raw(port, "GET", p);
      assert.ok(r.status === 404 || r.status === 400, p + " -> " + r.status);
      assert.ok(!/LENSIQ|"devDependencies"/.test(r.body), p + " leaked a repo file");
    }
    assert.equal((await raw(port, "POST", "/index.html")).status, 405, "no upload route");
    assert.equal((await raw(port, "PUT", "/x.json")).status, 405);
    assert.equal((await raw(port, "GET", "/index.html", { Host: "evil.example:" + port })).status, 421, "DNS rebinding refused");
    assert.equal((await raw(port, "GET", "/index.html", { Host: "localhost:" + port })).status, 200);
  } finally { await new Promise(r => srv.close(r)); }
});
