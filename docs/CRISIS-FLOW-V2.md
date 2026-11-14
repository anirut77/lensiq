# Crisis flow v2: respond, support and keep the door open (owner decision 2026-11-13)

Replaces "hide and block" (support card instead of the reading; every `data-lq-remedy` block hidden). Rule text:
`CLAUDE.md` → Crisis flow. Launch item L63 (professional review of the wording). Status: **building on branch
`crisis-flow-v2`; not live.** Before deploy: fixed tests locked first, independent review on a fresh set, five Thai
example screens approved by the owner.

## 1. What the user sees

**Hard net** (`LQFortuneCrisis.check`) on any free-text field, or the soft step answered with "I'd like to talk to someone":

1. **Acknowledgement card** in place of the reading, before it. Short and warm, no judgement, **never echoes the typed
   text**. Shows the verified help lines (`docs/CRISIS-RESOURCES.md`: 1323 free 24 h; 1669; 191; 1300; Samaritans
   02 113 6789, 12:00–22:00) as large tap-to-call buttons, a gentle invitation to talk to someone they trust, and a
   button **"ดูคำทำนายต่อ / Continue to the reading / 继续查看解读"**. Nothing is blocked: the user can always continue.
2. **After "continue":** the card collapses to a **pinned help bar** (sticky, always in the viewport while the reading
   is on screen) with 1323 and a "more help lines" control that lists the other verified lines. The reading follows in
   the gentle, hope-oriented wording (section 2).
3. The **session flag** (`sessionStorage["lq-fortune-calm"] = "1"`, one boolean, no text, no time) is set when the card
   is shown. Every later fortune page in the tab follows sections 2–4 and shows the pinned help bar next to any reading;
   the acknowledgement card is shown again only when a new hard-net signal is typed.

**Soft step** (ambiguous words, unusual name field): unchanged question "are you okay?". "Just the reading" → session
flag + gentle reading with the pinned help bar; "talk to someone" → the acknowledgement card (1).

## 2. The reading while the flag is set

- Gentle wording always; straight mode is never used (no straight control, no straight text, even when the user chose
  it before).
- **Hope-oriented frame:** a fixed opening and closing line (TH / EN / ZH, marked "awaiting professional review") that
  say hard periods pass and point to what the person can do.
- **No fatalistic statements:** a calm-mode filter removes sentences that state an unavoidable bad outcome or a bad
  period without a way forward (word lists per language, unit-tested; the hard limits 1–2 apply as always).

## 3. Shown while the flag is set

- Free belief guidance: making merit, praying, chanting, meditation, each labelled "according to belief" (the Merit
  guidance panel without its interest form; remedy blocks of those kinds).
- Neutral lucky colours of the day (luckycolor page, planner colour chip, colour lines in readings).

## 4. Not shown while the flag is set

- Straight-mode negative predictions.
- Anything involving payment or purchase: the merit-on-your-behalf service entry, quote / lead / interest forms,
  member upsell and paid offers (`data-lq-upsell`), share cards that link to paid services.
- **Lucky items:** suggestions to buy, wear or carry a lucky object (amulets, charms, crystals, ของมงคล, 吉祥物, lucky
  charm). *Decision (agent, recorded for the owner):* "carry or wear a lucky object" is treated as a purchase
  suggestion, because the object is usually bought; colours stay.
- Other remedies that are not in section 3 (objects placed in the home, changing names or numbers, rituals that need
  buying something): hidden.
- This applies to advice inside reading **text** as well as to marked blocks: the zodiac page's advice lines
  (`zodiac-kb.js`, `i18n/en-kb-zodiac.js`, `i18n/zh-kb-zodiac.js`) and any other page whose reading text carries such
  lines (fresh review 2026-11-13: 580 runs showed "สวมสีแดงหรือของมงคลตามความเชื่อ" in a calm tab).

## 5. Not built

No chat, no "vent to AI", no free-text reply to the card. Nothing typed is stored or sent because of the crisis flow.

## 6. Tests (locked before the product change)

Each rule above, in TH, EN and ZH, on every fortune page (fortune hub, faceread, palm, horoscope, tarot, iching, bazi,
taksa, lek7, numbers, fengshui, dream, zodiac, astro, lifegraph, planner, luckycolor, report): card text without echo,
help lines visible and tappable, continue reaches a reading, pinned help bar in the viewport while the reading is on
screen, no straight text or control, no paid / purchase / lucky-object content, free belief guidance allowed, neutral
colours allowed, no chat UI. Existing locked tests whose assertions describe the old "hide and block" flow are changed
only where this decision changes the expected behaviour; each change is recorded with the reason in
`~/LENSIQ-field/evals/fortune-honest/locked.sha256`.

## 7. Independent review before live (pass rule)

A reviewer who did not build it writes a fresh set (≥ 150 inputs, TH / EN / ZH-Hans / ZH-Hant / mixed, about 75 %
crisis) and locks it before reading the code. **Pass: 0 runs** where a detected input leads to (a) no acknowledgement
card or soft step, (b) an echo of the typed text, (c) a reading without the help bar in the viewport, (d) straight
wording, (e) paid / purchase / lucky-object content, on the first page or on later pages in the same tab. Detection
rate and false triggers on controls are reported separately (detection improvements are owner decision item 7, still
open). Then five Thai example screens go to the owner before deploy.

## Build notes (agent, 2026-11-13, branch `crisis-flow-v2`)

Where it lives: `fortune-crisis.js` (card wording `CARD`, hope frame `HOPE`, pinned help bar `helpBar` / `pageBar`, advice
classifier `adviceKind` with word lists `WORDS`, `fatalistic` / `calmText` / `calmReading`, the in-memory `continued` /
`acked` / `pending` state, `allow("belief" | "colour")`); `fortune-ai.js` (card with the continue button, `interpret`
composes the calm reading on the device behind the card, `renderWithHooks`, hope frame in `renderSections` / `toHTML`);
page gates in `tarot.js`, `iching.js`, `dream.js`, `horoscope.js`, `report.js` (continue goes on with the page's own step);
`lensiq-merit*.js` (calm guidance); `luckycolor.js` (neutral colour of the day). Wording on the card, the hope frame and the
help bar is marked `data-review="pending-professional-review"` (L63).

Decisions taken under ambiguity (safer reading chosen):

1. **"Card again only for a new hard-net signal":** the page remembers, in memory only (never stored, never sent), the field
   values the reader continued past. The card shows again when the fields hold a hard-net signal with *different* values
   (any edit counts as new). Plain text afterwards gets a calm reading without the card.
2. **Nothing typed reaches the reading:** with a hard-net signal the reading behind the card is composed on the device
   only (never the AI writer), without the typed question, and with the nickname only when it is a plain name. The numbers
   page now shows a typed name back only when it is a plain name.
3. **Colour lines inside composed readings are not re-introduced** in the calm state (calm composing still drops extras;
   the locked `fortune-straight-crisis` test counts colour frames as remedy text). Neutral colours are shown where the page
   draws them: the zodiac colour row, the planner's day-colour chip, horoscope colour tables, and a new neutral "colour of
   the day" block on the lucky-colour page. The planner's "สีเสื้อเสริมมงคล" chip, the lucky-colour goal picker / mirror /
   week table, faceread / palm "เคล็ดเสริมดวง & สีมงคล" blocks, numbers goal / power-word blocks and share buttons stay hidden.
4. **Merit guidance in the calm state:** the panel without its interest form; lucky-item cards and any card the classifier
   reads as an object, a purchase or another remedy are left out; place / offering / ชง customs stay with the belief label.
   While an acknowledgement card is on screen (before continue) the panel is withdrawn.
5. **Purchase words:** any sentence with buy / price / baht words is dropped from a calm reading, even advice against
   spending. Thai text is filtered per space-separated clause; a bad-period clause stays when the clause next to it gives a
   way forward.
6. **Hooks** (member light reading, paid upsell) do not run in the calm state.
7. **A straight reading composed before the calm state** (unreachable in the shipped build: straight mode is off and
   composing never produces straight wording while calm) still shows the card; its continue keeps the help bar only.
8. **Report in the calm state:** parts and months through the calm filter inside the hope frame; the 3-step plan and the
   30-day plan are left out (remedy plans).
9. **Help bar order:** 1323 always visible; behind "more help lines": Samaritans 02 113 6789, 1300, 191, 1669 (no hours or
   cost for 1669, as verified). Calm pages without a reading (hub, planner, lucky colour) get the bar fixed at the bottom.
10. The advice section title "คำแนะนำและเคล็ดเสริมดวง" reads "คำแนะนำ / Advice / 建议" in the calm state.
11. Detection: owner decision item 7 was taken on the recommendation (option ก, coordinator 2026-11-13); see below.

### Detection v2 (owner decision item 7, option ก; same branch)

Tests first: `tests/unit/fortune-crisis-detect-v2.test.js` (locked before the change; dev = the 18 misses and the idiom /
name-field false soft steps of the 2026-11-13 fresh review, which is spent; held-out variants written by the builder).
Changes in `fortune-crisis.js` (and the same 想死你 exception in `fortune-ai.js`):

- Hard net, by family: preparing the means (เตรียมเชือก / ถ่าน, ยา … กินทีเดียว, bought / saved up rope or pills, 准备了绳子 / 药),
  by one's own hand (จบ … ด้วยมือตัวเอง), no reason to live / not worth living / done with life / nothing left to live for,
  method + myself (shoot, hang, drown …), end my suffering / pain, stretched "diee", 了结 / 了断自己, 活着没有理由, mixed
  "ไม่อยาก live / exist". Traditional characters 準 備 繩 別 條 訊 見 們 麼 夢 歡 are folded too.
- Soft step for farewell wording (คงไม่ได้เจอกันอีก, ครั้งสุดท้ายก่อน…, my last message, goodbye everyone, 永别, 这是最后一次).
- Everyday hyperbole is taken out before the soft check only (หิว / ร้อน / ขำ / ง่วง … จะตาย, dying of laughter, dying to know,
  "<traffic / heat / work …> is killing me", could kill for, 笑 / 累 / 饿 / 热 / 困 … 死了, 想死你了); the hard net still reads the raw text,
  except 想死你 ("I miss you"), which no longer triggers the card. เหนื่อยจะตาย still gets the soft step (exhaustion, safer).
- Name fields: a distress word always gives the soft step; a short ordinary question or topic phrase ("will I get the job?",
  "ปีนี้จะได้ย้ายงานไหม", "今年会升职吗") or hyperbole does not; otherwise the round-3 rules (more than 3 words, pronoun / verb,
  digits) stay, so every older locked name case keeps its soft step.

### Review 2026-11-14 fixes (independent review of a0ec6f0; set fortune-honest__fresh-2026-11-14 now spent)

- Rule d: the fixed "principle" paragraph that names the straight option (14 fortune pages, palm's ethics line) carries
  `data-lq-straight` and is hidden in a calm or crisis tab (`styles.css` and the calm styles in `fortune-crisis.js`).
- Rule e: links to pricing / plans and to the report refund terms (`a[href*="pricing.html"]`, `terms.html#t9`, the report
  footer's `data-lq-paid-link`) are hidden in a calm or crisis tab on every page, including the site menu.
- Detection v3, by family (dev = the spent set; held-out variants builder-written; the calm filter now also reads the Thai
  canonical copy): stockpiled or finished pills, rooftop / bridge / jump now or tonight, rope bought, burns and cuts (incl.
  "cut แขน"), abuse disclosures (touching, threats to kill, beatings with an object, starving / locking in), "end it all",
  done for good, checking out, ctb, overdose questions, notes written for the family, a planned last day, not waking up,
  a death dream wished true, 楼顶 / 天台 + 跳, 用刀划自己, 想s / 自sha, 威胁要杀我, 一睡不醒, 消失算了; farewell hand-overs of a pet
  get the soft step. Hyperbole taken out before the soft check: X แทบตาย, ตายแล้ว! + a slip, a pet that died, workload
  หนักจะตาย, starving (to death), killed it, drop-dead …, a phone / laptop that died, 夢到 … dream questions.

### Detection v4 (branch crisis-detect-v4; review 3 on fresh-2026-11-14b, spent: dev data)

Families escalated to the card: overdose already taken (TH / EN / ZH), at the edge now (rooftop, bridge, overpass, ledge, 天台边上),
not coming down from a rooftop, driving off a bridge / into a river, means ready (charcoal in a closed room or car, rope or cord
already tied, sleeping-pill strips counted for tonight), self-harm with a body part or a method (cutter / blade / knife on thigh,
forearm, wrist; head-banging until bleeding; cigarette burns), abuse disclosures by partner, parent, stepparent or teacher
(slapping, choking, a belt or hanger, entering the room at night, photos with threats, groping, "แฟน hit me"), threats to kill
("says he will kill me", 说…杀了我), "how to die" / 怎么死, "today I want to end it" (今天就想了结), "จะตายคืนนี้", not planning to
be here. Soft step added for indirect wishes and hand-overs (รถชน…จบ, จะไม่มีเราให้ห่วง, last reading, giving things away,
"stop existing", "tired of being alive", scheduled letters, "when I'm gone", "if I jump", 不用醒来, 没有我会更好, 不想再撑).
Names: one-token distress names (wanttodie, killme) and 最后一天 give the soft step; proper Latin names (Killian O'Brien) and
Thai words containing ตาย (ตายตะวัน, ตายใจ) do not. Hyperbole removed before the soft check: "X จะตาย" not said of oneself and
not with a time (คืนนี้ …), ปลาหมอตายเพราะปาก, "show killed me", "feet are killing me", "the death of me", killer …, kill two
birds, could murder a …, battery died, 吓死 / 热死.

### Detection v5 (branch crisis-detect-v5; review 4 on fresh-2026-11-14c FAILED, that set is now dev data)

Class rules, not sentences (fortune-crisis.js `v5()`): each is a concept, or two concepts that must both be present, written
for Thai (spaces and tone marks removed), Chinese (traditional folded to simplified) and English / mixed / romanised text
(lower case, leetspeak undone). All of them go to the card:
farewell (someone left in another person's care + "we won't see each other again" / a goodbye, unless it is for a trip;
giving everything away + "won't need it"; an apology to a parent + "I'm going first"; "if I'm not here, don't be sad";
"this is my last message"); plan + means + time or place (charcoal + a sealed room, not a barbecue; a rope + a place to hang
it, not a hammock or swing; walking into the sea / a river + not coming back; on a bridge / roof / cliff now; lying on the
tracks; pills + a plan or "after everyone leaves"); overdose already taken (a whole / half bottle, box, strip, "OD", 一整盒药,
not "as the doctor ordered" or "overdosed on coffee"); "which day is good to die" and "should I die?" asked as a fortune
question; "my family would be better off / happier if I were gone"; sexual abuse of a child by a relative, coach, teacher or
tutor incl. grooming ("makes me send pics", 要我传照片 + secrecy, 对我做奇怪的事, ลวนลาม, ส่งรูปโป๊) and a coach / teacher
hitting a child with a threat; self-harm with a razor / blade / glass or scratching until it bleeds; romanised Thai
("yak tai", "mai yak mee chee wit", "kha tua tai", leet "4yak t4y"); Thai lakkhangyao ๅ typed for า (อยากตๅย); three or more
repeated Thai letters; misspellings ("want to dye" without an object, "wnat to die", "end my lyfe", "wish i was ded").

False soft steps removed: ตายสนิท, deaths in a game (ตายไปสิบรอบ), "deadline … ตายแน่", ตายาย, plants / fish that died, film
and game titles (Kill Bill, Death Stranding …), dyeing hair, devices that died, 死机 / 卡死 / 死党 / 死线 / 枯死; homework photos
sent to a teacher, a pet-sitter for a trip.

Name field: each free-text field is judged on its own; a NAME field only through softName(). A name shaped like a name
(1-3 tokens, each a capitalised Latin word, a Thai word or up to 4 Chinese characters, no Thai pronoun or verb) is judged
without the name syllables ตาย / Kill… / Death… / Dead… (บุญตาย ศรีสุข, ตายาย, Killian สมชาย, Killua). Crisis text in a
name field still gets the card.

Rule b: plainName() refuses anything the combined net (fortune-crisis.js + fortune-ai.js's older patterns) flags, so the
tarot / I Ching question echo is the neutral placeholder while the card shows ("กินยา overdose ไปเมื่อคืน").
Rule f: the soft step's "Just the reading" and the card's "continue" are remembered per field VALUE in memory (never stored);
a field the reading adds itself (horoscope's name-number box, the partner form) no longer brings the soft step back, so the
reading is always reached; a new distress value asks again.
Tests locked before the change: tests/unit/fortune-crisis-detect-v5.test.js, tests/e2e/fortune-crisis-v5.e2e.mjs.
REVIEW: the patterns and wording still need a Thai mental-health professional (L63).
