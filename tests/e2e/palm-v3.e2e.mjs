// tests/e2e/palm-v3.e2e.mjs — FIXED TEST SET "palm-v3-lines" relock1 (palm v3 majors, owner order 2026-11-20 evening), locked
// BEFORE the majors-finish change. palm.html with LENSIQ_PALM_V2 = true AND LENSIQ_PALM_V3_LINES = true; DRAWN SYNTHETIC hands only
// (tests/fixtures/palm-v2/synth-hand.js, textures.js, tests/fixtures/palm-v3/synth-real.js); no photo of any person.
//  a  sub-switch off (V2 on, V3 not set): palm-v3-lines.js is not downloaded and the v2 finder answers.
//  b  sub-switch on, realistic shallow creases (synth-real): the v3 finder answers (from the Web Worker); at least two of heart /
//     head / life are found; every found line is drawn solid on the screen layer; the main thread never stalls > 500 ms.
//  c  sub-switch on, crease-free texture (synth-real texture alone): no line is found; heart, head and life carry the
//     "not clear in this photo" note in the list (TH / EN / ZH).
//  d  nothing leaves the device: every request during the run goes to the page's own origin.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = [join("palm-v2", "synth-hand.js"), join("palm-v2", "textures.js"), join("palm-v3", "synth-real.js")].map(f => readFileSync(join(here, "..", "fixtures", f), "utf8"));
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TAP_ORDER = ["wrist", "indexBase", "pinkyBase", "indexTip", "middleTip", "ringTip", "pinkyTip"];
const UNCLEAR = { th: "ไม่ชัดในภาพนี้", en: "Not clear in this photo", zh: "此照片中不清楚" };

async function open(browser, base, { lang = "th", v3 = true } = {}) {
  const init = [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`].concat(FIX, ["window.LENSIQ_PALM_V2 = true;"], v3 ? ["window.LENSIQ_PALM_V3_LINES = true;"] : []);
  const page = await browser.newPage(null, { initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/palm.html?cpu`);
  await page.waitFor(`!!(window.__palmV2 && window.__palmV2.ready)`, 20000);
  return page;
}
async function mouse(page, type, p) { await page.send("Input.dispatchMouseEvent", { type, x: p[0], y: p[1], button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 }); }
const imageUrl = (page, o) => page.evaluate(async o => {
  const h = PalmSynthReal.synthReal(o);
  const c = document.createElement("canvas"); c.width = h.w; c.height = h.h; c.getContext("2d").putImageData(new ImageData(h.rgba, h.w, h.h), 0, 0);
  window.__taps = h.taps; return c.toDataURL("image/png");
}, o);
/** load a synthetic photo, tap the 7 points, wait for the list; returns the main-thread longest stall */
async function findLines(page, o) {
  const url = await imageUrl(page, o);
  await page.evaluate(u => window.__palmV2.useImage(u), url);
  const taps = await page.evaluate(() => window.__taps);
  for (let i = 0; i < TAP_ORDER.length; i++) {
    if (i === TAP_ORDER.length - 1) await page.evaluate(() => { window.__beats = []; window.__hb = setInterval(() => window.__beats.push(performance.now()), 50); });
    const p = await page.evaluate(q => window.__palmV2.imgToClient(q), taps[TAP_ORDER[i]]);
    await mouse(page, "mousePressed", p); await mouse(page, "mouseReleased", p); await sleep(60);
  }
  await page.waitFor(`document.querySelectorAll("#pv2List [data-line]").length === 10 && !window.__palmV2.busy && !!window.__palmV2.finder`, 90000);
  return page.evaluate(() => { clearInterval(window.__hb); const b = window.__beats; let gap = 0; for (let i = 1; i < b.length; i++) gap = Math.max(gap, b[i] - b[i - 1]);
    return { gap: Math.round(gap), beats: b.length, ms: window.__palmV2.lastDetectMs, finder: window.__palmV2.finder, lines: window.__palmV2.state().lines }; });
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("a: sub-switch off: palm-v3-lines.js not downloaded, the v2 finder answers", async () => {
      const page = await open(browser, base, { v3: false });
      try {
        const r = await findLines(page, { seed: 71, side: "right" });
        const v3 = page.requests.map(q => q.url).filter(u => /palm-v3-lines\.js/.test(u));
        assert(v3.length === 0, "palm-v3-lines.js downloaded with the sub-switch off: " + v3.join(", "));
        assert(r.finder === "v2", "finder with the sub-switch off: " + r.finder);
      } finally { await page.close(); }
    });

    await check("b: sub-switch on, realistic creases: v3 answers, >= 2 of heart / head / life found and drawn solid, no stall > 500 ms", async () => {
      const page = await open(browser, base, { v3: true });
      try {
        const r = await findLines(page, { seed: 72, side: "left" });
        console.log("       v3 detection " + r.ms + " ms; longest main-thread stall " + r.gap + " ms over " + r.beats + " beats");
        assert(r.finder === "v3", "finder with the sub-switch on: " + r.finder);
        const found = ["heart", "head", "life"].filter(id => r.lines[id].status === "found");
        assert(found.length >= 2, "majors found " + S(found));
        const lay = await page.evaluate(() => window.__palmV2.layout());
        for (const id of found) { const L = lay.lines.find(l => l.id === id); assert(L && L.px && L.px.length > 1 && L.status === "found", `${id} not drawn ${S(L)}`); }
        assert(r.beats >= 3 && r.gap <= 500, "main thread stalled " + S({ gap: r.gap, beats: r.beats }));
      } finally { await page.close(); }
    });

    await check("c: sub-switch on, crease-free texture: no line found; heart / head / life marked 'not clear in this photo' (TH / EN / ZH)", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, base, { lang, v3: true });
        try {
          const r = await findLines(page, { seed: 73, side: "right", noCreases: true });
          assert(r.finder === "v3", "finder " + r.finder);
          const found = Object.entries(r.lines).filter(([, L]) => L.status === "found").map(([id]) => id);
          assert(found.length === 0, `${lang}: lines found on a crease-free texture ${S(found)}`);
          const notes = await page.evaluate(() => Object.fromEntries(["heart", "head", "life"].map(id => [id, (document.querySelector(`#pv2List [data-line="${id}"]`) || {}).textContent || ""])));
          for (const id of ["heart", "head", "life"]) assert(notes[id].includes(UNCLEAR[lang]), `${lang}: ${id} row without "${UNCLEAR[lang]}": ${notes[id]}`);
        } finally { await page.close(); }
      }
    });

    await check("d: nothing leaves the device: every request goes to the page's own origin", async () => {
      const page = await open(browser, base, { v3: true });
      try {
        await findLines(page, { seed: 74, side: "right" });
        const origin = new URL(base).origin;
        const away = page.requests.map(q => q.url).filter(u => !u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:"));
        assert(away.length === 0, "requests away from the page origin: " + away.join(", "));
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}
