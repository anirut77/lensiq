# PDPA note — S1-B LENSIQ Exam evidence clip (for counsel, not legal advice)

Feature: optional 10-second video clip around an exam flag, kept on the camera device (candidate's lab computer in
Mode B, the room camera laptop/phone in Mode A). Design reference: docs/EXAM.md "Evidence clip".

## What is processed

| Item | Detail |
|---|---|
| Data | Video frames (no audio) of the candidate (Mode B) or of a row of seats (Mode A, may show several candidates and invigilators). Clip metadata: time, room code, seat number, signal type (e.g. "phone may be in view"), how it was kept, expiry date. No name, no student ID beyond the seat number typed for the exam, no face descriptor, no identification. |
| When | Only when the institution switches clips on for that exam (default OFF). While on, the last ~10 s are held in browser memory only and overwritten continuously. A clip is written to storage only when (a) an invigilator taps "Keep clip" on a flag (named, logged), or (b) the institution enabled auto-keep. Un-kept clips are dropped from memory after 10 minutes. |
| Where | The browser of the camera device only (IndexedDB), encrypted with AES-GCM 256 (LQVault, non-extractable key in the same browser). Never uploaded; the dashboard receives only a JSON status ("pending", "kept", "deleted"). A person may explicitly "save as file" to hand a clip to the exam committee — that copy is then outside LENSIQ's control. |
| Retention | Auto-delete after 1 / 7 / 14 (default) / 30 / 90 days, chosen per exam; manual delete per clip or all; delete also destroys the key. |
| Not done | No audio, no continuous recording, no emotion / expression / lie analysis, no face recognition, no automated decision; the clip is evidence for a human review, not a verdict. |

## Points for counsel

1. **Lawful basis.** Exam video of identifiable students is personal data (s.6). It is not biometric data under s.26 as
   long as no face template / identification is derived (none is). Likely basis: legitimate interest / public task of
   the institution for exam integrity (s.24(5)/(4)) with the in-page notice; the lab page also asks for consent and the
   consent text names the clip. Please confirm whether consent should be the basis (then a real alternative for those
   who decline is needed — the lab page already offers "decline / ask for an alternative" without opening the camera)
   or a notice suffices. Minors: institutions with under-20 candidates may need guardian consent (s.20).
2. **Notice text** (TH / EN / ZH in i18n/*-exam.js, keys `exam.lab.n2c`, `exam.lab.n5c`, `exam.lab.n5a`,
   `exam.lab.consentClip`, `exam.hall.clipWarn`): please review wording, the retention statement and the access /
   complaint route (existing line n4 points to the DPO). The printable room notice on exam.html does not mention clips
   yet (integrator item) — Mode A rooms need it.
3. **Third parties in hall clips.** A Mode A clip can show neighbouring candidates and staff. Blurring other seats is
   deferred. Data minimisation argument today: 10 s only, kept only on a named human action, short retention.
4. **Shared lab computers.** In Mode B the clip sits encrypted on the lab computer the candidate used. The kept-clip
   list (play / save as file / delete) is behind an invigilator PIN set on the device before clips can record;
   candidates (including the next candidate on that computer) see only the number of clips. The PIN is a UI gate, not
   encryption: someone with devtools or who clears the browser's site data could still remove local data. Counsel may
   still want a policy line (kiosk profile, collect-and-delete procedure, who holds the PIN).
4a. **Retention enforcement.** Expired clips are deleted when any exam page is opened on the device, every minute
   while a camera page is open, and can never be played after their date. If the device is never used again for an
   exam, the encrypted record and its key stay until the browser data is cleared — a device-handover / decommission
   step ("delete all clips") belongs in the institution's procedure.
5. **Data subject rights.** Access: the candidate's own event log marks "clip stored on this device"; a copy can be
   produced with "save as file". Erasure: delete on the device (key destroyed). Record of processing / DPIA:
   docs/pdpa/ROPA.md and DPIA.md need an "exam evidence clip" row (integrator / owner).
6. **Security (s.37(1)).** AES-GCM with a non-extractable WebCrypto key; no plaintext fallback (recording is not even
   started when the browser cannot encrypt); per-clip key deleted on delete; max 60 clips per device.
7. **EU AI Act (if sold in the EU).** Exam proctoring is high-risk (Annex III 3(d)); the clip supports human
   oversight and logging. No emotion inference (Art 5(1)(f)) — enforced by tests/unit/exam-clip.test.js.
