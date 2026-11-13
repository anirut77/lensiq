// tests/e2e/camera-noframes.e2e.mjs — a camera that opens but never delivers a frame (stream B "real-phone quality",
// 2026-11-13). Found on Linux WebKit: the stream is live, video.play() never settles, and LQCam.start() waited forever,
// so attendance.html stayed on "opening the camera" and even the PIN / QR time clock (which needs no camera) never
// became ready. FIXED TEST written and locked (~/LENSIQ-field/evals/phone-quality/, evals-locks/phone-quality.sha256)
// before the fix. The fake camera is frozen before it opens (tests/e2e/fake-cams.js freeze(): no frame is ever painted).
//   1. attendance.html: the page becomes ready within 12 s (camera start does not hang);
//   2. the PIN time clock then works: add an employee with a PIN, punch in by PIN.
import { assert } from "./cdp.mjs";

const FROZEN = `window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__LQ_FAKE.freeze("fake-cam-1", true); window.__LQ_FAKE_DET = () => [];`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("frozen camera: attendance becomes ready within 12 s and the PIN clock works", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, FROZEN] });
      try {
        // navigate without waiting for the load event: with a frameless autoplay video Chrome may hold "load" back
        const t0 = Date.now();
        await page.send("Page.navigate", { url: `${base}/attendance.html?cpu&fakedet` });
        await page.waitFor("typeof ready !== 'undefined' && ready === true && !!window.LQHR", 12000);
        assert(Date.now() - t0 <= 13000, "ready in time: " + (Date.now() - t0) + " ms");
        assert(await page.evaluate(() => document.querySelector("video").videoWidth === 0), "the camera really delivered no frame");
        await page.evaluate(() => document.querySelector('.mode-btn[data-mode="employee"]').click());
        await page.evaluate(() => { const b = document.querySelector('.hr-tab[data-h="emp"]'); if (b) b.click(); });
        await page.evaluate(() => { const f = document.querySelector("#hrEmpForm"); f.code.value = "C03"; f.name.value = "ทดสอบ หนึ่ง"; f.dept.value = "ขาย"; f.pin.value = "4321"; f.noFace.checked = true; f.requestSubmit(); });
        await page.waitFor("window.LQHR.state.emps.some(e => e.code === 'C03')", 8000);
        await page.evaluate(() => document.querySelector('.tab[data-t="pin"]').click());
        await page.evaluate(() => { for (const [s, v] of [["#hrCode", "C03"], ["#hrPin", "4321"]]) { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); } document.querySelector("#hrPinForm").requestSubmit(); });
        await page.waitFor("window.LQHR.state.punches.some(p => p.method === 'pin')", 8000);
        const ex = page.consoleErrors.filter(e => e.kind === "exception");
        assert(!ex.length, "no uncaught errors: " + ex.map(e => e.text).join(" | "));
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}
