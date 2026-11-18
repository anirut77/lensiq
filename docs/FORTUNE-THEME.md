# Fortune theme "ราตรีคราม" (direction A)

**Go-live (owner decisions 92–94, 2026-11-18):** direction A with the gold line-art goes live once merged with main and CI is green,
with a quick switch back, Vessavana hidden, deity names hidden on the site until the expert review, and reading pages as a night
band over light paper (94 ก). Locked tests: `tests/unit/fortune-theme-golive.test.js`, `tests/e2e/fortune-theme-golive.e2e.mjs`,
`tests/e2e/fortune-theme-golive-crisis.e2e.mjs` (`evals-locks/fortune-theme-golive.sha256`).

## Switch back to the previous look

One line in `lensiq-config.js`: `window.LENSIQ_FORTUNE_THEME = window.LENSIQ_FORTUNE_THEME || "a";`. To go back, change `"a"` to
`"classic"`, bump `lensiq-config.js?v=` on every page (`sed -i '' 's/lensiq-config\.js?v=21/lensiq-config.js?v=22/g' *.html
tools/cat-pages.mjs`), commit, let CI pass and redeploy. No code revert: on a fortune page (`<html class="lq-ft">`) the config
swaps the theme classes (`lq-ft`, `lq-ft-menu`, `lq-ft-read`, `lq-ft-entry`) for `lq-ft-classic`, so every theme rule stops
applying and the previous rules of the hub (kept byte for byte in `fortune.html`, scoped `html.lq-ft-classic` where the theme
replaces them) are back; the new illustration slots are hidden, the emoji tiles return, the entry screen and the theme art are never
requested, and the previous fonts load again. Other pages are never touched. Back to the theme: `"a"` and bump again. The four hub
cards added with the theme (compat, planner, luckycolor, report) stay in classic, with an emoji tile. `luckycolor.html` now loads
`lensiq-config.js` too, so the switch reaches all 20 pages.

## Hidden until the expert review (decision 93)

- **Vessavana (ท้าวเวสสุวรรณ)**: `hidden: true` on his item in `fortune-entry.js`; a hidden item is never eligible, on the site or in
  the local preview. His data, features and art (`art/fortune/deity-vessavana.svg`) stay in the repo for the expert pack. To unhide
  after the expert confirms: delete `hidden: true` (then the usual approval below still applies; as a `buddhist_guardian` item the
  locked unit test keeps him pending until a new owner decision).
- **Deity names**: `NAMES_ON_SITE = false` in `fortune-entry.js`. Once an item is approved, the site shows the drawing and the
  blessing line only; the screen-reader label is the generic "คำอวยพร / A blessing / 祝福". Names stay in the data. Set `true`
  (and bump `fortune-entry.js?v=`) after the expert review.
- Local preview for the expert (localhost / 127.0.0.1 / `file:` only, never on the live host): `?ftpreview=1` shows every
  non-hidden item with its name (review mode); `?ftpreview=2` shows them exactly as the live site would (no name).

## Expert pack

What the expert reviews: the `DEITIES` table in `fortune-entry.js` (names TH / EN / ZH, tradition, identifying features, blessing
line per language, status) and the seven drawings in `art/fortune/deity-*.svg`, including Vessavana; the table "Deities" below
summarises them. Open `fortune.html?ftpreview=1&deity=<id>&hold=1` locally to see one at a time.

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
| Reading pages (`html.lq-ft lq-ft-read`, decision 94 ก) | A night band with stars behind the title (eyebrow gold, title ivory, lead muted); the reading itself on light paper (`html.lq-ft-read body` #F6F3EC) so charts, wheels and long text keep their dark-on-light contrast (WCAG AA for every visible text, e2e G4). Buttons use the deep indigo #1E1844. |
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
| ganesha | พระพิฆเนศ / Ganesha / 象头神 | Hindu | elephant head, large ears, curved trunk; one clearly broken tusk (short stump, flat end) and one full tusk; four arms with axe, noose, blessing hand, bowl of modaka; round belly; lotus seat; mouse at the base | ขอให้วันนี้เริ่มต้นอย่างราบรื่น / May your day begin smoothly. / 愿你今天开端顺遂。 | 2,835 (1,265) |
| lakshmi | พระแม่ลักษมี / Lakshmi / 拉克什米 | Hindu | open lotus seat; lotus flowers in the upper hands; coins flowing from one hand; pot (kalasha); tall crown | ขอให้วันนี้มีสิ่งดีงามอยู่รอบตัว / May good things surround your day. / 愿美好常伴你今日。 | 2,562 (1,130) |
| brahma | พระพรหม / Brahma / 梵天 | Hindu / Brahmin | four faces (three seen from the front) with pointed crowns; scripture and prayer beads; water pot; blessing hand; lotus seat; a recognisable swan (hamsa: body, S-neck, beak) at the base | ขอให้วันนี้คุณใจดีกับตัวเอง / May you be kind to yourself today. / 愿你今天善待自己。 | 2,623 (1,179) |
| shiva | พระศิวะ / Shiva / 湿婆 | Hindu | standing (not seated, so never a Buddha-like silhouette); tall matted locks with a crescent moon; third eye; serpent with raised hood at the neck; rudraksha beads; tall trident with a damaru drum; tiger-skin cloth | ขอให้วันนี้ใจคุณนิ่งและแจ่มใส / May your mind be still and clear today. / 愿你今天心静而明朗。 | 2,308 (1,037) |
| vessavana | ท้าวเวสสุวรรณ / Vessavana / 毗沙门天 | **buddhist_guardian** (a guardian king in Thai / Chinese Buddhist practice) — locked to pending until the owner's expert decides | tall tiered giant's crown with ear ornaments; calm, dignified face with a moustache (no fangs); both hands on an upright club; standing guard; shoulder flares | ขอให้วันนี้คุณรู้สึกปลอดภัยและอุ่นใจ / May you feel safe and at ease today. / 愿你今天平安自在。 | 2,034 (957) |
| caishen | ไฉ่ซิงเอี๊ยะ / Caishen / 财神 | Chinese folk | official's hat with two long wings; smiling face, three-strand beard; gold ingot (yuanbao) in both hands; wide-sleeved robe; square-holed coins at the base | ขอให้วันนี้ใจสงบและมั่นคง / Wishing you a calm and steady day. / 愿你今日心安踏实。 | 1,911 (905) |
| shouxing | เทพซิ่ว / Shou Xing / 寿星 | Chinese folk | high domed forehead; long eyebrows and beard; peach of longevity held out in one hand (round fruit, pointed tip, two leaves); tall staff with a gourd | ขอให้วันนี้คุณได้พักและดูแลตัวเอง / May you find time to rest and care for yourself today. / 愿你今天好好休息，照顾自己。 | 2,015 (935) |

Reviewer note (independent review of 4c5bf0f6, refined on the same branch): ท้าวเวสสุวรรณ was on the owner's list; he is also one of the Four Guardian Kings of Buddhist cosmology, and his
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

## Refinement after the independent review (2026-11-17)

Art and data only, every item still pending: Vessavana re-tagged `buddhist_guardian` (the unit test now forces such an item
to stay pending) and given a calm face; Lakshmi ZH name 拉克什米 (the Buddhist name 吉祥天女 dropped); Shiva redrawn
standing with a tall trident, matted locks, crescent, third eye and a hooded serpent; Ganesha's broken tusk, Brahma's swan
and Shou Xing's peach redrawn to read at a glance. Art version `?v=2`.

Latin-ext font subset: not added. Prompt latin-ext is 9.6–9.8 KB per weight (not tiny); the rare characters it covers
(for example ā, ṇ in "Vaiśravaṇa") fall back to the system font, and no deity name or page text on the fortune pages uses them.

## Round 3 fixes at 360 px (owner decision 104 ก, 2026-11-18)

fortune-top-compact C1 at 360 × 640 had 4 problems on round 2 (the 4th found by a local run: report EN `.rp-type` ended at
644 px). `fortune-theme.css?v=3`: below 381 px wide the reading band is tighter (padding 2 / 6 px, margin 4 px, no h1 top
margin, lead margin 2 px) and report's first heading has a 12 px top margin. Measured locally at 360 × 640: faceread EN camera
buttons end at 626 px (was 642), report EN first type card at 622 px (was 644), astro TH month field centre at 559 px, above the
fixed read bar that starts at 575 px (was 575, covered). 393 px and wider are unchanged.
cat-fortune card titles: the title stays above the card-wide link (main's compact-top check needs it uncovered), and
`fortune-entry.js?v=5` passes a tap on the title on to the card's link (modifier keys kept), so the title opens its page again.
