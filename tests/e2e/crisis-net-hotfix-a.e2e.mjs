// tests/e2e/crisis-net-hotfix-a.e2e.mjs — FIXED TEST SET "crisis-net-hotfix" part A: numbers (every free-text field of the
// inventory, incl. the digit boxes whose formatting must not run before the crisis net). See crisis-net-hotfix-kit.mjs.
import { GENERIC, assertCard, baseline, click, open, rowsOf, runRow, setVal, submit } from "./crisis-net-hotfix-kit.mjs";
import { assert } from "./cdp.mjs";

const WIDGETS = GENERIC.concat(["#nmResTitle", "#nmResKind", "#nmResNum", "#nmRing", "#nmScoreWord", "#nmBreak", "#nmStrip", "#nmStripCap", "#nmPairsBlock",
  "#nmSum", "#nmPatBlock", "#nmKala", "#nmGoals", "#nmWordsBlock", "#nmSrc", "#nmDaily", "#nmCompare", "#nmCardImg"]);
const TAB = { "#nmPhone": "phone", "#nmPlate": "plate", "#nmHouse": "house", "#nmAcct": "account", "#nmName": "name", ".nm-cmp-in": "compare" };

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const row of rowsOf(["numbers"])) {
      const tab = TAB[row.sel];
      await runRow(check, row, tab && (async ({ lang, phrase, width, label }) => {
        const page = await open(browser, base, "numbers.html", { width, lang });
        try {
          await page.evaluate(click(`.nm-tab[data-tab="${tab}"]`));
          const before = await baseline(page);
          await page.evaluate(setVal(row.sel, phrase));
          try { await page.evaluate(submit("nmForm")); } catch (e) { /* the card may already have replaced the form */ }
          await assertCard(page, { label, typed: phrase, before, widgets: WIDGETS });
        } finally { await page.close(); }
      }), { both: row.sel === "#nmName" });
    }
    await check("inventory: numbers rows present", async () => assert(rowsOf(["numbers"]).length >= 6, "numbers rows"));
  } finally {
    await browser.close();
  }
}
