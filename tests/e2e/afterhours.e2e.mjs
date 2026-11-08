// tests/e2e/afterhours.e2e.mjs — afterhours.html (fake camera + ?fakedet): a person in the restricted zone for the
// persistence time -> ONE alert "for staff to check"; leaving and coming back inside the cooldown -> no second alert;
// outside the scheduled hours -> nothing; the test-alert button is not counted as an event; staff mark a false alarm;
// demo mode; 320/360/390 px; en/zh; privacy scan.
import { openSeeded, startFake, exportCsv, noErrors, mobileCheck, langCheck, assert, privacyScan, sleep } from "./zones-lib.mjs";

const ZONE = { id: "z1", name: "คลังสินค้า", poly: [{ x: 0.4, y: 0.1 }, { x: 0.95, y: 0.1 }, { x: 0.95, y: 0.95 }, { x: 0.4, y: 0.95 }] };
// in the zone 0–2 s, away 2–8 s, back 8–11 s
function script() {
  let t0 = null;
  window.__LQ_FAKE_DET = (key, now) => {
    if (key !== "afterhours") return [];
    if (t0 == null) t0 = now;
    const t = (now - t0) / 1000;
    const inZ = t < 2 || (t > 8 && t < 11);
    return [{ x: inZ ? 0.6 : 0.1, y: 0.3, w: 0.1, h: 0.5, score: 0.9 }];
  };
}
const hm = d => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("always armed: one alert, cooldown holds the return visit, staff marks it, CSV", async () => {
      const page = await openSeeded(browser, base, fakeCams, "afterhours.html", "lqa", {
        zones: [ZONE], settings: { mode: "always", from: "22:00", to: "06:00", days: "all", persistSec: 1, cooldownSec: 60, minH: 5, sound: false }
      });
      await startFake(page, script);
      const a = await page.waitFor(`(() => { const el = document.querySelector("#alerts .zc-alert span"); return el && el.textContent; })()`, 6000);
      assert(/คลังสินค้า/.test(a) && /ให้เจ้าหน้าที่ตรวจสอบ/.test(a) && /อาจเป็นพนักงาน/.test(a), a);
      assert(await page.evaluate(() => document.getElementById("armBadge").dataset.on) === "1", "armed badge");
      await sleep(11500);
      const r = await page.evaluate(() => ({ alerts: __LQZ.day.alerts, n: __LQZ.log.items.filter(e => e.alert).length }));
      assert(r.alerts === 1 && r.n === 1, "cooldown: " + JSON.stringify(r));
      await page.evaluate(() => [...document.querySelectorAll("#log button")].find(b => /แจ้งผิด/.test(b.textContent)).click());
      const st = await page.evaluate(() => document.getElementById("logStats").textContent);
      assert(/0%/.test(st) && /\(0\/1\)/.test(st), st);
      await page.evaluate(() => document.getElementById("testAlert").click());
      const t = await page.evaluate(() => ({ last: __LQZ.log.items[__LQZ.log.items.length - 1], banner: document.querySelectorAll("#alerts .zc-alert").length }));
      assert(t.last.kind === "test" && t.last.alert === false && t.banner >= 1, JSON.stringify(t));
      const csv = await exportCsv(page);
      assert(csv && /คลังสินค้า/.test(csv) && /แจ้งผิด/.test(csv), String(csv).slice(0, 300));
      await page.evaluate(() => document.getElementById("stopCam").click());
      await privacyScan(page);
      noErrors(page);
      await page.close();
    });

    await check("schedule mode outside the window: not armed, presence raises nothing", async () => {
      const now = new Date(), from = new Date(+now + 2 * 3600e3), to = new Date(+now + 3 * 3600e3);
      const page = await openSeeded(browser, base, fakeCams, "afterhours.html", "lqa", {
        zones: [ZONE], settings: { mode: "schedule", from: hm(from), to: hm(to), days: "all", persistSec: 1, cooldownSec: 60, minH: 5, sound: false }
      });
      const a0 = await page.evaluate(() => __LQZ.day.alerts); // a closing earlier page may still write its day on pagehide
      await startFake(page, () => { window.__LQ_FAKE_DET = k => k === "afterhours" ? [{ x: 0.6, y: 0.3, w: 0.1, h: 0.5, score: 0.9 }] : []; });
      await sleep(2500);
      const r = await page.evaluate(() => ({
        armed: __LQZ.armed(), alerts: __LQZ.day.alerts, banners: document.querySelectorAll("#alerts .zc-alert").length,
        badge: document.getElementById("armBadge").dataset.on
      }));
      assert(!r.armed && r.alerts === a0 && r.banners === 0 && r.badge === "0", JSON.stringify(r));
      await page.evaluate(() => document.getElementById("stopCam").click());
      noErrors(page);
      await page.close();
    });

    await check("demo mode raises an alert without a camera; phone widths", async () => {
      const page = await openSeeded(browser, base, fakeCams, "afterhours.html", "lqa");
      await page.evaluate(() => document.getElementById("demoCam").click());
      await page.waitFor(`__LQZ.zones.length === 1 && __LQZ.day.alerts >= 1`, 15000);
      await mobileCheck(page);
      await page.evaluate(() => document.getElementById("stopCam").click());
      noErrors(page);
      await page.close();
    });

    await check("English and Chinese: no Thai left on the page", async () => { await langCheck(browser, base, fakeCams, "afterhours.html", "lqa", { demoMs: 9000 }); });
  } finally { await browser.close(); }
}
