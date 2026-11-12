// tests/e2e/fortune-straight.e2e.mjs — FIXED TEST SET (owner order 2026-11-12 Part C, locked before building; see
// tests/unit/fortune-honest.test.js). The "read it straight / ดูตรง ๆ / 直说" choice on a real fortune page:
//   * shipped config (flag false): no control is drawn and the reading is gentle
//   * flag on (forced by an init script, the shipped file is untouched): the control appears with the reading; straight
//     cannot be chosen before the adult confirmation; after confirming, the next reading is straight (plain negative words)
//     and the choice is remembered after a reload; un-ticking "straight" gives the gentle reading again
//   * the crisis net still comes first with straight on (tarot question box shows the support card)
//   * the control's text is shown in English and Chinese
import { assert } from "./cdp.mjs";

const FLAG_ON = `Object.defineProperty(window, "LENSIQ_FORTUNE_STRAIGHT", { configurable: true, get: () => true, set: () => {} });`;
const lang = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const ADULT = `try { localStorage.setItem("lq-fortune-straight", JSON.stringify({ adult: true, straight: true })); } catch (e) {}`;
const READY = () => document.querySelectorAll(".fa-section").length >= 3 && ![...document.querySelectorAll(".fa-section")].some(s => /กำลังเรียบเรียง/.test(s.textContent));
const READ = () => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); };
const STATE = () => {
  const c = document.querySelector(".fa-straight"), sec = document.querySelector(".fa-section");
  const host = sec && sec.closest("[data-fa-mode]");
  const a = c && c.querySelector('[data-fs="adult"]'), s = c && c.querySelector('[data-fs="straight"]');
  return { control: !!c, text: c ? c.textContent : "", adult: a ? a.checked : null, straight: s ? s.checked : null, straightDisabled: s ? s.disabled : null,
    mode: host ? host.getAttribute("data-fa-mode") : "", reading: [...document.querySelectorAll(".fa-section")].map(x => x.textContent).join(" ") };
};
const PLAIN_TH = /ดวง(?:การเงิน|การงาน|ความรัก|โดยรวม)?(?:ตก|อ่อน)|ช่วงอ่อน|อุปสรรค|เสียเงิน|ขัดแย้ง|ทะเลาะ|คนไม่หวังดี|ติดขัด|สูญเสีย/;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    // re-lock 2026-11-12 (2): switched OFF again after the failed fresh crisis review — back to the original assertion
    await check("shipped config: no straight control, gentle reading", async () => {
      const page = await browser.newPage(null);
      try {
        await page.goto(`${base}/zodiac.html`);
        await page.evaluate(READ); await page.waitFor(READY, 15000);
        const s = await page.evaluate(STATE);
        assert(!s.control, "control drawn with the flag off");
        assert(s.mode !== "straight", "mode " + s.mode);
        assert(await page.evaluate(() => window.LENSIQ_FORTUNE_STRAIGHT === false), "config flag is false");
      } finally { await page.close(); }
    });

    await check("flag on: adult confirmation first, then straight by default, remembered after reload, gentle again when un-ticked", async () => {
      const page = await browser.newPage(null, { initScripts: [FLAG_ON] });
      try {
        await page.goto(`${base}/zodiac.html`);
        await page.evaluate(READ); await page.waitFor(READY, 15000);
        let s = await page.evaluate(STATE);
        assert(s.control && /ดูตรง ๆ/.test(s.text), "control shown: " + s.text.slice(0, 80));
        assert(s.adult === false && s.straightDisabled === true, "straight locked before the adult confirmation: " + JSON.stringify(s).slice(0, 200));
        assert(s.mode === "gentle", "no confirmation → gentle: " + s.mode);
        await page.evaluate(() => { const a = document.querySelector('.fa-straight [data-fs="adult"]'); a.click(); });
        await page.evaluate(READ); await page.waitFor(() => document.querySelector("[data-fa-mode=straight] .fa-section"), 15000); await page.waitFor(READY, 15000);
        s = await page.evaluate(STATE);
        assert(s.mode === "straight" && s.straight === true, "after confirming: straight by default: " + s.mode);
        assert(PLAIN_TH.test(s.reading), "plain negative in the straight reading: " + s.reading.slice(0, 160));
        await page.goto(`${base}/zodiac.html`);
        await page.evaluate(READ); await page.waitFor(READY, 15000);
        s = await page.evaluate(STATE);
        assert(s.adult === true && s.mode === "straight", "remembered after reload: " + JSON.stringify({ adult: s.adult, mode: s.mode }));
        await page.evaluate(() => { document.querySelector('.fa-straight [data-fs="straight"]').click(); });
        await page.evaluate(READ); await page.waitFor(() => document.querySelector("[data-fa-mode=gentle] .fa-section"), 15000); await page.waitFor(READY, 15000);
        s = await page.evaluate(STATE);
        assert(s.mode === "gentle" && s.straight === false, "un-ticked → gentle: " + s.mode);
      } finally { await page.close(); }
    });

    await check("flag on + straight chosen: the crisis net still shows the support card (tarot question box)", async () => {
      const page = await browser.newPage(null, { initScripts: [FLAG_ON, ADULT] });
      try {
        await page.goto(`${base}/tarot.html`);
        for (const q of ["ช่วงนี้อยากตาย ดวงจะดีขึ้นไหม", "I want to end my life", "活着好累"]) {
          await page.evaluate(q2 => { document.getElementById("trQuestion").value = q2; document.getElementById("trStart").click(); }, q);
          await page.waitFor(() => { const b = document.getElementById("trSupport"); return !!b && !b.hidden && /1323/.test(b.textContent); }, 5000);
          assert(await page.evaluate(() => document.getElementById("trPick").hidden), q + ": no shuffle");
        }
      } finally { await page.close(); }
    });

    for (const [l, re] of [["en", /Read it straight/], ["zh", /直说/]]) {
      await check(`flag on: the control is shown in ${l}`, async () => {
        const page = await browser.newPage(null, { initScripts: [FLAG_ON, lang(l)] });
        try {
          await page.goto(`${base}/zodiac.html`);
          await page.evaluate(READ); await page.waitFor(READY, 15000);
          const s = await page.evaluate(STATE);
          assert(s.control && re.test(s.text) && !/[฀-๿]/.test(s.text), l + ": " + s.text.slice(0, 120));
        } finally { await page.close(); }
      });
    }
  } finally {
    await browser.close();
  }
}
