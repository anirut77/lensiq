// tests/e2e/single-subject.e2e.mjs — WP6: faceread / photobooth ID / palm refuse to mix two subjects.
// Pages run with ?cpu&fakedet: the scripted detector (window.__LQ_FAKE_DET) replaces the models, so no model download.
// window.__dets (normalised boxes) is what every fake detector call returns; tests switch it between 1 and 2 subjects.
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };   // centred, frontal-sized
const OTHER = { x: 0.02, y: 0.3, w: 0.22, h: 0.35, score: 0.9 };  // second person at the left edge
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95 };
const HAND2 = { x: 0.02, y: 0.3, w: 0.25, h: 0.5, score: 0.9 };

// After fake-cams.js: one camera, scripted detections, and an optional torch capability on every fake track.
const detScript = `(() => {
  window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" };
  window.__dets = [];
  window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d));
  if (window.__LQ_TORCH) {
    const md = navigator.mediaDevices, g = md.getUserMedia;
    md.getUserMedia = async c => {
      const s = await g.call(md, c), t = s.getVideoTracks()[0], gc = t.getCapabilities.bind(t);
      t.getCapabilities = () => Object.assign({}, gc(), { torch: true });
      t.applyConstraints = async x => { (window.__torchCalls = window.__torchCalls || []).push(JSON.stringify(x)); };
      return s;
    };
  }
})();`;

/** Console errors except the known /api/<x>/status 404 under plain http.server. */
function realErrors(page) {
  return page.consoleErrors.filter(e => !/\/api\/[a-z]+\/status/.test((e.url || "") + " " + (e.text || "")) && !(e.kind !== "exception" && /404/.test(e.text || "") && /\/api\//.test(e.url || "")));
}
/** Privacy scan; the GET /api/<x>/status capability probe of fortune-ai.js carries no data and is excluded. */
async function privacy(page) {
  for (let i = page.requests.length - 1; i >= 0; i--) {
    const r = page.requests[i];
    if (r.method === "GET" && /\/api\/[a-z]+\/status$/.test(new URL(r.url).pathname)) page.requests.splice(i, 1);
  }
  return privacyScan(page);
}
async function open(browser, url, fakeCams, pre = "") {
  const page = await browser.newPage(null, { initScripts: [pre, fakeCams, detScript].filter(Boolean) });
  await page.goto(url);
  return page;
}
async function noOverflow390(page) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(400);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  await page.send("Emulation.clearDeviceMetricsOverride");
  assert(r.sw <= r.cw + 1, "horizontal overflow at 390px: " + JSON.stringify(r));
}
const setDets = (page, dets) => page.evaluate(d => { window.__dets = d; }, dets);

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("faceread: 2 faces -> 'มีใบหน้าเดียวในกรอบ' fails and อ่านโหงวเฮ้ง is disabled; 1 face enables it", async () => {
      const page = await open(browser, `${base}/faceread.html?cpu&fakedet`, fakeCams);
      await assertNoWebGL(page);
      await page.evaluate(() => document.getElementById("frStartCam").click());
      await page.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 8000);
      await setDets(page, [FACE, OTHER]);
      const two = await page.waitFor(`(() => { const li = [...document.querySelectorAll("#frQc li")].find(l => l.textContent.includes("มีใบหน้าเดียวในกรอบ")); return li && li.classList.contains("no") && { disabled: document.getElementById("frRead").disabled }; })()`, 5000);
      assert(two.disabled === true, "btnRead disabled with 2 faces");
      await sleep(800);
      assert(await page.evaluate(() => document.getElementById("frRead").disabled), "btnRead stays disabled");
      await setDets(page, [FACE]);
      await page.waitFor(`!document.getElementById("frRead").disabled`, 5000);
      await setDets(page, [FACE, OTHER]);
      await page.waitFor(`document.getElementById("frRead").disabled`, 5000);
      // one face again -> a full camera reading completes (locked capture, local narration)
      await setDets(page, [FACE]);
      await page.waitFor(`!document.getElementById("frRead").disabled`, 5000);
      await page.evaluate(() => document.getElementById("frRead").click());
      await page.waitFor(`!document.getElementById("frResult").hidden && window.__fr.current && window.__fr.current.pts.length === 68`, 15000);
      await privacy(page);
      await noOverflow390(page);
      const errs = realErrors(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("photobooth ID: 2 faces -> hint 'มีบุคคลอื่นในภาพ', no auto-shoot; 1 face -> auto-shoot fires", async () => {
      const page = await open(browser, `${base}/photobooth.html?cpu&fakedet`, fakeCams);
      await page.waitFor(`document.getElementById("video").videoWidth > 0`, 8000);
      await page.evaluate(() => { document.querySelector('.tab[data-t="id"]').click(); });
      await setDets(page, [FACE, OTHER]);
      await page.evaluate(() => { document.getElementById("autoShoot").checked = true; });
      await page.waitFor(`document.getElementById("shootHint").textContent.includes("มีบุคคลอื่นในภาพ")`, 6000);
      const vis = await page.evaluate(() => { const h = document.getElementById("shootHint"); return !!(h.offsetWidth || h.offsetHeight) && getComputedStyle(h).visibility !== "hidden"; });
      assert(vis, "hint is visible");
      await sleep(3000); // 6 ticks of 500 ms: 3 good ticks would have shot
      const st = await page.evaluate(() => ({ auto: document.getElementById("autoShoot").checked, count: document.getElementById("count").textContent, hint: document.getElementById("shootHint").textContent }));
      assert(st.auto === true && st.count === "", "no auto-shoot with 2 faces: " + JSON.stringify(st));
      assert(st.hint.includes("มีบุคคลอื่นในภาพ"), "hint persists");
      // positive control: one still, centred face -> the auto-shoot clicks the shutter (and unticks itself)
      await setDets(page, [FACE]);
      await page.waitFor(`!document.getElementById("autoShoot").checked`, 6000);
      await sleep(4500); // let the shot (countdown + cut-out) settle before scanning
      await privacy(page);
      await noOverflow390(page);
      const errs = realErrors(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("palm: 2 hands -> 'ใช้มือเดียวในกรอบ' warning; torch control shown when the track reports torch", async () => {
      const page = await open(browser, `${base}/palm.html?cpu&fakedet`, fakeCams, "window.__LQ_TORCH = true;");
      await page.evaluate(() => document.getElementById("plStartCam").click());
      await page.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 8000);
      const torch = await page.waitFor(`(() => { const t = document.querySelector("#plCam .cam-torch"); return t && !t.hidden && !t.closest(".cam-ctl").hidden && t.offsetWidth > 0 && { calls: window.__torchCalls || [] }; })()`, 5000);
      assert(torch.calls.some(c => c.includes('"torch":true')), "torch switched on at start: " + JSON.stringify(torch.calls));
      await setDets(page, [HAND, HAND2]);
      await page.waitFor(`(() => { const m = document.getElementById("plMulti"); const li = [...document.querySelectorAll("#plQc li")].find(l => l.textContent.includes("ใช้มือเดียวในกรอบ")); return !m.hidden && m.offsetWidth > 0 && li && li.classList.contains("no"); })()`, 5000);
      await setDets(page, [HAND]);
      await page.waitFor(`document.getElementById("plMulti").hidden && [...document.querySelectorAll("#plQc li")].some(l => l.textContent.includes("ใช้มือเดียวในกรอบ") && l.classList.contains("ok"))`, 5000);
      await privacy(page);
      await noOverflow390(page);
      const errs = realErrors(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("palm without torch capability: no torch button", async () => {
      const page = await open(browser, `${base}/palm.html?cpu&fakedet`, fakeCams);
      await page.evaluate(() => document.getElementById("plStartCam").click());
      await page.waitFor(`document.querySelector("#plCam.live")`, 8000);
      await sleep(500);
      const shown = await page.evaluate(() => { const t = document.querySelector("#plCam .cam-torch"); return !!(t && t.offsetWidth); });
      assert(!shown, "torch hidden without capability");
      await page.close();
    });
  } finally { await browser.close(); }
}
