// tests/e2e/speed-models.e2e.mjs — NO MODEL FILE BEFORE THE CAMERA OPENS (speed pass, owner order 2026-11-14 C).
// Locked before any product change (evals-locks/speed.sha256).
//
// 1. Every root *.html page, opened cold (own browser context, HTTP cache off, service workers bypassed) with NO user
//    action: until the load event plus 2.5 s with nothing in flight (cap 30 s), no model file may be requested before
//    the page calls navigator.mediaDevices.getUserMedia (= the camera opens). Model file = tools/perf-measure.mjs
//    MODEL_RE: *.onnx / *.ort / *.tflite / *.task / *.wasm / *.pb / *.traineddata, face-api weight manifests and shards,
//    model.json, anything under vendor/models/. A page that opens the camera by itself may fetch its models after it.
//    New pages are covered automatically (the list is read from disk).
// 2. The pages that used to fetch models at load (baseline 2026-11-14, origin/main 4413bc3) still fetch them once the
//    camera opens (a click on the page's own camera button, or the page's own camera start), and show a loading line
//    (Thai UI: "กำลังโหลด" / "กำลังเตรียม" / "กำลังเปิดกล้องและโหลด") while they download. No feature is removed.
// Source: synthetic, headless Chrome (no throttling here; the speed numbers are in docs/SPEED.md).
// Known limit: a request made only inside a dedicated worker is not seen (no page here fetches a model that way).
import { readdirSync } from "node:fs";
import { assert } from "./cdp.mjs";
import { isModel } from "../../tools/perf-measure.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const MARK = "__LQ_CAM_OPEN__";
// the camera "opens" when the page calls getUserMedia; the marker goes out on the console before the call
const HOOK = `(() => { const md = navigator.mediaDevices; if (!md || !md.getUserMedia) return;
  const g = md.getUserMedia.bind(md);
  md.getUserMedia = function (c) { try { console.debug(${JSON.stringify(MARK)}); } catch (e) {} return g(c); }; })();`;
const LOADING = /กำลังโหลด|กำลังเตรียม|กำลังเปิดกล้องและโหลด/;

/** opens path; returns { page, log: [{url, model, beforeCam}], camAt(), stop() } */
async function open(browser, base, path, { initScripts = [], net = null } = {}) {
  const page = await browser.newPage(null, { isolated: true, initScripts: [...initScripts, HOOK] });
  const sid = page.sessionId, log = [], inflight = new Set();
  let cam = false, last = Date.now();
  const off = browser.on(m => {
    if (m.sessionId !== sid) return;
    const p = m.params || {};
    if (m.method === "Runtime.consoleAPICalled" && (p.args || []).some(a => a.value === MARK)) cam = true;
    else if (m.method === "Network.requestWillBeSent") {
      if (/^(data|blob):/.test(p.request.url)) return;
      inflight.add(p.requestId); last = Date.now();
      log.push({ url: p.request.url, model: isModel(p.request.url), beforeCam: !cam });
    } else if (m.method === "Network.loadingFinished" || m.method === "Network.loadingFailed") { inflight.delete(p.requestId); last = Date.now(); }
  });
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.send("Network.setBypassServiceWorker", { bypass: true }).catch(() => {});
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  if (net) await page.send("Network.emulateNetworkConditions", { offline: false, ...net });
  await page.goto(`${base}/${path}`);
  const quiet = async (capMs = 30000) => {
    const end = Date.now() + capMs;
    while (Date.now() < end) { await sleep(250); if (!inflight.size && Date.now() - last >= 2500) return true; }
    return false;
  };
  return { page, log, quiet, camOpened: () => cam, stop: async () => { off(); await page.close(); } };
}

const pages = readdirSync(new URL("../../", import.meta.url)).filter(f => f.endsWith(".html")).sort();

// the pages that fetched models at load in the baseline; act = how the user (or the page) opens the camera
const WAS_EAGER = {
  "attendance.html": null, "customers.html": null, "driver.html": null, "photobooth.html": null, "checkout.html": null, // the page opens the camera itself
  "booth.html": `document.querySelector("#camStart").click()`,
  "faceread.html": `document.querySelector("#frStartCam").click()`,
  "palm.html": `document.querySelector("#plStartCam").click()`,
  "studio.html": `document.querySelector("#stCamBtn").click()`
};

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const path of pages) {
      await check(`speed: ${path} requests no model file before the camera opens (no user action)`, async () => {
        const o = await open(browser, base, path);
        try {
          await o.quiet(30000);
          const eager = o.log.filter(r => r.model && r.beforeCam).map(r => new URL(r.url).pathname);
          assert(!eager.length, `${path}: model files requested before the camera opened: ${[...new Set(eager)].join(", ")}`);
        } finally { await o.stop(); }
      });
    }
    for (const [path, act] of Object.entries(WAS_EAGER)) {
      await check(`speed: ${path} still loads its models once the camera opens, with a loading line`, async () => {
        // network slowed to 1 MB/s so the loading line can be seen while the models download
        const o = await open(browser, base, path, { net: { latency: 40, downloadThroughput: 1000000, uploadThroughput: 500000 } });
        try {
          if (act) await o.page.evaluate(act);
          const texts = new Set();
          const end = Date.now() + 40000;
          let modelAfter = false;
          while (Date.now() < end) {
            texts.add(await o.page.evaluate("document.body.innerText").catch(() => ""));
            modelAfter = o.log.some(r => r.model && !r.beforeCam);
            if (modelAfter && [...texts].some(t => LOADING.test(t))) break;
            await sleep(100);
          }
          assert(o.camOpened(), `${path}: the camera did not open`);
          assert(modelAfter, `${path}: no model file was requested after the camera opened`);
          assert([...texts].some(t => LOADING.test(t)), `${path}: no loading line while the models download`);
          const eager = o.log.filter(r => r.model && r.beforeCam).map(r => new URL(r.url).pathname);
          assert(!eager.length, `${path}: model files requested before the camera opened: ${eager.join(", ")}`);
        } finally { await o.stop(); }
      });
    }
  } finally { await browser.close(); }
}
