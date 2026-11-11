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

## Rule work 2026-11-11 (owner order: improve the rules, misses first, false flags ≤ 5 per 100 compliant)

> **Every number in this section is DEV, not independent.** The rules were tuned on the P3 dev split and on the
> **spent** first fresh set (its one independent run is above; its texts are now development data). Figures on the spent
> fresh set are therefore optimistic by construction and must not be quoted. The locked second fresh set
> (`~/LENSIQ-field/evals/adverts/fresh2/`, texts in `product-check/texts-fresh-2/`) and the P3 held-out split were **not**
> read; an independent agent scores fresh2 once after this commit. Until then the page keeps the old measured figures
> (`docs/accuracy-figures.json` unchanged: 64.2 %, "about 2 in 3").

### สรุปสำหรับเจ้าของ (Thai summary)

- ปรับกฎตามคำสั่ง: เน้นคำอ้างรักษา / บรรเทาโรค (F09, D08, H05, H02), เปลี่ยนโครงสร้าง / การทำงานของร่างกาย (F10, F07),
  ป้องกันโรค / ต้านเชื้อ (F08), อ้างงานวิจัย (F19), หมวดอาหารและสมุนไพร และภาษาจีน
- เขียนเป็น "ตระกูลคำ" (คำกริยา + ชื่ออาการ / อวัยวะ / ค่าในเลือด / เชื้อโรค) ใน 3 ภาษา ไม่คัดลอกประโยคจากชุดข้อมูล
- กันการแจ้งเตือนผิด: คำเตือนบังคับ ข้อความปฏิเสธ ("ไม่มีผลในการป้องกันหรือรักษาโรค", "not intended to diagnose, treat"),
  คำแนะนำ "ผู้ป่วย… ควร", "หยุดใช้และปรึกษาแพทย์", "ไม่ใช่ยา ไม่ควรใช้แทนยา", วิธีชง "ทิ้งไว้ 5 นาที" และโปรโมชั่น "ลดราคา ภายใน 3 วัน"
  ไม่ถูกจับ ข้อความกล่าวอ้างที่ได้รับอนุญาต (ประกาศฯ ฉบับที่ 447) ยังไม่ถูกจับเหมือนเดิม
- ตัวเลข dev (โหมดที่หน้าเว็บใช้จริง: ผู้ใช้เลือกประเภทสินค้า): ชุดใหม่ที่ใช้แล้ว (spent) จับได้ 64.2 % -> 96.3 %,
  แจ้งเตือนผิด 1.5 -> 1.5 ต่อ 100 ข้อความ; P3 dev ไม่ลดลง (100 %, 0.8 ต่อ 100) **ตัวเลขนี้มาจากข้อมูลที่ใช้ปรับกฎ จึงสูงเกินจริง**
  ตัวเลขที่อ้างได้มาจากการวัดอิสระครั้งเดียวบนชุด fresh2 เท่านั้น หน้าเว็บยังแสดงตัวเลขเดิม (ราว 2 ใน 3) จนกว่าจะวัดเสร็จ

### What changed (`RULE_WORK` in `tools/pc-rules-build.mjs`, listed in the generated file's `changes`)

| Rule(s) | Family added (TH / EN / ZH) | Guard added |
|---|---|---|
| F09 | verbs ลด (not ลดความเสี่ยง), สยบ, ขจัด, คุม / ควบคุม, หยุดยั้ง, คลาย, ดีขึ้น; "reduce / lower / ease / soothe / improve / suffer / help with"; 消除 / 调理 / 控制 / 减轻. Symptom nouns: pain, inflammation, numbness, dizziness, fatigue, urinary and prostate problems, fatty liver, kidney failure / dialysis, parasites, colds / flu / fever, anxiety, named syndromes (ADHD, PCOS, IBS…), 便秘 / 抽筋 / 疼痛 / 冠心病 / 三高 … | warnings that name a condition: "ผู้ป่วย / ผู้ที่มี / หากมีอาการ …", "patients / people with …", "if you have …", "stop use / ask a doctor …", 不能代替药物治疗疾病 |
| D08 | verbs "suffering from", "beneficial for", "improve" | same warning guard |
| H05 | verbs ลด / "reduce, lower, dissolve, shrink"; โรค + organ with words between; "masses" | same warning guard |
| F07 | control / lower / dissolve verbs before a marker with words between (Thai spacing is removed by the normaliser), uric acid, "fight / improve / reduce … cholesterol", "for high cholesterol", 控制 / 调节 / 降 + 血压 / 血糖 / 血脂 | — |
| F08 | prevent / inhibit / destroy + germ nouns (ไวรัส / เชื้อ / ปรสิต / เซลล์มะเร็ง), ลดเสี่ยง…, ลดการติดเชื้อ; "fight off / combat / inhibit … virus / infection", "protection against", "reduced … risk", "prevention of"; 抗菌 / 抗病毒 / 抑制…癌 | — |
| F10 | care verbs + organ nouns (บำรุง / ฟื้นฟู / ปกป้อง / ทำความสะอาด … ดวงตา, ต่อมลูกหมาก, เส้นประสาท, หลอดเลือด, ฮอร์โมน …), muscle mass / growth / recovery, hormone / fertility / cycle support, energy / focus / endurance, rejuvenation, "<organ> health", 调节…机能 / 骨密度 | approved statements stay suppressed (allowlist) |
| F19 | จากการศึกษาพบว่า, นักวิจัย, ทางคลินิก; "studies reveal / found", "in one study", "clinical studies", hyphenated "clinically-tested"; 实验证明 / 临床研究 / 研究表明 | — |
| F06, H02 | speed in minutes / hours / pills, "after two weeks of taking", "see results in N days" | preparation times (ชง / ต้ม / ทิ้งไว้ N นาที), sales / shipping deadlines (ลดราคา, ส่งฟรี, "delivered within") |
| H02, C03, F02 | superlatives (สุดยอด, อันดับ 1, หนึ่งเดียว, "the best … formula", "#1", "the strongest", 世界级 / 唯一), "no laser / surgery needed", "look N years younger" | C03: sales deadlines |
| D02 | elixir / anti-ageing (ยาอายุวัฒนะ, ชะลอวัย), "N เท่า", "ไม่ต้องผ่าตัด" | — |
| F14, D07, H04, C04 | "แนะนำโดยแพทย์", doctor … แนะนำ further apart, "dermatologists recommend", "doctor-formulated" | "ภายใต้คำแนะนำของแพทย์", "ปรึกษาแพทย์", "ask / consult a doctor" |
| F12, F13, F20, F05, F03, F11, C01 | skin elasticity / hair growth, 永葆青春 / 紧致 / 抗皱; รีด / สลาย…ไขมัน, 瘦了 N 斤; "no need for medicine", "alternative to statins"; "รับรองโดย อย.", "completely safe"; จบทุกปัญหา; "sex drive"; ลดปัญหาสิว, anaesthetic / swelling wording | F20 / C01: "ไม่ใช่ยา / ไม่ควรใช้แทนยา", "not a substitute for" |

Not targeted on purpose: texts that use approved nutrient-function wording (MoPH No. 447 / EU-style "contributes to the
maintenance of normal …"); RULES.md keeps those suppressed even when a labeller flagged them (3 misses on the spent set).

Tests: `tests/unit/pc-advert-rules.test.js` (new, synthetic sentences written for the test): one positive per family and
counter-cases that must not fire (disclaimers, mandatory warnings, directions, preparation times, sales deadlines, approved
statements). Existing fixed tests (`pc-claims`, `pc-advert`, e2e) unchanged and passing.

### Dev numbers, before / after (released mode = product type chosen by the user)

Rules before `542b1be5…` (released), after `156ebae8875c9a63bea61bc9808026a1fa0df7815fa218b571cc0160fe89e0c0`;
`lensiq-claims.js` and `lensiq-pc-advert.js` unchanged. Runs logged in `~/LENSIQ-field/evals/adverts/dev-runs.jsonl`
(`node tools/pc-advert-eval.mjs` and `node tools/pc-advert-eval.mjs --fresh`).

**Spent first fresh set** (source: public-page quotes, two AI labellers; consensus rule; 246 over-claim texts where both
labellers flagged, 135 where both found nothing; **dev, not independent**):

| Slice (n over-claim / n compliant) | Recall ≥ 1 signal, before → after | Consensus-rule recall | Rule precision / recall vs consensus | False flags / 100 compliant |
|---|---|---|---|---|
| **Overall** (246 / 135) | 64.2 % → **96.3 %** [93.2, 98.1] | 61.4 % → 94.3 % | 88.9 / 51.8 % → 89.0 / 94.7 % | 1.5 → **1.5** |
| Thai (107 / 48) | 68.2 → 97.2 % | 67.3 → 97.2 % | 94.8 / 54.8 → 93.1 / 96.4 % | 2.1 → 2.1 |
| English (119 / 75) | 63.0 → 95.8 % | 59.7 → 91.6 % | 84.1 / 50.3 → 85.0 / 92.5 % | 1.3 → 1.3 |
| Chinese (20 / 12) | 50.0 → 95.0 % | 40.0 → 95.0 % | 78.6 / 40.7 → 86.7 / 96.3 % | 0.0 → 0.0 |
| Supplement (158 / 31) | 70.3 → 98.7 % | 68.4 → 98.1 % | 90.8 / 55.1 → 89.4 / 97.0 % | 3.2 → 3.2 |
| Food (30 / 18) | 46.7 → 93.3 % | 46.7 → 90.0 % | 85.0 / 37.0 → 85.4 / 89.1 % | 0.0 → 0.0 |
| Herbal (31 / 29) | 48.4 → 87.1 % | 41.9 → 80.6 % | 76.5 / 44.8 → 86.7 / 89.7 % | 3.4 → 3.4 |
| Drug (8 / 30) | 50.0 → 87.5 % | 50.0 → 87.5 % | 100 / 55.6 → 100 / 100 % | 0.0 → 0.0 |
| Cosmetic (19 / 27) | 73.7 → 100 % | 63.2 → 94.7 % | 86.7 / 54.2 → 91.3 / 87.5 % | 0.0 → 0.0 |

The two remaining false flags are the same texts as before (an "antioxidant" product line and one text both labellers left
empty although it names a disease and a cure).

**P3 dev split** (public-dataset quotes, agentA labels; 99 over-claim texts, 123 with no expected rule; **dev**):

| Mode | Over-claim texts with an expected rule shown | Pairs recall / precision | False flags / 100 compliant |
|---|---|---|---|
| Type chosen (released), before → after | 99/99 → 99/99 | 95.6 / 98.0 % → 96.0 / 96.4 % | 0.8 → 0.8 |
| Type guessed (not used by the page), before → after | 97/99 → 97/99 | 93.6 / 97.9 % → 94.0 / 96.3 % | 10.6 → 13.0 |

By language and category (type chosen, after): every slice 100 % of over-claim texts; false flags per 100: th 1.6 (63),
en 0 (56), zh 0 (4), supplement 0 (18), food 0 (32), herbal 0 (18), drug 0 (34), cosmetic 4.8 (21, the same pre-existing
flag).

**Not used by the page:** with no type (guessed mode) false flags rise on the spent fresh set from 23.0 to 29.6 per 100
(more patterns, every family runs). The page only runs once the user has chosen the type, so this does not reach users;
it matters if the guessed mode is ever brought back.

### Risks

1. **Over-fitting.** The spent set drove most changes; 96 % there says little about new text. The fresh2 run is the
   number to quote. Expect a clear drop (P3: dev 94 % vs held-out 66 %).
2. **False flags on new compliant text.** Broader verbs ("reduce", ลด) and nouns ("pain", อักเสบ) raise the chance of a
   flag on compliant wording not seen in the sets; guarded by warning / direction / promotion exclusions and 30 synthetic
   counter-cases, but the compliant samples are small (135 + 123).
3. The page text stays "about 2 in 3" until the independent run; if fresh2 shows a different figure,
   `docs/accuracy-figures.json` is updated from that run only.

## Independent run on fresh-2 (2026-11-11, one run, set now spent)

Source: public-page quotes, labelled blind by two AI labellers (κ 0.916), pending expert review; locked before scoring.
Code `c8d5e4a` (`lensiq-claims-rules.js` `156ebae8…`, `lensiq-pc-advert.js` `d68d9449…`, `lensiq-claims.js` `f41bed9c…`).
Scored once by an independent agent; nothing tuned. Log: `~/LENSIQ-field/evals/adverts/fresh2/score/run-20261111T235821.log`
(summary `summary-20261111T235821.json`). 455 over-claim texts (both labellers flagged), 159 compliant (both empty), 21
disagreements left out. **Fresh-2 deliberately targeted the kinds of wording the first run missed** (claims to treat,
prevent or change body function; food, herbal; many more Chinese texts), so its figures and the first run's are **not
directly comparable**; the first run above is kept as history.

| Measure (95 % Wilson) | Product type chosen (page) | Type guessed (not used) | Target |
|---|---|---|---|
| Recall: over-claim texts with ≥ 1 signal | **67.3 %** [62.8–71.4] (306 / 455) | 75.6 % [71.5–79.3] | 80 % (missed) |
| False flags per 100 compliant texts | **2.5** (2.5 % of texts) [1.0–6.3], 4 / 159 | 69.2 (49.1 % of texts) | ≤ 5 (met) |
| Rule-id precision / recall vs consensus | 81.0 % / 55.6 % | 37.5 % / 54.8 % | — |

By language (type chosen): Thai 76.3 % (116 / 152), English 68.4 % (106 / 155), Chinese 56.8 % [48.7–64.5] (84 / 148; 0
false flags on 66 compliant). By category: supplement 79.0 % (94 / 119), food 70.8 % (148 / 209), cosmetic 54.5 % (6 /
11), herbal 53.0 % (53 / 100), drug 31.3 % (5 / 16). Weakest cell: Chinese herbal 13 % (3 / 23).

Seller-name check: no ®, ™, @, URL, phone-like or shop marker in any of the 553 spans shown in the page's mode; tokens
caught by the capital-letter heuristics were claim words and disease acronyms (COVID, COPD, LDL, "Immune", "Support").

สรุป (ไทย): วัดอิสระครั้งเดียวกับชุดใหม่ fresh-2 (โฆษณาเกินจริง 455 ข้อความ ไม่เกินจริง 159) ในโหมดที่หน้าเว็บใช้ (ผู้ใช้เลือกประเภทสินค้า)
จับได้ 67.3 % แจ้งเตือนผิด 2.5 ต่อ 100 ข้อความ (เป้า ≤ 5 ผ่าน, เป้า recall 80 % ยังไม่ผ่าน) ภาษาจีน 56.8 % ยังเป็น "รองรับแบบจำกัด"
ชุดนี้ตั้งใจเลือกถ้อยคำแบบที่รอบแรกพลาด จึงเทียบกับรอบแรก (64.2 %) ตรง ๆ ไม่ได้ จุดอ่อน: สมุนไพร 53 % ยา 31 %

**Odd things:**

1. **Type gating lowers recall**, most for drug and herbal: with the type guessed the same rules reach 75.6 %, with the
   type chosen 67.3 %. Drug texts lose most (guessed 81.3 % → chosen 31.3 %): many drug-labelled over-claims are caught
   only by food rules (F09 / F10), which do not run when "drug" is chosen; the drug rules (D02, D08) are narrow.
   Herbal: 75.0 % → 53.0 % for the same reason (H02, H05 narrower than F09 / F10).
2. **149 misses** (type chosen), mostly in F10, H02, F09, F07, H05, D02 and F19 (per-rule missed: F10 65, H02 26, F09 28,
   F07 26, F08 27, F19 17, F06 15, H05 13, D02 9, F12 7, H01 7). H02 was 5 of 31.
3. **The 4 compliant false flags**: FR2-0102, FR2-0237, FR2-0276, FR2-0544 (ids only; texts stay outside the repo).
4. Development figures on the spent first set (96.3 %) vs this run (67.3 %): the expected over-fitting gap.

**Status:** the page now quotes this run (`docs/accuracy-figures.json`: 455 / 159, 67.3 %, 2.5 per 100); "about 2 in 3"
(66.7 %) stays within 5 points. Chinese keeps "limited support". Experimental badge kept.

**Next steps:** (1) H02 herbal and the drug rules (D02, D08): exaggeration, fast-result and structure / function wording
for drug and herbal types, so that type gating does not drop what the food rules catch; Chinese herbal wording.
(2) fresh-2 is now spent too: **a third locked set is needed** to measure any further rule work; any tuning on fresh-2 is
development only.
