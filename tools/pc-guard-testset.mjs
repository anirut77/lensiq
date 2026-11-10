#!/usr/bin/env node
// tools/pc-guard-testset.mjs — builds the FIXED test set of the Product Check patient-name / personal-identifier guard
// (round 17 P7) into docs/product-check/p7-guard-testset.json. Run once before the guard was written; the JSON is the
// frozen set (`--check` verifies the file still matches this generator). Source: SYNTHETIC — every name, phone number,
// HN and ID is invented (Thai ID check digits are computed so the IDs are well-formed). No real person, no photo.
//
//   node tools/pc-guard-testset.mjs           write the JSON
//   node tools/pc-guard-testset.mjs --check   exit 1 when the JSON differs from what this generator builds
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "docs", "product-check", "p7-guard-testset.json");

const TH = [["สมมติ", "ใจทดสอบ"], ["ตัวอย่าง", "นามสมมุติ"], ["ทดลอง", "สุขสมมติ"], ["จำลอง", "ทดสอบดี"], ["สาธิต", "ไม่มีจริง"], ["ลองดู", "แสนสมมติ"]];
const EN = [["Testy", "McSample"], ["Jane", "Placeholder"], ["John", "Exampleton"], ["Mary", "Fictive"], ["Alan", "Mockridge"]];
const ZH = ["测试明", "样本华", "李示例"];
/** Thai ID with a valid check digit. @param {string} body12 */
const tid = body12 => { let s = 0; for (let i = 0; i < 12; i++) s += Number(body12[i]) * (13 - i); return body12 + ((11 - (s % 11)) % 10); };
const IDS = ["110370012345", "310990067890", "550010024680"].map(tid);
const dash = id => `${id[0]}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id[12]}`;
const DRUG = ["PARACETAMOL 500 mg", "AMOXICILLIN 500 mg", "IBUPROFEN 400 mg", "LORATADINE 10 mg", "OMEPRAZOLE 20 mg", "METFORMIN 500 mg"];

export function build() {
  const items = [];
  let n = 0;
  const add = (lang, text, pii, keep = [], note = "") => items.push({ id: "g" + String(++n).padStart(3, "0"), lang, text, pii, keep, ...(note ? { note } : {}) });
  // 1. Thai hospital / pharmacy dispensing labels
  TH.forEach(([f, l], i) => {
    const hn = `${60 + i}-0${i}${i + 3}45`;
    add("th", `โรงพยาบาลตัวอย่าง\nชื่อผู้ป่วย: ${f} ${l}  HN: ${hn}\n${DRUG[i]}\nรับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง หลังอาหาร\nวันที่จ่ายยา 10/11/2569`, [`${f} ${l}`, hn], [DRUG[i], "หลังอาหาร"]);
  });
  TH.slice(0, 4).forEach(([f, l], i) => add("th", `ร้านยาสาธิต โทร. 02-${100 + i}-45${i}7\nคุณ${f} ${l}\n${DRUG[i + 1]} 10 เม็ด\nเลขทะเบียน 1A 844/39`,
    [`${f} ${l}`, `02-${100 + i}-45${i}7`], [DRUG[i + 1], "1A 844/39"]));
  TH.slice(2, 6).forEach(([f, l], i) => add("th", `ชื่อ-สกุล ${["นาย", "นาง", "นางสาว", "ด.ช."][i]}${f} ${l} อายุ 4${i} ปี\n${DRUG[i]}\nก่อนนอน`, [`${f} ${l}`], [DRUG[i], "ก่อนนอน"]));
  TH.slice(0, 3).forEach(([f, l], i) => add("th", `${["นาย", "นางสาว", "เด็กหญิง"][i]} ${f} ${l}\nHN ${i + 1}2345${i}\nยาลดน้ำมูก`, [`${f} ${l}`, `${i + 1}2345${i}`], ["ยาลดน้ำมูก"]));
  add("th", `ผู้ป่วย ${TH[4][0]} ${TH[4][1]} เบอร์โทร 081-234-5678\nยาทาภายนอก`, [`${TH[4][0]} ${TH[4][1]}`, "081-234-5678"], ["ยาทาภายนอก"]);
  add("th", `คนไข้: ${TH[5][0]} ${TH[5][1]}\nโทร 0891234567\nยาหยอดตา`, [`${TH[5][0]} ${TH[5][1]}`, "0891234567"], ["ยาหยอดตา"]);
  add("th", `เลขประจำตัวประชาชน ${dash(IDS[0])}\nชื่อ ${TH[0][0]} ${TH[0][1]}`, [dash(IDS[0]), `${TH[0][0]} ${TH[0][1]}`], []);
  add("th", `บัตรประชาชน ${IDS[1]} ผู้รับยา ${TH[1][0]} ${TH[1][1]}`, [IDS[1], `${TH[1][0]} ${TH[1][1]}`], []);
  add("th", `ชื่อผู้ป่วย ${TH[3][0]} ${TH[3][1]} HN:6512345 AN 2569-001\nยาฆ่าเชื้อ ทานจนหมด`, [`${TH[3][0]} ${TH[3][1]}`, "6512345", "2569-001"], ["ยาฆ่าเชื้อ"]);
  add("th", `ติดต่อ +66 81 234 5678 หรือ ${dash(IDS[2])}`, ["+66 81 234 5678", dash(IDS[2])], []);
  // 2. English labels
  EN.forEach(([f, l], i) => add("en", `CITY CLINIC PHARMACY\nPatient: ${f} ${l}\nMRN: 00${i}48${i}2\n${DRUG[i]}\nTake 1 tablet twice daily`, [`${f} ${l}`, `00${i}48${i}2`], [DRUG[i], "twice daily"]));
  EN.slice(0, 3).forEach(([f, l], i) => add("en", `Patient name: ${["Mr.", "Mrs.", "Ms."][i]} ${f} ${l}  Tel: 02-55${i}-1234\n${DRUG[i + 2]}`, [`${f} ${l}`, `02-55${i}-1234`], [DRUG[i + 2]]));
  EN.slice(1, 4).forEach(([f, l], i) => add("en", `Rx for ${["Mr", "Miss", "Mrs"][i]} ${f} ${l}\nHN 77${i}0012\n${DRUG[i]}`, [`${f} ${l}`, `77${i}0012`], [DRUG[i]]));
  add("en", `Name: ${EN[4][0]} ${EN[4][1]}\nPhone: +66 2 123 4567\nemail mock.patient@example.test`, [`${EN[4][0]} ${EN[4][1]}`, "+66 2 123 4567", "mock.patient@example.test"], []);
  add("en", `Pt: ${EN[0][0]} ${EN[0][1]}  DOB 01/02/1980\nAMOXICILLIN 250 mg`, [`${EN[0][0]} ${EN[0][1]}`], ["AMOXICILLIN 250 mg"]);
  // 3. Chinese labels
  ZH.forEach((nm, i) => add("zh", `患者姓名：${nm}\n门诊号：${i + 3}20019${i}\n阿莫西林胶囊 0.25g\n每日三次`, [nm, `${i + 3}20019${i}`], ["阿莫西林胶囊", "每日三次"]));
  add("zh", `姓名: ${ZH[0]} 电话: 138 0013 8000\n布洛芬缓释胶囊`, [ZH[0], "138 0013 8000"], ["布洛芬缓释胶囊"]);
  add("zh", `病人 ${ZH[1]} 病历号 A12345\n国药准字H20013062`, [ZH[1], "A12345"], ["国药准字H20013062"]);
  // 4. negatives: product labels that must lose NOTHING (registration numbers, barcodes, hotlines, "คุณภาพ" words)
  const NEG = [
    ["th", "ยาแก้ปวดลดไข้ PARACETAMOL 500 mg\nเลขทะเบียน 1A 844/39\nผลิตภัณฑ์นี้ไม่ใช้สำหรับรักษา บำบัด บรรเทา หรือป้องกันโรค"],
    ["th", "ผลิตภัณฑ์เสริมอาหาร คุณภาพสูง คุณประโยชน์จากธรรมชาติ\nอย. 13-2-06463-5-0326\nควรกินอาหารหลากหลาย ครบ 5 หมู่"],
    ["th", "เหมาะสำหรับคุณแม่ตั้งครรภ์ คุณค่าทางโภชนาการ\nบาร์โค้ด 8850006939727\nเลขที่ผลิต LOT 2401A EXP 01/2027"],
    ["th", "คุณสมบัติ: ช่วยให้ผิวชุ่มชื้น\nเลขที่ใบรับจดแจ้ง 10-1-6600012345\nผลิตโดย บริษัท ตัวอย่าง จำกัด"],
    ["th", "สายด่วน อย. 1556 ศูนย์พิษวิทยา 1367 เจ็บป่วยฉุกเฉิน 1669\nยาสามัญประจำบ้าน"],
    ["th", "นางฟ้าเฮิร์บ ครีมบำรุง\nนายหน้าห้ามจำหน่าย\nเลขจดแจ้ง 10-1-5912345678"],
    ["th", "วันผลิต 12/05/2568 วันหมดอายุ 12/05/2570\nปริมาณสุทธิ 30 แคปซูล\nขนาด 500 มก."],
    ["th", "ส่วนประกอบ: วิตามินซี 1000 มก. ซิงค์ 15 มก.\nเลข อย. 1310064635032"],
    ["th", "ยาน้ำแก้ไอ สำหรับเด็ก\nG 123/45\nเก็บในที่แห้ง อุณหภูมิไม่เกิน 30 องศา"],
    ["th", "ยาแผนโบราณ ทะเบียนยาเลขที่ G 56/2563\nผู้ผลิต: ห้างหุ้นส่วนสาธิต"],
    ["en", "PARACETAMOL Tablets BP 500 mg\nReg. No. 1A 844/39\nMfg. Date 01/2025 Exp. Date 01/2028\nBatch No. A12345"],
    ["en", "Product name: Vitamin C 1000 mg\nBrand name: LQTEST\nNDC 0573-0150-20"],
    ["en", "Manufactured by Example Pharma Ltd.\nDIN 02345678\nNPN 80012345\nKeep out of reach of children"],
    ["en", "Generic name: Loratadine 10 mg\nMAL20012345AZ\nSIN09110P"],
    ["en", "Drug Facts\nActive ingredient (in each tablet): Ibuprofen 200 mg\nUses: temporarily relieves minor aches"],
    ["en", "GTIN 09501101530003 LOT LQTEST1 SN42 EXP 2027-01-31"],
    ["en", "Ask a doctor before use if you have liver disease. Store at 20-25°C.\nNet wt 60 capsules"],
    ["en", "AUST L 123456\nEU/1/96/007/001\nCE 0123"],
    ["zh", "国药准字H20013062\n生产批号 20240501\n有效期至 2027.04"],
    ["zh", "卫食健字(2013)第0123号\n保健食品 蓝帽子\n净含量 60粒"],
    ["zh", "国妆特字G20190123\n产品名称：美白精华液\n生产企业：示例化妆品有限公司"],
    ["ko", "식품의약품안전처 허가번호 제 2024-123호\n유통기한 2027.01.01"],
    ["th", "ยาอมแก้เจ็บคอ\nเลขทะเบียน 2A 12/66 (N)\nรหัส 8851234567893"],
    ["th", "คุณภาพมาตรฐาน GMP คุณภาพชีวิตที่ดี\nขนาดบรรจุ 100 มล."],
    ["en", "Phone orders: see website\nLot 13-2-06463-5-0326 printed on cap"],
    ["th", "ใช้ภายใน 30 วันหลังเปิด\nเลขที่ใบอนุญาตโฆษณา ฆอ. 123/2568"],
    ["en", "Contains 13-2-06463-5-0326 food serial; Barcode 8850006939727"],
    ["th", "ครีมกันแดด SPF50 PA++++\nจดแจ้งเลขที่ 10-1-6500098765\nคุณภาพจากญี่ปุ่น"]
  ];
  const KEEP = new RegExp([
    '1A 844\\/39|13-2-06463-5-0326|1310064635032|8850006939727|8851234567893|10-1-\\d{10}|09501101530003|MAL20012345AZ|SIN09110P|DIN 02345678|NPN 80012345',
    'NDC 0573-0150-20|AUST L 123456|国药准字H20013062|国妆特字G20190123|G 123\\/45|G 56\\/2563|2A 12\\/66|1556|1367|1669|PARACETAMOL|คุณภาพ|คุณประโยชน์',
    'คุณแม่ตั้งครรภ์|คุณค่า|คุณสมบัติ|นางฟ้าเฮิร์บ|นายหน้า|20240501|ฆอ\\. 123\\/2568|Batch No\\. A12345|Example Pharma Ltd\\.|ห้างหุ้นส่วนสาธิต'
  ].join("|"), "g");
  NEG.forEach(([lang, text]) => add(lang, text, [], [...new Set(text.match(KEEP) || [])], "negative: product label, nothing to remove"));
  // 5. HOLD-OUT (added 2026-11-10 after one landline fix on parts 1-4; written before being scored, scored once): new
  //    phrasings, other honorifics, spacing and mixed scripts
  const H = [
    ["th", "ใบสั่งยา คลินิกสาธิต\nชื่อผู้ป่วย นางสาวมะลิ สมมุติวงศ์\nเลขที่ผู้ป่วย 2569/0042\nยาแก้แพ้ 1x3", ["มะลิ สมมุติวงศ์", "2569/0042"], ["ยาแก้แพ้"]],
    ["th", "ชื่อ: ด.ญ. ใบเตย ทดลองดี\nโทร: 095 111 2233", ["ใบเตย ทดลองดี", "095 111 2233"], []],
    ["th", "ผู้รับยา : คุณ ปลาทอง ไม่จริงเลย\nวันเกิด 03/04/2530", ["ปลาทอง ไม่จริงเลย", "03/04/2530"], []],
    ["th", "ชื่อ - นามสกุล  นายเมฆ ลอยสมมติ\nHN : 64-001122", ["เมฆ ลอยสมมติ", "64-001122"], []],
    ["th", "เลขประจำตัวประชาชน 1 1037 00123 45 " + tid("110370012345").slice(-1) + "\nยาลดกรด", ["1 1037 00123 45 " + tid("110370012345").slice(-1)], ["ยาลดกรด"]],
    ["en", "PATIENT: Ms Olive Testcase\nVN 556677\nCETIRIZINE 10 mg", ["Olive Testcase", "556677"], ["CETIRIZINE 10 mg"]],
    ["en", "Patient's name: Peter Dummyson  Phone 089-765-4321", ["Peter Dummyson", "089-765-4321"], []],
    ["en", "Dispensed to Mrs Rosa Notreal on 10/11/2026\nDate of birth: 1975-06-01", ["Rosa Notreal", "1975-06-01"], []],
    ["en", "Contact: sample.person@mail.example.test, +66-2-555-0101", ["sample.person@mail.example.test", "+66-2-555-0101"], []],
    ["zh", "患者：王测试\n住院号：Z778899\n头孢克肟分散片", ["王测试", "Z778899"], ["头孢克肟分散片"]],
    ["zh", "姓名：赵样例 手机 159-1234-5678", ["赵样例", "159-1234-5678"], []],
    ["th", "สินค้าคุณภาพดี คุณพ่อคุณแม่ไว้ใจ\nอย. 10-1-6512345678\nโทรสั่งซื้อ 1112", [], ["คุณภาพดี", "คุณพ่อคุณแม่", "10-1-6512345678", "1112"]],
    ["en", "Brand Name: SAMPLEX\nDrug name: Cetirizine\nLot 230601 Exp 06/2027\nwww.example.test", [], ["SAMPLEX", "Cetirizine", "230601"]],
    ["zh", "患者应在医生指导下使用\n批准文号 国药准字Z20025001", [], ["患者应在医生指导下使用", "国药准字Z20025001"]],
    ["th", "เหมาะสำหรับผู้ป่วย เบาหวาน ปรึกษาแพทย์ก่อนใช้\nเลขทะเบียน 1A 15/62", [], ["1A 15/62"]]
  ];
  H.forEach(([lang, text, pii, keep]) => add(lang, text, pii, keep, "hold-out"));
  // 6. DEV-2 (2026-11-10, after the independent review: one case group per failure category it named; dev data, tuned on).
  //    image: "block" | "allow" = what imageCheck() must say; default block when pii is listed, allow otherwise.
  const thd = s => s.replace(/[0-9]/g, d => String.fromCharCode(0x0e50 + Number(d)));
  const D2 = [
    // 1. Thai digits
    ["th", `ชื่อผู้ป่วย สมมติ ใจทดสอบ HN ${thd("6512345")}\nยาแก้แพ้`, ["สมมติ ใจทดสอบ", thd("6512345")], ["ยาแก้แพ้"]],
    ["th", `โทร ${thd("081-234-5678")}\nยาทาแก้คัน`, [thd("081-234-5678")], ["ยาทาแก้คัน"]],
    ["th", `เลขประจำตัวประชาชน ${thd(dash(IDS[1]))}`, [thd(dash(IDS[1]))], []],
    ["th", `คนไข้ ตัวอย่าง นามสมมุติ วันเกิด ${thd("12/01/2530")}`, ["ตัวอย่าง นามสมมุติ", thd("12/01/2530")], []],
    // 2. phone groupings
    ["th", "ผู้ติดต่อ 08-9765-4321\nยาลดไข้", ["08-9765-4321"], ["ยาลดไข้"]],
    ["th", "ผู้ติดต่อ 0 2123 4567\nยาธาตุ", ["0 2123 4567"], ["ยาธาตุ"]],
    ["en", "Mobile +66(0)81-234-5678\nLORATADINE 10 mg", ["+66(0)81-234-5678"], ["LORATADINE 10 mg"]],
    ["en", "Tel (02) 123 4567 / 089.765.4321", ["(02) 123 4567", "089.765.4321"], []],
    ["th", "โทร.02-987-6543 ต่อ 12", ["02-987-6543"], []],
    // 3. birth dates
    ["th", "เกิด 12 ม.ค. 2530\nยาแก้ไอ", ["12 ม.ค. 2530"], ["ยาแก้ไอ"]],
    ["th", `เกิด ${thd("3")} มีนาคม พ.ศ. ${thd("2528")}`, [`${thd("3")} มีนาคม พ.ศ. ${thd("2528")}`], []],
    ["th", "ว/ด/ป เกิด 01/02/2520", ["01/02/2520"], []],
    ["en", "DOB 3 March 1985\nOMEPRAZOLE 20 mg", ["3 March 1985"], ["OMEPRAZOLE 20 mg"]],
    ["en", "Date of birth: Mar 4, 1990", ["Mar 4, 1990"], []],
    ["zh", "出生日期：1985年3月4日\n阿莫西林胶囊", ["1985年3月4日"], ["阿莫西林胶囊"]],
    ["zh", "生日 1990年5月", ["1990年5月"], []],
    // 4. name cues
    ["th", "ชื่อเล่น: น้องเมย์\nยาแก้ปวด", ["น้องเมย์"], ["ยาแก้ปวด"]],
    ["en", "ร้านยาสาธิต\nKhun Somsak Testdee\nCETIRIZINE 10 mg", ["Somsak Testdee"], ["CETIRIZINE 10 mg"]],
    ["th", "ร้านยาสาธิต\nคุณเมย์\nวิธีใช้ รับประทานครั้งละ 1 เม็ด", ["เมย์"], ["รับประทานครั้งละ 1 เม็ด"]],
    ["th", "ชื่อผู้ป่วย นายทดลอง สุขสมมติ (น้องบอล)\nยาลดน้ำมูก", ["ทดลอง สุขสมมติ (น้องบอล)"], ["ยาลดน้ำมูก"]],
    ["th", "โรงพยาบาลตัวอย่าง\nร.ต.อ. จำลอง ทดสอบดี\nยาแก้ปวด", ["จำลอง ทดสอบดี"], ["ยาแก้ปวด"]],
    ["th", "คลินิกสาธิต\nพ.ต.ท.หญิง สาธิต ไม่มีจริง\nยาทา", ["สาธิต ไม่มีจริง"], ["ยาทา"]],
    ["th", "ร้านยาสาธิต\nพระครูสมมติ ทดสอบวงศ์\nรับประทานครั้งละ 2 เม็ด", ["สมมติ ทดสอบวงศ์"], ["รับประทานครั้งละ 2 เม็ด"]],
    ["th", "โรงพยาบาลตัวอย่าง\nพระมหาจำลอง ปัญญาสมมติ\nยาลดกรด", ["จำลอง ปัญญาสมมติ"], ["ยาลดกรด"]],
    ["zh", "药房\n王测试先生\n用法用量：每次1粒", ["王测试先生"], ["每次1粒"]],
    ["zh", "诊所\n李样本女士 每日两次", ["李样本女士"], ["每日两次"]],
    ["en", "NAME: JOHN EXAMPLETON\nAMOXICILLIN 500 mg", ["JOHN EXAMPLETON"], ["AMOXICILLIN 500 mg"]],
    ["en", "Dispensed to Alan Mockridge\nIBUPROFEN 400 mg", ["Alan Mockridge"], ["IBUPROFEN 400 mg"]],
    ["en", "CITY PHARMACY\nFor: Mary Fictive\nTake 1 tablet twice daily", ["Mary Fictive"], ["Take 1 tablet twice daily"]],
    ["en", "Dr. order for Mr Peter Dummyson\nMETFORMIN 500 mg", ["Peter Dummyson"], ["METFORMIN 500 mg"]],
    ["en", "Patient Name - Olive Testcase\nCETIRIZINE", ["Olive Testcase"], ["CETIRIZINE"]],
    ["th", "ชื่อผู้ป่วย สม ชาย ใจ ทด สอบ\nยาแก้ไอ", ["สม ชาย ใจ ทด สอบ"], ["ยาแก้ไอ"]],
    // 5. dispensing label with a bare name: a standalone name line on a dispensing label is removed (guard v3); a Chinese
    //    bare name is still not found (LIMIT) and the photo is blocked
    ["th", "โรงพยาบาลสาธิต\nสมศรี มีสุขสมมติ\nวิธีใช้ รับประทานครั้งละ 1 เม็ด", ["สมศรี มีสุขสมมติ"], ["วิธีใช้ รับประทานครั้งละ 1 เม็ด"], "block"],
    ["en", "Rx #22041\nJane Placeholder\nTake 1 tablet daily", ["Jane Placeholder"], ["Take 1 tablet daily"], "block"],
    ["zh", "处方笺\n张样例\n用法用量：每日三次", [], ["用法用量：每日三次"], "block"],
    // 6. brands that start with an honorific, and label words: kept, photo allowed
    ["en", "Mrs. Bee's Herbal Tea\nSteep 1 bag for 3 minutes", [], ["Mrs. Bee's Herbal Tea"], "allow"],
    ["en", "Dr. Sample Skincare Night Cream\nApply 2 times a day", [], ["Dr. Sample Skincare Night Cream"], "allow"],
    ["en", "Miss Lily Body Lotion 200 ml", [], ["Miss Lily Body Lotion"], "allow"],
    ["th", "ยาหม่องนายห้างสมุนไพร\nนายห้าง ยาดมสมุนไพร", [], ["นายห้างสมุนไพร", "นายห้าง ยาดมสมุนไพร"], "allow"],
    ["en", "Patient Package Insert\nRead before use", [], ["Patient Package Insert"], "allow"],
    ["en", "Patient Information Leaflet: IBUPROFEN 200 mg", [], ["Patient Information Leaflet", "IBUPROFEN 200 mg"], "allow"],
    ["th", "ผู้ป่วย โรคไต ควรปรึกษาแพทย์ก่อนใช้\nรับประทานครั้งละ 1 เม็ด", [], ["โรคไต ควรปรึกษาแพทย์ก่อนใช้"], "allow"],
    ["en", "For: external use only\nRx only", [], ["external use only", "Rx only"], "allow"],
    ["zh", "适合女士 每日一次", [], ["适合女士"], "allow"],
    ["th", "พระจันทร์ ครีมบำรุงผิว\nคุณภาพดี", [], ["พระจันทร์ ครีมบำรุงผิว", "คุณภาพดี"], "allow"],
    // 7. company phones (default: kept in text, photo allowed); a person's phone on the same pack is still removed
    ["th", "ผลิตโดย บริษัท ตัวอย่าง จำกัด\nโทร 02-123-4567", [], ["02-123-4567"], "allow"],
    ["en", "Manufactured by Example Co., Ltd. Tel: +66 2 555 0101", [], ["+66 2 555 0101"], "allow"],
    ["zh", "生产企业：示例制药有限公司 电话：021-5555-0101", [], ["021-5555-0101", "示例制药有限公司"], "allow"],
    ["th", "จำหน่ายโดย หจก. สาธิต โทร 053-123456\nผู้ติดต่อ 081-999-8888", ["081-999-8888"], ["053-123456"]],
    // added after the single hold-out run (failure classes seen there; similar, not the same, texts)
    ["th", "คลินิกสาธิต\nนาง  ทดสอบ  สมมติวงศ์\nยาทาแผล", ["ทดสอบ  สมมติวงศ์"], ["ยาทาแผล"]],
    ["th", `HN${thd("6500987")} ยาแก้ไอ`, [thd("6500987")], ["ยาแก้ไอ"]],
    ["ko", "판매원: 샘플(주) 고객센터 02-123-4567", [], ["02-123-4567"], "allow"]
  ];
  // 7. DEV-3 (after the independent final check of guard v2): short labels with a title, bare names on a dispensing label,
  //    bare Thai IDs, Khun / For: / titles anywhere; and OTC packs whose two-word lines must NOT look like a name
  const id3 = tid("310990012340".slice(0, 12));
  D2.push(
    ["en", "Mrs Jane Placeholder\nMETFORMIN 500 mg", ["Jane Placeholder"], ["METFORMIN 500 mg"]],
    ["th", "ด.ช. ภูผา ทดลองไทย\nยาน้ำแก้ไอเด็ก", ["ภูผา ทดลองไทย"], ["ยาน้ำแก้ไอเด็ก"]],
    ["th", "ด.ญ. ใบข้าว\nยาลดไข้เด็ก", ["ใบข้าว"], ["ยาลดไข้เด็ก"]],
    ["en", "Khun Malee\nPARACETAMOL 500 mg", ["Malee"], ["PARACETAMOL 500 mg"]],
    ["en", "For: Peter Dummyson\nTake 1 tablet twice daily", ["Peter Dummyson"], ["Take 1 tablet twice daily"]],
    ["th", "จ.ส.ต. สมหมาย\nยาแก้ปวดหลัง", ["สมหมาย"], ["ยาแก้ปวดหลัง"]],
    ["th", "พระมหาสมปอง\nยาธาตุ", ["สมปอง"], ["ยาธาตุ"]],
    ["zh", "陈测试先生 头孢克肟", ["陈测试先生"], ["头孢克肟"]],
    ["th", `ปชช. ${thd(id3)}`, [thd(id3)], []],
    ["th", `${id3}\nยาแก้แพ้`, [id3], ["ยาแก้แพ้"]],
    ["th", "สมใจ ทดลองสุข\nยาแก้ไอ รับประทานครั้งละ 1 ช้อนชา", ["สมใจ ทดลองสุข"], ["รับประทานครั้งละ 1 ช้อนชา"]],
    ["en", "Henry Mockwell\nTake 2 capsules at night", ["Henry Mockwell"], ["Take 2 capsules at night"]],
    ["th", "ยาแก้ปวด ลดไข้\nรับประทานครั้งละ 1-2 เม็ด ทุก 4-6 ชั่วโมง", [], ["ยาแก้ปวด ลดไข้"], "allow"],
    ["en", "Cold Relief\nNight Time\nTake 2 tablets at bedtime", [], ["Cold Relief", "Night Time"], "allow"],
    ["th", "สมุนไพร ขมิ้นชัน\nรับประทานครั้งละ 2 แคปซูล", [], ["สมุนไพร ขมิ้นชัน"], "allow"],
    ["en", "Recommended by Dr. Sample for daily use\nTake 1 tablet daily", [], ["Dr. Sample"], "allow"],
    ["zh", "适用人群：孕妇、哺乳期女士\n每日一次", [], ["哺乳期女士"], "allow"]
  );
  // 8. DEV-4 (after the independent v3 measurement): maker / shop / contact blocks (phones kept, photo allowed), name spans
  //    that must stop, new number formats, addresses near a person
  const cnId = d17 => { const w = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]; let x = 0; for (let i = 0; i < 17; i++) x += Number(d17[i]) * w[i]; return d17 + "10X98765432"[x % 11]; };
  const hkId = (l, d) => {
    let x = 36 * 9 + (l.charCodeAt(0) - 55) * 8;
    [...d].forEach((c, i) => { x += Number(c) * (7 - i); });
    const c = (11 - (x % 11)) % 11;
    return `${l}${d}(${c === 10 ? "A" : c})`;
  };
  const CN = cnId("11010519491231002"), HK = hkId("A", "123456");
  D2.push(
    ["th", "ผลิตโดย บริษัท สาธิตฟาร์มา จำกัด\n99/9 หมู่ 4 ต.บางพลี อ.บางพลี จ.สมุทรปราการ 10540\nโทร 02-123-4567", [], ["02-123-4567", "99/9 หมู่ 4 ต.บางพลี อ.บางพลี จ.สมุทรปราการ 10540"], "allow"],
    ["en", "Distributed by Mock Foods\n12 Sample Road, Bangkok 10110\nTel: 02 345 6789\nwww.example.test", [], ["02 345 6789", "12 Sample Road, Bangkok 10110"], "allow"],
    ["th", "สอบถามข้อมูลผลิตภัณฑ์ โทร 081-234-5600", [], ["081-234-5600"], "allow"],
    ["en", "Call center 02-555-0101\nMade in Thailand", [], ["02-555-0101"], "allow"],
    ["th", "SAMPLEX\nwww.samplex.example\nโทร 02-999-1234", [], ["02-999-1234"], "allow"],
    ["th", "ผลิตโดย บริษัท สาธิต จำกัด\nผู้ติดต่อ: คุณสมมติ ใจทดสอบ 081-222-3333", ["สมมติ ใจทดสอบ", "081-222-3333"], []],
    ["th", "ชื่อผู้ป่วย สมชาย ใจทดลอง ถามเรื่องยา Losartan", ["สมชาย ใจทดลอง"], ["ถามเรื่องยา Losartan"]],
    ["en", "Patient: John Exampleton asks about METFORMIN dose", ["John Exampleton"], ["asks about METFORMIN dose"]],
    ["zh", "手机13800138000 阿莫西林", ["13800138000"], ["阿莫西林"]],
    ["zh", `身份证 ${CN}`, [CN], []],
    ["en", `HKID ${HK} Paracetamol`, [HK], ["Paracetamol"]],
    ["en", "hn 6512345 cetirizine", ["6512345"], ["cetirizine"]],
    ["th", "HN 65O1234 ยาแก้แพ้", ["65O1234"], ["ยาแก้แพ้"]],
    ["th", "บัตรประชาชน 1234567890123", ["1234567890123"], []],
    ["en", "Passport No. AA1234567\nIBUPROFEN 200 mg", ["AA1234567"], ["IBUPROFEN 200 mg"]],
    ["th", "ชื่อผู้ป่วย สมมติ ใจทดสอบ\nบ้านเลขที่ 12/3 หมู่ 5 ต.ทดลอง อ.เมือง จ.ขอนแก่น 40000", ["สมมติ ใจทดสอบ", "12/3 หมู่ 5 ต.ทดลอง อ.เมือง จ.ขอนแก่น 40000"], []],
    ["th", "ร้านยาสาธิต\nสมพร ใจสมมติ\n55 ซอย 3 ถนนสาธิต แขวงทดลอง เขตบางรัก กรุงเทพฯ 10500\nรับประทานครั้งละ 1 เม็ด",
      ["สมพร ใจสมมติ", "55 ซอย 3 ถนนสาธิต แขวงทดลอง เขตบางรัก กรุงเทพฯ 10500"], ["รับประทานครั้งละ 1 เม็ด"]],
    ["zh", "患者姓名：钱样例\n地址：北京市朝阳区样例路12号", ["钱样例", "北京市朝阳区样例路12号"], []]
  );
  // 9. DEV-5 (owner decisions 2026-11-10): barcodes are never IDs, maker e-mails / call-centre numbers kept, honorific
  //    brands kept, HN written with spaces / H.N. / Hosp. No / MRN 病歷號碼, Taiwan medicine bags are dispensing labels
  D2.push(
    ["th", "บาร์โค้ด 8850006939727\nยาแก้ไอ", [], ["8850006939727"], "allow"],
    ["th", "8851234567893\nขนมอบกรอบ", [], ["8851234567893"], "allow"],
    ["en", "Manufactured by Example Co., Ltd.\ninfo@example-brand.test\nCall 1-800-555-0100", [], ["info@example-brand.test", "1-800-555-0100"], "allow"],
    ["en", "Customer care 1-888-123-4567", [], ["1-888-123-4567"], "allow"],
    ["en", "Dr. Sample Laboratories\nVitamin D3 1000 IU", [], ["Dr. Sample Laboratories"], "allow"],
    ["th", "ดร.สมุนไพร ยาหอมตำรับไทย", [], ["ดร.สมุนไพร"], "allow"],
    ["th", "คุณยายสมศรี เภสัช ยาดมสมุนไพร", [], ["คุณยายสมศรี เภสัช"], "allow"],
    ["th", "HN 6 5 1 2 3 4 5\nยาแก้แพ้", ["6 5 1 2 3 4 5"], ["ยาแก้แพ้"]],
    ["en", "H.N. 6512345\nCETIRIZINE", ["6512345"], ["CETIRIZINE"]],
    ["en", "Hosp. No 778899 IBUPROFEN", ["778899"], ["IBUPROFEN"]],
    ["zh", "MRN/病歷號碼: A123456 普拿疼", ["A123456"], ["普拿疼"]],
    ["zh", "姓名：王小明\n病歷號碼：A1234567\n民國113年11月10日\n每日三次", ["王小明", "A1234567"], ["每日三次"]],
    ["zh", "藥袋\n姓名 林測試\n113/11/10 調劑", ["林測試"], []]
  );
  // 10. DEV-6 (owner decision 2026-11-10, after the v5 independent check missed a Taiwan clinic label and a Shanghai
  //     outpatient slip): foreign dispensing labels with no 姓名 / 病历号 field. The photo must be blocked (and AI is off for
  //     them); a name with no field word is still not found in text (LIMIT), so only the IDs / numbers are listed as pii.
  //     Pack wording that must NOT read as a dispensing label follows (处方药, 请及时就诊, 請洽醫師藥師).
  D2.push(
    ["zh", "範例診所\n王樣本 先生\n身分證字號 A123456789\n看診日期 113/11/08\n普拿疼錠 500mg\n每日三次 每次一粒 飯後服用\n共 9 粒", ["A123456789"], ["普拿疼錠 500mg"], "block"],
    ["zh", "仁範耳鼻喉科診所 藥袋\n姓名：陳範例\n病歷號：0012345\n藥名：Amoxicillin 500mg\n用法：一天三次，每次一顆，飯後\n調劑日期：113.11.08\n藥師：林樣本", ["陳範例", "0012345"], ["Amoxicillin 500mg"], "block"],
    ["zh", "範例聯合門診\n林樣本 女 45歲\n門診日期 2026/11/08 科別 家醫科\nLoratadine 10mg 錠\n每日一次 每次一粒 睡前\n調劑藥師 張範例", [], ["Loratadine 10mg"], "block"],
    ["zh", "健保特約藥局\n領藥人 黃範例\nF223456786\n處方箋來源：範例醫院\nMetformin 500mg\n早晚飯後各一粒\n給藥日數 28 天", ["F223456786"], ["Metformin 500mg"], "block"],
    ["zh", "王樣本\nB123456780\n每日三次 飯後", ["B123456780"], ["每日三次"], "block"],
    ["zh", "上海市示例区中心医院 门诊\n张示例 男 52岁\n就诊卡号 6001234567\n科别：内分泌科\n二甲双胍片 0.5g×20片\n用法：口服 每次1片 一日2次\n发药窗口 3 号", [], ["二甲双胍片"], "block"],
    ["zh", "门诊处方\n费别：医保\n李示例 女 34岁\n科室：呼吸内科\n阿莫西林胶囊 0.25g\n每次2粒 一日3次 口服\n医师：样本华\n调配：测试明", [], ["阿莫西林胶囊"], "block"],
    ["zh", "上海示例社区卫生服务中心\n门诊药房\n样本华\n就诊日期 2026-11-10\n氨氯地平片 5mg\n一日一次 每次一片\n处方医师 王示例", [], ["氨氯地平片 5mg"], "block"],
    ["zh", "门诊用药指导单\n测试明 病历 20241110088\n硝苯地平控释片 30mg\n每日1次 每次1片 整片吞服\n请遵医嘱", [], ["硝苯地平控释片"], "block"],
    ["zh", "张示例 男 52岁\n阿司匹林肠溶片 100mg\n每日1次 每次1片", [], ["阿司匹林肠溶片"], "block"],
    ["zh", "阿莫西林胶囊 0.25g×24粒\n本品为处方药，凭医师处方销售、购买和使用\n如症状未缓解，请及时就诊\n请咨询医师或药师\n国药准字H44021351", [], ["国药准字H44021351", "0.25g×24粒"], "allow"],
    ["zh", "普拿樣本錠 500毫克\n警語：除非藥師、藥劑生或醫師指示，孕婦及授乳婦不建議自行使用\n衛署藥製字第012345號", [], ["衛署藥製字第012345號"], "allow"],
    ["zh", "感冒灵颗粒\nOTC 甲类 非处方药\n适用年龄：成人\n每次1袋 一日3次", [], ["每次1袋"], "allow"]
  );
  D2.forEach(([lang, text, pii, keep, image]) => items.push({ id: "g" + String(++n).padStart(3, "0"), lang, text, pii, keep, note: "dev-2", ...(image ? { image } : {}) }));
  return {
    name: "P7 patient-name / personal-identifier guard — fixed test set",
    source: "synthetic (written 2026-11-10 before the guard was built; every name, phone number, HN and ID is invented)",
    frozen: "2026-11-10",
    metrics: "recall = pii strings no longer present after redaction / all pii strings (target >= 99 %); " +
      "false redaction = keep strings damaged / all keep strings, and negative texts with any redaction",
    items
  };
}

/**
 * Scores a guard ({scan(text) -> [{kind, start, end}]}) on the set. A pii string counts as caught only when EVERY
 * non-space character of it is inside a removed span; a keep string is damaged when any removed span touches it.
 * @param {{scan: (t: string) => {kind: string, start: number, end: number}[]}} guard @param {any} set
 */
export function score(guard, set) {
  let pii = 0, caught = 0, keep = 0, damaged = 0, negTexts = 0, negRedacted = 0, imgAllowN = 0, imgFalseBlock = 0, imgBlockN = 0, imgMissedBlock = 0;
  const imgMiss = [];
  const misses = [], damage = [];
  for (const it of set.items) {
    const sp = guard.scan(it.text);
    const cov = i => sp.some(s => i >= s.start && i < s.end);
    for (const p of it.pii) {
      pii++;
      const at = it.text.indexOf(p);
      let ok = at >= 0;
      for (let i = 0; ok && i < p.length; i++) if (!/\s/.test(p[i]) && !cov(at + i)) ok = false;
      if (ok) caught++; else misses.push({ id: it.id, kind: "pii" });
    }
    for (const k of it.keep) {
      keep++;
      let at = -1, dmg = false;
      while ((at = it.text.indexOf(k, at + 1)) >= 0) for (let i = at; i < at + k.length; i++) if (cov(i)) dmg = true;
      if (dmg) { damaged++; damage.push({ id: it.id, keep: k }); }
    }
    if (!it.pii.length) { negTexts++; if (sp.length) negRedacted++; }
    if (guard.imageCheck) {
      const want = it.image || (it.pii.length ? "block" : "allow"), got = guard.imageCheck(it.text).block ? "block" : "allow";
      if (want === "allow") { imgAllowN++; if (got === "block") { imgFalseBlock++; imgMiss.push(it.id); } }
      else { imgBlockN++; if (got === "allow") { imgMissedBlock++; imgMiss.push(it.id); } }
    }
  }
  return { pii, caught, recall: pii ? caught / pii : null, keep, damaged, falseRedaction: keep ? damaged / keep : null, negTexts, negRedacted, misses, damage,
    image: { allowN: imgAllowN, falseBlock: imgFalseBlock, blockN: imgBlockN, missedBlock: imgMissedBlock, wrong: imgMiss } };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
export const HOLDOUT = join(dirname(OUT), "p7-guard-holdout.json");
/** The hold-out JSON, only when its SHA-256 still matches the frozen checksum file. */
export async function loadHoldout() {
  const { createHash } = await import("node:crypto");
  const buf = readFileSync(HOLDOUT);
  const want = readFileSync(HOLDOUT.replace(/\.json$/, ".sha256"), "utf8").split(/\s+/)[0];
  const got = createHash("sha256").update(buf).digest("hex");
  if (got !== want) throw new Error(`p7-guard-holdout.json changed after it was frozen (${got} != ${want})`);
  return JSON.parse(buf.toString("utf8"));
}
if (isMain && process.argv.includes("--holdout")) {
  // scored ONCE (2026-11-10); every run is appended to the log next to the set
  const { createRequire } = await import("node:module");
  const { createHash } = await import("node:crypto");
  const guard = createRequire(import.meta.url)("../lensiq-pc-guard.js");
  const set = await loadHoldout();
  const r = score(guard, set);
  const g = createHash("sha256").update(readFileSync(join(dirname(OUT), "..", "..", "lensiq-pc-guard.js"))).digest("hex");
  const { appendFileSync } = await import("node:fs");
  appendFileSync(HOLDOUT.replace(/\.json$/, "-runs.log"), `${new Date().toISOString()} guard ${g} recall ${r.caught}/${r.pii} damaged ${r.damaged}/${r.keep} ` +
    `image false-block ${r.image.falseBlock}/${r.image.allowN} missed-block ${r.image.missedBlock}/${r.image.blockN}\n`);
  console.log(JSON.stringify(r, null, 1));
} else if (isMain && process.argv.includes("--eval")) {
  const { createRequire } = await import("node:module");
  const guard = createRequire(import.meta.url)("../lensiq-pc-guard.js");
  const r = score(guard, JSON.parse(readFileSync(OUT, "utf8")));
  console.log(JSON.stringify(r, null, 1));
} else if (isMain) {
  const json = JSON.stringify(build(), null, 1) + "\n";
  if (process.argv.includes("--check")) {
    if (readFileSync(OUT, "utf8") !== json) { console.error("p7-guard-testset.json differs from tools/pc-guard-testset.mjs"); process.exit(1); }
    console.log("p7-guard-testset.json OK");
  } else {
    writeFileSync(OUT, json);
    const s = build();
    const sum = k => s.items.reduce((a, i) => a + i[k].length, 0);
    console.log(`items ${s.items.length}, with pii ${s.items.filter(i => i.pii.length).length}, pii strings ${sum("pii")}, keep strings ${sum("keep")}`);
  }
}
