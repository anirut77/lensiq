// tests/e2e/walkfix-webkit.e2e.mjs — buyer walkthrough 2026-11-14, W-036 (and W-037 on a real WebKit phone profile):
// attendance.html?mode=employee(&demo=1) in Thai on an iPhone 13 (WebKit) must not scroll sideways (the walk measured a 404 px
// document on a 390 px screen); exam-dashboard.html?demo=1 import controls stay inside the screen. FIXED TEST: written and
// locked (~/LENSIQ-field/evals/walk-fix/, sha256 in evals-locks/walk-fix.sha256) BEFORE the fixes on branch walk-fix.
// Synthetic data only; no camera is opened.
import { assert } from "./cdp.mjs";
import { openFlow, launchWebKit, sleep, waitFor } from "./phone-kit.mjs";

export default async function ({ base, check }) {
  const browser = await launchWebKit();
  try {
    for (const lang of ["th", "en", "zh"]) {
      for (const q of ["mode=employee&demo=1", "mode=employee"]) {
        await check(`W-036 [${lang}] attendance.html?${q} on iPhone 13: no sideways scroll`, async () => {
          const { ctx, page } = await openFlow(browser, `${base}/attendance.html?${q}&cpu&fakedet&nosw`, { lang });
          try {
            await waitFor(page, () => !!(window.LQHR && window.LQI18N), null, 20000);
            await sleep(1200);
            const r = await page.evaluate(() => {
              const w = document.documentElement.clientWidth, wide = [];
              for (const el of document.querySelectorAll("body *")) {
                const b = el.getBoundingClientRect();
                if (b.width && b.right > w + 0.5 && getComputedStyle(el).position !== "fixed") wide.push((el.id ? "#" + el.id : el.tagName.toLowerCase() + "." + el.className).slice(0, 60) + "→" + Math.round(b.right));
              }
              return { sw: document.documentElement.scrollWidth, w, iw: innerWidth, wide: wide.slice(0, 6) };
            });
            assert(r.sw <= r.w && r.sw <= r.iw, `document ${r.sw} px on a ${r.w} px screen: ${r.wide.join(" | ")}`);
          } finally { await ctx.close(); }
        });
      }
    }
    await check("W-037 exam-dashboard.html?demo=1 on iPhone 13: import controls inside the screen", async () => {
      const { ctx, page } = await openFlow(browser, `${base}/exam-dashboard.html?demo=1&nosw`, { lang: "th" });
      try {
        await waitFor(page, () => !!(window.__LQ_EXAM_DB && window.__LQ_EXAM_DB.board), null, 20000);
        const r = await page.evaluate(() => new Promise(res => {
          const d = document.querySelector("#importFile").closest("details"); d.open = true;
          setTimeout(() => {
            const els = [d.querySelector("summary"), ...d.querySelectorAll("label, input, p")];
            res({ right: Math.max(...els.map(e => e.getBoundingClientRect().right)), w: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth });
          }, 400);
        }));
        assert(r.right <= r.w + 0.5 && r.sw <= r.w, "import controls inside the screen: " + JSON.stringify(r));
      } finally { await ctx.close(); }
    });
  } finally {
    await browser.close();
  }
}
