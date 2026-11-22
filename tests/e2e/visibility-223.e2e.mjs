// tests/e2e/visibility-223.e2e.mjs — owner decision 226 (entries 13-15, inside decision 223), browser half of the locked
// contract tests/unit/accuracy-removal-223.test.js R9 / R5 (re-lock 3). FIXED TEST, locked before the product change.
//   V1 a product switched off in the nav.js visibility list (exam-hall, signage, neuro, teamface, customers; re-lock 4: plus the part product-check) is not
//      reachable from anything a customer sees at 360 px: the menu, the home page, the solutions catalogue, the cameras
//      directory and every category page (no visible link to it)
//   V2 its direct URL shows ONLY the approved sentence "ระบบนี้ยังไม่เปิดให้บริการ · This service is not available yet. ·
//      此服务尚未开放。" and a visible link to the home page, in TH / EN / ZH; no other visible text, no camera request
//   V3 no status label or status filter is visible on the pages a customer lands on (TH / EN / ZH)
//   V4 an on product (crowd.html) opens normally and keeps its two plain lines and the dense-crowd limit
// RE-LOCK 5 (review round 3): new first check "V1 (re-lock 5)": every page of the site (all root *.html but the off
//   pages), every rendered link (DOM after scripts), TH / EN / ZH; the listing-page V1 + V3 check below is kept as it was.
// RE-LOCK 4 (coordinator decision 2026-11-22 on owner entry 13, reversible by the owner): Product Check is the part
// "product-check" of medicine.html (the "ตรวจสินค้า" tab), not the whole page; medicine.html (the drug checker) is on.
//   V2 runs on the switched-off PAGES (the off list minus its parts); new V5: on medicine.html (TH / EN / ZH, 360 px) the
//      Product Check tab and panel are not rendered (also with #t-pc / #tab-pc in the URL), the drug checker is shown and
//      works offline (registration number 1A 15/50 parsed), the arrow keys skip the hidden tab, no page error, no off notice
// RE-LOCK 6 (independent review follow-up, 2026-11-22): V1 (re-lock 5) also fails when the RENDERED VISIBLE text of a page
//   (innerText after scripts, TH / EN / ZH) names a switched-off product (spec.offNames: nav.js titles + the short names the
//   pages used; generic negations such as "ไม่วิเคราะห์อารมณ์" excluded by the pattern; terms.html, privacy.html and
//   camera-notice.html excluded with the reason in the spec). New V6: the same text check with sample data loaded and every
//   fold opened: insights (its sample data incl. the signage, emotion-test and customer data, every range preset, every card),
//   the exam dashboard (?demo=1 sample data; the intro names no hall camera) and help.html (the interview-kit FAQ is shown,
//   its guidance lines kept, the team-face line not shown).
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC = JSON.parse(readFileSync(join(repo, "tests", "unit", "accuracy-removal-223.spec.json"), "utf8"));
const PARTS = SPEC.visibility.parts || {};
const OFF = SPEC.visibility.off.filter(o => !PARTS[o]), SENTENCE = SPEC.visibility.sentence;
const LABELS = SPEC.labelBanned.map(b => new RegExp(b.re, b.flags || ""));
// re-lock 6: names of the switched-off products in rendered visible text
const NAMES = Object.entries(SPEC.offNames.names).flatMap(([p, l]) => l.map(x => ({ p, re: new RegExp(x.re, x.flags || "") })));
const TEXT_EXCLUDE = SPEC.offNames.textExcludePages;
const namesIn = t => NAMES.filter(n => n.re.test(t)).map(n => `${n.p} «${(t.match(n.re) || [""])[0]}» …${t.slice(Math.max(0, t.search(n.re) - 40), t.search(n.re) + 40).replace(/\s+/g, " ")}…`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const PAGES = ["index.html", "solutions.html", "cameras.html", "cat-security.html", "cat-education.html", "cat-hr.html", "cat-marketing.html",
  "cat-health.html", "cat-studio.html", "crowd.html", "exam.html", "help.html"];
// re-lock 5 (review round 3): V1 runs on EVERY page of the site (all root *.html except the switched-off pages, whose
// direct URL is V2) and counts every RENDERED link (in the DOM after the page's scripts ran, open or closed, visible or
// not), not only the static markup: a link to a switched-off product is allowed only inside an element nav.js hides
// (data-lq-off / data-lq-part of an off part)
const ALL = readdirSync(repo).filter(f => /^[^/]+\.html$/.test(f) && !OFF.includes(f.replace(/\.html$/, ""))).sort();

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("V1 (re-lock 5): no rendered link to a switched-off product on any page of the site (360 px, TH / EN / ZH)", async () => {
      assert(ALL.length >= 70, "pages: " + ALL.length);
      const page = await browser.newPage(null, { offNotice: true });
      await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
      for (const lang of LANGS) for (const p of ALL) {
        await page.goto(`${base}/${p}?lang=${lang}`);
        await sleep(1200);
        const r = await page.evaluate(off => {
          const hit = a => { const h = (a.getAttribute("href") || "").split(/[?#]/)[0].replace(/^.*\//, ""); return off.some(o => h === o + ".html"); };
          const links = [...document.querySelectorAll("a[href]")].filter(hit);
          return { menu: links.filter(a => a.closest("#siteNav")).map(a => a.getAttribute("href")),
            rendered: links.filter(a => !a.closest("[data-lq-off]")).map(a => a.getAttribute("href") + " «" + (a.textContent || "").trim().slice(0, 40) + "»"),
            text: document.body.innerText };
        }, OFF);
        assert(!r.menu.length, `${p} ${lang}: the menu links to a switched-off product: ${r.menu.join(", ")}`);
        assert(!r.rendered.length, `${p} ${lang}: rendered link to a switched-off product: ${r.rendered.join(", ")}`);
        if (!TEXT_EXCLUDE.includes(p)) { const hit = namesIn(r.text); assert(!hit.length, `${p} ${lang}: visible text names a switched-off product: ${hit.join(" | ")}`); }
      }
      await page.close();
    });

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

    await check("V6 (re-lock 6): with sample data and every fold open, insights, the exam dashboard and help name no switched-off product (360 px, TH / EN / ZH)", async () => {
      const page = await browser.newPage(null, { offNotice: true });
      await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
      const openAll = () => { document.querySelectorAll("details").forEach(d => { d.open = true; }); };
      const F = SPEC.followup223;
      for (const lang of LANGS) {
        // insights: its own sample data (booth, store, signage, emotion tests, customers, checkout …)
        await page.goto(`${base}/insights.html?lang=${lang}`);
        await page.waitFor(`window.__IQ && window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k !== "lq-lang") localStorage.removeItem(k); });
        await page.goto(`${base}/insights.html?lang=${lang}`);
        await page.waitFor(`window.__IQ && document.getElementById("seedDemoEmpty")`, 8000);
        await page.evaluate(() => document.getElementById("seedDemoEmpty").click());
        await page.waitFor(`document.querySelectorAll("#insightCards .ins").length >= 4`, 8000);
        const seeded = await page.evaluate(() => ["sg-stats", "nm-sessions", "cx-members"].filter(k => localStorage.getItem(k)));
        assert(seeded.length === 3, `insights ${lang}: the sample data holds the signage, emotion-test and customer data (${seeded.join(", ")})`);
        for (const pr of ["today", "d7", "d30", "d90", "all"]) {
          await page.evaluate(p => document.querySelector(`.range button[data-p="${p}"]`).click(), pr);
          await sleep(250);
          await page.evaluate(() => { const m = document.getElementById("insightMore"); if (m && m.offsetParent) m.click(); });
          await sleep(150);
          await page.evaluate(openAll);
          const r = await page.evaluate(off => ({ text: document.body.innerText, ab: !document.getElementById("abCard").hidden,
            links: [...document.querySelectorAll("a[href]")].map(a => (a.getAttribute("href") || "").split(/[?#]/)[0]).filter(h => off.some(o => h === o + ".html")),
            cards: __IQ.last.cards.map(c => c.id) }), OFF);
          const hit = namesIn(r.text);
          assert(!hit.length, `insights ${lang} ${pr}: visible text names a switched-off product: ${hit.join(" | ")}`);
          assert(!r.ab, `insights ${lang} ${pr}: the A/B card (signage / emotion tests only) is shown`);
          assert(!r.links.length, `insights ${lang} ${pr}: link to a switched-off product: ${r.links.join(", ")}`);
          assert(!r.cards.some(id => /^ab-sg|^abn|^sg|^cx|^neuro/.test(id)), `insights ${lang} ${pr}: card of a switched-off page: ${r.cards.join(", ")}`);
        }
        await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k !== "lq-lang") localStorage.removeItem(k); });
        // exam dashboard: the demo sample data (?demo=1) and the intro
        await page.goto(`${base}/exam-dashboard.html?demo=1&lang=${lang}`);
        await page.waitFor(`window.__LQ_EXAM_DB && window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await sleep(600);
        await page.evaluate(openAll);
        const d = await page.evaluate(() => ({ text: document.body.innerText, lead: (document.querySelector("[data-i18n='exam.db.lead']") || {}).textContent }));
        assert(d.lead === F.examDbLead[lang], `exam-dashboard ${lang}: intro "${d.lead}"`);
        const dh = namesIn(d.text);
        assert(!dh.length, `exam-dashboard ${lang} (sample data): visible text names a switched-off product: ${dh.join(" | ")}`);
        // help: the interview-kit FAQ of this language is shown; its guidance lines kept; the team-face line not shown
        await page.goto(`${base}/help.html?lang=${lang}`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}" && document.readyState === "complete"`, 8000);
        await sleep(300);
        await page.evaluate(openAll);
        const h = F.help.find(x => x.id === (lang === "th" ? "h-hr" : lang + "-h-hr"));
        const e = await page.evaluate(id => { const el = document.getElementById(id); return el ? { shown: el.getClientRects().length > 0, text: el.innerText, all: document.body.innerText } : null; }, h.id);
        assert(e && e.shown, `help ${lang}: #${h.id} is shown`);
        assert(e.text.includes(h.summary), `help ${lang}: #${h.id} summary: ${e.text.slice(0, 120)}`);
        for (const k of h.keep) assert(e.text.includes(k.replace(/<[^>]+>/g, "")), `help ${lang}: #${h.id} keeps "${k}"`);
        assert(!e.text.includes(h.hide), `help ${lang}: #${h.id} shows the team-face line`);
        const hh = namesIn(e.all);
        assert(!hh.length, `help ${lang} (every fold open): visible text names a switched-off product: ${hh.join(" | ")}`);
      }
      await page.close();
    });
  } finally { await browser.close(); }
}
