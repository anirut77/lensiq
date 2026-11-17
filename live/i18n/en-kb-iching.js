/* i18n/en-kb-iching.js — English reading data (I Ching) for fortune-ai.js (English mode). Mirrors i18n/zh-kb-iching.js key for key.
   Meanings follow iching-kb.js, rewritten in plain modern English (not quotations of the classic text).
   Based on traditional beliefs; readers use their own judgement. */
(function (root) {
  "use strict";
  var items = {};
  var HX = "a hexagram is a figure of six stacked lines, solid or broken, and the I Ching (the Chinese Book of Changes) reads sixty-four of them";
  // num, English name (pinyin), short name, [o1, o2], l, w, m, a, t
  function H(num, name, py, s, o, l, w, m, a, t) {
    items["hex." + num] = { n: "hexagram " + num + ", " + name + " (" + py + ")", s: s, o: o, l: l, w: w, m: m, a: a, t: t, x: HX };
  }

  H(1, "the Creative", "Qian", "the Creative",
    ["this hexagram carries the strength of heaven, and your drive is running high right now", "this is a good stretch for you to lead, and the more initiative you take, the smoother things go"],
    "love asks for sincerity, so you can gently be the one who takes the first step",
    "work that needs someone to lead lets you shine, so share your ideas with confidence",
    "your income grows through your own abilities, and long-range planning makes it steadier",
    "keep a steady daily rhythm, the way the heavens keep turning",
    "more chances to lead are heading your way, along with a new role to grow into");
  H(2, "the Receptive", "Kun", "the Receptive",
    ["like the earth that carries everything, your gentleness and openness are your strengths right now", "this hexagram reminds you to make patience the starting point of every decision"],
    "your relationship deepens through listening and small acts of everyday care",
    "being a strong supporter earns you trust and, in time, a bigger stage",
    "your financial stability comes from careful spending and steady saving",
    "listen to people with experience, then move forward at your own pace",
    "the path ahead favors slow and steady progress, and your patience pays off");
  H(3, "Difficulty at the Beginning", "Zhun", "Difficulty at the Beginning",
    ["like a sprout just breaking through the soil, your start takes a little extra effort", "you are laying foundations now, and if you keep going your roots will hold firm"],
    "a new connection is forming around you, so take your time getting to know each other",
    "a new project needs a clear structure from day one, so find reliable partners to build it with you",
    "at the starting stage it helps to spend your money in small steps and learn as you go",
    "ask for help out loud instead of carrying everything on your own shoulders",
    "things are moving from a bumpy start onto a steadier track");
  H(4, "Youthful Folly", "Meng", "Youthful Folly",
    ["this is a season of learning, and an open mind helps you find good answers", "your curiosity is the best teacher you have right now"],
    "love asks you both to learn from each other, so ask questions to understand rather than to judge",
    "learning a new skill or finding a good mentor opens the door for your progress",
    "you do well to read up on all the facts before a money decision, since knowledge is your best capital",
    "ask one good question first, then listen to the answer with an open heart",
    "you are entering a stretch of learning and asking advice, and the humble learner gains the most");
  H(5, "Waiting", "Xu", "the Waiting hexagram",
    ["the clouds are already gathering, and good things reach you when the timing is right", "this is your time to prepare, and waiting patiently is a skill in itself"],
    "your relationship needs patience and trust, and the answers do not have to come right away",
    "work you are waiting on moves forward naturally, so get your details ready in the meantime",
    "big purchases can wait until you have all the information you need",
    "eat well, sleep well and keep your spirits up, using the waiting time to build yourself up",
    "a little waiting lies ahead, and once the time is ripe things fall into place");
  H(6, "Conflict", "Song", "the Conflict hexagram",
    ["when opinions clash, calm conversation is your best way to find the middle ground", "this hexagram reminds you to settle differences through fairness and listening"],
    "a gentle talk with your partner helps, since understanding matters more than being right",
    "at work you do best when you let facts and reasons speak, and a neutral senior colleague can help smooth things out",
    "money agreements go best when you put them in writing, so everyone can feel at ease",
    "give a little on both sides so each of you has room to move, because yielding is not the same as losing",
    "the focus ahead is talking differences through and finding a plan both sides can accept");
  H(7, "the Army", "Shi", "the Army",
    ["this is the strength of people united by one goal, and discipline and order carry you there", "teamwork is your key during this period"],
    "when the two of you plan life together like a team, your relationship grows steadier",
    "this is a good time for you to lead a team or tidy up workflows, and fair leadership wins people over",
    "your budget benefits from discipline, so divide your money into clear portions and stick to them",
    "set the goal clearly first, then share out the tasks so everyone moves in the same direction",
    "you will rely more on teamwork from here, and clear roles keep things moving");
  H(8, "Holding Together", "Bi", "Holding Together",
    ["like water gathering across the land, this is a good time for you to make friends", "sincere cooperation and friendship are your themes right now"],
    "closeness brings warmth, and if you are single you may meet someone easy to talk to through friends",
    "working with people who share your values speeds your work up a great deal",
    "money opportunities often come to you through people you know, so look after those relationships",
    "stay close to the people who bring out the best in you",
    "your network matters more and more from here, and your friends lend a helping hand");
  H(9, "the Taming Power of the Small", "Xiao Chu", "the Taming Power of the Small",
    ["the clouds are thick but the rain has not fallen yet, and your strength is slowly building", "your small, steady wins add up to something big"],
    "your relationship grows in the details, and even a short check-in message carries weight",
    "your work moves forward steadily, so just finish one thing at a time with care",
    "your habit of saving small amounts gives you more security than you might expect",
    "value every small step, since each one brings you closer to your goal",
    "progress builds up gradually from here, and small gains turn into real change");
  H(10, "Treading", "Lü", "the Treading hexagram",
    ["even where care is needed, you move ahead calmly and courteously, and the road keeps widening", "courtesy and attention to detail are your best protection right now"],
    "even when you know each other well, your relationship still needs tact and good manners",
    "carrying yourself well around senior people earns you their trust",
    "checking the details twice before you sign or send money brings you peace of mind",
    "know where you stand and respect others, and your steps stay sure",
    "you move forward one sure step at a time, and care makes the way smooth");
  H(11, "Peace", "Tai", "the Peace hexagram",
    ["heaven and earth meet in harmony, and this is a balanced, smooth period for you", "things are flowing well right now, and good things are drifting your way"],
    "your relationship feels harmonious and in sync, a good time to plan the future together",
    "your work runs smoothly and the team pulls together, a good moment to expand or launch something new",
    "your money is flowing well, so use this time to build savings for later",
    "use the good timing to start something lasting, and share your happiness with the people around you",
    "the coming stretch settles into calm, steady progress in every area");
  H(12, "Standstill", "Pi", "the Standstill hexagram",
    ["heaven and earth are briefly out of touch, so this is a time for you to slow down and hold to your principles", "this period asks you to stay composed and wait for a new season"],
    "your relationship needs a little room for each of you to think, and giving time is also a way of caring",
    "some of your work may move slower than you expected, which gives you a chance to sharpen your skills",
    "for now your focus is on protecting the money you have rather than rushing to expand",
    "keep your mind calm and keep doing the right thing until the good timing returns",
    "the rhythm ahead is slow first and smoother later, and the right moment comes back around");
  H(13, "Fellowship with Others", "Tong Ren", "Fellowship with Others",
    ["fire under heaven lights up everyone, and this is a good time for you to gather like-minded people", "companions who share your goals are your real wealth right now"],
    "a good relationship often begins as a friendship of understanding, and a shared dream takes you far",
    "teamwork and cross-team projects go well for you, so welcome new faces",
    "teaming up with reliable people and spelling out your agreements brings you good results",
    "look for common ground more than differences, and your circle of companions keeps growing",
    "you meet more kindred spirits from here, and working together opens new doors");
  H(14, "Possession in Great Measure", "Da You", "Possession in Great Measure",
    ["the sun stands high in the sky, and your hard work is starting to bear fruit", "harvest and sharing are your themes right now"],
    "your relationship is full of warmth, and you feel proud of each other",
    "your results stand out and get noticed, a good time for you to show what you can do",
    "your finances look healthy with room to grow, so set a little aside to help others too",
    "stay modest and generous the more you have, so the abundance can last",
    "your effort turns into visible results from here, and the rewards keep growing");
  H(15, "Modesty", "Qian", "the Modesty hexagram",
    ["a mountain hidden under the earth, your humility makes people want to help you", "working quietly wins you the most goodwill right now"],
    "love is at its best with mutual respect, and you do not need to win every argument",
    "you work quietly but your results are solid, and over time that earns you recognition",
    "spending moderately without following trends keeps your finances in balance",
    "praise other people sincerely, and good opportunities find their way to you",
    "your gentle, modest manner brings you more and more support from here");
  H(16, "Enthusiasm", "Yu", "the Enthusiasm hexagram",
    ["thunder over the earth stirs up excitement, and this period is full of positive energy for you", "keeping your spirits bright helps everything go more smoothly"],
    "your relationship feels light and cheerful, and doing fun things together makes it sweeter",
    "your upbeat attitude lifts others, a good moment for you to launch a project or host an event",
    "when you plan your spending ahead of time, you can enjoy yourself without worry",
    "prepare well in advance, then relax and enjoy each opportunity",
    "a livelier stretch is coming, a good time to start new activities");
  H(17, "Following", "Sui", "the Following hexagram",
    ["knowing how to adapt to the situation is wisdom, and you do well to learn from good examples", "your flexibility is your strength right now"],
    "your relationship flows best when you are both willing to adjust and meet in the middle",
    "notice what people around you need and where things are heading, so your work fits real life",
    "being flexible with money works well for you, as long as you keep your basic discipline",
    "follow a direction that is truly good, and one day you can be the one who leads the way",
    "going with the flow brings you more than pushing against it from here");
  H(18, "Work on What Has Been Spoiled", "Gu", "Work on What Has Been Spoiled",
    ["it is time for you to deal with things you have put off and set old matters right", "tidying up and repair are your themes right now"],
    "your relationship improves when you talk through what has been on your mind, honestly and gently",
    "this is a good time for you to improve workflows, and once old problems are fixed things run better",
    "going back over your finances helps you find the spending you do not need and cut it",
    "mend what has gone wrong with care, and it can end up better than before",
    "a season of sorting things out lies ahead, and once old problems are fixed everything feels fresh");
  H(19, "Approach", "Lin", "the Approach hexagram",
    ["like spring drawing near, good energy is building around you", "a rising period is arriving for you, so it is time to get ready for new opportunities"],
    "your relationship is warming up, and genuine care moves it forward",
    "work opportunities are drawing closer, so lead your team with warmth and care",
    "your finances are improving, so plan from now on to make the most of the chances ahead",
    "use the upswing wisely while you prepare for what comes later",
    "this is a rising season, and good opportunities draw near one after another");
  H(20, "Contemplation", "Guan", "the Contemplation hexagram",
    ["like wind sweeping over the land and seeing everything, this is a good time for you to step back and take in the whole picture", "quiet observation shows you paths other people overlook"],
    "when you notice the needs your partner has not put into words, they feel truly cared for",
    "careful observation and analysis help you spot paths others have missed",
    "it pays for you to look clearly at your overall finances before any big decision",
    "set a good example through what you do, which speaks louder than anything you say",
    "the coming stretch favors watching more and rushing less, and acting once the direction is clear");
  H(21, "Biting Through", "Shi He", "Biting Through",
    ["when something stands in your way, a clear and firm decision gets things flowing again", "your key right now is untangling the knot that has things stuck"],
    "your relationship feels much lighter once you talk through whatever is bothering you, with respect",
    "you do well to see the problems blocking your work through to the end, and clear rules make it easier for everyone",
    "this is a good time for you to settle the accounts that have been hanging, so whatever you owe or are owed gets sorted",
    "make fair, clear decisions that everyone involved can accept",
    "the things that were stuck get resolved one by one, and the situation clears up");
  H(22, "Grace", "Bi", "the Grace hexagram",
    ["fire beneath the mountain lights up a lovely view, a good time for you to refresh your image and be creative", "beauty with substance is your theme right now"],
    "a nice atmosphere and thoughtful little touches make your relationship sweeter",
    "work that involves presenting, design or image really shines for you",
    "moderate spending on beautiful things works for you, especially things you can enjoy for a long time",
    "build up what is inside first, so the outer beauty can last",
    "this is a good time for you to show yourself, and your effort gets noticed");
  H(23, "Splitting Apart", "Bo", "Splitting Apart",
    ["like a tree changing its leaves, it is time for you to let go of what you no longer need", "lightening your load and protecting what matters most are your keys right now"],
    "your relationship needs you to let go of old expectations and see each other with fresh eyes",
    "your energy comes back when you cut unnecessary tasks and focus on the core",
    "this is a time for you to be thrifty and protect your main savings first",
    "let go of what you do not need to make room for something better",
    "a stage of clearing out lies ahead, and afterward you feel much lighter");
  H(24, "Return", "Fu", "the Return hexagram",
    ["after a long night the first light returns, and a new cycle is beginning for you", "a fresh start is your theme right now"],
    "your relationship has a chance to begin again in a better way",
    "work that was on hold starts moving again, and you can pick up the pace gradually",
    "your finances recover bit by bit, so start a good new habit today",
    "get back on the right track, then move forward one step at a time",
    "a new cycle is arriving, and your energy steadily picks up again");
  H(25, "Innocence", "Wu Wang", "the Innocence hexagram",
    ["when you act with a sincere and natural heart, good things happen on their own", "not forcing or straining is your wisdom right now"],
    "a sincere, unpretended kind of love is the most beautiful kind for you",
    "your work goes best when you do it honestly and carefully, without looking for shortcuts",
    "money may come back to you slowly, and your honesty and reliability are what grow in value",
    "do your own part well and leave the rest to time",
    "letting things unfold naturally works better for you than over-planning from here");
  H(26, "the Taming Power of the Great", "Da Chu", "the Taming Power of the Great",
    ["heaven held within the mountain, your strength and knowledge are building up", "this is a good time for you to gather resources before a big step forward"],
    "learning and growing together makes your relationship stronger",
    "this is a good time for you to study and gain experience, and your potential shows at the right moment",
    "building up what you own slowly over the long term works well for you, so let it grow patiently",
    "gather your focus and build your strength first, then stride forward when the time comes",
    "the strength you have stored up gets its chance to be used");
  H(27, "Nourishment", "Yi", "the Nourishment hexagram",
    ["this is a time for looking after body and mind, and what you take in and what you say both carry power", "nourishing yourself well is your focus right now"],
    "good food, warm words and real attention are the best ways for you to care for each other",
    "when you nourish your team with praise and support, the work grows",
    "your money does the most good when you spend it on what truly enriches your life and trim the luxuries",
    "choose what you listen to, watch and say with your inner well-being in mind",
    "this is a good time for you to recharge and get your energy back before setting off again");
  H(28, "Preponderance of the Great", "Da Guo", "Preponderance of the Great",
    ["the ridgepole is carrying an unusually heavy load, and it is time for you to rebalance", "you have been carrying a lot lately, so sharing the load and choosing priorities are key"],
    "your relationship needs you both to share the load instead of keeping everything inside",
    "sharing the work with your team helps, and you can be brave about the changes that need to happen",
    "the pressure eases when you review your financial commitments and reorder your priorities",
    "make a brave change at the key moment and come through this stretch with grace",
    "you are shifting your center of gravity, and with a lighter load you feel much more at ease");
  H(29, "the Abysmal", "Kan", "the Abysmal",
    ["water flowing on and on, this test makes your heart stronger", "staying calm and persistent is your key right now"],
    "sincerity is the pillar of your relationship, and the more things need adjusting, the tighter you hold hands",
    "challenging tasks sharpen your skills, and keeping your composure gets you through",
    "extra care with money serves you well for now, and a backup plan gives you peace of mind",
    "keep flowing forward like water, staying sincere as you go",
    "a little more patience and calm helps you from here, and persistence opens a new path");
  H(30, "the Clinging Fire", "Li", "the Clinging Fire",
    ["fire upon fire lights up every direction, and your mind is clear and your presence bright", "clarity and light are your themes right now"],
    "your relationship is warm and passionate, and tenderness keeps that flame just right",
    "creative work, presenting and communication really stand out for you",
    "where your money goes becomes clearer, so you can manage it better",
    "keep refueling yourself, the way a fire needs fresh wood",
    "things grow clearer and clearer, a good time for you to share your ideas");
  H(31, "Influence", "Xian", "the Influence hexagram",
    ["a lake on the mountain reflecting each other, this period is full of attraction for you", "hearts in tune are your theme right now"],
    "your charm is strong in love, and if you are single you may meet someone on your wavelength",
    "good relationships with your coworkers bring you new opportunities",
    "money opportunities come through the connections you build sincerely",
    "open your heart gently to what you feel, and connection follows naturally",
    "your sense of connection with others grows stronger, a good time to deepen relationships");
  H(32, "Duration", "Heng", "the Duration hexagram",
    ["thunder and wind always travel together, and perseverance is your key to success", "stability and staying power are your themes right now"],
    "your relationship is steady and lasting, a good time to make long-term plans together",
    "working steadily and building good habits makes your results add up noticeably",
    "long, steady saving serves you better than chasing quick gains",
    "keep your good habits going, because staying power is a strength of its own",
    "a steady rhythm brings you lasting rewards from here");
  H(33, "Retreat", "Dun", "the Retreat hexagram",
    ["knowing when to step back is a kind of wisdom you have right now", "stepping back to move forward is your strategy for now, so save your strength"],
    "a little personal space for each of you helps, and missing each other draws you closer",
    "you gain by steering clear of unnecessary conflict, stepping back to replan and coming back stronger",
    "big expenses can wait while you set your emergency fund aside first",
    "treat a step back as the crouch before you leap",
    "this is a good time for you to recharge first, then choose your moment to act");
  H(34, "the Power of the Great", "Da Zhuang", "the Power of the Great",
    ["thunder rolling across the sky, your energy is running strong right now", "you have the drive for anything at the moment, and the key is pointing that power in the right direction"],
    "your relationship is full of passion, so pair your courage with gentleness",
    "you have the strength to push big things forward, while still listening to your team",
    "chances to earn come with your drive, so check each decision with a clear head",
    "put your great strength into the right things",
    "your momentum keeps building, so remember to move forward steadily");
  H(35, "Progress", "Jin", "the Progress hexagram",
    ["the sun rising over the earth, this is a time of progress and recognition for you", "moving up step by step is your theme right now"],
    "your relationship feels open and bright, and you may go public or meet the people who matter to your partner",
    "your results are seen, and you may get a promotion or a bigger role",
    "your income may rise along with the recognition of your skills",
    "shine without holding back, and remember to thank the people who helped you",
    "chances to be noticed and to move up are ahead");
  H(36, "Darkening of the Light", "Ming Yi", "Darkening of the Light",
    ["the sun has dipped below the horizon for a while, so this is a time for you to keep your light inside", "keeping a low profile and inner wisdom are your strengths right now"],
    "your relationship needs quiet understanding, and gentleness is the best language you have",
    "if you work modestly without rushing to stand out, your ability is seen when the time is right",
    "careful spending suits you for now, with your savings coming first",
    "guard the light inside you and wait patiently for your time to shine again",
    "the rhythm ahead is hidden first and visible later, and your light comes back out");
  H(37, "the Family", "Jia Ren", "the Family",
    ["wind rising from the hearth, the people closest to you are your strength", "the warmth of home is your theme right now"],
    "your relationship has the warmth of home, a good time to meet the family or plan a life together",
    "a team where everyone knows their role works together beautifully for you",
    "your household money goes further when you manage it in an orderly way and plan it with your family",
    "take good care of the people near you first, and the happiness spreads outward",
    "your family and close relationships give you more support from here");
  H(38, "Opposition", "Kui", "the Opposition hexagram",
    ["fire and lake move in different directions, and with respect you can still find common ground", "seeking common ground while honoring differences is your key right now"],
    "when you accept your differences, your relationship becomes more beautiful",
    "the different views on your team become a strength once everyone listens",
    "you do well to start with the small money matters that everyone involved already agrees on",
    "celebrate the small wins that come from different people working together",
    "your differences slowly find points of overlap, and cooperation takes shape");
  H(39, "Obstruction", "Jian", "the Obstruction hexagram",
    ["water on the mountain makes the path rough, so this is a good time for you to pause and check your route", "asking for directions and taking a detour are both wise for you right now"],
    "your relationship needs understanding and a shared search for a way forward, so hold each other's hands tight",
    "when your work gets stuck, someone experienced can help you find a different route",
    "new big commitments can wait until you have talked to someone who knows the field",
    "treat the obstacle in front of you as a chance to reflect and grow",
    "this is a good time for you to adjust your route, and good guidance makes the going easier");
  H(40, "Deliverance", "Xie", "the Deliverance hexagram",
    ["after the thunderstorm, the things that were stuck for you start to loosen", "release and relief are your themes right now, and a sense of ease returns"],
    "your relationship feels lighter, and forgiveness and a fresh start lift your heart",
    "the problems at your work start to come undone, so you can wrap up what remains quickly",
    "money matters that were hanging over you begin to ease, and once they are settled you can start fresh",
    "let go of the past and travel on with a lighter bag",
    "tense situations relax from here, and things go more and more smoothly");
  H(41, "Decrease", "Sun", "the Decrease hexagram",
    ["cutting out the excess makes your life lighter and stronger", "less is more right now, and your sincere giving brings good things back"],
    "simple love is the most beautiful kind for you, with fewer expectations and more understanding",
    "you gain by dropping the tasks that add no value and focusing on what matters",
    "cutting back on luxuries to save makes your future feel steadier",
    "keep only what truly means something to you",
    "you let go first and gain later, and after simplifying you get more out of everything");
  H(42, "Increase", "Yi", "the Increase hexagram",
    ["wind and thunder strengthen each other, and this is a time of growth for you", "helping each other doubles what you gain, and whatever you do tends to pick up"],
    "your relationship is growing, and helping each other makes you both better people",
    "this is a good time for you to start a new project or expand, and people are ready to back you",
    "your finances are trending upward, and sharing a little with others doubles the joy",
    "help others whenever you can, and the good comes back to you",
    "this is a stage of growth, and what you give comes back to you");
  H(43, "Breakthrough", "Guai", "the Breakthrough hexagram",
    ["the lake has risen to the sky and is ready to pour down, so it is time for you to decide clearly", "decisiveness and integrity are your strengths right now"],
    "when you say what you feel openly and gently, clarity moves your relationship forward",
    "your work moves faster when you state your goals or position clearly to your team",
    "this is a good time for you to handle the money decisions you have been putting off, calmly and sensibly",
    "stay honest and decisive, and say clearly what needs to be said",
    "a clear decision is needed, and the situation becomes clearer because of it");
  H(44, "Coming to Meet", "Gou", "Coming to Meet",
    ["wind blowing beneath heaven reaches everything, and you may have an unexpected encounter", "unexpected people and chances are your theme right now"],
    "you may meet someone interesting, so get to know them well before you open your heart all the way",
    "a new opportunity may appear out of nowhere, so weigh it carefully and choose what fits you",
    "any money offer that comes your way deserves a careful check before you decide",
    "welcome new things with an open heart while keeping a clear head",
    "new encounters are coming, so see them clearly before you commit");
  H(45, "Gathering Together", "Cui", "Gathering Together",
    ["the lake gathers over the earth, and people are coming together around you", "pooling strength is your theme right now, a good time for group activities and celebrations"],
    "your love life feels warm among friends and family, and get-togethers are a good chance for you",
    "bringing your team or network together creates real power, a good time to host events",
    "pooling money or saving together in an organized way brings you good results",
    "set a clear shared goal, and everyone pulls together",
    "people gather around you from here, a good time to organize and work together");
  H(46, "Pushing Upward", "Sheng", "Pushing Upward",
    ["a tree growing up out of the earth, your steady and grounded growth is underway", "climbing step by step is your theme right now"],
    "your relationship is growing steadily, and small daily efforts really count",
    "you are moving up step by step, and senior people have noticed your effort",
    "your income grows slowly, so keep your patience and your saving discipline",
    "keep climbing one step at a time, and one day you stand higher than you imagined",
    "the direction ahead is a steady rise, and patient effort shows real progress");
  H(47, "Oppression", "Kun", "the Oppression hexagram",
    ["the lake runs shallow for a while, and you may feel a bit tired during this stretch", "this is a stage that strengthens your will, and once you come through it your heart is stronger"],
    "your relationship needs you to cheer each other on, and quiet, practical care means the most",
    "if you focus on the work without over-explaining, your results speak for you",
    "things gradually improve as you trim your spending and set priorities",
    "keep believing in yourself even when you are tired, because coming through this makes you stronger",
    "you gradually move out of the low patch, and those who keep going stand on firmer ground");
  H(48, "the Well", "Jing", "the Well",
    ["a well nourishes the whole village, and you have knowledge worth sharing with others", "wisdom that keeps flowing is your theme right now"],
    "your relationship deepens when you share your real thoughts and feelings",
    "your knowledge and skills are in demand, a good time for you to teach or advise",
    "money you spend on knowledge and skills feeds a source that never runs dry for you",
    "keep the well inside you clear through learning and rest",
    "your expertise is needed by more and more people");
  H(49, "Revolution", "Ge", "the Revolution hexagram",
    ["fire in the lake transforms everything, and it is time for you to make an important change", "change and renewal at the right moment are your themes right now"],
    "your relationship enters a new chapter, and changing a few small habits keeps it fresh",
    "this is a good time for you to update your methods, change direction or refresh your personal brand",
    "this is a good time for you to update your money plan and drop the spending habits that are not working",
    "think through why you want the change, then pick the right moment to make it",
    "a time for change is coming, and if you are ready you can ride it into something new");
  H(50, "the Cauldron", "Ding", "the Cauldron",
    ["the three-legged cauldron cooks food to nourish everyone, a good time for you to build something of value", "achievement and legacy are your themes right now"],
    "your relationship stands as steady as the cauldron, and it asks for respect, understanding and care",
    "your abilities are recognized, a good time for you to build systems or team culture",
    "this is a good time for you to build up things of lasting value",
    "shape yourself with good things, and you become someone others can lean on",
    "this is a good time for you to let your results settle into something lasting");
  H(51, "the Arousing Thunder", "Zhen", "the Arousing Thunder",
    ["thunder rolls again and again, and your first jolt of surprise turns into forward momentum", "alertness and courage are your themes right now"],
    "something in your love life makes your heart race, and once you calm down you see it is good news",
    "news or changes at work give you a chance to show what you can do",
    "if an unexpected money matter comes up, you do best to calm down and think it through before deciding",
    "when something sudden comes up, take a deep breath and meet it with a smile",
    "new stirrings wake you up, and you can use that energy to get moving");
  H(52, "Keeping Still", "Gen", "Keeping Still",
    ["mountain beyond mountain, this is a time for you to grow quiet and listen to your heart", "knowing when to stop is your wisdom right now"],
    "your relationship needs quiet time together, and simply being together is enough",
    "your work goes well when you pause to think before acting and plan with focus",
    "this is a good time for you to stop emotional spending and take a fresh look at your financial goals",
    "stop when it is time to stop and go when it is time to go, finding the balance in your life",
    "this is a good time for you to be still first and move later, setting off once you are clear");
  H(53, "Development", "Jian", "the Development hexagram",
    ["a tree on the mountain grows slowly but surely, and everything in your life is unfolding in order", "gradual progress is your theme right now"],
    "your relationship is developing beautifully at its own pace, a good time to make long-term plans together",
    "your progress at work comes step by step, so there is no need to rush",
    "good planning lets your finances grow steadily",
    "enjoy the process of growing instead of watching only the finish line",
    "things move forward steadily, and every step counts");
  H(54, "the Marrying Maiden", "Gui Mei", "the Marrying Maiden",
    ["as you step into a new role, finding your place and adjusting your expectations keeps things smooth", "adapting to a new setting is your theme right now"],
    "your relationship needs realistic expectations and respect for each other's roles",
    "when you join a new team, it helps to learn its culture first before suggesting changes",
    "living within your means suits you, with no need to compare yourself to anyone",
    "be a good learner first, and your role becomes clear in time",
    "you are stepping into a new role, and after the adjustment period things go smoothly");
  H(55, "Abundance", "Feng", "the Abundance hexagram",
    ["thunder and lightning arrive together, and this is your fullest, most brilliant moment", "a sense of rich abundance is your theme right now"],
    "your relationship is at its brightest, so treasure these good times as memories",
    "your results are peaking, so take on big things now while you also build solid foundations",
    "your finances look very good, so remember to keep a share for later",
    "make the most of this good time and shine fully, like the midday sun",
    "a season of harvest is coming, so remember to prepare for the days ahead");
  H(56, "the Wanderer", "Lü", "the Wanderer",
    ["fire on the mountain keeps moving, a good time for you to get out and broaden your view", "learning new things on the road is your theme right now"],
    "traveling together or trying new things keeps your relationship fresh",
    "business trips, seminars or learning away from your usual place bring you good gains",
    "with a clear travel budget, you can enjoy yourself without worry",
    "be a good guest wherever you go, and with humility and openness you make friends everywhere",
    "a trip or change of scene may be ahead, so set out with curiosity");
  H(57, "the Gentle Wind", "Xun", "the Gentle Wind",
    ["wind after wind reaches every corner, and your gentleness slowly changes things", "soft strength that overcomes the hard is your wisdom right now"],
    "your relationship needs gentle and steady communication",
    "your ideas get accepted when you persuade people slowly, with good reasons and courtesy",
    "even small savings add up for you when you keep at them over time",
    "keep your effort gentle and steady, since softness can be powerful too",
    "things quietly turn for the better from here");
  H(58, "the Joyous Lake", "Dui", "the Joyous Lake",
    ["two lakes refreshing each other, this period is full of smiles and friendship for you", "joy and happy conversation are your themes right now"],
    "your relationship is cheerful and bright, and open talks bring your hearts closer",
    "work in communication, sales or service goes especially well for you",
    "your money flows through your good relationships with other people",
    "share your joy with others, and your own happiness doubles",
    "more pleasant conversations and good news are on their way");
  H(59, "Dispersion", "Huan", "the Dispersion hexagram",
    ["wind over water loosens what was tight, a good time for you to let go of pressure", "bringing people back together is your theme right now"],
    "once your worries ease, your relationship feels lighter and your attention returns to each other",
    "a team that has drifted apart can come together again, and a shared goal is the best glue you have",
    "this is a good time for you to keep your money plans flexible rather than tied to one single plan",
    "let tense feelings flow out so your heart has room for good things",
    "the tension slowly melts away, and people come back together");
  H(60, "Limitation", "Jie", "the Limitation hexagram",
    ["a lake has just the right shores, and sensible limits keep your life in balance", "doing everything in just the right measure is your wisdom right now"],
    "with boundaries you both respect, your relationship grows better",
    "when you organize your work well, you do not need to overdo it",
    "a budget that is neither too loose nor too tight keeps your finances stable",
    "set sensible rules for yourself, then apply them flexibly",
    "knowing your limits helps you go steadier and farther from here");
  H(61, "Inner Truth", "Zhong Fu", "Inner Truth",
    ["wind on the lake sends ripples out from the center, and your sincerity touches people's hearts", "sincerity and keeping your word are your most important themes right now"],
    "trust makes your relationship beautiful, and hearts in tune need few words",
    "honesty and sincerity win you trust from every side",
    "your solid reputation brings money your way, since your word carries the weight of a contract",
    "speak and act from the heart, and the world answers you warmly",
    "your sincerity earns you more trust and support from here");
  H(62, "Preponderance of the Small", "Xiao Guo", "Preponderance of the Small",
    ["a bird flying low flies safely, so this is a good time for you to do small things really well", "care in small things is your wisdom right now"],
    "your relationship warms up as you notice the little things your partner loves",
    "doing your everyday tasks carefully and well builds trust over time",
    "it helps you to keep an eye on the small expenses that add up to a lot",
    "walk steadily one step at a time, and your humility takes you far",
    "this is a good time for you to start small and let little things add up");
  H(63, "After Completion", "Ji Ji", "After Completion",
    ["water and fire are each in their place, and your success has already arrived", "your focus now is protecting what you have achieved and minding the details"],
    "your relationship is stable and happy, and a little extra sweetness keeps it fresh",
    "your work is done on schedule, and careful finishing touches help the success last",
    "your finances are in good shape, so build habits that keep them that way",
    "keep your standards up after reaching the goal, and get ready for the next chapter",
    "the task ahead is holding on to what you have gained while finding fresh ideas in a steady way");
  H(64, "Before Completion", "Wei Ji", "Before Completion",
    ["fire above water, you are very close to the finish line", "hope lies just ahead, and a little extra care on the last step is all you need"],
    "your relationship is heading in a good direction, so give extra time and attention at the key moments",
    "your project is almost done, so check the details once more before you hand it in",
    "your financial goal is getting closer, so keep your discipline through the final stretch",
    "treat the end of one chapter as the start of the next, and set out with hope",
    "things are gradually wrapping up, and the new chapter is full of promise");

  /* ---------- trigrams ---------- */
  function T(key, name, py, x, o, p, c) {
    items["tri." + key] = { n: "the " + name + " trigram (" + py + ")", s: "the " + name + " trigram", o: o, p: p, c: c, x: x };
  }
  T("qian", "Heaven", "Qian", "a trigram is a three-line figure, and Heaven, made of three solid lines, stands for strength and creative power",
    "this trigram is about your strength and creative power",
    ["inside you there is a strong, clear drive, and you know what you want", "deep down you are ready to take the lead, with enough confidence to push things forward"],
    ["the world around you welcomes people who dare to think big, and helpful people are ready to back you", "the mood around you is full of drive, a good time for you to set your sights higher"]);
  T("kun", "Earth", "Kun", "a trigram is a three-line figure, and Earth, made of three broken lines, stands for openness, gentleness and patience",
    "this trigram is about your openness, gentleness and patience",
    ["inside you are gentle and open, always ready to listen", "you have the patience of the earth and can slowly nourish everything around you"],
    ["the people around you are willing to support you, and opening up to working together takes you far", "your surroundings favor teamwork and mutual support"]);
  T("zhen", "Thunder", "Zhen", "a trigram is a three-line figure, and Thunder, with one solid line beneath two broken ones, stands for awakening and first steps",
    "this trigram is about your awakening and taking the first step",
    ["you feel a fresh urge inside to get up and start doing", "you are becoming alert to something and ready to move before anyone else"],
    ["there is lively movement around you, and new news gives you a boost", "things around you are changing fast, which favors you if you move quickly"]);
  T("xun", "Wind", "Xun", "a trigram is a three-line figure, and Wind, with one broken line beneath two solid ones, stands for gentle influence that reaches everywhere",
    "this trigram is about your gentle influence that reaches everywhere",
    ["inside you are gentle and perceptive, and you read people well", "like a breeze you change things around you slowly and without strain"],
    ["the people around you are open to new ideas, and steady, gentle communication wins your way into their hearts", "your surroundings welcome people who are both courteous and persistent"]);
  T("kan", "Water", "Kan", "a trigram is a three-line figure, and Water, with one solid line between two broken ones, stands for depth and flowing around obstacles",
    "this trigram is about your depth and ability to flow around obstacles",
    ["inside you are deep and intuitive, and you can move through hard things with a calm mind", "you are flexible like water, and however winding the road you find a way on"],
    ["the situation around you calls for care and sincerity as your compass", "the road ahead has a few bends to sharpen your skills, and the calmer you stay the more smoothly you get through"]);
  T("li", "Fire", "Li", "a trigram is a three-line figure, and Fire, with one broken line between two solid ones, stands for light and clarity",
    "this trigram is about your light and clarity",
    ["inside you are bright and passionate, and you see things clearly", "you have creativity and a warmth that draws people to you"],
    ["the light around you lets your work be seen, a good time for you to show it", "the situation around you is growing clearer, and unclear matters find answers"]);
  T("gen", "Mountain", "Gen", "a trigram is a three-line figure, and Mountain, with one solid line above two broken ones, stands for steadiness and knowing when to stop",
    "this trigram is about your steadiness and knowing when to pause",
    ["inside you are steady as a mountain, and you know to stop and think before deciding", "you are focused and have your own mind, so outside voices do not easily sway you"],
    ["the situation around you reminds you to slow down, and waiting for the right moment is wise", "things around you are calm for now, a good time for you to strengthen your foundations"]);
  T("dui", "Lake", "Dui", "a trigram is a three-line figure, and Lake, with one broken line above two solid ones, stands for joy, conversation and friendship",
    "this trigram is about your joy, conversation and friendship",
    ["inside you are cheerful with a good sense of humor, and you know how to lift the mood", "your smile and kind words carry real power"],
    ["friendship and pleasant conversation are waiting for you, and communication is your key right now", "your surroundings favor easy, enjoyable teamwork"]);

  /* ---------- changing lines ---------- */
  var LX = "a changing line is a line in your cast that is turning into its opposite, showing where the situation is moving";
  var LINE = {
    1: { n: "the first line (changing)", s: "the first line",
      o: ["things are just getting started for you, so build a firm base before you push harder", "the small strength you gathered at the start is getting ready to move"],
      a: ["take the first step and make your roots strong", "start with confidence without waiting for everything to be perfect"] },
    2: { n: "the second line (changing)", s: "the second line",
      o: ["you are capable within your own circle, and it helps to accept support from the people around you", "your gentleness and good judgment are turning into clearer confidence"],
      a: ["express what you mean a little more clearly", "accept the kindness of the people around you and move forward together"] },
    3: { n: "the third line (changing)", s: "the third line",
      o: ["you are standing at a crossroads, and if you take a deep breath before deciding, the path becomes clear", "this turning point is a chance for you to grow, and your hesitation turns into clarity"],
      a: ["slow your pace a little and choose the path your heart agrees with", "pause and think before you make the call"] },
    4: { n: "the fourth line (changing)", s: "the fourth line",
      o: ["you are getting closer to a more important position, and humility opens the next door for you", "what you have prepared is turning into action, and senior people are ready to clear the way for you"],
      a: ["listen and watch closely, then go after the opportunity with confidence", "stay humble with senior people while showing them how prepared you are"] },
    5: { n: "the fifth line (changing)", s: "the fifth line",
      o: ["you are in a position of influence, and using it with kindness earns you real affection", "your gentleness is turning into leadership that everyone recognizes"],
      a: ["lead the people around you with generosity and sincerity", "use your influence to help others"] },
    6: { n: "the top line (changing)", s: "the top line",
      o: ["you have reached a high point, so be content and treasure what you have gained", "one chapter of your life is closing beautifully as a new one opens"],
      a: ["while you stand at the top, calmly look for the next mountain", "treasure what you have gained, then meet the change with ease"] }
  };
  Object.keys(LINE).forEach(function (k) {
    var L = LINE[k];
    items["line." + k] = { n: L.n, s: L.s, o: L.o, a: L.a, x: LX };
  });

  items["still"] = { n: "no changing lines", s: "this hexagram",
    t: ["the situation is fairly stable for now, and the guidance of your main hexagram holds for a while", "with no lines changing, the energy around you right now is clear and consistent"] };

  var D = { domain: "iching", items: items };
  (root.FORTUNE_EN_Q = root.FORTUNE_EN_Q || []).push(D);
  root.FORTUNE_EN = root.FORTUNE_EN || {}; root.FORTUNE_EN[D.domain] = D;
  if (typeof module !== "undefined" && module.exports) module.exports = D;
})(typeof window !== "undefined" ? window : globalThis);
