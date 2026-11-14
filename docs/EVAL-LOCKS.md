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
