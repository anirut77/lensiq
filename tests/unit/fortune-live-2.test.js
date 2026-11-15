"use strict";
// tests/unit/fortune-live-2.test.js — FIXED TEST SET, fortune go-live review round 1 (independent review of 518dd0b, NOT OK),
// locked BEFORE the fixes. The browser half is tests/e2e/fortune-live-2.e2e.mjs.
//   A1  no page script sets an idle "ready" status that names the processing backend or says the model loads later
//   B1  the team face-reading menu entry (shown in the menu of every page, fortune pages included) says what it is without
//       "for entertainment", in TH / EN / ZH
//   B2  help.html: the fortune answer uses the final disclaimer in TH, EN and ZH and no "for entertainment"
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const BAN = /บันเทิง|entertain|娱乐|for fun/i;
const NEW = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
const norm = s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("A1: no page script shows 'ready (backend …)' or 'the model loads when …' as a status", () => {
  const READY_BACKEND = /(?:พร้อมใช้งาน|พร้อม|ready)\s*(?:\(|—|-)?\s*(?:ตัวประมวลผล|backend)|โมเดล[^"'`]{0,20}จะโหลดเมื่อ|จะโหลดเมื่อเปิดกล้อง/i;
  const bad = [];
  for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith(".js"))) {
    const s = read(f).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of s.matchAll(new RegExp(READY_BACKEND.source, "gi"))) bad.push(f + ": " + s.slice(Math.max(0, m.index - 50), m.index + 50).replace(/\s+/g, " "));
  }
  assert.deepEqual(bad, []);
});

test("B1: the team face-reading menu entry has no 'for entertainment' (nav.js, i18n/{en,zh}-common.js) and says it is not an assessment", () => {
  const nav = read("nav.js").match(/href: "teamface\.html", title: "[^"]*", desc: "([^"]*)"/);
  assert.ok(nav, "nav.js teamface entry");
  assert.doesNotMatch(nav[1], BAN); assert.match(nav[1], /ไม่ใช่การประเมิน/);
  const want = { en: /not an assessment/i, zh: /并非评估|不是评估/ };
  for (const l of ["en", "zh"]) {
    const m = read(`i18n/${l}-common.js`).match(/"nav\.teamface\.desc":\s*("(?:[^"\\]|\\.)*")/);
    assert.ok(m, l + " nav.teamface.desc");
    const v = JSON.parse(m[1]);
    assert.doesNotMatch(v, BAN, l + ": " + v); assert.match(v, want[l], l + ": " + v);
  }
  // the generated landing page carries the same text
  assert.doesNotMatch(read("cat-hr.html").match(/data-i18n="nav\.teamface\.desc">([^<]*)</)[1], BAN);
});

test("B2: help.html fortune answer uses the final disclaimer in TH / EN / ZH and has no 'for entertainment'", () => {
  const h = read("help.html");
  for (const [id, l] of [["h-fortune", "th"], ["en-h-fortune", "en"], ["zh-h-fortune", "zh"]]) {
    const at = h.indexOf('id="' + id + '"');
    assert.ok(at > 0, id);
    const block = norm(h.slice(at, h.indexOf("</details>", at)));
    assert.ok(block.includes(NEW[l]), id + " has the final line: " + block.slice(0, 200));
    assert.doesNotMatch(block, BAN, id + ": " + block.slice(0, 200));
  }
});
