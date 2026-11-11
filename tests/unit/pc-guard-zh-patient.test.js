"use strict";
// tests/unit/pc-guard-zh-patient.test.js — FIXED TEST SET for the lensiq-pc-guard.js false-positive fix of 2026-11-12
// (fresh3 measurement: 11 Chinese indication / advert texts were read as dispensing labels). Written before the fix.
// Synthetic look-alikes only (no measured text). (1) 病人 ("patients") inside running text and "各大医院" (major hospitals)
// in advert prose are no name cue and no dispensing sign; (2) every field use of 病人 and every institution header still
// is: the personal data is removed and the text / photo stays blocked exactly as before.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../lensiq-pc-guard.js");

const PROSE = [
  "适用于治疗糖尿病病人的血糖控制，每日一次。",          // 病人 after a disease name
  "用于改善第二型糖尿病成人病人之血糖控制。",            // 成人病人之
  "治疗5-65岁病人因尘螨引起之过敏性鼻炎。",              // 岁病人因
  "治疗患有某某缺乏症(2型)病人。",                       // after a closing bracket
  "治療患有某某儲積症（第二型）病人。",                   // full-width bracket, traditional script
  "早期糖尿病人早用早见效，中期糖尿病人降低并发症",       // 糖尿病人
  "心脏病人，远离支架，健康长寿",
  "对雌激素受体阴性的病人，可考虑使用本品。",
  "北京某某、上海某某等各大医院临床验证，3个周期见效",   // a list of hospitals in advert prose
  "全国各大药店有售",
  "多家医院推荐使用",
  "知名医院专家研发，权威医院认可"
];

test("Chinese running text: 病人 inside a noun phrase and hospitals named in prose are no dispensing sign and remove nothing", () => {
  for (const t of PROSE) {
    assert.equal(G.isDispensingLabel(t), false, t);
    assert.notEqual(G.aiGate(t).reason, "dispensing", t);
    assert.equal(G.redact(t).count, 0, "nothing removed: " + t);
    assert.equal(G.imageCheck(t).block, false, t);
  }
  // a Chinese pack with a registration number and 病人 in the indication is allowed and sent whole
  const pack = "国药准字Z20000000\n本品适用于高血压病人的辅助治疗。\n用法用量：口服，一次2粒，一日3次\n规格：0.5g×24粒";
  assert.equal(G.aiGate(pack).allow, true);
  assert.equal(G.redact(pack).text, pack);
});

test("Chinese field use of 病人 still removes the name and still marks a dispensing label (unchanged behaviour)", () => {
  // [text, the personal value that must be removed]
  const FIELD = [
    ["病人：王样本\n阿莫西林胶囊 每日三次", "王样本"],
    ["病人: 王样本", "王样本"],
    ["病人 王样本 病历号 A12345", "王样本"],
    ["门诊病人 李样本\n每日两次 每次一粒", "李样本"],
    ["住院病人：赵样本\n用法：每日一次", "赵样本"],
    ["(门诊)病人：钱样本", "钱样本"],
    ["病人姓名 孙样本", "孙样本"],
    ["病人\n吴样本\n每日三次", "吴样本"],
    ["Patient 病人: 周样本\n病人編號 PT-338271", "周样本"],
    ["示例人民医院 药房\n住院病人：郑样本\n阿莫西林胶囊 0.25g", "郑样本"]
  ];
  for (const [t, v] of FIELD) {
    assert.equal(G.isDispensingLabel(t), true, t);
    assert.equal(G.aiGate(t).reason, "dispensing", t);
    assert.ok(!G.redact(t).text.includes(v), "name removed: " + t);
    assert.equal(G.imageCheck(t).block, true, "photo blocked: " + t);
  }
  // a field word glued after 病人 (编号 / 號) is still a dispensing sign
  for (const t of ["住院病人编号 ZY-778812\n赵样本", "門診病人號 0012345"]) assert.equal(G.isDispensingLabel(t), true, t);
});

test("institution headers still mark a dispensing label (unchanged behaviour)", () => {
  for (const t of ["XX市第一人民医院\n处方笺", "上海市示例区中心医院 门诊\n张示例 男 52岁", "示例社区诊所\n周测试先生\n每次2粒，每日3次", "範例醫院 門診藥袋\n姓名：陳範例",
    "示例大药房\n用法：每日三次", "某某市中医院\n每日两次"]) {
    assert.equal(G.isDispensingLabel(t), true, t);
    assert.equal(G.aiGate(t).allow, false, t);
  }
});
