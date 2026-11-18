// tests/e2e/exam-states.e2e.mjs — Exam lab acceptance sheet (docs/acceptance/exam-lab.md, locked 2026-11-18) criteria
// E (error and empty states), X (the candidate's own log) and L3 (generated output in the chosen language). FIXED TEST
// written and locked (evals-locks/examlab-90.sha256) BEFORE any product change of branch examlab-90 (base origin/main
// a9950944). Each state is checked in Thai, English and Chinese on a fresh page load (lq-lang); "plain message" = a
// non-empty text in that language (no Thai letter in English / Chinese) and nothing left busy (no [aria-busy=true]).
//   E1 camera refused (getUserMedia -> NotAllowedError): exam-lab says so in an error status, the flow does not advance.
//   E2 camera that opens but never sends a frame: within 12 s exam-lab says so (warning or error status, not the
//      loading text), and "next: calibration" does not leave the candidate in a calibration that can never finish.
//   E3 crash guard loaded on exam.html, exam-lab.html and exam-dashboard.html (window.LQCrashGuard), and after a crash
//      restart (the marker the dying page leaves in sessionStorage) each page shows the restart note in the page language.
//   E4 face not found: camera on, no face -> the check list says so.
//   E5 dashboard with no candidates yet: the node list, the queue and the log each show their empty-state text.
//   X  the candidate's own log: empty-state text first; during the exam a phone flag is listed with its time and its
//      reason in the page language, and no score.
//   L3 dashboard output in English and Chinese: CSV header and every generated cell, and the printed committee report,
//      contain no Thai letter (names / notes typed by the invigilator are in English here).
// Fake camera (tests/e2e/fake-cams.js) and scripted detections (?fakedet); no photo of a person.
import { assert } from "./cdp.mjs";
import { exceptions, sleep } from "./exam-kit.mjs";

const THAI = /[฀-๿]/;
const LANGS = ["th", "en", "zh"];
const FACE = { x: 0.32, y: 0.18, w: 0.34, h: 0.5, score: 0.95, yaw: 0, pitch: 0 };
const lang = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const DETS = `window.__dets = []; window.__LQ_FAKE_DET = key => key === "exam-lab" ? window.__dets : null;`;
const ONE_CAM = `window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" };`;
const DENY = `(() => { const md = navigator.mediaDevices; if (!md) return;
  md.getUserMedia = async () => { throw new DOMException("Permission denied", "NotAllowedError"); }; })();`;
const FROZEN = `window.__LQ_FAKE.freeze("fake-cam-1", true);`;
const CAPTURE = `window.__dl = []; HTMLAnchorElement.prototype.click = function () { window.__dl.push({ name: this.download, href: this.href }); };
  window.print = () => { window.__printed = true; };`;
const CRASHED = `if (window.name !== "lq-restarted") { window.name = "lq-restarted"; try { sessionStorage.setItem("lq-heavy", "1"); } catch (e) {} }`;

/** text of a selector, the language checks, and no busy control */
async function plain(page, sel, l, label, re) {
  const r = await page.evaluate(s => {
    const el = document.querySelector(s);
    return { text: el ? el.textContent.trim() : null, busy: document.querySelectorAll("[aria-busy=true]").length };
  }, sel);
  assert(r.text && r.text.length >= 6, `${label} [${l}]: no message in ${sel}: ${JSON.stringify(r.text)}`);
  if (l !== "th") assert(!THAI.test(r.text), `${label} [${l}]: Thai letters in ${sel}: ${r.text.slice(0, 160)}`);
  if (re && re[l]) assert(re[l].test(r.text), `${label} [${l}]: ${sel} does not say it: ${r.text.slice(0, 160)}`);
  assert(r.busy === 0, `${label} [${l}]: ${r.busy} control(s) left busy`);
  return r.text;
}

async function consent(page, room = "LAB9", seat = "4") {
  await page.evaluate(([r, s]) => {
    document.querySelector("#room").value = r; document.querySelector("#seat").value = s;
    document.querySelector("#consent").checked = true; document.querySelector("#noticeForm").requestSubmit();
  }, [room, seat]);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const open = async (url, l, init = []) => {
    const page = await browser.newPage(null, { initScripts: [lang(l), ...init] });
    await page.goto(url);
    return page;
  };
  const LAB = `${base}/exam-lab.html?cpu&fakedet&calsec=2`;
  try {
    for (const l of LANGS) {
      await check(`E1 exam-lab camera refused [${l}]: an error status says so, the flow does not advance`, async () => {
        const page = await open(LAB, l, [fakeCams, ONE_CAM, DETS, DENY]);
        try {
          await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
          await consent(page);
          await page.waitFor("document.querySelector('#engine').classList.contains('err')", 10000);
          await sleep(500);
          await plain(page, "#engine", l, "camera refused", { en: /camera/i, zh: /摄像头|相机|镜头/ });
          assert(await page.evaluate(() => window.__LQ_EXAM_LAB.phase !== "exam" && !window.__LQ_EXAM_LAB.faces.length), "refused camera never reaches the exam");
          assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
        } finally { await page.close(); }
      });

      await check(`E2 exam-lab camera with no frames [${l}]: said within 12 s; calibration cannot hang`, async () => {
        const page = await open(LAB, l, [fakeCams, ONE_CAM, DETS, FROZEN]);
        try {
          await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
          const loading = await page.evaluate(() => window.LQI18N.tf("exam.lab.loading", "กำลังเปิดกล้องและโหลดโมเดล (ในเครื่องนี้)..."));
          await consent(page);
          await page.waitFor(`(() => { const e = document.querySelector("#engine"); return (e.classList.contains("warn") || e.classList.contains("err"))
            && e.textContent.trim().length > 5 && e.textContent.trim() !== ${JSON.stringify(loading)}; })()`, 12000);
          assert(await page.evaluate(() => document.querySelector("video").videoWidth === 0), "the camera really delivered no frame");
          await plain(page, "#engine", l, "no frames", { en: /picture|image|video|frame/i, zh: /画面|图像|影像|视频/ });
          await page.evaluate(() => document.querySelector("#toCal").click());
          await sleep(4000); // ?calsec=2: a calibration that could run would have finished by now
          const st = await page.evaluate(() => ({ phase: window.__LQ_EXAM_LAB.phase, cal: document.querySelector("#stepCal").hidden === false }));
          assert(st.phase !== "cal", "calibration started without any frame and can never finish: " + JSON.stringify(st));
          await plain(page, "#engine", l, "no frames after next", { en: /picture|image|video|frame/i, zh: /画面|图像|影像|视频/ });
          assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
        } finally { await page.close(); }
      });

      await check(`E3 crash guard on exam.html, exam-lab.html, exam-dashboard.html [${l}]: loaded; restart note after a crash`, async () => {
        for (const p of ["exam.html", "exam-lab.html?cpu&fakedet", "exam-dashboard.html"]) {
          const page = await open(`${base}/${p}`, l, [CRASHED]);
          try {
            await page.waitFor("!!window.LQI18N && document.readyState === 'complete'", 10000);
            await sleep(600);
            const g = await page.evaluate(() => ({ g: !!window.LQCrashGuard, rec: !!(window.LQCrashGuard && window.LQCrashGuard.recovered),
              note: !!document.querySelector(".lq-crash-note") }));
            assert(g.g, `${p}: lensiq-crashguard.js is not loaded`);
            assert(g.rec && g.note, `${p}: no restart note after a crash ${JSON.stringify(g)}`);
            await plain(page, ".lq-crash-note p", l, p + " restart note", { en: /restart/i, zh: /重新/ });
            assert(!exceptions(page).length, `${p} exceptions: ` + JSON.stringify(exceptions(page).slice(0, 2)));
          } finally { await page.close(); }
        }
      });

      await check(`E4 exam-lab face not found [${l}]: the check list says so`, async () => {
        const page = await open(LAB, l, [fakeCams, ONE_CAM, DETS]);
        try {
          await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
          await consent(page);
          await page.waitFor("window.__LQ_EXAM_LAB.phase === 'cam' && document.querySelector('#engine').classList.contains('ok')", 10000);
          await sleep(2500);
          await page.waitFor("document.querySelectorAll('#checks li.warn-li').length >= 1", 5000);
          await plain(page, "#checks li.warn-li:last-child", l, "no face", { en: /face/i, zh: /脸/ });
        } finally { await page.close(); }
      });

      await check(`E5 exam-dashboard with no candidates yet [${l}]: node list, queue and log show their empty text`, async () => {
        const page = await open(`${base}/exam-dashboard.html?room=EMPTY${l.toUpperCase()}`, l);
        try {
          await page.waitFor("window.__LQ_EXAM_DB && window.__LQ_EXAM_DB.board && window.LQI18N", 8000);
          await sleep(500);
          await plain(page, "#nodes", l, "no nodes");
          await plain(page, "#queue .empty", l, "empty queue");
          await plain(page, "#logBody .empty", l, "empty log");
        } finally { await page.close(); }
      });
    }

    for (const l of ["th", "en", "zh"]) {
      await check(`X candidate's own log [${l}]: empty text, then a phone flag with its time and reason, no score`, async () => {
        const page = await open(LAB, l, [fakeCams, ONE_CAM, DETS]);
        try {
          await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
          await page.evaluate(() => localStorage.removeItem("lq-exam-lab-log"));
          await page.reload();
          await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
          await plain(page, "#ownLog .empty", l, "own log empty");
          await consent(page);
          await page.waitFor("window.__LQ_EXAM_LAB.phase === 'cam' && document.querySelector('#engine').classList.contains('ok')", 10000);
          await page.evaluate(f => { window.__dets = [f]; }, FACE);
          await page.waitFor("window.__LQ_EXAM_LAB.faces.length === 1", 5000);
          await page.evaluate(() => document.querySelector("#toCal").click());
          await page.waitFor("window.__LQ_EXAM_LAB.phase === 'calDone'", 8000);
          await page.evaluate(() => document.querySelector("#toExam").click());
          await page.waitFor("window.__LQ_EXAM_LAB.phase === 'exam'", 5000);
          await page.evaluate(f => { window.__dets = [f, { cls: "phone", score: 0.9 }]; }, FACE);
          await page.waitFor("window.__LQ_EXAM_LAB.sent.some(m => m.sig === 'phone')", 6000);
          await sleep(300);
          const own = await plain(page, "#ownLog", l, "own log", { th: /โทรศัพท์/, en: /phone/i, zh: /手机/ });
          assert(/\d{1,2}:\d{2}/.test(own), "own log entry has a time: " + own.slice(0, 160));
          assert(!/คะแนน|score|分数|得分/i.test(own), "no score shown to the candidate: " + own.slice(0, 160));
          await page.evaluate(() => document.querySelector("#endExam").click());
        } finally { await page.close(); }
      });
    }

    for (const l of ["en", "zh"]) {
      await check(`L3 exam-dashboard output in ${l}: CSV and printed report have no Thai letter`, async () => {
        const page = await open(`${base}/exam-dashboard.html`, l);
        try {
          await page.waitFor("window.__LQ_EXAM_DB && window.LQI18N", 8000);
          await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("lq-exam")) localStorage.removeItem(k); });
          await page.reload();
          await page.waitFor("window.__LQ_EXAM_DB && window.LQI18N", 8000);
          await page.evaluate(() => document.querySelector("#demoBtn").click());
          await page.waitFor("window.__LQ_EXAM_DB.room === 'DEMO' && document.querySelectorAll('#queue .alert').length >= 3", 4000);
          await page.evaluate(() => {
            document.querySelector("#who").value = "Invigilator B";
            const cards = [...document.querySelectorAll("#queue .alert")];
            cards[0].querySelector("[data-act=going]").click();
            const c = [...document.querySelectorAll("#queue .alert")][1];
            c.querySelector(".note-in").value = "second invigilator";
            c.querySelector("[data-act=escalate]").click();
          });
          await page.evaluate(CAPTURE);
          await page.evaluate(() => document.querySelector("#csvBtn").click());
          const csv = await page.evaluate(async () => (await fetch(window.__dl[0].href)).text());
          const lines = csv.replace(/^﻿/, "").split("\r\n");
          assert(lines.length >= 4, "CSV rows: " + lines.length);
          const th = lines.map((s, i) => [i, s]).filter(([, s]) => THAI.test(s));
          assert(!th.length, `CSV [${l}] has Thai letters on ${th.length} line(s): ` + th.slice(0, 3).map(([i, s]) => i + ": " + s.slice(0, 120)).join(" | "));
          assert(l === "en" ? /time/i.test(lines[0]) && /seat/i.test(lines[0]) : /时间/.test(lines[0]) && /座/.test(lines[0]), "CSV header in " + l + ": " + lines[0]);
          await page.evaluate(() => document.querySelector("#printBtn").click());
          const rep = await page.evaluate(() => ({ printed: !!window.__printed, rows: document.querySelectorAll("#report tbody tr").length, text: document.querySelector("#report").innerText }));
          assert(rep.printed && rep.rows >= 3, "report printed with rows: " + JSON.stringify({ printed: rep.printed, rows: rep.rows }));
          const bad = rep.text.split("\n").filter(s => THAI.test(s));
          assert(!bad.length, `report [${l}] has Thai letters: ` + bad.slice(0, 3).join(" | ").slice(0, 300));
          assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
