// tests/e2e/crisis-price-scan-wrap.e2e.mjs — FIXED TEST SET "datefix-1122" (locked 2026-11-22 BEFORE any measurement; copy + sha256 in
// ~/LENSIQ-field/evals/datefix-1122/, evals-locks/datefix-1122.sha256). CI 44967706758 (2026-11-22): "palm [th]: crisis state after a
// reading -> no unmarked price / sales text visible" flagged [บาท] "แต่ละบาทไปไหน" (lq-t in #plNarr), the last words of the allow-listed
// reading sentence "คุณวางงบประมาณได้ละเอียด และรู้ว่าเงินแต่ละบาทไปไหน" (tests/unit/crisis-escape-guard-allow.json, browser: true), which
// nav.js's line-wrap (glue(), 2026-11-19) had moved into its own <lq-t> piece. The palm composer picks one of four money sentences at random
// (fortune-ai.js randomSeed), so the check failed on some readings only. This set pins the scan rule of crisis-price-scan-kit.mjs VISIBLE
// for every allow-listed browser text, whatever nav.js does to it, and adds two controls the old rule could not catch.
// On palm.html in the crisis state after a reading (the kit's own toCrisis flow), UI TH / EN / ZH, 375 px:
//   W1 every allow-listed browser text (priceText entries with browser: true), each as its own paragraph in a reading section inside
//      #plNarr, after nav.js has re-wrapped it: none is flagged;
//   W1n non-vacuous: in TH at least one injected paragraph has a scanner hit inside a nav.js wrap piece (lq-t / lq-run / lq-w), the
//      palm sentence above among them;
//   W2 the unit half's three unmarked price strings (SCAN.INJECT th / en / zh), each its own paragraph: each is flagged;
//   W3 an allow-listed sentence and an unmarked price string in ONE paragraph, both orders, TH / EN / ZH prices: the price is flagged (an allowed sentence covers only the
//      words inside it, not its neighbours);
//   W4 a hidden copy (display:none) of a price string: not flagged; after removing everything injected, nothing in the test section.
import { SCAN, VISIBLE, toCrisis } from "./crisis-price-scan-kit.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BROWSER = JSON.parse(readFileSync(join(REPO, "tests/unit/crisis-escape-guard-allow.json"), "utf8")).priceText.filter(e => e.browser === true).map(e => e.text);
const PALM = "คุณวางงบประมาณได้ละเอียด และรู้ว่าเงินแต่ละบาทไปไหน";
const BOX = "lqWrapTest";
const INJ = `((list, hide) => {
  const host = document.getElementById("plNarr"); if (!host) return 0;
  const old = document.getElementById(${S(BOX)}); if (old) old.remove();
  const box = document.createElement("div"); box.id = ${S(BOX)}; box.className = "fa-section"; box.setAttribute("data-lq-test-inject", "");
  list.forEach((t, i) => { const p = document.createElement("p"); p.textContent = t; p.setAttribute("data-k", "a" + i); if (hide) p.style.display = "none"; box.appendChild(p); });
  host.appendChild(box); return box.children.length; })`;
/** paragraphs of the test section whose scanner hit sits inside a nav.js wrap piece: [data-k] */
const SPLIT = `(() => { const out = []; for (const p of document.querySelectorAll("#${BOX} > p")) {
  for (const w of p.querySelectorAll("lq-t, .lq-t, .lq-run, .lq-w")) { if (w === p) continue; const own = [...w.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join("");
    if (own && window.__lqPriceScan(own).length) { out.push(p.getAttribute("data-k")); break; } } } return out; })()`;
const IN_BOX = b => b.where.endsWith("#" + BOX);

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    assert(BROWSER.length >= 10 && BROWSER.includes(PALM), "the allow-list still holds its browser texts, the palm sentence among them");
    for (const lang of ["th", "en", "zh"]) {
      await check(`palm [${lang}] crisis state: allow-listed reading texts pass the price scan whatever nav.js wraps; unmarked prices next to them or alone are flagged`, async () => {
        const p = await toCrisis(browser, base, fakeCams, "palm", lang);
        try {
          const scanBox = async (list, hide) => {
            const n = await p.evaluate(`${INJ}(${S(list)}, ${!!hide})`);
            assert(n === list.length, `injected ${n} of ${list.length} paragraphs`);
            await sleep(1500); // nav.js line-wrap runs on idle after the mutation
            return { split: await p.evaluate(SPLIT), hits: (await p.evaluate(VISIBLE)).filter(IN_BOX) };
          };
          const fmt = hs => hs.map(h => `[${h.hit}] "${h.text}" (${h.where})`).join(" | ");
          const prices = [SCAN.INJECT.th, SCAN.INJECT.en, SCAN.INJECT.zh];
          // W1 + W1n
          const w1 = await scanBox(BROWSER);
          console.log(`    palm [${lang}] W1: ${BROWSER.length} allow-listed texts, ${w1.split.length} with a hit inside a nav.js wrap piece, ${w1.hits.length} flagged`);
          if (lang === "th") {
            assert(w1.split.length >= 1, "W1n: at least one allow-listed text has a scanner hit inside a nav.js wrap piece (TH)");
            assert(w1.split.includes("a" + BROWSER.indexOf(PALM)), "W1n: the palm sentence's hit sits inside a wrap piece (TH)");
          }
          assert(!w1.hits.length, "W1: allow-listed text flagged: " + fmt(w1.hits));
          // W2: each price string alone
          for (const t of prices) {
            const w2 = await scanBox([t]);
            assert(w2.hits.length >= 1, `W2: unmarked price string flagged: "${t}"`);
          }
          // W3: an allowed sentence and a price string in one paragraph, both orders
          for (const t of [PALM + " " + SCAN.INJECT.th, SCAN.INJECT.th + " " + PALM, BROWSER[0] + " " + SCAN.INJECT.en, BROWSER[0] + " " + SCAN.INJECT.zh]) {
            const w3 = await scanBox([t]);
            assert(w3.hits.length >= 1, `W3: the price next to an allow-listed sentence is flagged: "${t}"`);
          }
          // W4: hidden copies are not flagged; removal leaves nothing
          const w4 = await scanBox(prices, true);
          assert(!w4.hits.length, "W4: hidden price strings flagged: " + fmt(w4.hits));
          await p.evaluate(`document.getElementById(${S(BOX)}).remove(); true`);
          await sleep(300);
          const after = (await p.evaluate(VISIBLE)).filter(IN_BOX);
          assert(!after.length, "W4: nothing left in the test section after removal");
          console.log(`    palm [${lang}]: W2 3/3, W3 4/4 flagged, W4 hidden 0`);
        } finally { await p.close(); }
      });
    }
  } finally { await browser.close(); }
}
