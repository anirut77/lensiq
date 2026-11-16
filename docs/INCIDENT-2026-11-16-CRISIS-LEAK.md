# Incident 2026-11-16: crisis card did not replace the whole result (fortune pages)

Status: fix built on branch `crisis-net-hotfix` (protection only). Ships once the independent reviewer passes it.

## What happened

The crisis net shows a help card (1323 / 1669 / 191 / 1300 / Samaritans) when a visitor types a crisis phrase. Rule
(CLAUDE.md): the crisis net always takes priority, the card replaces the reading, and nothing typed is shown back.

On the live site the card replaced **only the composed reading text**. Everything else the page had drawn stayed next to it.
Some inputs were checked only after the page's own format checks, and some free-text inputs were never checked at all.

| # | Defect | Page(s) | Severity |
|---|---|---|---|
| D3a | Score ring "100/100 พลังเด่นมาก", breakdown and letter values shown next to the card. `#nmStrip` spelled the typed crisis text letter by letter ("อ 6 ย 8 า 1 ก 1 …"), and `#nmResNum` printed it. | numbers (name tab) | high |
| D3b | `#frElement`, `#frPalaces`, `#frMountains`, `#frRivers`, the face map and the rest of `#frReading` stayed visible beside the card. At 375 px the first screen was the face map, not the card. | faceread (palm has the same layout) | high |
| D4 | EN / ZH crisis phrases in the Thai-only name box got "Enter a name with at least 1 Thai letter" and no card: validation ran before the crisis net. | numbers | medium |
| D5 | Inputs the net never checked, or checked only after a format check: year boxes (bazi, taksa, lek7, lifegraph, zodiac, astro, horoscope, report), the dream search box, the numbers phone / plate / house / account / compare boxes (the compare table printed the typed text back), the horoscope partner year, the faceread lead form. | see `docs/CRISIS-INPUT-INVENTORY.md` | medium |

## Found

2026-11-16, by the independent review of branch `crisis-v2-live`, which re-measured the LIVE main (656712f).

## When the gap went live

Method: `git log -S` on the widget code, on the crisis check and on the validation order. Then the first GitHub Pages
deployment (environment `github-pages`, `gh api repos/anirut77/lensiq/deployments`) whose commit contains that change. Times
are UTC, with Bangkok time (UTC+7) in brackets.

| Gap | Introduced by | Commit date | First deploy containing it |
|---|---|---|---|
| Result widgets drawn outside the reading box: faceread element / palaces / mountains / rivers / face map | c70f895 "Add โหงวเฮ้ง AI face-reading page" | 2026-11-05 | c70f895, 2026-11-05 06:24 (13:24) |
| Numbers score ring, breakdown, letter strip `#nmStrip` (spells the typed name), `#nmResNum`; Thai-only name validation before the reading | 7239e4e "Fortune AI layer … lucky numbers" | 2026-11-06 | 7239e4e, 2026-11-05 21:20 (2026-11-06 04:20) |
| Crisis card drawn **only in the reading box** (`renderSupport` clears just its container). From here on, the faceread / palm nickname shows the card beside the maps (D3b) | 6fe450a "Round 11 … fortune claim grounding + crisis card" | 2026-11-08 | f1d7fba, 2026-11-07 23:55 (2026-11-08 06:55) |
| Net extended to every free-text field (`pageText`), still only in the reading box and only when the page reaches the reading step. From here on, the numbers name tab shows the card beside the ring and strip (D3a), and EN / ZH names are stopped by validation first (D4) | 0f0ae99 "Crisis net: … check every free-text field on fortune pages" | 2026-11-12 | 0f0ae99, 2026-11-12 01:49 (08:49) |
| Crisis state (`data-lq-crisis`) hides remedy / paid blocks only, not the result widgets | 4061cfe "Fortune help line … crisis state suppresses remedies …" | 2026-11-12 | 4061cfe, 2026-11-12 12:43 (19:43) |

Before 6fe450a there was no crisis card at all on these pages. The leak described here exists from the first deploy with the
card (2026-11-07 23:55 UTC) until the fix is deployed.

Went live (fix): _to be filled in at deploy (commit, deploy time UTC / Bangkok)._

## Fix (branch `crisis-net-hotfix`)

- **(a) Takeover.** `lensiq-crisis-takeover.js` (new single source, copied into `fortune-read.js` by
  `tools/fortune-read-embed.mjs`, so the 15 reading pages get it with no extra request and the `fortune.html` hub, planner and
  lucky colour, which have no input and no reading, stay within their speed budgets) exposes `window.LQCrisisTakeover(card)`. It runs every time the card is drawn (`FortuneAI.crisis.render`, which
  every page uses). It sweeps every result area of the page: elements with `data-lq-result` or an id ending in `Result` or `Stats` (reading counters). The
  branch that holds the card stays. Every other element gets `data-lq-crisis-hide`, which is hidden by
  `html[data-lq-crisis] [data-lq-crisis-hide]{display:none!important}` (injected with the card). Page code that later sets
  `hidden = false` cannot bring an element back. The following stay visible: the card, the help lines, forms, and the boxes
  the visitor types into. The screen then scrolls so the card heading sits below the sticky top bar. Share and print buttons,
  prices, maps, rings, strips and charts are all inside the swept areas.
- **(b) Crisis check first.**
  - A capture-phase `submit` listener on the window runs before every form's own handler. It fires on a crisis signal in any
    free-text field of the page, or when the page is already in the crisis state. It stops the page's handler (so no format
    or validation check runs first) and shows the card in the form's slot.
  - Boxes that reformat while the visitor types (`type=tel`, `type=search`, `data-lq-crisis-live`) are checked on `input`
    before the formatter strips the text.
  - Forms whose own handler already runs the net first on every field keep their own card position (`data-lq-crisis-own`):
    horoscope, tarot, dream, report (and `.lq-merit` forms, checked by lensiq-merit.js). Their checks now cover all fields;
    horoscope's year filter and the dream search box run the net first. The tarot shuffle and iching coin steps still start
    for an ordinary question after a card (locked `fortune-crisis.e2e.mjs`); the reading that follows is the card again.
- **(c) Coverage.** The `tel` boxes were added to the free-text set. `docs/CRISIS-INPUT-INVENTORY.md` lists every input on
  the 18 fortune pages and cat-fortune. `tests/unit/crisis-input-inventory.test.js` fails when a new free-text input appears
  without an inventory row.
- **Tests.** The fixed set `crisis-net-hotfix` was locked before the fix: e2e parts a–d over the inventory, in TH / EN / ZH, at
  375 and 393 px. Logs are in `~/LENSIQ-field/evals/crisis-net-hotfix/`.

### For pages on other branches (petread on `fortune-pet`, compat on `fortune-compat`)

0. Load `fortune-read.js` (petread and compat already do): it carries the helper. Merge this branch first so the copy is there.
1. Mark the page's result container(s) with `data-lq-result`, or give them an id ending in `Result`.
2. Draw the card with `FortuneAI.crisis.render(box, FortuneAI.crisis.result({ lang }))`, which calls the takeover itself.
   For a card drawn in any other way, call `window.LQCrisisTakeover(box)` right after it.
3. Forms are covered by the window `submit` gate automatically. Give a form `data-lq-crisis-slot="#yourBox"` to choose where
   the card appears, or `data-lq-crisis-own` only when the page's own handler runs `FortuneAI.crisis.check(FortuneAI.crisis.fields())`
   (and `FortuneAI.crisis.active()`) before any validation.
4. Add every new free-text input to `tests/e2e/crisis-net-hotfix-inventory.json` (with a flow in the e2e set) and to
   `docs/CRISIS-INPUT-INVENTORY.md`.

### Follow-up: crisis one-number rules (owner decision 2026-11-16, branch `crisis-rules-1323`)

The card that replaces every result area (above) was then reduced by the owner's order of 2026-11-16: one number (1323) and
one call button, two or three warm lines with the longer text behind "อ่านเพิ่มเติม", the free comforting guidance, the
button after the text, then one small link to `counselling.html` where 1669, 191, 1300 and Samaritans are listed. No sticky
or floating help element. The takeover is unchanged: the result areas stay hidden and the card's contract (`.fa-support`
with an `h3`) is the same. Placement and wording: `docs/CRISIS-RESOURCES.md`; review item: `docs/LEGAL-PACKET.md` L63;
tests: `tests/unit/crisis-rules-1323.test.js`, `tests/e2e/crisis-rules-1323-{a,b,c}.e2e.mjs`.
