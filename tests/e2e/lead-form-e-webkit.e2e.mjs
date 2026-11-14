// tests/e2e/lead-form-e-webkit.e2e.mjs — Part E (owner order 2026-11-14, defect W-001) on real WebKit with the iPhone 13
// profile, at widths 360 / 375 / 414 and the profile's own width. Test body: lead-form-e-lib.mjs.
// FIXED TEST SET, locked BEFORE the fix in ~/LENSIQ-field/evals/lead-form-e/ and evals-locks/lead-form-e.sha256.
import { webkit, devices } from "playwright";
import { runFormE } from "./lead-form-e-lib.mjs";

export default async function ({ base, repo, check }) {
  const browser = await webkit.launch();
  try {
    const ctxOpts = width => width ? { ...devices["iPhone 13"], viewport: { width, height: 800 } } : { ...devices["iPhone 13"] };
    await runFormE({ browser, ctxOpts, label: "WebKit iPhone", base, repo, check });
  } finally { await browser.close(); }
}
