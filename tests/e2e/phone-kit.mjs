// tests/e2e/phone-kit.mjs — shared helpers for the real-phone (WebKit, iPhone width) flow tests (not a test file itself:
// run.mjs only runs *.e2e.mjs). Stream B "real-phone quality", 2026-11-13.
//
// Every flow opens a fresh iPhone 13 context (Playwright WebKit = the iOS Safari engine; 390 x 664 CSS px, touch, mobile
// user agent) with service workers blocked (nav.js registers sw.js on localhost; in WebKit a controlled page's fetch
// bypasses page.route), the fake cameras of tests/e2e/fake-cams.js (canvas.captureStream; nothing real is filmed) and
// any per-flow hooks. PASS RULE per flow: the page loads, the main action works, no page error, no crash event and no
// reload (exactly one document load per goto and the in-page marker set after load is still there at the end).
import { webkit, devices } from "playwright";
import { assert } from "./cdp.mjs";

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const IPHONE = { ...devices["iPhone 13"], serviceWorkers: "block" };
// Fake cameras are installed by assigning navigator.mediaDevices.getUserMedia. WebKit can hand the document a NEW
// MediaDevices object after the init scripts ran (the override is then lost and the page meets WebKit's own capture,
// which refuses a rear camera), and some headless builds have none at all. This pins one object for the page's life.
export const MD_SHIM = `(() => { try { const md = navigator.mediaDevices || new EventTarget();
  Object.defineProperty(navigator, "mediaDevices", { get: () => md, configurable: true }); } catch (e) {} })();`;
const NO_DIALOGS = "window.confirm = () => true; window.print = () => {}; window.prompt = () => 'test'; window.alert = () => {};";

/** @returns {Promise<import("playwright").Browser>} */
export const launchWebKit = () => webkit.launch();

/**
 * Opens one flow in a fresh iPhone context.
 * @param {import("playwright").Browser} browser
 * @param {string} url
 * @param {{ init?: string[], cams?: string|null, lang?: string }} o  cams = fake-cams.js source (null: no fake camera)
 */
export async function openFlow(browser, url, { init = [], cams = null, lang = "th" } = {}) {
  const ctx = await browser.newContext(IPHONE);
  const page = await ctx.newPage();
  const st = { errors: /** @type {string[]} */ ([]), crashed: false, loads: 0, gotos: 0, mark: "" };
  page.on("pageerror", e => st.errors.push(String(e && e.message || e).slice(0, 300)));
  page.on("crash", () => { st.crashed = true; });
  page.on("load", () => { st.loads++; });
  const scripts = [NO_DIALOGS, `try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`];
  if (cams) scripts.push(MD_SHIM, cams);
  for (const s of [...scripts, ...init]) await page.addInitScript(s);
  const go = async u => {
    st.gotos++;
    await page.goto(u, { waitUntil: "load", timeout: 60000 });
    st.mark = "m" + Math.random().toString(36).slice(2);
    await page.evaluate(m => { window.__lqPhoneMark = m; }, st.mark);
  };
  await go(url);
  return { ctx, page, st, go };
}

/**
 * a FUNCTION (never a string: the pages' CSP forbids eval and the tests keep the real CSP on) polled until truthy
 * @param {any} page @param {(arg: any) => any} fn @param {any} [arg] @param {number} [ms]
 */
export const waitFor = (page, fn, arg = null, ms = 15000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 });

/** the pass rule: no page error, no crash, no reload since the last goto */
export async function passRule(page, st, label) {
  assert(!st.crashed, `${label}: the WebKit page crashed`);
  assert(!st.errors.length, `${label}: page error(s): ${st.errors.slice(0, 4).join(" | ")}`);
  assert(st.loads === st.gotos, `${label}: ${st.loads} document load(s) for ${st.gotos} navigation(s) — the page reloaded`);
  const m = await page.evaluate(() => window.__lqPhoneMark || "");
  assert(m === st.mark, `${label}: the in-page marker is gone — the page reloaded`);
  const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert(ov.sw <= ov.cw + 1, `${label}: horizontal overflow at phone width ${ov.sw} > ${ov.cw}`);
}

/**
 * Runs one flow as one check; the context is always closed.
 * @param {(name: string, fn: () => Promise<void>) => Promise<void>} check
 */
export async function flow(check, browser, name, url, opts, body) {
  await check(`WebKit iPhone 390: ${name}`, async () => {
    const f = await openFlow(browser, url, opts);
    try {
      const vw = await f.page.evaluate(() => window.innerWidth);
      assert(vw === 390, `${name}: viewport is ${vw} px, not 390`);
      await body(f);
      if (opts && opts.cams && opts.expectCam !== false) {
        const n = await f.page.evaluate(() => (window.__LQ_FAKE && window.__LQ_FAKE.opens.length) || 0);
        assert(n >= 1, `${name}: the page never opened the fake camera (the flow did not run on the test camera)`);
      }
      await passRule(f.page, f.st, name);
    } finally { await f.ctx.close(); }
  });
}

/** sets a form control's value the way a user would leave it (input + change events) */
export const setVal = (page, sel, v) => page.evaluate(([sel, v]) => {
  const el = document.querySelector(sel); if (!el) throw new Error("no " + sel);
  if (el.type === "checkbox" || el.type === "radio") el.checked = !!v; else el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
}, [sel, v]);
