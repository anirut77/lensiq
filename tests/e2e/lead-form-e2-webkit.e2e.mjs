// tests/e2e/lead-form-e2-webkit.e2e.mjs — Part E round 2 (review of form-e @ ba9634c: duplicate POST, source/lang, Turnstile hint) on real WebKit with the iPhone 13
// profile, at widths 360 / 375 / 414 and the profile's own width. Test body: lead-form-e2-lib.mjs.
// FIXED TEST SET, locked BEFORE the fix in ~/LENSIQ-field/evals/lead-form-e2/ and evals-locks/lead-form-e2.sha256.
import { webkit, devices } from "playwright";
import { runFormE2 } from "./lead-form-e2-lib.mjs";

export default async function ({ base, repo, check }) {
  const browser = await webkit.launch();
  try {
    const ctxOpts = width => width ? { ...devices["iPhone 13"], viewport: { width, height: 800 } } : { ...devices["iPhone 13"] };
    await runFormE2({ browser, ctxOpts, label: "WebKit iPhone", base, repo, check });
  } finally { await browser.close(); }
}
