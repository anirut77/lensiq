"use strict";
// tests/unit/fortune-credits.test.js — FIXED TEST SET "fortune-credits" (owner order 2026-11-17 night, item 2: fixes to what is
// live, no new features). Written and locked (~/LENSIQ-field/evals/fortune-credits/, evals-locks/fortune-credits.sha256)
// BEFORE the change on branch fortune-credits (base origin/main 5695734). Static half; the rendered half is
// tests/e2e/fortune-credits.e2e.mjs. Input list of credited assets: tests/unit/fortune-credits-assets.json (locked too).
//   C1 label   the reading-source label "เรียบเรียงในเครื่อง · สำนวนใหม่ทุกครั้ง" and its variants / EN / ZH equivalents are gone
//              from every fortune page: its HTML, its own scripts and every dictionary it loads (TH / EN / ZH)
//   C2 block   the "เกี่ยวกับคำอ่านนี้" block (image credits, vendor file path, principles paragraph) is gone from every fortune
//              page in TH / EN / ZH
//   C3 credits credits.html (platform page, registered in tools/cat-data.cjs) lists every asset of the fixed list in TH, EN
//              and ZH (name, holder and licence on one row), and every git-tracked file under vendor/ is credited or exempt
//   C4 help    help.html has a "หลักการทำนายของเรา" section in TH / EN / ZH (text may be loaded on demand from the file named
//              by data-src), plain principles, and no wording about the straight-reading mode
//   C5 foot    every fortune page ends with one small link to credits.html and one to help.html#h-principles, translated
//              in EN / ZH by a dictionary the page loads, and both targets exist
// Fortune pages = category 6 of tools/cat-data.cjs (+ compat). Run: node --test tests/unit/fortune-credits.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = f => fs.existsSync(path.join(ROOT, f));
const D = require(path.join(ROOT, "tools", "cat-data.cjs"));
const ASSETS = JSON.parse(fs.readFileSync(path.join(__dirname, "fortune-credits-assets.json"), "utf8"));
const FORT = [...new Set(D.CATEGORIES.find(c => c.n === 6).pages.concat(["compat"]))].filter(p => exists(p + ".html"));
const THAI = /[฀-๿]/;
const CJK = /[一-鿿]/;

/** local scripts of a page: [own scripts (not vendor/, not i18n/)], [i18n dictionaries incl. the en- sibling of each zh-] */
function scriptsOf(html) {
  const src = [...html.matchAll(/<script[^>]*\bsrc="([^"?#]+)/g)].map(m => m[1]).filter(s => !/^(?:https?:)?\/\//.test(s));
  const own = src.filter(s => !s.startsWith("vendor/") && !s.startsWith("i18n/") && exists(s));
  const dicts = new Set(src.filter(s => s.startsWith("i18n/")));
  for (const d of [...dicts]) { const en = d.replace(/^i18n\/zh-/, "i18n/en-"); if (exists(en)) dicts.add(en); }
  dicts.add("i18n/en-rt-fortune.js"); // run-time EN dictionary of the fortune pages (Thai text as key)
  return { own, dicts: [...dicts].filter(exists) };
}
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/** visible-ish text of an HTML string: no scripts / styles / tags */
const htmlText = h => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

// C1: the label and its variants, TH / EN / ZH
const LABEL_ANY = ["สำนวนใหม่ทุกครั้ง", "เรียบเรียงในเครื่อง ไม่ส่งข้อมูลออก", "Composed on this device", "Generated on this device",
  "worded differently each time", "wording varies each time", "本机生成", "本机撰写", "在本机撰写", "每次说法", "每次措辞"];
const LABEL_TH_BARE = /["'>]\s*เรียบเรียงในเครื่อง\s*["'<]/; // the bare Thai label as a string literal or a whole element text
// C2: the block, TH / EN / ZH
const ABOUT = ["เกี่ยวกับคำอ่านนี้", "About this reading", "关于本解读"];
const PRINCIPLE_STRAIGHT = ["หลักการ: เมื่อคุณเลือก", "Principle: when you choose", "原则：选择“直说”"];
const GONE_IDS = ["trCredit", "plEthics", "fsSourcesNote"];

test("fortune pages found (category 6 + compat)", () => {
  assert.ok(FORT.length >= 19, "fortune pages: " + FORT.join(","));
  for (const p of ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream",
    "zodiac", "compat", "astro", "lifegraph", "planner", "luckycolor", "report"]) assert.ok(FORT.includes(p), p);
});

test("C1 label: no reading-source label 'เรียบเรียงในเครื่อง · สำนวนใหม่ทุกครั้ง' (or variant, EN, ZH) on any fortune page", () => {
  const bad = [];
  for (const p of FORT) {
    const html = read(p + ".html"), { own, dicts } = scriptsOf(html);
    for (const n of LABEL_ANY) if (html.includes(n)) bad.push(`${p}.html: "${n}"`);
    if (LABEL_TH_BARE.test(html)) bad.push(`${p}.html: bare label เรียบเรียงในเครื่อง`);
    for (const f of own.concat(dicts)) {
      const src = stripComments(read(f));
      for (const n of LABEL_ANY) if (src.includes(n)) bad.push(`${p} -> ${f}: "${n}"`);
      if (LABEL_TH_BARE.test(src)) bad.push(`${p} -> ${f}: bare label เรียบเรียงในเครื่อง`);
      if (/\b(?:fk\.src\.local|horoscope\.x\.srcLocal|tarot\.srcLocal|palm\.src\.local|faceread\.src\.local|numbers\.src\.local|fengshui\.src\.local)\b/.test(src))
        bad.push(`${p} -> ${f}: label key still used or defined`);
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

test("C2 block: no 'เกี่ยวกับคำอ่านนี้' block (credits, vendor path, principles paragraph) on any fortune page, TH / EN / ZH", () => {
  const bad = [];
  for (const p of FORT) {
    const html = read(p + ".html"), { own, dicts } = scriptsOf(html), text = htmlText(html);
    for (const n of ABOUT.concat(PRINCIPLE_STRAIGHT)) if (text.includes(n)) bad.push(`${p}.html text: "${n}"`);
    if (/data-i18n="(?:fortune\.common\.about|compat\.aboutH)"/.test(html)) bad.push(`${p}.html: about heading key`);
    for (const id of GONE_IDS) if (new RegExp(`id="${id}"`).test(html)) bad.push(`${p}.html: #${id}`);
    if (/vendor\//.test(text)) bad.push(`${p}.html text: vendor/ path`);
    for (const f of own) {
      const src = stripComments(read(f));
      if (/CREDITS\.txt/.test(src)) bad.push(`${p} -> ${f}: CREDITS.txt in code`);
      for (const id of GONE_IDS) if (src.includes("#" + id) || src.includes(`"${id}"`)) bad.push(`${p} -> ${f}: writes #${id}`);
      if (/["']fortune\.common\.about["']/.test(src)) bad.push(`${p} -> ${f}: about heading key`);
    }
    for (const f of dicts) {
      const src = stripComments(read(f));
      if (/vendor\//.test(src)) bad.push(`${p} -> ${f}: vendor/ path in a dictionary`);
      for (const n of ABOUT) if (src.includes(n)) bad.push(`${p} -> ${f}: "${n}"`);
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

/** one language copy of a document page (.lg-th / .lg-en / .lg-zh) */
function article(html, lang) {
  const i = html.search(new RegExp(`<article[^>]*class="[^"]*\\blg-${lang}\\b`));
  assert.ok(i >= 0, "article .lg-" + lang);
  const j = html.indexOf("</article>", i);
  assert.ok(j > i, "end of article .lg-" + lang);
  return html.slice(i, j);
}

test("C3 credits: credits.html is a registered platform page with TH / EN / ZH copies", () => {
  assert.ok(exists("credits.html"), "credits.html");
  assert.ok(D.PAGES.credits, "tools/cat-data.cjs PAGES.credits");
  assert.equal(D.PAGES.credits.st, "support");
  assert.ok(D.PLATFORM.includes("credits") || Object.prototype.hasOwnProperty.call(D.UNLINKED, "credits"), "credits in PLATFORM or UNLINKED");
  const html = read("credits.html");
  for (const l of ["th", "en", "zh"]) article(html, l);
  assert.match(html, /<script src="nav\.js/, "nav.js (menu, legal footer)");
  assert.doesNotMatch(html, /fortune-(?:read|ai|crisis)\.js/, "not a reading page");
});

test("C3 credits: every asset of the fixed list has a row in TH, EN and ZH with its names and licence", () => {
  const html = read("credits.html"), bad = [];
  assert.ok(ASSETS.credits.length >= 30, "fixed list: " + ASSETS.credits.length);
  for (const l of ["th", "en", "zh"]) {
    const a = article(html, l);
    for (const c of ASSETS.credits) {
      const m = a.match(new RegExp(`<tr[^>]*data-credit="${c.id}"[^>]*>([\\s\\S]*?)</tr>`));
      if (!m) { bad.push(`${l}: no row data-credit="${c.id}"`); continue; }
      const t = htmlText(m[1]);
      for (const n of c.needles.concat([c.licence])) if (!t.includes(n)) bad.push(`${l} ${c.id}: missing "${n}"`);
      if (l === "en" && THAI.test(t.replace(/สมสท\.?|อย\./g, ""))) bad.push(`en ${c.id}: Thai text`);
    }
    if (l === "zh") assert.ok(CJK.test(htmlText(a)), "zh copy is Chinese");
    if (l === "th") assert.ok(THAI.test(htmlText(a)), "th copy is Thai");
  }
  assert.deepEqual(bad, []);
});

test("C3 credits: every git-tracked file under vendor/ is credited or exempt (a new vendor file fails until credited)", () => {
  let files;
  try { files = execFileSync("git", ["ls-files", "vendor"], { cwd: ROOT, maxBuffer: 64 << 20 }).toString().split("\n").filter(Boolean); }
  catch (e) { files = []; }
  assert.ok(files.length > 100, "git ls-files vendor: " + files.length);
  const prefixes = ASSETS.credits.flatMap(c => c.paths).concat(ASSETS.exempt.flatMap(e => e.paths));
  for (const e of ASSETS.exempt) assert.ok(e.reason && e.reason.length > 20, "exempt reason: " + e.paths);
  const loose = files.filter(f => !prefixes.some(p => f === p || f.startsWith(p)));
  assert.deepEqual(loose, [], "vendor files with no credit row and no exemption");
});

test("C3 credits: the moved items are on the credits page (tarot images, palm model, compat calculation, method notes)", () => {
  const html = read("credits.html");
  for (const l of ["th", "en", "zh"]) {
    const a = article(html, l);
    assert.match(a, /id="(?:en-|zh-)?c-methods"/, l + ": methods section");
    const items = (a.slice(a.search(/id="(?:en-|zh-)?c-methods"/)).match(/<li[\s>]/g) || []).length;
    assert.ok(items >= 9, `${l}: ${items} method notes (taksa, bazi, lek7, lifegraph, horoscope, iching, zodiac, compat, fengshui)`);
  }
});

const HELP_IDS = { th: "h-principles", en: "en-h-principles", zh: "zh-h-principles" };
const HELP_TITLE = { th: "หลักการทำนายของเรา" };
const STRAIGHT = { th: /ดูตรง|ตรง ๆ|ตรงๆ|18 ปี|นุ่มนวล/, en: /straight|18 or older|\bgentle|plain wording/i, zh: /直说|18 ?岁|温和|直白/ };
const MUST = {
  th: [/ความตาย/, /เลข(?:เสี่ยงโชค|หวย)/, /ยา/, /วิจารณญาณ/, /จ่ายเงิน|เสียเงิน/],
  en: [/death/i, /lottery/i, /medication|treatment/i, /judgement/i, /\bpay/i],
  zh: [/死亡/, /彩票/, /药|治疗/, /判断/, /付费|付钱|花钱/]
};
/** body of a help principles section: inline text, or the file named by data-src (window.LQ_HELP_PRINCIPLES[lang]) */
function helpSection(lang) {
  const html = read("help.html"), a = article(html, lang);
  const m = a.match(new RegExp(`<details[^>]*id="${HELP_IDS[lang]}"[^>]*>([\\s\\S]*?)</details>`));
  assert.ok(m, `help.html ${lang}: details#${HELP_IDS[lang]}`);
  const tag = a.slice(a.indexOf(`id="${HELP_IDS[lang]}"`) - 40, a.indexOf(`id="${HELP_IDS[lang]}"`) + 200);
  const summary = htmlText((m[1].match(/<summary>([\s\S]*?)<\/summary>/) || ["", ""])[1]).trim();
  let body = htmlText(m[1].replace(/<summary>[\s\S]*?<\/summary>/, "")).trim();
  const ds = tag.match(/data-src="([^"?#]+)/);
  if (ds) {
    assert.ok(exists(ds[1]), "data-src file " + ds[1]);
    const sb = { window: {} };
    sb.globalThis = sb;
    vm.runInNewContext(read(ds[1]), sb, { filename: ds[1] });
    const P = sb.window.LQ_HELP_PRINCIPLES || sb.LQ_HELP_PRINCIPLES;
    assert.ok(P && P[lang], `${ds[1]}: LQ_HELP_PRINCIPLES.${lang}`);
    body = (body + " " + [].concat(P[lang]).join(" ")).trim();
  }
  return { summary, body };
}

test("C4 help: 'หลักการทำนายของเรา' section in TH / EN / ZH, plain principles, no straight-mode wording", () => {
  for (const l of ["th", "en", "zh"]) {
    const { summary, body } = helpSection(l);
    if (HELP_TITLE[l]) assert.equal(summary, HELP_TITLE[l]);
    assert.ok(summary.length >= 4, l + " summary");
    if (l === "en") assert.ok(!THAI.test(summary + body) && !CJK.test(summary + body), "en has no Thai / Chinese");
    if (l === "zh") assert.ok(CJK.test(summary) && CJK.test(body) && !THAI.test(summary + body), "zh is Chinese");
    if (l === "th") assert.ok(THAI.test(body), "th is Thai");
    assert.ok(body.length >= (l === "zh" ? 120 : 300), `${l}: body ${body.length} chars`);
    for (const re of MUST[l]) assert.match(body, re, `${l}: principle ${re}`);
    assert.doesNotMatch(summary + " " + body, STRAIGHT[l], `${l}: describes the straight-reading mode`);
  }
});

test("C5 foot: every fortune page ends with a link to credits.html and to help.html#h-principles, translated, targets exist", () => {
  assert.ok(exists("credits.html"), "credits.html exists");
  const help = read("help.html");
  for (const id of Object.values(HELP_IDS)) assert.match(help, new RegExp(`id="${id}"`), "help.html #" + id);
  const bad = [];
  for (const p of FORT) {
    const html = read(p + ".html"), { dicts } = scriptsOf(html);
    const end = html.lastIndexOf("</main>");
    const links = [["credits.html", /<a\b[^>]*href="credits\.html"[^>]*>/g], ["help.html#h-principles", /<a\b[^>]*href="help\.html#h-principles"[^>]*>/g]];
    for (const [href, re] of links) {
      const all = [...html.matchAll(re)];
      if (all.length !== 1) { bad.push(`${p}: ${all.length} links to ${href}`); continue; }
      const at = all[0].index;
      if (end < 0 || at > end) { bad.push(`${p}: link to ${href} not inside <main>`); continue; }
      if (/<section\b/.test(html.slice(at, end))) bad.push(`${p}: link to ${href} is not at the foot (a section follows)`);
      const key = (all[0][0].match(/data-i18n="([^"]+)"/) || [])[1];
      if (!key) { bad.push(`${p}: link to ${href} has no data-i18n key`); continue; }
      const zh = dicts.filter(f => /\/zh-/.test(f)).some(f => read(f).includes(`"${key}"`));
      const en = dicts.filter(f => /\/en-/.test(f)).some(f => read(f).includes(`"${key}"`));
      if (!zh || !en) bad.push(`${p}: key ${key} missing in a loaded ${zh ? "en" : "zh"} dictionary`);
    }
  }
  assert.deepEqual(bad, []);
});
