// tests/e2e/petread-90.e2e.mjs — FIXED TEST for the pet reading push to 90 (owner inbox entries 17-18, 2026-11-23), against the
// locked acceptance sheet docs/acceptance/petread.md. Headless Chrome. Written and locked (evals-locks/petread-90.sha256, field copy
// ~/LENSIQ-field/evals/petread-90/) BEFORE any measurement or product change. Source of every picture: synthetic (a shape drawn
// on a canvas; no photo of an animal or a person). Detections are scripted with ?fakedet.
//   E1 crash guard (sheet E, item 3): window.LQCrashGuard is loaded on petread.html in TH / EN / ZH.
//   P4 main flow in Chrome at 360 px and at 430 px (README P4), TH / EN / ZH: photo -> traits -> read -> reading -> share card
//      drawn; no horizontal scroll at any step; the read button, the reading and the card are inside the viewport width; EN / ZH
//      readings carry no Thai.
//   C3 the same synthetic photo and the same traits give an identical reading and identical card text on two fresh loads
//      (photo path incl. the on-device coat estimate), TH / EN / ZH (sheet C).
//   X1 print (sheet X, item "print"): after a reading a print control is shown, labelled in the page language, and it calls the
//      browser's print once.
//   X2 printed page (print media): the reading, the honest line and the belief disclaimer are visible; the photo controls,
//      the trait form and the share-card section are not printed; the 1323 line stays wherever the reading shows it.
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";

const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/;
const HONEST = { th: "คำอ่านนี้ดัดแปลงจากความเชื่อเรื่องการดูลักษณะ ไม่ใช่ตำราดั้งเดิม", en: "Adapted from face-reading tradition, not a classical text.", zh: "改编自相术传统，并非古籍原文。" };
const DISC = { th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ", en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.", zh: "基于命理学原则，属个人信仰，请自行判断。" };
const PRINT = { th: /พิมพ์/, en: /print/i, zh: /打印/ };

const SYNTH = `(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d");
  x.fillStyle = "#5b8bd6"; x.fillRect(0, 0, 640, 480); x.fillStyle = "#e08a2e"; x.beginPath(); x.ellipse(300, 280, 150, 120, 0, 0, 7); x.fill();
  x.beginPath(); x.moveTo(190, 200); x.lineTo(220, 90); x.lineTo(270, 180); x.fill(); x.beginPath(); x.moveTo(330, 180); x.lineTo(380, 90); x.lineTo(410, 200); x.fill();
  return c.toDataURL("image/png"); })()`;
const CAT = { cls: 15, score: 0.91, x: 0.2, y: 0.15, w: 0.5, h: 0.7 };
const detInit = dets => `window.__PET_DETS = ${JSON.stringify(dets)}; window.__LQ_FAKE_DET = function (key) { return key === "pet" ? window.__PET_DETS : []; };`;

async function open(browser, base, { lang = "th", dets = [CAT], init = [] } = {}) {
  const scripts = [`try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`, detInit(dets), ...init];
  const page = await browser.newPage(null, { initScripts: scripts, isolated: true });
  await page.goto(`${base}/petread.html?fakedet&nosw${lang !== "th" ? "&lang=" + lang : ""}`);
  await page.waitFor("window.__LQPET && window.__LQPET.ready", 15000);
  if (lang !== "th") await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
  return page;
}
const usePhoto = async page => { await page.evaluate(`window.__LQPET.useImage(${SYNTH})`); await page.waitFor("window.__LQPET.st.detected === true", 15000); };
async function fillAndRead(page, { name = "Mochi", birth = "2021-03-14", owner = "1990-07-02" } = {}) {
  await page.evaluate((n, b, o) => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    set("petName", n); set("petBirth", b); set("petOwnerBirth", o);
    document.getElementById("petRead").click();
  }, name, birth, owner);
  await page.waitFor("document.querySelector('#petReading .fa-section')", 10000);
  await page.waitFor("document.getElementById('petCard').dataset.drawn === '1'", 8000);
  await sleep(300);
}
const readingText = page => page.evaluate(() => [...document.querySelectorAll("#petReading .fa-section")].map(s => s.textContent).join("\n"));
const visJs = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const b = e.getBoundingClientRect();
  const cs = getComputedStyle(e); return !e.closest("[hidden]") && b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; })()`;
// RE-LOCK relock-1 2026-11-24 (test fix only, before any product change for X2): the Thai line-wrap layer splits a phrase into
// <lq-t> no-break spans, so one sentence spans several text nodes; the check now finds the smallest element whose rendered text
// (innerText, white space folded) holds the whole sentence and asks that element to be visible. Same sentences, same rule.
const textVisible = (page, s) => page.evaluate(t => { const fold = x => String(x || "").replace(/\s+/g, " ").trim(), want = fold(t);
  const hits = [...document.body.querySelectorAll("*")].filter(e => fold(e.innerText).includes(want) && ![...e.children].some(c => fold(c.innerText).includes(want)));
  return hits.some(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden" && !e.closest("[hidden]"); }); }, s);

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("E1 crash guard: LQCrashGuard is loaded on petread.html (TH / EN / ZH)", async () => {
      for (const lang of LANGS) {
        const page = await open(browser, base, { lang });
        try {
          const ok = await page.evaluate(() => !!window.LQCrashGuard && typeof window.LQCrashGuard === "object");
          assert(ok, lang + ": window.LQCrashGuard is an object after load");
        } finally { await page.close(); }
      }
    });

    await check("P4 main flow in Chrome at 360 px and 430 px (TH / EN / ZH): photo -> read -> reading -> card, nothing wider than the screen", async () => {
      for (const width of [360, 430]) for (const lang of LANGS) {
        const page = await open(browser, base, { lang });
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width, height: 860, deviceScaleFactor: 2, mobile: true });
          await sleep(300);
          const ov = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
          let o = await ov(); assert(o.sw <= o.cw, `${lang} ${width} px at load ${JSON.stringify(o)}`);
          await usePhoto(page);
          o = await ov(); assert(o.sw <= o.cw, `${lang} ${width} px after the photo ${JSON.stringify(o)}`);
          const rb = await page.evaluate(() => { const b = document.getElementById("petRead").getBoundingClientRect(); return { l: b.left, r: b.right, w: b.width }; });
          assert(rb.w > 0 && rb.l >= 0 && rb.r <= width + 0.5, `${lang} ${width} px read button inside the width ${JSON.stringify(rb)}`);
          await fillAndRead(page);
          o = await ov(); assert(o.sw <= o.cw, `${lang} ${width} px after the reading ${JSON.stringify(o)}`);
          for (const sel of ["#petReading", "#petCard"]) {
            const b = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width }; }, sel);
            assert(b.w > 0 && b.l >= -0.5 && b.r <= width + 0.5, `${lang} ${width} px ${sel} inside the width ${JSON.stringify(b)}`);
          }
          const t = await readingText(page);
          assert(t.length > 200, `${lang} ${width} px reading shown (${t.length} chars)`);
          if (lang !== "th") assert(!THAI.test(t), `${lang} ${width} px reading has no Thai`);
        } finally { await page.close(); }
      }
    });

    await check("C3 same synthetic photo + same traits -> identical reading and card text on two fresh loads (TH / EN / ZH)", async () => {
      for (const lang of LANGS) {
        const runs = [];
        for (let k = 0; k < 2; k++) {
          const page = await open(browser, base, { lang });
          try {
            await usePhoto(page); await fillAndRead(page);
            runs.push({ reading: await readingText(page), card: await page.evaluate(() => window.__LQPET.cardText().join("\n")),
              coat: await page.evaluate(() => (window.__LQPET.model() || {}).coat || null) });
          } finally { await page.close(); }
        }
        assert(runs[0].reading.length > 200, lang + ": reading shown");
        assert(runs[0].reading === runs[1].reading, lang + ": reading identical on the second load");
        assert(runs[0].card === runs[1].card, lang + ": card text identical on the second load");
      }
    });

    await check("X1 print: after a reading a print control in the page language calls the browser's print once (TH / EN / ZH)", async () => {
      for (const lang of LANGS) {
        const page = await open(browser, base, { lang, init: ["window.__printed = 0; window.print = function () { window.__printed++; };"] });
        try {
          assert(!(await page.evaluate(visJs("#petPrint"))), lang + ": no print control before a reading");
          await usePhoto(page); await fillAndRead(page);
          assert(await page.evaluate(visJs("#petPrint")), lang + ": print control shown after the reading");
          const label = await page.evaluate(() => document.getElementById("petPrint").textContent.trim());
          assert(PRINT[lang].test(label) && (lang === "th" || !THAI.test(label)), `${lang}: print label "${label}"`);
          await page.evaluate(() => document.getElementById("petPrint").click());
          await sleep(200);
          assert((await page.evaluate(() => window.__printed)) === 1, lang + ": window.print called once");
        } finally { await page.close(); }
      }
    });

    await check("X2 printed page: reading, honest line and disclaimer printed; photo controls, trait form and share card not printed (TH / EN / ZH)", async () => {
      for (const lang of LANGS) {
        const page = await open(browser, base, { lang });
        try {
          await usePhoto(page); await fillAndRead(page);
          await page.send("Emulation.setEmulatedMedia", { media: "print" });
          await sleep(200);
          const r = await page.evaluate(`({ reading: ${visJs("#petReading .fa-section")}, form: ${visJs("#petForm")}, card: ${visJs("#petCardSec")},
            file: ${visJs(".pet-file")}, cam: ${visJs("#petCamOn")}, printBtn: ${visJs("#petPrint")} })`);
          const honest = await textVisible(page, HONEST[lang]), disc = await textVisible(page, DISC[lang]);
          await page.send("Emulation.setEmulatedMedia", { media: "" });
          assert(r.reading, lang + ": reading printed");
          assert(honest, lang + ": honest line printed");
          assert(disc, lang + ": disclaimer printed");
          assert(!r.form && !r.card && !r.file && !r.cam && !r.printBtn, `${lang}: controls not printed ${JSON.stringify(r)}`);
        } finally { await page.close(); }
      }
    });
  } finally { await browser.close(); }
}
