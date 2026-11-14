# Product Check stream F: Japanese / Korean name guard, P9 recall, live scan, adverts plan (2026-11-13)

> Branch `pc-f`. **Nothing is deployed; no paid AI call was made.** Every number states its source; all are **synthetic**
> (no field data). Locked sets and their sha256 are in `evals-locks/pc-f.sha256` (owner rule 2026-11-13), committed
> before any measurement; hold-outs were written by independent agents that did not read the code.

## สรุปสำหรับเจ้าของ

- **ตัวกันชื่อภาษาญี่ปุ่น / เกาหลี** (`lensiq-pc-guard.js`, commit แยก): ช่องชื่อ (氏名 患者 お名前 保護者 被保険者 / 성명 환자명 이름 보호자 수령인 받는분 ฯลฯ)
  ชื่อหน้าคำเรียก (様 さん 殿 / 님 씨 어르신) คำเรียกญาติ + ชื่อ ผู้ส่ง (〜より / 드림) ชื่อที่ OCR เว้นวรรคทีละตัว เบอร์โทรญี่ปุ่น / เกาหลี
  (มือถือญี่ปุ่น / เกาหลีไม่ถือเป็นเบอร์บริษัท) วันเกิดแบบศักราชญี่ปุ่น เลขบัตรประกัน / ผู้ป่วย / My Number / เลขประจำตัวเกาหลี และที่อยู่
  - ผู้ตรวจอิสระพบจุดที่หลวมลง 1 จุด (เลขบัตรประชาชนไทยที่บังเอิญเป็นบาร์โค้ด 45/49/880 ในข้อความไทยที่มีอักษรญี่ปุ่น/เกาหลี) **แก้แล้ว** commit แยก `d893431` พร้อมเทสต์
  - ชุดทดสอบอิสระชุดใหม่ (202 รายการ เขียนโดย agent อื่น ล็อกก่อนวัด) main → ใหม่: ข้อความส่วนตัวถึง AI โหมดข้อความ **13 → 7**
    โหมดภาพ **13 → 6** แตะครั้งเดียว (ผู้ทดสอบ) **2 → 2**; จับชื่อ/ข้อมูลที่มีคำบอก **15.2 % → 83.4 %** (เป้า 90 % ไม่ผ่าน) ฉลากสินค้าถูกปฏิเสธ 0 → 0
  - **ยังไม่ถึงเป้า 0** (แย่กว่าเดิมไม่มี) ที่เหลือเกือบทั้งหมดคือชื่อที่ไม่มีคำบอกเลย อยู่บนกล่องยาร่วมกับโน้ต → ต้องให้เจ้าของตัดสิน (ด้านล่าง)
  - ชุดล็อก P7 / P7b ยัง 0/260 และ 0/614 ข้อความคงที่ 1,773 ข้อความ: ไม่มีการตัดสินฉลากสินค้าเปลี่ยน ทุกการเปลี่ยนคือ "ลบเพิ่ม"
- **P9 โหมดเดินทาง** (`lensiq-pc-travel.js`): ชุดอิสระชุดใหม่ 188 ฉลาก recall **0.741 → 0.907** (เป้า 0.85 ผ่าน) precision 0.964 → 0.971
  (เป้า 0.95 ผ่าน) ฉลากที่ไม่ใช่ยาไม่มีชื่อยาผิด 1.000 ประเทศถูก 0.66 → 0.84 ตัวเลขบนการ์ด (0.811) **ยังไม่เปลี่ยน** รอเจ้าของ
- **สแกนสด**: อ่านแบบทีละบรรทัด รายการ "เลขทะเบียน ✓" ขึ้นทันทีที่บรรทัดนั้นอ่านเสร็จ ไม่ต้องรออ่านครบ 40 บรรทัด
  **ยังไม่ได้ตัวเลขเวลา**: เครื่องถูกใช้หนัก (load 15–40 จาก session อื่น) และเครื่องมือวัดที่ล็อกไว้รอผิดจังหวะ (ต้องแก้แล้วล็อกใหม่) ยังต้องวัดบนโทรศัพท์จริง
- **โฆษณา + AI**: ไม่ได้เรียก AI (งบคงเหลือไม่มีตัวเลขปัจจุบันในเอกสาร) เตรียมแผนวัด เกณฑ์ และค่าใช้จ่าย ≈ 0.3–1.8 USD (`ADVERT-AI-SCOPED-EVAL.md`)

## 1. Japanese / Korean personal-data guard

### 1.1 Locked sets (before any guard change)

| Set | Who wrote it | Items | Personal values | sha256 |
|---|---|---|---|---|
| `docs/product-check/pcf-jako-testset.json` (dev, `tools/pc-jako-testset.mjs`) | builder | 149 (117 personal, 32 products) | 209 | `7df58ddd…` |
| hold-out 1 `~/LENSIQ-field/evals/pc-f/holdout-jako/` | independent agent | 202 (54 products) | 320 | `96ff6ccb…` |
| **hold-out 2** `~/LENSIQ-field/evals/pc-f/holdout-jako-2/` (fresh, the official figure) | another independent agent | 202 (54 products) | 291 | `2423613c…` |

Scorer `tools/pc-guard-jako-score.mjs` and test `tests/unit/pc-guard-jako.test.js` locked with the sets. A value is
"removed" only if every character of every occurrence is inside a guard span. A value **reaches the AI** in text mode when
the gate allows the capture and the value is not removed; in image mode when the gate allows and the photo is not blocked;
on the tester one-tap path when the gate allows and the guard, `possibleNames` and `autoBlock` find nothing.

Hold-out 1 was measured once (main: 13 text / 10 image / 1 one-tap leaks; first build 5 / 5 / 2: the one-tap count rose
because a Korean EAN-13 was no longer misread as a Thai ID, which had blocked one-tap by accident). It then became a dev
set; the fixes after it were measured on hold-out 2, locked before it was read.

### 1.2 Numbers (source: synthetic, hold-out 2, n = 202 items / 291 values; 95 % Wilson)

| Measure | main `1ef19c6` | stream F `9aa0948` | Target |
|---|---|---|---|
| Personal values reaching AI, text mode | 13 | **7** | 0 (missed) |
| Captures with personal data whose photo would be sent, values on them | 13 | **6** | 0 (missed) |
| Tester one-tap leaks | 2 | **2** | 0 (missed, not worse) |
| Recall, values with a field word or a form of address (n = 217) | 0.152 [0.11–0.21] | **0.834** [0.78–0.88] | ≥ 0.90 (missed) |
| Recall, all values incl. bare names (n = 291) | 0.117 | **0.749** [0.70–0.80] | reported |
| Product labels refused by the gate (n = 54) | 0 | **0** | 0 added (met) |
| Product labels with a false redaction / photo blocked | 3 / 3 | 3 / 3 (different labels: 爺, 인절미, 아빠) | ≤ 2 % (missed, as before) |

The 7 remaining text-mode values are all on product + personal captures (a pack with a note or a name tag): 3 names with
no cue (one after 이름표 with a class "4학년 1반" in between), a phone written "0 10-…", 2 names after a field word the rules do
not know ("수령 확인 :", a mixed 尹 美智 / 윤미지 line) and 1 kanji + kana name with a space before さんへ (ゆみ子).
Dev set: 0 / 0 / 0 leaks, cued recall 1.000 (not evidence: the builder wrote it).

### 1.3 Regression checks (synthetic)

- P7 / P7b locked sets (languages measured, synthetic: Thai 78, English 79, Chinese 63, Japanese 28, Korean 12 items; not a claim for Japanese / Korean names without a cue word, which still reach the AI on the JA / KO hold-outs, `docs/product-check/PC-JK-RESULTS.md`) (p7b languages: Thai 319, English 161, Chinese 51, Japanese 56, Korean 27 items) (`live-leak-score.mjs`, committed guard `2bcd23bc…` after the review fix; earlier `8f5f89de…` gave the same): personal items to AI **0/260, 0/614**, text and image,
  single and merged readings; one-tap-eligible product labels 217/360, manual gate 299/360 (unchanged).
- Same-frame stress (P001 + 308 personal captures): 0 sent.
- Old vs new guard on all 1,773 fixed texts (`guardcompare-run3.log`): 97 texts changed, **0 product decisions changed**;
  every change adds a removal or blocks a photo on a text the gate already refused; the 2 "lost" detections are merged into
  a larger span (an address line that holds the ID; a whole name line).
- Unit: `pc-guard*` + live / session / photo / backend auto / features / refusal / AI / on-device 109 / 109.

## 2. P9 travel mode recall (`lensiq-pc-travel.js`)

24 INNs added to the own name table, German / Portuguese / Malay / Thai / Chinese spellings, German salts written into
the word, an OCR look-alike pass (0/o, i/l/1) for Latin names of 7+ letters, more medicine cue words, origin wording.
TMT ingredient shards rebuilt (3 keys). No new data source.

| Set (source: synthetic) | n | Precision | Recall (excl. out-of-table) | Out-of-table | Negatives clean | Country |
|---|---|---|---|---|---|---|
| Fresh hold-out 2 (independent, `f91d003e…`), main | 188 | 0.964 | 0.741 [0.68–0.80] | 0.688 | 1.000 | 0.66 |
| **Fresh hold-out 2, stream F** | 188 | **0.971** [0.94–0.99] | **0.907** [0.86–0.94] | 0.938 | **1.000** | **0.84** |
| Old hold-out (now dev), stream F | 173 | 1.000 | 0.981 | 0.952 | 1.000 | 1.000 |
| Builder's fixed set | 122 | 1.000 | 1.000 | 0.714 | 1.000 | 1.000 |

Targets: precision ≥ 0.95 met, recall ≥ 0.85 met. 4 of the 6 "false INNs" on hold-out 2 are the set's US spelling
"simethicone" for our INN "simeticone" (counted as written). Misses left: caffeine and ascorbic acid without a medicine
word (kept weak on purpose), calcium carbonate (excipient word), and a few combinations. The card still shows the
released 0.811 (owner decision 5, `docs/accuracy-figures.json`) until the owner decides.

## 3. Live scan (on-device, no new data)

- Progressive reading: `LQPCRun.ocr(..., {onLine})` hands the lines read so far; the live scan ticks the checklist
  (registration number, ingredients) as soon as a line shows it, before the remaining lines of the first reading are read.
  Ticks only: the partial text is not applied, merged, shown or sent.
- Latency: the harness `~/LENSIQ-field/evals/pc-f/live/live-latency.mjs` (locked) measures first result / first
  registration tick / full first reading, with and without a barcode, at CPU 1x and 4x. **Not measured this round.** The
  machine ran at load 15–40 from other sessions; one run timed out loading the page, the next two stopped after the first
  (cold) trial because the harness waits only 30 s for the "point at the label" hint while the readings of the previous
  view still run. The harness needs that wait fixed (a harness bug, no change to what is measured) and a re-lock, then a
  run on a quiet machine and on a real phone. The one cold trial (CPU 1x, new code) showed the registration tick at
  4.6 s against 5.0 s for the full reading: one data point, not a figure.

## 4. Adverts scoped AI round

Plan, scoring rule and cost in `ADVERT-AI-SCOPED-EVAL.md`. No paid call.

## 4a. Independent review (2026-11-13)

A separate reviewer agent re-measured every number above on the committed code: all match (hold-out 2 main 13 / 13 / 2 →
7 / 6 / 2, cued recall 0.152 → 0.834; P9 0.741 → 0.907 recall, 0.964 → 0.971 precision, country 0.66 → 0.84; P7 / P7b
0/260, 0/614; 1,773 fixed texts: no product decision changed). Findings: (1) **blocker, fixed in `d893431`**: the JA / KO
EAN-13 barcode exception could hide a Thai ID that is also a valid 45 / 49 / 880 EAN-13 in a Thai text with some kana or
Hangul (reproduced; now only texts without Thai, regression tests added); (2) phone scanning is super-linear on very long
digit-heavy text (8,000 characters: 88 s on main, 175 s on the branch on a loaded machine; pre-existing, a CPU risk for the
Worker and the device, not a leak; to fix next); (3) the progressive ticks pass only to the checklist (no apply, merge,
storage or send; now a unit test); stale ticks after a scene cut also happen on main.

## 5. Decisions taken

- Hold-out 1 became dev after one measurement; a second fresh hold-out decides (no tuning on it).
- The JA / KO EAN-13 barcode rule (lowers false redactions on JA / KO packs) is limited to texts with no Thai after the review.
- P9: the fresh hold-out was locked before the travel change and not read before its one scoring; the added names came
  from the old (spent) hold-out misses.
- Bare-name rules are limited to forms that do not fire on the hold-out product labels (kinship word + spaced name; sender
  line); a stricter "no one-tap with Japanese / Korean script" rule was not built (owner decision below).
- Ascorbic acid and calcium carbonate not added as INNs (supplement / excipient words would cost precision).
- The travel card's figure is not changed (it is a claim users see).

## 6. Risks

- Hold-out sets are synthetic; real OCR of real Japanese / Korean labels is not measured.
- New CJK honorific and kinship rules can remove ordinary words on packs (3 / 54 product labels on hold-out 2).
- The live-scan change is not measured for latency yet.

## 7. Stream F2 (branch `pc-f2`, 2026-11-13/14): guard speed, latency harness, names without a field word

> Coordinator's order after the pc-f merge: no change to one-tap, the card figure or any spend (owner decisions 1-3 pending).
> Source of every number: synthetic. Locks appended to `evals-locks/pc-f.sha256` (reasons for each re-lock in the file).

สรุป (ไทย): ตัวกันชื่อทำงานเร็วขึ้นแบบเส้นตรงแล้ว (ข้อความเบอร์โทรยาว 8,000 ตัวอักษร จากหลายนาทีเหลือราว 0.05 วินาที ผลการตัดสินเหมือนเดิมทุกข้อความ)
เครื่องมือวัดเวลาสแกนสดแก้และล็อกใหม่แล้ว ยังไม่ได้วัด (เครื่องยังถูกใช้หนัก) รอบชื่อที่ไม่มีคำบอก: ชุดอิสระใหม่ (ชุดที่ 3 เน้นชื่อเปล่าบนกล่องสินค้า)
ข้อความส่วนตัวถึง AI จาก main **61 → 55** (ข้อความ) **57 → 50** (ภาพ) **48 → 26** (แตะครั้งเดียว) ยังห่างเป้า 0 มาก ชื่อเปล่าบนกล่องเกือบทั้งหมดกฎจับไม่ได้

### 7.1 Guard speed (a)

- Cause (independent review of pc-f): phone stretches tried pairwise on a run of groups, the maker-block check re-read per phone,
  `\d+…` / e-mail / road-word patterns re-scanned from every character, `^\s*` and `\n\s*` across new lines, and a lookbehind
  run at every position (`name:` cue). All rewritten to equivalent linear forms.
- Same answers: main vs the speed commit `6021ade`: 0 of 1,773 fixed texts and 0 of 1,517 JA / KO / P7 / P7b items changed.
- 8,000 characters of "010-1234-5678 " on one line: main 88-175 s (loaded machine), branch about 53 ms (CPU, fastest of 7).
- Locked relative test `tests/unit/pc-guard-complexity.test.js` (16 adversarial shapes; 8x text must cost ≤ 24x CPU time, and
  ≤ 25x an ordinary label of the same length). On main it times out (> 180 s; `~/LENSIQ-field/evals/pc-f/complexity-on-main-5ef01b5.log`).
  Two re-locks: measurement method (warm-up, then CPU time, interleaved, fastest of 7: wall-clock runs spread 5-176 ms at load
  10-40) and 5 more shapes from the review; the bounds never changed.

### 7.2 Latency harness (b)

`~/LENSIQ-field/evals/pc-f/live/live-latency.mjs` v2: the wait for the "point at the label" hint between trials was 30 s while the
previous view's readings still ran; now 120 s / 240 s at 4x. Nothing else changed (v1 kept). **Not run**: load stayed 10-40.

### 7.3 Names without a field word (c, option ค)

Fresh hold-out 3 (`holdout-jako-3/`, 201 items, 205 personal values, 140 of them with no cue; independent agent; sha256
`57c98929…`, locked before the guard round). Rules added: class / group lines, family word + full name, a given name before
할머니 / 할아버지, "to" lines (〜へ, 〜에게), spaced kana full-name lines, more person words (送り主, 注文者, 회원명, 원아, 이름은,
Name …), LINE / KakaoTalk IDs, member numbers, phones read with OCR letters; short bare kana / Korean name lines and a name before
a dose only stop the tester one-tap (preview highlight, nothing removed).

| Hold-out 3 (n = 201 / 205 values) | main `5ef01b5` | `f218dbf` (first measurement) | `e1549ff` (after the review fixes) | Target |
|---|---|---|---|---|
| Values reaching AI, text mode | 61 | 52 | **55** | 0 (missed) |
| Image mode | 57 | 47 | **50** | 0 (missed) |
| Tester one-tap | 48 | 23 | **26** | 0 (missed) |
| Recall, all values [95 %] | 0.385 [0.32-0.45] | 0.454 | **0.429** [0.36-0.50] | reported |
| Values without a cue removed (of 140) | 24 | 38 | **33** | reported |
| Recall, cued values (n = 65) | 0.846 | 0.846 | 0.846 | ≥ 0.90 (missed) |
| Products refused / false redaction (n = 70) | 0 / 7 | 0 / 8 | **0 / 7** | 0 added |

The `e1549ff` column is a second run on hold-out 3, after fixes driven by the independent reviewer's findings on other texts (not
tuned on hold-out 3). It gives back part of the gain (Korean class lines now need a nursery / school word; kanji-only two-word
lines are no longer names) to stop false removals on Chinese and Korean packs. Every measure is still better than main. Dev sets
(hold-outs 1 and 2, now dev): hold-out 2 text leaks 7 → 1.

Regression (synthetic): P7 / P7b locked sets 0/260, 0/614 (text, image, single, merged); 1,773 fixed texts vs main: 3 changed, all
added removals, no gate decision; unit `pc-*` + `backend-pc-*` 244/244.

Independent review of F2 (re-measured every claim: all match): blocker (a Korean given name starting like a family word, 형숙, lost
its removal) fixed with a test; false removals on Chinese / Korean packs fixed; remaining quadratic shapes (spaces, road words)
fixed and added to the locked test. Note: one-tap now also stops on short kana product words ("のどあめ"); preview only.

**Conclusion for the owner:** rules cannot find most bare names written on a pack (107 of 140 still missed on hold-out 3). Zero
leaks on Japanese / Korean labels needs a control that does not depend on finding the name, for example option ข of decision 1
(no tester one-tap on Japanese / Korean script) plus always the preview, or no photo, for Japanese / Korean labels.
