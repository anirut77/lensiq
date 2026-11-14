#!/usr/bin/env node
// tools/perf-measure.mjs — page load speed and weight on an EMULATED MID-RANGE PHONE (speed pass, owner order 2026-11-14 C).
// Source of every number: synthetic, emulated mid-range phone (headless Chrome + CDP throttling), never a real phone.
//
// Profile (fixed, PROFILE below):
//   CPU      Emulation.setCPUThrottlingRate 4 (4x slower than the host CPU)
//   network  Chrome DevTools "Fast 3G" preset: 1.44 Mbit/s down (180 000 B/s), 675 kbit/s up (84 375 B/s),
//            562.5 ms round trip (Network.emulateNetworkConditions)
//   screen   390 x 844 CSS px, DPR 1, mobile, touch
//   cache    cold: own browser context per run, HTTP cache disabled, service workers bypassed
// Per run: bytes transferred (sum of encodedDataLength), number of requests, FCP (paint timing), DOMContentLoaded,
// load event, "quiet" (last network event before 2 s with nothing in flight), TTI (approximation: end of the
// last long task, >= 50 ms, once 5 s have passed without a long task; never earlier than FCP / DOMContentLoaded),
// JS heap in use at the end (CDP Performance.getMetrics JSHeapUsedSize), and every model-like request (MODEL_RE).
// No user action is taken: what is fetched here is fetched before the user opens a camera or does anything.
//
//   node tools/perf-measure.mjs [--dir=path] [--runs=3] [--out=file.json] [--only=a,b] [--cap=90] [--fast]
//   --dir   folder served (default: the repo); --cap   seconds per run before the run is cut (marked "capped")
import { spawn } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { loadavg } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../tests/e2e/cdp.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PROFILE = {
  name: "emulated mid-range phone: CPU 4x throttle + Chrome DevTools Fast 3G, 390x844 mobile, cold cache",
  cpuRate: 4,
  net: { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375, connectionType: "cellular3g" },
  viewport: { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }
};
// a model or model runtime file: ONNX / TFLite / MediaPipe task / face-api weights (manifest + shards) / WebAssembly /
// anything under vendor/models/ (YOLOX, plate, OCR, COCO-SSD, MobileNet ...)
export const MODEL_RE = /(\.(onnx|ort|tflite|task|wasm|pb|traineddata)(\?|#|$))|(weights_manifest\.json)|(\/vendor\/models\/)|(-shard\d+)|(\/model\.json(\?|$))/i;
export const isModel = url => { try { const u = new URL(url); return MODEL_RE.test(u.pathname); } catch { return false; } };

const sleep = ms => new Promise(r => setTimeout(r, ms));
const INIT = `(() => { try { window.__LQ_LT = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__LQ_LT.push([e.startTime, e.duration]); })
  .observe({ type: "longtask", buffered: true }); } catch (e) {} })();`;

function freePort() {
  return new Promise((res, rej) => {
    const s = createServer(); s.unref(); s.on("error", rej);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

export async function serve(dir) {
  const port = await freePort();
  const proc = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", dir], { stdio: ["ignore", "ignore", "pipe"] });
  proc.stderr.on("data", () => {});
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/index.html")).ok) return { base, stop: () => proc.kill() }; } catch { await sleep(100); } }
  proc.kill(); throw new Error("http.server did not start");
}

/** one cold load of `path` under PROFILE; browser = launch() result */
export async function measureOnce(browser, base, path, { capSec = 90, initScripts = [], fast = false } = {}) {
  const page = await browser.newPage(null, { isolated: true, initScripts: [INIT, ...initScripts] });
  const sid = page.sessionId;
  const reqs = new Map(); // requestId -> {url, t0, done, bytes}
  let lastNet = 0;
  const off = browser.on(m => {
    if (m.sessionId !== sid) return;
    const p = m.params || {};
    if (m.method === "Network.requestWillBeSent") {
      if (/^(data|blob):/.test(p.request.url)) return;
      const prev = reqs.get(p.requestId);
      if (prev && p.redirectResponse) prev.bytes += 0; // redirect: same id, keep the entry
      else reqs.set(p.requestId, { url: p.request.url, t: Date.now(), done: false, bytes: 0, type: p.type });
      lastNet = Date.now();
    } else if (m.method === "Network.loadingFinished" || m.method === "Network.loadingFailed") {
      const r = reqs.get(p.requestId);
      if (r) { r.done = true; if (p.encodedDataLength) r.bytes = p.encodedDataLength; r.failed = m.method === "Network.loadingFailed"; }
      lastNet = Date.now();
    }
  });
  try {
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.send("Network.setBypassServiceWorker", { bypass: true }).catch(() => {});
    if (!fast) {
      await page.send("Network.emulateNetworkConditions", PROFILE.net);
      await page.send("Emulation.setCPUThrottlingRate", { rate: PROFILE.cpuRate });
    }
    await page.send("Emulation.setDeviceMetricsOverride", PROFILE.viewport);
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page.send("Performance.enable");
    const tNav = Date.now();
    let loaded = false;
    page.goto(`${base}/${path}`).then(() => { loaded = true; }, () => {});
    const cap = tNav + capSec * 1000;
    let capped = false;
    // wait: load event, then 2 s with nothing in flight
    for (;;) {
      await sleep(250);
      if (Date.now() > cap) { capped = true; break; }
      const inflight = [...reqs.values()].some(r => !r.done);
      if (loaded && !inflight && Date.now() - lastNet >= 2000) break;
    }
    // then until 5 s after the last long task (TTI window), still within the cap
    const lt = async () => (await page.evaluate("window.__LQ_LT || []").catch(() => [])) || [];
    for (;;) {
      if (capped) break;
      const now = await page.evaluate("performance.now()").catch(() => 0);
      const tasks = await lt();
      const lastEnd = tasks.reduce((a, [s, d]) => Math.max(a, s + d), 0);
      if (now - lastEnd >= 5000) break;
      if (Date.now() > cap) { capped = true; break; }
      await sleep(500);
    }
    const t = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] || {};
      const fcp = (performance.getEntriesByType("paint").find(e => e.name === "first-contentful-paint") || {}).startTime || null;
      return { fcp, dcl: nav.domContentLoadedEventEnd || null, load: nav.loadEventEnd || null, lt: window.__LQ_LT || [] };
    }).catch(() => ({ fcp: null, dcl: null, load: null, lt: [] }));
    const floor = Math.max(t.fcp || 0, t.dcl || 0);
    let tti = floor;
    const sorted = t.lt.slice().sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < sorted.length; i++) {
      const end = sorted[i][0] + sorted[i][1];
      if (end > tti) tti = end;
    }
    const metrics = await page.send("Performance.getMetrics").catch(() => ({ metrics: [] }));
    const heap = ((metrics.metrics || []).find(x => x.name === "JSHeapUsedSize") || {}).value || 0;
    const list = [...reqs.values()];
    const quiet = list.length ? lastNet - tNav : 0;
    const models = list.filter(r => isModel(r.url)).map(r => ({ path: new URL(r.url).pathname, bytes: r.bytes }));
    const bytes = list.reduce((a, r) => a + (r.bytes || 0), 0);
    const r1 = v => v == null ? null : Math.round(v);
    return {
      path, capped, requests: list.length, bytes, kb: Math.round(bytes / 1024),
      fcp: r1(t.fcp), dcl: r1(t.dcl), load: r1(t.load), quiet: capped ? null : r1(quiet), tti: capped ? null : r1(tti),
      heapMB: Math.round(heap / 1048576 * 10) / 10,
      modelKB: Math.round(models.reduce((a, m) => a + m.bytes, 0) / 1024), models
    };
  } finally { off(); await page.close(); }
}

export const median = a => { const s = a.filter(v => v != null).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

export function summarize(runs) {
  const k = ["requests", "kb", "fcp", "dcl", "load", "quiet", "tti", "heapMB", "modelKB"];
  const out = { path: runs[0].path, runs: runs.length, capped: runs.filter(r => r.capped).length };
  for (const key of k) out[key] = median(runs.map(r => r[key]));
  out.heapMB = runs.map(r => r.heapMB).sort((a, b) => a - b)[runs.length >> 1];
  out.models = [...new Set(runs.flatMap(r => r.models.map(m => m.path)))];
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d) => { const a = argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
  const dir = resolve(arg("dir", repo));
  const runs = Math.max(1, +arg("runs", "3"));
  const capSec = Math.max(10, +arg("cap", "90"));
  const only = arg("only", "");
  const out = arg("out", "");
  const fast = argv.includes("--fast"); // no throttling: bytes / requests / model list only (timings are NOT the profile)
  const pages = only ? only.split(",") : readdirSync(dir).filter(f => f.endsWith(".html")).sort();
  const srv = await serve(dir);
  const loadStart = loadavg().map(v => +v.toFixed(2));
  console.log(`perf-measure — ${fast ? "UNTHROTTLED (bytes / requests / models only)" : PROFILE.name} — ${pages.length} page(s) x ${runs} run(s) — dir ${dir} — load avg ${loadStart.join(" ")}`);
  const rows = [], loads = [loadStart];
  const browser = await launch();
  try {
    for (const p of pages) {
      const rs = [];
      for (let i = 0; i < runs; i++) {
        try { rs.push(await measureOnce(browser, srv.base, p, { capSec, fast })); }
        catch (e) { console.log(`  ${p} run ${i + 1}: ERROR ${e.message}`); }
      }
      if (!rs.length) continue;
      const s = summarize(rs);
      s.all = rs.map(r => ({ kb: r.kb, requests: r.requests, fcp: r.fcp, load: r.load, tti: r.tti, heapMB: r.heapMB, capped: r.capped }));
      rows.push(s);
      loads.push(loadavg().map(v => +v.toFixed(2)));
      console.log(`  ${p.padEnd(22)} ${String(s.kb).padStart(6)} KB ${String(s.requests).padStart(4)} req  FCP ${s.fcp} ms  load ${s.load} ms  TTI ${s.tti} ms  heap ${s.heapMB} MB  models ${s.modelKB} KB${s.capped ? `  capped ${s.capped}/${runs}` : ""}${s.models.length ? "  [" + s.models.join(" ") + "]" : ""}`);
      if (out) writeFileSync(out, JSON.stringify({ profile: fast ? "unthrottled" : PROFILE, source: "synthetic, emulated mid-range phone", dir, runs, capSec, at: new Date().toISOString(), loadavg: loads, rows }, null, 1));
    }
  } finally { await browser.close(); srv.stop(); }
  const la = loads.map(l => l[0]);
  console.log(`load avg (1 min) during the run: min ${Math.min(...la)} median ${median(la.map(v => v * 100)) / 100} max ${Math.max(...la)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
