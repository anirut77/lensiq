# ชุดวัดผล: LENSIQ Exam "เฝ้าที่นั่ง" (โหมดห้องสอบที่ไม่ใช้ใบหน้า) / Measurement kit: LENSIQ Exam "seat watch" (face-free hall mode)

> **สถานะ / Status:** ฉบับร่าง 2026-11-10 รอเจ้าของยืนยันเป้าและวันวัด ข้อกฎหมายรอทนายตรวจ · Draft 2026-11-10; targets and date await the
> owner, legal points await counsel. **Nothing in this document has been measured.**
> **Number tags used everywhere:** **[proposed]** = a choice for the owner to confirm · **[calc]** = arithmetic in this document ·
> **[code]** = a threshold read from `lensiq-exam.js` / `exam-hall.js` on 2026-11-10 · **[to be measured]** = the session fills it in.
> Background: `HALL-NO-FACE-ASSESSMENT.md` (2026-11-10). Format follows `docs/FIELD-PILOT.md` and `docs/pilot/PILOT-EXAM.md`.

---

## สรุปภาษาไทย

- **วัดอะไร:** ในการสอบจำลองกับ**อาสาสมัครผู้ใหญ่** ระบบ "เฝ้าที่นั่ง" แจ้งเหตุการณ์ที่เกิดจริงได้กี่ครั้ง (recall) แจ้งผิดกี่ครั้งต่อที่นั่งต่อชั่วโมง
  และแจ้งช้าแค่ไหน แยกรายสัญญาณ: ที่นั่งว่าง · กลับมา · ออกก่อนเวลา · มีคนที่สองที่ที่นั่ง · มีคนในทางเดิน · เอนตัว
  ("ยืน" ยังไม่ได้สร้าง จึงจดไว้เฉย ๆ · **โทรศัพท์ปิดเป็นค่าเริ่มต้น** วัดเป็นส่วนเสริมเฉพาะแถว 1–2 และไม่ใช้อ้างผล)
- **ไม่ได้วัดและไม่ทำ:** ไม่ดูใบหน้า ไม่ระบุตัวบุคคล ไม่ให้คะแนนอารมณ์ พฤติกรรม หรือ "ความน่าสงสัย" ทุกสัญญาณคือ**ข้อเท็จจริงให้คนไปดู**
  ไม่ใช่คำตัดสิน ระยะนี้**ผู้ใหญ่เท่านั้น** (อายุ 20 ปีขึ้นไป)
- **กำหนดก่อนวันวัด ห้ามแก้หลังเห็นผล:** นิยามเหตุการณ์ ช่วงเวลาที่ยอมรับ นิยาม "แจ้งถูก / พลาด / แจ้งผิด" ตารางบท (สุ่มแล้วล็อกด้วย sha256)
  การแบ่งรอบซ้อม (dev) กับรอบตัดสิน (held-out) และเป้า
- **เป้าที่เสนอ [ข้อเสนอ รอเจ้าของยืนยัน]:** ที่นั่งว่าง / กลับมา / ทางเดิน: ขอบล่าง Wilson 95 % ≥ 80 % (ต้องเจอ ≥ 55 จาก 60 ครั้ง [คำนวณ]) ·
  คนที่สอง / เอนตัว: ขอบล่าง ≥ 70 % (≥ 49 จาก 60 [คำนวณ]) · ออกก่อนเวลา: รายงานค่าอย่างเดียว · แจ้งผิดรวมทุกสัญญาณ ≤ 3 ครั้งต่อการสอบ
  30 ที่นั่ง 3 ชั่วโมง (≤ 0.033 ครั้งต่อที่นั่งต่อชั่วโมง) · แจ้งภายในเวลาหน่วงของสัญญาณ + 5 วินาที (มัธยฐาน) · ≥ 2 รอบตรวจต่อวินาทีบนแล็ปท็อประดับกลาง
- **สองแบบ:** (ก) **30 ที่นั่ง × 3 ชั่วโมง** รอบเดียว 180 นาที = 90 ที่นั่ง-ชั่วโมง เป็นแบบเดียวที่ตัดสินเป้า "แจ้งผิด" ได้ ·
  (ข) **อาสาสมัคร 6–10 คน**: รอบซ้อม 48 นาที + รอบตัดสิน 144 นาที (6 ช่วง ช่วงละ 24 นาที) ได้ ≥ 60 เหตุการณ์ต่อสัญญาณหลัก
  แต่มีเพียง 19.2 ที่นั่ง-ชั่วโมง ถ้าไม่มีแจ้งผิดเลยก็พิสูจน์ได้แค่ "น้อยกว่า 0.16 ครั้งต่อที่นั่งต่อชั่วโมง" [คำนวณ] จึง**ตัดสินเป้าแจ้งผิดไม่ได้**
- **วิดีโอ:** ค่าเริ่มต้น**ไม่บันทึก** เก็บเฉพาะบันทึกเหตุการณ์ (เวลา หมายเลขที่นั่ง ชนิดสัญญาณ) ถ้าเจ้าของเลือกบันทึกเพื่อช่วยตรวจฉลาก ใบยินยอมต้องระบุ
  ที่เก็บและวันลบ และถ้ามีผู้ไม่ยินยอมแม้คนเดียว จะไม่บันทึกทั้งรอบ
- **เทียบตัวตรวจ COCO-SSD กับ YOLOX-Nano:** กล้องสองตัวติดชิดกัน แล็ปท็อปสองเครื่อง ดูรอบเดียวกันพร้อมกัน สลับเครื่องกลางรอบ
- **สิ่งที่ยังไม่มีในระบบ (ไม่สร้างในรอบนี้):** สัญญาณ "ยืน" · โซนผู้คุมสอบ · การเตือนกล้องถูกขยับ · บันทึกกรอบคนรายเฟรม · การเล่นวิดีโอย้อนผ่านหน้าเว็บ

---

## 1. Purpose and the claim under test

**Purpose.** Produce the first measured numbers for the seat signals of `exam-hall.html` (`LQExam.createHallMonitor`), which
`docs/ACCURACY-CLAIMS.md` lists as "not measured". Seat signals are judged **separately from the experimental face count**
(owner decision 1, 2026-11-10); the face count stays off during this measurement.

**The claim under test (wording from the assessment; the session either supports it with numbers or it does not):**

> "Seat watch for exam rooms (experimental): shows the invigilator which seat became empty, for how long, and when someone
> is in the aisle or a second person is at a seat. It does not look at faces, identify anyone or judge behaviour; a
> person checks every event."

What a pass allows: the sentence above plus "in a mock exam with N adult volunteers, K of M scripted events were shown
(source: field, mock exam, date, room, camera position)". What it never allows: any statement about cheating, a claim for
rooms, distances, lighting or camera positions that were not in the session, a phone claim, a claim for minors, or the
word "real exam".

**Not goals.** No emotion, expression or behaviour-suspicion scoring. No identity. No ranking of seats or people. Events
are facts for a person to review.

**Scope limits fixed by the owner (2026-11-10).** Adults only. Phone signal off by default in this mode, with its label;
measured only as an optional extra (§9). Nothing new is built for this mode before the measurement, except the person
detector switch to the YOLOX-Nano already in the product (own commit, before / after numbers). Consequences for this kit:

| Wanted in the brief | State today | What the kit does |
|---|---|---|
| Standing signal | not built | volunteers stand on cue; the labeller records it; alerts it causes (false "empty" / "second person") are counted; no recall number |
| Invigilator exclusion zone | not built | walk mode (auto-off 5 min [code]) is used on scripted staff walks |
| Camera-moved check | not built | a deliberate nudge at the end, reported as a count, outside the main rates (§10) |
| Per-frame box log | not built | only the event log exists (dashboard CSV / JSON). Box size per row is **not** collected unless the owner approves a small logging aid (README, open question 7) |
| Replay of a recording through the page | not built | the detector A/B runs live on two devices (§11) |

## 2. Signals and thresholds as built (read from the code, 2026-11-10)

| Signal (`sig`) | Level | Rule [code] | Hold time H | Cooldown |
|---|---|---|---|---|
| `empty` | info | seat seen occupied once, then no person-box centre in the seat polygon in 3 of 4 detection rounds, for 20 s (`emptyMs`; × 3 with the `breaks` accommodation) | 20 s | none |
| `back` | info | the empty state ends after `empty` fired; carries the time away (`dur`) | about 1–2 s (gate 3 of 4) | none |
| `early` | watch | empty ≥ 180 s (`earlyMs`) while elapsed time < the minimum leave time (`minLeaveMin`, default 30 min); **once per seat per monitoring run**; off with `breaks` | 180 s | once |
| `extra` | watch, then check | ≥ 2 person-box centres in one seat polygon, 3 of 5 rounds: 5 s = Watch, 15 s = Check; off in walk mode | 5 s (15 s) | 90 s per seat |
| `aisle` | watch | ≥ 1 person-box centre outside every seat polygon, 3 of 5 rounds, 8 s; **room-level** (no seat); off in walk mode | 8 s | 90 s for the room |
| `lean` | watch | > 25 % of a seated person's box inside a same-row neighbour's polygon, 3 of 5 rounds, 4 s | 4 s | 90 s per seat |
| `phone` | check | phone box (score ≥ 0.5) centre in a seat polygon, 3 of 5 rounds | about 1–2 s | 90 s per seat |
| `room` | info | ≥ max(3, 40 % of seats) change occupancy or lean within 3 s → per-seat alerts except `empty` / `back` / `phone` are held for 20 s | – | – |

Detection rounds run at 2–5 per second (page setting, default 3) [code]. Two design facts shape the script: (a) the 90 s
cooldown means a second event of the same signal at the same seat (or anywhere, for `aisle`) inside 90 s is silent by
design; (b) three seats changing inside 3 s trigger room suppression. The schedule therefore puts **one action at a time**
and spaces aisle episodes 120 s apart.

## 3. Fixed before the session (changing any of these after the first held-out block voids the result)

1. This protocol, the event definitions (§4), the alert rules (§5), the metrics (§6) and the targets (§7).
2. The scripted schedule for the room actually used (§8), generated before the day, printed, and its **sha256 recorded in
   the repo** (same rule as other locked sets: files in `~/LENSIQ-field/evals/exam-seatwatch/`, hash in the repo).
3. The dev / held-out split (§12).
4. Page settings, written on the session record (§14): build commit, detector, rounds per second, tiles on / off, minimum
   leave time, phone off, face count off, accommodations none, evidence clip off.
5. Seat polygons are drawn once per camera before block 1 and exported; they are redrawn only if a camera is moved, and
   that is logged.

## 4. Event definitions (ground truth = a physical fact the labeller can see)

Times are the labeller's, from the room clock (§13). "Scoreable" = long enough that the alert had time to appear; shorter
real events are **grey**: they are written down, they can never be a miss, and an alert on them is not false.

| Code on the sheet | Physical fact | Start / end | Scoreable when | Scripted length [proposed] | Signal it should raise |
|---|---|---|---|---|---|
| `LEAVE` | the person's body is off the chair and out of the taped seat zone | start: leaves the zone · end: seated again | away ≥ 35 s (grey: 20–35 s) | 70 s; long leaves 200–230 s (variant B), 320–350 s (variant A) | `empty` once; `back` at the end; `early` if away ≥ 195 s inside the minimum leave time and first time for that seat in the run |
| `AISLE` | at least one person stands or walks outside all taped seat zones, inside the camera view | start: first person outside · end: nobody outside | ≥ 23 s (grey: 4–23 s) and start ≥ 95 s after the previous aisle alert (cooldown) | 25 s on floor mark X | `aisle` |
| `SECOND` | a second person stands or crouches inside another person's taped seat zone while that person sits there | start: second person inside the tape · end: leaves | ≥ 20 s (grey: 3–20 s) | 30 s | `extra` (Watch); the Check stage is reported, not targeted |
| `LEAN` | a seated person's shoulder is across the tape line toward the same-row neighbour | start: shoulder crosses · end: back | ≥ 19 s (grey: 2–19 s) | 20 s | `lean` |
| `STAND` | a person stands upright at their own seat, feet inside the zone | start / end | – (signal not built) | 12 s | none; any alert it causes is a false alert with cause "standing" |
| `PHONE_DESK` / `PHONE_HAND` | a phone lies on the desk screen-up / is held above desk level | start / end | ≥ 15 s; optional block only (§9) | 20 s | `phone` |
| `STAFF_WALK` | the invigilator walks the aisles; the sheet says whether walk mode was on | start / end | – | 30 s | walk mode on: none · walk mode off: it is an `AISLE` event like any other |
| `DISTRACT` | stretching, picking up a dropped pen, jacket on / off, bag on the chair back, head down on the desk, turning to the clock | start / end | – | 5–30 s | none |
| `CAM_MOVED` | the camera or tripod was touched or shifted | time | – | – | none; opens the camera-moved window (§10) |
| `OTHER` | anything else the labeller thinks could matter (door opened, light switched, visitor) | start / end | – | – | none |

A real toilet break is a `LEAVE` like any other: the system is supposed to show it (as an Info fact with the time away).
A bag or jacket left on the chair does not change the fact that the seat is empty.

## 5. True alert, missed event, false alert

**Matching rule (all signals).** An alert matches a labelled event when it has the same signal, the same seat (`aisle`: any
seat, room-level) and its timestamp lies between **5 s before the labelled start and H + 15 s after it** (H from §2; 10 s
for detection rate and gates, 5 s for hand timing) [proposed]. For `back` the reference is the labelled end of the `LEAVE`
(window −5 s … +15 s). One alert matches at most one event and one event at most one alert.

| Outcome | Definition |
|---|---|
| **True alert** | matches a scoreable or grey event |
| **Late alert** | right signal and seat, the event is still going on, but after the window. Counts as a **miss** for recall; is **not** a false alert; reported on its own line |
| **Missed event** | a scoreable event with no alert inside the window |
| **False alert** | an alert of `empty`, `back`, `early`, `extra`, `aisle`, `lean` (or `phone` when it is on) that matches no labelled fact at that seat and time |
| **Repeat** | a later alert for a fact that is still true (the Check stage of `extra`, a re-fire after the cooldown): neither true nor false; counted once in "repeats" |
| **Not an alert** | `room`, `roommute`, `setup` events: counted on their own line. Alerts held by room suppression are read from the page's counter |
| **Unsure** | the labeller's sheet and the schedule cannot settle it (§13). Reported separately, and counted as false in a second "worst case" line |

**Per signal, with the cases fixed in advance:**

| Case | `empty` / `back` | `extra` | `aisle` | `lean` |
|---|---|---|---|---|
| Toilet break, scripted leave | true (that is the product: seat + time away) | – | true if the person is in view outside the seats ≥ 8 s | – |
| Person present but not found (head on desk, hidden by the row in front, dark clothes) → "empty" shown | **false**, cause "person missed" | – | – | – |
| Bag or jacket on the chair of a person who left → no "empty" | **miss**, cause "object on chair" | – | – | – |
| Bag or jacket on a chair → shown as a second person | – | **false**, cause "object" | – | – |
| Standing up at the own seat → "empty" here, or "second person" in the seat behind | **false**, cause "standing" | **false**, cause "standing" | false if shown, cause "standing" | – |
| Stretching, jacket on / off, turning round | false if shown | false if shown | false if shown | false if shown (the shoulder did not cross the tape) |
| Dropped pen, bending under the desk ≤ 10 s | false if shown (cannot reach 20 s) | – | – | false if shown unless the shoulder really crossed the tape ≥ 4 s (then grey) |
| Invigilator walking, walk mode **on** | – | false if shown | false if shown | – |
| Invigilator walking, walk mode **off** | – | true if the invigilator is inside a seat's tape with the candidate ≥ 5 s (it is a fact; reported in the "staff" sub-line) | true (a person is in the aisle; "staff" sub-line) | – |
| Neighbour in the row behind or in front overlaps through perspective | false, cause "wrong seat" | false, cause "wrong seat" | – | false, cause "wrong seat" |
| Right fact, wrong seat number | false at the shown seat **and** a miss at the real seat | same | – | same |
| Second event inside the 90 s cooldown | – | not scoreable (by design) | not scoreable | not scoreable |
| Camera bumped | all alerts in the camera-moved window are counted in §10, not in the main rate | same | same | same |
| Light switched, door opened, many people move at once | `room` event = not an alert; per-seat alerts shown anyway are judged as above | same | same | same |

Every false alert gets one **cause code** from a fixed list: `person-missed` · `object` · `standing` · `wrong-seat` ·
`staff` · `posture` (stretch, bend, turn) · `light` · `camera-moved` · `unknown`.

## 6. Metrics

| Metric | Formula | Interval | Reported per |
|---|---|---|---|
| **Event recall** | matched scoreable events ÷ scoreable events | Wilson 95 % | signal × camera position × detector; then by row (front / back), light, object-on-chair |
| Precision | true alerts ÷ (true + false alerts) | Wilson 95 % | signal |
| **False alerts per seat-hour** | false alerts ÷ (drawn seats × monitored hours) | exact Poisson 95 % | all signals together, and per signal; `aisle` also per room-hour; Info level and Watch / Check level separately |
| **Time to alert** | alert time − labelled start | median, 90th percentile, max | signal |
| Time-away error | \|`back.dur` − labelled away time\| | median, 90th percentile | – |
| Detection rate | rounds per second shown by the page, noted at the start, middle and end of each block | min / median | device |
| Late alerts, repeats, room events, held alerts, unsure | counts | – | block |

Seat-hours count only seats that are drawn **and** assigned to a volunteer. Draw no polygons on unused desks.
Wilson and Poisson are worked in a spreadsheet (the `wilson` helper exists in `LQExam`; no scoring tool exists for this
kit: building one needs the owner's approval).

## 7. Targets — **[proposed] for the owner to confirm before the date is set**

| # | Metric | Proposed target | What must be seen [calc] | Judged on |
|---|---|---|---|---|
| T1 | Recall: `empty`, `back`, `aisle` | Wilson 95 % lower bound ≥ 80 % each | ≥ 55 of 60 · ≥ 63 of 70 · ≥ 65 of 72 | held-out, normal light, the camera position named before the session |
| T2 | Recall: `extra` (Watch), `lean` | Wilson 95 % lower bound ≥ 70 % each | ≥ 49 of 60 | same |
| T3 | Recall: `early` | report only | 12 of 12 would give a lower bound of 75.7 %, so no lower-bound target is reachable | same |
| T4 | False alerts, all signals | ≤ 3 per 30-seat, 3-hour session = ≤ 0.033 per seat-hour observed; of these Watch / Check ≤ 1 | 0 seen → 95 % upper bound 3.7 per session (two-sided; 3.0 one-sided) · 3 seen → 8.8 | **variant A only** |
| T4b | False alerts, variant B | report only; > 0.5 per seat-hour (10 or more in 19.2 seat-hours) = fix before variant A | 0 seen in 19.2 seat-hours → upper bound 0.16 per seat-hour (one-sided) = up to 14 per 30-seat exam: cannot confirm T4 | variant B |
| T5 | Time to alert | median ≤ H + 5 s; 90th percentile ≤ H + 10 s | – | held-out |
| T6 | Time-away error | median ≤ 10 s | – | held-out |
| T7 | Detection rate on the mid-range laptop | ≥ 2 rounds per second for the whole session | – | all blocks |
| – | `phone`, standing, camera moved, detector A/B, corner cameras, dim and backlit blocks | report only, no target, no claim | – | – |

Outcome per signal [proposed]: **pass** → the number goes into `docs/EXAM.md` and `docs/ACCURACY-CLAIMS.md` with n, the
interval and "source: field (mock exam, adult volunteers, scripted)". **Fail** → the signal keeps its "experimental" label
(or is off by default in that condition); nothing is removed. Mode A's overall status is the owner's decision after the
report.

## 8. Sample size, the script and the two variants

**Why about 60 events per signal [calc].** With 60 scoreable events, 54 found (90 %) gives a Wilson 95 % lower bound of
79.9 %, 55 found gives 81.9 %; 49 found (81.7 %) gives 70.1 %. With 24 events even 24 of 24 gives only 86.2 %, and 22 of
24 gives 74.2 %. So 60 is the smallest round number where "about 90 % observed" supports "at least about 80 %".

**The slot.** One slot is a fixed sequence, one action at a time, read by each volunteer from a cue card and the room clock:

| Offset in the slot | Who | Action | Label | Expected |
|---|---|---|---|---|
| +0:00 | mover (seat A) | stands up and walks to the nearest floor mark X (some slots: leaves a bag or jacket on the chair) | `LEAVE` starts | `empty` at about +0:20 |
| +0:05 → +0:30 | mover | stands still on X | `AISLE` 25 s | `aisle` at about +0:13 |
| +0:35 → +1:05 | mover | stands or crouches beside the person at seat B, inside B's tape | `SECOND` 30 s | `extra` Watch at about +0:40 |
| +1:10 | mover | seated again at A | `LEAVE` ends (70 s) | `back` |
| +1:18 → +1:38 | leaner (seat C) | leans so the shoulder crosses the tape toward same-row neighbour D | `LEAN` 20 s | `lean` at about +1:22 |
| +1:43 → +1:55 | seat E | half of the slots: stands at the own seat 12 s; the other half: one distractor from the fixed list | `STAND` / `DISTRACT` | nothing |
| +1:15 → +1:45 (2 slots per block; 6 in variant A) | invigilator | switches walk mode on, walks the aisles, switches it off | `STAFF_WALK` | nothing |
| +1:12 (some slots) | long leaver (seat F) | walks straight out of the room; returns after 200–230 s (variant B) or 320–350 s (variant A), which lands between +0:32 and +1:02 of a later slot | `LEAVE` long | `empty`, `early`, `back` |

Seats A, B, C / D, E, F are drawn by a seeded shuffle that balances how often each seat plays each role; C and D are always
side by side in one row; a seat on a long leave is skipped until it is back. Long leaves are timed so that the walk
through the aisle falls inside the 90 s aisle cooldown of that slot's scripted aisle event and cannot silence the next one. Draft schedules and cue cards are in
`schedules/` (variant B: 8 seats in 2 rows × 4, seed `lensiq-seatwatch:v2-8seats:draft1`; variant A: 30 seats in 5 rows × 6,
seed `lensiq-seatwatch:v1-30seats:draft1`). **They are drafts**: when the room and head-count are known the schedule is
regenerated with the same rules, printed and locked by sha256 before the day. They were produced with a one-off script
that is not part of the kit (documents only this round).

**Variant A — 30 seats × 3 hours (the one that can judge the false-alert target).**

| Item | Value |
|---|---|
| People | 30 adult volunteers, 1 operator (owner), 1 labeller (2 recommended: front half / back half), 1 invigilator |
| Monitoring | one run of **180 min**, no breaks (toilet breaks happen for real and are labelled); minimum leave time set to 60 min |
| Script | 60 slots × 180 s (the slot above, then 60 s of quiet writing); 12 long leaves (5–6 min away) starting in the first 53 min |
| Scripted events [calc] | `empty` 72 · `back` 72 · `aisle` 60 · `extra` 60 · `lean` 60 · `early` 12 · stand 30 · distractors 30 · staff walks 6 |
| Seat-hours [calc] | 30 × 3 = **90** → 0 false alerts proves < 3.0 (one-sided) per session |
| Time in the room | setup 60–90 min before people arrive · volunteers about **3 h 40 min** (briefing and consent 30, session 180, close 10) |
| Dev / held-out | the whole run is held-out; the dev data comes from an earlier variant-B day or a 48-min rehearsal with ≥ 4 people |
| Caveat | one scripted visit every 3 minutes is busier than a real exam; the false-alert rate is for this script, and says so |

**Variant B — 6 to 10 volunteers (draft schedule written for 8).**

| Item | Value |
|---|---|
| People | 6–10 adult volunteers (a slot needs 6 seats), operator, labeller, the operator doubles as invigilator |
| Blocks | each block = one monitoring run of **24 min** = 12 slots × 120 s; minimum leave time left at 30 min so long leaves count for `early`; 5-min break between blocks |
| Dev session | blocks D1–D2 = **48 min** scripted (may be the same morning, or another day with ≥ 6 people) |
| Held-out session | blocks H1–H5 normal light + H6 light variants (12 min dim, 12 min backlit) = **144 min** scripted |
| Scripted events per block [calc] | `empty` 14 · `back` 14 · `aisle` 12 · `extra` 12 · `lean` 12 · `early` 2 · stand 6 · distractors 6 · staff walks 2 |
| Held-out, normal light, H1–H5 [calc] | `empty` 70 · `back` 70 · `aisle` 60 · `extra` 60 · `lean` 60 · `early` 10 |
| Seat-hours with 8 seats [calc] | H1–H5: 16.0 · H1–H6: 19.2 · with dev: 25.6 → 0 false alerts in 19.2 proves only < 0.16 per seat-hour |
| Time in the room | setup 60 min · dev about 1 h 15 min · held-out about **3 h 25 min** for volunteers (briefing and consent 25, blocks 144, breaks 25, camera nudge 5, close 5) · whole day about 6 h with lunch |
| With 6 volunteers | same slots and counts; seat-hours fall to 14.4 (H1–H6) |
| With 10 volunteers | same counts; seat-hours 24.0 (H1–H6) |
| Caveat | an event every 30–40 s is far denser than an exam: good for recall, weak and pessimistic for false alerts |

Missed cues are not repeated: a volunteer who misses a cue skips it, the labeller strikes the row, and the count of
scoreable events falls. If a signal ends below 55 scoreable held-out events, its target is reported as "not enough events".

## 9. Phone (optional extra, never a claim)

Phone detection stays **off** in every block above. If the owner wants a number: one extra block P after the held-out
blocks, 16 min, only the seats in rows 1–2, phone signal switched on, 8 slots × 120 s with three phone events per slot at
different seats (`PHONE_DESK` 20 s or `PHONE_HAND` 20 s) = 24 events, plus calculator, pencil case and wallet on the desk
as distractors. Volunteers use their own phone, screen locked. Reported as "k of 24, rows 1–2, optional" with no target
[proposed]; 24 of 24 would still only give a lower bound of 86.2 % [calc].

## 10. Camera positions, height, lighting, camera nudge

| Position | Cameras | Notes |
|---|---|---|
| P1 front wall, centre, facing the candidates | 1 | the position named for T1–T4 unless the owner picks another before the day [proposed] |
| P2 two opposite high corners (layout B of the assessment), lens ≥ 90° if available | 2 (each on its own laptop; each seat is assigned to the nearer camera before the session) | diagonal occlusion was never calculated: this is the first look |
| P3 back wall, centre, looking at the candidates' backs | 1, only if a fourth device is free | optional |

- Height: lens **≥ 2.6 m** for all positions; if the mount allows, P1 is repeated at 3.0 m in the dev session only.
- All positions run **at the same time** on the same events (one laptop per camera), so positions do not add session time.
  With fewer devices, P1 has priority, then P2.
- Written down per camera (no photo with people): height, distance to the nearest and farthest row, lens angle, tilt,
  resolution delivered by the browser, rounds per second, tiles on / off.
- Lighting [proposed]: **normal** = all room lights on, blinds closed behind the candidates (blocks D1–D2, H1–H5, variant A);
  **dim** = half the lights (first half of H6); **backlit** = blinds open behind the candidates or a window in view (second
  half of H6). Lux at a front and a back desk is noted if a meter or phone app is at hand; the page's own lighting verdict
  is noted for each.
- **Camera nudge:** after the last held-out block, monitoring still on, volunteers seated: the operator pushes the tripod
  or mount by about 5 cm. Five minutes are observed. Reported: number and type of alerts in those 5 min, and whether
  anything on the page told the operator (expected today: nothing). These alerts are outside the main rates.

## 11. Detector A/B: COCO-SSD vs YOLOX-Nano without storing video

The commit that switches the hall detector carries its own before / after numbers on public still images (the fixed sets
of the assessment, §3 there). This session adds the **paired field comparison**:

- **Method 1 (default, no recording).** Two identical webcams are fixed side by side at P1 (lens centres ≤ 10 cm apart),
  each on its own laptop of the same model. Laptop 1 serves the build at the commit **before** the detector switch
  (COCO-SSD), laptop 2 the build **after** it (YOLOX-Nano). Same seat grid drawn on both, same settings, same live
  session, same labels. After block H3 the two laptops swap cameras (and the polygons are checked) so that a difference
  in camera or laptop is not read as a difference in detector. Stored: event logs only.
- **Reported:** per signal, a 2 × 2 table of scoreable events (found by both / only COCO-SSD / only YOLOX-Nano / neither),
  the two recalls with Wilson intervals, false alerts per seat-hour for each, rounds per second for each. No pass / fail:
  the switch is already decided; this documents it.
- **If only one laptop of the mid-range class exists:** it runs YOLOX-Nano at P1 (that is the product); COCO-SSD runs on
  whatever second device there is and its rounds per second are written next to its numbers. Alternating blocks on one
  device (A, B, B, A) is the last resort: not the same events, labelled "unpaired".
- **Method 2 (only with recording consent).** A separate webcam records video without sound with the operating system's
  camera app (the product never records in this kit; the evidence clip stays off). The recording is for the **labeller's
  disagreements only**. It cannot be replayed through the page today (no replay path exists, and none is built in this
  round), so it does not replace method 1.

**If a recording is made, all of these hold [proposed]:** the consent form's option B is ticked by **every** person in the
room (one "no" = no recording for the whole session); video only, microphone off; file on the owner's laptop in an
encrypted folder, never uploaded, mailed, put in the repo or used for training; seen only by the owner and the labeller;
deleted on the date written on the form (proposed: within 14 days of the session) and the deletion noted on the session
record. Counsel is asked about this before it is used (README).

## 12. Dev / held-out split

- **Split by session, fixed here:** variant B blocks D1–D2 = **dev**; H1–H6 = **held-out**; variant A = held-out.
- Dev data may be used to fix the setup (camera tilt, polygon drawing habit, rounds per second, tiles, whether the
  schedule is doable). Thresholds in `lensiq-exam.js` are **not** changed in this round at all.
- The held-out event logs are not opened until the dev numbers and any setup change are written on the session record.
  After the first held-out block starts, nothing changes. Any change after that = a new held-out session.
- Held-out results are reported once, whatever they are. A block is dropped only for a reason written down before its
  log is opened (camera fell, power cut, fire drill).

## 13. Roles, the labeller, the clock, disagreements

| Role | Does | Does not |
|---|---|---|
| Operator (owner) | sets up, draws seats, starts / stops each run, switches walk mode on scripted staff walks, exports logs, keeps the session record | label events |
| **Labeller (second person)** | fills the label sheet from the room clock (`LABEL-SHEET-HALL-SEATWATCH.md`) | see the camera page, the dashboard or any alert sound; discuss alerts with the operator before the sheet is handed in |
| Invigilator (may be the operator in variant B) | scripted walks, hands out paper | – |
| Volunteers | sit, write a practice paper, follow their cue card | – |

- The labeller sits where every seat is visible and no screen is. Laptop sound off, screens turned away.
- The sheet is pre-printed from the schedule; the labeller ticks "on time" (within ± 3 s) or writes the real time, and adds
  every unscripted event (real toilet breaks, someone standing, a visitor).
- **Clock.** The room clock is one large count-up timer with seconds (a tablet or spare phone on a stand), started from
  00:00 at the moment monitoring starts for the block; cue cards, the schedule and the label sheet all use that time.
  At the start and at the end of each block the operator writes down each laptop's clock time against the timer; alert
  timestamps are converted to timer time with those two readings before matching.
- **Disagreements, in this order:** (1) every alert without a matching label and every scoreable label without an alert is
  listed by the operator after the sheet is handed in; (2) operator and labeller check each one against the printed
  schedule and the labeller's notes; a labelled fact wins over the system, the system never proves a fact; (3) if a
  consented recording exists, the two watch that minute together and the labeller decides; (4) still open → **unsure**
  (§5). Without a recording an event the labeller did not see counts as a false alert: this errs against the product,
  on purpose.
- With two labellers, both mark the first dev block for the whole room; agreement (same event, start within ± 5 s) is
  reported, and differences are settled before the held-out blocks.

## 14. Session record and report template

**Session record (one per session; no names of volunteers, no photos of people).**

| Field | Value |
|---|---|
| Session id · date · variant (A / B) · dev or held-out | |
| Room: size, rows × seats, row pitch, desk width (photo of the empty room: file names) | |
| Volunteers present (count only) · consent forms collected (count) · recording: no / yes, delete by … / deleted on … | |
| Schedule file · sha256 · commit where the hash was recorded | |
| Per device: laptop model / CPU / RAM, browser version, build commit, detector, camera model, position, height, distances, resolution delivered, rounds per second (start / middle / end), tiles | |
| Settings: minimum leave time, phone off, face count off, clip off, accommodations none | |
| Clock difference per block (start / end, seconds) | |
| Light per block: normal / dim / backlit, lux front / back, page verdict | |
| Changes after dev (what, why, when) | |
| Dropped blocks and the reason written before opening the log | |

**Report (owner's format).**

1. **Built / done:** sessions run, variant, people, positions, devices, what was fixed in advance and where the hashes are.
2. **Deferred + why.**
3. **Numbers vs targets** (source: field, mock exam, adult volunteers, scripted; dev and held-out in separate tables):

| Signal | Scoreable events | Found | Recall | Wilson 95 % | Target | Pass? | Late | Median / p90 time to alert | False alerts | Causes |
|---|---|---|---|---|---|---|---|---|---|---|
| empty | | | | | LB ≥ 80 % | | | | | |
| back | | | | | LB ≥ 80 % | | | | | |
| aisle | | | | | LB ≥ 80 % | | | | | |
| extra (Watch) | | | | | LB ≥ 70 % | | | | | |
| lean | | | | | LB ≥ 70 % | | | | | |
| early | | | | | report | | | | | |

| False alerts | Count | Seat-hours | Per seat-hour | Poisson 95 % | Per 30-seat 3-h exam | Target | Unsure (worst case) |
|---|---|---|---|---|---|---|---|
| all signals | | | | | | ≤ 3 (variant A) | |
| Watch / Check only | | | | | | ≤ 1 | |

   Then: by camera position; by row; by light (H6); object on chair; standing (alerts caused); staff walks; camera nudge;
   detector A/B table; rounds per second; time-away error; optional phone block.
4. **Risks:** what the numbers do not cover (real exams, minors, other rooms, dense seating, other cameras), fairness notes
   (people who had to stand or leave, anyone the system missed repeatedly, with the cause and without identifying them).
5. **Next step**, then wait for approval.

An **independent reviewer** recomputes the tables from the exported logs and the label CSV before the report goes to the
owner (working rule: every round is re-measured by someone who did not produce the numbers).

## 15. Privacy rules for the session

- Adults only (20 or older), written consent (`CONSENT-HALL-SEATWATCH-TH.md`, draft: counsel reviews before use), free to
  stop at any time, no effect on grades, employment or anything else.
- A door sign for anyone entering (`EQUIPMENT-HALL-SEATWATCH.md`). A person who has not signed does not enter the camera
  view while monitoring runs; the operator pauses if someone must come in.
- Processing on the device; nothing is uploaded; laptops offline during the session if possible.
- Stored: event logs (time, seat number, signal, level, duration), the label CSV, the session record, photos of the
  **empty** room. **No names on any of them.** Cue cards are handed out at random and no list of who sat where is kept,
  so a seat number does not lead to a person after the session (counsel question in the README).
- No screenshots or photos with people in them. No face processing: the face count stays off.
- A volunteer who stops may ask, before the end of the day, for the rows of their seat to be removed; they tell the
  operator the seat number.
