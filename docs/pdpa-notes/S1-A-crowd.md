# PDPA note — crowd counting & density (`crowd.html`, round 14 / S1-A)

For the owner's counsel (pre-sale review). Compiled from the source code (2026-11-08). *Not legal advice.*
The integrator may append this section to `docs/PDPA-NOTES-FOR-COUNSEL.md` and add a row to `docs/pdpa/data-map.md`.

## What the page does

Counts people in the camera view and in zones the operator draws, for events, booths and shopfronts:
people in view, density heatmap and time series, peak hours, entry/exit line counter, time spent per zone,
visitors per hour (approximate), conversion against numbers the operator types in (purchases / sign-ups), and an
optional shopfront funnel (walked past → stopped → entered). It also exports a CSV, a printable daily summary, and an
optional numbers-only JSON pack in the existing `lensiq-agg` format for `store.html`'s multi-device hub (a file download, not a network call).

## Data flow

| Step | Detail |
|---|---|
| Source | One camera (`getUserMedia`), or the demo mode with synthetic boxes and no camera. |
| Processing (on device) | YOLOX-Nano / COCO-SSD person boxes (`lensiq-detect.js`), anonymous per-session track ids (`lensiq-track.js`), zone maths (`lensiq-zones.js`), line crossing / grid / aggregates (`lensiq-crowd.js`). Frames are analysed in memory and dropped. No face detection, recognition, descriptor, re-identification, age, gender or emotion inference. |
| Stored on device (`localStorage`, prefix `lqcr-`) | Zone shapes and roles, max-people and area per zone, counting line, settings (incl. an optional spot/event name), notice acknowledgement time, the alert list (time, zone, text, staff check), and per-day numbers: peak, in/out, 24-hour series (average, peak, in, out, approximate visitors), per-minute average/max, a 24×14 grid of person-seconds, per-zone visits/dwell/peak, operator-entered outcome numbers, funnel counts. **No images, no boxes, no track ids are persisted.** |
| Leaves the device? | **No.** No network request is made by the page code (unit test asserts no fetch / XHR / beacon / WebSocket / image encoding). CSV, printed summary and JSON pack are created only when the operator presses the button, and contain numbers and zone/spot names only. |
| Retention | Storage cap (functional, not a policy choice): on page load and at day rollover, past day records lose their per-minute series (only today's chart uses it) and only the newest 60 day records are kept (`LQCrowd.DAY_KEEP`); older ones are deleted. Otherwise until the operator presses "Delete all statistics" (per-day records + alert list) or clears the browser. Zone shapes and settings stay until removed. Counsel may want a shorter default (change `DAY_KEEP`). If browser storage is full the page says so instead of silently failing. |
| Demo mode | Simulated numbers are kept in memory only: they never enter the real day record, the alert list (a separate `lqcr-demo-log`, deleted when the demo stops) or the counting line, the CSV is marked "simulated data", and the JSON pack is not exported while the demo runs. |

## Why we think the risk is low (for counsel to confirm)

- The page processes images of people (personal data under PDPA s.6 as far as a person could be identified in the live
  frame) but only in volatile memory, to produce aggregate counts that do not identify anyone.
- No biometric data (PDPA s.26) is created: no face template, no re-identification vector.
- Track ids are random per session and reset on reload; "visitors per hour" is explicitly labelled approximate.
- A notice gate requires the operator to confirm a camera notice is posted before the camera can start (`camera-notice.html`, sign A),
  and the page shows a printable notice text. Alerts ("zone at its maximum") are worded as a prompt for staff to look; a person decides.

## Open questions for counsel

1. Is the posted notice + legitimate interest (crowd safety / staffing) a sufficient lawful basis for anonymous counting at events and shopfronts, or should events also mention it in ticket terms?
2. Should the conversion feature carry wording that the typed-in sales figures must be totals only (never per-customer)? The UI already says it does not know who bought.
3. Default retention for the per-day numeric records (currently the newest 60 days, past days without the per-minute series).
4. Whether the optional spot/event name in exports needs any guidance (it is free text typed by the operator).

## Deferred

- A user-facing retention setting for `lqcr-day-*` (the 60-day cap is a storage safeguard; the policy default needs a product / counsel decision).
- Multi-camera on one device (use one device per spot and the `lensiq-agg` pack instead).
