# PDPA note — S2-E1 MCQ answer-sheet grader (`omr.html`)

For the owner's counsel (pre-sale review). Draft by the builder; not legal advice.

## What the feature does
A teacher creates an exam (20 / 40 / 60 / 100 questions, 4 or 5 choices, optional student-number bubbles), prints
an A4 answer sheet, enters the answer key, and scans filled sheets with a phone camera (or chooses photos from the
device). The page finds the four black corner squares, straightens the picture (perspective correction) and measures
how dark each bubble is. It shows a score, flags questions with several or faint marks, lets the teacher correct any
bubble, and gives item analysis (difficulty, discrimination, KR-20) and CSV exports.

**No AI and no faces.** Reading is plain arithmetic on pixel brightness in `lensiq-omr.js`; no model is loaded, no
face detection or recognition, no emotion / behaviour / attention analysis. A unit test asserts that the page code
uses no AI / face / network APIs and that no image is written to storage. The camera is pointed at paper; if a person
appears in the frame nothing about them is processed or kept.

## Personal data involved
| Data | Where | Default | Retention |
|---|---|---|---|
| Camera frames / chosen photos of answer sheets | memory only, read and dropped | never stored, never uploaded | n/a |
| Straightened gray picture of each scanned sheet (for the review screen) | memory only (JS Map) | not stored | gone when the page is closed / reloaded |
| Exam title, answer key | localStorage `lqomr-v1` | yes | until "delete exam" / "delete all" |
| Per sheet: answers read, flags, student number (as bubbled; teacher can edit), optional name typed by the teacher, scan time, which answers were corrected by hand, score | localStorage `lqomr-v1` (plain text) | yes | until the teacher deletes the sheet, the exam, or all data |
| CSV exports (scores, item analysis) | files the teacher saves deliberately | on tap | outside LENSIQ's control |

Nothing leaves the device: no upload, no server call, no analytics events from this page's own scripts (the site's
shared nav / analytics opt-in applies as on every page).

## Points for counsel
1. **Controller / purpose** — the school (or teacher) is the controller; purpose is assessment. LENSIQ provides
   software running on the teacher's device and receives no data. Basis is likely the school's public task /
   contract (s.24(3)/(4)) or legitimate interest (s.24(5)); counsel to confirm for private tutoring schools.
2. **Minors (s.20)** — most data subjects are minors. Design minimises data: student number by default, the name
   field is optional and typed by the teacher, no images kept, no faces processed. The page tells teachers to delete
   data once scores are entered into the school system. Consider whether consent of parents is ever needed (likely
   not for routine assessment by the school, but counsel to confirm).
3. **Accuracy / human decision** — scores are computed automatically from marks; the teacher reviews flagged sheets
   (several marks, faint marks, unreadable or duplicate student number, unknown sheet format) and confirms. Item
   analysis hints ("check the key") are suggestions only; the key is never changed automatically. Is a disclaimer in
   the terms needed that final grades are the teacher's responsibility?
4. **Storage not encrypted** — scores and student numbers in localStorage are plain text on the teacher's device.
   Mitigation today: device-local, delete buttons, screen-lock advice. Deferred option: encrypt with the LQVault key
   used elsewhere.
5. **Shared devices** — a school tablet shared between teachers would expose other teachers' exams. Deferred option:
   per-teacher PIN / profiles.
6. **Exports** — CSV files contain student numbers, names (if typed) and scores; once saved they are the school's
   responsibility (formula-injection safe, UTF-8 BOM).

## Deferred (not built in this round)
- Encrypted-at-rest storage of scores; per-teacher profiles.
- Multiple exam versions (form A / B) on one key; negative marking.
- Reading a handwritten name (OCR) — deliberately not done (more personal data, needs a model).
