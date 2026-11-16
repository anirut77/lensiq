# Compatibility (ดวงสมพงษ์): libraries, licences and method sources

Owner order 2026-11-16, part A. Page `compat.html`; code `compat.js` (engine and report), `compat-kb.js` (texts TH / EN /
ZH), `compat-ui.js` (page). Locked tests: `tests/unit/fortune-compat.test.js`, `tests/e2e/fortune-compat.e2e.mjs`,
`tests/e2e/fortune-compat-webkit.e2e.mjs` (`evals-locks/fortune-compat.sha256`). Research notes: `docs/COMPAT-RESEARCH.md`.

## 1. Licence and provenance check of the libraries (2026-11-16)

Nothing was installed for the check (read-only `npm view`, GitHub API and the published files). Not legal advice.

| Library | What it is | Licence (SPDX) | Provenance and red flags | Decision |
|---|---|---|---|---|
| `aryaminus/astro` (https://github.com/aryaminus/astro) | Python MCP server / agent skill (Western, Vedic, BaZi). Created 2026-06-07, last commit 82df4c1 the same day, 17 stars | MIT plus an added "astrological content" disclaimer (GitHub shows `NOASSERTION`), © 2024-2026 "Astrology API Contributors" | Not JavaScript. Optional import of `swisseph` (pyswisseph, **AGPL**) when installed. Accuracy self-claimed ("~1-2 arcmin", Schlyter's simplified orbits), no tests. Its reference texts (`ref/*.txt`) read like pasted chatbot answers. Lahiri formula linear and about 15″ off IAE at J2000 | **Not used.** Licence itself permissive, but the code is Python, unverified, and has an AGPL path |
| `astroceleste-engine` (npm 0.0.14, https://github.com/ffalcinelli/astroceleste-engine) | Rust → WebAssembly engine (planets from JPL kernels, Vedic, BaZi, Zi Wei) | `MIT OR Apache-2.0`, © 2026 the astroceleste-engine contributors; NOTICE credits Skyfield (MIT), iztro (MIT), JPL DE440s (public domain) | First published 2026-09-22, 14 versions in a month, "Experimental (0.0.x): API may change", 1 star, 27 downloads a week. No install scripts, signed with SLSA provenance, not a typosquat. 1.46 MB wasm plus a JPL kernel of 5.4–32 MB | **Not used now** (too immature and too heavy for a phone page; disk and speed budgets). Licence OK if reconsidered later |
| `astronomy-engine` 2.1.19 (Don Cross, https://github.com/cosinekitty/astronomy) | JavaScript astronomy library; browser build `astronomy.browser.min.js` | **MIT**, © 2019-2025 Don Cross (https://github.com/cosinekitty/astronomy/blob/master/LICENSE; header kept in the file) | 1,117 stars, ~473,000 npm downloads a week, no dependencies, no install scripts. Planets: truncated VSOP87 (IMCCE); reductions: NOVAS C 3.1 (US Naval Observatory, public domain); ΔT Espenak–Meeus (NASA); Moon: NAO 1954 Improved Lunar Ephemeris, "adapted from Turbo Pascal code" in Montenbruck & Pfleger, *Astronomy on the Personal Computer* (Springer). The author translated that code and releases it under MIT; we found no licence complaint (one small provenance note, recorded here). README claim: within ±1′ of NOVAS / JPL Horizons (library claim, not our measurement) | **Used**, vendored byte-for-byte: `vendor/astronomy-engine/astronomy.browser.min.js`, 116,424 bytes (46,810 gzip), sha256 `f41139a87941ea017ab902b954c9389fa27ea72083d7fab4971756d7769d14e6` = jsdelivr `npm/astronomy-engine@2.1.19`. Loaded only when the user ticks the consent box or computes (never at page load). Credits: `LICENSES/THIRD_PARTY.md`, `LICENSES/THIRD-PARTY-NOTICES.txt` |
| Swiss Ephemeris | — | AGPL-3.0 or paid licence | Not used by any of the above in our build | Not used |
| PyJHora (`naturalstupid/PyJHora`) | Python Jyotish library with Ashtakoota tables | **AGPL-3.0** | Found during research; its North-Indian Tara function also looks inverted. **Review round 1 (2026-11-16, D1): the first build carried a 14×14 Yoni grid that matched PyJHora cell for cell (196/196, including its Horse–Deer = 1). That grid is removed;** the Yoni score is now derived from the classical rule in non-AGPL sources (§3a), and the Graha Maitri grid is computed from Parashara's friendships (§3b) | **Not used, nothing copied.** No GPL / AGPL code or table is in the product |

Unclear-licence stop rule: none of the libraries we use has an unclear licence, so no stop condition was hit.

## 2. Accuracy of the positions (source: synthetic comparison on our machine, 2026-11-16)

- **Moon** (needed for the Vedic nakshatra, boundaries every 13°20′): the site's own Moon (`astro.js`, Meeus ch. 47, 34 main
  terms) differs from astronomy-engine 2.1.19 by at most **0.72′** (mean 0.15′) over 3,000 dates from 1900 to 2100. The locked
  unit test (M3) checks under 1′ on 1,500 dates. With a ±1′ Moon, a nakshatra can come out wrong only when the Moon is within
  1′ of a boundary (about 0.25 % of births); an unknown birth time matters far more (the Moon moves about 0.5° an hour), so the
  page reports when the nakshatra changes during the birth day and no time was given.
- **Ayanamsa**: Lahiri (Chitrapaksha) mean value from the Indian Astronomical Ephemeris: 23°51′25.53″ at J2000 plus the IAE
  1989 general precession; the locked test checks the IAE values for 2000-01-01 and 2020-01-01 within 0.005° (values quoted
  in the Swiss Ephemeris documentation §2.8.5 and Appendix E, https://www.astro.com/swisseph/swisseph.htm). The sidereal Moon
  adds nutation in longitude (true ayanamsa) because the Moon longitude is true of date.
- **Planets** (western synastry): astronomy-engine, true ecliptic of date. Sanity checks in the locked test: Sun within 0.02°
  of the site's own Sun; Mercury within 28.5° and Venus within 47.5° of the Sun on 60 random dates.
- No claim of predictive accuracy is made for any tradition. Relationship astrology has no supporting evidence in the one
  large register study we found (Helgertz & Scott 2020, *Genus*, Swedish marriages 1968–2001,
  https://link.springer.com/article/10.1186/s41118-020-00103-5); the page presents every method as belief.

## 3. Method sources (what the engine implements)

| Method | Rule implemented | Sources |
|---|---|---|
| Thai: birth-day pairs | Planet numbers 1 Sun … 7 Saturday, 8 Rahu (Wednesday night). คู่มิตร 1-5 2-4 3-6 7-8; คู่ศัตรู 1-3 2-5 4-8 6-7; คู่สมพล 1-6 2-8 3-5 4-7; คู่ธาตุ 1-7 2-5 3-8 4-6. Monday–Thursday is both คู่ธาตุ and คู่ศัตรู: shown as both | th.wikipedia "โหราศาสตร์ไทย" (names ตำราโหราศาสตร์ไทย อ.ทองเจือ and ตำราพรหมชาติ); baankhunyai.com/17278026 (อ.อรุณ ลำเพ็ญ) agrees on คู่มิตร and คู่ธาตุ. Popular weekday lists (horoscope.mthai.com/horoscope/28998.html, sanook.com/horoscope/330238) disagree on Wednesday's opposite; we follow the numbered table |
| Thai: day elements | Sun fire, Mon earth, Tue wind, Wed water, Thu earth, Fri water, Sat fire, Rahu wind | th.wikipedia โหราศาสตร์ไทย |
| Thai: year animals | Six harmonies (คู่ฮะ), three harmonies, clash (คู่ชง), harm, punishment; the Thai year boundary of `horoscope.js` | sanook.com/horoscope/240605 (harmony / clash table) and the Chinese branch relations below |
| Thai: birth-year elements (ตำราพรหมชาติ) | Rat, Pig water; Ox, Dog earth; Tiger, Rabbit wood; Monkey, Rooster iron; Dragon, Goat gold; Snake, Horse fire. Good: water with water / wood / earth / iron, earth with earth / iron / fire / wood, wood with wood, gold with any other. Mixed: water + fire. Needs care: wood + fire, fire + fire, fire + iron, iron + iron. Not in the text: wood + iron, gold + gold (no effect on the result) | sanook.com/horoscope/229037 (quoting ตำราพรหมชาติ) |
| BaZi: Day Masters | Five-element generating (木→火→土→金→水) and controlling (木→土→水→火→金) cycles; five stem combinations 甲己 土, 乙庚 金, 丙辛 水, 丁壬 木, 戊癸 火; stem clashes 甲庚 乙辛 丙壬 丁癸 | en.wikipedia Wuxing; zh.wikipedia 天干 |
| BaZi: branches | Day branch (spouse palace) and year branch: 六合, 三合, 三会, 六冲, 刑 (寅巳申, 丑戌未, 子卯, self 辰午酉亥), 六害, 破 | zh.wikipedia 地支; masterseanchan.com/bazi-branch-harms. Reading the day branch as the spouse palace: masterseanchan.com/blog/how-to-know-bazi-compatibility (practitioner, not classical) |
| Vedic: Ashtakoota | Moon nakshatra and rashi (sidereal, Lahiri). Varna 1 (by element of the sign), Vashya 2 (Astroyogi / Steve Hora matrix; Sagittarius and Capricorn split at 15°), Tara 3 (counted both ways, remainders 3/5/7 unfavourable, 1.5 each), Yoni 4 (derived from the classical rule, §3a), Graha Maitri 5 (computed from Parashara friendships, §3b), Gana 6 (bride-row matrix of saravali.de, CC BY-SA 4.0, §3c), Bhakoot 7 (2/12, 5/9, 6/8 = 0), Nadi 8 (same = 0). Bhakoot cancellation (same or friendly lords) and the Nadi exceptions (same sign other nakshatra, same nakshatra other sign) are reported as notes; the raw score never changes | dekhopanchang.com/learn/matching; hindutone.com/astrology/kundli-matching-ashtakoota-guna-milan-36-gunas; astroyogi.com/blog/vasya-koota-in-kundli-matching.aspx; stevehora.substack.com/p/marriage-compatibility; onlinejyotish.com yoni-kootam; en.wikipedia Synastry (36 points). Golden cases: hindutone's Rohini–Pushya breakdown (5 of 8 kootas published, all reproduced; total 26); melooha.com's Rohini–Swati example (published 16.5 under other variants; 14.5 with our tables, difference documented) |
| Vedic: order | The tradition counts the bride first (Varna, Vashya, Gana are asymmetric). The page asks no gender: it computes both orders, shows both totals when they differ, and uses their mean for the category view (decision recorded in `docs/COMPAT-RESEARCH.md` §7) | — |
| Western synastry | Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn of one chart against the other (Jupiter–Saturn pairs skipped as generational). Conjunction, sextile, square, trine, opposition; orb 8° with the Sun or Moon, 6° otherwise, 4° for the sextile; tighter aspects weigh more; Moon contacts at half weight without a birth time | en.wikipedia "Astrological aspect" (orbs credited to Liz Greene / Astrodienst); astrotheme.com/astrology_aspects.php; astrolearn.com/?p=14849 (synastry caps); kerykeion.net synastry guide (which pairs matter most) |


### 3a. Yoni (4 points): how every cell is derived (review round 1, D1)

Sources, both read on 2026-11-16:
- onlinejyotish.com, "Yoni Kootam": https://www.onlinejyotish.com/articles/marriage-matching/english/yoni-kootam.php . Gives
  the animal of each nakshatra, the point scale (same Yoni 4, friendly 3, neutral 2, hostile 1, Mahavaira 0) and the seven
  Mahavaira (sworn-enemy) pairs: Horse–Buffalo, Elephant–Lion, Sheep–Monkey, Serpent–Mongoose, Dog–Deer, Cat–Mouse, Cow–Tiger.
  It lists no friendly, neutral or hostile pairs ("vary slightly among commentaries").
- aaps.space, "Yoni matching and sexual compatibility": https://aaps.space/blog/yoni-matching-and-sexual-compatibility/ .
  Lists 18 friendly pairs; with Sheep and Goat as one Yoni (as in the onlinejyotish list) these are 15 distinct pairs:
  Horse–Serpent, Horse–Deer, Horse–Monkey, Elephant–Sheep, Elephant–Serpent, Elephant–Buffalo, Elephant–Monkey, Sheep–Cow,
  Sheep–Buffalo, Sheep–Mongoose, Cat–Deer, Cat–Monkey, Cow–Buffalo, Cow–Deer, Monkey–Mongoose. Its enemy list adds
  Goat–Monkey (= Sheep–Monkey, already Mahavaira). The page is "All Rights Reserved"; we use only the facts (which pairs are
  friendly), not its text.

Rule, applied to each of the 14 × 14 = 196 cells (code: `yoniScore` in `compat.js`; locked test D1 checks every cell):
1. the same animal: 4 (14 cells);
2. a Mahavaira pair (onlinejyotish.com): 0 (7 pairs, 14 cells);
3. a friendly pair (aaps.space): 3 (15 pairs, 30 cells);
4. every other pair: 2 (neutral), 138 cells. Neither source lists hostile (1-point) pairs, so no cell scores 1. A school with a
   published hostile list would score some of these 1; we state the difference rather than guess.

Effect against the first build: Rohini–Swati (Serpent–Buffalo) Yoni 1 → 2, total 13.5 → 14.5 (melooha.com also publishes Yoni 2
for this pair); Ashwini–Jyeshtha (Horse–Deer) 1 → 3, total 11 → 13 (aaps.space lists Horse–Deer as friendly). The locked golden
cases were corrected with the documented re-lock (3) in `evals-locks/fortune-compat.sha256`.

### 3b. Graha Maitri (5 points)

Computed, not tabulated: Parashara's natural friendships (friends Sun: Moon, Mars, Jupiter; Moon: Sun, Mercury; Mars: Sun, Moon,
Jupiter; Mercury: Sun, Venus; Jupiter: Sun, Moon, Mars; Venus: Mercury, Saturn; Saturn: Mercury, Venus. Enemies Sun: Venus,
Saturn; Mars: Mercury; Mercury: Moon; Jupiter: Mercury, Venus; Venus: Sun, Moon; Saturn: Sun, Moon, Mars; the rest neutral), as
given on hindutone.com and dekhopanchang.com, with the scale friend+friend 5, friend+neutral 4, neutral+neutral 3,
friend+enemy 1, neutral+enemy 0.5, enemy+enemy 0, same lord 5 (`maitriScore` in `compat.js`).

### 3c. Gana (6 points): credit and an open licence question

The bride-row Gana matrix (Deva row 6 / 6 / 0, Manushya row 5 / 6 / 0, Rakshasa row 1 / 0 / 6) is the one published by
**saravali.de (Saravali, licence CC BY-SA 4.0)**. Credit: "Gana matrix after saravali.de, CC BY-SA 4.0". **Open question for the
owner / legal (raised 2026-11-16):** whether using a CC BY-SA 4.0 table (nine numbers) in a commercial product brings
share-alike duties, or whether such traditional scoring facts are not protected. Until answered, the alternative with no
licence question is the symmetric rule published by dekhopanchang.com (same 6, Deva–Manushya 5, Manushya–Rakshasa 1,
Deva–Rakshasa 0); switching changes some golden cases and needs a documented re-lock.

Every score on the page is labelled: the Vedic total is the tradition's own 36-point score; the Thai, BaZi and Western
figures are LENSIQ guide figures combined from the listed relations and say so next to the number. A score is always shown
inside its method's detail, never alone (locked tests S and R1).

## 4. Credits

- astronomy-engine © Don Cross, MIT (`vendor/astronomy-engine/LICENSE`).
- Category icons and the wheel: drawn for LENSIQ (inline SVG paths in `compat-kb.js`), MIT with the rest of the code.
- All reading text written for LENSIQ in Thai, English and Chinese; nothing copied from the sources above.
