"use strict";
// tests/unit/solutions.test.js — solutions.html ("solutions by sector" catalogue): 10 sectors, every card has a status,
// a "for" line, a privacy note and either a link to a page or (coming soon) no link; links point at pages that exist or
// at the product pages being built in parallel (exam / gate / parking / village); the "do not build" list stays; en/zh
// dictionaries cover every key without Thai.
// Inverted for owner decision 223 (audit 1.10, section 3; audit section 6 rule: invert, never loosen): badges are only
// "รุ่นทดลอง" / "เร็ว ๆ นี้", no status legend, filters all / available to try now / coming soon; the "still needed" roadmap
// notes left the customer page and are kept verbatim in docs/PAGE-STATUS.md (tools/cat-data.cjs SOON_ROADMAP); the
// demo-only cards (signage, customers) carry data-demo-only.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const html = read("solutions.html");
const cards = [...html.matchAll(/<article class="sl-card" data-status="(\w+)" id="sol-([\w]+)"( data-demo-only)?>([\s\S]*?)<\/article>/g)]
  .map(m => ({ status: m[1], id: m[2], demo: !!m[3], body: m[4] }));
const PARALLEL = new Set(["exam.html", "gate.html", "parking.html", "village.html"]); // other product lines, built in parallel

test("10 sectors in the agreed order, each with cards", () => {
  const ids = [...html.matchAll(/<section class="sl-sec" id="sec-(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, ["edu", "hr", "retail", "mfg", "park", "health", "fit", "agri", "event", "gov"]);
  for (const id of ids) assert.ok(html.includes(`href="#sec-${id}"`), "sector nav " + id);
  assert.ok(cards.length >= 40, "cards " + cards.length);
});

test("every card: status, title, what, who, privacy; a link (coming soon: none) and no internal 'still needed' note", () => {
  for (const c of cards) {
    assert.ok(["now", "soon"].includes(c.status), c.id);
    // decision 223: badge "รุ่นทดลอง" on a card you can try now, "เร็ว ๆ นี้" on a coming-soon card; no badge only on the
    // PIN / QR time clock (hr1, audit section 3) and the fortune cards (owner order 2026-11-17)
    const tag = (c.body.match(/<span class="sl-tag (\w+)" data-i18n="(sl\.st\.\w+)">([^<]*)<\/span>/) || []).slice(1);
    if (c.status === "soon") assert.deepEqual(tag, ["soon", "sl.st.soon", "เร็ว ๆ นี้"], c.id + " badge");
    else if (tag.length) assert.deepEqual(tag, ["trial", "sl.st.trial", "รุ่นทดลอง"], c.id + " badge");
    else assert.ok(c.id === "hr1" || /href="(fortune|planner|luckycolor)\.html"/.test(c.body), c.id + ": card without a badge");
    assert.ok(!/sl-why|data-i18n="sl\.why"|data-i18n="sl\.c\.\w+\.y"/.test(c.body), c.id + ": no 'still needed' roadmap note on the page");
    assert.match(c.body, /<h3 data-i18n="sl\.c\.\w+\.h">/, c.id);
    assert.match(c.body, /data-i18n="sl\.c\.\w+\.w"/, c.id + " who");
    assert.match(c.body, /class="sl-meta sl-pv"><b data-i18n="sl\.priv">[^<]+<\/b> <span data-i18n="pv\.\w+">/, c.id + " privacy");
    const link = (c.body.match(/class="sl-go" href="([^"]+)"/) || [])[1];
    // a demo-only card (data-demo-only, decision 223) is "coming soon" in demo mode and still opens its existing page
    if (c.status === "soon" && !c.demo) {
      assert.ok(!link, c.id + ": coming soon has no page link");
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
  for (const c of cards.filter(x => x.status === "soon" && !x.demo)) assert.ok(status.includes("| `sol-" + c.id + "` |"), c.id + ": roadmap row");
  // available-now cards only point at pages that already exist (no promise of an unbuilt page as "available"); since
  // decision 223 the former pilot cards (exam / gate / parking / village) are "available to try now", so their pages must exist
  for (const c of cards.filter(x => x.status === "now")) {
    const href = (c.body.match(/class="sl-go" href="([^"?]+)/) || [])[1];
    assert.ok(href && fs.existsSync(path.join(ROOT, href)), c.id + ": " + href);
  }
  // demo-only pages: their catalogue cards carry data-demo-only (listed only when window.LENSIQ_PROFILE === "demo")
  for (const c of cards.filter(x => /href="(signage|customers|neuro|teamface)\.html"/.test(x.body))) assert.ok(c.demo, c.id + ": data-demo-only");
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
  assert.ok(en["sl.count"].includes("{n}") && zh["sl.count"].includes("{total}"));
  assert.ok(!Object.values(en).some(v => /\bAI\b(?! Act)/.test(v)), "no 'AI' in labels (docs/I18N.md); the EU AI Act is a name");
});

test("solutions page: CSP meta, nav, no inline script, print + status filter wired", () => {
  assert.match(html, /<meta http-equiv="Content-Security-Policy"/);
  assert.match(html, /<script src="nav\.js/);
  assert.ok(!/<script>/.test(html));
  const js = read("solutions.js");
  assert.match(js, /lq-sol-filter/); assert.match(js, /try \{ localStorage/);
  for (const f of ["all", "now", "soon"]) assert.ok(html.includes(`data-f="${f}"`), f);
  // decision 223: no "open for a pilot" filter and no status legend
  assert.ok(!html.includes('data-f="pilot"') && !/class="sl-legend/.test(html), "pilot filter and status legend are gone");
  assert.match(js, /OK = \["all", "now", "soon"\]/);
});
