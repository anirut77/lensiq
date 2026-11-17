// tests/e2e/crisis-escape-guard-report.e2e.mjs — FIXED TEST SET "crisis-escape-guard" (locked 2026-11-17 BEFORE measuring), trigger:
// the "report a problem with this reading" note (lensiq-report.js), on every page that gets the button.
// Every flow in crisis-escape-guard-kit.mjs: normal reading, collect every result element, trigger the crisis, assert each one
// is allowed in the crisis state (MODE v2: hidden unless it is the help card or a help line). See the kit for the method.
import { FLOWS, runCase } from "./crisis-escape-guard-kit.mjs";

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const page of Object.keys(FLOWS)) {
      const F = FLOWS[page];
      if (!F.report) continue;
      await check(`${page}: crisis via the report-dialog note after a reading -> every result element hidden or v3-compliant, closing line last (v3)`, async () => {
        await runCase(browser, base, fakeCams, page, "report");
      });
    }
  } finally {
    await browser.close();
  }
}
