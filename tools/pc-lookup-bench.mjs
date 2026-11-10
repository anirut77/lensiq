#!/usr/bin/env node
// tools/pc-lookup-bench.mjs — Product Check P4 (review S7): memory and time of the TMT brand lookup in a real Chrome page,
// before (eager: the first P4 build, whole table + every key aggregated; full: the compact whole index) and after
// (on-demand shards), on an EMULATED mid-range phone profile:
// DevTools CPU throttling 4x + a 390 px mobile viewport. NOT a real phone. Heap = Runtime.getHeapUsage after a forced GC
// (performance.measureUserAgentSpecificMemory needs a cross-origin-isolated page, which medicine.html is not).
//
//   node tools/pc-lookup-bench.mjs [--runs 3] [--json]
import { launch } from "../tests/e2e/cdp.mjs";
import { serve } from "./static-server.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const a = process.argv.slice(2), runs = Number(a[a.indexOf("--runs") + 1]) || (a.includes("--runs") ? 3 : 3);
const LABELS = ["TYLENOL 500 Reg. No. 1A 844/39 รักษาหายขาด 100% ไม่มีผลข้างเคียง อย. 13-2-06463-5-0326 paracetamol 500 mg tablets",
  "ZYCEL 200 celecoxib 200 mg capsule, hard · STREPSILS ORANGE WITH VITAMIN C lozenge · Reg. No. 1A 15/50"];
const med = xs => { const s = [...xs].sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(1); };

const srv = await serve(repo);
const browser = await launch();
const out = { profile: "EMULATED mid-range phone: CPU throttling 4x, 390x800 mobile viewport (Chrome DevTools); not a real phone", runs, modes: {} };
try {
  for (const mode of ["eager", "full", "shards"]) {
    const res = [];
    for (let k = 0; k < runs; k++) {
      const page = await browser.newPage(null, { isolated: true });
      await page.goto(`${srv.base}/medicine.html`);
      await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 800, deviceScaleFactor: 2, mobile: true });
      await page.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.send("HeapProfiler.enable");
      const heap = async () => { await page.send("HeapProfiler.collectGarbage"); return (await page.send("Runtime.getHeapUsage")).usedSize; };
      const h0 = await heap();
      const r = await page.evaluate(async ([m, labels]) => {
        const L = window.LQPCLookup, t0 = performance.now(), keep = {};
        window.__bench = keep;
        let first, second, names, fetched = 0;
        if (m === "eager") {
          // the FIRST P4 build (before the review): every key aggregated up front into Maps / Sets, whole table in the page
          const tmt = await (await fetch("vendor/pc-drugs/tmt-2563.json")).json();
          fetched = 1;
          const maps = [new Map(), new Map(), new Map()];
          const agg = (map, key, row) => {
            if (!map.has(key)) map.set(key, { names: new Map(), ing: new Map(), byName: new Map(), str: new Set(), form: new Set() });
            const e = map.get(key);
            e.names.set(row[0], (e.names.get(row[0]) || 0) + 1);
            if (!e.byName.has(row[0])) e.byName.set(row[0], new Map());
            e.byName.get(row[0]).set(row[1], (e.byName.get(row[0]).get(row[1]) || 0) + 1);
            e.ing.set(row[1], (e.ing.get(row[1]) || 0) + 1);
            if (row[2]) e.str.add(row[2]);
            e.form.add(row[3]);
          };
          for (const row of tmt.p) {
            const fk = L.normKey(row[0]), bk = L.baseKey(row[0]);
            if (fk.length >= 4) agg(maps[0], fk, row);
            if (bk.length >= 5 && !L.STOP.has(bk)) { agg(maps[1], bk, row); const ok = L.ocrFold(bk); if (ok.length >= 6) agg(maps[2], ok, row); }
          }
          keep.eager = { tmt, maps };
          keep.idx = L.buildTmtIndex(tmt); // matching itself as today, for the same answer
          names = L.matchTmt(labels[0], keep.idx, { max: 3 }).map(x => x.name);
          first = performance.now() - t0;
          const t1 = performance.now();
          L.matchTmt(labels[1], keep.idx, { max: 3 });
          second = performance.now() - t1;
        } else if (m === "full") {
          const tmt = await (await fetch("vendor/pc-drugs/tmt-2563.json")).json();
          fetched = 1;
          keep.idx = L.buildTmtIndex(tmt);
          names = L.matchTmt(labels[0], keep.idx, { max: 3 }).map(x => x.name);
          first = performance.now() - t0;
          const t1 = performance.now();
          L.matchTmt(labels[1], keep.idx, { max: 3 });
          second = performance.now() - t1;
        } else {
          const cache = keep.cache = new Map();
          const load = n => { if (!cache.has(n)) { fetched++; cache.set(n, fetch("vendor/pc-drugs/tmt/" + n + ".json").then(x => x.json())); } return cache.get(n); };
          keep.meta = await load("meta");
          names = (await L.matchTmtSharded(labels[0], keep.meta, load, { max: 3 })).map(x => x.name);
          first = performance.now() - t0;
          const t1 = performance.now();
          await L.matchTmtSharded(labels[1], keep.meta, load, { max: 3 });
          second = performance.now() - t1;
          for (const [kk, v] of cache) cache.set(kk, await v); // keep the loaded shards alive, as the page does
        }
        return { first, second, names, fetched };
      }, [mode, LABELS]);
      const h1 = await heap();
      res.push({ ...r, heap_mb: (h1 - h0) / 1048576 });
      await page.close();
    }
    out.modes[mode] = { first_label_ms: med(res.map(x => x.first)), second_label_ms: med(res.map(x => x.second)), heap_retained_mb: med(res.map(x => x.heap_mb)),
      files_fetched: res[0].fetched, matched: res[0].names };
  }
} finally { await browser.close(); srv.close(); }
if (a.includes("--json")) console.log(JSON.stringify(out, null, 1));
else {
  console.log(out.profile + `, median of ${runs} runs`);
  for (const [m, v] of Object.entries(out.modes)) {
    console.log(`  ${m.padEnd(6)} first label ${v.first_label_ms} ms (incl. download + index) · second label ${v.second_label_ms} ms · heap kept ${v.heap_retained_mb.toFixed(1)} MB` +
      ` · files ${v.files_fetched} · matched ${v.matched.join(", ")}`);
  }
}
