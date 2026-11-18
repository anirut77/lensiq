"use strict";
// tests/unit/style-s4-wording.test.js — Style S4 wording rules in TH / EN / ZH (CLAUDE.md standing rules; docs/STYLE-DESIGN.md
// §1.5). FIXED TEST: hash-locked in evals-locks/style-s4.sha256 BEFORE style.html, style.js and i18n/*-style.js were written.
// Colours are scored against colours only: no beauty or body words, no procedure advice, no negative lucky-colour wording,
// the lucky-colour link carries the belief label, the look suggestions are for adults only, every string in three languages.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
function dict(f) {
  const win = { LQI18N_Q: [] };
  vm.runInNewContext(read(f), { window: win });
  const out = {};
  for (const e of win.LQI18N_Q) for (const lang of Object.keys(e)) Object.assign(out, e[lang]);
  return out;
}
const EN = dict("i18n/en-style.js"), ZH = dict("i18n/zh-style.js");
const HTML = read("style.html"), JS = read("style.js");

// Thai defaults: data-i18n element text in the HTML and T("key", "ไทย") in style.js
function thaiDefaults() {
  const th = {};
  for (const m of HTML.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) th[m[1]] = m[2].trim();
  for (const m of JS.matchAll(/\bT\(\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"/g)) th[m[1]] = m[2];
  for (const m of JS.matchAll(/\bT\(\s*`([^`]+)`\s*,\s*"((?:[^"\\]|\\.)*)"/g)) th[m[1]] = m[2];
  return th;
}
const TH = thaiDefaults();
const usedKeys = () => {
  const k = new Set();
  for (const m of HTML.matchAll(/data-i18n="([^"]+)"/g)) k.add(m[1]);
  for (const m of HTML.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const part of m[1].split(";")) k.add(part.split(":")[1]);
  for (const m of JS.matchAll(/\bT\(\s*"([^"]+)"/g)) k.add(m[1]);
  return k;
};

test("every key used by the page exists in English and Chinese, with the same key set in both files", () => {
  assert.deepEqual(Object.keys(EN).sort(), Object.keys(ZH).sort(), "en / zh key sets");
  const missing = [...usedKeys()].filter(k => !(k in EN) || !(k in ZH));
  assert.deepEqual(missing, [], "keys missing in en or zh");
  for (const [k, v] of Object.entries(EN)) { assert.ok(String(v).trim(), "empty en " + k); assert.doesNotMatch(v, /[฀-๿]/, "Thai in en " + k); }
  for (const [k, v] of Object.entries(ZH)) { assert.ok(String(v).trim(), "empty zh " + k); assert.match(v, /[一-鿿]/, "zh text " + k); assert.doesNotMatch(v, /[฀-๿]/, "Thai in zh " + k); }
  for (const k of usedKeys()) if (!/^sty\.(title|metaDesc)$/.test(k)) assert.ok(TH[k] && /[฀-๿]/.test(TH[k]), "Thai default for " + k);
});

const ALL = () => [HTML, JS, read("lensiq-outfit.js"), ...Object.values(EN), ...Object.values(ZH)].join("\n");

test("no beauty, body or skin-lightening words; the only number is colour harmony", () => {
  const bad = /สวย|หล่อ|น่าเกลียด|ขี้เหร่|ผิวขาว|ขาวขึ้น|หน้าใส|ผอม|อ้วน|หุ่น|attractive|beautiful|pretty|ugly|beauty score|slim|\bfat\b|whiten|brighten|flatter|颜值|美白|显白|丑|瘦|胖|漂亮/i;
  const m = ALL().match(bad);
  assert.equal(m, null, "found: " + (m && m[0]));
  assert.match(HTML + JS, /คะแนนความกลมกลืนของสี/);
  assert.ok(Object.values(EN).some(v => /colour harmony score/i.test(v)), "en label");
  assert.ok(Object.values(ZH).some(v => /色彩协调度/.test(v)), "zh label");
});

test("no procedure, dye-chemical or product advice (reversible styling only)", () => {
  const bad = /สักคิ้ว|สัก|microblad|tattoo|ฉีด|inject|filler|botox|laser|เลเซอร์|ศัลย|surgery|thread lift|ร้อยไหม|ฟอกสีผม|bleach|纹|注射|激光|手术|漂发|ยี่ห้อ|brand|购买|ซื้อ|buy now|price|ราคา|价格/i;
  const m = ALL().match(bad);
  assert.equal(m, null, "found: " + (m && m[0]));
});

test("lucky-colour link: belief label in TH / EN / ZH, positive wording only", () => {
  assert.match(HTML + JS, /ตามความเชื่อ โปรดใช้วิจารณญาณ/);
  assert.ok(Object.values(EN).some(v => /according to belief, please use your own judgement/i.test(v)), "en belief label");
  assert.ok(Object.values(ZH).some(v => /依据信仰，请自行判断/.test(v)), "zh belief label");
  const neg = /กาลกิณี|อัปมงคล|ห้ามใส่|โชคร้าย|ซวย|\bavoid\b|bad luck|unlucky|misfortune|忌|不吉|倒霉|厄运/i;
  const m = ALL().match(neg);
  assert.equal(m, null, "found: " + (m && m[0]));
});

test("look suggestions and hair colour are behind an adults-only confirmation that is not stored", () => {
  assert.match(HTML, /id="styAdult"/);
  assert.match(HTML, /<section[^>]*id="styLook"[^>]*hidden/);
  assert.match(TH["sty.look.adult"] || "", /18/);
  assert.match(EN["sty.look.adult"] || "", /18/);
  assert.match(ZH["sty.look.adult"] || "", /18/);
  assert.doesNotMatch(JS, /localStorage|sessionStorage/, "the confirmation lives in memory only");
});

test("privacy and claims lines on the page in TH / EN / ZH", () => {
  for (const k of ["sty.notice", "sty.acc"]) { assert.ok(TH[k], k); assert.ok(EN[k], k); assert.ok(ZH[k], k); }
  assert.match(TH["sty.notice"], /ในเครื่อง/); assert.match(TH["sty.notice"], /ไม่เก็บภาพ/);
  assert.match(EN["sty.notice"], /on this device/i); assert.match(EN["sty.notice"], /no photos? (are )?(kept|stored)/i);
  assert.match(ZH["sty.notice"], /本机/); assert.match(ZH["sty.notice"], /不保存/);
  assert.match(TH["sty.acc"], /สังเคราะห์/); assert.match(EN["sty.acc"], /synthetic/i); assert.match(ZH["sty.acc"], /合成/);
});
