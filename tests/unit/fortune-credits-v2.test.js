"use strict";
// tests/unit/fortune-credits-v2.test.js — FIXED TEST SET "fortune-credits__v2" (owner decision 2026-11-18: delete, do not move;
// supersedes the 2026-11-17 night brief and the v1 set tests/unit/fortune-credits.test.js, whose locked bytes stay in
// ~/LENSIQ-field/evals/fortune-credits/ and evals-locks/fortune-credits.sha256). Written and locked (~/LENSIQ-field/evals/
// fortune-credits/v2/, evals-locks/fortune-credits__v2.sha256) BEFORE the v2 product change on branch fortune-credits.
// Static half; the rendered half is tests/e2e/fortune-credits-v2.e2e.mjs. Audit input: tests/unit/fortune-credits-v2-assets.json.
//   D1 label    the reading-source label "เรียบเรียงในเครื่อง · สำนวนใหม่ทุกครั้ง" and its variants / EN / ZH equivalents are deleted
//               from every fortune page: its HTML, its own scripts and every dictionary it loads; no replacement
//   D2 block    the "เกี่ยวกับคำอ่านนี้" block (heading, principles paragraph, calculation notes; luckycolor keeps its own colour-source block) is deleted from every fortune page
//               in TH / EN / ZH; no vendor/ path and no tarot image credit on any reading page
//   D3 no move  help.html has no principles section added (no #h-principles, no "หลักการทำนายของเรา", no lazily loaded section);
//               no fortune page or its own scripts links credits.html or help.html#h-principles
//   D4 credits  every vendor asset a fortune page loads is in the licence audit with its notice shipped; credits.html exists only
//               if an audited licence requires on-page attribution, and then is linked only from the site footer (nav.js)
//   D5 terms    terms.html is byte-identical to main at the base (origin/main 5695734)
// Fortune pages = category 6 of tools/cat-data.cjs (+ compat). Run: node --test tests/unit/fortune-credits-v2.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = f => fs.existsSync(path.join(ROOT, f));
const D = require(path.join(ROOT, "tools", "cat-data.cjs"));
const AUDIT = JSON.parse(fs.readFileSync(path.join(__dirname, "fortune-credits-v2-assets.json"), "utf8"));
const FORT = [...new Set(D.CATEGORIES.find(c => c.n === 6).pages.concat(["compat"]))].filter(p => exists(p + ".html"));
const TERMS_SHA256_MAIN = "d9fcc8c0f5693a20ce3dbc7e3784474519657e94b82377f2f2fd9850f61af103"; // terms.html at origin/main 5695734

/** local scripts and styles of a page: own scripts (not vendor/, not i18n/), dictionaries (+ en- sibling of each zh-), css */
function partsOf(html) {
  const src = [...html.matchAll(/<script[^>]*\bsrc="([^"?#]+)/g)].map(m => m[1]).filter(s => !/^(?:https?:)?\/\//.test(s));
  const own = src.filter(s => !s.startsWith("vendor/") && !s.startsWith("i18n/") && exists(s));
  const dicts = new Set(src.filter(s => s.startsWith("i18n/")));
  for (const d of [...dicts]) { const en = d.replace(/^i18n\/zh-/, "i18n/en-"); if (exists(en)) dicts.add(en); }
  dicts.add("i18n/en-rt-fortune.js");
  const css = [...html.matchAll(/<link[^>]*href="([^"?#]+\.css)/g)].map(m => m[1]).filter(exists);
  return { src, own, dicts: [...dicts].filter(exists), css };
}
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const htmlText = h => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const LABEL_ANY = ["สำนวนใหม่ทุกครั้ง", "เรียบเรียงในเครื่อง ไม่ส่งข้อมูลออก", "Composed on this device", "Generated on this device",
  "worded differently each time", "wording varies each time", "本机生成", "本机撰写", "在本机撰写", "每次说法", "每次措辞"];
const LABEL_TH_BARE = /["'>]\s*เรียบเรียงในเครื่อง\s*["'<]/;
const LABEL_KEYS = /\b(?:fk\.src\.local|horoscope\.x\.srcLocal|tarot\.srcLocal|palm\.src\.local|faceread\.src\.local|numbers\.src\.local|fengshui\.src\.local)\b/;
const ABOUT = ["เกี่ยวกับคำอ่านนี้", "About this reading", "关于本解读"];
const PRINCIPLE = ["หลักการ: เมื่อคุณเลือก", "Principle: when you choose", "原则：选择“直说”"];
const TAROT_CREDIT = ["Pamela Colman Smith", "Rider–Waite–Smith", "Rider-Waite", "Wikimedia Commons", "CREDITS.txt", "ภาพไพ่:", "Card images:", "牌面图片"];
const GONE_IDS = ["trCredit", "plEthics", "fsSourcesNote"];

test("fortune pages found (category 6 + compat, 19)", () => {
  for (const p of ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream",
    "zodiac", "compat", "astro", "lifegraph", "planner", "luckycolor", "report"]) assert.ok(FORT.includes(p), p);
});

test("D1 label deleted on every fortune page (HTML, own scripts, loaded dictionaries; TH / EN / ZH)", () => {
  const bad = [];
  for (const p of FORT) {
    const html = read(p + ".html"), { own, dicts } = partsOf(html);
    for (const n of LABEL_ANY) if (html.includes(n)) bad.push(`${p}.html: "${n}"`);
    if (LABEL_TH_BARE.test(html)) bad.push(`${p}.html: bare label`);
    for (const f of own.concat(dicts)) {
      const src = stripComments(read(f));
      for (const n of LABEL_ANY) if (src.includes(n)) bad.push(`${p} -> ${f}: "${n}"`);
      if (LABEL_TH_BARE.test(src)) bad.push(`${p} -> ${f}: bare label`);
      if (LABEL_KEYS.test(src)) bad.push(`${p} -> ${f}: label key`);
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

test("D2 'เกี่ยวกับคำอ่านนี้' block deleted; no vendor/ path, no tarot image credit on any reading page (TH / EN / ZH)", () => {
  const bad = [];
  for (const p of FORT) {
    const html = read(p + ".html"), { own, dicts } = partsOf(html), text = htmlText(html);
    for (const n of ABOUT.concat(PRINCIPLE, TAROT_CREDIT)) if (text.includes(n)) bad.push(`${p}.html text: "${n}"`);
    if (/data-i18n="(?:fortune\.common\.about|compat\.aboutH|(?!lucky\.)[a-z]+\.principle|numbers\.src\.principle)"/.test(html)) bad.push(`${p}.html: about / principle key`);
    for (const id of GONE_IDS) if (new RegExp(`id="${id}"`).test(html)) bad.push(`${p}.html: #${id}`);
    if (/vendor\//.test(text)) bad.push(`${p}.html text: vendor/ path`);
    for (const f of own) {
      const src = stripComments(read(f));
      if (/CREDITS\.txt/.test(src)) bad.push(`${p} -> ${f}: CREDITS.txt`);
      if (/\bimageCredit\b/.test(src.replace(/imageCredit\s*:/g, ""))) bad.push(`${p} -> ${f}: shows KB.imageCredit`);
      if (/["']tarot\.credit["']/.test(src)) bad.push(`${p} -> ${f}: tarot.credit`);
      for (const id of GONE_IDS) if (src.includes("#" + id) || src.includes(`"${id}"`)) bad.push(`${p} -> ${f}: #${id}`);
    }
    for (const f of dicts) {
      const src = stripComments(read(f));
      if (/vendor\//.test(src)) bad.push(`${p} -> ${f}: vendor/ path`);
      for (const n of ABOUT.concat(["Pamela Colman Smith", "CREDITS.txt"])) if (src.includes(n)) bad.push(`${p} -> ${f}: "${n}"`);
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

test("D3 delete, do not move: no principles section on help.html, no fortune-page link to credits or help principles", () => {
  const help = read("help.html");
  assert.doesNotMatch(help, /id="(?:en-|zh-)?h-principles"/, "help.html #h-principles");
  assert.doesNotMatch(help, /หลักการทำนายของเรา|Our reading principles|我们的解读原则/, "help.html principles heading");
  assert.doesNotMatch(help, /<details[^>]*data-src=/, "help.html lazily loaded section");
  assert.ok(!exists("help-principles.js"), "help-principles.js");
  const bad = [];
  for (const p of FORT) {
    const html = read(p + ".html"), { own, dicts } = partsOf(html);
    if (/credits\.html|h-principles|lq-ffoot|fortune\.foot\./.test(html)) bad.push(`${p}.html: link / foot`);
    for (const f of own) if (/credits\.html|h-principles/.test(stripComments(read(f)))) bad.push(`${p} -> ${f}: link`);
    for (const f of dicts) if (/fortune\.foot\./.test(read(f))) bad.push(`${p} -> ${f}: foot key`);
  }
  assert.deepEqual([...new Set(bad)], []);
});

test("D4 licence audit: every vendor asset a fortune page loads is audited, its notice ships; credits page only if required", () => {
  const notices = read("LICENSES/THIRD-PARTY-NOTICES.txt");
  const prefixes = AUDIT.assets.flatMap(a => a.prefixes);
  const refs = new Set();
  for (const p of FORT) {
    const html = read(p + ".html"), { src, own, css } = partsOf(html);
    for (const s of src) if (s.startsWith("vendor/")) refs.add(s);
    for (const f of own.concat(css)) for (const m of stripComments(read(f)).matchAll(/vendor\/[A-Za-z0-9_.\/-]*/g)) refs.add(m[0]);
  }
  assert.ok(refs.size >= 20, "vendor references found: " + refs.size);
  const loose = [...refs].filter(r => !prefixes.some(x => r === x || r.startsWith(x) || x.startsWith(r)));
  assert.deepEqual(loose, [], "vendor assets of fortune pages missing from the licence audit");
  for (const a of AUDIT.assets) {
    assert.ok(a.licence && a.clause && a.clause.length > 20, a.id + ": licence and clause");
    assert.equal(typeof a.onPageAttributionRequired, "boolean", a.id);
    for (const f of a.noticeFiles) assert.ok(exists(f), `${a.id}: notice file ${f}`);
    if (a.noticeNeedle) assert.ok(notices.includes(a.noticeNeedle), `${a.id}: "${a.noticeNeedle}" in LICENSES/THIRD-PARTY-NOTICES.txt`);
  }
  const required = AUDIT.assets.filter(a => a.onPageAttributionRequired);
  if (!required.length) assert.ok(!exists("credits.html"), "no licence requires on-page attribution: credits.html must not exist");
  else {
    assert.ok(exists("credits.html"), "credits.html for " + required.map(a => a.id).join(", "));
    const c = read("credits.html");
    for (const a of required) assert.match(c, new RegExp(`data-credit="${a.id}"`), a.id + " credited");
    const linking = fs.readdirSync(ROOT).filter(f => /\.(?:html|js)$/.test(f) && f !== "credits.html" && read(f).includes("credits.html"));
    assert.deepEqual(linking.filter(f => f !== "nav.js"), [], "credits.html linked only from the site footer (nav.js)");
  }
});

test("D5 terms.html is byte-identical to main (not touched)", () => {
  const h = createHash("sha256").update(fs.readFileSync(path.join(ROOT, "terms.html"))).digest("hex");
  assert.equal(h, TERMS_SHA256_MAIN);
});
