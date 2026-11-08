// tests/e2e/luckycolor.e2e.mjs — luckycolor.html (fake camera = solid red frame + ?fakeseg mask below a fake face box):
// dominant colour red; Thursday + money = today's main colour (3 stars); Monday = a "good base" with an accent (no negative
// wording); goal/day remembered (prefs only, no image); stop camera; phone widths 320/360/390; en/zh with no Thai left;
// the real engine (no ?fakeseg) reaches a ready state with no console errors; privacy scan.
import { assert, privacyScan } from "./cdp.mjs";
import { mobileCheck, noErrors, sleep } from "./zones-lib.mjs";

const NEG = /กาลกิณี|ควรเลี่ยง|ห้ามใส่|ซวย|โชคร้าย|avoid|bad luck|unlucky|不吉|避免|倒霉/i;

async function open(browser, base, fakeCams, query = "?cpu&fakeseg", prefs = null) {
  const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}"] });
  await page.goto(`${base}/luckycolor.html${query}`);
  await page.evaluate(p => { localStorage.clear(); if (p) localStorage.setItem("lqlc-prefs", JSON.stringify(p)); }, prefs);
  await page.reload();
  return page;
}
const startCam = page => page.evaluate(() => document.getElementById("startCam").click());

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("fake mirror: red outfit, Thursday money = main colour, Monday = good base + accent, prefs only", async () => {
      const page = await open(browser, base, fakeCams, "?cpu&fakeseg", { v: 1, goal: "money", day: "4" });
      const pre = await page.evaluate(() => ({ goal: document.querySelector(".lc-goal[aria-pressed=true]").dataset.goal, day: document.getElementById("daySel").value,
        rec: document.getElementById("recBox").textContent, rows: document.querySelectorAll("#week tbody tr").length, today: document.querySelectorAll("#week tr.is-today").length }));
      assert(pre.goal === "money" && pre.day === "4" && /แดง/.test(pre.rec) && pre.rows === 7 && pre.today === 1, JSON.stringify(pre));
      await startCam(page);
      await page.waitFor(`window.__LQLC && __LQLC.st.list.length && __LQLC.st.list[0].family === "red" && document.getElementById("match").dataset.level === "3"`, 15000);
      const r = await page.evaluate(() => ({ eng: document.getElementById("engine").textContent, msg: document.getElementById("match").textContent,
        sw: [...document.querySelectorAll("#swatches li")].map(l => l.dataset.family), stop: document.getElementById("stopCam").disabled }));
      assert(/โหมดทดสอบ/.test(r.eng) && /เยี่ยม/.test(r.msg) && r.sw[0] === "red" && !r.stop, JSON.stringify(r));
      // Monday: red is not among Monday's supporting colours -> positive "base colour" + an accent suggestion
      await page.evaluate(() => { const s = document.getElementById("daySel"); s.value = "1"; s.dispatchEvent(new Event("change", { bubbles: true })); });
      await sleep(300);
      const mon = await page.evaluate(() => ({ lv: document.getElementById("match").dataset.level, msg: document.getElementById("match").textContent }));
      assert(mon.lv === "0" && /สีพื้น/.test(mon.msg) && /ลองเติมสี/.test(mon.msg) && !NEG.test(mon.msg), JSON.stringify(mon));
      // every goal x day combination for the red frame: never a negative word
      const all = await page.evaluate(async () => {
        const out = [];
        for (const g of ["work", "money", "love", "support"]) {
          document.querySelector(`.lc-goal[data-goal="${g}"]`).click();
          for (let d = 0; d < 7; d++) {
            const s = document.getElementById("daySel"); s.value = String(d); s.dispatchEvent(new Event("change", { bubbles: true }));
            out.push(document.getElementById("match").textContent);
          }
        }
        return out;
      });
      assert(all.length === 28 && all.every(t => t && !/กาลกิณี|ควรเลี่ยง|ซวย|โชคร้าย/.test(t)), "negative wording: " + all.find(t => /กาลกิณี|ควรเลี่ยง|ซวย|โชคร้าย/.test(t)));
      await page.evaluate(() => document.getElementById("stopCam").click());
      const off = await page.evaluate(() => ({ eng: document.getElementById("engine").textContent,
        live: !!(document.getElementById("video").srcObject && document.getElementById("video").srcObject.active),
        keys: Object.keys(localStorage), prefs: localStorage.getItem("lqlc-prefs") }));
      assert(/ปิดกล้องแล้ว/.test(off.eng) && !off.live, JSON.stringify(off));
      assert(off.keys.filter(k => k.startsWith("lqlc")).join() === "lqlc-prefs" && /"goal":"support"/.test(off.prefs) && off.prefs.length < 80, JSON.stringify(off));
      await privacyScan(page);
      noErrors(page);
      await page.close();
    });

    await check("clothes not visible -> friendly hint; clear prefs", async () => {
      const page = await open(browser, base, fakeCams);
      await page.evaluate(() => { window.__LQ_FAKE_SEG = () => ({ face: { x0: 0.4, y0: 0.1, x1: 0.6, y1: 0.3 }, region: null }); });
      await startCam(page);
      await page.waitFor(`/ถอยออกจากกล้อง/.test(document.getElementById("match").textContent)`, 10000);
      await page.evaluate(() => { document.querySelector('.lc-goal[data-goal="love"]').click(); document.getElementById("clearPrefs").click(); });
      const r = await page.evaluate(() => ({ p: localStorage.getItem("lqlc-prefs"), goal: document.querySelector(".lc-goal[aria-pressed=true]").dataset.goal,
        msg: document.getElementById("clearMsg").textContent }));
      assert(r.p === null && r.goal === "work" && /ลบค่าที่จำไว้แล้ว/.test(r.msg), JSON.stringify(r));
      await page.evaluate(() => document.getElementById("stopCam").click());
      noErrors(page);
      await page.close();
    });

    await check("phone widths 320/360/390 while the mirror runs: no overflow, 44 px targets, text >= 12 px", async () => {
      const page = await open(browser, base, fakeCams);
      await startCam(page);
      await page.waitFor(`window.__LQLC && __LQLC.st.list.length > 0`, 15000);
      await mobileCheck(page);
      await page.send("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 2, mobile: true });
      await sleep(300);
      const tiny = await page.evaluate(() => [...document.querySelectorAll("main *")].filter(e => {
        if (!e.childNodes.length || ![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return false;
        const b = e.getBoundingClientRect(); return b.width && parseFloat(getComputedStyle(e).fontSize) < 11.9;
      }).map(e => e.className + ":" + getComputedStyle(e).fontSize).slice(0, 5));
      assert(!tiny.length, "text < 12px: " + tiny.join(", "));
      await page.send("Emulation.clearDeviceMetricsOverride");
      await page.evaluate(() => document.getElementById("stopCam").click());
      noErrors(page);
      await page.close();
    });

    for (const lang of ["en", "zh"]) {
      await check(`${lang}: no Thai left in <main> or <title> after a mirror run`, async () => {
        const page = await open(browser, base, fakeCams, `?cpu&fakeseg&lang=${lang}`, { v: 1, goal: "money", day: "4" });
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await startCam(page);
        await page.waitFor(`document.getElementById("match").dataset.level === "3"`, 15000);
        await sleep(400);
        const thai = await page.evaluate(() => {
          const out = [], walk = document.createTreeWalker(document.querySelector("main"), NodeFilter.SHOW_TEXT);
          for (let n; (n = walk.nextNode());) if (!n.parentElement.closest("[hidden],[lang=th]") && /[ก-๛]/.test(n.textContent)) out.push(n.textContent.trim().slice(0, 40));
          for (const el of document.querySelectorAll("main [aria-label]")) if (/[ก-๛]/.test(el.getAttribute("aria-label"))) out.push("@" + el.getAttribute("aria-label").slice(0, 40));
          if (/[ก-๛]/.test(document.title)) out.push("title");
          return out;
        });
        assert(!thai.length, `${lang} Thai left: ` + JSON.stringify(thai.slice(0, 6)));
        const msg = await page.evaluate(() => document.getElementById("match").textContent);
        assert(!NEG.test(msg) && (lang === "en" ? /Great!/.test(msg) : /太好了/.test(msg)), msg);
        await page.evaluate(() => document.getElementById("stopCam").click());
        noErrors(page);
        await page.close();
      });
    }

    await check("real engine (no ?fakeseg): on-device segmenter or frame mode becomes ready, no errors, no /api", async () => {
      const page = await open(browser, base, fakeCams, "?cpu");
      await startCam(page);
      const eng = await page.waitFor(`(() => { const e = window.__LQLC && __LQLC.st.engine; return e && e !== "loading" ? e : false; })()`, 90000);
      assert(eng === "multi" || eng === "guide" || eng === "person", eng);
      await sleep(2500);
      await page.evaluate(() => document.getElementById("stopCam").click());
      await privacyScan(page);
      noErrors(page);
      await page.close();
    });
  } finally {
    await browser.close();
  }
}
