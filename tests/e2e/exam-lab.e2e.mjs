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
      // a second person behind the candidate, counted by the object detector (no second face): "more than one person"
      // -> Check, with the count; a lone candidate with one person box stays quiet
      assert(await lab.evaluate(() => !__LQ_EXAM_LAB.sent.some(m => m.sig === "multiface")), "one face + one person: no multi-person flag");
      const PERSON = (x, score) => ({ cls: "person", x, y: 0.1, w: 0.3, h: 0.85, score });
      await lab.evaluate((f, a, b) => { window.__dets = [f, a, b]; }, FACE, PERSON(0.3, 0.9), PERSON(0.66, 0.6));
      await lab.waitFor("__LQ_EXAM_LAB.sent.some(m => m.sig === 'multiface' && m.lvl === 'check' && m.n === 2)", 8000);
      assert(await lab.evaluate(() => !__LQ_EXAM_LAB.sent.some(m => m.sig === "object" && /person/.test(JSON.stringify(m)))), "a person is never an 'object' flag");
      await lab.evaluate((f, a) => { window.__dets = [f, a]; }, FACE, PERSON(0.3, 0.9));

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

    // the real default path (no ?fakedet): MediaPipe is the face engine and no face-api.js script or model is ever requested,
    // even when the URL asks for face-api.js. Capability, not a WebGL probe, decides: the detector either runs on the live
    // camera (faceRuns grows, the face signals stay on) or it failed to load / run and the page says so. Both are correct;
    // which one happens depends on this Chrome (a Mac with WebGL disabled fails at MediaPipe's frame upload; CI's Linux
    // Chrome runs it while reporting no WebGL).
    const FACEAPI = /vendor\/face-api\.js|tiny_face_detector|face_landmark_68|face_expression|age_gender|face_recognition/;
    const start = async (lab, url, room) => {
      await lab.goto(url);
      await lab.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
      await lab.evaluate(r => {
        document.querySelector("#room").value = r; document.querySelector("#seat").value = "7";
        document.querySelector("#consent").checked = true; document.querySelector("#noticeForm").requestSubmit();
      }, room);
      await lab.waitFor("__LQ_EXAM_LAB.phase === 'cam' && __LQ_EXAM_LAB.faceEngine === 'mediapipe'", 30000);
    };
    await check("exam-lab default path: MediaPipe engine, no face-api.js request; the detector runs, or its failure is said (no WebGL probe)", async () => {
      const lab = await browser.newPage(null, { initScripts: [fakeCams, INIT] });
      await start(lab, `${base}/exam-lab.html?cpu&faceengine=faceapi`, "LAB3");
      await lab.waitFor("__LQ_EXAM_LAB.faceRuns >= 3 || __LQ_EXAM_LAB.faceOff === true", 60000);
      const st = await lab.evaluate(() => ({ runs: __LQ_EXAM_LAB.faceRuns, off: __LQ_EXAM_LAB.faceOff, gl: LQDetect.hasWebGL(), checks: document.querySelector("#checks").textContent }));
      console.log("    exam-lab default path on this Chrome: " + JSON.stringify({ ran: st.runs > 0 && !st.off, webglProbe: st.gl }));
      if (!st.off) assert(st.runs >= 3 && /ยังไม่เห็นใบหน้า/.test(st.checks), "detector runs on the camera (fake frames have no face): " + JSON.stringify(st));
      else {
        const warn = await lab.evaluate(() => document.querySelector("#engine").classList.contains("warn"));
        assert(st.runs === 0 && /ตัวตรวจใบหน้าทำงาน/.test(st.checks) && warn, "failure said: " + JSON.stringify(st));
      }
      const urls = lab.requests.map(r => r.url);
      assert(!urls.some(u => FACEAPI.test(u)), "face-api.js requested on the default path: " + urls.filter(u => FACEAPI.test(u)).join(", "));
      assert(urls.some(u => /vendor\/models\/face-landmarker\/face_landmarker_lm\.task$/.test(u)), "MediaPipe Face Landmarker requested");
      assert(urls.some(u => /vendor\/tfjs\/tf\.es2017\.min\.js/.test(u)) && urls.some(u => /vendor\/models\/cocossd\/model\.json/.test(u)), "TF.js on its own runs COCO-SSD");
      assert(!exceptions(lab).length, "exceptions: " + JSON.stringify(exceptions(lab).slice(0, 2)));
      await lab.close();
    });

    // the detector cannot run on every machine (WebAssembly removed from the page): face signals off and said so,
    // one "fix setup" event, never "no face"
    await check("exam-lab: face detector cannot run (no WebAssembly) -> face signals off and said so, one 'fix setup' event, no no-face alert", async () => {
      const NO_WASM = "try{Object.defineProperty(window,'WebAssembly',{value:undefined,configurable:true})}catch(e){}";
      const lab = await browser.newPage(null, { initScripts: [fakeCams, INIT, NO_WASM] });
      await start(lab, `${base}/exam-lab.html?cpu&calsec=1`, "LAB5");
      await lab.waitFor("__LQ_EXAM_LAB.faceOff === true && document.querySelector('#engine').classList.contains('warn')", 60000);
      await lab.waitFor("document.querySelector('#checks').textContent.includes('ตัวตรวจใบหน้าทำงาน')", 5000);
      assert(await lab.evaluate(() => __LQ_EXAM_LAB.faceRuns === 0), "no detector call succeeded");
      assert(!lab.requests.some(r => FACEAPI.test(r.url)), "no fallback to face-api.js");
      await lab.evaluate(() => document.querySelector("#toCal").click());
      await lab.waitFor("__LQ_EXAM_LAB.phase === 'calDone'", 8000);
      assert(await lab.evaluate(() => !__LQ_EXAM_LAB.baseline.ok && /ตัวตรวจใบหน้าทำงาน/.test(document.querySelector("#calMsg").textContent)), "calibration says why it failed");
      await lab.evaluate(() => document.querySelector("#toExam").click());
      await lab.waitFor("__LQ_EXAM_LAB.sent.some(m => m.sig === 'setup' && m.lvl === 'setup' && m.code === 'faceoff')", 8000);
      await sleep(12000); // longer than the no-face prompt (5 s) and Watch (10 s) times
      const sent = await lab.evaluate(() => __LQ_EXAM_LAB.sent.map(m => m.sig + ":" + (m.code || m.lvl)));
      assert(!sent.some(x => /^(noface|multiface|headturn|mouth):/.test(x)), "no face signal without a face detector: " + sent.join(","));
      assert(sent.filter(x => x === "setup:faceoff").length === 1, "told once: " + sent.join(","));
      assert(await lab.evaluate(() => document.querySelector("#prompt").hidden || !/ไม่เห็นใบหน้า/.test(document.querySelector("#prompt").textContent)), "no 'no face' prompt to the candidate");
      assert(/ตัวตรวจใบหน้าทำงาน/.test(await lab.evaluate(() => document.querySelector("#ownLog").innerText)), "own log says the face check is off");
      assertCleanMessages(await lab.evaluate(() => __LQ_EXAM_LAB.sent), "lab faceoff");
      await noThai(lab, "exam-lab face check off"); // the new status / log text exists in English and Chinese
      assert(!exceptions(lab).length, "exceptions: " + JSON.stringify(exceptions(lab).slice(0, 2)));
      await lab.close();
    });

    // face-api.js stays in the repo behind the research-demo switch: reachable only with the switch on AND ?faceengine=faceapi
    await check("exam-lab research demo + ?faceengine=faceapi: face-api.js detector + 68 landmarks only (never expression, age/gender, recognition)", async () => {
      const lab = await browser.newPage(null, { initScripts: [fakeCams, INIT + `\ntry { localStorage.setItem("lq-research-demo", "on"); } catch (e) {}`] });
      await lab.goto(`${base}/exam-lab.html?cpu&faceengine=faceapi`);
      await lab.waitFor("window.__LQ_EXAM_LAB && window.LQI18N && window.LENSIQ_PROFILE === 'demo'", 8000);
      await lab.evaluate(() => {
        document.querySelector("#room").value = "LAB4"; document.querySelector("#seat").value = "2";
        document.querySelector("#consent").checked = true; document.querySelector("#noticeForm").requestSubmit();
      });
      await lab.waitFor("__LQ_EXAM_LAB.faceEngine === 'faceapi' && document.querySelector('#engine').classList.contains('ok')", 60000);
      await sleep(1500);
      assert(await lab.evaluate(() => __LQ_EXAM_LAB.faceOff === false), "face-api.js runs without WebGL (wasm)");
      const urls = lab.requests.map(r => r.url);
      assert(urls.some(u => /vendor\/face-api\.js/.test(u)) && urls.some(u => /tiny_face_detector_model/.test(u))
        && urls.some(u => /face_landmark_68_model/.test(u)), "research path loads face-api.js");
      assert(!urls.some(u => /face_expression|age_gender|face_recognition|face_landmarker_lm\.task/.test(u)), "only the detector + 68 landmarks: " + urls.filter(u => /model/.test(u)).join(", "));
      assert(!exceptions(lab).length, "exceptions: " + JSON.stringify(exceptions(lab).slice(0, 2)));
      await lab.close();
    });
  } finally { await browser.close(); }
}
