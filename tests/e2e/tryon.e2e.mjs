// tests/e2e/tryon.e2e.mjs — Try-On MVP customer page (tryon.html). FIXED TEST: hash-locked (evals-locks/tryon-mvp.sha256)
// BEFORE tryon.html / tryon.js were written. Fake camera (no real person); the face mesh comes from the test seam
// ?fakelm (window.__LQ_FAKE_LM returns a synthetic 478-point mesh), because MediaPipe needs a GL context that headless
// Chrome on a Mac may not have. Demo catalogue (no backend): built-in drawn items only, no image of anyone.
import { assert, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAKE_LM = `window.__LQ_FAKE_LM = () => {
  const base = { 33: [-45, 0], 133: [-15, 0], 362: [15, 0], 263: [45, 0], 168: [0, -2], 10: [0, -95], 152: [0, 110], 234: [-75, 15], 454: [75, 15], 127: [-72, -5], 356: [72, -5], 1: [0, 35] };
  const pts = []; for (let i = 0; i < 478; i++) { const [x, y] = base[i] || [0, 10]; pts.push({ x: (320 + x) / 640, y: (220 + y) / 480, z: 0 }); }
  return pts;
};`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    let page;
    await check("tryon: consent before the camera; no file input; demo catalogue drawn", async () => {
      page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS = { n: 1, mode: 'ok' };", FAKE_LM] });
      await page.goto(`${base}/tryon.html?demo=1&fakelm=1`);
      const s0 = await page.evaluate(() => ({ start: document.getElementById("toStart").disabled,
        files: document.querySelectorAll("input[type=file]").length, items: document.querySelectorAll("#toItems [data-item]").length }));
      assert(s0.start === true, "start disabled before consent");
      assert(s0.files === 0, "no file input");
      assert(s0.items >= 4, "demo items listed: " + s0.items);
      assert(await page.evaluate(() => !window.__tryon || !window.__tryon.state.camera), "camera not opened before consent");
    });
    await check("tryon: after consent the live camera runs; glasses then a hat placed on the synthetic face; snapshot carries the mark", async () => {
      await page.evaluate(() => { const c = document.getElementById("toConsent"); c.checked = true; c.dispatchEvent(new Event("change")); });
      assert(await page.evaluate(() => document.getElementById("toStart").disabled === false), "start enabled after consent");
      await page.evaluate(() => document.getElementById("toStart").click());
      await page.waitFor("window.__tryon && window.__tryon.state.camera && window.__tryon.state.frames > 3", 15000);
      await page.evaluate(() => document.querySelector('#toItems [data-item][data-cat="glasses"]').click());
      await page.waitFor("window.__tryon.state.placed && window.__tryon.state.placed.cat === 'glasses'", 5000);
      const g = await page.evaluate(() => window.__tryon.state.placed);
      assert(Math.abs(g.x - 320) < 3 && Math.abs(g.y - 219) < 4, "glasses on the eyes " + JSON.stringify(g));
      await page.evaluate(() => document.querySelector('#toItems [data-item][data-cat="hats"]').click());
      await page.waitFor("window.__tryon.state.placed && window.__tryon.state.placed.cat === 'hats'", 5000);
      const snap = await page.evaluate(() => window.__tryon.snapshot());
      assert(snap && snap.mark === "ภาพจำลอง · Virtual try-on preview · 虚拟试穿预览" && snap.w > 0, "snapshot mark " + JSON.stringify(snap));
      assert(await page.evaluate(() => !!document.getElementById("toMark") && getComputedStyle(document.getElementById("toMark")).display !== "none"), "visible preview label on screen");
    });
    await check("tryon: no POST, nothing stored, no console errors, no overflow at 390 px; EN / ZH switch", async () => {
      assert(!page.requests.some(r => r.method && r.method !== "GET"), "no non-GET request: " + page.requests.filter(r => r.method !== "GET").map(r => r.url).join(", "));
      await privacyScan(page);
      const ls = await page.evaluate(() => Object.keys(localStorage).filter(k => /tryon|frame|snap/i.test(k)));
      assert(!ls.length, "no try-on keys in storage " + ls);
      const errs = page.consoleErrors.filter(e => !/404/.test(e.text || ""));
      assert(!errs.length, "console errors " + JSON.stringify(errs));
      await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await sleep(400);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      await page.send("Emulation.clearDeviceMetricsOverride");
      assert(o.sw <= o.cw + 1, "overflow at 390 " + JSON.stringify(o));
      for (const [lang, re] of [["en", /Try/], ["zh", /试/]]) {
        await page.goto(`${base}/tryon.html?demo=1&fakelm=1&lang=${lang}`);
        const h1 = await page.evaluate(() => document.querySelector("h1").textContent);
        assert(re.test(h1), lang + " h1 " + h1);
      }
    });
  } finally { await browser.close(); }
}
