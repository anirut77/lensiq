"use strict";
// tests/unit/pc-guard-zh-patient-regression.test.js — FIXED REGRESSION SET (2026-11-12). Synthetic Chinese dispensing /
// patient texts (no real person) written by the independent privacy reviewer of commit f4d06e0, whose narrow 病人 /
// hospital-header change made the guard weaker on 79 of them (the change was reverted). Every case the guard handles
// today is frozen here and must keep being handled:
//   n = the personal value is removed from the text (redact)     d = read as a dispensing label (isDispensingLabel)
//   p = the photo is blocked (imageCheck)                        g = AI refused for the text (aiGate not allowed)
// 154 of the reviewer's 155 cases carry at least one of these today. The one left out has none today ("住院病人" split one
// character per line, then a name and a pack block): a known gap, recorded in docs/product-check/P8-RESULTS.md, not a
// protection to freeze. Separators that are hard to see are written as \u escapes.
// A future guard change may ADD protections (a case gains a letter); it may not remove one.
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../../lensiq-pc-guard.js");

const PACK = "阿莫西林胶囊\n国药准字H20000000\n规格：0.25g×24粒\n用法用量：口服，一次2粒，一日3次\n生产企业：示例制药有限公司";
const PACK_TW = "阿莫西林膠囊\n衛署藥製字第000000號\n規格：250mg\n用法：每日三次，飯後服用\n製造廠：示例製藥股份有限公司";

/** [group, text, personal value (null = none), protections held today] */
const CASES = [
  ["standalone", "病人 张三\n阿莫西林胶囊 每日三次", "张三", "ndpg"],
  ["standalone", "病人张三\n阿莫西林胶囊 每日三次", "张三", "ndpg"],
  ["standalone", "病人张三 男 45岁", "张三", "ndpg"],
  ["standalone", "病人姓名 李四", "李四", "ndpg"],
  ["standalone", "病人:李四", "李四", "ndpg"],
  ["standalone", "病人：李四", "李四", "ndpg"],
  ["standalone", "门诊病人张三", "张三", "ndpg"],
  ["standalone", "门诊病人张三\n阿莫西林 0.25g 每日三次", "张三", "ndpg"],
  ["standalone", "住院病人张三 床号12", "张三", "ndpg"],
  ["standalone", "急诊病人张三\n头孢克肟 每日两次", "张三", "ndpg"],
  ["standalone", "就诊病人王五\n用法：口服", "王五", "ndpg"],
  ["standalone", "住院病人\u3000张三", "张三", "ndpg"],
  ["standalone", "门诊病人\u3000王五\n每日两次", "王五", "ndpg"],
  ["standalone", "住院病人\r\n张三\r\n每日一次", "张三", "ndpg"],
  ["standalone", "住院病人\u00a0张三", "张三", "ndpg"],
  ["standalone", "门诊病人-张三", "张三", "ndpg"],
  ["standalone", "门诊病人/张三", "张三", "ndpg"],
  ["standalone", "门诊病人，张三", "张三", "ndpg"],
  ["standalone", "门诊病人·张三", "张三", "ndpg"],
  ["standalone", "门诊病人|张三", "张三", "dpg"],
  ["standalone", "门诊病人(男)张三", "张三", "ndpg"],
  ["standalone", "住院病人名字：张三", "张三", "ndpg"],
  ["standalone", "住院病人名：张三", "张三", "ndpg"],
  ["standalone", "住院病人名称 张三", "张三", "ndpg"],
  ["standalone", "住院病人姓 张 名 三", "张", "ndpg"],
  ["standalone", "门诊病人身份证号 110101199003071234", "110101199003071234", "dpg"],
  ["standalone", "门诊病人卡号 A1234567\n张三", "A1234567", "ndpg"],
  ["standalone", "门诊病人编码 MZ88812", "MZ88812", "ndpg"],
  ["standalone", "住院病人代码：ZY10023", "ZY10023", "ndpg"],
  ["standalone", "病人编号 ZY-778812", "ZY-778812", "ndpg"],
  ["standalone", "住院病人编号ZY-778812", "ZY-778812", "ndpg"],
  ["standalone", "病人ID: P99812 张三", "张三", "dpg"],
  ["standalone", "病 人：张三", "张三", "g"],
  ["standalone", "病人\n张三\n每日三次", "张三", "ndpg"],
  ["standalone", "门诊病人\n张三\n每日三次", "张三", "ndpg"],
  ["standalone", "北京协和医院 门诊\n张三 男 52岁", "张三", "dpg"],
  ["standalone", "北京协和医院门诊\n张三", "张三", "dpg"],
  ["standalone", "北京协和医院，门诊处方\n病人张三", "张三", "ndpg"],
  ["standalone", "1、北京协和医院\n张三 每日三次", "张三", "dpg"],
  ["standalone", "（一）某某市人民医院\n张三\n每日三次", "张三", "dpg"],
  ["standalone", "某某市人民医院；门诊\n病人张三", "张三", "ndpg"],
  ["standalone", "三级甲等医院\n某某市第一人民医院\n张三", "张三", "dpg"],
  ["standalone", "国家三级甲等医院 张三", "张三", "dpg"],
  ["standalone", "某某县各级医院联合门诊\n张三 每日两次", "张三", "dpg"],
  ["standalone", "中国医学科学院肿瘤医院 处方笺\n病人张三", "张三", "ndpg"],
  ["standalone", "中国人民解放军总医院\n张三\n用法：每日一次", "张三", "dpg"],
  ["standalone", "上海市第六人民医院、上海交通大学附属医院\n张三 男 45岁", "张三", "dpg"],
  ["standalone", "病人张三，男，45岁，诊断：高血压", "张三", "ndpg"],
  ["standalone", "患者/病人：张三", "张三", "ndpg"],
  ["standalone", "（病人）张三", "张三", "ndpg"],
  ["standalone", "【病人】张三", "张三", "ndpg"],
  ["standalone", "[病人]张三", "张三", "ndpg"],
  ["standalone", "Name/病人：Zhang San", "Zhang San", "ndpg"],
  ["standalone", "Patient病人 Zhang San", "Zhang San", "ndpg"],
  ["standalone", "PATIENT 病人张三", "张三", "ndpg"],
  ["standalone", "病人资料：张三，男", "张三", "ndpg"],
  ["standalone", "门诊病人资料 张三", "张三", "ndpg"],
  ["standalone", "病人信息\n姓名 张三", "张三", "ndpg"],
  ["standalone", "病人號 0012345 張三", "張三", "dpg"],
  ["standalone", "門診病人張三\n每日三次", "張三", "ndpg"],
  ["standalone", "住院病人張三", "張三", "ndpg"],
  ["standalone", "病人張三 女 30歲", "張三", "ndpg"],
  ["standalone", "病人:張 三", "張", "ndpg"],
  ["standalone", "某某醫院 藥袋\n病人 陳小明", "陳小明", "ndpg"],
  ["standalone", "檢驗報告\n病人陳小明 病歷號 12345", "陳小明", "ndpg"],
  ["standalone", "预约卡\n病人张三 预约时间 11月20日", "张三", "ndpg"],
  ["standalone", "出院小结\n病人张三 入院日期 2026-10-01", "张三", "ndpg"],
  ["standalone", "化验单\n病人张三 白细胞 5.6", "张三", "ndpg"],
  ["standalone", "检验报告单\n住院病人张三 血红蛋白 120", "张三", "ndpg"],
  ["standalone", "检验报告单 送检病人张三", "张三", "ndpg"],
  ["standalone", "送检病人：张三", "张三", "ndpg"],
  ["standalone", "复诊病人张三 请于周三复诊", "张三", "ndpg"],
  ["standalone", "初诊病人张三", "张三", "ndpg"],
  ["standalone", "新病人张三", "张三", "ndpg"],
  ["standalone", "老病人张三", "张三", "ndpg"],
  ["standalone", "VIP病人张三", "张三", "ndpg"],
  ["standalone", "1号病人张三", "张三", "ndpg"],
  ["standalone", "3床病人张三", "张三", "ndpg"],
  ["standalone", "3床 病人张三", "张三", "ndpg"],
  ["standalone", "内科病人张三 主治医生李四", "张三", "ndpg"],
  ["standalone", "处方\n内科病人张三", "张三", "ndpg"],
  ["standalone", "病人家属张三 电话 13812345678", "张三", "ndpg"],
  ["standalone", "病人张三的家属", "张三", "ndpg"],
  ["pack", "住院病人张三\n" + PACK, "张三", "ndpg"],
  ["pack", "住院病人 张三\n" + PACK, "张三", "ndpg"],
  ["pack", "住院病人\u3000张三\n" + PACK, "张三", "ndpg"],
  ["pack", "住院病人\u00a0张三\n" + PACK, "张三", "ndpg"],
  ["pack", "急诊病人张三 床号12\n" + PACK, "张三", "ndpg"],
  ["pack", "初诊病人张三\n" + PACK, "张三", "ndpg"],
  ["pack", "新病人张三\n" + PACK, "张三", "ndpg"],
  ["pack", "3床病人张三\n" + PACK, "张三", "ndpg"],
  ["pack", "内科病人张三\n" + PACK, "张三", "ndpg"],
  ["pack", "儿科病人张小三 5岁\n" + PACK, "张小三", "ndpg"],
  ["pack", "住院病人名字：张三\n" + PACK, "张三", "ndpg"],
  ["pack", "送检病人：张三\n" + PACK, "张三", "ndpg"],
  ["pack", "送检病人张三\n" + PACK, "张三", "ndpg"],
  ["pack", "门诊病人张三\n" + PACK, "张三", "ndpg"],
  ["pack", "门诊病人，张三\n" + PACK, "张三", "ndpg"],
  ["pack", "住院病人張三\n" + PACK_TW, "張三", "ndpg"],
  ["pack", "住院病人 張三\n" + PACK_TW, "張三", "ndpg"],
  ["pack", "急診病人張三\n" + PACK_TW, "張三", "ndpg"],
  ["pack", "1、北京协和医院\n张三\n" + PACK, "张三", "dpg"],
  ["pack", "国家三级甲等医院 张三\n" + PACK, "张三", "dpg"],
  ["pack", "示例市人民医院（三级甲等医院）\n张三\n" + PACK, "张三", "dpg"],
  ["pack", "No.1 示例医院\n张三\n" + PACK, "张三", "dpg"],
  ["pack", "(一) 示例医院\n张三\n" + PACK, "张三", "dpg"],
  ["pack", "药品名称：阿莫西林；示例市人民医院\n张三\n" + PACK, "张三", "dpg"],
  ["pack", "发药：示例市人民医院、门诊药房\n张三\n" + PACK, "张三", "dpg"],
  ["pack", "示例市中医院 张三\n" + PACK, "张三", "dpg"],
  ["pack", "中国人民解放军总医院\n张三\n" + PACK, "张三", "dpg"],
  ["pack", "示例大学附属第一医院，门诊药房\n张三\n" + PACK, "张三", "dpg"],
  ["pack", "示例各大医院\n张三\n" + PACK, "张三", "dpg"],
  ["pack", "示例县各级医院\n张三\n" + PACK, "张三", "dpg"],
  ["pack", "张三，示例市人民医院\n" + PACK, "张三", "dpg"],
  ["pack", "张三；示例市人民医院\n" + PACK, "张三", "dpg"],
  ["pack", "张三。示例诊所\n" + PACK, "张三", "dpg"],
  ["pack", "示例 等 医院\n" + PACK, null, "dpg"],
  ["pack", "住院病人张三\n" + PACK + "\n条码 6901234567892", "张三", "ndpg"],
  ["separators", "住院病人\u2236张三\n" + PACK, "张三", "ndpg"],
  ["separators", "住院病人\ufe30张三\n" + PACK, "张三", "ndpg"],
  ["separators", "住院病人;张三\n" + PACK, "张三", "dpg"],
  ["separators", "住院病人.张三\n" + PACK, "张三", "ndpg"],
  ["separators", "住院病人_张三\n" + PACK, "张三", "ndpg"],
  ["separators", "住院病人\t张三\n" + PACK, "张三", "ndpg"],
  ["separators", "住院病人\u2002张三\n" + PACK, "张三", "ndpg"],
  ["separators", "住院病人\u200b张三\n" + PACK, "张三", "ndpg"],
  ["separators", "住院病人(张三)\n" + PACK, "张三", "ndpg"],
  ["separators", "住院病人【张三】\n" + PACK, "张三", "ndpg"],
  ["separators", "住院病人 :张三\n" + PACK, "张三", "ndpg"],
  ["separators", "·示例市人民医院\n张三\n" + PACK, "张三", "dpg"],
  ["separators", "。示例市人民医院\n张三\n" + PACK, "张三", "dpg"],
  ["separators", "、示例市人民医院\n张三\n" + PACK, "张三", "dpg"],
  ["separators", "，示例市人民医院\n张三\n" + PACK, "张三", "dpg"],
  ["separators", "示例市第一人民医院\n国家三级甲等医院\n张三\n" + PACK, "张三", "dpg"],
  ["separators", "国家三级甲等医院\n张三\n" + PACK, "张三", "dpg"],
  ["separators", "三甲医院 门诊药房\n张三\n" + PACK, "张三", "dpg"],
  ["separators", "示例中心医院等\n" + PACK, null, "dpg"],
  ["separators", "病人姓名：张三 性别：男 年龄：45\n" + PACK, "张三", "ndpg"],
  ["separators", "Patient Name 病人姓名: Zhang San\n" + PACK, "Zhang San", "ndpg"],
  ["separators", "住院号 123456 病人张三\n" + PACK, "张三", "ndpg"],
  ["separators", "床号:3 病人张三\n" + PACK, "张三", "ndpg"],
  ["separators", "床号3病人张三\n" + PACK, "张三", "ndpg"],
  ["separators", "科别:内科病人张三\n" + PACK, "张三", "ndpg"],
  ["separators", "门诊病人\n张三\n" + PACK, "张三", "ndpg"],
  ["separators", "住院病人\n张三\n" + PACK, "张三", "ndpg"],
  ["separators", "住院\n病人张三\n" + PACK, "张三", "ndpg"],
  ["separators", "出院病人张三\n" + PACK, "张三", "ndpg"],
  ["separators", "转院病人张三\n" + PACK, "张三", "ndpg"],
  ["separators", "病房病人张三\n" + PACK, "张三", "ndpg"],
  ["separators", "ICU病人张三\n" + PACK, "张三", "ndpg"],
  ["separators", "男性病人张三\n" + PACK, "张三", "ndpg"],
  ["separators", "女病人李丽\n" + PACK, "李丽", "ndpg"],
  ["separators", "该病人张三\n" + PACK, "张三", "ndpg"],
  ["separators", "此病人张三对青霉素过敏\n" + PACK, "张三", "ndpg"],
];

test("reviewer regression set: 154 synthetic Chinese patient / dispensing texts keep every protection the guard gives them today", () => {
  assert.equal(CASES.length, 154);
  const counts = { n: 0, d: 0, p: 0, g: 0 };
  for (const [group, text, value, need] of CASES) {
    const where = group + ": " + JSON.stringify(text.slice(0, 40));
    if (need.includes("n")) { assert.ok(!G.redact(text).text.includes(value), "personal value removed: " + where); counts.n++; }
    if (need.includes("d")) { assert.equal(G.isDispensingLabel(text), true, "read as a dispensing label: " + where); counts.d++; }
    if (need.includes("p")) { assert.equal(G.imageCheck(text).block, true, "photo blocked: " + where); counts.p++; }
    if (need.includes("g")) { assert.equal(G.aiGate(text).allow, false, "AI refused: " + where); counts.g++; }
  }
  assert.deepEqual(counts, {n:115,d:153,p:153,g:154});
});

test("reviewer regression set: a pack block (registration number, maker, barcode) never opens AI for a text with a patient on it", () => {
  for (const [group, text, value, need] of CASES) {
    if (group === "standalone" || value == null || !need.includes("g")) continue;
    const g = G.aiGate(text);
    assert.equal(g.allow, false, JSON.stringify(text.slice(0, 40)));
    assert.equal(g.reason, "dispensing", "refused as a dispensing label, not only for lack of evidence: " + JSON.stringify(text.slice(0, 40)));
  }
});
