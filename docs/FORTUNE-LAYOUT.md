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
