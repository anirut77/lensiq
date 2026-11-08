#!/usr/bin/env node
// tests/bench/soak.mjs — long-run stability of a camera page on WASM (no WebGL): memory, DOM size, listeners and
// analysis rate sampled at a fixed interval while the page runs, plus a drift report and (round 12) hidden-tab runs.
//
//   LQ_SOAK_VIDEO=/path/clip.mp4 node tests/bench/soak.mjs [--minutes 60 | --hours 8] [--page store] [--json out.json]
//   node tests/bench/soak.mjs --source fake --cams 4 --hours 24 [--real] [--hide-every 30 --hide-for 2] [--sample-min 5]
//
// Sources
//   video (default when LQ_SOAK_VIDEO is set): YOLOX-Nano on ORT WASM via "ใช้ไฟล์วิดีโอทดสอบ" (the page's own file
//     input), one counting line, camera-health monitor on. The video should show real people (e.g. a public MOT
//     sequence encoded locally; never committed).
//   fake: N fake cameras (tests/e2e/fake-cams.js, canvas streams) as LIVE cameras — the multi-camera, unattended path
//     (hub, scheduler, per-camera quality, hidden-tab gaps). Detections are scripted (one person crosses each line every
//     8 s) unless --real, which runs the real YOLOX model on the fake frames (memory of the real pipeline; few people).
// Hidden-tab run (--hide-every M --hide-for H, minutes): every M minutes the page is made hidden for H minutes
//   (visibilityState override + visibilitychange, and Page.setWebLifecycleState frozen/active with --freeze), so the
//   cameras pause exactly as when a user switches tabs or the screen locks. The report compares the injected hidden time
//   with the "offline" seconds the page recorded (day.quality, LQSite.noteGap) and counts the gaps it logged. Headless
//   Chrome does not reproduce real background-tab timer throttling; this checks the page's own accounting and resume.
// Before each sample the heap is garbage-collected (HeapProfiler.collectGarbage), so the number is retained memory.
// Drift report: retained-heap and process-tree RSS slope over the last two thirds (MB/hour), analysis-rate drift
// (median of the first vs the last quarter, % change, slope Hz/hour), DOM-node growth, uncaught exceptions. Flags:
// heap slope > 5 MB/h, RSS slope > 20 MB/h (runs of ≥ 60 min only), rate drop > 20%, DOM growth > 20%, any exception, recorded offline time
// < 90% of the injected hidden time.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../e2e/cdp.mjs";
import { serve } from "../../tools/static-server.mjs";
import { REPO, table } from "./lib.mjs";

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; }, flag = n => args.includes(n);
const VIDEO = process.env.LQ_SOAK_VIDEO ? resolve(process.env.LQ_SOAK_VIDEO) : "";
const SOURCE = opt("--source", VIDEO ? "video" : "fake"), PAGE = opt("--page", "store");
const MIN = opt("--hours") != null ? Math.round(+opt("--hours") * 60) : +opt("--minutes", 10);
const SAMPLE = +opt("--sample-min", MIN > 120 ? 5 : 1), CAMS = Math.max(1, Math.min(4, +opt("--cams", 2)));
const HIDE_EVERY = +opt("--hide-every", 0), HIDE_FOR = +opt("--hide-for", 0), FREEZE = flag("--freeze"), REAL = flag("--real");
if (!(MIN > 0) || !(SAMPLE > 0)) { console.error("bad --minutes/--hours/--sample-min"); process.exit(2); }
if (SOURCE === "video" && (!VIDEO || !existsSync(VIDEO))) { console.log("skip soak: set LQ_SOAK_VIDEO to a local video file with people (or use --source fake)"); process.exit(0); }
if (SOURCE === "fake" && PAGE !== "store") { console.error("--source fake is implemented for --page store"); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
// resident memory of Chrome's whole process tree (browser + renderer + GPU/utility helpers) in MB — includes the ONNX
// Runtime WASM heap and TF.js buffers, which the JS-heap number does not
function treeRssMB(root) {
  try {
    const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,rss="], { encoding: "utf8" }).trim().split("\n").map(l => l.trim().split(/\s+/).map(Number));
    const kids = new Map(); rows.forEach(([pid, ppid]) => { if (!kids.has(ppid)) kids.set(ppid, []); kids.get(ppid).push(pid); });
    const rss = new Map(rows.map(([pid, , r]) => [pid, r])), seen = new Set([root]), st = [root];
    while (st.length) for (const k of kids.get(st.pop()) || []) if (!seen.has(k)) { seen.add(k); st.push(k); }
    return [...seen].reduce((a, p) => a + (rss.get(p) || 0), 0) / 1024;
  } catch { return null; }
}
/** least-squares slope of y over x (per unit x) */
export function slope(pts) {
  const p = pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)); if (p.length < 3) return null;
  const mx = p.reduce((a, q) => a + q[0], 0) / p.length, my = p.reduce((a, q) => a + q[1], 0) / p.length;
  const d = p.reduce((a, q) => a + (q[0] - mx) ** 2, 0); return d > 0 ? p.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0) / d : null;
}
const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** drift report from the sampled rows (pure: tests/unit/camera-soak.test.js) */
export function drift(rows, { injectedHiddenSec = 0 } = {}) {
  const tail = rows.slice(Math.floor(rows.length / 3)), q = Math.max(1, Math.floor(rows.length / 4));
  const run = rows.filter(r => r.min > 0);
  const hz0 = med(run.slice(0, q).map(r => r.hz)), hz1 = med(run.slice(-q).map(r => r.hz));
  const heapSlope = slope(tail.map(r => [r.min / 60, r.heapMB])), rssSlope = slope(tail.map(r => [r.min / 60, r.rssMB]));
  const hzSlope = slope(run.map(r => [r.min / 60, r.hz]));
  const nodes0 = rows[0] ? rows[0].nodes : null, nodes1 = rows.length ? rows.at(-1).nodes : null;
  const last = rows.at(-1) || {};
  const out = {
    heapSlopeMBperHour: heapSlope, rssSlopeMBperHour: rssSlope, hzStart: hz0, hzEnd: hz1, hzChangePct: hz0 ? (hz1 - hz0) / hz0 * 100 : null, hzSlopePerHour: hzSlope,
    nodesStart: nodes0, nodesEnd: nodes1, nodesGrowthPct: nodes0 ? (nodes1 - nodes0) / nodes0 * 100 : null,
    exceptions: last.exceptions || 0, injectedHiddenSec, recordedOfflineSec: last.offlineSec || 0, gapsLogged: last.gaps || 0, flags: []
  };
  const F = out.flags;
  // slopes from less than an hour are dominated by warm-up and GC noise: reported, not flagged
  const longRun = rows.length > 1 && rows.at(-1).min - rows[0].min >= 60;
  if (longRun && heapSlope != null && heapSlope > 5) F.push(`heap grows ${heapSlope.toFixed(1)} MB/h`);
  if (longRun && rssSlope != null && rssSlope > 20) F.push(`RSS grows ${rssSlope.toFixed(0)} MB/h`);
  if (out.hzChangePct != null && out.hzChangePct < -20) F.push(`analysis rate dropped ${(-out.hzChangePct).toFixed(0)}%`);
  if (out.nodesGrowthPct != null && out.nodesGrowthPct > 20) F.push(`DOM nodes grew ${out.nodesGrowthPct.toFixed(0)}%`);
  if (out.exceptions) F.push(`${out.exceptions} uncaught exception(s)`);
  if (injectedHiddenSec > 0 && out.recordedOfflineSec < 0.9 * injectedHiddenSec) F.push(`hidden time under-recorded: ${out.recordedOfflineSec.toFixed(0)} s of ${injectedHiddenSec.toFixed(0)} s`);
  out.verdict = F.length ? "check" : "stable";
  return out;
}

// fake-mode script: on every camera one person walks across the line every 8 s (alternating direction)
function fakeScript() {
  window.__LQ_FAKE_DET = (key, now) => {
    const t = (now / 1000) % 8, dir = Math.floor(now / 8000) % 2, k = +String(key).replace(/\D/g, "") || 1;
    if (t > 4) return [];
    const x = dir ? 0.2 + 0.6 * t / 4 : 0.8 - 0.6 * t / 4;
    return [{ x: x - 0.05, y: 0.25 + 0.05 * (k % 2), w: 0.1, h: 0.45, score: 0.95 }];
  };
}
function seedFake(n) {
  localStorage.clear();
  const cams = Array.from({ length: n }, (_, i) => ({ slot: "c" + (i + 1), deviceId: "fake-cam-" + (i + 1), label: "Fake Camera " + (i + 1), name: "soak " + (i + 1), role: "door" }));
  localStorage.setItem("st-cams", JSON.stringify({ v: 1, cams }));
  cams.forEach(c => localStorage.setItem("st-cam-" + c.slot, JSON.stringify({ line: { a: { x: 0.5, y: 0.02 }, b: { x: 0.5, y: 0.98 } }, swap: false, zones: [], detW: 0 })));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const srv = await serve(REPO);
  const browser = await launch();
  const rows = [];
  let injectedHiddenSec = 0;
  try {
    const fake = SOURCE === "fake";
    const init = fake ? [readFileSync(join(REPO, "tests", "e2e", "fake-cams.js"), "utf8"), `window.__LQ_FAKE_CAMS={n:${CAMS},mode:'ok'}`] : [];
    const page = await browser.newPage(null, { initScripts: init });
    const url = `${srv.base}/${PAGE}.html?cpu&nosw${fake && !REAL ? "&fakedet" : ""}`;
    await page.goto(url);
    if (fake) await page.evaluate(seedFake, CAMS);
    else await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem("st-cam-c1", JSON.stringify({ line: { a: { x: 0.5, y: 0.02 }, b: { x: 0.5, y: 0.98 } }, swap: false, zones: [{ id: "z1", name: "zone", x: 0.6, y: 0.2, w: 0.3, h: 0.6 }], detW: 0 }));
    });
    await page.goto(url);
    await page.send("DOM.enable"); await page.send("HeapProfiler.enable"); await page.send("Performance.enable");
    if (fake) {
      if (!REAL) await page.evaluate(fakeScript);
      await page.evaluate(() => document.getElementById("startCam").click());
      await page.waitFor(`window.__ST && __ST.running && __ST.hub.cams.length === ${CAMS} && __ST.hub.cams.every(c => c.status === "live")`, 60000);
    } else {
      const { root } = await page.send("DOM.getDocument", {});
      const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#file" });
      await page.send("DOM.setFileInputFiles", { nodeId, files: [VIDEO] });
      await page.waitFor("window.__ST && __ST.running", 60000);
    }
    const setHidden = async on => {
      await page.evaluate(h => {
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
        document.dispatchEvent(new Event("visibilitychange"));
      }, on);
      if (FREEZE) { try { await page.send("Page.setWebLifecycleState", { state: on ? "frozen" : "active" }); } catch { /* unsupported */ } }
    };
    const t0 = Date.now();
    let nextHide = HIDE_EVERY > 0 && HIDE_FOR > 0 ? t0 + HIDE_EVERY * 60000 : Infinity;
    const sample = async m => {
      await page.send("HeapProfiler.collectGarbage");
      const { metrics } = await page.send("Performance.getMetrics");
      const g = k => (metrics.find(x => x.name === k) || {}).value;
      const st = await page.evaluate(() => {
        const s = __ST.sched.stats(), keys = Object.keys(s), hz = keys.length ? keys.reduce((a, k) => a + s[k].hz, 0) / keys.length : 0;
        const f = document.querySelector("#camGrid .st-health"), q = __ST.day.quality || {};
        const off = Object.values(q).reduce((a, e) => a + ((e && e.offline) || 0), 0);
        return { hz, cams: keys.length, inferMs: (document.querySelector("#camGrid .st-hz") || {}).textContent, in: __ST.day.in, out: __ST.day.out, running: __ST.running,
          health: f ? f.textContent + (f.title ? " — " + f.title : "") : "", offlineSec: off, gaps: (__ST.day.gaps || []).length };
      });
      const exceptions = page.consoleErrors.filter(e => e.kind === "exception").length;
      rows.push({ min: m, rssMB: treeRssMB(browser.proc.pid), heapMB: g("JSHeapUsedSize") / 1048576, totalMB: g("JSHeapTotalSize") / 1048576, nodes: g("Nodes"), listeners: g("JSEventListeners"), docs: g("Documents"), exceptions, ...st });
      const r = rows.at(-1);
      console.log(`  ${String(m).padStart(4)} min  rss ${r.rssMB == null ? "—" : r.rssMB.toFixed(0)} MB  heap ${r.heapMB.toFixed(1)} MB  nodes ${r.nodes}  listeners ${r.listeners}  ${r.hz.toFixed(1)} Hz × ${r.cams}  in ${r.in} out ${r.out}  offline ${r.offlineSec.toFixed(0)} s (${r.gaps} gaps)  ${r.health}`);
    };
    await sample(0);
    for (let m = SAMPLE; m <= MIN + 1e-9; m += SAMPLE) {
      const due = t0 + m * 60000;
      while (Date.now() < due) {
        if (Date.now() >= nextHide) {
          const h0 = Date.now(); await setHidden(true);
          await sleep(Math.min(HIDE_FOR * 60000, Math.max(0, t0 + MIN * 60000 - Date.now())));
          await setHidden(false); injectedHiddenSec += (Date.now() - h0) / 1000;
          nextHide = Date.now() + HIDE_EVERY * 60000;
          continue;
        }
        await sleep(Math.max(0, Math.min(due, nextHide) - Date.now()));
      }
      await sample(+m.toFixed(2));
    }
    const d = drift(rows, { injectedHiddenSec });
    const out = { page: PAGE, source: SOURCE, cams: SOURCE === "fake" ? CAMS : 1, realModel: SOURCE === "video" || REAL, minutes: MIN, sampleMin: SAMPLE,
      hidden: HIDE_EVERY > 0 ? { everyMin: HIDE_EVERY, forMin: HIDE_FOR, freeze: FREEZE } : null, video: VIDEO ? VIDEO.split("/").pop() : null,
      startedAt: new Date(t0).toISOString(), chrome: browser.version || null, drift: d,
      // round-11 fields kept for older reports
      heapSlopeMBperHour: d.heapSlopeMBperHour, rssSlopeMBperHour: d.rssSlopeMBperHour, rssStartMB: rows[0].rssMB, rssEndMB: rows.at(-1).rssMB, rssMaxMB: Math.max(...rows.map(r => r.rssMB || 0)),
      heapStartMB: rows[0].heapMB, heapEndMB: rows.at(-1).heapMB, heapMaxMB: Math.max(...rows.map(r => r.heapMB)), nodesStart: rows[0].nodes, nodesEnd: rows.at(-1).nodes, nodesMax: Math.max(...rows.map(r => r.nodes)), exceptions: d.exceptions, rows };
    const f1 = v => v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(2);
    console.log("\n" + table(["metric", "value"], [["duration / source", `${MIN} min · ${SOURCE}${SOURCE === "fake" ? ` × ${CAMS} cams${REAL ? " (real model)" : " (scripted detections)"}` : ""}`],
      ["retained JS heap start → end (max)", `${out.heapStartMB.toFixed(1)} → ${out.heapEndMB.toFixed(1)} MB (${out.heapMaxMB.toFixed(1)})`],
      ["heap slope, last 2/3 of the run", `${f1(d.heapSlopeMBperHour)} MB/hour`],
      ["Chrome process-tree RSS start → end (max)", out.rssStartMB == null ? "—" : `${out.rssStartMB.toFixed(0)} → ${out.rssEndMB.toFixed(0)} MB (${out.rssMaxMB.toFixed(0)})`],
      ["RSS slope, last 2/3 of the run", `${f1(d.rssSlopeMBperHour)} MB/hour`], ["DOM nodes start → end (max)", `${out.nodesStart} → ${out.nodesEnd} (${out.nodesMax})`],
      ["analysis rate first → last quarter (per camera)", `${d.hzStart == null ? "—" : d.hzStart.toFixed(1)} → ${d.hzEnd == null ? "—" : d.hzEnd.toFixed(1)} Hz (${d.hzChangePct == null ? "—" : f1(d.hzChangePct) + "%"})`],
      ["hidden time injected → recorded offline (gaps)", HIDE_EVERY > 0 ? `${injectedHiddenSec.toFixed(0)} s → ${d.recordedOfflineSec.toFixed(0)} s (${d.gapsLogged})` : "— (no hidden-tab run)"],
      ["uncaught exceptions", d.exceptions], ["verdict", d.verdict + (d.flags.length ? ": " + d.flags.join("; ") : "")]]));
    if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(out, null, 1));
  } finally { await browser.close(); await srv.close(); }
}
