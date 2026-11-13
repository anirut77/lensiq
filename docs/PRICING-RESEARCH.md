# Pricing research and approved price levels: Exam, Gate, Crowd, Attendance

> **APPROVED price list, not on sale yet (ราคาที่อนุมัติแล้ว ยังไม่เปิดขาย).** The owner approved the pilot and
> regular-price levels in section 3 on 2026-11-09 (open questions 1–6, section 4). Nothing is sold yet: there is no
> checkout, no plan in the D1 `plans` table and no migration for these lines, and `pricing.html` (consumer checkout,
> VAT-inclusive) is unchanged. The approved levels are shown on `exam.html`, `gate.html`, `crowd.html` and
> `attendance.html` (TH / EN / ZH, labelled "approved price list, not on sale yet"), in the four one-pagers and in
> `docs/BILLING-PLAN.md` §4.1. Bundles and the installer partner programme built from these levels:
> `docs/SALES-PACKAGES.md` (DRAFT).
>
> **Owner decisions of 2026-11-13 (free tiers, option B):** payment is by bank transfer only (no PromptPay QR, card or Opn). Fortune and the general tools stay free. The four business products have a limited free tier, and a licence is needed beyond it: Gate 30-day trial (1 lane, 100 plates per day) · Attendance free up to 5 people · Exam free up to 5 candidates per session · Crowd free 2 hours per device per day. The price levels in section 3 are unchanged. The limits are **not enforced in the product yet** (membership and billing come later): they apply from a date to be announced with at least 30 days' notice, start 30 days after the announcement, and the owner enforces them by contract; a limit on the user's device can be bypassed by someone who edits the code, the contract binds. Customers can always export their data. A licence works offline for 14 days (planned).
>
> Round 16, item 6. Researched 2026-11-09 (all prices were read on that date unless a page gives its own date). Prices
> are in THB. "One-off" = paid once (hardware, lifetime licence); "monthly" = recurring.
>
> **VAT basis (owner decision 2026-11-09).** Every LENSIQ price in section 3 and in the four one-pagers
> (`ONE-PAGER-EXAM/GATE/CROWD/ATTENDANCE.md`) is quoted **excluding VAT** and carries the label "excl. 7% VAT"
> ("ไม่รวม VAT 7%"). The customer total is the figure + 7% (e.g. 490 THB excl. 7% VAT = 524.30 THB to pay). The
> numbers themselves are unchanged from the earlier draft; only their basis changed. Free / 0 THB items carry no label.
> **Live product aligned 2026-11-09 (owner approval):** `gate.html`, `exam.html`, `crowd.html` and `attendance.html` (TH / EN / ZH) and
> `docs/BILLING-PLAN.md` §1.4 / §4.1 now say "excl. 7% VAT" for the B2B lines. Not changed: the self-serve checkout
> plans (BILLING-PLAN §3, pricing.html, `ONE-PAGER-RETAIL.md` / `ONE-PAGER-FORTUNE.md`) stay VAT-inclusive, because
> that is the amount actually charged; changing them changes what customers pay (separate owner decision). If the seller is not VAT-registered there is no VAT line (BILLING-PLAN §5).
> Market prices in section 1 are given as the source shows them. Thai shop prices are usually VAT-inclusive (most
> pages do not say), so a comparison between a section-1 price and a section-3 price is approximate by about 7%.

## 0. Method and limits (read first)

- **Sources:** public Thai vendor and retailer pages, plus official vendor pages for exam proctoring (no Thai
  proctoring vendor publishes a price). Each row gives the link and the date it was read. When a page shows its own
  date, that date is given as well.
- **What was not possible:** most Thai B2B vendors (LPR integrators, village / condo platforms such as Silverman,
  TheLivingOS, COMVISITOR and WAC; Proctorio; Honorlock) do **not** publish prices and only quote on request. They are listed
  as "quote only", not guessed. Retail promotion prices change often, and some listings are 1–3 years old.
- **USD figures** are converted at **33 THB per USD (owner decision 2026-11-09, open question 6), for comparison
  only**. Recheck the rate on the day of any quotation that uses them.
- **The rule these prices follow** (owner working rules): *prices must match what is actually measured.* The field
  accuracy of all four products is **not measured** yet (no pilot), so every proposal has a **pilot price**. A
  higher price applies only once a site has passed its pilot thresholds (`docs/pilot/PILOT-*.md`).

## 1. Market prices found (with sources)

### 1A. Car park / village gate: licence-plate recognition (LPR) hardware and installation

| # | Product (vendor / shop) | Price (THB) | One-off / monthly | What it includes | Source (read 2026-11-09) |
|---|---|---|---|---|---|
| G1 | ZKTeco BG barrier + LPRC300 plate camera kit (Charoen Fingerscan) | 85,000 (list 115,000) | one-off | barrier, 1 LPR camera, plate display, LED light, pole, anti-collision sensor, loop detector; free installation, set-up and training | https://www.charoenfingerscan.com/product/139/ (shop updated 8 Nov 2569 / 2026) |
| G2 | LPRC300 plate camera + licence + Wiegand controller, fitted to an existing barrier (UFOsat) | 55,000 (list 65,000) | one-off | camera, licence, controller with plate-reading software, installation and set-up | https://www.ufosat.com/product/16893/ (listed 9 Mar 2023, updated 4 Jan 2024) |
| G3 | LPR camera system "complete set" (Automation Service) | 55,000 incl. installation | one-off | complete LPR set, installation, training; the page does not say whether a barrier is included | https://www.automation.co.th/products/office-smart-automation/cctv-system/cctv-smart-solutions/lpr-camera/ |
| G4 | ZKTeco LPR camera with 6-year warranty (Minics Thailand) | 29,900 (list 49,900) | one-off | camera only; barrier sold separately; installation not stated | https://minicsthailand.com/product/กล้อง-อ่าน-ป้าย-ทะเบียน-lpr-ส/ |
| G5 | Automation Service guide: LPR camera price bands | 10,000–30,000 (budget), 30,000–60,000 (mid-range) | one-off | camera only (article; figures as shown in the search result, the article was not opened) | https://www.automation.co.th/blog/office-smart-automation/กล้อง-อ่านป้ายทะเบียนรถ/ |

### 1B. Village / condo visitor and parking software (monthly)

| # | Product | Price (THB) | One-off / monthly | What it includes | Source (read 2026-11-09) |
|---|---|---|---|---|---|
| V1 | G-Visitor, monthly plan | from 300 / month for 1,500 entries, then 0.20 per entry | monthly | visitor pass on unlimited devices, 30/45/60-day retention, parking fee calculation, guard alerts; hardware (PDA, printer, PC) extra, no price for plate-camera options | https://g-visitor.com/ |
| V2 | G-Visitor, pay per entry | 0.50 per entry (from 20) | per use | as above, 30-day retention, no options | https://g-visitor.com/ |
| V3 | G-Visitor trial | free, 100 entries, 10-day retention | — | — | https://g-visitor.com/ |
| V4 | Silverman Guard, TheLivingOS, COMVISITOR, WAC Visitor Pass | **quote only** (no price published) | — | visitor management, parking, some with plate photos | https://silverman.app/silverman-guard · https://www.thelivingos.com/juristic/ · https://www.comvisitor.com/ · https://wacinfotech.com/visitorpro.html |

### 1C. Exam proctoring

No Thai vendor of camera / AI exam proctoring publishes a price (search 2026-11-09). Examvify (Thai online-exam
platform) shows only "free registration", and its page lists only a photo identity check, not camera proctoring
(https://www.examvify.com/). Comparable prices therefore come from official international vendor pages and from
Thai invigilator pay.

| # | Product | Price | One-off / monthly | Unit | Source (read 2026-11-09) |
|---|---|---|---|---|---|
| X1 | Respondus Monitor (webcam proctoring), initial term | USD 4,950 (≈ 163,000 THB) | yearly licence | flat, any institution size | https://web.respondus.com/he/monitor/pricing (re-read 2026-11-09) |
| X2 | Respondus Monitor, later terms | USD 5,950 for 1,000 seats + USD 1,950 per extra 1,000 (≈ 196 THB per seat for the first 1,000) | yearly licence | 1 seat = 1 student per course, any number of exams | https://web.respondus.com/he/monitor/pricing |
| X3 | Respondus Monitor, student pays | USD 15 (≈ 495 THB) for 12 months | yearly | per student | https://web.respondus.com/he/monitor/pricing |
| X4 | Proctorio, Honorlock, ProctorU / Meazure | **quote only** | — | — | vendor sites; third-party price claims could not be verified and are not used |
| X5 | Human invigilator pay, Naresuan University announcement | **not more than 600 THB per person per hour** (as reported; the PDF is a scan and could not be fully read, so treat it as unverified) | per session | per invigilator | http://onuc.nu.ac.th/wp-content/uploads/2021/11/15.3.pdf |

**Limits of X1–X3 (Respondus):** these are the **North-American** prices. The page says flat-rate pricing is not
available to "certain non-North American countries", to for-profit organisations or to resellers, so it **may not be
available to a Thai institution at this price**. Monitor also needs a **LockDown Browser licence**, which is not in the
figures above. The ≈ 196 THB per seat comparison is therefore a lower bound for what a Thai institution would pay,
not a quoted Thai price.

### 1D. People counters

| # | Product | Price (THB) | One-off / monthly | What it includes | Source (read 2026-11-09) |
|---|---|---|---|---|---|
| P1 | Ditech DT-COUNT-SF03 AI people-counting camera (doors up to 5 m, 120° lens) | 19,900 | one-off | the counter; the page does not say whether software is included | https://www.ditech.co.th/product/smart-people-counting-camera/ |
| P2 | Ditech AI face-recognition counter (gender, age, staff, returning customer) | 28,900 | one-off | the camera (**uses age / gender inference, which LENSIQ keeps off in customer builds**) | https://www.ditech.co.th/product/กล้องนับคนแบบ-ai-face-recognition-camera/ |
| P3 | Velleman PEM7D infrared door counter (one direction) | 7,900–8,900 (two shops) | one-off | the infrared counter | prices as shown in search results for amgthai.com and print3miti.com product pages (the print3miti page could not be opened: certificate error) |
| P4 | Velleman PEM7D × 2 (in and out) | 15,800–17,800 | one-off | two counters | as P3 |
| P5 | FootfallCam care plan (international) | about USD 8.90–9.50 per device per month (≈ 290–315 THB); the document does not make clear which tier is which | monthly | per counter | https://www.footfallcam.com/content/data/documents/Internal-Use/FootfallCam-Legacy-Care-Plan.pdf |

No Thai vendor publishes a price for **event / crowd density** counting (per event day). It is sold by quotation.

### 1E. Time attendance: cloud / app (monthly)

| # | Product | Price (THB) | Unit | What it includes | Source (read 2026-11-09) |
|---|---|---|---|---|---|
| T1 | TimeMint "Bio" | 25 per active user / month | monthly, minimum 10 users | face or fingerprint scanner clock-in, shifts, leave, OT, reports, payslips | https://www.timemint.co/th/ |
| T2 | TimeMint "Beacon & Station" | 35 per active user / month | monthly | beacon / station clock-in | https://www.timemint.co/th/ |
| T3 | TimeMint "Standard" (most popular) | 50 per active user / month | monthly | GPS, QR, beacon, station, face, fingerprint | https://www.timemint.co/th/ |
| T4 | TimeMint full-service payroll | from 3,990 / month | monthly | payroll service | https://www.timemint.co/th/ |
| T5 | Taemtor (แต้มต่อ) HR | 60 (≤ 100 staff), 50 (101–300), 40 (301+) per user / month | monthly | HR + time attendance | https://tamto.online/hr/ |
| T6 | TikTrack | flat from 5,000 / month (1–50 staff), 8,000 / month (50–100); 55 per user / month (100+) | monthly | GPS clock-in | https://sonext.asia/tiktrack-managements/ |
| T7 | OneDee | 1,080 / 1,890 / 2,700 per month (Standard / Advanced / Professional; the page does not say per user or per company); lifetime 5,800 one-off; multi-scanner 14,900 one-off; free tier for a few users | monthly or one-off | LINE chatbot clock-in, GPS | https://www.onedee.ai/pricing/ |

### 1F. Time attendance: devices (one-off)

| # | Device | Price (THB) | Source (read 2026-11-09) |
|---|---|---|---|
| D1 | Deli ES161 fingerprint + face | 2,699 | https://www.homepro.co.th/c/MIG1102 |
| D2 | Deli ES171 / ES172 fingerprint + face | 3,599 | https://www.homepro.co.th/c/MIG1102 |
| D3 | ZKTeco AIO20 face + fingerprint | 4,622 | https://www.homepro.co.th/c/MIG1102 |
| D4 | HIP CMIF95S-VL / CMIF68S face scanner | 5,690 / 5,700 | https://www.homepro.co.th/c/MIG1102 |
| D5 | Hikvision DS-K1T342MFX-E1 face scanner | 6,740 | https://www.homepro.co.th/c/MIG1102 |
| D6 | ZKTeco uFace 602 face + fingerprint + door control | 10,700 (price dated 25 Aug 2023, out of stock) | https://www.jib.co.th/web/product/readProduct/45497 |

## 2. What LENSIQ is, compared with these products (the basis for the price)

| Product | What the comparable products do | What LENSIQ does today | Measured (source) |
|---|---|---|---|
| **Gate** | Dedicated LPR hardware, one-off: camera only from 29,900 THB (G4); camera fitted to an existing barrier 55,000 THB (G2; G3 is 55,000 for a "complete set" that does not say whether a barrier is included); full barrier kit 85,000 THB (G1, list 115,000). Vendor claims are high (e.g. "99.7 %"), but not measured by us | A browser page on a phone / laptop / IP camera at the guard post. It **suggests** a plate read; a guard confirms every read. No barrier hardware is sold | Synthetic: 97.1 % plate found, 58 % exact read from 1 frame (n = 140 scenes). Public photos: exact auto-read 32 % (n = 22), taps needed 78 % (n = 32), false auto-reads 0 / 19. Field: **not measured** (`docs/GATE.md` §3b–3c) |
| **Exam** | Webcam proctoring licences: ≈ 196 THB per student per course (Respondus, first 1,000 seats; North-American price, may not be offered in Thailand, LockDown Browser licence extra), plus human invigilators (as reported, ≤ 600 THB per hour) | It tells an invigilator which seat to look at; it never decides misconduct. Runs on existing lab PCs / phones; no cloud | **Not measured** (`docs/EXAM.md`) |
| **Crowd** | Door counters 7,900–19,900 THB one-off per door; international subscriptions ≈ 290–315 THB per device per month | Zone / line / "people in view" on a phone or laptop camera. Sparse and medium scenes only | Undercount 26–59 % on sparse / medium public clips (n = 12–20 frames per clip, 4 clips); **not yet suitable for dense crowds** (≈ 300 people counted as ≈ 1 per frame); preliminary AI reference; field **not measured** (`docs/CROWD-ACCURACY.md`) |
| **Attendance** | Cloud apps 25–60 THB per user per month (flat 5,000+ for small firms at TikTrack); devices 2,699–10,700 THB | PIN / QR check-in by default, face optional on the device (consent); shifts, OT, payroll CSV; no cloud sync yet (item 4) | Face, public datasets: Asian (held out, not perfectly blind: `ACCURACY.md` disclosure) 66–76 % (n = 500 people × 5 photos), strangers auto-checked-in ≤ 0.03 %; real workplace **not measured** (`ACCURACY.md` §2) |

## 3. Price levels — **APPROVED by the owner 2026-11-09 (not on sale yet)**

The levels below were approved as drafted (open question 1). Decisions 2–5 set how they are sold: Exam offers both
units (per candidate for computer rooms / online, per room for halls); the Gate car-park price includes PromptPay,
receipts and shift close; Crowd sells event day and event week first, and the monthly level waits for a fixed-site
pilot; Attendance keeps a free tier up to 5 people. "Approved" means the price list is fixed; it does **not** mean the
products are on sale (no checkout, no plan migration).

**Labels (owner decision 2026-11-13, option B):** both levels are shown everywhere, clearly labelled, excl. 7% VAT: "pilot price" (ราคานำร่อง, the approved list, used now) and "regular price after the pilot thresholds are met" (ราคาปกติหลังผ่านเกณฑ์นำร่อง, the right-hand column of each table below). Quotations use the pilot price and show the regular price beside it. No number changed.

Two stages for every product:

- **Pilot price:** the price before that site's field numbers exist. It is low, because nothing has been measured
  on site.
- **Regular price after the pilot thresholds are met:** applies only when the site has passed the thresholds in its pilot kit. Until then the pilot
  price stays.

All LENSIQ prices below are **excluding VAT** (owner decision 2026-11-09, open question 7): the customer pays the
figure + 7%. Every price carries the label "excl. 7% VAT"; free items carry none. BILLING-PLAN §1.4 / §4.1 now say the same
for the B2B lines (see the VAT note at the top). Section-1 market prices are mostly
VAT-inclusive, so the comparisons in the "Reasoning" paragraphs are approximate by about 7%.
Yearly = 10 × monthly (BILLING-PLAN rule).

### 3.1 LENSIQ Exam

The regular-price column keeps the earlier `exam.html` draft numbers; the pilot-price column is lower. **Unit (owner
decision 2026-11-09, question 2): both are offered** — per candidate for computer rooms / online exams, per room for
exam halls with cameras. `exam.html` shows both stages since 2026-11-09.

| Level | Pilot price (now) | Regular price after the pilot thresholds are met (thresholds in `docs/pilot/PILOT-EXAM.md`) |
|---|---|---|
| Field pilot (1 institution, ≤ 4 weeks, ≤ 3 rooms) | **free** (in exchange for the invigilator tallies) | — |
| Free tier (owner decision 2026-11-13, replaces the earlier "1 room, 10 seats" trial; `exam.html` may still show the earlier wording until the page is changed; not enforced in code) | **free: up to 5 candidates per session** | free: up to 5 candidates per session |
| Computer room / online, per candidate (Mode B, `exam-lab.html`) | **10 THB per candidate per exam excl. 7% VAT** (minimum 300 THB per exam session excl. 7% VAT) | 15–30 THB per candidate per exam excl. 7% VAT |
| Computer room / online, monthly lab package (`exam_lab`) | **990 THB / month per lab excl. 7% VAT** (the low end of the regular-price range) | 990–1,490 THB / month excl. 7% VAT |
| Exam hall with cameras, per day (Mode A, `exam-hall.html`; the number of cameras depends on room size, see the guide: `docs/EXAM.md` "Hall camera placement guide"). **Experimental, not on sale** (owner decision 2026-11-10); the price applies only once it is on sale | **290 THB per room per exam day excl. 7% VAT** | 300–600 THB per room per exam day excl. 7% VAT |
| Exam hall with cameras, monthly. **Experimental, not on sale** | **990 THB / month per room excl. 7% VAT** | 1,990 THB / month per room excl. 7% VAT |
| Institution licence (unlimited rooms, invigilator training) | **from 19,900 THB / year excl. 7% VAT** (≤ 1,000 candidates) | 30,000–120,000 THB / year excl. 7% VAT by size |

**Changes from the earlier page draft (`exam.html`, BILLING-PLAN §4.1):** none in the "regular price after the pilot thresholds are met" numbers (their basis is
now excl. 7% VAT). The only new
numbers are the pilot prices (10 THB excl. 7% VAT, 990 THB / month per lab excl. 7% VAT, 290 THB / day excl. 7%
VAT, 990 THB / month per room excl. 7% VAT, 19,900 THB / year excl. 7% VAT) and the free field pilot. *(An earlier
version of this file narrowed the regular-price column, then quoted VAT-inclusive, to 15–20 THB, 390–490 THB, 1,490 /
month per room and 30,000–90,000 / year with no measured reason; that narrowing has been withdrawn.)*

Reasoning: an institution compares this with an invigilator's pay (≤ 600 THB per hour as reported, X5) and with webcam
proctoring licences (≈ 196 THB per student per course, X2, a North-American price that may not be offered in Thailand
and excludes the LockDown Browser licence). LENSIQ Exam does not replace an invigilator, and its accuracy is **not
measured**. The pilot price is therefore a small add-on to an exam session: 10 THB × 40 candidates = 400 THB excl. 7% VAT per
session, less than one invigilator-hour. The monthly packages at the pilot price sit at (lab) or below (hall) the low end
of the regular-price range for the same reason. The regular price after the pilot thresholds are met becomes payable only once a site's per-signal precision
has been measured and has passed `docs/pilot/PILOT-EXAM.md`.

### 3.2 LENSIQ Gate

| Level | Pilot price (now) | Regular price after the pilot thresholds are met (thresholds in `docs/pilot/PILOT-GATE.md`) |
|---|---|---|
| Trial | **free 30-day trial: 1 lane, 100 reads / day, logs kept 7 days** | free 30-day trial: 1 lane, 100 reads / day, logs kept 7 days |
| Village / condo guard post (`village.html`) | **490 THB / month per lane excl. 7% VAT** | 990 THB / month per lane excl. 7% VAT; 1,990 THB / month for 3 lanes excl. 7% VAT |
| Car park (`parking.html`: fees, stamps, PromptPay, receipts, shift close — **all included, no add-on**, decision 3) | **790 THB / month per lane excl. 7% VAT** | 1,490 THB / month per lane excl. 7% VAT |
| Set-up visit (camera angle, light, joint accuracy check) | **2,500 THB per visit excl. 7% VAT** | 3,000–5,000 THB per visit excl. 7% VAT |
| Hardware | not sold: the customer's phone / laptop / IP camera; LENSIQ does not sell or drive barriers in this stage | barrier / relay integration: quotation |

**Trial (owner decision 2026-11-09, open question 8):** the permanent free tier is replaced by a **free 30-day trial**
(1 lane, 100 reads / day, logs kept 7 days), in both columns. **Live text updated 2026-11-09** (owner approval): `gate.html` and
`i18n/en-gate.js` / `i18n/zh-gate.js` `gate.p1.*` show "free 30-day trial · ฿0 · for 30 days: 1 lane, 100 reads per
day, 7-day log", and `docs/BILLING-PLAN.md` §4.1 `gate_trial` reads "free 30-day trial … 0 THB for 30 days". Text
only: no trial timer is enforced in code. There is no
`gate_trial` plan in the backend (`backend/migrations/0003_seed_plans.sql`, `backend/src/constants.js`).

Reasoning: dedicated LPR hardware costs, one-off, from 29,900 THB for a camera only (G4), 55,000 THB for a camera
fitted to an existing barrier (G2), and 85,000 THB for a full barrier kit (G1, list 115,000). Visitor software costs
from 300 THB / month (V1). LENSIQ Gate is a **guard assistant**, not an automatic barrier. On public photos, 78 % of plates still needed a
tap and 32 % were read exactly automatically, and the field figure is not measured. The pilot price
(490 THB per lane excl. 7% VAT) sits in the range of visitor-pass software, not LPR hardware. The earlier page figures (990 / 1,990 /
1,490 THB excl. 7% VAT) become the regular price after the pilot thresholds are met, which needs a site to show ≥ 95 % exact reads in good light and 0 silent
wrong saves.

### 3.3 LENSIQ Crowd

| Level | Pilot price (now) | Regular price after the pilot thresholds are met (thresholds in `docs/pilot/PILOT-CROWD.md`) |
|---|---|---|
| Free tier (owner decision 2026-11-13; not enforced in code) | **free 2 hours per device per day** | free 2 hours per device per day |
| Event day (1 camera device, sparse / medium areas, density estimate) | **590 THB per device per day excl. 7% VAT** | 990 THB per device per day excl. 7% VAT |
| Event week (7 days) | **2,490 THB per device excl. 7% VAT** | 3,900 THB per device excl. 7% VAT |
| Monthly (zone / line monitoring at a fixed site) — **not sold until a fixed-site pilot has passed** (decision 4) | 290 THB / month per device excl. 7% VAT (approved, held back) | 490 THB / month per device excl. 7% VAT |
| **Dense crowds (≈ 50+ people in view, concerts, crossings)** | **not sold** | not sold until a density model with a clean licence is approved (`docs/CROWD-DENSITY-MODELS.md`) |

Reasoning: dedicated door counters cost 7,900–19,900 THB one-off per door (P1–P4), and international subscriptions run
about 290–315 THB per device per month (P5). LENSIQ Crowd uses a camera the customer already has, but it undercounts by
26–59 % on sparse and medium clips (n = 12–20 frames per clip, 4 clips; preliminary, AI reference), and it is not yet suitable for dense crowds. It is therefore priced at
the bottom of the subscription range, and the sales text must say "density estimate, not an exact count". The
existing Event Day Pass (3,900 THB per day, booth + photobooth bundle, BILLING-PLAN §4, VAT-inclusive there) is a different bundle and is not changed.

### 3.4 LENSIQ Attendance (employees)

| Level | Pilot price (now) | Regular price after the pilot thresholds are met (thresholds in `docs/pilot/PILOT-PLAN.md` §3.2 + payroll check) |
|---|---|---|
| Free (approved, decision 5) | **up to 5 people**, PIN / QR, 1 device | up to 5 people |
| Standard (shifts, OT, holidays, payroll CSV, PIN / QR; face optional with consent) | **19 THB per active person / month excl. 7% VAT** (minimum 190 THB / month excl. 7% VAT) | 29 THB per active person / month excl. 7% VAT (minimum 290 THB / month excl. 7% VAT) |
| Set-up help (shift tables, payroll CSV mapping, DPIA template filled with the client) | **2,900 THB one-off excl. 7% VAT** (optional) | 4,900 THB one-off excl. 7% VAT |
| Multi-branch sync, cloud backup | not sold: needs organisation accounts (item 4, design awaiting approval) | quotation after item 4 |
| Devices | not sold: any phone / tablet the customer has (a 2,699–6,740 THB scanner is the comparison, D1–D5) | — |

Reasoning: the Thai cloud apps cost 25–60 THB per user per month (T1–T5), and most add GPS, LINE and payroll
services that LENSIQ does not have yet. LENSIQ has no cloud sync yet (item 4 is design only), browser storage holds
about 20 people × 2 years per device (`docs/ATTENDANCE-READINESS.md`, so the target is shops and companies with 5–20
staff), and face check-in has no workplace measurement. The pilot price is therefore below the cheapest comparable (TimeMint Bio, 25 THB as the page shows it), also
with VAT added (19 THB excl. 7% VAT = 20.33 THB to pay). The "Training / attendance 9,900 setup" line in BILLING-PLAN §4
(VAT-inclusive there) is for training check-in; employee attendance set-up is the approved 2,900 / 4,900 THB excl. 7% VAT
line above (BILLING-PLAN §4 / §4.1 updated 2026-11-09).

## 4. Open questions for the owner

1. **Levels.** **Decided 2026-11-09:** the pilot-price and regular-price levels in section 3 are approved as drafted.
2. **Exam unit.** **Decided 2026-11-09:** offer both — per candidate for computer rooms / online, per room for halls.
3. **Gate car park.** **Decided 2026-11-09:** PromptPay, receipts and shift close are included in the car-park price.
4. **Crowd.** **Decided 2026-11-09:** sell event day and event week first; the monthly level waits for a fixed-site pilot.
5. **Attendance.** **Decided 2026-11-09:** free tier up to 5 people approved.
6. **Exchange rate.** **Decided 2026-11-09:** use 33 THB per USD; recheck the rate when quoting.
7. **VAT basis.** **Decided 2026-11-09:** prices are shown excluding VAT, with "excl. 7% VAT" ("ไม่รวม VAT 7%") on every
   price; the numbers are unchanged, so the customer pays the figure + 7%. Applied to section 3 and the four one-pagers.
   Live gate.html / exam.html and BILLING-PLAN §1.4 / §4.1 aligned 2026-11-09. Still open: the self-serve checkout plans (BILLING-PLAN §3, pricing.html, `ONE-PAGER-RETAIL.md` / `ONE-PAGER-FORTUNE.md`) stay
   VAT-inclusive because that is the amount actually charged; moving them to excl. VAT changes what customers pay and
   needs a separate owner decision and a plans migration.
8. **Gate free tier.** **Decided 2026-11-09:** a free 30-day trial (1 lane, 100 reads / day, logs kept 7 days) replaces
   the permanent free tier. Applied to section 3.2 and `ONE-PAGER-GATE.md`. Live text (`gate.html`,
   `i18n/en-gate.js`, `i18n/zh-gate.js`) and BILLING-PLAN §4.1 `gate_trial` updated 2026-11-09; no trial timer in code.
9. **Gate pilot targets.** **Decided 2026-11-09:** targets in `docs/pilot/PILOT-GATE.md` §5 are judged on the Wilson 95 %
   lower bound (upper bound for rates that must stay low, such as taps needed), and the plain average (observed rate,
   k / n) is shown next to it. `tools/field-pilot-metrics.mjs --lower-bound` prints both. The target numbers and the
   minimum of 40 night reads are unchanged (at n = 40 the night target needs 39 / 40 observed).

10. **Free tiers and payment.** **Decided 2026-11-13:** option B. Fortune and general tools stay free; Gate 30-day trial (1 lane, 100 plates per day), Attendance free up to 5 people, Exam free up to 5 candidates per session, Crowd free 2 hours per device per day; a licence is needed beyond them. Approved prices (excl. 7% VAT) stay as in section 3. Limits are not enforced in code yet; the owner enforces them by contract from a date announced at least 30 days ahead, starting 30 days after the announcement; customers can always export their data. Payment is by bank transfer only. Legal item L62.

## 5. Changelog

- 2026-11-13 (owner decisions): free tiers (option B) and bank-transfer-only payment recorded (question 10; header; sections 3.1 and 3.3). The earlier Exam "1 room, 10 seats" trial is replaced by "up to 5 candidates per session".

- 2026-11-09 (round 16, S56, owner decisions on questions 1–6): section 3 levels **approved** as drafted; the file is
  now the approved price list (not on sale yet) and the outdated "DRAFT, product pages unchanged" header is replaced.
  Exam sold per candidate (computer room / online) and per room (halls); Gate car-park price includes PromptPay,
  receipts and shift close; Crowd sells event day / week first, monthly held until a fixed-site pilot; Attendance free
  tier up to 5 people; 33 THB per USD, recheck when quoting. Applied to `exam.html`, `gate.html`, new price sections on
  `crowd.html` and `attendance.html` (TH / EN / ZH), the four one-pagers and BILLING-PLAN §4 / §4.1. New:
  `docs/SALES-PACKAGES.md` (DRAFT: institution bundle, installer partner programme).

- 2026-11-09 (round 16, S56, owner decisions on questions 7–9): every LENSIQ price in section 3 and the four one-pagers is
  now quoted excluding VAT with the label "excl. 7% VAT" / "ไม่รวม VAT 7%" (numbers unchanged; customer total = figure
  + 7%; live gate.html / exam.html and BILLING-PLAN §4.1 aligned; checkout plans stay VAT-inclusive). Gate trial: the permanent free tier becomes a free
  30-day trial (1 lane, 100 reads / day, 7-day logs); the live gate.html text says so (no timer in code). Gate pilot targets
  judged on the Wilson 95 % bound with the observed rate (k / n) shown beside it (PILOT-GATE §5, field-pilot-metrics).
  Questions 1–6 stay open; the price levels remain a DRAFT (superseded by the entry above).
- 2026-11-09 (round 16, S56, review fixes): VAT basis made explicit (section 3 is VAT-inclusive, as BILLING-PLAN;
  open question 7). Gate trial restored to the existing free tier (1 lane, 100 reads / day, 7-day logs, no time limit;
  open question 8). Gate market figures corrected to the sourced rows (29,900 camera only / 55,000 camera on an existing
  barrier / 85,000 barrier kit; the unsourced 89,000 is removed). Crowd range 26–59 % (n = 12–20 frames per clip).
  Respondus limits noted (North-American price, LockDown Browser licence). Exam regular-price column restored to the
  current drafts, lab monthly package listed, changes shown. CASIA "not perfectly blind" caveat added.
- 2026-11-09 (round 16, S56): first version. Market prices from public pages (section 1). Draft levels for the four products,
  each with a pilot price (section 3). Nothing is published or changed in the product.
