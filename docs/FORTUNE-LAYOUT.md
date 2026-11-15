# Fortune reading layout: group model (stable contract)

Owner order 2026-11-14 Part A, extended on 2026-11-15 (item 5). Code: `fortune-notice.js` (notices, the read-more button and
the help-line exception, on every fortune page) and `fortune-read.js` (the reading layout, on pages with a reading).
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
| iching | 73 | Hexagrams 3, 6, 12 否, 23, 29, 36, 39 蹇, 47 and their "leads to" forms (`all`); 5 需, 10 履, 33 遯, 41 損, 44 姤, 52 艮, 60 節 (`all`); 18 more by area (mostly money); changing lines 1, 3, 6; trigrams Gen and Kan by area |
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
