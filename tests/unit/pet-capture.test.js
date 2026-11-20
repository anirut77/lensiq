"use strict";
// tests/unit/pet-capture.test.js — FIXED TEST SET for the pet capture guide and the required / optional field markers (owner's
// full pet-reading scope, relayed 2026-11-19, items 1 and 2; branch pet-zodiac-cards). Locked (evals-locks/pet-zodiac.sha256)
// BEFORE the product code for these items. Browser half: tests/e2e/pet-capture.e2e.mjs.
//   U1  guide frame: petread.html has a pet-shaped guide (#petGuide, decorative, hidden by default) over the camera picture in
//       #petStage, and a hint (#petGuideHint) with an i18n key; EN / ZH entries present, no Thai in them; the hint says to fit the
//       pet inside the frame (TH กรอบ / EN frame / ZH 框)
//   U2  camera only on tap: getUserMedia appears once in petread.js, inside camOn; camOn is wired to the camera button only
//   U3  markers: i18n keys for "required" and "optional" (TH / EN / ZH); the existing optional labels (photo, name, pet birth
//       date, owner birth date) still say optional in all three languages; the reading code needs only the species
//   U4  everything new is behind LENSIQ_PET_ZODIAC: the guide and the markers are switched on in petread.js only under zMode()
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const THAI = /[฀-๿]/;
const dict = l => { const W = { LQI18N_Q: [] }; vm.runInNewContext(read(`i18n/${l}-petread.js`), { window: W }); return Object.assign({}, ...W.LQI18N_Q.map(o => o[l])); };
const OPT = { th: /ไม่บังคับ/, en: /optional/i, zh: /可选|选填/ };
const REQ = { th: /จำเป็น|ต้องเลือก/, en: /required/i, zh: /必填|必选/ };

test("U1 guide frame over the camera picture, hint with i18n in TH / EN / ZH", () => {
  const h = read("petread.html"), en = dict("en"), zh = dict("zh");
  const stage = h.match(/<div class="pet-stage" id="petStage">[\s\S]*?<\/div>\s*<p class="hint" id="petCamMsg"/);
  assert.ok(stage, "#petStage block");
  const g = stage[0].match(/<[^>]*id="petGuide"[^>]*>/);
  assert.ok(g, "#petGuide inside #petStage");
  assert.match(g[0], /aria-hidden="true"/); assert.match(g[0], /\bhidden\b/);
  const hint = h.match(/<[^>]*id="petGuideHint"[^>]*data-i18n="([^"]+)"[^>]*>([^<]*)</) || h.match(/<[^>]*data-i18n="([^"]+)"[^>]*id="petGuideHint"[^>]*>([^<]*)</);
  assert.ok(hint, "#petGuideHint with data-i18n");
  assert.match(hint[2], /กรอบ/, "Thai hint mentions the frame");
  assert.ok(en[hint[1]] && /frame/i.test(en[hint[1]]) && !THAI.test(en[hint[1]]), "EN hint");
  assert.ok(zh[hint[1]] && /框/.test(zh[hint[1]]) && !THAI.test(zh[hint[1]]), "ZH hint");
});

test("U2 camera only on tap: one getUserMedia, inside camOn, wired to the camera button", () => {
  const s = read("petread.js");
  assert.equal((s.match(/getUserMedia\s*\(/g) || []).length, 1, "one getUserMedia call");
  const fn = s.match(/async function camOn\(\)\s*\{[\s\S]*?\n {2}\}/);
  assert.ok(fn && /getUserMedia\s*\(/.test(fn[0]), "getUserMedia inside camOn");
  assert.match(s, /\$\("#petCamOn"\)\.addEventListener\("click", camOn\)/);
  assert.equal((s.match(/(?<!function )\bcamOn\(\)/g) || []).length, 0, "camOn is never called directly");
});

test("U3 required / optional markers: keys in TH / EN / ZH; optional labels kept; only the species is needed", () => {
  const s = read("petread.js"), en = dict("en"), zh = dict("zh"), h = read("petread.html");
  const req = s.match(/T\(\s*"(pet\.z\.req)"\s*,\s*"([^"]+)"/), opt = s.match(/T\(\s*"(pet\.z\.opt)"\s*,\s*"([^"]+)"/);
  assert.ok(req && REQ.th.test(req[2]), "Thai required marker");
  assert.ok(opt && OPT.th.test(opt[2]), "Thai optional marker");
  assert.ok(REQ.en.test(en["pet.z.req"] || "") && REQ.zh.test(zh["pet.z.req"] || ""), "EN / ZH required");
  assert.ok(OPT.en.test(en["pet.z.opt"] || "") && OPT.zh.test(zh["pet.z.opt"] || ""), "EN / ZH optional");
  for (const k of ["pet.photoH", "pet.nameL", "pet.birthL", "pet.ownerL"]) {
    const th = h.match(new RegExp(`data-i18n="${k.replace(/\./g, "\\.")}">([^<]*)<`));
    assert.ok(th && OPT.th.test(th[1]), k + " TH says optional");
    assert.ok(OPT.en.test(en[k]) && OPT.zh.test(zh[k]), k + " EN / ZH say optional");
  }
  // the code: the only check before a reading is the species
  const rd = s.match(/function read\(quiet\)\s*\{[\s\S]*?\n {2}\}/)[0];
  assert.match(rd, /if \(!checked\("petSpecies"\)\)/);
  assert.doesNotMatch(rd, /petName"\)\.value\s*\)\s*\{|!\$\("#petBirth"\)\.value|!st\.img\b/, "no other required field");
});

test("U4 the guide and the markers are switched on only in zodiac mode (LENSIQ_PET_ZODIAC)", () => {
  const s = read("petread.js");
  assert.match(s, /function (?:showGuide|guideOn)\b[\s\S]{0,400}zMode\(\)/, "guide behind zMode()");
  assert.match(s, /pet\.z\.req[\s\S]{0,40}|zMode\(\)[\s\S]{0,600}pet\.z\.req/, "markers code present");
  const mk = s.match(/function markFields\b[\s\S]*?\n {2}\}/);
  assert.ok(mk && /zMode\(\)/.test(mk[0]), "markFields checks zMode()");
});
