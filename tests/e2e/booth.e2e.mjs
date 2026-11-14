// tests/e2e/booth.e2e.mjs — booth.html: camera only after the button, privacy default (no desc in localStorage),
// tap-a-box join, legacy state load, privacy scan, no overflow at 390 px. Uses ?cpu&fakedet + fake-cams.js.
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
// the face-recognition mode ("จำผู้เข้าชมที่กลับมา") — count-only (no descriptors) is the default since round 4 (DPIA R2)
const REC = `localStorage.setItem("booth-prefs", '{"v":1,"remember":false,"mode":"recognise"}')`;
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
      page = await open(`${base}/booth.html?cpu&fakedet`, REC);
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
      // turning the option ON stores an AES-GCM envelope (lqv-booth-desc), never plaintext desc; OFF removes it again
      await page.evaluate(() => { const c = document.getElementById("remember"); c.checked = true; c.dispatchEvent(new Event("change")); });
      await page.waitFor(() => !!localStorage.getItem("lqv-booth-desc"), 4000);
      const on = await page.evaluate(async () => ({ st: JSON.parse(localStorage.getItem("booth-state")), env: JSON.parse(localStorage.getItem("lqv-booth-desc")), dec: await LQVault.read("lqv-booth-desc") }));
      assert(!("desc" in on.st), "ON -> booth-state still has no desc");
      assert(on.env.enc === "lq1" && on.env.iv && on.env.ct && Object.keys(on.env).length === 3, "ON -> encrypted envelope");
      assert(on.dec.state === "enc" && Object.keys(on.dec.data.desc).length >= 1, "envelope decrypts to today's desc");
      await page.evaluate(() => { const c = document.getElementById("remember"); c.checked = false; c.dispatchEvent(new Event("change")); });
      await page.waitFor(() => !localStorage.getItem("lqv-booth-desc"), 4000);
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
      const p = await open(`${base}/booth.html?cpu&fakedet`, `${REC}; localStorage.setItem("booth-state", ${JSON.stringify(JSON.stringify(legacy))})`);
      await p.waitFor(`window.__booth && __booth.ready`, 5000);
      const r = await p.evaluate(() => ({ st: JSON.parse(localStorage.getItem("booth-state")), name: document.querySelector("#eventForm").name.value, rows: document.querySelectorAll("#visitors tbody tr").length, mem: Object.keys(__booth.S.desc) }));
      assert(r.name === "งานเก่า" && r.rows === 1 && r.st.visitors.length === 1, "loaded " + JSON.stringify({ name: r.name, rows: r.rows }));
      assert(!("desc" in r.st), "desc stripped from localStorage");
      assert(r.mem.join() === "V001", "desc kept in memory for this tab");
      assert(await p.evaluate(() => window.__gum) === 0, "no camera on load");
      assert(!p.consoleErrors.length, "console errors: " + JSON.stringify(p.consoleErrors.slice(0, 3)));
      await p.close();
    });

    await check("legacy plaintext desc with remember ON is migrated to the encrypted vault and survives a new tab", async () => {
      const today = new Date(); const dk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const legacy = { event: { name: "งานจำ", date: dk }, seq: 1, visitors: [{ id: "V001", first: Date.now() - 6e4, last: Date.now() - 6e4, dwell: 7, visits: 1, arrivals: [Date.now() - 6e4], frames: 5, att: 3, emo: [1, 0, 0, 0, 0, 0, 0], vSum: 0, acts: [] }], timeline: [], desc: { V001: Array(128).fill(0.01) }, descDay: dk };
      const seed = `localStorage.clear(); localStorage.setItem("booth-prefs", '{"v":1,"remember":true,"mode":"recognise"}'); localStorage.setItem("booth-state", ${JSON.stringify(JSON.stringify(legacy))})`;
      const p = await open(`${base}/booth.html?cpu&fakedet`, seed);
      await p.waitFor(`window.__booth && __booth.ready && !!localStorage.getItem("lqv-booth-desc")`, 5000);
      const r = await p.evaluate(() => ({ st: JSON.parse(localStorage.getItem("booth-state")), env: JSON.parse(localStorage.getItem("lqv-booth-desc")) }));
      assert(!("desc" in r.st), "plaintext desc removed from booth-state");
      assert(r.env.enc === "lq1" && !JSON.stringify(r.env).includes("0.01"), "envelope only");
      await p.close();
      // a fresh tab (no sessionStorage) restores the remembered visitor from the encrypted copy
      const q = await browser.newPage(null, { initScripts: [fakeCams] });
      await q.goto(`${base}/booth.html?cpu&fakedet`);
      await q.waitFor(`window.__booth && __booth.ready && Object.keys(__booth.S.desc).join() === "V001"`, 5000);
      assert(!q.consoleErrors.length, "console errors: " + JSON.stringify(q.consoleErrors.slice(0, 3)));
      await q.close();
    });

    await check("count-only is the default: no face descriptors anywhere, visitors still counted, notice says so; legacy desc purged", async () => {
      const today = new Date(); const dk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const legacy = { event: { name: "งานนับ", date: dk }, seq: 0, visitors: [], timeline: [], desc: { V009: Array(128).fill(0.02) }, descDay: dk };
      const p = await open(`${base}/booth.html?cpu&fakedet`, `localStorage.clear(); localStorage.setItem("booth-state", ${JSON.stringify(JSON.stringify(legacy))})`);
      await p.waitFor(`window.__booth && __booth.ready`, 5000);
      const r0 = await p.evaluate(() => ({ mode: document.getElementById("boothMode").value, rem: document.getElementById("remember").disabled, notice: document.getElementById("notice").textContent, mem: Object.keys(__booth.S.desc).length }));
      assert(r0.mode === "count" && r0.rem, "count-only default, remember disabled " + JSON.stringify(r0));
      assert(/ไม่สร้างค่าลักษณะใบหน้า/.test(r0.notice), "notice: " + r0.notice);
      assert(r0.mem === 0, "legacy desc purged in count-only mode");
      await p.evaluate(() => document.getElementById("camStart").click());
      await p.waitFor(`__booth.camera.active && __booth.cams.length && __booth.cams[0].video.videoWidth > 0`, 5000);
      await p.evaluate(() => document.getElementById("toggle").click());
      await p.waitFor(`__booth.running && __booth.lastFrame.some(r => r.id && r.confirmed)`, 6000);
      await p.evaluate(() => __booth.persist());
      const r = await p.evaluate(() => ({ n: __booth.S.visitors.length, desc: Object.keys(__booth.S.desc).length, ss: JSON.parse(sessionStorage.getItem("booth-desc")), cands: __booth.S.cands.length }));
      assert(r.n >= 1, "visitor counted without descriptors");
      assert(r.desc === 0 && Object.keys(r.ss.desc).length === 0 && r.cands === 0, "no descriptors stored " + JSON.stringify(r));
      assert(!p.consoleErrors.length, "console errors: " + JSON.stringify(p.consoleErrors.slice(0, 3)));
      await p.close();
    });

    await check("on-site check (round 10): tapped arrivals vs visitors created -> report, export without images, history; health pill; quality flags stored", async () => {
      // a person walks up every 5 s at one of three spots (far apart: a new count-only track each time), stays 2.5 s
      const HOOKS = `window.__sc0 = 0; window.__LQ_FAKE_DET = (key, now) => { if (!window.__sc0 || key !== "c1") return []; const k = Math.floor((now - __sc0) / 5000), ph = (now - __sc0) % 5000;
        return ph < 2500 ? [{ x: [0.05, 0.4, 0.75][k % 3], y: 0.3, w: 0.18, h: 0.3, score: 0.95, person: k }] : []; };`;
      const p = await browser.newPage(null, { initScripts: [fakeCams, "localStorage.clear()", HOOKS] });
      await p.goto(`${base}/booth.html?cpu&fakedet`);
      await p.waitFor(`window.__booth && __booth.ready && document.querySelector("#scPanel .sc-start")`, 8000);
      await p.evaluate(() => document.getElementById("camStart").click());
      await p.waitFor(`__booth.camera.active && __booth.cams.length && __booth.cams[0].video.videoWidth > 0`, 5000);
      await p.evaluate(() => document.getElementById("toggle").click());
      await p.waitFor(`__booth.running`, 3000);
      await p.evaluate(() => document.querySelector("#scPanel .sc-start").click());
      assert(await p.evaluate(() => !!__BT_SC.active && !document.querySelector("#scPanel .sc-taps").hidden), "check started, tap button shown");
      // staff tap 0.3 s after each arrival, 5 arrivals; the 6th period is not tapped (finish before it)
      await p.evaluate(() => { window.__sc0 = Date.now() + 500; for (let k = 0; k < 5; k++) setTimeout(() => __BT_SC.tap(), 500 + k * 5000 + 300); });
      await p.waitFor(`__BT_SC.active && __BT_SC.active.truth.length >= 5 && __BT_SC.active.sys.length >= 5`, 40000);
      await sleep(2000);
      const pill = await p.waitFor(`(() => { const e = document.querySelector("#camGrid .lq-health"); return e && !e.hidden && e.dataset.level != null && e.textContent; })()`, 5000);
      assert(/ภาพ/.test(pill), "health pill: " + pill);
      await p.evaluate(() => { window.__sc0 = 0; document.querySelector("#scPanel .sc-stop").click(); });
      const last = await p.evaluate(() => JSON.parse(JSON.stringify(__BT_SC.last)));
      const n = last.rep.n;
      assert(n.truth === 5 && n.matched >= 4 && n.matched + n.missed === 5 && n.falseCount === n.sys - n.matched, "counts " + JSON.stringify(n));
      assert(["ontrack", "more", "fail"].includes(last.rep.verdict) && last.rep.provisional, "30+ arrivals needed before a confirmed verdict: " + last.rep.verdict);
      const doc = JSON.stringify(last.doc);
      assert(last.doc.format === "lensiq-sitecheck" && last.doc.kind === "booth" && last.doc.truth.length === 5 && !/data:image|base64|blob:|desc/.test(doc), "export: labels + numbers only");
      assert(/ช่วงความเชื่อมั่น/.test(await p.evaluate(() => document.querySelector("#scPanel .sc-report").innerText)), "report rendered");
      const hist = await p.evaluate(() => JSON.parse(localStorage.getItem("booth-sitecheck") || "[]"));
      assert(hist.length === 1 && hist[0].cam === "หน้าบูธ" && hist[0].verdict === last.rep.verdict && !("truth" in hist[0]), "history summary " + JSON.stringify(hist[0]));
      await p.evaluate(() => __booth.persist());
      const q = await p.evaluate(() => JSON.parse(localStorage.getItem("booth-state")).quality);
      const h = Object.values(q || {})[0];
      assert(h && h.n >= 5 && Object.values(h).every(v => typeof v === "number"), "per-hour quality seconds stored with the state: " + JSON.stringify(q));
      const stall = await p.evaluate(() => __booth.cams[0]._hl.state.codes.includes("stalled"));
      assert(!stall, "a live fake camera is not stalled");
      assert(!p.consoleErrors.length, "console errors: " + JSON.stringify(p.consoleErrors.slice(0, 3)));
      // 中文 / English: the check panel is translated
      try {
        for (const lang of ["zh", "en"]) {
          const c = await p.evaluate(async l => { LQI18N.setLang(l); await new Promise(r => setTimeout(r, 1500)); return LQI18N.coverage(document.getElementById("scPanel"), { top: 3 }); }, lang);
          assert(c.pct < 5, `${lang} #scPanel ${c.pct}% Thai — ${c.top.map(x => x.text).join(" | ")}`);
        }
      } finally { await p.evaluate(() => LQI18N.setLang("th")); await p.close(); } // the language choice persists: later checks expect Thai
    });

    await check("390 px wide: no horizontal overflow, no console errors (?cpu, real models + loop)", async () => {
      const p = await browser.newPage(null, { initScripts: [fakeCams, GUM_SPY] });
      await p.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await p.goto(`${base}/booth.html?cpu`);
      // speed pass 2026-11-14: the real models load only once the camera is open (tests/e2e/speed-models.e2e.mjs), so
      // the camera is opened first and the same "models ready" wait follows it (same 30 s, same checks below)
      await p.evaluate(() => document.getElementById("camStart").click());
      await p.waitFor(`(document.querySelector("#camGrid video") || {}).videoWidth > 0`, 5000);
      await p.waitFor(`/โมเดลพร้อม|ไม่พร้อม/.test(document.getElementById("engine").textContent)`, 30000);
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
