// tests/e2e/driver-neuro.e2e.mjs — WP5: driver locks onto one face among several; neuro tags samples with faces:n.
// Uses ?fakedet (localhost-only scripted detections, no models) and fake cameras. No WebGL.
import { createRequire } from "node:module";
import { join } from "node:path";
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Normalised unmirrored boxes; the right-seat driver is on the image left. The passenger scores higher and has closed-ish eyes.
const DRIVER = { x: 0.10, y: 0.25, w: 0.22, h: 0.40, score: 0.80, ear: 0.30, mar: 0.10 };
const PASSENGER = { x: 0.62, y: 0.22, w: 0.24, h: 0.44, score: 0.99, ear: 0.15, mar: 0.10 };

const isExternal = (e, base) => e.url && !e.url.startsWith(base);
function hardErrors(page, base) {
  return page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && isExternal(e, base)) && !/fonts\.g(oogleapis|static)\.com/.test(e.text || ""));
}
async function noOverflowAt390(page) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(400);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    wide: [...document.querySelectorAll("body *")].filter(el => { const b = el.getBoundingClientRect(); return b.width && b.right > innerWidth + 1 && getComputedStyle(el).position !== "fixed"; }).slice(0, 5).map(el => el.tagName + "#" + el.id + "." + el.className) }));
  await page.send("Emulation.clearDeviceMetricsOverride");
  assert(r.sw <= r.cw, `horizontal overflow at 390px: scrollWidth ${r.sw} > ${r.cw} ${JSON.stringify(r.wide)}`);
}

export default async function ({ base, launch, check, fakeCams, repo }) {
  const browser = await launch();
  let nmRaw = null;
  try {
    await check("driver: old dr-cam string is read, 2 faces -> EAR from the locked driver box, missing driver = face_missing", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams] });
      await page.goto(`${base}/driver.html?cpu&fakedet`);
      await assertNoWebGL(page);
      await page.evaluate(() => { localStorage.clear(); localStorage.setItem("dr-cam", JSON.stringify("fake-cam-2")); });
      await page.reload();
      await page.evaluate((d, p) => { window.__dets = [p, d]; window.__LQ_FAKE_DET = key => key === "driver" ? window.__dets : null; }, DRIVER, PASSENGER);
      await page.waitFor(`document.querySelector("#engine").textContent.includes("พร้อมใช้งาน")`, 10000);
      const camId = await page.evaluate(() => window.__LQ_DR.camId);
      assert(camId === "fake-cam-2", "old dr-cam value honoured, got " + camId);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("dr-cam")));
      assert(stored && stored.deviceId === "fake-cam-2", "dr-cam re-saved as {deviceId,label}: " + JSON.stringify(stored));
      const seat = await page.evaluate(() => document.querySelector("#settings").seatSide.value);
      assert(seat === "right", "seatSide default right, got " + seat);

      await page.evaluate(() => { const f = document.querySelector("#tripForm"); f.driver.value = "ทดสอบ"; f.plate.value = "1กข 1234"; f.requestSubmit(); });
      await page.waitFor(`window.__LQ_DR.phase === "trip"`, 9000);
      await sleep(1500);
      const r1 = await page.evaluate(() => ({ s: __LQ_DR.series, thr: __LQ_DR.trip.thr, cal: __LQ_DR.trip.calibrated, anchor: __LQ_DR.anchor }));
      const ears = r1.s.map(p => p.ear).filter(v => v != null);
      assert(ears.length >= 5, "enough trip frames: " + ears.length);
      assert(ears.every(v => Math.abs(v - 0.30) < 1e-6), "EAR series only from the driver: " + JSON.stringify(ears.slice(0, 8)));
      assert(r1.cal && Math.abs(r1.thr - 0.255) < 0.002, "calibrated on the driver (thr 0.30 × earRatio 0.85 = 0.255): " + r1.thr);
      assert(r1.anchor && r1.anchor.x < 0.5, "anchor = driver box " + JSON.stringify(r1.anchor));

      // driver leaves the frame, passenger stays -> face_missing, never the passenger's EAR
      await page.evaluate(p => { window.__dets = [p]; }, PASSENGER);
      await sleep(3600);
      const r2 = await page.evaluate(() => ({ s: __LQ_DR.series, ev: JSON.parse(localStorage.getItem("dr-events") || "[]"), st: document.querySelector("#stateText").textContent }));
      assert(!r2.s.some(p => p.ear != null && Math.abs(p.ear - 0.15) < 1e-3), "passenger EAR never used");
      assert(r2.s.at(-1).ear == null, "latest frame has no driver face");
      assert(r2.ev.some(e => e.type === "face_missing"), "face_missing logged: " + JSON.stringify(r2.ev.map(e => e.type)));

      // driver returns to the calibrated seat -> re-acquired
      await page.evaluate((d, p) => { window.__dets = [p, { ...d, x: d.x + 0.01 }]; }, DRIVER, PASSENGER);
      await sleep(800);
      const last = await page.evaluate(() => __LQ_DR.series.at(-1));
      assert(last.ear != null && Math.abs(last.ear - 0.30) < 1e-6, "driver re-acquired: " + JSON.stringify(last));

      await page.evaluate(() => document.querySelector("#stop").click());
      const trip = await page.evaluate(() => JSON.parse(localStorage.getItem("dr-trips"))[0]);
      assert(trip.occupantsMax === 2, "occupantsMax aggregate = 2: " + trip.occupantsMax);
      await privacyScan(page);
      await noOverflowAt390(page);
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("neuro: valence/arousal caveat visible with Barrett et al. 2019 citation, no overflow", async () => {
      const page = await browser.newPage(`${base}/neuro.html?cpu`);
      const c = await page.evaluate(() => {
        const el = document.getElementById("nmCaveat"), r = el && el.getBoundingClientRect();
        return el && { text: el.textContent, visible: r.width > 0 && r.height > 0, href: el.querySelector("a") && el.querySelector("a").href,
          refs: [...document.querySelectorAll(".refs a")].some(a => a.href.includes("10.1177/1529100619832930")) };
      });
      assert(c && c.visible, "caveat visible");
      assert(/ค่าประมาณ/.test(c.text) && /Barrett et al\., 2019/.test(c.text) && /งานวิจัย/.test(c.text), "caveat text: " + (c && c.text));
      assert(c.href.includes("10.1177/1529100619832930") && c.refs, "DOI link in caveat and references");
      await noOverflowAt390(page);
      await page.close();
    });

    await check("neuro: 2 faces -> every sample faces===2, primary = centre face, 'พบหลายใบหน้า' pill visible", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams] });
      await page.goto(`${base}/neuro.html?cpu&fakedet`);
      await assertNoWebGL(page);
      await page.evaluate(() => {
        localStorage.clear();
        // centre face looks at the screen and smiles; the side face is turned away and neutral
        window.__LQ_FAKE_DET = key => key === "neuro" ? [
          { x: 0.02, y: 0.3, w: 0.2, h: 0.4, score: 0.99, yaw: 1, expressions: { neutral: 1 } },
          { x: 0.4, y: 0.3, w: 0.2, h: 0.4, score: 0.8, expressions: { neutral: 0.3, happy: 0.7 } }
        ] : null;
      });
      await page.waitFor(`document.querySelector("#engine").textContent.includes("พร้อมใช้งาน")`, 10000);
      await page.evaluate(async () => {
        const f = document.querySelector("#setup");
        const c = document.createElement("canvas"); c.width = 32; c.height = 24;
        const blob = await new Promise(r => c.toBlob(r, "image/png"));
        const dt = new DataTransfer(); dt.items.add(new File([blob], "ad.png", { type: "image/png" }));
        f.file.files = dt.files; f.file.dispatchEvent(new Event("change"));
        f.test.value = "โฆษณา A"; f.pid.value = "P01"; f.dur.value = "3"; f.consent.checked = true;
        f.requestSubmit();
      });
      const pill = await page.waitFor(`(() => { const p = document.querySelector("#stageMulti"); return p && !p.hidden && p.getClientRects().length > 0 && p.textContent; })()`, 4000);
      assert(pill === "พบหลายใบหน้า", "pill text " + pill);
      await page.waitFor(`(JSON.parse(localStorage.getItem("nm-sessions") || "[]")).length === 1`, 8000);
      nmRaw = await page.evaluate(() => localStorage.getItem("nm-sessions"));
      const ses = JSON.parse(nmRaw)[0];
      assert(ses.samples.length >= 3, "samples " + ses.samples.length);
      assert(ses.samples.every(s => s.faces === 2), "faces===2 on every sample: " + JSON.stringify(ses.samples.map(s => s.faces)));
      assert(ses.samples.every(s => s.face === 1 && s.att === 1 && Math.abs(s.v - 0.56) < 1e-6), "legacy fields from the centre face: " + JSON.stringify(ses.samples[0]));
      assert(ses.samples.every(s => Object.keys(s).sort().join() === "a,att,e,eng,face,faces,t,v"), "sample keys: " + Object.keys(ses.samples[0]));
      await privacyScan(page);
      await noOverflowAt390(page);
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("insights iqCollect reads the saved nm-sessions unchanged (node require)", async () => {
      assert(nmRaw, "a saved neuro session");
      const req = createRequire(import.meta.url);
      const { iqCollect } = req(join(repo, "insights.js"));
      const D = iqCollect({ "nm-sessions": nmRaw });
      assert(D.neuro && D.neuro.length === 1, "one neuro row " + JSON.stringify(D.neuro));
      const n = D.neuro[0];
      assert(n.test === "โฆษณา A" && n.pid === "P01", "test/pid " + JSON.stringify(n));
      assert(n.attention === 1 && Math.abs(n.valence - 0.56) < 1e-6 && n.positive === 1, "metrics " + JSON.stringify(n));
    });
  } finally { await browser.close(); }
}
