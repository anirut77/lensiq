"use strict";
// tests/unit/solutions.test.js — solutions.html ("solutions by sector" catalogue): 10 sectors, every card has a status,
// a "for" line, a privacy note and either a link to a page or (coming soon) no link; links point at pages that exist or
// at the product pages being built in parallel (exam / gate / parking / village); the "do not build" list stays; en/zh
// dictionaries cover every key without Thai.
// Inverted for owner decision 223 (audit 1.10, section 3; audit section 6 rule: invert, never loosen): badges are only
// "รุ่นทดลอง" / "เร็ว ๆ นี้", no status legend, filters all / available to try now / coming soon; the "still needed" roadmap
// notes left the customer page and are kept verbatim in docs/PAGE-STATUS.md (tools/cat-data.cjs SOON_ROADMAP); the
// demo-only cards (signage, customers) carry data-demo-only.
// Inverted again for owner decision 226 (2026-11-22; invert, never loosen): no status label and no status filter for customers.
// No card carries a status tag (.sl-tag / sl.st.*); the filter (.sl-filter, data-f, sl.f.*, lq-sol-filter) and its count / empty
// notes are gone; a card of a product that is not offered (no page yet = data-status "soon", or a page switched off in the nav.js
// visibility list) carries data-lq-off (nav.js hides it) and is never deleted; data-demo-only is gone.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const html = read("solutions.html");
const cards = [...html.matchAll(/<article class="sl-card"( data-lq-off)? data-status="(\w+)" id="sol-([\w]+)">([\s\S]*?)<\/article>/g)]
  .map(m => ({ off: !!m[1], status: m[2], id: m[3], body: m[4] }));
const OFF = ["exam-hall", "signage", "neuro", "teamface", "customers", "omr", "tryon"]; // nav.js VISIBILITY pages switched off (decision 226; Product Check is a tab of medicine.html, the page is on; re-lock 9, owner entry 16: omr and tryon off)
const PARALLEL = new Set(["exam.html", "gate.html", "parking.html", "village.html"]); // other product lines, built in parallel

test("10 sectors in the agreed order, each with cards", () => {
  const ids = [...html.matchAll(/<section class="sl-sec" id="sec-(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, ["edu", "hr", "retail", "mfg", "park", "health", "fit", "agri", "event", "gov"]);
  for (const id of ids) assert.ok(html.includes(`href="#sec-${id}"`), "sector nav " + id);
  assert.ok(cards.length >= 40, "cards " + cards.length);
  assert.equal(cards.length, (html.match(/<article class="sl-card"/g) || []).length, "every card parsed");
});

test("every card: no status tag, title, what, who, privacy; a link (not offered yet: none, hidden) and no internal 'still needed' note", () => {
  for (const c of cards) {
    assert.ok(["now", "soon"].includes(c.status), c.id);
    // decision 226 (was 223: badge "รุ่นทดลอง" / "เร็ว ๆ นี้" on every card but hr1 and the fortune cards): no card has a status tag
    assert.ok(!/class="sl-tag\b|data-i18n="sl\.st\./.test(c.body), c.id + ": status tag");
    assert.ok(!/รุ่นทดลอง|เร็ว ๆ นี้|ทดลองใช้ได้ตอนนี้/.test(c.body), c.id + ": status words");
    assert.ok(!/sl-why|data-i18n="sl\.why"|data-i18n="sl\.c\.\w+\.y"/.test(c.body), c.id + ": no 'still needed' roadmap note on the page");
    assert.match(c.body, /<h3 data-i18n="sl\.c\.\w+\.h">/, c.id);
    assert.match(c.body, /data-i18n="sl\.c\.\w+\.w"/, c.id + " who");
    assert.match(c.body, /class="sl-meta sl-pv"><b data-i18n="sl\.priv">[^<]+<\/b> <span data-i18n="pv\.\w+">/, c.id + " privacy");
    const link = (c.body.match(/class="sl-go" href="([^"]+)"/) || [])[1];
    // decision 226: a product with no page yet (data-status "soon") is hidden (data-lq-off) and has no page link; a card whose
    // page is switched off (nav.js visibility list) is hidden and still opens its existing page (never deleted)
    const offPage = !!link && OFF.includes(link.replace(/\.html.*$/, ""));
    assert.equal(c.off, c.status === "soon" || offPage, c.id + ": data-lq-off exactly on cards of products not offered");
    if (c.status === "soon" && !offPage) {
      assert.ok(!link, c.id + ": a product with no page yet has no page link");
    } else {
      assert.ok(link, c.id + " links a page");
      // walk-through 2026-11-16 D-02: the employee time-clock card (hr1) opens attendance.html in PIN / QR mode; that exact
      // query is the only one allowed, and the file must still exist
      const file = c.id === "hr1" && link === "attendance.html?mode=employee" ? "attendance.html" : link;
      assert.ok(fs.existsSync(path.join(ROOT, file)) || PARALLEL.has(link), `${c.id}: ${link} missing`);
    }
  }
});

test("quick wins and parallel product pages are linked; the agreed 'coming soon' items are there", () => {
  for (const p of ["queue.html", "tables.html", "afterhours.html", "bays.html", "attendance.html", "exam.html", "gate.html", "parking.html", "village.html"])
    assert.ok(html.includes(`href="${p}"`), p);
  const soon = cards.filter(c => c.status === "soon").map(c => c.body).join("\n");
  for (const re of [/หมวกนิรภัย/, /ล้ม/, /กายภาพ/, /ประตูโรงเรียน/, /มวยไทย/]) assert.match(soon, re);
  // decision 223: the still-needed notes (with their model licences) left the page and are kept verbatim in the back-office
  // table docs/PAGE-STATUS.md, one row per coming-soon card
  assert.doesNotMatch(soon, /YOLOX, Apache-2\.0|MediaPipe Pose, Apache-2\.0/);
  const status = read("docs/PAGE-STATUS.md");
  assert.match(status, /YOLOX, Apache-2\.0/); assert.match(status, /MediaPipe Pose, Apache-2\.0/);
  for (const c of cards.filter(x => x.status === "soon" && !/class="sl-go"/.test(x.body))) assert.ok(status.includes("| `sol-" + c.id + "` |"), c.id + ": roadmap row");
  // available-now cards only point at pages that already exist (no promise of an unbuilt page as "available"); since
  // decision 223 the former pilot cards (exam / gate / parking / village) are "available to try now", so their pages must exist
  for (const c of cards.filter(x => x.status === "now")) {
    const href = (c.body.match(/class="sl-go" href="([^"?]+)/) || [])[1];
    assert.ok(href && fs.existsSync(path.join(ROOT, href)), c.id + ": " + href);
  }
  // decision 226 (was 223: demo-only pages carry data-demo-only): every card that links a switched-off page carries data-lq-off,
  // and data-demo-only is gone; the cards are kept (hidden), never deleted
  for (const c of cards.filter(x => new RegExp(`href="(${OFF.join("|")})\\.html`).test(x.body))) assert.ok(c.off, c.id + ": data-lq-off");
  assert.ok(cards.some(c => c.off && /href="signage\.html"/.test(c.body)) && cards.some(c => c.off && /href="customers\.html"/.test(c.body)),
    "off cards kept in the markup");
  // the drug checker (medicine.html) is on: its card is shown (Product Check, a tab of that page, is the switched-off part)
  assert.ok(cards.some(c => !c.off && /href="medicine\.html"/.test(c.body)), "sol-h5 (medicine) shown");
  assert.ok(!/data-demo-only/.test(html), "data-demo-only is gone (replaced by data-lq-off)");
});

test("'do not build' list: emotion/attention scoring, public biometric ID, drowning, forklift; no card offers them", () => {
  const no = html.slice(html.indexOf('id="slNoH"'));
  for (const k of ["sl.no.1", "sl.no.2", "sl.no.3", "sl.no.4"]) assert.ok(no.includes(`data-i18n="${k}"`), k);
  // what a card offers (title / what / who); privacy notes may say what is NOT done ("no emotion reading")
  const cardText = cards.map(c => [...c.body.matchAll(/data-i18n="sl\.c\.\w+\.[hpw]">([^<]*)</g)].map(m => m[1]).join(" ")).join("\n");
  assert.ok(!/อารมณ์|จมน้ำ|รถยก|emotion|drown|forklift/i.test(cardText), "a card offers a do-not-build use");
  assert.ok(!/ตรวจจับการทุจริต|จับโกง|detects? cheating|guilty/i.test(html), "human-in-the-loop wording");
});

function dict(f, lang) { const w = {}; w.window = w; vm.runInNewContext(read("i18n/" + f), w); return Object.assign({}, ...w.LQI18N_Q.map(d => d[lang] || {})); }
test("solutions i18n: en/zh identical keys, every page key covered, no Thai, placeholders kept", () => {
  const en = dict("en-solutions.js", "en"), zh = dict("zh-solutions.js", "zh");
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of m[1].split(";")) keys.push(p.split(":")[1]);
  for (const m of read("solutions.js").matchAll(/T\("([\w.]+)"/g)) keys.push(m[1]);
  assert.deepEqual(keys.filter(k => !(k in en) || !(k in zh)), []);
  for (const v of [...Object.values(en), ...Object.values(zh)]) assert.ok(!/[ก-๛]/.test(v), v);
  // decision 226 (was: sl.count keeps {n} / {total}): the status tag, filter, count and empty-note keys are gone in both dictionaries
  for (const d of [en, zh]) assert.deepEqual(Object.keys(d).filter(k => /^sl\.(st|f)\.|^sl\.(filterAria|empty|count)$/.test(k)), []);
  assert.ok(!Object.values(en).some(v => /\bAI\b(?! Act)/.test(v)), "no 'AI' in labels (docs/I18N.md); the EU AI Act is a name");
});

test("solutions page: CSP meta, nav, no inline script, print wired; no status filter (decision 226)", () => {
  assert.match(html, /<meta http-equiv="Content-Security-Policy"/);
  assert.match(html, /<script src="nav\.js/);
  assert.ok(!/<script>/.test(html));
  const js = read("solutions.js"), css = read("solutions.css");
  assert.match(html, /id="slPrint"/); assert.match(js, /getElementById\("slPrint"\)/); assert.match(js, /window\.print\(\)/);
  // decision 226 (was 223: filters all / now / soon, remembered in lq-sol-filter): no filter, no count line, no empty notes
  assert.ok(!/data-f="|class="sl-filter\b|id="slCount"|class="sl-none\b|class="sl-legend/.test(html), "status filter, count and legend are gone");
  assert.ok(!/lq-sol-filter|data-f|dataset\.status|sl-filter/.test(js), "solutions.js has no filter code");
  assert.ok(!/\.sl-tag|\.sl-filter|\.sl-count|\.sl-none/.test(css), "solutions.css has no tag / filter styles");
  assert.ok(!/class="sl-tag\b|data-i18n="sl\.st\./.test(html), "no status tag on the page");
});
