# LENSIQ PDPA pack

Templates and reference material for a shop, event or training operator (the **data controller**) deploying LENSIQ under Thailand's **Personal Data Protection Act B.E. 2562 (2019)** ("PDPA").

> **Not legal advice.** These documents describe how the software processes data and give starting templates. Review them with qualified Thai counsel before use, and adapt them to your actual deployment. Requirements and PDPC guidance change over time.

## Contents

| File | Use it for |
|---|---|
| [`data-map.md`](data-map.md) | What data each module collects, where it is processed and stored, and what (if anything) leaves the device. Third parties included. |
| [`retention-table.md`](retention-table.md) | Every storage key and database per module, its default retention, and how to delete it. |
| [`DPIA-template.md`](DPIA-template.md) | Data Protection Impact Assessment, pre-filled for LENSIQ modules. Complete and sign it before go-live for any module that processes faces. |
| [`consent-texts.md`](consent-texts.md) | Ready-to-use Thai and English notices and consent wording: CCTV/analytics signage, biometric consent, photo booth, AI fortune (cross-border), withdrawal. |

## Roles

- **You (the shop or event operator) are the data controller.** You decide which modules to run, why, and for how long.
- **LENSIQ runs on your devices.** By default the software author receives no data. There is no telemetry and no analytics beacon.
- **Optional processors / third parties** are involved only if you enable them: Anthropic (AI fortune), Replicate (AI try-on), Google (web font delivery), and your own hosting provider if you host `server.py` (option D in the README).

## How a shop uses this pack (in order)

1. **Choose modules** and write down the purpose of each (e.g. "count visitors per hour to plan staffing").
2. **Pick a lawful basis** per module (see the DPIA). Typical bases:
   - Counting and heatmaps with no identification (`store`, `booth` counts, `signage` counts): legitimate interest (s.24(5)), with a clear notice sign.
   - **Face recognition** (`customers`, `attendance`): biometric data is **sensitive personal data under s.26**. It requires **explicit consent**, given separately and voluntarily. Offer a non-biometric alternative, such as a phone number lookup or a manual sign-in sheet.
   - Emotion analysis (`neuro`): consent from participants.
   - Photo booth / studio / fortune: consent at the kiosk (s.19), plus explicit cross-border consent for the AI features (s.28–29).
3. **Complete the DPIA** ([`DPIA-template.md`](DPIA-template.md)) and sign it off.
4. **Put up notices and prepare consent texts** ([`consent-texts.md`](consent-texts.md)). Print the signage. The consent checkboxes already built into `customers.html`, `attendance.html`, `neuro.html` and the AI features should match your final wording.
5. **Set retention.** In customers and attendance, choose a retention period. Plan export and wipe routines ([`retention-table.md`](retention-table.md)).
6. **Licence review.** Some ML components are not cleared for commercial use. See [`../../LICENSES/THIRD_PARTY.md`](../../LICENSES/THIRD_PARTY.md).
7. **Follow the operator checklist** in [`../DEPLOYMENT-CHECKLIST.md`](../DEPLOYMENT-CHECKLIST.md).
8. **Handle data-subject requests.** Access, rectification, erasure, withdrawal of consent, objection: see "Withdrawal" in `consent-texts.md` and the delete procedures in `retention-table.md`. Respond within 30 days (s.30).
9. **Breach handling.** Notify the PDPC within 72 hours of becoming aware of a breach unless it is unlikely to pose a risk (s.37(4)). See the incident section in the deployment checklist.

## Built-in safeguards you can cite

- On-device inference. No image or video upload by any analytics module.
- Face descriptors are encrypted with AES-GCM using a non-extractable key held in the browser. Enrolment requires HTTPS or localhost. Retention can be set to 30–730 days. "Delete all face data" destroys both the ciphertext and the key.
- Booth repeat-visitor matching is anonymous and erased daily.
- The multi-device hub accepts numbers only, within a strict schema, and keeps 62 days.
- AI features are off by default. Each requires both an operator key and a per-user consent tick. The fortune AI never receives photos.
