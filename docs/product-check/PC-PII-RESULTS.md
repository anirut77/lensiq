# Product Check: automatic removal of personal data in the AI preview (owner decision 127, 2026-11-19)

> Branch `pc-pii-redact`. **AI stays OFF on the live site; nothing deployed; no paid AI call.** Every number is **synthetic**.
> Locks: `evals-locks/pc-pii.sha256` (set and scorer committed in `7ac8a470` before the removal was built). Run logs:
> `~/LENSIQ-field/evals/pc-pii/runs/`.

## สรุปสำหรับเจ้าของ

- **ปัญหา**: ชุดทดสอบที่ล็อกไว้ (hold-out 4) วัดได้ว่า ถ้าผู้ใช้กด "ส่งข้อความนี้" หลังหน้าตรวจโดยไม่ลบอะไรเอง ข้อมูลส่วนตัว 29 รายการถึง AI (เป้า 0)
- **สิ่งที่สร้าง**: หน้าตรวจข้อความเริ่มจาก "ลบอัตโนมัติ" (เปิดเป็นค่าเริ่มต้น ทำบนเครื่อง) ส่งให้ AI เฉพาะข้อความฉลากสินค้า
  บรรทัดที่ไม่มีลักษณะของฉลาก (ชื่อลอย ๆ โน้ต สติกเกอร์ส่งของ เบอร์ติดต่อ) ถูกลบทั้งบรรทัด และในบรรทัดฉลากลบเบอร์โทร อีเมล เลขบัญชี / เลขบัตร
  ที่อยู่ที่ไม่ใช่ของผู้ผลิต ชื่อหลังคำเรียกญาติหรือคำว่า "for / To / 给" และชื่อที่ติดกับขนาดยา ผู้ใช้เห็นทุกจุดที่ลบ และกด "คืนค่า" ได้ทีละจุด
  หลังยืนยันว่าไม่ใช่ข้อมูลส่วนตัว (ชื่อ เลขผู้ป่วย เบอร์ เลขบัตร ฯลฯ ที่ตัวกันเดิมพบ คืนค่าไม่ได้ เพราะเซิร์ฟเวอร์ปฏิเสธอยู่แล้ว)
- **ผลบนชุดใหม่ที่ล็อกก่อนสร้าง** (240 ฉลาก 5 ภาษา 234 ค่าส่วนตัว เขียนโดยเอเจนต์อิสระที่ไม่ได้อ่านโค้ด):
  ก่อนแก้ (main) 109 รายการถึง AI; **รอบแรกแบบไม่เคยเห็นชุด 14**; หลังแก้ตามรูปแบบที่พบ **0 ทุกภาษา** (ตัวเลขสุดท้ายนี้ไม่ใช่การวัดแบบปิดตาแล้ว
  ต้องให้ผู้ตรวจอิสระวัดซ้ำบนชุดใหม่อีกชุดก่อนเปิด AI)
- **ราคาที่จ่าย**: ฉลากสินค้าล้วนถูกลบบางส่วนด้วย (ส่วนใหญ่เป็นบรรทัดชื่อแบรนด์ ที่อยู่ เบอร์ศูนย์บริการที่ไม่มีคำบอก) 80 จาก 96 ฉลาก ราว 11.6 % ของตัวอักษร
  ผู้ใช้คืนค่าเองได้ AI ยังได้ข้อความฉลากพอให้เซิร์ฟเวอร์รับทุกฉลาก (ไม่มีฉลากที่เสียสิทธิ์ AI เพราะการลบ)
- **ยังไม่เปิด AI** ทางอื่นที่ยังส่งข้อมูลส่วนตัวได้บนชุดนี้ (ไม่อยู่ในขอบเขตข้อ 127): ภาพถ่าย (ปิดที่เซิร์ฟเวอร์เป็นค่าเริ่มต้น) และแตะครั้งเดียวของผู้ทดสอบ ดูข้อ 4

## 1. What the preview does now

`LQPCGuard.previewRedact(text, {restore?})` (lensiq-pc-guard.js) builds the preview the user sees and the exact text sent on
"Send this text" (lensiq-pc-ai.js `ask` -> `previewText` -> `previewSend` -> `sendAll`). ON BY DEFAULT, on the device.

1. Every span `redact()` already removed (cue names, HN, phones, IDs, e-mails, birth dates, addresses, JA / KO bare-name
   shapes). **Not restorable**: the Worker refuses a text that still holds one (`ai_off_personal_data`).
2. **Allow-list per line**: a line is kept only when it carries product-label text: a label cue type (`labelCues`), a
   registration number, a barcode, a product / ingredient / dose / claim word in TH / EN / ZH / JA / KO, a list of
   ingredients, or a maker's customer-service line. A line without any is removed whole (kind `line`, restorable). A line
   with a person field (name, recipient, patient, 氏名, 이름, 收件人 ...) that is not a product-name field is removed too.
3. On the kept lines: every phone (also a maker's, except a free-dial / service number on a customer-service line; a mobile
   number is never a service number), every e-mail, IBAN, 7+ digit numbers that are not a barcode, registration number,
   lot or date (bank accounts, member cards, IDs), a line with a personal-number field (bank, account, insurance, member,
   passport ...), an address that is not the maker's, a title + name, a name after a kinship word or a note marker
   ("お母さん用 けいこ", "할머니 순자", "for Misaki", "爸爸的药 —小雯", "(경수)", "→ 和夫"), name-shaped words at the edges of a
   dose line, and the guard's possible names (not on maker or ingredient lines).

The list under the preview shows every removal with its kind; restorable ones have "Restore" (a confirm says to restore
only what is not anyone's name, phone, address, account number or other personal data) and "Remove again". Restoring
rebuilds the text from the label text (edits in the box are replaced; the hint says so). The edited text is still checked
by `provenance` (only label text) and `redact` (the guard again), as before. TH / EN / ZH strings: `md.pc.ai.autoRm`,
`restore`, `restoreQ`, `restored`, `reRemove`, `k.account`, `k.line`.

## 2. Numbers (source: synthetic; locked set `pc-pii-set-1.json`, sha256 `ac5e3fd7…`, scorer `tools/pc-pii-score.mjs`)

Leak = the gate allows AI and a personal value (any non-space character of any occurrence) is still in the payload sent
with the defaults. Target 0 per language.

| Language | Personal values | Detected (removed) | Leaks main (redact only) | Leaks run 1 (blind) | **Leaks final** | Product labels | Labels with any removal | Product characters removed |
|---|---|---|---|---|---|---|---|---|
| Thai | 46 | 46 | 19 | 5 | **0** | 16 | 14 | 480 / 4,935 (9.7 %) |
| English | 43 | 42 (1 on a text the gate refuses) | 23 | 1 | **0** | 16 | 16 | 627 / 4,937 (12.7 %) |
| Chinese | 37 | 35 (2 on texts the gate refuses) | 16 | 2 | **0** | 16 | 13 | 324 / 2,574 (12.6 %) |
| Japanese | 54 | 54 | 26 | 2 | **0** | 24 | 20 | 532 / 3,902 (13.6 %) |
| Korean | 54 | 54 | 25 | 4 | **0** | 24 | 17 | 329 / 3,484 (9.4 %) |
| **All** | **234** | **231** | **109** | **14** | **0** | **96** | **80** | **2,292 / 19,832 (11.6 %)** |

Product labels whose default payload the Worker would refuse (AI lost by the removal): 0 of 96 (main: 0).

- Run 1 was the first and only blind run (`runs/run1-*.json`). Its 14 leaks were names in brackets or after an arrow / dash,
  a Thai short product word inside a name (ชา in ณิชา, รส in เรสซิเดนซ์), a Thai title + name on a kept line, a bank line,
  a person-field line kept by a product word. The fixes are general rules (§1), but they were made after seeing the set:
  **the final 0 is not a blind number.** An independent reviewer should write a fresh set and re-measure before AI goes on.
- False removals by kind (final): whole lines 112, names 25, phones 15, addresses 6, e-mails 4, IDs / accounts 5. Typical: a
  brand line with no product word ("ตรา ป้าแดง" kept, "คุณยายบุญมี" removed), a maker's address on its own line, a maker
  phone without a customer-service word, a website line.
- Dev sets (not measurements; sets already spent): hold-out 4 (the set behind the 29): 2 by the same scorer, both a value that
  also stands in the product's own text (personal "567" vs registration "G567"; "山下 さくら" vs the product "さくら のど錠"), the
  personal occurrence itself is removed. P7 dev / hold-out and pcf-jako dev: 0.

## 3. Unchanged

`scan()`, `redact()`, `imageCheck()`, `aiGate()`, `autoBlock()`, the Worker checks and every locked guard scorer are unchanged
(the locked pc-f / pc-jk / P7 numbers stay as recorded). AI remains off on the live site.

## 4. Other paths on the same set (existing behaviour, not changed here; `tools/pc-jako-policy-score.mjs`)

| Path | Personal values reaching AI | Note |
|---|---|---|
| Explicit text after the preview (old metric: `scan()` only) | 109 | now 0 with the automatic removal (§2) |
| Photo (image mode) | 47 | image mode is off at the server by default (`imageModeAllowed: false`) |
| Tester one-tap (no preview) | 8 | testers only, behind the closed-test gate |
| A request without the preview mark | 58 | no page path sends one; the Worker enforces the mark only for JA / KO |

Before AI goes on, these need their own decision (see the round report).

## 5. Round 2 (2026-11-19): independent review round 1 fixes and owner decision 146 ก (three routes)

Commits, one per route in the owner's order, then the review fixes:
1. `56f60c9d` route 1: the Worker refuses every non-auto text request without the preview mark (`ai_off_preview`; JA / KO keep
   `ai_off_jako_preview`). Locked tests re-locked append-only in `evals-locks/live-scan.sha256` (equal or stricter; reasons there).
2. `71938203` route 2: tester one-tap refuses (page reason `name-guard`; Worker `ai_off_auto_filter`) when `previewRedact` finds
   anything. Also: a maker line ("Made by X Co., Ltd.") counts as label text; the possible-name pass decides once per line.
   **Regression in this commit, fixed in the next one:** "co." inside an e-mail domain (`example.co.kr`) read as a company
   suffix and kept a staff contact line (1 Korean leak on the locked set). Fixed: the suffix must be a word, not inside an
   e-mail or web address.
3. `6d97db9b` route 3: the page blocks the photo whenever `previewRedact` finds anything; the Worker refuses a photo with a
   text that holds the placeholder (`ai_off_preview_photo`). `imageCheck()` itself is unchanged (see the commit: putting the rule
   there breaks locked P7 utility tests that assert the old photo rule).
4. Review fixes: exact counts in the e2e (1 placeholder = 1 highlight; exactly 2 requests, reason in a comment), the
   possible-name hint covered again (restore with confirm -> hint shown; deleted -> hint hidden), restore refused when no
   confirm dialog exists, the edited text gets the same automatic removal on "Send this text" (a removed item typed back from
   the label is removed again unless the user restored exactly that text), ownership / addressee markers ("Property of X",
   "belongs to", "prescribed for", "X's pills", เป็นของ, 持ち主, Xの薬, 주인, X 꺼, 属于, X的药). The reviewer's set
   (`~/LENSIQ-field/evals/pc-pii-review/`) was NOT opened.

Numbers on the locked pc-pii set after round 2 (synthetic; NOT blind: this set was seen in round 1):

| Language | Leaks (explicit send, defaults) | Labels with any removal | Product characters removed |
|---|---|---|---|
| Thai | 0 / 46 | 13 / 16 | 457 / 4,935 |
| English | 0 / 43 | 15 / 16 | 536 / 4,937 |
| Chinese | 0 / 37 | 13 / 16 | 324 / 2,574 |
| Japanese | 0 / 54 | 20 / 24 | 508 / 3,902 |
| Korean | 0 / 54 | 17 / 24 | 288 / 3,484 |
| **All** | **0 / 234** | **78 / 96** | **2,113 / 19,832 (10.7 %)** |

Photo route and tester one-tap route with the new rules: 0 personal values in every language (before: 47 and 8). Cost: the
photo is no longer offered for 89 of 96 pure product labels and one-tap for 90 of 96 (48 of the 96 are Japanese / Korean,
which never had either), because almost every label has some line the removal takes.

**What "no label lost its AI answer" means (AI is off; no provider was called).** It is the Worker's own input check only:
for each pure product label whose ORIGINAL text the gate (`aiGate`) allows, the scorer builds the default payload
(`previewRedact` -> `provenance` -> `redact`) and calls `buildFields(payload, {mode: "text"})` from
`backend/src/ai/pc-features.js` with `previewed: true`; "lost" = that call throws (a refusal such as `ai_off_no_product`).
0 of 96 threw. It says the request would be ACCEPTED by the Worker; it says nothing about what the AI would answer or how well.
