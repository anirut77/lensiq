// tests/unit/crisis-load-diag.test.js — FIXED TEST SET "crisis-load-diag" (owner decision 203 ค, 2026-11-20), locked BEFORE the
// helper exists (copy + sha256 in ~/LENSIQ-field/evals/crisis-load-diag/, evals-locks/crisis-load-diag.sha256).
// Problem: tests/e2e/crisis-rules-1323-*.e2e.mjs load 171 pages each; on an overloaded machine they fail with "did not load" (page load
// timeout), the same words as a page that is truly broken. Owner's fix: on failure the test records the machine load and the page load
// time, and the message says which case it is:
//   "slow machine"      the page load time exceeded the timeout while the 1-minute load average was high (above 10, owner rule
//                       203 ก), or the page loaded late (it is ready when probed right after the timeout);
//   "page did not load" a real failure: a navigation error, an HTTP error, or no ready page after the timeout while the load was normal.
// The two cases never produce the same message, and BOTH still fail: no timeout, page list or assertion is loosened.
// Helper under test: tests/e2e/load-diag.mjs (classifyLoadFailure, diagnoseLoadFailure, loadFailText, LOAD_HIGH, KIND), used by load()
// in tests/e2e/crisis-rules-kit.mjs and by the load catch blocks of crisis-rules-1323-{a,c,e}.e2e.mjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const diag = () => import(path.join(ROOT, "tests/e2e/load-diag.mjs"));
const kit = () => import(path.join(ROOT, "tests/e2e/crisis-rules-kit.mjs"));

const URL_ = "http://127.0.0.1:8123/tarot.html?nosw&lang=th";
const LOW = [1.8, 2.1, 2.4], HIGH = [45.2, 30.1, 20.7], EDGE = [10, 9, 8];
const NOT_READY = { href: URL_, sameUrl: true, ready: "loading", lang: "", nodes: 0, status: 200, done: false };
const LATE = { href: URL_, sameUrl: true, ready: "complete", lang: "th", nodes: 420, status: 200, done: true };
const base = o => ({ url: URL_, phase: "load event", ms: 20012, timeoutMs: 20000, loadavg: LOW, cpus: 10, probe: NOT_READY, ...o });

/** inputs that must be "slow machine" */
const SLOW = {
  "load event timeout, load average 45 (above 10)": base({ error: new Error("page load timeout"), loadavg: HIGH }),
  "language wait timeout, load average 12": base({ phase: "language applied", ms: 10004, timeoutMs: 10000, loadavg: [12, 11, 9],
    error: new Error("waitFor timed out after 10000 ms: document.documentElement.lang === \"th\" (last: false)") }),
  "page loaded late (ready when probed), load normal": base({ error: new Error("page load timeout"), probe: LATE }),
  "language applied late (ready when probed), load normal": base({ phase: "language applied", ms: 10010, timeoutMs: 10000, probe: LATE,
    error: new Error("waitFor timed out after 10000 ms: lang") }),
  "load event timeout, load high, probe itself timed out": base({ error: new Error("page load timeout"), loadavg: HIGH, probe: { error: "probe timed out" } }),
};
/** inputs that must be "page did not load" */
const NOT_LOADED = {
  "navigation error from Page.navigate (load high)": base({ ms: 35, loadavg: HIGH, error: new Error("Page.navigate: net::ERR_CONNECTION_REFUSED") }),
  "navigation error page chrome-error:// (load normal)": base({ phase: "language applied", ms: 10002, timeoutMs: 10000,
    error: new Error("waitFor timed out after 10000 ms: lang"), probe: { ...NOT_READY, href: "chrome-error://chromewebdata/", sameUrl: false, ready: "complete" } }),
  "HTTP 404 (load high)": base({ phase: "language applied", ms: 10003, timeoutMs: 10000, loadavg: HIGH,
    error: new Error("waitFor timed out after 10000 ms: lang"), probe: { ...NOT_READY, ready: "complete", nodes: 3, status: 404 } }),
  "HTTP 500 (load normal)": base({ phase: "language applied", ms: 10001, timeoutMs: 10000,
    error: new Error("waitFor timed out after 10000 ms: lang"), probe: { ...NOT_READY, ready: "complete", nodes: 3, status: 500 } }),
  "no DOM after the timeout, load normal": base({ error: new Error("page load timeout") }),
  "no DOM after the timeout, load exactly 10 (not above 10)": base({ error: new Error("page load timeout"), loadavg: EDGE }),
  "DOM but language never applied, load normal": base({ phase: "language applied", ms: 10006, timeoutMs: 10000,
    error: new Error("waitFor timed out after 10000 ms: lang"), probe: { ...LATE, lang: "en", done: false } }),
  "old page still shown (navigation never started), load normal": base({ error: new Error("page load timeout"),
    probe: { ...LATE, href: "http://127.0.0.1:8123/fortune.html?nosw&lang=th", sameUrl: false, done: false } }),
  "browser connection closed (not a timeout), load high": base({ ms: 400, loadavg: HIGH, error: new Error("CDP closed"), probe: { error: "probe failed" } }),
};

test("L1 slow-machine inputs are classified \"slow machine\", still fail, and record load average, page ms and timeout", async () => {
  const { classifyLoadFailure, KIND } = await diag();
  assert.equal(KIND.SLOW, "slow machine");
  for (const [name, input] of Object.entries(SLOW)) {
    const r = classifyLoadFailure(input);
    assert.equal(r.kind, KIND.SLOW, name);
    assert.equal(r.fail, true, name + ": a slow machine must still fail");
    assert.ok(r.message.startsWith("slow machine"), name + ": " + r.message);
    assert.ok(!r.message.includes("page did not load"), name + ": " + r.message);
    assert.deepEqual(r.data.loadavg, input.loadavg, name);
    assert.equal(r.data.ms, input.ms, name);
    assert.equal(r.data.timeoutMs, input.timeoutMs, name);
    assert.ok(r.message.includes(String(input.ms)) && r.message.includes(String(input.timeoutMs)), name + ": ms and timeout in the message: " + r.message);
    assert.ok(r.message.includes(input.loadavg[0].toFixed(1)), name + ": load average in the message: " + r.message);
  }
});

test("L2 real failures are classified \"page did not load\", still fail, and record load average, page ms and timeout", async () => {
  const { classifyLoadFailure, KIND } = await diag();
  assert.equal(KIND.NOT_LOADED, "page did not load");
  for (const [name, input] of Object.entries(NOT_LOADED)) {
    const r = classifyLoadFailure(input);
    assert.equal(r.kind, KIND.NOT_LOADED, name);
    assert.equal(r.fail, true, name);
    assert.ok(r.message.startsWith("page did not load"), name + ": " + r.message);
    assert.ok(!r.message.includes("slow machine"), name + ": " + r.message);
    assert.deepEqual(r.data.loadavg, input.loadavg, name);
    assert.equal(r.data.ms, input.ms, name);
    assert.equal(r.data.timeoutMs, input.timeoutMs, name);
    assert.ok(r.message.includes(String(input.ms)) && r.message.includes(String(input.timeoutMs)), name + ": " + r.message);
  }
});

test("L3 the two cases never produce the same message (also with identical url, ms and load)", async () => {
  const { classifyLoadFailure, KIND } = await diag();
  const slow = new Set(), real = new Set();
  for (const input of Object.values(SLOW)) slow.add(classifyLoadFailure(input).message);
  for (const input of Object.values(NOT_LOADED)) real.add(classifyLoadFailure(input).message);
  for (const m of slow) assert.ok(!real.has(m), m);
  // same url / phase / ms / timeout / load: only the page state differs
  const a = classifyLoadFailure(base({ error: new Error("page load timeout"), probe: LATE }));
  const b = classifyLoadFailure(base({ error: new Error("page load timeout"), probe: NOT_READY }));
  assert.equal(a.kind, KIND.SLOW); assert.equal(b.kind, KIND.NOT_LOADED); assert.notEqual(a.message, b.message);
  // and the load is the only difference
  const c = classifyLoadFailure(base({ error: new Error("page load timeout"), loadavg: [10.1, 9, 8] }));
  assert.equal(c.kind, KIND.SLOW); assert.notEqual(c.message, b.message);
});

test("L4 loadFailText: a load() error gives its classified message; any other error still reads as a failure, never as \"slow machine\"", async () => {
  const { loadFailText, classifyLoadFailure } = await diag();
  const r = classifyLoadFailure(SLOW[Object.keys(SLOW)[0]]);
  const e = Object.assign(new Error(r.message), { lqLoad: r.data });
  assert.equal(loadFailText(e), r.message);
  const t = loadFailText(new Error("something else"));
  assert.ok(t.startsWith("page did not load"), t);
  assert.ok(t.includes("something else"), t);
});

test("L5 diagnoseLoadFailure probes the page, uses os.loadavg() by default and returns an Error carrying the data", async () => {
  const { diagnoseLoadFailure, KIND } = await diag();
  const page = { evaluate: async () => LATE };
  const e = await diagnoseLoadFailure(page, new Error("page load timeout"), { url: URL_, phase: "load event", ms: 20009, timeoutMs: 20000, ready: "true" });
  assert.ok(e instanceof Error);
  assert.equal(e.lqLoad.kind, KIND.SLOW);
  assert.equal(e.lqLoad.loadavg.length, 3);
  assert.equal(typeof e.lqLoad.cpus, "number");
  assert.equal(e.lqLoad.ms, 20009);
  assert.equal(e.lqLoad.timeoutMs, 20000);
  // a hanging probe is cut off and does not hide the failure
  const hang = { evaluate: () => new Promise(() => {}) };
  const t0 = Date.now();
  const e2 = await diagnoseLoadFailure(hang, new Error("page load timeout"), { url: URL_, phase: "load event", ms: 20001, timeoutMs: 20000, ready: "true" },
    { loadavg: LOW, cpus: 10, probeMs: 200 });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(e2.lqLoad.kind, KIND.NOT_LOADED);
  assert.ok(e2.message.startsWith("page did not load"), e2.message);
  const e3 = await diagnoseLoadFailure(hang, new Error("page load timeout"), { url: URL_, phase: "load event", ms: 20001, timeoutMs: 20000, ready: "true" },
    { loadavg: HIGH, cpus: 10, probeMs: 200 });
  assert.equal(e3.lqLoad.kind, KIND.SLOW);
});

test("L6 crisis-rules-kit load() still FAILS (rejects) in both cases, with the classified message", async () => {
  const { load } = await kit();
  const navFail = { goto: async () => { throw new Error("Page.navigate: net::ERR_CONNECTION_REFUSED"); }, waitFor: async () => true,
    evaluate: async () => ({ ...NOT_READY, href: "chrome-error://chromewebdata/", sameUrl: false }) };
  await assert.rejects(load(navFail, "http://127.0.0.1:8123", "tarot", "th"), e => e.message.startsWith("page did not load") && !!e.lqLoad);
  const late = { goto: async () => {}, waitFor: async () => { throw new Error("waitFor timed out after 10000 ms: lang"); }, evaluate: async () => LATE };
  await assert.rejects(load(late, "http://127.0.0.1:8123", "tarot", "th"), e => e.message.startsWith("slow machine") && !!e.lqLoad
    && e.lqLoad.phase === "language applied" && e.lqLoad.timeoutMs === 10000);
  const slowGoto = { goto: async () => { throw new Error("page load timeout"); }, waitFor: async () => true, evaluate: async () => NOT_READY };
  await assert.rejects(load(slowGoto, "http://127.0.0.1:8123", "tarot", "th"), e => /^(slow machine|page did not load)/.test(e.message)
    && e.lqLoad.phase === "load event" && e.lqLoad.timeoutMs === 20000);
  // success path unchanged: resolves
  const ok = { goto: async () => {}, waitFor: async () => true, evaluate: async () => LATE };
  await load(ok, "http://127.0.0.1:8123", "tarot", "th");
});

// RE-LOCK 1 2026-11-21 (owner decision 203 ข, branch split-203b): crisis-rules-1323-{a,c,e} were split by language into
// crisis-rules-1323-{a,c,e}-{th,en,zh}.e2e.mjs (equal relock 11 in evals-locks/crisis-rules-1323.sha256). L7 now reads all 9 split
// files with the same per-file load-catch counts (a 1, c 2, e 1) and the same catch rule, and also requires the 3 originals to be gone,
// so no unsplit copy can escape the check. Equal or stricter; nothing else in this file changed.
test("L7 nothing loosened: same timeouts in load() and cdp.mjs; every load catch in crisis-rules-1323-{a,c,e}-{th,en,zh} still records a problem and skips", async () => {
  const k = read("tests/e2e/crisis-rules-kit.mjs");
  const body = k.slice(k.indexOf("export async function load("), k.indexOf("\n}\n", k.indexOf("export async function load(")));
  assert.match(body, /page\.goto\(`\$\{base\}\/\$\{p\}\.html\?nosw&lang=\$\{lang\}`\)/);
  assert.match(body, /document\.documentElement\.lang === \$\{S\(HTML_LANG\[lang\]\)\}/);
  assert.match(k, /LANG_WAIT_MS = 10000\b/);
  assert.match(k, /PAGE_LOAD_MS = 20000\b/);
  assert.match(body, /await sleep\(450\)/);
  assert.match(read("tests/e2e/cdp.mjs"), /timeout = 20000, isolated = false/);
  const SPLIT = ["a", "c", "e"].flatMap(x => ["th", "en", "zh"].map(l => `${x}-${l}`));
  for (const x of ["a", "c", "e"]) assert.ok(!fs.existsSync(path.join(ROOT, `tests/e2e/crisis-rules-1323-${x}.e2e.mjs`)), `${x}: the unsplit file is gone (203 ข)`);
  for (const f of SPLIT) {
    const src = read(`tests/e2e/crisis-rules-1323-${f}.e2e.mjs`);
    const tries = src.match(/try \{ await load\(/g) || [];
    const fails = src.match(/try \{ await load\([^)]*\); \} catch \(e\) \{ bad\.push\(`\$\{where\}: \$\{loadFailText\(e\)\}`\); continue; \}/g) || [];
    assert.ok(tries.length >= 1, f);
    assert.equal(fails.length, tries.length, `${f}: every load catch records the classified failure in bad[] and skips the page`);
    assert.ok(!/: did not load/.test(src), `${f}: the old unclassified "did not load" message is gone`);
    assert.match(src, /assert\(!bad\.length/, f);
  }
  const counts = Object.fromEntries(SPLIT.map(f => [f, { a: 1, c: 2, e: 1 }[f[0]]]));
  assert.equal(Object.keys(counts).length, 9);
  for (const [f, n] of Object.entries(counts)) assert.equal((read(`tests/e2e/crisis-rules-1323-${f}.e2e.mjs`).match(/try \{ await load\(/g) || []).length, n, f);
});
