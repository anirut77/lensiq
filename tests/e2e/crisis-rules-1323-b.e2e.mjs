// tests/e2e/crisis-rules-1323-b.e2e.mjs — FIXED TEST SET "crisis-rules-1323" part B.
// RE-LOCK 2026-11-17 (owner decision 2026-11-17 crisis v3; ledger docs/CRISIS-V3-RELOCKS.md): the card checks C1, C2, C5, C7, C8 are
// replaced by rule a (no card; the reading goes on) and rule d (closing line). Their protections stay asserted by crisis-v3-{a,b,c,d}
// (results / sales hidden -> c, order warm -> 1323 -> link at the end -> d, one number on the whole page, no list in the closing line
// -> unit crisis-rules-1323 R1, no price, nothing pinned around the closing line, 1323 >= 44 px). Kept here unchanged in intent:
//   C9 a tap on the counselling link (now under the closing line) opens counselling.html with its call buttons (tarot, TH / EN / ZH,
//      393 px), and C3 / C6 on that crisis reading: no other help number on the page and nothing sticky or fixed holds the line.
import { LANGS, PHRASE, PINNED, S, assert, noOtherNumbers, phone, sleep } from "./crisis-rules-kit.mjs";

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("C9 (v3): a crisis question on tarot -> the reading goes on; the counselling link under the closing line opens counselling.html with its call buttons", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await browser.newPage(null, { isolated: true, initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
        try {
          await phone(page, 393);
          await page.goto(`${base}/tarot.html?nosw&lang=${lang}`);
          await page.waitFor(`document.readyState === "complete"`, 10000); await sleep(400);
          await page.evaluate(`(() => { document.getElementById("trQuestion").value = ${S(PHRASE[lang])}; document.querySelector('input[value="three"]').click();
            document.getElementById("trStart").click(); return true; })()`);
          await page.waitFor(`!document.getElementById("trPick").hidden`, 10000); await sleep(400);
          await page.evaluate(`(() => { document.getElementById("trAuto").click(); return true; })()`); await sleep(900);
          await page.evaluate(`(() => { document.getElementById("trReveal").click(); return true; })()`);
          await page.waitFor(`!!document.querySelector('.lq-helpline-result a[href$="counselling.html"]')`, 25000); await sleep(500);
          bad.push(...await noOtherNumbers(page, `tarot ${lang} crisis reading`));
          const pins = await page.evaluate(PINNED(true));
          if (pins.length) bad.push(`${lang}: pinned help element ${S(pins)}`);
          await page.evaluate(`document.querySelector('.lq-helpline-result a[href$="counselling.html"]').click()`);
          await page.waitFor(`location.pathname.endsWith("/counselling.html") && document.readyState === "complete"`, 10000); await sleep(500);
          const tels = await page.evaluate(`[...document.querySelectorAll('main a[href^="tel:"]')].filter(a => a.getClientRects().length).map(a => a.getAttribute("href"))`);
          for (const t of ["tel:1323", "tel:1669", "tel:191", "tel:1300", "tel:021136789"]) if (!tels.includes(t)) bad.push(`${lang}: counselling page has no ${t} ${S(tels)}`);
        } catch (e) { bad.push(`${lang}: ${String(e.message || e).slice(0, 140)}`); } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n      "));
    });
  } finally {
    await browser.close();
  }
}
