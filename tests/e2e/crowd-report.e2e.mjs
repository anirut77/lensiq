// tests/e2e/crowd-report.e2e.mjs — crowd.html round 15 (fake camera + ?fakedet): the "density estimate, not an exact count"
// label when many people are in view and the "people look small" hint; entry/exit per 15 minutes (in, out, net, still inside);
// heatmap per hour (small multiples + slider); peak-hour report (busiest zone / 15 min, printable); marketing CSV (UTF-8 BOM,
// labelled sections, numbers only); a seeded day in English and Chinese (no Thai left, English CSV headers) at 320/360/390 px;
// the PRELIMINARY accuracy note with "pending human count". Privacy: only numbers are stored.
import { openSeeded, startFake, noErrors, mobileCheck, assert, privacyScan, sleep } from "./zones-lib.mjs";

const ZONE = { id: "z1", name: "Stage", role: "area", cap: 0, area: 4, poly: [{ x: 0.0, y: 0.2 }, { x: 0.45, y: 0.2 }, { x: 0.45, y: 0.99 }, { x: 0.0, y: 0.99 }] };
const LINE = { a: { x: 0.6, y: 0.1 }, b: { x: 0.6, y: 0.99 }, swap: true }; // left -> right = "in"
// 0-3 s: 16 large people (count >= 15 -> estimate label); 3-12 s: 3 small far people + one walker in (left -> right), then out
function script() {
  let t0 = null;
  window.__LQ_FAKE_DET = (key, now) => {
    if (key !== "crowd") return [];
    if (t0 == null) t0 = now;
    const s = (now - t0) / 1000, out = [];
    if (s < 3) { for (let i = 0; i < 16; i++) out.push({ x: 0.02 + (i % 8) * 0.05, y: i < 8 ? 0.25 : 0.6, w: 0.04, h: 0.3, score: 0.9 }); return out; }
    for (const x of [0.05, 0.15, 0.3]) out.push({ x, y: 0.4, w: 0.02, h: 0.05, score: 0.9 });
    const u = s - 3;
    if (u < 4.5) { const wx = 0.4 + 0.08 * u; out.push({ x: wx, y: 0.5, w: 0.06, h: 0.35, score: 0.9 }); } // in at ~2.3 s
    else if (u > 5 && u < 9.5) { const wx = 0.8 - 0.08 * (u - 5); out.push({ x: wx, y: 0.5, w: 0.06, h: 0.35, score: 0.9 }); } // out
    return out;
  };
}

/** a seeded past-style day for today: 3 hours of data, in/out per 15 min, per-hour heat, one zone */
function seedDay() {
  const d = new Date(), pad = n => String(n).padStart(2, "0"), date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const z24 = () => Array(24).fill(0), hourly = { in: z24(), out: z24(), occSum: z24(), occMs: z24(), peak: z24(), uniq: z24() };
  const heatH = {}, q15 = {};
  for (const [h, avg, pk, i, o, u] of [[10, 4, 7, 20, 12, 30], [11, 9, 14, 41, 25, 55], [12, 6, 10, 18, 30, 40]]) {
    hourly.occSum[h] = avg * 3600000; hourly.occMs[h] = 3600000; hourly.peak[h] = pk; hourly.in[h] = i; hourly.out[h] = o; hourly.uniq[h] = u;
    const g = Array(84).fill(0); g[(h - 10) * 10 + 3] = 500; g[40] = 100; heatH[String(h)] = { cols: 12, rows: 7, d: g };
    for (let q = 0; q < 4; q++) q15[String(h * 4 + q)] = [Math.round(i / 4), Math.round(o / 4)];
  }
  const heat = { cols: 24, rows: 14, d: Array(336).fill(0) }; heat.d[50] = 900; heat.d[51] = 300;
  return { date, peak: 14, peakAt: d.setHours(11, 20, 0, 0), in: 79, out: 67, hourly, minutes: {}, heat, heatH, q15,
    zones: { z1: { name: "Stage", role: "area", visits: 33, dwellSum: 33 * 45000, dwellN: 33, peak: 9, occSum: 5 * 3 * 3600000, occMs: 3 * 3600000 } },
    conv: {}, funnel: { pass: 0, stop: 0 } };
}

async function csvBytes(page, btn) {
  return page.evaluate(async id => {
    let blob = null; const o = URL.createObjectURL, c = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = b => { blob = b; return "blob:x"; }; HTMLAnchorElement.prototype.click = function () {};
    try { document.getElementById(id).click(); } finally { URL.createObjectURL = o; HTMLAnchorElement.prototype.click = c; }
    if (!blob) return null;
    const u8 = new Uint8Array(await blob.arrayBuffer());
    return { bom: [u8[0], u8[1], u8[2]], text: new TextDecoder("utf-8", { ignoreBOM: true }).decode(u8).replace(/^﻿/, "") };
  }, btn);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("estimate label, small-people hint, in/out per 15 min, heat per hour, peak report, marketing CSV", async () => {
      const page = await openSeeded(browser, base, fakeCams, "crowd.html", "lqcr", {
        zones: [ZONE], settings: { siteName: "Hall", minVisitSec: 0, stopSec: 5, holdSec: 10, clearSec: 15, cooldownMin: 5, convKind: "buy", heatOverlay: true, sound: false }
      });
      await page.evaluate(l => { localStorage.setItem("lqcr-line", JSON.stringify(l)); }, LINE);
      await page.reload();
      // the accuracy note: preliminary, AI reference, final pending a human count
      const acc = await page.evaluate(() => document.getElementById("crAcc").textContent);
      assert(/PRELIMINARY/.test(acc) && /AI/.test(acc) && /รอผลการนับโดยคน/.test(acc), acc.slice(0, 200));
      await startFake(page, script);
      const est = await page.waitFor(`(() => { const q = document.getElementById("crQual");
        return !q.hidden && /ไม่ใช่ยอดนับที่แน่นอน/.test(q.textContent) && __LQZ.cr.qual.estimate && document.querySelector("#tiles .tile .v").textContent; })()`, 8000);
      assert(/^≈ 1[5-6]$/.test(est), "tile shows the estimate mark: " + est);
      await page.waitFor(`__LQZ.cr.qual.small && !__LQZ.cr.qual.estimate && /ตัวเล็ก/.test(document.getElementById("crQual").textContent)`, 10000);
      await page.waitFor(`__LQZ.day.in === 1 && __LQZ.day.out === 1`, 15000);
      await sleep(1200); // slow renders run at 1 Hz
      const r = await page.evaluate(() => ({
        q15: [...document.querySelectorAll("#q15 tbody tr")].map(tr => [...tr.children].map(td => td.textContent)),
        q15day: JSON.stringify(__LQZ.day.q15), hours: document.querySelectorAll("#heatHours button").length,
        hh: Object.keys(__LQZ.day.heatH), slider: document.getElementById("heatHour").max, peak: document.getElementById("peakBody").textContent
      }));
      // one 15-min row (two if the test runs across a quarter boundary): 1 in, 1 out, nobody left inside
      const sum = k => r.q15.reduce((a, row) => a + Number(row[k]), 0);
      assert(r.q15.length >= 1 && sum(1) === 1 && sum(2) === 1 && r.q15[0][4] === "0", JSON.stringify(r.q15));
      assert(r.hours >= 1 && r.hh.length === r.hours && r.slider === String(r.hours), JSON.stringify(r));
      assert(/Stage/.test(r.peak) && /เข้า 1 · ออก 1/.test(r.peak), r.peak);
      // pick the hour: tap the small multiple, then back to the whole day with the slider
      await page.evaluate(() => document.querySelector("#heatHours button").click());
      const sel = await page.evaluate(() => ({ s: __LQZ.cr.heatSel, pressed: document.querySelector("#heatHours button").getAttribute("aria-pressed"),
        lbl: document.getElementById("heatHourLbl").textContent, v: document.getElementById("heatHour").value }));
      assert(sel.s === Number(r.hh.sort((a, b) => a - b)[0]) && sel.pressed === "true" && /–/.test(sel.lbl) && sel.v === "1", JSON.stringify(sel));
      await page.evaluate(() => { const s = document.getElementById("heatHour"); s.value = "0"; s.dispatchEvent(new Event("input", { bubbles: true })); });
      assert(await page.evaluate(() => __LQZ.cr.heatSel === -1 && document.getElementById("heatHourLbl").textContent === "ทั้งวัน"), "slider back to the whole day");
      // marketing CSV: BOM for Excel, labelled sections, numbers only
      const csv = await csvBytes(page, "exportMkt");
      assert(csv && csv.bom.join() === "239,187,191", "UTF-8 BOM " + JSON.stringify(csv && csv.bom));
      for (const h of ["รายงานจำนวนคนสำหรับการตลาด", "ผู้เข้าชมรายชั่วโมง", "เข้า–ออกราย 15 นาที", "เวลาอยู่และความหนาแน่นรายโซน", "สรุปความหนาแน่นตามช่วงเวลา",
        "ผู้เข้าชม (ประมาณ, คน)", "สุทธิ เข้า − ออก (คน)", "ความหนาแน่นสูงสุด (คน/ตร.ม.)", "รอการนับเทียบโดยคน"]) assert(csv.text.includes(h), "CSV has " + h);
      assert(/\nStage,/.test(csv.text) && /\n\d\d:\d\d,\d\d:\d\d,[01],[01],-?[01],[01]\n/.test(csv.text) && !/data:image|"box"/.test(csv.text), csv.text.slice(0, 600));
      const printed = await page.evaluate(() => {
        let during = null; window.print = () => { during = document.documentElement.classList.contains("cr-print-peak"); };
        document.getElementById("printPeak").click();
        return { during, after: document.documentElement.classList.contains("cr-print-peak") };
      });
      assert(printed.during === true, JSON.stringify(printed));
      // dense-crowd collapse: the count falls instead of rising, so only the operator's "expected crowd" can raise the label
      await page.evaluate(() => { const i = document.querySelector('#settingsForm input[name="expectCrowd"]'); i.value = "300"; i.dispatchEvent(new Event("change", { bubbles: true })); });
      const col = await page.waitFor(`(() => { const q = document.getElementById("crQual");
        return __LQZ.cr.qual.collapse && __LQZ.cr.qual.estimate && !q.hidden && /คาดว่าจะมีคนราว 300 คน/.test(q.textContent)
          && document.querySelector("#tiles .tile .v").textContent; })()`, 8000);
      assert(/^≈ \d+$/.test(col), "tile marked as an estimate when the count collapses: " + col);
      await page.evaluate(() => document.getElementById("stopCam").click());
      const stored = await page.evaluate(() => localStorage.getItem("lqcr-day-" + __LQZ.day.date));
      assert(/"heatH":\{"\d+":/.test(stored) && /"q15":\{"\d+":\[[01],[01]\]/.test(stored), "per-hour heat and 15-min in/out persisted");
      assert(!/"id":\d+,"x"|data:image|"box"/.test(stored), "no boxes or track ids persisted");
      await privacyScan(page);
      noErrors(page);
      await page.close();
    });

    for (const lang of ["en", "zh"]) {
      await check(`seeded day in ${lang}: peak report, 15-min table, hour heatmaps, marketing CSV headers, no Thai, phone widths`, async () => {
        // seeded before any page script runs (an open page saves its own day record when it unloads, so seeding then reloading
        // would be overwritten); an isolated context keeps the first check's records out
        const seed = `if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.clear();
          localStorage.setItem("lqcr-ack", JSON.stringify({ at: 1 })); localStorage.setItem("lqcr-zones", ${JSON.stringify(JSON.stringify([ZONE]))});
          localStorage.setItem("lqcr-line", ${JSON.stringify(JSON.stringify(LINE))}); const d = ${JSON.stringify(seedDay())};
          localStorage.setItem("lqcr-day-" + d.date, JSON.stringify(d)); }`;
        const page = await browser.newPage(null, { initScripts: [fakeCams, seed], isolated: true });
        await page.goto(`${base}/crowd.html?cpu&fakedet&lang=${lang}`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}" && document.querySelectorAll("#heatHours button").length === 3 &&
          document.querySelectorAll("#q15 tbody tr").length === 12`, 8000)
          .catch(async e => {
            console.log(await page.evaluate(() => JSON.stringify({ l: window.LQI18N && LQI18N.lang, b: document.querySelectorAll("#heatHours button").length,
              q: document.querySelectorAll("#q15 tbody tr").length, d: window.__LQZ && __LQZ.day && Object.keys(__LQZ.day.heatH || {}) })));
            throw e;
          });
        await sleep(1200);
        const r = await page.evaluate(() => ({ rows: document.querySelectorAll("#peakBody tbody tr").length, peak: document.getElementById("peakBody").textContent,
          first: [...document.querySelectorAll("#peakBody tbody tr:first-child td")].map(t => t.textContent) }));
        assert(r.rows === 3 && r.first[1] === "11:00–12:00" && r.first[2] === "9.0" && /Stage/.test(r.peak), JSON.stringify(r));
        const thai = await page.evaluate(() => {
          const out = [], walk = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
          for (let n; (n = walk.nextNode());) if (!n.parentElement.closest("[hidden],script") && /[ก-๛]/.test(n.textContent)) out.push(n.textContent.trim().slice(0, 40));
          for (const el of document.querySelectorAll("main [aria-label]")) if (/[ก-๛]/.test(el.getAttribute("aria-label"))) out.push("@" + el.getAttribute("aria-label").slice(0, 40));
          return out;
        });
        assert(!thai.length, `${lang}: Thai left ` + JSON.stringify(thai.slice(0, 5)));
        const csv = await csvBytes(page, "exportMkt");
        assert(csv.bom.join() === "239,187,191" && !/[ก-๛]/.test(csv.text), `${lang} CSV has no Thai: ` + csv.text.slice(0, 300));
        const want = lang === "en" ? ["Visitors per hour", "Visitors (approx., people)", "In/out per 15 minutes (counting line)", "Peak density (people/m²)",
          "Final accuracy is pending"] : ["每小时访客", "每 15 分钟进出（计数线）"];
        for (const h of want) assert(csv.text.includes(h), "CSV has " + h);
        assert(/\n11:00,55,9\.00,14,41,25,16\n/.test(csv.text), "hourly row 11:00 " + csv.text.slice(0, 900));
        await page.evaluate(() => { document.getElementById("crAcc").open = true; });
        await mobileCheck(page);
        noErrors(page);
        await page.close();
      });
    }
  } finally { await browser.close(); }
}
