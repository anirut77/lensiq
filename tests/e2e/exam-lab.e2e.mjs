// tests/e2e/exam-lab.e2e.mjs — exam-lab.html (Mode B candidate page) with the fake camera + ?fakedet scripted faces, and
// exam-dashboard.html in the same browser (BroadcastChannel): consent gate, camera check, calibration, gentle prompt before
// escalation, no-face Watch, phone Check, long paste, frozen feed, own event log, accommodation from the dashboard,
// JSON-only messages, 0% Thai in 中文/English, phone layout.
import { assert, privacyScan } from "./cdp.mjs";
import { assertCleanMessages, exceptions, noThai, phoneAudit, sleep } from "./exam-kit.mjs";

const FACE = { x: 0.32, y: 0.18, w: 0.34, h: 0.5, score: 0.95, yaw: 0, pitch: 0 };
const INIT = `window.__LQ_FAKE_CAMS = {n: 1, mode: "ok"}; window.__dets = []; try { localStorage.setItem("lq-lang", "th"); } catch (e) {}
  window.__LQ_FAKE_DET = key => key === "exam-lab" ? window.__dets : null;`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("exam-lab: consent -> camera -> calibration -> exam; prompts, Watch/Check reach the dashboard", async () => {
      const lab = await browser.newPage(null, { initScripts: [fakeCams, INIT] });
      await lab.goto(`${base}/exam-lab.html?cpu&fakedet&calsec=2`);
      await lab.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
      await lab.evaluate(() => localStorage.clear());
      await phoneAudit(lab, "exam-lab notice");
      await noThai(lab, "exam-lab notice");

      const db = await browser.newPage(`${base}/exam-dashboard.html?room=LAB1`);
      await db.waitFor("window.__LQ_EXAM_DB && __LQ_EXAM_DB.board", 8000);
      await db.evaluate(() => { document.querySelector("#who").value = "Invigilator A"; });

      // consent is required; the camera stays off until then
      await lab.evaluate(() => { document.querySelector("#room").value = "LAB1"; document.querySelector("#seat").value = "12"; document.querySelector("#noticeForm").requestSubmit(); });
      await sleep(200);
      assert(await lab.evaluate(() => __LQ_EXAM_LAB.phase === "notice" && document.querySelector("#noticeMsg").textContent.length > 5 && !document.querySelector("video").srcObject), "no consent -> stays on the notice, camera off");
      await lab.evaluate(() => { document.querySelector("#consent").checked = true; document.querySelector("#noticeForm").requestSubmit(); });
      await lab.waitFor("__LQ_EXAM_LAB.phase === 'cam' && document.querySelector('#engine').classList.contains('ok')", 10000);
      await lab.evaluate(f => { window.__dets = [f]; }, FACE);
      await lab.waitFor("__LQ_EXAM_LAB.faces.length === 1", 5000);
      await lab.waitFor("document.querySelector('#checks').textContent.includes('เห็นใบหน้าหนึ่งใบหน้า')", 5000);
      // the dashboard sees the candidate's heartbeat
      await db.waitFor("Object.values(__LQ_EXAM_DB.board.nodes).some(n => n.src === 'lab' && n.seats[0] === '12')", 8000);

      await lab.evaluate(() => document.querySelector("#toCal").click());
      await lab.waitFor("__LQ_EXAM_LAB.phase === 'calDone'", 8000);
      const b = await lab.evaluate(() => __LQ_EXAM_LAB.baseline);
      assert(b.ok && Math.abs(b.yaw0) < 1, "calibrated baseline " + JSON.stringify(b));
      await lab.evaluate(() => document.querySelector("#toExam").click());
      await lab.waitFor("__LQ_EXAM_LAB.phase === 'exam' && !document.querySelector('#monitor').hidden", 5000);

      // face leaves: gentle prompt first (local only), then Watch reaches the dashboard
      await lab.evaluate(() => { window.__dets = []; });
      await lab.waitFor("!document.querySelector('#prompt').hidden", 9000);
      const early = await lab.evaluate(() => __LQ_EXAM_LAB.sent.filter(m => m.sig === "noface").length);
      assert(early === 0, "prompt shown before anything is sent");
      await lab.waitFor("__LQ_EXAM_LAB.sent.some(m => m.sig === 'noface' && m.lvl === 'watch')", 9000);
      await db.waitFor("__LQ_EXAM_DB.board.queue(Date.now()).some(a => a.seat === '12' && a.sig === 'noface')", 5000);

      // face back + a phone in 3 of 5 frames -> Check
      await lab.evaluate(f => { window.__dets = [f, { cls: "phone", score: 0.9 }]; }, FACE);
      await lab.waitFor("__LQ_EXAM_LAB.sent.some(m => m.sig === 'phone' && m.lvl === 'check')", 5000);
      await db.waitFor("__LQ_EXAM_DB.board.queue(Date.now())[0].sig === 'phone'", 5000);
      await lab.evaluate(f => { window.__dets = [f]; }, FACE);

      // a long paste -> Watch; shown in the candidate's own log
      await lab.evaluate(() => {
        const dt = new DataTransfer(); dt.setData("text/plain", "x".repeat(120));
        document.querySelector("#answer").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
      });
      await lab.waitFor("__LQ_EXAM_LAB.sent.some(m => m.sig === 'paste' && m.lvl === 'watch' && m.n === 120)", 3000);
      const own = await lab.evaluate(() => document.querySelector("#ownLog").innerText);
      assert(/วางข้อความ/.test(own) && /ไม่เห็นใบหน้า/.test(own) && /โทรศัพท์/.test(own), "own log lists the events: " + own.slice(0, 200));
      assert(!/คะแนน|score/i.test(own), "no score shown to the candidate");

      // a frozen camera feed -> Watch
      await lab.evaluate(() => window.__LQ_FAKE.freeze("fake-cam-1", true));
      await lab.waitFor("__LQ_EXAM_LAB.sent.some(m => m.sig === 'frozen')", 12000);
      await lab.evaluate(() => window.__LQ_FAKE.freeze("fake-cam-1", false));

      // accommodation set on the dashboard reaches the candidate page (no diagnosis travels)
      await db.evaluate(() => { document.querySelector("#accSeat").value = "12"; document.querySelector("#accRead").checked = true; document.querySelector("#accNoFace").value = "2"; document.querySelector("#accForm").requestSubmit(); });
      await lab.waitFor("__LQ_EXAM_LAB.mon.cfg.profile && __LQ_EXAM_LAB.mon.cfg.profile.readAloud === true && __LQ_EXAM_LAB.mon.cfg.noFaceWatchMs === 20000", 5000);
      assert(await lab.evaluate(() => __LQ_EXAM_LAB.baseline.ok), "baseline kept after the profile change");

      // invigilator acts on the phone alert
      await db.evaluate(() => { const card = [...document.querySelectorAll("#queue .alert")].find(c => /โทรศัพท์/.test(c.textContent)); card.querySelector("[data-act=going]").click(); });
      await db.waitFor("__LQ_EXAM_DB.board.alerts.some(a => a.sig === 'phone' && a.status === 'going' && a.acts[0].who === 'Invigilator A')", 3000);

      await noThai(lab, "exam-lab exam phase");
      await phoneAudit(lab, "exam-lab exam phase", [360]);
      assertCleanMessages(await lab.evaluate(() => __LQ_EXAM_LAB.sent), "lab");
      await privacyScan(lab); await privacyScan(db);
      await lab.evaluate(() => document.querySelector("#endExam").click());
      assert(await lab.evaluate(() => __LQ_EXAM_LAB.phase === "done" && document.querySelector("#monitor").hidden), "ended, indicator off");
      for (const p of [lab, db]) assert(!exceptions(p).length, "exceptions: " + JSON.stringify(exceptions(p).slice(0, 2)));
      await lab.close(); await db.close();
    });

    await check("exam-lab: decline offers an alternative and never opens the camera; poor light = 'fix setup', no alert", async () => {
      const lab = await browser.newPage(null, { initScripts: [fakeCams, INIT] });
      await lab.goto(`${base}/exam-lab.html?cpu&fakedet&calsec=1`);
      await lab.waitFor("window.__LQ_EXAM_LAB", 8000);
      await lab.evaluate(() => document.querySelector("#decline").click());
      const t = await lab.evaluate(() => ({ msg: document.querySelector("#noticeMsg").textContent, cam: !!document.querySelector("video").srcObject }));
      assert(/ทางเลือกอื่น/.test(t.msg) && !t.cam, "decline: " + JSON.stringify(t));
      await lab.evaluate(() => { window.__LQ_FAKE_Q = { ok: false, code: "dark", score: 12 }; document.querySelector("#room").value = "LAB2"; document.querySelector("#seat").value = "3"; document.querySelector("#consent").checked = true; document.querySelector("#noticeForm").requestSubmit(); });
      await lab.waitFor("__LQ_EXAM_LAB.phase === 'cam' && document.querySelector('#engine').classList.contains('ok')", 10000);
      await lab.waitFor("document.querySelector('#lightMsg').textContent.includes('มืดเกินไป')", 5000);
      await lab.evaluate(() => document.querySelector("#toCal").click());
      await lab.waitFor("__LQ_EXAM_LAB.phase === 'calDone'", 6000);
      assert(await lab.evaluate(() => !__LQ_EXAM_LAB.baseline.ok && /ไม่สำเร็จ/.test(document.querySelector("#calMsg").textContent)), "no face during calibration -> honest failure");
      await lab.evaluate(() => document.querySelector("#toExam").click());
      await lab.waitFor("__LQ_EXAM_LAB.sent.some(m => m.sig === 'setup' && m.code === 'dark')", 12000);
      await sleep(5500);
      const sent = await lab.evaluate(() => __LQ_EXAM_LAB.sent.map(m => m.sig + ":" + m.lvl));
      assert(!sent.some(s => s.startsWith("noface")), "dark camera never produces a no-face alert: " + sent.join(","));
      assert(!exceptions(lab).length, "exceptions");
      await lab.close();
    });
  } finally { await browser.close(); }
}
