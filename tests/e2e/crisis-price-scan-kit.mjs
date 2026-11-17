// tests/e2e/crisis-price-scan-kit.mjs — FIXED TEST SET "crisis-v3-protect" (locked 2026-11-18 BEFORE building; copies + sha256 in
// ~/LENSIQ-field/evals/crisis-v3-protect/, evals-locks/crisis-v3-protect.sha256). Browser half of residual risk 1 of the crisis-v3
// review: the escape guard (crisis-escape-guard-kit.mjs) catches only sales elements that carry a sales marker. This kit scans the
// TEXT the visitor can see while html[data-lq-crisis] is set, for unmarked price / sales words (the same scanner as the unit half:
// tests/unit/crisis-price-scan-lib.cjs), in TH / EN / ZH, on every reading page of the escape guard (its FLOWS, reused unchanged).
// Per page × language (375 px, own browser context):
//   1. open the page in that language, the set-up a visitor does (FLOWS.prep), a normal reading (FLOWS.read);
//   2. the crisis the way a visitor can: the page's own free-text box (FLOWS.field), or the report-dialog note when the page has none;
//      wait for the crisis state (the escape guard's CARD: data-lq-crisis set, no card);
//   3. SCAN: every visible text node of the page (whole body: reading, forms, nav, footer, dialogs) and the value of every visible
//      button-like input; a hit fails unless the element's text contains an allow-listed fragment
//      (tests/unit/crisis-escape-guard-allow.json "priceText": entries with browser: true, or where = this page).
// Controls (crisis-price-scan-controls.e2e.mjs): 3 unmarked price strings injected visibly in the crisis state are each flagged; one
// hidden and one inside [data-lq-upsell] are not; after removing them the page is clean again.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FLOWS, CARD, PHRASE, sleep } from "./crisis-escape-guard-kit.mjs";
import { assert } from "./cdp.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
export const SCAN = require("../unit/crisis-price-scan-lib.cjs");
const ALLOW = JSON.parse(readFileSync(join(REPO, "tests/unit/crisis-escape-guard-allow.json"), "utf8")).priceText || [];
export const allowTexts = page => ALLOW.filter(e => e.browser === true || e.where === page).map(e => e.text);
export { FLOWS };
const S = JSON.stringify;
const ev = (p, s) => p.evaluate(s);

/** same fake detector as the escape guard kit (faceread / palm) */
const DET = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;

/** visible sales text in the page: [{hit, text, where}] (window.__lqPriceAllow = allowed fragments) */
export const VISIBLE = `(() => {
  const vis = e => { for (let x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.hidden) return false; const cs = getComputedStyle(x);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const allow = window.__lqPriceAllow || [], out = [];
  const norm = t => (t || "").replace(/\\s+/g, " ").trim();
  const where = e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.closest("[id]") && e.closest("[id]") !== e ? " in #" + e.closest("[id]").id : "");
  const check = (e, t) => { const hits = window.__lqPriceScan(t); if (!hits.length) return; const ctx = norm(e.textContent) + " " + t;
    if (allow.some(a => ctx.includes(a))) return; out.push({ hit: [...new Set(hits.map(h => h.match))].join(", "), text: t.slice(0, 100), where: where(e) }); };
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { const e = n.parentElement, t = norm(n.textContent);
    if (!t || !e || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|OPTION)$/.test(e.tagName) || !vis(e)) continue; check(e, t); }
  for (const e of document.querySelectorAll('input[type=button], input[type=submit], input[type=reset]')) if (vis(e)) check(e, norm(e.value));
  return out; })()`;

/** the report-dialog trigger (same steps as the escape guard kit) */
async function reportTrigger(p, q) {
  await p.waitFor(`[...document.querySelectorAll(".lq-rp-btn")].some(b => b.getBoundingClientRect().height > 0)`, 8000);
  await ev(p, `(() => { [...document.querySelectorAll(".lq-rp-btn")].find(b => b.getBoundingClientRect().height > 0).click(); return true; })()`);
  await p.waitFor(`!!document.querySelector("dialog.lq-rp textarea")`, 5000);
  await ev(p, `(() => { const e = document.querySelector("dialog.lq-rp textarea"); e.focus(); e.value = ${S(q)}; e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
}

/** steps 1–2: a page in the crisis state after a reading; returns the open page (caller closes it) */
export async function toCrisis(browser, base, fakeCams, page, lang) {
  const F = FLOWS[page];
  const p = await browser.newPage(null, { isolated: true, initScripts: F.cam ? [fakeCams, DET] : [] });
  await p.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await p.goto(`${base}/${F.url}${F.url.includes("?") ? "&" : "?"}lang=${lang}`);
  await p.waitFor(`document.documentElement.lang.slice(0, 2) === ${S(lang)}`, 8000);
  await sleep(400);
  if (F.prep) await F.prep(p);
  await sleep(300);
  await F.read(p);
  await sleep(1200);
  const q = F.short ? PHRASE.short : PHRASE.th;
  if (F.field) await F.field(p, q); else await reportTrigger(p, q);
  try { await p.waitFor(CARD, 15000); } catch (e) { throw new Error(`${page} [${lang}]: no crisis state after the crisis phrase`); }
  await sleep(1500);
  await ev(p, SCAN.SCAN_SRC);
  await ev(p, `window.__lqPriceAllow = ${S(allowTexts(page))}; true`);
  return p;
}

/** one page × one language: steps 1–3; throws on visible unmarked sales text */
export async function runScan(browser, base, fakeCams, page, lang) {
  const p = await toCrisis(browser, base, fakeCams, page, lang);
  try {
    const bad = await ev(p, VISIBLE);
    console.log(`    ${page} [${lang}, 375px]: ${bad.length} visible sales text(s) in the crisis state`);
    assert(!bad.length, `${page} [${lang}]: unmarked price / sales text visible in the crisis state:\n      ` + bad.slice(0, 20).map(b => `[${b.hit}] "${b.text}" (${b.where})`).join("\n      "));
    return bad.length;
  } finally { await p.close(); }
}
