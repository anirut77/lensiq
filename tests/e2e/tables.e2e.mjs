// tests/e2e/tables.e2e.mjs — tables.html (fake camera + ?fakedet): a party sits at a table zone -> "occupied", leaves ->
// "needs clearing" + staff alert, staff taps "Cleared" -> free; seatings counted; "add tables from the image" turns a
// detected dining table into a zone; demo mode; 320/360/390 px; en/zh; privacy scan.
import { openSeeded, startFake, exportCsv, noErrors, mobileCheck, langCheck, assert, privacyScan } from "./zones-lib.mjs";

const T1 = { id: "z1", name: "โต๊ะริมหน้าต่าง", poly: [{ x: 0.05, y: 0.05 }, { x: 0.5, y: 0.05 }, { x: 0.5, y: 0.95 }, { x: 0.05, y: 0.95 }] };
function script() {
  let t0 = null;
  window.__LQ_FAKE_DET = (key, now) => {
    if (key !== "tables") return [];
    if (t0 == null) t0 = now;
    const t = now - t0;
    const out = [{ x: 0.6, y: 0.5, w: 0.3, h: 0.2, score: 0.8, label: "dining table" }]; // a table outside every zone
    if (t < 3000) out.push({ x: 0.1, y: 0.2, w: 0.1, h: 0.4, score: 0.9 }, { x: 0.3, y: 0.2, w: 0.1, h: 0.4, score: 0.9 });
    return out;
  };
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("seated -> left -> needs clearing + alert -> staff 'Cleared' -> free; 1 seating counted; CSV", async () => {
      const page = await openSeeded(browser, base, fakeCams, "tables.html", "lqt", {
        zones: [T1], settings: { seatSec: 1, leaveSec: 1, minSeatMin: 0, autoClearMin: 0, clearAlertMin: 0.02, sound: false }
      });
      await startFake(page, script);
      await page.waitFor(`__LQZ.tbl.get("z1") && __LQZ.tbl.get("z1").state === "occupied"`, 6000);
      assert(await page.evaluate(() => /มีลูกค้า/.test(document.querySelector("#tableGrid .zt-card").textContent)), "card shows seated");
      await page.waitFor(`__LQZ.tbl.get("z1").state === "clearing"`, 8000);
      const a = await page.waitFor(`(() => { const el = document.querySelector("#alerts .zc-alert span"); return el && el.textContent; })()`, 6000);
      assert(/โต๊ะริมหน้าต่าง/.test(a) && /ให้พนักงานไปดู/.test(a), a);
      await page.evaluate(() => document.querySelector('#tableGrid button[data-zone="z1"]').click());
      const r = await page.evaluate(() => ({ st: __LQZ.tbl.get("z1").state, alerts: document.querySelectorAll("#alerts .zc-alert").length, day: __LQZ.day, log: __LQZ.log.items.map(e => e.kind) }));
      assert(r.st === "free" && r.alerts === 0, JSON.stringify(r));
      assert(r.day.seatings === 1 && r.day.perTable.z1.seatings === 1 && r.day.alerts === 1, JSON.stringify(r.day));
      assert(["seated", "left", "alert", "cleared"].every(k => r.log.includes(k)), r.log.join());
      const csv = await exportCsv(page);
      assert(csv && /โต๊ะริมหน้าต่าง,1,/.test(csv), String(csv).slice(0, 200));
      // "add tables from the image": the dining table outside every zone becomes table 2
      await page.evaluate(() => document.getElementById("suggestTables").click());
      const z = await page.evaluate(() => __LQZ.zones.map(x => x.poly.length));
      assert(z.length === 2 && z[1] === 4, "suggested zones " + JSON.stringify(z));
      await page.evaluate(() => document.getElementById("suggestTables").click());
      assert(await page.evaluate(() => __LQZ.zones.length) === 2, "the same table is not added twice");
      await page.evaluate(() => document.getElementById("stopCam").click());
      await privacyScan(page);
      noErrors(page);
      await page.close();
    });

    await check("demo mode: 4 tables, states change on the accelerated clock; phone widths", async () => {
      const page = await openSeeded(browser, base, fakeCams, "tables.html", "lqt");
      await page.evaluate(() => document.getElementById("demoCam").click());
      await page.waitFor(`__LQZ.zones.length === 4 && [...__LQZ.tbl.values()].some(t => t.state === "occupied")`, 10000);
      await mobileCheck(page);
      await page.evaluate(() => document.getElementById("stopCam").click());
      noErrors(page);
      await page.close();
    });

    await check("English and Chinese: no Thai left on the page", async () => { await langCheck(browser, base, fakeCams, "tables.html", "lqt", { demoMs: 3000 }); });
  } finally { await browser.close(); }
}
