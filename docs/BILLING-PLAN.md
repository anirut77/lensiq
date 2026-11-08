# LENSIQ — monetisation plan (ร่าง / DRAFT)

> **Draft for the owner's decision. Not an offer, not legal or tax advice.** All prices are placeholders marked "ร่าง".
> Today the service is **free** (`FREE_MODE=true`); the billing code in `backend/` is ready but off. Items marked
> **[ตรวจทานกฎหมาย]** need a Thai lawyer / accountant before go-live.

## 1. Principles

1. **On-device stays free.** Everything that runs in the browser (camera analytics, booth, photobooth, studio, fortune
   pages with the local composer) costs us nothing per use — it stays free for everyone, forever. That is the product's
   privacy promise and its acquisition funnel.
2. **Charge only where we carry a variable cost or deliver business value:** the Claude writing assistant (per-reading
   model cost), cloud analytics history/exports, multi-site hub, support/SLA, on-premise installs.
3. **No surprise charges.** PromptPay is a push payment — the customer approves every payment in their bank app; there
   is no stored card and no silent auto-renewal. Renewal = a reminder + a new QR.
4. **Thai-SME friendly:** THB, VAT-inclusive prices, PromptPay first, tax invoice on request, monthly *and* yearly
   (2 months free), event-day passes for booths.

## 2. Unit economics (why the quotas look like this)

| Item | Estimate | Basis |
|---|---|---|
| Claude Opus 5.5 price | $4 / MTok input, $20 / MTok output, cache reads $0.20 / MTok | Anthropic list price (Nov 2026) |
| One AI reading | ~2–4 k input tokens (system prompt cached) + ~3–5 k output tokens (Thai prose + adaptive thinking at effort `medium`) | `backend/src/fortune.js` request; 600–900 Thai words |
| **Model cost per reading** | **≈ $0.07–0.10 ≈ 2.5–3.5 THB** (at ~35 THB/USD) | measure with `usage` before go-live |
| Cloudflare Workers + D1 | free tier → Workers Paid USD 5/month covers ~10 M requests | negligible per user |
| Opn PromptPay fee | **1.65 % + 7 % VAT on the fee** (≈ 1.77 % effective); cards 3.65 % + VAT | Opn Thailand pricing page |
| Opn PromptPay limits | THB 20 – 150,000 per charge; **no refunds/voids through Opn** | Opn docs |

Levers if AI cost runs high: lower `effort` (admin AI tab), shorter target length, or — the owner's call — a cheaper
model for some tiers (e.g. Claude Sonnet 5.5 at $2/$10 ≈ half the cost). The admin can change the model without a deploy.

Free-mode exposure today: global cap `daily_max` = 500 readings/day ⇒ worst case ≈ 1,750 THB/day of model cost. Lower it
in the admin AI tab if needed; every failure falls back to the free local composer.

## 3. Tiers (placeholders — "ร่าง")

### 3.0 Thai consumer pricing (owner decision, Round 10 — supersedes the "Pro" consumer price below)

The fortune brand sells to individuals, so it gets small-ticket consumer prices. The former 990 / 3,900 THB monthly
tiers stay, renamed **Creator** and **Business** (section 3.1) for studios, shops and event users of the other
three products (Retail cameras, HR Interview Kit, Creative Suite). All four products share one engine, one Google
sign-in and one back office, so one account can hold a consumer plan and a business plan.

**One-off reports (pay once, no subscription; VAT incl.)**

| Report (plan id, `0006_consumer_pricing.sql`) | Price | Contents (ร่าง) | AI credits granted | Model cost (≈ 3 THB / AI reading) |
|---|---|---|---|---|
| **Basic reading report / รายงานดวงพื้นฐาน** (`report_basic`) | **49 THB** | one full multi-section reading (BaZi + Taksa + Lek 7 Tua 9 Than, composed on the device), saved to the account, print/PDF; the AI credit is usable on any fortune page | 1 | ≈ 3 THB |
| **Compatibility report / รายงานดวงคู่** (`report_compat`) | **99 THB** | two people's charts compared (12-animal pair + BaZi Day-Master element relation), long form + 3-point plan | 2 | ≈ 6 THB |
| **Annual forecast report / รายงานดวงรายปี** (`report_annual`) | **199 THB** | yearly report: the year by the 12 animals, the BaZi luck period and a 12-month outlook (month pillar vs Day Master), print/PDF; TH, EN or 中文 | 3 | ≈ 9–10 THB |

**Membership (fortune consumers)**

| | **Guest** | **Member (free)** | **Plus / พลัส** (plan id `plus`) |
|---|---|---|---|
| Price (VAT incl.) | 0 | 0 | **149 THB / month** or **990 THB / year** (≈ 82.5 THB / month, −45 %) |
| Fortune readings | light (see 3.1) | full on-device readings, history, saved readings | full on-device readings in every domain + **30 AI readings / month** (entitlement `ai_reading` 30, ร่าง) |
| One-off reports | buy at list price | buy at list price | buy at list price (a member discount is an owner option, ร่าง) |
| Languages | TH / EN / 中文 | TH / EN / 中文 | TH / EN / 中文 (English readings included) |
| Saved readings | – | 50 (`member_saved_max`) | 50 (owner setting) |

**Why these numbers (research rationale, ร่าง)**

* **Charm prices at Thai small-ticket anchors.** 49 / 99 / 149 / 199 sit just under round 50 / 100 / 150 / 200 THB,
  the price points Thai consumers already see for app stickers, in-app items, streaming "mobile" plans and paid
  horoscope or tarot readings on LINE and social media. Left-digit pricing reliably lifts conversion on impulse
  purchases (Thomas & Morwitz 2005; Anderson & Simester 2003).
* **PromptPay-friendly tickets.** A 49–199 THB QR payment is a sub-minute decision with no card needed; Opn's PromptPay
  minimum is 20 THB (section 2), so even the smallest report clears it. Fee per charge is a few baht, keeping margin
  above 80 % after model cost.
* **199 as the anchor / decoy.** Showing the 199 annual report next to 99 makes 99 the "sensible" choice (compromise
  effect; Simonson 1989) and makes 149/month look cheap against one 199 report; the yearly 990 is shown as "less than
  one 199 report every 2 months".
* **Annual ≈ 45 % off.** 990 vs 12 × 149 = 1,788 THB. A deep annual discount suits a once-a-year ritual (New Year,
  birthday, Songkran) and front-loads cash; churn on 149/month is expected to be high for entertainment products.
* **Market range.** Thai horoscope / tarot apps and LINE OA fortune services commonly price single paid readings from
  a few tens to a few hundred baht and subscriptions in the low hundreds per month; we sit at the low-middle of that
  range and compete on privacy (on-device) and three languages. *Verify current competitor prices before launch —
  no specific competitor figures are claimed here.*
* **Cost cover (assumption — NOT measured yet).** At ≈ 3 THB per AI reading (estimate from list token prices, to be
  replaced by the measured `usage_counters` tokens × price on the deployed Worker before the Plus quota is fixed), 30 AI readings/month cost ≈ 90–105 THB at 100 % use against ≈ 139 THB net
  of VAT — thin at the cap, so watch real use in `usage_counters`; typical use is far lower. Reports keep > 85 % margin.

**Delivery (round 11):** reports are redeemed on `report.html` (`report.js`): the page builds the report on the device, takes one credit with `POST /api/me/entitlements/use {feature: "report_*"}` BEFORE showing it, saves it with `POST /api/me/saved` (domain `bazi` / `zodiac` / `lifegraph`, trimmed to the 16 KB limit, print/PDF always full) and offers a retry that never takes a second credit. Without the API the page shows a full sample labelled "demo, not charged, not stored"; with `FREE_MODE` on no credit is taken. Refunds: terms §9 (full refund within 14 days if unopened). Renewal of Plus / Creator / Business: no automatic renewal; `account.html` shows a reminder banner and the account menu a reminder from 7 days before `current_period_end` (no e-mail sender yet — terms §8 says so). Checkout requires the age-of-majority box (`age_confirm`, 20 or older or guardian consent).

Plan ids: consumer `plus`, `report_basic`, `report_compat`, `report_annual` (`backend/migrations/0006_consumer_pricing.sql`,
one-time purchases become `credits`); business `pro` (shown as Creator) and `business` keep their ids and prices from
`0003_seed_plans.sql`. Every price stays editable by the owner in the admin.

### 3.1 Business tiers (Creator / Business — formerly Pro / Business)

| | **Guest / ผู้เยี่ยมชม** | **Member / สมาชิกฟรี** | **Creator / ครีเอเตอร์** (formerly Pro / โปร; plan id `pro`) | **Business / ธุรกิจ** | **Enterprise / องค์กร** |
|---|---|---|---|---|---|
| Sign-in | none | Google (free) | Google + plan | Google + plan | contract |
| Price (VAT incl.) | 0 | 0 | **990 THB / month** · 9,900 / year (ร่าง) | **3,900 THB / month** · 39,000 / year (ร่าง) | quotation |
| For | everyone | everyone | creators, studios, single shops, small events (Creative Suite, Retail starter) | multi-branch retail, agencies, HR teams | chains, mall operators |
| On-device features | all | all | all | all | all + on-premise install |
| Fortune readings | light: summary + 2 sections + cautions + reminder, 3 / day / device (soft) | full + 3-point plan, save history, print/PDF | full | full | full |
| AI writing assistant | – (when membership is on) | 3 / day (server-enforced) | 100 / month | 600 / month | unlimited (fair use) / own API key |
| Transaction history | – | ✓ (`account.html`) | ✓ | ✓ | ✓ |
| Cloud analytics history | – | 7 days | 90 days | 400 days | custom retention |
| CSV export | ✓ on-device (free) | ✓ on-device (free) | ✓ on-device — included free in every tier, **not a paid differentiator** (pricing page says so) | same | ✓ + API (quotation) |
| Multi-site hub nodes | 1 | 1 | 3 | 20 | unlimited |
| Tax invoice (ใบกำกับภาษีเต็มรูป) | – | – | on request | ✓ | ✓ |
| Support | community | community | e-mail 2 business days | e-mail + LINE, next business day | SLA, DPA, PDPA pack |

**Positioning (round 12).** Until cloud analytics history and hub nodes ship (`coming_soon`), Creator / Business are
sold on what is delivered today: the AI writing-assistant quota, response-time support (e-mail; Business + LINE),
the Business onboarding call and full tax invoice, and — for retail / HR buyers — a quotation + 2-week pilot whose fee
is credited against the first paid period (`docs/PILOT-PLAN.md`). CSV export stays free on-device for everyone.

Model cost at 100 % quota use (estimate, same unmeasured 3 THB assumption): Creator (Pro) ≈ 350 THB (≈ 35 % of price), Business ≈ 2,100 THB (≈ 54 %). Typical use is far
below the cap, so gross margin after Opn fees should be 60–80 %. Add-on: **AI top-up 100 readings = 490 THB (ร่าง)**.

Guest/Member limits are owner settings (admin → Members, D1 `settings.membership`) and apply only when
`membership_required` is on and Google sign-in is configured (docs/BACKEND.md "Member sign-in"); with it off every visitor
keeps today's full readings. Paid tiers are
enforced by `entitlements` rows (`backend/migrations/0003_seed_plans.sql`, `0006_consumer_pricing.sql`) through
`checkEntitlement()` — only when `FREE_MODE=false`. Until then usage is counted (`usage_counters`, 35 days) so real
demand can size the quotas. Round 10: quota days / months are Bangkok time; a refused or provider-failed AI call is not
counted; one-time report purchases become credits used after the period quota; paying members have their own AI
buckets (admin AI settings `paid_per_user_daily`, `paid_daily_max`). Perk status (`active` / `coming_soon`) is served
with the plans so the pricing page can label honestly: `analytics_days` and `hub_nodes` are **coming soon** (not
enforced or delivered); `csv_export` is checked by the server (`POST /api/me/entitlements/use`).

## 4. B2B packages (ร่าง)

| Package | For | Contents | Indicative price |
|---|---|---|---|
| **Event Day Pass** | booth activations, fairs | 1 day, up to 500 AI readings, booth + photobooth analytics report, branded templates | 3,900 THB / day |
| **Event Week** | trade shows (BITEC, QSNCC) | 7 days, 3,000 readings, multi-booth hub, daily CSV, on-site setup checklist | 14,900 THB |
| **Retail Starter** | 1–3 shops | Business tier + hub + store analytics onboarding call | Business price + 4,900 setup |
| **Training / attendance** | academies, HR | attendance module set-up, DPIA template filled with the client | 9,900 setup + Pro |
| **Enterprise on-prem** | chains, mall operators | server.py LAN install, own Anthropic key, SLA, DPA (PDPA s.40), security review | quotation |

Pricing rationale for Thai SMEs: comparable Thai SaaS (POS, booking, LINE OA add-ons) sits at roughly 300–1,500 THB per
month; an event activation agency budgets per booth-day, so a day pass priced below a promoter's day rate is an easy
"yes". Yearly = 10 × monthly. Prices end in 0/900 to keep VAT-inclusive totals readable.

### 4.1 Round 13 proposals: new product lines (not on the plan registry yet)

Plans live in the D1 `plans` table (backend/migrations) and the pricing page's built-in `DRAFT` copy mirrors those
migrations, so adding a plan needs a new migration. These lines are therefore **proposals only**: nothing below is
sold, listed on pricing.html or enforced. The figures are the draft text already shown on each product page (each
page labels them "ร่าง / draft"). Owner decision needed before any of them becomes a migration.

| Proposed plan id | Product | Contents | Indicative price (draft, from the page) |
|---|---|---|---|
| `exam_lab` | LENSIQ Exam: computer room / online exam (exam-lab.html) | candidate page, signals log, invigilator dashboard | 15–30 THB per candidate per exam, or 990–1,490 THB / month |
| `exam_hall` | LENSIQ Exam: camera exam hall (exam-hall.html) | up to 3 hall camera nodes per room + dashboard | 300–600 THB per room per exam day, or 1,990 THB / month per room |
| `exam_institution` | LENSIQ Exam: institution licence | whole-institution licence + invigilator training | 30,000–120,000 THB / year |
| `gate_trial` | LENSIQ Gate trial | 1 lane, 100 reads / day, 7-day logs | 0 THB |
| `gate_village_basic` | LENSIQ Gate village Basic (village.html) | resident cars, visitor passes, alerts, Open button | ~990 THB / month / lane |
| `gate_village_pro` | LENSIQ Gate village Pro | 3 lanes, per-house reports, on-site accuracy check | ~1,990 THB / month |
| `gate_parking` | LENSIQ Gate car park (parking.html) | fees, shop stamps, PromptPay QR, receipts, shift close | ~1,490 THB / month / lane |
| `gate_setup` | Gate installation (one-time) | camera angle / light tuning + joint accuracy check | 3,000–5,000 THB per visit |
| `attendance_employee` | Employee time attendance (attendance.html employee mode) | shifts, OT, holidays, payroll CSV, PIN/QR | fold into "Training / attendance" above (owner to decide) |

Possible perks (would go into `PERKS` in backend/src/constants.js as `coming_soon`, consumer null, once a plan uses
them): `exam_rooms` (rooms), `gate_lanes` (lanes), `zone_cameras` (camera pages for queue / tables / afterhours / bays).
They are not added yet because no plan references them and an unused perk would only show as "coming soon".

## 5. Tax (Thailand) **[ตรวจทานกฎหมาย]**

* **VAT 7 %** only if the seller is VAT-registered (mandatory above 1.8 M THB turnover/year, voluntary below).
  `VAT_REGISTERED=false` → receipts only, no VAT line. When `true`, prices are VAT-inclusive and the Worker stores
  subtotal/VAT/total per payment (`splitVat`, rounding to the satang).
* **Tax invoice (ใบกำกับภาษีเต็มรูป, Revenue Code s.86/4)** fields stored per payment: seller name, tax ID, address,
  branch (`SELLER_*` vars); buyer name, tax ID (13 digits), address, branch; document number (`LQ-YYYYMM-000001`,
  gap-free counter), date, description, subtotal, VAT, total. **Printable receipt / tax invoice (round 10):** the Worker
  renders an HTML document from these stored fields (Thai with EN / ZH labels) for the member (`GET
  /api/me/payments/:id/receipt`) and the owner (`GET /admin/api/billing/payments/:id/receipt`); print to PDF from the
  browser. VAT lines appear only when the payment carried VAT; the document says **ฉบับร่าง / DRAFT** until
  `SELLER_NAME`, `SELLER_TAX_ID` and `SELLER_ADDRESS` are set. e-Tax Invoice by Email is still **not built** — an
  accountant should confirm the layout before the first real tax invoice is issued.
* **Withholding tax:** Thai juristic customers paying for services usually withhold 3 % and send a 50 ทวิ certificate.
  PromptPay QR is for the full amount → B2B packages should be invoiced (bank transfer of 97 % + certificate) rather than
  self-serve QR. Self-serve PromptPay targets individuals/sole proprietors.
* Keep accounting/tax documents ≥ 5 years — payments are never auto-purged.
* Foreign e-service VAT rules do not apply (seller is Thai). Opn fees carry 7 % VAT (input VAT if registered).

## 6. Refunds & cancellation (draft policy)

* Monthly plans: cancel any time; no renewal is charged (push payment). No pro-rata refund for a started month, except
  when the service was unavailable > 24 h in that month (refund pro-rata on request).
* Yearly plans: full refund within 14 days of payment if fewer than 20 AI readings were used; afterwards pro-rata minus
  one month.
* Event passes: full refund up to 7 days before the event date; 50 % up to 48 h; none afterwards (the slot is reserved).
* **Mechanics:** PromptPay charges cannot be refunded through Opn → refunds are bank transfers to the payer's account
  (ask for a bank book copy), within 14 days, recorded against the payment (credit note if a tax invoice was issued).
  Round 10: the owner records it in admin (`POST /admin/api/billing/payments/:id/refund`, password + TOTP re-auth,
  bank-transfer reference required): payment → `refunded`, subscription cancelled and unused report credits removed
  (both optional), a `refund` row in the member's history, the receipt is stamped "คืนเงินแล้ว". Cancel / extend a
  subscription and complimentary plans or credits are admin actions with the same re-auth. Round 11: a credit note (ใบลดหนี้, Revenue Code s.86/10) is generated for every refund of a VAT tax invoice
  (`backend/src/receipt.js` `creditNoteData`; member `GET /api/me/payments/:id/refunds/:n/credit-note`, admin
  `GET /admin/api/billing/payments/:id/refunds/:n/credit-note`; covered by the integration test). Without VAT
  registration there is no tax invoice and therefore no credit note — the receipt is stamped "คืนเงินแล้ว".
* **Amount mismatch:** if Opn reports a different amount / currency than the order, the payment is set to
  `mismatch` (final; nothing activated), the owner gets an admin alert, and resolves it by hand (refund or manual grant).
* Duplicate/erroneous payments are always refunded in full.

## 7. Consumer protection & PDPA **[ตรวจทานกฎหมาย]**

* Consumer Protection Act B.E. 2522 (advertising/labelling: price, inclusions and quotas stated clearly; "ร่าง" pages
  must not be presented as offers), Unfair Contract Terms Act B.E. 2540 (terms reasonable, refund limits clear), Direct
  Sales and Direct Marketing Act B.E. 2545 (online selling to consumers may count as direct marketing — check
  registration with the OCPB and any cooling-off obligation), Electronic Transactions Act B.E. 2544 (e-receipts).
* Show before payment: plan, period, total incl. VAT, quotas, refund policy, seller identity and contact — `pricing.html`
  requires ticking "accept terms" and the Worker refuses checkout without `accept_terms: true`.
* **PDPA:** billing data (name, e-mail, tax ID, address, payment status) — basis s.24(3) contract and s.24(6) legal
  obligation (tax records). Processors: Cloudflare (Worker/D1 hosting) and Opn Payments (payment processing; Opn is the
  controller for its own KYC/AML). Card/bank data never touches LENSIQ. Cross-border: Cloudflare stores D1 data outside
  Thailand (choose a location hint near APAC); see `docs/pdpa/ROPA.md` M16–M18 and `docs/pdpa/DPIA.md` §11.
* Analytics stays opt-in and is never used for marketing profiles; billing customers are not linked to analytics.

## 8. Go-live checklist

1. Decide prices/quotas (this doc), VAT registration, refund policy, terms of service; legal review of §5–§7.
2. Opn: complete KYC, enable PromptPay, test in test mode end-to-end (admin → Billing → test QR → mark successful in the
   Opn dashboard → status updates, webhook row appears, receipt number assigned).
3. Set `SELLER_*`, `VAT_REGISTERED`; set live keys with `wrangler secret put`, then `OPN_ALLOW_LIVE=true`.
4. Admin → Billing → enable the pricing page; set plan `status='active'` for sold plans — via the admin API
   (`PUT /admin/api/billing/plans/:id {"status":"active"}`, audited) or
   `npx wrangler d1 execute lensiq --remote --command "UPDATE plans SET status='active' WHERE id IN ('pro','business')"`.
   The consumer plans of migration 0006 (`plus`, `report_*`) are seeded `active`; draft / retired plans cannot be
   bought. With `BILLING_ENABLED=true` checkout requires Google sign-in (`ALLOW_GUEST_CHECKOUT` stays `false`).
   Perks with status `coming_soon` (cloud analytics history, hub nodes) must be labelled "เร็ว ๆ นี้" on the pricing
   page — they are listed but not delivered yet.
5. `FREE_MODE=false`, `BILLING_ENABLED=true`, deploy; announce ≥ 30 days ahead to existing users (grandfather period).
6. Monitor: payments tab, webhook results, refund requests, AI cost vs. quota usage weekly for the first 3 months.
