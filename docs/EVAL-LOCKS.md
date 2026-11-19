# Eval locks: locked sets persist

Owner rule 2026-11-13, written after a locked test set was lost twice.

## The rule

1. Every fixed test or eval set is written to `~/LENSIQ-field/evals/<phase>/` before anything is measured. A set that
   lives only in an agent session, a temp folder, a scratchpad or a worktree does not count.
2. Its sha256 is committed in the repo, in `evals-locks/<phase>.sha256`, before anything is measured.
3. Every measuring harness calls `tools/eval-guard.mjs` first. The guard refuses to measure unless each input file is
   under `~/LENSIQ-field/evals/<phase>/` (symlinks resolved), its sha256 is in `evals-locks/<phase>.sha256` as
   committed at `HEAD` (the guard reads the file with `git show HEAD:`, not from the working tree), and that file has no
   uncommitted change.

`<phase>` is the folder name under `~/LENSIQ-field/evals`, in lowercase. Nested folders use `a__b`, so
`evals/nutrition/v5` is `nutrition__v5`. `.` and `..` segments are refused.

Lock lines: only lines that start with a sha256 followed by a space count, as `<sha256>  <path>`. Comment lines, a
`LOCK <sha256>` prefix, `x#<sha256>` and a second hash on the same line do not count.

## Commands

```sh
# lock: appends a "# locked <UTC>" comment line and one "<sha256>  <path>" line per file (no trailing comment) to
# evals-locks/<phase>.sha256 first, then ~/LENSIQ-field/evals/<phase>/locked.sha256 (append-only); fails loudly if
# either write fails; then prints the git command
node tools/eval-guard.mjs lock <phase> <files...>
git add evals-locks/<phase>.sha256 && git commit -m "evals-locks: lock <phase>"

# check: exit 0 = every file is locked and committed; exit 1 = refused, with every reason on stderr
node tools/eval-guard.mjs check <phase> <files...>

# import: copy the lock files kept next to the sets into evals-locks/ (idempotent, append-only), then commit
node tools/eval-locks-import.mjs
```

`tools/eval-locks-import.mjs` never changes or removes a line already in the repo. When a field lock file was rewritten
in place, the old repo lines stay, the new lines are appended, and the phase is listed as a finding. It also lists
locked files that no longer exist and files changed after locking. It fixes nothing.

Files are absolute or relative to `~/LENSIQ-field/evals/<phase>/`. To fix a set after locking, write a new phase
folder (for example `nutrition/v6`) and lock it. Don't edit a locked file. A new hash line is appended only for a
documented re-lock made before any measurement.

In code: `import { assertLocked, phaseOf } from "./eval-guard.mjs"`, then call
`assertLocked(phaseOf(dir), ["set.json", ...])` before reading or scoring the set. It throws an error that names every
missing item. The `root` and `repo` options work only under `node --test`.
`tests/unit/eval-guard.test.js` scans every `.mjs` / `.js` file under `tools/` and fails, with the fix in its message,
if a file that refers to the evals folder does not import the guard and call `assertLocked`. Tools that only write
there, or that read the measurement-only vendor files, are listed in the test with the reason and a pinned count of
references.

## Repo files must equal their latest lock (owner decision 85 ก, 2026-11-17)

`node tools/eval-guard.mjs repo` (a blocking CI step after the unit tests) compares every repo file named in any
`evals-locks/*.sha256` with its locked hash. It reads only `evals-locks/` and the repo, so it runs on CI without
`~/LENSIQ-field`. `assertLocked` runs the same check for the repo files locked in its phase.

- Repo path: a relative path whose first folder is a folder at the repo root (`tests/…`, `tools/…`, `docs/…`), or any
  line marked `# repo file`. Bare names (`README.md`), phase sub-folders (`relock/x.mjs`) and absolute paths are the
  copies under `~/LENSIQ-field` and are checked by `check` only.
- Latest lock: within a lock file the last line for a path wins. Across lock files, a hash is superseded when another
  lock file holds the same hash for the path and a later line after it. Two lock files whose latest lines still
  disagree are a conflict: append the right hash, with the reason, to the lock file that is out of date.
- A locked file that is no longer in the repo fails unless a lock file retires it after its last hash line:
  `# retired <path> reason: <why>`. A retired file that is still in the repo fails too.
- A file locked on main before its code is merged from a feature branch may carry, after its last hash line,
  `# pending <path> branch: <branch> reason: <why>`. The guard accepts it ONLY while the file is absent from the repo;
  once the file exists it must equal its latest lock, as without the marker (`tests/unit/eval-guard-pending.test.js`).
- Never append a hash only to make the check pass: a re-lock is documented (what changed, why, stricter or not) and made
  before measuring. Tests: `tests/unit/eval-guard-repo.test.js` (locked in `evals-locks/eval-guard.sha256`).

## Harnesses wired (2026-11-13)

| Harness | Phase | Files checked |
|---|---|---|
| `tools/nut-eval.mjs` | from `--set` (`nutrition`, `nutrition__v2`…`v5`) | `set.json` and `score.mjs` before the set is read, then every image it reads |
| `tools/exam-hall-detector-eval.mjs --run / --from` | `hall-detector` | `manifest.jsonl` (see the open item below) |
| `tools/pc-advert-eval.mjs --fresh` | from the folder (`adverts__fresh`, `adverts__fresh2`) | `blind-input.jsonl`, `labels-A.jsonl`, `labels-B.jsonl` |
| `tools/pc-advert-eval.mjs` dev mode, when `--data` is in the evals folder | from the folder | `set.jsonl`, `split.json` |

`tools/nut-eval.mjs` also checks the set's own `locked.sha256` (`tools/lib/nut-lock.mjs`), where anything after ` #` is a
comment.

Open item: the hall-detector images (`images/*.jpg`) are locked only as one aggregate hash (323 files concatenated in
name order), and they were deleted after the 2026-11-11 run. The guard checks `manifest.jsonl`, which names every image,
but not the image bytes. A new `--run` needs the images downloaded again, plus a per-file lock with
`eval-guard.mjs lock hall-detector images/...` before measuring.

Listed in the test as not reading a set: `tools/exam-hall-face-eval.mjs` reads only the measurement-only vendor
files, and pins their sha256. Its image set is outside `evals/`. `tools/pc-evidence-testset.mjs --eval` appends a dev
log line to `evals/p7`. `tools/pc-refimg.mjs synthetic` writes its results to `evals/p9`.

The older harnesses whose sets live outside `evals/` are not wired either: `pc-*-eval` (`~/LENSIQ-field/product-check`),
`plate-*-eval` (`~/LENSIQ-field/plates`), `exam-face-eval` (`~/LENSIQ-field/exam-faces`) and `crowd-eval`
(`docs/crowd-count`). Moving those sets into `evals/` is an owner decision.

## Reviewers and harnesses outside the repo

Agents that write a harness or scorer in `~/LENSIQ-field/evals/<phase>/` (for example an independent reviewer's
`harness.mjs`) must run the guard before measuring and paste its full output into their report:

```sh
node "<repo>/tools/eval-guard.mjs" check <phase> <every input file>
```

If the guard does not print `eval-guard OK`, there is no measurement. Report the refusal instead.

## live-scan baseline (owner decision 89, 2026-11-17)

- **No prior copy existed.** `tests/unit/pc-live.test.js` was locked as `691dd37a` on 2026-11-12, then wrapped (change 2 in
  `evals-locks/live-scan.sha256`) to `7746decb` with no review or owner record; `691dd37a` was never committed or kept, so
  nothing exists to compare. Owner decision 89 accepts `7746decb` as the baseline. The bytes are unchanged since `dbb38f6f`.
  Lock line, field copy `pc-live.test.7746decb.js` and field lock `locked-2026-11-17-baseline.sha256` (new files;
  `locked.sha256` not modified): commit `08388c9c`. `node tools/eval-guard.mjs repo`: 0 mismatches (was 1).
- **Release criteria** (written in `docs/product-check/LIVE-SCAN-RESULTS.md`; there is no separate "release criteria"
  document) mapped to the live-scan set: `pc-live.test.js` (unit), `backend-pc-auto.test.js` (A1-A7),
  `product-check-live.e2e.mjs` (e2e 1-10), and the checks added on this branch (`pc-live-release.test.js` R1-R7).

| # | Criterion | Source (LIVE-SCAN-RESULTS.md) | Check | Status |
|---|---|---|---|---|
| 1 | Live scan by default: camera stays open, framing guide, short live hints, no shutter | :57-58, :103 | pc-live frame checks; e2e 1 | existed |
| 2 | At most 4 frames analysed per second, on a <= 320 px copy in memory | :61, :102 | pc-live "battery" (<= 5); e2e 1 (<= 5.2) | **added R1** (<= 4) |
| 3 | Auto-capture after 3 steady good frames; a steady blurred view after 8 | :59, :102 | pc-live auto-capture (2-6 frames) | **added R2** |
| 4 | At most 3 readings of one side, then stop | :59, :102 | pc-live (2-6); e2e 2 (<= 6) | **added R3** |
| 5 | Readings merged by vote per line | :59 | pc-live merge; e2e 2 | existed |
| 6 | Another object (under half the lines in common) starts over; earlier barcodes dropped | :77 (fix 1) | e2e 2 only via a blank frame in between | **added R4**; it failed on the product: fixed `dc936566` |
| 7 | Checklist barcode / registration number / ingredients | :60 | pc-live checklist; e2e 1 | existed |
| 8 | Hidden page: no analysis, camera released | :61 | e2e 3 | existed |
| 9 | "Take this picture" kept; live scan can be switched off | :62 | e2e 1 (fallback only) | **added R5** (default on, switch works) |
| 10 | Official lookup by itself only with the online opt-in, once per product, derived facts only | :37, :63 | e2e 4 | existed |
| 11 | No automatic sending: the live scan never sends to AI | :28, :361 | e2e 4, 5 | existed |
| 12 | One-tap: testers only, one consent with "remember my choice" | :29, :362-363 | e2e 5; A1 | existed |
| 13 | One-tap only when every filter passes (aiGate, guard, possible name, autoBlock, own unedited OCR, face check ran and found none, page visible) | :30, :363-366 | pc-live auto-send decision + real guard; e2e 6 | existed |
| 14 | A filter miss: reason shown, usual preview, nothing before "Send this text" | :31, :366 | e2e 6 | existed |
| 15 | Text sent is shown; both withdraw buttons clear consent and one-tap at once | :32, :368 | e2e 5, 7 | existed |
| 16 | Text only; no automatic image; a photo only after "Use this picture" | :33, :166, :368 | e2e 8; A7; `pc-ondevice.test.js` | existed |
| 17 | Public users: preview and confirm every time | :35 | e2e 4 | existed |
| 18 | **Owner decision 96 = ก (2026-11-18)**: one round per tap, at most three calls (pc_fields, pc_claims, pc_translate), the user taps every time (replaces "one AI call per product"; per-product dedupe applied only to the removed automatic path) | :66, :163, §17 | `pc-live-tap.test.js` T1 (at most 3 requests, each feature once, no loop) and T2 (nothing without a tap); e2e 5 ("one tap = one round": pc_fields 1 + pc_claims 1) | **added T1, T2** |
| 19 | Worker: `auto` boolean, tester + valid code, Product Check features only, auto filter | :34, :173-176, :369 | A1-A5 | existed |
| 20 | Worker one-tap allowance 6 a minute, 150 a day | :69, :177 | A6 (allows 12 / 300; day limit never reached) | **added R6** (<= 6, <= 150, request 151 refused) |
| 21 | Auto flag, tester code and facts never reach the provider | :177 | A7 | existed |
| 22 | Documented refusal codes show their own notice in TH / EN / ZH (incl. `ai_off_personal_data`, `ai_off_auto_filter`) | :36, :355-357 | e2e 8 (four codes, Thai) | **added R7** |
| 23 | A note to a person stops one-tap | :403 | `pc-guard-onetap-notes.test.js` (in no lock) | existed; **joined the set** unchanged |
| 24 | Japanese / Korean script never one-tap; preview always open; Worker refuses unpreviewed JA / KO text (`ai_off_jako_preview`), a JA / KO photo (`ai_off_jako_photo`) and auto requests even when previewed | `PC-JK-RESULTS.md`:27-31 | `pc-jako-policy.test.js` (in no lock) | existed; **joined the set** unchanged |
| 28 | One-tap allowance given back when a request is refused before a provider call | :177 | A3 (fails when the refund is removed) | existed |
| 29 | A changed provider chain turns one-tap off | :159-160, :364 | `lensiq-ai.test.js` (`LQAI.rememberedConsent`; outside the live-scan set) | existed |
| 30 | "Turn the pack" hint after a side read with nothing on the checklist | `PC-JK-RESULTS.md` §5 | `pc-live-turn.test.js` (in no lock) | existed; not locked |
| 31 | Monthly budget cap per Product Check feature: always set; over the cap refused before any provider call | owner decision 96; `backend/src/ai/gateway.js` (reserveBudget) | `pc-live-tap.test.js` T3 (gateway-wide budget tests in `backend-ai-gateway.test.js` are in no lock) | **added T3** |
| 25 | EN / ZH complete, 360 px without horizontal scroll, controls >= 44 px | :109 | e2e 10 | existed |
| 26 | Personal data to AI 0 on P7 / P7b | :71 | `live-leak-score.mjs` (locked measurement) | existed |
| 27 | First on-device result <= 1 s; AI fields <= 3 s | :139-147 | `live-measure.mjs` (measurement outside the repo, not a pass/fail test) | **no check added**: needs a real phone; a CI timing test would not be deterministic. Still open (4x proxy misses both for OCR / AI) |

- Locks: R1-R7 and the two joining files locked BEFORE the first run (commit `1ff1bd46`, field lock
  `locked-2026-11-17-release-criteria.sha256`). First run: R4 failed on the product (fixed, test unchanged); R5 and R6 failed
  on test setup (a regex against a JSDoc cast; a 2023 clock that made the gateway answer `not_configured`). Re-lock (2),
  setup only, no assertion loosened: commit `686e0bfe`, field lock `locked-2026-11-17-release-criteria-r2.sha256`.
- Owner decision 96 = ก (2026-11-18): `tests/unit/pc-live-tap.test.js` T1-T3 locked before the first run (commit `8f9e9c07`,
  field lock `locked-2026-11-18-tap-rule.sha256`). First run: T1, T2 pass; T3 failed on test setup (a 0.05 USD cap is not
  reached in 60 taps at 700 micro-USD each). Re-lock (2), cap 0.01 USD, no assertion changed: commit `896606c8`, field lock
  `locked-2026-11-18-tap-rule-r2.sha256`. The 6 / minute and 150 / day caps stay locked in A6 and R6.

Reviewer verified (independent, 2026-11-18): the release criteria were rebuilt from LIVE-SCAN-RESULTS.md and PC-JK-RESULTS.md, and every one maps to a check. No criterion lacks a check. Row 18 means "one round per tap" (pc_fields + pc_claims; per-product dedupe applies only to the removed automatic path). Already checked but not listed: allowance refund (A3), provider-chain change ends one-tap (lensiq-ai.test.js), JA/KO Worker rules (pc-jako-policy). The product was mutated in a scratch copy for 11 key mutations: auto photo (A7), 150/day (R6, twice), already-sent and consent (pc-live), tester gate (A1), JA/KO preview, Worker previewed and auto previewed (pc-jako-policy), scene cut (R4), fps (R1), note-to-person (onetap-notes); a twelfth, the allowance refund, was also caught (A3). Every one made a test fail. The test file was committed in the same commit as each lock line (cc638713 in 1ff1bd46, 0dfbb137 in 686e0bfe). Field lock files are new only (locked.sha256 untouched since Nov 12), and eval-guard repo shows 0 mismatches (244 files). Re-lock 2 changes are setup-only: R5 EQUAL, R6 EQUAL. The sameObject fix is a strict subset of the old match, so it only adds fresh readings; the e2e merge check is green. Unit pc/eval-guard/backend-pc 326/326; CI unit 2402/2402 and live e2e 10/10. Item 27 (timing) remains open pending a real phone.

Decision-96 tests T1–T3 (8f9e9c07, 896606c8) reviewed separately — see REVIEW.md addendum.

## Ledger lines land with the lock (owner decision 110 ก condition 4, 2026-11-18)

Three re-locks had no repo ledger line (2026-11-18): `lock` wrote only the copy name (`relock-8/tests/e2e/…`,
`relock1/cat-pages.test.js`), and a re-lock in `promo-basics.sha256` did not replace the older hash in the other lock
files. They were fixed by three late entries (owner decision 110 ก, below). The cause is fixed in `tools/eval-guard.mjs`:

- `lock <phase> <file>[=<repo path>|=-]` writes, in the same block of `evals-locks/<phase>.sha256`, one
  `<sha256>  <repo path>  # repo file (same commit as lock <UTC>; field: ~/LENSIQ-field/evals/<phase>/<rel>)` line for every
  field file whose repo copy it finds (a trailing part of its path, or the same unversioned name for code / JSON files under
  `tests/`, `tools/`, `docs/` or in the ledger; `a.test.r2.js` → `a.test.js`), or that is named after `=`. `=-` records
  `# field only <rel>`. It refuses and writes nothing when the repo copy differs, so the repo file is copied first and the
  lock, the field record and the ledger line go into one commit. Other lock files whose latest hash for that repo path is
  older get the same repo line appended (no cross-file conflict left behind).
- `repo` fails, for lock blocks stamped `# locked <UTC>` at or after `LEDGER_FROM` (2026-11-18T02:26:42Z): L1 a field lock
  whose file has a repo copy without a same-hash repo ledger line (or `# field only`); L2 a `# repo file` line without its
  field copy (a same-hash field line in that lock file, or a `field:` reference). On every line, a `field:` reference must
  name a hash line of `evals-locks/<phase>.sha256`, and a `late entry` line must carry one.
- `repo --field` (local only; CI has no `~/LENSIQ-field`) also checks on disk that every such field copy exists with that
  hash and is listed in its phase's `locked.sha256`. `repo --history` lists L1 gaps in blocks stamped before
  `LEDGER_FROM` (57 on 2026-11-18; reported, not failed: fixing them needs late entries, an owner decision).
- Tests: `tests/unit/eval-guard-ledger.test.js` (locked in `evals-locks/eval-guard.sha256` before the change), with negative
  controls: a field lock without its ledger line fails; a ledger line without its field copy fails; a late entry without a
  valid `field:` reference fails; `--field` fails on a missing, changed or unlisted field copy.

Late entries 2026-11-18 (owner decision 110 ก; additions only, each checked against the file and the field record):

| File | sha256 | Original re-lock | Commit | Field record | Appended to |
|---|---|---|---|---|---|
| `tests/e2e/line-wrap-exceptions.json` | 5515fb3d | line-wrap relock-8, 2026-11-17T20:54:01Z (`line-wrap.sha256:49`) | 9cc74c28 | `~/LENSIQ-field/evals/line-wrap/relock-8/…`, `locked.sha256:27` | `line-wrap.sha256` |
| `tests/unit/cat-pages.test.js` | fc67978e | promo-basics RE-LOCK 1, 2026-11-17T17:50:04Z (`promo-basics.sha256:12,15`) | 20526484 | `~/LENSIQ-field/evals/promo-basics/relock1/cat-pages.test.js`, `locked.sha256:5` | `fortune-no-demo.sha256` |
| `tests/unit/fortune-no-demo.test.js` | 047f5a00 | promo-basics RE-LOCK 1, 2026-11-17T17:50:04Z (`promo-basics.sha256:13,16`) | 20526484 | `~/LENSIQ-field/evals/promo-basics/relock1/fortune-no-demo.test.js`, `locked.sha256:6` | `fortune-no-demo.sha256` |

`fortune-no-demo.sha256` held the older hashes of both files, so the new line there supersedes the older entries in
`crisis-v3.sha256` and `crisis-rules-1323.sha256` too. After: `eval-guard repo` 0 mismatches.

## Lock records reconciled 2026-11-18

Merge of main 8a0f5c7d into eval-guard-repo (commit a7552075; conflicts in `fortune-honest.sha256` and `merit.sha256`
resolved append-only: this branch's lines, then main's). `eval-guard repo` then showed 8 mismatches; coordinator option ข
(2026-11-18): reconcile each with evidence. Lines appended only; no test file changed.

| # | File | Mismatch | Evidence | Bytes vs old lock | Action |
|---|---|---|---|---|---|
| 1 | `tests/e2e/crisis-net-hotfix-e.e2e.mjs` | `crisis-net-hotfix.sha256` latest f312ef6b vs `crisis-v3.sha256:141` / `crisis-net-hotfix-r2.sha256:16` 1363d3d1 (= file) | v2 f312ef6b commit e4c15069; relock-merge 11621c93 commit 58c9a850 (`crisis-v3.sha256:96-105`, CRISIS-V3-RELOCKS.md row 95, owner decision 2026-11-17 crisis v3); relock-fix-2 1363d3d1 commit 44f8d16f (`crisis-v3.sha256:138-141`, row 137, test fault). Field copies: `crisis-net-hotfix-r2/crisis-net-hotfix-e.v2.e2e.mjs`, `crisis-v3/relock-merge/`, `crisis-v3/relock-fix-2/` | WEAKER in letter vs f312ef6b, by owner decision (E2 / E4 card and no-shuffle become the v3 crisis state with no card; E5 accepts the top-bar tel:1323 when no reading is shown); "no daily / siamsee / share" and the 44 px tel:1323 kept | re-lock line in `crisis-net-hotfix.sha256` pointing to `crisis-v3.sha256:141` |
| 2 | `tests/e2e/crisis-net-hotfix-inventory.json` | latest lock 074e8b3d, file f3c0caaa, no repo record | changed in commit 4fbec46c (crisis escape guard findings); `git show 4fbec46c`: 79 lines added, 0 removed (compat inputs `#cpNick0` … with `covered_by`); parent bytes = field copy `crisis-net-hotfix-r2/crisis-net-hotfix-inventory.json` (074e8b3d); new bytes locked as field copy `crisis-escape-guard/crisis-net-hotfix-inventory.v4.json` (`crisis-escape-guard.sha256:9`, 2026-11-17T03:33:13Z) | STRICTER (rows added only) | "late record" re-lock line in `crisis-net-hotfix.sha256` |
| 3-6 | `tests/e2e/crisis-v3-pre.e2e.mjs`, `-pre-en`, `-pre-zh`, `tests/unit/crisis-v3-pre.test.js` | locked (`crisis-v3.sha256:114-120`), not in the repo | deleted in f45b9aa7, owner decision 84 = ก (option ข pre-line and `LENSIQ_CRISIS_PRELINE` removed; CRISIS-V3-RELOCKS.md:144). Successors, all present and locked: `crisis-v3-a/b/c/d.e2e.mjs`, `crisis-v3.test.js` U3 / U4 (`crisis-v3.sha256`), `crisis-rules-1323*.e2e.mjs` / `crisis-rules-1323.test.js` / `-g.test.js` (`crisis-rules-1323.sha256`) | n/a (removed feature; rule d "closing line only at the end" stays asserted) | `# retired` lines in `crisis-v3.sha256` |
| 7 | `tests/unit/crisis-v3-r2.test.js` | locked (`crisis-v3.sha256:165`), not in the repo | renamed in 08ec51f6 to `tests/unit/crisis-net-fallback.test.js`, same bytes 1c430554 (`crisis-v3.sha256:170-171`, CRISIS-V3-RELOCKS.md:169) | EQUAL (same bytes) | `# retired` line in `crisis-v3.sha256` |
| 8 | `tests/unit/face-capture-r2.test.js` | locked (`face-capture.sha256:25`), not in the repo | renamed in 9f255cdb to `tests/unit/face-capture-stability.test.js`, same bytes 7edcbeb9 (`face-capture.sha256:30-32`) | EQUAL (same bytes) | `# retired` line in `face-capture.sha256` |

After: `node tools/eval-guard.mjs repo` OK, 0 mismatches (293 locked repo files, 12 retired, 2 pending).

## Known issues in locked files

Locked files are not edited. Known problems are recorded here and fixed in the next set.

- `fortune-honest__fresh-2026-11-14c`: 14c analyze.mjs crashes on rule-f fails without `where`; review 4 used a
  null-safe copy differing in two lines; fixed in 14d. (`fortune-honest__fresh-2026-11-14d/analyze.mjs` shows such a
  fail as `flow`; the pass logic is unchanged.)

## ภาษาไทย

กฎของเจ้าของ (13 พ.ย. 2026): ชุดทดสอบหรือชุดวัดผลที่ล็อกแล้วทุกชุดต้องเก็บไว้ที่ `~/LENSIQ-field/evals/<phase>/`
และต้อง commit ค่า sha256 ของทุกไฟล์ไว้ใน repo ที่ `evals-locks/<phase>.sha256` ก่อนวัดผลครั้งแรก เครื่องมือวัดผลทุกตัวจะเรียก
`tools/eval-guard.mjs` ก่อน ถ้าไฟล์ไม่อยู่ในโฟลเดอร์นั้น ถ้า hash ไม่ตรงกับที่ commit ไว้ หรือถ้าไฟล์ล็อกยังไม่ได้ commit
เครื่องมือจะไม่วัดผล ชุดที่อยู่แค่ในเซสชันของ agent หรือในโฟลเดอร์ชั่วคราวไม่นับเป็นชุดที่ล็อกแล้ว
ใช้คำสั่ง `node tools/eval-guard.mjs lock <phase> <ไฟล์>` เพื่อล็อก แล้ว commit ไฟล์ใน `evals-locks/` และใช้คำสั่ง
`node tools/eval-guard.mjs check <phase> <ไฟล์>` เพื่อตรวจ ผู้ตรวจอิสระที่เขียน harness ไว้นอก repo ต้องรัน check ก่อนวัดผล
และแนบผลลัพธ์ทั้งหมดไว้ในรายงาน
ชื่อ phase ต้องเป็นตัวพิมพ์เล็ก คำสั่ง `node tools/eval-locks-import.mjs` คัดลอกไฟล์ล็อกที่อยู่ข้างชุดข้อมูลเข้ามาใน `evals-locks/`
โดยเพิ่มบรรทัดต่อท้ายเท่านั้น ไม่แก้หรือลบบรรทัดเดิม และรายงานไฟล์ที่หายไปหรือไฟล์ล็อกที่ถูกเขียนทับ
- `fortune-paid` (2026-11-15): locked before `fortune-paid.js` existed (unit 0/1). The e2e file was re-locked once after its
  first run, test-setup fixes only (readings without in-depth text have nothing to sell, so they now must show no paid block and
  no price, with a coverage minimum instead; tab-free pages added; crisis groups found by element; the off snapshot waits for
  the page's own Thai line breaking). The reason is written in `evals-locks/fortune-paid.sha256`. Unit file unchanged.
- `fortune-paid` re-lock (2) (2026-11-15): after the independent review of ed6a0a6 (NOT OK, F1 belief remedies paid-only,
  F2 flying stars 2/5 and avoid-warnings paid-only), two NEW files were locked before the fix
  (`tests/unit/fortune-paid-guidance.test.js`, `tests/e2e/fortune-paid-guidance.e2e.mjs`). Before the fix: unit 2 pass / 3
  fail (306 + 133 readings). Earlier locked files unchanged.
- `fortune-paid` re-lock (3) (2026-11-15): round-2 review of ce6dc1c NOT OK (guidance still paid outside known wordings). New
  file `tests/unit/fortune-paid-provenance.test.js` locked before the fix: the gate is provenance (guidance fields of the facts,
  caution-marked paragraphs, restraining / caution items), not word lists. Before the fix: 2 pass / 2 fail (645 readings).
- `fortune-paid` re-locks (4)–(6) (2026-11-15): (4) plan / conversion / funnel tests locked before the build (owner order
  2026-11-15 (2)); (5) recommended-sources tests, reason "owner decision 2026-11-15 replaces Remedies and merit"
  (decision 46 ก; no earlier assertion encoded the old rule, every hard-limit test kept); (6) plan e2e test-setup fix after its
  first run (the ladder is checked only on readings with offers; no offers = no panel and no price, now asserted).
- `fortune-paid` re-lock (7) (2026-11-15): round-3 review of 826bbd9 NOT OK. New `tests/unit/fortune-paid-negstate.test.js`
  locked before the tags; the plan unit / e2e tests changed by the coordinator's round-3 order (199 row only with monthly
  content; made-for headline only in Thai, never on astro / bazi). Reason in `evals-locks/fortune-paid.sha256`.
- `fortune-paid-fresh-2026-11-16` / `-16b` (2026-11-16): fresh synthetic sets for the two fortune-paid leak counts
  (`tools/fortune-paid-leaks.mjs`). Set (a) was measured once before any change (A 261 readings / 281 parts, B 7 / 7) but its
  Thai detector matched ท้อ inside สะท้อน (181 parts) and ลังเล inside อย่าลังเล; set (b) has new inputs and only those two
  patterns fixed. Set (b): before A 85 / 86, B 12 / 12; after A 0 / 0, B 0 / 0 (2,700 readings). `fortune-paid` re-locks
  (8)–(9): affiliate label test; the seller-link global became `LQ_FORTUNE_SELLER_LINKS` (it collided with the back
  office citation list `LQ_FORTUNE_SOURCES`).
- `fortune-paid-review-2026-11-16` (2026-11-16): the independent reviewer's fresh set (1,260 readings), imported by copying
  its `locked.sha256` as is (`tools/eval-locks-import.mjs` stopped on an unrelated missing file in `pc-f/review`). Re-measure
  only; never tuned against. The builder's 0 / 0 on `fortune-paid-fresh-2026-11-16b` came after tuning on that set and is not
  an independent number. `fortune-paid` re-lock (10): review D1–D3 and the switch-off identity test, before the fix.
- `seller-settings` (2026-11-18): owner order "needed for selling" (seller details page + quotation / invoice / receipt).
  Three files locked before `backend/src/seller.js`, `backend/src/price-list.js`, migration `0021_seller.sql` and
  `admin-seller.js` existed: `tests/unit/backend-seller.test.js` (S1–S11), `tests/integration/backend-seller-workerd.test.mjs`
  (workerd + real D1) and `tests/e2e/admin-seller.e2e.mjs` (real browser, Chrome print-to-PDF read back with pdf.js).
  Before the build: unit 0 pass / 11 fail, integration 0 / 1. Synthetic values only.
- `seller-settings` re-lock A1 (2026-11-18): `tests/integration/backend-seller-workerd.test.mjs`, test setup only: the
  installed Miniflare 5.x rejects `handleRuntimeStdio`; workerd's console is captured through `handleStructuredLogs`
  (a canary `console.log` was confirmed captured). No assertion changed; reason in `evals-locks/seller-settings.sha256`.
- `seller-settings` re-lock A2 (2026-11-18): `tests/e2e/admin-seller.e2e.mjs`, test setup only: pdf.js returns Thai
  above / below marks from Chrome's PDF as U+0000, so the Thai phrase is compared without those marks on both sides. The
  other failure of that run (320 px overflow) was fixed in the product. Reason in `evals-locks/seller-settings.sha256`.
- `seller-settings` re-lock (3) (2026-11-18): independent review of 13cf281 NOT OK (issued documents not fully frozen; list
  query count over the Free-plan limit; logo copied per document; minor items). New files `tests/unit/backend-seller-r1.test.js`
  (R1–R8) and `tests/integration/backend-seller-workerd-r1.test.mjs` (log-sink canary) locked before the fixes: unit 0 / 8.
- `seller-settings` re-lock (4) (2026-11-18): round-2 review OK on 69d36fe with low items; `tests/unit/backend-seller-r2.test.js`
  (H1 health probe, U2 unavailable-line note, V3 VAT fixed at 7 %) locked before the fixes. Earlier files unchanged.
- `seller-settings` rename (2026-11-18, file names only, bytes identical): `tests/unit/backend-seller-r1.test.js` is now
  `tests/unit/backend-seller-frozen-docs.test.js` and `tests/unit/backend-seller-r2.test.js` is now
  `tests/unit/backend-seller-health.test.js` (`tests/unit/unit-index.test.js`: no round-named unit files). The header line
  inside each file still names the old file (content unchanged). Lock lines for the new paths: owner, OWNER-LINES-MORNING.md.

### Incident 2026-11-18: seller-settings field copies overwritten in place (recorded 2026-11-19, owner decision 131 ก)

On 2026-11-18 the seller team overwrote two field copies in ~/LENSIQ-field/evals/seller-settings/ in place (rule: never modify existing field files): admin-seller.e2e.mjs (locked 56641e63248214c9e9da98127e56f30d9f59d1e92200f27d19eb08e3905ed859, now d925c82e3d65c07096d572dc768df6e7f9cf1591588b12ed72488ae18aa64182) and backend-seller-workerd.test.mjs (locked 19ba8bf4082ccdb088123a85c29bc6a4dae38aa8c447c942a79e25765b5d2775, now 2e462d60ee01710e3268d3e2a9df600922ada6ffb99913cec1c00f2c17f4e1a7). The original bytes were restored from git 88f09055 into the new folder ~/LENSIQ-field/evals/seller-settings/restored-88f09055/ by the owner on 2026-11-19; the overwritten files were left as they are. Lock lines are unchanged.
