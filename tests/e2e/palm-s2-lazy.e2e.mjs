// tests/e2e/palm-s2-lazy.e2e.mjs — palm reading, acceptance criterion S2 (docs/acceptance/fortune-pages.md row S), branch palm-90,
// owner inbox entry 18. The page must work when its reading tables (palm-kb.js), its composer (fortune-ai.js) and the hand model
// runtime (vendor/face-api.js) arrive AFTER the camera button is usable. LOCKED (evals-locks/palm-90.sha256, field copy
// ~/LENSIQ-field/evals/palm-90/) BEFORE any product change. Synthetic only: fake cameras, the scripted detector (?fakedet) and a
// photo drawn on a canvas in the page (no picture of a person or a hand is used or stored).
// The two reading files are HELD with the DevTools Fetch domain (paused, then released or failed), so every check runs the
// late-arrival path on purpose, whatever the speed of the machine.
//   E1  TH / EN / ZH, camera path: while both files are held, the page has reached DOMContentLoaded, the camera button is
//       usable and opens the camera (live video) without them; nothing has asked for face-api.js. After release: photo,
//       line editor, "read" gives a reading of >= 3 sections that is not the 4-section fallback (personality, work, money,
//       love), the two-hands tradition list (#plTradition) is filled, each file was requested exactly once, face-api.js never
//       (the scripted detector needs no model), and no uncaught exception was thrown.
//   E2  TH, upload path: a drawn photo is chosen while both files are held; no line editor and no error state appear while
//       they are held; after release the editor appears and "read" gives the reading as in E1.
//   E3  TH / EN / ZH, a file that fails: fortune-ai.js fails to load (palm-kb.js is released); taking a photo ends in the
//       plain load message of the page language (#plEngine, class "err": TH "โหลดข้อมูลคำอ่านไม่สำเร็จ…", EN "The reading data
//       did not load…", ZH "解读资料未能加载…"), with no file name, no reading, nothing aria-busy 3 s later, and the shutter
//       button enabled again.
//   E4  TH, real hand model (no ?fakedet): on a cold load with no action, no face-api.js and no model file is requested
//       (2 s after the load event); choosing a drawn photo then requests face-api.js exactly once and ends, within 90 s, in
//       the line editor or the tap-the-points bar (a drawing may hold no hand), never in the load message; no uncaught exception.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const LOAD_ERR = { th: "โหลดข้อมูลคำอ่านไม่สำเร็จ", en: "The reading data did not load", zh: "解读资料未能加载" };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const LEGACY = "personality,work,money,love";
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const DCL = `document.addEventListener("DOMContentLoaded", () => { window.__dcl = 1; });`;
const langInit = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const CONTROL = `(() => { if (!window.__dcl || !window.LQI18N) return false; const b = document.getElementById("plStartCam");
  if (!b) return false; const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && !b.disabled; })()`;
const isLazy = u => /\/(palm-kb|fortune-ai)\.js(\?|$)/.test(u);
const name = u => (/\/(palm-kb|fortune-ai|face-api)\.js/.exec(u) || [])[1];
const UPLOAD = `(async () => {
  const c = document.createElement("canvas"); c.width = 900; c.height = 1200; const x = c.getContext("2d");
  x.fillStyle = "#e9c4a6"; x.fillRect(0, 0, 900, 1200); x.strokeStyle = "#8a5a44"; x.lineWidth = 6;
  for (const [a, b, d, e] of [[180, 620, 720, 560], [200, 700, 700, 690], [300, 520, 260, 1000]]) { x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo(450, (b + e) / 2 - 60, d, e); x.stroke(); }
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  const dt = new DataTransfer(); dt.items.add(new File([blob], "drawn.png", { type: "image/png" }));
  const f = document.getElementById("plFile"); f.files = dt.files; f.dispatchEvent(new Event("change", { bubbles: true })); return true;
})()`;
const lang = (t, l) => {
  const th = /[฀-๿]/.test(t), la = /[A-Za-z]/.test(t), zh = /[一-鿿]/.test(t);
  if (l === "th") return th ? "" : "no Thai letters";
  if (l === "en") return th ? "has Thai" : la ? "" : "no Latin letters";
  return th ? "has Thai" : zh ? "" : "no Chinese characters";
};

/** open palm.html without waiting for the load event; the two reading files are paused until release() / fail() */
async function open(browser, base, l, { fakedet = true, hold = true, fakeCams } = {}) {
  const page = await browser.newPage(null, { initScripts: [langInit(l), DCL, ...(fakedet ? [fakeCams, detScript] : [])] });
  const held = [];
  page.off = browser.on(m => {
    if (m.sessionId !== page.sessionId || m.method !== "Fetch.requestPaused") return;
    held.push(m.params.requestId);
  });
  page.held = held;
  if (hold) await page.send("Fetch.enable", { patterns: [{ urlPattern: "*palm-kb.js*", requestStage: "Request" }, { urlPattern: "*fortune-ai.js*", requestStage: "Request" }] });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  page.send("Page.navigate", { url: `${base}/palm.html?cpu${fakedet ? "&fakedet" : ""}` }).catch(() => {});
  page.release = async () => { for (const id of held.splice(0)) await page.send("Fetch.continueRequest", { requestId: id }).catch(() => {}); };
  page.settle = async (failRe) => {
    // release everything paused so far, failing the requests whose URL matches failRe
    for (const id of held.splice(0)) {
      const req = page.pausedUrl && page.pausedUrl[id];
      if (failRe && req && failRe.test(req)) await page.send("Fetch.failRequest", { requestId: id, errorReason: "Failed" }).catch(() => {});
      else await page.send("Fetch.continueRequest", { requestId: id }).catch(() => {});
    }
  };
  page.pausedUrl = {};
  const off2 = browser.on(m => { if (m.sessionId === page.sessionId && m.method === "Fetch.requestPaused") page.pausedUrl[m.params.requestId] = m.params.request.url; });
  const close = page.close;
  page.close = async () => { page.off(); off2(); await close(); };
  return page;
}
const exceptions = page => page.consoleErrors.filter(e => e.kind === "exception").map(e => String(e.text).slice(0, 200));
const lazyReqs = page => page.requests.map(r => r.url).filter(u => /\/(palm-kb|fortune-ai|face-api)\.js(\?|$)/.test(u)).map(name);
const count = (a, n) => a.filter(x => x === n).length;

async function readAfterEditor(page) {
  await page.evaluate(() => document.getElementById("plRead").click());
  await page.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3 && !document.getElementById("plNarr").hasAttribute("aria-busy")`, 30000);
  return page.evaluate(() => ({
    ids: (window.__palm.S.narr && window.__palm.S.narr.sections || []).map(s => s.id).join(","),
    secs: document.querySelectorAll("#plNarr .fa-section").length,
    trad: document.querySelectorAll("#plTradition li").length,
    fa: !!window.FortuneAI, kb: !!window.PALM_KB
  }));
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    for (const l of LANGS) {
      await check(`palm S2 E1 (${l}): the camera button works before the reading files arrive; after them the reading is complete`, async () => {
        const page = await open(browser, base, l, { fakeCams });
        try {
          await page.waitFor(CONTROL, 30000);
          await page.waitFor(`document.documentElement.lang === ${JSON.stringify(HTML_LANG[l])}`, 8000);
          const early = await page.evaluate(() => ({ kb: !!window.PALM_KB, fa: !!window.FortuneAI }));
          assert(!early.kb && !early.fa, `${l}: the held files already ran ${JSON.stringify(early)} (hold did not work)`);
          await page.evaluate(() => document.getElementById("plStartCam").click());
          await page.waitFor(`!!document.querySelector("#plCam.live") && [...document.querySelectorAll("#plCam video")].some(v => v.videoWidth > 0)`, 10000);
          assert(!lazyReqs(page).includes("face-api"), `${l}: face-api.js requested before any photo`);
          await page.evaluate(d => { window.__dets = d; }, [HAND]);
          await page.release();
          await page.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok") && !document.getElementById("plSnap").hidden)`, 20000);
          await sleep(600);
          await page.evaluate(() => document.getElementById("plSnap").click());
          await page.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 30000);
          const r = await readAfterEditor(page);
          assert(r.secs >= 3 && r.ids && r.ids !== LEGACY, `${l}: reading not composed by FortuneAI: ${JSON.stringify(r)}`);
          assert(r.fa && r.kb && r.trad > 0, `${l}: files or tradition list missing: ${JSON.stringify(r)}`);
          const q = lazyReqs(page);
          assert(count(q, "palm-kb") === 1 && count(q, "fortune-ai") === 1 && count(q, "face-api") === 0, `${l}: requests ${q.join(", ")}`);
          const ex = exceptions(page);
          assert(!ex.length, `${l}: uncaught exceptions: ${ex.join(" | ")}`);
        } finally { await page.close(); }
      });
    }

    await check("palm S2 E2 (th): a photo chosen before the reading files arrive waits for them, then the editor and the reading follow", async () => {
      const page = await open(browser, base, "th", { fakeCams });
      try {
        await page.waitFor(CONTROL, 30000);
        await page.evaluate(d => { window.__dets = d; }, [HAND]);
        await page.evaluate(UPLOAD);
        await sleep(1500);
        const mid = await page.evaluate(() => ({ edit: !document.getElementById("plEdit").hidden, err: document.getElementById("plEngine").classList.contains("err"), kb: !!window.PALM_KB }));
        assert(!mid.kb && !mid.edit && !mid.err, `editor or error while the files are held: ${JSON.stringify(mid)}`);
        await page.release();
        await page.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 30000);
        const r = await readAfterEditor(page);
        assert(r.secs >= 3 && r.ids && r.ids !== LEGACY && r.trad > 0, `reading: ${JSON.stringify(r)}`);
        const ex = exceptions(page);
        assert(!ex.length, `uncaught exceptions: ${ex.join(" | ")}`);
      } finally { await page.close(); }
    });

    for (const l of LANGS) {
      await check(`palm S2 E3 (${l}): fortune-ai.js fails to load: a plain message in the page language, no reading, nothing busy`, async () => {
        const page = await open(browser, base, l, { fakeCams });
        try {
          await page.waitFor(CONTROL, 30000);
          await page.waitFor(`document.documentElement.lang === ${JSON.stringify(HTML_LANG[l])}`, 8000);
          await page.settle(/fortune-ai\.js/);
          await page.evaluate(() => document.getElementById("plStartCam").click());
          await page.waitFor(`!!document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
          await page.evaluate(d => { window.__dets = d; }, [HAND]);
          await sleep(800);
          await page.settle(/fortune-ai\.js/);
          await page.evaluate(() => document.getElementById("plSnap").click());
          // a retry asks for fortune-ai.js again: every new request for it fails too, until the message shows (30 s)
          const end = Date.now() + 30000;
          for (;;) {
            await page.settle(/fortune-ai\.js/);
            const shown = await page.evaluate(`document.getElementById("plEngine").classList.contains("err") && document.getElementById("plEngine").textContent.trim().length > 0`);
            if (shown) break;
            assert(Date.now() < end, `${l}: no error message within 30 s`);
            await sleep(300);
          }
          await sleep(3000);
          const f = await page.evaluate(() => ({ msg: document.getElementById("plEngine").textContent.trim(), result: !document.getElementById("plResult").hidden,
            secs: document.querySelectorAll("#plNarr .fa-section").length, busy: [...document.querySelectorAll('[aria-busy="true"]')].map(e => e.id || e.className),
            snap: !document.getElementById("plSnap").disabled }));
          assert(f.msg.indexOf(LOAD_ERR[l]) >= 0, `${l}: message "${f.msg}" is not the load message`);
          assert(!lang(f.msg, l), `${l}: message "${f.msg}" ${lang(f.msg, l)}`);
          assert(!/\.js\b|fortune-ai|palm-kb/i.test(f.msg), `${l}: file name in the message "${f.msg}"`);
          assert(!f.result && !f.secs, `${l}: a reading is shown although its composer did not load`);
          assert(!f.busy.length, `${l}: still busy: ${f.busy.join(", ")}`);
          assert(f.snap, `${l}: the shutter button stays disabled`);
        } finally { await page.close(); }
      });
    }

    await check("palm S2 E4 (th): real hand model: nothing heavy before an action; a chosen photo loads face-api.js once and ends in the editor or the tap bar", async () => {
      const page = await open(browser, base, "th", { fakedet: false, hold: false, fakeCams });
      try {
        await page.waitFor(`document.readyState === "complete"`, 60000);
        await sleep(2000);
        const before = page.requests.map(r => r.url);
        assert(!before.some(u => /face-api\.js/.test(u)), "face-api.js requested on a cold load with no action");
        assert(!before.some(u => /\/vendor\/models\//.test(u) || /model\.json|-shard\d/.test(u)), "a model file requested on a cold load with no action");
        await page.evaluate(UPLOAD);
        await page.waitFor(`!document.getElementById("plEdit").hidden || !document.getElementById("plTapBar").hidden || (document.getElementById("plEngine").classList.contains("err") && !window.__palm.S.busy)`, 90000);
        const f = await page.evaluate(() => ({ edit: !document.getElementById("plEdit").hidden, tap: !document.getElementById("plTapBar").hidden, msg: document.getElementById("plEngine").textContent.trim() }));
        assert(f.msg.indexOf(LOAD_ERR.th) < 0, `load message on the real model path: "${f.msg}"`);
        assert(f.edit || f.tap, `neither the editor nor the tap bar: ${JSON.stringify(f)}`);
        const q = lazyReqs(page);
        assert(count(q, "face-api") === 1, `face-api.js requests: ${count(q, "face-api")}`);
        const ex = exceptions(page);
        assert(!ex.length, `uncaught exceptions: ${ex.join(" | ")}`);
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}
