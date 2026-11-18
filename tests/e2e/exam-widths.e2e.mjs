// tests/e2e/exam-widths.e2e.mjs — Exam lab acceptance sheet (docs/acceptance/exam-lab.md, locked 2026-11-18) criterion
// P4: the main flow (not only the landing) in Chrome at 360 px and at 430 px, for exam-lab.html, exam.html and
// exam-dashboard.html. FIXED TEST written and locked (evals-locks/examlab-90.sha256) BEFORE any product change of branch
// examlab-90 (base origin/main a9950944). The page is opened AT that width (mobile, touch) and the whole flow runs there;
// at every step the camera-mobile audit holds: no horizontal scroll, touch targets >= 44 px, text >= 12 px.
//   exam-lab     notice -> consent -> camera check (one face) -> calibration -> exam -> a phone flag in the own log -> end
//   exam         the landing with its links and claims
//   dashboard    join a room -> demo flags -> act with a name -> tally -> CSV -> printed report
// Fake camera (tests/e2e/fake-cams.js) and scripted detections (?fakedet); no photo of a person.
import { assert } from "./cdp.mjs";
import { audit } from "./camera-mobile.e2e.mjs";
import { exceptions, sleep } from "./exam-kit.mjs";

const FACE = { x: 0.32, y: 0.18, w: 0.34, h: 0.5, score: 0.95, yaw: 0, pitch: 0 };
const INIT = `window.__LQ_FAKE_CAMS = {n: 1, mode: "ok"}; window.__dets = []; try { localStorage.setItem("lq-lang", "th"); } catch (e) {}
  window.__LQ_FAKE_DET = key => key === "exam-lab" ? window.__dets : null;`;

const CAPTURE = `window.__dl = []; HTMLAnchorElement.prototype.click = function () { window.__dl.push({ name: this.download, href: this.href }); };
  window.print = () => { window.__printed = true; };`;

async function at(page, w, label) {
  await sleep(350);
  const r = await page.evaluate(audit);
  assert(r.sw <= r.cw, `${label} @${w}: horizontal overflow ${r.sw} > ${r.cw}`);
  assert(!r.bad.length, `${label} @${w}: small touch targets (${r.bad.length}): ${r.bad.slice(0, 8).join(" | ")}`);
  assert(!r.tiny.length, `${label} @${w}: text < 12 px: ${r.tiny.slice(0, 8).join(" | ")}`);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const open = async (w, init) => {
    const page = await browser.newPage(null, { initScripts: init });
    await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    return page;
  };
  try {
    for (const w of [360, 430]) {
      await check(`exam-lab main flow at ${w} px: notice -> camera -> calibration -> exam -> own log -> end`, async () => {
        const page = await open(w, [fakeCams, INIT]);
        try {
          await page.goto(`${base}/exam-lab.html?cpu&fakedet&calsec=2`);
          await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
          assert(await page.evaluate(() => window.innerWidth) === w, "viewport width");
          await at(page, w, "exam-lab notice");
          await page.evaluate(() => {
            document.querySelector("#room").value = "W" + innerWidth; document.querySelector("#seat").value = "3";
            document.querySelector("#consent").checked = true; document.querySelector("#noticeForm").requestSubmit();
          });
          await page.waitFor("__LQ_EXAM_LAB.phase === 'cam' && document.querySelector('#engine').classList.contains('ok')", 10000);
          await page.evaluate(f => { window.__dets = [f]; }, FACE);
          await page.waitFor("__LQ_EXAM_LAB.faces.length === 1", 5000);
          await at(page, w, "exam-lab camera check");
          await page.evaluate(() => document.querySelector("#toCal").click());
          await at(page, w, "exam-lab calibration");
          await page.waitFor("__LQ_EXAM_LAB.phase === 'calDone'", 8000);
          await page.evaluate(() => document.querySelector("#toExam").click());
          await page.waitFor("__LQ_EXAM_LAB.phase === 'exam' && !document.querySelector('#monitor').hidden", 5000);
          await page.evaluate(f => { window.__dets = [f, { cls: "phone", score: 0.9 }]; }, FACE);
          await page.waitFor("__LQ_EXAM_LAB.sent.some(m => m.sig === 'phone')", 6000);
          await page.waitFor("/โทรศัพท์/.test(document.querySelector('#ownLog').innerText)", 3000);
          await at(page, w, "exam-lab exam + own log");
          await page.evaluate(() => document.querySelector("#endExam").click());
          assert(await page.evaluate(() => __LQ_EXAM_LAB.phase === "done"), "ended");
          await at(page, w, "exam-lab ended");
          assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
        } finally { await page.close(); }
      });

      await check(`exam.html at ${w} px: landing, links and claims`, async () => {
        const page = await open(w, [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`]);
        try {
          await page.goto(`${base}/exam.html`);
          await page.waitFor("window.LQI18N && document.querySelector('#examClaims')", 8000);
          const links = await page.evaluate(() => [...document.querySelectorAll("main a.btn")].map(a => a.getAttribute("href")));
          for (const h of ["exam-lab.html", "exam-hall.html", "exam-dashboard.html"]) assert(links.includes(h), "link to " + h);
          await at(page, w, "exam.html");
          assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
        } finally { await page.close(); }
      });

      await check(`exam-dashboard main flow at ${w} px: join -> demo -> act -> tally -> CSV -> report`, async () => {
        const page = await open(w, [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`]);
        try {
          await page.goto(`${base}/exam-dashboard.html`);
          await page.waitFor("window.__LQ_EXAM_DB && window.LQI18N", 8000);
          await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("lq-exam")) localStorage.removeItem(k); });
          await page.reload();
          await page.waitFor("window.__LQ_EXAM_DB && window.LQI18N", 8000);
          await at(page, w, "dashboard empty");
          await page.evaluate(() => {
            document.querySelector("#room").value = "W" + innerWidth; document.querySelector("#who").value = "อ.ทดสอบ";
            document.querySelector("#joinForm").requestSubmit();
          });
          await page.waitFor("__LQ_EXAM_DB.room === 'W' + innerWidth", 4000);
          await page.evaluate(() => document.querySelector("#demoBtn").click());
          await page.waitFor("__LQ_EXAM_DB.room === 'DEMO' && document.querySelectorAll('#queue .alert').length === 5", 4000);
          await page.evaluate(() => {
            document.querySelector("#who").value = "อ.ทดสอบ";
            const c = [...document.querySelectorAll("#queue .alert")].find(x => /โทรศัพท์/.test(x.textContent)); c.querySelector("[data-act=going]").click();
          });
          await page.waitFor("__LQ_EXAM_DB.board.alerts.some(a => a.sig === 'phone' && a.status === 'going')", 3000);
          await page.evaluate(() => { const c = [...document.querySelectorAll("#queue .alert")].find(x => /โทรศัพท์/.test(x.textContent)); c.querySelector("[data-v='1']").click(); });
          await page.waitFor("/100%/.test(document.querySelector('#precBody').innerText)", 3000);
          await at(page, w, "dashboard populated");
          await page.evaluate(CAPTURE);
          await page.evaluate(() => document.querySelector("#csvBtn").click());
          const csv = await page.evaluate(async () => (await fetch(window.__dl[0].href)).text());
          assert(/^﻿?เวลา,ห้อง,ที่นั่ง/.test(csv) && csv.split("\r\n").length >= 6, "CSV: " + csv.slice(0, 80));
          await page.evaluate(() => document.querySelector("#printBtn").click());
          assert(await page.evaluate(() => window.__printed && document.querySelectorAll("#report tbody tr").length >= 5), "printed report with rows");
          assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
