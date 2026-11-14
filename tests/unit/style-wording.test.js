"use strict";
// tests/unit/style-wording.test.js — Style MVP wording rules (docs/STYLE-DESIGN.md §1.5, §6). FIXED TEST: hash-locked in
// evals-locks/style-mvp.sha256 BEFORE the Style page, its dictionaries and content were written. The banned list below is
// the design's §6.2 list (owner-only); it is kept HERE, in the locked test, so it cannot be loosened with the product.
// Scans: i18n/en-style.js, i18n/zh-style.js, style.html, style.js, lensiq-style.js, vendor/style/content.json
// (JS block comments and // comment lines are not user-facing and are skipped).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const FILES = ["i18n/en-style.js", "i18n/zh-style.js", "style.html", "style.js", "lensiq-style.js", "vendor/style/content.json"];
const uncomment = (f, s) => (/\.js$/.test(f) ? s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ") : s.replace(/<!--[\s\S]*?-->/g, " "));

const BANNED_TH = ["สวย", "หน้าตาดี", "ดูดี", "เสริมความงาม", "คะแนนความงาม", "ผิวขาว", "ผิวคล้ำ", "ผิวดำ", "ผิวเหลือง", "ผิวดูสว่าง", "หน้าใส",
  "ทำให้ดูขาวขึ้น", "หน้าหมอง", "ผอม", "อ้วน", "หุ่นดี", "ดูเพรียว", "พรางหุ่น", "ดูแก่", "ดูเด็ก", "อ่อนกว่าวัย", "เชื้อชาติ", "ผิวแบบคนเอเชีย",
  "ผิวแบบฝรั่ง", "ผิวแบบแขก", "ผิวสี", "กาลกิณี", "สีอัปมงคล", "ห้ามใส่"];
const BANNED_EN = ["beautiful", "pretty", "ugly", "attractive", "flattering", "beauty score", "fair skin", "dark skin", "light-skinned",
  "whitening", "brightening", "makes you look lighter", "dull skin", "slim", "slimming", "fat", "figure-flattering", "hide your figure",
  "look older", "look younger", "youthful", "ethnicity", "race", "asian skin", "caucasian", "skin of colour", "skin of color",
  "unlucky colour", "unlucky color", "never wear"];
const BANNED_ZH = ["美", "丑", "颜值", "好看", "变美", "白皙", "皮肤黑", "黄皮", "显白", "提亮肤色", "显黑", "暗沉", "显瘦", "胖", "身材好", "遮肉",
  "显老", "显年轻", "减龄", "种族", "亚洲人肤色", "白人", "有色人种", "不吉利的颜色", "忌穿"];
// skin-tone category scales and colourism wording that must never be output either (§1.5 rule 2)
const BANNED_SCALES = [/fitzpatrick/i, /\bmonk\b/i, /\bITA\b/, /\bvery light\b/i, /\btan\b/i];

function dict(file) {
  const w = {}; w.window = w;
  vm.runInNewContext(read(file), w, { filename: file });
  const out = {};
  for (const e of w.LQI18N_Q || []) for (const l of Object.keys(e)) Object.assign(out, e[l]);
  return out;
}

test("every Style source file exists", () => { for (const f of FILES) assert.ok(fs.existsSync(path.join(ROOT, f)), f); });

test("no banned looks / skin-lightness / body / age / ethnicity / fortune wording in TH, EN or ZH (design §6.2)", () => {
  const bad = [];
  for (const f of FILES) {
    const s = uncomment(f, read(f));
    for (const w of BANNED_TH) if (s.includes(w)) bad.push(`${f}: TH "${w}"`);
    for (const w of BANNED_ZH) if (s.includes(w)) bad.push(`${f}: ZH "${w}"`);
    for (const w of BANNED_EN) if (new RegExp("(^|[^A-Za-z])" + w.replace(/[-]/g, "\\-") + "([^A-Za-z]|$)", "i").test(s)) bad.push(`${f}: EN "${w}"`);
    for (const re of BANNED_SCALES) if (re.test(s)) bad.push(`${f}: scale ${re}`);
  }
  assert.deepEqual(bad, []);
});

test("preferred phrases (design §6.3) exist in all three languages: disclaimer, unsure, away-from-face, start notice", () => {
  const en = dict("i18n/en-style.js"), zh = dict("i18n/zh-style.js"), th = read("style.html") + read("style.js");
  const enV = Object.values(en).join("\n"), zhV = Object.values(zh).join("\n");
  assert.ok(th.includes("ระบบซีซันสีเป็นความชอบเชิงอัตวิสัย ผลนี้เป็นคำแนะนำด้านสี ไม่ใช่การประเมินตัวคุณ"), "TH disclaimer");
  assert.ok(enV.includes("Colour seasons are a matter of taste. This is a colour suggestion, not an assessment of you."), "EN disclaimer");
  assert.ok(zhV.includes("色彩季型属于主观偏好。本结果仅为配色建议，并非对您本人的评价。"), "ZH disclaimer");
  assert.ok(th.includes("ยังสรุปไม่ได้ ลองใหม่ใต้แสงธรรมชาติ"), "TH unsure");
  assert.ok(/not sure yet: try again in daylight/i.test(enV), "EN unsure");
  assert.ok(zhV.includes("暂无法判断，请在自然光下重试"), "ZH unsure");
  assert.ok(th.includes("สีที่ใช้ห่างจากใบหน้าได้ดี"), "TH away");
  assert.ok(/colours that work best away from the face/i.test(enV), "EN away");
  assert.ok(zhV.includes("适合用在远离脸部位置的颜色"), "ZH away");
  assert.ok(th.includes("วิเคราะห์สี ไม่ใช่หน้าตา"), "TH start notice");
  assert.ok(/colours?, not (your )?looks/i.test(enV), "EN start notice");
  assert.ok(zhV.includes("分析的是颜色，不是长相"), "ZH start notice");
  // dictionaries mirror each other
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), "en-style / zh-style key sets");
});

test("no emotion, age, gender or face-parsing model on the Style page in any build (design §1.5 rules 4-5, §3.5)", () => {
  for (const f of ["style.html", "style.js", "lensiq-style.js"]) {
    const s = read(f);
    const RESEARCH = /face-api|faceapi|ageGender|age_gender|faceExpression|face_expression|expression model|faceparse|bisenet|loadParsing|faceParse|tiny_face|face_landmark_68/i;
    assert.ok(!RESEARCH.test(s), f + " loads no face-api / BiSeNet model");
    assert.ok(!/outputFaceBlendshapes\s*:\s*true/.test(s), f + " blendshapes never on");
    assert.ok(!/LENSIQ_AGE_GENDER|LENSIQ_EXPRESSION|LENSIQ_FACEPARSE/.test(s), f + " does not read the research-model switches");
  }
  const js = read("style.js");
  if (/FaceLandmarker/.test(js)) assert.match(js, /outputFaceBlendshapes\s*:\s*false/, "Face Landmarker created with blendshapes off");
  // no product, cosmetic or shade recommendation and no gender filter (§1.5 rules 5, 7)
  for (const f of FILES) assert.ok(!/foundation shade|รองพื้นเบอร์|粉底色号|\bgender\b|เพศ|性别/i.test(uncomment(f, read(f))), f + " no product / gender wording");
});

test("analytics carry no colour result: the page sends only style_start / style_complete (design §5)", () => {
  const js = read("style.js");
  const events = [...js.matchAll(/track\(\s*["']([a-z_]+)["']/g)].map(m => m[1]);
  for (const e of events) assert.ok(["style_start", "style_complete"].includes(e), "event " + e);
  assert.ok(!/track\([^)]*(season|undertone|band|hex|swatch|lab)/i.test(js), "no result in an analytics call");
  assert.ok(!/fetch\([^)]*(POST|method)/i.test(js) && !/sendBeacon/.test(js) && !/XMLHttpRequest/.test(js), "style.js sends nothing");
});
