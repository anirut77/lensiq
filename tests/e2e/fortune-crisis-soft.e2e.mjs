// tests/e2e/fortune-crisis-soft.e2e.mjs — FIXED TEST SET, crisis net round 3 (locked before the change).
// (B) A gentle "are you okay?" step (.fa-soft) is shown BEFORE any reading when a free-text field holds ambiguous distress
// words: "I'd like to talk to someone" shows the support card, "Just the reading" continues to the reading. A plain fortune
// question never sees the step. (A) What was typed is not echoed back verbatim. Also: the step fits a 360 px screen.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const setVal = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const birth = `(() => { const d = document.getElementById("hsDay"), m = document.getElementById("hsMonth"); d.value = d.options[14].value; m.value = m.options[5].value;
  document.getElementById("hsYear").value = "2533"; document.getElementById("hsForm").requestSubmit(); })()`;
const soft = sel => `(() => { const b = document.querySelector(${S(sel)}); return !!b && !!b.querySelector(".fa-soft [data-soft=talk]") && !!b.querySelector(".fa-soft [data-soft=go]"); })()`;
const click = (sel, which) => `document.querySelector(${S(sel + " .fa-soft [data-soft=" + which + "]")}).click()`;
const card = sel => `(() => { const b = document.querySelector(${S(sel)}); return !!b && !!b.querySelector(".fa-support") && /1323/.test(b.textContent); })()`;
const overflow = `document.documentElement.scrollWidth - innerWidth`;
const PHRASE = "เหนื่อยจนทนไม่ไหวแล้ว";

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("horoscope: ambiguous name -> soft step before ANY tab; 'Just the reading' -> reading without echo; 'talk' -> support card", async () => {
      let page = await browser.newPage(null);
      try {
        await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
        await page.goto(`${base}/horoscope.html`);
        await page.evaluate(setVal("hsName", PHRASE)); await page.evaluate(birth);
        await page.waitFor(soft("#hsResult"), 15000);
        const r = await page.evaluate(`(() => ({ others: ["pn-th", "pn-bz", "pn-nu", "pn-td"].map(id => document.getElementById(id).textContent.trim().length),
          sections: document.querySelectorAll(".fa-section").length, sub: document.getElementById("hsResSub").textContent, over: ${overflow} }))()`);
        assert(r.others.every(n => n === 0) && r.sections === 0, "reading shown before the soft step " + S(r));
        assert(r.over <= 0, "soft step overflows 360 px: " + r.over);
        await page.evaluate(click("#hsResult", "go"));
        await page.waitFor(() => document.querySelectorAll("#hsRd .fa-section").length >= 3, 20000);
        const t = await page.evaluate(() => document.getElementById("hsResult").innerText);
        assert(!t.includes(PHRASE), "the typed phrase is echoed in the result");
      } finally { await page.close(); }
      page = await browser.newPage(null);
      try {
        await page.goto(`${base}/horoscope.html`);
        await page.evaluate(setVal("hsName", PHRASE)); await page.evaluate(birth);
        await page.waitFor(soft("#hsResult"), 15000);
        await page.evaluate(click("#hsResult", "talk"));
        await page.waitFor(card("#hsResult"), 5000);
        assert(!(await page.evaluate(() => document.querySelectorAll(".fa-section").length)), "reading under the card");
      } finally { await page.close(); }
    });

    await check("tarot: ambiguous question -> soft step before shuffling; 'Just the reading' shuffles; the question is not echoed; plain question has no step", async () => {
      const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", "en"); } catch (e) {}`] });
      try {
        await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
        await page.goto(`${base}/tarot.html`);
        await page.evaluate(() => { document.getElementById("trQuestion").value = "I can't do this anymore"; document.getElementById("trStart").click(); });
        await page.waitFor(soft("#trSupport"), 5000);
        assert(await page.evaluate(() => document.getElementById("trPick").hidden), "shuffled before the soft step");
        assert((await page.evaluate(overflow)) <= 0, "soft step overflows 360 px");
        await page.evaluate(click("#trSupport", "go"));
        await page.waitFor(() => !document.getElementById("trPick").hidden, 8000);
        await page.evaluate(() => document.getElementById("trAuto").click()); await sleep(900);
        await page.evaluate(() => document.getElementById("trReveal").click());
        await page.waitFor(() => document.querySelectorAll(".fa-section").length >= 3, 25000);
        assert(!(await page.evaluate(() => document.getElementById("trResult").innerText.includes("I can't do this anymore"))), "question echoed in the result");
      } finally { await page.close(); }
      const p2 = await browser.newPage(null);
      try {
        await p2.goto(`${base}/tarot.html`);
        await p2.evaluate(() => { document.getElementById("trQuestion").value = "งานใหม่จะดีไหม"; document.getElementById("trStart").click(); });
        await p2.waitFor(() => !document.getElementById("trPick").hidden, 8000);
        assert(!(await p2.evaluate(() => !!document.querySelector(".fa-soft"))), "soft step on a plain question");
      } finally { await p2.close(); }
    });

    await check("report: ambiguous name -> soft step before the report; 'Just the reading' -> report, name not on the cover; 360 px fits", async () => {
      const page = await browser.newPage(null, { isolated: true });
      try {
        await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
        await page.goto(`${base}/report.html`);
        await page.waitFor(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, 8000);
        await page.evaluate(() => {
          document.getElementById("rpName").value = "หนูกลัว ไม่รู้จะทำยังไง"; document.querySelector('[data-rp-type="report_basic"]').click();
          document.getElementById("rpAYear").value = "2533"; document.getElementById("rpGo").click();
        });
        await page.waitFor(soft("#rpOut"), 8000);
        assert(!(await page.evaluate(() => document.querySelectorAll("#rpOut .rp-part").length)), "report before the soft step");
        assert((await page.evaluate(overflow)) <= 0, "soft step overflows 360 px");
        await page.evaluate(click("#rpOut", "go"));
        await page.waitFor(() => document.querySelectorAll("#rpOut .rp-part").length >= 3, 10000);
        assert(!(await page.evaluate(() => document.getElementById("rpOut").innerText.includes("หนูกลัว"))), "name echoed on the report");
      } finally { await page.close(); }
    });
  } finally {
    await browser.close();
  }
}
