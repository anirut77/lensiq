/* fortune-share.js — share and print on every fortune result (owner order 2026-11-16 items 1-2), loaded on all 18 fortune pages
 * (CLAUDE.md category 6) after fortune-crisis.js. One module replaces the per-page share cards and print buttons.
 *
 *   Share  a result card drawn on a canvas IN THIS BROWSER (fortune-share-card.js, fetched once the result is on screen, so the
 *          tap itself makes no network request): page name, the overview gist only, the date, the 1323 help line, the final
 *          disclaimer line and a link back to the page. "Include my photo" (face / palm pages only) and "include birth data,
 *          age and name" are OFF each time the dialog opens; what the user typed (question, dream, phone, account) is never
 *          on the card. The card text goes through the reading safety filter (FortuneAI.safety) and the crisis word check.
 *          Shared through the phone's share sheet (navigator.share with the image file) when it can take files; LINE (text and
 *          link only, never the image) and Facebook (the page link only) as options; "save image" (download) as fallback.
 *          Nothing is uploaded to our server.
 *   Print  a print view (#lqPrint, built only while printing): the result with every group expanded, a header with the page
 *          name, the date and the disclaimer line repeated on every printed page (table header), colour swatches with a text
 *          label (black-and-white legible), no buttons, menus, navigation or help bar. The browser's own print dialog
 *          (printer or "save as PDF") on phone and computer.
 *   Crisis no share or print button while the crisis flag, the calm session or distress words are on the page; share() and
 *          print() refuse (LQFortuneCrisis.allow, the public check on main).
 * Pure parts (cardModel, lineUrl, fbUrl, allowed, labels, PRINT_CSS) are tested in Node: tests/unit/fortune-share-print.test.js;
 * browser: tests/e2e/fortune-share-print{,-webkit}.e2e.mjs. Docs: docs/FORTUNE-SHARE-PRINT.md. */
(function (root) {
  "use strict";
  const NODE = typeof module !== "undefined" && module.exports && typeof require === "function";
  const crisis = () => (NODE ? require("./fortune-crisis.js") : root.LQFortuneCrisis) || null;

  /* ---------- words (TH / EN / ZH) ---------- */
  const LINE = {
    th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
    en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
    zh: "基于命理学原则，属个人信仰，请自行判断。",
  };
  // the help line travels with every shared card (owner order 2026-11-12; same words as fk.card.help)
  const HELP = {
    th: "อยากมีคนรับฟัง โทร 1323 · พูดคุยได้ตลอด 24 ชั่วโมง กับผู้ที่พร้อมรับฟัง",
    en: "Want someone to listen? Call 1323 · Talk any time, 24 hours a day, with someone ready to listen",
    zh: "想找人倾听？拨打 1323 · 24 小时随时可以聊，有人愿意倾听",
  };
  const L = {
    th: { share: "แชร์การ์ดผลลัพธ์", print: "พิมพ์", title: "แชร์การ์ดผลลัพธ์", photo: "ใส่รูปของฉันในการ์ด", birth: "ใส่วันเกิด อายุ และชื่อในการ์ด",
      native: "แชร์ผ่านแอปในเครื่อง", line: "ส่งทาง LINE", facebook: "แชร์ลิงก์ทาง Facebook", save: "บันทึกรูปการ์ด", close: "ปิด",
      note: "การ์ดสร้างในเครื่องนี้ ไม่อัปโหลดไปที่ใด LINE ได้ข้อความกับลิงก์ Facebook ได้เฉพาะลิงก์หน้าเว็บ",
      saved: "บันทึกรูปการ์ดแล้ว", fail: "สร้างการ์ดไม่สำเร็จ", refused: "ตอนนี้ปิดการแชร์และการพิมพ์ไว้ก่อน", born: "เกิด", preview: "ตัวอย่างการ์ดผลลัพธ์",
      printed: "พิมพ์เมื่อ", made: "สร้างจาก", include: "ใส่ชื่อและข้อมูลที่กรอกในหน้าที่พิมพ์", photoPrint: "ใส่รูปถ่ายในรายงาน" },
    en: { share: "Share result card", print: "Print", title: "Share result card", photo: "Include my photo on the card", birth: "Include birth date, age and name",
      native: "Share with apps", line: "Send on LINE", facebook: "Share link on Facebook", save: "Save card image", close: "Close",
      note: "The card is made on this device and uploaded nowhere. LINE gets the text and link; Facebook gets the page link only.",
      saved: "Card image saved", fail: "Could not make the card", refused: "Sharing and printing are off for now", born: "Born", preview: "Result card preview",
      printed: "Printed", made: "Made with", include: "Include my name and what I entered when printing", photoPrint: "Include my photo in the report" },
    zh: { share: "分享结果卡片", print: "打印", title: "分享结果卡片", photo: "在卡片上放我的照片", birth: "在卡片上放出生日期、年龄和名字",
      native: "用手机应用分享", line: "通过 LINE 发送", facebook: "在 Facebook 分享链接", save: "保存卡片图片", close: "关闭",
      note: "卡片在本机生成，不上传到任何地方。LINE 只收到文字和链接，Facebook 只收到网页链接。",
      saved: "卡片图片已保存", fail: "卡片生成失败", refused: "目前已暂停分享和打印", born: "出生", preview: "结果卡片预览",
      printed: "打印于", made: "生成自", include: "打印时包含我的姓名和填写的资料", photoPrint: "在报告中放入我的照片" },
  };
  const N3 = (th, en, zh) => ({ th, en, zh });
  /* page → its result(s). root: the result (its visibility = the result is on screen; it is what is printed); share / print:
     the page's own buttons (kept, now driven by this module); at: where missing buttons go (default: next to the other button,
     else a bar at the end of the root); gist: where the overview is when the page has no reading layout; photo: the canvas
     that holds the person's photo (face / palm only); personal: the page asks for birth data, an age or a name */
  const PAGES = {
    fortune: { name: N3("ศาสตร์ดูดวง", "Fortune Readings", "占卜"), results: [{ root: ".ft-hero", printRoot: "main.ft",
      blurb: N3("รวมศาสตร์ดูดวงไทย จีน และตะวันตกไว้ในที่เดียว เลือกศาสตร์ที่ตรงกับเรื่องที่อยากรู้ได้เลย",
        "Thai, Chinese and Western fortune traditions in one place. Pick the one that fits what you want to know.", "泰式、中式和西洋命理汇集一处，选一个适合你想了解的问题。") }] },
    faceread: { name: N3("อ่านโหงวเฮ้ง", "Face Reading", "面相解读"), photo: "#frResCanvas", personal: true,
      results: [{ root: "#frResult", share: "#frShare", printBtn: "#frPrint" }] },
    palm: { name: N3("ดูลายมือ", "Palm Reading", "看手相"), photo: "#plResCanvas", personal: true,
      artOpt: N3("ใส่ภาพลายเส้นมือของฉันในการ์ด", "Include my palm line drawing on the card", "在卡片上放我的掌纹线图"), results: [{ root: "#plResult", share: "#plShare", printBtn: "#plPrint" }] },
    horoscope: { name: N3("ดวงวันเดือนปีเกิด", "Birth-date Horoscope", "生辰八字与泰国占星"), personal: true,
      results: [{ root: "#hsResult", share: "#hsShare", printBtn: "#hsPrint" }] },
    tarot: { name: N3("ไพ่ทาโรต์ & เซียมซี", "Tarot & Siam Si", "塔罗牌 & 求签"),
      results: [{ root: "#trResult", share: "#trShare" }, { root: "#ssResult", share: "#ssShare", gist: "#ssVerse" },
        { root: "#trDailyText", share: "#trDailyShare" }] },
    iching: { name: N3("อี้จิง เสี่ยงกว้า 64", "I Ching", "易经六十四卦占卜"), results: [{ root: "#icResult", share: "#icShare", printBtn: "#icPrint" }, { root: "#icDaily", share: "#icDayShare" }] },
    bazi: { name: N3("แปดอักษร (八字)", "Four Pillars (BaZi)", "八字四柱"), personal: true, results: [{ root: "#lcResult", printBtn: "#lcPrint" }] },
    taksa: { name: N3("ทักษา · มหาทักษา", "Thai Taksa", "塔克萨 · 大运"), personal: true, results: [{ root: "#lcResult", printBtn: "#lcPrint" }] },
    lek7: { name: N3("เลข 7 ตัว 9 ฐาน", "Thai 7-Digit Chart", "七数九基"), personal: true, results: [{ root: "#lcResult", printBtn: "#lcPrint" }] },
    numbers: { name: N3("เลขมงคล", "Lucky Numbers", "吉祥数字"), personal: true, results: [{ root: "#nmResult", share: "#nmShare", printBtn: "#nmPrint" }] },
    fengshui: { name: N3("ฮวงจุ้ย", "Feng Shui", "风水"), personal: true, results: [{ root: "#fsReading", share: "#fsShare", printRoot: "#fsS4" }] },
    dream: { name: N3("ทำนายฝัน", "Dream Interpretation", "解梦"), results: [{ root: "#drResult", share: "#drShare", printBtn: "#drPrint" }] },
    zodiac: { name: N3("12 นักษัตร · ปีชง", "Chinese Zodiac · Tai Sui", "十二生肖 · 犯太岁"), personal: true,
      artOpt: N3("ใส่ภาพนักษัตรของฉันในการ์ด", "Include my zodiac animal picture on the card", "在卡片上放我的生肖图"),
      results: [{ root: "#zdResult", share: "#zdShare", printBtn: "#zdPrint" }, { root: "#zdPairRes" }] },
    astro: { name: N3("ราศีตะวันตก Big Three", "Western Astrology Big Three", "西洋星座 Big Three"), personal: true,
      artOpt: N3("ใส่ภาพราศีจากวันเกิดของฉันในการ์ด", "Include my sign pictures (from my birth date) on the card", "在卡片上放我的星座图（来自出生日期）"),
      results: [{ root: "#asResult", share: "#asShare", printBtn: "#asPrint" }, { root: "#asSignRes" }] },
    lifegraph: { name: N3("กราฟชีวิต", "Life Graph", "人生曲线"), personal: true, results: [{ root: "#lcResult", printBtn: "#lcPrint" }] },
    planner: { name: N3("วางแผนฤกษ์มงคล", "Auspicious date planner", "吉日规划"), results: [{ root: "#plResult", printBtn: "#plPrint", gist: "#plResH, #plResSub" }] },
    luckycolor: { name: N3("กระจกส่องสีเสื้อมงคล", "Lucky-colour outfit mirror", "幸运色穿搭镜"), results: [{ root: "#recBox", at: "#recBox", printRoot: "main", gist: "#recBox" }] },
    report: { name: N3("รายงานดวงของฉัน", "My fortune reports", "我的占卜报告"), personal: true, results: [{ root: "#rpOut", printBtn: "#rpPrint" }] },
  };
  const langOf = l => (l === "en" || l === "zh" ? l : "th");
  /* owner decision 76 (option ก, 2026-11-16): art made from the person (palm line drawing; sign / animal from birth data) is
     off on the card by default and has its own switch, off every time the dialog opens; other pages' art is unchanged */
  const artLabel = (p, lang) => (PAGES[p] && PAGES[p].artOpt ? PAGES[p].artOpt[langOf(lang)] : "");
  const pageName = (p, lang) => (PAGES[p] ? PAGES[p].name[langOf(lang)] : "LENSIQ");

  /* ---------- the card (pure) ---------- */
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const MAX = { th: 360, en: 380, zh: 150 };
  function dateText(d, lang) {
    lang = langOf(lang); d = d instanceof Date ? d : new Date();
    try { return d.toLocaleDateString(lang === "th" ? "th-TH" : lang === "zh" ? "zh-CN" : "en-GB", { day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  }
  /** every way a typed value can show up again in the text (numbers with or without separators, a BE / CE year) */
  function patternsOf(v) {
    v = String(v || "").trim(); if (v.length < 2) return [];
    const out = [new RegExp(esc(v), "gi")];
    const d = v.replace(/\D+/g, "");
    if (d.length >= 5) out.push(new RegExp(d.split("").join("[\\s.-]?"), "g"));
    if (/^\d{4}$/.test(v)) { const y = +v; for (const z of [y + 543, y - 543]) if (z > 1800 && z < 2800) out.push(new RegExp("(?<!\\d)" + z + "(?!\\d)", "g")); }
    return out;
  }
  const AGE = [/อายุ\s*\d{1,3}(?:\s*ปี)?/g, /\b(?:age[ds]?|aged)\s*\d{1,3}\b/gi, /\b\d{1,3}\s*(?:years?|yrs?)\s*old\b/gi, /\d{1,3}\s*(?:岁|歲|周岁)/g];
  const DATES = [/\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}/g, /\b\d{4}-\d{2}-\d{2}\b/g];
  const MK = "\u2063"; // marks where something was taken out, so only a label right before it is tidied away
  const LABEL = new RegExp("(?:เบอร์(?:โทร)?|หมายเลข|วันเกิด|เกิด(?:วันที่)?|ชื่อ(?:เล่น)?|อายุ|\\b(?:born(?: on)?|aged?|name|phone)|出生于?|名字|电话)\\s*[:：]?\\s*" + MK, "gi");
  function scrub(text, values, generic) {
    let t = String(text || "");
    if (generic) for (const re of AGE.concat(DATES)) t = t.replace(re, MK);
    for (const v of values) for (const re of patternsOf(v)) t = t.replace(re, MK);
    if (t.indexOf(MK) < 0) return t.replace(/\s{2,}/g, " ").trim();
    t = t.replace(LABEL, MK).replace(new RegExp("[\\s" + MK + "]*" + MK + "[\\s" + MK + "]*", "g"), " ");
    return t.replace(/\s+([,，、.。:：])/g, "$1").replace(/^[\s,，、.。:：]+/, "").replace(/\(\s*\)|（\s*）/g, "").replace(/\s{2,}/g, " ").trim();
  }
  /** @param {string} t @param {string} lang */
  function splitLines(t, lang) {
    if (lang === "zh") return t.split(/(?<=[。！？])/).map(s => s.trim()).filter(Boolean);
    if (lang === "en") return t.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/).map(s => s.trim()).filter(Boolean);
    return t.split(/\s{2,}|\n+/).map(s => s.trim()).filter(Boolean);
  }
  /** @param {string} s @param {number} n @param {string} lang */
  function cut(s, n, lang) {
    if (s.length <= n) return s;
    if (lang === "zh") return s.slice(0, n - 1) + "…";
    const at = s.lastIndexOf(" ", n - 1);
    return (at > n * 0.5 ? s.slice(0, at) : s.slice(0, n - 1)).replace(/[\s,，.:]+$/, "") + "…";
  }
  /**
   * The card's content. o = { page, lang, gist, date, link, personal: { birth, names[], ages[], typed[] }, include: { photo, birth },
   * hasPhoto, safety (FortuneAI.safety) }. Defaults: no photo, no birth data / age / name; typed text never.
   */
  function cardModel(o) {
    o = o || {};
    const lang = langOf(o.lang), inc = o.include || {}, per = o.personal || {}, P = PAGES[o.page] || {};
    const birthOn = !!inc.birth, photoOn = !!(inc.photo && o.hasPhoto && P.photo), artOn = P.artOpt ? !!inc.art : true;
    const always = [].concat(per.typed || []);
    const personal = [].concat(per.names || [], per.ages || [], String(per.birth || "").split(/\s+/).filter(x => x.length >= 3));
    let t = scrub(o.gist, birthOn ? always : always.concat(personal), !birthOn);
    const C = crisis(), safe = s => !!s && (!o.safety || !o.safety.isSafe || o.safety.isSafe(s)) && !(C && C.check && C.check(s));
    if (o.safety && o.safety.filterText) { try { t = o.safety.filterText(t); } catch (e) { /* keep the per-line check */ } }
    const lines = []; let used = 0;
    for (const s of splitLines(t, lang)) {
      if (!safe(s) || used >= MAX[lang]) continue;
      const x = cut(s, MAX[lang] - used, lang);
      if (!safe(x.replace(/…$/, ""))) continue;
      lines.push(x); used += x.length;
      if (lines.length >= 8) break;
    }
    const birthLine = birthOn && per.birth ? L[lang].born + " " + String(per.birth).trim() : null;
    const m = { page: o.page, lang, title: pageName(o.page, lang), lines, birth: birthOn, photo: photoOn, art: artOn, birthLine,
      names: birthOn ? [].concat(per.names || []).filter(Boolean) : [],
      help: HELP[lang], disclaimer: LINE[lang], link: String(o.link || ""), dateText: dateText(o.date, lang) };
    m.text = [m.title, m.dateText].concat(m.names, lines, birthLine ? [birthLine] : [], [m.help, m.disclaimer, m.link]).filter(Boolean).join("\n");
    return m;
  }
  const lineUrl = (text, link) => "https://line.me/R/share?text=" + encodeURIComponent(String(text || "").trim() + (link ? "\n" + link : ""));
  function fbUrl(link) {
    if (!/^https?:\/\//i.test(String(link || ""))) throw new Error("only http(s) page links are shared");
    return "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(link);
  }

  /* ---------- crisis ---------- */
  /** share / print allowed on this page: not in the crisis state, not calm, no distress words in the page's fields */
  function allowed(doc) {
    const C = crisis();
    if (!C || !C.allow) return true;
    try {
      if (!C.allow("share", doc)) return false;
      const d = doc || root.document;
      return !(d && d.querySelectorAll && C.distress && C.distress(d));
    } catch (e) { return false; }
  }

  /* ---------- print styles ---------- */
  const PRINT_CSS =
    "[data-lq-sp][data-lq-sp-off],[data-lq-sp-bar][data-lq-sp-off],[data-lq-sp-opt][data-lq-sp-off],[data-lq-sp-opt][hidden]," +
    "[data-lq-sp-photo][data-lq-sp-off],[data-lq-sp-photo][hidden]{display:none!important}" +
    "html[data-lq-crisis] [data-lq-sp],html[data-lq-calm] [data-lq-sp],html[data-lq-crisis] [data-lq-sp-bar],html[data-lq-calm] [data-lq-sp-bar]," +
    "html[data-lq-crisis] [data-lq-sp-opt],html[data-lq-calm] [data-lq-sp-opt],html[data-lq-crisis] [data-lq-sp-photo],html[data-lq-calm] [data-lq-sp-photo]{display:none!important}" +
    ".lq-sp-opt{display:inline-flex;align-items:center;gap:.45em;min-height:44px;font-size:.9rem;margin:.2em .4em}.lq-sp-opt input{width:22px;height:22px;flex:none}" +
    ".lq-sp-bar{display:flex;flex-wrap:wrap;gap:.6em;margin:1em 0 .4em}" +
    "#lqPrint{display:none}" +
    "html.lq-sp-open,html.lq-sp-open body{overflow:hidden}" +
    ".lq-sp-dlg{position:absolute;left:0;top:0;width:100%;height:100vh;box-sizing:border-box;" +
    "z-index:1000;background:rgba(8,12,32,.72);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto}" +
    ".lq-sp-dlg[hidden],.lq-sp-dlg [hidden]{display:none!important}" +
    ".lq-sp-box{background:#fff;color:#14182e;border-radius:18px;max-width:420px;width:100%;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.35);max-height:calc(100vh - 32px);overflow:auto}" +
    ".lq-sp-box h2{margin:0 0 .5em;font-size:1.1rem}.lq-sp-box img{display:block;height:42vh;width:auto;max-width:100%;margin:0 auto .6em;border-radius:12px;aspect-ratio:4/5;background:#0e1430}" +
    ".lq-sp-box label{display:flex;align-items:center;gap:.5em;min-height:44px;font-size:.95rem}.lq-sp-box input[type=checkbox]{width:22px;height:22px;flex:none}" +
    ".lq-sp-note{font-size:.82rem;opacity:.8;margin:.3em 0 .8em;line-height:1.5}" +
    ".lq-sp-acts{display:grid;gap:.5em}.lq-sp-acts button{min-height:44px;width:100%}" +
    "@media (prefers-color-scheme:dark){.lq-sp-box{background:#161b36;color:#eef1ff}}" +
    "@media print{" +
    "body.lq-printing>*:not(#lqPrint){display:none!important}" +
    "#siteNav,header.nav,.lq-helpbar,nav,button,select,input,textarea,.lq-toc,[data-lq-sp-bar],[data-lq-sp-opt],[data-lq-sp-photo],.lq-sp-dlg,dialog,.toast{display:none!important}" +
    "body.lq-printing{background:#fff!important;color:#111!important;margin:0;padding:0}" +
    "#lqPrint{display:block!important}#lqPrint:not(.lqp){color:#111;background:#fff;font-size:11pt;line-height:1.55}" +
    "#lqPrint *{box-shadow:none!important;text-shadow:none!important;animation:none!important;transition:none!important}" +
    "#lqPrint:not(.lqp) :is(p,li,h1,h2,h3,h4,h5,span,b,strong,small,td,th,dt,dd,em,a,div,section,article){color:#111!important}" +
    "#lqPrint :is(section,article,div,aside){background-image:none!important}" +
    "#lqPrint .lq-pr-t{width:100%;border-collapse:collapse}#lqPrint .lq-pr-t>thead{display:table-header-group}#lqPrint .lq-pr-t>tfoot{display:table-footer-group}" +
    "#lqPrint .lq-pr-t td{padding:0;vertical-align:top}" +
    "#lqPrint .lq-pr-head{display:flex;justify-content:space-between;gap:1em;border-bottom:1.5pt solid #111;padding:0 0 3pt;margin:0 0 4pt;font-size:9.5pt;font-weight:600}" +
    "#lqPrint .lq-pr-line{font-size:8.5pt;margin:0 0 8pt}" +
    // header, disclaimer and link in the device's own Thai UI font: its marks keep their text in the PDF (copy / search works)
    "#lqPrint[lang=th] .lq-pr-head,#lqPrint[lang=th] .lq-pr-line,#lqPrint[lang=th] .lq-pr-foot{font-family:Tahoma,'Leelawadee UI',Thonburi,'Noto Sans Thai',Loma,Garuda,sans-serif;" +
    "font-variant-ligatures:none;font-feature-settings:'ccmp' 0,'liga' 0,'clig' 0,'calt' 0,'locl' 0}" +
    "#lqPrint .lq-pr-foot{border-top:.75pt solid #555;margin-top:8pt;padding-top:3pt;font-size:8.5pt}" +
    "#lqPrint [hidden]{display:none!important}" +
    "#lqPrint .lq-more-body{display:block!important}" +
    "#lqPrint .fa-section,#lqPrint .fa-section[data-lq-grouped]:not(.lq-open)>p.lq-gist{display:block!important;-webkit-line-clamp:none!important;line-clamp:none;overflow:visible!important}" +
    "#lqPrint .lq-gist{-webkit-line-clamp:none!important;overflow:visible!important}" +
    "#lqPrint h1,#lqPrint h2,#lqPrint h3,#lqPrint h4{break-after:avoid;page-break-after:avoid}" +
    "#lqPrint img,#lqPrint svg,#lqPrint figure,#lqPrint li{break-inside:avoid;page-break-inside:avoid}#lqPrint img{max-width:100%;height:auto}" +
    "#lqPrint:not(.lqp) svg{color:#111}" +
    "#lqPrint:not(.lqp) :is([style*=background],.lq-sw-chip,.sw,.pl-sw,.lq-look-sw){-webkit-print-color-adjust:exact;print-color-adjust:exact;" +
    "outline:1pt solid #111;outline-offset:0}" +
    "#lqPrint .lq-pr-swname{font-size:.85em;margin:0 .3em}" +
    "@page{margin:14mm 12mm}" +
    "}";

  const api = { PAGES, L, LINE, HELP, pageName, artLabel, cardModel, scrub, lineUrl, fbUrl, allowed, dateText, PRINT_CSS, last: null };

  /* ================================ browser ================================ */
  if (typeof document === "undefined" || NODE && !root.document) {
    api.share = async (o) => { if (!allowed(o && o.doc)) return false; return false; };
    api.print = (o) => { if (!allowed(o && o.doc)) return false; return false; };
    api.ready = () => Promise.resolve();
    if (NODE) module.exports = api;
    return;
  }
  const doc = document;
  const page = (location.pathname.split("/").pop() || "index.html").replace(/\.html?$/, "") || "index";
  const P = PAGES[page] || null;
  const lang = () => { try { const l = root.LQI18N && root.LQI18N.lang; if (l) return langOf(l); } catch (e) { /* none */ } return langOf(String(doc.documentElement.lang || "th").slice(0, 2)); };
  const T = k => L[lang()][k];
  const q = (s, r) => { try { return (r || doc).querySelector(s); } catch (e) { return null; } };
  const vis = e => {
    if (!e || !e.isConnected) return false;
    for (let a = e; a; a = a.parentElement) { if (a.hidden) return false; const c = getComputedStyle(a); if (c.display === "none" || c.visibility === "hidden") return false; }
    return true;
  };
  function ensureStyle() {
    if (doc.getElementById("lq-sp-style") || !doc.head) return;
    const s = doc.createElement("style"); s.id = "lq-sp-style"; s.textContent = PRINT_CSS; doc.head.appendChild(s);
  }
  let toastT = 0;
  function toast(msg) {
    let t = doc.getElementById("lqSpToast");
    if (!t) { t = doc.createElement("div"); t.id = "lqSpToast"; t.className = "toast"; t.setAttribute("role", "status"); doc.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2400);
  }
  api.toast = toast;

  /* ---------- buttons ---------- */
  function mkBtn(kind) {
    const b = doc.createElement("button"); b.type = "button"; b.className = kind === "share" ? "btn primary big" : "btn ghost big";
    b.setAttribute("data-lq-sp", kind); b.setAttribute("data-lq-sp-own", ""); b.textContent = T(kind); return b;
  }
  function wire() {
    if (!P) return;
    for (const r of P.results) {
      const rootEl = q(r.root); if (!rootEl) continue;
      const s = r.share ? q(r.share) : null, p = r.printBtn ? q(r.printBtn) : null;
      for (const [e, k] of [[s, "share"], [p, "print"]]) if (e) { e.setAttribute("data-lq-sp", k); e.setAttribute("data-lq-sp-for", r.root); }
      if (r.root === "#rpOut" && !p) continue; // report.js draws its print button with each report
      if ((s && p) || doc.querySelector('[data-lq-sp-own][data-lq-sp-for="' + r.root + '"]')) continue;
      const add = kind => { const b = mkBtn(kind); b.setAttribute("data-lq-sp-for", r.root); return b; };
      if (s) s.after(add("print"));
      else if (p) p.before(add("share"));
      else {
        const bar = doc.createElement("div"); bar.className = "lq-sp-bar"; bar.setAttribute("data-lq-sp-bar", ""); bar.setAttribute("data-lq-sp-for", r.root);
        bar.appendChild(add("share")); bar.appendChild(add("print"));
        const at = r.at ? q(r.at) : null;
        if (at) at.after(bar); else rootEl.appendChild(bar);
      }
    }
    addOpts();
  }
  /* "include my name and what I entered" next to each print button on pages that ask for them: OFF on every page load and
     again after each print (the share card's rule); while it is off the report leaves out names, birth data and typed text */
  function addOpts() {
    if (P && P.photo) addPhotoOpt();
    if (!P || !P.personal) return;
    for (const b of doc.querySelectorAll('[data-lq-sp="print"]')) {
      const forSel = b.getAttribute("data-lq-sp-for") || "";
      if (doc.querySelector('[data-lq-sp-opt][data-lq-sp-for="' + forSel + '"]')) continue;
      const l = doc.createElement("label"); l.className = "lq-sp-opt"; l.setAttribute("data-lq-sp-opt", ""); l.setAttribute("data-lq-sp-for", forSel); l.hidden = true;
      const c = doc.createElement("input"); c.type = "checkbox"; c.checked = false;
      const t = doc.createElement("span"); t.textContent = T("include");
      l.appendChild(c); l.appendChild(t); b.after(l);
    }
  }
  /* "include my photo in the report" (face / palm reading, owner order 2026-11-17): ON by default; OFF = the annotated figure is
     drawn on a neutral outline. The share card keeps its own rule (photo OFF by default). */
  function addPhotoOpt() {
    for (const b of doc.querySelectorAll('[data-lq-sp="print"]')) {
      const forSel = b.getAttribute("data-lq-sp-for") || "";
      if (doc.querySelector('[data-lq-sp-photo][data-lq-sp-for="' + forSel + '"]')) continue;
      const l = doc.createElement("label"); l.className = "lq-sp-opt"; l.setAttribute("data-lq-sp-photo", ""); l.setAttribute("data-lq-sp-for", forSel);
      const c = doc.createElement("input"); c.type = "checkbox"; c.checked = true;
      const t = doc.createElement("span"); t.textContent = T("photoPrint");
      l.appendChild(c); l.appendChild(t); b.after(l);
    }
  }
  function photoChecked(r) {
    const l = r ? doc.querySelector('[data-lq-sp-photo][data-lq-sp-for="' + r.root + '"]') : null, c = l && l.querySelector("input");
    return c ? !!c.checked : true;
  }
  const hasPersonal = () => { const x = personalOf(); return !!(x.birth || x.names.length || x.ages.length || x.typed.length); };
  function includeChecked(r) {
    const l = r ? doc.querySelector('[data-lq-sp-opt][data-lq-sp-for="' + r.root + '"]') : null, c = l && l.querySelector("input");
    return !!(c && c.checked && !l.hidden && vis(l));
  }
  function resetOpts() { for (const c of doc.querySelectorAll("[data-lq-sp-opt] input")) /** @type {HTMLInputElement} */ (c).checked = false; }
  function sync() {
    const ok = allowed(doc);
    for (const e of doc.querySelectorAll("[data-lq-sp], [data-lq-sp-bar], [data-lq-sp-opt], [data-lq-sp-photo]")) {
      if (ok) e.removeAttribute("data-lq-sp-off"); else e.setAttribute("data-lq-sp-off", "");
      if (e.hasAttribute("data-lq-sp-own") && e.textContent !== T(e.getAttribute("data-lq-sp"))) e.textContent = T(e.getAttribute("data-lq-sp"));
    }
    for (const l of /** @type {any[]} */ ([...doc.querySelectorAll("[data-lq-sp-photo]")])) {
      const t = l.querySelector("span"); if (t && t.textContent !== T("photoPrint")) t.textContent = T("photoPrint");
    }
    const opts = doc.querySelectorAll("[data-lq-sp-opt]");
    if (opts.length) {
      const show = ok && hasPersonal();
      for (const l of /** @type {any[]} */ ([...opts])) {
        const b = doc.querySelector('[data-lq-sp="print"][data-lq-sp-for="' + l.getAttribute("data-lq-sp-for") + '"]');
        const on = show && !!b && vis(b);
        if (l.hidden === on) l.hidden = !on;
        if (!on) { const c = l.querySelector("input"); if (c) c.checked = false; }
        const t = l.querySelector("span"); if (t && t.textContent !== T("include")) t.textContent = T("include");
      }
    }
    if (!ok) { closeAll(); return; }
    // the result is on screen and the reader has used the page: fetch the card code and the fonts now, so the tap itself needs
    // no request (never during the first page load: a page whose result is there from the start waits for the first touch / key)
    if (used && [...doc.querySelectorAll('[data-lq-sp="share"]')].some(vis)) prefetch();
    if (used && [...doc.querySelectorAll('[data-lq-sp="print"]')].some(vis)) loadPrint();
  }
  function closeAll() {
    const d = doc.getElementById("lqShareDlg"); if (d) d.hidden = true; doc.documentElement.classList.remove("lq-sp-open");
    endPrint();
  }

  /* ---------- which result ---------- */
  function resultFor(btn) {
    if (!P) return null;
    const sel = btn && btn.getAttribute && btn.getAttribute("data-lq-sp-for");
    const list = P.results.filter(r => (!sel || r.root === sel) && vis(q(r.root)));
    return list[0] || P.results.find(r => vis(q(r.root))) || null;
  }
  function gistOf(r) {
    if (r.blurb) return r.blurb[lang()]; // a page without a reading: a fixed, reviewed line (passes FortuneAI.safety)
    const el = q(r.root); if (!el) return "";
    const txt = e => (e && (e.innerText || e.textContent) || "").replace(/\s+/g, " ").trim();
    const pick = [el.querySelector('.fa-section[data-section="overview"] .lq-gist'), el.querySelector(".lq-gist"), el.querySelector(".fa-summary li")];
    for (const e of pick) if (txt(e).length >= 8) return txt(e);
    if (r.gist) { const g = [...doc.querySelectorAll(r.gist)].map(txt).filter(Boolean).join("  "); if (g.length >= 8) return g; }
    for (const e of el.querySelectorAll(".fa-section p, p")) if (txt(e).length >= 20) return txt(e);
    return txt(el).slice(0, 400);
  }
  function personalOf() {
    const out = { birth: "", names: [], ages: [], typed: [] }, parts = [];
    for (const e of /** @type {any[]} */ ([...doc.querySelectorAll("input, textarea, select")])) {
      if (e.closest("#lqShareDlg")) continue;
      const id = e.id || "", type = (e.type || "").toLowerCase();
      if (/^(checkbox|radio|button|submit|range|hidden|file|color)$/.test(type)) continue;
      const v = e.tagName === "SELECT" ? (e.selectedOptions && e.selectedOptions[0] ? e.selectedOptions[0].textContent.trim() : "") : String(e.value || "").trim();
      const raw = String(e.value || "").trim();
      if (!v && !raw) continue;
      const partner = /^(hsP|rpB)/.test(id);
      if (/(Name|Nick)$/i.test(id) && !/Lead/.test(id)) { (partner ? out.typed : out.names).push(raw); continue; }
      if (/Age$/i.test(id)) { out.ages.push(raw); continue; }
      if (/(Day|Month|Year|BirthYear|Time)$/.test(id) && !/^(plTime|zdYear|zdChongYear|rpYear)$/.test(id)) {
        if (partner) { out.typed.push(raw); if (v !== raw) out.typed.push(v); continue; }
        if (e.disabled) continue;
        parts.push(v); if (raw && raw !== v) out.typed.push(raw);
        continue;
      }
      if (e.tagName === "SELECT") continue; // options the page offers (topic, province), not typed
      if (raw.length >= 2) out.typed.push(raw);
    }
    out.birth = parts.join(" ").trim();
    return out;
  }
  function linkOf() {
    try { if (/^https?:$/.test(location.protocol)) return location.origin + location.pathname; } catch (e) { /* file: */ }
    return "https://anirut77.github.io/lensiq/" + page + ".html";
  }
  function photoOf() {
    if (!P || !P.photo) return null;
    const c = q(P.photo);
    return c && c.width > 8 && c.height > 8 ? c : null;
  }
  api.model = function (r, include) {
    const FA = root.FortuneAI;
    return cardModel({ page, lang: lang(), gist: gistOf(r), date: new Date(), link: linkOf(), personal: personalOf(), include, hasPhoto: !!photoOf(),
      safety: FA && FA.safety ? FA.safety : null });
  };
  api.photo = photoOf;
  api.resultFor = resultFor;
  api.lang = lang;
  api.personal = personalOf;
  api.link = linkOf;
  api.includeChecked = includeChecked;
  api.photoChecked = photoChecked;
  /* a page may lend its own symbol art to the card (hexagram, zodiac animal, element glyph …): fn(ctx, x, y, w, h), drawn when
     no photo is on the card; it must not draw the person's photo or any text the user typed */
  const arts = {};
  api.art = (rootSel, fn) => { if (typeof fn === "function") arts[rootSel] = fn; };
  api.artFor = r => (r && arts[r.root]) || null;
  // art queued by the page before this module was fetched (the loader in fortune-notice.js holds LQShareArt.q)
  try { const pre = root.LQShareArt && root.LQShareArt.q; if (pre) for (const [s, f] of pre) api.art(s, f); } catch (e) { /* none */ }
  root.LQShareArt = api.art;
  api.config = () => P;
  api.page = page;

  /* ---------- the card code (fortune-share-card.js), fetched once a result is on screen ---------- */
  let loading = null;
  function prefetch() {
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      if (/** @type {any} */ (root).LQShareCard) { res(/** @type {any} */ (root).LQShareCard); return; }
      const me = [...doc.scripts].find(s => /fortune-share\.js/.test(s.src));
      const v = me && /\?v=(\d+)/.exec(me.src);
      const s = doc.createElement("script"); s.src = "fortune-share-card.js" + (v ? "?v=" + v[1] : ""); s.async = true;
      s.onload = () => (/** @type {any} */ (root).LQShareCard ? res(/** @type {any} */ (root).LQShareCard) : rej(new Error("card code")));
      s.onerror = () => { loading = null; rej(new Error("card code")); };
      doc.head.appendChild(s);
    }).then(C => {
      const r = resultFor(null);
      return C.fonts(r ? gistOf(r) : "").then(() => C, () => C);
    });
    loading.catch(() => { /* retried on the next tap */ });
    return loading;
  }
  api.ready = () => prefetch().then(() => true);

  /* ---------- share ---------- */
  api.share = async function (o) {
    o = o || {};
    if (!allowed(o.doc || doc)) { return false; }
    const r = resultFor(o.button || null);
    if (!r) return false;
    let C;
    try { C = await prefetch(); } catch (e) { toast(T("fail")); return false; }
    if (!allowed(doc)) return false;
    return C.open(api, r);
  };

  /* ---------- print ---------- */
  const COLOURS = [
    [[220, 38, 38], "แดง", "red", "红色"], [[234, 88, 12], "ส้ม", "orange", "橙色"], [[234, 179, 8], "เหลือง", "yellow", "黄色"],
    [[212, 175, 55], "ทอง", "gold", "金色"], [[22, 163, 74], "เขียว", "green", "绿色"], [[56, 189, 248], "ฟ้า", "light blue", "浅蓝色"],
    [[29, 78, 216], "น้ำเงิน", "blue", "蓝色"], [[124, 58, 237], "ม่วง", "purple", "紫色"], [[236, 72, 153], "ชมพู", "pink", "粉色"],
    [[120, 72, 36], "น้ำตาล", "brown", "棕色"], [[17, 17, 17], "ดำ", "black", "黑色"], [[250, 250, 250], "ขาว", "white", "白色"],
    [[140, 140, 140], "เทา", "grey", "灰色"], [[240, 230, 200], "ครีม", "cream", "米色"], [[192, 192, 192], "เงิน", "silver", "银色"],
  ];
  function colourName(css) {
    const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(css || "");
    if (!m || (m[4] != null && +m[4] < 0.2)) return "";
    const c = [+m[1], +m[2], +m[3]], li = { th: 1, en: 2, zh: 3 }[lang()];
    /** @type {any} */ let best = null, bd = Infinity;
    for (const k of COLOURS) { const d = (k[0][0] - c[0]) ** 2 + (k[0][1] - c[1]) ** 2 + (k[0][2] - c[2]) ** 2; if (d < bd) { bd = d; best = k; } }
    return best ? best[li] : "";
  }
  const isSwatch = e => {
    if (e.closest("svg") || (e.textContent || "").trim()) return false;
    const st = e.getAttribute("style") || "", cls = typeof e.className === "string" ? e.className : "";
    return /background|--c\s*:|--sw\s*:/.test(st) || /(^|[\s_-])(sw|swatch|chip|dot)([\s_-]|$)/.test(cls);
  };
  const near = e => {
    const t = n => (n && (n.nodeType === 3 ? n.textContent : n.textContent) || "").trim();
    const p = e.parentElement, pt = p ? t(p) : ""; if (pt && pt.length <= 80) return true;
    return [e.previousSibling, e.nextSibling].some(n => { const s = t(n); return s.length > 0 && s.length <= 80; });
  };
  function endPrint() {
    const pv = doc.getElementById("lqPrint"); if (pv) pv.remove();
    if (doc.body) doc.body.classList.remove("lq-printing");
  }
  function buildPrint(r) {
    endPrint();
    const src = (r.printRoot && q(r.printRoot)) || q(r.root); if (!src) return null;
    const lg = lang(), clone = src.cloneNode(true);
    // canvases (charts, wheels) become pictures; the person's photo is never printed
    const oc = [...src.querySelectorAll("canvas")], cc = [...clone.querySelectorAll("canvas")];
    cc.forEach((c, i) => {
      const o = oc[i]; let url = "";
      if (o && !(P.photo && o.matches(P.photo)) && o.width > 0) { try { url = o.toDataURL("image/png"); } catch (e) { url = ""; } }
      if (!url) { c.remove(); return; }
      const im = doc.createElement("img"), w = o.getBoundingClientRect().width;
      im.src = url; im.alt = o.getAttribute("aria-label") || ""; im.className = o.className; im.style.width = w ? w + "px" : ""; c.replaceWith(im);
    });
    if (P.photo) for (const e of clone.querySelectorAll(P.photo)) e.remove();
    for (const e of clone.querySelectorAll("button, select, input, textarea, nav.lq-toc, [data-lq-sp-bar], .rp-actions, .no-print, script, video, iframe, dialog, .lq-sp-dlg, [data-lq-no-print]")) {
      e.remove();
    }
    for (const e of clone.querySelectorAll(".lq-more-body")) e.classList.add("lq-open");
    for (const e of clone.querySelectorAll(".fa-section[data-lq-grouped]")) e.classList.add("lq-open");
    for (const e of clone.querySelectorAll("details")) e.open = true;
    // every tab of the result is printed (a reading in a closed tab panel would be lost on paper)
    for (const e of /** @type {any[]} */ ([...clone.querySelectorAll("[hidden]")])) if (e.matches('[role="tabpanel"]') || e.querySelector(".fa-section, .lq-more-body")) e.hidden = false;
    for (const e of clone.querySelectorAll("[id]")) e.removeAttribute("id");
    clone.removeAttribute("id"); clone.hidden = false;
    // the ancestors' classes (page styles are scoped by them), without their ids or landmarks
    let body = clone;
    for (let a = src.parentElement; a && a !== doc.body; a = a.parentElement) {
      const w = doc.createElement("div"); w.className = a.className || ""; w.appendChild(body); body = w;
    }
    const pv = doc.createElement("div"); pv.id = "lqPrint"; pv.setAttribute("lang", lg === "zh" ? "zh-Hans" : lg);
    const head = `<div class="lq-pr-head"><span>LENSIQ · ${escH(pageName(page, lg))}</span><span>${escH(dateText(new Date(), lg))}</span></div><div class="lq-pr-line">${escH(LINE[lg])}</div>`;
    pv.innerHTML = '<table class="lq-pr-t"><thead><tr><td>' + head + '</td></tr></thead><tfoot><tr><td><div class="lq-pr-foot">' + escH(L[lg].made) + " " + escH(linkOf()) +
      '</div></td></tr></tfoot><tbody><tr><td class="lq-pr-body"></td></tr></tbody></table>';
    pv.querySelector(".lq-pr-body").appendChild(body);
    doc.body.appendChild(pv);
    // black-and-white: every colour swatch gets its colour name next to it
    for (const e of [...pv.querySelectorAll(".lq-pr-body *")]) {
      if (!isSwatch(e) || near(e)) continue;
      const name = colourName(getComputedStyle(e).backgroundColor) || e.getAttribute("title") || e.getAttribute("aria-label") || "";
      if (!name) continue;
      const s = doc.createElement("span"); s.className = "lq-pr-swname"; s.textContent = name; e.after(s);
    }
    doc.body.classList.add("lq-printing");
    return pv;
  }
  const escH = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  /* the paper report (owner order 2026-11-16, testers item B): fortune-print.js + fortune-print.css, fetched together with the
     card code once a result is on screen and the page was used (never in the first page load); one renderer for the print
     button, the browser's own print menu and, later, the paid PDF. buildPrint() above stays only as the fallback for a print
     started before fortune-print.js arrived (or if it cannot load). */
  let printing = null, printReady = false;
  function loadPrint() {
    if (printing) return printing;
    printing = new Promise((res, rej) => {
      if (/** @type {any} */ (root).LQPrint) { res(/** @type {any} */ (root).LQPrint); return; }
      const me = [...doc.scripts].find(s => /fortune-share\.js/.test(s.src));
      const v = me && /\?v=(\d+)/.exec(me.src);
      const s = doc.createElement("script"); s.src = "fortune-print.js" + (v ? "?v=" + v[1] : ""); s.async = true;
      s.onload = () => (/** @type {any} */ (root).LQPrint ? res(/** @type {any} */ (root).LQPrint) : rej(new Error("print code")));
      s.onerror = () => { printing = null; rej(new Error("print code")); };
      doc.head.appendChild(s);
    }).then(LP => LP.ready().then(() => { printReady = true; return LP; }));
    printing.catch(() => { /* retried on the next tap */ });
    return printing;
  }
  api.printReady = () => loadPrint().then(() => true);
  api.print = function (o) {
    o = o || {};
    if (!allowed(o.doc || doc)) return false;
    const r = resultFor(o.button || null);
    if (!r) return false;
    const go = LP => {
      if (!allowed(doc) || !LP.build({ button: o.button || null, size: o.size, include: o.include })) return false;
      try { root.print(); } catch (e) { /* no print dialog */ }
      return true;
    };
    const LP = /** @type {any} */ (root).LQPrint;
    if (LP && printReady) return go(LP);
    loadPrint().then(go, () => { if (allowed(doc) && buildPrint(r)) { try { root.print(); } catch (e) { /* none */ } } });
    return true;
  };
  root.addEventListener("beforeprint", () => {
    if (doc.getElementById("lqPrint") || !allowed(doc)) return;
    const LP = /** @type {any} */ (root).LQPrint;
    if (LP && printReady && LP.build({})) return;
    const r = resultFor(null); if (r) buildPrint(r);
  });
  root.addEventListener("afterprint", () => setTimeout(() => { endPrint(); resetOpts(); }, 0));

  /* ---------- start ---------- */
  doc.addEventListener("click", e => {
    const t = /** @type {any} */ (e.target), b = t && t.closest ? t.closest("[data-lq-sp]") : null;
    if (!b || b.disabled) return;
    e.preventDefault();
    const k = b.getAttribute("data-lq-sp");
    if (k === "share") api.share({ button: b }); else if (k === "print") api.print({ button: b });
  });
  // fetched by the loader only after the page was used or a reading was rendered, so the card code may follow right away
  let tick = 0, used = !!root.LQShareLoader;
  const later = () => { if (tick) return; tick = root.requestAnimationFrame ? root.requestAnimationFrame(() => { tick = 0; wire(); sync(); }) : setTimeout(() => { tick = 0; wire(); sync(); }, 50); };
  function start() {
    ensureStyle(); wire(); sync();
    const watch = { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-lq-crisis", "data-lq-calm"] };
    try { new MutationObserver(later).observe(doc.body, watch); } catch (e) { /* old browser */ }
    try { new MutationObserver(later).observe(doc.documentElement, { attributes: true, attributeFilter: ["data-lq-crisis", "data-lq-calm", "lang"] }); } catch (e) { /* old browser */ }
    doc.addEventListener("input", later, true);
    const use = () => { if (!used) { used = true; later(); } };
    for (const ev of ["pointerdown", "keydown", "touchstart", "scroll", "input", "change", "click"]) root.addEventListener(ev, use, { capture: true, passive: true });
    root.addEventListener("lq-crisis", () => { closeAll(); later(); });
    root.addEventListener("lq-lang", later);
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start();
  root.LQShare = api;
})(typeof window !== "undefined" ? window : globalThis);
