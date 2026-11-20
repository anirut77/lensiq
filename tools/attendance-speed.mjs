#!/usr/bin/env node
// tools/attendance-speed.mjs — Attendance S2 timing (acceptance sheet docs/acceptance/attendance.md S2 + README S2): on the
// docs/SPEED.md profile (tools/perf-measure.mjs PROFILE: CPU 4x, Fast 3G, 390 x 844 mobile, cold cache) it loads
// attendance.html?mode=employee and records, per run:
//   fcp      first contentful paint (target <= 3 s)
//   pinReady the PIN pad is usable: window.LQHR is set up, the employee-mode PIN form is shown and #hrCode / #hrPin are
//            visible and enabled (target <= 5 s; it is also the page's first usable control, README target <= 8 s)
//   face     every request for face-api.js, a file under vendor/models/, weights / shards / TF.js (target: none)
//   kb, requests, load average (timings are kept only while the 1-minute load average is below 20, docs/SPEED.md)
// Source class: SYNTHETIC, emulated mid-range phone, never a real phone. Median of the kept runs is reported.
//   node tools/attendance-speed.mjs [--runs=3] [--out=file.json] [--path=attendance.html?mode=employee]
import { writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertFreeSpace } from "./disk-guard.mjs";
import { PROFILE, median, serve } from "./perf-measure.mjs";
import { launch } from "../tests/e2e/cdp.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FACE_RE = /face-api\.js|\/vendor\/models\/|weights_manifest\.json|-shard\d|tfjs|\.tflite|\.onnx/i;
const POLL = `(() => { const t0 = performance.now(); const id = setInterval(() => {
  const c = document.querySelector("#hrCode"), p = document.querySelector("#hrPin"), f = document.querySelector("#hrPinForm");
  const shown = el => !!el && el.getClientRects().length > 0 && !el.disabled && getComputedStyle(el).visibility !== "hidden";
  if (window.LQHR && document.body && document.body.classList.contains("att-emp") && shown(c) && shown(p) && shown(f)) { window.__pinReady = performance.now(); clearInterval(id); }
}, 25); void t0; })();`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function once(browser, base, path) {
  const page = await browser.newPage(null, { isolated: true, initScripts: [POLL] });
  const sid = page.sessionId, reqs = new Map();
  const off = browser.on(m => {
    if (m.sessionId !== sid) return;
    const p = m.params || {};
    if (m.method === "Network.requestWillBeSent" && !/^(data|blob):/.test(p.request.url)) reqs.set(p.requestId, { url: p.request.url, bytes: 0 });
    else if (m.method === "Network.loadingFinished") { const r = reqs.get(p.requestId); if (r) r.bytes = p.encodedDataLength || 0; }
  });
  try {
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.send("Network.setBypassServiceWorker", { bypass: true }).catch(() => {});
    await page.send("Network.emulateNetworkConditions", PROFILE.net);
    await page.send("Emulation.setCPUThrottlingRate", { rate: PROFILE.cpuRate });
    await page.send("Emulation.setDeviceMetricsOverride", PROFILE.viewport);
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    page.goto(`${base}/${path}`).catch(() => {});
    const end = Date.now() + 60000;
    let r = null;
    while (Date.now() < end) {
      await sleep(250);
      r = await page.evaluate(() => ({ pin: window.__pinReady || null, fcp: (performance.getEntriesByType("paint").find(e => e.name === "first-contentful-paint") || {}).startTime || null })).catch(() => null);
      if (r && r.pin && r.fcp) break;
    }
    await sleep(3000); // anything the page fetches right after the PIN pad is ready (still no face model allowed)
    const list = [...reqs.values()];
    return { fcp: r && r.fcp ? Math.round(r.fcp) : null, pinReady: r && r.pin ? Math.round(r.pin) : null, requests: list.length,
      kb: Math.round(list.reduce((a, x) => a + x.bytes, 0) / 1024), face: list.filter(x => FACE_RE.test(x.url)).map(x => new URL(x.url).pathname), load1: Math.round(loadavg()[0] * 10) / 10 };
  } finally { off(); await page.close(); }
}

async function main() {
  assertFreeSpace({ label: "tools/attendance-speed.mjs" });
  const arg = k => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
  const runs = +(arg("runs") || 3), path = arg("path") || "attendance.html?mode=employee", out = arg("out");
  const srv = await serve(repo), browser = await launch();
  const kept = [], dropped = [];
  try {
    for (let i = 0; kept.length < runs && i < runs * 4; i++) {
      if (loadavg()[0] >= 20) { dropped.push({ why: "load " + loadavg()[0].toFixed(1) }); await sleep(20000); continue; }
      const r = await once(browser, srv.base, path);
      (r.load1 < 20 ? kept : dropped).push(r);
      console.log(JSON.stringify(r));
    }
  } finally { await browser.close(); srv.stop(); }
  const res = { at: new Date().toISOString(), source: "synthetic, emulated mid-range phone (docs/SPEED.md profile)", profile: PROFILE.name, path, runs: kept.length, dropped: dropped.length,
    median: { fcp: median(kept.map(r => r.fcp)), pinReady: median(kept.map(r => r.pinReady)), kb: median(kept.map(r => r.kb)), requests: median(kept.map(r => r.requests)) },
    faceRequests: [...new Set(kept.flatMap(r => r.face))], maxLoad: Math.max(0, ...kept.map(r => r.load1)), kept };
  res.pass = { fcp3s: res.median.fcp != null && res.median.fcp <= 3000, pin5s: res.median.pinReady != null && res.median.pinReady <= 5000, control8s: res.median.pinReady != null && res.median.pinReady <= 8000, noFaceModel: !res.faceRequests.length };
  console.log(JSON.stringify({ median: res.median, pass: res.pass, faceRequests: res.faceRequests, runs: res.runs, maxLoad: res.maxLoad }));
  if (out) writeFileSync(out, JSON.stringify(res, null, 1) + "\n");
  process.exit(kept.length === runs ? 0 : 1);
}
main();
