// tests/e2e/fortune-credits-v3.e2e.mjs — FIXED TEST SET "fortune-credits__v3" (v3 = v2 e2e with one harness fix, see below;
// unit half and audit unchanged from v2) (owner decision 2026-11-18: delete, do not move),
// rendered half; supersedes tests/e2e/fortune-credits.e2e.mjs (v1, locked bytes kept in ~/LENSIQ-field/evals/fortune-credits/).
// Locked in ~/LENSIQ-field/evals/fortune-credits/v3/ and evals-locks/fortune-credits__v3.sha256.
// v3 harness fix (CI run 44139285815): the plain static test server has no backend, so the optional /api/fortune/status probe
// of fortune-ai.js answers 404; that one request is ignored, as in fortune-new.e2e.mjs. Every other console error still fails. Static half:
// tests/unit/fortune-credits-v2.test.js. In TH / EN / ZH (lq-lang), every fortune page (category 6 of tools/cat-data.cjs + compat):
//   V1 the rendered text (all <details> opened) has no reading-source label and no "เกี่ยวกับคำอ่านนี้" block (heading, principles
//      paragraph, tarot image credit, vendor/ path);
//   V2 no link to credits.html or help.html#h-principles anywhere in <main> (the site footer from nav.js is outside <main>).
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { assert } from "./zones-lib.mjs";

const require = createRequire(import.meta.url);
const LANGS = ["th", "en", "zh"];
const PROBE = /\/api\/fortune\/status$/; // optional backend probe, 404 on the static test server
const noErrors = page => {
  const errs = page.consoleErrors.filter(e => !(e.kind === "log" && PROBE.test(e.url || "") && /404/.test(e.text || "")));
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
};
const GONE = ["สำนวนใหม่ทุกครั้ง", "เรียบเรียงในเครื่อง ไม่ส่งข้อมูลออก", "Composed on this device", "Generated on this device",
  "worded differently each time", "wording varies each time", "本机生成", "本机撰写", "每次说法", "每次措辞",
  "เกี่ยวกับคำอ่านนี้", "About this reading", "关于本解读", "หลักการ: เมื่อคุณเลือก", "Principle: when you choose", "原则：选择“直说”",
  "vendor/", "CREDITS.txt", "Pamela Colman Smith", "Rider–Waite–Smith", "ภาพไพ่:", "Card images:", "牌面图片"];

export default async function ({ base, launch, check, fakeCams, repo }) {
  const D = require(join(repo, "tools", "cat-data.cjs"));
  const PAGES = [...new Set(D.CATEGORIES.find(c => c.n === 6).pages.concat(["compat"]))].filter(p => existsSync(join(repo, p + ".html")));
  const browser = await launch();
  try {
    await check(`V1+V2 every fortune page (${PAGES.length}) in TH / EN / ZH: label and about block gone, no credits / principles link`, async () => {
      const bad = [];
      for (const p of PAGES) for (const lang of LANGS) {
        const page = await browser.newPage(null, { initScripts: [fakeCams] });
        await page.goto(`${base}/${p}.html?nosw&cpu&lang=${lang}`);
        await page.waitFor(`!!window.LQI18N && LQI18N.lang === ${JSON.stringify(lang)} && document.readyState === "complete"`, 15000);
        await new Promise(r => setTimeout(r, 400));
        const r = await page.evaluate(`(async () => {
          document.querySelectorAll("details").forEach(d => { d.open = true; });
          await new Promise(r => setTimeout(r, 100));
          const bare = [...document.querySelectorAll("body *")].filter(e => !e.children.length && e.textContent.trim() === "เรียบเรียงในเครื่อง").length;
          const links = [...document.querySelectorAll("main a[href]")].map(a => a.getAttribute("href")).filter(h => /credits\\.html|h-principles/.test(h));
          return { text: document.body.innerText, bare, links };
        })()`);
        for (const n of GONE) if (r.text.includes(n)) bad.push(`${p} ${lang}: "${n}"`);
        if (r.bare) bad.push(`${p} ${lang}: ${r.bare} element(s) reading only "เรียบเรียงในเครื่อง"`);
        if (r.links.length) bad.push(`${p} ${lang}: links ${r.links.join(", ")}`);
        noErrors(page);
        await page.close();
      }
      assert(!bad.length, bad.slice(0, 20).join("\n"));
    });
  } finally { await browser.close(); }
}
