# Acceptance sheet: Crowd (`crowd.html`, events, experimental)

> **สรุป:** นับคนในงานอีเวนต์ (คนน้อยถึงปานกลาง) เกณฑ์เดิมจากแผนนำร่อง: ความคลาดเคลื่อนในโซน ≤ 20% ในภาพทั้งหมด ≤ 25%
> วันนี้นับต่ำกว่าจริง 26–59% (เทียบ AI ไม่ใช่คน) ต้องมี **คน 2 คนนับคลิปที่ล็อก** และไซต์อีเวนต์จริง ฝูงชนหนาแน่นเป็นเรื่องวิจัย
> ที่ยังไปไม่ถึง ไม่อยู่ในใบนี้ แต่ต้องมีคำเตือนเมื่อการนับล้ม

**Purpose.** People counting at events with sparse to medium crowds, in view, in a drawn zone and across a line. No
age, gender or expression. It is not for dense crowds.

**Must-do functions.** Each one is an F item.
1. Count in view and in a zone.
2. Entry and exit line.
3. Heatmap and peak hours.
4. The "≈ estimate" label.
5. An "expected peak" warning.
6. A collapse warning when a dense scene makes the count fall apart, even if "expected peak" is not set.
7. CSV and JSON export, and the printed report.
8. Sign A at the entrance (template).

| ID | Criterion | Target | How measured | Weight |
|---|---|---|---|---|
| F | Must-do 1–8, per item | each exercised by a test on main | `crowd.e2e.mjs`, `crowd-report.e2e.mjs`, unit `crowd*.test.js` | 20 |
| A1 | In-view count | MAPE ≤ 25 %, bias not below −15 % (existing: `docs/pilot/PILOT-CROWD.md`), against a two-person human count of the locked public clips | locked clips + `docs/crowd-count/count-sheet.csv` | 10 |
| A2 | Zone count | MAPE ≤ 20 % (existing, PILOT-CROWD), same reference | as A1 | 8 |
| A3 | Line count | error ≤ 10 % per 15 min (existing, PILOT-CROWD) on ≥ 50 human-counted crossings | locked clips | 4 |
| A4 | Dense-scene warning | a warning appears on ≥ 95 % of locked dense frames (≥ 100 people) and on ≤ 5 % of sparse frames (**proposed**) | locked dense / sparse clip set | 6 |
| A5 | Field | ≥ 70 % of snapshots within band at 1–2 event sites (existing, PILOT-CROWD) | pilot result sheet | 2 |
| P | P1–P5, per item | all pass | README P | 10 |
| L | L1–L3, per item | all pass | README L | 8 |
| S | S1; S2 plus ≥ 2 counts per second on a real mid-range phone (existing, PILOT-CROWD); per item | all pass | README S | 7 |
| E | Camera refused, no frames, crash guard, no people, zone not drawn, per item | all pass | README E | 8 |
| X | CSV, JSON, printed report, per item | all pass | crowd-report e2e | 7 |
| G | Gate: no age, gender or expression in any build; no images stored; on-device; the sign template is present | all pass | unit and config tests | 10 |

**Needs from the owner or outside**
- Two people to count the locked clips (A1–A3).
- 1–2 event sites (A5).
- A real mid-range phone (S).
- Research: dense crowds. No clean-licence density model exists (`docs/CROWD-DENSITY-MODELS.md`).
