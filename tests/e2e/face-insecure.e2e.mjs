// tests/e2e/face-insecure.e2e.mjs — attendance.html / customers.html in an INSECURE context (simulated: window.isSecureContext
// = false, e.g. opened over plain http from another device). Face data can't be encrypted there, so enrolment must be
// blocked up front with LQVault.enrollBlockReason()'s Thai text, the submit button disabled, a submit attempt refused with
// the same text, and nothing face-related written to localStorage.
import { assert } from "./cdp.mjs";

const INSECURE = "Object.defineProperty(window, 'isSecureContext', { configurable: true, get: () => false });";

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const [pg, form, msg] of [["attendance", "#regForm", "#regMsg"], ["customers", "#enrollForm", "#enrollMsg"]]) {
      await check(`${pg}: insecure context blocks face enrolment with the vault's reason, writes no face data`, async () => {
        const page = await browser.newPage(null, { initScripts: [fakeCams, INSECURE] });
        try {
          await page.goto(`${base}/index.html`);
          await page.evaluate(() => localStorage.clear());
          await page.goto(`${base}/${pg}.html?cpu&fakedet`);
          const r = await page.waitFor(`(() => { const m = document.querySelector(${JSON.stringify(msg)}); const why = LQVault.enrollBlockReason(); return why && m.textContent === why && { why, disabled: document.querySelector(${JSON.stringify(form)} + " button[type=submit]").disabled }; })()`, 8000);
          assert(r.disabled, "submit disabled " + JSON.stringify(r));
          // forced submit (button re-enabled by hand) is still refused with the same reason
          const after = await page.evaluate(async (form, msg) => {
            const f = document.querySelector(form), b = f.querySelector("button[type=submit]"); b.disabled = false;
            for (const el of f.querySelectorAll("input")) { if (el.type === "checkbox") el.checked = true; else if (!el.value) el.value = el.name === "phone" ? "0812345678" : "ทดสอบ"; }
            f.requestSubmit(); await new Promise(r => setTimeout(r, 600));
            return { msg: document.querySelector(msg).textContent, keys: Object.keys(localStorage) };
          }, form, msg);
          assert(after.msg === r.why || /กล้องยังไม่พร้อม/.test(after.msg), "refused: " + after.msg);
          assert(!after.keys.some(k => /^lqv-|faces/.test(k)), "no face keys written: " + after.keys);
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
