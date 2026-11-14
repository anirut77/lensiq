# Product Check stream JK: Japanese / Korean text never goes to AI by itself (2026-11-14)

> Branch `pc-jk`. **Nothing deployed; no paid AI call; pc_claims stays off.** Every number is **synthetic**. Locks:
> `evals-locks/pc-jk.sha256` (committed before any measurement). Logs: `~/LENSIQ-field/evals/pc-jk/`.

## สรุปสำหรับเจ้าของ

- **ข้อความที่มีอักษรญี่ปุ่นหรือเกาหลี ไม่ถูกส่งให้ AI เองอีกเลย** (ตัดสินใจ 2026-11-14 ข้อ 1, ทางเลือก ข แบบเข้มกว่า) ใช้กฎเดียว `LQThaiCanon.jakoScript`
  ทั้งหน้าเว็บ ตัวกันชื่อ และ Worker
  - แตะครั้งเดียว (ผู้ทดสอบ): ไม่ส่ง แสดงเหตุผล "ข้อความมีอักษรญี่ปุ่นหรือเกาหลี" แล้วเปิดหน้าตรวจข้อความตามปกติ
  - ส่งเอง: ได้ หลังหน้าตรวจข้อความที่ **เปิดเสมอ** (ไม่พับ แม้จำการเลือกไว้) พร้อมคำเตือนให้ตรวจทุกบรรทัด
  - ภาพถ่าย: ไม่ส่งภาพของฉลากที่การอ่านบนเครื่องพบอักษรญี่ปุ่น / เกาหลี เลย ส่งได้เฉพาะข้อความ
  - Worker ตรวจซ้ำ: ไม่รับข้อความญี่ปุ่น / เกาหลีที่ไม่มีเครื่องหมาย "ผู้ใช้ตรวจแล้ว" (`ai_off_jako_preview`) ไม่รับภาพ (`ai_off_jako_photo`)
    ไม่รับคำขออัตโนมัติ (`ai_off_auto_filter`) แม้จะมีเครื่องหมาย
  - ดูดวง: ชื่อเล่นหรือข้อความที่เป็นอักษรญี่ปุ่น / เกาหลีถูกตัดออกก่อนส่ง (หน้าเว็บ และ Worker อีกชั้น) เพราะการยินยอมที่จำไว้ส่งโดยไม่มีหน้าตรวจ
- **ตัวกันชื่อ** ชุดทดสอบอิสระใหม่ (ชุดที่ 4, 230 รายการ, ล็อกก่อนวัด, วัดครั้งเดียว): ข้อความส่วนตัวถึง AI แบบไม่ผ่านการตรวจของผู้ใช้
  (แตะครั้งเดียว) **23 → 0** ภาพ **33 → 0** ส่งเองหลังตรวจ (ถ้าผู้ใช้ไม่ลบเอง) **42 → 29** (เป้า 0 ยังไม่ถึง)
- **ข้อจำกัดที่ต้องให้เจ้าของตัดสิน**: ภาพถ่ายตรวจจากข้อความที่อ่านได้ ถ้าเลือกอักษรไทยหรือละตินแล้วอ่านฉลากญี่ปุ่น ตัวอ่านจะไม่ออกอักษรญี่ปุ่น ภาพจึงอาจผ่าน
  (เฉพาะเมื่อเจ้าของเปิดโหมดภาพ `imageModeAllowed` ซึ่งค่าเริ่มต้นปิด)
- **คำอ้าง "0 ข้อมูลส่วนตัวถึง AI"** ทุกที่ระบุภาษาที่วัดแล้ว (รายการด้านล่าง)
- **แนะนำด้านกล่อง**: การสแกนสดอ่านด้านหนึ่งครบแล้วไม่พบเลขทะเบียน ส่วนประกอบ หรือบาร์โค้ด (น่าจะเป็นด้านหน้า) จะบอกให้หมุนกล่อง

## 1. Every AI-sending path and its gate

| Path | Before | Now (JA / KO text) |
|---|---|---|
| Product Check "ask AI", text, public (`lensiq-pc-ai.js` ask → preview → sendAll) | preview could be collapsed for a clean text with a remembered choice | preview always OPEN with a JA / KO warning; request marked `previewed: true` only after "Send this text" |
| Same, image mode (pc_fields) | photo when the guard found nothing | never a photo when the **device OCR output** has JA / KO script (decide() offers text only); Worker refuses JA / KO text with a photo |
| Tester one-tap (`oneTap`, `LQPCLive.autoDecision`) | sent when guard, possible names and block list found nothing | refused, reason `jako`, then the usual open preview |
| Live scan | never sends (unchanged) | unchanged |
| Worker `/v1/ai/pc_fields|pc_claims|pc_translate` (`pc-features.js` cleanText / autoCheck) | guard + aiGate | + JA / KO without `previewed: true` → `ai_off_jako_preview`; with a photo → `ai_off_jako_photo`; auto → `ai_off_auto_filter`; user script choice "ko" counts |
| Fortune `/api/fortune` (remembered consent sends each reading, no preview) | nickname and facts as given | JA / KO strings dropped in `factsForAI` and again in the Worker (`lensiq-thai-canon.js` imported, fails closed) |
| `fortune_reword` via the gateway | refused at aiRoute (legacy) | unchanged |
| `/api/med`, `/api/pc` | official lookups, not AI | unchanged |
| `tools/pc-ai-eval.mjs` (P8, not run) | sent fixed synthetic texts | JA / KO items are now refused by the Worker (no `previewed`): P8 JA / KO figures will read as refusals |

Rule (`LQThaiCanon.jakoScript`, NFC and NFKC copies): hiragana, katakana (incl. half-width, squared, circled, supplements),
hangul (syllables, jamo, compatibility, half-width, enclosed), 々 / 〆, Japanese-only kanji forms (薬 剤 様 県 歳 発 売 毎 桜 …),
Japanese era dates (令和 / 平成 / 昭和 / 大正 + digits or kanji numerals, ㍻ ㋿). Chinese text without these is not caught: 0 of 30
Chinese labels on hold-out 4, 0 of 200 Chinese texts on the fixed sets. Known: a kanji-only Japanese name (山田太郎) cannot be told
from Chinese by script; HK forms 説 / 証 and 円 make some Chinese texts count (safe direction: no one-tap, no photo).

## 2. Leak numbers (source: synthetic; hold-out 4, 230 items, 213 personal values, independent writer, locked `8cb887d2…`)

| Path (per personal value) | main `4413bc3` | pc-jk `321e68a` (scored once) | after review fixes `87bef2f` | Target |
|---|---|---|---|---|
| Reaches AI without the user's own send after a preview (one-tap, auto, unpreviewed Worker request) | 23 (the tester one-tap; the Worker had no second check for a page path that skipped the preview) | **0** | **0** | 0 (met) |
| Tester one-tap | 23 | **0** | **0** | 0 (met) |
| Photo | 33 | **0** (rule) | **0** | 0 (met, see limit B1) |
| Explicit send after the open preview, if the user removes nothing | 42 | **29** | 29 | 0 (missed) |
| Recall, all values [95 %] | 0.624 [0.56–0.69] | **0.714** [0.65–0.77] | 0.714 | reported |
| Recall, cued values | 0.816 | 0.831 [0.76–0.89] | 0.831 | ≥ 0.90 (missed) |
| Values without a cue removed (of 77) | 22 | 39 | 39 | reported |
| Product labels: false removal / gate refused | 9 / 0 of 110 | 10 / 0 | 10 / 0 | 0 added (1 added) |
| Product labels losing one-tap / photo (policy) | 39 / 9 | 87 / 75 | 87 / 75 | by design (all JA / KO labels) |

Hold-out 3 (now dev, used for the rules): explicit-text leaks 55 → 14. After the CI fix `8d7b6fc` (the room / class rule no
longer takes a named group such as "초코반", a locked F2 test) hold-out 4 gives the same numbers as `87bef2f` (re-run, logged). Fixed texts (1,773, P7 / P7b / fixed sets) vs main: 6
changed, all added removals on personal documents, **0 gate decisions changed, 0 detections lost**; P7 / P7b stay 0/260, 0/614.
Scorers: `tools/pc-guard-jako-score.mjs` (locked pc-f) and `tools/pc-jako-policy-score.mjs` (locked pc-jk before its first run).

## 3. Independent review (re-measured every number above: all match)

- B2 (fixed in `87bef2f`): the photo rule read the editable text box; deleting the kana lines brought the photo back. Now the
  device OCR output decides.
- **B1 (open, owner decision)**: the photo rule sees only the OCR text. A Japanese label read with the Thai / Latin / Korean
  model, or a Korean label read with the Thai / Latin / CJK model, gives text without JA / KO script, so the photo can go when
  the owner's `imageModeAllowed` is on (default off). Options in the round report.
- Fixed: NFKC / squared / era forms, 19 more Japanese-only kanji, fortune Worker imports the rule itself (fails closed).
- Noted: the policy scorer assumes the OCR outputs the script (cannot see B1); `every` vs `some` for one-tap has no numeric
  effect today (all three features share the same checks). Unit files 61/61.

## 4. Claim wording changed (decision 2)

Every "0 personal data reached AI" now names the languages measured (P7 set: Thai 78, English 79, Chinese 63, Japanese 28,
Korean 12 items; P7b: Thai 319, English 161, Chinese 51, Japanese 56, Korean 27) and says it is not a claim for Japanese /
Korean names without a cue: `docs/AI-GATEWAY.md`, `docs/CTO-BRIEF.md`, `docs/FIELD-PILOT.md`, `docs/LEGAL-PACKET.md`,
`docs/MEDICINE.md`, `docs/PDPA-NOTES-FOR-COUNSEL.md`, `docs/product-check/P7-RESULTS.md` (5 places),
`docs/product-check/LIVE-SCAN-RESULTS.md` (3), `docs/product-check/PC-F-RESULTS.md`, registry `docs/ACCURACY-CLAIMS.md` §9.
No user-facing page or i18n string carries such a claim (searched TH / EN / ZH).

## 5. Capture guidance (front of the pack)

State before: a static line "photograph the side with the ingredients, registration number or barcode" and, after an AI
refusal, `#pcAiGuide`. Next step built: when the live scan has read a side in full and nothing on the checklist was found,
the live hint says "this side has no registration number, ingredients or barcode (probably the front): turn the pack"
(`LQPCLive.sideHint`, hint `turn`, TH / EN / ZH). No switch existed; it runs inside the live scan (itself a tick box).
On-device only. Not measured on phones.
