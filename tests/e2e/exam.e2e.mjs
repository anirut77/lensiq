// tests/e2e/exam.e2e.mjs — exam.html (LENSIQ Exam landing): loads without exceptions, honest positioning + "never" list +
// PDPA / AI Act notes + draft pricing present, 0% Thai in 中文 and English, phone layout at 320 / 360 / 390 px.
import { assert, privacyScan } from "./cdp.mjs";
import { exceptions, noThai, phoneAudit, sleep } from "./exam-kit.mjs";

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("exam.html: content, links, 中文/English 0% Thai, phone layout", async () => {
      const page = await browser.newPage(`${base}/exam.html`);
      await page.waitFor("window.LQI18N && document.querySelector('#notice')", 8000);
      await sleep(400);
      const r = await page.evaluate(() => ({
        links: [...document.querySelectorAll("main a.btn")].map(a => a.getAttribute("href")),
        text: document.querySelector("main").innerText
      }));
      for (const h of ["exam-lab.html", "exam-hall.html", "exam-dashboard.html"]) assert(r.links.includes(h), "link to " + h);
      for (const w of ["0 จาก 6", "Ogletree", "Safe Exam Browser", "มาตรา 5(1)(f)", "ภาคผนวก III", "฿15–30", "ร่าง"]) assert(r.text.includes(w), "landing mentions " + w);
      await noThai(page, "exam.html");
      await phoneAudit(page, "exam.html");
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await privacyScan(page);
      await page.close();
    });
  } finally { await browser.close(); }
}
