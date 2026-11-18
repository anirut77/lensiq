// tests/e2e/crisis-price-scan-menu.e2e.mjs — FIXED TEST SET "crisis-v3-protect", RE-LOCK 2 2026-11-18 (adds assertions only;
// coordinator order: CLAUDE.md rule b, "no prices, purchase buttons, plans or seller links while the crisis flag is set").
// dream.html, TH / EN / ZH, 375 px: after a reading and a crisis phrase, open the site menu (about group) and an account menu drawn
// as lensiq-member.js draws it:
//   M1 in the crisis state: 0 visible pricing links, 0 visible marked entries, 0 sales words in the open site menu; the account link
//      itself stays reachable (only its payment description is hidden);
//   M2 after the flag clears (data-lq-crisis and data-lq-calm removed): the pricing entries are back (site menu + account menu), the
//      marked entries are visible again, and the scanner sees the sales words again (positive control).
import { MENU_STATE, FAKE_ACCOUNT_MENU, openAboutMenu, toCrisis } from "./crisis-price-scan-kit.mjs";
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`menu [${lang}]: pricing / payment menu entries hidden in the crisis state, back after it clears`, async () => {
        const p = await toCrisis(browser, base, fakeCams, "dream", lang);
        try {
          await p.evaluate(FAKE_ACCOUNT_MENU);
          await openAboutMenu(p);
          const c = await p.evaluate(MENU_STATE);
          assert(c.aboutOpen, `[${lang}] the about group did not open: ` + S(c));
          assert(c.markedAll >= 3, `[${lang}] marked entries exist (site pricing, account description, account-menu pricing): ` + S(c));
          assert(c.pricing === 0 && c.marked === 0 && c.hits.length === 0, `M1 [${lang}] crisis state: no pricing entry visible: ` + S(c));
          assert(c.account >= 1, `M1 [${lang}] the account link stays reachable: ` + S(c));
          await p.evaluate(`(() => { document.documentElement.removeAttribute("data-lq-crisis"); document.documentElement.removeAttribute("data-lq-calm"); return true; })()`);
          await p.evaluate(`new Promise(r => setTimeout(r, 400))`);
          const back = await p.evaluate(MENU_STATE);
          // RE-LOCK 3 2026-11-18 (test fault, CI run 44189943345: EN / ZH showed pricing 2 / marked 3 back, but `hits` only reads
          // #siteMenu text, where EN / ZH have one sales word (the pricing title) and TH two (title + payment description)); the
          // restore itself is asserted by pricing >= 2 and marked >= 3, unchanged
          assert(back.pricing >= 2 && back.marked >= 3 && back.hits.length >= 1, `M2 [${lang}] after the flag clears the entries are back: ` + S(back));
          console.log(`    menu [${lang}]: crisis pricing ${c.pricing} / marked ${c.marked} / hits ${c.hits.length}; cleared pricing ${back.pricing} / marked ${back.marked} / hits ${back.hits.length}`);
        } finally { await p.close(); }
      });
    }
  } finally {
    await browser.close();
  }
}
