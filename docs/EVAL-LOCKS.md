# Eval locks: locked sets persist

Owner rule 2026-11-13, written after a locked test set was lost twice.

## The rule

1. Every fixed test or eval set is written to `~/LENSIQ-field/evals/<phase>/` before anything is measured. A set that
   lives only in an agent session, a temp folder, a scratchpad or a worktree does not count.
2. Its sha256 is committed in the repo, in `evals-locks/<phase>.sha256`, before anything is measured.
3. Every measuring harness calls `tools/eval-guard.mjs` first. The guard refuses to measure unless each input file is
   under `~/LENSIQ-field/evals/<phase>/` (symlinks resolved), its sha256 is in `evals-locks/<phase>.sha256`, and that
   file is committed with no uncommitted change.

`<phase>` is the folder name under `~/LENSIQ-field/evals`. Nested folders use `a__b`, so `evals/nutrition/v5` is
`nutrition__v5`.

## Commands

```sh
# lock: appends "sha256  path  # locked <UTC>" to ~/LENSIQ-field/evals/<phase>/locked.sha256 and
# evals-locks/<phase>.sha256 (append-only, earlier lines are never rewritten), then prints the git command
node tools/eval-guard.mjs lock <phase> <files...>
git add evals-locks/<phase>.sha256 && git commit -m "evals-locks: lock <phase>"

# check: exit 0 = every file is locked and committed; exit 1 = refused, with every reason on stderr
node tools/eval-guard.mjs check <phase> <files...>
```

Files are absolute or relative to `~/LENSIQ-field/evals/<phase>/`. To fix a set after locking, write a new phase
folder (for example `nutrition/v6`) and lock it. Don't edit a locked file. A new hash line is appended only for a
documented re-lock made before any measurement.

In code: `import { assertLocked, phaseOf } from "./eval-guard.mjs"`, then call
`assertLocked(phaseOf(dir), ["set.json", ...])` before scoring. It throws an error that names every missing item.
`tests/unit/eval-guard.test.js` fails if a `tools/*eval*.mjs` that reads from `~/LENSIQ-field/evals` does not call it.

## Harnesses wired (2026-11-13)

| Harness | Phase | Files checked |
|---|---|---|
| `tools/nut-eval.mjs` | from `--set` (`nutrition`, `nutrition__v2`…`v5`) | `set.json`, `score.mjs`, every image it reads |
| `tools/exam-hall-detector-eval.mjs --run / --from` | `hall-detector` | `manifest.jsonl` (the images have one aggregate hash and are deleted after a run) |
| `tools/pc-advert-eval.mjs --fresh` | from the folder (`adverts__fresh`, `adverts__fresh2`) | `blind-input.jsonl`, `labels-A.jsonl`, `labels-B.jsonl` |

`tools/exam-hall-face-eval.mjs` reads only the measurement-only vendor files from `evals/exam-followups/vendor`, and
the tool pins their sha256. Its image set is outside `evals/`, so it is not wired. The static test checks that this
stays true.

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

## ภาษาไทย

กฎของเจ้าของ (13 พ.ย. 2026): ชุดทดสอบหรือชุดวัดผลที่ล็อกแล้วทุกชุดต้องเก็บไว้ที่ `~/LENSIQ-field/evals/<phase>/`
และต้อง commit ค่า sha256 ของทุกไฟล์ไว้ใน repo ที่ `evals-locks/<phase>.sha256` ก่อนวัดผลครั้งแรก เครื่องมือวัดผลทุกตัวจะเรียก
`tools/eval-guard.mjs` ก่อน ถ้าไฟล์ไม่อยู่ในโฟลเดอร์นั้น ถ้า hash ไม่ตรงกับที่ commit ไว้ หรือถ้าไฟล์ล็อกยังไม่ได้ commit
เครื่องมือจะไม่วัดผล ชุดที่อยู่แค่ในเซสชันของ agent หรือในโฟลเดอร์ชั่วคราวไม่นับเป็นชุดที่ล็อกแล้ว
ใช้คำสั่ง `node tools/eval-guard.mjs lock <phase> <ไฟล์>` เพื่อล็อก แล้ว commit ไฟล์ใน `evals-locks/` และใช้คำสั่ง
`node tools/eval-guard.mjs check <phase> <ไฟล์>` เพื่อตรวจ ผู้ตรวจอิสระที่เขียน harness ไว้นอก repo ต้องรัน check ก่อนวัดผล
และแนบผลลัพธ์ทั้งหมดไว้ในรายงาน
