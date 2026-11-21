// tests/e2e/fortune-no-demo.e2e.mjs — owner order 2026-11-17: "remove the 'สาธิต' tag from the fortune category page and
// every fortune item now". FIXED TEST: written and locked (~/LENSIQ-field/evals/fortune-no-demo/, sha256 in
// evals-locks/fortune-no-demo.sha256) BEFORE the change on branch fortune-no-demo (base 02fdd69). Rendered, TH / EN / ZH:
//   1. cat-fortune.html: no status chip, no element reading the demo label, the count line names no demo;
//   2. every fortune page (category 6 of tools/cat-data.cjs, plus compat / petread when they exist): no status chip and no
//      element whose whole text is the demo label;
//   3. index.html: the fortune category card names no demo; solutions.html: no fortune card shows a demo badge;
//   4. other categories unchanged: teamface (cat-hr), signage and neuro (cat-marketing) and solutions sol-r5 still show the
//      demo label in each language.
//      re-lock 2026-11-21 (owner decision 223-2, inversion): the demo label is gone from every customer card; teamface
//      (cat-hr), signage and neuro (cat-marketing) and solutions sol-r5 now carry exactly the "Coming soon" badge
//      (D.BADGE.soon: เร็ว ๆ นี้ / Coming soon / 即将推出), are marked data-demo-only and are hidden outside demo mode; the
//      index HR count is exactly "<n> tools" over the HR tools shown outside demo mode and names no status (no demo label).
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { noErrors, assert } from "./zones-lib.mjs";

const require = createRequire(import.meta.url);
const LANGS = ["th", "en", "zh"];
const DEMO = { th: "สาธิต", en: "Demo", zh: "演示" };
const DEMO_SRC = { th: "สาธิต", en: "\\bdemo\\b", zh: "演示" };
// re-lock 2026-11-21 (owner decision 223): the index category count is "<n> tools" only, no status breakdown
const COUNT = { th: n => n + " เครื่องมือ", en: n => n + " tools", zh: n => n + " 个工具" };

export default async function ({ base, launch, check, fakeCams, repo }) {
  const D = require(join(repo, "tools", "cat-data.cjs"));
  const FORT = D.CATEGORIES.find(c => c.slug === "fortune");
  const PAGES = FORT.pages.concat(["compat", "petread"].filter(p => existsSync(join(repo, p + ".html"))));
  const browser = await launch();
  const open = async (file, lang) => {
    const page = await browser.newPage(null, { initScripts: [fakeCams] });
    await page.goto(`${base}/${file}${file.includes("?") ? "&" : "?"}nosw&cpu&lang=${lang}`);
    await page.waitFor(`!!window.LQI18N && LQI18N.lang === ${JSON.stringify(lang)} && document.readyState === "complete"`, 15000);
    await new Promise(r => setTimeout(r, 400));
    return page;
  };
  /** in the page: chips (.cat-st / .sl-tag) and leaf elements whose whole visible text is the demo label */
  const scan = (label, re) => `(() => {
    const vis = el => !el.closest("[hidden]") && el.getClientRects().length > 0;
    const re = new RegExp(${JSON.stringify(re)}, "i");
    const chips = [...document.querySelectorAll(".cat-st, .sl-tag")].filter(vis).map(e => e.className + ":" + e.textContent.trim());
    const exact = [...document.querySelectorAll("body *")].filter(e => !e.children.length && vis(e) && e.textContent.trim() === ${JSON.stringify(label)})
      .map(e => e.tagName + "." + e.className);
    return { chips, exact, demoChips: chips.filter(c => re.test(c) || /\\bdemo\\b/.test(c.split(":")[0])) };
  })()`;
  try {
    await check("cat-fortune.html (TH / EN / ZH): no status chip, no demo label, count names no demo", async () => {
      for (const lang of LANGS) {
        const page = await open("cat-fortune.html", lang);
        const r = await page.evaluate(scan(DEMO[lang], DEMO_SRC[lang]));
        const count = await page.evaluate(() => document.getElementById("catCount").textContent.trim());
        const tools = await page.evaluate(() => document.querySelectorAll(".cat-tool").length);
        assert(tools === FORT.pages.length, `${lang}: ${tools} tools`);
        assert(!r.chips.length && !r.exact.length, `${lang}: ${JSON.stringify(r)}`);
        assert(!new RegExp(DEMO_SRC[lang], "i").test(count) && count.startsWith(String(FORT.pages.length)), `${lang} count: ${count}`);
        noErrors(page);
        await page.close();
      }
    });

    await check(`every fortune page (${PAGES.length}) in TH / EN / ZH: no status chip, no demo label`, async () => {
      const bad = [];
      for (const p of PAGES) for (const lang of LANGS) {
        const page = await open(p + ".html", lang);
        const r = await page.evaluate(scan(DEMO[lang], DEMO_SRC[lang]));
        if (r.chips.length || r.exact.length) bad.push(`${p} ${lang}: ${JSON.stringify(r)}`);
        await page.close();
      }
      assert(!bad.length, bad.join("\n"));
    });

    await check("index.html fortune card and solutions.html fortune cards (TH / EN / ZH): no demo; other categories keep theirs", async () => {
      for (const lang of LANGS) {
        const re = DEMO_SRC[lang];
        const idx = await open("index.html", lang);
        const fc = await idx.evaluate(() => (document.querySelector("[data-i18n='cat.fortune.count']") || {}).textContent || "");
        const hc = await idx.evaluate(() => (document.querySelector("[data-i18n='cat.hr.count']") || {}).textContent || "");
        assert(fc && !new RegExp(re, "i").test(fc), `${lang} index fortune count: ${fc}`);
        // re-lock 223 (was: "the HR count keeps the demo label"): no demo label, exactly the HR tools shown outside demo mode
        const HR = D.CATEGORIES.find(c => c.slug === "hr");
        assert(!new RegExp(re, "i").test(hc) && hc.trim() === COUNT[lang](HR.pages.filter(p => !D.DEMO_ONLY.includes(p)).length), `${lang} index hr count: ${hc}`);
        await idx.close();
        const sol = await open("solutions.html", lang);
        const r = await sol.evaluate((pages, label) => {
          const out = { fortune: [], r5: null };
          for (const card of document.querySelectorAll("article.sl-card")) {
            const a = card.querySelector(".sl-go"), href = a ? a.getAttribute("href") || "" : "";
            const page = href.replace(/\.html.*$/, "");
            const tag = card.querySelector(".sl-tag");
            if (pages.includes(page)) out.fortune.push(page + ":" + (tag ? tag.textContent.trim() : ""));
            if (card.id === "sol-r5") { out.r5 = tag ? tag.textContent.trim() : ""; out.r5demoOnly = card.hasAttribute("data-demo-only"); out.r5shown = card.getClientRects().length > 0; }
          }
          out.label = label;
          return out;
        }, PAGES, DEMO[lang]);
        assert(r.fortune.length >= 3, `${lang} fortune cards ${JSON.stringify(r)}`);
        assert(r.fortune.every(s => !new RegExp(re, "i").test(s)), `${lang} fortune card badge: ${r.fortune}`);
        // re-lock 223 (was: "sol-r5 keeps its demo badge"): the Coming-soon badge, demo-only, hidden in the customer build
        assert(r.r5 === D.BADGE.soon[lang] && r.r5demoOnly && !r.r5shown, `${lang} sol-r5 Coming-soon badge, demo-only, hidden: ${JSON.stringify([r.r5, r.r5demoOnly, r.r5shown])}`);
        await sol.close();
        for (const [slug, pages] of [["hr", ["teamface"]], ["marketing", ["signage", "neuro"]]]) {
          const cp = await open(`cat-${slug}.html`, lang);
          const tags = await cp.evaluate(ps => ps.map(p => (document.querySelector(`.cat-tool[data-page='${p}'] .cat-st`) || {}).textContent || ""), pages);
          // re-lock 223 (was: "each still shows the demo label"): exactly the Coming-soon badge, never the demo label
          assert(tags.every(t => t.trim() === D.BADGE.soon[lang] && !new RegExp(re, "i").test(t)), `${lang} cat-${slug} badges: ${tags}`);
          const demoOnly = await cp.evaluate(ps => ps.map(p => { const c = document.querySelector(`.cat-tool[data-page='${p}']`);
             return !!c && c.hasAttribute("data-demo-only") && c.getClientRects().length === 0; }), pages);
          assert(demoOnly.every(Boolean), `${lang} cat-${slug} ${pages}: demo-only and hidden in the customer build: ${demoOnly}`);
          await cp.close();
        }
      }
    });
  } finally { await browser.close(); }
}
