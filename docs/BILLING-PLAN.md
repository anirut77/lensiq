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

| | **Free / ฟรี** | **Pro / โปร** | **Business / ธุรกิจ** | **Enterprise / องค์กร** |
|---|---|---|---|---|
| Price (VAT incl.) | 0 | **990 THB / month** · 9,900 / year (ร่าง) | **3,900 THB / month** · 39,000 / year (ร่าง) | quotation |
| On-device features | all | all | all | all + on-premise install |
| AI writing assistant | 3 / day / device | 100 / month | 600 / month | unlimited (fair use) / own API key |
| Cloud analytics history | 7 days | 90 days | 400 days | custom retention |
| CSV export | – | ✓ | ✓ | ✓ + API |
| Multi-site hub nodes | 1 | 3 | 20 | unlimited |
| Tax invoice (ใบกำกับภาษีเต็มรูป) | – | on request | ✓ | ✓ |
| Support | community | e-mail 2 business days | e-mail + LINE, next business day | SLA, DPA, PDPA pack |

Model cost at 100 % quota use: Pro ≈ 350 THB (≈ 35 % of price), Business ≈ 2,100 THB (≈ 54 %). Typical use is far
below the cap, so gross margin after Opn fees should be 60–80 %. Add-on: **AI top-up 100 readings = 490 THB (ร่าง)**.

Enforced by `entitlements` rows (`backend/migrations/0003_seed_plans.sql`) through `checkEntitlement()` — only when
`FREE_MODE=false`. Until then usage is counted (`usage_counters`, 35 days) so real demand can size the quotas.

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

## 5. Tax (Thailand) **[ตรวจทานกฎหมาย]**

* **VAT 7 %** only if the seller is VAT-registered (mandatory above 1.8 M THB turnover/year, voluntary below).
  `VAT_REGISTERED=false` → receipts only, no VAT line. When `true`, prices are VAT-inclusive and the Worker stores
  subtotal/VAT/total per payment (`splitVat`, rounding to the satang).
* **Tax invoice (ใบกำกับภาษีเต็มรูป, Revenue Code s.86/4)** fields stored per payment: seller name, tax ID, address,
  branch (`SELLER_*` vars); buyer name, tax ID (13 digits), address, branch; document number (`LQ-YYYYMM-000001`,
  gap-free counter), date, description, subtotal, VAT, total. A PDF/e-Tax Invoice renderer is **not built yet** — issue
  documents from the accounting system using these fields, or add e-Tax Invoice by Email later.
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
4. Admin → Billing → enable the pricing page; set plan `status='active'` for sold plans
   (`npx wrangler d1 execute lensiq --remote --command "UPDATE plans SET status='active' WHERE id IN ('pro','business')"`).
5. `FREE_MODE=false`, `BILLING_ENABLED=true`, deploy; announce ≥ 30 days ahead to existing users (grandfather period).
6. Monitor: payments tab, webhook results, refund requests, AI cost vs. quota usage weekly for the first 3 months.
