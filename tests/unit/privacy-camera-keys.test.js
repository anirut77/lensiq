"use strict";
// tests/unit/privacy-camera-keys.test.js — owner decision 2026-11-14: privacy.html names the two device-only camera keys
// (lq-heavy, lq-camcap) in TH / EN / ZH, with what the code really does. Written BEFORE the privacy.html change.
// Behaviour is read from lensiq-crashguard.js and lensiq-camera.js, so the page cannot drift from the code.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const html = read("privacy.html");
const row = id => { const m = html.match(new RegExp(`<tr id="${id}">[\\s\\S]*?</tr>`)); return m ? m[0] : null; };
const plain = s => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("code facts the rows rely on", () => {
  const guard = read("lensiq-crashguard.js"), cam = read("lensiq-camera.js");
  assert.match(guard, /const KEY = "lq-heavy";/);
  assert.match(guard, /st\.setItem\(KEY, "1"\)/);
  assert.match(read("lensiq-camera.js"), /const CAP_KEY = "lq-camcap";/);
  assert.match(cam, /const CAP_TTL_MS = 7 \* 864e5;/);
  // sessionStorage for the guard, localStorage for the capacity (the wiring)
  assert.match(cam, /LQCrashGuard/);
  assert.match(guard, /storage = root\.sessionStorage/);
  assert.match(cam, /return hasDOM \? localStorage : null/);
  assert.match(cam, /capacity = LS \? writeCapacity\(LS,/);
});

for (const [lang, prefix] of [["th", ""], ["en", "en-"], ["zh", "zh-"]]) {
  test(`privacy.html ${lang}: lq-heavy row (this tab only, cleared when the tab closes, no personal data)`, () => {
    const r = row(`${prefix}p9-heavy`);
    assert.ok(r, "row exists");
    assert.match(r, /<code>lq-heavy<\/code>/);
    assert.match(r, /sessionStorage/);
    const t = plain(r);
    const must = { th: [/แท็บ/, /ปิดแท็บ/, /ไม่มีข้อมูลส่วนบุคคล/], en: [/this tab/i, /closed|closes/, /no personal data/i], zh: [/此标签页/, /关闭/, /不含个人数据/] }[lang];
    for (const re of must) assert.match(t, re);
    assert.doesNotMatch(r, /localStorage/);
  });
  test(`privacy.html ${lang}: lq-camcap row (camera settings, kept 7 days, no personal data)`, () => {
    const r = row(`${prefix}p9-camcap`);
    assert.ok(r, "row exists");
    assert.match(r, /<code>lq-camcap<\/code>/);
    assert.match(r, /localStorage/);
    const t = plain(r);
    const must = { th: [/7 วัน/, /กล้อง/, /ไม่มีข้อมูลส่วนบุคคล/], en: [/7 days/, /camera/i, /no personal data/i], zh: [/7 天/, /摄像头/, /不含个人数据/] }[lang];
    for (const re of must) assert.match(t, re);
  });
}

test("PDPA notes section H records the real behaviour and the privacy page change", () => {
  const n = read("docs/PDPA-NOTES-FOR-COUNSEL.md");
  const h = n.slice(n.indexOf("## H. Camera pages"), n.indexOf("## I. Accounts and billing groundwork"));
  assert.doesNotMatch(h, /privacy\.html` is not changed yet/);
  assert.match(h, /2026-11-14/);
  assert.match(h, /p9-heavy/);
  assert.match(h, /p9-camcap/);
});
