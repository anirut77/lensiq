# Crisis help resources: what we show and where it comes from

Owner order 2026-11-12: every fortune page and every reading shows a calm line with real help resources, and only
numbers and hours checked against an official source are published. Owner order 2026-11-14 (Part B): every help line
shown anywhere is a tap-to-call button with a phone icon (`tel:` link, at least 44 px tall), drawn by ONE shared
component (`lensiq-helpline.js`); on a computer the number is also shown as large text that can be selected and copied;
the 1323 wording is warm and never labels the reader as ill; each number and its hours are re-checked on the agency's own
page. Owner addition 2026-11-14 (after testing on a phone): each help line is one compact row (short label, then the
call button with the number); the second line wraps under the label, never under the button.

This file is the record of the check. Re-check every six months, whenever a number appears in a new place, and whenever
the daily re-check workflow fails (see "Scheduled re-check").

Checked on **2026-11-14** by fetching each page directly (`curl`, then the page text with scripts and tags removed; the
quotes below are copied from that text). The 2026-11-12 check found the same wording.

## Verified

| Number | Service | Hours | Cost to caller | Source (official) | Checked | Quote from the source |
|---|---|---|---|---|---|---|
| 1323 | Mental health hotline, Department of Mental Health, Ministry of Public Health (สายด่วนสุขภาพจิต กรมสุขภาพจิต) | 24 hours | Free | https://dmh.go.th/ (DMH home page) and https://checkin.dmh.go.th/ (DMH Mental Health Check In) | 2026-11-14 | dmh.go.th: "1323 สายด่วนสุขภาพจิต บริการปรึกษาปัญหาสุขภาพจิตฟรีตลอด 24 ชั่วโมง". checkin.dmh.go.th: "สายด่วนสุขภาพจิต 1323 ตลอด 24 ชั่วโมง ไม่มีค่าใช้จ่าย" and "โทร สายด่วนสุขภาพจิต 1323 ฟรี ตลอด 24 ชม." |
| 1669 | Medical emergency / ambulance, National Institute for Emergency Medicine (สพฉ.) | not shown (see note) | not shown (see note) | https://www.niems.go.th/ (site header) | 2026-11-14 | "เจ็บป่วยฉุกเฉิน โทร. 1669" |
| 191 | Police emergency (เหตุด่วนเหตุร้าย), 191 Emergency Center, Panfah News Center Unit, Metropolitan Police Bureau, Royal Thai Police | 24 hours | not shown (see note) | https://www.191.go.th/ (Thai) and https://www.191.go.th/en | 2026-11-14 | Thai page: "สายด่วนฉุกเฉิน 191 ตลอด 24 ชั่วโมง" and "สายด่วน 191 รับแจ้ง 24 ชั่วโมง"; English page: "24/7 public emergency intake and dispatch to nearest response units" |
| 1300 | Social Assistance Center hotline, Ministry of Social Development and Human Security (ศูนย์ช่วยเหลือสังคม สายด่วน 1300 กระทรวง พม.) | 24 hours, 7 days | not shown (see note) | https://1300thailand.m-society.go.th/page/3 and https://1300thailand.m-society.go.th/faq | 2026-11-14 | "สายด่วน 1300 เปิดให้บริการตลอดเวลา 24 ชั่วโมง 7 วัน"; FAQ: "ให้บริการ สายด่วน 1300 ตลอด24 ชั่วโมง 7 วัน" |
| 02 113 6789 | Samaritans of Thailand (สมาคมสะมาริตันส์แห่งประเทศไทย), listening line | 12:00–22:00 (days not stated on the own site) | not shown (ordinary call rates; the site does not say) | https://www.samaritansthai.com/ (the association's own site) | 2026-11-14 | "ฟังคุณด้วยใจ โทร. 02-113-6789 เวลา 12:00-22:00 น." and "รับฟังทุกเรื่องด้วยใจ โทร. 02-113-6789" |

Notes on the table:

- **1669 hours and cost.** niems.go.th still shows only the header text to a direct fetch ("เจ็บป่วยฉุกเฉิน โทร. 1669");
  the article pages are drawn by JavaScript. A web search on 2026-11-14 found no niems.go.th page stating the hours. The
  product therefore shows 1669 as "เจ็บป่วยฉุกเฉิน / Medical emergency / 医疗急救" with **no hours and no cost**, as the
  owner order requires when the page does not say "24 hours". **Not verified: 1669 hours** (reported to the owner).
- **191 cost.** The 2026-11-12 check read "Free line" on the English page; the 2026-11-14 text does not show it, so the
  product does not say "free" for 191. The page is run by the Bangkok Metropolitan Police; 191 is the national police
  emergency number, and the product says only "police, 24 hours".
- **1300 cost.** The page says the ministry "ได้รับการยกเว้นค่าบริการสำหรับการใช้บริการเลขหมายโทรศัพท์แบบสั้น 4 หลัก"
  (2560). That is a fee waiver for the short number, not a clear statement that the call is free for the caller, so the
  product does not say "free" for 1300.
- **1300 scope.** The source lists domestic violence and children and young people, not "abuse" in general.
- **1323 "free".** dmh.go.th says ฟรี, so "free" may be said; the owner's 1323 wording does not use it.
- **Samaritans languages.** The association's own site does not state the languages of the line. The product does
  **not** claim an English line; it shows the number and the hours only.
- **1323 languages.** dmh.go.th does not mention languages. The product does not claim English or Chinese service on
  1323; the Chinese help line says no verified Chinese-language line exists in Thailand.

## Not verified, not published

| Item | Why not published |
|---|---|
| A Chinese-language crisis line run in Thailand | None found on an official Thai source. The Chinese line says so honestly ("目前没有经核实的泰国中文热线") and gives 1323 / 1669 plus "call your local emergency number". No foreign hotline is listed. |
| An English-language line on 1323 | Not stated by DMH. |
| 1669 hours ("24 hours") and "free" | Not on a niems.go.th page we could fetch (2026-11-12 and 2026-11-14). |
| 191 "free" | Not on the 2026-11-14 page text. |
| 1300 "free" | Source says the short number's service fee was waived for the ministry, not that the call is free to the caller. |
| Samaritans "English line", "every day" | Only in third-party and Befrienders pages, not on the association's own site. |

## Scheduled re-check

`.github/workflows/helpline-recheck.yml` ("Help line re-check") runs every day at 01:17 UTC (08:17 Bangkok) and on
demand. It runs `node tools/helpline-recheck.mjs`, which fetches each official page in `tools/helpline-sources.json` and
fails when a quoted phrase above (number and hours) is no longer on the page (a page it cannot fetch is a warning: see
below). GitHub emails the owner when a scheduled run fails. It uses no secrets, has a read-only token, changes nothing, and is not part
of the CI gate (`ci.yml`), so it adds no time to the gate. When it fails: open the page, re-check the number and hours,
update this table and the component, and only then update the phrase in `tools/helpline-sources.json`.

Owner decision 197 ค (2026-11-21), because the GitHub runner often cannot reach the 1669 and 1300 pages (this machine can):
- Each page is fetched up to 3 times (5 s, then 10 s apart).
- Three outcomes are reported separately. **ok**: the quoted phrase is on the page (a spacing-only difference such as
  "ตลอด24" / "ตลอด 24" is ok and noted). **CHANGED**: the page was read and the phrase is gone; the log says whether the
  number itself is no longer on the page or the number is still there but its sentence (hours, wording) changed, and
  prints the sentence around the number. **could not fetch**: the page was not read, so nothing is known about the number.
- Only CHANGED fails the run (GitHub emails the owner). "could not fetch" is a yellow warning annotation on a green run and
  a line in the log; it is never reported as a number change and never passes silently. When it repeats, open the page by
  hand from a Thai connection.
- Tests: `tests/unit/a5-defects.test.js` (fixtures in `tests/unit/fixtures/helpline-recheck/`, no network).

## Where each number appears

**Placement change, owner decision 2026-11-16 (crisis one-number rules; replaces the earlier rules where they differ).**
Every fortune page shows ONE number, 1323, with ONE call button. 1669, 191, 1300 and Samaritans are no longer on any fortune
page (card, calm line, print view, help rows): they are on a separate platform page, `counselling.html` ("ช่องทางให้คำปรึกษา" /
"Counselling services" / "咨询服务渠道"), one service per row with its call button (the shared component, brief form: label,
call button, second line with the verified hours), plus the abroad note. It loads the crisis net (`fortune-crisis.js`), carries
no reading, ads, offers or prices, and is linked only from the crisis card, the calm / print help line, the top-bar dialog
(hook: `LQHelpline.link()`, added when `fortune-top-compact` is merged), `help.html` and `privacy.html`; it is not in the menus
(`tools/cat-data.cjs` UNLINKED). `tools/helpline.mjs` redraws its rows (CALL_PAGES), so the daily re-check
(`tools/helpline-recheck.mjs`, `tools/helpline-sources.json`) still covers every number shown.
The crisis card reads, in this order: a short title, two or three short warm lines, "อ่านเพิ่มเติม" (closed; the longer text),
the free comforting guidance (no belief remedy, no price; hard limit 3), the "โทร 1323" button (`tel:1323`, at least 44 px),
then one small text link "ช่องทางให้คำปรึกษา". No list of instructions. Nothing interrupts reading: no call button, banner or
box between content sections, and no sticky or floating help element (the calm-state line is now in the page flow AFTER the
reading; the old sticky dock is gone). Normal state: the small 1323 control at the top stays (decision 69). Rule 6 switch:
`window.LENSIQ_HELP_TOP_STICKY` in `lensiq-config.js` (one line; shipped on, decision 75 ก): on = the 1323 icon sits INSIDE the sticky
top bar and asks first (call 1323, or the counselling-page link); off = it stays at the top of the page content and scrolls away. All result content stays hidden in the crisis state (hotfix 2026-11-16,
`docs/INCIDENT-2026-11-16-CRISIS-LEAK.md`). Tests (locked first): `tests/unit/crisis-rules-1323.test.js`,
`tests/e2e/crisis-rules-1323-{a,b,c}.e2e.mjs` (19 fortune pages x TH / EN / ZH x 360 / 393 / 430 px).

Reduced card wording (for the professional review, L63):

| Part | TH | EN | ZH |
|---|---|---|---|
| Title | ขอหยุดคำทำนายไว้ก่อน | Let's pause the reading | 先暂停这次解读 |
| Warm lines | ขอบคุณที่เล่าให้ฟัง เรื่องนี้ฟังดูหนักใจ คุณไม่ต้องเผชิญมันคนเดียว | Thank you for telling us. You don't have to face this alone. | 谢谢你愿意说出来。这听起来很沉重，你不需要独自面对。 |
| Comforting guidance | ลองหายใจช้า ๆ สักครู่ ถ้ามีคนที่คุณไว้ใจ ลองเล่าให้เขาฟังว่ากำลังรู้สึกอย่างไร | Take a slow breath. If there is someone you trust, try telling them how you feel. | 先慢慢地呼吸一下。如果身边有你信任的人，试着告诉对方你现在的感受。 |
| Behind "อ่านเพิ่มเติม" | the earlier card's lead and body (shortened), "go to the nearest hospital if you are in danger now", the abroad note, "nothing saved · awaiting professional review" | same | same |
| Link | ช่องทางให้คำปรึกษา | Counselling services | 咨询服务渠道 |

**Earlier placement change, owner decision 2026-11-15 (help line in one place per page; ช่วยเหลือที่เดียวต่อหน้า).** The owner ordered the
1323 and 1669 rows at the bottom of every fortune page removed (the end-of-page line `#lqHelpEnd` and the line under every
normal reading) and a single small "อยากมีคนรับฟัง" tap-to-call button kept near the top of each fortune page; one tap calls
(a `tel:` link, no extra sheet). **Owner decision 54, option ข (2026-11-15):** that button is the only help control in the
normal state; 1669 and the other numbers appear only on the full help card when the crisis flag is set. The rule is that no
help number appears more than once per page in the normal state (not that every number must appear). The second line ("พูดคุยได้ตลอด 24 ชั่วโมง กับผู้ที่พร้อมรับฟัง"), the agency and the abroad
note are no longer on the normal page; they stay in the crisis card, in the calm-state line and in the printed report. The
crisis net is unchanged: when it triggers, the full help card with every number replaces the reading (not a duplicate). The
owner pre-approved this placement on 2026-11-15; it is listed for the mental-health professional's review (L63) below.
Calm state (the crisis net after a soft step or support card in this tab) keeps its own line next to the reading, as before;
it is not the normal state. Tests: `tests/unit/fortune-live.test.js`, `tests/e2e/fortune-live.e2e.mjs` (normal state at 375 px,
TH / EN / ZH: every number at most once, 1323 exactly once, 1669 / 191 / 1300 / Samaritans none; crisis card has them all;
button in the first screen, at least 44 px, not covered, clear of the header at 320 / 375 / 430 px; one tap reaches `tel:1323`;
crisis card replaces the reading).

**Placement change, owner decision 69 option ค (2026-11-16): the 1323 control moves into the top bar, with a confirmation
step.** On every fortune page and the fortune category page, `#lqHelpTop` (still written into the HTML by `tools/helpline.mjs`,
so it calls without JavaScript) is moved by `nav.js` into the sticky top bar as a small phone icon with "1323" (the bar stays
on screen while the page scrolls). Its accessible name stays "อยากมีคนรับฟัง โทร 1323" / "Want someone to listen? Call 1323" /
"想找人倾听？拨打 1323" (`call.1323.btn`). The large blue button is no longer in the page content, so 1323 still shows once per
page in the normal state. The first tap opens a small confirmation (`dialog.lq-help-dlg`, styles in `fortune-top.css`,
inlined into the fortune pages by `tools/helpline.mjs`) with the same words, a call
button (`tel:1323`, at least 44 px) and a close button, so a stray tap does not start a call; the call is one more tap. Escape,
the close button or a tap outside closes it and focus returns to the control. Counting rule for "once per page" (tests): visible
text and visible `tel:` links, a number that is the text of its own `tel:` link counted once; the confirmation counts only while
it is open. Crisis state: the full help card with every number still replaces the reading; its numbers are direct tap-to-call
(no confirmation). The top-bar control stays during the crisis state (same number; the card is exempt from the once-per-page
rule). Below 480 px the language switch in the bar shows one control (the current language) that opens the three choices, so
the bar fits at 360 px. Owner reason: on a real iPhone 16 Pro the button was larger and more prominent than the page title
(owner order 2026-11-16 item 1). Listed for the mental-health professional's review (L63), with the question "does a
confirmation step before calling add harmful friction?". Tests: `tests/e2e/fortune-top-compact.e2e.mjs` C2, C6, C7, C8;
re-locked `tests/e2e/fortune-live.e2e.mjs` H2 and `tests/e2e/fortune-helpline.e2e.mjs` (evals-locks/fortune-top-compact.sha256).

**Stickiness switch (owner crisis rules 2026-11-16; owner decision 75 option ก: the icon stays in the sticky top bar):**
`window.LENSIQ_HELP_TOP_STICKY` in `lensiq-config.js` (default on = decision 75 ก). Off: nav.js leaves `#lqHelpTop` at the top of the page content (class `.lq-helpquiet`, same
icon + "1323", not sticky); the confirmation step stays. The sticky read bar below is a reading control and never carries
a help number.

**Sticky read bar (review 2026-11-16):** the copy of a reading page's own read button at the bottom of the screen
(`fortune-readbar.js`) is never shown in the crisis state (`html[data-lq-crisis]`) or while a help card is on screen, and it
sits at the bottom only, so it cannot cover the top-bar 1323 control.

**Hook for crisis flow v2 (branch crisis-v2-live, not merged; it owns the calm-state behaviour).** The control keeps the id
`#lqHelpTop` (now inside `#siteNav`, class `.lq-helpnav`; the header has `.has-help`); the link is
`#lqHelpTop [data-lq-call="1323"] a.lq-call-btn`. `window.LQHelpTop = { el, link, dlg, open(), close(), confirm }`:
`LQHelpTop.open()` shows the confirmation, `LQHelpTop.confirm = false` makes the first tap call directly (for example in the
calm state, if crisis v2 decides so). The in-content styles `.lq-helpline.lq-helpbar` still apply when JavaScript is off.

Every place draws the number with the shared component `lensiq-helpline.js` (static HTML written by
`tools/helpline.mjs`, which also re-draws every static copy so none can drift).

| Place | Numbers | Wording source |
|---|---|---|
| Help button, ONE place per fortune page (owner decision 2026-11-15, see below): one small row near the top of every fortune page and the fortune category page, in the HTML so it shows without JavaScript: "อยากมีคนรับฟัง 1323" (tap-to-call) only (decision 54 ข) | 1323 (once per page; 1669 and the others only on the crisis card) | `tools/helpline.mjs` `miniCall()` / `snippet()`, `tools/cat-pages.mjs`, `lensiq-helpline.js` (labels, accessible names), `i18n/{en,zh}-common.js` keys `call.*.label`, `call.*.btn`, `help.line.label` |
| Under a reading, only on a calm page (crisis net: crisis state, calm session, distress words typed); in the page flow AFTER the reading, never sticky (2026-11-16) | 1323 with the full wording, then the link to `counselling.html` | `fortune-crisis.js` `helpLine()` / `calmDock()`, `fortune-ai.js` |
| Printed / PDF report (`report.html`) | the 1323 line at the end of the report (2026-11-16: 1323 only), shown in the print view only (hidden on screen, where the top button is the one place) | `report.js`, `styles.css` `.lq-helpline-print` |
| Crisis support card (`fortune-ai.js`) | 1323 only (2026-11-16), then the link to `counselling.html` | `lensiq-helpline.js` |
| Counselling page (`counselling.html`, 2026-11-16) | 1323, 1669, 191, 1300, 02 113 6789, one row each, plus the abroad note | `lensiq-helpline.js` (brief form), `tools/helpline.mjs` |
| Help button, ONE place per fortune page (owner decision 2026-11-15; since 2026-11-16, decision 69 ค, in the top bar as a phone icon + "1323" with a confirmation step, see above): one small row near the top of every fortune page and the fortune category page, in the HTML so it shows without JavaScript: "อยากมีคนรับฟัง 1323" (tap-to-call) only (decision 54 ข) | 1323 (once per page; 1669 and the others only on the crisis card) | `tools/helpline.mjs` `miniCall()` / `snippet()`, `tools/cat-pages.mjs`, `lensiq-helpline.js` (labels, accessible names), `i18n/{en,zh}-common.js` keys `call.*.label`, `call.*.btn`, `help.line.label` |
| Under a reading, only on a calm page (crisis net: crisis state, calm session, distress words typed); sticky next to the reading | 1323, 1669 with the full wording and the abroad note | `fortune-crisis.js` `helpLine()` / `calmDock()`, `fortune-ai.js` |
| Printed / PDF report (`report.html`) | the full line at the end of the report, shown in the print view only (hidden on screen, where the top button is the one place) | `report.js`, `styles.css` `.lq-helpline-print` |
| Crisis support card (`fortune-ai.js`) | 1323, 1669, 191, 1300, 02 113 6789 | `lensiq-helpline.js` |
| Merit panel support card | same card | `lensiq-merit.js` uses the `fortune-ai.js` card |
| Medicine checker (`medicine.html`): safety bar, emergency card, product-check bottom bar | 1669; 1323 on self-harm wording | `lensiq-helpline.js` (1367 Poison Center is outside this order and unchanged) |
| Nutrition help (`nutrition.html`) | 1323 | `lensiq-helpline.js` |
| Terms (`terms.html`) TH / EN / ZH | 1323; 1669 in the medicine clause | `lensiq-helpline.js` (fixed-language copies) |
| Share card image made with `fortune-kit.js` `makeCard` (I Ching, Zodiac, Dream, Astro) | 1323 (text in the image, cannot be tapped) | `fortune-kit.js` `fk.card.help` |
| Merit API refusal (`backend/src/merit.js` `HELP`) | 1323, 1669, 191, 1300 (data only; the page shows the card above) | `backend/src/merit.js` |

## Wording for professional review

All of it is "pending-professional-review" (launch item L63, `docs/LEGAL-PACKET.md` 6.9). Added to the L63 review list on
2026-11-16: the owner changed the placement (top bar, phone icon + "1323") and added a confirmation step before calling
(decision 69 ค); question for the professional: "does a confirmation step before calling add harmful friction?". The 1323 Thai wording is the
owner's own (2026-11-14). The button and the second line never use the words in `lensiq-helpline.js` `FORBIDDEN`
(owner lists: TH ผู้ป่วย, โรค, จิตเวช, อาการ, ภาวะ, ปัญหาสุขภาพจิต; EN patient, disease, illness, psychiatric, symptom,
disorder, "mental health problem"; ZH 患者, 病, 精神科, 症状, 障碍, 心理疾病; plus close variants). On a phone each line is one
row: the short label, then the call button; the whole wording is the button's accessible name.

| Line | Language | Button (label + call button) | Second line | Small print |
|---|---|---|---|---|
| 1323 | TH | อยากมีคนรับฟัง โทร 1323 | พูดคุยได้ตลอด 24 ชั่วโมง กับผู้ที่พร้อมรับฟัง | บริการของกรมสุขภาพจิต |
| 1323 | EN | Want someone to listen? Call 1323 | Talk any time, 24 hours a day, with someone ready to listen | A service of the Department of Mental Health, Thailand |
| 1323 | ZH | 想找人倾听？拨打 1323 | 随时可以聊，24 小时有人愿意倾听 | 泰国心理健康司提供的服务 |
| 1669 | TH | เจ็บป่วยฉุกเฉิน โทร 1669 | ขอรถพยาบาลและความช่วยเหลือทางการแพทย์ฉุกเฉิน | สถาบันการแพทย์ฉุกเฉินแห่งชาติ (สพฉ.) |
| 1669 | EN | Medical emergency? Call 1669 | Ambulance and emergency medical help | National Institute for Emergency Medicine (NIEM) |
| 1669 | ZH | 医疗急救 拨打 1669 | 救护车和紧急医疗援助 | 泰国国家紧急医疗研究院（NIEM） |
| 191 | TH | แจ้งเหตุด่วนเหตุร้าย โทร 191 | แจ้งตำรวจได้ตลอด 24 ชั่วโมง | สำนักงานตำรวจแห่งชาติ |
| 191 | EN | Police emergency? Call 191 | Reach the police, 24 hours a day | Royal Thai Police |
| 191 | ZH | 报警 拨打 191 | 24 小时联系警察 | 泰国皇家警察 |
| 1300 | TH | ศูนย์ช่วยเหลือสังคม โทร 1300 | ความรุนแรงในครอบครัว เด็กและเยาวชน ตลอด 24 ชั่วโมง 7 วัน | กระทรวงการพัฒนาสังคมและความมั่นคงของมนุษย์ (พม.) |
| 1300 | EN | Social Assistance Center: Call 1300 | Domestic violence, children and young people; 24 hours, 7 days | Ministry of Social Development and Human Security |
| 1300 | ZH | 社会援助中心 拨打 1300 | 家庭暴力、儿童和青少年求助，每周 7 天 24 小时 | 泰国社会发展与人类安全部 |
| 02 113 6789 | TH | สะมาริตันส์ โทร 02 113 6789 | รับฟังทุกเรื่องด้วยใจ เวลา 12:00–22:00 น. | สมาคมสะมาริตันส์แห่งประเทศไทย |
| 02 113 6789 | EN | Samaritans: Call 02 113 6789 | A listening line, 12:00–22:00 | Samaritans of Thailand |
| 02 113 6789 | ZH | 撒玛利亚会 拨打 02 113 6789 | 倾听热线，12:00–22:00 | 泰国撒玛利亚会（Samaritans of Thailand） |

Also for review: the share-card line (TH "อยากมีคนรับฟัง โทร 1323 · พูดคุยได้ตลอด 24 ชั่วโมง กับผู้ที่พร้อมรับฟัง"), the help
line's note ("อยู่ต่างประเทศ โทรเบอร์ฉุกเฉินของประเทศนั้น" / "Outside Thailand, call your local emergency number." /
"目前没有经核实的泰国中文热线；不在泰国时请拨打当地紧急电话。") and the support card text (`fortune-ai.js` `SUPPORT`).

Also for review (added 2026-11-15, owner pre-approved the placement): the fortune pages' single top help button. On a normal
fortune page the visitor now sees only "อยากมีคนรับฟัง 1323" (EN "Want someone to listen? 1323", ZH "想找人倾听？1323") as one
small tap-to-call button near the top (owner decision 54 ข); the accessible name is the full button wording in the table
above. 1669, 191, 1300 and Samaritans are not on the normal page; they show on the full help card when the crisis flag is set.
The question for the reviewer: is one 1323 button near the top enough on a normal fortune page, without 1669, the second
line, the agency name and the abroad note (they remain on the crisis card, the calm-state line and the printed report)?

Analytics (owner decision 77 ก, 2026-11-16): the counselling page and every crisis-state view are never counted, for anyone
(no record of who opens crisis help); see `docs/PDPA-NOTES-FOR-COUNSEL.md`.
