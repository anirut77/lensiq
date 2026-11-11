"use strict";
// tests/unit/pc-guard-zh-patient.test.js — Chinese field uses of 病人 and institution headers (2026-11-12). Synthetic
// texts only. Every field use of 病人 and every institution header removes the personal data and keeps the text and the
// photo blocked. (A narrow change that let 病人 inside running text and hospital lists in advert prose through was
// reverted after an independent privacy review; its "prose passes" test went with it. The reviewer's 154 frozen cases are
// in pc-guard-zh-patient-regression.test.js.)
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../lensiq-pc-guard.js");

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
