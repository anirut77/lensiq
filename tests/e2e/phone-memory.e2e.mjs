// tests/e2e/phone-memory.e2e.mjs — MEMORY BUDGET per camera page (stream B "real-phone quality", 2026-11-13).
// Each camera page runs its main camera action for 60 s at phone size (390 x 844, mobile, touch) in its OWN headless
// Chrome (one renderer process per run), with the fake camera (canvas stream) and the localhost test seams (?fakedet /
// ?fakeocr), so the camera, the frame loop and the page's analysis code run, but scripted detections replace model
// output where a page supports it (studio / photobooth load their real segmentation models).
// Sampled every 5 s: JS heap in use (CDP Performance.getMetrics JSHeapUsedSize) and the renderer's resident memory
// (CDP SystemInfo.getProcessInfo -> `ps -o rss` of the renderer process; includes WebAssembly memory, canvases, video).
// FAILS when a page's PEAK goes above its budget (BUDGET below: measured peak with headroom, docs/PHONE-QUALITY.md).
// Source of every number: synthetic, headless Chrome (CI ubuntu-latest and a Mac); not a phone. WebKit exposes no memory
// figure to Playwright, so iPhone memory is checked by hand (docs/owner-checklists/).
// LQ_MEM_SECONDS=n shortens the run for a quick look (the budget check still applies); LQ_MEM_ONLY=page runs one page.
import { spawnSync } from "node:child_process";
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const SECONDS = Math.max(5, parseInt(process.env.LQ_MEM_SECONDS || "60", 10) || 60);
const MB = 1024 * 1024;
// budget per page, MB: heap = JS heap in use, rss = renderer resident memory (peak over the run).
// Set 2026-11-13 from the measured peaks (Mac run + CI ubuntu run 43449439495, both synthetic headless Chrome):
// budget = highest peak x 1.5, heap rounded up to the next 5 MB, RSS to the next 10 MB (docs/PHONE-QUALITY.md §3).
export const BUDGET = {
  "exam-lab": { heap: 10, rss: 450 },
  attendance: { heap: 10, rss: 440 },
  parking: { heap: 5, rss: 430 },
  crowd: { heap: 10, rss: 360 },
  "product-check": { heap: 10, rss: 840 },
  nutrition: { heap: 5, rss: 310 },
  faceread: { heap: 10, rss: 780 },
  studio: { heap: 10, rss: 620 },
  photobooth: { heap: 10, rss: 1310 }
};
const ONE = `window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.confirm = () => true; window.print = () => {};`;
const FACE = { x: 0.33, y: 0.2, w: 0.32, h: 0.46, score: 0.95, yaw: 0, pitch: 0 };
const D = v => Array.from({ length: 128 }, (_, k) => +(Math.sin(k * v) * 0.1).toFixed(5));

/** page -> { url, init, start(page) } ; start() leaves the camera running */
const PAGES = {
  "exam-lab": { url: "exam-lab.html?cpu&fakedet&calsec=2", init: `window.__LQ_FAKE_DET = k => k === "exam-lab" ? [${JSON.stringify(FACE)}] : null;`,
    async start(p) {
      await p.waitFor("!!window.__LQ_EXAM_LAB", 10000);
      await p.evaluate(() => { document.querySelector("#room").value = "LAB1"; document.querySelector("#seat").value = "12"; document.querySelector("#consent").checked = true; document.querySelector("#noticeForm").requestSubmit(); });
      await p.waitFor("__LQ_EXAM_LAB.phase === 'cam'", 15000);
      await p.evaluate(() => document.querySelector("#toCal").click());
      await p.waitFor("__LQ_EXAM_LAB.phase === 'calDone'", 15000);
      await p.evaluate(() => document.querySelector("#toExam").click());
      await p.waitFor("__LQ_EXAM_LAB.phase === 'exam'", 8000);
    } },
  attendance: { url: "attendance.html?cpu&fakedet",
    init: `try { localStorage.setItem("att-people", ${JSON.stringify(JSON.stringify([{ id: "pA", name: "ทดสอบ หนึ่ง", code: "A01", descriptor: D(1) }]))}); } catch (e) {}
      window.__LQ_FAKE_DET = () => [{ x: 0.35, y: 0.3, w: 0.2, h: 0.3, score: 0.95, who: "pA" }];
      window.__LQ_FAKE_MATCH = d => d && d.who ? { label: d.who, distance: 0.3 } : { label: "unknown", distance: 0.9 };`,
    async start(p) {
      await p.waitFor("typeof ready !== 'undefined' && ready === true", 20000);
      await p.evaluate(() => { const s = document.querySelector("#session"); s.value = "รอบทดสอบ"; s.dispatchEvent(new Event("input")); document.querySelector("#startScan").click(); });
      await p.waitFor("scanning === true", 10000);
    } },
  parking: { url: "parking.html?cpu&fakedet", init: "window.__LQ_FAKE_PLATE = () => ({ text: '1กข 2345', conf: 0.95, province: 'bangkok' });",
    async start(p) {
      await p.waitFor(`!!document.querySelector("#gkAck1")`, 10000);
      await p.evaluate(() => { document.querySelector("#gkOp").value = "ทดสอบ"; document.querySelector("#gkAck1").click(); document.querySelector("#gkAck2").click(); document.querySelector("#gkAckBtn").click(); document.querySelector("#gkCamBtn").click(); });
      await p.waitFor(`document.querySelector("#gkVideo").videoWidth > 0`, 15000);
      // a read every 5 s during the run (the guard's main action), see tick()
    },
    tick: p => p.evaluate(() => { const b = document.querySelector("#gkReadBtn"); if (b && !b.disabled) b.click(); }) },
  crowd: { url: "crowd.html?cpu&fakedet",
    init: `try { localStorage.setItem("lqcr-ack", JSON.stringify({ at: 1 })); localStorage.setItem("lqcr-zones", "[]"); } catch (e) {}
      window.__LQ_FAKE_DET = (k, now) => k === "crowd" ? [0.1, 0.3, 0.5, 0.7].map((x, i) => ({ x: (x + now / 20000 + i * 0.01) % 0.9, y: 0.4, w: 0.07, h: 0.32, score: 0.9 })) : [];`,
    async start(p) {
      await p.waitFor(`!!window.__LQZ && !document.getElementById("startCam").disabled`, 10000);
      await p.evaluate(() => document.getElementById("startCam").click());
      await p.waitFor("__LQZ.zc.running", 15000);
    } },
  "product-check": { url: "medicine.html?fakeocr&fakeface",
    init: `window.__LQ_FAKE_FACE = () => []; window.__LQ_FAKE_PCBAR = () => [];
      window.__LQ_FAKE_PCOCR = () => ["ยาแก้ปวด TESTOL 500 mg", "เลขทะเบียน 1A 844/39", "ส่วนประกอบ: พาราเซตามอล 500 มก.", "EXP 01/2028"];`,
    async start(p) {
      await p.evaluate(() => document.querySelector("#t-pc").click());
      await p.evaluate(() => document.querySelector("#pcCamBtn").click());
      await p.waitFor("!!(window.__LQ_PCLIVE && window.__LQ_PCLIVE.st.on)", 15000);
    } },
  nutrition: { url: "nutrition.html", init: "",
    async start(p) {
      await p.evaluate(() => document.querySelector("#nutCamBtn").click());
      await p.waitFor(`!document.querySelector("#nutCamWrap").hidden && document.querySelector("#nutVideo").videoWidth > 0`, 15000);
    } },
  faceread: { url: "faceread.html?cpu&fakedet", init: `window.__LQ_FAKE_DET = () => [${JSON.stringify(FACE)}];`,
    async start(p) {
      await p.evaluate(() => document.getElementById("frStartCam").click());
      await p.waitFor(`!!document.querySelector("#frCam.live")`, 15000);
    } },
  studio: { url: "studio.html?cpu", init: "",
    async start(p) {
      await p.waitFor(`/MODNet/.test(document.getElementById("stEngine").textContent) && !/กำลังโหลด/.test(document.getElementById("stEngine").textContent)`, 90000);
      await p.evaluate(() => document.getElementById("stCamBtn").click());
      await p.waitFor(`document.getElementById("stVideo").videoWidth > 0`, 15000);
    } },
  photobooth: { url: "photobooth.html?cpu&fakedet", init: `window.__LQ_FAKE_DET = () => [${JSON.stringify(FACE)}];`,
    async start(p) {
      await p.waitFor(`document.getElementById("video").videoWidth > 0`, 60000);
    } }
};

/** resident memory (MB) of the page's renderer = the largest renderer process (Chrome may also keep a spare or an
 *  exiting about:blank renderer, which must not be added in), or 0 when the OS gives no figure */
async function rendererRss(browser) {
  const info = await browser.send("SystemInfo.getProcessInfo").catch(() => null);
  const pids = ((info && info.processInfo) || []).filter(x => x.type === "renderer").map(x => x.id);
  let kb = 0;
  for (const pid of pids) {
    const out = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).stdout || "";
    kb = Math.max(kb, parseInt(out.trim(), 10) || 0);
  }
  return kb / 1024;
}

/** runs one page for SECONDS; returns {heapPeak, heapEnd, rssPeak, rssEnd} in MB */
export async function measure(launch, base, fakeCams, name) {
  const P = PAGES[name];
  const browser = await launch();
  try {
    const page = await browser.newPage(null, { initScripts: [fakeCams, ONE, P.init || ""] });
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page.send("Performance.enable");
    await page.goto(`${base}/${P.url}`);
    await P.start(page);
    const heap = [], rss = [];
    const t0 = Date.now();
    while (Date.now() - t0 < SECONDS * 1000) {
      await sleep(5000);
      if (P.tick) await P.tick(page).catch(() => {});
      const m = await page.send("Performance.getMetrics");
      const h = (m.metrics.find(x => x.name === "JSHeapUsedSize") || {}).value || 0;
      heap.push(h / MB);
      rss.push(await rendererRss(browser));
    }
    const live = await page.evaluate(() => [...document.querySelectorAll("video")].some(v => v.srcObject && v.srcObject.getVideoTracks().some(t => t.readyState === "live")));
    assert(live, `${name}: the camera was not running at the end of the run`);
    const ex = page.consoleErrors.filter(e => e.kind === "exception");
    assert(!ex.length, `${name}: uncaught errors during the run: ${ex.slice(0, 3).map(e => e.text).join(" | ")}`);
    const r1 = v => Math.round(v * 10) / 10;
    return { heapPeak: r1(Math.max(...heap)), heapEnd: r1(heap[heap.length - 1]), rssPeak: r1(Math.max(...rss)), rssEnd: r1(rss[rss.length - 1]), samples: heap.length };
  } finally { await browser.close(); }
}

export default async function ({ base, launch, check, fakeCams }) {
  const only = process.env.LQ_MEM_ONLY;
  const rows = [];
  for (const name of Object.keys(PAGES)) {
    if (only && only !== name) continue;
    await check(`memory ${name}: ${SECONDS} s of camera use within budget (JS heap <= ${BUDGET[name].heap} MB, renderer RSS <= ${BUDGET[name].rss} MB)`, async () => {
      const r = await measure(launch, base, fakeCams, name);
      rows.push({ name, ...r });
      console.log(`       ${name}: heap peak ${r.heapPeak} MB (end ${r.heapEnd}) · renderer RSS peak ${r.rssPeak} MB (end ${r.rssEnd}) · ${r.samples} samples`);
      assert(r.heapPeak <= BUDGET[name].heap, `${name}: JS heap peak ${r.heapPeak} MB > budget ${BUDGET[name].heap} MB`);
      assert(r.rssPeak === 0 || r.rssPeak <= BUDGET[name].rss, `${name}: renderer RSS peak ${r.rssPeak} MB > budget ${BUDGET[name].rss} MB`);
    });
  }
  if (rows.length) console.log("\n       MEMORY " + JSON.stringify(rows));
}
