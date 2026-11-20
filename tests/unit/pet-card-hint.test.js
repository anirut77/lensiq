"use strict";
// tests/unit/pet-card-hint.test.js — FIXED TEST SET, owner decision 198 (2026-11-20). Node half of tests/e2e/pet-card-hint.e2e.mjs.
// While the QR option is hidden (LENSIQ_CARD_SHOW_ADDRESS false) the hint under the pet card options says the option is off by
// default and the photo is made on this device and never sent (no QR mention). The old two-option text moves to a second key
// (pet.photoOnHintQr) and returns when the switch is on. Locked (evals-locks/pet-card-address.sha256, folder relock-2/) BEFORE
// the product change.
//   K1  petread.html: the hint's default (Thai) text is the exact new text, key pet.photoOnHint, no "QR" in it
//   K2  i18n/en-petread.js and i18n/zh-petread.js: pet.photoOnHint = the exact new text, no "QR" / "二维码"
//   K3  pet.photoOnHintQr holds the old two-option text in EN and ZH (the files) and TH (the Thai fallback in petread.js)
//   K4  petread.js picks the key by the switch: pet.photoOnHintQr is used under the address switch (addrOn), pet.photoOnHint otherwise
//   K5  petread.html loads the changed files with a bumped ?v= (petread.js, zh-petread.js; the en dictionary is lazy-loaded)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const NEW = {
  th: "ตัวเลือกนี้ปิดไว้ก่อน รูปสร้างในเครื่อง ไม่ถูกส่งออกไปที่ใด",
  en: "This is off by default. The photo is made on this device and never sent.",
  zh: "此项默认关闭。照片在本设备生成，不会被发送。",
};
const OLD = {
  th: "ทั้งสองข้อปิดไว้ก่อน รูปและ QR สร้างในเครื่อง ไม่ถูกส่งออก",
  en: "Both are off by default. The photo and the QR code are made on this device and never sent.",
  zh: "两项默认关闭。照片和二维码都在本设备生成，不会被发送。",
};
const NOQR = /qr|二维码|二維碼/i;
const entry = (f, key) => {
  const m = new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:\\s*"([^"]*)"`).exec(read(f));
  return m ? m[1] : null;
};

test("K1 petread.html: the hint default (Thai) is the exact new text under pet.photoOnHint, no QR", () => {
  const m = /<p[^>]*data-i18n="pet\.photoOnHint"[^>]*>([^<]*)<\/p>/.exec(read("petread.html"));
  assert.ok(m, "the hint paragraph with data-i18n=pet.photoOnHint exists");
  assert.equal(m[1].trim(), NEW.th);
  assert.ok(!NOQR.test(m[1]), "no QR in the Thai default");
});

test("K2 en / zh dictionaries: pet.photoOnHint is the exact new text, no QR", () => {
  for (const [l, f] of [["en", "i18n/en-petread.js"], ["zh", "i18n/zh-petread.js"]]) {
    const v = entry(f, "pet.photoOnHint");
    assert.equal(v, NEW[l], l);
    assert.ok(!NOQR.test(v), l + ": no QR");
  }
});

test("K3 pet.photoOnHintQr holds the old two-option text (EN, ZH files; TH fallback in petread.js)", () => {
  assert.equal(entry("i18n/en-petread.js", "pet.photoOnHintQr"), OLD.en);
  assert.equal(entry("i18n/zh-petread.js", "pet.photoOnHintQr"), OLD.zh);
  const js = read("petread.js");
  assert.ok(js.includes("pet.photoOnHintQr") && js.includes(OLD.th), "petread.js carries the Thai old text under pet.photoOnHintQr");
});

test("K4 petread.js chooses the key by the address switch", () => {
  const js = read("petread.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const i = js.indexOf("pet.photoOnHintQr");
  assert.ok(i > 0, "the Qr key is used");
  const around = js.slice(Math.max(0, i - 400), i + 400);
  assert.match(around, /addrOn\(\)/, "the choice depends on addrOn()");
});

test("K5 petread.html: bumped ?v= for the changed scripts", () => {
  const html = read("petread.html");
  const v = re => { const m = re.exec(html); return m ? Number(m[1]) : null; };
  assert.ok(v(/petread\.js\?v=(\d+)/) >= 5, "petread.js ?v= >= 5 (was 4)");
  assert.ok(v(/zh-petread\.js\?v=(\d+)/) >= 2, "zh-petread.js ?v= >= 2 (was 1)");
});
