# Incident 2026-11-12: "read it straight" switched off after the fresh crisis review

**Status:** straight mode OFF (`window.LENSIQ_FORTUNE_STRAIGHT = false`). Gentle readings only, as before the approval.

**Why:** the owner's order (2026-11-12) was to run an independent crisis review on a fresh set with straight mode on, and to
turn the mode off immediately if a user in crisis could reach a straight negative reading without seeing help resources.
The review failed. Source: synthetic, a fresh set of 127 inputs (95 crisis, 32 controls; TH, mixed, EN, ZH simplified and
traditional) written and hashed by the reviewer before reading the patterns; 508 headless-browser runs at commit 3d37445.

| Finding | Number |
|---|---|
| Support card shown for crisis inputs (tarot / dream) | 83/95 (87 %) |
| Crisis inputs with no card and no soft step | 10 |
| While the crisis state was active: straight readings, remedies, paid offers | 0 / 0 / 0 (help visible 336/336) |
| Straight reading after crisis, then another fortune page in the same tab | 166/166 (state is page-only) |
| Crisis inputs reaching a straight reading on the first page | 46 runs (28 undetected, 18 via the soft step's "Just the reading") |
| Help line in the viewport when that straight reading appeared | 0/212 (on the page but off-screen) |

**Code defect found:** `fortune-straight.js` reads `LQFortuneCrisis` once at load; on horoscope, numbers, tarot, palm,
faceread and fengshui it loads before `fortune-crisis.js`, so `calm()` cannot see the typed text there. The hard net still
runs inside `interpret()`.

**Before switching back on (each with a fixed test locked first, then a new fresh-set review):**
1. Look up `LQFortuneCrisis` at call time (or load order fixed on the 6 pages).
2. The 12 missed inputs as dev data; a new fresh set for the re-measure.
3. Crisis state for the browser session (sessionStorage boolean, no timestamp; owner decision 2026-11-12), so another
   fortune page in the same tab stays calm.
4. After "Just the reading" on the soft step: gentle wording only, no straight reading or remedies for that session.
5. The help line shown in view next to any reading that follows a soft step.
