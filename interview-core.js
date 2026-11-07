/* interview-core.js — Structured Interview Kit (interview.html): content + pure functions. Node-testable:
 *   const IV = require("./interview-core.js")
 * Browser: window.IVCore. Thai text lives here (the default language); 中文 is in i18n/zh-interview.js under the keys
 * named next to each text (iv.c.<id>.*, iv.r.<id>, iv.law.<id>.*, iv.bias.<id>.*, iv.tip.<id>).
 *
 * PRINCIPLE: the kit never judges or decides. It organises structured questions, collects interviewers' own ratings
 * and evidence, and shows how far the ratings agree. Delivery signals are descriptive observations (face visible,
 * head turned toward the camera, head movement, speaking time, pauses) — never emotion, honesty or personality.
 *
 * API
 *   COMPETENCIES {id: {name, def, beh, sit, a1, a3, a5}}   STAR + situational question, BARS anchors for 1/3/5
 *   ROLES {id: {name, comps:[ids]}}  ('custom' = comps chosen by the user)  · STAR_PROBES [..] · BIASES [..] · LAW [..]
 *   aggregate(sheets, compIds) -> {comps:[{id, scores:[{who, score, note}], n, mean, median, min, max, range, sd, agree}],
 *        overall:{n, mean, agreePct, rated}, strengths:[ids], develop:[ids], discuss:[ids]}
 *     sheets = [{who, scores:{compId: 1..5|null}, notes:{compId: text}}]; agree = 'high' (range ≤ 1) | 'some' (2) | 'low' (≥ 3) | null (< 2 raters)
 *     strengths = mean ≥ 4 and agree != 'low'; develop = mean ≤ 2.5 and agree != 'low'; discuss = agree == 'low'
 *   exportSheet(sheet, meta) -> JSON string · importSheet(text, compIds) -> sheet | throws Error (validated, clamped)
 *   createVad(opts) -> {push(db, tMs), result(), reset()}   energy VAD (adaptive noise floor + hangover)
 *     result() -> {ms, speechMs, share, segments, pauses, longPauses, pausesPerMin, meanPauseMs, meanRunMs, peaks, peakRate}
 *   rmsDb(float32Samples) -> dBFS (−120 floor)
 *   poseOf(pts68) -> {yaw, pitch, cx, cy, ipd}   yaw/pitch are head-orientation proxies in IPD units (0 = frontal)
 *   gazeMetrics(samples, opts) -> {n, facePct, towardPct, movement, movementBand}
 *     samples = [{t, face:boolean, yaw?, pitch?, cx?, cy?, ipd?}]; toward = |yaw| ≤ yawT and |pitch − median| ≤ pitchT
 *   practiceTips(delivery, gaze) -> [{id, level:'good'|'tip', vars}]   self-coaching tips (key iv.tip.<id>)
 *   synthPts(box, yaw=0) -> 68 landmark points (test seam for ?fakedet)
 *   orgAllowed(org) / deliveryView({org, delivery, submitted}) -> "none"|"candidate"|"pending"|"interviewer" (see below)
 */
(function (root) {
  "use strict";

  /* ---------- competency library (BARS anchors 1 / 3 / 5; 2 and 4 = between the neighbouring anchors) ---------- */
  var COMPETENCIES = {
    comm: { name: "การสื่อสาร", def: "ถ่ายทอดข้อมูลชัดเจน ตรงกับผู้ฟัง ฟังและตรวจสอบความเข้าใจ",
      beh: "เล่าถึงครั้งที่คุณต้องอธิบายเรื่องที่ซับซ้อนให้คนที่ไม่มีพื้นฐานเข้าใจ คุณทำอย่างไร และผลเป็นอย่างไร",
      sit: "ถ้าคุณส่งข้อมูลสำคัญให้ทีมแล้วพบว่าหลายคนเข้าใจไม่ตรงกัน คุณจะทำอะไรเป็นอย่างแรก",
      a1: "อธิบายวกวน ไม่ปรับตามผู้ฟัง ไม่ตรวจว่าผู้ฟังเข้าใจ", a3: "อธิบายได้ชัดในสถานการณ์ทั่วไป ปรับภาษาบ้าง ถามกลับเมื่อจำเป็น",
      a5: "วางโครงเรื่องตามผู้ฟัง ใช้ตัวอย่างประกอบ ตรวจความเข้าใจอย่างเป็นระบบ และมีหลักฐานว่าผู้ฟังนำไปใช้ได้" },
    customer: { name: "การมุ่งเน้นลูกค้า", def: "เข้าใจความต้องการของลูกค้า แก้ปัญหาให้ลูกค้า และรักษาความสัมพันธ์ระยะยาว",
      beh: "เล่าถึงลูกค้าที่ไม่พอใจที่คุณเคยดูแล สถานการณ์เป็นอย่างไร คุณทำอะไรบ้าง และจบอย่างไร",
      sit: "ลูกค้าขอสิ่งที่ขัดกับนโยบายบริษัทและเริ่มไม่พอใจ คุณจะตอบสนองอย่างไร",
      a1: "ตอบตามระเบียบโดยไม่ฟังความต้องการ หรือโยนเรื่องให้ผู้อื่น", a3: "รับฟัง แก้ปัญหาเฉพาะหน้าได้ และแจ้งความคืบหน้า",
      a5: "ค้นหาความต้องการที่แท้จริง เสนอทางเลือกภายในกรอบ ติดตามผล และปรับปรุงกระบวนการไม่ให้เกิดซ้ำ" },
    team: { name: "การทำงานเป็นทีม", def: "ร่วมมือ แบ่งปันข้อมูล สนับสนุนเพื่อนร่วมงาน และจัดการความเห็นต่างอย่างสร้างสรรค์",
      beh: "เล่าถึงครั้งที่คุณเห็นต่างกับเพื่อนร่วมทีมในเรื่องงาน คุณจัดการอย่างไร และผลเป็นอย่างไร",
      sit: "สมาชิกทีมคนหนึ่งส่งงานล่าช้าจนกระทบงานของทุกคน คุณจะทำอย่างไร",
      a1: "ทำงานแยกตัว ไม่แบ่งปันข้อมูล หลีกเลี่ยงหรือทำให้ความขัดแย้งบานปลาย", a3: "ให้ความร่วมมือเมื่อได้รับการขอ ช่วยเพื่อนในงานที่เกี่ยวข้อง",
      a5: "ริเริ่มช่วยเหลือ เปิดประเด็นเห็นต่างอย่างให้เกียรติ หาข้อตกลงที่ทุกฝ่ายยอมรับ และมีผลลัพธ์ของทีมดีขึ้นจริง" },
    problem: { name: "การแก้ปัญหาและการคิดวิเคราะห์", def: "รวบรวมข้อมูล หาสาเหตุ ชั่งน้ำหนักทางเลือก และตัดสินใจอย่างมีเหตุผล",
      beh: "เล่าถึงปัญหาที่ยากที่สุดที่คุณเคยแก้ในงาน คุณหาสาเหตุอย่างไร และเลือกวิธีแก้อย่างไร",
      sit: "ยอดขายหรือคุณภาพงานของทีมลดลงต่อเนื่องสองเดือนโดยไม่ทราบสาเหตุ คุณจะเริ่มวิเคราะห์อย่างไร",
      a1: "แก้ที่อาการ ไม่หาสาเหตุ ตัดสินใจโดยไม่มีข้อมูล", a3: "หาข้อมูลพื้นฐาน ระบุสาเหตุหลักได้ เลือกทางแก้ที่สมเหตุสมผล",
      a5: "แยกปัญหาเป็นส่วน ตรวจสมมติฐานด้วยข้อมูล เปรียบเทียบทางเลือกและความเสี่ยง และวัดผลหลังแก้" },
    plan: { name: "การวางแผนและจัดลำดับงาน", def: "ตั้งเป้าหมาย จัดลำดับความสำคัญ บริหารเวลาและทรัพยากรให้งานเสร็จตามกำหนด",
      beh: "เล่าถึงช่วงที่คุณมีงานหลายอย่างกำหนดส่งพร้อมกัน คุณจัดลำดับอย่างไร และผลเป็นอย่างไร",
      sit: "หัวหน้ามอบงานด่วนใหม่ระหว่างที่คุณกำลังทำงานสำคัญที่ใกล้กำหนดส่ง คุณจะจัดการอย่างไร",
      a1: "ทำตามที่เข้ามาก่อน ไม่มีแผน งานล่าช้าบ่อย", a3: "มีรายการงานและลำดับความสำคัญ ส่งงานตรงเวลาเป็นส่วนใหญ่",
      a5: "วางแผนล่วงหน้าพร้อมแผนสำรอง สื่อสารผลกระทบเมื่อความสำคัญเปลี่ยน และส่งงานตามกำหนดอย่างสม่ำเสมอ" },
    detail: { name: "ความละเอียดรอบคอบ", def: "ทำงานถูกต้อง ตรวจสอบความผิดพลาด และปฏิบัติตามขั้นตอนอย่างสม่ำเสมอ",
      beh: "เล่าถึงครั้งที่คุณพบข้อผิดพลาดที่คนอื่นมองข้าม คุณพบได้อย่างไร และทำอะไรต่อ",
      sit: "คุณพบว่ารายงานที่ส่งให้ลูกค้าไปแล้วมีตัวเลขผิด คุณจะทำอย่างไร",
      a1: "ข้ามการตรวจสอบ ผิดพลาดซ้ำ ไม่แจ้งเมื่อพบข้อผิดพลาด", a3: "ตรวจงานของตนเองตามขั้นตอน ผิดพลาดน้อย แก้ไขเมื่อพบ",
      a5: "สร้างวิธีตรวจที่ป้องกันความผิดพลาด แจ้งและแก้ไขอย่างโปร่งใส และปรับขั้นตอนให้ทั้งทีมใช้" },
    adapt: { name: "การปรับตัวและการเรียนรู้", def: "รับมือการเปลี่ยนแปลง เรียนรู้สิ่งใหม่ได้เร็ว และนำคำติชมไปพัฒนา",
      beh: "เล่าถึงครั้งที่คุณต้องเรียนรู้ทักษะหรือระบบใหม่ในเวลาสั้น ๆ คุณเรียนรู้อย่างไร",
      sit: "บริษัทเปลี่ยนวิธีทำงานที่คุณคุ้นเคยมาหลายปี และคุณเห็นว่าวิธีใหม่มีจุดอ่อน คุณจะทำอย่างไร",
      a1: "ต่อต้านการเปลี่ยนแปลง ไม่ขอคำติชม ใช้วิธีเดิมแม้ไม่ได้ผล", a3: "ปรับตัวได้เมื่อมีคำแนะนำ เรียนรู้สิ่งใหม่ตามที่งานต้องการ",
      a5: "ริเริ่มเรียนรู้ล่วงหน้า ขอคำติชมเอง ทดลองและปรับวิธีอย่างรวดเร็ว และช่วยผู้อื่นปรับตัว" },
    drive: { name: "การมุ่งผลลัพธ์", def: "ตั้งเป้าหมายที่ท้าทาย รับผิดชอบผลงาน และพยายามต่อเนื่องเมื่อเจออุปสรรค",
      beh: "เล่าถึงเป้าหมายที่ท้าทายที่สุดที่คุณทำสำเร็จ คุณเจออุปสรรคอะไร และผ่านมาได้อย่างไร",
      sit: "กลางไตรมาสคุณเห็นว่าจะไม่ถึงเป้า 30% คุณจะทำอะไรบ้าง",
      a1: "ไม่ติดตามผลงานของตนเอง ยอมแพ้เมื่อเจออุปสรรค โทษปัจจัยภายนอก", a3: "ทำงานให้ถึงเป้าที่ได้รับ ติดตามผลเป็นระยะ",
      a5: "ตั้งเป้าที่สูงกว่า วัดผลด้วยตัวเลข ปรับแผนเมื่อเจออุปสรรค และมีผลงานเกินเป้าอย่างต่อเนื่อง" },
    persuade: { name: "การโน้มน้าวและเจรจา", def: "เข้าใจมุมมองอีกฝ่าย เสนอคุณค่าอย่างมีเหตุผล และหาข้อตกลงที่ทั้งสองฝ่ายได้ประโยชน์",
      beh: "เล่าถึงครั้งที่คุณโน้มน้าวลูกค้าหรือผู้มีอำนาจตัดสินใจที่ไม่เห็นด้วยตอนแรก คุณทำอย่างไร",
      sit: "ลูกค้าบอกว่าราคาของคุณแพงกว่าคู่แข่ง 15% คุณจะตอบอย่างไร",
      a1: "กดดันหรือลดราคาทันที ไม่ถามความต้องการ", a3: "อธิบายคุณค่าของสินค้าได้ ตอบข้อโต้แย้งทั่วไปได้",
      a5: "ถามจนเข้าใจเกณฑ์การตัดสินใจของอีกฝ่าย เชื่อมคุณค่ากับความต้องการนั้น และปิดข้อตกลงที่ยั่งยืน" },
    tech: { name: "ความเชี่ยวชาญทางเทคนิค", def: "มีความรู้และทักษะเฉพาะงาน นำไปใช้แก้ปัญหาจริง และอธิบายเหตุผลทางเทคนิคได้",
      beh: "เล่าถึงงานทางเทคนิคที่คุณภูมิใจที่สุด บทบาทของคุณคืออะไร และคุณตัดสินใจทางเทคนิคอย่างไร",
      sit: "ระบบที่คุณดูแลล่มในช่วงที่มีผู้ใช้มากที่สุด คุณจะทำอะไรตามลำดับ",
      a1: "อธิบายพื้นฐานไม่ได้ หรือพึ่งผู้อื่นในงานหลัก", a3: "ทำงานหลักได้ด้วยตนเอง อธิบายเหตุผลของวิธีที่เลือกได้",
      a5: "เลือกวิธีโดยชั่งข้อดีข้อเสีย คาดการณ์ปัญหาล่วงหน้า และถ่ายทอดความรู้ให้ทีม" },
    lead: { name: "ภาวะผู้นำและการพัฒนาคน", def: "กำหนดทิศทาง มอบหมายงาน ให้คำติชม และพัฒนาสมาชิกในทีม",
      beh: "เล่าถึงครั้งที่คุณช่วยให้สมาชิกทีมที่ผลงานต่ำพัฒนาขึ้น คุณทำอะไรบ้าง และผลเป็นอย่างไร",
      sit: "คุณรับทีมใหม่ที่ขวัญกำลังใจต่ำและมีคนลาออกบ่อย คุณจะทำอะไรใน 30 วันแรก",
      a1: "สั่งงานโดยไม่อธิบาย ไม่ให้คำติชม ทำงานแทนลูกทีม", a3: "มอบหมายงานชัดเจน ให้คำติชมเป็นระยะ",
      a5: "สร้างเป้าหมายร่วม มอบหมายตามจุดแข็ง ให้คำติชมเฉพาะเจาะจง และมีหลักฐานว่าสมาชิกเติบโต" },
    integrity: { name: "ความซื่อตรงและความรับผิดชอบ", def: "ทำตามหลักจริยธรรมและข้อตกลง ยอมรับความผิดพลาด และรักษาข้อมูลอย่างเหมาะสม",
      beh: "เล่าถึงครั้งที่คุณทำผิดพลาดในงาน คุณจัดการและสื่อสารเรื่องนั้นอย่างไร",
      sit: "คุณเห็นเพื่อนร่วมงานบันทึกข้อมูลไม่ตรงกับความจริงเพื่อให้ตัวเลขดูดี คุณจะทำอย่างไร",
      a1: "ปกปิดความผิดพลาด หรือละเลยเรื่องที่ขัดหลักจริยธรรม", a3: "ยอมรับความผิดพลาดเมื่อถูกถาม ทำตามกฎที่ชัดเจน",
      a5: "แจ้งความผิดพลาดเองอย่างรวดเร็ว เสนอทางแก้ และยึดหลักจริยธรรมแม้ไม่มีใครเห็น" }
  };
  var COMP_IDS = Object.keys(COMPETENCIES);

  var ROLES = {
    sales: { name: "งานขาย", comps: ["persuade", "customer", "drive", "comm", "adapt"] },
    service: { name: "งานบริการลูกค้า", comps: ["customer", "comm", "problem", "team", "adapt"] },
    admin: { name: "งานธุรการ/สนับสนุน", comps: ["detail", "plan", "comm", "team", "integrity"] },
    tech: { name: "งานเทคนิค/ไอที", comps: ["tech", "problem", "adapt", "team", "detail"] },
    manager: { name: "หัวหน้างาน/ผู้จัดการ", comps: ["lead", "plan", "drive", "comm", "problem", "integrity"] },
    custom: { name: "กำหนดเอง", comps: [] }
  };

  var STAR_PROBES = [
    { id: "s", th: "สถานการณ์: ตอนนั้นเกิดอะไรขึ้น ที่ไหน เมื่อไร" },
    { id: "t", th: "งาน: หน้าที่หรือเป้าหมายของคุณคืออะไร" },
    { id: "a", th: "การกระทำ: คุณเองทำอะไรบ้าง (ไม่ใช่ทีม) ทำไมจึงเลือกทำแบบนั้น" },
    { id: "r", th: "ผลลัพธ์: ผลเป็นอย่างไร วัดได้อย่างไร และได้เรียนรู้อะไร" }
  ];

  var BIASES = [
    { id: "halo", name: "ฮาโล/ฮอร์น", tip: "จุดเด่นหรือจุดด้อยเรื่องเดียวทำให้ให้คะแนนทุกด้านสูงหรือต่ำตาม — ให้คะแนนทีละสมรรถนะจากหลักฐานของสมรรถนะนั้นเท่านั้น" },
    { id: "similar", name: "ความเหมือนตัวเรา", tip: "ชอบผู้สมัครที่มีพื้นเพ สถาบัน หรืองานอดิเรกเหมือนเรา — ถามตัวเองว่าคะแนนมาจากพฤติกรรมที่เกี่ยวกับงานหรือไม่" },
    { id: "first", name: "ความประทับใจแรก", tip: "ตัดสินใน 1–2 นาทีแรกแล้วหาหลักฐานมายืนยัน — เลื่อนการให้คะแนนไปจนจบคำถามของแต่ละสมรรถนะ" },
    { id: "contrast", name: "การเปรียบเทียบกับคนก่อนหน้า", tip: "ผู้สมัครดูดีหรือแย่เพราะคนก่อนหน้า — เทียบกับเกณฑ์ BARS ไม่ใช่กับผู้สมัครคนอื่น" },
    { id: "central", name: "ให้คะแนนกลาง ๆ หรือใจดีเกินไป", tip: "ให้ 3 ทุกข้อหรือให้สูงทุกข้อ — ใช้คำบรรยายพฤติกรรมในแต่ละระดับเป็นหลัก" },
    { id: "style", name: "ลักษณะการนำเสนอ", tip: "สำเนียง การสบตา ท่าทาง หรือความประหม่าไม่ได้บอกความสามารถ และแตกต่างตามวัฒนธรรมและความพิการ — ให้คะแนนจากเนื้อหาคำตอบ" }
  ];

  /* Thailand — questions to avoid (not legal advice; the controller's HR/legal team should confirm) */
  var LAW = [
    { id: "religion", topic: "ศาสนาและความเชื่อ", alt: "ถ้างานมีตารางเวรวันหยุด: \"งานนี้มีเวรวันเสาร์–อาทิตย์ตามตารางนี้ คุณทำได้หรือไม่\"", ref: "PDPA ม.26 · รัฐธรรมนูญ ม.27" },
    { id: "marital", topic: "สถานภาพสมรส คู่ครอง การมีบุตรหรือแผนมีบุตร", alt: "\"งานนี้ต้องเดินทาง/ทำงานล่วงเวลาตามที่ระบุ คุณทำได้หรือไม่\"", ref: "พ.ร.บ.ความเท่าเทียมระหว่างเพศ 2558 · พ.ร.บ.คุ้มครองแรงงาน ม.15" },
    { id: "pregnancy", topic: "การตั้งครรภ์", alt: "ไม่ถาม — อธิบายลักษณะงานและให้ผู้สมัครแจ้งความต้องการปรับสภาพงานเอง", ref: "พ.ร.บ.คุ้มครองแรงงาน ม.15, ม.43" },
    { id: "age", topic: "อายุ ปีเกิด ปีที่จบการศึกษา", alt: "ถ้ามีข้อกำหนดตามกฎหมาย: \"คุณมีอายุครบตามที่กฎหมายกำหนดสำหรับงานนี้หรือไม่\"", ref: "รัฐธรรมนูญ ม.27 · พ.ร.บ.คุ้มครองแรงงาน ม.44 (อายุขั้นต่ำ)" },
    { id: "gender", topic: "เพศ อัตลักษณ์ทางเพศ รสนิยมทางเพศ", alt: "ไม่ถาม — ใช้คำถามสมรรถนะเดียวกันกับผู้สมัครทุกคน", ref: "พ.ร.บ.ความเท่าเทียมระหว่างเพศ 2558 · PDPA ม.26" },
    { id: "origin", topic: "เชื้อชาติ ชาติพันธุ์ สัญชาติ ภูมิลำเนา", alt: "\"คุณมีสิทธิทำงานในประเทศไทยสำหรับตำแหน่งนี้หรือไม่\"", ref: "PDPA ม.26 · รัฐธรรมนูญ ม.27" },
    { id: "health", topic: "สุขภาพ โรคประจำตัว ความพิการ", alt: "\"คุณทำหน้าที่หลักเหล่านี้ได้หรือไม่ ทั้งแบบมีหรือไม่มีการปรับสภาพแวดล้อมการทำงาน\"", ref: "พ.ร.บ.ส่งเสริมและพัฒนาคุณภาพชีวิตคนพิการ 2550 ม.15 · PDPA ม.26" },
    { id: "politics", topic: "ความคิดเห็นทางการเมือง การเป็นสมาชิกสหภาพแรงงาน", alt: "ไม่ถาม", ref: "PDPA ม.26 · พ.ร.บ.แรงงานสัมพันธ์" },
    { id: "criminal", topic: "ประวัติอาชญากรรม", alt: "ถามเฉพาะเมื่อลักษณะงานและกฎหมายกำหนด และแจ้งวัตถุประสงค์/ขอความยินยอมตาม PDPA", ref: "PDPA ม.26" },
    { id: "appearance", topic: "รูปร่าง หน้าตา น้ำหนัก ส่วนสูง (ที่ไม่เกี่ยวกับงาน)", alt: "ถ้างานมีข้อกำหนดทางกายภาพจริง ให้ถามถึงความสามารถทำงานนั้น", ref: "รัฐธรรมนูญ ม.27" },
    { id: "family", topic: "อาชีพหรือฐานะของพ่อแม่ คู่สมรส ภาระครอบครัว", alt: "ไม่ถาม", ref: "รัฐธรรมนูญ ม.27" }
  ];

  /* ---------- small stats ---------- */
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function mean(a) { if (!a.length) return null; var t = 0; a.forEach(function (v) { t += v; }); return t / a.length; }
  function sd(a) { if (a.length < 2) return 0; var m = mean(a), t = 0; a.forEach(function (v) { t += (v - m) * (v - m); }); return Math.sqrt(t / (a.length - 1)); }
  var r2 = function (v) { return v == null ? null : Math.round(v * 100) / 100; };
  var validScore = function (v) { return typeof v === "number" && isFinite(v) && v >= 1 && v <= 5 && Math.round(v) === v; };

  /* ---------- aggregation of independent ratings ---------- */
  function aggregate(sheets, compIds) {
    sheets = (sheets || []).filter(Boolean);
    var comps = (compIds || []).map(function (id) {
      var rows = [];
      sheets.forEach(function (s) {
        var v = s.scores ? s.scores[id] : null;
        var note = s.notes && typeof s.notes[id] === "string" ? s.notes[id].trim() : "";
        if (validScore(v) || note) rows.push({ who: String(s.who || ""), score: validScore(v) ? v : null, note: note });
      });
      var vals = rows.filter(function (r) { return r.score != null; }).map(function (r) { return r.score; });
      var mn = vals.length ? Math.min.apply(null, vals) : null, mx = vals.length ? Math.max.apply(null, vals) : null;
      var range = vals.length ? mx - mn : null;
      var agree = vals.length < 2 ? null : range <= 1 ? "high" : range === 2 ? "some" : "low";
      return { id: id, scores: rows, n: vals.length, mean: r2(mean(vals)), median: median(vals), min: mn, max: mx, range: range, sd: r2(sd(vals)), agree: agree };
    });
    var rated = comps.filter(function (c) { return c.n > 0; });
    var multi = comps.filter(function (c) { return c.agree != null; });
    var overall = {
      n: sheets.length, rated: rated.length,
      mean: r2(mean(rated.map(function (c) { return c.mean; }))),
      agreePct: multi.length ? Math.round(multi.filter(function (c) { return c.agree === "high"; }).length / multi.length * 100) : null
    };
    return {
      comps: comps, overall: overall,
      strengths: rated.filter(function (c) { return c.mean >= 4 && c.agree !== "low"; }).map(function (c) { return c.id; }),
      develop: rated.filter(function (c) { return c.mean <= 2.5 && c.agree !== "low"; }).map(function (c) { return c.id; }),
      discuss: comps.filter(function (c) { return c.agree === "low"; }).map(function (c) { return c.id; })
    };
  }

  /* ---------- exchange one interviewer's sheet between devices (text, no images, no candidate name) ---------- */
  function exportSheet(sheet, meta) {
    var out = { kind: "lensiq-interview-sheet", v: 1, who: String(sheet.who || "").slice(0, 40), role: meta && meta.role || null, scores: {}, notes: {} };
    Object.keys(sheet.scores || {}).forEach(function (k) { if (validScore(sheet.scores[k])) out.scores[k] = sheet.scores[k]; });
    Object.keys(sheet.notes || {}).forEach(function (k) { var t = String(sheet.notes[k] || "").trim(); if (t) out.notes[k] = t.slice(0, 2000); });
    return JSON.stringify(out);
  }
  function importSheet(text, compIds) {
    var o;
    try { o = JSON.parse(String(text || "")); } catch (e) { throw new Error("bad-json"); }
    if (!o || o.kind !== "lensiq-interview-sheet" || o.v !== 1) throw new Error("bad-kind");
    var allow = compIds && compIds.length ? compIds : COMP_IDS, s = { who: String(o.who || "").replace(/[<>]/g, "").trim().slice(0, 40), scores: {}, notes: {} };
    if (!s.who) throw new Error("no-who");
    allow.forEach(function (k) {
      if (o.scores && validScore(o.scores[k])) s.scores[k] = o.scores[k];
      if (o.notes && typeof o.notes[k] === "string" && o.notes[k].trim()) s.notes[k] = o.notes[k].trim().slice(0, 2000);
    });
    return s;
  }

  /* ---------- energy VAD (no speech content: only one dB number per frame is kept, in memory) ---------- */
  function rmsDb(x) {
    var t = 0; for (var i = 0; i < x.length; i++) t += x[i] * x[i];
    var r = Math.sqrt(t / (x.length || 1));
    return r > 1e-6 ? Math.max(-120, 20 * Math.log10(r)) : -120;
  }
  function createVad(opts) {
    var o = Object.assign({ marginDb: 10, minDb: -62, hangMs: 250, minSpeechMs: 120, minPauseMs: 500, longPauseMs: 2000, peakDb: 3, peakGapMs: 120, riseDbPerSec: 2 }, opts || {});
    var st;
    function reset() { st = { floor: null, t0: null, last: null, inSp: false, spStart: 0, lastVoice: 0, segs: [], peaks: 0, lastPeak: -1e9, hist: [] }; }
    reset();
    function close(tEnd) {
      var len = tEnd - st.spStart;
      if (len >= o.minSpeechMs) st.segs.push([st.spStart, tEnd]);
      st.inSp = false;
    }
    function push(db, t) {
      if (st.t0 == null) { st.t0 = t; st.floor = db; }
      var dt = st.last == null ? 0 : Math.max(0, t - st.last); st.last = t;
      // noise floor: follows quiet frames down at once, rises slowly (speech does not drag it up)
      if (db < st.floor) st.floor = db; else st.floor = Math.min(db, st.floor + o.riseDbPerSec * dt / 1000);
      var thr = Math.max(st.floor + o.marginDb, o.minDb), voiced = db >= thr;
      if (voiced) {
        if (!st.inSp) { st.inSp = true; st.spStart = t; }
        st.lastVoice = t;
      } else if (st.inSp && t - st.lastVoice > o.hangMs) close(st.lastVoice + Math.min(o.hangMs, 60));
      // syllable-like energy peaks (local maximum ≥ peakDb above the dips around it), only inside voiced frames
      // dip = lowest level since the last counted peak; a peak must rise peakDb above it
      var h = st.hist; h.push([t, db, voiced]); if (h.length > 3) h.shift();
      if (h.length === 3 && h[1][2] && h[1][1] > h[0][1] && h[1][1] >= h[2][1] && st.dip != null &&
          h[1][1] - st.dip >= o.peakDb && h[1][0] - st.lastPeak >= o.peakGapMs) { st.peaks++; st.lastPeak = h[1][0]; st.dip = db; }
      st.dip = st.dip == null ? db : Math.min(st.dip, db);
      return voiced;
    }
    function result() {
      var segs = st.segs.slice();
      if (st.inSp && st.last - st.spStart >= o.minSpeechMs) segs.push([st.spStart, st.last]);
      var ms = st.t0 == null ? 0 : st.last - st.t0, speechMs = 0, pauses = [], runs = [];
      segs.forEach(function (s, i) {
        speechMs += s[1] - s[0]; runs.push(s[1] - s[0]);
        if (i) { var g = s[0] - segs[i - 1][1]; if (g >= o.minPauseMs) pauses.push(g); }
      });
      var longP = pauses.filter(function (g) { return g >= o.longPauseMs; }).length;
      return {
        ms: ms, speechMs: speechMs, share: ms > 0 ? Math.min(1, speechMs / ms) : 0, segments: segs.length,
        pauses: pauses.length, longPauses: longP,
        pausesPerMin: speechMs > 0 ? Math.round(pauses.length / ((ms || 1) / 60000) * 10) / 10 : 0,
        meanPauseMs: pauses.length ? Math.round(mean(pauses)) : 0, meanRunMs: runs.length ? Math.round(mean(runs)) : 0,
        peaks: st.peaks, peakRate: speechMs >= 3000 ? Math.round(st.peaks / (speechMs / 1000) * 10) / 10 : null
      };
    }
    return { push: push, result: result, reset: reset, get floor() { return st.floor; } };
  }

  /* ---------- head orientation from 68 landmarks (proxy for "looking toward the camera", NOT eye tracking) ---------- */
  function poseOf(p) {
    if (!p || p.length < 68) return null;
    var c = function (a) { var x = 0, y = 0; for (var k = a; k < a + 6; k++) { x += p[k][0]; y += p[k][1]; } return [x / 6, y / 6]; };
    var L = c(36), R = c(42), ipd = Math.hypot(R[0] - L[0], R[1] - L[1]);
    if (!(ipd > 1)) return null;
    var th = Math.atan2(R[1] - L[1], R[0] - L[0]), cs = Math.cos(-th), sn = Math.sin(-th), m = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2];
    var al = function (q) { var dx = q[0] - m[0], dy = q[1] - m[1]; return [(dx * cs - dy * sn) / ipd, (dx * sn + dy * cs) / ipd]; };
    var nose = al(p[30]), jl = al(p[1]), jr = al(p[15]), chin = al(p[8]);
    var dl = Math.abs(nose[0] - jl[0]), dr = Math.abs(jr[0] - nose[0]);
    return { yaw: (dl - dr) / ((dl + dr) || 1), pitch: chin[1] > 0 ? nose[1] / chin[1] : 0, cx: m[0], cy: m[1], ipd: ipd };
  }
  function gazeMetrics(samples, opts) {
    var o = Object.assign({ yawT: 0.2, pitchT: 0.1 }, opts || {});
    samples = samples || [];
    var faces = samples.filter(function (s) { return s.face; });
    var pm = median(faces.map(function (s) { return s.pitch; }).filter(function (v) { return typeof v === "number"; }));
    var toward = faces.filter(function (s) { return Math.abs(s.yaw || 0) <= o.yawT && (pm == null || Math.abs((s.pitch || 0) - pm) <= o.pitchT); }).length;
    var moved = 0, secs = 0;
    for (var i = 1; i < samples.length; i++) {
      var a = samples[i - 1], b = samples[i];
      if (!a.face || !b.face || !(b.t > a.t) || b.t - a.t > 1500) continue;
      moved += Math.hypot(b.cx - a.cx, b.cy - a.cy) / ((a.ipd + b.ipd) / 2 || 1); secs += (b.t - a.t) / 1000;
    }
    var movement = secs > 0 ? Math.round(moved / secs * 100) / 100 : null; // IPD per second
    return {
      n: samples.length, facePct: samples.length ? Math.round(faces.length / samples.length * 100) : 0,
      towardPct: faces.length ? Math.round(toward / faces.length * 100) : 0, movement: movement,
      movementBand: movement == null ? null : movement < 0.15 ? "low" : movement < 0.5 ? "mid" : "high"
    };
  }

  /* ---------- practice mode: self-coaching tips (descriptive; key iv.tip.<id>) ---------- */
  function practiceTips(d, g) {
    var out = [];
    if (g && g.n >= 5) {
      if (g.facePct < 70) out.push({ id: "frame", level: "tip", vars: { p: g.facePct } });
      else if (g.towardPct < 50) out.push({ id: "lookCam", level: "tip", vars: { p: g.towardPct } });
      else out.push({ id: "lookOk", level: "good", vars: { p: g.towardPct } });
      if (g.movementBand === "high") out.push({ id: "steady", level: "tip", vars: {} });
    }
    if (d && d.ms >= 10000) {
      if (d.share < 0.25) out.push({ id: "more", level: "tip", vars: { p: Math.round(d.share * 100) } });
      if (d.longPauses >= 3) out.push({ id: "longPause", level: "tip", vars: { n: d.longPauses } });
      else if (d.pauses >= 1) out.push({ id: "pauseOk", level: "good", vars: { n: d.pauses } });
      if (d.meanRunMs > 25000) out.push({ id: "breathe", level: "tip", vars: { s: Math.round(d.meanRunMs / 1000) } });
      if (d.peakRate != null && d.peakRate > 6.5) out.push({ id: "slow", level: "tip", vars: { r: d.peakRate } });
    }
    if (!out.length) out.push({ id: "short", level: "tip", vars: {} });
    return out;
  }

  /* ---------- who may see delivery numbers (candidate-first) ----------
     orgAllowed(org): the organisation setting counts only with all three acknowledgements (DPIA done; candidates can
       decline without consequence and get another format; never used for scoring) AND the switch itself.
     deliveryView({org, delivery, submitted}) ->
       'none'        no numbers (never measured, or the candidate discarded them)
       'candidate'   default: only the candidate sees them (candidate view / "my feedback" card)
       'pending'     the organisation allows interviewer viewing, but not every interviewer has submitted scores yet
       'interviewer' allowed, every sheet submitted (a "show summary now" override does NOT count) */
  function orgAllowed(org) { return !!(org && org.allow === true && org.ack1 === true && org.ack2 === true && org.ack3 === true); }
  function deliveryView(o) {
    o = o || {};
    if (!o.delivery || o.delivery.discarded) return "none";
    if (!orgAllowed(o.org)) return "candidate";
    return o.submitted === true ? "interviewer" : "pending";
  }

  /* ---------- test seam: 68 frontal-ish landmarks inside a box, nose shifted for yaw ---------- */
  function synthPts(box, yaw) {
    var w = box.w != null ? box.w : box.width, h = box.h != null ? box.h : box.height, y = yaw || 0, u = [], i;
    for (i = 0; i <= 16; i++) u.push([0.5 - 0.46 * Math.cos(Math.PI * i / 16), 0.35 + 0.6 * Math.sin(Math.PI * i / 16)]);
    for (i = 0; i < 10; i++) u.push([i < 5 ? 0.15 + i * 0.0675 : 0.58 + (i - 5) * 0.0675, 0.28]);
    for (i = 0; i < 4; i++) u.push([0.5 + y * 0.3 * (i + 1) / 4, 0.38 + i * 0.075]);
    for (i = 0; i < 5; i++) u.push([0.42 + i * 0.04 + y * 0.25, 0.65]);
    var ring = function (cx, cy, rx, ry, k) { var r = []; for (var j = 0; j < k; j++) { var t = j * 2 * Math.PI / k; r.push([cx - rx * Math.cos(t), cy - ry * Math.sin(t)]); } return r; };
    u = u.concat(ring(0.32, 0.4, 0.07, 0.025, 6), ring(0.68, 0.4, 0.07, 0.025, 6), ring(0.5 + y * 0.2, 0.8, 0.15, 0.05, 12), ring(0.5 + y * 0.2, 0.8, 0.1, 0.015, 8));
    return u.map(function (q) { return [box.x + q[0] * w, box.y + q[1] * h]; });
  }

  var IVCore = {
    COMPETENCIES: COMPETENCIES, COMP_IDS: COMP_IDS, ROLES: ROLES, STAR_PROBES: STAR_PROBES, BIASES: BIASES, LAW: LAW,
    aggregate: aggregate, exportSheet: exportSheet, importSheet: importSheet, validScore: validScore,
    rmsDb: rmsDb, createVad: createVad, poseOf: poseOf, gazeMetrics: gazeMetrics, practiceTips: practiceTips, synthPts: synthPts,
    orgAllowed: orgAllowed, deliveryView: deliveryView,
    median: median, mean: mean, sd: sd
  };
  if (typeof module !== "undefined" && module.exports) module.exports = IVCore;
  root.IVCore = IVCore;
})(typeof window !== "undefined" ? window : globalThis);
