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
| `lensiq-exam-face.js` (`LQExamFace`) | Face engine of the lab page (2026-11-10): MediaPipe Face Landmarker (Apache-2.0) by default; face-api.js only in the research demo with `?faceengine=faceapi`. Face presence, count and head pose only (`tests/unit/exam-face.test.js`, results `docs/exam/FACE-ENGINE-RESULTS.md`) |
| `exam-link.js` (`LQExamLink`) | Transport: BroadcastChannel, optional relay, file export / import — every message through `LQExam.cleanMsg()` |
| `exam-ui.js` (`LQExamUI`) | Shared page helpers (translation, labels, plain-language reasons, downloads, storage) |
| `lensiq-exam-clip.js` (`LQExamClip`) | Evidence clip (opt-in): config, 10 s ring buffer (MediaRecorder, video only), pending slots, encrypted store (LQVault + IndexedDB). Node-testable parts in `tests/unit/exam-clip.test.js` |
| `exam-clip-ui.js` (`LQExamClipUI`) | Evidence-clip controller for the two camera pages: arm / disarm, flag → pending / auto-keep, "keep" from the dashboard, kept-clip list (play, save file, delete, delete all) |
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
| gaze | **not measured** (the mesh has iris points, but their gaze accuracy is unmeasured); hook only, low weight, never alone, off by default | info |
| frozen feed | 32×18 luma thumbnails identical (mean abs diff < 0.6) for 4 s | watch |
| virtual camera | label matches OBS / ManyCam / Snap / XSplit / DroidCam / "virtual" … | watch |
| away | blur → focus: Info with duration · `visibilitychange` hidden ≥ 5 s = Watch | info / watch |
| fullscreen exit | Watch + "return to fullscreen" button, 30 s cooldown | watch |
| copy / cut / right-click / print / PrintScreen | logged, 10 s cooldown | info |
| paste | > 50 characters = Watch, otherwise Info | info / watch |
| second screen | `screen.isExtended` (+ `change` event) | watch |
| device change / offline / online / reload | logged (reload = session marker + navigation type "reload") | info |
| setup | lighting verdict not ok for 3 of 5 checks over 5 s (dark / bright / backlight / flat / blur) | setup (not an alert) |

Face engine (since 2026-11-10, owner decision; `lensiq-exam-face.js`): **MediaPipe Face Landmarker** (Apache-2.0,
`vendor/models/face-landmarker/face_landmarker_lm.task`, the facial-movement score model removed from the bundle), CPU
delegate, every frame detected afresh, up to 4 faces, detection confidence 0.5. Exam needs no face recognition and none
is loaded. Head pose: the MediaPipe mesh points that stand in for the 68-point indices (jaw 234 / 454, nose tip 1, outer
eye corners 33 / 263, chin 152, inner lips) go through the same `poseFrom68`: yaw = asin(nose offset between the jaw
contour points ÷ 0.9) in approximate degrees; pitch is a proxy (nose position between the eye line and the chin)
converted with 120°/unit and always compared with the candidate's **own 2-minute calibration** (`calibrate`: median of
single-face frames; < 60% single-face frames = calibration fails and head turn is switched off — honest, the exam can
still start). This "mesh68" pose was picked over the transformation-matrix pose by the fixed rule of
`docs/exam/FACE-ENGINE-RESULTS.md` §1.7. If the detector fails to load or run (decided by the actual failure, never by a WebGL probe; seen on a Mac Chrome with
WebGL disabled and with WebAssembly removed), the page switches the face signals off, tells the candidate, and sends one
`setup` event (`code: "faceoff"`); it never reads as "no face".
The earlier face-api.js engine (TinyFaceDetector + 68 landmarks, MIT code, training data undocumented — LICENSES F5) is
kept in the repo behind the research-demo switch (`LENSIQ_RESEARCH.on` **and** `?faceengine=faceapi`); a customer
build never loads `vendor/face-api.js` on any Exam page (the lab and hall pages load TF.js on its own for COCO-SSD).

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
blurring the other seats in a kept hall clip (the evidence clip itself shipped in round 14 — see below).

## Evidence clip (round 14, opt-in per exam, default OFF)

| Step | What happens |
|---|---|
| Switch on | Institution only: `?clip=1` (`&clipauto=1` auto-keep, `&clipdays=1/7/14/30/90`, default 14) in the exam link, or the invigilator settings on the camera page (lab: the "settings for this subject" panel before consent; hall: the setup form while not monitoring). `LQExamClip.cleanCfg` — anything but a real `true` is OFF; auto-keep needs clips on. |
| Notice + consent | Lab: with clips on, notice line n2 ("no image recording") is replaced by n2c ("no continuous video, no audio"), a clip paragraph (n5c, or n5a for auto-keep, with the retention days) is added, and the consent checkbox text names the clip. The setting is **locked** once consent is given. Hall: a warning tells the invigilator the room notice must mention clips and that a clip may show other candidates. TH / EN / ZH. |
| While monitoring | The camera device keeps only the last ~10 s **in memory**: a new MediaRecorder segment every 2 s on a **video-only** copy of the camera stream (audio is never recorded), older segments dropped by time (not by count, so several quick flags still give a full clip). A kept clip is ~9.5–11.5 s (`pickSegs` never overshoots to 15 s).  With clips on, the lab and hall lead texts say "no continuous video" (`exam.lab.leadC`, `exam.hall.leadC`) instead of "no video".  Clips need an **invigilator PIN** on the device first (see Use): without it `arm()` records nothing and the lab consent step does not go ahead. Lab candidates see "· last 10 s kept in memory" on the permanent monitoring badge; the heartbeat carries `clip: true` so the dashboard shows "evidence clip on" for that device. Nothing at all is recorded when the browser cannot encrypt (no secure context / WebCrypto / IndexedDB) or has no MediaRecorder. |
| Flag | Only Watch / Check events of objective signals (`CLIP_SIGS`: face count, objects, head turn, frozen feed, browser / screen events, seat empty / extra / aisle / lean / early). The ring is copied into a **pending** slot (memory only, max 6, dropped after 10 min). Pending slots survive End exam, Stop monitoring and a camera reconnect (only the ring restarts), so an invigilator can still keep them within the 10 minutes; a page reload drops them (memory only, by design). The device sends `{type:"clip", id, st:"pending"}` — JSON, never video. |
| Keep | The invigilator taps **Keep clip** on that flag on the dashboard (needs the invigilator's name like every action; logged as `keepclip`, not counted as a response). The dashboard sends `{type:"keep", node, id}`; the camera device encrypts the clip and stores it. Hall nodes also have a Keep button next to the event. With auto-keep the clip is stored at once (`st:"auto"`). |
| At rest | IndexedDB `lq-exam-clips` / `clips`: metadata (time, seat, signal, how, kept, expiry) + one LQVault envelope (AES-GCM 256, non-extractable key per clip in IndexedDB `lensiq-vault`, the clip name as AAD). No plaintext fallback. Max 60 clips per device. |
| Delete | Automatic after N days: purged on load of every exam page that loads `lensiq-exam-clip.js` (`purgeDevice`, which never creates the database), every minute while a camera page is open, on every list refresh, and `load()` refuses (and deletes) an expired clip so it can never be played or saved, per clip or "delete all" on the device. Deleting removes the record **and its key** (a copied envelope can no longer be opened); the dashboard is told (`st:"del"`). LQVault `wipeAll` (admin "delete all biometric data") also makes clips unreadable. |
| Use | The kept-clip list is on the camera device only (lab: "Evidence clips on this device" below the event log; hall: under monitoring) and is **behind an invigilator PIN** (4–8 digits, `LQExamClip.createPin`: PBKDF2-SHA-256 salted hash in localStorage `lq-exam-clip-pin`, never the PIN; 5 wrong tries = 60 s wait; changing it needs the old PIN). Without the PIN anyone at the device (a candidate on a shared lab computer) sees only the number of clips — no list, play, save or delete. The list re-locks at consent, at exam start / end, when hall monitoring starts / stops, and after 5 minutes. The PIN is a UI gate, not the encryption (the clips are encrypted with LQVault either way); a forgotten PIN means clips stay locked until they auto-delete (or site data is cleared). Unlocked: play (decrypted locally into a `blob:` URL), save as file (a person's explicit action, e.g. for the committee), delete. The dashboard flag row and log row show the time and the clip status ("clip on the camera device · deleted automatically in N days"); CSV gets an extra "Evidence clip" column only when the room used clips. |
| Never | Uploaded, sent to the dashboard or relay, recorded with audio, recorded while clips are off, analysed by any model, used to score anyone. |

Also: changing the clip setting after the consent box was ticked clears the tick ("the notice has changed — read it
again"); `store.save` refuses unless LQVault really returned an encrypted envelope (even if some script set
`allowPlaintext`).

Deferred: blurring other seats in hall clips (needs a canvas re-encode per frame; would cut fps on phones), an in-app
"change PIN" button (the API supports it with the old PIN), and clips coming back to the dashboard over the relay
(deliberately not built: clips stay on the device). Note: someone with full control of the browser (devtools, clearing
site data) can still delete local data; the dashboard keeps its own "clip kept" log row either way.

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

## Accuracy — not measured yet in exam rooms

All thresholds are research-based defaults. Before sale: pilot rooms with invigilator tallies per signal, a skin-tone
breakdown, and a lawyer's review of the notice. Models: MediaPipe Face Landmarker and COCO-SSD (both Apache-2.0).

**Face engine, measured 2026-11-10 on a fixed public + synthetic set** (`docs/exam/FACE-ENGINE-RESULTS.md`, source:
public dataset Open Images V7 and synthetic frames / renders; held-out half): one face at desk distance found 22 / 26
(both engines), no false face on 37 no-person frames, faces only 24 – 48 px wide never found (0 / 12, both engines),
low light (synthetic) 76.9 % new vs 61.5 % old, mask (synthetic) 65.4 % vs 53.8 %; about 4.5× faster per frame
(12.8–18.7 ms vs 57.5–85.9 ms on WASM, two runs). Head turn on renders 81.1 % new vs 84.4 % old (synthetic render; favours the new engine; not a claim until measured on real video (pilot)).
Not measured: skin tone, mouth movement, real exam rooms.

## Tests

`tests/unit/exam-face.test.js` (mesh → 68-point mapping, pose from mesh and matrix, the fake seam, engine choice: face-api.js
only with the research demo + `?faceengine=faceapi`, no face signal without a face engine, the vendored `.task` has no
facial-movement score model, sha256 of the vendored files, the Exam pages never load `vendor/face-api.js`),
`tests/unit/exam.test.js` (gates, risk, room suppression, accommodations, pose, calibration, lighting, frozen, lab and hall
monitors, geometry, message allowlist, board, CSV), `tests/unit/exam-clip.test.js` (clip config default OFF, objective
signals only, ring segments video-only, pending drop, encrypted store / crypto-shred / auto-delete / insecure = nothing
stored, clip + keep allowlist, named keep on the board, CSV column; **no emotion / expression / age-gender API in any exam
file** and every signal in an objective-event allowlist), `tests/e2e/exam-clip.e2e.mjs` (default OFF = no MediaRecorder,
consent text, pending → named keep → encrypted record → play / delete, hall auto-keep), `tests/unit/exam-i18n.test.js` (every run-time key in en + zh, no
Thai, no verdict wording), `tests/e2e/exam*.e2e.mjs` (one per page, fake camera + `?fakedet`, phone widths, 0% Thai in
中文 / English, privacy scan; `exam-lab.e2e.mjs` also runs the real default path without `?fakedet`: MediaPipe is
requested, no face-api.js script or model is, even with `?faceengine=faceapi`, and the detector either runs (detector calls
counted) or its failure is said; with WebAssembly removed the face signals are off with one "fix setup" event and no
no-face alert; plus the research-demo path loads only the face-api.js detector + 68
landmarks). Test seams: `window.__LQ_FAKE_DET("exam-lab" | "exam-hall")`, `window.__LQ_FAKE_Q`
(lighting override), `?calsec=N`, `window.__LQ_EXAM_LAB / __LQ_EXAM_HALL / __LQ_EXAM_DB`.
