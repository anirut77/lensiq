// tests/e2e/exam-pages-webkit.e2e.mjs — Exam lab acceptance sheet (docs/acceptance/exam-lab.md, locked 2026-11-18)
// criterion P3 "also for exam.html and the dashboard": their main flow in WebKit (the iOS Safari engine) at iPhone width
// (390 px, touch, mobile user agent). FIXED TEST written and locked (evals-locks/examlab-90.sha256) BEFORE any product
// change of branch examlab-90 (base origin/main a9950944). exam-lab.html itself is covered by phone-webkit-b.
// Pass rule per flow (tests/e2e/phone-kit.mjs): loads, the main action works, no page error, no crash, no reload, no
// horizontal overflow at 390 px; every tap is a real touch tap on a visible control.
//   exam.html       the landing: the three product links and the quote link are visible and their pages answer 200;
//                   tap the language menu to English -> no Thai letter in <main>
//   exam-dashboard  join a room with the invigilator's name -> tap "demo: simulate events" -> 5 flags in the queue ->
//                   tap "going" on the phone flag (recorded with the name) -> tap CSV (a file with the header and rows) ->
//                   tap the printed report (rows, "not evidence of cheating" line)
// No camera; no photo of a person.
import { assert } from "./cdp.mjs";
import { flow, launchWebKit, setVal, sleep, waitFor } from "./phone-kit.mjs";

const CAPTURE = `window.__dl = []; window.__printed = false;
  window.addEventListener("DOMContentLoaded", () => { HTMLAnchorElement.prototype.click = function () { window.__dl.push({ name: this.download, href: this.href }); }; });
  window.print = () => { window.__printed = true; };`;

export default async function ({ base, check }) {
  const browser = await launchWebKit();
  try {
    await flow(check, browser, "exam.html: links visible and answering, English with no Thai", `${base}/exam.html`, {}, async ({ page }) => {
      await waitFor(page, () => !!(window.LQI18N && document.querySelector("#examClaims")), null, 10000);
      const links = await page.evaluate(() => [...document.querySelectorAll("main a.btn")].filter(a => {
        const r = a.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && getComputedStyle(a).visibility !== "hidden";
      }).map(a => a.getAttribute("href")));
      for (const h of ["exam-lab.html", "exam-hall.html", "exam-dashboard.html", "index.html?interest=exam#contact"]) assert(links.includes(h), "visible link to " + h + ": " + links.join(","));
      for (const h of ["exam-lab.html", "exam-hall.html", "exam-dashboard.html"]) {
        const s = await page.evaluate(async u => (await fetch(u, { cache: "no-store" })).status, h);
        assert(s === 200, h + " answers " + s);
      }
      await page.evaluate(() => window.LQI18N.setLang("en"));
      await waitFor(page, () => window.LQI18N.lang === "en", null, 5000);
      await sleep(900);
      // Thai letters only: the baht sign (U+0E3F, in the Thai block) is a currency symbol and stays in English prices
      const thai = await page.evaluate(() => (document.querySelector("main").innerText.match(/[\u0E01-\u0E3A\u0E40-\u0E5B]/g) || []).length);
      assert(thai === 0, "exam.html in English still has " + thai + " Thai letters");
    });

    await flow(check, browser, "exam-dashboard: join, demo flags, act with a name, CSV, printed report", `${base}/exam-dashboard.html`,
      { init: [CAPTURE] }, async ({ page }) => {
        await waitFor(page, () => !!(window.__LQ_EXAM_DB && window.LQI18N), null, 10000);
        await setVal(page, "#room", "IPH1"); await setVal(page, "#who", "อ.ทดสอบ"); await setVal(page, "#seatRange", "1-10");
        await page.locator("#joinForm [type=submit]").first().tap();
        await waitFor(page, () => window.__LQ_EXAM_DB.room === "IPH1", null, 5000);
        await page.locator("#demoBtn").tap();
        await waitFor(page, () => window.__LQ_EXAM_DB.room === "IPH1" && document.querySelectorAll("#queue .alert").length === 5, null, 6000); // into the open room
        await setVal(page, "#who", "อ.ทดสอบ");
        const phone = page.locator("#queue .alert", { hasText: "โทรศัพท์" }).first();
        await phone.locator("[data-act=going]").tap();
        await waitFor(page, () => window.__LQ_EXAM_DB.board.alerts.some(a => a.sig === "phone" && a.status === "going" && a.acts[0].who === "อ.ทดสอบ"), null, 5000);
        await page.locator("#csvBtn").tap();
        await waitFor(page, () => window.__dl.length >= 1, null, 5000);
        const csv = await page.evaluate(async () => (await fetch(window.__dl[0].href)).text());
        const lines = csv.replace(/^﻿/, "").split("\r\n");
        assert(/^เวลา,ห้อง,ที่นั่ง/.test(lines[0]) && lines.length >= 6, "CSV header + rows: " + lines.slice(0, 2).join(" / "));
        assert(lines.some(l => /อ\.ทดสอบ/.test(l)), "CSV records who checked");
        await page.locator("#printBtn").tap();
        await waitFor(page, () => window.__printed === true, null, 5000);
        const rep = await page.evaluate(() => ({ rows: document.querySelectorAll("#report tbody tr").length, text: document.querySelector("#report").innerText }));
        assert(rep.rows >= 5 && /ไม่ใช่หลักฐานการทุจริต/.test(rep.text), "report: " + rep.rows + " rows");
      });
  } finally { await browser.close(); }
}
