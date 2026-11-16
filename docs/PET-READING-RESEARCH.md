# Pet face reading (dogs and cats): research notes

Status: research only, 2026-11-16. Feeds the Fortune-category "Pet face reading" page.
Honest line for the page: "adapted from face-reading tradition, not a classical text" /
"ดัดแปลงจากความเชื่อเรื่องลักษณะสัตว์ ไม่ใช่ตำราดั้งเดิม" / "改编自面相传统，并非古典原文".

Source strength labels used below:
- **[A]** institution or scholarly (library, museum, university, peer-reviewed journal, government site)
- **[B]** reputable media (Silpa-Mag / ศิลปวัฒนธรรม, Daily News, Thai PBS, Bangkok Biznews, Cabinet magazine)
- **[C]** weak: web forum, blog, social post, brand content marketing. Usable only to see what people repeat, never as
  the sole basis for a claim.

Hard content rules carried into every section: no health, illness, lifespan or death; nothing that replaces a vet; no
reading of the human owner from the pet photo; no lottery numbers; no fear-selling; only positive kinds used.

---

## 1. What pet owners enjoy sharing

### 1.1 Themes seen on the web

- **Pet sun-sign horoscopes are mainstream engagement content.** Large pet brands, insurers and vet chains publish
  them every year (Chewy, Trupanion, VCA Hospitals, 24PetWatch, Pawp, Catster, Old Farmer's Almanac). They are all
  framed as fun, not science. [B/C: brand content]
  - Chewy dog zodiac guide (uses a named astrologer): https://www.chewy.com/education/dog/general/dog-zodiac-signs-what-your-dogs-astrology-signs-says-about-their-personality
  - VCA Hospitals: https://vcahospitals.com/resources/lifestyle/what-does-your-pet-s-sign-say-about-them
  - Almanac (explicitly says it is for fun): https://www.almanac.com/content/pet-zodiac-signs
  - 24PetWatch cat 2025: https://www.24petwatch.com/blog/cat-zodiac-signs-2025
  - Pawp cat signs: https://pawp.com/what-your-cats-zodiac-sign-says-about-their-personality/
  - Catster guide: https://www.catster.com/guides/cat-zodiac-signs/
- **What the content actually contains** (paraphrased): a short personality sketch per sign (e.g. Leo pets as bold,
  attention-loving, "tail up when guests arrive"), what toys or routines the pet likes, and owner-pet
  compatibility ("are you and your cat compatible?"). Behaviour cues the owner can recognise are the hook.
  - Kinship compatibility: https://kinship.com/cat-lifestyle/are-you-and-your-cat-compatible-zodiac
  - Cuteness, toys by sign: https://www.cuteness.com/1966969/best-toys-cats-based-on-zodiac-sign
  - Yahoo/Malaysia, sign + compatibility: https://malaysia.news.yahoo.com/pets-zodiac-sign-says-personality-190000566.html
- **Dedicated pet-astrology apps exist and monetise with subscriptions**: Pawsigns (free daily pet horoscope, paid
  birth chart and monthly plan), AstroAnimal (annual plan with trial), Horosco-Pet. [C: app store listings]
  - https://apps.apple.com/ph/app/pawsigns/id6450876574
  - https://apps.apple.com/us/app/id6755437345
- **Thai market: "สายมู" pet content is popular**: lists of lucky dog/cat traits on Lemon8, insurers and news sites
  (e.g. Rabbit Care, Thansettakij). Format is a numbered list of traits -> luck, usually with cute photos; shareable.
  [C]
  - https://rabbitcare.com/blog/lifestyle/type-dog-cat-increase-the-luck
  - https://www.thansettakij.com/lifestyle/638503
  - https://www.lemon8-app.com/@petkanong/7533131240728248850?region=us
- **Thai pet-colour by owner's birth day** posts also circulate (pet colour that "boosts" the owner's luck). [C]
  https://www.lemon8-app.com/@fromtheoceandepths/7586519854211957268?region=th
  Note: we do NOT read the owner from the pet photo; a compatibility line may use the owner's own entered birth day
  only, never the photo.

### 1.2 Reddit (learning only, not an authority)

Searches restricted to reddit.com returned no indexable threads on pet astrology in this session; one aggregator of
Reddit astrology-app mentions covers human apps only. Signals we could see second-hand:
- People post "my pet is so typical for its sign" moments, i.e. they enjoy matching a reading to a behaviour they
  already know (r/Astrologymemes surfaced a Gemini-cat meme in search snippets).
- Human astrology-app reviews collected from Reddit complain about paywalls and generic text.
  - https://gummysearch.com/tools/best-products/astrology-apps/
  - https://unstar.app/blog/co-star-sanctuary-pattern-nebula-stellium-astrology-apps-ranked-2026 [C]
No Reddit text is copied. Treat as weak signal; worth a manual look by the owner before launch if desired.

### 1.3 What users like (design implications)

1. A reading that names **observable behaviour** ("likes high places", "greets you at the door"): users confirm it.
2. **Owner-pet compatibility** line: very shareable.
3. **A share card** with the pet's photo, a title (e.g. "แมวนิลจักร: ผู้นำโชคเงินทอง"), lucky colour/day.
4. Light, warm, funny tone.

### 1.4 What users dislike

- Generic text that could fit any pet (copy-paste per sign). Mitigate: combine 3+ inputs (coat kind, eyes, ears,
  tail, temperament cue, birth day) so text varies.
- Paywalls on the basic reading (seen in human-app reviews above). Keep the pet reading free.
- Gloom or warnings (none in our design).
- Health or "your pet needs X" claims: pet sites that mix astrology with health advice blur the line with vet care.
  We exclude all health content.
- Scientific overclaiming: even the brand sites add "for fun"; we say so plainly.

---

## 2. Thai cat folklore: ตำราแมว / ตำราดูลักษณะแมว (สมุดข่อย / สมุดไทย)

### 2.1 The treatise

- **What it is**: ตำราแมว (Tamra Maew, "Cat-Book Poems") is a class of สมุดข่อย/สมุดไทย folding-book manuscripts with
  illustrated cats and Thai verse. Traditionally said to originate in the Ayutthaya period; most surviving copies are
  19th century. Usually 17 auspicious kinds (แมวให้คุณ / แมวมงคล); some copies add 6 inauspicious kinds
  (แมวให้โทษ); some list up to 22 good kinds.
  - British Library copy Or 16797 and SEALG blog (Jana Igunma, 2013), cited via Wikipedia: https://en.wikipedia.org/wiki/Treatise_on_Cats [A via B]
  - Library of Congress copy (19th c.), summarised by Public Domain Review: https://publicdomainreview.org/collection/tamra-maew/ [A/B]
  - Library of Congress item: https://www.loc.gov/item/2021668043 [A] (403 to automated fetch; cited via the above)
  - Cabinet magazine (Martin Clutterbuck, 2008): breed descriptions from an early-19th-century Tamra Maew in the
    **National Library of Thailand**, captions from a mid-19th-century copy: https://cabinetmagazine.org/issues/30/clutterbuck.php [B, author also wrote "Siamese Cats: Legends and Reality", White Lotus 2004]
  - Daily News (15 Aug 2023), quoting National Library of Thailand staff (ดร.ประสิทธิ์ชัย เลิศรัตนเคหกาล, วัฒนา
    เพื่องชื่น): https://www.dailynews.co.th/articles/2620459/ [B]
  - Thai PBS on the ตำราดูลักษณะแมว of วัดอนงคาราม (black cats recorded as good): https://www.thaipbs.or.th/now/content/246 [B]
  - Bangkok Biznews (manuscript in National Library, Bangkok): https://www.bangkokbiznews.com/lifestyle/932454 [B]
- **Dating disagreement**: some media say "พ.ศ. 1893–2310" (Ayutthaya span); scholars say surviving copies are
  post-1767, mostly 19th c. On the page say "เชื่อกันว่าสืบมาแต่สมัยอยุธยา ฉบับที่เหลือส่วนใหญ่คัดลอกในสมัยรัตนโกสินทร์".
- **Names vary by copy** (Daily News notes small differences between sources). Spellings below follow the common list
  in Daily News / ONEP; alternates in brackets.

### 2.2 The 17 auspicious cats (แมวมงคล 17 ชนิด)

Meaning column = the benefit as reported by the cited source. Where only a weak source states the benefit, it is
marked [C]. Coat descriptions paraphrased.

| # | Thai name | Coat / look | Stated auspicious meaning | Sources |
|---|---|---|---|---|
| 1 | นิลรัตน์ (Ninlarat, "Dark Sapphire") | All black incl. claws, tongue, teeth, eyes; long tail curving back toward head | progress, prosperity, protection from harm [C]; one of the black cats recorded as good [B] | Cabinet; Thai PBS; postjung [C] |
| 2 | วิลาศ (Wilat, "Beauty") | Black body; white ears, tail and four legs; green eyes | rise to high position, much wealth (เป็นใหญ่เป็นโต มีทรัพย์มาก) [C] | Cabinet (coat); gotoknow/postjung [C] |
| 3 | ศุภลักษณ์ / ทองแดง (Suphalak, "Copper") | Even copper-brown coat, bright yellow/gold eyes | safe from danger (แคล้วคลาดจากภยันตราย) [B]; "against all evil, ill turns to content" [B]; rank/honour [C] | Daily News; Cabinet; postjung [C] |
| 4 | เก้าแต้ม (Kao Taem, "Nine Points") | White with nine black spots (head, neck, legs, rump) | success in trade (ค้าขายรุ่งเรือง) [C] | Cabinet (coat); postjung/gotoknow [C] |
| 5 | มาเลศ / ดอกเลา (Maalet, "Lao Flower") | Smooth grey coat, roots grey, tips silvery; eyes like dew on a lotus leaf | good fortune and blessing [C] | Daily News (coat); Cabinet; postjung [C] |
| 6 | แซมเศวต (Saem Sawet) | Black with white hairs mixed in, short thin fur, slender; firefly-bright eyes | loyal and grateful nature [C] | Daily News (coat); Cabinet; postjung [C] |
| 7 | รัตนกัมพล (Ratanakamphon, "Jewelled Cloth") | White like a conch shell, dark band round the chest/body; yellow eyes | rank and respect (ยศถาบรรดาศักดิ์ มีเดชานุภาพ) [C] | Cabinet (coat); search summary of gotoknow [C] |
| 8 | วิเชียรมาศ (Wichien Maat, "Moon Diamond", Siamese) | Pale cream with dark points on face, ears, tail, paws (8/9 points); blue eyes | fortune / wealth (โชคลาภ) [B]; increased property [C] | Bangkok Biznews; Cabinet; postjung [C] |
| 9 | นิลจักร (Ninlajak, "Sapphire Circle") | Solid black with a white ring round the neck like a collar | grace (Cabinet caption) [B]; great wealth [C] | Daily News (coat); Cabinet |
| 10 | มุลิลา (Mulila) | Black body; white ears; yellow eyes | suits learning (favoured by monks) [C] | Cabinet (coat); postjung [C] |
| 11 | กรอบแว่น / อานม้า (Krop Waen "Spectacle Frame" / Aan Maa "Saddle") | White with black round the eyes and a saddle patch on the back | honour, much value [C] | Cabinet (coat); postjung [C] |
| 12 | ปัดเศวต / ปัดตลอด (Pat Sawet, "White Line") | Black with a white line from nose to tail tip; topaz-yellow eyes | prosperity and rank [C] | Cabinet (coat); postjung [C] |
| 13 | กระจอก (Krajork, "Sparrow") | Black, white around the mouth; yellow eyes | land and money; rise in status [C] | Cabinet (coat); postjung [C] |
| 14 | สิงหเสพย์ (Singha Sep, "Lion") | Black; white at mouth, neck and nose tip; lion-like walk | good fortune [C] | Cabinet (coat); postjung [C] |
| 15 | การเวก (Karawek) | Black body, white nose, golden eyes | rank and wealth [C] (source adds a "within seven months" timing: do NOT use, it is a dated promise) | postjung [C] |
| 16 | จตุบท (Jatubot) | Black with four white paws; yellow eyes | benefits the owner [C] (source adds "only for nobles": drop that clause) | Daily News (coat); postjung [C] |
| 17 | โกญจา (Konja, ดำปลอด / ดำมงคล) | Fine smooth all-black coat, yellow-green eyes, tapered tail, lion-like gait | "should be sought and preserved", honour and wealth [B]; wealth, career, favour of superiors [B] | Thai PBS; Bangkok Biznews |

Related modern breeds (Thai breed names, often grouped with the auspicious cats in media):
- **สีสวาด / โคราช (Si-Sawat, Korat)**: silver-blue like สวาด seeds, green eyes; luck and blessing; traditionally
  given in pairs as a wedding gift for a happy marriage; used in แห่นางแมว rain ritual. [B] Bangkok Biznews;
  Thailand NOW https://www.thailandnow.in.th/?p=11852 [B/C]. Some lists equate it with มาเลศ/ดอกเลา [C].
- **ขาวมณี / ขาวปลอด (Khao Manee)**: pure white, eyes blue, gold, or odd-eyed; wealth and luck [B Bangkok Biznews].
  Bangkok Biznews says it is not in the old manuscript and links it to Rattanakosin-period murals (วัดทองนพคุณ);
  others say "Khao Plort" in the poems was renamed Khao Manee under King Chulalongkorn
  (https://en.wikipedia.org/wiki/Khao_Manee) [B]. Present as "เชื่อกันว่า".
  **EXCLUDED**: Thailand NOW says Khao Manee was believed to bring longevity: not used.

Survival note (do not over-claim): media say only 4-5 of the 17 are still seen today (วิเชียรมาศ, ศุภลักษณ์, โกญจา,
สีสวาด/โคราช, sometimes ขาวมณี; แซมเศวต reportedly rediscovered). Owners of mixed cats should still get a reading:
we match the nearest coat pattern ("ลายคล้ายแมวนิลจักร"), never "your cat is not auspicious".

### 2.3 Inauspicious kinds (exist in the treatise; NOT USED)

The treatise lists six แมวให้โทษ, e.g. ทุพลเพศ, ลายเสือ (พรรณพยัคฆ์), ปีศาจ, หิณโทษ, กอบเพลิง, เหน็บเสนียด
(names per postjung [C]; Public Domain Review [A/B] confirms the category: tiger-striped, red-eyed, etc.). Several
mention kitten death or harm to the owner. **All excluded.** A tabby/striped cat must never be labelled ลายเสือ /
inauspicious; map it to a positive reading instead.

Also EXCLUDED from cat lore: the belief that a loved one's soul passes into a Siamese cat after death (Thailand NOW),
and the custom of keeping an auspicious cat's bones after death (Silpa-Mag summary). Death-related.

---

## 3. Thai dog beliefs (ลักษณะสุนัขมงคล)

**Source quality is thin.** There is no dog equivalent of the illustrated ตำราแมว manuscripts that we could find.
The one traceable printed source is a section of ตำราพรหมชาติ (popular household almanac), reported by Silpa-Mag.
Almost everything else online is modern folk/"สายมู" content. Matichon notes that dog luck is read from body features
and posture (โหงวเฮ้ง), not breed, unlike cats.

Primary traceable source:
- Silpa-Mag, "สุนัขนำโชค ตามตำราพรหมชาติ เป็นอย่างไร?" (first online 1 Jan 2018; reposted LINE TODAY 10 Feb 2025),
  citing *พรหมชาติ ฉบับราษฎร์ประจำบ้านดูด้วยตนเอง* (อ.เทพย์ สาริกบุตร์, อ.บาง เสมเสริมสุข, อ.อุระคินทร์ วิริยะบูรณะ;
  ส.ธรรมภักดี, 2521). https://today.line.me/th/v3/article/qGXE72 [B]; original https://www.silpa-mag.com/?p=11954 [B] (403 to fetch)

| # | Trait (TH) | Trait (EN) | Stated meaning | Source |
|---|---|---|---|---|
| 1 | ตัวสีขาว เท้าทั้งสี่ด่างดำ | white dog, black-spotted feet | much money (มีเงินทองมากมาย) | พรหมชาติ via Silpa-Mag [B] |
| 2 | หางดอก (ปลายหางขาว) เล็บขาวทุกเล็บ | white tail tip and all-white claws | good to keep (เลี้ยงไว้จะดี) | same [B] |
| 3 | ขนเหลือง เท้าขาวทั้งสี่ | yellow/golden coat, four white feet | riches | same [B] |
| 4 | ปากขาว ขนสวย | white muzzle, fine coat | much wealth | same [B] |
| 5 | ขนขาวแดงปนกัน | mixed white and red-brown coat | guards against black magic (คุณไสย) | same [B]; reword as "คอยปกป้องบ้าน / guardian of the home" |
| 6 | เล็บ 20 เล็บ | 20 claws (dewclaws on all feet) | shows where wealth lies | same [B] |
| 7 | เล็บ 19 เล็บ ตัวสวยไม่มีตำหนิ | 19 claws, handsome and unblemished | brings wealth | same [B] |

Notes:
- The same source says dogs without these signs "bring no benefit" and asks people not to abandon dogs at temples:
  we drop the first part and keep the kindness message.
- Claw counting needs a physical check; offer it as an optional "fun fact" input, not a photo read.
- **Not found in any reputable source**: "หมาแดง", "หมาดำหางขาว", "หมาสี่ตา", tongue spots (ลิ้นดำ/ลิ้นด่าง)
  as luck signs. These circulate as modern folk content only (Lemon8, blogs). Black tongue spots are ordinary
  pigmentation (Hepper https://articles.hepper.com/why-do-dogs-have-black-spots-on-their-tongue/ [C]); avoid any
  physiological claim. If used at all, label "ความเชื่อสมัยใหม่ / modern folk belief" and keep it positive.
- Modern folk lists also mention golden fluffy coat, upward-curled tail, amber eyes (Lemon8 infographic, via
  Matichon search summary) [C]: https://www.matichon.co.th/lifestyle/news_2262596 (403 to fetch).
- General Thai belief: dogs symbolise loyalty and bring happiness to a family that cares for them well
  (Thansettakij) [C/B].

---

## 4. Chinese and general folklore usable gently

### 4.1 Chinese zodiac year of the pet's birth (生肖)

- 12 animals on a 12-year cycle tied to the lunar year; a pet born in January or early February may belong to the
  previous year (year starts at Chinese New Year). Five elements (金木水火土) add a second layer.
  - https://www.chinahighlights.com/travelguide/chinese-zodiac/dog.htm [B]
  - https://www.travelchinaguide.com/intro/social_customs/zodiac/dog.htm [B]
- Year-of-the-Dog traits commonly given: loyal, honest, brave, responsible: a natural fit for dog readings.
  Found Animals links the sign's traits to why dogs make good pets: https://foundanimals.org/happy-chinese-new-year-learn-year-dog/ [C]
- The cat is not in the Chinese zodiac; **Vietnam uses the Cat (Mèo) in place of the Rabbit** (likely from 卯
  sounding like mèo). Cat-year traits: attentive, compassionate, sensitive; tranquil, intelligent, artistic.
  - https://en.wikipedia.org/wiki/Vietnamese_zodiac [B]
  - https://www.scmp.com/news/asia/southeast-asia/article/3207357/why-vietnam-celebrating-year-cat-not-rabbit [B]
  - https://vietcetera.com/en/tet-holiday-the-age-old-tradition-explained [B]
  Use as "ปีเกิดตามนักษัตร" for the pet; for a cat born in a Rabbit year, an optional "Vietnamese tradition: year of
  the cat" fun line.
- Implementation: reuse the site's existing lunar-new-year boundary logic (zodiac/bazi pages) rather than a
  Gregorian-year shortcut.

### 4.2 Chinese sayings

- 狗来富 ("a dog that comes brings wealth") from the folk saying 猪来穷，狗来富，猫来…; explained as dogs guard the home
  and their bark 汪汪 sounds like 旺旺 (prosperous). Sources are short-video/news platforms [C]; the versions of the
  cat line differ and some are negative: use only 狗来富 / "旺旺 = prosperity" as a light line.
  https://www.toutiao.com/zixun/7510779151872182335/ [C]
- Common pet names 旺财 (prosperous wealth) and 来福 (fortune comes) reflect this (general knowledge; cite as
  "common naming custom", no claim).

### 4.3 Colour meanings

- Chinese: red = joy, luck, prosperity; gold/yellow = wealth, status; green = growth, renewal (jade = protection).
  White is associated with mourning in Chinese tradition: do NOT use white as a Chinese "lucky colour"; describe a
  white pet with Thai meanings instead (ขาวมณี = purity, wealth).
  - https://www.chinahighlights.com/travelguide/culture/lucky-numbers-and-colors-in-chinese-culture.htm [B]
  - https://www.thechairmansbao.com/blog/lucky-unlucky-colors-in-china/ [C]
- Thai day colours (สีประจำวันเกิด): อาทิตย์ แดง, จันทร์ เหลือง, อังคาร ชมพู, พุธ เขียว, พฤหัสบดี ส้ม, ศุกร์ ฟ้า,
  เสาร์ ม่วง. Thai-specific tradition with Hindu-myth origin stories; Thairath distinguishes "สีประจำวันเกิด" from
  "สีมงคลประจำวัน". Use the pet's birth weekday for "สีประจำตัว" and the existing site luckycolor logic for the
  lucky-colour/day line.
  - https://www.silpa-mag.com/culture/article_133488 [B]
  - https://www.thairath.co.th/horoscope/belief/2709739 [B]
  - https://www.bangkokbiznews.com/lifestyle/1020461 [B]

### 4.4 Western sun signs

Pet sun signs by birth date (same date ranges as people). Purely entertainment, as the brand sites say themselves
(Almanac, Catster). Cheap to add, recognisable to EN users. Sources in 1.1.

---

## 5. How we adapt it

1. **Positioning.** "ดัดแปลงจากความเชื่อเรื่องลักษณะแมวในตำราแมวไทย ความเชื่อเรื่องลักษณะสุนัขในตำราพรหมชาติ และ
   นักษัตรจีน เพื่อความสนุก ไม่ใช่ตำราดั้งเดิม" + "according to belief, please use your own judgement". Never claim
   the reading is from a classical text, and never say a pet IS one of the 17 kinds: say "ลักษณะคล้าย…".
2. **Inputs** (owner picks; no AI identity or health inference): species; coat colour/pattern (mapped to the nearest
   auspicious kind); eye colour; ear shape; size; tail; temperament cue chips ("ชอบที่สูง", "ทักทายที่ประตู"); birth
   date (or "ไม่ทราบ", then skip zodiac). The photo is only decoration for the share card and stays on the device.
3. **Outputs**: personality, what the pet likes, how it bonds, lucky colour and day, owner-pet compatibility (from the
   owner's own entered birth weekday/zodiac only), share card.
4. **Positive framing only.** Every coat maps to some positive reading; tabby/striped, red eyes, etc. are never
   labelled with the inauspicious kinds. No "this pet is unlucky", no "do X or bad luck".
5. **Translate old benefits gently**: "ยศถาบรรดาศักดิ์" -> "ช่วยเสริมเสน่ห์และความน่าเชื่อถือในบ้าน"; "คุณไสย" ->
   "เจ้าหมาผู้พิทักษ์บ้าน"; wealth claims phrased as "ตามความเชื่อเป็นแมว/หมานำโชคเรื่องทรัพย์", never a promise.
6. **No money/lottery**: no numbers derived from the pet (no เลขเด็ด from claw counts, spots or birth date). The "9
   spots" / "19-20 claws" items are shown as folklore trivia, not numbers.
7. **No purchase coupling, no paywall on the basic reading.**

### Safe / excluded summary

| Item | Status | Why |
|---|---|---|
| 17 auspicious cat kinds (coat -> wealth, honour, protection, trade, learning, loyalty) | SAFE | positive, sourced |
| Konja "should be sought and preserved", honour and wealth | SAFE | [B] |
| Suphalak "safe from danger" | SAFE, reword as "นำความราบรื่น/แคล้วคลาด" (no harm talk) | avoid danger imagery |
| Korat pair = happy marriage | SAFE (for compatibility line) | [B] |
| พรหมชาติ dog traits 1-4, 6-7 (wealth, good to keep) | SAFE | [B] |
| Dog trait 5 (anti black magic) | SAFE only reworded as "home guardian" | no magic claims |
| Year of Dog / Vietnamese Cat year traits | SAFE | |
| 狗来富 / 旺旺 | SAFE (light) | |
| Karawek "rank within seven months" | EXCLUDED (timing) | dated promise |
| Jatubot "only for nobles" clause | EXCLUDED | exclusionary |
| Khao Manee brings longevity | EXCLUDED | lifespan |
| Siamese cat carries a loved one's soul after death | EXCLUDED | death |
| Keeping cat bones after death | EXCLUDED | death |
| 6 inauspicious cats (kitten death, harm to owner) | EXCLUDED | negative, death |
| "dogs without the signs give no benefit" | EXCLUDED | negative |
| 猫来… negative versions; white = mourning | EXCLUDED | negative |
| Tongue spots, หมาแดง, หมาดำหางขาว as luck | NOT SOURCED: skip, or label modern folk belief | thin sources |
| Any "good health" benefit (Public Domain Review mentions "good health" as a hoped-for benefit) | EXCLUDED | health |

---

## URLs (all accessed 2026-11-16)

Thai cat treatise
- https://en.wikipedia.org/wiki/Treatise_on_Cats
- https://th.wikipedia.org/wiki/ตำราแมว
- https://publicdomainreview.org/collection/tamra-maew/
- https://www.loc.gov/item/2021668043 (403 to automated fetch)
- https://cabinetmagazine.org/issues/30/clutterbuck.php
- https://www.dailynews.co.th/articles/2620459/
- https://www.thaipbs.or.th/now/content/246
- https://www.bangkokbiznews.com/lifestyle/932454
- https://www.silpa-mag.com/?p=160290 (403 to automated fetch; seen in search summary)
- https://www.silpa-mag.com/?p=106053 (search result only)
- https://www.onep.go.th/wp-content/uploads/2025/09/ne_11.pdf (list of 17 names per search summary; file too large to fetch)
- https://en.wikipedia.org/wiki/Khao_Manee
- https://www.thailandnow.in.th/?p=11852
- https://board.postjung.com/767241 [C]
- https://www.gotoknow.org/posts/427135 [C] (403 to fetch)
- https://www.gotoknow.org/posts/545170 [C] (search result only)

Thai dog beliefs
- https://today.line.me/th/v3/article/qGXE72
- https://www.silpa-mag.com/?p=11954 (403 to fetch)
- https://www.matichon.co.th/lifestyle/news_2262596 (403 to fetch; search summary)
- https://rabbitcare.com/blog/lifestyle/type-dog-cat-increase-the-luck [C]
- https://www.thansettakij.com/lifestyle/638503
- https://www.lemon8-app.com/@petkanong/7533131240728248850?region=us [C]
- https://www.lemon8-app.com/@fromtheoceandepths/7586519854211957268?region=th [C]
- https://articles.hepper.com/why-do-dogs-have-black-spots-on-their-tongue/ [C]

Chinese / general
- https://www.chinahighlights.com/travelguide/chinese-zodiac/dog.htm
- https://www.travelchinaguide.com/intro/social_customs/zodiac/dog.htm
- https://foundanimals.org/happy-chinese-new-year-learn-year-dog/
- https://en.wikipedia.org/wiki/Vietnamese_zodiac
- https://www.scmp.com/news/asia/southeast-asia/article/3207357/why-vietnam-celebrating-year-cat-not-rabbit
- https://vietcetera.com/en/tet-holiday-the-age-old-tradition-explained
- https://www.toutiao.com/zixun/7510779151872182335/ [C]
- https://www.chinahighlights.com/travelguide/culture/lucky-numbers-and-colors-in-chinese-culture.htm
- https://www.thechairmansbao.com/blog/lucky-unlucky-colors-in-china/ [C]
- https://www.silpa-mag.com/culture/article_133488
- https://www.thairath.co.th/horoscope/belief/2709739
- https://www.bangkokbiznews.com/lifestyle/1020461

Pet-owner content and apps
- https://www.chewy.com/education/dog/general/dog-zodiac-signs-what-your-dogs-astrology-signs-says-about-their-personality
- https://vcahospitals.com/resources/lifestyle/what-does-your-pet-s-sign-say-about-them
- https://www.almanac.com/content/pet-zodiac-signs
- https://www.24petwatch.com/blog/cat-zodiac-signs-2025
- https://pawp.com/what-your-cats-zodiac-sign-says-about-their-personality/
- https://www.catster.com/guides/cat-zodiac-signs/
- https://kinship.com/cat-lifestyle/are-you-and-your-cat-compatible-zodiac
- https://www.cuteness.com/1966969/best-toys-cats-based-on-zodiac-sign
- https://malaysia.news.yahoo.com/pets-zodiac-sign-says-personality-190000566.html
- https://apps.apple.com/ph/app/pawsigns/id6450876574
- https://apps.apple.com/us/app/id6755437345
- https://gummysearch.com/tools/best-products/astrology-apps/
- https://unstar.app/blog/co-star-sanctuary-pattern-nebula-stellium-astrology-apps-ranked-2026 [C]
