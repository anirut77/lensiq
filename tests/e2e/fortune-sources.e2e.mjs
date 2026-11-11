// tests/e2e/fortune-sources.e2e.mjs — owner order 2026-11-12 (Part B): no fortune page shows source citations to users.
// Every fortune page is opened in Thai, English and Chinese (lq-lang) and its RENDERED text (scripts have run, language
// switched) must contain no citation heading or footnote words, no source name (site / author / book from the knowledge
// bases' source lists) and no link to a source URL. On the zodiac page a reading is produced first, so the
// reading itself is checked too. The tarot card-image credit (#trCredit) is a media licence credit, not a citation, and is
// the one element left out. Admin (back office) lists the sources: checked in tests/unit/fortune-sources.test.js.
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const KBS = readdirSync(repo).filter(f => /-kb\.js$/.test(f));
const ALL = KBS.flatMap(f => { const K = require(join(repo, f)); return [].concat(K.sources || [], K.readingSources || []); });
const GENERIC = new Set(["Central", "All About", "China Travel"]);
const NAMES = [...new Set(ALL.flatMap(s => [String(s.label).split(" — ")[0].trim(), new URL(s.url).hostname.replace(/^www\./, "")]))].filter(n => n.length >= 3 && !GENERIC.has(n));
const URLS = ALL.map(s => s.url);
const CITE = "แหล่งอ้างอิง|อ้างอิงจาก|บรรณานุกรม|ที่มา:|\\b(?:References?|Sources?:|Bibliography|Cited|Citation)\\b|参考资料|参考文献|出处|来源[:：]";

const PAGES = ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac", "astro",
  "lifegraph", "planner", "luckycolor", "report"];
const READ = {
  zodiac: () => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); },
};
const SCAN = `((names, urls, cite) => {
  const re = new RegExp(cite);
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; const text = [];
  while ((n = w.nextNode())) {
    const el = n.parentElement; if (!el || el.closest("script,style,noscript,#trCredit")) continue;
    if (el.closest("[hidden]") || getComputedStyle(el).display === "none") continue;
    const t = n.textContent.trim(); if (t) text.push(t);
  }
  const all = text.join("\\n");
  const links = [...document.querySelectorAll("a[href]")].map(a => a.href);
  return { len: all.length, cite: (all.match(re) || [])[0] || "", names: names.filter(x => all.includes(x)), links: links.filter(h => urls.indexOf(h) >= 0 || urls.some(u => h === new URL(u).href)),
    sections: document.querySelectorAll(".fa-section").length };
})`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`fortune pages (${lang}): no citation heading, source name or source link — ${PAGES.length} pages`, async () => {
        const rows = [];
        for (const p of PAGES) {
          const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`] });
          try {
            await page.goto(`${base}/${p}.html`);
            await page.waitFor(() => document.readyState === "complete", 10000);
            if (READ[p]) {
              await page.evaluate(READ[p]);
              await page.waitFor(() => document.querySelectorAll(".fa-section").length >= 3 && ![...document.querySelectorAll(".fa-section")].some(s => /กำลังเรียบเรียง/.test(s.textContent)), 15000);
            }
            const r = await page.evaluate(`${SCAN}(${JSON.stringify(NAMES)}, ${JSON.stringify(URLS)}, ${JSON.stringify(CITE)})`);
            rows.push(p + ":" + r.len + (READ[p] ? "/" + r.sections + "sec" : ""));
            assert(r.len > 200, `${p} (${lang}) rendered text too short: ${r.len}`);
            assert(!r.cite, `${p} (${lang}) shows citation words: ${r.cite}`);
            assert(!r.names.length, `${p} (${lang}) names sources: ${r.names.join(", ")}`);
            assert(!r.links.length, `${p} (${lang}) links sources: ${r.links.join(", ")}`);
          } finally { await page.close(); }
        }
        console.log("    " + lang + " " + rows.join(" "));
      });
    }
  } finally {
    await browser.close();
  }
}
