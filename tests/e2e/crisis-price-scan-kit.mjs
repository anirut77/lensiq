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

/** visible sales text in the page: [{hit, text, where}] (window.__lqPriceAllow = allowed fragments)
 * RE-LOCK 1 2026-11-22 (crisis-v3-protect relock1, test fault, CI 44967706758: palm [th] flagged [บาท] "แต่ละบาทไปไหน" (lq-t in #plNarr)).
 * nav.js's line-wrap (glue(), 2026-11-19, after this kit was locked) moves the last words of a paragraph into their own <lq-t> piece
 * (and Thai words into .lq-run / .lq-w spans), so the hit's own element no longer held the allow-listed sentence it belongs to; 15 of
 * the 44 browser texts were flagged that way (tests/e2e/crisis-price-scan-wrap.e2e.mjs, datefix-1122). Now an allowed text is matched
 * against the text of the hit's BLOCK (its nearest ancestor that is not a nav.js wrap piece), and it covers a hit only when the hit lies
 * INSIDE an occurrence of that allowed text (stricter than before: an allow-listed sentence no longer excuses a price elsewhere in the same
 * element). Allowed texts are compared with their whitespace collapsed; a block counts as starting and ending with a space. Second part
 * (stricter, independent review): the shown text of every block is also scanned as a whole, so a price split across nodes by nav.js is
 * flagged (datefix-1122 relock1 W5). Scanner, page set, flows and the visibility rule are unchanged. */
export const VISIBLE = `(() => {
  const vis = e => { for (let x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.hidden) return false; const cs = getComputedStyle(x);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const allow = (window.__lqPriceAllow || []).map(a => a.replace(/\\s+/g, " ")).filter(a => a.trim()), out = [];
  const norm = t => (t || "").replace(/\\s+/g, " ").trim();
  const where = e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (e.closest("[id]") && e.closest("[id]") !== e ? " in #" + e.closest("[id]").id : "");
  const WRAP = e => e && e.nodeType === 1 && (e.tagName === "LQ-T" || e.classList.contains("lq-t") || e.classList.contains("lq-run") || e.classList.contains("lq-w"));
  const blockOf = e => { let b = e; while (WRAP(b) && b.parentElement) b = b.parentElement; return b; };
  const cache = new Map();
  /** the block's text, whitespace collapsed, framed by one space each side; spans[node] = [start, end) of that node's text in it */
  const SKIPTAG = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|OPTION)$/, shownCache = new Map();
  const shown = n => { const e = n.parentElement; if (!e || SKIPTAG.test(e.tagName)) return false; if (!shownCache.has(e)) shownCache.set(e, vis(e)); return shownCache.get(e); };
  /** the block's SHOWN text, whitespace collapsed, framed by one space each side; spans[node] = [start, end) of that node's text in it */
  const blockText = b => { if (cache.has(b)) return cache.get(b); let s = " "; const spans = new Map(); const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (!shown(n)) continue; const st = s.length; for (const ch of n.nodeValue) { if (/\\s/.test(ch)) { if (!s.endsWith(" ")) s += " "; } else s += ch; } spans.set(n, [st, s.length]); }
    if (!s.endsWith(" ")) s += " "; const r = { s, spans }; cache.set(b, r); return r; };
  const covered = (s, at, len) => allow.some(a => { for (let i = s.indexOf(a); i >= 0; i = s.indexOf(a, i + 1)) if (i <= at && at + len <= i + a.length) return true; return false; });
  const check = (e, t, node) => { const hits = window.__lqPriceScan(t); if (!hits.length) return;
    const left = [];
    if (node) { const B = blockText(blockOf(e)), sp = B.spans.get(node); const seg = sp ? B.s.slice(sp[0], sp[1]) : "";
      for (const h of hits) { let found = false, bad = false; for (let i = seg.indexOf(h.match); i >= 0; i = seg.indexOf(h.match, i + 1)) { found = true; if (!covered(B.s, sp[0] + i, h.match.length)) bad = true; }
        if (bad || !found) left.push(h); } }
    else { const s = " " + norm(t) + " "; for (const h of hits) { let ok = false; for (let i = s.indexOf(h.match); i >= 0; i = s.indexOf(h.match, i + 1)) { ok = covered(s, i, h.match.length); if (!ok) break; } if (!ok) left.push(h); } }
    if (!left.length) return; out.push({ hit: [...new Set(left.map(h => h.match))].join(", "), text: t.slice(0, 100), where: where(e) }); };
  const blocks = new Set();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { const e = n.parentElement, t = norm(n.textContent);
    if (!t || !e || SKIPTAG.test(e.tagName) || !vis(e)) continue; check(e, t, n); blocks.add(blockOf(e)); }
  for (const e of document.querySelectorAll('input[type=button], input[type=submit], input[type=reset]')) if (vis(e)) check(e, norm(e.value), null);
  // RE-LOCK 1, second part (independent review 2026-11-22): a price that nav.js split across nodes ("99<lq-t>元 立即解锁</lq-t>") has no hit
  // in any single node. Each block's shown text is scanned as a whole; a hit that no single node holds is flagged unless it lies inside an
  // allowed text (hits inside one node were judged above).
  for (const b of blocks) { const B = blockText(b), hs = window.__lqPriceScan(B.s); if (!hs.length) continue; const spans = [...B.spans.values()], left = new Set();
    for (const m of new Set(hs.map(h => h.match))) for (let i = B.s.indexOf(m); i >= 0; i = B.s.indexOf(m, i + 1)) {
      if (spans.some(sp => sp[0] <= i && i + m.length <= sp[1])) continue;
      if (!covered(B.s, i, m.length)) left.add(m + "@" + i); }
    if (!left.size) continue; const first = Math.min(...[...left].map(k => +k.split("@").pop()));
    out.push({ hit: [...new Set([...left].map(k => k.replace(/@\\d+$/, "")))].join(", "), text: B.s.slice(Math.max(0, first - 30), first + 70).trim(), where: where(b) + " (across nodes)" }); }
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
  // RE-LOCK 1 2026-11-18 (test fault, CI run 44141046161: report [en] / [zh] never drew a reading): the reused flow types the
  // Buddhist year 2533, but in EN / ZH the era radio defaults to CE, so the form refused it; pick BE first as a Thai visitor would
  if (page === "report") await ev(p, `(() => { const r = document.querySelector('input[name="rpAEra"][value="be"]'); if (r && !r.checked) r.click(); return true; })()`);
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

/* ---------------- RE-LOCK 2 2026-11-18 (adds assertions only; coordinator order, CLAUDE.md rule b) ----------------
 * The site menu's price / payment entries (nav.js, data-lq-crisis-sales) and the account menu's pricing entry (lensiq-member.js)
 * must be hidden while the crisis or calm state is set, and come back when it clears. Used by crisis-price-scan-menu.e2e.mjs. */
/** open the site menu drawer and the "about" group (where the pricing and account entries are) */
export async function openAboutMenu(p) {
  await ev(p, `(() => { const t = document.querySelector(".nav-toggle"); if (t && t.getAttribute("aria-expanded") !== "true") t.click();
    const b = document.querySelector('button[aria-controls="navsub-about"]'); if (!b) throw new Error("no about group"); if (b.getAttribute("aria-expanded") !== "true") b.click(); return true; })()`);
  await sleep(600);
}
/** what is visible in the menus: pricing links, marked elements, sales hits in the site menu, the account link */
export const MENU_STATE = `(() => {
  const vis = e => { for (let x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.hidden) return false; const cs = getComputedStyle(x);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const menu = document.getElementById("siteMenu"), hits = [];
  const tw = document.createTreeWalker(menu, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) { const t = n.textContent.replace(/\\s+/g, " ").trim(); if (t && n.parentElement && vis(n.parentElement) && window.__lqPriceScan(t).length) hits.push(t); }
  return { pricing: [...document.querySelectorAll('#siteMenu a[href="pricing.html"], .lq-acct-menu a[href="pricing.html"]')].filter(vis).length,
    marked: [...document.querySelectorAll("[data-lq-crisis-sales]")].filter(vis).length,
    markedAll: document.querySelectorAll("[data-lq-crisis-sales]").length,
    account: [...document.querySelectorAll('#siteMenu a[href="account.html"]')].filter(vis).length,
    aboutOpen: vis(document.getElementById("navsub-about")), hits }; })()`;
/** an account-menu pricing entry exactly as lensiq-member.js draws it for a signed-in member with pricing on (sign-in is not
 *  available in the test server); proves the page-wide rule hides it */
export const FAKE_ACCOUNT_MENU = `(() => { const ul = document.createElement("ul"); ul.className = "lq-acct-menu"; ul.setAttribute("role", "menu"); ul.setAttribute("data-lq-test-inject", "");
  const li = document.createElement("li"); li.setAttribute("role", "presentation"); li.setAttribute("data-lq-crisis-sales", "");
  const a = document.createElement("a"); a.setAttribute("role", "menuitem"); a.href = "pricing.html"; a.setAttribute("href", "pricing.html"); a.textContent = "แพ็กเกจและราคา";
  li.appendChild(a); ul.appendChild(li); ul.style.cssText = "position:fixed;left:0;bottom:0;z-index:2147483647;background:#fff"; document.body.appendChild(ul); return true; })()`;
