#!/usr/bin/env node
// tools/exam-s2.mjs — Exam lab acceptance sheet (docs/acceptance/exam-lab.md, locked 2026-11-18) criterion S2 for
// exam.html, exam-lab.html and exam-dashboard.html, on the docs/SPEED.md profile (tools/perf-measure.mjs PROFILE:
// CPU 4x throttle + Chrome DevTools Fast 3G, 390 x 844 mobile, cold cache). Source of every number: synthetic, emulated
// mid-range phone (headless Chrome), never a real phone. FIXED HARNESS locked (evals-locks/examlab-90.sha256) before any
// measurement or product change of branch examlab-90; it refuses to run unless its own field copy is locked and equal.
// Targets (README S2, proposed; not changed here):
//   FCP <= 3000 ms; first usable control <= 8000 ms; camera page: camera ready <= 15000 ms.
// Definitions (fixed):
//   FCP                  paint timing "first-contentful-paint" (ms from navigation start)
//   first usable control the page's first action control is in the DOM, visible (>= 44 x 44 px), enabled, and the page
//                        script that handles it has run: exam.html -> the "candidate page" link (a.btn[href=exam-lab.html])
//                        and the language switch (LQI18N); exam-lab.html -> #toCam and window.__LQ_EXAM_LAB;
//                        exam-dashboard.html -> #demoBtn and window.__LQ_EXAM_DB (ms from navigation start)
//   camera ready         exam-lab only, after the first usable control: room, seat and consent are filled and the form is
//                        submitted (time 0); camera ready = the first camera frame is on screen (video.videoWidth > 0 and
//                        currentTime > 0) with the camera-check step shown. The fake camera of tests/e2e/fake-cams.js is
//                        the device (canvas stream). Also recorded, NOT part of the target: "checks ready" = the page has
//                        finished loading its on-device models and shows the check list (#engine ok, #checks filled).
// Runs: 3 per page (cold, own context), median; every run records the 1-minute load average before and after; a run with a
// load average >= 20 is marked "busy machine" and does not count (coordinator rule in docs/SPEED.md). Pass = the median of
// the counted runs meets every target, and at least 3 runs counted.
// Output: ~/LENSIQ-field/evals/examlab-90/results/s2-<UTC>.json (and a line per page on stdout).
//   node tools/exam-s2.mjs [--runs=3] [--cap=90]
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
const PHASE = "examlab-90";
const FIELD = join(homedir(), "LENSIQ-field", "evals", PHASE);
export const TARGETS = { fcp: 3000, control: 8000, camera: 15000 };
const BUSY_LOAD = 20;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = p => createHash("sha256").update(readFileSync(p)).digest("hex");

const CONTROL = {
  "exam.html": `(() => { const a = document.querySelector('main a.btn[href="exam-lab.html"]'); if (!a || !window.LQI18N) return false;
    const r = a.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })()`,
  "exam-lab.html": `(() => { const b = document.querySelector("#toCam"); if (!b || b.disabled || !window.__LQ_EXAM_LAB) return false;
    const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })()`,
  "exam-dashboard.html": `(() => { const b = document.querySelector("#demoBtn"); if (!b || b.disabled || !window.__LQ_EXAM_DB) return false;
    const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })()`
};
const CAM_READY = `(() => { const v = document.querySelector("#video"); return !!v && v.videoWidth > 0 && v.currentTime > 0 && !document.querySelector("#stepCam").hidden; })()`;
const CHECKS_READY = `(() => document.querySelector("#engine").classList.contains("ok") && document.querySelectorAll("#checks li").length >= 3)()`;
const SUBMIT = `(() => { document.querySelector("#room").value = "S2"; document.querySelector("#seat").value = "1";
  document.querySelector("#consent").checked = true; document.querySelector("#noticeForm").requestSubmit(); return performance.now(); })()`;

async function poll(page, expr, until) {
  for (;;) {
    const v = await page.evaluate(expr).catch(() => false);
    if (v) return await page.evaluate("performance.now()");
    if (Date.now() > until) return null;
    await sleep(100);
  }
}

async function once(browser, base, path, capSec, fakeCams) {
  const init = path === "exam-lab.html" ? [fakeCams, `window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" };`] : [];
  const page = await browser.newPage(null, { isolated: true, initScripts: [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`, ...init] });
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
    const control = await poll(page, CONTROL[path], cap);
    const fcp = await page.evaluate(`(performance.getEntriesByType("paint").find(e => e.name === "first-contentful-paint") || {}).startTime || null`).catch(() => null);
    const r = { path, fcp: fcp == null ? null : Math.round(fcp), control: control == null ? null : Math.round(control), camera: null, checks: null };
    if (path === "exam-lab.html" && control != null) {
      const t0 = await page.evaluate(SUBMIT);
      const cam = await poll(page, CAM_READY, cap);
      r.camera = cam == null ? null : Math.round(cam - t0);
      const ck = await poll(page, CHECKS_READY, cap);
      r.checks = ck == null ? null : Math.round(ck - t0);
    }
    const la1 = loadavg()[0];
    r.load = [+la0.toFixed(2), +la1.toFixed(2)];
    r.busy = Math.max(la0, la1) >= BUSY_LOAD;
    return r;
  } finally { await page.close(); }
}

async function main() {
  assertFreeSpace({ label: "tools/exam-s2.mjs" });
  const self = join(repo, "tools", "exam-s2.mjs");
  const g = assertLocked(PHASE, [join(FIELD, "tools", "exam-s2.mjs")]);
  if (g.files[0].sha256 !== sha(self)) throw new Error("tools/exam-s2.mjs differs from its locked field copy; re-lock before measuring");
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
    for (const p of ["exam.html", "exam-lab.html", "exam-dashboard.html"]) {
      const all = [];
      for (let i = 0; i < runs; i++) {
        try { all.push(await once(browser, srv.base, p, capSec, fakeCams)); } catch (e) { all.push({ path: p, error: String(e.message || e) }); }
      }
      const ok = all.filter(r => !r.error && !r.busy);
      const m = k => median(ok.map(r => r[k]));
      const row = { path: p, counted: ok.length, fcp: m("fcp"), control: m("control"), camera: p === "exam-lab.html" ? m("camera") : undefined,
        checks: p === "exam-lab.html" ? m("checks") : undefined, all };
      const misses = [];
      if (ok.length < 3) misses.push(`only ${ok.length} counted run(s)`);
      if (row.fcp == null || row.fcp > TARGETS.fcp) misses.push(`FCP ${row.fcp} > ${TARGETS.fcp}`);
      if (row.control == null || row.control > TARGETS.control) misses.push(`control ${row.control} > ${TARGETS.control}`);
      if (p === "exam-lab.html" && (row.camera == null || row.camera > TARGETS.camera)) misses.push(`camera ${row.camera} > ${TARGETS.camera}`);
      row.pass = !misses.length; row.misses = misses;
      out.rows.push(row);
      console.log(`${p.padEnd(20)} counted ${ok.length}/${runs}  FCP ${row.fcp}  control ${row.control}` +
        (p === "exam-lab.html" ? `  camera ${row.camera}  (checks ready ${row.checks}, not a target)` : "") + `  ${row.pass ? "PASS" : "FAIL: " + misses.join("; ")}` +
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
