// tests/e2e/fortune-crisis.e2e.mjs — the crisis safety net on the two fortune pages where people type a question.
// A self-harm question typed into the Tarot box (#trQuestion) or the I Ching box (#icQuestion) shows the support card
// (FortuneAI.crisis: 1323 / 1669 / 191) instead of shuffling or casting; an ordinary question still starts the reading.
// Phrases are checked in Thai, English and Chinese (the check is language-independent; the card follows the page language).
import { assert } from "./cdp.mjs";

const PHRASES = ["ควรฆ่าตัวตายดีไหม", "I can't go on anymore", "活着好累"];
// RE-LOCK 2026-11-16 (owner decision 2026-11-16 crisis one-number rules): the card shows 1323 only (no 1669) and links counselling.html
const cardShown = id => `(() => { const b = document.getElementById(${JSON.stringify(id)}); return !!b && !b.hidden && !!b.querySelector(".fa-support") && /1323/.test(b.textContent) && !/1669/.test(b.textContent) && !!b.querySelector('a[href*="counselling.html"]'); })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    let page = await browser.newPage(null);
    await check("tarot: a self-harm question sets the crisis state and the shuffle goes on (v3); an ordinary question shuffles", async () => {
      await page.goto(`${base}/tarot.html`);
      for (const q of PHRASES) {
        await page.evaluate(q2 => { document.getElementById("trQuestion").value = q2; document.getElementById("trStart").click(); }, q);
        // RE-LOCK 2026-11-17 (owner decision 2026-11-17 crisis v3; ledger docs/CRISIS-V3-RELOCKS.md): the crisis state is set and the shuffle goes on (no card)
        await page.waitFor(() => document.documentElement.getAttribute("data-lq-crisis") === "1" && !document.getElementById("trPick").hidden, 8000);
        assert(await page.evaluate(() => !document.querySelector(".fa-support") && (!document.getElementById("trSupport") || document.getElementById("trSupport").hidden)), q + ": no card");
        await page.reload();
      }
      await page.evaluate(() => { document.getElementById("trQuestion").value = "งานใหม่จะดีไหม"; document.getElementById("trStart").click(); });
      await page.waitFor(() => !document.getElementById("trPick").hidden, 8000);
      assert(await page.evaluate(() => !document.getElementById("trSupport") || document.getElementById("trSupport").hidden), "no card for an ordinary question");
    });
    await page.close();

    page = await browser.newPage(null);
    await check("iching: a self-harm question sets the crisis state and the cast goes on (v3); an ordinary question casts", async () => {
      await page.goto(`${base}/iching.html`);
      for (const q of PHRASES) {
        await page.evaluate(q2 => { document.getElementById("icQuestion").value = q2; document.getElementById("icStart").click(); }, q);
        // RE-LOCK 2026-11-17 (owner decision 2026-11-17 crisis v3; ledger docs/CRISIS-V3-RELOCKS.md): the crisis state is set and the cast goes on (no card)
        await page.waitFor(() => document.documentElement.getAttribute("data-lq-crisis") === "1" && !document.getElementById("icStage").hidden, 8000);
        assert(await page.evaluate(() => !document.querySelector(".fa-support") && (!document.getElementById("icSupport") || document.getElementById("icSupport").hidden)), q + ": no card");
        await page.reload();
      }
      await page.evaluate(() => { document.getElementById("icQuestion").value = "ควรเริ่มโปรเจกต์ใหม่ช่วงนี้ไหม"; document.getElementById("icStart").click(); });
      await page.waitFor(() => !document.getElementById("icStage").hidden, 5000);
      assert(await page.evaluate(() => !document.getElementById("icSupport") || document.getElementById("icSupport").hidden), "no card for an ordinary question");
    });
    await page.close();
  } finally {
    await browser.close();
  }
}
