// tests/e2e/d2-fixes.e2e.mjs — FIXED TEST SET, D2 component audit (owner order 2026-11-14, D2; audit 2026-11-15,
// ~/LENSIQ-field/review/d2-2026-11-15/DEFECTS.md). Locked BEFORE the product fixes
// (sha256 in evals-locks/d2.sha256 and ~/LENSIQ-field/evals/d2/locked.sha256).
//   d2-001  bazi / taksa / lek7 / lifegraph: the birth-date message is English / Chinese in EN / ZH (not Thai)
//   d2-002  studio: a refused camera gives an English message in EN and a Chinese one in ZH
//   d2-003  fengshui: a refused camera gives a note with no Thai in EN / ZH
//   d2-004  fengshui: the "record direction" toast has no Thai in EN / ZH
//   d2-005  tarot: the card-fan hint is never Thai in ZH / EN, also right after the fan opens
//   d2-006  photobooth: switching to the Photo-booth tab while an ID photo is processing leaves no broken ID result
//           buttons (no script error from any visible result button), and the ID result works when switching back
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const THAI = /[ก-ฺเ-๛]/;
const LANG = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const DENY = `(() => { const md = navigator.mediaDevices; if (!md) return;
  md.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")); })();`;
const errText = p => p.consoleErrors.filter(e => e.kind === "exception").map(e => String(e.text).split("\n")[0]);

export default async function (ctx) {
  const { base, launch, check } = ctx;
  const browser = await launch();
  try {
    // ---------- d2-001 ----------
    for (const pg of ["bazi", "taksa", "lek7", "lifegraph"]) {
      for (const l of ["en", "zh"]) {
        await check(`d2-001 ${pg} ${l}: empty birth year gives a ${l} message, no Thai`, async () => {
          const page = await browser.newPage(`${base}/${pg}.html`, { initScripts: [LANG(l)] });
          try {
            await page.waitFor(() => window.LQI18N && document.documentElement.lang !== "th" && !!document.getElementById("lcForm"), 10000);
            await sleep(400);
            await page.evaluate(() => { const y = /** @type {HTMLInputElement} */ (document.getElementById("lcYear")); y.value = ""; document.getElementById("lcForm").requestSubmit(); });
            const msg = await page.waitFor(() => (document.getElementById("lcMsg").textContent || "").trim() || null, 5000);
            assert(!THAI.test(msg), `${pg} ${l}: message is Thai: "${msg}"`);
            await page.evaluate(() => { /** @type {HTMLInputElement} */ (document.getElementById("lcYear")).value = "zz!"; document.getElementById("lcForm").requestSubmit(); });
            await sleep(300);
            const msg2 = await page.evaluate(() => (document.getElementById("lcMsg").textContent || "").trim());
            assert(msg2 && !THAI.test(msg2), `${pg} ${l}: junk-year message is empty or Thai: "${msg2}"`);
          } finally { await page.close(); }
        });
      }
    }

    // ---------- d2-002 ----------
    for (const l of ["en", "zh"]) {
      await check(`d2-002 studio ${l}: refused camera message has no Thai`, async () => {
        const page = await browser.newPage(`${base}/studio.html`, { initScripts: [LANG(l), DENY] });
        try {
          await page.waitFor(() => window.LQI18N && document.documentElement.lang !== "th" && !!document.getElementById("stCamBtn"), 10000);
          await sleep(500);
          await page.evaluate(() => document.getElementById("stCamBtn").click());
          const t = await page.waitFor(() => (document.getElementById("toast").textContent || "").trim() || null, 8000);
          await sleep(600); // the run-time translator rewrites the text right after it is written
          const t2 = await page.evaluate(() => (document.getElementById("toast").textContent || "").trim());
          assert(!THAI.test(t2), `studio ${l}: toast is Thai: "${t2}" (first "${t}")`);
          assert(l === "en" ? /camera|permission/i.test(t2) : /摄像头|相机|权限/.test(t2), `studio ${l}: toast does not name the camera permission: "${t2}"`);
        } finally { await page.close(); }
      });
    }

    // ---------- d2-003 ----------
    for (const l of ["en", "zh"]) {
      await check(`d2-003 fengshui ${l}: refused camera note has no Thai`, async () => {
        const page = await browser.newPage(`${base}/fengshui.html`, { initScripts: [LANG(l), DENY] });
        try {
          await page.waitFor(() => window.LQI18N && document.documentElement.lang !== "th" && !!document.getElementById("fsCompassStart"), 10000);
          await sleep(500);
          await page.evaluate(() => document.getElementById("fsCompassStart").click());
          const n = await page.waitFor(() => { const e = document.getElementById("fsCamNote"); return e && !e.hidden && (e.textContent || "").trim() || null; }, 8000);
          await sleep(400);
          const n2 = await page.evaluate(() => (document.getElementById("fsCamNote").textContent || "").trim());
          assert(!THAI.test(n2), `fengshui ${l}: camera note has Thai: "${n2}" (first "${n}")`);
        } finally { await page.close(); }
      });
    }

    // ---------- d2-004 ----------
    for (const l of ["en", "zh"]) {
      await check(`d2-004 fengshui ${l}: record-direction toast has no Thai`, async () => {
        const page = await browser.newPage(`${base}/fengshui.html`, { initScripts: [LANG(l)] });
        try {
          await page.waitFor(() => window.LQI18N && document.documentElement.lang !== "th" && !!document.getElementById("fsHeadingSlider"), 10000);
          await sleep(500);
          await page.evaluate(() => {
            const s = /** @type {HTMLInputElement} */ (document.getElementById("fsHeadingSlider")); s.value = "90"; s.dispatchEvent(new Event("input", { bubbles: true }));
          });
          for (const k of ["door", "desk", "bed"]) {
            await page.evaluate(k => /** @type {HTMLElement} */ (document.querySelector(`[data-rec="${k}"]`)).click(), k);
            await sleep(300);
            const t = await page.evaluate(() => (document.getElementById("fsToast").textContent || "").trim());
            assert(t, `fengshui ${l} ${k}: no toast`);
            assert(!THAI.test(t), `fengshui ${l} ${k}: toast has Thai: "${t}"`);
          }
        } finally { await page.close(); }
      });
    }

    // ---------- d2-005 ----------
    for (const l of ["zh", "en"]) {
      await check(`d2-005 tarot ${l}: card-fan hint is never Thai after shuffling`, async () => {
        const page = await browser.newPage(`${base}/tarot.html`, { initScripts: [LANG(l)] });
        try {
          await page.waitFor(() => window.LQI18N && document.documentElement.lang !== "th" && !!document.getElementById("trSetup"), 10000);
          await sleep(600);
          const seen = await page.evaluate(async () => {
            const out = [];
            const hint = document.getElementById("trFanHint");
            const f = /** @type {HTMLFormElement} */ (document.getElementById("trSetup")); f.requestSubmit();
            for (let i = 0; i < 30; i++) { if (hint && !hint.hidden && hint.getClientRects().length) out.push(hint.textContent.trim()); await new Promise(r => setTimeout(r, 100)); }
            return out;
          });
          assert(seen.length, `tarot ${l}: the hint never showed`);
          const bad = seen.filter(t => THAI.test(t));
          assert(!bad.length, `tarot ${l}: hint was Thai ${bad.length}/${seen.length} times: "${bad[0]}"`);
        } finally { await page.close(); }
      });
    }

    // ---------- d2-006 ----------
    await check("d2-006 photobooth: tab switch during ID-photo processing leaves no broken result buttons", async () => {
      const page = await browser.newPage(`${base}/photobooth.html`, { initScripts: [LANG("th")], timeout: 30000 });
      try {
        await page.waitFor(() => !!document.getElementById("shoot") && document.querySelectorAll("[role=tab]").length >= 2, 15000);
        const tab = name => page.evaluate(n => { const t = [...document.querySelectorAll("[role=tab]")].find(t => t.textContent.includes(n)); if (t) /** @type {HTMLElement} */ (t).click(); return !!t; }, name);
        assert(await tab("รูปติดบัตร"), "no ID-photo tab");
        await sleep(3000);
        await page.evaluate(() => document.getElementById("shoot").click());
        await sleep(800); // capture is under way (countdown / processing)
        assert(await tab("ตู้สติ๊กเกอร์"), "no photo-booth tab");
        // wait for the ID processing to finish (the capture keeps running after the switch)
        await sleep(15000);
        const before = errText(page).length;
        const state = await page.evaluate(async () => {
          const r = document.getElementById("result"), btns = [...document.querySelectorAll("#resultActions button")].filter(b => b.getClientRects().length);
          const shown = !!r && !r.hidden;
          for (const b of btns) { if (/ถ่ายใหม่|retake|重拍/i.test(b.textContent)) continue; /** @type {HTMLElement} */ (b).click(); await new Promise(z => setTimeout(z, 300));
            const d = /** @type {HTMLDialogElement|null} */ (document.querySelector("dialog[open]")); if (d) d.close(); }
          return { shown, labels: btns.map(b => b.textContent.trim()) };
        });
        await sleep(500);
        const errs = errText(page).slice(before);
        assert(!errs.length, `photobooth: result buttons on the Photo-booth tab threw: ${errs.join(" | ")} (buttons: ${state.labels.join(", ")})`);
        // back to the ID tab: the captured photo is shown and its buttons work
        assert(await tab("รูปติดบัตร"), "no ID-photo tab (back)");
        await sleep(1500);
        const before2 = errText(page).length;
        await page.evaluate(async () => {
          const btns = [...document.querySelectorAll("#resultActions button")].filter(b => b.getClientRects().length && !/ถ่ายใหม่|retake|重拍/i.test(b.textContent));
          for (const b of btns) { /** @type {HTMLElement} */ (b).click(); await new Promise(z => setTimeout(z, 300)); const d = /** @type {HTMLDialogElement|null} */ (document.querySelector("dialog[open]")); if (d) d.close(); }
        });
        await sleep(500);
        const errs2 = errText(page).slice(before2);
        assert(!errs2.length, `photobooth: ID result buttons threw after switching back: ${errs2.join(" | ")}`);
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}
