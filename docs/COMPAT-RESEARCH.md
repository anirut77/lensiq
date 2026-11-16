# Compatibility (ดวงสมพงษ์): research notes

Owner order 2026-11-16, part A. Research done 2026-11-16 from the web and GitHub (helper agents, no browser). Reddit could
not be reached by the research tools (the search service refuses reddit.com), so the user-needs section uses secondary
sources that summarise Reddit and app-store comments, plus critical articles; it is marked as such. Reddit and forums are used
only to learn what users want, never as a source for a method, and nothing is copied. Libraries and licences:
`docs/COMPAT-SOURCES.md`.

## 1. What users want (secondary sources; not a method authority)

- **Explanations, not a bare percentage.** Apps that show "73 % compatible" with no reasons are the most common complaint
  (selfgazer.com/blog/why-co-star-gets-your-birth-chart-wrong; gummysearch.com astrology-app summaries of Reddit threads;
  unstar.app ranking, a competitor, read with care). Users ask for the strengths of the pairing, how a difference plays out in
  daily life, and practical advice.
- **Readings that feel personal.** Users of The Pattern and Co-Star say readings feel generic once compared across friends.
  Our answer: every line names the factor it comes from (birth day, year animal, koota, planet pair) and both people.
- **Less anxiety.** The 18-of-36 Guna convention and Manglik fear cause family anxiety; couples with low scores are often
  happy (lumenlabs "36 gun milan: what it can and can't tell you"; sites.google.com/view/pachangam low-score article;
  drprernakohli.in psychologist note; astromedha.in minimum-gunas page; outlookindia.com Mangal dosha interview). Our
  answer: no threshold, no verdict, parts and exceptions shown, a step for every point of care.
- **Different sites give different scores for the same pair.** Our answer: name the school and the table variant, show the
  raw score and any cancellation separately, and show where the four methods agree or differ.
- **Thai users** see compatibility as cultural and light; Thai articles add that communication matters more than the birth
  day (sanook.com/horoscope/330238). Pantip searches found nothing useful on topic.
- **Group and team compatibility** is asked for (teams, partners, households), but see §6 on work use.
- **The partner's data**: entering someone else's birth date is personal data; keep it on the device, store nothing, and
  ask for a "with their knowledge" statement (owner decision 2026-11-16 A5; legal packet L72).

## 2. Pitfalls we design against

1. Fatalistic verdicts ("incompatible", "do not marry", divorce or longevity predictions, Manglik spouse-longevity lore).
   Hard limits in CLAUDE.md; locked test H over 240 pairs and 24 groups in three languages.
2. Fear-based paid remedies for doshas (Kumbh Vivah, pujas sold as cancellation). No remedy is sold; cautions and their
   steps are always free (paid rule a); in crisis nothing paid shows.
3. A score shown alone. Every score sits inside its detail (locked tests S, R1).
4. Hiring or HR use (§6).
5. Gender assumptions: Ashtakoota assumes bride and groom. Thailand's marriage-equality law took effect in 2025; the page asks
   no gender and computes both orders (§7).
6. Calendar boundaries: the BaZi year changes at 立春 (about 4 February), the Thai นักษัตร at the Thai boundary used by
   `horoscope.js`, Wednesday night (Rahu) needs the birth time (18:00 cut-off), and the Thai day starts at sunrise
   (`horoscope.js` thaiBirthDay). Unknown birth time: the page says which parts may shift.
7. Copying AGPL code: PyJHora (AGPL-3.0) holds the most complete Ashtakoota tables; we re-entered the traditional tables by hand
   from non-AGPL sources and did not reuse its code (its North-Indian Tara function also looks inverted).

## 3. Vedic Ashtakoota (36 points), how it is scored

All eight kootas use the Moon's sidereal sign (rashi) and nakshatra (27 × 13°20′).

| Koota | Points | Rule (common profile) |
|---|---|---|
| Varna | 1 | Sign element: water Brahmin, fire Kshatriya, earth Vaishya, air Shudra. 1 if the groom's varna is the same or higher (hindutone.com; astromedha.in). Variant: PyJHora swaps Taurus and Gemini |
| Vashya | 2 | Groups: quadruped (Aries, Taurus, 2nd half Sagittarius, 1st half Capricorn), human (Gemini, Virgo, Libra, 1st half Sagittarius, Aquarius), water (Cancer, Pisces, 2nd half Capricorn), wild (Leo), insect (Scorpio). Matrix (bride rows C M J V K): [2,1,1,1.5,1] [1,2,1.5,0,1] [1,1.5,2,1,1] [0,0,0,2,0] [1,1,1,0,2] (astroyogi.com; stevehora.substack.com). Variant: Saravali matrix |
| Tara | 3 | Count from the bride's nakshatra to the groom's (inclusive), remainder mod 9 (0 = 9); 3, 5, 7 unfavourable; same the other way; 1.5 per favourable direction (dekhopanchang.com; hindutone.com) |
| Yoni | 4 | 14 animals per nakshatra; same 4, sworn enemies 0 (Horse–Buffalo, Elephant–Lion, Sheep–Monkey, Serpent–Mongoose, Dog–Deer, Cat–Rat, Cow–Tiger), others 1–3 by the standard matrix (onlinejyotish.com; kundli.muthu.co). Variant: Horse–Deer friendly in aaps.space |
| Graha Maitri | 5 | Lords of the Moon signs; Parashara natural friendships; friend+friend 5, friend+neutral 4, neutral+neutral 3, friend+enemy 1, neutral+enemy 0.5, enemy+enemy 0 (hindutone.com; dekhopanchang.com) |
| Gana | 6 | Deva / Manushya / Rakshasa per nakshatra; bride rows D [6,6,0], M [5,6,0], R [1,0,6] (saravali). Variant: symmetric |
| Bhakoot | 7 | Sign distance 2/12, 5/9, 6/8 = 0, otherwise 7. Cancellation when the lords are the same or friends (lists differ by school) |
| Nadi | 8 | Adi / Madhya / Antya per nakshatra; same Nadi 0, different 8. Exceptions (same sign other nakshatra, same nakshatra other sign, named pairs) differ by school |

Golden cases in the locked test (common profile): Rohini–Pushya 26 (hindutone.com publishes Tara 1.5, Bhakoot 7, Nadi 8,
Varna 1, Maitri 0.5; all reproduced), Rohini–Swati 13.5 (melooha.com shows 16.5 with other variants), Ashwini–Bharani 34,
Ashwini–Jyeshtha 11, plus single-koota examples from dekhopanchang.com. Mangal (Kuja) dosha is not part of the 36 points and
is not computed (fear-selling risk; it also needs a birth time and houses).

## 4. BaZi compatibility

- Five elements: generating Wood → Fire → Earth → Metal → Water → Wood; controlling Wood → Earth → Water → Fire → Metal →
  Wood (en.wikipedia Wuxing).
- Stem combinations 五合: 甲己 Earth, 乙庚 Metal, 丙辛 Water, 丁壬 Wood, 戊癸 Fire; stem clashes 甲庚, 乙辛, 丙壬, 丁癸 (zh.wikipedia 天干).
  Combining is not always transforming; we only say the two stems "draw each other in".
- Branch relations (zh.wikipedia 地支; masterseanchan.com): 六合 子丑 寅亥 卯戌 辰酉 巳申 午未; 三合 申子辰 亥卯未 寅午戌 巳酉丑;
  三会 亥子丑 寅卯辰 巳午未 申酉戌; 六冲 子午 丑未 寅申 卯酉 辰戌 巳亥; 刑 寅巳申, 丑戌未, 子卯, self 辰 午 酉 亥; 六害 子未 丑午 寅巳 卯辰 申亥 酉戌;
  破 子酉 午卯 巳申 寅亥 辰丑 戌未.
- Practitioners read the day branch as the spouse palace and compare the two Day Masters through the cycles; a clash is a
  matter of degree, not a verdict (masterseanchan.com; skillon.com BaZi love and marriage). We use the Day Masters, the day
  branches (home and daily life) and the year branches (family roots, long-term outlook, at 0.6 weight).

## 5. Thai compatibility (ดวงสมพงษ์)

- Planet numbers and elements: 1 Sunday fire, 2 Monday earth, 3 Tuesday wind, 4 Wednesday water, 5 Thursday earth, 6 Friday
  water, 7 Saturday fire, 8 Rahu (Wednesday night) wind (th.wikipedia โหราศาสตร์ไทย).
- Pairs: คู่มิตร 1-5, 2-4, 3-6, 7-8; คู่ศัตรู 1-3, 2-5, 4-8, 6-7; คู่สมพล 1-6, 2-8, 3-5, 4-7; คู่ธาตุ 1-7, 2-5, 3-8, 4-6
  (th.wikipedia; baankhunyai.com, อ.อรุณ ลำเพ็ญ). Monday–Thursday is both คู่ธาตุ and คู่ศัตรู; the page shows both. The popular
  weekday lists (MThai, Sanook) disagree about Wednesday; we follow the numbered table.
- Year animals: harmony / clash pairs (sanook.com/horoscope/240605) = Chinese 六合 / 六冲.
- Birth-year elements of ตำราพรหมชาติ (sanook.com/horoscope/229037): a six-element Thai scheme (water, earth, wood, iron, gold,
  fire) that differs from the Chinese five; good, mixed and "needs care" pairs as listed in `docs/COMPAT-SOURCES.md`.
- Not verified, so not used: คู่มรณะ and other named categories.

## 6. Western synastry

- Major (Ptolemaic) aspects 0°, 60°, 90°, 120°, 180° (en.wikipedia Astrological aspect). Synastry orbs have no standard:
  Astrotheme 10/8/6/6/4.5, Astrolearn caps 6/5/4.5/4/2.7, AstroAPI 5° for Sun/Moon conjunction and opposition. We use 8° with the
  Sun or Moon, 6° otherwise, 4° for the sextile, and weigh tighter aspects more.
- Pairs given most weight in relationship astrology (convention, not evidence): Sun–Moon, Moon–Moon, Venus–Mars, Sun–Venus,
  Moon–Venus, Mercury–Mercury, Saturn to personal planets (kerykeion.net; astrolearn.com).
- Evidence: Helgertz & Scott 2020 (*Genus*) found no link between astrological compatibility and marriage or divorce in Swedish
  register data. The page presents the method as belief only.

## 7. Decisions taken for the build (recorded for the owner; reversible)

1. **Moon engine**: the site's own Meeus Moon is within 0.72′ of astronomy-engine (measured), so the Vedic nakshatra does not
   need a new library; astronomy-engine is added only for the western planets and loaded on demand (§ COMPAT-SOURCES).
2. **Ashtakoota without gender**: both orders computed; both totals shown when they differ; their mean drives the category view.
   For relationships other than a couple, the page says the tradition was written for marriage matching.
3. **Free / paid split** (behind `LENSIQ_FORTUNE_PAID`, default off): free = overview (wheel, every point of care with its
   step, every method's score with its detail, the agreement view) + 2 categories (communication, values); paid = the other 5
   categories in full, the per-pair group report, the PDF. Paid rule a: no caution is ever paid, so every caution from all 7
   categories is in the free overview with a step. In the group mode, the map, roles and the 2 free categories are free.
4. **Agreement**: a category "agrees" only when at least two computed methods lean the same way and none differs; otherwise
   "differs", with each method's lean listed.
5. **Scores**: the Vedic score is the tradition's own; the other three are LENSIQ guide figures, labelled as such.
6. **Hiring and work use**: a one-line notice in group mode; nothing in the HR, education or exam categories links here.
   Background: firms in China have screened applicants by zodiac year (scmp.com 2024; sixthtone.com; livescience.com), and
   signs do not predict personality or job performance (Lu et al. 2020, JPSP, as summarised by humanresourcesonline.net and
   psychologytoday.com).
