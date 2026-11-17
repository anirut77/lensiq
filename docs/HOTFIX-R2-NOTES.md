# Crisis-net hotfix round 2: notes for other teams

Source: independent review of branch `crisis-net-hotfix` at 5061f53 (2026-11-16/17). Incident record:
`docs/INCIDENT-2026-11-16-CRISIS-LEAK.md`. Owner order 2026-11-16: (a) when the crisis net triggers, the help card replaces
the whole result area; (b) the crisis check runs before validation on every input; (c) every free-text input is inventoried
and covered. Once the crisis flag is set it holds for the tab.

## For the pet team (branch `fortune-pet`, petread at d9fa0af): NOT fixed on this branch

petread.html / petread.js only exist on `fortune-pet`, so the hotfix branch cannot change them. Two defects, both against
order (b):

1. **The sticky Read bar skips the submit gate.** `petread.js:275`:
   `$("#petReadBar").addEventListener("click", () => { read(false); bar(); });` calls `read()` directly. The window `submit`
   gate (lensiq-crisis-takeover.js, inside fortune-read.js) only sees form submits, so a crisis phrase typed into a petread
   field and then the sticky bar tapped is never checked first.
   Fix: make the bar submit the form (`$("#petForm").requestSubmit()`, or whatever the form id is), so the gate runs, or call
   `if (window.LQCrisisFirst && window.LQCrisisFirst($("#petForm"))) return;` as the first line of the handler.
2. **`read()` validates before the crisis net.** `petread.js:174`: the species check
   (`if (!checked("petSpecies")) { … "pet.err.species" …; return; }`) runs before any crisis check. A crisis phrase with no
   species chosen shows the validation message, not the card.
   Fix: first line of `read()`:
   `if (window.LQCrisisFirst && window.LQCrisisFirst($("#petForm") || document.body)) return;` (it checks every free-text field
   of the page and the crisis state, shows the card and runs the takeover), then the species check.
3. Mark the petread result area with `data-lq-result` (or keep the id `petResult`, which the takeover already matches), add
   every petread free-text input to `tests/e2e/crisis-net-hotfix-inventory.json` with a flow in the e2e set and a row in
   `docs/CRISIS-INPUT-INVENTORY.md` (the inventory unit tests fail otherwise once petread is in the inventory's page list).

## For both compat (branch `fortune-compat`) and petread (branch `fortune-pet`): script versions at merge

Both branches pin the reading scripts at OLD versions (compat f3b46d8 and petread d9fa0af load `fortune-read.js?v=10`,
`fortune-crisis.js?v=11`, `fortune-ai.js?v=28`). The takeover, the submit gate and the round-2 fixes live in these files.
When either branch merges, its page MUST load the versions current on main at that time (after this hotfix:
see the table below), otherwise the browser cache can serve the old copies without the takeover:

| Asset | Version after hotfix round 2 |
|---|---|
| `fortune-read.js` | `?v=12` (carries lensiq-crisis-takeover.js) |
| `fortune-crisis.js` | `?v=12` (unchanged in round 2) |
| `fortune-ai.js` | `?v=29` (unchanged in round 2) |

Check with `grep -o 'fortune-[a-z]*\.js?v=[0-9]*' compat.html petread.html` against `tarot.html` after the merge.

## What round 2 changed (for reference)

- The palm map (`#plEdit`), the tarot pick step / board (`#trPick`), daily card (`.tr-daily`), siamsee stick (`#ssFall`), the
  iching coin step (`#icStage`) and daily (`#icDaily`), the zodiac clash table and the astro sign grid carry `data-lq-result`,
  so the takeover hides them with the reading.
- Tarot and iching: the crisis state counts as a hit, so an ordinary question after the card shows the card again; siamsee and
  the iching daily do not draw in the crisis state.
- The "Report a problem with this reading" dialog (lensiq-report.js) runs the crisis net on its note and edited preview
  before anything is saved, copied or mailed; on a hit nothing is stored, the dialog closes and the card takes over. The
  report button is hidden in the crisis state.
- If `fortune-crisis.js` fails to load, the takeover falls back to `FortuneAI.crisis.check` (fortune-ai.js has its own
  patterns) and its own page-field scan, so the early net still shows the card.
