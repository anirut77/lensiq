// tests/e2e/attendance-pin-default.e2e.mjs — FIXED TEST, SELL-READY 2026-11-23 decision 3 option ก (D1), locked in
// evals-locks/attendance-pin-default.sha256 (~/LENSIQ-field/evals/attendance-pin-default/) BEFORE the product change on
// branch attendance-pin-default. Headless Chrome, Chrome's fake camera, no ?fakedet (the real page path).
//   P1  the bare URL attendance.html (what every site link and a pasted link opens) is the PIN / QR time clock: employee
//       mode button pressed, PIN / QR tab active and its pane shown, h1 and tab title name PIN / QR in TH / EN / ZH, no
//       camera request, and no face library (vendor/face-api.js) or face model (vendor/models/) is fetched
//   P2  the same holds when this browser last used face (training) mode: a stored setting never loads face models on the
//       bare URL
//   P3  face mode stays reachable: pressing the face (training) mode button opens the camera and fetches face-api.js and
//       the face models, and a reload keeps face mode (the URL then carries ?mode=training) (TH / EN / ZH)
//   P4  attendance.html?mode=training opens face mode directly: camera requested, face models fetched
// Synthetic data and Chrome's fake camera only; no person is photographed.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/;
const HAN = /[一-鿿]/;
const inLang = (l, t) => (l === "th" ? THAI.test(t) : !THAI.test(t) && (l === "en" ? /[a-z]/i.test(t) : HAN.test(t)));
const LANG = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {} window.confirm = () => true; window.alert = () => {};`;
const TRAINING_STORED = `try { if (!sessionStorage.getItem("apd-seeded")) { sessionStorage.setItem("apd-seeded", "1");
  localStorage.setItem("att-hr-settings", JSON.stringify({ mode: "training" })); } } catch (e) {}`;
const GUM = `(() => { window.__gum = 0; const md = navigator.mediaDevices; if (!md || !md.getUserMedia) return;
  const real = md.getUserMedia.bind(md); md.getUserMedia = c => { window.__gum++; return real(c); }; })();`;
const FACE_RE = /vendor\/face-api\.js|vendor\/models\//;
const ready = async (page, l) => {
  const L = JSON.stringify(l);
  await page.waitFor(`(window.LQI18N || ${L} === "th") && document.documentElement.lang.slice(0, 2) === ${L} && !!window.LQHR`, 15000);
  await sleep(500);
};
const state = page => page.evaluate(re => {
  const vis = e => !!e && !e.closest("[hidden]") && getComputedStyle(e).display !== "none" && e.getClientRects().length > 0;
  const rx = new RegExp(re);
  const emp = document.querySelector('.mode-btn[data-mode="employee"]'), tr = document.querySelector('.mode-btn[data-mode="training"]');
  const h1 = [...document.querySelectorAll("h1 span")].filter(vis).map(e => e.textContent.trim()).join(" ");
  return {
    gum: window.__gum,
    face: performance.getEntriesByType("resource").map(e => e.name).filter(n => rx.test(n)),
    faceScript: [...document.scripts].some(s => /face-api/.test(s.src)) || !!window.faceapi,
    empPressed: !!emp && emp.getAttribute("aria-pressed") === "true",
    trPressed: !!tr && tr.getAttribute("aria-pressed") === "true",
    bodyEmp: document.body.classList.contains("att-emp"),
    pinActive: !!document.getElementById("tabPin") && document.getElementById("tabPin").classList.contains("active"),
    pinShown: vis(document.getElementById("pane-pin")),
    h1, title: document.title, search: location.search
  };
}, FACE_RE.source);

export default async function ({ base, launch, check }) {
  const browser = await launch();
  const open = async (url, l, extra = []) => {
    const p = await browser.newPage(null, { initScripts: [LANG(l), GUM, ...extra], isolated: true, timeout: 30000 });
    await p.goto(url);
    return p;
  };
  const pinDefault = async (page, l, label) => {
    await ready(page, l);
    await sleep(3000);
    const r = await state(page);
    assert(r.bodyEmp && r.empPressed && !r.trPressed, `${label}: not in PIN / QR (employee) mode: ${JSON.stringify(r)}`);
    assert(r.pinActive && r.pinShown, `${label}: PIN / QR tab not active or its pane not shown`);
    assert(/PIN/.test(r.h1) && inLang(l, r.h1), `${label}: h1 does not name PIN / QR in ${l}: "${r.h1}"`);
    assert(/PIN/.test(r.title) && inLang(l, r.title), `${label}: tab title does not name PIN / QR in ${l}: "${r.title}"`);
    assert(!/ใบหน้า|face|人脸/i.test(r.title), `${label}: tab title names face: "${r.title}"`);
    assert(r.gum === 0, `${label}: camera requested ${r.gum} time(s) on open`);
    assert(!r.face.length && !r.faceScript, `${label}: face library / models fetched on open: ${r.face.slice(0, 3).join(", ")}`);
  };
  const faceLoads = async (page, label) => {
    await page.waitFor(`window.__gum > 0`, 15000).catch(() => {});
    await page.waitFor(`performance.getEntriesByType("resource").some(e => /vendor\\/models\\//.test(e.name)) && !!window.faceapi`, 30000).catch(() => {});
    const r = await state(page);
    assert(r.gum > 0, `${label}: face mode did not request the camera`);
    assert(r.faceScript && r.face.some(n => /vendor\/face-api\.js/.test(n)), `${label}: face mode did not fetch vendor/face-api.js`);
    assert(r.face.some(n => /vendor\/models\//.test(n)), `${label}: face mode did not fetch any face model`);
    assert(r.trPressed && !r.bodyEmp, `${label}: face (training) mode button not pressed`);
    return r;
  };
  try {
    for (const l of LANGS) {
      await check(`P1 [${l}] bare attendance.html opens the PIN / QR time clock and fetches no face library or model`, async () => {
        const page = await open(`${base}/attendance.html`, l);
        try { await pinDefault(page, l, "bare URL"); } finally { await page.close(); }
      });
    }
    await check("P2 [th] bare attendance.html after this browser used face mode: still PIN / QR, no face model", async () => {
      const page = await open(`${base}/attendance.html`, "th", [TRAINING_STORED]);
      try { await pinDefault(page, "th", "stored training setting"); } finally { await page.close(); }
    });
    for (const l of LANGS) {
      await check(`P3 [${l}] the face (training) mode button loads face mode; a reload keeps it`, async () => {
        const page = await open(`${base}/attendance.html`, l);
        try {
          await pinDefault(page, l, "before choosing face");
          await page.evaluate(() => /** @type {HTMLElement} */ (document.querySelector('.mode-btn[data-mode="training"]')).click());
          const r = await faceLoads(page, "after the face button");
          assert(/[?&]mode=training\b/.test(r.search), "the URL does not keep face mode: " + r.search);
          assert(inLang(l, r.title) && !/PIN/.test(r.title), `face mode tab title in ${l}: "${r.title}"`);
          await page.reload();
          await ready(page, l);
          await faceLoads(page, "after reload");
        } finally { await page.close(); }
      });
    }
    await check("P4 [th] attendance.html?mode=training opens face mode directly", async () => {
      const page = await open(`${base}/attendance.html?mode=training`, "th");
      try { await ready(page, "th"); await faceLoads(page, "?mode=training"); } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}
