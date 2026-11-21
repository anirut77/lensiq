// tests/e2e/crisis-rules-kit.mjs — shared steps of the FIXED TEST SET "crisis-rules-1323" (owner decision 2026-11-16 crisis
// one-number rules), locked BEFORE any product code on branch crisis-rules-1323 (base: crisis-net-hotfix 5061f53 + main 1f59045).
// Locked files: this kit, crisis-rules-1323-{a,b,c}.e2e.mjs, tests/unit/crisis-rules-1323.test.js (copies + sha256 in
// ~/LENSIQ-field/evals/crisis-rules-1323/, evals-locks/crisis-rules-1323.sha256).
// Owner order 2026-11-16 (verbatim summary):
//   1 one number, one button: 1323 only; 1669, 191, 1300 (and Samaritans) removed from the help card and every fortune page;
//   2 the other numbers on a separate page "ช่องทางให้คำปรึกษา", reached by one small text link under the 1323 button;
//   3 far fewer words: 2-3 short warm lines, anything longer behind "อ่านเพิ่มเติม", no lists of instructions;
//   4 nothing interrupts reading: no call button, banner or box between sections; in the crisis state the order is short warm
//     message, free comforting guidance, then the 1323 button and the small link;
//   5 no sticky or floating help element that follows the reader;
//   6 normal state keeps the small 1323 control at the top; ONE switch (window.LENSIQ_HELP_TOP_STICKY in lensiq-config.js) chooses
//     the sticky top bar (true) or a non-sticky header area that scrolls away (false, shipped);
//   7 1323 reachable in one or two taps from every fortune page; all result content hidden in the crisis state; hard limits unchanged.
// The card contract the tests read: .fa-support > h3 (title), .fa-support-warm (warm lines), details.fa-support-more (summary
// "อ่านเพิ่มเติม" / "Read more" / "阅读更多"), .fa-support-guide (comforting guidance), a[href="tel:1323"], a[href$="counselling.html"].
import { assert } from "./cdp.mjs";
import { diagnoseLoadFailure, loadFailText } from "./load-diag.mjs";

export const S = JSON.stringify;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const FORTUNE = ["fortune", "cat-fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui",
  "dream", "zodiac", "astro", "lifegraph", "planner", "luckycolor", "report"];
/** the pages that can show the crisis card (reading engine + crisis takeover) */
export const READING = ["faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac", "astro",
  "lifegraph", "report"];
export const LANGS = ["th", "en", "zh"];
export const WIDTHS = [360, 393, 430];
export const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
/** numbers that must not appear on a fortune page (only on counselling.html) */
export const OTHER = { 1669: "1669", 191: "191", 1300: "1300", samaritans: "021136789" };
export const MORE = { th: /อ่านเพิ่มเติม/, en: /Read more/i, zh: /阅读更多/ };
export const COUNSEL = { th: /ช่องทางให้คำปรึกษา/, en: /counsel/i, zh: /咨询/ };
/** the switch forced on or off by an init script (lensiq-config.js cannot override it) */
export const STICKY = on => `Object.defineProperty(window, "LENSIQ_HELP_TOP_STICKY", { configurable: true, get: () => ${on ? "true" : "false"}, set: () => {} });`;
export const LANG_INIT = lang => `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`;

export async function phone(page, w) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: w <= 360 ? 740 : 852, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
}
/** page load event timeout: the cdp.mjs newPage default (no crisis-rules-1323 file passes its own); language wait: unchanged 10 s */
export const PAGE_LOAD_MS = 20000;
export const LANG_WAIT_MS = 10000;
/** load a page in a language and wait until the language is applied and the 1323 control exists.
 *  On failure (decision 203 ค) it still throws; the error says "slow machine" or "page did not load" and carries os.loadavg(), the
 *  page load ms and the timeout (tests/e2e/load-diag.mjs). Same steps, same timeouts. */
export async function load(page, base, p, lang) {
  const url = `${base}/${p}.html?nosw&lang=${lang}`, ready = `document.documentElement.lang === ${S(HTML_LANG[lang])}`;
  let phase = "load event", t1 = Date.now();
  try {
    await page.goto(`${base}/${p}.html?nosw&lang=${lang}`);
    phase = "language applied"; t1 = Date.now();
    await page.waitFor(`document.documentElement.lang === ${S(HTML_LANG[lang])}`, LANG_WAIT_MS);
  } catch (e) {
    throw await diagnoseLoadFailure(page, e, { url, ready, phase, ms: Date.now() - t1, timeoutMs: phase === "load event" ? PAGE_LOAD_MS : LANG_WAIT_MS });
  }
  await sleep(450);
}

/** in-page helpers: vis (rendered, not inside a closed <details> unless it is the summary), help elements, positioned ancestors */
export const VIS = `const vis = e => { if (!e || !e.isConnected) return false;
    if (e.checkVisibility && !e.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    for (let x = e.parentElement; x; x = x.parentElement) if (x.tagName === "DETAILS" && !x.open && !(x.querySelector(":scope > summary") || { contains: () => false }).contains(e)) return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const HELP = 'a[href^="tel:"], .lq-helpline, .lq-call, .lq-call-mini, .fa-support, a[href*="counselling.html"]';
  const pinned = e => { for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === "fixed" || p === "sticky") return x; } return null; };
  const name = e => e ? (e.id ? "#" + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\\s+/).join(".") : "")) : "";`;

/** visible places of a number: visible tel:n links, and visible text nodes with n that are not inside such a link */
export const PLACES = n => `(() => { ${VIS}
  const re = new RegExp("(?<!\\\\d)" + ${S(n === "021136789" ? "02[\\s-]?113[\\s-]?6789" : n)} + "(?!\\\\d)");
  const links = [...document.querySelectorAll('a[href^="tel:"]')].filter(a => a.getAttribute("href").replace(/\\D/g, "") === ${S(n)} && vis(a));
  const out = links.map(a => "link:" + name(a.closest("[id]")) + ":" + a.innerText.replace(/\\s+/g, " ").trim());
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const p = t.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TEXTAREA|OPTION)$/.test(p.tagName) || !re.test(t.nodeValue)) continue;
    if (links.some(a => a.contains(p))) continue;
    if (vis(p)) out.push("text:" + name(p.closest("[id]")) + ":" + t.nodeValue.replace(/\\s+/g, " ").trim().slice(0, 60));
  }
  return out; })()`;

/** every other number (1669, 191, 1300, Samaritans) shows 0 times; returns the problems */
export async function noOtherNumbers(page, where) {
  const bad = [];
  for (const [id, n] of Object.entries(OTHER)) {
    const places = await page.evaluate(PLACES(n));
    if (places.length) bad.push(`${where}: ${id} shows ${places.length} time(s) ${S(places)}`);
  }
  return bad;
}

/** help elements that are fixed or sticky (or inside a fixed / sticky box); with allowBar, the top 1323 control in the sticky bar
 *  (#siteNav or #lqHelpTop) is allowed */
export const PINNED = allowBar => `(() => { ${VIS}
  const out = [];
  for (const e of document.querySelectorAll(HELP)) {
    if (!vis(e)) continue;
    const p = pinned(e);
    if (!p) continue;
    if (${allowBar ? "true" : "false"} && (p.id === "siteNav" || p.id === "lqHelpTop" || p.closest("#siteNav")) && !e.closest(".fa-support")) continue;
    out.push(name(e) + " in " + name(p) + " (" + getComputedStyle(p).position + ")");
  }
  return [...new Set(out)]; })()`;

/** normal state: help elements inside <main> (between content sections) */
export const IN_CONTENT = `(() => { ${VIS}
  const main = document.querySelector("main");
  if (!main) return ["no <main>"];
  return [...new Set([...main.querySelectorAll(HELP)].filter(vis).map(e => name(e)))]; })()`;

/** 1323 in one or two taps: a visible tel:1323 link (one tap after scrolling), else a top control that opens a dialog with it */
export async function taps1323(page) {
  const direct = await page.evaluate(`(() => { ${VIS} return [...document.querySelectorAll('a[href="tel:1323"]')].filter(vis).map(a => { const r = a.getBoundingClientRect(); return { w: r.width, h: r.height }; }); })()`);
  if (direct.some(d => d.w >= 44 && d.h >= 44)) return 1;
  const viaDialog = await page.evaluate(`(() => { ${VIS}
    const c = [...document.querySelectorAll('#siteNav [aria-haspopup="dialog"], #lqHelpTop [aria-haspopup="dialog"]')].find(vis);
    if (!c) return false; c.click();
    const d = [...document.querySelectorAll("dialog[open]")].find(x => x.querySelector('a[href="tel:1323"]'));
    if (d) d.close(); return !!d; })()`);
  return viaDialog ? 2 : 99;
}

/** set the page into the crisis state the way the crisis net does it: the crisis phrase in the page's first free-text field
 *  (or the first form / main when it has none), then window.LQCrisisFirst (the takeover: the card replaces every result area) */
export const PHRASE = { th: "อยากตายจริงๆ", en: "I want to die tonight", zh: "我不想活了" };
export const TRIGGER = phrase => `(() => {
  const FREE = 'textarea, input:not([type]), input[type="text"], input[type="search"], input[type="tel"]';
  const f = [...document.querySelectorAll("main " + FREE.split(", ").join(", main "))].find(e => e.getClientRects().length && !e.disabled && !e.readOnly);
  if (f) { f.value = ${S(phrase)}; }
  const el = f || document.querySelector("main form") || document.querySelector("main");
  if (typeof window.LQCrisisFirst !== "function") return "no LQCrisisFirst";
  return window.LQCrisisFirst(el, ${S(phrase)}) ? "ok" : "not shown"; })()`;

/** the crisis card's facts: order, lines, numbers, lists, link, sizes */
export const CARD = `(() => { ${VIS}
  const card = [...document.querySelectorAll(".fa-support")].find(vis);
  if (!card) return { card: false };
  const q = s => [...card.querySelectorAll(s)].find(vis) || null;
  const h3 = q("h3"), warm = q(".fa-support-warm"), more = card.querySelector("details.fa-support-more"), sum = more && more.querySelector("summary");
  const guide = q(".fa-support-guide"), tel = q('a[href="tel:1323"]'), link = q('a[href$="counselling.html"], a[href*="counselling.html?"]');
  const lines = e => { if (!e) return 0; const r = document.createRange(); r.selectNodeContents(e); const tops = new Set();
    for (const b of r.getClientRects()) if (b.width > 1 && b.height > 1) tops.add(Math.round(b.top + b.height / 2));
    const ts = [...tops].sort((a, b) => a - b), merged = []; for (const t of ts) if (!merged.length || t - merged[merged.length - 1] > 6) merged.push(t); return merged.length; };
  const pos = e => (e ? Math.round(e.getBoundingClientRect().top + scrollY) : null);
  const order = [warm, sum || more, guide, tel, link];
  const docOrder = order.every((e, i) => !e || i === 0 || !order[i - 1] || (order[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
  const yOrder = order.every((e, i) => !e || i === 0 || !order[i - 1] || pos(order[i - 1]) <= pos(e));
  const tels = [...card.querySelectorAll('a[href^="tel:"]')].filter(vis).map(a => a.getAttribute("href"));
  const txt = [...card.querySelectorAll("*")].filter(e => vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim())).map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join(" ")).join(" ");
  const nums = [...new Set((txt.replace(/(\\d)[\\s-](?=\\d)/g, "$1").match(/\\d{3,}/g) || []))];
  const lists = [...card.querySelectorAll("ul, ol")].filter(vis).length;
  const tb = tel ? tel.getBoundingClientRect() : null, lb = link ? link.getBoundingClientRect() : null;
  return { card: true, h3: !!h3, warm: !!warm, more: !!more, moreOpen: !!(more && more.open), sum: sum ? sum.textContent.trim() : "", guide: !!guide, tel: !!tel, link: !!link,
    linkHref: link ? link.href : "", linkText: link ? link.textContent.trim() : "", linkH: lb ? Math.round(lb.height) : 0,
    headLines: lines(h3) + lines(warm), docOrder, yOrder, tels, nums, lists, telW: tb ? Math.round(tb.width) : 0, telH: tb ? Math.round(tb.height) : 0,
    moreText: more ? [...more.childNodes].filter(n => n.nodeName !== "SUMMARY").map(n => n.textContent).join(" ").trim().length : 0,
    pinned: (() => { const p = pinned(card); return p ? name(p) : ""; })(), price: /฿|บาท|THB|\\bbaht\\b|元|ราคา|price|价格/i.test(card.textContent) };
})()`;

/** reading widgets that must be hidden in the crisis state (hotfix GENERIC list + every result root's leftovers) */
export const LEAKS = `(() => { ${VIS}
  const card = [...document.querySelectorAll(".fa-support")].find(vis);
  const KEEP = ".fa-support, .fa-soft, .lq-helpline, #lqHelpTop, .lq-crisis-slot, form, label, input, select, textarea, script, style, template";
  const generic = [".fa-section", ".fa-summary", ".fa-plan", '[id$="Share"]', '[id$="Print"]', "[data-lq-upsell]", "[data-lq-remedy]"];
  const out = [];
  for (const sel of generic) for (const e of document.querySelectorAll(sel)) if (vis(e) && !(card && (card.contains(e) || e.contains(card)))) out.push(sel + name(e));
  for (const root of document.querySelectorAll('[data-lq-result], [id$="Result"], [id$="Stats"]')) {
    for (const e of root.querySelectorAll("*")) {
      if (!vis(e) || (card && (card.contains(e) || e.contains(card))) || e.closest(KEEP) || e.querySelector(KEEP)) continue;
      const own = [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()) || e.matches("canvas, svg, img");
      if (own) out.push("in " + name(root) + ": " + name(e));
    }
  }
  return [...new Set(out)].slice(0, 12); })()`;

export { assert, loadFailText };
