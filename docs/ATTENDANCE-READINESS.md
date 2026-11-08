# Employee time attendance: readiness against typical Thai HR needs

`attendance.html` now runs in two modes. **Training / event check-in** is the original page, unchanged and still the
default. **Employee time attendance** is new and lives in `attendance-hr.js`, with the maths in `lensiq-timeclock.js`
and the badge QR encoder in `attendance-qr.js`. This document checks the employee mode against what a Thai employer
usually needs from a time-attendance system.

Status values: **done** = built and tested. **partial** = usable with a stated limit. **missing** = not built (the
reason is given).

Tests: `tests/unit/attendance-timeclock.test.js` (pure logic) and `tests/e2e/attendance-hr.e2e.mjs` (the page in
headless Chrome with the fake camera). The original `tests/e2e/attendance.e2e.mjs` still passes unchanged.

> Not legal advice. Section numbers refer to the Labour Protection Act B.E. 2541 (as amended) and the Personal Data
> Protection Act B.E. 2562 (PDPA). A Thai labour lawyer should confirm the wording and the defaults before sale (see the
> end of this document).

## 1. Labour-law records

| Need | Status | Notes |
|---|---|---|
| Daily time record per employee (in, out, breaks, OT, holiday work) | done | Raw punches are stored as epoch ms with the method used (face / PIN / QR / manual) and the device. The daily CSV gives one row per employee per day. |
| Keep wage and time documents for at least 2 years (s.114) | done | The retention setting is 2 / 3 / 5 / 10 years and can never go below 2 (`retentionYears`). Records older than the period are purged on load, and the purge itself is written to the audit log. |
| Time-record retention separate from face-template retention | done | Face templates keep their own setting (30–730 days unused, on the Register tab). Deleting faces never deletes time records. |
| Employee register (s.112: name, nationality, start date, wage …) | missing | Out of scope. This is HRIS data. The employee master here holds only code, name, department, shift, PIN and badge. |
| Normal hours ≤ 8 h/day, ≤ 48 h/week (s.23) | partial | Weeks over 48 normal hours are flagged on the month page and in the payroll CSV, using whole Monday–Sunday weeks even across a month boundary. Per-day > 8 h is not flagged separately: anything after the shift end counts as OT. |
| OT + holiday OT ≤ 36 h/week (s.26 ministerial rule) | done | Flagged per employee (`weekOtOver`, CSV columns). |
| A break of at least 1 h after 5 h of work (s.27) | partial | When no break is recorded and the span is over 5 h, the shift's break is deducted. A break longer than allowed is flagged. A missing break is not flagged, because many sites do not punch breaks. |
| Weekly rest day (s.28) | partial | Working days are set per shift. Work on a rest day is classed `rest_day_work`. Seven-days-in-a-row is not flagged. |
| ≥ 13 traditional holidays incl. Labour Day (s.29), substitute day when one falls on a rest day | done | Editable Thai list. The page warns when a year has fewer than 13 days or no 1 May. Substitute days are computed per shift's working week. |
| Holiday dates for future years | partial | Fixed-date holidays work for any year. Buddhist lunar holidays are filled in for **2026 only**; for other years the page tells the user to add them from the official announcement. |
| OT / holiday pay inputs (s.61–63: OT 1.5×, holiday work 1× / 2×, holiday OT 3×) | done | Minutes are kept in separate buckets: normal-day OT, holiday/rest-day normal hours, holiday OT. Rates are applied in payroll, not here. |
| Leave: sick, personal, annual, maternity, other; half days; date ranges | done | |
| Leave balances / statutory minimums (s.30 annual ≥ 6 days, s.32/57 paid sick ≤ 30 days, s.34 personal ≥ 3 days) | partial | The calendar tab shows leave used per year next to the reference minimums. Per-employee quotas (service-year based) and carry-over are not modelled. |

## 2. Payroll export

| Need | Status | Notes |
|---|---|---|
| Monthly per-employee summary | done | Days scheduled / worked, late count + minutes, early-leave minutes, OT hours (approved and pending), holiday work, leave by type, absences, incomplete days, manager corrections, weekly limit flags. |
| Payroll CSV | done | UTF-8 BOM. Headers are bilingual (`มาสาย(นาที) late_minutes`), hours are decimals, and formula injection is neutralised. |
| Daily timesheet CSV and change-history CSV | done | |
| Department filter | done | Applies to the employee list, the month table and the CSVs. |
| Direct import format for a named payroll product (Express, HumanSoft, Prosoft …) or an API | missing | Each product has its own template. The bilingual headers make column mapping easy; a per-product exporter needs a sample file from the customer. |
| Wage calculation (rates, deductions, social security, tax) | missing | Out of scope (payroll system). |

## 3. Shift types

| Need | Status | Notes |
|---|---|---|
| Fixed day shift, grace minutes for late and for early leave | done | Within grace = on time. Beyond grace, every minute from the shift start counts (the common Thai practice). |
| Night shift crossing midnight | done | Punches belong to the date the shift starts, using a 24 h slice that begins 4 h before the start. |
| OT rules: start after N minutes, minimum, round down | done | |
| OT that needs approval before it counts | done | Per-shift switch. The manager approves per day (audit `ot_approve`). |
| Several shifts per company, a shift per employee | done | |
| Shift change with an effective date (history kept) | done | `shiftHist`: earlier days stay on the old shift. |
| Rotating rosters (a different shift per day or week), split shifts, flexi-time / core hours | missing | Needs a roster model and UI. This is the next big item for factories. |
| Early-in OT (before the shift start) | missing | Only OT after the shift end is counted. |

## 4. Check-in methods

| Need | Status | Notes |
|---|---|---|
| Face check-in (on device, several people at once, 2-frame confirmation, ask-to-confirm when unsure) | done | This is the existing engine. In employee mode a face check-in becomes a time punch, and repeats within 60 s are ignored. |
| Non-biometric alternative for people who decline face data | done | PIN (salted, iterated SHA-256; lock after 5 misses, kiosk-wide lock after 15) and a QR badge (printable; reissue revokes the old one). |
| Opt-out enforced | done | An employee marked "no face" cannot be enrolled on the Register tab, and the face punch path refuses them. |
| Badge scanning with the camera | partial | Works where `BarcodeDetector` exists (Chrome on Android / macOS / ChromeOS). Elsewhere, use a USB or Bluetooth badge reader in keyboard mode, or the PIN. |
| Buddy-punching resistance | partial | Optional liveness head-turn (existing, unmeasured), PIN lockout, badge reissue, and the method shown per punch in reports. A PIN or badge can still be shared, and there is no photo-on-punch, by design: no images are stored. |
| Trusted time | partial | A punch earlier than this device's previous punch is warned about (clock set back). There is no NTP or server timestamp. |

## 5. Approvals and audit

| Need | Status | Notes |
|---|---|---|
| Manager correction of punches (add a missing one, change a time, cancel one) | done | Raw punches are never edited. Corrections are audit entries (`punch_add` / `punch_edit` / `punch_void`), and the effective punches are derived from them. |
| Who / when / before / after / reason | done | The manager's name is required, and so is a reason for punch, leave and OT changes. An optional manager PIN must also match. |
| Append-only, tamper-evident | done | Each device keeps its own SHA-256 hash chain. An edited, deleted or reordered entry is flagged. A head removed by the retention purge is reported as truncated. |
| Corrections shown in reports | done | Corrections column in the month table and payroll CSV, a "corrected" marker per day, and the audit CSV. |
| Leave request → approval workflow, employee self-service | missing | Needs accounts and a server. The backend in `backend/` is not deployed. |
| Multi-level approval (supervisor → HR) | missing | |

## 6. Offline, multi-device, multi-branch

| Need | Status | Notes |
|---|---|---|
| Works without internet | partial | Everything runs and is stored in the browser. Once the page is open, it keeps working offline. `sw.js` only caches `vendor/` (models), so reloading the page with no network fails. Caching the page and its scripts is an integration item. |
| Several check-in points merged | partial | Each device exports a JSON pack (punches, audit, employees; no PIN hashes, badge tokens, face data or images), and the main device imports it. A strict allowlist rejects any pack with unknown keys. Duplicates are merged by id and employees are matched by code. There is no live sync: the LAN `/api/agg` hub in `server.py` only accepts numeric store summaries. |
| Branch / device name on each punch | done | Device id on every punch. The device name is set in the settings tab. |
| Central database, many employees | partial | Browser storage is about 5 MB, roughly 20 employees × 2 years. The page shows usage and warns from 3.5 MB onwards. Larger sites need IndexedDB or a server database. |
| Kiosk mode | done | One punching screen (clock, camera, PIN/QR, privacy line). Exiting needs the manager PIN once one is set. Fullscreen is used where allowed, the face scan starts automatically, and the Wake Lock comes from the existing unattended handling. |

## 7. PDPA

| Need | Status | Notes |
|---|---|---|
| Notice before use | done | The employee-mode notice covers: lawful basis for time records (legal obligation, s.24), biometrics need explicit consent (s.26), the PIN/QR alternative with no employment detriment, on-device processing, no emotion or expression reading, human review, and separate retention. Links go to the printable camera sign and the consent template (`camera-notice.html`). |
| Separate consent text for employee face enrolment | done | Shown in employee mode instead of the training wording. |
| No frames leave the device; no images stored | done | Covered by the e2e privacy scan (no `data:image`, no `/api/*`). |
| Right of access (s.30) | done | "Export this employee's records" gives the month's daily records plus the corrections made to them. |
| Right to erasure / withdraw consent for face data | done | Existing per-person and full wipes. Time records stay, as required by s.114. |
| DPIA, record of processing (s.39), employee privacy notice, works-rules wording | missing | Documents for the customer's DPO and lawyer. |
| Face-model licence | missing | The face-api.js weights come from research-only datasets. A lawyer must confirm commercial use, which the existing notice already says. PIN/QR mode works without the face model. |

## Cheap partial items fixed in this round

- Weekly 48 h normal-hours flag (s.23), with weekly limits computed over whole weeks across month boundaries.
- Leave used per year shown next to the s.30 / s.32 / s.34 reference minimums.
- Shift changes now take an effective date and keep their history, so past days are not recalculated on the new shift.
- Per-employee export for PDPA access requests.
- Years in the calendar are also shown in the Buddhist Era (พ.ศ.).
- Warning when the device clock goes backwards, and a storage-usage meter.
- Training-mode names in the existing lists are marked `translate="no"`, so the 中文 / English translator no longer
  alters people's names (a pre-existing bug).

## Needs outside resources

- **Pilot data:** face-recognition accuracy at a real time clock (lighting, queues, helmets or masks). Use the existing
  on-site accuracy check on the Accuracy tab. Public-photo figures are lower for Asian faces (about 66–76 %), so the
  PIN/QR fallback must stay available.
- **Lawyer:** confirm the s.114 wording and the 2-year minimum, that lateness counted in full beyond grace and OT rounded
  down are acceptable (company rules must say so), the PDPA notice and consent text, the 13-holiday rule text, and
  the face-model licence.
- **Official holiday data** for lunar holidays from 2027 onwards (Cabinet / Ministry of Labour announcements each year).
- **Customer payroll sample** to build a direct exporter for their payroll product.
- **Server deployment** (the `backend/` Worker is not deployed) for live multi-branch sync, more storage, employee
  self-service and leave approval.
