// tests/e2e/fortune-crisis.e2e.mjs — the crisis safety net on the two fortune pages where people type a question.
// A self-harm question typed into the Tarot box (#trQuestion) or the I Ching box (#icQuestion) shows the support card
// (FortuneAI.crisis: 1323 / 1669 / 191) instead of shuffling or casting; an ordinary question still starts the reading on a page
// that never showed the card.
// Re-locked STRICTER 2026-11-17 (crisis-net-hotfix round 2): owner order 2026-11-16 (a): once the card was shown the crisis flag
// holds for the tab, so an ordinary question AFTER the card keeps showing the card (no shuffle / coin step); the old assertion
// "card hidden again for an ordinary question" contradicted the order. Coordinator decision on the reviewer's recommendation,
// reversible by the owner. The ordinary-question path is now checked on a fresh page.
// Phrases are checked in Thai, English and Chinese (the check is language-independent; the card follows the page language).
import { assert } from "./cdp.mjs";

const PHRASES = ["ควรฆ่าตัวตายดีไหม", "I can't go on anymore", "活着好累"];
const cardShown = id => `(() => { const b = document.getElementById(${JSON.stringify(id)}); return !!b && !b.hidden && !!b.querySelector(".fa-support") && /1323/.test(b.textContent) && /1669/.test(b.textContent); })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    let page = await browser.newPage(null);
    await check("tarot: a self-harm question shows the support card and does not shuffle; after it an ordinary question keeps the card; on a fresh page an ordinary question shuffles", async () => {
      await page.goto(`${base}/tarot.html`);
      for (const q of PHRASES) {
        await page.evaluate(q2 => { document.getElementById("trQuestion").value = q2; document.getElementById("trStart").click(); }, q);
        await page.waitFor(cardShown("trSupport"), 5000);
        const r = await page.evaluate(() => ({ pick: document.getElementById("trPick").hidden, setup: document.getElementById("trSetup").hidden, focus: document.activeElement && document.activeElement.id }));
        assert(r.pick && !r.setup, q + ": no shuffle, setup stays: " + JSON.stringify(r));
        assert(r.focus === "trSupport", q + ": focus moves to the card");
      }
      await page.evaluate(() => { document.getElementById("trQuestion").value = "งานใหม่จะดีไหม"; document.getElementById("trStart").click(); });
      await new Promise(r => setTimeout(r, 1500));
      const after = await page.evaluate(() => ({ pick: document.getElementById("trPick").hidden, card: !document.getElementById("trSupport").hidden }));
      assert(after.pick && after.card, "after the card an ordinary question keeps the card, no shuffle: " + JSON.stringify(after));
      await page.close();
      page = await browser.newPage(null, { isolated: true });
      await page.goto(`${base}/tarot.html`);
      await page.evaluate(() => { document.getElementById("trQuestion").value = "งานใหม่จะดีไหม"; document.getElementById("trStart").click(); });
      await page.waitFor(() => !document.getElementById("trPick").hidden, 8000);
      assert(await page.evaluate(() => { const b = document.getElementById("trSupport"); return !b || b.hidden; }), "fresh page: no card for an ordinary question");
    });
    await page.close();

    page = await browser.newPage(null);
    await check("iching: a self-harm question shows the support card and does not cast; after it an ordinary question keeps the card; on a fresh page an ordinary question casts", async () => {
      await page.goto(`${base}/iching.html`);
      for (const q of PHRASES) {
        await page.evaluate(q2 => { document.getElementById("icQuestion").value = q2; document.getElementById("icStart").click(); }, q);
        await page.waitFor(cardShown("icSupport"), 5000);
        const r = await page.evaluate(() => ({ stage: document.getElementById("icStage").hidden, setup: document.getElementById("icSetup").hidden }));
        assert(r.stage && !r.setup, q + ": no cast, setup stays: " + JSON.stringify(r));
      }
      await page.evaluate(() => { document.getElementById("icQuestion").value = "ควรเริ่มโปรเจกต์ใหม่ช่วงนี้ไหม"; document.getElementById("icStart").click(); });
      await new Promise(r => setTimeout(r, 1500));
      const after = await page.evaluate(() => ({ stage: document.getElementById("icStage").hidden, card: !document.getElementById("icSupport").hidden }));
      assert(after.stage && after.card, "after the card an ordinary question keeps the card, no coin step: " + JSON.stringify(after));
      await page.close();
      page = await browser.newPage(null, { isolated: true });
      await page.goto(`${base}/iching.html`);
      await page.evaluate(() => { document.getElementById("icQuestion").value = "ควรเริ่มโปรเจกต์ใหม่ช่วงนี้ไหม"; document.getElementById("icStart").click(); });
      await page.waitFor(() => !document.getElementById("icStage").hidden, 5000);
      assert(await page.evaluate(() => { const b = document.getElementById("icSupport"); return !b || b.hidden; }), "fresh page: no card for an ordinary question");
    });
    await page.close();
  } finally {
    await browser.close();
  }
}
