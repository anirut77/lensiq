// tests/e2e/capture-hints.e2e.mjs — live capture hints on framed camera pages (owner request 2026-11-13):
// palm.html (hand guide) and faceread.html (face oval) show one large line under the camera — too far / too close /
// move into the frame / only one / too dark / good, hold still — in TH / EN / ZH, in an aria-live="polite" region,
// and the frame turns green only for "ok" (text + icon too, never colour alone).
// Pages run with ?cpu&fakedet: window.__dets (normalised boxes) is what every fake detector call returns; the fake
// camera (fake-cams.js) paints a solid colour with one moving white rectangle. No images of people anywhere.
// Locked before the product code: ~/LENSIQ-field/evals/capture-hints/locked.sha256.
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));

// palm: the hand guide spans x 0.26-0.74, y 0.08-0.92 of a 640x480 frame; the synthetic hand's landmark box is
// 0.71 x the detector box wide, so this box fills the guide (landmark box / guide box = 0.93)
const HAND_OK = { x: 0.195, y: 0.1, w: 0.61, h: 0.805, score: 0.95, side: "left" };
const HAND_FAR = { x: 0.43, y: 0.35, w: 0.14, h: 0.3, score: 0.95, side: "left" };
const HAND_NEAR = { x: 0.05, y: -0.1, w: 0.9, h: 1.2, score: 0.95, side: "left" };   // cut at the top and bottom of the picture
const HAND_OUT = { x: 0.62, y: 0.05, w: 0.3, h: 0.6, score: 0.95, side: "left" };
const HAND_2 = { x: 0.02, y: 0.3, w: 0.25, h: 0.5, score: 0.9, side: "right" };
// faceread: the oval spans x 0.32-0.68, y 0.17-0.79 of a 640x480 frame
const FACE_OK = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const FACE_FAR = { x: 0.44, y: 0.33, w: 0.12, h: 0.18, score: 0.95 };
const FACE_NEAR = { x: 0.15, y: 0.02, w: 0.7, h: 0.9, score: 0.95 };
const FACE_OUT = { x: 0.02, y: 0.25, w: 0.25, h: 0.35, score: 0.95 };
const FACE_2 = { x: 0.72, y: 0.3, w: 0.22, h: 0.35, score: 0.9 };

const detScript = `(() => {
  window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" };
  window.__dets = [];
  window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d));
})();`;

function realErrors(page) {
  return page.consoleErrors.filter(e => !/\/api\/[a-z]+\/status/.test((e.url || "") + " " + (e.text || "")) && !(e.kind !== "exception" && /404/.test(e.text || "") && /\/api\//.test(e.url || "")));
}
async function privacy(page) {
  for (let i = page.requests.length - 1; i >= 0; i--) {
    const r = page.requests[i];
    if (r.method === "GET" && /\/api\/[a-z]+\/status$/.test(new URL(r.url).pathname)) page.requests.splice(i, 1);
  }
  return privacyScan(page);
}
/** "rgb(r, g, b)" with green clearly the strongest channel */
function isGreen(css) {
  const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(css || "");
  return !!m && +m[2] > +m[1] + 40 && +m[2] > +m[3] + 40;
}
const setDets = (page, dets) => page.evaluate(d => { window.__dets = d; }, dets);
const click = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
/** wait until the hint line shows `text` (state `state`), then return its details */
async function hintIs(page, id, state, text, ms = 6000) {
  await page.waitFor(`(() => { const e = document.getElementById(${JSON.stringify(id)}); return !!e && e.dataset.state === ${JSON.stringify(state)}
    && e.querySelector(".lq-chint-tx").textContent === ${JSON.stringify(text)}; })()`, ms);
  return page.evaluate(i => {
    const e = document.getElementById(i), cs = getComputedStyle(e), r = e.getBoundingClientRect(), cam = e.closest("[data-chint-host]") || document.querySelector("[data-chint]");
    return { live: e.getAttribute("aria-live"), role: e.getAttribute("role"), font: parseFloat(cs.fontSize), weight: +cs.fontWeight || 400,
      visible: r.width > 0 && r.height > 0 && cs.visibility !== "hidden",
      icon: (e.querySelector(".lq-chint-ic") || {}).textContent || "", iconHidden: (e.querySelector(".lq-chint-ic") || { getAttribute: () => null }).getAttribute("aria-hidden"),
      hostState: cam ? cam.getAttribute("data-chint") : null };
  }, id);
}
/** a dark picture: the page's <video> is fed from a canvas painted near-black every 50 ms (same size as the fake camera,
 *  no white rectangle). Freezing the fake camera proved unreliable (a stopped canvas stream can leave an older frame on
 *  screen), so lock v2 swaps the picture instead — test set-up only; the assertions on the page are unchanged. */
async function darkStill(page) {
  await page.evaluate(() => {
    const v = document.querySelector("video"), c = document.createElement("canvas"); c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    const x = c.getContext("2d"), paint = () => { x.fillStyle = "rgb(18,18,22)"; x.fillRect(0, 0, c.width, c.height); };
    paint(); setInterval(paint, 50);
    v.srcObject = c.captureStream(15); v.play().catch(() => {});
  });
  await page.waitFor(`(() => {
    const v = document.querySelector("video"), c = document.createElement("canvas"); c.width = 64; c.height = 48;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(v, 0, 0, 64, 48);
    const d = x.getImageData(0, 0, 64, 48).data;
    for (let k = 0; k < d.length; k += 4) if (d[k] > 60 || d[k + 1] > 60 || d[k + 2] > 60) return false;
    return true;
  })()`, 5000, 100);
}
async function startLang(page, lang) {
  await page.evaluate(l => LQI18N.setLang(l), lang);
  await page.waitFor(`document.documentElement.lang === ${JSON.stringify(lang === "zh" ? "zh-Hans" : lang)}`, 8000);
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("palm: out -> far -> near -> ok (green frame) -> one hand only -> too dark, in an aria-live line under the camera", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, detScript] });
      await page.goto(`${base}/palm.html?cpu&fakedet`);
      await page.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
      await assertNoWebGL(page);
      assert(await page.evaluate(() => [...document.scripts].some(s => /lensiq-capture-hint\.js\?v=\d+/.test(s.src))), "palm loads lensiq-capture-hint.js?v=");
      await click(page, '[data-side="auto"]');
      await click(page, "#plStartCam");
      await page.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 8000);
      let h = await hintIs(page, "plHint", "out", "ให้อยู่ในกรอบ");
      assert(h.live === "polite" && h.visible && h.font >= 17 && h.weight >= 600, "large polite line: " + JSON.stringify(h));
      assert(h.icon && h.iconHidden === "true" && h.hostState === "out", "icon + host state: " + JSON.stringify(h));
      // the line sits under the camera picture, not over the hand
      const pos = await page.evaluate(() => {
        const c = document.getElementById("plCam").getBoundingClientRect(), e = document.getElementById("plHint").getBoundingClientRect();
        return { camBottom: c.bottom, top: e.top };
      });
      assert(pos.top >= pos.camBottom - 1, "hint under the camera: " + JSON.stringify(pos));
      const neutral = await page.evaluate(() => getComputedStyle(document.getElementById("plCam")).outlineColor);
      await setDets(page, [HAND_FAR]);
      await hintIs(page, "plHint", "far", "ไกลไป ขยับเข้ามาใกล้อีกนิด");
      await setDets(page, [HAND_NEAR]);
      await hintIs(page, "plHint", "near", "ใกล้ไป ถอยออกหน่อย");
      await setDets(page, [HAND_OUT]);
      await hintIs(page, "plHint", "out", "ให้อยู่ในกรอบ");
      await setDets(page, [HAND_OK]);
      h = await hintIs(page, "plHint", "ok", "ดีแล้ว ถือนิ่ง ๆ");
      assert(h.hostState === "ok", "host ok " + JSON.stringify(h));
      const green = await page.evaluate(() => getComputedStyle(document.getElementById("plCam")).outlineColor);
      assert(green !== neutral && isGreen(green), "frame green when ok: " + green + " vs " + neutral);
      // a short blip of another state does not reach the screen (hold)
      await setDets(page, [HAND_FAR]); await sleep(150); await setDets(page, [HAND_OK]);
      for (let i = 0; i < 8; i++) { assert(await page.evaluate(() => document.getElementById("plHint").dataset.state) === "ok", "no flicker"); await sleep(100); }
      await setDets(page, [HAND_OK, HAND_2]);
      await hintIs(page, "plHint", "multi", "ใช้มือเดียวในกรอบ");
      await setDets(page, [HAND_OK]);
      await hintIs(page, "plHint", "ok", "ดีแล้ว ถือนิ่ง ๆ");
      // English and Chinese
      await startLang(page, "en");
      await hintIs(page, "plHint", "ok", "Good — hold still");
      await setDets(page, [HAND_FAR]);
      await hintIs(page, "plHint", "far", "Too far — move closer");
      await startLang(page, "zh");
      await hintIs(page, "plHint", "far", "太远了，再靠近一点");
      await setDets(page, [HAND_NEAR]);
      await hintIs(page, "plHint", "near", "太近了，往后退一点");
      await startLang(page, "th");
      await hintIs(page, "plHint", "near", "ใกล้ไป ถอยออกหน่อย");
      // dark picture
      await setDets(page, [HAND_OK]);
      await darkStill(page);
      await hintIs(page, "plHint", "dark", "มืดไป เพิ่มแสงอีกหน่อย", 8000);
      // snapping still works as before (no auto-capture added)
      assert(await page.evaluate(() => document.getElementById("plEdit").hidden && !document.getElementById("plSnap").disabled), "no auto-capture");
      await privacy(page);
      const errs = realErrors(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("faceread: out -> far -> near -> ok (green frame) -> one person only -> too dark; EN / ZH", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, detScript] });
      await page.goto(`${base}/faceread.html?cpu&fakedet`);
      await page.waitFor(`!!document.getElementById("frStartCam")`, 10000);
      await assertNoWebGL(page);
      assert(await page.evaluate(() => [...document.scripts].some(s => /lensiq-capture-hint\.js\?v=\d+/.test(s.src))), "faceread loads lensiq-capture-hint.js?v=");
      await click(page, "#frStartCam");
      await page.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
      let h = await hintIs(page, "frHint", "out", "ให้อยู่ในกรอบ");
      assert(h.live === "polite" && h.visible && h.font >= 17 && h.weight >= 600 && h.icon && h.iconHidden === "true", JSON.stringify(h));
      const pos = await page.evaluate(() => {
        const c = document.getElementById("frCam").getBoundingClientRect(), e = document.getElementById("frHint").getBoundingClientRect();
        return { camBottom: c.bottom, top: e.top };
      });
      assert(pos.top >= pos.camBottom - 1, "hint under the camera: " + JSON.stringify(pos));
      const neutral = await page.evaluate(() => getComputedStyle(document.getElementById("frCam")).outlineColor);
      await setDets(page, [FACE_FAR]);
      await hintIs(page, "frHint", "far", "ไกลไป ขยับเข้ามาใกล้อีกนิด");
      await setDets(page, [FACE_NEAR]);
      await hintIs(page, "frHint", "near", "ใกล้ไป ถอยออกหน่อย");
      await setDets(page, [FACE_OUT]);
      await hintIs(page, "frHint", "out", "ให้อยู่ในกรอบ");
      await setDets(page, [FACE_OK]);
      h = await hintIs(page, "frHint", "ok", "ดีแล้ว อยู่นิ่ง ๆ");
      assert(h.hostState === "ok", "host ok");
      const green = await page.evaluate(() => getComputedStyle(document.getElementById("frCam")).outlineColor);
      assert(green !== neutral && isGreen(green), "frame green when ok: " + green + " vs " + neutral);
      // the read button keeps its own rule (unchanged): enabled for a good single face
      assert(await page.evaluate(() => !document.getElementById("frRead").disabled), "read enabled as before");
      await setDets(page, [FACE_OK, FACE_2]);
      await hintIs(page, "frHint", "multi", "ให้มีคนเดียวในกรอบ");
      assert(await page.evaluate(() => document.getElementById("frRead").disabled), "read still disabled with two faces (unchanged rule)");
      await setDets(page, [FACE_OK]);
      await hintIs(page, "frHint", "ok", "ดีแล้ว อยู่นิ่ง ๆ");
      await startLang(page, "en");
      await hintIs(page, "frHint", "ok", "Good — stay still");
      await setDets(page, [FACE_OUT]);
      await hintIs(page, "frHint", "out", "Move into the frame");
      await startLang(page, "zh");
      await hintIs(page, "frHint", "out", "请进入框内");
      await setDets(page, [FACE_OK]);
      await hintIs(page, "frHint", "ok", "很好，保持不动");
      await startLang(page, "th");
      await hintIs(page, "frHint", "ok", "ดีแล้ว อยู่นิ่ง ๆ");
      await darkStill(page);
      await hintIs(page, "frHint", "dark", "มืดไป เพิ่มแสงอีกหน่อย", 8000);
      // no auto-capture: nothing was read
      assert(await page.evaluate(() => document.getElementById("frResult").hidden), "no auto-capture");
      await privacy(page);
      const errs = realErrors(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });
  } finally { await browser.close(); }
}
