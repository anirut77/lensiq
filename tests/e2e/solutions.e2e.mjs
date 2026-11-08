// tests/e2e/solutions.e2e.mjs — solutions.html (sector catalogue): status filter + remembered choice, "nothing with this
// status" notes, every quick-win page opens without errors, 320/360/390 px, en/zh without Thai.
import { noErrors, mobileCheck, langCheck, assert } from "./zones-lib.mjs";

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("status filter: counts, empty-sector notes, remembered across reload", async () => {
      const page = await browser.newPage(`${base}/solutions.html`);
      await page.evaluate(() => localStorage.removeItem("lq-sol-filter"));
      await page.reload();
      const all = await page.evaluate(() => __LQSOL.count());
      assert(all >= 40, "cards " + all);
      const n = {};
      for (const f of ["now", "pilot", "soon"]) {
        await page.evaluate(f => document.querySelector(`.sl-filter [data-f="${f}"]`).click(), f);
        n[f] = await page.evaluate(() => {
          const sel = document.querySelector(".sl-filter [aria-pressed=true]").dataset.f;
          return {
            c: __LQSOL.count(), txt: document.getElementById("slCount").textContent, pressed: sel,
            empty: [...document.querySelectorAll(".sl-none")].filter(e => !e.hidden).length,
            wrong: [...document.querySelectorAll(".sl-card")].filter(c => !c.hidden && c.dataset.status !== sel).length
          };
        });
        assert(n[f].pressed === f && n[f].wrong === 0 && new RegExp(`${n[f].c}.*${all}`).test(n[f].txt), f + " " + JSON.stringify(n[f]));
      }
      assert(n.now.c + n.pilot.c + n.soon.c === all, JSON.stringify(n));
      assert(n.soon.empty > 0, "sectors without a coming-soon card say so");
      await page.reload();
      assert(await page.evaluate(() => __LQSOL.filter) === "soon", "filter remembered");
      await page.evaluate(() => document.querySelector('.sl-filter [data-f="all"]').click());
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
