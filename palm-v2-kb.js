/* palm-v2-kb.js — texts of the palm reading upgrade v1 (switch window.LENSIQ_PALM_V2, default off). TH / EN / ZH.
   Three schools (Thai, Chinese, Western): line names, one plain sentence per line, a reading when the line is in the photo
   (found or added by the user) and a positive, practical reading when the user confirms the line is not on their hand.
   Hard limits (CLAUDE.md, owner spec 2026-11-19): no lifespan, death, illness or health from any line (life and Mercury
   included), no number of children, no divorce or ending a relationship, no investment, no "bad outcome unless you pay".
   A reading text names only its own line, never another one (a line that was not found is never cited).
   Every reading is "according to belief"; the page carries the single top disclaimer. Chinese and Western readings are drafts
   for the expert check before they go live (owner decision D-P9, 2026-11-19).
   Browser: window.PALM_V2_KB · Node: module.exports */
(function (root) {
  "use strict";
  /** [th, en, zh] */
  var NAMES = {
    life: { thai: ["เส้นชีวิต", "Life line", "生命线"], chinese: ["เส้นชีวิต (เส้นดิน)", "Life line (Earth line)", "生命线（地纹）"], western: ["เส้นชีวิต", "Life line", "生命线"] },
    head: { thai: ["เส้นสมอง", "Head line", "智慧线"], chinese: ["เส้นสมอง (เส้นคน)", "Head line (Human line)", "智慧线（人纹）"], western: ["เส้นสมอง", "Head line", "智慧线"] },
    heart: { thai: ["เส้นหัวใจ", "Heart line", "感情线"], chinese: ["เส้นหัวใจ (เส้นฟ้า)", "Heart line (Heaven line)", "感情线（天纹）"], western: ["เส้นหัวใจ", "Heart line", "感情线"] },
    fate: { thai: ["เส้นวาสนา", "Fate line", "命运线"], chinese: ["เส้นวาสนา (เส้นอาชีพ)", "Fate (career) line", "事业线（玉柱纹）"], western: ["เส้นวาสนา (เส้นเสาร์)", "Fate (Saturn) line", "命运线（土星线）"] },
    sun: { thai: ["เส้นอาทิตย์", "Sun line", "太阳线"], chinese: ["เส้นอาทิตย์ (เส้นชื่อเสียง)", "Sun (reputation) line", "太阳线"], western: ["เส้นอาทิตย์ (อพอลโล)", "Sun (Apollo) line", "太阳线（阿波罗线）"] },
    mercury: { thai: ["เส้นพุธ (เส้นการเงิน)", "Mercury (money) line", "财运线"], chinese: ["เส้นการเงิน", "Wealth line", "财运线"], western: ["เส้นพุธ", "Mercury line", "水星线"] },
    marriage: { thai: ["เส้นแต่งงาน / ความรัก", "Marriage / affection lines", "婚姻线"], chinese: ["เส้นแต่งงาน", "Marriage lines", "婚姻线"], western: ["เส้นความผูกพัน", "Affection lines", "婚姻线（亲密关系线）"] },
    girdle: { thai: ["วงแหวนศุกร์", "Girdle of Venus", "金星带"], chinese: ["วงแหวนศุกร์", "Girdle of Venus", "金星带"], western: ["วงแหวนศุกร์", "Girdle of Venus", "金星带"] },
    bracelet: { thai: ["เส้นกำไลข้อมือ", "Bracelet lines", "手腕线"], chinese: ["เส้นกำไลข้อมือ", "Bracelet lines", "手颈纹"], western: ["เส้นกำไลข้อมือ", "Rascettes (bracelet lines)", "手腕线"] },
    simian: { thai: ["มือตัด (เส้นตัด)", "Simian line", "断掌"], chinese: ["มือตัด", "Simian line", "断掌（通贯掌）"], western: ["เส้นตัด", "Simian line", "断掌"] }
  };
  /** one plain sentence on what the line is (all schools; Mercury differs in the West) */
  var ABOUT = {
    life: ["เส้นโค้งรอบโคนนิ้วโป้ง ตำราอ่านเป็นจังหวะการใช้ชีวิตและพลังใจ", "The curve around the base of the thumb; tradition reads it as your pace and drive.", "环绕拇指根部的弧线，传统上看作生活节奏与干劲。"],
    head: ["เส้นที่พาดกลางฝ่ามือ ตำราอ่านเป็นวิธีคิดและการตัดสินใจ", "The line across the middle of the palm; tradition reads it as how you think and decide.", "横贯掌心的线，传统上看作思考与决断的方式。"],
    heart: ["เส้นบนสุดใต้โคนนิ้ว ตำราอ่านเป็นวิธีแสดงความรู้สึกและความใส่ใจ", "The top line below the fingers; tradition reads it as how you show feeling and care.", "手指下方最上面的一条线，传统上看作表达感情与关心的方式。"],
    fate: ["เส้นแนวตั้งกลางฝ่ามือขึ้นไปทางนิ้วกลาง ตำราอ่านเป็นเส้นทางงานและเป้าหมาย",
      "The upright line through the middle towards the middle finger; tradition reads it as your path in work and goals.", "从掌心向中指方向的竖线，传统上看作事业与目标的路径。"],
    sun: ["เส้นแนวตั้งสั้น ๆ ใต้นิ้วนาง ตำราอ่านเป็นการได้รับการยอมรับในผลงาน", "A short upright line below the ring finger; tradition reads it as recognition for your work.",
      "无名指下方的短竖线，传统上看作作品与努力获得认可。"],
    mercury: ["เส้นแนวตั้งสั้น ๆ ใต้นิ้วก้อย ตำราอ่านเป็นไหวพริบด้านการสื่อสารและการค้า",
      "A short upright line below the little finger; tradition reads it as a knack for communication and trade.", "小指下方的短竖线，传统上看作沟通与经商的灵活头脑。"],
    mercuryWest: ["เส้นเฉียงจากฐานฝ่ามือขึ้นไปทางนิ้วก้อย ตำราตะวันตกอ่านเป็นไหวพริบด้านการสื่อสารและการค้า",
      "A slanting line from the lower palm towards the little finger; Western tradition reads it as a knack for communication and trade.", "从掌根斜向小指的线，西方传统看作沟通与经商的灵活头脑。"],
    marriage: ["ขีดแนวนอนสั้น ๆ ที่ขอบมือใต้นิ้วก้อย ตำราอ่านเป็นคุณค่าที่ให้กับความผูกพัน",
      "Short marks on the edge of the hand below the little finger; tradition reads them as the value you give close bonds.", "小指下方手掌侧缘的短横纹，传统上看作你对亲密关系的珍视。"],
    girdle: ["เส้นโค้งจาง ๆ ใต้โคนนิ้วกลางและนิ้วนาง ตำราอ่านเป็นความอ่อนไหวต่อความงามและบรรยากาศ",
      "A faint arc below the middle and ring fingers; tradition reads it as sensitivity to beauty and mood.", "中指与无名指下方的淡弧线，传统上看作对美与氛围的敏感。"],
    bracelet: ["เส้นขวางที่ข้อมือ ตำราอ่านเป็นความมั่นคงที่ค่อย ๆ สะสม", "The lines across the wrist; tradition reads them as steadiness built over time.", "手腕上的横纹，传统上看作逐步积累的稳定。"],
    simian: ["เส้นเดียวที่พาดขวางฝ่ามือตลอดแนว ตำราอ่านเป็นความมุ่งมั่น", "One line running straight across the whole palm; tradition reads it as determination.", "一条横贯整个手掌的线，传统上看作意志坚定。"]
  };
  /** readings: p = line in the photo (found / added), a = "my hand doesn't have this line"; each [th, en, zh] */
  var READ = {
    life: {
      thai: { p: ["ตำราไทยอ่านว่าคุณมีพลังใจและความกระตือรือร้นในการใช้ชีวิต จัดเวลาพักให้สมดุลกับเวลาลุย จะทำสิ่งที่ตั้งใจได้ต่อเนื่อง",
        "Thai practice reads drive and enthusiasm for life; balancing rest with effort keeps you going on what you set out to do.", "泰国传统认为你有干劲、热爱生活；把休息与努力安排平衡，就能持续完成想做的事。"],
        a: ["ตำราไทยถือว่าพลังของคุณไม่ได้อยู่ที่เส้นเดียว แต่อ่านจากทั้งมือ คุณกำหนดจังหวะชีวิตเองได้ ลองจัดวันให้มีเวลาทำสิ่งที่ชอบสม่ำเสมอ",
          "Thai practice reads your drive from the whole hand, not one line. You set your own pace; keep regular time for what you enjoy.",
          "泰国传统认为你的干劲来自整只手，而不是单一掌纹。你能掌握自己的节奏，记得固定留时间给喜欢的事。"] },
      chinese: { p: ["ตำราจีนเรียกว่าเส้นดิน อ่านเป็นรากฐานและความหนักแน่นในการใช้ชีวิต คุณเหมาะกับการค่อย ๆ สร้างทีละขั้นอย่างมั่นคง",
        "Chinese practice calls it the Earth line: your footing and steadiness in daily life. You do well building step by step.", "中国手相称之为地纹，看作生活的根基与稳重；你适合一步一步稳稳地积累。"],
        a: ["ตำราจีนดูสามเส้นหลักประกอบกัน เมื่อเส้นนี้ไม่เด่น เส้นอื่นจะนำ คุณขับเคลื่อนชีวิตด้วยการวางแผนและผู้คนรอบตัว ทำทีละขั้นก็มั่นคง",
          "Chinese practice reads the three main lines together; when this one is quiet the others lead: you move forward through plans and people, step by step.",
          "手相讲三才互补，这条纹不显时由其他掌纹主导：你更靠计划与人脉推进生活，按部就班就很稳。"] },
      western: { p: ["ตำราตะวันตกสมัยใหม่อ่านเส้นนี้เป็นความกระตือรือร้นและพลังในการลงมือทำ ตั้งเป้าที่ชัดแล้วคุณจะไปถึงได้ด้วยแรงของตัวเอง",
        "Modern Western palmistry reads this line as enthusiasm and energy for action; with a clear goal you get there on your own steam.", "现代西方手相把这条线看作热情与行动力；目标清楚时，你能靠自己的力量达成。"],
        a: ["ตำราตะวันตกสมัยใหม่อ่านเส้นนี้เป็นความกระตือรือร้น เมื่อไม่เห็นเส้นให้ดูเส้นอื่นประกอบ คุณมักเลือกทำสิ่งที่มีความหมายกับตัวเองมากกว่าทำตามจังหวะคนอื่น",
          "Modern Western palmistry reads this line as enthusiasm; without it, read the other lines: you tend to pick what matters to you over others' pace.",
          "现代西方手相把这条线看作热情；看不到时就参考其他掌纹：你往往选择对自己有意义的事，而不是跟随别人的节奏。"] }
    },
    head: {
      thai: { p: ["ตำราไทยอ่านว่าคุณคิดเป็นระบบและมีหลักในการตัดสินใจ ลองจดเหตุผลก่อนตัดสินใจเรื่องสำคัญ จะเห็นทางเลือกชัดขึ้น",
        "Thai practice reads orderly thinking and firm reasons for your choices; writing your reasons down before a big decision makes the options clearer.",
        "泰国传统认为你思路清晰、做决定有原则；重要决定前把理由写下来，选择会更清楚。"],
        a: ["ตำราไทยอ่านว่าคุณคิดจากประสบการณ์จริงมากกว่าทฤษฎี จดสิ่งที่ได้เรียนรู้ไว้ จะเห็นทางเลือกชัดขึ้น",
          "You think from real experience more than theory; noting what you learn makes your options clearer.", "你更多从实际经验思考，而非理论；把学到的记下来，选择会更清晰。"] },
      chinese: { p: ["ตำราจีนเรียกว่าเส้นคน อ่านเป็นสติปัญญาและการวางแผน คุณเหมาะกับงานที่ต้องคิดล่วงหน้าและจัดลำดับเรื่องต่าง ๆ",
        "Chinese practice calls it the Human line: wisdom and planning. You suit work that needs thinking ahead and putting things in order.", "中国手相称之为人纹，看作智慧与谋划；你适合需要提前思考、安排先后的工作。"],
        a: ["ตำราจีนอ่านว่าคุณปรับตัวตามสถานการณ์เก่ง ใช้สัญชาตญาณหาทางออกได้ ก่อนตัดสินเรื่องสำคัญลองเขียนข้อดีข้อเสีย",
          "Quick to adapt; intuition finds a way. Before a big decision, list the pros and cons.", "主随机应变，遇事凭直觉也能找到出路；重要决定前列出利弊，更稳妥。"] },
      western: { p: ["ตำราตะวันตกอ่านเส้นนี้เป็นสไตล์การคิดของคุณ คุณมีสมาธิและเรียนรู้ได้ดีเมื่อได้ลงมือทำจริง ทบทวนสั้น ๆ หลังทำงานเสร็จจะช่วยให้เก่งขึ้นเร็ว",
        "Western palmistry reads this line as your thinking style: you focus well and learn best by doing; a short review after each task speeds you up.",
        "西方手相把这条线看作思维风格：你专注力好，在实践中学得最快；每次做完简单回顾一下，进步更快。"],
        a: ["ตำราตะวันตกอ่านว่าความคิดของคุณยืดหยุ่น ไม่ติดกรอบ เหมาะกับงานที่เปลี่ยนเร็ว ลองตั้งเวลาทบทวนสั้น ๆ ก่อนตัดสินใจ",
          "Your thinking is flexible and suits fast-changing work; a short review pause before deciding helps.", "你的思维灵活、不拘一格，适合变化快的工作；做决定前留一点时间回顾会更好。"] }
    },
    heart: {
      thai: { p: ["ตำราไทยอ่านว่าคุณใส่ใจความรู้สึกของคนรอบตัวและจริงใจในความสัมพันธ์ บอกความรู้สึกออกมาตรง ๆ อย่างอ่อนโยน คนใกล้ตัวจะเข้าใจคุณมากขึ้น",
        "Thai practice reads care for the people around you and sincerity in relationships; saying how you feel, gently and plainly, helps people close to you understand.",
        "泰国传统认为你在意身边人的感受，对感情真诚；温和而直接地说出感受，身边的人会更懂你。"],
        a: ["ตำราไทยอ่านว่าคุณแสดงความรักผ่านการกระทำมากกว่าคำพูด บอกความรู้สึกออกมาบ้าง คนใกล้ตัวจะเข้าใจคุณมากขึ้น",
          "You show care through actions more than words; saying how you feel now and then helps people close to you understand.", "你更多用行动而非言语表达关心；偶尔说出感受，身边的人会更懂你。"] },
      chinese: { p: ["ตำราจีนเรียกว่าเส้นฟ้า อ่านเป็นความรู้สึกและน้ำใจ คุณเป็นคนมีน้ำใจ ดูแลความสัมพันธ์ด้วยความสม่ำเสมอแล้วจะยิ่งอบอุ่น",
        "Chinese practice calls it the Heaven line: feeling and kindness. You are warm-hearted; steady care makes relationships warmer still.", "中国手相称之为天纹，看作感情与情义；你重情义，持续用心经营，关系会更温暖。"],
        a: ["ตำราจีนอ่านว่าความรู้สึกของคุณเก็บไว้ข้างในแต่จริงใจ พูดคำห่วงใยเพิ่มอีกนิด ความสัมพันธ์จะอบอุ่นขึ้น",
          "Feelings run quiet but sincere; one more caring word warms a relationship.", "感情内敛而真诚；多一句关心的话，关系会更温暖。"] },
      western: { p: ["ตำราตะวันตกอ่านเส้นนี้เป็นวิธีที่คุณรักและแสดงความรู้สึก คุณให้ความสำคัญกับความไว้ใจ การคุยกันอย่างเปิดใจจะทำให้ความผูกพันลึกซึ้งขึ้น",
        "Western palmistry reads this line as the way you love and show feeling: trust matters to you, and open talk deepens your bonds.", "西方手相把这条线看作你爱与表达感情的方式：你重视信任，坦诚交流会让感情更深。"],
        a: ["ตำราตะวันตกอ่านว่าคุณใช้เหตุผลนำอารมณ์ จึงเป็นที่พึ่งของคนอื่นได้ดี อย่าลืมให้เวลากับความรู้สึกของตัวเองด้วย",
          "You lead with reason, which makes you someone others rely on; give your own feelings time too.", "你以理性带动情感，因此很值得别人依靠；也别忘了照顾自己的感受。"] }
    },
    fate: {
      thai: { p: ["ตำราไทยอ่านว่าคุณมีเป้าหมายในงานที่ชัด และไปถึงได้ด้วยความตั้งใจ แบ่งเป้าใหญ่เป็นขั้นเล็ก ๆ จะเห็นความก้าวหน้าชัดขึ้น",
        "Thai practice reads a clear aim in your work that you reach through commitment; breaking a big goal into small steps makes progress visible.",
        "泰国传统认为你在事业上目标清楚，能靠决心达成；把大目标拆成小步骤，进步会更明显。"],
        a: ["ตำราถือว่าเป็นเรื่องปกติ คุณเป็นคนอิสระ สร้างเส้นทางของตัวเองได้หลายแบบ ตั้งเป้าหมายระยะสั้นเป็นช่วง ๆ จะเห็นความก้าวหน้าชัด",
          "Tradition counts this as common: you are independent and can build more than one path; short-term goals make progress visible.", "传统认为这很常见：你独立自主，能走出多条路；设定阶段性的短期目标，进步会更明显。"] },
      chinese: { p: ["ตำราจีนอ่านเส้นนี้เป็นเส้นทางอาชีพ คุณทำงานได้ต่อเนื่องและมีคนสนับสนุน สะสมความชำนาญในสายงานหลักจะยิ่งมั่นคง",
        "Chinese practice reads this line as your career path: steady work and people who back you; building skill in your main field makes it firmer.",
        "中国手相把这条线看作事业路径：做事持久、有人支持；在本行持续积累专长会更稳。"],
        a: ["ตำราจีนอ่านว่าคุณเป็นแบบ \"สร้างทางเอง\" ไม่พึ่งรางเดิม อาศัยความสามารถและจังหวะ ตั้งเป้าเล็ก ๆ ทีละช่วงก็พอ",
          "The \"build your own way\" type: ability and timing over a fixed track; set one small goal per period.", "多为自立门户型，不靠固定轨道，靠能力与机缘；每段时间定一个小目标即可。"] },
      western: { p: ["ตำราตะวันตกอ่านเส้นนี้เป็นความรู้สึกว่ามีทิศทางและความรับผิดชอบในงาน คุณทำงานได้ดีเมื่อรู้ว่างานนั้นสำคัญกับคุณอย่างไร",
        "Western palmistry reads this line as a sense of direction and responsibility at work; you do best when you know why the work matters to you.",
        "西方手相把这条线看作方向感与责任感；当你清楚这份工作对你的意义时，表现最好。"],
        a: ["ตำราตะวันตกอ่านว่าคุณไม่ผูกกับเส้นทางเดียว เปลี่ยนสายงานหรือบทบาทได้ดี จดสิ่งที่ทำสำเร็จไว้เป็นหลักฐานของตัวเอง",
          "You are not tied to a single track and handle changes of role well; keep a record of what you achieve.", "你不受单一路线束缚，善于转换角色；把自己的成果记录下来。"] }
    },
    sun: {
      thai: { p: ["ตำราไทยอ่านเป็นเส้นแห่งชื่อเสียงและความนิยม ผลงานของคุณมีคนเห็นคุณค่า แบ่งปันสิ่งที่ทำให้คนอื่นเห็นบ้างจะเปิดโอกาสใหม่",
        "Thai practice reads reputation and goodwill: people value your work; sharing what you do opens new chances.", "泰国传统看作名声与人缘：你的作品受人欣赏；多分享自己的成果，会带来新机会。"],
        a: ["ตำราไทยอ่านว่าความสำเร็จของคุณมาจากการสะสมผลงานอย่างต่อเนื่อง ลองเก็บผลงานไว้ให้คนเห็น", "Success comes from steady work that adds up; keep your work where people can see it.",
          "成功来自持续积累的成果；把作品放在别人看得到的地方。"] },
      chinese: { p: ["ตำราจีนอ่านเป็นชื่อเสียงและความน่าเชื่อถือ คนรอบตัวไว้ใจในผลงานของคุณ รักษาคำพูดและคุณภาพงานไว้จะยิ่งมีคนบอกต่อ",
        "Chinese practice reads reputation and trust: people rely on your work; keeping your word and your standards spreads it by word of mouth.", "中国手相看作名声与信誉：别人信任你的成果；守信、保持品质，口碑会越传越广。"],
        a: ["ตำราจีนอ่านว่าชื่อเสียงของคุณมาช้าแต่มั่นคง มาจากปากต่อปาก ทำทุกงานให้แน่นก็พอ", "Recognition comes slowly and steadily, by word of mouth; doing each job well is enough.",
          "名声来得慢而稳，靠口碑；把每件事做扎实即可。"] },
      western: { p: ["ตำราตะวันตกอ่านเป็นความคิดสร้างสรรค์และความพอใจในสิ่งที่ทำ คุณมีแววด้านศิลปะหรือการนำเสนอ ลองให้เวลากับงานสร้างสรรค์สม่ำเสมอ",
        "Western palmistry reads creativity and joy in what you do: a flair for art or presenting; give creative work regular time.", "西方手相看作创造力与对所做之事的满足：你在艺术或表达上有天赋；定期给创作留时间。"],
        a: ["ตำราตะวันตกอ่านว่าคุณทำงานเพื่อความพอใจของตัวเองมากกว่าเสียงชื่นชม ลองบอกผลงานให้คนที่เกี่ยวข้องรู้บ้าง",
          "You work for your own satisfaction more than applause; let the right people know what you did.", "你做事更多为了自己的满足而非掌声；也让相关的人知道你的成果。"] }
    },
    mercury: {
      thai: { p: ["ตำราไทยอ่านเป็นไหวพริบด้านการค้าและการเจรจา คุณมองเห็นช่องทางหารายได้จากความสามารถของตัวเอง วางแผนรายรับรายจ่ายให้ชัดจะยิ่งดี",
        "Thai practice reads a knack for trade and negotiation: you see ways to earn from your own skills; a clear plan for money in and out helps.",
        "泰国传统看作经商与谈判的灵活头脑：你能看到用自身能力赚钱的途径；把收支规划清楚会更好。"],
        a: ["ตำราไทยอ่านว่ารายได้มาจากความสามารถหลักของคุณ วางแผนรายรับรายจ่ายให้ชัด", "Income comes from your core skills; a clear plan of money in and out helps.", "收入来自你的核心能力；把收支规划清楚会更好。"] },
      chinese: { p: ["ตำราจีนอ่านเป็นช่องทางรายได้จากงานที่ทำ คุณมีหัวทางการค้าและจัดการเรื่องเงินได้รอบคอบ จดบัญชีสม่ำเสมอจะเห็นภาพชัดขึ้น",
        "Chinese practice reads income from the work you do: a head for business and careful with money; keeping accounts regularly gives a clearer picture.",
        "中国手相看作来自本业的财路：你有生意头脑，理财细心；坚持记账会看得更清楚。"],
        a: ["ตำราจีนอ่านว่าเงินมาจากงานหลักและการสะสม ไม่ใช่โชคลาภ จดบัญชีและใช้จ่ายตามรายรับก็ดีแล้ว",
          "Money comes from your main work and saving, not windfalls; keep accounts and spend within income.", "财来自本业与积累，而非偏财；记账、量入为出就是好方法。"] },
      western: { p: ["ตำราตะวันตกอ่านเป็นทักษะการสื่อสาร คุณพูดและเขียนให้คนเข้าใจได้ง่าย และเจรจาเก่ง ใช้จุดแข็งนี้ในงานที่ต้องประสานคน",
        "Western palmistry reads communication skill: you speak and write so people follow, and you negotiate well; use it in work that brings people together.",
        "西方手相看作沟通能力：你说话写作让人易懂，也擅长谈判；在需要协调他人的工作中发挥这项长处。"],
        a: ["ตำราตะวันตกอ่านว่าคุณสื่อสารแบบตรงไปตรงมาของตัวเอง ความคิดจะส่งถึงคนอื่นได้ดีที่สุดเมื่อเขียนออกมา",
          "You communicate in your own direct way; ideas land best when you write them down.", "你有自己直接的沟通方式；把想法写下来最能传达给别人。"] }
    },
    marriage: {
      thai: { p: ["ตำราไทยอ่านว่าคุณให้คุณค่ากับความผูกพันที่ลึกซึ้งและจริงใจ ให้เวลากับคนที่คุณรักอย่างสม่ำเสมอ ความสัมพันธ์จะมั่นคง",
        "Thai practice reads the value you give deep, sincere bonds; regular time with the people you love keeps those bonds steady.", "泰国传统认为你珍视深厚而真诚的感情；常花时间陪伴所爱的人，关系会更稳。"],
        a: ["ตำราไทยอ่านว่าความสัมพันธ์เติบโตจากการเลือกและการดูแล ไม่ใช่จากขีดบนมือ ให้เวลากับคนที่คุณให้คุณค่า",
          "Relationships grow from choice and care, not from marks on a hand; give time to the people you value.", "感情来自选择与经营，而非手上的纹路；把时间留给你珍视的人。"] },
      chinese: { p: ["ตำราจีนอ่านว่าคุณใส่ใจเรื่องความรักและครอบครัว ใจเย็นและคุยกันบ่อย ๆ ความสัมพันธ์จะราบรื่น",
        "Chinese practice reads care for love and family; patience and frequent talk keep a relationship smooth.", "中国手相看作重视感情与家庭；耐心、多沟通，感情会更顺。"],
        a: ["ตำราจีนอ่านว่าความรักเป็นไปตามธรรมชาติ ไม่เร่งร้อนกลับมั่นคง คุยกันและอยู่ด้วยกันให้มาก",
          "Love takes its natural course; not rushing keeps it steady. Talk and spend time together.", "感情顺其自然，不急不躁反而稳；多交流、多陪伴。"] },
      western: { p: ["ตำราตะวันตกอ่านเป็นความสามารถในการผูกพันกับคนสำคัญ คุณให้ความสำคัญกับความใกล้ชิดและความไว้ใจ",
        "Western palmistry reads your capacity for close bonds: closeness and trust matter to you.", "西方手相看作与重要的人建立亲密关系的能力：你重视亲近与信任。"],
        a: ["ตำราตะวันตกอ่านว่าคุณเปิดใจแบบค่อยเป็นค่อยไปและเลือกคนที่ไว้ใจได้ ความผูกพันที่ลึกมักมาจากมิตรภาพก่อน",
          "You open up gradually and choose people you trust; deep bonds often start as friendship.", "你循序渐进地敞开心扉，选择值得信任的人；深厚的感情常从友谊开始。"] }
    },
    girdle: {
      thai: { p: ["ตำราไทยอ่านว่าคุณอ่อนไหวต่อบรรยากาศ ความงาม และความรู้สึกของคนรอบตัว ใช้ความละเอียดอ่อนนี้ในงานสร้างสรรค์หรืองานดูแลคน",
        "Thai practice reads sensitivity to mood, beauty and other people's feelings; put it to use in creative work or in caring for others.", "泰国传统认为你对氛围、美与他人感受很敏感；把这份细腻用在创作或照顾他人上。"],
        a: ["ตำราถือว่าปกติ อารมณ์มั่นคง ไม่หวั่นไหวง่าย เป็นที่พึ่งให้คนรอบตัวได้", "Tradition counts this as usual: steady feelings, not easily shaken, someone others can lean on.",
          "传统认为这很常见：情绪稳定、不易动摇，是身边人可以依靠的人。"] },
      chinese: { p: ["ตำราจีนอ่านว่าคุณมีรสนิยมและเข้าใจอารมณ์คนอื่นได้ไว ให้เวลาพักใจบ้างเพื่อรักษาความสดชื่น",
        "Chinese practice reads good taste and a quick feel for others' moods; give yourself quiet time to stay fresh.", "中国手相看作品味好、善解人意；适当给自己静心的时间，保持精神饱满。"],
        a: ["ตำราจีนอ่านว่าคุณใจสงบ ทำงานจดจ่อ เติมความสนุกเล็ก ๆ ในชีวิตบ้างก็ดี", "A calm temperament and good focus; add a little fun to daily life.", "心性平和，做事专注；适度为生活添点小乐趣更好。"] },
      western: { p: ["ตำราตะวันตกอ่านเป็นความไวต่อความรู้สึกและความงาม คุณชื่นชมศิลปะและบรรยากาศดี ๆ ได้ลึกซึ้ง",
        "Western palmistry reads sensitivity to feeling and beauty: you appreciate art and atmosphere deeply.", "西方手相看作对情感与美的敏感：你能深刻欣赏艺术与美好的氛围。"],
        a: ["ตำราตะวันตกถือว่าพบบ่อย คุณรับมือกับบรรยากาศรอบตัวได้นิ่ง", "Western practice counts this as common: you stay even in changing surroundings.", "西方手相认为这很常见：环境变化时你也能保持平稳。"] }
    },
    bracelet: {
      thai: { p: ["ความเชื่อไทยถือว่าเส้นกำไลที่ชัดหมายถึงความมั่นคงที่ค่อย ๆ สะสม รักษาวินัยเล็ก ๆ ในชีวิตประจำวันไว้จะยิ่งมั่นคง",
        "Thai belief reads clear bracelet lines as steadiness built over time; small daily habits keep it growing.", "泰国传统认为清楚的手腕线代表逐步积累的稳定；保持日常的小习惯会更稳。"],
        a: ["ตำราไทยอ่านว่าความมั่นคงของคุณมาจากการวางรากฐานด้วยตัวเองทีละขั้น", "Your stability comes from laying foundations yourself, one step at a time.", "你的稳定来自一步一步亲手打下的基础。"] },
      chinese: { p: ["ตำราจีนอ่านเป็นความสุขสบายที่สะสมทีละน้อย ใช้ชีวิตเป็นระบบและเก็บออมสม่ำเสมอ",
        "Chinese practice reads comfort that builds little by little; an orderly routine and steady saving suit you.", "中国手相看作逐渐累积的福气；生活有规律、稳定储蓄最适合你。"],
        a: ["ตำราจีนอ่านว่าความสุขสบายมาจากการสร้างเอง ใช้ชีวิตเป็นระบบและสะสมอย่างมั่นคง", "Good fortune is something you build; keep a steady routine and build up steadily.",
          "福气靠自己经营；规律作息、稳步积累。"] },
      western: { p: ["ตำราตะวันตกสมัยใหม่ให้น้ำหนักเส้นนี้น้อย อ่านเป็นความหนักแน่นและความอดทนในการทำสิ่งที่ตั้งใจ",
        "Modern Western practice gives these lines little weight and reads them as firmness and patience in what you set out to do.", "现代西方手相不太看重这些线，把它们看作做事的踏实与耐心。"],
        a: ["ตำราตะวันตกสมัยใหม่ไม่ถือเป็นเรื่องสำคัญ ให้อ่านจากเส้นอื่น", "Modern Western practice gives this little weight; read the other lines.", "现代西方手相不太看重这一点；请参考其他掌纹。"] }
    },
    simian: {
      thai: { p: ["ตำราไทยอ่านว่าคุณมุ่งมั่น ตั้งใจแล้วทำจริง ใช้ความมุ่งมั่นนี้กับเป้าหมายที่สำคัญที่สุด และเผื่อเวลาฟังความเห็นคนอื่นบ้าง",
        "Thai practice reads determination: once you decide, you follow through; aim it at your most important goal and leave room to hear others.",
        "泰国传统认为你意志坚定，说到做到；把这份坚定用在最重要的目标上，也留点空间听取别人的意见。"],
        a: ["ฝ่ามือของคุณเป็นแบบที่พบบ่อยที่สุด ตำราอ่านว่าคุณแยกเรื่องใจกับเรื่องเหตุผลได้ตามสถานการณ์",
          "Your palm shows the most common pattern; tradition reads it as keeping feelings and reasoning apart when needed.", "你的手掌是最常见的类型；传统上看作能视情况把感性与理性分开。"] },
      chinese: { p: ["ตำราจีนอ่านว่าคุณมีความตั้งใจแน่วแน่และลงมือทำจริง สำหรับทุกเพศ ใช้พลังนี้กับงานที่ต้องอาศัยความอดทน",
        "Chinese practice reads strong will and real follow-through, for everyone alike; use it on work that needs persistence.", "中国手相看作意志坚定、行动力强，男女皆然；把这股力量用在需要坚持的事情上。"],
        a: ["ฝ่ามือของคุณเป็นแบบที่พบบ่อยที่สุด ตำราจีนอ่านว่าคุณยืดหยุ่น ปรับใจและเหตุผลให้เข้ากับแต่ละเรื่องได้",
          "Your palm shows the most common pattern; Chinese practice reads flexibility in matching heart and reason to each matter.", "你的手掌是最常见的类型；中国手相看作能灵活地让感性与理性配合不同的事。"] },
      western: { p: ["ตำราตะวันตกอ่านว่าคุณจดจ่อเต็มที่กับสิ่งที่ทำ ทั้งใจและความคิดไปทางเดียวกัน พักบ้างระหว่างทางจะทำได้นานขึ้น",
        "Western palmistry reads full focus on what you do, heart and mind pulling the same way; short breaks help you keep it up.", "西方手相看作全心投入所做的事，情感与思考方向一致；适时休息能让你坚持更久。"],
        a: ["ฝ่ามือของคุณเป็นแบบที่พบบ่อยที่สุด ตำราตะวันตกอ่านว่าคุณใช้ทั้งความรู้สึกและเหตุผลประกอบกันได้ดี",
          "Your palm shows the most common pattern; Western practice reads a good balance of feeling and reasoning.", "你的手掌是最常见的类型；西方手相看作感性与理性搭配得很好。"] }
    }
  };
  var SCHOOL_NAMES = { thai: ["ตำราไทย", "Thai", "泰式"], chinese: ["ตำราจีน", "Chinese", "中式"], western: ["ตำราตะวันตก", "Western", "西方"] };
  var api = { NAMES: NAMES, ABOUT: ABOUT, READ: READ, SCHOOL_NAMES: SCHOOL_NAMES };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PALM_V2_KB = api;
})(typeof window !== "undefined" ? window : globalThis);
