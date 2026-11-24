// tests/e2e/faceread-tier1.e2e.mjs — face reading on the tier-1 face model (lensiq-face-mesh68.js, MediaPipe Face Landmarker,
// LICENSES/TIERS.md M2), behind window.LENSIQ_FACEREAD_TIER1 (off). Photo upload with a plain grey picture (no person, no face).
//  T1 default (switch off): face-api.js is the engine, the tier-1 module and model are never requested (nothing changes for users).
//  T2 ?frengine=mp (localhost only): FRCore uses the tier-1 calibration, the tier-1 module + model are requested and no face-api.js
//     weight file is; the upload never stays busy: the detector runs and says "no face found", or (a Chrome where MediaPipe cannot
//     upload frames: a Mac with WebGL disabled) its failure is said in a plain line. Both are correct; which one depends on this Chrome
//     (same rule as tests/e2e/exam-lab.e2e.mjs). No backend name on screen.
//  T3 the switch on in the page (window.LENSIQ_FACEREAD_TIER1 = true before lensiq-config.js) picks the tier-1 engine too.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FACEAPI_W = /tiny_face_detector_model|face_landmark_68_model/;
const TIER1 = /lensiq-face-mesh68\.js|face-landmarker\/face_landmarker_lm\.task/;
const GREY = async () => {
  const cv = document.createElement("canvas"); cv.width = 640; cv.height = 480;
  const g = cv.getContext("2d"); g.fillStyle = "#8a8a8a"; g.fillRect(0, 0, 640, 480);
  const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.9));
  const inp = document.querySelector("#frFile"), dt = new DataTransfer();
  dt.items.add(new File([blob], "grey.jpg", { type: "image/jpeg" })); inp.files = dt.files;
  inp.dispatchEvent(new Event("change", { bubbles: true }));
};
// a grey picture always ends in an error-class line (no face, or the detector could not run); "ready" on the way is not the end
const settled = "(() => { const e = document.querySelector('#frEngine'); return e && e.classList.contains('err') ? { cls: e.className, text: e.textContent } : null; })()";

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("faceread tier-1 T1: switch off (default) -> face-api.js engine, no tier-1 request", async () => {
      const p = await browser.newPage(`${base}/faceread.html?lang=th`, { timeout: 30000 });
      await p.waitFor("!!window.FRCore && !!document.querySelector('#frFile')", 20000);
      assert(await p.evaluate(() => window.LENSIQ_FACEREAD_TIER1 === false && FRCore.engine === "faceapi"), "default engine is face-api.js");
      await p.evaluate(GREY);
      const st = await p.waitFor(settled, 60000);
      const urls = p.requests.map(r => r.url);
      assert(!urls.some(u => TIER1.test(u)), "tier-1 files requested with the switch off: " + urls.filter(u => TIER1.test(u)).join(", "));
      assert(urls.some(u => FACEAPI_W.test(u)), "face-api.js weights requested on the default path");
      assert(/ไม่พบใบหน้า/.test(st.text), "grey picture -> no face line: " + JSON.stringify(st));
      await p.close();
    });

    const tier1 = async (p, label) => {
      await p.waitFor("!!window.FRCore && !!document.querySelector('#frFile')", 20000);
      await p.evaluate(GREY);
      const st = await p.waitFor(settled, 60000);
      // once the tier-1 model has loaded, FRCore reads with the tier-1 calibration (never face-api's values on tier-1 points)
      const eng = await p.evaluate(() => ({ e: FRCore.engine, same: JSON.stringify(FRCore.NORMS) === JSON.stringify(window.LQFaceMesh68 && LQFaceMesh68.CAL.NORMS) }));
      assert(eng.e === "faceapi" ? !/ไม่พบใบหน้า/.test(st.text) : eng.e === "mp" && eng.same, label + ": calibration matches the engine: " + JSON.stringify(eng));
      await sleep(300);
      const urls = p.requests.map(r => r.url);
      assert(urls.some(u => /lensiq-face-mesh68\.js/.test(u)) && urls.some(u => /face-landmarker\/face_landmarker_lm\.task$/.test(u)), label + ": tier-1 module and model requested");
      assert(!urls.some(u => FACEAPI_W.test(u)), label + ": face-api.js weights requested: " + urls.filter(u => FACEAPI_W.test(u)).join(", "));
      const ran = /ไม่พบใบหน้า/.test(st.text);
      console.log(`    ${label} on this Chrome: ${ran ? "detector ran (no face found)" : "detector could not run here, failure said: " + st.text}`);
      if (!ran) assert(st.text.trim().length > 10 && !/Cannot|undefined|TypeError|Error|\.js|\.task|activeTexture|อินเทอร์เน็ต|internet|connection|网络/i.test(st.text), label + ": a plain failure line, no raw error text or file name: " + JSON.stringify(st));
      assert(!/WASM|WEBGL|WEBGPU|backend|ตัวประมวลผล/i.test(st.text), label + ": no backend name on screen: " + st.text);
    };
    await check("faceread tier-1 T2: ?frengine=mp on localhost -> tier-1 engine; the upload ends in a plain line, never busy", async () => {
      const p = await browser.newPage(`${base}/faceread.html?lang=th&frengine=mp`, { timeout: 30000 });
      await tier1(p, "T2");
      await p.close();
    });
    await check("faceread tier-1 T3: window.LENSIQ_FACEREAD_TIER1 = true -> tier-1 engine", async () => {
      const p = await browser.newPage(null, { initScripts: ["window.LENSIQ_FACEREAD_TIER1 = true;"], timeout: 30000 });
      await p.goto(`${base}/faceread.html?lang=th`);
      assert(await p.evaluate(() => window.LENSIQ_FACEREAD_TIER1 === true), "switch on");
      await tier1(p, "T3");
      await p.close();
    });
  } finally { await browser.close(); }
}
