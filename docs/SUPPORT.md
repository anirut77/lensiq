# Support, service levels and incident handling

Two layers. **Self-serve tiers** (Guest, Member, Plus / one-time report buyers, Creator, Business — §0; Creator was called Pro before round 10) get the published response targets shown on
`help.html#h-support`. **Contracted customers** (Enterprise, on-prem, pilots) sign the SLA template in §1–§9 with the
Basic / Standard / Premium plan. Response templates in Thai are in §10, the status page and incident routine in §11.
Values in [brackets] are negotiable defaults. Support e-mail, LINE OA and status page are one config: `window.LENSIQ_SELLER` in `lensiq-config.js` (help / terms / privacy show "announced before sales open" until it is filled; `node tools/check-legal.mjs` blocks a deploy with billing on and gaps). **This is not legal advice** (see `docs/LEGAL-REVIEW-PACK.md`).

## 0. Self-serve tiers (draft — effective when paid plans go on sale)

| | Guest | Member · Plus · report buyers | Creator (formerly Pro) | Business |
|---|---|---|---|---|
| Who | Anyone, no sign-in | Free Google sign-in; Plus (`plus`) and one-time reports (`report_basic` / `report_compat` / `report_annual`) are paid consumer purchases (`docs/BILLING-PLAN.md` §3.0) | Paid (`pro`, §3.1) | Paid (`business`, §3.1) |
| Channels | Help/FAQ page, contact form (`index.html#contact`), e-mail | E-mail | E-mail | E-mail + LINE Official |
| Hours (Asia/Bangkok) | Mon–Fri 09:00–18:00 | Mon–Fri 09:00–18:00 | Mon–Fri 09:00–18:00 | Mon–Sat 09:00–18:00 |
| First response | Best effort, no commitment | ≤ 3 business days | ≤ 2 business days | Next business day |
| Billing / refund questions | n/a | ≤ 3 business days (Plus / report buyers: ≤ 1 business day) | ≤ 1 business day | ≤ 1 business day |
| Privacy or security report (any tier) | ≤ 1 business day; suspected breach handled as S1 (§3) | same | same | same |
| Languages | Thai, English, 中文 (best effort) | Thai, English, 中文 | Thai, English, 中文 | Thai, English, 中文 |
| Onboarding | — | — | — | 1 × 30-min call |
| Service credit | — | Plus: pro-rata refund if online service unavailable > 24 h in a month; reports: full refund within 14 days if not opened, credit restored / refund if a report failed to generate (terms §9) | Pro-rata refund if online service unavailable > 24 h in a month (terms §9) | same |
| Renewal reminder | — | Plus: in-account banner and account-menu reminder from 7 days before the period ends (no e-mail yet, terms §8) | same | same |

On-device tools have no availability target (they run offline). The online features (sign-in, writing assistant,
payments, statistics) target [99.5 %] monthly once paid plans exist; when they fail, fortune pages fall back to the
local composer automatically and nothing else is affected.

Contracted plans (§2) are for organisations that need named contacts, on-site visits, a DPA or faster targets.

## 1. Scope

| In scope | Out of scope |
|---|---|
| LENSIQ web app and `server.py` at the version named in the order form | Customer-owned hardware, network, OS and browser updates (best effort only) |
| Configuration of the modules listed in the order form | Accuracy on camera positions that the site survey rejected |
| Model and vendor updates shipped in LENSIQ releases | Third-party cloud AI availability (Anthropic, Replicate): their own SLAs apply |
| PDPA pack updates (`docs/pdpa/`) | Legal advice, and DPIA sign-off on the customer's behalf |

## 2. Plans

| | Basic | Standard | Premium |
|---|---|---|---|
| Support hours (Asia/Bangkok) | Mon–Fri 09:00–18:00 | Mon–Sat 09:00–20:00 | 7 days 08:00–22:00 |
| Channels | Email, ticket | + LINE Official / phone | + named engineer, on-site visit |
| Languages | Thai, English | Thai, English, 中文 | Thai, English, 中文 |
| Releases | Quarterly | Monthly | Monthly + hotfixes |
| On-site visits included | 0 | [1 per year] | [4 per year] |
| Pilot / re-acceptance (`PILOT-PLAN.md`) | Paid | [1 per year] | On every new site |
| Price (draft list price, VAT excl., per site per year — confirm in the quotation) | [36,000 THB] | [96,000 THB] | [240,000 THB] |
| Pilot fee credit | Pilot fee credited against year 1 when signed within 30 days of the pilot report | same | same |

## 3. Severity and response targets

| Severity | Definition | Example | First response | Workaround target | Fix target |
|---|---|---|---|---|---|
| **S1 Critical** | Service down at a site in opening hours, **or a suspected personal-data breach** | Hub unreachable, all counters stopped; face data exposed | Basic [4 h] · Std [1 h] · Prem [30 min] | [8 h] / [4 h] / [2 h] | [3 d] / [2 d] / [1 d] |
| **S2 High** | A module unusable, with no workaround | Store counting at 0 on one camera; enrolment fails | [8 h] / [4 h] / [2 h] | [2 d] / [1 d] / [8 h] | Next release / [5 d] / [3 d] |
| **S3 Medium** | Degraded, but a workaround exists | Dashboard chart wrong; Chinese text missing on a page | [2 d] / [1 d] / [8 h] | n/a | Next release |
| **S4 Low** | Question, cosmetic issue, feature request | | [5 d] / [3 d] / [2 d] | n/a | Roadmap |

The clock runs only during support hours, except for S1 breaches on Premium, where it runs 24/7. The provider may
lower the severity of a ticket, with a stated reason, once a workaround is in place.

## 4. Availability

| Component | Target | Measured as |
|---|---|---|
| On-device pages (static hosting) | Not measured by the provider: they run offline once cached (`sw.js`) | n/a |
| Provider-hosted `server.py` (if the provider hosts it) | [99.5 %] monthly | HTTP 200 on `/api/agg/status` every 5 min from an external probe |
| Customer-hosted hub | Customer responsibility; the provider supports configuration | n/a |

Service credits for provider-hosted components, per month: < 99.5 % → [5 %], < 99 % → [10 %], < 97 % → [25 %] of the
monthly fee. Excluded: scheduled maintenance announced ≥ 48 h ahead (≤ 4 h/month), customer network failures, and
force majeure.

## 5. Data protection obligations (PDPA s.40 processor terms, summary)

- The provider processes personal data only on documented instructions. By default it receives none: no telemetry,
  and the on-device design keeps data on the device. Remote sessions happen only with the customer present.
- **Breach notification to the customer without undue delay and within [24 h]** of the provider becoming aware, so the
  customer can notify the PDPC within 72 h (s.37(4)). The notice includes the facts, the categories affected, the
  measures taken and a contact person.
- Support staff never ask the customer to export face data. Diagnostic bundles contain no `lqv-*`, `cx-*` or `att-*`
  keys. Screenshots are taken only with the customer's consent.
- On termination: the provider deletes any customer data it holds within [30 days] and confirms in writing.

## 6. Customer responsibilities

- Name a contact person per site. Keep devices on supported browsers (current Chrome/Edge/Safari minus one major
  version). Keep the DPIA, signage and retention routine (`docs/pdpa/`) up to date.
- Report incidents with: site, page URL, time, the steps taken, and the browser console output if possible. Never
  include personal data.

## 7. Release and change policy

- Versioning follows `CHANGELOG.md`. Each release passes CI: lint, typecheck, unit, Python and e2e tests, CSP, the
  no-third-party-request check, and the zh shared-component gate.
- Breaking changes (storage keys, the hub schema `lensiq-agg` v1, server environment variables) are announced
  [30 days] ahead, with a migration note.
- Model changes that alter accuracy are listed with before/after numbers in `ACCURACY.md`.

## 8. Escalation

| Level | Provider | Customer |
|---|---|---|
| 1 | Support desk [email / LINE] | Site contact |
| 2 | Support lead [name] | Ops manager |
| 3 | Account director [name] | Management sponsor |

Escalate to the next level when a target in section 3 is missed by more than 50 %.

## 9. Reporting and review

The provider sends a monthly report: tickets by severity, targets met, uptime, releases installed and open risks.
A quarterly review covers accuracy (pilot re-checks), the DPIA review date and the roadmap.

## 10. Response templates (Thai)

Keep the tone polite and concrete; always give a reference number `[LQ-#####]`; never ask for photos of people, face
data, ID cards or passwords. Replace [brackets]. English/Chinese versions: translate the same structure.

**10.1 รับเรื่องแล้ว (ตอบอัตโนมัติ / ตอบครั้งแรก)**
> เรียน คุณ[ชื่อ]
> ขอบคุณที่ติดต่อ LENSIQ เราได้รับเรื่องของคุณแล้ว หมายเลขอ้างอิง [LQ-#####] ทีมงานจะตอบกลับภายใน [ระยะเวลาตามระดับ] วันทำการ
> เพื่อให้ช่วยได้เร็วขึ้น โปรดแจ้ง: หน้าที่ใช้งาน เวลาที่พบปัญหา อุปกรณ์และเบราว์เซอร์ และขั้นตอนที่ทำ
> โปรดอย่าส่งภาพบุคคล ข้อมูลใบหน้า หรือข้อมูลส่วนบุคคลของผู้อื่นมาในอีเมล
> ด้วยความเคารพ ทีมสนับสนุน LENSIQ

**10.2 ขอข้อมูลเพิ่มเติม**
> เรียน คุณ[ชื่อ]
> ขอบคุณสำหรับข้อมูล เพื่อตรวจสอบเรื่อง [LQ-#####] ต่อ รบกวนแจ้ง [รายการที่ต้องการ เช่น รุ่นเบราว์เซอร์ / ภาพหน้าจอที่ไม่มีบุคคล / ข้อความในคอนโซล]
> หากไม่ได้รับข้อมูลภายใน 7 วัน เราจะปิดเรื่องไว้ก่อน และเปิดใหม่ได้ทุกเมื่อโดยตอบกลับอีเมลนี้

**10.3 แก้ไขแล้ว / วิธีแก้ชั่วคราว**
> เรียน คุณ[ชื่อ]
> เรื่อง [LQ-#####]: สาเหตุคือ [สาเหตุโดยย่อ] เราได้ [แก้ไขในเวอร์ชัน x.y / แนะนำวิธีแก้ชั่วคราว: ขั้นตอน 1–3]
> หากยังพบปัญหา ตอบกลับอีเมลนี้ได้ภายใน 14 วันโดยใช้หมายเลขอ้างอิงเดิม

**10.4 ขอยกเลิกหรือขอคืนเงิน**
> เรียน คุณ[ชื่อ]
> เราได้รับคำขอ[ยกเลิก/คืนเงิน]สำหรับใบเสร็จเลขที่ [เลขที่] แล้ว ตามนโยบายในข้อกำหนดข้อ 9 คุณมีสิทธิ์ได้รับเงินคืน [จำนวน] บาท
> เนื่องจากการชำระด้วยพร้อมเพย์คืนผ่านระบบชำระเงินไม่ได้ เราจะโอนคืนเข้าบัญชีของผู้ชำระ โปรดส่ง: ชื่อบัญชี ธนาคาร เลขที่บัญชี และสำเนาหน้าสมุดบัญชี (ปิดข้อมูลอื่นได้)
> เราจะโอนภายใน 14 วันนับจากได้รับข้อมูลครบ และส่ง[ใบลดหนี้]ให้ทางอีเมล
> แพ็กเกจรายเดือนไม่มีการต่ออายุอัตโนมัติ หากไม่ชำระรอบถัดไป แพ็กเกจจะกลับเป็นระดับสมาชิกเมื่อหมดรอบ

**10.5 คำขอใช้สิทธิตาม PDPA**
> เรียน คุณ[ชื่อ]
> เราได้รับคำขอ[เข้าถึง/ลบ/แก้ไข/คัดค้าน/ถอนความยินยอม]ข้อมูลส่วนบุคคลของคุณเมื่อวันที่ [วันที่] หมายเลขอ้างอิง [LQ-#####]
> เพื่อยืนยันตัวตน โปรดลงชื่อเข้าใช้บัญชีเดียวกับที่แจ้งไว้ แล้วตอบกลับอีเมลนี้ เราจะดำเนินการและแจ้งผลภายใน 30 วัน
> ข้อมูลที่ประมวลผลในเครื่องของคุณ (เช่น สถิติหรือค่าตั้งในเบราว์เซอร์) เราไม่ได้เก็บ คุณลบได้เองที่ การตั้งค่าเบราว์เซอร์ → ไซต์นี้ → ล้างข้อมูล
> หากคำขอเกี่ยวกับกล้องในร้านค้าหรือองค์กร โปรดติดต่อร้าน/องค์กรนั้นซึ่งเป็นผู้ควบคุมข้อมูลโดยตรง

**10.6 รายงานปัญหาคำทำนาย**
> เรียน คุณ[ชื่อ]
> ขอบคุณที่ช่วยแจ้งปัญหาคำทำนายในหน้า [หน้า] เราส่งเรื่องให้ทีมเนื้อหาตรวจแล้ว ข้อความลักษณะนี้จะถูกแก้ไขที่ต้นทางและตรวจซ้ำโดยผู้ตรวจภาษาในรอบถัดไป
> คำทำนายของ LENSIQ เป็นไปเพื่อความบันเทิงตามตำราและความเชื่อดั้งเดิม โปรดใช้วิจารณญาณของตัวเองเสมอ
> (หากเป็นเรื่องความปลอดภัย เช่น คำแนะนำด้านสุขภาพ ให้จัดเป็น S2 และแก้ภายใน 5 วันทำการ)

**10.7 แจ้งเหตุขัดข้อง / เหตุละเมิดข้อมูล (ร่าง ต้องให้ผู้ควบคุมข้อมูลและทนายความอนุมัติก่อนส่ง)**
> เรียน ลูกค้า LENSIQ
> เมื่อ [วันที่ เวลา] เราพบ [ลักษณะเหตุการณ์] ซึ่งกระทบ [บริการ/ข้อมูลประเภท] ของผู้ใช้ประมาณ [จำนวน] ราย
> เราได้ [มาตรการที่ทำแล้ว] และแจ้งสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลแล้วเมื่อ [วันที่] (ถ้ามี)
> สิ่งที่คุณควรทำ: [คำแนะนำ] ติดต่อผู้รับผิดชอบ: [ชื่อ อีเมล]
> เครื่องมือที่ประมวลผลในเครื่องไม่ได้รับผลกระทบ เพราะไม่ส่งภาพหรือข้อมูลใบหน้าออกจากอุปกรณ์

## 11. Status page and incident routine

**Status page (static, no extra service needed):** publish `status.json` + a short status note on a separate,
independent host (e.g. a GitHub Pages repo `lensiq-status` or a LINE OA rich menu), linked from `help.html#h-status`
(`[status page URL]` placeholder). It must not depend on the Cloudflare Worker it reports on. Content: component
(Website, Sign-in, Writing assistant, Payments, Statistics), state (operational / degraded / outage / maintenance),
started, last update, next update time, and a one-line customer impact. Probe: an external uptime monitor on
`GET <API>/api/fortune/status` (no dedicated health route exists yet; add `/api/health` in backend/ if preferred) and the site root every 5 min, alerting the on-call by LINE/e-mail.

| Step | S1 (outage, suspected breach) | S2 | Owner |
|---|---|---|---|
| Acknowledge, open incident log | 30 min (business hours), status page "investigating" | 4 h | On-call |
| Customer update cadence | every 2 h until resolved | daily | Support lead |
| Personal-data breach: assess risk, decide PDPC notification | within 24 h of awareness; notify PDPC ≤ 72 h (s.37(4)); data subjects without delay if high risk | — | Controller + counsel |
| Fallback | Owner can turn the writing assistant off (admin AI tab) → local composer; set `FREE_MODE` / disable checkout | — | Owner |
| Close | Status "resolved", postmortem within 5 business days (timeline, cause, impact, fixes, follow-ups), linked from the status page | brief note | Engineering |

Keep the incident log and postmortems for ≥ 3 years. Never publish personal data in status notes.
