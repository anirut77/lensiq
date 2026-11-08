# LENSIQ Exam — design, signals, thresholds, legal guardrails

LENSIQ Exam **assists invigilators**: it tells a person which seat to go and look at. It never decides misconduct. Every
flag is an observation ("a phone may be in view"), never a verdict ("cheating detected").

| Page | Role |
|---|---|
| `exam.html` (+ `exam-landing.js`) | Product landing: mode chooser, honest positioning, the "never" list, what a web page cannot see, signal table, fairness, PDPA / EU AI Act notes, draft pricing, printable notice + consent template (`#notice`) |
| `exam-lab.html` (+ `exam-lab.js`) | **Mode B** candidate page (computer lab / webcam): notice + consent → camera & light check → calibration → fullscreen exam; own event log |
| `exam-hall.html` (+ `exam-hall.js`) | **Mode A** camera node (laptop / phone, 2–5 fps): seat polygon editor per camera view, grid generator, walk mode, room mute |
| `exam-dashboard.html` (+ `exam-dashboard.js`) | Room dashboard for both modes: seat map, alert queue, actions, accommodations, summary, on-site tally, CSV, printable report |
| `lensiq-exam.js` (`LQExam`) | Pure logic, Node-testable, no DOM / network / images (`tests/unit/exam.test.js`) |
| `exam-link.js` (`LQExamLink`) | Transport: BroadcastChannel, optional relay, file export / import — every message through `LQExam.cleanMsg()` |
| `exam-ui.js` (`LQExamUI`) | Shared page helpers (translation, labels, plain-language reasons, downloads, storage) |
| `exam.css` | Styles for the four pages (level colours always paired with a text label) |
| `i18n/en-exam.js`, `i18n/zh-exam.js` | English / Chinese for all four pages and the run-time text (Thai is in the markup and scripts) |

## Why it does not decide

Proctorio caught 0 of 6 instructed cheaters in a University of Twente randomised trial; ProctorU dropped AI-only
decisions; most complaints are false flags (dark skin in low light, disability, tics, reading aloud); a US court held a
mandatory home room scan unconstitutional (*Ogletree v. Cleveland State*, 2022). So:

- **Never**: automatic fail or termination, flag limits, a "cheating score" shown to candidates, ranking by suspicion in
  exports (CSV / report are always in time order), emotion or expression analysis, face recognition / matching, hidden
  recording, mandatory room scans, audio keyword spotting.
- Every action on the dashboard requires the **invigilator's name**; Note / Escalate require a note. The committee report
  states that a flag is not evidence of misconduct.
- Candidates see a **gentle prompt first** (no face 5 s, fullscreen exit, phone, second screen …), a permanent
  "monitoring active" indicator, and their **own event log** with the same entries the invigilator sees (no level, no score).
- Poor detection is **"fix setup"**, not an alert: with a bad lighting verdict the no-face / head-turn / mouth signals are not
  evaluated at all, and a `setup` event (not counted in risk) asks for better light or camera position.

## Signals (defaults in `LQExam.DEFAULTS`)

Each signal is debounced (`createGate`: k of the last n samples), must persist for a set time, and has a cooldown per
seat + signal (default 90 s; held re-fires are counted, not shown). Contributions add to a **decaying risk** per seat
(`createRisk`, half-life 3 min): info 0.3, watch 1, check 2.5 points × signal weight; level = info ≥ 0.15, watch ≥ 1,
check ≥ 2.5. Low-weight signals marked `alone: false` (gaze, head toward neighbour) only count while the seat has another
contribution in the last 2 minutes — they can never raise a flag by themselves.

### Mode B (candidate page)

| Signal | Default rule | Level |
|---|---|---|
| no face | 2 of 3 frames without a face; prompt at 5 s, Watch 10 s, Check 30 s | prompt → watch → check |
| multiple faces | ≥ 2 faces in 3 of 5 frames for ≥ 3 s | check |
| head turn | \|yaw − yaw₀\| > 35° or pitch-down > 25° vs the calibrated baseline, 3 of 5 frames for ≥ 8 s = Info; ≥ 3 episodes in 5 min = Watch | info / watch |
| phone | COCO-SSD "cell phone" score ≥ 0.6 in 3 of 5 detector frames | check |
| book / laptop / other screen | score ≥ 0.5 in 3 of 5 detector frames, unless allowed for this exam | watch |
| mouth movement | MAR standard deviation > 0.06 over 3 s, for 5 s (no audio) | info |
| gaze | **not measured** (68 landmarks have no iris); hook only, low weight, never alone, off by default | info |
| frozen feed | 32×18 luma thumbnails identical (mean abs diff < 0.6) for 4 s | watch |
| virtual camera | label matches OBS / ManyCam / Snap / XSplit / DroidCam / "virtual" … | watch |
| away | blur → focus: Info with duration · `visibilitychange` hidden ≥ 5 s = Watch | info / watch |
| fullscreen exit | Watch + "return to fullscreen" button, 30 s cooldown | watch |
| copy / cut / right-click / print / PrintScreen | logged, 10 s cooldown | info |
| paste | > 50 characters = Watch, otherwise Info | info / watch |
| second screen | `screen.isExtended` (+ `change` event) | watch |
| device change / offline / online / reload | logged (reload = session marker + navigation type "reload") | info |
| setup | lighting verdict not ok for 3 of 5 checks over 5 s (dark / bright / backlight / flat / blur) | setup (not an alert) |

Head pose comes from the vendored face-api 68 landmarks (`poseFrom68`): yaw = asin(nose offset between the jaw contour
points ÷ 0.9) in approximate degrees; pitch is a proxy (nose position between the eye line and the chin) converted with
120°/unit and always compared with the candidate's **own 2-minute calibration** (`calibrate`: median of single-face
frames; < 60% single-face frames = calibration fails and head turn is switched off — honest, the exam can still start).
MediaPipe Face Landmarker was **not** vendored (no download in this round); `vendor/mediapipe/vision_bundle.mjs` already
has the code, so a `.task` file (Apache-2.0) could later replace the proxy with a real 3-D pose.

### Mode A (camera node)

Persons and phones from COCO-SSD (Apache-2.0, `vendor/models/cocossd`) on the full frame (optional 2×2 tiles for big
rooms) at 2–5 fps. A person belongs to the seat polygon that contains the box centre (overlap → nearest centroid).

| Signal | Default rule | Level |
|---|---|---|
| empty / back | seat seen occupied, then empty 3 of 4 frames for 20 s = Info; return logs the time away | info |
| early leave | empty ≥ 3 min before the minimum time (default 30 min after start) | watch |
| extra person | ≥ 2 people in a seat zone: 5 s = Watch, 15 s = Check (off in walk mode) | watch / check |
| aisle | a person outside every seat ≥ 8 s (off in walk mode; walk mode auto-off after 5 min) | watch |
| lean | > 25% of a seated person's box inside a **same-row** neighbour's polygon for ≥ 4 s (rows in front / behind overlap through perspective and are ignored) | watch |
| phone | phone box centre in a seat, score ≥ 0.5, 3 of 5 frames | check |
| head toward neighbour | v2 (front cameras only, low weight, never alone) | info |
| room event | ≥ max(3, 40% of seats) change occupancy / lean within 3 s → per-seat alerts suppressed 20 s (phones are never suppressed); manual "room event" mute 60 s on node or dashboard | info |

v2: pose landmarker (head down to lap, hand at ear, arm crossing seats), phone detection on cycled seat crops,
optional 10 s evidence ring buffer kept only on "keep" (encrypted, auto-delete, other faces blurred).

## Accommodations (`cleanProfile` / `applyAccommodation`)

Set by the institution per seat on the dashboard; no diagnosis is ever stored or sent (unknown keys are dropped):
`gazeOff`, `noFaceX` 1–3 (no-face times ×), `readAloud` (mouth off), `breaks` (empty ×3, no-face never Check, early
leave = Info), `ticX` 1–2 (head-turn time ×, repeat count ×, angles +10° per step, mouth / lean time ×). Profiles are
broadcast to the nodes (`prof` message) and also filtered on the board.

## Dashboard

Seat map coloured by the decaying level (with the word), queue in triage order (Check, then Watch, oldest first; same
seat + signal is merged with a count), sparkline of the last 10 minutes, actions Going to check / No issue / Note /
Escalate, on-site tally ("flag was right / wrong" — means *what the system said was there*, not misconduct) → precision
per signal with a 95% Wilson interval, per-room summary (alerts by type, acknowledged, dismissed, escalated, median
response time, early leavers, setup problems, muted), CSV (UTF-8 BOM, formula cells quoted, time order) and a printable
report (browser "Save as PDF"). State is kept in `localStorage` (`lq-exam-board-<room>`, numbers and short text only).

## Transport and privacy

Messages (`cleanMsg`): `ev` {room, node, src, seat, sig, lvl, t, dur?, n?, what?, code?}, `hb` heartbeat {name, seats,
fps, q, pos, walk}, `prof` {profiles}, `mute` {ms}. Any unknown key rejects the whole message, so a frame or a name can
never ride along. Node ids are random per device. Same browser: BroadcastChannel `lq-exam:<room>`. Several devices
without a server: each node exports a JSON file, the dashboard imports it. **Relay** (optional, off): set
`window.LENSIQ_EXAM_RELAY` (https or localhost) and a pairing code; `exam-link.js` then POSTs to `/api/exam/push` and
polls `/api/exam/pull?room=&since=` — **the endpoint does not exist yet** (server.py or backend/ must add it with the
same allowlist, pairing-code auth, LAN-only / rate limits as `/api/agg`), and the page CSP `connect-src` must list the origin.

## What a web page cannot see (stated on the pages)

Other applications, chat windows, background processes, a second device or phone outside the frame, earpieces, smart
glasses, people outside the camera, virtual cameras that use a real camera's name. For high stakes use Safe Exam
Browser or Chrome kiosk mode together with invigilators.

## Legal guardrails (not legal advice — lawyer review needed)

- **PDPA**: notice before the exam (what is observed, purpose, retention, who sees it), consent checkbox, an alternative
  for candidates who decline (declining never opens the camera and does not cost the right to sit the exam), access
  and complaint route. Detection / head pose without identity is not biometric identification; adding face matching
  would need explicit consent under s.26 (not built).
- **EU AI Act**: exam behaviour monitoring is high-risk (Annex III 3(d)): human oversight (every decision by a named
  person), logging (incident log), accuracy evaluation (on-site tally). Emotion inference in education is prohibited
  (Art 5(1)(f)): there is none; `tests/unit/exam*.test.js` fail on emotion / verdict wording in signal labels and translations.

## Accuracy — not measured yet

All thresholds are research-based defaults. Before sale: a face-detection miss-rate bench across lighting and skin tones
(ACCURACY.md style), pilot rooms with invigilator tallies per signal, and a lawyer's review of the notice. Models: face-api
(MIT code, weights trained on research-only data — same caveat as the other face pages) and COCO-SSD (Apache-2.0).

## Tests

`tests/unit/exam.test.js` (gates, risk, room suppression, accommodations, pose, calibration, lighting, frozen, lab and hall
monitors, geometry, message allowlist, board, CSV), `tests/unit/exam-i18n.test.js` (every run-time key in en + zh, no
Thai, no verdict wording), `tests/e2e/exam*.e2e.mjs` (one per page, fake camera + `?fakedet`, phone widths, 0% Thai in
中文 / English, privacy scan). Test seams: `window.__LQ_FAKE_DET("exam-lab" | "exam-hall")`, `window.__LQ_FAKE_Q`
(lighting override), `?calsec=N`, `window.__LQ_EXAM_LAB / __LQ_EXAM_HALL / __LQ_EXAM_DB`.
