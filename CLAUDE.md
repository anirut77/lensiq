# LENSIQ: working rules

Static multi-page site (vanilla JS, TH default + `i18n/en-*.js`, `i18n/zh-*.js`), all vision on-device. Live:
https://anirut77.github.io/lensiq/. Owner-facing replies are in Thai.

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
- Fortune hard bans: no predictions of death, illness, accident, disaster or infidelity; no lottery numbers; no paid
  remedies; no medical or cosmetic advice.
- No AGPL, GPL or non-commercial models, code or data in the product. No Ultralytics.
  `vendor/models/faceparse-*.onnx` is never committed. Datasets, test videos and photos stay out of the repo.
- PDPA: keep privacy defaults and add notes to `docs/PDPA-NOTES-FOR-COUNSEL.md`. A lawyer reviews before sale.
- The same pass rule applies on CI and locally. No CI-only test allowances.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not deploy the backend,
  use real keys or change GitHub repo settings.

## Round 16 (draft, waits for owner approval after round 15)

- Packaging: reorganise the home page, navigation and solutions catalogue by the categories above. Every page stays
  reachable. Each category gets a landing page listing its tools, status (demo / experimental / pilot-ready) and
  measured accuracy with its source.
- Customer-build switch: age/gender and expression are off by default with a licence label. Demo mode keeps them on.
  Today `window.LENSIQ_AGE_GENDER` in `lensiq-config.js` defaults to `true`.
