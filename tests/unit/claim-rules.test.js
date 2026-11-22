"use strict";
// tests/unit/claim-rules.test.js — Sellable pack (2026-11-11), inverted for owner decision 223: docs/claim-rules.json, applied by
// `node tools/accuracy-sync.mjs --check` (npm run accuracy:check). Hall mode and Crowd carry the same name and status
// everywhere, and no user-facing page, dictionary or one-pager uses a class of wording that claims more than was measured
// ("real-time detection", "detects cheating", "highly accurate", "how customers feel"). The second test proves that the
// check really fails on each class (fixture copy).
// Inverted for owner decision 226 (2026-11-22; invert, never loosen): every rule that required the label "รุ่นทดลอง" /
// "Trial version" / "试用版" now forbids it (mustSay "not", files rules with "not": true); the fixtures below re-insert the label
// and expect the rule to fail. Every limit rule is unchanged. crowd-not-soon is replaced by crowd-not-off / crowd-not-off-cat
// (no Crowd card carries data-lq-off); exam-hall, switched off, is not listed on cat-education.html (hall-cat-off).
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
    // status drift: hall name, Crowd limit on a card, the category listing and the nav entry. Owner decision 226 (was 223: the
    // badge words "รุ่นทดลอง" / "Trial version" / "试用版" were required): the label must NOT come back anywhere these rules look
    expectErr(edit("i18n/en-exam.js", "\"exam.hall.h1\": \"Exam hall camera\"", "\"exam.hall.h1\": \"Exam-room camera\""), /exam\.hall\.h1.*Exam hall camera/);
    const zhCrowd = (fs.readFileSync(path.join(tmp, "i18n/zh-common.js"), "utf8").match(/"nav\.crowd\.desc": "[^"]*"/) || [])[0];
    assert.ok(zhCrowd, "zh nav.crowd.desc");
    expectErr(edit("i18n/zh-common.js", zhCrowd, zhCrowd.replace(/"$/, "（试用版）\"")), /zh-common\.js \[nav\.crowd\.desc\]: must not say "试用版"/);
    expectErr(edit("i18n/zh-common.js", zhCrowd, "\"nav.crowd.desc\": \"区域人数、高峰时段、进出线与停留时长\""), /zh-common\.js \[nav\.crowd\.desc\]: must say "尚不适用于密集人群"/);
    expectErr(edit("cat-marketing.html", '<article class="pd-card cat-tool" data-page="crowd">', '<article class="pd-card cat-tool" data-page="crowd" data-status="trial">'), /rule crowd-cat-listed/);
    expectErr(edit("cat-marketing.html", '<article class="pd-card cat-tool" data-page="crowd">', '<article class="pd-card cat-tool" data-page="crowd" data-lq-off>'), /rule crowd-not-off-cat/);
    expectErr(edit("cat-education.html", "</main>", '<article class="pd-card cat-tool" data-page="exam-hall"><span class="cat-st hall" data-i18n="cat.b.hall">รุ่นทดลอง ยังไม่เปิดขาย</span></article></main>'), /rule hall-cat-off/);
    expectErr(edit("cat-education.html", "</main>", '<span class="cat-st trial" data-i18n="cat.b.trial">รุ่นทดลอง</span></main>'), /rule hall-cat-no-badge/);
    expectErr(edit("solutions.html", '<article class="sl-card" data-status="now" id="sol-e6">', '<article class="sl-card" data-lq-off data-status="now" id="sol-e6">'), /rule crowd-not-off/);
    expectErr(edit("solutions.html", "ในห้องสอบคอมพิวเตอร์ ไม่ตัดสินว่าทุจริต", "ในห้องสอบคอมพิวเตอร์ (รุ่นทดลอง) และห้องสอบที่มีกล้องรอบห้อง (รุ่นทดลอง ยังไม่เปิดขาย) ไม่ตัดสินว่าทุจริต"), /solutions\.html \[sl\.c\.edu1\.p\]: must not say "รุ่นทดลอง"/);
    expectErr(edit("i18n/en-solutions.js", "It is not yet suitable for dense crowds.", "(Trial version; not yet suitable for dense crowds.)"), /en-solutions\.js \[sl\.c\.\w+\.p\]: must not say "Trial version"/);
    expectErr(edit("nav.js", "(ยังไม่เหมาะกับฝูงชนหนาแน่น)", ""), /rule crowd-nav-js/);
    expectErr(edit("nav.js", "(ยังไม่เหมาะกับฝูงชนหนาแน่น)", "(รุ่นทดลอง ยังไม่เหมาะกับฝูงชนหนาแน่น)"), /rule crowd-nav-js-no-label/);
    expectErr(edit("nav.js", 'href: "exam-hall.html", title: "เครื่องกล้องในห้องสอบ", desc: "', 'href: "exam-hall.html", title: "เครื่องกล้องในห้องสอบ", desc: "(รุ่นทดลอง) '), /rule hall-nav-js-no-label/);
    expectErr(edit("i18n/en-crowd.js", "\"cr.h1\": \"Crowd counting & density\",", "\"cr.h1\": \"Crowd counting & density\",\n  \"cr.st.b\": \"Trial version\","), /rule crowd-badge-gone-en/);
    expectErr(edit("docs/ONE-PAGER-CROWD.md", "> **สำหรับอีเวนต์ ยังไม่เหมาะกับฝูงชนหนาแน่น**", "> **สถานะ: รุ่นทดลอง สำหรับอีเวนต์ ยังไม่เหมาะกับฝูงชนหนาแน่น**"), /rule crowd-onepager-no-label/);
    expectErr(edit("i18n/en-exam.js", "seen only in the front rows near the camera", "seen near the camera"), /exam\.l\.mA1\]: must say "front rows"/);
    // decision 223 (audit section 6 item 20): Crowd never says "preliminary"; the card limit line keeps the dense-crowd limit;
    // the owner's phone sentence stays on the exam pages; the examinee page never mentions the desk
    expectErr(edit("crowd.html", "ยังไม่เหมาะกับฝูงชนหนาแน่น</", "ยังไม่เหมาะกับฝูงชนหนาแน่น ตัวเลขเป็นผลเบื้องต้น</"), /rule crowd-no-prelim-th/);
    expectErr(edit("i18n/en-crowd.js", "\"cr.h1\": \"Crowd counting & density\"", "\"cr.h1\": \"Crowd counting & density (preliminary)\""), /rule crowd-no-prelim-en/);
    expectErr(edit("cat-marketing.html", "ยังไม่เหมาะกับฝูงชนหนาแน่น</span>", "เหมาะกับทุกงาน</span>"), /cat-marketing\.html \[ln\.crowd\.2\]: must say/);
    expectErr(edit("i18n/en-common.js", "A phone lying on the desk is usually missed", "Phones on the desk are found"), /en-common\.js \[ln\.exam\.2\]: must say/);
    expectErr(edit("exam-lab.html", "โทรศัพท์ที่อยู่ใกล้กล้อง", "โทรศัพท์บนโต๊ะหรือที่อยู่ใกล้กล้อง"), /rule examlab-no-desk/);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
