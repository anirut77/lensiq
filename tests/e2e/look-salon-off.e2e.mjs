// tests/e2e/look-salon-off.e2e.mjs — owner decision 2026-11-14 (look suggestions, option ก): salon mode stays OFF and cannot
// be reached in the UI until the human-approval step for salon-typed text exists (docs/BEAUTY-IMAGE-DESIGN.md §4).
// FIXED TEST SET, locked with tests/unit/look-salon-off.test.js before the switch was added. On the real face-reading page
// (fake camera + scripted detector, as in look.e2e.mjs), TH / EN / ZH, adult confirmed, and with a page that TRIES to switch
// salon mode on (window.LENSIQ_LOOK_SALON = true and a fake approval object set before any script, ?salon=1 in the URL):
//   * after the config loads the switch is false and LQLook.salonEnabled() is false
//   * the look block shows the fixed suggestions, and no salon block, salon item, salon label or salon heading
//   * there is no free-text input anywhere in the look block (no text input, textarea or contenteditable), and no
//     salon wording anywhere on the page
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const lang = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const ADULT = `try { localStorage.setItem("lq-fortune-straight", JSON.stringify({ adult: true, straight: false })); } catch (e) {}`;
const TRY_ON = `window.LENSIQ_LOOK_SALON = true; window.LQLookSalonApproval = { approved: function () { return true; }, ready: true };`;
const SALON_WORDS = ["ข้อความของร้าน ไม่ใช่คำแนะนำของ LENSIQ", "The salon's own text, not a LENSIQ suggestion", "店家自己的文字，并非 LENSIQ 的建议",
  "แบบจากแคตตาล็อกของร้าน", "From the salon's catalogue", "店家目录中的款式"];

async function read(p) {
  await p.evaluate(() => document.getElementById("frStartCam").click());
  await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
  await p.evaluate(d => { window.__dets = d; }, [FACE]);
  await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
  await p.evaluate(() => document.getElementById("frRead").click());
  await p.waitFor(`!document.getElementById("frResult").hidden && document.querySelectorAll(".fa-section").length >= 3`, 20000);
  await sleep(500);
}
const STATE = words => {
  const b = document.getElementById("frLook");
  const vis = e => !!e && !e.closest("[hidden]") && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
  const page = document.body.innerText + " " + document.body.innerHTML;
  return {
    sw: window.LENSIQ_LOOK_SALON, enabled: !!(window.LQLook && window.LQLook.salonEnabled && window.LQLook.salonEnabled()),
    hasFn: !!(window.LQLook && typeof window.LQLook.salonEnabled === "function"),
    items: b ? [...b.querySelectorAll(".lq-look-item")].filter(vis).length : 0,
    salonEls: document.querySelectorAll(".lq-look-salon, .lq-look-salon-item").length,
    inputs: b ? b.querySelectorAll('input:not([type=checkbox]), textarea, [contenteditable=""], [contenteditable=true], select').length : -1,
    words: words.filter(w => page.includes(w))
  };
};

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const l of ["th", "en", "zh"]) {
      await check(`${l}: salon mode cannot be reached (switch forced off, no salon block, no free-text input)`, async () => {
        const page = await browser.newPage(null, { initScripts: [lang(l), fakeCams, detScript, ADULT, TRY_ON] });
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
          await page.goto(`${base}/faceread.html?cpu&fakedet&salon=1`);
          await page.waitFor(`document.documentElement.lang === ${JSON.stringify(l === "zh" ? "zh-Hans" : l)}`, 8000);
          await sleep(700);
          await read(page);
          await page.waitFor(() => document.querySelectorAll("#frLook .lq-look-item").length > 0, 5000);
          const s = await page.evaluate(STATE, SALON_WORDS);
          assert(s.sw === false, "config forces the switch off: " + JSON.stringify(s.sw));
          assert(s.hasFn && !s.enabled, "salonEnabled() false: " + JSON.stringify({ fn: s.hasFn, on: s.enabled }));
          assert(s.items >= 1, "fixed suggestions shown: " + s.items);
          assert(s.salonEls === 0, "no salon block / item: " + s.salonEls);
          assert(s.inputs === 0, "no free-text input in the look block: " + s.inputs);
          assert(s.words.length === 0, "no salon wording on the page: " + JSON.stringify(s.words));
        } finally { await page.close(); }
      });
    }
  } finally {
    await browser.close();
  }
}
