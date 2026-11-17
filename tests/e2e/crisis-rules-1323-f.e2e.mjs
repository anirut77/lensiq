// tests/e2e/crisis-rules-1323-f.e2e.mjs — FIXED TEST SET "crisis-rules-1323" part F.
// RE-LOCK 2026-11-17 (owner decision 2026-11-17 crisis v3; ledger docs/CRISIS-V3-RELOCKS.md): F1 (the card with the shipped switch) is
// replaced by rule a / d; its checks run in crisis-v3-{a,b,c,d}, which open every page with the SHIPPED switch (no override):
// results / sales hidden, closing line order and place, one number, link, no list, no price, 1323 >= 44 px.
// Kept: F2: with lensiq-helpline.js blocked the crisis reading still ends with the closing line, tel:1323 only, button >= 44 x 44 px
// (tarot, dream, horoscope; TH / EN / ZH; 393 px).
import { LANGS, PHRASE, S, assert, phone, sleep } from "./crisis-rules-kit.mjs";
import { PAGES } from "./crisis-v3-kit.mjs";

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("F2 (v3): lensiq-helpline.js blocked: the crisis reading ends with the closing line, tel:1323 only, button >= 44 x 44 px (tarot, dream, horoscope; TH / EN / ZH)", async () => {
      const bad = [];
      for (const lang of LANGS) for (const p of ["tarot", "dream", "horoscope"]) {
        const page = await browser.newPage(null, { isolated: true, initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
        try {
          await page.send("Network.setBlockedURLs", { urls: ["*lensiq-helpline.js*"] });
          await phone(page, 393);
          await page.goto(`${base}/${p}.html?nosw&lang=${lang}`);
          await page.waitFor(`document.readyState === "complete"`, 10000); await sleep(400);
          await PAGES[p].read(page, PHRASE[lang]); await sleep(700);
          const r = await page.evaluate(`(() => { const c = document.querySelector(".lq-helpline-result"); if (!c || !c.getClientRects().length) return null;
            return [...c.querySelectorAll('a[href^="tel:"]')].filter(a => a.getClientRects().length).map(a => { const b = a.getBoundingClientRect(); return { h: a.getAttribute("href"), w: Math.round(b.width), ht: Math.round(b.height) }; }); })()`);
          if (!r) { bad.push(`${p} ${lang}: no closing line`); continue; }
          if (r.length !== 1 || r[0].h !== "tel:1323") bad.push(`${p} ${lang}: tel links ${S(r)}`);
          else if (r[0].w < 44 || r[0].ht < 44) bad.push(`${p} ${lang}: button ${r[0].w}x${r[0].ht}`);
        } catch (e) { bad.push(`${p} ${lang}: ${String(e.message || e).slice(0, 140)}`); } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n      "));
    });
  } finally {
    await browser.close();
  }
}
