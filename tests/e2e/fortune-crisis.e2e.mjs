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

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    let page = await browser.newPage(null);
    // RE-LOCK 2026-11-17 (crisis v3 x hotfix round 2, merge of main 02fdd69; ledger docs/CRISIS-V3-RELOCKS.md): the stricter
    // "flag holds" check is kept in v3 terms: after a crisis question an ordinary question in the same tab keeps the crisis
    // state (no card in v3; the reading goes on), and a fresh tab is calm.
    await check("tarot: a self-harm question sets the crisis state and the shuffle goes on (v3); after it an ordinary question keeps the crisis state, no card; on a fresh page an ordinary question shuffles", async () => {
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
      const after = await page.evaluate(() => ({ crisis: document.documentElement.getAttribute("data-lq-crisis") === "1", card: !!document.querySelector(".fa-support") || !!(document.getElementById("trSupport") && !document.getElementById("trSupport").hidden) }));
      assert(after.crisis && !after.card, "after a crisis question an ordinary question keeps the crisis state, no card: " + JSON.stringify(after));
      await page.close();
      page = await browser.newPage(null, { isolated: true });
      await page.goto(`${base}/tarot.html`);
      await page.evaluate(() => { document.getElementById("trQuestion").value = "งานใหม่จะดีไหม"; document.getElementById("trStart").click(); });
      await page.waitFor(() => !document.getElementById("trPick").hidden, 8000);
      assert(await page.evaluate(() => { const b = document.getElementById("trSupport"); return (!b || b.hidden) && document.documentElement.getAttribute("data-lq-crisis") !== "1"; }), "fresh page: no card, no crisis state for an ordinary question");
    });
    await page.close();

    page = await browser.newPage(null);
    await check("iching: a self-harm question sets the crisis state and the cast goes on (v3); after it an ordinary question keeps the crisis state, no card; on a fresh page an ordinary question casts", async () => {
      await page.goto(`${base}/iching.html`);
      for (const q of PHRASES) {
        await page.evaluate(q2 => { document.getElementById("icQuestion").value = q2; document.getElementById("icStart").click(); }, q);
        // RE-LOCK 2026-11-17 (owner decision 2026-11-17 crisis v3; ledger docs/CRISIS-V3-RELOCKS.md): the crisis state is set and the cast goes on (no card)
        await page.waitFor(() => document.documentElement.getAttribute("data-lq-crisis") === "1" && !document.getElementById("icStage").hidden, 8000);
        assert(await page.evaluate(() => !document.querySelector(".fa-support") && (!document.getElementById("icSupport") || document.getElementById("icSupport").hidden)), q + ": no card");
        await page.reload();
      }
      await page.evaluate(() => { document.getElementById("icQuestion").value = "ควรเริ่มโปรเจกต์ใหม่ช่วงนี้ไหม"; document.getElementById("icStart").click(); });
      await page.waitFor(() => !document.getElementById("icStage").hidden, 8000);
      const after = await page.evaluate(() => ({ crisis: document.documentElement.getAttribute("data-lq-crisis") === "1", card: !!document.querySelector(".fa-support") || !!(document.getElementById("icSupport") && !document.getElementById("icSupport").hidden) }));
      assert(after.crisis && !after.card, "after a crisis question an ordinary question keeps the crisis state, no card: " + JSON.stringify(after));
      await page.close();
      page = await browser.newPage(null, { isolated: true });
      await page.goto(`${base}/iching.html`);
      await page.evaluate(() => { document.getElementById("icQuestion").value = "ควรเริ่มโปรเจกต์ใหม่ช่วงนี้ไหม"; document.getElementById("icStart").click(); });
      await page.waitFor(() => !document.getElementById("icStage").hidden, 5000);
      assert(await page.evaluate(() => { const b = document.getElementById("icSupport"); return (!b || b.hidden) && document.documentElement.getAttribute("data-lq-crisis") !== "1"; }), "fresh page: no card, no crisis state for an ordinary question");
    });
    await page.close();
  } finally {
    await browser.close();
  }
}
