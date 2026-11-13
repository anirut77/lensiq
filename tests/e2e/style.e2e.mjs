// tests/e2e/style.e2e.mjs — FIXED TEST SET (Personal Colour MVP; locked with tests/unit/style-colour.test.js before
// style.html / style.js / lensiq-colour.js were written).
//   * style.html opens in TH / EN / ZH with the start notice ("colour, not looks", on-device, nothing stored)
//   * the drawn sample (no photo of a person: #stSample) goes through the card step and the cheek step by tapping the canvas
//     (#stCanvas) at window.__stSample.card / .skin (relative 0..1 coordinates), then shows the result: an undertone band
//     on a bar (#stBand), the two closest seasons (#stSeasons li x2), >= 12 palette swatches (#stPalette li) and the
//     disclaimer (#stDisclaimer), all in the page language
//   * tapping a coloured (non-grey) area as the card shows the refusal message (#stCardMsg[data-why]) instead of a result
//   * nothing is stored: no new localStorage / sessionStorage key holds Lab values, hex palettes or image data
//   * the page is reachable: luckycolor.html links to style.html
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const lang = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const NOTICE = { th: /สี.*ไม่ใช่หน้าตา/, en: /colour, not (?:your )?looks/i, zh: /颜色.*不是.*外貌|分析的是颜色/ };
const tap = (rel) => `(() => { const c = document.getElementById("stCanvas"), r = c.getBoundingClientRect();
  const x = r.left + r.width * ${rel}[0], y = r.top + r.height * ${rel}[1];
  c.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y })); })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const l of ["th", "en", "zh"]) {
      await check(`${l}: notice, sample through card + cheek steps to a palette result; nothing stored`, async () => {
        const page = await browser.newPage(null, { initScripts: [lang(l)] });
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
          await page.goto(`${base}/style.html`);
          await page.waitFor(`document.documentElement.lang === ${JSON.stringify(HTML_LANG[l])}`, 8000);
          await sleep(500);
          const before = await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)));
          const notice = await page.evaluate(() => document.getElementById("stNotice").textContent);
          assert(NOTICE[l].test(notice), l + " notice: " + notice.slice(0, 160));
          await page.evaluate(() => document.getElementById("stSample").click());
          await page.waitFor(() => !!window.__stSample, 5000);
          const S = await page.evaluate(() => window.__stSample);
          await page.evaluate(tap(JSON.stringify(S.card)));
          await sleep(300);
          await page.evaluate(tap(JSON.stringify(S.skin)));
          await page.waitFor(() => { const r = document.getElementById("stResult"); return r && !r.hidden; }, 8000);
          const R = await page.evaluate(() => ({ band: (document.getElementById("stBand") || {}).textContent || "", seasons: document.querySelectorAll("#stSeasons li").length,
            swatches: document.querySelectorAll("#stPalette li").length, disc: (document.getElementById("stDisclaimer") || {}).textContent || "",
            text: document.getElementById("stResult").textContent }));
          assert(R.band.trim() && R.seasons === 2 && R.swatches >= 12 && R.disc.trim(), JSON.stringify(R).slice(0, 300));
          if (l !== "th") assert(!/[฀-๿]/.test(R.text), l + ": Thai in the result: " + R.text.slice(0, 200));
          const after = await page.evaluate(() => {
            const all = [localStorage, sessionStorage].flatMap(st => Object.keys(st).map(k => [k, st.getItem(k) || ""]));
            return all;
          });
          for (const [k, v] of after) if (!before.includes(k)) assert(!/#[0-9a-f]{6}|data:image|"?L"?\s*:\s*\d|lab/i.test(v), "stored " + k + " = " + v.slice(0, 80));
        } finally { await page.close(); }
      });
    }

    await check("a coloured area tapped as the card is refused with a reason", async () => {
      const page = await browser.newPage(null, { initScripts: [lang("en")] });
      try {
        await page.goto(`${base}/style.html`);
        await sleep(500);
        await page.evaluate(() => document.getElementById("stSample").click());
        await page.waitFor(() => !!window.__stSample, 5000);
        const S = await page.evaluate(() => window.__stSample);
        await page.evaluate(tap(JSON.stringify(S.colour)));
        await page.waitFor(() => { const m = document.getElementById("stCardMsg"); return m && m.getAttribute("data-why"); }, 5000);
        const why = await page.evaluate(() => document.getElementById("stCardMsg").getAttribute("data-why"));
        assert(why && why !== "ok", "refused: " + why);
        assert(await page.evaluate(() => document.getElementById("stResult").hidden), "no result");
      } finally { await page.close(); }
    });

    await check("luckycolor.html links to style.html", async () => {
      const page = await browser.newPage(null);
      try {
        await page.goto(`${base}/luckycolor.html`);
        assert(await page.evaluate(() => !!document.querySelector('a[href^="style.html"]')), "link present");
      } finally { await page.close(); }
    });
  } finally {
    await browser.close();
  }
}
