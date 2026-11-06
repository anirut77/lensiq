// tests/e2e/qc-fengshui.e2e.mjs — WP10: qc.html and fengshui.html on LQCam.create (headless, ?cpu, fake cameras).
// qc: a stale stored 'qc-cam' deviceId falls back and goes live; #camSel choice persists across reload.
// fengshui: pagehide stops the track, pageshow restarts it; compass works when getUserMedia is denied.
// Both: no console errors, no horizontal overflow at 390 px.
import { assert, assertNoWebGL } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const DENY = `(function(){const md=navigator.mediaDevices;if(!md)return;md.getUserMedia=async()=>{throw new DOMException("Permission denied","NotAllowedError")};})();`;

async function at390(page) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(400);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, w: innerWidth }));
  await page.send("Emulation.clearDeviceMetricsOverride");
  assert(r.sw <= r.w && r.bw <= r.w, `no horizontal overflow at 390px (scrollWidth ${r.sw}/${r.bw} > ${r.w})`);
}
function noErrors(page, base) {
  // /api/* 404s are the optional AI server probe (fortune-ai.js) on plain http.server, not page errors.
  const errs = page.consoleErrors.filter(e => !/favicon|\/api\//.test((e.url || "") + " " + (e.text || "")) && !(e.kind === "log" && e.source === "network" && /\/api\//.test(e.url || "")));
  assert(!errs.length, "console errors: " + errs.map(e => `${e.kind}: ${(e.text || "").slice(0, 160)} ${(e.url || "").replace(base, "")}`).join(" || "));
}
const qcCam = () => {
  const v = document.getElementById("video"), tr = v.srcObject && v.srcObject.getVideoTracks()[0];
  return tr && tr.readyState === "live" && v.videoWidth > 0 && document.getElementById("engine").classList.contains("ok")
    ? { id: tr.getSettings().deviceId, sel: document.getElementById("camSel").value } : null;
};
async function qcCamera(page) {
  await page.evaluate(() => { const s = document.getElementById("srcSel"); s.value = "camera"; s.dispatchEvent(new Event("change")); });
  return page.waitFor(qcCam, 8000);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    // ---------------- qc ----------------
    let page = await browser.newPage(null, { initScripts: [fakeCams] });
    await check("qc: stale stored qc-cam deviceId falls back and goes live", async () => {
      await page.goto(`${base}/qc.html?cpu`);
      await page.evaluate(() => { localStorage.clear(); localStorage.setItem("qc-cam", JSON.stringify({ deviceId: "gone-cam", label: "Unplugged Cam" })); });
      await page.reload();
      await assertNoWebGL(page);
      const r = await qcCamera(page);
      assert(/^fake-cam-\d$/.test(r.id), "live on a fake camera, got " + r.id);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("qc-cam")));
      assert(stored.deviceId === r.id, "qc-cam now stores the working device: " + JSON.stringify(stored));
      const opts = await page.evaluate(() => [...document.querySelectorAll("#camSel option")].map(o => o.value));
      assert(opts.includes("fake-cam-3"), "#camSel lists cam.devices: " + opts);
    });
    await check("qc: #camSel choice goes live and reload restores it", async () => {
      await page.evaluate(() => { const s = document.getElementById("camSel"); s.value = "fake-cam-3"; s.dispatchEvent(new Event("change")); });
      await page.waitFor(() => { const v = document.getElementById("video"), t = v.srcObject && v.srcObject.getVideoTracks()[0]; return t && t.readyState === "live" && t.getSettings().deviceId === "fake-cam-3" && /fake-cam-3/.test(localStorage.getItem("qc-cam") || ""); }, 8000);
      await page.reload();
      const r = await qcCamera(page);
      assert(r.id === "fake-cam-3", "restored device fake-cam-3, got " + r.id);
      assert(r.sel === "fake-cam-3", "#camSel synced, got " + r.sel);
    });
    await check("qc: flip and pagehide/pageshow keep working", async () => {
      await page.evaluate(() => document.getElementById("flipCam").click());
      await page.waitFor(`(() => { const r = (${qcCam.toString()})(); return r && r.id !== "fake-cam-3" ? r : null; })()`, 8000);
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
      await page.waitFor(() => !document.getElementById("video").srcObject, 3000);
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
      await page.waitFor(qcCam, 8000);
    });
    await check("qc: no console errors, no overflow at 390px", async () => { await at390(page); noErrors(page, base); });
    await page.close();

    // ---------------- fengshui ----------------
    page = await browser.newPage(null, { initScripts: [fakeCams] });
    const fsLive = () => { const v = document.getElementById("fsVideo"), t = v.srcObject && v.srcObject.getVideoTracks()[0]; return !!(t && t.readyState === "live" && document.getElementById("fsArBox").classList.contains("live")); };
    await check("fengshui: loads lensiq-camera.js only (no TF.js / face-api), camera starts with picker", async () => {
      await page.goto(`${base}/fengshui.html?cpu`);
      await page.evaluate(() => localStorage.clear());
      const scripts = await page.evaluate(() => [...document.scripts].map(s => s.src.split("/").pop()));
      assert(scripts.some(s => s.startsWith("lensiq-camera.js")), "lensiq-camera.js loaded");
      assert(!scripts.some(s => /face-api|tf(\.min)?\.js|lensiq-detect/.test(s)), "no ML scripts: " + scripts);
      await page.evaluate(() => document.getElementById("fsCompassStart").click());
      await page.waitFor(fsLive, 8000);
      await page.waitFor(() => { const u = document.querySelector("#fsArBox .fs-cam-ui"); return u && !u.hidden && u.querySelectorAll("option").length === 3; }, 4000);
    });
    await check("fengshui: pagehide stops the track, pageshow restarts it", async () => {
      const tr = await page.evaluate(() => { window.__tr = document.getElementById("fsVideo").srcObject.getVideoTracks()[0]; return true; });
      assert(tr, "track captured");
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
      await page.waitFor(() => window.__tr.readyState === "ended" && !document.getElementById("fsArBox").classList.contains("live"), 3000);
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
      await page.waitFor(fsLive, 8000);
    });
    await check("fengshui: no console errors, no overflow at 390px", async () => { await at390(page); noErrors(page, base); });
    await page.close();

    page = await browser.newPage(null, { initScripts: [fakeCams, DENY] });
    await check("fengshui: compass works when getUserMedia is denied", async () => {
      await page.goto(`${base}/fengshui.html?cpu`);
      await page.evaluate(() => document.getElementById("fsCompassStart").click());
      await page.waitFor(() => { const n = document.getElementById("fsCamNote"); return !n.hidden && /เข็มทิศยังใช้ได้/.test(n.textContent); }, 5000);
      const h = await page.evaluate(() => {
        const s = document.getElementById("fsHeadingSlider"); s.value = "123"; s.dispatchEvent(new Event("input"));
        return document.getElementById("fsHeadingNum").textContent;
      });
      await page.waitFor(() => document.getElementById("fsHeadingNum").textContent === "123°", 3000).catch(() => { throw new Error("heading not shown, got " + h); });
      const live = await page.evaluate(() => document.getElementById("fsArBox").classList.contains("live"));
      assert(!live, "AR box not live without camera");
      const exc = page.consoleErrors.filter(e => e.kind === "exception");
      assert(!exc.length, "uncaught: " + exc.map(e => e.text).join(" | "));
    });
    await page.close();
  } finally { await browser.close(); }
}
