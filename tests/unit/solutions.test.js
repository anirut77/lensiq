"use strict";
// tests/unit/solutions.test.js — solutions.html ("solutions by sector" catalogue): 10 sectors, every card has a status,
// a "for" line, a privacy note and either a link to a page or (coming soon) an honest "still needed" note; links point
// at pages that exist or at the product pages being built in parallel (exam / gate / parking / village); the
// "do not build" list stays; en/zh dictionaries cover every key without Thai.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const html = read("solutions.html");
const cards = [...html.matchAll(/<article class="sl-card" data-status="(\w+)" id="sol-([\w]+)">([\s\S]*?)<\/article>/g)].map(m => ({ status: m[1], id: m[2], body: m[3] }));
const PARALLEL = new Set(["exam.html", "gate.html", "parking.html", "village.html"]); // other product lines, built in parallel

test("10 sectors in the agreed order, each with cards", () => {
  const ids = [...html.matchAll(/<section class="sl-sec" id="sec-(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, ["edu", "hr", "retail", "mfg", "park", "health", "fit", "agri", "event", "gov"]);
  for (const id of ids) assert.ok(html.includes(`href="#sec-${id}"`), "sector nav " + id);
  assert.ok(cards.length >= 40, "cards " + cards.length);
});

test("every card: status, title, what, who, privacy; link or an honest 'still needed' note", () => {
  for (const c of cards) {
    assert.ok(["now", "pilot", "soon"].includes(c.status), c.id);
    assert.match(c.body, /<h3 data-i18n="sl\.c\.\w+\.h">/, c.id);
    assert.match(c.body, /data-i18n="sl\.c\.\w+\.w"/, c.id + " who");
    assert.match(c.body, /class="sl-meta sl-pv"><b data-i18n="sl\.priv">[^<]+<\/b> <span data-i18n="pv\.\w+">/, c.id + " privacy");
    const link = (c.body.match(/class="sl-go" href="([^"]+)"/) || [])[1];
    if (c.status === "soon") {
      assert.ok(!link, c.id + ": coming soon has no page link");
      assert.match(c.body, /sl-why/, c.id + ": coming soon says what is missing");
    } else {
      assert.ok(link, c.id + " links a page");
      assert.ok(fs.existsSync(path.join(ROOT, link)) || PARALLEL.has(link), `${c.id}: ${link} missing`);
    }
  }
});

test("quick wins and parallel product pages are linked; the agreed 'coming soon' items are there", () => {
  for (const p of ["queue.html", "tables.html", "afterhours.html", "bays.html", "attendance.html", "exam.html", "gate.html", "parking.html", "village.html"])
    assert.ok(html.includes(`href="${p}"`), p);
  const soon = cards.filter(c => c.status === "soon").map(c => c.body).join("\n");
  for (const re of [/หมวกนิรภัย/, /ล้ม/, /กายภาพ/, /ประตูโรงเรียน/, /มวยไทย/]) assert.match(soon, re);
  assert.match(soon, /YOLOX, Apache-2\.0/); assert.match(soon, /MediaPipe Pose, Apache-2\.0/);
  // available-now cards only point at pages that already exist (no promise of an unbuilt page as "available")
  for (const c of cards.filter(x => x.status === "now")) assert.ok(!PARALLEL.has((c.body.match(/href="([^"]+)"/) || [])[1]), c.id);
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
  for (const f of ["all", "now", "pilot", "soon"]) assert.ok(html.includes(`data-f="${f}"`), f);
});
