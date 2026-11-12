/* fortune-crisis.js — the widened crisis net for every fortune page (independent review 2026-11-12: the patterns in
 * fortune-ai.js caught 19/52 adversarial inputs). Loaded before fortune-ai.js; fortune-ai.js requires it in Node and keeps
 * its own original patterns as well, so the net never gets weaker if this file is missing.
 * check(text) runs on the RAW user text: Thai is matched without spaces and without tone marks (ฆาตัวตาย = ฆ่าตัวตาย),
 * traditional Chinese is folded to simplified (自殺 = 自杀), English is case-insensitive with common slang and numerals
 * ("kms", "unalive", "want 2 die"). Families: suicide and self-harm, wanting to disappear or not wake up, violence by a
 * partner or family member, sexual abuse (incl. of children). fields(doc) returns the text of every free-text field on
 * the page, so a phrase typed into a name box is caught as well as one typed into a question box.
 * Fixed tests (locked before this file was written): tests/unit/fortune-crisis-net.test.js, tests/e2e/fortune-crisis-fields.e2e.mjs.
 * REVIEW: like the support card, these patterns still need a review by a Thai mental-health professional. */
(function (root) {
  "use strict";
  const TONE = /[็-์]/g;
  /** Thai pattern written normally; matched against text with spaces and tone marks removed @param {RegExp} re */
  const toneless = re => new RegExp(re.source.replace(TONE, ""), re.flags);
  const TH = [
    /ฆ่าตัว(?:ตาย)?|อยาก(?:จะ)?(?:ไป)?(?:ต(?:า|ั)ย(?!ตัว)|die)|ไม่อยาก(?:มีชีวิต(?:อยู่)?|อยู่(?:แล้ว|ต่อ|บนโลก)|ตื่น(?:ขึ้นมา)?อีก|หายใจ)|อยากหายไป(?:จากโลก)?/,
    /อยากไปเกิดใหม่|ไปจากโลกนี้|(?:จะ|อยาก)ไปให้พ้น|ไม่อยากเป็นภาระ|(?:ทุกคน|คนอื่น|ครอบครัว)[^\s]{0,6}(?:สบาย|ดี|มีความสุข)(?:ขึ้น)?[^\s]{0,4}(?:ถ้า|หาก)(?:ไม่มี|ขาด)(?:ฉัน|หนู|ผม|เรา|กู)/,
    /เชือก[^\s]{0,14}(?:จบ|ตาย)|(?:คืนนี้|วันนี้)(?:จะ|ขอ)จบ(?!งาน|โปรเจ|เรื่อง|การ)|เผาถ่าน/,
    /จับ(?:ตัว)?(?:หนู|ฉัน|ผม)[^\s]{0,14}(?:ไม่เหมาะสม|กลางคืน|ตอนนอน|ในห้อง)|จับตัวหนู/,
    /อยากนอน(?:หลับ)?(?:แล้ว|ไป)?(?:ไม่|ไม่ต้อง)ตื่น|ไม่อยากตื่น|ชีวิต(?:นี้)?ไม่มี(?:ความหมาย|ค่า)|(?:ควร|อยาก)จบ(?:ทุกอย่าง|ทุกสิ่ง|มันซะ|ชีวิต)|จบชีวิต|คิดสั้น/,
    /ทำร้ายตัวเอง|ทำร้ายตนเอง|กรีด(?:ข้อมือ|แขน|ตัวเอง)|ปลิดชีพ|กินยา(?:ตาย|เกินขนาด|ฆ่าตัว)|(?:กิน|ทาน)ยา(?:นอนหลับ|ฆ่าแมลง|พิษ|เบื่อ)|ยาพิษ|ผูกคอ|แขวนคอ/,
    /(?:โดด|กระโดด)(?:ตึก|สะพาน|น้ำตาย|ลงจาก|จากตึก|จากที่สูง|ลงมาตาย)/,
    /(?:ถูก|โดน)(?:ทำร้าย(?:ร่างกาย)?|ทุบตี|ตบตี|ซ้อม|ข่มขืน|ล่วงละเมิด|ลวนลาม|ทารุณ|กักขัง|อนาจาร)|ข่มขืน|ล่วงละเมิดทางเพศ|อนาจาร|ความรุนแรงในครอบครัว/,
    // round 3 (review 2026-11-12): more ways to say it, plans and methods, threats, sexual abuse of children
    /ไม่อยาก(?:เป็น)?อยู่(?:ใน|บน)?โลก|ไม่อยาก(?:เป็น)?อยู่(?:แล้ว|ต่อ|อีกต่อไป)|อยาก(?:นอน|หลับ)(?:หลับ)?(?:แล้ว|ไป)?(?:ไม่|ไม่ต้อง)ตื่น/,
    /อยาก(?:จะ)?(?:ไป)?(?:ตุย|ม่องเท่ง)|จดหมายลาตาย|ลาโลก|ตาย(?:ๆ)?ไป(?:ซะ|เสีย)(?:ดีกว่า)?|ตายๆไป|ยาฆ่าหญ้า|ยาเบื่อหนู/,
    /ขู่(?:จะ)?ฆ่า|มีด(?:มา)?จ่อ|(?:แฟน|สามี|ภรรยา|ผัว|เมีย|พ่อ|แม่|พ่อเลี้ยง|แม่เลี้ยง)[^\s]{0,10}บีบคอ/,
    /ขืนใจ|บังคับ(?:ให้)?(?:หนู|ฉัน|ผม)?(?:ถอด|แก้)(?:เสื้อ|กางเกง|ผ้า)|แอบดู(?:หนู|ฉัน|ผม)?(?:อาบน้ำ|แก้ผ้า|เปลี่ยนเสื้อ)|จับ(?:หน้าอก|ของสงวน|นม(?!แม่))/,
    new RegExp("(?:แฟน|สามี|ภรรยา|ผัว|เมีย|พ่อ|แม่|พ่อเลี้ยง|แม่เลี้ยง|ลุง|น้า|อา|พี่ชาย|ครู|ญาติ)[^\\s]{0,16}?" +
      "(?:ตบ(?!มุก)|ตี(?!กอล์ฟ|เทนนิส|ลูกบอล|กลอง|ราคา|ความ)|ทุบ|ต่อย|เตะ|กระทืบ|ชก|ฟาด|หวด|เฆี่ยน|ทำร้าย|ซ้อม|บีบคอ|" +
      "ข่มขืน|ลวนลาม|ล่วงละเมิด|จับ(?:หน้าอก|ของสงวน))[^\\s]{0,8}?(?:ฉัน|หนู|ผม|เรา|ดิฉัน|กู)"),
  ].map(toneless);
  const EN = [
    /\b(?:want(?:s|ed|ing)?|wanna|going) (?:to|2) die\b|\bwanna die\b|\bkill (?:my ?self|myself)\b|\bkms\b|\bunalive\b|\bend (?:my|my own) life\b|\bsuicidal\b/i,
    /\bdon'?t want to (?:be here|exist|live|be alive|wake up)\b|\bjump(?:ing)? off (?:a|the) (?:bridge|building|roof|cliff)\b|\bbetter off dead\b/i,
    /\btake (?:all|all of) (?:my|the) (?:pills|meds|tablets|sleeping pills)\b|\bhang myself\b|\bslit my wrists?\b/i,
    /\bkys\b|\bbetter off without me\b|\brather (?:not be alive|be dead|not exist|not wake up)\b/i,
    /\bwant (?:it|everything) (?:all )?to (?:stop|end)(?: forever)?\b(?! well| happily)/i,
    /\b(?:plan(?:ning)?|going|gonna) to end it\b(?! with| between| off)|\bend(?:ing)? things\b(?! with| between| off| on)|\bstockpil\w* (?:pills|meds|tablets|sleeping pills)\b/i,
    /\bmakes? me do things\b|\bwo xiang (?:qu )?si\b|\bbu xiang huo\b/i,
    /\bsuicid\w*|\bunaliv\w*|\bsewer ?slide\b|\boff myself\b|\bdon'?t (?:want to|wanna) (?:be alive|live|exist|be here)\b/i,
    /\b(?:no|don'?t see the|what'?s the) point (?:in |of )?(?:living|being alive|life|going on)\b|\bsleep forever\b|\bnever wake up\b/i,
    /\bgoodbye (?:letters?|notes?)\b|\bsuicide note\b|\bplanning my exit\b|\b(?:bought|got|have) (?:a )?rope\b|\b(?:how many|how much)\b[^.?]{0,40}\b(?:to|2) die\b/i,
    /\bthreaten\w* to kill me\b|\bforced (?:himself|herself|themselves) on me\b|\bcomes? into my (?:room|bed) at night\b|\bnudes?\b[^.]{0,40}\bsecret\b|\bsends? me nudes?\b/i,
    /\bSA'?d\b|\bgot SA\b|\bnude pics\b/,
    new RegExp("\\b(?:my )?(?:bf|gf|boyfriend|girlfriend|husband|wife|partner|dad|father|mom|mum|mother|step-?dad|step-?father|step-?mom|step-?mother|uncle|brother|teacher|coach|cousin|grandpa)" +
      " (?:\\w+ )?(?:hits|hit|beats|beat|punches|punched|kicks|kicked|slaps|slapped|chokes|choked|abuses|abused|rapes|raped|touches|touched) me\\b(?!\\s+(?:at|in|to|up|on|off)\\b)" +
      "(?!\\s+with (?:a |an |the )?(?:surprise|news|question|idea|joke|gift|compliment|party))", "i"),
  ];
  const ZH = [
    /自杀|自尽|轻生|想死(?!的心)|活不下去|活着没意思|活着好累|不想(?:再)?醒来|想消失|结束一切|结束(?:自己的)?生命|自残|自伤|割腕|跳楼|寻死|吞药|服药过量|家暴|家庭暴力|性侵|强奸/,
    /被(?:人)?(?:打|殴打|袭击|虐待|性侵|强奸|侵犯|猥亵)/,
    /想去死|一了百了|离开(?:这个)?(?:世界|人世)|不想活|安眠药|上吊|烧炭|跳河|跳桥|卧轨|(?:楼|窗|桥)(?:上)?跳下/,
    /(?:男朋友|男友|老公|丈夫|爸爸|爸|妈妈|妈|继父|继母|哥哥|叔叔|舅舅|姑父|姨父|表哥|他|她)[^。，]{0,12}?(?:打|揍|殴打|虐待|掐|踢|扇|抽)我(?!电话|手机)/,
    /(?:继父|叔叔|舅舅|姑父|姨父|爸爸|老师|哥哥|表哥|他)[^。，]{0,10}(?:摸|猥亵|性侵)我/,
    /结束这一切|死了算了|不如死了|人间不值得|遗书|割(?:手)?腕|一整瓶药|吃一整瓶|强迫我?(?:发生关系|做爱|上床)|摸我下面/,
    /죽고\s?싶|자살|\b(?:nak|mahu|ingin) mati\b|bunuh diri|muốn chết|tự tử|tự sát|消えて(?:しまい)?たい/i,
    /没有我[^。]{0,8}更好/,
    /死にたい|消えたい|自殺したい|生きていたくない|死のう/,
  ];
  // traditional → simplified for the characters these patterns use
  /** @type {Record<string, string>} */
  const T2S = { 殺: "杀", 殘: "残", 結: "结", 輕: "轻", 樓: "楼", 從: "从", 經: "经", 繼: "继", 離: "离", 開: "开", 這: "这", 個: "个", 傷: "伤", 為: "为", 對: "对",
    媽: "妈", 強: "强", 姦: "奸", 藥: "药", 過: "过", 會: "会", 沒: "没", 義: "义", 時: "时", 讓: "让", 動: "动", 橋: "桥", 頂: "顶", 後: "后", 來: "来", 說: "说",
    話: "话", 毆: "殴", 決: "决", 斷: "断", 盡: "尽", 尋: "寻", 燒: "烧", 掛: "挂", 臥: "卧", 軌: "轨", 師: "师", 褻: "亵", 跡: "迹", 剎: "刹", 襲: "袭", 擊: "击",
    著: "着", 撐: "撑", 遺: "遗", 書: "书", 發: "发", 關: "关", 係: "系", 間: "间", 帶: "带", 頸: "颈", 腳: "脚" };
  const T2S_RE = new RegExp("[" + Object.keys(T2S).join("") + "]", "g");
  /** true when the text shows a crisis signal @param {any} text */
  // English copies: leetspeak undone (0→o 1→i 3→e 4→a @→a $→s), spaces collapsed; letter-spaced runs ("I w a n t t o d i e") joined
  /** @type {Record<string, string>} */
  const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", "@": "a", $: "s" };
  const COMPACT = /wanttodie|wannadie|wantodie|killmyself|endmylife|iwanttodie|suicide|kms|kys/;
  /** runs of ≥ 4 single-letter tokens, each joined @param {string} t */
  function letterRuns(t) {
    const out = []; let run = [];
    for (const w of t.split(/\s+/).concat([""])) { if (/^[a-z]$/i.test(w)) run.push(w); else { if (run.length >= 4) out.push(run.join("").toLowerCase()); run = []; } }
    return out;
  }
  /** English copy (round 3): ! → i, "-" / "." between letters dropped (k-m-s), runs of ≥ 3 single letters joined in place ("d i e")
   *  @param {string} t */
  function enCopy(t) {
    const words = t.replace(/!/g, "i").replace(/([a-z])[-.](?=[a-z])/gi, "$1").replace(/[0134@$]/g, c => LEET[c]).split(/\s+/), out = []; let run = [];
    for (const w of words.concat([""])) {
      if (/^[a-z]$/i.test(w)) { run.push(w); continue; }
      if (run.length >= 3) out.push(run.join("")); else out.push(...run);
      run = []; if (w) out.push(w);
    }
    return out.join(" ");
  }
  /** true when the text shows a crisis signal @param {any} text */
  function check(text) {
    const t = String(text == null ? "" : text).normalize("NFC");
    if (!t.trim()) return false;
    const th = t.replace(/(?:บ่|มะ|หม่าย|ม่าย)(?=\s*(?:อยาก|ไหว|อยู่|มี))/g, "ไม่").replace(/\s+/g, "").replace(TONE, "");
    const zh = t.replace(T2S_RE, c => T2S[c]).replace(/\s+/g, "");
    const leet = t.replace(/[0134@$]/g, c => LEET[c]).replace(/\s+/g, " ");
    const en2 = enCopy(t);
    return TH.some(re => re.test(th)) || EN.some(re => re.test(t) || re.test(leet) || re.test(en2)) || ZH.some(re => re.test(zh)) || ZH.some(re => re.test(t)) ||
      letterRuns(t.replace(/[0134@$]/g, c => LEET[c])).some(r => COMPACT.test(r));
  }
  const FREE_TEXT = 'textarea, input:not([type]), input[type="text"], input[type="search"]';
  /** the raw text of every free-text field on the page (empty without a DOM) @param {any} [doc] */
  function fields(doc) {
    try {
      const d = doc || root.document;
      if (!d || typeof d.querySelectorAll !== "function") return "";
      return Array.from(d.querySelectorAll(FREE_TEXT)).map(e => String((e && e.value) || "")).filter(Boolean).join("\n");
    } catch (e) { return ""; }
  }
  /* ---------------- round 3 (B): the soft check ----------------
     Ambiguous distress words (or a name field with > 3 words, a pronoun / verb, digits mixed with letters) → a gentle
     "are you okay?" step BEFORE any reading: "I'd like to talk to someone" → the support card, "Just the reading" → go on.
     Fortune vocabulary (the Death card, 死神牌, dreams about a death, "kill time") is removed first; otherwise it errs on
     the side of asking. */
  const SOFT = [
    toneless(/ตาย|ตุย|ลาโลก|เหนื่อย[^\s]{0,12}ไม่ไหว|ทน[^\s]{0,8}ไม่ไหว|ไม่ไหวแล้ว|กลัว|ทำร้าย|จับ[^\s]{0,6}หนู|เบื่อโลก|ไร้ค่า|อยากหายไป|เจ็บปวด/),
    /\b(?:die|died|dying|dead|death|kill\w*|suicid\w*|end it|can'?t do this|hurts? me|touch(?:es|ed)? me|rope|pills|secret|hopeless|worthless|pointless)\b/i,
    /死|自杀|走了|结束|打我|摸我|强迫|遗书|撑不下去|活着|没意义|죽|消え|\bmati\b|chết/i,
  ];
  const FORTUNE_CTX = [/ไพ่(?:ใบ)?ความตาย|ไพ่\s*Death|ฝัน[^\n]{0,30}/g,
    /\b(?:the )?Death(?=[^.?]{0,25}\bcards?\b)|\bDeath card\b|\bDeath (?:reversed|upright)\b|\bdream\w*\b[^.?]{0,50}|\bdead tired\b|\bkill(?:ing)? (?:time|it)\b/gi,
    /死神牌?|梦见[^。？]{0,12}|梦到[^。？]{0,12}|夢見[^。？]{0,12}/g];
  /** ambiguous distress words (fortune vocabulary removed first) @param {any} text */
  function soft(text) {
    let t = String(text == null ? "" : text).normalize("NFC");
    for (const re of FORTUNE_CTX) t = t.replace(re, " ");
    const th = t.replace(/\s+/g, "").replace(TONE, ""), zh = t.replace(T2S_RE, c => T2S[c]).replace(/\s+/g, "");
    return SOFT[0].test(th) || SOFT[1].test(enCopy(t)) || SOFT[2].test(zh);
  }
  const NAME_TH = toneless(/(?:ฉัน|หนู|ผม|กู|เรา|ดิฉัน)(?:อยาก|จะ|ไม่|กลัว|เหนื่อย|รู้สึก|โดน|ถูก|ต้อง)|อยาก|ไม่|ช่วยด้วย|กลัว|เหนื่อย/);
  const NAME_EN = /\b(?:i|i'm|im|me|my|myself|you|we|he|she|they|want|wanna|need|help|hate|kill|die|am|is|are|was|can'?t|don'?t|please)\b/i;
  const NAME_ZH = /我|你|他|她|想|要|不|死|打|救/;
  /** a name field that is more than a plain name @param {any} name */
  function softName(name) {
    const n = String(name == null ? "" : name).normalize("NFC").trim();
    if (!n) return false;
    return n.split(/\s+/).length > 3 || NAME_TH.test(n.replace(/\s+/g, "").replace(TONE, "")) || NAME_EN.test(n) || NAME_ZH.test(n) ||
      (/\d/.test(n) && /\p{L}/u.test(n)) || soft(n);
  }
  /** (A) the text if it is a plain name, else "" (never echo anything else) @param {any} name */
  function plainName(name) {
    const n = String(name == null ? "" : name).trim();
    return n && n.length <= 40 && !softName(n) && !check(n) ? n : "";
  }
  const NAME_FIELDS = "#hsName, #hsPName, #hsNameNum, #frNick, #plNick, #nmName, #rpName";
  /** the page's fields need the soft step (and it has not been answered for exactly these values) @param {any} [doc] */
  function pageSoft(doc) {
    const all = fields(doc);
    if (!all || all === answered) return false;
    if (soft(all)) return true;
    try {
      const d = doc || root.document;
      return Array.from(d.querySelectorAll(NAME_FIELDS)).some(e => softName(e && e.value));
    } catch (e) { return false; }
  }
  let answered = "";
  /** the reader chose "Just the reading" for the current field values @param {any} [doc] */
  const ack = doc => { answered = fields(doc); };
  /** @type {Record<string, Record<string, string>>} */
  const SOFT_TEXT = {
    th: { title: "ข้อความนี้ฟังดูหนักใจ คุณโอเคไหม?", body: "ถ้ามีเรื่องหนักใจ มีคนพร้อมรับฟังเสมอ ถ้าแค่อยากดูดวง เลือกด้านล่างได้เลย",
      talk: "อยากคุยกับใคร", go: "แค่ถามดวง", qHidden: "(คำถามที่คุณพิมพ์ไว้)" },
    en: { title: "This sounds heavy — are you okay?", body: "If something is weighing on you, people are ready to listen. If you only want the reading, choose below.",
      talk: "I'd like to talk to someone", go: "Just the reading", qHidden: "(the question you typed)" },
    zh: { title: "这听起来很沉重，你还好吗？", body: "如果有心事，随时有人愿意倾听。如果只是想看解读，请在下面选择。", talk: "我想找人聊聊", go: "只是想算命", qHidden: "（你输入的问题）" },
  };
  const softText = (/** @type {string} */ lang) => SOFT_TEXT[lang === "en" || lang === "zh" ? lang : "th"];
  const SOFT_CSS = ".fa-soft{border:2px solid #fcd34d;border-radius:16px;padding:16px;margin:8px 0;background:rgba(252,211,77,.08)}.fa-soft h3{margin:0 0 .4em}" +
    ".fa-soft .fa-soft-act{display:flex;flex-wrap:wrap;gap:.6em;margin-top:.8em}.fa-soft button{min-height:44px;padding:.5em 1em;border-radius:12px;max-width:100%}";
  /** draw the soft step into box (textContent only) @param {any} box @param {string} lang @param {() => void} onGo @param {() => void} onTalk */
  function renderSoft(box, lang, onGo, onTalk) {
    const doc = box.ownerDocument || root.document, t = softText(lang || (root.LQI18N && root.LQI18N.lang) || "th");
    try {
      if (!doc.getElementById("fa-soft-style")) { const st = doc.createElement("style"); st.id = "fa-soft-style"; st.textContent = SOFT_CSS; doc.head.appendChild(st); }
    } catch (e) { /* no DOM */ }
    /** @param {string} tag @param {string} [text] */
    const el = (tag, text) => { const e = doc.createElement(tag); if (text) e.textContent = text; return e; };
    box.textContent = "";
    const sec = el("section"); sec.className = "fa-soft"; sec.setAttribute("role", "group");
    const h = el("h3", t.title), act = el("div"); act.className = "fa-soft-act";
    const talk = el("button", t.talk), go = el("button", t.go);
    talk.type = "button"; go.type = "button"; talk.className = "btn primary"; go.className = "btn ghost";
    talk.setAttribute("data-soft", "talk"); go.setAttribute("data-soft", "go");
    talk.addEventListener("click", () => onTalk()); go.addEventListener("click", () => onGo());
    act.appendChild(talk); act.appendChild(go); sec.appendChild(h); sec.appendChild(el("p", t.body)); sec.appendChild(act);
    box.appendChild(sec);
    try { h.tabIndex = -1; h.focus({ preventScroll: true }); } catch (e) { /* no DOM */ }
    return sec;
  }
  /** before a reading is drawn: ask first when needed; true when the step was shown
   *  @param {any} container @param {string} lang @param {() => void} proceed @param {(box: any) => void} card */
  function softGate(container, lang, proceed, card) {
    const doc = container && container.ownerDocument;
    if (!container || !pageSoft(doc)) return false;
    renderSoft(container, lang, () => { ack(doc); proceed(); }, () => card(container));
    return true;
  }
  /* ---------------- help line (owner order 2026-11-12) ----------------
     A calm line with real help resources on every fortune page and under every reading; it needs no detection.
     Numbers, hours and cost are only what docs/CRISIS-RESOURCES.md verified from official sources (checked 2026-11-12):
     1323 (Department of Mental Health: free, 24 hours) and 1669 (medical emergency; hours and cost not shown, not read
     directly on niems.go.th). No verified Chinese-language line exists in Thailand: the Chinese text says so.
     HELP is the canonical wording: tools/helpline.mjs writes the static Thai line into every fortune page (it shows
     without JavaScript), i18n/{en,zh}-common.js carry the same English / Chinese text under help.line.* (unit-tested). */
  /** @type {{tel: string[], th: Record<string, string>, en: Record<string, string>, zh: Record<string, string>}} */
  const HELP = {
    tel: ["1323", "1669"],
    th: { label: "สายด่วนช่วยเหลือ", lead: "ถ้ากำลังรู้สึกไม่ไหว โทรคุยได้ที่สายด่วนสุขภาพจิต", free: "ฟรี ตลอด 24 ชั่วโมง", emerg: "เจ็บป่วยฉุกเฉิน",
      note: "อยู่ต่างประเทศ โทรเบอร์ฉุกเฉินของประเทศนั้น" },
    en: { label: "Help lines", lead: "If things feel like too much, you can talk to someone: Thai mental health hotline", free: "free, 24 hours",
      emerg: "Medical emergency", note: "Outside Thailand, call your local emergency number." },
    zh: { label: "求助热线", lead: "如果你感觉撑不下去，可以打电话找人聊聊：泰国心理健康热线", free: "免费，24 小时", emerg: "医疗急救",
      note: "目前没有经核实的泰国中文热线；不在泰国时请拨打当地紧急电话。" },
  };
  /** the help line's parts in order: [kind, field or number] */
  const HELP_PARTS = [["t", "lead"], ["tel", "1323"], ["t", "free"], ["sep", ""], ["t", "emerg"], ["tel", "1669"], ["note", "note"]];
  const helpLang = (/** @type {any} */ l) => (l === "en" || l === "zh" ? l : "th");
  /** the help line as an element (textContent only). With the page's i18n present it is built in Thai with data-i18n keys
   *  and translated by LQI18N (so it follows later language switches); without it, in the given language.
   *  @param {any} [doc] @param {string} [lang] @param {string} [cls] extra class */
  function helpLine(doc, lang, cls) {
    const d = doc || root.document, I = /** @type {any} */ (root).LQI18N, i18n = !!(I && typeof I.apply === "function");
    const L = HELP[i18n ? "th" : helpLang(lang)];
    /** @param {string} tag @param {string} [c] @param {string} [t] */
    const el = (tag, c, t) => { const e = d.createElement(tag); if (c) e.className = c; if (t != null) e.textContent = t; return e; };
    const box = el("aside", "lq-helpline" + (cls ? " " + cls : ""));
    box.setAttribute("role", "note"); box.setAttribute("aria-label", L.label); box.setAttribute("data-i18n-attr", "aria-label:help.line.label");
    for (const [k, v] of HELP_PARTS) {
      if (k === "tel") { const a = el("a", "lq-helpline-tel", v); a.setAttribute("href", "tel:" + v); box.appendChild(a); }
      else if (k === "sep") { const x = el("span", "lq-helpline-sep", "·"); x.setAttribute("aria-hidden", "true"); box.appendChild(x); }
      else { const x = el("span", k === "note" ? "lq-helpline-note" : "", L[v]); x.setAttribute("data-i18n", "help.line." + v); box.appendChild(x); }
      if (k !== "note") box.appendChild(d.createTextNode(" "));
    }
    if (i18n) { try { I.apply(box); } catch (e) { /* i18n not ready: Thai stays */ } }
    return box;
  }
  const escH = (/** @type {any} */ s) => String(s).replace(/[&<>"]/g, c => (/** @type {Record<string, string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }))[c]);
  /** the help line as HTML in one language (Thai carries the data-i18n keys) @param {string} [lang] @param {string} [cls] */
  function helpHTML(lang, cls) {
    const l = helpLang(lang), L = HELP[l], key = (/** @type {string} */ k) => (l === "th" ? ' data-i18n="help.line.' + k + '"' : "");
    const parts = HELP_PARTS.map(([k, v]) => k === "tel" ? '<a class="lq-helpline-tel" href="tel:' + v + '">' + v + "</a>"
      : k === "sep" ? '<span class="lq-helpline-sep" aria-hidden="true">·</span>'
      : "<span" + (k === "note" ? ' class="lq-helpline-note"' : "") + key(v) + ">" + escH(L[v]) + "</span>");
    return '<aside class="lq-helpline' + (cls ? " " + escH(cls) : "") + '" role="note" aria-label="' + escH(L.label) + '"' +
      (l === "th" ? ' data-i18n-attr="aria-label:help.line.label"' : "") + ">" + parts.join(" ") + "</aside>";
  }

  /* ---------------- crisis state (owner order 2026-11-12) ----------------
     Once the support card has been shown on a page (hard net, or the soft step's "talk" path), the PAGE is in the crisis
     state until it is reloaded: FortuneAI shows the support card instead of any later reading, hooks (member, merit,
     paid services) do not run, and <html data-lq-crisis="1"> hides every block marked data-lq-remedy (lucky items,
     remedies, recommendations, lead forms, share cards) through styles.css. Any renderer of remedies, lucky items, paid
     or merit services or straight-mode readings must ask allow(kind) first. Page-level only: nothing is stored. */
  /** @type {WeakSet<object>|null} */
  const ACTIVE = typeof WeakSet !== "undefined" ? new WeakSet() : null;
  const CRISIS_CSS = "html[data-lq-crisis] [data-lq-remedy]{display:none!important}";
  /** @param {any} [doc] @returns {any} */
  const docOf = doc => doc || root.document || null;
  /** true when this page is in the crisis state @param {any} [doc] */
  function active(doc) {
    const d = docOf(doc);
    if (!d) return false;
    if (ACTIVE && typeof d === "object" && ACTIVE.has(d)) return true;
    try { return !!(d.documentElement && d.documentElement.getAttribute && d.documentElement.getAttribute("data-lq-crisis") === "1"); } catch (e) { return false; }
  }
  /** put this page into the crisis state (called when the support card is shown) @param {any} [doc] */
  function setActive(doc) {
    const d = docOf(doc);
    if (!d || typeof d !== "object") return;
    if (ACTIVE) ACTIVE.add(d);
    try { if (d.documentElement && d.documentElement.setAttribute) d.documentElement.setAttribute("data-lq-crisis", "1"); } catch (e) { /* no DOM */ }
    try {
      if (d.getElementById && !d.getElementById("lq-crisis-style") && d.head) { const st = d.createElement("style"); st.id = "lq-crisis-style"; st.textContent = CRISIS_CSS; d.head.appendChild(st); }
    } catch (e) { /* styles.css has the same rule */ }
    try { if (typeof root.dispatchEvent === "function" && typeof root.CustomEvent === "function") root.dispatchEvent(new root.CustomEvent("lq-crisis")); } catch (e) { /* no events */ }
  }
  /** may a renderer show this kind of content ("remedy" | "lucky" | "paid" | "merit" | "straight" | "reco" | "lead" | "share")?
   *  false while the page is in the crisis state @param {string} kind @param {any} [doc] */
  // eslint-disable-next-line no-unused-vars
  const allow = (kind, doc) => !active(doc);

  const api = { check, fields, soft, softName, plainName, pageSoft, ack, renderSoft, softGate, softText, HELP, helpLine, helpHTML, active, setActive, allow };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else /** @type {any} */ (root).LQFortuneCrisis = api;
})(typeof window !== "undefined" ? window : globalThis);
