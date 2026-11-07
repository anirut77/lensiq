#!/usr/bin/env node
// tests/bench/soak.mjs — long-run stability of a camera page on WASM (no WebGL): memory, DOM size, listeners and
// analysis rate sampled every minute while the page runs its real models on a looping video file.
//
//   LQ_SOAK_VIDEO=/path/clip.mp4 node tests/bench/soak.mjs [--minutes 60] [--page store] [--json out.json]
//
// store: YOLOX-Nano on ORT WASM via "ใช้ไฟล์วิดีโอทดสอบ" (the page's own file input), one counting line, camera-health
// monitor on. The video should show real people (e.g. a public MOT sequence encoded locally; never committed).
// Before each sample the heap is garbage-collected (HeapProfiler.collectGarbage), so the number is retained memory.
// Verdict: retained-heap slope over the last two thirds of the run (MB/hour) and DOM-node growth.
import { existsSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { launch } from "../e2e/cdp.mjs";
import { serve } from "../../tools/static-server.mjs";
import { REPO, table } from "./lib.mjs";

const args = process.argv.slice(2), opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const MIN = +opt("--minutes", 10), PAGE = opt("--page", "store"), VIDEO = process.env.LQ_SOAK_VIDEO ? resolve(process.env.LQ_SOAK_VIDEO) : "";
if (!VIDEO || !existsSync(VIDEO)) { console.log("skip soak: set LQ_SOAK_VIDEO to a local video file with people"); process.exit(0); }
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

const srv = await serve(REPO);
const browser = await launch();
const rows = [];
try {
  const page = await browser.newPage();
  await page.goto(`${srv.base}/${PAGE}.html?cpu&nosw`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("st-cam-c1", JSON.stringify({ line: { a: { x: 0.5, y: 0.02 }, b: { x: 0.5, y: 0.98 } }, swap: false, zones: [{ id: "z1", name: "zone", x: 0.6, y: 0.2, w: 0.3, h: 0.6 }], detW: 0 }));
  });
  await page.goto(`${srv.base}/${PAGE}.html?cpu&nosw`);
  await page.send("DOM.enable"); await page.send("HeapProfiler.enable"); await page.send("Performance.enable");
  const { root } = await page.send("DOM.getDocument", {});
  const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#file" });
  await page.send("DOM.setFileInputFiles", { nodeId, files: [VIDEO] });
  await page.waitFor("window.__ST && __ST.running", 60000);
  const t0 = Date.now();
  for (let m = 0; m <= MIN; m++) {
    if (m) await sleep(Math.max(0, t0 + m * 60000 - Date.now()));
    await page.send("HeapProfiler.collectGarbage");
    const { metrics } = await page.send("Performance.getMetrics");
    const g = k => (metrics.find(x => x.name === k) || {}).value;
    const st = await page.evaluate(() => {
      const s = __ST.sched.stats(), c = __ST.hub.cams[0] || null, f = document.querySelector("#camGrid .st-health");
      return { hz: s.c1 ? s.c1.hz : 0, inferMs: (document.querySelector("#camGrid .st-hz") || {}).textContent, in: __ST.day.in, out: __ST.day.out, running: __ST.running, health: f ? f.textContent + (f.title ? " — " + f.title : "") : "", cam: !!c };
    });
    rows.push({ min: m, rssMB: treeRssMB(browser.proc.pid), heapMB: g("JSHeapUsedSize") / 1048576, totalMB: g("JSHeapTotalSize") / 1048576, nodes: g("Nodes"), listeners: g("JSEventListeners"), docs: g("Documents"), ...st });
    const r = rows.at(-1);
    console.log(`  ${String(m).padStart(3)} min  rss ${r.rssMB == null ? "—" : r.rssMB.toFixed(0)} MB  heap ${r.heapMB.toFixed(1)} MB  nodes ${r.nodes}  listeners ${r.listeners}  ${r.inferMs}  in ${r.in} out ${r.out}  ${r.health}`);
  }
  const errs = page.consoleErrors.filter(e => e.kind === "exception");
  const tail = rows.slice(Math.floor(rows.length / 3));
  const n = tail.length, mx = tail.reduce((a, r) => a + r.min, 0) / n, my = tail.reduce((a, r) => a + r.heapMB, 0) / n;
  const slope = tail.reduce((a, r) => a + (r.min - mx) * (r.heapMB - my), 0) / Math.max(1e-9, tail.reduce((a, r) => a + (r.min - mx) ** 2, 0)) * 60;
  const rs = tail.filter(r => r.rssMB != null), rmx = rs.reduce((a, r) => a + r.min, 0) / Math.max(1, rs.length), rmy = rs.reduce((a, r) => a + r.rssMB, 0) / Math.max(1, rs.length);
  const rssSlope = rs.length > 2 ? rs.reduce((a, r) => a + (r.min - rmx) * (r.rssMB - rmy), 0) / Math.max(1e-9, rs.reduce((a, r) => a + (r.min - rmx) ** 2, 0)) * 60 : null;
  const out = { page: PAGE, minutes: MIN, video: VIDEO.split("/").pop(), heapSlopeMBperHour: slope, rssSlopeMBperHour: rssSlope, rssStartMB: rows[0].rssMB, rssEndMB: rows.at(-1).rssMB, rssMaxMB: Math.max(...rows.map(r => r.rssMB || 0)), heapStartMB: rows[0].heapMB, heapEndMB: rows.at(-1).heapMB,
    heapMaxMB: Math.max(...rows.map(r => r.heapMB)), nodesStart: rows[0].nodes, nodesEnd: rows.at(-1).nodes, nodesMax: Math.max(...rows.map(r => r.nodes)), exceptions: errs.length, rows };
  console.log("\n" + table(["metric", "value"], [["duration", `${MIN} min`], ["retained JS heap start → end (max)", `${out.heapStartMB.toFixed(1)} → ${out.heapEndMB.toFixed(1)} MB (${out.heapMaxMB.toFixed(1)})`],
    ["heap slope, last 2/3 of the run", `${slope >= 0 ? "+" : ""}${slope.toFixed(2)} MB/hour`],
    ["Chrome process-tree RSS start → end (max)", out.rssStartMB == null ? "—" : `${out.rssStartMB.toFixed(0)} → ${out.rssEndMB.toFixed(0)} MB (${out.rssMaxMB.toFixed(0)})`],
    ["RSS slope, last 2/3 of the run", rssSlope == null ? "—" : `${rssSlope >= 0 ? "+" : ""}${rssSlope.toFixed(1)} MB/hour`], ["DOM nodes start → end (max)", `${out.nodesStart} → ${out.nodesEnd} (${out.nodesMax})`],
    ["analysis rate start / end", `${rows[1] ? rows[1].hz : "—"} / ${rows.at(-1).hz} Hz`], ["uncaught exceptions", errs.length]]));
  if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(out, null, 1));
} finally { await browser.close(); await srv.close(); }
