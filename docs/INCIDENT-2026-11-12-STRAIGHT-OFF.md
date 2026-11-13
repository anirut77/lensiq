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

## Fix 4 (branch crisis-fix-4, 2026-11-13; straight mode stays OFF)

Fixed tests locked first (`tests/unit/fortune-crisis-session.test.js`, `tests/e2e/fortune-crisis-session.e2e.mjs`; sha256 in
`~/LENSIQ-field/evals/fortune-honest/locked.sha256`). Before the change on 5f89d03: unit 0/5, e2e 1/5. After: unit 5/5, e2e 5/5.
Source of the 12 inputs: the reviewer's fresh set, which is now **spent** (dev data only; no number from it counts as a result).

1. `fortune-straight.js` looks `LQFortuneCrisis` up at call time; `calm()` also counts the tab's session flag, the answered soft
   step and name fields that hold more than a name.
2. One sessionStorage boolean (`lq-fortune-calm` = `1`; no timestamp, no text) is set when the support card is shown or the soft
   step is answered with "Just the reading". Every later fortune page in the tab is calm: gentle wording only, no straight control
   or reading, `data-lq-remedy` and paid (`data-lq-upsell`) blocks hidden, `allow()` refuses remedy / lucky / paid / merit /
   straight. Storage blocked: page-level behaviour as before.
3. On a calm page the help line is sticky at the bottom of the viewport while the reading's result section is on screen.
4. New patterns for the 12 misses (pills by the bottle, burden, farewell letter, sleeping forever, "tomorrow I won't be here", gas in
   a car, mixed EN + TH, "kil myself", "sucide", 生无可恋, 想紫砂, 伤害自己); the "dying of laughter" idiom (อยากตายเพราะหัวเราะ)
   no longer shows the card but still gets the soft step.

Fix 4b (same branch): the fortune hub, planner and luckycolor now load `fortune-crisis.js` and honour the calm session flag.
Hidden there in a calm tab: the lucky-colour mirror's goal picker, recommendation, result and week table; the planner's lucky
shirt-colour chip; and the hub's promotion block. Each page's help line at the top stays in view. Tests locked first
(`tests/unit/fortune-calm-pages.test.js`, `tests/e2e/fortune-calm-pages.e2e.mjs`). Before: unit 0/2, e2e 2/4. After: 2/2, 4/4.
