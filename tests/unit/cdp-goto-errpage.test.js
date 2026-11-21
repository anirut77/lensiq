// tests/unit/cdp-goto-errpage.test.js — follow-up G2 of owner decision 203 ค (2026-11-21), redone in the shared e2e driver as the
// independent reviewer asked: page.goto() in tests/e2e/cdp.mjs resolved on the load event alone, and Chrome's own network-error page
// fires a load event too (in a TH run it even carries lang="th"), so any e2e file could run its checks on Chrome's error page.
// goto() now REJECTS (strictly stricter for every e2e file; nothing that rejected before resolves now) when:
//   E1 Page.navigate returns errorText (e.g. net::ERR_CONNECTION_REFUSED)  -> "Page.navigate: <errorText> (<url>)"
//   E2 after the load event the main frame has an unreachableUrl or a chrome-error:// URL       -> "chrome-error: ..."
//   E3 the document is Chrome's neterror document (chrome-error:// location, #main-frame-error or body.neterror) -> "chrome-error: ..."
// and resolves as before on a normal page (E4); a failing probe (CDP call or evaluate throws) never creates a new failure (E5).
// The messages are classified as "page did not load: navigation error" by tests/e2e/load-diag.mjs (E6). Wiring and unchanged parts are
// read from the source (E7). The crisis kit and tests/unit/crisis-split-203b.test.js are untouched.
// This file is locked: evals-locks/cdp-goto-errpage.sha256 (written BEFORE navigationProblem existed in tests/e2e/cdp.mjs).
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = join(__dirname, "..", "..");
let C, D;
before(async () => {
  C = await import(pathToFileURL(join(ROOT, "tests", "e2e", "cdp.mjs")).href);
  D = await import(pathToFileURL(join(ROOT, "tests", "e2e", "load-diag.mjs")).href);
});
const URL_ = "http://127.0.0.1:8123/tarot.html?nosw&lang=th";
/** fake CDP session: Page.getFrameTree answers `frame`; evaluate answers `doc` */
const fake = ({ frame = { id: "f", url: URL_ }, doc = { href: URL_, neterror: false }, sendThrows = false, evalThrows = false } = {}) => ({
  send: async m => { if (sendThrows) throw new Error("cdp gone"); if (m === "Page.getFrameTree") return { frameTree: { frame } }; return {}; },
  evaluate: async () => { if (evalThrows) throw new Error("evaluate: context destroyed"); return doc; }
});
const problem = (f, nav) => C.navigationProblem(f.send, f.evaluate, URL_, nav);

test("E1 Page.navigate errorText is refused", async () => {
  for (const errorText of ["net::ERR_CONNECTION_REFUSED", "net::ERR_NAME_NOT_RESOLVED", "net::ERR_ABORTED"]) {
    const p = await problem(fake(), { frameId: "f", errorText });
    assert.equal(p, `Page.navigate: ${errorText} (${URL_})`);
  }
});

test("E2 a main frame with unreachableUrl or a chrome-error:// URL is refused", async () => {
  for (const frame of [{ id: "f", url: URL_, unreachableUrl: URL_ }, { id: "f", url: "chrome-error://chromewebdata/" }, { id: "f", url: "CHROME-ERROR://chromewebdata/" }]) {
    const p = await problem(fake({ frame }), { frameId: "f" });
    assert.ok(p && p.startsWith("chrome-error:"), JSON.stringify(frame) + " -> " + p);
  }
});

test("E3 Chrome's neterror document is refused (chrome-error:// location, #main-frame-error or body.neterror)", async () => {
  for (const doc of [{ href: "chrome-error://chromewebdata/", neterror: false }, { href: URL_, neterror: true }]) {
    const p = await problem(fake({ doc }), { frameId: "f" });
    assert.ok(p && p.startsWith("chrome-error:"), JSON.stringify(doc) + " -> " + p);
  }
  // the document probe looks for both markers of Chrome's neterror page
  assert.match(C.NETERROR_PROBE, /getElementById\("main-frame-error"\)/);
  assert.match(C.NETERROR_PROBE, /classList\.contains\("neterror"\)/);
  assert.match(C.NETERROR_PROBE, /location\.href/);
});

test("E4 a normal page passes", async () => {
  assert.equal(await problem(fake(), { frameId: "f", loaderId: "l" }), null);
  assert.equal(await problem(fake(), {}), null);
  assert.equal(await problem(fake(), undefined), null);
  assert.equal(await problem(fake({ doc: { href: URL_ + "#g1", neterror: false } }), { frameId: "f" }), null);
});

test("E5 a failing probe never creates a new failure (strictly stricter: only an error page is refused)", async () => {
  assert.equal(await problem(fake({ sendThrows: true }), { frameId: "f" }), null);
  assert.equal(await problem(fake({ evalThrows: true }), { frameId: "f" }), null);
  assert.equal(await problem(fake({ sendThrows: true, evalThrows: true }), { frameId: "f" }), null);
  assert.equal(await problem(fake({ doc: null, frame: null }), { frameId: "f" }), null);
  // errorText is refused even when the probes fail
  assert.ok((await problem(fake({ sendThrows: true, evalThrows: true }), { errorText: "net::ERR_FAILED" })).startsWith("Page.navigate: net::ERR_FAILED"));
});

test("E6 the refusal messages read as \"page did not load: navigation error\" in the load diagnostics", async () => {
  for (const nav of [{ errorText: "net::ERR_CONNECTION_REFUSED" }, { frameId: "f" }]) {
    const f = nav.errorText ? fake() : fake({ doc: { href: URL_, neterror: true } });
    const msg = await problem(f, nav);
    const c = D.classifyLoadFailure({ error: new Error(msg), url: URL_, phase: "load event", ms: 50, timeoutMs: 20000, loadavg: [20, 20, 20], cpus: 8, probe: null });
    assert.equal(c.kind, D.KIND.NOT_LOADED, msg);
    assert.match(c.message, /^page did not load: navigation error/);
  }
});

test("E7 goto() wiring: navigate result checked, load waiter cancelled on errorText, problem thrown; everything else unchanged", () => {
  const src = readFileSync(join(ROOT, "tests", "e2e", "cdp.mjs"), "utf8");
  const g = src.slice(src.indexOf("async function goto("), src.indexOf("async function reload("));
  assert.ok(g.length > 0, "goto() found before reload()");
  assert.match(g, /const nav = await s\("Page\.navigate", \{ url: u \}\);/);
  assert.match(g, /if \(nav && nav\.errorText\) \{ w\.cancel\(\); throw new Error\(await navigationProblem\(s, evaluate, u, nav\)\); \}/);
  assert.match(g, /await w;/);
  assert.match(g, /const bad = await navigationProblem\(s, evaluate, u, nav\);\s*if \(bad\) throw new Error\(bad\);/);
  assert.ok(g.indexOf("await w;") < g.indexOf("const bad ="), "the error-page check runs after the load event");
  // waitLoad: same timeout and message; cancel() clears the timer and removes the waiter
  assert.match(src, /const t = setTimeout\(\(\) => rej\(new Error\("page load timeout"\)\), timeout\);/);
  assert.match(src, /cancel = \(\) => \{ clearTimeout\(t\); loadWaiters = loadWaiters\.filter\(f => f !== done\); \}/);
  // unchanged: the newPage defaults (also read by crisis-load-diag L7) and reload()
  assert.match(src, /timeout = 20000, isolated = false/);
  assert.match(src, /async function reload\(\) \{ const w = waitLoad\(\); await s\("Page\.reload", \{ ignoreCache: true \}\); await w; \}/);
});
