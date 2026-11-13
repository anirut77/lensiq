// tests/e2e/look.e2e.mjs — FIXED TEST SET (stream D, docs/BEAUTY-IMAGE-DESIGN.md §1 + §3; locked with
// tests/unit/look-suggest.test.js before the look modules were written). Look suggestions on the real face-reading page
// (fake camera + scripted detector, as in fortune-en.e2e.mjs):
//   * before the 18+ confirmation the block asks for it and shows no suggestion; after confirming, suggestions appear,
//     each with the "according to belief" label, and the confirmation is remembered after a reload
//   * TH / EN / ZH: the block is in the page language (no Thai in English or Chinese mode)
//   * a calm tab (session flag from the crisis net) shows no look block at all; the crisis state hides a block already shown
//   * "hide this section" switches it off on this device; it can be switched back on
//   * no link, price or shop wording in the block
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const lang = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const ADULT = `try { localStorage.setItem("lq-fortune-straight", JSON.stringify({ adult: true, straight: false })); } catch (e) {}`;
const CALM = `try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`;
const LABEL = { th: "ตามความเชื่อ โปรดใช้วิจารณญาณ", en: "According to belief, please use your own judgement", zh: "依据传统信仰，请自行判断" };

async function read(p) {
  await p.evaluate(() => document.getElementById("frStartCam").click());
  await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
  await p.evaluate(d => { window.__dets = d; }, [FACE]);
  await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
  await p.evaluate(() => document.getElementById("frRead").click());
  await p.waitFor(`!document.getElementById("frResult").hidden && document.querySelectorAll(".fa-section").length >= 3`, 20000);
  await sleep(500);
}
const STATE = () => {
  const b = document.getElementById("frLook");
  const vis = e => !!e && !e.closest("[hidden]") && getComputedStyle(e).display !== "none" && e.getBoundingClientRect().height > 0;
  const items = b ? [...b.querySelectorAll(".lq-look-item")] : [];
  return { exists: !!b, visible: vis(b), adultBox: !!(b && b.querySelector("[data-look-adult]")) && vis(b.querySelector("[data-look-adult]")),
    items: items.filter(vis).length, labels: items.filter(i => i.textContent.includes(window.__LBL)).length,
    text: b ? b.textContent : "", html: b ? b.innerHTML : "", hide: !!(b && b.querySelector("[data-look-hide]")) };
};

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const open = async (inits, l = "th") => {
    const page = await browser.newPage(null, { initScripts: [lang(l), fakeCams, detScript, `window.__LBL = ${JSON.stringify(LABEL[l])};`].concat(inits) });
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.goto(`${base}/faceread.html?cpu&fakedet`);
    await page.waitFor(`document.documentElement.lang === ${JSON.stringify(l === "zh" ? "zh-Hans" : l)}`, 8000); // re-lock 2026-11-13: the site sets zh-Hans
    await sleep(700);
    return page;
  };
  try {
    await check("not confirmed: the block asks for the 18+ confirmation and shows no suggestion; confirming shows them, remembered", async () => {
      const page = await open([]);
      try {
        await read(page);
        let s = await page.evaluate(STATE);
        assert(s.visible && s.adultBox && s.items === 0, "age question only: " + JSON.stringify({ v: s.visible, a: s.adultBox, n: s.items }));
        await page.evaluate(() => document.querySelector("#frLook [data-look-adult] input[type=checkbox]").click());
        await page.waitFor(() => document.querySelectorAll("#frLook .lq-look-item").length > 0, 5000);
        s = await page.evaluate(STATE);
        assert(s.items >= 1 && s.labels === s.items, "items with label: " + JSON.stringify({ n: s.items, l: s.labels }));
        assert(!/<a\s|href=|฿|บาท|ราคา|ซื้อ|ร้าน/.test(s.html), "no link / price / shop wording");
        await page.goto(`${base}/faceread.html?cpu&fakedet`); await sleep(700);
        await read(page);
        s = await page.evaluate(STATE);
        assert(s.items >= 1 && !s.adultBox, "remembered after reload: " + JSON.stringify({ n: s.items, a: s.adultBox }));
      } finally { await page.close(); }
    });

    for (const l of ["en", "zh"]) {
      await check(`${l}: suggestions and label in the page language`, async () => {
        const page = await open([ADULT], l);
        try {
          await read(page);
          const s = await page.evaluate(STATE);
          assert(s.items >= 1 && s.labels === s.items, l + " items: " + s.items);
          assert(!/[฀-๿]/.test(s.text), l + ": Thai in the block: " + s.text.slice(0, 160));
          if (l === "zh") assert(/[㐀-鿿]/.test(s.text), "zh text");
        } finally { await page.close(); }
      });
    }

    await check("calm tab: no look block at all (not even the age question)", async () => {
      const page = await open([ADULT, CALM]);
      try {
        await read(page);
        const s = await page.evaluate(STATE);
        assert(!s.visible && s.items === 0, "hidden in a calm tab: " + JSON.stringify({ v: s.visible, n: s.items }));
      } finally { await page.close(); }
    });

    await check("crisis state after the block is shown: the block disappears", async () => {
      const page = await open([ADULT]);
      try {
        await read(page);
        let s = await page.evaluate(STATE);
        assert(s.visible && s.items >= 1, "shown first");
        await page.evaluate(() => window.LQFortuneCrisis.setActive(document));
        await sleep(300);
        s = await page.evaluate(STATE);
        assert(!s.visible, "hidden in the crisis state");
      } finally { await page.close(); }
    });

    await check("'hide this section' switches it off on this device and it can be switched back on", async () => {
      const page = await open([ADULT]);
      try {
        await read(page);
        let s = await page.evaluate(STATE);
        assert(s.hide, "hide control present");
        await page.evaluate(() => document.querySelector("#frLook [data-look-hide]").click());
        await sleep(200);
        s = await page.evaluate(STATE);
        assert(s.items === 0, "no items after hiding");
        assert(await page.evaluate(() => !!document.querySelector("#frLook [data-look-show]")), "a way back");
        await page.goto(`${base}/faceread.html?cpu&fakedet`); await sleep(700);
        await read(page);
        s = await page.evaluate(STATE);
        assert(s.items === 0, "remembered off");
        await page.evaluate(() => document.querySelector("#frLook [data-look-show]").click());
        await page.waitFor(() => document.querySelectorAll("#frLook .lq-look-item").length > 0, 5000);
      } finally { await page.close(); }
    });
  } finally {
    await browser.close();
  }
}
