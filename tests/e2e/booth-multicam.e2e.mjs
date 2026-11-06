// tests/e2e/booth-multicam.e2e.mjs — booth.html primary + aux cameras (fake cams + ?cpu&fakedet): one shared in-memory
// visitor gallery, so a person seen by two cameras counts once; per-camera zone names and stats; role swap; reload restores
// tiles; capacity fallback to one camera (muteOthers); privacy (no desc in localStorage by default); no overflow at 390/1280.
import { assert, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const errorsOf = page => page.consoleErrors.filter(e => !/fonts\.(googleapis|gstatic)|favicon/.test((e.url || "") + " " + (e.text || "")));
// person 0 stands in front of both cameras (different positions); person 1 only appears on c2 when window.__p1 is set
function script() {
  window.__p1 = false;
  window.__LQ_FAKE_DET = key => {
    if (key === "c1") return [{ x: 0.2, y: 0.25, w: 0.2, h: 0.35, score: 0.95, person: 0 }];
    if (key === "c2") return [{ x: 0.55, y: 0.3, w: 0.18, h: 0.3, score: 0.95, person: 0 }, ...(window.__p1 ? [{ x: 0.1, y: 0.3, w: 0.18, h: 0.3, score: 0.95, person: 1 }] : [])];
    return [];
  };
}
async function overflowAt(page, w, h) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await sleep(400);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, wide: [...document.querySelectorAll("main *")].filter(e => e.getClientRects().length && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest(".table-wrap")).map(e => e.tagName + "." + e.className).slice(0, 4) }));
  await page.send("Emulation.clearDeviceMetricsOverride");
  return r.sw > r.cw ? [`${w}px: ${r.sw} > ${r.cw} ${r.wide.join(", ")}`] : [];
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const url = `${base}/booth.html?cpu&fakedet`;
  const open = async cams => {
    const once = `try{ if(!sessionStorage.getItem("__seeded")){ localStorage.clear(); sessionStorage.setItem("__seeded","1"); } }catch(e){}`;
    const page = await browser.newPage(null, { initScripts: [fakeCams, `window.__LQ_FAKE_CAMS=${JSON.stringify(cams)}`, once] });
    await page.goto(url);
    await page.evaluate(script);
    await page.waitFor(`window.__booth && __booth.ready`, 5000);
    return page;
  };
  try {
    await check("2 cameras share one gallery: the same person on both counts once; a second person on the aux camera adds one", async () => {
      const page = await open({ n: 2, mode: "ok" });
      await page.evaluate(() => document.getElementById("camStart").click());
      await page.waitFor(`__booth.hub.cams.length === 1 && __booth.camera.active && !document.getElementById("addCam").disabled`, 5000);
      await page.evaluate(() => document.getElementById("addCam").click());
      await page.waitFor(`__booth.hub.cams.length === 2 && __booth.hub.cams.every(c => c.status === "live")`, 6000);
      const roles = await page.evaluate(() => __booth.hub.cams.map(c => c.slot + ":" + c.role).join());
      assert(roles === "c1:primary,c2:aux", "roles " + roles);
      assert(await page.evaluate(() => document.querySelectorAll("#camGrid .bt-tile").length === 2 && document.getElementById("camGrid").classList.contains("multi")), "2 tiles");
      // name the aux zone
      await page.evaluate(() => { const i = document.querySelectorAll("#camGrid .cam-name")[1]; i.value = "ทางเข้าบูธ"; i.dispatchEvent(new Event("change")); });
      await page.evaluate(() => document.getElementById("toggle").click());
      await page.waitFor(`__booth.S.visitors.length >= 1 && __booth.S.visitors[0].cams && __booth.S.visitors[0].cams.c1 && __booth.S.visitors[0].cams.c2`, 8000);
      await sleep(1500);
      let r = await page.evaluate(() => ({ n: __booth.S.visitors.length, v: JSON.parse(JSON.stringify(__booth.S.visitors[0])), tl: __booth.S.timeline.at(-1).n, ids: __booth.lastFrame.filter(x => x.id).map(x => x.cam + ":" + x.id) }));
      assert(r.n === 1, "one visitor for one person on two cameras, got " + r.n);
      assert(r.ids.includes("c1:V001") && r.ids.includes("c2:V001"), "both cameras show V001 " + r.ids);
      assert(r.tl === 1, "timeline counts the union (1), got " + r.tl);
      assert(r.v.frames > 0 && r.v.cams.c2.d > 0, "primary frames + aux dwell " + JSON.stringify(r.v.cams));
      await page.evaluate(() => { window.__p1 = true; });
      await page.waitFor(`__booth.S.visitors.length === 2`, 6000);
      await sleep(600);
      r = await page.evaluate(() => ({ n: __booth.S.visitors.length, v2: JSON.parse(JSON.stringify(__booth.S.visitors[1])), tiles: document.getElementById("tiles").textContent, cam: document.getElementById("camStats").textContent, fn: document.getElementById("funnel").textContent }));
      assert(r.n === 2 && !r.v2.cams.c1 && r.v2.cams.c2, "second visitor only on c2 " + JSON.stringify(r.v2.cams));
      assert(r.v2.frames === 0, "aux camera does not count attention/expression frames");
      assert(/ทางเข้าบูธ/.test(r.cam) && /เห็นมากกว่า 1 กล้อง 1 คน/.test(r.cam), "camera stats " + r.cam);
      assert(/ผ่านบูธ/.test(r.fn) && /ร่วมกิจกรรม/.test(r.fn), "funnel " + r.fn);
      // privacy: booth-state never holds descriptors by default; cams entries are numbers only
      await page.evaluate(() => __booth.persist());
      const st = await page.evaluate(() => JSON.parse(localStorage.getItem("booth-state")));
      assert(!("desc" in st) && !("cands" in st), "no desc/cands in booth-state");
      assert(st.visitors.every(v => Object.values(v.cams || {}).every(e => Object.keys(e).sort().join() === "d,f,l" && Object.values(e).every(Number.isFinite))), "cams entries numeric");
      assert(await page.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem("booth-desc")).desc).length === 2), "session gallery has 2");
      // make the aux camera primary from its tile
      await page.evaluate(() => { const s = document.querySelectorAll("#camGrid .cam-role")[1]; s.value = "primary"; s.dispatchEvent(new Event("change")); });
      await page.waitFor(`__booth.hub.cam("c2").role === "primary" && __booth.hub.cam("c1").role === "aux" && __booth.cams[0].slot === "c2"`, 3000);
      const ov = [...await overflowAt(page, 390, 844), ...await overflowAt(page, 1280, 900)];
      assert(!ov.length, "overflow " + ov.join(" | "));
      await privacyScan(page);
      const errs = errorsOf(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      // reload: tiles restored with names and roles; gallery from this tab's session matches the same person again
      await page.reload();
      await page.evaluate(script);
      await page.waitFor(`window.__booth && __booth.ready`, 5000);
      await page.evaluate(() => document.getElementById("camStart").click());
      const t = await page.waitFor(`(() => { const c = __booth.hub.cams; return c.length === 2 && c.every(x => x.status === "live") && c.map(x => x.slot + ":" + x.role + ":" + x.name).join("|"); })()`, 8000);
      assert(/c2:primary:ทางเข้าบูธ/.test(t) && /c1:aux/.test(t), "restored " + t);
      await page.evaluate(() => document.getElementById("toggle").click());
      await sleep(2000);
      assert(await page.evaluate(() => __booth.S.visitors.length) === 2, "same people after reload (session gallery)");
      await page.close();
    });

    await check("capacity fallback (muteOthers): + เพิ่มกล้องเสริม shows the limit; the primary camera keeps counting", async () => {
      const page = await open({ n: 2, mode: "muteOthers" });
      await page.evaluate(() => document.getElementById("camStart").click());
      await page.waitFor(`__booth.hub.cams.length === 1 && __booth.camera.active && !document.getElementById("addCam").disabled`, 5000);
      await page.evaluate(() => document.getElementById("toggle").click());
      await page.evaluate(() => document.getElementById("addCam").click());
      const msg = await page.waitFor(`(() => { const t = document.getElementById("engine").textContent; return /สูงสุด 1 ตัว/.test(t) && t; })()`, 8000);
      assert(/กล้องหลักตัวเดียว/.test(msg), msg);
      await page.waitFor(`__booth.hub.cams.length === 1 && __booth.hub.cams[0].active && !__booth.hub.cams[0].stream.getVideoTracks()[0].muted && document.querySelectorAll("#camGrid .bt-tile").length === 1`, 4000);
      await page.waitFor(`__booth.S.visitors.length >= 1 && __booth.lastFrame.some(r => r.id && r.confirmed)`, 6000);
      assert(await page.evaluate(() => document.getElementById("addCam").disabled === false), "button usable again");
      await privacyScan(page);
      const errs = errorsOf(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });
  } finally { await browser.close(); }
}
