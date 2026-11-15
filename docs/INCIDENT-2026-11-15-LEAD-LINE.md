# Incident 2026-11-15: quote-request LINE notification skipped silently (CLOSED 2026-11-16)

**Status:** closed on 2026-11-16 by the owner's confirmation. The protection follow-up is branch `lead-notify-health`.

## What happened
- **Symptom:** quote requests sent from the home-page form were stored in D1 (`leads`), but no LINE push reached the owner.
- **Affected requests:** five owner test requests:
  - 2026-11-15 05:36, 22:05, 22:06, 22:31: no push;
  - 22:35: pushed.
- **No customer data was lost.** Every request was stored and was visible in the admin inbox.

## Cause
- The Worker sends the push only when both owner-entered secrets have a valid format (`backend/src/leads.js` `lineConfig`):
  - `LINE_CHANNEL_ACCESS_TOKEN`: non-empty, no whitespace inside;
  - `LEAD_NOTIFY_LINE_TO`: `U` + 32 hex.
- The first value of `LEAD_NOTIFY_LINE_TO` was missing (05:36).
- After that, **the channel access token had been copied with a line break inside it**. The format check therefore failed, and `notifyLine` returned without calling LINE and without any log or record.
- Evidence: no `lead:line` rate-limit row exists before 22:35. That row is written only after the format check passes.

## Fix
- **2026-11-15 22:29:** the owner re-entered `LEAD_NOTIFY_LINE_TO`, using the LINE Developers console copy button.
- **2026-11-15 ~22:34:** the owner re-entered `LINE_CHANNEL_ACCESS_TOKEN`, using the console copy button.
- **2026-11-15 22:35:** the next request (b0011eb6) wrote `lead:line` = 1, and the push arrived on the owner's phone at 22:35. The owner confirmed this on 2026-11-16.
- **Recipient:** the push goes to the LINE account the owner uses for the developer console. The owner accepts this for now.

## Clean-up (owner order 2026-11-16)
- **Test requests deleted:** the five owner test requests were deleted from D1 `lensiq-test` (5 rows; 0 left).
- **Temporary notice removed:** the temporary "if the form does not send, contact us on LINE" notice next to the form was switched off:
  - `LENSIQ_LEADS_NOTICE` now defaults to false;
  - locked test `lead-form-webkit` v3.

## Follow-up (owner order 2026-11-15, protection only, branch `lead-notify-health`)
1. A skipped or failed push is recorded per request: secret name and reason only, never the value.
2. The admin inbox shows whether LINE notification works, the last success time, and the reason when it does not.
3. Secret entry checks the format: whitespace and line breaks are trimmed, and wrong values are refused.
4. Requests whose push was skipped or failed are flagged in the inbox.

## Later (low priority, owner request 2026-11-16)
Design a way to add a second notification recipient without the owner pasting any ID in chat.
