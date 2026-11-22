"use strict";
// tests/unit/fortune-cards.test.js — owner order 2026-11-18 (fortune only): clean fortune cards. FIXED TEST: written and
// locked (~/LENSIQ-field/evals/fortune-cards/, sha256 in evals-locks/fortune-cards.sha256) BEFORE the change on branch
// fortune-cards-clean (base b2a6e76 = origin/main).
//   C1  cat-fortune.html and every other place a fortune item is listed (index.html, solutions.html, nav.js menu, the
//       fortune.html hub) carry no "measured accuracy" heading, no "no accuracy claim" tag, no per-card disclaimer and no
//       mention of filters or banned topics: TH markup, EN / ZH dictionaries, i18n keys;
//   C2  every fortune card on cat-fortune.html is ONE link (the whole card) holding the name, one short line and a small
//       illustration, and nothing else: no status chip, no accuracy list, no separate "open page" link;
//   C3  the disclaimer is on cat-fortune.html exactly ONCE, small (the .lq-top notice line), in the hero above the cards;
//   C4  business products (re-lock 2026-11-22, owner decision 223, inversion 223-1): no non-fortune category card shows a
//       measured-accuracy heading, accuracy line or source label any more; every text those blocks showed at base is held
//       verbatim by docs/tech-sheets/ and admin-measurements.js; the internal accuracy data (tools/cat-data.cjs) are unchanged
//       and the new cards (badge + two approved lines), their EN / ZH values and PAGE-STATUS rows are pinned (fingerprints below);
//   C5  the cat-pages accuracy rule still holds for every non-fortune page (at least one accuracy line, each with a source);
//       only category 6 may have none.
// Static, synthetic; no network. Browser check (rendered, 360-430 px, TH / EN / ZH): tests/e2e/fortune-cards.e2e.mjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const D = require(join(ROOT, "tools", "cat-data.cjs"));
const FORT = D.CATEGORIES.find(c => c.slug === "fortune");
const FORT_SET = new Set(FORT.pages);
const LANGS = ["th", "en", "zh"];
const stripComments = s => s.replace(/<!--[\s\S]*?-->/g, "");
const squash = s => String(s).replace(/\s+/g, " ").trim();
const text = s => squash(stripComments(s).replace(/<[^>]+>/g, " "));

const DISC = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
// the words of the disclaimer, so a re-wrapped or shortened copy is caught too
const DISC_RE = { th: /โปรดใช้วิจารณญาณ|ความเชื่อส่วนบุคคล/, en: /use your own judgement|matter of personal belief/i, zh: /请自行判断|属个人信仰/ };
// removed items: measured-accuracy heading, "no accuracy claim" tag, filters / banned topics
const REMOVED = {
  th: /ความแม่นยำที่วัดได้|ไม่มีตัวเลขความแม่นยำ|ความแม่นยำ|หัวข้อต้องห้าม|ต้องห้าม|ตัวกรอง|กรองคำ|กรองถ้อยคำ/,
  en: /measured accuracy|no accuracy claim|accuracy|banned[- ]topics?|banned|forbidden|filter/i,
  zh: /已测准确率|无准确率声明|准确率|禁用话题|禁用|过滤|违禁/,
};
const REMOVED_KEYS = /data-i18n(?:-attr)?="[^"]*\b(?:cat\.acc\.h|cat\.src\.na|cat\.src\.h|cat\.src\.d|cat\.method|cat\.c\.fortune|cat\.open|cat\.why|cat\.r\.fortune)\b/;

function dicts(lang) {
  const out = {};
  const fs = require("node:fs");
  for (const f of fs.readdirSync(join(ROOT, "i18n"))) {
    if (!f.startsWith(lang + "-") || !f.endsWith(".js")) continue;
    for (const m of read("i18n/" + f).matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")/gm)) {
      const k = JSON.parse(m[1]);
      (out[k] = out[k] || []).push({ file: f, value: JSON.parse(m[2]) });
    }
  }
  return out;
}
const DICT = { en: dicts("en"), zh: dicts("zh") };
/** every value of the keys used in a markup fragment: TH from the markup, EN / ZH from the dictionaries */
function valuesOf(fragment) {
  const keys = [...fragment.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1])
    .concat([...fragment.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap(m => m[1].split(";").map(s => s.split(":")[1])));
  const out = { th: text(fragment), keys };
  for (const l of ["en", "zh"]) out[l] = keys.flatMap(k => (DICT[l][k] || []).map(v => v.value)).join(" | ");
  return out;
}
function checkFragment(where, fragment, bad, { disc = true } = {}) {
  const v = valuesOf(fragment);
  for (const l of LANGS) {
    const m = v[l].match(REMOVED[l]);
    if (m) bad.push(`${where} (${l}): removed item "${m[0]}"`);
    if (disc) { const d = v[l].match(DISC_RE[l]); if (d) bad.push(`${where} (${l}): per-card disclaimer "${d[0]}"`); }
  }
  const k = fragment.match(REMOVED_KEYS);
  if (k) bad.push(`${where}: removed key ${k[0]}`);
}

const catHtml = () => stripComments(read("cat-fortune.html"));
const cards = html => [...html.matchAll(/<article class="pd-card cat-tool" data-page="([a-z0-9-]+)"([^>]*)>([\s\S]*?)<\/article>/g)];

test("C1 cat-fortune.html: no accuracy heading, no 'no accuracy' tag, no filter / banned-topic wording, no removed key (TH / EN / ZH)", () => {
  const html = catHtml();
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  assert.ok(main.length > 1000, "cat-fortune.html main");
  const bad = [];
  // the whole main: removed items and keys (the single disclaimer is checked in C3)
  checkFragment("cat-fortune main", main, bad, { disc: false });
  for (const m of cards(html)) checkFragment("card " + m[1], m[0], bad);
  assert.deepEqual(bad, []);
  for (const re of [/class="cat-acc\b/, /class="cat-h\b/, /class="cat-src\b/, /class="cat-srcs\b/, /class="sl-go\b/, /class="cat-why\b/, /id="catSrcH"/])
    assert.doesNotMatch(main, re, "cat-fortune.html still has " + re);
});

test("C1 i18n: the fortune claim key is gone and no fortune dictionary value names accuracy, filters or banned topics (EN / ZH)", () => {
  for (const l of ["en", "zh"]) {
    const f = read(`i18n/${l}-cat.js`);
    assert.ok(!/"cat\.c\.fortune"/.test(f), `${l}-cat.js still has cat.c.fortune`);
    for (const k of Object.keys(DICT[l]).filter(k => /(^|\.)fortune(\.|$)/.test(k) && /^(cat|nav|sl\.cats|pd\.i|pd\.p)\./.test(k))) {
      for (const v of DICT[l][k]) {
        const m = v.value.match(REMOVED[l]);
        assert.ok(!m, `${v.file} ${k}: "${m && m[0]}" in ${v.value}`);
      }
    }
  }
  assert.ok(!D.CLAIMS.fortune, "tools/cat-data.cjs CLAIMS.fortune (the per-card fortune accuracy line) is gone");
  const r = D.REASONS.fortune;
  for (const l of LANGS) assert.doesNotMatch(r[l], REMOVED[l], "REASONS.fortune." + l);
});

test("C1 other listings: index.html, solutions.html, the nav.js menu and the fortune.html hub list fortune items without the removed items", () => {
  const bad = [];
  // index.html: the fortune product card and the fortune category card of the chooser
  const idx = stripComments(read("index.html"));
  const prod = idx.match(/<a class="pd-card" href="fortune\.html">[\s\S]*?<\/a>/);
  assert.ok(prod, "index.html fortune product card");
  checkFragment("index fortune product card", prod[0], bad);
  const chooser = idx.match(/<a class="pd-card" href="cat-fortune\.html">[\s\S]*?<\/a>/);
  assert.ok(chooser, "index.html fortune category card");
  checkFragment("index fortune category card", chooser[0], bad);
  // solutions.html: every card that links a fortune page, and the fortune ideas without a page yet (e10-e13)
  const sol = stripComments(read("solutions.html"));
  let n = 0;
  for (const m of sol.matchAll(/<article class="sl-card"[^>]*id="sol-([a-z0-9]+)">([\s\S]*?)<\/article>/g)) {
    const go = (m[2].match(/class="sl-go" href="([a-z0-9-]+)\.html/) || [])[1];
    if (!(go && FORT_SET.has(go)) && !["e3", "e8", "e9", "e10", "e11", "e12", "e13"].includes(m[1])) continue;
    n++;
    checkFragment("solutions sol-" + m[1], m[0], bad);
  }
  assert.ok(n >= 7, "solutions fortune cards found: " + n);
  // nav.js: the fortune menu group (intro, overview link, items) and its "open this category" link
  const nav = read("nav.js");
  const g = nav.match(/\{ label: "ดูดวงและฤกษ์มงคล"[\s\S]*?\n {4}\] \}/);
  assert.ok(g, "nav.js fortune group");
  const intro = g[0].match(/intro: "([^"]+)"/)[1];
  for (const re of [REMOVED.th, DISC_RE.th]) if (re.test(intro)) bad.push("nav.js fortune intro: " + intro);
  for (const it of g[0].matchAll(/\{ href: "([a-z0-9-]+)\.html", title: "([^"]+)", desc: "([^"]+)" \}/g)) {
    for (const re of [REMOVED.th, DISC_RE.th]) if (re.test(it[2] + " " + it[3])) bad.push("nav.js " + it[1] + ": " + it[3]);
    for (const l of ["en", "zh"]) for (const k of ["title", "desc"]) for (const v of DICT[l][`nav.${it[1]}.${k}`] || []) {
      if (REMOVED[l].test(v.value) || DISC_RE[l].test(v.value)) bad.push(`${v.file} nav.${it[1]}.${k}: ${v.value}`);
    }
  }
  for (const l of ["en", "zh"]) for (const v of DICT[l]["nav.groupd.fortune"] || []) {
    if (REMOVED[l].test(v.value) || DISC_RE[l].test(v.value)) bad.push(`${v.file} nav.groupd.fortune: ${v.value}`);
  }
  // the "open this category" link of a menu panel: the fortune panel's text names no status / accuracy (TH / EN / ZH)
  const viewcat = nav.match(/g\.cat \?([\s\S]*?)\n\s*: '<a class="mega-all" href="cameras\.html"/);
  assert.ok(viewcat, "nav.js mega-all link");
  const fortuneLink = viewcat[1].match(/g\.cat === "fortune"[\s\S]*?data-i18n="([a-z.]+)">([^<]+)</);
  assert.ok(fortuneLink, "nav.js: the fortune panel has its own 'open this category' wording");
  assert.doesNotMatch(fortuneLink[2], REMOVED.th, "nav.js fortune panel link: " + fortuneLink[2]);
  for (const l of ["en", "zh"]) {
    const v = (DICT[l][fortuneLink[1]] || [])[0];
    assert.ok(v && !REMOVED[l].test(v.value), `${l} ${fortuneLink[1]}: ${v && v.value}`);
  }
  // fortune.html hub: its cards carry none of the removed items and no per-card disclaimer (the page keeps its one top line)
  const hub = stripComments(read("fortune.html"));
  const hubCards = [...hub.matchAll(/<a class="(?:pd-card|ft-card)" href="[a-z0-9-]+\.html[^"]*">[\s\S]*?<\/a>/g)];
  assert.ok(hubCards.length >= 14, "fortune.html cards: " + hubCards.length);
  for (const c of hubCards) checkFragment("fortune.html card " + c[0].slice(0, 60), c[0], bad);
  assert.deepEqual(bad, []);
});

test("C2 each fortune card is one link (the whole card) holding the name, one short line and the illustration, nothing else", () => {
  const html = catHtml();
  const list = cards(html);
  assert.deepEqual(list.map(m => m[1]), FORT.pages, "cards in category order");
  for (const [, page, attrs, body] of list) {
    assert.ok(!/data-status=/.test(attrs), page + ": data-status");
    const links = [...body.matchAll(/<a\b[^>]*>/g)];
    assert.equal(links.length, 1, page + ": links in the card: " + links.map(l => l[0]).join(" "));
    assert.match(links[0][0], new RegExp(`href="${page}\\.html"`), page + ": card link");
    // the link wraps the whole card content: nothing but white space outside it
    const outside = body.replace(/<a\b[^>]*>[\s\S]*<\/a>/, "");
    assert.equal(outside.trim(), "", page + ": content outside the card link: " + outside.trim().slice(0, 80));
    const inner = body.match(/<a\b[^>]*>([\s\S]*)<\/a>/)[1];
    assert.equal((inner.match(new RegExp(`<h3[^>]*data-i18n="nav\\.${page}\\.title"`, "g")) || []).length, 1, page + ": name");
    assert.equal((inner.match(new RegExp(`<p[^>]*data-i18n="nav\\.${page}\\.desc"`, "g")) || []).length, 1, page + ": one short line");
    assert.equal((inner.match(/<p\b/g) || []).length, 1, page + ": exactly one line of text under the name");
    assert.ok(/class="(?:cat-ill|ft-ill)\b/.test(inner), page + ": illustration");
    assert.ok(!/class="cat-st\b|class="cat-acc\b|class="cat-h\b|class="sl-go\b|cat-arrow/.test(inner), page + ": extra item in the card");
    const line = text(inner.match(new RegExp(`<p[^>]*data-i18n="nav\\.${page}\\.desc"[^>]*>([\\s\\S]*?)</p>`))[1]);
    assert.ok(line.length > 3 && line.length <= 60, `${page}: short line "${line}"`);
    for (const l of ["en", "zh"]) {
      const v = (DICT[l][`nav.${page}.desc`] || [])[0];
      assert.ok(v && v.value.length > 3 && v.value.length <= 80, `${l} nav.${page}.desc: ${v && v.value}`);
    }
  }
});

test("C3 the disclaimer is on cat-fortune.html exactly once, small, in the hero above the cards (TH key + EN / ZH values)", () => {
  const html = catHtml();
  const body = html.slice(html.indexOf("<body"));
  const visible = text(body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, ""));
  assert.equal(visible.split(DISC.th).length - 1, 1, "the Thai disclaimer, visible text: " + (visible.split(DISC.th).length - 1));
  assert.equal((visible.match(/โปรดใช้วิจารณญาณ/g) || []).length, 1, "โปรดใช้วิจารณญาณ appears once");
  assert.equal((body.match(/data-i18n="fortune\.disc\.line"/g) || []).length, 1, "one fortune.disc.line");
  const note = body.match(/<p class="lq-notice lq-top"[^>]*>[\s\S]*?<\/p>/);
  assert.ok(note && note[0].includes('data-i18n="fortune.disc.line"'), "the line is the small .lq-top notice");
  const hero = body.indexOf('class="pd-hero"'), grid = body.indexOf('class="pd-grid cat-grid"');
  assert.ok(hero > 0 && body.indexOf("fortune.disc.line") > hero && body.indexOf("fortune.disc.line") < grid, "in the hero, above the cards");
  for (const l of ["en", "zh"]) {
    const vals = (DICT[l]["fortune.disc.line"] || []).filter(v => v.file === `${l}-cat.js`);
    assert.ok(vals.length === 1 && vals[0].value === DISC[l], `${l}-cat.js fortune.disc.line`);
  }
});

// ---------------------------------------------------------------------------------------------------------- C4 / C5
// re-lock 2026-11-22, owner decision 223 (223-1: "from 'the page must show the figure' to 'the page must not show it, and the
// technical sheet must hold every original figure'"). C4 used to pin the accuracy blocks and the sources section of the 38
// business cards exactly as at base b2a6e76. It now pins, exactly: (a) the 50 texts those blocks showed at base (keys below,
// TH / EN / ZH, sha computed from the base markup and dictionaries = the locked base snapshot
// docs/tech-sheets/ORIGINAL-FIGURES-223.json), each of which must be GONE from the business cards and dictionaries and HELD
// verbatim by docs/tech-sheets/ and admin-measurements.js; (b) the internal accuracy data (tools/cat-data.cjs claims, status,
// reason) of the business pages, unchanged from base; (c) the new business cards (badge + two lines), PAGE-STATUS rows and
// their EN / ZH values, pinned as built by decision 223. The fortune rules C1-C3 are untouched.
const L223 = require("./accuracy-removal-223.lib.js");
const SNAP223 = JSON.parse(read("docs/tech-sheets/ORIGINAL-FIGURES-223.json"));
const BASE_KEYS = ["cat.acc.h", "cat.c.ageGender", "cat.c.attPin", "cat.c.boothFace", "cat.c.boothNone", "cat.c.checkout", "cat.c.converter",
  "cat.c.creative", "cat.c.crowd", "cat.c.crowdDense", "cat.c.driverPub", "cat.c.driverSyn", "cat.c.examHall", "cat.c.examNone", "cat.c.face",
  "cat.c.gatePub", "cat.c.gateSyn", "cat.c.hand", "cat.c.hrPilot", "cat.c.info", "cat.c.insights", "cat.c.med", "cat.c.neuro", "cat.c.nut",
  "cat.c.omrNone", "cat.c.people", "cat.c.photobooth", "cat.c.qc", "cat.c.store", "cat.c.studio", "cat.c.teamface", "cat.c.zone",
  "cat.legend.h", "cat.method", "cat.src.d", "cat.src.field", "cat.src.h", "cat.src.na", "cat.src.none", "cat.src.prelim", "cat.src.public",
  "cat.src.synthetic", "cat.st.demo", "cat.st.experimental", "cat.st.pilot-ready", "cat.st.support", "cat.std.demo", "cat.std.experimental",
  "cat.std.pilot-ready", "cat.std.support"];
// sha256 of JSON [[key, th, en, zh] …] over BASE_KEYS: computed from cat-{6 business}.html + i18n/{en,zh}-cat.js at base
// 306c4d72 (pre-223; the C4 base fingerprint 23a66e68… still held there) and equal to the same texts in the locked snapshot
const BASE_TEXTS_SHA = "6b8ef116d0a17f20feb6e7c432a75977add4ec7efe1ce9c1e9e784c513179f10";
/** the base texts of the business accuracy blocks and sources sections, from the locked snapshot */
function baseTexts() {
  const all = SNAP223.entries.concat(SNAP223.catData);
  return BASE_KEYS.map(k => {
    const es = all.filter(e => e.key === k && e.th);
    assert.ok(es.length >= 1, "snapshot: " + k);
    assert.equal(new Set(es.map(e => JSON.stringify([squash(e.th), squash(e.en), squash(e.zh)]))).size, 1, "snapshot variants of " + k);
    return [k, squash(es[0].th), squash(es[0].en), squash(es[0].zh)];
  });
}
const BUSINESS = () => D.CATEGORIES.filter(c => c.slug !== "fortune");
/** internal accuracy data of the business pages (unchanged by 223): per page status, reason, claims; per claim the full record */
function internalFingerprint() {
  const parts = [], claimIds = new Set();
  for (const c of BUSINESS()) for (const p of c.pages) {
    const v = D.PAGES[p];
    parts.push(["page", c.slug, p, v.st, v.why, v.claims]);
    for (const id of v.claims) claimIds.add(id);
  }
  for (const id of [...claimIds].sort()) { const c = D.CLAIMS[id] || {}; parts.push(["claim", id, c.src, c.ref, c.th, c.en, c.zh, !!c.optimistic]); }
  for (const g of ["STATUS", "STATUS_DEF", "SOURCE"]) parts.push([g, D[g]]);
  return { parts, sha: createHash("sha256").update(JSON.stringify(parts)).digest("hex") };
}
// computed at base 306c4d72 (pre-223) and unchanged on the 223 tree
const INTERNAL_SHA = "adb04dd36bb0bf4d7237b5973b79508f47f7a70e13fc005f87883a8c3792cccf";
/** the business cards as decision 223 builds them: card markup, the EN / ZH values of their keys, their PAGE-STATUS rows */
function businessFingerprint() {
  const parts = [], keys = new Set();
  for (const c of BUSINESS()) {
    const html = stripComments(read(`cat-${c.slug}.html`));
    for (const [, page, attrs, body] of cards(html)) {
      parts.push([c.slug, page, squash(attrs), squash(body)]);
      for (const m of body.matchAll(/data-i18n="([^"]+)"/g)) keys.add(m[1]);
    }
  }
  for (const k of [...keys].sort()) for (const l of ["en", "zh"]) parts.push([l, k, (DICT[l][k] || []).map(v => [v.file, v.value])]);
  const md = read("docs/PAGE-STATUS.md");
  for (const c of BUSINESS()) for (const p of c.pages) {
    parts.push(["row", p, (md.match(new RegExp("^\\| `" + p.replace(/-/g, "\\-") + "\\.html` \\|.*$", "m")) || ["NO ROW"])[0]]);
  }
  return { parts, sha: createHash("sha256").update(JSON.stringify(parts)).digest("hex") };
}
// re-pinned on the decision-226 tree (branch accuracy-removal-223, 2026-11-22; was e179a266… with 38 cards on the 223 tree):
// 6 categories, 38 non-fortune products, 33 cards shown; the 5 switched-off pages (nav.js VISIBILITY) have no card.
// Re-lock 4 of 226 (coordinator decision 2026-11-22 on entry 13): medicine.html (drug checker) is on and has its card again;
// Product Check is the switched-off part "product-check" of that page (no card of its own)
const BUSINESS_SHA = "1425001917f13981b1e3a1a7b8716a74c80dce975b0a5a95a468b5a3e3be6c2d"; // re-lock 4 of 226: + the medicine card (was e2a09f1f…)
const BUSINESS_PRODUCTS = 38, BUSINESS_CARDS = 33;
const OFF_226 = ["customers", "exam-hall", "neuro", "product-check", "signage", "teamface"];
const sheetText = re => require("node:fs").readdirSync(join(ROOT, "docs", "tech-sheets")).filter(f => re.test(f) || f === "README.md")
  .map(f => squash(read("docs/tech-sheets/" + f))).join("\n");

test("C4 business products: no card shows its accuracy lines or sources any more; every base text is held by the technical sheets (decision 223)", () => {
  const base = baseTexts();
  assert.equal(base.length, 50, "base texts");
  assert.equal(createHash("sha256").update(JSON.stringify(base)).digest("hex"), BASE_TEXTS_SHA, "base texts of the business accuracy blocks");
  const { parts, sha } = businessFingerprint();
  const cardParts = parts.filter(p => p.length === 4 && !["en", "zh", "row"].includes(p[0]));
  assert.equal(BUSINESS().reduce((n, c) => n + c.pages.length, 0), BUSINESS_PRODUCTS, "non-fortune products in the categories");
  assert.equal(cardParts.length, BUSINESS_CARDS, "non-fortune cards shown");
  // decision 226 (inversion of "every product has a card with its badge"): exactly the switched-off products have no card,
  // and no card carries a status label, data-status or data-demo-only
  const vis = read("nav.js").match(/var VISIBILITY = \{([\s\S]*?)\};/)[1];
  assert.deepEqual([...vis.matchAll(/"?([a-z][\w-]*)"?: false/g)].map(m => m[1]).sort(), OFF_226, "switched-off products (nav.js)");
  const shown = new Set(cardParts.map(p => p[1]));
  for (const c of BUSINESS()) for (const p of c.pages) assert.equal(shown.has(p), !OFF_226.includes(p), `${p}: card shown on cat-${c.slug}`);
  for (const [slug, page, attrs, body] of cardParts) {
    assert.equal(attrs, "", `${slug} ${page}: card attributes (data-status / data-demo-only)`);
    assert.doesNotMatch(body, /class="cat-st\b|data-i18n="cat\.b\.|รุ่นทดลอง|เร็ว ๆ นี้/, `${slug} ${page}: status label on the card`);
  }
  assert.ok(!parts.some(p => p.includes("NO ROW")), "a business page lost its PAGE-STATUS row");
  const bad = [];
  // gone: no accuracy block, source chip, reason or legend on any business card or page; no base key in the cards or in
  // i18n/{en,zh}-cat.js; no base accuracy line text on a card (TH markup, EN / ZH values)
  for (const c of BUSINESS()) {
    const html = stripComments(read(`cat-${c.slug}.html`));
    if (/<section aria-labelledby="catLegendH">|id="catSrcH"|class="[^"]*\b(cat-legend|sl-legend|cat-srcs)\b/.test(html)) bad.push(`cat-${c.slug}: sources / legend section`);
    for (const k of BASE_KEYS) if (html.includes(`data-i18n="${k}"`)) bad.push(`cat-${c.slug}: key ${k}`);
  }
  for (const [slug, page, , body] of cardParts) {
    if (/<p class="cat-h"|class="cat-(acc|src|why)\b|<li data-src=/.test(body)) bad.push(`${slug} ${page}: accuracy block`);
    const v = valuesOf(body);
    for (const [k, th, en, zh] of base) if (/^cat\.c\./.test(k) && (v.th.includes(th) || v.en.includes(en) || v.zh.includes(zh))) bad.push(`${page}: ${k} shown`);
  }
  for (const l of ["en", "zh"]) { const f = read(`i18n/${l}-cat.js`); for (const k of BASE_KEYS) if (f.includes(`"${k}"`)) bad.push(`${l}-cat.js: ${k}`); }
  // held: every base text verbatim in docs/tech-sheets (TH in *-TH.md, EN and ZH in *-EN.md) and in admin-measurements.js
  const TH = sheetText(/-TH\.md$/), EN = sheetText(/-EN\.md$/);
  const adm = new Set(L223.jsStrings(read("admin-measurements.js")).map(squash));
  for (const [k, th, en, zh] of base) {
    if (!TH.includes(th)) bad.push(`TH sheets: ${k}`);
    if (!EN.includes(en) || !EN.includes(zh)) bad.push(`EN sheets: ${k}`);
    for (const t of [th, en, zh]) if (!adm.has(t)) bad.push(`admin-measurements.js: ${k} "${t.slice(0, 40)}"`);
  }
  assert.deepEqual(bad, []);
  // the internal accuracy data are exactly as at base; the new cards are exactly as built by decision 223
  assert.equal(internalFingerprint().sha, INTERNAL_SHA, "internal accuracy data (tools/cat-data.cjs) changed");
  assert.equal(sha, BUSINESS_SHA, "business card fingerprint changed");
});

test("C4 named business products: Exam, Attendance, Gate and Crowd show no figure; their own technical sheet holds each one", () => {
  const want = { exam: ["education", "exam"], attendance: ["hr", "attendance"], gate: ["security", "gate"], crowd: ["marketing", "crowd"] };
  const S = JSON.parse(read("tests/unit/accuracy-removal-223.spec.json"));
  for (const [page, [slug, sheet]] of Object.entries(want)) {
    const html = stripComments(read(`cat-${slug}.html`));
    const m = cards(html).find(x => x[1] === page);
    assert.ok(m, page + " card on cat-" + slug);
    assert.doesNotMatch(m[3], /data-i18n="cat\.acc\.h"|ความแม่นยำที่วัดได้/, page + ": measured-accuracy heading");
    assert.equal((m[3].match(/<li data-src=/g) || []).length, 0, page + ": accuracy lines on the card");
    assert.doesNotMatch(m[3], /class="cat-src\b|data-i18n="cat\.src\./, page + ": source label on the card");
    assert.ok(D.PAGES[page].claims.length >= 1, page + ": claims");
    const th = squash(read(`docs/tech-sheets/${sheet}-TH.md`)), en = squash(read(`docs/tech-sheets/${sheet}-EN.md`));
    for (const id of D.PAGES[page].claims) {
      const c = D.CLAIMS[id];
      assert.ok(!text(m[3]).includes(squash(c.th)), `${page}: ${id} still on the card`);
      assert.ok(th.includes(squash(c.th)), `${sheet}-TH.md: ${id}`);
      assert.ok(en.includes(squash(c.en)) && en.includes(squash(c.zh)), `${sheet}-EN.md: ${id}`);
    }
    // the card states what the tool is for and its main limit (the approved two lines, spec of decision 223)
    const ln = S.lines.find(x => x.cards.includes(page));
    assert.ok(ln, page + ": approved lines");
    for (const n of ["1", "2"]) {
      assert.ok(text(m[3]).includes(squash(ln[n].th)), `${page}: line ${n} (TH)`);
      for (const l of ["en", "zh"]) assert.ok((DICT[l][`ln.${ln.id}.${n}`] || []).some(v => squash(v.value) === squash(ln[n][l])), `${page}: ln.${ln.id}.${n} (${l})`);
    }
  }
  assert.ok(D.PAGES.crowd.claims.includes("crowdDense"), "Crowd keeps the dense-crowd limit (internal)");
  assert.match(text(cards(stripComments(read("cat-marketing.html"))).find(x => x[1] === "crowd")[3]), /ยังไม่เหมาะกับฝูงชนหนาแน่น/, "Crowd card states the dense-crowd limit");
});

test("C5 accuracy rule: every non-fortune page has accuracy lines with a source; only category 6 may have none", () => {
  for (const [p, v] of Object.entries(D.PAGES)) {
    if (FORT_SET.has(p)) { assert.equal(v.claims.length, 0, p + ": fortune page with an accuracy line"); continue; }
    assert.ok(v.claims.length >= 1, p + ": no accuracy line");
    for (const id of v.claims) assert.ok(D.CLAIMS[id] && D.SOURCE[D.CLAIMS[id].src], `${p}: claim ${id}`);
  }
  assert.equal(FORT.noAccuracy, true, "category 6 is the only category marked noAccuracy");
  assert.deepEqual(D.CATEGORIES.filter(c => c.noAccuracy).map(c => c.slug), ["fortune"]);
});

