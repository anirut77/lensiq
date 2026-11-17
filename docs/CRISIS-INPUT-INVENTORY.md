# Crisis net: input inventory (fortune pages)

Every input on the 18 fortune pages plus cat-fortune (owner order 2026-11-16 (c)). Source of truth:
`tests/e2e/crisis-net-hotfix-inventory.json` (locked with the crisis-net-hotfix set). `tests/unit/crisis-input-inventory.test.js`
fails when a free-text input appears on a fortune page without a row there, or when a row is missing from this table. The e2e set
`tests/e2e/crisis-net-hotfix-{a,b,c,d}.e2e.mjs` iterates over the rows that can hold a phrase.

"Covered" = every case of the locked e2e passes: crisis phrase (TH / EN / ZH, the short ZH phrase where a long one does not fit)
in page languages TH / EN / ZH at 375 and 393 px -> only the help card, on the first screen, no reading widget, share / print
button or echo of the typed text. Before = main 656712f (`~/LENSIQ-field/evals/crisis-net-hotfix/baseline-656712f-*.log`),
after = branch crisis-net-hotfix 64f0d4a (`after-64f0d4a-*.log`). Pages without a row: fortune, cat-fortune and luckycolor have no input.

| Page | Input | Type | maxlength | Can hold a phrase | Covered before | Covered after | How (after) |
|---|---|---|---|---|---|---|---|
| faceread | `#frFile` | file | – | no: photo picker, no text | n/a | n/a | – |
| faceread | `#frAge` | number | – | no: type=number: the browser keeps only a number (letters are dropped) | n/a | n/a | – |
| faceread | `#frNick` | text | 24 | yes | **no** (0/10 cases) | yes (10/10 cases) | card drawn by the reading (narration), then takeover |
| faceread | `#frLeadNick` | text | 40 | yes | **no** (0/6 cases) | yes (6/6 cases) | window submit gate (slot after the lead block) |
| faceread | `#frLeadContact` | text | 80 | yes | **no** (0/6 cases) | yes (6/6 cases) | window submit gate (slot after the lead block) |
| faceread | `#frLeadConsent` | checkbox | – | no: on / off only | n/a | n/a | – |
| faceread | `#frPhotoCard` | checkbox | – | no: on / off only | n/a | n/a | – |
| faceread | `#frStatsOn` | checkbox | – | no: on / off only | n/a | n/a | – |
| faceread | `#frSetReco` | checkbox | – | no: on / off only | n/a | n/a | – |
| faceread | `#frSetLeads` | checkbox | – | no: on / off only | n/a | n/a | – |
| palm | `#plFile` | file | – | no: photo picker, no text | n/a | n/a | – |
| palm | `#plNick` | text | 24 | yes | **no** (0/10 cases) | yes (10/10 cases) | card drawn by the reading (narration), then takeover |
| palm | `#plFateNone` | checkbox | – | no: on / off only | n/a | n/a | – |
| palm | `#plStatsOn` | checkbox | – | no: on / off only | n/a | n/a | – |
| horoscope | `#hsName` | text | 60 | yes | **no** (0/10 cases) | yes (10/10 cases) | page handler, crisis first on every field (own) |
| horoscope | `#hsYear` | text | 4 | yes | **no** (0/4 cases) | yes (4/4 cases) | page handler, crisis first on every field (own) |
| horoscope | `input[name="hsEra"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| horoscope | `#hsTime` | time | – | no: time picker | n/a | n/a | – |
| horoscope | `#hsNoTime` | checkbox | – | no: on / off only | n/a | n/a | – |
| horoscope | `#hsLat` | number | – | no: type=number: the browser keeps only a number (letters are dropped) | n/a | n/a | – |
| horoscope | `#hsLon` | number | – | no: type=number: the browser keeps only a number (letters are dropped) | n/a | n/a | – |
| horoscope | `#hsSunrise` | checkbox | – | no: on / off only | n/a | n/a | – |
| horoscope | `#hsHidden` | checkbox | – | no: on / off only | n/a | n/a | – |
| horoscope | `#hsPName` | text | 40 | yes | **no** (0/6 cases) | yes (6/6 cases) | partner handler, now every field (own) |
| horoscope | `#hsPYear` | text | 4 | yes | **no** (0/4 cases) | yes (4/4 cases) | partner handler, now every field (own) |
| horoscope | `#hsPTime` | time | – | no: time picker | n/a | n/a | – |
| horoscope | `#hsNameNum` (created by horoscope.js renderNum (numerology tab)) | text | 60 | yes | **no** (0/6 cases) | yes (6/6 cases) | input handler, crisis first |
| horoscope | `#hsStatsOn` | checkbox | – | no: on / off only | n/a | n/a | – |
| tarot | `#trQuestion` | textarea | 140 | yes | **no** (0/10 cases) | yes (10/10 cases) | page handler, now every field + crisis state (own) |
| tarot | `#trReversed` | checkbox | – | no: on / off only | n/a | n/a | – |
| tarot | `#trStatsOn` | checkbox | – | no: on / off only | n/a | n/a | – |
| iching | `#icQuestion` | textarea | 140 | yes | **no** (0/10 cases) | yes (10/10 cases) | page handler, now every field + crisis state |
| iching | `#icStatsOn` | checkbox | – | no: on / off only | n/a | n/a | – |
| bazi | `#lcYear` | text | 4 | yes | **no** (0/4 cases) | yes (4/4 cases) | window submit gate |
| bazi | `input[name="lcEra"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| bazi | `#lcTime` | time | – | no: time picker | n/a | n/a | – |
| bazi | `#lcNoTime` | checkbox | – | no: on / off only | n/a | n/a | – |
| bazi | `#lcSolar` | checkbox | – | no: on / off only | n/a | n/a | – |
| bazi | `#lcLon` | number | – | no: type=number: the browser keeps only a number (letters are dropped) | n/a | n/a | – |
| bazi | `input[name="lcGender"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| taksa | `#lcYear` | text | 4 | yes | **no** (0/4 cases) | yes (4/4 cases) | window submit gate |
| taksa | `input[name="lcEra"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| taksa | `#lcTime` | time | – | no: time picker | n/a | n/a | – |
| taksa | `#lcNoTime` | checkbox | – | no: on / off only | n/a | n/a | – |
| lek7 | `#lcYear` | text | 4 | yes | **no** (0/4 cases) | yes (4/4 cases) | window submit gate |
| lek7 | `input[name="lcEra"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| lek7 | `#lcTime` | time | – | no: time picker | n/a | n/a | – |
| lek7 | `#lcNoTime` | checkbox | – | no: on / off only | n/a | n/a | – |
| numbers | `#nmPhone` | tel | 14 | yes | **no** (0/6 cases) | yes (6/6 cases) | live input gate before the formatter + submit gate (slot #nmNarr) |
| numbers | `#nmPlate` | text | 12 | yes | **no** (0/6 cases) | yes (6/6 cases) | window submit gate (slot #nmNarr) |
| numbers | `#nmHouse` | text | 16 | yes | **no** (0/6 cases) | yes (6/6 cases) | window submit gate (slot #nmNarr) |
| numbers | `#nmAcct` | text | 7 | yes | **no** (0/5 cases) | yes (5/5 cases) | live input gate before the formatter + submit gate (slot #nmNarr) |
| numbers | `#nmName` | text | 40 | yes | **no** (0/10 cases) | yes (10/10 cases) | window submit gate (slot #nmNarr) |
| numbers | `.nm-cmp-in` ×5 | tel | 14 | yes | **no** (0/6 cases) | yes (6/6 cases) | live input gate + submit gate (slot #nmNarr) |
| numbers | `#nmAll` | checkbox | – | no: on / off only | n/a | n/a | – |
| numbers | `#nmAI` | checkbox | – | no: on / off only | n/a | n/a | – |
| numbers | `#nmStatsOn` | checkbox | – | no: on / off only | n/a | n/a | – |
| fengshui | `#fsYear` | number | – | no: type=number: the browser keeps only a number (letters are dropped) | n/a | n/a | – |
| fengshui | `input[name="fsGender"]` ×3 | radio | – | no: choice only | n/a | n/a | – |
| fengshui | `#fsHeadingSlider` | range | – | no: slider | n/a | n/a | – |
| fengshui | `input[name="fsView"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| fengshui | `#fsPhoto` | file | – | no: photo picker, no text | n/a | n/a | – |
| fengshui | `#fsConsent` | checkbox | – | no: on / off only | n/a | n/a | – |
| fengshui | `#fsStatsOn` | checkbox | – | no: on / off only | n/a | n/a | – |
| dream | `#drText` | textarea | 300 | yes | **no** (0/10 cases) | yes (10/10 cases) | page handler while typing and on submit, now every field (own) |
| dream | `#drSearch` | search | – | yes | **no** (0/6 cases) | yes (6/6 cases) | search input handler, crisis first (own form) |
| dream | `#drStatsOn` | checkbox | – | no: on / off only | n/a | n/a | – |
| zodiac | `#zdBirthYear` | text | 4 | yes | **no** (0/4 cases) | yes (4/4 cases) | window submit gate |
| zodiac | `input[name="zdEra"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| zodiac | `#zdStatsOn` | checkbox | – | no: on / off only | n/a | n/a | – |
| astro | `#asYear` | text | 4 | yes | **no** (0/4 cases) | yes (4/4 cases) | window submit gate |
| astro | `input[name="asEra"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| astro | `#asTime` | time | – | no: time picker | n/a | n/a | – |
| astro | `#asNoTime` | checkbox | – | no: on / off only | n/a | n/a | – |
| astro | `#asLat` | number | – | no: type=number: the browser keeps only a number (letters are dropped) | n/a | n/a | – |
| astro | `#asLon` | number | – | no: type=number: the browser keeps only a number (letters are dropped) | n/a | n/a | – |
| astro | `#asStatsOn` | checkbox | – | no: on / off only | n/a | n/a | – |
| lifegraph | `#lcYear` | text | 4 | yes | **no** (0/4 cases) | yes (4/4 cases) | window submit gate |
| lifegraph | `input[name="lcEra"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| lifegraph | `#lcTime` | time | – | no: time picker | n/a | n/a | – |
| lifegraph | `#lcNoTime` | checkbox | – | no: on / off only | n/a | n/a | – |
| lifegraph | `#lcSolar` | checkbox | – | no: on / off only | n/a | n/a | – |
| lifegraph | `#lcLon` | number | – | no: type=number: the browser keeps only a number (letters are dropped) | n/a | n/a | – |
| lifegraph | `input[name="lcGender"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| planner | `input[name="plEvent"]` ×3 | radio | – | no: choice only | n/a | n/a | – |
| planner | `.pl-bd` ×2 | date | – | no: date picker | n/a | n/a | – |
| planner | `#plTime` | time | – | no: time picker | n/a | n/a | – |
| report | `#rpAYear` | text | 4 | yes | **no** (0/4 cases) | yes (4/4 cases) | page handler, now every field (own) |
| report | `input[name="rpAEra"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| report | `#rpATime` | time | – | no: time picker | n/a | n/a | – |
| report | `#rpANoTime` | checkbox | – | no: on / off only | n/a | n/a | – |
| report | `input[name="rpAGender"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| report | `#rpBYear` | text | 4 | yes | **no** (0/4 cases) | yes (4/4 cases) | page handler, now every field (own) |
| report | `input[name="rpBEra"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| report | `#rpBTime` | time | – | no: time picker | n/a | n/a | – |
| report | `#rpBNoTime` | checkbox | – | no: on / off only | n/a | n/a | – |
| report | `input[name="rpBGender"]` ×2 | radio | – | no: choice only | n/a | n/a | – |
| report | `#rpName` | text | 60 | yes | **no** (0/10 cases) | yes (10/10 cases) | page handler, now every field (own) |
| tarot | `input[name="topic"]` (created by tarot.js) | radio | – | no: choice only | n/a | n/a | – |
| tarot | `input[name="spread"]` (created by tarot.js) | radio | – | no: choice only | n/a | n/a | – |
| iching | `input[name="icTopic"]` (created by iching.js) | radio | – | no: choice only | n/a | n/a | – |
| dream | `input[name="drMood"]` (created by dream.js) | radio | – | no: choice only | n/a | n/a | – |
| dream | `input[name="drTime"]` (created by dream.js) | radio | – | no: choice only | n/a | n/a | – |
| zodiac | `.zd-an input` (created by zodiac.js) | radio | – | no: choice only | n/a | n/a | – |
| planner | `.pl-pick input` (created by planner.js) | checkbox | – | no: on / off only | n/a | n/a | – |
| faceread | `[data-look-adult] input` (created by lensiq-look.js) | checkbox | – | no: on / off only | n/a | n/a | – |
| every reading page | `[data-fs] input` (created by fortune-straight.js (18+ / read it straight, every reading page)) | checkbox | – | no: on / off only | n/a | n/a | – |
| every reading page | `.fa-consent input` (created by fortune-ai.js (AI consent, every reading page)) | checkbox | – | no: on / off only | n/a | n/a | – |
| every reading page | `.lq-merit-form input[name="name"]` (created by lensiq-merit.js interest form (every reading page with the merit panel; off by default: LENSIQ_MERIT_INTEREST_FORM)) | text | 60 | yes | yes (merit-crisis.e2e.mjs) | yes (merit-crisis.e2e.mjs) | lensiq-merit.js checks the form first and draws the card in its panel; locked tests/e2e/merit-crisis.e2e.mjs; the window gate leaves .lq-merit forms to it |
| every reading page | `.lq-merit-form input[name="contact"]` (created by lensiq-merit.js interest form (every reading page with the merit panel; off by default: LENSIQ_MERIT_INTEREST_FORM)) | text | 254 | yes | yes (merit-crisis.e2e.mjs) | yes (merit-crisis.e2e.mjs) | lensiq-merit.js checks the form first and draws the card in its panel; locked tests/e2e/merit-crisis.e2e.mjs; the window gate leaves .lq-merit forms to it |
| every reading page | `.lq-merit-form input[name="date_from"]` (created by lensiq-merit.js interest form) | date | – | no: date picker | n/a | n/a | – |
| every reading page | `.lq-merit-form input[name="date_to"]` (created by lensiq-merit.js interest form) | date | – | no: date picker | n/a | n/a | – |
| every reading page | `.lq-merit-form input[name="consent"]` (created by lensiq-merit.js interest form) | checkbox | – | no: on / off only | n/a | n/a | – |
| every fortune page with a reading (round 2, 2026-11-17) | `.lq-rp textarea` ×2 (created by lensiq-report.js, loaded by nav.js: the "Report a problem with this reading" note, maxlength 600, and the editable preview) | textarea | 600 | yes | **no** (0/12 cases on 5061f53: the phrase was saved in `lq-report-log`, no card) | yes (12/12 cases on c59eb08: E4 tarot 6/6, iching 6/6) | lensiq-report.js runs the crisis net on the note and the edited preview before anything is saved, copied or mailed: nothing stored, the dialog closes, the card takes over; the report button is hidden in the crisis state. Locked tests/e2e/crisis-net-hotfix-e.e2e.mjs (E4), tests/unit/crisis-input-inventory-2.test.js (scripts nav.js injects are scanned too) |

| compat (added 2026-11-17 by the crisis-escape guard: compat went live in bb8f8bd and was not in this list) | `#cpNick0` / `#cpNick1` (created by compat-ui.js, one per person) | text | 80 | yes | n/a (page not live before) | yes: locked fortune-compat-crisis.e2e.mjs (reviewer 210 cases, 0 leaks, bb8f8bd) | compat's own check runs first in go() and on every keystroke (data-lq-crisis-own); card in #cpResult, takeover |
| compat | `#cpYear0` / `#cpYear1` (created by compat-ui.js) | text | – | yes | n/a | yes: fortune-compat-crisis.e2e.mjs | same |
| compat | `#cpRel` | select | – | no: choice only | n/a | n/a | – |
| compat | `#cpConsent` | checkbox | – | no: on / off only | n/a | n/a | – |
| compat | `[data-cp-person] select[name="d"]` / `[data-cp-person] select[name="m"]` (created by compat-ui.js) | select | – | no: choice only | n/a | n/a | – |
| compat | `[data-cp-person] input[name="t"]` (created by compat-ui.js) | time | – | no: time picker | n/a | n/a | – |

Totals: 122 input rows, 34 can hold a phrase; covered before 2/30 (compat's 4 were not live), after 34/34.

Since 2026-11-17 the pages are no longer a fixed list for this check: `tests/unit/crisis-escape-guard.test.js` finds every page
that loads fortune-read.js, fortune-ai.js or fortune-crisis.js and fails on any free-text field there (HTML, the page's scripts,
scripts those load, scripts nav.js injects, `contenteditable`) without a phrase row here. See
`docs/INCIDENT-2026-11-16-CRISIS-LEAK.md`, "Guard".
