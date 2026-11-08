// tests/e2e/zones-lib.mjs — shared helpers for the quick-win zone pages (queue / tables / afterhours / bays e2e files).
// Not an *.e2e.mjs file, so run.mjs does not run it on its own.
import { assert, privacyScan } from "./cdp.mjs";

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Opens `${base}/${file}?cpu&fakedet`, seeds localStorage (ack + zones + settings) and reloads. */
export async function openSeeded(browser, base, fakeCams, file, ns, { zones = [], settings = null, ack = true, query = "" } = {}) {
  const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}"] });
  await page.goto(`${base}/${file}?cpu&fakedet${query}`);
  await page.evaluate((ns, zones, settings, ack) => {
    localStorage.clear();
    if (ack) localStorage.setItem(ns + "-ack", JSON.stringify({ at: 1 }));
    localStorage.setItem(ns + "-zones", JSON.stringify(zones));
    if (settings) localStorage.setItem(ns + "-settings", JSON.stringify(settings));
  }, ns, zones, settings, ack);
  await page.reload();
  return page;
}

/** Starts the (fake) camera with the scripted detector and waits for the test-mode ready line. */
export async function startFake(page, script) {
  await page.evaluate(script);
  await page.evaluate(() => document.getElementById("startCam").click());
  await page.waitFor(`__LQZ.zc.running && /โหมดทดสอบ|test mode|测试模式/.test(document.getElementById("engine").textContent)`, 10000);
}

/** CSV export without a download: captures the Blob handed to URL.createObjectURL. */
export async function exportCsv(page) {
  return page.evaluate(async () => {
    let blob = null;
    const o = URL.createObjectURL, c = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = b => { blob = b; return "blob:x"; };
    HTMLAnchorElement.prototype.click = function () {};
    try { document.getElementById("exportCsv").click(); } finally { URL.createObjectURL = o; HTMLAnchorElement.prototype.click = c; }
    return blob ? await blob.text() : null;
  });
}

const unexpected = page => page.consoleErrors.filter(e => e.kind === "exception" || e.kind === "console" ||
  (e.kind === "log" && !/favicon/.test(e.url || "")));
export function noErrors(page) {
  const errs = unexpected(page);
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
}

/** 320 / 360 / 390 px: no horizontal overflow, visible controls >= 44 px (inline text links exempt), labelled inputs. */
export async function mobileCheck(page, widths = [320, 360, 390]) {
  for (const width of widths) {
    await page.send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: true });
    await sleep(300);
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      const small = [], unlabelled = [];
      for (const el of document.querySelectorAll("main button, main a.btn, main .seg, main input, main select")) {
        const cs = getComputedStyle(el), b = el.getBoundingClientRect();
        if (!b.width || !b.height || cs.visibility === "hidden" || el.closest("[hidden]")) continue;
        if (el.type === "checkbox") continue; // the whole .chk label is the 44 px target
        if (b.height < 43.5 || b.width < 43.5) small.push(`${el.tagName}#${el.id || ""}.${el.className} ${Math.round(b.width)}x${Math.round(b.height)}`);
        if ((el.tagName === "INPUT" || el.tagName === "SELECT") && !(el.labels && el.labels.length) && !el.getAttribute("aria-label")) unlabelled.push(el.name || el.id);
      }
      return { sw: de.scrollWidth, cw: de.clientWidth, small: small.slice(0, 5), unlabelled };
    });
    assert(r.sw <= r.cw, `horizontal overflow at ${width}px ` + JSON.stringify(r));
    assert(!r.small.length, `targets < 44 px at ${width}px: ` + r.small.join(", "));
    assert(!r.unlabelled.length, "unlabelled controls: " + r.unlabelled.join(", "));
  }
  await page.send("Emulation.clearDeviceMetricsOverride");
}

/** ?lang=en and ?lang=zh: no Thai letters left in <main> or <title> (the page's own dictionary covers it) — first on the
 *  fresh page (notice gate shown), then after confirming the notice and running the demo for a while (tiles, zones, log). */
const THAI_LEFT = lang => `(() => {
  if (!window.LQI18N || LQI18N.lang !== "${lang}") return false;
  const main = document.querySelector("main");
  const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const thai = [];
  for (let n; (n = walk.nextNode());) {
    const el = n.parentElement;
    if (el.closest("[hidden],[lang=th],[translate=no]") || el.closest("script")) continue;
    if (/[ก-๛]/.test(n.textContent)) thai.push(n.textContent.trim().slice(0, 50));
  }
  for (const el of main.querySelectorAll("[aria-label],[placeholder]")) {
    const v = (el.getAttribute("aria-label") || "") + (el.getAttribute("placeholder") || "");
    if (/[ก-๛]/.test(v) && !el.closest("[hidden]")) thai.push("@" + v.slice(0, 40));
  }
  for (const el of main.querySelectorAll("input:not([type=checkbox]):not([type=number]):not([type=time])")) if (/[ก-๛]/.test(el.value)) thai.push("=" + el.value);
  if (/[ก-๛]/.test(document.title)) thai.push("title " + document.title);
  return thai.length === 0 ? { ok: true, title: document.title } : (window.__lastThai = thai, false);
})()`;
export async function langCheck(browser, base, fakeCams, file, ns, { demoMs = 1500 } = {}) {
  for (const lang of ["en", "zh"]) {
    const page = await browser.newPage(null, { initScripts: [fakeCams] });
    await page.goto(`${base}/${file}?cpu&fakedet&lang=${lang}`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const fail = stage => async () => { const t = await page.evaluate(() => window.__lastThai); throw new Error(`${file} ${lang} (${stage}): Thai left ${JSON.stringify(t)}`); };
    const r = await page.waitFor(THAI_LEFT(lang), 8000).catch(fail("fresh"));
    assert(r.ok, file + " " + lang);
    if (ns) {
      await page.evaluate(() => { document.getElementById("ackChk").click(); document.querySelector("[data-ack]").click(); document.getElementById("demoCam").click(); });
      await sleep(demoMs);
      await page.waitFor(THAI_LEFT(lang), 4000).catch(fail("demo"));
      await page.evaluate(() => document.getElementById("stopCam").click());
    }
    noErrors(page);
    await page.close();
  }
}

export { assert, privacyScan };
