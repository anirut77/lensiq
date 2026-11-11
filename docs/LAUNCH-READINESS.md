# Launch readiness: Exam (lab), Attendance, Gate, Crowd

Written 2026-11-11 for the "Sellable pack" (owner standing order 2026-11-11, `CLAUDE.md`). Status of the four products
the owner plans to sell **by quotation and bank transfer (no online payment)**. Nothing new was measured for this file:
every figure is copied from the file named next to it. Where two sources disagree, both are shown and the row is marked
**⚠ sources disagree** (list in section 7).

## สรุปภาษาไทย (สั้น)

- **ขายได้แบบใบเสนอราคา + โอนเงิน** 4 ตัว: Exam (เฉพาะห้องคอมพิวเตอร์ / lab mode), Attendance (PIN/QR เป็นค่าเริ่มต้น
  ใบหน้าเป็นทางเลือก), Gate (เจ้าหน้าที่ยืนยันทุกป้าย), Crowd (งานอีเวนต์ รุ่นทดลอง ไม่เหมาะกับฝูงชนหนาแน่น)
- **ยังไม่มีตัวเลขหน้างานจริงเลยสักตัว** ทุกตัวเลขมาจากข้อมูลจำลองหรือชุดข้อมูลสาธารณะ จึงขายได้เฉพาะ "ราคาช่วงนำร่อง"
  ตาม `docs/PRICING-RESEARCH.md` §3 (ราคาไม่รวม VAT 7%)
- **งานโค้ดที่ต้องเสร็จก่อนขาย:** เสร็จแล้ว 2026-11-11: รหัสกู้คืนของผู้ดูแลใช้แฮชแบบช้าและมี salt (L51),
  ยืนยันว่า cron ลบข้อมูลตามระยะเก็บทำงาน, ป้าย "ทดลอง" ของห้องสอบ (hall) และ Crowd ตรงกันทุกหน้า,
  ไม่มีหน้าไหนอ้างเกินกว่าที่วัดได้
- **สิ่งที่เจ้าของต้องทำ:** ข้อมูลผู้ขาย (ชื่อ เลขผู้เสียภาษี ที่อยู่ อีเมล วันที่มีผล อีเมล DPO ยังว่างทั้งหมด),
  ตัดสินใจเรื่องจด VAT, แบบใบเสนอราคา/ใบกำกับภาษี, หาไซต์นำร่องอย่างน้อยหนึ่งแห่งต่อผลิตภัณฑ์, ยืนยันเกณฑ์นำร่อง
- **สิ่งที่ทนายต้องตอบ:** ประกาศ/ความยินยอม/ข้อกำหนด/นโยบายความเป็นส่วนตัว, ราคาและ VAT (L25), จัดซื้อภาครัฐ (L26–L27),
  ป้ายและฐานกฎหมายของ Gate (L24), สิทธิ์ใช้โมเดลใบหน้าสำหรับ Attendance โหมดใบหน้า (L23) — รายละเอียดใน `docs/LEGAL-PACKET.md`

## 0. How to read this file

- **Source labels** (as in `docs/ACCURACY-CLAIMS.md` §1): **synthetic** (generated scenes), **public dataset** (public
  photos / videos), **field** (a real customer site or the owner's own photos). No product has a field figure yet.
- **Blocker class:** **code** (the agent can fix it), **owner** (needs the owner's decision, money, data or site),
  **legal** (needs counsel or a data owner).
- **Status words:** *in progress 2026-11-11* = being fixed by another agent today (named by the owner); *open* = nobody
  is working on it; *decided* = an owner decision is recorded in the cited file.
- **L-numbers** are the rows of `docs/CTO-BRIEF.md` §8 (L1–L53). Other documents reuse "L" for their own lists
  (`docs/LEGAL-REVIEW-PACK.md` §3.7 L1–L5, `docs/pdpa/DPIA.md` §9 L1–L20); this file writes those as LRP-… and DPIA-….
- **Prices** are only the approved levels in `docs/PRICING-RESEARCH.md` §3 (approved 2026-11-09, not on sale yet). Every
  price is **excl. 7 % VAT**; the customer pays the price + 7 %. `docs/SALES-PACKAGES.md` is a draft and is not used.

## 1. Common to all four products

| Topic | State today | Source |
|---|---|---|
| Sales channel | Quotation + bank transfer. No online checkout for these lines: no plan in the D1 `plans` table, no migration; `pricing.html` (consumer checkout, VAT-inclusive) is unchanged | `docs/PRICING-RESEARCH.md` header |
| Seller details | **Missing:** name, tax_id, address, email, effective_date, dpo_email; Worker `SELLER_NAME`, `SELLER_TAX_ID`, `SELLER_ADDRESS` missing; counsel not confirmed. Go-live checklist 0 done, 11 open | `node tools/check-legal.mjs` output, 2026-11-11 |
| Tax invoices | e-Tax Invoice by Email not built; VAT only if the seller is VAT-registered (mandatory above 1.8 M THB a year) | `docs/BILLING-PLAN.md` §5; `docs/CTO-BRIEF.md` §3 item 7 |
| Where data lives | On the customer's device (browser storage). No organisation accounts, no sync, no backup; clearing the browser loses records | `docs/CTO-BRIEF.md` §3 item 5; `docs/ORG-ACCOUNTS-DESIGN.md` (design only) |
| Customer build | Customer mode is the default on every host; an installer locks the research models off with `LENSIQ_RESEARCH_DEMO = false`. Checklist items `config.profile` and `config.age_gender` are still open | `docs/CTO-BRIEF.md` §2; `tools/check-legal.mjs` output |
| Field accuracy | Not measured for any product. No field pilot has run | `docs/FIELD-PILOT.md` "Status per round" (round 16: not started) |
| Legal review | Planned before sale; has not happened | `docs/CTO-BRIEF.md` §4 |

## 2. LENSIQ Exam — lab mode (computer room / online, Mode B)

Hall mode (`exam-hall.html`, Mode A) is **experimental, not on sale** (owner decision 2026-11-10,
`docs/CTO-BRIEF.md` §5; `docs/ONE-PAGER-EXAM.md`). It is listed below only where it affects lab sales.

| Section | Detail | Source |
|---|---|---|
| **Pages** | `exam.html` (landing, never-list, printable notice + consent `#notice`), `exam-lab.html` (candidate page, Mode B), `exam-dashboard.html` (invigilator dashboard). `exam-hall.html` experimental | `docs/EXAM.md` page table |
| **Works today** | Notice + consent → camera and light check → calibration → fullscreen exam. Signals: face count, head turn, objects (phone / book), frozen feed, browser events (fullscreen exit, second screen). Gentle prompt first; the candidate sees their own log. Every dashboard action needs the invigilator's name. On-site tally gives precision per signal with a Wilson 95 % interval; CSV in time order; printable report. Accommodations per seat with no diagnosis stored. Evidence clip: opt-in per exam, default OFF, 10 s, video only, encrypted on the device, auto-deleted, behind an invigilator PIN | `docs/EXAM.md` "Why it does not decide", "Evidence clip", "Dashboard" |
| **Face engine** | MediaPipe Face Landmarker (Apache-2.0) by default; face-api.js only behind the research-demo switch, never loaded by a customer Exam build | `docs/EXAM.md` page table; `docs/CTO-BRIEF.md` §5 |
| **Measured: real exam room** | Signals right / wrong: **not measured** · field (no pilot yet) | `docs/ACCURACY-CLAIMS.md` §3; `docs/EXAM.md` "Accuracy — not measured yet" |
| **Measured: face not found** | One person at desk distance: 15 % missed (4 / 26; 22 / 26 found) · n = 26 frames · public dataset (Open Images V7, held-out half) | `docs/ACCURACY-CLAIMS.md` register E2; `docs/EXAM.md`; `docs/ONE-PAGER-EXAM.md` |
| **Measured: small faces** | Faces 24–48 px wide: 0 / 12 found · public dataset | `docs/EXAM.md`; register E2 |
| **Measured: low light, mask** | Low light 76.9 % (old engine 61.5 %); mask 65.4 % (old 53.8 %) · **synthetic** | `docs/EXAM.md` "Face engine, measured 2026-11-10" |
| **Measured: no false face** | 0 false faces on 37 no-person frames · public dataset + synthetic | `docs/EXAM.md` |
| **Measured: "more than one person"** | 28.8 % (15 / 52) of frames with a second person flagged; false alarms 0 / 17 · n = 52 frames · public dataset (Open Images V7, not exam footage). Stated as **an aid, not complete detection**; ≥ 90 % is the bar for ever claiming "detects a second person" | `docs/ACCURACY-CLAIMS.md` §3 and register E5; `docs/pilot/PILOT-EXAM.md` §6 |
| **Measured: head turn** | 81.1 % new vs 84.4 % old on renders · **synthetic**, favours the new engine; **not a claim** until measured on real video | `docs/EXAM.md` |
| **Not measured** | Phone / book detection on exam footage; misses by skin tone; mouth movement | `docs/EXAM.md`; `docs/ONE-PAGER-EXAM.md` |
| **Known limits** | A web page cannot see other apps, a second device, earpieces or people out of frame. Lab mode has **no live view on another machine** (the relay endpoint does not exist; file export / import only; owner accepted 2026-11-10). Face signals switch off where the detector cannot run (some browsers without GL). Faces under ~48 px are not found. Thresholds are research defaults. Data stays on each lab computer | `docs/EXAM.md` "What a web page cannot see", "Transport and privacy"; `docs/FIELD-PILOT.md` changelog 2026-11-10 |
| **Pilot plan** | 1 institution, ≤ 4 weeks, ≤ 3 rooms, free; phase 0 light check, phase 1 staged exam, phase 2 real exam with tallies. Targets are a **proposal**; the owner must decide before phase 2 whether "Wilson lower bound ≥ 70 %" stays | `docs/pilot/PILOT-EXAM.md` §6 |
| **Price (pilot stage, now)** | Free trial: 1 room, 10 seats. Field pilot: free. **10 THB per candidate per exam excl. 7 % VAT** (minimum 300 THB per session excl. 7 % VAT). Lab package **990 THB / month per lab excl. 7 % VAT**. Institution licence **from 19,900 THB / year excl. 7 % VAT** (≤ 1,000 candidates). Hall rows: approved but **not on sale** | `docs/PRICING-RESEARCH.md` §3.1 |
| **Price (after pilot)** | 15–30 THB per candidate per exam; 990–1,490 THB / month; 30,000–120,000 THB / year (all excl. 7 % VAT). Only after the site passes `docs/pilot/PILOT-EXAM.md` | `docs/PRICING-RESEARCH.md` §3.1 |

**Must-fix-before-launch items that apply**

| Item | What | Status |
|---|---|---|
| L51 | Admin recovery codes: slow, salted hash | **done 2026-11-11** (deployed; owner re-issued; 10 salted codes, 0 old) |
| — | Hall mode labelled "experimental, not on sale yet" consistently everywhere | **done 2026-11-11** (commit `72d733b`) |
| — | No page claims more than was measured | **done 2026-11-11** (commit `72d733b`; claim-rules check added) |
| — | Retention cron confirmed on | **done 2026-11-11** (ran 03:17 UTC on lensiq-test; audit `retention.run`) |
| L23 | Face model licences. For Exam: resolved by the switch to MediaPipe (`docs/CTO-BRIEF.md` §5 "L23: Exam resolved"), but the L23 row still says "open" and `docs/PAGE-STATUS.md` still names F5/F6 for the Exam pages ⚠ | open (row); resolved for Exam (text) |
| L25 | Pricing terms and VAT, refund and contract terms | open (counsel) |
| L26, L27 | Public procurement fit; vendor-neutral TOR wording (schools and universities) | open (counsel) |
| L28 | Partner agreement (only if sold through installers) | open (counsel) |
| L22 | Organisation accounts (only if central sync is sold; it is not today) | open (counsel) |

**What blocks selling Exam (lab)**

| Class | Blocker |
|---|---|
| code | The four in-progress items above |
| owner | Seller details and VAT decision (section 1); one pilot institution; confirm the pilot targets (`docs/pilot/PILOT-EXAM.md` §6) |
| legal | Notice and consent text (`exam.html#notice`, `i18n/*-exam.js`); lawful basis public vs private institution and minors (`docs/PDPA-NOTES-FOR-COUNSEL.md` B1); evidence-clip questions if clips are offered (C2); MediaPipe mesh and human-oversight wording (F5); L25–L27 |

## 3. LENSIQ Attendance — employee time attendance (PIN / QR default, face optional)

| Section | Detail | Source |
|---|---|---|
| **Pages** | `attendance.html` in employee mode (`attendance.html?mode=employee`; code `attendance-hr.js`, `lensiq-timeclock.js`, `attendance-qr.js`); training / event check-in stays the page default. Consent and sign template on `camera-notice.html` | `docs/ATTENDANCE-READINESS.md` intro; `docs/PDPA-NOTES-FOR-COUNSEL.md` B2 |
| **Works today** | PIN (salted, iterated SHA-256; lock after 5 misses) and printable QR badge; face check-in optional with consent (encrypted descriptor on the device, no photos; "no face" employees cannot be enrolled). Shifts incl. night shifts, grace minutes, OT rules and OT approval, shift history; 13+ holidays with substitute days; leave types; weekly 48 h and 36 h OT flags; audited manager corrections with a hash chain; monthly summary; bilingual payroll CSV; per-employee export (PDPA access); retention ≥ 2 years for time records, separate face retention; kiosk mode; JSON pack to merge several devices | `docs/ATTENDANCE-READINESS.md` §1–§7 |
| **Measured: PIN / QR** | No accuracy figure: no recognition · not applicable | `docs/ONE-PAGER-ATTENDANCE.md` |
| **Measured: face, Asian (headline)** | 66–76 % recognised (5 / 20 / 200 enrolled) · n = 500 people × 5 photos (held out; "not perfectly blind", `ACCURACY.md` disclosure) · public dataset (CASIA-FaceV5) | `docs/ACCURACY-CLAIMS.md` §3 and register A2; `docs/PRICING-RESEARCH.md` §2 |
| **Measured: face, LFW** | 85 % recognised, 100 enrolled · n = 610 member probe photos · public dataset (LFW), **tuning set, optimistic** | register A1 |
| **Measured: stranger offered a name** | Asian (held out, 100 enrolled) 0.2 % [0.04–0.45 %]; upper 95 % bound up to 1.15 % at 5 or 200 enrolled; LFW (tuning set) 0.4 % · n ≈ 12,000 stranger visits per row · public dataset | register A3 |
| **Measured: stranger checked in with no confirmation** | Asian (held out) ≤ 0.03 %; LFW (tuning set) 0.01–0.07 % (0.05 % at 100, 0.07 % at 200 enrolled) · public dataset. ⚠ sources disagree: the generated page banner says "fewer than 0.05 %" | `docs/ACCURACY-CLAIMS.md` §3 and §7 item 7; `ACCURACY.md:404`; `docs/accuracy-figures.json` `autoStr` |
| **Not measured** | Liveness (head-turn) option; a real Thai workplace (field) | register A5, A6 |
| **Known limits** | Browser storage ≈ 5 MB, about 20 employees × 2 years (warning from 3.5 MB); no rotating rosters, split shifts or early-in OT; no online leave approval; no wage, tax or social-security calculation; no employee register (s.112); device clock only (clock set back is warned); reloading with no network fails (only models are cached); camera badge scan needs `BarcodeDetector` (Chrome on Android / macOS / ChromeOS); a PIN or badge can be shared; Buddhist lunar holidays filled for 2026 only; no live sync between branches | `docs/ATTENDANCE-READINESS.md` §1–§6 |
| **Face licence** | face-api.js recognition weights are CC0 / MIT but trained on research-only data (F6 / L23). Owner decision 2026-11-10: PIN / QR default, face optional, no swap yet; Part B options await the owner (B10) | `docs/ATTENDANCE-READINESS.md` Part B; `docs/CTO-BRIEF.md` §2 |
| **Pilot plan** | 2 weeks at a shop or company with 5–20 staff; face only with consenting volunteers: false accept ≤ 1 %, false reject ≤ 10 %; one month's payroll CSV matched with the shop's records | `docs/PILOT-PLAN.md` §3.2; `docs/ONE-PAGER-ATTENDANCE.md` |
| **Price (pilot stage, now)** | Free: up to 5 people, PIN / QR, 1 device. Standard: **19 THB per active person / month excl. 7 % VAT** (minimum 190 THB / month excl. 7 % VAT). Set-up help: **2,900 THB one-off excl. 7 % VAT** (optional). Multi-branch sync / cloud backup: not sold | `docs/PRICING-RESEARCH.md` §3.4 |
| **Price (after pilot)** | 29 THB per active person / month (minimum 290 THB / month); set-up 4,900 THB one-off (excl. 7 % VAT) | `docs/PRICING-RESEARCH.md` §3.4 |

**Must-fix-before-launch items that apply**

| Item | What | Status |
|---|---|---|
| L51 | Admin recovery codes: slow, salted hash | **done 2026-11-11** (deployed; owner re-issued; 10 salted codes, 0 old) |
| — | No page claims more than was measured (the "fewer than 0.05 %" banner above is one candidate) | **done 2026-11-11** (commit `72d733b`; claim-rules check added) |
| — | Retention cron confirmed on | **done 2026-11-11** (ran 03:17 UTC on lensiq-test; audit `retention.run`) |
| L23 | Face model licence (research-only training data) for the optional face mode | open (counsel; letters A / B in `docs/LICENCE-REQUESTS.md` not sent) |
| L25 | Pricing terms and VAT, refund and contract terms | open (counsel) |
| L28 | Partner agreement (if sold through partners) | open (counsel) |
| L22 | Organisation accounts (multi-branch is not sold today) | open (counsel) |

**What blocks selling Attendance**

| Class | Blocker |
|---|---|
| code | The in-progress items above |
| owner | Seller details and VAT decision; one pilot site with 5–20 staff; decide whether face mode is quoted before L23 is answered (`docs/ATTENDANCE-READINESS.md` B10) |
| legal | Employee notice and consent text; whether biometric consent is free in employment with the PIN / QR alternative (`docs/PDPA-NOTES-FOR-COUNSEL.md` B2; DPIA-L1; LRP-P2, LRP-L5); s.114 wording and 2-year minimum; works-rules wording for lateness beyond grace and OT rounding; 13-holiday text (`docs/ATTENDANCE-READINESS.md` "Needs outside resources"); L23 for face mode; L25 |

## 4. LENSIQ Gate — assisted plate reading (a person confirms every read)

| Section | Detail | Source |
|---|---|---|
| **Pages** | `gate.html` (landing), `parking.html` (car park), `village.html` (village / condo), `gate-notice.html` (printable PDPA sign + privacy-notice template) | `docs/GATE.md` header |
| **Works today** | Plate finder (classical) + LPD-YuNet proposals; PP-OCRv5 Thai recogniser; 5-frame vote; plate pattern check; 77-province pick-list; plate-likeness check before any auto-read; **the guard confirms or corrects every read**; hash-chained correction audit. Car park: entry / exit pairing, fee rules, shop stamps, static PromptPay QR, receipts, shift close. Village: residents, visitor passes, watch list with a recorded reason, optional relay through a same-origin bridge. On-site accuracy check (day / night, Wilson 95 %); owner photo tool. Crops off by default, logs 90 days, receipts 5 years | `docs/GATE.md` §1–§5 |
| **Measured: synthetic** | Plate found (top box) 97.1 % (136 / 140); exact read from one frame 58 % (81 / 140); plate-less scenes auto-read 0 / 20 · n = 140 / 20 scenes (demo set, seed 7) · synthetic | `docs/ACCURACY-CLAIMS.md` §5; `docs/ONE-PAGER-GATE.md` |
| **Measured: real photos, top box** | 41 % (13 / 32) · n = 32 photos with a plate · public dataset (Wikimedia Commons). ⚠ sources disagree: after the 2026-11-10 box re-check `docs/GATE.md:300` gives 14 / 32 (44 %) | `docs/ACCURACY-CLAIMS.md` §5 round 16; `docs/GATE.md` §3c |
| **Measured: real photos, exact automatic read** | 32 % (7 / 22); 30 % (7 / 23) counting one "unsure" photo · n = 22 (12 of them dev / tuning, optimistic) · public dataset | `docs/ACCURACY-CLAIMS.md` §5 |
| **Measured: real photos, taps needed** | 78 % (25 / 32) · n = 32 · public dataset | `docs/ONE-PAGER-GATE.md`; `docs/GATE.md` §3c |
| **Measured: photos without a plate read automatically** | 0 / 19 (3 / 19 before the check; 95 % interval 0–17 %); held-out half 0 / 9 (0–30 %) · public dataset | `docs/ACCURACY-CLAIMS.md` §5 |
| **Measured: by category** | Motorcycle plates exact 0 / 6; tap read 4 of 15 exact · public dataset | `docs/GATE.md` §3c |
| **Not measured** | Owner's ~100 phone photos; a real gate or car park (field) | `docs/ONE-PAGER-GATE.md` |
| **Known limits** | The OCR is a general Thai text model, not trained on plates, and is now the main limit; no Thai-trained detector is shipped yet (YOLOX-nano waits for the owner's file; YOLOv9 not used, L41) ⚠; numbers-only and legacy plates are not supported; a one-line plate-shaped sign can pass the pattern check; PromptPay payments are not confirmed automatically; the 30-day trial is text only (no timer); go2rtc is not wired into the camera source; relays need a same-origin bridge; about 1.5 s median per photo on a Mac (not a phone) | `docs/GATE.md` §1, §3c "Known limits", "Cost", §4, §6; `docs/CTO-BRIEF.md` §5 |
| **Positioning** | "Assisted reading: the guard taps to confirm" (owner decision 2026-11-09) | `docs/CTO-BRIEF.md` §5 Gate |
| **Pilot plan** | Phase 0: ~100 owner phone photos; phase 1: 1 car park + 1 village, ≥ 5 days, ≥ 200 reads (night ≥ 40, motorcycle ≥ 30). Targets (proposal): exact read ≥ 95 % day, ≥ 85 % night (Wilson 95 % lower bound), 0 silent wrong saves, taps ≤ 10 % (upper bound). ⚠ `docs/GATE.md:51` still says "≥ 100 vehicles incl. ≥ 30 at night" | `docs/pilot/PILOT-GATE.md` §5; `docs/ONE-PAGER-GATE.md` |
| **Price (pilot stage, now)** | Trial: **free 30-day trial**, 1 lane, 100 reads / day, logs kept 7 days. Village / condo: **490 THB / month per lane excl. 7 % VAT**. Car park (PromptPay, receipts, shift close included): **790 THB / month per lane excl. 7 % VAT**. Set-up visit: **2,500 THB per visit excl. 7 % VAT**. Hardware not sold | `docs/PRICING-RESEARCH.md` §3.2 |
| **Price (after pilot)** | Village 990 THB / month per lane, 1,990 THB / month for 3 lanes; car park 1,490 THB / month per lane; set-up 3,000–5,000 THB per visit (excl. 7 % VAT) | `docs/PRICING-RESEARCH.md` §3.2 |

**Must-fix-before-launch items that apply**

| Item | What | Status |
|---|---|---|
| L51 | Admin recovery codes: slow, salted hash | **done 2026-11-11** (deployed; owner re-issued; 10 salted codes, 0 old) |
| — | No page claims more than was measured | **done 2026-11-11** (commit `72d733b`; claim-rules check added) |
| — | Retention cron confirmed on | **done 2026-11-11** (ran 03:17 UTC on lensiq-test; audit `retention.run`) |
| L24 | Gate sign wording, legal basis (s.24(5) / s.24(3)), plate retention; owner photos of public streets | open (counsel) |
| L25 | Pricing terms and VAT, incl. the 30-day trial wording (not enforced in code) | open (counsel) |
| L26, L27 | Public procurement and TOR wording (public car parks) | open (counsel) |
| L28 | Partner (installer) agreement | open (counsel) |
| L41 | YOLOv9 plate detector | closed: not used (2026-11-10) |
| L22 | Organisation accounts (central plate history is not sold today) | open (counsel) |

**What blocks selling Gate**

| Class | Blocker |
|---|---|
| code | The in-progress items above |
| owner | Seller details and VAT decision; ~100 phone photos for phase 0; one car park and one village for phase 1; the Thai YOLOX-nano ONNX file |
| legal | L24 (sign, basis, retention); visitor names / phones typed by guards and the deny list (`docs/PDPA-NOTES-FOR-COUNSEL.md` B3, E2); L25–L28 |

## 5. LENSIQ Crowd — events, experimental (not for dense crowds)

| Section | Detail | Source |
|---|---|---|
| **Pages** | `crowd.html`; sign A on `camera-notice.html` | `docs/PDPA-NOTES-FOR-COUNSEL.md` C1 |
| **Works today** | People in view (5-frame median) and in a drawn zone; entry / exit line with an anonymous tracker; density heatmap; peak hours; "≈ estimate" label from 15 people or ≥ 2 people / m²; "people look small" hint; "expected crowd at peak" setting that warns when the detector collapses; marketing CSV with a caveat header; JSON summary; operator confirms a notice is posted before the camera starts; day records capped at 60 days | `docs/CROWD-ACCURACY.md` "What the page does with this"; `docs/ONE-PAGER-CROWD.md`; `docs/pdpa-notes/S1-A-crowd.md` |
| **Status label** | Task wording and `docs/CTO-BRIEF.md:22`: experimental. `docs/PAGE-STATUS.md` now also says experimental (commit `72d733b`); every page, card and one-pager use the same words | in progress 2026-11-11 |
| **All figures** | **Preliminary:** the reference is an AI reviewer looking at still frames, not two human counters | `docs/CROWD-ACCURACY.md` status box |
| **Measured: dense crowd** | ≈ 300 people counted as about 1 per frame (0–2 on the 100+ person time-lapse) · n = 2 + 7 frames (2 clips) · public dataset, preliminary · **not yet suitable for dense crowds** | register C1; `docs/CROWD-ACCURACY.md` |
| **Measured: 15–22 people, whole view** | Undercount 26 % · n = 12 frames (1 clip) · public dataset, preliminary | register C2 |
| **Measured: 30–50 people, many far** | Undercount 58 % (reference itself an estimate ±20 %) · n = 20 frames (1 clip) · public dataset, preliminary | register C3 |
| **Measured: small / far people** | Undercount 37–59 % · n = 29 frames (2 clips) · public dataset, preliminary | register C4 |
| **Measured: near zone, 0–13 people** | 1.2 people per frame (31 %), bias −0.2 · n = 20 frames (1 clip) · public dataset, preliminary | register C5 |
| **Measured: entry / exit line** | 1 / 1 crossings, 0 false · n = 1 crossing (2 clips) · public dataset, preliminary | register C7 |
| **Measured: speed** | 355 ms per frame (≈ 2.8 calls / s) on an emulated mid-range phone (CPU ×4), not a real phone · n = 27 frames (1 clip) | `docs/ONE-PAGER-CROWD.md`; `docs/CROWD-ACCURACY.md` Round 16 timing table |
| **Not measured** | Final accuracy (human count pending); a real customer site (field) | register C8; `docs/ONE-PAGER-CROWD.md` |
| **Known limits** | Dense crowds: the count collapses and shows **no warning** unless "expected crowd at peak" is set; people smaller than about a tenth of the frame height are missed 37–59 %; near people hide others; zone edges flicker; a moving camera gives per-frame counts only; test clips are streets, not events or shops; never for crowd-safety decisions. The 640-input / tiles option (whole-frame error about 7–33 % on four clips) is **not shipped**; no density model has a clean licence | `docs/CROWD-ACCURACY.md` "Where it breaks", "Deferred"; `docs/CTO-BRIEF.md` §3; `docs/CROWD-DENSITY-MODELS.md` |
| **Pilot plan** | Phase 0: two-person human count of the existing clips + timing on a real mid-range phone; phase 1: 1–2 sites with 5–40 people at peak, 2–3 days, two counters every 5 minutes. Targets (proposal): zone MAPE ≤ 20 %, in-view MAPE ≤ 25 %, ≥ 70 % of snapshots within band, line ≤ 10 % per 15 min, phone ≥ 2 calls / s | `docs/pilot/PILOT-CROWD.md` §5 |
| **Price (pilot stage, now)** | Event day: **590 THB per device per day excl. 7 % VAT**. Event week: **2,490 THB per device excl. 7 % VAT**. Monthly fixed site: 290 THB / month per device excl. 7 % VAT, approved but **held back** until a fixed-site pilot passes. Dense crowds (≈ 50+ in view): **not sold** | `docs/PRICING-RESEARCH.md` §3.3 |
| **Price (after pilot)** | Event day 990 THB; event week 3,900 THB; monthly 490 THB per device (excl. 7 % VAT). Sales text must say "density estimate, not an exact count" | `docs/PRICING-RESEARCH.md` §3.3 |

**Must-fix-before-launch items that apply**

| Item | What | Status |
|---|---|---|
| L51 | Admin recovery codes: slow, salted hash | **done 2026-11-11** (deployed; owner re-issued; 10 salted codes, 0 old) |
| — | Crowd labelled consistently (experimental, not for dense crowds) everywhere | **done 2026-11-11** (commit `72d733b`) |
| — | No page claims more than was measured | **done 2026-11-11** (commit `72d733b`; claim-rules check added) |
| — | Retention cron confirmed on | **done 2026-11-11** (ran 03:17 UTC on lensiq-test; audit `retention.run`) |
| L25 | Pricing terms and VAT, refund and contract terms | open (counsel) |
| L28 | Partner agreement (event agencies, installers) | open (counsel) |

**What blocks selling Crowd**

| Class | Blocker |
|---|---|
| code | The in-progress items above |
| owner | Seller details and VAT decision; two people for the human count (about 1–2 hours, `docs/CROWD-ACCURACY.md` "Deferred"); one event site; a real mid-range phone for timing; confirm the status label |
| legal | Lawful basis for anonymous counting at events (notice + legitimate interest, or also ticket terms) and the default retention of day records (`docs/PDPA-NOTES-FOR-COUNSEL.md` C1); sign A wording; L25, L28 |

## 6. Cross-product list of blockers

### Code

| # | Blocker | Products | Status |
|---|---|---|---|
| C1 | L51: admin recovery codes stored with a slow, salted hash; existing codes re-issued | all (back office) | **done 2026-11-11** |
| C2 | Retention cron confirmed on | all (backend) | **done 2026-11-11** (audit `retention.run` 03:17 UTC) |
| C3 | Hall mode and Crowd labels consistent on every page, category page, catalogue and one-pager | Exam, Crowd | **done 2026-11-11** (commit `72d733b`; claim-rules check added) |
| C4 | No page claims more than was measured (candidates found while writing this file: section 7 items 1, 2, 4) | all | **done 2026-11-11** (commit `72d733b`; claim-rules check added) |
| C5 | Customer install locks the research models off (`LENSIQ_RESEARCH_DEMO = false`); checklist items `config.profile`, `config.age_gender` open | all | open (set per install) |

Not blockers by owner decision: the Gate trial timer (deferred to org accounts and billing, `docs/CTO-BRIEF.md` §5);
organisation accounts and sync (not sold; `docs/PRICING-RESEARCH.md` §3.4); e-Tax invoice (quotation sales can use the
accountant's invoices; see owner item O3).

### Owner

| # | Blocker | Products |
|---|---|---|
| O1 | Seller details in `LENSIQ_SELLER` and the Worker: name, tax ID, address, e-mail, effective date, DPO e-mail (all empty today) | all |
| O2 | VAT registration decision (prices are quoted excl. 7 % VAT; no VAT line if not registered, `docs/PRICING-RESEARCH.md` header) | all |
| O3 | Quotation, invoice / tax-invoice and receipt template; bank account for transfers; who issues them | all |
| O4 | At least one field pilot per product; until then only pilot-stage prices apply | all |
| O5 | Confirm the pilot targets (all are proposals) and, for Exam, the Wilson rule before phase 2 | all |
| O6 | Engage counsel and send `docs/LEGAL-PACKET.md` | all |
| O7 | Crowd: human count (two people); Gate: phone photos and the YOLOX-nano file; Attendance: decide face mode before L23 | Crowd, Gate, Attendance |
| O8 | Native-speaker review of TH / EN / ZH sales texts (`docs/CTO-BRIEF.md` §5 "Owner and outside actions") | all |

### Legal

| # | Blocker | Products |
|---|---|---|
| G1 | Review of `privacy.html`, `terms.html`, `camera-notice.html`, `gate-notice.html`, the exam notice, consent texts and the pilot agreement | all |
| G2 | L25 pricing terms, VAT basis, refunds, contract terms | all |
| G3 | Controller / processor roles and a DPA template (LRP-G1; `docs/PDPA-NOTES-FOR-COUNSEL.md` D1) | all |
| G4 | L26, L27 public procurement and TOR wording | Exam, Gate (public buyers) |
| G5 | L28 partner agreement | all sold through partners |
| G6 | L24 Gate sign, basis, retention | Gate |
| G7 | L23 face model licence | Attendance (face mode) |
| G8 | Employment consent and labour-law wording (B2, DPIA-L1, LRP-P2, LRP-L5) | Attendance |
| G9 | Exam basis for public / private institutions, minors, clip questions (B1, C2, F5) | Exam |
| G10 | Anonymous counting basis and retention (C1, D2) | Crowd |

## 7. Inconsistencies between sources (found while writing this file)

1. **Strangers checked in automatically.** `ACCURACY.md:404` and `docs/accuracy-figures.json:21` (`autoStr`, used in the
   generated attendance / customers banners) say "fewer than 0.05 %". `docs/ACCURACY-CLAIMS.md:229` (correction 7) says
   this "was not true on LFW (0.05 % at 100, 0.07 % at 200 enrolled)".
2. **Gate top box on real photos.** `docs/ACCURACY-CLAIMS.md:203`, `docs/ONE-PAGER-GATE.md` and `docs/PAGE-STATUS.md:84`
   give 13 / 32 (41 %); `docs/GATE.md:300` gives 14 / 32 (44 %) after the 2026-11-10 box re-check.
3. **Gate detector licence.** `docs/GATE.md:260` says "the shipped plate detector is LPD-YuNet, MIT";
   `docs/GATE.md:20`, `docs/CTO-BRIEF.md` §2 and `vendor/models/plate-det/LICENSE` say Apache-2.0.
4. **Thai plate detector.** `docs/GATE.md:353` says "The delivered detector is the Thai-trained YOLOX-nano"; the repo
   ships only LPD-YuNet (`vendor/models/plate-det/`), `docs/LICENCE-REQUESTS.md` item 6 says "in progress", and
   `docs/CTO-BRIEF.md` §5 says it is integrated "as soon as the owner delivers the ONNX file".
5. **Gate field target.** `docs/GATE.md:51`: "≥ 95 % from ≥ 100 vehicles incl. ≥ 30 at night" (also
   `docs/ACCURACY-CLAIMS.md:77`); `docs/pilot/PILOT-GATE.md` §5 and `docs/FIELD-PILOT.md` §5: ≥ 200 reads, night ≥ 40.
6. **Crowd status.** `docs/CTO-BRIEF.md:22`: experimental; `docs/PAGE-STATUS.md:100`: pilot-ready.
7. **Exam face licence.** `docs/CTO-BRIEF.md:285`: "L23: Exam resolved"; the L23 row (`docs/CTO-BRIEF.md:453`) says
   "open" with no note, and `docs/PAGE-STATUS.md:90–93` still give "the face-model licence is still open (F5/F6)" as a
   reason for the Exam pages.
8. **Page-status approval.** `docs/PAGE-STATUS.md:3` says "DRAFT — awaiting owner approval"; `docs/CTO-BRIEF.md:198`
   says it was approved on 2026-11-09 and published.
9. **Price levels approval.** `docs/CTO-BRIEF.md:199` says the draft price levels are "still open … committed as a
   draft"; `docs/PRICING-RESEARCH.md` header and §4 say approved on 2026-11-09.
10. **Backend deployment.** `docs/CTO-BRIEF.md:16`, `:40` and `:121` say the backend has never been deployed;
    `docs/HANDOVER.md` §1–§2 and `docs/CTO-BRIEF.md` §6 "Admin key management" describe the test Worker
    `lensiq-api-test` as deployed.
11. **VAT basis in the legal pack.** `docs/LEGAL-REVIEW-PACK.md:64` (C5) and `:88` (R1) say prices are VAT-inclusive;
    the B2B prices of these four products are excl. 7 % VAT since 2026-11-09 (`docs/PRICING-RESEARCH.md` §4 item 7).
12. **Exam lab monthly price, Thai one-pager.** `docs/ONE-PAGER-EXAM.md:49` writes "990 บาท/เดือน/ห้อง" (per room) for
    the lab package; `docs/PRICING-RESEARCH.md` §3.1 and the English one-pager say "per lab".
13. ~~**L51 row incomplete.**~~ Fixed 2026-11-11 (the row now has where, status and date).
14. **Duplicate L-numbering.** `docs/LEGAL-REVIEW-PACK.md` §3.7 (L1–L5) and `docs/pdpa/DPIA.md` §9 (L1–L20) use the same
    IDs as `docs/CTO-BRIEF.md` §8 for different questions.
