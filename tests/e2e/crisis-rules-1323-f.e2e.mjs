// tests/e2e/crisis-rules-1323-f.e2e.mjs — FIXED TEST SET "crisis-rules-1323" part F (independent review 2026-11-17): the crisis
// checks of part B again with the SHIPPED switch (no override), and the call button when the shared component fails to load.
//   F1 15 reading pages x TH / EN / ZH x 360 / 393 / 430 with the shipped switch: results hidden; card order warm -> more ->
//      guidance -> 1323 -> link; title + warm <= 3 lines at 393 / 430; only 1323; link >= 44 px to counselling.html; no list, no
//      price; no pinned help element except the icon inside the bar; the card's heading is not covered (topmost element at its
//      centre is in the card) after the screen settles.
//   F2 lensiq-helpline.js blocked (tarot, dream, horoscope; TH / EN / ZH; 393 px): the card still shows with tel:1323 only, and the
//      call button is at least 44 x 44 px.
import { LANGS, LEAKS, MORE, PHRASE, PINNED, READING, S, TRIGGER, WIDTHS, CARD, VIS, assert, load, noOtherNumbers, phone, sleep } from "./crisis-rules-kit.mjs";

async function crisis(page, base, p, lang) {
  await load(page, base, p, lang);
  const t = await page.evaluate(TRIGGER(PHRASE[lang]));
  if (t !== "ok") throw new Error("crisis net did not show the card: " + t);
  await page.waitFor(`!!document.querySelector(".fa-support")`, 8000);
  let last = -1, still = 0;
  for (let i = 0; i < 60 && still < 500; i++) { const y = await page.evaluate("Math.round(scrollY)"); still = y === last ? still + 100 : 0; last = y; await sleep(100); }
}
const HEAD = `(() => { ${VIS} const c = [...document.querySelectorAll(".fa-support")].find(vis); if (!c) return "no card";
  const h = c.querySelector("h3") || c, b = h.getBoundingClientRect(); const t = document.elementFromPoint(Math.min(innerWidth - 2, b.left + 20), b.top + b.height / 2);
  return t && c.contains(t) ? "" : "heading covered by " + (t ? name(t) : "nothing"); })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("F1: crisis state with the shipped switch, 15 reading pages x TH / EN / ZH x 360 / 393 / 430", async () => {
      const bad = [];
      let cases = 0;
      for (const lang of LANGS) for (const w of WIDTHS) for (const p of READING) {
        const where = `${p} ${lang} ${w}px`;
        cases++;
        const page = await browser.newPage(null, { isolated: true });
        try {
          await phone(page, w);
          try { await crisis(page, base, p, lang); } catch (e) { bad.push(`${where}: ${e.message.slice(0, 120)}`); continue; }
          const leaks = await page.evaluate(LEAKS);
          if (leaks.length) bad.push(`${where}: result content visible ${S(leaks)}`);
          const c = await page.evaluate(CARD);
          if (!c.card) { bad.push(`${where}: no visible card`); continue; }
          const miss = ["h3", "warm", "more", "guide", "tel", "link"].filter(k => !c[k]);
          if (miss.length) bad.push(`${where}: card parts missing ${S(miss)}`);
          if (c.moreOpen || (c.more && !MORE[lang].test(c.sum))) bad.push(`${where}: อ่านเพิ่มเติม ${S({ open: c.moreOpen, sum: c.sum })}`);
          if (!c.docOrder || !c.yOrder) bad.push(`${where}: order broken`);
          if (w >= 393 && c.headLines > 3) bad.push(`${where}: title + warm ${c.headLines} lines`);
          if (S(c.tels) !== S(["tel:1323"]) || c.nums.some(n => n !== "1323")) bad.push(`${where}: numbers ${S(c.tels)} ${S(c.nums)}`);
          bad.push(...await noOtherNumbers(page, where));
          if (c.link && (!/\/counselling\.html(?:\?|$)/.test(c.linkHref) || c.linkH < 44)) bad.push(`${where}: link ${c.linkHref} ${c.linkH}px`);
          if (c.lists || c.price) bad.push(`${where}: list ${c.lists} / price ${c.price}`);
          const pins = await page.evaluate(PINNED(true));
          if (pins.length || c.pinned) bad.push(`${where}: pinned ${S(pins)} ${c.pinned}`);
          if (c.tel && (c.telW < 44 || c.telH < 44)) bad.push(`${where}: 1323 button ${c.telW}x${c.telH}`);
          const head = await page.evaluate(HEAD);
          if (head) bad.push(`${where}: ${head}`);
        } finally { await page.close(); }
      }
      console.log(`    crisis state, shipped switch: ${cases} page loads checked`);
      assert(!bad.length, bad.length + " problem(s):\n      " + bad.slice(0, 80).join("\n      "));
    });

    await check("F2: lensiq-helpline.js blocked: the card still shows tel:1323 only, button >= 44 x 44 px (tarot, dream, horoscope; TH / EN / ZH)", async () => {
      const bad = [];
      for (const lang of LANGS) for (const p of ["tarot", "dream", "horoscope"]) {
        const page = await browser.newPage(null, { isolated: true });
        try {
          await page.send("Network.setBlockedURLs", { urls: ["*lensiq-helpline.js*"] });
          await phone(page, 393);
          await crisis(page, base, p, lang);
          const r = await page.evaluate(`(() => { ${VIS} const c = [...document.querySelectorAll(".fa-support")].find(vis); if (!c) return null;
            return [...c.querySelectorAll('a[href^="tel:"]')].filter(vis).map(a => { const b = a.getBoundingClientRect(); return { h: a.getAttribute("href"), w: Math.round(b.width), ht: Math.round(b.height) }; }); })()`);
          if (!r) { bad.push(`${p} ${lang}: no card`); continue; }
          if (r.length !== 1 || r[0].h !== "tel:1323") bad.push(`${p} ${lang}: tel links ${S(r)}`);
          else if (r[0].w < 44 || r[0].ht < 44) bad.push(`${p} ${lang}: fallback button ${r[0].w}x${r[0].ht}`);
        } catch (e) { bad.push(`${p} ${lang}: ${e.message.slice(0, 120)}`); } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n      "));
    });
  } finally {
    await browser.close();
  }
}
