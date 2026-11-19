// tests/e2e/fortune-theme-golive-crisis.e2e.mjs — FIXED TEST SET "fortune-theme-golive" (owner decisions 92-94 of 2026-11-18), part
// crisis: locked BEFORE the build (branch fortune-theme, head 9ebbf57b). The crisis v3 rules of tests/e2e/crisis-v3-kit.mjs (reading
// continues gently, no card, nothing says "flagged", no straight mode, no sales / share / print, closing line + one tel:1323 button +
// counselling link at the end only, one number, no echo, no analytics) hold on the THEMED pages in BOTH theme modes: "a" (shipped,
// night band + paper) and "classic" (the switch back). Pages with a free-text field: tarot and dream; TH / EN / ZH; 393 px.
// Also checks the theme mode really applied on each run (html.lq-ft.lq-ft-read for "a", html.lq-ft-classic for "classic").
import { INIT, PAGES, PHRASE, HTML_LANG, S, assert, after, baseline, echo, events, judge, FACTS, sleep } from "./crisis-v3-kit.mjs";

const MODES = { a: [], classic: [`window.LENSIQ_FORTUNE_THEME = "classic";`] };

export default async function ({ base, launch, check }) {
  const browser = await launch();
  async function open(p, lang, extra) {
    const page = await browser.newPage(null, { isolated: true, initScripts: INIT(lang).concat(extra) });
    await page.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
    await page.goto(`${base}/${p}.html?nosw&lang=${lang}`);
    await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 12000);
    await sleep(450);
    return page;
  }
  try {
    for (const [mode, extra] of Object.entries(MODES)) for (const p of ["tarot", "dream"]) {
      const cfg = PAGES[p];
      await check(`theme ${mode}, ${p}: crisis v3 holds (TH / EN / ZH, 393 px)`, async () => {
        const bad = [];
        for (const lang of ["th", "en", "zh"]) {
          const where = `${mode} ${p} ${lang}`;
          const page = await open(p, lang, extra);
          try {
            const cls = await page.evaluate("document.documentElement.className");
            const ok = mode === "a" ? /\blq-ft\b/.test(cls) && /\blq-ft-read\b/.test(cls) && !/lq-ft-classic/.test(cls)
              : /\blq-ft-classic\b/.test(cls) && !/\blq-ft(-read|-menu)?(\s|$)/.test(cls);
            if (!ok) bad.push(`${where}: theme mode not applied, html class "${cls}"`);
            const before = await baseline(page);
            await cfg.read(page, PHRASE[lang]);
            await sleep(900);
            const f = await page.evaluate(FACTS(lang, cfg.root));
            bad.push(...judge(f, where));
            const e = echo(before, await after(page), PHRASE[lang]);
            if (e.length) bad.push(`${where}: echo ${S(e)}`);
            const ev = await events(page);
            if (ev.length) bad.push(`${where}: analytics sent ${S(ev)}`);
          } catch (err) { bad.push(`${where}: ${String(err.message || err).slice(0, 160)}`); } finally { await page.close(); }
        }
        assert(!bad.length, bad.length + " problem(s):\n      " + bad.join("\n      "));
      });
    }
  } finally { await browser.close(); }
}
