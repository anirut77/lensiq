# LENSIQ: working rules

Static multi-page site (vanilla JS, TH default + `i18n/en-*.js`, `i18n/zh-*.js`), all vision on-device. Live:
https://anirut77.github.io/lensiq/. Owner-facing replies are in Thai.

## Working rules (owner: Tum)

- Never loosen or skip a test to make CI pass. Fix the product. No CI-only allowances.
- CI must be green before stacking new work. Push risky fixes as their own commit.
- Ask the owner before changing approved scope or order. Don't start and report later.
- Every round: fixed test set before building, real numbers per condition, an independent reviewer agent that re-measures.
- On-device processing by default. A human confirms any decision affecting money, access or a person. No emotion or
  deception scoring.
- Check the licence of every model, dataset and media file for commercial use. Record credits.
- Every accuracy claim states its source: synthetic, public dataset or field.
- All user-facing text complete in Thai, English and Chinese.
- Report format: built / deferred + why / numbers vs targets / risks / next step. Then wait for approval.
- Keep docs/CTO-BRIEF.md and docs/FIELD-PILOT.md updated each round.

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
| 5 | สุขภาพ ความปลอดภัย และคุณภาพ / Health, Safety & Quality | medicine, driver, qc |
| 6 | ดูดวงและฤกษ์มงคล / Fortune & Auspicious Planning | fortune, faceread, palm, horoscope, tarot, iching, bazi, taksa, lek7, numbers, fengshui, dream, zodiac, astro, lifegraph, planner, luckycolor, report |
| 7 | สตูดิโอและสื่อ / Studio & Media | studio, photobooth, converter (+ booth) |
| – | Platform (not a category) | index, solutions, about, help, pricing, account, admin, privacy, terms, camera-notice |

## Standing rules

- No emotion inference in Exam, HR or Education. No lie or deception detection anywhere. A person confirms every
  plate read.
- Nothing leaves the device without the user's opt-in, and external AI also needs a server key. Only derived facts are
  sent. No images of people are stored or committed.
- Fortune hard bans: no predictions of death, illness, accident, disaster or infidelity; no lottery numbers; no medical
  or cosmetic advice.
- Remedies and merit (owner decision 2026-11-10, replaces "no paid remedies"):
  - Never sell a remedy, a change of fortune or any outcome. No wording like "pay and your luck improves" or
    "guaranteed to fix ชง".
  - A paid "merit on your behalf" service is allowed only as a service: we charge for staff time, travel and
    photo/video proof. The donation or offering amount is shown separately and passed on in full, with proof and a
    receipt.
  - Remedy, place and lucky-item recommendations are free information, labelled "according to belief, please use your
    own judgement", and are never tied to a purchase.
  - Never offer the paid service when the crisis net triggers; show help resources instead.
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
