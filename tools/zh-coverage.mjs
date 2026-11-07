#!/usr/bin/env node
// tools/zh-coverage.mjs — how much Thai is still visible in 中文 (or English: --lang en) mode, per page, in headless Chrome.
//
// For every ./*.html (390 px phone viewport by default) it loads ?lang=zh, measures with LQI18N.coverage() (visible text,
// placeholder/title/aria-label/alt, <title>; content marked lang="th" or translate="no" is excluded), then performs the
// "typical interactions" (below) and measures again. The page's score is the worst state seen.
//   Thai % = Thai letters / (Thai + Chinese letters). 0 % = fully Chinese.  "mixed" = text nodes holding both scripts.
//   --lang en: same run in English mode; Thai % = Thai letters / (Thai + Latin letters); content marked lang="th"
//   (e.g. fortune readings, which are written in Thai or Chinese only) is excluded like in 中文 mode.
//
//   node tools/zh-coverage.mjs                       all pages, summary table
//   node tools/zh-coverage.mjs tarot numbers         only pages whose name contains a word
//   node tools/zh-coverage.mjs --top 20 store        also list the 20 biggest Thai leftovers (text + CSS path) per page
//   node tools/zh-coverage.mjs --shared              only shared components (header nav incl. closed menus, footer, model
//                                                    notice, consent; hidden text counted) — CI gate: --shared --max 0
//   node tools/zh-coverage.mjs --max 5               exit 1 if any page is above 5 % Thai (CI gate)
//   node tools/zh-coverage.mjs --no-interact         only the freshly loaded page
//   node tools/zh-coverage.mjs --desktop             1280 px viewport
//   node tools/zh-coverage.mjs --json out.json       machine-readable result
//   node tools/zh-coverage.mjs --lang en --max 0     English chrome gate (npm run en:coverage)
//   LQ_CHROME=/path/to/chrome
//
// Typical interactions (generic, safe: fake camera, no file dialogs, no navigation away):
//   open the mobile menu, open every <details>, click each [role=tab] / .tab / [data-tab] in turn, then the clicks listed
//   for the page in tools/zh-coverage.interactions.json (teams: add selectors for your dialogs / result views there).
// In the browser the same numbers are live with ?i18n=debug (red outlines + badge). See docs/I18N.md.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../tests/e2e/cdp.mjs";
import { serve } from "./static-server.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); if (i < 0) return dflt; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = name => { const i = argv.indexOf(name); if (i < 0) return false; argv.splice(i, 1); return true; };
const top = +opt("--top", 0) || 0;
const max = opt("--max", null);
const jsonOut = opt("--json", null);
const shared = flag("--shared");
const noInteract = flag("--no-interact");
const desktop = flag("--desktop");
const LANG = opt("--lang", "zh") === "en" ? "en" : "zh";
const HTML_LANG = LANG === "en" ? "en" : "zh-Hans";
const filters = argv.filter(a => !a.startsWith("--"));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// internal owner pages (not linked, Thai-only by design, no shared nav/i18n) are not part of the public translation gate
// (pricing.html is public and fully translated since round 10)
const INTERNAL = new Set(["admin.html"]);
const pages = readdirSync(repo).filter(f => f.endsWith(".html") && !INTERNAL.has(f) && (!filters.length || filters.some(w => f.includes(w)))).sort();
const QUERY = { "insights.html": "&demo" }; // pages that need demo data to show their real UI
const ixFile = resolve(repo, "tools/zh-coverage.interactions.json");
const INTERACT = existsSync(ixFile) ? JSON.parse(readFileSync(ixFile, "utf8")) : {};
const SHARED_SEL = "header.nav, #siteNav, footer, .site-footer, .lq-model-note, .lq-consent, [data-lq-shared]";

const srv = await serve(repo);
const browser = await launch();
const init = [];
try { init.push(readFileSync(resolve(repo, "tests/e2e/fake-cams.js"), "utf8"), "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}"); } catch { /* optional */ }
init.push("window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;HTMLInputElement.prototype.showPicker=function(){};");

async function measure(page) {
  return page.evaluate((sharedSel, topN, lang) => {
    if (!window.LQI18N || !window.LQI18N.coverage) return { error: "LQI18N.coverage missing" };
    if (!sharedSel) return window.LQI18N.coverage(document.body, { top: topN || 1, lang });
    // shared components: hidden parts count too (closed dropdowns, the drawer, notices) — they must be 100 % Chinese
    const parts = [...document.querySelectorAll(sharedSel)].filter((el, i, a) => !a.some(o => o !== el && o.contains(el)));
    const sum = { thai: 0, cjk: 0, pct: 0, nodes: 0, mixed: 0, attrs: 0, top: [] };
    for (const el of parts) {
      const r = window.LQI18N.coverage(el, { top: topN || 1, all: true, lang });
      for (const k of ["thai", "cjk", "latin", "kept", "nodes", "mixed", "attrs"]) sum[k] = (sum[k] || 0) + r[k];
      sum.top.push(...r.top);
    }
    const other = lang === "en" ? sum.latin : sum.cjk;
    sum.pct = sum.thai + other ? Math.round(1000 * sum.thai / (sum.thai + other)) / 10 : 0;
    sum.top.sort((a, b) => b.thai - a.thai); sum.top = sum.top.slice(0, topN || 1);
    return sum;
  }, shared ? SHARED_SEL : null, Math.max(top, 1), LANG);
}

async function clickAll(page, selectors) {
  return page.evaluate(async sels => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    let n = 0;
    for (const sel of sels) {
      let els = [];
      try { els = [...document.querySelectorAll(sel)]; } catch { continue; }
      for (const el of els.slice(0, 12)) {
        if (!el.isConnected || !el.getClientRects().length) continue;
        if (el.tagName === "A" && el.getAttribute("href") && !el.getAttribute("href").startsWith("#")) continue;
        if (el.matches("input[type=file]")) continue;
        try { el.click(); n++; } catch { /* ignore */ }
        await wait(150);
      }
    }
    return n;
  }, selectors);
}

const results = [];
try {
  for (const f of pages) {
    const page = await browser.newPage(null, { initScripts: init, isolated: true });
    const row = { page: f, states: [], worst: null };
    try {
      await page.send("Emulation.setDeviceMetricsOverride", desktop
        ? { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
        : { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await page.goto(`${srv.base}/${f}?cpu&nosw&lang=${LANG}${QUERY[f] || ""}`);
      await page.waitFor(`window.LQI18N && document.documentElement.lang === ${JSON.stringify(HTML_LANG)}`, 8000).catch(() => null);
      await sleep(1200);
      row.states.push({ state: "load", ...(await measure(page)) });
      if (!noInteract) {
        await page.evaluate(() => { document.querySelectorAll("details").forEach(d => { d.open = true; }); });
        const generic = ["[role=tab]", ".tab", "[data-tab]", ".tabs button", ".seg button"];
        const n = await clickAll(page, generic);
        await sleep(500);
        row.states.push({ state: `tabs/details (${n} clicks)`, ...(await measure(page)) });
        const own = INTERACT[f] || [];
        for (const step of own) {
          const sels = Array.isArray(step) ? step : [step];
          const k = await clickAll(page, sels);
          await sleep(700);
          row.states.push({ state: `${sels.join(" + ")} (${k})`, ...(await measure(page)) });
        }
        if (!desktop) {
          await page.evaluate(() => document.querySelector(".nav-toggle")?.click());
          await sleep(300);
          row.states.push({ state: "mobile menu", ...(await measure(page)) });
        }
      }
      row.worst = row.states.filter(s => !s.error).sort((a, b) => b.pct - a.pct)[0] || row.states[0];
      const ex = page.consoleErrors.filter(e => e.kind === "exception").map(e => String(e.text).split("\n")[0]);
      if (ex.length) row.exceptions = ex.slice(0, 3);
    } catch (e) {
      row.error = e.message;
    } finally { await page.close(); }
    results.push(row);
    const w = row.worst || {};
    const pct = w.error || row.error ? "  err" : String(w.pct.toFixed(1)).padStart(5) + "%";
    console.log(`${f.padEnd(17)} ${pct}  thai ${String(w.thai ?? "-").padStart(5)}  ${LANG} ${String((LANG === "en" ? w.latin : w.cjk) ?? "-").padStart(5)}  nodes ${String(w.nodes ?? "-").padStart(4)}${w.kept ? `  kept-th ${w.kept}` : ""}  mixed ${String(w.mixed ?? "-").padStart(3)}  worst@ ${w.state || row.error || w.error}`);
    if (top && w.top) for (const it of w.top) console.log(`      ${String(it.thai).padStart(4)} ${it.mixed ? "MIX " : "    "}${it.path.padEnd(42).slice(0, 42)} ${it.text}`);
  }
} finally {
  await browser.close();
  await srv.close();
}

const valid = results.filter(r => r.worst && !r.worst.error && !r.error);
const tot = valid.reduce((a, r) => ({ thai: a.thai + r.worst.thai, cjk: a.cjk + (LANG === "en" ? r.worst.latin : r.worst.cjk) }), { thai: 0, cjk: 0 });
console.log(`\n${results.length} page(s)${shared ? " [shared components only]" : ""} [${LANG}], overall Thai ${tot.thai + tot.cjk ? (100 * tot.thai / (tot.thai + tot.cjk)).toFixed(1) : 0}%` +
  `, fully ${LANG === "en" ? "English" : "Chinese"}: ${valid.filter(r => r.worst.pct === 0).length}/${results.length}`);
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ shared, desktop, results }, null, 2)); console.log("wrote " + jsonOut); }
if (max != null) {
  const over = results.filter(r => r.error || !r.worst || r.worst.error || r.worst.pct > +max);
  if (over.length) { console.log(`FAIL: ${over.length} page(s) above ${max}% Thai: ${over.map(r => r.page).join(", ")}`); process.exit(1); }
}
process.exit(0);
