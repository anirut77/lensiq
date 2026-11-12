// tests/e2e/fortune-crisis-fields-2.e2e.mjs — FIXED TEST SET, crisis net amendment 2 (independent re-measure 2026-11-12;
// locked before the fix). In the browser, spaced Chinese (我 想 死) and letter-spaced English (I w a n t t o d i e) gave full
// readings; the horoscope partner name (hsPName) and name-number (hsNameNum) fields were never checked; and when the card
// showed on horoscope, the other tabs still rendered (~1,400 chars) and the subtitle echoed the typed phrase.
// Checks: horoscope name (card replaces EVERY tab, nothing echoed), partner name, name-number field, tarot question,
// report name, numbers name; plus a benign name ("my mom hit me with a surprise party") still gets a normal reading.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const setVal = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const card = sel => `(() => { const b = document.querySelector(${S(sel)}); return !!b && !!b.querySelector(".fa-support") && /1323/.test(b.textContent); })()`;
const birth = `(() => { const d = document.getElementById("hsDay"), m = document.getElementById("hsMonth"); d.value = d.options[14].value; m.value = m.options[5].value;
  document.getElementById("hsYear").value = "2533"; document.getElementById("hsForm").requestSubmit(); })()`;
const partner = `(() => { const d = document.getElementById("hsPDay"), m = document.getElementById("hsPMonth"); d.value = d.options[3].value; m.value = m.options[2].value;
  document.getElementById("hsPYear").value = "2535"; document.getElementById("hsPartner").requestSubmit(); })()`;
const PHRASES = ["I w a n t t o d i e", "我 想 死", "我 不想 活 了", "อยาก ตาย", "k1ll mys3lf"];

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("horoscope name: spaced / letter-spaced / leet phrases show the card; every other tab is empty and the phrase is not echoed", async () => {
      for (const q of PHRASES) {
        const page = await browser.newPage(null);
        try {
          await page.goto(`${base}/horoscope.html`);
          await page.evaluate(setVal("hsName", q)); await page.evaluate(birth);
          await page.waitFor(card("#hsRd"), 15000); await sleep(300);
          const r = await page.evaluate(`(() => ({ others: ["pn-th", "pn-bz", "pn-nu", "pn-td"].map(id => (document.getElementById(id) || { textContent: "" }).textContent.trim().length),
            sections: document.querySelectorAll(".fa-section").length, compat: document.getElementById("hsCompat").textContent.length,
            sub: document.getElementById("hsResSub").textContent, body: document.body.innerText }))()`);
          assert(r.others.every(n => n === 0), q + ": other tabs still render " + S(r.others));
          assert(r.sections === 0 && r.compat === 0, q + ": reading content " + S({ s: r.sections, c: r.compat }));
          assert(!r.sub.includes(q.slice(0, 4)), q + ": subtitle echoes the phrase: " + r.sub);
        } finally { await page.close(); }
      }
    });

    await check("horoscope partner name and name-number field: a crisis phrase shows the card (no compatibility, no name sum)", async () => {
      for (const q of ["I want to die", "我 想 死", "อยากตาย"]) {
        const page = await browser.newPage(null);
        try {
          await page.goto(`${base}/horoscope.html`);
          await page.evaluate(setVal("hsName", "Somchai")); await page.evaluate(birth);
          await page.waitFor(() => document.querySelectorAll("#hsRd .fa-section").length >= 3, 20000);
          await page.evaluate(setVal("hsPName", q)); await page.evaluate(partner);
          await page.waitFor(card("#hsCompat"), 5000);
          assert(!(await page.evaluate(() => document.querySelectorAll("#hsCompat .compat").length)), q + ": compatibility still shown");
          await page.evaluate(setVal("hsPName", "")); await page.evaluate(setVal("hsNameNum", q));
          await page.waitFor(card("#hsNameOut"), 5000);
          assert(!(await page.evaluate(() => !!document.querySelector("#hsNameOut .namesum"))), q + ": name sum still shown");
        } finally { await page.close(); }
      }
    });

    await check("tarot question, report name, numbers name: letter-spaced and spaced phrases show the card", async () => {
      let page = await browser.newPage(null);
      try {
        await page.goto(`${base}/tarot.html`);
        for (const q of ["I w a n t t o d i e", "我 想 死"]) {
          await page.evaluate(q2 => { document.getElementById("trQuestion").value = q2; document.getElementById("trStart").click(); }, q);
          await page.waitFor(() => { const b = document.getElementById("trSupport"); return !!b && !b.hidden && /1323/.test(b.textContent); }, 5000);
          assert(await page.evaluate(() => document.getElementById("trPick").hidden), q + ": tarot shuffled");
        }
      } finally { await page.close(); }
      page = await browser.newPage(null, { isolated: true });
      try {
        await page.goto(`${base}/report.html`);
        await page.waitFor(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, 8000);
        await page.evaluate(() => {
          document.getElementById("rpName").value = "我 想 死"; document.querySelector('[data-rp-type="report_basic"]').click();
          document.getElementById("rpAYear").value = "2533"; document.getElementById("rpGo").click();
        });
        await page.waitFor(card("#rpOut"), 10000);
        assert(!(await page.evaluate(() => document.querySelectorAll("#rpOut .rp-part").length)), "report parts under the card");
      } finally { await page.close(); }
      page = await browser.newPage(null);
      try {
        await page.goto(`${base}/numbers.html`);
        await page.evaluate(setVal("nmName", "I w a n t t o d i e"));
        await page.evaluate(() => { document.getElementById("nmPhone").value = "0823456789"; document.getElementById("nmGo").click(); });
        await page.waitFor(card("#nmNarr"), 10000);
      } finally { await page.close(); }
    });

    await check("benign: 'my mom hit me with a surprise party' as a name still gets a normal horoscope reading", async () => {
      const page = await browser.newPage(null);
      try {
        await page.goto(`${base}/horoscope.html`);
        await page.evaluate(setVal("hsName", "my mom hit me with a surprise party")); await page.evaluate(birth);
        await page.waitFor(() => document.querySelectorAll("#hsRd .fa-section").length >= 3, 20000);
        assert(!(await page.evaluate(() => !!document.querySelector(".fa-support"))), "false trigger");
      } finally { await page.close(); }
    });
  } finally {
    await browser.close();
  }
}
