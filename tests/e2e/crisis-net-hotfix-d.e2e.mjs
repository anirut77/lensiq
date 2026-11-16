// tests/e2e/crisis-net-hotfix-d.e2e.mjs — FIXED TEST SET "crisis-net-hotfix" part D: the year boxes of bazi, taksa, lek7,
// lifegraph, zodiac and astro (maxlength 4: the short phrase fits), plus the inventory's non-text inputs: a phrase put into
// them is not kept (so they cannot hold one). See crisis-net-hotfix-kit.mjs.
import { GENERIC, INVENTORY, PHRASE, assertCard, baseline, open, rowsOf, runRow, setVal, submit } from "./crisis-net-hotfix-kit.mjs";
import { assert } from "./cdp.mjs";

const LC = GENERIC.concat(["#lcResult", "#lcResTitle", "#lcChart", "#lcReadWrap"]);
const ZD = GENERIC.concat(["#zdResult", "#zdPairRes", "#zdCardImg"]);
const AS = GENERIC.concat(["#asResult", "#asResTitle", "#asSignRes", "#asCardImg"]);
const FORM = { "#lcYear": ["lcForm", LC], "#zdBirthYear": ["zdForm", ZD], "#asYear": ["asForm", AS] };

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const row of rowsOf(["bazi", "taksa", "lek7", "lifegraph", "zodiac", "astro"])) {
      const f = FORM[row.sel];
      await runRow(check, row, f && (async ({ lang, phrase, width, label }) => {
        const page = await open(browser, base, row.page + ".html", { width, lang });
        try {
          const before = await baseline(page);
          await page.evaluate(setVal(row.sel, phrase));
          await page.evaluate(submit(f[0]));
          await assertCard(page, { label, typed: phrase, before, widgets: f[1] });
        } finally { await page.close(); }
      }));
    }

    await check("inventory: every non-text input with an id on a fortune page does not keep a typed phrase", async () => {
      const bad = [];
      const rows = INVENTORY.inputs.filter(r => !r.phrase && r.page !== "*" && /^#/.test(r.sel) && !r.dynamic && !["checkbox", "radio", "file", "range"].includes(r.type));
      for (const page of [...new Set(rows.map(r => r.page))]) {
        const p = await open(browser, base, page + ".html", { width: 375, lang: "th" });
        try {
          for (const r of rows.filter(x => x.page === page)) {
            const v = await p.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(r.sel)}); if (!e) return "missing"; e.value = ${JSON.stringify(PHRASE.short)}; e.dispatchEvent(new Event("input", { bubbles: true })); return e.value; })()`);
            if (v === "missing" || v.includes(PHRASE.short)) bad.push(page + " " + r.sel + " (" + r.type + "): " + v);
          }
        } finally { await p.close(); }
      }
      assert(!bad.length, "inputs that keep a phrase but are listed as non-text: " + bad.join(", "));
    });
  } finally {
    await browser.close();
  }
}
