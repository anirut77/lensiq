// tests/e2e/crash-guard.e2e.mjs — crash guard on a camera page (stream B "real-phone quality", 2026-11-13). iOS Safari
// reloads a tab whose page was killed for memory; Chrome's Page.crash kills the renderer the same way (no pagehide, the
// tab's sessionStorage survives) and the test then reloads the tab like Safari does. FIXED TEST written and locked
// (~/LENSIQ-field/evals/phone-quality/locked.sha256) before lensiq-crashguard.js existed.
//   1. while the camera runs, sessionStorage holds "lq-heavy" = "1" (one boolean); stopping the camera clears it;
//   2. a normal reload with the camera on is NOT a crash: no note, full camera size;
//   3. crash + reload: a short note (role=status) in Thai, the page runs light: the camera is asked for <= 640 px wide;
//      the note closes with a >= 44 px button; the marker is consumed (the next normal load has no note);
//   4. the same in English and Chinese (no Thai in the note), and a language switch re-translates the note.
// faceread.html (LQCam, ideal 1280 x 720) with the fake camera; no image is stored or sent.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const NOTE = `(() => { const n = document.querySelector(".lq-crash-note"); if (!n || n.hidden) return null; const b = n.querySelector("button"), r = b && b.getBoundingClientRect();
  return { text: n.textContent, role: n.getAttribute("role"), bw: r ? r.width : 0, bh: r ? r.height : 0 }; })()`;
// the user switches to another app: LQCam pauses the camera (faceread has no stop button)
const HIDE = `(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); })()`;
const lastWidth =`(() => { const q = window.__LQ_FAKE.requests; const v = q[q.length - 1]; return v && v.width ? (v.width.ideal || v.width) : 0; })()`;

async function startCam(page) {
  await page.evaluate(() => document.getElementById("frStartCam").click());
  await page.waitFor(`!!document.querySelector("#frCam.live")`, 10000);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const url = `${base}/faceread.html?cpu&fakedet`;
  const open = async lang => {
    const page = await browser.newPage(null, { initScripts: [fakeCams, `window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`] });
    await page.goto(url);
    await page.waitFor(`!!window.LQCrashGuard && !!window.LQCam`, 8000);
    return page;
  };
  /** kill the renderer (like iOS jetsam) and load the tab again */
  const crashAndReload = async page => {
    await page.send("Page.crash").catch(() => { /* the session may report the crash as an error */ });
    await sleep(500);
    await page.goto(url);
    await page.waitFor(`!!window.LQCrashGuard`, 8000);
  };
  try {
    await check("camera on -> one boolean in sessionStorage; camera off -> cleared", async () => {
      const page = await open("th");
      try {
        await page.evaluate(() => sessionStorage.clear());
        await startCam(page);
        const s = await page.evaluate(() => ({ v: sessionStorage.getItem("lq-heavy"), keys: Object.keys(sessionStorage) }));
        assert(s.v === "1" && s.keys.includes("lq-heavy"), "marker while the camera runs " + JSON.stringify(s));
        await page.evaluate(HIDE);
        await page.waitFor(`sessionStorage.getItem("lq-heavy") === null`, 5000);
      } finally { await page.close(); }
    });

    await check("normal reload with the camera on: no note, full camera size", async () => {
      const page = await open("th");
      try {
        await startCam(page);
        await page.reload();
        await page.waitFor(`!!window.LQCrashGuard`, 8000);
        assert(!(await page.evaluate(NOTE)), "no note after a normal reload");
        assert(await page.evaluate(() => !window.LQCrashGuard.lite), "not light");
        await startCam(page);
        const w = await page.evaluate(lastWidth);
        assert(w === 1280, "full size asked: " + w);
      } finally { await page.close(); }
    });

    await check("crash + reload (TH): note shown, light mode (camera <= 640 px), closes, next load clean", async () => {
      const page = await open("th");
      try {
        await startCam(page);
        await crashAndReload(page);
        const n = await page.evaluate(NOTE);
        assert(n && /เริ่มใหม่/.test(n.text) && /โหมดเบา/.test(n.text) && n.role === "status", "Thai note " + JSON.stringify(n));
        assert(n.bw >= 44 && n.bh >= 44, "close button >= 44 px " + JSON.stringify(n));
        assert(await page.evaluate(() => window.LQCrashGuard.lite && window.LQCrashGuard.recovered), "light mode on");
        await startCam(page);
        const w = await page.evaluate(lastWidth);
        assert(w > 0 && w <= 640, "light camera size asked: " + w);
        await page.evaluate(() => document.querySelector(".lq-crash-note button").click());
        assert(!(await page.evaluate(NOTE)), "note closed");
        await page.evaluate(HIDE); // camera paused
        await page.waitFor(`sessionStorage.getItem("lq-heavy") === null`, 5000);
        await page.goto(url);
        await page.waitFor(`!!window.LQCrashGuard`, 8000);
        assert(!(await page.evaluate(NOTE)) && (await page.evaluate(() => !window.LQCrashGuard.lite)), "next load is clean");
      } finally { await page.close(); }
    });

    for (const [lang, re, word] of [["en", /restarted/i, /lighter mode/i], ["zh", /重新/, /轻量模式/]]) {
      await check(`crash + reload (${lang.toUpperCase()}): note in ${lang}, no Thai`, async () => {
        const page = await open(lang);
        try {
          await startCam(page);
          await crashAndReload(page);
          const n = await page.evaluate(NOTE);
          assert(n && re.test(n.text) && word.test(n.text) && !/[฀-๿]/.test(n.text), `${lang} note ` + JSON.stringify(n));
          await page.evaluate(() => window.LQI18N.setLang("th"));
          await sleep(200);
          const t = await page.evaluate(NOTE);
          assert(t && /โหมดเบา/.test(t.text), "re-translated to Thai on a language switch " + JSON.stringify(t));
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
