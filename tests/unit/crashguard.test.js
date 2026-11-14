// Crash guard (stream B "real-phone quality", 2026-11-13): iOS Safari reloads a tab whose page was killed for memory
// (no pagehide fires). lensiq-crashguard.js sets ONE boolean in sessionStorage ("lq-heavy" = "1") while heavy work runs
// (a camera is live) and clears it when the work ends or the page is left normally (pagehide). If the next load finds it,
// the page restarted after a crash: a short TH / EN / ZH note is shown and the page runs in a lighter mode (camera
// capped at 640 px wide). Pure logic here; the pages are covered by tests/e2e/crash-guard.e2e.mjs.
// FIXED TEST written and locked (~/LENSIQ-field/evals/phone-quality/locked.sha256) before the module existed.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../lensiq-crashguard.js");

/** in-memory sessionStorage */
function mem(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, keys: () => [...m.keys()], m };
}
const broken = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); }, removeItem() { throw new Error("SecurityError"); } };

test("key and value: one boolean, nothing else", () => {
  assert.equal(G.KEY, "lq-heavy");
  const s = mem(); const g = G.create({ storage: s });
  g.begin("cam1");
  assert.deepEqual(s.keys(), ["lq-heavy"]);
  assert.equal(s.getItem("lq-heavy"), "1");
});

test("a fresh load is not a recovery", () => {
  const g = G.create({ storage: mem() });
  assert.equal(g.recovered, false);
  assert.equal(g.lite, false);
});

test("begin / end: the marker lives exactly while any heavy work runs", () => {
  const s = mem(); const g = G.create({ storage: s });
  g.begin("a"); g.begin("b");
  g.end("a");
  assert.equal(s.getItem("lq-heavy"), "1", "b still running");
  g.end("b");
  assert.equal(s.getItem("lq-heavy"), null);
  g.end("b"); // ending twice is harmless
  assert.equal(s.getItem("lq-heavy"), null);
});

test("leaving the page normally (pagehide) clears the marker", () => {
  const s = mem(); const g = G.create({ storage: s });
  g.begin("a");
  g.left();
  assert.equal(s.getItem("lq-heavy"), null);
});

test("marker found at load = recovered + lite; the marker is consumed so the next normal load is clean", () => {
  const s = mem({ "lq-heavy": "1" });
  const g = G.create({ storage: s });
  assert.equal(g.recovered, true);
  assert.equal(g.lite, true);
  assert.equal(s.getItem("lq-heavy"), null);
  const g2 = G.create({ storage: s });
  assert.equal(g2.recovered, false);
});

test("any other stored value is not a recovery", () => {
  for (const v of ["0", "", "true ", "{}"]) {
    const g = G.create({ storage: mem({ "lq-heavy": v }) });
    assert.equal(g.recovered, false, JSON.stringify(v));
  }
});

test("storage that throws (private mode, blocked storage): no exception, no recovery", () => {
  const g = G.create({ storage: broken });
  assert.equal(g.recovered, false);
  assert.doesNotThrow(() => { g.begin("a"); g.end("a"); g.left(); });
  const g2 = G.create({ storage: null });
  assert.equal(g2.recovered, false);
  assert.doesNotThrow(() => { g2.begin("a"); g2.end("a"); });
});

test("liteIdeal caps the camera request at 640 px wide, keeps the aspect ratio, never raises it", () => {
  assert.deepEqual(G.liteIdeal({ width: 1280, height: 720 }), { width: 640, height: 360 });
  assert.deepEqual(G.liteIdeal({ width: 1920, height: 1080 }), { width: 640, height: 360 });
  assert.deepEqual(G.liteIdeal({ width: 640, height: 480 }), { width: 640, height: 480 });
  assert.deepEqual(G.liteIdeal({ width: 320, height: 240 }), { width: 320, height: 240 });
  assert.deepEqual(G.liteIdeal(null), { width: 640, height: 480 });
  // a ladder becomes one capped rung per distinct size (highest first)
  assert.deepEqual(G.liteIdeal([{ width: 3840, height: 2160 }, { width: 1920, height: 1080 }, { width: 1280, height: 720 }]), [{ width: 640, height: 360 }]);
  assert.deepEqual(G.liteIdeal([{ width: 1280, height: 960 }, { width: 320, height: 240 }]), [{ width: 640, height: 480 }, { width: 320, height: 240 }]);
});

test("the note exists in Thai, English and Chinese, each in its own script", () => {
  const th = G.text("th"), en = G.text("en"), zh = G.text("zh");
  for (const t of [th, en, zh]) { assert.ok(t.note.length > 20, t.note); assert.ok(t.close.length > 0); }
  assert.match(th.note, /[฀-๿]/);
  assert.match(th.note, /โหมดเบา/);
  assert.doesNotMatch(en.note, /[฀-๿一-鿿]/);
  assert.match(en.note, /restarted/i);
  assert.match(en.note, /lighter mode/i);
  assert.match(zh.note, /[一-鿿]/);
  assert.doesNotMatch(zh.note, /[฀-๿]/);
  assert.match(zh.note, /轻量模式/);
  assert.deepEqual(G.text("xx"), th, "unknown language falls back to Thai");
});

test("the module sends and stores nothing else: no fetch / XHR / localStorage / cookie in its source", () => {
  const src = require("node:fs").readFileSync(require.resolve("../../lensiq-crashguard.js"), "utf8");
  assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|document\.cookie|indexedDB/);
});
