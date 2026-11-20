// tests/e2e/select-fit-kit.mjs — FIXED TEST SET "planner defects" part b (owner report 2026-11-18, Samsung Android default
// browser, planner.html: the start-month <select> showed "พฤศจิกายน 256" with the year cut). Locked BEFORE any product fix
// (evals-locks/planner-defects.sha256, ~/LENSIQ-field/evals/planner-defects/). Shared runner of tests/e2e/select-fit-<k>.e2e.mjs
// (k = 1..PARTS; part k checks every page whose index in the sorted list of *.html in the repo root is k-1 modulo PARTS).
// Every page (all *.html) × TH / EN / ZH × phone widths 360, 375, 393, 412, 430 px, at load (no user action), the whole page.
// Every <select> that is shown (has a box of at least 2 px, not hidden, not in a closed <details> / <dialog>) is checked for
// the text it shows: its SELECTED option at load. One select is checked more strictly: planner.html's start month
// (select#plFrom, the select the owner reported) is checked for EVERY option, because its list starts at the current month
// and a check of today's selected month alone would pass or fail with the calendar.
// (A trial run before locking also checked every option of every select: 58 of 229 page × language checks failed, mostly
// long descriptive options in full-width selects (admin, store, booth, camera-notice, lifegraph ...) that cannot fit a phone
// without new wording. That wider rule is NOT part of this set; it is reported to the owner as a separate decision.)
// A native <select> cannot report clipping (scrollWidth == clientWidth always), so the text width is measured: a canvas with
// the select's computed font (style, weight, size, family) measures the option text, and the text FITS when
//   text width + padding-left + padding-right + border-left + border-right + ARROW  <=  the select's border-box width
// ARROW = 24 px: the native drop-down arrow and its own inner spacing (about 20 px in Chromium on Android, which Samsung
// Internet is built on), plus 4 px for a phone font that is a little wider than the test machine's. A select with
// `appearance: none` draws no native arrow and keeps its own room in its padding, so ARROW = 0 there.
// A select whose text does not fit FAILS, unless the full text is visible right under it (the coordinator's rule "the selected
// text is not clipped, or the full text is visible"): the select's next element sibling has class lq-sel-full, is shown, holds
// exactly the selected text, and is not cut itself (its scrollWidth <= its clientWidth + 1 and its right edge inside the
// screen). planner.html's start month gets no such way out: every month must fit in the select itself.
// There is no exception list. Counts per page × language × width are printed.
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

export const PARTS = 4;
export const LANGS = ["th", "en", "zh"];
export const WIDTHS = [360, 375, 393, 412, 430];
export const ARROW = 24;
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
export const PAGES = readdirSync(repo).filter(f => f.endsWith(".html")).sort();
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const INIT = "window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;";

// Runs in the page: [{sel, text, need, have}] for every option text that does not fit, and the number of selects checked.
export const PROBE = `(() => {
  const ARROW = ${ARROW};
  const shown = el => {
    if (!el.getClientRects().length) return false;
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    for (let x = el.parentElement; x; x = x.parentElement) {
      if (x.tagName === "DETAILS" && !x.open) return false;
      if (x.tagName === "DIALOG" && !x.open) return false;
    }
    return true;
  };
  const name = el => "select" + (el.id ? "#" + el.id : "") +
    (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "") + (el.name ? "[name=" + el.name + "]" : "");
  const ctx = document.createElement("canvas").getContext("2d");
  const bad = []; let n = 0;
  for (const s of document.querySelectorAll("select")) {
    if (!shown(s)) continue;
    const r = s.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (s.multiple || (s.size && s.size > 1)) continue; // list boxes show rows, not one closed text
    n++;
    const cs = getComputedStyle(s);
    ctx.font = [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily].join(" ");
    const arrow = cs.appearance === "none" || cs.webkitAppearance === "none" ? 0 : ARROW;
    const chrome = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) + arrow;
    const all = s.id === "plFrom" && location.pathname.endsWith("/planner.html");
    const opts = all ? [...s.options].filter((o, i) => !o.hidden || i === s.selectedIndex) : (s.selectedIndex >= 0 ? [s.options[s.selectedIndex]] : []);
    const seen = new Set();
    for (const o of opts) {
      const t = (o.label || o.text || "").replace(/\\s+/g, " ").trim();
      if (!t || seen.has(t)) continue; seen.add(t);
      const need = Math.ceil(ctx.measureText(t).width + chrome);
      if (need <= r.width + 0.5) continue;
      const cap = s.nextElementSibling;
      const full = !all && o === s.options[s.selectedIndex] && cap && cap.classList.contains("lq-sel-full") && shown(cap) &&
        cap.textContent.replace(/\\s+/g, " ").trim() === t && cap.scrollWidth <= cap.clientWidth + 1 && cap.getBoundingClientRect().right <= innerWidth + 0.5;
      if (!full) bad.push({ sel: name(s), text: t, need, have: Math.round(r.width) });
    }
  }
  return { n, bad };
})()`;

async function load(page, base, p, lang) {
  await page.goto(`${base}/${p}?nosw`);
  await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 10000);
  await page.evaluate("document.fonts ? document.fonts.ready.then(() => 1) : 1");
  await sleep(900); // dictionaries and late scripts (option lists built at load) settle
}
const phone = (page, w) => page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 2, mobile: true });

/** measure one page in one language at every width -> { [w]: {n, bad} } or { err } */
export async function measure(browser, base, p, lang) {
  const page = await browser.newPage(null, { initScripts: [INIT, `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
  try {
    await phone(page, 393);
    await load(page, base, p, lang);
    const res = {};
    for (const w of WIDTHS) {
      await phone(page, w); await sleep(150);
      res[w] = await page.evaluate(PROBE);
    }
    return res;
  } catch (e) { return { err: String(e && e.message || e) }; }
  finally { await page.close(); }
}

export async function runPart(ctx, k) {
  const { base, launch, check } = ctx;
  const pages = PAGES.filter((_, i) => i % PARTS === k - 1);
  await check(`part ${k}/${PARTS} has pages`, async () => { assert(pages.length > 0, "no pages in this part"); });
  const browser = await launch();
  try {
    for (const p of pages) for (const lang of LANGS) {
      await check(`${p} ${lang}: 360 / 375 / 393 / 412 / 430 — the text every shown <select> shows fits (no cut text)`, async () => {
        const r = await measure(browser, base, p, lang);
        assert(!r.err, `${p} ${lang} did not load: ${r.err}`);
        const bad = [];
        for (const w of WIDTHS) {
          if (r[w].n) console.log(`       count ${p} ${lang} ${w}: selects ${r[w].n}, cut ${r[w].bad.length}`);
          for (const b of r[w].bad) bad.push(`${w} ${b.sel} "${b.text}" needs ${b.need} px, has ${b.have} px`);
        }
        assert(!bad.length, `${bad.length} cut select text(s):\n         ` + bad.slice(0, 30).join("\n         "));
      });
    }
  } finally { await browser.close(); }
}
