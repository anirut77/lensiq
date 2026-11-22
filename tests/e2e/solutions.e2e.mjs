// tests/e2e/solutions.e2e.mjs — solutions.html (sector catalogue): no status label or status filter, cards of products not
// offered are hidden, every quick-win page opens without errors, 320/360/390 px, en/zh without Thai.
// Re-lock 2026-11-21 (owner decision 223, inversion): the filters were all / available to try now / coming soon.
// Inverted 2026-11-22 (owner decision 226; invert, never loosen): no status filter, no status tag, no count / empty notes; every
// card carrying data-lq-off (products with no page yet and pages switched off in the nav.js visibility list) is not shown, and
// every other card is shown.
import { noErrors, mobileCheck, langCheck, assert } from "./zones-lib.mjs";

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("no status filter or tag; cards of products not offered are hidden, the others shown", async () => {
      const page = await browser.newPage(`${base}/solutions.html`);
      const r = await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".sl-card")], shown = c => c.getClientRects().length > 0;
        return {
          filter: document.querySelectorAll(".sl-filter, [data-f], #slCount, .sl-none").length,
          tags: document.querySelectorAll(".sl-tag, [data-i18n^='sl.st.']").length,
          offShown: cards.filter(c => c.hasAttribute("data-lq-off") && shown(c)).length,
          onHidden: cards.filter(c => !c.hasAttribute("data-lq-off") && !shown(c)).length,
          off: cards.filter(c => c.hasAttribute("data-lq-off")).length,
          count: __LQSOL.count(), total: cards.length,
          words: /รุ่นทดลอง|เร็ว ๆ นี้|ทดลองใช้ได้ตอนนี้/.test(document.querySelector("main").innerText)
        };
      });
      assert(r.filter === 0 && r.tags === 0 && !r.words, "status filter / tag / words gone " + JSON.stringify(r));
      assert(r.off > 0 && r.offShown === 0 && r.onHidden === 0, "data-lq-off cards hidden, the others shown " + JSON.stringify(r));
      assert(r.count >= 40 && r.count === r.total - r.off, "cards a customer sees " + JSON.stringify(r));
      await mobileCheck(page);
      noErrors(page);
      await page.close();
    });

    await check("quick-win pages linked from the catalogue open without errors (fake camera)", async () => {
      const page = await browser.newPage(`${base}/solutions.html`);
      const links = await page.evaluate(() => [...new Set([...document.querySelectorAll(".sl-go")].map(a => a.getAttribute("href")))]);
      for (const p of ["queue.html", "tables.html", "afterhours.html", "bays.html"]) assert(links.includes(p), p);
      await page.close();
      for (const p of ["queue.html", "tables.html", "afterhours.html", "bays.html"]) {
        const q = await browser.newPage(null, { initScripts: [fakeCams] });
        await q.goto(`${base}/${p}?cpu&fakedet`);
        await q.waitFor(`!!window.__LQZ && !!document.querySelector("#zoneList li")`, 6000);
        noErrors(q);
        await q.close();
      }
    });

    await check("English and Chinese: no Thai left on the page", async () => { await langCheck(browser, base, fakeCams, "solutions.html", null); });
  } finally { await browser.close(); }
}
