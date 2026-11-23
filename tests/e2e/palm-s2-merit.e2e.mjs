// tests/e2e/palm-s2-merit.e2e.mjs — palm S2 review finding 1 (independent review of palm-90, 2026-11-24): palm.js loaded its
// reading files (palm-kb.js, fortune-ai.js) as ordered dynamic scripts (async = false), so they waited behind the three Merit
// files nav.js adds the same way; Merit held for 12 s left the page on its loading line. LOCKED (evals-locks/palm-90.sha256,
// field copy ~/LENSIQ-field/evals/palm-90/r1/) BEFORE the product fix. Synthetic: fake camera + scripted detector (?fakedet).
//   M1  TH: every Merit file (lensiq-merit-core.js, lensiq-merit-lint.js, lensiq-merit.js) and the report file (lensiq-report.js)
//       is held (DevTools Fetch, paused) for the whole check. Within 10 s of DOMContentLoaded, window.PALM_KB and
//       window.FortuneAI exist and the status line is ready (#plEngine class "ok"); a photo then gives the line editor and
//       "read" gives a reading of >= 3 sections — all while the Merit and report files are still held (none of them has run).
//   M2  palm.js (code, comments stripped): the dynamic script tag made by lazyLoad() is not ordered: it sets async = true
//       (never async = false), so a reading file never waits for another page's ordered scripts.
//   M3  the crisis scripts stay parser-run in their order (fortune-straight < fortune-read < lensiq-helpline < fortune-crisis
//       < palm.js) and are not loaded by palm.js.
import { readFileSync } from "node:fs";
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const DCL = `document.addEventListener("DOMContentLoaded", () => { window.__dclAt = performance.now(); });`;
const HELD = /\/(lensiq-merit-core|lensiq-merit-lint|lensiq-merit|lensiq-report)\.js(\?|$)/;
const ROOT = new URL("../../", import.meta.url);
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

export default async function ({ base, launch, check, fakeCams }) {
  await check("palm S2 M2/M3: lazyLoad() scripts are not ordered (async = true); crisis scripts parser-run, in order", async () => {
    const js = code(readFileSync(new URL("palm.js", ROOT), "utf8")), html = readFileSync(new URL("palm.html", ROOT), "utf8");
    const ll = js.slice(js.indexOf("function lazyLoad"), js.indexOf("function lazyLoad") + 1200);
    assert(/\.async\s*=\s*true/.test(ll) && !/\.async\s*=\s*false/.test(ll), "lazyLoad() must set async = true and never async = false");
    const order = ["fortune-straight.js", "fortune-read.js", "lensiq-helpline.js", "fortune-crisis.js", "palm.js"];
    const at = order.map(f => html.indexOf(`<script src="${f}?`));
    assert(at.every(i => i > 0) && at.every((x, i) => !i || x > at[i - 1]), "crisis order: " + at.join(","));
    for (const f of order.slice(0, 4)) assert(!js.includes(`"${f}`), "palm.js loads " + f);
  });

  const browser = await launch();
  try {
    await check("palm S2 M1 (th): Merit and report held: the reading files still load, the page is ready, a reading is given", async () => {
      const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`, DCL, fakeCams, detScript] });
      const held = [];
      const off = browser.on(m => { if (m.sessionId === page.sessionId && m.method === "Fetch.requestPaused") held.push(m.params); });
      try {
        await page.send("Fetch.enable", { patterns: [{ urlPattern: "*lensiq-merit*", requestStage: "Request" }, { urlPattern: "*lensiq-report.js*", requestStage: "Request" }] });
        await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        page.send("Page.navigate", { url: `${base}/palm.html?cpu&fakedet` }).catch(() => {});
        await page.waitFor(`typeof window.__dclAt === "number"`, 30000);
        const t0 = Date.now();
        await page.waitFor(`!!(window.PALM_KB && window.FortuneAI && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
        const waited = Date.now() - t0;
        assert(held.some(h => HELD.test(h.request.url)), "no Merit / report request was held (the check would test nothing)");
        await page.evaluate(() => document.getElementById("plStartCam").click());
        await page.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
        await page.evaluate(d => { window.__dets = d; }, [HAND]);
        await sleep(600);
        await page.evaluate(() => document.getElementById("plSnap").click());
        await page.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
        await page.evaluate(() => document.getElementById("plRead").click());
        await page.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3`, 20000);
        const ran = await page.evaluate(() => ({ merit: !!window.LQMerit, report: !!window.LQReport }));
        assert(!ran.merit && !ran.report, "a held file has run: " + JSON.stringify(ran));
        console.log(`    reading files ready ${waited} ms after DOMContentLoaded with Merit / report held`);
      } finally {
        off();
        for (const h of held) await page.send("Fetch.continueRequest", { requestId: h.requestId }).catch(() => {});
        await page.close();
      }
    });
  } finally { await browser.close(); }
}
