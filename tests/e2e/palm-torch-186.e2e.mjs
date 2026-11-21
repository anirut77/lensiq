// tests/e2e/palm-torch-186.e2e.mjs — owner decision 186 ก (2026-11-20): on the LIVE palm page (LENSIQ_PALM_V2 off) the camera
// opens with the torch OFF, nothing switches it on by itself, and the user's torch toggle (palm.cam.torch) stays and works.
// Locked BEFORE the product change (phase palm-honesty, relock4). Fake cameras (fake-cams.js) + scripted detector, the same
// mocks as single-subject.e2e.mjs; every fake track reports a torch capability and records applyConstraints calls.
//   T1  camera started: no applyConstraints call ever asks for torch: true (checked again after 2 s); the toggle is shown,
//       aria-pressed="false"
//   T2  pressing the toggle switches the torch on (torch: true call, aria-pressed="true"); pressing again switches it off
//       (torch: false call, aria-pressed="false"); TH / EN / ZH
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const S = v => JSON.stringify(v);
const detScript = `(() => {
  window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" };
  window.__dets = [];
  window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d));
  const md = navigator.mediaDevices, g = md.getUserMedia;
  md.getUserMedia = async c => {
    const s = await g.call(md, c), t = s.getVideoTracks()[0], gc = t.getCapabilities.bind(t);
    t.getCapabilities = () => Object.assign({}, gc(), { torch: true });
    t.applyConstraints = async x => { (window.__torchCalls = window.__torchCalls || []).push(JSON.stringify(x)); };
    return s;
  };
})();`;

async function open(browser, base, fakeCams, lang) {
  const pre = `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`;
  const page = await browser.newPage(null, { initScripts: [pre, fakeCams, detScript] });
  await page.goto(`${base}/palm.html?cpu&fakedet`);
  return page;
}
const onCalls = page => page.evaluate(() => (window.__torchCalls || []).filter(c => /"torch":true/.test(c)));
const btnState = page => page.evaluate(() => {
  const t = document.querySelector("#plCam .cam-torch");
  return t && { shown: !t.hidden && !t.closest(".cam-ctl").hidden && t.offsetWidth > 0, pressed: t.getAttribute("aria-pressed"),
    calls: window.__torchCalls || [], v2: window.LENSIQ_PALM_V2 };
});

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`${lang}: T1 camera opens with the torch off, no automatic torch-on; T2 the toggle switches it on and off`, async () => {
        const page = await open(browser, base, fakeCams, lang);
        await page.evaluate(() => document.getElementById("plStartCam").click());
        await page.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 8000);
        await page.waitFor(`(() => { const t = document.querySelector("#plCam .cam-torch"); return t && !t.hidden && t.offsetWidth > 0; })()`, 5000);
        let st = await btnState(page);
        assert(st.v2 !== true, "this test covers the live page: LENSIQ_PALM_V2 must be off");
        assert(st.shown, "torch toggle not shown although the camera reports a torch");
        assert((await onCalls(page)).length === 0, "torch switched on automatically at start: " + S(st.calls));
        assert(st.pressed === "false", "toggle should show off at start, aria-pressed = " + st.pressed);
        await sleep(2000);
        assert((await onCalls(page)).length === 0, "torch switched on automatically after start: " + S((await btnState(page)).calls));
        // T2: the user's toggle
        await page.evaluate(() => document.querySelector("#plCam .cam-torch").click());
        await page.waitFor(`document.querySelector("#plCam .cam-torch").getAttribute("aria-pressed") === "true"`, 5000);
        st = await btnState(page);
        assert(st.calls.some(c => /"torch":true/.test(c)), "pressing the toggle did not switch the torch on: " + S(st.calls));
        const n = st.calls.length;
        await page.evaluate(() => document.querySelector("#plCam .cam-torch").click());
        await page.waitFor(`document.querySelector("#plCam .cam-torch").getAttribute("aria-pressed") === "false"`, 5000);
        st = await btnState(page);
        assert(st.calls.slice(n).some(c => /"torch":false/.test(c)), "pressing the toggle again did not switch the torch off: " + S(st.calls));
        await page.close();
      });
    }
  } finally { await browser.close(); }
}
