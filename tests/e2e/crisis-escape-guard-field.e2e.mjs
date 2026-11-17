// tests/e2e/crisis-escape-guard-field.e2e.mjs — FIXED TEST SET "crisis-escape-guard" (locked 2026-11-17 BEFORE measuring), trigger:
// a crisis phrase in the page's own free-text box after a normal reading, on every page that has one.
// Every flow in crisis-escape-guard-kit.mjs: normal reading, collect every result element, trigger the crisis, assert each one
// is allowed in the crisis state (MODE v2: hidden unless it is the help card or a help line). See the kit for the method.
import { FLOWS, runCase } from "./crisis-escape-guard-kit.mjs";

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const page of Object.keys(FLOWS)) {
      const F = FLOWS[page];
      if (!F.field) continue;
      await check(`${page}: crisis via the page's own box after a reading -> every result element hidden or v3-compliant, closing line last (v3)`, async () => {
        await runCase(browser, base, fakeCams, page, "field");
      });
    }
  } finally {
    await browser.close();
  }
}
