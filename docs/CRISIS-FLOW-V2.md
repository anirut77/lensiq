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
