# Pilot kit — 2-week paid or free pilot at a customer site

A pilot turns "it works on public datasets" into **numbers measured at the customer's own site, against a human
ground truth, with a signed result**. This kit is everything needed to run one: the agreement, the signs, the success
metrics per module, a day-by-day schedule, data handling, and the report.

| Kit item | File |
|---|---|
| Pilot agreement (Thai, with data-processing clauses) | [`docs/pilot/AGREEMENT-TH.md`](pilot/AGREEMENT-TH.md) |
| Notice signs A–E for the site, TH/EN/ZH, print on A4 | `camera-notice.html` (public page; sign E = pilot recording) |
| Consent texts (face recognition, interview feedback) | [`docs/pdpa/consent-texts.md`](pdpa/consent-texts.md) |
| Success metrics and thresholds per module | §3 below |
| 2-week schedule | §4 below |
| Data handling and deletion | §5–§6 below |
| Pilot report template (fill and sign) | [`docs/pilot/RESULTS-FORM.md`](pilot/RESULTS-FORM.md) |
| Sales one-pagers to send before the pilot | `docs/ONE-PAGER-RETAIL.md`, `-EVENTS`, `-HR`, `-FORTUNE` |
| Support levels during the pilot | [`docs/SUPPORT.md`](SUPPORT.md) (pilot = Standard plan) |

> Privacy first: a pilot is the **only** time LENSIQ footage may be recorded (store / booth counting accuracy). Normal
> operation records nothing. Recording needs its own legal basis, sign E, an encrypted drive, named people with access
> and deletion at the end. Everything else in a pilot runs exactly as in production: on-device, no images kept.

## 1. Pilot types

| Type | Modules | Length | Fee (draft — set by owner) | Goal |
|---|---|---|---|---|
| **Retail** | store counting / queue / zones; insights dashboard; optionally signage, customers (face, consent) | 2 weeks (+2 weeks extended accuracy track if the blind set is too small) | free for reference customers, else credited against the first year | Accuracy acceptance + a weekly report the manager actually uses |
| **Event / booth** | booth unique visitors and dwell, photobooth, fortune activity | 1 event (1–3 days) inside the 2 weeks | per event-day pass | Visitor numbers + engagement + zero privacy complaints |
| **HR** | interview kit, team face-reading icebreaker, attendance (optional) | 2 weeks, 5–15 interviews | free | Interviewer agreement and time saved; candidate acceptance |
| **Content / fortune** | fortune pages, share cards, writing assistant | 2 weeks | free | Engagement, share rate, zero safety complaints, native-speaker review pass |

## 2. Roles

| Role | Who | Responsibility |
|---|---|---|
| Pilot owner (customer) | Store / ops / HR / marketing manager | Site access, staff briefing, weekly check-in, sign-off |
| LENSIQ engineer | Provider | Site survey, install, configuration, data collection, metrics, report |
| Labellers (retail/booth accuracy only) | 2 people, not the engineer, under NDA | Independent manual ground truth |
| Privacy contact | Customer DPO or legal | Approves signs, recording, consent forms, retention, deletion |
| Native-speaker reviewers (content pilots) | Per `docs/FORTUNE-REVIEW.md` | Score readings |

## 3. Success metrics per module (agree in writing before day 1)

"Accept" = go to production; "Conditional" = production with a stated limitation; "Reject" = fix and re-pilot or stop.

### 3.1 Store / booth counting (accuracy, blind set only)

Error = LENSIQ minus ground truth on the **blind clips** (day 8–10). Report the interval, not just the point.
`tests/bench/metrics.cjs` computes the counting metrics; a bootstrap over 15-minute bins gives the 95 % CI.

| Metric | Accept | Conditional | Reject |
|---|---|---|---|
| Daily in-count error (each clip day) | \|err\| ≤ 5 % and 95 % CI upper bound ≤ 10 % | 5–10 % | > 10 % |
| 15-min bin MAPE (bins with ≥ 10 people) | ≤ 12 % | 12–20 % | > 20 % |
| Direction errors (in counted as out) | ≤ 2 % of events | 2–5 % | > 5 % |
| Peak-hour bin error | ≤ 10 % | 10–15 % | > 15 % |
| Queue length (±1 person) | ≥ 85 % of snapshots | 70–85 % | < 70 % |
| Booth unique visitors vs. manual unique count | ≤ 10 % | 10–20 % | > 20 % |
| Uptime during opening hours | ≥ 99 % | 97–99 % | < 97 % |

Minimum blind set: **600 ground-truth crossings**. Fewer → extend recording (extended track, §7).

### 3.2 Face recognition (customers, attendance), only with enrolled volunteers who consented

| Metric | Accept | Conditional | Reject |
|---|---|---|---|
| False accept (stranger accepted as a member) at the chosen threshold, staff confirmation on | ≤ 1 % | 1–3 % | > 3 % |
| False reject (member not recognised) | ≤ 10 % | 10–20 % | > 20 % |
| Share of people who chose the non-face alternative | report only — must be possible without friction | | |

### 3.3 Signage / neuro / Creative Lab

| Metric | Accept | Conditional | Reject |
|---|---|---|---|
| Opportunity-to-see count vs. manual count (sample of 2 × 30 min) | ≤ 10 % | 10–20 % | > 20 % |
| Creative Lab: manager rates the A/B report "useful for a decision" (1–5) | ≥ 4 | 3 | ≤ 2 |
| Age/gender estimation | only if the customer enables it **and** counsel has cleared the model licence (LEGAL-REVIEW-PACK M1) | | |

### 3.4 HR interview kit

| Metric | Accept | Conditional | Reject |
|---|---|---|---|
| Interviews run with the kit | ≥ 5 | 3–4 | < 3 |
| Inter-interviewer agreement shown by the kit (share of competencies within 1 point) | report baseline; ≥ 70 % or improving week 2 vs week 1 | 50–70 % | < 50 % |
| Interviewer time to a written, evidence-based summary | ≤ 10 min after the interview | 10–20 min | > 20 min |
| Candidate survey "the process was fair and clear" (1–5) | ≥ 4.0 | 3.5–4.0 | < 3.5 |
| Candidates who declined camera feedback and got the alternative without penalty | 100 % | — | < 100 % |
| Any hiring decision made by the tool | **0** (it cannot) — any attempt to use team face reading for HR decisions ends the pilot | | |

### 3.5 Fortune / content and events

| Metric | Accept | Conditional | Reject |
|---|---|---|---|
| Readings completed per active booth hour (events) | ≥ 20 | 10–20 | < 10 |
| Share-card downloads / readings | ≥ 15 % | 8–15 % | < 8 % |
| Visitor problem reports per 1,000 readings (`lensiq-report.js`) | ≤ 3, none safety | 3–8 | > 8 or any safety |
| Native-speaker review gate (`docs/FORTUNE-REVIEW.md` §4) | pass | — | fail |
| Privacy complaints | 0 | — | ≥ 1 substantiated |

## 4. Two-week schedule

| Day | Retail / booth | HR | Content / fortune | Output |
|---|---|---|---|---|
| −5 to −1 (prep) | Sign agreement; site survey (camera height 2.4–3.2 m, whole door in frame, no backlight); DPIA addendum for pilot recording; print signs A + E (+ C if face) | Agreement; pick 5–15 openings/interviews; brief interviewers | Agreement; choose pages and venue | Signed agreement, site sheet, signs up |
| 1 | Install, lines and zones, run live | Kit set-up, question bank per role, interviewer training (1 h) | Booth set-up, kiosk mode, staff training | Configuration log |
| 2–3 | Record 3 × 2 h door clips (opening, lunch peak, evening) with counter running | First interviews | First event day / week of content | Raw clips (encrypted) + exports |
| 4–5 | Labelling (2 labellers, independent); agreement check; first metrics | Interviewer feedback round | Export review sheet; reviewers start | Labels, first numbers |
| 6–7 | Tune line position, min score, re-ID; **freeze configuration** (hash recorded) | Adjust question bank | Fix flagged readings if any | Tuning log, frozen config |
| 8–10 | **Blind run**: record 3 × 2 h more with the frozen configuration; label | Remaining interviews; candidate survey | Event days; collect visitor reports | Acceptance data set |
| 11–12 | Compute metrics with CIs; weekly dashboard review with the manager | Agreement/time metrics | Ingest review sheets and reports | Draft report |
| 13 | Report meeting; sign-off | same | same | Signed report |
| 14 | **Delete all footage** (witnessed), keep labels and metrics; remove sign E | Delete pilot score sheets unless the customer keeps them as its own records | Clear booth devices | Deletion record |

## 5. Data handling during the pilot

| Data | Where | Who can access | Kept until | Deleted how |
|---|---|---|---|---|
| Pilot door clips (retail/booth only) | Encrypted drive (BitLocker/FileVault/VeraCrypt), never cloud | 2 labellers + engineer, named in the agreement | Day 14 | Secure delete, witnessed by the customer's privacy contact, logged in the report |
| Labels (`clip, t_seconds, direction`) and metrics | Provider project folder | Provider, customer | End of contract + 1 year, or as agreed | Delete on request |
| Statistics on devices (`st-*`, `booth-*` …) | Customer devices | Customer | Customer's retention table | Customer clears in-page |
| Face templates (if face pilot) | Customer device, encrypted | Customer | Pilot end, unless the member consents to continue | "Delete all face data" |
| Interview scores and evidence | Interviewer's browser tab / customer's printouts | Customer | Customer's recruitment retention | Customer |
| Fortune readings | Visitor devices; reports only if the visitor sends them | — | — | — |

Rules: no footage leaves the encrypted drive; no screenshots with faces in reports or slides; labellers sign the NDA
section of the agreement; clips may be kept for model improvement **only** with a separate written legal basis and
faces blurred (default: deletion).

## 6. Labelling protocol (retail / booth)

- **Clips:** H.264 MP4, original resolution, timestamps burned in or in the file name
  (`storeA_door1_2026-12-01_1200.mp4`).
- **Tool:** any player with frame stepping. Events in CSV: `clip, t_seconds, direction(in|out), note`. A child carried
  in arms counts as 1. Staff count unless they wear the staff badge **and** the deployment excludes staff (`staffMs`).
- **Agreement:** per-bin |A − B|. If more than 10 % of bins differ by more than 1, retrain and re-label.
- **Ground truth** = mean of A and B after review, rounded. Bins where they differ by more than 2 are reviewed by a third
  person.
- Report results split by condition: daylight vs evening, crowd > 5 people in frame, children.

## 7. Extended accuracy track (4 weeks)

Use when the blind set has fewer than 600 crossings, when the customer needs a formal acceptance certificate across
seasons, or for multi-door stores. Same protocol, with week 1 install + record, week 2 label + tune + freeze, week 3
blind recording, week 4 report and deletion. The metrics in §3.1 are unchanged.

## 8. After the pilot

- Add the anonymised metrics (no footage) to `ACCURACY.md` under "On-site pilots", with camera height, lens and lighting.
- If pilots consistently disagree with the public-dataset numbers, adjust the default `minScore`, the line-placement
  guidance and the Beta labels.
- Convert: Accept → order form for the agreed plan (Business or Enterprise) with the pilot fee credited; Conditional →
  order form listing the limitation and a re-check date; Reject → written action plan or close.
- Ask for a reference quote and permission to name the customer (separate written consent).
