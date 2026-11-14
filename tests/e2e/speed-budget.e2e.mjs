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

// page -> { kb, req }. Set 2026-11-14 from the measured baseline only (~/LENSIQ-field/evals/speed/baseline/bytes.json:
// origin/main 4413bc3, 3 cold unthrottled loads per page, median; the 3 runs agreed to the KB): baseline x 1.10, KB up to
// the next 10 KB, requests rounded up.
export const BUDGET = {
  "about.html": { kb: 300, req: 15 },
  "account.html": { kb: 400, req: 20 },
  "admin.html": { kb: 700, req: 17 },
  "afterhours.html": { kb: 2040, req: 30 },
  "astro.html": { kb: 1600, req: 37 },
  "attendance.html": { kb: 10430, req: 47 },
  "bays.html": { kb: 2040, req: 30 },
  "bazi.html": { kb: 1420, req: 36 },
  "booth.html": { kb: 10260, req: 40 },
  "camera-notice.html": { kb: 390, req: 20 },
  "cameras.html": { kb: 470, req: 21 },
  "case-review.html": { kb: 410, req: 20 },
  "cat-education.html": { kb: 350, req: 20 },
  "cat-fortune.html": { kb: 370, req: 20 },
  "cat-health.html": { kb: 330, req: 19 },
  "cat-hr.html": { kb: 350, req: 20 },
  "cat-marketing.html": { kb: 360, req: 20 },
  "cat-security.html": { kb: 350, req: 20 },
  "cat-studio.html": { kb: 340, req: 20 },
  "checkout.html": { kb: 17500, req: 29 },
  "converter.html": { kb: 1490, req: 24 },
  "creative-suite.html": { kb: 350, req: 20 },
  "creative.html": { kb: 1920, req: 22 },
  "crowd.html": { kb: 2260, req: 41 },
  "customers.html": { kb: 10240, req: 42 },
  "dream.html": { kb: 1390, req: 35 },
  "driver.html": { kb: 3290, req: 38 },
  "exam-dashboard.html": { kb: 570, req: 28 },
  "exam-hall.html": { kb: 2170, req: 35 },
  "exam-lab.html": { kb: 2170, req: 36 },
  "exam.html": { kb: 450, req: 22 },
  "faceread.html": { kb: 4570, req: 47 },
  "fengshui.html": { kb: 1380, req: 36 },
  "fortune.html": { kb: 440, req: 24 },
  "gate-notice.html": { kb: 320, req: 18 },
  "gate.html": { kb: 330, req: 17 },
  "help.html": { kb: 400, req: 21 },
  "horoscope.html": { kb: 1570, req: 32 },
  "hr.html": { kb: 350, req: 20 },
  "iching.html": { kb: 1340, req: 35 },
  "index.html": { kb: 470, req: 25 },
  "insights.html": { kb: 1010, req: 26 },
  "interview.html": { kb: 2030, req: 22 },
  "lek7.html": { kb: 1420, req: 36 },
  "lifegraph.html": { kb: 1420, req: 36 },
  "luckycolor.html": { kb: 550, req: 29 },
  "medicine.html": { kb: 1400, req: 41 },
  "neuro.html": { kb: 2000, req: 30 },
  "numbers.html": { kb: 1310, req: 33 },
  "nutrition.html": { kb: 550, req: 26 },
  "omr.html": { kb: 480, req: 24 },
  "palm.html": { kb: 8280, req: 47 },
  "parking.html": { kb: 960, req: 36 },
  "photobooth.html": { kb: 43500, req: 43 },
  "planner.html": { kb: 780, req: 28 },
  "pricing.html": { kb: 400, req: 21 },
  "privacy.html": { kb: 440, req: 19 },
  "qc.html": { kb: 790, req: 28 },
  "queue.html": { kb: 2040, req: 30 },
  "report.html": { kb: 1470, req: 32 },
  "retail.html": { kb: 340, req: 19 },
  "signage.html": { kb: 2320, req: 35 },
  "solutions.html": { kb: 490, req: 20 },
  "store.html": { kb: 2370, req: 32 },
  "studio.html": { kb: 52330, req: 42 },
  "tables.html": { kb: 2040, req: 30 },
  "taksa.html": { kb: 1420, req: 36 },
  "tarot.html": { kb: 1620, req: 35 },
  "teamface.html": { kb: 2640, req: 25 },
  "terms.html": { kb: 410, req: 19 },
  "tryon.html": { kb: 630, req: 21 },
  "village.html": { kb: 960, req: 36 },
  "zodiac.html": { kb: 1430, req: 36 }
};

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
