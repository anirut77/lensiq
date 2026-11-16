// tests/e2e/crisis-rules-1323-a.e2e.mjs — FIXED TEST SET "crisis-rules-1323" part A: the NORMAL state (owner decision 2026-11-16
// crisis one-number rules; see crisis-rules-kit.mjs). Every fortune page (19) x TH / EN / ZH x 360 / 393 / 430 px, at load:
//   N1 1669 / 191 / 1300 / Samaritans appear 0 times (visible text and tel: links);
//   N2 1323 is reachable in at most 2 taps (a visible tel:1323 link >= 44 px, or a top control that opens a dialog with it);
//   N3 no help element sits between content sections (none inside <main>);
//   N4 no fixed or sticky help element (switch LENSIQ_HELP_STICKY false = shipped);
// Rule-6 switch (TH, 393 px, fortune / tarot / dream / cat-fortune):
//   N5 switch false: after scrolling 1600 px the 1323 control has scrolled away and nothing pinned follows the reader;
//   N6 switch true: after scrolling 1600 px the 1323 control is still in view, held by the sticky top bar, and it is the only
//      pinned help element (one line in lensiq-config.js chooses between N5 and N6).
import { FORTUNE, LANGS, STICKY, WIDTHS, IN_CONTENT, PINNED, S, VIS, assert, load, noOtherNumbers, phone, taps1323 } from "./crisis-rules-kit.mjs";

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("N1-N4: normal state, 19 fortune pages x TH / EN / ZH x 360 / 393 / 430: only 1323, in <= 2 taps, nothing between sections, nothing pinned", async () => {
      const bad = [];
      let cases = 0;
      for (const lang of LANGS) {
        const page = await browser.newPage(null, { isolated: true, initScripts: [STICKY(false)] });
        try {
          for (const w of WIDTHS) {
            await phone(page, w);
            for (const p of FORTUNE) {
              const where = `${p} ${lang} ${w}px`;
              cases++;
              try { await load(page, base, p, lang); } catch (e) { bad.push(`${where}: did not load (${e.message.slice(0, 80)})`); continue; }
              bad.push(...await noOtherNumbers(page, where));
              const t = await taps1323(page);
              if (t > 2) bad.push(`${where}: 1323 not reachable in 2 taps`);
              const inContent = await page.evaluate(IN_CONTENT);
              if (inContent.length) bad.push(`${where}: help element between content sections ${S(inContent)}`);
              const pinned = await page.evaluate(PINNED(false));
              if (pinned.length) bad.push(`${where}: pinned help element ${S(pinned)}`);
            }
          }
        } finally { await page.close(); }
      }
      console.log(`    normal state: ${cases - new Set(bad.map(b => b.split(":")[0])).size}/${cases} page loads clean`);
      assert(!bad.length, bad.length + " problem(s):\n      " + bad.slice(0, 80).join("\n      "));
    });

    for (const on of [false, true]) {
      await check(`N${on ? 6 : 5}: switch LENSIQ_HELP_STICKY=${on}: after scrolling, the 1323 control ${on ? "stays in the sticky top bar (only pinned help element)" : "has scrolled away; nothing pinned"}`, async () => {
        const bad = [];
        const page = await browser.newPage(null, { isolated: true, initScripts: [STICKY(on)] });
        try {
          await phone(page, 393);
          for (const p of ["fortune", "tarot", "dream", "cat-fortune"]) {
            await load(page, base, p, "th");
            const tall = await page.evaluate("document.documentElement.scrollHeight - innerHeight");
            await page.evaluate("window.scrollTo({ top: 1600, behavior: 'instant' })");
            await new Promise(r => setTimeout(r, 400));
            const r = await page.evaluate(`(() => { ${VIS}
              const c = [...document.querySelectorAll('#siteNav a[href="tel:1323"], #siteNav [aria-haspopup="dialog"], #lqHelpTop a[href="tel:1323"]')].find(vis);
              if (!c) return { found: false };
              const b = c.getBoundingClientRect();
              return { found: true, inView: b.top >= 0 && b.bottom <= innerHeight, held: !!pinned(c), y: scrollY }; })()`);
            const pins = await page.evaluate(PINNED(on));
            if (!r.found) { bad.push(`${p}: no top 1323 control ${S(r)}`); continue; }
            if (pins.length) bad.push(`${p}: pinned help element(s) ${S(pins)}`);
            if (on && !(r.inView && r.held)) bad.push(`${p}: switch on, but the 1323 control is not held in view by the bar ${S(r)}`);
            if (!on && tall > 1700 && (r.inView || r.held)) bad.push(`${p}: switch off, but the 1323 control follows the reader ${S(r)}`);
          }
        } finally { await page.close(); }
        assert(!bad.length, bad.join("\n      "));
      });
    }
  } finally {
    await browser.close();
  }
}
