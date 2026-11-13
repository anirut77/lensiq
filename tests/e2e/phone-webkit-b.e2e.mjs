// tests/e2e/phone-webkit-b.e2e.mjs — REAL-PHONE QUALITY, part B (stream B, 2026-11-13): the sellable work flows on WebKit
// (the iOS Safari engine) at iPhone width (390 px, touch, mobile user agent). FIXED TEST written and locked
// (~/LENSIQ-field/evals/phone-quality/locked.sha256) before any product change of the stream.
// Pass rule per flow (tests/e2e/phone-kit.mjs): loads, the main action works, no page error, no crash, no reload, no
// horizontal overflow. Cameras are canvas streams (tests/e2e/fake-cams.js or a static label canvas); detections, plate
// reads and OCR come from the localhost-only test seams (?fakedet / ?fakeocr), so the flows test the page, not a model.
//   exam-lab     consent -> camera -> one face seen -> calibration -> exam phase with the monitor shown
//   attendance   employee mode (PIN/QR, no face): add an employee with a PIN, punch in by PIN, punch by QR badge
//   gate         gate.html landing loads with the variant links; parking.html: PDPA acknowledgement -> camera -> read a
//                plate -> the guard confirms the entry -> the car is inside
//   crowd        notice acknowledged -> camera -> 3 scripted people counted live
//   product      medicine.html "Product check": live scan on a static label -> registration number found (Thailand)
//   nutrition    sample label -> the label card; the camera opens and streams
//   studio       studio.html: engine ready -> camera -> shoot -> the portrait pipeline finishes
//   photobooth   one-photo booth: camera ready -> shoot (3 s countdown) -> the result sheet is shown
// Synthetic input only; no photo of a person.
import { assert } from "./cdp.mjs";
import { MD_SHIM, flow, launchWebKit, setVal, sleep, waitFor } from "./phone-kit.mjs";

const ONE_CAM = `window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" };`;
const EXAM = `window.__dets = []; window.__LQ_FAKE_DET = key => key === "exam-lab" ? window.__dets : null;`;
const EXAM_FACE = { x: 0.32, y: 0.18, w: 0.34, h: 0.5, score: 0.95, yaw: 0, pitch: 0 };
const PLATE = "window.__plate = { text: '1กข 2345', conf: 0.95, province: 'bangkok' }; window.__LQ_FAKE_PLATE = () => window.__plate;";
const CROWD = `try { localStorage.setItem("lqcr-ack", JSON.stringify({ at: 1 })); localStorage.setItem("lqcr-zones", "[]"); } catch (e) {}
  window.__LQ_FAKE_DET = key => key === "crowd" ? [0.1, 0.4, 0.7].map(x => ({ x, y: 0.4, w: 0.08, h: 0.35, score: 0.9 })) : [];`;
// Product check: a steady label on a 1280 x 720 canvas camera; the OCR / barcode seams return its lines (no model run)
const PC = `window.__LQ_FAKE_FACE = () => [];
  window.__LQ_FAKE_PCOCR = () => ["ยาแก้ปวด TESTOL 500 mg", "เลขทะเบียน 1A 844/39", "ส่วนประกอบ: พาราเซตามอล 500 มก.", "EXP 01/2028"];
  window.__LQ_FAKE_PCBAR = () => [];
  (function () { const md = navigator.mediaDevices; if (!md) return; let c = null;
    // the canvas is made on first use: at init-script time WebKit may not have a document to create it in yet
    const canvas = () => { if (c) return c; c = document.createElement("canvas"); c.width = 1280; c.height = 720; const x = c.getContext("2d");
      const paint = () => { x.fillStyle = "#f2efe6"; x.fillRect(0, 0, 1280, 720); x.fillStyle = "#151515"; x.font = "bold 34px sans-serif"; x.textBaseline = "top";
        for (let i = 0; i < 13; i++) x.fillText("TESTOL 500 mg REG 1A 844/39 LOT 2611A EXP 01/2028 " + i, 40, 30 + i * 52); };
      setInterval(paint, 50); paint(); return c; };
    md.enumerateDevices = async () => [{ kind: "videoinput", deviceId: "fake-live", groupId: "g", label: "Back camera (fake)", toJSON() { return this; } }];
    md.getUserMedia = async () => { const s = canvas().captureStream(15); const tr = s.getVideoTracks()[0]; const gs = tr.getSettings.bind(tr);
      tr.getSettings = () => Object.assign({}, gs(), { deviceId: "fake-live", width: 1280, height: 720, facingMode: "environment" });
      tr.getCapabilities = () => ({ deviceId: "fake-live", width: { min: 1, max: 1280 }, height: { min: 1, max: 720 } }); return s; };
  })();`;

export default async function ({ base, check, fakeCams }) {
  const browser = await launchWebKit();
  try {
    await flow(check, browser, "exam-lab: consent -> camera -> face -> calibration -> exam", `${base}/exam-lab.html?cpu&fakedet&calsec=2`,
      { cams: fakeCams, init: [ONE_CAM, EXAM] }, async ({ page }) => {
        await waitFor(page, () => !!(window.__LQ_EXAM_LAB && window.LQI18N), null, 10000);
        await setVal(page, "#room", "LAB1"); await setVal(page, "#seat", "12"); await setVal(page, "#consent", true);
        await page.locator("#noticeForm [type=submit]").first().tap();
        await waitFor(page, () => window.__LQ_EXAM_LAB.phase === "cam" && document.querySelector("#engine").classList.contains("ok"), null, 15000);
        await page.evaluate(f => { window.__dets = [f]; }, EXAM_FACE);
        await waitFor(page, () => window.__LQ_EXAM_LAB.faces.length === 1, null, 8000);
        await page.locator("#toCal").tap();
        await waitFor(page, () => window.__LQ_EXAM_LAB.phase === "calDone", null, 12000);
        await page.locator("#toExam").tap();
        await waitFor(page, () => window.__LQ_EXAM_LAB.phase === "exam" && !document.querySelector("#monitor").hidden, null, 8000);
      });

    await flow(check, browser, "attendance (PIN/QR): add employee, punch by PIN and by QR badge", `${base}/attendance.html?cpu&fakedet`,
      { cams: fakeCams, init: [ONE_CAM], expectCam: false }, async ({ page }) => {
        await waitFor(page, () => typeof ready !== "undefined" && ready === true && !!window.LQHR, null, 20000); // eslint-disable-line no-undef
        await page.locator('.mode-btn[data-mode="employee"]').tap();
        await page.evaluate(() => { const b = document.querySelector('.hr-tab[data-h="emp"]'); if (b) b.click(); });
        // two employees: a second punch of the same person seconds later is refused as a double punch (by design)
        for (const [code, name, pin] of [["C03", "สมศรี ทดสอบ", "4321"], ["D04", "สมหมาย ทดสอบ", "8765"]]) {
          await page.evaluate(([code, name, pin]) => { const f = document.querySelector("#hrEmpForm"); f.code.value = code; f.name.value = name; f.dept.value = "ขาย"; f.pin.value = pin; f.noFace.checked = true; f.requestSubmit(); }, [code, name, pin]);
          await waitFor(page, c => window.LQHR.state.emps.some(e => e.code === c), code, 8000);
        }
        await page.locator('.tab[data-t="pin"]').tap();
        await setVal(page, "#hrCode", "C03"); await setVal(page, "#hrPin", "4321");
        await page.evaluate(() => document.querySelector("#hrPinForm").requestSubmit());
        await waitFor(page, () => /สมศรี/.test(document.querySelector("#hrPunchMsg").textContent), null, 8000);
        const qr = await page.evaluate(() => { const e = window.LQHR.state.emps.find(x => x.code === "D04"); return window.LQClock.qrPayload(e.code, e.qr); });
        await page.evaluate(v => { const el = document.querySelector("#hrQr"); el.value = v; el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }, qr);
        await waitFor(page, () => window.LQHR.state.punches.filter(p => p.method === "qr").length === 1, null, 8000);
        const m = await page.evaluate(() => window.LQHR.state.punches.map(p => p.method).sort().join());
        assert(m === "pin,qr", "one PIN + one QR punch: " + m);
      });

    await flow(check, browser, "gate: landing loads with the variant links", `${base}/gate.html`, {}, async ({ page }) => {
      const n = await page.evaluate(() => ["parking.html", "village.html"].filter(h => document.querySelector(`a[href^="${h}"]`)).length);
      assert(n === 2, "gate landing links to parking and village: " + n);
    });

    await flow(check, browser, "parking: PDPA ack -> camera -> read plate -> confirm entry", `${base}/parking.html?cpu&fakedet`,
      { cams: fakeCams, init: [ONE_CAM, PLATE] }, async ({ page }) => {
        await waitFor(page, () => !!document.querySelector("#gkAck1"), null, 10000);
        await setVal(page, "#gkOp", "สมชาย");
        await page.evaluate(() => { document.querySelector("#gkAck1").click(); document.querySelector("#gkAck2").click(); });
        await page.locator("#gkAckBtn").tap();
        await page.locator("#gkCamBtn").tap();
        await waitFor(page, () => document.querySelector("#gkVideo").videoWidth > 0, null, 15000);
        await page.locator("#gkReadBtn").tap();
        await waitFor(page, () => document.querySelector("#gkPlate").value !== "" && window.__LQ_PK.kit.lane.read && !window.__LQ_PK.kit.lane.busy, null, 10000);
        await page.evaluate(() => document.querySelector('[data-act="in"]').click());
        const inside = await page.evaluate(() => window.LQGateRules.occupancy(window.__LQ_PK.store.list("ev")).map(e => e.key).join());
        assert(inside === "1กข2345", "entry recorded: " + inside);
      });

    await flow(check, browser, "crowd: notice acknowledged -> camera -> 3 people counted", `${base}/crowd.html?cpu&fakedet`,
      { cams: fakeCams, init: [ONE_CAM, CROWD] }, async ({ page }) => {
        await waitFor(page, () => !!window.__LQZ && !document.getElementById("startCam").disabled, null, 10000);
        await page.locator("#startCam").tap();
        await waitFor(page, () => window.__LQZ.zc.running, null, 15000);
        await waitFor(page, () => { const v = document.querySelector("#tiles .tile .v"); return !!v && parseInt(v.textContent, 10) >= 3; }, null, 10000);
      });

    await flow(check, browser, "product check: live scan of a steady label -> Thai registration number", `${base}/medicine.html?fakeocr&fakeface`,
      { init: [MD_SHIM, PC] }, async ({ page }) => {
        await page.locator("#t-pc").tap();
        await waitFor(page, () => !document.querySelector("#tab-pc").hidden, null, 5000);
        await page.locator("#pcCamBtn").tap();
        await waitFor(page, () => !!(window.__LQ_PCLIVE && window.__LQ_PCLIVE.st.on) && !document.querySelector("#pcLive").hidden, null, 15000);
        await waitFor(page, () => !!document.querySelector("#pcRegs") && [...document.querySelectorAll("#pcRegs [data-country]")].some(e => e.dataset.country === "TH"), null, 25000);
      });

    await flow(check, browser, "nutrition: sample label -> card; camera opens", `${base}/nutrition.html`, { cams: fakeCams, init: [ONE_CAM] }, async ({ page }) => {
      await page.locator("#nutSample").tap();
      await waitFor(page, () => !!document.querySelector("#nutOut [data-field]"), null, 8000);
      await page.locator("#nutCamBtn").tap();
      await waitFor(page, () => !document.querySelector("#nutCamWrap").hidden && document.querySelector("#nutVideo").videoWidth > 0, null, 15000);
    });

    await flow(check, browser, "studio: engine ready -> camera -> shoot -> portrait done", `${base}/studio.html?cpu`, { cams: fakeCams, init: [ONE_CAM] }, async ({ page }) => {
      await waitFor(page, () => { const t = document.getElementById("stEngine").textContent; return /MODNet/.test(t) && !/กำลังโหลด/.test(t); }, null, 90000);
      await page.locator("#stCamBtn").tap();
      await waitFor(page, () => document.getElementById("stVideo").videoWidth > 0, null, 15000);
      await page.locator("#stShoot").tap();
      await waitFor(page, () => window.__studio.state.phase === "done", null, 120000);
    });

    await flow(check, browser, "photobooth: one photo -> result sheet", `${base}/photobooth.html?cpu&fakedet`, { cams: fakeCams, init: [ONE_CAM] }, async ({ page }) => {
      await page.locator('button[data-n="1"]').tap();
      await waitFor(page, () => document.getElementById("video").videoWidth > 0, null, 30000);
      await sleep(500);
      await page.locator("#shoot").tap();
      await waitFor(page, () => !document.getElementById("result").hidden, null, 90000);
    });
  } finally { await browser.close(); }
}
