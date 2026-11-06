// tests/e2e/store.e2e.mjs — store.html multi-camera (fake cams n=3 + ?fakedet): per-camera lines/zones/roles feeding one day,
// reload restores tiles with their lines, capacity message on a one-camera device, privacy scan, 390 px layout.
// Optional real-model smoke (no fakedet, 2 cams, 20 s): set LQ_REAL=1.
import { assert, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LINE = { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } }; // vertical; moving right->left = "in", left->right = "out"
const ZONE = { id: "z1", name: "ชั้นวาง", x: 0.6, y: 0, w: 0.4, h: 1 };

function seed(line, zone) {
  localStorage.clear();
  localStorage.setItem("st-cams", JSON.stringify({ v: 1, cams: [
    { slot: "c1", deviceId: "fake-cam-1", label: "Fake Camera 1", name: "ประตูหน้า", role: "door" },
    { slot: "c2", deviceId: "fake-cam-2", label: "Fake Camera 2", name: "ประตูหลัง", role: "both" },
    { slot: "c3", deviceId: "fake-cam-3", label: "Fake Camera 3", name: "ชั้นวาง", role: "zone" }] }));
  localStorage.setItem("st-cam-c1", JSON.stringify({ line, swap: false, zones: [], detW: 0 }));
  localStorage.setItem("st-cam-c2", JSON.stringify({ line, swap: false, zones: [zone], detW: 0 }));
  localStorage.setItem("st-cam-c3", JSON.stringify({ line, swap: false, zones: [zone], detW: 0 }));
  localStorage.setItem("st-settings", JSON.stringify({ sv: 2, maxOcc: 20, serviceSec: 60, queueAlert: 5, queueZone: "", cashierZone: "" }));
}
// scripted people: c1 walks right->left (in), c2 left->right (out) then dwells in z1, c3 (role zone) crosses too but must not count
function script() {
  const T0 = {};
  const box = x => [{ x: x - 0.05, y: 0.3, w: 0.1, h: 0.4, score: 0.95 }];
  const path = (t, from, to) => t < 0.5 ? from : t < 2.5 ? from + (to - from) * (t - 0.5) / 2 : to;
  window.__LQ_FAKE_DET = (key, now) => {
    if (T0[key] == null) T0[key] = now;
    const t = (now - T0[key]) / 1000;
    if (key === "c1") return t < 3.5 ? box(path(t, 0.8, 0.2)) : [];
    if (key === "c2" || key === "c3") return t < 5 ? box(path(t, 0.2, 0.8)) : [];
    return [];
  };
}
const unexpected = (page, base) => page.consoleErrors.filter(e => e.kind === "exception" || (e.kind === "console") ||
  (e.kind === "log" && !/fonts\.(googleapis|gstatic)/.test(e.url || e.text || "") && !/favicon/.test(e.url || "")));

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const url = `${base}/store.html?cpu&fakedet`;
  try {
    await check("3 cameras: c1 in, c2 out, c2 zone dwell under 'c2:z1', role zone never counts; reload restores 3 tiles with lines", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:3,mode:'ok'}"] });
      await page.goto(url);
      await page.evaluate(seed, LINE, ZONE);
      await page.reload();
      await page.evaluate(script);
      await page.evaluate(() => document.getElementById("startCam").click());
      await page.waitFor(`__ST.running && __ST.hub.cams.length === 3 && __ST.hub.cams.every(c => c.status === "live")`, 8000);
      const r = await page.waitFor(`(() => { const d = __ST.day; return d.in >= 1 && d.out >= 1 && d.zones["c2:z1"] && d.zones["c2:z1"].dwellN >= 1 && d.zones["c3:z1"] && d.zones["c3:z1"].visits >= 1 && JSON.parse(JSON.stringify(d)); })()`, 15000);
      assert(r.in === 1 && r.out === 1, `in/out ${r.in}/${r.out}`);
      assert(r.byCam.c1.in === 1 && r.byCam.c1.out === 0, "byCam.c1 " + JSON.stringify(r.byCam.c1));
      assert(r.byCam.c2.out === 1 && r.byCam.c2.in === 0, "byCam.c2 " + JSON.stringify(r.byCam.c2));
      assert(!r.byCam.c3 || (r.byCam.c3.in === 0 && r.byCam.c3.out === 0), "role zone camera changed in/out " + JSON.stringify(r.byCam.c3));
      assert(r.zones["c2:z1"].visits === 1 && !r.zones.z1 && !r.zones["c1:z1"], "zones " + Object.keys(r.zones));
      const hz = await page.waitFor(`(() => { const t = [...document.querySelectorAll("#camGrid .st-hz")].map(e => parseFloat(e.textContent)); return t.length === 3 && t.every(x => x > 0) && t; })()`, 4000);
      assert(hz.length === 3, "Hz pills " + hz);
      // persisted (aggregate numbers only)
      await page.evaluate(() => document.getElementById("stop").click());
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /^st-day-/.test(k)))));
      assert(saved.in === 1 && saved.out === 1 && saved.byCam.c1.in === 1 && saved.zv === 2, "saved day " + JSON.stringify(saved).slice(0, 200));
      assert(await page.evaluate(() => !!localStorage.getItem("st-heat-c2")), "per-camera heat saved");

      await page.reload();
      await page.evaluate(() => { window.__LQ_FAKE_DET = () => []; document.getElementById("startCam").click(); });
      const t = await page.waitFor(`(() => { const c = __ST.hub.cams; return c.length === 3 && c.every(x => x.status === "live") && c.map(x => ({ slot: x.slot, line: !!(x.settings && x.settings.line), name: x.name, role: x.role })); })()`, 8000);
      assert(t.every(x => x.line) && t[0].name === "ประตูหน้า" && t[2].role === "zone", "restored " + JSON.stringify(t));
      assert(await page.evaluate(() => document.querySelectorAll("#camGrid .st-tile").length) === 3, "3 tiles");
      // 390 px: no horizontal overflow with 3 tiles
      await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await sleep(400);
      const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      assert(ov.sw <= ov.cw, "horizontal overflow at 390px " + JSON.stringify(ov));
      await page.send("Emulation.clearDeviceMetricsOverride");
      await page.evaluate(() => document.getElementById("stop").click());
      await privacyScan(page);
      const errs = unexpected(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("legacy single-camera data is migrated and still shown (line, zones, day zones, heat)", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams] });
      await page.goto(`${base}/index.html`);
      const today = await page.evaluate(() => {
        localStorage.clear();
        const d = new Date(), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        localStorage.setItem("st-settings", JSON.stringify({ line: { a: { x: .5, y: 0 }, b: { x: .5, y: 1 } }, swap: true, zones: [{ id: "zq", name: "คิวเก่า", queue: true, cashier: false, x: 0, y: 0, w: .3, h: .3 }], maxOcc: 9, serviceSec: 60, queueAlert: 5, detW: 416, heatOn: false }));
        localStorage.setItem("st-heat", JSON.stringify(Array(64 * 48).fill(0).map((_, i) => i === 5 ? 3 : 0)));
        localStorage.setItem("st-day-" + k, JSON.stringify({ date: k, in: 7, out: 5, occ: 2, peak: 4, peakAt: 1, maxQueue: 1, hourly: { in: Array(24).fill(0), out: Array(24).fill(0) }, zones: { zq: { name: "คิวเก่า", visits: 3, dwellSum: 9000, dwellN: 3, peak: 1 } } }));
        return k;
      });
      await page.goto(url);
      const r = await page.evaluate(k => ({
        cams: JSON.parse(localStorage.getItem("st-cams")), c1: JSON.parse(localStorage.getItem("st-cam-c1")),
        set: JSON.parse(localStorage.getItem("st-settings")), day: JSON.parse(localStorage.getItem("st-day-" + k)),
        heat: !!localStorage.getItem("st-heat-c1") && !!localStorage.getItem("st-heat"),
        tiles: document.getElementById("tiles").textContent, table: document.getElementById("zoneTable").textContent
      }), today);
      assert(r.cams.cams[0].slot === "c1" && r.c1.line && r.c1.swap === true && r.c1.zones[0].id === "zq", "cam-c1 " + JSON.stringify(r.c1));
      assert(r.set.queueZone === "c1:zq" && r.set.maxOcc === 9 && r.set.line, "settings " + JSON.stringify(r.set));
      assert(r.day.in === 7 && r.day.zones["c1:zq"].visits === 3 && r.day.zv === 2 && r.heat, "day " + JSON.stringify(r.day).slice(0, 200));
      assert(/คิวเก่า/.test(r.table) && /3/.test(r.table), "zone table " + r.table);
      await page.close();
    });

    await check("muteOthers: + เพิ่มกล้อง shows the capacity message and leaves 1 working camera", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:3,mode:'muteOthers'}"] });
      await page.goto(url);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.evaluate(() => { window.__LQ_FAKE_DET = () => []; document.getElementById("startCam").click(); });
      await page.waitFor(`__ST.running && __ST.hub.cams.length === 1 && __ST.hub.cams[0].status === "live"`, 6000);
      await page.evaluate(() => document.getElementById("addCam").click());
      const msg = await page.waitFor(`(() => { const t = document.getElementById("engine").textContent; return /สูงสุด 1 ตัว/.test(t) && t; })()`, 6000);
      assert(/มือถือ/.test(msg), msg);
      await page.waitFor(`__ST.hub.cams.length === 1 && __ST.hub.cams[0].active && !__ST.hub.cams[0].stream.getVideoTracks()[0].muted`, 3000);
      assert(await page.evaluate(() => document.querySelectorAll("#camGrid .st-tile").length) === 1, "1 tile");
      await page.evaluate(() => document.getElementById("stop").click());
      await privacyScan(page);
      await page.close();
    });

    if (process.env.LQ_REAL) {
      await check("real model (WASM, no fakedet): 2 cameras for 20 s — tensors stable, both tiles Hz > 0", async () => {
        const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:2,mode:'ok'}"] });
        await page.goto(`${base}/store.html?cpu`);
        await page.evaluate(() => { localStorage.clear(); localStorage.setItem("st-cams", JSON.stringify({ v: 1, cams: [{ slot: "c1", deviceId: "fake-cam-1", name: "A", role: "both" }, { slot: "c2", deviceId: "fake-cam-2", name: "B", role: "both" }] })); });
        await page.reload();
        await page.evaluate(() => document.getElementById("startCam").click());
        await page.waitFor(`__ST.running && __ST.hub.cams.length === 2`, 60000);
        await sleep(3000);
        // YOLOX-Nano (ONNX Runtime) is the default detector, so TF.js may be idle: initialise it to read its tensor count
        await page.evaluate(() => LQDetect.tfBackend());
        const eng = await page.evaluate(() => document.getElementById("engine").textContent);
        assert(/YOLOX-Nano/.test(eng), "default detector YOLOX-Nano: " + eng);
        const n0 = await page.evaluate(() => faceapi.tf.memory().numTensors);
        await sleep(20000);
        const n1 = await page.evaluate(() => faceapi.tf.memory().numTensors);
        const hz = await page.evaluate(() => [...document.querySelectorAll("#camGrid .st-hz")].map(e => parseFloat(e.textContent)));
        console.log(`       tensors ${n0} -> ${n1}, Hz ${hz.join(", ")}`);
        assert(n1 - n0 <= 5, `tensor growth ${n1 - n0}`);
        assert(hz.length === 2 && hz.every(x => x > 0), "Hz " + hz);
        await page.evaluate(() => document.getElementById("stop").click());
        await page.close();
      });
    } else console.log("  skip real-model smoke (set LQ_REAL=1)");
  } finally { await browser.close(); }
}
