# Accuracy claims: inventory, format and register (round 16, item 3 "honest claims")

**Status:** written 2026-11-08, **before** any page text was changed (the round's "fixed test set first" rule). This
round measures nothing new. It makes every accuracy or performance claim on the product landing pages and the
one-pagers state three things: the **number**, the **test-set size (n)** and a **source label**. Where nothing has
been measured, the claim says **"not measured"**.

Sources of every number: [`ACCURACY.md`](../ACCURACY.md) (people counting, faces, the other camera pages),
[`docs/CROWD-ACCURACY.md`](CROWD-ACCURACY.md) (crowd), [`docs/GATE.md`](GATE.md) (plates), [`docs/EXAM.md`](EXAM.md)
(exam: nothing measured). The camera banners generated from [`docs/accuracy-figures.json`](accuracy-figures.json)
(`tools/accuracy-sync.mjs`) are unchanged by this round; the claim lists added here sit next to them.

Machine check: `tests/unit/accuracy-claims.test.js` reads the **register** (section 4) and fails when a page or an
en / zh dictionary does not carry the number, the n and the source label of a row, when the evidence quoted for a
row is no longer in its source document, when Crowd stops saying that it is not yet suitable for dense crowds, or
when a one-pager loses its "accuracy and source" table.

## 1. The claim format ("S3 format")

One claim = one line, in this order, in every language:

| | Thai | English | Chinese |
|---|---|---|---|
| shape | `<สิ่งที่วัด>: <ค่า> · n = <ขนาดชุดทดสอบ> · ที่มา: <ป้าย> (<ชุดข้อมูล>)` | `<what>: <value> · n = <test-set size> · source: <label> (<data set>)` | `<指标>：<数值> · n = <测试集规模> · 来源：<标签>（<数据集>）` |
| not measured | `<สิ่งที่วัด>: ยังไม่ได้วัด · ที่มา: หน้างานจริง (ยังไม่มีโครงการนำร่อง)` | `<what>: not measured · source: field (no pilot yet)` | `<指标>：尚未测量 · 来源：现场（尚无试点）` |

Rules:

- `n = …` is written with the Latin letter n and an ASCII "=", in all three languages, so the same token can be checked
  everywhere. It names the unit: crossings, frames, photos, people, scenes, visits.
- One number per claim where possible. A range ("−28% to +19%") is allowed when the source gives a range.
- A figure measured on the set that was used for tuning says so ("tuning set — optimistic"), in every language, using
  the `tuning` and `optimistic` qualifiers below. The test requires both on every register row whose evidence quotes a
  tuning set. When a held-out figure exists for the same claim, the held-out figure is the headline and comes first.
- A claim that is not a LENSIQ measurement (a published study) carries the label "published research".
- Every product page also carries one **field** line, because no customer site has been measured yet.

Source labels (the exact words the test looks for):

| id | Thai | English | Chinese | meaning |
|---|---|---|---|---|
| `synthetic` | ข้อมูลจำลอง | synthetic | 合成数据 | generated scenes / images (e.g. Gate demo set, QC bottles) |
| `public` | ชุดข้อมูลสาธารณะ | public dataset | 公开数据集 | public research data or public videos / photos (LFW, CASIA, MOT17, Wikimedia Commons) |
| `field` | หน้างานจริง | field | 现场 | a real customer site, pilot or the owner's own photos |
| `notmeasured` | ยังไม่ได้วัด | not measured | 尚未测量 | no measurement exists |
| `prelim` | เบื้องต้น | preliminary | 初步 | the reference itself is not final (Crowd: AI reference, human count pending) |
| `published` | งานวิจัยที่ตีพิมพ์ | published research | 已发表研究 | a figure from the scientific literature, not measured by LENSIQ |
| `dense` | ยังไม่เหมาะกับฝูงชนหนาแน่น | not yet suitable for dense crowds | 尚不适用于密集人群 | the Crowd statement required by the owner |
| `tuning` (qualifier) | ชุดที่ใช้ปรับค่า | tuning | 调参 | measured on the data the values were tuned on (LFW, PETS09-S2L1); not a source label on its own |
| `optimistic` (qualifier) | ดีเกินจริง | optimistic | 偏乐观 | goes with `tuning`: the figure is an upper bound |

## 2. Inventory of existing claims (grep before editing)

Searched: every `*.html` data-i18n text with a percentage or "x / y" and an accuracy word (แม่น, คลาด, ผลวัด, วัดกับ,
ถูกต้อง, ผิดพลาด, จำได้, อ่านถูก, นับต่ำ, ยังไม่ได้วัด), the en / zh dictionaries for "accuracy" / "准确", and every
`docs/ONE-PAGER-*.md`. "Owner" = which story may change the text this round.

### 2a. Pages owned by this story (changed this round)

| page / key | claim as found | number in source? | n shown? | source label shown? | action |
|---|---|---|---|---|---|
| exam.html `exam.l.betaB` | "demo, accuracy not yet measured in real exam rooms" | yes, EXAM.md "Accuracy — not measured yet" | — | no label | claim list added (3 "not measured" lines) |
| exam.html `exam.l.fair3` | face-detection miss rate across lighting / skin tones not measured | yes | — | — | kept; repeated in the claim list with the label |
| attendance.html `attendance.s5` (generated) | LFW 85%, Asian 66–76%, strangers 0.4% / 0.2% (≤ 1.15%), < 0.05% auto | yes, ACCURACY.md §2 | no | "public face photos" in words | kept (generated); claim list added with n + label |
| attendance.html `attendance.live2` | liveness "not measured" | yes, ACCURACY.md "no measurement of the liveness option" | — | — | repeated in the claim list |
| store.html `store.s5` (generated) | door-like +3%, crowds −28% to +19%, 1 in 5 counted events wrong | yes, ACCURACY.md §1 | no | "5 public videos" in words | kept (generated); claim list added with n + label |
| crowd.html `cr.acc2.r1–r5` | 26%, 37–59%, 1.2 people (31%), 0–2 of ~300, line 1 of 1 | yes, CROWD-ACCURACY.md | partly ("one clip") | "AI reference" in the intro only | each line gets n + "public dataset, preliminary"; new line r6 (30–50 people: 58%, the worst measured medium clip, was missing) |
| crowd.html (none) | **no plain statement that Crowd is unsuitable for dense crowds outside the collapsed panel** | — | — | — | visible note added: "not yet suitable for dense crowds" |
| retail.html `pd.r.aP` | "line-crossing totals off by about ±10–30% per day" | **no: ACCURACY.md has no per-day figure** (per-sequence −28% to +19%, door-like +3.2%) | no | "5 public videos" | **corrected** to the measured figures; claim list added |
| hr.html `pd.h.sci` | people detect lies about 54% (Bond & DePaulo 2006) | external study | no | no | label "published research" + n = 206 studies added |
| hr.html (none) | interview kit and camera observations: no accuracy statement | — | — | — | claim list added ("not measured"; face check-in figure with source) |

### 2b. Other pages (inventory only; owned by other stories or already generated)

| page / key | claim | source | label / n today | owner |
|---|---|---|---|---|
| gate.html `gate.acc.l1–l6`, parking / village `gk.acc.*` | "no field accuracy yet"; OCR / finder descriptions; field target ≥ 95% from ≥ 100 cars | GATE.md §3b | no synthetic / photo numbers on the page | S7 (section 5 gives the text in this format) |
| cameras.html `s187 s195 s198 s202 s206 s208 s217 accpilot`, customers / booth / driver / qc / signage `*.s4/s5` | generated figures | ACCURACY.md via accuracy-figures.json | dataset named in words, no n | generated (unchanged) |
| checkout.html `checkout.s4` | synthetic barcodes, wrong code 0.06% | ACCURACY.md §8 | "simulated images" | not in this story |
| cameras.html `cameras.new.p`, index.html `pd.n.sub` | exam / gate / queue / tables not measured on site | — | "not measured" | S1 / shared |
| about.html `about.s1.d`, `about.s3.d` | "daily error ≤ 5%" is a **pilot acceptance target**, not a measurement | PILOT-PLAN.md | says "criteria" | platform page (not changed) |
| solutions.html `sl.c.a4.y` | livestock detection not measured | — | "not measured" | S1 |
| exam-dashboard.html `exam.db.tPrec` | a column header for the on-site tally (precision with 95% CI) | computed on site | — | — |

### 2c. One-pagers (changed this round; prices untouched, they belong to S6)

| file | claim as found | problem | action |
|---|---|---|---|
| ONE-PAGER-RETAIL.md | "+3.2%, 93%" door-like; "−28% to +19%" crowds; "≤ 5%" | no n; the +3.2% is the tuning set; "≤ 5%" is a target | "accuracy and source" table added; the bullet now gives n and labels |
| ONE-PAGER-EVENTS.md | expression model "about 52% of 7 classes" | no n (346 faces, FER-2013), research-only data | table added; booth visitor counting "not measured" (ACCURACY.md §9) |
| ONE-PAGER-HR.md | "54%" lie detection (Bond & DePaulo) | external study, no label | table added with "published research"; face check-in figures with n |
| ONE-PAGER-TH.md / ONE-PAGER-ZH.md | "measured on public datasets"; "≤ 5%"; "54%"; dense crowds only as "undercounted" | no numbers / n; no plain dense-crowd statement; still says the site default is the research demo profile | table added (store, crowd, attendance, gate, exam); Crowd "not yet suitable for dense crowds"; profile line updated to the owner's round-16 decision (customer mode by default, research demo toggle off by default) |
| ONE-PAGER-FORTUNE.md | no accuracy claim | — | table added: "no accuracy figure — entertainment, not a measurement" |

## 3. Numbers per product (what the pages now say)

| product | claim | value | n | source | evidence |
|---|---|---|---|---|---|
| Exam | flags right / wrong in a real exam room | not measured | — | field (no pilot yet) | EXAM.md "Accuracy — not measured yet" |
| Exam | face-detection misses by lighting and skin tone | not measured | — | — | EXAM.md |
| Exam | phone / book detection on exam footage | not measured | — | — | EXAM.md |
| Exam hall (experimental) | faces 24–48 px wide found in a wide room view, current engine | 0% (0 / 195) | n = 195 faces in 47 frames (held out) | public dataset (Open Images V7 group photos; not exam-room footage) | docs/exam/FACE-ENGINE-RESULTS.md §7.1 |
| Exam hall (experimental) | the same, best option measured (full-range detector, 3 × 3 tiles); not switched on: 0.40 false boxes per frame, about 2 fps on an emulated mid-range laptop | 63% (122 / 195) | n = 195 faces (held out) | public dataset | docs/exam/FACE-ENGINE-RESULTS.md §7.1 |
| Exam lab | a second person in view read as "more than one person" (was 10%, 5 / 52). Stated as **an aid, not complete detection** on the invigilator-facing pages `exam.html` (`exam.l.cl5`) and `exam-dashboard.html` (`exam.db.nMulti`), in the one-pagers and in the pilot kit; the candidate notice on `exam-lab.html` says what is checked and carries no rate (owner decisions 2026-11-10, checked by `tests/unit/exam-face.test.js`). **≥ 90% is the bar for ever claiming "detects a second person" as a feature**; the pilot reports the measured rate, and until the bar is met the signal is described as an aid | 28.8% (15 / 52) | n = 52 frames (held out); false alarms 0 / 17 one-person frames | public dataset (Open Images V7; not exam-room footage) | docs/exam/FACE-ENGINE-RESULTS.md §7.2 |
| Attendance | **headline:** Asian faces recognised (5 / 20 / 200 enrolled) | 66–76% | n = 500 people × 5 photos (held out) | public dataset (CASIA-FaceV5) | ACCURACY.md §2 round 5 |
| Attendance | enrolled person recognised per scan, 100 enrolled | 85% (**tuning set — optimistic**) | n = 610 member probe photos (one per member; 100 per group, 200 random groups); 13,233 is the size of the whole LFW dataset, not the test set | public dataset (LFW) | ACCURACY.md §2 round 5 ("Tuning set: full LFW") |
| Attendance | stranger offered a name | Asian (held out, 100 enrolled) 0.2% [0.04–0.45%], upper 95% bound up to 1.15% at 5 or 200 enrolled; LFW (tuning set) 0.4% | n = about 12,000 stranger visits per row (about 1,800 / 500 different people) | public dataset | ACCURACY.md §2 |
| Attendance | stranger checked in with no confirmation | Asian (held out) ≤ 0.03%; LFW (tuning set) 0.01–0.07% (0.05% at 100, 0.07% at 200 enrolled) | n = about 12,000 stranger visits per row (about 1,800 / 500 different people) | public dataset | ACCURACY.md §2 |
| Attendance | a real workplace | not measured | — | field | ACCURACY.md "A real Thai workplace has not been measured." |
| Attendance | liveness (head-turn) option | not measured | — | — | ACCURACY.md "no measurement of the liveness option" |
| Store / Retail | door-like scene: net error, event precision | +3.2%, 93% | n = 126 crossings (PETS09-S2L1, **tuning set — optimistic**) | public dataset | ACCURACY.md §1 round 5 |
| Store / Retail | crowded street scenes, per sequence net error | −28% to +19% | n = 139 crossings (3 MOT17 sequences) | public dataset | ACCURACY.md §1 |
| Store | all 5 sequences pooled at 5 fps: net error, event precision | −0.4%, 79% (about 1 in 5 counted events wrong) | n = 273 crossings | public dataset | ACCURACY.md §1 |
| Store / Retail | a real shop door | not measured (use the on-site check) | — | field | ACCURACY.md "Round 9 measures nothing new at a customer site" |
| Crowd | **dense crowd (about 300 people)** | about 1 counted per frame on dense_shibuya, 0–2 on the 100+ person time-lapse: **not yet suitable for dense crowds** | n = 2 + 7 frames (2 clips: dense_shibuya, dense_shibuya_timelapse) | public dataset (Wikimedia Commons), preliminary | CROWD-ACCURACY.md |
| Crowd | 15–22 medium-sized people, whole view | undercount 26% | n = 12 frames (1 clip) | public dataset, preliminary | CROWD-ACCURACY.md |
| Crowd | 30–50 people, many far | undercount 58% (reference itself an estimate ±20%) | n = 20 frames (1 clip) | public dataset, preliminary | CROWD-ACCURACY.md |
| Crowd | small / far people | undercount 37–59% | n = 29 frames (2 clips) | public dataset, preliminary | CROWD-ACCURACY.md |
| Crowd | near zone, 0–13 people | 1.2 people per frame (31%), bias −0.2 | n = 20 frames (1 clip) | public dataset, preliminary | CROWD-ACCURACY.md |
| Crowd | entry / exit line | 1 / 1 crossings, 0 false | n = 1 crossing (2 clips) | public dataset, preliminary | CROWD-ACCURACY.md |
| Crowd | final accuracy | not measured: human count pending | — | field | CROWD-ACCURACY.md |
| HR kit | interviewer agreement, time to summary | not measured (pilot metrics in PILOT-PLAN.md §3.4) | — | field | PILOT-PLAN.md |
| HR kit | camera presentation observations | not measured | — | — | — |
| HR (citation) | people detect lies | about 54% | n = 206 documents (24,483 judges) | published research (Bond & DePaulo 2006, *Personality and Social Psychology Review* 10(3), doi:10.1207/s15327957pspr1003_2) | — |
| Gate | see section 5 (S7 owns gate.html) | | | | GATE.md |

Not on these pages but quoted in a one-pager: expression model 52% of 7 classes, n = 346 faces found of 700
(FER-2013 PrivateTest, research-only data, evaluation only), public dataset (ACCURACY.md §6). Also quoted in
ONE-PAGER-RETAIL: signage age MAE 5.0 years and gender 96.0% when decided (97% of faces decided), Asian gender 92%,
n = 2,000 / 319 UTKFace faces, **optimistic: an upper bound** because part of the subset was in the model's training
data (ACCURACY.md §3).

Bond & DePaulo (2006), abstract: "synthesizing research results from 206 documents and 24,483 judges".

## 4. Register (machine-checked)

Columns: `id` · `page` (the .html file) · `dict` (i18n/en-*.js and i18n/zh-*.js base name) · `key` (data-i18n) ·
`figures` (tokens, `;`-separated, that must appear in the Thai, English and Chinese text; `—` = none) · `n` (tokens
that must appear in all three; `—` = none) · `labels` (label ids from section 1 that must appear in each language) ·
`evidence` (file) · `quote` (`;`-separated fragments that must still occur in the evidence file, whitespace
collapsed).

<!-- claims-register:start -->
| id | page | dict | key | figures | n | labels | evidence | quote |
|---|---|---|---|---|---|---|---|---|
| E1 | exam | exam | exam.l.cl1 | — | — | notmeasured; field | docs/EXAM.md | ## Accuracy — not measured yet |
| E2 | exam | exam | exam.l.cl2 | 15%; 24–48 px | n = 26; n = 12 | public; notmeasured | docs/exam/FACE-ENGINE-RESULTS.md | **4 / 26 = 15.4 %**; **0 / 12 found**; by skin tone: not measured |
| E4 | exam | exam | exam.l.cl4 | 0%; 63%; 24–48 px | n = 195 | public | docs/exam/FACE-ENGINE-RESULTS.md | **0 / 195 = 0.0 % [0.0 % – 1.9 %]**; **122 / 195 = 62.6 % [55.6 % – 69.1 %]** |
| E5 | exam | exam | exam.l.cl5 | 28.8%; 15 / 52 | n = 52; n = 17 | public | docs/exam/FACE-ENGINE-RESULTS.md | **15 / 52 = 28.8 % [18.3 % – 42.3 %]**; 0 / 17 = 0.0 % [0.0 % – 18.4 %] |
| E3 | exam | exam | exam.l.cl3 | — | — | notmeasured | docs/EXAM.md | pilot rooms with invigilator tallies per signal |
| A1 | attendance | attendance | attendance.cl1 | 85%; 13,233 | n = 610 | public; tuning; optimistic | ACCURACY.md | \| 100 \| 84.9% → 85.0% \|; **Tuning set: full LFW**, 13,233 images; The 610 people with ≥ 4 photos are members; photo 4 is the probe; Each row averages 200 random galleries |
| A2 | attendance | attendance | attendance.cl2 | 66–76% | n = 500 | public | ACCURACY.md | **76 / 74 / 66%**; **Held-out per-group check: CASIA-FaceV5**, 500 Asian (Chinese) people × 5 photos |
| A3 | attendance | attendance | attendance.cl3 | 0.4%; 0.2%; 0.04–0.45%; 1.15% | n = 12,000 | public; tuning | ACCURACY.md | 0.89% → **0.42%**; 3.13% → **0.18%** [0.04–0.45%]; (1.15% for both); about 12,000 stranger visits per row |
| A4 | attendance | attendance | attendance.cl4 | 0.03%; 0.01–0.07% | n = 12,000; 1,800 / 500 | public; tuning | ACCURACY.md | \| 0.03% [0.00–0.07%] \| [0.7–1.1%] \|; \| 0.01% [0.00–0.05%] \| [0.3–0.6%] \|; \| 0.07% [0.00–0.22%] \| [0.3–0.5%] \|; about 1,800 distinct strangers on LFW and 500 on CASIA |
| A5 | attendance | attendance | attendance.cl5 | — | — | notmeasured; field | ACCURACY.md | A real Thai workplace has not been measured. |
| A6 | attendance | attendance | attendance.cl6 | — | — | notmeasured | ACCURACY.md | There is still no measurement of the liveness option |
| S1 | store | store | store.cl1 | +3.2%; 93% | n = 126 | public; tuning; optimistic | ACCURACY.md | \| PETS09-S2L1 (tuning) \| 5 and 10 fps \| 129 → 130 / 126 \| +2.4% → +3.2% \| 93.8% → 93.1% |
| S2 | store | store | store.cl2 | −28%; +19% | n = 139 | public | ACCURACY.md | Per sequence, net error is −28% to +19%; \| MOT17-02 \| 5 fps \| 34 → 38 / 39 \|; \| MOT17-04 \| 5 fps \| 64 → 64 / 54 \|; \| MOT17-09 \| 5 fps \| 32 → 33 / 46 \| |
| S3 | store | store | store.cl3 | −0.4%; 79% | n = 273 | public | ACCURACY.md | **272 / 273** \| **−0.4%** \| 17.2% \| 79.0% |
| S4 | store | store | store.cl4 | — | — | notmeasured; field | ACCURACY.md | Round 9 measures nothing new at a customer site, because there is none yet. |
| R1 | retail | products | pd.r.cl1 | +3.2%; 93% | n = 126 | public; tuning; optimistic | ACCURACY.md | \| PETS09-S2L1 (tuning) \| 5 and 10 fps \| 129 → 130 / 126 \| +2.4% → +3.2% \| 93.8% → 93.1% |
| R2 | retail | products | pd.r.cl2 | −28%; +19% | n = 139 | public | ACCURACY.md | Per sequence, net error is −28% to +19% |
| R3 | retail | products | pd.r.cl3 | — | — | notmeasured; field | ACCURACY.md | Round 9 measures nothing new at a customer site, because there is none yet. |
| R4 | retail | products | pd.r.aP | +3.2%; −28%; +19% | n = 126; n = 139 | public; tuning; optimistic | ACCURACY.md | Per sequence, net error is −28% to +19%; \| PETS09-S2L1 (tuning) \| 5 and 10 fps \| 129 → 130 / 126 \| |
| H1 | hr | products | pd.h.cl1 | — | — | notmeasured; field | docs/PILOT-PLAN.md | ### 3.4 HR interview kit |
| H2 | hr | products | pd.h.cl2 | — | — | notmeasured | docs/LEGAL-REVIEW-PACK.md | optional camera/voice presentation feedback for the candidate |
| H3 | hr | products | pd.h.cl3 | 66–76%; 85%; 13,233 | n = 500; n = 610 | public; tuning; optimistic | ACCURACY.md | **76 / 74 / 66%**; \| 100 \| 84.9% → 85.0% \|; **Tuning set: full LFW**, 13,233 images; The 610 people with ≥ 4 photos are members |
| H4 | hr | products | pd.h.sci | 54%; 24,483 | n = 206 | published | docs/ACCURACY-CLAIMS.md | doi:10.1207/s15327957pspr1003_2; 206 documents and 24,483 judges |
| C1 | crowd | crowd | cr.cl.dense | 300; 0–2 | n = 2 + 7 | dense; public; prelim | docs/CROWD-ACCURACY.md | About 300 people at Shibuya were counted as 1–2 (0–2 on the time-lapse); \| dense_shibuya \| 2 \| ≈ 310 \| 1 \|; \| dense_shibuya_timelapse \| 7 \| 100+ (not counted) \| |
| C2 | crowd | crowd | cr.acc2.r2 | 26% | n = 12 | public; prelim | docs/CROWD-ACCURACY.md | \| medium_tyumen (pan) \| 12 \| 19.5 \| 14.5 \| 5.2 \| 26 % \| −5.0 \| 25 % \| |
| C3 | crowd | crowd | cr.acc2.r6 | 58% | n = 20 | public; prelim | docs/CROWD-ACCURACY.md | \| medium_yonge_dundas \| 20 \| 39.3 (estimate) \| 16.6 \| 22.8 \| 58 % \| −22.8 \| 0 % \| |
| C4 | crowd | crowd | cr.acc2.r3 | 37–59% | n = 29 | public; prelim | docs/CROWD-ACCURACY.md | \| sparse_roncesvalles \| 13 \|; \| sparse_tyumen \| 16 \|; the detector misses 37–59 % of people |
| C5 | crowd | crowd | cr.acc2.r1 | 1.2; 31% | n = 20 | public; prelim | docs/CROWD-ACCURACY.md | \| **medium_yonge_dundas (near half, 0–13 people)** \| 5.9 \| 5.7 \| **1.2** \| 31 % \| **−0.2** \| 75 % \| |
| C6 | crowd | crowd | cr.acc2.r4 | 300; 0–2 | n = 2 + 7 | public; prelim | docs/CROWD-ACCURACY.md | \| dense_shibuya \| 2 \| ≈ 310 \|; \| dense_shibuya_timelapse \| 7 \| 100+ (not counted) \| |
| C7 | crowd | crowd | cr.acc2.r5 | 1 / 1 | n = 1 | public; prelim | docs/CROWD-ACCURACY.md | \| sparse_roncesvalles (line across the far crossing) \| 0 / 1 \| 0 / 1 \| 0 \| |
| C8 | crowd | crowd | cr.cl.field | — | — | notmeasured; field | docs/CROWD-ACCURACY.md | **FINAL accuracy: pending human count.** |
<!-- claims-register:end -->

`\|` inside a cell is a literal "|" (it is part of a quoted Markdown table row).

## 5. Gate claim for S7 (gate.html is owned by S7)

Use the same format and the numbers in `docs/GATE.md` §3b (round 15). Suggested lines, to be updated by S7 with the
round-16 plate-likeness-guard results:

| claim | value | n | source |
|---|---|---|---|
| plate found (top box), held-out seed | 97.1% (136 / 140) | n = 140 scenes (20 per category) | synthetic (demo set, seed 7) |
| exact read from one frame, held-out seed | 58% (81 / 140) | n = 140 scenes | synthetic |
| false trigger on plate-less scenes | 0 / 20 | n = 20 scenes | synthetic |
| plate is the top box on real photos | 2 / 6 | n = 6 plates in 5 photos | public dataset (Wikimedia Commons) |
| real gate / car park | not measured | — | field (owner photos and pilot pending) |

Thai shape: `หาป้ายเจอ (กล่องแรก): 97.1% · n = 140 ฉาก · ที่มา: ข้อมูลจำลอง (ชุดเดโม seed 7)`.

**Round 16 update (S7 plate check, integrator 2026-11-09).** The real-photo row above (2 / 6, round 15) is superseded by
the round-16 public-photo set in `docs/GATE.md` §3c (51 Wikimedia Commons photos, split dev / held-out before tuning). The
synthetic rows above are unchanged by the plate check (held-out exact reads 81 → 81 / 140). `gate.html` (`gate.cl.l4`–`l6`)
and the Security category page quote these rows:

| claim (round 16) | value | n | source |
|---|---|---|---|
| plate is the top box on real photos | 41% (13 / 32) | n = 32 photos with a plate | public dataset (Wikimedia Commons) |
| whole plate read right automatically on real photos | 32% (7 / 22); 30% (7 / 23) counting one unsure label | n = 22 photos (12 of them dev / tuning, optimistic) | public dataset (Wikimedia Commons) |
| photos without a plate read automatically | 0 / 19 (before the check 3 / 19); held-out 0 / 9 (before 1 / 9); 95% interval 0–17% | n = 19 photos (10 of them dev / tuning) | public dataset (Wikimedia Commons) |
| owner phone photos; real gate / car park | not measured | — | field (owner photos and pilot pending) |

## 6. For the other round-16 stories

- **S1 (category landing pages):** take a tool's headline claim from section 3 with its label. A tool with no row is
  "not measured".
- **S56 (new one-pagers for Exam, Gate, Crowd, Attendance):** copy the "accuracy and source" table shape used in the
  existing one-pagers (`## ความแม่นยำและที่มา`, columns ข้อกล่าวอ้าง · ค่า · n · ที่มา · เอกสาร). The test checks every
  `docs/ONE-PAGER-*.md` file it finds, so new files must carry the table too.
- **Prices** are not part of this story; no price in any one-pager was changed.

## 7. Corrections made by this round

1. Retail `pd.r.aP`: "off by about ±10–30% per day" had no source (ACCURACY.md has no per-day figure). Replaced by
   the measured per-sequence range and the door-like figure, each with n.
2. Crowd: the worst measured medium clip (30–50 people, undercount 58%) was not on the page. Added.
3. Crowd: "not yet suitable for dense crowds" is now visible above the fold, not only in the collapsed panel.
4. ONE-PAGER-RETAIL: the +3.2% / 93% door-like figure now says it comes from the tuning sequence (optimistic).
5. ONE-PAGER-TH / ZH: the line "the site's default is the research demo profile" follows the owner's round-16
   decision (customer mode by default; research models only through the "research demo" toggle, off by default).
6. Reviewer round (2026-11-08), attendance / HR face figures: the LFW 85% is now labelled "tuning set — optimistic" in
   TH / EN / ZH on attendance.html, hr.html and the one-pagers, the held-out CASIA 66–76% comes first as the headline,
   and n is the 610 member probe photos (13,233 is only the dataset size).
7. Strangers checked in automatically: "under 0.05%" was not true on LFW (0.05% at 100, 0.07% at 200 enrolled). Now
   split by data set: CASIA (held out) ≤ 0.03%, LFW (tuning set) 0.01–0.07%, with the distinct-people count.
8. Strangers offered a name: the 1.15% upper bound belongs to the 5- and 200-enrolled CASIA rows; the 100-enrolled
   0.2% now carries its own interval 0.04–0.45%.
9. Crowd dense line: the "0–2, n = 2 frames (1 clip)" mixed two clips. Now "about 1 per frame on dense_shibuya, 0–2 on
   the time-lapse, n = 2 + 7 frames (2 clips)".
10. Retail `pd.r.aP`: the +3.2% now says "tuning sequence, optimistic" in the paragraph too, not only in the list.
11. ONE-PAGER-RETAIL age / gender row: adds "optimistic, upper bound (overlap with training data)", Asian gender 92%
    (n = 319) and "when decided".
12. Bond & DePaulo: n = 206 documents (24,483 judges), not "206 studies".
13. Sellable pack (2026-11-11), attendance / customers / cameras banners: "checked in automatically under 0.05%" was
    not true at 100 enrolled on LFW (0.05%, tuning set) or at 200 (0.07%). The generated banners now say "about 0.05%
    (LFW)" and, on the cameras table, "at most 0.03% (CASIA, held out)"; the old wording is a `banned` stale text in
    `docs/accuracy-figures.json`. ACCURACY.md's "Fewer than 0.05% of strangers are accepted without a person
    confirming" is about the CASIA held-out rows and stays true there.
14. Sellable pack: driver "real-time detection" (TH / EN / ZH lead) and the cameras card "immediate voice alert" claimed
    more than the measured 25% of 2-s closures alerted; now "an extra awareness aid … catches only part of eye
    closures". The "18–26% / 18% on real photos" warnings now name their source (public dataset, CEW).
15. Sellable pack: home page "how customers feel" / "emotion second by second" became "facial expressions (an
    estimate, not inner feelings)"; "see results in real time" became "while the camera runs".
16. Sellable pack: hall mode's phone signal now says "front rows near the camera only; not measured"
    (`docs/exam/HALL-NO-FACE-ASSESSMENT.md`: no phone claim at exam-room distance).
17. Sellable pack: Crowd is "experimental, for events, not yet suitable for dense crowds" on every page, card, category
    page and one-pager (it was pilot-ready on the category page and "available now" in the solutions catalogue).
18. New machine check: `docs/claim-rules.json`, applied by `npm run accuracy:check` and `tests/unit/claim-rules.test.js`.
    It bans the wording classes "real-time detection", "detects cheating", "highly accurate / reliably detects" and "how
    customers feel" in TH / EN / ZH across the pages, dictionaries and one-pagers, and pins the hall-mode and Crowd
    names and status words.

## 8. Product Check advert wording check (medicine.html, experimental; owner decision 2026-11-11)

Released as **experimental**: the user chooses the product type first (no check runs before that; a type guessed from
the words is only a suggestion the user confirms), so the headline figure is the **product-type-chosen** one. Evidence:
[`ACCURACY.md`](../ACCURACY.md) §14 and [`docs/product-check/ADVERT-RESULTS.md`](product-check/ADVERT-RESULTS.md)
("Independent run on the fresh set"). Source label: public dataset. Generated from `docs/accuracy-figures.json` (keys
`md.pc.ad.acc`, `md.pc.ad.none`; `tools/accuracy-sync.mjs --check`), never hand-typed:

| Language | Claim on the advert panel (`md.pc.ad.acc`) |
|---|---|
| English | Independent test, 246 over-claim / 135 compliant public advert texts, labelled by AI, pending expert review: finds 64% of over-claims with the product type chosen, 1.5 false flags per 100 compliant texts · n = 246 / 135 · source: public dataset |
| Thai | ผลทดสอบอิสระกับข้อความโฆษณาสาธารณะ (โฆษณาเกินจริง 246 ข้อความ ข้อความที่ไม่เกินจริง 135 ข้อความ ติดป้ายโดย AI รอผู้เชี่ยวชาญตรวจ): เมื่อเลือกประเภทสินค้า พบคำโฆษณาเกินจริง 64% แจ้งเตือนผิด 1.5 ครั้งต่อข้อความที่ไม่เกินจริง 100 ข้อความ · n = 246 / 135 · ที่มา: ชุดข้อมูลสาธารณะ |
| Chinese | 独立测试，246 条夸大宣传 / 135 条合规的公开广告文字，由 AI 标注，待专家审核：选择产品类型后可发现 64% 的夸大宣传，每 100 条合规文字误报 1.5 次 · n = 246 / 135 · 来源：公开数据集 |

- When nothing is flagged the card says exactly: "No listed wording found. This does not mean the advert is accurate or
  approved. The check finds about 2 in 3 over-claims in testing." (Thai and Chinese equivalents in the same JSON). "About
  2 in 3" (66.7 %) must stay within 5 points of the chosen-type recall (64.2 %); `tests/unit/pc-advert.test.js` checks it.
- Not claimed: the guessed-type figures (71.1 % recall, 23.0 false flags per 100), because the page does not run that way.
- Chinese adverts: 50 % on 20 texts; the card shows "limited support" in TH / EN / ZH until a larger set is measured.
- Recall target (80 %) not met; rule improvements come later on a new locked set.
