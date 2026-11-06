// tests/e2e/hub.e2e.mjs — drives LQCam.createHub on a blank DOM built inside /index.html with fake cameras.
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const NS = "e2ehub";

// Runs in the page: replace the body with a grid, load lensiq-camera.js, create hub + scheduler.
function mount(ns, mode) {
  window.__LQ_FAKE_CAMS = { n: 3, mode };
  document.body.innerHTML = '<div id="grid" style="display:grid;grid-template-columns:1fr 1fr;width:640px"></div>';
  const ready = window.LQCam ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = "lensiq-camera.js"; s.onload = res; s.onerror = () => rej(new Error("load lensiq-camera.js")); document.head.appendChild(s);
  });
  return ready.then(() => {
    window.__events = [];
    window.__hub = LQCam.createHub({ ns, grid: document.getElementById("grid"), onChange: (h, ev) => window.__events.push(ev.type + ":" + (ev.slot || "")) });
    window.__sched = LQCam.createScheduler({ targetHz: 10 });
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 48;
    window.__readPixel = (video, fx, fy) => {
      const g = cv.getContext("2d", { willReadFrequently: true }); g.drawImage(video, 0, 0, 64, 48);
      return Array.from(g.getImageData(Math.floor(fx * 64), Math.floor(fy * 48), 1, 1).data.slice(0, 3));
    };
    window.__schedAll = () => {
      for (const c of __hub.cams) __sched.add(c.slot, async () => { if (c.active) __readPixel(c.video, 0.5, 0.5); }, { cam: c });
      __sched.start();
    };
    return true;
  });
}
const summary = () => __hub.cams.map(c => ({ slot: c.slot, status: c.status, active: c.active, deviceId: c.deviceId, vw: c.video.videoWidth, inDom: document.contains(c.video) }));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function freshPage(browser, base, fakeCams, mode) {
  const page = await browser.newPage(null, { initScripts: [fakeCams] });
  await page.goto(`${base}/index.html?cpu`);
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(mount, NS, mode);
  return page;
}
async function addExpectCapacity(page) {
  return page.evaluate(async () => {
    try { await __hub.add({}); return { ok: true }; }
    catch (e) { return { ok: false, name: e.name, max: e.max }; }
  });
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("precondition: WebGL absent in the hub page", async () => {
      const page = await browser.newPage(`${base}/index.html?cpu`, { initScripts: [fakeCams] });
      await assertNoWebGL(page);
      await page.close();
    });

    await check("mode ok: 2 adds -> 2 live tiles, reload + restore(), scheduler serves both, unplug(c2)", async () => {
      const page = await freshPage(browser, base, fakeCams, "ok");
      await page.evaluate(async () => { await __hub.add({}); await __hub.add({ name: "ประตูหลัง" }); });
      let s = await page.waitFor(`(() => { const s = (${summary})(); return s.length === 2 && s.every(c => c.status === "live" && c.active && c.vw > 0 && c.inDom) && s; })()`, 5000);
      assert(s[0].deviceId !== s[1].deviceId, "distinct devices " + JSON.stringify(s));
      // the tiles really show their own device (colour) and the scripted white box
      const px = await page.waitFor(`(() => { const a = __readPixel(__hub.cam("c1").video, 0.02, 0.02), b = __readPixel(__hub.cam("c2").video, 0.02, 0.02); return a[0] > 150 && b[1] > 120 && b[0] < 100 && {a, b}; })()`, 3000);
      assert(px, "pixels");
      const tiles = await page.evaluate(() => document.querySelectorAll("#grid [data-slot]").length);
      assert(tiles === 2, "2 tiles, got " + tiles);
      const dup = await page.evaluate(async () => { try { await __hub.add({ deviceId: __hub.cam("c1").deviceId }); return null; } catch (e) { return e.name; } });
      assert(dup === "DuplicateCamera", "duplicate add rejected, got " + dup);
      const saved = await page.evaluate(ns => JSON.parse(localStorage.getItem(ns + "-cams")), NS);
      assert(saved.cams.length === 2 && saved.cams[1].name === "ประตูหลัง", "saved " + JSON.stringify(saved));

      await page.reload();
      await page.evaluate(mount, NS, "ok");
      const restored = await page.evaluate(async () => (await __hub.restore()).map(c => c.slot));
      assert(restored.join() === "c1,c2", "restored " + restored);
      s = await page.waitFor(`(() => { const s = (${summary})(); return s.length === 2 && s.every(c => c.status === "live" && c.vw > 0) && s; })()`, 5000);
      assert(s[0].deviceId === saved.cams[0].deviceId && s[1].deviceId === saved.cams[1].deviceId, "same devices after restore");
      assert(await page.evaluate(() => __hub.cam("c2").name) === "ประตูหลัง", "name restored");

      await page.evaluate(() => __schedAll());
      const st = await page.waitFor(`(() => { const st = __sched.stats(); return st.c1 && st.c2 && st.c1.n > 0 && st.c2.n > 0 && st; })()`, 3000);
      assert(st.c1.n > 0 && st.c2.n > 0, "stats " + JSON.stringify(st));
      assert(await page.evaluate(() => __hub.cam("c1").frames > 0 && __hub.cam("c2").frames > 0), "cam.frames updated via noteInfer");

      await page.evaluate(() => __LQ_FAKE.unplug(__hub.cam("c2").deviceId));
      await page.waitFor(`__hub.cam("c2").status === "error" && __hub.cam("c1").status === "live" && __hub.cam("c1").active`, 3000);
      await sleep(300);
      assert(await page.evaluate(() => __hub.cam("c1").active && __hub.cam("c1").status === "live"), "c1 stays live after unplug(c2)");
      await page.evaluate(() => { __sched.stop(); __hub.destroy(); });
      await privacyScan(page);
      const cap = await page.evaluate(() => localStorage.getItem("lq-camcap"));
      assert(cap === null, "no capacity recorded in mode ok, got " + cap);
      await page.close();
    });

    for (const mode of ["muteOthers", "throwOthers"]) {
      await check(`mode ${mode}: 2nd add throws CapacityError, c1 live again within 2 s, lq-camcap.maxLive === 1`, async () => {
        const page = await freshPage(browser, base, fakeCams, mode);
        await page.evaluate(() => __hub.add({}));
        await page.waitFor(`__hub.cam("c1") && __hub.cam("c1").status === "live" && __hub.cam("c1").video.videoWidth > 0`, 5000);
        const r = await addExpectCapacity(page);
        const tThrow = Date.now();
        assert(!r.ok && r.name === "CapacityError" && r.max === 1, "expected CapacityError max 1, got " + JSON.stringify(r));
        await page.waitFor(`__hub.cams.length === 1 && __hub.cam("c1").status === "live" && __hub.cam("c1").active && !__hub.cam("c1").stream.getVideoTracks()[0].muted`, 2000);
        assert(Date.now() - tThrow <= 2500, "c1 live again quickly");
        const cap = await page.evaluate(() => JSON.parse(localStorage.getItem("lq-camcap")));
        assert(cap && cap.v === 1 && cap.maxLive === 1 && Number.isFinite(cap.at), "lq-camcap " + JSON.stringify(cap));
        assert(await page.evaluate(() => __hub.capacity) === 1, "hub.capacity === 1");
        assert(await page.evaluate(() => document.querySelectorAll("#grid [data-slot]").length) === 1, "rolled-back tile removed");
        // known capacity: refused up front, c1 untouched
        const r2 = await addExpectCapacity(page);
        assert(!r2.ok && r2.name === "CapacityError", "known capacity refuses at once: " + JSON.stringify(r2));
        assert(await page.evaluate(() => __hub.cam("c1").active), "c1 still live");
        await page.evaluate(() => __hub.destroy());
        await privacyScan(page);
        await page.close();
      });
    }
  } finally { await browser.close(); }
}
