# LENSIQ: working rules

Static multi-page site (vanilla JS, TH default + `i18n/en-*.js`, `i18n/zh-*.js`), all vision on-device. Live:
https://anirut77.github.io/lensiq/. Owner-facing replies are in Thai.

## Working rules (owner: Tum)

- Owner messages for this project start with `[LENSIQ]`. If a message starts with another project's tag, or clearly
  refers to another project (for example Anumat), do nothing and tell the owner it was sent to the wrong window.
- Never loosen or skip a test to make CI pass. Fix the product. No CI-only allowances.
- CI must be green before stacking new work. Push risky fixes as their own commit.
- Gates run on GitHub Actions (owner decision 2026-11-13): push each change to its own branch and run the full gate
  there (`gh workflow run ci.yml --ref <branch>`: every suite, no skips, same retry rule). Merge to main only when that
  run is green; deploy only from green main. Before every commit, run the affected suites locally and read the result;
  the full gate must be green on the branch in CI before merging to main. No local full gates while agents are working
  (at most one, with other CPU-heavy agents paused).
- Ask the owner before changing approved scope or order. Don't start and report later.
- Every round: fixed test set before building, real numbers per condition, an independent reviewer agent that re-measures.
- On-device processing by default. A human confirms any decision affecting money, access or a person. No emotion or
  deception scoring.
- Check the licence of every model, dataset and media file for commercial use. Record credits.
- Every accuracy claim states its source: synthetic, public dataset or field.
- All user-facing text complete in Thai, English and Chinese.
- Decision requests (owner rule 2026-11-12): every message that asks the owner for a decision is self-contained: the
  question, the options, the numbers behind them, the recommendation and what happens if the owner does not answer.
  Never refer to an earlier message for the details (the owner forwards messages one at a time). Put all pending
  decisions together at the end of each report under "รอคุณตัดสิน", restated in full each time until answered.
- Report format: built / deferred + why / numbers vs targets / risks / next step. For items on the approved work list
  below, do not wait for approval after the report; continue with the next item.
- Keep docs/CTO-BRIEF.md and docs/FIELD-PILOT.md updated each round.

## Standing order: approved work list (owner decisions 2026-11-11, replaces "wait for approval after each step")

Work through this list in order without waiting for the owner between items. Done before this update: test
deployment follow-ups, admin key management, P7 option ข (built, kept off), relaxed capture (not built; capture
guidance instead).

First priority: **Sellable pack** for Exam (lab mode), Attendance (PIN/QR), Gate (assisted) and Crowd (events,
experimental). Goal: the owner can sell by quotation and bank transfer, without online payment.

1. `docs/LAUNCH-READINESS.md`: one table per product (what works, measured numbers with source, known limits, every
   must-fix-before-launch item with status, what blocks selling: code / owner / legal).
2. Fix the must-fix code items: recovery codes with a slow salted hash; retention cron confirmed on; hall mode and
   Crowd labels consistent everywhere; no page claims more than was measured.
3. Sales kit in Thai (English second): quotation, invoice and receipt templates (excl. 7 % VAT, approved prices),
   order form, a 10-minute demo script per product, a demo mode with sample data (no customer data), an onboarding
   guide per product (install, first day, common problems).
4. A short sales deck per product from the one-pagers, measured claims only.
5. Customer documents for lawyer review, each marked "draft for legal review": terms of service, privacy notice, DPA
   template, pilot agreement, consent forms.
6. `docs/LEGAL-PACKET.md` in Thai: every open legal item (L1 onward) by topic, with the question, current approach
   and affected document.
7. Finish `docs/OWNER-TEST-GUIDE.md` and the Exam lab pilot kit (equipment, consent form, step-by-step day, result
   sheet).
8. Custom domain steps: (a) existing domain, (b) new brand domain. Change nothing in DNS.
9. Contact / request-a-quote: design how leads reach the owner with minimal personal data; ask before turning any
   form on.

Then the queue: CI sharding (approved: option ค, then ข after three clean trial runs, no added retries), adverts
on-device, hall-mode detector switch, P8 extra evals (tell the owner the cost first), P9, **Merit MVP (moved ahead of
Nutrition by the owner on 2026-11-12; right after the Sellable pack)**, Nutrition MVP, Try-On MVP, Style MVP, org
accounts P1–P3. Fortune fixes of 2026-11-12 (wheel-label overlaps, no source citations on fortune pages, honest
negative readings behind owner approval) run alongside.

Stop and ask the owner only when:
- money would be spent or a plan upgraded;
- a secret, password or key is needed;
- anything would be deleted or changed outside the `lensiq-*` resources;
- a measured result misses a safety or privacy target;
- a decision changes what users see about privacy, pricing or claims;
- scope or order would change;
- a licence is unclear.

Otherwise decide, record the decision and the reason in the round report, and continue.

Every quality rule still applies: fixed test sets before building, an independent reviewer that re-measures, no
loosened tests, CI green before stacking, run the tests and read the result before each commit, persistent eval logs.

Speed:
- Build queued items in parallel in separate worktrees while a gate or CI runs. Only pushes stay serial.
- Use a faster or lower-effort model for translation, docs and repetitive edits. Keep high effort for reviewers and
  for anything touching sign-in, keys, sync or privacy.
- Changes to the gate or CI that would shorten it: propose them with the expected saving first; change only after the
  owner agrees. (Approved 2026-11-11: CI shards ค with an "every test file ran exactly once" check; local ข after three
  trial runs with no random failures. Not approved: ก.)
- If the usage limit is near: finish and commit the current item cleanly, write a handover note in the repo
  (`docs/HANDOVER.md`), and stop.

Reporting: one short progress report per completed item, and a daily summary (done, in progress, blocked on the
owner).

## Product structure

- Never delete or freeze existing work. Merge, extend and regroup only.
- Every category keeps being developed, including Fortune.
- Field pilots and sales materials go to Exam, Gate and Crowd first.
- Licence-limited models (age/gender, expression) stay in the code and in demo mode. In customer builds they are off by
  default and carry a licence label.

### Categories

A page may appear in two categories. Pages not listed under a category are platform pages.

| # | Category (TH / EN) | Pages |
|---|---|---|
| 1 | ความปลอดภัยและการเข้าออก / Security & Access | gate, parking, village, gate-notice, cameras, afterhours |
| 2 | การศึกษาและการสอบ / Education & Exams | exam, exam-lab, exam-hall, exam-dashboard, omr |
| 3 | HR และที่ทำงาน / HR & Workplace | attendance (PIN/QR default, face optional), hr, interview, case-review, teamface |
| 4 | การตลาด ค้าปลีก และอีเวนต์ / Marketing, Retail & Events | crowd, store, insights, customers, retail, signage, neuro, queue, tables, bays, checkout, creative, creative-suite, booth |
| 5 | สุขภาพ ความปลอดภัย และคุณภาพ / Health, Safety & Quality | medicine, nutrition, driver, qc |
| 6 | ดูดวงและฤกษ์มงคล / Fortune & Auspicious Planning | fortune, faceread, palm, horoscope, tarot, iching, bazi, taksa, lek7, numbers, fengshui, dream, zodiac, astro, lifegraph, planner, luckycolor, report |
| 7 | สตูดิโอและสื่อ / Studio & Media | studio, photobooth, converter (+ booth) |
| – | Platform (not a category) | index, solutions, about, help, pricing, account, admin, privacy, terms, camera-notice |

## Standing rules

- No emotion inference in Exam, HR or Education. No lie or deception detection anywhere. A person confirms every
  plate read.
- Nothing leaves the device without the user's opt-in, and external AI also needs a server key. Only derived facts are
  sent. No images of people are stored or committed.
- Fortune readings (owner decision 2026-11-12, replaces "Fortune hard bans"): readings state unfavourable results
  plainly when the discipline's rules produce them: weak periods; what to be careful about in money, work,
  relationships, health habits and travel; conflict, obstacles, loss and ill-wishers. Plain wording is offered as
  "read it straight / ดูตรง ๆ / 直说" to users who confirm they are 18 or older, remembered per device; anyone who has
  not confirmed, or who switches it off, gets the gentler wording. Hard limits in every mode, each with tests in
  TH/EN/ZH:
  1. no prediction of death, terminal illness or a specific accident stated as certain or dated;
  2. no instruction to stop medication or treatment, to make a specific investment, or to end a relationship;
  3. the crisis net always takes priority and straight mode never bypasses it (crisis flow below);
  4. no wording that says the bad result will happen unless the user pays or performs something (no fear-selling;
     see Remedies and merit).
  Also: no lottery numbers; no medical or cosmetic advice; no emotion or deception inference.
- Crisis flow (owner decision 2026-11-13, replaces "hide and block"): respond, support and keep the door open. When the
  crisis net sees signs of distress, on every fortune page (zodiac included), each rule tested in TH/EN/ZH:
  1. never block the reading: first a short, warm acknowledgement and encouragement (no judgement, no echo of what the
     user typed) with the verified help resources clearly visible and pinned (1323 Department of Mental Health, 24 hours,
     and the others in docs/CRISIS-RESOURCES.md) and a gentle invitation to talk to someone they trust; then the user
     can continue;
  2. the reading uses the gentle, hope-oriented wording: no fatalistic statements; hard periods pass; what the person
     can do;
  3. free, comforting belief-based guidance may be shown (making merit, praying, chanting, meditation), labelled
     "according to belief";
  4. not shown while the flag is set: straight-mode negative predictions and anything involving payment or purchase
     (the on-your-behalf service entry, quote or interest forms, suggestions to buy or carry lucky items). Neutral lucky
     colours for the day are fine;
  5. no chat or "vent to AI" feature: the route for talking is the hotline and trusted people.
  The wording is reviewed by a mental-health professional before launch (legal / launch item L63). Every change to the
  flow gets an independent review on a fresh set, and the owner sees example screens (Thai) before it is deployed.
- Remedies and merit (owner decision 2026-11-10, replaces "no paid remedies"):
  - Never sell a remedy, a change of fortune or any outcome. No wording like "pay and your luck improves" or
    "guaranteed to fix ชง".
  - A paid "merit on your behalf" service is allowed only as a service: we charge for staff time, travel and
    photo/video proof. The donation or offering amount is shown separately and passed on in full, with proof and a
    receipt.
  - Remedy, place and lucky-item recommendations are free information, labelled "according to belief, please use your
    own judgement", and are never tied to a purchase.
  - Never offer the paid service when the crisis net triggers; show help resources instead (free belief guidance
    may still be shown, see Crisis flow).
- No AGPL, GPL or non-commercial models, code or data in the product. No Ultralytics.
  `vendor/models/faceparse-*.onnx` is never committed. Datasets, test videos and photos stay out of the repo.
- PDPA: keep privacy defaults and add notes to `docs/PDPA-NOTES-FOR-COUNSEL.md`. A lawyer reviews before sale.
- The same pass rule applies on CI and locally. No CI-only test allowances.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The agent may deploy the backend to the
  owner's Cloudflare account after the owner has run wrangler login. The agent never sees, prints or stores secret
  values; the owner enters them. (Owner decision 2026-11-10, replaces "do not deploy the backend, use real keys".) Do
  not change GitHub repo settings.

## Round 16 "Sellable core" (plan only: prepare after round 15, with effort S/M/L, owner dependencies and risks per item; build only after approval)

1. Packaging: reorganise the home page, navigation and solutions catalogue by the 7 categories. Every page stays
   reachable. Each category gets a landing page listing its tools, status (demo / experimental / pilot-ready) and
   measured accuracy with its source.
2. Customer-build switch: one config turns off the age/gender and expression models in customer builds, with a
   licence label. Demo mode keeps them on. Today `window.LENSIQ_AGE_GENDER` in `lensiq-config.js` defaults to `true`.
3. Honest claims: every one-pager and product page states measured accuracy and its source. Crowd states it is not
   yet suitable for dense crowds.
4. Organisation accounts on the Cloudflare backend (staging): org, admin and staff roles, multi-device sync and
   export/backup for Exam, Gate and Attendance. Show the data model and PDPA impact before building.
5. Field pilot kits: one pilot plan and checklist each for Exam, Gate and Crowd, based on docs/FIELD-PILOT.md, listing
   what the owner prepares on site.
6. One-pager and pricing draft for Exam, Gate, Crowd and Attendance.
