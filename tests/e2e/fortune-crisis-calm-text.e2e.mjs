// tests/e2e/fortune-crisis-calm-text.e2e.mjs — FIXED TEST (independent review 2026-11-14 of a0ec6f0, rules d and e). Locked BEFORE
// the fix (sha256 in ~/LENSIQ-field/evals/fortune-honest/locked.sha256 and evals-locks/fortune-honest.sha256).
//  d. In a calm tab no visible text on the page names the straight option ("ดูตรง ๆ" / "Read it straight" / "直说"): the fixed
//     "principle" paragraph of each fortune page is hidden too (first page with the card, and later pages).
//  e. In a calm tab no visible link or text points to anything paid: pricing / plans, refunds, upgrades (pricing.html,
//     terms.html#t9, "แพ็กเกจและราคา" / "Plans and pricing" / "套餐与价格", "การคืนเงิน" / "refund" / "退款").
// Every fortune page of spec §6, TH / EN / ZH, 360 px; plus tarot with the card on screen (first page, before continue).
import { assert } from "./cdp.mjs";
import { ADULT, CALM, CRISIS, FLAG_ON, LANGS, PAGES, S, ask, open } from "./crisis-flow-lib.mjs";

const SCAN = `(() => {
  const vis = e => { if (!e || e.closest("[hidden]")) return false; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const STRAIGHT = /ดูตรง ?ๆ|read it straight|直说|直說/i;
  const PAID = /แพ็กเกจและราคา|การคืนเงิน|plans and pricing|\\brefund|\\bupgrade|套餐与价格|套餐與價格|退款|升级/i;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; const straight = [], paid = [];
  while ((n = w.nextNode())) {
    const el = n.parentElement; const t = n.textContent.trim(); if (!el || !t || !vis(el)) continue;
    if (STRAIGHT.test(t)) straight.push(t.slice(0, 80));
    if (PAID.test(t)) paid.push(t.slice(0, 80));
  }
  const links = [...document.querySelectorAll("a[href]")].filter(vis).map(a => a.getAttribute("href"))
    .filter(h => /pricing\\.html|terms\\.html#t9|upgrade|checkout|buy/i.test(h));
  return { straight, paid, links };
})()`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const lang of LANGS) {
      await check(`d/e ${lang}: calm tab on every fortune page — no straight-option text, no pricing / refund / upgrade link or text`, async () => {
        const bad = [];
        for (const name of PAGES) {
          const pg = await open(browser, base, name, lang, { init: [FLAG_ON, ADULT, CALM], fakeCams });
          try {
            await ask(pg, name, "");
            const r = await pg.evaluate(SCAN);
            if (r.straight.length) bad.push(name + ": straight text " + S(r.straight.slice(0, 2)));
            if (r.paid.length) bad.push(name + ": paid text " + S(r.paid.slice(0, 2)));
            if (r.links.length) bad.push(name + ": paid links " + S(r.links));
          } catch (e) { bad.push(name + ": crashed " + String(e && e.message || e).slice(0, 160)); } finally { await pg.close(); }
        }
        assert(!bad.length, bad.length + " problem(s):\n       " + bad.join("\n       "));
      });
    }
    await check("d/e first page: tarot with the acknowledgement card on screen (TH/EN/ZH) — no straight text, no paid link", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const pg = await open(browser, base, "tarot", lang, { init: [FLAG_ON, ADULT] });
        try {
          await ask(pg, "tarot", CRISIS[lang]);
          const r = await pg.evaluate(SCAN);
          if (r.straight.length || r.paid.length || r.links.length) bad.push(lang + " " + S(r));
        } finally { await pg.close(); }
      }
      assert(!bad.length, bad.join("\n       "));
    });
  } finally {
    await browser.close();
  }
}
