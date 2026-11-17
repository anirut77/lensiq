# Fortune reading: style and fix backlog

This is one list. It merges the carried-forward style list and the fix list from the final independent review of the
fortune-quality loop: `~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK-7.md` (round 7, 2026-11-17, verdict STOP).

The quality loop stopped by owner decision 86 ค. Since then, a per-page gate decides which pages carry the new readings:

- **Gate:** `tools/fortune-gate.json` and `tools/fortune-gate.mjs`.
- **Pages with the new readings (ON):** astro, dream, fengshui, lek7, tarot (with Siam Si) and zodiac.
- **Every other page:** stays byte-identical to live main 02fdd69. It loads `live/` copies of the scripts this branch changed.

Each item names the pages it affects. "Both trees" means live and the new build have it. All examples are synthetic (engine-built facts).

## Fix list (from the review; would block switching more pages ON)

| # | Item | Pages | Status |
|---|---|---|---|
| F1 | ZH lifegraph: "换大运的它" / "换星的它" (the round-6 It→source swap applied in reverse). Make it "换大运的时候"; 0 occurrences of "的它". | lifegraph (OFF) | open |
| F2 | EN / ZH taksa: put the companions line back in bracket form ("In Taksa the companions area covers… (Jupiter)" / "（木星）"); no "Planet:" label. | taksa (OFF), report (OFF) | open |
| F3 | EN "…(source). So …" fragments: merge into one sentence or drop the "So". | horoscope, iching, bazi, palm (OFF); check the ON pages before any change | open |
| F4 | Never put a bracket before "ๆ" ("(วันเกิดพุธ) ๆ"). Check bracket balance in every brief and summary line. Never start a report section with an empty paragraph. | bazi, horoscope, iching, report (OFF) | open. ON pages: unclosed summary brackets fixed in the gate commit (gist), and none of these found in a 40-input scan of the ON engines |
| F5 | `gist()` summary bullets: cut only at a clause end. Never before "ๆ", never after a subordinate opener (เมื่อ / วันไหน / พอ / ถ้า / ในวันที่), never inside a bracket, never on a bare label ("เลขกัว"). | all pages, both trees (same rate as live) | open. The inside-a-bracket case is fixed on the ON pages |
| F6 | N2: keep "It" when the subject is the trait ("Your charm is quiet and lasting. It finds its way…", pair 20 in EN). | numbers (OFF) | open |

## Style list (carried forward; not ship-blocking by themselves)

| # | Item | Pages |
|---|---|---|
| S1 | EN "…(source). So …" fragments, and definitions placed inside topic sections. These block where a page is worse than live (see F3). | horoscope, iching, bazi, palm, face (OFF) |
| S2 | "Start with X:" / "先看…" in mid-section. "Pick the one suggestion that suits you best" / "挑一条最适合你的" with nothing to pick. | several, both trees |
| S3 | "The point to watch is this one, which by the tradition's rules is a weak patch" / "你需要注意的是这一点…" points at nothing, or at a strength. | straight mode, both trees |
| S4 | A straight-mode opener followed by a positive meaning, e.g. "直说吧…不顺" + 宝剑十 "最艰难的阶段已经过去". | tarot and others, both trees |
| S5 | Report deep sections: an orphan glossary line ("Taksa: In Taksa, … one of eight bhumi"), advice glued to an unrelated sentence, and the same month block printed twice. | report (mostly live side) |
| S6 | Feng shui advice says "here" / "this area" without naming the direction. | fengshui, both trees |
| S7 | EN agreement errors: "a number with no zeros are read", "a earth-element". | live only (fixed in the build) |
| S8 | TH: "ใช้ขอคำแนะนำเป็นแนวทาง" (a bare-verb keyword slot); "ซึ่ง…ซึ่งหมายความว่า"; "วัยจรช่วงนี้ ช่วงวัยนี้"; "ชาวปีX อย่างคุณ" twice; "คำที่ใช้เตือนใจช่วงนี้คือธาตุX". Also the I Ching and tarot keyword slots ("ถ้าบริหารเงินด้วยรุ่งโรจน์", "เมื่อคุณแสดงการสื่อสารออกมาให้เห็นเป็นรูปธรรม"). | iching, tarot, zodiac, bazi, lifegraph |
| S9 | ZH: "再看看人际关系。再看…" double openers; "门还说明，门反映…" symbol echo; "今年" used as a source label. | dream, zodiac, others |
| S10 | Builder-noted carry-overs: Siam Si "วางรากฐานงานให้มั่นคง…" with no subject; lek7 "พลังของภพX…เป็นที่พึ่งให้ด้านอื่นได้"; the Thai overview opens with "X + verb" (counted, no target); repeated bracket citations in one reading. | tarot (Siam Si), lek7, all |
