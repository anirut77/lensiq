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
