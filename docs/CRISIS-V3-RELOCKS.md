# Crisis v3: ledger of re-locked assertions

Owner decision 2026-11-17 ("crisis v3") replaces the crisis card. When the crisis flag is set, the reading continues in full,
gently, and nothing tells the person they were flagged. Sales, share and print are hidden. One closing line with one tel:1323
button and the counselling link sits at the end of the reading. No statistics. No echo.
v3 rules referenced below:

- **a**: the reading continues; no card; nothing flagged.
- **b**: gentle wording; hard limits; never straight.
- **c**: no prices, purchase, paid teasers, plans, seller links, share or print.
- **d**: the closing line only at the end (one warm line, one tel:1323 button of at least 44 px, the counselling link).
- **e**: no statistics.

Every assertion below was changed only where a v3 rule replaces it. Every protection that still applies stays asserted, and the
"kept by" column names the test that asserts it. Locks: `evals-locks/crisis-v3.sha256` (tags `relock-unit`, `relock-e2e`), plus
an appended line in every other lock file that tracks the file. Copies: `~/LENSIQ-field/evals/crisis-v3/<tag>/`.

New fixed set, locked before any v3 product code (622bf81): `tests/unit/crisis-v3.test.js` (U1–U5) and
`tests/e2e/crisis-v3-{kit,a,b,c,d}`. Re-lock 1 (65810339) fixed three faults in that new set. The echo piece was set to
5 characters (Thai / English) or 3 (Chinese), plus the whole typed text, because 2- or 3-character pieces match ordinary words of
a reading that is now shown. U1 compares the section count with the plain reading. U4 counts the closing box itself.

Later fixes to the new set's own test faults (no v3 rule changed):

| Re-lock | When | Change | Why |
|---|---|---|---|
| 2 (kit) | after the base run, before the build was measured | Chinese price = a number with 元 / ¥; print = printing the reading | "元" matched 元素 (element); "print" matched the operator link "print the camera notice" |
| 3 (U1) | in the full unit suite | plain and crisis readings composed with the same seed | without a seed the composer picks one at random, so the counts differed by chance |
| 4 (kit) | after the first build run (build-1-e2e.log) | English harsh list case-sensitive without the zodiac sign "Cancer"; "shop" dropped (a seller link is still caught); Thai echo piece 7 characters; report opened without the test backend | each was a false finding: the sign name, an operator note, the ordinary word "จริงๆ", and report being a paid product when a backend is configured |

## Unit tests (tag `relock-unit`)

| File | Test | Old assertion | New assertion | v3 rule | Protection kept by |
|---|---|---|---|---|---|
| tests/unit/fortune-claims-crisis.test.js | crisis: self-harm / abuse text … | `toHTML(card)` has tel:1323 and the review marker | `toHTML(support result)` is empty; the closing line (helpHTML) has tel:1323 and makes no claims (no lottery / guarantee wording) | a, d | `check()` yes / no lists unchanged (same test); card lines = ["1323"] unchanged (same test) |
| same | same | `interpret(crisis nickname, useAI:true).source === "support"` | `source === "local"` (never the AI) and the nickname is not in the result | a, b | no echo: crisis-v3 U1, e2e crisis-v3-a/b/c |
| same | same | `interpret(crisis question).source === "support"` | `source === "local"`, question not echoed | a | same |
| tests/unit/fortune-crisis-net.test.js | crisis net: interpret() checks the raw text of every free-text field | `r.source === "support"` for a crisis phrase in any page field | not the card; the page is in the crisis state (`FortuneAI.crisis.active(doc)`); the phrase is not echoed; a plain page is not in the crisis state | a | every field is still checked (crisis state set from a field that is not the nickname) |
| tests/unit/fortune-crisis-net-2.test.js | amendment 2 wiring (horoscope) | `showCrisis()` clears every tab and the subtitle | `crisisSet()` sets the crisis state; the subtitle (`resultSub`) shows a name only when it is a plain name | a | partner-name, name-number and main-form checks unchanged (same test); no echo: e2e crisis-v3-a (horoscope #hsName) |
| tests/unit/fortune-helpline.test.js | crisis state: after the support card … | renderSections in the crisis state draws the card, no section, no plan, no remedy text; toHTML draws the card | draws the reading (sections), no card, no plan, no remedy-plan text ("วิธีปรับ", "เสื้อสีขาว", "A simple adjustment", "调整的方法"), 1323 in the closing line after the last section; toHTML draws the reading, no card | a, c, d | `allow()` refuses remedy / lucky / paid / merit / straight; no hook runs in the crisis state (calls === 0) unchanged. The fixture's overview sentence "ข้อแนะนำทั่วไปคือพักผ่อนให้พอ" is reading text, not a plan, so it is no longer matched. Plans and remedies stay hidden: `fa-plan` absent (same test); `[data-lq-remedy]` / `.fa-plan` invisible in the whole page: e2e crisis-v3 judge (SALES_SEL) |
| tests/unit/fortune-honest.test.js | B3 (3) crisis net first: with straight on … | compose / interpret with a crisis question return the support card | they return a reading that is not straight and has no plan; the question is not echoed (8-character pieces, or the whole question when shorter); no paid merit offer | a, b | straight never in the session: same test; e2e crisis-v3 judge (`.fa-straight`, `[data-fa-mode=straight]`) |
| tests/unit/fortune-straight-crisis.test.js | straight ON + crisis words in a field | `interpret().source === "support"` | not the card, not straight, the phrase not echoed | a, b | the plain-page control (straight ON reads straight) unchanged |
| tests/unit/fortune-layout.test.js | A5: the help line and the crisis card are never collapsible | the card has exactly one fold (อ่านเพิ่มเติม); warm / guidance / tel / link outside it | no card (toHTML of a support result is empty); the closing line has tel:1323 then the counselling link, unfolded | a, d | skip list (`.lq-helpline`, `.fa-support`) and "help line has nothing folded" unchanged (same test) |
| tests/unit/fortune-live.test.js | item 3 … | the crisis card has tel:1323, no 1669 / 191 / 1300 / Samaritans, links counselling.html | no card; the closing line has tel:1323, none of the other numbers, links counselling.html | a, d | normal reading carries no help line (same test, unchanged) |
| tests/unit/crisis-rules-1323.test.js | R1 | card order warm → more → guidance → 1323 → link; no list; no price; warm ≤ 3 sentences and ≤ 140 / 60 characters; link text | no card; the closing line: tel:1323 only, warm → 1323 → link, no list, no price or remedy, no Thai in EN / ZH, warm ≤ 3 sentences and ≤ 140 / 60 characters, link text non-empty | a, d | everything kept in the new R1 except the card itself and its "อ่านเพิ่มเติม" fold / guidance part (rule a: no card) |
| tests/unit/crisis-rules-1323-g.test.js | G3 | the card's fallback button (shared component missing) has an inline 44 px minimum | the closing line's button is built without the shared component (`.lq-call-mini > a.lq-call-btn`, tel:1323) and styles.css gives it 44 × 44 px | a, d | 44 px button: same test; e2e crisis-v3 judge (tels[0] ≥ 44 × 44) |

Fixed by product code (no re-lock): `tests/unit/fortune-crisis-net-3.test.js` "renderSections asks the soft step first".
A comment was shortened, so the soft step is again within the regex window. The soft step is skipped once the page is in the
crisis state (rule a).

## Protections that stay asserted in the session (whole page)

| Protection | Asserted by |
|---|---|
| no other number (1669 / 191 / 1300 / Samaritans) anywhere on the page | e2e crisis-v3 judge `otherNums` (whole body text and every visible tel: link), every page × language × width |
| no echo (whole page) | e2e crisis-v3-a/b/c `echo()` (all visible text vs the text before typing); unit crisis-v3 U1; fortune-honest B3; fortune-straight-crisis |
| no remedies, plan, prices, paid, merit, seller links, share or print (whole page) | e2e crisis-v3 judge (SALES_SEL + SALES_TEXT on every visible button / link); unit crisis-v3 U5 (CSS hides share / print in crisis and calm) |
| straight mode never in the session | e2e crisis-v3 judge; unit fortune-honest B3, fortune-straight-crisis, crisis-v3 U1 |
| warm line short, no Thai in EN / ZH, link text, 44 px button, one number | unit crisis-rules-1323 R1, G3; crisis-v3 U3; e2e crisis-v3 judge |
| no statistics | e2e crisis-v3-a/b/c/d (recorded /v1/events = 0, with a control that does send); unit crisis-no-analytics D1–D5 (unchanged) |
| crisis check before validation on every inventoried input | e2e crisis-net-hotfix-{a,b,c,d} (to be re-locked to v3 semantics in tag `relock-e2e`, listed below when done); unit crisis-input-inventory (unchanged) |

## End-to-end tests (tag `relock-e2e`)

Locked before these files are run on the product.

| File | Test | Old assertion | New assertion | v3 rule | Protection kept by |
|---|---|---|---|---|---|
| tests/e2e/crisis-net-hotfix-kit.mjs (used by a–d) | every inventoried input: "crisis phrase -> …" | the card is visible, its heading on the first screen, no reading widget visible, no echo (2-character pieces) | the crisis state (`html[data-lq-crisis]`) is set by the visitor's own action, even when the page then refuses the input; no card or soft step; no sales / remedy / share / print visible; no help number other than 1323; no echo (7 Thai / 5 English / 3 Chinese characters plus the whole text, because the reading is now shown) | a, c, d | crisis check before validation on every inventoried input: same test (state set on every row); inventory coverage: unit crisis-input-inventory (unchanged) |
| tests/e2e/crisis-net-hotfix-b.e2e.mjs | faceread / palm: nickname typed AFTER a reading | → only the help card | → crisis state, no card, no echo (same kit function) | a | same |
| tests/e2e/fortune-crisis.e2e.mjs | tarot / iching: a self-harm question … | card shown, no shuffle / cast, focus on the card | crisis state set, the shuffle / cast goes on, no card; an ordinary question still shuffles / casts with no card | a | no echo: crisis-v3-a/b/c; ordinary-question control unchanged |
| tests/e2e/fortune-crisis-fields.e2e.mjs | horoscope / numbers / report name fields | `supportIn`: the card in the result, no section; report: no parts under the card | `supportIn`: crisis state, reading drawn, no card, closing line after the last section with tel:1323 and the counselling link, no 1669; report: parts drawn | a, d | ordinary-name control (no card) unchanged |
| tests/e2e/fortune-crisis-session.e2e.mjs | (b), (b) storage blocked, (d), 'talk' path | `support` = a visible card | `support` = the crisis net fired (`data-lq-crisis`) and no card; the talk path sets the state | a | one sessionStorage boolean, no text stored, later pages calm (no straight, no remedies, no paid), new tab unaffected, joke control, storage-blocked behaviour: unchanged |
| tests/e2e/fortune-crisis-soft.e2e.mjs | horoscope 'talk' | `card(sel)`: the card in the result | crisis state, no card, the closing line with tel:1323 | a, d | the soft step before any tab, no echo after "Just the reading": unchanged |
| tests/e2e/fortune-helpline.e2e.mjs | dream hard net; horoscope 'talk' | the card shown again, no reading | a gentle reading (sections), no plan, no card; the remedy / lucky word count does not rise | a, b, c | `allow()` says no (remedy / paid / straight), remedy words not added: same tests; remedy blocks hidden: "crisis state hides data-lq-remedy blocks" (unchanged) |
| tests/e2e/fortune-live.e2e.mjs | H3 (dream) | the card with tel:1323 ≥ 44 px replaces the reading | crisis state, no card, the reading goes on (a dream with a symbol), the closing line has tel:1323 ≥ 44 px and no other tel: link | a, d | one number, 44 px: same test |
| same | H3 (every reading page) | `FortuneAI.crisis.render` draws the card (tel:1323 only) and sets the state | `render` sets the state and draws no card and no number | a | — |
| tests/e2e/fortune-new.e2e.mjs | dream self-harm words | the card with tel:1323 only, no reading | crisis state, no card | a | nothing about the text stored: same test (unchanged) |
| tests/e2e/helpline-call.e2e.mjs | crisis state (dream) | the card shown, not collapsed, its only button 1323 | no card; the closing line shown, not collapsed, its only button tel:1323, all buttons tappable / 44 px / not covered; the top control still visible | a, d | button checks (`checkButtons`) unchanged |
| tests/e2e/merit-crisis.e2e.mjs | after a crisis (tarot); state switched on under a drawn form | waits for a new card / a card in the merit panel | waits for the reading with its closing line; the form submit sends nothing (no card drawn) | a | no merit panel, card or paid offer after a crisis; nothing sent: same tests (unchanged) |
| tests/e2e/fortune-layout.e2e.mjs | A5 exception | the card shown in full, one fold | no card is shown; the NOTICES helper still checks the help line is never folded | a | same test (NOTICES) |
| tests/e2e/crisis-rules-1323-b.e2e.mjs | C1–C9 | the card: results hidden, order, lines, one number, link, no list, no price, nothing pinned, 44 px, read-more, link opens the page | C9 kept: the counselling link under the closing line opens counselling.html with its five call buttons; on that crisis reading, one number and nothing pinned (C3 / C6) | a, d | C1 (results / sales hidden), C2 (order), C3 (one number), C5 (no list, no price), C6 (pinned), C7 (44 px): crisis-v3 judge and unit crisis-rules-1323 R1; C8 (read-more of the card): replaced by rule a |
| tests/e2e/fortune-crisis-fields-2.e2e.mjs (tag `relock-e2e-b`, missed in the first pass) | horoscope name / partner / name-number; tarot / report / numbers spaced phrases | the card shows; other tabs empty; no compatibility / name sum / report parts / shuffle | the crisis state is set, no card; the subtitle and the WHOLE page do not echo the phrase | a | detection of every spaced / letter-spaced / leet variant: same tests; the benign-name control (no false trigger) unchanged |
| tests/e2e/fortune-helpline.e2e.mjs `WANT` (tag `relock-e2e-b`) | printed report keeps the help line | the full 1323 component wording | the closing line: warm line naming 1323, the button, the counselling link | d | 1323 only in the printed line: same test |
| tests/e2e/crisis-v3-kit.mjs + crisis-net-hotfix-kit.mjs echo (tag `relock-e2e-b`, test fault) | every echo check | English pieces of 5 letters (spaces removed) | English pieces of 3 consecutive words; Thai 7 / Chinese 3 characters unchanged; the whole typed text always | — | false findings "night" in "Knight", "antto" in "want to do" (build-3-e2e.log) |
| tests/e2e/crisis-rules-1323-f.e2e.mjs | F1, F2 | the card with the shipped switch; card button ≥ 44 px with the component blocked | F1 → crisis-v3-a/b/c/d (shipped switch); F2 kept for the closing line (component blocked: tel:1323 only, ≥ 44 × 44 px) | a, d | crisis-v3 judge |

## Merge of main 02fdd69 (crisis hotfix round 2, fortune-layout item 5 re-lock 7), tag `relock-merge`

Locked before the merged files were run on the product (branch `crisis-v3-2`).

| File | Test | Old assertion (main) | New assertion | v3 rule | Protection kept by |
|---|---|---|---|---|---|
| tests/e2e/crisis-net-hotfix-e.e2e.mjs | E2 tarot / iching | after the card an ordinary question still shows the card, no shuffle / coin step | after a crisis question (after a reading) an ordinary question keeps the crisis state and shows no card (v3 kit `assertCard`: no card, no sales / share / print, one number, no echo); the shuffle / coin step may go on | a | the flag holds for the tab: same test (state checked again after the ordinary question) |
| same | E3 daily card, siamsee, iching daily | waits for the card | waits for the crisis state; "no daily reading, siamsee number or share in the crisis state" unchanged | a, c | same test |
| same | E4 report dialog note | the card takes over | crisis state, no card, nothing saved, dialog closed (v3 kit) | a | nothing saved, dialog closed: same test |
| same | E5 fortune-crisis.js blocked | the card with a 44 px tel:1323 | crisis state, no card, no echo; a visible 44 px tel:1323 in the closing line (not the top bar), also without fortune-crisis.js | a, d | 44 px, 1323 reachable without fortune-crisis.js: same test |
| tests/e2e/fortune-crisis.e2e.mjs | tarot / iching | (main, stricter) after the card an ordinary question keeps the card | merged with the v3 re-lock: a crisis question sets the state, no card, the shuffle / cast goes on; after it an ordinary question keeps the state, no card; a fresh tab is calm (no state, no card) and shuffles / casts | a | the flag holds for the tab (stricter re-lock of round 2): same test |
| tests/e2e/fortune-layout.e2e.mjs | A5 + item 5 | — | the v3 A5 re-lock and main's item-5 re-lock (7) merged without edits | — | both unchanged |

Decision taken on the owner's behalf (reversible): the tarot daily card, siamsee and the iching Daily tab stay undrawn in the
crisis state (hotfix round 2 behaviour kept, E3 unchanged), because their fixed texts are not composed gently. Alternative: draw
them with the gentle wording and no share.

## Decision 84: both options, new fixed set (tag `pre-lock`, append-only)

Locked before the option ข product code. No existing assertion changed.

| File | Test | Asserts |
|---|---|---|
| tests/unit/crisis-v3-pre.test.js | P1 | `lensiq-config.js` ships ก: `LENSIQ_CRISIS_PRELINE` false unless already true |
| same | P2 / P3 | `LQFortuneCrisis.plan()` true for the narrow listed explicit-plan phrases (TH / EN / ZH; each also caught by the crisis net), false for crisis phrases without a plan and for ordinary text sharing words with the list |
| same | P4 | `preHTML(lang)`: one short warm line, one link only (tel:1323), no other number, nothing flagged, no statistics, no Thai in EN / ZH |
| tests/e2e/crisis-v3-pre{,-en,-zh}.e2e.mjs | per page with a field × TH / EN / ZH, 393 px | P1 ข + plan phrase: exactly one pre-line before the first section, not pinned, tel:1323 ≥ 44 × 44 px, short warm line, nothing flagged; then (pre-line removed) the locked crisis-v3 judge, no echo, no analytics. P2 shipped ก + plan phrase: no pre-line, judge passes. P3 ข + non-plan crisis phrase: no pre-line, judge passes. P4 ข + ordinary reading: no pre-line, no closing line, no crisis state |

Later fixes to the decision-84 set's own test faults:

| Re-lock | When | Change | Why |
|---|---|---|---|
| pre-1 | first run of the pre-lock set (v3-2-pre-th-1.log) | the switch expression ends with `true` | it returned the window object, which CDP cannot serialise; no assertion changed |

## Compat (live on main bb8f8bd, merged into crisis-v3-2), tag `relock-compat`

Locked before compat was changed to v3.

| File | Test | Old assertion | New assertion | v3 rule | Protection kept by |
|---|---|---|---|---|---|
| tests/e2e/fortune-compat.e2e.mjs | X1 (TH / EN / ZH), X2 | the support card (1323 + 1669) replaces the result; it stays for the next request | the crisis state is set; the reading goes on (overview, free tier); no card, no 1669; one closing line with tel:1323 only at the end of `#cpResult`; the state holds for the next request | a, c, d | nothing paid, no price: same tests (unchanged) |
| tests/e2e/fortune-compat-crisis.e2e.mjs | N / Y (every MUST60 phrase + kit phrases) | the card shows, no reading; no echo of 4- (2- Chinese) character pieces | crisis state set, no card or soft step, no 1669; N: the reading and the closing line at the end; Y (no consent): no reading; no echo with the v3 piece sizes (7 Thai / 3 Chinese characters, 3 English words, whole phrase); the fixed closing line is left out of the compared text like the top bar | a, d | crisis check before consent / validation: same test (state set in Y); R unchanged |

## Test-fault re-locks found on the merged branch (tag `relock-fix-1`)

| Re-lock | File | Change | Why |
|---|---|---|---|
| soft-1 | tests/e2e/fortune-crisis-soft.e2e.mjs | the closing-line selector uses single quotes; after "talk" the test waits for the reading (≥ 3 sections) and the closing line, no card | the `\"` inside a template literal produced a broken expression (SyntaxError, the wait could never pass); the leftover "no reading under the card" line contradicted the v3 re-lock itself (rule a) |
| merge-2 (tag `relock-fix-2`) | tests/e2e/crisis-net-hotfix-e.e2e.mjs E5 | a shown reading must end with the closing-line tel:1323 ≥ 44 px; in every case a visible tel:1323 ≥ 44 px (closing line or top bar) is on the page | the relock-merge version required a closing line right after the question, but tarot / iching only shuffle / cast then and numbers refuses a non-Thai name, so no reading (and no closing line) exists yet; crisis state, no card and no echo unchanged |
| merge-1 | tests/e2e/fortune-crisis.e2e.mjs | "the state holds" accepts `data-lq-crisis` or `data-lq-calm` | the loop reloads the page; a reloaded page of the same tab carries the session flag as the calm state (same protections). The fresh-tab check (neither) is unchanged |

## Decision 84 answered: option ก (owner, 2026-11-17)

| Removed | Reason | Protection kept by |
|---|---|---|
| tests/unit/crisis-v3-pre.test.js, tests/e2e/crisis-v3-pre{,-en,-zh}.e2e.mjs (tags `pre-lock`, `pre-lock-1`) and the product code they tested (fortune-crisis-pre.js, `LENSIQ_CRISIS_PRELINE`) | the owner chose ก: the 1323 line and button only at the end of the reading. Option ข's code was not free in page weight (about 4.5 KB on every reading page), so the owner's instruction was to remove it with its tests | rule d (closing line only at the end, nothing in the middle, one number, 44 px): crisis-v3-a/b/c/d judge, unit crisis-v3 U3 / U4, crisis-rules-1323 R1 / G3 (all unchanged). Locked copies of the removed set stay in `~/LENSIQ-field/evals/crisis-v3/pre-lock*/` |

## Merge of main 9f977dd (fortune no-demo), tag `relock-nodemo`

| File | Test | Old assertion | New assertion | Why | Protection kept by |
|---|---|---|---|---|---|
| tests/unit/fortune-no-demo.test.js | 5. other categories unchanged | page statuses equal the baseline taken on main 02fdd69 | the same baseline plus `counselling: support` | counselling.html (owner decision 2026-11-16) exists on the crisis branches, not yet on main; it is a support page outside every category | every other status and the demo chips: same test, unchanged |

## Card waits missed in the earlier passes (tag `relock-v3-missed`, found by CI run 44032543128)

| File | Test | Old assertion | New assertion | v3 rule | Protection kept by |
|---|---|---|---|---|---|
| tests/e2e/fortune-paid.e2e.mjs | (b) calm session + typed crisis text (dream) | waits for the support card after typing | the dream is read; waits for the crisis state and a reading | a | no paid block, no price: same test (unchanged) |
| tests/e2e/merit.e2e.mjs | readZodiac after a crisis | waits for a new support card with 1323 | waits for a new reading that ends with the closing line (tel:1323), no card | a, d | no Merit panel / paid offer after a crisis: same tests (unchanged) |
| same | interest form with a crisis phrase | waits for the card | waits for the crisis state, no card | a | nothing sent, no form, shared state set: same test (unchanged) |
| tests/e2e/fortune-calm-pages.e2e.mjs | real path (tarot, then hub / planner / lucky colour) | waits for the card on tarot | waits for the crisis state on tarot | a | later pages calm, help line in view: same test (unchanged) |
| tests/e2e/merit.e2e.mjs (tag `relock-v3-missed-2`) | 4b. support card on tarot, then zodiac | waits for the tarot card (#trSupport) | waits for the shared crisis state, no card | a | no Merit panel (free or paid) on the next reading: same test (unchanged) |
| tests/e2e/fortune-straight.e2e.mjs (tag `relock-v3-missed-2`) | flag on + straight chosen: the crisis net still wins | the tarot card shows, no shuffle | the crisis state is set, no card, and no straight control or straight reading is shown in that session (the shuffle goes on) | a, b | the crisis net before straight: same test |

## Review round 2 (independent review of 8cee117), tag `r2-lock` — locked before the round-2 fixes

| File | Test | Old assertion | New assertion | v3 rule | Protection kept by |
|---|---|---|---|---|---|
| tests/e2e/crisis-escape-guard-kit.mjs (+ -report, -field titles) | every reading page × (report note, own box): collected result elements | MODE v2: every result element hidden; only the help card visible (waits for the card) | MODE v3: every result element is hidden or v3-compliant (not inside a card / soft step, sales, remedy, plan, paid, merit, share, print, counter or straight block, and its own text never holds the typed phrase); waits for the crisis state with no card; with a reading on screen ONE closing line (tel:1323) follows its last section and nothing collected or new is shown after it in its area | a, c, d, no echo | steps 1-5 (tracking and collection, so a NEW result element can still not escape unnoticed) unchanged; the static half (unit crisis-escape-guard) unchanged |
| tests/e2e/crisis-v3-r2.e2e.mjs (new) | R1-R6 | — | fallback no echo; report-note closing line; report no plan / history, closing last; fengshui calm closing last; counters hidden when calm; no question placeholder; dream self-care section | a, c, d, e, no echo | — |
| tests/unit/crisis-net-fallback.test.js (new; first locked as crisis-v3-r2.test.js, renamed with the same bytes) | N1, N2 | — | missed phrases caught (TH / EN / ZH); the stand-in answers exactly as fortune-crisis.js for MUST60 + N1 + ordinary text | protection | — |
| tests/unit/cat-pages.test.js | lock hygiene | the merged content (main's no-demo version + the counselling support row of crisis-rules-1323) matched no lock line | locked as is; no assertion changed | — | — |
| evals-locks/fortune-honest.sha256 | lock hygiene | the soft-1 line (relock-fix-1) was missing there | appended | — | — |

## Merge of main 1eaf14f (fortune-top-compact), tag `relock-topsticky`

| File | Change | Why |
|---|---|---|
| tests/unit/crisis-rules-1323.test.js, tests/e2e/crisis-rules-1323-a / -e.e2e.mjs, tests/e2e/crisis-rules-kit.mjs | the switch name `LENSIQ_HELP_STICKY` → `LENSIQ_HELP_TOP_STICKY`; every assertion unchanged | one sticky switch only (main's mechanism, coordinator instruction 2026-11-17); the branch's own copy of the same switch dropped from lensiq-config.js / nav.js / types |

## Merge of fortune-pet (pet face reading, `petread.html`), tag `relock-pet` (2026-11-17) — locked before the pet page's v3 code

| File | Test | Old assertion | New assertion | v3 rule | Protection kept by |
|---|---|---|---|---|---|
| tests/e2e/fortune-pet.e2e.mjs | P4 crisis in the pet's name (TH / EN / ZH) | support card replaces the reading (0 sections, tel:1669 in the card), no price, share card hidden | crisis state set; no card or soft step shown; the reading continues (≥ 2 sections); no `lucky` part; the typed phrase not shown in `<main>`; exactly one closing `.lq-helpline-result` with tel:1323 after the last section; no other `tel:` in `<main>`; no price; share card hidden | a, b, c, d | same test (price, share card), crisis-v3-a/b/c/d (petread), crisis-escape-guard-field (petread) |
| tests/e2e/petread-webkit.e2e.mjs | W4 crisis in the pet's name (TH, WebKit 390 px) | support card, 0 sections, no share card | crisis state; ≥ 2 sections; no card / soft step; no echo; no share card; one closing tel:1323 line after the last section | a, c, d | same test |
| tests/e2e/crisis-escape-guard-kit.mjs | FLOWS | no petread flow (page not on main) | `petread` flow appended (synthetic photo, scripted detector, name + dates, phrase into `#petName`); nothing else changed | — (registration) | check 4 of the static half |
| tests/unit/crisis-escape-guard-allow.json | targets | — | 8 petread ids appended (photo area, camera / detector status, trait picker, form message), each with its reason; nothing removed | — (registration) | check 3 (stale entries fail) |
| tests/e2e/crisis-net-hotfix-inventory.json, docs/CRISIS-INPUT-INVENTORY.md | inputs | — | 7 petread rows appended (`#petName` can hold a phrase) | — (registration) | check 2 |
| tests/unit/fortune-no-demo.test.js | 5. other categories unchanged | exact status map of every non-category-6 page (petread absent) | the same exact map with `petread: "demo"` appended (the page exists, unlinked, until its go-live into category 6); no status changed | — (registration, as counselling) | same test |

## Pet reading go-live (owner decision 100, 2026-11-18), tag `relock-pet-golive` — locked before the go-live change

| File | Test | Old assertion | New assertion | v3 rule | Protection kept by |
|---|---|---|---|---|---|
| tests/unit/fortune-no-demo.test.js | 5. other categories unchanged | exact status map of every non-category-6 page, with `petread: "demo"` (relock-pet: the page existed, unlinked) | the same exact map without the petread row: petread is now in category 6 (`FORT.pages`), so tests 1 and 4 cover it (no status chip, no demo key, count = category 6 size) | — (registration, as compat at owner decision 73) | tests 1-4 now include petread through FORT.pages; every other status and demo chip unchanged |

## Protection round "crisis-v3-protect" (2026-11-18, branch crisis-v3-protect)

Two residual risks of the crisis-v3 review. No crisis-v3 rule and no hard limit changes for users; nothing above was re-locked.
Locks: `evals-locks/crisis-v3-protect.sha256`, copies in `~/LENSIQ-field/evals/crisis-v3-protect/`, locked before building.

**1. Unmarked price / sales text in the crisis state.** The escape guard only caught elements with a sales marker. New fixed set:
`tests/unit/crisis-price-scan-lib.cjs` (one scanner for both halves), `tests/unit/crisis-price-scan.test.js` (P1–P5),
`tests/e2e/crisis-price-scan-{kit,th,en,zh,controls}`. Words: ราคา, ฿, THB, บาท, ซื้อ / สั่งซื้อ, ชำระ, price, buy, purchase, 购买,
价格, a number + 元, ¥, and any price amount. Known false matches handled in the pattern: บทบาท, พระบาท, ชำระล้าง, 元素 / 四元素 / 元旦,
"$1". Static half: every text a reading page can show (HTML outside crisis-hidden markers, string literals of every script the page
gets, its zh / en dictionaries) has no sales word unless allow-listed; browser half: every visible text node in the crisis state, all
16 reading flows × TH / EN / ZH. Exceptions: `tests/unit/crisis-escape-guard-allow.json` `priceText` (`where` + `text` + `reason`;
`browser: true` only for text that may really show: reading sentences about the visitor's own spending, "nothing needs to be bought",
"no payment is taken"). The file's `targets` / `browser` / `noEntry` are unchanged (append note in crisis-escape-guard.sha256).
Controls: unit P3 (3 injected strings → exactly 3 failures; inside `[data-lq-upsell]` → none; clean → pass); e2e controls C1–C3 on
dream TH / EN / ZH (clean 0; 3 visible injected flagged, hidden and upsell copies not; clean again after removal).
Build found by the static scan: report.js paid-mode "no credit" gate ("ดูราคารายงาน" link to pricing) had no marker; it now carries
`data-lq-upsell` (hidden in the crisis / calm state). Paid mode is off, so nothing visible changes today.
Menus (re-lock 2, coordinator order 2026-11-18: CLAUDE.md rule b makes this a required fix, not an owner choice): the site menu's
"แพ็กเกจและราคา" entry and the "สมาชิกและการชำระเงิน" description of "บัญชีของฉัน" (nav.js), and the account menu's
"แพ็กเกจและราคา" (lensiq-member.js), carry `data-lq-crisis-sales`; nav.js hides it while `html[data-lq-crisis]` or
`html[data-lq-calm]` is set (CSS, so they come back when the flag clears). The account link itself stays reachable. They left the
`priceText` allow-list; the static scan accepts them only with the marker on the same source line (`priceMarked`, P2) and P6
asserts the marker and the CSS; `tests/e2e/crisis-price-scan-menu.e2e.mjs` opens the menu in the crisis state (0 pricing entries,
TH / EN / ZH) and after clearing (entries back). Re-lock 2 only adds assertions. Re-lock 3 (test fault, CI run 44189943345): the
positive control counted sales words in the site menu only, where EN / ZH have one (the pricing title), not two; it now expects at
least one. In that run the crisis state showed 0 pricing entries in all three languages and every entry came back after clearing. nav.js v29, lensiq-config.js v21 (member v5).

Re-lock 1 (kit, `crisis-price-scan-kit.r1.mjs`, after CI run 44141046161, test fault): report [en] / [zh] never drew a reading
because the reused flow types the Buddhist year 2533 while the era radio defaults to CE outside Thai; the kit now picks BE first.
Every other page × language passed in that run (0 visible sales texts), controls 3 / 3 languages passed.

**2. "end it all" false positives (review only, no change).** Set: `end-it-all-set.json` (24 benign, 24 crisis, synthetic), harness
`end-it-all-measure.mjs`, log `end-it-all-measure-<sha>.log`. Numbers are in the round report; any pattern change needs the owner.

## Combined re-lock A1 (2026-11-18, branch fortune-credits; owner decision 110 ก, conditions 3 and 4)

Order kept: A1 first merged the post-v3 protection work (origin/staging-1118b 689206d3 = main + crisis-v3-protect d1fbc90d +
promo-basics + fix-r12 + fortune-advice; merge 89c84925), then re-locked the combined exception list in one commit that also writes
the lock lines (condition 4).

| File | Parent: crisis-v3-protect | Parent: fortune-credits | Combined (sha256 cfab9eef…) |
|---|---|---|---|
| tests/unit/crisis-escape-guard-allow.json | 3a88c00f…: targets incl. palm plEthics, tarot trCredit, fengshui fsSourcesNote; browser; noEntry; priceText (94); priceTextNote; priceMarked (3); priceMarkedNote | 049f2ed3…: targets without those 3; browser; noEntry; no price scan | crisis-v3-protect's bytes minus exactly the 3 lines `"palm plEthics"`, `"tarot trCredit"`, `"fengshui fsSourcesNote"` |

**The combined list = crisis-v3-protect's list minus 3 dead entries.** Nothing is added and no other key or value changes. The three
elements were deleted with the "about this reading" block (fortune-credits, owner order 2026-11-17 night item 2); `git grep` on the
merged tree finds the ids only in tests that assert they are absent (`tests/unit/fortune-credits-v2.test.js` GONE_IDS,
`tests/e2e/fortune-sources.e2e.mjs`) and in lock comments; no page, script or dictionary defines them.

Why it is equal to or stricter than both parents:

- **vs crisis-v3-protect:** every exception left is identical; three exceptions are removed. An allow-list only exempts elements
  and texts from the escape guard and the price scan, so removing entries can never let more through. The removed entries named
  elements that no longer exist, so they exempted nothing; the guard also fails on stale entries, so keeping them was not possible.
  Equal in effect, stricter in text.
- **vs fortune-credits:** `note`, `targets`, `browser` and `noEntry` are identical (checked key by key). The combined file adds
  crisis-v3-protect's price scan (`priceText` / `priceMarked`). Those entries are exceptions to a check that the fortune-credits
  parent did not have at all; with the scan, any price or sales text outside those exact source strings fails, where the parent
  checked nothing. Stricter.

Lock lines (same commit): field copy `~/LENSIQ-field/evals/crisis-escape-guard/crisis-escape-guard-allow.v4-combined.json` (new file;
`.v3.json` there belongs to the print-report branch's own chain and is not a parent of this list), locked with `tools/eval-guard.mjs
lock` at 2026-11-18T02:22:42Z in `evals-locks/crisis-escape-guard.sha256` and the field `locked.sha256`; repository ledger line
`cfab9eef…  tests/unit/crisis-escape-guard-allow.json  # repo file (combined A1)` in `evals-locks/crisis-escape-guard.sha256`, with a
pointer and the same line in `evals-locks/crisis-v3-protect.sha256`. Test at lock time: `tests/unit/crisis-escape-guard.test.js` 5/5.

Lock-record fix in the same commit (append-only, no test byte changed): the a770d724 lines for `tests/unit/cat-pages.test.js`
(cb8c22f3…) and `tests/unit/fortune-no-demo.test.js` (2d56321d…) were stale (credits.html never shipped; fab01e95 put both files
back). After the merge both files hold promo-basics RE-LOCK 1 bytes (fc67978e… / 047f5a00…, 404.html support page), equal to
`~/LENSIQ-field/evals/promo-basics/relock1/` and locked in `evals-locks/promo-basics.sha256` at 2026-11-17T17:50:04Z. That evidence
and the current repo-file lines are appended to crisis-rules-1323, crisis-v3, fortune-no-demo and fortune-credits `.sha256`.

Open: the reviewer confirms in writing that the combined list is equal to or stricter than both parents (condition 3).

## Merge of main 0bd5b24b (A1) into fortune-pet, tag `merge-pet-a1` (2026-11-18) — lock hygiene only (owner decision 110, condition 4)

Merge union of locked parents; no assertion changed. Both files were merged by git without a conflict and matched no lock line.

| File | Parent on main (locked) | Parent on fortune-pet (locked) | Merged content |
|---|---|---|---|
| tests/unit/crisis-escape-guard-allow.json | cfab9eef, combined A1 (`evals-locks/crisis-escape-guard.sha256`): crisis-v3-protect's list 3a88c00f (priceText / priceTextNote) minus the 3 dead entries palm plEthics, tarot trCredit, fengshui fsSourcesNote | e994f310, relock-pet: 8 petread ids (petTraits, petMsg, petEmpty, petVideo, petView, petCamMsg, petDetMsg, petHuman) with their reasons | cfab9eef + the 8 petread ids (48bd6504) |
| tests/unit/fortune-no-demo.test.js | 047f5a00, promo-basics RE-LOCK 1: `"404": "support"` in test 5's BASE_ST | 340830f3, relock-pet-golive (owner decision 100): no `"petread": "demo"` row (petread in category 6) | main's file + the two relock-pet-golive comment lines (d970d7c6); BASE_ST = counselling + 404, no petread |

## fortune-credits audit list for petread (owner decision 100), tag `relock-pet` in `evals-locks/fortune-credits__v4.sha256` (2026-11-18)

| File | Test | Old | New | Reason | Protection kept by |
|---|---|---|---|---|---|
| tests/unit/fortune-credits-v2-assets.json | fortune-credits-v2 D4 licence audit | 16 audited assets; petread (category 6 since owner decision 100) loads `vendor/qrcode-generator/qrcode.js`, not audited, so D4 failed | the same 16 plus `qrcode-generator` (MIT, no on-page attribution, notice `vendor/qrcode-generator/LICENSE`, needle "qrcode-generator 2.0.4" in LICENSES/THIRD-PARTY-NOTICES.txt) | owner decision 100: petread joins category 6; adds one audited asset, stricter | D4 unchanged: every vendor asset of every category 6 page must be audited and its notice must ship |

## Fortune hub with every fortune page, pet card 19, tag `relock-pet-hub` (2026-11-18, branch `fortune-theme`)

Reason: "owner decision 118 ก + pet card". Locked before the file was run on the product.

| File | Test | Old assertion (23e70d65, round 2 of 90e5d5c1; main holds 213c37ad) | New assertion (d56f5a47) | Protection kept by |
|---|---|---|---|---|
| tests/e2e/fortune-new.e2e.mjs | hub | 12 named cards required (iching, zodiac, astro, dream, bazi, taksa, lek7, lifegraph, compat, planner, luckycolor, report), exactly 18 cards, 4 goals; overflow at 390 / 1280 px in TH; no console errors | all 19 fortune pages named one by one (the 18 hub pages of 90e5d5c1 plus petread.html), exactly 19 cards, 19 distinct, 4 goals; the petread card caption in TH / EN / ZH is longer than 10 characters, has no "แชร์ / share / 分享" (case-insensitive) and no Thai left in EN / ZH; overflow at 390 / 1280 px in TH, EN and ZH; no console errors over all four loads | every old assertion kept or tightened: named cards 12 -> 19 (superset), count 18 -> 19 = every fortune page, overflow TH -> TH + EN + ZH, no-errors over more loads; all other checks in the file unchanged byte for byte |

Lock lines (same commit): field copy `~/LENSIQ-field/evals/crisis-v3/relock-pet-hub/fortune-new.e2e.mjs`, locked with
`tools/eval-guard.mjs lock` at 2026-11-18T08:21:56Z in `evals-locks/crisis-v3.sha256` and the field `locked.sha256`; repository
ledger line `d56f5a47…  tests/e2e/fortune-new.e2e.mjs  # repo file (relock-pet-hub)` in `evals-locks/crisis-v3.sha256` and
`evals-locks/crisis-rules-1323.sha256`. Old bytes are in git at ca6c9ef8.

Open: the independent reviewer confirms in writing that the new test is equal to or stricter than the old one.
