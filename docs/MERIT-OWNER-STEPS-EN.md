# Owner steps (English companion): importing the two Merit files

The Thai page `docs/MERIT-OWNER-STEPS-TH.md` is the master (accounts, review, publishing, route switch). This page repeats only the two
imports, in English, so the files cannot be mixed up. Button names are the real back-office names (Thai, with the English label in brackets).

## The files

| Step | File to import (outside the repo) | Batch id | Items | sha256 starts | Command |
|---|---|---|---:|---|---|
| B | `~/LENSIQ-field/merit-content/drafts-2026-11-12.json` | `merit-108-2026-11-12` | 108 | `add26961` | `npm run merit:import:drafts` |
| E | `~/LENSIQ-field/merit/places-2026-11-14-notes.json` | `places-2026-11-14-notes` | 35 | `ff9e14de` | `npm run merit:import:places` |
| none | `~/LENSIQ-field/merit/places-2026-11-14.json` (the original; never edited or moved) | `places-2026-11-14` | 35 | `d25262ac` | (none) |

- The `-notes` file is the complete replacement for the original places file: the same 35 places, with the reviewer warnings added to the
  back-office note (the yellow box). **Import the -notes file instead of the original. Do not import both**: every place would appear twice.
- `npm run merit:import:...` imports nothing. It checks the file on this computer, prints the file, batch id, item count and sha256, asks you
  to type the batch id, and records the batch in `~/LENSIQ-field/merit/import-ledger.json`.
- It stops with `REFUSED <code>` when: the command and the file do not match (`kind_mismatch`: drafts and places swapped); the file has no batch
  id (`batch_missing`); an item is of the wrong kind (`item_kind`) or fails validation (`item_invalid`); the batch id and item count disagree
  (`batch_count`); the batch was already confirmed (`already_confirmed`); the file differs from what was confirmed under that batch id
  (`file_changed`); or the other places batch (original or -notes) was already confirmed (`same_places_other_batch`). On any REFUSED, stop and
  send the message to the assistant. To look again without importing, add `--idempotent-confirmed` (the back office also refuses a second import).
- The back office shows **ไฟล์ที่นำเข้าแล้ว:** (Files already imported) under the import buttons: `batch id · items · date`.
- The coordinator must have run `npm run backend:migrate` (migration 0019) and `npm run backend:deploy:test` first. If not, the check step shows
  an error and nothing is written; stop and tell the coordinator. You sign in as the owner; every imported item arrives as a draft.

## B. Import the 108 drafts (once)

1. In a terminal in the project folder run `npm run merit:import:drafts`. The screen must show `batch:   merit-108-2026-11-12`, `items:   108`,
   `sha256:  add26961…`, `checks:  108 of 108`, then "Type the batch id". Type `merit-108-2026-11-12`, press Enter, and see `confirmed:`.
2. Back office, tab **คำแนะนำตามความเชื่อ** (Belief guidance): the line **ไฟล์ที่นำเข้าแล้ว:** (Files already imported) must not list `merit-108-2026-11-12`.
3. In **ไฟล์ร่าง (JSON)** (Drafts file) choose `drafts-2026-11-12.json` from the `merit-content` folder.
4. Press **ตรวจไฟล์ก่อนนำเข้า** (Check the file before importing); enter your password and the 6-digit code. Expect "Ready to import 108 item(s)" and no "did not pass".
5. Press **นำเข้าเป็นร่าง** (Import as drafts) within 5 minutes. Expect "108 item(s) imported as drafts".
6. Check in the back office: the imported line lists `merit-108-2026-11-12 · 108 items`; the filter **แสดงสถานะ** (Show status) = **ร่าง (รอตรวจ)**
   (Draft, waiting for review) shows 108 items; **ดูและตรวจ** (View and review) on any item shows its sources and three languages.

## E. Import the 35 places (once, the -notes file instead of the original)

If `places-2026-11-14-notes.json` does not exist yet: `npm run merit:notes` builds it from the original and never touches the original.

1. In a terminal run `npm run merit:import:places`. The screen must show `batch:   places-2026-11-14-notes`, `items:   35`, `sha256:  ff9e14de…`,
   `checks:  35 of 35`. Type `places-2026-11-14-notes`, press Enter, and see `confirmed:`. `REFUSED kind_mismatch` means the wrong file: stop.
2. Back office, tab **คำแนะนำตามความเชื่อ**: **ไฟล์ที่นำเข้าแล้ว:** must list `merit-108-2026-11-12` (if step B is done) and must not list
   `places-2026-11-14` or `places-2026-11-14-notes`.
3. In **ไฟล์ร่าง (JSON)** choose `places-2026-11-14-notes.json` from the `merit` folder. Not `places-2026-11-14.json`, not `drafts-2026-11-12.json`.
4. Press **ตรวจไฟล์ก่อนนำเข้า**: expect "Ready to import 35 item(s)", no "did not pass". Then **นำเข้าเป็นร่าง** within 5 minutes: "35 item(s) imported as drafts".
5. Check: the imported line lists `places-2026-11-14-notes · 35 items`; drafts grow by 35 (143 with the 108 set); **ดูและตรวจ** shows a yellow box
   starting "ผู้ตรวจโปรดตรวจ:" (Reviewer, please check) with the warning for the item's source level (14 official source not yet opened, 13 secondary,
   8 word of mouth) before the writer's own note.
6. The 14 "official source, page not opened" items: a reviewer opens the official link in a browser and, if it matches, presses **เปิดอ่านหน้าทางการแล้ว:
   ยกระดับเป็นแหล่งทางการ** (opened the official page: raise to official). The official-source label is allowed only after that.
7. Place-specific warnings to settle before approving: the Ganesha shrine (CentralWorld or Huai Khwang), the Phaya Sri Satta Nakharat naga (fire on 28 Oct 2026,
   is it open), the King Rama V equestrian statue (royal vocabulary), Phra That Nakhon (exact temple name), the Chao Mae Soi Dok Mak shrine (inside Wat Phanan
   Choeng, already in the 108 set). The 8 word-of-mouth items must keep their marker words in all three languages.
