/* tools/cat-data.cjs — round 16 item 1 (S1): the single source for the 7 work categories, the proposed status of every
 * page (demo / experimental / pilot-ready) and the accuracy lines shown on the category landing pages.
 *
 *   node tools/cat-pages.mjs           writes cat-<slug>.html, i18n/en-cat.js, i18n/zh-cat.js and the table in docs/PAGE-STATUS.md
 *   node tools/cat-pages.mjs --check   exit 1 when any of them is out of date (tests/unit/cat-pages.test.js runs the same check)
 *
 * Categories and their pages follow CLAUDE.md ("Categories"). A page may sit in two categories (booth). Accuracy lines
 * come from docs/ACCURACY-CLAIMS.md (register rows, `acr`) or, for pages outside its register, from ACCURACY.md and the
 * other source documents (quoted fragments, `ev`); tests/unit/cat-pages.test.js ties both. Every line carries a source
 * label — synthetic, public dataset, field — or says "not measured" / "no accuracy claim". No field figure exists for
 * any page yet (2026-11-08). Directory, notice, information, legal and account pages get "support" (not a product, not
 * counted with the products; reviewer round 2026-11-09). The statuses are a PROPOSAL: the owner approves
 * docs/PAGE-STATUS.md before the pages are published.
 *
 * Owner decision 223 (2026-11-21): customer pages show no accuracy lines, status legend, source chips or reasons. The
 * cards now carry only BADGE (none / รุ่นทดลอง / รุ่นทดลอง ยังไม่เปิดขาย / เร็ว ๆ นี้, badgeOf) and the two approved LINES;
 * STATUS, STATUS_DEF, SOURCE, CLAIMS and REASONS stay as internal data for docs/PAGE-STATUS.md and the tests that read
 * them. DEMO_ONLY pages are listed in demo mode only and not counted. */
"use strict";

/** Status labels. Order = strongest first. */
const STATUS = {
  "pilot-ready": { th: "พร้อมนำร่อง", en: "Pilot-ready", zh: "可试点" },
  experimental: { th: "ทดลอง", en: "Experimental", zh: "实验性" },
  demo: { th: "สาธิต", en: "Demo", zh: "演示" },
  // not a readiness status: directory, notice, information, legal and account pages are not products (reviewer round)
  support: { th: "หน้าประกอบ", en: "Support page", zh: "辅助页面" }
};
const STATUS_DEF = {
  "pilot-ready": {
    th:
      "พร้อมทดสอบนำร่องที่หน้างานหนึ่งแห่งภายใต้การดูแล: ขั้นตอนครบ คนตัดสินใจทุกครั้ง มีป้ายแจ้งและค่าเริ่มต้นด้านความเป็นส่วนตัว และมีวิธีวัดความแม่นยำหน้างาน ยังไม่ผ่านการทดสอบภาคสนาม",
    en:
      "Ready for one supervised field pilot: the workflow is complete, a person makes every decision, privacy defaults and notices exist, and there is a way to measure accuracy on site. Not proven in the field yet.",
    zh: "可在一个现场进行有人监督的试点：流程完整，每个决定都由人作出，有隐私默认设置与告示，并有现场测量准确率的方法。尚未经过实地验证。"
  },
  experimental: {
    th: "ใช้งานได้ครบขั้นตอน แต่ความแม่นยำยังไม่ได้วัด เป็นตัวเลขเบื้องต้น หรือมีข้อจำกัดที่รู้แล้ว หรือยังรอสิ่งที่ต้องมีก่อน (ระบบหลังบ้าน สัญญาอนุญาต ทนาย)",
    en: "Works end to end, but accuracy is not measured, is preliminary or has a known gap, or it still waits for something (backend, licence, lawyer).",
    zh: "流程可用，但准确率尚未测量、仍属初步或存在已知不足，或仍在等待前置条件（后端、许可、律师）。"
  },
  demo: {
    th: "แสดงแนวคิดด้วยข้อมูลตัวอย่าง โมเดลสัญญาอนุญาตเพื่อการวิจัย (ปิดในเวอร์ชันลูกค้า) หรือเพื่อความบันเทิง ไม่ใช้ตัดสินเรื่องคน เงิน หรือสิทธิ์เข้าออก",
    en:
      "Shows the idea with sample data, research-licence models (off in customer builds) or for entertainment. Not for decisions about people, money or access.",
    zh: "以示例数据、研究许可模型（客户版关闭）或娱乐形式展示概念。不用于涉及人员、金钱或出入权限的决定。"
  },
  support: {
    th: "ไม่ใช่ผลิตภัณฑ์ (สารบบ ป้ายแจ้ง ข้อมูล กฎหมาย หรือบัญชี) จึงไม่ให้สถานะความพร้อม และไม่นับรวมกับผลิตภัณฑ์",
    en: "Not a product (directory, notice, information, legal or account page), so it gets no readiness status and is not counted with the products.",
    zh: "不是产品（目录、告示、信息、法律或账户页面），因此不给就绪状态，也不与产品一起计数。"
  }
};
/** A category's own wording for a status definition (key cat.std.<status>.<slug>). Owner order 2026-11-15 item 2: the
 *  fortune landing page never says "for entertainment"; the other categories keep the shared definition. */
const STATUS_DEF_CAT = {
  fortune: {
    demo: {
      th: "แสดงแนวคิดด้วยข้อมูลตัวอย่าง หรือเป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ ไม่ใช้ตัดสินเรื่องคน เงิน หรือสิทธิ์เข้าออก",
      en: "Shows the idea with sample data, or is based on astrological principles, which are a matter of personal belief. " +
        "Please use your own judgement. Not for decisions about people, money or access.",
      zh: "以示例数据展示概念，或基于命理学原则，属个人信仰，请自行判断。不用于涉及人员、金钱或出入权限的决定。"
    }
  }
};

/** Source labels for accuracy lines (CLAUDE.md: synthetic / public dataset / field). */
const SOURCE = {
  synthetic: { th: "ข้อมูลสังเคราะห์", en: "Synthetic", zh: "合成数据" },
  public: { th: "ชุดข้อมูลสาธารณะ", en: "Public dataset", zh: "公开数据集" },
  prelim: { th: "ชุดข้อมูลสาธารณะ · เบื้องต้น", en: "Public dataset · preliminary", zh: "公开数据集 · 初步" },
  field: { th: "ภาคสนาม", en: "Field", zh: "实地" },
  none: { th: "ยังไม่ได้วัด", en: "Not measured", zh: "尚未测量" },
  na: { th: "ไม่มีตัวเลขความแม่นยำ", en: "No accuracy claim", zh: "无准确率声明" }
};

/** Accuracy lines (S3 format: value · n = … · source label as the chip). `src` = SOURCE key; `ref` = where the number
 *  comes from (shown in docs/PAGE-STATUS.md). Each measured line is tied to its evidence, checked by
 *  tests/unit/cat-pages.test.js: `acr` = row ids of the register in docs/ACCURACY-CLAIMS.md §4, or `ev` = { doc, quote }
 *  fragments that must still be in that document. Every percentage and every `n = …` in the English line must be a
 *  number of those rows / fragments. `optimistic` = measured on a tuning set or on the model's training data. */
const CLAIMS = {
  gateSyn: { src: "synthetic", ref: "docs/ACCURACY-CLAIMS.md §5 (docs/GATE.md §3b, round 15, held-out seed 7)",
    ev: { doc: "docs/ACCURACY-CLAIMS.md", quote: ["| plate found (top box), held-out seed | 97.1% (136 / 140) | n = 140 scenes (20 per category) |",
      "| exact read from one frame, held-out seed | 58% (81 / 140) | n = 140 scenes |"] },
    th: "หาป้ายเจอ (กรอบแรก) 97.1% (136/140) · n = 140 ฉากชุดทดสอบแยก 7 แบบป้าย (ชุดเดโม seed 7) อ่านถูกทั้งป้ายจากภาพเดียว 58% (81/140) ก่อนโหวตหลายเฟรมและก่อนเจ้าหน้าที่ยืนยัน",
    en:
      "Plate found (top box) in 97.1% (136/140) · n = 140 held-out scenes, 7 plate types (demo set, seed 7); whole plate read right from one frame in 58% (81/140), before multi-frame voting and the guard's check",
    zh: "找到车牌（首个候选框）97.1%（136/140）· n = 140 个留出场景，7 类车牌（演示集 seed 7）；单帧整牌读对 58%（81/140），尚未计入多帧投票与保安确认" },
  gatePub: { src: "public", ref: "docs/ACCURACY-CLAIMS.md §5 round 16 (docs/GATE.md §3c, 51 real photos, plate check, labels v3 2026-11-12)", optimistic: true,
    ev: { doc: "docs/ACCURACY-CLAIMS.md", quote: [
      "| plate is the top box on real photos | 44% (14 / 32) | n = 32 photos with a plate | public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12 |",
      "| whole plate read right automatically on real photos | 32% (7 / 22); 27% (7 / 26) counting the 4 unsure-letter photos as misses | n = 22 photos (12 of them dev / tuning, optimistic) |",
      "| photos without a plate read automatically | 0 / 19 (before the check 3 / 19); held-out 0 / 8 (before 1 / 8); 95% interval 0–17% | n = 19 photos (11 of them dev / tuning) |"] },
    th: "ภาพถ่ายจริงสาธารณะ (Wikimedia Commons, ป้ายกำกับ v3 ที่เจ้าของยืนยัน 2026-11-12): กรอบแรกเป็นป้าย 44% (14/32) · n = 32 ภาพที่มีป้าย อ่านถูกทั้งป้ายอัตโนมัติ 32% (7/22) · n = 22 ภาพ " +
      "(บางส่วนใช้ปรับค่า ดีเกินจริง) ภาพไม่มีป้ายถูกอ่านอัตโนมัติ 0/19 · n = 19 ภาพ ด่านหรือลานจอดจริงยังไม่ได้วัด",
    en: "Real public photos (Wikimedia Commons, labels v3 confirmed by the owner 2026-11-12): top box on the plate in 44% (14/32) · n = 32 photos with a plate; whole plate read right " +
      "automatically in 32% (7/22) · n = 22 photos (partly the tuning set, optimistic); photos without a plate read automatically 0/19 · n = 19. " +
      "A real gate or car park: not measured yet",
    zh: "真实公开照片（Wikimedia Commons，标注 v3 已由业主于 2026-11-12 确认）：首个候选框为车牌 44%（14/32）· n = 32 张有车牌的照片；自动整牌读对 32%（7/22）· n = 22 张" +
      "（部分为调参集，偏乐观）；无车牌照片被自动读取 0/19 · n = 19。实际道闸或停车场：尚未测量" },
  examNone: { src: "none", ref: "docs/EXAM.md (Accuracy — not measured yet)", acr: ["E1"],
    th: "สัญญาณถูกหรือผิดในห้องสอบจริง: ยังไม่ได้วัด การนำร่องจะเทียบแต่ละสัญญาณกับบันทึกของผู้คุมสอบ ระบบไม่ตัดสินการทุจริต",
    en: "Signals right or wrong in a real exam room: not measured. The pilot compares each signal with the invigilator's tally. The system never decides cheating",
    zh: "真实考场中信号的对错：尚未测量。试点将把每种信号与监考员的记录比对。系统从不判定作弊" },
  examHall: { src: "public", ref: "docs/exam/FACE-ENGINE-RESULTS.md §7.1 (Open Images V7 group photos, held-out half; not exam-room footage)",
    ev: { doc: "docs/exam/FACE-ENGINE-RESULTS.md", quote: ["**0 / 195 = 0.0 % [0.0 % – 1.9 %]**", "**122 / 195 = 62.6 % [55.6 % – 69.1 %]**"] },
    th: "ใบหน้าเล็กในภาพมุมกว้างของห้องสอบ (กว้าง 24–48 px): พบ 0% (0/195) · n = 195 ใบหน้า ภาพหมู่จาก Open Images V7 ครึ่งที่ไม่ได้ใช้เลือกค่า ไม่ใช่ภาพห้องสอบจริง " +
      "ตัวเลือกที่ดีที่สุดที่วัดได้พบ 62.6% (122/195) แต่มีกรอบผิดมากและช้าเกินไปบนแล็ปท็อประดับกลางจำลอง จึงยังไม่เปิดใช้",
    en: "Small faces in a wide exam-room view (24–48 px wide): 0% found (0/195) · n = 195 faces, Open Images V7 group photos, held-out half, not exam-room footage; the best option " +
      "measured found 62.6% (122/195) but drew too many false boxes and was too slow on an emulated mid-range laptop, so it is not switched on",
    zh: "考场广角画面中的小脸（宽 24–48 px）：找到 0%（0/195）· n = 195 张脸，Open Images V7 合影，未用于选择参数的一半，非真实考场画面；已测得的最佳方案找到 62.6%（122/195），但错误框过多，且在模拟的中端笔记本上过慢，因此未启用" },
  omrNone: { src: "none", ref: "tests/unit/omr.test.js (synthetic sheets, pass/fail only)",
    th: "ยังไม่ได้วัดกับกระดาษคำตอบที่สแกนจริง มีเพียงชุดทดสอบอัตโนมัติด้วยภาพสังเคราะห์ ครูตรวจแผ่นที่ระบบทำเครื่องหมายไว้",
    en: "Not measured on real scanned sheets; only automated tests on synthetic sheets. The teacher reviews flagged sheets",
    zh: "尚未用真实扫描答题卡测量；仅有使用合成答题卡的自动化测试。教师复核被标记的答题卡" },
  face: { src: "public", ref: "docs/ACCURACY-CLAIMS.md A2, A1, A3 (ACCURACY.md §2)", acr: ["A2", "A1", "A3"], optimistic: true,
    th:
      "จดจำสมาชิกได้ 66–76% บนใบหน้าเอเชีย (CASIA ลงทะเบียน 5–200 คน · n = 500 คน ชุดทดสอบแยก) และ 85% บน LFW (ลงทะเบียน 100 คน · n = 610 ภาพทดสอบ ชุดที่ใช้ปรับค่า ดีเกินจริง) คนแปลกหน้าถูกเสนอชื่อ 0.2% (CASIA 100 คน · n = ประมาณ 12,000 ครั้ง) คนยืนยันเมื่อไม่แน่ใจ",
    en:
      "Members recognised in 66–76% on Asian faces (CASIA, 5–200 enrolled · n = 500 people, held out) and 85% on LFW (100 enrolled · n = 610 probe photos, tuning set, optimistic); a stranger is offered a name in 0.2% (CASIA, 100 enrolled · n = about 12,000 visits). A person confirms when unsure",
    zh:
      "亚洲人脸会员识别率 66–76%（CASIA，登记 5–200 人 · n = 500 人，留出集），LFW 为 85%（登记 100 人 · n = 610 张测试照片，调参集，偏乐观）；陌生人被提示姓名 0.2%（CASIA，100 人 · n = 约 12,000 次）。不确定时由人确认" },
  attPin: { src: "na", ref: "docs/ATTENDANCE-READINESS.md",
    th: "PIN และ QR (ค่าเริ่มต้น) ไม่ใช้กล้องตัดสิน จึงไม่มีตัวเลขความแม่นยำ",
    en: "PIN and QR (the default) do not use the camera to decide, so no accuracy figure applies",
    zh: "PIN 与二维码（默认）不靠摄像头判定，因此不适用准确率" },
  store: { src: "public", ref: "docs/ACCURACY-CLAIMS.md S3, S2, S4 (ACCURACY.md §1)", acr: ["S3", "S2", "S4"],
    th:
      "นับคนข้ามเส้น รวมวิดีโอสาธารณะ 5 คลิป (ส่วนใหญ่เป็นถนนและสถานี ไม่ใช่ประตูร้าน): คลาดสุทธิ −0.4% ถูกต้องต่อเหตุการณ์ 79% · n = 273 ครั้งที่ 5 fps รายคลิปที่คนแน่น −28% ถึง +19% (n = 139 ครั้ง) ประตูร้านจริงยังไม่ได้วัด",
    en:
      "Line-crossing count, 5 public videos pooled (mostly street and station scenes, not a shop door): net error −0.4%, event precision 79% · n = 273 crossings at 5 fps; per crowded sequence −28% to +19% (n = 139 crossings). A real shop door: not measured yet",
    zh: "越线计数，5 段公开视频合计（多为街道与车站场景，并非店门）：净误差 −0.4%，事件精确率 79% · n = 273 次通过（5 fps）；拥挤片段逐段 −28% 至 +19%（n = 139 次）。真实店门：尚未测量" },
  crowd: { src: "prelim", ref: "docs/ACCURACY-CLAIMS.md C2, C3, C4, C5 (docs/CROWD-ACCURACY.md, round 15, AI reference)", acr: ["C2", "C3", "C4", "C5"],
    th:
      "ทั้งภาพ นับขาด: 26% เมื่อมี 15–22 คน (n = 12 เฟรม) 58% เมื่อมี 30–50 คนซึ่งหลายคนอยู่ไกล (n = 20) 37–59% สำหรับคนตัวเล็กหรืออยู่ไกล (n = 29, 2 คลิป) โซนใกล้ของหนึ่งคลิปคลาด 1.2 คน (31%, n = 20) ค่าอ้างอิงนับโดย AI ยังไม่ใช่คนนับ",
    en:
      "Whole frame, undercount: 26% with 15–22 people (n = 12 frames), 58% with 30–50 people, many far (n = 20), 37–59% for small or far people (n = 29, 2 clips); near zone of one clip off by 1.2 people (31%, n = 20). The reference was counted by an AI, not yet by people",
    zh:
      "整帧计数偏少：15–22 人时 26%（n = 12 帧），30–50 人且多人在远处时 58%（n = 20），小或远的人 37–59%（n = 29，2 段片段）；其中一段近区误差 1.2 人（31%，n = 20）。参考值由 AI 计数，尚未由人工计数" },
  crowdDense: { src: "prelim", ref: "docs/ACCURACY-CLAIMS.md C1 (docs/CROWD-ACCURACY.md dense_shibuya)", acr: ["C1"],
    th: "ยังไม่เหมาะกับฝูงชนหนาแน่น: ฝูงชนราว 300 คน นับได้ 1–2 คน (0–2 ในคลิปไทม์แลปส์) · n = 2 + 7 เฟรม (2 คลิป)",
    en: "Not yet suitable for dense crowds: a crowd of about 300 counts as 1–2 people (0–2 on the time-lapse) · n = 2 + 7 frames (2 clips)",
    zh: "尚不适用于密集人群：约 300 人的人群只计到 1–2 人（延时片段 0–2 人）· n = 2 + 7 帧（2 段片段）" },
  zone: { src: "none", ref: "ACCURACY.md §9 / docs/CTO-BRIEF.md (zone quick wins)",
    th: "ยังไม่ได้วัดสำหรับงานนี้ ใช้ตัวตรวจจับตัวเดียวกับหน้าวิเคราะห์หน้าร้าน",
    en: "Not measured for this task; it uses the same detector as the store page",
    zh: "尚未针对此用途测量；使用与门店分析相同的检测器" },
  insights: { src: "na", ref: "insights.html (aggregates other tools)",
    th: "แสดงผลรวมจากระบบอื่น ไม่มีการวัดของตัวเอง ความแม่นยำตามระบบต้นทาง",
    en: "Shows totals from the other tools; no measurement of its own, so accuracy is that of the source tools",
    zh: "汇总其他系统的数据，本身不做测量；准确率取决于来源系统" },
  boothNone: { src: "none", ref: "ACCURACY.md §9",
    th: "การนับผู้เข้าชมบูธยังไม่ได้วัด (ยังไม่มีวิดีโอที่มีค่าอ้างอิง)",
    en: "Booth visitor counting is not measured (no video with a reference count yet)",
    zh: "展位访客计数尚未测量（尚无带参考计数的视频）" },
  boothFace: { src: "public", ref: "ACCURACY.md §2 (boothTar, LFW View-1 pairs)",
    ev: { doc: "ACCURACY.md", quote: ["| **0.50** | **customers, booth** | **72.6% [69.7–75.3%]** |", "2,200 pairs (1,100 same person"] },
    th: "ตัวเลือกจดจำผู้กลับมาเยือน: ยอมรับคนเดิมถูก 73% (เทียบ 1:1 ที่เกณฑ์ 0.50) · n = 1,100 คู่ภาพคนเดียวกัน (LFW)",
    en: "Returning-visitor option: the same person is accepted in 73% (1:1 at threshold 0.50) · n = 1,100 same-person pairs (LFW)",
    zh: "回访识别选项：同一人通过率 73%（1:1，阈值 0.50）· n = 1,100 对同一人照片（LFW）" },
  ageGender: { src: "public", ref: "ACCURACY.md §3 (agMae, agGender; UTKFace 2,000, optimistic)", optimistic: true,
    ev: { doc: "ACCURACY.md", quote: ["| all | 2000 | 78.9% | 5.0 y | 78.6% | 96.0% (97% decided) |", "| Asian | 319 | 72.4% | 4.9 y | 81.4% | 92.2% |",
      "part of this subset was in its training data"] },
    th:
      "อายุคลาดเฉลี่ย 5.0 ปี เพศถูก 96% เมื่อระบบตัดสิน (ใบหน้าเอเชีย 92%) · n = 2,000 ใบหน้า เอเชีย 319 (UTKFace) ดีเกินจริง: โมเดลเคยฝึกด้วยชุดนี้บางส่วน และหาใบหน้าไม่เจอราว 1 ใน 5 โมเดลสัญญาอนุญาตเพื่อการวิจัย ปิดในเวอร์ชันลูกค้า",
    en:
      "Age off by 5.0 years on average, gender right in 96% when decided (Asian faces 92%) · n = 2,000 faces, Asian 319 (UTKFace). Optimistic: the model was partly trained on this set, and about 1 in 5 faces is not found. Research-licence model, off in customer builds",
    zh: "年龄平均误差 5.0 岁，判定时性别正确率 96%（亚洲人脸 92%）· n = 2,000 张人脸，亚洲 319 张（UTKFace）。偏乐观：模型部分用此数据集训练，且约 1/5 的人脸未被检出。研究许可模型，客户版关闭" },
  hand: { src: "public", ref: "ACCURACY.md §4 (HaGRID, 720 images)",
    ev: { doc: "ACCURACY.md", quote: ["| IoU ≥ 0.3 | 84.7% / 98.8% | 88.2% / 98.6% |", "720 images, 40 per gesture × 18 gestures"] },
    th: "คีออสก์ไร้สัมผัส: พบมือที่ยก 88% ถูกต้อง 99% · n = 720 ภาพ (HaGRID)",
    en: "Touch-free kiosk: raised hands found in 88%, precision 99% · n = 720 images (HaGRID)",
    zh: "免触控信息亭：举手检出率 88%，精确率 99% · n = 720 张图（HaGRID）" },
  neuro: { src: "public", ref: "ACCURACY.md §6 (neuroLo, FER-2013 PrivateTest)",
    ev: { doc: "ACCURACY.md", quote: ["| page pipeline (face found 49%) | 346 | 52.0% |", "100 faces per class (700 in total)"] },
    th: "จำแนกสีหน้าถูก 52% (7 กลุ่ม) · n = 346 ใบหน้าที่พบจาก 700 (FER-2013) ใช้สาธิตเท่านั้น โมเดลสัญญาอนุญาตเพื่อการวิจัย ปิดในเวอร์ชันลูกค้า",
    en: "Expression classes right in 52% (7 classes) · n = 346 faces found of 700 (FER-2013). Demo only: research-licence model, off in customer builds",
    zh: "表情类别正确率 52%（7 类）· n = 346 张检出人脸（共 700 张，FER-2013）。仅供演示：研究许可模型，客户版关闭" },
  creative: { src: "public", ref: "ACCURACY.md §10 (MIT1003, 703 held-out images)",
    ev: { doc: "ACCURACY.md", quote: ["| **shipped (creative.html)** | **0.831** | **0.814** | **1.591** | **0.470** |", "**703 held-out images**"] },
    th: "แผนที่ความสนใจ NSS 1.59 · n = 703 ภาพทดสอบแยก (MIT1003) เป็นการคาดการณ์ ไม่ใช่การวัดสายตาจริง",
    en: "Attention map NSS 1.59 · n = 703 held-out images (MIT1003). A prediction, not real eye tracking",
    zh: "注意力图 NSS 1.59 · n = 703 张留出图（MIT1003）。这是预测，不是真实眼动测量" },
  checkout: { src: "synthetic", ref: "ACCURACY.md §8 (bcWrong)",
    ev: { doc: "ACCURACY.md", quote: ["Each symbology gets 60 codes per condition", "1.69% with 1 read and 0.06% with 2"] },
    th: "บาร์โค้ด: ใส่รหัสผิด 0.06% เมื่อต้องอ่านตรงกัน 2 ครั้ง · n = 60 รหัสต่อชนิด (3 ชนิด) ต่อสภาพ การจำสินค้าที่ไม่มีบาร์โค้ดยังไม่ได้วัด",
    en: "Barcodes: a wrong code is added in 0.06% with 2 agreeing reads · n = 60 codes per code type (3 types) per condition. Product recognition without a barcode: not measured",
    zh: "条码：要求 2 次一致读取时误加 0.06% · n = 60 个/种条码（3 种）/每种条件。无条码商品识别：尚未测量" },
  qc: { src: "synthetic", ref: "ACCURACY.md §7 (qcLight, qcLift)",
    ev: { doc: "ACCURACY.md", quote: ["(30 good + 10 per defect;", "Now ±10%, ±20%, +25% / −30% brightness and ±10% contrast give 0% false rejects", "(about 80% caught)"] },
    th: "ขวดสังเคราะห์: ไม่ปัดตกขวดดีเมื่อแสงเปลี่ยน 20% หลังปรับเทียบ จับฝายก 6 px ได้ 80% · n = 30 ขวดดี + 10 ต่อชนิดตำหนิ ต่อสภาพ ยังไม่ได้วัดกับขวดจริง",
    en:
      "Synthetic bottles: no good bottle rejected with a 20% light change after calibration; a 6 px cap lift caught in 80% · n = 30 good + 10 per defect per condition. Not measured on real bottles",
    zh: "合成瓶子：校准后光线变化 20% 时无良品被拒；6 px 瓶盖翘起检出 80% · n = 30 个良品 + 10 个/缺陷/条件。尚未用真实瓶子测量" },
  driverPub: { src: "public", ref: "ACCURACY.md §5 (drFrameCatch, CEW held out)",
    ev: { doc: "ACCURACY.md", quote: ["| **CEW (real photos, held out)** | 101 / 682 | 25.7% → **84.4%** |", "1,192 closed and 1,231 open"] },
    th: "ตาปิดถูกจับได้ 84% ของเฟรม · n = 101 คน ภาพตาปิด 1,192 ภาพ (CEW ชุดทดสอบแยก) เป็นตัวช่วยเตือน ไม่ใช่อุปกรณ์ความปลอดภัย",
    en: "Closed-eye frames caught in 84% · n = 101 people, 1,192 closed-eye photos (CEW, held out). An awareness aid, not a safety device",
    zh: "闭眼帧检出 84% · n = 101 人，1,192 张闭眼照片（CEW 留出集）。仅为提醒辅助，不是安全设备" },
  driverSyn: { src: "synthetic", ref: "ACCURACY.md §5 (drFaPerHour, simulated drives)",
    ev: { doc: "ACCURACY.md", quote: ["(7.4 → about 1.4 per hour)", "643 pairs, seeded"] },
    th: "การขับจำลอง: เตือนผิด 1.4 ครั้งต่อชั่วโมงเมื่อสภาพต่างจากตอนปรับเทียบ · n = 643 การขับจำลอง ครั้งละ 10 นาที",
    en: "Simulated drives: 1.4 false alarms per hour when the drive differs from calibration · n = 643 simulated drives of 10 minutes",
    zh: "模拟驾驶：与校准条件不同时每小时误报 1.4 次 · n = 643 次 10 分钟模拟驾驶" },
  med: { src: "none", ref: "docs/MEDICINE.md, docs/FIELD-PILOT.md §2.2",
    th: "มีแผนนำร่องกับกล่องยาจริง 100 กล่อง เภสัชกรยืนยันทุกครั้ง",
    en: "A pilot plan for 100 real boxes exists. A pharmacist confirms every result",
    zh: "已有 100 个真实药盒的试点计划。每次结果均由药剂师确认" },
  nut: { src: "none", ref: "docs/nutrition/NUTRITION-ACCURACY.md (synthetic labels only; real label photos not measured yet)",
    th: "ยังไม่ได้วัดกับภาพฉลากจริง ผลทดสอบมีเฉพาะกับฉลากที่สร้างขึ้นเอง ค่าทุกค่าแสดงพร้อมบรรทัดที่มาให้ผู้ใช้ตรวจกับฉลาก",
    en: "Not measured on photos of real labels yet; tested on generated labels only. Every value is shown with its source line for the user to check",
    zh: "尚未用真实标签照片测量，仅用生成的标签测试。每个数值都附来源行，供用户与标签核对" },
  tryon: { src: "none", ref: "docs/TRYON-DESIGN.md §4 (real-camera measurement not done; garment fit tested on a synthetic set only)",
    th: "ยังไม่ได้วัดกับภาพกล้องจริง การวางแว่น หมวก ต่างหู และเสื้อทดสอบกับข้อมูลสังเคราะห์เท่านั้น เป็นภาพจำลอง ไม่ใช่ภาพสวมใส่จริง",
    en: "Not measured on real camera pictures; placing glasses, hats, earrings and tops is tested on synthetic data only. A preview, not a real fit",
    zh: "尚未用真实摄像头画面测量；眼镜、帽子、耳环和上衣的放置仅用合成数据测试。仅为模拟预览，不代表真实穿着效果" },
  studio: { src: "public", ref: "ACCURACY.md §11 (35 held-out people, AI-rated)",
    ev: { doc: "ACCURACY.md", quote: ["| no-outfit version (new background + retouch) with a defect | 22.9 % [11.4–39.0] (8/35) |"] },
    th:
      "แบบไม่เปลี่ยนชุด (เปลี่ยนฉากและรีทัช): มีจุดบกพร่องที่เห็นได้ 23% (8/35) · n = 35 คน ชุดทดสอบแยก (ภาพบุคคลสาธารณะ ผู้ประเมินคือ AI) แบบเปลี่ยนชุดบกพร่องมากกว่าจึงปิดไว้เป็นค่าเริ่มต้น",
    en:
      "Without an outfit (new background and retouch): a visible defect in 23% (8/35) · n = 35 held-out people (public portraits, AI-rated). Outfit renders have more defects, so outfits are off by default",
    zh: "不换装（换背景并修图）：23% 有可见瑕疵（8/35）· n = 35 名留出人员（公开肖像，AI 评分）。换装瑕疵更多，因此默认关闭" },
  photobooth: { src: "public", ref: "ACCURACY.md §11b / round 12 (124/124 drawn outfits defective)",
    ev: { doc: "ACCURACY.md", quote: ["(124/124 drawn outfits were defective"] },
    th: "ชุดจำลองบนรูปติดบัตรบกพร่อง 124/124 ภาพ · n = 124 ภาพ (ภาพบุคคลสาธารณะ ผู้ประเมินคือ AI) จึงปิดไว้เป็นค่าเริ่มต้น กรอบและสติ๊กเกอร์ไม่มีตัวเลขความแม่นยำ",
    en:
      "Drawn outfits on ID photos were defective in 124/124 renders · n = 124 renders (public portraits, AI-rated), so they are off by default; frames and stickers carry no accuracy claim",
    zh: "证件照上的绘制服装 124/124 张有瑕疵 · n = 124 张（公开肖像，AI 评分），因此默认关闭；相框与贴纸无准确率声明" },
  converter: { src: "none", ref: "—",
    th: "ยังไม่ได้วัดคุณภาพการแปลงกับเอกสารจริง ไฟล์ไม่ถูกอัปโหลด",
    en: "Conversion quality is not measured on real documents; files are not uploaded",
    zh: "尚未用真实文档测量转换质量；文件不会上传" },
  // owner decision 2026-11-18: fortune cards carry no accuracy field, so the fortune accuracy line ("… ไม่มีตัวเลขความแม่นยำ
  // คำทำนายผ่านตัวกรองหัวข้อต้องห้าม") is gone; the disclaimer is shown once near the top of cat-fortune.html (fortune.disc.line)
  hrPilot: { src: "none", ref: "docs/ACCURACY-CLAIMS.md H1 (docs/PILOT-PLAN.md §3.4)", acr: ["H1"],
    th: "ความเห็นตรงกันของผู้สัมภาษณ์และเวลาจนได้สรุป: ยังไม่ได้วัด การนำร่องจะวัด",
    en: "Interviewer agreement and time to summary: not measured; the pilot measures them",
    zh: "面试官一致度与出结论所需时间：尚未测量，由试点测量" },
  people: { src: "na", ref: "interview.js / lensiq-case.js",
    th: "คนเป็นผู้ให้คะแนนและบันทึก ระบบไม่ตัดสินคน ไม่อ่านอารมณ์ ไม่ตัดสินว่าโกหก",
    en: "People do the scoring and the notes; the system never judges a person, reads no emotion and never judges lying",
    zh: "由人评分与记录；系统从不评判个人，不读取情绪，也不判断说谎" },
  teamface: { src: "na", ref: "teamface.html",
    th: "กิจกรรมเพื่อความบันเทิง ไม่มีตัวเลขความแม่นยำ ไม่ใช้ประเมินพนักงาน",
    en: "An entertainment activity; no accuracy claim, never used to assess staff",
    zh: "娱乐活动；无准确率声明，绝不用于评估员工" },
  info: { src: "na", ref: "—",
    th: "หน้าข้อมูลหรือเอกสาร ไม่มีตัวเลขความแม่นยำของตัวเอง",
    en: "An information or document page; no accuracy figure of its own",
    zh: "信息或文件页面；本身无准确率数据" }
};

/** Why each page gets its status (one line). */
const REASONS = {
  gate: { th: "ขั้นตอนลานจอดและหมู่บ้านครบ เจ้าหน้าที่ยืนยันทุกการอ่าน มีเครื่องมือตรวจหน้างานและแผนนำร่อง แต่การหาป้ายในภาพจริงยังอ่อน",
    en: "Complete car-park and village flow, a guard confirms every read, on-site check and pilot plan exist; finding plates in real photos is still weak",
    zh: "停车场与小区流程完整，每次识别由保安确认，有现场检查与试点计划；在真实照片中找车牌仍较弱" },
  notice: { th: "แม่แบบป้ายแจ้งและประกาศความเป็นส่วนตัวสำหรับการนำร่อง ทนายต้องตรวจก่อนขาย",
    en: "Sign and privacy-notice template for a pilot; a lawyer reviews it before sale",
    zh: "用于试点的告示与隐私声明模板；销售前需律师审阅" },
  directory: { th: "สารบบระบบและการตั้งค่า ไม่ตัดสินใจเอง",
    en: "System directory and settings; it makes no decision itself",
    zh: "系统目录与设置；本身不做决定" },
  zone: { th: "ใช้งานได้ครบ แต่ยังไม่ได้วัดความแม่นยำสำหรับงานนี้",
    en: "Works end to end, but accuracy is not measured for this task",
    zh: "流程可用，但尚未针对此用途测量准确率" },
  exam: {
    th: "หน้าผู้เข้าสอบ เครื่องในห้อง และแดชบอร์ดครบ คนตัดสินทุกสัญญาณ ความแม่นยำยังไม่ได้วัดและการนำร่องคือการวัด " +
      "หน้าผู้เข้าสอบและเครื่องในห้องใช้ MediaPipe Face Landmarker และ COCO-SSD (ทั้งคู่ Apache-2.0) ส่วน YOLOX-Nano (Apache-2.0) ในเครื่องห้องสอบเป็นตัวเลือกที่ปิดไว้เป็นค่าเริ่มต้น โหลด face-api.js เฉพาะเมื่อเปิดเดโมงานวิจัย หน้าแนะนำ Exam และแดชบอร์ดไม่โหลดโมเดลใด ๆ",
    en:
      "Candidate page, room camera and dashboard are complete and a person decides every flag; accuracy is unmeasured and the pilot is the measurement; " +
      "the candidate page and room camera run MediaPipe Face Landmarker and COCO-SSD (both Apache-2.0); the room camera's YOLOX-Nano option (Apache-2.0) is off by default; face-api.js is loaded only in the research demo; the Exam overview page and the dashboard load no model",
    zh: "考生页、考场摄像头与看板齐全，每个信号由人判断；准确率尚未测量，试点即为测量；考生页与考场摄像头使用 MediaPipe Face Landmarker 和 COCO-SSD（均为 Apache-2.0）；考场摄像头的 YOLOX-Nano 选项（Apache-2.0）默认关闭；仅在研究演示中加载 face-api.js；Exam 介绍页与看板不加载任何模型" },
  examHall: { th: "เครื่องกล้องในห้องสอบใช้งานได้ครบ แต่ใบหน้าเล็กในภาพมุมกว้างของห้องสอบยังตรวจได้ไม่ดี จึงเป็นรุ่นทดลองจนกว่าจะแก้ ยังไม่เปิดขาย หน้าผู้เข้าสอบ (ห้องคอมพิวเตอร์) พร้อมนำร่อง",
    en: "The room camera works end to end, but small faces in the wide exam-room view are still poorly detected, so it stays experimental until that is fixed and is not for sale yet; " +
      "the candidate page (computer lab) is pilot-ready",
    zh: "考场摄像头流程可用，但考场广角画面中的小脸仍检测不佳，因此在解决前保持实验性，暂不销售；考生页（机房）可试点" },
  omr: { th: "ใช้งานได้ครบ แต่ยังไม่ได้วัดกับกระดาษคำตอบที่สแกนจริง",
    en: "Works end to end, but it is not measured on real scanned sheets yet",
    zh: "流程可用，但尚未用真实扫描答题卡测量" },
  attendance: { th: "PIN/QR เป็นค่าเริ่มต้น ใบหน้าเป็นทางเลือกเมื่อยินยอม มีตัวเลขจากชุดข้อมูลสาธารณะและเครื่องมือตรวจหน้างาน สัญญาอนุญาตโมเดลใบหน้ายังรอสรุป",
    en: "PIN/QR by default, face optional with consent; public-dataset numbers and an on-site check exist; the face-model licence is still open",
    zh: "默认 PIN/二维码，人脸需同意后可选；有公开数据集数据与现场检查；人脸模型许可仍待确定" },
  people: { th: "คนให้คะแนนและบันทึกเอง ระบบไม่ตัดสินคน จึงไม่มีความเสี่ยงด้านความแม่นยำของกล้อง",
    en: "People score and take notes; the system never decides about a person, so there is no camera-accuracy risk",
    zh: "由人评分与记录；系统从不对人作决定，因此没有摄像头准确率风险" },
  teamface: { th: "กิจกรรมเพื่อความบันเทิงที่ใช้ใบหน้า ไม่ใช้ประเมินพนักงาน",
    en: "An entertainment activity using faces; never used to assess staff",
    zh: "使用人脸的娱乐活动；绝不用于评估员工" },
  crowd: { th: "รุ่นทดลอง สำหรับอีเวนต์ที่มีคนน้อยถึงปานกลางในโซนที่วาด ตัวเลขยังเป็นเบื้องต้น (ค่าอ้างอิงนับโดย AI ยังรอคนนับ) ยังไม่เหมาะกับฝูงชนหนาแน่น",
    en: "Experimental: for events with sparse-to-medium crowds in a drawn zone; the figures are preliminary (AI reference, human count pending); not yet suitable for dense crowds",
    zh: "实验性：用于稀疏至中等人群、在划定区域内的活动；数据仍属初步（AI 参考计数，待人工计数）；尚不适用于密集人群" },
  store: { th: "นับคนผ่านประตูวัดบนชุดข้อมูลสาธารณะแล้ว มีเครื่องมือตรวจหน้างาน ยังไม่มีข้อมูลภาคสนาม",
    en: "Door counting is measured on public datasets and an on-site check exists; no field data yet",
    zh: "门口计数已在公开数据集上测量，并有现场检查；尚无实地数据" },
  insights: { th: "แดชบอร์ดใช้ข้อมูลตัวอย่างหรือจากเครื่องเดียว หลายสาขาต้องรอระบบบัญชีองค์กร (ข้อ 4)",
    en: "The dashboard runs on demo data or one device; multi-branch use waits for organisation accounts (item 4)",
    zh: "看板使用示例数据或单台设备数据；多门店需等待组织账户（第 4 项）" },
  customers: { th: "จดจำใบหน้าเฉพาะผู้ยินยอม ตัวเลขจากชุดข้อมูลสาธารณะ สัญญาอนุญาตโมเดลใบหน้ายังรอสรุป",
    en: "Consent-only face recognition with public-dataset numbers; the face-model licence is still open",
    zh: "仅限同意者的人脸识别，数据来自公开数据集；人脸模型许可仍待确定" },
  research: { th: "ใช้โมเดลสัญญาอนุญาตเพื่อการวิจัย (อายุ/เพศ หรือสีหน้า) ซึ่งปิดในเวอร์ชันลูกค้า",
    en: "Uses research-licence models (age/gender or expression), which are off in customer builds",
    zh: "使用研究许可模型（年龄/性别或表情），客户版中关闭" },
  creative: { th: "วัดบนชุดข้อมูลสาธารณะแล้ว แต่เป็นการคาดการณ์ ยังไม่เทียบกับการทดสอบผู้ชมจริง",
    en: "Measured on a public dataset, but it is a prediction not yet compared with real audience tests",
    zh: "已在公开数据集上测量，但这是预测，尚未与真实受众测试比较" },
  suite: { th: "หน้ารวมชุดผลิตภัณฑ์ สถานะตามเครื่องมือในชุด",
    en: "Product overview page; its status follows the tools it contains",
    zh: "产品总览页；状态取决于其中的工具" },
  checkout: { th: "อ่านบาร์โค้ดวัดด้วยภาพสังเคราะห์เท่านั้น การจำสินค้ายังไม่ได้วัด",
    en: "Barcode reading is measured on synthetic images only; product recognition is not measured",
    zh: "条码读取仅用合成图像测量；商品识别尚未测量" },
  booth: { th: "การนับผู้เข้าชมยังไม่ได้วัด (ค่าเริ่มต้นคือนับอย่างเดียว ไม่เก็บข้อมูลใบหน้า)",
    en: "Visitor counting is not measured (count-only mode is the default, no face data kept)",
    zh: "访客计数尚未测量（默认仅计数，不保存人脸数据）" },
  medicine: { th: "ยังไม่ได้วัด ข้อมูลยาไทยครอบคลุมน้อย และการค้น อย. ต้องใช้ระบบหลังบ้านที่ยังไม่ได้เปิด",
    en: "Not measured; Thai product coverage is low and the Thai FDA lookup needs the backend, which is not deployed",
    zh: "尚未测量；泰国药品覆盖较少，泰国 FDA 查询需要尚未部署的后端" },
  nutrition: { th: "อ่านฉลากบนเครื่องได้ครบขั้นตอน แสดงค่าตามฉลากพร้อมบรรทัดที่มาและให้ผู้ใช้แก้ได้ ยังไม่ได้วัดกับภาพฉลากจริง ยังไม่มีโหมดประมาณจากภาพอาหาร",
    en: "Reads a label on the device end to end, shows values as printed with their source line and lets the user correct them; " +
      "not measured on real label photos; the food-photo mode is not built yet",
    zh: "可在本机完整读取标签，按标签显示数值并附来源行，用户可修改；尚未用真实标签照片测量；食物照片估算模式尚未开发" },
  driver: { th: "ตัวช่วยเตือนตาปิด ไม่ใช่อุปกรณ์ความปลอดภัย ยังไม่ทดสอบกับคนขับที่ง่วงจริง",
    en: "An eyes-closed awareness aid, not a safety device; not tested with really drowsy drivers",
    zh: "闭眼提醒辅助，不是安全设备；尚未在真正困倦的驾驶员身上测试" },
  qc: { th: "วัดด้วยขวดสังเคราะห์เท่านั้น ยังไม่ทดสอบกับสายการผลิตจริง",
    en: "Measured on synthetic bottles only; not tested on a real production line",
    zh: "仅用合成瓶子测量；尚未在真实产线测试" },
  fortune: { th: "เป็นหลักโหราศาสตร์ซึ่งเป็นความเชื่อส่วนบุคคล ใช้ดึงคนเข้าบูธได้",
    en: "Based on astrological principles, a matter of personal belief; can draw visitors to a booth",
    zh: "基于命理学原则，属个人信仰；可吸引访客到展位" },
  tryon: { th: "ลองแว่น หมวก ต่างหู และเสื้อบนภาพกล้องสดบนเครื่อง พร้อมหลังบ้านแคตตาล็อกร้าน ยังไม่ได้วัดกับภาพจริงและยังไม่ได้เปิดระบบหลังบ้าน",
    en: "Try glasses, hats, earrings and tops on the live camera picture on the device, with a shop catalogue back office; not measured on real pictures and the backend is not deployed",
    zh: "在本机实时摄像头画面上试戴眼镜、帽子、耳环和上衣，并配有店铺目录后台；尚未用真实画面测量，后端尚未部署" },
  studio: { th: "แบบไม่เปลี่ยนชุดใช้ได้ แบบเปลี่ยนชุดยังบกพร่องมากจึงปิดเป็นค่าเริ่มต้น",
    en: "The no-outfit version works; outfit renders still have many defects, so they are off by default",
    zh: "不换装版本可用；换装效果仍多瑕疵，因此默认关闭" },
  photobooth: { th: "ตู้ถ่ายรูปสำหรับอีเวนต์ใช้ได้ครบ ชุดจำลองปิดเป็นค่าเริ่มต้น",
    en: "The event photo booth works end to end; drawn outfits are off by default",
    zh: "活动拍照亭流程完整；绘制服装默认关闭" },
  converter: { th: "ใช้งานได้ แต่ยังไม่ได้วัดคุณภาพการแปลงกับเอกสารจริง",
    en: "Works, but conversion quality is not measured on real documents",
    zh: "可用，但尚未用真实文档测量转换质量" },
  content: { th: "หน้าข้อมูล ไม่มีตัวเลขหรือการตัดสินใจของตัวเอง",
    en: "An information page with no figure or decision of its own",
    zh: "信息页面，本身无数据也不做决定" },
  legal: { th: "ร่างข้อความ ทนายต้องตรวจก่อนขาย (PDPA)",
    en: "Draft text; a lawyer reviews it before sale (PDPA)",
    zh: "草稿文本；销售前需律师审阅（PDPA）" },
  scaffold: { th: "โครงระบบสมาชิกและชำระเงินปิดไว้ ระบบหลังบ้านยังไม่เคยเปิดใช้ และ Opn KYC ยังรอ",
    en: "Member and payment scaffold, off by default; the backend has never been deployed and Opn KYC is pending",
    zh: "会员与支付框架默认关闭；后端从未部署，Opn KYC 仍在等待" }
};

/** Owner decision 223 (2026-11-21, 223-2): the short customer badge of each card. None for Attendance PIN/QR (passed its
 *  acceptance sheet) and the support pages; "รุ่นทดลอง ยังไม่เปิดขาย" for Exam hall; "เร็ว ๆ นี้" for the demo-only pages (shown
 *  in demo mode only); "รุ่นทดลอง" for every other tool. The old STATUS / STATUS_DEF / SOURCE / CLAIMS / REASONS above are
 *  kept for docs/PAGE-STATUS.md (internal) and the tests that read them; they are never written to a customer page or to
 *  i18n/*-cat.js (the original wording is in docs/tech-sheets/ORIGINAL-FIGURES-223.json). */
const BADGE = {
  trial: { th: "รุ่นทดลอง", en: "Trial version", zh: "试用版" },
  hall: { th: "รุ่นทดลอง ยังไม่เปิดขาย", en: "Trial version, not on sale yet", zh: "试用版，尚未开售" },
  soon: { th: "เร็ว ๆ นี้", en: "Coming soon", zh: "即将推出" }
};
/** pages listed only in demo mode (window.LENSIQ_PROFILE === "demo"; nav.js hides [data-demo-only] otherwise). The pages
 *  stay and open directly; they are not counted in the category tool counts. */
const DEMO_ONLY = ["signage", "neuro", "teamface", "customers"];
const NO_BADGE = ["attendance", "gate-notice", "cameras"];
/** customer badge key of a page: "" (none) / trial / hall / soon */
function badgeOf(page) {
  if (NO_BADGE.includes(page)) return "";
  if (page === "exam-hall") return "hall";
  if (DEMO_ONLY.includes(page)) return "soon";
  return "trial";
}
/** The two approved lines per product (223-7, audit section 2): line 1 what it is for, line 2 its main limit in everyday
 *  words. Thai here; English and Chinese of the keys ln.<id>.1 / ln.<id>.2 live in i18n/{en,zh}-common.js. `cards` = the
 *  category cards that show them. */
const LINES = {
  crowd: { cards: ["crowd"],
    1: "นับคนและดูความหนาแน่นในโซนที่คุณวาด สำหรับอีเวนต์และพื้นที่จัดงาน ประมวลผลบนเครื่อง ไม่ระบุตัวตน",
    2: "เหมาะกับงานที่มีคนน้อยถึงปานกลาง ยังไม่เหมาะกับฝูงชนหนาแน่น" },
  gate: { cards: ["gate", "parking", "village"],
    1: "อ่านป้ายทะเบียนรถไทยบนเครื่องสำหรับลานจอดและหมู่บ้าน เจ้าหน้าที่ยืนยันทุกคันก่อนเปิดไม้กั้นหรือคิดเงิน",
    2: "ภาพจากกล้องจริงส่วนใหญ่ยังต้องให้เจ้าหน้าที่แตะเลือกป้ายหรือแก้เลข ป้ายเอียง มืด สกปรก หรือป้ายมอเตอร์ไซค์อาจอ่านผิด" },
  exam: { cards: ["exam", "exam-dashboard"],
    1: "บอกผู้คุมสอบว่าควรไปดูที่นั่งไหน ระบบแจ้งเท่านั้น คนตัดสินทุกกรณี ไม่อ่านอารมณ์ และไม่จดจำว่าใครเป็นใคร",
    2: "ตรวจพบโทรศัพท์ที่อยู่ใกล้กล้องได้ดี โทรศัพท์ที่วางบนโต๊ะมักตรวจไม่พบ ผู้คุมสอบควรเดินตรวจร่วมด้วย" },
  examlab: { cards: ["exam-lab"],
    2: "ระบบช่วยผู้คุมสอบเท่านั้น ไม่ตัดสินว่ามีการทุจริต" },
  examhall: { cards: ["exam-hall"],
    1: "กล้องหนึ่งตัวดูหลายที่นั่งในห้องสอบ แจ้งที่นั่งว่าง คนเพิ่ม และคนเอนตัว ให้ผู้คุมสอบไปดู",
    2: "ใบหน้าที่อยู่ไกลกล้องยังหาไม่เจอ และเห็นโทรศัพท์ได้เฉพาะแถวหน้าใกล้กล้อง ผู้คุมสอบควรเดินตรวจร่วมด้วย" },
  attendance: { cards: ["attendance"],
    1: "ลงเวลาทำงานด้วย PIN หรือ QR บนเครื่องของร้าน ไม่ต้องใช้กล้อง สแกนใบหน้าเป็นทางเลือกเฉพาะพนักงานที่ยินยอม",
    2: "แบบสแกนใบหน้าบางครั้งต้องสแกนซ้ำหรือให้หัวหน้ายืนยัน และกันภาพปลอมได้ไม่ครบ จึงควรมีคนดูแลจุดลงเวลา" },
  pc: { cards: ["medicine"],
    1: "อ่านฉลากยาและสินค้า บาร์โค้ด และตรวจถ้อยคำโฆษณาบนเครื่องนี้ ภาพไม่ถูกส่งออก",
    2: "อาจอ่านชื่อยาหรือตัวเลขผิด และอาจพลาดคำโฆษณาที่เขียนต่างออกไป ไม่ใช่การยืนยันขั้นสุดท้าย ยืนยันกับเภสัชกรทุกครั้ง" },
  nutrition: { cards: ["nutrition"],
    1: "อ่านฉลากโภชนาการบนเครื่องนี้ แสดงค่าพร้อมบรรทัดที่อ่านมา และให้แก้ไขได้",
    2: "ตัวอักษรเล็ก ฉลากโค้ง หรือแสงสะท้อนอาจทำให้ค่าผิด เทียบกับฉลากจริงทุกครั้ง ไม่ใช่คำแนะนำทางการแพทย์" },
  studio: { cards: ["studio"],
    1: "ทำภาพโปรไฟล์และรูปติดบัตรจากรูปของคุณ เปลี่ยนฉากและรีทัชบนเครื่องนี้",
    2: "บางภาพอาจมีขอบหรือรอยต่อผิดปกติ ดูภาพทุกครั้งก่อนใช้ ชุดจำลองยังเป็นแบบร่างและปิดไว้เป็นค่าเริ่มต้น" },
  photobooth: { cards: ["photobooth"],
    1: "ตู้ถ่ายรูปสำหรับอีเวนต์ ใส่กรอบและสติ๊กเกอร์ พิมพ์หรือรับไฟล์ได้ทันที",
    2: "รูปติดบัตรแบบใส่ชุดจำลองยังเป็นแบบร่าง ปิดไว้เป็นค่าเริ่มต้น ดูรูปก่อนพิมพ์ทุกครั้ง" },
  omr: { cards: ["omr"],
    1: "ตรวจกระดาษคำตอบด้วยกล้องมือถือ แสดงคะแนนและสถิติรายข้อ",
    2: "แผ่นที่ระบายจาง ระบายเกินวง หรือถ่ายเอียงอาจอ่านผิด ระบบทำเครื่องหมายแผ่นที่ไม่แน่ใจไว้ให้ครูตรวจ" },
  store: { cards: ["store", "retail"],
    1: "นับคนผ่านประตูร้าน คิว และอัตราการซื้อโดยประมาณ ไม่ระบุตัวตน",
    2: "ประตูที่คนเดินเป็นกลุ่มหรือคนแน่นอาจนับคลาด ทดลองเทียบกับการนับของคุณก่อนใช้ตัดสินใจ" },
  booth: { cards: ["booth"],
    1: "นับผู้เข้าชมบูธ ไม่เก็บข้อมูลใบหน้าเป็นค่าเริ่มต้น",
    2: "นับเฉพาะคนที่หันหน้ามาทางกล้อง ใช้ดูแนวโน้มมากกว่ายอดจริง" },
  zones: { cards: ["queue", "tables", "bays", "afterhours"],
    1: "แจ้งคิว โต๊ะว่าง ช่องจอด หรือคนในพื้นที่หวงห้าม โดยไม่ระบุตัวตนและไม่บันทึกภาพ",
    2: "เงา แสงไฟ หรือคนยืนบังกันอาจทำให้แจ้งผิดหรือนับขาด ให้เจ้าหน้าที่ตรวจก่อนดำเนินการ" },
  checkout: { cards: ["checkout"],
    1: "สแกนบาร์โค้ดสินค้าด้วยกล้อง",
    2: "ภาพสั่น เบลอ หรือเอียงมากอ่านไม่ได้ ตรวจรายการในตะกร้าก่อนรับเงิน" },
  creative: { cards: ["creative", "creative-suite"],
    1: "คาดการณ์ว่าคนจะมองตรงไหนของชิ้นงานโฆษณา",
    2: "เป็นการคาดการณ์ ไม่ใช่การวัดสายตาคนจริง" },
  insights: { cards: ["insights"],
    1: "รวมยอดจากระบบนับคนต่าง ๆ ในที่เดียว",
    2: "ตัวเลขถูกต้องได้เท่ากับระบบต้นทางเท่านั้น" },
  driver: { cards: ["driver"],
    1: "เตือนเมื่อคนขับหลับตานานหรือหันออกจากถนน",
    2: "เตือนได้เพียงบางส่วน ไม่ใช่อุปกรณ์ความปลอดภัย ห้ามใช้แทนการพักผ่อน" },
  qc: { cards: ["qc"],
    1: "ตรวจขวดและฝาบนสายการผลิตด้วยกล้องที่ตั้งคงที่",
    2: "แสงหรือตำแหน่งกล้องที่เปลี่ยนอาจทำให้ปัดตกผิด สอบเทียบกับขวดตัวอย่างก่อนเริ่มงานทุกครั้ง" },
  converter: { cards: ["converter"],
    1: "แปลงไฟล์ PDF เป็น Word บนเครื่องนี้ ไม่อัปโหลด",
    2: "เอกสารที่มีตารางหรือรูปซับซ้อนอาจจัดหน้าไม่ตรงต้นฉบับ" },
  hr: { cards: ["hr", "interview", "case-review"],
    1: "ชุดสัมภาษณ์แบบมีโครงสร้าง ผู้สัมภาษณ์ให้คะแนนเอง",
    2: "ระบบไม่ตัดสินการจ้างงาน ไม่อ่านอารมณ์ และไม่จับโกหก" }
};

/** Owner decision 223 (audit 1.10): the "ยังขาด… / Still needed" notes of the 25 coming-soon cards on solutions.html are
 *  internal roadmap language, so they left the customer page. They are kept here verbatim (TH / EN / ZH, as at base ecb783b6)
 *  and listed in docs/PAGE-STATUS.md (back-office document). */
const SOON_ROADMAP = [
  { card: "sol-edu3", title: "School-gate check-in with parent notice",
    th: "ขั้นตอนขอความยินยอมจากผู้ปกครอง ทางเลือก QR สำหรับเด็กที่ไม่ใช้ใบหน้า และช่องทางส่งข้อความถึงผู้ปกครอง",
    en: "A parental-consent flow, a QR alternative for children who do not use their face, and a channel for messages to parents",
    zh: "家长同意流程、为不使用人脸的孩子提供的二维码替代方式，以及给家长发消息的渠道" },
  { card: "sol-edu4", title: "PE fitness test (pose rep counter)",
    th: "โมเดลท่าทาง (MediaPipe Pose, Apache-2.0) และการวัดความแม่นยำกับนักเรียนจริงพร้อมความยินยอมของผู้ปกครอง",
    en: "A pose model (MediaPipe Pose, Apache-2.0) and accuracy testing with real pupils, with parental consent",
    zh: "姿态模型（MediaPipe Pose，Apache-2.0）以及在家长同意下与真实学生进行的准确度测试" },
  { card: "sol-edu8", title: "Paper-card class poll",
    th: "ตัวอ่านมาร์กเกอร์บนการ์ด (js-aruco, MIT) และการทดสอบในห้องเรียนจริง",
    en: "A marker reader for the cards (js-aruco, MIT) and testing in real classrooms",
    zh: "卡片标记识别器（js-aruco，MIT）以及在真实课堂中的测试" },
  { card: "sol-edu9", title: "Homework and document scan to PDF",
    th: "ขั้นตอนหาขอบกระดาษและสร้าง PDF ในเบราว์เซอร์ ยังไม่ได้สร้าง",
    en: "Page-edge detection and in-browser PDF creation; not built yet",
    zh: "纸张边缘检测和浏览器内生成 PDF，尚未开发" },
  { card: "sol-edu10", title: "Library loans by barcode",
    th: "ตัวอ่านบาร์โค้ดสำรองสำหรับ iPhone (zxing-js, Apache-2.0) และหน้าบันทึกการยืม-คืน",
    en: "A backup barcode reader for iPhone (zxing-js, Apache-2.0) and a loans page",
    zh: "适用于 iPhone 的备用条码识别（zxing-js，Apache-2.0）和借还记录页面" },
  { card: "sol-edu11", title: "Safety-goggle check in school labs",
    th: "ตัวตรวจจับเฉพาะ (YOLOX, Apache-2.0) ที่ฝึกด้วยภาพที่ใช้เชิงพาณิชย์ได้ และความยินยอมของผู้ปกครอง",
    en: "A custom detector (YOLOX, Apache-2.0) trained on images cleared for commercial use, and parental consent",
    zh: "使用可商用图像训练的专用检测器（YOLOX，Apache-2.0），以及家长同意" },
  { card: "sol-r11", title: "Before/after campaign test",
    th: "หน้าเทียบผลที่ใช้ตัวเลขรายวันจากหน้านับคน (lensiq-stats) ยังไม่ได้สร้าง",
    en: "A comparison page using the daily numbers from the counting pages (lensiq-stats); not built yet",
    zh: "使用计数页面每日数据（lensiq-stats）的对比页面，尚未开发" },
  { card: "sol-r12", title: "Phone stocktake by barcode",
    th: "ตัวอ่านบาร์โค้ดสำรองสำหรับ iPhone (zxing-js, Apache-2.0) และหน้านับสต็อก",
    en: "A backup barcode reader for iPhone (zxing-js, Apache-2.0) and a stocktake page",
    zh: "适用于 iPhone 的备用条码识别（zxing-js，Apache-2.0）和盘点页面" },
  { card: "sol-r13", title: "Empty-shelf check from photos",
    th: "การเทียบภาพกับต้นแบบแบบนำร่อง และต่อไปตัวตรวจจับช่องว่างที่ฝึกด้วยข้อมูลที่ใช้เชิงพาณิชย์ได้",
    en: "Reference-photo comparison as a pilot, then an empty-slot detector trained on data cleared for commercial use",
    zh: "先以参考照片对比做试点，之后使用可商用数据训练的空位检测器" },
  { card: "sol-r14", title: "Staff rota vs footfall",
    th: "ส่วนเสริมในแดชบอร์ดรวมที่อ่านตารางกะ ยังไม่ได้สร้าง",
    en: "An add-on to the combined dashboard that reads the rota; not built yet",
    zh: "综合看板中读取排班表的附加功能，尚未开发" },
  { card: "sol-r15", title: "Price and expiry label reading",
    th: "โมเดลหาตำแหน่งข้อความ (PP-OCR det, Apache-2.0) เพิ่มจากตัวอ่านข้อความที่มีอยู่",
    en: "A text-detection model (PP-OCR det, Apache-2.0) on top of the existing text reader",
    zh: "在现有文字识别之上增加文字检测模型（PP-OCR det，Apache-2.0）" },
  { card: "sol-m3", title: "Helmet and vest check at the gate",
    th: "โมเดลตรวจจับเฉพาะ (YOLOX, Apache-2.0) ที่ฝึกจากภาพที่มีสิทธิ์ใช้เชิงพาณิชย์ ตอนนี้ยังไม่มีโมเดลสำเร็จรูปที่ใบอนุญาตชัดเจน",
    en: "A custom detector (YOLOX, Apache-2.0) trained on images cleared for commercial use; no ready-made model with a clear licence exists yet",
    zh: "需要用可商用图像训练的专用检测器（YOLOX，Apache-2.0）；目前尚无许可明确的现成模型" },
  { card: "sol-h1", title: "Fall or no-movement alert",
    th: "โมเดลท่าทาง (MediaPipe Pose, Apache-2.0) ภาพแบบเงาเพื่อความเป็นส่วนตัว และการทดสอบกับผู้ดูแลจริง ไม่ใช่อุปกรณ์การแพทย์",
    en: "A pose model (MediaPipe Pose, Apache-2.0), a silhouette view for privacy and testing with real carers; it is not a medical device",
    zh: "姿态模型（MediaPipe Pose，Apache-2.0）、保护隐私的剪影视图，以及与真实护理人员的测试；它不是医疗器械" },
  { card: "sol-h2", title: "Physiotherapy rep and range coach",
    th: "โมเดลท่าทางและการวัดความแม่นยำเทียบกับการวัดของนักกายภาพ",
    en: "A pose model and accuracy measured against physiotherapist measurements",
    zh: "姿态模型，以及与康复师测量结果对比的准确度验证" },
  { card: "sol-h7", title: "Pill tray counter",
    th: "วิธีแยกเม็ดยาที่ติดกัน และการวัดความแม่นยำกับถาดจริงก่อนใช้งาน",
    en: "A way to separate touching pills, and accuracy measured on real trays before use",
    zh: "分开相互接触药片的方法，以及在真实托盘上测得的准确率" },
  { card: "sol-h8", title: "Hand-wash timer",
    th: "โมเดลตรวจจับมือ (MediaPipe, Apache-2.0) ในหน้าใหม่ และภาพขั้นตอนที่มีสิทธิ์ใช้",
    en: "A hand-detection model (MediaPipe, Apache-2.0) in a new page, and step pictures we may use",
    zh: "新页面中的手部检测模型（MediaPipe，Apache-2.0）以及可使用的步骤图" },
  { card: "sol-h9", title: "Thai ID-card reading for registration",
    th: "โมเดลหาตำแหน่งข้อความและการตัดกรอบบัตร พร้อมการประเมินผลกระทบด้านข้อมูลส่วนบุคคล",
    en: "A text-detection model and card cropping, plus a data-protection impact assessment",
    zh: "文字检测模型和证件裁剪，以及个人数据影响评估" },
  { card: "sol-h10", title: "Medicine label read aloud",
    th: "โมเดลหาตำแหน่งข้อความ (PP-OCR det, Apache-2.0) และการทดสอบกับฉลากยาไทยจริง",
    en: "A text-detection model (PP-OCR det, Apache-2.0) and testing with real Thai labels",
    zh: "文字检测模型（PP-OCR det，Apache-2.0）以及用真实泰国药品标签测试" },
  { card: "sol-f1", title: "Gym and Muay Thai rep counter",
    th: "โมเดลท่าทางและการทดสอบกับท่าจริงหลายมุมกล้อง",
    en: "A pose model and testing on real moves from several camera angles",
    zh: "姿态模型，以及在多个机位下对真实动作的测试" },
  { card: "sol-a4", title: "Livestock counting",
    th: "ตัวตรวจจับรู้จักวัวและแกะจากชุดข้อมูลทั่วไป แต่ยังไม่ได้วัดความแม่นยำกับสัตว์และคอกในไทย",
    en: "The detector knows cows and sheep from a general dataset, but accuracy has not been measured on Thai animals and pens",
    zh: "检测器能从通用数据集中识别牛和羊，但尚未在泰国的牲畜和圈舍上测量准确度" },
  { card: "sol-e10", title: "Feng-shui furniture check from a room photo",
    th: "ตัวตรวจจับวัตถุในหน้าฮวงจุ้ย (COCO-SSD)",
    en: "Object detection on the feng-shui page (COCO-SSD)",
    zh: "风水页面中的物体检测（COCO-SSD）" },
  { card: "sol-e11", title: "Printable move-in plan",
    th: "หน้ารวมที่ดึงข้อมูลจากหน้าวางแผนฤกษ์และหน้าฮวงจุ้ย ยังไม่ได้สร้าง",
    en: "A combined page that pulls from the date planner and the feng-shui page; not built yet",
    zh: "汇总吉日规划与风水页面数据的页面，尚未开发" },
  { card: "sol-e12", title: "Lucky numbers from the camera",
    th: "เชื่อมตัวอ่านป้ายทะเบียน (lensiq-plate.js) เข้ากับหน้าเลขมงคล",
    en: "Connecting the plate reader (lensiq-plate.js) to the lucky-numbers page",
    zh: "把车牌识别（lensiq-plate.js）连接到吉祥数字页面" },
  { card: "sol-e13", title: "Real Tarot card recognition",
    th: "ตัวจำแนกไพ่ที่ต้องฝึกเอง หรือการเทียบกับภาพไพ่ที่มีสิทธิ์ใช้",
    en: "A card classifier we would train ourselves, or matching against card images we have the rights to use",
    zh: "需要自行训练的卡牌分类器，或与有使用权的牌面图像比对" },
  { card: "sol-e14", title: "Dense-crowd estimate",
    th: "โมเดลประมาณความหนาแน่นที่น้ำหนักโมเดลใช้เชิงพาณิชย์ได้ (โมเดลที่พบส่วนใหญ่ฝึกด้วยชุดข้อมูลเพื่อการวิจัยเท่านั้น)",
    en: "A density model whose weights are cleared for commercial use (most available ones are trained on research-only datasets)",
    zh: "权重可商用的密度模型（现有模型大多用仅限研究的数据集训练）" }
];

/** Every page in the repo root: status, reason, accuracy lines. `cat` pages are filled from CATEGORIES below. */
const PAGES = {
  // 1 Security & Access
  gate: { st: "pilot-ready", why: "gate", claims: ["gateSyn", "gatePub"] },
  parking: { st: "pilot-ready", why: "gate", claims: ["gateSyn", "gatePub"] },
  village: { st: "pilot-ready", why: "gate", claims: ["gateSyn", "gatePub"] },
  "gate-notice": { st: "support", why: "notice", claims: ["info"] },
  cameras: { st: "support", why: "directory", claims: ["info"] },
  afterhours: { st: "experimental", why: "zone", claims: ["zone"] },
  // 2 Education & Exams
  exam: { st: "pilot-ready", why: "exam", claims: ["examNone"] },
  "exam-lab": { st: "pilot-ready", why: "exam", claims: ["examNone"] },
  // owner decision 2026-11-10: hall mode stays "experimental" until the small-face issue is fixed (docs/exam/FACE-ENGINE-RESULTS.md §7)
  "exam-hall": { st: "experimental", why: "examHall", claims: ["examNone", "examHall"] },
  "exam-dashboard": { st: "pilot-ready", why: "exam", claims: ["examNone"] },
  omr: { st: "experimental", why: "omr", claims: ["omrNone"] },
  // 3 HR & Workplace
  attendance: { st: "pilot-ready", why: "attendance", claims: ["attPin", "face"] },
  hr: { st: "pilot-ready", why: "people", claims: ["people", "hrPilot"] },
  interview: { st: "pilot-ready", why: "people", claims: ["people", "hrPilot"] },
  "case-review": { st: "pilot-ready", why: "people", claims: ["people"] },
  teamface: { st: "demo", why: "teamface", claims: ["teamface"] },
  // 4 Marketing, Retail & Events
  // Sellable pack order 2026-11-11 (CLAUDE.md: Crowd is not yet suitable for dense crowds; CTO-BRIEF rates it experimental): experimental, events
  crowd: { st: "experimental", why: "crowd", claims: ["crowd", "crowdDense"] },
  store: { st: "pilot-ready", why: "store", claims: ["store"] },
  retail: { st: "pilot-ready", why: "store", claims: ["store"] },
  insights: { st: "experimental", why: "insights", claims: ["insights"] },
  customers: { st: "experimental", why: "customers", claims: ["face"] },
  signage: { st: "demo", why: "research", claims: ["ageGender", "hand"] },
  neuro: { st: "demo", why: "research", claims: ["neuro"] },
  queue: { st: "experimental", why: "zone", claims: ["zone"] },
  tables: { st: "experimental", why: "zone", claims: ["zone"] },
  bays: { st: "experimental", why: "zone", claims: ["zone"] },
  checkout: { st: "experimental", why: "checkout", claims: ["checkout"] },
  creative: { st: "experimental", why: "creative", claims: ["creative"] },
  "creative-suite": { st: "experimental", why: "suite", claims: ["creative", "studio"] },
  booth: { st: "experimental", why: "booth", claims: ["boothNone", "boothFace"] },
  // 5 Health, Safety & Quality
  medicine: { st: "experimental", why: "medicine", claims: ["med"] },
  nutrition: { st: "experimental", why: "nutrition", claims: ["nut"] },
  driver: { st: "experimental", why: "driver", claims: ["driverPub", "driverSyn"] },
  qc: { st: "experimental", why: "qc", claims: ["qc"] },
  // 6 Fortune & Auspicious Planning
  fortune: { st: "demo", why: "fortune", claims: [] },
  faceread: { st: "demo", why: "fortune", claims: [] },
  palm: { st: "demo", why: "fortune", claims: [] },
  horoscope: { st: "demo", why: "fortune", claims: [] },
  tarot: { st: "demo", why: "fortune", claims: [] },
  iching: { st: "demo", why: "fortune", claims: [] },
  bazi: { st: "demo", why: "fortune", claims: [] },
  taksa: { st: "demo", why: "fortune", claims: [] },
  lek7: { st: "demo", why: "fortune", claims: [] },
  numbers: { st: "demo", why: "fortune", claims: [] },
  fengshui: { st: "demo", why: "fortune", claims: [] },
  dream: { st: "demo", why: "fortune", claims: [] },
  zodiac: { st: "demo", why: "fortune", claims: [] },
  compat: { st: "demo", why: "fortune", claims: [] },
  astro: { st: "demo", why: "fortune", claims: [] },
  lifegraph: { st: "demo", why: "fortune", claims: [] },
  planner: { st: "demo", why: "fortune", claims: [] },
  luckycolor: { st: "demo", why: "fortune", claims: [] },
  petread: { st: "demo", why: "fortune", claims: [] },
  report: { st: "demo", why: "fortune", claims: [] },
  // 7 Studio & Media
  studio: { st: "experimental", why: "studio", claims: ["studio"] },
  tryon: { st: "experimental", why: "tryon", claims: ["tryon"] },
  photobooth: { st: "pilot-ready", why: "photobooth", claims: ["photobooth"] },
  converter: { st: "experimental", why: "converter", claims: ["converter"] },
  // Platform (not a category)
  index: { st: "support", why: "content", claims: ["info"] },
  solutions: { st: "support", why: "content", claims: ["info"] },
  about: { st: "support", why: "content", claims: ["info"] },
  help: { st: "support", why: "content", claims: ["info"] },
  counselling: { st: "support", why: "content", claims: ["info"] },
  "404": { st: "support", why: "content", claims: ["info"] },
  "camera-notice": { st: "support", why: "notice", claims: ["info"] },
  privacy: { st: "support", why: "legal", claims: ["info"] },
  terms: { st: "support", why: "legal", claims: ["info"] },
  pricing: { st: "support", why: "scaffold", claims: ["info"] },
  account: { st: "support", why: "scaffold", claims: ["info"] },
  admin: { st: "support", why: "scaffold", claims: ["info"] }
};

/** The 7 categories (CLAUDE.md). `id` = nav.js menu group id (kept from the round-14 menu where the meaning matches, so
 *  existing selectors such as #navsub-photo / #navsub-fortune keep working). */
const CATEGORIES = [
  { n: 1, slug: "security", id: "gate", icon: "🚗",
    name: { th: "ความปลอดภัยและการเข้าออก", en: "Security & Access", zh: "安全与出入" },
    short: { th: "เข้าออก", en: "Access", zh: "出入" },
    intro: { th: "อ่านป้ายทะเบียนรถไทยบนเครื่องสำหรับลานจอดและหมู่บ้าน ป้ายแจ้ง PDPA และแจ้งเตือนคนในพื้นที่หวงห้ามหรือนอกเวลา เจ้าหน้าที่ยืนยันทุกครั้ง",
      en:
        "Thai licence plates read on the device for car parks and villages, PDPA signs, and alerts for people in restricted areas or after hours. Staff confirm every time.",
      zh: "在本机识别泰国车牌，用于停车场与小区；PDPA 告示；禁区或非工作时间有人时提醒。每次均由工作人员确认。" },
    pages: ["gate", "parking", "village", "gate-notice", "cameras", "afterhours"] },
  { n: 2, slug: "education", id: "edu", icon: "📝",
    name: { th: "การศึกษาและการสอบ", en: "Education & Exams", zh: "教育与考试" },
    short: { th: "การสอบ", en: "Exams", zh: "考试" },
    intro: { th: "ช่วยผู้คุมสอบรู้ว่าควรไปดูที่นั่งไหน และตรวจกระดาษคำตอบด้วยมือถือ ระบบไม่ตัดสินการทุจริต คนตัดสินเสมอ ไม่อ่านอารมณ์",
      en:
        "Helps invigilators know which seat to check, and grades answer sheets with a phone. The system never decides cheating; a person always does. No emotion is read.",
      zh: "帮助监考员知道该查看哪个座位，并用手机批改答题卡。系统从不判定作弊，始终由人决定。不读取情绪。" },
    pages: ["exam", "exam-lab", "exam-hall", "exam-dashboard", "omr"] },
  { n: 3, slug: "hr", id: "work", icon: "🧑‍💼",
    name: { th: "HR และที่ทำงาน", en: "HR & Workplace", zh: "人力资源与职场" },
    short: { th: "HR", en: "HR", zh: "人力" },
    intro: { th: "ลงเวลาด้วย PIN หรือ QR (ใบหน้าเป็นทางเลือก) สัมภาษณ์แบบมีโครงสร้าง และทบทวนเคส คนตัดสินใจเรื่องคนเสมอ",
      en: "Time clock by PIN or QR (face optional), structured interviews and case review. People always make the decisions about people.",
      zh: "PIN 或二维码考勤（人脸可选）、结构化面试与案例复盘。涉及人员的决定始终由人作出。" },
    pages: ["attendance", "hr", "interview", "case-review", "teamface"] },
  { n: 4, slug: "marketing", id: "ana", icon: "🛍️",
    name: { th: "การตลาด ค้าปลีก และอีเวนต์", en: "Marketing, Retail & Events", zh: "营销、零售与活动" },
    short: { th: "ค้าปลีก", en: "Retail", zh: "零售" },
    intro: { th: "นับคนและความหนาแน่น หน้าร้าน คิว โต๊ะ ช่องจอด และบูธ แบบไม่ระบุตัวตน ประมวลผลบนเครื่อง",
      en: "People counts and density, store, queues, tables, bays and booths, anonymous and processed on the device.",
      zh: "人数与密度、门店、排队、餐桌、车位与展位，匿名且在本机处理。" },
    pages: ["crowd", "store", "retail", "insights", "customers", "signage", "neuro", "queue", "tables", "bays", "checkout", "creative",
      "creative-suite", "booth"] },
  { n: 5, slug: "health", id: "health", icon: "🩺",
    name: { th: "สุขภาพ ความปลอดภัย และคุณภาพ", en: "Health, Safety & Quality", zh: "健康、安全与质量" },
    short: { th: "สุขภาพ", en: "Health", zh: "健康" },
    intro: { th: "ตรวจข้อมูลยาให้เภสัชกรยืนยัน เตือนเมื่อคนขับหลับตานาน และตรวจคุณภาพสินค้าบนสายการผลิต",
      en: "Medicine information for a pharmacist to confirm, alerts when a driver's eyes stay closed, and product inspection on the production line.",
      zh: "药品信息供药剂师确认，驾驶员长时间闭眼时提醒，以及产线上的产品质检。" },
    pages: ["medicine", "nutrition", "driver", "qc"] },
  // owner order 2026-11-17: no status tag (สาธิต / Demo / 演示) on the fortune landing page, its tools or the index count;
  // the pages keep st "demo" here for docs/PAGE-STATUS.md only. Accuracy and notice lines unchanged.
  // owner decision 2026-11-18: fortune cards carry no accuracy field (noAccuracy, category 6 only; tests/unit/cat-pages.test.js):
  // each card is one link with the name, one short line (the nav.js menu line) and a small illustration (ill); no sources
  // section on the landing page; the disclaimer once near the top (disc). Business categories are unchanged.
  { n: 6, slug: "fortune", id: "fortune", icon: "🔮", noStatusTag: true, noAccuracy: true,
    ill: { fortune: "🔮", faceread: "👁️", palm: "✋", horoscope: "🌙", tarot: "🃏", iching: "☯️", bazi: "☯", taksa: "🪐", lek7: "7️⃣",
      numbers: "🔢", fengshui: "🧭", dream: "💭", zodiac: "🐉", compat: "💞", astro: "♌", lifegraph: "📈", planner: "📅", luckycolor: "👕",
      petread: "🐾", report: "📜" },
    name: { th: "ดูดวงและฤกษ์มงคล", en: "Fortune & Auspicious Planning", zh: "占卜与择吉" },
    short: { th: "ดูดวง", en: "Fortune", zh: "占卜" },
    // owner order 2026-11-16 item 2: written for the person using the pages; the booth / event wording moved to solutions.html (sol-e3)
    intro: { th: "ดูดวงศาสตร์ไทย จีน และตะวันตก และหาฤกษ์มงคลสำหรับเรื่องสำคัญของคุณ เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
      en: "Thai, Chinese and Western readings, plus auspicious dates for what matters to you. " +
        "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
      zh: "泰式、中式与西方占卜，以及为重要事项择吉日。基于命理学原则，属个人信仰，请自行判断。" },
    // on the landing page the intro is shown as this lead plus the fortune notice line (fortune.disc.line), as on every fortune page
    lead: { th: "ดูดวงศาสตร์ไทย จีน และตะวันตก และหาฤกษ์มงคลสำหรับเรื่องสำคัญของคุณ",
      en: "Thai, Chinese and Western readings, plus auspicious dates for what matters to you.",
      zh: "泰式、中式与西方占卜，以及为重要事项择吉日。" },
    discMore: "help.html#h-fortune", // owner order 2026-11-16 item 4: "อ่านเพิ่มเติม" after the one-line notice
    disc: { th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
      en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
      zh: "基于命理学原则，属个人信仰，请自行判断。" },
    pages: ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream", "zodiac",
      "compat", "astro", "lifegraph", "planner", "luckycolor", "petread", "report"] },
  { n: 7, slug: "studio", id: "photo", icon: "📸",
    name: { th: "สตูดิโอและสื่อ", en: "Studio & Media", zh: "影棚与媒体" },
    short: { th: "สตูดิโอ", en: "Studio", zh: "影棚" },
    intro: { th: "สตูดิโอภาพโปรไฟล์และรูปติดบัตร ตู้ถ่ายรูปสำหรับอีเวนต์ วิเคราะห์บูธ และแปลงเอกสาร",
      en: "Portrait and ID photo studio, event photo booth, booth analytics and document conversion.",
      zh: "形象照与证件照影棚、活动拍照亭、展位分析与文档转换。" },
    pages: ["studio", "photobooth", "converter", "booth"] }
];

/** Platform pages (not a category): nav.js "About" group. admin.html stays unlinked on purpose (owner back office,
 *  noindex; see docs/PAGE-STATUS.md "Not linked"). */
const PLATFORM = ["about", "solutions", "pricing", "help", "privacy", "terms", "camera-notice", "account"];
const UNLINKED = { admin: "Owner back office (noindex), deliberately not linked from any page since round 9",
  tryon: "Try-On MVP customer page, opened from a shop link; not in the menus until the owner picks its category",
  "404": "Not-found page (owner order 2026-11-18 C, promotion basics): GitHub Pages shows it for any missing address; noindex, not in the menus or the sitemap",
  counselling: "Counselling services (owner decision 2026-11-16, crisis one-number rules): linked only from the fortune crisis card and help line, help and privacy; not in the menus" };

module.exports = { STATUS, STATUS_DEF, STATUS_DEF_CAT, SOURCE, CLAIMS, REASONS, BADGE, DEMO_ONLY, NO_BADGE, badgeOf, LINES, SOON_ROADMAP, PAGES, CATEGORIES, PLATFORM, UNLINKED };
