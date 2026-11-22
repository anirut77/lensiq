// tests/e2e/visibility-223.e2e.mjs — owner decision 226 (entries 13-15, inside decision 223), browser half of the locked
// contract tests/unit/accuracy-removal-223.test.js R9 / R5 (re-lock 3). FIXED TEST, locked before the product change.
//   V1 a product switched off in the nav.js visibility list (exam-hall, signage, neuro, teamface, customers; re-lock 4: plus the part product-check) is not
//      reachable from anything a customer sees at 360 px: the menu, the home page, the solutions catalogue, the cameras
//      directory and every category page (no visible link to it)
//   V2 its direct URL shows ONLY the approved sentence "ระบบนี้ยังไม่เปิดให้บริการ · This service is not available yet. ·
//      此服务尚未开放。" and a visible link to the home page, in TH / EN / ZH; no other visible text, no camera request
//   V3 no status label or status filter is visible on the pages a customer lands on (TH / EN / ZH)
//   V4 an on product (crowd.html) opens normally and keeps its two plain lines and the dense-crowd limit
// RE-LOCK 4 (coordinator decision 2026-11-22 on owner entry 13, reversible by the owner): Product Check is the part
// "product-check" of medicine.html (the "ตรวจสินค้า" tab), not the whole page; medicine.html (the drug checker) is on.
//   V2 runs on the switched-off PAGES (the off list minus its parts); new V5: on medicine.html (TH / EN / ZH, 360 px) the
//      Product Check tab and panel are not rendered (also with #t-pc / #tab-pc in the URL), the drug checker is shown and
//      works offline (registration number 1A 15/50 parsed), the arrow keys skip the hidden tab, no page error, no off notice
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC = JSON.parse(readFileSync(join(repo, "tests", "unit", "accuracy-removal-223.spec.json"), "utf8"));
const PARTS = SPEC.visibility.parts || {};
const OFF = SPEC.visibility.off.filter(o => !PARTS[o]), SENTENCE = SPEC.visibility.sentence;
const LABELS = SPEC.labelBanned.map(b => new RegExp(b.re, b.flags || ""));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const PAGES = ["index.html", "solutions.html", "cameras.html", "cat-security.html", "cat-education.html", "cat-hr.html", "cat-marketing.html",
  "cat-health.html", "cat-studio.html", "crowd.html", "exam.html", "help.html"];

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("V1 + V3: no visible link to a switched-off product and no visible status label on the listing pages (360 px, TH / EN / ZH)", async () => {
      const page = await browser.newPage(null, { offNotice: true });
      await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
      for (const lang of LANGS) for (const p of PAGES) {
        await page.goto(`${base}/${p}?lang=${lang}`);
        await sleep(700);
        const r = await page.evaluate(off => {
          const vis = el => {
            for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
              const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden") return false;
            }
            return el.getClientRects().length > 0;
          };
          // the menu: every link nav.js renders, open or closed (rendered = reachable by one tap)
          const menu = [...document.querySelectorAll("#siteNav a[href]")].map(a => a.getAttribute("href"));
          const shown = [...document.querySelectorAll("a[href]")].filter(vis).map(a => a.getAttribute("href"));
          const hit = list => list.filter(h => off.some(o => h.split(/[?#]/)[0] === o + ".html"));
          return { menu: hit(menu), shown: hit(shown), text: document.body.innerText, filter: !!document.querySelector(".sl-filter, [data-f]") };
        }, OFF);
        assert(!r.menu.length, `${p} ${lang}: the menu links to a switched-off product: ${r.menu.join(", ")}`);
        assert(!r.shown.length, `${p} ${lang}: visible link to a switched-off product: ${r.shown.join(", ")}`);
        assert(!r.filter, `${p} ${lang}: a status filter is on the page`);
        for (const re of LABELS) assert(!re.test(r.text), `${p} ${lang}: visible status label "${(r.text.match(re) || [])[0]}"`);
      }
      await page.close();
    });

    await check("V2: the direct URL of every switched-off product shows only the approved sentence and a link to the home page (TH / EN / ZH)", async () => {
      for (const off of OFF) for (const lang of LANGS) {
        const page = await browser.newPage(null, { offNotice: true });
        await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
        await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__gum=0;" +
          "try{const g=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=(c)=>{window.__gum++;return g(c);};}catch(e){}" });
        await page.goto(`${base}/${off}.html?lang=${lang}`);
        await sleep(900);
        const r = await page.evaluate(() => {
          const text = document.body.innerText.replace(/\s+/g, " ").trim();
          const links = [...document.querySelectorAll("a[href]")]
            .filter(a => a.getClientRects().length && getComputedStyle(a).visibility !== "hidden").map(a => ({ href: a.getAttribute("href"), t: a.innerText.trim() }));
          return { text, links, gum: window.__gum };
        });
        assert(r.text.includes(SENTENCE), `${off}.html ${lang}: the sentence is shown: ${r.text.slice(0, 200)}`);
        assert(r.links.length === 1 && r.links[0].href.split(/[?#]/)[0] === "index.html" && r.links[0].t,
          `${off}.html ${lang}: exactly one visible link, to the home page: ${JSON.stringify(r.links)}`);
        assert(r.text.replace(SENTENCE, "").replace(r.links[0].t, "").replace(/[\s·]/g, "") === "", `${off}.html ${lang}: nothing else is visible: ${r.text.slice(0, 300)}`);
        assert(r.gum === 0, `${off}.html ${lang}: no camera request`);
        await page.close();
      }
    });

    await check("V4: an on product (crowd.html) opens normally with its two plain lines and the dense-crowd limit", async () => {
      const page = await browser.newPage(`${base}/crowd.html?lang=th`); // re-lock 4: Thai explicitly (the language chosen by V1 / V2 / V5 persists)
      await sleep(600);
      const t = await page.evaluate(() => document.querySelector("main").innerText);
      assert(t.includes(SPEC.lines.find(l => l.id === "crowd")["1"].th) && t.includes("ยังไม่เหมาะกับฝูงชนหนาแน่น"), "crowd.html two lines: " + t.slice(0, 300));
      assert(!t.includes(SENTENCE), "crowd.html is not the off notice");
      await page.close();
    });

    await check("V5: a switched-off part (Product Check tab of medicine.html) is not shown; the drug checker on the page works (TH / EN / ZH, 360 px)", async () => {
      for (const [part, P] of Object.entries(PARTS)) for (const lang of LANGS) for (const hash of ["", "#t-pc", "#tab-pc"]) {
        const page = await browser.newPage(null, { offNotice: true });
        await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
        await page.goto(`${base}/${P.page}.html?lang=${lang}${hash}`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}" && document.readyState === "complete"`, 8000);
        await sleep(400);
        const r = await page.evaluate(([ids, keep, sentence]) => {
          const shown = id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; };
          const out = { hidden: ids.filter(shown), kept: keep.filter(id => !shown(id)), notice: !!document.getElementById("lqOff") || document.body.innerText.includes(sentence),
            tabs: [...document.querySelectorAll('[role="tab"]')].filter(t => t.getClientRects().length).map(t => t.id) };
          const pill = document.getElementById("t-pill");
          pill.focus(); pill.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
          out.next = document.activeElement && document.activeElement.id;
          document.getElementById("t-pack").click();
          const q = document.getElementById("mdQ"); q.value = "1A 15/50"; document.getElementById("mdCheck").click();
          out.result = document.getElementById("mdOut").innerText;
          return out;
        }, [P.ids, P.keep, SENTENCE]);
        const where = `${P.page}.html${hash} ${lang} (${part})`;
        assert(!r.hidden.length, `${where}: switched-off part shown: ${r.hidden.join(", ")}`);
        assert(!r.kept.length, `${where}: the drug checker is not shown: ${r.kept.join(", ")}`);
        assert(!r.notice, `${where}: the page itself is on and must not show the off notice`);
        assert(!r.tabs.some(id => P.ids.includes(id)) && r.tabs.length >= 3, `${where}: visible tabs ${r.tabs.join(", ")}`);
        assert(r.next && !P.ids.includes(r.next) && r.tabs.includes(r.next), `${where}: ArrowRight from #t-pill went to ${r.next}`);
        assert(/1A 15\/50/.test(r.result), `${where}: drug checker result: ${r.result.slice(0, 160)}`);
        const errs = page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && e.url && !e.url.startsWith(base)));
        assert(!errs.length, `${where}: page errors ${JSON.stringify(errs.slice(0, 3))}`);
        await page.close();
      }
    });
  } finally { await browser.close(); }
}
