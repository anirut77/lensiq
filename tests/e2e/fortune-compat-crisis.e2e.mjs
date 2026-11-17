// tests/e2e/fortune-compat-crisis.e2e.mjs — FIXED TEST SET, Compatibility review round 1 (independent review of 5ba333b, D2).
// Written and locked (~/LENSIQ-field/evals/fortune-compat/, evals-locks/fortune-compat.sha256) BEFORE the fix. Headless Chrome,
// 393 px. Phrases come only from existing locked lists: MUST60 of tests/unit/fortune-crisis-net-3.test.js (read at run time),
// the four phrases of the crisis-net-hotfix kit and the three the reviewer named (我想去死, 自殺, kms).
// For every phrase (page language TH / EN / ZH in turn), in a fresh browser context:
//   N  typed for real (CDP Input.insertText, so the field's maxlength applies) into the first nickname (#cpNick0), consent
//      ticked and both birth dates valid; the compute button is pressed;
//   Y  typed for real into the first person's year field, nothing else filled and consent NOT ticked (the crisis check must run
//      before every other check); the compute button is pressed;
// then: the support card (.fa-support with tel:1323 and tel:1669) is shown in #cpResult and nothing of a reading is (no
// [data-compat-overview], no category section, no map); no echo: no 4-character piece (2 for Chinese) of the typed phrase
// appears in visible page text outside the card and the help line unless it was there before typing (input values are not text).
// Also R: a reading on screen is cleared when the next request fails validation (old results never stay on the page).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
function phrases() {
  const src = readFileSync(join(here, "..", "unit", "fortune-crisis-net-3.test.js"), "utf8");
  const m = /const MUST60 = (\[[\s\S]*?\n\]);/.exec(src);
  if (!m) throw new Error("MUST60 not found in tests/unit/fortune-crisis-net-3.test.js");
  const must = new Function("return " + m[1])().map(x => x[2]);
  const all = must.concat(["อยากตายจริงๆ", "I want to die tonight", "我不想活了", "我想死", "我想去死", "自殺", "kms"]);
  return [...new Set(all)];
}
const TEXT = `(() => { const c = document.body.cloneNode(true);
  c.querySelectorAll(".fa-support, #lqHelpTop, script, style, input, select, textarea, option").forEach(e => e.remove());
  return c.innerText.replace(/\\s+/g, ""); })()`;
const STATE = `(() => { const r = document.getElementById("cpResult"); const vis = e => !!e && e.getClientRects().length > 0;
  return { card: vis(r.querySelector(".fa-support")) && !!r.querySelector('a[href="tel:1323"]') && !!r.querySelector('a[href="tel:1669"]'),
    reading: !!(r.querySelector("[data-compat-overview]") || r.querySelector(".cp-cat") || r.querySelector("[data-compat-map]")),
    soft: vis(r.querySelector(".fa-soft")), msg: (document.getElementById("cpMsg") || {}).innerText || "" }; })()`;
const fillDate = (sel, p) => `(() => { const fs = document.querySelector(${S(sel)});
  const set = (q, v) => { const e = fs.querySelector(q); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
  set("select[name=d]", ${S(String(p.d))}); set("select[name=m]", ${S(String(p.m))}); set("input[name=y]", ${S(String(p.y))}); return true; })()`;

async function open(browser, base, lang) {
  const page = await browser.newPage(null, { isolated: true, initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/compat.html?nosw`);
  await page.waitFor(`document.documentElement.lang === ${S(HTML_LANG[lang])} && !!window.LQCompat && !!document.getElementById("cpGo")`, 15000);
  await sleep(300);
  return page;
}
async function type(page, sel, text) {
  await page.evaluate(`(() => { const e = document.querySelector(${S(sel)}); e.focus(); e.value = ""; return true; })()`);
  await page.send("Input.insertText", { text });
  await sleep(150);
}
function noEcho(before, after, phrase) {
  const p = phrase.replace(/\s+/g, ""), n = /[一-鿿]/.test(p) ? 2 : 4, bad = [];
  for (let i = 0; i + n <= p.length; i++) { const piece = p.slice(i, i + n); if (after.includes(piece) && !before.includes(piece)) bad.push(piece); }
  return bad;
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  const list = phrases();
  try {
    await check(`phrase list: ${list.length} phrases from the locked lists`, async () => { assert(list.length >= 65, "phrases: " + list.length); });
    for (const [mode, sel] of [["N", "#cpNick0"], ["Y", '[data-cp-person="0"] input[name=y]']]) {
      await check(`${mode} every phrase typed into ${mode === "N" ? "the nickname (consent ticked)" : "the year field (no consent)"}: the card replaces everything, no echo`, async () => {
        const bad = [];
        for (const [i, phrase] of list.entries()) {
          const lang = LANGS[i % 3];
          const page = await open(browser, base, lang);
          try {
            if (mode === "N") {
              await page.evaluate(`(() => { const c = document.getElementById("cpConsent"); if (!c.checked) c.click(); return true; })()`);
              await page.evaluate(fillDate('[data-cp-person="0"]', { d: 14, m: 2, y: 1988 }));
              await page.evaluate(fillDate('[data-cp-person="1"]', { d: 3, m: 9, y: 1992 }));
            }
            const before = await page.evaluate(TEXT);
            await type(page, sel, phrase);
            await page.evaluate(`(() => { document.getElementById("cpGo").click(); return true; })()`);
            await sleep(700);
            const st = await page.evaluate(STATE), after = await page.evaluate(TEXT), echo = noEcho(before, after, phrase);
            if (!st.card || st.reading || echo.length) bad.push(`[${lang}] ${phrase}: ${S({ card: st.card, reading: st.reading, soft: st.soft, msg: st.msg.slice(0, 60), echo })}`);
          } finally { await page.close(); }
        }
        assert(bad.length === 0, `${bad.length} of ${list.length} phrases:\n` + bad.join("\n"));
      });
    }
    await check("R a reading on screen is cleared when the next request fails validation", async () => {
      const page = await open(browser, base, "th");
      try {
        await page.evaluate(`(() => { const c = document.getElementById("cpConsent"); if (!c.checked) c.click(); return true; })()`);
        await page.evaluate(fillDate('[data-cp-person="0"]', { d: 14, m: 2, y: 1988 }));
        await page.evaluate(fillDate('[data-cp-person="1"]', { d: 3, m: 9, y: 1992 }));
        await page.evaluate(`(() => { document.getElementById("cpGo").click(); return true; })()`);
        await page.waitFor(`!!document.querySelector("#cpResult [data-compat-overview]")`, 20000);
        await page.evaluate(fillDate('[data-cp-person="1"]', { d: 3, m: 9, y: 12 }));
        await page.evaluate(`(() => { document.getElementById("cpGo").click(); return true; })()`);
        await sleep(600);
        const st = await page.evaluate(STATE);
        assert(!st.reading && st.msg.trim().length > 0, "old result cleared and a message shown: " + S(st));
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}
