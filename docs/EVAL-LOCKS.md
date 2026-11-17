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
