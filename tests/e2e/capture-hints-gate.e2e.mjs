// tests/e2e/capture-hints-gate.e2e.mjs — independent review of capture hints (2026-11-13), blockers B1 and B2:
// the hint must never say "good" (state ok, green frame) while the page itself refuses.
//   B1 faceread: never ok / green while the Read button is disabled (sampled every 30 ms after the face goes bad).
//   B2 palm: never ok / green once the page's own checklist has failed for 1 s (too bright picture with a good hand).
// Page fakes as in capture-hints.e2e.mjs (?cpu&fakedet, window.__dets, fake-cams.js); no images of people.
// Locked before the fix: ~/LENSIQ-field/evals/capture-hints/locked.sha256.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const HAND_OK = { x: 0.195, y: 0.1, w: 0.61, h: 0.805, score: 0.95, side: "left" };
const FACE_OK = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const FACE_FAR = { x: 0.44, y: 0.33, w: 0.12, h: 0.18, score: 0.95 };
const FACE_OUT = { x: 0.02, y: 0.25, w: 0.25, h: 0.35, score: 0.95 };
const FACE_2 = { x: 0.72, y: 0.3, w: 0.22, h: 0.35, score: 0.9 };
const detScript = `(() => {
  window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" };
  window.__dets = [];
  window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d));
})();`;
const setDets = (page, dets) => page.evaluate(d => { window.__dets = d; }, dets);
const click = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
function isGreen(css) {
  const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(css || "");
  return !!m && +m[2] > +m[1] + 40 && +m[2] > +m[3] + 40;
}
const waitOk = (page, id) => page.waitFor(`document.getElementById(${JSON.stringify(id)}).dataset.state === "ok"`, 6000);

/** sample `ms` every `every` ms; return samples where the page refuses but the hint / frame says good */
async function badSamples(page, camId, hintId, refusedExpr, ms, every = 30) {
  const bad = [], end = Date.now() + ms;
  let n = 0;
  while (Date.now() < end) {
    const s = await page.evaluate(`(() => { const h = document.getElementById(${JSON.stringify(hintId)}), c = document.getElementById(${JSON.stringify(camId)});
      return { refused: !!(${refusedExpr}), state: h.dataset.state, text: h.textContent, outline: getComputedStyle(c).outlineColor, host: c.getAttribute("data-chint") }; })()`);
    n++;
    if (s.refused && (s.state === "ok" || s.host === "ok" || isGreen(s.outline))) bad.push(s);
    await sleep(every);
  }
  return { bad, n };
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    await check("faceread B1: after ok, a bad face never shows ok / green while Read is disabled (two faces, far, out)", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, detScript] });
      await page.goto(`${base}/faceread.html?cpu&fakedet`);
      await page.waitFor(`!!document.getElementById("frStartCam")`, 10000);
      await click(page, "#frStartCam");
      await page.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
      for (const [name, dets] of [["two faces", [FACE_OK, FACE_2]], ["far", [FACE_FAR]], ["out", [FACE_OUT]]]) {
        await setDets(page, [FACE_OK]);
        await waitOk(page, "frHint");
        await page.waitFor(`!document.getElementById("frRead").disabled`, 6000);
        await setDets(page, dets);
        const r = await badSamples(page, "frCam", "frHint", `document.getElementById("frRead").disabled`, 1500);
        assert(!r.bad.length, `${name}: ok/green while Read disabled in ${r.bad.length}/${r.n} samples, e.g. ${JSON.stringify(r.bad[0])}`);
        // the Read rule itself is unchanged (FR.quality / qOk): two faces disable it; a face off-centre or small may not
        if (name === "two faces") assert(await page.evaluate(() => document.getElementById("frRead").disabled), "two faces: Read disabled (unchanged rule)");
      }
      // still reaches ok again with a good single face (the gate does not get stuck)
      await setDets(page, [FACE_OK]);
      await waitOk(page, "frHint");
      assert(isGreen(await page.evaluate(() => getComputedStyle(document.getElementById("frCam")).outlineColor)), "green again when ok");
      await page.close();
    });

    await check("palm B2: a too-bright picture with a good hand: no ok / green once the checklist has failed for 1 s", async () => {
      const page = await browser.newPage(null, { initScripts: [fakeCams, detScript] });
      await page.goto(`${base}/palm.html?cpu&fakedet`);
      await page.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
      await click(page, '[data-side="auto"]');
      await click(page, "#plStartCam");
      await page.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 8000);
      await setDets(page, [HAND_OK]);
      await waitOk(page, "plHint");
      // bright picture: the page's <video> is fed from a canvas painted near-white
      await page.evaluate(() => {
        const v = document.querySelector("video"), c = document.createElement("canvas"); c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
        const x = c.getContext("2d"), paint = () => { x.fillStyle = "rgb(252,252,252)"; x.fillRect(0, 0, c.width, c.height); };
        paint(); setInterval(paint, 50);
        v.srcObject = c.captureStream(15); v.play().catch(() => {});
      });
      await page.waitFor(`!!document.querySelector("#plQc li.no")`, 8000);
      await sleep(1000);
      const r = await badSamples(page, "plCam", "plHint", `document.querySelector("#plQc li.no")`, 2500, 50);
      assert(r.n > 10, "sampled");
      assert(!r.bad.length, `ok/green while the checklist fails in ${r.bad.length}/${r.n} samples, e.g. ${JSON.stringify(r.bad[0])}`);
      await page.close();
    });
  } finally { await browser.close(); }
}
