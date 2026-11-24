// tools/petread-s2.mjs — acceptance criterion S2 for the pet reading page (docs/acceptance/petread.md S, via fortune-pages.md S and
// README S2, proposed target, not changed here), on the docs/SPEED.md profile (tools/perf-measure.mjs PROFILE: CPU 4x throttle +
// Chrome DevTools Fast 3G, 390 x 844 mobile, cold cache). Copied from tools/fortune-s2.mjs (same definitions, same busy-machine
// rule); only the page list, the phase and this header differ. Source of every number: synthetic, emulated mid-range phone
// (headless Chrome), never a real phone. FIXED HARNESS locked (evals-locks/petread-90.sha256) before any measurement; it refuses
// to run unless its own field copy is locked and equal.
// Targets: FCP <= 3000 ms; first usable control <= 8000 ms; camera page: camera ready <= 15000 ms. The pet sheet names no
// product-specific result time, so none is a target and none is measured here.
// Definitions (fixed, as tools/fortune-s2.mjs):
//   FCP                  paint timing "first-contentful-paint" (ms from navigation start)
//   first usable control the page's main control (#petCamOn, the selector of tests/e2e/iphone-pages-webkit.e2e.mjs) is in the
//                        DOM, visible (>= 44 x 44 px), enabled, DOMContentLoaded has fired and window.LQI18N is up
//   camera ready         after the control is usable it is pressed (time 0); camera ready = a <video> on the page shows a frame
//                        (videoWidth > 0 and currentTime > 0). Device: tests/e2e/fake-cams.js.
// Runs: 3 (cold, own context), median; 1-minute load average before/after each run; a run with load >= 20 is "busy machine" and
// does not count. Pass = the median of the counted runs meets every target, with >= 3 counted runs.
// Output: ~/LENSIQ-field/evals/petread-90/results/s2-<UTC>.json (and a line on stdout).
//   node tools/petread-s2.mjs [--runs=3] [--cap=90]
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, loadavg } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertFreeSpace } from "./disk-guard.mjs";
import { assertLocked } from "./eval-guard.mjs";
import { PROFILE, median, serve } from "./perf-measure.mjs";
import { launch } from "../tests/e2e/cdp.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PHASE = "petread-90";
const FIELD = join(homedir(), "LENSIQ-field", "evals", PHASE);
export const TARGETS = { fcp: 3000, control: 8000, camera: 15000 };
const BUSY_LOAD = 20;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = p => createHash("sha256").update(readFileSync(p)).digest("hex");

const MAIN = { "petread.html": "#petCamOn" };
const CAMERA = new Set(["petread.html"]);
const CONTROL = sel => `(() => { if (!window.__dcl || !window.LQI18N) return false; const b = [...document.querySelectorAll(${JSON.stringify(sel)})]
  .find(e => { const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && !e.disabled && getComputedStyle(e).visibility !== "hidden"; });
  return !!b; })()`;
const PRESS = sel => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.getBoundingClientRect().width >= 44); b.click(); return performance.now(); })()`;
const CAM_READY = `(() => [...document.querySelectorAll("video")].some(v => v.videoWidth > 0 && v.currentTime > 0))()`;
const DCL = `document.addEventListener("DOMContentLoaded", () => { window.__dcl = 1; });`;

async function poll(page, expr, until) {
  for (;;) {
    const v = await page.evaluate(expr).catch(() => false);
    if (v) return await page.evaluate("performance.now()");
    if (Date.now() > until) return null;
    await sleep(100);
  }
}

async function once(browser, base, path, capSec, fakeCams) {
  const init = CAMERA.has(path) ? [fakeCams, `window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" };`] : [];
  const page = await browser.newPage(null, { isolated: true, initScripts: [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`, DCL, ...init] });
  const la0 = loadavg()[0];
  try {
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.send("Network.setBypassServiceWorker", { bypass: true }).catch(() => {});
    await page.send("Network.emulateNetworkConditions", PROFILE.net);
    await page.send("Emulation.setCPUThrottlingRate", { rate: PROFILE.cpuRate });
    await page.send("Emulation.setDeviceMetricsOverride", PROFILE.viewport);
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    const cap = Date.now() + capSec * 1000;
    page.send("Page.navigate", { url: `${base}/${path}` }).catch(() => {});
    const control = await poll(page, CONTROL(MAIN[path]), cap);
    const fcp = await page.evaluate(`(performance.getEntriesByType("paint").find(e => e.name === "first-contentful-paint") || {}).startTime || null`).catch(() => null);
    const r = { path, fcp: fcp == null ? null : Math.round(fcp), control: control == null ? null : Math.round(control), camera: null };
    if (CAMERA.has(path) && control != null) {
      const t0 = await page.evaluate(PRESS(MAIN[path]));
      const cam = await poll(page, CAM_READY, cap);
      r.camera = cam == null ? null : Math.round(cam - t0);
    }
    const la1 = loadavg()[0];
    r.load = [+la0.toFixed(2), +la1.toFixed(2)];
    r.busy = Math.max(la0, la1) >= BUSY_LOAD;
    return r;
  } finally { await page.close(); }
}

async function main() {
  assertFreeSpace({ label: "tools/petread-s2.mjs" });
  const self = join(repo, "tools", "petread-s2.mjs");
  const g = assertLocked(PHASE, [join(FIELD, "tools", "petread-s2.mjs")]);
  if (g.files[0].sha256 !== sha(self)) throw new Error("tools/petread-s2.mjs differs from its locked field copy; re-lock before measuring");
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const a = argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
  const runs = Math.max(3, +arg("runs", "3")), capSec = Math.max(30, +arg("cap", "90"));
  const fakeCams = readFileSync(join(repo, "tests", "e2e", "fake-cams.js"), "utf8");
  const head = (await import("node:child_process")).execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo }).toString().trim();
  const srv = await serve(repo);
  const browser = await launch();
  const out = { source: "synthetic, emulated mid-range phone (headless Chrome)", profile: PROFILE, targets: TARGETS, head, lock: g.lockCommit,
    at: new Date().toISOString(), runs, rows: [] };
  try {
    const only = arg("pages", ""), list = Object.keys(MAIN).filter(p => !only || only.split(",").includes(p.replace(/\.html$/, "")));
    for (const p of list) {
      const all = [];
      for (let i = 0; i < runs; i++) {
        try { all.push(await once(browser, srv.base, p, capSec, fakeCams)); } catch (e) { all.push({ path: p, error: String(e.message || e) }); }
      }
      const ok = all.filter(r => !r.error && !r.busy);
      const m = k => median(ok.map(r => r[k]));
      const row = { path: p, counted: ok.length, fcp: m("fcp"), control: m("control"), camera: CAMERA.has(p) ? m("camera") : undefined, all };
      const misses = [];
      if (ok.length < 3) misses.push(`only ${ok.length} counted run(s)`);
      if (row.fcp == null || row.fcp > TARGETS.fcp) misses.push(`FCP ${row.fcp} > ${TARGETS.fcp}`);
      if (row.control == null || row.control > TARGETS.control) misses.push(`control ${row.control} > ${TARGETS.control}`);
      if (CAMERA.has(p) && (row.camera == null || row.camera > TARGETS.camera)) misses.push(`camera ${row.camera} > ${TARGETS.camera}`);
      row.pass = !misses.length; row.misses = misses;
      out.rows.push(row);
      console.log(`${p.padEnd(20)} counted ${ok.length}/${runs}  FCP ${row.fcp}  control ${row.control}` +
        (CAMERA.has(p) ? `  camera ${row.camera}` : "") + `  ${row.pass ? "PASS" : "FAIL: " + misses.join("; ")}` +
        `  load ${all.map(r => (r.load || []).join("/")).join(" ")}`);
    }
  } finally { await browser.close(); srv.stop(); }
  mkdirSync(join(FIELD, "results"), { recursive: true });
  const file = join(FIELD, "results", `s2-${out.at.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log("written " + file);
  process.exitCode = out.rows.every(r => r.pass) ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
