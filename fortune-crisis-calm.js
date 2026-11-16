/* fortune-crisis-calm.js — the calm-state and card part of the fortune crisis flow (crisis-v2-live speed fix, 2026-11-16).
 * Split out of fortune-crisis.js so the pages stay inside their speed budget (tests/e2e/speed-budget.e2e.mjs): the hard net,
 * the soft step and the page state stay in fortune-crisis.js (loaded on every fortune page); this part (the card wording, the
 * calm filter and hope frame of a reading, the calm top button with "more help numbers", the printed help line) is loaded by
 * fortune-crisis.js only when it can be needed: a calm tab at load, the first touch of a free-text field, or the card / soft step.
 * Until it is in, fortune-crisis.js holds every click, submit, change and typed input on the page that could show a reading
 * (with text typed, or in a calm tab) and replays it once this part is installed (tests/e2e/crisis-cold-throttled.e2e.mjs).
 * In Node fortune-crisis.js requires this file, so the module API is the same as before the split. */
(function (root) {
  "use strict";
  /** @param {any} C the core's internals (fortune-crisis.js) */
  function install(C) {
  const { canon, calmOn, distress, markCalm } = C;
  /* ---------------- help line (owner order 2026-11-12; tap-to-call buttons 2026-11-14) ----------------
     A calm line with real help resources on every fortune page and under every reading; it needs no detection.
     Numbers, hours and cost are only what docs/CRISIS-RESOURCES.md verified on the agency's own page (checked 2026-11-14).
     Owner order 2026-11-14 (Part B): the numbers are the shared tap-to-call component (lensiq-helpline.js): 1323 with the
     owner's warm wording ("อยากมีคนรับฟัง โทร 1323" / "พูดคุยได้ตลอด 24 ชั่วโมง กับผู้ที่พร้อมรับฟัง" / "บริการของกรมสุขภาพจิต"),
     then 1669 (medical emergency; no hours or cost: not stated on niems.go.th). No verified Chinese-language line exists in
     Thailand: the note says so in Chinese. HELP keeps the line's own text (label, note); tools/helpline.mjs writes the
     static line into every fortune page (it shows without JavaScript); i18n/{en,zh}-common.js carry help.line.* and call.*. */
  const LQH = (typeof module !== "undefined" && module.exports && typeof require === "function" ? require("./lensiq-helpline.js") : null);
  /** the shared component (lensiq-helpline.js), looked up at call time in the browser @returns {any} */
  const callKit = () => LQH || /** @type {any} */ (root).LQHelpline || null;
  /** @type {{tel: string[], th: Record<string, string>, en: Record<string, string>, zh: Record<string, string>}} */
  const HELP = {
    tel: ["1323", "1669"],
    th: { label: "สายด่วนช่วยเหลือ", note: "อยู่ต่างประเทศ โทรเบอร์ฉุกเฉินของประเทศนั้น", more: "เบอร์ช่วยเหลืออื่น ๆ" },
    en: { label: "Help lines", note: "Outside Thailand, call your local emergency number.", more: "More help numbers" },
    zh: { label: "求助热线", note: "目前没有经核实的泰国中文热线；不在泰国时请拨打当地紧急电话。", more: "更多求助热线" },
  };
  const helpLang = (/** @type {any} */ l) => (l === "en" || l === "zh" ? l : "th");
  /** the help line as an element (textContent only). With the page's i18n present it is built in Thai with data-i18n keys
   *  and translated by LQI18N (so it follows later language switches); without it, in the given language.
   *  @param {any} [doc] @param {string} [lang] @param {string} [cls] extra class */
  function helpLine(doc, lang, cls) {
    const d = doc || root.document, I = /** @type {any} */ (root).LQI18N, i18n = !!(I && typeof I.apply === "function");
    const l = i18n ? "th" : helpLang(lang), L = HELP[l], K = callKit();
    /** @param {string} tag @param {string} [c] @param {string} [t] */
    const el = (tag, c, t) => { const e = d.createElement(tag); if (c) e.className = c; if (t != null) e.textContent = t; return e; };
    // crisis-v2-live: this full line is only the printed report's line now; no sticky or pinned copy on screen (the top button)
    const box = el("aside", "lq-helpline" + (cls ? " " + cls : ""));
    box.setAttribute("role", "note"); box.setAttribute("aria-label", L.label); box.setAttribute("data-i18n-attr", "aria-label:help.line.label");
    for (const n of HELP.tel) {
      if (K) box.appendChild(K.el(d, n, { lang: l, cls: "lq-helpline-tel", compact: n !== "1323", keys: i18n }));
      else { const a = el("a", "lq-call-btn lq-helpline-tel", n); a.setAttribute("href", "tel:" + n); box.appendChild(a); } // component missing: the number still calls
    }
    const note = el("span", "lq-helpline-note", L.note); note.setAttribute("data-i18n", "help.line.note"); box.appendChild(note);
    if (i18n) { try { I.apply(box); } catch (e) { /* i18n not ready: Thai stays */ } }
    return box;
  }
  const escH = (/** @type {any} */ s) => String(s).replace(/[&<>"]/g, c => (/** @type {Record<string, string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }))[c]);
  /** the help line as HTML in one language (Thai carries the data-i18n keys) @param {string} [lang] @param {string} [cls] */
  function helpHTML(lang, cls) {
    const l = helpLang(lang), L = HELP[l], K = callKit();
    const calls = HELP.tel.map(n => K ? K.html(n, { lang: l, cls: "lq-helpline-tel", compact: n !== "1323" })
      : '<a class="lq-call-btn lq-helpline-tel" href="tel:' + n + '">' + n + "</a>");
    const note = '<span class="lq-helpline-note"' + (l === "th" ? ' data-i18n="help.line.note"' : "") + ">" + escH(L.note) + "</span>";
    return '<aside class="lq-helpline' + (cls ? " " + escH(cls) : "") + '" role="note" aria-label="' + escH(L.label) + '"' +
      (l === "th" ? ' data-i18n-attr="aria-label:help.line.label"' : "") + ">" + calls.join(" ") + " " + note + "</aside>";
  }
  /** after a reading: on a calm page (or with distress typed) the top button is the one help place (crisis-v2-live; replaces the
   *  sticky dock and v2's pinned bar) @param {any} container the reading's container @param {string} [lang] */
  // eslint-disable-next-line no-unused-vars
  function calmDock(container, lang) {
    try {
      const d = container && container.ownerDocument;
      if (!d || !(calmOn(d) || distress(d))) return null;
      markCalm(d);
      return calmTop(d);
    } catch (e) { return null; }
  }
  /* ---------------- crisis flow v2 (owner decision 2026-11-13, docs/CRISIS-FLOW-V2.md) ----------------
     "Respond, support and keep the door open": the acknowledgement card comes first, the reading follows on "continue".
     Here: (1) the advice classifier and the fatalistic filter that calm readings pass through (word lists per language,
     tests/unit/fortune-crisis-flow-v2.test.js); (2) the hope frame; (3) the pinned help bar (1323 + the other verified lines);
     (4) the in-memory "continued" state: the field values the reader continued past are kept in memory only (never stored,
     never sent), so the card comes back only when a NEW hard-net signal is typed.
     REVIEW: the hope frame and the help-bar wording are pending review by a Thai mental-health professional (launch item L63). */
  /** advice kinds in priority order: anything that sells, buys or carries an object wins over belief and colour words */
  const KINDS = ["lucky", "purchase", "remedy", "belief", "colour"];
  /** @type {Record<string, RegExp[]>} word lists per kind: [Thai, English, Chinese] */
  const WORDS = {
    lucky: [
      new RegExp("ของมงคล|พลอย|อัญมณี|ไพลิน|ทับทิม|มรกต|บุษราคัม|เพชรนำโชค|หินสี|" +
        "เครื่องราง|ของขลัง|วัตถุมงคล|พระเครื่อง|ตะกรุด|หินมงคล|หินนำโชค|กำไล|คริสตัล|ของนำโชค|เครื่องประดับ|ผ้ายันต์|ยันต์|ปี่เซียะ|" +
        "พวงกุญแจ|เหรียญนำโชค|รูปเคารพ|เครื่องรางของขลัง"),
      new RegExp(String.raw`\b(?:amulets?|gems?|sapphires?|rub(?:y|ies)|emeralds?|jade|talisman\w*|lucky charms?|good[- ]luck charms?|charm bracelets?|crystals?(?! clear)|gemstones?|lucky (?:items?` +
        String.raw`|objects?|stones?|bracelets?|coins?|tokens?)|pendants?|bracelets?|figurines?|sacred images?|statuettes?|keychains?)\b`, "i"),
      /吉祥物|宝石|蓝宝石|红宝石|翡翠|玉石|护身符|开运物|开运|水晶|手链|手串|貔貅|饰品|摆件|佛牌|符咒|平安符|转运|神像|幸运物/,
    ],
    purchase: [
      /ซื้อ(?!ใจ)|สั่งซื้อ|เช่า(?:พระ|บูชา)|ราคา|\d[\d,]*\s*บาท|฿|โอนเงิน|จ่ายเงิน|ชำระเงิน|ค่าบริการ|ทำบุญแทน|บริการ[^\s]{0,8}แทน/,
      /\b(?:buy|buying|bought|purchas\w*|prices?|priced|fees?|baht|shop|on your behalf|pay(?:ment|ing)? (?:for|us|the fee))\b|฿/i,
      /购买|买(?!单)|价格|付款|支付|下单|商店|泰铢|代办|代为|费用/,
    ],
    remedy: [
      new RegExp(String.raw`(?:เปลี่ยน|ตั้ง)(?:ชื่อ|นามสกุล|เบอร์|เลขทะเบียน|ทะเบียน)|เลขมงคล|เบอร์มงคล|เลขนำโชค|วาง[^\s]{0,14}(?:ในบ้าน|ที่บ้าน` +
        String.raw`|หน้าบ้าน|บนโต๊ะ|ในห้อง)|แขวน|ทำพิธี|สะเดาะเคราะห์|ตัดกรรม|แก้กรรม|เสริมฮวงจุ้ย|วิธีปรับ|ข้อแนะนำทั่วไปคือ|เคล็ดเสริมดวง` +
        String.raw`|วิธีเสริมจุดนี้|สิ่งที่ควรทำตามตำรา|สีที่เข้ากับผลครั้งนี้|ถ้าอยากใช้สีช่วยเสริม|ทิศที่ส่งเสริม|ทิศมงคล`),
      new RegExp(String.raw`\b(?:change (?:your )?(?:name|phone number|number|plate)|lucky numbers?|place (?:a|an|the|some) [^.]{0,30}\b(?:in` +
        String.raw`|at|on|by) (?:your|the) (?:home|house|desk|door|bedroom|room)|hang (?:a|an)|rituals?|ceremon\w*|a simple adjustment` +
        String.raw`|try this simple adjustment|for colou?r, you could add|tones suit you)\b`, "i"),
      /改名|换号|吉祥号码|幸运数字|摆放|挂在|放在家|办公桌上|仪式|法事|调整的方法是|建议这样调整|颜色上可以多用|这段时间和你比较合/,
    ],
    belief: [
      /ทำบุญ|ไหว้|ไท้ส่วย|แก้ชง|ตักบาตร|ขอพร|สวดมนต์|สมาธิ|ใส่บาตร|กรวดน้ำ|แผ่เมตตา|รักษาศีล|ทำความดี|ทำทาน|ปฏิบัติธรรม/,
      /\b(?:merit|tai sui|pray\w*|chant\w*|meditat\w*|temples?|shrines?|good deeds?|alms|kindness)\b/i,
      /行善|积德|太岁|祈祷|祈福|诵经|念经|冥想|静坐|拜佛|参拜|拜太岁|布施|做好事|上香|礼佛/,
    ],
    colour: [
      /สี(?:ประจำ|มงคล|เสื้อ|แดง|เหลือง|ชมพู|เขียว|ส้ม|ฟ้า|น้ำเงิน|ม่วง|ดำ|เทา|ขาว|ครีม|ทอง|เงิน|น้ำตาล|ของวัน)|โทนสี/,
      /\b(?:colou?rs?|red|yellow|pink|green|orange|blue|navy|purple|black|grey|gray|white|cream|gold)\b/i,
      /颜色|红色|黄色|粉色|绿色|橙色|蓝色|紫色|黑色|灰色|白色|色系/,
    ],
  };
  /** the kind of an advice line: "lucky" | "purchase" | "remedy" | "belief" | "colour" | "" @param {any} text */
  function adviceKind(text) {
    const t = canon(text);
    if (!t.trim()) return "";
    for (const k of KINDS) if (WORDS[k].some(re => re.test(t))) return k;
    return "";
  }
  /** fatalistic: an unavoidable bad outcome, or a bad period with no way forward. [Thai, English, Chinese] */
  const FATAL = [
    new RegExp(String.raw`หลีกเลี่ยงไม่ได้|หนีไม่พ้น|ไม่มีทาง(?:แก้|รอด|ออก|ดีขึ้น|หนี)|หมดหวัง|สิ้นหวัง|ไม่มีวัน(?:ดีขึ้น|สำเร็จ|หาย|สมหวัง)` +
      String.raw`|ชะตาขาด|ถึงฆาต|เคราะห์หนัก|ดวงซวย|ซวยหนัก|ล่มจม|พังทลาย|หายนะ|จุดจบ|ย่อยยับ|(?:จะ|ต้อง)(?:ล้มเหลว|สูญเสียทุกอย่าง` +
      String.raw`|พังพินาศ)|ไม่มีอะไรช่วยได้|ทำอะไรก็ไม่ขึ้น|อับจน|ดวงตกหนัก|ตกต่ำที่สุด`),
    new RegExp(String.raw`\b(?:inevitabl\w*|unavoidabl\w*|doom(?:ed)?|hopeless\w*|no way out|nothing (?:you can do|can help)|bound to (?:fail` +
      String.raw`|lose|suffer)|will (?:surely |certainly )?(?:fail|lose everything|be ruined)|ruin(?:ed|ous|s)?|disaster\w*|catastroph\w*` +
      String.raw`|cursed|never (?:get better|recover|succeed)|no escape|cannot escape)\b`, "i"),
    /注定|无法避免|不可避免|难逃|在劫难逃|必然失败|必定失败|毫无希望|没有希望|绝望|绝境|无路可走|厄运|灾难|劫数|大凶|一败涂地|永远不会好|无可挽回|走投无路/,
  ];
  const BAD = [
    /ดวงตก|ดวงอ่อน|ดวงไม่ดี|ช่วงขาลง|ช่วงไม่ดี|ช่วงวิกฤต|ตกต่ำ|เคราะห์|มีเกณฑ์(?:เสีย|สูญ|เจ็บ|ป่วย)|ดวงถดถอย/,
    /\b(?:weak (?:period|patch|phase|spot)|bad (?:period|luck|time|year|patch)|low (?:period|point|phase)|hard (?:period|year)|losses|setbacks?|misfortune|unlucky)\b/i,
    /运势低迷|运势不佳|低谷|不顺|坏运|凶|破财|损失|阻碍|倒霉/,
  ];
  const FORWARD = [
    /ผ่านไป|ค่อย ?ๆ|ทำได้|ลอง|ควร|ช่วย|ดีขึ้น|เริ่ม|วางแผน|ดูแล|พัก|ปรึกษา|ทีละ|รับมือ|แก้ไข|ป้องกัน|เตรียม|ระวัง|เติบโต|เรียนรู้|โอกาส/,
    /\b(?:pass(?:es)?|can|could|try|step|plan\w*|help\w*|improv\w*|ease|recover\w*|look after|rest|talk|prepar\w*|watch|steady|careful\w*|learn\w*|grow\w*|chance)\b/i,
    /会过去|可以|试着|慢慢|好转|一步|计划|照顾|休息|聊聊|准备|注意|帮助|调整|稳|学习|成长|机会/,
  ];
  const any = (/** @type {RegExp[]} */ list, /** @type {string} */ t) => list.some(re => re.test(t));
  /** true when the sentence states an unavoidable bad outcome or a bad period without a way forward @param {any} text @param {string} [lang] */
  // eslint-disable-next-line no-unused-vars
  function fatalistic(text, lang) {
    const t = canon(text);
    if (!t.trim()) return false;
    return any(FATAL, t) || (any(BAD, t) && !any(FORWARD, t));
  }
  /** the sentences of a paragraph; Thai clauses are separated by spaces @param {string} t */
  function pieces(t) {
    const out = [];
    for (const s of String(t).match(/[^.!?。！？]+[.!?。！？]*\s*/g) || []) {
      if (/[฀-๿]/.test(s)) out.push(...s.trim().split(/\s+/).filter(Boolean));
      else if (s.trim()) out.push(s.trim());
    }
    return out;
  }
  /** a paragraph for a calm reading: lucky-object, purchase, other-remedy, free-belief-guidance (crisis-v2-live, decision 23) and
   *  fatalistic sentences removed; neutral colours stay ("" when nothing is left) @param {any} text @param {string} [lang] */
  function calmText(text, lang) {
    const ps = pieces(canon(text));
    const keep = ps.filter((p, i) => {
      const k = adviceKind(p);
      if (k === "lucky" || k === "purchase" || k === "remedy" || k === "belief") return false;
      if (any(FATAL, p)) return false;
      // a Thai clause may get its way forward from the clause next to it
      if (any(BAD, p) && !any(FORWARD, p) && !(/[฀-๿]/.test(p) && (any(FORWARD, ps[i + 1] || "") || any(FORWARD, ps[i - 1] || "")))) return false;
      return true;
    });
    void lang;
    return keep.join(" ").replace(/\s+([,.!?。！？，])/g, "$1").trim();
  }
  /** the hope frame of a calm reading (a fixed opening and closing line) */
  const HOPE = {
    reviewStatus: "pending-professional-review",
    th: { open: "ช่วงที่หนักใจไม่ได้อยู่ตลอดไป อ่านคำทำนายต่อไปนี้เป็นแนวทางเบา ๆ ได้ สิ่งที่คุณทำได้ในแต่ละวันสำคัญกว่าดวงเสมอ",
      close: "ทุกช่วงเวลาค่อย ๆ ผ่านไปได้ทีละวัน ดูแลเรื่องเล็ก ๆ อย่างกินข้าว พักผ่อน และคุยกับคนที่ไว้ใจ ถ้าอยากคุยกับใครตอนนี้ แตะปุ่ม “อยากมีคนรับฟัง” ที่ด้านบนของหน้าได้เลย" },
    en: { open: "Hard periods do not last forever. Read what follows as a gentle guide; what you can do each day matters more than any reading.",
      close: "Every period can be taken one day at a time. Look after the small things: eating, resting and talking to someone you trust. " +
        "If you would like to talk to someone now, tap the \u201cWant someone to listen?\u201d button at the top of the page." },
    zh: { open: "艰难的时期不会一直持续。下面的内容可以当作温和的参考；你每天能做的事，比任何解读都重要。",
      close: "每段时期都可以一天一天地走过。照顾好小事：按时吃饭、好好休息、和信任的人聊聊。如果现在想找人聊聊，可以点页面上方的“想找人倾听？”按钮。" },
  };
  /** one line of the hope frame as an element (fixed text, pending professional review) @param {any} d @param {string} t @param {string} k */
  function hopeNode(d, t, k) {
    const n = d.createElement("p"); n.className = "fa-hope fa-hope-" + k; n.textContent = t;
    n.setAttribute("role", "note"); n.setAttribute("data-review", HOPE.reviewStatus);
    return n;
  }
  /** the hope frame in one language @param {any} lang */
  const hope = lang => { const L = /** @type {any} */ (HOPE)[helpLang(lang)]; return { open: L.open, close: L.close, reviewStatus: HOPE.reviewStatus }; };
  /* ---------------- the one help place in a calm tab (crisis-v2-live, owner decisions 2026-11-15: 1 option ก + 54 ข) ----------------
     Replaces v2's pinned bottom bar, the help line under the reading and the sticky dock: on a calm page (after "ดูคำทำนายต่อ",
     the soft step's "Just the reading", or a calm tab) the top button #lqHelpTop (tools/helpline.mjs) is the ONE help place.
     It is made prominent (larger, high contrast; styles.css html[data-lq-calm] #lqHelpTop) and stays in view below the site
     header while the page scrolls, and ONE "more help numbers" control inside it lists 1669, 191, 1300 and Samaritans (each once).
     The crisis card itself still lists every number. Numbers: docs/CRISIS-RESOURCES.md (verified on the agencies' own pages).
     REVIEW: the "more help numbers" wording is pending review by a Thai mental-health professional (L63). */
  const MORE_IDS = ["1669", "191", "1300", "samaritans"];
  /** one small tap-to-call button (the same shape as tools/helpline.mjs miniCall): label and number are the link's own text
   *  @param {any} d @param {string} id @param {string} l @param {boolean} keys */
  function miniCall(d, id, l, keys) {
    const K = callKit(), x = K && K.LINES[id];
    const span = d.createElement("span"); span.className = "lq-call-mini"; span.setAttribute("data-lq-call", id);
    const a = d.createElement("a"); a.className = "lq-call-btn lq-helpline-tel";
    const n = x ? x.n : id, W = x ? x[l] : { btn: n, label: "" };
    a.setAttribute("href", "tel:" + (x ? x.tel : id)); a.setAttribute("aria-label", W.btn);
    if (keys) a.setAttribute("data-i18n-attr", "aria-label:call." + id + ".btn");
    const t = d.createElement("span"); t.className = "lq-call-mini-t"; t.textContent = W.label; if (keys) t.setAttribute("data-i18n", "call." + id + ".label");
    const b = d.createElement("b"); b.className = "lq-call-mini-n"; b.textContent = n;
    a.appendChild(t); a.appendChild(b); span.appendChild(a); // the link's own gap separates label and number
    return span;
  }
  /** the "more help numbers" control (a <details>, closed) @param {any} d @param {string} l @param {boolean} keys */
  function moreHelp(d, l, keys) {
    const det = d.createElement("details"); det.className = "lq-helpmore"; det.setAttribute("data-lq-more", "");
    det.setAttribute("data-review", "pending-professional-review");
    const sum = d.createElement("summary"); sum.textContent = HELP[l].more; if (keys) sum.setAttribute("data-i18n", "help.line.more");
    det.appendChild(sum);
    const ul = d.createElement("ul");
    for (const id of MORE_IDS) { const li = d.createElement("li"); li.appendChild(miniCall(d, id, l, keys)); ul.appendChild(li); }
    // closed: the list is hidden outright (Chrome keeps layout boxes for the content of a closed <details>, so the closed numbers
    // would still count as on screen); it is shown when the control opens
    ul.hidden = true;
    det.addEventListener("toggle", () => { ul.hidden = !det.open; });
    det.appendChild(ul);
    return det;
  }
  /** the top help row for a page without the static one: 1323 + the "more help numbers" control @param {any} [doc] @param {string} [lang] @param {string} [cls] */
  function helpBar(doc, lang, cls) {
    const d = doc || root.document, I = /** @type {any} */ (root).LQI18N, keys = !!(I && typeof I.apply === "function");
    const l = keys ? "th" : helpLang(lang || "th");
    const box = d.createElement("aside"); box.className = "lq-helpline lq-helpbar" + (cls ? " " + cls : "");
    box.setAttribute("role", "note"); box.setAttribute("aria-label", HELP[l].label); box.setAttribute("data-i18n-attr", "aria-label:help.line.label");
    box.setAttribute("data-review", "pending-professional-review");
    box.appendChild(miniCall(d, "1323", l, keys)); box.appendChild(moreHelp(d, l, keys));
    if (keys) { try { I.apply(box); } catch (e) { /* i18n not ready: Thai stays */ } }
    return box;
  }
  /** keep the top row just below the sticky site header (the header's top row scrolls away on wide screens) @param {any} d @param {any} top */
  function stickTop(d, top) {
    try {
      const w = d.defaultView; if (!w || !top.style) return;
      const set = () => {
        const nav = d.querySelector(".nav"), util = nav && nav.querySelector(".nav-util");
        const h = nav ? Math.max(0, nav.offsetHeight - (util ? util.offsetHeight : 0)) : 0;
        top.style.setProperty("--lq-helptop-y", h + "px");
      };
      set();
      if (!top.__lqStick) { top.__lqStick = 1; w.addEventListener("resize", set); w.addEventListener("load", set); }
    } catch (e) { /* no layout */ }
  }
  /** make the page's top help row the calm one (idempotent): prominent, sticky, ONE "more help numbers" control @param {any} [doc] */
  function calmTop(doc) {
    const d = doc || root.document;
    if (!d || typeof d !== "object" || !d.body) return null;
    try {
      const I = /** @type {any} */ (root).LQI18N, keys = !!(I && typeof I.apply === "function"), l = keys ? "th" : helpLang(I && I.lang);
      let top = d.getElementById ? d.getElementById("lqHelpTop") : null;
      if (!top) {
        top = helpBar(d, l);
        top.setAttribute("id", "lqHelpTop");
        const main = d.querySelector("main");
        if (main && main.parentNode && main.parentNode.insertBefore) main.parentNode.insertBefore(top, main);
        else if (d.body.firstChild && d.body.insertBefore) d.body.insertBefore(top, d.body.firstChild); else d.body.appendChild(top);
      } else if (!top.querySelector("[data-lq-more]")) {
        const more = moreHelp(d, l, keys); top.appendChild(more);
        if (keys) { try { I.apply(more); } catch (e) { /* Thai stays */ } }
      }
      top.classList.add("lq-helptop-calm");
      top.setAttribute("data-review", "pending-professional-review");
      stickTop(d, top);
      return top;
    } catch (e) { return null; }
  }
  const CARD = {
    th: {
      title: "เราอยู่ตรงนี้นะ",
      lead: "ขอบคุณที่บอกให้เรารู้ ช่วงนี้คุณอาจกำลังแบกเรื่องหนักใจอยู่ ความรู้สึกแบบนี้เกิดขึ้นได้กับทุกคน และคุณไม่ต้องผ่านมันไปคนเดียว",
      body: "ถ้าอยากคุยกับใครสักคนตอนนี้ มีคนพร้อมรับฟังและช่วยเหลือ แตะที่เบอร์เพื่อโทรได้เลย",
      lines: [["1323", "สายด่วนสุขภาพจิต กรมสุขภาพจิต — โทรฟรี ตลอด 24 ชั่วโมง"], ["1669", "เจ็บป่วยฉุกเฉิน / ต้องการรถพยาบาล"], ["191", "เหตุด่วนเหตุร้าย / แจ้งตำรวจ"],
        ["1300", "ศูนย์ช่วยเหลือสังคม กระทรวง พม. — ความรุนแรงในครอบครัว ปัญหาเด็กและเยาวชน ตลอด 24 ชั่วโมง"],
        ["02 113 6789", "สมาคมสะมาริตันส์แห่งประเทศไทย — รับฟังทุกเรื่อง 12:00–22:00 น.", "021136789"]],
      after: "ถ้าทำได้ ลองบอกคนที่คุณไว้ใจสักคนว่ากำลังรู้สึกอย่างไร ถ้ารู้สึกไม่ปลอดภัยตอนนี้ ไปโรงพยาบาลใกล้บ้านหรือโทร 1669 ถ้าอยู่นอกประเทศไทย โทรเบอร์ฉุกเฉินของประเทศนั้น",
      cont: "ดูคำทำนายต่อ",
      contNote: "คำทำนายยังอยู่ และปุ่มโทรขอความช่วยเหลือจะอยู่ด้านบนของหน้าตลอด",
      foot: "ข้อความที่คุณพิมพ์ไม่ได้ถูกบันทึกหรือส่งไปที่ใด · ถ้อยคำบนการ์ดนี้กำลังรอผู้เชี่ยวชาญด้านสุขภาพจิตตรวจทาน",
      call: "โทร",
    },
    en: {
      title: "We're here with you",
      lead: "Thank you for letting us know. You may be carrying something heavy right now. Feelings like this can happen to anyone, and you don't have to go through them alone.",
      body: "If you'd like to talk to someone now, people are ready to listen and help. Tap a number to call.",
      lines: [["1323", "Thai Department of Mental Health hotline — free, 24 hours"], ["1669", "Medical emergency / ambulance"], ["191", "Police emergency"],
        ["1300", "Social Assistance Center (Ministry of Social Development and Human Security) — domestic violence, children and young people; 24 hours"],
        ["02 113 6789", "Samaritans of Thailand — listening line, 12:00–22:00", "021136789"]],
      after: "If you can, tell someone you trust how you are feeling. If you feel unsafe right now, go to the nearest hospital or call 1669. Outside Thailand, call your local emergency number.",
      cont: "Continue to the reading",
      contNote: "Your reading is still here, and the call-for-help button stays at the top of the page.",
      foot: "Nothing you typed was saved or sent anywhere · The wording on this card is awaiting review by a mental-health professional",
      call: "Call",
    },
    zh: {
      title: "我们在这里陪着你",
      lead: "谢谢你告诉我们。你现在可能正承受着很沉重的事情。有这样的感受并不奇怪，你不需要独自面对。",
      body: "如果你现在想找人聊聊，有人愿意倾听和帮助。点一下号码就可以拨打。",
      lines: [["1323", "泰国心理健康热线（泰国卫生部心理健康司）— 免费，24 小时"], ["1669", "医疗急救 / 救护车"], ["191", "报警（泰国警察）"], ["1300", "泰国社会援助中心（社会发展与人类安全部）— 家庭暴力、儿童和青少年问题，24 小时"],
        ["02 113 6789", "泰国撒玛利亚会（Samaritans of Thailand）倾听热线 — 12:00–22:00", "021136789"]],
      after: "如果可以，请告诉一位你信任的人你现在的感受。如果你现在觉得不安全，请去最近的医院或拨打 1669。如果你不在泰国，请拨打当地的紧急电话。",
      cont: "继续查看解读",
      contNote: "解读还在，求助按钮会一直显示在页面上方。",
      foot: "你输入的内容没有被保存或发送 · 这张卡片的措辞正在等待心理健康专业人士审阅",
      call: "拨打",
    },
  };
  const CALM_ADVICE = { th: "คำแนะนำ", en: "Advice", zh: "建议" };
  /** crisis flow v2 §2–§4: a reading for the calm state. Gentle only (a straight reading is never calmed, see renderWithHooks),
   *  no plan, every paragraph through the calm filter (lucky objects, purchases, other remedies and fatalistic sentences out;
   *  free belief guidance and colours stay), the hope frame added. Idempotent. @param {any} res */
  function calmReading(res) {
    if (!res || res.crisis || !Array.isArray(res.sections)) return res;
    if (res.calm) return res;
    const lang = res.lang === "en" || res.lang === "zh" ? res.lang : "th", ct = t => calmText(t, lang);
    const out = Object.assign({}, res);
    delete out.plan;
    let secs = res.sections.map(s => {
      const ps = (s.paragraphs || []).map(ct).filter(p => p.trim());
      const n = (s.paragraphs || []).length, main = typeof s.main === "number" && s.main > 0 && s.main < n ? Math.max(1, Math.min(ps.length, s.main)) : s.main;
      const o = Object.assign({}, s, { paragraphs: ps, main });
      if (s.id === "advice" || (s.title && adviceKind(s.title) && /^(?:lucky|purchase|remedy)$/.test(adviceKind(s.title)))) o.title = CALM_ADVICE[lang]; // "…และเคล็ดเสริมดวง" → "คำแนะนำ"
      return o;
    }).filter(s => s.paragraphs.length);
    if (!secs.length) secs = [{ id: "overview", title: (res.sections[0] && res.sections[0].title) || "", paragraphs: [HOPE[lang].open] }];
    out.sections = secs;
    if (res.summary && Array.isArray(res.summary.lines)) out.summary = Object.assign({}, res.summary, { lines: res.summary.lines.map(l => Object.assign({}, l, { t: ct(l.t) })).filter(l => l.t) });
    if (res.why && Array.isArray(res.why.lines)) out.why = Object.assign({}, res.why, { lines: res.why.lines.map(l => Object.assign({}, l, { t: ct(l.t) })).filter(l => l.t) });
    out.hope = hope(lang);
    out.calm = true;
    return out;
  }

  // crisis-v2-live: the calm top button, "more help numbers", the card actions and the hope frame (moved from styles.css)
  const CALM_TOP_CSS = "html[data-lq-calm] #lqHelpTop{position:sticky;top:var(--lq-helptop-y,0px);z-index:55;justify-content:center;gap:6px 10px;margin:0 auto 8px;p" +
    "adding:8px 12px;background:#fff;border-bottom:1px solid #d5dde8;box-shadow:0 4px 10px -6px rgba(14,20,48,.25)}html[data-lq-calm] #lqHelpTop>" +
    ".lq-call-mini{flex:1 1 260px;max-width:560px}html[data-lq-calm] #lqHelpTop>.lq-call-mini>a.lq-call-btn[href]{width:100%;justify-content:cent" +
    "er;min-height:56px;padding:8px 20px;background:#0b2540;color:#fff;font-size:1.1rem;box-shadow:0 0 0 3px #fbbf24}html[data-lq-calm] #lqHelpTo" +
    "p>.lq-call-mini>a.lq-call-btn[href]:hover{background:#071a2e;color:#fff}html[data-lq-calm] #lqHelpTop>.lq-call-mini .lq-call-mini-n{font-siz" +
    "e:1.4rem;line-height:1.1}.lq-helpmore{flex:0 1 auto;max-width:100%}.lq-helpmore>summary{display:flex;align-items:center;min-height:44px;padd" +
    "ing:0 12px;border-radius:12px;cursor:pointer;color:#0b2540;font-weight:600;text-decoration:underline}.lq-helpmore>ul{list-style:none;margin:" +
    "6px 0 2px;padding:0;display:grid;gap:6px}.lq-helpmore .lq-call-mini>a.lq-call-btn[href]{background:#0b5d8f}.fa-support h3{margin:0 0 .4em}.f" +
    "a-support ul{list-style:none;padding:0;margin:.6em 0}.fa-support-act{margin:.8em 0 .4em}.fa-support-act .fa-continue{min-height:44px;padding" +
    ":.5em 1.2em;border-radius:12px}.fa-support-cont-note{font-size:.9em;margin:.4em 0 0}.fa-hope{margin:.4em 0 1em;padding:.7em .9em;border-left" +
    ":3px solid #38bdf8;background:rgba(56,189,248,.08);border-radius:8px;line-height:1.6}";
  try {
    const d = root.document;
    if (d && d.head && d.getElementById && !d.getElementById("lq-calm-top-style")) {
      const st = d.createElement("style"); st.id = "lq-calm-top-style"; st.textContent = CALM_TOP_CSS; d.head.appendChild(st);
    }
  } catch (e) { /* no DOM */ }
  return { HELP, helpLine, helpHTML, calmDock, adviceKind, fatalistic, calmText, HOPE, hope, hopeNode, helpBar, calmTop, WORDS, CARD, calmReading };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = install;
  else { const C = /** @type {any} */ (root).LQFortuneCrisis; if (C && typeof C.__install === "function") C.__install(install); }
})(typeof window !== "undefined" ? window : globalThis);
