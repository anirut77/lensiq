// tests/e2e/buttons-kit.mjs — shared runner of the button press / busy gate (owner report 2026-11-14, iPhone Safari:
// "I cannot tell whether a tap registered, and repeated taps highlight the text inside the button"). Not a test file
// itself; split over tests/e2e/buttons-{chrome,webkit}-<k>.e2e.mjs (style, k = 1..PARTS: page index modulo PARTS) and
// tests/e2e/buttons-busy{,-webkit}.e2e.mjs (busy). WebKit = the Playwright iPhone 13 profile at 375 px (the iOS engine;
// its files run on the macOS CI shard); Chrome = headless Chrome over CDP at 375 px.
// Rules:
//   style (every ./*.html, tools/buttons-probe.mjs): 0 findings in select / callout / zoom / highlight / active /
//         busy-look / inputs / doubletap, except the known exceptions in tests/e2e/buttons-exceptions.json (append-only:
//         page, category, a text the finding contains, the reason). Desktop engines do not support -webkit-touch-callout,
//         so part 1 also checks that styles.css and admin.css set it to none in the shared button rule.
//   busy  (every entry of tests/e2e/buttons-busy-list.json): getUserMedia is delayed 1.5 s and counted; one real tap,
//         then 350 ms later the button carries aria-busy="true" or is disabled; a second real tap 600 ms after the first
//         (after the double-tap window) does nothing: exactly one camera open; afterwards the button is no longer busy.
//         dl entries: two real taps 150 ms apart save exactly one file.
// Locked before any product fix: evals-locks/buttons.sha256.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";
import { CATEGORIES, PAGES, findingText, openEngine, probePage } from "../../tools/buttons-probe.mjs";
import { INSTRUMENT } from "../../tools/buttons-busy-discover.mjs";

export const PARTS = 3;
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..");
const EXC = JSON.parse(readFileSync(join(here, "buttons-exceptions.json"), "utf8")).exceptions;
const LIST = JSON.parse(readFileSync(join(here, "buttons-busy-list.json"), "utf8")).buttons;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** @param {string} page @param {string} cat @param {string} text */
export const excepted = (page, cat, text) => EXC.some(e => e.page === page && e.category === cat && text.includes(e.contains));

function checkExceptions() {
  for (const e of EXC) assert(e.page && e.category && e.contains && e.reason && e.reason.length > 20 && e.added, "exception without page / category / contains / reason / added: " + JSON.stringify(e));
  for (const e of EXC) assert([...CATEGORIES, "busy"].includes(e.category), "exception with an unknown category: " + JSON.stringify(e));
}

/** the shared button rule of a style sheet sets -webkit-touch-callout:none (and user-select / touch-action) */
function sharedRuleOk(file) {
  const css = readFileSync(join(repo, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  return rules.some(([, sel, body]) => /(^|,)\s*button\s*(,|$)/.test(sel) && /\.btn\b/.test(sel)
    && /-webkit-touch-callout\s*:\s*none/.test(body) && /(^|;)\s*-webkit-user-select\s*:\s*none/.test(body) && /touch-action\s*:\s*manipulation/.test(body));
}

/** @param {any} ctx @param {"chrome"|"webkit"} engine @param {number} k */
export async function runStyle(ctx, engine, k) {
  const { base, launch, check } = ctx;
  const pages = PAGES.filter((_, i) => i % PARTS === k - 1);
  await check(`${engine} part ${k}/${PARTS}: has pages; every exception has a reason${k === 1 ? "; styles.css + admin.css switch off the touch callout on buttons" : ""}`, async () => {
    assert(pages.length > 0, "no pages in this part");
    checkExceptions();
    if (k === 1) for (const f of ["styles.css", "admin.css"]) assert(sharedRuleOk(f),
      `${f}: no shared rule "button, … .btn … { -webkit-touch-callout:none; -webkit-user-select:none; touch-action:manipulation }"`);
  });
  const eng = await openEngine(engine, { launch });
  try {
    for (const page of pages) {
      await check(`${engine} 375 px ${page}: buttons not selectable, no callout / double-tap zoom, tap colour set, pressed state, busy look, double-tap guard`, async () => {
        const r = await probePage(eng, base, page);
        const bad = r.findings.map(findingText).filter(t => !excepted(page, t.split(" ")[0], t));
        assert(!bad.length, `${bad.length} finding(s) (${r.total} buttons, ${r.pressed} pressed):\n         ` + bad.slice(0, 25).join("\n         "));
      });
    }
  } finally { await eng.close(); }
}

/** in-page setup steps (untrusted: they only prepare the page) */
function setup(steps) {
  for (const s of steps) {
    if (s.check) { const el = document.querySelector(s.check); if (el && !el.checked) {
      el.checked = true; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } }
    if (s.fill) { const el = document.querySelector(s.fill[0]); if (el) {
      el.value = s.fill[1]; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } }
    if (s.click) { const el = document.querySelector(s.click); if (el) el.click(); }
  }
  return true;
}
function target(sel) {
  const el = document.querySelector(sel);
  if (!el) return { missing: true };
  el.scrollIntoView({ block: "center", behavior: "instant" });
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, disabled: !!el.disabled, visible: r.width > 4 && r.height > 4, hit: !!hit && (hit === el || el.contains(hit)) };
}
function state(sel) {
  const el = document.querySelector(sel);
  const w = window.__lqw || {};
  return { busy: !!el && el.getAttribute("aria-busy") === "true", disabled: !!el && !!el.disabled, gum: w.gum || 0, dl: w.dl || 0 };
}

/** @param {any} ctx @param {"chrome"|"webkit"} engine */
export async function runBusy(ctx, engine) {
  const { base, launch, check, fakeCams } = ctx;
  await check(`${engine}: busy list is fixed and every exception has a reason`, async () => {
    assert(LIST.length >= 20, "busy list has fewer than 20 entries");
    for (const b of LIST) assert(b.page && b.button && ["gum", "dl"].includes(b.work) && Array.isArray(b.setup) && b.why, "bad busy entry " + JSON.stringify(b));
    checkExceptions();
  });
  let browser = null, cdp = null, MD_SHIM = "";
  if (engine === "webkit") { browser = await (await import("playwright")).webkit.launch(); MD_SHIM = (await import("./phone-kit.mjs")).MD_SHIM; }
  else cdp = await launch();
  try {
    for (const b of LIST) {
      const id = `${b.page} ${b.button}`;
      if (excepted(b.page, "busy", b.button)) { ctx.skip(`${engine} busy ${id}`, "known exception (tests/e2e/buttons-exceptions.json)"); continue; }
      await check(`${engine} busy ${id} (${b.why}): ${b.work === "gum" ? "busy while the camera opens, a second tap does nothing" : "two taps save one file"}`, async () => {
        const url = `${base}/${b.page}?cpu&nosw&lang=th${b.query || ""}`;
        const init = ["window.alert=()=>{};window.confirm=()=>true;window.prompt=()=>null;"];
        let t, close;
        if (engine === "webkit") {
          const { devices } = await import("playwright");
          const c = await browser.newContext({ ...devices["iPhone 13"], viewport: { width: 375, height: 667 }, serviceWorkers: "block" });
          const page = await c.newPage();
          for (const s of [...init, MD_SHIM, fakeCams, INSTRUMENT]) await page.addInitScript(s);
          await page.goto(url, { waitUntil: "load", timeout: 60000 });
          t = { ev: (fn, a) => page.evaluate(fn, a), tap: (x, y) => page.touchscreen.tap(x, y) };
          close = () => c.close();
        } else {
          const p = await cdp.newPage(null, { initScripts: [...init, INSTRUMENT], isolated: true });
          await p.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
          await p.goto(url);
          const m = (type, x, y) => p.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 });
          t = { ev: (fn, a) => p.evaluate(fn, a), tap: async (x, y) => { await m("mousePressed", x, y); await m("mouseReleased", x, y); } };
          close = () => p.close();
        }
        try {
          await sleep(800);
          await t.ev(setup, b.setup);
          let pt = null;
          for (let i = 0; i < 40; i++) {
            pt = await t.ev(target, b.button);
            if (pt && !pt.missing && pt.visible && !pt.disabled && pt.hit) break;
            await sleep(250);
          }
          assert(pt && !pt.missing && pt.visible && !pt.disabled && pt.hit, `${id}: the button is not tappable (${JSON.stringify(pt)})`);
          const s0 = await t.ev(state, b.button);
          if (b.work === "dl") {
            await t.tap(pt.x, pt.y); await sleep(150); await t.tap(pt.x, pt.y); await sleep(900);
            const s1 = await t.ev(state, b.button);
            assert(s1.dl - s0.dl === 1, `${id}: two taps 150 ms apart saved ${s1.dl - s0.dl} file(s), expected 1`);
            return;
          }
          await t.tap(pt.x, pt.y);
          await sleep(350);
          const mid = await t.ev(state, b.button);
          await sleep(250);
          await t.tap(pt.x, pt.y);
          await sleep(3200);
          const end = await t.ev(state, b.button);
          assert(mid.gum - s0.gum >= 1, `${id}: the tap did not open the camera`);
          assert(mid.busy || mid.disabled, `${id}: no busy state while the camera opens (aria-busy="${mid.busy}", disabled ${mid.disabled})`);
          assert(end.gum - s0.gum === 1, `${id}: the second tap during the work ran it again: ${end.gum - s0.gum} camera opens, expected 1`);
          let left = end;
          for (let i = 0; i < 30 && left.busy; i++) { await sleep(250); left = await t.ev(state, b.button); }
          assert(!left.busy, `${id}: still aria-busy="true" after the work ended`);
        } finally { await close(); }
      });
    }
  } finally {
    if (browser) await browser.close();
    if (cdp) await cdp.close();
  }
}
