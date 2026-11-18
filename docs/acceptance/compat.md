# Acceptance sheet: Compatibility ดวงสมพงษ์ (`compat.html`)

> **สรุป:** ดูดวงคู่ 2 คนหรือกลุ่มไม่เกิน 8 คน จากวันเกิด หลายศาสตร์ ต้องคำนวณถูกต้องและให้ผลเหมือนเดิมทุกครั้ง ห้ามบอกให้เลิกกัน
> การ์ดช่วยเหลือ crisis v3 เป็นประตูผ่าน ยังขาดงบความเร็วของหน้า (ยังไม่มี) และการพิมพ์/แชร์ ต้องการผู้รู้ตรวจเนื้อหา

**Purpose.** A belief-based compatibility reading for two people or a group of up to 8, from birth data, using Vedic
Ashtakoota, BaZi, Thai and Western systems.

**Must-do functions.** Each one is an F item.
1. Two-person mode, and group mode up to 8 people (the add button is disabled at 8).
2. A consent tick before entering another person's data.
3. A 7-category wheel and the group map.
4. A per-system breakdown.
5. Free tier only. Paid content is off.

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–5, per item | each exercised by a test on main | compat e2e (R1, G1), `fortune-compat-webkit.e2e.mjs`, lock `fortune-compat` | 15 |
| C1 | Determinism | the same pair gives an identical reading, 100 % | unit tests, lock `fortune-compat` | 4 |
| C2 | Calculation correctness | moon longitude within 1′ of astronomy-engine on the locked pairs (existing measurement 0.72′); Yoni table cells each backed by two sources (existing: `docs/COMPAT-SOURCES.md` §3a) | compat unit tests | 6 |
| V | Gate: crisis v3 | README V, plus `fortune-compat-crisis.e2e.mjs` | README V | 15 |
| H | Gate: hard limits | 0 breaches on locked probes, including "no instruction to end a relationship", for pair and group results in TH/EN/ZH (existing rule CLAUDE.md; the probe set must include compat) | `fortune-honest`-style probes run on compat | 10 |
| Q1 | Depth | depth audit floors met for compat (existing `fortune-depth` method) | depth audit | 5 |
| Q2 | No cut text | 0 % cut summary bullets (**proposed**, as `faceread.md` Q2) | fortune-quality check | 5 |
| Q3 | Content review | `docs/FORTUNE-REVIEW.md` rubric: mean ≥ 4.0, 0 safety fails | review sheet | 5 |
| P | P1–P5, per item | all pass | README P | 10 |
| L | L1–L3, per item | all pass; compat is added to `fortune-zh.e2e.mjs` | README L | 8 |
| S | S1 (a budget must exist for compat), S2, per item | both pass | README S | 5 |
| E | Bad or missing birth date (the old result is cleared), 9th person refused, crash guard, per item | all pass | compat e2e "R" | 6 |
| X | Print and share of a pair result, per item | all pass | e2e | 6 |

**Needs from the owner or outside**
- A practitioner or native-speaker review (Q3).
- Confirmation that the method sources are licence-clean (after the AGPL PyJHora grid was removed).
- L63 crisis wording review.
