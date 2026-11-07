// tests/e2e/interview.e2e.mjs — Structured Interview Kit (interview.html). Chrome's own fake camera + fake microphone
// (--use-fake-device-for-media-stream: test pattern video, periodic beep audio) and ?fakedet scripted faces.
// Checks: role template -> questions with BARS, three interviewers scoring independently (hidden until all submit),
// agreement/strengths/discussion summary with evidence notes, sheet export/import, print area without images,
// consent-gated delivery observation (descriptive numbers only, camera+mic released on stop), practice mode with timer
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

    await check("interview: delivery observation needs explicit opt-in, shows descriptive signals only, releases camera + mic", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, FAKE_MIC, FAKE_FACE] });
      await page.goto(`${base}/interview.html?cpu&fakedet`);
      await page.evaluate(() => document.querySelector("#tab-delivery").click());
      const g0 = await page.evaluate(() => ({ dis: document.querySelector("#ivDStart").disabled, why: document.querySelectorAll("#pane-delivery .why li").length }));
      assert(g0.dis && g0.why >= 4, "start disabled before consent; research explanation shown");
      await page.evaluate(() => document.querySelector("#ivCOk1").click());
      assert(await page.evaluate(() => document.querySelector("#ivDStart").disabled), "one tick is not enough");
      await page.evaluate(() => document.querySelector("#ivDDecline").click());
      const dec = await page.evaluate(() => ({ c1: document.querySelector("#ivCOk1").checked, msg: document.querySelector("#ivDMsg").textContent, gum: 0 }));
      assert(!dec.c1 && /ไม่มีผลต่อการพิจารณา/.test(dec.msg), "decline path " + JSON.stringify(dec));
      await page.evaluate(() => { document.querySelector("#ivCOk1").click(); document.querySelector("#ivCOk2").click(); document.querySelector("#ivDStart").click(); });
      await page.waitFor(`!document.querySelector("#ivDLive").hidden`, 15000);
      await sleep(8500);
      const live = await page.evaluate(() => { const s = window.__LQ_IV.dMeter.snapshot(); return { s, mic: window.__LQ_IV.dMeter.hasMic, cam: window.__LQ_IV.dMeter.hasCam, tiles: document.querySelectorAll("#ivDTiles .tile").length,
        live: document.querySelector("#ivDLive").innerText, heading: document.querySelector("#ivDLive h2").textContent }; });
      assert(live.cam && live.mic, "camera + mic open " + JSON.stringify([live.cam, live.mic]));
      const g = live.s.g, d = live.s.d;
      assert(g.n >= 20 && g.facePct >= 60 && g.facePct <= 85, "face visible ≈ 75%: " + JSON.stringify(g));
      assert(g.towardPct >= 50 && g.towardPct <= 80, "toward camera ≈ 67% of face frames: " + JSON.stringify(g));
      assert(d && d.ms > 6000 && d.share > 0.5 && d.share < 0.8, "speaking share ≈ 1.5/2.3 on the scripted mic: " + JSON.stringify(d));
      assert(d.pauses >= 2 && d.longPauses === 0 && d.peakRate > 3 && d.peakRate < 5, "pauses + ≈4 bursts/s: " + JSON.stringify(d));
      assert(live.tiles === 7, "7 descriptive tiles");
      assert(/ไม่ใช่การประเมินตัวบุคคล/.test(live.heading), "framing heading");
      for (const wd of ["ประหม่า", "โกรธ", "โกหก", "ความซื่อสัตย์:", "บุคลิกภาพ:", "อารมณ์:"]) assert(!live.live.includes(wd), "label " + wd);
      await page.evaluate(() => document.querySelector("#ivDStop").click());
      await sleep(300);
      const after = await page.evaluate(() => ({ res: !document.querySelector("#ivDResult").hidden, tiles: document.querySelectorAll("#ivDResTiles .tile").length,
        vs: document.querySelector("#ivDVideo").srcObject, c1: document.querySelector("#ivCOk1").checked, running: window.__LQ_IV.dMeter.running, mic: window.__LQ_IV.dMeter.mic }));
      assert(after.res && after.tiles === 7 && !after.vs && !after.running && !after.mic && !after.c1, "stopped + released + consent reset: " + JSON.stringify(after));
      // optional attachment to the summary (off by default)
      await page.evaluate(() => { document.querySelector("#ivWho").value = "A"; document.querySelector("#ivWhoForm").requestSubmit(); document.querySelector("#tab-summary").click(); document.querySelector("#ivReveal").click(); });
      assert(await page.evaluate(() => document.querySelector("#ivSumDelivery").hidden), "delivery not in summary by default");
      await page.evaluate(() => document.querySelector("#ivIncDelivery").click());
      assert(await page.evaluate(() => !document.querySelector("#ivSumDelivery").hidden && document.querySelectorAll("#ivSumDelivery .tile").length === 7), "delivery attached on request");
      await page.evaluate(() => { document.querySelector("#tab-delivery").click(); document.querySelector("#ivDDiscard").click(); });
      assert(await page.evaluate(() => window.__LQ_IV.S.delivery === null), "discarded");
      await privacyScan(page);
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
        await page.evaluate(t => { document.querySelector("#tab-" + t).click(); if (t === "summary") document.querySelector("#ivReveal").click(); }, t);
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
