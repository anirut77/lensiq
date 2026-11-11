#!/usr/bin/env node
// tools/pc-rules-build.mjs — Product Check P3: generate lensiq-claims-rules.js (the rule DATA used by lensiq-claims.js)
// from the P1 draft tools/pc-rules-draft.json. The draft itself is never edited: every tuning step is a named entry in
// CHANGES below (rule, what changed, why), so counsel and the pharmacist can review the draft and the diff separately.
//
//   node tools/pc-rules-build.mjs            write lensiq-claims-rules.js
//   node tools/pc-rules-build.mjs --check    exit 1 when lensiq-claims-rules.js is not what this script would write
//   node tools/pc-rules-build.mjs --changes  print the list of changes from the draft (for P3-RESULTS.md)
//
// Discipline (design §5.3): patterns are tuned on the DEV half of the text set only. The held-out half is scored once,
// at the end, and the SHA-256 of lensiq-claims-rules.js used for that run is recorded in docs/product-check/P3-RESULTS.md.
// The nutrient-function allowlist comes only from the official list (MoPH Notification No. 447, Annex 1), never from
// the labelled texts.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DRAFT = join(REPO, "tools", "pc-rules-draft.json");
export const OUT = join(REPO, "lensiq-claims-rules.js");

/** Chinese titles (the draft has TH / EN only). Plain descriptions of the signal; never "illegal". */
export const TITLE_ZH = {
  D01: "夸称神效或可根治", D02: "虚假或夸大的疗效", D03: "暗示含有产品中没有的成分", D04: "暗示堕胎或强力通经",
  D05: "暗示壮阳或避孕", D06: "宣传危险药品或特殊管制药品的疗效", D07: "由他人认可或称赞疗效", D08: "声称治疗第77条公告所列疾病",
  D09: "药品广告无广告批准号（ฆท.）", D10: "药品广告附送赠品或抽奖", D11: "未找到药品注册号或与注册名称不符", D12: "药品注册已注销或过期",
  D13: "广告不雅、歌舞表演或展示病人痛苦",
  F01: "神奇、奇迹等用语", F02: "最高级或排名用语（需有证据）", F03: "根治、永不复发、无需担心等用语", F04: "声称无副作用",
  F05: "滥用泰国食药局（อย.）标志或保证安全", F06: "声称快速或立即见效", F07: "声称降低疾病指标（胆固醇、血压、血糖、血脂）",
  F08: "声称预防疾病或对抗感染", F09: "声称治疗或缓解疾病或症状", F10: "声称改变身体结构或器官功能", F11: "声称增强性功能",
  F12: "食品声称美容或护肤功效", F13: "声称减肥或塑形", F14: "医疗专业人员推荐或认证", F15: "缺少膳食补充剂的强制警示语",
  F16: "食品注册号（13位）缺失、格式错误或属于其他产品", F17: "广告许可号（ฆอ.）缺失或查无记录",
  F18: "含卡痛叶的膳食补充剂或含大麻、汉麻、CBD 的食品声称身心作用", F19: "引用未经泰国食药局评估的研究或统计",
  F20: "与其他产品比较或贬低其他产品", F21: "环保或减碳声明缺乏证明", F22: "婴儿食品或婴儿配方奶粉广告",
  H01: "夸称神效、基于信仰或可根治", H02: "虚假、夸大或误导性的疗效", H03: "暗示含有产品中没有的成分", H04: "由个人、团体或机构认可疗效",
  H05: "草药产品声称治疗严重疾病", H06: "草药产品广告无许可号",
  C01: "声称治疗疾病或非化妆品用途", C02: "声称催情或壮阳", C03: "虚假或夸大的声明", C04: "引用研究、统计或认可",
  C05: "化妆品备案号查无记录、已撤销或属于其他厂商", C06: "标签缺少泰文、厂商或进口商、批号、生产/有效期或成分表",
  C07: "体内使用、注射或侵入性器械", C08: "声称对健康、身体结构或身体功能有作用"
};

/** Official standard statements that are warnings or disclaimers, not claims. Text inside them never raises a flag and
 *  a claim verb inside them does not count (e.g. "ไม่มีผลในการป้องกันหรือรักษาโรค" contains "ป้องกัน" and "รักษาโรค"). */
export const MASKS = [
  { id: "N293-no-prevent-treat", pattern: "ไม่มีผล\\s*(?:ใน|ต่อ)?\\s*การ\\s*ป้องกัน\\s*(?:หรือ|และ)?\\s*(?:รักษา|บำบัด)\\s*โรค",
    source: "MoPH Notification No. 293 (B.E. 2548), Annex item 1 (label warning)", url: "https://exfood.fda.moph.go.th/law/data/complilation/Compi_293.pdf" },
  { id: "N293-children-pregnant", pattern: "เด็ก\\s*และ\\s*สตรี\\s*มีครรภ์\\s*ไม่ควร\\s*รับประทาน",
    source: "MoPH Notification No. 293 (B.E. 2548), Annex item 1 (label warning)", url: "https://exfood.fda.moph.go.th/law/data/complilation/Compi_293.pdf" },
  { id: "N293-five-groups", pattern: "ควร\\s*(?:กิน|รับประทาน)\\s*อาหาร\\s*หลากหลาย\\s*ครบ\\s*(?:5|ห้า)\\s*หมู่[^.\\n]{0,60}",
    source: "MoPH Notification No. 293 (B.E. 2548), Annex item 1 (label warning)", url: "https://exfood.fda.moph.go.th/law/data/complilation/Compi_293.pdf" },
  { id: "F69-read-label", pattern: "อ่าน\\s*คำเตือน\\s*(?:ใน|บน)\\s*ฉลาก\\s*ก่อน\\s*(?:บริโภค|รับประทาน|ใช้)",
    source: "FDA food-advert notice B.E. 2569, Annex 4 item 1 (advert warning)", url: "https://ratchakitcha.soc.go.th/documents/123102.pdf" },
  { id: "MoPH-2554-not-for-treatment", pattern: "(?:ผลิตภัณฑ์นี้)?\\s*ไม่ใช้\\s*สำหรับ\\s*(?:รักษา|บำบัด|บรรเทา|ป้องกัน)(?:\\s*,?\\s*(?:หรือ\\s*)?(?:รักษา|บำบัด|บรรเทา|ป้องกัน))*\\s*โรค",
    source: "MoPH notice on probiotic micro-organisms in food (27 Jun 2554), cl.3(3.1) required statement",
    url: "https://exfood.fda.moph.go.th/law/data/complilation/Compi_339_346.pdf" },
  { id: "21CFR101.93c",
    pattern: "(?:this|these)\\s+statements?\\s+(?:has|have)\\s+not\\s+been\\s+evaluated\\s+by\\s+the\\s+food\\s+(?:and|&)\\s+drug\\s+administration\\.?" +
      "\\s*(?:this\\s+product\\s+is\\s+not\\s+intended\\s+to\\s+diagnose,?\\s+treat,?\\s+cure,?\\s+(?:or|and)\\s+prevent\\s+any\\s+disease\\.?)?",
    source: "21 CFR 101.93(c) (US dietary-supplement disclaimer)", url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-F/section-101.93" },
  { id: "21CFR101.93c-short", pattern: "not\\s+intended\\s+to\\s+diagnose,?\\s+treat,?\\s+cure,?\\s+(?:or|and)\\s+prevent\\s+any\\s+disease",
    source: "21 CFR 101.93(c) (US dietary-supplement disclaimer)", url: "https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-F/section-101.93" }
];

/** F15: the REQUIRED lines (absence check, whole label or whole advert only). */
export const WARNINGS = {
  label: [
    { id: "no-prevent-treat", text: "ไม่มีผลในการป้องกันหรือรักษาโรค", pattern: "ไม่มีผล\\s*(?:ใน)?\\s*การ\\s*ป้องกัน\\s*(?:หรือ)?\\s*รักษา\\s*โรค" },
    { id: "children-pregnant", text: "เด็กและสตรีมีครรภ์ไม่ควรรับประทาน", pattern: "เด็ก\\s*และ\\s*สตรี\\s*มีครรภ์\\s*ไม่ควร\\s*รับประทาน" },
    { id: "five-groups", text: "ควรกินอาหารหลากหลาย ครบ 5 หมู่ ในสัดส่วนที่เหมาะสมเป็นประจำ", pattern: "ควร\\s*(?:กิน|รับประทาน)\\s*อาหาร\\s*หลากหลาย\\s*ครบ\\s*(?:5|ห้า)\\s*หมู่" }
  ],
  ad: [
    { id: "children-pregnant", text: "เด็กและสตรีมีครรภ์ไม่ควรรับประทาน", pattern: "เด็ก\\s*และ\\s*สตรี\\s*มีครรภ์\\s*ไม่ควร\\s*รับประทาน" },
    { id: "no-prevent-treat", text: "ไม่มีผลในการป้องกันหรือรักษาโรค", pattern: "ไม่มีผล\\s*(?:ใน)?\\s*การ\\s*ป้องกัน\\s*(?:หรือ)?\\s*รักษา\\s*โรค" },
    { id: "read-label", text: "อ่านคำเตือนในฉลากก่อนบริโภค", pattern: "อ่าน\\s*คำเตือน\\s*(?:ใน|บน)\\s*ฉลาก\\s*ก่อน\\s*บริโภค" }
  ]
};

/** Approved nutrient-function claim statements: MoPH Notification No. 447 (B.E. 2566) "Health claims made on foods",
 *  Annex 1 (in force 2 Jul 2567 / 2024). Thai: the official Thai PDF (its font layer is broken, so it was read with
 *  on-device OCR, macOS Vision, and checked line by line against the page; 7 OCR slips fixed by hand, listed in
 *  N447_FIXES). English: the official FDA English translation (text layer). Numbering follows each document (the Thai
 *  annex numbers molybdenum 26, chromium 27, chloride 28; the English translation 27, 28, 29). */
export const N447_SOURCE = {
  source: "MoPH Notification No. 447 (B.E. 2566) Re: Health claims made on foods, Annex 1 (nutrient function claim statements)",
  url_th: "https://food.fda.moph.go.th/media.php?id=583907022966235136&name=P447.pdf",
  url_en: "https://food.fda.moph.go.th/media.php?id=607838556769099776&name=P447_EN.pdf",
  index: "https://food.fda.moph.go.th/food-law/category/food-labeling-and-nutrition-labeling",
  accessed: "2026-11-09",
  sha256_th_pdf: "ba15ab0b5754f1403347dd3b99bbff41d54e6429ebd4df263e11618edb344afd",
  sha256_en_pdf: "aa1df3c1cece48215e5a68bdbd144c9bd630b818149264d25d1e0ab144308851"
};
export const N447_FIXES = [
  "TH 6.1 (niacin) was mis-numbered by OCR and restored from the page",
  "TH 26.1 (molybdenum) OCR read '๖.๑'; renumbered 26.1",
  "TH 14.1, 20.1, 23.1, 24.6: item numbers garbled by OCR ('๑๔.ด', '๒๐.', '๒๓.', '2.6'); text kept, numbers restored",
  "TH 20.3: OCR 'แมกนี้เซียม' -> 'แมกนีเซียม'",
  "EN 15.1 (vitamin K, blood clotting) sits on the same text line as the nutrient name in the PDF; added by hand"
];
export const N447 = {
  th: [
    ["1.1", "โปรตีนจำเป็นต่อการเจริญเติบโตและ ช่วยซ่อมแซมส่วนที่สึกหรอของร่างกาย"],
    ["1.2", "โปรตีนให้กรดอะมิโนที่จำเป็นต่อการสร้าง โปรตีนชนิดต่าง ๆ ในร่างกาย"],
    ["1.3", "โปรตีนมีส่วนช่วยคงสภาพปกติของกระดูก"],
    ["1.4", "โปรตีนมีส่วนช่วยเสริมสร้างและคงสภาพ ของมวลกล้ามเนื้อ"],
    ["2.1", "ใยอาหารเพิ่มกากในระบบทางเดินอาหาร ช่วยกระตุ้นการขับถ่าย"],
    ["3.1", "วิตามินเอมีส่วนช่วยในการเจริญเติบโตของ ร่างกาย"],
    ["3.2", "วิตามินเอมีส่วนช่วยคงสภาพปกติของการ มองเห็น"],
    ["3.3", "วิตามินเอมีส่วนช่วยคงสภาพปกติของเยื่อบุ ต่าง ๆ"],
    ["3.4", "วิตามินเอมีส่วนช่วยในเมตาบอลิซึมปกติ ของเหล็ก"],
    ["3.5", "วิตามินเอมีส่วนช่วยในการทำหน้าที่ ตามปกติของระบบภูมิคุ้มกัน"],
    ["3.6", "วิตามินเอมีส่วนช่วยคงสภาพปกติของ ผิวหนัง"],
    ["4.1", "วิตามินบี 1 มีส่วนช่วยให้ร่างกายได้รับ พลังงานจากคาร์โบไฮเดรตตามปกติ"],
    ["4.2", "วิตามินบี 1 มีส่วนช่วยในการทำงาน ตามปกติของระบบประสาทและกล้ามเนื้อ"],
    ["4.3", "วิตามินบี 1 มีส่วนช่วยในการทำงาน ตามปกติของหัวใจ"],
    ["5.1", "วิตามินบี 2 มีส่วนช่วยให้ร่างกายได้รับ พลังงานจากคาร์โบไฮเดรต โปรตีน และไขมัน ตามปกติ"],
    ["5.2", "วิตามินบี 2 มีส่วนช่วยในการทำงาน ตามปกติของระบบประสาท"],
    ["5.3", "วิตามินบี 2 มีส่วนช่วยคงสภาพปกติของ เยื่อบุต่าง ๆ"],
    ["5.4", "วิตามินบี 2 มีส่วนช่วยคงสภาพปกติของ เม็ดเลือดแดง"],
    ["5.5", "วิตามินบี 2 มีส่วนช่วยคงสภาพปกติของ ผิวหนัง"],
    ["5.6", "วิตามินบี 2 มีส่วนช่วยคงสภาพปกติของ การมองเห็น"],
    ["5.7", "วิตามินบี 2 มีส่วนช่วยในเมตาบอลิซึมปกติ ของเหล็ก"],
    ["6.1", "ไนอะซิน มีส่วนช่วยคงสภาพปกติของเยื่อบุทางเดินอาหารและผิวหนัง"],
    ["6.2", "ไนอะซิน มีส่วนช่วยให้ร่างกายได้รับพลังงาน จากคาร์โบไฮเดรต โปรตีน และไขมัน ตามปกติ"],
    ["6.3", "ไนอะซินมีส่วนช่วยในการทำงานตามปกติ ของระบบประสาท"],
    ["7.1", "วิตามินบี 6 มีส่วนช่วยในการสร้างเม็ดเลือด แดงตามปกติ"],
    ["7.2", "วิตามินบี 6 มีส่วนช่วยในการทำงาน ตามปกติของระบบประสาท"],
    ["7.3", "วิตามินบี 6 มีส่วนช่วยให้ร่างกายได้รับ พลังงานจากเมตาบอลิซึมตามปกติ"],
    ["7.4", "วิตามินบี 6 มีส่วนช่วยในเมตาบอลิซึมปกติ ของโปรตีนและไกลโคเจน"],
    ["7.5", "วิตามินบี 6 มีส่วนช่วยในการทำหน้าที่ ตามปกติของระบบภูมิคุ้มกัน"],
    ["8.1", "กรดโฟลิค/โฟเลตมีส่วนช่วยในการสร้าง เม็ดเลือดแดงตามปกติ"],
    ["8.2", "กรดโฟลิค/โฟเลตมีส่วนช่วยในการ สังเคราะห์กรดอะมิโนตามปกติ"],
    ["8.3", "กรดโฟลิค/โฟเลตมีส่วนช่วยในการทำหน้าที่ ตามปกติของระบบภูมิคุ้มกัน"],
    ["9.1", "ไบโอตินมีส่วนช่วยให้ร่างกายได้รับพลังงาน จากเมตาบอลิซึมตามปกติ"],
    ["9.2", "ไบโอตินมีส่วนช่วยในเมตาบอลิซึมปกติของ คาร์โบไฮเดรต โปรตีน และไขมัน"],
    ["9.3", "ไบโอตินมีส่วนช่วยในการทำงานตามปกติ ของระบบประสาท"],
    ["9.4", "ไบโอตินมีส่วนช่วยคงสภาพปกติของเส้นผม"],
    ["9.5", "ไบโอตินมีส่วนช่วยคงสภาพปกติของผิวหนัง"],
    ["9.6", "ไบโอตินมีส่วนช่วยคงสภาพปกติของเยื่อบุ ต่าง ๆ"],
    ["10.1", "กรดแพนโทธินิคมีส่วนช่วยให้ร่างกาย ได้รับพลังงานจากเมตาบอลิซึมตามปกติ"],
    ["10.2", "กรดแพนโทธินิคมีส่วนช่วยในการ สังเคราะห์และเมตาบอลิซึมตามปกติของ ฮอร์โมน วิตามินดี และสารสื่อประสาทบาง ชนิด"],
    ["11.1", "วิตามินบี 12 ช่วยสร้างสารที่จำเป็นในการ สร้างเซลล์เม็ดเลือดแดง"],
    ["11.2", "วิตามินบี 12 มีส่วนช่วยในการทำงาน ตามปกติของระบบประสาทและสมอง"],
    ["11.3", "วิตามินบี 12 มีส่วนช่วยให้ร่างกายได้รับ พลังงานจากเมตาบอลิซึมตามปกติ"],
    ["11.4", "วิตามินบี 12 มีส่วนช่วยในการทำหน้าที่ ตามปกติของระบบภูมิคุ้มกัน"],
    ["12.1", "วิตามินซีช่วยให้หลอดเลือดแข็งแรง"],
    ["12.2", "วิตามินซีมีส่วนช่วยในกระบวนการต่อต้าน อนุมูลอิสระ"],
    ["12.3", "วิตามินซีมีส่วนช่วยในการปกป้องเซลล์ จากอนุมูลอิสระ"],
    ["12.4", "วิตามินซีมีส่วนช่วยในการสร้างคอลลาเจน เพื่อการทำงานตามปกติของกระดูกอ่อน"],
    ["12.5", "วิตามินซีมีส่วนช่วยในการสร้างคอลลาเจน เพื่อการทำงานตามปกติของกระดูก"],
    ["12.6", "วิตามินซีมีส่วนช่วยในการสร้างคอลลาเจน เพื่อการทำงานตามปกติของเหงือก"],
    ["12.7", "วิตามินซีมีส่วนช่วยในการสร้างคอลลาเจน เพื่อการทำงานตามปกติของผิวหนัง"],
    ["12.8", "วิตามินซีมีส่วนช่วยในการสร้างคอลลาเจน เพื่อการทำงานตามปกติของฟัน"],
    ["12.9", "วิตามินซีมีส่วนช่วยให้ร่างกายได้รับ พลังงานจากเมตาบอลิซึมตามปกติ"],
    ["12.10", "วิตามินซีมีส่วนช่วยในการทำงาน ตามปกติของระบบประสาท"],
    ["12.11", "วิตามินซีมีส่วนช่วยในการทำหน้าที่ ตามปกติของระบบภูมิคุ้มกัน"],
    ["12.12", "วิตามินซีมีส่วนช่วยในการคืนสภาพของ รีดิวซ์วิตามินอี"],
    ["12.13", "วิตามินซีเพิ่มการดูดซึมเหล็ก"],
    ["13.1", "วิตามินดีมีส่วนช่วยในการดูดซึมตามปกติ ของแคลเซียมและฟอสฟอรัส"],
    ["13.2", "วิตามินดีมีส่วนช่วยให้ระดับแคลเซียมใน เลือดเป็นปกติ"],
    ["13.3", "วิตามินดีมีส่วนช่วยคงสภาพปกติของ กระดูก"],
    ["13.4", "วิตามินดีมีส่วนช่วยคงสภาพปกติของฟัน"],
    ["13.5", "วิตามินดีมีส่วนช่วยในการทำงานตามปกติ ของกล้ามเนื้อ"],
    ["13.6", "วิตามินดีมีส่วนช่วยในการทำหน้าที่ ตามปกติของระบบภูมิคุ้มกัน"],
    ["14.1", "วิตามินอีมีส่วนช่วยในกระบวนการต่อต้านอนุมูลอิสระ"],
    ["14.2", "วิตามินอีมีส่วนช่วยในการปกป้องเซลล์ จากอนุมูลอิสระ"],
    ["15.1", "วิตามินเคมีส่วนช่วยในการแข็งตัว ตามปกติของเลือด"],
    ["15.2", "วิตามินเคมีส่วนช่วยคงสภาพปกติของ กระดูก"],
    ["16.1", "แคลเซียมจำเป็นต่อการคงสภาพปกติของ กระดูกและฟัน"],
    ["16.2", "แคลเซียมมีส่วนช่วยในการแข็งตัว ตามปกติของเลือด"],
    ["16.3", "แคลเซียมมีส่วนช่วยในกระบวนการสร้าง กระดูกและฟันที่แข็งแรง"],
    ["16.4", "แคลเซียมมีส่วนช่วยให้ร่างกายได้รับ พลังงานจากเมตาบอลิซึมตามปกติ"],
    ["16.5", "แคลเซียมมีส่วนช่วยในการทำงาน ตามปกติของกล้ามเนื้อ"],
    ["16.6", "แคลเซียมมีส่วนช่วยในการทำงานตามปกติ ของสารสื่อประสาท"],
    ["16.7", "แคลเซียมมีส่วนช่วยในการทำงาน ตามปกติของเอนไซม์ในระบบย่อยอาหาร"],
    ["17.1", "ฟอสฟอรัสจำเป็นต่อการคงสภาพปกติของ กระดูกและฟัน"],
    ["17.2", "ฟอสฟอรัสมีส่วนช่วยในกระบวนการสร้าง กระดูกและฟันที่แข็งแรง"],
    ["17.3", "ฟอสฟอรัสมีส่วนช่วยให้ร่างกายได้รับ พลังงานจากเมตาบอลิซึมตามปกติ"],
    ["17.4", "ฟอสฟอรัสมีส่วนช่วยในการทำงานตามปกติ ของเยื่อหุ้มเซลล์"],
    ["18.1", "เหล็กมีส่วนช่วยในการสร้างเม็ดเลือดแดง และฮีโมโกลบินตามปกติ"],
    ["18.2", "เหล็กมีส่วนช่วยให้ร่างกายได้รับพลังงาน จากเมตาบอลิซึมตามปกติ"],
    ["18.3", "เหล็กมีส่วนช่วยในการขนส่งออกซิเจนใน ร่างกายตามปกติ"],
    ["18.4", "เหล็กมีส่วนช่วยในการทำหน้าที่ตามปกติ ของระบบภูมิคุ้มกัน"],
    ["19.1", "ไอโอดีนมีส่วนช่วยในการสร้างฮอร์โมน ไทรอยด์และการทำงานของไทรอยด์ ตามปกติ"],
    ["19.2", "ไอโอดีนมีส่วนช่วยให้ร่างกายได้รับ พลังงานจากเมตาบอลิซึมตามปกติ"],
    ["19.3", "ไอโอดีนมีส่วนช่วยในการทำงานตามปกติ ของระบบประสาท"],
    ["19.4", "ไอโอดีนมีส่วนช่วยคงสภาพปกติของ ผิวหนัง"],
    ["20.1", "แมกนีเซียมเป็นส่วนประกอบของกระดูกและฟัน"],
    ["20.2", "แมกนีเซียมมีส่วนช่วยในการทำงาน ตามปกติของระบบประสาทและกล้ามเนื้อ"],
    ["20.3", "แมกนีเซียมมีส่วนช่วยรักษาสมดุลของอิเล็คโตรไลท์"],
    ["20.4", "แมกนีเซียมมีส่วนช่วยให้ร่างกายได้รับ พลังงานจากเมตาบอลิซึมตามปกติ"],
    ["20.5", "แมกนีเซียมมีส่วนช่วยในการสังเคราะห์ โปรตีนตามปกติ"],
    ["20.6", "แมกนีเซียมมีส่วนช่วยคงสภาพปกติของ กระดูก"],
    ["20.7", "แมกนีเซียมมีส่วนช่วยคงสภาพปกติของ ฟัน"],
    ["21.1", "สังกะสีช่วยในการเจริญเติบโตของร่างกาย"],
    ["21.2", "สังกะสีมีส่วนช่วยในการสังเคราะห์ดีเอ็นเอ ตามปกติ"],
    ["21.3", "สังกะสีมีส่วนช่วยในเมตาบอลิซึมปกติของ คาร์โบไฮเดรต โปรตีน และไขมัน"],
    ["21.4", "สังกะสีมีส่วนช่วยในเมตาบอลิซึมปกติของ กรดไขมัน"],
    ["21.5", "สังกะสีมีส่วนช่วยในเมตาบอลิซึมปกติของ"],
    ["21.6", "สังกะสีมีส่วนช่วยในการสังเคราะห์โปรตีน ตามปกติ"],
    ["21.7", "สังกะสีมีส่วนช่วยคงสภาพปกติของกระดูก"],
    ["21.8", "สังกะสีมีส่วนช่วยคงสภาพปกติของเส้นผม"],
    ["21.9", "สังกะสีมีส่วนช่วยคงสภาพปกติของเล็บ"],
    ["21.10", "สังกะสีมีส่วนช่วยคงสภาพปกติของ ผิวหนัง"],
    ["21.11", "สังกะสีมีส่วนช่วยคงสภาพปกติของการ มองเห็น"],
    ["21.12", "สังกะสีมีส่วนช่วยในการทำหน้าที่ ตามปกติของระบบภูมิคุ้มกัน"],
    ["21.13", "สังกะสีมีส่วนช่วยในกระบวนการต่อต้าน อนุมูลอิสระ"],
    ["21.14", "สังกะสีมีส่วนช่วยในการปกป้องเซลล์ จากอนุมูลอิสระ"],
    ["22.1", "ทองแดงมีส่วนช่วยในการสร้างฮีโมโกลบิน"],
    ["22.2", "ทองแดงมีส่วนช่วยคงสภาพปกติของ เนื้อเยื่อเกี่ยวพัน"],
    ["22.3", "ทองแดงมีส่วนช่วยให้ร่างกายได้รับ พลังงานจากเมตาบอลิซึมตามปกติ"],
    ["22.4", "ทองแดงมีส่วนช่วยในการทำงานตามปกติ ของระบบประสาท"],
    ["22.5", "ทองแดงมีส่วนช่วยในการขนส่งเหล็กใน ร่างกายตามปกติ"],
    ["22.6", "ทองแดงมีส่วนช่วยในการทำหน้าที่ตามปกติ ของระบบภูมิคุ้มกัน"],
    ["22.7", "ทองแดงมีส่วนช่วยในกระบวนการต่อต้าน อนุมูลอิสระ"],
    ["22.8", "ทองแดงมีส่วนช่วยในการปกป้องเซลล์จาก อนุมูลอิสระ"],
    ["23.1", "โพแทสเซียมมีส่วนช่วยในการรักษาสมดุลของกรด-ด่าง และอิเล็คโตรไลท์"],
    ["23.2", "โพแทสเซียมมีส่วนช่วยในการทำงาน ตามปกติของระบบประสาท"],
    ["23.3", "โพแทสเซียมมีส่วนช่วยในการทำงาน ตามปกติของกล้ามเนื้อ"],
    ["24.1", "แมงกานีสมีส่วนร่วมในการทำงานของ เอนไซม์หลายกลุ่มในร่างกาย"],
    ["24.2", "แมงกานีสมีส่วนช่วยให้ร่างกายได้รับ พลังงานจากเมตาบอลิซึมตามปกติ"],
    ["24.3", "แมงกานีสมีส่วนช่วยคงสภาพปกติของ กระดูก"],
    ["24.4", "แมงกานีสมีส่วนช่วยในการสร้างเนื้อเยื่อ เกี่ยวพันตามปกติ"],
    ["24.5", "แมงกานีสมีส่วนช่วยในกระบวนการ ต่อต้านอนุมูลอิสระ"],
    ["24.6", "แมงกานีสมีส่วนช่วยในการปกป้องเซลล์จากอนุมูลอิสระ"],
    ["25.1", "ซีลีเนียมมีส่วนช่วยในกระบวนการต่อต้าน อนุมูลอิสระ"],
    ["25.2", "ซีลีเนียมมีส่วนช่วยในการปกป้องเซลล์จาก อนุมูลอิสระ"],
    ["25.3", "ซีลีเนียมมีส่วนช่วยคงสภาพปกติของเส้น ผม"],
    ["25.4", "ซีลีเนียมมีส่วนช่วยคงสภาพปกติของเล็บ"],
    ["25.5", "ซีลีเนียมมีส่วนช่วยในการทำหน้าที่ตามปกติ ของระบบภูมิคุ้มกัน"],
    ["25.6", "ซีลีเนียมมีส่วนช่วยในการทำงานตามปกติ ของไทรอยด์"],
    ["26.1", "โมลิบดีนัมมีส่วนช่วยในการทำงานของเอนไซม์บางชนิดในร่างกาย"],
    ["27.1", "โครเมียมมีส่วนช่วยในการทำงานของ อินซูลินในการนำกลูโคสเข้าเซลล์"],
    ["27.2", "โครเมียมมีส่วนช่วยในเมตาบอลิซึมปกติ ของคาร์โบไฮเดรต โปรตีน และไขมัน"],
    ["28.1", "คลอไรด์มีส่วนช่วยรักษาสมดุลของกรด- ด่างในร่างกาย"],
    ["28.2", "คลอไรด์เป็นส่วนประกอบของกรดไฮโดร คลอริคในระบบย่อยอาหาร"]
  ],
  en: [
    ["1.1", "Protein contributes to a growth and help repair body tissue"],
    ["1.2", "Protein contributes to a source of essential amino acids for body protein synthesis"],
    ["1.3", "Protein contributes to the maintenance of normal bones"],
    ["1.4", "Protein contributes to growth and maintenance of muscle mass"],
    ["2.1", "Dietary fiber contributes to an increase in fecal bulk in GI tract and stimulates the bowel movement"],
    ["3.1", "Vitamin A has a role in body growth"],
    ["3.2", "Vitamin A contributes to the maintenance of normal vision"],
    ["3.3", "Vitamin A contributes to the maintenance of normal mucous membranes"],
    ["3.4", "Vitamin A contributes to normal iron metabolism"],
    ["3.5", "Vitamin A contributes to the normal function of the immune system"],
    ["3.6", "Vitamin A contributes to the maintenance of normal skin"],
    ["4.1", "Thiamine contributes to normal energy yielding metabolism from carbohydrate"],
    ["4.2", "Thiamine contributes to the normal function of muscle and nervous system"],
    ["4.3", "Thiamine contributes to the normal function of the heart"],
    ["5.1", "Riboflavin contributes to normal energy yielding metabolism from carbohydrate, protein and fat"],
    ["5.2", "Riboflavin contributes to the normal function of the nervous system"],
    ["5.3", "Riboflavin contributes to the maintenance of normal mucous membranes"],
    ["5.4", "Riboflavin contributes to the maintenance of normal red blood cells"],
    ["5.5", "Riboflavin contributes to the maintenance of normal skin"],
    ["5.6", "Riboflavin contributes to the maintenance of normal vision"],
    ["5.7", "Riboflavin contributes to the normal metabolism of iron"],
    ["6.1", "Niacin contributes to maintenance of normal mucous membrane of GI tract and normal skin"],
    ["6.2", "Niacin contributes to normal energy yielding metabolism from carbohydrate, protein and fat"],
    ["6.3", "Niacin contributes to the normal function of the nervous system"],
    ["7.1", "Vitamin B6 contributes to normal red blood cell formation"],
    ["7.2", "Vitamin B6 contributes to the normal function of the nervous system"],
    ["7.3", "Vitamin B6 contributes to normal energy-yielding metabolism"],
    ["7.4", "Vitamin B6 contributes to normal protein and glycogen metabolism"],
    ["7.5", "Vitamin B6 contributes to the normal function of the immune system"],
    ["8.1", "Folic acid/Folate contributes to normal red blood formation"],
    ["8.2", "Folic acid/Folate contributes to normal amino acid synthesis"],
    ["8.3", "Folic acid/Folate contributes to the normal function of the immune system"],
    ["9.1", "Biotin contributes to normal energy-yielding metabolism"],
    ["9.2", "Biotin contributes to normal macronutrient metabolism"],
    ["9.3", "Biotin contributes to the normal function of the nervous system"],
    ["9.4", "Biotin contributes to the maintenance of normal hair"],
    ["9.5", "Biotin contributes to the maintenance of normal skin"],
    ["9.6", "Biotin contributes to the maintenance of normal mucous membranes"],
    ["10.1", "Pantothenic acid contributes to normal energy-yielding metabolism"],
    ["10.2", "Pantothenic acid contributes to normal synthesis and metabolism of steroid hormones, vitamin D and some neurotransmitters"],
    ["11.1", "Vitamin B12 contributes to the synthesis of essential substance for red blood cell formation"],
    ["11.2", "Vitamin B12 contributes to the normal function of the brain and nervous system"],
    ["11.3", "Vitamin B12 contributes to normal energy-yielding metabolism"],
    ["11.4", "Vitamin B12 contributes to the normal function of the immune system"],
    ["12.1", "Vitamin C contributes to strengthen blood vessel"],
    ["12.2", "Vitamin C contributes to the protection of cells from oxidative stress"],
    ["12.3", "Vitamin C contributes to the protection of cells from oxidative stress"],
    ["12.4", "Vitamin C contributes to normal collagen formation for the normal function of cartilage"],
    ["12.5", "Vitamin C contributes to normal collagen formation for the normal function of bones"],
    ["12.6", "Vitamin C contributes to normal collagen formation for the normal function of gums"],
    ["12.7", "Vitamin C contributes to normal collagen formation for the normal function of skin"],
    ["12.8", "Vitamin C contributes to normal collagen formation for the normal function of teeth"],
    ["12.9", "Vitamin C contributes to normal energy-yielding metabolism"],
    ["12.10", "Vitamin C contributes to the normal function of the nervous system"],
    ["12.11", "Vitamin C contributes to the normal function of the immune system"],
    ["12.12", "Vitamin C contributes to the regeneration of the reduced form of vitamin E"],
    ["12.13", "Vitamin C increases iron absorption"],
    ["13.1", "Vitamin D contributes to normal absorption of calcium and phosphorous"],
    ["13.2", "Vitamin D contributes to normal blood calcium levels"],
    ["13.3", "Vitamin D contributes to the maintenance of normal bones"],
    ["13.4", "Vitamin D contributes to the maintenance of normal teeth"],
    ["13.5", "Vitamin D contributes to the maintenance of normal muscle function"],
    ["13.6", "Vitamin D contributes to the normal function of the immune system"],
    ["14.1", "Vitamin E contributes to the protection of cells from oxidative stress"],
    ["14.2", "Vitamin E contributes to the protection of cells from oxidative stress"],
    ["15.1", "Vitamin K contributes to normal blood clotting"],
    ["15.2", "Vitamin K contributes to the maintenance of normal bones"],
    ["16.1", "Calcium is needed for the maintenance of normal bones and teeth"],
    ["16.2", "Calcium contributes to normal blood clotting"],
    ["16.3", "Calcium contributes to the synthesis of bones and teeth"],
    ["16.4", "Calcium contributes to normal energy-yielding metabolism"],
    ["16.5", "Calcium contributes to normal muscle function"],
    ["16.6", "Calcium contributes to normal neurotransmission"],
    ["16.7", "Calcium contributes to the normal function of digestive enzymes"],
    ["17.1", "Phosphorus is needed for the maintenance of normal bones and teeth"],
    ["17.2", "Phosphorus contributes to the synthesis of bones and teeth"],
    ["17.3", "Phosphorus contributes to normal energy-yielding metabolism"],
    ["17.4", "Phosphorus contributes to normal function of cell membranes"],
    ["18.1", "Iron contributes to normal formation of red blood cells and haemoglobin"],
    ["18.2", "Iron contributes to normal energy-yielding metabolism"],
    ["18.3", "Iron contributes to normal oxygen transport in the body"],
    ["18.4", "Iron contributes to the normal function of the immune system"],
    ["19.1", "Iodine contributes to the normal production of thyroid hormones and normal thyroid function"],
    ["19.2", "Iodine contributes to normal energy-yielding metabolism"],
    ["19.3", "Iodine contributes to normal function of the nervous system"],
    ["19.4", "Iodine contributes to the maintenance of normal skin"],
    ["20.1", "Magnesium is a component of bones and teeth"],
    ["20.2", "Magnesium contributes to the normal function of the muscle and nervous system"],
    ["20.3", "Magnesium contributes to electrolyte balance"],
    ["20.4", "Magnesium contributes to normal energy-yielding metabolism"],
    ["20.5", "Magnesium contributes to normal protein synthesis"],
    ["20.6", "Magnesium contributes to the maintenance of normal bones"],
    ["20.7", "Magnesium contributes to the maintenance of normal teeth"],
    ["21.1", "Zinc contributes to growth"],
    ["21.2", "Zinc contributes to normal DNA synthesis"],
    ["21.3", "Zinc contributes to normal macronutrient metabolism"],
    ["21.4", "Zinc contributes to normal metabolism of fatty acids"],
    ["21.5", "Zinc contributes to normal metabolism of vitamin A"],
    ["21.6", "Zinc contributes to normal protein synthesis"],
    ["21.7", "Zinc contributes to the maintenance of normal bones"],
    ["21.8", "Zinc contributes to the maintenance of normal hair"],
    ["21.9", "Zinc contributes to the maintenance of normal nails"],
    ["21.10", "Zinc contributes to the maintenance of normal skin"],
    ["21.11", "Zinc contributes to the maintenance of normal vision"],
    ["21.12", "Zinc contributes to the normal function of the immune system"],
    ["21.13", "Zinc contributes to the protection of cells from oxidative stress"],
    ["21.14", "Zinc contributes to the protection of cells from oxidative stress"],
    ["22.1", "Copper contributes to haemoglobin synthesis"],
    ["22.2", "Copper contributes to the maintenance of normal connective tissues"],
    ["22.3", "Copper contributes to normal energy-yielding metabolism"],
    ["22.4", "Copper contributes to the normal function of the nervous system"],
    ["22.5", "Copper contributes to normal iron transport in the body"],
    ["22.6", "Copper contributes to the normal function of the immune system"],
    ["22.7", "Copper contributes to the protection of cells from oxidative stress"],
    ["22.8", "Copper contributes to the protection of cells from oxidative stress"],
    ["23.1", "Potassium contributes to acid-base and electrolyte balance"],
    ["23.2", "Potassium contributes to the normal function of the nervous system"],
    ["23.3", "Potassium contributes to normal muscle function"],
    ["24.1", "Manganese contributes to the function of enzymes in the body"],
    ["24.2", "Manganese contributes to normal energy-yielding metabolism"],
    ["24.3", "Manganese contributes to the maintenance of normal bones"],
    ["24.4", "Manganese contributes to the normal formation of connective tissue"],
    ["24.5", "Manganese contributes to the protection of cells from oxidative stress"],
    ["24.6", "Manganese contributes to the protection of cells from oxidative stress"],
    ["25.1", "Selenium contributes to the protection of cells from oxidative stress"],
    ["25.2", "Selenium contributes to the protection of cells from oxidative stress"],
    ["25.3", "Selenium contributes to the maintenance of normal hair"],
    ["25.4", "Selenium contributes to the maintenance of normal nails"],
    ["25.5", "Selenium contributes to the normal function of the immune system"],
    ["25.6", "Selenium contributes to the normal thyroid function"],
    ["27.1", "Molybdenum contributes to the normal function of some enzymes in the body"],
    ["28.1", "Chromium contributes to glucose-uptake function of insulin"],
    ["28.2", "Chromium contributes to normal macronutrient metabolism"],
    ["29.1", "Chloride contributes to the maintenance of acid-base balance"],
    ["29.2", "Chloride contributes to the normal digestion by production of hydrochloric acid in the stomach"]
  ]
};

/* ---------------- tuning changes from the draft (DEV split only) ---------------- */
// Each change names the rule, what changed and why. "why" describes the kind of wording the draft missed or over-matched
// on the dev half (no held-out text was looked at). Patterns are written as general phrasings, not copies of dev texts.
const add = (/** @type {string} */ lang, /** @type {string[]} */ ps) => (/** @type {any} */ r) => {
  r.patterns[lang] = [...(r.patterns[lang] || []), ...ps];
};
const swap = (/** @type {string} */ lang, /** @type {string} */ from, /** @type {string} */ to) => (/** @type {any} */ r) => {
  const i = (r.patterns[lang] || []).indexOf(from);
  if (i < 0) throw new Error(`${r.id}: pattern not in draft: ${from}`);
  r.patterns[lang][i] = to;
};
const exclude = (/** @type {string[]} */ ps) => (/** @type {any} */ r) => { r.exclude = [...(r.exclude || []), ...ps]; };
const all = (/** @type {Function[]} */ ...fs) => (/** @type {any} */ r) => fs.forEach(f => f(r));
const L = (/** @type {string[]} */ ...parts) => parts.join(" ");

// Verb sets for the "claim verb required" rules: treat / relieve only. Prevention wording belongs to F08 (prevent), so
// F09 no longer fires on "ป้องกันโรคหัวใจ" (that is F08).
const TREAT_VERBS = {
  th: "(?:รักษา|บำบัด|บรรเทา|แก้|หาย|ฟื้นฟู|กำจัด|ลดอาการ|พิชิต|ทางออก|ต้าน(?!อนุมูล)|ยับยั้ง|ช่วยเรื่อง|ดูแล)",
  en: "(?:treat|cure|heal|relie|alleviat|eliminat|revers|control|manag|fight|beat|combat|target|sufferer|support|helped|anti-?(?=hyperglyc|diabet|viral|cancer|tumou?r|inflammat))",
  zh: "(?:治|疗|愈|缓解|根治|功效|改善|防|抗|抑制|溶|降)"
};
const H05_VERBS = { th: TREAT_VERBS.th.replace("(?:", "(?:ป้องกัน|"), en: TREAT_VERBS.en.replace("(?:", "(?:prevent|"), zh: TREAT_VERBS.zh };
const FAST_TH = [
  "(?:ผอม|ลด|หาย|แข็งแรง|ขาว|ใส|ดีขึ้น|เห็นผล)\\S{0,6}ทันที",
  "(?<!ภาย)ใน\\s*\\d+\\s*(?:วัน|สัปดาห์|อาทิตย์|ชั่วโมง|คืน)",
  "ใน(?:สัปดาห์|อาทิตย์|วัน|คืน)เดียว",
  "ทันใจ",
  "อย่างรวดเร็ว"
];
const FAST_EXCLUDE = [
  "(?:บริโภค|รับประทาน|ทาน|ใช้|เก็บ|หลังเปิด)\\S{0,8}(?:ภาย)?ใน\\s*\\d+\\s*(?:วัน|ชั่วโมง|เดือน)",
  "\\buse\\s+within\\b",
  // post-review (P3 reviewer F2): English storage / use-by instructions
  "\\b(?:consume|use|eat|drink|finish|store|keep)(?:d|ed|en)?\\s+within\\s+\\d+\\s+(?:days?|hours?|weeks?)",
  "\\bafter\\s+opening\\b[^.]{0,60}"
];
const SEX_ORGAN_FIRM = "(?:อวัยวะเพศ|น้องชาย|ท่านชาย)\\S{0,6}แข็งตัว|แข็งตัว(?:นาน|ดี)";

export const CHANGES = [
  {
    rule: "D01", what: "add complete-cure wording หายเกลี้ยง / หายแน่นอน / หายเด็ดขาด", why: "dev: 'cure for sure' phrasings missed",
    apply: add("th", ["หายเกลี้ยง", "หายแน่นอน", "หายเด็ดขาด", "ไม่หายคืนเงิน"])
  },
  {
    rule: "D02", what: "add fast-result, guarantee, body-function and anti-virus efficacy wording for drugs",
    why: L("dev: exaggerated drug efficacy written as 'results in N days', 'works for every problem', organ tonic or virus-killing",
      "claims was missed"),
    apply: all(
      add("th", ["เห็นผล(?:ภาย)?ใน\\s*\\d+", "ทุกปัญหา", "ได้ผลจริง", "บำรุง(?:หัวใจ|ปอด|สมอง|ตับ|ไต)", "หุ่นสวย", "ความอ้วน"]),
      add("en", [
        "\\bkills?\\s+(?:the\\s+)?virus",
        "\\bboosts?\\s+(?:your\\s+)?immune",
        "\\bantiviral",
        "\\bresistance\\s+to\\s+(?:the\\s+)?(?:novel\\s+)?corona"
      ]))
  },
  {
    rule: "D08", what: "treat-only verb set (TREAT_VERBS) and window 60",
    why: "dev: prevention wording is not a treat claim; long indication lists put the verb further away",
    apply: r => { r.verbs = TREAT_VERBS; r.claim_window = 60; }
  },
  {
    rule: "F01", what: "\\bmiracl(?:e|ous) -> \\bmiracu?l(?:e|ous)", why: "dev: 'miraculous' (spelled miracul-) was missed",
    apply: swap("en", "\\bmiracl(?:e|ous)", "\\bmiracu?l(?:e|ous)")
  },
  {
    rule: "F04", what: "add 'no jitters / no dry mouth' style no-side-effect wording and 'devoid of side effects'",
    why: "dev: side-effect-free claims written as a list of absent effects were missed",
    apply: all(
      add("th", ["ไม่มี(?:เอฟเฟ[คก]|ผลกระทบ)", "ไม่(?:ใจสั่น|ดีด|ปากแห้ง|ปวดหัว|ท้องเสีย|โยโย่)"]),
      add("en", ["\\bdevoid\\s+of\\s+side[- ]effects?"]),
      add("zh", ["不良反应"]))
  },
  {
    rule: "F06", what: "add 'in N days', 'in one week', 'instantly slim' and English 'within the first week'; exclude storage / use-by instructions",
    why: "dev: fast-result claims without the word เห็นผล were missed",
    apply: all(
      add("th", FAST_TH),
      add("en", [
        "\\bwithin\\s+(?:the\\s+first\\s+|a\\s+|one\\s+|\\d+\\s+)(?:days?|weeks?|hours?|nights?)\\b",
        "\\bin\\s+(?:just\\s+)?(?:one|a|\\d+)\\s+(?:day|week|night)s?\\b"
      ]),
      exclude(FAST_EXCLUDE))
  },
  {
    rule: "F07", what: "add control / keep-steady / support wording for blood sugar, pressure and cholesterol",
    why: "dev: 'ควบคุมระดับน้ำตาล', 'น้ำตาลในเลือดคงที่', 'keep blood sugar at an optimum level' were missed",
    apply: all(
      add("th", [
        "(?:ควบคุม|คุม|ปรับ|รักษา)(?:ระดับ)?\\s*(?:น้ำตาล|ความดัน|ไขมันในเลือด|โคเลสเตอรอล|คอเลสเตอรอล)",
        "น้ำตาลในเลือด\\S{0,6}(?:คงที่|ปกติ|ลดลง|สมดุล)",
        "(?:ลด|บรรเทา)\\S{0,12}ความดันโลหิต"
      ]),
      add("en", [
        "\\b(?:manage|stabili[sz]e|support)s?\\w*\\s+(?:healthy\\s+)?(?:your\\s+)?(?:blood\\s+sugar|blood\\s+glucose|glucose|blood\\s+pressure|cholesterol)",
        "\\b(?:keep|keeps|keeping|maintain\\w*)\\s+(?:your\\s+)?(?:blood\\s+sugar|blood\\s+pressure|cholesterol|glucose)",
        "\\bfights?\\s+insulin\\s+resistance"
      ]))
  },
  {
    rule: "F08",
    what: L("prevention of any named disease or condition (ป้องกันโรค… / ภาวะแทรกซ้อน / กระดูกพรุน), 'reduce the risk of',",
      "'fight against', broader 'kills … bacteria'"),
    why: "dev: prevention claims for diseases outside the draft's short list were missed",
    apply: all(
      add("th", [
        "ป้องกัน\\s*(?:โรค|อาการ)\\S",
        "ป้องกัน\\S{0,6}(?:กระดูกพรุน|ข้อเสื่อม|ข้อเข่าเสื่อม|แทรกซ้อน|อัลไซเมอร์|พาร์กินสัน|สมองเสื่อม|ต้อ)",
        "ลดความเสี่ยง\\S{0,10}(?:โรค|ภาวะ)"
      ]),
      add("en", [
        "\\b(?:reduce|lower)s?\\s+(?:the\\s+)?(?:risk|likelihood)\\s+of",
        "\\bfight\\s+against\\b",
        "\\bprotects?\\s+against\\s+(?:the\\s+)?(?:\\w+\\s+){0,2}(?:virus|cancer|disease|infection|flu|cold)",
        "\\beliminates?\\s+infections?",
        "\\bkills?\\s+(?:[\\w()-]+\\s+){0,4}(?:virus(?:es)?|bacteria|germs)"
      ]),
      add("zh", ["可防", "防病", "预防"]))
  },
  {
    rule: "F09",
    what: L("treat-only verbs (TREAT_VERBS), window 80; more symptoms / conditions (back and joint pain, haemorrhoid slang, paralysis,",
      "allergy, headache, 'symptoms of', disorders)"),
    why: L("dev: prevention verbs made F09 fire on F08 texts (prevention and risk-reduction wording now excluded); many treat claims",
      "named symptoms not in the draft list or had the verb further away; the draft pattern ต้อ also matched ต้อง (must)"),
    apply: all(
      r => { r.verbs = TREAT_VERBS; r.claim_window = 80; },
      add("th", [
        "ปวดหลัง", "ปวดเอว", "ปวดสะโพก", "ปวดข้อ", "ทับเส้น", "หมอนรองกระดูก", "ข้ออักเสบ", "ริดซี่", "ริดสีดวง", "อัมพฤกษ์", "อัมพาต",
        "หลอดเลือดสมอง", "เส้นเลือดสมอง", "ภูมิแพ้", "ไซนัส", "บุตรยาก", "เก๊า?ท์|เกาท์", "สมองเสื่อม"
      ]),
      add("en", ["\\bheadaches?", "\\bsymptoms?\\s+of", "\\ballerg", "\\bdisorders?", "\\binflammation", "\\bcolds?\\s+(?:and\\s+flu|symptoms)"]),
      add("zh", ["阳痿", "早泄", "前列腺", "炎症", "有病", "血栓", "肿瘤"]),
      exclude(["\\b(?:risk|likelihood)\\s+of\\s+(?:\\w+\\s+){0,3}(?:disease|diabetes|cancer)", "ความเสี่ยง\\S{0,12}โรค\\S*"]),
      swap("th", "ต้อ", "ต้อ(?!ง)"))
  },
  {
    rule: "F10",
    what: L("structure / function wording: support / promote / maintain … health or function, organ or body-system care (ดูแลลำไส้,",
      "ฟื้นฟู…การทำงาน, เสริมสร้างการทำงานของระบบ…), antioxidant, height, muscle gain; Chinese 維持 / 有助於 / 幫助 + body system"),
    why: L("dev: the draft caught only a few organ-tonic words; most structure / function claims (the bulk of F10 labels) were missed.",
      "Approved statements stay suppressed by the MoPH No. 447 allowlist"),
    apply: all(
      add("th", [
        "ฟื้นฟู\\S{0,12}(?:ร่างกาย|อวัยวะ|ตับ|ไต|เซลล์|สมอง|ดวงตา|การมองเห็น|ระบบ|ข้อ|กระดูก|การทำงาน)",
        "(?:ต้าน|ต่อต้าน)อนุมูลอิสระ",
        "เพิ่ม(?:ความ)?สูง|ส่วนสูง|สูงขึ้น",
        "เพิ่มน้ำในข้อ",
        "ซ่อมแซม\\S{0,10}(?:กระดูก|ข้อ|เซลล์|กล้ามเนื้อ|ส่วนที่สึกหรอ)",
        "บำรุง(?:ข้อ|ร่างกาย|ระบบ)",
        "(?:กระดูก|ข้อ|ข้อต่อ|หัวใจ|หลอดเลือด|เส้นเลือด|ตับ|ไต|สมอง|ดวงตา|ภูมิคุ้มกัน)\\S{0,8}แข็งแรง",
        "สุขภาพ(?:หัวใจ|สมอง|ตับ|ไต|ดวงตา|ข้อ|กระดูก|ลำไส้)",
        "ดูแล(?:ลำไส้|ระบบขับถ่าย|ตับ|ไต|สมอง|หัวใจ|ดวงตา|สายตา|ข้อ|กระดูก)",
        "(?:เสริม|เสริมสร้าง|เพิ่ม|กระตุ้น|ปรับปรุง)\\S{0,4}การทำงานของ\\S{0,6}(?:ระบบ|สมอง|ตับ|ไต|หัวใจ|ประสาท|ลำไส้|ภูมิ)",
        "เพิ่ม(?:กล้ามเนื้อ|มวลกล้ามเนื้อ|น้ำหนัก)",
        "ภูมิ(?:คุ้มกัน|ต้านทาน)"
      ]),
      add("en", [
        "\\b(?:support|promote|maintain|protect|improve|enhance|boost|revitali[sz]e|replenish|strengthen|nourish|regulate)s?\\w{0,3}\\s+(?:[\\w'’]+[\\s,&]+){0,4}?(?:health|function(?:ing)?|immunity|immune|joints?|bones?|brain|heart|eyes?|liver|kidneys?|cartilage|regularity|metabolism|circulation|digestion|development|defen[cs]es|sleep)\\b",
        "\\bstrong\\s+bones",
        "\\bimmun(?:e|ity)\\b",
        "\\bantioxidant",
        "\\breduces?\\s+tiredness",
        "\\bresponsible\\s+for\\s+(?:strong|healthy)"
      ]),
      add("zh", [
        "(?:維持|维持|幫助|帮助|有助於|有助于|促進|促进|增強|增强)[^，。；￭■]{0,8}(?:骨骼|牙齒|牙齿|神經|神经|肌肉|代謝|代谢|免疫|消化|循環|循环|健康|生長|生长|發育|发育)",
        "抗氧化"
      ]))
  },
  {
    rule: "F11", what: "'แข็งตัว' only for sexual organs (not blood clotting); add 'อึด ทน', enlargement and male-problem wording",
    why: L("dev: a supplement warning about blood clotting ('เลือดแข็งตัวช้า') was flagged; sexual claims phrased 'อึด ทน นาน',",
      "'เพิ่มขนาด', 'น้องชายไม่สู้' were missed"),
    apply: all(
      swap("th", "แข็งตัว", SEX_ORGAN_FIRM),
      add("th", ["อึด\\s*,?\\s*ทน", "เพิ่มขนาด", "น้องชาย", "อสุจิ", "นกเขา"]),
      add("zh", ["阳痿", "早泄", "性生活"]),
      exclude(["เลือด\\S{0,4}แข็งตัว"]))
  },
  {
    rule: "F12", what: "add ผิวสวย / หน้าใส / healthy skin, hair and nails", why: "dev: beauty-from-food claims in these words were missed",
    apply: all(add("th", ["ผิวสวย", "หน้าใส", "ผิวใส", "บำรุงผิว"]), add("en", ["\\bhealthy\\s+(?:\\w+,?\\s+){0,2}(?:skin|hair|nails)"]))
  },
  {
    rule: "F13",
    what: L("Block / Burn only as fat or carb blockers / burners (not 'building block'); add body-part slimming, metabolism,",
      "weight management, 'kg gone', fat reduction, GLP-1 look-alikes"),
    why: L("dev: 'KEY BUILDING BLOCK' was flagged; slimming claims by body part, 'เร่งเผาผลาญ', 'weight management',",
      "'reduce stubborn body fat', '-zempic' were missed"),
    apply: all(
      swap("th", "บล็อก|เบิร์น|[Bb]lock|[Bb]urn", "บล็อก|เบิร์น|\\bburn(?:s|ing|er)?\\b|\\b(?:fat|carbs?|starch|sugar)[- ]?block"),
      add("th", ["ลด(?:ขา|น่อง|สะโพก|เอว|แขน|เฉพาะส่วน|สัดส่วน)", "ลดไขมัน(?!ใน)", "พุง\\S{0,8}หาย", "เผาผลาญ", "น้ำหนัก\\S{0,4}ลด", "หุ่น(?:หมู|เพรียว|สวย)"]),
      add("en", [
        "\\bweight\\s+(?:management|control)",
        "\\b\\d+\\s*(?:kg|kilos?|lbs?|pounds)\\s+(?:gone|lost|down|off)\\b",
        "\\bweight\\b[^.]{0,40}\\bgone\\b",
        "\\b(?:reduce|lose|burn|melt|shed)s?\\s+(?:\\w+\\s+){0,2}(?:body\\s+)?fat",
        "zempic|wegovy|semaglutide"
      ]))
  },
  {
    rule: "F19", what: "add 'ตามหลักวิทยาศาสตร์', 'clinically backed', 'N% would recommend / saw'",
    why: "dev: science and statistics claims in these words were missed",
    apply: all(
      add("th", ["(?:ตาม)?หลักวิทยาศาสตร์"]),
      swap("en", "\\bclinically\\s+(?:proven|tested|studied|shown)", "\\bclinically\\s+(?:proven|tested|studied|shown|backed|validated)"),
      add("en", ["\\b\\d+\\s*%\\s+(?:of\\s+)?(?:\\w+\\s+)?(?:would|said|saw|reported|users|people|participants|customers|women|men)\\b"]))
  },
  {
    rule: "F20", what: "add 'more than other products', 'better than … other', 'compared to other forms'",
    why: "dev: comparisons with other products in these words were missed",
    apply: all(
      add("th", ["(?:ผลิตภัณฑ์|ยี่ห้อ|แบรนด์|สูตร)อื่น", "ดีกว่า\\S{0,30}(?:อื่น|ทั่วไป)"]),
      add("en", ["\\bcompared\\s+(?:to|with)\\s+other", "\\bsuperior\\s+absorption"]))
  },
  {
    rule: "F21", what: "add 'เป็นมิตรต่อสิ่งแวดล้อม'", why: "dev: this common environmental wording was missed",
    apply: add("th", ["เป็นมิตรต่อสิ่งแวดล้อม"])
  },
  {
    rule: "F22", what: "add 'สำหรับ(เด็ก)ทารก'; exclude 'not suitable for infants' warnings", why: "dev: infant-food wording 'สำหรับเด็กทารก' was missed",
    apply: all(
      add("th", ["สำหรับ(?:เด็ก)?ทารก"]),
      exclude(["ไม่\\S{0,10}(?:เหมาะ|ควร)\\S{0,10}ทารก", "\\bnot\\s+(?:suitable|recommended)\\s+for\\s+infants"]))
  },
  {
    rule: "H02", what: "add fast-result, 'N times stronger' and 'devoid of side effects'", why: "dev: exaggerated herbal claims in these forms were missed",
    apply: all(
      add("th", ["(?:หาย|เห็นผล)\\S{0,4}(?:ภาย)?ใน\\s*\\d+\\s*(?:วัน|สัปดาห์|ชั่วโมง)", "(?:สูง|ดี|แรง)กว่า\\S{0,40}\\d+\\s*เท่า"]),
      add("en", ["\\b(?:devoid|free)\\s+of\\s+side[- ]effects?"]))
  },
  {
    rule: "H05", what: "treat verbs plus prevention, window 60; add เก๊าท์ / รูมาตอยด์ / corona / anti-hyperglycemic",
    why: "dev: spelling variants and 'corona virus treatment' were missed",
    apply: all(r => { r.verbs = H05_VERBS; r.claim_window = 60; }, add("th", ["เก๊า?ท์|เกาท์", "รูมาตอยด์"]), add("en", ["\\bcorona", "hyperglyc"]))
  },
  {
    rule: "C01",
    what: L("add acne / melasma reduction, anti-bacteria wording, 'relieve', minor cuts and burns, Chinese inflammation / healing;",
      "exclude 'Eczema Association'"),
    why: L("dev: treatment claims 'ลดสิว ฝ้า', 'ลดการสะสมของแบคทีเรีย', 'relieve chapped skin … minor cuts', '缓解炎症' were missed;",
      "an association name was flagged as a disease claim"),
    apply: all(
      add("th", ["ลด(?:สิว|ฝ้า|รอยสิว|รอยแผลเป็น)", "(?:ลด|กำจัด|ยับยั้ง|ฆ่า)\\S{0,12}แบคทีเรีย"]),
      add("en", ["\\brelieves?\\b", "\\bminor\\s+(?:cuts|burns|scrapes)"]),
      add("zh", ["炎症", "愈合", "溃疡", "缓解"]),
      exclude(["eczema\\s+association"]))
  },
  {
    rule: "C02", what: "'แข็งตัว' only for sexual organs", why: "same false match as F11 (blood clotting)",
    apply: swap("th", "แข็งตัว", SEX_ORGAN_FIRM)
  },
  {
    rule: "C03",
    what: L("add fast-result wording (ขาวไว, ใน N วัน/คืน, ทันใจ, หายวับ, อย่างรวดเร็ว), extreme wording (ขั้นสุด, สุดขั้ว, ไม่มีใครเหมือน),",
      "'dark skin turns white', Chinese 最佳"),
    why: "dev: exaggerated cosmetic claims of speed and extremes were missed",
    apply: all(
      add("th", [
        "เห็นผล(?:เร็ว|ไว|ทันที|ทันใจ|ใน\\s*\\d+)",
        "ทันใจ",
        "(?:ขาว|หาย|ใส)\\S{0,4}(?:ไว|เร็ว|ทันที|วับ)",
        "(?<!ภาย)ใน\\s*\\d+\\s*(?:วัน|คืน|สัปดาห์|อาทิตย์)",
        "ภายใน\\s*\\d+\\s*(?:วัน|คืน|สัปดาห์|อาทิตย์)",
        "อย่างรวดเร็ว", "หยดเดียว", "ขั้นสุด", "สุดขั้ว", "ไม่มีใครเหมือน", "ดำ\\S{0,12}ก็ขาว", "\\d+\\s*ปี\\s*ก็"
      ]),
      add("zh", ["最佳"]),
      exclude(FAST_EXCLUDE))
  },
  {
    rule: "C04", what: "endorsement 'หมอแนะน…' (typo-tolerant), 'approved / endorsed by', 'research has shown'",
    why: "dev: endorsements by doctors and associations and research claims were missed",
    apply: all(
      add("th", ["(?:แพทย์|หมอ|คุณหมอ)\\S{0,6}(?:แนะน|รับรอง)"]),
      add("en", ["\\b(?:approved|endorsed|accepted|recommended|certified)\\s+by\\b", "\\bresearch\\s+(?:has\\s+)?(?:shows?|shown|proves?|proven)"]))
  },
  {
    rule: "C07", what: "exclude 'หลังฉีด / เมื่อฉีด' (spraying)", why: "dev: a cooling spray ('after spraying') was flagged as an injection claim",
    apply: exclude(["(?:หลัง|เมื่อ|แล้ว)ฉีด", "ฉีด\\S{0,4}สเปรย์", "สเปรย์\\S{0,10}ฉีด"])
  },
  {
    rule: "C08", what: "add grey-hair reversal, nose shaping, cell regeneration and collagen increase",
    why: "dev: body-structure claims in these words were missed",
    apply: all(
      add("th", ["ผมหงอก", "ผม(?:สี)?ขาว\\S{0,8}(?:ดำ|หาย)", "ผมดำ", "จมูก\\S{0,6}(?:โด่ง|เข้ารูป)", "ดั้งโด่ง"]),
      add("en", ["\\bregenerat", "\\b(?:increases?|boosts?|stimulates?)\\s+collagen"]))
  }
];

/** Changes after the independent P3 review (held-out already spent: measured on dev only, see P3-RESULTS.md §8). */
export const POST_REVIEW = [
  { rule: "allowlist", what: "EN 3.6 and EN 5.6 trimmed to the official statement (PDF extraction had appended text from the next cell)",
    why: "post-review F1" },
  { rule: "F06, C03", what: "exclude English storage / use-by wording ('consume within 3 days', 'after opening …')",
    why: "post-review F2: 'Refrigerate after opening and consume within 3 days' was flagged F06" },
  { rule: "wording.zh", what: "draft zh wording ('may violate {rule}') -> '{rule} 风险信号'; status line, CM source citation and C03 note rephrased neutrally",
    why: "post-review F3: no legal-verdict wording in any language" }
];

/** Adverts option B (approved item 4, 2026-11-11): tuned on the P3 DEV split only (tools/pc-advert-eval.mjs); the P3
 *  held-out split is spent and the fresh advert set is scored once by a separate agent (docs/product-check/ADVERT-RESULTS.md). */
export const ADVERT_CHANGES = [
  {
    rule: "H02", what: "add detox wording (ล้างสารพิษ / ขับสารพิษ) and wound-healing wording ('allows wounds to heal', 'heals wounds')",
    why: "adverts, dev: herbal efficacy claims PCT-0042, PCT-0099, PCT-0168 were missed",
    apply: all(add("th", ["(?:ล้าง|ขับ)\\S{0,4}สารพิษ"]), add("en", ["\\ballows?\\s+wounds?\\s+to\\s+heal", "\\bheals?\\s+wounds?"]))
  },
  ...["C03", "D02", "H02"].map(rule => ({
    rule, what: "exclude 'แท้ 100%' (composition: 'genuine 100% milk / coconut water')",
    why: "adverts, dev: with no product type every family runs and 'น้ำมะพร้าวแท้ 100%' (a food) was flagged by C03, D02 and H02",
    apply: exclude(["แท้\\s*100\\s*%"])
  }))
];

/* ---------------- rule work 2026-11-11 (owner order: recall on the misses, false flags <= 5 / 100 compliant) ---------------- */
// Tuned on the P3 DEV split and the SPENT first fresh advert set only (tools/pc-advert-eval.mjs --fresh); the locked fresh2
// set and the P3 held-out split were not read. Patterns are word families (verb + condition / organ / marker nouns) in TH /
// EN / ZH, not copies of set texts. Disclaimers stay masked (MASKS) and approved nutrient-function statements stay
// suppressed by the MoPH No. 447 allowlist, so neither can fire through any new pattern.
const addVerbs = (/** @type {string} */ lang, /** @type {string} */ alt) => (/** @type {any} */ r) => {
  const cur = String((r.verbs || {})[lang] || "(?:)");
  r.verbs = { ...r.verbs, [lang]: cur.replace("(?:", "(?:" + alt + "|") };
};
// treat / relieve verbs that the advert misses used ("ลดอาการ" was there; plain "ลด", "สยบ", "คุม" were not)
const W_TREAT = {
  th: "ลด(?!ความเสี่ยง|เสี่ยง)|สยบ|ขจัด|คุม|ควบคุม|หยุดยั้ง|หยุด(?!ใช้|รับ|ทาน|กิน|การ|ยา)|จบ(?:ปัญหา)?|คลาย|ดีขึ้น",
  en: "reduc|lower|eas(?:e|es|ing)\\b|sooth|improv|suffer|help(?:s|ed)?\\s+(?:with|against)|dissipat|dissolv|shrink",
  zh: "消除|调理|調理|控制|减轻|減輕|告别|告別"
};
// symptom / condition nouns (F09: food and supplements): pain, numbness, dizziness, urinary and prostate problems, nerve
// and joint inflammation, fatty liver, kidney failure / dialysis, parasites, colds and flu, named syndromes
const COND_TH = [
  "ปวด", "อักเสบ", "มือ\\S{0,4}ชา|เท้าชา|เหน็บชา|ชาปลาย|ปลายประสาท", "เวียน(?:หัว|ศีรษะ)|บ้านหมุน|วูบ",
  "อ่อนเพลีย|เหนื่อยง่าย", "หลับยาก", "ตาพร่า", "(?:ฉี่|ปัสสาวะ)(?:บ่อย|แสบ|ขัด|ไม่(?:สุด|หมด)|เป็นฟอง)|ท่อปัสสาวะ",
  "ต่อมลูกหมากโต", "ถุงลมโป่งพอง", "ไขมัน(?:พอก|ใน)ตับ", "ฟอกไต|ไต(?:เสื่อม|วาย|ทุกระยะ)", "พยาธิ|ปรสิต",
  "ออฟฟิศซินโดรม", "อาการป่วย|เจ็บป่วย", "ท้องผูก", "ไข้หวัด|หวัด", "ความดัน(?:โลหิต)?สูง", "โปรตีนรั่ว", "เส้นเลือด\\S{0,4}(?:ตีบ|ตัน)"
];
const COND_EN = [
  "\\bpain\\b", "\\bfever", "\\binfluenza|\\bflu\\b|\\bcolds\\b|\\bcommon\\s+cold", "\\bpneumonia", "\\banxiety", "\\binfections?\\b",
  "\\bstroke\\b", "\\bsymptoms?\\b", "\\b(?:ADHD|PCOS|IBS|GERD|COPD)\\b", "\\bnight\\s+sweats|\\bhot\\s+flash", "\\bconstipation",
  "\\bneuropathy"
];
const COND_ZH = [
  "便秘", "抽筋", "咳嗽", "头痛|頭痛|胃痛|疼痛|关节痛|關節痛", "湿疹|濕疹", "过敏|過敏", "感冒", "发烧|發燒", "腹泻|腹瀉", "冠心病",
  "心脏病|心臟病", "肝炎", "贫血|貧血", "中风|中風", "痔疮|痔瘡", "哮喘", "鼻炎", "胃炎", "焦虑|焦慮", "抑郁|抑鬱", "三高"
];
// body markers (F07): blood sugar / pressure / lipids / uric acid with control, lower, dissolve verbs, in any order
const MARK_TH = "(?:ความดัน|ไขมันในเลือด|ไขมันในเส้นเลือด|น้ำตาลในเลือด|คอเลสเตอรอล|โคเลสเตอรอล|ไตรกลีเซอไรด์|(?:กรด)?ยูริก)";
const MARK_EN = "(?:cholesterol|blood\\s+pressure|blood\\s+sugar|blood\\s+glucose|blood\\s+lipids|triglycerides|LDL|hypertension)";
const MARK_ZH = "(?:血压|血壓|血糖|血脂|胆固醇|膽固醇|尿酸|三高)";
// infection / germ / cancer-cell nouns (F08: prevention or fighting infection)
const GERM_TH = "(?:ไวรัส|เชื้อ|แบคทีเรีย|ปรสิต|พยาธิ|เซลล์มะเร็ง)";
const GERM_EN = "(?:virus(?:es)?|viral|bacteria|germs|infections?|pathogens?|parasites?|cancer\\s+cells?|tumou?rs?|flu|colds?)";
// organs and body systems (F10)
const ORGAN_TH = "(?:ดวงตา|ต่อมลูกหมาก|ต่อม\\S{0,6}|ข้อเข่า|เส้นประสาท|ประสาท|เส้นเอ็น|กล้ามเนื้อ|หลอดเลือด|การไหลเวียน|ฮอร์โมน|เลือด|ลำไส้|ตับ|ไต|ข้อ|กระดูก|หัวใจ|สมอง)";
// research wording (F19)
const RESEARCH = {
  th: ["(?:จาก)?การศึกษา(?:พบ|แสดง|ยืนยัน|วิจัย)", "ผลการทดลอง", "นักวิจัย", "(?:ผ่าน|มี|จาก)การวิจัย|วิจัย(?:พบ|แล้ว)", "ทาง(?:การ)?คลินิก"],
  en: [
    "\\b(?:scientific|clinical)\\s+(?:studies|study|research|trials?|evidence)",
    "\\bstud(?:y|ies)\\s+(?:show|shows|showed|prove|proves|reveal|reveals|indicate|indicates|suggest|suggests|found|find|have\\s+shown)",
    "\\bin\\s+(?:one|a|two|several|recent)\\s+(?:\\w+\\s+)?(?:study|studies|trials?)\\b",
    "\\bresearch(?:ers)?\\s+(?:shows?|proves?|has\\s+shown|found|discovered|recently|is\\s+showing)",
    "\\bclinically[\\s-]+(?:proven|tested|studied|shown|backed|validated)",
    "\\bbased\\s+on\\s+(?:real\\s+)?science"
  ],
  zh: ["实验(?:证明|表明|评价)|實驗(?:證明|表明|評價)", "临床(?:证明|试验|研究|验证)|臨床(?:證明|試驗|研究|驗證)", "研究(?:表明|证明|發現|发现|显示|顯示)", "科学(?:证明|验证)|科學(?:證明|驗證)", "动物实验|動物實驗|人体试食"]
};
// warnings and directions that name a condition or a doctor without a claim (never a signal): "patients with … should",
// "if you have …", "stop use / consult a doctor if …", the Chinese health-food warning "不能代替药物治疗疾病"
const WARN_EX = [
  "(?:ผู้ป่วย|ผู้ที่(?:เป็น|มี)|ผู้มี|หากมีอาการ|หากเป็น)\\S{0,20}", "\\b(?:patients|people|persons|those|anyone)\\s+with\\b[^.,;]{0,30}",
  "\\bif\\s+(?:you\\s+)?(?:have|experience|feel|are)\\b[^.]{0,40}", "\\b(?:stop|discontinue)\\s+use\\b[^.]{0,60}", "\\b(?:ask|consult)\\s+(?:a|your)\\s+(?:doctor|physician|pharmacist)\\b[^.]{0,60}",
  "不能代替(?:药物|藥物)(?:治疗|治療)?(?:疾病)?"
];
// "not a substitute for medicine" (a required or voluntary warning), never a comparison claim
const NOT_SUBST = ["ไม่\\S{0,8}(?:ทดแทน|แทน)\\S{0,6}ยา", "ไม่ใช่ยา", "\\bnot\\s+(?:a\\s+)?(?:substitute|replacement)\\s+for\\b[^.]{0,40}",
  "\\b(?:do\\s+not|don't|never)\\s+(?:stop|replace|discontinue)\\b[^.]{0,40}"];
// sales, shipping and refund wording: a deadline, not a speed-of-result claim
const PROMO_EX = ["(?:ลด\\s*\\d+\\s*%|ลดราคา|ส่วนลด|โปร|ซื้อ|ส่งฟรี|จัดส่ง|ส่งของ|ได้รับสินค้า|คืนเงิน)[^\\n.!]{0,30}?(?:ภาย)?ใน?\\s*\\d+\\s*(?:วัน|ชั่วโมง)",
  "\\b(?:ships?|shipping|delivery|delivered|refund|returns?|sale|offer|discount)\\b[^.]{0,30}\\b(?:in|within)\\s+\\d+\\s+(?:days?|hours?)"];
// endorsement wording (D07, F14, H04, C04): "recommended by a doctor / ministry"
const ENDORSE_TH = ["(?<!คำ)(?:แนะนำ|รับรอง)(?:โดย|จาก)\\S{0,4}(?:แพทย์|หมอ|เภสัชกร|ผู้เชี่ยวชาญ|โรงพยาบาล|กระทรวง)",
  "(?:แพทย์|หมอ|เภสัชกร|โรงพยาบาล|กระทรวง)\\S{0,30}(?<!คำ)(?:แนะนำ|รับรอง)"];
// "under / per a doctor's advice", "consult a doctor": a direction, not an endorsement
const ENDORSE_EX = ["(?:ภายใต้|ตาม)\\S{0,4}คำแนะนำ\\S{0,16}", "ปรึกษา\\S{0,4}(?:แพทย์|เภสัชกร|ผู้เชี่ยวชาญ)\\S{0,30}", "คำแนะนำ(?:ของ|จาก)\\S{0,16}",
  "\\b(?:ask|consult)\\s+(?:a|your)\\s+(?:doctor|physician|pharmacist|dermatologist)\\b[^.]{0,60}"];
const ENDORSE_EN = ["\\b(?:doctors?|physicians?|dermatologists?|pharmacists?|experts?)\\s+(?:\\w+\\s+)?recommend",
  "\\b(?:doctor|physician|pharmacist|dermatologist)s?[- ](?:formulated|developed|designed|trusted|recommended|approved)"];
// fast results with minutes / hours and "after one week" (F06, H02)
const FAST2_TH = ["(?:แก้|หาย|เห็นผล|บรรเทา|ลด|ปกติ|ดีขึ้น)\\S{0,40}(?:ภาย)?ใน\\s*\\d+\\s*(?:นาที|วินาที|ชั่วโมง|วัน|เม็ด)",
  "(?:ลด|หาย|ดีขึ้น|ฟื้น)\\S{0,12}\\s?\\d+\\s*(?:วัน|ชั่วโมง|นาที)", "\\d+\\s*(?:วัน|ชั่วโมง)\\s?\\S{0,10}(?:ปกติ|หาย|ดีขึ้น)", "เห็นผลรวดเร็ว|รวดเร็วทันใจ"];
const FAST2_EN = ["\\bafter\\s+(?:just\\s+)?(?:one|a|two|three|\\d+)\\s+(?:days?|weeks?|nights?)\\s+(?:of\\s+(?:taking|using)|on)\\b",
  "\\b(?:see|notice)\\s+(?:\\w+\\s+)?results?\\s+(?:in|within)\\s+\\d", "\\bin\\s+(?:under\\s+|just\\s+)?\\d+(?:\\s*-\\s*\\d+)?\\s+(?:minutes|seconds|hours)\\b",
  "\\b(?:naturally\\s+and\\s+fast|fast\\s+(?:results?|relief)|quick\\s+(?:results?|relief))\\b"];

export const RULE_WORK = [
  {
    rule: "F09", what: L("treat / relieve verbs ลด, สยบ, ขจัด, คุม, 'reduce / ease / improve / suffer', ZH 消除 / 调理; symptom nouns (pain,",
      "numbness, dizziness, urinary, inflammation, fatty liver, dialysis, parasites, colds, fever, anxiety, named syndromes)"),
    why: "rule work 2026-11-11 (spent fresh set + dev): most F09 misses named a symptom outside the list or used the verb 'reduce'",
    apply: all(addVerbs("th", W_TREAT.th), addVerbs("en", W_TREAT.en), addVerbs("zh", W_TREAT.zh), add("th", COND_TH), add("en", COND_EN), add("zh", COND_ZH),
      exclude(["\\breduce[sd]?\\s+(?:the\\s+)?risk", ...WARN_EX]))
  },
  {
    rule: "D08", what: "verbs 'suffering', 'beneficial for', 'improve'", why: "rule work 2026-11-11: s.77 disease claims phrased 'for people suffering from' were missed",
    apply: all(addVerbs("en", "suffer|benefici|improv"), exclude(WARN_EX))
  },
  {
    rule: "H05", what: "verbs ลด / 'reduce, lower, dissolve, shrink' (risk reduction of a serious disease); โรค + organ with words between; tumour masses",
    why: "rule work 2026-11-11: herbal serious-disease claims ('reduce stroke risk', 'dissipate tumours', 'โรคหลอดเลือดในหัวใจ') were missed",
    apply: all(addVerbs("th", "ลด"), addVerbs("en", "reduc|lower|dissipat|dissolv|shrink"), add("th", ["โรค\\S{0,14}(?:หัวใจ|ไต|ตับ|ปอด|สมอง)"]), add("en", ["\\bmasses\\b"]), exclude(WARN_EX))
  },
  {
    rule: "F07", what: L("control / lower / dissolve verbs before a marker with words between (Thai spacing removed), uric",
      "acid, 'fight / improve / reduce … cholesterol', 'for high cholesterol', ZH control / regulate + 血压 / 血糖 / 血脂"),
    why: "rule work 2026-11-11: marker claims written as lists ('ลดเบาหวาน ความดัน ไขมัน'), with 'reducing high LDL cholesterol' or in Chinese were missed",
    apply: all(
      add("th", ["(?:ลด|คุม|ควบคุม|สลาย|ปรับ)\\S{0,16}" + MARK_TH, "(?:ลด|คุม|ควบคุม)(?:ระดับ|ค่า)\\s*น้ำตาล", "น้ำตาล(?:พุ่ง|สวิง|ขึ้น)|การพุ่งของน้ำตาล|ดูแลระดับน้ำตาล"]),
      add("en", ["\\b(?:lower|reduc|control|regulat|balanc|fight|manag|stabili[sz]|improv)\\w*\\s+(?:back\\s+against\\s+)?(?:\\w+\\s+){0,3}?" + MARK_EN,
        "\\bfor\\s+(?:high|elevated)\\s+(?:cholesterol|blood\\s+pressure|blood\\s+sugar)"]),
      add("zh", ["(?:控制|调节|調節|稳定|穩定|改善|平衡|维持|維持|降低?)\\S{0,4}" + MARK_ZH]))
  },
  {
    rule: "F08", what: L("prevent / inhibit / destroy + germ or condition nouns (TH ป้องกัน / ยับยั้ง / ทำลาย / กำจัด … ไวรัส / เชื้อ / ปรสิต, ลดเสี่ยง…,",
      "ลดการติดเชื้อ; EN fight / combat / inhibit … virus / infection, 'protection against', 'reduced … risk', 'prevention of'; ZH 抗 / 抑制 + germ / cancer)"),
    why: "rule work 2026-11-11: infection and prevention claims outside the draft's noun list were missed",
    apply: all(
      add("th", ["(?:ป้องกัน|ยับยั้ง|ต้าน|ทำลาย|กำจัด|ฆ่า)\\S{0,12}" + GERM_TH, "ป้องกัน\\S{0,6}(?:เส้นเลือด|หลอดเลือด|ตีบ|ตัน)", "ลด(?:ความ)?เสี่ยง\\S{0,10}(?:โรค|ภาวะ|ไต|หัวใจ|มะเร็ง|หลอดเลือด)",
        "(?:ลด|ป้องกัน)\\S{0,4}การติดเชื้อ", "เซลล์มะเร็ง"]),
      add("en", ["\\b(?:fight|combat|inhibit|halt|block|neutrali[sz]e|destroy|attack)\\w*\\s+(?:off\\s+|back\\s+|against\\s+)?(?:the\\s+|an?\\s+|your\\s+)?(?:[\\w()-]+\\s+){0,3}?" + GERM_EN + "\\b",
        "\\bprotect(?:s|ion|ive)?\\s+against\\s+(?:the\\s+)?(?:\\w+\\s+){0,2}(?:virus|cancer|disease|infection|flu|cold)",
        "\\breduced\\s+(?:\\w+\\s+)?risk\\b", "\\bprevention\\s+of\\b", "\\b(?:bacterial|viral|respiratory)\\s+(?:\\w+,?\\s+){0,2}infections?", "\\bsars-?cov"]),
      add("zh", ["抗(?:菌|病毒|癌|肿瘤|腫瘤|辐射|輻射|感染)", "抑制\\S{0,4}(?:癌|肿瘤|腫瘤|病毒|细菌|細菌|病菌)", "癌细胞|癌細胞"]))
  },
  {
    rule: "F10", what: L("organ care verbs + organ / system nouns (บำรุง / ฟื้นฟู / ปกป้อง / ทำความสะอาด / ล้าง …), muscle growth or recovery,",
      "hormone / fertility / cycle support, energy / focus / endurance, rejuvenation, '<organ> health', ZH regulate / improve + 机能 / 骨密度"),
    why: "rule work 2026-11-11: structure / function claims naming organs or functions outside the list were missed",
    apply: all(
      add("th", ["(?:บำรุง|ฟื้นฟู|ปกป้อง|ทำความสะอาด|ล้าง|เสริมสร้าง|ดูแล)\\S{0,4}" + ORGAN_TH, "(?:กระตุ้น|ปรับสมดุล|เพิ่ม)\\S{0,4}ฮอร์โมน", "(?:มวล|ความแข็งแรงของ)กล้ามเนื้อ"]),
      add("en", [
        "\\bmuscle\\s+(?:growth|gain|mass|recovery|building|soreness)", "\\brejuvenat",
        "\\b(?:restore|boost|increase|balance|regulate|support|promote|stimulate)s?\\s+(?:\\w+\\s+){0,2}(?:estrogen|testosterone|hormon\\w*|ovulation|fertility|cycles?|periods?)",
        "\\bhormon(?:e|al)\\s+(?:balance|harmony|support)",
        "\\b(?:build|increase|boost|improve|enhance|maximi[sz]e|sharpen|sustain(?:ed)?)s?\\s+(?:your\\s+)?(?:mental\\s+)?(?:strength|focus|endurance|stamina|energy|memory|concentration|clarity)",
        "\\b(?:bone|joint|heart|brain|breast|liver|kidney|eye|gut|prostate|digestive|cardiovascular|cognitive|urinary)\\s+(?:and\\s+\\w+\\s+)?health\\b"
      ]),
      add("zh", ["(?:调节|調節|改善|增强|增強|提高|提升|恢复|恢復)\\S{0,4}(?:机能|機能|体质|體質|免疫力|记忆|記憶|睡眠|视力|視力|骨密度|体力|體力)", "骨密度"]))
  },
  {
    rule: "F19", what: "research wording: 'จากการศึกษาพบว่า', 'studies reveal / found', 'in one study', 'clinical studies', hyphenated 'clinically-backed', ZH 实验 / 临床 / 研究 + show",
    why: "rule work 2026-11-11: research claims in these forms (and 'clinically-backed' with a hyphen) were missed",
    apply: all(add("th", RESEARCH.th), add("en", RESEARCH.en), add("zh", RESEARCH.zh))
  },
  {
    rule: "F06", what: "fast results in minutes / hours / pills, 'after one week of taking', 'see results in N', 'naturally and fast'",
    why: "rule work 2026-11-11: speed claims with minutes, pills or 'after one week' were missed",
    apply: all(add("th", FAST2_TH), add("en", FAST2_EN), exclude(["(?:ต้ม|ชง|แช่|อบ|นึ่ง|ทิ้งไว้|ปั่น)\\S{0,12}(?:ภาย)?ใน?\\s*\\d+\\s*(?:นาที|วินาที|ชั่วโมง)", ...PROMO_EX]))
  },
  {
    rule: "F12", what: "skin elasticity / firmness / hair growth wording, 'healthier skin', thick black hair, ZH youth / firming / anti-wrinkle words",
    why: "rule work 2026-11-11: beauty claims from food in these words (EN, TH, ZH) were missed",
    apply: all(add("th", ["ผม(?:หนา|ดก|ดำ)|ดกดำ"]), add("en", ["\\b(?:skin|hair)\\s+(?:elasticity|firmness|growth|shedding)", "\\belasticity\\s+and\\s+firmness",
      "\\bhealthier\\s+(?:\\w+,?\\s+){0,2}(?:skin|hair|nails)"]),
      add("zh", ["永葆青春|青春常驻|青春常駐|留住青春|恢复青春|恢復青春|延缓衰老|延緩衰老|紧致|緊緻|抗皱|抗皺|祛斑|嫩肤|嫩膚"]))
  },
  {
    rule: "F13", what: "fat 'squeeze / flush / dissolve' verbs (รีด / ขับ / สลาย / เผา … ไขมัน); ZH 'lost N jin' weight wording",
    why: "rule work 2026-11-11: weight claims with these verbs and Chinese weight-loss amounts were missed",
    apply: all(add("th", ["(?:รีด|ขับ|สลาย|เผา)\\S{0,4}ไขมัน"]), add("zh", ["(?:减|減|瘦|掉)了?\\s*\\d+\\s*(?:斤|公斤|kg|磅)"]))
  },
  {
    rule: "F03", what: "'จบ(ทุก)ปัญหา', 'หายจริง / หายแน่นอน'", why: "rule work 2026-11-11: complete-cure wording in these forms was missed",
    apply: add("th", ["จบ(?:ทุก)?ปัญหา", "หาย(?:จริง|แน่นอน)"])
  },
  {
    rule: "F05", what: "'รับรองโดย อย.' and ministry approval; 'completely / totally safe', 'zero toxicity'",
    why: "rule work 2026-11-11: FDA / ministry approval written after the verb and safety guarantees in these words were missed",
    apply: all(add("th", ["รับรอง(?:โดย|จาก)\\s*(?:อย(?!่)\\.?|กระทรวงสาธารณสุข)"]),
      add("en", ["\\b(?:completely|totally|absolutely|100\\s*%)\\s+safe\\b", "\\bzero\\s+toxicity"]))
  },
  {
    rule: "F11", what: "'sex drive'", why: "rule work 2026-11-11: 'low sex drive' was missed", apply: add("en", ["\\bsex\\s+drive"])
  },
  {
    rule: "F02", what: "superlatives 'the strongest / purest / most trusted', 'the first company', '… in the world', ZH 最高 / 最强 / 世界级 / 唯一",
    why: "rule work 2026-11-11: superlative claims in these forms were missed",
    apply: all(add("en", ["\\bthe\\s+(?:strongest|purest|most\\s+(?:trusted|powerful|potent|advanced|efficacious))\\b", "\\bthe\\s+first\\s+(?:company|brand|product)\\b",
      "\\b(?:highest|strongest|purest)\\b[^.]{0,40}\\bin\\s+the\\s+world"]), add("zh", ["最高(?:等级|等級|级|級|品质|品質|标准|標準)|最强|最強|世界级|世界級|唯一"]))
  },
  {
    rule: "F20", what: "'no need for medicine', 'instead of / not a statin / medication'", why: "rule work 2026-11-11: comparisons with medicines were missed",
    apply: all(add("th", ["ไม่ต้อง(?:ทาน|กิน|พึ่ง|ใช้)ยา|(?:ทดแทน|แทน)(?:การใช้)?ยา"]),
      add("en", ["\\b(?:instead\\s+of|not|better\\s+than|alternative\\s+to|replaces?)\\s+(?:a\\s+|your\\s+)?(?:statins?|medications?|medicines?|prescriptions?)\\b"]),
      exclude(NOT_SUBST))
  },
  { rule: "F14", what: L("endorsement 'แนะนำโดยแพทย์', doctor ... แนะนำ further",
    "apart, 'dermatologists recommend', 'doctor-formulated'"), why: "rule work 2026-11-11: endorsements in these forms were missed",
    apply: all(add("th", ENDORSE_TH), add("en", ENDORSE_EN), exclude(ENDORSE_EX)) },
  { rule: "D07", what: "same endorsement family as F14", why: "rule work 2026-11-11: 'แนะนำโดยแพทย์' in a drug advert was missed",
    apply: all(add("th", ENDORSE_TH), add("en", ENDORSE_EN), exclude(ENDORSE_EX)) },
  { rule: "H04", what: "same endorsement family as F14", why: "rule work 2026-11-11: 'doctor-formulated', 'กระทรวง… รับรอง' in herbal adverts were missed",
    apply: all(add("th", ENDORSE_TH), add("en", ENDORSE_EN), exclude(ENDORSE_EX)) },
  { rule: "C04", what: "same endorsement family as F14", why: "rule work 2026-11-11: 'Dermatologists recommend' was missed",
    apply: all(add("th", ENDORSE_TH), add("en", ENDORSE_EN), exclude(ENDORSE_EX)) },
  {
    rule: "D02", what: "elixir / anti-ageing tonic wording, 'N times faster', 'no surgery needed'",
    why: "rule work 2026-11-11: exaggerated drug efficacy in these words was missed",
    apply: add("th", ["(?:ยา)?อายุวัฒนะ", "ชะลอวัย", "บำรุงร่างกาย", "\\d+\\s*เท่า", "ไม่ต้องผ่าตัด", "(?:ยุบ|หาย)\\S{0,2}(?:ไว|เร็ว)"])
  },
  {
    rule: "H02", what: "superlatives (สุดยอด, อันดับ 1, 'the best / #1 / most efficacious'), 'every problem', 'no laser / surgery / exercise needed', fast results in minutes, 'see results in N days'",
    why: "rule work 2026-11-11: herbal H02 was 0 of 8 on the spent fresh set; exaggeration in these forms was missed",
    apply: all(
      add("th", ["สุดยอด|อันดับ\\s*(?:1|หนึ่ง)|เบอร์\\s*1|หนึ่งเดียว", "ทุกปัญหา", "ไม่ต้อง(?:เลเซอร์|ผ่าตัด|ฉีด|ออกกำลัง)", "สลายหาย", FAST2_TH[0]]),
      add("en", ["\\bbest\\s+(?:\\w+\\s+)?(?:formula|herb|remedy|product)s?\\b", "#\\s*1\\b", "\\bnumber\\s+one\\b", "\\bthe\\s+(?:highest|most\\s+(?:efficacious|effective|powerful|potent))\\b",
        "\\b(?:see|notice)\\s+(?:\\w+\\s+)?results?\\s+(?:in|within)\\s+\\d", "\\bwith\\s+just\\s+one\\s+(?:bottle|dose|pack)"]),
      exclude(["(?:ต้ม|ชง|แช่|อบ|นึ่ง|ทิ้งไว้)\\S{0,12}(?:ภาย)?ใน?\\s*\\d+\\s*(?:นาที|วินาที|ชั่วโมง)", ...PROMO_EX]))
  },
  {
    rule: "C01", what: "'ลดปัญหาสิว', acne / breakout treatment, anaesthetic and swelling / bleeding wording, 'replaces medicine'",
    why: "rule work 2026-11-11: cosmetic non-cosmetic-purpose claims in these words were missed",
    apply: all(add("th", ["ลด(?:ปัญหา)?\\s*(?:สิว|ฝ้า|รอยสิว|รอยแผลเป็น)", "(?:ทดแทน|แทน)(?:การใช้)?ยา"]),
      add("en", ["\\bacne\\s+treatments?", "\\b(?:clear|prevent|treat|fight)s?\\s+(?:and\\s+\\w+\\s+)?(?:\\w+\\s+){0,1}(?:breakouts|acne|pimples|blemishes)", "\\bana?esthetic",
        "\\blidocaine|\\btetracaine",
        "\\breduces?\\s+(?:\\w+,?\\s+){0,2}(?:swelling|bruising|bleeding)"]), exclude(NOT_SUBST))
  },
  {
    rule: "C03", what: "'หนึ่งเดียว', 'ทุกคนไว้วางใจ', 'look N years younger', magic 'เสก'", why: "rule work 2026-11-11: cosmetic exaggeration in these words was missed",
    apply: all(add("th", ["หนึ่งเดียว", "ทุกคน\\S{0,4}ไว้วางใจ", "อันดับ\\s*(?:1|หนึ่ง)|เบอร์\\s*1"]), add("en", ["\\b(?:look|feel)s?\\s+(?:up\\s+to\\s+)?\\d+\\s+years?\\s+younger"]),
      exclude(PROMO_EX))
  }
];

/* ---------------- rule work 2026-11-12 (owner order: ONLY H02 herbal efficacy and the drug rules D02 / D08) ---------------- */
// Tuned on the spent sets (P3 dev, first fresh set, fresh2); texts-fresh-3 (the next held-out set) not read. No other rule
// changed. Word families, not copied phrases.
const GERM_ZH = "(?:病毒|细菌|細菌|病菌|真菌)";
// herbal: names the product as fighting infection (H02 = exaggerated efficacy for a herbal product)
const ANTIINF = {
  th: ["(?:ฆ่า|ยับยั้ง|ต้าน|ทำลาย|กำจัด|ป้องกัน|ดักจับ)\\S{0,10}(?:" + GERM_TH.slice(3, -1) + "|การติดเชื้อ)"],
  en: ["\\b(?:kill|destroy|fight|combat|inhibit|neutrali[sz]e|eradicat|prevent)\\w*\\s+(?:off\\s+|against\\s+)?(?:the\\s+|an?\\s+|your\\s+)?(?:[\\w()-]+\\s+){0,3}?(?:" +
    "virus(?:es)?|coronavirus|infect(?:ed|ions?)|bacteria|germs|pathogens?|viral\\s+\\w+)\\b",
    "\\b(?:defen[cs]e|protection|shield)\\s+against\\s+(?:\\w+\\s+){0,3}?(?:virus(?:es)?|coronavirus|infections?|bacteria|germs)\\b", "\\bnatural\\s+antibiotic"],
  zh: ["杀菌|殺菌|抗菌|抗病毒|天然抗生素", "(?:抑制|清除|杀灭|殺滅|预防|預防)\\S{0,8}" + GERM_ZH]
};
// herbal: efficacy rates, comparison with medicines, superlatives, "all kinds of", speed and "no relapse"
const H02_MORE = {
  th: ["(?:ได้|ถึง|สูงถึง)\\s*\\d{2}(?:\\.\\d+)?\\s*%", "(?:ดีกว่า|เทียบเท่า|เหมือน|แทน)(?:การใช้|การกิน)?ยา(?!สมุนไพร|แผนโบราณ)",
    "(?:บรรเทา|แก้|รักษา|หาย)\\S{0,16}(?:ทุกชนิด|ทุกอาการ|ทุกโรค)", "วิจัยระดับโลก"],
  en: ["\\b\\d{2}(?:\\.\\d+)?\\s*%\\s+(?:effective|kill|of\\s+(?:germs|bacteria|viruses))",
    "\\b(?:as\\s+effective\\s+as|better\\s+than|works\\s+like|instead\\s+of)\\s+(?:\\w+\\s+){0,2}(?:drugs?|medications?|medicines?|pharmaceutical\\w*|antibiotics?|antidepressants?)",
    "\\b(?:the\\s+)?best\\s+(?:\\w+\\s+)?(?:defen[cs]e|protection|protector|remedy|cure|treatment)", "\\bperfect\\s+(?:\\w+\\s+)?(?:protector|remedy|cure|solution|treatment)",
    "\\bno\\.\\s*1\\b", "\\ball\\s+(?:kinds|types)\\s+of\\s+(?:pain|diseases?|illness)",
    "\\b(?:remed(?:y|ies)|fight\\s+off|treat\\w*|help(?:ed|s)?\\s+(?:\\w+\\s+){0,4}with)\\s+(?:\\w+[\\s,]+){0,6}?(?:anxiety|depression|seizures|chronic\\s+pain|insomnia|sleep\\s+disorders)"],
  zh: ["之首|最好|最强|最強|最佳|第一|克星|剋星", "\\d+\\s*种\\S{0,4}(?:病|妇科|疾病)|多种疾病|各种疾病", "(?:天|周|小时|晚)\\S{0,4}(?:就能|即可|就)\\S{0,4}(?:感受到|见|見)效|当晚降|當晚降|直降",
    "改善(?:特别|非常|很)?明显|改善病情|效果(?:很|非常|特别)?明显|疗效显著|療效顯著|高效(?:降|治|改善|杀)", "没有\\S{0,8}副作用|沒有\\S{0,8}副作用|不反弹|不反彈|不复发|不復發"]
};
// herbal registered / traditional-use wording (UK THR style) and composition percentages are not efficacy claims
const H02_EX = ["\\btraditional(?:ly)?\\s+(?:herbal\\s+medicinal\\s+product|used)\\b[^.]{0,160}", "\\bexclusively\\s+based\\s+(?:up)?on\\s+long-standing\\s+use",
  "(?:สกัด|แท้|เข้มข้น)\\S{0,4}\\s*\\d+\\s*%", "\\d+\\s*%\\s*\\d+(?:\\.\\d+)?\\s*(?:มก|mg|กรัม|g)\\b"];
// drug: claims against a virus or infection outside a registered indication (COVID, "kills the virus", "prevention")
const DRUG_INF_EN = [
  "\\b(?:kill|destroy|fight|combat|shield|protect|prevent|treat|eliminat|eradicat|inhibit)\\w*\\s+(?:against\\s+|off\\s+)?(?:the\\s+|a\\s+|an\\s+)?(?:[\\w()-]+\\s+){0,5}?" +
    "(?:coronavirus|covid(?:-?19)?|sars-?cov-?2?|pathogens?|viral\\s+infections?)",
  "\\b(?:virus|covid(?:-?19)?|coronavirus)\\s+(?:\\w+\\s+)?(?:killing|prevention|remed\\w*|cure)", "\\b(?:shorten|lessen)\\w*\\s+(?:the\\s+)?(?:duration|chance)\\s+of\\b"
];

export const RULE_WORK_2 = [
  {
    rule: "H02",
    what: L("anti-infection wording (kill / inhibit / prevent … virus, germ, infection; ZH 抑菌 / 抗病毒 / 天然抗生素), efficacy rates (ถึง 90 %),",
      "comparison with medicines, superlatives ('the best defence', 'perfect protector', No. 1, 之首 / 克星), 'all kinds of', remedy / treat / fight-off claims for anxiety /",
      "depression / seizures / chronic pain, ZH speed and 'no relapse / no side effects' wording"),
    why: L("rule work 2026-11-12 (spent fresh2 + earlier sets): H02 caught 5 of 31 on fresh2; herbal efficacy claims in these forms were",
      "missed. Guards: UK traditional-use (THR) indications, composition percentages ('สกัด 100%', '100% 250 mg')"),
    apply: all(add("th", [...ANTIINF.th, ...H02_MORE.th]), add("en", [...ANTIINF.en, ...H02_MORE.en]), add("zh", [...ANTIINF.zh, ...H02_MORE.zh]),
      exclude([...H02_EX, ...NOT_SUBST, ...WARN_EX]))
  },
  {
    rule: "D02",
    what: L("anti-virus / COVID claims for a drug ('kills the coronavirus', 'combat viral infections', 'COVID prevention', 'shorten the",
      "duration of'), 'กลับมาเป็นปกติ' (restored to normal), ZH 好转 / 自愈 / 病症减轻 / 多病化少"),
    why: "rule work 2026-11-12: drug recall with the type chosen was 5 of 16 on fresh2; most misses were anti-virus or 'back to normal' claims",
    apply: all(add("en", DRUG_INF_EN), add("th", ["(?:กลับ(?:มา)?(?:เป็น|สู่)|หายเป็น)\\s*ปกติ"]), add("zh", ["好转|好轉|自愈|病症减轻|病症減輕|多病化少"]), exclude([...WARN_EX, ...NOT_SUBST]))
  }
];

const clone = o => JSON.parse(JSON.stringify(o));

/** Build the rule data object from the parsed draft. @param {any} draft */
export function build(draft) {
  const rules = draft.rules.map(r0 => {
    const r = clone(r0);
    r.category = String(r.category).split(",").map(s => s.trim()).filter(Boolean);
    r.title_zh = TITLE_ZH[r.id] || "";
    r.claim_window = r.requires_claim_verb ? 40 : 0;
    r.exclude = [];
    return r;
  });
  const byId = Object.fromEntries(rules.map(r => [r.id, r]));
  for (const c of [...CHANGES, ...ADVERT_CHANGES, ...RULE_WORK, ...RULE_WORK_2]) {
    if (!byId[c.rule] && c.rule !== "*") throw new Error("CHANGES: unknown rule " + c.rule);
    c.apply(c.rule === "*" ? rules : byId[c.rule], { rules, byId });
  }
  const allow = [
    ...N447.th.map(([ref, text]) => ({ ref: "TH " + ref, lang: "th", text })),
    ...N447.en.map(([ref, text]) => ({ ref: "EN " + ref, lang: "en", text }))
  ];
  return neutral({
    version: "p3-" + draft.version,
    draft_sha256: createHash("sha256").update(readFileSync(DRAFT)).digest("hex"),
    status: "P3 tuned on the dev split. Every flag is a risk signal, never a legal finding. Counsel and pharmacist review pending.",
    wording: { ...draft.wording, zh: "{rule} 风险信号" }, // post-review F3: the draft's "可能违反" ("may violate") removed
    claim_verbs: draft.claim_verbs,
    sources: draft.sources,
    changes: [...CHANGES.map(c => ({ rule: c.rule, what: c.what, why: c.why })), ...POST_REVIEW,
      ...ADVERT_CHANGES.map(c => ({ rule: c.rule, what: c.what, why: c.why })), ...RULE_WORK.map(c => ({ rule: c.rule, what: c.what, why: c.why })),
      ...RULE_WORK_2.map(c => ({ rule: c.rule, what: c.what, why: c.why }))],
    masks: MASKS,
    warnings: WARNINGS,
    allow_source: N447_SOURCE,
    allow,
    rules
  });
}

/** Post-review F3: the generated data carries no "illegal / unlawful / violate" wording in any language (draft notes and
 *  source citations are rephrased neutrally; the draft file itself is unchanged). @param {any} v @returns {any} */
function neutral(v) {
  if (typeof v === "string") {
    return v.replace("examples of unlawful wording per s.41", "examples of wording listed under s.41")
      .replace("still treats 'ที่สุด' as unlawful", "still lists 'ที่สุด' under s.41")
      .replace("whether each example is unlawful is for counsel", "whether each example applies is for counsel");
  }
  if (Array.isArray(v)) return v.map(neutral);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, neutral(x)]));
  return v;
}

/** Serialise as a UMD data module (browser: window.LQClaimsRules; Node: module.exports). One JSON value per line where
 *  possible so a review diff stays readable. @param {any} data */
export function render(data) {
  const head = [
    "/* lensiq-claims-rules.js — GENERATED by tools/pc-rules-build.mjs from tools/pc-rules-draft.json. Do not edit by hand:",
    " * change CHANGES / MASKS / WARNINGS in the build script and re-run it. Rule DATA for lensiq-claims.js (Product Check",
    " * over-claim risk signals). Every flag is a risk signal, never a legal finding about a product. Browser:",
    " * window.LQClaimsRules · Node: module.exports. */",
    "(function (root, data) {",
    "  if (typeof module !== \"undefined\" && module.exports) module.exports = data; else /** @type {any} */ (root).LQClaimsRules = data;",
    "})(typeof self !== \"undefined\" ? self : this, {"
  ];
  const body = [];
  const keys = Object.keys(data);
  keys.forEach((k, i) => {
    const comma = i < keys.length - 1 ? "," : "";
    const v = data[k];
    if (Array.isArray(v) && (k === "rules" || k === "allow" || k === "masks" || k === "changes")) {
      body.push(`  ${JSON.stringify(k)}: [`);
      v.forEach((item, j) => {
        const c2 = j < v.length - 1 ? "," : "";
        if (k !== "allow") {
          const lines = JSON.stringify(item, null, 1).split("\n").map(l => "   " + l.replace(/^ +/, m => "  ".repeat(m.length)));
          lines[lines.length - 1] += c2;
          body.push(...lines);
        } else body.push("    " + JSON.stringify(item) + c2);
      });
      body.push("  ]" + comma);
    } else body.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 1).split("\n").join("\n  ")}${comma}`);
  });
  return head.join("\n") + "\n" + body.join("\n") + "\n});\n";
}

function main() {
  const args = process.argv.slice(2);
  const src = render(build(JSON.parse(readFileSync(DRAFT, "utf8"))));
  if (args.includes("--changes")) {
    for (const c of [...CHANGES, ...POST_REVIEW, ...ADVERT_CHANGES, ...RULE_WORK, ...RULE_WORK_2]) console.log(`- ${c.rule}: ${c.what} (${c.why})`);
    return;
  }
  if (args.includes("--check")) {
    const cur = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
    if (cur !== src) { console.log("lensiq-claims-rules.js is NOT up to date: run node tools/pc-rules-build.mjs"); process.exit(1); }
    console.log("lensiq-claims-rules.js is up to date (sha256 " + createHash("sha256").update(src).digest("hex") + ")");
    return;
  }
  writeFileSync(OUT, src);
  console.log("wrote lensiq-claims-rules.js (sha256 " + createHash("sha256").update(src).digest("hex") + ")");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
