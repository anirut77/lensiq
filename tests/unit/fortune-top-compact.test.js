"use strict";
// tests/unit/fortune-top-compact.test.js — FIXED TEST SET, fortune top compact (owner order 2026-11-16, from a real iPhone 16 Pro,
// Safari, Thai). Written and locked (evals-locks/fortune-top-compact.sha256 and ~/LENSIQ-field/evals/fortune-top-compact/) BEFORE
// any product code on branch fortune-top-compact. The browser half is tests/e2e/fortune-top-compact.e2e.mjs.
//   U1  descriptions for the person using the page: the description of every fortune page (the first <p> after the h1, its
//       data-i18n key) has no business wording in TH (markup) and in the EN / ZH dictionaries, and is short (TH ≤ 90 characters,
//       EN ≤ 130, ZH ≤ 50: about two lines on a 393 px phone); the <meta name="description"> (TH, and EN / ZH when it is
//       translated through data-i18n-attr) has none either
//   U2  the business wording is not lost: solutions.html keeps the fortune-for-booths card (sol-e3) and now says, in TH / EN / ZH,
//       that the readings make booths, events and marketing campaigns livelier (บูธ อีเวนต์ แคมเปญ / booth event campaign /
//       展位 活动 营销), names the shareable result card and the real-estate use of feng shui
//   U3  every fortune page has the disclaimer line (fortune.disc.line) under the title, in the head of the page: after the h1,
//       before the first form, camera or tool list; hub (fortune.html) and report.html included
//   U4  the help control keeps its hook: #lqHelpTop with exactly one tel:1323 link and its aria-label key call.1323.btn on every
//       fortune page (in the HTML, so it still calls without JavaScript; nav.js moves it into the top bar, owner decision 69 ค
//       2026-11-16); docs/CRISIS-RESOURCES.md documents the 2026-11-16 placement and the hook for the crisis-v2 team; the L63
//       review list (docs/LEGAL-PACKET.md 6.9 and docs/CRISIS-RESOURCES.md) notes the header placement and the confirmation step
//       of 2026-11-16 and asks the professional "does a confirmation step before calling add harmful friction?"
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const PAGES = ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac",
  "astro", "lifegraph", "planner", "luckycolor", "report", "cat-fortune"];
const BUSINESS = /บูธ|อีเวนต์|แคมเปญ|\bbooths?\b|\bevents?\b|\bcampaigns?\b|展位|活动|营销/i;
const MAX = { th: 90, en: 130, zh: 50 };

/** every i18n dictionary value for key in lang (all files i18n/<lang>-*.js) */
function dictValues(lang, key) {
  const out = [];
  const re = new RegExp('"' + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*"(?:\\s*\\+\\s*"(?:[^"\\\\]|\\\\.)*")*)', "g");
  for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => f.startsWith(lang + "-") && f.endsWith(".js"))) {
    const src = read("i18n/" + f);
    for (const m of src.matchAll(re)) out.push({ file: f, value: m[1].match(/"(?:[^"\\]|\\.)*"/g).map(s => JSON.parse(s)).join("") });
  }
  return out;
}
const text = html => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
/** the description: the first <p …> after the first <h1 …> in <main> */
function description(html) {
  const main = html.slice(html.indexOf("<main"));
  const h1 = main.indexOf("</h1>");
  const rest = main.slice(h1);
  const m = /<p\b([^>]*)>([\s\S]*?)<\/p>/.exec(rest);
  if (!m) return null;
  const key = (/data-i18n="([^"]+)"/.exec(m[1]) || [])[1] || null;
  return { key, th: text(m[2]), attrs: m[1] };
}

test("U1: every fortune page's description is short and has no business wording (TH markup, EN / ZH dictionaries)", () => {
  const bad = [];
  for (const p of PAGES) {
    const d = description(read(p + ".html"));
    if (!d) { bad.push(`${p}: no description <p> after the h1`); continue; }
    if (/lq-disc-line|lq-notice/.test(d.attrs)) { bad.push(`${p}: the first <p> after the h1 is the disclaimer, not a description`); continue; }
    if (!d.key) { bad.push(`${p}: the description has no data-i18n key`); continue; }
    if (BUSINESS.test(d.th)) bad.push(`${p} th: business wording: ${d.th}`);
    if (d.th.length > MAX.th) bad.push(`${p} th: ${d.th.length} characters (max ${MAX.th}): ${d.th}`);
    for (const lang of ["en", "zh"]) {
      const vals = dictValues(lang, d.key);
      if (!vals.length) bad.push(`${p} ${lang}: no dictionary value for ${d.key}`);
      for (const v of vals) {
        if (BUSINESS.test(v.value)) bad.push(`${p} ${lang} (${v.file}): business wording: ${v.value}`);
        if (v.value.length > MAX[lang]) bad.push(`${p} ${lang} (${v.file}): ${v.value.length} characters (max ${MAX[lang]}): ${v.value}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("U1: no business wording in the meta description of any fortune page (TH, and EN / ZH when translated)", () => {
  const bad = [];
  for (const p of PAGES) {
    const html = read(p + ".html");
    const m = /<meta\s+name="description"([^>]*)>/.exec(html);
    if (!m) continue;
    const content = (/content="([^"]*)"/.exec(m[1]) || [])[1] || "";
    if (BUSINESS.test(content)) bad.push(`${p} th meta: ${content}`);
    const key = (/data-i18n-attr="content:([^"]+)"/.exec(m[1]) || [])[1];
    if (key) for (const lang of ["en", "zh"]) for (const v of dictValues(lang, key)) if (BUSINESS.test(v.value)) bad.push(`${p} ${lang} meta (${v.file}): ${v.value}`);
  }
  assert.deepEqual(bad, []);
});

test("U2: the business wording moved to solutions.html (sol-e3), TH / EN / ZH", () => {
  const html = read("solutions.html");
  const card = /<article[^>]*id="sol-e3"[\s\S]*?<\/article>/.exec(html);
  assert.ok(card, "solutions.html keeps the sol-e3 card");
  const keys = [...card[0].matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
  const th = text(card[0]);
  const want = { th: [/บูธ/, /อีเวนต์/, /แคมเปญ/, /การ์ด/, /อสังหา/], en: [/booth/i, /event/i, /campaign/i, /card/i, /real estate|property/i],
    zh: [/展位/, /活动/, /营销/, /卡片/, /房地产/] };
  for (const re of want.th) assert.match(th, re, "TH sol-e3 card");
  for (const lang of ["en", "zh"]) {
    const all = keys.flatMap(k => dictValues(lang, k).map(v => v.value)).join(" ");
    for (const re of want[lang]) assert.match(all, re, `${lang} sol-e3 card`);
  }
});

test("U3: every fortune page has the disclaimer line under the title, before the first form, camera or tool list", () => {
  const bad = [];
  for (const p of PAGES) {
    const html = read(p + ".html");
    const main = html.slice(html.indexOf("<main"));
    const h1 = main.indexOf("</h1>");
    const line = main.indexOf('data-i18n="fortune.disc.line"');
    const first = Math.min(...[/<form\b/, /<video\b/, /class="[^"]*\bcat-tool\b/, /class="pd-lead"/, /class="rp-types"/, /<section\b[^>]*role="tabpanel"/, /role="tablist"/]
      .map(re => { const m = re.exec(main); return m ? m.index : Infinity; }));
    if (h1 < 0) bad.push(`${p}: no h1 in <main>`);
    else if (line < 0) bad.push(`${p}: no disclaimer line (fortune.disc.line) in <main>`);
    else if (line < h1) bad.push(`${p}: disclaimer is above the title`);
    else if (line > first) bad.push(`${p}: disclaimer is not under the title (it comes after the form / camera / tool list)`);
  }
  assert.deepEqual(bad, []);
});

test("U4: #lqHelpTop keeps one tel:1323 link on every fortune page; the placement is documented (CRISIS-RESOURCES, L63)", () => {
  const bad = [];
  for (const p of PAGES) {
    const html = read(p + ".html");
    const m = /<aside[^>]*id="lqHelpTop"[\s\S]*?<\/aside>/.exec(html);
    if (!m) { bad.push(`${p}: no #lqHelpTop`); continue; }
    const tels = [...m[0].matchAll(/href="tel:([^"]+)"/g)].map(x => x[1]);
    if (tels.length !== 1 || tels[0] !== "1323") bad.push(`${p}: #lqHelpTop holds ${JSON.stringify(tels)}`);
    if (!/data-i18n-attr="aria-label:call\.1323\.btn"/.test(m[0])) bad.push(`${p}: the 1323 link lost its aria-label key`);
  }
  assert.deepEqual(bad, []);
  const doc = read("docs/CRISIS-RESOURCES.md");
  assert.match(doc, /2026-11-16[\s\S]{0,400}#lqHelpTop|#lqHelpTop[\s\S]{0,400}2026-11-16/, "CRISIS-RESOURCES documents the 2026-11-16 placement and the #lqHelpTop hook");
  assert.match(doc, /L63[\s\S]{0,600}2026-11-16|2026-11-16[\s\S]{0,600}L63/, "the L63 review list notes the owner's 2026-11-16 placement change");
  const lp = read("docs/LEGAL-PACKET.md");
  const sec = lp.slice(lp.indexOf("### 6.9"), lp.indexOf("### 6.10") > 0 ? lp.indexOf("### 6.10") : undefined);
  assert.match(sec, /2026-11-16/, "LEGAL-PACKET 6.9 (L63) has the 2026-11-16 decision");
  assert.match(sec, /does a confirmation step before calling add harmful friction\?/, "LEGAL-PACKET 6.9 asks the professional about the confirmation step");
});
