# Fortune theme "ราตรีคราม" (direction A)

Owner approval 2026-11-17: direction A "ราตรีคราม" and the gold line-art style of the review samples. Branch
`fortune-theme`. Locked tests: `tests/unit/fortune-theme.test.js`, `tests/e2e/fortune-theme.e2e.mjs`
(`evals-locks/fortune-theme.sha256`, copies in `~/LENSIQ-field/evals/fortune-theme/`).

## Where it applies

Only inside the fortune section: every fortune page (category 6 of `tools/cat-data.cjs`, compat included) and
`cat-fortune.html`. Each carries `<html class="lq-ft">` and links `fortune-theme.css`; every rule in that file is scoped to
`html.lq-ft`, so nothing changes on other pages (unit test 1 and e2e T1 check both directions).

| Part | What it looks like |
|---|---|
| Menu pages (`fortune.html`, `cat-fortune.html`, class `lq-ft-menu`) | Whole page at night: gradient #120F2E → #2A1B55, faint stars (CSS only), cards #1E1844 with a gold line illustration, pressed #2A2160 with a gold border, gold #E8C979 accents, text #F5F1E8 / #BDB5DA. On phones the hub grid is 2 columns of compact cards (icon, origin, name, one line); the two detail bullets and the "start" label show from 600 px up (still in the page). On cat-fortune the whole card is tappable (the "open page" link covers the card). |
| Reading pages | A night band with stars behind the title (eyebrow gold, title ivory, lead muted); the reading itself stays on warm paper (#F6F3EC) so charts, wheels and long text keep their dark-on-light contrast. Buttons use the deep indigo #1E1844. |
| Font | Prompt (SIL OFL 1.1, already in `vendor/fonts/prompt`) under the family name `LQft` with two weights only (400 text, 500 headings and bold). Fortune pages no longer download Inter or Prompt 600 / 700. |

Contrast (WCAG 2.1): every palette text pair is ≥ 7.26:1 (unit test 3); rendered text on the menu pages (TH / EN / ZH) and
every text on a theme surface of the reading pages is ≥ 4.5:1 (e2e T2).

## Entry screen

`fortune-entry.js` (only on the two menu pages, in `<head>`): a deity illustration fades in (0.45 s), its name and one
blessing line follow, and the menu returns at 1.5 s (0.3 s fade). The review table of names and lines is the `DEITIES`
array at the top of that file.

- Shown **only** for items with `status: "approved"` (plus `reviewedBy` and `reviewedAt`). Everything ships as
  `"pending"`: on the live site the entry screen does not appear at all until a reviewer approves an item.
- Once per visit to the section: a visit starts when the tab arrives from outside the section (another category, another
  site, a typed URL); not again on reload, on back, or when moving between fortune pages. sessionStorage
  `lq-fortune-entry`; the last deity is kept in localStorage `lq-fortune-entry-last` so the next visit shows another one.
- Never in a crisis or calm session (the signals of `fortune-crisis.js`: sessionStorage `lq-fortune-calm` = "1",
  `<html data-lq-crisis>`, `<html data-lq-calm>`); the image is then not requested at all.
- Tap anywhere, Esc, Enter or Space skips. `prefers-reduced-motion`: no fade or zoom. Nothing to press, buy or read over the
  figure; the only hint ("แตะที่ใดก็ได้เพื่อข้าม") sits at the bottom edge. The page underneath is hidden while it shows and a
  CSS safety net shows it again after 4.5 s even if a script fails.
- Local preview for the owner and the tests: `?ftpreview=1` on localhost / 127.0.0.1 / `file:` only treats every item as
  approved (a small "local preview, pending Merit review" line at the top), `&deity=<id>` picks one, `&hold=1` keeps it on
  screen. The live host ignores the flag (unit test 5).

How to approve an item: set `status: "approved"`, `reviewedBy`, `reviewedAt` (YYYY-MM-DD) in `fortune-entry.js`, bump
`fortune-entry.js?v=` on `fortune.html` and in `tools/cat-pages.mjs` (then `node tools/cat-pages.mjs`), run the unit test.
The backend Merit review queue (`backend/src/merit.js`) only holds the types place / offering / chong / lucky_item, so these
items are not in it; adding a type would need a backend change and deploy (not done; ask the coordinator first).

## Deities (all "pending Merit review")

Own work, drawn for LENSIQ, 2026-11: gold line `#E8C979`, line weight 2, round caps, no fill, a halo with a gap where the
figure crosses it; hand-written SVG coordinates, nothing taken or traced from the web, no bitmap, no external reference.
No Buddha image and no Buddhist figure. Respectful only: no cartoon humour.

| id | TH / EN / ZH | Tradition | Identifying features | Blessing TH / EN / ZH | Bytes (gzip) |
|---|---|---|---|---|---|
| ganesha | พระพิฆเนศ / Ganesha / 象头神 | Hindu | elephant head, large ears, curved trunk; one broken tusk; four arms with axe, noose, blessing hand, bowl of modaka; round belly; lotus seat; mouse at the base | ขอให้วันนี้เริ่มต้นอย่างราบรื่น / May your day begin smoothly. / 愿你今天开端顺遂。 | 2,825 (1,258) |
| lakshmi | พระแม่ลักษมี / Lakshmi / 吉祥天女 | Hindu | open lotus seat; lotus flowers in the upper hands; coins flowing from one hand; pot (kalasha); tall crown | ขอให้วันนี้มีสิ่งดีงามอยู่รอบตัว / May good things surround your day. / 愿美好常伴你今日。 | 2,562 (1,130) |
| brahma | พระพรหม / Brahma / 梵天 | Hindu / Brahmin | four faces (three seen from the front) with pointed crowns; scripture and prayer beads; water pot; blessing hand; lotus seat; swan (hamsa) at the base | ขอให้วันนี้คุณใจดีกับตัวเอง / May you be kind to yourself today. / 愿你今天善待自己。 | 2,564 (1,163) |
| shiva | พระศิวะ / Shiva / 湿婆 | Hindu | high matted hair with a crescent moon; third eye; serpent around the neck; rudraksha beads; trident with a damaru drum; seated on a rock | ขอให้วันนี้ใจคุณนิ่งและแจ่มใส / May your mind be still and clear today. / 愿你今天心静而明朗。 | 2,336 (1,051) |
| vessavana | ท้าวเวสสุวรรณ / Vessavana / 毗沙门天 | Hindu-origin guardian (Kubera / Vaiśravaṇa) | tall tiered giant's crown with ear ornaments; round eyes, upturned fangs; both hands on an upright club; standing guard; shoulder flares | ขอให้วันนี้คุณรู้สึกปลอดภัยและอุ่นใจ / May you feel safe and at ease today. / 愿你今天平安自在。 | 2,177 (992) |
| caishen | ไฉ่ซิงเอี๊ยะ / Caishen / 财神 | Chinese folk | official's hat with two long wings; smiling face, three-strand beard; gold ingot (yuanbao) in both hands; wide-sleeved robe; square-holed coins at the base | ขอให้วันนี้ใจสงบและมั่นคง / Wishing you a calm and steady day. / 愿你今日心安踏实。 | 1,911 (905) |
| shouxing | เทพซิ่ว / Shou Xing / 寿星 | Chinese folk | high domed forehead; long eyebrows and beard; peach of longevity; tall staff with a gourd | ขอให้วันนี้คุณได้พักและดูแลตัวเอง / May you find time to rest and care for yourself today. / 愿你今天好好休息，照顾自己。 | 1,940 (901) |

Reviewer note: ท้าวเวสสุวรรณ was on the owner's list; he is also one of the Four Guardian Kings of Buddhist cosmology, and his
Chinese name 毗沙门天 is the Buddhist one. The reviewer should confirm he fits "no Buddhist figure", or drop him (the
entry screen simply never shows a pending item). Details such as which tusk is broken and the objects in each hand should
be checked by someone who knows each tradition.

## Menu illustrations

`art/fortune/icons.svg`: one symbol per fortune page (19), 64 × 64, `currentColor` line. 203–535 B each, 6,995 B in all
(1,603 B gzip). Fetched once by `fortune-entry.js` when the first card comes within 240 px of the screen, then reused.

## Bytes per visit (synthetic, headless Chrome, cold, unthrottled, 390 × 844; `tools/perf-measure.mjs`)

| Page | origin/main 9f977dd | this branch | budget |
|---|---|---|---|
| fortune.html | 440 KB, 24 requests | 408 KB, 23 requests (+1 request, about +3 KB once a deity is approved) | 440 KB, 24 |
| cat-fortune.html | 345 KB, 19 requests | 308 KB, 18 requests | 370 KB, 20 |

Theme files: `fortune-theme.css` 9.7 KB (2.7 KB gzip), `fortune-entry.js` about 15 KB (about 6 KB gzip; most of it is the
review table), one deity image 1.9–2.8 KB per visit and only when an approved item is shown.
