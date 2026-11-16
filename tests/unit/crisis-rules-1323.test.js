"use strict";
// tests/unit/crisis-rules-1323.test.js — FIXED TEST SET "crisis-rules-1323" (owner decision 2026-11-16 crisis one-number rules),
// written and locked (evals-locks/crisis-rules-1323.sha256, ~/LENSIQ-field/evals/crisis-rules-1323/) BEFORE any product code on
// branch crisis-rules-1323. The browser half is tests/e2e/crisis-rules-1323-{a,b,c}.e2e.mjs (contract in crisis-rules-kit.mjs).
//   R1 the crisis card (FortuneAI.crisis.result / toHTML), TH / EN / ZH: one number, one button (tel:1323 only, no 1669 / 191 /
//      1300 / Samaritans anywhere in it); order: title, warm message (2-3 short lines: at most 3 sentences and 140 characters in
//      Thai / English, 60 in Chinese), "อ่านเพิ่มเติม" (a <details> with the longer text), comforting guidance, the 1323 button,
//      the counselling link; no <ul> / <ol>; no price, remedy or belief advice; the review marker stays.
//   R2 the help line (fortune-crisis.js helpLine / helpHTML, used in the calm state and the printed report): tel:1323 only plus the
//      counselling link; nothing sticky or fixed in the crisis / calm styles.
//   R3 every fortune page and cat-fortune.html: no 1669 / 191 / 1300 / Samaritans in the HTML (text or tel:).
//   R4 counselling.html ("ช่องทางให้คำปรึกษา"): every service of docs/CRISIS-RESOURCES.md (1323, 1669, 191, 1300, Samaritans
//      02 113 6789) once, as the shared component with its tel: link; Thai title with EN / ZH keys in i18n; loads the crisis net
//      (fortune-crisis.js); no reading, ads, offers or prices; redrawn by tools/helpline.mjs (CALL_PAGES) so the daily re-check
//      covers its numbers; registered as a platform page (re-lock 2: in tools/cat-data.cjs UNLINKED, a support page outside the
//      menus; PLATFORM is the nav "About" group, which R5 forbids).
//   R5 counselling.html is linked only from the crisis card / help line (fortune-ai.js, fortune-crisis.js, lensiq-helpline.js),
//      help.html and privacy.html (and the top-bar dialog when it exists in nav.js); not from the menu or any other page.
//   R6 rule-6 switch: lensiq-config.js has exactly one line setting window.LENSIQ_HELP_STICKY, shipped false.
//   R7 docs: CRISIS-RESOURCES.md records the new placement (owner decision 2026-11-16, counselling.html); LEGAL-PACKET.md L63
//      carries "reduced card: one number, button after the text, other numbers on a separate page; owner decision 2026-11-16".
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = f => fs.existsSync(path.join(ROOT, f));
const LANGS = ["th", "en", "zh"];
const PAGES = ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac",
  "astro", "lifegraph", "planner", "luckycolor", "report", "cat-fortune"];
const OTHER = /(?<!\d)(?:1669|191|1300)(?!\d)|02[\s-]?113[\s-]?6789|021136789/;
const MORE = { th: /อ่านเพิ่มเติม/, en: /Read more/i, zh: /阅读更多/ };
const fresh = f => { const p = path.join(ROOT, f); delete require.cache[require.resolve(p)]; return require(p); };
const strip = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
const sentences = (t, lang) => String(t).split(lang === "zh" ? /[。！？]/ : /[.!?]\s|\s{2,}|(?<=[฀-๿])\s(?=[฀-๿])/).filter(s => s.trim()).length;

test("R1: the crisis card has one number (1323), the order warm -> more -> guidance -> 1323 -> link, no list, no price (TH / EN / ZH)", () => {
  const FA = fresh("fortune-ai.js");
  for (const lang of LANGS) {
    const r = FA.crisis.result({ lang }), html = FA.toHTML(r), sp = r.support;
    assert.equal(r.crisis, true); assert.equal(r.reviewStatus, "pending-professional-review");
    assert.match(html, /data-review="pending-professional-review"/, lang + " review marker");
    assert.deepEqual([...html.matchAll(/href="tel:([^"]*)"/g)].map(m => m[1]), ["1323"], lang + ": the only tel: link is 1323");
    assert.doesNotMatch(strip(html) + JSON.stringify(sp), OTHER, lang + ": no other number in the card or its data");
    assert.doesNotMatch(html, /<(?:ul|ol)\b/, lang + ": no list in the card");
    const at = re => { const m = re.exec(html); return m ? m.index : -1; };
    const idx = [at(/<h3\b/), at(/class="[^"]*\bfa-support-warm\b/), at(/<details\b[^>]*class="[^"]*\bfa-support-more\b/), at(/class="[^"]*\bfa-support-guide\b/),
      at(/href="tel:1323"/), at(/href="counselling\.html"/)];
    assert.ok(idx.every(i => i >= 0), lang + ": every part present " + JSON.stringify(idx));
    assert.ok(idx.every((v, i) => i === 0 || v > idx[i - 1]), lang + ": order title, warm, more, guidance, 1323, link " + JSON.stringify(idx));
    const sum = /<details\b[^>]*class="[^"]*\bfa-support-more\b[^"]*"[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/.exec(html);
    assert.ok(sum && MORE[lang].test(strip(sum[1])), lang + ": the summary says " + (sum && sum[1]));
    assert.doesNotMatch(/<details\b[^>]*fa-support-more[^>]*>/.exec(html)[0], /\bopen\b/, lang + ": closed at first");
    const warm = strip((/class="[^"]*\bfa-support-warm\b[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(html) || [])[1] || "").trim();
    assert.ok(warm.length > 0 && warm.length <= (lang === "zh" ? 60 : 140), lang + ": warm message is short (" + warm.length + "): " + warm);
    assert.ok(sentences(warm, lang) <= 3, lang + ": warm message at most 3 sentences: " + warm);
    const guide = strip((/class="[^"]*\bfa-support-guide\b[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(html) || [])[1] || "").trim();
    assert.ok(guide.length > 0, lang + ": comforting guidance present");
    // hard limit 3 (crisis: no remedies, no paid service, no straight reading) and no price anywhere in the card
    assert.doesNotMatch(strip(html), /฿|บาท|THB|\bbaht\b|元|ราคา|\bprice|价格|เคล็ด|แก้ดวง|ทำบุญ|สะเดาะเคราะห์|ของมงคล|สีมงคล|lucky|remed|amulet|化解|开运|吉祥物/i, lang + ": no price or remedy");
    if (lang !== "th") assert.doesNotMatch(strip(html), /[฀-๿]/, lang + ": no Thai in the " + lang + " card");
    const link = /<a\b[^>]*href="counselling\.html"[^>]*>([\s\S]*?)<\/a>/.exec(html);
    assert.ok(link && strip(link[1]).trim().length > 0, lang + ": counselling link text");
  }
});

test("R2: the help line (calm state, printed report) is tel:1323 plus the counselling link; nothing sticky or fixed", () => {
  const CR = fresh("fortune-crisis.js");
  assert.deepEqual(CR.HELP.tel, ["1323"], "HELP.tel: one number");
  for (const lang of LANGS) {
    const h = CR.helpHTML(lang, "lq-helpline-result");
    assert.deepEqual([...h.matchAll(/href="tel:([^"]*)"/g)].map(m => m[1]), ["1323"], lang + " help line tel links");
    assert.doesNotMatch(strip(h), OTHER, lang + ": no other number in the help line");
    assert.match(h, /href="counselling\.html"/, lang + ": counselling link in the help line");
    assert.ok(h.indexOf('href="counselling.html"') > h.indexOf('href="tel:1323"'), lang + ": the link comes after the 1323 button");
  }
  const src = read("fortune-crisis.js") + read("fortune-ai.js");
  assert.doesNotMatch(src, /position\s*:\s*(?:sticky|fixed)/, "no sticky or fixed help element in fortune-crisis.js / fortune-ai.js");
});

test("R3: no 1669 / 191 / 1300 / Samaritans in any fortune page or cat-fortune.html", () => {
  for (const p of PAGES) {
    const h = read(p + ".html");
    const tels = [...h.matchAll(/href="tel:([^"]*)"/g)].map(m => m[1]).filter(t => t !== "1323");
    assert.deepEqual(tels, [], p + ": tel: links other than 1323");
    const m = strip(h).match(OTHER);
    assert.equal(m, null, p + ": other number in the page text: " + (m && m[0]));
  }
});

test("R4: counselling.html lists every verified service once with its call button; crisis net loaded; no reading, ads or prices", () => {
  assert.ok(exists("counselling.html"), "counselling.html exists");
  const h = read("counselling.html"), L = fresh("lensiq-helpline.js");
  assert.match(h, /<title[^>]*>[^<]*ช่องทางให้คำปรึกษา/, "Thai title");
  assert.match(h, /<h1\b[^>]*>[^<]*ช่องทางให้คำปรึกษา/, "Thai heading");
  for (const id of ["1323", "1669", "191", "1300", "samaritans"]) {
    const n = (h.match(new RegExp('<span class="lq-call" data-lq-call="' + id + '">', "g")) || []).length;
    assert.equal(n, 1, id + ": one row");
    assert.ok(h.includes('href="tel:' + L.LINES[id].tel + '"'), id + ": tel link");
  }
  assert.match(h, /<script src="fortune-crisis\.js\?v=\d+"><\/script>/, "the crisis net is loaded");
  assert.match(h, /<script src="lensiq-helpline\.js\?v=\d+"><\/script>/, "the shared component is loaded");
  assert.doesNotMatch(h, /fortune-ai\.js|fortune-read\.js|data-lq-upsell|data-lq-remedy|data-lq-paid|data-lq-merit|lensiq-merit|fortune-paid/, "no reading, offers or merit");
  assert.doesNotMatch(strip(h), /฿|บาท|THB|ราคา|价格|\bprice/i, "no prices");
  const tool = read("tools/helpline.mjs");
  assert.match(tool, /CALL_PAGES\s*=\s*\[[^\]]*"counselling"/, "tools/helpline.mjs redraws counselling.html");
  const src = JSON.parse(read("tools/helpline-sources.json")).SOURCES.map(s => s.tel);
  for (const id of ["1323", "1669", "191", "1300", "samaritans"]) assert.ok(src.includes(L.LINES[id].tel), id + ": in the daily re-check sources");
  for (const lang of ["en", "zh"]) {
    const d = read("i18n/" + lang + "-common.js");
    const keys = [...h.matchAll(/data-i18n="(counsel\.[^"]+)"/g)].map(m => m[1]);
    assert.ok(keys.length >= 2, "counselling page carries counsel.* keys");
    for (const k of keys) assert.match(d, new RegExp('"' + k.replace(/\./g, "\\.") + '"\\s*:'), lang + "-common has " + k);
  }
  // RE-LOCK 2026-11-16 (2), before any product measurement: D.PLATFORM is by definition the nav.js "About" menu group
  // (tests/unit/cat-pages.test.js), which R5 forbids for this page; a platform page outside the menus is listed in D.UNLINKED.
  const D = require(path.join(ROOT, "tools", "cat-data.cjs"));
  assert.ok(D.UNLINKED.counselling && D.PAGES.counselling && D.PAGES.counselling.st === "support", "registered as a platform (support) page, not in the menus");
  assert.ok(!D.PLATFORM.includes("counselling"), "not in the nav About group");
});

test("R5: counselling.html is linked only from the crisis card / help line, the top-bar dialog, help.html and privacy.html", () => {
  const html = fs.readdirSync(ROOT).filter(f => f.endsWith(".html") && f !== "counselling.html");
  const linking = html.filter(f => /href="counselling\.html/.test(read(f))).sort();
  assert.deepEqual(linking, ["help.html", "privacy.html"], "HTML pages that link to counselling.html");
  const js = fs.readdirSync(ROOT).filter(f => f.endsWith(".js") && /counselling\.html/.test(read(f))).sort();
  for (const f of js) assert.ok(["fortune-ai.js", "fortune-crisis.js", "lensiq-helpline.js", "nav.js", "fortune-read.js"].includes(f), f + " links counselling.html");
  assert.ok(js.includes("fortune-ai.js") || js.includes("lensiq-helpline.js"), "the card links it");
  if (js.includes("nav.js")) assert.doesNotMatch(read("nav.js"), /href:\s*"counselling\.html"/, "not a menu item");
});

test("R6: one line in lensiq-config.js sets window.LENSIQ_HELP_STICKY; shipped false", () => {
  const cfg = read("lensiq-config.js");
  const lines = cfg.split("\n").filter(l => /^\s*window\.LENSIQ_HELP_STICKY\s*=/.test(l));
  assert.equal(lines.length, 1, "exactly one line sets the switch");
  const win = {};
  new Function("window", "document", cfg)(win, undefined);
  assert.equal(win.LENSIQ_HELP_STICKY, false, "shipped: non-sticky header area that scrolls away");
});

test("R7: docs record the rules (CRISIS-RESOURCES.md placement; LEGAL-PACKET.md L63 review list)", () => {
  const cr = read("docs/CRISIS-RESOURCES.md");
  assert.match(cr, /owner decision 2026-11-16/i); assert.match(cr, /counselling\.html/);
  const lp = read("docs/LEGAL-PACKET.md");
  assert.match(lp, /reduced card: one number, button after the text, other numbers on a separate page; owner decision 2026-11-16/);
});
