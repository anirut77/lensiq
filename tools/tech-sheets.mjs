#!/usr/bin/env node
// tools/tech-sheets.mjs — owner decision 223 (2026-11-21): customer pages no longer show accuracy figures, source tags,
// status legends or status reasons. The figures are not lost: this tool writes them, verbatim, into
//   docs/tech-sheets/<product>-TH.md and <product>-EN.md   one technical sheet per product (18 products), for buyers on request
//   docs/tech-sheets/README.md                            index, how to hand a sheet to a buyer, platform-wide originals
//   admin-measurements.js                                 window.LQ_MEASUREMENTS for the back-office tab "ผลการวัด"
// from (never typed by hand):
//   docs/tech-sheets/ORIGINAL-FIGURES-223.json   every original page text at base (locked, tools/accuracy-snapshot-223.mjs)
//   tests/unit/accuracy-removal-223.spec.json    the approved two lines per product (`lines`, `techSheets.linesOf`)
//   docs/accuracy-figures.json                   the measured figures + the former page texts rendered from them
//   docs/ACCURACY-CLAIMS.md section 4            the claims register (which page text carried which number, n and label)
//
//   node tools/tech-sheets.mjs           write the files (idempotent)
//   node tools/tech-sheets.mjs --check   exit 1 and list every file that is missing or stale
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFigures, expand } from "./accuracy-sync.mjs";
import { productOf } from "./accuracy-snapshot-223.mjs";
import { visibility } from "./cat-pages.mjs";
import { createRequire } from "node:module";
const CD = createRequire(import.meta.url)("./cat-data.cjs");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DIR = "docs/tech-sheets";
export const SNAPSHOT = DIR + "/ORIGINAL-FIGURES-223.json";
export const SUPPLEMENT = DIR + "/SUPPLEMENT-223.json";
export const SPEC = "tests/unit/accuracy-removal-223.spec.json";
export const ADMIN_DATA = "admin-measurements.js";
export const MARK_EN = "Internal / for buyers on request — measured figures and their sources (owner decision 223)";
export const MARK_TH = "เอกสารภายใน / มอบให้ผู้ซื้อเมื่อขอ — ตัวเลขที่วัดได้และแหล่งที่มา (คำตัดสินของเจ้าของ ข้อ 223)";

const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const squash = s => String(s).replace(/\s+/g, " ").trim();

/** Products: title per language, pages, extra approved line sets, known limits and licences (TH / EN). Limits are plain
 *  words only; every number is in the measured-figures sections, quoted from the sources. */
export const PRODUCTS = [
  {
    id: "crowd", pages: "crowd.html",
    th: "Crowd: นับคนและความหนาแน่นในอีเวนต์",
    en: "Crowd: people counts and crowding at events",
    zh: "Crowd：活动人数与拥挤程度",
    limits: {
      th: [
        "ยังไม่เหมาะกับฝูงชนหนาแน่น: คนที่ยืนเบียดกันหรืออยู่ไกลกล้องจะถูกนับขาดมาก",
        "ยังไม่มีผลวัดจากงานของลูกค้าจริง ตัวเลขด้านบนมาจากวิดีโอสาธารณะ",
        "ไม่ระบุตัวตนและไม่เก็บภาพ ใช้ดูแนวโน้ม ไม่ใช่ระบบความปลอดภัยของฝูงชน"
      ],
      en: [
        "Not yet suitable for dense crowds: people packed together or far from the camera are heavily undercounted",
        "Nothing has been measured at a customer event yet; the figures above come from public videos",
        "Identifies no one and stores no images; use it for trends, not as a crowd-safety system"
      ]
    },
    lic: {
      th: "ตัวตรวจจับคน YOLOX-nano (Apache-2.0) บน onnxruntime-web (MIT) และ COCO-SSD สำรอง (Apache-2.0)",
      en: "Person detector YOLOX-nano (Apache-2.0) on onnxruntime-web (MIT), COCO-SSD fallback (Apache-2.0)"
    }
  },
  {
    id: "gate", pages: "gate.html, parking.html, village.html",
    th: "Gate: อ่านป้ายทะเบียน (ประตู ลานจอด หมู่บ้าน)",
    en: "Gate: plate reading (gate, car park, village)",
    zh: "Gate：车牌识别（道闸、停车场、小区）",
    limits: {
      th: [
        "เจ้าหน้าที่ยืนยันรถทุกคันก่อนเปิดไม้กั้นหรือเก็บเงิน",
        "ป้ายเอียง มืด สกปรก หรือป้ายรถจักรยานยนต์อาจอ่านผิด",
        "ยังไม่มีผลวัดที่ด่านหรือลานจอดจริง การเปิดไม้กั้นอัตโนมัติในหมู่บ้านต้องผ่านการทดสอบหน้างานก่อน"
      ],
      en: [
        "Staff confirm every car before the barrier opens or a fee is charged",
        "Tilted, dark, dirty or motorcycle plates may be misread",
        "Nothing has been measured at a real gate or car park yet; village auto-open needs a passed on-site test first"
      ]
    },
    lic: {
      th: "PP-OCRv5 Thai (Apache-2.0), ตัวหาป้าย LPD-YuNet (OpenCV Zoo) — ดูสิทธิ์ข้อมูลฝึกใน LICENSES/THIRD_PARTY.md",
      en: "PP-OCRv5 Thai recogniser (Apache-2.0), LPD-YuNet plate finder (OpenCV Zoo); training-data rights in LICENSES/THIRD_PARTY.md"
    }
  },
  {
    id: "exam", pages: "exam.html, exam-lab.html, exam-hall.html, exam-dashboard.html", extra: ["examlab","examhall"],
    th: "Exam: ห้องสอบ (lab, ห้องสอบแบบกล้องรอบห้อง, แดชบอร์ดผู้คุมสอบ)",
    en: "Exam: lab, exam hall and invigilator dashboard",
    zh: "Exam：考场（实验室、考场全景、监考面板）",
    limits: {
      th: [
        "ระบบแจ้งให้ตรวจเท่านั้น ไม่ตัดสินการทุจริต ผู้คุมสอบต้องเดินตรวจห้องตามปกติ",
        "โทรศัพท์ที่วางบนโต๊ะมักตรวจไม่พบ ใบหน้าที่อยู่ไกลกล้องในห้องสอบแบบกล้องรอบห้องยังหาไม่เจอ",
        "ยังไม่มีผลวัดในห้องสอบจริง ตัวเลขด้านบนมาจากภาพสาธารณะ ไม่ใช่เว็บแคมหรือห้องสอบจริง",
        "ไม่อ่านอารมณ์และไม่จดจำตัวบุคคล"
      ],
      en: [
        "The system only flags seats to check; it never decides misconduct, and invigilators still walk the room",
        "A phone lying on the desk is usually missed; faces far from the camera in the hall view are not found yet",
        "Nothing has been measured in a real exam room yet; the figures above come from public still images, not webcams or exam rooms",
        "Reads no emotion and recognises no one"
      ]
    },
    lic: {
      th: "MediaPipe Face Landmarker และ BlazeFace (Apache-2.0), TensorFlow.js (Apache-2.0); ห้องสอบแบบกล้องรอบห้อง: YOLOX-nano / COCO-SSD (Apache-2.0)",
      en: "MediaPipe Face Landmarker and BlazeFace (Apache-2.0), TensorFlow.js (Apache-2.0); hall view: YOLOX-nano / COCO-SSD (Apache-2.0)"
    }
  },
  {
    id: "attendance", pages: "attendance.html",
    th: "Attendance: ลงเวลาทำงาน (PIN/QR, สแกนใบหน้าเป็นทางเลือก)",
    en: "Attendance: time clock (PIN/QR, optional face scan)",
    zh: "Attendance：考勤（PIN/二维码，可选人脸）",
    limits: {
      th: [
        "PIN/QR ไม่ใช้กล้อง สแกนใบหน้าเฉพาะพนักงานที่ยินยอม",
        "สแกนใบหน้าไม่ได้กันภาพปลอมทุกแบบ ควรมีคนดูจุดลงเวลา",
        "ยังไม่มีผลวัดในที่ทำงานจริง ตัวเลขด้านบนมาจากภาพใบหน้าสาธารณะ"
      ],
      en: [
        "PIN/QR needs no camera; face scan only for staff who consent",
        "Face scan does not stop every fake image, so someone should watch the clock-in point",
        "Nothing has been measured at a real workplace yet; the figures above come from public face photos"
      ]
    },
    lic: {
      th: "face-api.js (โค้ด MIT) โมเดลจดจำใบหน้าจาก dlib (CC0) ฝึกจากชุดข้อมูลเชิงวิชาการ: F5/F6 ใน LICENSES/THIRD_PARTY.md",
      en: "face-api.js (MIT code), recognition model ported from dlib (CC0 weights, academic training data): F5/F6 in LICENSES/THIRD_PARTY.md"
    }
  },
  {
    id: "product-check", pages: "medicine.html",
    th: "Product Check: ตรวจฉลากยา สินค้า และคำโฆษณา",
    en: "Product Check: medicine and product labels, advert wording",
    zh: "Product Check：药品与商品标签、广告用语",
    limits: {
      th: [
        "อาจอ่านชื่อยาหรือตัวเลขผิด และอาจพลาดคำโฆษณาที่เขียนต่างออกไป",
        "ไม่ใช่การตรวจขั้นสุดท้าย ยืนยันกับเภสัชกรเสมอ",
        "ภาพไม่ออกจากเครื่อง"
      ],
      en: [
        "It may misread a medicine name or a number and may miss advert wording phrased differently",
        "It is not a final check; always confirm with a pharmacist",
        "Photos never leave the device"
      ]
    },
    lic: {
      th: "PP-OCRv5 (Apache-2.0), BlazeFace (Apache-2.0), zxing-wasm / barcode-detector (MIT)",
      en: "PP-OCRv5 detector and recognisers (Apache-2.0), BlazeFace (Apache-2.0), zxing-wasm / barcode-detector (MIT)"
    }
  },
  {
    id: "nutrition", pages: "nutrition.html",
    th: "Nutrition: อ่านฉลากโภชนาการ",
    en: "Nutrition: nutrition-label reader",
    zh: "Nutrition：营养标签读取",
    limits: {
      th: [
        "ตัวอักษรเล็ก ฉลากโค้ง หรือแสงสะท้อนทำให้ค่าผิดได้ เทียบกับฉลากจริงเสมอ",
        "ไม่ใช่คำแนะนำทางการแพทย์"
      ],
      en: [
        "Small print, curved labels or glare can give wrong values; always compare with the real label",
        "Not medical advice"
      ]
    },
    lic: {
      th: "PP-OCRv5 (Apache-2.0)",
      en: "PP-OCRv5 (Apache-2.0)"
    }
  },
  {
    id: "studio", pages: "studio.html, photobooth.html, converter.html", extra: ["photobooth","converter"],
    th: "Studio และตู้ถ่ายรูป (รวมแปลงเอกสาร)",
    en: "Studio and photo booth (with the converter)",
    zh: "Studio 与拍照亭（含文档转换）",
    limits: {
      th: [
        "บางภาพอาจมีขอบหรือรอยต่อแปลก ตรวจทุกภาพก่อนใช้",
        "ชุดวาดยังเป็นฉบับร่างและปิดอยู่โดยค่าเริ่มต้น",
        "เอกสารที่มีตารางหรือภาพซับซ้อนอาจไม่คงรูปแบบ"
      ],
      en: [
        "Some images may show odd edges or seams; look at every image before use",
        "Drawn outfits are still a draft and are off by default",
        "Documents with complex tables or images may not keep their layout"
      ]
    },
    lic: {
      th: "MODNet (Apache-2.0), MediaPipe Selfie Multiclass / selfie segmenter (Apache-2.0), face-api.js (MIT); face-parse (F1) ไม่ใช้เชิงพาณิชย์และไม่อยู่ใน repo",
      en: "MODNet (Apache-2.0), MediaPipe Selfie Multiclass / selfie segmenter (Apache-2.0), face-api.js (MIT); the face-parse model (F1) is non-commercial and never committed"
    }
  },
  {
    id: "omr", pages: "omr.html",
    th: "OMR: ตรวจกระดาษคำตอบ",
    en: "OMR: answer-sheet grading",
    zh: "OMR：答题卡评分",
    limits: {
      th: [
        "รอยฝนจางหรือเลยช่อง หรือภาพเอียง อาจอ่านผิด แผ่นที่ไม่แน่ใจจะถูกส่งให้ครูตรวจ"
      ],
      en: [
        "Faint or overflowing marks or a tilted photo may be misread; unsure sheets are flagged for the teacher"
      ]
    },
    lic: {
      th: "โค้ดของเราเอง ไม่มีโมเดลภายนอก",
      en: "Our own code, no third-party model"
    }
  },
  {
    id: "tryon", pages: "tryon.html",
    th: "Try-On: ลองแว่น หมวก ต่างหู และเสื้อบนภาพกล้อง",
    en: "Try-On: glasses, hats, earrings and tops on the camera image",
    zh: "Try-On：在摄像头画面上试戴",
    limits: {
      th: [
        "เป็นภาพตัวอย่าง ขนาดและตำแหน่งอาจต่างจากของจริง"
      ],
      en: [
        "It is a preview; size and position may differ from the real item"
      ]
    },
    lic: {
      th: "MediaPipe Face Landmarker, Pose Landmarker และ selfie segmenter (Apache-2.0); โมเดลลองชุดด้วย AI ปิดอยู่จนกว่าจะยืนยันสิทธิ์ (F2)",
      en: "MediaPipe Face Landmarker, Pose Landmarker and selfie segmenter (Apache-2.0); AI try-on stays off until a licence is attested (F2)"
    }
  },
  {
    id: "store", pages: "store.html, retail.html, insights.html", extra: ["insights"],
    th: "Store และ Retail: นับคนเข้าร้าน คิว และอัตราซื้อโดยประมาณ (รวม Insights)",
    en: "Store and Retail: door counts, queues, estimated conversion (with Insights)",
    zh: "Store 与 Retail：进店人数、排队与估算转化率（含 Insights）",
    limits: {
      th: [
        "กลุ่มคนหรือคนแน่นหน้าประตูอาจนับผิด เทียบกับการนับเองก่อนใช้ตัวเลข",
        "ยังไม่มีผลวัดที่หน้าร้านของลูกค้า ตัวเลขด้านบนมาจากวิดีโอสาธารณะ (ถนนและสถานี)",
        "ไม่ระบุตัวตน"
      ],
      en: [
        "Groups or crowds at the door can be miscounted; compare with your own count before relying on it",
        "Nothing has been measured at a customer's shop yet; the figures above come from public videos (streets and stations)",
        "Identifies no one"
      ]
    },
    lic: {
      th: "YOLOX-nano บน onnxruntime-web และ COCO-SSD สำรอง (Apache-2.0 / MIT), MobileNetV2 (Apache-2.0) สำหรับ re-ID ที่เลือกได้",
      en: "YOLOX-nano on onnxruntime-web with COCO-SSD fallback (Apache-2.0 / MIT), MobileNetV2 (Apache-2.0) for the optional re-ID"
    }
  },
  {
    id: "booth", pages: "booth.html",
    th: "Booth: นับผู้เข้าชมบูธ",
    en: "Booth: booth visitor counts",
    zh: "Booth：展位访客统计",
    limits: {
      th: [
        "นับเฉพาะคนที่หันหน้าเข้ากล้อง ใช้ดูแนวโน้ม ไม่ใช่ยอดที่แน่นอน",
        "ไม่เก็บข้อมูลใบหน้าโดยค่าเริ่มต้น"
      ],
      en: [
        "Only people facing the camera are counted; use it for trends, not exact totals",
        "Keeps no face data by default"
      ]
    },
    lic: {
      th: "face-api.js (โค้ด MIT; โมเดลใบอนุญาตวิจัย F5/F6 ปิดในรุ่นลูกค้า)",
      en: "face-api.js (MIT code; research-licence models F5/F6, off in customer builds)"
    }
  },
  {
    id: "zones", pages: "queue.html, tables.html, bays.html, afterhours.html",
    th: "Zones: คิว โต๊ะว่าง ช่องจอด และพื้นที่หวงห้ามนอกเวลา",
    en: "Zones: queues, free tables, parking bays, after-hours areas",
    zh: "Zones：排队、空桌、车位与非营业时间区域",
    limits: {
      th: [
        "เงา แสง หรือคนบังกันอาจทำให้เตือนผิดหรือนับขาด เจ้าหน้าที่ตรวจก่อนดำเนินการ",
        "ไม่ระบุตัวตนและไม่บันทึกภาพ"
      ],
      en: [
        "Shadows, lights or people blocking each other can cause false alerts or missed counts; staff check before acting",
        "Identifies no one and saves no images"
      ]
    },
    lic: {
      th: "YOLOX-nano บน onnxruntime-web (Apache-2.0 / MIT)",
      en: "YOLOX-nano on onnxruntime-web (Apache-2.0 / MIT)"
    }
  },
  {
    id: "checkout", pages: "checkout.html",
    th: "Checkout: สแกนบาร์โค้ดสินค้า",
    en: "Checkout: product barcode scanning",
    zh: "Checkout：商品条码扫描",
    limits: {
      th: [
        "ภาพสั่น เบลอ หรือเอียงมากอ่านไม่ได้ ตรวจตะกร้าก่อนรับเงิน"
      ],
      en: [
        "Shaky, blurred or steeply tilted images cannot be read; check the basket before taking payment"
      ]
    },
    lic: {
      th: "BarcodeDetector ของเบราว์เซอร์, MobileNetV2 (Apache-2.0)",
      en: "Browser BarcodeDetector, MobileNetV2 (Apache-2.0)"
    }
  },
  {
    id: "creative", pages: "creative.html",
    th: "Creative: คาดการณ์จุดที่คนจะมองบนโฆษณา",
    en: "Creative: predicted attention on an ad",
    zh: "Creative：广告注意力预测",
    limits: {
      th: [
        "เป็นการคาดการณ์ ไม่ใช่การติดตามสายตาจริง"
      ],
      en: [
        "It is a prediction, not real eye tracking"
      ]
    },
    lic: {
      th: "โมเดลคลาสสิกที่ไม่ต้องฝึก เขียนเอง (creative-core.js), face-api.js (MIT)",
      en: "Training-free classic models, our own implementation (creative-core.js), face-api.js (MIT)"
    }
  },
  {
    id: "driver", pages: "driver.html",
    th: "Driver: เตือนเมื่อหลับตาหรือละสายตา",
    en: "Driver: eyes-closed and looking-away alerts",
    zh: "Driver：闭眼与视线偏离提醒",
    limits: {
      th: [
        "เตือนได้เพียงบางส่วน ไม่ใช่อุปกรณ์ความปลอดภัย ห้ามใช้แทนการพักผ่อน",
        "ผลวัดมาจากการขับจำลองและภาพสาธารณะ ไม่ใช่คนขับที่ง่วงจริง",
        "ห้ามมองจอขณะขับ"
      ],
      en: [
        "It catches only some cases; it is not a safety device and never replaces rest",
        "Measured on simulated drives and public photos, not real drowsy drivers",
        "Do not look at the screen while driving"
      ]
    },
    lic: {
      th: "face-api.js (MIT); ตัวจำแนกตาปิดฝึกเอง (EYE_MODEL ใน driver.js) ดูเงื่อนไขข้อมูลฝึกใน LICENSES/THIRD_PARTY.md",
      en: "face-api.js (MIT); our own closed-eye classifier (EYE_MODEL in driver.js), training-data terms in LICENSES/THIRD_PARTY.md"
    }
  },
  {
    id: "qc", pages: "qc.html",
    th: "QC: ตรวจขวดและฝาบนไลน์ผลิต",
    en: "QC: bottle and cap checks on the line",
    zh: "QC：产线瓶身与瓶盖检查",
    limits: {
      th: [
        "แสงหรือตำแหน่งกล้องที่เปลี่ยนทำให้คัดทิ้งผิดได้ ปรับเทียบด้วยขวดตัวอย่างก่อนทุกรอบ"
      ],
      en: [
        "Changes in light or camera position can cause wrong rejects; calibrate with a sample bottle before each run"
      ]
    },
    lic: {
      th: "โค้ดของเราเอง ไม่มีโมเดลภายนอก",
      en: "Our own code, no third-party model"
    }
  },
  {
    id: "hr", pages: "hr.html, interview.html, case-review.html, teamface.html",
    th: "HR: ชุดสัมภาษณ์แบบมีโครงสร้าง",
    en: "HR: structured interview kit",
    zh: "HR：结构化面试工具",
    limits: {
      th: [
        "ผู้สัมภาษณ์เป็นผู้ให้คะแนน ระบบไม่ตัดสินการจ้าง",
        "ไม่อ่านอารมณ์และไม่จับโกหก (งานวิจัยที่ตีพิมพ์ด้านล่างแสดงว่าคนทั่วไปจับโกหกได้ใกล้เคียงการเดา)"
      ],
      en: [
        "Interviewers give the scores; the system makes no hiring decision",
        "Reads no emotion and detects no lies (the published research below shows people detect lies at close to chance)"
      ]
    },
    lic: {
      th: "face-api.js (MIT) เฉพาะตัวเลือกกล้องที่ผู้สมัครยินยอม",
      en: "face-api.js (MIT), only for the camera option the candidate consents to"
    }
  },
  {
    id: "research-models", pages: "customers.html, signage.html, neuro.html, cameras.html",
    th: "โมเดลใบอนุญาตวิจัย (อายุ/เพศ สีหน้า มือ และโมเดลใบหน้า face-api.js)",
    en: "Research-licence models (age/gender, expression, hands, face-api.js face models)",
    zh: "研究许可模型（年龄/性别、表情、手势、face-api.js 人脸模型）",
    ownLines: {
      th: [
        "โมเดลที่ข้อมูลฝึกอนุญาตเฉพาะงานวิจัย ใช้ในหน้าสมาชิกร้าน ป้ายดิจิทัล และ neuro",
        "อายุ/เพศ และสีหน้า ปิดในรุ่นสำหรับลูกค้าและมีป้ายใบอนุญาต ไม่ใช้ตัดสินบุคคล"
      ],
      en: [
        "Models whose training data is licensed for research only, used by the shop-members, signage and neuro pages",
        "Age/gender and expression are off in customer builds and carry a licence label; never used to judge a person"
      ]
    },
    limits: {
      th: [
        "ผลบนชุดข้อมูลสาธารณะเป็นขอบบน ไม่ใช่ผลหน้างาน",
        "ไม่ใช้ตัดสินบุคคล ไม่อ่านอารมณ์ในงานสอบ HR หรือการศึกษา",
        "สิทธิ์ใช้เชิงพาณิชย์ของข้อมูลฝึกเป็นคำถามสำหรับทนาย (F5/F6)"
      ],
      en: [
        "Public-dataset results are an upper bound, not field results",
        "Never used to judge a person; no emotion inference in exams, HR or education",
        "Commercial rights to the training data are a question for counsel (F5/F6)"
      ]
    },
    lic: {
      th: "face-api.js (โค้ด MIT, ข้อมูลฝึกเชิงวิจัย F5/F6), MediaPipe Hand Landmarker (Apache-2.0)",
      en: "face-api.js (MIT code, research training data F5/F6), MediaPipe Hand Landmarker (Apache-2.0)"
    }
  }
];

/** product of a key prefix when the snapshot has no entry for the key */
const PREFIX = { attendance: "attendance", customers: "research-models", booth: "booth", driver: "driver", signage: "research-models",
  neuro: "research-models", store: "store", qc: "qc", cameras: "_platform", medicine: "product-check", gate: "gate", md: "product-check" };
/** claims register page -> product */
const REG_SHEET = { exam: "exam", attendance: "attendance", store: "store", retail: "store", hr: "hr", crowd: "crowd" };

/** split a Markdown table row on unescaped "|" -> trimmed cells ("\|" becomes "|") */
export function cells(line) {
  const out = []; let cur = "";
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; } else if (s[i] === "|") { out.push(cur.trim()); cur = ""; } else cur += s[i];
  }
  out.push(cur.trim());
  return out;
}
const list = c => (c === "—" || c === "" || c == null ? [] : c.split(";").map(x => x.trim()).filter(Boolean));

/** docs/ACCURACY-CLAIMS.md section 4 -> [{id, page, dict, key, sheet, figures[], n[], labels[], evidence, quote[]}] */
export function register(root = ROOT) {
  const md = read(root, "docs/ACCURACY-CLAIMS.md");
  const m = md.match(/<!-- claims-register:start -->([\s\S]*?)<!-- claims-register:end -->/);
  if (!m) throw new Error("docs/ACCURACY-CLAIMS.md: register markers missing");
  const rows = m[1].split("\n").filter(l => /^\|/.test(l.trim()));
  const head = cells(rows[0]);
  return rows.slice(2).map(l => {
    const c = cells(l), r = {};
    head.forEach((h, i) => { r[h] = c[i]; });
    return { ...r, sheet: r.sheet || REG_SHEET[r.page], figures: list(r.figures), n: list(r.n), labels: list(r.labels), quote: list(r.quote) };
  });
}

/** everything the sheets and the admin data are made of */
export function model(root = ROOT) {
  const snap = JSON.parse(read(root, SNAPSHOT));
  // page texts with numbers the base snapshot missed (no %, n = or source tag), recorded from the base commit by
  // tools/accuracy-supplement-223.mjs; they join the snapshot entries so the sheets and the admin data hold them too
  if (existsSync(join(root, SUPPLEMENT))) for (const e of JSON.parse(read(root, SUPPLEMENT)).entries) {
    const page = String(e.file).replace(/\.js$/, "").replace(/^docs\/(sales\/(customer\/)?)?/, "");
    snap.entries.push({ ...e, product: productOf(page, e.key, [e.th, e.en, e.text].filter(Boolean).join(" ")), supplement: true });
  }
  const spec = JSON.parse(read(root, SPEC));
  const fig = loadFigures(root);
  const reg = register(root);
  const prodOfKey = new Map();
  for (const e of snap.entries) if (e.key && !prodOfKey.has(e.key)) prodOfKey.set(e.key, e.product);
  const texts = expand(fig).map(r => ({ ...r, product: prodOfKey.get(r.key) || PREFIX[r.key.split(".")[0]] || "_platform",
    figures: [...new Set((fig.texts.find(t => (t.keys || [t.key]).includes(r.key)).th.match(/\{(\w+)\}/g) || []).map(x => x.slice(1, -1)))] }));
  const figOf = new Map();
  for (const t of texts) for (const k of t.figures) { if (!figOf.has(k)) figOf.set(k, new Set()); figOf.get(k).add(t.product); }
  const products = PRODUCTS.map(p => {
    const lineIds = [spec.techSheets.linesOf[p.id], ...(p.extra || [])].filter(Boolean);
    const lines = lineIds.map(id => spec.lines.find(l => l.id === id)).filter(Boolean);
    return { ...p, lines, figures: Object.keys(fig.figures).filter(k => figOf.has(k) && figOf.get(k).has(p.id)) };
  });
  const orphanFigures = Object.keys(fig.figures).filter(k => !products.some(p => p.figures.includes(k)));
  const keyText = (page, key) => snap.entries.find(e => e.file === page + ".html" && e.key === key);
  const regRows = reg.map(r => ({ ...r, text: keyText(r.page, r.key) || null }));
  const snapSha = createHash("sha256").update(read(root, SNAPSHOT)).digest("hex").slice(0, 12);
  return { snap, spec, fig, texts, products, orphanFigures, register: regRows, snapSha };
}

/** a fence longer than any run of "~" in the content */
function fence(lines) { let n = 4; for (const l of lines) { const m = l.match(/~+/g); if (m) n = Math.max(n, ...m.map(x => x.length + 1)); } return "~".repeat(n); }
function block(lines) { const f = fence(lines); return [f + "text", ...lines, f, ""]; }
/** entries grouped by source file, one squashed line per entry: "[key] text" */
function byFile(entries, pick) {
  const out = [], files = [...new Set(entries.map(e => e.file))];
  for (const f of files) {
    const lines = entries.filter(e => e.file === f && pick(e)).map(e => (e.key ? `[${e.key}] ` : "") + squash(pick(e)));
    if (lines.length) out.push(`#### ${f}`, "", ...block(lines));
  }
  return out;
}

function header(m, title, lang) {
  return [`# ${title}`, "", `> **${MARK_EN}**`, ...(lang === "TH" ? [">", `> **${MARK_TH}**`] : []), "",
    lang === "TH"
      ? `สร้างโดย \`node tools/tech-sheets.mjs\` จาก \`${SNAPSHOT}\` (sha256 ${m.snapSha}…), \`docs/accuracy-figures.json\``
        + " และทะเบียนใน `docs/ACCURACY-CLAIMS.md` ห้ามแก้ด้วยมือ"
      : `Generated by \`node tools/tech-sheets.mjs\` from \`${SNAPSHOT}\` (sha256 ${m.snapSha}…), \`docs/accuracy-figures.json\``
        + " and the register in `docs/ACCURACY-CLAIMS.md`. Do not edit by hand.", ""];
}

const raw = (f, word) => (f.raw === undefined ? "" : ` (${word} ${f.raw})`);
function figureLines(m, keys, L) {
  return keys.map(k => {
    const f = m.fig.figures[k];
    return L === "TH"
      ? `- \`${k}\`: ค่า **${f.value}**${raw(f, "ค่าดิบ")} — ${f.what} — หลักฐานใน \`${m.fig.source}\`: \`${f.md}\``
      : `- \`${k}\`: value **${f.value}**${raw(f, "raw")} — ${f.what} — evidence in \`${m.fig.source}\`: \`${f.md}\``;
  });
}

const SRC_TH = { synthetic: "ข้อมูลจำลอง", public: "ชุดข้อมูลสาธารณะ", field: "หน้างานจริง", none: "ยังไม่ได้วัด", na: "ไม่เกี่ยวข้อง", prelim: "เบื้องต้น", published: "งานวิจัยที่ตีพิมพ์" };

function catLines(items, L) {
  const out = [];
  for (const c of items) {
    const src = !c.src ? "" : L === "TH" ? ` · ที่มา: ${c.src}${SRC_TH[c.src] ? " (" + SRC_TH[c.src] + ")" : ""}` : ` · source: ${c.src}`;
    const ref = !c.ref ? "" : L === "TH" ? ` · อ้างอิง: ${c.ref}` : ` · reference: ${c.ref}`;
    out.push(`- \`${c.key}\`` + src + ref);
    out.push(`  - TH: ${squash(c.th)}`, `  - EN: ${squash(c.en)}`, `  - 中文: ${squash(c.zh)}`);
  }
  return out;
}

export function sheet(m, p, L) {
  const T = L === "TH";
  const entries = m.snap.entries.filter(e => e.product === p.id);
  const cat = m.snap.catData.filter(e => e.product === p.id);
  const texts = m.texts.filter(t => t.product === p.id);
  const reg = m.register.filter(r => r.sheet === p.id);
  const o = header(m, `${T ? p.th : p.en} — ${T ? "เอกสารเทคนิค" : "technical sheet"}`, L);
  o.push(T ? `หน้าเว็บ: ${p.pages}` : `Pages: ${p.pages}`, "");
  o.push(T ? "## ใช้ทำอะไร" : "## ใช้ทำอะไร (what it is for)", "");
  o.push(T ? "สองบรรทัดที่แสดงบนหน้าเว็บ (คำตัดสินข้อ 223-7):" : "The two lines shown on the web page (decision 223-7):", "");
  for (const ln of p.lines) for (const n of ["1", "2"]) { if (ln[n]) o.push(`- ${T ? ln[n].th : ln[n].en}${p.lines.length > 1 ? ` (${ln.id})` : ""}`); }
  if (!p.lines.length && p.ownLines) for (const s of p.ownLines[T ? "th" : "en"]) o.push(`- ${s}`);
  o.push("");
  o.push(T ? "## ตัวเลขที่วัดได้" : "## Measured figures", "");
  o.push(T ? "ทุกตัวเลขระบุที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) ตามข้อความเดิม ตัวเลขไม่ได้พิมพ์ซ้ำด้วยมือ"
    : "Every figure states its source (synthetic, public dataset or field) as in the original text; no number is retyped by hand.", "");
  if (p.figures.length) {
    o.push(T ? "### ตัวเลขใน docs/accuracy-figures.json" : "### Figures in docs/accuracy-figures.json", "", ...figureLines(m, p.figures, L), "");
  }
  if (texts.length) {
    o.push(T ? "### ข้อความตัวเลขเดิมบนหน้าเว็บ (สร้างจาก docs/accuracy-figures.json)" : "### Former page texts rendered from docs/accuracy-figures.json", "");
    for (const t of texts) {
      o.push(`- \`${t.key}\` (${t.page}.html)`);
      if (T) o.push(`  - ${squash(t.th)}`); else o.push(`  - EN: ${squash(t.en)}`, `  - 中文: ${squash(t.zh)}`);
    }
    o.push("");
  }
  if (reg.length) {
    o.push(T ? "### ทะเบียนคำอ้าง (docs/ACCURACY-CLAIMS.md ข้อ 4)" : "### Claims register (docs/ACCURACY-CLAIMS.md section 4)", "");
    for (const r of reg) {
      o.push(`- **${r.id}** \`${r.key}\` (${r.page}.html) · ${T ? "ตัวเลข" : "figures"}: ${r.figures.join("; ") || "—"} · n: ${r.n.join("; ") || "—"}`
        + ` · ${T ? "ป้าย" : "labels"}: ${r.labels.join("; ")} · ${T ? "หลักฐาน" : "evidence"}: ${r.evidence}`);
      if (r.text) { if (T) o.push(`  - ${squash(r.text.th)}`); else o.push(`  - EN: ${squash(r.text.en)}`, `  - 中文: ${squash(r.text.zh)}`); }
    }
    o.push("");
  }
  if (cat.length) {
    o.push(T ? "### บรรทัดการ์ดหมวดและเหตุผลสถานะเดิม (tools/cat-data.cjs ก่อนข้อ 223)"
      : "### Former category-card lines and status reasons (tools/cat-data.cjs before decision 223)", "", ...catLines(cat, L), "");
  }
  if (!p.figures.length && !texts.length && !reg.length && !cat.length) o.push(T ? "ไม่มีตัวเลขที่วัดได้" : "No measured figures.", "");
  o.push(T ? "## ข้อจำกัดที่รู้" : "## Known limits", "", ...p.limits[T ? "th" : "en"].map(s => `- ${s}`), "");
  o.push(T ? "## สัญญาอนุญาต" : "## Licences", "", `- ${p.lic[T ? "th" : "en"]}`,
    T ? "- รายละเอียดและสถานะการใช้เชิงพาณิชย์ของทุกโมเดลและข้อมูล: `LICENSES/THIRD_PARTY.md`" : "- Every model and dataset with its commercial-use status: `LICENSES/THIRD_PARTY.md`", "");
  o.push(T ? "## ข้อความเดิมก่อนคำตัดสินข้อ 223 (Original page text before decision 223)" : "## Original page text before decision 223", "");
  o.push(T ? "ข้อความที่ลูกค้าเห็นก่อนการเปลี่ยน คัดลอกตามจริงจาก snapshot (ช่องว่างถูกยุบเป็นช่องเดียว) แยกตามไฟล์ `[คีย์] ข้อความ`"
    : "What customers saw before the change, copied verbatim from the snapshot (whitespace collapsed), by file: `[key] text`.", "");
  if (T) o.push(...byFile(entries, e => e.th));
  else {
    o.push(...byFile(entries, e => e.en));
    if (entries.some(e => e.zh)) o.push("### 中文原文", "", ...byFile(entries, e => e.zh));
  }
  if (entries.some(e => e.text)) o.push(T ? "### ข้อความในสคริปต์และเอกสาร (ภาษาตามต้นฉบับ)" : "### Script and document strings (language as written)", "", ...byFile(entries, e => e.text));
  return o.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
}

export function readme(m) {
  const plat = m.snap.entries.filter(e => e.product === "_platform");
  const o = [`# Technical sheets / เอกสารเทคนิค`, "", `> **${MARK_EN}**`, ">", `> **${MARK_TH}**`, "",
    `Generated by \`node tools/tech-sheets.mjs\` (check: \`node tools/tech-sheets.mjs --check\`). Do not edit by hand.`, "",
    "## Index / สารบัญ", ""];
  for (const p of m.products) o.push(`- ${p.en} / ${p.th}: [TH](${p.id}-TH.md) · [EN](${p.id}-EN.md)`);
  o.push("", "## How to hand a sheet to a buyer / วิธีมอบเอกสารให้ผู้ซื้อ", "",
    "- ให้เฉพาะผู้ซื้อที่ขอ (one-pager และ deck เขียนว่า \"เอกสารเทคนิคขอได้จากฝ่ายขาย\") ไม่ลิงก์จากหน้าลูกค้า",
    "- ใช้ไฟล์ล่าสุดจาก branch main แปลง Markdown เป็น PDF แล้วส่งแผ่น TH หรือ EN ตามภาษาผู้ซื้อ (แผ่น EN มีข้อความจีนเดิมด้วย)",
    "- ตัวเลขทุกตัวมีที่มากำกับ (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) อย่าตัดที่มาหรือข้อแม้ออกเมื่อยกไปใช้",
    "- ยังไม่มีผลวัดหน้างานของลูกค้าจริงในผลิตภัณฑ์ใด อธิบายตามหัวข้อ \"ข้อจำกัดที่รู้\" ของแต่ละแผ่น",
    "- Give a sheet only to a buyer who asks (the one-pagers and decks say the technical sheet is available from sales); never link it from a customer page.",
    "- Use the latest file from main, convert the Markdown to PDF and send the TH or EN sheet in the buyer's language (the EN sheet also carries the original Chinese text).",
    "- Every figure carries its source (synthetic, public dataset or field); never drop the source or the caveats when quoting it.",
    "- The same data is in the back office (admin.html, tab \"ผลการวัด / Measurements\", after sign-in).", "");
  o.push("## Status definitions, legends and platform texts before decision 223 / นิยามสถานะ legend และข้อความหน้าแพลตฟอร์มเดิม", "");
  o.push("### Category data (tools/cat-data.cjs): status words, legends, source tags, reasons", "", ...catLines(m.snap.catData.filter(e => e.product === "_platform"), "EN"), "");
  o.push("### Page status at base (tools/cat-data.cjs STATUS) / สถานะหน้าเดิม", "");
  for (const [pg, s] of Object.entries(m.snap.pageStatus)) o.push(`- ${pg}: ${s.st} · why: ${s.why} · claims: ${(s.claims || []).join(", ")}`);
  o.push("");
  if (m.orphanFigures.length) o.push("### Figures not used in any former page text / ตัวเลขที่ไม่ได้อยู่ในข้อความหน้าใด", "", ...figureLines(m, m.orphanFigures, "EN"), "");
  o.push("### Platform pages: original text (TH) / ข้อความเดิมภาษาไทย", "", ...byFile(plat, e => e.th));
  o.push("### Platform pages: original text (EN)", "", ...byFile(plat, e => e.en));
  o.push("### 中文原文", "", ...byFile(plat, e => e.zh));
  o.push("### Platform scripts and documents (language as written)", "", ...byFile(plat, e => e.text));
  return o.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
}

/** the renderer shipped inside admin-measurements.js (admin.js calls it with its own helpers: h, G, table, lang) */
const RENDER = [
  "  /** admin.html tab \"ผลการวัด\": one collapsible card per product (figures table + every original text), language = x.lang",
  "   *  @param {HTMLElement} box @param {any} x */",
  "  function render(box, x) {",
  "    var M = /** @type {any} */ (window).LQ_MEASUREMENTS, G = x.G, h = x.h, L = x.lang, items = M.catData.concat(M.entries);",
  "    var pick = function (/** @type {any} */ e) { return e[L] || e.th || e.en || e.zh || e.text || \"\"; };",
  "    var link = function (/** @type {string} */ u, /** @type {string} */ t) { return h(\"a\", { href: u, target: \"_blank\", rel: \"noopener noreferrer\", text: t }); };",
  "    var heads = [G(\"adm.meas.k\", \"ตัวเลข\"), G(\"adm.meas.v\", \"ค่า\"), G(\"adm.meas.w\", \"สิ่งที่วัด\"), G(\"adm.meas.e\", \"หลักฐานใน ACCURACY.md\")];",
  "    var plat = { id: \"_platform\", th: G(\"adm.meas.plat\", \"ทั้งแพลตฟอร์ม: นิยามสถานะ คำอธิบายป้าย และหน้าแพลตฟอร์ม\"), figures: [] };",
  "    box.textContent = \"\";",
  "    // decision 226: every product's status label (back office only) and whether customers see it (nav.js visibility list)",
  "    var vis = h(\"details\", { class: \"ad-card ad-meas\", open: \"\" }, h(\"summary\", null, h(\"strong\", { text: G(\"adm.vis.h\", \"สถานะระบบและการแสดงต่อลูกค้า\") })));",
  "    vis.appendChild(x.table([G(\"adm.vis.page\", \"หน้า\"), G(\"adm.vis.label\", \"ป้ายสถานะ (หลังบ้านเท่านั้น)\"), G(\"adm.vis.shown\", \"แสดงต่อลูกค้า\")],",
  "      M.visibility.map(function (/** @type {any} */ v) { return [v.page, v[L] || v.th || \"—\", v.shown === \"on\" ? G(\"adm.vis.on\", \"เปิด\") : G(\"adm.vis.off\", \"ปิด\")]; })));",
  "    box.appendChild(vis);",
  "    M.products.concat([plat]).forEach(function (/** @type {any} */ p) {",
  "      var sum = h(\"summary\", null, h(\"strong\", { text: p === plat ? p.th : pick(p) }), \" · \");",
  "      if (p === plat) sum.appendChild(link(\"docs/tech-sheets/README.md\", \"README\"));",
  "      else { sum.appendChild(link(p.sheetTH, \"TH\")); sum.appendChild(document.createTextNode(\" · \")); sum.appendChild(link(p.sheetEN, \"EN\")); }",
  "      var d = h(\"details\", { class: \"ad-card ad-meas\", \"data-product\": p.id }, sum), ul = h(\"ul\", { class: \"ad-meas-list\" });",
  "      if (p.figures.length) d.appendChild(x.table(heads, p.figures.map(function (/** @type {string} */ k) { var f = M.figures[k]; return [k, f.value, f.what, f.md]; })));",
  "      items.filter(function (/** @type {any} */ e) { return e.product === p.id && pick(e); }).forEach(function (/** @type {any} */ e) {",
  "        var where = (e.file || \"tools/cat-data.cjs\") + (e.key ? \" · \" + e.key : \"\") + (e.src ? \" · \" + e.src : \"\");",
  "        ul.appendChild(h(\"li\", null, h(\"code\", { text: where }), \" \", pick(e)));",
  "      });",
  "      d.appendChild(ul); box.appendChild(d);",
  "    });",
  "  }"
];

/** admin-measurements.js: flat string arrays, one record per line (each line is a run of literals, so it stays readable
 *  and within the line-width rule), rebuilt into objects when loaded. */
export function adminData(m) {
  const J = v => (v === undefined ? "null" : JSON.stringify(v));
  const row = vals => "    " + vals.map(J).join(", ") + ",";
  const E = m.snap.entries.map(e => row([e.file, e.key || "", e.product, e.th || "", e.en || "", e.zh || "", e.text || ""]));
  const C = m.snap.catData.map(c => row([c.key, c.product, c.src || "", c.ref || "", c.th, c.en, c.zh]));
  const F = Object.entries(m.fig.figures).map(([k, f]) => row([k, String(f.value), typeof f.raw === "number" ? f.raw : null, f.md || "", f.what || ""]));
  const P = m.products.map(p => row([p.id, p.th, p.en, p.zh, `${DIR}/${p.id}-TH.md`, `${DIR}/${p.id}-EN.md`, p.figures.join(";")]));
  const T = m.texts.map(t => row([t.key, t.product, t.th, t.en, t.zh]));
  const S = Object.entries(m.snap.pageStatus).map(([pg, s]) => row([pg, s.st || "", s.why || "", (s.claims || []).join(";")]));
  // decision 226: the status label of every product and whether customers see it (the nav.js visibility list); back office only
  const VIS = visibility(readFileSync(join(ROOT, "nav.js"), "utf8"));
  // re-lock 9: the nav.js list now names every page of the repo; the back office lists the products only (the category pages
  // and every non-support page such as tryon), not the platform pages (home, legal, help, crisis page, landing pages)
  const CATP = new Set(CD.CATEGORIES.flatMap(c => c.pages));
  const Vrec = Object.keys(VIS).filter(pg => CATP.has(pg) || (CD.PAGES[pg] && CD.PAGES[pg].st !== "support") || !existsSync(join(ROOT, pg + ".html"))).sort().map(pg => {
    const b = CD.badgeOf(pg), lab = b && CD.BADGE[b] ? CD.BADGE[b] : { th: "", en: "", zh: "" };
    return [pg, lab.th, lab.en, lab.zh, VIS[pg] ? "on" : "off"];
  });
  // two short records per line (keeps the generated file within the max-lines rule; the array is the same)
  const V = [];
  for (let i = 0; i < Vrec.length; i += 2) V.push(row(Vrec.slice(i, i + 2).flat()));
  return [
    "/* admin-measurements.js — GENERATED by tools/tech-sheets.mjs (owner decision 223). Do not edit by hand.",
    " * Back office only: admin.html tab \"ผลการวัด\" (after sign-in), loaded when the tab opens. Every original accuracy",
    ` * figure, legend and status reason from ${SNAPSHOT}, verbatim, plus docs/accuracy-figures.json. */`,
    "(function () {",
    "  \"use strict\";",
    "  // entries: file, key, product, th, en, zh, text (7 per record)",
    "  var E = [", ...E, "  ];",
    "  // catData: key, product, src, ref, th, en, zh (7 per record)",
    "  var C = [", ...C, "  ];",
    "  // figures: key, value, raw, md (evidence in ACCURACY.md), what (5 per record)",
    "  var F = [", ...F, "  ];",
    "  // products: id, th, en, zh, TH sheet, EN sheet, figure keys (7 per record)",
    "  var P = [", ...P, "  ];",
    "  // former page texts rendered from docs/accuracy-figures.json: key, product, th, en, zh (5 per record)",
    "  var T = [", ...T, "  ];",
    "  // page status at base: page, st, why, claims (4 per record)",
    "  var S = [", ...S, "  ];",
    "  // decision 226: status label (back office only) and customer visibility: page, th, en, zh, on|off (5 per record)",
    "  var V = [", ...V, "  ];",
    "  /** @param {any[]} a @param {string[]} names */",
    "  function rows(a, names) {",
    "    var out = [];",
    "    for (var i = 0; i < a.length; i += names.length) { var o = /** @type {Record<string, any>} */ ({}); for (var j = 0; j < names.length; j++) o[names[j]] = a[i + j]; out.push(o); }",
    "    return out;",
    "  }",
    "  var figures = /** @type {Record<string, any>} */ ({});",
    "  rows(F, [\"key\", \"value\", \"raw\", \"md\", \"what\"]).forEach(function (f) { figures[f.key] = { value: f.value, raw: f.raw, md: f.md, what: f.what }; });",
    "  /** @type {any} */ (window).LQ_MEASUREMENTS = {",
    "    entries: rows(E, [\"file\", \"key\", \"product\", \"th\", \"en\", \"zh\", \"text\"]),",
    "    catData: rows(C, [\"key\", \"product\", \"src\", \"ref\", \"th\", \"en\", \"zh\"]),",
    "    figures: figures,",
    "    products: rows(P, [\"id\", \"th\", \"en\", \"zh\", \"sheetTH\", \"sheetEN\", \"figures\"]).map(function (p) { p.figures = p.figures ? p.figures.split(\";\") : []; return p; }),",
    "    texts: rows(T, [\"key\", \"product\", \"th\", \"en\", \"zh\"]),",
    "    pageStatus: rows(S, [\"page\", \"st\", \"why\", \"claims\"]),",
    "    visibility: rows(V, [\"page\", \"th\", \"en\", \"zh\", \"shown\"]),",
    "    render: render",
    "  };",
    ...RENDER,
    "})();",
    ""
  ].join("\n");
}

/** every output file -> content */
export function build(root = ROOT) {
  const m = model(root), out = new Map();
  for (const p of m.products) for (const L of ["TH", "EN"]) out.set(`${DIR}/${p.id}-${L}.md`, sheet(m, p, L));
  out.set(`${DIR}/README.md`, readme(m));
  out.set(ADMIN_DATA, adminData(m));
  return { files: out, model: m };
}

/** stale or missing outputs (empty = in sync) */
export function stale(root = ROOT) {
  const bad = [];
  for (const [rel, s] of build(root).files) {
    if (!existsSync(join(root, rel))) bad.push(`${rel}: missing`);
    else if (read(root, rel) !== s) bad.push(`${rel}: stale`);
  }
  return bad;
}

export function write(root = ROOT) {
  const changed = [];
  for (const [rel, s] of build(root).files) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    if (!existsSync(join(root, rel)) || read(root, rel) !== s) { writeFileSync(join(root, rel), s); changed.push(rel); }
  }
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const bad = stale();
    if (bad.length) { console.error(bad.map(b => "  ✗ " + b).join("\n") + "\nrun: node tools/tech-sheets.mjs"); process.exit(1); }
    console.log("technical sheets and admin-measurements.js are current");
  } else {
    const ch = write();
    console.log(ch.length ? "updated:\n  " + ch.join("\n  ") : "nothing to update");
  }
}
