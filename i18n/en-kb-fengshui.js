/* i18n/en-kb-fengshui.js — English reading data (feng shui: Eight Mansions kua number, favorable directions, Flying Stars)
   for fortune-ai.js (English mode). Mirrors i18n/zh-kb-fengshui.js key for key.
   Keys: kua.N (kua number), star.N (nine stars, annual/monthly center), dir.* (Eight Mansions favorable directions),
   rec.<door|desk|bed>.<dir> (compass records), room.<room>.<dir>.s<star> (rooms on the floor-plan grid), photo.N (room photos)
   Remedies are limited to arranging, tidying, light, colors and desk/bed direction.
   For entertainment, based on traditional beliefs. */
(function (root) {
  "use strict";
  var items = {};

  /* ---------- kua number (Eight Mansions) ---------- */
  var KX = "in Eight Mansions feng shui, your kua number comes from your birth year and places you in the East or West group, each with four favorable directions";
  var KUA = {
    1: { g: "Kan", gt: "Water", el: "water", grp: "East", dirs: "north, south, east and south-east", p: ["you are adaptable, thoughtful and considerate", "you are a good listener who understands how others feel"] },
    2: { g: "Kun", gt: "Earth", el: "earth", grp: "West", dirs: "north-east, west, north-west and south-west", p: ["you are warm and dependable, and you look after the people around you", "you are grounded and steady, and people feel at ease with you"] },
    3: { g: "Zhen", gt: "Thunder", el: "wood", grp: "East", dirs: "south, north, south-east and east", p: ["you are enthusiastic and positive, always willing to make the first move", "you are full of energy and bring real drive to whatever you do"] },
    4: { g: "Xun", gt: "Wind", el: "wood", grp: "East", dirs: "north, south, east and south-east", p: ["you are good at bringing people together, and you communicate well", "you are flexible and know how to adjust when things change"] },
    6: { g: "Qian", gt: "Heaven", el: "metal", grp: "West", dirs: "west, north-east, south-west and north-west", p: ["you have firm principles and a natural gift for leadership", "you are responsible, and people can always count on you"] },
    7: { g: "Dui", gt: "Lake", el: "metal", grp: "West", dirs: "north-west, south-west, north-east and west", p: ["you are cheerful and talkative, and you fit easily into any group", "you have a playful way with words, and there is always life around you"] },
    8: { g: "Gen", gt: "Mountain", el: "earth", grp: "West", dirs: "south-west, north-west, west and north-east", p: ["you are steady and patient, and you like to plan ahead", "you take things step by step and always see them through"] },
    9: { g: "Li", gt: "Fire", el: "fire", grp: "East", dirs: "east, south-east, north and south", p: ["you have real charm and naturally inspire others", "you like things clear and open, and you act with integrity"] }
  };
  Object.keys(KUA).forEach(function (n) {
    var K = KUA[n];
    items["kua." + n] = {
      n: "kua number " + n + " (the " + K.gt + " trigram, " + K.g + ")", s: "kua " + n,
      o: ["your kua belongs to the " + K.gt + " trigram (" + K.g + "), which makes you a " + K.el + "-element member of the " + K.grp + " group",
        K.dirs + " are the four directions that suit you best"],
      p: K.p,
      x: KX
    };
  });

  /* ---------- Flying Stars ---------- */
  var SX = "in Flying Stars feng shui, nine numbered stars move through the nine zones of a home each year and month, and Period Nine runs from twenty twenty-four to twenty forty-three";
  var STAR = {
    1: { n: "the One White star", nm: "One White",
      o: "the One White star stands for career progress, good news and new openings for you, and it is the rising star of the future in Period Nine",
      t: "this is a good time for you to push work and plans forward and watch for new openings",
      a: "add a touch of white or silver here and use this area for work or planning" },
    2: { n: "the Two Black star", nm: "Two Black",
      o: "the Two Black star carries a tiring kind of energy, so tradition keeps the area it visits calm and quiet for you",
      t: "this is a time to watch your daily rhythm and give yourself plenty of rest",
      a: "keep this area open, airy and tidy, with touches of white, silver or gold" },
    3: { n: "the Three Jade star", nm: "Three Jade",
      o: "the Three Jade star is linked to differences of opinion, so it favors calm, patient conversation on your part",
      t: "this is a time to speak a little more slowly and listen more to the other side",
      a: "add some soft warm light or a little pink, and keep large plants and water features out of this area" },
    4: { n: "the Four Green star", nm: "Four Green",
      o: "the Four Green star stands for learning, wisdom, creativity and romance in your life",
      t: "this is a good time for study, courses and creative work",
      a: "turn this area into a reading corner with a small plant, a vase of fresh water or a bookshelf" },
    5: { n: "the Five Yellow star", nm: "Five Yellow",
      o: "the Five Yellow star marks the area that tradition asks you to keep the quietest all year",
      t: "this is a time to leave that area free of digging or building work and keep it neat and settled",
      a: "skip renovating, hammering or moving heavy furniture in this area, and brighten it with white or gold accents" },
    6: { n: "the Six White star", nm: "Six White",
      o: "the Six White star stands for helpful mentors, leadership and a good reputation for you",
      t: "this is a time when senior people and mentors are likely to back you",
      a: "use this area as a workspace or a place to receive guests, with touches of ceramic, stone or round metal shapes" },
    7: { n: "the Seven Red star", nm: "Seven Red",
      o: "the Seven Red star has passed its peak, and tradition treats it as a reminder to look after your belongings and your words",
      t: "this is a time to keep valuables put away and think twice before you speak",
      a: "keep your valuables in one fixed, locked spot and add a touch of blue or black" },
    8: { n: "the Eight White star", nm: "Eight White",
      o: "the Eight White star stands for stability and building wealth, and in Period Nine it is still a favorable star for you",
      t: "this is a good time for you to build up steadily and grow at a calm pace",
      a: "use this area often, and warm it with soft light, beige tones, ceramics or natural stone" },
    9: { n: "the Nine Purple star", nm: "Nine Purple",
      o: "the Nine Purple star is the ruling star of Period Nine, bringing you achievement, recognition and happy occasions",
      t: "this is a good time for you to step into the spotlight and plan happy gatherings",
      a: "keep this area bright, and add some greenery or warm light" }
  };
  Object.keys(STAR).forEach(function (n) { var S = STAR[n]; items["star." + n] = { n: S.n + " (star " + n + ")", s: S.n, o: S.o, t: S.t, a: S.a, x: SX }; });

  /* ---------- Eight Mansions favorable directions ---------- */
  items["dir.shengqi"] = { n: "your Sheng Qi direction (life-giving energy)", s: "your Sheng Qi direction",
    o: "Sheng Qi is your liveliest direction, the one tied to drive, progress and new beginnings",
    w: ["when your desk faces your Sheng Qi direction, you tend to work with more energy", "planning your work or holding important meetings toward Sheng Qi helps your thinking stay clear"],
    m: ["a front door or work corner that opens toward your Sheng Qi direction is traditionally said to welcome new opportunities", "you can set up a money-planning corner facing Sheng Qi and pick a few small goals you can really reach"],
    x: "in Eight Mansions feng shui, Sheng Qi (life-giving energy) is the best of your four favorable directions, linked to growth and success" };
  items["dir.tianyi"] = { n: "your Tian Yi direction (heavenly doctor)", s: "your Tian Yi direction",
    o: "Tian Yi is your restoring direction, linked to rest and getting your energy back",
    a: ["point your headboard toward Tian Yi so you can sleep more soundly", "place your rest corner or dining table in your Tian Yi direction"],
    x: "Tian Yi (literally the heavenly doctor) is the Eight Mansions direction for rest, recovery and renewed energy" };
  items["dir.yannian"] = { n: "your Yan Nian direction (longevity and harmony)", s: "your Yan Nian direction",
    o: "Yan Nian is your direction of harmony, love and lasting friendship",
    l: ["when your shared headboard or conversation corner faces Yan Nian, your home feels warmer", "turning your sofa toward Yan Nian helps your family conversations flow more easily"],
    c: ["a seating area for guests in your Yan Nian direction is traditionally said to help friendship and cooperation", "talking things over or holding meetings toward Yan Nian makes it easier for you to reach agreement"],
    x: "Yan Nian (literally extended years) is the Eight Mansions direction for harmony, relationships and long friendships" };
  items["dir.fuwei"] = { n: "your Fu Wei direction (steady stability)", s: "your Fu Wei direction",
    o: "Fu Wei is your steadiest direction, bringing focus and self-confidence",
    p: ["when you want to quiet your mind and reflect, facing Fu Wei makes it easier for you to focus", "when you need to concentrate, sitting toward Fu Wei helps you feel settled"],
    a: ["turn your reading corner or quiet sitting spot toward Fu Wei", "try pointing your headboard toward Fu Wei as another option for restful sleep"],
    x: "Fu Wei (literally hidden position) is the Eight Mansions direction of personal stability, calm and clear focus" };
  items["dir.quiet"] = { n: "the directions best kept open and clear", s: "these directions",
    o: "these directions are ones you can use less, and they suit a bathroom, storage room or hallway",
    a: ["keep these areas open, airy and tidy, and avoid sitting or lingering there for long", "adjust the direction of your desk or bed a little and balance things with your favorable directions"],
    x: "Eight Mansions also names four less supportive directions, which tradition suggests keeping clean, open and lightly used" };

  /* ---------- compass-recorded directions ---------- */
  var DIR = { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" };
  Object.keys(DIR).forEach(function (d) {
    var z = DIR[d];
    items["rec.door." + d] = { n: "a front door facing " + z, s: "your front door",
      o: "your front door faces " + z + ", and it is the entrance where energy flows into your home",
      m: "keeping your doorway bright and tidy, with an easy path in and out, makes your home feel more prosperous",
      a: "keep the area in front of your door bright and clear away anything piled at the entrance" };
    items["rec.desk." + d] = { n: "a desk facing " + z, s: "your desk",
      o: "your desk faces " + z + ", the direction you focus toward every day",
      w: "when your desk is tidy and has solid support behind it, you feel more at ease while you work",
      a: "fine-tune your desk direction against your favorable directions so a wall supports your back" };
    items["rec.bed." + d] = { n: "a headboard pointing " + z, s: "your headboard",
      o: "your headboard points " + z + ", the direction you rest toward every night",
      l: "when your bedroom feels cozy and quiet, your relationship tends to feel more harmonious too",
      a: "set your headboard against a solid wall and keep the bed out of direct line with the door" };
  });

  /* ---------- rooms on the floor-plan grid ---------- */
  var ROOM = { door: "front door", bed: "bedroom", work: "study", kitchen: "kitchen", bath: "bathroom", living: "living room" };
  var ZONE = { N: "the north zone", NE: "the north-east zone", E: "the east zone", SE: "the south-east zone", S: "the south zone", SW: "the south-west zone", W: "the west zone", NW: "the north-west zone", C: "the center" };
  // life area and suitable decor for each bagua zone; f = the reading field it belongs to
  var BAGUA = {
    N: { area: "career and your path in life", deco: "a picture of water, a mirror or some glassware", f: "w" },
    NE: { area: "knowledge and personal growth", deco: "a bookshelf, natural stone or ceramics", f: "w" },
    E: { area: "family and well-being", deco: "green plants, solid wood furniture or a family photo", f: "c" },
    SE: { area: "wealth and abundance", deco: "healthy growing plants and touches of purple or green", f: "m" },
    S: { area: "reputation and recognition", deco: "warm light, a photo you are proud of or a certificate", f: "w" },
    SW: { area: "love and partnership", deco: "decor arranged in pairs or a happy photo of the two of you", f: "l" },
    W: { area: "children and creativity", deco: "artwork or round metal objects", f: "p" },
    NW: { area: "helpful people and travel", deco: "photos of places you want to visit, a map or metal objects", f: "c" },
    C: { area: "the heart and balance of the home", deco: "open, uncluttered space and plenty of light", f: "a" }
  };
  Object.keys(ROOM).forEach(function (r) {
    Object.keys(ZONE).forEach(function (d) {
      for (var s = 1; s <= 9; s++) {
        var S = STAR[s], B = BAGUA[d], it = {
          n: "the " + ROOM[r] + " in " + ZONE[d] + " (" + S.nm + ")", s: "your " + ROOM[r],
          o: "your " + ROOM[r] + " sits in " + ZONE[d] + ", where " + S.n + " is in charge this year",
          t: [S.o, S.t],
          a: S.a
        };
        var tip = "in the bagua (the feng shui map of life areas), " + ZONE[d] + " stands for " + B.area + ", so your " + ROOM[r] + " can take " + B.deco;
        if (B.f === "a") it.a = [S.a, "keep the center of your home, where your " + ROOM[r] + " sits, open, tidy and well lit"];
        else it[B.f] = tip;
        items["room." + r + "." + d + ".s" + s] = it;
      }
    });
  });

  /* ---------- room photos ---------- */
  for (var i = 0; i < 12; i++) {
    items["photo." + i] = { n: "room photo " + (i + 1), s: "this photo",
      o: "the light and tidiness in this room photo give you a useful reference for adjusting your layout",
      a: "start with the easiest change you can see in the photo, fixing the light first and then clearing clutter" };
  }

  var D = { domain: "fengshui", items: items };
  (root.FORTUNE_EN_Q = root.FORTUNE_EN_Q || []).push(D);
  root.FORTUNE_EN = root.FORTUNE_EN || {}; root.FORTUNE_EN[D.domain] = D;
  if (typeof module !== "undefined" && module.exports) module.exports = D;
})(typeof window !== "undefined" ? window : globalThis);
