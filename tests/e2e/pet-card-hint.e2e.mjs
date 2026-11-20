// tests/e2e/pet-card-hint.e2e.mjs — FIXED TEST SET, owner decision 198 (2026-11-20), headless Chrome.
// The hint under the pet card options (the paragraph right after the photo / QR option labels) must not mention a QR code while
// the QR option is hidden (window.LENSIQ_CARD_SHOW_ADDRESS false, the default): then it says the option is off by default and that
// the photo is made on this device and never sent. With the switch on (test only) the QR option shows again and the old two-option
// text returns. Locked in evals-locks/pet-card-address.sha256, folder relock-2/, BEFORE the product change. Node half:
// tests/unit/pet-card-hint.test.js. Synthetic only; no photo.
// (re-locked as relock-3: the card section shows only after a reading, so each page first runs one reading and the hint and the
// QR option are checked as VISIBLE; the first version checked a hidden section. No product code was changed in between.)
//   H1  switch off: TH / EN / ZH hint = the exact new text; no "QR" / "二维码" in it; the QR option is not visible
//   H2  switch on: TH / EN / ZH hint = the old two-option text; the QR option is visible
//   H3  switch off, language switched at run time (th -> en -> zh -> th): the hint follows with the exact new text each time
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";

const PET = { cls: 15, score: 0.91, x: 0.2, y: 0.15, w: 0.5, h: 0.7 };
const DET = `window.__PET_DETS = ${JSON.stringify([PET])}; window.__LQ_FAKE_DET = function (key) { return key === "pet" ? window.__PET_DETS : []; };`;
const SHOW = `window.LENSIQ_CARD_SHOW_ADDRESS = true;`;
const LANG = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const LANGS = ["th", "en", "zh"];
const NEW = {
  th: "ตัวเลือกนี้ปิดไว้ก่อน รูปสร้างในเครื่อง ไม่ถูกส่งออกไปที่ใด",
  en: "This is off by default. The photo is made on this device and never sent.",
  zh: "此项默认关闭。照片在本设备生成，不会被发送。",
};
const OLD = {
  th: "ทั้งสองข้อปิดไว้ก่อน รูปและ QR สร้างในเครื่อง ไม่ถูกส่งออก",
  en: "Both are off by default. The photo and the QR code are made on this device and never sent.",
  zh: "两项默认关闭。照片和二维码都在本设备生成，不会被发送。",
};
const HINT = `(() => { const q = document.getElementById("petQrOn"); const lb = q && q.closest("label"); const p = lb && lb.nextElementSibling;
  return p ? p.textContent.replace(/\\s+/g, " ").trim() : null; })()`;
const vis = sel => `(() => { const e = ${sel}; if (!e) return false; const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return !e.closest("[hidden]") && cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0; })()`;
const HINTVIS = vis(`(() => { const q = document.getElementById("petQrOn"); const lb = q && q.closest("label"); return lb && lb.nextElementSibling; })()`);
const QRVIS = `(() => { const e = document.getElementById("petQrOn"); if (!e) return false; const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return !e.closest("[hidden]") && cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0; })()`;

async function open(browser, base, { lang = "th", init = [] } = {}) {
  const page = await browser.newPage(null, { isolated: true, initScripts: [LANG(lang), DET, ...init] });
  await page.goto(`${base}/petread.html?fakedet&nosw${lang !== "th" ? "&lang=" + lang : ""}`);
  await page.waitFor("window.__LQPET && window.__LQPET.ready", 15000);
  if (lang !== "th") await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
  // the card section (with the options and the hint) shows after a reading
  await page.evaluate(() => {
    const s = document.querySelector('input[name="petSpecies"][value="cat"]'); if (s && !s.checked) s.click();
    const el = document.getElementById("petName"); el.value = "Mochi"; el.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("petRead").click();
  });
  await page.waitFor("document.querySelectorAll('#petReading .fa-section').length >= 2", 10000);
  await page.waitFor("document.getElementById('petCard').dataset.drawn === '1'", 10000);
  await sleep(300);
  return page;
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("H1 switch off: the hint is the exact new text in TH / EN / ZH, no QR mention, the QR option is hidden", async () => {
      for (const lang of LANGS) {
        const page = await open(browser, base, { lang });
        const h = await page.evaluate(HINT);
        assert(h === NEW[lang], `${lang}: hint ${JSON.stringify(h)}`);
        assert(!/qr|二维码|二維碼/i.test(h), `${lang}: the hint mentions a QR code: ${h}`);
        assert(!(await page.evaluate(QRVIS)), `${lang}: QR option visible while the switch is off`);
        assert(await page.evaluate(HINTVIS), `${lang}: the hint is not visible`);
        await page.close();
      }
    });

    await check("H2 switch on (test only): the QR option shows and the hint is the old two-option text in TH / EN / ZH", async () => {
      for (const lang of LANGS) {
        const page = await open(browser, base, { lang, init: [SHOW] });
        const h = await page.evaluate(HINT);
        assert(h === OLD[lang], `${lang}: hint ${JSON.stringify(h)}`);
        assert(await page.evaluate(QRVIS), `${lang}: QR option hidden with the switch on`);
        assert(await page.evaluate(HINTVIS), `${lang}: the hint is not visible`);
        await page.close();
      }
    });

    await check("H3 switch off: the hint follows a run-time language switch (th, en, zh, th) with the exact new text", async () => {
      const page = await open(browser, base, { lang: "th" });
      for (const lang of ["th", "en", "zh", "th"]) {
        await page.evaluate(l => window.LQI18N.setLang(l), lang);
        await page.waitFor(`window.LQI18N.lang === "${lang}"`, 8000);
        await sleep(300);
        const h = await page.evaluate(HINT);
        assert(h === NEW[lang], `after switching to ${lang}: hint ${JSON.stringify(h)}`);
        assert(await page.evaluate(HINTVIS), `after switching to ${lang}: the hint is not visible`);
      }
      await page.close();
    });
  } finally { await browser.close(); }
}
