/* compat-v2.js — Compatibility (ดวงสมพงษ์) v2, slice 1: a new way of showing the same reading. Behind LENSIQ_COMPAT_V2 (off unless
 * exactly true; off on the live site and in customer builds). compat-ui.js loads this file on demand only when the switch is on,
 * so with the switch off nothing here runs and the page is unchanged.
 * Spec: the owner's eight points of 2026-11-17 (~/Desktop/LENSIQ-review/compat-v2/PLAN-TH.md §1), night order A6 2026-11-20.
 * Slice 1 covers points 1 (each category: one plain sentence, then the reason from the methods, then what to do), 2 (a level per
 * category with a label, an icon and a colour, never colour alone; one overall harmony view; "not a verdict" line), 5 (free /
 * paid split unchanged: overview, all 7 levels and openers, every caution and its step free; detail of 2 categories free, the
 * other 5 only in the full tier, which needs LENSIQ_FORTUNE_PAID), 6 in part (no score figures, plan C3 ข) and 8 (hard limits,
 * crisis v3: compat-ui.js keeps the tier and the closing 1323 line). Not in this slice: A / B / together wording (point 3),
 * belief guidance (point 4), icon set and print / share (point 7), business wording (plan C4).
 * Sources: no new rule. The level is compat.js's per-category lean; "because" lines, cautions and steps are compat-kb.js texts
 * of the rules recorded in docs/COMPAT-SOURCES.md (each line starts with its method's name); a Vedic line drops its score
 * figure and keeps its meaning; each opener's source line names the methods whose own lean gives that level.
 * Locked tests (written first): tests/unit/compat-v2.test.js, tests/e2e/compat-v2.e2e.mjs (evals-locks/compat-v2.sha256).
 * No network call, no storage. Written for LENSIQ (no copied text). */
(function (root) {
  "use strict";
  const isNode = typeof module !== "undefined" && module.exports && typeof require === "function";
  const LQ = () => root.LQCompat || (isNode ? require("./compat.js") : null);
  const CATS = ["communication", "values", "money", "daily", "work", "decisions", "longterm"];
  const FREE = ["communication", "values"];
  const LEANS = ["fit", "mixed", "care"];

  // the owner's own example words (plan C2); EN / ZH as proposed in the plan
  const LABEL = {
    th: { fit: "เสริมกัน", mixed: "ไปด้วยกันได้", care: "ต้องใส่ใจ" },
    en: { fit: "Supports each other", mixed: "Goes along well enough", care: "Needs some care" },
    zh: { fit: "相互助力", mixed: "可以同行", care: "需要留心" },
  };
  const NOT_VERDICT = {
    th: "ระดับนี้บอกว่าเรื่องไหนควรใส่ใจ ไม่ใช่คำตัดสินความสัมพันธ์",
    en: "These levels show where to put care; they are not a verdict on the relationship.",
    zh: "这些等级只说明哪里需要用心，并不是对关系的评判。",
  };
  // level icons, 24x24 stroke (drawn for LENSIQ): two linked rings, two arrows side by side, a heart (care, never a warning sign)
  const ICONS = {
    fit: "M3 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0M12 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0",
    mixed: "M4 8h12M13 5l3 3-3 3M4 16h12M13 13l3 3-3 3",
    care: "M12 20c-4-2.6-7-5.6-7-9.4A3.8 3.8 0 0 1 12 8.4a3.8 3.8 0 0 1 7 2.2c0 3.8-3 6.8-7 9.4z",
  };
  // no red for "care": teal, gold, indigo (AA on white next to their text label)
  const COLOR = { fit: "#0f766e", mixed: "#8a5a00", care: "#5b21b6" };

  const T = {
    th: {
      harmonyH: "ภาพรวมความกลมกลืน", levelsH: "เจ็ดเรื่องสำคัญ", heartH: "ช่วยกันให้แน่นขึ้น ทีละเรื่อง", because: "เพราะ", care: "ควรใส่ใจ",
      todo: "ทำด้วยกัน", step: "วิธีรับมือ: {s}", methodsH: "แต่ละศาสตร์ว่าอย่างไร", list: ", ",
      fitList: "เรื่องที่เสริมกัน: {list}", careList: "เรื่องที่ต้องใส่ใจ: {list}", allMixed: "ทุกเรื่องอยู่ในระดับไปด้วยกันได้ มีทั้งจุดที่ตรงกันและจุดที่ต้องคุยกัน",
      none: "ไม่มีเรื่องที่ต้องใส่ใจเป็นพิเศษ ดูวิธีดูแลกันต่อได้ในแต่ละเรื่องด้านล่าง", minor: "บางเรื่องมีจุดเล็ก ๆ ที่ควรใส่ใจ ดูวิธีรับมือได้ในแต่ละเรื่องด้านล่าง",
      srcAgree: "ที่มา: ระดับนี้มาจากผลของ{list}", srcBoth: "ที่มา: ระดับนี้มาจากผลของ{list} ส่วน{diff}", srcSplit: "ที่มา: {diff} เมื่อรวมผลทุกศาสตร์จึงอยู่ระดับนี้", srcSplitQuiet: "ที่มา: {diff} ส่วนศาสตร์อื่นไม่ได้ชี้เรื่องนี้ เมื่อรวมกันจึงอยู่ระดับนี้", diffOne: "{m}ว่า \"{label}\"", srcNone: "ที่มา: ไม่มีศาสตร์ใดชี้เรื่องนี้เป็นพิเศษ จึงอยู่ระดับกลาง",
      vFit: "{k} อยู่ในเกณฑ์ดี", vCare: "{k} อยู่ในจุดที่ตำราให้ใส่ใจ",
      gloss: { varna: "วรรณะ (มาตรฐานชีวิต)", vashya: "วัศยะ (การยอมฟังกัน)", tara: "ดารา (จังหวะดาวประจำวันเกิด)", yoni: "โยนี (นิสัยพื้นฐาน)",
        maitri: "เคราะห์ไมตรี (ดาวเจ้าเรือนจันทร์)", bhakoot: "ภกูฏ (ตำแหน่งราศีจันทร์ของสองคน)", nadi: "นาฑี (จังหวะพลังกาย)" },
    },
    en: {
      harmonyH: "Overall harmony", levelsH: "Seven areas", heartH: "Making it stronger, area by area", because: "Why", care: "Worth some care",
      todo: "Together", step: "What to do: {s}", methodsH: "What each method says", list: ", ",
      fitList: "Areas that support each other: {list}", careList: "Areas that need some care: {list}", allMixed: "Every area goes along well enough: some things match and some need talking through.",
      none: "Nothing needs special care. Each area below shows how to keep things going well.", minor: "A few areas have small points worth some care; each area below shows what to do.",
      srcAgree: "Source: this level comes from {list}.", srcBoth: "Source: this level comes from {list}; {diff}.", srcSplit: "Source: {diff}; taken together, the methods come to this level.", srcSplitQuiet: "Source: {diff}; no other method gives a sign here, so taken together this is the level.", diffOne: "{m} says \"{label}\"", srcNone: "Source: no method points to anything special here, so it sits in the middle.",
      vFit: "{k} is in a good range", vCare: "{k} is a point the tradition asks you to watch",
      gloss: { varna: "Varna (life standards)", vashya: "Vashya (mutual pull)", tara: "Tara (birth-star rhythm)", yoni: "Yoni (basic nature)",
        maitri: "Graha Maitri (Moon-sign rulers)", bhakoot: "Bhakoot (Moon-sign positions)", nadi: "Nadi (energy rhythm)" },
    },
    zh: {
      harmonyH: "整体和谐", levelsH: "七个方面", heartH: "一项一项，让彼此更契合", because: "依据", care: "需要留心",
      todo: "一起做", step: "应对方法：{s}", methodsH: "各派怎么看", list: "、",
      fitList: "相互助力的方面：{list}", careList: "需要留心的方面：{list}", allMixed: "每个方面都可以同行，有相合之处，也有需要沟通的地方。",
      none: "没有特别需要留心的方面，下面每一项都说明了如何继续相处得好。", minor: "有几个方面有些小地方值得留心，下面每一项都写了应对方法。",
      srcAgree: "依据：这个等级来自{list}的结果。", srcBoth: "依据：这个等级来自{list}的结果；{diff}。", srcSplit: "依据：{diff}，合起来是这个等级。", srcSplitQuiet: "依据：{diff}，其余各派在这方面没有特别指向，合起来是这个等级。", diffOne: "{m}认为“{label}”", srcNone: "依据：各派在这方面都没有特别的指向，所以居中。",
      vFit: "{k}情况良好", vCare: "{k}是传统上提醒留心的一项",
      gloss: { varna: "Varna（品格）", vashya: "Vashya（相互吸引）", tara: "Tara（星运）", yoni: "Yoni（本性）",
        maitri: "Graha Maitri（心性）", bhakoot: "Bhakoot（家运）", nadi: "Nadi（节律）" },
    },
  };

  /* one plain sentence per category and level: how the two fit in that area (rel-neutral, for couples, family, friends, partners) */
  const OPEN = {
    th: {
      communication: { fit: "{a} กับ {b} คุยกันเข้าใจง่าย พูดยังไม่ทันจบอีกฝ่ายก็มักจับใจความได้", mixed: "{a} กับ {b} คุยกันรู้เรื่อง แต่บางเรื่องต้องถามย้ำให้แน่ใจว่าเข้าใจตรงกัน",
        care: "{a} กับ {b} มีวิธีพูดและวิธีฟังต่างกัน เรื่องเดียวกันจึงอาจเข้าใจไปคนละทาง ถ้าตกลงวิธีคุยกันไว้ก็ช่วยได้มาก" },
      values: { fit: "{a} กับ {b} ให้คุณค่ากับเรื่องคล้ายกัน เวลาต้องเลือกจึงมักเห็นทางเดียวกัน", mixed: "{a} กับ {b} มีเรื่องที่ให้ความสำคัญตรงกันอยู่หลายเรื่อง และมีบางเรื่องที่มองต่างกัน",
        care: "{a} กับ {b} ให้น้ำหนักกับเรื่องต่าง ๆ ไม่เท่ากัน การรู้ว่าอะไรสำคัญกับอีกฝ่ายจะช่วยให้เคารพกันง่ายขึ้น" },
      money: { fit: "เรื่องเงิน {a} กับ {b} คิดไปในทางเดียวกัน วางแผนใช้จ่ายร่วมกันได้ไม่ยาก", mixed: "เรื่องเงิน {a} กับ {b} มีทั้งจุดที่คิดตรงกันและจุดที่ต่างกัน ตกลงกติกากลางไว้แล้วจะสบายใจทั้งสองฝ่าย",
        care: "เรื่องเงิน {a} กับ {b} มีวิธีคิดต่างกันชัด จึงควรคุยเรื่องเงินกันอย่างเปิดเผยและสม่ำเสมอ" },
      daily: { fit: "ในชีวิตประจำวัน {a} กับ {b} มีจังหวะใกล้กัน ทำอะไรร่วมกันได้ราบรื่น", mixed: "ในชีวิตประจำวัน {a} กับ {b} เข้ากันได้ในหลายเรื่อง และมีบางความเคยชินที่ต้องเผื่อใจให้กัน",
        care: "ในชีวิตประจำวัน {a} กับ {b} มีจังหวะต่างกัน ถ้าแบ่งเวลาและหน้าที่ให้ชัดจะลดเรื่องกระทบกันได้มาก" },
      work: { fit: "เวลาทำงานด้วยกัน {a} กับ {b} เติมกันได้ดี คนหนึ่งเริ่ม อีกคนช่วยพาไปจนเสร็จ", mixed: "เวลาทำงานด้วยกัน {a} กับ {b} ไปด้วยกันได้ ถ้าตกลงหน้าที่ของแต่ละคนกันตั้งแต่ต้น",
        care: "เวลาทำงานด้วยกัน {a} กับ {b} มีสไตล์ต่างกัน แบ่งส่วนงานให้ชัดแล้วต่างคนจะได้ทำในแบบที่ถนัด" },
      decisions: { fit: "เวลาต้องตัดสินใจ {a} กับ {b} มักเห็นตรงกันและตกลงกันได้เร็ว", mixed: "เวลาต้องตัดสินใจ {a} กับ {b} บางเรื่องตกลงกันได้ทันที บางเรื่องต้องให้เวลาคิด",
        care: "เวลาต้องตัดสินใจ {a} กับ {b} ชั่งน้ำหนักต่างกัน ตกลงกันก่อนว่าเรื่องไหนใครตัดสิน และเรื่องไหนต้องคุยกันก่อน" },
      longterm: { fit: "เรื่องแผนระยะยาว {a} กับ {b} มองไปทางเดียวกัน ช่วยกันพาเป้าหมายไปถึงได้", mixed: "เรื่องแผนระยะยาว {a} กับ {b} มีเป้าหมายที่ไปด้วยกันได้ และมีบางเรื่องที่ต้องทบทวนกันเป็นระยะ",
        care: "เรื่องแผนระยะยาว {a} กับ {b} อาจวาดภาพอนาคตไม่เหมือนกัน การวางเป้าหมายร่วมไว้สองสามข้อจะช่วยให้เดินไปทางเดียวกัน" },
    },
    en: {
      communication: { fit: "{a} and {b} understand each other easily; one often gets the point before the other has finished.", mixed: "{a} and {b} get through to each other, though some things need a quick check that you mean the same.",
        care: "{a} and {b} speak and listen in different ways, so the same words can land differently; agreeing how you talk helps a lot." },
      values: { fit: "{a} and {b} value similar things, so when a choice comes you often lean the same way.", mixed: "{a} and {b} share several things you both care about, and see a few others differently.",
        care: "{a} and {b} weigh things differently; knowing what matters most to the other makes respect easier." },
      money: { fit: "On money, {a} and {b} think along the same lines, so planning spending together comes easily.", mixed: "On money, {a} and {b} agree on some points and differ on others; a shared ground rule puts you both at ease.",
        care: "On money, {a} and {b} think quite differently, so talk about money openly and regularly." },
      daily: { fit: "Day to day, {a} and {b} keep a similar rhythm, so doing things together runs smoothly.", mixed: "Day to day, {a} and {b} fit in many ways, with a few routines that need some give and take.",
        care: "Day to day, {a} and {b} run on different rhythms; clear shares of time and tasks take away most of the friction." },
      work: { fit: "Working together, {a} and {b} complement each other: one starts things, the other helps see them through.", mixed: "Working together, {a} and {b} get along fine, as long as you agree roles at the start.",
        care: "Working together, {a} and {b} have different styles; a clear split of tasks lets each work the way that suits them." },
      decisions: { fit: "When a decision is due, {a} and {b} usually see it the same way and settle quickly.", mixed: "When a decision is due, {a} and {b} agree on some at once and need time on others.",
        care: "When a decision is due, {a} and {b} weigh things differently; agree first who decides what, and what needs a talk first." },
      longterm: { fit: "For the long term, {a} and {b} look in the same direction and can carry goals through together.", mixed: "For the long term, {a} and {b} share goals that can go together, with some to review now and then.",
        care: "For the long term, {a} and {b} may picture the future differently; two or three shared goals help you walk the same way." },
    },
    zh: {
      communication: { fit: "{a}和{b}沟通顺畅，话没说完对方往往就明白了。", mixed: "{a}和{b}基本说得通，但有些事要再确认一下是否理解一致。",
        care: "{a}和{b}说话和倾听的方式不同，同一句话可能理解不一样；先约定沟通方式会很有帮助。" },
      values: { fit: "{a}和{b}看重的东西相近，遇到选择时常常想法一致。", mixed: "{a}和{b}有不少共同看重的事，也有几件看法不同。",
        care: "{a}和{b}衡量事情的轻重不同；了解对方最看重什么，会更容易互相尊重。" },
      money: { fit: "在金钱上，{a}和{b}想法一致，一起规划开支并不难。", mixed: "在金钱上，{a}和{b}有相同也有不同的看法，定好共同规则，两人都安心。",
        care: "在金钱上，{a}和{b}想法差别明显，宜坦诚并定期地谈钱。" },
      daily: { fit: "日常生活中，{a}和{b}节奏相近，一起做事很顺。", mixed: "日常生活中，{a}和{b}在很多方面合得来，有些习惯需要互相包容。",
        care: "日常生活中，{a}和{b}节奏不同，把时间和分工说清楚，就能少很多摩擦。" },
      work: { fit: "一起做事时，{a}和{b}互补，一人起头，一人帮忙做完。", mixed: "一起做事时，{a}和{b}可以配合，前提是一开始就分好角色。",
        care: "一起做事时，{a}和{b}风格不同，分工清楚，各自就能用擅长的方式做事。" },
      decisions: { fit: "需要做决定时，{a}和{b}常常看法一致，很快就能定下来。", mixed: "需要做决定时，{a}和{b}有些事马上能定，有些事需要时间考虑。",
        care: "需要做决定时，{a}和{b}权衡方式不同；先约定哪些事由谁决定，哪些事要先商量。" },
      longterm: { fit: "长远来看，{a}和{b}方向一致，能一起把目标走到底。", mixed: "长远来看，{a}和{b}有可以同行的目标，也有一些需要定期回顾。",
        care: "长远来看，{a}和{b}对未来的设想可能不同；定两三个共同目标，有助于朝同一方向走。" },
    },
  };

  const langOf = l => (l === "en" || l === "zh" ? l : "th");
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m));
  const SEP = lang => (lang === "zh" ? "：" : ": ");
  /** a Vedic line without its score figure: "<method>: <koota> <score>: <meaning>" -> "<method>: <koota (gloss)> <in range / to watch>: <meaning>" */
  function vedicLine(text, lang, K, care) {
    const pre = K.METHOD.vedic.short[lang] + SEP(lang);
    if (!text.startsWith(pre)) return text;
    const rest = text.slice(pre.length), i = rest.indexOf(SEP(lang));
    if (i < 0) return text;
    const head = rest.slice(0, i), meaning = rest.slice(i + SEP(lang).length);
    const k = Object.keys(T[lang].gloss).find(x => head.startsWith(K.NAMES.koota[lang][x]));
    if (!k) return text;
    return pre + fill(care ? T[lang].vCare : T[lang].vFit, { k: T[lang].gloss[k] }) + SEP(lang) + meaning;
  }
  /** one signal's text, as compat.js words it (compat.js keeps its own copy private and must stay byte-identical) */
  function nameVal(o, lang, K, STEM_EL) {
    if (o == null || typeof o !== "object") return o;
    const N = K.NAMES;
    if (o.day != null) return N.day[lang][o.day];
    if (o.animal != null) return N.animal[lang][o.animal];
    if (o.branch != null) return N.branch[o.branch] + (lang === "zh" ? "" : " (" + N.animal[lang][o.branch] + ")");
    if (o.stem != null) return N.stem[o.stem] + (lang === "zh" ? "" : " (" + N.el5[lang][STEM_EL[o.stem]] + ")");
    if (o.el5) return N.el5[lang][o.el5];
    if (o.el4) return N.el4[lang][o.el4];
    if (o.yel) return N.yel[lang][o.yel];
    if (o.koota) return N.koota[lang][o.koota];
    if (o.planet) return N.planet[lang][o.planet];
    if (o.aspect) return N.aspect[lang][o.aspect];
    return "";
  }
  function sigText(g, lang, names, L) {
    const K = L.KB, S = K.S[g.id] && K.S[g.id][lang];
    if (!S) return null;
    const v = { a: names[g.swap ? 1 : 0], b: names[g.swap ? 0 : 1] };
    for (const k of Object.keys(g.v || {})) v[k] = typeof g.v[k] === "object" ? nameVal(g.v[k], lang, K, L.bazi.STEM_EL) : (typeof g.v[k] === "number" ? (Math.round(g.v[k] * 10) / 10).toString().replace(/\.0$/, "") : g.v[k]);
    if (g.id.startsWith("bazi.br.")) {
      const BR = K.BR[lang];
      v.w = BR.w[g.where]; v.rel = K.NAMES.brRel[lang][g.rel];
      if (g.pol === "fit") v.where_fit = BR.fit[g.where]; else { v.where_care = BR.care[g.rel][g.where]; v.where_step = (g.where === "year" ? BR.stepYear : BR.step)[g.rel]; }
    }
    const pre = K.METHOD[g.m].short[lang] + SEP(lang), txt = g.pol === "fit" ? S.f : S.c;
    return txt ? pre + fill(txt, v) : null;
  }
  const SCOREY = /\d+(?:\.\d+)?\s*(?:\/|จาก|of)\s*\d+|%|คะแนน|\bscor\w*|\d\s*points?\b|满分|得分|分数|原始分|\d\s*分/i;
  const methodName = s => String(s).replace(/\s*[（(][^)）]*(?:30|คะแนน)[^)）]*[)）]/, "");

  /** the v2 view of a pair result (null for a group: the group page stays v1 in this slice) */
  function view(res, opts) {
    opts = opts || {};
    if (!res || res.kind !== "pair") return null;
    const L = LQ(), K = L.KB, lang = langOf(opts.lang), tier = opts.tier === "full" ? "full" : "free", t = T[lang];
    const base = { lang, names: opts.names, rel: opts.rel || res.rel };
    const full = L.report(res, Object.assign({ tier: "full" }, base)), shown = L.report(res, Object.assign({ tier }, base));
    const names = full.names;
    const levels = CATS.map(cat => {
      const lean = res.categories[cat].lean;
      return { cat, title: K.CAT[cat][lang], lean, label: LABEL[lang][lean], icon: ICONS[lean], color: COLOR[lean] };
    });
    const cats = CATS.map((cat, idx) => {
      const c = res.categories[cat], s = full.sections.find(x => x.id === cat), lean = c.lean;
      // a method counts for the source line only when it gives a sign in this area (a silent method only weighs as "mixed")
      const spoke = L.METHODS.filter(m => c.byMethod[m] != null && c.signals.some(g => g.m === m)), agree = spoke.filter(m => c.byMethod[m] === lean);
      const short = ms => ms.map(m => K.METHOD[m].short[lang]).join(t.list);
      // each method that differs is named with its own level; a method with no sign here is never named (review F3)
      const differ = spoke.filter(m => c.byMethod[m] !== lean);
      const diff = differ.map(m => fill(t.diffOne, { m: K.METHOD[m].short[lang], label: LABEL[lang][c.byMethod[m]] })).join(lang === "en" ? "; " : t.list);
      const quiet = computed => computed.some(m => !spoke.includes(m));
      const source = !spoke.length ? t.srcNone : !differ.length ? fill(t.srcAgree, { list: short(agree) }) : agree.length ? fill(t.srcBoth, { list: short(agree), diff })
        : fill(quiet(L.METHODS.filter(m => c.byMethod[m] != null)) ? t.srcSplitQuiet : t.srcSplit, { diff });
      const detail = tier === "full" || FREE.includes(cat);
      // the reason: the strongest signs touching this area (its own cautions are listed below it, with their steps)
      const because = [], seen = new Set();
      if (detail) for (const g of c.signals.slice().sort((x, y) => y.w - x.w)) {
        if (g.pol !== "fit" && g.cats[0] === cat) continue;
        const key = g.id + ":" + g.pol + ":" + (g.where || "") + ":" + (g.rel || "");
        if (seen.has(key)) continue;
        const x = sigText(g, lang, names, L);
        if (!x) continue;
        seen.add(key); because.push(vedicLine(x, lang, K, g.pol !== "fit"));
        if (because.length >= 2) break;
      }
      const cautions = s.care.map((x, i) => ({ text: vedicLine(x, lang, K, true), step: s.steps[i] }));
      const todo = detail ? K.GEN[cat][lang].a.slice() : [];
      return { id: cat, title: levels[idx].title, lean, label: LABEL[lang][lean], icon: ICONS[lean], catIcon: K.CAT[cat].icon, color: COLOR[lean],
        opener: fill(OPEN[lang][cat][lean], { a: names[0], b: names[1] }), source, detail, paid: tier === "full" && !FREE.includes(cat), because, cautions, todo };
    });
    const fitCats = cats.filter(c => c.lean === "fit"), careCats = cats.filter(c => c.lean === "care"), anyCaution = cats.some(c => c.cautions.length);
    const lines = [];
    if (fitCats.length) lines.push(fill(t.fitList, { list: fitCats.map(c => c.title).join(t.list) }));
    if (careCats.length) lines.push(fill(t.careList, { list: careCats.map(c => c.title).join(t.list) }));
    if (!fitCats.length && !careCats.length) lines.push(t.allMixed);
    if (!careCats.length) lines.push(anyCaution ? t.minor : t.none);
    const lean = full.overview.lean;
    const methods = shown.overview.methods.map(m => ({ id: m.id, name: methodName(m.name), lines: m.detail.filter(x => !SCOREY.test(x) && x !== K.T[lang].guide) }));
    return { v: 2, lang, tier, mode: "pair", title: full.overview.title, names, workUse: full.workUse,
      harmony: { lean, word: LABEL[lang][lean], icon: ICONS[lean], color: COLOR[lean], lines }, notVerdict: NOT_VERDICT[lang], levels, cats, methods };
  }

  /* ---------------- drawing (browser only) ---------------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const svg = (d, attr) => '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"' + (attr || "") + '><path d="' + esc(d) +
    '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CSS = ".cv2{display:grid;gap:12px}.cv2 h3{margin:0 0 8px}.cv2-hrow{display:flex;gap:14px;align-items:center;flex-wrap:wrap}" +
    ".cv2-donut{width:112px;height:112px;flex:none}.cv2-hword{display:flex;align-items:center;gap:6px;margin:0 0 6px;font-size:1.15rem;color:var(--lv-color)}" +
    ".cv2-hrow>div{flex:1 1 180px;min-width:0}.cv2-hrow p{margin:.3em 0;line-height:1.6;overflow-wrap:anywhere}" +
    ".cv2-levels ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}" +
    ".cv2-levels li{display:grid;grid-template-columns:22px minmax(0,1fr) auto;grid-template-areas:'ic t lab' '. bar bar';gap:4px 8px;align-items:center}" +
    ".cv2-cic{grid-area:ic;display:inline-flex;color:#4b5375}.cv2-t{grid-area:t;font-weight:600;overflow-wrap:anywhere}" +
    ".cv2-lab{grid-area:lab;display:inline-flex;align-items:center;gap:4px;color:var(--lv-color);font-weight:600;font-size:.9rem;text-align:right}" +
    ".cv2-bar{grid-area:bar;display:grid;grid-template-columns:repeat(3,1fr);gap:3px}.cv2-bar i{height:8px;border-radius:4px;background:#e4e2ee}" +
    ".cv2-bar i.on{background:var(--lv-color)}.cv2-nv{margin:10px 0 0}" +
    ".cv2-cat{border-left-color:var(--lv-color)}.cv2-cat h4{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin:0 0 6px;font-size:1.05rem}" +
    ".cv2-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;border:1px solid var(--lv-color);color:var(--lv-color);font-size:.8rem;font-weight:600}" +
    ".cv2-chip svg{width:16px;height:16px}.cv2-open{font-weight:600}.cv2-src{margin-top:0}" +
    ".cv2-methods summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600}.cv2-methods ul{padding-left:1.2em;line-height:1.7}";
  function donut(v) {
    const n = v.levels.length, cx = 56, cy = 56, R = 50, r = 32, parts = [];
    v.levels.forEach((x, i) => {
      const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + 0.04, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - 0.04;
      const p = (rad, a) => (cx + rad * Math.cos(a)).toFixed(1) + " " + (cy + rad * Math.sin(a)).toFixed(1);
      parts.push('<path d="M' + p(R, a0) + " A" + R + " " + R + " 0 0 1 " + p(R, a1) + " L" + p(r, a1) + " A" + r + " " + r + " 0 0 0 " + p(r, a0) + 'Z" fill="' + x.color + '"><title>' +
        esc(x.title + ": " + x.label) + "</title></path>");
    });
    return '<svg class="cv2-donut" viewBox="0 0 112 112" role="img" aria-label="' + esc(v.levels.map(x => x.title + ": " + x.label).join(", ")) + '">' + parts.join("") +
      '<g transform="translate(44 44)" style="color:' + v.harmony.color + '"><path d="' + esc(v.harmony.icon) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g></svg>';
  }
  const ON = { fit: 3, mixed: 2, care: 1 };
  /** draws the v2 view of a pair into the result box (compat-ui.js adds the crisis closing line after it) */
  function render(box, ctx) {
    const D = ctx.doc || root.document, v = view(ctx.res, { lang: ctx.lang, tier: ctx.tier, names: ctx.names, rel: ctx.res.rel });
    if (!v) return false;
    if (!D.getElementById("cv2Css")) { const st = D.createElement("style"); st.id = "cv2Css"; st.textContent = CSS; D.head.appendChild(st); }
    const t = T[v.lang];
    let h = '<div class="cv2" data-cv2>';
    h += '<section class="cp-ov fk-block cv2-ov" data-compat-overview data-cv2-harmony data-lq-shareable="compat-overview" data-lq-printable style="--lv-color:' + v.harmony.color + '">' +
      '<h2 tabindex="-1" id="cpResTitle">' + esc(v.title) + "</h2><h3>" + esc(t.harmonyH) + '</h3><div class="cv2-hrow">' + donut(v) + '<div><p class="cv2-hword">' +
      svg(v.harmony.icon) + "<b>" + esc(v.harmony.word) + "</b></p>" + v.harmony.lines.map(l => "<p>" + esc(l) + "</p>").join("") + "</div></div></section>";
    h += '<section class="fk-block cv2-levels"><h3>' + esc(t.levelsH) + "</h3><ul>" + v.levels.map(x => '<li data-cv2-level data-cat="' + x.cat + '" data-lean="' + x.lean +
      '" style="--lv-color:' + x.color + '"><span class="cv2-cic">' + svg(v.cats.find(c => c.id === x.cat).catIcon) + '</span><span class="cv2-t">' + esc(x.title) +
      '</span><span class="cv2-lab">' + svg(x.icon, " data-cv2-icon") + "<span data-cv2-label>" + esc(x.label) + '</span></span><span class="cv2-bar" aria-hidden="true">' +
      [1, 2, 3].map(k => "<i" + (k <= ON[x.lean] ? ' class="on"' : "") + "></i>").join("") + "</span></li>").join("") + '</ul><p class="fk-small cv2-nv" data-cv2-notverdict>' +
      esc(v.notVerdict) + "</p></section>";
    if (v.workUse) h += '<p class="cp-workuse" data-compat-workuse>' + esc(v.workUse) + "</p>";
    h += '<div class="cp-cats cv2-heart"><h3 class="cp-catsh">' + esc(t.heartH) + "</h3>" + v.cats.map(c => {
      let s = '<section class="cp-cat fk-block cv2-cat" data-cv2-cat data-section="' + c.id + '" data-lean="' + c.lean + '"' + (c.paid ? ' data-lq-paid="compat"' : "") +
        ' style="--lv-color:' + c.color + ';--cat-color:' + c.color + '"><h4><span class="cp-ic">' + svg(c.catIcon) + "</span>" + esc(c.title) +
        ' <span class="cv2-chip">' + svg(c.icon) + esc(c.label) + '</span></h4><p class="cv2-open" data-cv2-opener>' + esc(c.opener) + '</p><p class="fk-small cv2-src" data-cv2-source>' +
        esc(c.source) + "</p>";
      if (c.because.length) s += '<p class="cp-sub">' + esc(t.because) + '</p><ul data-cv2-because>' + c.because.map(b => "<li>" + esc(b) + "</li>").join("") + "</ul>";
      if (c.cautions.length) s += '<p class="cp-sub">' + esc(t.care) + "</p>" + c.cautions.map(k => '<p class="lq-caution">' + esc(k.text) + '<br><span class="cp-step">' +
        esc(fill(t.step, { s: k.step })) + "</span></p>").join("");
      if (c.todo.length) s += '<p class="cp-sub">' + esc(t.todo) + '</p><ul data-cv2-todo>' + c.todo.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul>";
      return s + "</section>";
    }).join("") + "</div>";
    h += '<details class="fk-block cv2-methods"><summary>' + esc(t.methodsH) + "</summary>" + v.methods.map(m => "<h4>" + esc(m.name) + "</h4><ul>" +
      m.lines.map(l => "<li>" + esc(l) + "</li>").join("") + "</ul>").join("") + "</details></div>";
    box.insertAdjacentHTML("beforeend", h);
    return true;
  }

  const api = { CATS, FREE, LEANS, LABEL, NOT_VERDICT, ICONS, COLOR, T, OPEN, view, render };
  if (isNode) module.exports = api; else root.LQCompatV2 = api;
})(typeof window !== "undefined" ? window : globalThis);
