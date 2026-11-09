# ชุดนำร่องภาคสนาม: LENSIQ Crowd (นับคนในพื้นที่ / งานอีเวนต์) / Field pilot kit: LENSIQ Crowd

> **สถานะ:** ฉบับร่าง round 16 (2026-11-09) ตามแผนทั่วไปใน [`docs/PILOT-PLAN.md`](../PILOT-PLAN.md) และ
> [`docs/CROWD-ACCURACY.md`](../CROWD-ACCURACY.md) เกณฑ์ทุกข้อเป็น **ข้อเสนอให้เจ้าของปรับ**
> **Status:** round 16 draft; thresholds are a **proposal for the owner**. English: second half.
>
> **ขอบเขต: ฝูงชนเบาบางถึงปานกลางเท่านั้น** LENSIQ Crowd **ยังไม่เหมาะกับฝูงชนหนาแน่น** (ฝูงชนราว 300 คนถูกนับได้ราว 1 คนต่อภาพ,
> n = 2 + 7 ภาพ, ชุดข้อมูลสาธารณะ ผลเบื้องต้น) ไซต์ที่คาดว่ามีคน **ประมาณ 50 คนขึ้นไปในภาพเดียว** ไม่อยู่ในนำร่องนี้
> **Scope: sparse to medium crowds only.** Not yet suitable for dense crowds; sites expecting about 50+ people in one view are out of scope.

---

# ภาษาไทย

## 1. เป้าหมาย

1. ได้ตัวเลข **FINAL** แทน "ผลเบื้องต้น (AI นับเทียบ)" บนคลิปสาธารณะเดิม ด้วยผู้นับที่เป็นคน 2 คน
2. วัดเวลาต่อภาพและจำนวนภาพต่อวินาทีบน **มือถือระดับกลางจริง** (วันนี้มีเฉพาะการจำลอง ×4 บน Mac: 355 ms ต่อภาพ ≈ 2.8 ครั้ง/วินาที
   "จำลอง ไม่ใช่มือถือจริง")
3. วัดความแม่นยำ **หน้างานจริง** ที่ไซต์ลูกค้า (จำนวนคนในโซน จำนวนคนในภาพ การข้ามเส้นเข้า/ออก) เทียบกับคนนับ 2 คน

ตัวเลขที่มีวันนี้ (ที่มา: ชุดข้อมูลสาธารณะ ผลเบื้องต้น AI นับเทียบ, `docs/CROWD-ACCURACY.md`): คน 15–22 คน นับต่ำกว่าจริง 26%
(n = 12 ภาพ) · คน 30–50 คน นับต่ำกว่าจริง 58% (n = 20 ภาพ) · คนตัวเล็ก/ไกล นับต่ำกว่าจริง 37–59% (n = 29 ภาพ) · โซนใกล้ 0–13 คน
คลาด 1.2 คนต่อภาพ (31%, n = 20 ภาพ) · หน้างานจริง: ยังไม่ได้วัด

## 2. สามขั้นตอน

| ขั้น | อะไร | ใคร | เวลา | ผลที่ได้ |
|---|---|---|---|---|
| **ขั้น 0a: นับด้วยคน (คลิปสาธารณะ)** | ชุดนับด้วยคนใน `docs/CROWD-ACCURACY.md` "Human counting kit" คลิป `sparse_roncesvalles` + `medium_yonge_dundas` | ผู้นับ 2 คน (A, B) + คนที่สามตัดสินภาพที่ต่างกัน > 10% | 1–2 ชม. ต่อคน | ค่า "HUMAN (final)" จาก `node tools/crowd-eval.mjs score` |
| **ขั้น 0b: มือถือจริง** | เปิด `crowd.html` บนมือถือ Android ระดับกลาง 1 เครื่อง (ระบุรุ่น ราคา ปีที่ออก) ชี้ไปที่คลิปทดสอบบนจอคอมพิวเตอร์หรือฉากจริง | เจ้าของ + ทีม | 1 ชม. | เวลาต่อภาพของตัวตรวจจับ (มัธยฐาน, p90) และภาพต่อวินาที บนเครื่องจริง |
| **ขั้น 1: ไซต์นำร่อง** | ใช้งานจริงที่ไซต์ 1–2 แห่ง (บูธ/ล็อบบี้/ทางเข้างาน/โซนคิว) อย่างน้อย 2 วัน | ผู้ควบคุม + ผู้นับ 2 คน | 2–3 วัน | ความคลาดของจำนวนในโซน/ในภาพ และการข้ามเส้น เทียบคนนับ |

### ขั้น 0b: วิธีวัดบนมือถือจริง

หน้า `crowd.html` ยังไม่มีตัวเลขเวลาต่อภาพแสดงบนหน้าจอ (รายการที่เลื่อนไป) จนกว่าจะมี ให้วัดผ่าน Chrome DevTools ระยะไกล:

1. มือถือ: เปิด "ตัวเลือกสำหรับนักพัฒนา" > USB debugging ต่อสาย USB กับคอมพิวเตอร์
2. คอมพิวเตอร์: Chrome เปิด `chrome://inspect` > เลือกแท็บ `crowd.html` บนมือถือ > Performance > บันทึก 30 วินาทีขณะนับ
3. อ่านเวลาของงาน WASM ต่อรอบ (ประมาณ 5 รอบต่อวินาทีถ้าทัน) จดมัธยฐานและ p90 ลงแผ่น §5.3
4. ทำซ้ำ 3 ครั้ง (เครื่องเย็น / หลังใช้ 10 นาที / ขณะชาร์จ) เพราะมือถือลดความเร็วเมื่อร้อน
5. ติดป้ายผลว่า "มือถือจริง (รุ่น …)" แยกจากผล "จำลอง ×4"

## 3. ขั้น 1: ตารางเวลาที่ไซต์

| วัน | งาน | ผลที่ได้ |
|---|---|---|
| −7 ถึง −1 | ขออนุญาตผู้จัดงาน/เจ้าของพื้นที่ ลงนามสัญญานำร่อง สำรวจจุดติดกล้อง ประเมินจำนวนคนสูงสุดต่อภาพ (ต้อง < ~50) ทำ DPIA เพิ่มเติม | สัญญา แบบสำรวจไซต์ |
| 1 เช้า | ติดตั้ง วาดโซนและเส้นนับ ตั้ง "จำนวนคนที่คาดว่าจะมีช่วงพีค (อีเวนต์)" ตามที่ผู้จัดประเมิน ทดลอง 1 ชม. | บันทึกการตั้งค่า |
| 1–2 | ทุก 5 นาที ในช่วงสุ่ม 30 นาที × 4 ช่วงต่อวัน: จดค่าบนหน้าจอและผู้นับ 2 คนนับคนในโซน/ในภาพ ณ นาทีเดียวกัน **แยกกัน ไม่ดูของกันและกัน** ช่วงละ 15 นาที นับคนข้ามเส้นด้วยเครื่องกดนับมือ (เข้า/ออก) | แผ่นภาพนิ่ง §5.1 และแผ่นเส้นนับ §5.2 |
| 2 เย็น | ส่งออก CSV รายงานการตลาดจากหน้า Crowd (มีหมายเหตุ "ค่าประมาณ" ในหัวไฟล์) | CSV |
| 3 | คำนวณผล ประชุมสรุป ลงนาม | แบบสรุปผล |

**ไม่บันทึกวิดีโอเป็นค่าเริ่มต้น** ผู้นับนับจากพื้นที่จริงหรือจากจอที่แสดงภาพสด ถ้าต้องบันทึกเพื่อนับย้อนหลัง ต้องมีฐานกฎหมายแยก
ป้าย E (`camera-notice.html`) ไดรฟ์เข้ารหัส และลบภายในวันที่ 14 (`docs/PILOT-PLAN.md` §5)

## 4. สิ่งที่เจ้าของต้องเตรียมที่ไซต์

| รายการ | รายละเอียด | ใครจัดหา |
|---|---|---|
| ไซต์ 1–2 แห่ง | บูธในงานแสดงสินค้า ล็อบบี้ ทางเข้างาน โซนคิว หรือหน้าร้าน ที่มีคนในภาพ 5–40 คนช่วงพีค | เจ้าของ (ติดต่อ) |
| หนังสืออนุญาต | ผู้จัดงาน/เจ้าของพื้นที่อนุมัติจุดกล้อง วัน เวลา และว่าไม่บันทึกวิดีโอ | ไซต์ |
| อุปกรณ์ | มือถือ/โน้ตบุ๊ก + กล้อง ขาตั้งสูง ≥ 2.5–3 ม. มองลงประมาณ 30–45° สายไฟ (ใช้ได้ทั้งวัน) | เจ้าของ |
| ตำแหน่งกล้อง | คนในโซนสูงอย่างน้อย **10% ของความสูงภาพ** (ต่ำกว่านี้ระบบขึ้นคำเตือน "คนดูเล็ก" และนับต่ำ 37–59%) ไม่ย้อนแสง กล้องอยู่นิ่ง | ทีม + เจ้าของ |
| ผู้นับ 2 คน | ไม่ใช่คนที่ตั้งค่าระบบ มีเครื่องกดนับมือ 2 เครื่องต่อคน (เข้า/ออก) นาฬิกาตรงกัน | เจ้าของ |
| ผู้ควบคุม | จดค่าบนหน้าจอทุก 5 นาที | เจ้าของ |
| มือถือระดับกลาง (ขั้น 0b) | Android ราคาประมาณ 6,000–10,000 บาท ระบุรุ่นในผล + สาย USB | เจ้าของ |
| ป้ายแจ้ง | ป้าย A (`camera-notice.html`, 3 ภาษา) ที่ทางเข้าพื้นที่ (+ ป้าย E ถ้าบันทึกวิดีโอ) | เจ้าของพิมพ์ |
| ไม่ใช้ | การประมาณอายุ/เพศ/สีหน้า (ปิดในโหมดลูกค้า) การจดจำใบหน้า | — |

## 5. แผ่นบันทึก

### 5.1 แผ่นภาพนิ่ง (ทุก 5 นาที)

| วันที่ | เวลา | ไซต์ | ค่าบนหน้าจอ "คนในภาพ" | ค่าบนหน้าจอ "คนในโซน" | ผู้นับ A ในภาพ | ผู้นับ A ในโซน | ผู้นับ B ในภาพ | ผู้นับ B ในโซน | มีคำเตือน "ค่าประมาณ" หรือ "คนดูเล็ก" | หมายเหตุ |
|---|---|---|---|---|---|---|---|---|---|---|

กติกาเหมือนชุดนับด้วยคน: นับคนที่เห็นศีรษะอย่างน้อยครึ่งหนึ่ง คนในโซนนับจาก **เท้า** ถ้า A กับ B ต่างกัน > 10% ให้คนที่สามดู ณ
ช่วงถัดไป ค่าจริง = ค่าเฉลี่ย A และ B

### 5.2 แผ่นเส้นนับ (ช่วงละ 15 นาที)

| วันที่ | เริ่ม | สิ้นสุด | หน้าจอ เข้า | หน้าจอ ออก | A เข้า | A ออก | B เข้า | B ออก | หมายเหตุ |
|---|---|---|---|---|---|---|---|---|---|

### 5.3 แผ่นเวลาบนมือถือจริง (ขั้น 0b)

| รุ่นมือถือ | ราคา/ปีที่ออก | Chrome เวอร์ชัน | สภาพ (เย็น / 10 นาที / ชาร์จ) | เวลาต่อรอบ มัธยฐาน (ms) | p90 (ms) | ครั้งต่อวินาที | หมายเหตุ |
|---|---|---|---|---|---|---|---|

## 6. ตัวชี้วัดและเป้า (ข้อเสนอ)

| ตัวชี้วัด | เป้า | ขั้น |
|---|---|---|
| ผู้นับ A กับ B ต่างกัน (noise floor) | รายงาน ถ้า > 10% ของภาพต่างเกิน 10% ให้นับใหม่ | 0a / 1 |
| คนในโซน MAPE (ภาพที่ค่าจริง > 0) | ≤ 20% | 1 |
| คนในภาพ MAPE | ≤ 25% และ bias ไม่ต่ำกว่า −15% | 1 |
| ภาพที่อยู่ในช่วงยอมรับ (±1 คนเมื่อ ≤ 10 คน, ±15% เมื่อมากกว่า) | ≥ 70% | 1 |
| การข้ามเส้น ผลต่างต่อช่วง 15 นาที (เข้า + ออก) | ≤ 10% | 1 |
| ฝูงชนเกินขอบเขต (เกิน ~50 คนต่อภาพ) | หน้าจอแสดง "ค่าประมาณ" หรือข้อความว่าตัวตรวจจับล้า ทุกครั้งที่ตั้งค่า "จำนวนคนที่คาดว่าจะมีช่วงพีค" ไว้ | 1 |
| มือถือระดับกลางจริง | ≥ 2 ครั้งต่อวินาที (ต่ำกว่านี้ ตัวติดตามและเส้นนับที่ตั้งไว้สำหรับ 5 Hz ได้ภาพน้อยลง) | 0b |
| ระบบทำงานต่อเนื่องช่วงเปิดงาน | ≥ 99% | 1 |

ผลลัพธ์: **ผ่าน** = ทุกข้อผ่าน → ใช้ราคา "หลังนำร่อง" (`docs/PRICING-RESEARCH.md` §3.3) ตัวเลขลง `docs/CROWD-ACCURACY.md` และหน้า
`crowd.html` พร้อม n และ "ที่มา: หน้างานจริง" · **ผ่านแบบมีเงื่อนไข** = ใช้เฉพาะโซนใกล้ หรือแสดงเป็นช่วง · **ไม่ผ่าน** = งานรอบถัดไป
(เช่น อินพุต 640 ซึ่งในการทดลองลดความคลาดครึ่งหนึ่งแต่ช้าลง 2 เท่า: ต้องให้เจ้าของอนุมัติก่อนเปลี่ยน)

## 7. วิธีคำนวณ

- ขั้น 0a: `node tools/crowd-eval.mjs score` (ส่วน "HUMAN (final)")
- ขั้น 1: MAE = ค่าเฉลี่ย |หน้าจอ − ค่าจริง|, MAPE = ค่าเฉลี่ย |หน้าจอ − ค่าจริง| / ค่าจริง, bias = ค่าเฉลี่ย (หน้าจอ − ค่าจริง)
  คิดในสเปรดชีต (ยังไม่มีเครื่องมือสำหรับแผ่นไซต์: ดูรายการที่เลื่อนไป)

## 8. PDPA และข้อห้าม

- ไม่จดจำใบหน้า ไม่ประมาณอายุ/เพศ/สีหน้า (ปิดในโหมดลูกค้า) ไม่บันทึกวิดีโอเป็นค่าเริ่มต้น
- แผ่นบันทึกมีเฉพาะตัวเลข ไม่มีชื่อหรือภาพคน
- ห้ามใช้ตัวเลขนี้ตัดสินความปลอดภัยของฝูงชน (เช่น จำกัดคนเข้าเพื่อความปลอดภัย) — ระบบยังไม่เหมาะกับฝูงชนหนาแน่น

---

# English

## 1. Goal

1. Replace the "preliminary (AI reference)" figures on the public clips with a **FINAL** figure from two human counters.
2. Measure the detector time per frame on a **real mid-range phone**. Today there is only the emulated ×4 figure on a
   Mac (355 ms per frame, about 2.8 calls/s, "emulated, not a real phone").
3. Measure **field** accuracy at a customer site (people in the zone, people in view, line crossings) against two human
   counters.

Today's figures (source: public dataset, preliminary AI reference, `docs/CROWD-ACCURACY.md`):

| Scene | Result | n |
|---|---|---|
| 15–22 people | undercount 26% | 12 frames |
| 30–50 people | undercount 58% | 20 frames |
| small / far people | undercount 37–59% | 29 frames |
| near zone, 0–13 people | 1.2 people per frame (31%) | 20 frames |
| real site | not measured | — |

## 2. Three phases

| Phase | What | Who | Time | Output |
|---|---|---|---|---|
| **0a: human count (public clips)** | the human counting kit in `docs/CROWD-ACCURACY.md`, clips `sparse_roncesvalles` + `medium_yonge_dundas` | 2 counters (A, B) + a third person for frames that differ by > 10% | 1–2 h each | "HUMAN (final)" from `node tools/crowd-eval.mjs score` |
| **0b: real phone** | open `crowd.html` on one mid-range Android phone (note model, price, year), pointed at a test clip on a monitor or a real scene | owner + team | 1 h | detector time per frame (median, p90) and calls/s on a real device |
| **1: pilot site** | live use at 1–2 sites (booth / lobby / event entrance / queue zone), ≥ 2 days | operator + 2 counters | 2–3 days | zone / in-view error and line-crossing error against human counts |

**Phase 0b procedure.** The page has no on-screen timing yet (deferred), so use remote DevTools:

1. On the phone, enable USB debugging.
2. On the computer, open `chrome://inspect` and pick the `crowd.html` tab.
3. Record 30 s in the Performance panel while counting.
4. Read the WASM work per cycle, and note the median and p90 in sheet §5.3.
5. Repeat 3 times: cold, after 10 minutes, and while charging (phones slow down when hot).
6. Label the result "real phone (model …)", separate from "emulated ×4".

**Phase 1 schedule.**

| Day | What happens |
|---|---|
| −7 to −1 | Permission, agreement, site survey. Peak people per view must be under about 50. DPIA addendum. |
| Day 1, morning | Install. Draw the zone and line, and set "expected crowd at peak (events)". |
| Days 1–2 | In 4 random 30-minute windows a day, every 5 minutes the operator notes the screen values while counters A and B count the zone and the view at the same minute, **independently**. In 15-minute windows the counters count line crossings with hand tally counters. |
| Day 2, evening | Export the marketing CSV. |
| Day 3 | Compute, results meeting, sign-off. |

**No video is recorded by default.** If a recording is needed, it requires a separate legal basis, sign E, an encrypted
drive, and deletion by day 14.

## 3. What the owner prepares on site

- **Sites:** 1–2 sites (booth, lobby, entrance, queue zone or shop front) with 5–40 people in view at peak.
- **Permission:** written approval from the organiser or venue for the camera spot and the dates, stating that no
  video is recorded.
- **Equipment:** a phone or laptop with a camera, on a stand 2.5–3 m or higher looking down at 30–45°, with all-day
  power.
- **Camera placement:** people in the zone at least **10% of the frame height**. Below that the page shows the "people
  look small" hint and the measured undercount is 37–59%. No backlight, and the camera must not move.
- **People:** 2 counters who did not set up the system (2 hand tally counters each, synced clocks), and 1 operator.
- **Mid-range phone for phase 0b:** an Android phone at about 6,000–10,000 THB, plus a USB cable. Record the model.
- **Signs:** sign A (`camera-notice.html`) at the area entrance, plus sign E if video is recorded.
- **Not used:** age, gender or expression estimation (off in customer mode), and face recognition.

## 4. Sheets

- **5.1 Snapshot sheet (every 5 min).** Columns: date, time, site, screen in view, screen in zone, A in view, A in
  zone, B in view, B in zone, warning shown ("estimate" / "people look small"), notes. The rules are the same as the
  human kit:
  - count a head that is at least half visible;
  - zone membership by the **feet**;
  - when A and B differ by more than 10%, a third person checks at the next snapshot;
  - truth = the mean of A and B.
- **5.2 Line sheet (15 min).** Columns: date, start, end, screen in, screen out, A in, A out, B in, B out, notes.
- **5.3 Real-phone timing.** Columns: phone model, price / year, Chrome version, state (cold / 10 min / charging),
  median ms, p90 ms, calls/s, notes.

## 5. Metrics and targets (proposal)

| Metric | Target | Phase |
|---|---|---|
| Counter A vs B gap (noise floor) | report; recount if > 10% of snapshots differ by > 10% | 0a / 1 |
| Zone MAPE (truth > 0) | ≤ 20% | 1 |
| In-view MAPE | ≤ 25%, bias not below −15% | 1 |
| Snapshots within band (±1 when ≤ 10 people, ±15% above) | ≥ 70% | 1 |
| Line crossings, difference per 15-min window (in + out) | ≤ 10% | 1 |
| Out-of-scope crowd (above about 50 per view) | the screen shows "estimate" or the collapsed-detector message whenever "expected crowd at peak" is set | 1 |
| Real mid-range phone | ≥ 2 calls/s (below that the 5 Hz tracker and line get fewer frames) | 0b |
| Uptime during opening hours | ≥ 99% | 1 |

**Outcomes:**
- **Accept:** every metric passes. The "after pilot" price (`docs/PRICING-RESEARCH.md` §3.3) may apply, and the figures
  go into `docs/CROWD-ACCURACY.md` and `crowd.html` with n and "source: field".
- **Conditional:** use the near zone only, or show a range.
- **Reject:** next-round work. One example is a 640 input, which halved the error in the experiment but costs 2× the
  compute; it needs the owner's approval first.

## 6. How to compute

- **Phase 0a:** `node tools/crowd-eval.mjs score`.
- **Phase 1:** MAE, MAPE and bias, computed in a spreadsheet (there is no tool for the site sheets yet; deferred).

## 7. PDPA and never-do

- No face recognition, and no age, gender or expression estimation.
- No video by default, and the sheets hold numbers only.
- **Never use these numbers for crowd-safety decisions** (such as entry limits for safety): the system is not yet
  suitable for dense crowds.
