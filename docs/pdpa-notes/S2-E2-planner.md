# PDPA note — auspicious-date planner (`planner.html`, round 14 / S2-E2)

For the owner's counsel (pre-sale review). Compiled from the source code (2026-11-08). *Not legal advice.*
The integrator may append this section to `docs/PDPA-NOTES-FOR-COUNSEL.md` and add a row to `docs/pdpa/data-map.md`.

## What the page does

Lists good candidate days for moving into a new home, opening a shop or starting new work over 1–3 months. Each day
shows its basis: weekday and day colour, approximate Thai lunar day/month (waxing moon, even lunar month for moving
house), the owners' birth weekday (Thai taksa position of that weekday) and, optionally, their zodiac year against the
day's Chinese-calendar animal. The user can tick days and save them as an `.ics` calendar file, or print the list.
Good days only: no day is labelled bad and no warning is shown; no lucky numbers; no paid remedies; no camera.

## Data flow

| Step | Detail |
|---|---|
| Input | Event type, month range; per owner (max 2, optional): birth weekday, zodiac year; optional birth date used only to work out the weekday; optional planned time for the calendar file. |
| Processing (on device) | `lensiq-planner.js` on top of `horoscope.js` (astronomical new/full moon, Thai lunar month, taksa, Chinese day pillar). Pure JavaScript in the page. |
| Stored on device | **Nothing.** No `localStorage` / `sessionStorage` / IndexedDB / cookies (unit test scans the code; e2e checks storage after a run). Inputs vanish when the page is closed. |
| Leaves the device? | **No.** No network request is made by the page code (unit test; e2e asserts only same-origin page files are fetched). The `.ics` file is generated in the browser and handed to the user as a download; it contains the chosen dates, the reasons text (which mentions the owner's birth *weekday* and zodiac animal, not the birth date) and a disclaimer. |
| Analytics | The page has no analytics call of its own. If the integrator adds it to `ANALYTICS_PAGES`, only the existing page-view counter applies (no form values). |

## Assessment (for counsel to confirm)

- A birth date is personal data (PDPA s.6) but is not sensitive data (s.26). Here it is processed transiently in the
  user's own browser for the user's own purpose and never collected by LENSIQ, so LENSIQ is arguably not a data
  controller for it. A second owner's birth weekday may be entered by the user on that person's behalf; the same
  transient, on-device handling applies.
- Consumer protection / fortune wording: the page states "for cultural planning, not a guarantee; traditions differ —
  ask a monk or astrologer you trust", and that lunar days are approximate (±1 day vs the official Thai calendar).
  Fortune hard bans (no death / illness / accident / disaster / infidelity, no lottery numbers, no paid remedies) are
  enforced by a unit test that runs every reason string (TH/EN/ZH) through `FortuneAI.safety.isSafe`.
- Retention: none. Exported `.ics` files are under the user's control.
