/* lensiq-pc-advert.js — Product Check "advert / post / leaflet" capture type (approved item 4, adverts option B:
 * docs/product-check/ADVERT-CAPTURE-PROPOSAL.md §8). Browser: window.LQPCAdvert + the advert panel of medicine.html
 * (#pcAdPanel) · Node: module.exports (pure parts, tests/unit/pc-advert.test.js; UI flow tests/e2e/product-check-advert.e2e.mjs).
 *
 * ON THE DEVICE ONLY: the user photographs (crop + on-device OCR of lensiq-pc-ui.js) or pastes an advert, post or
 * leaflet text; the over-claim rules (LQClaims.detect, kind "ad") run here. No AI step, no lookup, no request of any kind,
 * no consent screen, nothing stored. The text and the result live in this tab's memory until the page closes.
 *
 * THE CARD IS ABOUT THE WORDING, NEVER ABOUT A SELLER: it shows the risk signal, the rule and the evidence span only.
 * Seller identifiers (shop / page / brand names, handles, LINE / WeChat IDs, phones, URLs, e-mails, hashtags, trademarked
 * or CamelCase brand tokens, endorsers' names) are found by sellerSpans() and replaced by HIDDEN in every evidence span;
 * endorsement rules (D07, F14, H04, C04) never quote the span at all. The result object never carries the advert text.
 * No verdict words ("illegal", "fake" ...): every line is a "risk signal", "not a legal finding, not about any seller";
 * "no signal" never means compliant. No share, report or history controls.
 *
 *   KIND = "ad" · HIDDEN = "[…]"
 *   sellerSpans(text) -> [{start, end, kind}]   merged, sorted; kinds: url, email, handle, chat-id, phone, shop, page,
 *       brand, endorser, hashtag, repeat (another occurrence of a name word found in an earlier span)
 *   scrub(text) -> text with every seller span replaced by HIDDEN
 *   guessCategory(text) -> drug | cosmetic | supplement | food | herbal | null   product-type cue words (null = unsure)
 *   analyze(text, {category}) -> {kind: "ad", sent: false, category, guessed, hidden, flags: [{rule_id, family, evidence,
 *       endorsement, explain:{th,en,zh}, url}]}   category: the user's choice, else the guess, else null (every family)
 *   cardHtml(result, {lang, t}) -> HTML of the card (#pcAdCard); t(key, thaiDefault, vars) translates (LQI18N.tf)
 *   KEYS -> [[key, thaiDefault]] every card string (EN / ZH in i18n/en-med.js, i18n/zh-med.js, md.pc.ad.*)
 * Test hook (browser): window.__LQ_PCA = {st, run(text, category)}.
 */
(function (root, factory) {
  const node = typeof module !== "undefined" && module.exports;
  const m = factory(node ? require("./lensiq-claims.js") : /** @type {any} */ (root).LQClaims);
  if (node) module.exports = m;
  else { /** @type {any} */ (root).LQPCAdvert = m; m.mount(root); }
})(typeof self !== "undefined" ? self : this, function (/** @type {any} */ Claims) {
  "use strict";

  const KIND = "ad";
  const HIDDEN = "[…]";
  const ENDORSE = new Set(["D07", "F14", "H04", "C04"]);
  const CATS = ["supplement", "food", "cosmetic", "drug", "herbal"];

  /* ---------------- seller identifiers ---------------- */
  const TH = "\\u0E00-\\u0E7F", CJK = "\\u3400-\\u9FFF";
  /** @type {Array<[string, RegExp]>} */
  const SELLER = [
    ["url", /(?:https?:\/\/|www\.)[^\s<>"'，。、]+/giu],
    ["url", /\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|co|th|shop|store|me|ly|io|cn|asia|biz|info|online|site|page|link|app|invalid|example)\b(?:\/[^\s<>"'，。、]*)?/giu],
    ["email", /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu],
    ["handle", new RegExp(`(?<![\\w.])@[\\w.\\-${TH}]{2,40}`, "gu")],
    ["chat-id", new RegExp(`(?:${["line\\s*id", "id\\s*line", "line", "ไลน์ไอดี", "ไอดีไลน์", "ไลน์", "微信号?", "weixin", "wechat", "whatsapp",
      "telegram", "instagram", "tiktok", "facebook", "ig", "fb", "qq", "wx", "vx"].join("|")})\\s*[:：]\\s*@?[\\w.\\-${TH}]{2,40}`, "giu")],
    ["chat-id", /(?:微信号?|wechat|ไอดีไลน์|ไลน์ไอดี|line\s*id)\s+@?[A-Za-z0-9_.-]{3,40}/giu],
    ["phone", /(?<![\d])(?:\+?66[\s-]?|0)(?:\d[\s-]?){7,8}\d(?![\d])/gu],
    ["phone", /(?<![\d])1[3-9]\d{9}(?![\d])/gu],
    ["phone", /\+\d{1,3}[\s-]?(?:\d[\s-]?){6,12}\d/gu],
    ["shop", new RegExp(`(?<!ทาง)ร้าน(?!ค้า|ขาย|ยา\\b)\\s?[^\\s,，。!！?？:：#@\\n]{2,24}`, "gu")],
    ["brand", new RegExp(`(?:เพจ|แบรนด์|ยี่ห้อ|(?<!อั)ตรา(?!ส่วน|ฐาน|การ)|品牌|店铺|店名)\\s*[:：]?\\s*[^\\s,，。!！?？\\n]{2,30}`, "gu")],
    ["brand", /\b(?:shop|store|brand|page|seller|sold by|by)\s*[:：]\s*[^\n,;]{2,40}/giu],
    ["shop", /\b(?:[A-Z][\w&'’.-]*\s+){1,3}(?:Official|Shop|Store|Pharmacy|Clinic|Thailand)\b/gu],
    ["shop", new RegExp(`[${CJK}A-Za-z0-9]{1,12}?(?:旗舰店|专卖店|官方店|专营店|药房|药店|商行|工作室|店铺|小店)`, "gu")],
    ["endorser", /\bby\s+(?:(?:Dr|Prof|Mr|Mrs|Ms)\.?\s+)?[A-Z][\w&'’.-]*(?:\s+[A-Z][\w&'’.-]*){0,3}/gu],
    ["endorser", /\b(?:Dr|Prof|Doctor|Professor|Mr|Mrs|Ms)\.?\s+[A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+)?/gu],
    ["endorser", new RegExp(`(?:นพ\\.|พญ\\.|ทพ\\.|ทญ\\.|ภก\\.|ภญ\\.|ดร\\.|ศ\\.|รศ\\.|ผศ\\.|คุณหมอ|อาจารย์|เภสัชกร|คุณ(?!ภาพ|ค่า|สมบัติ|ประโยชน์|ลักษณะ|แม่|พ่อ|ผู้หญิง|ผู้ชาย))` +
      `\\s?[ก-ฮ][${TH}]{1,19}(?:\\s[ก-ฮ][${TH}]{1,19})?`, "gu")],
    ["endorser", new RegExp(`[${CJK}]{1,3}(?:医生|医师|博士|教授|老师|大夫|主任)`, "gu")],
    ["hashtag", new RegExp(`#[\\w${TH}${CJK}]+`, "gu")],
    ["brand", new RegExp(`[\\w${TH}${CJK}.\\-]{1,30}\\s?[®™©]`, "gu")],
    ["brand", /\b[A-Za-z]*[a-z][A-Z][A-Za-z]*\b/gu]
  ];
  /** Units and science words that look CamelCase but are not names. */
  const NOT_NAME = new Set(["mL", "dL", "mmHg", "IgG", "IgA", "IgE", "IgM", "pH", "mRNA", "NaCl", "kCal", "kJ", "CoQ", "iPhone", "eBay", "YouTube", "TikTok", "LINE"]);
  /** Words that mark a name but are not part of it (never searched as a repeated name). */
  const MARKER = new RegExp(`^(?:${["ร้าน", "เพจ", "แบรนด์", "ยี่ห้อ", "ตรา", "official", "shop", "store", "pharmacy", "clinic", "thailand", "brand", "page",
    "seller", "sold", "by", "dr", "prof", "doctor", "professor", "mr", "mrs", "ms", "line", "id", "sponsored", "ไลน์", "微信号?", "品牌", "店铺", "店名",
    "旗舰店", "专卖店", "官方店", "专营店", "药房", "药店", "商行", "工作室", "小店", "นพ", "พญ", "ดร", "คุณ", "คุณหมอ", "อาจารย์", "เภสัชกร", "https?", "www",
    "com", "co", "th", "net", "org"].join("|")})$`, "i");
  const SPONSOR = new RegExp("^(?:sponsored|promoted|ได้รับการสนับสนุน|ผู้สนับสนุน|โฆษณา|赞助|推广|广告|" +
    "\\d+\\s*(?:h|hr|hrs|m|min|mins|d|ชม\\.?|ชั่วโมง|นาที|วัน|小时|分钟|天)(?:\\s*ago|\\s*ที่แล้ว|前)?|เมื่อสักครู่|just now)\\s*[·•]?\\s*\\S{0,3}$", "iu");

  /** All [start, end) matches of a global regex. @param {RegExp} re @param {string} s */
  function matches(re, s) {
    /** @type {Array<[number, number, string]>} */ const out = [];
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(s))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      out.push([m.index, m.index + m[0].length, m[0]]);
    }
    return out;
  }
  const reEsc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /** @param {any} input @returns {Array<{start: number, end: number, kind: string}>} */
  function sellerSpans(input) {
    const s = String(input == null ? "" : input);
    /** @type {Array<{start: number, end: number, kind: string}>} */ const raw = [];
    for (const [kind, re] of SELLER) {
      for (const [a, b, txt] of matches(re, s)) {
        if (kind === "brand" && /^[A-Za-z]+$/.test(txt) && NOT_NAME.has(txt)) continue;
        raw.push({ start: a, end: b, kind });
      }
    }
    // page-name lines next to a "Sponsored" / time line (social post header)
    const lines = [];
    for (let i = 0, at = 0; i <= s.length; i++) {
      if (i === s.length || s[i] === "\n") { lines.push({ start: at, end: i, text: s.slice(at, i).trim() }); at = i + 1; }
    }
    lines.forEach((ln, k) => {
      if (!SPONSOR.test(ln.text)) return;
      raw.push({ start: ln.start, end: ln.end, kind: "page" });
      for (const j of [k - 1, k + 1]) {
        const o = lines[j];
        if (o && o.text && o.text.length <= 40 && !SPONSOR.test(o.text)) raw.push({ start: o.start, end: o.end, kind: "page" });
      }
    });
    // every other occurrence of a name word found above (e.g. a brand repeated without its marker)
    const words = new Set();
    for (const r of raw) {
      if (r.kind === "phone" || r.kind === "url" || r.kind === "email") continue;
      for (const w of s.slice(r.start, r.end).split(/[\s:：@#.®™©,，/·•\-]+/u)) {
        const ww = w.trim();
        if (ww.length >= 3 && !MARKER.test(ww) && !/^\d+$/.test(ww)) words.add(ww);
      }
    }
    for (const w of words) {
      for (const [a, b] of matches(new RegExp(reEsc(w), "giu"), s)) raw.push({ start: a, end: b, kind: "repeat" });
    }
    raw.sort((x, y) => x.start - y.start || y.end - x.end);
    /** @type {Array<{start: number, end: number, kind: string}>} */ const out = [];
    for (const r of raw) {
      const last = out[out.length - 1];
      if (last && r.start <= last.end) { if (r.end > last.end) last.end = r.end; } else out.push({ ...r });
    }
    // trim spaces / line breaks at the edges
    for (const r of out) {
      while (r.start < r.end && /\s/.test(s[r.start])) r.start++;
      while (r.end > r.start && /\s/.test(s[r.end - 1])) r.end--;
    }
    return out.filter(r => r.end > r.start);
  }

  /** Replace [start, end) ranges of `s` (offset `base`) by HIDDEN. @param {string} s @param {number} base @param {Array<{start: number, end: number}>} spans */
  function hide(s, base, spans) {
    let out = "", at = 0;
    for (const sp of spans) {
      const a = Math.max(0, sp.start - base), b = Math.min(s.length, sp.end - base);
      if (b <= a || b <= at) continue;
      out += s.slice(at, Math.max(at, a)) + HIDDEN;
      at = b;
    }
    return (out + s.slice(at)).replace(/(?:\[…\]\s*){2,}/g, HIDDEN + " ").trim();
  }
  /** @param {any} input */
  const scrub = input => { const s = String(input == null ? "" : input); return hide(s, 0, sellerSpans(s)); };

  /* ---------------- product type guess (cue words only; null when unsure) ---------------- */
  /** @type {Array<[string, number, RegExp]>} */
  const CUES = [
    ["drug", 2, new RegExp(["ยาเม็ด|ยาน้ำ|ยาแก้|ยาสามัญ|ยาอม|ยาทา|ยาแคปซูล|ยาแผนปัจจุบัน|ยาละลาย|ทะเบียนยา|ข้อบ่งใช้|ขนาดและวิธีใช้|ตัวยาสำคัญ",
      "\\bdrug facts\\b|\\bactive ingredients?\\b|\\bdosage\\b|\\bOTC\\b|\\bthis drug\\b|temporar(?:il)?y (?:relie(?:f|ves?)|protects?)",
      "药品|国药准字|片剂|适应症|用法用量",
      "(?<![0-9A-Za-z])[12]?[A-Z]\\s?\\d{1,6}\\/\\d{2}(?![0-9])"].join("|"), "iu")],
    // US "Drug Facts" heading ("Uses ...", "Use ...") at the start of the text or of a line (case-sensitive)
    ["drug", 2, /(?:^|\n)\s*Uses?\b/u],
    ["drug", 1, /เป็นยา|ใช้รักษา/u],
    // Thai traditional-medicine label heading "สรรพคุณ :" (with the colon; advert prose uses the word without one)
    ["herbal", 2, new RegExp(["สรรพคุณ\\s*[:：]|ยาระบาย|ยาสมานแผล|ยาแผนโบราณ|ยาสมุนไพร|ยาแผนไทย|ผลิตภัณฑ์สมุนไพร|ยาหม่อง|ยาดม",
      "\\bherbal medicine\\b|\\btraditional medicine\\b|中药|中成药"].join("|"), "iu")],
    ["herbal", 1, /สมุนไพร|\bherbal\b|草本/iu],
    ["cosmetic", 2, new RegExp(["ครีม|เซรั่ม|เซรัม|โลชั่น|สบู่|แชมพู|กันแดด|มาส์ก|มาสก์|โทนเนอร์|ลิปสติก|เครื่องสำอาง|ทาผิว|ทาหน้า|คลีนซิ่ง|เมคอัพ",
      "\\bSPF\\s?\\d|\\bserum\\b|\\bcreams?\\b|\\blotion\\b|\\bshampoo\\b|\\bsunscreen\\b|\\bcosmetics?\\b|\\bmoisturi[sz]er\\b|\\btoner\\b",
      "\\bcleansers?\\b|\\bcleansing\\b|\\bmoisturi[sz]ing\\b|\\bmake-?up\\b|面霜|精华|乳液|洗发|防晒|化妆品|面膜"].join("|"), "iu")],
    ["cosmetic", 1, /\bskin\b/iu],
    ["supplement", 2, /อาหารเสริม|ผลิตภัณฑ์เสริมอาหาร|\bsupplements?\b|保健食品|膳食补充剂|营养补充/iu],
    ["food", 1, /เครื่องดื่ม|อาหาร(?!เสริม)|ขนม|กาแฟ|\bdrinks?\b|\bbeverages?\b|\bfoods?\b|\bcoffee\b|\bteas?\b|饮料|食品|咖啡/iu]
  ];
  /** @param {any} input @returns {string|null} */
  function guessCategory(input) {
    const s = String(input == null ? "" : input);
    /** @type {Record<string, number>} */ const sc = {};
    for (const [cat, w, re] of CUES) if (re.test(s)) sc[cat] = (sc[cat] || 0) + w;
    const ranked = Object.entries(sc).sort((a, b) => b[1] - a[1]);
    if (!ranked.length || ranked[0][1] < 2) return null;
    if (ranked[1] && ranked[1][1] === ranked[0][1]) {
      // supplement and food share the food rule family: a tie between them is a supplement
      const pair = new Set([ranked[0][0], ranked[1][0]]);
      if (pair.has("supplement") && pair.has("food") && !(ranked[2] && ranked[2][1] === ranked[0][1])) return "supplement";
      return null;
    }
    return ranked[0][0];
  }

  /* ---------------- analysis ---------------- */
  /**
   * @param {any} input
   * @param {{category?: string}} [opts]
   */
  function analyze(input, opts = {}) {
    const s = String(input == null ? "" : input);
    const chosen = opts.category && CATS.includes(String(opts.category)) ? String(opts.category) : null;
    const guess = chosen ? null : guessCategory(s);
    const category = chosen || guess;
    const spans = sellerSpans(s);
    /** @type {any[]} */ const raw = Claims && s.trim() ? Claims.detect(s, { category: category || undefined, kind: KIND }) : [];
    const flags = raw.filter(f => !f.absence).map(f => {
      const endorsement = ENDORSE.has(f.rule_id);
      const evidence = endorsement ? "" : hide(s.slice(f.span.start, f.span.end), f.span.start, spans);
      return { rule_id: f.rule_id, family: f.family, evidence, endorsement, start: f.span.start, explain: f.explain, url: f.url };
    });
    return { kind: KIND, sent: false, category, guessed: !!guess, hidden: spans.length, flags, error: Claims ? undefined : "rules-missing" };
  }

  /* ---------------- card ---------------- */
  /** Thai defaults of every card string (EN / ZH: i18n/en-med.js, i18n/zh-med.js). */
  const STR = {
    "md.pc.ad.h": "สัญญาณเสี่ยงจากถ้อยคำโฆษณา ({n})",
    "md.pc.ad.hNone": "ถ้อยคำโฆษณา: ไม่พบสัญญาณเสี่ยงตามกฎที่ระบบรู้จัก",
    "md.pc.ad.note": "ผลนี้พูดถึงถ้อยคำในข้อความเท่านั้น ตรวจบนเครื่องนี้ ไม่ส่งข้อความหรือภาพออก เป็นสัญญาณเสี่ยงตามกฎที่ระบุ ไม่ใช่คำตัดสินทางกฎหมาย และไม่ใช่ข้อกล่าวหาต่อผู้ขายรายใด อย่าเผยแพร่ผลนี้เป็นข้อกล่าวหา",
    "md.pc.ad.catChosen": "ประเภทสินค้าที่เลือก: {cat}",
    "md.pc.ad.catGuess": "ประเภทสินค้าที่ระบบเดาจากคำในข้อความ: {cat} ถ้าไม่ใช่ เลือกประเภทเองด้านบนแล้วตรวจอีกครั้ง",
    "md.pc.ad.catAll": "ไม่ทราบประเภทสินค้า จึงตรวจกฎของทุกประเภท อาจมีสัญญาณที่ไม่เกี่ยวกับสินค้านี้ เลือกประเภทเองด้านบนได้",
    "md.pc.ad.hidden": "ซ่อนชื่อร้าน ชื่อบัญชี ลิงก์ หรือเบอร์โทร {n} จุด ผลนี้ไม่ระบุผู้ขาย",
    "md.pc.ad.endorse": "มีการอ้างถึงผู้รับรองหรือผู้แนะนำ (ไม่แสดงชื่อ)",
    "md.pc.ad.inName": "ถ้อยคำนี้อยู่ในชื่อ จึงซ่อนไว้",
    "md.pc.ad.basis": "ที่มาของกฎ {id}",
    "md.pc.ad.none": "ไม่พบถ้อยคำที่เข้าข่ายกฎในข้อความนี้ ไม่ได้แปลว่าโฆษณานี้เป็นไปตามกฎ ระบบตรวจเฉพาะถ้อยคำที่รู้จัก",
    "md.pc.ad.source": "กฎถ้อยคำปรับจากชุดข้อความสาธารณะ (ป้ายกำกับโดย AI รอเภสัชกรตรวจ) ยังไม่ได้วัดกับโฆษณาชุดใหม่ อาจพลาดถ้อยคำที่เขียนต่างออกไป",
    "md.pc.ad.empty": "วางหรือพิมพ์ข้อความโฆษณาก่อน หรือถ่ายภาพแล้วกดอ่าน",
    "md.pc.ad.cat.supplement": "ผลิตภัณฑ์เสริมอาหาร",
    "md.pc.ad.cat.food": "อาหาร",
    "md.pc.ad.cat.cosmetic": "เครื่องสำอาง",
    "md.pc.ad.cat.drug": "ยา",
    "md.pc.ad.cat.herbal": "ผลิตภัณฑ์สมุนไพร"
  };
  /** @type {Array<[string, string]>} */
  const KEYS = Object.entries(STR);
  const fill = (/** @type {any} */ s, /** @type {any} */ v) => String(s).replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? String(v[x]) : m));
  /** @type {Record<string, string>} */
  const ENT = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (/** @type {any} */ s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ENT[c]);

  /**
   * @param {any} res result of analyze()
   * @param {{lang?: string, t?: (k: string, th: string, v?: any) => string}} [o]
   */
  function cardHtml(res, o = {}) {
    const lg = o.lang === "en" ? "en" : o.lang === "zh" ? "zh" : "th";
    const tf = o.t || ((/** @type {string} */ k, /** @type {string} */ th, /** @type {any} */ v) => fill(th, v));
    const T = (/** @type {string} */ k, /** @type {any} */ v) => tf(k, /** @type {Record<string, string>} */ (STR)[k], v);
    const flags = (res && res.flags) || [];
    // one line per evidence span (with no product type, one wording can match the rules of several families)
    /** @type {Map<string, any>} */ const groups = new Map();
    for (const f of flags) {
      const key = f.endorsement ? "endorse:" + f.start : f.start + ":" + f.evidence;
      const g = groups.get(key) || { f, rules: [] };
      if (!g.rules.some((/** @type {any} */ x) => x.rule_id === f.rule_id)) g.rules.push(f);
      groups.set(key, g);
    }
    let h = `<section class="card md-res" id="pcAdCard" data-kind="ad" data-k="info"><h3>${esc(groups.size ? T("md.pc.ad.h", { n: groups.size }) : T("md.pc.ad.hNone"))}</h3>` +
      `<p class="hint" data-note="wording">${esc(T("md.pc.ad.note"))}</p>`;
    const cat = res && res.category ? T("md.pc.ad.cat." + res.category) : "";
    if (res && res.category && !res.guessed) h += `<p class="hint" data-cat="${esc(res.category)}">${esc(T("md.pc.ad.catChosen", { cat }))}</p>`;
    else if (res && res.category) h += `<p class="hint" data-guess="${esc(res.category)}">${esc(T("md.pc.ad.catGuess", { cat }))}</p>`;
    else h += `<p class="hint" data-all-families>${esc(T("md.pc.ad.catAll"))}</p>`;
    if (res && res.hidden) h += `<p class="hint" data-hidden="${Number(res.hidden) || 0}">${esc(T("md.pc.ad.hidden", { n: Number(res.hidden) || 0 }))}</p>`;
    if (groups.size) {
      h += `<ul class="md-list" id="pcAdList">` + [...groups.values()].map(g => {
        const f = g.f;
        const quote = f.endorsement ? esc(T("md.pc.ad.endorse"))
          : f.evidence && f.evidence.replace(/\[…\]|\s/g, "") ? `<q translate="no">${esc(f.evidence)}</q>` : esc(T("md.pc.ad.inName"));
        const why = g.rules.map((/** @type {any} */ r) => esc((r.explain && r.explain[lg]) || r.rule_id) +
          (/^https:\/\//.test(String(r.url || "")) ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(T("md.pc.ad.basis", { id: r.rule_id }))}</a>` : "")).join(" · ");
        return `<li data-rule="${esc(g.rules.map((/** @type {any} */ r) => r.rule_id).join(" "))}">${quote} · ${why}</li>`;
      }).join("") + `</ul>`;
    } else h += `<p class="hint" data-none>${esc(T("md.pc.ad.none"))}</p>`;
    h += `<p class="hint" data-source>${esc(T("md.pc.ad.source"))}</p></section>`;
    return h;
  }

  /* ---------------- browser UI ---------------- */
  /** @param {any} W */
  function mount(W) {
    if (typeof document === "undefined") return;
    const start = () => { if (document.querySelector("#pcAdPanel")) ui(W); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  }
  /** @param {any} W */
  function ui(W) {
    const $ = (/** @type {string} */ s) => /** @type {any} */ (document.querySelector(s));
    const t = (/** @type {string} */ k, /** @type {string} */ th, /** @type {any} */ v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : fill(th, v));
    const lang = () => (W.LQI18N && typeof W.LQI18N.lang === "string" ? W.LQI18N.lang : "th");
    /** @type {any} */ const st = { last: null };
    const out = $("#pcAdOut"), box = $("#pcAdText"), sel = $("#pcAdCat");
    const render = () => { out.innerHTML = st.last ? cardHtml(st.last, { lang: lang(), t }) : ""; };
    /** @param {string} text @param {string} [category] */
    function run(text, category) {
      if (!String(text || "").trim()) { st.last = null; out.innerHTML = `<p class="md-status" data-kind="warn">${esc(t("md.pc.ad.empty", STR["md.pc.ad.empty"]))}</p>`; return null; }
      st.last = analyze(text, { category: category || undefined });
      render();
      return st.last;
    }
    W.__LQ_PCA = { st, run };
    $("#pcAdGo").addEventListener("click", () => run(box.value, sel.value));
    sel.addEventListener("change", () => { if (st.last) run(box.value, sel.value); });
    // photo path: lensiq-pc-ui.js sends the OCR text of an advert capture here (never to the label lookup / AI card)
    W.addEventListener("lq-pc-ad-text", (/** @type {any} */ ev) => {
      const d = (ev && ev.detail) || {};
      box.value = String(d.text || "");
      run(box.value, sel.value);
    });
    const clear = () => { st.last = null; out.innerHTML = ""; box.value = ""; };
    W.addEventListener("lq-pc-kind", (/** @type {any} */ ev) => { if (!ev || !ev.detail || ev.detail.kind !== KIND) clear(); });
    W.addEventListener("lq-lang", () => { if (st.last) render(); });
    W.addEventListener("pagehide", clear);
  }

  return { KIND, HIDDEN, KEYS, sellerSpans, scrub, guessCategory, analyze, cardHtml, mount };
});
