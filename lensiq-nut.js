/* lensiq-nut.js — LQNut: pure logic of the Nutrition label reader (Nutrition MVP, label mode; docs/NUTRITION-DESIGN.md §2.2,
 * §4.4). Browser: window.LQNut · Node: module.exports (no DOM, no network; unit-tested in tests/unit/nut.test.js).
 *
 * WHAT IT IS: turns the lines of a nutrition panel (from the on-device OCR, or typed by the user) into the values AS PRINTED,
 * each with its basis (per serving / per 100 g / per 100 ml / per pack), the line it came from and a status:
 *   "read"  — found and consistent;  "check" — please check (low OCR confidence, a missing or odd unit, an implausible
 *   number, energy far from the macros, two different values for one field). A value is never corrected automatically.
 * Fields that are not printed are listed in `notFound` and are never shown as zero.
 * WHAT IT IS NOT: no judgement of a food, no score, no advice. Converted values (kJ -> kcal, salt -> sodium) and the
 * amount-eaten calculation are separate functions whose results are always marked as calculated by LENSIQ.
 *
 *   norm(text)                  Thai / full-width digits -> ASCII, decimal comma -> point, thousands comma removed
 *   parseLabel(lines)           lines: string[] | {text, conf}[] -> {format, basis, items, serving, servingsPerPack, allergen,
 *                               notFound, gdaSplit}
 *   convert(item)               kJ -> kcal (÷ 4.184), salt g -> sodium mg (÷ 2.5 × 1000); {converted: true}; else null
 *   recalc(parsed, amount)      amount {kind: "servings"|"pack"|"half"|"g"|"ml", n} -> {ok, rows} | {ok: false, reason}
 *                               (reasons: no-serving-weight, no-servings-per-pack, no-basis). Never guesses a weight.
 *   round(value, unit)          whole kcal / kJ / mg / µg, 0.1 g / ml
 *   findAllergenWords(text)     allergen words in a statement (longest match first)
 * Label-format references (parsing only; dated): MoPH Notifications No. 445 (B.E. 2566, Thai panel, replaces No. 182;
 * fibre optional), No. 182 (old panel, still on shelves until 2027), No. 394 / 446 (GDA, per pack), No. 450 (B.E. 2567,
 * allergens); 21 CFR 101.9 (US); Reg. (EU) 1169/2011 (salt, kJ / kcal); GB 28050 (China, kJ); Japan Food Labelling
 * Standard (食塩相当量). Read from secondary summaries on 2026-11-10 (design §4.4); to be re-read from the official texts in N1.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else /** @type {any} */ (root).LQNut = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const FIELDS = ["energy_kcal", "energy_kj", "fat", "satfat", "protein", "carb", "sugar", "fibre", "sodium", "salt"];
  const UNIT_OF = { energy_kcal: "kcal", energy_kj: "kJ", fat: "g", satfat: "g", protein: "g", carb: "g", sugar: "g", fibre: "g", sodium: "mg", salt: "g" };
  /** fields listed as "not found" when absent, per format */
  const CORE = {
    "th-new": ["energy_kcal", "fat", "satfat", "protein", "carb", "sugar", "fibre", "sodium"],
    "th-old": ["energy_kcal", "fat", "satfat", "protein", "carb", "sugar", "fibre", "sodium"],
    "th-gda": ["energy_kcal", "sugar", "fat", "sodium"],
    us: ["energy_kcal", "fat", "satfat", "protein", "carb", "sugar", "fibre", "sodium"],
    eu: ["energy_kcal", "fat", "satfat", "protein", "carb", "sugar", "fibre", "salt"],
    cn: ["energy_kcal", "fat", "satfat", "protein", "carb", "sugar", "fibre", "sodium"],
    jp: ["energy_kcal", "fat", "satfat", "protein", "carb", "sugar", "fibre", "salt"],
    generic: ["energy_kcal", "fat", "satfat", "protein", "carb", "sugar", "fibre", "sodium"]
  };

  /* ---------- normalisation ---------- */
  const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
  function norm(s) {
    let t = String(s == null ? "" : s);
    t = t.replace(/[๐-๙]/g, d => String(THAI_DIGITS.indexOf(d)));
    t = t.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xff10 + 48)).replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/％/g, "%").replace(/＜/g, "<").replace(/．/g, ".").replace(/，(?=\d)/g, ",").replace(/μ/g, "µ");
    t = t.replace(/(\d),(\d{3})(?!\d)/g, "$1$2"); // thousands separator: 1,160 -> 1160
    t = t.replace(/(\d),(\d{1,2})(?!\d)/g, "$1.$2"); // decimal comma: 3,6 -> 3.6
    return t.replace(/[ \t 　]+/g, " ").trim();
  }

  /* ---------- labels (anchored at the start of a line, after leading dashes / bullets) ---------- */
  const W = "(?![a-z])"; // latin word end
  const LABELS = [
    [new RegExp(`^(พลังงานจากไขมัน|calories from fat${W}|energy from fat${W})`, "i"), null],
    [new RegExp(`^(ไขมันทรานส์|trans fat${W}|反式脂肪|トランス脂肪酸)`, "i"), null],
    [new RegExp(`^(คอเลสเตอรอล|โคเลสเตอรอล|cholesterol${W}|胆固醇|コレステロール)`, "i"), null],
    [new RegExp(`^(โพแทสเซียม|potassium${W}|钾|カリウム)`, "i"), null],
    [new RegExp(`^(includes?${W}|incl\\.|added sugars?${W})`, "i"), null],
    [/^(糖質|糖质)/, null],
    [new RegExp(`^(ไขมันอ[\u0E34-\u0E37\u0E47-\u0E4B]{0,3}มตัว|saturated fat${W}|of which saturates${W}|saturates${W}|sat\\.? fat${W}|饱和脂肪|飽和脂肪酸|포화지방|lemak tepu)`, "i"), "satfat"],
    [new RegExp(`^(ไขมันทั้งหมด|ไขมัน(?![\u0E01-\u0E4E])|total fat${W}|fat${W}|脂肪|脂質|지방|lemak${W})`, "i"), "fat"],
    [new RegExp(`^(พลังงานทั้งหมด|พลังงาน|calories${W}|energy${W}|能量|热量|エネルギー|熱量|열량|tenaga${W})`, "i"), "energy"],
    [new RegExp(`^(โปรตีน|protein${W}|蛋白质|たんぱく質|タンパク質|蛋白質|단백질)`, "i"), "protein"],
    [new RegExp(`^(คาร์โบไฮเดรตทั้งหมด|คาร์โบไฮเดรต|total carbohydrates?${W}|carbohydrates?${W}|total carbs?${W}|碳水化合物|炭水化物|탄수화물|karbohidrat${W})`, "i"), "carb"],
    [new RegExp(`^(ใยอาหาร|dietary fib(er|re)${W}|fib(er|re)${W}|膳食纤维|食物繊維|식이섬유|serat${W})`, "i"), "fibre"],
    [new RegExp(`^(น้ำตาลทั้งหมด|น้ำตาล|total sugars?${W}|of which sugars?${W}|sugars?${W}|糖类|糖類|糖|당류|gula${W})`, "i"), "sugar"],
    [new RegExp(`^(โซเดียม|sodium${W}|钠|ナトリウム|나트륨|natrium${W})`, "i"), "sodium"],
    [new RegExp(`^(salt${W}|食塩相当量|食盐|盐${W}|garam${W})`, "i"), "salt"]
  ];
  const LEAD = /^[\s\-–—―－‐・•·*]+/;
  /** {field|null, label, rest} for a normalised line, or null when no label starts it */
  function labelOf(line) {
    const t = line.replace(LEAD, "");
    for (const [re, field] of LABELS) {
      const m = /** @type {RegExp} */ (re).exec(t);
      if (m) return { field, label: m[0], rest: t.slice(m[0].length), isCalories: /^calories/i.test(m[0]) };
    }
    return null;
  }

  /* ---------- value tokens ---------- */
  const UNIT_RE = "kcal|kj|mg|mcg|µg|ug|grams?|g|ml|กิโลแคลอรี่|กิโลแคลอรี|แคลอรี|กิโลจูล|มิลลิกรัม|ไมโครกรัม|มิลลิลิตร|มก\\.?|มล\\.?|กรัม|ก\\.?|千焦|千卡|大卡|毫克|微克|克|毫升";
  const VAL = new RegExp(`(น้อยกว่า|less than|<)?\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_RE})?(?![a-zก-๛])\\s*(未満)?\\s*(%)?`, "gi");
  function unitNorm(u) {
    if (!u) return "";
    const s = u.toLowerCase().replace(/\.$/, "");
    if (/^(kcal|กิโลแคลอรี่|กิโลแคลอรี|แคลอรี|千卡|大卡)$/.test(s)) return "kcal";
    if (/^(kj|กิโลจูล|千焦)$/.test(s)) return "kJ";
    if (/^(mg|มิลลิกรัม|มก|毫克)$/.test(s)) return "mg";
    if (/^(mcg|µg|ug|ไมโครกรัม|微克)$/.test(s)) return "µg";
    if (/^(ml|มิลลิลิตร|มล|毫升)$/.test(s)) return "ml";
    if (/^(g|grams?|กรัม|ก|克)$/.test(s)) return "g";
    return "";
  }
  /** value tokens of a text: [{cmp, num, text, unit, shown}] without percentages */
  function tokens(text) {
    const out = [];
    VAL.lastIndex = 0;
    for (let m; (m = VAL.exec(text));) {
      if (!m[0].trim()) { VAL.lastIndex++; continue; }
      if (m[5]) continue; // a percentage (%RDI, %DV, NRV%, GDA %)
      const cmp = m[1] || m[4] ? "<" : "";
      out.push({ cmp, num: parseFloat(m[2]), text: (cmp ? "<" : "") + m[2], unit: unitNorm(m[3]), shown: m[0].trim() });
    }
    return out;
  }
  const stripParens = s => s.replace(/\([^()]*\)/g, " ").replace(/（[^（）]*）/g, " ");

  /* ---------- basis ---------- */
  /** "per pack" (GDA) is taken only with one of these pack words; a misread "ต่อหนึ่งหน่วยบริโภค" header is not per pack */
  const PACK_WORD = "(ซองเล็ก|ซอง|ถุง|ห่อ|กล่อง|ขวด|ถ้วย|กระป๋อง|กระปุก|แพ็ค|แพค|ชิ้น|หลอด|แท่ง|ถาด)";
  const BASIS_PATTERNS = [ // [regex, basis | (match) => basis]
    [/ต่อ\s*(หนึ่ง|1)\s*หน่วยบริ/, "serving"],
    [new RegExp(`คุณค่าทางโภชนาการต่อ\\s*(หนึ่ง|1)\\s*${PACK_WORD}`), "pack"],
    [/ต่อ\s*100\s*(กรัม|ก\.?|g)/, "100g"],
    [/ต่อ\s*100\s*(มล\.?|มิลลิลิตร|ml)/, "100ml"],
    [/per\s*100\s*ml/i, "100ml"],
    [/per\s*100\s*g(?![a-z])/i, "100g"],
    [/\/\s*100\s*g(?![a-z])/i, "100g"],
    [/per\s*(\d+(?:\.\d+)?)\s*(g|ml)\s*(serving|portion)?/i, "serving"],
    [/per\s*(serving|portion|pack|bar|cup)/i, "serving"],
    [/amount per serving/i, "serving"],
    [/每\s*100\s*(克|g)/i, "100g"],
    [/每\s*100\s*(毫升|ml)/i, "100ml"],
    [/每份/, "serving"],
    [/100\s*(g|ml)\s*当たり/i, m => (/ml/i.test(m[1]) ? "100ml" : "100g")],
    [/当たり/, "serving"]
  ];
  /** basis phrases in one line, in reading order: [{basis, at}] */
  function basesIn(line) {
    const found = [];
    for (const [re0, b] of BASIS_PATTERNS) {
      const re = /** @type {RegExp} */ (re0);
      const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
      for (let m; (m = g.exec(line));) {
        const basis = typeof b === "function" ? b(m) : b;
        if (basis === "serving" && /per\s*100\s*(g|ml)/i.test(m[0]) && !/serving|portion/i.test(m[0])) continue;
        if (!found.some(f => Math.abs(f.at - m.index) < 4 || (m.index >= f.at && m.index < f.end))) found.push({ basis, at: m.index, end: m.index + m[0].length });
        if (!m[0].length) g.lastIndex++;
      }
    }
    return found.sort((a, b) => a.at - b.at).map(f => f.basis);
  }

  /* ---------- format ---------- */
  function formatOf(all) {
    if (/营养成分表|營養成分表/.test(all)) return "cn";
    if (/栄養成分表示/.test(all)) return "jp";
    if (/nutrition facts/i.test(all)) return "us";
    if (/ควรแบ่งกิน|ปริมาณสูงสุดที่บริโภคได้ต่อวัน/.test(all) || (new RegExp(`คุณค่าทางโภชนาการต่อ\\s*(1|หนึ่ง)\\s*${PACK_WORD}`).test(all) && !/หน่วยบริโภค/.test(all))) return "th-gda";
    if (/ข้อมูลโภชนาการ|หน่วยบริโภค/.test(all)) return /พลังงานจากไขมัน|ใยอาหาร/.test(all) ? "th-old" : "th-new";
    if (/per\s*100\s*(g|ml)|typical values|nutrition (declaration|information)|energy\s+\d+\s*kj/i.test(all)) return "eu";
    return "generic";
  }

  /* ---------- serving size, servings per pack ---------- */
  const WEIGHT = /(\d+(?:\.\d+)?)\s*(กรัม|ก\.?|grams?|g|มล\.?|มิลลิลิตร|ml|克|毫升)(?![a-zก-๛])/gi;
  function weightIn(text) {
    let last = null;
    WEIGHT.lastIndex = 0;
    for (let m; (m = WEIGHT.exec(text));) last = { n: parseFloat(m[1]), u: unitNorm(m[2]) };
    if (!last || !(last.n > 0)) return null;
    return last.u === "ml" ? { ml: last.n } : { grams: last.n };
  }
  function servingOf(lines, fmt) {
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i];
      let m = /หนึ่งหน่วยบริโภค\s*:?\s*(.*)$/.exec(t) || /serving size\s*:?\s*(.*)$/i.exec(t) || /每份\s*[(（]?\s*(.*?)[)）]?(\s|$)/.exec(t);
      if (m) { const w = weightIn(m[1]); return { text: m[1].trim(), line: i, ...(w || {}) }; }
      m = /per\s*(\d+(?:\.\d+)?)\s*(g|ml)\s*(serving|portion)/i.exec(t) || /per\s*(?:serving|portion)\s*\(?\s*(\d+(?:\.\d+)?)\s*(g|ml)/i.exec(t);
      if (m && +m[1] !== 100) return { text: m[0], line: i, ...(/ml/i.test(m[2]) ? { ml: +m[1] } : { grams: +m[1] }) };
      if (fmt === "jp" && /当たり/.test(t) && !/100\s*(g|ml)\s*当たり/i.test(t)) { const w = weightIn(t.replace(/当たり.*$/, "")); if (w) return { text: t, line: i, ...w }; }
    }
    return null;
  }
  function servingsPerPackOf(lines) {
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i];
      let m = /จำนวนหน่วยบริโภคต่อ\S*\s*:?\s*(?:ประมาณ\s*)?(\d+(?:\.\d+)?)/.exec(t);
      if (!m) m = /(?:about\s*)?(\d+(?:\.\d+)?)\s*servings?\s*per\s*(container|package|pack)/i.exec(t);
      if (!m) m = /servings?\s*per\s*(?:container|package|pack)\s*:?\s*(?:about\s*)?(\d+(?:\.\d+)?)/i.exec(t);
      if (m) return { text: m[1], value: parseFloat(m[1]), line: i };
    }
    return null;
  }

  /* ---------- allergens ---------- */
  const ALLERGENS = {
    source: "Thai list: MoPH Notification No. 450 (B.E. 2567) on prepackaged food labelling as summarised in docs/NUTRITION-DESIGN.md " +
      "§4.4 [secondary, read 2026-11-10; adds shellfish and squid to No. 367]; to be confirmed from the Royal Gazette (N1). " +
      "English / Chinese / Japanese words: the common allergen groups of Codex / EU / US / China / Japan labels. Used only to " +
      "highlight words in a statement that is shown verbatim; never to say a food is free of anything.",
    words: [
      "ถั่วเปลือกแข็ง", "ถั่วเหลือง", "ถั่วลิสง", "ข้าวสาลี", "ข้าวไรย์", "ข้าวบาร์เลย์", "ข้าวโอ๊ต", "กลูเตน", "ปลาหมึก", "ล็อบสเตอร์", "อัลมอนด์", "วอลนัท",
      "มะม่วงหิมพานต์", "เฮเซลนัท", "พิสตาชิโอ", "แมคคาเดเมีย", "ซัลไฟต์", "แลคโตส", "กุ้ง", "ปู", "กั้ง", "หอย", "ไข่", "ปลา", "นม", "งา",
      "乳制品", "甲壳类", "坚果", "花生", "大豆", "小麦", "麸质", "芝麻", "牛奶", "鸡蛋", "虾", "蟹", "贝", "鱼", "乳", "蛋",
      "乳成分", "落花生", "くるみ", "そば", "えび", "かに", "ごま", "さば", "いか", "卵"
    ],
    en: ["tree nuts?", "peanuts?", "milk", "eggs?", "fish", "crustaceans?", "shellfish", "shrimps?", "prawns?", "crabs?", "lobsters?", "mollus[ck]s?", "squid",
      "almonds?", "walnuts?", "cashews?", "hazelnuts?", "pecans?", "pistachios?", "macadamias?", "soya?", "soybeans?", "wheat", "gluten", "barley", "rye",
      "oats?", "sesame", "celery", "mustard", "lupin", "sul(ph|f)ites?"]
  };
  const NOT_ALLERGEN = ["ขนม"]; // masked without reporting: "ขนม" (snack) contains "นม" (milk)
  function findAllergenWords(text) {
    const found = [];
    let t = String(text || "");
    for (const w of NOT_ALLERGEN) t = t.split(w).join("\u0000".repeat(w.length));
    for (const w of [...ALLERGENS.words].sort((a, b) => b.length - a.length)) {
      if (t.includes(w)) { found.push(w); t = t.split(w).join("\u0000".repeat(w.length)); }
    }
    for (const p of ALLERGENS.en) {
      const re = new RegExp(`\\b(${p})\\b`, "gi");
      for (let m; (m = re.exec(t));) if (!found.some(f => f.toLowerCase() === m[1].toLowerCase())) found.push(m[1]);
    }
    return found;
  }
  // the keyword is matched with the OCR misreads seen on device (v3 set): a dropped / swapped Thai vowel or tone mark
  // ("ผู้พ้อาหาร", "สําหรับ"), and the Japanese long-vowel mark read as 一, -, ― or －
  const STATEMENT = new RegExp([
    "ข้อมูล\\s*ส.{0,3}หรับ\\s*ผ.{0,5}อาหาร", "ผู.{0,3}แพ.{0,2}อาหาร", "アレルギ[ーｰ一\\-―－‐]物質",
    "ข้อมูลสำหรับผู้แพ้อาหาร", "สำหรับผู้แพ้อาหาร", "ข้อมูลผู้แพ้อาหาร", "สารก่อภูมิแพ้", "allergy advice", "allergens?\\b", "allergy information",
    "\\bcontains\\s*:", "\\bmay contain\\b", "致敏物质", "过敏原", "过敏物质", "アレルギー物質", "アレルゲン", "特定原材料", "알레르기", "mengandungi\\s*:"
  ].join("|"), "i");
  function allergenOf(raw) {
    for (let i = 0; i < raw.length; i++) {
      const m = STATEMENT.exec(raw[i]);
      if (!m) continue;
      let text = raw[i].slice(m.index).trim();
      // a statement that wraps: keep the next line when this one ends mid-list or the next one starts another statement
      for (let j = i + 1; j < raw.length && j <= i + 2; j++) {
        const nx = raw[j].trim();
        if (!nx || labelOf(norm(nx))) break;
        if (/[,、，:：]$/.test(text) || STATEMENT.test(nx)) text += " " + nx; else break;
      }
      return { text, line: i, words: findAllergenWords(text) };
    }
    return null;
  }

  /* ---------- the parser ---------- */
  const isNum = x => typeof x === "number" && Number.isFinite(x);
  /** @param {any} input @param {{tilt?: number}} [opts] */
  function parseLabel(input, opts) {
    const src = (Array.isArray(input) ? input : String(input || "").split(/\r?\n/)).map(l => (typeof l === "string" ? { text: l } : { text: String((l && l.text) || ""), conf: l && l.conf }));
    const raw = src.map(l => l.text), lines = raw.map(norm), all = lines.join("\n");
    const format = formatOf(all);
    const serving = servingOf(lines, format), servingsPerPack = format === "th-gda" ? null : servingsPerPackOf(lines);
    const gda = /ควรแบ่งกิน\s*(\d+(?:\.\d+)?)\s*ครั้ง/.exec(all);
    // columns: the basis header nearest above the first value line; defaults per format
    let basis = null;
    for (let i = 0; i < lines.length && !basis; i++) {
      const b = basesIn(lines[i]);
      if (b.length) basis = b;
    }
    let basisGuessed = false;
    if (!basis) {
      if (format === "th-gda") basis = ["pack"];
      else if (["th-new", "th-old", "us", "jp"].includes(format)) basis = ["serving"];
      else { basis = ["serving"]; basisGuessed = true; }
    }
    if (format === "th-gda" && basis[0] !== "pack") basis = ["pack"];
    const items = [], used = new Set();
    let mismatches = 0;
    const push = (field, tok, i, basisIdx, why0) => {
      const unitDefault = field === "energy" ? "" : UNIT_OF[field];
      let f = field;
      if (field === "energy") f = tok.unit === "kJ" ? "energy_kj" : "energy_kcal";
      const why = [...(why0 || [])];
      if (!tok.unit && !(field === "energy" && tok.calories)) why.push("unit");
      const unit = tok.unit || (field === "energy" ? (f === "energy_kj" ? "kJ" : "kcal") : unitDefault);
      // a unit that does not fit the field is never accepted silently (sodium in g, salt in mg, energy in g, a mass in mg …)
      if (tok.unit && UNIT_OF[f] !== tok.unit) { why.push("unit"); mismatches++; }
      if (src[i].conf != null && src[i].conf < 0.75) why.push("ocr-confidence");
      if (basisGuessed) why.push("basis");
      items.push({ field: f, basis: basis[Math.min(basisIdx, basis.length - 1)] || "serving", value: tok.num, cmp: tok.cmp, value_text: tok.text, unit, shown: tok.shown,
        line: i, raw: raw[i].trim(), status: "read", why });
    };
    // GDA / box layouts: a row of 2+ field names and no number, then a row of the same count of values (and units)
    for (let i = 0; i < lines.length; i++) {
      if (/\d/.test(lines[i])) continue;
      const words = lines[i].replace(LEAD, "").split(" ").filter(Boolean);
      const fields = words.map(w => { const l = labelOf(w); return l && l.field && !l.rest.trim() ? l.field : null; });
      if (words.length < 2 || fields.some(f => !f)) continue;
      for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
        if (labelOf(lines[j])) break;
        const tk = tokens(lines[j]);
        if (tk.length !== fields.length) continue;
        const unitWords = j + 1 < lines.length ? lines[j + 1].split(" ").filter(Boolean).map(unitNorm) : [];
        const haveUnits = unitWords.length === fields.length && unitWords.every(Boolean);
        fields.forEach((f, k) => push(f, { ...tk[k], unit: tk[k].unit || (haveUnits ? unitWords[k] : "") }, j, 0));
        used.add(i); used.add(j); if (haveUnits) used.add(j + 1);
        break;
      }
    }
    // one field per line
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      const l = labelOf(lines[i]);
      if (!l || !l.field) continue;
      const rest = stripParens(l.rest);
      let tk = tokens(rest);
      if (!tk.length) continue;
      if (l.field === "energy") {
        tk = tk.map(t => ({ ...t, calories: l.isCalories }));
        const kj = tk.filter(t => t.unit === "kJ"), other = tk.filter(t => t.unit !== "kJ");
        const why = kj.length > basis.length || other.length > basis.length ? ["columns"] : [];
        kj.forEach((t, k) => push("energy", t, i, k, why));
        other.forEach((t, k) => push("energy", t, i, k, why));
      } else {
        const why = tk.length > basis.length ? ["columns"] : [];
        tk.forEach((t, k) => { if (k < basis.length) push(l.field, t, i, k, why); });
      }
    }
    checks(items, serving);
    // a column that looks shifted by a row: two or more values whose unit does not fit their field -> check them all
    if (mismatches >= 2) for (const it of items) { if (!it.why.includes("shifted")) it.why.push("shifted"); it.status = "check"; }
    // a picture tilted beyond what the row pairing is trusted for: every value is "please check"
    const tilt = opts && typeof opts.tilt === "number" ? opts.tilt : 0;
    if (Math.abs(tilt) > TILT_LIMIT) for (const it of items) { if (!it.why.includes("tilt")) it.why.push("tilt"); it.status = "check"; }
    const fieldsFound = new Set(items.map(i => i.field));
    const notFound = CORE[format].filter(f => (f === "energy_kcal" ? !fieldsFound.has("energy_kcal") && !fieldsFound.has("energy_kj") : !fieldsFound.has(f)));
    return { format, basis, items, serving, servingsPerPack, allergen: allergenOf(raw), notFound, gdaSplit: gda ? parseFloat(gda[1]) : null };
  }

  /* ---------- rows from text boxes, tilt-aware ---------- */
  /** degrees of tilt beyond which values are marked "please check" even after the tilt-aware pairing */
  const TILT_LIMIT = 2.5;
  /**
   * linesFromParts(parts) -> {lines: [{text, conf}], tilt (degrees, clockwise positive)}. parts: [{text, conf, box}] with the
   * detector's box (axis-aligned x0..y1; cx, cy, angle when the detector found a tilted line). The tilt is the angle that best lines
   * up the boxes: centres across a row and left / right edges down a column (search -8..8 degrees in 0.25 degree steps;
   * the smallest angle wins a tie). The detector's own box
   * angles are not used: short boxes such as "1,1g" get spurious 3–7 degree angles on straight labels. Boxes are then grouped into printed rows along that angle, so a name
   * on the left is paired with the value of the SAME row on a tilted picture, and read left to right.
   */
  function linesFromParts(parts) {
    const ps = (parts || []).filter(p => p && p.box && String(p.text || "").trim()).map(p => {
      const b = p.box;
      return { text: String(p.text).trim(), conf: typeof p.conf === "number" ? p.conf : 1, cx: b.cx != null ? b.cx : (b.x0 + b.x1) / 2, cy: b.cy != null ? b.cy : (b.y0 + b.y1) / 2,
        x0: b.x0, x1: b.x1, h: b.rh != null ? b.rh : b.y1 - b.y0 };
    });
    if (!ps.length) return { lines: [], tilt: 0 };
    const hs = ps.map(p => p.h).sort((a, b) => a - b), h = Math.max(4, hs[Math.floor(hs.length / 4)]);
    const yOf = (p, t) => -p.cx * Math.sin(t) + p.cy * Math.cos(t), xOf = (p, t) => p.cx * Math.cos(t) + p.cy * Math.sin(t);
    let t = 0;
    if (ps.length >= 3) {
      // two cues, both maximal at the true tilt: boxes side by side share a row (centres line up across), and boxes in one
      // column share a left or right edge (edges line up down). Row pairs alone are ambiguous on a tilted two-column panel
      // (a name lines up with the next row's value at another angle); the column edges break that tie.
      const sr = h / 6, se = h / 4, g = (d, s) => Math.exp(-(d * d) / (2 * s * s));
      const score = th => {
        const c = Math.cos(th), sn = Math.sin(th);
        const P = ps.map(p => ({ y: -p.cx * sn + p.cy * c, x: p.cx * c + p.cy * sn, l: p.x0 * c + p.cy * sn, r: p.x1 * c + p.cy * sn }));
        let sc = 0;
        for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
          const A = P[i], B = P[j], dy = A.y - B.y, dx = A.x - B.x;
          if (Math.abs(dx) > 2 * h) sc += g(dy, sr);
          if (Math.abs(dy) > 1.5 * h) sc += g(A.l - B.l, se) + g(A.r - B.r, se);
        }
        return sc;
      };
      let best = score(0) + 1e-9;
      for (let k = 1; k <= 32; k++) for (const sgn of [1, -1]) {
        const th = (sgn * k * 0.25 * Math.PI) / 180, sc = score(th);
        if (sc > best * 1.02) { best = sc; t = th; }
      }
    }
    const rows = [];
    for (const p of [...ps].sort((a, b) => yOf(a, t) - yOf(b, t))) {
      const y = yOf(p, t), row = rows.find(r => Math.abs(r.y - y) <= 0.5 * h);
      if (row) { row.items.push(p); row.y = (row.y * (row.items.length - 1) + y) / row.items.length; }
      else rows.push({ y, items: [p] });
    }
    rows.sort((a, b) => a.y - b.y);
    return {
      lines: rows.map(r => { const it = r.items.sort((a, b) => xOf(a, t) - xOf(b, t)); return { text: it.map(p => p.text).join(" "), conf: Math.min(...it.map(p => p.conf)) }; }),
      tilt: Math.round(((t * 180) / Math.PI) * 10) / 10
    };
  }

  /** consistency checks -> status "check" (never a correction) */
  function checks(items, serving) {
    const by = (f, b) => items.filter(i => i.field === f && i.basis === b);
    const one = (f, b) => { const a = by(f, b); return a.length === 1 ? a[0] : null; };
    const flag = (it, why) => { if (it && !it.why.includes(why)) it.why.push(why); };
    for (const it of items) {
      if (by(it.field, it.basis).some(o => o !== it)) flag(it, "duplicate"); // two values for one field, even when equal
      const v = it.value, b = it.basis;
      const lim = b === "100g" || b === "100ml" ? { g: 100, mg: 40000, kcal: 900, kJ: 3800 } : null;
      if (lim && it.unit in lim && v > lim[it.unit]) flag(it, "plausibility");
      const sg = serving && (serving.grams || serving.ml);
      if (b === "serving" && sg && it.unit === "g" && v > sg) flag(it, "plausibility");
      if (b === "serving" && sg && it.unit === "mg" && v > sg * 400) flag(it, "plausibility");
    }
    for (const b of new Set(items.map(i => i.basis))) {
      const fat = one("fat", b), sat = one("satfat", b), carb = one("carb", b), sug = one("sugar", b), pro = one("protein", b);
      if (fat && sat && !sat.cmp && sat.value > fat.value) flag(sat, "satfat-above-fat");
      if (carb && sug && !sug.cmp && sug.value > carb.value) flag(sug, "sugar-above-carb");
      if (fat && carb && pro) {
        const x = /** @param {any} i @returns {number} */ i => (i.cmp ? i.value / 2 : i.value);
        for (const [f, k] of /** @type {[string, number[]][]} */ ([["energy_kcal", [4, 4, 9]], ["energy_kj", [17, 17, 37]]])) {
          const e = one(f, b);
          if (!e) continue;
          const est = k[0] * x(pro) + k[1] * x(carb) + k[2] * x(fat), floor = f === "energy_kj" ? 170 : 40;
          if (Math.max(e.value, est) >= floor && Math.abs(e.value - est) / Math.max(e.value, est) > 0.2) flag(e, "energy-macros");
        }
      }
    }
    for (const it of items) if (it.why.length) it.status = "check";
  }

  /* ---------- conversions (always marked converted) ---------- */
  function round(v, unit) {
    if (!isNum(v)) return v;
    if (unit === "g" || unit === "ml") return Math.round(v * 10) / 10;
    return Math.round(v);
  }
  function convert(it) {
    if (!it || !isNum(it.value)) return null;
    if (it.field === "energy_kj") return { field: "energy_kcal", value: round(it.value / 4.184, "kcal"), cmp: it.cmp || "", unit: "kcal", converted: true, from: "energy_kj" };
    if (it.field === "salt") {
      const g = it.unit === "mg" ? it.value / 1000 : it.value;
      return { field: "sodium", value: round((g / 2.5) * 1000, "mg"), cmp: it.cmp || "", unit: "mg", converted: true, from: "salt" };
    }
    return null;
  }

  /* ---------- amount eaten (from the PRINTED values; never a guessed weight) ---------- */
  function factorFor(basis, amount, p) {
    const n = isNum(amount.n) && amount.n > 0 ? amount.n : 1;
    const g = p.serving && p.serving.grams, ml = p.serving && p.serving.ml, spp = p.servingsPerPack && p.servingsPerPack.value;
    const sw = { g, ml };
    switch (amount.kind) {
      case "servings":
        if (basis === "serving") return n;
        if (basis === "100g") return g ? (n * g) / 100 : "no-serving-weight";
        if (basis === "100ml") return ml ? (n * ml) / 100 : "no-serving-weight";
        if (basis === "pack") return spp ? n / spp : "no-servings-per-pack";
        return "no-basis";
      case "pack": case "half": {
        const k = amount.kind === "half" ? 0.5 : n;
        if (basis === "pack") return k;
        if (basis === "serving") return spp ? k * spp : "no-servings-per-pack";
        if (basis === "100g") return !spp ? "no-servings-per-pack" : g ? (k * spp * g) / 100 : "no-serving-weight";
        if (basis === "100ml") return !spp ? "no-servings-per-pack" : ml ? (k * spp * ml) / 100 : "no-serving-weight";
        return "no-basis";
      }
      case "g": case "ml": {
        const unitBasis = amount.kind === "g" ? "100g" : "100ml", w = sw[amount.kind];
        if (basis === unitBasis) return n / 100;
        if (basis === "serving") return w ? n / w : "no-serving-weight";
        if (basis === "pack") return w && spp ? n / (w * spp) : "no-serving-weight";
        return "no-serving-weight";
      }
      default: return "no-basis";
    }
  }
  function recalc(p, amount) {
    if (!p || !amount) return { ok: false, reason: "no-basis" };
    const rows = [];
    let reason = null;
    for (const field of FIELDS) {
      const cands = p.items.filter(i => i.field === field && isNum(i.value));
      if (!cands.length) continue;
      let done = false;
      for (const it of [...cands].sort((a, b) => Number(a.status === "check") - Number(b.status === "check"))) {
        const k = factorFor(it.basis, amount, p);
        if (typeof k === "string") { reason = reason || k; continue; }
        rows.push({ field, value: round(it.value * k, it.unit), cmp: it.cmp || "", unit: it.unit, basis_from: it.basis, status: it.status });
        done = true;
        break;
      }
      if (!done && !reason) reason = "no-basis";
    }
    return rows.length ? { ok: true, rows } : { ok: false, reason: reason || "no-basis" };
  }

  /** a line set that looks like a nutrition panel (for a link from other pages) */
  const looksLikePanel = text => {
    const p = parseLabel(String(text || "").split(/\r?\n/));
    return p.format !== "generic" ? p.items.length >= 2 : p.items.length >= 3;
  };

  return { FIELDS, UNIT_OF, CORE, TILT_LIMIT, linesFromParts, ALLERGENS, norm, tokens, labelOf, basesIn, formatOf, parseLabel, convert, recalc, round, findAllergenWords, looksLikePanel };
});
