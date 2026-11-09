# ชุดนำร่องภาคสนาม: LENSIQ Exam (ห้องสอบ / ห้องคอมพิวเตอร์) / Field pilot kit: LENSIQ Exam

> **สถานะ:** ฉบับร่าง round 16 (2026-11-09) ตามแผนทั่วไปใน [`docs/PILOT-PLAN.md`](../PILOT-PLAN.md) และรูปแบบของ
> [`docs/FIELD-PILOT.md`](../FIELD-PILOT.md) เกณฑ์ทุกข้อเป็น **ข้อเสนอให้เจ้าของปรับ** ข้อกฎหมายรอทนายตรวจ (`docs/EXAM.md` "Legal guardrails")
> **Status:** round 16 draft. Thresholds are a **proposal for the owner**; legal points await counsel. English: second half.

---

# ภาษาไทย

## 1. เป้าหมายและสิ่งที่ไม่ใช่เป้าหมาย

วัดว่า "ข้อสังเกต" ที่ LENSIQ Exam แจ้งผู้คุมสอบ **ถูกกี่ครั้ง** (ไปดูแล้วเห็นตามที่ระบบบอก เช่น มีโทรศัพท์จริง) **พลาดกี่ครั้ง**
(ในการสอบจำลองที่รู้คำตอบ) และ **ไม่ยุติธรรมกับใครหรือไม่** (แสงน้อย ผิวคล้ำ ผู้ที่ได้รับการปรับการสอบ) วันนี้ทุกตัวเลข
**ยังไม่ได้วัด** (`docs/EXAM.md` "Accuracy — not measured yet")

ไม่ใช่เป้าหมาย: ตัดสินว่าใครทุจริต (ข้อสังเกต ≠ การทุจริต ผู้คุมสอบตัดสินเสมอ) · ไม่มีการวิเคราะห์อารมณ์หรือสีหน้า ·
ไม่มีการจดจำใบหน้า · ไม่มีคะแนน "ความน่าสงสัย" · ไม่บังคับสแกนห้อง

## 2. สามขั้นตอน

| ขั้น | อะไร | ผู้เข้าร่วม | ผลที่ได้ |
|---|---|---|---|
| **ขั้น 0: ตรวจกล้องและแสง** | ผู้ร่วมทดสอบที่ยินยอม นั่งตามที่นั่งจริงในสภาพแสงต่าง ๆ | อาสาสมัครผู้ใหญ่ ≥ 10 คน (เจ้าหน้าที่/นักศึกษาที่ยินยอม) | อัตราที่ระบบหาใบหน้าไม่เจอ แยกตามแสง (ดี/พอใช้/แย่ ตามคำตัดสินแสงของหน้าเว็บ) และกลุ่มสีผิวที่ผู้ร่วม **เลือกระบุเอง** (Monk Skin Tone 10 ระดับ ไม่บังคับ) |
| **ขั้น 1: การสอบจำลองตามบท** | อาสาสมัครทำตามบทที่เขียนไว้ล่วงหน้า (§5.1) โดยผู้บันทึกจดเวลาจริง | ชุดเดียวกับขั้น 0 | อัตราที่ระบบแจ้งเหตุตามบท (recall) และข้อสังเกตที่เกินบท (false flag) ต่อข้อสังเกต |
| **ขั้น 2: การสอบจริง** | ใช้ระหว่างสอบจริง ผู้คุมสอบกด "แจ้งถูก/แจ้งผิด" ในแดชบอร์ด และจดเหตุที่ระบบไม่ได้แจ้งในแผ่น "เหตุที่ระบบไม่ได้แจ้ง" | ผู้สอบที่รับทราบประกาศและยินยอม ห้องละ 20–40 คน อย่างน้อย 3 ห้อง/รอบสอบ | ความแม่นยำต่อข้อสังเกต (Wilson 95%) เวลาตอบสนอง ความเห็นผู้สอบ |

### รูปแบบที่ใช้

- **โหมด A ห้องสอบที่มีกล้อง** (`exam-hall.html` + `exam-dashboard.html`): **แนะนำสำหรับนำร่อง** เปิดกล้องและแดชบอร์ดในเบราว์เซอร์
  เดียวกัน (คนละแท็บ) บนเครื่องเดียว แต่ละเครื่องดูได้ 1 มุมกล้อง ห้องใหญ่ใช้ 2–3 เครื่อง แต่ละเครื่องมีแดชบอร์ดของตัวเอง
- **โหมด B ห้องคอมพิวเตอร์** (`exam-lab.html`): เครื่องผู้สอบแต่ละเครื่องเก็บบันทึกของตัวเอง **ยังส่งสดไปแดชบอร์ดของผู้คุมสอบข้ามเครื่องไม่ได้**
  (ยังไม่มีปลายทาง relay `/api/exam/push`, `docs/EXAM.md`) หลังสอบให้ส่งออกไฟล์ JSON จากแต่ละเครื่องแล้วนำเข้าแดชบอร์ด
  ผู้คุมสอบตรวจย้อนหลังกับบันทึกของตัวเอง ข้อนี้ต้องแจ้งไซต์ก่อนเลือกโหมด B
- **คลิปหลักฐาน** ปิดเป็นค่าเริ่มต้น ในนำร่องนี้ **ไม่เปิด** เว้นแต่ไซต์ขอเป็นหนังสือ และประกาศผู้สอบระบุไว้แล้ว (`docs/EXAM.md` "Evidence clip")

## 3. ตารางเวลา (ต่อสถาบัน)

| วัน | งาน | ผลที่ได้ |
|---|---|---|
| −14 ถึง −8 | ลงนามสัญญานำร่อง ขออนุญาตผู้บริหารสถาบัน เลือกรอบสอบ (ไม่ใช่การสอบชี้ขาดสูง เช่น สอบย่อย/กลางภาค) ทำ DPIA เพิ่มเติม | สัญญา รายการรอบสอบ |
| −7 | ประกาศผู้สอบ (`exam.html#notice` พิมพ์ได้ 3 ภาษา) อย่างน้อย 7 วันก่อนสอบ พร้อมทางเลือกสำหรับผู้ไม่ยินยอม | ประกาศ + ช่องทางติดต่อ |
| −5 | ขั้น 0 + ขั้น 1 (2–3 ชม.) ในห้องจริง ช่วงเวลาและแสงเดียวกับวันสอบ | แผ่นบท + ผลส่งออก |
| −4 | อบรมผู้คุมสอบ 1 ชม.: ข้อสังเกต ≠ การทุจริต ทุกการกระทำต้องใส่ชื่อ "แจ้งถูก/แจ้งผิด" หมายถึงอะไร แผ่นเหตุที่ระบบไม่ได้แจ้ง | รายชื่อผู้ผ่านการอบรม |
| วันสอบ (≥ 3 ห้อง) | ตั้งกล้อง ตรวจแสง (ถ้าแสง "แย่" ให้แก้ก่อน ไม่ใช่แจ้งเหตุ) คุมสอบตามปกติ กดแจ้งถูก/ผิดทุกข้อสังเกตที่ไปดู | CSV + รายงานพิมพ์จากแดชบอร์ด แผ่นเหตุที่พลาด |
| +1 | แบบสอบถามผู้สอบ (1–5 "ยุติธรรมและเข้าใจ") และผู้คุมสอบ | แบบสอบถาม |
| +3 | รวมผล ประชุมสรุป ลงนาม | แบบสรุปผล |
| +14 | ลบไฟล์ส่งออกที่มีชื่อผู้คุมสอบ/ที่นั่ง ตามตารางเก็บรักษา (ถ้าไซต์ไม่เก็บเป็นเอกสารของตนเอง) | บันทึกการลบ |

## 4. สิ่งที่เจ้าของต้องเตรียมที่ไซต์

| รายการ | รายละเอียด | ใครจัดหา |
|---|---|---|
| สถาบัน 1 แห่ง | โรงเรียน มหาวิทยาลัย สถาบันกวดวิชา หรือศูนย์อบรม ที่ยอมให้ใช้ในรอบสอบที่ไม่ชี้ขาดสูง | เจ้าของ (ติดต่อ) |
| หนังสืออนุญาต | ผู้บริหารสถาบันอนุมัติ ระบุรอบสอบ ห้อง และว่าไม่มีการบันทึกวิดีโอ | สถาบัน |
| ห้อง | อย่างน้อย 3 ห้อง (1 ห้องคอมพิวเตอร์ถ้าทดสอบโหมด B) | สถาบัน |
| อุปกรณ์โหมด A | โน้ตบุ๊ก/มือถือ 1–3 เครื่องต่อห้อง ขาตั้งสูง ≥ 2 ม. หรือติดผนังด้านหน้า สายไฟ ห้ามเครือข่ายภายนอกไม่จำเป็น | เจ้าของ |
| อุปกรณ์โหมด B | เครื่องในห้องคอมพิวเตอร์ที่มีเว็บแคม Chrome/Edge รุ่นใหม่ | สถาบัน |
| แสง | ไฟหน้าห้องเปิด หลีกเลี่ยงหน้าต่างหลังผู้สอบ (ย้อนแสง) | สถาบัน |
| ผู้คุมสอบ | ผู้คุมสอบตามปกติ ห้องละ 1–2 คน อบรม 1 ชม. ระบุชื่อในแดชบอร์ด | สถาบัน |
| อาสาสมัครขั้น 0–1 | ผู้ใหญ่ ≥ 10 คน ยินยอมเป็นหนังสือ ไม่ใช่ผู้สอบจริงในรอบที่วัดผล | เจ้าของ + สถาบัน |
| ผู้บันทึกบท | 1 คน จดเวลาจริงของแต่ละเหตุในบท (ขั้น 1) | เจ้าของ |
| ประกาศและความยินยอม | `exam.html#notice` (พิมพ์) + ช่องทางให้ผู้ไม่ยินยอมสอบโดยไม่เปิดกล้อง | สถาบันพิมพ์/ประกาศ |
| ที่เก็บข้อมูล | โฟลเดอร์เข้ารหัสสำหรับ CSV/JSON ที่ส่งออก | เจ้าของ |

## 5. แผ่นบันทึก

### 5.1 แผ่นบทการสอบจำลอง (ขั้น 1)

เขียนบทก่อนเริ่ม ห้ามแก้หลังเห็นผล แต่ละเหตุทำ 3 ครั้งต่ออาสาสมัคร กระจายที่นั่งทั่วห้อง

| ลำดับ | ที่นั่ง | เวลาเริ่ม (นาฬิกาผู้บันทึก) | เหตุตามบท | นาน (วินาที) | ระบบแจ้ง (ใช่/ไม่ใช่) | ข้อสังเกตที่ระบบแจ้ง | หมายเหตุ |
|---|---|---|---|---|---|---|---|
| ตัวอย่าง | A3 | 10:04:10 | ถือโทรศัพท์ให้เห็นบนโต๊ะ | 10 | | | |
| ตัวอย่าง | B1 | 10:06:00 | ลุกออกจากที่นั่ง | 20 | | | |

เหตุที่ใช้ (ตรงกับข้อสังเกตเชิงวัตถุใน `LQExam`): โทรศัพท์/หนังสือในภาพ · มีใบหน้าที่สองในกรอบ · ไม่เห็นใบหน้า ≥ 5 วินาที ·
หันศีรษะไปด้านข้างนาน · ลุกจากที่นั่ง / ที่นั่งว่าง · เอนไปที่นั่งข้าง ๆ · (โหมด B) ออกจากเต็มจอ / สลับหน้าต่าง
**ห้ามใส่เหตุที่เป็นอารมณ์หรือสีหน้า**

### 5.2 แผ่นเหตุที่ระบบไม่ได้แจ้ง (ขั้น 2)

| เวลา | ห้อง | ที่นั่ง | สิ่งที่ผู้คุมสอบเห็น (ข้อเท็จจริง ไม่ใช่ข้อสรุป) | ระบบแจ้งหรือไม่ | ชื่อผู้คุมสอบ |
|---|---|---|---|---|---|

### 5.3 แผ่นตรวจกล้องและแสง (ขั้น 0)

| ที่นั่ง | คำตัดสินแสงของหน้าเว็บ (ดี/พอใช้/แย่) | กลุ่มสีผิวที่ผู้ร่วมเลือกระบุเอง (ไม่บังคับ, Monk 1–10) | หาใบหน้าเจอ (จำนวนวินาทีที่เจอ / ทั้งหมด) | หมายเหตุ |
|---|---|---|---|---|

กลุ่มสีผิวเป็นข้อมูลอ่อนไหว: เก็บเฉพาะเมื่อผู้ร่วมยินยอมเป็นหนังสือ รายงานแบบรวมกลุ่มเท่านั้น (ไม่ผูกชื่อ) และลบหลังรายงาน
ให้ทนายยืนยันฐานกฎหมาย (PDPA ม.26) ก่อนเก็บ ถ้ายังไม่ได้ความเห็น ให้รายงานแยกตามแสงอย่างเดียว

## 6. ตัวชี้วัดและเป้า (ข้อเสนอ)

| ตัวชี้วัด | เป้า | ขั้น |
|---|---|---|
| หาใบหน้าเจอเมื่อแสง "ดี" | ≥ 98% ของวินาที ทุกกลุ่มที่รายงาน | 0 |
| ช่องว่างระหว่างกลุ่ม (แสงหรือสีผิว) | ≤ 5 จุด ถ้าเกิน = ห้ามใช้ข้อสังเกต "ไม่เห็นใบหน้า" ในสภาพนั้นจนกว่าจะแก้ | 0 |
| แจ้งเหตุตามบท (recall) ต่อข้อสังเกต | โทรศัพท์ในภาพ ≥ 80% · ที่นั่งว่าง ≥ 95% · ใบหน้าที่สอง ≥ 90% · (B) ออกจากเต็มจอ 100% | 1 |
| ข้อสังเกตเกินบท ต่อผู้ร่วม-ชั่วโมง | ≤ 1 | 1 |
| ความแม่นยำ "แจ้งถูก" ต่อข้อสังเกต (ระดับ Check) | ≥ 70% ขอบล่าง Wilson 95% (ข้อสังเกตที่มี ≥ 20 ครั้ง) | 2 |
| เหตุที่ผู้คุมสอบเห็นแต่ระบบไม่ได้แจ้ง | รายงาน (ไม่ตั้งเกณฑ์รอบแรก) | 2 |
| เวลาตอบสนองของผู้คุมสอบ (มัธยฐาน) | ≤ 60 วินาที | 2 |
| ผู้สอบเห็นว่า "ยุติธรรมและเข้าใจ" (1–5) | ≥ 4.0 | 2 |
| ผู้ไม่ยินยอมได้สอบตามทางเลือก | 100% | 2 |

หมายเหตุ (รอเจ้าของตัดสินใจ): เกณฑ์ "ขอบล่าง Wilson 95% ≥ 70%" ต้องเห็นแจ้งถูกจริง 19 / 20 = 95% ที่ 20 ครั้ง, 34 / 40 = 85%
ที่ 40 ครั้ง, 49 / 60 = 81.7% ที่ 60 ครั้ง, 79 / 100 = 79% ที่ 100 ครั้ง ข้อสังเกตที่มีน้อยจึงผ่านยาก เลือกก่อนเริ่มขั้น 2 ว่าจะคงไว้
หรือตัดสินด้วยค่าที่เห็นจริงพร้อมรายงานช่วง 95%
| ข้อร้องเรียนที่ยังไม่ได้แก้ | 0 | 2 |
| ข้อสังเกตถูกนำไปตัดสินโดยไม่มีผู้คุมสอบตรวจ | **0** | 2 |

ผลลัพธ์: **ผ่าน** = ทุกข้อผ่าน → ใช้ราคา "หลังนำร่อง" (`docs/PRICING-RESEARCH.md` §3.1) และเขียนตัวเลขลง `docs/EXAM.md` พร้อม n และ
"ที่มา: หน้างานจริง" · **ผ่านแบบมีเงื่อนไข** = ปิดข้อสังเกตที่ไม่ผ่านในสภาพนั้น · **ไม่ผ่าน** = ปรับในรอบถัดไป

## 7. วิธีคำนวณ

- แดชบอร์ด "ตรวจความแม่นยำหน้างาน" ให้ความแม่นยำต่อข้อสังเกตพร้อม Wilson 95% อยู่แล้ว ส่งออก CSV (เรียงตามเวลา) และรายงานพิมพ์
- Recall ขั้น 1 = จำนวนเหตุในบทที่ระบบแจ้งภายใน 10 วินาทีหลังเริ่ม (ข้อสังเกตเดียวกัน ที่นั่งเดียวกัน) / จำนวนเหตุในบท คิด Wilson 95%
  ด้วยมือหรือสเปรดชีต (เครื่องมือคำนวณอัตโนมัติยังไม่มี: ดูรายการที่เลื่อนไป)
- ช่องว่างระหว่างกลุ่ม = ผลต่างของอัตราหาใบหน้าเจอระหว่างกลุ่มที่ดีที่สุดกับแย่ที่สุด

## 8. PDPA และข้อห้าม

- ประกาศก่อนสอบ ช่องยินยอม ทางเลือกสำหรับผู้ไม่ยินยอม (การไม่ยินยอมไม่ทำให้เสียสิทธิสอบ)
- ไม่มีการบันทึกวิดีโอในนำร่องนี้ (คลิปหลักฐานปิด) ไม่มีภาพในรายงาน ไฟล์ส่งออกมีเฉพาะเวลา ที่นั่ง ข้อสังเกต และชื่อผู้คุมสอบ
- EU AI Act: การเฝ้าดูพฤติกรรมในการสอบเป็นความเสี่ยงสูง (Annex III 3(d)) การรู้จำอารมณ์ในสถานศึกษาเป็นสิ่งต้องห้าม (มาตรา 5(1)(f)) ไม่มีในระบบ

---

# English

## 1. Goal and non-goals

Measure how often LENSIQ Exam's observations are **right** (the invigilator went and saw what the system said, e.g. a
real phone), how often it **misses** a known event (staged exam), and whether it is **unfair** to anyone (low light,
darker skin, candidates with accommodations). Today every one of these is **not measured** (`docs/EXAM.md`).

This pilot does none of the following:
- decide misconduct (an observation is not misconduct; the invigilator always decides);
- analyse emotion or expression;
- recognise faces;
- produce a suspicion score;
- require room scans.

## 2. Three phases

| Phase | What | People | Output |
|---|---|---|---|
| **0: camera and light check** | consenting volunteers sit in the real seats in different light | ≥ 10 adult volunteers | face-not-found rate per lighting verdict (good / fair / poor) and per **self-identified** skin-tone group (Monk 1–10, optional) |
| **1: staged exam** | volunteers follow a script written in advance (§5.1); a recorder notes the true times | same volunteers | recall per signal and extra (unscripted) flags |
| **2: real exam** | normal exam; invigilators press "flag was right / wrong" on the dashboard and log events the system did not flag | candidates who received the notice and consented; 20–40 per room, ≥ 3 rooms | per-signal precision (Wilson 95%), response time, candidate survey |

**Modes:**

- **Mode A** (camera exam hall: `exam-hall.html` + `exam-dashboard.html`) is recommended for the pilot. The camera
  and the dashboard run in two tabs of the same browser on one device. Each device covers one camera view, so a big
  room uses 2–3 devices, each with its own dashboard.
- **Mode B** (computer room: `exam-lab.html`): each candidate PC keeps its own log. It **cannot stream live to the
  invigilator's dashboard on another machine yet**, because the relay endpoint does not exist (`docs/EXAM.md`).
  After the exam, export JSON from each PC and import it into the dashboard for review. Tell the site this before it
  chooses Mode B.
- **Evidence clips** stay **off** in this pilot unless the site asks in writing and the candidate notice already says
  so.

## 3. Schedule (per institution)

| Day | What happens |
|---|---|
| −14 to −8 | Agreement and permission signed. Pick low-stakes exam sessions (e.g. quizzes or midterms). DPIA addendum. |
| −7 | Candidate notice (`exam.html#notice`, printable, TH / EN / ZH) goes out at least 7 days ahead, with an alternative for anyone who declines. |
| −5 | Phases 0 and 1 (2–3 h) in the real rooms, at the same time of day and in the same light as the exam. |
| −4 | Invigilator training (1 h): an observation is not misconduct; every action needs a name; what right / wrong means; how to fill in the miss log. |
| Exam days (≥ 3 rooms) | Set up and check the light (poor light is fixed first, not flagged). Invigilate as usual and tally every observation you check. |
| +1 | Candidate and invigilator surveys. |
| +3 | Results meeting and sign-off. |
| +14 | Delete the exports, unless the site keeps them as its own records. |

## 4. What the owner prepares on site

- **Institution:** one school, university, tutoring centre or training centre that allows the system in low-stakes
  exam sessions.
- **Permission:** written approval from the head of the institution, naming the sessions and rooms and stating that
  no video is recorded.
- **Rooms:** at least 3, including 1 computer room if Mode B is tested.
- **Mode A equipment:** 1–3 laptops or phones per room, on stands at least 2 m high or on the front wall, with power.
- **Mode B equipment:** the room's PCs with webcams and a current version of Chrome or Edge.
- **Light:** front lights on, and no window behind the candidates.
- **Invigilators:** the usual staff, 1–2 per room, trained for 1 hour and named on the dashboard.
- **Phase 0–1 volunteers:** at least 10 adults with written consent, who are not candidates in the measured sessions.
- **Script recorder:** 1 person who notes the true time of each scripted event.
- **Notice and consent:** the printed `exam.html#notice`, plus an alternative way to sit the exam without the camera.
- **Storage:** an encrypted folder for the CSV and JSON exports.

## 5. Sheets

**5.1 Staged-exam script.** Write it before phase 1 and do not change it after seeing results. Each event is done 3
times per volunteer, spread across the room.

- **Columns:** seq, seat, start time (recorder's clock), scripted event, duration (s), flagged (y/n), signal shown, notes.
- **Events** (the objective signals in `LQExam`): phone or book in view; a second face in the frame; no face for 5 s or
  more; a long head turn; leaving the seat or an empty seat; leaning towards the next seat; and in Mode B, leaving
  fullscreen or switching windows.
- **Never** script emotion or expression events.

**5.2 Miss log (phase 2).** Columns: time, room, seat, what the invigilator saw (a fact, not a conclusion), flagged
or not, invigilator name.

**5.3 Camera and light sheet (phase 0).** Columns: seat, page lighting verdict, self-identified skin-tone group
(optional, Monk 1–10), seconds the face was found out of the total, notes.

The skin-tone group is sensitive data:
- Collect it only with written consent, report it as group aggregates only, and delete it after the report.
- Counsel confirms the legal basis (PDPA s.26) first.
- Without counsel's opinion, report by lighting only.

## 6. Metrics and targets (proposal)

| Metric | Target | Phase |
|---|---|---|
| Face found in "good" light | ≥ 98% of seconds, every reported group | 0 |
| Gap between groups (light or skin tone) | ≤ 5 points; above that, the "no face" signal is off in that condition until fixed | 0 |
| Recall per signal (scripted events) | phone in view ≥ 80% · empty seat ≥ 95% · second face ≥ 90% · (B) fullscreen exit 100% | 1 |
| Extra flags per volunteer-hour | ≤ 1 | 1 |
| Precision "flag was right" per signal (Check level) | ≥ 70% Wilson 95% lower bound (signals with ≥ 20 flags) | 2 |
| Events seen by the invigilator but not flagged | report (no threshold in round 1) | 2 |
| Invigilator response time (median) | ≤ 60 s | 2 |
| Candidates rating "fair and clear" (1–5) | ≥ 4.0 | 2 |
| Decliners who sat the exam by the alternative | 100% | 2 |

Note (owner decision): "Wilson 95% lower bound ≥ 70%" needs an observed precision of 19 / 20 = 95% at 20 flags,
34 / 40 = 85% at 40, 49 / 60 = 81.7% at 60 and 79 / 100 = 79% at 100. Signals with few flags are therefore hard to
pass. Decide before phase 2 whether to keep it or to judge on the point estimate with the 95% interval reported.
| Unresolved complaints | 0 | 2 |
| An observation used to decide without an invigilator's check | **0** | 2 |

**Outcomes:**
- **Accept:** every metric passes. The "after pilot" price (`docs/PRICING-RESEARCH.md` §3.1) may apply, and the figures
  go into `docs/EXAM.md` with n and "source: field".
- **Conditional:** switch off the failing signal in that condition.
- **Reject:** next-round work.

## 7. How to compute

- **Phase 2 precision:** the dashboard's on-site tally already gives per-signal precision with Wilson 95%, and the CSV
  (time order) and the printable report carry it.
- **Phase 1 recall:** scripted events flagged within 10 s of their start (same signal, same seat) divided by all
  scripted events, with Wilson 95%. Compute it by hand or in a spreadsheet; there is no tool for it yet (deferred).
- **Group gap:** the difference in face-found rate between the best and the worst group.

## 8. PDPA and never-do

- **Notice and choice:** a notice before the exam, a consent box, and an alternative for anyone who declines. Declining
  never costs the right to sit the exam.
- **No video:** none is recorded in this pilot (clips off), and no images go in the report. Exports hold only times,
  seats, signals and invigilator names.
- **EU AI Act:** exam behaviour monitoring is high-risk (Annex III 3(d)), and emotion recognition in education is
  prohibited (Art. 5(1)(f)). There is none in the system.
