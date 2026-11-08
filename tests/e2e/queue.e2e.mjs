// tests/e2e/queue.e2e.mjs — queue.html (fake camera + ?fakedet): notice gate, people counted in a drawn queue zone,
// long-queue alert after the hold time ("for staff to check"), back to normal, staff marks the alert -> precision,
// CSV export, demo mode without a camera, rectangle zone, 320/360/390 px layout, en/zh, privacy scan.
import { openSeeded, startFake, exportCsv, noErrors, mobileCheck, langCheck, assert, privacyScan, sleep } from "./zones-lib.mjs";

const ZONE = { id: "z1", name: "คิวแคชเชียร์", poly: [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.9, y: 0.95 }, { x: 0.1, y: 0.95 }] };
// 6 people standing in the zone for 4 s, then 1 person (back to normal)
function script() {
  let t0 = null;
  window.__LQ_FAKE_DET = (key, now) => {
    if (key !== "queue") return [];
    if (t0 == null) t0 = now;
    const n = (now - t0) < 4000 ? 6 : 1;
    return Array.from({ length: n }, (_, i) => ({ x: 0.12 + i * 0.12, y: 0.3, w: 0.08, h: 0.5, score: 0.9 }));
  };
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("notice gate: start disabled until the operator confirms the camera notice", async () => {
      const page = await openSeeded(browser, base, fakeCams, "queue.html", "lqq", { ack: false });
      const r = await page.evaluate(() => ({ gate: !document.getElementById("gate").hidden, dis: document.getElementById("startCam").disabled, demo: document.getElementById("demoCam").disabled }));
      assert(r.gate && r.dis && r.demo, "gate " + JSON.stringify(r));
      await page.evaluate(() => { document.getElementById("ackChk").click(); document.querySelector("[data-ack]").click(); });
      const after = await page.evaluate(() => ({ gate: document.getElementById("gate").hidden, dis: document.getElementById("startCam").disabled, ls: !!localStorage.getItem("lqq-ack") }));
      assert(after.gate && !after.dis && after.ls, "after ack " + JSON.stringify(after));
      noErrors(page);
      await page.close();
    });

    await check("6 people for 4 s -> one alert (hold 2 s), back to normal, staff check -> precision, CSV", async () => {
      const page = await openSeeded(browser, base, fakeCams, "queue.html", "lqq", {
        zones: [ZONE], settings: { threshold: 5, holdSec: 2, clearSec: 1, cooldownMin: 5, serviceSec: 30, counters: 2, slaSec: 0, sound: false }
      });
      await startFake(page, script);
      const a = await page.waitFor(`(() => { const el = document.querySelector("#alerts .zc-alert span"); return el && el.textContent; })()`, 8000);
      assert(/คิวแคชเชียร์/.test(a) && /6 คน/.test(a) && /ให้พนักงานดูหน้างาน/.test(a), a);
      const t = await page.evaluate(() => ({ now: document.querySelector("#tiles .tile .v").textContent, q: __LQZ.q.get("z1") }));
      assert(t.q.count === 6 && t.q.w.estSec === 90, JSON.stringify(t)); // 6 × 30 s ÷ 2 counters
      await page.waitFor(`!document.querySelector("#alerts .zc-alert") && __LQZ.log.items.some(e => e.kind === "clear")`, 8000);
      const day = await page.evaluate(() => __LQZ.day);
      assert(day.alerts === 1 && day.maxQueue === 6, JSON.stringify(day).slice(0, 200));
      await page.evaluate(() => [...document.querySelectorAll("#log button")].find(b => /ตรวจแล้ว/.test(b.textContent)).click());
      const st = await page.evaluate(() => document.getElementById("logStats").textContent);
      assert(/100%/.test(st) && /\(1\/1\)/.test(st), st);
      const csv = await exportCsv(page);
      assert(csv && /คิวแคชเชียร์/.test(csv) && /ยืนยันว่าจริง/.test(csv) && !/data:image/.test(csv), String(csv).slice(0, 300));
      await page.evaluate(() => document.getElementById("stopCam").click());
      await privacyScan(page);
      noErrors(page);
      await page.close();
    });

    await check("demo mode: no camera, default zone added, queue grows, rectangle zone tool", async () => {
      const page = await openSeeded(browser, base, fakeCams, "queue.html", "lqq");
      await page.evaluate(() => document.getElementById("demoCam").click());
      await page.waitFor(`__LQZ.zc.demo && __LQZ.zones.length === 1 && __LQZ.q.get(__LQZ.zones[0].id) && __LQZ.q.get(__LQZ.zones[0].id).count > 0`, 8000);
      await page.evaluate(() => document.getElementById("rectZone").click());
      const n = await page.evaluate(() => ({ z: __LQZ.zones.length, li: document.querySelectorAll("#zoneList .zc-zone").length, saved: JSON.parse(localStorage.getItem("lqq-zones")).length }));
      assert(n.z === 2 && n.li === 2 && n.saved === 2, JSON.stringify(n));
      await mobileCheck(page);
      await page.evaluate(() => document.getElementById("stopCam").click());
      await privacyScan(page);
      noErrors(page);
      await page.close();
    });

    await check("draw a zone by tapping 4 corners on the canvas", async () => {
      const page = await openSeeded(browser, base, fakeCams, "queue.html", "lqq");
      await page.evaluate(() => document.getElementById("drawZone").click());
      const pts = await page.evaluate(() => {
        const r = document.querySelector("#cam canvas").getBoundingClientRect();
        return [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]].map(([x, y]) => [r.left + x * r.width, r.top + y * r.height]);
      });
      for (const [x, y] of pts) {
        await page.evaluate((x, y) => document.querySelector("#cam canvas").dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y, bubbles: true })), x, y);
        await sleep(30);
      }
      await page.evaluate(() => document.getElementById("finishZone").click());
      const z = await page.evaluate(() => __LQZ.zones[0] && __LQZ.zones[0].poly);
      assert(z && z.length === 4 && Math.abs(z[0].x - 0.2) < 0.02 && Math.abs(z[2].y - 0.8) < 0.02, JSON.stringify(z));
      noErrors(page);
      await page.close();
    });

    await check("English and Chinese: no Thai left on the page", async () => { await langCheck(browser, base, fakeCams, "queue.html", "lqq"); });

    if (process.env.LQ_REAL) {
      await check("real detector (WASM, no fakedet): YOLOX-Nano loads and frames are processed for 8 s", async () => {
        const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}"] });
        await page.goto(`${base}/queue.html?cpu`);
        await page.evaluate(z => { localStorage.clear(); localStorage.setItem("lqq-ack", "1"); localStorage.setItem("lqq-zones", JSON.stringify([z])); }, ZONE);
        await page.reload();
        await page.evaluate(() => document.getElementById("startCam").click());
        const eng = await page.waitFor(`(() => { const t = document.getElementById("engine").textContent; return /YOLOX|COCO/.test(t) && t; })()`, 60000);
        await sleep(8000);
        const q = await page.evaluate(() => __LQZ.q.get("z1"));
        assert(q && typeof q.count === "number", "frames processed " + JSON.stringify(q) + " " + eng);
        await page.evaluate(() => document.getElementById("stopCam").click());
        noErrors(page);
        await page.close();
      });
    } else console.log("  skip real-detector smoke (set LQ_REAL=1)");
  } finally { await browser.close(); }
}
