// tests/e2e/look-preview.e2e.mjs — FIXED TEST SET (locked with tests/unit/look-preview.test.js before lensiq-look-preview.js).
// The "try with camera" preview from a look suggestion on faceread (fake camera + scripted detector for the reading):
//   * a try button appears only on items whose preview kind is live (LQLookPreview.LIVE); none when LIVE is empty
//   * the button opens a dialog with the privacy note in the page language; the dialog shows either the live preview canvas
//     or an honest "not available on this device" message (headless Chrome here has no WebGL), never a blank box
//   * closing the dialog stops the camera; nothing image-like is written to localStorage / sessionStorage
//   * the dialog is not offered in a calm tab (the whole look block is hidden there)
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const lang = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const ADULT = `try { localStorage.setItem("lq-fortune-straight", JSON.stringify({ adult: true, straight: false })); } catch (e) {}`;
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const NOTE = { th: /ไม่เก็บภาพ/, en: /No photos are stored/i, zh: /不保存照片/ };

async function read(p) {
  await p.evaluate(() => document.getElementById("frStartCam").click());
  await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
  await p.evaluate(d => { window.__dets = d; }, [FACE]);
  await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
  await p.evaluate(() => document.getElementById("frRead").click());
  await p.waitFor(`!document.getElementById("frResult").hidden && document.querySelectorAll(".fa-section").length >= 3`, 20000);
  await sleep(500);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const open = async (inits, l) => {
    const page = await browser.newPage(null, { initScripts: [lang(l), fakeCams, detScript].concat(inits) });
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.goto(`${base}/faceread.html?cpu&fakedet`);
    await page.waitFor(`document.documentElement.lang === ${JSON.stringify(HTML_LANG[l])}`, 8000);
    await sleep(700);
    return page;
  };
  try {
    for (const l of ["th", "en", "zh"]) {
      await check(`${l}: try buttons only for live kinds; dialog with privacy note and a live canvas or an honest message; close stops the camera`, async () => {
        const page = await open([ADULT], l);
        try {
          await read(page);
          const s = await page.evaluate(() => {
            const live = (window.LQLookPreview && window.LQLookPreview.LIVE) || [];
            const items = [...document.querySelectorAll("#frLook .lq-look-item")].map(li => ({ id: li.getAttribute("data-look-id"), btn: !!li.querySelector("[data-look-try]"),
              kind: (li.querySelector("[data-look-try]") || {}).getAttribute ? li.querySelector("[data-look-try]").getAttribute("data-look-try") : null }));
            return { live, items };
          });
          assert(s.items.length >= 1, "items shown");
          for (const it of s.items) if (it.btn) assert(s.live.includes(it.kind), "button for a kind that is not live: " + JSON.stringify(it));
          if (!s.live.length) { assert(!s.items.some(i => i.btn), "no try button while nothing is live"); return; }
          if (!s.items.some(i => i.btn)) return; // this reading has no item with a live kind
          await page.evaluate(() => document.querySelector("#frLook [data-look-try]").click());
          await page.waitFor(() => { const d = document.getElementById("lqLookPreview"); return d && d.open; }, 5000);
          await page.waitFor(() => { const d = document.getElementById("lqLookPreview");
            return !!(d.querySelector("[data-look-live] canvas") || d.querySelector("[data-look-unavailable]:not([hidden])")); }, 15000);
          const d = await page.evaluate(() => { const x = document.getElementById("lqLookPreview"); return { text: x.textContent,
            role: x.getAttribute("aria-labelledby") || x.getAttribute("aria-label") || "" }; });
          assert(NOTE[l].test(d.text), l + ": privacy note: " + d.text.slice(0, 200));
          if (l !== "th") assert(!/[฀-๿]/.test(d.text), l + ": Thai in the dialog");
          assert(d.role, "dialog labelled");
          await page.evaluate(() => document.querySelector("#lqLookPreview [data-look-close]").click());
          await sleep(400);
          const after = await page.evaluate(() => {
            const dl = document.getElementById("lqLookPreview"), v = dl && dl.querySelector("video");
            const tracks = v && v.srcObject ? v.srcObject.getTracks().filter(t => t.readyState === "live").length : 0;
            const img = k => Object.keys(k).some(x => /data:image|base64/i.test(k.getItem(x) || ""));
            return { open: !!(dl && dl.open), tracks, stored: img(localStorage) || img(sessionStorage) };
          });
          assert(!after.open && after.tracks === 0, "closed and camera stopped: " + JSON.stringify(after));
          assert(!after.stored, "no image in storage");
        } finally { await page.close(); }
      });
    }
  } finally {
    await browser.close();
  }
}
