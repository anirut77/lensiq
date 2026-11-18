// tests/e2e/attendance-qr-webkit.e2e.mjs — FIXED TEST (Attendance PIN / QR to 90, acceptance sheet docs/acceptance/attendance.md
// F item 2 "badge scan on the device's camera, including iPhone Safari", P3), locked in evals-locks/attendance-time.sha256
// (~/LENSIQ-field/evals/attendance-time/) BEFORE the product change. Runs on the macOS WebKit shard (name contains "webkit").
// WebKit (the iOS Safari engine) has no BarcodeDetector. iPhone 13 profile (390 px, touch), Thai and English, one fresh
// context each. attendance.html?mode=employee (no ?fakedet: the real decoder path). A fake camera shows the employee's own
// badge QR (tests/e2e/qr-cam.js, drawn by the page's encoder). PASS per language:
//   the camera QR button is shown and at least 44 px tall; tapping it opens the camera; within 30 s a "qr" punch is saved for
//   that employee and the punch line names them (en: no Thai outside the employee's data); no face library (face-api.js) and
//   no face model is requested at any time; the decoder is the self-hosted vendor/zxing one; a second tap stops the scan;
//   the phone pass rule (no page error, no crash, no reload, no horizontal scroll) holds.
// Synthetic data only: made-up employees, no person filmed.
import { assert } from "./cdp.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchWebKit, openFlow, passRule, waitFor } from "./phone-kit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const QR_CAM = readFileSync(join(here, "qr-cam.js"), "utf8");
const FACE_RE = /face-api\.js|\/vendor\/models\/|weights_manifest\.json|-shard\d|tfjs|\.tflite|\.onnx/i;
const THAI = /[฀-๿]/;

export default async function ({ base, check }) {
  const browser = await launchWebKit();
  try {
    for (const lang of ["th", "en"]) {
      await check(`WebKit iPhone 390 (${lang}): camera badge scan without BarcodeDetector saves a QR punch, no face model loaded`, async () => {
        const f = await openFlow(browser, `${base}/attendance.html?mode=employee&lang=${lang}`, { cams: QR_CAM, lang });
        const urls = [];
        f.page.on("request", r => urls.push(r.url()));
        try {
          const { page } = f;
          await waitFor(page, l => !!(window.LQHR && window.__ATT_CORE && window.LQI18N && window.LQI18N.lang === l), lang, 30000);
          assert(await page.evaluate(() => !("BarcodeDetector" in window)), "this WebKit build has a native BarcodeDetector: the fallback is not what runs");
          const emp = await page.evaluate(() => {
            document.querySelector('.hr-tab[data-h="emp"]').click();
            const fm = document.querySelector("#hrEmpForm"); fm.code.value = "W01"; fm.name.value = "Webkit Qr"; fm.dept.value = "Test"; fm.pin.value = ""; fm.noFace.checked = true; fm.requestSubmit();
            const e = window.LQHR.state.emps.find(x => x.code === "W01");
            document.querySelector(`[data-badge="${e.id}"]`).click();
            const e2 = window.LQHR.state.emps.find(x => x.code === "W01");
            window.__QR_TEXT = "LQAT1." + encodeURIComponent(e2.code) + "." + e2.qr;
            document.querySelector('.tab[data-t="pin"]').click();
            return { id: e2.id };
          });
          const btn = await page.evaluate(() => { const el = document.querySelector("#hrQrCam"); const r = el.getBoundingClientRect(); return { shown: !el.hidden && r.height > 0, h: r.height }; });
          assert(btn.shown && btn.h >= 44, "camera QR button shown and >= 44 px: " + JSON.stringify(btn));
          await page.tap("#hrQrCam");
          const ok = await waitFor(page, id => window.LQHR.state.punches.some(p => p.emp === id && p.method === "qr"), emp.id, 30000).then(() => true, () => false);
          const msg = await page.evaluate(() => document.querySelector("#hrPunchMsg").textContent);
          assert(ok, `no qr punch within 30 s (message: "${msg}")`);
          assert(/Webkit Qr/.test(msg), "the punch line names the employee: " + msg);
          if (lang === "en") assert(!THAI.test(msg.replace(/Webkit Qr|W01/g, "")), "no Thai in the en punch line: " + msg);
          const opens = await page.evaluate(() => (window.__QR_CAM && window.__QR_CAM.opens) || 0);
          assert(opens >= 1, "the test camera was opened");
          await page.tap("#hrQrCam");
          const label = await page.evaluate(() => document.querySelector("#hrQrCam").textContent);
          assert(lang === "th" ? /สแกนบัตร QR ด้วยกล้อง/.test(label) : /scan/i.test(label), "the second tap stops the scan: " + label);
          await page.waitForTimeout(1000);
          const face = urls.filter(u => FACE_RE.test(u));
          assert(!face.length, "face library / model requested: " + face.slice(0, 5).join(" "));
          assert(urls.some(u => /\/vendor\/zxing\//.test(u)), "the self-hosted QR decoder (vendor/zxing) was used");
          await passRule(page, f.st, `attendance QR ${lang}`);
        } finally { await f.ctx.close(); }
      });
    }
  } finally { await browser.close(); }
}
