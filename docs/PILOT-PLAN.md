# Store pilot plan: labelled footage and accuracy acceptance

The public-dataset numbers in [`ACCURACY.md`](../ACCURACY.md) are not a shop doorway. A pilot replaces them with
**numbers measured at the customer's own site**, against a human ground truth, before anyone relies on a total.
The plan below takes **4 weeks** at **1–3 stores** and produces a signed acceptance report.

> Privacy first: the pilot is the only time LENSIQ footage is **recorded**. Normal operation records nothing. Recording
> needs its own legal basis, a notice and a retention limit. The pilot footage is a separate processing activity: add
> it to the DPIA as M16 "pilot evaluation recording". Delete the footage at the end of week 4, and keep only the labels
> and metrics.

## 1. Roles

| Role | Who | Responsibility |
|---|---|---|
| Pilot owner (customer) | Store / ops manager | Site access, staff briefing, sign-off |
| LENSIQ engineer | Integrator / vendor | Install, configuration, data collection, metrics |
| Labeller(s) | 2 people, not the engineer | Independent manual ground truth |
| Privacy contact | Customer DPO or legal | Approves notices, recording and the retention of footage |

## 2. Scope: what is measured

| Module | Metric | How the ground truth is made |
|---|---|---|
| store: door counting | In and out per 15-min bin; daily totals | Two labellers count the recorded door clips independently with a tally tool. Bins where they disagree by more than 2 are reviewed by a third person. |
| store: occupancy / queue | Queue length every 60 s | Snapshot frames labelled by hand |
| store: zones / dwell | Visits per zone, median dwell | 1-hour samples, timed with a stopwatch from the footage |
| booth: unique visitors | Unique per day | Manual unique count from the clip (re-identification by the labeller); only with consent signage approved |
| customers / attendance (if used) | False-accept and false-reject rate at the chosen threshold | Enrolled volunteers (consent) plus walk-by strangers; logged by staff on paper at the counter |
| checkout / qc (if used) | Top-1 product accuracy; defect recall and precision | Scripted test set of 200 scans / 500 parts with known labels |

## 3. Timeline

| Week | Activity | Output |
|---|---|---|
| 0 (prep) | DPIA addendum M16, notice signs, camera-position survey (height 2.4–3.2 m, door fully in frame, no backlight), network check | Signed recording approval, site sheet |
| 1 | Install, configure lines and zones, **record 3 × 2 h** door clips (opening, lunch peak, evening) with the counter running live. Note the camera model, resolution and lighting. | Raw clips + LENSIQ exports (`st-day-*` CSV) |
| 2 | Labelling: two labellers produce ground truth on all clips; compute inter-rater agreement | `labels/*.csv` (time, direction, bin) |
| 2 | First metrics; tune line position, min score and re-ID; **freeze the configuration** | Tuning log |
| 3 | **Blind run**: record 3 more × 2 h with the frozen configuration and label them as in week 2. Only these clips count for acceptance. | Acceptance data set |
| 4 | Report, sign-off, **delete footage**, keep labels and metrics | Acceptance report (template, section 6) |

## 4. Labelling protocol

- **Clips:** H.264 MP4, original resolution, timestamps burned in or kept in the file name
  (`storeA_door1_2026-12-01_1200.mp4`). Store them on an encrypted drive that only the labellers and the engineer can
  access.
- **Tool:** any player with frame stepping. Record events in CSV: `clip, t_seconds, direction(in|out), note`. A child
  carried in arms counts as 1 person. Staff count unless they wear the staff badge **and** the deployment excludes
  staff (zone `staffMs`).
- **Agreement:** compute per-bin |A − B|. If more than 10% of bins disagree by more than 1, retrain the labellers and
  re-label.
- **Ground truth** is the mean of A and B after review, rounded.

## 5. Acceptance criteria (defaults; agree them in writing before week 1)

Error is LENSIQ minus ground truth, on the **blind week-3 clips only**. Report the interval, not just the point.
`tests/bench/metrics.cjs` computes the counting metrics (event matching by direction, time and position). A bootstrap over 15-minute bins gives the 95 %
confidence interval.

| Metric | Accept | Conditional (accept with a stated limitation) | Reject |
|---|---|---|---|
| Daily in-count error (each clip day) | \|err\| ≤ 5 % | 5–10 % | > 10 % |
| 15-min bin MAPE (bins with ≥ 10 people) | ≤ 12 % | 12–20 % | > 20 % |
| Direction errors (in counted as out) | ≤ 2 % of events | 2–5 % | > 5 % |
| Peak-hour bin error | ≤ 10 % | 10–15 % | > 15 % |
| Queue length (±1 person) | ≥ 85 % of snapshots | 70–85 % | < 70 % |
| Face recognition false-accept (strangers accepted as members), if used | ≤ 1 % at the chosen threshold, with staff confirmation required | 1–3 % | > 3 % |
| Face recognition false-reject, if used | ≤ 10 % | 10–20 % | > 20 % |
| Uptime during opening hours | ≥ 99 % | 97–99 % | < 97 % |

Rules:

- The **95 % CI upper bound** of the daily error must also be ≤ 10 %. A point estimate inside the "accept" band is not
  enough when its interval straddles the "reject" band. This is the same rule the dashboard uses ("ข้อมูลยังไม่พอ" /
  insufficient data).
- At least **600 ground-truth crossings** in the blind set. Fewer crossings give intervals that are too wide to
  conclude anything, so extend recording instead.
- Report results split by condition: daylight vs evening, crowd > 5 people in frame, and children.

## 6. Acceptance report template

```
Site / camera / firmware:            [ ]
Configuration hash (st-settings):    [ ]
Blind data: clips, hours, GT events: [ ] / [ ] h / [ ]
Inter-rater agreement:               [ ] % bins within ±1
Daily error (each day):              [ ] %  (95% CI [ ], [ ])
15-min MAPE:                         [ ] %
Direction errors:                    [ ] %
Peak-hour error:                     [ ] %
Queue accuracy (±1):                 [ ] %
Face FAR / FRR (if used):            [ ] % / [ ] %
Uptime:                              [ ] %
Result:   ☐ Accept   ☐ Conditional (limitations: [ ])   ☐ Reject (actions: [ ])
Footage deleted on [date] by [name]; labels/metrics retained in [location]
Signatures: pilot owner / LENSIQ engineer / privacy contact
```

## 7. Feeding results back

- Add the anonymised metrics (no footage) to `ACCURACY.md` under "On-site pilots", with the camera height, lens and
  lighting.
- Adjust the default `minScore`, line placement guidance and the Beta notices on the pages if pilots consistently
  disagree with the public-dataset numbers.
- Clips may be kept for model improvement only with a **separate** consent or legal basis, and only with faces blurred.
  The default is deletion.
