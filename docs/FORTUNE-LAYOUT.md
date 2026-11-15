# Fortune reading layout: group model (stable contract)

Owner order 2026-11-14 Part A, extended on 2026-11-15 (item 5). Code: `fortune-notice.js` (notices, the read-more button and
the help-line exception, on every fortune page) and `fortune-read.js` (the reading layout, on pages with a reading).
Delivery: the 15 reading pages load only `fortune-read.js`, which carries byte-exact copies of `fortune-notice.js` (top) and
`fortune-restrain.js` (end), written by `tools/fortune-read-embed.mjs` and checked by `tests/unit/fortune-read-embed.test.js`
(each separate script would cost one request; the speed budget has none left). Edit the source files, then run the tool.
Tests: `tests/unit/fortune-layout.test.js`, `tests/unit/fortune-layout-caution.test.js`, `tests/e2e/fortune-layout.e2e.mjs`
(all locked; see `evals-locks/fortune-layout*.sha256`).

Other teams (for example the paid-depth work on `fortune-paid`) build on this model. Treat the items below as a contract:
add to it, do not rename or remove. A change here needs a re-lock of the tests above with a reason.

## Data (from the composer, `fortune-ai.js`)

- `result.sections[]`: `{ id, title, paragraphs: string[], caution: boolean[] }`.
- `section.caution[i] === true` marks paragraph `i` as a caution / unfavourable paragraph. The composer sets it itself (every
  sentence built from an unfavourable item, every caution lead and action, the meanings of unfavourable items). The layout
  never guesses: a section without `caution` (AI text, older callers) is shown in full and never folded.
- Entries that restrain or warn but are not marked unfavourable by their engine (for example "hold off on big financial
  commitments" from a tarot card, a siam si slip that counsels waiting, I Ching 蹇 / 否, flying star 7) are tagged as data in
  `fortune-restrain.js`, not found by word lists. The composer adds every tagged entry's text, in the reading's language, to the
  caution marks, and records provenance (`FortuneAI._internal.provenance(result)` → `[{ section, para, id, area }]`, not part
  of the reading's data). See "Restraining entries" below.

## Restraining entries (data tags, `fortune-restrain.js`)

Tagged 2026-11-15 by reading every fact item of every discipline in Thai, English and Chinese. The input was review sheets of
every item the engines produce for the review corpus (`tools/fortune-review-export.mjs`, 4,000 fact sets per discipline), about
30,000 strings. No keyword search was used to find them. A tag is either `all` (label and every meaning area: a sign the
tradition names unfavourable, or every area restrains) or a list of meaning areas whose text, in any language, holds back,
delays, limits or warns. Chart-dependent feng shui tags come from the engine as `item.restrain` (`fengshui.js`): the year and
month centre stars that need care (2, 3, 5, 7: `all`), the year star's timing text (zones of stars 5 and 2), floor-plan rooms
on those stars and compass records pointing at an unfavourable direction (`all`).

| Discipline | Tagged entries | What was tagged (read, not searched) |
|---|---|---|
| tarot | 154 | Engine-unfavourable cards (`all`); Four of Swords (`all`); reversed cards whose love / work / money text says to slow down, check the plan or hold back; Moon, Death, Tower reversed; pairs with Five of Cups / Pentacles, Swords 3, 5, 8, 9, 10, Ten of Wands, Devil, Tower, Death, Moon |
| iching | 75 | Hexagrams 3, 6, 12 否, 23, 29, 36, 39 蹇, 47 and their "leads to" forms (`all`); 5 需, 10 履, 33 遯, 41 損, 44 姤, 52 艮, 60 節 (`all`); 18 more by area (mostly money); hex.4 / rel.4 money (review F); changing lines 1, 3, 6; trigrams Gen and Kan by area |
| numbers | 57 | Pair groups whose label names a risk (money leak, burden, ups and downs, obstacle, love needing care, hasty temper: `all`); sums that repeat those pairs; areas that say check before signing, lending or a big expense |
| dream | 56 | Areas that say pause before deciding, read terms before agreeing, spend within a budget, do not rush, rest enough; dream type and the confused mood |
| horoscope | 46 | Money cautions (do not give beyond your means, keep a fallback, pause before spending); fire-element "do not burn all your energy at once"; Tiger, Dragon and Pig year lines; BaZi excess elements and Rob Wealth (choose partners with care) |
| face | 13 | Areas that say count to ten before deciding, sleep on a big purchase, say no to what is beyond you |
| bazi | 9 | Weak Day Master (`all`), lacking elements; Peer and Officer luck (money slips away, more pressure); wealth luck timing |
| siamsee | 8 | The seven "ค่อยเป็นค่อยไป" slips 4, 7, 11, 15, 18, 22, 25 (`all`: wait, delay big purchases); slip 2 work and advice |
| zodiac | 8 | Clash, break, harm and same-year (值太岁) relations (`all`); the year element that controls yours (money discipline); two animals by area |
| taksa | 8 | กาลกิณี of every birth day (`all`) |
| palm | 7 | Areas that say take a breath before replying, wait a day before answering, have someone check big money decisions |
| astro | 7 | Areas that say wait a day before a big purchase, set boundaries, focus on one thing, rest |
| lek7 | 7 | Houses with low energy that need attention (`all`) |
| lifegraph | 4 | Current-period care, love and money cautions (`all`); wealth luck timing |
| fengshui | 2 | Directions to use less (`all`); headboard advice "keep the bed out of line with the door" (all compass records of the bed); plus the chart-dependent engine tags above |

Review of 2026-11-15 (fresh detector), decided by reading:
- Tarot `m00.r` (Fool reversed) love ("slow down … before deciding anything") and `swords11.r` (Page of Swords reversed)
  love ("choose your words with care") are tagged, like the face and palm count-to-ten tags.
- Borderline cases made consistent: Wheel of Fortune `m10` / `m10.r` advice ("wait patiently for the right moment") is
  tagged, like the siam si slips that counsel waiting and I Ching 5 需; I Ching `hex.4` / `rel.4` money ("read up on all the
  facts before a money decision") is tagged, like the palm and numbers check-before-a-big-money-decision tags.
- Numbers `sum.NN` reuses the text of `pair.NN`, so an untagged sum takes its pair's tag (plus overview). This covers sums the
  review sheets never produced (`sum.70`, `sum.72` … `sum.80`).
- Tips: `facts.extras.restrainTips` lists the tips the engine's data marks as restraining (numbers: `goals[].tips[].avoid`, for
  example "ตำรานิยมเลี่ยงคู่ 27/72 และ 67/76 …"); provenance area `tip`. Every other discipline's tips were read: I Ching and
  zodiac tips are their items' own advice text (covered by the item tags); face, palm and feng shui tips do not restrain.
- Template fills: a summary or headline template filled with an unfavourable or tagged item (TH contrast "แม้{W}จะยังไม่เด่นนัก…",
  TH / ZH / EN headline "…{X}"; headlines count `all` tags only) is recorded where it is filled (`FL` in `fortune-ai.js`;
  contrast at the claim, headlines at the sentence); provenance area `fill`. A short name no longer depends on the fragment
  length of `markCaution`.
- Thai rewrites (re-review 2026-11-15): the Thai composer rewrites a meaning before it reaches the page (modal "ควร" dropped,
  "{LEV}เป็นสัญญาณให้{M}" and the other imperative, advice and action frames). Every unit built from a meaning
  (`itemSentence`, `adviceUnit`, `actionLine`) carries its source (`src: { it, m }`); `paragraphs()` records provenance
  `{ id, area }` on the final vetted text when that meaning belongs to a tagged area (or an unfavourable item, or a restraining
  tip). The rewritten words are never matched.

Not tagged on purpose: neutral description of character, encouragement, favourable predictions and positive tips that are not
framed as holding back (for example "wear green", "set a fixed share aside as savings", "make time to rest"). Coverage limit:
the sheets hold the items the review corpus produces; an item that never appears there (rare face or palm shapes, photo
remarks) has no table tag and is protected only if its engine marks it unfavourable. A tag can only add caution marks, so a
wrong tag shows more text and never hides any.
- The layout never changes a word. `fortune-read.js` `planSection(section, lang)` returns the parts
  `[{ text, para, visible, caution }]`; parts of a paragraph joined with `SEP[lang]` (`" "` Thai and English, `""` Chinese) are
  that paragraph exactly.

## DOM of one group (after `FortuneAI.renderSections`, through the documented `decorate` hook)

```html
<section class="fa-section lq-open?" data-section="work" id="lq-g-N" data-lq-grouped="1">
  <h3>การงาน</h3>                                    <!-- short heading (HEADINGS) when the title is a standard one -->
  <p class="lq-gist">…</p>                           <!-- overview: the start of the main point, about 3 lines at 375 px -->
  <p class="lq-caution">…</p>                        <!-- composer-marked paragraph: always shown, never folded -->
  <div class="lq-advice" data-lq-remedy>…</div>      <!-- icons / colour swatches / belief label (hidden in the crisis state) -->
  <div class="lq-more-body" id="lq-mb-N">…<p>…</p></div>   <!-- folded text; display:none until opened -->
  <button type="button" class="chip lq-more" aria-expanded="false" aria-controls="lq-mb-N …">อ่านเพิ่มเติม</button>
</section>
```

- Opening a group: the `button.lq-more` toggles `aria-expanded`, adds `lq-open` to every `.lq-more-body` it controls and to the
  `.fa-section`. It works by tap / click and by Enter (and Space through the native button). At least 44 × 44 px.
- First screen (item 5): per group only `.lq-gist` (at most 3 lines while closed) plus every `.lq-caution` paragraph.
- Long readings (4 groups or more) get `nav.lq-toc[data-lq-toc]` before the first group, with links to each group's `id`.
- Never folded or made a notice: `.lq-helpline`, `.lq-call`, `.fa-support`, `.lq-support`, `[data-lq-crisis-card]`
  (`NEVER_COLLAPSE` in `fortune-notice.js`).
- Notices: `.lq-notice` = one short line (`.lq-disc-line` / `.lq-notice-line`) + `button.lq-more` + `.lq-notice-more`.

## Adding paid depth (guidance for `fortune-paid`)

- Put extra text in its own group (`<section class="fa-section" data-section="…">`) or inside a group's `.lq-more-body`;
  never between `.lq-gist` and the button, and never inside a `.lq-caution` paragraph.
- Keep the off switch default off; with it off the DOM above must be byte-for-byte what the layout produces today.
- Paid content must never appear while the crisis net, the soft step or the support card is active (mark it
  `data-lq-remedy` / `data-lq-upsell`, see `fortune-crisis.js`).

## Go-live changes (owner order 2026-11-15, branch `fortune-live`)

- Notice line (`fortune.disc.line`, `LINE` in `fortune-read.js` / `fortune-notice.js`): the owner's final wording
  "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ" / "Based on astrological principles, which are a matter of
  personal belief. Please use your own judgement." / "基于命理学原则，属个人信仰，请自行判断。". The share card and every KB
  `disclaimer` / `disclaimerShort` use the same line. "เพื่อความบันเทิง" does not appear on any fortune page.
- Help line in ONE place per page: `#lqHelpTop` (before `<main>`) is a small row of two tap-to-call buttons
  (`.lq-helpbar` > `.lq-call-mini[data-lq-call]` > `a.lq-call-btn[href^="tel:"]`, label and number inside the button). There is
  no `#lqHelpEnd` and no `.lq-helpline-result` under a normal reading. Under a reading on a calm page (crisis net) the line is
  still added (`fortune-crisis.js` `helpLine()` / `calmDock()`); the printed report keeps `.lq-helpline-print` (print only).
  Paid depth: find the help line with `.lq-helpline, .lq-helpline-result` as before and fall back to appending at the end of
  the reading when there is none (normal state).
- The group model above (`.fa-section[data-section][data-lq-grouped]`, `.lq-gist`, `button.lq-more` + `.lq-more-body`,
  `HEADINGS[lang][id]`, `FortuneAI.SECTION_IDS`, `enhance(container, res)`) is unchanged; it is the structure the paid depth
  (`fortune-paid.js`) uses.
- Tests: `tests/unit/fortune-live.test.js`, `tests/e2e/fortune-live.e2e.mjs` (locked, `evals-locks/fortune-live.sha256`).
