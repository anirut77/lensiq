# Product Check: "advert" capture type, on-device only (adverts option B), results (2026-11-11)

> Approved work list item 4 ("Adverts option B"), design in `ADVERT-CAPTURE-PROPOSAL.md` §8. **Every number below is
> "dev, synthetic/public quotes, not independent"**: the P3 dev split (public-dataset quotes, labels by AI agentA,
> pharmacist adjudication pending) is the set the rules were tuned on. The independent score on the fresh advert set
> (`TEST-SETS.md` §4) is done later, once, by a separate agent after blind labelling; it was **not** read, used or scored here.

## สรุปสำหรับเจ้าของ (Thai summary)

- เพิ่มตัวเลือก "โฆษณา / โพสต์ / ใบปลิว" ในแท็บตรวจสินค้า (medicine.html) ผู้ใช้ถ่ายภาพหรือวางข้อความ แล้วระบบตรวจถ้อยคำด้วยกฎบนเครื่องเท่านั้น
  ไม่มี AI ไม่ส่งอะไรออก ไม่มีหน้ายินยอม ไม่เก็บประวัติ (`kind: "ad"`)
- การ์ดผลพูดถึง "ถ้อยคำ" เท่านั้น ซ่อนชื่อร้าน เพจ แบรนด์ บัญชี LINE / WeChat เบอร์โทร ลิงก์ แฮชแท็ก และชื่อผู้รับรองในหลักฐานทุกจุด
  กฎประเภท "อ้างผู้รับรอง" ไม่ยกข้อความเลย ไม่มีคำตัดสินแบบ "ผิดกฎหมาย / ปลอม" ไม่มีปุ่มแชร์หรือรายงานผู้ขาย ครบ 3 ภาษา
- ปัญหาหลักที่พบบน dev: ถ้าไม่รู้ประเภทสินค้า กฎทุกตระกูลทำงานพร้อมกัน แจ้งเตือนผิด **49.6 ต่อ 100 ข้อความ** (ฉลากยาที่เขียนว่า
  "บรรเทาอาการ" ถูกกฎเครื่องสำอางจับ ฯลฯ) จึงเพิ่มการเดาประเภทสินค้าจากคำในข้อความ (ผู้ใช้เลือกเองได้) เหลือ **10.6 ต่อ 100**
  โดยข้อความโฆษณาเกินจริงยังถูกจับ 97 จาก 99 ข้อความ
- เพิ่มกฎ 2 ข้อจาก dev: คำ "ล้างสารพิษ / ขับสารพิษ / ทำให้แผลหาย" ในกฎสมุนไพร H02 และไม่นับ "แท้ 100%" (ส่วนประกอบ) เป็นคำโอ้อวด
- ตัวเลขทั้งหมดเป็นชุด dev ที่ใช้ปรับกฎ ไม่ใช่ผลอิสระ ผลอิสระจะวัดครั้งเดียวกับชุดข้อความใหม่โดยตัวแทนอีกตัวหลังติดป้ายแบบ blind

## 1. What was built

| File | What |
|---|---|
| `lensiq-pc-advert.js` | `LQPCAdvert` (browser global + Node module): `analyze(text, {category})` -> `{kind: "ad", sent: false, category, guessed, hidden, flags}` (each flag: rule id, family, evidence span with seller parts replaced by `[…]`, endorsement flag, TH / EN / ZH explanation, rule-basis URL; the advert text itself is never in the result); `sellerSpans`, `scrub`, `guessCategory`, `cardHtml`, `KEYS`; the advert panel UI |
| `medicine.html`, `medicine.css` | Capture-type choice in the Product Check tab ("label" default, "advert / post / leaflet"), the advert panel (product type, text box, check button, privacy notes), `#pcAdOut` |
| `lensiq-pc-ui.js` | With "advert" chosen, the OCR text goes to `lq-pc-ad-text` (advert card) instead of `lq-pc-text`: no registration shapes, no barcode button, no history row, no lookup / AI card. Choosing "advert" empties the label lookup / AI card; back to "label" restores the label flow unchanged |
| `tools/pc-rules-build.mjs` -> `lensiq-claims-rules.js` | `ADVERT_CHANGES` (2 changes, below), listed in the generated file's `changes` |
| `tools/pc-advert-eval.mjs` | Dev-split figures in three modes; refuses any other split and any `texts-fresh` path; appends every run to `~/LENSIQ-field/evals/adverts/dev-runs.jsonl` |
| `i18n/en-med.js`, `i18n/zh-med.js` | 28 new keys (`md.pc.kind.*`, `md.pc.ad.*`) |
| `tests/unit/pc-advert.test.js`, `tests/e2e/product-check-advert.e2e.mjs` | Fixed tests, locked before any product code (below) |

**Seller identifiers removed from the card** (`sellerSpans`): URLs and bare domains, e-mails, `@handles`, LINE / WeChat /
WhatsApp / IG / FB IDs, Thai / Chinese / international phone numbers, "ร้าน…", "เพจ / แบรนด์ / ยี่ห้อ / ตรา …", "shop: / brand: /
by: …", "<Name> Official / Shop / Store / Pharmacy", Chinese "…旗舰店 / 专卖店 / 药房", "品牌：…", endorsers ("by Dr …", "Dr. / Prof. …",
"นพ. / พญ. / ภก. / ดร. / คุณหมอ / คุณ …", "…医生 / 博士 / 教授"), hashtags, tokens before ® ™ ©, CamelCase brand tokens (units such
as mL / mmHg / IgG excepted), the page-name line next to a "Sponsored" / time line, and every repeat of a name word found in
those. Endorsement rules (D07, F14, H04, C04) show "an endorsement is cited (name not shown)", never the span.

**Product type.** The user may choose it. Otherwise `guessCategory` uses product-type cue words only (for example ยาเม็ด /
ทะเบียนยา / "Drug Facts" / a Drug Facts "Uses" heading -> drug; ครีม / เซรั่ม / SPF -> cosmetic; อาหารเสริม / supplement ->
supplement; "สรรพคุณ :" / ยาแผนโบราณ -> herbal) and returns nothing when unsure; then every family runs and the card says so.
The card always says which: chosen, guessed ("if wrong, choose the type"), or unknown.

## 2. Fixed tests (locked before building)

`~/LENSIQ-field/evals/adverts/locked.sha256` (outside the repo):

| File | SHA-256 | Note |
|---|---|---|
| `tests/unit/pc-advert.test.js` | `bb5e9cbc…ee45e0` (lock 1), `dc61d1f1…ddae0e` (re-lock) | re-lock = format only: one 208-character line wrapped for `tools/format-check.mjs`; no assertion changed |
| `tests/e2e/product-check-advert.e2e.mjs` | `9fdf3e7c…ed2725` | unchanged since lock 1 |

What they fix: kind "ad"; no request of any kind (module source scan, stubbed `fetch` / XHR / WebSocket, CDP network spy
and fetch spy in the page from the moment "advert" is chosen); no label lookup or AI card for an advert; 13 synthetic
adverts whose seller tokens must never appear in the card (TH / EN / ZH) or in the result object; no verdict word in any
language; "not a legal finding / not about a seller" on every card; "no signal" never reads as compliant / safe; endorsers
never quoted; chosen type respected, guess and unknown said on the card; every card string has EN and ZH entries and an
EN / ZH card has no Thai outside `translate="no"` quotes (also `LQI18N.coverage` = 0 % in the browser); no buttons, forms or
share / report controls; only https rule-basis links; HTML in the text escaped; nothing about the advert stored; photo
path goes to the advert card; switching back to "label" leaves the label flow unchanged; phones 320 / 360 / 390 px.

## 3. Dev figures, before and after

**Source: dev, synthetic/public quotes, not independent** (P3 dev split, 270 texts; 99 over-claim texts with at least one
expected rule; 123 texts with no expected rule; labels = agentA). Measured with `node tools/pc-advert-eval.mjs`.

- *Pairs*: (text, rule) recall / precision vs agentA over the rules of the text's labelled category.
- *Over-claim texts caught*: over-claim texts where at least one expected rule is shown.
- *False flags / 100 compliant*: every rule the card would show on a text with no expected rule (rules of any family).

| Mode | Rules | Pairs recall | Pairs precision | Over-claim texts caught | False flags / 100 compliant | Compliant texts flagged |
|---|---|---|---|---|---|---|
| **Card default, before** (no product type: every family) | P3 rules `9bd6684a…` | 94.4 % [90.9, 96.6] (237/251) | 97.9 % | 98/99 = 99.0 % [94.5, 99.8] | **49.6** (61 on 123) | 45/123 |
| **Card default, after** (product type guessed, else every family) | `542b1be5…` + guess | 93.6 % [89.9, 96.0] (235/251) | 97.9 % | 97/99 = 98.0 % [92.9, 99.4] | **10.6** (13 on 123) | 12/123 [5.7, 16.3] % |
| Type chosen by the user, before | P3 rules | 94.4 % (237/251) | 97.9 % | 98/99 | 0.8 (1 on 123) | 1/123 |
| Type chosen by the user, after | `542b1be5…` | 95.6 % [92.3, 97.5] (240/251) | 98.0 % | 99/99 = 100 % [96.3, 100] | 0.8 (1 on 123) | 1/123 |
| No type, no guess, after (reference) | `542b1be5…` | 95.6 % (240/251) | 98.0 % | 99/99 | 47.2 (58 on 123) | 44/123 |

Reading: the advert-specific problem on dev was not recall but false flags when the product type is unknown (drug labels
saying "temporarily relieves" or "บรรเทาอาการ" were flagged by the cosmetic and food rules). The guess cuts them by about
four fifths at a cost of one over-claim text (PCT-0035, a drug cream guessed "cosmetic"; its cosmetic flags still show,
the expected drug rules do not) and two pairs. **Dev recall is optimistic by construction** (P3: dev 94 %, held-out 66 %);
the fresh set is the first number that can be quoted.

Tuning changes (dev evidence only, `ADVERT_CHANGES` in `tools/pc-rules-build.mjs`):

1. **H02**: add "ล้าง / ขับ…สารพิษ" (detox) and "allows wounds to heal" / "heals wounds" (dev misses PCT-0042, PCT-0099, PCT-0168).
2. **C03, D02, H02**: exclude "แท้ 100%" (composition: "น้ำมะพร้าวแท้ 100%"), which every family flagged when the type is unknown.
3. Product-type cues in `lensiq-pc-advert.js` (`CUES`), chosen on dev: drug label structure ("Uses" heading, "temporarily
   relieves / protects", "this drug", ยาละลาย), Thai herbal label heading "สรรพคุณ :" (with the colon), cleanser / make-up
   words; "skin" and "เป็นยา / ใช้รักษา" are weak cues only. Tried and dropped: "กันแดด" as a weak cue (dev: +1 over-claim text,
   +3 false flags) and showing only cross-family wording when the type is unknown (dev: false flags 3.3 but over-claim
   texts 68.7 %).

Not used: the P3 held-out split (spent), the P8 model results (they were measured on the held-out split), the fresh set.

Hashes at the time of these figures: `lensiq-claims-rules.js` `542b1be5f3032b3fdee11e0bb7a8c480621be826d586645211738bb3387a30fe`,
`lensiq-claims.js` `f41bed9c14edd4cfb96a3c3c831dd9c1170d75e267f3aa1825ff6eb318dfcaa5` (unchanged), `lensiq-pc-advert.js` in the
run log `~/LENSIQ-field/evals/adverts/dev-runs.jsonl` (baseline run kept in `baseline-dev-run.jsonl`). The P3 held-out
figures in `P3-RESULTS.md` §3 belong to the earlier rules file; the effect of these changes on that split is not measured.

## 4. Open points and risks

1. **Independent number pending.** The fresh advert set (402 texts) is scored once by a separate agent after blind
   labelling, on this commit's rules and guess. Targets from the proposal: recall ≥ 80 %, ≤ 5 false flags per 100 compliant.
   On dev the card default is at 10.6 false flags per 100 (target ≤ 5 **not met on dev**); a user-chosen type gives 0.8.
2. **Seller removal is rule-based.** A brand name with no marker (plain word, not CamelCase, no ®) inside a matched span
   can still show; spans are short claim phrases, so the exposure is small but not zero. Not measured on a locked set yet
   (the proposal's ~400-item advert guard set is for option A).
3. **Over-hiding.** Name rules can hide claim words next to a name (shown as `[…]` or "part of a name"); the signal stays.
4. **F15 (missing advert warnings)** is not run for adverts: a pasted fragment is rarely the whole advert.
5. **Field photos of adverts** (crop + OCR on real screenshots) are not measured; source "field" needs the owner's set.
6. Counsel: defamation and PDPA notes of the proposal §7 still apply to the screenshot the user holds; the card never
   names the seller and has no share or report action.

## Independent run on the fresh set (2026-11-11, one run, set now spent)

Source: public-page quotes (US FDA, UK ASA, Thai AFNC, Thai/Chinese press, NIH DSLD, openFDA, makers' pages), labelled blind
by two AI labellers (κ 0.887), locked before scoring (`docs/product-check/TEST-SETS.md` §4). Code `68bbc8b`
(`lensiq-pc-advert.js` sha256 `81cca227…`, `lensiq-claims-rules.js` `542b1be5…`). Scored by an independent agent; nothing
tuned. Log: `~/LENSIQ-field/evals/adverts/fresh/score/run-20261111T215402.log`. 246 over-claim texts (both labellers
flagged), 135 compliant (both empty), 21 disagreements apart.

| Measure (95 % Wilson) | Card default (type guessed) | Product type chosen | Target |
|---|---|---|---|
| Recall: over-claim texts with ≥ 1 signal | **71.1 %** [65.2–76.4] | **64.2 %** [58.1–70.0] | 80 % (missed) |
| False flags per 100 compliant texts | **23.0** (16.3 % of texts) | **1.5** (1.5 % of texts) | — |
| Rule-id precision vs consensus | 43.8 % | 88.9 % | — |
| Rule-id recall vs consensus | 50.6 % | 51.8 % | — |

By language (default / chosen): th 73.8 % / 68.2 %, en 72.3 % / 63.0 %, zh 50.0 % / 50.0 % (n = 20). Weakest: food
(46.7 %), herbal with type chosen (48.4 %; H02 0/8, H04 0/3). Most missed: F09, F10, F08, F07, F19. Over-firing in
default mode: C01, F09, D08, H05. Seller names: no ®/™, @, URL or phone-like token in any shown span; brand-like tokens
seen were generic claim words (COVID, HIV, "Supports").

**Status:** built, not on the live site. Recall target missed; the owner decides whether it ships as "experimental" with
these figures, or waits for rule work measured on a new locked set.

## Release as "experimental" (owner decision 2026-11-11)

Built on this branch, **no rule pattern changed** (`lensiq-claims-rules.js` still `542b1be5…`):

- **Product type first.** No check runs until the user chooses the type. A type guessed from the words appears only as a
  "use the suggested type" button the user must tap; the card then says "chosen". So the page runs in the
  **type-chosen** mode: 64.2 % recall, 1.5 false flags per 100 compliant texts (the guessed mode, 23.0 per 100, is not
  used).
- **No signal:** exactly "No listed wording found. This does not mean the advert is accurate or approved. The check finds
  about 2 in 3 over-claims in testing." (TH / ZH equivalents); no tick, no "no problem".
- **Flagged:** the text found (seller parts hidden), "may fall under rule X" + the rule explanation, "verify with the
  official source (X)" linked to the rule basis; no verdict words.
- **Measured numbers on the panel**, generated from `docs/accuracy-figures.json` (`md.pc.ad.acc`, evidence in
  `ACCURACY.md` §14, listed in `docs/ACCURACY-CLAIMS.md` §8, checked by `npm run accuracy:check`); "about 2 in 3" is tested
  to stay within 5 points of 64.2 %.
- **Chinese adverts:** "limited support" on the card (TH / EN / ZH) when Han characters are ≥ 30 % of the letters.
- **"Experimental" badge** on the advert panel.
- Fixed tests amended (stricter) and re-locked BEFORE the change: `~/LENSIQ-field/evals/adverts/locked.sha256` lock 3.
