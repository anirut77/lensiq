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
/* BEGIN depth en.bazi (fortune-depth.js: material behind "อ่านเพิ่มเติม"; {t, c: true} = restraining, always shown) */
(/** @param {any} G */ function (G) {
  "use strict";
  var R = G.LQ_DEPTH = G.LQ_DEPTH || { build: {}, text: { th: {}, en: {}, zh: {} } };
  var T = {"_title":"The chart in more depth",
    "pg.year.peer":"The pillar {PE} is the year pillar, which the tradition uses for ancestry, roots, the first years of life and the wider society around you. A heavenly stem from the companion group suggests a childhood among siblings or classmates of your own age, learning to share, compete and rely on yourself early.",
    "pg.year.output":"In the year pillar {PE}, the place for ancestry, early surroundings and society at large, the stem belongs to the output group. Tradition reads this as a home or community that let you speak up, experiment and make things, so your natural talents tend to show while you are still young.",
    "pg.year.wealth":"The year pillar {PE} describes your roots, your early years and the larger world beyond the household. Its stem is in the wealth group, which suggests a background familiar with trade, earning a living or looking after property, and a practical attitude toward money picked up in youth.",
    "pg.year.officer":"Pillar {PE} sits in the year position, which stands for lineage, early childhood and society at large. A stem from the officer group points to a family line with standards, reputation or high expectations from elders, and a childhood that taught you discipline and responsibility ahead of your years.",
    "pg.year.resource":"Year pillar {PE} covers ancestry, formative years and the wider community. With a resource-group stem, the tradition pictures a childhood with generous elders, chances to learn and the shelter of a family name, which gives you a lasting reserve of knowledge and emotional security.",
    "pg.month.peer":"The month pillar {PE} carries great weight in the tradition: it speaks for parents, upbringing, the working environment and the element that commands your birth season. A companion-group stem suggests a field full of peers, where work moves along through teamwork and friendly competition.",
    "pg.month.output":"Month pillar {PE} stands for your parents, how you were raised, the setting of your career and the season that rules your chart. With an output-group stem, work suits you best when it involves ideas, speaking or craft, and the home you grew up in left room to try things out.",
    "pg.month.wealth":"In the month pillar {PE}, which describes parents, upbringing, career surroundings and the ruling season of birth, the stem comes from the wealth group. Careers often involve managing, trading or producing visible results, and your upbringing valued practical security and sensible planning.",
    "pg.month.officer":"The month pillar {PE} reflects your parents, your upbringing, the workplace around you and the commanding season. An officer-group stem points to a field with ranks, rules and clear roles, where you build a name through steady discipline and by being someone others can rely on.",
    "pg.month.resource":"Month pillar {PE} is the traditional place to read parents, upbringing, the career environment and the season in command. With a resource-group stem, teaching, scholarship or guided apprenticeship are favored, and the home you grew up in prized study and warmth.",
    "pg.hour.peer":"The hour pillar {PE} is read for children, students and juniors, ideas that are still ripening and the later years. A companion-group stem suggests later life spent among friends and contemporaries, and ideas that grow best when you work them out together with others.",
    "pg.hour.output":"Hour pillar {PE} speaks of children, pupils, younger colleagues, fresh ideas and the later years. Its stem is in the output group, which the tradition reads as having something of your own to hand on, such as knowledge, craft or stories, and later years given over to doing what you love.",
    "pg.hour.wealth":"Pillar {PE} in the hour position covers children, juniors, ideas and the closing chapters of life. A wealth-group stem suggests long-range plans and things you have gathered will bear fruit in time, and that you take care to lay solid foundations for the generation after you.",
    "pg.hour.officer":"The hour pillar {PE} points to children, students, juniors, ideas and the later years. With an officer-group stem you tend to take the role of guide or steward for those who follow, giving them structure and direction, while your own thinking is orderly and your later years carry meaningful duties.",
    "pg.hour.resource":"In the hour pillar {PE}, which the tradition links to children, students, ideas and later life, the stem belongs to the resource group. The latter part of life then leans toward study, reflection and peace of mind, and younger people tend to see you as an adviser they can trust.",
    "spouse.peer":"The day branch of {PE} is the spouse palace, and its main element belongs to the companion group. The tradition pictures a partnership that feels like friendship, with each person keeping personal space, sharing the load and agreeing clearly on who handles which household duties.",
    "spouse.output":"The day pillar {PE} holds the spouse palace in its branch, whose main element is in the output group. Affection tends to be shown through conversation, cooking, small gifts or creative projects, and the home is warmed by laughter and by doing things together.",
    "spouse.wealth":"The spouse palace is the branch of the day pillar {PE}, and its main element is in the wealth group. You tend to see a relationship in concrete terms, caring through actions, a stable home and shared plans, so the household runs in an orderly way and values practical comfort.",
    "spouse.officer":"In the day pillar {PE} the branch is the spouse palace, and its main element is in the officer group. You value seriousness, responsibility and respect for what two people agree on, and home life has clear routines and goals, working best with a partner who speaks plainly and returns the respect.",
    "spouse.resource":"The day pillar {PE} gives the spouse palace in its branch, with a main element from the resource group. You look for a partner who cares for your heart, learns alongside you and offers a mature kind of warmth, and the home favors calm, deep conversation and support in both directions.",
    "none.wood":{"t":"Your chart holds almost no Wood. The tradition reads this as less of the energy of beginnings, growth and long-range planning, which you may draw from outside. Gentle balancing includes green tones, tree-lined walks, a plant at home or learning a skill in small steps. This is belief-based, so use your own judgement.",
    "c":true},
    "none.fire":{"t":"There is hardly any Fire in your chart, which the tradition links with less warmth in expression, enthusiasm and social energy. Gentle balancing can include red or orange tones, morning sunlight, meeting friends who lift your mood or a lively hobby. This is belief-based, so please use your own judgement.",
    "c":true},
    "none.earth":{"t":"Your chart has very little Earth, which the tradition reads as steadiness, grounding and trust that need building up on purpose. Gentle balancing includes yellow and brown tones, a steady daily routine, regular meals and a space that feels like home. This is belief-based, so please use your own judgement.",
    "c":true},
    "none.metal":{"t":"Your chart carries almost no Metal. The tradition reads this as less natural decisiveness, order and boundary-setting, which can be practised. Gentle balancing includes white or silver tones, a tidy desk, fixed working hours and making small decisions sooner. This is belief-based, so use your own judgement.",
    "c":true},
    "none.water":{"t":"There is very little Water in your chart. The tradition reads this as flexibility, reflection and a settled mind coming more from outside. Gentle balancing includes blue or black tones, sitting near water and a quiet moment each day. This is belief-based, so use your own judgement.",
    "c":true},
    "next.peer":"Your next 10-year luck pillar begins at age {A} with {PE}, whose stem is in the companion group. The tradition expects that decade to emphasize friends, networks and shared effort, a good time for building a team or finding allies, while agreeing on shared costs early keeps things comfortable.",
    "next.output":"At age {A} the next luck pillar, {PE}, starts, and its stem belongs to the output group. That decade is read as a time for making things, putting yourself on a stage and letting people see your voice, so gathering your strengths into something you can pass on suits it well.",
    "next.wealth":"A new 10-year luck pillar, {PE}, begins at age {A}, and its stem is in the wealth group. The tradition links that decade with earning, managing resources and results you can touch, a good moment to learn how money systems work and to lay foundations one step at a time.",
    "next.officer":"From age {A} the luck pillar {PE} takes over, and its stem is from the officer group. Expect bigger roles, titles and outside expectations in that decade, so preparing discipline, knowledge and rest beforehand will help you step into the new position with composure.",
    "next.resource":"Luck pillar {PE} opens at age {A}, with a stem in the resource group. The tradition says that decade favors study, certificates, guidance from elders and tending to your inner life, and mentors often appear to open a path before you step further."};
  R.text.en.bazi = T;
})(typeof globalThis !== "undefined" ? globalThis : this);
/* END depth en.bazi */
/* BEGIN depth en.taksa (fortune-depth.js: material behind "อ่านเพิ่มเติม"; {t, c: true} = restraining, always shown) */
(/** @param {any} G */ function (G) {
  "use strict";
  var R = G.LQ_DEPTH = G.LQ_DEPTH || { build: {}, text: { th: {}, en: {}, zh: {} } };
  var T = {"_title":"More from the taksa chart",
    "day.1":"People born on Sunday belong to the Sun in the Thai taksa system, which carries a power number of 6, the colour red and the image of the sun deity bringing light. They tend to be dignified, generous and happy to lead, and their strength is a confidence that draws others into a shared project.",
    "day.2":"Monday births fall under the Moon, with a power number of 15, a pale yellow colour and the image of the moon deity shedding cool light. Tradition describes them as gentle, sensitive and attentive, and their strength is a charm and a feel for other people's moods that makes company easy.",
    "day.3":"Tuesday births belong to Mars, with power number 8, the colour pink and the image of a brave warrior deity. They are described as direct, quick to act and hard-working, and their strength is the courage to decide and the steady drive that keeps a job moving.",
    "day.4":"Wednesday daytime births are ruled by Mercury, with power number 17, the colour green and the image of a deity skilled in speech. They are said to be talkative, curious and quick to adapt, and their strength is communication and trade that keep a negotiation running smoothly.",
    "day.5":"Thursday births belong to Jupiter, with power number 19, the colour orange and the image of the teacher of the gods. They are seen as studious, polite and principled, and their strength is a wisdom and kindness that makes elders glad to help.",
    "day.6":"Friday births fall under Venus, which has power number 21, the colour light blue and the image of a deity who loves art and refinement. They tend to be sweet-natured, comfort-loving and tasteful, and their strength is a charm and a delicate hand in creative work.",
    "day.7":"Saturday births belong to Saturn, with power number 10, the colour purple and the image of a quiet, composed deity. They are described as reserved, patient and careful, and their strength is a sense of responsibility that carries long projects through by steady effort.",
    "day.8":"Wednesday night births, ruled by Rahu, have power number 12, the colour grey-black and the image of Rahu swallowing the moon. They are described as unconventional, ambitious and quick to change, and their strength is the nerve to try a new road and spot openings others overlook.",
    "maha.next.1":"At age {A} the next major period passes to the Sun and lasts 6 years. In the Thai tradition it brings prestige, leadership roles and dealings with elders or institutions into focus, a good time to put yourself forward for work that needs a steady presence and public recognition.",
    "maha.next.2":"The Moon takes over as ruler of the major period at age {A} and holds it for 15 years, a long stretch. Feelings grow finer, charm and friendships stand out, and home and the people nearest you carry weight, which suits warm relationships and work done with a caring heart.",
    "maha.next.3":"When you reach age {A}, Mars opens an 8-year major period. The tradition describes a time of high drive in which starting, competing and tackling demanding work pay off, so it helps to set clear goals and leave room for rest.",
    "maha.next.4":"Age {A} is when the major period is handed to Mercury, running for 17 years. It is a long season of learning, negotiating, travel and trade, with news and new acquaintances arriving often, and it suits adding skills and widening your circle.",
    "maha.next.5":"At age {A}, Jupiter begins a 19-year major period, one of the longest in the system. Wisdom, supportive elders, trustworthiness and chances to study further or teach come forward, so a reputation built on knowledge and good conduct suits it.",
    "maha.next.6":"Venus starts its major period at age {A} and rules for 21 years, the longest turn in the cycle. The tradition links it with love, art, comfort and income that grows from charm, a good span for building a home, family life and creative work.",
    "maha.next.7":"From age {A}, Saturn governs a 10-year major period. It is read as a time of patience, heavy but foundation-building work and lessons in discipline, with results arriving slowly yet lasting, so it suits setting up systems and keeping a steady personal routine.",
    "maha.next.8":"Rahu's 12-year major period begins at age {A}. Tradition connects it with change, ambition and unexpected turns, perhaps trying something new, moving house or joining a different circle, and it rewards an open mind and a firm footing before any large step."};
  R.text.en.taksa = T;
})(typeof globalThis !== "undefined" ? globalThis : this);
/* END depth en.taksa */
/* BEGIN depth en.lek7 (fortune-depth.js: material behind "อ่านเพิ่มเติม"; {t, c: true} = restraining, always shown) */
(/** @param {any} G */ function (G) {
  "use strict";
  var R = G.LQ_DEPTH = G.LQ_DEPTH || { build: {}, text: { th: {}, en: {}, zh: {} } };
  var T = {"_title":"More from the seven-number chart",
    "house.0":"The house of self covers temperament, the foundations of your chart and the way you carry yourself into the world. Its column total here is {N}. Readers treat a high total as a clear identity with real momentum, and a low one as confidence that grows by doing things rather than by waiting.",
    "house.1":"The house of wealth in the tradition covers income, savings, belongings you carry with you and even the speech you earn a living with. Your column total is {N}. A high figure reads as a good flow of resources, while a low one suggests building habits of saving and earning bit by bit.",
    "house.2":"The house of friends and siblings governs companions, brothers and sisters, short journeys, news and contact. Your total here is {N}. A high total is read as a lively social circle and easy communication, a low total as a quieter circle that you can still deepen on purpose.",
    "house.3":"This is the house of family and home, covering relatives, residence, vehicles, the mother's side and a sense of belonging. The column adds up to {N}. High totals suggest a settled, supportive base, and low ones suggest making your home a place you shape yourself.",
    "house.4":"The house of children, love and creativity governs offspring, pupils, romance, play and the ideas you enjoy making real. Its column total is {N}. A high total reads as plenty of warmth and inventiveness, and a low one as an area that blossoms when you give it regular time.",
    "house.5":"The house of rivals and effort covers competitors, demanding tasks and service work. Your column adds to {N}. Readers see a high total as resilience under friction and a gift for hard work, and a low total as a calmer stretch where you can pick your contests with care.",
    "house.6":"The house of partnership governs spouse, business partners and anyone you sign agreements with. The total of its column is {N}. A high total suggests partnerships come easily and bring support, and a low total suggests taking time over choosing and agreeing terms with those you work or live beside.",
    "planet.1":"The Sun heads the column in {H}, bringing a nature that is proud, clear and authoritative. Matters here tend to carry a sense of dignity: you like to take charge of them, and others look to you for direction and an honest standard.",
    "planet.2":"With the Moon at the head of {H}, the tone is gentle, changeable and caring. Things in this area follow your feelings and the people around you, so they bloom when you nurture them and keep a steady, kind rhythm.",
    "planet.3":"Mars leads the column in {H}, adding courage, speed and hard-working drive. Matters here move briskly and reward action, though they go best when you plan ahead and let your energy out in good doses.",
    "planet.4":"Mercury heads {H}, a planet of speech, learning and trade. Matters here run on conversation, information and quick wits, so asking, writing things down and making contacts are how this area improves.",
    "planet.5":"Jupiter at the top of {H} brings generosity, broad perspective and good counsel. This area tends to grow through learning and the kindness of elders or teachers, and sharing what you know widens it further.",
    "planet.6":"Venus heading {H} adds charm, pleasure and an eye for art. Matters here lean toward harmony and comfort, and they flourish when you give them care, courtesy and time to enjoy them.",
    "planet.7":"Saturn leads the column in {H}, a planet of patience, structure and slow results. Matters here ask for steadiness and responsibility, and they repay it with a lasting, solid footing rather than quick wins.",
    "hname.0":"the house of self",
    "hname.1":"the house of wealth",
    "hname.2":"the house of friends and siblings",
    "hname.3":"the house of family and home",
    "hname.4":"the house of children and creativity",
    "hname.5":"the house of rivals and effort",
    "hname.6":"the house of partnership"};
  R.text.en.lek7 = T;
})(typeof globalThis !== "undefined" ? globalThis : this);
/* END depth en.lek7 */
/* BEGIN depth en.lifegraph (fortune-depth.js: material behind "อ่านเพิ่มเติม"; {t, c: true} = restraining, always shown) */
(/** @param {any} G */ function (G) {
  "use strict";
  var R = G.LQ_DEPTH = G.LQ_DEPTH || { build: {}, text: { th: {}, en: {}, zh: {} } };
  var T = {"_title":"More on the turning points",
    "turn.taksa.1":"Around age {A} the Thai cycle of periods hands over to the Sun. You may feel a stronger pull to stand on your own, take full responsibility and be recognised for it, so it is a good time to state your goals plainly.",
    "turn.taksa.2":"At {A} the Moon takes the baton in the Thai cycle, and the mood of life softens toward feelings. Family, home and friendship may count for more, so spend time with people who put you at ease and make home a place to rest.",
    "turn.taksa.3":"By age {A} Mars is in charge, and many people feel a surge of energy, a wish to prove their skill and to restart projects left half done. Burn off the extra energy with moderate exercise and plan clearly before you hurry.",
    "turn.taksa.4":"At {A} Mercury picks up the thread, filling life with news, study and negotiation. New contacts and openings come through conversation, so update your skills and keep agreements and notes in good order.",
    "turn.taksa.5":"Around age {A} Jupiter becomes the lead planet and life's tone grows broader and more generous. Elders, teachers and chances to grow come more readily, so be open to advice and give time to learning.",
    "turn.taksa.6":"At {A} Venus takes the lead, and comfort, affection, art and personal taste play a bigger part in your days for a long stretch. It is a good time to nurture good relationships and do things that feed your spirit.",
    "turn.taksa.7":"When you reach {A}, Saturn sets the pace and life asks for consistency. Results are not rushed but they hold, so use this stage to organise systems, practise discipline and drop what you no longer need.",
    "turn.taksa.8":"At age {A} Rahu changes the tone of life, with more curiosity, appetite for trying things and meetings with the unfamiliar. You may move or shift direction, so set your footing with a back-up plan and people you trust.",
    "turn.bazi.peer":"A new 10-year luck pillar of the companion group begins around age {A}. People around you, including colleagues, siblings and allies, play a larger part, and the decade invites cooperation, a clear division of duties and a protected space of your own.",
    "turn.bazi.output":"At age {A} a 10-year luck pillar of the output group opens. What you think and make gets a bigger stage, with creative work, teaching and public speaking in the spotlight, so keep your work together in a concrete portfolio.",
    "turn.bazi.wealth":"Around age {A} a 10-year luck pillar from the wealth group begins, turning attention to income, money management and measurable results. It favors building tidy financial habits and work that yields visible outcomes.",
    "turn.bazi.officer":"At {A} a 10-year luck pillar from the officer group starts, making roles, titles and outside expectations clearer. Work may grow and call for discipline, so settle your priorities and rest time in advance.",
    "turn.bazi.resource":"A 10-year luck pillar of the resource group begins at age {A}. Teachers, elders and chances to study take a leading part, making it a decade for gathering knowledge, certificates and calm of mind before the next step.",
    "turn.saturn":{"t":"Around age {A} comes the Saturn return in Western astrology, when Saturn comes back to where it stood at your birth. It is traditionally a time to review the structures and commitments in your life, best met with patient adjustments rather than hurried big moves. This is belief-based, so use your own judgement.",
    "c":true},
    "turn.prog.0":"Around age {A} the progressed Sun moves into Aries, and the tone of the following thirty years or so turns bold and self-reliant. You may feel more like yourself and more willing to be the first to raise an idea.",
    "turn.prog.1":"At age {A} the progressed Sun enters Taurus, slowing the pace and anchoring it. For roughly the next thirty years comfort, tangible things and steady habits count for more, and you take satisfaction in what you build gradually.",
    "turn.prog.2":"The progressed Sun moves into Gemini around age {A}. The coming thirty years or so are full of curiosity, conversation, study and many threads of contact, and you adapt faster and enjoy a wider range of interests.",
    "turn.prog.3":"At about {A} the progressed Sun moves into Cancer, and the next thirty years lean gentle and home-centred. Family and a sense of safety weigh more, and you tend to care for those near you and make a real home.",
    "turn.prog.4":"Around age {A} the progressed Sun steps into Leo. The following three decades or so are brighter and want expression, giving pride, generosity and heartfelt work a bigger stage.",
    "turn.prog.5":"When the progressed Sun enters Virgo around age {A}, the tone turns attentive to detail, order and useful service. The next thirty years suit refining habits and craft until they are polished.",
    "turn.prog.6":"At age {A} the progressed Sun enters Libra, and the next thirty years or so centre on balance, fairness and relationships that fit. Cooperation, mediation and a taste for harmony grow in importance.",
    "turn.prog.7":"The progressed Sun reaches Scorpio at about age {A}, and the following thirty years have a deeper, more serious tone. You look beneath the surface, value inner change and bonds of real depth, and commit firmly to what you choose.",
    "turn.prog.8":"At age {A} the progressed Sun enters Sagittarius, widening the horizon for the next thirty years or so. Travel, philosophy and sharing what you know draw you, and the outlook is open and hopeful.",
    "turn.prog.9":"Around age {A} the progressed Sun enters Capricorn. The next thirty years are orderly and patiently ambitious, prizing achievements built step by step, and you take the long view and grow into a dependable senior figure.",
    "turn.prog.10":"The progressed Sun moves into Aquarius at about age {A}, and the next thirty years feel independent, original and community-minded. New ideas, groups and doing something unlike anyone else's work draw you in.",
    "turn.prog.11":"At age {A} the progressed Sun moves into Pisces, softening the tone of the next thirty years or so with imagination and compassion. Art, inner life and helping others take on more meaning.",
    "peak.work":"The timeline shows your work line strongest around age {A}. Use that stretch to take on a new role, propose the project you have been holding back and let others see your results, and prepare skills and a record of your work beforehand.",
    "peak.money":"Money looks strongest on the timeline around age {A}. That stretch is well used for building systems, such as a reserve fund, a clearer budget and learning about money, and for choices that last, with no need to hurry.",
    "peak.love":"The timeline places love and relationships at their strongest around age {A}. Hearts open more easily then, so spend time with those you care about, say thank you, listen well and meet new people in places you enjoy.",
    "peak.care":"Around age {A} the timeline shows looking after yourself at its strongest. Habits are easy to set in that stretch, such as regular bedtimes, walks, meals you enjoy and rest built into the week."};
  R.text.en.lifegraph = T;
})(typeof globalThis !== "undefined" ? globalThis : this);
/* END depth en.lifegraph */
