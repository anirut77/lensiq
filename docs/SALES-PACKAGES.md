# Sales packages: Institution bundle and Installer partner programme

> **DRAFT — not approved, not on sale (ร่าง ยังไม่อนุมัติ ยังไม่เปิดขาย).** Everything in this file is a proposal for the
> owner. It is built only from the **approved price list** in `docs/PRICING-RESEARCH.md` §3 (owner decisions
> 2026-11-09). It adds **no new unit price**: every figure below is an approved level multiplied out, with the
> arithmetic shown. Bundle discounts and partner shares are new proposals and need owner approval. Legal points are
> listed in section C and need a lawyer before any of this is offered.
>
> All prices are in THB and **excl. 7% VAT** ("ไม่รวม VAT 7%" / "不含 7% 增值税"); the customer pays the figure + 7%.
> Yearly = 10 × monthly (BILLING-PLAN rule). "Pilot stage" applies now; "after pilot" applies to a site only once it
> has passed the thresholds in its pilot kit (`docs/pilot/PILOT-*.md`). Written 2026-11-09, round 16.
>
> **Owner decisions of 2026-11-13 that apply to this file:** payment is by bank transfer only (no PromptPay QR, card or Opn); the owner issues receipts from the template and the system does not number them (questions for the accountant: `docs/sales/ACCOUNTANT-QUESTIONS-TH.md`); the business products have a limited free tier (Gate 30-day trial, 1 lane, 100 plates per day · Attendance up to 5 people · Exam up to 5 candidates per session · Crowd 2 hours per device per day) and a licence is needed beyond it. The limits are not enforced in the product yet: they apply from a date to be announced with at least 30 days' notice, and the owner enforces them by contract (a limit on the user's device can be bypassed by someone who edits the code; the contract binds). The bundle and partner prices below are unchanged by this decision.

Standing rules that every package below inherits (CLAUDE.md):

- Video is processed **on the device**; no images of people leave the device or are stored. Only derived facts
  (counts, events, time punches) are kept, on the customer's device.
- **A person decides.** Exam flags a seat for an invigilator to look at and never decides misconduct; Gate is
  **assisted reading, the guard taps to confirm**; Attendance lists exceptions for a manager to check.
- No emotion inference in Exam, HR or Education, and no lie / deception detection anywhere.
- Age / gender and expression models are **off in customer builds** (licence-limited; demo mode only).
- Crowd is **experimental** (events; owner order 2026-11-11), **not yet suitable for dense crowds** and gives a density estimate, not an exact headcount.
- Every accuracy claim states its source (synthetic / public dataset / field). Field accuracy is **not measured yet**
  for any of these products (`docs/PRICING-RESEARCH.md` §2).

---

## A. Institution bundle: Exam + Attendance + Crowd, yearly (universities and schools)

### A.1 What is in it

| Part | Approved line used | What the institution gets |
|---|---|---|
| **Exam** | Institution licence (`exam_institution`) | Whole-institution licence, unlimited rooms, computer-room / online mode (`exam-lab.html`) and camera-hall mode (`exam-hall.html`, **experimental, not sold until the small-face issue is fixed**: owner decision 2026-11-10, `docs/exam/FACE-ENGINE-RESULTS.md` §7), invigilator dashboard, invigilator training. Pilot stage covers up to 1,000 candidates. |
| **Attendance** | Standard (`attendance_employee`), yearly = 10 × monthly | Staff time attendance with PIN / QR by default (face optional, with consent), shifts, OT, holidays, payroll CSV. Training / event check-in mode is on the same page. |
| **Crowd** | Event day / event week (`crowd_event_day`, `crowd_event_week`) as a yearly allowance | Zone counts, entry / exit line and density estimate for open days, graduation, exam-hall entrances and canteens, sparse to medium crowds only. **Crowd monthly is not in the bundle**: it waits for a fixed-site pilot (owner decision 4). |
| Set-up (optional) | Attendance set-up help (`attendance_setup`) | Shift tables, payroll CSV mapping, DPIA template filled with the institution. |

Not in the bundle: hardware (the institution uses its own PCs, phones, tablets and cameras), Gate (can be quoted
separately at the approved Gate prices), multi-campus cloud sync (not sold until organisation accounts, Round 16 item
4, are approved and built), and dense-crowd counting (not sold).

### A.2 Yearly price (derived from the approved levels)

Formula, per year, excl. 7% VAT:

```
bundle = Exam institution licence
       + Attendance: staff × per-person monthly price × 10   (at least the monthly minimum × 10)
       + Crowd: event weeks × week price + event days × day price
       (+ optional one-off Attendance set-up help)
```

**Worked example S — a school or one faculty:** ≤ 1,000 candidates a year, 30 staff on time attendance, Crowd for
2 event weeks (open house, graduation week) and 4 single event days.

| Line | Pilot stage (now) | After pilot |
|---|---|---|
| Exam institution licence | 19,900 | 30,000 (low end of 30,000–120,000 "by size") |
| Attendance 30 staff × 10 months | 30 × 19 × 10 = 5,700 (monthly 570 ≥ minimum 190) | 30 × 29 × 10 = 8,700 (monthly 870 ≥ minimum 290) |
| Crowd 2 event weeks | 2 × 2,490 = 4,980 | 2 × 3,900 = 7,800 |
| Crowd 4 event days | 4 × 590 = 2,360 | 4 × 990 = 3,960 |
| **Yearly total, excl. 7% VAT** | **32,940** | **50,460** |
| VAT 7% | 2,305.80 | 3,532.20 |
| Total to pay incl. VAT | 35,245.80 | 53,992.20 |
| Optional one-off set-up help | + 2,900 (+ 203 VAT) | + 4,900 (+ 343 VAT) |

**Worked example L — a large faculty / small university (after pilot, upper end):** Exam 120,000 (top of the approved
range) + Attendance 60 staff × 29 × 10 = 17,400 + Crowd 4 event weeks × 3,900 = 15,600 + 8 event days × 990 = 7,920
→ **160,920 excl. 7% VAT** (VAT 11,264.40; total 172,184.40).

Notes on the arithmetic:

- Each part can be at a different stage: Exam may have passed its pilot while Crowd has not. Each line uses its own
  stage; the price of a part moves to "after pilot" only for the site that passed.
- **No bundle discount is applied.** A bundle discount (for example 10% off the yearly total for all three parts) is
  a new pricing decision for the owner (question B-1 below), not part of the approved list.
- Attendance today keeps data in the browser of each device (about 20 employees × 2 years per device,
  `docs/ATTENDANCE-READINESS.md`). Example S assumes 2 time clocks (e.g. two offices) merged with the built-in file
  export / import; example L assumes 3–4 time clocks merged the same way. Much larger staff numbers (or live
  multi-campus sync) need organisation accounts (item 4) before they are sold.
- The Exam institution licence covers up to 1,000 candidates at the pilot-stage price; above that the after-pilot
  "by size" range applies and must be quoted (the size bands inside 30,000–120,000 are not defined yet — owner
  question B-2).

### A.3 What the institution provides

- Devices: lab PCs or laptops with a webcam (computer-room mode), phones / laptops with a camera for exam halls (the number
  of cameras depends on room size, see the guide: `docs/EXAM.md` "Hall camera placement guide"), a phone or tablet per time clock, a phone or laptop camera per Crowd point.
- A modern browser (Chrome / Edge / Safari). Several devices are merged by file export / import (no server or cloud
  account needed); a live local relay is not built yet.
- A named project owner, an IT contact and, for the pilot, invigilators who keep tallies (`docs/pilot/PILOT-EXAM.md`)
  and two manual counters for Crowd (`docs/pilot/PILOT-CROWD.md`).
- PDPA steps on its side: notices to candidates and staff (templates provided), a non-camera alternative for candidates
  who do not consent, signage at Crowd points (`camera-notice.html`), and its own retention decisions.

### A.4 Pilot-first path

1. **Free Exam field pilot** (1 institution, ≤ 4 weeks, ≤ 3 rooms; free in exchange for invigilator tallies;
   `docs/pilot/PILOT-EXAM.md`). Attendance free tier (≤ 5 people) and a Crowd event day at pilot-stage price can run in
   the same period.
2. Report the measured numbers per condition with their source ("field") to the institution.
3. Year 1 at **pilot-stage** prices (example S: 32,940 excl. 7% VAT).
4. A part moves to the after-pilot price at the next renewal only if that site passed its pilot thresholds; otherwise
   it stays at the pilot-stage price.

### A.5 Thai public procurement fit (research 2026-11-09; **to be verified by a lawyer / procurement officer**)

Thai public universities and schools buy under the **Public Procurement and Supplies Administration Act B.E. 2560
(2017)** (พ.ร.บ.การจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560) and the Ministry of Finance regulation of the same
year. What was found (all accessed 2026-11-09):

| Point | What the sources say | Status | Source |
|---|---|---|---|
| **Specific method** (วิธีเฉพาะเจาะจง) up to 500,000 THB | A purchase of up to 500,000 THB per procurement may be made by the specific method with one supplier, under Act s.56 para 1 (2)(b) and the Ministerial Regulation of 23 Aug 2560 (2017), clause 1 | consistent across sources; **unverified (Royal Gazette not read)** | https://thaipublica.org/2021/08/adjust-gprocurement-help-sme/ · https://docs.google.com/document/d/1ZwpPC9yzhAVVwWWTAA5DITH_SOAQexf4/export?format=pdf |
| **e-bidding** above 500,000 THB | Above 500,000 THB the general invitation method (e-market for catalogue goods, otherwise e-bidding) is used; IT development with specific features over 500,000 THB goes through e-bidding | secondary sources only — **unverified** | https://www.yotathai.com/passadu/e-bidding-market · https://www.grandlinux.com/blogs/procurement-act-2560.html |
| Draft TOR public hearing above 5,000,000 THB | Drafts above 5 M THB are published for comments; 0.5–5 M at the head of agency's discretion | one agency manual — **unverified** | https://old.narit.or.th/images/04_เกี่ยวกับ%20สดร./ITA/2567/ITA_2567_22_e-Bidding.pdf |
| TOR must not favour one supplier | The Act's principles require a fair, non-discriminatory TOR that does not favour any one supplier (s.8 / s.9 cited by training material) | principle confirmed; **section numbers unverified** | https://www.grandlinux.com/blogs/procurement-act-2560.html · https://orgweb.ldd.go.th/sources/img/part_lesson/FILES_12973_67d3eb2c5d5cf.pdf |
| SME support | Agencies spend ≥ 30% of their procurement budget with registered SMEs; SMEs get a price preference of up to 10% (Ministerial Regulation No. 2, B.E. 2563, in force 22 Dec 2020) | news report of the Comptroller General's rules — **unverified against the regulation** | https://thaipublica.org/2021/08/adjust-gprocurement-help-sme/ |
| Splitting a purchase to stay under a threshold | Not allowed (well-known rule) | **section not verified** | — |
| Innovation list / Made in Thailand preferences | Not researched in this round | **unverified** | — |

What this means for the bundle (to be confirmed):

- **Every worked example is below 500,000 THB including VAT** (S: 35,245.80; L: 172,184.40), so a single yearly
  purchase can normally use the **specific method**. Check whether the agency counts the threshold including VAT (the
  usual practice is that the budget amount includes VAT — **unverified**), and whether a multi-year contract is counted
  as one procurement.
- A large university buying several faculties at once may pass 500,000 THB; then the bundle has to go through
  e-bidding on a TOR that any qualified vendor can answer. The TOR wording below is written for that case.
- LENSIQ must be registered as a supplier in the government e-GP system (gprocurement.go.th) before quoting, and
  registering as an SME with OSMEP (THAI SME-GP) would make the SME preference available — **both to be confirmed**.
- Quotations go out in Thai (ใบเสนอราคา), with prices excl. VAT, VAT and total shown separately, valid 30–60 days.

### A.6 TOR-ready specification wording (no brand lock-in)

Functional, vendor-neutral wording an institution can paste into its specification (คุณลักษณะเฉพาะ). It names no
brand, no single camera model and no proprietary file format.

**Thai (ภาษาไทย):**

1. ระบบช่วยผู้คุมสอบที่ประมวลผลภาพบนอุปกรณ์ในห้องสอบเท่านั้น ไม่ส่งภาพหรือวิดีโอออกนอกอุปกรณ์ และไม่จัดเก็บภาพผู้สอบ
2. ระบบทำหน้าที่แจ้งเตือนให้ผู้คุมสอบไปตรวจสอบที่นั่ง โดยการตัดสินทุกกรณีเป็นของผู้คุมสอบ ระบบต้องไม่วิเคราะห์อารมณ์
   และไม่จดจำใบหน้าเพื่อระบุตัวตนโดยไม่ได้รับความยินยอมโดยชัดแจ้ง
3. ใช้งานผ่านเว็บเบราว์เซอร์มาตรฐานบนคอมพิวเตอร์ แท็บเล็ต หรือโทรศัพท์ที่หน่วยงานมีอยู่ และใช้กล้องทั่วไป (เว็บแคม
   หรือกล้องโทรศัพท์) ได้โดยไม่ผูกกับยี่ห้อใดยี่ห้อหนึ่ง
4. ระบบลงเวลาบุคลากรรองรับ PIN และ QR เป็นค่าเริ่มต้น การใช้ใบหน้าเป็นทางเลือกเมื่อบุคลากรยินยอม มีรายงานกะ OT
   วันหยุด และส่งออกไฟล์ CSV ได้
5. ระบบนับจำนวนคนในพื้นที่แบบไม่ระบุตัวตน แสดงความหนาแน่นโดยประมาณ ไม่จดจำใบหน้า และไม่เก็บภาพ
6. ผู้เสนอราคาต้องแสดงผลวัดความแม่นยำพร้อมขนาดชุดทดสอบและที่มา (ข้อมูลจำลอง ชุดข้อมูลสาธารณะ หรือหน้างานจริง)
   และยินยอมให้หน่วยงานทดสอบในสถานที่จริงก่อนตรวจรับ
7. ข้อมูลทั้งหมดส่งออกได้ในรูปแบบเปิด (CSV / JSON) โดยไม่มีค่าใช้จ่ายเพิ่ม เพื่อไม่ผูกติดกับผู้ขายรายเดียว
8. ผู้เสนอราคาต้องส่งมอบเอกสารภาษาไทย ได้แก่ คู่มือการใช้งาน ประกาศความเป็นส่วนตัว แบบขอความยินยอม ป้ายแจ้งการใช้กล้อง
   และแม่แบบการประเมินผลกระทบด้านข้อมูลส่วนบุคคล (DPIA) ตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562
9. มีการอบรมผู้คุมสอบและผู้ดูแลระบบ และมีช่องทางสนับสนุนการใช้งานภาษาไทยในวันและเวลาราชการ

**English (for reference):** on-device processing only, no images leave the device or are stored; the system only
points an invigilator to a seat and every decision is the invigilator's; no emotion analysis and no identification
without explicit consent; runs in a standard browser on the agency's existing devices with any ordinary camera (no
brand lock-in); staff attendance with PIN / QR by default and optional consented face check-in, shift / OT / holiday
reports and CSV export; anonymous people counting with an approximate density, no face recognition, no images kept;
the bidder states measured accuracy with sample size and source and accepts an on-site acceptance test; all data
exportable in open formats (CSV / JSON) at no extra cost; Thai-language manuals, privacy notice, consent form,
camera signage and DPIA template; invigilator and administrator training; Thai-language support in office hours.

### A.7 Documents LENSIQ provides with the bundle (Thai first)

Privacy notice and consent templates (`exam.html#notice`, `camera-notice.html`), PDPA notes for the institution's
counsel (`docs/PDPA-NOTES-FOR-COUNSEL.md`, reviewed by a lawyer before sale), DPIA template, the pilot plan and results
form (`docs/pilot/PILOT-EXAM.md`, `docs/pilot/PILOT-CROWD.md`, `docs/pilot/RESULTS-FORM.md`), the accuracy page with
sources, the one-pagers (`docs/ONE-PAGER-EXAM.md`, `ONE-PAGER-ATTENDANCE.md`, `ONE-PAGER-CROWD.md`), and a data
statement: data stays on the institution's devices; LENSIQ receives no images and, by default, no data at all.

---

## B. Installer partner programme: LENSIQ Gate and Crowd with a partner's cameras and barriers

### B.1 Who the partners are

- CCTV, access-control and barrier installers serving villages, condos, car parks and offices (Gate).
- Event AV / rental companies and exhibition contractors (Crowd event days / weeks).
- Small system integrators that already install cameras for schools or shops.

### B.2 Who sells what

| | Partner sells and keeps 100% | LENSIQ licenses (monthly software, approved prices) |
|---|---|---|
| Gate | cameras, barriers, relays, poles, cabling, network, PCs / tablets at the guard post, installation labour, hardware warranty and maintenance | village / condo lane (pilot 490, after pilot 990 per lane per month; 1,990 for 3 lanes), car park lane (pilot 790, after pilot 1,490 per lane per month; PromptPay, receipts and shift close included), free 30-day trial |
| Crowd | cameras, mounts, laptops / phones, network, on-site operation | event day (pilot 590, after pilot 990 per device), event week (pilot 2,490, after pilot 3,900 per device). **Monthly fixed-site Crowd is not sold** until a fixed-site pilot passes (owner decision 4); partners can register fixed-site leads for that pilot |
| Set-up visit | a **certified** partner may perform the set-up visit and charge the approved set-up price (pilot 2,500, after pilot 3,000–5,000 per visit) if it submits the joint accuracy check sheet | uncertified partners: LENSIQ does the set-up visit and keeps the fee |

LENSIQ Gate is **assisted reading, the guard taps to confirm**. It does not open a barrier by itself: a relay may be
wired only so that the **guard** presses Open after confirming. Barrier / relay integration beyond that is quoted
separately after the pilot stage (`docs/PRICING-RESEARCH.md` §3.2).

### B.3 Revenue share proposal (new — needs owner approval)

The partner bills the customer at the approved list price (excl. 7% VAT) and keeps a share of the **LENSIQ software
fee**; the share is paid on the monthly software fee actually collected, not on hardware. Tiers are set each quarter by
the number of paid lanes / Crowd devices the partner manages.

| Tier | Entry condition | Partner share of the software fee | Set-up visits |
|---|---|---|---|
| **Referral** | signs the referral agreement; LENSIQ contracts and bills the customer | 10% of the first 12 months' software fee | done by LENSIQ |
| **Registered reseller** | trained (B.5 steps 1–4), bills the customer | 20% | done by LENSIQ |
| **Certified reseller** | ≥ 10 paid lanes / devices **and** at least one site that passed its pilot kit with the partner present | 25% | partner may do them and keep the fee |
| **Premier reseller** | ≥ 50 paid lanes / devices, gives first-line support (B.6) | 30% | partner does them and keeps the fee |

Hard rules for the share: the customer price is always the approved list price (no partner mark-up on software; any
discount comes out of the partner's share); the site moves to the after-pilot price only after its own pilot passed.

**Worked example 1 — Certified reseller, Gate, one month:**

| Item | Calculation | Excl. 7% VAT |
|---|---|---|
| 2 villages that passed their pilot, 3 lanes each (Pro) | 2 × 1,990 | 3,980 |
| 1 car park still at pilot stage, 4 lanes | 4 × 790 | 3,160 |
| Software fee billed by the partner (10 paid lanes → Certified) | 3,980 + 3,160 | **7,140** |
| Partner share 25% | 7,140 × 0.25 | **1,785** |
| LENSIQ receives | 7,140 − 1,785 | **5,355** |

The partner also keeps its hardware margin and installation labour, which LENSIQ does not see. The customers pay the
figures + 7% VAT (7,140 → 7,639.80 incl. VAT).

**Worked example 2 — Registered reseller, Crowd, one event week:** an AV company runs 3 camera devices for a 7-day
trade show at pilot stage: 3 × 2,490 = 7,470 excl. 7% VAT; partner share 20% = 1,494; LENSIQ receives 5,976.

**Worked example 3 — Referral:** an installer introduces a village with 3 lanes at pilot stage; LENSIQ bills
3 × 490 = 1,470 per month; the referral fee is 10% × 1,470 × 12 = 1,764 over the first year (paid monthly, 147).

### B.4 Why these shares

The Gate software fee is small next to the hardware the partner sells (an LPR camera alone is 29,900 THB and a full
barrier kit 85,000 THB, `docs/PRICING-RESEARCH.md` §1A), so the share is meant to pay for the partner's first-line
work and to keep the software price at list, not to be the partner's main income. 20–30% is a starting proposal; the
owner may prefer a flat 20%.

### B.5 Partner onboarding steps

1. **Apply:** company certificate (DBD), VAT registration, a named technical lead, a list of current installation
   types and areas served.
2. **Agreement:** partner agreement with the revenue share, the conduct rules (B.7), a data processing agreement for
   any access to customer devices, and the PDPA signage obligations (section C reviews these).
3. **Training (half a day online + one site day):** assisted reading and why the guard confirms every plate; camera
   placement, angle, IR and night settings (`docs/GATE.md`); the on-page accuracy check (day / night, taps, wrong
   reads, 95% interval); Crowd limits (sparse / medium only, density estimate) and camera height; PDPA signage and
   notices (`gate-notice.html`, `camera-notice.html`); what customer builds turn off (age / gender, expression);
   escalation to LENSIQ.
4. **Demo kit:** a free 30-day Gate trial account and a Crowd demo set-up for showrooms.
5. **First site together:** the first Gate site (or Crowd event) runs with LENSIQ present as a pilot under
   `docs/pilot/PILOT-GATE.md` / `PILOT-CROWD.md`, including the joint accuracy check.
6. **Certification:** after the first site passes its pilot kit and the partner reaches 10 paid lanes / devices.
7. **Listing:** certified partners may be listed on the LENSIQ site by area (needs a later owner decision).

### B.6 Support split

| Topic | Partner (first line) | LENSIQ (second line) |
|---|---|---|
| Cameras, barriers, relays, cabling, network, power | yes, including warranty | — |
| Camera angle, lighting, IR, mounting height | yes (certified partners) | guidance, review of the accuracy check sheet |
| Browser page, software bugs, updates, plate / people detection | collects the report (time, lane, what happened, no images of people) | yes |
| Accuracy questions and on-site accuracy check | runs the check with the customer | reviews the numbers, decides if the site passed |
| PDPA questions from the customer | gives the templates | escalates to LENSIQ, which refers to counsel |
| Billing | Referral: LENSIQ · Resellers: partner | — |

### B.7 Conduct rules (part of the partner agreement)

- **No claims beyond measured accuracy.** Quote only the figures on the product page or one-pager, each with its
  source (synthetic / public dataset / field) and sample size. Never quote a hardware vendor's "99%" for LENSIQ, and
  never call Crowd an exact count.
- **Assisted reading.** Gate suggests a plate and the **guard taps to confirm** every vehicle. Never sell it as an
  automatic LPR barrier, and never wire a relay that opens without a person confirming.
- **A human confirms** every decision about money, access or a person (plate reads, parking fees, exam flags,
  attendance exceptions).
- **PDPA signage first:** the Gate / camera signs and the privacy notice are posted before the system goes live; no
  images of people are copied off the device; no face recognition at Gate.
- **Customer builds only:** do not turn on licence-limited models (age / gender, expression) for customers; they are
  for demo mode.
- **Crowd:** sparse and medium crowds only; never use it for crowd-safety decisions; dense crowds are not sold.
- **Prices:** the approved list, excl. 7% VAT stated on every quotation; the pilot-stage price until the site passed
  its pilot.
- Breach of these rules ends the partner share and, for repeated breaches, the agreement.

---

## C. What still needs legal review (before any offer)

1. Procurement thresholds and methods (A.5): specific method ≤ 500,000 THB, e-market / e-bidding above it, whether
   the threshold counts VAT, multi-year contracts, the no-splitting rule and its section — check against the Royal
   Gazette text of the Act B.E. 2560, the Ministry of Finance regulation and current Comptroller General circulars.
2. Whether each target institution is a "state agency" under the Act (public universities, autonomous universities,
   Rajabhat / Rajamangala, OBEC / municipal schools) or a private institution with its own rules.
3. e-GP supplier registration and SME (THAI SME-GP) registration requirements and the SME price preference.
4. The TOR wording (A.6): that it is vendor-neutral and compatible with the Act's fairness principles.
5. Partner agreement: reseller vs agent model, revenue-share invoicing, VAT on the share, withholding tax on referral
   fees, liability for hardware vs software, termination.
6. PDPA roles: the institution / village / car park is the controller; whether LENSIQ and an installer partner are
   processors when they touch a device; the data processing agreement; cross-border transfer (none by default).
7. PDPA for Exam (notice, alternative for candidates who do not consent, minors), Attendance (consent for the
   optional face check-in, labour-law retention), Gate (plate data, signage, retention) and Crowd (signage).
8. Model licences for commercial use of the face / person detection used by Exam, Attendance (face option) and Crowd
   (`LICENSES/`, `docs/PDPA-NOTES-FOR-COUNSEL.md`), and the customer-build switch that keeps age / gender and
   expression off.
9. Consumer-protection and advertising rules for the accuracy wording in sales material and partner material.
10. Quotation and invoice format (Thai tax invoice, VAT-registered seller; if not VAT-registered, no VAT line —
    `docs/BILLING-PLAN.md` §5). Receipts are issued by the owner from the template and the system does not number them (2026-11-13): numbering series and tax-invoice content are with the accountant (`docs/sales/ACCOUNTANT-QUESTIONS-TH.md`).
11. Free-tier limits and the change from "free, every feature" to a limited free tier with a licence beyond it (legal item L62): notice period, consumer-protection angle, contract wording.

### Owner questions raised by this draft

- **B-1.** Bundle discount for the institution bundle: none (as drafted), or a percentage off the yearly total?
- **B-2.** Size bands inside the approved Exam after-pilot range 30,000–120,000 THB / year.
- **B-3.** Revenue-share tiers 10 / 20 / 25 / 30% as proposed, or a flat share?
- **B-4.** May certified partners do Gate set-up visits and keep the fee?
- **B-5.** Partner listing on the LENSIQ site.

Changelog: 2026-11-09 (round 16): first draft.
