// tests/e2e/palm-v2-capture.e2e.mjs — FIXED TEST SET "palm-layers" relock4 (palm v2 capture, owner orders 2026-11-20), locked in
// evals-locks/palm-layers.sha256 BEFORE the product change. palm.html with window.LENSIQ_PALM_V2 = true (set before load).
// DRAWN SYNTHETIC images only (tests/fixtures/palm-v2/synth-capture.js), never a photo of a person; numbers are SYNTHETIC.
//  U  upload minimum through the real upload control (#pv2File): a photo with a palm narrower than 360 px, a blurred photo
//     (S x 10^4 < 1.0) and a photo with > 2 % blown-out palm pixels show EXACTLY the approved message (TH / EN / ZH) after the
//     7 taps, the line finder does not run, every line is "not found", and the user can still trace a line by hand on that
//     photo; a good photo shows no such message and the finder runs.
//  F  camera still with a flash blow-out (> 2 %) is rejected with the same message; a good still is not.
//  H  handedness: the user chose the right hand and the photo is a left hand: a confirmation question (TH / EN / ZH) appears,
//     the reading button waits, the side stays "right" until the user answers; answering "left" sets left. A matching photo
//     asks nothing.
//  T  pre-capture tips are shown with the daylight, no-flash and relaxed, slightly cupped hand guidance (TH / EN / ZH).
// 393 px wide, one browser.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SYNTHC = readFileSync(join(here, "..", "fixtures", "palm-v2", "synth-capture.js"), "utf8");
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const TAP_ORDER = ["wrist", "indexBase", "pinkyBase", "indexTip", "middleTip", "ringTip", "pinkyTip"];
const RETAKE = {
  th: "ภาพนี้เล็กหรือไม่คมพอสำหรับหาเส้นลายมือ ถ่ายใหม่ให้ฝ่ามือเต็มกรอบ ในที่สว่างทั่วถึง ไม่ใช้แฟลช และถือให้นิ่ง หรือจะวาดเส้นเองบนภาพนี้ก็ได้",
  en: "This photo is too small or not sharp enough to find palm lines. Retake it with your palm filling the frame, in bright even light, without flash, holding still, or draw the lines yourself on this photo.",
  zh: "这张照片太小或不够清晰，无法找到掌纹。请让手掌占满画面，在明亮均匀的光线下、不开闪光灯、保持稳定后重拍，也可以直接在这张照片上自己画线。"
};
const ADDED = { th: "เพิ่มเอง", en: "Added by you", zh: "自行添加" };
const NO_FLASH = { th: /ไม่ใช้แฟลช|ปิดแฟลช/, en: /\b(no flash|without (the )?flash|flash off|turn off the flash)\b/i, zh: /不开闪光灯|关闭闪光灯|不要用闪光灯|不用闪光灯/ };
const CUPPED = { th: /ห่อ/, en: /\bcupped\b/i, zh: /微微拱起|微拱|稍微弯曲|微弯/ };
const DAYLIGHT = { th: /แสงกลางวัน/, en: /\bdaylight\b/i, zh: /日光|白天的光/ };

const LANG = lang => `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`;
/* ImageCapture whose takePhoto() returns a synthetic palm (window.__stillOpts picks the image) */
const FAKE_IC = `window.__tp = 0; window.__stillOpts = { pw: 480 }; window.ImageCapture = class { constructor(t) { this.track = t; }
  takePhoto() { window.__tp++; const im = PalmCapSynth.palmImage(window.__stillOpts); window.__stillTaps = im.taps; const c = document.createElement("canvas"); c.width = im.w;
    c.height = im.h; c.getContext("2d").putImageData(new ImageData(im.rgba, im.w, im.h), 0, 0); return new Promise(r => c.toBlob(r, "image/png")); }
  grabFrame() { return Promise.reject(new Error("not used")); } };`;

async function open(browser, base, { lang = "th", fakeCams = null, extra = [] } = {}) {
  const init = [LANG(lang), SYNTHC, "window.LENSIQ_PALM_V2 = true;"].concat(fakeCams ? [fakeCams, `window.__LQ_FAKE_CAMS = ${S({ n: 1, mode: "ok", res: { w: 1920, h: 1080 } })};`] : [], extra);
  const page = await browser.newPage(null, { initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/palm.html?cpu`);
  await page.waitFor(`!!(window.__palmV2 && window.__palmV2.ready)`, 20000);
  return page;
}
const click = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error("no " + s); e.scrollIntoView({ block: "center", behavior: "instant" });
  e.click(); return true; }, sel);
async function mouse(page, type, p) { await page.send("Input.dispatchMouseEvent", { type, x: p[0], y: p[1], button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1,
  pointerType: "mouse" }); }
async function tapAt(page, p) { await mouse(page, "mousePressed", p); await mouse(page, "mouseReleased", p); await sleep(60); }
/** a synthetic photo through the real upload control (File in a DataTransfer, change event) */
const upload = (page, o) => page.evaluate(async o => {
  const im = PalmCapSynth.palmImage(o), c = document.createElement("canvas"); c.width = im.w; c.height = im.h;
  c.getContext("2d").putImageData(new ImageData(im.rgba, im.w, im.h), 0, 0);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  const dt = new DataTransfer(); dt.items.add(new File([blob], "synthetic-palm.png", { type: "image/png" }));
  const inp = document.getElementById("pv2File"); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true }));
  return im.taps;
}, o);
async function tapAll(page, taps) {
  await page.waitFor(`!document.getElementById("pv2Work").hidden && /^1\\/7/.test(document.getElementById("pv2TapMsg").textContent)`, 20000);
  await sleep(150);
  for (const k of TAP_ORDER) await tapAt(page, await page.evaluate(q => window.__palmV2.imgToClient(q), taps[k]));
  await page.waitFor(`document.querySelectorAll("#pv2List [data-line]").length === 10 && !window.__palmV2.busy`, 30000);
  await sleep(150);
}
const facts = page => page.evaluate(() => ({ msg: document.getElementById("pv2Msg").textContent.trim(), q: window.__palmV2.quality,
  ms: window.__palmV2.lastDetectMs, rows: [...document.querySelectorAll("#pv2List [data-line]")].map(r => r.dataset.status),
  trace: !!document.querySelector('#pv2List [data-line="life"] [data-act="trace"]') }));

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("T pre-capture tips: daylight from the side, no flash, relaxed slightly cupped hand (TH / EN / ZH)", async () => {
      for (const lang of LANGS) {
        const page = await open(browser, base, { lang });
        try {
          const t = await page.evaluate(() => { const e = document.getElementById("pv2Tips"); return e ? { text: e.innerText, shown: !!e.offsetParent } : null; });
          assert(t && t.shown, `${lang}: tips not shown ${S(t)}`);
          assert(DAYLIGHT[lang].test(t.text) && NO_FLASH[lang].test(t.text) && CUPPED[lang].test(t.text), `${lang}: tips ${S(t.text)}`);
        } finally { await page.close(); }
      }
    });

    for (const lang of LANGS) {
      await check(`U ${lang}: upload minimum: small, blurred and blown-out photos rejected with the exact message, trace still possible; a good photo passes`, async () => {
        const page = await open(browser, base, { lang });
        try {
          for (const [name, o, fail] of [["small (palm 300 px)", { pw: 300 }, "pw"], ["blurred", { pw: 480, blur: 0.008 }, "sharp"], ["blown-out 3 %", { pw: 480, clip: 0.03 }, "clip"]]) {
            await tapAll(page, await upload(page, o));
            const f = await facts(page);
            assert(f.msg === RETAKE[lang], `${lang} ${name}: message ${S(f.msg)}`);
            assert(f.q && f.q.ok === false && f.q.fails.includes(fail), `${lang} ${name}: verdict ${S(f.q)}`);
            assert(f.ms == null, `${lang} ${name}: the finder ran (${f.ms} ms)`);
            assert(f.rows.length === 10 && f.rows.every(s => s === "notFound"), `${lang} ${name}: rows ${S(f.rows)}`);
            assert(f.trace, `${lang} ${name}: no trace button`);
          }
          // the user draws the life line by hand on the rejected (blown-out) photo
          await click(page, `#pv2List [data-line="life"] [data-act="trace"]`);
          await sleep(300);
          const guv = await page.evaluate(() => { const g = window.PalmV2.guides("thai").life.cp, out = []; for (let i = 0; i < g.length - 1; i++) for (let k = 0; k < 6; k++)
            out.push([g[i][0] + (g[i + 1][0] - g[i][0]) * k / 6, g[i][1] + (g[i + 1][1] - g[i][1]) * k / 6]); out.push(g[g.length - 1]); return out; });
          const pts = [];
          for (const q of guv) pts.push(await page.evaluate(u => window.__palmV2.uvToClient(u), q));
          await mouse(page, "mousePressed", pts[0]);
          for (const p of pts.slice(1)) { await mouse(page, "mouseMoved", p); await sleep(15); }
          await mouse(page, "mouseReleased", pts[pts.length - 1]);
          await page.waitFor(`(document.querySelector('#pv2List [data-line="life"]') || {dataset:{}}).dataset.status === "added"`, 5000);
          const life = await page.evaluate(() => document.querySelector('#pv2List [data-line="life"] .pv2-status').textContent);
          assert(life.includes(ADDED[lang]), `${lang}: traced life ${S(life)}`);
          // a good photo: no message, the finder runs
          await tapAll(page, await upload(page, { pw: 480 }));
          const g = await facts(page);
          assert(g.q && g.q.ok === true, `${lang} good: verdict ${S(g.q)}`);
          assert(!g.msg.includes(RETAKE[lang]), `${lang} good: message shown ${S(g.msg)}`);
          assert(typeof g.ms === "number", `${lang} good: the finder did not run ${S(g)}`);
        } finally { await page.close(); }
      });
    }

    await check("F camera still: a flash blow-out (> 2 %) is rejected with the same message; a good still is not (TH)", async () => {
      const page = await open(browser, base, { lang: "th", fakeCams, extra: [FAKE_IC] });
      try {
        for (const [o, bad] of [[{ pw: 480, clip: 0.3 }, true], [{ pw: 480 }, false]]) {
          await page.evaluate(o => { window.__stillOpts = o; }, o);
          await click(page, "#pv2Start");
          await page.waitFor(`!document.getElementById("pv2Snap").hidden`, 8000);
          const before = await page.evaluate(() => window.__tp);
          await click(page, "#pv2Snap");
          await page.waitFor(`window.__tp > ${before} && !!window.__stillTaps && !!window.__palmV2.lastStill`, 10000);
          const taps = await page.evaluate(() => window.__stillTaps);
          await tapAll(page, taps);
          const f = await facts(page);
          if (bad) assert(f.msg === RETAKE.th && f.q && f.q.fails.includes("clip") && f.ms == null, `blown still ${S(f)}`);
          else assert(!f.msg.includes(RETAKE.th) && f.q && f.q.ok === true && typeof f.ms === "number", `good still ${S(f)}`);
          await page.evaluate(() => { window.__stillTaps = null; });
        }
      } finally { await page.close(); }
    });

    for (const lang of LANGS) {
      await check(`H ${lang}: handedness: a left-hand photo while "right" is chosen asks first and never overrides; a matching photo asks nothing`, async () => {
        const page = await open(browser, base, { lang });
        try {
          await click(page, `[data-pv2-side="right"]`);
          await tapAll(page, await upload(page, { pw: 480, side: "left" }));
          const a = await page.evaluate(() => { const e = document.getElementById("pv2SideAsk"); return { shown: !!(e && e.offsetParent), text: e ? e.innerText : "",
            read: document.getElementById("pv2Read").disabled, side: window.__palmV2.state().side, chosen: document.querySelector('[data-pv2-side="right"]').getAttribute("aria-checked"),
            want: window.PalmV2.sideAskText("left", "right", window.LQI18N && window.LQI18N.lang || "th") }; });
          assert(a.shown && a.text.includes(a.want), `${lang}: question ${S(a)}`);
          assert(a.read === true, `${lang}: the reading did not wait ${S(a)}`);
          assert(a.side === "right" && a.chosen === "true", `${lang}: the side changed before the answer ${S(a)}`);
          await click(page, `#pv2SideAsk [data-pv2-side-answer="left"]`);
          await sleep(200);
          const b = await page.evaluate(() => ({ shown: !!(document.getElementById("pv2SideAsk").offsetParent), read: document.getElementById("pv2Read").disabled,
            side: window.__palmV2.state().side, chosen: document.querySelector('[data-pv2-side="left"]').getAttribute("aria-checked") }));
          assert(!b.shown && b.read === false && b.side === "left" && b.chosen === "true", `${lang}: after the answer ${S(b)}`);
          // matching: the user now has "left" and uploads a left hand
          await tapAll(page, await upload(page, { pw: 480, side: "left" }));
          const c = await page.evaluate(() => ({ shown: !!(document.getElementById("pv2SideAsk").offsetParent), read: document.getElementById("pv2Read").disabled,
            side: window.__palmV2.state().side }));
          assert(!c.shown && c.read === false && c.side === "left", `${lang}: matching photo ${S(c)}`);
          // the user keeps "right" when answering "right" (their choice stands)
          await click(page, `[data-pv2-side="right"]`);
          await tapAll(page, await upload(page, { pw: 480, side: "left" }));
          await click(page, `#pv2SideAsk [data-pv2-side-answer="right"]`);
          await sleep(200);
          const d = await page.evaluate(() => ({ shown: !!(document.getElementById("pv2SideAsk").offsetParent), side: window.__palmV2.state().side }));
          assert(!d.shown && d.side === "right", `${lang}: kept right ${S(d)}`);
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
