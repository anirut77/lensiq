// tests/e2e/phone-webkit-a.e2e.mjs — REAL-PHONE QUALITY, part A (stream B, 2026-11-13): the home page and the fortune
// pages on WebKit (the iOS Safari engine) at iPhone width (390 px, touch, mobile user agent). FIXED TEST written and
// locked (~/LENSIQ-field/evals/phone-quality/locked.sha256) before any product change of the stream.
// Pass rule per flow (tests/e2e/phone-kit.mjs): loads, the main action works, no page error, no crash, no reload, no
// horizontal overflow. The quote form itself is covered by tests/e2e/lead-form-webkit.e2e.mjs (team A1), not repeated here.
//   home       index.html: heading + category links, the menu opens and closes by tap, the contact section is there
//   tarot      three-card love spread: shuffle, auto-pick, reveal -> a reading of >= 3 sections
//   horoscope  birth date 15/8/1990 -> a reading of >= 3 sections
//   zodiac     year of the horse -> a reading of >= 3 sections
//   faceread   fake camera + scripted face (?cpu&fakedet): camera starts, read -> a reading of >= 3 sections
// Synthetic input only (typed dates, a canvas camera); no photo of a person.
import { assert } from "./cdp.mjs";
import { flow, launchWebKit, setVal, sleep, waitFor } from "./phone-kit.mjs";

/** in-page predicate: at least n reading sections, none still "composing" */
const SECTIONS = n => { const s = [...document.querySelectorAll(".fa-section, .fs-sec")]; return s.length >= n && !s.some(x => /กำลังเรียบเรียง/.test(x.textContent)); };
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const DETS = `window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d));`;

export default async function ({ base, check, fakeCams }) {
  const browser = await launchWebKit();
  try {
    await flow(check, browser, "home: loads, menu opens and closes by tap, contact section present", `${base}/index.html`, {}, async ({ page }) => {
      const r = await page.evaluate(() => ({ h1: (document.querySelector("h1") || {}).textContent || "", contact: !!document.getElementById("contact"),
        cards: document.querySelectorAll("a[href^='cat-']").length }));
      assert(r.h1.trim().length > 3 && r.contact && r.cards >= 7, "home content " + JSON.stringify(r));
      await page.locator("button.nav-toggle").tap();
      await waitFor(page, () => document.querySelector("button.nav-toggle").getAttribute("aria-expanded") === "true", null, 5000);
      await page.locator("button.nav-toggle").tap();
      await waitFor(page, () => document.querySelector("button.nav-toggle").getAttribute("aria-expanded") === "false", null, 5000);
    });

    await flow(check, browser, "tarot: three-card spread -> reading", `${base}/tarot.html`, {}, async ({ page }) => {
      await page.evaluate(() => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); });
      await page.locator("#trStart").tap();
      await sleep(600);
      await page.locator("#trAuto").tap();
      await sleep(900);
      await page.locator("#trReveal").tap();
      await waitFor(page, SECTIONS, 3, 25000);
    });

    await flow(check, browser, "horoscope: birth date -> reading", `${base}/horoscope.html`, {}, async ({ page }) => {
      await setVal(page, "#hsDay", "15"); await setVal(page, "#hsMonth", "8"); await setVal(page, "#hsYear", "1990");
      await page.locator("#hsGo").tap();
      await waitFor(page, SECTIONS, 3, 20000);
    });

    await flow(check, browser, "zodiac: year animal -> reading", `${base}/zodiac.html`, {}, async ({ page }) => {
      await page.evaluate(() => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); });
      await waitFor(page, SECTIONS, 3, 15000);
    });

    await flow(check, browser, "faceread: fake camera + scripted face -> reading", `${base}/faceread.html?cpu&fakedet`, { cams: fakeCams, init: [DETS] }, async ({ page }) => {
      await page.locator("#frStartCam").tap();
      await waitFor(page, () => !document.getElementById("frRead").hidden && !!document.querySelector("#frCam.live"), null, 15000);
      await page.evaluate(d => { window.__dets = d; }, [FACE]);
      await waitFor(page, () => !document.getElementById("frRead").disabled, null, 10000);
      await page.locator("#frRead").tap();
      await waitFor(page, () => !document.getElementById("frResult").hidden, null, 25000);
      await waitFor(page, SECTIONS, 3, 25000);
    });
  } finally { await browser.close(); }
}
