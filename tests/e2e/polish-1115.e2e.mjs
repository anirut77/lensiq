// tests/e2e/polish-1115.e2e.mjs — FIXED TEST SET, polish round 2026-11-15 (D2 audit items D2-008, D2-009, D2-010,
// D2-012, D2-013; ~/LENSIQ-field/review/d2-2026-11-15/DEFECTS.md). Locked BEFORE the product fixes
// (sha256 in evals-locks/polish-1115.sha256 and ~/LENSIQ-field/evals/polish-1115/locked.sha256).
//   p-008  exam-dashboard: "Save accommodation" with an empty seat gives a message that is on screen while the form
//          is on screen (TH / EN / ZH, in that language)
//   p-009  interview: "Add" with an empty interviewer name gives a message (TH / EN / ZH, in that language)
//   p-010  checkout: "Search" with an empty barcode box gives a message in the same card (TH / EN / ZH)
//   p-012  photobooth: with the camera refused, the error line never lists a "ready" status, and it names one next
//          step (TH / EN / ZH)
//   p-013  exam-hall: the status line (seats / fps / people) is there on first load, in the page language
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const THAI = /[ก-ฺเ-๛]/;
const HAN = /[一-鿿]/;
const LANG = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {}`;
const DENY = `(() => { const md = navigator.mediaDevices; if (!md) return;
  md.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError")); })();`;
const LANGS = ["th", "en", "zh"];
const inLang = (l, t) => (l === "th" ? THAI.test(t) : !THAI.test(t) && (l === "en" ? /[a-z]/i.test(t) : HAN.test(t)));
const ready = async (page, l, sel) => {
  const L = JSON.stringify(l);
  await page.waitFor(`(window.LQI18N || ${L} === "th") && document.documentElement.lang.slice(0, 2) === ${L} && !!document.querySelector(${JSON.stringify(sel)})`, 15000);
  await sleep(600);
};

/** Submits a form after scrolling its submit button into view; returns the texts of live regions / toasts that changed
 *  and are visible (and, with onScreen, inside the viewport), read 700 ms after the submit (the run-time translator
 *  rewrites text right after it is written). scope = CSS selector the message must be inside (default: document). */
async function feedback(page, formSel, { scope = null, onScreen = false } = {}) {
  return page.evaluate(async ([formSel, scope, onScreen]) => {
    const f = /** @type {HTMLFormElement} */ (document.querySelector(formSel));
    const b = f.querySelector("[type=submit]") || f;
    b.scrollIntoView({ block: "center" });
    await new Promise(r => setTimeout(r, 300));
    const root = scope ? document.querySelector(scope) : document;
    const live = () => [...root.querySelectorAll("[role=status],[role=alert],[aria-live],.toast,.form-msg")];
    const before = new Map(live().map(e => [e, (e.textContent || "").trim()]));
    f.requestSubmit();
    await new Promise(r => setTimeout(r, 700));
    const out = [];
    for (const e of live()) {
      const t = (e.textContent || "").trim();
      if (!t || before.get(e) === t) continue;
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      if (!e.getClientRects().length || cs.visibility === "hidden" || +cs.opacity < 0.1) continue;
      if (onScreen && (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth)) continue;
      out.push(t);
    }
    return out;
  }, [formSel, scope, onScreen]);
}

export default async function (ctx) {
  const { base, launch, check } = ctx;
  const browser = await launch();
  try {
    // ---------- p-008 ----------
    for (const l of LANGS) {
      await check(`p-008 exam-dashboard ${l}: empty accommodation save gives an on-screen message`, async () => {
        const page = await browser.newPage(`${base}/exam-dashboard.html`, { initScripts: [LANG(l)] });
        try {
          await ready(page, l, "#accForm");
          await page.evaluate(() => { /** @type {HTMLInputElement} */ (document.getElementById("accSeat")).value = ""; });
          const seen = await feedback(page, "#accForm", { onScreen: true });
          assert(seen.length, `exam-dashboard ${l}: no message on screen next to the form`);
          assert(seen.some(t => inLang(l, t)), `exam-dashboard ${l}: message not in ${l}: ${JSON.stringify(seen)}`);
        } finally { await page.close(); }
      });
    }

    // ---------- p-009 ----------
    for (const l of LANGS) {
      await check(`p-009 interview ${l}: Add with an empty name gives a message`, async () => {
        const page = await browser.newPage(`${base}/interview.html`, { initScripts: [LANG(l)] });
        try {
          await ready(page, l, "#ivWhoForm");
          await page.evaluate(() => { /** @type {HTMLInputElement} */ (document.getElementById("ivWho")).value = ""; });
          const n0 = await page.evaluate(() => document.querySelectorAll("#ivWhoList li").length);
          const seen = await feedback(page, "#ivWhoForm");
          assert(seen.length, `interview ${l}: nothing shown`);
          assert(seen.some(t => inLang(l, t)), `interview ${l}: message not in ${l}: ${JSON.stringify(seen)}`);
          assert(await page.evaluate(() => document.querySelectorAll("#ivWhoList li").length) === n0, `interview ${l}: an empty interviewer was added`);
        } finally { await page.close(); }
      });
    }

    // ---------- p-010 ----------
    for (const l of LANGS) {
      await check(`p-010 checkout ${l}: empty search gives a message next to the search box`, async () => {
        const page = await browser.newPage(`${base}/checkout.html`, { initScripts: [LANG(l)] });
        try {
          await ready(page, l, "#bcForm");
          await page.evaluate(() => { const c = document.getElementById("bcForm").closest(".card"); if (c) c.setAttribute("data-p010", "1"); });
          const seen = await feedback(page, "#bcForm", { scope: "[data-p010]", onScreen: true });
          assert(seen.length, `checkout ${l}: nothing shown next to the search box`);
          assert(seen.some(t => inLang(l, t)), `checkout ${l}: message not in ${l}: ${JSON.stringify(seen)}`);
        } finally { await page.close(); }
      });
    }

    // ---------- p-012 ----------
    const READY = { th: /พร้อม/, en: /\bready\b/i, zh: /就绪/ };
    const NEXT = { th: /ตั้งค่า|โหลดหน้า|เบราว์เซอร์/, en: /settings|reload|browser/i, zh: /设置|重新加载|浏览器/ };
    for (const l of LANGS) {
      await check(`p-012 photobooth ${l}: refused camera line lists failures only and one next step`, async () => {
        const page = await browser.newPage(`${base}/photobooth.html`, { initScripts: [LANG(l), DENY], timeout: 30000 });
        try {
          await page.waitFor(() => { const e = document.getElementById("engine"); return !!e && e.classList.contains("err"); }, 15000);
          const seen = [];
          for (let i = 0; i < 30; i++) { // models keep loading after the camera failed: watch the line for 15 s
            seen.push(await page.evaluate(() => { const e = document.getElementById("engine"); return { err: e.classList.contains("err"), t: (e.textContent || "").trim() }; }));
            await sleep(500);
          }
          const errs = seen.filter(s => s.err);
          assert(errs.length, `photobooth ${l}: the error line went away`);
          const withReady = errs.filter(s => READY[l].test(s.t));
          assert(!withReady.length, `photobooth ${l}: error line lists a ready status: "${withReady.length && withReady[withReady.length - 1].t}"`);
          const last = errs[errs.length - 1].t;
          assert(NEXT[l].test(last), `photobooth ${l}: no next step in "${last}"`);
          assert(inLang(l, last), `photobooth ${l}: error line not in ${l}: "${last}"`);
        } finally { await page.close(); }
      });
    }

    // ---------- p-013 ----------
    for (const l of LANGS) {
      await check(`p-013 exam-hall ${l}: status line is there on first load`, async () => {
        const page = await browser.newPage(`${base}/exam-hall.html`, { initScripts: [LANG(l)] });
        try {
          await ready(page, l, "#kv");
          const t = await page.evaluate(() => (document.getElementById("kv").textContent || "").trim());
          assert(t, `exam-hall ${l}: status line empty on first load`);
          assert(/\d/.test(t) && inLang(l, t), `exam-hall ${l}: status line "${t}" not in ${l}`);
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
