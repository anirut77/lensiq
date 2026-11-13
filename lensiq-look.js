/* lensiq-look.js — "แนะนำการแต่งลุค / Look suggestions / 造型建议" under a face reading (faceread.html).
 * docs/BEAUTY-IMAGE-DESIGN.md §1 + §3 (owner decision 2026-11-13, MVP option ก) and the CLAUDE.md "Look suggestions" rule:
 *   - reversible styling only: brows (shape, thickness, arch), hairstyle, hair colour, facial hair, make-up (lip colour, eye
 *     make-up, eyeliner, emphasis with make-up) and accessories (earrings, glasses, necklaces)
 *   - each item names the reading it relates to and carries the fixed label "according to belief, please use your own
 *     judgement"; the wording passes lensiq-look-lint.js (no procedure, whitening, "feature is bad / must be fixed", beauty
 *     score or "luck suffers otherwise" wording, and every Merit lint code: no purchase, price or link)
 *   - adults only: the same 18+ confirmation as straight mode (localStorage "lq-fortune-straight".adult, fortune-straight.js);
 *     confirming here does not switch straight mode on
 *   - hidden when the crisis net triggers or the tab is calm: canShow() asks LQFortuneCrisis.calmOn() / distress() at render
 *     time, the block carries its OWN attribute data-lq-look (not data-lq-remedy) and the CSS below hides it under
 *     html[data-lq-calm] / html[data-lq-crisis]; a change of either attribute or the "lq-crisis" event re-renders it
 *   - no photos stored or sent; never tied to a purchase; the user can hide the section on this device ("lq-look-off")
 * The rule table is fixed text (no AI). Tests: tests/unit/look-suggest.test.js, tests/e2e/look.e2e.mjs (locked first).
 *
 *   LQLook.RULES · LABEL · CSS
 *   suggest(cls, {el, lang}) -> [{id, cat, slot, reading, text, label, card, preview, look}]  (pure; cls = faceread classify())
 *   canShow(doc) -> {ok, why: "" | "calm" | "adult" | "off"}  ·  confirmAdult()  ·  html(items, lang)  ·  render(container, R)
 */
(function (root) {
  "use strict";
  var NODE = typeof module !== "undefined" && module.exports && typeof require === "function";
  /** @type {any} */ var LINT = NODE ? require("./lensiq-look-lint.js") : null;
  /** @type {any} */ var ART = NODE ? require("./lensiq-look-art.js") : null;
  /** @type {any} */ var FS = NODE ? require("./fortune-straight.js") : null;
  /** @type {any} */ var CRM = NODE ? require("./fortune-crisis.js") : null;
  /** @type {any} */ var LINT_OVR; // test seam (__setLintForTest): null = lint missing; undefined = normal
  var lint = function () { if (LINT_OVR !== undefined) return LINT_OVR; return LINT || /** @type {any} */ (root).LQLookLint || null; };
  var art = function () { return ART || /** @type {any} */ (root).LQLookArt || null; };
  var straight = function () { return FS || /** @type {any} */ (root).LQFortuneStraight || null; };
  var crisis = function () { return CRM || /** @type {any} */ (root).LQFortuneCrisis || null; };

  var LABEL = { th: "ตามความเชื่อ โปรดใช้วิจารณญาณ", en: "According to belief, please use your own judgement", zh: "依据传统信仰，请自行判断" };
  var OFF_KEY = "lq-look-off";
  var SLOTS = ["brows", "liner", "lip", "hair", "facial_hair", "accessories"];

  /* ---------------- the rule table: reading -> suggestion ----------------
     when(c, el): c = faceread classify() result, el = the face-shape element id. Higher prio wins within a slot (one item per
     slot, at most 6). Each slot has a rule that always matches, so every reading gets suggestions. look = live-preview
     parameters (brow style, liner style, lip colours); preview only for brow / lip / liner (MVP option ก). */
  /** @type {any[]} */
  var RULES = [
    // ---------------- brows ----------------
    { id: "brow-straight-arch", cat: "brows", slot: "brows", prio: 30, when: function (c) { return c.brow.cat === "straight"; },
      card: "brow-arch", preview: "brow", look: { brow: "arch" },
      reading: { th: "คิ้วตรง — ตามตำรา: ตรงไปตรงมา จริงใจ มั่นคง", en: "Straight brows — by tradition: direct, sincere and steady", zh: "一字眉——按传统：直率、真诚、稳重" },
      text: { th: "ถ้าอยากเพิ่มความนุ่มนวลในการพูดคุยตามตำรา ลองใช้ดินสอเขียนคิ้วสีใกล้สีผม เติมกลางคิ้วให้โค้งขึ้นเล็กน้อย (ในตำรา คิ้วโค้งสื่อถึงความอ่อนโยน)",
        en: "For a softer touch in conversation, as the tradition puts it, try pencilling a slight curve into the middle of the brow " +
          "in a shade close to your hair colour (a curved brow stands for gentleness)",
        zh: "如果想在交谈中多一分柔和，可以用接近发色的眉笔把眉毛中段画得稍微弯一点（面相中弯眉象征温柔）" } },
    { id: "brow-short-extend", cat: "brows", slot: "brows", prio: 30, when: function (c) { return c.brow.cat === "short"; },
      card: "brow-extend", preview: "brow", look: { brow: "extend" },
      reading: { th: "คิ้วกระชับ — ตามตำรา: ตัดสินใจไว พึ่งความสามารถของตัวเองได้ดี", en: "Compact brows — by tradition: quick decisions and self-reliance", zh: "短眉——按传统：决断快、靠自己的能力" },
      text: { th: "ในตำรา คิ้วที่ยาวถึงหางตาสื่อถึงเพื่อนและพี่น้องที่เกื้อหนุนกัน ลองใช้ดินสอเขียนคิ้วเส้นบางต่อหางคิ้วให้ยาวถึงแนวหางตา",
        en: "In face reading, a brow that reaches the outer corner of the eye stands for supportive friends and siblings; try extending the tail to that line with a fine brow pencil",
        zh: "面相中眉长过眼象征朋友和兄弟姐妹相互扶持，可以用细眉笔把眉尾延长到眼尾的位置" } },
    { id: "brow-gentle-lift", cat: "brows", slot: "brows", prio: 30, when: function (c) { return c.brow.cat === "gentle"; },
      card: "brow-lift", preview: "brow", look: { brow: "lift" },
      reading: { th: "คิ้วเมตตา (หางคิ้วลาดนุ่ม) — ตามตำรา: ใจดี เข้าถึงง่าย", en: "Kind brows (softly sloping tails) — by tradition: warm and approachable", zh: "慈眉（眉尾柔和下垂）——按传统：亲切、平易近人" },
      text: { th: "สำหรับวันประชุมหรือนำเสนองาน ลองเติมหางคิ้วให้ยกขึ้นเล็กน้อย ในตำรา หางคิ้วที่ยกขึ้นสื่อถึงความมุ่งมั่น",
        en: "For a meeting or a presentation day, try pencilling the brow tail slightly upward; in face reading a lifted tail stands for determination",
        zh: "开会或做报告的日子，可以把眉尾画得稍微上扬，面相中眉尾上扬象征有决心" } },
    { id: "brow-sword-define", cat: "brows", slot: "brows", prio: 20, when: function (c) { return c.brow.cat === "sword" || c.brow.cat === "long"; },
      card: "brow-define", preview: "brow", look: { brow: "define" },
      reading: { th: "คิ้วดาบหรือคิ้วยาว — ตามตำรา: กล้าตัดสินใจ มีเพื่อนพี่น้องเกื้อหนุน", en: "Sword or long brows — by tradition: decisive, with supportive friends", zh: "剑眉或长眉——按传统：果断，有朋友相助" },
      text: { th: "รูปคิ้วเดิมตรงกับลักษณะเด่นในตำราอยู่แล้ว ลองแค่ปัดขนคิ้วให้เรียงตัวด้วยเจลใสหรือมาสคาร่าคิ้ว ให้เส้นคิ้วเดิมชัดขึ้น",
        en: "Your brow shape already matches what the tradition values; simply brush the hairs into place with a clear or tinted brow gel so the natural line stands out",
        zh: "眉形本来就符合传统看重的特点，只需用透明或有色眉胶把眉毛梳顺，让原本的眉线更清晰" } },
    { id: "brow-fill", cat: "brows", slot: "brows", prio: 10, when: function () { return true; },
      card: "brow-fill", preview: "brow", look: { brow: "fill" },
      reading: { th: "คิ้วโก่ง คิ้วใบหลิว หรือคิ้วสมส่วน — ตามตำรา: อ่อนโยน มีเสน่ห์ด้านมิตรภาพ",
        en: "Arched, willow-leaf or balanced brows — by tradition: gentle and good with friends", zh: "新月眉、柳叶眉或匀称的眉——按传统：温和，人缘好" },
      text: { th: "ลองเติมช่องว่างในคิ้วด้วยฝุ่นหรือดินสอเขียนคิ้วสีใกล้สีผม ให้เส้นคิ้วต่อเนื่อง ในตำรา คิ้วที่เส้นต่อเนื่องสื่อถึงมิตรภาพที่ราบรื่น",
        en: "Try filling any sparse spots with brow powder or pencil close to your hair colour so the line runs evenly; in face reading an even brow line stands for smooth friendships",
        zh: "可以用接近发色的眉粉或眉笔把稀疏处补满，让眉线连贯，面相中连贯的眉线象征人际关系顺畅" } },
    { id: "brow-open-gap", cat: "brows", slot: "brows", prio: 25, when: function (c) { return c.yintang.cat === "narrow"; },
      card: "brow-open", preview: null, look: null,
      reading: { th: "หว่างคิ้วแคบ — ตามตำรา: มุ่งมั่น ตั้งใจสูง", en: "Close-set brows — by tradition: focused and determined", zh: "印堂较窄——按传统：专注、意志坚定" },
      text: { th: "ในตำรา หว่างคิ้วที่โปร่งสื่อถึงใจที่ผ่อนคลาย ลองเริ่มเติมคิ้วห่างจากหัวคิ้วเดิมเล็กน้อย หรือกันขนอ่อนตรงหว่างคิ้วออกบางส่วน",
        en: "In face reading an open space between the brows stands for a relaxed mind; try starting your brow pencil a little further out, or tidy the fine hairs between the brows",
        zh: "面相中印堂开阔象征心情舒展，可以从眉头稍外侧开始画眉，或修掉眉间的细小杂毛" } },
    // ---------------- eyeliner ----------------
    { id: "liner-lift", cat: "makeup", slot: "liner", prio: 30, when: function (c) { return c.eye.cat === "soft" || c.eye.cat === "elephant"; },
      card: "liner-wing-short", preview: "liner", look: { liner: "wing-short" },
      reading: { th: "หางตาลาด (ตาอ่อนโยนหรือตาช้าง) — ตามตำรา: ใจดี เป็นผู้ฟังที่ดี",
        en: "Softly sloping eyes (kind or elephant eyes) — by tradition: warm and a good listener", zh: "眼尾下垂（慈眼或象眼）——按传统：温和、善于倾听" },
      text: { th: "ลองอายไลเนอร์เส้นบางตามแนวขนตาบน แล้วตวัดปลายขึ้นสั้น ๆ ที่หางตา ในตำรา หางตาที่ยกขึ้นสื่อถึงความกระตือรือร้น",
        en: "Try a thin eyeliner along the upper lash line with a short upward flick at the outer corner; in face reading a lifted eye tail stands for enthusiasm",
        zh: "沿上睫毛根画一条细眼线，在眼尾轻轻上挑一小段，面相中眼尾上扬象征积极热情" } },
    { id: "liner-thin", cat: "makeup", slot: "liner", prio: 30, when: function (c) { return c.eye.cat === "phoenix" || c.eye.cat === "deer"; },
      card: "liner-thin", preview: "liner", look: { liner: "thin" },
      reading: { th: "หางตาชี้ขึ้น (ตาหงส์หรือตากวาง) — ตามตำรา: เรียนรู้ไว มีชีวิตชีวา",
        en: "Upturned eyes (phoenix or deer eyes) — by tradition: quick to learn and lively", zh: "眼尾上扬（丹凤眼或鹿眼）——按传统：学得快、有活力" },
      text: { th: "แนวหางตาเดิมยกอยู่แล้วตามตำรา ลองอายไลเนอร์เส้นบางชิดโคนขนตา ลากตามแนวตาเดิมโดยไม่ต้องตวัด",
        en: "Your eye line already lifts the way the tradition values; a thin liner close to the lashes that simply follows your natural line is enough",
        zh: "眼尾本来就上扬，只需贴着睫毛根画一条细眼线，顺着原本的眼形画，不必上挑" } },
    { id: "liner-long", cat: "makeup", slot: "liner", prio: 30, when: function (c) { return c.eye.cat === "tiger"; },
      card: "liner-wing-long", preview: "liner", look: { liner: "wing-long" },
      reading: { th: "ตาเสือ (ตากลมโต) — ตามตำรา: กล้าหาญ มีพลังขับเคลื่อน", en: "Tiger eyes (large and round) — by tradition: brave and driven", zh: "虎眼（圆而大）——按传统：勇敢、有冲劲" },
      text: { th: "ลองลากอายไลเนอร์เลยหางตาออกไปเล็กน้อยแบบปีกยาว ในตำรา ตาที่เรียวยาวสื่อถึงความสุขุม",
        en: "Try extending the liner a little past the outer corner in a long wing; in face reading a long eye line stands for composure",
        zh: "可以把眼线稍微拉出眼尾，画成长眼尾，面相中细长的眼形象征沉稳" } },
    { id: "liner-tight", cat: "makeup", slot: "liner", prio: 10, when: function () { return true; },
      card: "liner-tight", preview: "liner", look: { liner: "tight" },
      reading: { th: "ตามังกรหรือตาสมส่วน — ตามตำรา: สุขุม รอบคอบ", en: "Dragon or balanced eyes — by tradition: calm and careful", zh: "龙眼或匀称的眼——按传统：沉稳、细心" },
      text: { th: "ลองอายไลเนอร์สีน้ำตาลเข้มเส้นบางชิดโคนขนตา ให้แนวตาเดิมคมชัดขึ้น",
        en: "Try a fine dark-brown liner tight against the lashes so your natural eye line reads more clearly",
        zh: "用深棕色细眼线贴着睫毛根画，让原本的眼形更清晰" } },
    // ---------------- lip colour ----------------
    { id: "lip-moon-gloss", cat: "makeup", slot: "lip", prio: 30, when: function (c) { return c.mouth.cat === "moon"; },
      card: "lip-gloss", preview: "lip", look: { lip: ["#d9707e", "#e58f86", "#c9677a"], finish: "gloss" },
      reading: { th: "ปากจันทร์หงาย (มุมปากยก) — ตามตำรา: มองโลกแง่ดี พูดแล้วคนฟังสบายใจ",
        en: "Upturned 'moon' mouth — by tradition: optimistic and pleasant to listen to", zh: "仰月口（嘴角上扬）——按传统：乐观，说话让人舒服" },
      text: { th: "มุมปากยกอยู่แล้วตามตำรา ลองลิปกลอสหรือลิปทินต์สีใส ๆ ให้แนวปากเดิมเด่น",
        en: "Your mouth corners already lift the way the tradition values; a sheer gloss or tint lets that natural line show",
        zh: "嘴角本来就上扬，用透明感的唇彩或染唇液，让原本的唇形更显眼" } },
    { id: "lip-center", cat: "makeup", slot: "lip", prio: 30, when: function (c) { return c.mouth.cat === "small" || c.mouth.cat === "cherry"; },
      card: "lip-center", preview: "lip", look: { lip: ["#c2455a", "#b23a48", "#d0626b"], finish: "satin" },
      reading: { th: "ปากกะทัดรัดหรือปากเชอร์รี่ — ตามตำรา: คิดก่อนพูด มีเสน่ห์ในการพูด",
        en: "Compact or cherry mouth — by tradition: thinks before speaking, charming in conversation", zh: "小巧的嘴或樱桃口——按传统：说话前先思考，言谈有魅力" },
      text: { th: "ลองลิปสีชัดแตะกลางริมฝีปากแล้วเกลี่ยออกด้านข้าง ในตำรา ริมฝีปากอิ่มสื่อถึงความโอบอ้อมอารี",
        en: "Try a clear lip colour dabbed in the centre of the lips and blended outward; in face reading full lips stand for generosity",
        zh: "把颜色明显的口红点在唇中央再向两侧晕开，面相中丰润的嘴唇象征待人宽厚" } },
    { id: "lip-matte", cat: "makeup", slot: "lip", prio: 30, when: function (c) { return c.mouth.cat === "wide" || c.mouth.cat === "square" || c.mouth.cat === "full"; },
      card: "lip-matte", preview: "lip", look: { lip: ["#b5646a", "#a6575f", "#c07a73"], finish: "matte" },
      reading: { th: "ปากกว้าง ปากสี่เหลี่ยม หรือริมฝีปากอิ่ม — ตามตำรา: สื่อสารเก่ง ใจกว้าง",
        en: "Wide, square or full mouth — by tradition: a good communicator, generous", zh: "大嘴、四字口或丰唇——按传统：善于沟通、心胸开阔" },
      text: { th: "ลองลิปเนื้อแมตต์หรือซาตินสีกลาง ๆ เช่น กุหลาบหม่นหรือน้ำตาลอมชมพู ทาเต็มริมฝีปาก ให้ลักษณะเด่นตามตำราได้แสดงออก",
        en: "Try a matte or satin lip in a mid shade such as dusty rose or pinkish brown across the full lip, so the feature the tradition values shows",
        zh: "可以选哑光或缎光质地的中间色，比如豆沙玫瑰或粉棕色，涂满整个唇部，让传统看重的特点展现出来" } },
    { id: "lip-warm", cat: "makeup", slot: "lip", prio: 10, when: function () { return true; },
      card: "lip-warm", preview: "lip", look: { lip: ["#e0735f", "#c8584a", "#e48a7a"], finish: "satin" },
      reading: { th: "มุมปากเรียบหรือปากสมส่วน — ตามตำรา: พูดจาหนักแน่น น่าไว้วางใจ",
        en: "Level mouth corners or a balanced mouth — by tradition: steady and trustworthy in speech", zh: "嘴角平或嘴形匀称——按传统：说话稳重、值得信赖" },
      text: { th: "ในตำรา มุมปากที่ยกขึ้นสื่อถึงความเป็นมิตร ลองลิปสีโทนอุ่น เช่น คอรัล อิฐ หรือพีช ทาให้ชัดถึงมุมปาก",
        en: "In face reading, lifted mouth corners stand for friendliness; try a warm lip colour such as coral, brick or peach, defined right to the corners",
        zh: "面相中嘴角上扬象征友善，可以用珊瑚色、砖红色或蜜桃色等暖色调口红，把嘴角也涂清楚" } },
    // ---------------- hairstyle and hair colour (illustration cards) ----------------
    { id: "hair-open-forehead", cat: "hair", slot: "hair", prio: 30, when: function (c) { return c.zones.dominant === "upper"; },
      card: "hair-open", preview: null, look: null,
      reading: { th: "ส่วนบนเด่น (หน้าผาก) — ตามตำรา: สติปัญญา การเรียนรู้", en: "Upper zone prominent (forehead) — by tradition: intellect and learning", zh: "上停突出（额头）——按传统：智慧、学习" },
      text: { th: "ในตำรา หน้าผากคือวังการงาน ลองทรงผมเปิดหน้าผาก เช่น เสยผม แสกข้าง หรือรวบผมขึ้นในวันที่ต้องพบผู้ใหญ่",
        en: "In face reading the forehead is the palace of career; try a hairstyle that keeps the forehead open, such as swept back, a side part or tied up on days you meet seniors",
        zh: "面相中额头是官禄宫，可以选露出额头的发型，比如往后梳、侧分，或在见长辈的日子把头发扎起来" } },
    { id: "hair-cheek-frame", cat: "hair", slot: "hair", prio: 30, when: function (c) { return c.zones.dominant === "middle"; },
      card: "hair-cheek", preview: null, look: null,
      reading: { th: "ส่วนกลางเด่น (คิ้วถึงฐานจมูก) — ตามตำรา: ความมุ่งมั่น การสร้างฐานะ",
        en: "Middle zone prominent (brows to nose base) — by tradition: drive and building a career", zh: "中停突出（眉到鼻底）——按传统：进取心、成家立业" },
      text: { th: "ลองทรงผมซอยปลายระดับโหนกแก้ม หรือปล่อยผมด้านหน้าเล็กน้อยให้เป็นกรอบใบหน้าช่วงกลาง",
        en: "Try layers that end at cheekbone level, or a few face-framing strands at the front around the middle of the face",
        zh: "可以剪到颧骨位置的层次发型，或在前面留几缕垂在脸旁的碎发" } },
    { id: "hair-chin-volume", cat: "hair", slot: "hair", prio: 25, when: function (c) { return c.chin.cat === "pointed" || c.zones.dominant === "lower"; },
      card: "hair-chin", preview: null, look: null,
      reading: { th: "คางเรียวหรือส่วนล่างเด่น — ตามตำรา: ไหวพริบดี หรือมีความมั่นคงในวัยหลัง",
        en: "Tapered chin or prominent lower zone — by tradition: quick-witted, or steady in later life", zh: "下巴尖或下停突出——按传统：机敏，或晚年安稳" },
      text: { th: "ลองทรงผมยาวประบ่า หรือดัดลอนปลายผมช่วงคาง ในตำรา ช่วงล่างของใบหน้าที่อิ่มสื่อถึงความมั่นคงในวัยหลัง",
        en: "Try shoulder-length hair or soft waves around chin level; in face reading a full lower face stands for stability in later life",
        zh: "可以留及肩长发，或在下巴位置烫出柔和的卷度，面相中下庭丰满象征晚年安稳" } },
    { id: "hair-colour-wood", cat: "hair", slot: "hair", prio: 5, when: function (c, el) { return el === "wood"; },
      card: "hair-colour", preview: null, look: null,
      reading: { th: "ธาตุไม้ตามรูปหน้า — ตามตำรา: สีมงคล เขียว ฟ้า", en: "Wood face shape — by tradition: auspicious colours green and blue", zh: "木形脸——按传统：吉色为绿、蓝" },
      text: { th: "ถ้าอยากทำสีผม ลองน้ำตาลเข้มธรรมชาติ หรือไฮไลต์โทนหม่นอมเขียวจาง ๆ แล้วใช้กิ๊บหรือยางรัดผมสีเขียวหรือฟ้า",
        en: "If you want to colour your hair, try a natural deep brown or faint muted olive highlights, with a green or blue hair clip or tie",
        zh: "如果想染发，可以选自然深棕色，或淡淡的灰绿调挑染，再配绿色或蓝色的发夹、发圈" } },
    { id: "hair-colour-fire", cat: "hair", slot: "hair", prio: 5, when: function (c, el) { return el === "fire"; },
      card: "hair-colour", preview: null, look: null,
      reading: { th: "ธาตุไฟตามรูปหน้า — ตามตำรา: สีมงคล แดง ชมพู ส้ม", en: "Fire face shape — by tradition: auspicious colours red, pink and orange", zh: "火形脸——按传统：吉色为红、粉、橙" },
      text: { th: "ถ้าอยากทำสีผม ลองน้ำตาลอมแดงหรือน้ำตาลทองแดง แล้วใช้กิ๊บหรือยางรัดผมสีชมพูหรือส้ม",
        en: "If you want to colour your hair, try a reddish brown or copper brown, with a pink or orange hair clip or tie",
        zh: "如果想染发，可以选红棕色或铜棕色，再配粉色或橙色的发夹、发圈" } },
    { id: "hair-colour-earth", cat: "hair", slot: "hair", prio: 5, when: function (c, el) { return el === "earth"; },
      card: "hair-colour", preview: null, look: null,
      reading: { th: "ธาตุดินตามรูปหน้า — ตามตำรา: สีมงคล เหลือง น้ำตาล ครีม", en: "Earth face shape — by tradition: auspicious colours yellow, brown and cream", zh: "土形脸——按传统：吉色为黄、棕、米色" },
      text: { th: "ถ้าอยากทำสีผม ลองน้ำตาลช็อกโกแลตหรือน้ำตาลน้ำผึ้ง แล้วใช้กิ๊บหรือยางรัดผมสีครีมหรือน้ำตาล",
        en: "If you want to colour your hair, try a chocolate or honey brown, with a cream or brown hair clip or tie",
        zh: "如果想染发，可以选巧克力棕或蜂蜜棕，再配米色或棕色的发夹、发圈" } },
    { id: "hair-colour-metal", cat: "hair", slot: "hair", prio: 5, when: function (c, el) { return el === "metal"; },
      card: "hair-colour", preview: null, look: null,
      reading: { th: "ธาตุทองตามรูปหน้า — ตามตำรา: สีมงคล ขาว ทอง เงิน", en: "Metal face shape — by tradition: auspicious colours white, gold and silver", zh: "金形脸——按传统：吉色为白、金、银" },
      text: { th: "ถ้าอยากทำสีผม ลองน้ำตาลหม่นโทนเทาหรือน้ำตาลประกายทอง แล้วใช้กิ๊บโลหะสีเงินหรือทอง",
        en: "If you want to colour your hair, try an ash brown or a golden brown, with a silver or gold metal hair clip",
        zh: "如果想染发，可以选灰棕色或金棕色，再配银色或金色的金属发夹" } },
    { id: "hair-colour-water", cat: "hair", slot: "hair", prio: 5, when: function (c, el) { return el === "water" || !el; },
      card: "hair-colour", preview: null, look: null,
      reading: { th: "ธาตุน้ำตามรูปหน้า — ตามตำรา: สีมงคล น้ำเงิน กรมท่า ดำ", en: "Water face shape — by tradition: auspicious colours blue, navy and black", zh: "水形脸——按传统：吉色为蓝、藏青、黑" },
      text: { th: "ถ้าอยากทำสีผม ลองดำธรรมชาติหรือน้ำตาลเข้มเกือบดำ แล้วใช้กิ๊บหรือยางรัดผมสีกรมท่า",
        en: "If you want to colour your hair, try natural black or a near-black deep brown, with a navy hair clip or tie",
        zh: "如果想染发，可以选自然黑或接近黑色的深棕色，再配藏青色的发夹、发圈" } },
    // ---------------- facial hair (illustration cards; offered to anyone who wears it, no gender is inferred) ----------------
    { id: "beard-jaw", cat: "facial_hair", slot: "facial_hair", prio: 30, when: function (c) { return c.chin.cat === "pointed"; },
      card: "beard-jaw", preview: null, look: null,
      reading: { th: "คางเรียว — ตามตำรา: ไหวพริบดี ความคิดสร้างสรรค์", en: "Tapered chin — by tradition: quick-witted and creative", zh: "下巴尖——按传统：机敏、有创意" },
      text: { th: "สำหรับผู้ที่ไว้หนวดเครา ตามตำรา ช่วงคางที่อิ่มสื่อถึงความมั่นคง ลองเคราสั้นเรียบตามแนวคาง",
        en: "If you wear facial hair: in face reading a full chin stands for stability; try a short beard trimmed evenly along the jaw",
        zh: "如果留胡子：面相中下巴丰满象征稳定，可以沿下颌修成整齐的短胡须" } },
    { id: "beard-light", cat: "facial_hair", slot: "facial_hair", prio: 30, when: function (c) { return c.chin.cat === "broad"; },
      card: "beard-light", preview: null, look: null,
      reading: { th: "คางกว้างมน — ตามตำรา: มั่นคง มีคนรอบข้างสนับสนุน", en: "Broad rounded chin — by tradition: steady, with people around to support you", zh: "下巴宽圆——按传统：稳重，身边有人支持" },
      text: { th: "สำหรับผู้ที่ไว้หนวดเครา ลองเคราบาง ๆ แต่งขอบให้เป็นระเบียบ ให้แนวคางเดิมเด่น",
        en: "If you wear facial hair, try light stubble with neatly kept edges so your natural jaw line shows",
        zh: "如果留胡子，可以留薄薄的胡茬，把边缘修整齐，让原本的下颌线更明显" } },
    { id: "moustache-light", cat: "facial_hair", slot: "facial_hair", prio: 10, when: function () { return true; },
      card: "moustache", preview: null, look: null,
      reading: { th: "คางสมส่วน — ตามตำรา: หนักแน่นและยืดหยุ่นอย่างพอดี", en: "Balanced chin — by tradition: firm yet flexible", zh: "下巴匀称——按传统：稳重又灵活" },
      text: { th: "สำหรับผู้ที่ไว้หนวด ลองหนวดบางเหนือริมฝีปาก เล็มให้สั้นเสมอแนวปาก",
        en: "If you wear a moustache, try keeping it light and trimmed level with the lip line",
        zh: "如果留小胡子，可以留薄一些，修到与唇线齐平" } },
    // ---------------- accessories (by face-shape element; illustration cards) ----------------
    { id: "acc-necklace-lower", cat: "accessories", slot: "accessories", prio: 30, when: function (c) { return c.zones.dominant === "lower"; },
      card: "necklace-long", preview: null, look: null,
      reading: { th: "ส่วนล่างเด่น (ฐานจมูกถึงคาง) — ตามตำรา: ความมั่นคง ครอบครัว", en: "Lower zone prominent (nose base to chin) — by tradition: stability and family", zh: "下停突出（鼻底到下巴）——按传统：安稳、家庭" },
      text: { th: "ลองสร้อยเส้นยาวระดับอก กับจี้เล็กทรงกลม",
        en: "Try a long necklace at chest level with a small round pendant",
        zh: "可以戴到胸口长度的长项链，配小圆形吊坠" } },
    { id: "acc-wood", cat: "accessories", slot: "accessories", prio: 10, when: function (c, el) { return el === "wood"; },
      card: "ear-drop", preview: null, look: null,
      reading: { th: "ธาตุไม้ตามรูปหน้า — ตามตำรา: รูปทรงยาว สีเขียวและฟ้า", en: "Wood face shape — by tradition: long shapes, green and blue", zh: "木形脸——按传统：修长的形状，绿色和蓝色" },
      text: { th: "ลองต่างหูทรงหยดน้ำยาวระดับคาง และแว่นกรอบเหลี่ยมมนสีเขียวหรือฟ้า",
        en: "Try drop earrings that end around the jaw line, and softened rectangular frames in green or blue",
        zh: "可以戴长度到下颌的水滴形耳环，以及绿色或蓝色的圆角方框眼镜" } },
    { id: "acc-fire", cat: "accessories", slot: "accessories", prio: 10, when: function (c, el) { return el === "fire"; },
      card: "ear-angular", preview: null, look: null,
      reading: { th: "ธาตุไฟตามรูปหน้า — ตามตำรา: รูปทรงแหลม สีแดง ชมพู ส้ม", en: "Fire face shape — by tradition: pointed shapes, red, pink and orange", zh: "火形脸——按传统：尖形，红、粉、橙色" },
      text: { th: "ลองต่างหูทรงสามเหลี่ยมหรือรูปดาวโทนทองชมพู และแว่นทรงหางตายก (แคทอาย)",
        en: "Try triangle or star-shaped earrings in rose gold, and cat-eye frames",
        zh: "可以戴三角形或星形的玫瑰金耳环，以及猫眼形镜框" } },
    { id: "acc-earth", cat: "accessories", slot: "accessories", prio: 10, when: function (c, el) { return el === "earth"; },
      card: "glasses-rect", preview: null, look: null,
      reading: { th: "ธาตุดินตามรูปหน้า — ตามตำรา: รูปทรงเหลี่ยม สีเหลือง น้ำตาล", en: "Earth face shape — by tradition: square shapes, yellow and brown", zh: "土形脸——按传统：方形，黄色和棕色" },
      text: { th: "ลองแว่นกรอบเหลี่ยมสีน้ำตาลกระ และต่างหูแป้นทรงสี่เหลี่ยมโทนทอง",
        en: "Try rectangular tortoiseshell frames and small square stud earrings in gold tones",
        zh: "可以戴玳瑁色方框眼镜，以及金色小方形耳钉" } },
    { id: "acc-metal", cat: "accessories", slot: "accessories", prio: 10, when: function (c, el) { return el === "metal"; },
      card: "ear-hoop", preview: null, look: null,
      reading: { th: "ธาตุทองตามรูปหน้า — ตามตำรา: รูปทรงกลม สีขาว ทอง เงิน", en: "Metal face shape — by tradition: round shapes, white, gold and silver", zh: "金形脸——按传统：圆形，白、金、银色" },
      text: { th: "ลองต่างหูห่วงกลมสีเงินหรือทอง และแว่นกรอบกลมโลหะบาง",
        en: "Try round hoop earrings in silver or gold, and thin round metal frames",
        zh: "可以戴银色或金色的圆环耳环，以及细金属圆框眼镜" } },
    { id: "acc-water", cat: "accessories", slot: "accessories", prio: 10, when: function (c, el) { return el === "water" || !el; },
      card: "glasses-round", preview: null, look: null,
      reading: { th: "ธาตุน้ำตามรูปหน้า — ตามตำรา: รูปทรงโค้งมน สีน้ำเงิน กรมท่า", en: "Water face shape — by tradition: curved shapes, blue and navy", zh: "水形脸——按传统：圆润的形状，蓝色和藏青" },
      text: { th: "ลองต่างหูมุกหรือทรงคลื่น และแว่นกรอบมนสีกรมท่า",
        en: "Try pearl or wave-shaped earrings, and rounded navy frames",
        zh: "可以戴珍珠或波浪形耳环，以及藏青色圆框眼镜" } }
  ];

  var LANGS = ["th", "en", "zh"];
  var langOf = function (/** @type {any} */ l) { return LANGS.indexOf(l) >= 0 ? l : "th"; };
  /** wording check of one rule in one language (defence in depth: the unit test checks every rule) @param {any} r @param {string} l */
  /** @type {Record<string, boolean>} */ var CLEAN = {};
  function clean(r, l) {
    var L = lint();
    if (!L) return false; // fail closed: no wording check, no text (independent review S4)
    var k = r.id + "|" + l;
    if (!(k in CLEAN)) CLEAN[k] = !L.lintLook(r.reading[l]).length && !L.lintLook(r.text[l]).length;
    return CLEAN[k];
  }

  /** suggestions for one reading: one item per slot, highest priority first (ties: table order)
   *  @param {any} c faceread classify() result @param {{el?: string, lang?: string}} [o] */
  function suggest(c, o) {
    var opt = o || {}, l = langOf(opt.lang), el = opt.el || "";
    if (!c || !c.brow) return [];
    /** @type {any[]} */ var out = [];
    SLOTS.forEach(function (slot) {
      var best = null;
      for (var i = 0; i < RULES.length; i++) {
        var r = RULES[i];
        if (r.slot !== slot || !clean(r, l)) continue;
        var hit = false;
        try { hit = !!r.when(c, el); } catch (e) { hit = false; }
        if (hit && (!best || r.prio > best.prio)) best = r;
      }
      if (best) out.push({ id: best.id, cat: best.cat, slot: slot, reading: best.reading[l], text: best.text[l], label: LABEL[l],
        card: best.card || null, preview: best.preview || null, look: best.look || null });
    });
    return out.slice(0, 6);
  }

  /* ---------------- who sees it ---------------- */
  /** @param {string} k */
  function lsGet(k) { try { var ls = /** @type {any} */ (root).localStorage; return ls ? ls.getItem(k) : null; } catch (e) { return null; } }
  /** @param {string} k @param {string|null} v */
  function lsSet(k, v) { try { var ls = /** @type {any} */ (root).localStorage; if (!ls) return; if (v == null) ls.removeItem(k); else ls.setItem(k, v); } catch (e) { /* private mode */ } }
  /** calm: the crisis state, the tab's calm flag, the soft step, or crisis / distress words typed on the page @param {any} d */
  function calm(d) {
    var C = crisis();
    try {
      if (C && C.calmOn && C.calmOn(d)) return true;
      if (C && C.distress && C.distress(d)) return true;
    } catch (e) { /* fall through to the attributes */ }
    try {
      var h = d && d.documentElement;
      return !!(h && h.getAttribute && (h.getAttribute("data-lq-calm") === "1" || h.getAttribute("data-lq-crisis") === "1"));
    } catch (e) { return false; }
  }
  /** @param {any} [doc] @returns {{ok: boolean, why: string}} */
  function canShow(doc) {
    var d = doc || root.document;
    if (calm(d)) return { ok: false, why: "calm" };
    var S = straight(), adult = false;
    try { adult = !!(S && S.get().adult); } catch (e) { adult = false; }
    if (!adult) return { ok: false, why: "adult" };
    if (lsGet(OFF_KEY) === "1") return { ok: false, why: "off" };
    return { ok: true, why: "" };
  }
  /** the same 18+ confirmation as straight mode; straight mode itself is not switched on by this */
  function confirmAdult() {
    var S = straight();
    if (S) { var p = S.get(); S.set({ adult: true, straight: p.adult ? p.straight : false }); }
  }

  /* ---------------- markup ---------------- */
  /** @type {Record<string, string>} */
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  var esc = function (/** @type {any} */ s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  /** escape for element text only (never for attributes): quotes may stay as they are */
  var escText = function (/** @type {any} */ s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return ESC[c]; }); };
  var TXT = {
    th: { title: "แนะนำการแต่งลุค", intro: "ข้อแนะนำการแต่งที่ย้อนกลับได้ (คิ้ว ผม แต่งหน้า เครื่องประดับ) ตามผลอ่านด้านบน เป็นความเชื่อ ไม่ใช่ข้อเท็จจริง ไม่มีการทำหัตถการ และไม่ผูกกับสินค้าใด ๆ",
      from: "จากผลอ่าน:", adult: "ฉันอายุ 18 ปีขึ้นไป และอยากดูข้อแนะนำการแต่งลุคตามโหงวเฮ้ง", adultWhy: "ส่วนนี้สำหรับผู้ใหญ่เท่านั้น",
      hide: "ซ่อนส่วนนี้", off: "คุณซ่อนข้อแนะนำการแต่งลุคไว้ในเครื่องนี้", show: "แสดงอีกครั้ง", privacy: "ไม่เก็บภาพ ภาพไม่ออกจากเครื่อง",
      cats: { brows: "คิ้ว", makeup: "แต่งหน้า", hair: "ทรงผมและสีผม", facial_hair: "หนวดเครา", accessories: "เครื่องประดับและแว่น" } },
    en: { title: "Look suggestions",
      intro: "Reversible styling ideas (brows, hair, make-up, accessories) based on the reading above. They are belief, not fact; no procedures, and not tied to any product.",
      from: "From your reading:", adult: "I am 18 or older and would like look suggestions based on my face reading", adultWhy: "This section is for adults only",
      hide: "Hide this section", off: "You have hidden look suggestions on this device", show: "Show again", privacy: "No photos are stored; images never leave your device",
      cats: { brows: "Brows", makeup: "Make-up", hair: "Hairstyle and hair colour", facial_hair: "Facial hair", accessories: "Accessories and glasses" } },
    zh: { title: "造型建议", intro: "根据上面的面相解读给出的可随时改回的造型建议（眉毛、发型、妆容、配饰），属于传统信仰而非事实；不涉及任何医美项目，也不与任何商品挂钩。",
      from: "对应解读：", adult: "我已年满 18 岁，想看根据面相给出的造型建议", adultWhy: "本部分仅面向成年人",
      hide: "隐藏本部分", off: "你已在本设备上隐藏造型建议", show: "重新显示", privacy: "不保存照片，图像不会离开你的设备",
      cats: { brows: "眉毛", makeup: "妆容", hair: "发型与发色", facial_hair: "胡须", accessories: "配饰与眼镜" } }
  };
  /** strict (generated-wording) check of one item; tag-like characters are not a wording problem here because every field
   *  is escaped before display (the "markup" code guards text inserted as HTML) @param {any} it */
  function itemClean(it) {
    var L = lint();
    var bad = function (/** @type {any} */ t) { return L.lintLook(t).some(function (/** @type {any} */ e) { return e.code !== "markup"; }); };
    return !!L && !bad(it.reading) && !bad(it.text); // fail closed without the lint
  }
  /** the list of the tool's own suggestions (escaped). Generated items only: any item whose wording fails the strict lint is
   *  dropped, whatever it claims to be (salon text goes through salonItem() / salonHTML()) @param {any[]} items @param {string} lang */
  function html(items, lang) {
    var l = langOf(lang), t = TXT[l], A = art(), P = /** @type {any} */ (root).LQLookPreview;
    return '<ul class="lq-look-list" data-lq-look>' + (items || []).filter(itemClean).map(function (it) {
      var card = it.card && A ? A.svg(it.card) : "";
      var tryBtn = it.preview && P && P.available && P.available() ? P.buttonHTML(it, l) : "";
      return '<li class="lq-look-item" data-look-id="' + esc(it.id) + '" data-lq-look>' + (card ? '<div class="lq-look-card">' + card + "</div>" : "") +
        '<div class="lq-look-body"><span class="lq-look-cat">' + esc(t.cats[it.cat] || it.cat) + "</span>" +
        '<p class="lq-look-from"><b>' + esc(t.from) + "</b> " + esc(it.reading) + "</p>" +
        '<p class="lq-look-text">' + esc(it.text) + "</p>" +
        '<p class="lq-look-label">' + esc(it.label) + "</p>" + tryBtn + "</div></li>";
    }).join("") + "</ul>";
  }
  /* ---------------- salon catalogue text (salon mode; owner wording 2026-11-13) ----------------
     A salon's own catalogue item (entered by the salon in the back office) is a consultation aid on SHAPE. Its name may name the
     salon's method (e.g. semi-permanent brows); it is shown as the salon's text with the fixed label below, never rewritten or
     generated by us, and our own wrapper wording never names or recommends a method. */
  var SALON_LABEL = { th: "ข้อความของร้าน ไม่ใช่คำแนะนำของ LENSIQ", en: "The salon's own text, not a LENSIQ suggestion", zh: "店家自己的文字，并非 LENSIQ 的建议" };
  var SALON_TEXT = {
    th: { title: "แบบจากแคตตาล็อกของร้าน", note: "รูปทรงจากแคตตาล็อกของร้าน ใช้ประกอบการปรึกษาเรื่องรูปทรงเท่านั้น วิธีทำเป็นเรื่องที่ร้านอธิบายเอง" },
    en: { title: "From the salon's catalogue", note: "Shapes from the salon's own catalogue, as a consultation aid on shape only; the salon explains its own method" },
    zh: { title: "店家目录中的款式", note: "来自店家自己目录的形状，仅作为形状咨询参考；具体做法由店家自行说明" }
  };
  /** the salon lint (procedure code lifted). Salon text is only ever shown escaped, so tag-like characters are shown as plain
   *  text and do not block an entry (the Merit "markup" code guards text that could be inserted as HTML; this never is).
   *  @param {any} L @param {string} text */
  function salonErrors(L, text) {
    if (!L) return [{ code: "nolint", match: "" }]; // fail closed without the lint
    return L.lintLook(text, { source: "salon" }).filter(function (/** @type {any} */ e) { return e.code !== "markup"; });
  }
  /** a salon catalogue entry {id, kind, shape, name: {th, en, zh}} -> {ok, item} | {ok: false, errors}
   *  @param {any} entry @param {string} lang */
  /* decision (agent, 2026-11-13): a salon may enter a Thai name only. On an EN / ZH page it is shown as it is, marked lang="th",
     with a neutral note that it is the salon's own name in Thai; we never translate or rewrite salon text. The back office may
     later ask for EN / ZH names, but does not require them. */
  var SALON_TH_NOTE = { th: "", en: "(the salon's own name, in Thai)", zh: "（店家自己的名称，泰文）" };
  function salonItem(entry, lang) {
    var l = langOf(lang), names = (entry && entry.name) || {};
    var own = names[l] ? String(names[l]) : "", name = own || String(names.th || ""), nameLang = own ? l : "th";
    var L = lint(), errors = salonErrors(L, name);
    if (!name.trim()) errors = errors.concat([{ code: "empty", match: "" }]);
    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, item: { id: String(entry.id || ""), source: "salon", kind: entry.kind || null, card: entry.shape || null,
      preview: entry.kind === "brow" || entry.kind === "lip" || entry.kind === "liner" ? entry.kind : null, text: name, nameLang: nameLang,
      note: nameLang !== l ? SALON_TH_NOTE[l] : "", label: SALON_LABEL[l] } };
  }
  /** @param {any[]} items salon items from salonItem() @param {string} lang */
  function salonHTML(items, lang) {
    var l = langOf(lang), t = SALON_TEXT[l], A = art(), L = lint();
    var ok = (items || []).filter(function (it) { return it && it.source === "salon" && !salonErrors(L, it.text).length; });
    return '<div class="lq-look-salon" data-lq-look><h4>' + esc(t.title) + '</h4><p class="lq-look-intro">' + esc(t.note) + '</p><ul class="lq-look-list">' +
      ok.map(function (it) {
        var card = it.card && A ? A.svg(it.card) : "";
        return '<li class="lq-look-item lq-look-salon-item" data-look-id="' + esc(it.id) + '" data-lq-look>' + (card ? '<div class="lq-look-card">' + card + "</div>" : "") +
          '<div class="lq-look-body"><p class="lq-look-text"><span lang="' + esc(it.nameLang || l) + '">' + esc(it.text) + "</span>" +
          (it.note ? ' <small class="lq-look-note">' + escText(it.note) + "</small>" : "") + '</p><p class="lq-look-label">' + esc(SALON_LABEL[l]) + "</p></div></li>";
      }).join("") + "</ul></div>";
  }

  var CSS = "html[data-lq-calm] [data-lq-look],html[data-lq-crisis] [data-lq-look]{display:none!important}" +
    ".lq-look{border:1px solid rgba(160,70,110,.28);border-radius:14px;padding:.8em 1em;margin:1em 0;--look-accent:#a0466e}" +
    ".lq-look h3{margin:.1em 0 .3em}.lq-look-intro,.lq-look-priv{font-size:.9em;opacity:.85;margin:.2em 0 .6em}" +
    ".lq-look-list{list-style:none;padding:0;margin:0;display:grid;gap:.7em}" +
    ".lq-look-item{display:flex;gap:.8em;align-items:flex-start;border-top:1px dashed rgba(160,70,110,.25);padding-top:.6em}" +
    ".lq-look-card{flex:0 0 96px}.lq-look-card svg{width:96px;height:64px;color:inherit}.lq-look-body{flex:1;min-width:0}" +
    ".lq-look-cat{font-size:.8em;font-weight:700;letter-spacing:.02em;color:var(--look-accent)}.lq-look-body p{margin:.2em 0}" +
    ".lq-look-label{font-size:.82em;font-style:italic;opacity:.8}.lq-look-adult label{display:flex;gap:.5em;align-items:flex-start;cursor:pointer;min-height:44px}" +
    ".lq-look-actions{margin-top:.6em}.lq-look .btn{min-height:44px}" +
    "@media (max-width:420px){.lq-look-item{flex-direction:column}.lq-look-card{flex:none}}" +
    ".lq-look-dialog{width:min(94vw,680px);max-height:94vh;border:0;border-radius:16px;padding:1em;background:var(--bg,#fff);color:inherit}" +
    ".lq-look-dialog::backdrop{background:rgba(10,20,30,.6)}.lq-look-canvas{width:100%;height:auto;border-radius:12px;background:#222}" +
    ".lq-look-styles{display:flex;flex-wrap:wrap;gap:.4em;margin:.6em 0}.lq-look-styles .btn[aria-pressed=true]{outline:2px solid var(--look-accent,#a0466e)}" +
    ".lq-look-sw{display:inline-block;width:1.1em;height:1.1em;border-radius:50%;vertical-align:middle;margin-right:.3em}" +
    ".lq-look-dnote{font-size:.86em;opacity:.85}.lq-look-try{margin-top:.4em}" +
    (ART ? ART.CSS : "");

  function css(/** @type {any} */ d) {
    try {
      if (!d.getElementById("lq-look-style")) {
        var st = d.createElement("style"); st.id = "lq-look-style";
        var A = art(); st.textContent = CSS + (!ART && A && A.CSS ? A.CSS : "");
        d.head.appendChild(st);
      }
    } catch (e) { /* no DOM */ }
  }
  var lastR = /** @type {any} */ (null), lastBox = /** @type {any} */ (null), watching = false;
  var curLang = function () { var I = /** @type {any} */ (root).LQI18N; return langOf(I && I.lang); };
  /** draw (or hide) the block under a reading @param {any} container @param {any} R faceread analyze() result */
  function render(container, R) {
    if (!container) return;
    lastBox = container; lastR = R || lastR;
    var d = container.ownerDocument || root.document;
    css(d); watch(d);
    container.setAttribute("data-lq-look", "");
    var st = canShow(d), l = curLang(), t = TXT[l];
    if (!lastR || st.why === "calm") {
      container.hidden = true; container.innerHTML = "";
      // an open camera preview closes too (calm or crisis): its dialog would be hidden by CSS while the camera runs (review S2)
      var P0 = /** @type {any} */ (root).LQLookPreview; if (st.why === "calm" && P0 && P0.close) { try { P0.close(); } catch (e) { /* no DOM */ } }
      return;
    }
    container.hidden = false;
    container.setAttribute("lang", l === "zh" ? "zh-Hans" : l);
    var head = "<h3>" + esc(t.title) + '</h3><p class="lq-look-intro">' + esc(t.intro) + "</p>";
    if (st.why === "adult") {
      container.innerHTML = head + '<div class="lq-look-adult" data-look-adult><p>' + esc(t.adultWhy) + "</p><label><input type=\"checkbox\"> <span>" + esc(t.adult) + "</span></label></div>";
      var cb = container.querySelector("[data-look-adult] input");
      cb.addEventListener("change", function () { if (cb.checked) { confirmAdult(); render(container, lastR); } });
      return;
    }
    if (st.why === "off") {
      container.innerHTML = '<p class="lq-look-intro">' + esc(t.off) + ' <button type="button" class="btn ghost" data-look-show>' + esc(t.show) + "</button></p>";
      container.querySelector("[data-look-show]").addEventListener("click", function () { lsSet(OFF_KEY, null); render(container, lastR); });
      return;
    }
    var R2 = lastR, el = R2.el && R2.el.top ? R2.el.top.id : "";
    var items = suggest(R2.cls, { el: el, lang: l });
    container.innerHTML = head + html(items, l) + '<p class="lq-look-priv">' + esc(t.privacy) + "</p>" +
      '<div class="lq-look-actions"><button type="button" class="btn ghost" data-look-hide>' + esc(t.hide) + "</button></div>";
    container.querySelector("[data-look-hide]").addEventListener("click", function () { lsSet(OFF_KEY, "1"); render(container, lastR); });
    var P = /** @type {any} */ (root).LQLookPreview;
    if (P && P.bind) P.bind(container, items, l);
  }
  /** re-render when the crisis net or the language changes (the crisis flow may change; we check at render time) @param {any} d */
  function watch(d) {
    if (watching) return; watching = true;
    var again = function () { if (lastBox) render(lastBox, lastR); };
    try { root.addEventListener("lq-crisis", again); root.addEventListener("lq-lang", again); } catch (e) { /* no events */ }
    try {
      var MO = /** @type {any} */ (root).MutationObserver;
      if (MO) new MO(again).observe(d.documentElement, { attributes: true, attributeFilter: ["data-lq-calm", "data-lq-crisis"] });
    } catch (e) { /* no observer: the CSS still hides the block */ }
  }

  var api = { __setLintForTest: function (/** @type {any} */ L) { LINT_OVR = L; },
    RULES: RULES, LABEL: LABEL, SALON_LABEL: SALON_LABEL, SALON_TEXT: SALON_TEXT, salonItem: salonItem, salonHTML: salonHTML, CSS: CSS, SLOTS: SLOTS,
    suggest: suggest, canShow: canShow, confirmAdult: confirmAdult, html: html, render: render, TEXT: TXT };
  if (NODE) module.exports = api; else /** @type {any} */ (root).LQLook = api;
})(typeof window !== "undefined" ? window : globalThis);
