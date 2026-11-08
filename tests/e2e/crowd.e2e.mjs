// tests/e2e/crowd.e2e.mjs — crowd.html (fake camera + ?fakedet): notice gate; people counted in view and in a drawn zone,
// capacity alert "for staff to check", entry line counter (one walker in), heatmap / series / hourly / summary rendered,
// conversion from a typed-in number, CSV + summary pack (numbers only), printable summary; demo mode (zone roles, line,
// funnel) at 320/360/390 px, kept out of the real records; drawing the counting line by two taps; en/zh with no Thai left; privacy scan.
import { openSeeded, startFake, exportCsv, noErrors, mobileCheck, langCheck, assert, privacyScan, sleep } from "./zones-lib.mjs";

const ZONE = { id: "z1", name: "หน้าเวที", role: "area", cap: 3, area: 4, poly: [{ x: 0.0, y: 0.2 }, { x: 0.34, y: 0.2 }, { x: 0.34, y: 0.95 }, { x: 0.0, y: 0.95 }] };
const LINE = { a: { x: 0.6, y: 0.1 }, b: { x: 0.6, y: 0.99 }, swap: true }; // left -> right = "in"
// 3 people stand in the zone for 3.5 s; one walker goes left -> right across the line in ~3 s
function script() {
  let t0 = null;
  window.__LQ_FAKE_DET = (key, now) => {
    if (key !== "crowd") return [];
    if (t0 == null) t0 = now;
    const s = (now - t0) / 1000, out = [];
    if (s < 3.5) for (const x of [0.04, 0.12, 0.2]) out.push({ x, y: 0.5, w: 0.06, h: 0.3, score: 0.9 });
    const wx = 0.36 + 0.12 * s; // starts clearly left of the line (outside its hysteresis band)
    if (s > 0.2 && wx < 0.9) out.push({ x: wx, y: 0.45, w: 0.06, h: 0.35, score: 0.9 });
    return out;
  };
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("notice gate: start disabled until the operator confirms the camera notice", async () => {
      const page = await openSeeded(browser, base, fakeCams, "crowd.html", "lqcr", { ack: false });
      const r = await page.evaluate(() => ({ gate: !document.getElementById("gate").hidden, dis: document.getElementById("startCam").disabled, demo: document.getElementById("demoCam").disabled }));
      assert(r.gate && r.dis && r.demo, "gate " + JSON.stringify(r));
      await page.evaluate(() => { document.getElementById("ackChk").click(); document.querySelector("[data-ack]").click(); });
      const after = await page.evaluate(() => ({ gate: document.getElementById("gate").hidden, dis: document.getElementById("startCam").disabled }));
      assert(after.gate && !after.dis, "after ack " + JSON.stringify(after));
      noErrors(page);
      await page.close();
    });

    await check("zone + line: count, capacity alert, line in, heat, conversion, CSV, pack, print summary", async () => {
      const page = await openSeeded(browser, base, fakeCams, "crowd.html", "lqcr", {
        zones: [ZONE], settings: { siteName: "Hall", minVisitSec: 0, stopSec: 5, holdSec: 1, clearSec: 1, cooldownMin: 5, convKind: "buy", heatOverlay: true, sound: false }
      });
      await page.evaluate(l => { localStorage.setItem("lqcr-line", JSON.stringify(l)); }, LINE);
      await page.reload();
      await startFake(page, script);
      const a = await page.waitFor(`(() => { const el = document.querySelector("#alerts .zc-alert span"); return el && el.textContent; })()`, 8000);
      assert(/หน้าเวที/.test(a) && /ให้เจ้าหน้าที่ดูหน้างาน/.test(a), a);
      const live = await page.evaluate(() => ({ z: __LQZ.cr.live.get("z1"), now: document.querySelector("#tiles .tile .v").textContent }));
      assert(live.z.count >= 3 && Math.abs(live.z.dens - live.z.count / 4) < 1e-9, JSON.stringify(live));
      await page.waitFor(`__LQZ.day.in === 1 && !document.querySelector("#alerts .zc-alert")`, 10000).catch(async e => { console.log(await page.evaluate(() => JSON.stringify({ in: __LQZ.day.in, out: __LQZ.day.out, al: !!document.querySelector("#alerts .zc-alert"), log: __LQZ.log.items.map(i => i.kind), line: __LQZ.cr.line, sz: __LQZ.cr.counter.size }))); throw e; });
      await sleep(1200); // slow renders run at 1 Hz
      const day = await page.evaluate(() => ({ in: __LQZ.day.in, out: __LQZ.day.out, peak: __LQZ.day.peak, heat: __LQZ.day.heat.d.reduce((s, v) => s + v, 0),
        visits: __LQZ.day.zones.z1.visits, uniq: __LQZ.day.hourly.uniq.reduce((s, v) => s + v, 0), mins: Object.keys(__LQZ.day.minutes).length,
        bars: document.querySelectorAll("#crHourly .cr-hcol").length, poly: document.querySelectorAll("#series polyline").length,
        conv: document.querySelectorAll("#conv .cr-crow").length, sum: document.getElementById("sumBody").textContent }));
      assert(day.in === 1 && day.out === 0 && day.peak >= 3 && day.heat > 0 && day.visits >= 3 && day.uniq >= 4 && day.mins >= 1, JSON.stringify(day));
      assert(day.bars === 24 && day.poly === 2 && day.conv === 2 && /Hall/.test(day.sum), JSON.stringify(day));
      // conversion: 1 purchase at the entrance (1 person in) = 100 %
      await page.evaluate(() => { const i = document.querySelector('#conv [data-id="_line"] input'); i.value = "1"; i.dispatchEvent(new Event("change", { bubbles: true })); });
      const rate = await page.evaluate(() => document.querySelector('#conv [data-id="_line"] .cr-cr').textContent);
      assert(/100%/.test(rate), rate);
      await page.evaluate(() => [...document.querySelectorAll("#log button")].find(b => /ตรวจแล้ว/.test(b.textContent)).click());
      const csv = await exportCsv(page);
      assert(csv && /หน้าเวที/.test(csv) && /ทางเข้า \(เส้นนับ\)/.test(csv) && /100\.0%/.test(csv) && /ยืนยันว่าจริง/.test(csv) && /24x14/.test(csv) && !/data:image/.test(csv), String(csv).slice(0, 400));
      const pack = await page.evaluate(async () => {
        let blob = null; const o = URL.createObjectURL, c = HTMLAnchorElement.prototype.click;
        URL.createObjectURL = b => { blob = b; return "blob:x"; }; HTMLAnchorElement.prototype.click = function () {};
        try { document.getElementById("exportPack").click(); } finally { URL.createObjectURL = o; HTMLAnchorElement.prototype.click = c; }
        return blob ? JSON.parse(await blob.text()) : null;
      });
      assert(pack && pack.v === 1 && pack.in === 1 && pack.name === "Hall" && pack.zones["c1:z1"] && !("heat" in pack), JSON.stringify(pack).slice(0, 300));
      const printed = await page.evaluate(() => {
        let during = null; window.print = () => { during = document.documentElement.classList.contains("cr-print-sum"); };
        document.getElementById("printSummary").click();
        return { during, after: document.documentElement.classList.contains("cr-print-sum") };
      });
      assert(printed.during === true, JSON.stringify(printed));
      await page.evaluate(() => document.getElementById("stopCam").click());
      await privacyScan(page);
      const stored = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("lqcr-")).map(k => localStorage.getItem(k)).join(""));
      assert(!/"id":\d+,"x"|data:image|"box"/.test(stored), "no boxes or track ids persisted");
      noErrors(page);
      await page.close();
    });

    await check("demo mode: no camera, walkway + window zones and door line, funnel fills, phone widths", async () => {
      const page = await openSeeded(browser, base, fakeCams, "crowd.html", "lqcr");
      // the real record before the demo (a reload during seeding may have re-saved an earlier page's day)
      const real0 = await page.evaluate(() => ({ in: __LQZ.day.in, pass: __LQZ.day.funnel.pass, log: __LQZ.log.items.length, raw: localStorage.getItem("lqcr-day-" + __LQZ.day.date) }));
      await page.evaluate(() => document.getElementById("demoCam").click());
      await page.waitFor(`__LQZ.zc.demo && __LQZ.zones.length === 2 && __LQZ.zones[0].role === "pass" && __LQZ.zones[1].role === "stop" && __LQZ.cr.line`, 8000);
      await page.waitFor(`__LQZ.day.funnel.pass >= 2 && __LQZ.day.funnel.stop >= 1`, 25000);
      await page.waitFor(`__LQZ.day.in >= 1`, 25000);
      const n = await page.evaluate(() => ({ steps: document.querySelectorAll("#funnel .cr-step").length, roles: [...document.querySelectorAll("#zoneList select")].map(s => s.value) }));
      assert(n.steps === 3 && n.roles.join() === "pass,stop", JSON.stringify(n));
      await mobileCheck(page);
      // demo isolation: synthetic numbers never reach the real day record, alert list, counting line or summary pack
      const mid = await page.evaluate(() => {
        const raw = localStorage.getItem("lqcr-day-" + new Date().toLocaleDateString("sv")), real = raw ? JSON.parse(raw) : null;
        document.getElementById("exportPack").click();
        return { demo: __LQZ.day.demo, realIn: real ? real.in : 0, realDemo: real ? !!real.demo : false, line: localStorage.getItem("lqcr-line"),
          pack: document.getElementById("packMsg").textContent, sum: document.getElementById("sumBody").textContent };
      });
      assert(mid.demo === true && mid.realIn === real0.in && !mid.realDemo && mid.line === null && /ข้อมูลจำลอง/.test(mid.sum) && /โหมดตัวอย่าง/.test(mid.pack), JSON.stringify(mid));
      await page.evaluate(() => document.getElementById("stopCam").click());
      const after = await page.evaluate(() => ({ demo: !!__LQZ.day.demo, in: __LQZ.day.in, pass: __LQZ.day.funnel.pass, line: __LQZ.cr.line, log: __LQZ.log.items.length,
        demoLog: localStorage.getItem("lqcr-demo-log"), banners: document.querySelectorAll("#alerts .zc-alert").length, zones: __LQZ.zones.length }));
      assert(!after.demo && after.in === real0.in && after.pass === real0.pass && after.line === null && after.log === real0.log && after.demoLog === null && after.banners === 0 && after.zones === 2, JSON.stringify(after));
      await privacyScan(page);
      noErrors(page);
      await page.close();
    });

    await check("draw the counting line by tapping 2 points, swap direction, delete", async () => {
      const page = await openSeeded(browser, base, fakeCams, "crowd.html", "lqcr");
      // "Draw zone" then "Draw entry/exit line": the zone draft is cancelled, taps only place the line
      await page.evaluate(() => document.getElementById("drawZone").click());
      await page.evaluate(() => document.getElementById("drawLine").click());
      assert(await page.evaluate(() => document.getElementById("cancelZone").hidden), "zone draft cancelled");
      const pts = await page.evaluate(() => {
        const r = document.querySelector("#cam canvas").getBoundingClientRect();
        return [[0.3, 0.2], [0.3, 0.9]].map(([x, y]) => [r.left + x * r.width, r.top + y * r.height]);
      });
      for (const [x, y] of pts) {
        await page.evaluate((x, y) => document.querySelector("#cam canvas").dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y, bubbles: true })), x, y);
        await sleep(30);
      }
      const l = await page.evaluate(() => JSON.parse(localStorage.getItem("lqcr-line")));
      assert(l && Math.abs(l.a.x - 0.3) < 0.02 && Math.abs(l.b.y - 0.9) < 0.02 && l.swap === false, JSON.stringify(l));
      await page.evaluate(() => document.getElementById("swapLine").click());
      assert(await page.evaluate(() => JSON.parse(localStorage.getItem("lqcr-line")).swap === true), "swap saved");
      await page.evaluate(() => document.getElementById("clearLine").click());
      assert(await page.evaluate(() => localStorage.getItem("lqcr-line") === null && !__LQZ.cr.line), "line deleted");
      assert(await page.evaluate(() => __LQZ.zones.length === 0), "drawing a line adds no zone");
      noErrors(page);
      await page.close();
    });

    await check("English and Chinese: no Thai left on the page", async () => { await langCheck(browser, base, fakeCams, "crowd.html", "lqcr", { demoMs: 2500 }); });
  } finally { await browser.close(); }
}
