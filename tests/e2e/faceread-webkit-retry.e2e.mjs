// tests/e2e/faceread-webkit-retry.e2e.mjs — FACE READING: RETRY AFTER THE PLAIN MESSAGE (faceread-ios round 2, independent
// review 2026-11-15: after the message, tapping "open camera" again left a live camera whose detector was never called).
// FIXED TEST, locked (~/LENSIQ-field/evals/faceread-ios/locked.sha256) before the product change. Same set-up, rule and
// helpers as tests/e2e/faceread-webkit.e2e.mjs (WebKit iPhone 13, real models, synthetic drawn face; (live) or (message)).
// Flows: fault -> plain message -> tap "open camera" again -> the page leaves the message (opens the camera again) within
// 10 s -> within 25 s (live) or (message) again.
//   R1  every detector call throws, and keeps throwing
//   R2  every detector call throws RangeError "Out of memory", and keeps throwing; a message must name memory
//   R3  every detector call throws; the fault is REMOVED before the retry -> the retry must end (live), not (message)
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
  const opts = { cams: CAM, lang: "th", expectCam: false };
  /** fault -> message -> retry -> left the message -> outcome */
  const retry = async (page, fault, label, beforeRetry = null) => {
    await page.locator("#frStartCam").tap(); await ready(page); await sleep(1000);
    await page.evaluate(fault);
    const first = await outcome(page, "th", 20000, label + " before the retry");
    assert(first === "message", `${label}: the fault did not end in the plain message before the retry (${first})`);
    await page.evaluate(() => { const b = document.getElementById("frStartCam"); if (!b || b.hidden || b.disabled) throw new Error("no usable Start button after the message"); });
    if (beforeRetry) await page.evaluate(beforeRetry);
    await page.locator("#frStartCam").tap();
    await page.waitForFunction(() => !document.getElementById("frEngine").classList.contains("err"), null, { timeout: 10000, polling: 100 })
      .catch(() => { throw new Error(`${label}: tapping "open camera" again left the old message in place for 10 s`); });
    return outcome(page, "th", 25000, label + " after the retry");
  };
  try {
    await flow(check, browser, "faceread retry R1: detector keeps throwing -> after the retry live or the message again", url, opts, async ({ page }) => {
      const o = await retry(page, () => { faceapi.nets.tinyFaceDetector.locateFaces = () => { throw new Error("simulated detector failure"); }; }, "R1");
      console.log(`       R1 after retry: ${o}`);
    });
    await flow(check, browser, "faceread retry R2: out of memory keeps happening -> after the retry live or the memory message again", url, opts, async ({ page }) => {
      const o = await retry(page, () => { faceapi.nets.tinyFaceDetector.locateFaces = () => { throw new RangeError("Out of memory"); }; }, "R2");
      if (o === "message") { const s = await state(page); assert(MSG.th.memory.test(s.text), "R2: the message after the retry does not name memory: " + s.text); }
      console.log(`       R2 after retry: ${o}`);
    });
    await flow(check, browser, "faceread retry R3: the fault is gone before the retry -> the detector runs live again", url, opts, async ({ page }) => {
      const o = await retry(page, () => {
        const n = faceapi.nets.tinyFaceDetector; window.__lqOrigLocate = n.locateFaces;
        n.locateFaces = function () { if (window.__lqFaultOn !== false) throw new Error("simulated detector failure"); return window.__lqOrigLocate.apply(n, arguments); };
      }, "R3", () => { window.__lqFaultOn = false; });
      assert(o === "live", "R3: after the fault was removed the retry did not bring the detector back live: " + o);
    });
  } finally { await browser.close(); }
}
