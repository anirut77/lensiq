# Handover: state of the approved work list (2026-11-11)

Written for the next working session (the standing order in `CLAUDE.md`). Persistent data: `~/LENSIQ-field/evals/`.

## 1. Test deployment follow-ups: done

- Worker `lensiq-api-test` and D1 `lensiq-test` on the owner's Cloudflare account; `deploy/created.json` has the ids,
  versions for rollback and the Turnstile widget. Owner account `owner` with 2-step verification; bootstrap token
  closed; AI defaults written (all off; Haiku then GPT Luna via OpenRouter; budgets 5 / 3 / 2 USD).
- `medicine.html` points at the Worker (commit `ea0540a`, live). The owner runs the 5-minute phone checklist.

## 2. Admin key management: done (commit `8de5b00`, CI green, deployed)

- Migration `0012_ai_keys.sql` applied to D1 `lensiq-test`; Worker `lensiq-api-test` version `dc80ba56-47fd-4b18-9fea-0b1905326438`;
  smoke 24/24. Moving the OpenRouter key into the panel is the owner's step (`docs/DEPLOY.md`, last section).

## 2b. Tester "relaxed capture" (owner request 2026-11-11): measured first, NOT built, owner asked

- Pre-build check on the spent sets (`~/LENSIQ-field/evals/relaxed/precheck-run.log`): the rule as asked lets dispensing
  labels and personal notes reach the AI, which is the owner's stop condition. Variant "also no name-like line and no
  phone number" still lets 7 personal documents through on set p7b. Launch item L52 added to `docs/CTO-BRIEF.md`.

## 3. P7 option ข: built, measured, missed targets, OFF; owner decision pending

- Branch `p7-option-b` in worktree `~/LENSIQ-field/work/wt-p7b`, not committed yet. Guard default
  `sessionEvidence: "off"`. Results and the decision request: `docs/product-check/P7-RESULTS.md` (option ข section)
  in that worktree. Locked set `~/LENSIQ-field/evals/p7b/` (spent).
- Owner choices asked: keep off (recommended) / tighten and re-measure on a NEW set / drop. Commit the branch as its
  own commit after the keys push (CI green first).

## 4. Adverts option B: in progress

- Fresh claim texts collected (402 rows): `~/LENSIQ-field/product-check/texts-fresh/` (README lists sources).
  Licence of ASA rulings, Thai / Chinese news, the Thai Anti-Fake News Center and 14 maker pages is unconfirmed
  (quoted for evaluation only, never committed): owner asked before the set is used.
- Next: two blind AI labellers (as in P3), lock with sha256 in the repo, then build the "advert" capture type
  (on-device rules only, `kind: "ad"`, no AI step, card never names the seller) and tune rules on the old P3 data
  only, then one independent scoring on the fresh split. Targets: recall 80 %, false flags per 100 compliant texts.

## 5. Not started

P8 extra evals, hall-mode detector switch, P9, Nutrition / Try-On / Merit / Style MVPs, org accounts P1–P3.

## Open owner questions

Gate speed-up proposal (ก / ข / ค), P7 option ข decision, licence of the fresh advert sources, tester relaxed capture.
