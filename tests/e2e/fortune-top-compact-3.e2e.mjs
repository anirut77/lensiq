// tests/e2e/fortune-top-compact-3.e2e.mjs — FIXED TEST SET, fortune top compact part 3: the independent review of 08c7b6f (NOT OK)
// and the coordinator's decision for the owner (2026-11-16). Locked before these fixes were measured
// (evals-locks/fortune-top-compact.sha256, ~/LENSIQ-field/evals/fortune-top-compact/).
//   R1  owner item 3, "the main action is on the first screen" = the button that gives the reading. On every reading page with a
//       form, at 360 / 375 / 393 / 414 / 430 px wide × 640 / 659 px high (TH; EN and ZH at 360 × 640): at load, without
//       scrolling, the page's reading action is fully on the first screen and at least 44 px tall and wide: either its own button
//       or a sticky bar at the bottom (.lq-readbar) whose button carries the same label in the page language. The bar does not
//       cover the top bar's help control; it is hidden while the real button is on screen and in the crisis state
//       (html[data-lq-crisis]); a tap on it reaches the page's own button (one click on that button). Dream: the bar is enabled
//       once a dream is typed, and hidden while the reading is on screen.
//   R2  every fortune page's description (first <p> after the h1) is at most 2 lines at all five widths, TH / EN / ZH.
//   R3  keyboard, compact language switch (360 px), TH / EN / ZH current: after opening it with Enter, Tab reaches both other
//       languages, Escape closes it.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const WIDTHS = [360, 375, 393, 414, 430], HEIGHTS = [640, 659];
const READ = ["horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac", "astro", "lifegraph", "planner", "report"];
const ALL = ["fortune", "cat-fortune", "faceread", "palm", "luckycolor"].concat(READ);
const phone = async (page, w, h) => {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
};
const open = (browser, lang) => browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
async function load(page, base, p, lang) {
  await page.goto(`${base}/${p}.html?nosw`);
  await page.waitFor(`document.documentElement.lang === ${S(HTML_LANG[lang])}`, 10000);
  await sleep(800);
}
const tap = async (page, pt) => {
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(300);
};
const key = async (page, k, shift) => {
  const code = { Enter: 13, Tab: 9, Escape: 27 }[k];
  // RE-LOCK 2026-11-16 (test fault found in the first run, run-8): Chrome activates a button on Enter only when the
  // key event carries its text ("\r"); without it the switch never opened, so R3 could not test Tab at all
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k, windowsVirtualKeyCode: code, modifiers: shift ? 8 : 0, ...(k === "Enter" ? { text: "\r" } : {}) });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: code, modifiers: shift ? 8 : 0 });
  await sleep(200);
};

/** in the page: the reading action at load */
const ACTION = `(() => {
  const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  const box = e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; };
  const full = r => r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.left >= -0.5 && r.right <= innerWidth + 0.5;
  const hit = e => { const r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === e || e.contains(h)); };
  const real = [...document.querySelectorAll("[data-lq-read]")].find(vis);
  const bar = document.querySelector(".lq-readbar"), bb = bar && !bar.hidden && vis(bar) ? bar.querySelector("button") : null;
  const help = document.querySelector("#lqHelpTop a[href]");
  const o = { vw: innerWidth, vh: innerHeight, real: real ? { ...box(real), text: real.textContent.replace(/\\s+/g, " ").trim() } : null };
  if (real) o.realOk = full(real.getBoundingClientRect()) && hit(real);
  if (bb) { const r = box(bb), hr = help ? help.getBoundingClientRect() : null;
    o.bar = { ...r, text: bb.textContent.replace(/\\s+/g, " ").trim(), disabled: bb.disabled, hit: hit(bb), full: full(r),
      overHelp: !!hr && r.left < hr.right && hr.left < r.right && r.top < hr.bottom && hr.top < r.bottom }; }
  return o; })()`;
const BAR_SHOWN = `(() => { const b = document.querySelector(".lq-readbar"); return !!b && !b.hidden && b.getClientRects().length > 0; })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("R1: the reading action is on the first screen at load (own button or the sticky bar, ≥ 44 px, same label), every reading page × 5 widths × 640 / 659 px (TH; EN / ZH at 360 × 640)", async () => {
      const bad = [];
      const runs = [["th", WIDTHS, HEIGHTS], ["en", [360], [640]], ["zh", [360], [640]]];
      for (const [lang, ws, hs] of runs) {
        const page = await open(browser, lang);
        try {
          for (const p of READ) {
            await phone(page, 393, 659);
            try { await load(page, base, p, lang); } catch (e) { bad.push(`${p} ${lang}: did not load`); continue; }
            for (const w of ws) for (const h of hs) {
              await phone(page, w, h); await page.evaluate("window.scrollTo(0, 0); window.dispatchEvent(new Event('scroll'))"); await sleep(250);
              const a = await page.evaluate(ACTION), tag = `${p} ${lang} ${w}×${h}`;
              if (!a.real) { bad.push(`${tag}: no reading button (data-lq-read)`); continue; }
              if (a.realOk) continue;
              if (!a.bar) { bad.push(`${tag}: reading button at ${Math.round(a.real.top)} px and no sticky bar`); continue; }
              if (!a.bar.full || !a.bar.hit) bad.push(`${tag}: bar button not fully on screen / covered ${S(a.bar)}`);
              if (a.bar.h < 44 || a.bar.w < 44) bad.push(`${tag}: bar button ${a.bar.w}×${a.bar.h}`);
              if (a.bar.overHelp) bad.push(`${tag}: bar covers the help control`);
              if (a.bar.text !== a.real.text || !a.bar.text) bad.push(`${tag}: bar label ${S(a.bar.text)} vs ${S(a.real.text)}`);
              if (lang !== "th" && /[฀-๿]/.test(a.bar.text)) bad.push(`${tag}: Thai in the ${lang} bar`);
            }
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 60).join("\n"));
    });

    await check("R1: the bar hides when the real button is on screen and in the crisis state; a tap on it clicks the page's own button once (TH, 393 × 659)", async () => {
      const bad = [];
      const page = await open(browser, "th");
      try {
        await phone(page, 393, 659);
        for (const p of READ) {
          try { await load(page, base, p, "th"); } catch (e) { bad.push(`${p}: did not load`); continue; }
          if (!(await page.evaluate(BAR_SHOWN))) continue; // own button on the first screen
          if (p === "dream") { await page.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันว่างูตัวใหญ่ไล่ตาม"; t.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(600); }
          await page.evaluate(`window.__clicks = 0; const r = [...document.querySelectorAll("[data-lq-read]")].find(e => e.getClientRects().length);
            window.addEventListener("click", e => { if (e.target === r) { window.__clicks++; e.preventDefault(); e.stopImmediatePropagation(); } }, true);`);
          const b = await page.evaluate(`(() => { const x = document.querySelector(".lq-readbar button"); const q = x.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2, disabled: x.disabled }; })()`);
          if (b.disabled) { bad.push(`${p}: bar button disabled`); continue; }
          await tap(page, b);
          const n = await page.evaluate("window.__clicks");
          if (n !== 1) bad.push(`${p}: a tap on the bar gave ${n} click(s) on the page's own button`);
          await page.evaluate(`window.scrollTo(0, 0); window.dispatchEvent(new Event("scroll"))`); await sleep(250);
          await page.evaluate(`[...document.querySelectorAll("[data-lq-read]")].find(e => e.getClientRects().length).scrollIntoView({ block: "center" }); window.dispatchEvent(new Event("scroll"))`); await sleep(300);
          if (await page.evaluate(BAR_SHOWN)) bad.push(`${p}: bar still shown while the real button is on screen`);
          await page.evaluate(`window.scrollTo(0, 0); document.documentElement.setAttribute("data-lq-crisis", "1"); window.dispatchEvent(new Event("scroll"))`); await sleep(300);
          if (await page.evaluate(BAR_SHOWN)) bad.push(`${p}: bar shown in the crisis state`);
        }
        // dream: disabled until a dream is typed; hidden while the reading is on screen
        await load(page, base, "dream", "th");
        const d0 = await page.evaluate(`(() => { const x = document.querySelector(".lq-readbar button"); return x ? x.disabled : null; })()`);
        if (d0 !== true) bad.push(`dream: bar button should be disabled before a dream is typed (${d0})`);
        await page.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันว่างูตัวใหญ่ไล่ตาม แล้วฟันหลุด"; t.dispatchEvent(new Event("input", { bubbles: true })); });
        await page.waitFor(() => document.querySelectorAll("#drSel .dr-x").length >= 1, 4000);
        await page.evaluate(() => { document.querySelector('input[name="drMood"][value="happy"]').click(); document.querySelector('input[name="drTime"][value="dawn"]').click(); window.scrollTo(0, 0); window.dispatchEvent(new Event("scroll")); });
        await sleep(400);
        const b = await page.evaluate(`(() => { const x = document.querySelector(".lq-readbar button"); if (!x || x.disabled || x.closest("[hidden]")) return null; const q = x.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
        if (!b) bad.push("dream: bar not enabled after typing a dream");
        else {
          await tap(page, b);
          await page.waitFor(() => { const x = document.getElementById("drRd-body"); return !!x && x.querySelectorAll(".fa-section").length >= 3; }, 10000);
          await page.evaluate(`document.querySelector("#drRd-body .fa-section").scrollIntoView({ block: "start" }); window.dispatchEvent(new Event("scroll"))`); await sleep(400);
          if (await page.evaluate(BAR_SHOWN)) bad.push("dream: bar shown while the reading is on screen");
        }
      } finally { await page.close(); }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.join("\n"));
    });

    await check("R2: every fortune page's description is at most 2 lines at 360 / 375 / 393 / 414 / 430 px, TH / EN / ZH", async () => {
      const bad = [];
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, lang);
        try {
          for (const p of ALL) {
            await phone(page, 393, 659);
            try { await load(page, base, p, lang); } catch (e) { bad.push(`${p} ${lang}: did not load`); continue; }
            for (const w of WIDTHS) {
              await phone(page, w, 659); await sleep(150);
              const n = await page.evaluate(`(() => { const h1 = [...document.querySelectorAll("main h1")].find(e => e.getClientRects().length); let p = h1 && h1.nextElementSibling;
                while (p && p.tagName !== "P") p = p.nextElementSibling; if (!p) return -1; const lh = parseFloat(getComputedStyle(p).lineHeight) || parseFloat(getComputedStyle(p).fontSize) * 1.5;
                return Math.round(p.getBoundingClientRect().height / lh); })()`);
              if (n < 1 || n > 2) bad.push(`${p} ${lang} ${w}: description ${n} lines`);
            }
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.join("\n"));
    });

    await check("R3: keyboard, compact language switch at 360 px (TH / EN / ZH current): Enter opens, Tab reaches both other languages, Escape closes", async () => {
      const bad = [];
      for (const lang of ["th", "en", "zh"]) {
        const page = await open(browser, lang);
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 2, mobile: true });
          for (const p of ["faceread", "cat-fortune"]) {
            await load(page, base, p, lang);
            const cur = await page.evaluate(`(() => { const b = document.querySelector('#siteNav .lang-switch button[aria-pressed="true"]'); b.focus(); return b.getAttribute("data-lang"); })()`);
            if (cur !== lang) { bad.push(`${p} ${lang}: current language button is ${cur}`); continue; }
            await key(page, "Enter");
            const reached = new Set();
            for (let i = 0; i < 2; i++) {
              await key(page, "Tab");
              const f = await page.evaluate(`(() => { const a = document.activeElement; return a && a.closest && a.closest("#siteNav .lang-switch") ? a.getAttribute("data-lang") : null; })()`);
              if (f) reached.add(f);
            }
            const others = ["th", "en", "zh"].filter(x => x !== lang);
            for (const o of others) if (!reached.has(o)) bad.push(`${p} ${lang}: Tab did not reach ${o} (${S([...reached])})`);
            await key(page, "Escape");
            const open2 = await page.evaluate(`document.querySelector("#siteNav .lang-switch").classList.contains("open")`);
            if (open2) bad.push(`${p} ${lang}: Escape did not close the choices`);
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.join("\n"));
    });
  } finally {
    await browser.close();
  }
}
