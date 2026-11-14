// tests/e2e/lead-form-e-chrome.e2e.mjs — Part E (owner order 2026-11-14, defect W-001) in Chrome (the same Chrome binary
// the other e2e files use, driven by Playwright so the fake API and the Turnstile test keys work as in the WebKit file),
// phone-sized touch viewport at widths 360 / 375 / 414 and 390. Test body: lead-form-e-lib.mjs.
// FIXED TEST SET, locked BEFORE the fix in ~/LENSIQ-field/evals/lead-form-e/ and evals-locks/lead-form-e.sha256.
import { chromium } from "playwright";
import { CHROME } from "./cdp.mjs";
import { runFormE } from "./lead-form-e-lib.mjs";

export default async function ({ base, repo, check }) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const ctxOpts = width => ({ viewport: { width: width || 390, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await runFormE({ browser, ctxOpts, label: "Chrome", base, repo, check });
  } finally { await browser.close(); }
}
