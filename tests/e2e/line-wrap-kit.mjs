// tests/e2e/line-wrap-kit.mjs — FIXED TEST SET "line wrap" (owner request 2026-11-17, from the dream page on a phone: the
// closing bracket of "(ไม่บังคับ · ไม่บันทึก ไม่ส่งออก)" dropped alone onto the next line). Locked BEFORE any product fix
// (evals-locks/line-wrap.sha256, ~/LENSIQ-field/evals/line-wrap/). Shared runner of tests/e2e/line-wrap-<k>.e2e.mjs
// (k = 1..PARTS; part k checks every page whose index in the sorted list of *.html in the repo root is k-1 modulo PARTS).
// Every page (all 73 *.html) × TH / EN / ZH × phone widths 360, 375, 393, 414, 430 px, at load (no user action), the whole
// page (not only the first screen). Line boxes are read from the layout: Range.getClientRects() per text node (per
// character where a text node wraps), grouped per block container (the nearest ancestor that is not display inline /
// contents; inline-block, inline-flex and replaced inline boxes count as one object in their parent's line).
// Three kinds of finding, each FAILS unless an entry of tests/e2e/line-wrap-exceptions.json covers it:
//   P  lone punctuation: a line (not the first of its block) starts with closing punctuation  ) ] } » ” ’ , . : ; ! ? % …
//      、 。 ， ． ： ； ！ ？ ） 」 』 】 〕 〉 》 ฯ ๆ   — or a line (not the last) ends with an opening bracket ( [ { « “ ‘ （ 「 『 【 〔 〈 《
//   W  widow: a short block (2–4 lines, content box at least 200 px wide) whose last line holds one short word: no space
//      inside it (TH / ZH: one run; EN: one word) or two words, and no wider than 3 × the font size, while the line above
//      fills more than 60 % of the box (so an intended short last line after a forced break is not counted)
//   U  split number + unit: a line ends with a digit and the next starts with a unit (TH / EN / ZH unit list below) or with
//      "%"; a line ends with a currency sign (฿ $ € ¥ £) and the next starts with a digit; or a number is cut in two (a
//      digit on both sides of the break with no space between them, e.g. "13|23")
// Not text: script / style / noscript / template / svg / select / option / textarea, white-space pre / pre-wrap / pre-line
// blocks (laid out by hand), hidden elements (no box, visibility hidden, opacity 0, closed <details> body, closed <dialog>),
// boxes under 2 px (screen-reader-only text).
// Exceptions (APPEND-ONLY, explicit and narrow): each entry names page, kind, a text the finding contains, optional lang
// and width, why it cannot or should not be changed, and the date added. Counts per page × language × width are printed
// ("count" lines) and, with LQ_LINEWRAP_OUT=<file.jsonl>, appended as JSON lines (outside the repo).
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

export const PARTS = 8;
export const LANGS = ["th", "en", "zh"];
export const WIDTHS = [360, 375, 393, 414, 430];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
export const PAGES = readdirSync(repo).filter(f => f.endsWith(".html")).sort();
const EXC = JSON.parse(readFileSync(join(here, "line-wrap-exceptions.json"), "utf8")).exceptions;
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// no dialog ever blocks the page; no camera prompt is answered (Chrome's fake device)
const INIT = "window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;";

/** @param {{page:string, lang:string, w:number, kind:string, text:string}} f */
export const excepted = f => EXC.some(e => e.page === f.page && e.kind === f.kind && f.text.includes(e.contains) &&
  (!e.lang || e.lang === f.lang) && (!e.width || e.width === f.w));

// Runs in the page: findings at the current width. Returns [{kind, text}].
export const PROBE = `(() => {
  const CLOSE = /^[)\\]}»”’,.:;!?%…、。，．：；！？）」』】〕〉》ฯๆ]/;
  const OPEN = /[(\\[{«“‘（「『【〔〈《]$/;
  const UNIT = /^(?:%|‰|°|บาท|นาที|วินาที|ชั่วโมง|ชม\\.|วัน|สัปดาห์|เดือน|ปี|คน|ครั้ง|ข้อ|หน้า|ภาพ|รูป|ใบ|ชิ้น|ตัว|กล้อง|จุด|ที่นั่ง|เท่า|เฟรม|กก\\.|กรัม|ซม\\.|มม\\.|กม\\.|เมตร|ลิตร|มล\\.|กิโล|แคลอรี|分钟|分|秒|小时|天|周|个月|月|年|岁|人|次|个|张|页|元|泰铢|帧|倍|台|千克|公斤|克|厘米|毫米|米|公里|毫升|升|千卡|(?:KB|MB|GB|TB|kB|px|ms|fps|FPS|s|sec|secs|seconds?|mins?|minutes?|h|hrs?|hours?|days?|weeks?|months?|years?|yrs?|people|persons?|seats?|cameras?|pages?|photos?|images?|points?|times|THB|baht|kg|g|cm|mm|km|m|kcal|cal|ml|L|x|×)(?![A-Za-z]))/;
  const SKIP = "script,style,noscript,template,svg,select,option,textarea,title";
  const OBJ = "\\uFFFC";
  const disp = new Map(), cs = el => { let c = disp.get(el); if (!c) { c = getComputedStyle(el); disp.set(el, c); } return c; };
  const shown = el => {
    if (!el.getClientRects().length) return false;
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    for (let x = el; x && x.nodeType === 1; x = x.parentElement) {
      if (x.tagName === "DETAILS" && !x.open && x !== el && !(x.firstElementChild && x.firstElementChild.tagName === "SUMMARY" && x.firstElementChild.contains(el))) return false;
      if (x.tagName === "DIALOG" && !x.open) return false;
    }
    return true;
  };
  const blockOf = el => { while (el && el !== document.body && (cs(el).display === "inline" || cs(el).display === "contents")) el = el.parentElement; return el || document.body; };
  const name = el => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".") : "");
  const blocks = new Map(); // container -> fragments [{t, top, bottom, left, right, order}]
  let order = 0;
  const add = (b, f) => { let a = blocks.get(b); if (!a) blocks.set(b, a = []); f.order = order++; a.push(f); };
  const range = document.createRange();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => n.nodeType === 1 ? (n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP) : NodeFilter.FILTER_ACCEPT });
  const textNodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue) textNodes.push(n); // spaces between inline elements count (word boundaries)
  // atomic inline boxes (one object in the parent's line)
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest(SKIP + ",pre") && !el.matches("svg,select,textarea")) continue;
    const d = cs(el).display;
    const atomic = /^inline-/.test(d) || (d === "inline" && /^(IMG|SVG|svg|INPUT|BUTTON|SELECT|TEXTAREA|CANVAS|VIDEO|IFRAME)$/.test(el.tagName));
    if (!atomic || !el.parentElement || !shown(el)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    add(blockOf(el.parentElement), { t: OBJ, top: r.top, bottom: r.bottom, left: r.left, right: r.right, node: el });
  }
  const docOrder = (a, b) => a === b ? 0 : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  for (const t of textNodes) {
    const p = t.parentElement; if (!p || !shown(p)) continue;
    const b = blockOf(p), bs = cs(b);
    if (/^pre/.test(bs.whiteSpace) || /^pre/.test(cs(p).whiteSpace) || bs.whiteSpaceCollapse === "preserve") continue;
    const br = b.getBoundingClientRect(); if (br.width < 2 || br.height < 2) continue;
    range.selectNodeContents(t);
    const rs = [...range.getClientRects()].filter(r => r.width > 0 || r.height > 0);
    if (!rs.length) continue;
    const tops = new Set(rs.map(r => Math.round(r.top)));
    if (tops.size === 1 && rs.every(r => Math.abs(r.bottom - rs[0].bottom) < 2)) {
      const top = Math.min(...rs.map(r => r.top)), bottom = Math.max(...rs.map(r => r.bottom));
      add(b, { t: t.nodeValue, top, bottom, left: Math.min(...rs.map(r => r.left)), right: Math.max(...rs.map(r => r.right)), node: t });
      continue;
    }
    // wraps: one fragment per line, split where the characters' line changes
    const s = t.nodeValue; let cur = null;
    for (let i = 0; i < s.length; ) {
      const cp = s.codePointAt(i), len = cp > 0xffff ? 2 : 1;
      range.setStart(t, i); range.setEnd(t, i + len);
      const r = [...range.getClientRects()].find(q => q.height > 0);
      const ch = s.slice(i, i + len);
      if (!r) { if (cur) cur.t += ch; i += len; continue; }
      if (!cur || r.top >= cur.bottom - 1 || (r.left < cur.left - 1 && r.top > cur.top + 1)) {
        if (cur) add(b, cur);
        cur = { t: ch, top: r.top, bottom: r.bottom, left: r.left, right: r.right, node: t };
      } else { cur.t += ch; cur.top = Math.min(cur.top, r.top); cur.bottom = Math.max(cur.bottom, r.bottom); cur.right = Math.max(cur.right, r.right); }
      i += len;
    }
    if (cur) add(b, cur);
  }
  const out = [];
  for (const [b, frags] of blocks) {
    if (!frags.some(f => f.t !== OBJ && f.t.trim())) continue;
    frags.sort((x, y) => x.node === y.node ? x.order - y.order : docOrder(x.node, y.node));
    const lines = [];
    for (const f of frags) {
      const mid = (f.top + f.bottom) / 2, L = lines[lines.length - 1];
      if (L && mid >= L.top - 1 && mid <= L.bottom + 1) { L.t += f.t; L.left = Math.min(L.left, f.left); L.right = Math.max(L.right, f.right); L.top = Math.min(L.top, f.top); L.bottom = Math.max(L.bottom, f.bottom); }
      else if (f.t.trim()) lines.push({ t: f.t, top: f.top, bottom: f.bottom, left: f.left, right: f.right });
    }
    if (lines.length < 2) continue;
    const bs = cs(b), br = b.getBoundingClientRect();
    const cw = br.width - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight) - parseFloat(bs.borderLeftWidth) - parseFloat(bs.borderRightWidth);
    const fs = parseFloat(bs.fontSize) || 16;
    const ctx = (i) => (lines[i - 1].t.replace(/\\s+/g, " ").trim().slice(-24) + " | " + lines[i].t.replace(/\\s+/g, " ").trim().slice(0, 24)).replace(new RegExp(OBJ, "g"), "▣");
    for (let i = 1; i < lines.length; i++) {
      const prevRaw = lines[i - 1].t, curRaw = lines[i].t, prev = prevRaw.replace(/\\s+$/, ""), cur = curRaw.replace(/^\\s+/, "");
      if (CLOSE.test(cur)) out.push({ kind: "P", text: name(b) + ": " + ctx(i) });
      else if (OPEN.test(prev)) out.push({ kind: "P", text: name(b) + ": " + ctx(i) });
      const glued = !/\\s$/.test(prevRaw) && !/^\\s/.test(curRaw);
      if ((/\\d$/.test(prev) && (UNIT.test(cur) || (glued && /^\\d/.test(cur)))) || (/[฿$€¥£]$/.test(prev) && /^\\d/.test(cur)))
        out.push({ kind: "U", text: name(b) + ": " + ctx(i) });
    }
    if (lines.length <= 4 && cw >= 200) {
      const last = lines[lines.length - 1], prevL = lines[lines.length - 2];
      const words = last.t.replace(new RegExp(OBJ, "g"), "").trim().split(/\\s+/).filter(Boolean);
      const lw = last.right - last.left, pw = prevL.right - prevL.left;
      if (words.length >= 1 && words.length <= 2 && lw <= 3 * fs && pw > 0.6 * cw)
        out.push({ kind: "W", text: name(b) + ": " + ctx(lines.length - 1) });
    }
  }
  return out;
})()`;

async function load(page, base, p, lang) {
  await page.goto(`${base}/${p}?nosw`);
  await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 10000);
  await page.evaluate("document.fonts ? document.fonts.ready.then(() => 1) : 1");
  await sleep(900); // dictionaries, nav.js Thai word breaks (idle callback) and late scripts settle
}
const phone = (page, w) => page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 2, mobile: true });

/** measure one page in one language at every width -> { [w]: findings[] } or { err } */
export async function measure(browser, base, p, lang) {
  const page = await browser.newPage(null, { initScripts: [INIT, `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
  try {
    await phone(page, 393);
    await load(page, base, p, lang);
    const res = {};
    for (const w of WIDTHS) {
      await phone(page, w); await page.evaluate("window.scrollTo(0, 0)"); await sleep(150);
      res[w] = await page.evaluate(PROBE);
    }
    return res;
  } catch (e) { return { err: String(e && e.message || e) }; }
  finally { await page.close(); }
}

export async function runPart(ctx, k) {
  const { base, launch, check } = ctx;
  const pages = PAGES.filter((_, i) => i % PARTS === k - 1);
  await check(`part ${k}/${PARTS} has pages; every exception is narrow and has a reason`, async () => {
    assert(pages.length > 0, "no pages in this part");
    for (const e of EXC) assert(e.page && /^[PWU]$/.test(e.kind) && e.contains && e.contains.length >= 4 && e.reason && e.reason.length > 20 && e.added,
      "exception without page / kind / contains (≥ 4 characters) / reason / added: " + S(e));
  });
  const out = process.env.LQ_LINEWRAP_OUT;
  const browser = await launch();
  try {
    for (const p of pages) for (const lang of LANGS) {
      await check(`${p} ${lang}: 360 / 375 / 393 / 414 / 430 — no lone punctuation, widow or split number + unit`, async () => {
        const r = await measure(browser, base, p, lang);
        assert(!r.err, `${p} ${lang} did not load: ${r.err}`);
        const bad = [];
        for (const w of WIDTHS) {
          const fs = r[w].map(f => ({ ...f, page: p, lang, w }));
          const n = { P: 0, W: 0, U: 0 }, x = { P: 0, W: 0, U: 0 };
          for (const f of fs) { n[f.kind]++; if (excepted(f)) x[f.kind]++; else bad.push(`${w} ${f.kind} ${f.text}`); }
          if (fs.length) console.log(`       count ${p} ${lang} ${w}: P ${n.P} W ${n.W} U ${n.U} (excepted P ${x.P} W ${x.W} U ${x.U})`);
          if (out) appendFileSync(out, S({ page: p, lang, w, n, x, findings: r[w] }) + "\n");
        }
        assert(!bad.length, `${bad.length} line break problem(s):\n         ` + bad.slice(0, 30).join("\n         "));
      });
    }
  } finally { await browser.close(); }
}
