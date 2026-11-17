// tests/e2e/fortune-crisis-fields.e2e.mjs — FIXED TEST SET (crisis net, independent review 2026-11-12; locked before the fix).
// A crisis phrase typed into ANY free-text field of a fortune page (not only the question box) shows the support card
// (1323 / 1669) instead of a reading. The review found that horoscope's name field was checked only when ≤ 12 characters
// without a space. Checked here: horoscope name (TH / EN / ZH phrases, long and with spaces), numbers name, report name.
// An ordinary name still gives a reading.
import { assert } from "./cdp.mjs";

const PHRASES = ["I want to die", "อยากตาย จริงๆ", "我想去死"];
// RE-LOCK 2026-11-16 (owner decision 2026-11-16 crisis one-number rules): the card shows 1323 only (no 1669) and links counselling.html
// RE-LOCK 2026-11-17 (owner decision 2026-11-17 crisis v3; ledger docs/CRISIS-V3-RELOCKS.md): "the card instead of the reading" becomes: the crisis state is set, the reading is drawn (no card), and the closing line
// with tel:1323 (no 1669) and the counselling link comes after it. The name / phrase is never echoed (crisis-v3-a, crisis-net-hotfix).
const supportIn = sel => `(() => { const b = document.querySelector(${JSON.stringify(sel)});
  if (!b || document.documentElement.getAttribute("data-lq-crisis") !== "1" || document.querySelector(".fa-support")) return false;
  const secs = b.querySelectorAll(".fa-section, .rp-part"), line = document.querySelector(".lq-helpline-result");
  return secs.length >= 1 && !!line && !!line.querySelector('a[href="tel:1323"]') && !!line.querySelector('a[href*="counselling.html"]') && !/1669/.test(document.body.innerText)
    && !!(secs[secs.length - 1].compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING); })()`;
const setVal = (id, v) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("horoscope: a crisis phrase in the NAME field (long, with spaces, TH/EN/ZH) shows the support card, not a reading", async () => {
      for (const q of PHRASES.concat(["Somchai Jaidee"])) {
        const page = await browser.newPage(null);
        try {
          await page.goto(`${base}/horoscope.html`);
          await page.evaluate(setVal("hsName", q));
          await page.evaluate(setVal("hsDay", "15")); await page.evaluate(setVal("hsMonth", "8")); await page.evaluate(setVal("hsYear", "1990"));
          await page.evaluate(() => document.getElementById("hsGo").click());
          if (q === "Somchai Jaidee") {
            await page.waitFor(() => document.querySelectorAll("#hsRd .fa-section").length >= 3, 20000);
            assert(!(await page.evaluate(() => !!document.querySelector("#hsRd .fa-support"))), "ordinary name: no support card");
          } else {
            await page.waitFor(supportIn("#hsRd"), 20000);
          }
        } finally { await page.close(); }
      }
    });

    await check("numbers: a crisis phrase in the name field sets the crisis state; the narrative goes on with the closing line (v3)", async () => {
      const page = await browser.newPage(null);
      try {
        await page.goto(`${base}/numbers.html`);
        await page.evaluate(setVal("nmName", "I want to die"));
        await page.evaluate(() => { document.getElementById("nmPhone").value = "0823456789"; document.getElementById("nmGo").click(); });
        await page.waitFor(() => !document.getElementById("nmResult").hidden, 8000);
        await page.waitFor(supportIn("#nmNarr"), 10000);
      } finally { await page.close(); }
    });

    await check("report: a crisis phrase in the name field sets the crisis state; the report goes on with the closing line (v3)", async () => {
      const page = await browser.newPage(null, { isolated: true });
      try {
        await page.goto(`${base}/report.html`);
        await page.waitFor(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, 8000);
        await page.evaluate(() => {
          document.getElementById("rpName").value = "我想去死";
          document.querySelector('[data-rp-type="report_basic"]').click();
          document.getElementById("rpAYear").value = "2533";
          document.getElementById("rpGo").click();
        });
        await page.waitFor(supportIn("#rpOut"), 10000);
        assert(await page.evaluate(() => document.querySelectorAll("#rpOut .rp-part").length) >= 1, "the report goes on (v3)");
      } finally { await page.close(); }
    });
  } finally {
    await browser.close();
  }
}
