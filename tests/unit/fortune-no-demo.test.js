"use strict";
// tests/unit/fortune-no-demo.test.js — owner order 2026-11-17: "remove the 'สาธิต' tag from the fortune category page and
// every fortune item now". FIXED TEST: written and locked (~/LENSIQ-field/evals/fortune-no-demo/, sha256 in
// evals-locks/fortune-no-demo.sha256) BEFORE the change on branch fortune-no-demo (base 02fdd69).
//   1. cat-fortune.html: no status chip, no demo legend line, the tool count names no demo (TH markup, EN / ZH dictionaries);
//   2. index.html category chooser: the fortune count names no demo (TH, EN, ZH);
//   3. solutions.html: no card that links to a fortune page carries a demo badge;
//   4. every fortune page (category 6 of tools/cat-data.cjs, plus compat / petread when they exist) and its own en / zh
//      dictionaries: no status chip (.cat-st / .sl-tag) and no demo status key;
//   5. other categories unchanged: every non-fortune page keeps its status, the six other counts are byte-identical in
//      TH / EN / ZH, and the non-fortune demo badges (teamface, signage, neuro on their category pages; solutions sol-r5)
//      still show.
//   RE-LOCK 2026-11-22 (owner decision 223, audit section 3, badges approved as drafted): the counts are the number of tools
//   only, over the tools listed in the customer build ("<n> เครื่องมือ" / "<n> tools" / "<n> 个工具", n = the base total minus
//   the demo-only pages of D.DEMO_ONLY), with no status words; the non-fortune demo badges became "เร็ว ๆ นี้" (Coming soon /
//   即将推出) on cards marked data-demo-only, and the old "สาธิต" badge, its key and the demo legend line are gone. The fortune
//   checks (1-4) are unchanged.
//   RE-LOCK 2026-11-22 (owner decision 226: no status label where a customer looks; one visibility list `var VISIBILITY` in
//   nav.js): the counts are over the tools a customer can see (the base total minus the switched-off pages); the former
//   "เร็ว ๆ นี้" badges of teamface / signage / neuro (sol-r5) are gone with their keys: those products are switched off, have
//   no card on their category page, sol-r5 is hidden with data-lq-off, and their label lives only in the back office
//   (admin-measurements.js). The fortune checks (1-4) are unchanged.
// Static, synthetic; no network. Browser check (rendered TH / EN / ZH): tests/e2e/fortune-no-demo.e2e.mjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const D = require(join(ROOT, "tools", "cat-data.cjs"));
const FORT = D.CATEGORIES.find(c => c.slug === "fortune");
const FORTUNE_PAGES = FORT.pages.concat(["compat", "petread"].filter(p => existsSync(join(ROOT, p + ".html"))));
const DEMO = { th: "สาธิต", en: "Demo", zh: "演示" };
const DEMO_RE = { th: /สาธิต/, en: /\bdemo\b/i, zh: /演示/ };
/** decision 226: the pages nav.js switches off (var VISIBILITY = { …: false }) */
const OFF = [...read("nav.js").match(/var VISIBILITY = \{([\s\S]*?)\};/)[1].matchAll(/"?([a-z][\w-]*)"?: false/g)].map(m => m[1]);
const SOON_LABEL = { th: "เร็ว ๆ นี้", en: "Coming soon", zh: "即将推出" };

function dictVal(file, key) {
  const src = read(file);
  const m = src.match(new RegExp('"' + key.replace(/\./g, "\\.") + '":\\s*"((?:[^"\\\\]|\\\\.)*)"'));
  return m ? JSON.parse('"' + m[1] + '"') : null;
}
function thVal(src, key) {
  const m = src.match(new RegExp('data-i18n="' + key.replace(/\./g, "\\.") + '"[^>]*>([\\s\\S]*?)</'));
  return m ? m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : null;
}

// baseline at 02fdd69 (origin/main), taken before the change
const BASE_ST = {
  "gate": "pilot-ready", "parking": "pilot-ready", "village": "pilot-ready", "gate-notice": "support", "cameras": "support",
  "afterhours": "experimental", "exam": "pilot-ready", "exam-lab": "pilot-ready", "exam-hall": "experimental", "exam-dashboard": "pilot-ready",
  "omr": "experimental", "attendance": "pilot-ready", "hr": "pilot-ready", "interview": "pilot-ready", "case-review": "pilot-ready",
  "teamface": "demo", "crowd": "experimental", "store": "pilot-ready", "retail": "pilot-ready", "insights": "experimental",
  "customers": "experimental", "signage": "demo", "neuro": "demo", "queue": "experimental", "tables": "experimental", "bays": "experimental",
  "checkout": "experimental", "creative": "experimental", "creative-suite": "experimental", "booth": "experimental", "medicine": "experimental",
  "nutrition": "experimental", "driver": "experimental", "qc": "experimental", "studio": "experimental", "tryon": "experimental",
  "photobooth": "pilot-ready", "converter": "experimental", "index": "support", "solutions": "support", "about": "support", "help": "support",
  "camera-notice": "support", "privacy": "support", "terms": "support", "pricing": "support", "account": "support", "admin": "support",
  // RE-LOCK 2026-11-17 (branch crisis-v3-2, merge of main 9f977dd; ledger docs/CRISIS-V3-RELOCKS.md): counselling.html (owner decision
  // 2026-11-16, crisis one-number rules) is a support page on the crisis branches, not yet on main when this baseline was taken
  "counselling": "support",
  // RE-LOCK 2026-11-18 (branch promo-basics, evals-locks/promo-basics.sha256): 404.html (owner order 2026-11-18 C, promotion
  // basics) is a new support page, not a status change of an existing page
  "404": "support"
  // RE-LOCK 2026-11-18 (branch fortune-pet, owner decision 100; ledger docs/CRISIS-V3-RELOCKS.md "relock-pet-golive"): petread.html
  // (pet face reading) went live in category 6, so its "petread": "demo" row (relock-pet) left this list for FORT.pages
};
const BASE_COUNT = {
  security: { th: "6 เครื่องมือ · พร้อมนำร่อง 3 · ทดลอง 1 · สาธิต 0 · หน้าประกอบ 2", en: "6 tools · pilot-ready 3 · experimental 1 · demo 0 · support pages 2",
    zh: "6 个工具 · 可试点 3 · 实验性 1 · 演示 0 · 辅助页面 2" },
  education: { th: "5 เครื่องมือ · พร้อมนำร่อง 3 · ทดลอง 2 · สาธิต 0", en: "5 tools · pilot-ready 3 · experimental 2 · demo 0", zh: "5 个工具 · 可试点 3 · 实验性 2 · 演示 0" },
  hr: { th: "5 เครื่องมือ · พร้อมนำร่อง 4 · ทดลอง 0 · สาธิต 1", en: "5 tools · pilot-ready 4 · experimental 0 · demo 1", zh: "5 个工具 · 可试点 4 · 实验性 0 · 演示 1" },
  marketing: { th: "14 เครื่องมือ · พร้อมนำร่อง 2 · ทดลอง 10 · สาธิต 2", en: "14 tools · pilot-ready 2 · experimental 10 · demo 2", zh: "14 个工具 · 可试点 2 · 实验性 10 · 演示 2" },
  health: { th: "4 เครื่องมือ · พร้อมนำร่อง 0 · ทดลอง 4 · สาธิต 0", en: "4 tools · pilot-ready 0 · experimental 4 · demo 0", zh: "4 个工具 · 可试点 0 · 实验性 4 · 演示 0" },
  studio: { th: "4 เครื่องมือ · พร้อมนำร่อง 1 · ทดลอง 3 · สาธิต 0", en: "4 tools · pilot-ready 1 · experimental 3 · demo 0", zh: "4 个工具 · 可试点 1 · 实验性 3 · 演示 0" }
};

test("1. cat-fortune.html: no status chip, no demo legend line, the count names no demo (TH / EN / ZH)", () => {
  const html = read("cat-fortune.html");
  assert.ok(!/class="cat-st\b/.test(html), "a status chip on cat-fortune.html");
  assert.ok(!/data-i18n="cat\.st\.demo"/.test(html), "cat.st.demo on cat-fortune.html");
  assert.ok(!/data-i18n="cat\.std\.demo[."]/.test(html), "demo legend line on cat-fortune.html");
  assert.ok(!DEMO_RE.th.test(html), "สาธิต in cat-fortune.html");
  const cards = [...html.matchAll(/<article class="pd-card cat-tool"[^>]*>/g)].map(m => m[0]);
  assert.equal(cards.length, FORT.pages.length, "every fortune tool still listed");
  for (const c of cards) assert.ok(!/data-status="demo"/.test(c), "demo data-status: " + c);
  const th = thVal(html, "cat.fortune.count");
  assert.ok(th && new RegExp("^" + FORT.pages.length + " เครื่องมือ").test(th) && !DEMO_RE.th.test(th), "TH count " + th);
  for (const l of ["en", "zh"]) {
    const v = dictVal(`i18n/${l}-cat.js`, "cat.fortune.count");
    assert.ok(v && !DEMO_RE[l].test(v) && v.startsWith(String(FORT.pages.length)), `${l} count ${v}`);
  }
});

test("2. index.html category chooser: the fortune count names no demo; the six other counts unchanged (TH / EN / ZH)", () => {
  const html = read("index.html");
  const th = thVal(html, "cat.fortune.count");
  assert.ok(th && !DEMO_RE.th.test(th), "index TH fortune count " + th);
  // re-lock 2026-11-22 (decision 223): was "byte-identical to BASE_COUNT"; now exactly the tool count, derived from the base
  // total (first number of BASE_COUNT, all three languages agree) minus the demo-only pages, and no status word at all;
  // re-lock 226: minus the pages switched off in nav.js (decision 226: an off product is not listed or counted)
  const OLD_WORDS = { th: /พร้อมนำร่อง|ทดลอง|สาธิต|หน้าประกอบ|·/, en: /pilot-ready|experimental|demo|support pages|·/i, zh: /可试点|实验性|演示|辅助页面|·/ };
  const WANT = { th: n => `${n} เครื่องมือ`, en: n => `${n} tools`, zh: n => `${n} 个工具` };
  for (const [slug, v] of Object.entries(BASE_COUNT)) {
    const total = +v.th.match(/^\d+/)[0];
    assert.ok(+v.en.match(/^\d+/)[0] === total && +v.zh.match(/^\d+/)[0] === total, slug + " base totals agree");
    const cat = D.CATEGORIES.find(c => c.slug === slug);
    assert.equal(cat.pages.length, total, slug + ": the category still lists every base tool");
    const n = total - cat.pages.filter(p => OFF.includes(p)).length;
    assert.equal(thVal(html, `cat.${slug}.count`), WANT.th(n), "index " + slug);
    assert.equal(thVal(read(`cat-${slug}.html`), `cat.${slug}.count`), WANT.th(n), `cat-${slug}.html count`);
    assert.doesNotMatch(thVal(html, `cat.${slug}.count`), OLD_WORDS.th, "index " + slug + " status words");
    for (const l of ["en", "zh"]) {
      assert.equal(dictVal(`i18n/${l}-cat.js`, `cat.${slug}.count`), WANT[l](n), `${l} ${slug} count`);
      assert.doesNotMatch(dictVal(`i18n/${l}-cat.js`, `cat.${slug}.count`), OLD_WORDS[l], `${l} ${slug} count status words`);
    }
  }
  // the demo-only pages of decision 223 (internal data, unchanged) and the switched-off pages of decision 226 (not counted)
  assert.deepEqual([...D.DEMO_ONLY].sort(), ["customers", "neuro", "signage", "teamface"]);
  assert.deepEqual([...OFF].sort(), ["customers", "exam-hall", "neuro", "product-check", "signage", "teamface"]); // re-lock 4 of 226: Product Check = the tab of medicine.html, the page itself on
});

test("3. solutions.html: no card linking to a fortune page carries a demo badge; sol-r5 (signage) is hidden and carries no badge (decision 226)", () => {
  const html = read("solutions.html");
  const cards = [...html.matchAll(/<article class="sl-card"[^>]*id="sol-([\w]+)">([\s\S]*?)<\/article>/g)];
  let n = 0;
  for (const [, id, body] of cards) {
    const href = (body.match(/class="sl-go" href="([a-z0-9-]+)\.html/) || [])[1];
    if (!href || !FORTUNE_PAGES.includes(href)) continue;
    n++;
    assert.ok(!/data-i18n="sl\.st\.demo"/.test(body) && !DEMO_RE.th.test(body.replace(/<p[\s\S]*$/, "")), `sol-${id} (${href}) demo badge`);
  }
  assert.ok(n >= 3, "fortune cards found: " + n);
  // re-lock 2026-11-22 (decision 223): sol-r5 (signage) had the approved "เร็ว ๆ นี้" badge on a demo-only card; re-lock 226:
  // signage is switched off, so the card (markup kept) is hidden with data-lq-off and carries no badge at all; the old
  // "สาธิต" badge and the sl.st.demo key stay gone
  assert.ok(OFF.includes("signage"), "signage switched off in nav.js");
  const r5 = html.match(/<article class="sl-card"([^>]*)id="sol-r5"([^>]*)>([\s\S]*?)<\/article>/);
  assert.ok(r5, "sol-r5 card (markup kept)");
  assert.match(r5[1] + r5[2], /\bdata-lq-off\b/, "sol-r5 is hidden (data-lq-off)");
  assert.doesNotMatch(r5[1] + r5[2], /\bdata-demo-only\b/, "sol-r5 demo-only marker");
  assert.ok(!/class="sl-tag\b|data-i18n="sl\.st\./.test(r5[3]) && !r5[3].includes(SOON_LABEL.th), "sol-r5 still carries a badge");
  assert.ok(!/class="sl-tag\b|data-i18n="sl\.st\./.test(html), "solutions.html still carries a status tag");
  assert.ok(!/data-i18n="sl\.st\.demo"/.test(r5[3]) && !DEMO_RE.th.test(r5[3].replace(/<p[\s\S]*$/, "")), "sol-r5 old demo badge");
  assert.ok(!/data-i18n="sl\.st\.demo"/.test(html), "solutions.html still uses sl.st.demo");
  for (const l of ["en", "zh"]) {
    assert.equal(dictVal(`i18n/${l}-solutions.js`, "sl.st.soon"), null, `${l} sl.st.soon is gone (decision 226)`);
    assert.equal(dictVal(`i18n/${l}-solutions.js`, "sl.st.demo"), null, `${l} sl.st.demo is gone`);
  }
});

test("4. every fortune page and its own dictionaries: no status chip and no demo status key", () => {
  for (const p of FORTUNE_PAGES) {
    const html = read(p + ".html");
    assert.ok(!/class="(?:cat-st|sl-tag)\b/.test(html), p + ": status chip");
    assert.ok(!/data-i18n="(?:cat\.st|sl\.st)\.demo"/.test(html), p + ": demo status key");
    for (const l of ["en", "zh"]) {
      const f = `i18n/${l}-${p}.js`;
      if (!existsSync(join(ROOT, f))) continue;
      assert.ok(!/"(?:cat\.st|sl\.st)\.demo"/.test(read(f)), f + ": demo status key");
    }
  }
});

test("5. other categories unchanged: statuses; teamface / signage / neuro switched off, no card, label in the back office only (TH / EN / ZH keys)", () => {
  const fort = new Set(FORT.pages);
  const now = {};
  for (const [p, v] of Object.entries(D.PAGES)) if (!fort.has(p)) now[p] = v.st;
  assert.deepEqual(now, BASE_ST);
  // re-lock 2026-11-22 (decision 223): the three former demo chips became the "เร็ว ๆ นี้" badge on demo-only cards; re-lock
  // 226: the three products are switched off, so their category page has no card for them (and no badge, no "สาธิต" chip, no
  // cat.st.demo key, no legend line); the label "เร็ว ๆ นี้" / "Coming soon" / "即将推出" is held by the back office only
  const adm = read("admin-measurements.js");
  for (const [slug, page] of [["hr", "teamface"], ["marketing", "signage"], ["marketing", "neuro"]]) {
    const html = read(`cat-${slug}.html`);
    assert.ok(OFF.includes(page), `${page} switched off in nav.js`);
    assert.ok(D.CATEGORIES.find(c => c.slug === slug).pages.includes(page), `${page} still in category ${slug} (internal data)`);
    assert.ok(!html.includes(`data-page="${page}"`) && !html.includes(`href="${page}.html`), `${page} card on cat-${slug}.html`);
    assert.ok(!/class="cat-st\b|data-i18n="cat\.b\.|data-status=|data-demo-only/.test(html) && !html.includes(SOON_LABEL.th), `cat-${slug}.html status badge`);
    assert.ok(!/data-i18n="cat\.st\.demo"|class="cat-st demo"|สาธิต/.test(html), `old demo chip on cat-${slug}.html`);
    assert.ok(!/data-i18n="cat\.std\./.test(html), `cat-${slug}.html status legend line`);
    assert.ok(adm.includes(`"${page}", "${SOON_LABEL.th}", "${SOON_LABEL.en}", "${SOON_LABEL.zh}", "off",`), `${page}: back-office label and visibility`);
  }
  for (const l of ["en", "zh"]) {
    assert.equal(dictVal(`i18n/${l}-cat.js`, "cat.b.soon"), null, `${l} cat.b.soon is gone (decision 226)`);
    assert.equal(dictVal(`i18n/${l}-cat.js`, "cat.st.demo"), null, `${l} cat.st.demo is gone`);
  }
});
