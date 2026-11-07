// tests/e2e/interview.e2e.mjs — Structured Interview Kit (interview.html). Chrome's own fake camera + fake microphone
// (--use-fake-device-for-media-stream: test pattern video, periodic beep audio) and ?fakedet scripted faces.
// Checks: role template -> questions with BARS, three interviewers scoring independently (hidden until all submit),
// agreement/strengths/discussion summary with evidence notes, sheet export/import, print area without images,
// candidate-first delivery notes (opt-in, hidden from interviewers, candidate keeps/discards; org setting with 3 acknowledgements, shown only after all scores are in), practice mode with timer
// and self-coaching tips, 中文, 390 px layout / 44 px targets, privacy (no storage, no /api, no third-party requests).
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hardErrors = (page, base) => page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && e.url && !e.url.startsWith(base)));
const INIT = "window.confirm=()=>true;window.print=()=>{window.__printed=(window.__printed||0)+1};";
/* scripted face: frontal, but turned away (yaw 0.7) during the 2nd second of every 4 s; no face during the 4th second */
const FAKE_MIC = `(() => {
  const md = navigator.mediaDevices; if (!md) return; const orig = md.getUserMedia.bind(md);
  md.getUserMedia = async c => {
    if (!(c && c.audio && !c.video)) return orig(c);
    const ac = new AudioContext(); await ac.resume();
    const osc = ac.createOscillator(), g = ac.createGain(), dst = ac.createMediaStreamDestination();
    osc.frequency.value = 220; g.gain.value = 0; osc.connect(g).connect(dst); osc.start();
    let t = ac.currentTime + 0.1;
    const plan = () => { while (t < ac.currentTime + 6) { for (let i = 0; i < 6; i++) { const s = t + i * 0.25; g.gain.setValueAtTime(0.002, s); g.gain.linearRampToValueAtTime(0.4, s + 0.1); g.gain.linearRampToValueAtTime(0.03, s + 0.24); } g.gain.setValueAtTime(0, t + 1.5); t += 2.3; } };
    plan(); setInterval(plan, 2000);
    window.__fakeMic = dst.stream; return dst.stream;
  };
})();`;
const FAKE_FACE = `window.__LQ_FAKE_DET = (key, now) => { const ph = Math.floor(now / 1000) % 4; return ph === 3 ? [] : [{ x: 0.3, y: 0.2, w: 0.35, h: 0.5, score: 0.95, yaw: ph === 1 ? 0.7 : 0 }]; };`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("interview: template, independent scoring, agreement summary, evidence, export/import, print", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT] });
      await page.goto(`${base}/interview.html?cpu`);
      await assertNoWebGL(page);
      const q0 = await page.evaluate(() => ({ comps: [...document.querySelectorAll("#ivComps input:checked")].map(i => i.value), cards: document.querySelectorAll("#ivQList .qcard").length,
        law: document.querySelectorAll("#ivLaw li").length, bias: document.querySelectorAll("#ivBias li").length }));
      assert(q0.comps.slice().sort().join() === "adapt,comm,customer,drive,persuade" && q0.cards === 5, "sales template: " + JSON.stringify(q0));
      assert(q0.law >= 10 && q0.bias >= 5, "legal checklist + bias reminders");
      await page.evaluate(() => { const s = document.querySelector("#ivRole"); s.value = "service"; s.dispatchEvent(new Event("change")); });
      const q1 = await page.evaluate(() => ({ cards: [...document.querySelectorAll("#ivQList .qcard")].map(c => c.dataset.comp), bars: document.querySelectorAll("#ivQList .qcard:first-child .bars li").length,
        text: document.querySelector("#ivQList .qcard").textContent }));
      assert(q1.cards.join() === "customer,comm,problem,team,adapt" && q1.bars === 5 && /เชิงพฤติกรรม/.test(q1.text) && /เชิงสถานการณ์/.test(q1.text), "service questions: " + JSON.stringify(q1));
      // custom: untick adapt -> role switches to custom
      await page.evaluate(() => { const i = document.querySelector('#ivComps input[value="adapt"]'); i.checked = false; i.dispatchEvent(new Event("change", { bubbles: true })); });
      assert(await page.evaluate(() => document.querySelector("#ivRole").value === "custom" && document.querySelectorAll("#ivQList .qcard").length === 4), "custom competency set");
      await page.evaluate(() => {
        document.querySelector("#ivCand").value = "C-014"; document.querySelector("#ivCand").dispatchEvent(new Event("input"));
        for (const n of ["A", "B"]) { document.querySelector("#ivWho").value = n; document.querySelector("#ivWhoForm").requestSubmit(); }
        document.querySelector('#ivLaw input[data-law="pregnancy"]').click();
      });
      assert(/1\/11/.test(await page.evaluate(() => document.querySelector("#ivLawCount").textContent)), "law counter");

      // interviewer A scores + evidence
      const rate = (vals, notes) => page.evaluate((vals, notes) => {
        document.querySelector("#tab-score").click();
        for (const [c, v] of Object.entries(vals)) document.querySelector(`#ivSheet [data-comp="${c}"] .nums button[data-v="${v}"]`).click();
        for (const [c, t] of Object.entries(notes)) { const ta = document.querySelector(`#ivSheet textarea[data-note="${c}"]`); ta.value = t; ta.dispatchEvent(new Event("input", { bubbles: true })); }
        document.querySelector("#ivSubmit").click();
      }, vals, notes);
      await rate({ customer: 5, comm: 4, problem: 1, team: 3 }, { customer: "คืนเงินลูกค้าภายในวันเดียวและแก้ขั้นตอน", problem: "ไม่ได้ยกตัวอย่าง" });
      // summary is withheld while B has not submitted
      await page.evaluate(() => document.querySelector("#tab-summary").click());
      const w = await page.evaluate(() => ({ wait: !document.querySelector("#ivSumWait").hidden, body: document.querySelector("#ivSumBody").hidden, t: document.querySelector("#ivSumWaitT").textContent }));
      assert(w.wait && w.body && /B/.test(w.t), "summary withheld: " + JSON.stringify(w));
      // B cannot see A's scores on B's sheet
      await page.evaluate(() => { document.querySelector("#tab-score").click(); document.querySelector('#ivWhoSeg button[data-i="1"]').click(); });
      const leak = await page.evaluate(() => document.querySelectorAll('#ivSheet .nums button[aria-checked="true"]').length);
      assert(leak === 0, "B's sheet shows another interviewer's scores");
      await rate({ customer: 4, comm: 4, problem: 5, team: 3 }, { problem: "วิเคราะห์ยอดขายลดลงด้วยข้อมูลรายสาขา" });

      // a third interviewer on another device: export from a scratch sheet and import here
      const txt = await page.evaluate(() => {
        const IV = window.IVCore; return IV.exportSheet({ who: "C", scores: { customer: 5, comm: 3, problem: 2, team: 4 }, notes: { team: "ช่วยเพื่อนรับสายช่วงพีค" } }, { role: "service" });
      });
      await page.evaluate(t => { document.querySelector("#ivImportIn").value = t; document.querySelector("#ivImport").click(); }, txt);
      assert(/C/.test(await page.evaluate(() => document.querySelector("#ivExMsg").textContent)), "import message");
      await page.evaluate(() => document.querySelector("#tab-summary").click());
      const s = await page.evaluate(() => ({
        shown: !document.querySelector("#ivSumBody").hidden,
        rows: [...document.querySelectorAll("#ivSumTable tbody tr")].map(r => ({ c: r.dataset.comp, cells: [...r.querySelectorAll("td")].map(td => td.textContent), ag: r.querySelector(".ag").className })),
        str: document.querySelector("#ivStr").textContent, dis: document.querySelector("#ivDis").textContent, dev: document.querySelector("#ivDev").textContent,
        meta: document.querySelector("#ivSumMeta").textContent, imgs: document.querySelectorAll("#ivSummary img, #ivSummary canvas, #ivSummary video").length,
        tiles: [...document.querySelectorAll("#ivSumTiles .tile b")].map(b => b.textContent), prin: document.querySelector("#pane-summary .iv-principle").textContent
      }));
      assert(s.shown, "summary shown after all submitted");
      const row = c => s.rows.find(r => r.c === c);
      assert(row("customer").cells.join("|") === "5|4|5|4.7|1|สอดคล้อง" && /high/.test(row("customer").ag), "customer row " + JSON.stringify(row("customer")));
      assert(/low/.test(row("problem").ag) && row("problem").cells[4] === "4", "problem row needs discussion " + JSON.stringify(row("problem")));
      assert(/some/.test(row("comm").ag) === false && /high/.test(row("comm").ag), "comm 4/4/3 high");
      assert(/การมุ่งเน้นลูกค้า/.test(s.str) && /คืนเงินลูกค้าภายในวันเดียว/.test(s.str), "strength with evidence note: " + s.str);
      assert(/การแก้ปัญหา/.test(s.dis) && /วิเคราะห์ยอดขาย/.test(s.dis) && /ไม่ได้ยกตัวอย่าง/.test(s.dis), "discussion item lists both interviewers' evidence: " + s.dis);
      assert(/C-014/.test(s.meta) && /3/.test(s.meta), "meta " + s.meta);
      assert(s.tiles[0] === "4/4" && s.tiles[1] === "75%", "tiles " + s.tiles);
      assert(/ไม่ใช่ผลการตัดสิน/.test(s.prin) && !/ผ่าน\/ไม่ผ่าน:/.test(s.prin), "no pass/fail");
      assert(s.imgs === 0, "summary/print area contains images");
      await page.evaluate(() => document.querySelector("#ivPrint").click());
      assert(await page.evaluate(() => window.__printed === 1), "print called");
      const printCss = await page.evaluate(() => [...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(r => r.media && /print/.test(r.media.mediaText) && /video/.test(r.cssText)); } catch { return false; } }));
      assert(printCss, "print stylesheet hides video/canvas/img");
      // clear
      await page.evaluate(() => document.querySelector("#ivClear").click());
      assert(await page.evaluate(() => window.__LQ_IV.S.sheets.length === 0 && document.querySelectorAll("#ivWhoList li").length === 0), "cleared");
      const ai = await page.evaluate(() => /\bAI\b/.test(document.querySelector("main").innerText.replace(/AI Act/g, "")));
      assert(!ai, "the word AI appears in a label");
      await privacyScan(page);
      const st = await page.evaluate(() => Object.keys(localStorage).filter(k => k !== "lq-lang" && k !== "lq-i18n-debug").concat(Object.keys(sessionStorage)));
      assert(!st.length, "page wrote storage: " + st);
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !/^(data|blob):/.test(q.url));
      assert(!ext.length, "third-party requests: " + ext.map(q => q.url));
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("interview: delivery numbers are candidate-first — opt-in, hidden from interviewers, candidate keeps or discards", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, FAKE_MIC, FAKE_FACE] });
      await page.goto(`${base}/interview.html?cpu&fakedet&lang=th`);
      await page.evaluate(() => document.querySelector("#tab-delivery").click());
      const g0 = await page.evaluate(() => ({ dis: document.querySelector("#ivDStart").disabled, why: document.querySelectorAll("#pane-delivery .why li").length,
        allow: document.querySelector("#ivOrgAllow").disabled, orgNote: document.querySelector("#ivDOrgNote").hidden, meter: window.__LQ_IV.dMeter }));
      assert(g0.dis && g0.why >= 6 && g0.allow && g0.orgNote && !g0.meter, "meter off by default, org setting locked: " + JSON.stringify(g0));
      await page.evaluate(() => document.querySelector("#ivCOk1").click());
      assert(await page.evaluate(() => document.querySelector("#ivDStart").disabled), "one tick is not enough");
      await page.evaluate(() => document.querySelector("#ivDDecline").click());
      const dec = await page.evaluate(() => ({ c1: document.querySelector("#ivCOk1").checked, msg: document.querySelector("#ivDMsg").textContent }));
      assert(!dec.c1 && /ไม่มีผลต่อการพิจารณา/.test(dec.msg), "decline path " + JSON.stringify(dec));
      await page.evaluate(() => { document.querySelector("#ivCOk1").click(); document.querySelector("#ivCOk2").click(); document.querySelector("#ivDStart").click(); });
      await page.waitFor(`!document.querySelector("#ivDLive").hidden`, 15000);
      await sleep(8500);
      // interviewer side: no numbers anywhere in the DOM while the candidate view is closed
      const hid = await page.evaluate(() => ({ tiles: document.querySelectorAll("#pane-delivery .tile").length, view: document.querySelector("#ivDCandView").hidden, h: document.querySelector("#ivDLive h2").textContent }));
      assert(hid.tiles === 0 && hid.view && /ซ่อนจากผู้สัมภาษณ์/.test(hid.h), "numbers hidden from interviewer: " + JSON.stringify(hid));
      await page.evaluate(() => document.querySelector("#ivDCandBtn").click());
      await sleep(1200);
      const live = await page.evaluate(() => { const s = window.__LQ_IV.dMeter.snapshot(); return { s, mic: window.__LQ_IV.dMeter.hasMic, cam: window.__LQ_IV.dMeter.hasCam, tiles: document.querySelectorAll("#ivDCandView .tile").length,
        text: document.querySelector("#ivDLive").innerText, h: document.querySelector("#ivDCandView h3").textContent, pressed: document.querySelector("#ivDCandBtn").getAttribute("aria-pressed") }; });
      assert(live.cam && live.mic && live.pressed === "true", "camera + mic open, candidate view on " + JSON.stringify([live.cam, live.mic, live.pressed]));
      const g = live.s.g, d = live.s.d;
      assert(g.n >= 20 && g.facePct >= 60 && g.facePct <= 85, "face visible ≈ 75%: " + JSON.stringify(g));
      assert(g.towardPct >= 50 && g.towardPct <= 80, "toward camera ≈ 67% of face frames: " + JSON.stringify(g));
      assert(d && d.ms > 6000 && d.share > 0.35 && d.share < 0.8, "speaking share ≈ 1.5/2.3 (minus the lead-in) on the scripted mic: " + JSON.stringify(d));
      assert(d.pauses >= 2 && d.longPauses === 0 && d.peakRate > 3 && d.peakRate < 5, "pauses + ≈4 bursts/s: " + JSON.stringify(d));
      assert(live.tiles === 7 && /สำหรับผู้สมัคร/.test(live.h) && /ไม่ใช่การประเมินตัวบุคคล/.test(live.h), "candidate view: 7 tiles " + live.tiles);
      for (const wd of ["ประหม่า", "โกรธ", "โกหก", "ความซื่อสัตย์:", "บุคลิกภาพ:", "อารมณ์:"]) assert(!live.text.includes(wd), "label " + wd);
      await page.evaluate(() => document.querySelector("#ivDCandBtn").click());
      assert(await page.evaluate(() => document.querySelectorAll("#ivDTiles .tile").length === 0), "hiding the candidate view removes the numbers");
      await page.evaluate(() => document.querySelector("#ivDStop").click());
      await sleep(300);
      const after = await page.evaluate(() => ({ card: !document.querySelector("#ivDResult").hidden, body: document.querySelector("#ivDResBody").hidden, tiles: document.querySelectorAll("#pane-delivery .tile").length,
        vs: document.querySelector("#ivDVideo").srcObject, c1: document.querySelector("#ivCOk1").checked, running: window.__LQ_IV.dMeter.running, mic: window.__LQ_IV.dMeter.mic }));
      assert(after.card && after.body && after.tiles === 0 && !after.vs && !after.running && !after.mic && !after.c1, "stopped, released, feedback card closed until the candidate opens it: " + JSON.stringify(after));
      // interviewers: nothing in the summary (org setting off), even after everyone submitted
      await page.evaluate(() => { document.querySelector("#ivWho").value = "A"; document.querySelector("#ivWhoForm").requestSubmit(); document.querySelector("#tab-score").click(); document.querySelector("#ivSubmit").click(); document.querySelector("#tab-summary").click(); });
      const s0 = await page.evaluate(() => ({ inc: document.querySelector("#ivIncWrap").hidden, box: document.querySelector("#ivSumDelivery").hidden, pend: document.querySelector("#ivSumDNote").hidden, tiles: document.querySelectorAll("#ivSumDelivery .tile").length }));
      assert(s0.inc && s0.box && s0.pend && !s0.tiles, "no interviewer view by default: " + JSON.stringify(s0));
      // the candidate opens "my feedback" and keeps it -> printed, then removed from the page
      await page.evaluate(() => { document.querySelector("#tab-delivery").click(); document.querySelector("#ivDOpen").click(); });
      const fb = await page.evaluate(() => ({ tiles: document.querySelectorAll("#ivDResTiles .tile").length, tips: document.querySelectorAll("#ivDResTips li[data-tip]").length, acc: document.querySelector("#ivDResBody .acc").textContent }));
      assert(fb.tiles === 7 && fb.tips >= 1 && /ความหลากหลายทางระบบประสาท/.test(fb.acc), "feedback card: " + JSON.stringify(fb));
      await page.evaluate(() => document.querySelector("#ivDKeep").click());
      const kept = await page.evaluate(() => ({ printed: window.__printed, del: window.__LQ_IV.S.delivery, st: document.querySelector("#ivDResState").textContent, cls: document.documentElement.className }));
      assert(kept.printed === 1 && kept.del === null && /ผู้สัมภาษณ์ไม่เห็น/.test(kept.st) && !/iv-print-fb/.test(kept.cls), "kept -> printed, cleared: " + JSON.stringify(kept));
      const printFb = await page.evaluate(() => [...document.styleSheets].some(ss => { try { return [...ss.cssRules].some(r => r.media && /print/.test(r.media.mediaText) && /iv-print-fb/.test(r.cssText)); } catch { return false; } }));
      assert(printFb, "print stylesheet for the candidate's card");
      await privacyScan(page);
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("interview: organisation setting — three acknowledgements, notes only after all scores are submitted, discard wins", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, FAKE_MIC, FAKE_FACE] });
      await page.goto(`${base}/interview.html?cpu&fakedet&lang=th`);
      await page.evaluate(() => { document.querySelector("#tab-delivery").click(); document.querySelector("#ivOrgBox").open = true; document.querySelector("#ivAck1").click(); document.querySelector("#ivAck2").click(); });
      assert(await page.evaluate(() => document.querySelector("#ivOrgAllow").disabled), "two acknowledgements are not enough");
      await page.evaluate(() => { document.querySelector("#ivAck3").click(); document.querySelector("#ivOrgAllow").click(); });
      const o = await page.evaluate(() => ({ org: window.__LQ_IV.S.org, note: document.querySelector("#ivDOrgNote").hidden, st: document.querySelector("#ivOrgState").textContent }));
      assert(o.org.allow && !o.note && /หลังทุกคนส่งคะแนน/.test(o.st), "allowed + candidate informed on the consent screen: " + JSON.stringify(o));
      // un-ticking an acknowledgement switches it off again
      await page.evaluate(() => document.querySelector("#ivAck2").click());
      assert(await page.evaluate(() => !window.__LQ_IV.S.org.allow && document.querySelector("#ivOrgAllow").disabled && !document.querySelector("#ivOrgAllow").checked), "ack removed -> off");
      await page.evaluate(() => { document.querySelector("#ivAck2").click(); document.querySelector("#ivOrgAllow").click(); });
      await page.evaluate(() => { document.querySelector("#ivCOk1").click(); document.querySelector("#ivCOk2").click(); document.querySelector("#ivDStart").click(); });
      await page.waitFor(`!document.querySelector("#ivDLive").hidden`, 15000);
      await sleep(3000);
      await page.evaluate(() => document.querySelector("#ivDStop").click());
      await page.evaluate(() => { document.querySelector("#ivDOpen").click(); document.querySelector("#ivDKeep").click(); });
      assert(await page.evaluate(() => !!window.__LQ_IV.S.delivery && /ผู้สัมภาษณ์จะดูได้หลังส่งคะแนนครบ/.test(document.querySelector("#ivDResState").textContent)), "kept for the team per org setting");
      // two interviewers; only A submitted -> pending, and the reveal override does not unlock the notes
      await page.evaluate(() => { for (const n of ["A", "B"]) { document.querySelector("#ivWho").value = n; document.querySelector("#ivWhoForm").requestSubmit(); }
        document.querySelector("#tab-score").click(); document.querySelector("#ivSubmit").click(); document.querySelector("#tab-summary").click(); document.querySelector("#ivReveal").click(); });
      const p1 = await page.evaluate(() => ({ pend: !document.querySelector("#ivSumDNote").hidden, inc: document.querySelector("#ivIncWrap").hidden, tiles: document.querySelectorAll("#ivSumDelivery .tile").length }));
      assert(p1.pend && p1.inc && !p1.tiles, "pending until every sheet is submitted: " + JSON.stringify(p1));
      await page.evaluate(() => { document.querySelector("#tab-score").click(); document.querySelector('#ivWhoSeg button[data-i="1"]').click(); document.querySelector("#ivSubmit").click(); document.querySelector("#tab-summary").click(); });
      const p2 = await page.evaluate(() => ({ inc: !document.querySelector("#ivIncWrap").hidden, box: document.querySelector("#ivSumDelivery").hidden }));
      assert(p2.inc && p2.box, "after all submitted: opt-in checkbox shown, notes still collapsed " + JSON.stringify(p2));
      await page.evaluate(() => document.querySelector("#ivIncDelivery").click());
      const p3 = await page.evaluate(() => ({ tiles: document.querySelectorAll("#ivSumDelivery .tile").length, acc: document.querySelector("#ivSumDelivery .acc")?.textContent || "" }));
      assert(p3.tiles === 7 && /การปรับให้เหมาะสม/.test(p3.acc), "notes + accommodation reminder: " + JSON.stringify(p3));
      // editing a score again hides the notes (they never sit next to an open score sheet)
      await page.evaluate(() => { document.querySelector("#tab-score").click(); document.querySelector("#ivUnlock").click(); document.querySelector("#tab-summary").click(); });
      assert(await page.evaluate(() => document.querySelector("#ivSumDelivery").hidden && document.querySelector("#ivIncWrap").hidden), "unlocked sheet -> notes hidden");
      // a second session where the candidate discards: interviewers never see it
      await page.evaluate(() => { document.querySelector("#tab-delivery").click(); document.querySelector("#ivCOk1").click(); document.querySelector("#ivCOk2").click(); document.querySelector("#ivDStart").click(); });
      await page.waitFor(`!document.querySelector("#ivDLive").hidden`, 15000);
      await sleep(1500);
      await page.evaluate(() => { document.querySelector("#ivDStop").click(); document.querySelector("#ivDOpen").click(); document.querySelector("#ivDDiscard").click(); });
      const disc = await page.evaluate(() => ({ del: window.__LQ_IV.S.delivery, st: document.querySelector("#ivDResState").textContent }));
      assert(disc.del === null && /ไม่มีใครเห็น/.test(disc.st), "discarded " + JSON.stringify(disc));
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("interview: practice mode — question flow with prep/answer timer and self-coaching tips", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, FAKE_MIC, FAKE_FACE] });
      await page.goto(`${base}/interview.html?cpu&fakedet`);
      await page.evaluate(() => { document.querySelector("#tab-practice").click(); const s = document.querySelector("#ivPRole"); s.value = "tech"; document.querySelector("#ivPTime").value = "60"; document.querySelector("#ivPCam").click(); document.querySelector("#ivPStart").click(); });
      await page.waitFor(`!document.querySelector("#ivPRun").hidden`, 15000);
      const p0 = await page.evaluate(() => ({ q: document.querySelector("#ivPQ").textContent, phase: window.__LQ_IV.P.phase, count: document.querySelector("#ivPCount").textContent, n: window.__LQ_IV.P.qs.length, t: document.querySelector("#ivPTimer").textContent }));
      assert(p0.q.length > 20 && p0.phase === "prep" && p0.n === 5 && /1\/5/.test(p0.count), "first question in prep: " + JSON.stringify(p0));
      assert(/^0:(19|20|18)$/.test(p0.t), "20 s prep timer " + p0.t);
      await page.evaluate(() => document.querySelector("#ivPNext").click());
      assert(await page.evaluate(() => window.__LQ_IV.P.phase === "answer"), "answering");
      await sleep(3200);
      assert(/^0:5[5-7]$/.test(await page.evaluate(() => document.querySelector("#ivPTimer").textContent)), "answer countdown from 1:00");
      await page.evaluate(() => document.querySelector("#ivPNext").click());
      const fb = await page.evaluate(() => ({ phase: window.__LQ_IV.P.phase, star: document.querySelectorAll("#ivPSelf input").length, tips: [...document.querySelectorAll("#ivPTips li[data-tip]")].map(l => l.dataset.tip), shown: !document.querySelector("#ivPFeedback").hidden }));
      assert(fb.phase === "review" && fb.shown && fb.star === 4, "review with STAR self-check " + JSON.stringify(fb));
      assert(fb.tips.some(t => t === "lookCam" || t === "lookOk" || t === "frame"), "camera-based tip " + JSON.stringify(fb.tips));
      await page.evaluate(() => document.querySelector("#ivPGo").click());
      assert(await page.evaluate(() => window.__LQ_IV.P.i === 1 && window.__LQ_IV.P.phase === "prep"), "next question");
      await page.evaluate(() => document.querySelector("#ivPEnd").click());
      const end = await page.evaluate(() => ({ setup: !document.querySelector("#ivPSetup").hidden, vs: document.querySelector("#ivPVideo").srcObject, msg: document.querySelector("#ivPMsg").textContent }));
      assert(end.setup && !end.vs && /ไม่มีข้อมูลถูกบันทึก/.test(end.msg), "practice ended and camera released " + JSON.stringify(end));
      // without camera: STAR-only guidance
      await page.evaluate(() => { document.querySelector("#ivPCam").click(); document.querySelector("#ivPStart").click(); });
      await page.evaluate(() => { document.querySelector("#ivPNext").click(); document.querySelector("#ivPNext").click(); });
      assert(await page.evaluate(() => document.querySelectorAll("#ivPTips li[data-tip]").length === 0 && document.querySelectorAll("#ivPTips li").length === 1), "no-camera hint");
      await page.evaluate(() => document.querySelector("#ivPEnd").click());
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("interview: 中文 static + dynamic text; 390 px no overflow and 44 px targets on every tab", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT] });
      await page.goto(`${base}/interview.html?cpu&lang=zh`);
      await page.waitFor(`window.LQI18N && LQI18N.lang === "zh"`, 8000);
      await page.evaluate(() => { for (const n of ["A", "B"]) { document.querySelector("#ivWho").value = n; document.querySelector("#ivWhoForm").requestSubmit(); } });
      await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await sleep(400);
      const cjk = s => /[一-鿿]/.test(s);
      for (const t of ["setup", "questions", "score", "summary", "delivery", "practice", "about"]) {
        await page.evaluate(t => { document.querySelector("#tab-" + t).click(); if (t === "summary") document.querySelector("#ivReveal").click(); if (t === "delivery") document.querySelector("#ivOrgBox").open = true; }, t);
        await sleep(250);
        const m = await page.evaluate(() => {
          const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
          const main = document.querySelector("main");
          const thai = (main.innerText.match(/[฀-๿]+/g) || []).slice(0, 8);
          const small = [...main.querySelectorAll("button, summary, select, input:not([type=checkbox]):not([type=file]), input[type=checkbox]")].filter(el => {
            const b = el.getBoundingClientRect(); if (!b.width || el.closest("[hidden]")) return false;
            const r = el.type === "checkbox" ? el.closest("label").getBoundingClientRect() : b; return r.height < 44 || (el.type !== "checkbox" && r.width < 44);
          }).map(el => el.id || el.className || el.textContent.slice(0, 20));
          return { sw, cw, thai, small, h: main.querySelector(".pane:not([hidden]) h2")?.textContent || "" };
        });
        assert(m.sw <= m.cw, `${t}: overflow at 390: ${m.sw} > ${m.cw}`);
        assert(!m.small.length, `${t}: targets < 44 px: ` + JSON.stringify(m.small));
        assert(!m.thai.length, `${t}: Thai left in 中文: ` + m.thai.join(" | "));
        assert(cjk(m.h), `${t}: heading in Chinese: ` + m.h);
      }
      await page.send("Emulation.clearDeviceMetricsOverride");
      await page.evaluate(() => LQI18N.setLang("th"));
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("interview R10: question guard, answer-consistency observations, rater spread, early-reveal flag", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT] });
      await page.goto(`${base}/interview.html?cpu&lang=th`);
      await page.evaluate(() => { const q = document.querySelector("#ivQCheck"); q.value = "คุณแต่งงานหรือยัง มีแผนมีบุตรไหม"; q.dispatchEvent(new Event("input")); });
      const qc = await page.evaluate(() => document.querySelector("#ivQCheckOut").textContent);
      assert(/สถานภาพสมรส/.test(qc), "question guard warns: " + qc);
      await page.evaluate(() => { for (const n of ["A", "B", "C"]) { document.querySelector("#ivWho").value = n; document.querySelector("#ivWhoForm").requestSubmit(); } });
      const rate = (i, vals, cs, note) => page.evaluate((i, vals, cs, note) => {
        document.querySelector("#tab-score").click(); document.querySelector(`#ivWhoSeg button[data-i="${i}"]`).click();
        for (const [c, v] of Object.entries(vals)) document.querySelector(`#ivSheet [data-comp="${c}"] .nums button[data-v="${v}"]`).click();
        for (const [k, v] of Object.entries(cs)) { const s = document.querySelector(`#ivSheet select[data-consist="${k}"]`); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }
        if (note) { const ta = document.querySelector('#ivSheet textarea[data-note="comm"]'); ta.value = note; ta.dispatchEvent(new Event("input", { bubbles: true })); }
        const warn = document.querySelector('#ivSheet [data-warn="comm"]').textContent;
        document.querySelector("#ivSubmit").click(); return warn;
      }, i, vals, cs, note);
      const all5 = { persuade: 5, customer: 5, drive: 5, comm: 5, adapt: 5 };
      const w = await rate(0, all5, { specific: "yes", probe: "ask" }, "ผู้สมัครบอกว่าเพิ่งแต่งงาน");
      assert(/สถานภาพสมรส/.test(w), "evidence note guard: " + w);
      // the summary is opened early (before B and C) -> flagged as not independent
      await page.evaluate(() => { document.querySelector("#tab-summary").click(); document.querySelector("#ivReveal").click(); });
      assert(await page.evaluate(() => !document.querySelector("#ivSumEarly").hidden), "early reveal flagged");
      await rate(1, { persuade: 3, customer: 3, drive: 3, comm: 3, adapt: 2 }, { probe: "ask" });
      await rate(2, { persuade: 3, customer: 4, drive: 3, comm: 3, adapt: 3 }, {});
      await page.evaluate(() => document.querySelector("#tab-summary").click());
      const s = await page.evaluate(() => ({ early: document.querySelector("#ivSumEarly").hidden, spread: [...document.querySelectorAll("#ivSumSpread li[data-spread]")].map(l => l.dataset.spread + ":" + l.textContent),
        cs: document.querySelector("#ivSumConsist").innerText, probe: document.querySelector('#ivSumConsist [data-cs="probe"]')?.textContent || "" }));
      assert(s.early, "all submitted -> early flag gone");
      assert(s.spread.some(x => /^lenient:A/.test(x)), "rater spread flags A: " + JSON.stringify(s.spread));
      assert(/ความสอดคล้องของคำตอบ \(ข้อสังเกต ไม่ใช่การตัดสิน\)/.test(s.cs) && /ควรถามเพิ่ม 2/.test(s.probe) && /Bond & DePaulo, 2006/.test(s.cs) && /54%/.test(s.cs), "consistency summary: " + s.cs);
      for (const wd of ["โกหก", "จริง/เท็จ:", "คะแนนความจริง"]) assert(!s.cs.includes(wd), "verdict word " + wd);
      // the consistency choice travels with the exported sheet
      const ex = await page.evaluate(() => { document.querySelector("#tab-score").click(); document.querySelector('#ivWhoSeg button[data-i="0"]').click(); document.querySelector("#ivExport").click(); return JSON.parse(document.querySelector("#ivExportOut").value); });
      assert(ex.consist && ex.consist.probe === "ask" && ex.consist.specific === "yes", "export carries consist: " + JSON.stringify(ex));
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("interview R10: observable signs of excitement with caveats; EU/EEA mode hides them in employer flows but not in candidate practice", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, FAKE_MIC, FAKE_FACE] });
      await page.goto(`${base}/interview.html?cpu&fakedet&lang=th`);
      await page.evaluate(() => { document.querySelector("#tab-delivery").click(); document.querySelector("#ivCOk1").click(); document.querySelector("#ivCOk2").click(); document.querySelector("#ivDStart").click(); });
      await page.waitFor(`!document.querySelector("#ivDLive").hidden`, 15000);
      await sleep(11000);
      await page.evaluate(() => document.querySelector("#ivDCandBtn").click());
      await sleep(1200);
      const th = await page.evaluate(() => ({ sig: document.querySelectorAll("#ivDCandView .sig li[data-sig]").length, h: document.querySelector("#ivDCandView .sig h4")?.textContent || "", sci: document.querySelector("#ivDCandView .sig .sci")?.textContent || "", tiles: document.querySelectorAll("#ivDCandView .tile").length }));
      assert(th.sig >= 2 && /สัญญาณความตื่นเต้นที่สังเกตได้/.test(th.h) && /Barrett/.test(th.sci) && /Bond & DePaulo/.test(th.sci) && th.tiles === 7, "signals in general mode: " + JSON.stringify(th));
      // switch to EU/EEA or regulated use -> hidden in the employer interview, the basic tiles remain
      await page.evaluate(() => { const r = document.querySelector("#ivRegion"); r.value = "eu"; r.dispatchEvent(new Event("change")); });
      await sleep(1200);
      const eu = await page.evaluate(() => ({ sig: document.querySelectorAll("#pane-delivery .sig").length, off: document.querySelector("#ivDCandView .sig-off")?.textContent || "", note: document.querySelector("#ivDRegionNote").hidden, tiles: document.querySelectorAll("#ivDCandView .tile").length, st: document.querySelector("#ivRegionState").textContent }));
      assert(eu.sig === 0 && /5\(1\)\(f\)/.test(eu.off) && !eu.note && eu.tiles === 7 && /EU\/EEA/.test(eu.st), "EU mode hides signals: " + JSON.stringify(eu));
      await page.evaluate(() => document.querySelector("#ivDStop").click());
      await page.evaluate(() => document.querySelector("#ivDOpen").click());
      assert(await page.evaluate(() => document.querySelectorAll("#ivDResBody .sig").length === 0 && !!document.querySelector("#ivDResBody .sig-off")), "EU mode: not in the result card either");
      await page.evaluate(() => document.querySelector("#ivDDiscard").click());
      // candidate practice mode (?mode=practice style toggle): employer tabs hidden, signals kept, own summary at the end
      await page.evaluate(() => document.querySelector("#ivModeBtn").click());
      const cm = await page.evaluate(() => ({ vis: [...document.querySelectorAll(".iv .tab")].filter(b => b.offsetParent).map(b => b.dataset.t), pane: !document.querySelector("#pane-practice").hidden, own: document.querySelector("#pane-practice .iv-principle").textContent }));
      assert(cm.vis.join() === "practice,about" && cm.pane && /ไม่มีอะไรส่งถึงนายจ้าง/.test(cm.own), "candidate practice mode: " + JSON.stringify(cm));
      await page.evaluate(() => { document.querySelector("#ivPTime").value = "60"; document.querySelector("#ivPCam").click(); document.querySelector("#ivPStart").click(); });
      await page.waitFor(`!document.querySelector("#ivPRun").hidden`, 15000);
      await page.evaluate(() => document.querySelector("#ivPNext").click());
      await sleep(11500);
      await page.evaluate(() => document.querySelector("#ivPNext").click());
      const rv = await page.evaluate(() => ({ sig: document.querySelectorAll("#ivPTips .sig li[data-sig]").length, off: document.querySelectorAll("#ivPTips .sig-off").length }));
      assert(rv.sig >= 2 && rv.off === 0, "practice keeps signals in EU mode: " + JSON.stringify(rv));
      await page.evaluate(() => document.querySelector("#ivPEnd").click());
      const ps = await page.evaluate(() => ({ shown: !document.querySelector("#ivPSum").hidden, tiles: [...document.querySelectorAll("#ivPSum .tile")].map(t => t.innerText.replace(/\s+/g, " ")), h: document.querySelector("#ivPSum h2").textContent }));
      assert(ps.shown && ps.tiles.length === 5 && /เห็นเฉพาะคุณ/.test(ps.h) && /สัดส่วนการมองกล้อง/.test(ps.tiles.join("|")), "practice summary: " + JSON.stringify(ps));
      await page.evaluate(() => document.querySelector("#ivPSumPrint").click());
      assert(await page.evaluate(() => window.__printed === 1 && !document.documentElement.classList.contains("iv-print-ps")), "own summary printed");
      await page.evaluate(() => document.querySelector("#ivPSumClear").click());
      assert(await page.evaluate(() => document.querySelector("#ivPSum").hidden && window.__LQ_IV.P.results.length === 0), "practice results deleted");
      await privacyScan(page);
      const st = await page.evaluate(() => Object.keys(localStorage).filter(k => k !== "lq-lang" && k !== "lq-i18n-debug").concat(Object.keys(sessionStorage)));
      assert(!st.length, "page wrote storage: " + st);
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("interview R10: ?mode=practice&region=eu deep link; English at 390 px", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT] });
      await page.goto(`${base}/interview.html?cpu&mode=practice&region=eu&lang=en`);
      await page.waitFor(`window.LQI18N && LQI18N.lang === "en"`, 8000);
      await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await sleep(400);
      const m = await page.evaluate(() => ({ vis: [...document.querySelectorAll(".iv .tab")].filter(b => b.offsetParent).map(b => b.dataset.t), region: document.querySelector("#ivRegion").value,
        btn: document.querySelector("#ivModeBtn").textContent, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        thai: (document.querySelector("main").innerText.match(/[฀-๿]+/g) || []).slice(0, 5) }));
      assert(m.vis.join() === "practice,about" && m.region === "eu" && /interviewer mode/i.test(m.btn), "deep link: " + JSON.stringify(m));
      assert(m.sw <= m.cw && !m.thai.length, "en 390 px: " + JSON.stringify(m));
      await page.evaluate(() => document.querySelector("#ivModeBtn").click());
      assert(await page.evaluate(() => !document.querySelector("#pane-setup").hidden && [...document.querySelectorAll(".iv .tab")].filter(b => b.offsetParent).length === 7), "back to interviewer mode");
      await page.send("Emulation.clearDeviceMetricsOverride");
      await page.evaluate(() => LQI18N.setLang("th"));
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("interview: a microphone that never answers does not block the camera; a late microphone is released", async () => {
      const HUNG_MIC = `(() => { const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md);
        md.getUserMedia = c => (c && c.audio && !c.video) ? new Promise(res => { window.__lateMic = () => { const ac = new AudioContext(), d = ac.createMediaStreamDestination(); window.__lateStream = d.stream; res(d.stream); }; }) : orig(c); })();`;
      const page = await browser.newPage(null, { initScripts: [INIT, HUNG_MIC, FAKE_FACE] });
      await page.goto(`${base}/interview.html?cpu&fakedet&lang=th`);
      await page.evaluate(() => { document.querySelector("#tab-delivery").click(); document.querySelector("#ivCOk1").click(); document.querySelector("#ivCOk2").click(); document.querySelector("#ivDStart").click(); });
      await page.waitFor(`!document.querySelector("#ivDLive").hidden`, 15000);
      await sleep(1000);
      const r = await page.evaluate(() => ({ cam: window.__LQ_IV.dMeter.hasCam, mic: window.__LQ_IV.dMeter.hasMic, n: window.__LQ_IV.dMeter.samples.length }));
      assert(r.cam && !r.mic && r.n >= 2, "camera running without the microphone: " + JSON.stringify(r));
      await page.evaluate(() => document.querySelector("#ivDStop").click());
      await page.evaluate(() => window.__lateMic());   // the microphone finally answers after the session ended
      await sleep(300);
      const late = await page.evaluate(() => ({ live: window.__lateStream.getTracks().filter(t => t.readyState === "live").length, mic: window.__LQ_IV.dMeter.mic }));
      assert(late.live === 0 && !late.mic, "late microphone released: " + JSON.stringify(late));
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("interview: real TinyFace + 68-landmark models run on WASM during delivery observation (test pattern -> no face)", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, FAKE_MIC] });
      await page.goto(`${base}/interview.html?cpu&lang=th`);
      await page.evaluate(() => { document.querySelector("#tab-delivery").click(); document.querySelector("#ivCOk1").click(); document.querySelector("#ivCOk2").click(); document.querySelector("#ivDStart").click(); });
      await page.waitFor(`!document.querySelector("#ivDLive").hidden`, 90000);
      await page.waitFor(`window.__LQ_IV.dMeter.samples.length >= 3`, 60000);
      const r = await page.evaluate(() => ({ det: faceapi.nets.tinyFaceDetector.isLoaded, lm: faceapi.nets.faceLandmark68Net.isLoaded, backend: faceapi.tf.getBackend(), g: window.__LQ_IV.dMeter.snapshot().g }));
      assert(r.det && r.lm && r.backend !== "webgl", "models on " + JSON.stringify(r));
      assert(r.g.n >= 3 && r.g.facePct === 0, "no face in Chrome's test pattern: " + JSON.stringify(r.g));
      await page.evaluate(() => document.querySelector("#ivDStop").click());
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });
  } finally { await browser.close(); }
}
