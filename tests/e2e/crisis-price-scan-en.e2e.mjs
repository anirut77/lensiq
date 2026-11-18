// tests/e2e/crisis-price-scan-en.e2e.mjs — FIXED TEST SET "crisis-v3-protect" (locked 2026-11-18 BEFORE building). Residual risk 1 of
// the crisis-v3 review, language en: on every reading page of the escape guard, after a reading and a crisis phrase, no unmarked price /
// sales text is visible while html[data-lq-crisis] is set (allow-listed exceptions only). Method: crisis-price-scan-kit.mjs.
import { FLOWS, runScan } from "./crisis-price-scan-kit.mjs";

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const page of Object.keys(FLOWS)) {
      await check(`${page} [en]: crisis state after a reading -> no unmarked price / sales text visible`, async () => {
        await runScan(browser, base, fakeCams, page, "en");
      });
    }
  } finally {
    await browser.close();
  }
}
