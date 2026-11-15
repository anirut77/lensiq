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
