// tests/e2e/fortune-credits.e2e.mjs — FIXED TEST SET "fortune-credits" (owner order 2026-11-17 night, item 2), rendered half.
// Written and locked (~/LENSIQ-field/evals/fortune-credits/, evals-locks/fortune-credits.sha256) BEFORE the change on branch
// fortune-credits (base origin/main 5695734). Static half: tests/unit/fortune-credits.test.js. In TH / EN / ZH (lq-lang):
//   R1 every fortune page (category 6 of tools/cat-data.cjs + compat): the rendered text has no reading-source label
//      ("เรียบเรียงในเครื่อง · สำนวนใหม่ทุกครั้ง" and EN / ZH equivalents), no "เกี่ยวกับคำอ่านนี้" block (heading, card-image
//      credit, vendor/ path, the straight-mode principles paragraph); the foot shows one visible link to credits.html and one to
//      help.html#h-principles, in the page language, and both targets answer 200;
//   R2 help.html#h-principles opens the "หลักการทำนายของเรา" section of the visible language with its text loaded (no wording
//      about the straight-reading mode); help.html opened without the hash loads no extra file for it;
//   R3 credits.html shows the copy of the visible language with a row for every asset of the fixed list.
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { noErrors, assert } from "./zones-lib.mjs";

const require = createRequire(import.meta.url);
const LANGS = ["th", "en", "zh"];
const LABEL = ["สำนวนใหม่ทุกครั้ง", "เรียบเรียงในเครื่อง ไม่ส่งข้อมูลออก", "Composed on this device", "Generated on this device", "worded differently each time",
  "wording varies each time", "本机生成", "本机撰写", "每次说法", "每次措辞"];
const BLOCK = ["เกี่ยวกับคำอ่านนี้", "About this reading", "关于本解读", "vendor/", "CREDITS.txt", "หลักการ: เมื่อคุณเลือก", "Principle: when you choose",
  "原则：选择“直说”"];
const STRAIGHT = { th: "ดูตรง|ตรง ๆ|ตรงๆ|18 ปี|นุ่มนวล", en: "straight|18 or older|\\bgentle|plain wording", zh: "直说|18 ?岁|温和|直白" };
const SCRIPT = { th: "[\\u0E00-\\u0E7F]", en: "^[^\\u0E00-\\u0E7F\\u4E00-\\u9FFF]+$", zh: "[\\u4E00-\\u9FFF]" };

export default async function ({ base, launch, check, fakeCams, repo }) {
  const D = require(join(repo, "tools", "cat-data.cjs"));
  const ASSETS = JSON.parse(readFileSync(join(repo, "tests", "unit", "fortune-credits-assets.json"), "utf8"));
  const PAGES = [...new Set(D.CATEGORIES.find(c => c.n === 6).pages.concat(["compat"]))].filter(p => existsSync(join(repo, p + ".html")));
  const browser = await launch();
  const open = async (file, lang, hash = "") => {
    const page = await browser.newPage(null, { initScripts: [fakeCams] });
    await page.goto(`${base}/${file}${file.includes("?") ? "&" : "?"}nosw&cpu&lang=${lang}${hash}`);
    await page.waitFor(`!!window.LQI18N && LQI18N.lang === ${JSON.stringify(lang)} && document.readyState === "complete"`, 15000);
    await new Promise(r => setTimeout(r, 400));
    return page;
  };
  try {
    await check(`R1 every fortune page (${PAGES.length}) in TH / EN / ZH: no source label, no about block, foot links in the page language`, async () => {
      const bad = [];
      for (const p of PAGES) for (const lang of LANGS) {
        const page = await open(p + ".html", lang);
        const r = await page.evaluate(`(async () => {
          document.querySelectorAll("details").forEach(d => { d.open = true; });
          await new Promise(r => setTimeout(r, 100));
          const text = document.body.innerText;
          const vis = a => a && !a.closest("[hidden]") && a.getClientRects().length > 0;
          const links = {};
          for (const href of ["credits.html", "help.html#h-principles"]) {
            const as = [...document.querySelectorAll('main a[href="' + href + '"]')];
            const a = as[0];
            let status = 0;
            try { status = (await fetch(new URL(href.split("#")[0], location.href).href, { cache: "no-store" })).status; } catch (e) { status = -1; }
            links[href] = { n: as.length, visible: vis(a), text: a ? a.textContent.trim() : "", status };
          }
          const bare = [...document.querySelectorAll("body *")].filter(e => !e.children.length && e.textContent.trim() === "เรียบเรียงในเครื่อง").length;
          return { text, links, bare };
        })()`);
        for (const n of LABEL.concat(BLOCK)) if (r.text.includes(n)) bad.push(`${p} ${lang}: "${n}"`);
        if (r.bare) bad.push(`${p} ${lang}: ${r.bare} element(s) reading only "เรียบเรียงในเครื่อง"`);
        for (const [href, l] of Object.entries(r.links)) {
          if (l.n !== 1 || !l.visible) bad.push(`${p} ${lang}: ${l.n} link(s) to ${href}, visible ${l.visible}`);
          else if (!new RegExp(SCRIPT[lang]).test(l.text) || l.text.length < 3) bad.push(`${p} ${lang}: link text "${l.text}" not in the page language`);
          if (l.status !== 200) bad.push(`${p} ${lang}: ${href} answers ${l.status}`);
        }
        noErrors(page);
        await page.close();
      }
      assert(!bad.length, bad.slice(0, 20).join("\n"));
    });

    await check("R2 help.html#h-principles (TH / EN / ZH): the section opens with its text, no straight-mode wording; no extra load without the hash", async () => {
      const ids = { th: "h-principles", en: "en-h-principles", zh: "zh-h-principles" };
      for (const lang of LANGS) {
        const page = await open("help.html", lang, "#h-principles");
        await page.waitFor(`(() => { const d = document.getElementById(${JSON.stringify(ids[lang])}); return !!d && d.open && d.innerText.length > 150; })()`, 10000);
        const r = await page.evaluate(`(() => { const d = document.getElementById(${JSON.stringify(ids[lang])});
          return { text: d.innerText, shown: d.getClientRects().length > 0 }; })()`);
        assert(r.shown, `${lang}: section not visible`);
        assert(new RegExp(SCRIPT[lang]).test(lang === "en" ? r.text.replace(/\s+/g, " ") : r.text), `${lang}: text not in the page language`);
        assert(!new RegExp(STRAIGHT[lang], "i").test(r.text), `${lang}: straight-mode wording: ${r.text.slice(0, 200)}`);
        noErrors(page);
        await page.close();
      }
      const page = await open("help.html", "th");
      const lazy = await page.evaluate(`(() => { const d = document.getElementById("h-principles"); const s = d && d.getAttribute("data-src");
        return { src: s, loaded: !!s && performance.getEntriesByType("resource").some(e => e.name.includes(s.split("?")[0])) }; })()`);
      assert(!lazy.src || !lazy.loaded, "help.html without the hash already loaded " + lazy.src);
      noErrors(page);
      await page.close();
    });

    await check(`R3 credits.html (TH / EN / ZH): visible copy lists all ${ASSETS.credits.length} credited assets`, async () => {
      for (const lang of LANGS) {
        const page = await open("credits.html", lang);
        const r = await page.evaluate(`(() => {
          const art = [...document.querySelectorAll("article.lg")].find(a => a.getClientRects().length > 0);
          if (!art) return null;
          const rows = {};
          art.querySelectorAll("tr[data-credit]").forEach(tr => { rows[tr.getAttribute("data-credit")] = tr.innerText; });
          return { cls: art.className, rows };
        })()`);
        assert(r && r.cls.includes("lg-" + lang), `${lang}: visible copy ${r && r.cls}`);
        const miss = ASSETS.credits.filter(c => !r.rows[c.id] || !c.needles.concat([c.licence]).every(n => r.rows[c.id].includes(n))).map(c => c.id);
        assert(!miss.length, `${lang}: rows missing or incomplete: ${miss.join(", ")}`);
        noErrors(page);
        await page.close();
      }
    });
  } finally { await browser.close(); }
}
