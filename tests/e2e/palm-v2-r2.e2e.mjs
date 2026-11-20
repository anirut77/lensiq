// tests/e2e/palm-v2-r2.e2e.mjs — FIXED TEST SET "palm-layers" relock3 (independent review round 1 of palm-v2 FAILED, 2026-11-20),
// locked BEFORE the round-2 product change. palm.html, DRAWN SYNTHETIC hand and textures only.
//  a  an uploaded photo of another person's hand is gated by the same consent line: in "another person's hand" mode the upload
//     control stays disabled until the box is ticked, and the tick is cleared once a photo is used (TH / EN / ZH).
//  c  switch off (shipped default): the page downloads no palm v2 code or style (palm-v2*.js, palm-v2*.css).
//  d  switch on: line finding on a skin-textured synthetic hand does not freeze the page: a 50 ms heartbeat on the main thread
//     never stalls for more than 500 ms between the 7th tap and the list appearing; the detection time is reported.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SYNTH = readFileSync(join(here, "..", "fixtures", "palm-v2", "synth-hand.js"), "utf8");
const TEXT = readFileSync(join(here, "..", "fixtures", "palm-v2", "textures.js"), "utf8");
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TAP_ORDER = ["wrist", "indexBase", "pinkyBase", "indexTip", "middleTip", "ringTip", "pinkyTip"];

async function open(browser, base, { lang = "th", v2 = true } = {}) {
  const init = [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`, SYNTH, TEXT].concat(v2 ? ["window.LENSIQ_PALM_V2 = true;"] : []);
  const page = await browser.newPage(null, { initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/palm.html?cpu`);
  if (v2) await page.waitFor(`!!(window.__palmV2 && window.__palmV2.ready)`, 20000);
  else await page.waitFor(`document.readyState === "complete"`, 10000);
  return page;
}
const click = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error("no " + s); e.scrollIntoView({ block: "center", behavior: "instant" });
  e.click(); return true; }, sel);
async function mouse(page, type, p) { await page.send("Input.dispatchMouseEvent", { type, x: p[0], y: p[1], button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 }); }
const imageUrl = (page, o, tex) => page.evaluate(async (o, tex) => {
  const h = PalmSynth.synthHand(o);
  if (tex) PalmTextures.apply(h, PalmTextures.texture(tex, h.w, h.h, o.seed || 1, h.pw));
  const c = document.createElement("canvas"); c.width = h.w; c.height = h.h; c.getContext("2d").putImageData(new ImageData(h.rgba, h.w, h.h), 0, 0);
  window.__taps = h.taps; return c.toDataURL("image/png");
}, o, tex);

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("a: another person's hand: upload disabled until the consent box is ticked; the tick is cleared after a photo is used (TH / EN / ZH)", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, base, { lang });
        try {
          await click(page, `[data-pv2-mode="other"]`);
          const f0 = await page.evaluate(() => ({ file: document.getElementById("pv2File").disabled, consent: !!document.getElementById("pv2ConsentText").offsetParent }));
          assert(f0.file === true && f0.consent, `${lang}: upload open before consent ${S(f0)}`);
          await click(page, "#pv2Consent");
          await page.waitFor(`!document.getElementById("pv2File").disabled`, 3000);
          const url = await imageUrl(page, { seed: 3, lines: ["heart", "head", "life"] });
          await page.evaluate(u => window.__palmV2.useImage(u), url);
          await sleep(300);
          const f1 = await page.evaluate(() => ({ file: document.getElementById("pv2File").disabled, tick: document.getElementById("pv2Consent").checked }));
          assert(f1.file === true && f1.tick === false, `${lang}: consent not cleared after a photo ${S(f1)}`);
        } finally { await page.close(); }
      }
    });

    await check("c: switch off: no palm v2 code or style is downloaded", async () => {
      const page = await open(browser, base, { v2: false });
      try {
        await sleep(800);
        const v2 = page.requests.map(r => r.url).filter(u => /palm-v2[^/]*\.(js|css)(\?|$)/.test(u));
        assert(v2.length === 0, "palm v2 files downloaded with the switch off: " + v2.join(", "));
        const g = await page.evaluate(() => ({ pv: typeof window.PalmV2, hook: typeof window.__palmV2, hidden: document.getElementById("plV2").hidden }));
        assert(g.pv === "undefined" && g.hook === "undefined" && g.hidden === true, "v2 present with the switch off " + S(g));
      } finally { await page.close(); }
    });

    await check("d: line finding on a skin-textured hand never stalls the main thread > 500 ms; time reported", async () => {
      const page = await open(browser, base, { lang: "th" });
      try {
        const url = await imageUrl(page, { seed: 5, lines: ["heart", "head", "life", "fate"], distract: 0 }, "skin");
        await page.evaluate(u => window.__palmV2.useImage(u), url);
        const taps = await page.evaluate(() => window.__taps);
        for (let i = 0; i < TAP_ORDER.length; i++) {
          if (i === TAP_ORDER.length - 1) await page.evaluate(() => { window.__beats = []; window.__hb = setInterval(() => window.__beats.push(performance.now()), 50); });
          const p = await page.evaluate(q => window.__palmV2.imgToClient(q), taps[TAP_ORDER[i]]);
          await mouse(page, "mousePressed", p); await mouse(page, "mouseReleased", p); await sleep(60);
        }
        await page.waitFor(`document.querySelectorAll("#pv2List [data-line]").length === 10 && !window.__palmV2.busy`, 60000);
        const r = await page.evaluate(() => { clearInterval(window.__hb); const b = window.__beats; let gap = 0; for (let i = 1; i < b.length; i++) gap = Math.max(gap, b[i] - b[i - 1]);
          return { gap: Math.round(gap), beats: b.length, ms: window.__palmV2.lastDetectMs }; });
        console.log("       detection " + r.ms + " ms; longest main-thread stall " + r.gap + " ms over " + r.beats + " beats");
        assert(typeof r.ms === "number" && r.ms > 0, "detection time not reported " + S(r));
        assert(r.beats >= 3 && r.gap <= 500, "main thread stalled " + S(r));
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}
