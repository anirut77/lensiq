# Re-locks for owner decision 223 (2026-11-22)

Owner decision 223-1 (confirmed 2026-11-21 23:39): change the locked tests "from 'the page must show the figure' to
'the page must not show it, and the technical sheet must hold every original figure'". Every re-lock below is an
INVERSION (the page must NOT show X, and docs/tech-sheets/ + admin-measurements.js must hold X verbatim), a REDIRECT
(old approved wording → new approved wording, same exactness), or EQUAL/STRICTER (dictionary coverage also reads
i18n/{en,zh}-common.js, where the shared `ln.*` lines and `common.recheck` live; every key must still be found). No
threshold, crisis, privacy or safety assertion was relaxed. Two COUNT assertions changed BY DESIGN of decision 223 (not
loosenings, but stated here so the reviewer can confirm them):
- walkfix2 D-06: Crowd badges "at least 2" → "exactly 1" (the second badge sat on the accuracy panel that 223 removed;
  the remaining badge must read exactly "รุ่นทดลอง" / Trial version / 试用版);
- category tool counts (fortune-no-demo, categories.e2e, cat-pages): HR 5 → 4 and Marketing 14 → 11 tools in the customer
  build, because signage, neuro, teamface and customers are demo-only (audit §3, 223-2); the base totals are still checked.

Field copies (earlier copies are never modified):
- `~/LENSIQ-field/evals/<phase>/relock-223/`: the inversions (commit e10d6469);
- `relock-223b/`: EQUAL, long lines split only (same commit);
- `sellable-c/relock-223c/`: EQUAL, exam-dashboard-demo.e2e opens the administrator fold before reading the tally (79553b8e);
- `relock-223d/` (review round 2, below): STRICTER only.
Each folder has a NOTE.txt pointing here. The contract: tests/unit/accuracy-removal-223.test.js (locked
before any product change, commit 306c4d72). "Sheets" = docs/tech-sheets/*-TH.md (Thai) and *-EN.md (EN + ZH); the base
originals = docs/tech-sheets/ORIGINAL-FIGURES-223.json (+ SUPPLEMENT-223.json for 19 number lines without %, n = or a tag).

## The 25 changes of audit section 6

| # | Item | Old assertion | New assertion | Kind |
|---|---|---|---|---|
| 1 | CLAUDE.md line 34 | every accuracy claim states its source | every figure states its source wherever it appears (sheets, back office, internal docs); customer pages show no figures, tags or legends, only use + main limit in plain words | rule inversion (owner-approved) |
| 2 | CLAUDE.md 251-252 | landing page lists status (demo/experimental/pilot-ready) + measured accuracy with source | short customer status (none / รุ่นทดลอง / เร็ว ๆ นี้) + one plain line; accuracy to docs/tech-sheets/ + admin tab | rule inversion |
| 3 | CLAUDE.md 255-256 | every one-pager / page states measured accuracy + source | states the main limit in plain words, never claims more than measured; figures in the tech sheet; Crowd dense-crowd line kept | rule inversion |
| 4 | CLAUDE.md 53/56 | — | unchanged (internal; "no page claims more than was measured" kept) | none |
| 5 | CLAUDE.md 60 | decks: measured claims only | plain-word limits only; figures in the technical sheet | rule inversion |
| 6 | CLAUDE.md 128 licence label | — | unchanged (223-5 keeps licence labels) | none |
| 7 | acceptance README rule 7 | claims state their source class | figures state their source class in the technical sheet; customer pages carry none; no target changed | rule inversion (relock-223) |
| 8 | fortune-cards C4 + E4 | business cards keep accuracy blocks exactly as at base b2a6e76; Exam/Attendance/Gate/Crowd show figures with source labels | (a) the 50 base keys' TH/EN/ZH texts are gone from the 38 cards, 6 pages and en/zh-cat.js AND held verbatim in the sheets + admin data; (b) internal cat-data fingerprint unchanged (adb04dd3…); (c) new exact pin of the 223 cards (e179a266…); named products: no heading/chip/claim text, claims in that product's own sheet, two spec lines shown, Crowd dense line kept. E4 (browser, 360/430 px, TH/EN/ZH): 0 accuracy elements, badge = BADGE[badgeOf], two lines, demo-only cards not rendered | inversion + exact pins |
| 9 | palm-honesty H6 + e2e E5 | note = "…และยังไม่ได้วัดความแม่นยำกับมือจริง…" (TH/EN/ZH), twice | note = "เส้นที่แสดงเป็นการประมาณจากภาพ ผลอาจคลาดเคลื่อนได้ โปรดเทียบกับมือของคุณ และลากจุดกลมเพื่อปรับเส้นให้ตรงกับรอยจริงได้" (exact, twice) + new: no "not measured" wording in any language | redirect + stricter |
| 10 | cat-pages (locks crisis-rules-1323, crisis-v3, fortune-cards, fortune-credits, fortune-no-demo, promo-basics) | each card: data-status = PAGES.st, status chip, one `<li data-src>` per claim | data-status = badgeOf (or none), exact badge span, 0 `<li data-src>`, no cat-acc/src/why/srcs class or key, no claim text on the card, every claim of every business card in sheets + admin (≥ 50 lines), each card shows its D.LINES, data-demo-only exactly on D.DEMO_ONLY, no legend; cat-data still needs ≥ 1 claim per business page internally; no crisis assertion touched | inversion (stricter) |
| 11 | categories.e2e | every other card needs ≥ 1 accuracy line with source chip; count with status breakdown | no card shows an accuracy line or source chip, page main text matches no banned pattern, claims + reasons in the sheets, each card's two lines exact, demo-only hidden, count = "<n> เครื่องมือ" (n without demo-only); cat-data ≥ 1 claim kept | inversion |
| 12 | walkfix W-005/W-006/W-010/W-012/W-032 (+W-027/28/29 Crowd part) | gate.acc.l3/l6/l7 numbers on gate.html; Crowd panel heading says "เบื้องต้น" once; solutions badges = old STATUS; onboarding has 26–59% | keys gone from page + dictionaries; same numbers (14/32, 19/11/8, 200/40/30/95/85, not 13/100) in the gate sheets + PILOT-GATE §5 exact rows; crowd.html has 0 "เบื้องต้น" and the old heading rule holds on the sheet copy; every solutions card parsed, badge never stronger than its page, groups exactly now/soon, no pilot filter; 26–59% gone from guides but held in the Crowd sheets + LAUNCH-READINESS, plain limit row kept | inversion + redirect (stricter) |
| 13 | walkfix2 D-05/D-06/D-07/D-08/D-10 | gate.assist "ผลกับภาพถ่ายจริง…"; ≥ 2 crowd badges "ทดลอง"; liveness "off by default" + "not measured"; exam first note "พร้อมนำร่อง"; omr status + accuracy with source | exact new gate.assist (TH/EN/ZH) and the old figures in the gate sheet line; exactly 1 crowd badge "รุ่นทดลอง"/Trial version/试用版; liveness "off by default", no "not measured" on page (held in attendance sheets), new ban on unqualified liveness claims; exam badge = BADGE.trial, old text in sheets; omr "รุ่นทดลอง" + its two lines, no accuracy wording on page, old line in sheets | inversion + redirect (stricter) |
| 14 | walkfix-n W-006 | — | unchanged (not affected) | none |
| 15 | exam-face 14-17 (locks a5-defects, examlab-s2, examlab-s2__relock1) | hall "experimental/实验性"; banner figures 0% · n = 195 · 63% · 0.40; nMulti / cl5 "28.8% (15 / 52) · n = 52 · source" | hall "trial version/试用版" and old words banned; banner says "ใบหน้าที่อยู่ไกลกล้องยังหาไม่เจอ" with none of the tokens, all tokens in the exam sheets; nMulti = exact approved sentence with no rate; 28.8% / 15 / 52 / n = 52 / source held in the exam sheets; one-pagers carry no 28.8%; image-set measurement tests and thresholds untouched | inversion + redirect |
| 16 | pc-advert + product-check-advert.e2e (lock adverts) | md.pc.ad.acc / none generated with 60% · 2.1 · n = 545/382 · "ราว 3 ใน 5"; badge includes "ทดลอง"/Experimental | page shows the exact plain sentences (no figure), old generated texts absent from page/module/dictionaries, all 6 old texts + 60% / 2.1 / n = 545 / 382 in product-check sheets + admin data; figures still equal the fresh-set run (545/382/60.0/2.1, 3 in 5 within 5 points); verdict-word ban unchanged (excludes only the exact no-signal sentence); badge exactly "รุ่นทดลอง"/Trial version/试用版; harness, set, thresholds untouched | inversion + redirect |
| 17 | exam-phone-zoom-switch | — | unchanged (passes) | none |
| 18 | accuracy-claims (unlocked) | register figures + n + label on the page; OWNED pages have `.claims`; Crowd "ผลเบื้องต้น"; one-pagers keep the accuracy table | register rows point at the sheets, checks run on the sheet text; OWNED pages have no `.claims`, no `*.cl*` keys, no `n = <digit>`; Crowd dense line visible (outside `<details>`) and no เบื้องต้น/preliminary/初步; one-pagers have "ใช้ทำอะไร และข้อจำกัดสำคัญ" and no figures; tuning/optimistic caveats checked on the sheets | inversion |
| 19 | accuracy-figures + accuracy-sync (unlocked) | every banner/table on the pages matches the JSON | no page or dictionary carries a figure text; sheets + admin data carry every one; evidence-in-ACCURACY.md and rounding checks kept; `figures` object byte-identical | inversion |
| 20 | claim-rules (unlocked) | crowd-page must say "เบื้องต้น"; hall-phone "ยังไม่ได้วัด"; badge words "ทดลอง" | crowd-page: dense-crowd line + "อีเวนต์", must NOT say เบื้องต้น (TH/EN/ZH); hall-phone "เฉพาะแถวหน้า" + "มักตรวจไม่พบ"; รุ่นทดลอง/Trial version/试用版; new exam-phone (owner sentence on exam, dashboard, one-pager) and examlab-no-desk | inversion + new rules |
| 21 | gate.e2e (unlocked) | #accuracy has "ยังไม่มีผลวัดความแม่นยำ" + Apache-2.0 | no #accuracy / #claims; no figure words in main; tech note has Apache-2.0 + "สิทธิ์ข้อมูลฝึก"; two lines + recheck shown | inversion |
| 22 | crowd-report (unlocked) | #crAcc exists, "ผลเบื้องต้น", EN CSV "Final accuracy is pending" | #crAcc / #crClaims absent, no เบื้องต้น / n =; cr.rep.note exact recheck text; CSV ends "โปรดตรวจสอบอีกครั้ง" / EN recheck sentence | inversion |
| 23 | pc-travel-release (unlocked) | md.pc.tv.acc "recall 0.811 … precision 0.971 …" | exact plain sentence, no figure in TH/EN/ZH; 0.811 / 0.971 / 173 in product-check-EN.md; JSON values unchanged | inversion |
| 24 | exam-i18n, gate-guard, free-tier, fortune-sources | — | exam-i18n, gate-guard, free-tier unchanged (pass); fortune-sources: business pages show no cat.src.* and the 6 source labels + cat.src.h/d are in sheets + admin (inversion, relock under fortune-cards) | inversion |
| 25 | tools/cat-pages.mjs / cat-data.cjs | — | no accuracy field or legend on any category, counts = tools only, badges none / trial / hall / soon, old STATUS/REASONS/CLAIMS kept internally and in docs/PAGE-STATUS.md | generator |

## Other locked files changed by 223 (not in the audit list)

| File (lock) | Old | New | Kind |
|---|---|---|---|
| fortune-live.test.js (fortune-cards; also crisis-rules-1323, crisis-v3, fortune-live) | en/zh-cat.js carry cat.r.fortune without "for entertainment" | cat.r.fortune absent from en/zh-cat.js and cat-fortune.html; its text still has no "for entertainment" and is held in admin-measurements.js; ≥ 18 fortune PAGE-STATUS rows checked | redirect, stricter |
| fortune-no-demo.test.js + .e2e (fortune-no-demo) | six chooser counts byte-identical with status breakdown; sol-r5, teamface, signage, neuro keep the "สาธิต" demo badge | counts exactly "n เครื่องมือ / n tools / n 个工具", n = base total minus D.DEMO_ONLY; those cards badge "เร็ว ๆ นี้", data-demo-only, hidden in the customer build; no sl.st.demo / cat.st.demo; fortune checks unchanged | redirect |
| fortune-credits-v2.test.js D5 (fortune-credits__v3/v4) | terms.html, help.html, legal.js byte-identical to 5695734 | terms.html still byte-identical; help.html and legal.js = base with exactly the listed 223 replacements (6 in help: the #h-accuracy answer TH/EN/ZH and the "ทดสอบหน้างาน" tip; 1 in legal.js: the draft tooltip) and an exact sha pin; replacements may not touch fortune/crisis/help-number text; 19 fortune/crisis lines of help.html identical to base | equal for terms + exact pin |
| exam-hall-placement.test.js + .e2e (gate-hall-h) | HP.source matches /public dataset/; panel shows 46.2% / n = 247 / source | HP.source not displayed (code comment + docs/exam/HALL-DETECTOR-RESULTS.md state the public-dataset source); panel shows the plain verdict, no %, n =, source; the rows held in the exam sheets / results doc; frozen bands, n, recall untouched | inversion |
| exam-dashboard-demo.e2e (sellable-c, walk-fix) | panel matches /ไม่ใช่ความแม่นยำ/ | exact "ตัวเลขนี้เป็นข้อมูลจำลองเพื่อสาธิตวิธีนับเท่านั้น", no "ความแม่นยำ"/"ยังไม่ได้วัด" | redirect |
| exam-widths.e2e (examlab-90) | waits for /100%/ in #precBody | opens the fold first (as the administrator does), same wait | equal |
| nut-wording (nutrition), tryon-core (tryon-mvp), tryon-pose (tryon-pose) | keys only in the page dictionaries | `ln.<page>.*` / `common.recheck` may be found in en/zh-common.js, every key still required; nut-wording also scans those shared lines for banned wording | equal / stricter |

## Review round 2 (independent reviewer FAIL at 79553b8e, 2026-11-22): fixes, all STRICTER (`relock-223d/`)

| Finding | Before (79553b8e) | After | Kind |
|---|---|---|---|
| 1 licence labels (unlocked: tools/accuracy-sync.mjs, accuracy-figures.test.js) | only attendance / customers `.licb` text checked; `.lic` / other pages only "recorded" | full base guard restored: all 10 keys (attendance, customers, booth, driver, signage × .lic / .licb) on their page with the exact Thai, and the exact EN / ZH values; a fixture proves a removed or changed label fails | restored base strength |
| 2 walkfix W-005 gate.acc.l7 (lock fortune-no-demo + walk-fix) | only registry entries 19 / 11 / 8 in the sheets | also the base TH / EN / ZH sentence in the gate sheets with the base number rule (19, 11, 8; never 10, 9) | restored base strength |
| 2 + 5 contract (lock accuracy-removal-223, relock2) | SUPPLEMENT-223.json outside the contract | new R7 test: every supplement entry verbatim in the sheets (TH / EN+ZH) and in admin-measurements.js; required items listed in the spec (gate.acc.l7, cr.acc2.final, #h-accuracy en / zh, ZH sl.st.pilot.d, cameras table headers, ≥ 15 ZH "still needed" notes, ≥ 4 "no accuracy figure" rows, the Twente "0 of 6" rows, the 16 hall-placement lines, HALL_PLACE with 143 / 195 / 247 / 275 + source); a removed sheet line fails (bite-checked) | stricter |
| 4 exam-hall placement (lock gate-hall-h) | figures checked only in docs/exam/HALL-DETECTOR-RESULTS.md | unit: all 16 recall values with their n and source, in the base panel wording, in exam-TH.md (TH) and exam-EN.md (EN + ZH) and in admin-measurements.js; band counts + source in both sheets. e2e: 46.2 % and 56.3 % (n = 247) lines in the sheets, in addition to the results doc | stricter |
| 6 one-pagers (contract relock2) | banned list only | also no bare percentage in any one-pager except price / VAT / refund terms; the 54 % lie-research figure, Bond & DePaulo and the reference counts left interview.js, its EN / ZH dictionaries, interview.html and the one-pagers (kept in the HR sheet); the pilot targets moved off the one-pagers into the pilot plan wording | stricter |
| 8 help.html Crowd labels (lock fortune-credits v2/v3/v4, `fortune-credits/v3/relock-223d/`) | D5 pinned help.html with 6 listed 223 replacements | 9 listed replacements (+ the three Crowd summaries "(รุ่นทดลอง)" / "(trial version)" / "（试用版）"), new sha pinned; terms.html still byte-identical; no fortune / crisis text touched | equal strength, re-pin |

### Crowd catalogue rule and status labels: replaced by owner decision 226 (2026-11-22)

227 ก is withdrawn and the `crowd-not-soon` / switch-back note is void: decision 226 removes every customer-visible status
label and the status filter, and one visibility list in nav.js decides what is listed (see "Owner decision 226" below).

## Owner decision 226 (OWNER-INBOX-2026-11-21 entries 13-15): re-locks, all INVERSIONS, written / locked as listed

- Contract first: `accuracy-removal-223/relock3` (commit 07a309ef, before the product change): R3 off cards absent, R5 no status
  label / chip / tag / filter / badge key anywhere (TH / EN / ZH, pages, dictionaries, scripts, buyer documents), R9 one
  visibility list in nav.js = today's real state, nothing links to an off product, the list reads no LENSIQ_* option; locked
  e2e `visibility-223` (menus, listings, off URL = approved sentence + home link only, no camera). `relock4`: the e2e opts out
  of the harness preview with `{ offNotice: true }` (equal).
- `tests/e2e/cdp.mjs` (lock cdp-goto-errpage, `relock-226/`): newPage previews a switched-off page as if switched on (removes
  the off notice after load) unless `{ offNotice: true }`; every product e2e keeps testing the real product, the off state is
  tested by visibility-223 and product-check-advert E7. No assertion changed (equal).
- The other locked tests (`relock-226/` in each phase; full old -> new list in the field NOTE.txt): cat-pages, fortune-cards
  C4 (re-pin) / E4, categories.e2e, fortune-live-2, fortune-no-demo (+e2e), walkfix W-012, walkfix2 D-06 / D-08 / D-10,
  exam-face 14-17, fortune-credits-v2 D5 (help.html re-pin: the Crowd summaries lose the label), product-check-advert.e2e E7,
  commercial.e2e (lock leads). Every "badge = X" became "no badge anywhere, label held in the back office"
  (admin-measurements.js visibility records, checked against tools/cat-data.cjs); every "card listed" for an off product
  became "card absent / link hidden with data-lq-off"; limits, crisis, safety, licence and price assertions unchanged.
- By design (stated for the reviewer): category counts are now the products switched on (HR 4, marketing 11, education 4,
  health 3); crowd badge count 1 -> 0; exam hall links: cameras 1, exam 2 (all hidden), cat-education 0.

### Round 3 settlement before the locks (2026-11-22, coordinator questions a-e)

**(a) The off list: coordinator decision, reversible by the owner.** The owner's entry 13 names the off items: "Exam hall,
Product Check, the 4 hidden demo pages". Evidence from main 807471e8 (`git show 807471e8:<file>`):
- exam-hall: listed on main (nav.js edu menu "… (ทดลอง)", cat-education 1 link, exam.html 2, cameras.html 1); the page
  itself said "รุ่นทดลอง ยังไม่เปิดขาย" (#hallExp), i.e. not on sale. OFF (named by the owner).
- Product Check is not a page: it is the tab "ตรวจสินค้า (ทุกประเทศ)" (#t-pc / #tab-pc) of medicine.html, visible on main
  with a "ทดลองใช้" badge and linked from nowhere else. medicine.html itself is the drug checker ("ตรวจข้อมูลยา"), openly
  offered on main (nav health menu, cat-health, solutions sol-h5 "now", index footer, cameras). The first build switched
  off the whole page; the owner never named the drug checker, so medicine.html is ON again (sol-h5, the index footer link,
  the cameras card and the camera-notice sentences shown again) and only the part `product-check` is OFF: nav.js
  `VISIBILITY["product-check"] = false` + `PARTS = { "product-check": "medicine" }`; the tab button and panel carry
  `data-lq-part="product-check"` and are not rendered; a link or hash to #t-pc / #tab-pc shows the drug checker with no
  error; the arrow keys skip the hidden tab (medicine.js v6).
- the 4 hidden demo pages = signage, neuro, teamface, customers: listed on main (nav, cat-marketing / cat-hr, index,
  solutions sol-r5 / sol-r6 "now", cameras); on main only the research models were off in customer mode (neuro would not
  open its camera). They were hidden only on this branch (`DEMO_ONLY` in tools/cat-data.cjs at b458118b, 223-2 as
  recommended). OFF (named by the owner).
Reason: the owner's own naming in entry 13 wins over the coordinator's paraphrase of the rule ("what a customer could
open on main stays on"); the only page the owner did not name (the drug checker) stays on. Reversible by the owner:
one value per product in nav.js VISIBILITY.
Also found and fixed: an off page whose script opens the camera on load (customers.html) still requested the camera behind
the off notice; nav.js now refuses getUserMedia while the page shows the off notice (visibility-223 V2 "no camera request").

**(b) solutions.html: 27 cards hidden with data-lq-off** (28 before sol-h5 was shown again): 25 were "soon" on main too
(roadmap products with no page: sol-edu3/4/8/9/10/11, sol-r11..r15, sol-m3, sol-h1/h2/h7/h8/h9/h10, sol-f1, sol-a4,
sol-e10..e14; 227 ก withdrawn, no coming-soon section); 2 link products on the off list (sol-r5 signage, sol-r6 customers).

**(c) commercial.e2e `h > 1100`** (lock leads) is kept unchanged and passes (9/9); the 226 edit is an inversion and stricter
(`soon === 3` -> `soon === 0`, plus: the 3 `li.soon` kept in the markup, the section hidden with data-lq-off and not
rendered, no visible "เร็ว ๆ นี้").

**(d) cdp.mjs preview** (lock cdp-goto-errpage): no assertion changed; product e2e files test the product as if switched on
(the notice and the part-off class are removed as soon as nav.js sets them). The off state is proven by visibility-223
(V1 / V2 / V5, `{ offNotice: true }`) and product-check-advert E7 (a).

**(e) Buyer documents:** rows of off products kept, description replaced by the approved off sentence ("ระบบนี้ยังไม่เปิดให้บริการ"
/ "此服务尚未开放"), as for the hall paragraph: ONE-PAGER-RETAIL (signage, member recognition), ONE-PAGER-EVENTS (expression
analysis; note ¹ kept), ONE-PAGER-HR (teamface; "for entertainment only, not an assessment" kept), ONE-PAGER-TH / -ZH
(marketing and HR cells); the teamface safety sentences (TH line 66, ZH line 62) kept. pricing.html `pr.off.f1` no longer lists
digital signage (TH / EN / ZH). No buyer document or pricing text has a Product Check row.

**Re-lock folders of round 3:** `accuracy-removal-223/relock4` (contract spec + test R9 parts + visibility-223 V2 pages only,
new V5, V4 Thai explicit); `relock-226/` in cdp-goto-errpage, fortune-cards, crisis-rules-1323, a5-defects,
fortune-credits/v3, fortune-live, fortune-no-demo, walk-fix-2, adverts, leads (each with NOTE.txt).

### Review round 3 (Fable FAIL on 2 points, 2026-11-22): fixes, all STRICTER (`relock5`, `relock-226b`)

**Coordinator decision, reversible by the owner (owner rule "off = not shown"):** buyer documents no longer mark switched-off
products with the off sentence; their rows and cells are REMOVED (ONE-PAGER-EVENTS: emotion analysis row and its note ¹;
-EXAM: the camera hall row, the hall price paragraph and both hall price rows TH / EN, so no hall price remains; -HR: team
face reading row; -RETAIL: digital signage and member recognition rows; -TH / -ZH: the marketing and HR cells; DECK-EXAM,
ONBOARDING-EXAM, customer/ONBOARDING-EXAM, ORDER-FORM and QUOTATION-TEMPLATE: the hall lines and rows). Safety and limit
sentences that are not a listing stay (ONE-PAGER-TH line "โหงวเฮ้งทีมห้ามใช้ประเมินคน", -ZH "团队面相不得用于评估员工"; the
seller-only DEMO-SCRIPT-EXAM keeps "do not sell the hall"). Also: sitemap.xml lists no switched-off page
(tools/promo-meta.mjs reads the visibility list); the HR and marketing category intros, nav.hr.desc, home.form.i1 and
pd.i.sub no longer name off products (TH / EN / ZH); help.html hides the interview + team-face FAQ entry (h-hr, en-h-hr,
zh-h-hr) with data-lq-off; insights.html shows no module, KPI, funnel link or accuracy row of a switched-off page;
the five outfit-simulation keys say แบบร่าง / Draft / 草稿 in TH / EN / ZH; docs/legal/TERMS-CLAUSE-11-DRAFT-223.md no
longer says the site shows "รุ่นทดลอง" (draft for legal review).

| Lock | File | Old | New | Kind |
|---|---|---|---|---|
| accuracy-removal-223/relock5 | contract test + spec | R5 buyer docs = one-pagers, decks, demo scripts, onboarding | + every `docs/sales/**/*.md` and the buyer pilot documents (PILOT-CROWD, PILOT-GATE, AGREEMENT-TH, RESULTS-FORM), + "experimental" / "trial version" in any case; listed exclusions with reasons (docs/legal/customer/ do-not-change, PILOT-EXAM locked by exam-face, the hall seat-watch kit); + the 5 outfit keys must say แบบร่าง / Draft / 草稿 and no status word; R6 draft: the old proposed clause 2 sentence is redirected to the 226 sentence (TH / EN / ZH) and the old one is banned; R9: nav.js exports LQ_VISIBILITY and every customer script that writes a link to a switched-off page consults it; new R10: customer-handed documents name and link no switched-off product and say no "not available" row, the kept safety sentences must stay | stricter |
| accuracy-removal-223/relock5 | visibility-223.e2e | V1 on 12 listing pages, visible links | new V1: every page of the site (all root *.html except the off pages, which are V2), every rendered link in the DOM after scripts, TH / EN / ZH; the listing-page check kept | stricter |
| a5-defects/relock-226b | exam-face.test.js | ONE-PAGER-EXAM keeps the hall paragraph "ระบบนี้ยังไม่เปิดให้บริการ …" and the 290 THB hall price rows (TH / EN) | the one-pager carries no hall row, paragraph, price or `exam-hall.html` | inversion (off = not shown) |
| promo-basics/relock-226b | promo-basics.test.js | sitemap = every non-noindex page | sitemap = every non-noindex page that is switched on; every switched-off page is absent | stricter |
| fortune-credits/v3/relock-226b | fortune-credits-v2.test.js D5 | help.html pin c2c5f372… | + the three FAQ entries h-hr / en-h-hr / zh-h-hr carry data-lq-off (no text changed), new pin | equal, re-pin |
| fortune-cards/relock-226b | fortune-cards.test.js C4 | fingerprint 1425001917f1… | 4cc6b933c624… (the HR overview card line "ชุดสัมภาษณ์ โหมดฝึกซ้อมผู้สมัคร และกิจกรรมทีม" -> "ชุดสัมภาษณ์ และโหมดฝึกซ้อมผู้สมัคร": the off team activity is not named) | equal, re-pin |
| walk-fix/relock-226b | walkfix-n.test.js N6 | the Chinese Exam guide must say 大型考场 (hall sentence) | the Exam guide names no camera hall in any language (大型考场 / 考场摄像头 / exam-hall.html / ห้องสอบที่ติดกล้อง / camera-in-hall) | inversion (off = not shown) |

Also changed for "off = not shown" (unlocked or generated): exam.html and en / zh-exam `exam.l.priceStages` no longer say
the camera hall is priced per room.

### Independent review follow-up (four leftovers, 2026-11-22): re-locks, all STRICTER (`relock6`, `relock-226c`)

| Lock | File | Old | New | Kind |
|---|---|---|---|---|
| accuracy-removal-223/relock6 | contract spec + test | R6: draft clause 2 = the 226 sentence; no check of how the switch works | R6 also: the draft says the switch today is a list in nav.js changed by a release and the back-office screen is a planned step 2, not built (TH / EN / ZH); the old "the administrator switches each product in the back office" sentences banned. New R11: help FAQ h-hr / en-h-hr / zh-h-hr shown, exact new summaries, the three interview-kit guidance lines present and not hidden, only the team-face line hidden; exam.db.lead exact (no hall camera) TH / EN / ZH; insights `iqCollect` drops signage / customers / emotion-test data under the customer visibility (Node and the e2e preview keep all); the PDPA note records the split camera-notice sentence; new `offNames` patterns bite (fixtures) | stricter |
| accuracy-removal-223/relock6 | visibility-223.e2e | V1 (relock 5): rendered links only | V1 also fails on rendered visible text naming a switched-off product (spec.offNames; terms.html, privacy.html, camera-notice.html excluded with reasons in the spec); new V6: insights with its sample data (all presets, every card, every fold), exam dashboard `?demo=1`, help with every fold open: no name, no A/B card, no link; help FAQ shown with its guidance lines, without the team-face line | stricter |
| fortune-credits/v3/relock-226c | fortune-credits-v2.test.js D5 | help.html pin 6f0be4842e1c… (h-hr entries hidden whole) | 07ddf7afeb33… : the 3 whole-entry hides replaced by 6 listed replacements (summaries without team face, only the team-face line hidden), 15 replacements; new checks: each entry shown, exactly 1 hidden and 3 shown lines | equal (exact pin) + new checks |

Product (after the locks): insights-data.js `iqOn` / `IQ_PAGE_OF`: the data of a page switched off in `window.LQ_VISIBILITY`
is dropped in `iqCollect` while nav.js hides switched-off parts (`html.lq-part-off`; the e2e preview removes the class, as
for every part), so no chart note, A/B block, funnel source, card, KPI, report or CSV row can name it; insights-ui.js funnel
heading and "no data" hints name only switched-on systems (new TH / EN / ZH strings); exam-dashboard intro without the hall
camera (TH / EN / ZH); help.html FAQ h-hr shown again, team-face line hidden; legal draft point 2 (draft for legal review);
PDPA note on the split camera-notice sentence. Not changed (reported): terms.html, privacy.html and camera-notice.html still
name switched-off products in their legal text; the exam dashboard's "ลองสาธิต" button still adds a hall camera device.

## Round 4 (CI 44996629140 red, 75 failures; coordinator approval 2026-11-22)

| Lock | File | Old | New | Kind |
|---|---|---|---|---|
| cdp-goto-errpage/relock-226b | tests/e2e/cdp.mjs | OFF_PREVIEW added to the page-world init scripts: Chrome also injects it into admin.html's sandboxed `#adsPreview` frame (no allow-scripts) and logs "Blocked script execution" (every admin-* file, seller-doc-narrow) | same OFF_PREVIEW in the isolated world "lqOffPreview" (shared DOM), exported for WebKit; no console message filtered | equal |
| phone-quality/relock-226 | tests/e2e/phone-kit.mjs | launchWebKit() = webkit.launch(): WebKit files tested the off notice of switched-off pages | every context gets OFF_PREVIEW (as Chrome since relock-226) | equal |
| buttons/relock-226 | tests/e2e/buttons-kit.mjs, tools/buttons-probe.mjs | own webkit.launch() | launchWebKit() of phone-kit (preview in every context) | equal |
| examlab-90/relock-226 | exam-pages-webkit.e2e | exam.html must show a visible link to exam-hall.html | while VISIBILITY "exam-hall" is false no visible link to it in `<main>`; when true the visible >= 44 px link as before | stricter |
| demo/relock-226 | demo-mode.e2e (crowd) | panel has ทดลอง and ฝูงชนหนาแน่น | panel has ฝูงชนหนาแน่น and no ทดลอง (decision 223) | stricter |

The WebKit files cannot run on the owner's Mac (no Playwright); the macOS WebKit CI shard is the measurement.

## Independent review of 9ebb0818: the exam dashboard demo button (2026-11-22): re-locks, STRICTER (`relock7`, `relock-226d`)

Defect: the exam dashboard button "สาธิต: จำลองเหตุการณ์" added a sample hall device ("เครื่องกล้องในห้องสอบ", named "กล้องหน้าห้อง
(สาธิต)") and hall events while exam-hall is switched off; V6 (relock 6) loaded `?demo=1` but never pressed it.

| Lock | File | Old | New | Kind |
|---|---|---|---|---|
| accuracy-removal-223/relock7 | visibility-223.e2e | V6: insights seeded, exam dashboard `?demo=1` loaded (no press), help folds | + new check "V6 (re-lock 7)": every demo / sample button of `spec.followup223b.demoSweep` pressed (exam dashboard plain + `?demo=1`, insights, nutrition, the 5 zone-camera demos, every `?demo=1` panel button), TH / EN / ZH, real visibility: no off name, no visible off link, >= 1 press; exam dashboard: no hall node / event / alert; harness preview (hall shown on): the hall device is there (the list decides); insights card ids also ab-neuro / cohort | stricter (+ inversion "hall events only when exam-hall is on") |
| accuracy-removal-223/relock7 | spec + contract test | offNames as relock 6; TH `(?<!ไม่\|การ)วิเคราะห์อารมณ์`, ZH `(?<!不做)情绪分析` | + old names (ทดสอบอารมณ์, emotion analysis / test, 情绪测试, Member recognition, 会员识别, จดจำสมาชิก, 数字标牌, ห้องสอบที่มีกล้อง, กล้องหน้าห้อง, Exam hall with cameras, Front camera (demo), 装有摄像头的考场, 大型考场, 前方摄像头（演示）, 产品核对 …); emotion patterns exempt only a preceding negation (positive "การวิเคราะห์อารมณ์" now caught; negated "不进行情绪分析" etc. pass); new R12: bites both ways, sweep completeness (every demo / sample / seed button and every lensiq-demo.js page), exam-dashboard.js consults LQ_VISIBILITY, `?demo=1` exam sample lab-only | stricter |
| fortune-credits/v3/relock-226d | fortune-credits-v2.test.js D5 | help.html pin 07ddf7afeb33… (15 replacements) | fcbdb41e3ce8… (18): the shop-camera consent tip gives "check-in" only as its example, no member recognition (TH / EN / ZH); the consent rule unchanged | equal (exact pin) |

exam-dashboard.e2e (not locked) runs with the harness preview, which shows exam-hall as on, so its 5-alert demo is unchanged;
exam-dashboard-demo.e2e (locked, sellable-c) presses no demo button and its sample data was already lab-only (amendment 2).

## Re-lock 9 (sell-readiness assessment, OWNER-INBOX-2026-11-21 entry 16, 2026-11-22): omr and tryon switched off (`relock9`, `relock10`, `relock-vis9`)

Why: the freeze assessment found two defects that would embarrass us in front of a customer: omr.html was ON but reads answer
sheets wrongly without any flag on the synthetic set (66 items); tryon.html was missing from the nav.js VISIBILITY list, so its
direct URL opened (acceptance score 48, backend not deployed, try-on parked by the owner). Switching both OFF is the reversible
direction ("off = not shown"; one value each in nav.js).

| Lock | File | Old | New | Kind |
|---|---|---|---|---|
| accuracy-removal-223/relock9 | contract spec + test (+ visibility-223.e2e unchanged copy) | spec.visibility.off = 6 items; R9: the list names exactly the category pages + parts | off + omr, tryon; offNames + omr / tryon names; R9: the list names EVERY root *.html page (true / false) + parts, nothing else; new spec.visibility.platformOn (19 platform pages, incl. the crisis page counselling) must be true. Bite on main 60ff12ec: R9 fails (tryon + 19 platform pages missing), R3 fails (omr card) | stricter |
| accuracy-removal-223/relock10 | contract test R10 | an off page without a nav.js menu title fails ("no menu title") | such a page (tryon) is named by its spec.offNames patterns in the customer-handed documents; a page with neither still fails | equal / stricter |
| walk-fix-2/relock-vis9 | walkfix2.test.js D-10 | back-office omr record "on" (shown) | record "off", not "on", and nav.js `omr: false`; every other D-10 check unchanged | inversion |
| fortune-no-demo/relock-vis9 | fortune-no-demo.test.js test 2 | OFF list = 6 items | + omr, tryon (education count 4 -> 3 follows from the same derivation) | inversion (equal derivation) |
| fortune-cards/relock-vis9 | fortune-cards.test.js C4 | 33 cards, OFF_226 6 items, fingerprint 4cc6b933c624… | 32 cards, OFF_226 + omr, tryon, fingerprint 987ffcfcc06e… (cat-education without the omr card, intro without answer-sheet grading TH / EN / ZH, count 3) | inversion + exact re-pin |
| (unlocked) | solutions.test.js | OFF list 5 pages | + omr, tryon (sol-edu6 hidden with data-lq-off) | inversion |
| fortune-cards/relock-vis9b (+ fortune-no-demo) | categories.e2e.mjs reachability | switched-off counts 5 pages + 1 part | 7 pages + 1 part and the exact list (customers, exam-hall, neuro, omr, product-check, signage, teamface, tryon); found by the local run before the product commit | inversion + exact list |

Product: nav.js VISIBILITY names all 77 root pages (omr false, tryon false, platform pages true); cat-education.html, index.html
chooser, i18n/{en,zh}-cat.js, docs/PAGE-STATUS.md regenerated (tools/cat-pages.mjs); sitemap.xml regenerated (tools/promo-meta.mjs,
omr and tryon gone); admin-measurements.js regenerated (tools/accuracy-sync.mjs; back office lists products only, omr and tryon
"off"); data-lq-off on the omr links of index.html (footer), cameras.html, solutions.html sol-edu6 and the three camera-notice.html
clauses (PDPA note added); education intro (cat-data, nav.js group intro, en / zh-common nav.groupd.edu) without answer-sheet
grading, TH / EN / ZH. No buyer document named omr or tryon (checked: docs/ONE-PAGER-*, docs/sales/**, docs/pilot/*). ?v= bumped
site-wide, one version per file: nav.js 38, lensiq-i18n.js 38 (nav.js injects it with its own version), i18n/zh-common.js 38,
i18n/zh-cat.js 8, admin-measurements.js 2.

Interaction with branch accuracy-followup-223c (relock8, not in main at 60ff12ec): it adds demoSweep entries for omr?demo=1 and
tryon?demo=1, and its R12 fails a sweep entry on a switched-off page. Whichever merges second must drop those two entries (and
re-lock the spec in a new folder combining relock8 + relock9); not duplicated here.
