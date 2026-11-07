// tests/e2e/sitecheck.e2e.mjs — on-site accuracy check (lensiq-sitecheck.js) wired into the shipped pages:
// store (tap each crossing -> matched against the counter), attendance (trials, no check-ins written while testing),
// driver (prompted eyes-closed protocol on the real monitor), qc (labelled bottles on the simulator), the camera-health
// pill, the JSON export (labels + numbers only) and 中文 coverage of the new panels.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const exceptions = page => page.consoleErrors.filter(e => e.kind === "exception");

// a person walks right -> left across x = 0.5 every 4 s (phase 0.5–2.5 s, crossing at 1.5 s) = "in"
const STORE_HOOKS = `
  window.__LQ_FAKE_DET = (key, now) => {
    const ph = now % 4000;
    if (ph > 3000) return [];
    const x = ph < 500 ? 0.8 : ph < 2500 ? 0.8 - 0.6 * (ph - 500) / 2000 : 0.2;
    return [{ x: x - 0.05, y: 0.3, w: 0.1, h: 0.4, score: 0.95 }];
  };
  window.__tapper = n => { // tap 0.4 s after each crossing, skipping the 3rd one (a person who forgot to tap)
    let k = 0; const tick = () => { const ph = performance.now() % 4000; let wait = (1900 - ph + 4000) % 4000;
      if (k === 0 ? ph >= 1300 && ph < 1900 : wait < 1500) wait += 4000; // never a crossing from before the check, never twice per crossing
      setTimeout(() => { if (k !== 2) __ST.scTap("in"); if (++k < n) tick(); }, wait); };
    tick();
  };
`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("store: taps vs counter -> report with matched / missed taps, health pill, JSON export without images", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}", STORE_HOOKS] });
      await page.goto(`${base}/store.html?cpu&fakedet&nosw`);
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem("st-cams", JSON.stringify({ v: 1, cams: [{ slot: "c1", deviceId: "fake-cam-1", label: "Fake Camera 1", name: "ประตูหน้า", role: "door" }] }));
        localStorage.setItem("st-cam-c1", JSON.stringify({ line: { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } }, swap: false, zones: [], detW: 0 }));
      });
      await page.reload();
      await page.waitFor("document.querySelector('#scPanel .sc-start')", 8000);
      await page.evaluate(() => document.getElementById("startCam").click());
      await page.waitFor("__ST.running && __ST.hub.cams.length === 1 && __ST.hub.cams[0].status === 'live'", 8000);
      await page.evaluate(() => document.querySelector("#scPanel .sc-start").click());
      assert(await page.evaluate(() => !!__ST.sitecheck && !document.querySelector("#scPanel .sc-taps").hidden), "check started, tap buttons shown");
      await page.evaluate(() => window.__tapper(6));
      await page.waitFor("__ST.sitecheck && __ST.sitecheck.truth.length >= 5 && __ST.sitecheck.sys.length >= 6", 60000);
      // health pill: rendered for the live tile once a couple of 1-s samples exist
      const pill = await page.waitFor(`(() => { const p = document.querySelector("#camGrid .st-health"); return p && !p.hidden && p.dataset.level != null && p.textContent; })()`, 5000);
      assert(/ภาพ/.test(pill), "health pill text: " + pill);
      await sleep(600);
      await page.evaluate(() => document.querySelector("#scPanel .sc-stop").click());
      const last = await page.evaluate(() => JSON.parse(JSON.stringify(__ST.sitecheckLast)));
      const n = last.rep.n;
      // under heavy CPU load the 10 Hz fake loop can occasionally miss one crossing: allow one, the arithmetic must still hold
      assert(n.truth === 5 && n.matched >= 4 && n.matched + n.missed === 5 && n.falseCount === n.sys - n.matched, "counts " + JSON.stringify(n) + " truth " + JSON.stringify(last.doc.truth.map(e => Math.round(e.t))) + " sys " + JSON.stringify(last.doc.system.map(e => Math.round(e.t))));
      assert(last.rep.dirAcc.p === 1, "directions all correct");
      // round 10: never a confirmed pass on 5 crossings — "more" or "on target so far — collect N more"
      assert(["more", "ontrack"].includes(last.rep.verdict) && last.rep.provisional === "more", "50+ crossings needed before a verdict: " + last.rep.verdict + " / " + last.rep.provisional);
      assert(last.rep.need.some(x => x.group === "crossings" && x.more >= 45), "collect N more: " + JSON.stringify(last.rep.need));
      assert(Math.abs(last.rep.lagMs) <= 1500, "tap lag estimated " + last.rep.lagMs);
      const html = await page.evaluate(() => document.querySelector("#scPanel .sc-report").innerText);
      assert(/ช่วงความเชื่อมั่น/.test(html) && /คำแนะนำ/.test(html), "report table + recommendations rendered");
      const doc = JSON.stringify(last.doc);
      assert(last.doc.format === "lensiq-sitecheck" && last.doc.truth.length === 5 && !/data:image|base64|blob:/.test(doc), "export: labels + numbers only");
      assert(await page.evaluate(() => !document.querySelector("#scPanel .sc-export").hidden), "export button shown");
      const hist = await page.evaluate(() => JSON.parse(localStorage.getItem("st-sitecheck") || "[]"));
      assert(hist.length === 1 && hist[0].verdict === last.rep.verdict && hist[0].cam === "ประตูหน้า" && hist[0].v === 2 && !("truth" in hist[0]), "history keeps a summary only (+ camera name for insights)");
      await page.evaluate(() => document.getElementById("stop").click());
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await page.close();
    });

    await check("store: a frozen camera is flagged 'stalled', an unplugged one shows 'offline since HH:MM', reconnects by itself and the offline time is stored with the hourly counts", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}", STORE_HOOKS] });
      await page.goto(`${base}/store.html?cpu&fakedet&nosw`);
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem("st-cams", JSON.stringify({ v: 1, cams: [{ slot: "c1", deviceId: "fake-cam-1", label: "Fake Camera 1", name: "ประตูหน้า", role: "door" }] }));
        localStorage.setItem("st-cam-c1", JSON.stringify({ line: { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } }, swap: false, zones: [], detW: 0 }));
      });
      await page.reload();
      await page.waitFor("document.getElementById('startCam')", 8000);
      await page.evaluate(() => document.getElementById("startCam").click());
      await page.waitFor("__ST.running && __ST.hub.cams.length === 1 && __ST.hub.cams[0].status === 'live'", 8000);
      const codes = () => page.evaluate(() => { const c = __ST.hub.cams[0]; return c._hl && c._hl.state ? c._hl.state.codes : null; });
      await page.waitFor("(() => { const c = __ST.hub.cams[0]; return c._hl && c._hl.state && c._hl.state.n >= 3; })()", 8000);
      assert(!(await codes()).includes("stalled"), "live camera is not stalled: " + JSON.stringify(await codes()));
      // freeze: the track stays live but no new frames arrive (requestVideoFrameCallback stops)
      await page.evaluate(() => __LQ_FAKE.freeze("fake-cam-1", true));
      await page.waitFor("(() => { const c = __ST.hub.cams[0]; return c._hl.state.codes.includes('stalled') && c._hl.state.level === 2; })()", 12000);
      const pill = await page.evaluate(() => { const p = document.querySelector("#camGrid .st-health"); return { lvl: p.dataset.level, line: document.querySelector("#camGrid .cam-health").textContent }; });
      assert(pill.lvl === "2" && /ไม่ได้รับภาพใหม่/.test(pill.line), "pill shows the stalled camera: " + JSON.stringify(pill));
      await page.evaluate(() => __LQ_FAKE.freeze("fake-cam-1", false));
      await page.waitFor("!__ST.hub.cams[0]._hl.state.codes.includes('stalled')", 12000);
      const q1 = await page.evaluate(() => JSON.parse(JSON.stringify(__ST.day.quality || {})));
      const h = new Date().getHours();
      assert(q1[h] && q1[h].offline >= 1 && q1[h].n >= 3, "stalled seconds stored with the hourly bucket: " + JSON.stringify(q1));
      // unplug: track ended -> offline badge with the time, automatic reconnect with backoff once the device is back
      await page.evaluate(() => __LQ_FAKE.unplug("fake-cam-1"));
      await page.waitFor("__ST.hub.cams[0].status === 'error' && !!__ST.hub.cams[0].offlineSince", 5000);
      const badge = await page.waitFor(`(() => { const b = document.querySelector("#camGrid .lq-offline"); return b && !b.hidden && b.textContent; })()`, 5000);
      assert(/กล้องออฟไลน์ตั้งแต่ \d\d:\d\d/.test(badge), "offline badge: " + badge);
      await sleep(2500);
      const off = await page.evaluate(() => (__ST.day.quality[new Date().getHours()] || {}).offline || 0);
      assert(off > q1[h].offline, "offline seconds keep counting while the camera is down");
      await page.evaluate(() => __LQ_FAKE.replug("fake-cam-1"));
      await page.waitFor("__ST.hub.cams[0].status === 'live' && !__ST.hub.cams[0].offlineSince && __ST.hub.cams[0].offlineLog.length === 1", 20000);
      const back = await page.evaluate(() => { const b = document.querySelector("#camGrid .lq-offline"); return b.dataset.s + " " + b.textContent; });
      assert(/^back กล้องกลับมาออนไลน์/.test(back), "badge after reconnect: " + back);
      await page.evaluate(() => document.getElementById("stop").click());
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await page.close();
    });

    await check("attendance: trials decide auto / ask / none, nothing is checked in while testing, export uses pseudonyms", async () => {
      const D = v => Array.from({ length: 128 }, (_, k) => +(Math.sin(k * v) * 0.1).toFixed(5));
      const HOOKS = `window.__faces = []; window.__LQ_FAKE_DET = () => window.__faces.map(f => Object.assign({ score: 0.95 }, f));
        window.__LQ_FAKE_MATCH = d => d && d.who ? { label: d.who, distance: 0.3, confident: d.unsure ? false : true } : { label: "unknown", distance: 0.9 };`;
      const page = await browser.newPage(null, { initScripts: [fakeCams, HOOKS] });
      await page.goto(`${base}/attendance.html?cpu&fakedet&nosw`);
      await page.evaluate(p => { localStorage.clear(); localStorage.setItem("att-people", JSON.stringify(p)); },
        [{ id: "pA", name: "สมชาย ทดสอบ", code: "A01", descriptor: D(1) }, { id: "pB", name: "สมหญิง ทดสอบ", code: "B02", descriptor: D(2) }]);
      await page.reload();
      await page.waitFor("ready === true && people.length === 2", 15000);
      await page.evaluate(() => document.querySelector('.tab[data-t="check"]').click());
      await page.evaluate(() => document.querySelector("#scPanel .sc-start").click());
      assert(await page.evaluate(() => !!__ATT_SC.active && scanning), "check active and scanning (no session name needed)");
      const trial = async (truth, face, outcome) => {
        await page.evaluate(([t, f]) => { window.__faces = f ? [f] : []; document.querySelector("#scPanel .sc-who").value = t; document.querySelector("#scPanel .sc-go").click(); }, [truth, face]);
        const n0 = await page.evaluate(() => __ATT_SC.active.trials.length);
        await page.waitFor(`__ATT_SC.active.trials.length > ${n0}`, 12000);
        const got = await page.evaluate(() => __ATT_SC.active.trials.at(-1));
        assert(got.outcome === outcome, `${truth}: expected ${outcome}, got ${JSON.stringify(got)}`);
        await page.evaluate(() => { window.__faces = []; }); await sleep(400);
      };
      await trial("pA", { x: 0.3, y: 0.3, w: 0.2, h: 0.3, who: "pA" }, "auto");
      await trial("pB", { x: 0.3, y: 0.3, w: 0.2, h: 0.3, who: "pB", unsure: true }, "ask");
      await trial("stranger", { x: 0.3, y: 0.3, w: 0.2, h: 0.3 }, "none");
      await trial("stranger", { x: 0.3, y: 0.3, w: 0.2, h: 0.3, who: "pA" }, "auto");
      assert((await page.evaluate(() => JSON.parse(localStorage.getItem("att-logs") || "[]"))).length === 0, "no attendance written during the check");
      await page.evaluate(() => document.querySelector("#scPanel .sc-stop").click());
      const last = await page.evaluate(() => JSON.parse(JSON.stringify(__ATT_SC.last)));
      assert(last.doc.trials.filter(t => t.truth === "stranger").every(t => t.sid === "s1") && last.doc.distinctPeople && last.doc.distinctPeople.members === 2, "stranger numbers + distinct people in the export");
      assert(last.rep.verdict === "fail" && last.rep.n.strangerAuto === 1 && last.rep.n.memberAuto === 1 && last.rep.n.memberAsk === 1, "report " + JSON.stringify(last.rep.n));
      const doc = JSON.stringify(last.doc);
      assert(!/สมชาย|สมหญิง|pA|pB|descriptor/.test(doc) && last.doc.trials[0].truth === "m1", "export has pseudonyms only: " + doc.slice(0, 300));
      assert(await page.evaluate(() => !scanning), "scan stopped with the check");
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await page.close();
    });

    await check("qc: simulator bottles labelled from the simulated truth -> false-reject / miss report", async () => {
      const page = await browser.newPage(null, { initScripts: [] });
      await page.goto(`${base}/qc.html?cpu&nosw`);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitFor("window.__QC && document.querySelector('#scPanel .sc-start') && !document.getElementById('simCalib').hidden", 10000);
      await page.evaluate(() => document.getElementById("simCalib").click());
      await page.waitFor("__QC.lanes[0].golden && __QC.lanes[0].bg", 15000);
      await page.evaluate(() => document.querySelector("#scPanel .sc-start").click());
      await page.evaluate(() => { if (!__QC.running) document.getElementById("toggle").click(); });
      await page.waitFor("__QC.sitecheck && __QC.sitecheck.rows.length >= 8", 60000);
      const rows = await page.evaluate(() => __QC.sitecheck.rows.map(r => r.truth));
      assert(rows.every(t => t === "good" || t === "bad"), "simulated truth applied: " + rows);
      await page.evaluate(() => { __QC.scFinish(); if (__QC.running) document.getElementById("toggle").click(); });
      const last = await page.evaluate(() => JSON.parse(JSON.stringify(__QC.sitecheckLast)));
      const n = last.rep.n;
      assert(n.good + n.bad >= 8 && n.falseReject === 0 && n.missed === 0, "simulator: no false rejects, no misses " + JSON.stringify(n));
      assert(last.doc.rows.length >= 8 && !/data:image|base64/.test(JSON.stringify(last.doc)), "export rows, no images");
      const pill = await page.evaluate(() => { const p = document.getElementById("camHealth"); return p && !p.hidden ? p.dataset.level : null; });
      assert(pill != null, "qc health pill shown");
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await page.close();
    });

    await check("driver: prompted closures on the real monitor are scored; panel refuses to start without a calibrated trip", async () => {
      // the fake driver face (synthFace) closes its eyes (EAR 0.10) whenever window.__closed is true; the check drives it
      const HOOKS = `window.__closed = false; window.__LQ_FAKE_DET = key => key === "driver" ? [{ x: 0.10, y: 0.25, w: 0.22, h: 0.40, score: 0.9, ear: window.__closed ? 0.10 : 0.30, mar: 0.1 }] : null;`;
      const page = await browser.newPage(null, { initScripts: [fakeCams, HOOKS] });
      await page.goto(`${base}/driver.html?cpu&fakedet&nosw`);
      await page.waitFor("window.__LQ_DR && document.querySelector('#scPanel .sc-start')", 10000);
      await page.evaluate(() => document.querySelector("#scPanel .sc-start").click());
      assert(await page.evaluate(() => !__DR_SC.active && /เริ่มเที่ยว/.test(document.getElementById("engine").textContent)), "needs a calibrated trip first");
      await page.evaluate(() => { const f = document.getElementById("tripForm"); f.driver.value = "ทดสอบ"; f.plate.value = "1กข 1234"; f.requestSubmit(); });
      await page.waitFor("__LQ_DR.phase === 'trip'", 15000);
      await page.evaluate(() => { document.querySelector("#scPanel .sc-dur").value = "3"; document.querySelector("#scPanel .sc-start").click(); });
      assert(await page.evaluate(() => !!__DR_SC.active), "check started");
      // compress the schedule: 3 prompts 6 s apart, the fake driver obeys each one, then finish
      await page.evaluate(() => { const S = __DR_SC.active; S.prompts = [0, 1, 2].map(i => ({ at: 2000 + i * 6000, closeMs: 3000 })); S.durationMs = 22000;
        setInterval(() => { const el = Date.now() - S.t0; window.__closed = S.prompts.some(p => el >= p.at + 300 && el < p.at + p.closeMs); }, 50); });
      await page.waitFor("!__DR_SC.active && __DR_SC.last", 40000);
      const last = await page.evaluate(() => JSON.parse(JSON.stringify(__DR_SC.last)));
      assert(last.rep.n.prompts === 3, "3 prompts scored " + JSON.stringify(last.rep.n));
      assert(last.rep.n.hits === 3, "every prompted closure alerted " + JSON.stringify(last.rep.n));
      assert(last.doc.events.every(e => typeof e.type === "string") && !/data:image|base64/.test(JSON.stringify(last.doc)), "export numbers only");
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await page.close();
    });

    await check("中文: the site-check panels and health pill are translated (< 5% Thai)", async () => {
      const rows = [];
      for (const pg of ["store", "attendance", "driver", "qc"]) {
        const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}"] });
        await page.goto(`${base}/${pg}.html?cpu&fakedet&nosw&lang=zh`);
        await page.waitFor("window.LQI18N && LQI18N.lang === 'zh' && typeof LQI18N.coverage === 'function' && document.querySelector('#scPanel .sc-start')", 8000);
        await sleep(900);
        const c = await page.evaluate(() => LQI18N.coverage(document.getElementById("scPanel"), { top: 3 }));
        rows.push(`${pg} ${c.pct}%`);
        assert(c.pct < 5, `${pg} panel: ${c.pct}% Thai — ${c.top.map(x => x.text).join(" | ")}`);
        const en = await page.evaluate(async () => { LQI18N.setLang("en"); await new Promise(r => setTimeout(r, 1200)); return LQI18N.coverage(document.getElementById("scPanel"), { top: 3 }); });
        rows.push(`${pg}/en ${en.pct}%`);
        assert(en.pct < 5, `${pg} panel (en): ${en.pct}% Thai — ${en.top.map(x => x.text).join(" | ")}`);
        await page.close();
      }
      console.log("       " + rows.join(", "));
    });
  } finally { await browser.close(); }
}
