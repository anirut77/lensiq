#!/usr/bin/env node
// tools/buttons-probe.mjs — site-wide button press / busy probe (owner report 2026-11-14, iPhone Safari: "I cannot tell
// whether a tap registered, and repeated taps highlight the text inside the button"). Visits every ./*.html at 375×667
// in one engine (Chrome over CDP, or WebKit with the Playwright iPhone 13 profile at 375 px) and records per page:
//   select      a button whose text can be selected: computed user-select / -webkit-user-select is not "none"
//   callout     -webkit-touch-callout is not "none" (checked only where the engine supports the property)
//   zoom        touch-action is "auto" (a double tap may zoom)
//   highlight   -webkit-tap-highlight-color is the engine default (not set on purpose)
//   active      a visible button that looks the same while it is pressed (mouse down, no release): no computed style
//               of the PRESS_PROPS below differs between "hovered" and "hovered + pressed"
//   busy-look   a shared .btn with aria-busy="true" looks the same as one without (no busy style)
//   inputs      a text input / textarea / the page body is NOT selectable (the fix must keep reading text selectable)
//   doubletap   two real taps 120 ms apart on a plain action button (a temporary <button class="btn"> with a counting
//               click listener, added by the probe) run its listener twice
// "Buttons" = TARGETS below (button, [role=button], .btn, .chip, .tab, input buttons, the help-line call link), all of
// them in the DOM (hidden ones too: computed style does not need a layout box) except non-interactive .chip / .tab
// labels (a <span> or <div> without role / tabindex / click handler attribute). Findings are grouped per signature
// (tag + classes), so one finding = one kind of button on that page; the count says how many elements share it.
// The press check runs on the first visible, enabled, uncovered element of each signature (at most PRESS_CAP per page).
// Transitions and animations are switched off for the probe through a constructed style sheet (CSP-safe), so a press
// reads its final style at once.
//   node tools/buttons-probe.mjs [--engine chrome|webkit] [--json out.json] [--details] [words...]
// Library: import { PAGES, probePage, openEngine } from "./buttons-probe.mjs" (tests/e2e/buttons-kit.mjs).
// Locked before any product fix: evals-locks/buttons.sha256.
import { assertFreeSpace } from "./disk-guard.mjs";
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PAGES = readdirSync(repo).filter(f => f.endsWith(".html")).sort();
export const CATEGORIES = ["select", "callout", "zoom", "highlight", "active", "busy-look", "inputs", "doubletap"];
export const TARGETS = "button, [role=button], .btn, .chip, .tab, input[type=button], input[type=submit], input[type=reset], a.lq-call-btn";
export const PRESS_PROPS = ["backgroundColor", "backgroundImage", "color", "borderTopColor", "boxShadow", "transform", "opacity", "filter", "outlineStyle", "textDecorationLine"];
export const PRESS_CAP = 40;
export const VIEWPORT = { width: 375, height: 667 };
const QUERY = { "insights.html": "&demo" };
export const INIT = "window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;";
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- in-page parts (self-contained: they are serialised into the page) ----------

/** UA defaults of the engine, measured on about:blank */
function uaDefaults() {
  const b = document.createElement("button"); b.textContent = "x"; document.body.appendChild(b);
  const s = getComputedStyle(b);
  const r = { tap: s.webkitTapHighlightColor || "", calloutSupported: typeof CSS !== "undefined" && CSS.supports("-webkit-touch-callout", "none") };
  b.remove();
  return r;
}

/** style findings over every target + the list of press candidates (marked with data-lqbp) */
function auditStyles(o) {
  const off = new CSSStyleSheet();
  off.replaceSync("*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}");
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, off];
  const cls = el => (typeof el.className === "string" ? el.className : (el.className && el.className.baseVal) || "").trim().split(/\s+/)
    .filter(c => c && !/^(active|on|sel|selected|open|is-|lq-w|lq-run)/.test(c)).sort().join(".");
  const sig = el => el.tagName.toLowerCase() + (el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "") + (cls(el) ? "." + cls(el) : "")
    + (el.type && el.tagName === "INPUT" ? `[type=${el.type}]` : "");
  const label = el => (el.getAttribute("aria-label") || el.textContent || el.value || "").trim().replace(/\s+/g, " ").slice(0, 28);
  const interactive = el => /^(BUTTON|INPUT|A|LABEL|SELECT|SUMMARY)$/.test(el.tagName) || el.hasAttribute("role") || el.hasAttribute("tabindex") || el.hasAttribute("onclick");
  const vis = el => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  };
  const groups = new Map(); // sig|cat -> {n, ex}
  const add = (cat, el, detail) => {
    const k = cat + "|" + sig(el);
    const g = groups.get(k) || { cat, sig: sig(el), n: 0, ex: label(el), detail };
    g.n++; groups.set(k, g);
  };
  const all = [...document.querySelectorAll(o.targets)];
  let total = 0, skippedLabels = 0;
  const press = new Map();
  for (const el of all) {
    if (!interactive(el)) { skippedLabels++; continue; }
    total++;
    const s = getComputedStyle(el);
    const us = [s.userSelect, s.webkitUserSelect].filter(v => typeof v === "string" && v);
    if (!us.length || us.some(v => v !== "none")) add("select", el, "user-select " + us.join("/"));
    if (o.calloutSupported && s.webkitTouchCallout !== "none") add("callout", el, "-webkit-touch-callout " + s.webkitTouchCallout);
    if (!s.touchAction || s.touchAction === "auto") add("zoom", el, "touch-action " + (s.touchAction || "(none)"));
    if ((s.webkitTapHighlightColor || "") === o.tap) add("highlight", el, "-webkit-tap-highlight-color " + o.tap + " (engine default)");
    const k = sig(el);
    if (!press.has(k) && !el.disabled && el.getAttribute("aria-disabled") !== "true" && vis(el)) press.set(k, el);
  }
  // reading text and text inputs stay selectable
  const bs = getComputedStyle(document.body);
  if ([bs.userSelect, bs.webkitUserSelect].some(v => v === "none")) groups.set("inputs|body", { cat: "inputs", sig: "body", n: 1, ex: "", detail: "page text is not selectable" });
  for (const el of document.querySelectorAll("input:not([type]), input[type=text], input[type=email], input[type=tel], input[type=search], input[type=number], input[type=url], textarea")) {
    const s = getComputedStyle(el);
    if ([s.userSelect, s.webkitUserSelect].some(v => v === "none")) add("inputs", el, "text field is not selectable");
  }
  // busy look of the shared action button
  const probe = document.createElement("button");
  probe.className = "btn primary"; probe.type = "button"; probe.textContent = "busy probe";
  probe.style.position = "fixed"; probe.style.left = "0"; probe.style.top = "0";
  document.body.appendChild(probe);
  const snap = el => { const s = getComputedStyle(el); return ["cursor", "opacity", "backgroundImage", "backgroundColor", "color", "filter", "boxShadow"].map(p => s[p]).join("|"); };
  const idle = snap(probe);
  probe.setAttribute("aria-busy", "true");
  const busy = snap(probe);
  const busyBefore = getComputedStyle(probe, "::before").content, busyAfter = getComputedStyle(probe, "::after").content;
  probe.remove();
  const busyPseudo = [busyBefore, busyAfter].some(c => c && c !== "none" && c !== "normal");
  if (idle === busy && !busyPseudo) groups.set("busy-look|.btn", { cat: "busy-look", sig: "button.btn.primary", n: 1, ex: "", detail: "aria-busy=true changes nothing" });
  let i = 0;
  for (const el of [...press.values()].slice(0, o.cap)) el.setAttribute("data-lqbp", String(i++));
  return { total, skippedLabels, groups: [...groups.values()], press: i };
}

/** scroll candidate i into view; its centre if that point hits the element, else null */
function pressPoint(i) {
  const el = document.querySelector(`[data-lqbp="${i}"]`);
  if (!el) return null;
  el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  if (!hit || !(hit === el || el.contains(hit))) return { covered: true, x, y };
  return { x, y };
}

/** computed press-relevant style of candidate i (+ signature and label) */
function pressSnap(a) {
  const el = document.querySelector(`[data-lqbp="${a.i}"]`);
  if (!el) return null;
  const s = getComputedStyle(el);
  const cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).filter(c => c && !/^(active|on|sel|selected|open|is-|lq-w|lq-run)/.test(c)).sort().join(".");
  return {
    v: a.props.map(p => s[p]).join("|"),
    sig: el.tagName.toLowerCase() + (el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : "") + (cls ? "." + cls : "") + (el.type && el.tagName === "INPUT" ? `[type=${el.type}]` : ""),
    label: (el.getAttribute("aria-label") || el.textContent || el.value || "").trim().replace(/\s+/g, " ").slice(0, 28)
  };
}

/** a temporary plain action button with a counting click listener, on top of the page; its centre */
function tapProbe(op) {
  let b = document.getElementById("lq-tap-probe");
  if (op === "count") return b ? +b.dataset.n : -1;
  if (op === "remove") { if (b) b.remove(); return 0; }
  b = document.createElement("button");
  b.id = "lq-tap-probe"; b.type = "button"; b.className = "btn primary"; b.textContent = "tap probe"; b.dataset.n = "0";
  Object.assign(b.style, { position: "fixed", left: "20px", top: "200px", zIndex: "2147483647", width: "160px", height: "48px" });
  b.addEventListener("click", () => { b.dataset.n = String(+b.dataset.n + 1); });
  document.body.appendChild(b);
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ---------- engines ----------

/**
 * @param {"chrome"|"webkit"} engine
 * @param {{launch?: Function}} [o] launch = tests/e2e/cdp.mjs launch (the e2e runner's, so it can close a left-over Chrome)
 * @returns {Promise<{engine: string, open: (url: string) => Promise<any>, close: () => Promise<void>, defaults: any}>}
 */
export async function openEngine(engine, o = {}) {
  if (engine === "chrome") {
    const launch = o.launch || (await import("../tests/e2e/cdp.mjs")).launch;
    assertFreeSpace({ label: "tools/buttons-probe.mjs" }); // stops with exit 75 when free disk space is under 5 GB
    const browser = await launch();
    const open = async url => {
      const p = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await p.send("Emulation.setDeviceMetricsOverride", { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 2, mobile: true });
      const errors = p.consoleErrors;
      await p.goto(url);
      const mouse = (type, x, y) => p.send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
      return {
        evaluate: (fn, arg) => p.evaluate(fn, arg),
        move: (x, y) => mouse("mouseMoved", x, y),
        down: (x, y) => mouse("mousePressed", x, y),
        up: (x, y) => mouse("mouseReleased", x, y),
        tap: async (x, y) => { await mouse("mousePressed", x, y); await mouse("mouseReleased", x, y); },
        errors: () => errors.filter(e => e.kind === "exception").map(e => String(e.text).slice(0, 200)),
        close: () => p.close()
      };
    };
    const blank = await open("about:blank");
    const defaults = await blank.evaluate(uaDefaults);
    await blank.close();
    return { engine, open, close: () => browser.close(), defaults };
  }
  const { webkit, devices } = await import("playwright");
  assertFreeSpace({ label: "tools/buttons-probe.mjs" }); // stops with exit 75 when free disk space is under 5 GB
  const browser = await webkit.launch();
  const open = async url => {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], viewport: VIEWPORT, serviceWorkers: "block" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e && e.message || e).slice(0, 200)));
    await page.addInitScript(INIT);
    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    return {
      evaluate: (fn, arg) => page.evaluate(fn, arg),
      move: (x, y) => page.mouse.move(x, y),
      down: () => page.mouse.down(),
      // WebKit (Playwright) keeps a "mouse pressed" flag after a press released away from the button and then marks the
      // NEXT hovered element :active without any press, so the next button's "not pressed" snapshot already looked
      // pressed (amendment 3). A second mouseup with no button down clears the flag; it fires no click.
      up: async () => { await page.mouse.up(); await page.mouse.up(); },
      tap: (x, y) => page.touchscreen.tap(x, y),
      errors: () => errors,
      close: () => ctx.close()
    };
  };
  const blank = await open("about:blank");
  const defaults = await blank.evaluate(uaDefaults);
  await blank.close();
  return { engine, open, close: () => browser.close(), defaults };
}

/**
 * @param {Awaited<ReturnType<typeof openEngine>>} eng
 * @param {string} base @param {string} page
 * @returns {Promise<{page: string, total: number, skippedLabels: number, pressed: number, covered: number, findings: {cat: string, sig: string, n: number, ex: string, detail: string}[]}>}
 */
export async function probePage(eng, base, page) {
  const t = await eng.open(`${base}/${page}?cpu&nosw&lang=th${QUERY[page] || ""}`);
  try {
    await sleep(700);
    const a = await t.evaluate(auditStyles, { targets: TARGETS, tap: eng.defaults.tap, calloutSupported: eng.defaults.calloutSupported, cap: PRESS_CAP });
    const findings = a.groups;
    let pressed = 0, covered = 0;
    for (let i = 0; i < a.press; i++) {
      const pt = await t.evaluate(pressPoint, i);
      if (!pt) continue;
      if (pt.covered) { covered++; continue; }
      // let the scroll settle: WebKit hit-tests a mouse event right after scrollIntoView at the old scroll position, so the
      // press missed the button (amendment 3)
      await sleep(200);
      await t.move(pt.x, pt.y);
      await sleep(60);
      const before = await t.evaluate(pressSnap, { i, props: PRESS_PROPS });
      await t.down(pt.x, pt.y);
      await sleep(60);
      const during = await t.evaluate(pressSnap, { i, props: PRESS_PROPS });
      // release away from the button: no click, nothing starts
      await t.move(2, 2);
      await t.up(2, 2);
      if (!before || !during) continue;
      pressed++;
      if (before.v === during.v) findings.push({ cat: "active", sig: before.sig, n: 1, ex: before.label, detail: "no visible pressed state" });
    }
    const tp = await t.evaluate(tapProbe, "add");
    await t.tap(tp.x, tp.y);
    await sleep(120);
    await t.tap(tp.x, tp.y);
    await sleep(150);
    const runs = await t.evaluate(tapProbe, "count");
    await t.evaluate(tapProbe, "remove");
    if (runs !== 1) findings.push({ cat: "doubletap", sig: "button.btn.primary", n: 1, ex: "", detail: `two taps 120 ms apart ran the click listener ${runs} time(s)` });
    return { page, total: a.total, skippedLabels: a.skippedLabels, pressed, covered, findings };
  } finally { await t.close(); }
}

/** "cat sig "label" (n×): detail" — the text an exception's `contains` is matched against */
export const findingText = f => `${f.cat} ${f.sig}${f.ex ? ` "${f.ex}"` : ""} (${f.n}x): ${f.detail}`;

async function main() {
  const { serve } = await import("./static-server.mjs");
  const argv = process.argv.slice(2);
  const val = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const engine = val("--engine") || "chrome", jsonOut = val("--json");
  const details = argv.includes("--details");
  const words = argv.filter((a, i) => !a.startsWith("--") && !["--engine", "--json"].includes(argv[i - 1]));
  const pages = PAGES.filter(f => !words.length || words.some(w => f.includes(w)));
  const srv = await serve(repo);
  const eng = await openEngine(/** @type {any} */ (engine));
  const rows = [];
  const sum = Object.fromEntries(CATEGORIES.map(c => [c, { kinds: 0, elements: 0, pages: 0 }]));
  try {
    console.log(`engine ${engine}: tap-highlight default ${eng.defaults.tap}, touch-callout supported ${eng.defaults.calloutSupported}`);
    for (const page of pages) {
      const r = await probePage(eng, srv.base, page);
      rows.push(r);
      const by = c => r.findings.filter(f => f.cat === c);
      for (const c of CATEGORIES) { const f = by(c); if (f.length) { sum[c].kinds += f.length; sum[c].elements += f.reduce((s, x) => s + x.n, 0); sum[c].pages++; } }
      console.log(`${page.padEnd(22)} buttons ${String(r.total).padStart(3)} pressed ${String(r.pressed).padStart(2)} covered ${r.covered}  ` + CATEGORIES.map(c => `${c} ${by(c).length}`).join("  "));
      if (details) for (const f of r.findings.slice(0, 30)) console.log("      " + findingText(f));
    }
  } finally { await eng.close(); await srv.close(); }
  console.log("\nper category (kinds / elements / pages):");
  for (const c of CATEGORIES) console.log(`  ${c.padEnd(10)} ${sum[c].kinds} / ${sum[c].elements} / ${sum[c].pages}`);
  if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ when: new Date().toISOString(), engine, summary: sum, rows }, null, 1)); console.log("wrote " + jsonOut); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
