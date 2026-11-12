# Crisis help resources: what we show and where it comes from

Owner order 2026-11-12: every fortune page and every reading shows a calm line with real help resources, and only
numbers and hours checked against an official source are published. This file is the record of that check. Re-check
every six months, and whenever a number appears in a new place.

Checked on **2026-11-12** by fetching each page directly (the quotes below are copied from the fetched page text).

## Verified

| Number | Service | Hours | Cost to caller | Source (official) | Checked | Quote from the source |
|---|---|---|---|---|---|---|
| 1323 | Mental health hotline, Department of Mental Health, Ministry of Public Health (สายด่วนสุขภาพจิต กรมสุขภาพจิต) | 24 hours | Free | https://dmh.go.th/ (DMH home page) and https://checkin.dmh.go.th/ (DMH Mental Health Check In) | 2026-11-12 | dmh.go.th: "1323 สายด่วนสุขภาพจิต … บริการปรึกษาปัญหาสุขภาพจิตฟรีตลอด 24 ชั่วโมง". checkin.dmh.go.th: "สายด่วนสุขภาพจิต 1323 ตลอด 24 ชั่วโมง ไม่มีค่าใช้จ่าย" and "รู้สึกไม่ไหว อยากคุยกับใครสักคนตอนนี้ — โทร สายด่วนสุขภาพจิต 1323 ฟรี ตลอด 24 ชม." |
| 1669 | Medical emergency / ambulance, National Institute for Emergency Medicine (สพฉ.) | not shown (see note) | not shown (see note) | https://www.niems.go.th/ (site header) | 2026-11-12 | "เจ็บป่วยฉุกเฉิน โทร. 1669" |
| 191 | Police emergency (เหตุด่วนเหตุร้าย), 191 Emergency Center, Panfah News Center Unit, Metropolitan Police Bureau | 24 hours, 7 days | Free | https://www.191.go.th/en | 2026-11-12 | "24/7 public emergency intake and dispatch to nearest response units"; "Free line"; run "under the Patrol and Special Operations Division, Metropolitan Police Bureau" |
| 1300 | Social Assistance Center hotline, Ministry of Social Development and Human Security (ศูนย์ช่วยเหลือสังคม สายด่วน 1300 กระทรวง พม.) | 24 hours, 7 days | not shown (see note) | https://1300thailand.m-society.go.th/page/3 and https://1300thailand.m-society.go.th/faq | 2026-11-12 | "สายด่วน 1300 เปิดให้บริการตลอดเวลา 24 ชั่วโมง 7 วัน"; FAQ: "ให้บริการ สายด่วน 1300 ตลอด24 ชั่วโมง 7 วัน". Problem areas listed include "ปัญหาความรุนแรงในครอบครัว" and "ปัญหาเด็กและเยาวชน" |
| 02 113 6789 | Samaritans of Thailand (สมาคมสะมาริตันส์แห่งประเทศไทย), listening line | 12:00–22:00 daily | not shown (ordinary call rates; the site does not say) | https://www.samaritansthai.com/ (the association's own site) | 2026-11-12 | "ฟังคุณด้วยใจ โทร. 02-113-6789 เวลา 12:00-22:00 น." |

Notes on the table:

- **1669 hours and cost.** The niems.go.th article pages are drawn by JavaScript and returned "404" to a direct fetch, so
  the only text we could read on the official site is the header ("เจ็บป่วยฉุกเฉิน โทร. 1669"). A search-engine copy of
  niems.go.th pages says "free 24-hr emergency helpline", but that is not a direct read, so the product shows 1669 only as
  "เจ็บป่วยฉุกเฉิน / Medical emergency / 医疗急救" with **no hours and no cost**.
- **1300 cost.** The page says the ministry "ได้รับการยกเว้นค่าบริการสำหรับการใช้บริการเลขหมายโทรศัพท์แบบสั้น 4 หลัก"
  (2560). That is a fee waiver for the short number, not a clear statement that the call is free for the caller, so the
  product does not say "free" for 1300.
- **1300 scope.** The source lists domestic violence and children and young people, not "abuse" in general. The support
  card wording was changed from "การถูกทำร้าย / abuse / 受虐" to the two listed areas.
- **Samaritans languages.** The association's own site does not state the languages of the line. The Befrienders
  Worldwide directory (https://befrienders.org/find-support-now/samaritans-of-thailand-bangkok-centre, checked
  2026-11-12) lists "English, Thai" and the same hours (Monday–Sunday 12:00–22:00). Because the own site does not say it,
  the product does **not** claim an English line; it shows the number and the hours only.
- **1323 languages.** dmh.go.th does not mention languages. The product does not claim English or Chinese service on
  1323.

## Not verified, not published

| Item | Why not published |
|---|---|
| A Chinese-language crisis line run in Thailand | None found on an official Thai source. The Chinese line says so honestly ("目前没有经核实的泰国中文热线") and gives 1323 / 1669 plus "call your local emergency number". No foreign hotline is listed. |
| An English-language line on 1323 | Not stated by DMH. |
| 1669 "free, 24 hours" | Only seen in a search-engine copy of niems.go.th, not on a page we could fetch (see note). |
| 1300 "free" | Source says the short number's service fee was waived for the ministry, not that the call is free to the caller. |
| Samaritans "English line" / "press 2" | Only in third-party and Befrienders pages, not on the association's own site. |

## Where each number appears

| Place | Numbers | Wording source |
|---|---|---|
| Always-visible line on every fortune page (top and end of the page, in the HTML so it shows without JavaScript) and under every reading | 1323 (free, 24 hours), 1669 (medical emergency) | `fortune-crisis.js` `HELP` (canonical), `tools/helpline.mjs` writes the static HTML, `i18n/{en,zh}-common.js` keys `help.line.*` |
| Printed / PDF report (`report.html`) | same line at the end of the report, kept in the print view | `report.js` |
| Share card made with `fortune-kit.js` `makeCard` (I Ching, Zodiac, Dream, Astro) | 1323 | `fortune-kit.js` |
| Crisis support card (`fortune-ai.js` `SUPPORT`) | 1323, 1669, 191, 1300, 02 113 6789 | `fortune-ai.js` |

Wording of the always-visible line (final):

- TH: ถ้ากำลังรู้สึกไม่ไหว โทรคุยได้ที่สายด่วนสุขภาพจิต **1323** ฟรี ตลอด 24 ชั่วโมง · เจ็บป่วยฉุกเฉิน **1669** ·
  อยู่ต่างประเทศ โทรเบอร์ฉุกเฉินของประเทศนั้น
- EN: If things feel like too much, you can talk to someone: Thai mental health hotline **1323**, free, 24 hours ·
  Medical emergency **1669** · Outside Thailand, call your local emergency number.
- ZH: 如果你感觉撑不下去，可以打电话找人聊聊：泰国心理健康热线 **1323**，免费，24 小时 · 医疗急救 **1669** ·
  目前没有经核实的泰国中文热线；不在泰国时请拨打当地紧急电话。

The support card wording is still "pending-professional-review" (L-M14). The always-visible line is plain information
(service name, number, hours, cost) and was written to be calm; it should be included in the same professional review.
