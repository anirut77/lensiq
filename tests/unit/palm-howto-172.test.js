"use strict";
// tests/unit/palm-howto-172.test.js — owner decision 180 ก (2026-11-20): the live palm page (palm.html with LENSIQ_PALM_V2 off)
// shows the approved capture advice of item 172 in palm.howTo, letter for letter, and gives no flashlight / torch advice.
// Locked BEFORE the product change (phase palm-honesty, relock3). Text checks only; no image of any kind.
//   K1  palm.howTo is exactly the approved 172 text: TH in palm.html (the element that shows it), EN and ZH in the palm
//       dictionaries; palm.js never overrides palm.howTo with other text
//   K2  no flashlight / torch advice anywhere on palm.html, in the palm i18n files (en/zh fortune-palm, en/zh kb-palm) or in
//       the Thai texts palm.js shows on palm.html. The on/off control itself (keys palm.cam.torch / palm.cam.torchAria: the
//       button label) is a control, not advice, and stays (features are never removed)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const read = (/** @type {string} */ f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const HOWTO = {
  th: "ถ่ายข้างหน้าต่างให้แสงส่องฝ่ามือจากด้านข้าง ไม่ใช่จากด้านหน้า ปิดแฟลช (ตั้งเป็น 'ปิด' ไม่ใช่ 'อัตโนมัติ') ปล่อยมือสบาย ๆ งุ้มเล็กน้อย ไม่ต้องเหยียดตึง และให้เห็นทั้งฝ่ามือและนิ้วอยู่ในกรอบ",
  en: "Stand beside a window so the light falls across your palm from the side, not from the front. " +
    "Turn the flash off (set it to 'off', not 'auto'). " +
    "Keep your hand relaxed and slightly cupped, not stretched flat, with the whole palm and fingers inside the frame.",
  zh: "站在窗边，让光线从侧面照到手掌，而不是从正面。关闭闪光灯（设为“关闭”，不要用“自动”）。手放松、略微弯曲，不要用力伸平，并让整个手掌和手指都在画面内。"
};
const TORCH = /ไฟฉาย|flash-?light|torch|手电/i;
const CONTROL_KEYS = ["palm.cam.torch", "palm.cam.torchAria"];

/** decode the few entities palm.html uses in text */
function decode(/** @type {string} */ s) {
  return s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

test("K1 (decision 180 ก): palm.howTo is exactly the approved 172 text in TH / EN / ZH", () => {
  const html = read("palm.html");
  const els = [...html.matchAll(/<([a-z0-9]+)\b[^>]*\bdata-i18n="palm\.howTo"[^>]*>([\s\S]*?)<\/\1>/g)];
  assert.ok(els.length >= 1, "no element shows palm.howTo on palm.html");
  for (const m of els) assert.equal(decode(m[2]).replace(/\s+/g, " ").trim(), HOWTO.th, "TH palm.howTo on palm.html");
  const EN = require(path.join(ROOT, "i18n", "en-fortune-palm.js")).en;
  const ZH = require(path.join(ROOT, "i18n", "zh-fortune-palm.js")).zh;
  assert.equal(EN["palm.howTo"], HOWTO.en, "EN palm.howTo");
  assert.equal(ZH["palm.howTo"], HOWTO.zh, "ZH palm.howTo");
  assert.doesNotMatch(read("palm.js"), /["']palm\.howTo["']/, "palm.js sets palm.howTo itself");
});

test("K2 (decision 180 ก): no flashlight / torch advice on palm.html, in the palm i18n files or in palm.js texts", () => {
  const bad = [];
  // palm.html: everything a user can see or hear (text and attributes), scripts / styles / comments removed
  const keepLines = (/** @type {string} */ m) => m.replace(/[^\n]/g, ""); // line numbers in messages stay those of the file
  const html = read("palm.html").replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, keepLines);
  html.split("\n").forEach((l, i) => { if (TORCH.test(decode(l))) bad.push("palm.html:" + (i + 1) + ": " + l.trim()); });
  // palm i18n: every line naming a flashlight must be the on/off control's own label
  for (const f of ["i18n/en-fortune-palm.js", "i18n/zh-fortune-palm.js", "i18n/en-kb-palm.js", "i18n/zh-kb-palm.js"]) {
    read(f).split("\n").forEach((l, i) => {
      if (/^\s*(\/\/|\/\*|\*)/.test(l) || !TORCH.test(l)) return;
      const key = (/^\s*["']([\w.]+)["']\s*:/.exec(l) || [])[1];
      if (!key || CONTROL_KEYS.indexOf(key) < 0) bad.push(f + ":" + (i + 1) + ": " + l.trim());
    });
  }
  // palm.js: the Thai default of every ("palm.key", "text") pair — T() calls and tip arrays alike
  for (const m of read("palm.js").matchAll(/["'](palm\.[\w.]+)["']\s*,\s*"((?:[^"\\]|\\.)*)"/g)) {
    if (TORCH.test(m[2]) && CONTROL_KEYS.indexOf(m[1]) < 0) bad.push("palm.js " + m[1] + ": " + m[2]);
  }
  assert.deepEqual(bad, [], "flashlight / torch advice found:\n" + bad.join("\n"));
});
