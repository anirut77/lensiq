# Data Protection Impact Assessment (DPIA): LENSIQ deployment

*Template pre-filled with what the software does as of 2026-11-06. **Not legal advice.** Fields in [brackets] are for the operator. Delete the modules you do not deploy. Review with counsel and your DPO (s.41 requires a DPO for large-scale sensitive-data processing). Repeat the DPIA whenever you add a module, change retention, enable an AI feature, or change the hosting setup.*

---

## 0. Document control

| Field | Value |
|---|---|
| Controller | [Legal entity name, address, registration no.] |
| Site(s) / event(s) | [Branch / venue, dates] |
| DPIA owner | [Name, role] |
| DPO / privacy contact | [Name, email] |
| LENSIQ version | [git commit / CHANGELOG version] |
| Modules in scope | [ ] store [ ] booth [ ] signage [ ] neuro [ ] customers [ ] attendance [ ] driver [ ] checkout [ ] qc [ ] photobooth [ ] studio [ ] fortune pages [ ] AI fortune [ ] AI try-on [ ] multi-device hub [ ] converter |
| Version / date | [v1.0, YYYY-MM-DD] |

## 1. Description of the processing

### 1.1 Nature

All computer vision runs **in the browser on the operator's device** (TF.js / MediaPipe / onnxruntime-web WASM). Camera frames are processed in memory and are not recorded or uploaded. Results are stored in the device browser (localStorage / IndexedDB). An optional `server.py` on the operator's LAN or host provides aggregation of numeric counts, PDF conversion, and relays to two opt-in cloud AI services. See [`data-map.md`](data-map.md).

### 1.2 Scope per module

| Module | Data subjects | Personal data | Sensitive (s.26)? | Volume / frequency | Retention (default → chosen) |
|---|---|---|---|---|---|
| store (counting, heatmap, queue) | Shoppers, staff | Transient person boxes in memory. Stored: counts only. Optional re-ID vector in memory for seconds. | No | [visitors/day] | Aggregates until cleared → [13 months] |
| booth | Event visitors | Same-day face descriptors (anonymous), expression | **Yes, biometric** (used for matching, even if anonymous) | [visitors/day] | Until the day changes |
| signage | Passers-by | Transient face, expression, optional age/gender estimate. Stored: aggregates. | Estimation only, no identification. Treat as high-risk if age/gender is on. | | Aggregates → [ ] |
| neuro | Test participants | Expression time series + session label | Possibly (inferences about emotion) | [n participants] | Until cleared → [ ] |
| customers | Enrolled members | Name, phone, orders, **face descriptor** | **Yes, biometric** | [n members] | Face: 365 d inactivity → [180] d. Member record: until cleared → [ ] |
| attendance | Trainees / staff | Name, code, check-in logs, **face descriptor** | **Yes, biometric** | [n people] | Face: 365 d → [course + 30 d] |
| driver | Drivers (employees) | Drowsiness events with time | Health-adjacent; employee monitoring | [n drivers] | Until cleared (≤5000 events) → [ ] |
| photobooth / studio | Guests | Photos (transient), optional try-on upload | No (unless used for identification) | | Not stored |
| fortune pages | Guests | Face/palm landmarks (transient), birth date (typed, not stored), optional nickname + contact (faceread lead form) | No | | Leads until cleared → [ ] |
| AI fortune | Guests who opt in | Derived facts + optional nickname → Anthropic (USA) | No | | Not stored by LENSIQ. Provider retention per Anthropic terms. |
| AI try-on | Guests who opt in | Photo + garment → Replicate (USA) | No (a face photo is personal data) | | Not stored by LENSIQ. Provider retention per Replicate terms. |
| multi-device hub | (none directly) | Numeric aggregates, device names | No | | 62 days on the hub |

### 1.3 Context

[Describe the venue, whether children are likely present, whether staff are filmed, signage locations, power and network, and who has physical access to the devices.]

### 1.4 Purposes

[One line per module, e.g. "store: staffing by hourly footfall"; "customers: personalised recommendations for members who opt in".]

## 2. Necessity and proportionality

| Question | Pre-filled assessment | Operator notes |
|---|---|---|
| Lawful basis | Counting/heatmap: legitimate interest s.24(5), with a balancing test below. Biometric recognition (customers, attendance, booth matching): **explicit consent s.26(1)**. Emotion research: consent. Cross-border AI: explicit consent s.28–29 (no PDPC adequacy for the USA at the time of writing; confirm). | [ ] |
| Is a less intrusive means available? | Customers: phone-number lookup. Attendance: QR or manual sign-in. Booth: counting **without** repeat-visitor matching (disable descriptors). Signage: leave age/gender **off** (the default). | [Choice made] |
| Data minimisation | No images stored. Descriptors are numbers, not photos. The AI fortune never sends photos. Hub packs are numbers only with a strict server allowlist. | |
| Accuracy | Age, gender and emotion are probabilistic and can be biased by skin tone, age, lighting and culture (pages show caveats). Face matching has a false-match threshold (`matchDistance` 0.55 in attendance). | [Threshold chosen, test results] |
| Retention | See [`retention-table.md`](retention-table.md). Automatic expiry exists only for face descriptors and booth same-day data. Everything else needs a manual routine. | [Routine owner, schedule] |
| Transparency | Signage + privacy notice ([`consent-texts.md`](consent-texts.md)) | [Where posted] |
| Data-subject rights | Delete per person in the UI. Export via the dashboard backup/CSV. | [Process owner] |
| Legitimate-interest balancing (counting) | Low intrusion (no identification or storage of images), clear benefit, reasonable expectation in retail. Children: [assess]. | [Conclusion] |

## 3. Risks

Likelihood (L) and Severity (S): 1 low, 2 medium, 3 high.

| # | Risk | Modules | L | S | Inherent |
|---|---|---|---|---|---|
| R1 | Unauthorised access to the device exposes member names/phones and face data | customers, attendance | 2 | 3 | High |
| R2 | Face descriptors re-used for purposes beyond consent (e.g. tracking, sharing) | customers, attendance, booth | 1 | 3 | Medium |
| R3 | Biometric processing without valid explicit consent (pressure, no alternative, employees) | customers, attendance | 2 | 3 | High |
| R4 | Misidentification causes wrong greeting/order history or a wrong attendance record | customers, attendance | 2 | 2 | Medium |
| R5 | Biased or inaccurate age/gender/emotion inference drives unfair treatment or decisions | signage, neuro, booth | 2 | 2 | Medium |
| R6 | People unaware they are being analysed (missing or poor signage) | store, booth, signage | 2 | 2 | Medium |
| R7 | Cross-border transfer without valid consent, or data re-use by the provider | AI fortune, AI try-on | 1 | 2 | Low–Med |
| R8 | Hub on a shared or untrusted LAN; pairing code leaked; rogue node pushes fake numbers | multi-device hub | 2 | 1 | Low–Med |
| R9 | Data retained longer than necessary (no automatic expiry for logs, members, leads) | most | 3 | 2 | High |
| R10 | Backup JSON file with names/phones left on a USB drive or in email | insights | 2 | 2 | Medium |
| R11 | ~~Google Fonts request discloses visitor IP to a third country~~ (resolved in v0.10: the font is self-hosted) | all pages | 1 | 1 | Low |
| R12 | Using non-commercially licensed models in a paid deployment (legal, not privacy) | studio face-parse, try-on, face-api datasets | 2 | 2 | Medium |
| R13 | Driver monitoring used for disciplinary action beyond the safety purpose | driver | 2 | 2 | Medium |

## 4. Mitigations

| Risk | Built-in controls | Operator controls (tick when done) | Residual |
|---|---|---|---|
| R1 | AES-GCM-256 encryption of descriptors with a non-extractable key in IndexedDB. Enrolment requires https/localhost. No images stored. | [ ] OS login + screen lock · [ ] full-disk encryption · [ ] kiosk mode · [ ] dedicated browser profile · [ ] device physically secured | Medium. Names and phones are **not** encrypted at rest; rely on device encryption. |
| R2 | Descriptors never leave the device. No export of `lqv-*` in the backup. Separate key per module. | [ ] Staff instruction · [ ] purpose limited in the consent text | Low |
| R3 | Consent checkbox is required before enrolment. `consentAt` is recorded. | [ ] Alternative offered (phone/QR) · [ ] no incentive tied to face enrolment · [ ] HR/legal review for staff | Medium (Low with the alternative) |
| R4 | Match threshold. Staff confirm the shown name. | [ ] Test with the local population · [ ] staff confirm before acting | Low |
| R5 | Age/gender off by default. On-page caveats (Barrett et al. 2019). | [ ] Do not use inferences for individual decisions · [ ] aggregate reporting only | Low–Med |
| R6 | `store.html` has a "print notice" button. | [ ] Signs at all entrances and cameras · [ ] privacy notice URL/QR | Low |
| R7 | Off by default. Per-user consent naming the USA. Server rejects requests without consent. No photos to Claude. Facts not logged. | [ ] Provider terms/DPA reviewed · [ ] disable if not needed | Low |
| R8 | LAN-only by default. Host/Origin checks. Rate limit + lockout. Token hashes. Strict numeric schema. Rotate code / revoke node. | [ ] WPA2/3 private SSID · [ ] rotate the code after setup · [ ] review the device list weekly | Low |
| R9 | Automatic face expiry. Daily booth purge. 62-day hub cap. | [ ] Monthly export-and-clear routine · [ ] calendar reminder | Medium → Low with the routine |
| R10 | Backup excludes face data and the hub token. | [ ] Store backups encrypted · [ ] delete after restore | Low–Med |
| R11 | Self-hosted font, CSP `'self'` only, `tools/check-external.mjs` | none | None |
| R12 | Face-parse disabled and git-ignored. Try-on off by default. | [ ] Licence review per `LICENSES/THIRD_PARTY.md` before paid use | Low after review |
| R13 | Events are local only. No video. | [ ] Written policy limiting use to safety · [ ] driver informed | Low–Med |

## 5. Residual risk and decision

| Item | Entry |
|---|---|
| Overall residual risk | [Low / Medium / High] |
| High residual risks remaining? | [List. If any remain high, consult the PDPC before processing.] |
| Decision | [ ] Proceed  [ ] Proceed with conditions: [ ]  [ ] Do not proceed |
| Review date | [≤ 12 months, or on change] |

## 6. Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| DPIA owner | | | |
| DPO / privacy lead | | | |
| IT / device owner | | | |
| Management approval | | | |
