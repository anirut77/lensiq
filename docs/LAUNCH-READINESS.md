# Launch readiness: Exam (lab), Attendance, Gate, Crowd

Written 2026-11-11 for the "Sellable pack" (owner standing order 2026-11-11, `CLAUDE.md`). Status of the four products
the owner plans to sell **by quotation and bank transfer (no online payment)**. Nothing new was measured for this file:
every figure is copied from the file named next to it. Where two sources disagree, both are shown and the row is marked
**⚠ sources disagree** (list in section 7).

**Refreshed 2026-11-13 (stream C, branch `sellable-c`):** the must-fix rows now carry their evidence (commit or file); the four code items are confirmed done and "in progress" no longer applies to any row; the sales kit and demo mode are listed in section 1; section 8 is the Thai "how to sell this week" checklist per product. No measured figure was changed by this refresh.

## สรุปภาษาไทย (สั้น)

- **ขายได้แบบใบเสนอราคา + โอนเงิน** 4 ตัว: Exam (เฉพาะห้องคอมพิวเตอร์ / lab mode), Attendance (PIN/QR เป็นค่าเริ่มต้น
  ใบหน้าเป็นทางเลือก), Gate (เจ้าหน้าที่ยืนยันทุกป้าย), Crowd (งานอีเวนต์ รุ่นทดลอง ไม่เหมาะกับฝูงชนหนาแน่น)
- **ยังไม่มีตัวเลขหน้างานจริงเลยสักตัว** ทุกตัวเลขมาจากข้อมูลจำลองหรือชุดข้อมูลสาธารณะ จึงขายได้เฉพาะ "ราคานำร่อง"
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
- **Status words:** *done* = finished with evidence (commit or file) named in the row; *in progress* = being worked on (no row has this status since 2026-11-13); *open* = nobody
  is working on it; *decided* = an owner decision is recorded in the cited file.
- **L-numbers** are the rows of `docs/CTO-BRIEF.md` §8 (L1–L62). Other documents reuse "L" for their own lists
  (`docs/LEGAL-REVIEW-PACK.md` §3.7 L1–L5, `docs/pdpa/DPIA.md` §9 L1–L20); this file writes those as LRP-… and DPIA-….
- **Prices** are only the approved levels in `docs/PRICING-RESEARCH.md` §3 (approved 2026-11-09, not on sale yet). Every
  price is **excl. 7 % VAT**; the customer pays the price + 7 %. `docs/SALES-PACKAGES.md` is a draft and is not used.

## 1. Common to all four products

| Topic | State today | Source |
|---|---|---|
| Sales channel | Quotation + **bank transfer only** (no PromptPay QR, card or Opn; owner decision 2026-11-13). No online checkout for these lines: back-office order plans are planned only for Gate, Attendance, Exam (lab room) and Crowd report, with no online purchase; `pricing.html` (consumer checkout, VAT-inclusive) is unchanged | `docs/PRICING-RESEARCH.md` header; `docs/BILLING-PLAN.md` §4.1 |
| Free tiers and limits | Fortune and general tools stay free. Gate 30-day trial (1 lane, 100 plates / day) · Attendance free up to 5 people · Exam free up to 5 candidates per session · Crowd free 2 hours per device per day; a licence is needed beyond them. **Not enforced in the product yet** (membership and billing come later): the limits apply from a date to be announced with at least 30 days' notice, starting 30 days after the announcement, enforced by the owner by contract; a limit on the user's device can be bypassed by someone who edits the code, the contract binds. Customers can always export their data. A licence works offline for 14 days (planned) | Owner decision 2026-11-13; legal item L62 |
| Sales kit | Quotation, invoice, receipt, order form, a 10-minute demo script, onboarding guide and a short deck for each of Exam, Attendance, Gate and Crowd; all marked draft; price lines checked against `docs/PRICING-RESEARCH.md` §3 on 2026-11-13; open points OP-01 to OP-27 | `docs/sales/README.md` |
| Demo mode (`?demo=1`) | Sample data only, no camera, nothing written to the device's real records, exports named SAMPLE, a bar "sample data, not real data" always on screen. Pages: `exam-lab.html`, `exam-dashboard.html` (pre-filled sample tally, simulated: it shows how the tally works and is not an accuracy), `attendance.html?mode=employee`, `village.html`, `parking.html`, `crowd.html` | `lensiq-demo.js`, `lensiq-demo-data.js`; tests `tests/e2e/demo-mode.e2e.mjs`, `tests/e2e/exam-dashboard-demo.e2e.mjs` |
| Organisation accounts | Planned "lite" version, not built: organisation name, billing details, admins and staff, invitations; no syncing of the customer's people data | Owner decision 2026-11-13 |
| Privacy contact | LINE @632yliiw until a separate privacy-contact (DPO) e-mail is added; the owner will send the address | Owner decision 2026-11-13; legal item L61 |
| Seller details | **Missing:** name, tax_id, address, email, effective_date, dpo_email; Worker `SELLER_NAME`, `SELLER_TAX_ID`, `SELLER_ADDRESS` missing; counsel not confirmed. Go-live checklist 0 done, 11 open | `node tools/check-legal.mjs` output, 2026-11-11 |
| Tax invoices | e-Tax Invoice by Email not built; VAT only if the seller is VAT-registered (mandatory above 1.8 M THB a year). The owner issues receipts from the template and the system does not number them (2026-11-13); numbering series and tax-invoice content are questions for the accountant (`docs/sales/ACCOUNTANT-QUESTIONS-TH.md`) | `docs/BILLING-PLAN.md` §5; `docs/CTO-BRIEF.md` §3 item 7 |
| Where data lives | On the customer's device (browser storage). No organisation accounts, no sync, no backup; clearing the browser loses records | `docs/CTO-BRIEF.md` §3 item 5; `docs/ORG-ACCOUNTS-DESIGN.md` (design only) |
| Customer build | Customer mode is the default on every host. A customer bundle is built with `node tools/build-site.mjs --customer --out <folder>`: it locks the research models off in the output `lensiq-config.js` (`LENSIQ_RESEARCH_DEMO = false`, `LENSIQ_PROFILE = "commercial"`, age/gender, expression and face parsing off) and fails (exit 1) unless the go-live items `config.profile` and `config.age_gender` read "ok" on that file (expression checked too). It never applies `deploy/public-site.json` (the closed-test Worker, test Turnstile key and tester gate): without `--site-config <customer file>` the bundle has no API. The face-api weight files (incl. `age_gender_model.bin`, UTKFace, and `face_expression_model.bin`) are still in the bundle, locked off but shipped. `npm run check:legal` on the repo still lists both items as open: the public demo site stays unlocked on purpose | `docs/CTO-BRIEF.md` §2; `tools/build-site.mjs` `--customer`; `tests/unit/build-site.test.js` |
| Field accuracy | Not measured for any product. No field pilot has run | `docs/FIELD-PILOT.md` "Status per round" (round 16: not started) |
| Legal review | Planned before sale; has not happened | `docs/CTO-BRIEF.md` §4 |
| Real-phone quality (stream B, 2026-11-13) | WebKit (iOS engine) e2e at iPhone width for the main flow of every product; crash guard on 24 camera pages (not on interview, qc, store, teamface: they store nothing at all) (restart note TH/EN/ZH + lighter camera); a JS-heap / renderer-memory budget per camera page (synthetic, headless). **Not measured on a real phone yet**: the owner's 15-minute checklists per product are ready | `docs/PHONE-QUALITY.md`; `docs/owner-checklists/` |

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
| **Pilot price (now)** | Free tier (owner decision 2026-11-13): up to 5 candidates per session, not enforced in code yet (`exam.html` may still show the earlier wording "1 room, 10 seats" until the page is changed). Field pilot: free. **10 THB per candidate per exam excl. 7 % VAT** (minimum 300 THB per session excl. 7 % VAT). Lab package **990 THB / month per lab excl. 7 % VAT**. Institution licence **from 19,900 THB / year excl. 7 % VAT** (≤ 1,000 candidates). Hall rows: approved but **not on sale** | `docs/PRICING-RESEARCH.md` §3.1 |
| **Regular price after the pilot thresholds are met** | 15–30 THB per candidate per exam; 990–1,490 THB / month; 30,000–120,000 THB / year (all excl. 7 % VAT). Only after the site passes `docs/pilot/PILOT-EXAM.md` | `docs/PRICING-RESEARCH.md` §3.1 |

**Must-fix-before-launch items that apply**

| Item | What | Status |
|---|---|---|
| L51 | Admin recovery codes: slow, salted hash | **done 2026-11-11.** Evidence: code `128d111`, test `ff31a0d` (what happens to existing codes at migration 0013), deploy record `4653700` (deployed on `lensiq-api-test`; owner re-issued; read-only check 10 salted codes, 0 old) |
| — | Hall mode labelled "experimental, not on sale yet" consistently everywhere | **done 2026-11-11.** Evidence: commit `72d733b`; name and status pins in `docs/claim-rules.json` (`tests/unit/claim-rules.test.js`) |
| — | No page claims more than was measured | **done 2026-11-11.** Evidence: commit `72d733b`; `docs/claim-rules.json` applied by `npm run accuracy:check` and `tests/unit/claim-rules.test.js` |
| — | Retention cron confirmed on | **done 2026-11-11.** Evidence: deploy record `4653700` (ran 03:17 UTC on `lensiq-api-test`; audit event `retention.run`) |
| L23 | Face model licences (face-api.js, flags F5 / F6 in `LICENSES/THIRD_PARTY.md`). Exam no longer uses face-api.js: `exam-lab.html` and `exam-hall.html` run MediaPipe Face Landmarker and COCO-SSD (both Apache-2.0), `exam.html` and `exam-dashboard.html` load no model; face-api.js is injected only with the research-demo switch on and `?faceengine=faceapi` (`lensiq-exam-face.js` `pickEngine`), never in a customer build (`docs/CTO-BRIEF.md` §5 "L23: Exam resolved"; checked 2026-11-14, `docs/PAGE-STATUS.md` point 2) | **resolved for Exam** (2026-11-10). Still open for Attendance face mode and the other face-api pages (§3) |
| L25 | Pricing terms and VAT, refund and contract terms | open (counsel) |
| L62 | Free-tier limits and the change from "free, every feature" (notice period, consumer-protection angle, contract wording) | open (counsel) |
| L26, L27 | Public procurement fit; vendor-neutral TOR wording (schools and universities) | open (counsel) |
| L28 | Partner agreement (only if sold through installers) | open (counsel) |
| L22 | Organisation accounts (only if central sync is sold; it is not today) | open (counsel) |

**What blocks selling Exam (lab)**

| Class | Blocker |
|---|---|
| code | None open. The four code items (L51, retention cron, labels, claims) are done (evidence above); C5 is handled in code by the customer build (`node tools/build-site.mjs --customer`); shipping the locked-off licence-limited weight files is an owner / counsel decision (C5) |
| owner | Seller details and VAT decision (section 1); one pilot institution; confirm the pilot targets (`docs/pilot/PILOT-EXAM.md` §6) |
| legal | Notice and consent text (`exam.html#notice`, `i18n/*-exam.js`); lawful basis public vs private institution and minors (`docs/PDPA-NOTES-FOR-COUNSEL.md` B1); evidence-clip questions if clips are offered (C2); MediaPipe mesh and human-oversight wording (`docs/PDPA-NOTES-FOR-COUNSEL.md` F5, not the licence flag F5); L25–L27 |

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
| **Pilot price (now)** | Free: up to 5 people, PIN / QR, 1 device (not enforced in code yet; a licence is needed beyond 5 people from a date to be announced). Standard: **19 THB per active person / month excl. 7 % VAT** (minimum 190 THB / month excl. 7 % VAT). Set-up help: **2,900 THB one-off excl. 7 % VAT** (optional). Multi-branch sync / cloud backup: not sold | `docs/PRICING-RESEARCH.md` §3.4 |
| **Regular price after the pilot thresholds are met** | 29 THB per active person / month (minimum 290 THB / month); set-up 4,900 THB one-off (excl. 7 % VAT) | `docs/PRICING-RESEARCH.md` §3.4 |

**Must-fix-before-launch items that apply**

| Item | What | Status |
|---|---|---|
| L51 | Admin recovery codes: slow, salted hash | **done 2026-11-11.** Evidence: code `128d111`, test `ff31a0d` (what happens to existing codes at migration 0013), deploy record `4653700` (deployed on `lensiq-api-test`; owner re-issued; read-only check 10 salted codes, 0 old) |
| — | No page claims more than was measured (the "fewer than 0.05 %" banner above is one candidate) | **done 2026-11-11.** Evidence: commit `72d733b`; `docs/claim-rules.json` applied by `npm run accuracy:check` and `tests/unit/claim-rules.test.js` |
| — | Retention cron confirmed on | **done 2026-11-11.** Evidence: deploy record `4653700` (ran 03:17 UTC on `lensiq-api-test`; audit event `retention.run`) |
| L23 | Face model licence (research-only training data) for the optional face mode | open (counsel; letters A / B in `docs/LICENCE-REQUESTS.md` not sent) |
| L25 | Pricing terms and VAT, refund and contract terms | open (counsel) |
| L62 | Free-tier limits and the change from "free, every feature" (notice period, consumer-protection angle, contract wording) | open (counsel) |
| L28 | Partner agreement (if sold through partners) | open (counsel) |
| L22 | Organisation accounts (multi-branch is not sold today) | open (counsel) |

**What blocks selling Attendance**

| Class | Blocker |
|---|---|
| code | None open. The code items above are done (evidence above); C5 is handled in code by the customer build (`node tools/build-site.mjs --customer`); shipping the locked-off licence-limited weight files is an owner / counsel decision (C5) |
| owner | Seller details and VAT decision; one pilot site with 5–20 staff; decide whether face mode is quoted before L23 is answered (`docs/ATTENDANCE-READINESS.md` B10) |
| legal | Employee notice and consent text; whether biometric consent is free in employment with the PIN / QR alternative (`docs/PDPA-NOTES-FOR-COUNSEL.md` B2; DPIA-L1; LRP-P2, LRP-L5); s.114 wording and 2-year minimum; works-rules wording for lateness beyond grace and OT rounding; 13-holiday text (`docs/ATTENDANCE-READINESS.md` "Needs outside resources"); L23 for face mode; L25 |

## 4. LENSIQ Gate — assisted plate reading (a person confirms every read)

| Section | Detail | Source |
|---|---|---|
| **Pages** | `gate.html` (landing), `parking.html` (car park), `village.html` (village / condo), `gate-notice.html` (printable PDPA sign + privacy-notice template) | `docs/GATE.md` header |
| **Works today** | Plate finder (classical) + LPD-YuNet proposals; PP-OCRv5 Thai recogniser; 5-frame vote; plate pattern check; 77-province pick-list; plate-likeness check before any auto-read; **the guard confirms or corrects every read**; hash-chained correction audit. Car park: entry / exit pairing, fee rules, shop stamps, static PromptPay QR, receipts, shift close. Village: residents, visitor passes, watch list with a recorded reason, optional relay through a same-origin bridge. On-site accuracy check (day / night, Wilson 95 %); owner photo tool. Crops off by default, logs 90 days, receipts 5 years | `docs/GATE.md` §1–§5 |
| **Measured: synthetic** | Plate found (top box) 97.1 % (136 / 140); exact read from one frame 58 % (81 / 140); plate-less scenes auto-read 0 / 20 · n = 140 / 20 scenes (demo set, seed 7) · synthetic | `docs/ACCURACY-CLAIMS.md` §5; `docs/ONE-PAGER-GATE.md` |
| **Measured: real photos, top box** | 44 % (14 / 32) · n = 32 photos with a plate · public dataset (Wikimedia Commons), labels v3 confirmed by the owner 2026-11-12 (the earlier 13 / 32 was labels v1; sources now agree) | `docs/ACCURACY-CLAIMS.md` §5 round 16; `docs/GATE.md` §3c |
| **Measured: real photos, exact automatic read** | 32 % (7 / 22); 30 % (7 / 23) counting one "unsure" photo · n = 22 (12 of them dev / tuning, optimistic) · public dataset | `docs/ACCURACY-CLAIMS.md` §5 |
| **Measured: real photos, taps needed** | 78 % (25 / 32) · n = 32 · public dataset | `docs/ONE-PAGER-GATE.md`; `docs/GATE.md` §3c |
| **Measured: photos without a plate read automatically** | 0 / 19 (3 / 19 before the check; 95 % interval 0–17 %); held-out half 0 / 8 (0–32 %; w30 moved to dev, same scene as w29) · public dataset, labels v3 | `docs/ACCURACY-CLAIMS.md` §5 |
| **Measured: by category** | Motorcycle plates exact 0 / 6; tap read 4 of 15 exact · public dataset | `docs/GATE.md` §3c |
| **Not measured** | Owner's ~100 phone photos; a real gate or car park (field) | `docs/ONE-PAGER-GATE.md` |
| **Known limits** | The OCR is a general Thai text model, not trained on plates, and is now the main limit; no Thai-trained detector is shipped yet (YOLOX-nano waits for the owner's file; YOLOv9 not used, L41) ⚠; numbers-only and legacy plates are not supported; a one-line plate-shaped sign can pass the pattern check; PromptPay payments are not confirmed automatically; the 30-day trial is text only (no timer); go2rtc is not wired into the camera source; relays need a same-origin bridge; about 1.5 s median per photo on a Mac (not a phone) | `docs/GATE.md` §1, §3c "Known limits", "Cost", §4, §6; `docs/CTO-BRIEF.md` §5 |
| **Positioning** | "Assisted reading: the guard taps to confirm" (owner decision 2026-11-09) | `docs/CTO-BRIEF.md` §5 Gate |
| **Pilot plan** | Phase 0: ~100 owner phone photos; phase 1: 1 car park + 1 village, ≥ 5 days, ≥ 200 reads (night ≥ 40, motorcycle ≥ 30). Targets (proposal): exact read ≥ 95 % day, ≥ 85 % night (Wilson 95 % lower bound), 0 silent wrong saves, taps ≤ 10 % (upper bound). ⚠ `docs/GATE.md:51` still says "≥ 100 vehicles incl. ≥ 30 at night" | `docs/pilot/PILOT-GATE.md` §5; `docs/ONE-PAGER-GATE.md` |
| **Pilot price (now)** | Trial: **free 30-day trial**, 1 lane, 100 reads / day, logs kept 7 days (not enforced in code yet; a licence is needed beyond it). Village / condo: **490 THB / month per lane excl. 7 % VAT**. Car park (PromptPay, receipts, shift close included): **790 THB / month per lane excl. 7 % VAT**. Set-up visit: **2,500 THB per visit excl. 7 % VAT**. Hardware not sold | `docs/PRICING-RESEARCH.md` §3.2 |
| **Regular price after the pilot thresholds are met** | Village 990 THB / month per lane, 1,990 THB / month for 3 lanes; car park 1,490 THB / month per lane; set-up 3,000–5,000 THB per visit (excl. 7 % VAT) | `docs/PRICING-RESEARCH.md` §3.2 |

**Must-fix-before-launch items that apply**

| Item | What | Status |
|---|---|---|
| L51 | Admin recovery codes: slow, salted hash | **done 2026-11-11.** Evidence: code `128d111`, test `ff31a0d` (what happens to existing codes at migration 0013), deploy record `4653700` (deployed on `lensiq-api-test`; owner re-issued; read-only check 10 salted codes, 0 old) |
| — | No page claims more than was measured | **done 2026-11-11.** Evidence: commit `72d733b`; `docs/claim-rules.json` applied by `npm run accuracy:check` and `tests/unit/claim-rules.test.js` |
| — | Retention cron confirmed on | **done 2026-11-11.** Evidence: deploy record `4653700` (ran 03:17 UTC on `lensiq-api-test`; audit event `retention.run`) |
| L24 | Gate sign wording, legal basis (s.24(5) / s.24(3)), plate retention; owner photos of public streets | open (counsel) |
| L25 | Pricing terms and VAT, incl. the 30-day trial wording (not enforced in code) | open (counsel) |
| L62 | Free-tier limits and the change from "free, every feature" (notice period, consumer-protection angle, contract wording) | open (counsel) |
| L26, L27 | Public procurement and TOR wording (public car parks) | open (counsel) |
| L28 | Partner (installer) agreement | open (counsel) |
| L41 | YOLOv9 plate detector | closed: not used (2026-11-10) |
| L22 | Organisation accounts (central plate history is not sold today) | open (counsel) |

**What blocks selling Gate**

| Class | Blocker |
|---|---|
| code | None open. The code items above are done (evidence above); C5 is handled in code by the customer build (`node tools/build-site.mjs --customer`); shipping the locked-off licence-limited weight files is an owner / counsel decision (C5) |
| owner | Seller details and VAT decision; ~100 phone photos for phase 0; one car park and one village for phase 1; the Thai YOLOX-nano ONNX file |
| legal | L24 (sign, basis, retention); visitor names / phones typed by guards and the deny list (`docs/PDPA-NOTES-FOR-COUNSEL.md` B3, E2); L25–L28 |

## 5. LENSIQ Crowd — events, experimental (not for dense crowds)

| Section | Detail | Source |
|---|---|---|
| **Pages** | `crowd.html`; sign A on `camera-notice.html` | `docs/PDPA-NOTES-FOR-COUNSEL.md` C1 |
| **Works today** | People in view (5-frame median) and in a drawn zone; entry / exit line with an anonymous tracker; density heatmap; peak hours; "≈ estimate" label from 15 people or ≥ 2 people / m²; "people look small" hint; "expected crowd at peak" setting that warns when the detector collapses; marketing CSV with a caveat header; JSON summary; operator confirms a notice is posted before the camera starts; day records capped at 60 days | `docs/CROWD-ACCURACY.md` "What the page does with this"; `docs/ONE-PAGER-CROWD.md`; `docs/pdpa-notes/S1-A-crowd.md` |
| **Status label** | Task wording and `docs/CTO-BRIEF.md:22`: experimental. `docs/PAGE-STATUS.md` now also says experimental (commit `72d733b`); every page, card and one-pager use the same words | **done 2026-11-11** |
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
| **Pilot price (now)** | Free tier (owner decision 2026-11-13): 2 hours per device per day, not enforced in code yet. Event day: **590 THB per device per day excl. 7 % VAT**. Event week: **2,490 THB per device excl. 7 % VAT**. Monthly fixed site: 290 THB / month per device excl. 7 % VAT, approved but **held back** until a fixed-site pilot passes. Dense crowds (≈ 50+ in view): **not sold** | `docs/PRICING-RESEARCH.md` §3.3 |
| **Regular price after the pilot thresholds are met** | Event day 990 THB; event week 3,900 THB; monthly 490 THB per device (excl. 7 % VAT). Sales text must say "density estimate, not an exact count" | `docs/PRICING-RESEARCH.md` §3.3 |

**Must-fix-before-launch items that apply**

| Item | What | Status |
|---|---|---|
| L51 | Admin recovery codes: slow, salted hash | **done 2026-11-11.** Evidence: code `128d111`, test `ff31a0d` (what happens to existing codes at migration 0013), deploy record `4653700` (deployed on `lensiq-api-test`; owner re-issued; read-only check 10 salted codes, 0 old) |
| — | Crowd labelled consistently (experimental, not for dense crowds) everywhere | **done 2026-11-11.** Evidence: commit `72d733b`; name and status pins in `docs/claim-rules.json` (`tests/unit/claim-rules.test.js`) |
| — | No page claims more than was measured | **done 2026-11-11.** Evidence: commit `72d733b`; `docs/claim-rules.json` applied by `npm run accuracy:check` and `tests/unit/claim-rules.test.js` |
| — | Retention cron confirmed on | **done 2026-11-11.** Evidence: deploy record `4653700` (ran 03:17 UTC on `lensiq-api-test`; audit event `retention.run`) |
| L25 | Pricing terms and VAT, refund and contract terms | open (counsel) |
| L62 | Free-tier limits and the change from "free, every feature" (notice period, consumer-protection angle, contract wording) | open (counsel) |
| L28 | Partner agreement (event agencies, installers) | open (counsel) |

**What blocks selling Crowd**

| Class | Blocker |
|---|---|
| code | None open. The code items above are done (evidence above); C5 is handled in code by the customer build (`node tools/build-site.mjs --customer`); shipping the locked-off licence-limited weight files is an owner / counsel decision (C5) |
| owner | Seller details and VAT decision; two people for the human count (about 1–2 hours, `docs/CROWD-ACCURACY.md` "Deferred"); one event site; a real mid-range phone for timing; confirm the status label |
| legal | Lawful basis for anonymous counting at events (notice + legitimate interest, or also ticket terms) and the default retention of day records (`docs/PDPA-NOTES-FOR-COUNSEL.md` C1); sign A wording; L25, L28 |

## 6. Cross-product list of blockers

### Code

| # | Blocker | Products | Status |
|---|---|---|---|
| C1 | L51: admin recovery codes stored with a slow, salted hash; existing codes re-issued | all (back office) | **done 2026-11-11**; code re-read 2026-11-14 (`backend/src/auth.js` `issueRecoveryCodes` / `claimRecovery`: random row id, 16-byte salt, PBKDF2-SHA256 × 2,000 of an HMAC keyed from `SECRETS_KEK`, constant-time compare) and a whole-database check added (`tests/unit/backend-recovery-storage.test.js`). The pre-0013 SHA-256 path still accepts old rows; the test Worker has 0 of them (deploy record `4653700`) |
| C2 | Retention cron confirmed on | all (backend) | **done 2026-11-11** (audit `retention.run` 03:17 UTC) |
| C3 | Hall mode and Crowd labels consistent on every page, category page, catalogue and one-pager | Exam, Crowd | **done 2026-11-11** (commit `72d733b`; claim-rules check added) |
| C4 | No page claims more than was measured (candidates found while writing this file: section 7 items 1, 2, 4) | all | **done 2026-11-11** (commit `72d733b`; claim-rules check added) |
| C5 | Customer install locks the research models off (`LENSIQ_RESEARCH_DEMO = false`); go-live items `config.profile`, `config.age_gender` | all | **closed in code (locked off), 2026-11-14:** `node tools/build-site.mjs --customer` sets the lock and verifies both items "ok" (and expression off) on the output, else exit 1; it never applies the public test-site config `deploy/public-site.json`, so the bundle has no API unless the owner passes a separate customer config with `--site-config <file>` (tester gate always off; a config whose API is on workers.dev or a "-test" host, or that reuses the public test Turnstile key, is refused; `tests/unit/build-site.test.js`). **Still open, owner / counsel decision:** the licence-limited weight files (`vendor/models/age_gender_model.*` UTKFace, `face_expression_model.*`, and the other face-api weights) are still shipped in the bundle, only locked off (`docs/LEGAL-PACKET.md` §9.1, L23). Per install the owner ships that output folder (not a copy of the repo or of the public site) and, if the customer needs the backend, writes and passes the customer site config. Both items stay open in `npm run check:legal` for the repo by design (public demo site) |

Not blockers by owner decision: the Gate trial timer (deferred to org accounts and billing, `docs/CTO-BRIEF.md` §5);
organisation accounts and sync (not sold; `docs/PRICING-RESEARCH.md` §3.4); e-Tax invoice (quotation sales can use the
accountant's invoices; see owner item O3).

### Owner

| # | Blocker | Products |
|---|---|---|
| O1 | Seller details in `LENSIQ_SELLER` and the Worker: name, tax ID, address, e-mail, effective date, DPO e-mail (all empty today; the separate DPO e-mail is pending, the owner will send the address; documents show LINE @632yliiw until then, legal item L61) | all |
| O2 | VAT registration decision (prices are quoted excl. 7 % VAT; no VAT line if not registered, `docs/PRICING-RESEARCH.md` header) | all |
| O3 | Quotation, invoice / tax-invoice and receipt template; bank account for transfers; who issues them (decided 2026-11-13: the owner issues receipts from the template, bank transfer only; accountant's answers on the numbering series and tax invoice: `docs/sales/ACCOUNTANT-QUESTIONS-TH.md`) | all |
| O4 | At least one field pilot per product; until then only pilot prices apply | all |
| O5 | Confirm the pilot targets (all are proposals) and, for Exam, the Wilson rule before phase 2 | all |
| O6 | Engage counsel and send `docs/LEGAL-PACKET.md` | all |
| O7 | Crowd: human count (two people); Gate: phone photos and the YOLOX-nano file; Attendance: decide face mode before L23 | Crowd, Gate, Attendance |
| O8 | Native-speaker review of TH / EN / ZH sales texts (`docs/CTO-BRIEF.md` §5 "Owner and outside actions") | all |

### Legal

| # | Blocker | Products |
|---|---|---|
| G1 | Review of `privacy.html`, `terms.html`, `camera-notice.html`, `gate-notice.html`, the exam notice, consent texts and the pilot agreement | all |
| G2 | L25 pricing terms, VAT basis, refunds, contract terms; L62 free-tier limits | all |
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
   give 13 / 32 (41 %); `docs/GATE.md:300` gives 14 / 32 (44 %) after the 2026-11-10 box re-check. **Resolved
   2026-11-12:** the owner confirmed labels v3; every page and doc now gives 14 / 32 (44 %) (`ACCURACY.md` §15).
3. **Gate detector licence.** `docs/GATE.md:260` says "the shipped plate detector is LPD-YuNet, MIT";
   `docs/GATE.md:20`, `docs/CTO-BRIEF.md` §2 and `vendor/models/plate-det/LICENSE` say Apache-2.0.
4. **Thai plate detector.** `docs/GATE.md:353` says "The delivered detector is the Thai-trained YOLOX-nano"; the repo
   ships only LPD-YuNet (`vendor/models/plate-det/`), `docs/LICENCE-REQUESTS.md` item 6 says "in progress", and
   `docs/CTO-BRIEF.md` §5 says it is integrated "as soon as the owner delivers the ONNX file".
5. **Gate field target.** `docs/GATE.md:51`: "≥ 95 % from ≥ 100 vehicles incl. ≥ 30 at night" (also
   `docs/ACCURACY-CLAIMS.md:77`); `docs/pilot/PILOT-GATE.md` §5 and `docs/FIELD-PILOT.md` §5: ≥ 200 reads, night ≥ 40.
6. **Crowd status.** `docs/CTO-BRIEF.md:22`: experimental; `docs/PAGE-STATUS.md:100`: pilot-ready.
7. ~~**Exam face licence.**~~ Fixed 2026-11-14: the L23 rows here, in `docs/CTO-BRIEF.md` §8 and in `docs/LEGAL-PACKET.md` §9.1 now say "resolved for Exam, open for Attendance face mode and the other face-api pages", and `docs/PAGE-STATUS.md` names the models the Exam pages actually load instead of F5/F6.
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

## 8. วิธีขายภายในสัปดาห์นี้ (checklist ภาษาไทย ต่อผลิตภัณฑ์)

> ร่าง 2026-11-13 สำหรับเจ้าของ ขายด้วยใบเสนอราคาและโอนผ่านธนาคารเท่านั้น (ไม่มี PromptPay QR บัตร หรือชำระออนไลน์ ตามที่เจ้าของตัดสิน 2026-11-13) ราคาทุกบรรทัดมาจากรายการราคาที่อนุมัติ 2026-11-09
> (`docs/PRICING-RESEARCH.md` §3) ไม่รวม VAT 7% ใบเสนอราคาคิดเงินตาม **ราคานำร่อง** และแสดง **ราคาปกติหลังผ่านเกณฑ์นำร่อง** ไว้ข้างกัน (เจ้าของตัดสิน 2026-11-13 ทางเลือก ข) ราคาปกติคิดเงินได้เมื่อไซต์ผ่านเกณฑ์ของตัวเองแล้ว (OP-10 เหลือข้อความสัญญา) เอกสารทุกฉบับอยู่ใน `docs/sales/` (ดัชนี: `docs/sales/README.md`)
> ตัวเลขความแม่นยำที่พูดกับลูกค้าต้องมีที่มาตาม `docs/ACCURACY-CLAIMS.md` ผลหน้างานจริงยังไม่มีสำหรับทุกผลิตภัณฑ์

### 8.0 ต้องเสร็จก่อนส่งใบเสนอราคาใบแรก (ทุกผลิตภัณฑ์)

| # | สิ่งที่ต้องทำ | ใคร | สถานะ 2026-11-13 |
|---|---|---|---|
| 1 | กรอกข้อมูลผู้ขาย: ชื่อ เลขผู้เสียภาษี ที่อยู่ สาขา บัญชีธนาคารสำหรับโอน ผู้ติดต่อ (OP-01) ใน `LENSIQ_SELLER` และ Worker | เจ้าของ | **ยังว่าง** (`node tools/check-legal.mjs`: 0 จาก 11 ข้อ) |
| 2 | ตัดสินเรื่องจดทะเบียน VAT (OP-02) ถ้าไม่จด ไม่มีบรรทัด VAT และออกใบกำกับภาษีไม่ได้ | เจ้าของ + นักบัญชี | รอ ส่งคำถามได้ทันที: `docs/sales/ACCOUNTANT-QUESTIONS-TH.md` และฉบับหน้าเดียว `docs/sales/ACCOUNTANT-ONE-PAGE-TH.md` |
| 3 | นักบัญชียืนยันเลขที่เอกสารไม่ขาดตอน ภาษีหัก ณ ที่จ่าย 3% และใบเสร็จ/ใบกำกับ (OP-03 ถึง OP-05, OP-07) ระหว่างนี้เจ้าของออกเลขเองจากแม่แบบ | นักบัญชี | รอคำตอบ |
| 4 | ให้ทนายตรวจชุดเอกสารลูกค้า `docs/legal/customer/` (ข้อกำหนด DPA ประกาศ ความยินยอม สัญญานำร่อง) และข้อความระดับฟรี (L62) ก่อนขายครั้งแรก (OP-24) | ทนาย | รอ ส่งชุด `docs/LEGAL-PACKET.md` |
| 5 | ยืนยันว่าเสนอราคาได้แล้ว และอัปเดตป้าย "ราคาที่อนุมัติแล้ว ยังไม่เปิดขาย" บนหน้าเว็บ (OP-09) | เจ้าของ | รอ |
| 6 | กำหนดอายุใบเสนอราคา กำหนดชำระ มัดจำ (OP-06) | เจ้าของ | รอ (ร่าง 30 วัน) |
| 7 | ช่องทางติดต่อและสนับสนุนที่จะใส่ในเอกสาร (OP-16) ระหว่างนี้ LINE @632yliiw | เจ้าของ | รอ |

ข้อ 1, 2, 4 เป็นเงื่อนไขที่ทำให้ "ขายได้จริง" ยังไม่ผ่าน ส่วนที่ทำได้ทันทีโดยไม่ต้องรอ: เดโม สไลด์ ส่งคำถามนักบัญชี และนัดไซต์นำร่อง

### 8.1 ขั้นตอนเดียวกันทุกผลิตภัณฑ์ (ใบเสนอราคา → ใบสั่งซื้อ → ใบแจ้งหนี้ → โอนเงิน → ใบเสร็จ → เริ่มใช้งาน)

1. **เดโม 10 นาที** ตามสคริปต์ของผลิตภัณฑ์ ใช้โหมด `?demo=1` (ข้อมูลตัวอย่างเท่านั้น) แล้วส่งสไลด์ (`DECK-*.md`)
2. **ใบเสนอราคา** (`QUOTATION-TEMPLATE.md`): ใช้ตารางราคา §2 คิดเงินตามคอลัมน์ "ราคานำร่อง" และแสดงคอลัมน์ "ราคาปกติหลังผ่านเกณฑ์นำร่อง" ไว้ข้างกัน (ตัดสิน 2026-11-13) ใส่ "ไม่รวม VAT 7%" ทุกบรรทัด ไม่เพิ่มบรรทัดนอกตาราง (ค่าเดินทาง ไม่อยู่ในราคาอนุมัติ OP-19) ระบุเงื่อนไขโอนผ่านธนาคารเท่านั้น
3. **ใบสั่งซื้อ** (`ORDER-FORM.md`): ลูกค้าเซ็นยืนยัน พร้อมข้อ 6 การประมวลผลข้อมูล (DPA) และข้อความระดับฟรี (ข้อจำกัดบังคับผ่านสัญญา ประกาศล่วงหน้า 30 วันขึ้นไป เริ่มใช้หลังประกาศ 30 วัน ลูกค้าส่งออกข้อมูลได้เสมอ)
4. **ใบแจ้งหนี้** (`INVOICE-TEMPLATE.md`): เจ้าของออกเลขที่เอง ใส่เลขที่ใบแจ้งหนี้ให้ลูกค้าระบุในบันทึกการโอน
5. **ลูกค้าโอนเงิน** เข้าบัญชีที่ระบุ ส่งหลักฐานทางอีเมลหรือ LINE เจ้าของตรวจยอดเข้าบัญชีจริงก่อนออกใบเสร็จ (ถ้าลูกค้าหัก ณ ที่จ่าย ให้โอนยอดหลังหัก และรอหนังสือรับรอง 50 ทวิ OP-05)
6. **ใบเสร็จ** (`RECEIPT-TEMPLATE.md`): ออกหลังเงินเข้าบัญชีแล้วเท่านั้น เจ้าของออกเองจากแม่แบบ ถ้าจด VAT ให้ถามนักบัญชีว่าออกใบกำกับภาษีเป็นฉบับเดียวกันหรือแยก (OP-07)
7. **เริ่มใช้งาน** ตามคู่มือ `ONBOARDING-*.md` ของผลิตภัณฑ์ (ติดตั้ง วันแรก ปัญหาที่พบบ่อย ติดต่อใคร) และเก็บเอกสารทั้งหมดไว้ 5 ปี (R5 ถามนักบัญชี)

### 8.2 Exam (ห้องคอมพิวเตอร์ / lab mode)

- **เดโม:** `DEMO-SCRIPT-EXAM.md` เปิด `exam-dashboard.html?demo=1` (มี tally ตัวอย่างเติมไว้แล้ว ตัวเลขเป็นข้อมูลจำลอง ไม่ใช่ความแม่นยำ) และ `exam-lab.html?demo=1` ไม่ต้องใช้กล้อง
- **ข้อเสนอสัปดาห์นี้:** (ก) โครงการนำร่องฟรี 1 สถาบัน ไม่เกิน 4 สัปดาห์ ไม่เกิน 3 ห้อง แลกกับการจดแจ้งถูก/แจ้งผิด (ชุดนำร่อง `docs/pilot/exam-lab/`, `docs/pilot/PILOT-EXAM.md`) หรือ (ข) ใบเสนอราคานำร่อง: 10 บาทต่อผู้สอบต่อการสอบ (ขั้นต่ำ 300 บาทต่อรอบ) หรือ 990 บาทต่อห้องปฏิบัติการต่อเดือน ไม่รวม VAT 7% ระดับฟรี: ถึง 5 ผู้สอบต่อรอบสอบ
- **ห้ามใส่ในใบเสนอราคา:** ห้องสอบที่มีกล้อง (`exam-hall.html`) เป็นรุ่นทดลอง ไม่ขาย
- **ต้องบอกลูกค้า:** ผู้คุมสอบตัดสินเสมอ สัญญาณ "มากกว่าหนึ่งคน" แจ้งได้ 28.8% (15 / 52 ภาพ ชุดข้อมูลสาธารณะ ไม่ใช่ห้องสอบจริง) ในห้องสอบจริงยังไม่ได้วัด ยังดูสดข้ามเครื่องไม่ได้ ต้องส่งออกไฟล์หลังสอบ (OP-25) ผู้ไม่ยินยอมสอบโดยไม่เปิดกล้อง ประกาศผู้สอบ ≥ 7 วันก่อนสอบ ผู้สอบที่ยังไม่บรรลุนิติภาวะต้องรอทนาย (OP-22)
- **หลังโอน:** `ONBOARDING-EXAM.md` อบรมผู้คุมสอบ 1 ชั่วโมง ตรวจกล้องและแสงก่อนวันสอบ

### 8.3 Attendance (PIN / QR เป็นค่าเริ่มต้น)

- **เดโม:** `DEMO-SCRIPT-ATTENDANCE.md` เปิด `attendance.html?mode=employee&demo=1` (พนักงานสมมติ 8 คน ข้อมูลเดือนที่แล้ว ส่งออก CSV ขึ้นต้น SAMPLE)
- **ข้อเสนอสัปดาห์นี้:** ใบเสนอราคานำร่อง: 19 บาทต่อคนที่ใช้งานต่อเดือน (ขั้นต่ำ 190 บาทต่อเดือน) ช่วยตั้งค่า 2,900 บาทครั้งเดียว (ไม่บังคับ) ไม่รวม VAT 7% ระดับฟรี: ถึง 5 คน PIN/QR 1 เครื่อง นำร่อง 2 สัปดาห์ เทียบ CSV เงินเดือนกับของเดิมหนึ่งรอบเดือน (`docs/PILOT-PLAN.md`)
- **ห้ามเสนอ:** ใบหน้าเป็นจุดขาย (รอสรุปใบอนุญาตโมเดล L23 / OP-14) ซิงก์หลายสาขา (ยังไม่ขาย) ค่าจ้างภาษีประกันสังคม (ระบบไม่คำนวณ)
- **ต้องบอกลูกค้า:** พื้นที่เบราว์เซอร์ราว 20 คน × 2 ปีต่อเครื่อง ไม่มีซิงก์คลาวด์ ต้องแจ้งพนักงานก่อนใช้ (ประกาศ PDPA ในหน้า) ที่ทำงานจริงยังไม่ได้วัด นิยาม "คนที่ใช้งาน" รอเจ้าของ (OP-08)
- **หลังโอน:** `ONBOARDING-ATTENDANCE.md`

### 8.4 Gate (ช่วย รปภ. อ่านป้าย)

- **เดโม:** `DEMO-SCRIPT-GATE.md` เปิด `village.html?demo=1` และ `parking.html?demo=1` (บ้านและรถสมมติ ไม่มีหมายเลขพร้อมเพย์จริง รปภ. ต้องกดยืนยันทุกป้าย)
- **ข้อเสนอสัปดาห์นี้:** ทดลองฟรี 30 วัน (1 ช่องทาง 100 ป้ายต่อวัน เก็บบันทึก 7 วัน นับวันด้วยมือ ยังไม่มีตัวจับเวลาในระบบ) แล้วใบเสนอราคานำร่อง: หมู่บ้าน/คอนโด 490 บาทต่อช่องทางต่อเดือน ลานจอดรถ 790 บาทต่อช่องทางต่อเดือน (รวมพร้อมเพย์ ใบเสร็จ ปิดกะ) ติดตั้งหน้างาน 2,500 บาทต่อครั้ง ไม่รวม VAT 7% ไม่รวมอุปกรณ์
- **ห้ามเสนอ:** ไม้กั้นหรือรีเลย์อัตโนมัติ กล้อง หรืออุปกรณ์ (ไม่ขาย) การเปิดไม้กั้นอัตโนมัติ (ปิดเป็นค่าเริ่มต้น)
- **ต้องบอกลูกค้า:** รปภ. ยืนยันทุกป้าย ภาพจริงต้องแตะกรอบเอง 78% (ชุดข้อมูลสาธารณะ ไม่ใช่หน้างาน) ต้องติดป้ายแจ้งก่อนใช้ (รอทนาย L24) ความแม่นยำหน้างานจริงยังไม่ได้วัด
- **หลังโอน:** `ONBOARDING-GATE.md` ตามเกณฑ์นำร่อง `docs/pilot/PILOT-GATE.md`

### 8.5 Crowd (งานอีเวนต์ ทดลอง)

- **เดโม:** `DEMO-SCRIPT-CROWD.md` เปิด `crowd.html?demo=1` (ฉากจำลอง ไม่มีภาพบุคคล) พูดทุกครั้งว่า "ค่าประมาณ ไม่ใช่จำนวนแน่นอน ยังไม่เหมาะกับฝูงชนหนาแน่น"
- **ข้อเสนอสัปดาห์นี้:** ใบเสนอราคานำร่อง: วันงาน 590 บาทต่อเครื่องต่อวัน หรือสัปดาห์งาน 2,490 บาทต่อเครื่อง (7 วัน) ไม่รวม VAT 7% ไม่รวมอุปกรณ์ ระดับฟรี 2 ชั่วโมงต่อเครื่องต่อวัน นำร่องที่ไซต์ 2–3 วัน เทียบกับคนนับ 2 คนทุก 5 นาที (`docs/pilot/PILOT-CROWD.md`)
- **ห้ามเสนอ:** รายเดือนพื้นที่ถาวร (ยังไม่ขายจนกว่าโครงการนำร่องพื้นที่ถาวรผ่าน) ฝูงชนหนาแน่น (ประมาณ 50 คนขึ้นไปในภาพ) การใช้ตัดสินความปลอดภัยของฝูงชน
- **ต้องบอกลูกค้า:** นับต่ำกว่าจริง 26–59% ในคลิปคนเบาบางถึงปานกลาง (ผลเบื้องต้น เทียบ AI ไม่ใช่คนนับ) ต้องติดป้าย A ที่ทางเข้าพื้นที่ ไม่ประมาณอายุ เพศ หรือสีหน้า
- **หลังโอน:** `ONBOARDING-CROWD.md`

## 9. Buyer walkthrough 2026-11-14: fixes on branch `walk-fix` (not merged yet)

Defects: `~/LENSIQ-field/review/walkthrough-2026-11-14/DEFECTS.md` (W-001 … W-038). Tests locked first: `evals-locks/walk-fix.sha256`.

- Each product page (exam, attendance, gate, crowd) now ends and starts with "ขอใบเสนอราคา" (form with the product preselected)
  and "ดูเดโม" (`?demo=1`). Category CTAs preselect their product; `#contact` keeps the form in view while the home page renders.
- Attendance: employee mode opens on the PIN / QR tab (first tab), h1 and menu name are the PIN / QR time clock, face stays as an
  option. The bare `attendance.html` still opens in training mode (existing tests depend on it): link buyers to `?mode=employee`.
- §7 item 5 (Gate field target): `gate.html` now states the PILOT-GATE §5 bar (≥ 200 reads, night ≥ 40, motorcycles ≥ 30;
  day ≥ 95 %, night ≥ 85 %, Wilson lower bound). Resolved on the page; `docs/GATE.md:51` still has the old wording.
- §7 item 12 (Exam lab unit): page and one-pager now say "per computer lab" / "ห้องแล็บคอมพิวเตอร์" / "计算机机房". Resolved.
- Gate figures on `gate.html` follow `docs/accuracy-figures.json` (14 / 32; 0 / 19 with 11 tuning, 0 / 8 held out).
- Solutions catalogue badges use the category vocabulary (พร้อมนำร่อง / ทดลอง / สาธิต / กำลังพัฒนา) per linked page; Crowd = ทดลอง.
- Customer onboarding guides (TH / EN / ZH, LINE @632yliiw, e-mail and phone "[เจ้าของจะแจ้ง]"): `docs/sales/customer/`.
  The internal guides in `docs/sales/` stay for the team.
- Still with the owner: W-003 / W-007 / W-015 / W-016 (sale-status and price wording), W-013 / W-014 (home emphasis, emotion
  content), W-030 (Gate retention: code default 90 days, free-trial 7-day log limit not enforced in code), W-035 (leads in
  localStorage), W-031 (Chinese line on the Gate sign: legal wording, L24).
