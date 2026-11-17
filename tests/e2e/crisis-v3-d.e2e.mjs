// tests/e2e/crisis-v3-d.e2e.mjs — FIXED TEST SET "crisis-v3" (owner decision 2026-11-17), part D: the rest of the crisis SESSION.
// After the crisis flag was set on one page, every later fortune page in the same tab follows the same rules (the tab's session
// flag "lq-fortune-calm" is set before load). Every fortune page with a reading (17 incl. compat / petread once merged) x
// TH / EN / ZH at 393 px: rules a-e of crisis-v3-kit.mjs and no analytics request. The pages without a reading (fortune, planner,
// luckycolor, cat-fortune): no card, nothing flagged, no sales, one number, no help element inside the content, no analytics.
// Control (the check bites): an ordinary tarot reading OUTSIDE the session with consent does send analytics, carries no closing
// line, and its share / print controls are there.
import { LANGS, NO_READING, PAGES, S, assert, events, exists, judge, open, FACTS, INIT, sleep } from "./crisis-v3-kit.mjs";

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("control: outside the crisis session a tarot reading sends analytics and has no closing line", async () => {
      const page = await open(browser, base, "tarot", { lang: "th", width: 393, fakeCams });
      try {
        await PAGES.tarot.read(page, null); await sleep(600);
        const f = await page.evaluate(FACTS("th", "#trResult"));
        const ev = await events(page);
        assert(ev.length > 0, "analytics sent outside the session " + S(ev));
        assert(f.lines === 0, "no closing line outside the session " + S(f.closeText));
      } finally { await page.close(); }
    });
    for (const p of Object.keys(PAGES)) {
      const cfg = PAGES[p];
      if (cfg.optional && !(await exists(base, p))) { await check(`${p}: not on this branch yet (runs once merged)`, async () => {}); continue; }
      await check(`${p}: a later page of the crisis session (TH / EN / ZH, 393 px): gentle reading, closing line at the end only, no sales, no analytics`, async () => {
        const bad = [];
        for (const lang of LANGS) {
          const where = `${p} ${lang} session`;
          const page = await open(browser, base, p, { lang, width: 393, calm: true, fakeCams });
          try {
            await cfg.read(page, null); await sleep(900);
            bad.push(...judge(await page.evaluate(FACTS(lang, cfg.root)), where));
            const ev = await events(page);
            if (ev.length) bad.push(`${where}: e: analytics sent ${S(ev)}`);
          } catch (err) { bad.push(`${where}: ${String(err.message || err).slice(0, 160)}`); } finally { await page.close(); }
        }
        assert(!bad.length, bad.length + " problem(s):\n      " + bad.join("\n      "));
      });
    }
    await check("pages without a reading in the crisis session (TH / EN / ZH): no card, no sales, one number, nothing in the content, no analytics", async () => {
      const bad = [];
      for (const p of NO_READING) for (const lang of LANGS) {
        const where = `${p} ${lang} session`;
        const page = await open(browser, base, p, { lang, width: 393, calm: true, fakeCams });
        try {
          const f = await page.evaluate(FACTS(lang, "main"));
          bad.push(...judge(f, where, { reading: false }));
          if (f.outsideClose.length) bad.push(`${where}: help element inside the content ${S(f.outsideClose)}`);
          const ev = await events(page);
          if (ev.length) bad.push(`${where}: e: analytics sent ${S(ev)}`);
        } catch (err) { bad.push(`${where}: ${String(err.message || err).slice(0, 160)}`); } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n      " + bad.join("\n      "));
    });
  } finally { await browser.close(); }
}
export { INIT };
