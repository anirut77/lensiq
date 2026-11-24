// tests/e2e/report-late.e2e.mjs — "แจ้งปัญหาคำทำนายนี้" (lensiq-report.js) also reaches a reading that was on screen BEFORE the
// script loaded (faceread C1, docs/acceptance/faceread.md: the first reading after opening the page had no button, every later one
// had it). Locked before the fix (evals-locks/faceread-90.sha256). nav.js loads lensiq-report.js async; here its insertion is held
// back until the reading is shown (window.__releaseReport()), so the order is forced, not left to timing.
//  R1 TH / EN / ZH: after release, exactly one report button right after the reading box, its label in the page language, and the
//     dialog's preview holds the reading's own text;
//  R2 crisis state (html[data-lq-crisis]) at release time: no button is added;
//  R3 a reading made after the script loaded still gets exactly one button (no duplicate).
import { assert } from "./cdp.mjs";

const HOLD = `(function () {
  var held = [], ap = Node.prototype.appendChild;
  Node.prototype.appendChild = function (n) {
    if (n && n.tagName === "SCRIPT" && /^lensiq-report\\.js/.test(n.getAttribute("src") || "") && !window.__reportFree) { held.push([this, n]); return n; }
    return ap.call(this, n);
  };
  window.__releaseReport = function () { window.__reportFree = true; held.forEach(function (h) { ap.call(h[0], h[1]); }); held = []; };
  window.__LQ_FAKE_DET = function () { return [{ x: 0.3, y: 0.2, w: 0.4, h: 0.55, score: 0.97 }]; };
})();`;
const GREY = async () => {
  const cv = document.createElement("canvas"); cv.width = 640; cv.height = 480;
  const g = cv.getContext("2d"); g.fillStyle = "#8a8a8a"; g.fillRect(0, 0, 640, 480);
  const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.9));
  const inp = document.querySelector("#frFile"), dt = new DataTransfer();
  dt.items.add(new File([blob], "grey.jpg", { type: "image/jpeg" })); inp.files = dt.files;
  inp.dispatchEvent(new Event("change", { bubbles: true }));
};
const READ_DONE = "(() => { const f = document.querySelector('#frForce'); if (f && !f.hidden) f.click(); const n = document.querySelector('#frNarr'); return !document.querySelector('#frResult').hidden && n.textContent.trim().length > 20 && n.getAttribute('aria-busy') !== 'true'; })()";
const LABEL = { th: "แจ้งปัญหาคำทำนายนี้", en: /report/i, zh: /[一-鿿]/ };
const wraps = () => document.querySelectorAll(".lq-rp-wrap").length;

async function readingBeforeScript(browser, base, lang) {
  const p = await browser.newPage(null, { initScripts: [HOLD], isolated: true, timeout: 30000 });
  await p.goto(`${base}/faceread.html?lang=${lang}&fakedet`);
  await p.waitFor("!!window.FRCore && !!document.querySelector('#frFile') && !!window.LQI18N && !!window.__releaseReport", 20000);
  await p.evaluate(GREY);
  await p.waitFor(READ_DONE, 30000);
  assert(await p.evaluate(() => !window.LQReport && document.querySelectorAll(".lq-rp-wrap").length === 0), "precondition: the reading is shown before lensiq-report.js");
  return p;
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`report button late ${lang}: R1 a reading already on screen gets the button when lensiq-report.js loads; R3 no duplicate later`, async () => {
        const p = await readingBeforeScript(browser, base, lang);
        await p.evaluate(() => window.__releaseReport());
        await p.waitFor("!!window.LQReport && document.querySelectorAll('.lq-rp-wrap').length > 0", 15000);
        const r = await p.evaluate(() => {
          const w = document.querySelectorAll(".lq-rp-wrap"), n = document.querySelector("#frNarr");
          return { n: w.length, after: n.nextElementSibling === w[0], label: w[0] && w[0].textContent.trim() };
        });
        assert(r.n === 1 && r.after, "one button right after the reading box: " + JSON.stringify(r));
        const want = LABEL[lang];
        assert(typeof want === "string" ? r.label === want : want.test(r.label), `${lang} label: ` + r.label);
        const pv = await p.evaluate(() => {
          document.querySelector(".lq-rp-btn").click();
          const d = document.querySelector("dialog.lq-rp"), ta = d && d.querySelector("textarea[readonly], textarea:last-of-type");
          const txt = d ? Array.from(d.querySelectorAll("textarea")).map(t => t.value).join("\n") : "";
          const first = (document.querySelector("#frNarr .fa-section p") || {}).textContent || "";
          const out = { open: !!d, has: first.length > 10 && txt.includes(first.trim().slice(0, 40)), ta: !!ta };
          if (d) d.close();
          return out;
        });
        assert(pv.open && pv.has, "the dialog preview carries the reading's own text: " + JSON.stringify(pv));
        // R3: a new reading after the script is loaded -> still exactly one button
        await p.evaluate(() => document.querySelector("#frRegen").click());
        await p.waitFor("document.querySelector('#frNarr').getAttribute('aria-busy') !== 'true'", 15000);
        assert(await p.evaluate(wraps) === 1, "R3: exactly one report button after re-rendering");
        await p.close();
      });
    }
    await check("report button late: R2 crisis state at load time -> no button added", async () => {
      const p = await readingBeforeScript(browser, base, "th");
      await p.evaluate(() => { document.documentElement.setAttribute("data-lq-crisis", ""); window.__releaseReport(); });
      await p.waitFor("!!window.LQReport", 15000);
      await new Promise(r => setTimeout(r, 1500));
      assert(await p.evaluate(wraps) === 0, "no report button in the crisis state");
      await p.close();
    });
  } finally { await browser.close(); }
}
