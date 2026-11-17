# Incident 2026-11-16: crisis card did not replace the whole result (fortune pages)

Status: **fixed and live since 2026-11-17 09:52 (+07)** (GitHub Pages deploy of main 02fdd69 completed 02:52:58 UTC; rounds 1
and 2 of branch `crisis-net-hotfix`, independent re-review PASS on 65c34cab). Guard against a repeat: section "Guard" below
(branch `incident-note`). Two gaps the guard found on 2026-11-17 are listed there (fengshui, compat inventory).

## บันทึกเหตุการณ์ (ภาษาไทย)

**อะไรรั่ว** เมื่อผู้ใช้พิมพ์ข้อความเสี่ยงทำร้ายตัวเอง หน้าดูดวงแสดงการ์ดช่วยเหลือ (1323 / 1669 / 191 / 1300) แต่การ์ดแทนที่เฉพาะ
ข้อความคำทำนายในกล่องเดียว ส่วนอื่นของผลยังแสดงอยู่ข้างการ์ด: แผนที่ใบหน้า ธาตุ 12 ตำแหน่ง ภูเขา แม่น้ำ (โหงวเฮ้ง) แผนที่ลายมือ
(ดูลายมือ) วงคะแนน "100/100 พลังเด่นมาก" ตารางแยกคะแนน และแถบตัวอักษรที่สะกดข้อความที่ผู้ใช้พิมพ์ทีละตัว (เลขศาสตร์ ชื่อ)
กระดานไพ่ / เหรียญและปุ่ม "แจ้งปัญหาคำทำนายนี้" (ไพ่ทาโรต์ อี้จิง) ไพ่ประจำวัน เซียมซี และ "ประจำวัน" ของอี้จิงยังอ่านได้ในสถานะ
วิกฤต และช่องหมายเหตุของ "แจ้งปัญหาคำทำนายนี้" ไม่ผ่านการตรวจ: ข้อความวิกฤตไม่ได้การ์ด และถูกเก็บใน localStorage ของเบราว์เซอร์นั้น
(`lq-report-log`) เมื่อกด "บันทึกในเครื่องนี้" ไม่มีข้อมูลใดถูกส่งออกจากเครื่อง (ไม่มีเซิร์ฟเวอร์ในเส้นทางนี้ อีเมลเปิดเฉพาะเมื่อผู้ใช้กดเอง)

**หน้าไหน และนานเท่าไร** (เวลาไทย, เวลาเริ่ม = deploy แรกของ GitHub Pages ที่มี commit นั้น, เวลาจบ = deploy ของการแก้ 2026-11-17 09:52)

| สิ่งที่รั่ว | หน้า | ตั้งแต่ | ถึง | ระยะเวลา |
|---|---|---|---|---|
| แผนที่ใบหน้า ธาตุ ตำแหน่ง ภูเขา แม่น้ำ ข้างการ์ด (D3b) | faceread | 2026-11-08 06:55 (f1d7fba มี 6fe450a) | 2026-11-17 09:52 | ≈ 9 วัน 3 ชม. |
| แผนที่ลายมือ (`#plEdit`) ข้างการ์ด (รอบ 2 ข้อ 1) | palm | 2026-11-08 06:55 (เหมือนกัน) | 2026-11-17 09:52 | ≈ 9 วัน 3 ชม. |
| วงคะแนน ตารางคะแนน แถบที่สะกดชื่อที่พิมพ์ (D3a); ชื่อ EN / ZH ได้ข้อความตรวจรูปแบบแทนการ์ด (D4) | numbers | 2026-11-12 08:49 (0f0ae99) | 2026-11-17 09:52 | ≈ 5 วัน 1 ชม. |
| กระดานไพ่ / เหรียญ และปุ่มแจ้งปัญหา ข้างการ์ดหลังอ่าน (รอบ 2 ข้อ 2) | tarot, iching | 2026-11-08 06:55 (6fe450a) | 2026-11-17 09:52 | ≈ 9 วัน 3 ชม. |
| คำถามธรรมดาหลังการ์ดเริ่มสับไพ่ / โยนเหรียญ (สถานะวิกฤตไม่คงอยู่; กฎ "คงอยู่ทั้งแท็บ" เริ่ม 4061cfe) (รอบ 2 ข้อ 2) | tarot, iching | 2026-11-12 19:43 (4061cfe) | 2026-11-17 09:52 | ≈ 4 วัน 14 ชม. |
| ไพ่ประจำวัน เซียมซี อี้จิงประจำวัน อ่านได้ในสถานะวิกฤต (รอบ 2 ข้อ 3) | tarot, iching | 2026-11-12 19:43 (4061cfe: สถานะวิกฤตเริ่มมี) | 2026-11-17 09:52 | ≈ 4 วัน 14 ชม. |
| ช่องหมายเหตุ "แจ้งปัญหาคำทำนายนี้" ไม่ตรวจ ข้อความถูกเก็บใน localStorage เมื่อกดบันทึก (รอบ 2 ข้อ 4) | ทุกหน้าที่มีคำทำนาย (nav.js ใส่ปุ่มให้) | 2026-11-07 22:53 (e770bc2 ที่เพิ่ม lensiq-report.js) | 2026-11-17 09:52 | ≈ 9 วัน 11 ชม. |
| ช่องที่ไม่ถูกตรวจเลย หรือตรวจหลังการตรวจรูปแบบ (D5: ช่องปีเกิด ค้นความฝัน เบอร์ / ทะเบียน / บ้าน / บัญชี / เปรียบเทียบ ปีคู่ ฟอร์มลูกค้าโหงวเฮ้ง) | ดู docs/CRISIS-INPUT-INVENTORY.md | ตั้งแต่หน้านั้นเปิดใช้ (วันที่ตาม git log ของแต่ละหน้า) | 2026-11-17 09:52 | ต่างกันตามหน้า |

ก่อน 6fe450a ไม่มีการ์ดช่วยเหลือบนหน้าเหล่านี้เลย (นั่นคือเหตุการณ์ 2026-11-12 แยกต่างหาก: docs/INCIDENT-2026-11-12-CRISIS-NET.md)
บน zodiac และ astro การ์ดขึ้นบนเว็บจริงไม่ได้ก่อนการแก้ (ช่องข้อความเดียวของสองหน้านี้คือช่องปี ซึ่งไม่ถูกตรวจ = D5) จึงไม่มีช่วงที่
ตารางปีชง / ราศีแสดงข้างการ์ดบนเว็บจริง

**พบได้อย่างไร** ไม่ได้มาจากผู้ใช้จริง: (1) 2026-11-16 ผู้ตรวจอิสระของ branch `crisis-v2-live` วัดเว็บจริง (main 656712f) ซ้ำ แล้วพบ D3a,
D3b, D4, D5; (2) 2026-11-17 ผู้ตรวจอิสระสองคนตรวจการแก้รอบแรก (5061f53) แล้วพบข้อ 1–6 ของรอบ 2; (3) ผู้ตรวจอิสระวัดซ้ำรอบ 2 ผ่าน
(65c34cab, `~/LENSIQ-field/review/crisis-net-hotfix/RECHECK-2.md`) ในบันทึกไม่มีรายงานจากการทดสอบบน iPhone จริงของเจ้าของสำหรับเรื่องนี้

**อะไรกันไม่ให้เกิดซ้ำ** ดูหัวข้อ "Guard" ด้านล่าง: เทสต์ที่ล็อกไว้ (`crisis-escape-guard`) ตกทันทีเมื่อ (ก) มีช่องพิมพ์ข้อความใหม่บนหน้าดูดวง
ใด ๆ (รวมหน้าใหม่ และช่องที่ JS สร้าง เช่น dialog ที่ nav.js ใส่) โดยไม่อยู่ในรายการ หรือ (ข) มีองค์ประกอบผลคำทำนายใหม่ที่การ์ดไม่ซ่อน
ทั้งแบบตรวจโค้ด (ทุก id ที่สคริปต์ของหน้าเขียนผลลงไป ต้องอยู่ในพื้นที่ผลที่ถูกซ่อน หรืออยู่ในรายการ "ไม่ใช่คำทำนาย" พร้อมเหตุผล)
และแบบเปิดเบราว์เซอร์ (อ่านดวงปกติ เก็บทุกองค์ประกอบที่เกิดขึ้นหลังกดอ่าน แล้วทำให้เกิดสถานะวิกฤต ทุกองค์ประกอบต้องหายเหลือแต่การ์ด)
ไม่ต้องมีใครเพิ่มชื่อองค์ประกอบใหม่ลงรายการก่อน เทสต์จึงจะจับได้ เมื่อเปลี่ยนเป็นวิกฤต v3 (อ่านต่ออย่างนุ่มนวลแทนการ์ด) แก้จุดเดียว
คือเงื่อนไข "อนุญาตในสถานะวิกฤต" ในชุดทดสอบ

## Incident note (English)

**What leaked.** When a visitor typed a crisis phrase, the fortune pages showed the help card (1323 / 1669 / 191 / 1300), but the
card replaced only the reading text in one box. The rest of the result stayed beside it: the face map, element, palaces,
mountains and rivers (faceread), the palm map (palm), the score ring "100/100", the breakdown and a letter strip that spelled the
typed text letter by letter (numbers, name tab), the card / coin board and the "report a problem" button (tarot, iching). In the
crisis state the daily tarot card, siamsee and the iching Daily tab still gave readings, and the note of the "report a problem
with this reading" dialog was not checked: a crisis phrase got no card and, on "save on this device", was kept in that browser's
localStorage (`lq-report-log`). Nothing left the device (no server on this path; e-mail opens only when the visitor taps it).

**Pages and how long** (Bangkok time; start = first GitHub Pages deploy containing the commit; end = the fix deploy 2026-11-17 09:52):

| Leak | Page(s) | From | To | Duration |
|---|---|---|---|---|
| D3b face map, element, palaces, mountains, rivers beside the card | faceread | 2026-11-08 06:55 (f1d7fba, contains 6fe450a) | 2026-11-17 09:52 | ≈ 9 d 3 h |
| Round 2 #1 palm map `#plEdit` beside the card | palm | 2026-11-08 06:55 | 2026-11-17 09:52 | ≈ 9 d 3 h |
| D3a ring, breakdown, letter strip echoing the typed name; D4 EN / ZH names got a validation message instead of the card | numbers | 2026-11-12 08:49 (0f0ae99) | 2026-11-17 09:52 | ≈ 5 d 1 h |
| Round 2 #2 card / coin board and report button beside the card after a reading | tarot, iching | 2026-11-08 06:55 (6fe450a) | 2026-11-17 09:52 | ≈ 9 d 3 h |
| Round 2 #2 an ordinary question after the card started the shuffle / coin step (the "flag holds for the tab" rule exists since 4061cfe) | tarot, iching | 2026-11-12 19:43 (4061cfe) | 2026-11-17 09:52 | ≈ 4 d 14 h |
| Round 2 #3 daily card, siamsee, iching Daily readable in the crisis state | tarot, iching | 2026-11-12 19:43 (4061cfe: crisis state introduced) | 2026-11-17 09:52 | ≈ 4 d 14 h |
| Round 2 #4 report-dialog note unchecked; phrase stored in localStorage on save | every page with a reading (button injected by nav.js) | 2026-11-07 22:53 (e770bc2 added lensiq-report.js) | 2026-11-17 09:52 | ≈ 9 d 11 h |
| D5 inputs never checked, or checked after a format check | see docs/CRISIS-INPUT-INVENTORY.md | since each page shipped; date per git log | 2026-11-17 09:52 | per page |

Before 6fe450a these pages had no help card at all (the separate incident of 2026-11-12, docs/INCIDENT-2026-11-12-CRISIS-NET.md).
On zodiac and astro the card could not appear on the live site before the fix (their only free-text box, the year, was unchecked:
D5), so their clash / sign grids never stood beside a card on the live site.

**How it was found.** Not by a user: (1) 2026-11-16, the independent review of branch `crisis-v2-live` re-measured the LIVE main
(656712f) and found D3a, D3b, D4, D5; (2) 2026-11-17, two independent reviewers of the first fix (5061f53) found round-2 items 1–6;
(3) the independent re-check of round 2 passed (65c34cab, `~/LENSIQ-field/review/crisis-net-hotfix/RECHECK-2.md`). The record has
no report from the owner's real-iPhone testing for this incident.

**What now prevents a repeat:** section "Guard" below.

## What happened

The crisis net shows a help card (1323 / 1669 / 191 / 1300 / Samaritans) when a visitor types a crisis phrase. Rule
(CLAUDE.md): the crisis net always takes priority, the card replaces the reading, and nothing typed is shown back.

On the live site the card replaced **only the composed reading text**. Everything else the page had drawn stayed next to it.
Some inputs were checked only after the page's own format checks, and some free-text inputs were never checked at all.

| # | Defect | Page(s) | Severity |
|---|---|---|---|
| D3a | Score ring "100/100 พลังเด่นมาก", breakdown and letter values shown next to the card. `#nmStrip` spelled the typed crisis text letter by letter ("อ 6 ย 8 า 1 ก 1 …"), and `#nmResNum` printed it. | numbers (name tab) | high |
| D3b | `#frElement`, `#frPalaces`, `#frMountains`, `#frRivers`, the face map and the rest of `#frReading` stayed visible beside the card. At 375 px the first screen was the face map, not the card. | faceread (palm has the same layout) | high |
| D4 | EN / ZH crisis phrases in the Thai-only name box got "Enter a name with at least 1 Thai letter" and no card: validation ran before the crisis net. | numbers | medium |
| D5 | Inputs the net never checked, or checked only after a format check: year boxes (bazi, taksa, lek7, lifegraph, zodiac, astro, horoscope, report), the dream search box, the numbers phone / plate / house / account / compare boxes (the compare table printed the typed text back), the horoscope partner year, the faceread lead form. | see `docs/CRISIS-INPUT-INVENTORY.md` | medium |

## Found

2026-11-16, by the independent review of branch `crisis-v2-live`, which re-measured the LIVE main (656712f).

## When the gap went live

Method: `git log -S` on the widget code, on the crisis check and on the validation order. Then the first GitHub Pages
deployment (environment `github-pages`, `gh api repos/anirut77/lensiq/deployments`) whose commit contains that change. Times
are UTC, with Bangkok time (UTC+7) in brackets.

| Gap | Introduced by | Commit date | First deploy containing it |
|---|---|---|---|
| Result widgets drawn outside the reading box: faceread element / palaces / mountains / rivers / face map | c70f895 "Add โหงวเฮ้ง AI face-reading page" | 2026-11-05 | c70f895, 2026-11-05 06:24 (13:24) |
| Numbers score ring, breakdown, letter strip `#nmStrip` (spells the typed name), `#nmResNum`; Thai-only name validation before the reading | 7239e4e "Fortune AI layer … lucky numbers" | 2026-11-06 | 7239e4e, 2026-11-05 21:20 (2026-11-06 04:20) |
| Crisis card drawn **only in the reading box** (`renderSupport` clears just its container). From here on, the faceread / palm nickname shows the card beside the maps (D3b) | 6fe450a "Round 11 … fortune claim grounding + crisis card" | 2026-11-08 | f1d7fba, 2026-11-07 23:55 (2026-11-08 06:55) |
| Net extended to every free-text field (`pageText`), still only in the reading box and only when the page reaches the reading step. From here on, the numbers name tab shows the card beside the ring and strip (D3a), and EN / ZH names are stopped by validation first (D4) | 0f0ae99 "Crisis net: … check every free-text field on fortune pages" | 2026-11-12 | 0f0ae99, 2026-11-12 01:49 (08:49) |
| Crisis state (`data-lq-crisis`) hides remedy / paid blocks only, not the result widgets | 4061cfe "Fortune help line … crisis state suppresses remedies …" | 2026-11-12 | 4061cfe, 2026-11-12 12:43 (19:43) |

Before 6fe450a there was no crisis card at all on these pages. The leak described here exists from the first deploy with the
card (2026-11-07 23:55 UTC) until the fix is deployed.

Went live (fix): **2026-11-17 09:52 (+07)** = 02:52:58 UTC, GitHub Pages deploy of main 02fdd69 (rounds 1 and 2).

## Fix (branch `crisis-net-hotfix`)

- **(a) Takeover.** `lensiq-crisis-takeover.js` (new single source, copied into `fortune-read.js` by
  `tools/fortune-read-embed.mjs`, so the 15 reading pages get it with no extra request and the `fortune.html` hub, planner and
  lucky colour, which have no input and no reading, stay within their speed budgets) exposes `window.LQCrisisTakeover(card)`. It runs every time the card is drawn (`FortuneAI.crisis.render`, which
  every page uses). It sweeps every result area of the page: elements with `data-lq-result` or an id ending in `Result` or `Stats` (reading counters). The
  branch that holds the card stays. Every other element gets `data-lq-crisis-hide`, which is hidden by
  `html[data-lq-crisis] [data-lq-crisis-hide]{display:none!important}` (injected with the card). Page code that later sets
  `hidden = false` cannot bring an element back. The following stay visible: the card, the help lines, forms, and the boxes
  the visitor types into. The screen then scrolls so the card heading sits below the sticky top bar. Share and print buttons,
  prices, maps, rings, strips and charts are all inside the swept areas.
- **(b) Crisis check first.**
  - A capture-phase `submit` listener on the window runs before every form's own handler. It fires on a crisis signal in any
    free-text field of the page, or when the page is already in the crisis state. It stops the page's handler (so no format
    or validation check runs first) and shows the card in the form's slot.
  - Boxes that reformat while the visitor types (`type=tel`, `type=search`, `data-lq-crisis-live`) are checked on `input`
    before the formatter strips the text.
  - Forms whose own handler already runs the net first on every field keep their own card position (`data-lq-crisis-own`):
    horoscope, tarot, dream, report (and `.lq-merit` forms, checked by lensiq-merit.js). Their checks now cover all fields;
    horoscope's year filter and the dream search box run the net first. The tarot shuffle and iching coin steps still start
    for an ordinary question after a card (locked `fortune-crisis.e2e.mjs`); the reading that follows is the card again.
- **(c) Coverage.** The `tel` boxes were added to the free-text set. `docs/CRISIS-INPUT-INVENTORY.md` lists every input on
  the 18 fortune pages and cat-fortune. `tests/unit/crisis-input-inventory.test.js` fails when a new free-text input appears
  without an inventory row.
- **Tests.** The fixed set `crisis-net-hotfix` was locked before the fix: e2e parts a–d over the inventory, in TH / EN / ZH, at
  375 and 393 px. Logs are in `~/LENSIQ-field/evals/crisis-net-hotfix/`.

### For pages on other branches (petread on `fortune-pet`, compat on `fortune-compat`)

0. Load `fortune-read.js` (petread and compat already do): it carries the helper. Merge this branch first so the copy is there.
1. Mark the page's result container(s) with `data-lq-result`, or give them an id ending in `Result`.
2. Draw the card with `FortuneAI.crisis.render(box, FortuneAI.crisis.result({ lang }))`, which calls the takeover itself.
   For a card drawn in any other way, call `window.LQCrisisTakeover(box)` right after it.
3. Forms are covered by the window `submit` gate automatically. Give a form `data-lq-crisis-slot="#yourBox"` to choose where
   the card appears, or `data-lq-crisis-own` only when the page's own handler runs `FortuneAI.crisis.check(FortuneAI.crisis.fields())`
   (and `FortuneAI.crisis.active()`) before any validation.
4. Add every new free-text input to `tests/e2e/crisis-net-hotfix-inventory.json` (with a flow in the e2e set) and to
   `docs/CRISIS-INPUT-INVENTORY.md`.

### Follow-up: crisis one-number rules (owner decision 2026-11-16, branch `crisis-rules-1323`)

The card that replaces every result area (above) was then reduced by the owner's order of 2026-11-16: one number (1323) and
one call button, two or three warm lines with the longer text behind "อ่านเพิ่มเติม", the free comforting guidance, the
button after the text, then one small link to `counselling.html` where 1669, 191, 1300 and Samaritans are listed. No sticky
or floating help element. The takeover is unchanged: the result areas stay hidden and the card's contract (`.fa-support`
with an `h3`) is the same. Placement and wording: `docs/CRISIS-RESOURCES.md`; review item: `docs/LEGAL-PACKET.md` L63;
tests: `tests/unit/crisis-rules-1323.test.js`, `tests/e2e/crisis-rules-1323-{a,b,c}.e2e.mjs`.
## Round 2 (2026-11-17): independent review of 5061f53

Two independent reviewers re-measured 5061f53 (reviewer lock `evals-locks/crisis-net-hotfix-review.sha256`, committed in
e32a7b2: the set was measured before that commit because the lock lived in the reviewer's removed scratch worktree; files
unchanged, eval-guard OK). Findings, all against owner order 2026-11-16 (a) / (b) / (c):

1. **Palm map stayed visible.** `#plEdit` (palm map canvas, `#plFit` fit label, title, caption) was not a result root.
2. **Tarot / iching: the crisis flag did not hold.** An ordinary question after the card hid the card and started the
   shuffle / coin step (the page check ignored the crisis state). The old locked assertion "card hidden again for an
   ordinary question" (`tests/e2e/fortune-crisis.e2e.mjs`) contradicted order (a) and was re-locked STRICTER (coordinator
   decision on the reviewer's recommendation, reversible by the owner).
3. **Tarot daily card, siamsee stick number, iching Daily tab** showed full readings and share buttons in the crisis state.
4. **"Report a problem with this reading" dialog** (lensiq-report.js, injected by nav.js): its note was an uncovered
   free-text input: a crisis phrase gave no card and was saved in localStorage `lq-report-log`. The report button was also
   attached next to the support card itself.
5. **petread** (branch `fortune-pet` only): sticky Read bar skips the submit gate; `read()` validates species before the net.
   Not fixed here: `docs/HOTFIX-R2-NOTES.md` for the pet team, with the script versions compat and petread must load at merge.
6. (second reviewer) **fortune-crisis.js blocked / failing to load**: the early net (takeover) handed every check to it, so
   the window gate showed no card (numbers showed its validation message instead).

Fix (branch `crisis-net-hotfix`, after merging main 7a51bcf):

- `data-lq-result` on `#plEdit`, `#plGuideBar`, `#trPick`, `.tr-daily`, `#ssFall`, `#icStage`, `#icDaily`, `#zdChongGrid`,
  `#zdChongNote`, `#asSignGrid`: the takeover hides them with the reading.
- tarot.js / iching.js: the crisis state counts as a hit, so every later question shows the card again; siamsee and the iching
  daily do not draw in the crisis state.
- lensiq-report.js: the crisis net runs on the note and the edited preview before save / copy / mail and on every keystroke;
  on a hit nothing is stored, the dialog closes and the card takes over (`LQCrisisFirst`). The takeover style hides
  `.lq-rp-wrap` in the crisis state.
- lensiq-crisis-takeover.js (copied into fortune-read.js): without fortune-crisis.js the state is the `<html>` flag, the net is
  `FortuneAI.crisis.check` (fortune-ai.js has its own TH / EN / ZH patterns) and the page fields are scanned locally; after a
  language switch or a resize the card is brought back to the first screen.
- Inventory v3: `.lq-rp textarea` (note + preview); `tests/unit/crisis-input-inventory-2.test.js` scans the scripts nav.js
  injects, so a JS-created field there without a row fails.
- Versions: fortune-read.js v12, tarot.js v13, iching.js v11, lensiq-report.js v2, nav.js v23.

Fixed test set round 2 (locked before the fix in 538f5d1; field copies `~/LENSIQ-field/evals/crisis-net-hotfix-r2/`):
`tests/e2e/crisis-net-hotfix-e.e2e.mjs` (E1–E5, TH / EN / ZH at 375 and 393 px), `tests/unit/crisis-input-inventory-2.test.js`,
inventory v3, stricter `fortune-crisis.e2e.mjs`. One append-only re-lock during the round: E5 numbers opens the name tab
before the baseline, as part A does (v1 counted the tab's own label "ชื่อจริง" as an echo); assertion unchanged.

Round-2 numbers (synthetic, headless Chrome on the owner's Mac; TH / EN / ZH × 375 / 393 px = 6 cases per check; logs
`~/LENSIQ-field/evals/crisis-net-hotfix-r2/baseline-5061f53-e.log`, `after1-e.log`, `after-affected.log`):

| Check | Before (5061f53) | After (round 2) |
|---|---|---|
| E1 palm map, nickname before the reading | 0/6 | 6/6 |
| E1 palm map, nickname after the reading | 0/6 | 6/6 |
| E2 tarot: card only after a reading, flag holds for an ordinary question | 0/6 | 6/6 |
| E2 iching: same | 0/6 | 6/6 |
| E3 tarot daily card + siamsee in the crisis state | 0/6 | 6/6 |
| E3 iching Daily tab in the crisis state | 0/6 | 6/6 |
| E4 report dialog note, tarot (nothing saved, dialog closed, card) | 0/6 | 6/6 |
| E4 report dialog note, iching | 0/6 | 6/6 |
| E5 fortune-crisis.js blocked: numbers name | 0/6 | 6/6 |
| E5 fortune-crisis.js blocked: tarot question / iching question | 6/6 / 6/6 | 6/6 / 6/6 |
| fortune-crisis.e2e.mjs (stricter re-lock) | 0/2 | 2/2 |
| crisis-input-inventory-2 unit | 2/3 | 3/3 |

Regression (after): crisis-net-hotfix a–d, fortune-crisis-fields / -fields-2 / -session / -soft, fortune-helpline, merit-crisis,
speed-budget all pass; unit 2372/2372. fortune-layout "item 5" fails on this branch AND on main 7a51bcf when run on
2026-11-17: today's horoscope "today" tab (#pn-td, a hidden tab panel) holds caution paragraphs, which the check counts as
hidden; date-dependent, not caused by this branch (reported to the coordinator; test not changed).

## Guard (2026-11-17, branch `incident-note`): a new input or result element cannot escape the crisis check unnoticed

Owner order 2026-11-17: "what now prevents a new input or result element from escaping the crisis check (a test that fails
when a new one is added)". What existed before this branch, and what was missing:

- (a) new free-text input: `tests/unit/crisis-input-inventory.test.js` (round 1) and `-2` (round 2, scripts nav.js injects)
  already failed on an unlisted field, **but only on a fixed list of 19 pages**: compat (live since bb8f8bd) was not scanned,
  and its 4 free-text boxes were not in the inventory.
- (b) new result element: **missing**. The e2e sets a–e assert fixed selector lists per page; a new widget outside the
  takeover roots would pass them.

New locked set `crisis-escape-guard` (written and locked BEFORE measuring: `evals-locks/crisis-escape-guard.sha256`, copies in
`~/LENSIQ-field/evals/crisis-escape-guard/`; append-only re-lock v2 and inventory v4 before measuring the fix, reasons in the
lock commits):

1. **Pages are found, not listed**: every `*.html` that loads fortune-read.js, fortune-ai.js or fortune-crisis.js (today 19,
   incl. compat). A new fortune page is checked the day it is added (proof below).
2. **Inputs** (`tests/unit/crisis-escape-guard.test.js` check 2): every free-text field (textarea; input text / search / tel /
   email / url / no type; contenteditable) in the page HTML, its scripts, scripts those load at run time and scripts nav.js
   injects (report dialog, merit form) needs a phrase row in `tests/e2e/crisis-net-hotfix-inventory.json` and in
   `docs/CRISIS-INPUT-INVENTORY.md`.
3. **Result elements, static** (check 3): every element id a page script writes into or reveals (innerHTML / textContent /
   append… / hidden = false, direct or through a variable) must be inside a takeover root (`[data-lq-result]`, `[id$=Result]`,
   `[id$=Stats]`, read from lensiq-crisis-takeover.js by check 1) and not inside a form there, or be listed in
   `tests/unit/crisis-escape-guard-allow.json` as NOT reading content with a reason (field / validation message / camera UI /
   static reference). Stale entries fail too. Changing that list is a reviewed, re-locked commit.
4. **Result elements, in the browser** (`tests/e2e/crisis-escape-guard-{report,field}.e2e.mjs`, kit
   `crisis-escape-guard-kit.mjs`): per page with a crisis entry point (TH, 375 px): run a normal reading; collect EVERY visible
   content element that is new, newly visible or whose text changed since before the reading (no selector list); trigger the
   crisis via the report-dialog note and via the page's own box; assert every collected element is hidden except the help card,
   and nothing new appeared outside it. Check 4 of the unit test fails when a page with an entry point has no flow.
5. **Crisis v3** (reading continues gently instead of a card, in progress): only the predicate `ALLOWED` / `MODE` in the kit
   changes ("in the crisis state every result element is either hidden or v3-compliant", e.g. marked `data-lq-gentle`), in a
   re-locked commit. Collection, pages and the static checks stay as they are.

Limits: the static check sees ids written by the page's own scripts; elements built without an id are the browser half's job.
The browser half runs TH at 375 px only (the takeover is language-independent; TH / EN / ZH × 375 / 393 stay covered by sets
a–e). Content drawn inside a visitor's pre-existing form is left to the static check (the takeover keeps forms). Merit interest
form: off by default, covered by merit-crisis.e2e.mjs.

### What the guard found on its first run (synthetic, headless Chrome on the owner's Mac)

| Finding | Before | After |
|---|---|---|
| fengshui: the report-dialog note shows the card (since the round-2 fix went live 09:52 today), but the kua cards, compass verdict, recorded directions, plan grid, advice, photo result, reading, share row and card image stayed beside it: none was a takeover root | 188 of 319 result elements visible beside the card (`baseline-v2-fengshui-4a06544-report.log`) | 0 of 303 (`after-496c7fd-e2e.log`); fix: `data-lq-result` on 10 fengshui containers |
| compat: 4 free-text boxes (`#cpNick0/1`, `#cpYear0/1`) not in the inventory (the page itself was protected by its own locked test) | static check 2 fails | 9 compat rows added (inventory v4) |

Run 1 (`baseline-4a06544-e2e.log`, harness v1) also flagged harness noise: live camera capture hints, the dream symbol chips the
visitor picked, a re-labelled submit button and a form legend. Re-lock v2 made the browser half use the same reviewed
not-reading list as the static half; nothing else changed. Fengshui exposure: from 2026-11-17 09:52 until this branch is
deployed (before 09:52 the note was unchecked, so no card showed there at all: round-2 item 4).

Numbers (after, harness v2, 496c7fd): unit 12/12 (guard + both inventory tests); browser 29/29 cases (15 field + 14 report),
0 escaped of 186–705 collected elements per page. After merging main 94115ae (compat go-live, new face-capture DOM on faceread): unit 12/12,
browser 29/29, 0 escaped (faceread 691–694 and compat 247 elements collected; `after-merge-07a3c75-e2e.log`).

### Proof that the guard fails when something new is added (temporary local edits, not committed)

| Temporary change | Static unit | Browser |
|---|---|---|
| numbers: `<p id="nmProofNote" hidden>เลขนำโชค…</p>` outside the roots, revealed after the read | FAIL check 3: "numbers #nmProofNote … outside every result root" | FAIL: "1 of 311 result elements escaped … p#nmProofNote" (`proof-unmarked-nmProofNote-*.log`) |
| numbers: a new `<input type="text" id="nmWish">` | FAIL check 2: "numbers.html: nmWish" (`proof-static-unmarked.log`) | – |
| a new page `omen.html` (copy of tarot) | FAIL checks 2, 3 and 4 ("crisis entry point but no flow") (`proof-static-newpage.log`) | – |

Logs: `~/LENSIQ-field/evals/crisis-escape-guard/`.
