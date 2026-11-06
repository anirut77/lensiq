// tests/e2e/booth.e2e.mjs — booth.html: camera only after the button, privacy default (no desc in localStorage),
// tap-a-box join, legacy state load, privacy scan, no overflow at 390 px. Uses ?cpu&fakedet + fake-cams.js.
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
// counts getUserMedia calls (installed after fake-cams.js, wraps its fake)
const GUM_SPY = `(() => { const md = navigator.mediaDevices; if (!md) return; window.__gum = 0; const o = md.getUserMedia.bind(md); md.getUserMedia = c => { window.__gum++; return o(c); }; })();`;

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const open = async (url, seed) => {
    const page = await browser.newPage(null, { initScripts: [fakeCams, GUM_SPY, seed ? `try{ if(!sessionStorage.getItem("__seeded")){ ${seed}; sessionStorage.setItem("__seeded","1"); } }catch(e){}` : ""].filter(Boolean) });
    await page.goto(url);
    return page;
  };
  try {
    let page;
    await check("no getUserMedia before the เริ่มกล้อง click; no WebGL; no console errors on load", async () => {
      page = await open(`${base}/booth.html?cpu&fakedet`);
      await assertNoWebGL(page);
      await page.waitFor(`window.__booth && __booth.ready`, 5000);
      await sleep(800);
      assert(await page.evaluate(() => window.__gum) === 0, "getUserMedia called before click");
      assert(await page.evaluate(() => !__booth.camera.active), "camera inactive before click");
      await page.evaluate(() => document.getElementById("camStart").click());
      await page.waitFor(`__booth.camera.active && __booth.cams.length && __booth.cams[0].video.videoWidth > 0`, 5000);
      assert(await page.evaluate(() => window.__gum) >= 1, "getUserMedia after click");
      assert(await page.evaluate(() => document.getElementById("camStart").textContent) === "ปิดกล้อง", "button flips to ปิดกล้อง");
      assert(!page.consoleErrors.length, "console errors: " + JSON.stringify(page.consoleErrors.slice(0, 3)));
    });

    await check("counting: fake face becomes a confirmed visitor; timeline counts it", async () => {
      await page.evaluate(() => document.getElementById("toggle").click());
      await page.waitFor(`__booth.running && __booth.lastFrame.some(r => r.id && r.confirmed)`, 6000);
      const tl = await page.evaluate(() => __booth.S.timeline.at(-1).n);
      assert(tl >= 1, "timeline n " + tl);
    });

    await check("default setting: booth-state has no desc after persist (sessionStorage holds it)", async () => {
      await page.evaluate(() => __booth.persist());
      const r = await page.evaluate(() => ({ st: JSON.parse(localStorage.getItem("booth-state")), ss: JSON.parse(sessionStorage.getItem("booth-desc")), cb: document.getElementById("remember").checked }));
      assert(r.cb === false, "remember default OFF");
      assert(r.st && !("desc" in r.st) && !("cands" in r.st), "booth-state keys " + Object.keys(r.st || {}));
      assert(r.st.visitors.length >= 1, "visitors persisted");
      assert(r.ss && Object.keys(r.ss.desc).length >= 1, "session desc");
      // turning the option ON puts desc in booth-state; OFF strips it again
      await page.evaluate(() => { const c = document.getElementById("remember"); c.checked = true; c.dispatchEvent(new Event("change")); });
      assert(await page.evaluate(() => "desc" in JSON.parse(localStorage.getItem("booth-state")) && !sessionStorage.getItem("booth-desc")), "ON -> desc in localStorage");
      await page.evaluate(() => { const c = document.getElementById("remember"); c.checked = false; c.dispatchEvent(new Event("change")); });
      assert(await page.evaluate(() => !("desc" in JSON.parse(localStorage.getItem("booth-state")))), "OFF -> stripped");
    });

    await check("clicking a box on the overlay marks that visitor as joined", async () => {
      await page.evaluate(() => { document.getElementById("activity").value = "ทดลองแตะ"; __booth.overlay.scrollIntoView({ block: "center" }); });
      let done = false;
      for (let attempt = 0; attempt < 5 && !done; attempt++) {
        const pt = await page.waitFor(`(() => { const f = __booth.lastFrame.find(r => r.id); if (!f) return null; const o = __booth.overlay.getBoundingClientRect(); let cx = f.box.x + f.box.w / 2; if (__booth.camera.mirrored) cx = 1 - cx; return { id: f.id, x: o.left + cx * o.width, y: o.top + (f.box.y + f.box.h / 2) * o.height }; })()`, 5000);
        for (const type of ["mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, x: pt.x, y: pt.y, button: "left", clickCount: 1 });
        await sleep(100);
        done = await page.evaluate(() => __booth.S.visitors.some(v => v.acts.includes("ทดลองแตะ")));
      }
      assert(done, "a visitor got the activity");
      const msg = await page.evaluate(() => document.getElementById("joinMsg").textContent);
      assert(/บันทึก V\d+ เข้าร่วม "ทดลองแตะ"/.test(msg), "message " + msg);
      assert(await page.evaluate(() => !("desc" in JSON.parse(localStorage.getItem("booth-state")))), "still no desc after join persist");
    });

    await check("privacy scan + no console errors", async () => {
      await privacyScan(page);
      assert(!page.consoleErrors.length, "console errors: " + JSON.stringify(page.consoleErrors.slice(0, 3)));
      await page.close();
    });

    await check("legacy booth-state with desc loads; desc moved out of localStorage when the option is off", async () => {
      const today = new Date(); const dk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const legacy = { event: { name: "งานเก่า", date: dk }, seq: 1, visitors: [{ id: "V001", first: Date.now() - 6e4, last: Date.now() - 6e4, dwell: 7, visits: 1, arrivals: [Date.now() - 6e4], frames: 5, att: 3, emo: [1, 0, 0, 0, 0, 0, 0], vSum: 0, acts: [] }], timeline: [], desc: { V001: Array(128).fill(0.01) }, descDay: dk };
      const p = await open(`${base}/booth.html?cpu&fakedet`, `localStorage.setItem("booth-state", ${JSON.stringify(JSON.stringify(legacy))})`);
      await p.waitFor(`window.__booth && __booth.ready`, 5000);
      const r = await p.evaluate(() => ({ st: JSON.parse(localStorage.getItem("booth-state")), name: document.querySelector("#eventForm").name.value, rows: document.querySelectorAll("#visitors tbody tr").length, mem: Object.keys(__booth.S.desc) }));
      assert(r.name === "งานเก่า" && r.rows === 1 && r.st.visitors.length === 1, "loaded " + JSON.stringify({ name: r.name, rows: r.rows }));
      assert(!("desc" in r.st), "desc stripped from localStorage");
      assert(r.mem.join() === "V001", "desc kept in memory for this tab");
      assert(await p.evaluate(() => window.__gum) === 0, "no camera on load");
      assert(!p.consoleErrors.length, "console errors: " + JSON.stringify(p.consoleErrors.slice(0, 3)));
      await p.close();
    });

    await check("390 px wide: no horizontal overflow, no console errors (?cpu, real models + loop)", async () => {
      const p = await browser.newPage(null, { initScripts: [fakeCams, GUM_SPY] });
      await p.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await p.goto(`${base}/booth.html?cpu`);
      await p.waitFor(`/โมเดลพร้อม|ไม่พร้อม/.test(document.getElementById("engine").textContent)`, 30000);
      await p.evaluate(() => document.getElementById("camStart").click());
      await p.waitFor(`(document.querySelector("#camGrid video") || {}).videoWidth > 0`, 5000);
      await p.evaluate(() => document.getElementById("toggle").click()); // real face-api pipeline on the fake stream
      await sleep(2500);
      const fps = await p.evaluate(() => document.getElementById("fps").textContent);
      assert(/คนในกล้อง/.test(fps), "loop ran: " + fps);
      const r = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, eng: document.getElementById("engine").textContent, wide: [...document.querySelectorAll("main *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest(".table-wrap")).map(e => e.tagName + "." + e.className).slice(0, 5) }));
      assert(/กล้องพร้อม|โมเดลพร้อม/.test(r.eng), "engine: " + r.eng);
      assert(await p.evaluate(() => faceapi.tf.getBackend()) === "wasm", "wasm backend");
      assert(r.sw <= r.cw, `overflow ${r.sw} > ${r.cw}: ${r.wide.join(", ")}`);
      assert(!p.consoleErrors.length, "console errors: " + JSON.stringify(p.consoleErrors.slice(0, 3)));
      await p.close();
    });
  } finally { await browser.close(); }
}
