// tests/e2e/store-reid.e2e.mjs — store.html accuracy features (headless, ?cpu&fakedet, fake cameras, no WebGL):
// - 'ลดการนับซ้ำ' with scripted embeddings: a person hidden then re-appearing and crossing again is counted once
//   (control: the same script with the setting off counts twice); embeddings are cleared on stop
// - real MobileNetV2 on WASM (fake camera frames): embeddings computed in-app, latency reported, tensors stable
// - staff zone: a person who stays behind the counter is not counted on the line / zones; staff offset on occupancy
// - hub: main KPI tiles show combined totals with the 'เฉพาะเครื่องนี้/รวมทุกเครื่อง' toggle; alerts, target tile, summary
// - privacy: no images/embeddings in localStorage, no IndexedDB, empty sessionStorage; no overflow at 390/1280
import { assert, assertNoWebGL } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function seed(opts) {
  localStorage.clear();
  localStorage.setItem("st-cams", JSON.stringify({ v: 1, cams: [{ slot: "c1", deviceId: "fake-cam-1", label: "Fake Camera 1", name: "ประตู", role: opts.role || "door" }] }));
  localStorage.setItem("st-cam-c1", JSON.stringify({ line: { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } }, swap: false, zones: opts.zones || [], detW: 0, staffZone: opts.staffZone || null }));
  localStorage.setItem("st-settings", JSON.stringify({ sv: 2, maxOcc: 20, serviceSec: 60, queueAlert: 5, queueZone: "", cashierZone: "", ...opts.settings }));
}
// person A: walks in (right -> left), hidden 1.8 s, re-appears outside at x=0.7 and walks in again
function doorScript(withEmb) {
  let T0 = null;
  const box = x => [{ x: x - 0.05, y: 0.3, w: 0.1, h: 0.4, score: 0.95 }];
  const lerp = (t, t0, t1, a, b) => a + (b - a) * Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  window.__LQ_FAKE_DET = (key, now) => {
    if (key !== "c1") return [];
    if (T0 == null) T0 = now;
    const t = (now - T0) / 1000;
    if (t < 0.5) return box(0.8);
    if (t < 2.0) return box(lerp(t, 0.5, 2.0, 0.8, 0.3));
    if (t < 3.8) return [];
    if (t < 4.3) return box(0.7);
    if (t < 5.8) return box(lerp(t, 4.3, 5.8, 0.7, 0.3));
    return [];
  };
  if (withEmb) {
    const base = Array.from({ length: 32 }, (_, i) => Math.sin(i * 1.7 + 0.3));
    window.__LQ_FAKE_EMB = () => base.map(v => v + (Math.random() - 0.5) * 0.05);
  }
  window.__t0 = () => T0;
}
// person S: stands behind the counter (x 0.9) 4.5 s, then walks to the shelf zone (x 0.2) and stays
function staffScript() {
  let T0 = null;
  const box = x => [{ x: x - 0.05, y: 0.3, w: 0.1, h: 0.4, score: 0.95 }];
  window.__LQ_FAKE_DET = (key, now) => {
    if (key !== "c1") return [];
    if (T0 == null) T0 = now;
    const t = (now - T0) / 1000;
    if (t < 4.5) return box(0.9);
    if (t < 6.5) return box(0.9 - 0.7 * (t - 4.5) / 2);
    if (t < 9) return box(0.2);
    return [];
  };
  window.__t0 = () => T0;
}
const unexpected = page => page.consoleErrors.filter(e => !/favicon|fonts\.(googleapis|gstatic)/.test((e.url || "") + " " + (e.text || "")) && !/\/api\//.test((e.url || "") + " " + (e.text || "")));
async function overflow(page, width) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await sleep(400);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  await page.send("Emulation.clearDeviceMetricsOverride");
  assert(r.sw <= r.cw, `no horizontal overflow at ${width}px ${JSON.stringify(r)}`);
}
async function privacy(page) {
  const r = await page.evaluate(async () => {
    const out = { img: [], big: [], vec: [] };
    for (const k of Object.keys(localStorage)) {
      const v = localStorage.getItem(k) || "";
      if (/data:image/i.test(v)) out.img.push(k);
      if (v.length > 200 * 1024) out.big.push(k);
      if (/^st-heat/.test(k)) continue; // heat grid: 64x48 counts, no people
      // any long array of non-integer numbers or an 'emb' field = embedding leak
      if (/"emb"|"embedding"|"descriptor"/i.test(v)) out.vec.push(k);
      try { (function walk(o) { if (Array.isArray(o)) { if (o.length >= 32 && o.every(x => typeof x === "number") && o.some(x => !Number.isInteger(x))) out.vec.push(k); o.forEach(walk); } else if (o && typeof o === "object") Object.values(o).forEach(walk); })(JSON.parse(v)); } catch { /* not JSON */ }
    }
    out.dbs = indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : [];
    out.ss = sessionStorage.length;
    return out;
  });
  assert(!r.img.length && !r.big.length && !r.vec.length, "storage leak " + JSON.stringify(r));
  assert(!r.dbs.length, "store uses no IndexedDB: " + r.dbs);
  assert(r.ss === 0, "sessionStorage empty");
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const url = `${base}/store.html?cpu&fakedet`;
  const init = [fakeCams, "window.__LQ_FAKE_CAMS={n:2,mode:'ok'}"];
  async function runDoor(page, reid) {
    await page.goto(`${base}/index.html`);
    await page.evaluate(seed, { settings: { reid, reidWindowSec: 10 } });
    await page.goto(url);
    await page.evaluate(doorScript, reid);
    await page.evaluate(() => document.getElementById("startCam").click());
    await page.waitFor(`__ST.running && __ST.hub.cams[0] && __ST.hub.cams[0].status === "live"`, 8000);
    await page.waitFor(`window.__t0() != null && performance.now() - window.__t0() > 7000`, 15000);
    return page.evaluate(() => ({ in: __ST.day.in, out: __ST.day.out, dedup: __ST.day.dedup, stats: __ST.reidStats(), info: document.getElementById("reidInfo").textContent, reid: [...__ST.pipes.values()].map(p => p.reid && p.reid.stats) }));
  }
  try {
    await check("re-ID on (scripted embeddings): hidden person re-appearing and crossing again is counted once; off = twice", async () => {
      const page = await browser.newPage(null, { initScripts: init });
      await page.goto(`${base}/index.html`);
      await assertNoWebGL(page);
      const on = await runDoor(page, true);
      assert(on.in === 1, "re-ID on: in " + JSON.stringify(on));
      assert(on.dedup.suppressed + on.dedup.revived >= 1 && on.dedup.suppressed >= 1, "dedup counters " + JSON.stringify(on.dedup));
      assert(on.reid[0] && on.reid[0].embeds >= 1, "embeddings computed " + JSON.stringify(on.reid));
      assert(/ลดการนับซ้ำ: เปิด/.test(on.info), "status line " + on.info);
      const sum = await page.evaluate(() => document.getElementById("summary").textContent);
      assert(/ไม่นับข้ามเส้นซ้ำ/.test(sum), "summary mentions dedup: " + sum);
      // stop: embeddings dropped with the pipes
      await page.evaluate(() => document.getElementById("stop").click());
      assert(await page.evaluate(() => __ST.pipes.size === 0), "pipes (and their embeddings) cleared on stop");
      await privacy(page);
      const off = await runDoor(page, false);
      assert(off.in === 2, "re-ID off (control): in " + JSON.stringify(off));
      assert(off.reid.every(r => r == null), "no re-ID state when off");
      await page.evaluate(() => document.getElementById("stop").click());
      const errs = unexpected(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("re-ID with the real MobileNetV2 on WASM (fake camera frames): embeds measured, tensors stable", async () => {
      const page = await browser.newPage(null, { initScripts: init });
      await page.goto(`${base}/index.html`);
      await page.evaluate(seed, { settings: { reid: true } });
      await page.goto(url);
      await page.evaluate(doorScript, false);
      await page.evaluate(() => document.getElementById("startCam").click());
      await page.waitFor(`__ST.running && __ST.reidStats().loaded`, 30000);
      await page.evaluate(doorScript, false); // restart the walk once the model is ready
      const be = await page.evaluate(() => LQDetect.tfBackend());
      assert(be === "wasm", "backend " + be);
      const r = await page.waitFor(`(() => { const s = __ST.reidStats(); return s.n >= 2 && s.ms > 0 && s; })()`, 20000);
      const n0 = await page.evaluate(() => faceapi.tf.memory().numTensors);
      await sleep(3000);
      const n1 = await page.evaluate(() => faceapi.tf.memory().numTensors);
      console.log(`       MobileNetV2 re-ID in page: ${r.ms.toFixed(1)} ms/embed (EMA, WASM), ${r.n} embeds; tensors ${n0} -> ${n1}`);
      assert(n1 - n0 <= 3, `tensor growth ${n1 - n0}`);
      await page.evaluate(() => document.getElementById("stop").click());
      await privacy(page);
      await page.close();
    });

    await check("staff zone: a person behind the counter > X min is excluded from line, zones and heat; staff offset on occupancy", async () => {
      const page = await browser.newPage(null, { initScripts: init });
      await page.goto(`${base}/index.html`);
      await page.evaluate(seed, { role: "both", zones: [{ id: "z1", name: "ชั้นวาง", x: 0, y: 0, w: 0.4, h: 1 }], staffZone: { x: 0.75, y: 0, w: 0.25, h: 1 }, settings: { staffMin: 0.05, staffOffset: 1 } });
      await page.goto(url);
      await page.evaluate(staffScript);
      await page.evaluate(() => document.getElementById("startCam").click());
      await page.waitFor(`__ST.running && __ST.hub.cams[0] && __ST.hub.cams[0].status === "live"`, 8000);
      await page.waitFor(`__ST.day.staff >= 1`, 8000);
      await page.waitFor(`window.__t0() != null && performance.now() - window.__t0() > 8500`, 15000);
      const d = await page.evaluate(() => JSON.parse(JSON.stringify(__ST.day)));
      assert(d.staff === 1 && d.in === 0 && d.out === 0, "staff not counted " + JSON.stringify({ staff: d.staff, in: d.in, out: d.out }));
      assert(!d.zones["c1:z1"] || d.zones["c1:z1"].visits === 0, "no zone visit by staff " + JSON.stringify(d.zones));
      const tiles = await page.evaluate(() => document.getElementById("tiles").textContent);
      assert(/ไม่นับพนักงาน 1 คน/.test(tiles), "offset shown: " + tiles);
      await page.evaluate(() => document.getElementById("stop").click());
      const heat = await page.evaluate(() => JSON.parse(localStorage.getItem("st-heat-c1") || "[]"));
      const H = 48, W = 64;
      let left = 0; for (let y = 0; y < H; y++) for (let x = 0; x < 26; x++) left += heat[y * W + x] || 0;
      assert(left === 0, "staff not in heatmap (left side sum " + left + ")");
      await privacy(page);
      const errs = unexpected(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("hub: KPI tiles combine own + paired devices with a local/all toggle; alerts, hourly target, summary; 390/1280 layout", async () => {
      const page = await browser.newPage(null, { initScripts: init });
      await page.goto(`${base}/index.html`);
      const date = today();
      await page.evaluate(date => {
        localStorage.clear();
        const h = new Date().getHours(), z = () => Array(24).fill(0);
        const hin = z(); hin[h] = 3; const hout = z(); hout[h] = 1;
        localStorage.setItem("st-settings", JSON.stringify({ sv: 2, maxOcc: 11, serviceSec: 60, queueAlert: 5, queueZone: "", cashierZone: "", hourlyTarget: 2 }));
        localStorage.setItem("st-day-" + date, JSON.stringify({ date, in: 3, out: 1, occ: 2, peak: 2, peakAt: Date.now(), maxQueue: 0, hourly: { in: hin, out: hout }, zones: {}, byCam: {}, zv: 2 }));
        const pin = z(); pin[h] = 12; const pout = z(); pout[h] = 4;
        const pack = { v: 1, format: "lensiq-agg", node: "nabcdefgh123", name: "ประตูหลัง", date, in: 12, out: 4, occ: 8, peak: 8, peakAt: 0, maxQueue: 0, t: Date.now(), hourlyIn: pin, hourlyOut: pout, zones: {}, byCam: {} };
        localStorage.setItem("st-agg-" + date, JSON.stringify({ v: 1, nodes: { nabcdefgh123: { ...pack, src: "import", receivedAt: Date.now() } } }));
        localStorage.setItem("lq-agg", JSON.stringify({ role: "hub" }));
      }, date);
      await page.goto(url);
      const all = await page.waitFor(`(() => { const t = document.getElementById("tiles").textContent; return !document.getElementById("kpiScope").hidden && /รวม 2 เครื่อง/.test(t) && t; })()`, 6000);
      const val = () => page.evaluate(() => +document.querySelector("#tiles .tile.in .v").textContent);
      assert(await val() === 15, "combined in = 3 + 12, tiles: " + all);
      const alerts = await page.evaluate(() => [...document.querySelectorAll("#alerts .alert")].map(a => a.className + ":" + a.textContent));
      assert(alerts.some(a => /คนในร้าน 10 คน ใกล้ถึง/.test(a) && /warn/.test(a)), "near-capacity warning on combined occupancy " + alerts);
      await page.evaluate(() => document.querySelector('#kpiScope [data-scope="local"]').click());
      assert(await val() === 3, "local only");
      assert(await page.evaluate(() => JSON.parse(localStorage.getItem("st-settings")).kpiScope) === "local", "toggle persisted");
      const t2 = await page.evaluate(() => ({ tiles: document.getElementById("tiles").textContent, sum: [...document.querySelectorAll("#summary li")].map(l => l.textContent) }));
      assert(/ชั่วโมงนี้ \/ เป้า/.test(t2.tiles) && /3 \/ 2/.test(t2.tiles), "hourly target tile " + t2.tiles);
      assert(t2.sum.some(s => /^เข้าร้าน 3 คน/.test(s)), "summary " + t2.sum);
      await page.evaluate(() => document.querySelector('#kpiScope [data-scope="all"]').click());
      assert(await val() === 15, "back to combined");
      await overflow(page, 390);
      await overflow(page, 1280);
      // occupancy over the limit -> red alert
      await page.evaluate(() => { const f = document.querySelector("#settingsForm [name=maxOcc]"); f.value = "10"; f.dispatchEvent(new Event("input", { bubbles: true })); });
      const al2 = await page.evaluate(() => [...document.querySelectorAll("#alerts .alert")].map(a => a.className + ":" + a.textContent));
      assert(al2.some(a => /คนในร้านถึง 10 คน/.test(a) && !/warn/.test(a)), "limit alert " + al2);
      const errs = unexpected(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });
  } finally { await browser.close(); }
}
