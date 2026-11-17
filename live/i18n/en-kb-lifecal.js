/* i18n/en-kb-lifecal.js — English reading data (bazi, taksa, lek7, lifegraph) for fortune-ai.js (English mode).
   Mirrors i18n/zh-kb-lifecal.js key for key, with the same loops; keys equal the fact ids built by lifecal-kb.js.
   Strengths and points that need care are both included; cautions stay gentle and come with practical steps.
   Based on traditional beliefs; readers use their own judgement. */
(function (root) {
  "use strict";
  var EL = [
    { key: "wood", en: "Wood", hi: "your energy for growth is strong, you enjoy starting new things and you are willing to plan for the long run", lo: "your energy for starting new things is still on the light side, and you may sometimes hesitate before the first step", a: "take more walks in the park or look after a plant, then write down one small goal" },
    { key: "fire", en: "Fire", hi: "you are warm and outgoing, you speak frankly and you have a gift for energizing the people around you", lo: "your enthusiasm may fade a little faster when you are tired", a: "get some morning sunlight and pick one thing each day that gives you energy" },
    { key: "earth", en: "Earth", hi: "you are steady and grounded, someone the people around you can lean on", lo: "when things pile up, your sense of steadiness may waver a little", a: "give your daily routine a clear structure and keep some time to rest every day" },
    { key: "metal", en: "Metal", hi: "you are organized and decisive, and you do what you say you will do", lo: "making quick, firm decisions may not be your strongest suit yet", a: "clear your desk and give each task a deadline" },
    { key: "water", en: "Water", hi: "you are thoughtful and adaptable, and you can easily sense how others feel", lo: "when life gets busy, you may leave yourself too little time to pause and reflect", a: "set aside ten quiet minutes each day to look back on what you have done" },
  ];
  var STEM = [
    { n: "Yang Wood (Jia)", p: "you are upright, frank and principled, and like a tall tree you want to grow steadily", w: "you are suited to work that lays foundations and to leading a team over the long term", l: "in love you are serious and committed, ready to care for your partner in a steady way", m: "with money you prefer to build up slowly rather than take chances" },
    { n: "Yin Wood (Yi)", p: "you are gentle and flexible, and like a climbing vine you always find a way forward", w: "you are suited to coordinating and to work that needs a delicate touch", l: "in love you notice the small details that help your partner feel secure", m: "you value what you spend and you are good at negotiating a price" },
    { n: "Yang Fire (Bing)", p: "you are cheerful and generous, as warm as the sun", w: "you are suited to speaking, teaching or work that inspires others", l: "in love you say what you feel and you have a big, open heart", m: "your income tends to be better when your work lets people see the results" },
    { n: "Yin Fire (Ding)", p: "you are sensitive and focused, like a lamp that lights the way", w: "you are suited to work that calls for deep thinking and specialist skills", l: "in love you may not say much, but you quietly look after your partner all the time", m: "you save very well once you have a clear goal" },
    { n: "Yang Earth (Wu)", p: "you are steady and reliable, like a mountain", w: "you are suited to management and roles that carry real responsibility", l: "in love you are a solid source of support for your partner", m: "you are suited to building wealth over the long term" },
    { n: "Yin Earth (Ji)", p: "you are kind and nurturing, like rich garden soil that helps others grow", w: "you are suited to service, caring roles and work that takes patience", l: "in love you are warm and a very good listener", m: "you keep careful track of what comes in and goes out" },
    { n: "Yang Metal (Geng)", p: "you are decisive and straightforward, willing to make the call and as firm as steel", w: "you are suited to work that needs fast problem solving and decisions under pressure", l: "in love you are sincere and protective of the people you care about", m: "you are willing to act when you see a clear opportunity" },
    { n: "Yin Metal (Xin)", p: "you are refined and tasteful, and like a gemstone you care about quality", w: "you are suited to design, quality control and work that rewards precision", l: "in love you value thoughtfulness and sincerity", m: "you spend only on things that are truly worth it" },
    { n: "Yang Water (Ren)", p: "you have a wide view and big ambitions, and like a river you keep moving forward", w: "you are suited to strategic planning and work that involves travel or contact abroad", l: "in love you are open-minded and enjoy learning and growing together", m: "when your plans are thorough, you are quick to spot new opportunities" },
    { n: "Yin Water (Gui)", p: "you observe closely and think deeply, and like dew you slowly reach people's hearts", w: "you are suited to analysis, research and work that calls for understanding people", l: "in love you are gentle and quick to sense your partner's feelings", m: "you are good at letting small amounts add up and planning quietly" },
  ];
  var DM_X = "in BaZi (the Four Pillars of year, month, day and hour), your Day Master is the heavenly stem of your birth day and stands for you yourself";
  var STR = {
    strong: { n: "a strong Day Master", p: "your own element is well supported, so you have plenty of drive and can stand on your own two feet", a: "share some of that strength with your team or by teaching others, which keeps things balanced" },
    balanced: { n: "a balanced Day Master", p: "the forces in your chart are fairly balanced, so you adjust well whether things are going smoothly or not", a: "keep a steady rhythm in daily life, and your results will grow little by little" },
    weak: { n: "a Day Master that welcomes support", p: "traditionally, your own element could use more support, so at times you may feel you are carrying a lot on your own", a: "talk things over with people you trust, and build yourself up by learning one thing at a time" },
  };
  var STR_X = "in BaZi, Day Master strength describes how much support your own element receives from the rest of your chart";
  var GOD = {
    peer: { n: "peers and friendly rivals", t: "this luck period centers on companions and healthy competition", c: "your friends and network give you a real boost", m: "traditionally, your money can slip away more easily in this period through time with friends and sharing", a: "keep your personal money separate from money you share with others",
      x: "in BaZi's ten gods, the peer star is energy of your own element, linked with friends, siblings and friendly rivals" },
    output: { n: "talent and expression", t: "this luck period centers on showing your talent, creativity and self-expression", w: "more people get to see what you create with your skills", l: "your charm and way with words bring fresh life to your love life", a: "gather your work into a portfolio and share it more often",
      x: "in BaZi's ten gods, the output star is the energy you give out, linked with creativity, skill and self-expression" },
    wealth: { n: "income and resources", t: "this luck period centers on income, careful choices and managing your money", m: "with hard work and good planning, your income has room to grow", a: "save and plan your finances steadily over the long term",
      x: "in BaZi's ten gods, the wealth star is the element your Day Master works on, linked with income and resources" },
    officer: { n: "duty and position", t: "this luck period centers on responsibility, position and accountability", w: "you may get the chance to take on a bigger role, with more pressure to match", a: "stay disciplined, set clear priorities and remember to rest along the way",
      x: "in BaZi's ten gods, the officer star is the element that shapes your Day Master, linked with duty, rules and status" },
    resource: { n: "learning and support", t: "this luck period centers on learning, support from elders and caring for your inner life", w: "further study or guidance from someone senior can open new paths in your work", a: "learn something new and ask someone experienced for advice",
      x: "in BaZi's ten gods, the resource star is the element that feeds your Day Master, linked with learning and mentors" },
  };
  var LUCK_X = "in BaZi, a ten-year luck period is a decade-long phase of your life with its own element and theme";
  var PLANET = { 1: { n: "the Sun", k: "the Sun", q: "honor and leadership" }, 2: { n: "the Moon", k: "the Moon", q: "charm and gentleness" }, 3: { n: "Mars", k: "the Mars", q: "courage and hard work" }, 4: { n: "Mercury", k: "the Mercury", q: "communication and trade" },
    5: { n: "Jupiter", k: "the Jupiter", q: "wisdom and the support of mentors" }, 6: { n: "Venus", k: "the Venus", q: "love, art and happiness" }, 7: { n: "Saturn", k: "the Saturn", q: "patience and responsibility" }, 8: { n: "Rahu, the shadow planet", k: "the Rahu", q: "ambition and change" } };
  var TK_X = "in Taksa, the Thai system of birth-day planets, each weekday has a ruling planet that sets the tone of your chart";
  var BH = {
    boriwan: { n: "your companions area (boriwan)", f: "c", m: "the people around you and those who work with you are a big source of your strength", g: "companions and the people who work with you" },
    ayu: { n: "your vitality area (ayu)", f: "a", m: "your energy for self-care and a steady rhythm in life come from {p}", a: "build a short self-care habit into each day, such as a walk or going to bed on time", g: "vitality, self-care and the rhythm of daily life" },
    det: { n: "your power area (decha)", f: "w", m: "your standing and influence at work come from {p}", g: "authority and standing at work" },
    sri: { n: "your prosperity area (sri)", f: "m", m: "your blessings around money and the good things that come your way are linked with {p}", g: "prosperity and blessings around money" },
    mula: { n: "your foundation area (mula)", f: "m", m: "your home, your roots and the things you have built up over time draw on {p}", g: "home, roots and what you build up over time" },
    utsaha: { n: "your effort area (utsaha)", f: "w", m: "your diligence and staying power when you get to work come from {p}", g: "effort, diligence and perseverance" },
    montri: { n: "your mentors area (montri)", f: "c", m: "the elders and helpers who back you up are linked with {p}", g: "mentors, elders and the people who support you" },
    kalakini: { n: "your obstacle area (kalakini)", f: "a", m: "tradition treats {p} as a spot that needs care, so choices or belongings tied to it call for a little extra thought", a: "if it gives you peace of mind, wear less of the color linked with {p} on important days, remembering that your own intention matters more", g: "the obstacles tradition asks you to handle with care" },
  };
  var MAHA_X = "in Taksa, the maha taksa periods hand each stretch of your life to a different planet in turn";
  var HOUSE = [
    { n: "the self house (tanu)", f: "p", m: "your sense of self, your confidence and how others see you" }, { n: "the wealth house (kadumpha)", f: "m", m: "earning and saving money" }, { n: "the siblings and friends house (sahatcha)", f: "c", m: "friends, siblings and short trips" },
    { n: "the family house (phanthu)", f: "c", m: "family, home and relatives" }, { n: "the joy and romance house (putta)", f: "l", m: "love, joy and creative work" }, { n: "the challenges house (ari)", f: "w", m: "handling competition and work that takes real effort" }, { n: "the partner house (patni)", f: "l", m: "partners and close collaborators" },
  ];
  var L7_X = "in Lek 7 Tua 9 Than, the Thai seven digits and nine bases chart, digits from your birth weekday, month and year add up into houses like this one";
  var DOM = { work: { n: "work", f: "w" }, money: { n: "finances", f: "m" }, love: { n: "love life", f: "l" }, care: { n: "self-care", f: "a" } };
  var DOM_LINE = {
    work: { favourable: "your work has a good tailwind, which makes this a fine time to take on a new role or grow your results", neutral: "your work moves along at its usual pace, a good time for you to build experience", caution: "your work may ask a little more effort of you during this time" },
    money: { favourable: "with good planning, your finances have room to grow", neutral: "your finances stay steady, which suits regular saving", caution: "money may feel a little tight for you during this time" },
    love: { favourable: "your love life feels warm, and it is easy for you to open your heart", neutral: "your love life keeps its usual steady rhythm", caution: "your love life may need a little more patience and understanding during this time" },
    care: { favourable: "keep up the steady self-care that is serving you so well in this period", neutral: "keep a regular, easy rhythm of self-care", caution: "pay extra attention to rest and to your inner well-being during this time" },
  };
  var DOM_ACT = { work: "break your work into small steps and ask for help when you need it", money: "make your spending plan a little more detailed and keep a cushion of savings", love: "talk things through in a gentle tone and listen more than you speak", care: "get plenty of sleep, keep moving at a comfortable pace and keep up with your regular checkups" };
  var LG_X = "the life graph combines Taksa, BaZi and Western astrology to show how your energy in each area of life shifts from one age period to the next";
  var TURN = {
    taksa: "in Taksa reckoning this is a turning point where the ruling planet changes, so life takes on a new tone and it is worth reviewing your goals before the next stage",
    bazi: "in BaZi this is where one ten-year luck period hands over to the next, so your focus in life shifts and it helps to plan ahead for the new stage",
    west: "in Western astrology this is a season for reorganizing your life and getting clear on what truly matters to you",
  };
  var TURN_X = {
    taksa: MAHA_X,
    bazi: LUCK_X,
    west: "in Western astrology, Saturn returns to its birth position roughly every twenty-nine years, a classic time for taking stock",
  };

  var bazi = {}, taksa = {}, lek7 = {}, life = {};
  STEM.forEach(function (s, i) { bazi["dm." + i] = { n: "your Day Master, " + s.n, s: "your " + EL[Math.floor(i / 2)].en + " Day Master", o: s.p, p: s.p, w: s.w, l: s.l, m: s.m, x: DM_X }; });
  Object.keys(STR).forEach(function (k) { bazi["str." + k] = { n: STR[k].n, s: STR[k].n, p: STR[k].p, a: STR[k].a, x: STR_X }; });
  EL.forEach(function (e) {
    bazi["el.hi." + e.key] = { n: e.en + " as your strongest element", s: "your " + e.en + " element", p: e.hi,
      x: "BaZi reads five elements, wood, fire, earth, metal and water, and the strongest one in your chart colors your natural style" };
    bazi["el.lo." + e.key] = { n: e.en + " as your weakest element", s: "your lighter " + e.en + " element", p: e.lo, a: e.a,
      x: "in BaZi, the weakest of your five elements is one to nourish gently, much like the useful element that brings a chart into balance" };
  });
  Object.keys(GOD).forEach(function (k) { var G = GOD[k], it = { n: "your ten-year luck period (" + G.n + ")", s: "this luck period", t: G.t }; ["w", "m", "l", "c", "a"].forEach(function (f) { if (G[f]) it[f] = G[f]; }); it.x = LUCK_X; bazi["luck." + k] = it; });

  Object.keys(PLANET).forEach(function (p) {
    var P = PLANET[p];
    taksa["tk.boriwan." + p] = { n: P.n + " (your birth-day planet)", s: P.n, o: "your birth-day planet is " + P.n + ", which stands for " + P.q, p: "you are born with a natural strength for " + P.q, c: BH.boriwan.m, l: "in Taksa the companions area covers your partner and family too, so close relationships grow well when you look after the people around you", x: TK_X };
    Object.keys(BH).forEach(function (b) {
      if (b === "boriwan") return;
      var B = BH[b], it = { n: B.n + ", held by " + P.n, s: B.n.replace(/ \(\w+\)$/, "") };
      it[B.f] = B.m.replace("{p}", P.n); if (B.a) it.a = B.a.replace("{p}", P.n); if (B.f !== "a") it.o = it[B.f];
      it.x = "in Taksa, the Thai system of birth-day planets, this is one of eight bhumi, or life areas, and it covers " + B.g;
      taksa["tk." + b + "." + p] = it;
      var mt = { n: P.k + " period in Taksa, in " + B.n, s: "this Taksa period", t: "this stretch of your life is led by " + P.n + ", with the focus on " + P.q, x: MAHA_X };
      if (b === "kalakini") mt.a = "slow down a little on big decisions, take them one step at a time and talk them over with someone you trust first";
      taksa["maha." + p + "." + b] = mt;
    });
    taksa["maha." + p + ".boriwan"] = { n: P.k + " period in Taksa, in " + BH.boriwan.n, s: "this Taksa period", t: "this stretch of your life is led by " + P.n + ", with the focus on " + P.q, x: MAHA_X };
    life["lg.maha." + p] = { n: "your Taksa major period of " + P.n, s: "your Taksa period", t: "in the Taksa major periods, this stretch is led by " + P.n + ", with the focus on " + P.q, x: MAHA_X };
  });
  HOUSE.forEach(function (h, i) {
    var fav = { n: h.n, s: h.n.replace(/ \(\w+\)$/, ""), o: "the area of " + h.m + " is one of the stronger spots in your chart", x: L7_X }; fav[h.f] = "your number chart shows that the area of " + h.m + " is a strength you can put to use right away";
    var neu = { n: h.n, s: h.n.replace(/ \(\w+\)$/, ""), x: L7_X }; neu[h.f] = "the area of " + h.m + " has a moderate amount of energy for you, so looking after it at your usual pace is enough";
    var cau = { n: h.n, s: h.n.replace(/ \(\w+\)$/, ""), a: "give a little more time, bit by bit, to " + h.m, x: L7_X }; cau[h.f] = "your number chart shows that the area of " + h.m + " has less energy for now, so you can build it up gradually";
    lek7["l7." + i + ".favourable"] = fav; lek7["l7." + i + ".neutral"] = neu; lek7["l7." + i + ".caution"] = cau;
  });
  Object.keys(DOM).forEach(function (d) {
    ["favourable", "neutral", "caution"].forEach(function (t) {
      // name the curve, not the topic again ("Start with your love life (from age 18): your love life …" read twice)
      var g = { work: "work", money: "money", love: "love", care: "self-care" }[d] || DOM[d].n;
      var it = { n: "the " + g + " curve of your life graph (from age {d})", s: "the " + g + " curve", x: LG_X }; it[DOM[d].f] = DOM_LINE[d][t]; if (t === "caution") it.a = DOM_ACT[d]; if (d === "work") it.o = DOM_LINE[d][t];
      life["lg.now." + d + "." + t] = it;
    });
    life["lg.next." + d] = { n: "the next stage for your " + DOM[d].n, s: "the next stage", t: "in the next age period, your " + DOM[d].n + " shows signs of improving" };
  });
  Object.keys(GOD).forEach(function (k) { life["lg.luck." + k] = { n: "your BaZi luck period (" + GOD[k].n + ")", s: "your BaZi luck period", t: GOD[k].t, x: LUCK_X }; });
  Object.keys(TURN).forEach(function (k) { life["lg.turn." + k] = { n: "the next turning point (around age {d})", s: "the next turning point", t: TURN[k], x: TURN_X[k] }; });

  var Q = (root.FORTUNE_EN_Q = root.FORTUNE_EN_Q || []); root.FORTUNE_EN = root.FORTUNE_EN || {};
  [["bazi", bazi], ["taksa", taksa], ["lek7", lek7], ["lifegraph", life]].forEach(function (x) { var D = { domain: x[0], items: x[1] }; Q.push(D); root.FORTUNE_EN[x[0]] = D; });
  if (typeof module !== "undefined" && module.exports) module.exports = { bazi: bazi, taksa: taksa, lek7: lek7, lifegraph: life };
})(typeof window !== "undefined" ? window : globalThis);
