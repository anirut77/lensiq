// tests/e2e/fortune-share-art-optin.e2e.mjs — FIXED TEST SET, owner decision 76 (option ก, 2026-11-16), Chrome 375 px.
// Locked BEFORE the fix (~/LENSIQ-field/evals/fortune-share-print/, sha256 appended to evals-locks/fortune-share-print.sha256).
// On the share card the palm line drawing (palm) and the sign / animal art derived from birth data (astro, zodiac) are OFF by
// default; each page has its own switch (#lqSpArt), off every time the dialog opens. Per page and language (TH / EN / ZH):
//   A1  the dialog shows the art switch, unchecked, labelled in the page language; the card made by default has no art
//   A2  turned on: the card has the art; the photo / birth switches stay as they were
//   A3  closed and reopened: the art switch is off again and the card has no art
// Pure half: tests/unit/fortune-share-print.test.js (decision 76 test).
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const SCRIPT = { th: /[฀-๿]/, en: /^[A-Za-z][\x20-\x7E]*$/, zh: /[一-鿿]/ };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const PAGES = {
  zodiac: async p => { await p.evaluate(() => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); }); await p.waitFor(sections(3), 15000); },
  astro: async p => {
    await p.evaluate(setSel("asDay", "15")); await p.evaluate(setSel("asMonth", "5")); await p.evaluate(setSel("asYear", "2533"));
    await p.evaluate(() => document.getElementById("asForm").requestSubmit()); await p.waitFor(sections(3), 15000);
  },
  palm: async p => {
    await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
    await p.evaluate(() => document.getElementById("plStartCam").click());
    await p.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
    await p.evaluate(d => { window.__dets = d; }, [HAND]);
    await sleep(600);
    await p.evaluate(() => document.getElementById("plSnap").click());
    await p.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
    await p.evaluate(() => document.getElementById("plRead").click());
    await p.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3`, 20000);
  },
};
const STATE = `(() => { const d = document.getElementById("lqShareDlg"), a = document.getElementById("lqSpArt"), L = window.LQShare && window.LQShare.last;
  const lab = a && a.closest("label");
  const vis = e => !!e && !e.hidden && e.offsetParent !== null;
  return { open: vis(d), art: a ? { vis: vis(lab), on: a.checked, label: lab ? lab.textContent.trim() : "" } : null,
    photo: (document.getElementById("lqSpPhoto") || {}).checked, birth: (document.getElementById("lqSpBirth") || {}).checked,
    last: L ? { art: L.art, photo: L.photo, birth: L.birth } : null };
})()`;
const openDlg = async page => {
  await page.evaluate(() => [...document.querySelectorAll('[data-lq-sp="share"]')].find(b => b.offsetParent).click());
  await page.waitFor(`!!(window.LQShare && window.LQShare.last && document.getElementById("lqShareDlg") && !document.getElementById("lqShareDlg").hidden)`, 15000);
  return page.evaluate(STATE);
};

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const [p, read] of Object.entries(PAGES)) for (const lang of ["th", "en", "zh"]) {
      const tag = `[${p}/${lang}]`;
      const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`].concat(p === "palm" ? [fakeCams, detScript] : []) });
      try {
        await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
        await page.goto(`${base}/${p}.html${p === "palm" ? "?cpu&fakedet&nosw" : "?nosw"}`);
        await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 10000);
        await sleep(400);
        let err = null;
        try { await read(page); await page.waitFor(`!!window.LQShare && [...document.querySelectorAll('[data-lq-sp="share"]')].some(b => b.offsetParent)`, 5000); } catch (e) { err = e; }
        await check(`A1 ${tag} art switch shown, off, in the page language; default card has no art`, async () => {
          if (err) throw new Error("no result: " + err.message);
          const s = await openDlg(page);
          assert(s.open && s.art && s.art.vis, "art switch " + S(s));
          assert(s.art.on === false && s.last.art === false, "art off by default " + S(s));
          assert(SCRIPT[lang].test(s.art.label), `label not in ${lang}: ${s.art.label}`);
        });
        await check(`A2 ${tag} turned on: the card has the art; photo / birth unchanged`, async () => {
          if (err) throw new Error("no result: " + err.message);
          await page.evaluate(() => document.getElementById("lqSpArt").click());
          await page.waitFor(`!!(window.LQShare.last && window.LQShare.last.art === true)`, 8000);
          const s = await page.evaluate(STATE);
          assert(s.last.photo === false && s.last.birth === false && !s.photo && !s.birth, "other switches moved " + S(s));
        });
        await check(`A3 ${tag} reopened: art switch off again, card without art`, async () => {
          if (err) throw new Error("no result: " + err.message);
          await page.evaluate(() => document.querySelector('#lqShareDlg [data-lq-sp-act="close"]').click());
          await sleep(300);
          const s = await openDlg(page);
          assert(s.art && s.art.on === false && s.last.art === false, "reopened " + S(s));
        });
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}
