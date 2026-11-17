// tests/e2e/crisis-v3-a.e2e.mjs — FIXED TEST SET "crisis-v3" (owner decision 2026-11-17), part A: the crisis phrase typed into the
// page's own free-text field, then the reading is asked for as usual, on every fortune page that has such a field (dream, tarot,
// iching, horoscope, numbers, report, faceread, palm; compat and petread once merged) x 360 / 393 / 430 px. One file per page
// language (A_LANG below; crisis-v3-b = EN, crisis-v3-c = ZH) so each stays inside the runner's time limit.
// Per case: rules a-e of crisis-v3-kit.mjs (reading continues, no card, nothing says "flagged", gentle, no straight, no sales /
// share / print, the closing line + one tel:1323 button + counselling link exactly once and only after the last section, nothing
// in the middle, one number), no echo of the typed text, and no analytics request (consent given, test API base set).
import { PAGES, PHRASE, WIDTHS, S, assert, after, baseline, echo, events, exists, judge, open, FACTS } from "./crisis-v3-kit.mjs";

export const A_LANG = "th";
export async function partA({ base, launch, check, fakeCams }, lang) {
  const browser = await launch();
  try {
    for (const p of Object.keys(PAGES).filter(k => PAGES[k].field)) {
      const cfg = PAGES[p];
      if (cfg.optional && !(await exists(base, p))) { await check(`${p}: not on this branch yet (runs once merged)`, async () => {}); continue; }
      await check(`${p} [${lang}]: crisis phrase in ${cfg.field} -> the reading continues gently; closing line + 1323 at the end only; no card, no sales, no echo, no analytics`, async () => {
        const bad = [];
        for (const width of WIDTHS) {
          const where = `${p} ${lang} ${width}px`;
          const page = await open(browser, base, p, { lang, width, fakeCams });
          try {
            const before = await baseline(page);
            await cfg.read(page, PHRASE[lang]);
            await new Promise(r => setTimeout(r, 900));
            const f = await page.evaluate(FACTS(lang, cfg.root));
            bad.push(...judge(f, where));
            const e = echo(before, await after(page), PHRASE[lang]);
            if (e.length) bad.push(`${where}: echo ${S(e)}`);
            const ev = await events(page);
            if (ev.length) bad.push(`${where}: e: analytics sent ${S(ev)}`);
          } catch (err) { bad.push(`${where}: ${String(err.message || err).slice(0, 160)}`); } finally { await page.close(); }
        }
        assert(!bad.length, bad.length + " problem(s):\n      " + bad.join("\n      "));
      });
    }
  } finally { await browser.close(); }
}
export default ctx => partA(ctx, A_LANG);
