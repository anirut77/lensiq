# Acceptance scores, round 1 (2026-11-18), against the locked sheets

The sheets are locked in `evals-locks/acceptance.sha256` at 2026-11-18T16:16:40Z (commit `a87ca898`, file sha256
`60831056…bd13`), before this scoring. The scoring rules are in `README.md`.
- **What was scored:** `origin/main` `a9950944`. The main CI run 44304148695 was green (2026-11-18 12:27Z) and Pages
  deploy 44313219619 also passed.
- **No new measurement was run.** Every point comes from existing tests, CI, locked-set results, docs or reviewer
  reports.
- **M** = measured, with source and date. **E** = estimated, with the reason. The estimated points included in each
  score are given below.
- **Not confirmed.** No product has been confirmed by an independent reviewer against these sheets yet, so **no product
  is "above 90"**.

## Score table

| # | Product | Score /100 | Measured share | Top 3 gaps (points) | Reachable max without outside input | What the owner or outside must provide |
|---|---|---|---|---|---|---|
| 1 | Attendance PIN/QR | **61** | 71 % | A1 time-maths locked set missing (15); S2 PIN path loads face models, not timed (4); L3 CSV / badge language untested (3.3) | **94** | pilot site 5–20 staff + payroll records (A2); one real-phone run |
| 2 | Exam lab | **59** | 74 % | A5 field precision / noise (12, pilot); A1 face found 85 % vs ≥ 98 % (8); P3/P4 WebKit and 430 px missing for exam.html + dashboard (6) | **86** — cannot reach 90 without a field pilot | pilot institution (A5); owner decision on Wilson ≥ 70 %; counsel B1/C2 |
| 3 | Face reading | **72** | 81 % | X print/share not on main (6); C1+C2 consistency sets missing (10); Q2 cut summary text ~12 % TH (5) | **95** | practitioner review (Q3); owner approval of the print PDFs; face-api licence F5/F6 (blocks sale, not score) |
| 4 | Compatibility | **57** | 68 % | H hard-limit probes not run on compat (10); X print/share (6); Q1+Q2 depth / cut text unmeasured (10) | **94** | practitioner review (Q3); source-licence confirmation |
| 5 | Other fortune pages (lowest page) | **69** (tarot; pages 69–76) | ≈ 80 % | X print/share (6); E bad-input tests + crash guard (6); Q2 cut text (5) | **94** | practitioner review per page (Q3); owner: PDFs, depth branch, cut-text rule, straight mode |
| 6 | Auspicious-date planner | **56** | 69 % | Q2 practitioner review of rules (10); C1 rule locked set (7); P4/P5 (4) | **88** — cannot reach 90 without a practitioner review | practitioner review; owner approval of occasions screenshots |
| 7 | Studio + photobooth | **39** | 83 % | A1 no-outfit defect 20–31 % vs ≤ 5 % (20); F photobooth e2e / camera-off / 404 call (7.5); **gate G fails**: `?faceparse=1` not locked off (10) | **78** | consented portrait set + ≥ 2 blind raters; paid cloud for realistic outfits |
| 8 | Nutrition label | **72** | 74 % | A4 real label photos (16); P4/P5 (4); S2 untimed on phone (3.5) | **82** | ≥ 200 real label photos (the owner can take them) |
| 9 | Pet reading | **0 on main** (≈ 34 on branch `fortune-pet`) | — | not merged (CI failed); H probes not run; Q weak sources | **94** after merge | licence-clear pet sources; owner go-live; practitioner review |
| 10 | Product Check | **50 (capped; sum 59)** | 86 % | **gate G fails**: pc-jk 29 personal values sent on explicit send after preview (target 0); A1/A3/A4 locked targets missed (16); A6 field (6) | **90** on paper; three engineering targets have missed for several rounds | Thai FDA / TMT permission (L13, L29); 100-box pharmacist pilot; real advert screenshots; paid AI key (P8) |
| 11 | Crowd | **58** | 67 % | A1–A3 human-counted reference missing (22); A4 no dense-scene warning (6); P4/P5 (4) | **70** | two human counters for the locked clips; event site; real phone. Dense crowds: research |
| 12 | Look + salon | **36** (sum under the cap; **gate G1 fails**) | 74 % | F only 2 of 8 look types (15); **G1**: 4 misspelling variants pass the lint (15); A2 real faces (8) | **85** | ≥ 20 consenting adult volunteers; real phone (fps); salon approvers |
| 13 | Gate | **65** | 72 % | A1 field exact read (15); A2 taps ≤ 10 % on owner photos (8; public 78 %); E crash guard on gate.html + no-frames (2.8) | **75** | ~100 owner plate photos; Thai-trained YOLOX-nano file; car-park + village pilot; L24 |
| 14 | Exam hall | **42** | 48 % | A1–A3 mock-exam recall / false alerts (28); F standing signal (3.3); X log export untested (8) | **70** | mock exam with 6–10 volunteers. Small faces / seated people in a hall: research |
| 15 | Clothing try-on | **48** | 70 % | A1 synthetic set not independent of code offsets (10); A2 real people (10); A3 cloud realism (10) | **76** | paid cloud provider; ≥ 24 volunteers; ≥ 220 garments with rights; R2 |
| 16 | Personal Colour | **0** | 55 % | no page (F 15); A1–A4 fail on the paper round (undertone 1.1 % vs ≥ 80 %) (35); A5 real people (5) | **58** (page items only; accuracy needs research) | research on colour under changing light; ~30 volunteers under real lights; colour charts; owner target decision |
| 17 | OMR answer sheets | **pending measurement** (non-accuracy part 40 / 60) | — | A1–A10 not measured yet (OMR team's locked set in progress); G network-hook test missing (10); P4/P5, no-frames | **95** (A10 real sheets out) | real filled answer sheets from a school, with permission |

## Per-criterion notes

Format: criterion points / weight, tag, source. Only the criteria that lost points, or that are estimates, are listed.

1. **Attendance**
   - F 21.9/25 M: iPhone Safari badge scan is missing (`BarcodeDetector`, `docs/LAUNCH-READINESS.md:113`).
   - A1 0/15 E: the unit tests pass, but there is no locked set.
   - A2 0/5: pilot.
   - P 6/10 M: no 430 px flow test; no real-phone record.
   - L 6.7/10: L3 untested.
   - S 4/8: S2 not timed. The page is 9.5 MB, with TTI 26.3 s (`docs/SPEED.md`, 2026-11-14).
   - E 8/10: storage warning untested.
   - X 4.7/7: no badge-print test.
   - G 10 M.
2. **Exam lab**
   - A1 0/8 M: 85 % (22/26), Open Images held out, 2026-11-10, `docs/exam/FACE-ENGINE-RESULTS.md`.
   - A2 0/4 E: not measured.
   - A3, A4 M.
   - A5 0/12: pilot.
   - P 4/10 M.
   - L 5.3/8 (L3 E).
   - S 3.5/7.
   - E 3.2/8 M: crash guard is not on exam-dashboard; no-frames covers attendance only.
   - X 7 (candidate log E).
   - G 10 M.
3. **Face reading**
   - C1 and C2 0/10 E: no locked sets.
   - V 15 M: REVIEW-protect PASS 2026-11-18; crisis-v3 merged and deployed.
   - H 10 M: 60/60, 2026-11-12.
   - Q2 0/5 M: RECHECK-86c, about 12 % of TH readings cut on live main.
   - Q3 0/5: not run.
   - P 10 (P4 E): owner phones 10/10, 2026-11-17.
   - S 2.5/5.
   - X 0/6 M: print and share are only on branch `print-report`.
4. **Compatibility**
   - H 0/10 E: no probe set includes compat.
   - Q1 and Q2 0/10 E: not audited.
   - P 8/10.
   - L 5.3/8: not in `fortune-zh`.
   - S 0/5 M: the page has no budget.
   - E 4/6 M: no crash guard.
   - X 0/6.
5. **Fortune pages.** These use the shared base: F 15, C 10, V 15, H 10, Q1 5 (all M). Then:
   - Q2 0 M (all pages).
   - Q3 0 (all pages).
   - P: 8 on pages with a free-text field, 6 on crisis-d-only pages.
   - L: 8 on pages in `fortune-zh`, 5.3 otherwise.
   - S: 2.5. The hub (0.4 KB headroom on 2026-11-17) and luckycolor (0 KB) fail S1's ≥ 2 % headroom and get 0.
   - E: 2 on palm (crash guard), 0 elsewhere.
   - X: 0 (all pages).

   | Page | Score |
   |---|---|
   | palm | 75.5 |
   | fortune hub | 74 |
   | horoscope | 73.5 |
   | iching | 73.5 |
   | numbers | 73.5 |
   | dream | 73.5 |
   | fengshui | 71.5 |
   | zodiac | 71.5 |
   | astro | 71.5 |
   | luckycolor | 71.3 |
   | report | 70.8 |
   | bazi | 68.8 |
   | taksa | 68.8 |
   | lek7 | 68.8 |
   | lifegraph | 68.8 |
   | **tarot** | **68.5** (Q1 fails on main: folded depth 64.5; the fix is on `fortune-depth`) |
6. **Planner**
   - F 12.5/15: occasions are on a branch.
   - C1 0/7 E.
   - Q1 0/5 M: no source list on main.
   - Q2 0/10.
   - P 6/10.
   - L 5.3/8.
   - S 2.5/5: 759/780 KB.
   - E 0/6 E.
   - X 2/6: iCal only.
7. **Studio + photobooth**
   - F 12.5/20: no photobooth e2e; D2-007; D2-011.
   - A1 0/20 M: AI-rated, not blind, so it is also not a valid A1 measurement.
   - A2 5 M.
   - G 0/10 M: `?faceparse=1` is not locked, per `docs/CTO-BRIEF.md` §2. The gate fails, so the score is capped at 50; the
     sum is 39.
8. **Nutrition**
   - A1–A2 M: locked v5, synthetic, 2026-11-13.
   - A3 4/4 E: I4 exact 91.2 % is used as a proxy for I1.
   - A4 0/16: no real photos.
   - P 6/10.
   - S 3.5/7.
   - E 6.4/8: no-frames untested.
9. **Pet reading**
   - Main: the page does not exist.
   - Branch estimate: F 12, V 15 (`REVIEW-v3.md` PASS), L 5.3, P 2. The rest is 0 or unmeasured.
10. **Product Check**
    - F 17.1/20: no FDA backend.
    - A1 0 M: 0.811 vs ≥ 0.85.
    - A3 0 M: 0.834 vs ≥ 0.90.
    - A4 0 M: 71.1 % vs ≥ 80 %.
    - A2 and A5 M.
    - S 4.7/7: AI ≤ 3 s missed (about 4.2 s estimated).
    - G 0 M: pc-jk "explicit send after the open preview, if the user removes nothing" = 29 against a target of 0
      (`docs/product-check/PC-JK-RESULTS.md` §2). This is a measured privacy-target miss, so the cap applies.
11. **Crowd**
    - F 17.5/20: no collapse warning.
    - A1–A3 0 E: the reference is AI, not humans (`docs/CROWD-ACCURACY.md`).
    - A4 0 M.
    - P 6/10.
    - S 3.5/7.
    - E 6.4/8.
12. **Look + salon**
    - F 5/20 M: lip and eye make-up and the belief label only; brow arch off; hair, facial hair and accessories not built;
      salon on branch.
    - A1 12 M: synthetic, re-measured independently.
    - G1 0 M: `~/Desktop/LENSIQ-review/salon/REVIEW.md` lists misses ("เลเซอ", "lazer", "tatt00", "m1croblading"); the
      fix `b0cb45c8` on `salon-approval` has not been reviewed.
    - P 0/8 E: the look panel has no width or WebKit test.
13. **Gate**
    - F 17.5/20: no numbers-only or legacy plates.
    - A1 0.
    - A2 0 E: the owner set does not exist; public 78 % taps.
    - A3 and A4 M.
    - P 6/10.
    - E 4.2/7 M.
14. **Exam hall**
    - F 16.7/20: no standing signal.
    - A1–A4 0: the mock exam was not run; person recall at hall size is 34–58 % (`docs/exam/HALL-DETECTOR-RESULTS.md`).
    - P 3.2/8.
    - X 0/8 E.
15. **Try-on**
    - F 13.3/20: not in the menu; backend not deployed.
    - A1 0 M: `~/Desktop/LENSIQ-review/tryon/REVIEW-pose.md` says the fixture mid-ranges equal the code offsets.
    - P 8, L 8, G 10 M.
    - E 4.8/8: no crash guard; no-frames untested.
16. **Personal Colour**
    - Paper round 2026-11-18, synthetic: undertone 1.1 %, top-1 7.8 %, top-2 46.7 %, hue SD 3.44°. Confirmed by the
      reviewer (`~/Desktop/LENSIQ-review/personal-colour/ROUND-PAPER-TH.md`).
17. **OMR**
    - F 20 (item 4 "not final while a flag is open" E, from `omr.js` review/manual code).
    - P 4.8/8.
    - L 4.7/7.
    - S 2.5/5.
    - E 4/6.
    - X 4/4.
    - G 0/10 E: no network-hook test.
    - A pending: `~/LENSIQ-field/evals/omr/` has clean / light / outside / double / erasure / skew folders, but no lock
      yet. Shadows and angled photos are not in it yet.

## Wave 1 proposal (tonight)

### A. Merge queue

The coordinator merges, after a green full CI on each branch head.

| Order | Branch | Why | State / what it needs first |
|---|---|---|---|
| 1 | `fortune-depth` | Q1 for tarot (lowest fortune page) and the depth ceilings | review round 3 PASS 2026-11-18; CI cancelled at `dfd7f9d2`: dispatch the full gate |
| 2 | `print-report` (contains `fortune-share-print`) | X (6 points) for faceread and 15 fortune pages | REVIEW-91 PASS 2026-11-18; CI green at `20d78130`, failed at tip `4358f37f`: fix, then re-run. **Owner must approve the sample PDFs** |
| 3 | `crisis-endall` | safety: "end it all" net 20/24 → 23/24 | REVIEW-endall PASS; CI cancelled twice: re-run. Benign false positives unchanged at 21/24 (noted, not worse) |
| 4 | `planner-defects` | planner P items | review PASS; CI failed on the phone gate (checkout `#manualSel` 16×48, gate-notice overflow at 320): fix, then re-run |
| 5 | `device-notes-1118` | P5 real-phone records (tarot, dream, crisis v3 on iPhone 16 Pro) | docs only; run CI |
| 6 | `salon-approval` | look G1 lint misspellings, salon F item | the fix `b0cb45c8` needs an independent review first; no CI run yet |

Not ready:
- `fortune-quality`: the reviewer said STOP (RECHECK-7 / 86c).
- `fortune-pet`: CI failed twice.
- `fortune-theme`: 52 commits ahead, failed or cancelled.
- `crisis-v2-live`: superseded by v3.

### B. Smallest fix set for the first five products

Effort: S ≤ half a day, M ≈ 1 day, L ≥ 2 days. Each fix gets its test locked first, then an independent review.

| Product | Fixes (+points) | Effort | Expected after Wave 1 |
|---|---|---|---|
| Attendance | A1 locked time-maths set ≥ 60 staff-months (+15, M); PIN mode loads no face model + timing (+4, M); QR scan in iPhone Safari with a permissive-licence decoder, licence checked first (+3.1, M); L3 language test for CSV headers and badge (+3.3, S); 430 px flow (+2, S); storage-warning test (+2, S); badge-print test (+2.3, S) | 2 M + 1 M + 5 S ≈ 3 days | **93** (A2 and P5 stay open) |
| Exam lab | WebKit + 430 px for exam.html and the dashboard (+6, S); crash guard on the dashboard + no-frames test + empty-dashboard test (+4.8, S); L3 (+2.7, S); S2 timing (+3.5, S); locked face set ≥ 100 frames and phone set ≥ 50 (A1/A2, M — whether 85 % → 98 % is reachable is uncertain) | 4 S + 1 M (+ engine work L) | **≈ 77 without A1/A2; 86 max. Cannot reach 90 without the field pilot (A5, 12 points)** |
| Face reading | merge `print-report` (+6); fix the cut summary text `gist()` on all fortune pages (+5, shared with all fortune pages, M); C1 locked determinism set (+5, S); C2 repeat-capture set on a licensed public set (Face Research Lab London Set, CC BY 4.0, already locked for attendance-face) (+5, M); S2 timing (+2.5, S) | ≈ 3 days | **95** (Q3 practitioner review open) |
| Compatibility | hard-limit probes on compat incl. "no break-up instruction", TH/EN/ZH (+10, M); depth audit + cut-text check (+10, S with the gist fix); add compat to `fortune-zh` + L3 (+2.7, S); add a speed budget for compat (a new, stricter budget; tell the owner it touches the locked `speed` set) (+2.5, S); crash guard (+2, S); print/share (+6, after `print-report`) | ≈ 2.5 days | **≈ 91–93** |
| Fortune pages | merge `fortune-depth` (+5 tarot); gist fix (+5 all); bad-input tests + crash guard on every page (+6, M); add the missing pages to `fortune-zh` (+2.7, S); 360/430 flow for the crisis-d-only pages (+2, S); trim the hub / luckycolor bytes to leave ≥ 2 % headroom (+2.5, S); S2 timing (+2.5, S); print/share (+6) | ≈ 3 days | **≈ 93 lowest page** (Q3 open) |

After Wave 1, an independent reviewer re-measures each product against its locked sheet. Only then can a product be
called "above 90".

## Decisions taken on the owner's behalf (reversible)

1. **Scoring rule: lowest page.** The fortune-pages sheet scores the group as its lowest page, so the group cannot hide a
   weak page. The mean is about 71.
2. **Owner approvals are not "outside inputs".** Owner approvals (PDFs, screenshots) are not counted as outside inputs
   in "reachable max". Data, people, money, legal and research are counted.
3. **New targets are marked "proposed".** Where a sheet had no existing target, the new one is marked "proposed". These
   include:
   - Attendance A1;
   - faceread C2 ≥ 80 %;
   - cut text 0 %;
   - S2 timings;
   - every OMR per-mark target;
   - Crowd A4;
   - studio A3.

   Any later change needs the owner and a new lock.
