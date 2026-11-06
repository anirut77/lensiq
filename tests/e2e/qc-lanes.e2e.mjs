// tests/e2e/qc-lanes.e2e.mjs — qc.html multi-lane stations (headless, ?cpu&fakedet, no WebGL).
// - legacy localStorage background/thumbnail data URLs move to IndexedDB (idempotent across reloads)
// - single lane (default): simulator calibrates + inspects, log entries get lane "L1", webhook body has lane
// - 3 lanes in the simulator: own recipe/background per lane, per-lane stats, lane table + p-chart, two-bottle warning
// - 2 lanes on fake cameras via createHub; muteOthers = capacity fallback (1 live lane + message)
// - the simulator clock is frame-paced (max 70 ms per drawn frame), so a loaded machine slows the belt instead of
//   skipping the still phase; budgets below are generous upper bounds, the waits return as soon as the condition holds
// - no console errors, no overflow at 390/1280, privacy: no images in localStorage, IndexedDB holds only bg/thumbs
import { assert, assertNoWebGL } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOOK = "http://127.0.0.1:9/qc-hook";
const captureHook = `(() => { window.__hook = []; const f = window.fetch.bind(window);
  window.fetch = (u, o) => { if (String(u).startsWith(${JSON.stringify(HOOK)})) { window.__hook.push(JSON.parse(o.body)); return Promise.resolve(new Response("{}", { status: 200 })); } return f(u, o); }; })()`;

async function overflow(page, width) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await sleep(400);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  await page.send("Emulation.clearDeviceMetricsOverride");
  assert(r.sw <= r.cw, `no horizontal overflow at ${width}px ${JSON.stringify(r)}`);
}
function noErrors(page) {
  const errs = page.consoleErrors.filter(e => !/favicon|fonts\.(googleapis|gstatic)/.test((e.url || "") + " " + (e.text || "")));
  assert(!errs.length, "console errors: " + errs.map(e => `${e.kind}: ${(e.text || "").slice(0, 160)}`).join(" || "));
}
async function privacy(page) {
  const r = await page.evaluate(async () => {
    const ls = Object.keys(localStorage).map(k => ({ k, v: localStorage.getItem(k) || "" }));
    const dbs = indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : [];
    const stores = await new Promise(res => { const q = indexedDB.open("lensiq-qc"); q.onsuccess = () => { res([...q.result.objectStoreNames]); q.result.close(); }; q.onerror = () => res([]); });
    return { img: ls.filter(e => /data:image/i.test(e.v)).map(e => e.k), big: ls.filter(e => e.v.length > 200 * 1024).map(e => e.k), dbs, stores, ss: sessionStorage.length };
  });
  assert(!r.img.length && !r.big.length, "localStorage holds images/huge values: " + JSON.stringify(r));
  assert(r.dbs.every(n => n === "lensiq-qc"), "only the qc IndexedDB: " + r.dbs);
  assert(r.stores.every(n => n === "bg" || n === "thumbs"), "IndexedDB stores: " + r.stores);
  assert(r.ss === 0, "sessionStorage empty");
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const url = `${base}/qc.html?cpu&fakedet`;
  try {
    let page = await browser.newPage(null, { initScripts: [fakeCams] });
    await check("qc: legacy rec.bg / reject thumbnails migrate from localStorage to IndexedDB (idempotent)", async () => {
      await page.goto(`${base}/index.html`); // seed from another page: qc.html saves its shift on beforeunload
      await assertNoWebGL(page);
      await page.evaluate(async () => {
        localStorage.clear();
        await new Promise(r => { const q = indexedDB.deleteDatabase("lensiq-qc"); q.onsuccess = q.onerror = q.onblocked = r; });
        const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d"); x.fillStyle = "#eee"; x.fillRect(0, 0, 640, 480);
        const url = c.toDataURL("image/jpeg", 0.8);
        const recipes = JSON.parse(localStorage.getItem("qc-recipes") || "null") || [{ id: "sim-600", name: "ขวดใส 600 มล. (ภาพจำลอง)", sim: "600", rois: { trigger: { x: .34, y: .2, w: .31, h: .6 }, fill: null, cap: null, label: null }, mode: "dark", tol: { fill: 6, fillUnit: "px", minContrast: 12, capDE: 15, capCov: 50, capTilt: 6, capHigh: 4, labelSim: 80, labelShift: 6 }, trig: { on: 15, off: 5, requireStill: true, stableFrames: 3 }, golden: null }];
        recipes[0].bg = url;
        localStorage.setItem("qc-recipes", JSON.stringify(recipes)); localStorage.setItem("qc-active", "sim-600");
        localStorage.setItem("qc-shift", JSON.stringify({ start: Date.now(), total: 1, pass: 0, reject: 1, missed: 0, reasons: { under: 1 }, log: [{ t: 1, recipe: "x", how: "auto", pass: false, reasons: ["under"] }], rejects: [{ t: 1, reasons: ["under"], img: url }] }));
      });
      await page.goto(url);
      await page.waitFor(`window.__QC && __QC.idb === true && __QC.lanes[0].bg && !/data:image/.test(localStorage.getItem("qc-recipes")) && !/data:image/.test(localStorage.getItem("qc-shift"))`, 6000);
      const keys = await page.evaluate(() => new Promise(res => { const q = indexedDB.open("lensiq-qc"); q.onsuccess = () => { const db = q.result, t = db.transaction(["bg", "thumbs"]); const a = t.objectStore("bg").getAllKeys(), b = t.objectStore("thumbs").getAllKeys(); t.oncomplete = () => { res({ bg: a.result, th: b.result }); db.close(); }; }; }));
      assert(keys.bg.includes("L1|sim-600") && keys.th.includes("L1|1"), "IDB keys " + JSON.stringify(keys));
      const s1 = await page.evaluate(() => localStorage.getItem("qc-recipes") + localStorage.getItem("qc-shift"));
      await page.reload();
      await page.waitFor(`__QC.idb === true && __QC.lanes[0].bg`, 6000);
      await page.waitFor(() => document.querySelector("#rejects img") && document.querySelector("#rejects img").src.startsWith("data:image"), 4000);
      const s2 = await page.evaluate(() => localStorage.getItem("qc-recipes") + localStorage.getItem("qc-shift"));
      assert(s1 === s2, "second load changes nothing");
      const old = await page.evaluate(() => JSON.parse(localStorage.getItem("qc-shift")));
      assert(old.total === 1 && old.lanes.L1.total === 1, "old shift counted as lane L1 " + JSON.stringify(old.lanes));
    });

    await check("qc single lane (default): simulator calibrates and inspects; log + webhook carry lane L1; page unchanged", async () => {
      await page.goto(`${base}/index.html`);
      await page.evaluate(() => { localStorage.clear(); });
      await page.goto(url);
      await page.evaluate(captureHook);
      const ui = await page.evaluate(() => ({ tabs: document.getElementById("laneTabs").hidden, lanes: document.getElementById("laneCount").value, stat: document.getElementById("statLane").hidden, wrap: document.getElementById("laneWrap").hidden, cam: !!document.getElementById("camSel") }));
      assert(ui.tabs && ui.lanes === "1" && ui.stat && ui.wrap && ui.cam, "single-lane UI " + JSON.stringify(ui));
      await page.evaluate(() => {
        const st = JSON.parse(localStorage.getItem("qc-settings") || "{}"); Object.assign(st, { webhookOn: true, webhook: "http://127.0.0.1:9/qc-hook", beep: false });
        document.getElementById("webhookOn").checked = true; document.getElementById("webhook").value = "http://127.0.0.1:9/qc-hook"; document.getElementById("beep").checked = false;
        document.getElementById("webhook").dispatchEvent(new Event("change"));
        const sp = document.getElementById("simSpeed"); sp.value = "1600"; sp.dispatchEvent(new Event("change"));
        document.getElementById("simCalib").click();
      });
      await page.waitFor(`__QC.lanes[0].golden && __QC.lanes[0].bg`, 4000);
      await page.evaluate(() => document.getElementById("toggle").click());
      const r = await page.waitFor(`(() => { const s = __QC.shift; return s.total >= 4 && s.reject >= 1 && window.__hook.length >= 1 && { total: s.total, lanes: s.log.map(l => l.lane), hook: window.__hook[0] }; })()`, 40000);
      assert(r.lanes.every(l => l === "L1"), "log lanes " + r.lanes);
      assert(r.hook.lane === "L1" && r.hook.laneNo === 1 && r.hook.event === "reject" && Array.isArray(r.hook.reasons), "webhook body " + JSON.stringify(r.hook));
      await page.evaluate(() => document.getElementById("toggle").click());
      const p = await page.evaluate(() => document.getElementById("pInfo").textContent);
      assert(/p̄ =/.test(p), "p-chart info " + p);
      await page.waitFor(`localStorage.getItem("qc-shift") && JSON.parse(localStorage.getItem("qc-shift")).total >= 4`, 3000);
      await privacy(page);
    });

    await check("qc 3 lanes (simulator): per-lane recipe/background, stats, lane table, p-chart per lane, two-bottle warning", async () => {
      await page.evaluate(() => __QC.setLanes(3));
      const tabs = await page.evaluate(() => [...document.querySelectorAll("#laneTabs [data-lane]")].length);
      assert(tabs === 3, "3 lane tabs, got " + tabs);
      const lanes0 = await page.evaluate(() => __QC.lanes);
      assert(new Set(lanes0.map(l => l.rec)).size === 3, "own recipe per lane " + JSON.stringify(lanes0));
      await page.evaluate(() => document.getElementById("simCalib").click());
      await page.waitFor(`__QC.lanes.every(l => l.golden && l.bg)`, 4000);
      // per-lane threshold edit only touches the selected lane's recipe
      await page.evaluate(() => { __QC.selectLane(1); const f = document.querySelector("#tolForm [name=capDE]"); f.value = "22"; f.dispatchEvent(new Event("input", { bubbles: true })); __QC.selectLane(0); });
      const tol = await page.evaluate(() => { const rs = JSON.parse(localStorage.getItem("qc-recipes")); return __QC.lanes.map(l => rs.find(r => r.id === l.rec).tol.capDE); });
      assert(tol[0] === 15 && tol[1] === 22 && tol[2] === 15, "per-lane tolerances " + tol);
      await page.evaluate(() => document.getElementById("toggle").click());
      const st = await page.waitFor(`(() => { const s = __QC.shift; const L = s.lanes; return ["L1","L2","L3"].every(k => L[k] && L[k].total >= 2) && L; })()`, 90000);
      assert(st.L2.total >= 2 && st.L3.total >= 2, "per-lane totals " + JSON.stringify(st));
      const hookLanes = await page.evaluate(() => window.__hook.map(h => h.lane));
      assert(hookLanes.every(l => /^L[1-3]$/.test(l)), "webhook lanes " + hookLanes);
      const tbl = await page.evaluate(() => ({ rows: document.querySelectorAll("#laneTable tbody tr").length, hidden: document.getElementById("laneWrap").hidden, opts: document.querySelectorAll("#statLane option").length }));
      assert(tbl.rows === 3 && !tbl.hidden && tbl.opts === 4, "lane table " + JSON.stringify(tbl));
      const pc = await page.evaluate(() => { const s = document.getElementById("statLane"); s.value = "L2"; s.dispatchEvent(new Event("change")); return { info: document.getElementById("pInfo").textContent, g: __QC.pChart(__QC.shift.log, { lane: "L2", size: 2 }).groups.length }; });
      assert(/p̄ =/.test(pc.info) && pc.g >= 1, "per-lane p-chart " + JSON.stringify(pc));
      // two bottles in the trigger area
      await page.evaluate(() => { __QC.simPairRate = 1; });
      const m = await page.waitFor(`(() => { const L = __QC.shift.lanes; const n = Object.values(L).reduce((s, l) => s + (l.multi || 0), 0); return n >= 1 && { n, msg: document.getElementById("engine").textContent }; })()`, 45000);
      assert(m.n >= 1, "multi warnings " + JSON.stringify(m));
      await page.evaluate(() => { __QC.simPairRate = 0; document.getElementById("toggle").click(); });
      await overflow(page, 390);
      await overflow(page, 1280);
      await page.waitFor(`JSON.parse(localStorage.getItem("qc-settings")).lanes === 3`, 2000);
      // reload keeps 3 lanes with their backgrounds (IndexedDB) and recipes
      await page.reload();
      await page.waitFor(`__QC.idb === true && __QC.lanes.length === 3 && __QC.lanes.every(l => l.bg && l.golden)`, 6000);
      await privacy(page);
      noErrors(page);
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:3,mode:'ok'}"] });
    await check("qc 2 lanes on fake cameras: one hub camera per lane, frames processed per lane", async () => {
      await page.goto(url);
      await page.evaluate(() => { localStorage.clear(); localStorage.setItem("qc-settings", JSON.stringify({ lanes: 2 })); });
      await page.reload();
      await page.evaluate(() => { const s = document.getElementById("srcSel"); s.value = "camera"; s.dispatchEvent(new Event("change")); });
      const ls = await page.waitFor(`(() => { const l = __QC.lanes; return l.length === 2 && l.every(x => x.live) && l; })()`, 10000);
      assert(ls[0].cam === "c1" && ls[1].cam === "c2", "lanes mapped to hub slots " + JSON.stringify(ls));
      const hidden = await page.evaluate(() => [document.querySelector("[data-single]").hidden, document.getElementById("engine").className]);
      assert(hidden[0] && /ok/.test(hidden[1]), "single-camera picker hidden, engine ok " + hidden);
      // lane 2 shows its own camera colour (fake cam 2 is green) on the stage after selecting it
      await page.evaluate(() => __QC.selectLane(1));
      const px = await page.waitFor(() => { const c = document.getElementById("frame"), d = c.getContext("2d").getImageData(5, 5, 1, 1).data; return d[1] > 120 && d[0] < 90 ? [...d] : null; }, 4000);
      assert(px[1] > 120, "lane 2 frame from fake-cam-2 " + px);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("qc-cams")).cams.map(c => c.slot));
      assert(saved.join() === "c1,c2", "hub cameras persisted " + saved);
      await overflow(page, 390);
      noErrors(page);
    });
    await page.close();

    page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:3,mode:'muteOthers'}"] });
    await check("qc 2 lanes on a one-camera device (muteOthers): capacity message, lane 1 keeps working", async () => {
      await page.goto(url);
      await page.evaluate(() => { localStorage.clear(); localStorage.setItem("qc-settings", JSON.stringify({ lanes: 2 })); });
      await page.reload();
      await page.evaluate(() => { const s = document.getElementById("srcSel"); s.value = "camera"; s.dispatchEvent(new Event("change")); });
      const msg = await page.waitFor(`(() => { const t = document.getElementById("engine").textContent; return /เปิดกล้องได้ 1 จาก 2/.test(t) && t; })()`, 10000);
      assert(/สูงสุด 1 ตัว/.test(msg), msg);
      const ls = await page.waitFor(`(() => { const l = __QC.lanes; return l[0].live && !l[1].cam && l; })()`, 4000);
      assert(ls[0].live, "lane 1 live");
      const tab = await page.evaluate(() => document.querySelector('#laneTabs [data-lane="1"]').textContent);
      assert(/ไม่มีกล้อง/.test(tab), "lane 2 tab says no camera: " + tab);
      await privacy(page);
      noErrors(page);
    });
    await page.close();
  } finally { await browser.close(); }
}
