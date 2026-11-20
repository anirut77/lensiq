// tests/e2e/palm-v2-capture.e2e.mjs — FIXED TEST SET "palm-layers" relock4 (palm v2 capture, owner orders 2026-11-20), changed and
// re-locked as relock5 (owner decisions 171 ก and 172, 2026-11-20) in evals-locks/palm-layers.sha256 BEFORE the product change.
// Changed again and re-locked as relock7 (owner decisions 170 ก and 179 ก, 2026-11-20) BEFORE the product change, each change equal or
// stricter: U checks the new exact 179 text and that no part of the old text is on the page; new check M (170 ก).
// 171 ก (owner-approved loosening): sharpness no longer blocks a photo; the minimum is palm width >= 360 px and blown-out <= 2 %;
// sharpness is measured for review only and never shown. 172: the pre-capture guidance is EXACTLY the approved text. palm.html with window.LENSIQ_PALM_V2 = true (set before load).
// DRAWN SYNTHETIC images only (tests/fixtures/palm-v2/synth-capture.js), never a photo of a person; numbers are SYNTHETIC.
//  U  upload minimum through the real upload control (#pv2File): a photo with a palm narrower than 360 px (300 px; 350 px; 300 px
//     and blurred) and a photo with > 2 % blown-out palm pixels (also when blurred) show EXACTLY the approved message (TH / EN / ZH)
//     after the 7 taps, the line finder does not run, every line is "not found", and the user can still trace a line by hand on that
//     photo; a good photo and a blurred photo (S x 10^4 < 1.0, still measured) show no such message, the finder runs, and no
//     sharpness value appears anywhere on the page.
//  F  camera still with a flash blow-out (> 2 %) is rejected with the same message; a good still is not.
//  M  (170 ก) the manual capture button pressed BEFORE the outline turned green: the full-resolution still must pass the full photo
//     minimum: a 300 px palm and a 3 % blown-out palm are rejected with the exact 179 message (TH / EN / ZH), the finder does not run;
//     a good still and a blurred still (blur alone never rejects) pass; pw is measured on the still's own pixels.
//  H  handedness: the user chose the right hand and the photo is a left hand: a confirmation question (TH / EN / ZH) appears,
//     the reading button waits, the side stays "right" until the user answers; answering "left" sets left. A matching photo
//     asks nothing.
//  T  the pre-capture guidance shows EXACTLY the owner-approved 172 text (TH / EN / ZH) and none of the earlier tip texts.
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
/* owner decision 179 ก (2026-11-20): byte for byte */
const RETAKE = {
  th: "ภาพเล็กเกินไปหรือสว่างจ้าจากแฟลช ลองถ่ายใหม่ให้ฝ่ามือเต็มกรอบและปิดแฟลช",
  en: "The photo is too small or washed out by the flash. Please retake it with your palm filling the frame and the flash off.",
  zh: "照片太小或被闪光灯照得过亮。请让手掌占满画面并关闭闪光灯后重新拍摄。"
};
/* the earlier retake message that 179 ก replaces: no part may remain on the page */
const OLD_RETAKE = ["ภาพนี้เล็กหรือไม่คมพอสำหรับหาเส้นลายมือ ถ่ายใหม่ให้ฝ่ามือเต็มกรอบ ในที่สว่างทั่วถึง ไม่ใช้แฟลช และถือให้นิ่ง หรือจะวาดเส้นเองบนภาพนี้ก็ได้", "This photo is too small or not sharp enough to find palm lines. Retake it with your palm filling the frame, in bright even light, without flash, holding still, or draw the lines yourself on this photo.", "这张照片太小或不够清晰，无法找到掌纹。请让手掌占满画面，在明亮均匀的光线下、不开闪光灯、保持稳定后重拍，也可以直接在这张照片上自己画线。", "ไม่คมพอ", "not sharp enough", "不够清晰"];
/* owner decision 172 (2026-11-20): byte for byte */
const GUIDE = {
  th: "ถ่ายข้างหน้าต่างให้แสงส่องฝ่ามือจากด้านข้าง ไม่ใช่จากด้านหน้า ปิดแฟลช (ตั้งเป็น 'ปิด' ไม่ใช่ 'อัตโนมัติ') ปล่อยมือสบาย ๆ งุ้มเล็กน้อย ไม่ต้องเหยียดตึง และให้เห็นทั้งฝ่ามือและนิ้วอยู่ในกรอบ",
  en: "Stand beside a window so the light falls across your palm from the side, not from the front. Turn the flash off (set it to 'off', not 'auto'). Keep your hand relaxed and slightly cupped, not stretched flat, with the whole palm and fingers inside the frame.",
  zh: "站在窗边，让光线从侧面照到手掌，而不是从正面。关闭闪光灯（设为“关闭”，不要用“自动”）。手放松、略微弯曲，不要用力伸平，并让整个手掌和手指都在画面内。"
};
const OLD_TIPS = [
  "ถ่ายให้เห็นเส้นชัด", "For clear lines", "让掌纹更清楚",
  "ถ่ายในที่สว่างทั่วถึง แสงกลางวันดีที่สุด", "daylight is best, ideally from the side", "日光最好，光线尽量从侧面照来",
  "แสงแฟลชลบเงาในร่องเส้นจนมองไม่เห็น", "a flash washes the shadows out of the lines", "闪光灯会把掌纹的阴影照没",
  "ให้ฝ่ามือห่อเล็กน้อย ไม่ต้องเหยียดตึงจนแบน", "Keep your hand relaxed and slightly cupped, not stretched flat.", "掌心微微拱起，不要把手绷直撑平"
];
/** the page shows no sharpness value: no measured S (in any rounding) next to a sharpness word, no sharpness word with a number */
const SHARP_SHOWN = (text, sharp) => {
  const words = /sharpness|\bsharp\b|ความคม|คมชัด|清晰度|锐度/i, out = [];
  for (const line of text.split(/\n+/)) if (words.test(line) && /\d/.test(line)) out.push(line);
  if (typeof sharp === "number") for (const d of [2, 3]) { const v = sharp.toFixed(d); if (Number(v) !== 0 && text.includes(v)) out.push("value " + v); }
  return out;
};
const ADDED = { th: "เพิ่มเอง", en: "Added by you", zh: "自行添加" };

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
          const t = await page.evaluate(() => { const e = document.getElementById("pv2Tips"); if (!e) return null;
            const g = e.querySelector('[data-pv2-t="tips.guide"]');
            return { text: e.innerText, shown: !!e.offsetParent, guide: g ? g.textContent : null, guideShown: !!(g && g.offsetParent),
              body: document.body.innerText, html: document.documentElement.outerHTML }; });
          assert(t && t.shown && t.guideShown, `${lang}: guidance not shown ${S(t && { shown: t.shown, guideShown: t.guideShown })}`);
          assert(t.guide === GUIDE[lang], `${lang}: guidance is not the exact 172 text: ${S(t.guide)}`);
          assert(t.text.trim() === GUIDE[lang], `${lang}: the guidance block holds more than the 172 text: ${S(t.text)}`);
          const left = OLD_TIPS.filter(o => t.body.includes(o) || t.html.includes(o));
          assert(left.length === 0, `${lang}: old tip text still on the page ${S(left)}`);
        } finally { await page.close(); }
      }
    });

    for (const lang of LANGS) {
      await check(`U ${lang}: upload minimum: small and blown-out photos rejected with the exact message, trace still possible; a good photo and a blurred photo pass, no sharpness shown`, async () => {
        const page = await open(browser, base, { lang });
        try {
          for (const [name, o, fail] of [["small (palm 300 px)", { pw: 300 }, "pw"], ["small (palm 350 px)", { pw: 350 }, "pw"], ["small and blurred", { pw: 300, blur: 0.008 }, "pw"],
            ["blown-out 3 %", { pw: 480, clip: 0.03 }, "clip"], ["blown-out 3 % and blurred", { pw: 480, clip: 0.03, blur: 0.008 }, "clip"]]) {
            await tapAll(page, await upload(page, o));
            const f = await facts(page);
            assert(f.msg === RETAKE[lang], `${lang} ${name}: message ${S(f.msg)}`);
            const page_t = await page.evaluate(() => document.body.innerText + "\n" + document.documentElement.outerHTML);
            const oldLeft = OLD_RETAKE.filter(o => page_t.includes(o));
            assert(oldLeft.length === 0, `${lang} ${name}: the old retake text is still on the page ${S(oldLeft)}`);
            assert(f.q && f.q.ok === false && f.q.fails.includes(fail) && !f.q.fails.includes("sharp"), `${lang} ${name}: verdict ${S(f.q)}`);
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
          // 171 ก: a blurred photo (S x 10^4 < 1.0) is not blocked; S is still measured; no sharpness value is shown
          await tapAll(page, await upload(page, { pw: 480, blur: 0.008 }));
          const b = await facts(page);
          assert(b.q && b.q.ok === true && b.q.fails.length === 0, `${lang} blurred: verdict ${S(b.q)}`);
          assert(typeof b.q.sharp === "number" && b.q.sharp < 1.0, `${lang} blurred: S not measured or not below 1.0 ${S(b.q)}`);
          assert(!b.msg.includes(RETAKE[lang]), `${lang} blurred: retake message shown ${S(b.msg)}`);
          assert(typeof b.ms === "number", `${lang} blurred: the finder did not run ${S(b)}`);
          const shown = await page.evaluate(() => document.body.innerText + "\n" + [...document.querySelectorAll("[title],[aria-label],[alt]")]
            .map(e => [e.getAttribute("title"), e.getAttribute("aria-label"), e.getAttribute("alt")].filter(Boolean).join(" ")).join("\n"));
          const leak = SHARP_SHOWN(shown, b.q.sharp);
          assert(leak.length === 0, `${lang} blurred: sharpness shown to the user ${S(leak)}`);
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
      await check(`M ${lang}: 170 ก manual capture before green: a 300 px palm and 3 % blow-out are rejected with the exact 179 message; good and blurred stills pass`, async () => {
        const page = await open(browser, base, { lang, fakeCams, extra: [FAKE_IC] });
        try {
          for (const [name, o, fail] of [["palm 300 px", { pw: 300 }, "pw"], ["blown-out 3 %", { pw: 480, clip: 0.03 }, "clip"], ["good", { pw: 480 }, null],
            ["blurred only", { pw: 480, blur: 0.008 }, null]]) {
            await page.evaluate(o => { window.__stillOpts = o; window.__stillTaps = null; }, o);
            await click(page, "#pv2Start");
            await page.waitFor(`!document.getElementById("pv2Snap").hidden`, 8000);
            const before = await page.evaluate(() => window.__tp);
            await click(page, "#pv2Snap");
            await page.waitFor(`window.__tp > ${before} && !!window.__stillTaps && !!window.__palmV2.lastStill`, 10000);
            const still = await page.evaluate(() => window.__palmV2.lastStill);
            assert(still.auto === false, `${lang} ${name}: not the manual button ${S(still)}`);
            await tapAll(page, await page.evaluate(() => window.__stillTaps));
            const f = await facts(page);
            assert(f.q && f.q.beforeGreen === true && f.q.source === "camera", `${lang} ${name}: not recorded as a camera still before green ${S(f.q)}`);
            assert(Math.abs(f.q.pw - o.pw) <= 2, `${lang} ${name}: pw not measured on the full-resolution still ${S(f.q)} want ${o.pw}`);
            if (fail) {
              assert(f.msg === RETAKE[lang], `${lang} ${name}: message ${S(f.msg)}`);
              assert(f.q.ok === false && S(f.q.fails) === S([fail]), `${lang} ${name}: verdict ${S(f.q)}`);
              assert(f.ms == null, `${lang} ${name}: the finder ran (${f.ms} ms)`);
              assert(f.rows.length === 10 && f.rows.every(s => s === "notFound") && f.trace, `${lang} ${name}: rows ${S(f)}`);
            } else {
              assert(f.q.ok === true && f.q.fails.length === 0, `${lang} ${name}: verdict ${S(f.q)}`);
              assert(!f.msg.includes(RETAKE[lang]), `${lang} ${name}: retake message shown ${S(f.msg)}`);
              assert(typeof f.ms === "number", `${lang} ${name}: the finder did not run ${S(f)}`);
            }
          }
        } finally { await page.close(); }
      });
    }

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
