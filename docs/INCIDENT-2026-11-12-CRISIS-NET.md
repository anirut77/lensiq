# Incident 2026-11-12: fortune crisis net missed common phrasings

Status: mitigated (rounds 1–3 live; help line and a fresh independent review in progress). Owner informed 2026-11-12.

## What happened
- The crisis net on the fortune pages (shows a support card with help lines instead of a reading) matched only a
  small set of standard phrasings. It had done so since it was introduced on 2026-11-08 (commit `6fe450a`).
- Affected: every page that uses `fortune-ai.js` (astro, bazi, dream, faceread, fengshui, horoscope, iching, lek7,
  lifegraph, numbers, palm, report, tarot, taksa, zodiac), in Thai, English and Chinese.
- Missed: Thai without tone marks, slang and dialect; traditional Chinese and Chinese typed with spaces; English slang,
  leetspeak and letter-spacing; indirect phrasings; disclosures of violence and of sexual abuse of minors. The horoscope
  name field was checked only when ≤ 12 characters without spaces; the partner-name and name-number fields not at all.
- A user typing a missed phrase saw an ordinary reading instead of the support card (1323, 1669, 191, 1300), and on
  some pages the typed text was echoed back.

## How it was found and why it was missed
- Found by an independent reviewer of the straight-reading work (19/52 adversarial inputs caught).
- The original tests held 27 standard phrasings only, and no earlier review attacked the net. Each fix round was then
  re-measured on a fresh set: round 2 reached 100 % on the earlier sets but 9/60 on a new one, showing that word lists
  fitted to test sets overstate coverage.

## Fixes (each its own commit, tests locked before the change)
| Round | Commit | Live (Bangkok time) | Change |
|---|---|---|---|
| 1 | `0f0ae99` | 2026-11-12 08:50 | broader patterns; every free-text field checked in full |
| 2 | `23c47d4` | 2026-11-12 09:15 | spaced Chinese, letter-spaced / leetspeak English, Thai dialect; partner and name-number fields; card replaces every horoscope tab |
| 3 | `05366cc` | pushed 09:48 | soft "are you okay?" step before any reading on ambiguous distress words; typed text never echoed; child-abuse, slang and KO/JA/MS/VI patterns |
| Help line | (in progress) | – | always-visible help line on every fortune page and result, numbers verified from official sources |

Tests: `tests/unit/fortune-crisis-net*.test.js`, `tests/e2e/fortune-crisis-fields*.e2e.mjs`,
`tests/e2e/fortune-crisis-soft.e2e.mjs` (checksums in `~/LENSIQ-field/evals/fortune-honest/locked.sha256`).

## Standing measures
- Every review round uses a fresh, never-seen input set; earlier sets become development data.
- The always-visible help line does not depend on detection.
- Patterns, the support card and the soft step need review by a Thai mental-health professional before launch.
