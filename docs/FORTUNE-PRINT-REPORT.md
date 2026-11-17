# Fortune paper report (print layout)

Owner order 2026-11-16 (testers, item B): "The printed result looks like the screen pasted onto paper. Redesign it as a report
made for paper." Branch `print-report` (built on `fortune-share-print` + main). Not merged and not deployed: the owner approves
the PDF samples first (`~/Desktop/LENSIQ-review/print/`).

## What changed

The print button (and the browser's own print menu) on every fortune result now prints a **paper report**, not the screen.
It is a separate document built for paper by one renderer, `fortune-print.js` + `fortune-print.css`:

- **Header on every page:** the LENSIQ mark, the report title (page name), the person's name only if they typed one **and**
  ticked "include my name and what I entered" (off on every page load and after each print), and the date.
- **First page:** a title block (title, "รายงานคำทำนาย / Reading report / 解读报告", date).
- **Sections:** clear headings; all groups expanded (folded parts, closed tabs, `<details>`); a closed tab's name becomes its
  section heading (e.g. horoscope: ภาพรวม, โหราไทย, ปาจื้อ, …). Short lists (lucky items, numbers) in two columns.
- **Black and white:** every colour swatch is an outlined chip plus its colour name; every advice icon has a word next to it
  (สีมงคล, การบูชา, การเคารพ, ทิศมงคล); caution paragraphs have a dashed rule; headings a solid bar.
- **Footer on every page:** the disclaimer line and the page link; "หน้า X / Y" (Page X / Y, 第 X / Y 页) in the bottom-right page
  margin (CSS `@page` margin box; Chrome / Edge print it, Safari leaves the number out but keeps header and footer).
- **Page breaks:** a heading always stays with its first paragraph / list / table (`.lqp-lead`, `break-inside: avoid`;
  headings `break-after: avoid`); a heading with nothing under it is dropped; list items and table rows never split; table
  column heads repeat on the next page.
- **Sizes:** A4 and A5 portrait from the same rules (the print dialog's paper decides; narrow paper switches to the A5 rules:
  smaller type, one column unless items are very short). 80 mm receipt (`size: "80mm"`, future kiosk) is its own style: one
  long page whose height follows the content, one column, nothing wider than the roll.
- **Never on paper:** buttons, menus, banners, help controls (help bar, camera help, help-line buttons), forms, the in-page
  menu, the AI-consent box, the camera photo.
- **Crisis:** no print button while the crisis flag, the calm session or distress words are on the page; `LQShare.print()`,
  `LQPrint.print()`, `LQPrint.mount()` refuse; a model marked crisis renders nothing.
- **Privacy default:** with "include" off, names, birth data and anything typed (question, phone number) are taken out of every
  printed text with the share card's own rule (`LQShare.scrub`). Generic dates are not removed (planner dates must stay).

## One renderer for print and the paid PDF

```js
LQPrint.render(model, { size: "A4" | "A5" | "80mm" | "auto", paid: false })   // -> HTML string, pure (runs in Node)
LQPrint.fromDom(resultElement, { lang, page, include, personal })              // -> model, from a result on screen
LQPrint.mount(model, opts) / LQPrint.print({ size, include })                  // browser: #lqPrint + print dialog
```

The model is plain data: `{ page, lang, title, date, name?, birth?, link, sections: [{ level, heading, blocks }] }` with blocks
`p` (text, caution), `list` (items with label / text / swatches), `table` (caption, rows of cells), `figure` (data: image or
site file), `advice` (icons, swatches, belief note). The paid report later builds the model **straight from its composer** (no
screen DOM), calls `LQPrint.render(model, { size: "A4", paid: true })` (adds the "รายงานฉบับเต็ม / Full report" label and a
`lqp--paid` class, nothing else), and prints it to PDF the same way (browser print / `page.pdf()` on a server is not planned:
on-device by default). The paid switches stay off (CLAUDE.md "Remedies, merit and paid fortune content" c).

## Loading and speed

`fortune-share.js` fetches `fortune-print.js` and `fortune-print.css` together with the card code, once a result is on screen
and the page has been used (never in the first page load). No speed budget changed. If someone prints before the files arrived,
the print button waits for them; the browser's own print menu at that moment falls back to the old screen-copy view.

## Thai PDF text

As decided on the share-print branch: Thai uses the device Thai UI font stack (Tahoma, Leelawadee UI, Thonburi, Noto Sans Thai,
Loma, Garuda) with ligatures off, so the PDF text can be copied and searched; tests compare PDF text after NFKC with Thai
vowel / tone marks and spaces removed (Chrome may emit marks in another order and maps some CJK characters to Kangxi radicals).

## Tests (locked before measuring: `evals-locks/print-report.sha256`)

- `tests/unit/fortune-print.test.js` (pure, P1–P9): lazy loading, header, headings, footer + page numbers, no controls, break
  rules, swatch / icon labels, A4 / A5 / 80 mm, crisis, paid flag, labels TH / EN / ZH, escaping.
- `tests/e2e/fortune-print-report-{th,en,zh}.e2e.mjs` (+ kit): 5 pages (horoscope, tarot, faceread, bazi, numbers) × TH / EN /
  ZH × A4 / A5 through the real print button and Chrome's PDF, read back with pdf.js (R1–R4); 80 mm without overflow (R5);
  black-and-white labels (R6, lucky-colour page added in TH so swatches are always checked); crisis (R7).
- The share-print tests (`fortune-share-print-*`) still apply unchanged.

## Also on this branch: owner decision 76 (option ก)

On the share card, the palm line drawing (palm) and the sign / animal art from birth data (astro, zodiac) are off by default,
each behind its own switch in the dialog ("ใส่ภาพลายเส้นมือของฉันในการ์ด", "ใส่ภาพราศีจากวันเกิดของฉันในการ์ด",
"ใส่ภาพนักษัตรของฉันในการ์ด"), off every time the dialog opens. Tests appended to `tests/unit/fortune-share-print.test.js`
and `tests/e2e/fortune-share-art-optin.e2e.mjs` (locked, `evals-locks/fortune-share-print.sha256`).

## Layout lessons (measured on this branch)

- The frame is a table so the header and footer repeat on every page; inside its cell Chrome splits a heading from its text
  unless the heading + first block is a `display: flow-root` box (reproduced: numbers ZH A4, 1 in 10 runs stranded, 0 in 15
  after). `table-layout: fixed` on the frame also breaks this, so the frame stays auto and nothing inside may force it wider
  than the paper (long colour labels wrap, two-column items shrink, table cells wrap).
- PDF text read back: Chrome writes the lowest code point that shares a glyph in the font. With the CI font (Noto Sans CJK
  SC, fonts-noto-cjk 20240730) 页 -> U+2EDA, 巳 -> U+2E92, 食 -> U+2EDD, 风 -> U+2EDB, en dash U+2013 -> U+2012, 户 U+6237 ->
  U+6236. The paper shows the right characters; copied text from such a PDF can carry these twins.
  Evidence: `~/LENSIQ-field/evals/print-report/relock-evidence-codepoints.log`, `ci-font-readback-evidence.log`.

## Re-lock ledger

### Decision 91 (2026-11-17, option ก): P5 of the photo test counts real network traffic

Test: `tests/e2e/fortune-print-photo.e2e.mjs` (old locked bytes sha256 `07689f4d…` stay in
`~/LENSIQ-field/evals/print-report/fortune-print-photo.e2e.mjs` and in git at `b16a06d0`; new bytes locked as
`fortune-print-photo.e2e.v2.mjs`, sha256 `5078990a…`, `evals-locks/print-report.sha256`).

- **Old rule.** P5 failed on every `Network.requestWillBeSent` event of the page from the print tap to the end of
  `Page.printToPDF`, whatever the scheme: http, https and also `data:` and `blob:`. The printed figure is a `data:image/jpeg`
  drawn in the page, so P5 failed on the figure itself (CI 44043483183, e2e shard 3/3; locally faceread and palm A4). WebSocket
  traffic never produced that event, so ws / wss were not seen at all.
- **New rule** (all must hold, faceread and palm, A4 and A5):
  - P5a: no http / https / ws / wss request, no `navigator.sendBeacon` call and no form submission from the print tap to the
    PDF. CDP request events plus hooks in the page (WebSocket and its `send`, `sendBeacon`, submit event, `form.submit()`,
    fetch and XHR bodies).
  - P5b: from page load to the PDF, no request of those kinds carries the image: no URL or body containing `data:image`, a
    `blob:` URL or a 64-character piece of the printed figure's base64 data, and no binary body (Blob, File, ArrayBuffer,
    typed array, FormData with a file) of 1 KB or more.
  - P5c: the print view holds no remote image. Every image URL in the document under print media (img src / currentSrc /
    srcset, `<source>`, SVG `<image>`, video poster, `input[type=image]`, computed background-image, list-style-image,
    border-image-source, mask-image and content of each element and its ::before / ::after) is `data:` or `blob:`, or a
    same-origin file that exists in the repo (a shipped static asset). The figure's image (the user's photo) must itself be
    `data:` or `blob:`; a same-origin URL is not accepted for it.
- **Why it is not weaker.** The only thing no longer counted is a `data:` / `blob:` URL, which is read inside the browser and
  is not sent anywhere. Every http(s) request the old rule caught is still caught; ws / wss, beacons and form posts are newly
  caught; the image check now covers the whole session, not only the print window; a remote image served from cache (no
  request) is refused by P5c. Negative controls, one leak injected after the print tap each (beacon, fetch carrying the
  image, 5 KB blob body, remote `<img>`, CSS `url()` to a non-existent same-origin path, WebSocket, form post, the photo from
  a same-origin URL): every one fails P5; clean run passes
  (`~/LENSIQ-field/evals/print-report/decision91-negative-control.log`).
- Product unchanged: the report already keeps the photo on the device; the old check was wrong about `data:`.

## Known limits

- Page numbers need CSS margin boxes (Chrome / Edge 131+). Safari / iPhone print has no page numbers.
- The browser decides the paper; "auto" follows the print dialog. A kiosk must set its printer to 80 mm roll.
- Charts drawn on a canvas are printed as pictures (no text inside them for search).
