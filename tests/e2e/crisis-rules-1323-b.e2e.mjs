// tests/e2e/crisis-rules-1323-b.e2e.mjs — FIXED TEST SET "crisis-rules-1323" part B: the CRISIS state (owner decision 2026-11-16
// crisis one-number rules; see crisis-rules-kit.mjs). Every fortune page with the reading engine (15) x TH / EN / ZH x
// 360 / 393 / 430 px; the crisis phrase goes into the page's first free-text field and the crisis net shows the card
// (window.LQCrisisFirst, the takeover the hotfix made: the card replaces every result area). Then:
//   C1 every result element is hidden (hotfix GENERIC widgets + every result root's leftovers);
//   C2 the card's order: warm message, "อ่านเพิ่มเติม" (closed), comforting guidance, the 1323 button, the counselling link
//      (document order and top-to-bottom); title + warm message at most 3 lines at 393 and 430 px;
//   C3 the only number is 1323: the card's only tel: link is tel:1323 and no other 3+ digit number in it; 1669 / 191 / 1300 /
//      Samaritans appear 0 times on the whole page;
//   C4 the counselling link is there, at least 44 px tall, and points to counselling.html, which loads (HTTP 200);
//   C5 no instruction list (no visible ul / ol in the card); no price in the card;
//   C6 no sticky or fixed element holds the card or any help element;
//   C7 the 1323 button is tel:1323, at least 44 x 44 px (one tap).
// C8 (TH / EN / ZH, 393 px, dream + numbers + faceread): "อ่านเพิ่มเติม" opens the longer text; still only 1323, still no list.
// C9 (TH / EN / ZH, 393 px, tarot): a tap on the counselling link opens counselling.html with its call buttons.
// Kept from the earlier locked sets (not weakened): the card replaces the reading (C1), no remedies or price in crisis (C5),
// 1323 tel >= 44 px (C7); no echo is checked by crisis-net-hotfix-{a,b,c,d}.
import { LANGS, LEAKS, MORE, PHRASE, PINNED, READING, S, STICKY, TRIGGER, WIDTHS, CARD, assert, load, noOtherNumbers, phone, sleep } from "./crisis-rules-kit.mjs";

async function crisis(page, base, p, lang) {
  await load(page, base, p, lang);
  const t = await page.evaluate(TRIGGER(PHRASE[lang]));
  if (t !== "ok") throw new Error("crisis net did not show the card: " + t);
  await page.waitFor(`!!document.querySelector(".fa-support")`, 8000);
  await sleep(700);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("C1-C7: crisis state, 15 reading pages x TH / EN / ZH x 360 / 393 / 430: results hidden, warm -> more -> guidance -> 1323 -> link, only 1323, no list, nothing pinned", async () => {
      const bad = [];
      let cases = 0, clean = 0;
      const linkOk = new Map();
      for (const lang of LANGS) {
        for (const w of WIDTHS) {
          for (const p of READING) {
            const where = `${p} ${lang} ${w}px`, before = bad.length;
            cases++;
            const page = await browser.newPage(null, { isolated: true, initScripts: [STICKY(false)] });
            try {
              await phone(page, w);
              try { await crisis(page, base, p, lang); } catch (e) { bad.push(`${where}: ${e.message.slice(0, 120)}`); continue; }
              const leaks = await page.evaluate(LEAKS);
              if (leaks.length) bad.push(`${where}: C1 result content visible ${S(leaks)}`);
              const c = await page.evaluate(CARD);
              if (!c.card) { bad.push(`${where}: no visible card`); continue; }
              const miss = ["h3", "warm", "more", "guide", "tel", "link"].filter(k => !c[k]);
              if (miss.length) bad.push(`${where}: C2 card parts missing ${S(miss)}`);
              if (c.moreOpen) bad.push(`${where}: C2 "อ่านเพิ่มเติม" open at first`);
              if (c.more && !MORE[lang].test(c.sum)) bad.push(`${where}: C2 summary text ${S(c.sum)}`);
              if (!c.docOrder || !c.yOrder) bad.push(`${where}: C2 order warm -> more -> guidance -> 1323 -> link broken (doc ${c.docOrder}, y ${c.yOrder})`);
              if (w >= 393 && c.headLines > 3) bad.push(`${where}: C2 title + warm message ${c.headLines} lines (max 3)`);
              if (S(c.tels) !== S(["tel:1323"])) bad.push(`${where}: C3 card tel links ${S(c.tels)}`);
              if (c.nums.some(n => n !== "1323")) bad.push(`${where}: C3 card numbers ${S(c.nums)}`);
              bad.push(...(await noOtherNumbers(page, where)).map(s => s + " (C3)"));
              if (c.link) {
                if (!/\/counselling\.html(?:\?|$)/.test(c.linkHref)) bad.push(`${where}: C4 link href ${c.linkHref}`);
                if (c.linkH < 44) bad.push(`${where}: C4 link ${c.linkH} px tall`);
                if (!linkOk.has(c.linkHref)) linkOk.set(c.linkHref, await page.evaluate(`fetch(${S(c.linkHref)}).then(r => r.status, () => 0)`));
                if (linkOk.get(c.linkHref) !== 200) bad.push(`${where}: C4 ${c.linkHref} answers ${linkOk.get(c.linkHref)}`);
              }
              if (c.lists) bad.push(`${where}: C5 ${c.lists} list(s) in the card`);
              if (c.price) bad.push(`${where}: C5 price wording in the card`);
              const pins = await page.evaluate(PINNED(false));
              if (pins.length || c.pinned) bad.push(`${where}: C6 pinned ${S(pins)} ${c.pinned}`);
              if (c.tel && (c.telW < 44 || c.telH < 44)) bad.push(`${where}: C7 1323 button ${c.telW}x${c.telH}`);
            } finally { await page.close(); }
            if (bad.length === before) clean++;
          }
        }
      }
      console.log(`    crisis state: ${clean}/${cases} page loads clean`);
      assert(!bad.length, bad.length + " problem(s):\n      " + bad.slice(0, 80).join("\n      "));
    });

    await check("C8: 'อ่านเพิ่มเติม' opens the longer text (TH / EN / ZH, 393 px): still only 1323, no list", async () => {
      const bad = [];
      for (const lang of LANGS) for (const p of ["dream", "numbers", "faceread"]) {
        const page = await browser.newPage(null, { isolated: true, initScripts: [STICKY(false)] });
        try {
          await phone(page, 393);
          await crisis(page, base, p, lang);
          await page.evaluate(`(() => { const s = document.querySelector(".fa-support details.fa-support-more > summary"); if (s) s.click(); })()`);
          await sleep(300);
          const c = await page.evaluate(CARD);
          if (!c.moreOpen || c.moreText < 40) bad.push(`${p} ${lang}: the longer text did not open ${S({ open: c.moreOpen, len: c.moreText })}`);
          if (S(c.tels) !== S(["tel:1323"]) || c.nums.some(n => n !== "1323")) bad.push(`${p} ${lang}: numbers with the longer text open ${S(c.tels)} ${S(c.nums)}`);
          if (c.lists) bad.push(`${p} ${lang}: list in the longer text`);
          bad.push(...await noOtherNumbers(page, `${p} ${lang} open`));
        } catch (e) { bad.push(`${p} ${lang}: ${e.message.slice(0, 120)}`); } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n      "));
    });

    await check("C9: a tap on the counselling link opens counselling.html with its call buttons (tarot, TH / EN / ZH, 393 px)", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await browser.newPage(null, { isolated: true, initScripts: [STICKY(false)] });
        try {
          await phone(page, 393);
          await crisis(page, base, "tarot", lang);
          const href = await page.evaluate(`(() => { const a = document.querySelector('.fa-support a[href*="counselling.html"]'); return a ? a.href : ""; })()`);
          if (!href) { bad.push(`${lang}: no link`); continue; }
          await page.evaluate(`document.querySelector('.fa-support a[href*="counselling.html"]').click()`);
          await page.waitFor(`location.pathname.endsWith("/counselling.html") && document.readyState === "complete"`, 10000);
          await sleep(500);
          const tels = await page.evaluate(`[...document.querySelectorAll('main a[href^="tel:"]')].filter(a => a.getClientRects().length).map(a => a.getAttribute("href"))`);
          for (const t of ["tel:1323", "tel:1669", "tel:191", "tel:1300", "tel:021136789"]) if (!tels.includes(t)) bad.push(`${lang}: counselling page has no ${t} ${S(tels)}`);
        } catch (e) { bad.push(`${lang}: ${e.message.slice(0, 120)}`); } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n      "));
    });
  } finally {
    await browser.close();
  }
}
