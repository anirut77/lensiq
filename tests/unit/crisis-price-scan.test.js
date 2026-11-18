"use strict";
// tests/unit/crisis-price-scan.test.js — FIXED TEST SET "crisis-v3-protect" (locked 2026-11-18 BEFORE building; copies + sha256 in
// ~/LENSIQ-field/evals/crisis-v3-protect/, evals-locks/crisis-v3-protect.sha256). Residual risk 1 of the crisis-v3 review: the escape
// guard catches only sales elements that carry a sales marker; unmarked price / sales text visible while html[data-lq-crisis] is set
// must fail too, in TH / EN / ZH. Static half; the browser half is tests/e2e/crisis-price-scan-{th,en,zh,controls}.e2e.mjs.
// Scanner and words: tests/unit/crisis-price-scan-lib.cjs. Exceptions: tests/unit/crisis-escape-guard-allow.json "priceText"
// ({where, text, reason}); `where` = a file (static entry, must match something, or the test fails) or a page name (browser only).
//   P1 scanner controls: 3 unmarked price strings per language are flagged; ordinary reading words are not; the browser copy
//      (SCAN_SRC) gives the same result.
//   P2 static scan: every text a visitor can see on a reading page (its HTML outside the crisis-hidden markers, string literals of
//      every script the page gets, its i18n dictionaries zh-* and their en-* siblings) has no sales word, or the hit is allow-listed with a
//      reason; every static allow-list entry still matches something.
//   P3 negative control for P2: 3 unmarked price strings injected into a page's HTML and one of its scripts make P2 fail on exactly
//      those; the clean sources pass.
//   P4 what the crisis state draws itself (a reading drawn by FortuneAI in the crisis state, and the closing line) has no sales
//      word at all, in TH / EN / ZH (no allow-list).
//   P5 report.js: the "no report credit" gate (a link to the report prices, paid mode) sits inside a [data-lq-upsell] element, which
//      the crisis / calm style hides (fortune-crisis.js CALM_CSS); otherwise its price link would show in the crisis state unmarked.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const L = require("./crisis-escape-guard-lib.cjs");
const S = require("./crisis-price-scan-lib.cjs");

const ROOT = path.join(__dirname, "..", "..");
const ALLOW_ALL = JSON.parse(fs.readFileSync(path.join(__dirname, "crisis-escape-guard-allow.json"), "utf8"));
const ALLOW = ALLOW_ALL.priceText || [];
// RE-LOCK 2 2026-11-18 (adds assertions only; coordinator order, CLAUDE.md rule b): the menu price / payment entries left the
// allow-list; a hit is accepted only when the SOURCE LINE that holds it also carries the crisis-sales marker (priceMarked), and P6
// asserts that the marker hides it in the crisis and calm states
const MARKED_OK = ALLOW_ALL.priceMarked || [];
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const fresh = f => { const p = path.join(ROOT, f); delete require.cache[require.resolve(p)]; return require(p); };
const isFile = w => /\.(?:js|html)$/.test(w);

const INJECT = S.INJECT;
const CLEAN = [
  "ช่วงนี้ค่อย ๆ ดีขึ้น บทบาทในงานชัดเจนขึ้น", "พระพุทธรูปนั่งห้อยพระบาท", "การชำระล้างและเริ่มใหม่", "โทร 1323 ได้ตลอด 24 ชั่วโมง",
  "Your work gets steadier this month; Cancer and Leo get along", "Call 1323, any time",
  "四元素手型与主线", "本月工作顺利，元素平衡", "元旦之后运势上升", "拨打 1323",
];

/** the files a reading page shows text from: its HTML, every script it gets (its own, those nav.js injects, those its scripts load:
 *  crisis-escape-guard-lib pageScriptsAll), its i18n dictionaries (zh-* and the en-* sibling) */
function pageSources(page, over = {}) {
  const get = f => (f in over ? over[f] : read(f));
  const html = get(page + ".html");
  const out = [[page + ".html", S.htmlTexts(html)]];
  const scripts = [...L.ownScripts(html), ...L.pageScriptsAll(ROOT, html), ...L.scriptsOf(html).filter(s => s.startsWith("i18n/zh-")).flatMap(s => [s, s.replace("/zh-", "/en-")])];
  for (const s of scripts) if (s in over || fs.existsSync(path.join(ROOT, s))) out.push([s, S.jsStrings(get(s))]);
  return out;
}
/** P2: every sales hit on every reading page that no static allow-list entry covers; and the entries that were used */
function staticScan(pages, over = {}) {
  const bad = [], used = new Set(), seen = new Set();
  const markedLine = (f, t) => MARKED_OK.find(e => e.where === f && t === e.text && (f in over ? over[f] : read(f)).split("\n").some(l => l.includes(e.text) && l.includes(e.marker)));
  for (const p of pages) for (const [f, texts] of pageSources(p, over)) {
    if (seen.has(f)) continue;
    seen.add(f);
    for (const t of texts) {
      const hits = S.scan(t);
      if (!hits.length) continue;
      const i = S.allowedBy(ALLOW.filter(e => isFile(e.where) || e.where === "*"), f, t);
      if (i >= 0) { used.add(ALLOW.filter(e => isFile(e.where) || e.where === "*")[i]); continue; }
      const mk = markedLine(f, t);
      if (mk) { used.add(mk); continue; }
      bad.push(`${f}: [${[...new Set(hits.map(h => h.match))].join(", ")}] "${t.slice(0, 120)}"`);
    }
  }
  return { bad, used };
}

test("P1: the scanner flags 3 unmarked price strings per language, not ordinary reading words; the browser copy agrees", () => {
  for (const [lang, t] of Object.entries(INJECT)) assert.ok(S.scan(t).length >= 2, lang + ": flagged: " + t);
  for (const t of ["฿99", "99 บาท", "THB 1,290", "สั่งซื้อ", "ชำระเงิน", "price list", "Buy", "购买", "价格", "199 元", "¥99"])
    assert.ok(S.scan(t).length >= 1, "flagged: " + t);
  for (const t of CLEAN) assert.deepEqual(S.scan(t), [], "not flagged: " + t);
  const ctx = { window: {} };
  vm.runInNewContext(S.SCAN_SRC, ctx);
  for (const t of [...Object.values(INJECT), ...CLEAN]) assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.__lqPriceScan(t).map(h => h.match).sort())), S.scan(t).map(h => h.match).sort(), "same in the browser: " + t);
});

test("P2: no unmarked sales word in what a reading page can show (TH / EN / ZH), unless allow-listed with a reason; no stale entry", () => {
  const pages = L.readingPages(ROOT);
  assert.ok(pages.length >= 16, "reading pages found: " + pages.length);
  for (const e of ALLOW) {
    assert.ok(e.where && e.text && typeof e.reason === "string" && e.reason.length >= 15, "allow-list entry needs where, text and a reason: " + JSON.stringify(e));
    assert.ok(S.scan(e.text).length >= 1, "allow-list entry does not contain a sales word (too wide or stale): " + JSON.stringify(e));
  }
  const { bad, used } = staticScan(pages);
  for (const e of ALLOW) if (isFile(e.where) && !used.has(e)) bad.push(`allow-list entry matches nothing any more: ${e.where} "${e.text}"`);
  for (const e of MARKED_OK) if (!used.has(e)) bad.push(`priceMarked entry matches nothing (text gone or marker missing on its line): ${e.where} "${e.text}"`);
  assert.deepEqual(bad, []);
});

test("P3: negative control: 3 injected unmarked price strings make P2 fail on exactly those; clean sources pass", () => {
  const pages = ["dream"], clean = staticScan(pages);
  assert.deepEqual(clean.bad, [], "clean dream sources pass");
  const html = read("dream.html").replace("</main>", `<p>${INJECT.th}</p><button type="button">${INJECT.en}</button></main>`);
  assert.notEqual(html, read("dream.html"), "dream.html has a </main> to inject before");
  const js = read("dream.js") + `\n;window.__x = ${JSON.stringify(INJECT.zh)};\n`;
  const { bad } = staticScan(pages, { "dream.html": html, "dream.js": js });
  assert.equal(bad.length, 3, "exactly the 3 injected strings fail:\n" + bad.join("\n"));
  for (const t of Object.values(INJECT)) assert.ok(bad.some(b => b.includes(t.slice(0, 20))), "flagged: " + t);
  // a string inside a crisis-hidden marker is not static text (the marker hides it in the crisis state)
  const marked = read("dream.html").replace("</main>", `<div data-lq-upsell><p>${INJECT.th}</p></div></main>`);
  assert.deepEqual(staticScan(pages, { "dream.html": marked }).bad, [], "inside [data-lq-upsell]: hidden in the crisis state, not flagged");
});

test("P4: a reading drawn in the crisis state and the closing line carry no sales word (TH / EN / ZH, no allow-list)", async () => {
  const PHRASE = { th: "อยากตายจริงๆ", en: "I want to die tonight", zh: "我不想活了" };
  const FACTS = { domain: "tarot", topic: "overall", items: [
    { id: "card.past.star", label: "ไพ่ดวงดาว", strength: 0.8, tags: ["overview"], meanings: { overview: ["คุณมีความหวังและกำลังใจที่ดี"], money: ["การเงินค่อย ๆ มั่นคง"], work: ["งานเดินหน้าได้"] } },
    { id: "card.present.sun", label: "ไพ่พระอาทิตย์", strength: 0.9, tags: ["overview"], meanings: { overview: ["ช่วงนี้มีพลังและความสดใส"], love: ["ความสัมพันธ์อบอุ่น"], work: ["ผลงานเป็นที่ยอมรับ"] } },
  ] };
  const CR = fresh("fortune-crisis.js");
  for (const lang of ["th", "en", "zh"]) {
    const FA = fresh("fortune-ai.js");
    const r = await FA.interpret(Object.assign({}, FACTS, { question: PHRASE[lang] }), { useAI: false, lang, seed: 7 });
    assert.notEqual(r.source, "support", lang + ": a reading");
    const text = (FA.toHTML(r) + " " + CR.helpHTML(lang, "lq-helpline-result")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.ok(text.includes("1323"), lang + ": the closing line is part of what was scanned");
    assert.deepEqual(S.scan(text).map(h => h.match), [], lang + ": no sales word in the crisis reading + closing line");
  }
});

test("P5: report.js: the paid-mode 'no credit' gate with the link to the report prices is inside [data-lq-upsell] (hidden in the crisis state)", () => {
  const src = read("report.js");
  const i = src.indexOf('T("rp.gate.buy"');
  assert.ok(i > 0, "the gate link is still built in report.js");
  const stmt = src.slice(src.lastIndexOf("g.appendChild(", i), src.indexOf(";", i));
  assert.match(stmt, /h\("p",\s*\{[^}]*"data-lq-upsell"/, "the gate paragraph carries data-lq-upsell: " + stmt.slice(0, 160));
  assert.match(read("fortune-crisis.js"), /html\[data-lq-crisis\] \[data-lq-upsell\]\{?[^}]*display:none!important|html\[data-lq-crisis\] \[data-lq-upsell\][^{]*\{display:none!important/, "[data-lq-upsell] is hidden in the crisis state");
});

test("P6 (re-lock 2): menu price / payment entries carry the crisis-sales marker, and the marker is hidden in the crisis and calm states", () => {
  const nav = read("nav.js"), mem = read("lensiq-member.js");
  assert.match(nav, /:is\(html\[data-lq-crisis\],html\[data-lq-calm\]\) \[data-lq-crisis-sales\]\{display:none!important\}/, "nav.js hides [data-lq-crisis-sales] in the crisis and calm states");
  assert.match(nav, /href: "pricing\.html", [^\n]*crisisSales: "item"/, "site menu: the pricing entry is marked as a whole");
  assert.match(nav, /href: "account\.html", [^\n]*สมาชิกและการชำระเงิน[^\n]*crisisSales: "desc"/, "site menu: the account entry's payment description is marked");
  assert.match(nav, /i\.crisisSales === "item" \? cs/, "nav.js draws the marker on a marked entry");
  assert.match(nav, /i\.crisisSales === "desc" \? cs/, "nav.js draws the marker on a marked description");
  assert.match(mem, /el\("li", \{[^}]*"data-lq-crisis-sales": ""[^}]*\}, el\("a", \{[^}]*href: "pricing\.html"/, "account menu: the pricing entry is marked");
  // every pricing.html link in the site menu data is marked
  for (const m of nav.matchAll(/\{ href: "pricing\.html"[^\n]*/g)) assert.match(m[0], /crisisSales/, "unmarked site-menu pricing entry: " + m[0].slice(0, 80));
});
