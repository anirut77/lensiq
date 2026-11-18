# Pending and changed owner decisions / การตัดสินใจที่รอหรือเปลี่ยนแปลง

Running list, append only. Each entry: date, what changes, status, what happens if the owner does not answer.

## 2026-11-15: paid depth for fortune readings changes decision 15 of 2026-11-13

- **Earlier decision (15, 2026-11-13):** "Fortune stays full and free for signed-out users" (ดูดวงเต็มและฟรีสำหรับผู้ที่ไม่เข้าสู่ระบบ).
- **Owner order 2026-11-15:** free = an overview of every group; paid = the in-depth text. Prices from the approved list: 49 THB one
  group, 99 THB full reading, 199 THB full reading + month by month for the year, Plus 149 THB / month for all. Rules: (a) the free
  part never states a warning whose remedy is behind payment; (b) while the crisis flag is set no payment entry, price or locked
  teaser, the belief guidance stays free; (c) the price and the list of headings are shown before every tap; (d) hard limits apply
  to paid text exactly as to free text.
- **Status: design only, OFF.** `window.LENSIQ_FORTUNE_PAID = false` in `lensiq-config.js`; users see no change and decision 15 still
  holds in what is shipped. Branch `fortune-paid` (not merged). Design: `docs/FORTUNE-PAID-DESIGN.md`. Legal: L65
  (`docs/LEGAL-PACKET.md` §6.11).
- **Turning it on:** the owner's decision once billing (bank transfer) and the lawyer's answers to L65 are ready. When it is turned
  on, decision 15 is replaced, and the pages that say fortune is free (pricing, terms, one-pagers, `cat-fortune.html`) are updated
  in the same change.
- **If the owner does not answer:** it stays off; nothing changes for users.

### Open sub-questions (2026-11-15)

1. **Overlap with the existing report credits on `report.html`** (`report_basic` 49, `report_compat` 99, `report_annual` 199,
   `docs/BILLING-PLAN.md` §3.0). Options: ก keep both as separate products (report = printable cross-system report; paid depth = per
   page); ข one set of credits unlocks both. Recommendation: ก (no change to the built report flow). If no answer: ก.
2. **199 "month by month"**: no page composes 12 monthly parts yet (only `report.html` annual has a 12-month outlook). Options: ก
   offer 199 only where a monthly engine exists, and build monthly parts later for lifegraph / bazi / zodiac as a scoped item; ข
   drop 199 from the fortune pages. Recommendation: ก. If no answer: 199 is not shown anywhere (today's behaviour).
3. **Plus 149 contents**: `docs/BILLING-PLAN.md` drafts Plus as full readings + 30 AI readings / month; the 2026-11-15 order says
   "for all". Recommendation: Plus = all paid depth on every page + the drafted AI quota. If no answer: the design note's wording
   ("in-depth text for every group on every fortune page").
4. **Practical tips from the advice field** (for example "ลองตั้งงบ…"): changed on 2026-11-15 by the coordinator's provenance rule
   after the round-2 review: every sentence taken from an advice, remedy, direction, placement or colour field is free, so these
   tips are free too. Paid depth now holds only explanation. If the owner wants tips back in paid depth, that needs a new rule and
   a re-lock; recommendation: keep them free (simpler to explain, and nothing that tells the reader what to do is sold).

## 2026-11-15: decision 46 decided (owner): option ก, "Remedies, merit and paid fortune content"

- **Decided by the owner, 2026-11-15.** The 2026-11-10 "Remedies and merit" rule is cancelled. General belief advice stays free;
  paid in-depth readings, monthly / yearly timing and the goal-based plan are allowed; a "recommended sources" section with links
  to outside sellers is allowed (we sell nothing ourselves). Hard limits kept: no promised result and no "bad outcome unless you
  pay"; nothing paid, no plan and no seller link in the crisis state; everything behind off switches until billing works and the
  owner approves go-live.
- **Built on `fortune-paid` (off):** `LENSIQ_FORTUNE_PLAN` (plan) and `LENSIQ_FORTUNE_SOURCES` (seller links), both under
  `LENSIQ_FORTUNE_PAID`, all default false. Design: `docs/FORTUNE-PAID-DESIGN.md` §10.

### Open questions from the owner order of 2026-11-15 (2)

5. **Plan price.** Not given in the order. Built with a proposal of 99 THB (`PRICES.plan`). Options: ก 99 THB per plan; ข include the
   plan in 199 and Plus only. Recommendation: ก (simple, sits on the approved ladder). If no answer: 99 THB, still switched off.
6. **Guest payment by PromptPay QR vs the 2026-11-13 decision "bank transfer only".** The order asks for PromptPay without sign-up;
   the earlier decision put PromptPay on hold. Options: ก allow PromptPay QR for fortune purchases only (owner confirms each payment
   in the back office; no automatic bank notice yet); ข keep bank transfer only. Recommendation: ก for small fortune tickets. If no
   answer: design only, nothing wired (today's state).
7. **LINE OA free group.** Needs a LINE OA, a one-time code flow and a privacy text (LINE user ID kept on the LINE side only).
   Options: ก build it after the LINE OA exists; ข drop it. Recommendation: ก. If no answer: not built.
8. **Recommended-source entries.** Who adds and approves seller links, and is any of them an affiliate link (then the label must
   say so)? Recommendation: owner / admin approval per entry in the back office, label affiliate links. If no answer: no entries ship.
9. **Monthly / yearly content (199).** No page composes 12 monthly parts yet; building it is a new scoped item. Recommendation:
   start with lifegraph and bazi. If no answer: 199 is listed in the ladder but its offer is shown nowhere.

## 2026-11-15: round-3 review fixes (fortune-paid)

- Negative-state topic meanings tagged by reading (`fortune-negstate.js`, design §11): never paid. Practical tips with no negative
  state stay paid depth until the owner decides item 45 (350 / 2,700 readings in the reviewer's count).
- The 199 row is hidden in the ladder until a page can deliver month-by-month content (open question 9 above).

## 2026-11-16: owner night order item 3 (fortune paid content)

- Leak counts on a fresh locked set (`fortune-paid-fresh-2026-11-16b`, 2,700 synthetic readings): negative-state A 85 -> 0
  readings, caution / guidance B 12 -> 0. All three switches stay off; nothing calls a payment API.
- Payment options written in `docs/FORTUNE-PAID-PAYMENTS.md` (guest PromptPay: static QR + manual confirmation, dynamic QR via
  Stripe / Opn and others, slip verification). Recommendation: start with the static QR for a small trial; Stripe or Opn at
  volume. Needs the owner's choice, an exception to "bank transfer only" for option B, and L65 / the accountant first.

## 2026-11-16: full formatted PDF report in the 99, 199 and Plus products (owner order, item 3)

- **Owner order:** "Paid tie-in, behind the existing off switches: the free print and share cover the free overview. A full report as
  a formatted PDF is part of the 99 and 199 THB products and Plus. Add it to the free/paid table."
- **Recorded as:** free share card and print = overview only; the full formatted PDF is included in 99, 199 and Plus and is not in
  the 49 THB product. Table in `docs/FORTUNE-PAID-DESIGN.md` section 12.0. Behind `LENSIQ_FORTUNE_PAID` (off); the crisis or calm
  state hides the PDF button, prices and invitations. Docs only; the PDF is not built.
- **Decision taken on the owner's behalf (reversible):** 49 THB does not include the PDF (the order lists 99, 199 and Plus only).
- **If the owner does not answer:** nothing changes for users; it stays off.

## 2026-11-17: open item (owner, recorded during the line-wrap work)

- **Owner's words:** "Later topic, not started: protecting paid content from being shared, resold, or used to run a paid reading
  service for others. Owner will discuss after current work is finished."
- **Status:** open, not started. Nothing is built or changed for it; the owner raises it after the current work.

## 2026-11-18: resale readiness (owner order, item 4): design only, do not build

- **Owner order:** write a short design note on what another organisation would need to run this whole system under its own
  brand: admin settings, a separate deployment per buyer, what stays ours (models, licences, test sets) and the licence and
  legal questions for the lawyer.
- **Written:** `docs/RESALE-READINESS.md` (design, 12 lawyer questions) and `docs/OWNER-VALUES-INVENTORY.md` (every
  owner-specific value in code and content, where it lives, and whether it should move to the admin panel).
- **Status: DESIGN ONLY, DO NOT BUILD.** No product code changed; users see nothing different. The seller-details admin page
  is a separate branch (`seller-settings`).
- **Decision needed later (not now):** whether to pursue resale at all; if so, the price and support terms, and sending the 12
  questions to counsel. Recommendation: first finish `seller-settings`, then ask counsel Q1, Q2 and Q10 (licence of the
  research-limited models, MIT versus a commercial package, crisis-line duties), because their answers decide whether
  resale is possible. **If the owner does not answer:** nothing is built and nothing changes.
