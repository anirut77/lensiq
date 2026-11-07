/* i18n/en-kb-horoscope.js — English reading data (horoscope: Thai astrology + BaZi + numerology) for fortune-ai.js (English mode). Mirrors i18n/zh-kb-horoscope.js key for key.
   Keys (match horoscope.js buildFacts / buildDailyFacts):
     thai.day.0–7 (Sunday…Saturday, 7 = Wednesday night / Rahu), thai.rasi.0–11, thai.lagna.0–11 (Thai sidereal zodiac)
     cn.year.<animal>.<el> → cn.animal.0–11 + cn.el.<wood|fire|earth|metal|water>
     bazi.dm.0–9, bazi.strength.<strong|weak>, bazi.excess.<el>, bazi.lack.<el>, bazi.useful.<el>, bazi.god.<BJ…ZY>
     num.lp.<1–9|11|22|33>, num.bday.1–31, num.name.1–9
     today.bhumi.<x> → bhumi.<x>; today.rel.<x> / month.rel.<x> → rel.<x>; today.clash
   For entertainment, based on traditional beliefs. */
(function (root) {
  "use strict";
  var I = {};

  /* ---------- Birth day (Thai astrology: ruling planet and color) ---------- */
  var DAY_INFO = [
    ["your Sunday birth", "your Sunday birth", "Sunday", "the Sun", "red"],
    ["your Monday birth", "your Monday birth", "Monday", "the Moon", "yellow"],
    ["your Tuesday birth", "your Tuesday birth", "Tuesday", "Mars", "pink"],
    ["your Wednesday (daytime) birth", "your Wednesday birth", "Wednesday daytime", "Mercury", "green"],
    ["your Thursday birth", "your Thursday birth", "Thursday", "Jupiter", "orange"],
    ["your Friday birth", "your Friday birth", "Friday", "Venus", "blue"],
    ["your Saturday birth", "your Saturday birth", "Saturday", "Saturn", "purple"],
    ["your Wednesday-night birth (Rahu)", "your Wednesday-night birth", "Wednesday night", "Rahu", "gray"]
  ];
  var DAY_X = "in Thai tradition each weekday has its own ruling planet and color, and the day you were born on is read as a key to your character";
  var DAYS = [
    { p: "you lead with sunny warmth, and wherever you go people tend to ask for your opinion", w: "you do your best work when you are in charge of something big with a clear goal", m: "you earn well through your name and reputation, as long as you keep spending for appearances in check",
      l: "when you love someone you look after them wholeheartedly and want to be their rock", c: "you are generous and love treating friends, so people often see you as the heart of the group", a: "share the stage with others, and you will gain a team that truly likes you",
      t: "early mornings and the start of each week are when your energy shines brightest, which makes them good times for important decisions" },
    { p: "you are gentle and attentive, reading other people's moods as if you had a built-in radar", w: "you shine in work that involves caring for people, coordinating, or an eye for beauty and creativity", m: "you have a natural feel for saving and often plan ahead for your family's needs too",
      l: "your love is warm and thoughtful, and you remember every little thing about your partner", c: "you are pleasant to talk to and quietly charming, so people around you love to confide in you", a: "set a gentle boundary for your heart so you do not carry everyone's feelings alone",
      t: "quiet evenings and nights are when your best ideas tend to bubble up" },
    { p: "you are brave, straightforward and quick to act, never waiting for someone else to move first", w: "you work fast and decisively, and you are the force that pushes your team forward", m: "you earn through hard work and boldness, and a short pause before spending keeps things steadier",
      l: "you love sincerely and say what you feel, with no patience for emotional games", c: "you are the friend people can count on in a pinch, even if your words are sometimes a little blunt", a: "when something makes you impatient, count to ten before you respond",
      t: "deadlines and challenging targets are what bring out your real strength" },
    { p: "you are quick-witted and well-spoken, and you pick up new things remarkably fast", w: "you excel at communication, sales and negotiation, and at bringing people together", m: "you often spot opportunities in conversation, so your income tends to come from several sources",
      l: "you want a relationship where you can talk about anything and laugh together", c: "your friends come from every walk of life, and you are often the first to hear the news", a: "write down what you want to do and finish it one item at a time, so your cleverness turns into visible results",
      t: "daytime meetings and conversations are when ideas and opportunities find you most easily" },
    { p: "you are steady and principled, seeing far ahead like a wise teacher", w: "you suit roles as an advisor, a trainer or the person in charge of long-term planning", m: "your finances grow steadily on the knowledge and trust you have built up",
      l: "you are serious and steady in love and hope to find a partner you can grow with", c: "friends often lean on your ideas, and elders tend to look out for you", a: "listen to what younger people think, and your learning will stay fresh and lively",
      t: "starting a course or a new plan at the beginning of the month often goes especially well for you" },
    { p: "you are charming and love beauty, and you create a warm atmosphere wherever you go", w: "you do well in art, design, service and any work built on good relationships", m: "your charm and connections often bring money your way, so keep a fun budget separate from your savings",
      l: "you are romantic and care about atmosphere, and you know how to make a partner feel special", c: "everyone wants you at the get-together because being with you feels so easy", a: "say what you need plainly now and then, so your gentleness is not overlooked",
      t: "your charm shines brightest when you are in a lovely setting or have dressed with care" },
    { p: "you are patient, steady and responsible, building everything with your own two hands", w: "you can commit to demanding work over the long haul and produce results that stand the test of time", m: "you build wealth slowly but surely, and the results show more clearly with each passing year",
      l: "you fall in love slowly but love for a long time, staying loyal once you have chosen", c: "you have only a few friends, but they are true friends you have known for years", a: "reward yourself along the way instead of waiting until the finish line to feel happy",
      t: "your efforts tend to bear fruit over the long run, and sticking with them for a few years makes that much clearer" },
    { p: "you think outside the box and dare to experiment, with a mysterious charm that Thai lore links to Rahu", w: "you suit creative work, technology, night work or brand-new fields no one has tried before", m: "you often have unusual sources of income, so keep a very clear record of what comes in and goes out",
      l: "you love deeply and carry a kind of magnetism that is hard to put into words", c: "your friends come from many different circles, and you are always the one getting everyone to try something new", a: "put your daring into things that pay off in the long run, and good things will follow",
      t: "evenings and any period of change are when your ideas are sharpest" }
  ];
  DAYS.forEach(function (d, i) {
    var f = DAY_INFO[i];
    d.n = f[0]; d.s = f[1];
    d.o = "in Thai astrology, your birth day (" + f[2] + ") is ruled by " + f[3] + " and your color is " + f[4];
    d.x = i === 7
      ? "Thai astrology splits Wednesday in two, and anyone born after six in the evening belongs to Rahu, the shadow planet linked with eclipses"
      : DAY_X;
    I["thai.day." + i] = d;
  });

  /* ---------- Thai sidereal signs (Sun sign / rising sign) ---------- */
  var SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  var RASI = [
    { p: "you are bold in thought and action, a pioneer ruled by Mars", w: "you suit pioneering work and tasks with clear goals and quick results", m: "you are nimble with money when you take things into your own hands, and it pays to have a fallback ready before chasing something new",
      l: "you love directly, enjoying excitement while valuing honesty", c: "you are always pulling your friends along to try something new", a: "finish the project in front of you before starting another, so your starting spark turns into results" },
    { p: "you are grounded, steady and fond of beautiful things, valuing security like the Venus-ruled sign you are", w: "you are careful and particular, so your work is high in quality and built to last", m: "you have a good eye for what things are worth and you are very good at saving",
      l: "your love is steady, and you like a relationship that is warm and simple", c: "you are a reassuring friend who is easy to be around", a: "welcome change a little at a time, so your stability gains some flexibility" },
    { p: "you love ideas, conversation and discovery, with the quick spark of Mercury", w: "you shine in communication, writing, teaching and work that handles information", m: "your income often comes from a mix of ideas and know-how",
      l: "you need a partner you can really talk to who also gives you space", c: "your network is wide and you are a natural connector", a: "pick one field you truly want to master and go deep into it" },
    { p: "you are warm and home-loving and hold feelings close, with the tenderness of the Moon", w: "you suit work that involves caring for people, serving others or paying close attention", m: "you spend carefully and like to set a little extra aside for the people you love",
      l: "you love wholeheartedly and dream of a warm home", c: "your home is like a second home to your friends", a: "care for your own heart as attentively as you care for others" },
    { p: "you are big-hearted and generous, with a radiant presence like the Sun", w: "you suit leadership, the stage or any work that inspires people", m: "you earn especially well when you can fully show your image and talents",
      l: "you love openly and want your partner to be proud of you", c: "you are the center of the group and love making the people around you happy", a: "praise others as freely as you would like to be praised, and your standing will rise naturally" },
    { p: "you are careful, thorough and analytical, with the orderly mind of Mercury", w: "you stand out in work that calls for precision, building systems and solving problems", m: "you manage a budget well and dislike spending money you do not need to",
      l: "you show love by taking care of the small details of daily life", c: "when friends need practical advice, you are the first person they think of", a: "let a few things be imperfect, and your mind will feel lighter while work moves faster" },
    { p: "you are fair and value balance, moving through social life with the graceful poise of Venus", w: "you suit negotiation, design and work that balances the interests of different sides", m: "you are happy to spend on beauty and experiences, but you also know how to weigh things up",
      l: "you want a love that is equal and built on mutual respect", c: "you are the one who can get people who disagree to sit down and talk again", a: "decide a little sooner once you have enough information, because balance does not mean waiting forever" },
    { p: "you are deep, focused and strong-willed, with the inner strength of Mars", w: "you suit research, analysis and work that gets to the bottom of things", m: "you are good at managing money for the long term and know how to keep your finances quietly secure",
      l: "you love with your whole heart, and sincerity matters to you more than anything", c: "you have only a few close confidants, but the bonds run deep", a: "let go of what is already behind you and save your strength for creating something new" },
    { p: "you love freedom and adventure and stay optimistic, with the broad outlook of Jupiter", w: "you suit work that involves travel, teaching or opening up new markets", m: "widening your horizons often brings money your way, so set a budget before you head out or commit",
      l: "you like a partner who will share adventures and respect each other's freedom", c: "you are cheerful and easy to get along with, with plenty of friends from different cultures", a: "write down a big goal and break it into small steps, so a far-reaching dream comes true one step at a time" },
    { p: "you are ambitious, hardworking and good at planning, with the steadiness of Saturn", w: "you suit management, structured work and the pursuit of long-term goals", m: "you are disciplined with money, and your finances tend to grow steadier with age",
      l: "you take responsibility in love and see a relationship as building a future together", c: "you are the advisor your friends trust most when something comes up", a: "leave a little room in life for play, so success tastes even sweeter" },
    { p: "you are forward-thinking with a mind of your own, and in Thai tradition your sign is ruled by Saturn", w: "you stand out in innovation, technology and work for the public good", m: "you often have original ideas for making money, and a simple system for managing it suits you well",
      l: "you need a love that respects each other's individuality, like the best of friends", c: "your network is wide and you get along with all kinds of people", a: "break big ideas into a step-by-step plan, so others can follow your thinking" },
    { p: "you are imaginative and understanding, with the compassion of Jupiter", w: "you suit art, music, emotional care or any work that calls for creativity", m: "you are generous with money toward others, so a separate account for your own goals serves you well",
      l: "your love is romantic, and you give with your whole heart", c: "friends love to confide in you because you listen without judging", a: "set clear boundaries, so your kindness can last" }
  ];
  RASI.forEach(function (r, i) {
    r.n = "your Sun in " + SIGNS[i] + " (Thai sidereal zodiac)"; r.s = "your Sun in " + SIGNS[i];
    r.o = "by the Thai sidereal zodiac, the Sun was in " + SIGNS[i] + " when you were born";
    r.x = "the Thai sidereal zodiac follows the actual positions of the stars, so your sign is often one sign earlier than your Western one";
    I["thai.rasi." + i] = r;
  });
  var LAGNA = [
    ["your first impression is full of drive, as if you are always ready to go", "people often see you as the one who gets things started and makes decisions quickly", "listen to others a little longer before you charge toward your goal"],
    ["the moment you arrive you seem calm, dependable and full of good taste", "people around you feel safe and at ease in your company", "step outside your usual circle now and then, so new opportunities can come in"],
    ["to people who have just met you, you come across as lively, clever and great to talk to", "others often seek you out for a chat and ask you for the latest news", "focus on one thing at a time, so people also see your depth"],
    ["you seem warm and kind, and people find you easy to approach", "strangers often open up to you faster than you expect", "stop and rest when you are tired, and look after your own energy"],
    ["you carry an aura of confidence that draws people's eyes to you", "the people around you often make you the leader without you having to ask", "use your charm to lift up the people around you as well"],
    ["you seem neat and careful, with everything in good order", "others see you as professional and happily trust you with the details", "smile a little more and relax, so people find it easier to come close"],
    ["you seem refined and courteous, at home in any setting", "people can sense that you are fair and willing to listen", "state where you stand a little more clearly from time to time"],
    ["you seem mysterious and strong, and people want to know you better", "others often feel you can see right through them, so they both respect and trust you", "let people see the warm side of you as well"],
    ["you seem cheerful, open and broad-minded", "people like being around you because your positive energy is catching", "keep every small promise, so your reputation builds naturally"],
    ["you seem mature and serious, someone people can rely on", "others readily trust you with important responsibilities", "show your playful side now and then, so people feel closer to you"],
    ["you seem one of a kind, with a distinctive style and a friendly manner", "people find your outlook ahead of its time and love talking with you", "explain your ideas in simple words, so everyone can keep up with you"],
    ["you seem gentle, dreamy and deeply understanding", "people often share what is on their mind the very first time they meet you", "make your goals a little more concrete, so your dreams have somewhere to land"]
  ];
  LAGNA.forEach(function (x, i) {
    I["thai.lagna." + i] = { n: "your " + SIGNS[i] + " rising sign (lagna)", s: "your rising sign",
      o: "your rising sign is the sign on the eastern horizon at the moment of your birth, and it shapes the first impression you make",
      x: "lagna is the Thai word for the ascendant, which Thai astrologers work out from your birth time and place on the sidereal zodiac",
      p: x[0], c: x[1], a: x[2] };
  });

  /* ---------- Chinese zodiac animal (by the Thai calendar) and year element ---------- */
  var ANIMALS = ["the Rat", "the Ox", "the Tiger", "the Rabbit", "the Dragon", "the Snake", "the Horse", "the Goat", "the Monkey", "the Rooster", "the Dog", "the Pig"];
  var ORD = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];
  var AN = [
    { p: "you are quick and adaptable, and you often spot opportunities before anyone else", w: "you excel at work that calls for fast thinking, gathering information and solving problems on the spot", m: "you have a good instinct for money and are good at keeping something in reserve",
      l: "when you love someone you look after them closely and plan for the future together", c: "you have lots of friends and get along in every circle", a: "share some of your cleverness to help others, and more people will back you",
      t: "in folk belief the Rat forms a harmonious trio with the Dragon and the Monkey and a close pair with the Ox, so working with people of those signs often goes smoothly" },
    { p: "you are hardworking, patient and honest, doing things step by step", w: "you are the person an organization trusts with important long-term work", m: "you are very good at saving, and your wealth builds on a solid base",
      l: "your love is sincere and loyal, and you show it through actions", c: "you are a trustworthy friend whose word is as good as gold", a: "try a few new methods, so your hard work pays off sooner",
      t: "in folk belief the Ox forms a harmonious trio with the Snake and the Rooster and a close pair with the Rat, so teaming up with them tends to bring good results" },
    { p: "you are brave and full of life, with the presence of the king of the forest", w: "you suit leadership and work that calls for firm decisions", m: "you earn best when you can be yourself, and it helps to keep a backup plan ready",
      l: "you love passionately and stand guard over the people you care about", c: "your charisma easily draws a group of followers", a: "stay a little calmer when someone disagrees, so your strength feels more convincing",
      t: "in folk belief the Tiger forms a harmonious trio with the Horse and the Dog and a close pair with the Pig, so you often go further with them on your team" },
    { p: "you are gentle, well-mannered and tasteful, and you know how to sidestep conflict wisely", w: "you excel at coordination, design and work that calls for diplomacy", m: "you spend carefully and like things of good quality",
      l: "your love is tender and attentive, and you care about the mood between you", c: "everyone wants to be your friend because you are so easy to be with", a: "say what you think more directly, so your gentleness carries more weight",
      t: "in folk belief the Rabbit forms a harmonious trio with the Goat and the Pig and a close pair with the Dog, so you get along with them naturally" },
    { p: "you are confident, commanding and ambitious, like a dragon taking flight", w: "you suit work that oversees the big picture and leads many people", m: "big opportunities often come your way, so make a thorough plan before you commit",
      l: "you love wholeheartedly and want your partner to be proud of you", c: "you attract attention, and everyone wants to come along with you", a: "listen to your team, so your big dreams have more people sharing the load",
      t: "in folk belief the Dragon forms a harmonious trio with the Rat and the Monkey and a close pair with the Rooster, so joining hands with them makes things easier to achieve" },
    { p: "you are deep, wise and charming, and you always think before you speak", w: "you excel at strategy, analysis and detailed work", m: "you plan your finances quietly, yet the results are very good",
      l: "you love deeply and are particular about choosing a partner", c: "you keep a few close friends you can truly trust", a: "share your thoughts with others more often to win more support",
      t: "in folk belief the Snake forms a harmonious trio with the Rooster and the Ox and a close pair with the Monkey, so you work in good sync with them" },
    { p: "you love freedom, you are warm and outgoing, and your energy seems endless", w: "you suit work that gets you out meeting people and never feels repetitive", m: "you earn quickly when you have room to move, so an automatic savings plan suits you",
      l: "you love cheerfully and openly and need a partner who gives you freedom", c: "wherever you are, the conversation is always lively", a: "finish what you start, so your freedom comes with achievements",
      t: "in folk belief the Horse forms a harmonious trio with the Tiger and the Dog and a close pair with the Goat, so you feel more energized with them" },
    { p: "you are kind, artistic and peace-loving, with a real gift for understanding others", w: "you excel at creative work, caring for people and work that needs a fine touch", m: "your finances are steadiest when you are with people you trust",
      l: "your love is gentle and sweet, and family matters a great deal to you", c: "everyone likes you because you never put people in an awkward spot", a: "trust your own abilities more instead of waiting for someone's approval",
      t: "in folk belief the Goat forms a harmonious trio with the Rabbit and the Pig and a close pair with the Horse, so you get along especially well with them" },
    { p: "you are clever, full of ideas and good at solving problems, with a great sense of humor", w: "you suit work that calls for creativity, technology and problem solving", m: "you have a head for business and keep finding new sources of income",
      l: "your love is fun and caring, and you enjoy planning surprises", c: "when friends need an idea or a laugh, you are the first person they think of", a: "pair your cleverness with steady effort, so the results show clearly",
      t: "in folk belief the Monkey forms a harmonious trio with the Rat and the Dragon and a close pair with the Snake, so working with them sparks more ideas" },
    { p: "you are diligent, precise and punctual, with real confidence in yourself", w: "you excel at work that calls for precision, organizing systems and giving presentations", m: "you manage money in an orderly way and do not like owing anyone",
      l: "you love sincerely and show you care by looking after people", c: "you can give a group order and a clear sense of purpose", a: "use softer words when you point out what could improve, so others take it in more easily",
      t: "in folk belief the Rooster forms a harmonious trio with the Snake and the Ox and a close pair with the Dragon, so you work smoothly with them" },
    { p: "you are loyal, sincere and fair, always ready to protect the people you love", w: "your team trusts you, and you suit caregiving, service and work with strong professional ethics", m: "you spend sensibly and value stability",
      l: "your love is loyal and steady, and once you have decided, you do not change easily", c: "you are the true friend people can always count on", a: "trust the world a little more instead of staying on guard about everything",
      t: "in folk belief the Dog forms a harmonious trio with the Tiger and the Horse and a close pair with the Rabbit, so you feel more secure with them" },
    { p: "you are generous, sincere and kind-hearted, and you look on the bright side", w: "you work well with others and warm up the mood of any team", m: "your kindness often comes back to you as good fortune, so set a budget for your giving",
      l: "you love sincerely and always give your whole heart", c: "you do not sweat the small stuff, so you have a great many friends", a: "learn to say no when you need to, so your kindness stays precious",
      t: "in folk belief the Pig forms a harmonious trio with the Rabbit and the Goat and a close pair with the Tiger, so you live in easy harmony with them" }
  ];
  AN.forEach(function (x, i) {
    x.n = ANIMALS[i]; x.s = ANIMALS[i] + " sign";
    x.o = "by the Thai calendar you were born in the year of " + ANIMALS[i] + ", the " + ORD[i] + " of the twelve zodiac animals";
    x.x = "the Chinese zodiac gives each year one of twelve animals, and Thai astrology uses the same twelve-year cycle";
    I["cn.animal." + i] = x;
  });

  var EL_X = "in Chinese astrology each year also carries one of five elements (Wood, Fire, Earth, Metal and Water), which adds its own flavor to the animal";
  I["cn.el.wood"] = { n: "Wood", s: "the Wood year", x: EL_X, p: "you are kind-hearted and keep growing, like a tree", w: "you are creative and love nurturing talent or developing new things", l: "you hope for a love in which you both grow together little by little", a: "water your dreams every day with a little bit of learning" };
  I["cn.el.fire"] = { n: "Fire", s: "the Fire year", x: EL_X, p: "you are passionate, warm and full of drive, like a flame", w: "you are great at sparking inspiration and getting a team moving", l: "you love intensely and make your feelings very clear", a: "keep the fire inside you burning steadily instead of spending all your energy at once" };
  I["cn.el.earth"] = { n: "Earth", s: "the Earth year", x: EL_X, p: "you are steady like the earth, someone others can lean on", w: "you are the backbone of the team and work with firm principles", l: "your love is steady, and you are willing to care for someone over the long term", a: "accept a little change now and then, because even good soil needs turning" };
  I["cn.el.metal"] = { n: "Metal", s: "the Metal year", x: EL_X, p: "you are decisive, principled and fair, like polished metal", w: "you work systematically and clearly, with very high standards", l: "you are serious and honest in love, and you do what you say", a: "add a little flexibility to your principles, so people find you easier to approach" };
  I["cn.el.water"] = { n: "Water", s: "the Water year", x: EL_X, p: "you are flexible and bright like flowing water, with a deep understanding of people", w: "you adapt easily and pull information together very quickly", l: "your love runs deep, and you sense your partner's subtlest feelings", a: "give your thoughts an anchor, so your flowing water heads toward a goal" };

  /* ---------- BaZi: Day Master ---------- */
  var DM_N = [["Jia Wood", "yang Wood"], ["Yi Wood", "yin Wood"], ["Bing Fire", "yang Fire"], ["Ding Fire", "yin Fire"], ["Wu Earth", "yang Earth"], ["Ji Earth", "yin Earth"], ["Geng Metal", "yang Metal"], ["Xin Metal", "yin Metal"], ["Ren Water", "yang Water"], ["Gui Water", "yin Water"]];
  var DM = [
    { p: "like a towering tree, you stand upright and reach upward, principled and hard to sway", w: "you suit work with long-term goals where you can be a pillar for others", m: "you build wealth the way a great tree puts down roots, slowly but very steadily",
      l: "you love with integrity and want to be your partner's support", c: "friends deeply respect how frank and direct you are", a: "learn from branches that bend with the wind, so stormy days do not snap you",
      t: "the classic texts say yang Wood grows best in spring, and you flourish most when you have both encouragement and support" },
    { p: "like vines and flowering plants, you are supple and gentle and can find room to grow anywhere", w: "you excel at coordination, design and work that calls for a delicate touch", m: "your income comes from your relationships and your many different talents",
      l: "your love is tender and attentive, and small feelings matter a lot to you", c: "you get along with people easily and often have someone in your corner", a: "trust your own roots more instead of always leaning on someone else",
      t: "yin Wood loves spring and moist surroundings, and you bloom most beautifully when someone supports you" },
    { p: "like the Sun, you are bright and warm and equally generous to everyone", w: "you suit work in the spotlight, inspiring people and taking the lead", m: "you earn best when you show who you are, as long as you do not give beyond your means",
      l: "your love is open and warm, and you never hide how you feel", c: "everyone wants to be near you because they can feel your positive energy", a: "set aside time to recharge, because even the Sun has to set",
      t: "yang Fire is strongest in summer and in daylight, and your luck shines brightest when you are out meeting people" },
    { p: "like candlelight, you warm the people around you, sensitive and intuitive", w: "you excel at work that needs focus, fine craftsmanship or counseling", m: "your finances rise on expertise that others find hard to replace",
      l: "your love is affectionate and gentle, and you notice every detail", c: "you have close friends you have known for many years, and the bonds run deep", a: "choose good people and good surroundings to protect the flame inside you",
      t: "yin Fire glows brightest at night, and you shine most when you are working quietly and with focus" },
    { p: "like a high mountain, you are steady, reliable and not easily shaken", w: "you suit management, roles with big responsibilities and work that needs stability", m: "you are good at building up assets and like long-term stability",
      l: "you love steadily, standing by your partner like a mountain", c: "whenever friends need someone to lean on, you are the first one they come to", a: "allow yourself some change, because a mountain with trees and streams is even more beautiful",
      t: "yang Earth does its best work as the seasons turn, and your steadiness is most valuable at the turning points of life" },
    { p: "like rich garden soil, you tend things with care and help everything around you grow little by little", w: "you excel at developing people, building systems and taking care of details", m: "you manage money well and know how to build up slowly from small amounts",
      l: "your love is thoughtful down to the smallest detail, and you dream of a warm home", c: "you help others without expecting anything back, so people are fond of you", a: "care for yourself the way you care for others, because even the soil needs to rest",
      t: "yin Earth loves seasons of gentle sun and moderate rain, and steady daily effort brings you the most reward" },
    { p: "like forged steel, you are decisive, brave and fair", w: "you suit work that calls for firm decisions, driving change and moving fast", m: "you are good at earning through decisiveness and expertise",
      l: "you are serious and honest in love, and you protect your partner", c: "you are the kind of friend who tells the truth even when it is hard to hear", a: "add a little gentleness to your frankness, because polished steel shines brighter",
      t: "yang Metal is strongest in the harvest season of autumn, and you are at your best when a big decision needs to be made" },
    { p: "like a gemstone, you are refined and tasteful, and you have real worth of your own", w: "you excel at work that calls for detail, a sense of beauty and high standards", m: "you have good taste with money and like spending it on quality",
      l: "your love is delicate and needs thoughtful, careful attention", c: "the people around you admire your style and your sense of tact", a: "forgive yourself a few imperfections, because a gem's facets are what make the light so beautiful",
      t: "yin Metal shines brightest in times of self-polishing, and steady learning is the secret to your glow" },
    { p: "like the ocean, you are vast and powerful, thinking big and always moving forward", w: "you suit strategic thinking, international work and fast-changing fields", m: "your money flows in from many directions, so build it a dam with automatic savings",
      l: "your love is open-hearted and needs freedom of thought", c: "your friends are a diverse bunch, and you understand people from other cultures well", a: "give your flowing water a riverbank, letting clear goals turn your energy into results",
      t: "yang Water is strongest in winter and at night, and big ideas come most easily when you think and plan in quiet" },
    { p: "like fine rain and morning dew, you are delicate and perceptive, quietly nourishing the people around you", w: "you excel at research, creative work and work that calls for understanding people", m: "you build wealth the way drops of water slowly fill a vessel",
      l: "your love is gentle and deep, and you are always attentive to your partner", c: "friends feel safe when they share their worries with you", a: "value your own needs too, because rain that falls in just the right amount is the most precious",
      t: "yin Water is strongest in cool, peaceful times, and plenty of sleep and rest is your secret to staying sharp" }
  ];
  DM.forEach(function (x, i) {
    x.n = "your Day Master " + DM_N[i][0] + " (" + DM_N[i][1] + ")"; x.s = DM_N[i][0];
    x.o = "the Day Master is the character in your BaZi chart that stands for you yourself, and yours is " + DM_N[i][0];
    x.x = "BaZi, the Chinese Four Pillars, reads your birth year, month, day and hour as eight characters, and the Day Master is the heavenly stem of your birth day";
    I["bazi.dm." + i] = x;
  });
  I["bazi.dm.9"].a = "keep your own needs in mind as well, because rain that falls in just the right amount is the most precious";

  I["bazi.strength.strong"] = { n: "a strong Day Master", s: "your strong Day Master", o: "your BaZi chart has plenty of elements that support your own, which BaZi calls a strong Day Master",
    x: "Day Master strength is a measure of how much of your chart backs up your own element, and neither strong nor weak is better than the other",
    p: "you have plenty of inner energy and confidence, and you are very self-reliant", w: "you can handle a heavy workload and enjoy challenging assignments", a: "channel your energy into creating results, sharing and helping others" };
  I["bazi.strength.weak"] = { n: "a gentler Day Master (weak in BaZi terms)", s: "your gentler Day Master", o: "your BaZi chart has fewer elements that support your own, which BaZi calls a weak Day Master",
    x: "Day Master strength is a measure of how much of your chart backs up your own element, and neither strong nor weak is better than the other",
    p: "you are gentle and flexible, and you are a very good listener", w: "you do your best work when you have a team and advisors behind you", a: "recharge through learning, rest and time with people who support you" };

  /* ---------- Five elements: abundant / lighter / favorable ---------- */
  var EL = { wood: "Wood", fire: "Fire", earth: "Earth", metal: "Metal", water: "Water" };
  var EXCESS = {
    wood: { p: "you are full of ideas and often want to do several things at once", w: "you grow quickly, but it pays to watch that you do not spread yourself too thin", a: "borrow the strength of Metal to prune your branches by setting priorities and clear deadlines" },
    fire: { p: "your enthusiasm and drive are so plentiful they almost overflow", w: "you are great at lighting up a room, but take care not to use up your energy too fast", a: "borrow the calm of Water to settle your mind by resting your eyes, drinking plenty of water and keeping some quiet time" },
    earth: { p: "you are especially steady and grounded, and you think everything through", w: "you are very dependable, though your pace can sometimes lag half a beat behind", a: "borrow the energy of Wood to loosen the soil by learning something new and trying a fresh way of working" },
    metal: { p: "you are principled and decisive, with very high standards", w: "the quality of your work is excellent, but you may be too hard on yourself", a: "borrow the warmth of Fire to soften up a little by doing more things you enjoy and praising others more often" },
    water: { p: "you love to think and think deeply, with a steady stream of thoughts", w: "you have plenty of ideas, but take care not to keep them only in your head", a: "borrow the firmness of Earth to build riverbanks by writing your plans down in steps and completing them one by one" }
  };
  var LACK = {
    wood: { p: "you may hesitate a little when starting something new", w: "your work can grow a great deal once you open yourself up to learning", a: "add Wood with the color green, plants around you and one new thing learned each week" },
    fire: { p: "you may often keep your feelings inside rather than showing them", w: "your results shine much brighter when you dare to show what you can do", a: "add Fire with early-morning sunshine, red or pink, and more time meeting people" },
    earth: { p: "you may feel that your life does not yet have a firm anchor", w: "your work grows steadier once you have clear systems and a daily rhythm", a: "add Earth with yellow and brown, a tidy home and regular saving" },
    metal: { p: "when there are many options, you may find it hard to decide", w: "your work becomes sharper once you set yourself standards and deadlines", a: "add Metal with white and silver, a clear desk and goals written down plainly" },
    water: { p: "you may get so absorbed in work that you forget to rest your mind", w: "your work flows more smoothly when you take in new viewpoints and information", a: "add Water with blue and black, drinking enough water and quiet time to reflect" }
  };
  var USEFUL = {
    wood: { a: "recharge with green, plants and learning new things", w: "work in education, design, publishing and anything about growth is a real help to you", t: "early mornings, spring and the start of the year are when Wood energy gives you a lift" },
    fire: { a: "recharge with red, pink, purple and early-morning sunshine", w: "work in media, marketing, technology and anything that lets you show yourself is a real help to you", t: "midday and summer are when Fire energy gives you a lift" },
    earth: { a: "recharge with yellow, brown, cream and time close to nature", w: "work in real estate, management, agriculture and service is a real help to you", t: "the turn of the seasons and the afternoon are when Earth energy gives you a lift" },
    metal: { a: "recharge with white, silver, gold and a tidy space", w: "work in finance, engineering, compliance and anything that calls for precision is a real help to you", t: "evenings, autumn and the end of the year are when Metal energy gives you a lift" },
    water: { a: "recharge with blue, black, navy and time near the water", w: "work in communication, travel, logistics and anything that keeps your mind busy is a real help to you", t: "nights and winter are when Water energy gives you a lift" }
  };
  Object.keys(EL).forEach(function (k) {
    var e = EL[k];
    I["bazi.excess." + k] = Object.assign({ n: "plenty of " + e + " in your chart", s: "your abundant " + e }, EXCESS[k]);
    I["bazi.lack." + k] = Object.assign({ n: "a lighter share of " + e + " in your chart", s: "your lighter " + e }, LACK[k]);
    I["bazi.useful." + k] = Object.assign({ n: "your favorable element, " + e, s: e + " energy", o: "the favorable element is the one that brings your BaZi chart into balance, and for you it is " + e,
      x: "in BaZi the five elements feed and check one another, and the favorable element (xi yong shen) is the one your chart needs most" }, USEFUL[k]);
  });

  /* ---------- Ten gods ---------- */
  var GODS = {
    BJ: ["the Friend star", "fellow traveler", "the Friend star (Bi Jian) is an element that matches your Day Master in both element and polarity, like a peer at your side", { p: "you are self-assured and like to stand on your own two feet", w: "you do your best work with a like-minded team that shares your goals", m: "you earn with your own skills, and it is worth making sure you do not share more than you can afford",
      l: "you want a partner who is an equal and a friend you can talk things over with", c: "you have companions who are glad to walk the road with you", a: "open up to help, because being part of a team takes nothing away from who you are" }],
    JC: ["the Rob Wealth star", "friendly rival", "the Rob Wealth star (Jie Cai) shares your Day Master's element with the opposite polarity, a spirited peer who pushes you to compete", { p: "you dare to take chances and compete, with a strong drive to act", w: "you suit competitive work where you go out and win opportunities", m: "your money tends to come and go quickly, so keep your savings in a separate place",
      l: "you love intensely and do not give up easily in a relationship", c: "you make friends widely, and it pays to choose business partners with extra care", a: "put contracts and agreements in writing, so your competitive drive turns into wins" }],
    SS: ["the Eating God star", "natural talent", "the Eating God star (Shi Shen) is the element your Day Master produces, and it stands for talent, enjoyment and easy self-expression", { p: "you are gifted, know how to enjoy life and live with real taste", w: "you excel at creative work, food, entertainment and anything that shows off your craft", m: "your income comes from your skills and the things you love to do",
      l: "your love is warm and relaxed, and you are good at tending your partner's mood", c: "when you are around, the conversation is always a pleasure", a: "turn a favorite hobby into work you can share with others" }],
    SG: ["the Hurting Officer star", "fresh thinking", "the Hurting Officer star (Shang Guan) is the element your Day Master produces with the opposite polarity, and it stands for bold, original expression", { p: "you are clever and quick-thinking, and you dare to question the old ways", w: "you excel at innovation, art, public speaking and work that calls for originality", m: "you can earn from new ideas, and it helps to have someone keep an eye on the numbers",
      l: "your love is colorful, and you need someone who understands your flights of fancy", c: "your wit and way with words make you very charming", a: "when you disagree, say it a little more gently, so your sharp insight wins more agreement" }],
    PC: ["the Indirect Wealth star", "chance opportunities", "the Indirect Wealth star (Pian Cai) is an element your Day Master controls, and it stands for opportunities that come through people and timing", { p: "you are generous and sociable, with a sharp eye for business opportunities", w: "you suit sales, running a business and work that relies on your network", m: "unexpected openings and a wide network often bring money your way, so remember to set a fixed share aside",
      l: "you are charming and very popular in love", c: "you know lots of people and can make introductions for others", a: "save a fixed percentage of every bit of extra income, so good fortune becomes stability" }],
    ZC: ["the Direct Wealth star", "steady income", "the Direct Wealth star (Zheng Cai) is an element your Day Master controls with the opposite polarity, and it stands for steady, earned income", { p: "you are hardworking and responsible, and you value a stable life", w: "you work systematically and are well trusted with budgets", m: "you have a steady regular income and are very good at saving",
      l: "you are serious about love and willing to look after a family", c: "your friends trust your sense of responsibility", a: "treat yourself now and then, so the money you work hard for brings you joy too" }],
    QS: ["the Seven Forces star", "the power of challenge", "the Seven Forces star (Qi Sha) is an element that controls your Day Master, and it stands for pressure that builds courage", { p: "you are brave, you hold up well under pressure, and you enjoy rising to a challenge", w: "you suit work that handles crises, fierce competition and quick decisions", m: "you often do well when others hold back, though it pays to always have a backup plan",
      l: "your love is protective, and you stand firmly by your partner", c: "you carry a presence that earns people's respect", a: "treat pressure as training, and become the one who leads in difficult moments" }],
    ZG: ["the Direct Officer star", "honor and order", "the Direct Officer star (Zheng Guan) is an element that checks your Day Master with the opposite polarity, and it stands for structure, duty and reputation", { p: "you are disciplined and honorable, and you care a great deal about your good name", w: "you suit institutions, public service and settings with a clear hierarchy", m: "your finances are steady thanks to your position and reputation",
      l: "your love is responsible and built on mutual respect", c: "you are recognized in your community and trusted by many", a: "loosen the rules in your head a little, because you do not have to be perfect all the time" }],
    PY: ["the Indirect Resource star", "specialist wisdom", "the Indirect Resource star (Pian Yin) is an element that feeds your Day Master, and it stands for unusual learning and deep, specialist insight", { p: "you think deeply like a scholar and care about things others overlook", w: "you excel at research, technical work, psychology and specialist fields", m: "your income comes from rare, specialized knowledge",
      l: "you need someone who understands your inner world and gives you room to think", c: "you have few friends, but your conversations with them go very deep", a: "share your knowledge with others, so your wisdom grows even richer" }],
    ZY: ["the Direct Resource star", "supportive mentors", "the Direct Resource star (Zheng Yin) is an element that feeds your Day Master with the opposite polarity, and it stands for mentors, care and learning", { p: "you are kind-hearted and love to learn, and people are often glad to look after you", w: "you suit education, caregiving and work that relies on knowledge", m: "you often have financial support from elders or family",
      l: "your love is warm, and you know how to look after people", c: "elders and teachers have always been fond of you", a: "put what you have learned into action instead of waiting until everything is ready" }]
  };
  Object.keys(GODS).forEach(function (k) {
    var g = GODS[k];
    I["bazi.god." + k] = Object.assign({ n: g[0] + " (" + g[1] + ")", s: g[0], o: "the ten gods describe how each character in your BaZi chart relates to your Day Master, and " + g[0] + " stands out in yours", x: g[2] }, g[3]);
  });

  /* ---------- Life path number ---------- */
  var LP = {
    1: { p: "you have a leader's spirit and want to forge a path of your own", w: "you suit starting a business, leading a team or launching new projects", m: "you earn best when you are your own boss or in control of your work", l: "you need a partner who respects your individuality and supports your goals",
      c: "your friends see you as a role model who inspires them", a: "practice asking for help, because good leadership comes from working together", t: "in Western numerology, the year your personal cycle comes back to one is a good time to begin a new round of big goals" },
    2: { p: "you are gentle and understanding, a patient peacemaker", w: "you excel at teamwork, negotiation, customer service and work that calls for diplomacy", m: "your finances do better when you partner with people you trust", l: "you love with commitment and value harmony between the two of you",
      c: "you are the go-between everyone is willing to trust", a: "trust your own views more, because your voice has always mattered", t: "working alongside others is when your opportunities open up the most" },
    3: { p: "you are cheerful and expressive, with an endless flow of creativity", w: "you suit media, writing, performing, teaching and design", m: "you can earn from your creativity, and a clear way to track spending serves you well", l: "your love is light-hearted and fun, often expressed with sweet words",
      c: "you are the bright spark of your friend group whom everyone adores", a: "pick the right project and see it through, so your talent becomes finished work", t: "showing your work in public is when you win the most recognition" },
    4: { p: "you are organized and hardworking, as dependable as a pillar", w: "you suit building systems, engineering, accounting and project management", m: "you build wealth steadily through planning and discipline", l: "your love is steady, and you want to build a future together",
      c: "whatever happens, your friends can rely on you", a: "let your plans change now and then, so flexibility makes your system even stronger", t: "your success arrives like climbing stairs, and the longer you persist, the clearer the results become" },
    5: { p: "you love freedom, adapt quickly and enjoy new experiences", w: "you suit travel, sales, media and fast-changing work", m: "you have several sources of income, so keep an emergency fund to hand", l: "you need a love that is fun and gives you both freedom",
      c: "your friends are a colorful mix, and you are the one who plans the trips", a: "build a few small daily habits as anchors, so your freedom feels more grounded", t: "times of change in your life are when you grow the fastest" },
    6: { p: "you are responsible and warm, and you love your home and family", w: "you suit caregiving, education, service and interior or home design", m: "your finances are steadiest when you plan together with your family", l: "you love devotedly and dream of a warm home",
      c: "you have always been a source of support for friends and family", a: "look after yourself too instead of carrying everyone's responsibilities", t: "making a home and mending relationships are when your life feels most complete" },
    7: { p: "you are analytical and thoughtful, with a love of knowledge", w: "you suit research, analysis, technology and specialist work", m: "you earn through distinctive knowledge and expertise", l: "you need someone who understands your inner world and can talk about deep things",
      c: "you have few close friends, but your talks with them go deep", a: "share your ideas with the people around you more, and unexpected support may follow", t: "pausing to rest and reflect is when you find life's important answers" },
    8: { p: "you are energetic and good at planning, set firmly on the road to success", w: "you suit management, business, finance and work that involves big decisions", m: "you are very capable of building wealth when you have discipline and a clear plan", l: "you are serious about love and want to be your partner's support",
      c: "you have real standing and are highly respected among your friends", a: "balance work and life, because success means most with loved ones beside you", t: "taking on more responsibility is when your career and finances rise" },
    9: { p: "you are generous and idealistic, and you love to help others", w: "you suit charity work, the arts, teaching and work that inspires people", m: "money flows in naturally when you do meaningful work, as long as you do not give so much it strains you", l: "your love is understanding and giving",
      c: "people from every circle enjoy your company", a: "wrap up old business properly before you start something new", t: "the end of each chapter of life is a good time to tidy up and get ready to begin again" },
    11: { p: "you are strongly intuitive, an inspirer carrying the glow of a master number", w: "you suit work that inspires people, the arts, teaching and counseling", m: "your finances do better when your work matches your values", l: "your love runs deep, with a spiritual connection",
      c: "people feel recharged just by being around you", a: "rest often and spend time in nature to care for your sensitive heart", t: "special opportunities appear when you follow your inner voice" },
    22: { p: "you are a master builder who turns dreams into reality, carrying the strength of a master number", w: "you suit building organizations, large projects and work that touches many lives", m: "you can create large-scale stability when you plan systematically", l: "your love is steady, and you want to build a far-reaching future together",
      c: "people want to work with you because you see the big picture", a: "break big dreams into small steps, and forgive yourself when you are not there yet", t: "your results often take a few years to come into focus, so patience is well worth it" },
    33: { p: "you are a compassionate teacher who leads with love, carrying the warmth of a master number", w: "you suit education, emotional care and work that helps others", m: "your finances do well when you help others in an organized way", l: "your love is warm and comes with no conditions at all",
      c: "you are an emotional anchor for many of the people around you", a: "save some of your compassion for yourself", t: "teaching or sharing your experience is when your life feels most meaningful" }
  };
  Object.keys(LP).forEach(function (k) {
    var x = LP[k];
    x.n = "life path number " + k + (+k > 9 ? " (a master number)" : ""); x.s = "your life path number";
    x.o = "adding up all the digits of your birth date and reducing them gives your life path number";
    if (+k > 9) x.x = "in numerology, eleven, twenty-two and thirty-three are master numbers, which are kept whole instead of being reduced to a single digit";
    I["num.lp." + k] = x;
  });
  I["num.lp.6"].a = "look after yourself instead of carrying everyone's responsibilities";

  /* ---------- Birthday number (day of the month) ---------- */
  var BDAY = ["",
    "you have a mind of your own and dare to take the first step before others, carrying the energy of the number one", "you are good at keeping the peace and know when to step back so others can shine", "you are creative and cheerful, and you have a way with words",
    "you are diligent and organized, and you like getting things done step by step", "you love change, learn fast and work flexibly", "you are responsible and warm, with a caring heart",
    "you love to think things through deeply and to look for the truth behind them", "you have a manager's mind and understand how money and influence work", "you are generous and considerate, always happy to help others",
    "you bring a fresh kind of leadership and bounce back quickly from hard times", "your intuition is keen, and like the master number eleven you inspire others", "you have an artistic streak and see the world from a unique angle",
    "you can work hard and change and improve yourself in a systematic way", "you love freedom and adapt easily while still staying disciplined", "you are charming and warm, and people are easily drawn to you",
    "you think deeply, like to reflect and have accurate intuition", "you are strong-willed and very good at long-range planning", "you are idealistic and can see the big picture of the world",
    "you are very self-reliant and do not give up easily when things get hard", "you are sensitive and attentive, a natural at working with others", "you are creative and love making friends and going to get-togethers",
    "like the master number twenty-two, you are a master builder who really gets things done", "you are flexible and charming, and you love learning from experience", "you feel a special responsibility toward your family and the people close to you",
    "you observe carefully, think things through and trust your intuition", "you have management skills and understand the value of teamwork", "you are compassionate and generous, a leader who looks after others",
    "you have a pioneering spirit and lead others with a soft heart", "you have a rich imagination and understand other people's feelings deeply", "you are creative, and the way you express yourself really moves people",
    "you are hardworking and orderly while also being very creative"
  ];
  var SUF = function (d) { return (d % 10 === 1 && d !== 11) ? "st" : (d % 10 === 2 && d !== 12) ? "nd" : (d % 10 === 3 && d !== 13) ? "rd" : "th"; };
  for (var d = 1; d <= 31; d++) I["num.bday." + d] = { n: "your birthday on the " + d + SUF(d), s: "your birthday number", p: BDAY[d] };

  /* ---------- Name number (Thai name numerology) ---------- */
  var NAME_X = "in Thai name numerology each letter carries a number, and the total of your name is read for the kind of energy it brings";
  var NAME = {
    1: ["your name carries the energy of confidence and leadership", "this name helps people remember you as someone who takes action", "this name helps you make money decisions with more confidence", "this name makes you seem dependable and steady to the one you love"],
    2: ["your name carries a gentle energy that brings people together", "this name helps you work with others more smoothly", "this name helps your good relationships turn into financial support", "this name adds a warm, understanding charm to you"],
    3: ["your name carries a cheerful, creative energy", "this name makes your communication and presentations more engaging", "this name boosts income from your ideas and special skills", "this name fills your love life with color and laughter"],
    4: ["your name carries the energy of hard work and order", "this name helps people see you as someone they can trust", "this name strengthens your discipline in saving and planning", "this name keeps your relationships steady and sincere"],
    5: ["your name carries the charm of flexibility and a way with words", "this name helps you negotiate well and adapt quickly to new work", "this name opens more chances for you to earn from several sources", "this name makes you charming and noticed"],
    6: ["your name carries an energy of warmth and love of beauty", "this name helps colleagues and clients warm to you", "this name brings you good fortune through people and trust", "this name makes your love life warm and homey"],
    7: ["your name carries an energy of depth and wisdom", "this name helps people trust your expertise more", "this name helps you be more careful and thorough with money", "this name turns your relationships into a meeting of minds and hearts"],
    8: ["your name carries an energy of determination and management", "this name gives you standing and respect at work", "this name strengthens your ability to build wealth seriously", "this name makes you someone your partner can lean on"],
    9: ["your name carries an energy of compassion and success", "this name gives your work meaning and wide recognition", "this name brings you blessings that come back from giving and helping", "this name makes your relationships generous and understanding"]
  };
  Object.keys(NAME).forEach(function (k) { var x = NAME[k]; I["num.name." + k] = { n: "name number " + k, s: "your name number", x: NAME_X, p: x[0], w: x[1], m: x[2], l: x[3] }; });

  /* ---------- Today: Taksa eight houses (bhumi) ---------- */
  var BHUMI_X = "Taksa is the Thai system of eight birth-day houses, and each day falls in one of its life areas (bhumi) for you";
  var BHUMI = {
    boriwan: ["today's Boriwan house (retinue)", "the Boriwan house", { o: "by the Thai Taksa houses, your family, friends and team are especially behind you today", w: "your teamwork goes smoothly today, so ask for help instead of pushing on alone",
      m: "today suits talking money over with your family or planning spending together", l: "simple time with your partner or family is enough to leave your heart content today", a: "get in touch with a friend you have not talked to in a while, because your relationships are your source of strength today" }],
    ayu: ["today's Ayu house (well-being)", "the Ayu house", { o: "by the Thai Taksa houses, you feel lighter and fresher than usual today", w: "plan today's work around your energy and take it one task at a time for better quality",
      m: "spending a little today on something that lifts your mood is money well spent", l: "the easy mood today makes it simpler for you both to open up and talk", a: "make time for a walk, a stretch and plenty of water, so today stays fresh and bright" }],
    dech: ["today's Dech house (authority)", "the Dech house", { o: "by the Thai Taksa houses, your standing and credibility stand out today", w: "today suits you for giving presentations, negotiating or handling matters that need a final call",
      m: "money matters where you need to negotiate or set new terms have a good chance of going smoothly today", l: "your confidence is very attractive today, so remember to listen as well", a: "speak clearly and stick to what you have prepared, because people are ready to hear you today" }],
    sri: ["today's Sri house (fortune)", "the Sri house", { o: "by the Thai Taksa houses, you are full of charm today and small pleasant surprises are likely", w: "your service, sales and client visits go better than expected today",
      m: "you may hear good news today about money or a deal you have been planning", l: "your charm is especially bright today, making it a good day for a date or for sharing your feelings", a: "wear something you love and go out to meet people, because good things tend to find those who reach out today" }],
    mula: ["today's Mula house (foundation)", "the Mula house", { o: "by the Thai Taksa houses, today suits you for laying foundations and doing things that pay off in the long run", w: "today is a good day for streamlining your workflow, filing documents or planning long-term projects",
      m: "today suits checking your accounts, setting a savings goal or looking after what you already have", l: "an honest talk about your shared future will make your relationship stronger", a: "start one small good habit today and keep it up every day" }],
    utsaha: ["today's Utsaha house (effort)", "the Utsaha house", { o: "by the Thai Taksa houses, you are full of drive today and your backlog can move fast", w: "pull out the hard task you have been putting off, because today's effort will show results",
      m: "your income from hard work and side projects has good momentum today", l: "doing one small thing for your partner means more today than any amount of words", a: "pick your three most important tasks and finish them before noon" }],
    montri: ["today's Montri house (patronage)", "the Montri house", { o: "by the Thai Taksa houses, elders and experienced people are on your side today", w: "today suits asking for advice, seeking a collaboration or raising something with your manager",
      m: "advice from someone who knows the field will help you think money matters through more fully", l: "the people around you are cheering on your love life, and an elder may be especially fond of you", a: "stay humble and thank the people who help you, because today's kindness comes back around" }],
    kalakini: ["today's Kalakini house (a day for care)", "the Kalakini house", { o: "by the Thai Taksa houses, today goes well if you slow down a little and take things step by step", w: "check your work and messages once more before sending, and let big decisions that are not urgent wait",
      m: "you may want to hold off on large purchases, because today is better for saving than spending", l: "a gentle tone of voice makes your small misunderstandings easy to clear up", a: "leave extra time when you head out and some room in your heart as well, because staying calm is the best way through today" }]
  };
  Object.keys(BHUMI).forEach(function (k) {
    var b = BHUMI[k];
    I["bhumi." + k] = Object.assign({ n: b[0], s: b[1],
      x: k === "kalakini" ? "the kalakini area is the Taksa life area Thai tradition treats as an obstacle, so it simply asks for a slower, more careful pace" : BHUMI_X }, b[2]);
  });

  /* ---------- Today / this month: the period's heavenly stem against your Day Master ---------- */
  var REL_X = "a heavenly stem is one of ten cycle signs, each tied to an element, that mark every day, month and year in the Chinese calendar";
  var REL = {
    same: ["matching elements (bi he)", "matching elements", "the heavenly stem of this period shares your Day Master's element, which BaZi calls bi he, the harmony of like elements", { w: "today suits working with friends and people who think like you", m: "sharing costs or planning finances with the people around you goes smoothly",
      l: "talking with your partner like good friends makes it easier to understand each other", a: "share your ideas with the people around you instead of keeping them to yourself", t: "teaming up with like-minded people during this period helps things move more smoothly" }],
    resource: ["the element that feeds you (sheng wo)", "a supportive element", "the heavenly stem of this period feeds your Day Master's element, which BaZi calls sheng wo, being nourished", { w: "elders and good information are on your side today, which makes it a good day to learn and ask questions", m: "you do well to research before making money decisions, because advice from people who know the field is precious",
      l: "the people close to you care about you a lot, and today is a good day to open your heart to that love", a: "recharge by reading, listening or simply resting well", t: "helpful mentors and good information are around during this period, which makes it a good time to study" }],
    output: ["the element you feed (wo sheng)", "your creative outflow", "your Day Master's element feeds the heavenly stem of this period, which BaZi calls wo sheng, giving out", { w: "your creativity keeps flowing, so today suits presentations, writing or making something", m: "your skills and ideas turn into income easily today",
      l: "today suits expressing your feelings or doing a small, touching thing for your partner", a: "show your ideas to others instead of waiting for them to be perfect", t: "inspiration is plentiful during this period, which makes it a good time to turn ideas into finished work" }],
    wealth: ["the element you shape (wo ke)", "the element you shape", "your Day Master's element keeps the heavenly stem of this period in check, which BaZi calls wo ke, the element you shape", { w: "you see opportunities very clearly today, which suits work that needs a final call", m: "today suits handling money matters you have already planned carefully",
      l: "care your partner can actually see makes them feel secure", a: "list what needs doing and work through it one item at a time", t: "opportunities are clear during this period, which makes it a good time to carry out plans you made long ago" }],
    power: ["the element that checks you (ke wo)", "the element that checks you", "the heavenly stem of this period keeps your Day Master's element in check, which BaZi calls ke wo, being shaped", { w: "today suits sticking to the plan and staying disciplined, and people will notice how responsible you are", m: "spending within the budget you have set helps you feel more settled",
      l: "listening a little more to the other person will noticeably deepen your understanding of each other", a: "stay patient and follow the plan, so your credibility keeps growing", t: "discipline and sticking to the plan during this period will earn you more trust" }]
  };
  Object.keys(REL).forEach(function (k) { var r = REL[k]; I["rel." + k] = Object.assign({ n: r[0], s: r[1], o: r[2], x: REL_X }, r[3]); });

  I["today.clash"] = { n: "a clash between today and your animal sign", s: "today's clash", t: "in folk belief, today's earthly branch clashes with your animal sign, so a slower pace suits you",
    x: "the earthly branches are the twelve animal signs of the Chinese calendar, and a clash means today's sign sits opposite yours on the wheel",
    a: "stay patient and give everything a little extra time, so today goes by smoothly" };

  var D = { domain: "horoscope", items: I };
  (root.FORTUNE_EN_Q = root.FORTUNE_EN_Q || []).push(D);
  root.FORTUNE_EN = root.FORTUNE_EN || {}; root.FORTUNE_EN[D.domain] = D;
  if (typeof module !== "undefined" && module.exports) module.exports = D;
})(typeof window !== "undefined" ? window : globalThis);
