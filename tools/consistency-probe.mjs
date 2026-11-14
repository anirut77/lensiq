#!/usr/bin/env node
// tools/consistency-probe.mjs — site-wide consistency probe (owner order 2026-11-14 B). Visits every ./*.html at a phone
// (375×667) and a desktop (1280×800) viewport, in TH, EN and 中文, and records per page:
//   overflow    document wider than the viewport (scrollWidth > clientWidth) + the outermost offending elements
//   header      the shared header from nav.js is present (#siteNav with the menu and the TH | EN | 中文 switch) and, on
//               every page but the home page, the breadcrumb (.lq-crumbs)
//   untranslated  EN / 中文: visible Thai text nodes and text attributes (LQI18N.coverage, lang="th" / translate="no"
//               content excluded, as in tools/zh-coverage.mjs); EN and TH: visible Chinese text (wrong-language leak)
//   buttons     visible buttons (button, input[type=button|submit|reset], a.btn, [role=button]) outside the shared
//               components whose classes do not include a shared button class (SHARED_BUTTON below) and that carry a
//               class at all; bare <button>s are counted too (they get no shared style)
//   states      loading / empty / error states: a visible "กำลังโหลด / Loading / 加载" text outside a status region
//               (role=status / aria-live), uncaught exceptions while loading (an error the user never sees explained),
//               and visible empty lists / table bodies that have neither rows nor an empty-state message
//
// Order per page and language: load at 375×667 -> measure -> open every <details> and click each tab (as
// tools/zh-coverage.mjs) -> measure the phone view again (new overflow / untranslated findings are added) -> resize to
// 1280×800 -> measure (so the desktop view is the after-interaction state). Uncaught exceptions while loading are
// reported under states.
//
//   node tools/consistency-probe.mjs                      all pages, summary on stdout
//   node tools/consistency-probe.mjs exam gate            only pages whose name contains a word
//   node tools/consistency-probe.mjs --json out.json      full result as JSON
//   node tools/consistency-probe.mjs --details            list the findings per page
// Library: import { PAGES, probePage, summarize, SHARED_BUTTON } from "./consistency-probe.mjs" (tests/e2e/consistency.e2e.mjs).
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PAGES = readdirSync(repo).filter(f => f.endsWith(".html")).sort();
export const LANGS = ["th", "en", "zh"];
export const VIEWPORTS = { phone: { width: 375, height: 667, mobile: true }, desktop: { width: 1280, height: 800, mobile: false } };
export const CATEGORIES = ["overflow", "header", "untranslated", "buttons", "states"];
// shared button classes: styles.css .btn (+ .primary / .ghost / .full …) for actions, .chip for toggles / filters and
// .tab for tab bars (tests/e2e/consistency-kit.mjs checks that styles.css defines each of them);
// nav.js and the other shared components (lq-*) are skipped as a whole
export const SHARED_BUTTON = ["btn", "chip", "tab"];
// pages that need demo data to show their real UI (same as tools/zh-coverage.mjs)
const QUERY = { "insights.html": "&demo" };
// no camera prompt is answered (Chrome's fake device is used); dialogs never block the probe
export const INIT = "window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Runs inside the page. Returns findings for the current viewport and language.
function inPage(o) {
  const W = document.documentElement.clientWidth;
  const vis = el => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === "none" || s.visibility === "hidden" || (+s.opacity === 0 && p === el)) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const name = el => {
    const t = (el.getAttribute("aria-label") || el.textContent || el.value || "").trim().replace(/\s+/g, " ").slice(0, 32);
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls}${t ? ` "${t}"` : ""}`;
  };
  const SHARED = "#siteNav, header.nav, .lq-crumbs, .lq-legal-foot, .lq-model-note, .lq-consent, #lq-i18n-debug, [data-lq-shared]";
  const out = { overflow: [], header: [], untranslated: [], buttons: [], states: [] };

  // overflow
  const sw = document.documentElement.scrollWidth;
  if (sw > W) {
    const inScroller = el => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    const offenders = [...document.body.querySelectorAll("*")].filter(el => { const r = el.getBoundingClientRect(); return r.right > W + 0.5 && r.width > 0 && !inScroller(el) && vis(el); });
    const top = offenders.filter(el => !offenders.includes(el.parentElement)).slice(0, 4);
    out.overflow.push(`scrollWidth ${sw} > ${W}` + (top.length ? ": " + top.map(el => `${name(el)} right=${Math.round(el.getBoundingClientRect().right)}`).join(" | ") : ""));
  }

  // header + menu
  const nav = document.getElementById("siteNav");
  if (!nav) out.header.push("no #siteNav header");
  else {
    if (!nav.querySelector(".site-menu")) out.header.push("#siteNav has no .site-menu (nav.js not run)");
    if (!nav.querySelector(".lang-switch")) out.header.push("#siteNav has no TH | EN | 中文 switch");
    if (o.page !== "index.html" && !document.querySelector(".lq-crumbs")) out.header.push("no breadcrumb (.lq-crumbs)");
  }

  // untranslated
  if (o.lang !== "th") {
    if (!window.LQI18N || !window.LQI18N.coverage) out.untranslated.push("LQI18N.coverage missing (shared i18n not loaded)");
    else {
      const c = window.LQI18N.coverage(document.body, { top: 400, lang: o.lang });
      for (const it of c.top) out.untranslated.push(`TH ${it.path}: ${it.text}`);
    }
  }
  if (o.lang !== "zh") {
    // a text node counts when it is mostly Chinese (an untranslated Chinese string); a Chinese term inside a Thai or
    // English sentence ("แปดอักษร 八字", "BaZi · 八字") is the discipline's own name, not a missing translation
    const ZH = /[\u3400-\u9FFF\uF900-\uFAFF]/;
    const cnt = (t, re) => (t.match(re) || []).length;
    const mostlyZh = t => cnt(t, /[\u3400-\u9FFF\uF900-\uFAFF]/g) > cnt(t, /[\u0E00-\u0E7FA-Za-z]/g);
    const KEEP = "script,style,noscript,[translate=no],[lang^=zh],.lang-switch,#lq-i18n-debug";
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if (!el || !ZH.test(n.nodeValue)) continue;
      // nav.js splits text into word spans (.lq-run > .lq-w): judge the whole run, not one word of it
      const run = el.closest(".lq-run"), host = run && run.parentElement ? run.parentElement : el;
      if (!mostlyZh(host.textContent) || el.closest(KEEP) || !vis(el) || seen.has(host)) continue;
      seen.add(host);
      out.untranslated.push(`ZH-in-${o.lang} ${name(host)}`);
    }
  }

  // buttons
  const shared = new Set(o.sharedButton);
  for (const el of document.querySelectorAll("button, input[type=button], input[type=submit], input[type=reset], a.btn, [role=button]")) {
    if (el.closest(SHARED) || !vis(el)) continue;
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(Boolean) : [];
    if (cls.some(c => shared.has(c))) continue;
    out.buttons.push(cls.length ? "." + cls.join(".") : "(no class) " + name(el));
  }

  // states
  // loading: a visible "loading…" text must sit in a status region (role=status / aria-live / aria-busy, or the shared
  // model notice), so it is announced and replaced like every other status line (whether it is still loading after the
  // settle time depends on the machine, so that is not judged)
  const LOAD = /^(กำลังโหลด|กำลังเตรียม|Loading|Preparing|加载中|正在加载|正在准备)/i;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest(SHARED + ",script,style,noscript,option,select") || !LOAD.test(n.nodeValue.trim()) || !vis(el)) continue;
    if (el.closest("[role=status],[role=alert],[role=progressbar],[aria-live],[aria-busy]")) continue;
    out.states.push(`loading text outside a status region: ${name(el)}`);
  }
  for (const el of document.querySelectorAll("tbody, ul[id], ol[id], [role=list][id]")) {
    if (el.closest(SHARED) || el.children.length || el.textContent.trim()) continue;
    const r = el.getBoundingClientRect();
    const box = el.tagName === "TBODY" ? el.closest("table") : el;
    if (!box || !vis(box)) continue;
    const host = box.parentElement;
    const EMPTY = /empty|none|placeholder|hint|no-|ว่าง|ยังไม่มี|ไม่มี|No |None|暂无|没有|尚无/i;
    const hint = host && [...host.children].some(c => c !== box && vis(c) && c.textContent.trim().length > 0 && EMPTY.test(c.className + " " + c.textContent.slice(0, 80)));
    if (!hint) out.states.push(`empty with no empty-state message: ${name(el)} (${Math.round(r.width)}x${Math.round(r.height)})`);
  }
  return out;
}

/** Load one page in one language; measure at the phone viewport, then resize to desktop and measure again.
 * @returns {Promise<Record<string, {phone: object, desktop: object}>>} */
export async function probePage(browser, base, page, lang, initScripts = [INIT]) {
  const p = await browser.newPage(null, { initScripts, isolated: true });
  const res = {};
  try {
    const vp = VIEWPORTS.phone;
    await p.send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
    await p.goto(`${base}/${page}?cpu&nosw&lang=${lang}${QUERY[page] || ""}`);
    const htmlLang = lang === "zh" ? "zh-Hans" : lang;
    const ready = `document.readyState === "complete" && (!document.getElementById("siteNav") || (window.LQI18N && document.documentElement.lang === ${JSON.stringify(htmlLang)}))`;
    await p.waitFor(ready, 10000).catch(() => null);
    await sleep(1000);
    const exceptions = p.consoleErrors.filter(e => e.kind === "exception").map(e => String(e.text).split("\n")[0].slice(0, 160));
    const opts = { page, lang, sharedButton: SHARED_BUTTON };
    res.phone = await p.evaluate(inPage, opts);
    // typical interactions (as tools/zh-coverage.mjs): open every <details>, click each tab in turn; then the phone view is
    // measured again and new overflow / untranslated findings are added (navigation away is never clicked)
    const clicks = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      document.querySelectorAll("details").forEach(d => { d.open = true; });
      let n = 0;
      for (const sel of ["[role=tab]", ".tab", "[data-tab]", ".tabs button", ".seg button"]) {
        for (const el of [...document.querySelectorAll(sel)].slice(0, 12)) {
          if (!el.isConnected || !el.getClientRects().length || el.closest("#siteNav")) continue;
          if (el.tagName === "A" && el.getAttribute("href") && !el.getAttribute("href").startsWith("#")) continue;
          try { el.click(); n++; } catch { /* ignore */ }
          await wait(60);
        }
      }
      return n + document.querySelectorAll("details").length;
    });
    if (clicks) {
      await sleep(400);
      const after = await p.evaluate(inPage, opts);
      for (const c of ["overflow", "untranslated"]) for (const f of after[c]) if (!res.phone[c].includes(f)) res.phone[c].push(f + " (after opening tabs / details)");
    }
    const d = VIEWPORTS.desktop;
    await p.send("Emulation.setDeviceMetricsOverride", { width: d.width, height: d.height, deviceScaleFactor: 1, mobile: d.mobile });
    await sleep(500);
    res.desktop = await p.evaluate(inPage, opts);
    for (const e of exceptions) res.phone.states.push(`uncaught exception while loading: ${e}`);
  } finally { await p.close(); }
  return res;
}

/** rows: [{page, lang, viewport, overflow:[], header:[], ...}] -> counts per category and language (findings, pages) */
export function summarize(rows) {
  const s = {};
  for (const c of CATEGORIES) {
    s[c] = { findings: 0, pages: new Set() };
    for (const l of LANGS) s[c][l] = { findings: 0, pages: new Set() };
  }
  for (const r of rows) for (const c of CATEGORIES) {
    const n = (r[c] || []).length;
    if (!n) continue;
    s[c].findings += n; s[c].pages.add(r.page);
    s[c][r.lang].findings += n; s[c][r.lang].pages.add(r.page);
  }
  const plain = {};
  for (const c of CATEGORIES) {
    plain[c] = { findings: s[c].findings, pages: s[c].pages.size };
    for (const l of LANGS) plain[c][l] = { findings: s[c][l].findings, pages: s[c][l].pages.size };
  }
  return plain;
}

async function main() {
  const { launch } = await import("../tests/e2e/cdp.mjs");
  const { serve } = await import("./static-server.mjs");
  const argv = process.argv.slice(2);
  const jsonAt = argv.indexOf("--json"), jsonOut = jsonAt >= 0 ? argv[jsonAt + 1] : null;
  const details = argv.includes("--details");
  const words = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--json");
  const pages = PAGES.filter(f => !words.length || words.some(w => f.includes(w)));
  const init = [INIT];
  const srv = await serve(repo);
  const browser = await launch();
  const rows = [];
  try {
    for (const page of pages) for (const lang of LANGS) {
      const r = await probePage(browser, srv.base, page, lang, init);
      for (const vp of Object.keys(VIEWPORTS)) rows.push({ page, lang, viewport: vp, ...r[vp] });
      const line = CATEGORIES.map(c => `${c} ${(r.phone[c].length + r.desktop[c].length)}`).join("  ");
      console.log(`${page.padEnd(22)} ${lang}  ${line}`);
      if (details) for (const vp of Object.keys(VIEWPORTS)) for (const c of CATEGORIES) for (const f of r[vp][c].slice(0, 12)) console.log(`      ${vp} ${c}: ${f}`);
    }
  } finally { await browser.close(); await srv.close(); }
  const sum = summarize(rows);
  console.log("\nper category (findings / pages):");
  for (const c of CATEGORIES) console.log(`  ${c.padEnd(13)} all ${sum[c].findings}/${sum[c].pages}  ` + LANGS.map(l => `${l} ${sum[c][l].findings}/${sum[c][l].pages}`).join("  "));
  if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ when: new Date().toISOString(), summary: sum, rows }, null, 1)); console.log("wrote " + jsonOut); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
