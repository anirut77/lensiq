// tests/e2e/exam-lab-restart.e2e.mjs — Exam lab: "turn the camera off" before the exam, then consent again (walk-through
// 2026-11-16 D-12), must never start a calibration the candidate did not ask for, and never leave a calibration that can
// never finish. FIXED TEST written and locked (evals-locks/examlab-90.sha256) BEFORE the product change (reviewer delta
// 39ac5013 -> 1fa699eb, round 1). Each case runs in Thai, English and Chinese on a fresh page load (lq-lang).
//   R1 stale tap: calibrate is tapped while the camera is still starting, then the camera is turned off before any frame;
//      after consent again and frames flowing, the page stays on the camera step (no calibration without a new tap);
//      a new tap then calibrates normally.
//   R2 silent camera after restart: a first session gets frames, the camera is turned off, the camera then sends nothing;
//      after consent again, a tap during camera start and a tap after the message both leave the page out of "cal",
//      and the engine line says plainly that no picture arrives.
// Fake camera (tests/e2e/fake-cams.js) and scripted detections (?fakedet); no photo of a person.
import { assert } from "./cdp.mjs";
import { exceptions, sleep } from "./exam-kit.mjs";

const THAI = /[ก-ฺเ-๛]/;
const LANGS = ["th", "en", "zh"];
const FACE = { x: 0.32, y: 0.18, w: 0.34, h: 0.5, score: 0.95, yaw: 0, pitch: 0 };
const lang = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const DETS = `window.__dets = [${JSON.stringify(FACE)}]; window.__LQ_FAKE_DET = key => key === "exam-lab" ? window.__dets : null;`;
const ONE_CAM = `window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" };`;
const NO_PICTURE = { en: /picture|image|video|frame/i, zh: /画面|图像|影像|视频/ };

async function consent(page) {
  await page.evaluate(() => {
    document.querySelector("#room").value = "LAB9"; document.querySelector("#seat").value = "4";
    document.querySelector("#consent").checked = true; document.querySelector("#noticeForm").requestSubmit();
  });
}

async function engineSaysNoPicture(page, l, label) {
  const r = await page.evaluate(() => { const e = document.querySelector("#engine"); return { text: e.textContent.trim(), cls: e.className }; });
  assert(/warn|err/.test(r.cls), `${label} [${l}]: engine line is not a warning: ${JSON.stringify(r)}`);
  assert(r.text.length >= (l === "zh" ? 2 : 6), `${label} [${l}]: no message: ${JSON.stringify(r.text)}`);
  if (l !== "th") assert(!THAI.test(r.text), `${label} [${l}]: Thai letters: ${r.text.slice(0, 160)}`);
  if (NO_PICTURE[l]) assert(NO_PICTURE[l].test(r.text), `${label} [${l}]: does not say no picture: ${r.text.slice(0, 160)}`);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const LAB = `${base}/exam-lab.html?cpu&fakedet&calsec=2`;
  const open = async l => {
    const page = await browser.newPage(null, { initScripts: [lang(l), fakeCams, ONE_CAM, DETS] });
    await page.goto(LAB);
    await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
    return page;
  };
  try {
    for (const l of LANGS) {
      await check(`R1 exam-lab stale calibrate tap [${l}]: camera off before the first frame, consent again -> no calibration without a new tap`, async () => {
        const page = await open(l);
        try {
          await consent(page);
          await page.waitFor("window.__LQ_EXAM_LAB.phase === 'cam'", 5000);
          // tap calibrate while the camera is still starting (no frame yet), then turn the camera off at once
          await page.evaluate(() => { document.querySelector("#toCal").click(); document.querySelector("#stepCam .cam-off-early").click(); });
          assert(await page.evaluate(() => window.__LQ_EXAM_LAB.phase === "notice"), "camera off goes back to the notice");
          await sleep(5000); // let the first camera start settle
          await consent(page);
          await page.waitFor("window.__LQ_EXAM_LAB.phase === 'cam' && window.__LQ_EXAM_LAB.faces.length === 1", 15000);
          await sleep(4000); // ?calsec=2: a calibration started on its own would be running or done by now
          const ph = await page.evaluate(() => window.__LQ_EXAM_LAB.phase);
          assert(ph === "cam", "calibration started without a new tap after camera off + consent again: phase " + ph);
          await page.evaluate(() => document.querySelector("#toCal").click());
          await page.waitFor("window.__LQ_EXAM_LAB.phase === 'calDone'", 10000);
          assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
        } finally { await page.close(); }
      });

      await check(`R2 exam-lab silent camera after camera off + consent again [${l}]: calibrate never sticks in "cal"; no-picture message`, async () => {
        const page = await open(l);
        try {
          await consent(page);
          await page.waitFor("window.__LQ_EXAM_LAB.phase === 'cam' && window.__LQ_EXAM_LAB.faces.length === 1", 15000);
          await sleep(1000); // a first session with frames
          await page.evaluate(() => document.querySelector("#stepCam .cam-off-early").click());
          assert(await page.evaluate(() => window.__LQ_EXAM_LAB.phase === "notice"), "camera off goes back to the notice");
          await page.evaluate(() => window.__LQ_FAKE.freeze("fake-cam-1", true)); // from now on the camera sends nothing
          await sleep(1000);
          await consent(page);
          await page.waitFor("window.__LQ_EXAM_LAB.phase === 'cam'", 5000);
          await page.evaluate(() => document.querySelector("#toCal").click()); // tap while the silent camera is starting
          const loading = await page.evaluate(() => window.LQI18N.tf("exam.lab.loading", "กำลังเปิดกล้องและโหลดโมเดล (ในเครื่องนี้)..."));
          await page.waitFor(`(() => { const e = document.querySelector("#engine"); return e.classList.contains("warn") && e.textContent.trim() !== ${JSON.stringify(loading)}
            && window.__LQ_EXAM_LAB.phase !== "notice"; })()`, 12000);
          await sleep(4000); // ?calsec=2: a calibration that could run would have finished by now
          let st = await page.evaluate(() => ({ phase: window.__LQ_EXAM_LAB.phase, w: document.querySelector("video").videoWidth }));
          assert(st.w === 0, "the camera really delivered no frame after the restart: " + JSON.stringify(st));
          assert(st.phase !== "cal", "tap during the silent camera start left a calibration that can never finish: " + JSON.stringify(st));
          await engineSaysNoPicture(page, l, "after tap during start");
          await page.evaluate(() => document.querySelector("#toCal").click()); // tap again after the message
          await sleep(4000);
          st = await page.evaluate(() => ({ phase: window.__LQ_EXAM_LAB.phase, w: document.querySelector("video").videoWidth }));
          assert(st.phase !== "cal", "tap after the no-picture message started a calibration that can never finish: " + JSON.stringify(st));
          await engineSaysNoPicture(page, l, "after tap after message");
          assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
