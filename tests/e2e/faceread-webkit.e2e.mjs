// tests/e2e/faceread-webkit.e2e.mjs — FACE READING ON THE iOS ENGINE WITH THE REAL MODELS (owner report 2026-11-15, iPhone
// Safari: "the camera opens but face detection does not seem to run"). FIXED TEST, locked
// (~/LENSIQ-field/evals/faceread-ios/locked.sha256) before any product change on branch faceread-ios.
//
// Every flow: Playwright WebKit, iPhone 13 profile (390 px, touch, mobile UA), faceread.html WITHOUT ?fakedet (the real
// TinyFaceDetector + 68-landmark models, the page's own backend choice), one fake front camera that shows a SYNTHETIC face
// drawn on a canvas (tests/e2e/synth-face-cam.js; no photo, no real person). The user taps "open camera".
//
// RULE: the page never shows a camera that does nothing. Within the time limit of each flow ONE of these holds:
//   (live)    the detector really runs on the camera: the face check turns OK and the Read button enables; when the camera
//             picture becomes a plain background the check turns "no face" and Read disables; when the face comes back,
//             Read enables again (so a stale "OK" left over from before a failure does not count);
//   (message) a plain failure line in the page language (TH / EN / ZH) says what went wrong and offers the photo upload
//             (TH "อัปโหลดรูป", EN "upload", ZH "上传"), and the Read button is hidden or disabled.
// Flows (limit counted from the tap or from the injected fault):
//   A  normal start                                                         45 s from the tap
//   B  the WebGL context is lost after the camera is ready                  20 s from the fault
//   C  every detector call throws (TH, EN, ZH)                              20 s from the fault
//   D  a detector call never returns                                        25 s from the fault
//   E  the detector model file fails to download (404)                      45 s from the tap
//   F  the detector model file never finishes downloading                   45 s from the tap
//   G  every detector call throws RangeError "Out of memory": a message must name memory (TH หน่วยความจำ, EN memory,
//      ZH 内存) unless the detector runs live                                  20 s from the fault
//   H  the detector gets blank pictures from the <video> element (canvas input still works; an iOS video-upload fault)
//                                                                           20 s from the fault
// Faults are injected on the detector network instance (faceapi.nets.tinyFaceDetector.locateFaces: every face-api detection
// goes through it; the faceapi namespace exports are read-only getters), or on the network (page.route), or on the GPU.
// Pass rule of tests/e2e/phone-kit.mjs too: no page error, no crash, no reload, no horizontal overflow.
// Source: synthetic (a drawn face), Playwright WebKit on macOS; not a real iPhone.
import { readFileSync } from "node:fs";
import { assert } from "./cdp.mjs";
import { flow, launchWebKit, sleep } from "./phone-kit.mjs";

const CAM = readFileSync(new URL("./synth-face-cam.js", import.meta.url), "utf8");
const MSG = {
  th: { upload: /อัปโหลดรูป/, memory: /หน่วยความจำ/ },
  en: { upload: /upload/i, memory: /memory/i },
  zh: { upload: /上传/, memory: /内存/ }
};

/** page state: engine line, Read button, first face-check item */
const state = page => page.evaluate(() => {
  const eng = document.getElementById("frEngine"), rd = document.getElementById("frRead");
  const q0 = document.querySelector("#frQc li");
  return { text: (eng && eng.textContent || "").trim(), err: !!(eng && eng.classList.contains("err")), readOn: !!rd && !rd.hidden && !rd.disabled,
    face: !!q0 && q0.classList.contains("ok"), live: !!document.querySelector("#frCam.live") };
});

/** a plain failure message in lang, with the upload way forward, Read not usable */
const isMessage = (s, lang) => s.err && MSG[lang].upload.test(s.text) && !s.readOn;

/** the detector runs live: face -> blank -> no face (Read off) -> face -> Read on, each step within stepMs */
async function liveProbe(page, stepMs = 6000) {
  const until = async (pred, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred(await state(page))) return true; await sleep(150); } return false; };
  if (!(await until(s => s.readOn && s.face, stepMs))) return false;
  await page.evaluate(() => window.__LQ_SYNTH.blank(true));
  const gone = await until(s => !s.readOn && !s.face, stepMs);
  await page.evaluate(() => window.__LQ_SYNTH.blank(false));
  if (!gone) return false;
  return until(s => s.readOn && s.face, stepMs);
}

/**
 * waits up to limitMs for (message) or (live); returns "message" | "live"; throws with the last state otherwise
 * @param {any} page @param {string} lang @param {number} limitMs @param {string} label
 */
async function outcome(page, lang, limitMs, label) {
  const end = Date.now() + limitMs;
  let s = await state(page);
  while (Date.now() < end) {
    s = await state(page);
    if (isMessage(s, lang)) return "message";
    if (s.readOn && s.face && end - Date.now() > 18000 && await liveProbe(page)) return "live";
    await sleep(250);
  }
  s = await state(page);
  if (isMessage(s, lang)) return "message";
  if (await liveProbe(page)) return "live";
  throw new Error(`${label}: after ${limitMs / 1000} s neither a live detector nor a plain ${lang} failure message with the upload way forward — ${JSON.stringify(s)}`);
}

const ready = page => page.waitForFunction(() => {
  const r = document.getElementById("frRead"); return !!r && !r.hidden && !!document.querySelector("#frCam.live");
}, null, { timeout: 45000, polling: 200 });

export default async function ({ base, check }) {
  const browser = await launchWebKit();
  const url = `${base}/faceread.html`;
  const opts = (lang = "th") => ({ cams: CAM, lang, expectCam: false });
  const opened = async page => assert((await page.evaluate(() => window.__LQ_SYNTH.opens)) >= 1, "the page never opened the synthetic camera");
  try {
    await flow(check, browser, "faceread real models A: normal start -> the detector runs live on the synthetic face", url, opts(), async ({ page }) => {
      await page.locator("#frStartCam").tap();
      const o = await outcome(page, "th", 45000, "A");
      await opened(page);
      console.log(`       A outcome: ${o}`);
    });

    await flow(check, browser, "faceread real models B: WebGL context lost after ready -> live again or a plain message", url, opts(), async ({ page }) => {
      await page.locator("#frStartCam").tap(); await ready(page); await sleep(1500);
      const r = await page.evaluate(() => {
        const tf = window.faceapi && faceapi.tf; const be = tf && tf.getBackend();
        if (be !== "webgl") return be || "none";
        const gl = tf.backend().gpgpu.gl; const ext = gl.getExtension("WEBGL_lose_context"); if (!ext) return "no-ext";
        ext.loseContext(); return "lost";
      });
      assert(["lost", "wasm", "cpu"].includes(r), "B: could not lose the WebGL context: " + r);
      const o = await outcome(page, "th", 20000, "B");
      console.log(`       B (${r}) outcome: ${o}`);
    });

    for (const lang of ["th", "en", "zh"]) {
      await flow(check, browser, `faceread real models C (${lang}): every detector call throws -> a plain ${lang} message`, url, opts(lang), async ({ page }) => {
        await page.locator("#frStartCam").tap(); await ready(page); await sleep(1000);
        await page.evaluate(() => { faceapi.nets.tinyFaceDetector.locateFaces = () => { throw new Error("simulated detector failure"); }; });
        const o = await outcome(page, lang, 20000, "C " + lang);
        console.log(`       C ${lang} outcome: ${o}`);
      });
    }

    await flow(check, browser, "faceread real models D: a detector call never returns -> a plain message", url, opts(), async ({ page }) => {
      await page.locator("#frStartCam").tap(); await ready(page); await sleep(1000);
      await page.evaluate(() => { faceapi.nets.tinyFaceDetector.locateFaces = () => new Promise(() => { /* never settles */ }); });
      const o = await outcome(page, "th", 25000, "D");
      console.log(`       D outcome: ${o}`);
    });

    await flow(check, browser, "faceread real models E: detector model 404 -> a plain message with the upload way forward", url, opts(), async ({ page }) => {
      await page.route(/tiny_face_detector_model/, r => r.fulfill({ status: 404, body: "not found" }));
      await page.locator("#frStartCam").tap();
      const o = await outcome(page, "th", 45000, "E");
      console.log(`       E outcome: ${o}`);
    });

    await flow(check, browser, "faceread real models F: detector model download never finishes -> a plain message", url, opts(), async ({ page }) => {
      await page.route(/tiny_face_detector_model/, () => { /* never answered */ });
      await page.locator("#frStartCam").tap();
      const o = await outcome(page, "th", 45000, "F");
      console.log(`       F outcome: ${o}`);
    });

    await flow(check, browser, "faceread real models G: out of memory in the detector -> a message that names memory", url, opts(), async ({ page }) => {
      await page.locator("#frStartCam").tap(); await ready(page); await sleep(1000);
      await page.evaluate(() => { faceapi.nets.tinyFaceDetector.locateFaces = () => { throw new RangeError("Out of memory"); }; });
      const o = await outcome(page, "th", 20000, "G");
      if (o === "message") {
        const s = await state(page);
        assert(MSG.th.memory.test(s.text), "G: the message does not say the device ran out of memory: " + s.text);
      }
      console.log(`       G outcome: ${o}`);
    });

    await flow(check, browser, "faceread real models H: blank <video> pictures to the detector -> live again or a plain message", url, opts(), async ({ page }) => {
      await page.locator("#frStartCam").tap(); await ready(page); await sleep(1000);
      await page.evaluate(() => {
        const net = faceapi.nets.tinyFaceDetector, orig = net.locateFaces.bind(net), blank = document.createElement("canvas");
        net.locateFaces = (inp, o) => {
          if (inp instanceof HTMLVideoElement) {
            blank.width = inp.videoWidth || 640; blank.height = inp.videoHeight || 480;
            const c = blank.getContext("2d"); c.fillStyle = "#000"; c.fillRect(0, 0, blank.width, blank.height);
            return orig(blank, o);
          }
          return orig(inp, o);
        };
      });
      const o = await outcome(page, "th", 20000, "H");
      console.log(`       H outcome: ${o}`);
    });
  } finally { await browser.close(); }
}
