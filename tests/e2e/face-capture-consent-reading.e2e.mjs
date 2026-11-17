// tests/e2e/face-capture-consent-reading.e2e.mjs — FACE CAPTURE, re-review note N2 (independent re-review of 9f255cd, 2026-11-17).
// FIXED TEST, locked in ~/LENSIQ-field/evals/face-capture/ BEFORE the fix. Headless Chrome, 393 px, faceread.html?cpu&fakedet,
// the synthetic face camera of face-capture-cam.js (no photo, no person).
// Rear mode: the consent tick is withdrawn WHILE the 10-frame reading runs (the fake detector unticks the box on its first call
// during the reading, as a person could on a phone whose detector is slow). Then, in TH / EN / ZH:
//   - no reading is shown or counted, the back camera is off, the consent box is shown unticked;
//   - the status line asks for consent again (TH ยินยอม / EN consent / ZH 同意) and does NOT say another face came into the frame.
import { readFileSync } from "node:fs";
import { assert } from "./cdp.mjs";

const MODEL = readFileSync(new URL("../fixtures/face-capture/face-model.js", import.meta.url), "utf8");
const CAM = readFileSync(new URL("./face-capture-cam.js", import.meta.url), "utf8");
const UNTICK = `(() => { const f = window.__LQ_FAKE_DET; let done = false;
  window.__LQ_FAKE_DET = function (k, now) {
    const c = document.getElementById("frCount");
    if (!done && c && !c.hidden && c.classList.contains("small")) { done = true; const b = document.getElementById("frConsentOk"); if (b && b.checked) b.click(); }
    return f(k, now);
  }; })();`;
const CONSENT = { th: /ยินยอม/, en: /consent/i, zh: /同意/ };
const OTHER_FACE = { th: /มีใบหน้าอื่นเข้ามาในกรอบ|ยังจับใบหน้าได้ไม่นิ่ง/, en: /Someone else entered the frame|Could not capture/, zh: /有其他人进入画面|还没能稳定捕捉/ };

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`N2 rear: consent withdrawn during the reading -> no reading, camera off, the consent line (not 'another face') (${lang})`, async () => {
        const page = await browser.newPage(null, { initScripts: [MODEL, CAM, UNTICK, `try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`] });
        await page.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 860, deviceScaleFactor: 2.625, mobile: true });
        await page.goto(`${base}/faceread.html?cpu&fakedet`);
        await page.waitFor(`!!document.getElementById("frModeOther")`, 10000);
        await page.evaluate(() => { document.getElementById("frModeOther").click(); document.getElementById("frConsentOk").click(); });
        await page.evaluate(() => window.__FC.set({ profile: "rear-26-16x9", d: 350 }));
        const t0 = await page.evaluate(() => { try { return (JSON.parse(localStorage.getItem("fr-stats")) || {}).total || 0; } catch (e) { return 0; } });
        await page.evaluate(() => document.getElementById("frStartCam").click());
        await page.waitFor(`document.querySelector("#frCam.live")`, 10000);
        // the automatic capture starts the reading; the fake detector unticks during it
        await page.waitFor(`!document.querySelector("#frCam.live") && !document.getElementById("frConsentOk").checked && document.getElementById("frCount").hidden`, 12000);
        await new Promise(r => setTimeout(r, 1500));
        const s = await page.evaluate(() => ({ line: document.getElementById("frEngine").textContent, result: !document.getElementById("frResult").hidden,
          live: !!document.querySelector("#frCam.live"), shown: !document.getElementById("frConsent").hidden,
          total: (() => { try { return (JSON.parse(localStorage.getItem("fr-stats")) || {}).total || 0; } catch (e) { return 0; } })() }));
        assert(!s.result && s.total === t0, "no reading shown or counted: " + JSON.stringify(s));
        assert(!s.live && s.shown, "camera off, consent box shown: " + JSON.stringify(s));
        assert(CONSENT[lang].test(s.line) && !OTHER_FACE[lang].test(s.line), `status line asks for consent (${lang}): ${s.line}`);
        await page.close();
      });
    }
  } finally { await browser.close(); }
}
