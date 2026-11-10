// tests/e2e/exam-hall.e2e.mjs — exam-hall.html (Mode A camera node) with the fake camera + ?fakedet scripted people, and
// exam-dashboard.html in the same browser: seat polygon drawn with pointer events, grid generator, rename/delete,
// extra person -> Watch, phone -> Check, walk mode suppresses the aisle flag, room mute reaches the dashboard,
// heartbeat seats on the seat map, JSON-only messages, 0% Thai in 中文/English, phone layout.
import { assert, privacyScan } from "./cdp.mjs";
import { assertCleanMessages, exceptions, noThai, phoneAudit, sleep } from "./exam-kit.mjs";

const INIT = `window.__LQ_FAKE_CAMS = {n: 1, mode: "ok"}; window.__dets = []; try { localStorage.setItem("lq-lang", "th"); } catch (e) {}
  window.__LQ_FAKE_DET = key => key === "exam-hall" ? window.__dets : key === "exam-hall-faces" ? window.__faces : null;`;
// grid {x:.04, y:.3, w:.92, h:.66}, 1 row × 4 seats -> seat i spans x .04+.23i .. .27+.23i
const P = (i, dx = 0) => ({ x: 0.04 + 0.23 * i + 0.06 + dx, y: 0.42, w: 0.1, h: 0.4, score: 0.9 });
const FOUR = [0, 1, 2, 3].map(i => P(i));

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("exam-hall: seat editor, monitoring, extra / phone / aisle + walk mode, room mute -> dashboard", async () => {
      const hall = await browser.newPage(null, { initScripts: [fakeCams, INIT] });
      await hall.goto(`${base}/exam-hall.html?cpu&fakedet`);
      await hall.waitFor("window.__LQ_EXAM_HALL && window.LQI18N", 8000);
      await hall.evaluate(() => { localStorage.removeItem("lq-exam-seats"); localStorage.removeItem("lq-exam-hall"); });
      await phoneAudit(hall, "exam-hall setup");
      await noThai(hall, "exam-hall setup");
      const db = await browser.newPage(`${base}/exam-dashboard.html?room=HALL2`);
      await db.waitFor("window.__LQ_EXAM_DB && __LQ_EXAM_DB.board", 8000);

      // monitoring needs a camera and seats
      await hall.evaluate(() => document.querySelector("#runBtn").click());
      assert(await hall.evaluate(() => !__LQ_EXAM_HALL.monitoring), "no camera -> not monitoring");
      await hall.evaluate(() => { document.querySelector("#room").value = "HALL2"; document.querySelector("#nodeName").value = "หน้าห้อง"; document.querySelector("#setupForm").requestSubmit(); });
      await hall.waitFor("document.querySelector('#engine').classList.contains('ok')", 10000);

      // draw seat A1 with three taps on the canvas
      await hall.evaluate(() => {
        document.querySelector("#seatId").value = "A1"; document.querySelector("#drawBtn").click();
        const c = document.querySelector("#overlay"), r = c.getBoundingClientRect();
        for (const [fx, fy] of [[0.1, 0.1], [0.3, 0.1], [0.2, 0.25]]) c.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.left + fx * r.width, clientY: r.top + fy * r.height, bubbles: true }));
        document.querySelector("#closePoly").click();
      });
      const s1 = await hall.evaluate(() => __LQ_EXAM_HALL.seats);
      assert(s1.length === 1 && s1[0].id === "A1" && s1[0].poly.length === 3, "drawn seat " + JSON.stringify(s1));
      // grid of 4, then delete A1 from the list
      await hall.evaluate(() => { document.querySelector("#gRows").value = "1"; document.querySelector("#gCols").value = "4"; document.querySelector("#gFirst").value = "1"; document.querySelector("#makeGrid").click(); });
      await hall.evaluate(() => document.querySelector("#seatList [data-del='0']").click());
      const ids = await hall.evaluate(() => __LQ_EXAM_HALL.seats.map(s => s.id));
      assert(ids.join() === "1,2,3,4", "grid seats " + ids);
      // rename keeps ids unique
      await hall.evaluate(() => { const i = document.querySelector("#seatList input[data-i='1']"); i.value = "1"; i.dispatchEvent(new Event("change", { bubbles: true })); });
      assert(await hall.evaluate(() => __LQ_EXAM_HALL.seats[1].id === "2"), "duplicate rename refused");

      await hall.evaluate(d => { window.__dets = d; }, FOUR);
      await hall.evaluate(() => document.querySelector("#runBtn").click());
      await hall.waitFor("__LQ_EXAM_HALL.monitoring && __LQ_EXAM_HALL.mon && Object.values(__LQ_EXAM_HALL.mon.state().seats).filter(s => s.occupied).length === 4", 5000);
      await db.waitFor("['1','2','3','4'].every(s => __LQ_EXAM_DB.board.seats().includes(s))", 8000);

      // an extra person at seat 3 for > 5 s -> Watch; a phone over seat 4 -> Check
      await hall.evaluate((d, x) => { window.__dets = d.concat([x]); }, FOUR, P(2, 0.05));
      await hall.waitFor("__LQ_EXAM_HALL.sent.some(m => m.sig === 'extra' && m.seat === '3' && m.lvl === 'watch')", 9000);
      await hall.evaluate(d => { window.__dets = d.concat([{ cls: "phone", x: 0.8, y: 0.6, w: 0.04, h: 0.06, score: 0.9 }]); }, FOUR);
      await hall.waitFor("__LQ_EXAM_HALL.sent.some(m => m.sig === 'phone' && m.seat === '4' && m.lvl === 'check')", 4000);
      await db.waitFor("(q => q[0] && q[0].sig === 'phone' && q.some(a => a.sig === 'extra'))(__LQ_EXAM_DB.board.queue(Date.now()))", 4000);

      // someone standing in the aisle: suppressed in walk mode, flagged after 8 s otherwise
      const AISLE = { x: 0.45, y: 0.02, w: 0.08, h: 0.25, score: 0.9 };
      await hall.evaluate(() => document.querySelector("#walkBtn").click());
      assert(await hall.evaluate(() => __LQ_EXAM_HALL.walk && document.querySelector("#walkBtn").getAttribute("aria-pressed") === "true"), "walk mode on");
      await hall.evaluate((d, a) => { window.__dets = d.concat([a]); }, FOUR, AISLE);
      await sleep(9500);
      assert(await hall.evaluate(() => !__LQ_EXAM_HALL.sent.some(m => m.sig === "aisle")), "no aisle flag in walk mode");
      await hall.evaluate(() => document.querySelector("#walkBtn").click());
      await hall.waitFor("__LQ_EXAM_HALL.sent.some(m => m.sig === 'aisle' && m.lvl === 'watch')", 12000);
      await hall.evaluate(d => { window.__dets = d; }, FOUR);

      // room-wide mute from the node reaches the dashboard
      await hall.evaluate(() => document.querySelector("#muteBtn").click());
      await db.waitFor("__LQ_EXAM_DB.board.mutedUntil() > Date.now() + 50000", 3000);
      await db.evaluate(() => __LQ_EXAM_DB.render());
      assert(await db.evaluate(() => document.querySelectorAll("#seatMap .seat").length >= 4), "seat map tiles");

      // experimental face pass: off by default; switched on, the boxes are counted on this device only and nothing about
      // faces goes to the dashboard; a pass that fails switches itself off and says so, seat monitoring goes on
      assert(await hall.evaluate(() => !__LQ_EXAM_HALL.faceOn && !document.querySelector("#faceOn").checked && __LQ_EXAM_HALL.faces.length === 0), "face pass off by default");
      const sentBefore = await hall.evaluate(() => __LQ_EXAM_HALL.sent.length);
      await hall.evaluate(() => {
        window.__faces = [{ x: 0.1, y: 0.1, w: 0.03, h: 0.05 }, { x: 0.5, y: 0.1, w: 0.03, h: 0.05 }];
        const c = document.querySelector("#faceOn"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await hall.waitFor("__LQ_EXAM_HALL.faceOn && __LQ_EXAM_HALL.faces.length === 2 && [...document.querySelectorAll('#kv span')].some(s => /ใบหน้า 2/.test(s.textContent))", 4000);
      assert(await hall.evaluate(() => JSON.parse(localStorage.getItem("lq-exam-hall")).faceOn === true), "face pass setting remembered on this device");
      await sleep(1200);
      const faceMsgs = await hall.evaluate(n => __LQ_EXAM_HALL.sent.slice(n).filter(m => /face/i.test(JSON.stringify(m))), sentBefore);
      assert(!faceMsgs.length, "nothing about faces is sent: " + JSON.stringify(faceMsgs.slice(0, 2)));
      await hall.evaluate(() => { window.__faces = "fail"; });
      await hall.waitFor("__LQ_EXAM_HALL.faceErr && __LQ_EXAM_HALL.faces.length === 0 && document.querySelector('#engine').classList.contains('warn')", 4000);
      assert(await hall.evaluate(() => __LQ_EXAM_HALL.monitoring && Object.values(__LQ_EXAM_HALL.mon.state().seats).filter(s => s.occupied).length === 4),
        "seat monitoring goes on without the face pass");

      await noThai(hall, "exam-hall running");
      await phoneAudit(hall, "exam-hall running", [360]);
      assertCleanMessages(await hall.evaluate(() => __LQ_EXAM_HALL.sent), "hall");
      await privacyScan(hall); await privacyScan(db);
      const stored = await hall.evaluate(() => localStorage.getItem("lq-exam-seats"));
      assert(stored && !/data:|blob:/.test(stored) && stored.length < 5000, "seat polygons stored as numbers only");
      for (const p of [hall, db]) assert(!exceptions(p).length, "exceptions: " + JSON.stringify(exceptions(p).slice(0, 2)));
      await hall.close(); await db.close();
    });
  } finally { await browser.close(); }
}
