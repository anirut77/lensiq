// tests/e2e/api-status-guard.e2e.mjs — FIXED TEST SET "api-status-guard" (owner decision 190, 2026-11-20), locked BEFORE the fix
// on branch api-status-guard (base origin/main 299370b8). Copies + sha256: ~/LENSIQ-field/evals/api-status-guard/,
// evals-locks/api-status-guard.sha256. Real pages on the plain local test server (127.0.0.1, not *.github.io):
//   E1  no LENSIQ_API_BASE: loading tarot / numbers / dream and asking FortuneAI.status() twice sends NO request to
//       /api/fortune/status, and status() says enabled:false
//   E2  LENSIQ_API_BASE set (to the test server itself): exactly one request, to <base>/api/fortune/status
import { assert } from "./cdp.mjs";

const PAGES = ["tarot.html", "numbers.html", "dream.html"];
const STATUS = /\/api\/fortune\/status(?:$|\?)/;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const p of PAGES) {
      await check(`E1 ${p} on 127.0.0.1, no LENSIQ_API_BASE: no request to /api/fortune/status, AI disabled`, async () => {
        const page = await browser.newPage(null);
        try {
          await page.goto(`${base}/${p}`);
          await page.waitFor(() => !!window.FortuneAI, 10000);
          const st = await page.evaluate(() => window.FortuneAI.status().then(() => window.FortuneAI.status()));
          await new Promise(r => setTimeout(r, 500));
          const hits = page.requests.filter(r => STATUS.test(r.url)).map(r => r.url);
          assert(st && st.enabled === false, "status " + JSON.stringify(st));
          assert(hits.length === 0, "requests to /api/fortune/status: " + JSON.stringify(hits));
        } finally { await page.close(); }
      });
      await check(`E2 ${p}, LENSIQ_API_BASE set: exactly one request, to that base`, async () => {
        const page = await browser.newPage(null, { initScripts: [`window.LENSIQ_API_BASE = ${JSON.stringify(base)};`] });
        try {
          await page.goto(`${base}/${p}`);
          await page.waitFor(() => !!window.FortuneAI, 10000);
          await page.evaluate(() => window.FortuneAI.status().then(() => window.FortuneAI.status()));
          await new Promise(r => setTimeout(r, 500));
          const hits = page.requests.filter(r => STATUS.test(r.url)).map(r => r.url);
          assert(hits.length === 1 && hits[0] === `${base}/api/fortune/status`, "requests: " + JSON.stringify(hits));
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
