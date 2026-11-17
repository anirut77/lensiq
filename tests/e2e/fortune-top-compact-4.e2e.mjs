// tests/e2e/fortune-top-compact-4.e2e.mjs — FIXED TEST SET, fortune top compact part 4: independent re-review of 059ec35 (PASS with
// a keyboard risk) and owner decision 78 ก (2026-11-17, provisional: the sticky read bar stays only if it never covers content or
// another control). Locked BEFORE the fix (evals-locks/fortune-top-compact.sha256, ~/LENSIQ-field/evals/fortune-top-compact/).
//   K1  on every reading page with a form (14) at 360 / 393 / 430 px wide, TH: while an input, textarea or select of the page
//       has focus the sticky read bar (.lq-readbar) is hidden and never intersects the focused field; checked at the normal
//       height (659 px) and at the on-screen-keyboard height the reviewer used (360 px), for the first field of each kind
//       (input, textarea, select) the page shows
//   K2  the visual viewport shrinks (on-screen keyboard: visualViewport.height well below innerHeight, simulated): the bar is
//       hidden
//   K3  M1: the bar activated from the keyboard (focus + Enter) moves focus to the page's own read button (data-lq-read), and the
//       page's own button gets exactly one click
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const READ = ["horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac", "astro", "lifegraph", "planner", "report"];
const phone = (page, w, h) => page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
async function load(page, base, p) {
  await page.goto(`${base}/${p}.html?nosw`);
  await page.waitFor(`document.documentElement.lang === "th" && !!document.querySelector("[data-lq-read]")`, 10000);
  await sleep(700);
}
const BAR = `(() => { const b = document.querySelector(".lq-readbar"); if (!b || b.hidden || !b.getClientRects().length || getComputedStyle(b).visibility === "hidden") return null;
  const r = b.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })()`;
/** the first visible field of each kind in <main> (not inside the bar) */
const FIELDS = `(() => { const out = []; for (const sel of ["input:not([type=hidden])", "textarea", "select"]) {
  // RE-LOCK 2026-11-17 (test fault, first run run-14): a field inside a closed <details> is not on screen and cannot take focus
  const e = [...document.querySelectorAll("main " + sel)].find(x => x.getClientRects().length && !x.disabled && !x.closest(".lq-readbar") && !x.closest("details:not([open])"));
  if (e) { e.setAttribute("data-k4", sel.slice(0, 5)); out.push(sel.slice(0, 5)); } } return out; })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("K1: while a form field has focus the read bar is hidden and never intersects it (14 pages × 360 / 393 / 430 × 659 / 360 px, TH)", async () => {
      const bad = [];
      const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`] });
      try {
        for (const p of READ) {
          await phone(page, 393, 659);
          try { await load(page, base, p); } catch (e) { bad.push(`${p}: did not load`); continue; }
          const kinds = await page.evaluate(FIELDS);
          if (!kinds.length) { bad.push(`${p}: no form field found`); continue; }
          for (const w of [360, 393, 430]) for (const h of [659, 360]) {
            await phone(page, w, h);
            for (const k of kinds) {
              await page.evaluate(`(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0);
                const e = document.querySelector('[data-k4="${k}"]'); e.focus(); e.scrollIntoView({ block: "center" }); window.dispatchEvent(new Event("scroll")); })()`);
              await sleep(300);
              const r = await page.evaluate(`(() => { const e = document.querySelector('[data-k4="${k}"]'); const q = e.getBoundingClientRect();
                return { focused: document.activeElement === e, f: { top: q.top, bottom: q.bottom, left: q.left, right: q.right }, bar: ${BAR} }; })()`);
              const tag = `${p} ${w}×${h} ${k}`;
              if (!r.focused) { bad.push(`${tag}: could not focus the field`); continue; }
              if (r.bar) {
                bad.push(`${tag}: bar shown while the field has focus`);
                const a = r.bar, f = r.f;
                if (a.left < f.right && f.left < a.right && a.top < f.bottom && f.top < a.bottom) bad.push(`${tag}: bar covers the focused field`);
              }
            }
          }
          await page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()");
        }
      } finally { await page.close(); }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 60).join("\n"));
    });

    await check("K2: the visual viewport shrinks (on-screen keyboard, simulated): the bar is hidden (14 pages, 393 × 659, TH)", async () => {
      const bad = [];
      const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`] });
      try {
        await phone(page, 393, 659);
        for (const p of READ) {
          try { await load(page, base, p); } catch (e) { bad.push(`${p}: did not load`); continue; }
          if (!(await page.evaluate(BAR))) continue; // own button on the first screen
          await page.evaluate(`(() => { const vv = window.visualViewport; if (!vv) return;
            Object.defineProperty(vv, "height", { configurable: true, get: () => Math.round(innerHeight * 0.5) });
            vv.dispatchEvent(new Event("resize")); })()`);
          await sleep(300);
          if (await page.evaluate(BAR)) bad.push(`${p}: bar shown while the visual viewport is half the window (keyboard)`);
        }
      } finally { await page.close(); }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.join("\n"));
    });

    await check("K3: the bar activated from the keyboard moves focus to the page's own read button, one click (14 pages, 393 × 659, TH)", async () => {
      const bad = [];
      const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`] });
      try {
        await phone(page, 393, 659);
        for (const p of READ) {
          try { await load(page, base, p); } catch (e) { bad.push(`${p}: did not load`); continue; }
          if (p === "dream") { await page.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันว่างูตัวใหญ่ไล่ตาม"; t.dispatchEvent(new Event("input", { bubbles: true })); t.blur(); }); await sleep(800); }
          if (!(await page.evaluate(BAR))) continue;
          const ok = await page.evaluate(`(() => { window.__clicks = 0; const r = [...document.querySelectorAll("[data-lq-read]")].find(e => e.getClientRects().length);
            window.addEventListener("click", e => { if (e.target === r) { window.__clicks++; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
            const b = document.querySelector(".lq-readbar button"); if (!b || b.disabled) return false; b.focus(); return document.activeElement === b; })()`);
          if (!ok) { bad.push(`${p}: bar button could not take focus`); continue; }
          await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
          await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
          await sleep(500);
          const r = await page.evaluate(`({ clicks: window.__clicks, own: !!document.activeElement && document.activeElement.hasAttribute("data-lq-read") })`);
          if (r.clicks !== 1) bad.push(`${p}: keyboard activation gave ${r.clicks} click(s) on the page's own button`);
          if (!r.own) bad.push(`${p}: focus did not move to the page's own read button`);
        }
      } finally { await page.close(); }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.join("\n"));
    });
  } finally {
    await browser.close();
  }
}
