# Legal review pack — for Thai counsel and the accountant

**Purpose.** Everything a Thai lawyer and a Thai accountant need to review LENSIQ before it is sold: what the product
does, what data moves where, the draft documents to approve, and the specific questions we need answered. Prepared by
the product team on 2026-11-07. Nothing in this repository is legal advice; every document listed below is marked
draft until counsel signs off.

**How to use.** Send §1–§2 and the documents in §5 as the brief. Ask counsel to answer the questions in §3 in writing
(a short memo per law is enough), to mark up the drafts, and to return the sign-off table in §6. The accountant takes
§3.5 and the billing items in §5.

---

## 1. The product in one page

| Area | What it does | Where data goes |
|---|---|---|
| On-device camera analytics (store, booth, signage, neuro, Creative Lab, QC, driver) | Counts people, dwell, queues; estimates expression and, if the operator enables it, age range and gender; product recognition; drowsiness alerts | **Stays on the device.** No images recorded or uploaded. Statistics in browser storage. A LAN hub (`server.py`) can collect numbers only. |
| Face recognition (customers, attendance, booth unique visitors) | 128-number face templates for consenting members / trainees; same-day templates for unique counts | On the device, AES-256 encrypted, auto-deleted after a set period. The business customer is the controller. |
| Photo booth, outfit studio | Background removal, ID photos, outfit changes | On the device. Optional cloud try-on is **off** and refuses non-commercial models. |
| Fortune pages (15 traditions) | Readings for entertainment, composed on the device; optional writing assistant | Only with the visitor's tick: extracted facts (no image, birth date or contact) to Anthropic (USA) via our Cloudflare Worker. |
| HR: structured interview kit, team face-reading icebreaker | Question bank, independent scoring, agreement summary; optional camera/voice presentation feedback for the candidate | In the browser tab only, cleared on close. The tool never decides or ranks. |
| Online services (being launched) | Google sign-in members, opt-in usage statistics, paid plans via PromptPay (Opn Payments) | Cloudflare (USA/global) Workers + D1; Google (sign-in); Opn (Thailand). |
| Tiers | Guest (no sign-in) · Member (free, Google sign-in) · Pro · Business (paid, not yet on sale) · Enterprise/on-prem (quotation) | Draft prices in `docs/BILLING-PLAN.md`; `pricing.html` is hidden and labelled draft. |

Data map and processing register: `docs/pdpa/data-map.md`, `docs/pdpa/ROPA.md` (M1–M19), DPIA `docs/pdpa/DPIA.md`.

## 2. Roles we believe apply (please confirm — question G1)

- **LENSIQ operator = controller** for the website, member accounts, payments, opt-in statistics, support e-mail.
- **Business customer (shop, organiser, employer) = controller** for camera use on its premises and HR use. LENSIQ
  receives none of that data by default, so we believe LENSIQ is **not** a processor for it — unless it provides
  hosting, remote support or the pilot recording, where it becomes a processor (PDPA s.40) and signs a DPA.
- **Processors of LENSIQ:** Cloudflare, Anthropic (writing assistant), e-mail provider, accountant. **Opn** is a
  processor for payment processing and an independent controller for its own KYC/AML. **Google** is an independent
  controller for sign-in. **GitHub** hosts the static site.

## 3. Questions for counsel, by law

### 3.1 Personal Data Protection Act B.E. 2562 (PDPA) and PDPC notifications

| # | Question | Context / our current position |
|---|---|---|
| P1 | Is the privacy notice (`privacy.html`) complete under s.23 and the PDPC notification on notice content? What must be added for the Member and paid tiers? | Draft lists purposes, bases, retention, recipients, transfers, rights, DPO placeholder. |
| P2 | **Biometric data (s.26):** face templates for member recognition / attendance rely on explicit consent with a non-face alternative. Is consent valid in **employment/training attendance**, given the power imbalance? Should attendance rely on a different basis or be consent-only with a mandatory alternative? | DPIA §12 / L12; `attendance.html` offers name/code check-in. |
| P3 | **Booth unique-visitor counting** creates same-day face templates of passers-by without consent, deleted at day end, never linked to identity. Is this "biometric data used to identify" under s.26, or can it run under s.24(5) as non-identifying? If s.26 applies, must it be switched off by default (count-only mode)? | Currently an operator option; sign B in `camera-notice.html`. |
| P4 | Does **age range / gender / expression estimation** (signage, neuro) without storage count as processing sensitive data or profiling requiring consent? Is a notice sign enough? | Off by default for age/gender; on-device; aggregate only. |
| P5 | Is s.24(5) legitimate interest adequate for **anonymous people counting**, with the notice sign A and an LIA in the DPIA? Do we need an LIA template per customer? | `docs/pdpa/DPIA.md` §LIA. |
| P6 | **Cross-border transfers (s.28/29):** USA has no PDPC adequacy decision. Are consent (writing assistant), contract necessity (sign-in, hosting) and the processors' DPAs/BCR-equivalents sufficient? Which wording must the consent tick carry? | Consent text in `fortune-ai.js` names "Claude by Anthropic, USA". |
| P7 | **Minors (s.20):** fortune pages and photo booths attract teenagers. What age gates do we need for Member sign-up and payment (age of majority 20; under-10 parental consent)? Is the entertainment use without sign-in acceptable? | Draft terms: under 20 needs guardian consent. |
| P8 | Is a **DPO** mandatory for LENSIQ (s.41: core activity of regular monitoring / large-scale sensitive data)? We think not for the operator, possibly yes for some customers. | |
| P9 | **Breach notification**: confirm 72 h to PDPC and our processor clause (24 h to customer) in `docs/SUPPORT.md` §5. | |
| P10 | Usage statistics: consent banner, DNT/GPC respected, daily-salted hash, 90-day raw events. Is the banner wording adequate and must refusal be as easy as acceptance (it is)? | `lensiq-analytics.js`. |
| P11 | **Pilot recording** (only time footage is recorded): legal basis, signage E, retention (deleted at end), labeller confidentiality. Is legitimate interest enough, or consent at entry? | `docs/PILOT-PLAN.md` §6. |

### 3.2 Consumer Protection Act B.E. 2522 and Unfair Contract Terms Act B.E. 2540

| # | Question |
|---|---|
| C1 | Advertising claims: may we say "ไม่เก็บภาพ / no images stored", "ออกแบบตาม PDPA / designed for PDPA", "ประมวลผลบนเครื่อง 100%"? Which need qualification? |
| C2 | Fortune pages: is the entertainment / Kalama-sutta disclaimer sufficient to avoid misleading-advertising risk? Any rules on selling amulets or paid readings we should avoid? (We sell neither.) |
| C3 | Terms §12 limitation of liability (cap = 12 months' fees; carve-outs for death/injury, wilful misconduct, gross negligence; CCC s.373) — reasonable under UCTA s.4–s.8 for consumers? |
| C4 | Refund policy (terms §9): no pro-rata for started months; yearly 14-day refund if < 20 AI readings; event 7-day / 48-h rule. Fair under UCTA? Any mandatory consumer refund rights we must state? |
| C5 | Price display: VAT-inclusive, quotas listed, "draft" pricing page hidden. Is `pricing.html` as a hidden, noindex draft acceptable until launch? |
| C6 | Round 12 labelling: the basic report is described the same way everywhere (3 systems + work / money / love deep-dive + next 3 months + 30-day plan); CSV export is labelled "free on-device in every plan" rather than a paid perk; Creator / Business list support response times, the Business onboarding call and "pilot fee credited against the first period (per quotation)". Are these adequate under the CPA labelling rules? Collateral now says "commercial profile available; face models pending legal opinion" instead of "licensed for commercial use by default" (`docs/ONE-PAGER-*.md`). |
| C7 | Lead forms before a channel exists: an unsent request is kept only in the visitor's own browser (`lq-leads`, max 10, copy / delete buttons, listed in privacy §9) and sent only when the visitor presses send once the e-mail / LINE / Worker exists. Is consent at the time of the first submit enough for that later send? |

### 3.3 Direct Sales and Direct Marketing Act B.E. 2545 (as amended B.E. 2560)

| # | Question |
|---|---|
| D1 | Is self-serve online sale of Pro/Business plans to consumers "direct marketing" requiring **registration with the OCPB** before launch? Capital/security deposit requirements? |
| D2 | If yes: the statutory **7-day cancellation right** for consumers — how does it interact with immediate access to a digital service and our refund policy? What notice text is required in the checkout? |
| D3 | Does B2B invoicing (event / enterprise packages) fall outside the Act? |

### 3.4 Electronic Transactions Act B.E. 2544 and e-commerce

| # | Question |
|---|---|
| E1 | Is acceptance by tick-box + "pay" (Worker refuses checkout without `accept_terms: true`, stores timestamp and terms version) a valid electronic contract and adequate evidence? What should we store (IP hash? full terms snapshot?) |
| E2 | Are electronic receipts e-mailed / shown on screen valid? Do we need e-signature or e-Tax Invoice by Email (ETDA timestamp) for tax invoices? |
| E3 | Do we need to register as an e-commerce operator with DBD (Department of Business Development) / show the DBD mark? |

### 3.5 Revenue Code — VAT, tax invoices, withholding (for the accountant)

| # | Question |
|---|---|
| R1 | VAT registration: turnover threshold 1.8 M THB/yr; voluntary registration advisable at launch? Prices are drafted VAT-inclusive. |
| R2 | Full tax invoice fields (s.86/4) are stored per payment; the PDF renderer is not built. Issue from the accounting system or adopt e-Tax Invoice by Email? Numbering `LQ-YYYYMM-000001` gap-free — acceptable? |
| R3 | Refunds by bank transfer (PromptPay cannot be reversed via Opn): credit-note (s.86/10) procedure and records. |
| R4 | Corporate customers' 3 % withholding: B2B via invoice only — confirm. Any WHT on our side for Anthropic/Cloudflare (foreign e-services; VAT on e-service s.83/6 reverse charge)? |
| R5 | Record retention ≥ 5 years (Revenue Code s.87/3, Accounting Act B.E. 2543) — confirm, and whether D1 storage outside Thailand is acceptable for accounting records. |
| R6 | Opn fees carry VAT — input VAT recovery once registered. |

### 3.6 Computer Crime Act B.E. 2550 (amended B.E. 2560) and camera footage

| # | Question |
|---|---|
| K1 | Normal operation records nothing. For the pilot recording and any customer that adds its own CCTV: retention duties for service providers (s.26 traffic data, 90 days) — do they apply to LENSIQ at all (we are not an access provider)? |
| K2 | Sharing pilot clips with labellers: confidentiality agreement wording; offences if footage leaks. |
| K3 | Photo booth / studio: our terms forbid creating defamatory or obscene images. Is notice-and-takedown needed given images never reach us? |

### 3.7 Labour law, discrimination and HR tools

| # | Question |
|---|---|
| L1 | Interview kit: the tool never decides or ranks; people score on structured BARS. Any obligations under the Labour Protection Act s.15 (equal treatment) or the Gender Equality Act B.E. 2558 we should reflect in the in-tool guidance? |
| L2 | The "questions not to ask" list (religion, health, pregnancy, marital status …): complete for Thai law? Persons with Disabilities Empowerment Act B.E. 2550 — reasonable-accommodation wording for the camera feedback? |
| L3 | Presentation feedback from camera/microphone (off by default, candidate-first): may an employer enable the interviewer view at all, given consent in hiring may not be free? We currently require 3 attestations (DPIA done / candidate can decline with alternative / not used for scoring). |
| L4 | Team face-reading icebreaker: is "entertainment only, never for HR decisions, opt-out" enough, or should we advise against workplace use entirely? |
| L5 | Attendance by face for employees (time-keeping) vs. trainees: separate guidance needed? |

### 3.8 General and corporate

| # | Question |
|---|---|
| G1 | Confirm the controller/processor roles in §2; provide a short DPA template (s.40) for enterprise customers and the pilot. |
| G2 | Fortune readings mention traditions (Buddhist Kalama Sutta, Chinese and Thai astrology). Any religious-sensitivity rules (e.g. Criminal Code s.206) to observe in wording? |
| G3 | Trademarks: "LENSIQ" clearance; we avoid "Rider-Waite" (U.S. Games trademark). |
| G4 | Governing law clause and consumer forum (terms §14) — acceptable? |

## 4. Model and dataset licences (commercial use)

Full inventory with sources and versions: `LICENSES/THIRD_PARTY.md` (audited 2026-11-07, section "Audit"). Every file
published under `vendor/` was matched to a row; licence texts and copyright notices now ship in
`LICENSES/THIRD-PARTY-NOTICES.txt`.

| Shipped asset | Used by | Licence (code / weights) | Training data | Commercial use | Question for counsel |
|---|---|---|---|---|---|
| face-api.js tiny face detector, 68 landmarks | all face pages | MIT | Academic face sets (WIDER-type, 300-W/iBUG-type), research terms | **Open** | M1: do research-only dataset terms bind users of MIT-licensed weights? |
| face-api.js expression model | neuro, booth, signage, photobooth | MIT | FER-style sets, unclear licences | **Open** | M1 |
| face-api.js age/gender model | signage (option, off by default) | MIT | UTKFace (non-commercial research) and others | **Highest risk** | M1; if negative, keep the option disabled for commercial deployments (recommended code change in THIRD_PARTY.md audit A4) |
| face-api.js recognition (dlib ResNet port) | customers, attendance, booth | MIT port / CC0 weights | VGG-Face, FaceScrub (research) | **Open** | M1; plus biometric P2/P3 |
| YOLOX-Nano | store (default) | Apache-2.0 | MS COCO (annotations CC BY 4.0) | OK | — |
| COCO-SSD, MobileNetV2 (TF.js) | store fallback, checkout | Apache-2.0 | COCO; ImageNet (research terms) | OK (widely used) | M2: ImageNet-trained backbone — same as M1 but low risk |
| MediaPipe hands, selfie segmenter, Selfie Multiclass, Tasks Vision | palm, signage, photobooth, studio | Apache-2.0 (model cards) | Google internal | OK; model cards exclude surveillance and identity recognition — we comply | — |
| MODNet (Xenova ONNX) | photobooth HQ, studio | Apache-2.0 (re-checked 2026-11-07; earlier releases were CC BY-NC-SA) | not stated | OK, keep dated evidence | — |
| ONNX Runtime Web, pdf.js, docx/JSZip, TF.js | runtimes | MIT / Apache-2.0 | — | OK | — |
| Prompt, Inter fonts | all pages | SIL OFL 1.1 | — | OK | — |
| Tarot scans (1909, P. C. Smith) | tarot | Public domain | — | OK; avoid "Rider-Waite" mark | G3 |
| Driver eye classifier (our weights) | driver | MIT (ours) | Open/Closed Eyes, ODC-BY 1.0 (attribution kept) | OK | — |
| Creative Lab attention weights (7 numbers) | creative | MIT (ours) | MIT1003 used for evaluation/fitting only, not shipped | OK; unfitted defaults available | M3: does fitting 7 numbers on MIT1003 create any obligation? |
| **Not shipped:** BiSeNet face parsing (CelebAMask-HQ, non-commercial) | studio option | — | — | Excluded by the build (git-ignored, FORBIDDEN rule, unit test) | — |
| **Not shipped by default:** open try-on models (CC BY-NC-SA) | `tryon.py` | — | — | Refused unless a commercial licence is attested | — |

Fallback if counsel advises against the face-api.js weights (M1): license a commercial face SDK for recognition and
age/gender, keep counting (YOLOX, Apache-2.0) as is. Estimated effort: 2–3 weeks; the detector interface is isolated
in `lensiq-detect.js` / `lensiq-facevault.js`.

## 5. Documents to review (send these files)

| Document | File | Reviewer | Status |
|---|---|---|---|
| Terms of Service (TH/EN/ZH) | `terms.html` | Lawyer | Draft v0.1 |
| Privacy Notice, s.23 (TH/EN/ZH) incl. cookie/storage list | `privacy.html` | Lawyer | Draft v0.1 |
| Camera notice signs A–E (TH/EN/ZH) | `camera-notice.html` | Lawyer | Draft |
| Help / FAQ (refund, SLA, HR rules) | `help.html` | Lawyer (consistency) | Draft |
| Consent texts (biometric, analytics, writing assistant) | `docs/pdpa/consent-texts.md` | Lawyer | Draft |
| DPIA, ROPA, data map, retention | `docs/pdpa/DPIA.md`, `ROPA.md`, `data-map.md`, `retention-table.md` | Lawyer | Draft |
| Billing plan: tiers, refunds, VAT, tax invoice | `docs/BILLING-PLAN.md` §3–§7 | Lawyer + accountant | Draft |
| Pilot agreement (TH) and pilot data handling | `docs/pilot/AGREEMENT-TH.md`, `docs/PILOT-PLAN.md` | Lawyer | Draft |
| Support / SLA and processor clauses | `docs/SUPPORT.md` | Lawyer | Draft |
| Third-party licences and notices | `LICENSES/THIRD_PARTY.md`, `LICENSES/THIRD-PARTY-NOTICES.txt` | Lawyer (IP) | Audited 2026-11-07 |
| HR in-tool guidance (questions not to ask, attestations) | `interview.html` (text), ROPA M19 | Lawyer (labour) | Shipped, unreviewed |

## 6. Sign-off (return to the product owner)

| Item | Approved as is | Approved with changes (attach) | Not approved | Name, date |
|---|---|---|---|---|
| Terms of Service | ☐ | ☐ | ☐ | |
| Privacy Notice and cookie list | ☐ | ☐ | ☐ | |
| Camera signs and consent texts | ☐ | ☐ | ☐ | |
| Refund / cancellation policy | ☐ | ☐ | ☐ | |
| Direct-marketing registration decision (D1) | ☐ needed ☐ not needed | | | |
| Tax set-up (R1–R5) | ☐ | ☐ | ☐ | |
| Model licences (M1–M3) | ☐ | ☐ | ☐ | |
| HR tools guidance (L1–L5) | ☐ | ☐ | ☐ | |
| Pilot agreement | ☐ | ☐ | ☐ | |

After sign-off: fill every `[bracket]` placeholder, set version 1.0 and the effective date on each page, remove the
draft banners, and record the reviewer, date and memo reference in `CHANGELOG.md`.

**Budget guide (to ask for quotes):** a Bangkok PDPA / tech practice typically quotes a fixed fee for a document
review of this size; ask for (a) the memo on §3, (b) marked-up drafts, (c) one revision round, (d) the DPA template.
