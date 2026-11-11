"use strict";
// tests/unit/claim-rules.test.js — Sellable pack (2026-11-11): docs/claim-rules.json, applied by
// `node tools/accuracy-sync.mjs --check` (npm run accuracy:check). Hall mode and Crowd carry the same name and status
// everywhere, and no user-facing page, dictionary or one-pager uses a class of wording that claims more than was measured
// ("real-time detection", "detects cheating", "highly accurate", "how customers feel"). The second test proves that the
// check really fails on each class (fixture copy).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const lib = () => import(path.join(root, "tools", "accuracy-sync.mjs"));

test("claim rules pass on the repository", async () => {
  const { checkClaims, RULES } = await lib();
  assert.ok(fs.existsSync(path.join(root, RULES)), RULES + " exists");
  assert.deepEqual(checkClaims(root), []);
});

test("the claim rules really fail on each class of overclaim and on a status that drifts (fixture copy)", async () => {
  const { checkClaims, RULES } = await lib();
  const rules = JSON.parse(fs.readFileSync(path.join(root, RULES), "utf8"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lq-claims-"));
  try {
    const files = new Set([RULES, "nav.js", "exam-dashboard.js"]);
    for (const r of rules.mustSay) { r.html.forEach(f => files.add(f)); files.add(`i18n/en-${r.dict}.js`); files.add(`i18n/zh-${r.dict}.js`); }
    for (const f of rules.files) files.add(f.file);
    for (const rel of files) { const dst = path.join(tmp, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(path.join(root, rel), dst); }
    assert.deepEqual(checkClaims(tmp), [], "fixture starts clean");
    const edit = (rel, from, to) => {
      const p = path.join(tmp, rel), s = fs.readFileSync(p, "utf8");
      assert.ok(s.includes(from), rel + ": " + from); fs.writeFileSync(p, s.replace(from, to));
      return () => fs.writeFileSync(p, s);
    };
    const expectErr = (undo, re) => { assert.ok(checkClaims(tmp).some(e => re.test(e)), String(re)); undo(); assert.deepEqual(checkClaims(tmp), []); };
    // overclaim classes, in all three languages
    expectErr(edit("i18n/en-driver.js", "An extra awareness aid", "Real-time detection, an extra awareness aid"), /overclaim \[realtime-en\]/);
    expectErr(edit("driver.html", "เครื่องช่วยเตือนเสริม", "ตรวจจับแบบเรียลไทม์ เครื่องช่วยเตือนเสริม"), /driver\.html:\d+: overclaim \[realtime-th\]/);
    expectErr(edit("i18n/zh-driver.js", "物流车队", "实时检测物流车队"), /overclaim \[realtime-zh\]/);
    expectErr(edit("i18n/en-solutions.js", "Tells invigilators", "Detects cheating and tells invigilators"), /overclaim \[cheating-en\]/);
    expectErr(edit("solutions.html", "บอกกรรมการว่า", "ตรวจจับการทุจริต บอกกรรมการว่า"), /overclaim \[cheating-th\]/);
    expectErr(edit("i18n/zh-solutions.js", "提示监考员", "检测作弊，提示监考员"), /overclaim \[cheating-zh\]/);
    expectErr(edit("i18n/en-common.js", "See results while the camera runs", "Highly accurate results while the camera runs"), /overclaim \[superlative-en\]/);
    expectErr(edit("i18n/en-common.js", "See what customers look at", "Learn how customers feel, what they look at"), /overclaim \[feelings-en\]/);
    // status drift: hall name, Crowd status on a card, the category status and the nav entry
    expectErr(edit("i18n/en-exam.js", "\"exam.hall.h1\": \"Exam hall camera\"", "\"exam.hall.h1\": \"Exam-room camera\""), /exam\.hall\.h1.*Exam hall camera/);
    expectErr(edit("i18n/zh-common.js", "\"nav.crowd.desc\": \"活动现场的区域人数、高峰时段、进出线与停留时长（实验性，尚不适用于密集人群）\"",
      "\"nav.crowd.desc\": \"区域人数、高峰时段、进出线与停留时长\""), /zh-common\.js \[nav\.crowd\.desc\]: must say "实验性"/);
    expectErr(edit("cat-marketing.html", 'data-page="crowd" data-status="experimental"', 'data-page="crowd" data-status="pilot-ready"'), /rule crowd-cat-status/);
    expectErr(edit("solutions.html", 'data-status="pilot" id="sol-e6"', 'data-status="now" id="sol-e6"'), /rule crowd-not-available-now/);
    expectErr(edit("nav.js", "(ทดลอง ยังไม่เหมาะกับฝูงชนหนาแน่น)", ""), /rule crowd-nav-js/);
    expectErr(edit("i18n/en-exam.js", "(front rows near the camera only", "(near the camera"), /exam\.l\.mA1\]: must say "front rows"/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
