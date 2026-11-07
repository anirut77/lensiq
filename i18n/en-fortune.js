/* i18n/en-fortune.js — English for all fortune pages (fortune.html, faceread, palm, horoscope, tarot, fengshui,
   numbers, iching, zodiac, astro, dream) + fa.* keys used by fortune-ai.js (mirrors zh-fortune.js). */
(function (root) {
  "use strict";
  var dict = { en: {
    "astro.asResTitle": "Your Big Three",
    "astro.button1": "Calculate chart",
    "astro.h1": "Western Astrology: Sun · Moon · Ascendant",
    "astro.h21": "Choose your Sun sign",
    "astro.h31": "Method and references",
    "astro.lead": "Calculates your Sun, Moon and ascendant signs on the tropical zodiac used by international magazines and astrology apps, with a daily outlook based on the Moon's transit through your sign.",
    "astro.legend1": "Birth date",
    "astro.legend2": "Birth time and place (optional, for the ascendant)",
    "astro.tabChart": "Birth chart",
    "astro.tabSigns": "12 signs · Today",
    "astro.title": "Western Astrology Big Three | LENSIQ",
    "dream.drAgain": "Interpret another dream",
    "dream.drGo": "Interpret dream",
    "dream.drResTitle": "What your dream means",
    "dream.h1": "Dream Interpretation",
    "dream.lead": "Briefly describe your dream and the system finds its symbols automatically, or choose them yourself from animals, nature, people, objects and events. Meanings are interpreted positively according to Thai folk beliefs.",
    "dream.legend1": "How you felt in the dream (optional)",
    "dream.legend2": "When you had the dream (optional)",
    "dream.summary1": "Search or choose from all categories",
    "dream.title": "Dream Interpretation | LENSIQ",
    "fa.disclaimer": "For entertainment only",
    "fa.more": "Read more",
    "fa.why": "Why this reading",
    "fa.sec.advice": "Advice and luck tips",
    "fa.sec.brief": "Other areas in brief",
    "fa.sec.love": "Love and relationships",
    "fa.sec.money": "Money",
    "fa.sec.overview": "Overview",
    "fa.sec.personality": "Personality and self",
    "fa.sec.social": "Relationships and friends",
    "fa.sec.timing": "Timing",
    "fa.sec.work": "Career and studies",
    "fa.summary.title": "Summary",
    "fa.summary.overview": "Overall",
    "fa.summary.top": "Standout",
    "fa.summary.other": "Another highlight",
    "fa.summary.topic.love": "Love",
    "fa.summary.topic.work": "Career",
    "fa.summary.topic.money": "Money",
    "fa.summary.try": "Try this",
    "fa.summary.tip": "Tip",
    "fa.summary.k.top": "Standout",
    "fk.topics": "Topic of interest",
    "fk.topic.overall": "Overall",
    "fk.topic.love": "Love",
    "fk.topic.work": "Career",
    "fk.topic.money": "Money",
    "fk.loading": "Composing your reading…",
    "fk.again": "Rephrase",
    "fk.src.ai": "Composed by the writing assistant (Claude by Anthropic)",
    "fk.src.local": "Composed on this device · worded differently each time",
    "fk.card.foot": "For entertainment only, not a scientific conclusion",
    "fk.share.text": "For entertainment only",
    "fk.card.saved": "Card saved",
    "fk.card.fail": "Could not create the card",
    "fk.idle": "Returning to start in {n} s — tap the screen to stay",
    "fk.stats.empty": "No records on this device yet",
    "fk.stats.times": "sessions",
    "fk.stats.today": "{n} today",
    "fk.stats.clear": "Clear statistics on this device?",
    "faceread.button1": "Three zones",
    "faceread.button2": "12 palaces",
    "faceread.button3": "Five peaks",
    "faceread.button4": "Age points",
    "faceread.button5": "Submit",
    "faceread.frForce": "Read anyway (below standard; results may be off)",
    "faceread.frLeadsClear": "Delete all customer data",
    "faceread.frLeadsCsv": "Export CSV",
    "faceread.frRead": "Read my face",
    "faceread.frResTitle": "Your face reading",
    "faceread.frStartCam": "Start camera",
    "faceread.h1": "Face Reading",
    "faceread.h21": "Check before reading",
    "faceread.h31": "12 palaces",
    "faceread.h32": "Five peaks and four rivers",
    "faceread.h33": "Facial features and key areas",
    "faceread.h34": "Three facial zones",
    "faceread.h35": "Hundred-year age map",
    "faceread.lead": "Based on face reading (Mien Shiang), 68 facial landmarks are used to read your face-shape element, 12 palaces, five peaks and four rivers, three zones, facial features, age points and luck tips — an engaging addition to booths, events and marketing campaigns.",
    "faceread.summary1": "Booth settings (for booth staff)",
    "faceread.th1": "Area",
    "faceread.th2": "Measurement",
    "faceread.th3": "Feature",
    "faceread.th4": "Traditional meaning",
    "faceread.th5": "Value",
    "faceread.th6": "Result",
    "faceread.th7": "Landmarks used",
    "faceread.title": "Face Reading | LENSIQ",
    "fengshui.button1": "Calculate Kua number",
    "fengshui.button2": "Record door direction",
    "fengshui.button3": "Record desk direction",
    "fengshui.button4": "Record bed direction",
    "fengshui.fsCompassStart": "Start compass + camera",
    "fengshui.fsManualToggle": "Set direction manually",
    "fengshui.fsReadBtn": "View feng shui reading",
    "fengshui.fsReset": "Start over (next person)",
    "fengshui.h1": "Feng Shui",
    "fengshui.h31": "Room photo (optional)",
    "fengshui.h41": "Thai customs",
    "fengshui.label1": "Facing (degrees from true north)",
    "fengshui.lead": "Calculates your Kua number (Eight Mansions) from your birth date, measures directions with an AR compass, and plans your home layout with the annual flying-star grid and Bagua chart for gentle arrangement tips — suited to booths, events and real estate marketing.",
    "fengshui.legend1": "Birth date",
    "fengshui.legend2": "Formula (traditional texts differ by sex at birth)",
    "fengshui.summary1": "How to measure correctly",
    "fengshui.summary2": "Principles used",
    "fengshui.title": "Feng Shui | LENSIQ",
    "fortune.common.again": "Read again / next person",
    "fortune.common.askAgain": "Ask again / next person",
    "fortune.common.howCalc": "View calculation method",
    "fortune.common.kiosk": "Booth mode (full screen)",
    "fortune.common.kioskExit": "Exit booth mode",
    "fortune.common.luckTips": "Luck tips & lucky colors",
    "fortune.common.nextPerson": "Next person",
    "fortune.common.print": "Print",
    "fortune.common.readingDetail": "Detailed reading",
    "fortune.common.regen": "Rephrase",
    "fortune.common.share": "Share result card",
    "fortune.common.sources": "References",
    "fortune.common.stats": "Booth statistics (anonymous)",
    "fortune.common.statsClear": "Clear statistics",
    "fortune.common.topic": "Topic to ask about",
    "fortune.hub.card.astro.go": "Calculate chart →",
    "fortune.hub.card.astro.name": "Western Astrology Big Three",
    "fortune.hub.card.astro.org": "Western · Tropical zodiac",
    "fortune.hub.card.dream.go": "Interpret dream →",
    "fortune.hub.card.dream.name": "Dream Interpretation",
    "fortune.hub.card.dream.org": "Thai · Folk beliefs",
    "fortune.hub.card.faceread.go": "Start face reading →",
    "fortune.hub.card.faceread.name": "Face Reading",
    "fortune.hub.card.faceread.org": "Chinese · Mien Shiang",
    "fortune.hub.card.fengshui.go": "Start feng shui →",
    "fortune.hub.card.fengshui.name": "Feng Shui",
    "fortune.hub.card.fengshui.org": "Chinese · Feng shui",
    "fortune.hub.card.horoscope.go": "Start reading →",
    "fortune.hub.card.horoscope.name": "Birth-date Horoscope",
    "fortune.hub.card.horoscope.org": "Thai · Chinese · Numerology",
    "fortune.hub.card.iching.go": "Toss coins →",
    "fortune.hub.card.iching.name": "I Ching",
    "fortune.hub.card.iching.org": "Chinese · I Ching",
    "fortune.hub.card.numbers.go": "Analyze numbers →",
    "fortune.hub.card.numbers.name": "Lucky Numbers",
    "fortune.hub.card.numbers.org": "Thai · Numerology",
    "fortune.hub.card.palm.go": "Start palm reading →",
    "fortune.hub.card.palm.name": "Palm Reading",
    "fortune.hub.card.palm.org": "International · Palmistry",
    "fortune.hub.card.tarot.go": "Draw cards →",
    "fortune.hub.card.tarot.name": "Tarot & Siam Si",
    "fortune.hub.card.tarot.org": "Western · Thai-Chinese",
    "fortune.hub.card.zodiac.go": "View this year →",
    "fortune.hub.card.zodiac.name": "Chinese Zodiac · Tai Sui",
    "fortune.hub.card.zodiac.org": "Chinese · Thai",
    "fortune.hub.eyebrow": "FORTUNE · Readings",
    "fortune.hub.ftGuideH": "Choose a reading by what you want to know",
    "fortune.hub.h1": "Fortune Readings",
    "fortune.hub.title": "Fortune Readings | LENSIQ",
    "horoscope.button1": "View compatibility",
    "horoscope.h1": "Birth-date Horoscope",
    "horoscope.h21": "Enter birth date",
    "horoscope.h31": "Partner's birth date",
    "horoscope.hsAgain": "Next person",
    "horoscope.hsGo": "Start reading",
    "horoscope.hsResTitle": "Your horoscope",
    "horoscope.hsShare": "Share horoscope card",
    "horoscope.lead": "Popular readings in one place: Thai astrology (birth weekday, eight directions, sign, ascendant, seven-number chart), Ba Zi (Four Pillars), numerology, daily outlook and compatibility. No camera needed — just your birth date.",
    "horoscope.legend1": "Birth date",
    "horoscope.legend2": "Birth date",
    "horoscope.summary1": "More settings (birthplace, time zone, day boundary)",
    "horoscope.tab-bz": "Ba Zi",
    "horoscope.tab-cp": "Compatibility",
    "horoscope.tab-nu": "Numerology",
    "horoscope.tab-ov": "Overview",
    "horoscope.tab-td": "Today",
    "horoscope.tab-th": "Thai astrology",
    "horoscope.title": "Birth-date Horoscope | LENSIQ",
    "iching.h1": "I Ching",
    "iching.h21": "Table of 64 hexagrams (King Wen order)",
    "iching.icAuto": "Auto-toss the rest",
    "iching.icBack": "Start over",
    "iching.icResTitle": "Your hexagram",
    "iching.icStageTitle": "Toss three coins",
    "iching.icStart": "Start casting",
    "iching.lead": "Hold your question in mind and toss three coins six times, the traditional I Ching method, building six lines from the bottom up. Changing lines show how the matter is likely to develop.",
    "iching.tabAll": "64 hexagrams",
    "iching.tabCast": "Toss coins",
    "iching.tabDaily": "Hexagram of the day",
    "iching.title": "I Ching | LENSIQ",
    "numbers.button1": "Mobile",
    "numbers.button2": "License plate",
    "numbers.button3": "House/room",
    "numbers.button4": "Bank account",
    "numbers.button5": "Name",
    "numbers.button6": "Daily energy",
    "numbers.button7": "Compare numbers",
    "numbers.h1": "Lucky Numbers",
    "numbers.h31": "Score breakdown",
    "numbers.h32": "Digit pairs",
    "numbers.h33": "Sum",
    "numbers.h34": "Memorable patterns",
    "numbers.h35": "Lucky number reading",
    "numbers.h36": "Number tips by goal",
    "numbers.h37": "Words of encouragement for this result",
    "numbers.h38": "Daily energy",
    "numbers.h39": "Compare numbers",
    "numbers.h41": "Letter values (editable in numbers-kb.js)",
    "numbers.h42": "Kalakini letters by birth weekday",
    "numbers.h43": "General tips",
    "numbers.lead": "Reads the energy of mobile numbers, license plates, house numbers, bank accounts and names according to Thai numerology, covering digit pairs, sums and memorable patterns, with a clear source for every score.",
    "numbers.nmAgain": "Analyze again",
    "numbers.nmResTitle": "Lucky number analysis",
    "numbers.th1": "Number",
    "numbers.th2": "Score",
    "numbers.th3": "Sum",
    "numbers.th4": "Standout pairs",
    "numbers.th5": "Pairs to watch",
    "numbers.title": "Lucky Numbers | LENSIQ",
    "palm.button1": "Left hand",
    "palm.button2": "Right hand",
    "palm.button3": "Auto",
    "palm.button4": "Both hands",
    "palm.button5": "Left-handed",
    "palm.button6": "Right-handed",
    "palm.h1": "Palm Reading",
    "palm.h21": "Choose the hand to read",
    "palm.h31": "Choose a line to adjust",
    "palm.h32": "Four main lines",
    "palm.h33": "Fingers",
    "palm.h34": "Minor lines and mounts",
    "palm.lead": "Photograph your palm and the system finds 21 points on your hand and traces the life, head, heart and fate lines. You can adjust the lines to match your real palm before reading. Read the left, right or both hands for hand-type element, standout fingers, mounts and Bagua directions, personality, career, money, love and luck tips — an engaging addition to booths, events and marketing campaigns.",
    "palm.plBack": "Retake photo",
    "palm.plEditAgain": "Back to line editing",
    "palm.plEditTitle": "Check and adjust lines",
    "palm.plResTitle": "Your palm reading",
    "palm.plResetLines": "Restore auto-detected lines",
    "palm.plSnap": "Capture palm",
    "palm.plStartCam": "Start camera",
    "palm.plTapMode": "Mark points manually",
    "palm.plTapUndo": "Undo last point",
    "palm.summary1": "Which hand should I read?",
    "palm.th1": "Item",
    "palm.th2": "Value",
    "palm.th3": "Result",
    "palm.th4": "What the value means",
    "palm.title": "Palm Reading | LENSIQ",
    "tarot.h1": "Tarot & Siam Si",
    "tarot.h21": "Card of the day",
    "tarot.lead": "Ask a question, shuffle and draw cards yourself for a reading from the full 78-card Rider–Waite–Smith deck, or shake the Siam Si sticks — an engaging addition to booths, events and marketing campaigns.",
    "tarot.legend1": "Spread",
    "tarot.ssAgain": "Draw another stick",
    "tarot.ssDraw": "Shake sticks",
    "tarot.ssShare": "Share fortune card",
    "tarot.tabDaily": "Card of the day",
    "tarot.tabSiamsee": "Siam Si",
    "tarot.tabTarot": "Tarot",
    "tarot.title": "Tarot & Siam Si | LENSIQ",
    "tarot.trAuto": "Pick cards for me",
    "tarot.trBack": "Back to question",
    "tarot.trResTitle": "Your cards",
    "tarot.trReshuffle": "Reshuffle",
    "tarot.trReveal": "Reveal cards",
    "tarot.trStart": "Shuffle",
    "zodiac.button1": "View this year",
    "zodiac.button2": "View compatibility",
    "zodiac.h1": "Chinese Zodiac · Tai Sui · Compatibility",
    "zodiac.lead": "Yearly outlook by zodiac animal: see whether this is a Tai Sui clash year or a supportive one, with lucky colors and directions, the Tai Sui table for all 12 animals, and compatibility between two animals.",
    "zodiac.legend1": "Choose your zodiac animal",
    "zodiac.legend2": "Your zodiac animal",
    "zodiac.legend3": "Other person's animal (partner, friend or business partner)",
    "zodiac.summary1": "Not sure? Enter your birth date and the system will work out your animal (calculated on this device, not saved)",
    "zodiac.tabChong": "Tai Sui table",
    "zodiac.tabPair": "Compatibility",
    "zodiac.tabYear": "Yearly outlook",
    "zodiac.title": "Chinese Zodiac, Tai Sui and Compatibility | LENSIQ",
    "dream.disclaimer": "For entertainment only; based on folk beliefs, not science",
    "faceread.disclaimer": "For entertainment only; based on face-reading tradition, not science",
    "fengshui.disclaimer": "For entertainment and cultural interest only, not science",
    "fortune.common.disclaimerBelief": "For entertainment only; based on traditional beliefs, not scientific prediction",
    "fortune.hub.noteLabel": "For entertainment only:",
    "horoscope.disclaimer": "For entertainment only; based on astrological beliefs, not science",
    "numbers.disclaimer": "For entertainment only; based on number beliefs, not science",
    "palm.disclaimer": "For entertainment only; based on palmistry tradition, not science",
    "fa.plan.title": "Three-step plan",
    "fortune.en.note": "Readings and reference data on this page are written in Thai or Chinese; the interface is in English. Switch language for the full reading:"
  } };
  // lensiq-i18n.js: use LQI18N.add if loaded; otherwise queue in LQI18N_Q (the core file drains it on load)
  if (root.LQI18N && typeof root.LQI18N.add === "function") root.LQI18N.add(dict);
  else {
    (root.LQI18N_Q = root.LQI18N_Q || []).push(dict);
    root.LQI18N_PENDING = (root.LQI18N_PENDING || []).concat([dict]); // fallback for loaders that read this name
  }
  if (typeof module === "object" && module.exports) module.exports = dict;
})(typeof window !== "undefined" ? window : globalThis);

/* English mode on the fortune pages (this file is loaded only when English is chosen — sibling of zh-fortune.js).
 * Readings are composed natively in English by fortune-ai.js from i18n/en-kb-*.js (loaded by lensiq-i18n.js as the
 * siblings of the page's zh-kb-*.js). Around them:
 *   - only on a page whose English reading data did not load, a note under the heading says readings are in Thai /
 *     Chinese, with one-tap language buttons;
 *   - reading blocks rendered by fortune-ai.js (.fa-section, .fa-summary, …) are marked lang="th" (correct
 *     pronunciation for screen readers; reported separately — not as untranslated chrome — by the coverage tool);
 *   - short knowledge-base labels (symbol, animal, star names, source titles) are translated by whole-string lookup
 *     through lensiq-i18n-rt.js with i18n/en-rt-fortune.js (exactOnly: free text is never translated word by word).
 * Leaving English removes the marks and the note. */
(function (root) {
  "use strict";
  var doc = root.document;
  if (!doc || root.__lqEnFortune) return;
  root.__lqEnFortune = true;
  // reading prose (fortune-ai.js blocks + page-specific reading containers): stays Thai, marked lang="th"
  var READING = ".fa-section,.fa-summary,.fa-more,.fa-note,.fa-loading,.fa-reminder,.fa-plan li,.fs-sec p,#fsExtras li,.ss-verse,.ss-meaning,#ssCats li,.ic-gist,.dr-meaning,.dr-type-note,.dr-card p";
  var q = (doc.querySelector('script[src*="i18n/en-fortune.js"]') || {}).src || "";
  var v = q.indexOf("?") >= 0 ? q.slice(q.indexOf("?")) : "";
  function load(src) {
    if (doc.querySelector('script[src^="' + src + '"]')) return;
    var sc = doc.createElement("script"); sc.src = src + v; sc.async = false; (doc.head || doc.documentElement).appendChild(sc);
  }
  root.LQI18N_RT_CFG = { langs: ["en"], exactOnly: true, skip: READING };
  if (root.LQI18N_RTX && root.LQI18N_RTX.config) root.LQI18N_RTX.config(root.LQI18N_RT_CFG);
  else load("lensiq-i18n-rt.js");
  load("i18n/en-rt-fortune.js");
  var isEn = function () { return !!(root.LQI18N && root.LQI18N.lang === "en"); };
  var TH = /[ก-ฺเ-๛]/g, LA = /[A-Za-z]/g;
  function thaiDominant(el) {
    var t = el.textContent || "", th = (t.match(TH) || []).length;
    return th >= 2 && th >= (t.match(LA) || []).length;
  }
  function mark(scope) {
    if (!isEn()) return;
    var list = (scope.querySelectorAll ? scope : doc).querySelectorAll(READING);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.hasAttribute("lang") && !el.hasAttribute("data-lq-en-th")) continue;
      if (!thaiDominant(el)) continue;
      if (el.closest("[lang^=zh]")) continue;
      el.setAttribute("lang", "th"); el.setAttribute("data-lq-en-th", "");
    }
  }
  function unmark() {
    var list = doc.querySelectorAll("[data-lq-en-th]");
    for (var i = 0; i < list.length; i++) { list[i].removeAttribute("lang"); list[i].removeAttribute("data-lq-en-th"); }
  }
  var note = null;
  // English readings are available when every zh-kb-* data file on the page has its English sibling loaded
  function enReadings() {
    var tags = doc.querySelectorAll('script[src*="i18n/zh-kb-"]'), E = root.FORTUNE_EN || {}, n = 0;
    for (var k in E) if (E[k] && E[k].items) n++;
    return !tags.length || n > 0;
  }
  function showNote() {
    if (!isEn() || enReadings()) { if (note) note.hidden = true; return; }
    if (!note) {
      var h1 = doc.querySelector("main h1"); if (!h1) return;
      var after = h1.nextElementSibling && h1.nextElementSibling.classList.contains("lead") ? h1.nextElementSibling : h1;
      note = doc.createElement("p"); note.className = "lq-lang-note"; note.setAttribute("role", "note");
      note.innerHTML = '<span></span> <button type="button" data-lang="th" lang="th">ไทย</button> <button type="button" data-lang="zh" lang="zh-Hans">中文</button>';
      note.querySelector("span").textContent = root.LQI18N.t("fortune.en.note");
      note.addEventListener("click", function (e) {
        var b = e.target && e.target.closest ? e.target.closest("button[data-lang]") : null;
        if (b && root.LQI18N) root.LQI18N.setLang(b.getAttribute("data-lang"));
      });
      after.insertAdjacentElement("afterend", note);
    }
    note.hidden = false;
  }
  var obs = null;
  function sync() {
    if (isEn()) {
      mark(doc); showNote();
      if (!obs && typeof MutationObserver !== "undefined") {
        obs = new MutationObserver(function (recs) { for (var i = 0; i < recs.length; i++) for (var j = 0; j < recs[i].addedNodes.length; j++) { var n = recs[i].addedNodes[j]; if (n.nodeType === 1) { mark(n.parentNode || n); } } });
        obs.observe(doc.body, { childList: true, subtree: true });
      }
    } else { if (obs) { obs.disconnect(); obs = null; } unmark(); showNote(); }
  }
  root.addEventListener("lq-lang", sync);
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", sync); else sync();
})(typeof window !== "undefined" ? window : globalThis);
