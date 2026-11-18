// tests/unit/crisis-price-scan-lib.cjs — FIXED TEST SET "crisis-v3-protect" (locked 2026-11-18 BEFORE building; copies + sha256 in
// ~/LENSIQ-field/evals/crisis-v3-protect/, evals-locks/crisis-v3-protect.sha256). Residual risk 1 of the crisis-v3 review: the escape
// guard (tests/unit/crisis-escape-guard.test.js, tests/e2e/crisis-escape-guard-kit.mjs) only catches sales elements that carry a
// sales marker. This is the TEXT half: unmarked price / sales wording, in TH / EN / ZH, wherever it is.
// One scanner, used by the static unit scan (tests/unit/crisis-price-scan.test.js) and injected into the browser by the e2e kit
// (tests/e2e/crisis-price-scan-kit.mjs) via SCAN_SRC, so both halves flag exactly the same words.
// Words (owner order 2026-11-18): "ราคา", "฿", "THB", "บาท", "ซื้อ", "สั่งซื้อ", "ชำระ", "price", "buy", "购买", "价格", "元", plus
// a price amount in any currency. Known false matches of a bare substring, handled in the pattern (not by the allow-list):
//   "บาท" inside "บทบาท" (role); "元" inside 元素 / 单元 / 元旦 / 元气 (crisis-v3 re-lock 2 found 元素): 元 counts only after a number
//   (not 四元素 / 元年); "พระบาท" (the Buddha's feet); "ชำระล้าง" (to cleanse); "$1" (a JS replacement token): a dollar amount needs two digits or decimals.
// Exceptions that are real text but not a sale go in tests/unit/crisis-escape-guard-allow.json "priceText", each with a reason.
"use strict";

const NUM_ZH = "0-9０-９一二两三四五六七八九十百千万";
/** [name, source, flags] — kept as plain data so the browser gets the same patterns */
const PATTERNS = [
  // "$" + one digit alone is a JS replacement token ("$1"), so a dollar amount needs two digits or decimals
  ["amount", String.raw`(?:฿|THB|USD|US\$|¥|￥|RMB|CNY)\s?\d|\$\s?(?:\d{2,}|\d[.,]\d)|\d[\d,.]*\s?(?:บาท|฿|THB|baht|USD|RMB|元|块)`, "i"],
  ["฿", "฿", ""],
  ["THB", String.raw`\bTHB\b`, "i"],
  ["บาท", "(?<!บท|พระ)บาท", ""], // not บทบาท (role), พระบาท (the Buddha's feet)
  ["ราคา", "ราคา", ""],
  ["ซื้อ", "ซื้อ", ""], // also catches สั่งซื้อ
  ["ชำระ", "ชำระ(?!ล้าง)", ""], // not ชำระล้าง (to cleanse)
  ["baht", String.raw`\bbaht\b`, "i"],
  ["price", String.raw`\bpric(?:e|es|ed|ing)\b`, "i"],
  ["buy", String.raw`\bbuy(?:s|ing)?\b`, "i"],
  ["purchase", String.raw`\bpurchas(?:e|es|ed|ing)\b`, "i"],
  ["购买", "购买|購買", ""],
  ["价格", "价格|價格", ""],
  ["元", "[" + NUM_ZH + "]\\s?元(?!素|旦|气|宵|首|帅|年|代)", ""], // 四元素 = the four elements, 元年 = first year
  ["¥", "[¥￥]", ""],
];

/** negative controls (unit P1 / P3, e2e controls): one unmarked price string per language */
const INJECT = {
  th: "อ่านฉบับเต็ม ราคา 99 บาท",
  en: "Unlock the full reading for THB 99 — buy now",
  zh: "完整解读 价格 99元 立即购买",
};

/** every sales hit in a text: [{name, at, match}] */
function scan(text) {
  const out = [];
  for (const [name, src, fl] of PATTERNS) {
    const re = new RegExp(src, fl + "g");
    let m;
    while ((m = re.exec(text))) { out.push({ name, at: m.index, match: m[0] }); if (!m[0].length) re.lastIndex++; }
  }
  return out;
}

/** allow-list entries: [{where, text, reason}]; a hit is allowed when the entry's `where` matches (page or file, or "*") and
 *  its `text` is contained in the hit's context (the whole text node / string the hit was found in) */
function allowedBy(entries, where, context) {
  return (entries || []).findIndex(e => (e.where === where || e.where === "*") && context.includes(e.text));
}

/** browser-side copy (same patterns): defines window.__lqPriceScan(text) -> [{name, match}] */
const SCAN_SRC = `(() => { const P = ${JSON.stringify(PATTERNS)};
  window.__lqPriceScan = t => { const out = []; for (const [name, src, fl] of P) { const re = new RegExp(src, fl + "g"); let m;
    while ((m = re.exec(t))) { out.push({ name, match: m[0] }); if (!m[0].length) re.lastIndex++; } } return out; }; return true; })()`;

/* ---------------- static extraction (unit half) ---------------- */
// an element with one of these is hidden in the crisis state (fortune-read.js / fortune-crisis.js / fortune-paid.js / styles.css /
// lensiq-crisis-takeover.js): its text is not scanned statically (the browser half still scans whatever is visible)
const MARKED = /\sdata-lq-(?:upsell|remedy|paid|merit|plan|share|print|crisis-hide)\b|\sclass="[^"]*\b(?:fa-plan|lq-merit|lq-paid|fa-straight|fa-support|fa-soft)\b|\sid="[^"]*(?:Share|Print|Stats)"/;
const VOID = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
/** text a visitor can see in a page's HTML (text, aria-label, title, placeholder, alt, value), outside marked elements */
function htmlTexts(html) {
  html = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, "");
  const out = [], stack = [];
  let hid = 0, m;
  const re = /<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
  while ((m = re.exec(html))) {
    if (m[3]) { if (!hid && m[3].trim()) out.push(m[3].replace(/\s+/g, " ").trim()); continue; }
    const tag = m[1].toLowerCase();
    if (m[0][1] === "/") { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === tag) { hid -= stack.splice(i).filter(x => x.marked).length; break; } continue; }
    const marked = MARKED.test(" " + m[2]);
    if (!hid && !marked) for (const a of m[2].matchAll(/\s(?:aria-label|title|placeholder|alt|value)="([^"]*)"/g)) if (a[1].trim()) out.push(a[1]);
    if (VOID.test(tag) || /\/\s*$/.test(m[2])) continue;
    stack.push({ tag, marked });
    if (marked) hid++;
  }
  return out;
}
/** string literals of a script (comments removed); i18n keys ("rp.gate.buy") and file names ("pricing.html") are not text */
function jsStrings(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");
  const out = [], re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(src))) { const s = m[1] ?? m[2] ?? m[3]; if (!/^[\w-]+(?:\.[\w-]+)+$/.test(s)) out.push(s); }
  return out;
}

module.exports = { INJECT, PATTERNS, scan, allowedBy, SCAN_SRC, htmlTexts, jsStrings, MARKED };
