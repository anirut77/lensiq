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
fails when a quoted phrase above (number and hours) is no longer on the page, or the page cannot be fetched. GitHub
emails the owner when a scheduled run fails. It uses no secrets, has a read-only token, changes nothing, and is not part
of the CI gate (`ci.yml`), so it adds no time to the gate. When it fails: open the page, re-check the number and hours,
update this table and the component, and only then update the phrase in `tools/helpline-sources.json`.

## Where each number appears

Every place draws the number with the shared component `lensiq-helpline.js` (static HTML written by
`tools/helpline.mjs`, which also re-draws every static copy so none can drift).

| Place | Numbers | Wording source |
|---|---|---|
| Always-visible line on every fortune page (top and end of the page, in the HTML so it shows without JavaScript), the fortune category page and under every reading (sticky in the calm state) | 1323, 1669 | `lensiq-helpline.js`, `fortune-crisis.js` `HELP` (label, note), `tools/helpline.mjs`, `tools/cat-pages.mjs`, `i18n/{en,zh}-common.js` keys `call.*`, `help.line.*` |
| Printed / PDF report (`report.html`) | same line at the end of the report, kept in the print view | `report.js` |
| Crisis acknowledgement card (crisis flow v2; `fortune-crisis.js` `CARD` text, shown by `fortune-ai.js`) | 1323, 1669, 191, 1300, 02 113 6789 | `lensiq-helpline.js` (lines), `fortune-crisis.js` (card text) |
| Pinned help bar in a calm tab (crisis flow v2; `fortune-crisis.js` `helpBar`): the 1323 row always visible, the other rows behind "more help lines" | 1323; 02 113 6789, 1300, 191, 1669 | `lensiq-helpline.js` |
| Hope frame closing line of a calm reading (`fortune-crisis.js` `HOPE`): text inside the reading, not a button; the pinned bar's 1323 button is on screen next to it | 1323 (free, 24 hours) | `fortune-crisis.js` |
| Merit panel support card | same card | `lensiq-merit.js` uses the `fortune-ai.js` card |
| Medicine checker (`medicine.html`): safety bar, emergency card, product-check bottom bar | 1669; 1323 on self-harm wording | `lensiq-helpline.js` (1367 Poison Center is outside this order and unchanged) |
| Nutrition help (`nutrition.html`) | 1323 | `lensiq-helpline.js` |
| Terms (`terms.html`) TH / EN / ZH | 1323; 1669 in the medicine clause | `lensiq-helpline.js` (fixed-language copies) |
| Share card image made with `fortune-kit.js` `makeCard` (I Ching, Zodiac, Dream, Astro) | 1323 (text in the image, cannot be tapped) | `fortune-kit.js` `fk.card.help` |
| Merit API refusal (`backend/src/merit.js` `HELP`) | 1323, 1669, 191, 1300 (data only; the page shows the card above) | `backend/src/merit.js` |

## Wording for professional review

All of it is "pending-professional-review" (launch item L63, `docs/LEGAL-PACKET.md` 6.9). The 1323 Thai wording is the
owner's own (2026-11-14). The button and the second line never use the words in `lensiq-helpline.js` `FORBIDDEN`
(owner lists: TH ผู้ป่วย, โรค, จิตเวช, อาการ, ภาวะ, ปัญหาสุขภาพจิต; EN patient, disease, illness, psychiatric, symptom,
disorder, "mental health problem"; ZH 患者, 病, 精神科, 症状, 障碍, 心理疾病; plus close variants). On a phone each line is one
row: the short label, then the call button; the whole wording is the button's accessible name.

| Line | Language | Button (label + call button) | Second line | Small print |
|---|---|---|---|---|
| 1323 | TH | อยากมีคนรับฟัง โทร 1323 | พูดคุยได้ตลอด 24 ชั่วโมง กับผู้ที่พร้อมรับฟัง | บริการของกรมสุขภาพจิต |
| 1323 | EN | Want someone to listen? Call 1323 | Talk any time, 24 hours a day, with someone ready to listen | A service of the Department of Mental Health, Thailand |
| 1323 | ZH | 想找人倾听？拨打 1323 | 24 小时随时可以聊，有人愿意倾听 | 泰国心理健康司提供的服务 |
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
