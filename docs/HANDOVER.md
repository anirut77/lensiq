# Handover: state of main and the open branches (2026-11-14)

Replaces the handover of 2026-11-11. Written for the next working session. Rules: `CLAUDE.md` (standing order, parallel
teams mode of 2026-11-13, gates on GitHub Actions). Persistent data outside the repo: `~/LENSIQ-field/evals/` (locked
sets; their sha256 are committed in `evals-locks/`), worktrees in `~/LENSIQ-field/work/`.

Snapshot from `git branch -r`, `git cherry origin/main <branch>` and `gh run list` on 2026-11-14 at main `9bbc147`; `beauty-look` merged afterwards (`de59b10`).
Branches move: refresh section 3 before acting (section 5, step 2). "unique" = commits whose patch is not on main.

## 1. Main

- `origin/main` = `de59b10` (Merge beauty-look) after `9bbc147` (Merge org-p1). The earlier head `4413bc3` had CI and the Pages deploy green; check the runs
  of the current head before deploying (live: https://anirut77.github.io/lensiq/).
- Test backend: Worker `lensiq-api-test` and D1 `lensiq-test` on the owner's Cloudflare account (`deploy/created.json`).
  `accounts-g` (migration `0018_accounts.sql`, `9a31642`) and `org-p1` (organisation accounts P1 behind two off
  switches, `9bbc147`) are merged on main; this file does not record either as deployed: read `docs/DEPLOY.md` and the
  deploy records before any deploy. Deploy only from green main, only `lensiq-*` resources.

## 2. Streams A–H (parallel teams mode, owner order 2026-11-13)

Each stream works in its own worktree and branch, with an independent reviewer who did not build it. The coordinator
merges to main only when the branch's full CI run is green.

| Stream | Scope | Merged on main (2026-11-13 / 14) | Open on a branch |
|---|---|---|---|
| A urgent fixes | crisis net, Thai text safety, test determinism | `thai-sara-am-safety`, `thai-canon-2`, `totp-test-deterministic`, `deploy-gate-deterministic`, `parking-test-wait`, `e2e-profile-cleanup`, `eval-guard`, lock sets 14c / 14d (`review-locks-1114c`, `lock-fresh-14d`) | crisis flow v2, detection v4 / v5 |
| B real-phone quality | phone layouts, capture, memory | `phone-quality`, `capture-hints`, `lead-form-fix` | `device-fit` |
| C Sellable pack | docs, sales kit, decisions | `sellable-c`, `sellable-c2`, `sellable-decisions-1113`, `legal-packet-backfill`, `claude-md-ops` | `claims-1114`, `stale-docs`, `attendance-face-eval` |
| D Beauty & Image | look wording lint, personal colour, style, try-on | `tryon-fit`, `beauty-look` (`de59b10`) | `review-locks-look`, `style-mvp`, `beauty-design`, `beauty-colour` (parked) |
| E Merit | Merit MVP, wording lint | `merit-e`, `merit-lint-sara-am` | none |
| F Product Check | JA / KO guard, P9, live scan | `pc-f`, `pc-f2` | `pc-jk` |
| G accounts / billing | LINE sign-in, org lite, licences, org accounts P1 | `accounts-g`, `org-p1` | none (P2–P3 not started) |
| H Gate & Exam hall | plate-detector training path, seat watch | `gate-hall-h` (`e938244`) | none |
| queue: Nutrition | label mode | `nutrition-2` (it carries the nutrition-mvp fixes) | `nutrition-mvp`: nothing left to merge |

## 3. Branches open and waiting (not merged into main)

CI = last `ci.yml` run on the branch head at the snapshot ("running" = in progress then).

| Branch | Head | vs main | CI | What it is | Waiting for |
|---|---|---|---|---|---|
| `merge-staging-crisis` | `921ecb6` | 18 ahead, 22 behind, 15 unique | green (43528192122) | crisis flow v2 merged with main (owner decision 2026-11-13 "respond, support, keep the door open"); fresh independent review 3: config A PASS 0 / 1404; detection v3 | bring up to date with main, CI, coordinator merge. L54 stays open until the professional review |
| `crisis-flow-v2` | `5522e91` | contained in `merge-staging-crisis` | green | the flow itself | goes in through `merge-staging-crisis` |
| `crisis-detect-v4` | `e0843c1` | contained in v5 | green | detection v4 (review 3 dev data) | superseded by v5 |
| `crisis-detect-v5` | `8061387` | 21 ahead, 48 behind, 19 unique | green (43565106094) | detection v5: class rules for the review 4 misses, name-field and soft-step fixes. Builder-measured on the spent 14c set (synthetic): 0 / 178 missed, controls 0 / 72. Does NOT contain `merge-staging-crisis` | independent review on the fresh locked set `fortune-honest__fresh-2026-11-14d` (lock on main), then combine with the crisis flow v2 line, CI |
| `claims-1114` | `45a6cf5` | 2 ahead, 3 behind | **failed** (43592449873, "Lint + unit") | owner decisions 2026-11-14: travel card 0.811 → 0.907 (188 synthetic labels), privacy rows `lq-heavy` / `lq-camcap`, Try-On in category 4 (not in the menu), Personal Colour parked. Its message says the test "categories equal the CLAUDE.md table" needs `tryon` in row 4 of `CLAUDE.md` (coordinator) | the CLAUDE.md row (coordinator), fix the failing unit job, CI. Also edits `tools/cat-data.cjs` like `stale-docs`: regenerate with `node tools/cat-pages.mjs` after merging |
| `attendance-face-eval` | `9f648bb` | 3 ahead, 3 behind | running (43595494387) | owner item E: AuraFace, SFace, MobileFaceNet vs face-api.js on the Face Research Lab London Set (CC BY 4.0, 102 people, lock `69e8693`); no candidate has clean weights and training data together; nothing switched; independent re-score matched | green CI, coordinator merge; feeds L23 / B10 |
| `pc-jk` | `a1ad2b7` | 5 ahead, 3 behind | running (43596202059) | Japanese / Korean text never goes to AI automatically or as a photo (page, Worker, fortune); review fixes; results on hold-out 4 | green CI, coordinator merge |
| `style-mvp` | `ba2d152` | 2 ahead, 3 behind | running (43595256145) | Style MVP behind `LENSIQ_STYLE` (off): personal colour palette with the white-balance card step; acceptance tests locked first (`15b7837`) | green CI, independent review, merge. Personal Colour was parked by the owner (see `claims-1114`): confirm the switch stays off |
| `review-locks-look` | `2fdbcc6` | 2 unique | no run | lock files `beauty-look-heldout*.sha256` | `beauty-look` is merged (`de59b10`): check whether these lock files are on main, persist them if not (append-only) |
| `device-fit` | `19fc7c6` | 4 ahead, 3 behind | green (43588563634) | "best used on" per page, phone notice, labels in menu / catalogues / sales docs; review findings 1, 2, 4 fixed | update from main, coordinator merge once the review is recorded OK |
| `beauty-design` | `2924017` | 1 ahead | no run | `docs/BEAUTY-IMAGE-DESIGN.md`, draft for owner approval, nothing built | owner approval |
| `beauty-colour` | `36ece3e` | 9 ahead, 123 behind | no run | Personal Colour MVP; locked test C4 fails | **parked** by the owner 2026-11-14 (option C, recorded in `claims-1114`); do not merge |
| `review-locks-1114`, `review-locks-1114b` | `5cb36d3`, `3c6f125` | 3 ahead each | no run | lock files of the spent review sets 14 and 14b | persist on main (append-only), as was done for 14c |
| `nutrition-mvp` | `9afb641` | 6 ahead, 1 unique | green (43390109006) | its fixes `180ae6d`, `0f52641`, `9afb641` are already on main through `nutrition-2` (as `dfcfb42`, `cfff7f5`, `74131ee`); the one unique commit `f040eeb` is the original MVP commit; main has its version of it as `2944649` (same title, patch differs after merge fixes) | nothing to merge; the branch can be retired (deleting it is the owner's call) |
| `stale-docs` | see its push | — | see its run | L23 rows, PAGE-STATUS Exam text, this file, customer bundle (`tools/build-site.mjs --customer`, no test backend), `?faceparse=1` lock, L51 whole-database test | coordinator merge after green CI |

No unique patches (content already on main): `merge-eval-guard`, `rules-ci`. Not on origin at the snapshot:
`walk-fix`, `consistency-pass`, `speed-pass`. Dependabot (pip) branches untouched.

## 4. Owner decisions still pending

Restated so this file stands alone. The report format in `CLAUDE.md` restates them in full under "รอคุณตัดสิน".
Decided 2026-11-14 and no longer pending: Personal Colour parked (option C, recorded on `claims-1114`).
Not an owner decision any more: Nutrition. Round 5 (v5) met every target; independent review 2026-11-13 OK (synthetic, re-measured on the reviewer's own set); merged as experimental under the standing order. Real-photo measurement still needs the owner's photos. (I2 silent wrong 1 / 1912 = 0.1 % [0.0–0.3], I3 allergen 99.6 %,
locked set v5; `docs/nutrition/NUTRITION-ACCURACY.md` "Status".) The "branch only" wording of round 2 no longer applies.

1. **Beauty & Image design note (`beauty-design`).** Approve or ask for changes. No answer: nothing beyond what the owner
   already approved is built.
2. **P8 extra evals:** need the owner's OpenRouter credit (money). No answer: P8 not run.
3. **LINE Login channel:** create it under the LENSIQ provider and enter the channel id and secret yourself (the agent
   never sees secrets). No answer: LINE sign-in stays off.
4. **Privacy-contact (DPO) e-mail address.** No answer: documents keep LINE @632yliiw (L61).
5. **Accountant answers** on receipt numbering and tax invoices (`docs/sales/ACCOUNTANT-QUESTIONS-TH.md`). No answer:
   the owner issues receipts from the template.
6. **Seller details and VAT decision** (`docs/LAUNCH-READINESS.md` O1, O2). No answer: selling by quotation stays blocked.
7. **Attendance face mode before L23** (`docs/ATTENDANCE-READINESS.md` B10): quote face mode while the face-model
   licence is open, or not. `attendance-face-eval` found no replacement with clean weights and training data. No answer:
   PIN / QR only (the default).
8. **Licence-limited weight files in customer bundles** (`docs/LAUNCH-READINESS.md` C5): `age_gender_model.*`
   (UTKFace), `face_expression_model.*` and the other face-api weights are shipped, locked off. Options: keep shipping
   them locked off until counsel answers L23, or leave them out of customer bundles (it changes what customer pages can
   load, so it needs the owner and counsel). No answer: shipped, locked off.

## 5. How to resume

1. `git fetch`; read `CLAUDE.md`, this file, `docs/LAUNCH-READINESS.md` and `docs/CTO-BRIEF.md` §5.
2. Refresh section 3: `git branch -r --no-merged origin/main`, and per branch
   `gh run list --workflow ci.yml --branch <b> --limit 1`.
3. Per branch: a worktree in `~/LENSIQ-field/work/`, `node_modules` symlinked from the main repo, merge `origin/main`
   in, run the affected suites locally and read the result, push, `gh workflow run ci.yml --ref <branch>`, poll at most
   every 4 minutes. Merge to main only on a green branch run and a recorded independent review. Push risky fixes as
   their own commit.
4. No local full gate while other agents run (at most one, other CPU-heavy agents paused).
5. Order after the open branches: the Sellable pack list in `CLAUDE.md` (items 1–9), then the queue (CI sharding ค,
   adverts on-device, hall-mode detector switch, P8 after the owner's credit, P9, Merit, Nutrition, Try-On, Style,
   org accounts P1–P3); Fortune fixes alongside.
6. Near the usage limit: finish and commit the current item, update this file, stop.
