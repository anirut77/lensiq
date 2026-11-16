// tests/e2e/walkfix2-webkit.e2e.mjs — second customer walk-through 2026-11-16, on an iPhone 13 profile (Playwright WebKit).
// FIXED TEST: written and locked (~/LENSIQ-field/evals/walk-fix-2/, sha256 in evals-locks/walk-fix-2.sha256) BEFORE the fixes
// on branch walk-fix-2. Chrome checks: tests/e2e/walkfix2.e2e.mjs; static: tests/unit/walkfix2.test.js.
//   D-04  "ขอใบเสนอราคา" from a product page (index.html?interest=<product>#contact) lands with the form heading, the delivery
//         note and the Name field on screen and below the sticky header (TH / EN / ZH; exam, attendance, gate, crowd)
//   D-01  attendance.html?mode=employee asks for no camera on open (counted at getUserMedia) (TH)
// No camera is opened; the quote form is never submitted.
import { assert } from "./cdp.mjs";
import { openFlow, launchWebKit, sleep } from "./phone-kit.mjs";

const COUNT_GUM = `(() => { window.__gum = 0; try { const md = navigator.mediaDevices || new EventTarget();
  Object.defineProperty(navigator, "mediaDevices", { get: () => md, configurable: true });
  md.getUserMedia = () => { window.__gum++; return Promise.reject(new DOMException("Permission denied", "NotAllowedError")); }; } catch (e) {} })();`;

/** polls the element's top every 50 ms until it has not changed for 500 ms (8 s at most; the assertion then decides) */
async function waitStableTop(page, id, stableMs = 500, maxMs = 8000) {
  const t0 = Date.now();
  let last = null, since = Date.now();
  while (Date.now() - t0 < maxMs) {
    const top = await page.evaluate(i => { const e = document.getElementById(i); return e ? Math.round(e.getBoundingClientRect().top) : null; }, id);
    if (top !== last) { last = top; since = Date.now(); } else if (top !== null && Date.now() - since >= stableMs) return;
    await sleep(50);
  }
}

export default async function ({ base, check }) {
  const browser = await launchWebKit();
  try {
    for (const lang of ["th", "en", "zh"]) {
      for (const product of lang === "th" ? ["exam", "attendance", "gate", "crowd"] : ["exam"]) {
        await check(`D-04 [${lang}] iPhone: index.html?interest=${product}#contact lands on the form heading and Name field`, async () => {
          const { ctx, page } = await openFlow(browser, `${base}/index.html?interest=${product}&nosw#contact`, { lang });
          try {
            // re-lock 2026-11-16 (webkit-flake-fix, CI run 43771149311): the fixed 2.5 s pause is replaced by a wait for a stable
            // scroll position (the heading's top unchanged for 500 ms, 8 s at most); the assertion below is unchanged
            await waitStableTop(page, "ct-title");
            const r = await page.evaluate(() => {
              const nav = document.getElementById("siteNav"), nb = nav ? nav.getBoundingClientRect().bottom : 0;
              const box = id => { const e = document.getElementById(id); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
              return { nav: Math.round(nb), h: innerHeight, title: box("ct-title"), note: box("leadNote") || box("leadNotice"), name: box("lqName"), v: document.getElementById("lqInterest").value };
            });
            assert(r.v === product, `${product} preselected: ${r.v}`);
            for (const k of ["title", "note", "name"]) {
              const b = r[k];
              assert(b && b.top >= r.nav - 1 && b.bottom <= r.h, `${k} not fully on screen below the header: ${JSON.stringify(r)}`);
            }
          } finally { await ctx.close(); }
        });
      }
    }
    await check("D-01 [th] iPhone: attendance.html?mode=employee asks for no camera on open", async () => {
      const { ctx, page } = await openFlow(browser, `${base}/attendance.html?mode=employee&cpu&nosw`, { lang: "th", init: [COUNT_GUM] });
      try {
        await sleep(3500);
        const gum = await page.evaluate(() => window.__gum);
        assert(gum === 0, `camera requested ${gum} time(s) on open`);
      } finally { await ctx.close(); }
    });
  } finally { await browser.close(); }
}
