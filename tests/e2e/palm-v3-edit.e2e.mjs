// tests/e2e/palm-v3-edit.e2e.mjs — FIXED TEST SET "palm-v3-lines" relock4 (owner decision 185 ข, condition 3, 2026-11-20).
// palm.html, demo profile, LENSIQ_PALM_V2 = true and LENSIQ_PALM_V3_LINES = true; DRAWN SYNTHETIC hands only (no photo of a person).
//  E  every line the v3 finder draws can be ADJUSTED (drag a round dot: the line moves and stays drawn) and REMOVED (it is no longer
//     drawn solid), and the approved note (owner decision 165 ก, exact text) that the lines are an estimate to compare with your own
//     hand is visible after finding, after adjusting and after removing (TH / EN / ZH).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = [join("palm-v2", "synth-hand.js"), join("palm-v2", "textures.js"), join("palm-v3", "synth-real.js")]
  .map(f => readFileSync(join(here, "..", "fixtures", f), "utf8"));
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TAP_ORDER = ["wrist", "indexBase", "pinkyBase", "indexTip", "middleTip", "ringTip", "pinkyTip"];
const NOTE = {
  th: "เส้นที่แสดงเป็นการประมาณจากภาพโดยอัตโนมัติ และยังไม่ได้วัดความแม่นยำกับมือจริง โปรดเทียบกับมือของคุณ และลากจุดกลมเพื่อปรับเส้นให้ตรงกับรอยจริงได้",
  en: "The lines shown are estimated automatically from the photo, and their accuracy has not been measured on real hands. " +
    "Please compare them with your own hand; you can drag the round dots to move a line onto the real crease.",
  zh: "图中显示的掌纹是根据照片自动估算的，尚未在真实手掌上测量准确度。请与自己的手对照，可以拖动圆点把线移到真实的纹路上。"
};

async function open(browser, base, lang) {
  const init = [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`].concat(FIX,
    ['window.LENSIQ_PROFILE = "demo"; window.LENSIQ_PALM_V2 = true; window.LENSIQ_PALM_V3_LINES = true;']);
  const page = await browser.newPage(null, { initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/palm.html?cpu`);
  await page.waitFor(`!!(window.__palmV2 && window.__palmV2.ready)`, 20000);
  return page;
}
async function mouse(page, type, p) { await page.send("Input.dispatchMouseEvent", { type, x: p[0], y: p[1], button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 }); }
const click = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error("no " + s); e.scrollIntoView({ block: "center", behavior: "instant" });
  e.click(); return true; }, sel);
async function findLines(page, o) {
  const url = await page.evaluate(async o => {
    const h = PalmSynthReal.synthReal(o);
    const c = document.createElement("canvas"); c.width = h.w; c.height = h.h; c.getContext("2d").putImageData(new ImageData(h.rgba, h.w, h.h), 0, 0);
    window.__taps = h.taps; return c.toDataURL("image/png");
  }, o);
  await page.evaluate(u => window.__palmV2.useImage(u), url);
  const taps = await page.evaluate(() => window.__taps);
  for (const k of TAP_ORDER) {
    const p = await page.evaluate(q => window.__palmV2.imgToClient(q), taps[k]);
    await mouse(page, "mousePressed", p); await mouse(page, "mouseReleased", p); await sleep(60);
  }
  await page.waitFor(`document.querySelectorAll("#pv2List [data-line]").length === 10 && !window.__palmV2.busy && window.__palmV2.finder === "v3"`, 90000);
}
const noteState = page => page.evaluate(() => { const e = document.getElementById("pv2LinesNote"); return e ? { text: e.textContent, shown: !!e.offsetParent && !e.hidden } : null; });

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("E: every v3-drawn line can be adjusted and removed; the approved estimate note stays visible (TH / EN / ZH)", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, base, lang);
        try {
          await findLines(page, { seed: 81, side: "left" });
          const n0 = await noteState(page);
          assert(n0 && n0.shown && n0.text === NOTE[lang], `${lang}: note after finding ${S(n0)}`);
          const found = Object.entries(await page.evaluate(() => window.__palmV2.state().lines)).filter(([, L]) => L.status === "found").map(([id]) => id);
          assert(found.length >= 2, `${lang}: v3 drew ${S(found)}`);
          for (const id of found) {
            // adjust: the row offers it; drag the first round dot by 18 px; the line moves and stays drawn
            const acts = await page.evaluate(id => Array.from(document.querySelectorAll(`#pv2List [data-line="${id}"] [data-act]`)).map(b => b.getAttribute("data-act")), id);
            assert(acts.includes("adjust") && acts.includes("remove"), `${lang}: ${id} row actions ${S(acts)}`);
            await click(page, `#pv2List [data-line="${id}"] [data-act="adjust"]`);
            const before = await page.evaluate(id => window.__palmV2.state().lines[id].cp, id);
            const p = await page.evaluate(q => window.__palmV2.uvToClient(q), before[0]);
            await mouse(page, "mousePressed", p); await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p[0] + 9, y: p[1] + 15, button: "left", buttons: 1 });
            await mouse(page, "mouseReleased", [p[0] + 9, p[1] + 15]); await sleep(60);
            const after = await page.evaluate(id => window.__palmV2.state().lines[id], id);
            const moved = after.cp ? Math.hypot(after.cp[0][0] - before[0][0], after.cp[0][1] - before[0][1]) : 0;
            assert(after.status === "found" && moved > 0.005, `${lang}: ${id} not adjusted ${S({ before: before[0], after: after.cp && after.cp[0] })}`);
            await click(page, `#pv2List [data-line="${id}"] [data-act="adjust"]`); // done
            const n1 = await noteState(page);
            assert(n1 && n1.shown && n1.text === NOTE[lang], `${lang}: note after adjusting ${id} ${S(n1)}`);
          }
          for (const id of found) {
            await click(page, `#pv2List [data-line="${id}"] [data-act="remove"]`);
            const L = await page.evaluate(id => window.__palmV2.state().lines[id], id);
            assert(L.status !== "found" && L.status !== "added", `${lang}: ${id} still drawn after remove ${S(L.status)}`);
            const lay = await page.evaluate(id => window.__palmV2.layout("screen").lines.find(l => l.id === id), id);
            assert(lay.status !== "found", `${lang}: ${id} layout still found`);
          }
          const n2 = await noteState(page);
          assert(n2 && n2.shown && n2.text === NOTE[lang], `${lang}: note after removing ${S(n2)}`);
        } finally { await page.close(); }
      }
    });
  } finally { await browser.close(); }
}
