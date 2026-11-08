// tests/e2e/products.e2e.mjs — the 4-product split: index.html chooser (fortune / retail / HR / creative suite), the
// landing pages retail.html, hr.html, creative-suite.html, and the lead readings on fortune.html.
// Checks: every page loads in TH / EN / 中文 without uncaught errors and with no Thai left in EN/中文 mode for the new
// pd.* text, every same-origin link on the landing pages resolves (no 404), index keeps all previous tool links, the
// fortune hub keeps every reading under "all readings", and team face reading is labelled "for fun, not assessment".
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANDING = ["retail.html", "hr.html", "creative-suite.html"];
// tool links index.html had before the product split — all must stay reachable from the home page
const INDEX_LINKS = ["neuro.html", "creative.html", "signage.html", "customers.html", "booth.html", "fortune.html", "store.html", "insights.html",
  "checkout.html", "photobooth.html", "studio.html", "attendance.html", "qc.html", "driver.html", "converter.html", "cameras.html", "about.html"];

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`products: index chooser + landing pages load (${lang})`, async () => {
        for (const p of ["index.html", ...LANDING, "fortune.html"]) {
          const page = await browser.newPage(null);
          await page.goto(`${base}/${p}?cpu&lang=${lang}`);
          await sleep(900);
          const r = await page.evaluate(() => {
            const pd = [...document.querySelectorAll('[data-i18n^="pd."]')];
            return { title: document.title, pd: pd.length, thai: pd.filter(e => /[฀-๿]/.test(e.textContent)).map(e => e.dataset.i18n).slice(0, 5) };
          });
          assert(r.title && r.pd > 0, `${p}: title + pd.* text (${JSON.stringify(r)})`);
          if (lang !== "th") assert(!r.thai.length, `${p} [${lang}] Thai left in: ${r.thai}`);
          const ex = page.consoleErrors.filter(e => e.kind === "exception");
          assert(!ex.length, `${p}: uncaught ${ex.map(e => e.text).join(" | ")}`);
          await page.close();
        }
      });
    }

    await check("products: index offers the 4 products and keeps every previous tool link", async () => {
      const page = await browser.newPage(`${base}/index.html?cpu&lang=th`);
      const r = await page.evaluate(() => ({
        products: [...document.querySelectorAll("#products .pd-card")].map(a => a.getAttribute("href")),
        lines: [...document.querySelectorAll("#productsNew .pd-card")].map(a => a.getAttribute("href")),
        hrefs: [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href").split("#")[0])
      }));
      assert(r.products.join() === "fortune.html,retail.html,hr.html,creative-suite.html", "chooser: " + r.products);
      assert(r.lines.join() === "exam.html,gate.html,solutions.html", "new product lines (round 13): " + r.lines);
      const missing = INDEX_LINKS.filter(h => !r.hrefs.includes(h));
      assert(!missing.length, "index lost links: " + missing);
      await page.close();
    });

    await check("products: landing-page links resolve; HR practice + for-fun labels; fortune keeps all readings", async () => {
      const seen = new Set();
      for (const p of [...LANDING, "fortune.html", "index.html"]) {
        const page = await browser.newPage(`${base}/${p}?cpu`);
        const links = await page.evaluate(() => [...document.querySelectorAll("main a[href], #products a[href]")].map(a => a.getAttribute("href")));
        for (const h of links) {
          const path = h.split("#")[0].split("?")[0];
          if (!path || /^[a-z]+:/i.test(path) || seen.has(path)) continue;
          seen.add(path);
          const res = await fetch(`${base}/${path}`);
          assert(res.ok, `${p}: link ${h} -> ${res.status}`);
        }
        await page.close();
      }
      const hr = await browser.newPage(`${base}/hr.html?cpu&lang=th`);
      const h = await hr.evaluate(() => ({
        practice: !!document.querySelector('a[href="interview.html?mode=practice"]'),
        team: (document.querySelector('a.pd-card[href="teamface.html"]') || {}).textContent || "",
        sci: document.querySelector('[data-i18n="pd.h.sci"]').textContent
      }));
      assert(h.practice, "hr.html links the candidate practice mode");
      assert(/เพื่อความบันเทิง/.test(h.team) && /ไม่ใช่การประเมิน/.test(h.team), "team face reading labelled for fun: " + h.team);
      assert(/54%/.test(h.sci) && /Bond/.test(h.sci) && /Barrett/.test(h.sci), "scientific caveat with citations");
      await hr.close();
      const ft = await browser.newPage(`${base}/fortune.html?cpu&lang=th`);
      const f = await ft.evaluate(() => ({
        lead: document.querySelectorAll(".pd-lead .pd-card").length,
        all: document.querySelectorAll(".ft-grid .ft-card").length,
        team: (document.querySelector(".pd-team") || {}).textContent || "",
        teamLink: !!document.querySelector('.pd-team a[href="teamface.html"]')
      }));
      assert(f.lead === 5, "5 lead readings: " + f.lead);
      assert(f.all >= 14, "all readings kept: " + f.all);
      assert(f.teamLink && /ไม่ใช่การประเมิน/.test(f.team), "fortune hub links team face reading as not an assessment");
      await ft.close();
    });

    await check("products: one-pager contact block (honest without seller details) + print button, in TH / EN / 中文", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const pg = await browser.newPage(`${base}/retail.html?cpu&lang=${lang}`);
        await pg.waitFor(() => document.querySelector("[data-pd-seller] .pd-contact-pend a[href='index.html?interest=store#contact']") && (document.documentElement.lang || "").slice(0, 2) === (location.search.match(/lang=(\w\w)/) || [])[1], 8000);
        const r = await pg.evaluate(() => ({ print: !!document.querySelector("button[data-pd-print]"), text: document.querySelector(".pd-contact").innerText, mail: !!document.querySelector(".pd-contact-dl a[href^='mailto:']") }));
        assert(r.print && !r.mail, lang + ": " + JSON.stringify(r)); // nothing invented: only the site address until LENSIQ_SELLER is filled
        if (lang !== "th") assert(!/[฀-๿]/.test(r.text), lang + ": Thai in the contact block: " + r.text);
        await pg.close();
      }
      const pg = await browser.newPage(null, { initScripts: [`window.LENSIQ_SELLER = { name: "LENSIQ Test Co.", email: "sales@example.test", line: "@lensiqtest" };`] });
      await pg.goto(`${base}/hr.html?cpu&lang=en`);
      await pg.waitFor(() => document.querySelector('.pd-contact-dl a[href="mailto:sales@example.test"]'), 8000);
      const c = await pg.evaluate(() => ({ dt: [...document.querySelectorAll(".pd-contact-dl dt")].map(x => x.textContent), pend: !!document.querySelector(".pd-contact-pend") }));
      assert(c.dt.join() === "Provider,E-mail,LINE,Website" && !c.pend, JSON.stringify(c));
      await pg.close();
    });
  } finally { await browser.close(); }
}
