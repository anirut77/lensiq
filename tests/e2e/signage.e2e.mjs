// tests/e2e/signage.e2e.mjs — signage.html with fake cams + ?cpu&fakedet:
// single camera (both roles shared, exactly as before), dual camera via createHub roles (audience keeps measuring while the
// kiosk camera drives the cursor), active-hand lock against a bystander, capacity fallback to one camera (muteOthers),
// proof-of-play log, no console errors, no horizontal overflow at 390/1280, privacy scan.
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const errorsOf = page => page.consoleErrors.filter(e => !/fonts\.(googleapis|gstatic)|favicon/.test((e.url || "") + " " + (e.text || "")));
// face on c1 (audience), hands on c2 (kiosk) — key = slot. Mutable through window.__hands.
function script() {
  window.__hands = [{ x: 0.1, y: 0.2, w: 0.3, h: 0.5, score: 0.95 }, { x: 0.62, y: 0.3, w: 0.15, h: 0.25, score: 0.9 }];
  window.__LQ_FAKE_DET = key => key === "c1" ? [{ x: 0.35, y: 0.2, w: 0.2, h: 0.3, score: 0.95 }] : key === "c2" ? window.__hands : [];
}
async function overflow(page, w, h) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await sleep(350);
  const out = [];
  for (const tab of ["player", "kiosk", "report"]) {
    await page.evaluate(t => document.querySelector(`[data-tab=${t}]`).click(), tab);
    await sleep(250);
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, wide: [...document.querySelectorAll("main *")].filter(e => e.getClientRects().length && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest(".table-wrap,.tabs")).map(e => e.tagName + "." + e.className).slice(0, 4) }));
    if (r.sw > r.cw) out.push(`${tab}@${w}: ${r.sw} > ${r.cw} ${r.wide.join(", ")}`);
  }
  await page.evaluate(() => document.querySelector("[data-tab=player]").click());
  await page.send("Emulation.clearDeviceMetricsOverride");
  return out;
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const url = `${base}/signage.html?cpu&fakedet`;
  // seed runs once per tab, before page scripts (a reload's beforeunload would otherwise overwrite seeded keys)
  const open = async (cams, seed) => {
    const once = `try{ if(!sessionStorage.getItem("__seeded")){ localStorage.clear(); (${seed ? seed.toString() : "() => {}"})(); sessionStorage.setItem("__seeded","1"); } }catch(e){}`;
    const page = await browser.newPage(null, { initScripts: [fakeCams, `window.__LQ_FAKE_CAMS=${JSON.stringify(cams)}`, once] });
    await page.goto(url);
    await page.evaluate(script);
    return page;
  };
  try {
    await check("single camera: both roles on one camera; kiosk tab moves the video and stops face measuring (as before)", async () => {
      const page = await open({ n: 1, mode: "ok" });
      await assertNoWebGL(page);
      await page.evaluate(() => { window.__LQ_FAKE_DET = () => [{ x: 0.35, y: 0.2, w: 0.2, h: 0.4, score: 0.95 }]; document.getElementById("startFace").click(); });
      await page.waitFor(`__sg.faceRunning && __sg.hub.cams.length === 1 && __sg.R.shared && __sg.tracker.tracks.some(t => t.frames >= 3)`, 8000);
      assert(await page.evaluate(() => document.getElementById("pip").contains(__sg.hub.cams[0].video)), "video in #pip");
      await page.evaluate(() => document.querySelector("[data-tab=kiosk]").click());
      assert(await page.evaluate(() => !__sg.faceRunning && document.getElementById("kpip").contains(__sg.hub.cams[0].video)), "shared: face stopped, video moved to #kpip");
      await page.evaluate(() => document.getElementById("startHand").click());
      await page.waitFor(`__sg.handRunning && __sg.handDelegate === "TFJS" && __sg.cursor.on`, 6000);
      const eng = await page.evaluate(() => document.getElementById("engine").textContent);
      assert(/คีออสก์พร้อม/.test(eng) && /TF\.js/.test(eng), "engine " + eng);
      await page.evaluate(() => document.querySelector("[data-tab=player]").click());
      assert(await page.evaluate(() => !__sg.handRunning && document.getElementById("pip").contains(__sg.hub.cams[0].video)), "hand stopped, video back");
      const errs = errorsOf(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("dual camera: audience c1 keeps measuring on the kiosk tab; kiosk c2 drives the cursor; hand lock ignores a bystander", async () => {
      const page = await open({ n: 2, mode: "ok" });
      await page.evaluate(() => document.getElementById("startFace").click());
      await page.waitFor(`__sg.faceRunning && __sg.hub.cams.length === 1`, 6000);
      await page.evaluate(() => document.getElementById("addKiosk").click());
      await page.waitFor(`__sg.hub.cams.length === 2 && !__sg.R.shared && __sg.R.audience === "c1" && __sg.R.kiosk === "c2" && __sg.hub.cams.every(c => c.status === "live")`, 8000);
      const roles = await page.waitFor(`(() => { const r = JSON.parse(localStorage.getItem("sg-cams")).cams.map(c => c.role).join(); return r === "audience,kiosk" && r; })()`, 3000);
      assert(roles === "audience,kiosk", "saved roles " + roles);
      await page.evaluate(() => document.querySelector("[data-tab=kiosk]").click());
      assert(await page.evaluate(() => __sg.faceRunning), "face keeps running on the kiosk tab");
      assert(await page.evaluate(() => document.getElementById("pip").contains(__sg.hub.cam("c1").video) && document.getElementById("kpip").contains(__sg.hub.cam("c2").video)), "videos placed per role");
      const f0 = await page.evaluate(() => Math.max(0, ...__sg.tracker.tracks.map(t => t.frames)));
      await page.evaluate(() => document.getElementById("startHand").click());
      await page.waitFor(`__sg.handRunning && __sg.cursor.on && __sg.lock.box && __sg.handInfo.n === 2`, 6000);
      const b1 = await page.evaluate(() => __sg.lock.box.x);
      assert(b1 < 0.2, "locked on the larger (nearer) hand, x=" + b1);
      // bystander's hand becomes larger: lock must not move
      await page.evaluate(() => { window.__hands = [{ x: 0.1, y: 0.2, w: 0.3, h: 0.5, score: 0.95 }, { x: 0.55, y: 0.2, w: 0.4, h: 0.7, score: 0.97 }]; });
      await sleep(600);
      assert(await page.evaluate(() => __sg.lock.box.x < 0.2), "lock kept");
      // controlling hand leaves: held, then the other hand takes over after lostMs
      await page.evaluate(() => { window.__hands = [{ x: 0.55, y: 0.2, w: 0.4, h: 0.7, score: 0.97 }]; });
      await page.waitFor(`__sg.handInfo.held`, 2000);
      await page.waitFor(`__sg.lock.box && __sg.lock.box.x > 0.5 && !__sg.handInfo.held`, 3000);
      const f1 = await page.evaluate(() => Math.max(0, ...__sg.tracker.tracks.map(t => t.frames)));
      assert(f1 > f0, `audience frames grew while on the kiosk tab ${f0} -> ${f1}`);
      assert(await page.evaluate(() => /กล้องคีออสก์/.test(document.getElementById("engine").textContent)), "engine names the kiosk camera");
      // audience counted OTS for the playing ad; proof-of-play row after the ad changes
      await page.evaluate(() => { __sg.nextAd(); __sg.nextAd(); });
      const pop = await page.evaluate(() => __sg.pop.log.slice(-2));
      assert(pop.length === 2 && pop.every(e => typeof e.ots === "number" && e.m === 1 && e.dp), "pop " + JSON.stringify(pop));
      await page.evaluate(() => document.querySelector("[data-tab=report]").click());
      assert(await page.evaluate(() => !__sg.handRunning && __sg.faceRunning), "leaving the kiosk tab stops hand only");
      assert(await page.evaluate(() => document.querySelectorAll("#popTable tbody tr").length >= 2 && document.querySelectorAll("#adTable thead th").length === 9), "report tables");
      // reload: both cameras restored with their roles
      await page.reload();
      await page.evaluate(script);
      await page.evaluate(() => document.getElementById("startFace").click());
      await page.waitFor(`__sg.faceRunning && __sg.hub.cams.length === 2 && __sg.R.audience === "c1" && __sg.R.kiosk === "c2"`, 8000);
      // swap roles from the UI
      await page.evaluate(() => document.querySelector("[data-tab=kiosk]").click());
      await page.evaluate(() => document.querySelector('#camRoles [data-act="swap"]').click());
      await page.waitFor(`__sg.R.audience === "c2" && __sg.R.kiosk === "c1" && document.getElementById("kpip").contains(__sg.hub.cam("c1").video)`, 3000);
      const ov = await overflow(page, 390, 844);
      ov.push(...await overflow(page, 1280, 900));
      assert(!ov.length, "overflow: " + ov.join(" | "));
      await privacyScan(page);
      const big = await page.evaluate(() => Object.keys(localStorage).filter(k => /^sg-/.test(k)).map(k => [k, localStorage.getItem(k)]).filter(([, v]) => /data:image|blob:/.test(v)).map(([k]) => k));
      assert(!big.length, "image-like values in " + big);
      const errs = errorsOf(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("capacity fallback (muteOthers): + กล้องคีออสก์แยก shows the limit, one camera keeps both roles", async () => {
      const page = await open({ n: 2, mode: "muteOthers" });
      await page.evaluate(() => document.getElementById("startFace").click());
      await page.waitFor(`__sg.faceRunning && __sg.hub.cams.length === 1 && __sg.hub.cams[0].status === "live"`, 6000);
      await page.evaluate(() => document.getElementById("addKiosk").click());
      const msg = await page.waitFor(`(() => { const t = document.getElementById("engine").textContent; return /สูงสุด 1 ตัว/.test(t) && t; })()`, 8000);
      assert(/กล้องตัวเดียว/.test(msg), msg);
      await page.waitFor(`__sg.hub.cams.length === 1 && __sg.hub.cams[0].active && !__sg.hub.cams[0].stream.getVideoTracks()[0].muted && __sg.R.shared`, 4000);
      assert(await page.evaluate(() => JSON.parse(localStorage.getItem("lq-camcap")).maxLive) === 1, "lq-camcap 1");
      await page.evaluate(() => document.querySelector("[data-tab=kiosk]").click());
      await page.evaluate(() => document.getElementById("startHand").click());
      await page.waitFor(`__sg.handRunning && __sg.cursor.on && document.getElementById("kpip").contains(__sg.hub.cams[0].video)`, 6000);
      await privacyScan(page);
      const errs = errorsOf(page).filter(e => !/CapacityError/.test(e.text || ""));
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("dayparts: an ad scheduled outside the current daypart is never played; legacy sg-ads/sg-stats still load", async () => {
      const page = await open({ n: 1, mode: "ok" }, () => {
        const h = new Date().getHours(), other = h >= 6 && h < 11 ? "evening" : "morning";
        localStorage.setItem("sg-ads", JSON.stringify([
          { id: "a-now", title: "ตอนนี้", text: "", color: "#123456", duration: 3, ages: [], gender: "any", mood: "any", enabled: true },
          { id: "a-later", title: "ช่วงอื่น", text: "", color: "#654321", duration: 3, ages: [], gender: "any", mood: "any", enabled: true, dayparts: [other] }]));
        localStorage.setItem("sg-stats", JSON.stringify({ v: 1, since: 1, ads: { "a-now": { title: "ตอนนี้", plays: 2, ots: 3, viewers: 1, attn: 4, look: 5, happy: 1 } }, demo: { u18: { male: 0, female: 0, unk: 0 }, "18_34": { male: 1, female: 0, unk: 0 }, "35_54": { male: 0, female: 0, unk: 0 }, "55p": { male: 0, female: 0, unk: 0 } }, hourly: {}, totals: { ots: 3, viewers: 1, dwell: 9, attn: 4 }, gestures: {}, selects: {} }));
      });
      const seen = new Set();
      for (let i = 0; i < 6; i++) { await page.evaluate(() => __sg.nextAd()); seen.add(await page.evaluate(() => __sg.cur && __sg.cur.ad.id)); }
      assert([...seen].join() === "a-now", "played " + [...seen]);
      await page.evaluate(() => document.querySelector("[data-tab=report]").click());
      const t = await page.evaluate(() => document.getElementById("adTable").textContent);
      assert(/ตอนนี้/.test(t) && /ช่วงอื่น/.test(t), "report rows");
      const st = await page.evaluate(() => JSON.parse(localStorage.getItem("sg-stats")));
      assert(st.v === 1 && st.ads["a-now"].ots === 3 && st.totals.ots === 3, "legacy stats kept " + JSON.stringify(st.ads["a-now"]));
      const errs = errorsOf(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });
    await check("round 10: on-site age/gender check — passers listed as tracks end, staff labels, confusion table, export, history, health pill, zh/en", async () => {
      const page = await open({ n: 1, mode: "ok" });
      await page.waitFor("window.__SG_SC && document.querySelector('#scPanel .sc-start')", 8000);
      await page.evaluate(() => { window.__face = null; window.__LQ_FAKE_DET = () => window.__face ? [window.__face] : []; document.querySelector("#scPanel .sc-start").click(); });
      await page.waitFor("__SG_SC.active && __sg.faceRunning", 8000);
      const people = [{ age: 26, male: 0.9 }, { age: 62, male: 0.1 }, { age: 12, male: 0.85 }];
      for (let i = 0; i < people.length; i++) {
        await page.evaluate(p => { window.__face = Object.assign({ x: 0.35, y: 0.2, w: 0.2, h: 0.3, score: 0.95 }, p); }, people[i]);
        await sleep(1600);
        await page.evaluate(() => { window.__face = null; });
        await page.waitFor(`__SG_SC.active.rows.length >= ${i + 1}`, 9000);
      }
      const est = await page.evaluate(() => __SG_SC.active.rows.map(r => r.band + "/" + r.gender));
      assert(est.join() === "18_34/male,55p/female,u18/male", "system estimates " + est);
      await page.evaluate(() => { __SG_SC.label(0, "18_34", "male"); __SG_SC.label(1, "55p", "female"); __SG_SC.label(2, "35_54", "male"); });
      assert(await page.evaluate(() => document.querySelectorAll("#scPanel .sg-passers li").length === 3), "passer rows rendered");
      const pill = await page.waitFor(`(() => { const p = document.getElementById("camHealth"); return p && !p.hidden && p.dataset.level != null && p.textContent; })()`, 5000);
      assert(/ภาพ/.test(pill), "health pill " + pill);
      // zh / en coverage of the panel while rows are listed
      const zh = await page.evaluate(async () => { LQI18N.setLang("zh"); await new Promise(r => setTimeout(r, 500)); return LQI18N.coverage(document.getElementById("scPanel"), { top: 3 }); });
      assert(zh.pct < 5, `zh panel ${zh.pct}% Thai — ${zh.top.map(x => x.text).join(" | ")}`);
      const en = await page.evaluate(async () => { LQI18N.setLang("en"); await new Promise(r => setTimeout(r, 1500)); return LQI18N.coverage(document.getElementById("scPanel"), { top: 3 }); });
      assert(en.pct < 5, `en panel ${en.pct}% Thai — ${en.top.map(x => x.text).join(" | ")}`);
      await page.evaluate(() => { LQI18N.setLang("th"); __SG_SC.finish(); });
      const last = await page.evaluate(() => JSON.parse(JSON.stringify(__SG_SC.last)));
      const r = last.rep;
      assert(r.n.labelled === 3 && r.gender.x === 3 && r.gender.n === 3 && r.band.x === 2 && r.band.n === 3, "report " + JSON.stringify(r.n));
      assert(r.confusion.band[2][0] === 1 && r.confusion.band[1][1] === 1 && r.confusion.band[3][3] === 1, "confusion " + JSON.stringify(r.confusion.band));
      assert(["more", "ontrack"].includes(r.verdict) && r.provisional, "verdict " + r.verdict);
      assert(await page.evaluate(() => document.querySelectorAll("#scPanel .sc-conf").length === 2), "confusion tables rendered");
      const doc = JSON.stringify(last.doc);
      assert(last.doc.format === "lensiq-sitecheck" && last.doc.passers.length === 3 && !/data:image|base64|blob:|descriptor/.test(doc), "export labels + numbers only");
      const hist = await page.evaluate(() => JSON.parse(localStorage.getItem("sg-sitecheck") || "[]"));
      assert(hist.length === 1 && hist[0].cam && hist[0].verdict === r.verdict && !("passers" in hist[0]), "history " + JSON.stringify(hist));
      const errs = errorsOf(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("round 10: LENSIQ_AGE_GENDER=false hides the option, never requests ageGenderNet, check unavailable; option off = lazy", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}", "window.LENSIQ_AGE_GENDER=false", "try{localStorage.clear()}catch(e){}"] });
      await page.goto(url);
      await page.waitFor("window.__SG_SC && document.querySelector('#scPanel .sc-start')", 8000);
      assert(await page.evaluate(() => document.getElementById("demoOpt").hidden && document.getElementById("demoOpt").getClientRects().length === 0), "age/gender option hidden");
      await page.evaluate(() => document.getElementById("startFace").click());
      await page.waitFor("__sg.faceRunning", 8000);
      assert(await page.evaluate(() => !__SG_SC.nets.includes("ageGenderNet") && __SG_SC.nets.includes("faceExpressionNet")), "nets " + await page.evaluate(() => __SG_SC.nets.join()));
      await page.evaluate(() => document.querySelector("#scPanel .sc-start").click());
      assert(await page.evaluate(() => !__SG_SC.active && /LENSIQ_AGE_GENDER/.test(document.querySelector("#scPanel .sc-live").textContent)), "check not available");
      await page.close();
      // allowed but switched off: not requested until switched on
      const p2 = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}", "try{localStorage.clear();localStorage.setItem('sg-settings',JSON.stringify({useDemo:false}))}catch(e){}"] });
      await p2.goto(url);
      await p2.evaluate(() => document.getElementById("startFace").click());
      await p2.waitFor("__sg.faceRunning", 8000);
      assert(await p2.evaluate(() => !__SG_SC.nets.includes("ageGenderNet") && !document.getElementById("demoOpt").hidden), "option off: not loaded");
      await p2.evaluate(() => { const t = document.getElementById("demoToggle"); t.checked = true; t.dispatchEvent(new Event("change")); });
      // round 12: switching age/gender on first asks the operator to confirm the notice is posted; nothing loads before that
      assert(await p2.evaluate(() => !document.getElementById("sgAck").hidden && !document.getElementById("demoToggle").checked && !__SG_SC.nets.includes("ageGenderNet")), "acknowledgement asked first");
      await p2.evaluate(() => { const b = document.getElementById("sgAck"), cb = b.querySelector(".lq-ack-cb"); cb.checked = true; cb.dispatchEvent(new Event("change")); b.querySelector(".lq-ack-ok").click(); });
      await p2.waitFor("__SG_SC.nets.includes('ageGenderNet')", 4000);
      assert(await p2.evaluate(() => document.getElementById("demoToggle").checked && /^\d{4}-/.test(JSON.parse(localStorage.getItem("sg-settings")).ackAt || "")), "ack time stored");
      assert(await p2.evaluate(() => /สัญญาอนุญาตเพื่อการวิจัย/.test(document.getElementById("ageLicence").textContent) && document.querySelectorAll(".sg-licence[data-lic=expr]").length >= 3), "licence labels");
      await p2.close();
    });

    await check("real models, no WebGL (?cpu): kiosk runs the TF.js hand pipeline on WASM (not MediaPipe/motion), tensors stable", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}"] });
      await page.goto(`${base}/signage.html?cpu`);
      await page.evaluate(() => { document.querySelector("[data-tab=kiosk]").click(); document.getElementById("startHand").click(); });
      await page.waitFor(`/คีออสก์พร้อม|ไม่สำเร็จ|โหมดสำรอง/.test(document.getElementById("engine").textContent)`, 60000);
      const eng = await page.evaluate(() => document.getElementById("engine").textContent);
      assert(/TF\.js WASM/.test(eng), "engine " + eng);
      await sleep(1500);
      const n0 = await page.evaluate(() => faceapi.tf.memory().numTensors);
      await sleep(3000);
      const n1 = await page.evaluate(() => faceapi.tf.memory().numTensors);
      assert(n1 - n0 <= 3, `tensor growth ${n0} -> ${n1}`);
      assert(await page.evaluate(() => /ไม่พบมือ/.test(document.getElementById("gesture").textContent)), "loop ran (no hand in the fake frame)");
      const errs = errorsOf(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });
  } finally { await browser.close(); }
}
