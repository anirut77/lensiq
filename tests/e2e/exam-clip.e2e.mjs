// tests/e2e/exam-clip.e2e.mjs — LENSIQ Exam evidence clip (opt-in) with the fake camera + ?fakedet, dashboard in the same
// browser: default OFF records nothing (no MediaRecorder at all); ?clip=1 changes the notice + consent text before consent;
// a Check flag -> "pending" on the dashboard -> named "Keep clip" -> encrypted record in IndexedDB on the camera device
// (LQVault envelope, no video bytes in clear) -> play / delete on the device; hall node with institution auto-keep;
// messages stay JSON-only; 0% Thai in 中文/English; phone widths.
import { assert, privacyScan } from "./cdp.mjs";
import { assertCleanMessages, exceptions, noThai, phoneAudit, sleep } from "./exam-kit.mjs";

const FACE = { x: 0.32, y: 0.18, w: 0.34, h: 0.5, score: 0.95, yaw: 0, pitch: 0 };
// count MediaRecorder constructions (and any with an audio track): with clips off there must be none
const INIT = `window.__LQ_FAKE_CAMS = {n: 1, mode: "ok"}; window.__dets = []; try { localStorage.setItem("lq-lang", "th"); } catch (e) {}
  window.__LQ_FAKE_DET = key => (key === "exam-lab" || key === "exam-hall") ? window.__dets : null;
  window.__mr = 0; window.__mrAudio = 0;
  if (window.MediaRecorder) {
    const MR0 = window.MediaRecorder;
    window.MediaRecorder = class extends MR0 {
      constructor(s, o) { super(s, o); window.__mr++; if (s.getAudioTracks().length) window.__mrAudio++; }
    };
    window.MediaRecorder.isTypeSupported = t => MR0.isTypeSupported(t);
  }`;
/** runs in the page: the stored clip records, summarised (never the envelope itself) */
const idbClips = () => new Promise(res => {
  const r = indexedDB.open("lq-exam-clips", 1);
  r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains("clips")) r.result.createObjectStore("clips", { keyPath: "id" }); };
  r.onerror = () => res([]);
  r.onsuccess = () => {
    const q = r.result.transaction("clips").objectStore("clips").getAll();
    q.onsuccess = () => {
      r.result.close();
      const enc = x => { try { return JSON.parse(x.env).enc; } catch (e) { return null; } };
      res(q.result.map(x => ({
        id: x.id, keys: Object.keys(x).sort().join(","), enc: enc(x), envLen: (x.env || "").length,
        seat: x.seat, sig: x.sig, how: x.how, exp: x.exp, kept: x.kept
      })));
    };
  };
});
const days = r => Math.round((r.exp - r.kept) / 86400000);
const keepClick = () => {
  const c = [...document.querySelectorAll("#queue .alert")].find(x => x.querySelector("[data-act=keepclip]"));
  c.querySelector("[data-act=keepclip]").click();
};

const PIN = "482913";
/** invigilator: set the clip PIN on this device (first time) or unlock the kept-clip list with it */
async function pinIn(page, who) {
  await page.evaluate(p => {
    document.querySelector("#clipBox").open = true;
    const f = document.querySelector("#clipList form"); f.querySelector("[data-cpin]").value = p;
    const c = f.querySelector("[data-cpin2]"); if (c) c.value = p;
    f.requestSubmit();
  }, PIN);
  await page.waitFor(`window.${who}.clips.unlocked && window.${who}.clips.pin.has()`, 8000);
}

async function toExam(lab) {
  await lab.evaluate(() => {
    document.querySelector("#room").value = "CLIP1"; document.querySelector("#seat").value = "7";
    document.querySelector("#consent").checked = true; document.querySelector("#noticeForm").requestSubmit();
  });
  await lab.waitFor("__LQ_EXAM_LAB.phase === 'cam' && document.querySelector('#engine').classList.contains('ok')", 10000);
  await lab.evaluate(f => { window.__dets = [f]; }, FACE);
  await lab.waitFor("__LQ_EXAM_LAB.faces.length === 1", 5000);
  await lab.evaluate(() => document.querySelector("#toCal").click());
  await lab.waitFor("__LQ_EXAM_LAB.phase === 'calDone'", 8000);
  await lab.evaluate(() => document.querySelector("#toExam").click());
  await lab.waitFor("__LQ_EXAM_LAB.phase === 'exam'", 5000);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("exam-clip: default OFF — notice unchanged, no MediaRecorder, nothing stored", async () => {
      const lab = await browser.newPage(null, { initScripts: [fakeCams, INIT] });
      await lab.goto(`${base}/exam-lab.html?cpu&fakedet&calsec=1`);
      await lab.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
      await lab.evaluate(() => localStorage.clear());
      const n = await lab.evaluate(() => ({
        n2: !document.querySelector("#n2").hidden, n5: document.querySelector("#n5c").hidden,
        consent: !document.querySelector("#consentTxt").hidden && document.querySelector("#consentClip").hidden, cfg: __LQ_EXAM_LAB.clipCfg
      }));
      assert(n.n2 && n.n5 && n.consent && n.cfg.on === false, "default notice " + JSON.stringify(n));
      await toExam(lab);
      await lab.evaluate(f => { window.__dets = [f, { cls: "phone", score: 0.9 }]; }, FACE);
      await lab.waitFor("__LQ_EXAM_LAB.sent.some(m => m.sig === 'phone' && m.lvl === 'check')", 6000);
      await sleep(800);
      const st = await lab.evaluate(() => ({
        mr: window.__mr, armed: __LQ_EXAM_LAB.clips.armed, mon: document.querySelector("#monClip").hidden, own: document.querySelector("#ownLog").innerText
      }));
      assert(st.mr === 0 && !st.armed && st.mon, "clips off: no recorder " + JSON.stringify(st));
      assert(!/คลิป/.test(st.own), "no clip text in the own log");
      assert((await lab.evaluate(idbClips)).length === 0, "nothing stored");
      await lab.evaluate(() => document.querySelector("#endExam").click());
      assert(!exceptions(lab).length, "exceptions: " + JSON.stringify(exceptions(lab).slice(0, 2)));
      await lab.close();
    });

    await check("exam-clip: lab ?clip=1 — consent text, pending -> named keep on the dashboard -> encrypted on the device -> play / delete", async () => {
      const lab = await browser.newPage(null, { initScripts: [fakeCams, INIT] });
      await lab.goto(`${base}/exam-lab.html?cpu&fakedet&calsec=1&clip=1&clipdays=7`);
      await lab.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 8000);
      await lab.evaluate(() => { for (const k of Object.keys(localStorage)) if (k !== "lq-lang") localStorage.removeItem(k); });
      const n = await lab.evaluate(() => ({
        n2: document.querySelector("#n2").hidden, n2c: !document.querySelector("#n2c").hidden, n5: document.querySelector("#n5c").textContent,
        consent: !document.querySelector("#consentClip").hidden && document.querySelector("#consentTxt").hidden,
        on: document.querySelector("#clipOn").checked, days: document.querySelector("#clipDays").value
      }));
      assert(n.n2 && n.n2c && /10 วินาที/.test(n.n5) && /7 วัน/.test(n.n5) && /ไม่ถูกส่งออก/.test(n.n5) && n.consent && n.on && n.days === "7", "clip notice " + JSON.stringify(n));
      await phoneAudit(lab, "exam-clip notice");
      await noThai(lab, "exam-clip notice");
      const zhN5 = await lab.evaluate(async () => {
        LQI18N.setLang("zh"); await new Promise(r => setTimeout(r, 700));
        const t = document.querySelector("#n5c").textContent; LQI18N.setLang("th"); return t;
      });
      assert(/10 秒/.test(zhN5) && /7 天/.test(zhN5), "zh notice " + zhN5);
      await sleep(400);
      assert(await lab.evaluate(() => document.querySelector("#lead").hidden && !document.querySelector("#leadC").hidden), "clip-on lead text");

      // changing the clip setting after the consent box was ticked clears the tick (the candidate must re-read)
      const re = await lab.evaluate(() => {
        const c = document.querySelector("#consent"), d = document.querySelector("#clipDays");
        c.checked = true; d.value = "14"; d.dispatchEvent(new Event("change"));
        const out = { checked: c.checked, msg: document.querySelector("#noticeMsg").textContent };
        d.value = "7"; d.dispatchEvent(new Event("change")); return out;
      });
      assert(!re.checked && re.msg.length > 5, "consent cleared on change " + JSON.stringify(re));
      // clips on without an invigilator PIN: consent cannot go ahead (nothing would be recorded); candidate sees no list
      const noPin = await lab.evaluate(() => {
        document.querySelector("#room").value = "CLIP1"; document.querySelector("#seat").value = "7";
        document.querySelector("#consent").checked = true; document.querySelector("#noticeForm").requestSubmit();
        return { phase: __LQ_EXAM_LAB.phase, msg: document.querySelector("#noticeMsg").textContent, form: !!document.querySelector("#clipList form[data-cset]") };
      });
      assert(noPin.phase === "notice" && /PIN/.test(noPin.msg) && noPin.form, "PIN needed first " + JSON.stringify(noPin));
      await pinIn(lab, "__LQ_EXAM_LAB");

      const db = await browser.newPage(`${base}/exam-dashboard.html?room=CLIP1`);
      await db.waitFor("window.__LQ_EXAM_DB && __LQ_EXAM_DB.board", 8000);
      await db.evaluate(() => { document.querySelector("#who").value = "Invigilator B"; });

      await toExam(lab);
      assert(await lab.evaluate(() => ["#clipOn", "#clipAuto", "#clipDays"].every(s => document.querySelector(s).disabled)), "setting locked after consent");
      await lab.waitFor("__LQ_EXAM_LAB.clips.armed && !document.querySelector('#monClip').hidden", 5000);
      const mr = await lab.evaluate(() => ({ n: window.__mr, audio: window.__mrAudio }));
      assert(mr.n >= 1 && mr.audio === 0, "video-only recorder " + JSON.stringify(mr));
      await db.waitFor("Object.values(__LQ_EXAM_DB.board.nodes).some(n => n.clip === true)", 8000);
      await sleep(2500); // a couple of seconds in the ring

      // phone -> Check -> pending clip on the dashboard row; nothing written yet
      await lab.evaluate(f => { window.__dets = [f, { cls: "phone", score: 0.9 }]; }, FACE);
      await lab.waitFor("__LQ_EXAM_LAB.sent.some(m => m.sig === 'phone' && m.lvl === 'check')", 6000);
      await lab.evaluate(f => { window.__dets = [f]; }, FACE);
      await db.waitFor("__LQ_EXAM_DB.board.alerts.some(a => a.sig === 'phone' && (__LQ_EXAM_DB.board.clipState(a) || {}).st === 'pending')", 8000);
      await db.waitFor("[...document.querySelectorAll('#queue .alert')].some(c => c.querySelector('[data-act=keepclip]') && c.querySelector('.clip-tag'))", 4000);
      assert((await lab.evaluate(idbClips)).length === 0, "pending clip is NOT written before keep");
      await phoneAudit(db, "exam-clip dashboard", [360]);

      // keep needs a name
      await db.evaluate(() => { document.querySelector("#who").value = ""; });
      await db.evaluate(keepClick);
      await sleep(400);
      assert((await lab.evaluate(idbClips)).length === 0, "nameless keep does nothing");
      await db.evaluate(() => { document.querySelector("#who").value = "Invigilator B"; });
      await db.evaluate(keepClick);
      await db.waitFor("__LQ_EXAM_DB.board.alerts.some(a => a.sig === 'phone' && (__LQ_EXAM_DB.board.clipState(a) || {}).st === 'kept')", 8000);
      const recs = await lab.evaluate(idbClips);
      assert(recs.length === 1 && recs[0].enc === "lq1" && recs[0].envLen > 200 && !/segs|blob/.test(recs[0].keys), "encrypted record " + JSON.stringify(recs));
      assert(recs[0].seat === "7" && recs[0].sig === "phone" && recs[0].how === "kept" && days(recs[0]) === 7, "meta " + JSON.stringify(recs[0]));
      const alert = await db.evaluate(() => {
        const a = __LQ_EXAM_DB.board.alerts.find(x => x.sig === "phone");
        return { acts: a.acts.map(x => x.a + ":" + x.who), row: document.querySelector("#logBody").innerText };
      });
      assert(alert.acts.includes("keepclip:Invigilator B") && /คลิปอยู่ในเครื่องกล้อง/.test(alert.row), "named keep + flag row shows clip on device " + JSON.stringify(alert));
      await lab.waitFor("document.querySelector('#ownLog').innerText.includes('คลิปเก็บในเครื่องนี้')", 4000);

      // the candidate at the camera device sees only the count — no list, play, save or delete
      await lab.evaluate(() => { document.querySelector("#clipBox").open = true; });
      await lab.waitFor("/1/.test(document.querySelector('#clipList').innerText)", 4000);
      const cand = await lab.evaluate(() => ({
        rows: document.querySelectorAll("#clipList [data-cid]").length, btns: document.querySelectorAll("#clipList [data-cplay],#clipList [data-csave],#clipList [data-cdel],#clipList [data-cdelall]").length,
        unlocked: __LQ_EXAM_LAB.clips.unlocked, unlock: !!document.querySelector("#clipList form[data-cunlock]")
      }));
      assert(cand.rows === 0 && cand.btns === 0 && !cand.unlocked && cand.unlock, "candidate view " + JSON.stringify(cand));
      await lab.evaluate(() => { const f = document.querySelector("#clipList form"); f.querySelector("[data-cpin]").value = "000000"; f.requestSubmit(); });
      await lab.waitFor("/PIN/.test(document.querySelector('#clipList .form-msg') ? document.querySelector('#clipList .form-msg').textContent : '')", 4000);
      assert(await lab.evaluate(() => !__LQ_EXAM_LAB.clips.unlocked), "wrong PIN stays locked");

      // invigilator unlocks: play (decrypts locally into a blob: URL), then delete (+ dashboard told)
      await pinIn(lab, "__LQ_EXAM_LAB");
      assert(await lab.evaluate(() => [...document.querySelectorAll("#clipList [data-cplay]")].every(b => /\d/.test(b.getAttribute("aria-label") || ""))), "named buttons");
      await lab.waitFor("document.querySelectorAll('#clipList [data-cid]').length === 1", 4000);
      await lab.evaluate(() => document.querySelector("#clipList [data-cplay]").click());
      await lab.waitFor("(document.querySelector('#clipList video').src || '').startsWith('blob:') && !document.querySelector('.clip-player').hidden", 5000);
      await lab.waitFor("document.querySelector('#clipList video').readyState >= 1 || document.querySelector('#clipList video').error", 6000);
      assert(await lab.evaluate(() => !document.querySelector("#clipList video").error), "clip plays");
      await phoneAudit(lab, "exam-clip device list", [320, 390]);
      await noThai(lab, "exam-clip exam phase");
      await lab.evaluate(() => { window.confirm = () => true; document.querySelector("#clipList [data-cdel]").click(); });
      await lab.waitFor("document.querySelectorAll('#clipList [data-cid]').length === 0", 5000);
      assert((await lab.evaluate(idbClips)).length === 0, "deleted from IndexedDB");
      await db.waitFor("__LQ_EXAM_DB.board.alerts.some(a => a.sig === 'phone' && (__LQ_EXAM_DB.board.clipState(a) || {}).st === 'del')", 5000);

      assertCleanMessages(await lab.evaluate(() => __LQ_EXAM_LAB.sent), "lab");
      await privacyScan(lab); await privacyScan(db);
      await lab.evaluate(() => document.querySelector("#endExam").click());
      assert(await lab.evaluate(() => !__LQ_EXAM_LAB.clips.armed), "ring dropped at the end");
      for (const p of [lab, db]) assert(!exceptions(p).length, "exceptions: " + JSON.stringify(exceptions(p).slice(0, 2)));
      await lab.close(); await db.close();
    });

    await check("exam-clip: hall node with institution auto-keep — phone over a seat stored at once, tag on the event", async () => {
      const hall = await browser.newPage(null, { initScripts: [fakeCams, INIT] });
      await hall.goto(`${base}/exam-hall.html?cpu&fakedet&clip=1&clipauto=1&clipdays=1`);
      await hall.waitFor("window.__LQ_EXAM_HALL && window.LQI18N", 8000);
      await hall.evaluate(() => { localStorage.removeItem("lq-exam-seats"); localStorage.removeItem("lq-exam-hall"); });
      assert(await hall.evaluate(() => !document.querySelector("#clipWarn").hidden && document.querySelector("#clipAuto").checked), "room warning shown");
      await noThai(hall, "exam-clip hall");
      await phoneAudit(hall, "exam-clip hall", [360]);
      const four = [0, 1, 2, 3].map(i => ({ x: 0.04 + 0.23 * i + 0.06, y: 0.42, w: 0.1, h: 0.4, score: 0.9 }));
      await hall.evaluate(() => { document.querySelector("#room").value = "CLIP2"; document.querySelector("#setupForm").requestSubmit(); });
      await hall.waitFor("document.querySelector('#engine').classList.contains('ok')", 10000);
      await hall.evaluate(() => { document.querySelector("#gRows").value = "1"; document.querySelector("#gCols").value = "4"; document.querySelector("#makeGrid").click(); });
      await hall.evaluate(d => { window.__dets = d; }, four);
      assert(await hall.evaluate(() => document.querySelector("#lead").hidden && !document.querySelector("#leadC").hidden), "clip-on hall lead");
      await pinIn(hall, "__LQ_EXAM_HALL");
      await hall.evaluate(() => document.querySelector("#runBtn").click());
      await hall.waitFor("__LQ_EXAM_HALL.monitoring && __LQ_EXAM_HALL.clips.armed", 5000);
      assert(await hall.evaluate(() => document.querySelector("#clipOn").disabled), "setting locked while monitoring");
      await sleep(2000);
      await hall.evaluate(d => { window.__dets = d.concat([{ cls: "phone", x: 0.8, y: 0.6, w: 0.04, h: 0.06, score: 0.9 }]); }, four);
      await hall.waitFor("__LQ_EXAM_HALL.sent.some(m => m.sig === 'phone' && m.lvl === 'check')", 5000);
      await hall.waitFor("Object.values(__LQ_EXAM_HALL.clipSt).includes('auto')", 8000);
      const recs = await hall.evaluate(idbClips);
      assert(recs.some(r => r.how === "auto" && r.enc === "lq1" && r.seat === "4" && days(r) === 1), "auto-kept " + JSON.stringify(recs));
      assert(await hall.evaluate(() => document.querySelector("#recent").innerText.includes("คลิปเก็บในเครื่องนี้")), "event tag");
      assertCleanMessages(await hall.evaluate(() => __LQ_EXAM_HALL.sent), "hall");
      assert(await hall.evaluate(() => !__LQ_EXAM_HALL.clips.unlocked && !document.querySelector("#clipList [data-cdelall]")), "list re-locked while monitoring");
      await pinIn(hall, "__LQ_EXAM_HALL");
      await hall.evaluate(() => { window.confirm = () => true; document.querySelector("#clipList [data-cdelall]").click(); });
      await hall.waitFor("document.querySelectorAll('#clipList [data-cid]').length === 0", 5000);
      await privacyScan(hall);
      assert(!exceptions(hall).length, "exceptions: " + JSON.stringify(exceptions(hall).slice(0, 2)));
      await hall.close();
    });
  } finally { await browser.close(); }
}
