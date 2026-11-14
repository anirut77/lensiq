/* i18n/en-kb-numbers.js — English reading data (Thai number reading) for fortune-ai.js (English mode). Mirrors i18n/zh-kb-numbers.js key for key.
   Digit pairs are read in either order (24 and 42 share a meaning); each key still gets its own name n.
   Based on traditional beliefs; readers use their own judgement. Nothing here concerns lotteries or games of chance. */
(function (root) {
  "use strict";
  // Base meanings: key = smaller digit first (same as the pairs in numbers-kb.js). Pairs "to watch" are worded gently.
  // Fields: name; o overview; p personality; w work; m money; l love; c social; a advice (mainly for pairs to watch)
  var BASE = {
    "00": { name: "the open page", o: "this pair is like a blank page, leaving you plenty of room to write in your own goals", p: "you think most clearly in quiet moments, so pausing to sort out your thoughts suits you well", a: "write your goals down clearly first, then fill in the blank space one step at a time" },
    "01": { name: "the fresh start", o: "you set out again with confidence and the courage to walk your own path", w: "you do well building new projects from scratch and growing them into something real", p: "you have a strong mind of your own, and listening a little more to your team takes you further" },
    "02": { name: "the gentle carer", o: "you are gentle and attentive, always mindful of how the people around you feel", l: "your charm is quiet and lasting, and it finds its way into someone's heart over time", c: "friends trust you deeply and often share what is on their minds with you" },
    "03": { name: "the quick doer", o: "you move fast and handle urgent matters with ease", w: "you shine in fast-paced work, and pairing that speed with a plan keeps you steady", p: "your courage is a real strength, and slowing down a touch makes your decisions more complete", a: "when a big decision comes up, pause and count to ten before you answer" },
    "04": { name: "the idea spark", o: "your mind moves quickly and fresh ideas keep flowing", c: "you express yourself well when you come prepared, so conversations go smoothly for you", w: "writing and planning work suits you, and setting priorities first helps you move faster" },
    "05": { name: "the calm sage", o: "you are steady and level-headed, the trusted advisor in your circle", p: "you hold firm principles of your own and are not easily swayed", w: "you excel at work that calls for analysis and careful attention" },
    "06": { name: "simple happiness", o: "you love a cozy, welcoming atmosphere and live with real taste", m: "your income and spending balance out nicely, and a separate savings account helps your savings keep growing", l: "your relationships warm up gradually through the small moments of everyday life" },
    "07": { name: "the weight on your shoulders", o: "you are deeply responsible, and people feel at ease handing things to you", w: "you are dependable at work, though you tend to carry too much on your own", a: "share some of your workload with others and keep time set aside for rest" },
    "08": { name: "the money tide", o: "your finances tend to move in quick swings, and you enjoy rising to a challenge", m: "you dream big, and taking things one step at a time makes your gains steadier", a: "plan your spending in a little more detail and keep a cushion of savings for peace of mind" },
    "09": { name: "faith and intuition", o: "your intuition is sharp, and you often sense early on whether something is right", p: "you carry an inner anchor that keeps you calm even in times of change" },
    "11": { name: "double confidence", o: "you are highly self-assured, ready to dream, act and make the call", p: "you have a natural leader's presence and suit roles where you make your own decisions", w: "you do well running things on your own, and bringing in other views makes your plans more complete", a: "listen to a few different voices before you make the final call" },
    "12": { name: "the soft heart", o: "you are kind at heart and often help others before you look after yourself", l: "you are tender and caring in love, and stating your boundaries clearly helps you feel at ease", c: "you blend leadership with gentleness, which makes you a natural at looking after a team", a: "state your boundaries clearly and say no kindly when you need to" },
    "13": { name: "full of fire", o: "you are bold and driven, and you do not back away from hard problems", w: "your competitive streak is strong, and with a clear goal it becomes a great driving force", p: "you can be a little impatient, and staying calm makes your results much better", a: "when emotions run high, give yourself a moment before deciding anything" },
    "14": { name: "the leader and negotiator", o: "your words carry weight, and you are skilled at bringing people together", w: "sales, coordination and pitching suit you, as your leadership and way with words earn trust", c: "you are reasonable and persuasive, and opportunities often come to you through conversation" },
    "15": { name: "the helping hand", o: "you often earn the appreciation and support of elders and mentors", w: "you are steady and reliable, well suited to positions of real responsibility", m: "your finances build up gradually through stable work and a good reputation", p: "your knowledge and integrity have earned you a good name" },
    "16": { name: "the charismatic leader", o: "you have a leader's charm and take good care of the people around you", m: "you do well earning through work with people, such as service or sales", l: "you are warm and considerate in love, and you know how to respect your partner" },
    "17": { name: "the steadfast leader", o: "you are focused and have great stamina, reaching big goals through steady effort", w: "you often take work on yourself, and sharing it out makes things much lighter", p: "your success may come a little slowly, but it is solid and lasting" },
    "18": { name: "ambition and drive", o: "you are ambitious, unafraid to think big, and full of driving force", w: "when you use this drive with principle, you become a leader people respect", m: "you are bold with money, and reading a contract one more time keeps you on safe ground", a: "keep your emotions in check and read documents carefully before you sign" },
    "19": { name: "the visionary leader", o: "you see far ahead and love learning new things", w: "work with an international or technology angle suits you", p: "you have ideas of your own and often spot opportunities before others by instinct" },
    "22": { name: "gentle charm", o: "you are gentle and charming, and the people around you are fond of you", l: "your love life is romantic, and you notice the little details about your partner", c: "you are easy to be around, and friends are often glad to lend a hand" },
    "23": { name: "sunny charm", o: "you are cheerful and warm, and you bring a lively feel to any room", l: "your love life is colorful, and you enjoy giving your partner little surprises", c: "you are not shy about expressing yourself, so people remember you right away" },
    "24": { name: "the charming communicator", o: "your way of speaking is charming, and listening to you is a pleasure", l: "you communicate well, so things flow easily with your partner", m: "your income often comes through dealing with people, which suits sales and service", c: "you are well liked, and people enjoy dealing with you" },
    "25": { name: "the kind overthinker", o: "you are kind and empathetic, a wonderful listener", p: "you tend to overthink, and saying your worries out loud makes them lighter", c: "you are gentle and wise, well suited to listening and counseling roles", a: "talk your worries over with someone you trust instead of keeping them to yourself" },
    "26": { name: "the warm magnet", o: "you are very appealing, and people around you cherish you", l: "your love life is sweet, and you tend to meet people who truly understand you", m: "work connected with beauty, the arts or service suits you, and your income can really shine there" },
    "27": { name: "the open purse", o: "you are big-hearted and especially willing to help friends out with money", m: "if you keep tracking your spending, that patience helps you build a solid base", a: "before you co-sign for someone or lend them money, agree on clear terms first" },
    "28": { name: "wealth through connections", o: "you know a lot of people, and money opportunities often come through your network", m: "business that relies on connections suits you, as long as your financial plan is detailed" },
    "29": { name: "international charm", o: "you are approachable and get along with people from many different cultures", c: "strangers are often kind to you, and travel tends to bring you opportunities", w: "online and international work suits you, and you understand what clients need" },
    "33": { name: "double drive", o: "you are hardworking and capable, and once you start you hardly stop", w: "competitive, athletic or high-energy work suits you", p: "you can be quick-tempered, and slowing your words a little wins people over", a: "when an argument heats up, stop for a moment and soften your tone before you go on" },
    "34": { name: "the sharp talker", o: "you work fast, think fast and speak your mind directly", w: "work that calls for quick decisions and on-the-spot problem solving suits you", c: "a slightly softer tone makes your negotiations go even better" },
    "35": { name: "the skilled worker", o: "you are diligent and capable, quick and precise in what you do", w: "your real skill earns you respect, and technical or professional work suits you" },
    "36": { name: "earning through effort", o: "you are willing to work hard, and your effort turns into income you can see", m: "business and sales go smoothly for you, and small business owners love this pair", l: "you are charming and expressive, so your love life is rich and colorful" },
    "37": { name: "rising to the challenge", o: "you handle pressure well and always find a way through tough stretches", w: "you treat obstacles as tests, and they make you stronger", a: "when pressure builds, make sure you rest enough and take your time when you are out and about" },
    "38": { name: "the bold pioneer", o: "you are willing to take on big ventures and to roll up your sleeves", m: "before you commit large sums, you think your financial plan through carefully", w: "you have strong drive and suit pioneering work" },
    "39": { name: "hard work and vision", o: "you are diligent and forward-looking, and you love learning new technology", w: "international and online work tends to bring you good openings", p: "your intuition helps you make decisions at the right moment" },
    "44": { name: "double communication", o: "you are a natural talker who makes friends wherever you go", c: "you are lively in a crowd, and people love hearing what you share", w: "media, teaching or content creation suits you, and noting down your ideas lets them keep growing" },
    "45": { name: "the wise negotiator", o: "you speak in an orderly way, and your reasoning convinces people", w: "consulting and advisory work suits you, where your knowledge earns recognition", p: "you are bright and eager to learn, with a fine reputation in your field" },
    "46": { name: "earning through negotiation", o: "you negotiate well and have a real talent for closing deals and persuading people", m: "your income often comes through communication, which suits online selling", c: "you express yourself with charm, so people want to work with you" },
    "47": { name: "the steady communicator", o: "you handle work that needs explaining and coordinating very well", w: "paperwork can tire you out, and planning your breaks makes a big difference" },
    "48": { name: "the business communicator", o: "you have a good head for business and can see where the money is", m: "checking your facts before any large expense keeps you on firmer ground", w: "marketing and well-planned business ventures suit you" },
    "49": { name: "the far-reaching communicator", o: "your reach is wide, and your fresh ideas often draw attention", w: "online work and cross-border collaboration of all kinds suit you", c: "you often find opportunities through travel and a wide circle of contacts" },
    "55": { name: "solid wisdom", o: "you are calm and wise, someone the people around you can lean on", p: "you are grounded and reliable, and doing good work steadily keeps your life on track", w: "you are trustworthy, and elders and managers feel at ease with you" },
    "56": { name: "wealth and good fortune", o: "you know how to handle money, so everyday expenses rarely worry you", m: "you combine wisdom with joy, keeping both work and finances in good order", l: "your love life is steady and warm, and it puts people at ease" },
    "57": { name: "principled persistence", o: "you are responsible and principled, and you pay close attention to detail", w: "work that demands a high level of accuracy suits you", p: "you can be too hard on yourself at times, and relaxing now and then does you good" },
    "58": { name: "the wise planner", o: "you look at investments from every angle and adapt well on the spot", m: "you build assets through long-term planning, and letting knowledge lead keeps your gains steadier" },
    "59": { name: "wisdom and achievement", o: "you have both wisdom and intuition, and you grow at a steady pace", w: "academic, research and consulting work suits you, and you achieve through learning and skill", p: "you keep learning all the time, and your path grows steadier as you go" },
    "66": { name: "double love", o: "you love beautiful things and have plenty of charm", l: "your love life is sweet, and you know how to keep romance alive", m: "work related to the arts or beauty suits you, and spending to a plan gives you more freedom" },
    "67": { name: "caring for love", o: "you have a good heart and care deeply about every important person in your life", l: "you and your partner talk openly, so many things get worked out smoothly", m: "if you lend money, keep an eye on how repayment is going, as clear records bring peace of mind", a: "talk things through with your partner often and keep clear records of any money you lend" },
    "68": { name: "the big earner", o: "you are quick-witted and resourceful, and clients remember you easily", m: "business suits you, and a savings plan helps your wealth grow over the long run" },
    "69": { name: "love and reputation", o: "you treat relationships with deep sincerity and value loyalty", l: "you put your heart into love, and sincerity tends to be returned to you", p: "you have artistic taste and a good name in your circle" },
    "77": { name: "the double load", o: "you have tremendous stamina and do not give up easily when things get hard", w: "your success may come slowly, but it is remarkably solid", a: "share the load instead of carrying everything yourself, and ask for help when you need it" },
    "78": { name: "patience that pays", o: "you are willing to work hard, and your effort often brings a generous return", m: "long-term planning or property-related matters suit you, so remember to keep some cash on hand", w: "you work steadily, and friends are often there to back you up" },
    "79": { name: "steady faith", o: "you are settled within, and your beliefs keep giving you strength", p: "you can get through tough stretches with a calm heart", w: "long-term work that calls for deep expertise suits you" },
    "88": { name: "double ambition", o: "your ambition is big, and you have plenty of drive to earn", m: "your finances may swing quickly, and thorough planning keeps them steadier" },
    "89": { name: "new horizons", o: "your money opportunities often come from new things or from abroad", m: "you have an eye for technology and long-range plans, and good business instincts", w: "you are willing to try new fields, and people tend to respect you for it" },
    "99": { name: "double faith", o: "your intuition is strong, and you value a spiritual anchor in your life", p: "you love exploring deep ideas and branches of learning", w: "travel and contact with other countries often bring you good openings, and you enjoy exploring new technology" }
  };
  // The planet behind each digit in Thai number lore (used for the x gloss)
  var WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  var PLANET = ["the void", "the Sun", "the Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn",
    "Rahu (a shadow planet of ambition in Thai astrology)", "Ketu (a shadow planet of intuition in Thai astrology)"];
  // Single digits (used for one-digit totals sum.N)
  var DIGIT = [
    { name: "the void", o: "this digit stands for open space and a fresh start, waiting for you to fill in your goals",
      x: "in Thai number reading each digit is tied to a planet, and zero stands for the void, an empty space to fill" },
    { name: "the Sun", o: "this digit stands for leadership, self-confidence and honor for you",
      x: "in Thai number reading each digit is tied to a planet, and one belongs to the Sun" },
    { name: "the Moon", o: "this digit stands for charm, gentleness and a warm way with people, all qualities you carry",
      x: "in Thai number reading each digit is tied to a planet, and two belongs to the Moon" },
    { name: "Mars", o: "this digit stands for your diligence, courage and drive to act",
      x: "in Thai number reading each digit is tied to a planet, and three belongs to Mars" },
    { name: "Mercury", o: "this digit stands for your gift for communication, negotiation and quick wit",
      x: "in Thai number reading each digit is tied to a planet, and four belongs to Mercury" },
    { name: "Jupiter", o: "this digit stands for wisdom, learning and the support of mentors around you",
      x: "in Thai number reading each digit is tied to a planet, and five belongs to Jupiter" },
    { name: "Venus", o: "this digit stands for love, joy, the arts and prosperity in your life",
      x: "in Thai number reading each digit is tied to a planet, and six belongs to Venus" },
    { name: "Saturn", o: "this digit stands for your patience, sense of responsibility and stability",
      x: "in Thai number reading each digit is tied to a planet, and seven belongs to Saturn" },
    { name: "Rahu", o: "this digit stands for your ambition and the boldness to take on big opportunities",
      x: "Rahu is one of the two shadow planets of Thai and Indian astrology, the Moon's north node, linked with ambition" },
    { name: "Ketu", o: "this digit stands for your intuition, faith and steady growth",
      x: "Ketu is one of the two shadow planets of Thai and Indian astrology, the Moon's south node, linked with intuition" }
  ];

  var items = {};
  for (var i = 0; i < 100; i++) {
    var k = (i < 10 ? "0" : "") + i, b = BASE[k[0] <= k[1] ? k : k[1] + k[0]], it = { n: "pair " + k + " (" + b.name + ")", s: "pair " + k };
    ["o", "p", "w", "m", "l", "c", "a"].forEach(function (f) { if (b[f]) it[f] = b[f]; });
    var d1 = +k[0], d2 = +k[1];
    it.x = d1 === d2 ? "in Thai number reading, " + WORD[d1] + " belongs to " + PLANET[d1] + ", and here it appears twice"
      : "in Thai number reading, " + WORD[d1] + " belongs to " + PLANET[d1] + " and " + WORD[d2] + " to " + PLANET[d2];
    items["pair." + k] = it;
  }
  DIGIT.forEach(function (d, n) { items["sum." + n] = { n: "a digit total of " + n + " (" + d.name + ")", s: "the total of " + n, o: d.o, x: d.x }; });
  items.sum = { n: "the digit total", s: "the total", o: "the total of all the digits added together sets the overall tone of this number for you",
    x: "Thai number reading adds up every digit and reads the total alongside the digit pairs" };

  // Memorable patterns ({d} is replaced by the page with the actual digits)
  // Each pattern has its own meaning; o overview, p personality, w work, c social
  items["pattern.run"] = { n: "the repeated digits {d}", s: "the repeated digits", o: "a run of the same digit amplifies that digit's energy and makes it stand out for you",
    p: ["you have one especially vivid strength that people remember right away", "you stay with the things you are good at longer than most people do"], c: "people often remember you for one thing, so feel free to mention that strength when you introduce yourself" };
  items["pattern.up"] = { n: "the rising digits {d}", s: "the rising digits", o: "the digits climb one step at a time, a picture of the gradual progress ahead of you",
    p: ["you get more motivated when you see things moving forward bit by bit", "you tend to break hard problems into steps, from easiest to hardest"], w: "work with milestone goals, such as monthly targets or phased plans, fits your rhythm well" };
  items["pattern.down"] = { n: "the falling digits {d}", s: "the falling digits", o: "the digits step down one by one, a picture of you setting your burdens down one at a time",
    p: ["you know how to cut out what is unnecessary and lighten your mind", "you are good at boiling long material down to the key points so others get it at once"], w: "you tend to wrap up what is in hand before starting something new, so work rarely piles up on you" };
  items["pattern.mirror"] = { n: "the mirrored digits {d}", s: "the mirrored digits", o: "the digits read the same forward and backward, a symbol of the balance in your life",
    p: ["you value balance and keep your word", "you care about fairness and want every side to get its due"], c: "people trust you because you treat everyone evenly and stay consistent" };
  items["pattern.abab"] = { n: "the alternating digits {d}", s: "the alternating digits", o: "two digits take turns back and forth, a symbol of the balance of giving and receiving in your life",
    p: "your life has a steady beat without ever feeling monotonous", c: ["you know when to speak and when to listen, so you get along with all kinds of people", "you and your friends help each other out, and no one is always the only one giving"] };
  items["pattern.aabb"] = { n: "the double-pair ending {d}", s: "the double-pair ending", o: "the two doubled pairs at the end have a catchy ring that makes your number easy to remember",
    p: "you speak plainly and decide quickly, so talking with you is easy", w: ["a memorable number really helps in work where clients need to remember how to reach you, such as sales, service or an online shop", "clients and colleagues can easily pass your number along, which makes keeping in touch for work simpler"] };
  items["pattern.nozero"] = { n: "a number with no zeros", s: "the zero-free number", o: "number lore treats zero as a gap in the energy, so with no zeros in your number the energy of each pair flows straight into the next",
    p: ["you finish what you start and stay with it to the end", "you rarely give up halfway"], w: "work that needs long-term commitment, such as long projects or looking after loyal clients, is your strong suit" };

  // Letters that some traditions say to watch in names and plates, based on birth weekday
  items.kala = { n: "the letters to watch", s: "these letters", o: "according to some traditions these letters do not sit well with your birth weekday, though it is only a custom",
    a: "take these letters lightly, since your own care and actions matter far more",
    x: "kalakini letters (letters Thai tradition sets aside for each birth weekday) are a naming custom, not a rule" };

  var D = { domain: "numbers", items: items };
  (root.FORTUNE_EN_Q = root.FORTUNE_EN_Q || []).push(D);
  root.FORTUNE_EN = root.FORTUNE_EN || {}; root.FORTUNE_EN[D.domain] = D;
  if (typeof module !== "undefined" && module.exports) module.exports = D;
})(typeof window !== "undefined" ? window : globalThis);
