// tests/e2e/fortune-crisis.e2e.mjs — the crisis safety net on the two fortune pages where people type a question.
// A self-harm question typed into the Tarot box (#trQuestion) or the I Ching box (#icQuestion) shows the support card
// (FortuneAI.crisis: 1323 / 1669 / 191) instead of shuffling or casting; an ordinary question still starts the reading.
// Phrases are checked in Thai, English and Chinese (the check is language-independent; the card follows the page language).
import { assert } from "./cdp.mjs";

const PHRASES = ["ควรฆ่าตัวตายดีไหม", "I can't go on anymore", "活着好累"];
const cardShown = id => `(() => { const b = document.getElementById(${JSON.stringify(id)}); return !!b && !b.hidden && !!b.querySelector(".fa-support") && /1323/.test(b.textContent) && /1669/.test(b.textContent); })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    let page = await browser.newPage(null);
    await check("tarot: a self-harm question shows the support card and does not shuffle; an ordinary question shuffles", async () => {
      await page.goto(`${base}/tarot.html`);
      for (const q of PHRASES) {
        await page.evaluate(q2 => { document.getElementById("trQuestion").value = q2; document.getElementById("trStart").click(); }, q);
        await page.waitFor(cardShown("trSupport"), 5000);
        const r = await page.evaluate(() => ({ pick: document.getElementById("trPick").hidden, setup: document.getElementById("trSetup").hidden, focus: document.activeElement && document.activeElement.id }));
        assert(r.pick && !r.setup, q + ": no shuffle, setup stays: " + JSON.stringify(r));
        assert(r.focus === "trSupport", q + ": focus moves to the card");
      }
      await page.evaluate(() => { document.getElementById("trQuestion").value = "งานใหม่จะดีไหม"; document.getElementById("trStart").click(); });
      await page.waitFor(() => !document.getElementById("trPick").hidden, 8000);
      assert(await page.evaluate(() => document.getElementById("trSupport").hidden), "card hidden again for an ordinary question");
    });
    await page.close();

    page = await browser.newPage(null);
    await check("iching: a self-harm question shows the support card and does not cast; an ordinary question casts", async () => {
      await page.goto(`${base}/iching.html`);
      for (const q of PHRASES) {
        await page.evaluate(q2 => { document.getElementById("icQuestion").value = q2; document.getElementById("icStart").click(); }, q);
        await page.waitFor(cardShown("icSupport"), 5000);
        const r = await page.evaluate(() => ({ stage: document.getElementById("icStage").hidden, setup: document.getElementById("icSetup").hidden }));
        assert(r.stage && !r.setup, q + ": no cast, setup stays: " + JSON.stringify(r));
      }
      await page.evaluate(() => { document.getElementById("icQuestion").value = "ควรเริ่มโปรเจกต์ใหม่ช่วงนี้ไหม"; document.getElementById("icStart").click(); });
      await page.waitFor(() => !document.getElementById("icStage").hidden, 5000);
      assert(await page.evaluate(() => document.getElementById("icSupport").hidden), "card hidden again for an ordinary question");
    });
    await page.close();
  } finally {
    await browser.close();
  }
}
