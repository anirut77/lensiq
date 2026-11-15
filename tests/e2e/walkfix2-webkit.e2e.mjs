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

export default async function ({ base, check }) {
  const browser = await launchWebKit();
  try {
    for (const lang of ["th", "en", "zh"]) {
      for (const product of lang === "th" ? ["exam", "attendance", "gate", "crowd"] : ["exam"]) {
        await check(`D-04 [${lang}] iPhone: index.html?interest=${product}#contact lands on the form heading and Name field`, async () => {
          const { ctx, page } = await openFlow(browser, `${base}/index.html?interest=${product}&nosw#contact`, { lang });
          try {
            await sleep(2500);
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
