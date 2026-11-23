// tests/e2e/report-refresh.e2e.mjs — independent review of faceread-90 (900ab7e4), must-fix 1: when lensiq-report.js never wraps
// FortuneAI.renderSections (fortune-ai.js arrived after the script stopped waiting), the report button reached through the page
// observer kept the FIRST reading: after a re-render (nickname change, "tell it another way") the dialog still held reading 1, so on
// a shared device the next person's report could carry the previous person's reading. Locked before the fix
// (evals-locks/faceread-90.sha256). The unwrapped state is forced, not timed: renderSections is pre-marked as already wrapped, so
// lensiq-report.js leaves it alone (same state as the give-up after 60 x 250 ms).
//  U1 TH / EN / ZH: reading 1 -> report dialog text holds reading 1's first paragraph; re-render twice ("tell it another way",
//     then a nickname change) -> each time the dialog holds the reading ON SCREEN now, never the earlier one; one button only;
//  U2 the report header keeps the source: a reading made on the device says "source: local" (never "ai") on this path too.
import { assert } from "./cdp.mjs";

const UNWRAPPED = `(function () {
  var fa;
  Object.defineProperty(window, "FortuneAI", { configurable: true, enumerable: true, get: function () { return fa; },
    set: function (v) { fa = v; try { if (v && typeof v.renderSections === "function") v.renderSections.__lqReport = true; } catch (e) { /* frozen */ } } });
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
// the dialog's text (all text areas) and whether it holds the reading that is on screen now
const DIALOG = () => {
  const btns = document.querySelectorAll(".lq-rp-btn");
  if (btns.length !== 1) return { buttons: btns.length };
  btns[0].click();
  const d = document.querySelector("dialog.lq-rp");
  const txt = d ? Array.from(d.querySelectorAll("textarea")).map(t => t.value).join("\n") : "";
  const paras = Array.from(document.querySelectorAll("#frNarr .fa-section p")).map(p => p.textContent.trim()).filter(t => t.length > 20);
  const now = paras.slice(0, 3).map(t => t.slice(0, 50));
  const out = { buttons: 1, open: !!d, holdsNow: now.length > 0 && now.every(t => txt.includes(t)), first: now[0] || "", src: (txt.match(/^source:\s*(\S+)/m) || [])[1] || null, txt };
  if (d) d.close();
  return out;
};

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of ["th", "en", "zh"]) {
      await check(`report refresh ${lang}: U1 unwrapped renderSections -> the dialog always holds the reading on screen; U2 source kept`, async () => {
        const p = await browser.newPage(null, { initScripts: [UNWRAPPED], isolated: true, timeout: 30000 });
        await p.goto(`${base}/faceread.html?lang=${lang}&fakedet`);
        await p.waitFor("!!window.FRCore && !!document.querySelector('#frFile') && !!window.LQI18N && !!window.LQReport", 20000);
        assert(await p.evaluate(() => window.FortuneAI.renderSections.__lqReport === true), "precondition: lensiq-report.js did not wrap renderSections");
        await p.evaluate(GREY);
        await p.waitFor(READ_DONE, 30000);
        await p.waitFor("document.querySelectorAll('.lq-rp-btn').length === 1", 10000);
        const d1 = await p.evaluate(DIALOG);
        assert(d1.open && d1.holdsNow, "reading 1 in the dialog: " + JSON.stringify({ ...d1, txt: undefined }));
        assert(d1.src === "local", "U2 source line for an on-device reading: " + d1.src);
        // re-render 1: "tell it another way" (new wording, same reading)
        await p.evaluate(() => document.querySelector("#frRegen").click());
        await p.waitFor(`(() => { const t = (document.querySelector('#frNarr .fa-section p') || {}).textContent || ''; return document.querySelector('#frNarr').getAttribute('aria-busy') !== 'true' && t.trim().slice(0, 50) !== ${JSON.stringify(d1.first)}; })()`, 15000);
        const d2 = await p.evaluate(DIALOG);
        assert(d2.buttons === 1 && d2.holdsNow, "after 'tell it another way' the dialog holds the reading on screen: " + JSON.stringify({ ...d2, txt: undefined }));
        assert(!d2.txt.includes(d1.first), "the earlier reading is gone from the dialog");
        // re-render 2: a nickname change (the next person's name)
        await p.evaluate(() => { const n = document.querySelector("#frNick"); n.value = "Nok"; n.dispatchEvent(new Event("change", { bubbles: true })); });
        await p.waitFor("document.querySelector('#frNarr').getAttribute('aria-busy') !== 'true' && document.querySelector('#frNarr').textContent.includes('Nok')", 15000);
        const d3 = await p.evaluate(DIALOG);
        assert(d3.buttons === 1 && d3.holdsNow && d3.txt.includes("Nok"), "after the nickname change the dialog holds the new reading: " + JSON.stringify({ ...d3, txt: undefined }));
        assert(d3.src === "local", "U2 source after re-render: " + d3.src);
        await p.close();
      });
    }
  } finally { await browser.close(); }
}
