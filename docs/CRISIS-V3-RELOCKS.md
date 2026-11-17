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

Listed here before they are measured on the product. Pending: crisis-net-hotfix-kit and a–d; fortune-crisis*, fortune-helpline,
fortune-live, fortune-new, helpline-call, merit-crisis, fortune-layout A5 exception, crisis-rules-1323-{b,c,f} (card checks).
