/* lensiq-pet-kb.js — content of the Pet face reading (petread.html, owner order 2026-11-16 part B), TH / EN / ZH.
 * Browser: window.LQPetKB · Node: module.exports. Pure data, no DOM, no network.
 * Adapted from face-reading tradition, not a classical text: the coat look-alikes follow the Thai cat treatise (ตำราแมว,
 * the 17 auspicious kinds) and the dog traits of ตำราพรหมชาติ as summarised with sources in docs/PET-READING-RESEARCH.md;
 * the rest is our own playful wording. Positive framing only. Hard limits (tests/unit/fortune-pet.test.js): no health,
 * illness, lifespan, age or death wording, no care advice that belongs to a vet, nothing about the owner's looks, no
 * numbers to gamble with, no "bad luck" talk. Every inauspicious kind of the treatise is left out on purpose.
 * Placeholders: {n} = the pet's name (or "your cat" / "น้องแมว" / "你的猫咪"). */
(function (root) {
  "use strict";
  const KB = {
    species: { cat: { th: "แมว", en: "cat", zh: "猫咪" }, dog: { th: "หมา", en: "dog", zh: "狗狗" } },
    defName: { cat: { th: "น้องแมว", en: "your cat", zh: "你的猫咪" }, dog: { th: "น้องหมา", en: "your dog", zh: "你的狗狗" } },
    labels: {
      coat: {
        black: { th: "ดำ", en: "Black", zh: "黑色" }, white: { th: "ขาว", en: "White", zh: "白色" }, grey: { th: "เทา / เงิน", en: "Grey / silver", zh: "灰色 / 银色" },
        orange: { th: "ส้ม / ทอง", en: "Orange / golden", zh: "橘色 / 金色" }, brown: { th: "น้ำตาล / ทองแดง", en: "Brown / copper", zh: "棕色 / 铜色" },
        cream: { th: "ครีม", en: "Cream", zh: "奶油色" }, tabby: { th: "ลายสลิด / ลายทาง", en: "Tabby / striped", zh: "虎斑 / 条纹" },
        tricolour: { th: "สามสี", en: "Three colours", zh: "三花" }, bicolour: { th: "สองสี (ขาวกับสีอื่น)", en: "Two colours (white and one more)", zh: "双色（白色加一色）" },
        tortie: { th: "ลายกระ (ดำปนส้ม)", en: "Tortoiseshell", zh: "玳瑁色" }, merle: { th: "ลายหินอ่อน", en: "Merle / marbled", zh: "陨石色 / 大理石纹" },
        fawn: { th: "น้ำตาลอ่อน", en: "Fawn", zh: "浅褐色" },
      },
      marks: {
        whitepaws: { th: "เท้าขาว", en: "White paws", zh: "白爪" }, whitetail: { th: "ปลายหางขาว", en: "White tail tip", zh: "白尾尖" },
        whitechest: { th: "สร้อยคอ / อกขาว", en: "White collar / chest", zh: "白领 / 白胸" }, facemask: { th: "แต้มสีเข้มที่หน้า หู หาง", en: "Dark points on face, ears, tail", zh: "脸、耳、尾有深色重点" },
        spots: { th: "จุดหรือด่าง", en: "Spots or patches", zh: "斑点或花斑" },
      },
      eyes: { gold: { th: "เหลือง / ทอง", en: "Gold / amber", zh: "金色 / 琥珀色" }, green: { th: "เขียว", en: "Green", zh: "绿色" }, blue: { th: "ฟ้า", en: "Blue", zh: "蓝色" },
        brown: { th: "น้ำตาล", en: "Brown", zh: "棕色" }, hazel: { th: "น้ำตาลอมเขียว", en: "Hazel", zh: "榛色" }, odd: { th: "สองสี", en: "Two different colours", zh: "鸳鸯眼" } },
      ears: { up: { th: "ตั้งชัน", en: "Upright", zh: "竖耳" }, fold: { th: "พับ / ตก", en: "Folded / floppy", zh: "折耳 / 垂耳" }, round: { th: "กลมมน", en: "Rounded", zh: "圆耳" } },
      face: { round: { th: "หน้ากลม", en: "Round face", zh: "圆脸" }, long: { th: "หน้ายาว / ปากยาว", en: "Long face / muzzle", zh: "长脸 / 长嘴" }, square: {
        th: "หน้าเหลี่ยม", en: "Square face", zh: "方脸" } },
      size: { small: { th: "ตัวเล็ก", en: "Small", zh: "小只" }, medium: { th: "ตัวกลาง", en: "Medium", zh: "中等" }, large: { th: "ตัวใหญ่", en: "Large", zh: "大只" } },
      energy: { calm: { th: "นิ่ง ใจเย็น", en: "Calm", zh: "安静沉稳" }, playful: { th: "ซน ขี้เล่น", en: "Playful", zh: "爱玩调皮" },
        curious: { th: "ช่างสงสัย", en: "Curious", zh: "好奇心强" }, cuddly: { th: "ขี้อ้อน", en: "Cuddly", zh: "黏人爱撒娇" } },
    },

    /* coat: personality (two wordings), likes, bond, and the planet whose colour is the fallback lucky colour (0 Sun … 7 Rahu) */
    coat: {
      black: { planet: 4,
        p: { th: [
          "{n} ขนดำสนิทมีบุคลิกสุขุม ดูลึกลับนิด ๆ แต่จริง ๆ เป็นตัวที่สังเกตทุกอย่างรอบบ้านอย่างละเอียด",
          "ขนดำเงางามบอกถึงความมั่นใจในแบบเงียบ ๆ {n} ไม่ต้องส่งเสียงมากก็รู้ว่าใครคือเจ้าถิ่น"
        ],
          en: [
            "{n} has a calm, slightly mysterious air, yet quietly notices everything that happens at home.",
            "A glossy dark coat suggests quiet confidence: {n} rarely needs to make a fuss to show who runs the house."
          ],
          zh: ["{n}一身乌黑，气质沉稳又带点神秘，其实把家里的大小动静都看在眼里。", "黑亮的毛色透出一种安静的自信，{n}不必吵闹，大家也知道谁才是家里的主人。"] },
        l: { th:
          "ชอบมุมสงบที่มองเห็นทั้งห้อง และชอบให้เล่นด้วยตอนเย็น ๆ ที่บ้านเงียบลง",
        en:
          "Likes a quiet spot with a view of the whole room, and a play session in the calm of the evening.",
        zh: "喜欢能看到整个房间的安静角落，也喜欢傍晚家里安静下来时的玩耍时光。" },
        b: { th:
          "ผูกพันแบบลึกซึ้ง เลือกคนที่ไว้ใจไม่กี่คน แล้วจะเดินตามติดคนนั้นเงียบ ๆ",
        en:
          "Bonds deeply with a few chosen people and then follows them around quietly.",
        zh: "感情深沉，只认定少数信任的人，然后安静地跟在他们身边。" } },
      white: { planet: 1,
        p: { th: ["{n} ขนขาวสะอาดตา ดูสง่าและเรียบร้อย ชอบให้ทุกอย่างเป็นระเบียบตามใจตัวเอง", "ความขาวสว่างของ {n} ให้ความรู้สึกอ่อนโยน แต่ข้างในมีความมุ่งมั่นอยู่ไม่น้อย"],
          en: ["{n} looks neat and elegant, and likes things arranged just so.", "A bright white coat gives {n} a gentle look, with plenty of determination underneath."],
          zh: ["{n}毛色洁白，看起来优雅整洁，喜欢一切都照自己的心意摆好。", "{n}雪白的毛色给人温柔的感觉，内心却颇有主见。"] },
        l: { th:
          "ชอบที่นอนนุ่ม ๆ ที่สะอาด แสงแดดอ่อนตอนเช้า และกิจวัตรที่เหมือนเดิมทุกวัน",
        en:
          "Likes a soft clean bed, gentle morning sun and the same daily routine.",
        zh: "喜欢柔软干净的小窝、清晨柔和的阳光，以及每天不变的作息。" },
        b: { th:
          "แสดงความรักอย่างนุ่มนวล ชอบนั่งข้าง ๆ มากกว่านั่งบนตัก แต่จะอยู่ใกล้เสมอ",
        en:
          "Shows love softly: prefers sitting beside you to sitting on you, but is never far away.",
        zh: "表达爱意很温柔，比起坐在腿上更爱坐在旁边，但总在不远处。" } },
      grey: { planet: 3,
        p: { th: ["{n} ขนเทาเงินดูนุ่มนวล ใจเย็น ช่างคิด และมักทำอะไรอย่างมีจังหวะของตัวเอง", "ขนสีเงินของ {n} บอกถึงความสุขุมแบบผู้ใหญ่ รับมือเรื่องใหม่ ๆ ได้อย่างใจเย็น"],
          en: ["{n} has a soft silver look, an easy-going mind and a rhythm all of its own.", "The silver coat suggests a wise, steady character who meets new things calmly."],
          zh: ["{n}一身银灰，性子温和，爱思考，做事有自己的节奏。", "银色的毛色透出沉稳老成的气质，面对新事物也很从容。"] },
        l: { th: "ชอบของเล่นที่ต้องใช้ความคิด ชอบหน้าต่างที่มองเห็นนกหรือใบไม้ไหว", en: "Likes puzzle toys and a window with birds or moving leaves to watch.",
          zh: "喜欢需要动脑的玩具，也喜欢能看到小鸟或树叶摇动的窗边。" },
        b: { th:
          "ผูกพันแบบมั่นคง เมื่อไว้ใจแล้วจะเป็นเพื่อนคู่ใจที่อยู่ด้วยกันได้ทุกวัน",
        en:
          "A steady bond: once trust is there, a companion for every single day.",
        zh: "感情稳定，一旦信任你，就是每天相伴的贴心伙伴。" } },
      orange: { planet: 0,
        p: { th: ["{n} ขนสีส้มทองสดใส เป็นตัวแห่งความร่าเริง เข้าหาคนเก่ง และชอบเป็นจุดสนใจ", "สีทองอบอุ่นของ {n} มาพร้อมนิสัยเป็นมิตร ใจกว้าง และมีเรื่องให้ยิ้มได้ทุกวัน"],
          en: [
            "{n} is a sunny character: friendly, outgoing and happy to be the centre of attention.",
            "A warm golden coat comes with a generous, friendly nature and something to smile about every day."
          ],
          zh: ["{n}橘金色的毛色明亮温暖，性格开朗，很会亲近人，喜欢成为大家的焦点。", "温暖的金色配上友善大方的个性，每天都能带来笑容。"] },
        l: { th:
          "ชอบเกมไล่จับ เสียงเรียกชื่อแบบร่าเริง และการได้ร่วมวงทุกกิจกรรมในบ้าน",
        en:
          "Likes chasing games, being called in a cheerful voice and joining every activity at home.",
        zh: "喜欢追逐游戏、被欢快地叫名字，也爱参与家里的每一件事。" },
        b: { th:
          "รักแบบเปิดเผย ทักทายทุกครั้งที่กลับบ้าน และชอบให้ทุกคนในบ้านเป็นเพื่อน",
        en:
          "Loves openly, greets you every time you come home and wants everyone at home as a friend.",
        zh: "爱得坦率，每次回家都来迎接，想和家里每个人都做朋友。" } },
      brown: { planet: 4,
        p: { th: ["{n} ขนสีน้ำตาลทองแดงดูอบอุ่น เป็นตัวที่ไว้ใจได้ อ่อนโยนแต่ไม่ยอมใครง่าย ๆ", "สีทองแดงของ {n} บอกถึงความหนักแน่น ซื่อตรง และรักบ้านเป็นที่สุด"],
          en: ["{n} has a warm copper look: dependable, gentle and not easily pushed around.", "The copper coat suggests a solid, honest character who loves home above all."],
          zh: ["{n}棕铜色的毛看起来很温暖，可靠又温柔，但也有自己的坚持。", "铜色的毛色透出踏实、正直的个性，最爱的就是家。"] },
        l: { th:
          "ชอบเดินสำรวจรอบบ้าน ชอบของเล่นที่ได้กัดได้ลากเล่น และมุมประจำที่เป็นของตัวเอง",
        en:
          "Likes patrolling the home, toys to tug and carry, and a favourite corner of its own.",
        zh: "喜欢在家里巡视，喜欢可以叼着拖着玩的玩具，还有专属自己的小角落。" },
        b: { th:
          "ซื่อสัตย์ต่อเจ้าของ จำกิจวัตรของคุณได้ และมักรอคุณอยู่ที่เดิมเสมอ",
        en:
          "Loyal to its person, learns your routine and is usually waiting in the same spot.",
        zh: "对主人忠诚，记得你的作息，总在老地方等你。" } },
      cream: { planet: 1,
        p: { th: ["{n} ขนสีครีมนวลดูอ่อนหวาน เป็นตัวที่ละเอียดอ่อน รับรู้อารมณ์ในบ้านได้ไว", "สีครีมอ่อนของ {n} บอกถึงนิสัยสุภาพ ช่างเอาใจ และชอบความสงบ"],
          en: ["{n} has a soft cream coat and a sensitive nature that picks up the mood at home quickly.", "A pale cream coat suggests a polite, attentive character who enjoys peace and quiet."],
          zh: ["{n}奶油色的毛看起来很甜美，心思细腻，很快就能感受到家里的气氛。", "淡淡的奶油色透出礼貌、贴心、喜欢安静的个性。"] },
        l: { th: "ชอบผ้าห่มนุ่ม ๆ เสียงพูดเบา ๆ และการถูกลูบหัวช้า ๆ ก่อนนอน", en: "Likes a soft blanket, quiet voices and a slow head rub before sleep.", zh: "喜欢柔软的毯子、轻声细语，以及睡前慢慢的摸头。" },
        b: { th:
          "ติดเจ้าของแบบอบอุ่น ชอบอยู่ในห้องเดียวกับคุณแม้ไม่ได้เล่นด้วยกัน",
        en:
          "A warm, close bond: likes to be in the same room as you, even without playing.",
        zh: "黏人又温暖，即使不玩，也喜欢和你待在同一个房间。" } },
      tabby: { planet: 2,
        p: { th: ["{n} ลายทางชัดเจนบอกถึงความคล่องแคล่ว ฉลาดหาทาง และมีพลังเหลือเฟือ", "ลวดลายบนขนของ {n} เหมือนนักผจญภัยตัวน้อย ชอบลองของใหม่และไม่ค่อยกลัวอะไร"],
          en: ["{n}'s clear stripes suggest a nimble, clever character with energy to spare.", "The pattern on {n}'s coat belongs to a little adventurer who loves trying new things."],
          zh: ["{n}清晰的条纹透出机灵、聪明、精力充沛的个性。", "{n}身上的花纹像个小小探险家，喜欢尝试新东西，胆子也不小。"] },
        l: { th: "ชอบกล่องกระดาษ ของที่ซ่อนได้ และเกมที่ได้ซุ่มรอแล้วกระโจน", en: "Likes cardboard boxes, hiding places and games of stalk-and-pounce.", zh: "喜欢纸箱、可以躲藏的地方，还有埋伏扑击的游戏。" },
        b: { th: "เป็นเพื่อนเล่นตัวจริง ผูกพันผ่านการเล่นด้วยกันทุกวัน", en: "A true playmate who bonds through playing together every day.", zh: "是真正的玩伴，通过每天一起玩耍建立感情。" } },
      tricolour: { planet: 5,
        p: { th: ["{n} สามสีเป็นตัวมีเอกลักษณ์ อารมณ์หลากหลาย ทั้งขี้เล่น ขี้อ้อน และมีความเป็นตัวของตัวเอง", "ขนสามสีของ {n} บอกถึงความมีสีสันในนิสัย คาดเดายากนิด ๆ แต่น่ารักเสมอ"],
          en: ["{n} is one of a kind: playful, affectionate and very much their own boss.", "Three colours make for a colourful character: a little hard to predict, always charming."],
          zh: ["{n}是三花，个性独特，既爱玩又爱撒娇，还很有主见。", "三种毛色透出多彩的个性，有点难以捉摸，却一直很可爱。"] },
        l: { th: "ชอบของเล่นหลายแบบสลับกัน และชอบให้คุณคุยด้วยเหมือนเป็นเพื่อนคนหนึ่ง", en: "Likes a rotation of different toys and being talked to like a friend.",
          zh: "喜欢轮流玩不同的玩具，也喜欢你像对朋友一样和它说话。" },
        b: { th: "ผูกพันแบบมีเงื่อนไขของตัวเอง เมื่อเลือกคุณแล้วจะรักมั่นคง", en: "Bonds on its own terms, and once it chooses you the love is steady.", zh: "感情有自己的规矩，一旦选定了你，就会稳稳地爱你。" } },
      bicolour: { planet: 6,
        p: { th: ["{n} ขนสองสีตัดกันชัดเจน เป็นตัวมีสองด้าน ทั้งสุขุมและซุกซนในเวลาที่ใช่", "ลายสองสีของ {n} บอกถึงความสมดุล รู้ว่าเมื่อไรควรเล่น เมื่อไรควรพัก"],
          en: ["{n}'s two-tone coat suggests two sides: calm and cheeky, each at the right moment.", "A two-colour coat suggests balance: knows when to play and when to rest."],
          zh: ["{n}双色分明，有两面性，该沉稳时沉稳，该调皮时调皮。", "双色的毛透出平衡感，知道什么时候玩，什么时候休息。"] },
        l: { th:
          "ชอบกิจวัตรที่ชัดเจน เวลาเล่นที่สม่ำเสมอ และการได้นอนพักในที่ที่คุ้นเคย",
        en:
          "Likes a clear routine, a fixed play time and resting in familiar places.",
        zh: "喜欢规律的作息、固定的玩耍时间，以及在熟悉的地方休息。" },
        b: { th:
          "ผูกพันแบบเพื่อนแท้ อ่านใจเจ้าของเก่ง และมาอยู่ข้าง ๆ เมื่อคุณต้องการ",
        en:
          "A true-friend bond: reads its person well and turns up when you need company.",
        zh: "像真正的朋友，很懂主人的心，在你需要时就来到身边。" } },
      tortie: { planet: 5,
        p: { th: ["{n} ลายกระดองเต่าผสมดำกับส้มอย่างลงตัว เป็นตัวมีความคิดของตัวเองและมีเสน่ห์แบบไม่ซ้ำใคร", "ขนลายกระของ {n} บอกถึงความกล้าแสดงออก ชัดเจนว่าชอบอะไรไม่ชอบอะไร"],
          en: [
            "{n}'s tortoiseshell coat blends dark and orange: a free thinker with a charm nobody else has.",
            "A tortoiseshell coat suggests a bold character who makes likes and dislikes very clear."
          ],
          zh: ["{n}的玳瑁色把黑与橘融合得恰到好处，很有想法，魅力独一无二。", "玳瑁色的毛透出敢于表达的个性，喜欢什么、不喜欢什么都很清楚。"] },
        l: { th: "ชอบได้เลือกเอง ทั้งที่นอน ของเล่น และเวลาที่อยากให้กอด", en: "Likes choosing for itself: the bed, the toy and the moment for a cuddle.", zh: "喜欢自己做主：睡哪里、玩什么、什么时候要抱抱。" },
        b: { th:
          "ผูกพันแบบตรงไปตรงมา เมื่อรักแล้วจะแสดงออกชัดเจนและรักเดียวใจเดียว",
        en:
          "Bonds frankly: when it loves you, it shows it clearly and stays devoted.",
        zh: "感情直接坦率，一旦爱上你就表现得很明显，而且一心一意。" } },
      merle: { planet: 7,
        p: { th: ["{n} ลายหินอ่อนเหมือนงานศิลปะ เป็นตัวช่างสังเกต ฉลาด และชอบเรียนรู้เร็ว", "ลวดลายหินอ่อนของ {n} บอกถึงความพิเศษ คิดไว ทำอะไรมีลูกเล่นเสมอ"],
          en: ["{n}'s marbled coat looks like a work of art: observant, clever and quick to learn.", "A marbled coat suggests something special: a quick mind that always has a trick up its sleeve."],
          zh: ["{n}大理石般的花纹像艺术品，观察力强、聪明、学东西快。", "大理石纹透出与众不同的气质，脑筋转得快，总有新花样。"] },
        l: { th:
          "ชอบเกมฝึกทำท่าใหม่ ๆ ของเล่นที่ซ่อนรางวัลไว้ และการได้ทำงานคู่กับคุณ",
        en:
          "Likes learning new tricks, toys with a hidden surprise and working as a team with you.",
        zh: "喜欢学新把戏、藏着小惊喜的玩具，还有和你一起搭档完成任务。" },
        b: { th:
          "ผูกพันผ่านการทำอะไรด้วยกัน ยิ่งได้เรียนรู้คู่กับคุณยิ่งใกล้ชิด",
        en:
          "Bonds by doing things together; the more you learn as a team, the closer you get.",
        zh: "通过一起做事建立感情，一起学得越多，就越亲密。" } },
      fawn: { planet: 4,
        p: { th: ["{n} ขนสีน้ำตาลอ่อนนวลตา เป็นตัวอบอุ่น อ่อนโยน และเข้ากับทุกคนในบ้านได้ดี", "สีน้ำตาลอ่อนของ {n} บอกถึงความใจดี เป็นมิตร และชอบความสงบสบาย"],
          en: ["{n}'s soft fawn coat goes with a warm, gentle nature that gets along with everyone at home.", "A fawn coat suggests kindness, friendliness and a love of easy comfort."],
          zh: ["{n}浅褐色的毛柔和顺眼，性格温暖温柔，和家里每个人都处得好。", "浅褐色的毛透出善良友好、喜欢安逸舒适的个性。"] },
        l: { th: "ชอบนอนอาบแดด ชอบที่นอนนุ่ม ๆ และเดินเล่นเรื่อย ๆ ไม่เร่งรีบ", en: "Likes sunbathing, a soft bed and unhurried strolls.", zh: "喜欢晒太阳、柔软的小窝，还有不慌不忙的散步。" },
        b: { th: "รักเจ้าของแบบอบอุ่นสม่ำเสมอ อยู่ด้วยแล้วรู้สึกผ่อนคลาย", en: "Loves its person warmly and steadily; being together feels relaxing.", zh: "对主人的爱温暖而持久，在一起就觉得放松。" } },
    },

    eyes: {
      gold: { th: "ดวงตาสีทองบอกถึงความมั่นใจและความอบอุ่น", en: "Golden eyes suggest confidence and warmth.", zh: "金色的眼睛透出自信与温暖。" },
      green: { th: "ดวงตาสีเขียวบอกถึงความช่างสังเกตและไหวพริบ", en: "Green eyes suggest a sharp, observant mind.", zh: "绿色的眼睛透出敏锐的观察力和机灵。" },
      blue: { th: "ดวงตาสีฟ้าบอกถึงความอ่อนโยนและช่างฝัน", en: "Blue eyes suggest gentleness and a dreamy side.", zh: "蓝色的眼睛透出温柔与爱幻想的一面。" },
      brown: { th: "ดวงตาสีน้ำตาลบอกถึงความจริงใจและอ่านง่าย", en: "Brown eyes suggest honesty and a heart that is easy to read.", zh: "棕色的眼睛透出真诚，心思一看就懂。" },
      hazel: { th: "ดวงตาสีน้ำตาลอมเขียวบอกถึงความยืดหยุ่น ปรับตัวเก่ง", en: "Hazel eyes suggest a flexible nature that adapts with ease.", zh: "榛色的眼睛透出灵活、适应力强的个性。" },
      odd: { th: "ดวงตาสองสีบอกถึงเสน่ห์ที่ไม่เหมือนใคร มองโลกได้สองมุม", en: "Two different eye colours suggest a one-of-a-kind charm that sees both sides of things.",
        zh: "鸳鸯眼透出独一无二的魅力，看事情能看到两面。" },
    },
    ears: {
      up: { th: "หูตั้งชันบอกว่าเป็นตัวตื่นตัว ได้ยินอะไรก็อยากรู้ก่อนใคร", en: "Upright ears mark an alert listener who wants to know first.", zh: "竖起的耳朵说明它很警觉，一有动静就想第一个知道。" },
      fold: { th: "หูพับหรือหูตกบอกถึงความนุ่มนวล เข้ากับคนง่าย", en: "Folded or floppy ears suggest a soft, easy-going nature.", zh: "折耳或垂耳透出温和、好相处的个性。" },
      round: { th: "หูกลมมนบอกถึงความเป็นมิตรและขี้เล่นแบบน่าเอ็นดู", en: "Rounded ears suggest a friendly, endearing playfulness.", zh: "圆圆的耳朵透出友善又讨人喜欢的顽皮。" },
    },
    face: {
      round: { th: "หน้ากลมตามความเชื่อเรื่องลักษณะคือหน้าที่ใจดี ชอบความสบาย", en: "In face-reading lore a round face belongs to a kind soul who loves comfort.",
        zh: "按相术的说法，圆脸代表心地善良、喜欢舒适。" },
      long: { th: "หน้ายาวตามความเชื่อเรื่องลักษณะคือหน้าที่ฉลาด มีแผนในใจเสมอ", en: "In face-reading lore a long face belongs to a clever planner.", zh: "按相术的说法，长脸代表聪明、心里总有计划。" },
      square: { th: "หน้าเหลี่ยมตามความเชื่อเรื่องลักษณะคือหน้าที่หนักแน่น ไว้ใจได้", en: "In face-reading lore a square face belongs to someone steady and dependable.", zh: "按相术的说法，方脸代表稳重可靠。" },
    },
    size: {
      small: { th:
        "ตัวเล็กแต่ใจใหญ่ ชอบที่แคบ ๆ อุ่น ๆ และการได้อยู่สูงมองลงมา",
      en:
        "Small in size, big in heart: likes snug spots and a high place to look down from.",
      zh: "身子小、心很大，喜欢窄小温暖的地方，也爱待在高处往下看。" },
      medium: { th: "ขนาดกำลังดี คล่องตัว ชอบทั้งเล่นในบ้านและเดินเล่นสั้น ๆ", en: "Just the right size and nimble: enjoys both indoor games and short outings.",
        zh: "体型刚好、身手灵活，室内游戏和短途散步都喜欢。" },
      large: { th: "ตัวใหญ่ใจดี ชอบพื้นที่กว้าง ๆ และการได้อยู่ใกล้คนในบ้าน", en: "A big, kind presence who likes room to move and staying close to the family.",
        zh: "大只又温和，喜欢宽敞的空间，也喜欢待在家人身边。" },
    },
    energy: {
      calm: { l: { th:
        "ชอบเวลาเงียบ ๆ ด้วยกัน การนั่งดูโลกข้างนอก และเสียงที่คุ้นเคย",
      en:
        "Likes quiet time together, watching the world outside and familiar sounds.",
      zh: "喜欢一起安静相处、看看窗外的世界，还有熟悉的声音。" },
        b: { th: "แสดงความรักด้วยการอยู่ใกล้ ๆ อย่างสงบ แค่ได้เห็นคุณก็พอใจแล้ว", en: "Shows love by staying close and calm; just seeing you is enough.", zh: "用安静的陪伴表达爱，只要看到你就满足了。" } },
      playful: { l: { th: "ชอบเกมไล่จับ ลูกบอล และของเล่นที่คุณขยับให้ดู", en: "Likes chase games, balls and toys that you move for it.", zh: "喜欢追逐游戏、小球，还有你动来动去逗它的玩具。" },
        b: { th:
          "ผูกพันผ่านเสียงหัวเราะ ทุกครั้งที่เล่นด้วยกันคือช่วงเวลาที่ใกล้ชิดที่สุด",
        en:
          "Bonds through laughter: every game together is your closest moment.",
        zh: "通过欢笑建立感情，每次一起玩就是最亲密的时刻。" } },
      curious: { l: { th: "ชอบสำรวจของใหม่ กล่อง ถุง และมุมที่ยังไม่เคยไป", en: "Likes exploring new things, boxes, bags and corners it has not visited yet.",
        zh: "喜欢探索新东西、纸箱、袋子和还没去过的角落。" },
        b: { th: "ชอบตามดูว่าคุณทำอะไร ความอยากรู้คือวิธีบอกรักของน้อง", en: "Likes to watch what you are doing; curiosity is how it says I love you.",
          zh: "喜欢跟着看你在做什么，好奇心就是它表达爱的方式。" } },
      cuddly: { l: { th: "ชอบการกอด การลูบ และเสียงเรียกชื่อเบา ๆ", en: "Likes cuddles, strokes and its name said softly.", zh: "喜欢拥抱、抚摸，还有轻轻叫它的名字。" },
        b: { th: "ติดเจ้าของมาก ชอบนอนใกล้ ๆ และขอความสนใจแบบน่ารัก", en: "Very attached: likes sleeping nearby and asks for attention in the sweetest ways.",
          zh: "非常黏主人，喜欢睡在附近，用最可爱的方式讨关注。" } },
    },

    /* look-alikes from the beliefs (first match wins). Sources and the excluded items: docs/PET-READING-RESEARCH.md §2, §3, §5 */
    /* a headline type per coat for the share card (generated text, same hard limits as the reading) */
    headline: {
      black: { th: "ผู้พิทักษ์ผู้สุขุม", en: "The Calm Guardian", zh: "沉稳的守护者" },
      white: { th: "ผู้สง่างามประจำบ้าน", en: "The Graceful One", zh: "优雅的小贵族" },
      grey: { th: "นักคิดใจเย็น", en: "The Gentle Thinker", zh: "温和的思考家" },
      orange: { th: "ดวงอาทิตย์ประจำบ้าน", en: "The Little Sunshine", zh: "家里的小太阳" },
      brown: { th: "เพื่อนซี้ผู้ซื่อตรง", en: "The Loyal Buddy", zh: "忠实的好伙伴" },
      cream: { th: "หัวใจอ่อนโยน", en: "The Soft Heart", zh: "温柔的小心肝" },
      tabby: { th: "นักผจญภัยตัวจิ๋ว", en: "The Little Adventurer", zh: "小小探险家" },
      tricolour: { th: "ศิลปินอารมณ์ดี", en: "The Colourful Spirit", zh: "多彩的小精灵" },
      bicolour: { th: "ผู้รักความสมดุล", en: "The Balanced Soul", zh: "平衡大师" },
      tortie: { th: "ตัวจริงเสียงจริง", en: "The Free Thinker", zh: "有主见的小家伙" },
      merle: { th: "อัจฉริยะลายหินอ่อน", en: "The Marbled Genius", zh: "大理石纹小天才" },
      fawn: { th: "เจ้าตัวอบอุ่น", en: "The Warm Companion", zh: "温暖的陪伴者" },
    },

    folk: [
      { sp: "cat", coat: "black", mark: "whitechest", th: "ตามความเชื่อในตำราแมวไทย ลักษณะดำมีสร้อยคอขาวคล้าย \"นิลจักร\" ถือเป็นแมวมงคล ว่ากันว่าเสริมความสง่างามและความมั่งคั่งในบ้าน",
        en:
          "In the Thai cat treatise, a black coat with a white collar resembles \"Ninlajak\", an auspicious kind said to bring grace and prosperity to the home.",
        zh: "按泰国猫经的说法，黑身白领像吉祥猫\"尼拉扎\"（Ninlajak），据说能为家里带来优雅与富足。" },
      { sp: "cat", coat: "black", mark: "whitepaws", th: "ตามความเชื่อในตำราแมวไทย ลักษณะดำเท้าขาวทั้งสี่คล้าย \"จตุบท\" ถือเป็นแมวมงคล ว่ากันว่าเป็นคุณกับผู้เลี้ยง",
        en:
          "In the Thai cat treatise, a black cat with four white paws resembles \"Jatubot\", an auspicious kind said to bring good things to its keeper.",
        zh: "按泰国猫经的说法，黑身四白爪像吉祥猫\"扎图博\"（Jatubot），据说对主人有益。" },
      { sp: "cat", coat: "black", th: "ตามความเชื่อในตำราแมวไทย ลักษณะดำปลอดคล้าย \"โกญจา\" ถือเป็นแมวมงคลที่ควรเลี้ยงดูไว้ให้ดี ว่ากันว่าเสริมเกียรติและโชคลาภ",
        en:
          "In the Thai cat treatise, an all-black coat resembles \"Konja\", an auspicious kind worth cherishing, said to bring honour and good fortune.",
        zh: "按泰国猫经的说法，全身乌黑像吉祥猫\"贡嘉\"（Konja），值得珍惜，据说能带来荣誉与好运。" },
      { sp: "cat", coat: "brown", th: "ตามความเชื่อในตำราแมวไทย ขนสีทองแดงคล้าย \"ศุภลักษณ์\" ถือเป็นแมวมงคล ว่ากันว่าช่วยให้เรื่องต่าง ๆ ราบรื่นและคลี่คลายไปในทางดี",
        en:
          "In the Thai cat treatise, a copper coat resembles \"Suphalak\", an auspicious kind said to help things run smoothly and turn out well.",
        zh: "按泰国猫经的说法，铜色的毛像吉祥猫\"素帕拉\"（Suphalak），据说能让事情顺顺利利、越来越好。" },
      { sp: "cat", coat: "cream", th: "ตามความเชื่อในตำราแมวไทย ขนครีมกับแต้มสีเข้มคล้าย \"วิเชียรมาศ\" ถือเป็นแมวมงคล ว่ากันว่าเสริมโชคลาภ",
        en:
          "In the Thai cat treatise, a cream coat with dark points resembles \"Wichien Maat\", an auspicious kind said to bring good fortune.",
        zh: "按泰国猫经的说法，奶油色加深色重点像吉祥猫\"维谦玛\"（Wichien Maat），据说能带来好运。" },
      { sp: "cat", mark: "facemask", th: "ตามความเชื่อในตำราแมวไทย แต้มสีเข้มที่หน้า หู และหางคล้าย \"วิเชียรมาศ\" ถือเป็นแมวมงคล ว่ากันว่าเสริมโชคลาภ",
        en:
          "In the Thai cat treatise, dark points on the face, ears and tail resemble \"Wichien Maat\", an auspicious kind said to bring good fortune.",
        zh: "按泰国猫经的说法，脸、耳、尾的深色重点像吉祥猫\"维谦玛\"，据说能带来好运。" },
      { sp: "cat", coat: "grey", th: "ตามความเชื่อไทย ขนสีเทาเงินคล้าย \"สีสวาด\" (แมวโคราช) ถือเป็นแมวนำโชค และนิยมมอบเป็นคู่เพื่ออวยพรให้ชีวิตคู่มีสุข",
        en:
          "In Thai belief, a silver-grey coat resembles the \"Si Sawat\" (Korat) cat, a bringer of luck traditionally given in pairs to bless a happy home.",
        zh: "按泰国的说法，银灰色的毛像\"斯萨瓦\"（呵叻猫），被视为带来好运的猫，常成对赠送，祝福家庭美满。" },
      { sp: "cat", coat: "white", th: "ตามความเชื่อไทย แมวขาวปลอดคล้าย \"ขาวมณี\" ถือเป็นแมวมงคล ว่ากันว่าเสริมโชคและทรัพย์",
        en: "In Thai belief, a pure white cat resembles \"Khao Manee\", an auspicious kind said to bring luck and wealth.",
          zh: "按泰国的说法，纯白的猫像\"考玛尼\"（Khao Manee），据说能带来好运与财富。" },
      { sp: "cat", mark: "spots", th: "ตามความเชื่อในตำราแมวไทย ตัวมีแต้มจุดคล้าย \"เก้าแต้ม\" ถือเป็นแมวมงคล ว่ากันว่าเสริมการค้าขาย",
        en: "In the Thai cat treatise, a spotted coat resembles \"Kao Taem\", an auspicious kind said to favour trade.",
          zh: "按泰国猫经的说法，带斑点的毛像吉祥猫\"九点\"（Kao Taem），据说有利生意。" },
      { sp: "cat", coat: "bicolour", th: "ตามความเชื่อในตำราแมวไทย ขนดำแซมขาวคล้าย \"แซมเศวต\" ถือเป็นแมวมงคล ว่ากันว่าซื่อสัตย์และรู้คุณ",
        en:
          "In the Thai cat treatise, a dark coat mixed with white resembles \"Saem Sawet\", an auspicious kind said to be loyal and grateful.",
        zh: "按泰国猫经的说法，黑白相间像吉祥猫\"三萨维\"（Saem Sawet），据说忠诚又懂得感恩。" },
      { sp: "dog", coat: "white", mark: "spots", th: "ตามความเชื่อในตำราพรหมชาติ หมาตัวขาว เท้าทั้งสี่ด่างดำ ว่ากันว่าเลี้ยงแล้วมีเงินทองมาก",
        en: "In the Thai Phrommachat almanac, a white dog with black-spotted feet is said to bring plenty of money to the home.",
          zh: "按泰国《梵天历书》的说法，白身、四只脚带黑斑的狗，据说养了家里财源充足。" },
      { sp: "dog", mark: "whitetail", th: "ตามความเชื่อในตำราพรหมชาติ หมาปลายหางขาว (หางดอก) ถือเป็นลักษณะที่เลี้ยงไว้แล้วดี",
        en: "In the Thai Phrommachat almanac, a white tail tip (a \"flower tail\") is a sign of a dog that is good to keep.", zh: "按泰国《梵天历书》的说法，白尾尖（\"花尾\"）的狗被认为养了会好。" },
      { sp: "dog", coat: "orange", mark: "whitepaws", th: "ตามความเชื่อในตำราพรหมชาติ หมาขนเหลืองเท้าขาวทั้งสี่ ว่ากันว่าเลี้ยงแล้วร่ำรวย",
        en: "In the Thai Phrommachat almanac, a golden dog with four white feet is said to bring riches.", zh: "按泰国《梵天历书》的说法，黄毛四白脚的狗，据说能带来富足。" },
      { sp: "dog", coat: "bicolour", th: "ตามความเชื่อในตำราพรหมชาติ หมาขนขาวปนสีน้ำตาลแดง ถือเป็นผู้พิทักษ์ที่คอยดูแลบ้าน",
        en: "In the Thai Phrommachat almanac, a dog of mixed white and red-brown is seen as a guardian of the home.", zh: "按泰国《梵天历书》的说法，白色夹红棕色的狗被视为守护家园的伙伴。" },
      { sp: "dog", coat: "tricolour", th: "ตามความเชื่อในตำราพรหมชาติ หมาขนขาวปนสีน้ำตาลแดง ถือเป็นผู้พิทักษ์ที่คอยดูแลบ้าน",
        en: "In the Thai Phrommachat almanac, a dog of mixed white and red-brown is seen as a guardian of the home.", zh: "按泰国《梵天历书》的说法，白色夹红棕色的狗被视为守护家园的伙伴。" },
      { sp: "dog", th: "ตามความเชื่อจีน หมาเป็นสัญลักษณ์ของความซื่อสัตย์ และมีคำอวยพรว่า \"หมามา รวยมา\"",
        en: "In Chinese belief the dog stands for loyalty, and a common blessing says \"when a dog arrives, prosperity follows\" (gou lai fu).", zh: "按中国民间说法，狗象征忠诚，俗话说\"狗来富\"。" },
      { sp: "cat", th: "ตามความเชื่อไทย แมวที่เข้ามาอยู่ในบ้านถือเป็นเพื่อนนำโชค ตำราแมวไทยยกย่องแมวหลายลักษณะว่าเป็นมงคล",
        en: "In Thai belief a cat who comes to live with you is a lucky companion; the Thai cat treatise praises many kinds of cats as auspicious.",
          zh: "按泰国的说法，来到家里的猫是带来好运的伙伴，泰国猫经把许多种猫都视为吉祥。" },
    ],

    overview: {
      th: "{n} เป็น{sp}ที่มีเสน่ห์เฉพาะตัว {lead}",
      en: "{N} is a {sp} with a charm all of its own. {lead}",
      zh: "{n}是一只很有个人魅力的{sp}。{lead}",
    },
    titles: {
      th: { overview: "ภาพรวม", personality: "นิสัยใจคอ", likes: "สิ่งที่น้องชอบ", bond: "ความผูกพันกับเจ้าของ", lucky: "สีมงคลและวันดีของน้อง", compat: "เจ้าของกับน้องเข้ากันอย่างไร" },
      en: { overview: "Overview", personality: "Personality", likes: "What it likes", bond: "How it bonds with you", lucky: "Lucky colour and day", compat: "You and your pet" },
      zh: { overview: "总览", personality: "性格", likes: "它喜欢什么", bond: "与主人的感情", lucky: "幸运色与好日子", compat: "你和它合不合拍" },
    },
    planets: {
      th: ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์", "วันพุธกลางคืน"],
      en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Wednesday evening"],
      zh: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期三晚上"],
    },
    // colour of each planet (as in horoscope-kb.js and lensiq-luckycolor.js): Sun red, Moon yellow/cream, Mars pink, Mercury green,
    // Jupiter orange, Venus light blue, Saturn purple, Rahu grey
    colours: {
      th: ["สีแดง", "สีเหลืองนวล", "สีชมพู", "สีเขียว", "สีส้ม", "สีฟ้า", "สีม่วง", "สีเทา"],
      en: ["red", "soft yellow", "pink", "green", "orange", "light blue", "purple", "grey"],
      zh: ["红色", "淡黄色", "粉色", "绿色", "橙色", "浅蓝色", "紫色", "灰色"],
    },
    lucky: {
      born: {
        th: "{n} เกิด{born} ตามหลักทักษา ภูมิศรี (สิริมงคล) ของคนเกิดวันนี้ตกที่ดาวของ{day} สีมงคลของน้องจึงเป็น{colour} และวันดีของน้องคือ{day}",
        en: "{N} was born on a {born}. In the Taksa tradition the Sri (blessing) house of that day falls on the planet of {day}, so the lucky colour is {colour} and the good day is {day}.",
        zh: "{n}出生在{born}。按泰国 Taksa 传统，这一天的\"吉祥宫\"（Sri）落在{day}的星曜上，所以幸运色是{colour}，好日子是{day}。",
      },
      coat: {
        th: "ยังไม่ได้ใส่วันเกิดของน้อง จึงอ่านจากสีขน สีที่ช่วยเสริมคือ{colour} และวันดีของน้องคือ{day}",
        en: "No birth date yet, so this comes from the coat: the colour that lifts it is {colour} and the good day is {day}.",
        zh: "还没有填写出生日期，所以从毛色来看：能衬托它的颜色是{colour}，好日子是{day}。",
      },
      use: {
        th: "ลองใช้{colour}กับปลอกคอ ผ้าพันคอ ของเล่น หรือมุมนอนของน้อง และใช้{day}เป็นวันถ่ายรูปหรือวันเล่นพิเศษด้วยกัน",
        en: "Try {colour} for a collar, bandana, toy or bed corner, and keep {day} for a photo day or a special play day together.",
        zh: "可以把{colour}用在项圈、小围巾、玩具或小窝上，把{day}当作一起拍照或特别玩耍的日子。",
      },
    },
    compatNone: {
      th: "ใส่วันเกิดของคุณ (ไม่บังคับ) เพื่อดูว่าคุณกับ{n}เข้ากันอย่างไร อ่านจากวันเกิดของคุณเท่านั้น ไม่ใช่จากรูป",
      en: "Add your birth date (optional) to see how you and {n} match. It uses only your birth date, never the photo.",
      zh: "填写你的出生日期（可选），看看你和{n}合不合拍。只用你的出生日期，不用照片。",
    },
    compatFoot: {
      th: "ส่วนนี้อ่านจากวันเกิดของคุณกับของน้องเท่านั้น ไม่ได้อ่านจากใบหน้าหรือรูปของใคร",
      en: "This part uses only your birth date and your pet's; it never reads anyone's face or photo.",
      zh: "这部分只看你和它的出生日期，不解读任何人的脸或照片。",
    },
    human: {
      th: "พบคนในรูปด้วย ระบบไม่ได้อ่านลักษณะของคน คำอ่านนี้ดูเฉพาะน้องเท่านั้น",
      en: "A person is also in the photo. The person is not read: this reading is about the pet only.",
      zh: "照片里还有人。我们不会解读人的特征，这次解读只看宠物。",
    },
    reminder: {
      th: "คำอ่านนี้ทำขึ้นเพื่อความผูกพันระหว่างคุณกับน้อง ทุกสี ทุกลาย ทุกขนาดน่ารักในแบบของตัวเอง",
      en: "This reading is about the bond between you and your pet. Every colour, pattern and size is lovely in its own way.",
      zh: "这次解读是为了你和它之间的感情。每一种毛色、花纹和体型都有自己的可爱。",
    },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = KB; else root.LQPetKB = KB;
})(typeof window !== "undefined" ? window : globalThis);
