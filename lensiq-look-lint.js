/* lensiq-look-lint.js — wording lint for look suggestions (CLAUDE.md "Look suggestions"; docs/BEAUTY-IMAGE-DESIGN.md §3).
 * Same approach as lensiq-merit-lint.js and built on it: the text is normalised by LQMeritLint.normalise (NFKC, zero-width
 * characters removed, look-alike letters mapped, Thai digits), Thai and Chinese rules run on the "squashed" text (spaces and
 * punctuation removed, so "ศัลย กรรม" or "美 白" count), English rules on the lower-cased text, and a few English words also
 * on squashed Latin ("s u r g e r y"). Every Merit lint code (purchase, price, link, guarantee, fix_luck, fear, ...) applies too.
 *
 *   LQLookLint.lintLook(text, {source?}) -> [] when clean, else [{code, match}]
 *     source "salon" (owner wording 2026-11-13): a salon's OWN catalogue item name, entered by the salon and shown labelled
 *     as the salon's text, may name its method (semi-permanent brows etc.): only the "procedure" code is lifted for it.
 *     Every other code still applies. The tool's own (generated) wording always uses the default, strict check.
 *   codes: procedure, whitening, negative, score, threat + LQMeritLint.LINT_CODES
 *
 * Loaded on faceread.html after lensiq-merit-lint.js; lensiq-look.js drops any rule text that fails (defence in depth) and
 * tests/unit/look-suggest.test.js checks every rule text in TH / EN / ZH.
 */
(function (root) {
  "use strict";
  /** @type {any} */
  var ML = (typeof module !== "undefined" && module.exports) ? require("./lensiq-merit-lint.js") : /** @type {any} */ (root).LQMeritLint;

  /** @type {Record<string, {th?: RegExp, en?: RegExp, zh?: RegExp, sq?: RegExp}>} */
  var LINT = {
    // surgery, injections, thread lifts, laser, tattoo / semi-permanent pigment, any medical or cosmetic procedure
    procedure: {
      th: new RegExp("ศัลยกรรม|ศัลย์|ผ่าตัด|ฉีด|โบท็อก|โบทอก|ฟิลเลอร์|ร้อยไหม|เลเซอร์|สัก(?:คิ้ว|ปาก|ขอบตา|ตา|หน้า|ถาวร)|กึ่งถาวร|" +
        "ไมโครเบลด|หัตถการ|เสริมจมูก|ทำจมูก|ตัดกราม|ทำตาสองชั้น|ตาสองชั้นแบบผ่า|ดึงหน้า|เติมหน้า|คลินิกความงาม|ทรีตเมนต์ผิว"),
      en: new RegExp("\\bsurg\\w*|\\binject\\w*|\\bbotox\\b|\\bfillers?\\b|\\bthread[- ]?lifts?\\b|\\blaser\\w*|\\btattoo\\w*|\\bmicroblad\\w*|" +
        "\\bsemi[- ]?permanent\\b|\\bpermanent (?:make-?up|pigment|liner|eyeliner|brows?|lips?)\\b|\\bnose job\\b|\\brhinoplast\\w*|\\bblepharoplast\\w*|" +
        "\\bface ?lifts?\\b|\\bcosmetic (?:procedure|treatment|surgery|clinic)s?\\b|\\bmedical (?:procedure|treatment)s?\\b|\\bprocedures?\\b|" +
        "\\bdermal\\b|\\bpmu\\b|\\bimplants?\\b"),
      sq: /surgery|botox|microblad|rhinoplast/,
      zh: /手术|手術|整形|整容|注射|肉毒|玻尿酸|填充|埋线|埋線|线雕|線雕|激光|镭射|鐳射|纹(?:眉|唇|眼线|绣|身)|紋(?:眉|唇|眼線|繡|身)|文眉|绣眉|繡眉|雾眉|霧眉|半永久|隆鼻|割双眼皮|割雙眼皮|双眼皮手术|削骨|医美|醫美|拉皮|微整/
    },
    // skin-whitening and colourism (same rule as Style: no "ใส่แล้วผิวขาว / 显白")
    whitening: {
      th: /ผิวขาว|ขาวใส|ขาวขึ้น|หน้าขาว|ไวท์เทนนิ่ง|ผิวสว่าง|หน้าสว่าง|ผิวคล้ำ|ดำคล้ำ|ผิวดำ|ผิวเข้ม|ผิวกระจ่าง|ขาวออร่า|ผิวดูขาว|หน้าดูขาว/,
      en: new RegExp("\\bwhiten\\w*|\\blighten\\w* (?:your |the )?(?:skin|complexion|face)|\\bskin[- ]?lighten\\w*|\\bbrighten\\w* (?:your |the )?(?:skin|complexion|face)\\b|" +
        "\\bfair(?:er)? (?:skin|complexion)\\b|\\blooks? fair(?:er)?\\b|\\b(?:dark|darker|light|lighter) skin\\b|\\bskin bleach\\w*|\\bbleach\\w* (?:your |the )?skin\\b"),
      zh: /美白|显白|顯白|提亮肤色|提亮膚色|变白|變白|肤色暗|膚色暗|皮肤黑|皮膚黑|黑皮|白皙|显黑|顯黑/
    },
    // a feature is bad, a flaw, or must be fixed
    negative: {
      th: /ไม่ดี|ไม่สวย|ไม่หล่อ|ข้อเสีย|จุดด้อย|ข้อด้อย|ต้องแก้|แก้ไข|ผิดปกติ|น่าเกลียด|ขี้เหร่|อัปลักษณ์|บกพร่อง|ตำหนิ|ปิดจุด|ปกปิดข้อ|ซ่อนข้อ|อำพราง|ผิดรูป|ไม่สมส่วน/,
      en: new RegExp("\\bbad\\b|\\bugly\\b|\\bflaws?\\b|\\bflawed\\b|\\bdefects?\\b|\\bfix(?:es|ed|ing)? (?:your|the|a|this)\\b|\\bcorrect(?:s|ed|ing)? (?:your|the|a|this)\\b|" +
        "\\bproblem (?:area|feature)s?\\b|\\bunattractive\\b|\\bunflattering\\b|\\bimperfect\\w*|\\bmust (?:be )?(?:change|fix|correct)\\w*|\\bneeds? (?:fixing|correcting|correction)\\b|" +
        "\\bhide (?:your|the)\\b|\\bdisguise\\w*|\\bworst\\b|\\bweakness(?:es)?\\b|\\bnot (?:pretty|good-looking|attractive)\\b"),
      zh: /不好|难看|難看|丑|醜|缺点|缺點|缺陷|瑕疵|必须改|必須改|要改正|改正|矫正|矯正|遮丑|遮醜|遮住缺|不吉|毛病|不完美/
    },
    // beauty scores, ranks and age-look claims
    score: {
      th: /คะแนนความ(?:สวย|หล่อ|งาม)|สวยขึ้น|หล่อขึ้น|สวยกว่า|หล่อกว่า|น่ารักขึ้น|หน้าตาดีขึ้น|ดูแก่|อ่อนกว่าวัย|ดูเด็กลง|เด็กลง|หน้าเด็ก|\d+(?:\/|จาก)10|ให้คะแนนหน้า|ระดับความสวย/,
      en: new RegExp("\\bbeauty (?:score|rating|rank)\\w*|\\battractive(?:ness)?\\b|\\bprettier\\b|\\bmore (?:beautiful|handsome)\\b|\\bbetter[- ]looking\\b|" +
        "\\blook(?:s|ing)? (?:younger|older)\\b|\\byounger[- ]looking\\b|\\brat(?:e|ed|ing) (?:your )?(?:face|looks)\\b|\\b\\d+ ?(?:\\/|out of) ?10\\b|\\bscores?\\b"),
      zh: /颜值|顏值|打分|评分|評分|更美|更漂亮|更帅|更帥|变美|變美|显年轻|顯年輕|显老|顯老|减龄|減齡|显小|\d+分/
    },
    // luck suffers if the user does not follow the suggestion
    threat: {
      th: /(?:ถ้า|หาก)ไม่(?:แต่ง|ทำ|เปลี่ยน|ลอง|ใส่|ใช้|ตัด|เขียน|เติม)|ไม่งั้น|ไม่อย่างนั้น|มิฉะนั้น|ดวงจะ(?:ตก|เสีย|แย่|ไม่ดี)|โชคจะ(?:หาย|หมด|เสีย|ไม่ดี)|เสียโชค|เสียดวง/,
      en: new RegExp("\\botherwise\\b|\\bor else\\b|\\bif you (?:don'?t|do not|won'?t|will not)\\b|\\bunless you\\b|\\b(?:luck|fortune)(?: will)? (?:suffer|drop|fall|decline)\\w*|" +
        "\\blose (?:your |some )?luck\\b|\\bbad for (?:your )?(?:luck|fortune)\\b|\\bhurts? (?:your )?(?:luck|fortune)\\b"),
      zh: /否则|否則|不然|不改的话|不改的話|(?:运势|運勢|运气|運氣)(?:会|會)?(?:下降|变差|變差|变坏|變壞|受损|受損)|影响运势|影響運勢|破财|破財|失运|倒运/
    }
  };
  /* added after the independent review (2026-11-13, S3): more procedures, whitening, "feature is too big / small" framing, age-look,
     "luck / help is lost otherwise" and order wording, TH / EN / ZH. Same codes; checked after the rules above. */
  /** @type {Record<string, {th?: RegExp, en?: RegExp, zh?: RegExp, sq?: RegExp}>} */
  var EXTRA = {
    procedure: {
      th: /ทำคิ้ว\d|คิ้ว\dd|ฝังสี|ฝังเข็ม|ถาวร|กรีดตา|เสริม(?:คาง|จมูก|โหนก|หน้าผาก|ขมับ)|ดูดไขมัน|คลินิก|ไฮฟู|ร้อยไหม|ต่อขนตา|ลิฟติ้งขนตา/,
      en: new RegExp("\\bfill-?ers?\\b|\\bhifu\\b|\\bmicroneedl\\w*|\\bchemical peels?\\b|\\bpeels?\\b|\\blash (?:lifts?|extensions?|perms?|tints?)\\b|" +
        "\\bbrow (?:lamination|tint\\w*)\\b|\\blamination\\b|\\blipo\\w*|\\bdermaplan\\w*|\\bclinics?\\b|\\bneedl\\w*"),
      sq: /b[o0]t[o0]x|hifu|microneedl/,
      zh: /水光针|热玛吉|瘦脸针|割眼皮|开眼角|皮秒|光子嫩肤|打针|嫁接睫毛|种睫毛|吸脂|垫下巴|诊所/
    },
    whitening: {
      th: /สว่างขึ้น|กระจ่าง|ผ่อง|ขาวอมชมพู|หน้าใส/,
      en: /\bpaler\b|\bwhiter\b|\bdusky\b|\bfairer\b|\bbrightening\b/,
      zh: /更白|冷白皮|提亮气色|去黄|白一度|显白/
    },
    negative: {
      th: /(?:(?<!เ)ปิด|แก้|พราง|ซ่อน)(?:คิ้ว|หน้า|จมูก|ปาก|ตา|คาง|โหนก|กราม)|หน้าใหญ่|เรียวลง|(?:ใหญ่|เล็ก|บาง|หนา|กลม|กว้าง|แคบ|สั้น|ยาว|โต)เกินไป|(?:ใหญ่|เล็ก|บาง|กลม)ไป/,
      en: new RegExp("\\bslim\\w* (?:a|your|the)\\b|\\b(?:wide|big|flat|broad|crooked|small|large) (?:nose|forehead|face|jaw)\\b|\\bweak chin\\b|\\bconceal\\w*|" +
        "\\btoo (?:small|big|large|thin|wide|round|narrow|short|long|thick|flat)\\b|\\bdouble chin\\b|\\bslimming\\b|\\bnarrow(?:s|ing)? (?:the|your) (?:face|nose)\\b"),
      zh: /修饰|显脸小|脸小|大脸|太(?:圆|薄|小|大|宽|短|长|厚|扁)|瘦脸|遮盖/
    },
    score: {
      th: /อ่อนวัย|ดูเด็ก|ย้อนวัย/,
      en: /\byounger\b|\bglow[- ]?up\b|\byouthful\b|\bage-?defying\b|\banti-?ag\w*/,
      zh: /年轻|显嫩|逆龄|冻龄/
    },
    threat: {
      th: /ไม่(?:ทำ|แต่ง|เขียน|เติม|ลอง|ใส่)[^]{0,24}(?:แล้ว|จะ)|จะไม่(?:รุ่ง|มีคน|ก้าวหน้า|มีใคร)|ไม่รุ่ง|ขาด[^]{0,16}จะ/,
      en: /\bskip (?:this|it)\b|\bstall\w*|\bwithout\b[^.]{0,40}\bwill\b|\bdrift away\b|\bnobody will\b/,
      zh: /不(?:画|改|做|修|染|戴)的话|没人帮|没有人帮/
    },
    purchase: {
      th: /สั่งเลย|สั่งได้|ทักแชท|ทักไลน์|ทักมา|อินบ็อกซ์/,
      en: /\bdm (?:us|me)\b|\b(?:to|please|now) order\b|\binbox us\b|\bmessage us\b/,
      zh: /淘宝|天猫|拼多多|京东|链接|私信/
    }
  };
  /* word FAMILIES (coordinator review @34b6f0a, 2026-11-13): stems and patterns rather than single strings, so new phrasings of
     the same idea are caught. Thai runs on the squashed text; English on the lower-cased text and, where marked sq, on squashed
     Latin ("W h i t e n i n g", "ug ly"). */
  var ADJ_TH = "(?:กว้าง|แคบ|ใหญ่|เล็ก|บาง|หนา|สั้น|ยาว|กลม|โต|แบน|ต่ำ|สูง|ห่าง|ชิด|เหลี่ยม|แหลม|เหี่ยว|โหนก)";
  /** @type {Record<string, {th?: RegExp, en?: RegExp, zh?: RegExp, sq?: RegExp}>} */
  var FAMILY = {
    procedure: {
      // สัก / ฝัง + any face part or style word; any method word stem
      th: new RegExp("สัก(?:อาย|คิ้ว|ปาก|ขอบ|ตา|หน้า|ถาวร|ไลน์|ไล|ลิป|ไรผม|หนวด|เครา|แก้ม|สี|ลาย)|ฝัง(?:สี|เม็ดสี|ขน|คิ้ว|เส้น)|" +
        "(?:ออมเบร|พาวเดอร์|นาโน|ไมโคร|คอมโบ|ไฮบริด)(?:บราว|คิ้ว)|คิ้ว(?:ออมเบร|พาวเดอร์|นาโน|ไมโคร|คอมโบ|ไฮบริด|ฝุ่น\\d|\\d)|ลิปบลัช|บลัชปาก|ปากชมพูถาวร"),
      en: new RegExp("\\b(?:ombre|ombré|powder|nano|micro\\w*|hybrid|combo|feather\\w*|\\dd|machine) ?(?:brows?|lips?|liner|eyeliner)\\b|\\blip blush\\w*|" +
        "\\bembroider\\w*|\\bmicropigment\\w*|\\bpigment(?:ed|ation)? (?:brows?|lips?|liner|eyeliner)\\b|\\bnanoblad\\w*|\\bshading brows?\\b|\\bink(?:ed)? (?:brows?|lips?)\\b"),
      sq: /microblad|micropigment|nanoblad|embroider|tattoo|ombrebrow|powderbrow|nanobrow|lipblush/,
      zh: new RegExp("(?<![方指别胸])针(?![对织线])|(?:飘|雾|粉雾|水雾|丝雾|韩式|半永久|立体)眉|纹(?:眉|唇|眼|绣|身|发际)|绣(?:眉|唇|眼)|植眉|眉毛种植|" +
        "唇(?:部)?(?:纹|绣|漂)|漂唇|美瞳线|微整|医美|整形")
    },
    whitening: {
      th: /คล้ำ|ขาวขึ้น|ขาวกระจ่าง|หน้าหมอง|ผิวหมอง|ผิวโทรม|ปรับผิว|ผิวดูสว่าง/,
      en: /\bbright(?:er|en\w*) (?:complexion|skin|face)\b|\btone[- ]?up\b|\bdull(?:ness)? (?:skin|complexion)\b|\beven(?:s|ing)? (?:out )?(?:your |the )?skin\b|\bskin tone\b/,
      sq: /whiten|bleach|lightening|skinlighten|fairness|brighterskin|brightercomplexion|toneup/,
      zh: /暗沉|发黄|蜡黄|提亮|亮白|嫩白|透白|白皙|变白|黑黄|肤色不均|素颜霜/
    },
    negative: {
      th: new RegExp(ADJ_TH + "(?:เกิน(?!กว่า)|ไป(?!ทาง|ที่|ถึง|ยัง|หา|ด้วย|ให้|เล็กน้อย|ข้าง|อีก|ตาม|เลย|แล้ว))|จุดอ่อน|ข้อเสีย|" +
        "ไม่(?:เป็น)?มงคล|เป็นปัญหา|ปัญหา(?:ของ|ที่|เรื่อง)?(?:หน้า|คิ้ว|จมูก|ปาก|ตา|คาง|ผิว|ผม)|ไม่ค่อย(?:สวย|ดี|หล่อ|เข้า|งาม)|ไม่(?:สวย|หล่อ|งาม|เข้ากับหน้า)|" +
        "เสียโฉม|ขัดลาภ|(?:ทำลาย|ขวาง|บัง|ปิด)(?:โชค|ลาภ|ดวง)|ดวงเสีย"),
      en: new RegExp("\\bproblem\\w*|\\bbreaks? (?:the |your )?(?:luck|fortune)\\b|\\binauspicious\\b|\\bweak (?:point|spot|feature|area)s?\\b|" +
        "\\bnot (?:so |very |that )?(?:pretty|nice|good|great|attractive)\\b|\\bfaults?\\b|\\bshortcomings?\\b|\\btoo (?!much\\b)[a-z]+\\b|\\bunfortunate\\b"),
      sq: /ugly|ugli|unattractive/,
      zh: new RegExp("问题|不吉|不旺|破相|短板|不够(?:好看|漂亮|大|高|挺|美)|过(?:宽|窄|大|小|高|低|短|长|厚|薄|圆|方)|太[^\\d，。、\\s]|不好看|丑")
    },
    score: {
      th: /\d+(?:เต็ม|จาก|ใน)\d+|เต็ม(?:10|สิบ|100|ร้อย)|อันดับ\d|อันดับที่|ที่\d(?:ของ|ใน)|เปอร์เซ็นต์ความ|ระดับ\d/,
      en: /\b\d+(?:\.\d+)? ?(?:\/|out of|of) ?\d+\b|\brank(?:ed|ing|s)?\b|\bscor\w*|\bratings?\b|\btop \d+\b|\bpercentile\b|\bnumber \d+ (?:face|look)/,
      zh: /指数|排名|排行|第[一二三四五六七八九十\d]+名|\d+分|满分|打分|几分/
    },
    purchase: {
      th: /ใส่ตะกร้า|หยิบใส่|กดสั่ง|สั่งซื้อ|ช้อปเลย|ซื้อเลย/,
      en: /\badd (?:it |this )?to (?:your )?(?:cart|basket|bag)\b|\bcheckout\b|\bbuy now\b|\bshop now\b/,
      zh: /购物车|立即购买|马上买|下单|拍下/
    }
  };
  // Thai marks that are often mistyped or used to break a word (tone marks, thanthakhat, phinthu, nikhahit, yamakkan, mai taikhu)
  var MARKS = /[็-๎ฺ]/g;
  /** "bare" Thai: SARA AM -> SARA AA and every mark removed, so "สัก์คิ้ว", "ผิวขำว" read like "สักคิว", "ผิวขาว" @param {string} s */
  var bare = function (s) { return s.replace(/ำ/g, "า").replace(MARKS, ""); };
  /** bare variants of the Thai alternatives that are long enough not to collide with ordinary words (>= 4 bare letters)
   *  @param {RegExp} rx @returns {RegExp|null} */
  function bareRx(rx) {
    var src = rx.source, alts = [], depth = 0, cur = "";
    for (var i = 0; i < src.length; i++) {
      var c = src[i];
      if (c === "\\") { cur += c + src[i + 1]; i++; continue; }
      if (c === "(" || c === "[") depth++;
      if (c === ")" || c === "]") depth--;
      if (c === "|" && depth === 0) { alts.push(cur); cur = ""; } else cur += c;
    }
    alts.push(cur);
    var keep = alts.map(bare).filter(function (a) { return (a.match(/[ก-ฮ]/g) || []).length >= 4 && !/\(\?<!/.test(a); });
    return keep.length ? new RegExp(keep.join("|")) : null;
  }
  /** @type {{code: string, rx: RegExp}[]} */
  var BARE = [];
  [LINT, EXTRA, FAMILY].forEach(function (T) {
    Object.keys(T).forEach(function (code) { var r = T[code].th && bareRx(T[code].th); if (r) BARE.push({ code: code, rx: r }); });
  });
  var OWN = Object.keys(LINT);
  var CODES = OWN.concat(ML && ML.LINT_CODES ? ML.LINT_CODES.filter(function (c) { return OWN.indexOf(c) < 0; }) : []);

  /** @param {any} text @param {{source?: string}} [opts] @returns {{code: string, match: string}[]} */
  function lintLook(text, opts) {
    var salon = !!(opts && opts.source === "salon");
    // NFKC splits Thai SARA AM (U+0E33) into NIKHAHIT + SARA AA; join it back so "ทำ", "คล้ำ" match the rules as written
    // and nikhahit typed before the tone mark ("\u0E1C\u0E34\u0E27\u0E04\u0E25\u0E4D\u0E49\u0E32" = \u0E25 + \u0E4D + \u0E49 + \u0E32) is put in the usual order ("\u0E04\u0E25\u0E49\u0E33")
    var t = (ML ? ML.normalise(text) : String(text == null ? "" : text)).replace(/\u0E4D([\u0E48-\u0E4B]?)\u0E32/g, "$1\u0E33");
    if (!t.trim()) return [];
    var lower = t.toLowerCase();
    var squash = lower.replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
    /** @type {{code: string, match: string}[]} */
    var out = [];
    for (var i = 0; i < OWN.length; i++) {
      if (salon && OWN[i] === "procedure") continue;
      var rx = LINT[OWN[i]], m = null;
      if (rx.th) m = rx.th.exec(squash);
      if (!m && rx.zh) m = rx.zh.exec(squash);
      if (!m && rx.en) m = rx.en.exec(lower);
      if (!m && rx.sq) m = rx.sq.exec(squash);
      if (m) out.push({ code: OWN[i], match: m[0].slice(0, 40) });
    }
    var has = function (/** @type {string} */ c) { return out.some(function (h) { return h.code === c; }); };
    [EXTRA, FAMILY].forEach(function (T) {
      for (var code in T) {
        if ((salon && code === "procedure") || has(code)) continue;
        var x = T[code], k = null;
        if (x.th) k = x.th.exec(squash);
        if (!k && x.zh) k = x.zh.exec(squash);
        if (!k && x.en) k = x.en.exec(lower);
        if (!k && x.sq) k = x.sq.exec(squash);
        if (k) out.push({ code: code, match: k[0].slice(0, 40) });
      }
    });
    var b = bare(squash);
    BARE.forEach(function (e) {
      if ((salon && e.code === "procedure") || has(e.code)) return;
      var k = e.rx.exec(b);
      if (k) out.push({ code: e.code, match: k[0].slice(0, 40) });
    });
    if (ML) out = out.concat(ML.lintMerit(t));
    return out;
  }

  var api = { lintLook: lintLook, LOOK_CODES: CODES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else /** @type {any} */ (root).LQLookLint = api;
})(typeof window !== "undefined" ? window : globalThis);
