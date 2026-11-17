# Fortune share and print

Owner order 2026-11-16, items 1 and 2. Branch `fortune-share-print`. Not live until the owner approves the go-live.

## What the user gets

On every fortune result (all 18 pages of category 6: fortune, faceread, palm, horoscope, tarot, iching, bazi, taksa, lek7,
numbers, fengshui, dream, zodiac, astro, lifegraph, planner, luckycolor, report), in Thai, English and Chinese:

- **Share result card** opens a dialog with a preview of a 1080 × 1350 card drawn on the device: LENSIQ mark, date, page name,
  the overview gist of the reading only, the 1323 help line, the disclaimer line "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล
  โปรดใช้วิจารณญาณ" (EN / ZH equivalents) and the link back to the page.
  - Buttons: share through the phone's share sheet (only shown when the browser can share an image file), send on LINE (text and
    link only, `https://line.me/R/share?text=`), share the page link on Facebook (`sharer.php?u=<page URL>` only), save card image
    (download). Close.
  - Switches, **off every time the dialog opens**: "include my photo" (faceread and palm only) and "include birth date, age and
    name" (pages that ask for them). With the switch off the card text is scrubbed of names, ages, the typed birth date and year
    (BE and CE). Text the user typed for the reading (question, dream, phone, plate, account, house number) is never on the card.
  - The card text goes through the reading safety filter (`FortuneAI.safety`) and the crisis word check; a line that fails is
    left out.
- **Print** (replaced on branch `print-report` by the paper report, see `docs/FORTUNE-PRINT-REPORT.md`; the view below stays only as the fallback when the browser print menu is used before the report code arrived) builds a print view and opens the browser's print dialog (printer or "save as PDF", phone or computer): page name and
  date header plus the disclaimer line repeated on every printed page (table header), the result with every reading group
  expanded, canvases (wheels, charts) as pictures, every colour swatch outlined and labelled with its colour name so it reads in
  black and white. No buttons, menus, navigation or help bar; the help line inside a report stays. The person's camera photo is
  not printed. The browser's own print menu (Ctrl+P) gets the same view.
- **Crisis**: while the crisis flag, the calm session or distress words are on the page there is no share or print button and
  `LQShare.share()` / `LQShare.print()` refuse. Uses the public `LQFortuneCrisis.allow()` / `distress()` checks from main.

- **Owner decision 76 (option ก, 2026-11-16):** the palm line drawing (palm) and the sign / animal art from birth data (astro, zodiac) are off on the card by default, each with its own switch, off every time the dialog opens.

## Privacy

Nothing is uploaded: the card is drawn on a canvas in the browser, kept as an in-memory `blob:` image and handed to the share
sheet or saved. The card code (`fortune-share-card.js`) and fonts are fetched once the result is on screen, so making and sharing
the card makes no network request (locked test S3 / W3 counts zero requests to any origin). LINE and Facebook open only when the
user taps them, and receive text and the page link, never the image. PDPA note: `docs/PDPA-NOTES-FOR-COUNSEL.md` section L2.

## Files

- Loader (end of `fortune-notice.js`, embedded in `fortune-read.js`; about 2 KB): fetches `fortune-share.js` at the first
  touch, key, scroll or focus, or when a reading is rendered after the page loaded; never during the first page load
  (coordinator decision 2026-11-16, option B; owner rule: no speed-budget increases).
- `fortune-share.js` (fetched by the loader): page map, card model, crisis check, buttons, print view.
  Pages may lend symbol art to the card with `LQShare.art(rootSelector, fn)` (I Ching hexagram, zodiac animal, Big Three signs,
  dream symbols, face element glyph, palm line drawing).
- `fortune-share-card.js` (fetched when a result is shown): dialog, canvas card, share actions.
- Pages: the existing share and print buttons are kept and now driven by the shared module; missing buttons are added next to
  them. The per-page card handlers were removed; their `makeCard` test hooks stay. The remembered faceread "photo on card" box
  was replaced by the dialog switch (off each time).

## Tests (locked before the build: `evals-locks/fortune-share-print.sha256`)

- `tests/unit/fortune-share-print.test.js`: module on all 18 pages, labels TH / EN / ZH, card defaults, card contents, safety
  filter and hard-limit lint over generated readings, LINE / Facebook links, crisis / calm refusal, print stylesheet.
- `tests/e2e/fortune-share-print.e2e.mjs` (Chrome, 375 px, 18 pages × 3 languages): buttons, defaults, zero requests, card
  text safety, print view, swatch labels, PDF (`Page.printToPDF`, the call behind Playwright `page.pdf()`) with the disclaimer on
  every PDF page read back by pdf.js, crisis state, calm session, real crisis path.
- `tests/e2e/fortune-share-print-webkit.e2e.mjs` (WebKit iPhone 375 px): buttons, share-sheet fallback (LINE / Facebook / save),
  zero requests, print media view, crisis state.

## Known limits

- iOS Safari prints the table header on each page; whether it repeats the footer (page link) varies by version.
- Pages without their own art (horoscope, tarot, numbers, fengshui, bazi, taksa, lek7, lifegraph, planner, luckycolor, report,
  hub) show a small crescent emblem on the card.
