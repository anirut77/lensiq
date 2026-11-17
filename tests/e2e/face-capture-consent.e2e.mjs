// tests/e2e/face-capture-consent.e2e.mjs — FACE CAPTURE, review round 2 (independent review of fd52345 NOT OK, 2026-11-17).
// FIXED TEST, locked in ~/LENSIQ-field/evals/face-capture/ BEFORE the round-2 fix. Headless Chrome, Android profile, 393 px,
// faceread.html?cpu&fakedet, the synthetic face camera of face-capture-cam.js (no photo, no person).
//   D1 rear mode: unticking consent while the back camera is live stops the camera at once and cancels a running 3-2-1;
//      nothing is captured afterwards
//   D2 rear mode: one tick covers one person: after a capture the tick is cleared and the camera stops; a new face is not
//      captured until someone ticks again (the start button stays off until then)
//   D3 with no face in view the page does not read the full camera frame (only a small sample for "too dark")
//   D4 a manual capture while the oval is not green gives the reading with the plain "results may be off" warning (TH/EN/ZH)
//   D5 the manual button's English label in rear mode does not say "my face"
import { readFileSync } from "node:fs";
import { assert } from "./cdp.mjs";

const MODEL = readFileSync(new URL("../fixtures/face-capture/face-model.js", import.meta.url), "utf8");
const CAM = readFileSync(new URL("./face-capture-cam.js", import.meta.url), "utf8");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const READS = `(() => { const g = CanvasRenderingContext2D.prototype.getImageData; window.__READS = [];
  CanvasRenderingContext2D.prototype.getImageData = function (x, y, w, h, ...r) { window.__READS.push({ t: performance.now(), a: w * h }); return g.call(this, x, y, w, h, ...r); }; })();`;
const REAR_OK = { profile: "rear-26-16x9", d: 350 }, REAR_FAR = { profile: "rear-26-16x9", d: 900 };
const OK = { profile: "iphone-front-16x9", d: 350 }, FAR = { profile: "iphone-front-16x9", d: 900 };
const WARN = { th: /ผลอาจคลาดเคลื่อน/, en: /may be off/, zh: /可能有偏差/ };

async function phone(browser, lang = "th") {
  const page = await browser.newPage(null, { initScripts: [READS, MODEL, CAM, `try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`] });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 860, deviceScaleFactor: 2.625, mobile: true });
  return page;
}
const setScene = (page, scene, n = 1) => page.evaluate((s, k) => window.__FC.set(s, k), scene, n);
const click = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const stats = page => page.evaluate(() => { try { return (JSON.parse(localStorage.getItem("fr-stats")) || {}).total || 0; } catch (e) { return 0; } });
const live = page => page.evaluate(() => !!document.querySelector("#frCam.live"));
async function rearStart(page, scene) {
  await page.goto(page.__base + "/faceread.html?cpu&fakedet");
  await page.waitFor(`!!document.getElementById("frModeOther")`, 10000);
  await click(page, "#frModeOther"); await click(page, "#frConsentOk");
  await setScene(page, scene);
  await click(page, "#frStartCam");
  await page.waitFor(`document.querySelector("#frCam.live") && !document.getElementById("frRead").hidden`, 10000);
  assert(await page.evaluate(() => window.__FC.facings.slice(-1)[0]) === "environment", "back camera");
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("D1 rear: unticking consent while live stops the camera and cancels the count; no capture afterwards", async () => {
      const page = await phone(browser); page.__base = base;
      await rearStart(page, REAR_FAR);
      await page.waitFor(`document.getElementById("frHint") && document.getElementById("frHint").dataset.state === "far"`, 8000);
      await click(page, "#frConsentOk");
      await page.waitFor(`!document.querySelector("#frCam.live")`, 1500);
      // again, this time during a running 3-2-1
      await click(page, "#frConsentOk"); await click(page, "#frStartCam");
      await page.waitFor(`document.querySelector("#frCam.live")`, 10000);
      const t0 = await stats(page);
      await setScene(page, REAR_OK);
      await page.waitFor(`!document.getElementById("frCount").hidden && /^[123]$/.test(document.getElementById("frCount").textContent.trim())`, 8000);
      await click(page, "#frConsentOk");
      await page.waitFor(`!document.querySelector("#frCam.live") && document.getElementById("frCount").hidden`, 1500);
      await sleep(4000);
      const s = await page.evaluate(() => ({ live: !!document.querySelector("#frCam.live"), ticked: document.getElementById("frConsentOk").checked,
        shown: !document.getElementById("frConsent").hidden, start: document.getElementById("frStartCam").disabled }));
      assert(!s.live && !s.ticked && s.shown && s.start, "camera off, consent shown, start off: " + JSON.stringify(s));
      assert(await stats(page) === t0, "no capture after consent was withdrawn");
      await page.close();
    });

    await check("D2 rear: one tick = one person; after the capture the tick is cleared and the camera stops", async () => {
      const page = await phone(browser); page.__base = base;
      await rearStart(page, REAR_OK);
      const t0 = await stats(page);
      await page.waitFor(`!document.getElementById("frResult").hidden`, 12000);
      assert(await stats(page) === t0 + 1, "first person captured once");
      await page.waitFor(`!document.querySelector("#frCam.live")`, 3000);
      const s = await page.evaluate(() => ({ ticked: document.getElementById("frConsentOk").checked, shown: !document.getElementById("frConsent").hidden,
        start: document.getElementById("frStartCam").disabled, startShown: !document.getElementById("frStartCam").hidden }));
      assert(!s.ticked && s.shown && s.start && s.startShown, "tick cleared, start off until ticked again: " + JSON.stringify(s));
      // a new person in front of the phone: nothing happens without a new tick
      await setScene(page, { ...REAR_OK, yaw: 2 }, 0); await sleep(1000); await setScene(page, { ...REAR_OK, tx: 0.52 });
      await sleep(5000);
      assert(await stats(page) === t0 + 1 && !(await live(page)), "no second capture without a new tick");
      await page.close();

      // selfie mode is unchanged: the same person held green gives one capture only
      const p2 = await phone(browser);
      await p2.goto(`${base}/faceread.html?cpu&fakedet`);
      await p2.waitFor(`!!document.getElementById("frStartCam")`, 10000);
      await setScene(p2, OK); const u0 = await stats(p2);
      await click(p2, "#frStartCam");
      await p2.waitFor(`!document.getElementById("frResult").hidden`, 12000);
      await sleep(6000);
      assert(await stats(p2) === u0 + 1, "same person, one capture");
      await p2.close();
    });

    await check("D3 no face in view: the page does not read the full camera frame", async () => {
      const page = await phone(browser);
      await page.goto(`${base}/faceread.html?cpu&fakedet`);
      await page.waitFor(`!!document.getElementById("frStartCam")`, 10000);
      await setScene(page, OK, 0);
      await click(page, "#frStartCam");
      await page.waitFor(`document.getElementById("frHint") && document.getElementById("frHint").dataset.state === "out"`, 10000);
      const t = await page.evaluate(() => performance.now());
      await sleep(3000);
      const big = await page.evaluate(t0 => window.__READS.filter(r => r.t > t0 && r.a > 64 * 64).length, t);
      assert(big === 0, "full-frame reads with no face: " + big);
      await setScene(page, OK);
      await page.waitFor(`document.getElementById("frHint").dataset.state === "ok"`, 8000);
      await page.close();
    });

    for (const lang of ["th", "en", "zh"]) {
      await check(`D4 manual capture while the oval is not green: reading + "results may be off" (${lang})`, async () => {
        const page = await phone(browser, lang);
        await page.goto(`${base}/faceread.html?cpu&fakedet`);
        await page.waitFor(`!!document.getElementById("frStartCam")`, 10000);
        await setScene(page, FAR);
        await click(page, "#frStartCam");
        await page.waitFor(`document.getElementById("frHint") && document.getElementById("frHint").dataset.state === "far" && !document.getElementById("frRead").disabled`, 10000);
        await click(page, "#frRead");
        await page.waitFor(`!document.getElementById("frResult").hidden`, 10000);
        const line = await page.evaluate(() => document.getElementById("frEngine").textContent);
        assert(WARN[lang].test(line), `warning line (${lang}): ${line}`);
        await page.close();
      });
    }

    await check("D5 English button label: 'Read my face' for a selfie, not in rear mode", async () => {
      const page = await phone(browser, "en"); page.__base = base;
      await page.goto(`${base}/faceread.html?cpu&fakedet`);
      await page.waitFor(`!!document.getElementById("frRead")`, 10000);
      assert(/my face/i.test(await page.evaluate(() => document.getElementById("frRead").textContent)), "selfie label");
      await click(page, "#frModeOther");
      await sleep(200);
      const t = await page.evaluate(() => document.getElementById("frRead").textContent.trim());
      assert(t && !/\bmy\b/i.test(t), "rear-mode label: " + t);
      await page.close();
    });
  } finally { await browser.close(); }
}
