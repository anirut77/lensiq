// tests/e2e/speed-budget.e2e.mjs — PAGE WEIGHT BUDGET per page (speed pass, owner order 2026-11-14 C).
// Each page in BUDGET is opened cold with no user action (tools/perf-measure.mjs measureOnce, no throttling: bytes and
// request counts do not depend on the network profile), until the load event plus 2 s with nothing in flight and 5 s
// without a long task (cap 60 s). FAILS when the bytes transferred or the number of requests go above the page's budget.
// Budget rule (docs/SPEED.md): from the BASELINE (origin/main 4413bc3, 2026-11-14, median of 3 cold unthrottled loads):
// budget = baseline x 1.10, KB rounded up to the next 10 KB, requests rounded up (the 10 % covers the text edits other
// teams make in parallel). A budget may only be lowered (stricter), never raised without a new measured baseline and a
// written reason. Pages added after the baseline have no budget yet: they are listed, not failed.
// Source: synthetic, headless Chrome. Timings are not budgeted here (too noisy on shared CI runners); they are in
// docs/SPEED.md (emulated mid-range phone profile, 3 runs, median).
import { readdirSync } from "node:fs";
import { assert } from "./cdp.mjs";
import { measureOnce } from "../../tools/perf-measure.mjs";

// page -> { kb, req }; 0 = placeholder, set only from the measured baseline (next lock entry)
export const BUDGET = {};

export default async function ({ base, launch, check }) {
  const pages = readdirSync(new URL("../../", import.meta.url)).filter(f => f.endsWith(".html")).sort();
  const extra = pages.filter(p => !BUDGET[p]);
  if (extra.length) console.log(`       pages without a budget yet (added after the baseline): ${extra.join(", ")}`);
  assert(Object.keys(BUDGET).length > 0, "no budget set");
  const browser = await launch();
  try {
    for (const path of pages.filter(p => BUDGET[p])) {
      const b = BUDGET[path];
      await check(`speed budget: ${path} <= ${b.kb} KB and <= ${b.req} requests before any user action`, async () => {
        const r = await measureOnce(browser, base, path, { fast: true, capSec: 60 });
        console.log(`       ${path}: ${r.kb} KB, ${r.requests} requests${r.capped ? " (cut at 60 s)" : ""}`);
        assert(r.kb <= b.kb, `${path}: ${r.kb} KB > budget ${b.kb} KB`);
        assert(r.requests <= b.req, `${path}: ${r.requests} requests > budget ${b.req}`);
      });
    }
  } finally { await browser.close(); }
}
