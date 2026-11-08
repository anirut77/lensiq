// tests/e2e/i18n-camera.e2e.mjs — 中文 on the camera pages (lensiq-i18n-rt.js + i18n/zh-rt-*.js): text written at run
// time by the page scripts (status lines, tiles, tables) is Chinese, keeps updating live after a TH -> 中文 -> TH -> 中文
// switch, and switching back to ไทย restores the Thai text exactly; every camera page + converter loads ?lang=zh with
// < 5% Thai letters (visible text + text attributes, LQI18N.coverage()).
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const letters = `(() => { const t = (document.querySelector("main") || document.body).innerText;
  return { th: (t.match(/[\\u0E01-\\u0E3A\\u0E40-\\u0E4E]/g) || []).length, zh: (t.match(/[\\u4E00-\\u9FFF]/g) || []).length, text: t }; })()`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("store.html: live text follows TH -> 中文 -> TH -> 中文 while analysing (fake camera)", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}; localStorage.setItem('lq-lang','th')"] });
      await page.goto(`${base}/store.html?cpu&fakedet&nosw`);
      await page.waitFor("window.LQI18N && window.LQI18N_RTX && document.getElementById('startCam')", 8000);
      await page.evaluate(() => document.getElementById("startCam").click());
      await page.waitFor(`document.querySelector("#camGrid .st-hz") && parseFloat(document.querySelector("#camGrid .st-hz").textContent) > 0`, 10000);
      const th0 = await page.evaluate(letters);
      assert(th0.zh <= 4 && th0.th > 500, "Thai page " + JSON.stringify({ th: th0.th, zh: th0.zh }));
      for (let round = 0; round < 2; round++) {
        await page.evaluate(() => LQI18N.setLang("zh"));
        await sleep(600);
        const z = await page.evaluate(letters);
        assert(z.th <= 0.03 * (z.th + z.zh), `round ${round} zh: ${z.th} Thai letters left: ${(z.text.match(/[^\n]*[ก-๎][^\n]*/g) || []).slice(0, 4).join(" | ")}`);
        const tile = () => page.evaluate(() => document.querySelector("#camGrid .st-tile").innerText);
        const a = await tile(); await sleep(1500); const b = await tile();
        assert(/运行中/.test(b) && !/[ก-๎]/.test(b), "live tile in Chinese: " + b);
        assert(a !== b || /Hz/.test(b), "tile still updating");
        await page.evaluate(() => LQI18N.setLang("th"));
        await sleep(600);
        const t = await page.evaluate(letters);
        assert(t.zh <= 4 && Math.abs(t.th - th0.th) <= 0.05 * th0.th, `round ${round} back to Thai: th ${t.th} (was ${th0.th}) zh ${t.zh}`);
        assert(/ทำงาน/.test(await tile()), "live tile back in Thai");
      }
      await page.evaluate(() => document.getElementById("stop").click());
      const errs = page.consoleErrors.filter(e => e.kind === "exception");
      assert(!errs.length, "exceptions: " + JSON.stringify(errs.slice(0, 2)));
      await page.close();
    });

    await check("camera pages + converter in 中文 (?lang=zh): < 5% Thai letters, incl. run-time status", async () => {
      const rows = [];
      for (const pg of ["store", "booth", "signage", "attendance", "customers", "checkout", "qc", "driver", "neuro", "cameras", "converter",
        "exam-lab", "exam-hall", "exam-dashboard", "parking", "village", "queue", "tables", "afterhours", "bays",
        "crowd", "case-review", "medicine", "omr", "luckycolor", "planner"]) {
        const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}"] });
        await page.goto(`${base}/${pg}.html?cpu&fakedet&nosw&lang=zh`);
        await page.waitFor("window.LQI18N && LQI18N.lang === 'zh' && typeof LQI18N.coverage === 'function'", 8000);
        await sleep(900);
        const c = await page.evaluate(() => LQI18N.coverage(document.body, { top: 3 }));
        rows.push(`${pg} ${c.pct}%`);
        assert(c.pct < 5, `${pg}: ${c.pct}% Thai — ${c.top.map(x => x.text).join(" | ")}`);
        await page.close();
      }
      console.log("       " + rows.join(", "));
    });
  } finally { await browser.close(); }
}
