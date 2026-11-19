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
  for (const [slug, v] of Object.entries(BASE_COUNT)) {
    assert.equal(thVal(html, `cat.${slug}.count`), v.th, "index " + slug);
    assert.equal(thVal(read(`cat-${slug}.html`), `cat.${slug}.count`), v.th, `cat-${slug}.html count`);
    for (const l of ["en", "zh"]) assert.equal(dictVal(`i18n/${l}-cat.js`, `cat.${slug}.count`), v[l], `${l} ${slug} count`);
  }
});

test("3. solutions.html: no card linking to a fortune page carries a demo badge; sol-r5 (signage) keeps its demo badge", () => {
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
  const r5 = cards.find(c => c[1] === "r5");
  assert.ok(r5 && /<span class="sl-tag now"\s+data-i18n="sl\.st\.demo">สาธิต<\/span>/.test(r5[2]), "sol-r5 demo badge kept");
  for (const l of ["en", "zh"]) assert.equal(dictVal(`i18n/${l}-solutions.js`, "sl.st.demo"), DEMO[l], `${l} sl.st.demo kept for other categories`);
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

test("5. other categories unchanged: statuses, demo chips of teamface / signage / neuro (TH / EN / ZH keys)", () => {
  const fort = new Set(FORT.pages);
  const now = {};
  for (const [p, v] of Object.entries(D.PAGES)) if (!fort.has(p)) now[p] = v.st;
  assert.deepEqual(now, BASE_ST);
  for (const [slug, page] of [["hr", "teamface"], ["marketing", "signage"], ["marketing", "neuro"]]) {
    const html = read(`cat-${slug}.html`);
    const card = html.match(new RegExp(`<article class="pd-card cat-tool" data-page="${page}"[\\s\\S]*?</article>`));
    assert.ok(card && /<span class="cat-st demo"\s+data-i18n="cat\.st\.demo">สาธิต<\/span>/.test(card[0]), `${page} demo chip on cat-${slug}.html`);
    assert.ok(/data-i18n="cat\.std\.demo"/.test(html), `cat-${slug}.html demo legend line`);
  }
  for (const l of ["en", "zh"]) assert.equal(dictVal(`i18n/${l}-cat.js`, "cat.st.demo"), DEMO[l], `${l} cat.st.demo`);
});
