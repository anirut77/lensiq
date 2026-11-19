// tests/e2e/crisis-price-scan-controls.e2e.mjs — FIXED TEST SET "crisis-v3-protect" (locked 2026-11-18 BEFORE building). Negative
// controls for the browser half of residual risk 1 (crisis-price-scan-kit.mjs), on dream.html in the crisis state, TH / EN / ZH UI:
//   C1 clean: the page in the crisis state passes the scan (0 hits);
//   C2 3 unmarked price strings (TH, EN, ZH: the unit half's INJECT) injected visibly into the result area -> exactly those 3 are
//      flagged; a 4th copy hidden with display:none and a 5th inside [data-lq-upsell] (hidden by the crisis style) are not;
//   C3 after removing the injected elements the scan is clean again.
import { SCAN, VISIBLE, toCrisis } from "./crisis-price-scan-kit.mjs";
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const INJ = `((list) => { const host = document.querySelector("#drResult, [data-lq-result], main") || document.body; const made = [];
  list.forEach((t, i) => { const e = document.createElement(i === 1 ? "button" : i === 2 ? "a" : "p"); if (i === 2) e.href = "#"; e.textContent = t; e.setAttribute("data-lq-test-inject", ""); host.appendChild(e); made.push(e); });
  const h = document.createElement("p"); h.textContent = list[0]; h.style.display = "none"; h.setAttribute("data-lq-test-inject", ""); host.appendChild(h);
  const u = document.createElement("div"); u.setAttribute("data-lq-upsell", ""); u.setAttribute("data-lq-test-inject", ""); u.textContent = list[1]; host.appendChild(u);
  return made.length; })`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`controls [${lang}]: clean passes; 3 injected unmarked price strings fail (hidden / [data-lq-upsell] copies do not); clean again after removal`, async () => {
        const p = await toCrisis(browser, base, fakeCams, "dream", lang);
        try {
          const clean = await p.evaluate(VISIBLE);
          assert(clean.length === 0, `C1 clean dream [${lang}] in the crisis state should pass: ` + S(clean));
          const list = [SCAN.INJECT.th, SCAN.INJECT.en, SCAN.INJECT.zh];
          await p.evaluate(`${INJ}(${S(list)})`);
          const bad = await p.evaluate(VISIBLE);
          assert(bad.length === 3, `C2 exactly the 3 visible injected strings are flagged, got ${bad.length}: ` + S(bad));
          for (const t of list) assert(bad.some(b => b.text.startsWith(t.slice(0, 12))), "C2 flagged: " + t);
          await p.evaluate(`document.querySelectorAll("[data-lq-test-inject]").forEach(e => e.remove()); true`);
          const again = await p.evaluate(VISIBLE);
          assert(again.length === 0, "C3 clean again after removal: " + S(again));
          console.log(`    controls [${lang}]: clean 0, injected ${bad.length} of 3 flagged (hidden + upsell copies not flagged), removed 0`);
        } finally { await p.close(); }
      });
    }
  } finally {
    await browser.close();
  }
}
