// tests/e2e/smoke.e2e.mjs — every camera page loads with ?cpu (no WebGL) without uncaught exceptions.
// Pages are not migrated to LQCam yet, so they may skip their camera; only uncaught errors fail the check.
// console.error / failed resource loads are printed for information, not failed.
import { assert, assertNoWebGL, assertWasmBackend } from "./cdp.mjs";

export const PAGES = [
  "store", "booth", "customers", "attendance", "signage", "checkout", "qc", "driver",
  "neuro", "photobooth", "faceread", "palm", "fengshui", "insights",
  // round 13: exam / gate / zone quick-win camera pages
  "exam-lab", "exam-hall", "exam-dashboard", "parking", "village", "queue", "tables", "afterhours", "bays",
  // round 14: crowd / case review / medicine / answer-sheet grader / lucky-colour mirror
  "crowd", "case-review", "medicine", "omr", "luckycolor"
];
const SETTLE_MS = 2500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("precondition: WebGL absent, TF.js backend = wasm", async () => {
      const page = await browser.newPage(`${base}/index.html?cpu`);
      await assertNoWebGL(page);
      await assertWasmBackend(page);
      await page.close();
    });
    for (const name of PAGES) {
      await check(`${name}.html?cpu loads without uncaught errors`, async () => {
        const page = await browser.newPage(null, { initScripts: [fakeCams] });
        await page.goto(`${base}/${name}.html?cpu`);
        await sleep(SETTLE_MS);
        const title = await page.evaluate(() => document.title);
        assert(title, "page has a title");
        const uncaught = page.consoleErrors.filter(e => e.kind === "exception");
        const info = page.consoleErrors.filter(e => e.kind !== "exception");
        if (info.length) console.log(`       note: ${info.length} console/resource error(s): ${info.slice(0, 3).map(e => (e.text || "").slice(0, 100) + (e.url ? " " + e.url.replace(base, "") : "")).join(" | ")}`);
        const api = page.requests.filter(r => r.url.startsWith(base + "/api/"));
        if (api.length) console.log(`       note: /api requests (server-optional features): ${api.map(r => r.url.replace(base, "")).join(", ")}`);
        assert(!uncaught.length, "uncaught: " + uncaught.map(e => `${e.text} @${(e.url || "").replace(base, "")}:${e.line}`).join(" || "));
        await page.close();
      });
    }
  } finally { await browser.close(); }
}
