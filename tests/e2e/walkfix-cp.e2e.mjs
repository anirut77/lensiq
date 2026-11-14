// tests/e2e/walkfix-cp.e2e.mjs — walk-fix merged with consistency-pass (coordinator 2026-11-14), Chrome at 375 px.
// FIXED TEST: locked (~/LENSIQ-field/evals/walk-fix/, evals-locks/walk-fix.sha256) BEFORE the merge fixes.
//   1. interview / neuro / creative / signage: every visible .tab label is on one line (no word-per-line wrap at <wbr>);
//   2. village / parking / medicine: the tab bar is one row (all visible tabs share one top) that scrolls sideways when it
//      is wider than the screen, so inactive tabs still read as tabs; the page itself never scrolls sideways.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const INIT = `try { localStorage.setItem('lq-lang', 'th'); } catch (e) {} window.confirm = () => true; window.alert = () => {};`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const p of ["interview", "neuro", "creative", "signage", "village", "parking", "medicine"]) {
      await check(`375 px ${p}.html: tab labels on one line, tab bar one row, no page overflow`, async () => {
        const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
          await page.goto(`${base}/${p}.html?cpu&fakedet&nosw`);
          await sleep(1500);
          const r = await page.evaluate(() => {
            const tabs = [...document.querySelectorAll(".tab")].filter(t => t.offsetParent && t.getBoundingClientRect().width > 0);
            const lines = el => { const rg = document.createRange(); rg.selectNodeContents(el); return new Set([...rg.getClientRects()].filter(x => x.width > 1).map(x => Math.round(x.top))).size; };
            const bars = [...new Set(tabs.map(t => t.parentElement))];
            return {
              n: tabs.length, multi: tabs.filter(t => lines(t) > 1).map(t => t.textContent.trim()),
              bars: bars.map(b => ({ tops: new Set([...b.children].filter(c => c.offsetParent).map(c => Math.round(c.getBoundingClientRect().top))).size,
                sw: b.scrollWidth, cw: b.clientWidth, ox: getComputedStyle(b).overflowX })),
              doc: document.documentElement.scrollWidth, w: document.documentElement.clientWidth
            };
          });
          assert(r.n >= 2, "tabs found: " + r.n);
          assert(!r.multi.length, "tab labels on more than one line: " + r.multi.join(" | "));
          for (const b of r.bars) {
            assert(b.tops === 1, "tab bar wraps to " + b.tops + " rows");
            assert(b.sw <= b.cw || /auto|scroll/.test(b.ox), "a bar wider than the screen scrolls sideways: " + JSON.stringify(b));
          }
          assert(r.doc <= r.w, `page overflows: ${r.doc} > ${r.w}`);
        } finally { await page.close(); }
      });
    }
  } finally {
    await browser.close();
  }
}
