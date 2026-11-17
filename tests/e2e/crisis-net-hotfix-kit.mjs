// tests/e2e/crisis-net-hotfix-kit.mjs — shared steps of the FIXED TEST SET "crisis-net-hotfix" (locked 2026-11-16 BEFORE the fix,
// on main 656712f). Locked files: this kit, crisis-net-hotfix-inventory.json, crisis-net-hotfix-{a,b,c,d}.e2e.mjs and
// tests/unit/crisis-input-inventory.test.js (copies + sha256 in ~/LENSIQ-field/evals/crisis-net-hotfix/, evals-locks/crisis-net-hotfix.sha256).
// Defects from the independent review of the LIVE main (656712f):
//   D3a numbers name tab: score ring / breakdown / letter values shown NEXT TO the crisis card; #nmStrip spells the typed crisis
//       text letter by letter (an echo);
//   D3b faceread: element / palaces / mountains / rivers / reading blocks stay visible beside the card; at 375 px the first
//       screen is the face map, not the card;
//   D4  numbers name tab, EN / ZH phrases: validation ("at least 1 Thai letter") runs BEFORE the crisis net: no card.
// Owner order 2026-11-16: (a) with the crisis flag set nothing from the result area stays visible on any fortune page (reading
// text, score rings, letter strips, face or palm maps, charts, share and print buttons, prices): only the help card, and the
// screen scrolls to it; (b) the crisis check runs before any format or validation check on every input of every fortune page;
// (c) every free-text input is covered (inventory: crisis-net-hotfix-inventory.json, docs/CRISIS-INPUT-INVENTORY.md).
// Per inventory row that can hold a phrase, per case [page language × phrase × width 375 / 393 px, separate page loads]:
//   type a phrase from the EXISTING locked crisis lists (no new phrases):
//     TH "อยากตายจริงๆ", EN "I want to die tonight", short ZH "我想死"   tests/unit/fortune-crisis-net-3.test.js (plainName list)
//     ZH "我不想活了"                                                  tests/unit/fortune-claims-crisis.test.js (yes list)
//   a phrase longer than the field's maxlength is replaced by the short ZH phrase (a visitor cannot type the long one);
//   submit the way a visitor does (form submit / button / typing for live fields), then assert:
//   (1) the support card (.fa-support with 1323) is visible and its heading is on the first screen: fully inside the viewport
//       and the topmost element at its centre belongs to the card (not covered by the sticky bar);
//   (2) no reading widget is visible: the page's selectors (test files) plus GENERIC (readings, plans, share / print buttons,
//       paid or remedy blocks); an element that contains the card is not counted (its other children are);
//   (3) no echo: (a) visible text outside the card and help lines, whitespace and digits removed, does not contain the typed
//       text with whitespace removed (catches letter-by-letter splits such as "อ 6 ย 8 า 1 ก 1"); (b) no substring of 2 or more
//       characters of the typed text appears in a visible text node outside the card and help lines unless it was already
//       visible before the visitor typed (the page's own static wording is not an echo; anything new that matches is).
//   Input values are not page text (the box the visitor typed into still holds what they typed).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

export const INVENTORY = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "crisis-net-hotfix-inventory.json"), "utf8"));
export const PHRASE = { th: "อยากตายจริงๆ", en: "I want to die tonight", zh: "我不想活了", short: "我想死" };
/** [page language, phrase key] */
export const COMBOS = [["th", "th"], ["en", "en"], ["zh", "zh"], ["th", "en"], ["th", "zh"]];
export const WIDTHS = [375, 393];
export const GENERIC = [".fa-section", ".fa-summary", ".fa-plan", '[id$="Share"]', '[id$="Print"]', "[data-lq-upsell]", "[data-lq-remedy]"];
export const sleep = ms => new Promise(r => setTimeout(r, ms));
const S = JSON.stringify;

/** set a field's value the way typing does (focus, value, input + change events) */
export const setVal = (sel, v) => `(() => { const e = document.querySelector(${S(sel)}); if (!e) throw new Error("no field ${sel.replace(/"/g, "'")}");
  e.focus(); e.value = ${S(v)}; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`;
export const submit = id => `(() => { const f = document.getElementById(${S(id)}); f.requestSubmit(); return true; })()`;
export const click = sel => `(() => { document.querySelector(${S(sel)}).click(); return true; })()`;

/** open a page at a phone width in a page language (own browser context: fresh storage, no calm session) */
export async function open(browser, base, path, { width, lang, initScripts = [] }) {
  const page = await browser.newPage(null, { isolated: true, initScripts });
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: width === 375 ? 812 : 852, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/${path}${path.includes("?") ? "&" : "?"}lang=${lang}`);
  await page.waitFor(`document.documentElement.lang === ${S(lang === "zh" ? "zh-Hans" : lang)}`, 8000);
  await sleep(400);
  return page;
}

const VIS = `const vis = e => { for (let x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.hidden) return false; const cs = getComputedStyle(x);
  if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };`;
/** visible text nodes (outside the card, the soft step and the help lines when `outside` is set) */
const TEXT_NODES = outside => `(() => { ${VIS}
  const out = [], w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement; if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|OPTION)$/.test(p.tagName)) continue;
    if (${outside ? "p.closest('.fa-support, .fa-soft, .lq-helpline, #lqHelpTop')" : "false"}) continue;
    if (!n.textContent.trim() || !vis(p)) continue;
    out.push(n.textContent);
  }
  return out; })()`;
/** the visible page text before the visitor types (the page's own wording) */
export const baseline = page => page.evaluate(TEXT_NODES(false));

const norm = s => String(s).toLowerCase().replace(/[\s​-‍﻿]/g, "");

/** wait for the card, let scrolling settle, then assert (1)–(3); returns the measured row */
// RE-LOCK 2026-11-17 (owner decision 2026-11-17 crisis v3; ledger docs/CRISIS-V3-RELOCKS.md): the card no longer replaces the reading.
// Replaced (rule a): "the support card is shown, its heading on the first screen" and "no reading widget is visible".
// Kept: the crisis check runs before any format or validation check on EVERY inventoried input (now proven by the crisis state
// <html data-lq-crisis="1"> being set right after the visitor's action, even when the page then refuses the input), no echo
// (whole page; pieces of 7 Thai / 5 English / 3 Chinese characters and the whole typed text, as the reading is now shown),
// no sales / remedy / share / print block visible (rule c), one number (no help number other than 1323 on the page), and
// nothing that tells the person they were flagged (no card, no "are you okay?" step).
export async function assertCard(page, { label, typed, before }) {
  try { await page.waitFor(`document.documentElement.getAttribute("data-lq-crisis") === "1"`, 15000); }
  catch (e) { throw new Error(label + ": the crisis state was not set by the visitor's action"); }
  await sleep(900);
  const r = await page.evaluate(`(() => { ${VIS}
    const cards = [...document.querySelectorAll(".fa-support, .fa-soft")].filter(vis).length;
    const sales = [...document.querySelectorAll('[data-lq-upsell], [data-lq-remedy], [id$="Share"], [id$="Print"]')]
      .filter(e => vis(e) && (e.textContent.trim() || e.matches("canvas, svg, img") || e.querySelector("canvas, svg, img"))).map(e => e.id || e.className || e.tagName);
    const tels = [...document.querySelectorAll('a[href^="tel:"]')].filter(vis).map(a => a.getAttribute("href")).filter(h => h !== "tel:1323");
    const other = /(?<!\\d)(?:1669|191|1300)(?!\\d)|02[\\s-]?113[\\s-]?6789/.test(document.body.innerText);
    return { cards, sales: [...new Set(sales)], tels, other }; })()`);
  const after = await page.evaluate(TEXT_NODES(false));
  const t = norm(typed), was = norm(before.join("")), echo = [], n = /[\u3400-\u9fff]/.test(t) ? 3 : /[\u0E00-\u0E7F]/.test(t) ? 7 : 5;
  const subs = new Set([t]);
  // RE-LOCK (crisis v3, 2): an English piece is 3 consecutive words (5 letters without spaces matched "night" in "Knight")
  const words = String(typed).toLowerCase().split(/\s+/).filter(Boolean);
  if (!/[\u0E00-\u0E7F\u3400-\u9fff]/.test(t) && words.length >= 3) for (let i = 0; i + 3 <= words.length; i++) subs.add(norm(words.slice(i, i + 3).join("")));
  else for (let i = 0; i + n <= t.length; i++) subs.add(t.slice(i, i + n));
  for (const node of after) { const x = norm(node); for (const sub of subs) if (x.includes(sub) && !was.includes(sub)) echo.push(S(sub) + " in " + S(node.trim().slice(0, 40))); }
  const bad = [];
  if (r.cards) bad.push("a card or the soft step is shown (v3: the reading goes on, nothing flagged)");
  if (r.sales.length) bad.push("sales / remedy / share / print visible: " + r.sales.join(", "));
  if (r.tels.length || r.other) bad.push("a help number other than 1323: " + S(r.tels));
  if (echo.length) bad.push("echo: " + [...new Set(echo)].slice(0, 3).join("; "));
  assert(!bad.length, label + ": " + bad.join(" | "));
}

/** the cases of one inventory row: [page language, phrase key, width]; long phrases that do not fit become the short one */
export function cases(row, { both = false } = {}) {
  const fit = k => !row.maxlength || PHRASE[k].length <= row.maxlength;
  const seen = new Set(), out = [];
  for (const [lang, k0] of COMBOS) {
    const k = fit(k0) ? k0 : "short", key = lang + "/" + k;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([lang, k]);
  }
  // every case at both widths for the main fields; otherwise alternating, the first language at both
  return out.flatMap(([lang, k], i) => (both || i === 0 ? WIDTHS : [WIDTHS[i % 2]]).map(w => [lang, k, w]));
}

/** one check per inventory row: every case runs (separate page loads), failures are collected, then the check fails if any */
export async function runRow(check, row, flow, { both = false } = {}) {
  const name = `${row.page} ${row.sel}`;
  await check(name + ": crisis phrase -> crisis state before any validation, no card, nothing echoed (v3)", async () => {
    assert(flow, name + ": no flow for this inventory row (add one before adding the field)");
    const list = cases(row, { both }), fails = [];
    for (const [lang, k, width] of list) {
      const label = `${name} [ui ${lang}, phrase ${k}, ${width}px]`;
      try { await flow({ lang, phrase: PHRASE[k], width, label }); } catch (e) { fails.push(String(e.message || e).replace(/^assertion failed: /, "")); }
    }
    console.log(`    ${name}: ${list.length - fails.length}/${list.length} cases pass`);
    assert(!fails.length, fails.length + "/" + list.length + " cases fail:\n      " + fails.join("\n      "));
  });
}
export const rowsOf = pages => INVENTORY.inputs.filter(r => r.phrase && pages.includes(r.page));
