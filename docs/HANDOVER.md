# Handover: state of main and the open branches (2026-11-14)

Replaces the handover of 2026-11-11. Written for the next working session. Rules: `CLAUDE.md` (standing order, parallel
teams mode of 2026-11-13, gates on GitHub Actions). Persistent data outside the repo: `~/LENSIQ-field/evals/` (locked
sets; their sha256 are committed in `evals-locks/`), worktrees in `~/LENSIQ-field/work/`.

Snapshot from `git branch -r` and `gh run list` on 2026-11-14 at main `4413bc3`. Branches move: refresh section 3
before acting (section 5, step 2).

## 1. Main

- `origin/main` = `4413bc3` (Merge review-locks-1114c). CI green on `4413bc3`; Pages deploy of `4413bc3` green (live:
  https://anirut77.github.io/lensiq/).
- Test backend: Worker `lensiq-api-test` and D1 `lensiq-test` on the owner's Cloudflare account (`deploy/created.json`).
  `accounts-g` (migration `0018_accounts.sql`) is merged on main (`9a31642`); this file does not record it as deployed:
  read `docs/DEPLOY.md` and the deploy records before any deploy. Deploy only from green main, only `lensiq-*` resources.

## 2. Streams A–H (parallel teams mode, owner order 2026-11-13)

Each stream works in its own worktree and branch, with an independent reviewer who did not build it. The coordinator
merges to main only when the branch's full CI run is green.

| Stream | Scope | Merged on main (2026-11-13 / 14) | Open on a branch |
|---|---|---|---|
| A urgent fixes | crisis net, Thai text safety, test determinism | `thai-sara-am-safety`, `thai-canon-2`, `totp-test-deterministic`, `deploy-gate-deterministic`, `parking-test-wait`, `e2e-profile-cleanup`, `eval-guard`, lock sets 14c / 14d (`review-locks-1114c`, `lock-fresh-14d`) | crisis flow v2, detection v4 / v5 (section 3) |
| B real-phone quality | phone layouts, capture, memory | `phone-quality`, `capture-hints`, `lead-form-fix` | `device-fit` |
| C Sellable pack | docs, sales kit, decisions | `sellable-c`, `sellable-c2`, `sellable-decisions-1113`, `legal-packet-backfill`, `claude-md-ops` | `stale-docs` |
| D Beauty & Image | look wording lint, personal colour, try-on | `tryon-fit` | `beauty-design`, `beauty-colour`, `beauty-look`, `review-locks-look` |
| E Merit | Merit MVP, wording lint | `merit-e`, `merit-lint-sara-am` | none |
| F Product Check | JA / KO guard, P9, live scan | `pc-f`, `pc-f2` | none |
| G accounts / billing | LINE sign-in, org lite, licences | `accounts-g` | none |
| H Gate & Exam hall | plate-detector training path, seat watch | `gate-hall-h` (`e938244`) | none |
| queue: Nutrition | label mode | `nutrition-2` | `nutrition-mvp` |

## 3. Branches open and waiting (not merged into main)

CI = last `ci.yml` run on the branch head.

| Branch | Head | vs main | CI | What it is | Waiting for |
|---|---|---|---|---|---|
| `merge-staging-crisis` | `921ecb6` | 18 ahead, 19 behind | green (run 43528192122) | crisis flow v2 merged with main (owner decision 2026-11-13 "respond, support, keep the door open"); fresh independent review 3: config A PASS 0 / 1404; detection v3 | bring up to date with main, CI, coordinator merge. L54 stays open until the professional review |
| `crisis-flow-v2` | `5522e91` | contained in `merge-staging-crisis` | green | the flow itself | goes in through `merge-staging-crisis` |
| `crisis-detect-v4` | `e0843c1` | contained in v5 | green | detection v4 (review 3 dev data) | superseded by v5 |
| `crisis-detect-v5` | `8061387` | 21 ahead, 45 behind | green (run 43565106094) | detection v5: class rules for the review 4 misses, name-field and soft-step fixes. Builder-measured on the spent 14c set (synthetic): 0 / 178 missed, controls 0 / 72. Does NOT contain `merge-staging-crisis` | independent review on the fresh locked set `fortune-honest__fresh-2026-11-14d` (lock on main), then combine with the crisis flow v2 line, CI |
| `device-fit` | `19fc7c6` | 4 ahead, 0 behind | green (run 43588563634) | "best used on" per page, phone notice, labels in menu / catalogues / sales docs; review findings 1, 2, 4 fixed | coordinator merge once the review is recorded OK |
| `beauty-design` | `2924017` | 1 ahead | no run | `docs/BEAUTY-IMAGE-DESIGN.md`, draft for owner approval, nothing built | owner approval |
| `beauty-colour` | `36ece3e` | 9 ahead, 120 behind | no run | Personal Colour MVP; locked test C4 FAILS (numbers in section 4) | owner decision; not merged while C4 fails |
| `beauty-look` | `75d8662` | 19 ahead, 115 behind | green (run 43475011224) | look wording lint (TH / EN / ZH families), held-out false positives fixed | independent review on held-out set 2 (`review-locks-look`), update from main, CI |
| `review-locks-look` | `2fdbcc6` | 2 ahead | — | lock files `beauty-look-heldout*.sha256` | merge with `beauty-look` |
| `review-locks-1114`, `review-locks-1114b` | `5cb36d3`, `3c6f125` | 3 ahead each | — | lock files of the spent review sets 14 and 14b | persist on main (append-only), as was done for 14c |
| `nutrition-mvp` | `9afb641` | 3 commits not on main (parser fixes, allergen keywords, tilt straightening; locked sets 3–5) | green (run 43390109006) | Nutrition follow-ups after `nutrition-2` | update from main, CI, independent re-measure, owner sign-off on the safety result (section 4) |
| `stale-docs` | see its push | — | see its run | L23 rows, PAGE-STATUS Exam text, this file, customer-bundle lock (`tools/build-site.mjs --customer`), L51 whole-database test | coordinator merge after green CI |

No unique patches left (content already on main): `merge-eval-guard`, `rules-ci`. Dependabot (pip) branches untouched.

## 4. Owner decisions still pending

Restated so this file stands alone. The report format in `CLAUDE.md` restates them in full under "รอคุณตัดสิน".

1. **Personal Colour (`beauty-colour`).** Locked test C4 fails (synthetic): same undertone band in all 5 lights 0.20
   (target ≥ 0.80), season top-1 0.356 (≥ 0.70), top-2 0.70 (≥ 0.90); C1–C3, C5, C6 pass. The branch asks the owner
   how to display the band or whether to change the targets (a claim change). No answer: unmerged, nothing shown.
2. **Beauty & Image design note (`beauty-design`).** Approve or ask for changes. No answer: nothing beyond what the owner
   already approved is built.
3. **Nutrition safety result (`nutrition-mvp`).** On main the silent-wrong-value target was missed (3.0 % [2.0–4.3]
   pooled, all on 4° tilted pictures, synthetic). The branch straightens 1–3° tilts and reports 1 / 1912 silent wrong
   (upper 0.3 %) on the fifth synthetic set, builder-measured. Accept after the independent re-measure, or not.
   No answer: Nutrition stays as on main.
4. **P8 extra evals:** need the owner's OpenRouter credit (money). No answer: P8 not run.
5. **LINE Login channel:** create it under the LENSIQ provider and enter the channel id and secret yourself (the agent
   never sees secrets). No answer: LINE sign-in stays off.
6. **Privacy-contact (DPO) e-mail address.** No answer: documents keep LINE @632yliiw (L61).
7. **Accountant answers** on receipt numbering and tax invoices (`docs/sales/ACCOUNTANT-QUESTIONS-TH.md`). No answer:
   the owner issues receipts from the template.
8. **Seller details and VAT decision** (`docs/LAUNCH-READINESS.md` O1, O2). No answer: selling by quotation stays blocked.
9. **Attendance face mode before L23** (`docs/ATTENDANCE-READINESS.md` B10): quote face mode while the face-model
   licence is open, or not. No answer: PIN / QR only (the default).

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
