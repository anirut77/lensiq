// tests/e2e/bays.e2e.mjs — bays.html (fake camera + ?fakedet): car / motorcycle boxes in drawn bays -> occupied with
// hysteresis, a person in a bay is ignored, free count per bay type, "car park full" staff notice and its clear,
// entrance board, bay type select, CSV, demo mode, 320/360/390 px, en/zh, privacy scan (no plates, no images).
import { openSeeded, startFake, exportCsv, noErrors, mobileCheck, langCheck, assert, privacyScan } from "./zones-lib.mjs";

const bay = (id, name, x, type) => ({ id, name, type, poly: [{ x, y: 0.3 }, { x: x + 0.25, y: 0.3 }, { x: x + 0.25, y: 0.9 }, { x, y: 0.9 }] });
const BAYS = [bay("z1", "A1", 0.05, "car"), bay("z2", "A2", 0.35, "car"), bay("z3", "M1", 0.65, "moto")];
// 0–3 s: car in A1, a PERSON in A2, motorcycle in M1 · 3–6 s: + car in A2 (full) · after 6 s: A1 empties
function script() {
  let t0 = null;
  window.__LQ_FAKE_DET = (key, now) => {
    if (key !== "bays") return [];
    if (t0 == null) t0 = now;
    const t = (now - t0) / 1000, out = [];
    if (t < 6) out.push({ x: 0.08, y: 0.4, w: 0.19, h: 0.4, score: 0.9, label: "car" });
    out.push(t < 3 ? { x: 0.42, y: 0.35, w: 0.08, h: 0.5, score: 0.9, label: "person" } : { x: 0.38, y: 0.4, w: 0.19, h: 0.4, score: 0.9, label: "car" });
    out.push({ x: 0.7, y: 0.45, w: 0.12, h: 0.35, score: 0.9, label: "motorcycle" });
    return out;
  };
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("occupancy with hysteresis, person ignored, full notice + clear, board, CSV", async () => {
      const page = await openSeeded(browser, base, fakeCams, "bays.html", "lqb", { zones: BAYS, settings: { onSec: 1, offSec: 1, coverMin: 35, alertFull: true, sound: false } });
      await startFake(page, script);
      await page.waitFor(`__LQZ.occ.get("z1") === true && __LQZ.occ.get("z3") === true`, 6000);
      const r1 = await page.evaluate(() => ({ z2: __LQZ.occ.get("z2"), tiles: [...document.querySelectorAll("#tiles .tile .v")].map(e => e.textContent) }));
      assert(r1.z2 === false, "a person does not occupy a bay");
      assert(r1.tiles[0] === "1/3" && r1.tiles[1] === "1/2" && r1.tiles[2] === "0/1", "tiles " + r1.tiles);
      const a = await page.waitFor(`(() => { const el = document.querySelector("#alerts .zc-alert span"); return el && el.textContent; })()`, 6000);
      assert(/ที่จอดเต็ม/.test(a) && /3 ช่อง/.test(a), a);
      await page.waitFor(`!document.querySelector("#alerts .zc-alert") && __LQZ.occ.get("z1") === false`, 8000);
      assert(await page.evaluate(() => __LQZ.log.items.some(e => e.kind === "clear" && /1 ช่อง/.test(e.text))), "clear logged");
      await page.evaluate(() => document.getElementById("boardBtn").click());
      const b = await page.evaluate(() => ({
        hidden: document.getElementById("board").hidden, n: document.getElementById("boardNum").textContent,
        pressed: document.getElementById("boardBtn").getAttribute("aria-pressed")
      }));
      assert(!b.hidden && b.n === "1" && b.pressed === "true", JSON.stringify(b));
      await page.evaluate(() => document.getElementById("board").click());
      assert(await page.evaluate(() => document.getElementById("board").hidden), "board closes on tap");
      const day = await page.evaluate(() => __LQZ.day);
      assert(day.peakOcc === 3 && day.perBay.z1.arrivals === 1 && day.fullMs > 0, JSON.stringify(day).slice(0, 300));
      const csv = await exportCsv(page);
      assert(csv && /^﻿?/.test(csv) && /A1,/.test(csv) && /M1,/.test(csv), String(csv).slice(0, 200));
      // bay type select: M1 -> car; a motorcycle no longer occupies a car bay
      await page.evaluate(() => { const s = document.querySelectorAll("#zoneList select")[2]; s.value = "car"; s.dispatchEvent(new Event("change", { bubbles: true })); });
      await page.waitFor(`__LQZ.occ.get("z3") === false && JSON.parse(localStorage.getItem("lqb-zones"))[2].type === "car"`, 6000);
      await page.evaluate(() => document.getElementById("stopCam").click());
      await privacyScan(page);
      noErrors(page);
      await page.close();
    });

    await check("demo mode: 6 bays (one motorcycle bay), free count changes; phone widths", async () => {
      const page = await openSeeded(browser, base, fakeCams, "bays.html", "lqb");
      await page.evaluate(() => document.getElementById("demoCam").click());
      await page.waitFor(`__LQZ.zones.length === 6 && __LQZ.zones[5].type === "moto" && [...__LQZ.occ.values()].filter(Boolean).length >= 2`, 10000);
      await mobileCheck(page);
      await page.evaluate(() => document.getElementById("stopCam").click());
      noErrors(page);
      await page.close();
    });

    await check("English and Chinese: no Thai left on the page", async () => { await langCheck(browser, base, fakeCams, "bays.html", "lqb", { demoMs: 2000 }); });
  } finally { await browser.close(); }
}
