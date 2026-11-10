# Employee time attendance: readiness against typical Thai HR needs

This document has two parts. **Part A** (sections 1–7 below) checks the employee mode against Thai HR needs.
**Part B** (added 2026-11-10, at the end) compares face-recognition models and SDKs whose licence allows commercial use,
for the owner's decision. Owner decision in force: PIN/QR stays the default, face stays optional, no swap yet.

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

---

# Part B. Face recognition with a commercial licence: comparison for the owner's decision (2026-11-10)

**Owner decision (verbatim):** "Attendance: keep PIN/QR as the default and face as optional. Don't swap yet. Research
face-recognition models or SDKs whose licence clearly allows commercial use (open models and paid SDKs), with price,
accuracy claims, on-device support and Asian-face accuracy if published. Put the comparison in
docs/ATTENDANCE-READINESS.md and wait for my decision."

Nothing in this part has been built or changed in code. It is research only. Not legal advice.

**Labels.** [PRIMARY] = read on the vendor's or author's own page on 2026-11-10 and quoted. [VENDOR CLAIM] = the
vendor's own statement, not independently checked. [UNVERIFIED] = from a secondary source, or a gap we could not close.
**Accuracy sources** follow the project rule: *public dataset* (LFW, IJB-C, CASIA), *NIST* (independent government test),
*vendor* (self-reported), *field* (none yet for any option).

## B1. สรุปสำหรับเจ้าของ (ภาษาไทย)

- **ตอนนี้:** โหมดใบหน้าใช้ face-api.js (พอร์ตของ dlib ResNet) ทำงานในเบราว์เซอร์ 100% เก็บค่าใบหน้าแบบเข้ารหัสในเครื่อง
  ตัวไฟล์โมเดลเป็น CC0/MIT แต่ **ข้อมูลที่ใช้ฝึก (VGG Face, FaceScrub, รูปจากเว็บ) เป็นข้อมูลวิจัย** จึงยังมีความเสี่ยงด้านสิทธิ์ (F6/L23)
  และความแม่นยำกับใบหน้าเอเชียต่ำ (จำคนที่ลงทะเบียนได้ 66–76% บน CASIA-FaceV5 เทียบกับ 83–92% บน LFW)
- **โมเดลเปิด:** แทบทุกตัว (insightface, AdaFace, ArcFace, SFace, EdgeFace, FaceNet) โค้ดเป็น MIT/Apache/BSD
  แต่ **น้ำหนักโมเดลฝึกบน MS1M / WebFace / CASIA-WebFace / VGGFace2 ซึ่งเป็นข้อมูลเพื่อการวิจัย** ไม่มีโมเดลเปิดตัวไหนที่ข้อมูลฝึกอนุญาตใช้เชิงพาณิชย์ชัดเจน
  insightface เขียนตรง ๆ ว่าโมเดลเป็น "non-commercial research purposes only" แต่ **ขายไลเซนส์เชิงพาณิชย์** (ติดต่อทางอีเมล ไม่ประกาศราคา)
- **SDK เชิงพาณิชย์ที่รันในเครื่อง:** มีหลายเจ้า แต่ **เกือบทั้งหมดเป็นแอป native (Android/iOS/Windows/Linux) ไม่ใช่เบราว์เซอร์**
  ตัวที่ประกาศราคา: Neurotechnology VeriLook SDK €339 (Standard) / €859 (Extended) ส่วนค่าไลเซนส์ต่อเครื่องต้องขอใบเสนอราคา
  FacePlugin, KBY-AI, Paravision, Innovatrics, Regula, Luxand: ต้องขอใบเสนอราคา
- **คลาวด์:** AWS Rekognition มี region กรุงเทพฯ (ap-southeast-7) แล้ว ราคา ~$0.001 ต่อการค้นหน้า + $0.015 ต่อการตรวจ liveness
  Azure Face จำกัดเฉพาะลูกค้าที่ Microsoft ดูแลโดยตรง (Limited Access) Google ไม่มีบริการจดจำใบหน้า
  บริษัทไทย iApp มี API เทียบใบหน้า 0.3 IC (~0.27–0.375 บาท) ต่อครั้ง และมีแบบติดตั้งในองค์กร (ไม่ประกาศราคา)
- **ทางเลือกที่ไม่ใช่ซอฟต์แวร์:** เครื่องสแกนหน้า ZKTeco ขายในไทย 6,420–7,490 บาทต่อเครื่อง (ใบหน้าอยู่ในตัวเครื่อง) แล้วนำเข้าเวลาเข้า LENSIQ
- **รายชื่อสั้นที่เสนอ:** (1) ซื้อไลเซนส์เชิงพาณิชย์ของ insightface เพื่อคงสถาปัตยกรรม "ทำงานในเบราว์เซอร์" ไว้ (ราคายังไม่รู้)
  (2) Neurotechnology VeriLook ติดตั้งในเครื่องที่หน้างาน (ราคาเปิดเผยบางส่วน, ประวัติ NIST, liveness ผ่าน iBeta)
  (3) AWS Rekognition region กรุงเทพฯ เป็นทางเลือกคลาวด์ (ข้อมูลอยู่ในไทย แต่ต้องมี backend และเป็น "ผู้ประมวลผล" ข้อมูลชีวมิติ)
- **ก่อนตัดสินใจต้องวัดเอง** ด้วยชุดทดสอบอาสาสมัครที่ให้ความยินยอม (แผนในหัวข้อ B6) ตัวเลข NIST และของผู้ขายใช้แทนการวัดหน้างานไม่ได้
- **สิ่งที่เจ้าของต้องตัดสินใจ:** หัวข้อ B10 (ส่งอีเมลขอราคา insightface / Neurotechnology / iApp หรือไม่, ยอมให้มี backend สำหรับโหมดใบหน้าหรือไม่, ใช้ 1:1 หลังกรอกรหัส หรือ 1:N)

## B2. Current state and its licence risk

**How face matching works today** (read from the code):

- `attendance.html` + `attendance.js` load three face-api.js nets from `vendor/models/`: `tinyFaceDetector`,
  `faceLandmark68Net`, `faceRecognitionNet` (`attendance.js:135-137`). The recogniser is the face-api.js port of dlib's
  `dlib_face_recognition_resnet_model_v1` (128-D descriptor, 6.1 MB).
- Enrolment captures 3 poses (straight, slightly left, slightly right), 2 good frames each, with a quality gate (face
  ≥ 40 px, detector score ≥ 0.5, yaw ≤ 0.6), and stores the averaged descriptor (`attendance.js:219-228`).
- Matching is 1:N by Euclidean distance over every enrolled person (`LQTrack.enrolGallery` / `matchFace`): default
  limit 0.50, per-person limit 0.85 × distance to the nearest other member (floor 0.44), runner-up margin 0.09, all
  scaled by the spread of the enrolled group (`FACE_RULES`, `attendance.js:48-53`, `lensiq-track.js:325-378`). The same
  person must win 2 frames (`createConfirm`). An unsure match asks a person to confirm before a punch is written.
- Liveness: an optional head-turn check (`LQTrack.createLiveness`), **off by default and not measured**
  (`attendance.js:5-6, 60`).
- Templates: encrypted with WebCrypto AES-GCM 256 under a non-extractable key in IndexedDB (`lensiq-facevault.js`);
  writing is refused without a secure context; retention 30–730 days unused; per-person and full wipe. No images are
  stored. Nothing leaves the device.
- Employee mode (`attendance-hr.js`, `lensiq-timeclock.js`) records the method per punch (`face`/`pin`/`qr`/`manual`);
  PIN (salted, iterated SHA-256) and QR badge (`attendance-qr.js`) need no face model at all.

**Measured accuracy today** (source: *public dataset*, `ACCURACY.md` §2):

| Test | Result | Note |
|---|---|---|
| LFW View-1, 1:1, threshold 0.55 | TAR 86.5% [84.3–88.6%] at FAR 0.09% [0.00–0.53%] | 2,200 pairs, identity-cluster intervals |
| LFW 1:N, 100 enrolled, round 4 rules | 85.1% members recognised, 0.79% strangers accepted (per-visit CI, too narrow) | tuning set |
| **CASIA-FaceV5 (Asian, held out), round 5, 5 / 20 / 200 enrolled** | **members recognised 76 / 74 / 66%; strangers accepted 0.89 / 0.33 / 0.22%** | one camera, one session; not a Thai workplace |
| Field | **not measured** | |

**Licence risk (F6 / L23, `docs/LICENCE-REQUESTS.md` item 2, letters A and B):**

- Weights: CC0. dlib-models [PRIMARY]: "as I've released them into the public domain"; "The network was trained from
  scratch on a dataset of about 3 million faces", from FaceScrub, VGG and images scraped from the internet. LFW
  "mean error of 0.993833" (this reads as accuracy) [PRIMARY].
- Data: VGG Face / FaceScrub research terms [UNVERIFIED per set], plus unknown web images. Whether dataset terms bind
  users of CC0 weights is legally unsettled. The detector and landmark models (F5, item 1) have undocumented data too,
  so replacing only the recogniser does not clear Attendance: the detector must be replaced as well (MediaPipe BlazeFace,
  Apache-2.0, already vendored, is the candidate in item 1).
- The CASIA-FaceV5 set we evaluate on is itself research-use; it can stay an internal benchmark but cannot be a sales
  claim's only basis.
- Letters A and B are drafted, not sent.

## B3. Open models (licence of code, weights and data kept separate)

| Model | Code licence | Weights licence | Training data and its licence | Commercial OK? | Browser / on-device | Size | Published accuracy (source) | Asian / demographic accuracy | Liveness |
|---|---|---|---|---|---|---|---|---|---|
| **face-api.js / dlib ResNet** (current) | MIT (port) | CC0 [PRIMARY] | ~3 M faces: FaceScrub, VGG, web scrape; research terms [UNVERIFIED] | **Unclear** (data) | Yes, TF.js (in use) | 6.1 MB | LFW 99.38% (author); ours: see B2 | Ours: CASIA-FaceV5 66–76% recognised | No (ours: head-turn, unmeasured) |
| **insightface** (buffalo_l, antelopev2, ArcFace R100 etc.) | MIT: "There is no limitation for both academic and commercial usage" [PRIMARY] | "available for non-commercial research purposes only" [PRIMARY] | MS1MV2/3, Glint360K, WebFace (research) | **No** for the open weights. **A commercial licence is sold**: "please contact recognition-oss-pack@insightface.ai for licensing" (open recognition models) and contact@insightface.ai (InspireFace SDK and higher-accuracy models) [PRIMARY, README update 2025-11-24]. Price not published | ONNX: runs in ORT WASM/WebGPU like our other models [UNVERIFIED speed]; InspireFace SDK: Android, iOS, Linux, macOS, Windows, Rockchip; no web build listed [PRIMARY] | buffalo_l recogniser ~170 MB (R50); buffalo_s MobileFaceNet ~13 MB [UNVERIFIED] | IJB-C, MegaFace leaderboards in repo (public dataset) [UNVERIFIED exact rows] | Not published by insightface | InspireFace includes RGB silent liveness [UNVERIFIED] |
| **InspireFace** (HyperInspire) | Not stated on page | "adheres to the same requirements as InsightFace … solely for academic purposes and explicitly prohibiting commercial applications" [PRIMARY] | as insightface | **No** without the insightface commercial licence | Native SDK (see above) | "Pikachu" edge pack, size not stated | not stated | not stated | see above |
| **SFace** (opencv_zoo, MobileFaceNet + SFace loss) | Apache-2.0 | "All files in this directory are licensed under Apache 2.0 License" [PRIMARY] | **Not named** in opencv_zoo [PRIMARY]. The SFace paper trains on "CASIA-WebFace, VGGFace2, and MS-Celeb-1M" [PRIMARY, github.com/zhongyy/SFace] | **Unclear**: same pattern as YuNet (Apache/MIT file, research data). Ask OpenCV which set the 2021dec file used | Yes: ONNX, ORT WASM; OpenCV.js | 37 MB fp32 (`face_recognition_sface_2021dec.onnx`, measured download size); int8 variant smaller [UNVERIFIED size] | 0.9940 (fp32) / 0.9932 (int8) "with tools/eval", dataset not named on page; LFW per opencv_zoo eval script [UNVERIFIED] | not published | No |
| **MobileFaceNet variants** (sirius-ai, becauseofAI, insightface buffalo_s, foamliu) | mostly MIT / Apache | inherit repo licence or none stated | MS1M / CASIA-WebFace (research) | **Unclear** | Yes, small ONNX/TF.js | ~4–5 MB | LFW ~99.5% (authors, public dataset) [UNVERIFIED per repo] | not published | No |
| **AdaFace** | MIT [PRIMARY, LICENSE] | **none stated** (Google Drive links) [PRIMARY] | CASIA-WebFace, VGGFace2, MS1MV2/3, WebFace4M/12M [PRIMARY] | **Unclear / likely no** (data) | ONNX export possible | R18 ~100 MB, R100 ~250 MB [UNVERIFIED] | IJB-C TAR@FAR 1e-4: R18-WebFace4M 94.99, R100-WebFace12M 97.66; LFW 99.13–99.82 [PRIMARY, public dataset] | not published | No |
| **ArcFace / other reimplementations** (e.g. GhostFaceNets, TFace, FaceX-Zoo) | MIT / Apache | usually unstated | MS1M (withdrawn by Microsoft in 2019; consent problems widely reported [UNVERIFIED]), Glint360K, WebFace260M (research-only licence agreement [UNVERIFIED, PDF not reachable]) | **Unclear / likely no** | ONNX possible | 4–250 MB | IJB-C / LFW in each paper | not published | No |
| **EdgeFace** (Idiap) | BSD-3-Clause [PRIMARY, LICENSE] | covered by repo LICENSE [UNVERIFIED that weights are] | not named on README; WebFace (EFaR challenge) [UNVERIFIED] | **Unclear** (data) | Yes, small; designed for edge | 1.24–18.2 M params [PRIMARY] | LFW 99.57–99.83% [PRIMARY, public dataset] | not published | No |
| **FaceNet** (davidsandberg, facenet-pytorch) | MIT | not stated [PRIMARY] | CASIA-WebFace (research, institutional agreement [UNVERIFIED]) or VGGFace2 (licence conflicting: mirrors show CC BY-SA 4.0 and CC BY-NC 4.0; official page no longer states terms or offers download [PRIMARY: "download links … are no longer available"]) | **Unclear** | Yes (TF.js ports) | 107–111 MB [PRIMARY] | LFW 99.05% (CASIA) / 99.65% (VGGFace2) [PRIMARY, public dataset] | not published | No |
| **Human (vladmandic) FaceRes** | MIT | "included under license inherited from the original model source" [PRIMARY] | HSE FaceRes from Savchenko (VGGFace2-based [UNVERIFIED]) | **Unclear** | Yes, TF.js, browser | 6.7 MB | not published | "any bias included in the original models is present" [PRIMARY] | antispoof / liveness models included, sources Kaggle / uncredited [PRIMARY]: licence unclear |
| **Synthetic-data models** (DigiFace-1M) | – | – | DigiFace-1M: "can be used for non-commercial research" [PRIMARY] | **No** | – | – | – | – | – |
| **FacePlugin "Open-Source" SDK** | not named [PRIMARY: "Open source with no licensing fees"] | not named | not stated | **Unclear** | Windows/Linux, Python | – | none published | – | – |

**Finding for open models.** No open face recogniser we found has training data whose licence clearly allows commercial
use. Code licences (MIT, Apache, BSD) are fine; the weights inherit the same open question as dlib (F6). Moving to
SFace or AdaFace would raise accuracy but **would not clear the licence question**, and for insightface it would make it
worse, because insightface states "non-commercial research purposes only" outright. The only open-model route with a
clear licence is to **buy insightface's commercial licence**.

**Training-data notes.** MS-Celeb-1M was taken down by Microsoft in 2019; cleaned copies (MS1MV2/V3) still circulate
[secondary: betanews, vice]. CASIA-WebFace: "released for research and educational purposes", agreement signed by a
university department director [UNVERIFIED, secondary]. WebFace260M/42M: research-only licence agreement, no
redistribution [UNVERIFIED, secondary; primary PDF at face-benchmark.org had a certificate error]. VGGFace2: licence
conflicting across mirrors (CC BY-SA 4.0 vs CC BY-NC 4.0); official page no longer states it [PRIMARY absence].
RFW (Racial Faces in the Wild), often used for Asian-face figures, is a research dataset [UNVERIFIED terms]; we would
use it, if at all, only as an internal benchmark.

## B4. Commercial SDKs and APIs

### B4a. On-device / on-premise SDKs

| Vendor / product | Licence model | Commercial OK | Price (published?) | Runs where | Size | Published accuracy | Asian / demographic | Liveness | Thai / Asian references |
|---|---|---|---|---|---|---|---|---|---|
| **Neurotechnology VeriLook 2025.2** (Lithuania) | Proprietary SDK + per-computer/device component licences [UNVERIFIED model] | Yes (sold for products) | **Published:** Standard SDK **€339**, Extended SDK **€859**, volume licence manager €16, enterprise on request; "prices are effective February 18, 2026" [PRIMARY, neurotechnology.com/prices-verilook.html]. Per-device component prices did not load [UNVERIFIED] | Windows, Linux, macOS, Android, iOS (native); "Web service component allows easy on-premise installation for using a light-weight browser" [VENDOR CLAIM]; no WASM build found | not stated | "top 3% most accurate algorithms for 1:1 verification" in NIST FRVT Visa-Border / Kiosk [VENDOR CLAIM] | not published | Yes; iBeta PAD Level 1 (2022) [VENDOR CLAIM] | none found |
| **Paravision** (USA) | Proprietary, quote | Yes | Not published | SDKs for server, edge, mobile, desktop [VENDOR CLAIM] | – | NIST FRTE 1:1 4th globally, Visa-Border, FMR 1e-6 (Jan 2026); 1:N 5th (Jul 2025) [VENDOR CLAIM citing NIST] | "<0.65% FNMR at 1 in 100,000 FMR across all demographic groups"; "outperforms every other vendor for people of South Asian and East Asian origin" [VENDOR CLAIM citing NIST FRTE report cards] | Yes (separate product) [VENDOR CLAIM] | none found |
| **Innovatrics** (Slovakia) | Proprietary | Yes | Cloud API free tier 100 verifications/month; SDK price not published [VENDOR CLAIM] | Native embedded SDK "fully on-device / offline" [VENDOR CLAIM]; **browser component `@innovatrics/dot-face-auto-capture` is capture only** (WASM, proprietary licence) [PRIMARY, npm README]; matching via server [UNVERIFIED] | – | "Top 10 Face" in NIST [VENDOR CLAIM] | not published | Yes | none found |
| **FacePlugin** | Lifetime or yearly; mobile per App ID, server per machine [PRIMARY] | Yes | **Not published** ("contact sales for a quote") [PRIMARY] | Mobile, server, private cloud [PRIMARY]; no web SDK named | – | "NIST #1", 99.85% (metric inconsistent across pages) [VENDOR CLAIM via aggregators] | not published | Yes, iBeta Level 2 [VENDOR CLAIM, not found in registry] | none found. Note: main site reported paused [UNVERIFIED] |
| **KBY-AI** | "lifetime (perpetual) license tied to each application ID" (mobile), per HWID (server) [PRIMARY] | Yes | **Not published** [PRIMARY] | Mobile, server (Docker) [PRIMARY]; web demo only | – | "top-ranked by NIST in the FRVT 1:1" [VENDOR CLAIM via aggregators] | not published | Yes [VENDOR CLAIM] | none found |
| **Regula Face SDK** (Latvia) | Proprietary, quote | Yes | Not published (Gartner: by functionality, deployment, endpoints) | Mobile SDK matches on device [VENDOR CLAIM]; **Web Component needs a backend** (default `faceapi.regulaforensics.com`) [PRIMARY, docs] | – | not found | not published | Active + passive; iBeta, ISO 30107-3 [VENDOR CLAIM] | none found |
| **Luxand FaceSDK** | Developer licence "single-seat at $99/mo"; teams/OEM by quote [PRIMARY, trial page] | Yes | $99/month developer seat; deployment by quote | Windows, Linux, macOS, Android, iOS [UNVERIFIED]; Luxand.cloud separate ($9–249/month) [UNVERIFIED] | – | not found | not published | iBeta mentioned on trial page [VENDOR CLAIM] | none found |
| **Megvii Face++** (China) | Cloud API + offline SDK by quote | Yes | Cloud: ¥0.01/call compare or search, packs to ¥0.006 [UNVERIFIED, aggregator]; offline SDK quote | Cloud (China / international DCs [UNVERIFIED]); offline SDK native | – | Among top NIST FRTE 1:N (with Cloudwalk, NEC) [secondary: Biometric Update] | NIST IR 8280: for "a number of algorithms developed in China" the East-Asian false-positive effect "was reversed" [PRIMARY-derived, NIST report] | Yes | widely used in Asia [UNVERIFIED] |
| **SenseTime** (SenseID / SenseLink) | Sold through partners and devices | Yes | not published | devices, on-prem | – | NIST submissions [UNVERIFIED] | as above (China-developed) [UNVERIFIED] | Yes [UNVERIFIED] | Asian deployments [UNVERIFIED] |
| **insightface commercial** (see B3) | Commercial licence by email | Yes once bought | not published | ONNX (browser via ORT) or InspireFace native | 13–170 MB | public-dataset leaderboards | not published | InspireFace liveness [UNVERIFIED] | – |
| **Hardware terminal, e.g. ZKTeco** (sold in Thailand) | Product purchase; face algorithm inside the device | Yes (finished product) | **Published retail:** ZKTeco THAI02/IF40 **6,420 THB** (1,500 faces, 100,000 logs); ZKTeco BIO9 **7,490 THB** (1,200 faces) [PRIMARY, jib.co.th listings via search] | On the device; logs exported by USB / LAN | – | not published | not published | BIO40: "anti-spoofing with 3D mask" [VENDOR CLAIM] | sold by Thai retailers (JIB) [PRIMARY] |

**Finding for commercial SDKs.** We found **no commercial SDK that does 1:N face matching fully inside a web browser**.
Browser pieces from Innovatrics, Regula and FaceTec do capture and liveness in the browser (WASM) and then call a
server for matching. FaceTec states the Browser SDK (~3 MB, WASM) creates a 3D FaceMap that "is created, encrypted, and
sent to the server for the remainder of the Liveness Checks and the Face Verification", billed per liveness check with
a minimum monthly commitment [VENDOR CLAIM, facetec.com glossary / pricing]. A true on-device commercial option for
LENSIQ therefore means either (a) a licensed ONNX model run by our own browser code (insightface commercial), or
(b) a native SDK on a site device (Android kiosk app or a small local service on a site PC that the page calls on
`localhost`). Option (b) is a new architecture for LENSIQ, which today is a static site.

### B4b. Cloud APIs

| Service | Commercial OK | Price (published) | Data location | Asian accuracy | Liveness | Access limits |
|---|---|---|---|---|---|---|
| **AWS Rekognition** | Yes | Group 1 image APIs (CompareFaces, IndexFaces, SearchFacesByImage): **$0.0010/image** first 1 M, $0.0008 next 4 M; face vectors **$0.00001 per face per month**; **Face Liveness $0.015/check** first 500k (US East) [PRIMARY, aws.amazon.com/rekognition/pricing]. Thailand-region prices may differ [UNVERIFIED] | **Asia Pacific (Thailand) `ap-southeast-7` has Rekognition endpoints and Face Liveness quotas** [PRIMARY, AWS General Reference]; also Singapore, Malaysia | not published by AWS [UNVERIFIED] | Yes (Face Liveness, needs Amplify UI / mobile SDK) | AI-services content may be "stored or used for service improvements" unless the account sets an **AI services opt-out policy** [PRIMARY-derived, AWS Organizations docs] |
| **Azure AI Face** | Yes, if approved | ~$1 per 1,000 transactions, face storage per 1,000 faces/month [UNVERIFIED, third party; official page did not render] | chosen Azure region | not published | Yes (Detect Liveness) | **Limited Access**: identification and verification need registration; "available only to customers managed by Microsoft, defined as those customers and partners who are working directly with Microsoft account teams" [PRIMARY]. Approved use cases include "touchless access control" and "verifying a worker" [PRIMARY]. Microsoft also says avoid use "where enrollment … is not optional" and "where a human in the loop or secondary verification method is not available" [PRIMARY]: our PIN/QR default meets both. **Practically out of reach for LENSIQ today.** |
| **Google Cloud Vision** | – | – | – | – | – | "The Cloud Vision API doesn't support facial recognition or individual identification" [PRIMARY]. Not an option. |
| **iApp Technology** (Thai company) | Yes | Face compare **0.3 IC/call**, passive liveness **0.3 IC/call**; IC **1.25 THB** (100–19,999 IC) down to 0.89 THB (500k+), excl. VAT; packages Face S 650 THB/month (2,000 calls), Face M 3,000 THB (10,000), Face L 13,750 THB (50,000) [PRIMARY, iapp.co.th/pricing]. Separate eKYC product "฿50 / Verification" [PRIMARY]. **On-premise licence** "ติดตั้งในองค์กร" for data that cannot leave the organisation, price on request [PRIMARY] | **Not stated** on the pricing page [PRIMARY absence]; ask | threshold 36 ↔ "99.50% accuracy", 48 ↔ "99.95%" (dataset not stated) [VENDOR CLAIM] | passive liveness API | Compare is 1:1 (two images); a 1:N search endpoint was not found [UNVERIFIED] |
| **Face++ cloud** | Yes | see B4a [UNVERIFIED] | China or international DC [UNVERIFIED] | see B4a | Yes | PRC processing would be a cross-border transfer with the highest PDPA risk (compare L5) |

**Independent demographic evidence (NIST).** NIST IR 8280 (2019) found false positives "highest for West and East
African and East Asian people" on application photos, with differences up to about a factor of 100, but for "a number
of algorithms developed in China" the effect "was reversed", and for 1:1 there was no dramatic Asian/Caucasian
false-positive difference for Asia-developed algorithms; "the most equitable algorithms also tended to rank among the
most accurate" [NIST report, via search summary; page indices 2-9 to 3-9]. NIST FRTE continues to publish per-country
FMR "report cards" per algorithm; **any vendor on the shortlist must give us its FRTE algorithm name so we can read its
East Asia / South-East Asia rows ourselves** (Thailand-specific rows: [UNVERIFIED] whether FRTE breaks out Thailand).

## B5. Shortlist (2–3) with reasons

1. **insightface commercial licence (recognition-oss-pack) run in our browser code via ORT.**
   - *Why:* the only path that keeps today's architecture (static page, on-device, template in `LQVault`, no server)
     with a written commercial licence. Our ORT WASM stack already runs YOLOX, PP-OCR and LPD-YuNet. insightface models
     are strong on public benchmarks and are trained on data with many Asian identities (Glint360K, WebFace) [UNVERIFIED
     Asian figures].
   - *Unknowns:* price (email only), whether the licence covers browser distribution of the weights to customers'
     devices (the model file is downloadable by anyone who opens the page), and whether it warrants the training data.
     The detector would move to BlazeFace or SCRFD-under-the-same-licence.
   - *Effort:* M (swap behind `LQTrack`/`LQVault`, re-calibrate `FACE_RULES`, re-run `face1n.bench.mjs`).
2. **Neurotechnology VeriLook (on-premise, native).**
   - *Why:* the only established vendor with a **published** price (€339 / €859 SDK), long NIST history, iBeta liveness
     [VENDOR CLAIM], perpetual-style licences, runs offline on Windows/Linux/Android so templates stay on site.
   - *Costs:* per-device component licences not yet known; a native kiosk app or a local service is new work and a
     new support burden.
   - *Effort:* L.
3. **AWS Rekognition in `ap-southeast-7` (Bangkok), as the cloud fallback.**
   - *Why:* published per-call prices, Face Liveness in the Thailand region, data processed in Thailand (no s.28 transfer
     if pinned to that region), no minimum commitment.
   - *Costs:* needs a backend (the Cloudflare Worker is not deployed and deploying it is outside current permissions);
     LENSIQ becomes a processor of biometric data (s.40); frames leave the device, which breaks our "on-device by
     default" rule, so it could only ever be an opt-in mode with its own consent. No published Asian accuracy.
   - *Effort:* M–L.

**Runner-up:** **iApp** (Thai company; THB pricing; 1:1 compare + passive liveness; on-premise licence offered). It is the
best "Thai vendor" answer, but data location is not stated and 1:N search was not found, so it fits a *claim-then-verify*
flow (employee enters code or shows QR, then the face is compared 1:1). **Not shortlisted:** Azure (Limited Access),
Google (no recognition), Face++ / SenseTime (PRC processing or no public terms), FacePlugin / KBY-AI (marketing claims we
could not verify; FacePlugin site reported paused), all open weights without a bought licence. **Hardware terminals**
(ZKTeco 6,420–7,490 THB) are a pragmatic customer-side alternative that needs only a log importer from us; we cannot
measure or warrant their accuracy.

**Design note that applies to every option:** a **1:1 claim-then-verify** mode (PIN/QR/code first, face second) cuts the
stranger-acceptance risk sharply compared with 1:N over everyone, and it is the only mode iApp supports. It also keeps
PIN/QR as the primary method, as the owner decided.

## B6. Measurement plan for the shortlist (before any decision to swap)

**Fixed test set (decided before any run, then frozen):**

- **Volunteers:** at least **60 adults**, recruited with a written consent form (TH/EN/ZH) that names the purpose, the
  candidate vendors, where images are processed, retention (deleted within 30 days after the report) and withdrawal.
  Target mix close to a Thai workplace: Thai and other South-East Asian faces, both sexes, ages 18–60, with and without
  glasses; record skin-tone band and age band for per-group rows. Minors are excluded.
- **Sessions:** enrolment day 0 (3 poses, kiosk camera); probes on **3 different days**, each under **2 lighting
  conditions** (office light, back-lit doorway) plus **1 condition with a medical mask** and **1 with a safety helmet or
  cap**. 5 probe visits per condition.
- **Split:** 20 people **dev** (choose thresholds only), 40 people **held out** (run once). In the held-out set, 20 are
  enrolled members and 20 act as strangers against galleries of 5, 20 and 40.
- **Storage:** images and descriptors stay on an encrypted owner-controlled drive, **never in the repo** (project rule);
  cloud options are tested only with volunteers who ticked the cloud box, and only in the Thailand region.

**Metrics per option and condition:**

- **FRR** (member not recognised or wrongly rejected) and **FAR** (stranger accepted), 1:1 and 1:N, at **fixed
  thresholds chosen on dev** (vendor default, and the threshold giving FAR ≤ 0.1% on dev); report also "member shown as
  someone else".
- **Liveness (ISO 30107-3 style):** APCER per attack type (printed photo, phone-screen photo, phone video replay, paper
  mask) and BPCER (real people wrongly rejected). Each volunteer makes each attack 3 times.
- **Speed:** time from face in view to punch; model download size; works offline (yes/no).
- **Intervals:** Wilson 95%, **clustered by person** (effective n = number of people, as in `docs/STATS.md` §5), not by
  attempt. What the set can show, honestly: with 40 held-out people, 0 errors bounds a person-level rate at **≤ 8.8%**;
  1/40 → 0.4–12.9%; with 60 people, 0 errors → ≤ 6.0%. **Attempt-level FAR at 0.1% cannot be proven** by a set this
  size (0/1,200 attempts → ≤ 0.3% only if attempts were independent, which they are not). So the plan proves FRR and
  liveness at site level, and relies on NIST FRTE for low-FAR claims, labelled as NIST, not ours.
- **Baseline:** the current face-api.js pipeline is run on the same set, so every option is compared on equal terms.
- **Pass targets (proposed, owner to approve):** held-out member recognised ≥ 95% (no confirmation) in office light;
  strangers accepted 0 of 20 people in 1:N at 40 enrolled; liveness APCER 0 of 40 people for print and screen attacks;
  BPCER ≤ 5%.
- **Independent reviewer agent** re-runs the scoring from the frozen raw outputs (project rule).

## B7. PDPA impact per option

Face templates are biometric data, sensitive under **s.26**: explicit consent is needed, and in employment consent must
be free, which the PIN/QR alternative with no detriment supports (counsel question in `docs/PDPA-NOTES-FOR-COUNSEL.md`
B2). The time records themselves rest on legal obligation (s.24) and are kept ≥ 2 years (Labour Protection Act s.114);
face data keeps its own retention.

| Option | Where templates and frames live | LENSIQ's role | Cross-border (s.28–29) | New PDPA work |
|---|---|---|---|---|
| Current face-api.js / licensed insightface in browser | Customer's device only (encrypted, `LQVault`) | Software supplier, not a processor (no access) | None | Same as today; licence question closes with a bought licence |
| Native on-prem SDK (VeriLook, InspireFace, iApp on-prem) | Customer's site device or local server | Supplier; processor only if we provide remote support with access | None | Security of the site server (s.37); vendor licence-activation traffic must not carry personal data (check) |
| Hardware terminal (ZKTeco) | Inside the terminal | None for the face part | None unless the device's cloud features are on (turn off) | Customer DPIA; device firmware network behaviour unknown |
| AWS Rekognition, Thailand region | Frames sent to AWS; face vectors stored in an AWS collection | **Processor** (s.40), AWS sub-processor; DPA needed | None if pinned to `ap-southeast-7`; Singapore/US would trigger s.28 | Opt-in consent naming AWS and region; AI-services opt-out; deletion on withdrawal; breaks "on-device by default", so opt-in only |
| iApp cloud | Frames sent to iApp | Processor; iApp sub-processor | Unknown (location not stated) | Ask location and retention first |
| Azure / Face++ | Cloud | Processor | Azure: region chosen; Face++: possibly PRC | Not proposed |

## B8. Cost model, 10 / 50 / 200 staff per site

**Assumptions** (state and change them as needed): 2 punches per staff per working day (in and out), 22 working days,
so **44 punches per staff per month**; cloud options run liveness on every punch; 1 kiosk for 10 and 50 staff, 2 kiosks
for 200 (about 13 arrivals per minute at peak); prices excl. VAT; **1 USD ≈ 33 THB, 1 EUR ≈ 36 THB** [assumed rates,
check on the day]. Kiosk tablets and setup are excluded except where the option *is* hardware.

| Option | 10 staff (440 punches/mo) | 50 staff (2,200) | 200 staff (8,800) | Kind of cost |
|---|---|---|---|---|
| PIN / QR (default) | 0 | 0 | 0 | none |
| Current face-api.js | 0 | 0 | 0 | none, but licence risk F6 |
| insightface commercial | quote | quote | quote | one-off or yearly licence; per-staff cost 0 |
| Neurotechnology VeriLook | €339 SDK (≈ 12,200 THB, one-off, ours) + per-device licence × 1 [quote] | same, × 1 device | same, × 2 devices | one-off; scales with devices, not staff |
| AWS Rekognition (search + liveness) | 440 × ($0.001 + $0.015) = **$7.0 ≈ 232 THB/mo** | **$35.2 ≈ 1,160 THB/mo** | **$140.8 ≈ 4,650 THB/mo** | per use; + backend hosting [UNVERIFIED]; without liveness $0.44 / $2.20 / $8.80 |
| iApp cloud (1:1 compare + passive liveness, 0.6 IC/punch) | 880 calls → **Face S package 650 THB/mo** (PAYG 330 THB) | 4,400 calls → **PAYG 1,650 THB/mo** | 17,600 calls → **PAYG ≈ 6,600 THB/mo** (5,280 IC at 1.25) | per use |
| ZKTeco face terminal | **6,420–7,490 THB one-off** | same (capacity 1,200–1,500 faces) | **≈ 12,840–14,980 THB** (2 devices) | hardware, one-off; + our log importer (S) |

Per staff per month, cloud with liveness costs about **23 THB (AWS) to 33 THB (iApp PAYG)**; without liveness about
1.5 THB (AWS) or 16 THB (iApp). These figures should feed `docs/PRICING-RESEARCH.md` only after vendor quotes.

## B9. Risks

1. **No clean open model exists.** Every open recogniser's weights rest on research datasets; an upgrade inside the
   open world does not remove F6. Only a bought licence or a commercial SDK does.
2. **Detector is also unclear (F5).** A recogniser swap alone leaves face-api's tiny detector and landmarks; they must be
   replaced too (BlazeFace or the vendor's detector).
3. **Browser vs native.** Most commercial SDKs are native. Choosing one adds a kiosk app or local service, a new
   install and support model, and per-device licence management.
4. **Model file exposure.** A licensed ONNX model served to a browser can be copied; the licence must allow this
   distribution, or the model must be obfuscated / served only to licensed devices.
5. **Asian-face accuracy is mostly unpublished.** Except NIST IR 8280's general findings and Paravision's claim, no
   vendor publishes South-East Asian figures. Our own field measurement (B6) is mandatory.
6. **Small test sets cannot prove low FAR.** We can prove FRR and liveness; low FAR must lean on NIST FRTE, clearly
   labelled.
7. **Cloud breaks the on-device default and makes LENSIQ a processor** of sensitive data; backend deployment is outside
   current permissions.
8. **Vendor continuity.** Small vendors (FacePlugin site reported paused) may disappear; prefer vendors with NIST
   history and escrow or perpetual licences.
9. **Liveness today is off and unmeasured.** Buddy-punching with a photo is possible in face mode; PIN/QR has its own
   sharing risk. Any face option should come with measured liveness or stay "convenience, not security".
10. **Consent pressure in employment.** Face must stay optional with PIN/QR equal, or s.26 consent may not be free.

## B10. Decisions for the owner

1. **Send licence enquiries?** (a) insightface `recognition-oss-pack@insightface.ai`: price and whether browser
   distribution and training-data warranty are covered; (b) Neurotechnology: per-device VeriLook component prices;
   (c) iApp: data location, retention, 1:N, on-prem price. Drafts can be added to `docs/LICENCE-REQUESTS.md` on your
   approval; nothing has been sent.
2. **Architecture limit:** must face mode stay browser-only (favours insightface commercial), or may it use a native
   kiosk app / local service (opens VeriLook, InspireFace, iApp on-prem), or an opt-in cloud mode (AWS Bangkok, iApp)?
3. **Matching mode:** keep 1:N "walk up" or move to **1:1 claim-then-verify** (code/QR first, face second)?
4. **Measurement round:** approve the B6 plan (60 consented volunteers, frozen dev/held-out split, proposed targets),
   and who recruits volunteers and where.
5. **Letters A and B** (face-api.js and dlib data): send now, in parallel, or hold until a vendor is chosen?
6. **Hardware route:** should LENSIQ add a ZKTeco-style log importer as a cheap customer-side face option?
7. **Until decided:** keep the current face-api.js face mode as an optional, labelled mode in demos (current state), or
   also mark it "licence under review" in customer builds like age/gender?

**Built:** this comparison only. **Deferred:** any code change, vendor contact, measurement (await decisions 1–4).
**Next step:** your decision on B10.

### Sources read for Part B (2026-11-10)

- github.com/deepinsight/insightface (README licence and 2025-11-24 licensing update)
- github.com/HyperInspire/InspireFace (README licence)
- github.com/opencv/opencv_zoo `models/face_recognition_sface` (README, LICENSE), github.com/zhongyy/SFace
- github.com/davisking/dlib-models (README)
- github.com/mk-minchul/AdaFace (README, LICENSE); github.com/otroshi/edgeface (README, LICENSE);
  github.com/timesler/facenet-pytorch; github.com/vladmandic/human wiki "Models"; github.com/microsoft/DigiFace1M;
  github.com/Faceplugin-ltd/Open-Source-Face-Recognition-SDK
- robots.ox.ac.uk/~vgg/data/vgg_face2/ (no licence, downloads withdrawn)
- aws.amazon.com/rekognition/pricing; docs.aws.amazon.com/general/latest/gr/rekognition.html; AWS Organizations AI
  services opt-out docs
- learn.microsoft.com: Face Limited Access; Face transparency note (use cases)
- docs.cloud.google.com/vision/docs/detecting-faces
- neurotechnology.com/prices-verilook.html; faceplugin.com/pricing; kby-ai.com/pricing; luxand.com/facesdk/trial
- paravision.ai/trust/accuracy and news (via search); developers.innovatrics.com and npm `@innovatrics/dot-face-auto-capture`;
  docs.regulaforensics.com (via search); facetec.com pricing / glossary (via search)
- iapp.co.th/pricing and docs; jib.co.th ZKTeco listings (via search)
- NIST IR 8280 (nvlpubs.nist.gov, via search summary)
