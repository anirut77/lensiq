/* LENSIQ shared site header (header, menu, language switch, i18n loader, Thai line breaks, models notice, member chip,
   service worker, legal footer, fortune extras, 1323 control). Full description: docs/NAV.md. */
(function () {
  "use strict";

  var BRAND = { name: "LENS", accent: "IQ", full: "LENSIQ", tagline: "Computer Vision ประมวลผลบนเครื่อง เพื่อการตลาดและการวิเคราะห์" };

  var ENTRY = { "attendance.html": "attendance.html?mode=employee" };
  var MENU = [
    { label: "ความปลอดภัยและการเข้าออก", short: "เข้าออก", id: "gate", cat: "security",
      intro: "อ่านป้ายทะเบียนรถไทยบนเครื่องสำหรับลานจอดและหมู่บ้าน ป้ายแจ้ง PDPA และแจ้งเตือนพื้นที่หวงห้าม เจ้าหน้าที่ยืนยันทุกครั้ง", items: [
      { href: "cat-security.html", title: "ภาพรวมหมวด", desc: "เครื่องมือ สถานะ และความแม่นยำที่วัดได้พร้อมที่มา" },
      { href: "gate.html", title: "LENSIQ Gate ภาพรวม", desc: "อ่านป้ายทะเบียนรถไทยบนเครื่อง (นำร่อง)" },
      { href: "parking.html", title: "ลานจอดรถ", desc: "จับคู่รถเข้า-ออก คิดค่าจอด QR พร้อมเพย์" },
      { href: "village.html", title: "ป้อมยามหมู่บ้าน/คอนโด", desc: "รถลูกบ้าน บัตรผ่านผู้มาเยือน เปิดไม้กั้นโดยเจ้าหน้าที่" },
      { href: "gate-notice.html", title: "ป้ายแจ้งกล้องอ่านทะเบียน", desc: "ป้าย PDPA และประกาศความเป็นส่วนตัว พิมพ์ได้" },
      { href: "cameras.html", title: "ระบบทั้งหมด", desc: "รายการระบบและการใช้งานทั้งหมด" },
      { href: "afterhours.html", title: "แจ้งเตือนพื้นที่หวงห้ามและนอกเวลา", desc: "พบคนในโซนหวงห้ามหรือนอกเวลา ให้เจ้าหน้าที่ตรวจสอบ" }
    ] },
    { label: "การศึกษาและการสอบ", short: "การสอบ", id: "edu", cat: "education",
      intro: "ช่วยผู้คุมสอบรู้ว่าควรไปดูที่นั่งไหน และตรวจกระดาษคำตอบด้วยมือถือ ระบบไม่ตัดสินการทุจริต คนตัดสินเสมอ ประมวลผลภาพในเครื่อง", items: [
      { href: "cat-education.html", title: "ภาพรวมหมวด", desc: "เครื่องมือ สถานะ และความแม่นยำที่วัดได้พร้อมที่มา" },
      { href: "exam.html", title: "LENSIQ Exam ภาพรวม", desc: "ช่วยผู้คุมสอบ ไม่ตัดสินการทุจริต (นำร่อง)" },
      { href: "exam-lab.html", title: "หน้าผู้เข้าสอบ", desc: "สอบออนไลน์: แจ้งสิทธิ์ ปรับเทียบ ป้ายกำลังติดตาม" },
      { href: "exam-hall.html", title: "เครื่องกล้องในห้องสอบ", desc: "วาดที่นั่ง แจ้งที่นั่งว่างและคนเกิน (ทดลอง)" },
      { href: "exam-dashboard.html", title: "แดชบอร์ดผู้คุมสอบ", desc: "แผนที่ที่นั่ง คิวให้ตรวจ รายงานตามเวลา" },
      { href: "omr.html", title: "ตรวจกระดาษคำตอบ", desc: "พิมพ์กระดาษคำตอบ ตรวจด้วยกล้องมือถือ วิเคราะห์ข้อสอบ" }
    ] },
    { label: "HR และที่ทำงาน", short: "HR", id: "work", cat: "hr",
      intro: "ลงเวลาด้วย PIN หรือ QR (ใบหน้าเป็นทางเลือก) สัมภาษณ์แบบมีโครงสร้าง ทบทวนเคส และกิจกรรมทีม คนตัดสินใจเรื่องคนเสมอ", items: [
      { href: "cat-hr.html", title: "ภาพรวมหมวด", desc: "เครื่องมือ สถานะ และความแม่นยำที่วัดได้พร้อมที่มา" },
      { href: "attendance.html", title: "ลงเวลาทำงาน PIN / QR", desc: "ใบหน้าเป็นตัวเลือก · เช็คชื่ออบรม" },
      { href: "hr.html", title: "LENSIQ HR ภาพรวม", desc: "ชุดสัมภาษณ์ โหมดฝึกซ้อมผู้สมัคร และกิจกรรมทีม" },
      { href: "interview.html", title: "ชุดสัมภาษณ์แบบมีโครงสร้าง", desc: "คำถาม STAR + เกณฑ์ BARS ให้คะแนนอิสระ สรุปความสอดคล้อง โหมดฝึกซ้อม" },
      { href: "case-review.html", title: "ทบทวนเคสจากคลิปวิดีโอ", desc: "แท็กเวลา บันทึก ล็อกตรวจสอบย้อนหลัง ไม่ตัดสินความจริง" },
      { href: "teamface.html", title: "โหงวเฮ้งทีม", desc: "กิจกรรมละลายพฤติกรรม การ์ดบทบาทในทีม ไม่ใช่การประเมิน" }
    ] },
    { label: "การตลาด ค้าปลีก และอีเวนต์", short: "ค้าปลีก", id: "ana", cat: "marketing",
      intro: "นับคนและความหนาแน่น หน้าร้าน คิว โต๊ะ ช่องจอด ป้ายโฆษณา และบูธ แบบไม่ระบุตัวตน ประมวลผลบนเครื่อง", items: [
      { href: "cat-marketing.html", title: "ภาพรวมหมวด", desc: "เครื่องมือ สถานะ และความแม่นยำที่วัดได้พร้อมที่มา" },
      { href: "crowd.html", title: "นับคนและความหนาแน่น", desc: "คนในโซน ช่วงพีค เส้นเข้า-ออก และเวลาอยู่ ในงานอีเวนต์ (ทดลอง ยังไม่เหมาะกับฝูงชนหนาแน่น)" },
      { href: "store.html", title: "วิเคราะห์หน้าร้าน", desc: "นับคน แผนที่ความร้อน และคิว" },
      { href: "retail.html", title: "LENSIQ Retail ภาพรวม", desc: "กล้องหน้าร้านสำหรับ SME: นับคน อัตราการซื้อ หลายสาขา" },
      { href: "insights.html", title: "แดชบอร์ดรวม", desc: "สรุปผลจากทุกระบบในที่เดียว" },
      { href: "customers.html", title: "จดจำลูกค้า", desc: "ประวัติการสั่งและเมนูแนะนำ" },
      { href: "signage.html", title: "ป้ายโฆษณาดิจิทัล", desc: "เลือกคอนเทนต์ตามผู้ชม และคีออสก์ไร้สัมผัส" },
      { href: "neuro.html", title: "วิเคราะห์อารมณ์ (Neuromarketing)", desc: "ทดสอบโฆษณาและบรรจุภัณฑ์จากสีหน้า" },
      { href: "queue.html", title: "แจ้งเตือนคิวยาว", desc: "นับคนในโซนคิว ประมาณเวลารอ เตือนเปิดเคาน์เตอร์เพิ่ม" },
      { href: "tables.html", title: "โต๊ะว่างและรอบการนั่ง", desc: "โต๊ะว่าง มีลูกค้า รอเก็บ และเวลานั่งต่อโต๊ะ" },
      { href: "bays.html", title: "นับช่องจอดว่าง", desc: "ช่องจอดว่างจากกล้อง ไม่อ่านป้ายทะเบียน" },
      { href: "checkout.html", title: "สแกนสินค้าด้วยกล้อง", desc: "คิดเงินแบบบริการตนเองและรายงานยอดขาย" },
      { href: "creative.html", title: "Creative Lab ตรวจชิ้นงาน", desc: "แผนที่ความสนใจ ความชัด สี เทียบ A/B" },
      { href: "creative-suite.html", title: "LENSIQ Creative ภาพรวม", desc: "Creative Lab สตูดิโอ และตู้ถ่ายรูปในชุดเดียว" },
      { href: "booth.html", title: "วิเคราะห์บูธ", desc: "นับผู้เข้าชมและเวลาหยุดชม" }
    ] },
    { label: "สุขภาพ ความปลอดภัย และคุณภาพ", short: "สุขภาพ", id: "health", cat: "health",
      intro: "ตรวจข้อมูลยาให้เภสัชกรยืนยัน เตือนเมื่อคนขับหลับตานาน และตรวจคุณภาพสินค้าบนสายการผลิต", items: [
      { href: "cat-health.html", title: "ภาพรวมหมวด", desc: "เครื่องมือ สถานะ และความแม่นยำที่วัดได้พร้อมที่มา" },
      { href: "medicine.html", title: "ตรวจข้อมูลยา", desc: "เลขทะเบียน อย. บาร์โค้ด ชื่อยา และเม็ดยา ยืนยันกับเภสัชกรทุกครั้ง" },
      { href: "nutrition.html", title: "อ่านฉลากโภชนาการ", desc: "ค่าตามฉลาก ปริมาณที่กินจริง และข้อมูลผู้แพ้อาหาร อ่านบนเครื่องนี้" },
      { href: "driver.html", title: "เฝ้าระวังความง่วงคนขับ", desc: "แจ้งเตือนเมื่อหลับตานานหรือหาว" },
      { href: "qc.html", title: "ตรวจคุณภาพสินค้า", desc: "ตรวจชิ้นงานบนสายการผลิต" }
    ] },
    { label: "ดูดวงและฤกษ์มงคล", short: "ดูดวง", id: "fortune", cat: "fortune",
      intro: "ดูดวงศาสตร์ไทย จีน และตะวันตก และหาฤกษ์มงคล", items: [
      { href: "cat-fortune.html", title: "ภาพรวมหมวด", desc: "เครื่องมือทั้งหมดในหมวดนี้" },
      { href: "fortune.html", title: "รวมศาสตร์ดูดวง", desc: "เลือกศาสตร์ที่ต้องการ" },
      { href: "faceread.html", title: "อ่านโหงวเฮ้ง", desc: "อ่านโหงวเฮ้งจากใบหน้า" },
      { href: "palm.html", title: "ดูลายมือ", desc: "ถ่ายฝ่ามือ อ่านเส้นหลัก" },
      { href: "horoscope.html", title: "ดวงวันเดือนปีเกิด", desc: "โหราไทย ปาจื้อ เลขศาสตร์" },
      { href: "tarot.html", title: "ไพ่ทาโรต์ & เซียมซี", desc: "เปิดไพ่ เสี่ยงเซียมซี" },
      { href: "iching.html", title: "อี้จิง เสี่ยงกว้า", desc: "โยนเหรียญ 64 กว้า" },
      { href: "bazi.html", title: "แปดอักษร 八字", desc: "เจ้าชะตา ห้าธาตุ วัยจร" },
      { href: "taksa.html", title: "ทักษา", desc: "ภูมิทั้งแปด มหาทักษา" },
      { href: "lek7.html", title: "เลข 7 ตัว 9 ฐาน", desc: "ผังเลขวันเดือนปีเกิด" },
      { href: "numbers.html", title: "เลขมงคล", desc: "เบอร์โทร ทะเบียนรถ เลขบ้าน" },
      { href: "fengshui.html", title: "ฮวงจุ้ย", desc: "เลขกัว เข็มทิศ ผังบ้าน" },
      { href: "dream.html", title: "ทำนายฝัน", desc: "ความหมายสัญลักษณ์ในฝัน" },
      { href: "zodiac.html", title: "12 นักษัตร · ปีชง", desc: "ดวงรายปี คู่มงคล" },
      { href: "compat.html", title: "ดวงสมพงษ์", desc: "ความเข้ากันของสองคนหรือทั้งกลุ่ม จากสี่ศาสตร์" },
      { href: "astro.html", title: "ราศีตะวันตก", desc: "ราศีอาทิตย์ จันทร์ ลัคนา" },
      { href: "lifegraph.html", title: "กราฟชีวิต", desc: "เส้นพลังตามช่วงอายุ" },
      { href: "planner.html", title: "วางแผนฤกษ์มงคล", desc: "วันดีขึ้นบ้านใหม่ เปิดร้าน เริ่มงาน" },
      { href: "luckycolor.html", title: "กระจกส่องสีเสื้อมงคล", desc: "ส่องกล้องดูสีเสื้อวันนี้กับสีมงคลประจำวัน" },
      { href: "petread.html", title: "ดูลักษณะน้องหมาน้องแมว", desc: "นิสัย สีมงคล วันดี จากรูปน้อง ประมวลผลบนเครื่อง" },
      { href: "report.html", title: "รายงานดวงของฉัน", desc: "รวมผลดูดวงเป็นรายงานฉบับเดียว" }
    ] },
    { label: "สตูดิโอและสื่อ", short: "สตูดิโอ", id: "photo", cat: "studio",
      intro: "สตูดิโอภาพโปรไฟล์และรูปติดบัตร ตู้ถ่ายรูปสำหรับอีเวนต์ วิเคราะห์บูธ และแปลงเอกสาร", items: [
      { href: "cat-studio.html", title: "ภาพรวมหมวด", desc: "เครื่องมือ สถานะ และความแม่นยำที่วัดได้พร้อมที่มา" },
      { href: "studio.html", title: "สตูดิโอภาพโปรไฟล์และรูปติดบัตร", desc: "เปลี่ยนฉากหลัง รีทัช รูปโปรไฟล์ ตรวจขนาดรูปติดบัตร · ชุดตัวอย่าง (พรีวิว)" },
      { href: "photobooth.html", title: "ตู้ถ่ายรูป", desc: "ตู้สติ๊กเกอร์และรูปติดบัตร" },
      { href: "converter.html", title: "แปลง PDF เป็น Word", desc: "แปลงในเบราว์เซอร์ ไม่อัปโหลดไฟล์" },
      { href: "booth.html", title: "วิเคราะห์บูธ", desc: "นับผู้เข้าชมและเวลาหยุดชม" }
    ] },
    { label: "เกี่ยวกับ", short: "เกี่ยวกับ", id: "about",
      intro: "เกี่ยวกับ LENSIQ โซลูชันตามอุตสาหกรรม แพ็กเกจ ความช่วยเหลือ และเอกสารด้านกฎหมาย", items: [
      { href: "about.html", title: "เกี่ยวกับ", desc: "ทำงานบนเครื่อง ความเป็นส่วนตัว และสัญญาอนุญาต" },
      { href: "solutions.html", title: "โซลูชันตามอุตสาหกรรม", desc: "เลือกตามธุรกิจ: พร้อมใช้ นำร่อง และเร็ว ๆ นี้" },
      { href: "pricing.html", title: "แพ็กเกจและราคา", desc: "แพ็กเกจรายเดือนและค่าบริการ", crisisSales: "item" },
      { href: "help.html", title: "ช่วยเหลือ", desc: "คำถามที่พบบ่อยและการติดต่อ" },
      { href: "privacy.html", title: "ความเป็นส่วนตัว", desc: "ประกาศความเป็นส่วนตัว (PDPA)" },
      { href: "terms.html", title: "ข้อกำหนดการใช้บริการ", desc: "เงื่อนไขการใช้งาน LENSIQ" },
      { href: "camera-notice.html", title: "ป้ายแจ้งการใช้กล้อง", desc: "ป้ายแจ้ง 3 ภาษา พิมพ์ A4" },
      { href: "account.html", title: "บัญชีของฉัน", desc: "สมาชิกและการชำระเงิน (เมื่อเปิดใช้)", crisisSales: "desc" }
    ] },
    { label: "ระบบทั้งหมด", href: "cameras.html", cta: true }
  ];
  var LANG_BTNS = [["th", "th", "TH", "ภาษาไทย"], ["en", "en", "EN", "English"], ["zh", "zh-Hans", "中文", "简体中文"]];

  var NOFRAME = /^(account|pricing|report|checkout|attendance|booth|customers|driver|faceread|fengshui|interview|neuro|palm|photobooth|qc|signage|store|studio|teamface|exam-lab|exam-hall|exam-dashboard|queue|tables|afterhours|bays|parking|village|crowd|case-review|medicine|omr|luckycolor)\.html$/;
  var NOFRAME_MORE = /^(nutrition|tryon|petread)\.html$/;
  var framed = false;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }
  var pageName = (location.pathname.split("/").pop() || "").toLowerCase();
  if (framed && (NOFRAME.test(pageName) || NOFRAME_MORE.test(pageName))) {
    var fb = document.createElement("style");
    fb.textContent = "html{display:none!important}";
    (document.head || document.documentElement).appendChild(fb);
    /** @type {any} */ (window).LQ_FRAMED = true;
    try { /** @type {any} */ (window.top).location = window.self.location.href; } catch (e) { /* sandboxed frame: stay blank */ }
    return;
  }

  // ---------- crisis-v3-protect (rule b: no prices, purchase buttons, plans or seller links while the crisis flag is set): menu
  // entries marked data-lq-crisis-sales (site menu pricing / payment, account-menu pricing) are hidden while html[data-lq-crisis]
  // or html[data-lq-calm] is set, and come back when the flag clears (pure CSS: no listener to miss) ----------
  (function () {
    var st = document.createElement("style");
    st.id = "lq-crisis-sales-style";
    st.textContent = ":is(html[data-lq-crisis],html[data-lq-calm]) [data-lq-crisis-sales]{display:none!important}";
    (document.head || document.documentElement).appendChild(st);
  })();

  var T = function (key, thai, vars) { return window.LQI18N ? window.LQI18N.tf(key, thai, vars) : thai; };
  (function loadI18n() {
    var cs = /** @type {HTMLScriptElement|null} */ (document.currentScript);
    var cur = cs && cs.src || "";
    var q = cur.indexOf("?") >= 0 ? cur.slice(cur.indexOf("?")) : "";
    var have = function (name) { return !!document.querySelector('script[src^="' + name + '"]'); };
    [["lensiq-i18n.js", !window.LQI18N], ["i18n/zh-common.js", true]].forEach(function (f) {
      if (!f[1] || have(f[0])) return;
      var sc = document.createElement("script");
      sc.src = f[0] + q; sc.async = false;
      if (f[0] === "i18n/zh-common.js") sc.addEventListener("load", function () { if (typeof syncLang === "function" && langBtns) syncLang(); });
      (document.head || document.documentElement).appendChild(sc);
    });
  })();

  var header = /** @type {HTMLElement} */ (document.getElementById("siteNav") || document.querySelector("header.nav"));
  if (!header) { thaiBreaks(); models(); registerSW(); legalFoot(); reportHook(); meritHook(); return; }
  if (!header.classList.contains("nav")) header.classList.add("nav");

  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (page === "") page = "index.html";
  var isCur = function (href) { return href.toLowerCase() === page; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  var chev = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var arrow = '<svg class="arr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var mark = '<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="7" fill="#0e1430"/><path d="M8 12V8h4M24 12V8h-4M8 20v4h4M24 20v4h-4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="16" cy="16" r="3.6" fill="#7c6cf5"/></svg>';

  var key = function (href) { return "nav." + href.replace(/\.html$/, ""); };
  var html = '<a class="skip-link" href="#main" data-i18n="nav.skip">ข้ามไปยังเนื้อหา</a>' +
    '<div class="nav-util" aria-hidden="true"><span data-i18n="nav.util">' + esc(BRAND.tagline) + '</span></div>' +
    '<a class="logo" href="index.html" aria-label="' + esc(BRAND.full) + ' หน้าแรก" data-i18n-attr="aria-label:nav.home">' + mark + '<span class="logo-word">' + esc(BRAND.name) + '<span>' + esc(BRAND.accent) + '</span></span></a>' +
    '<div class="lang-switch" role="group" aria-label="ภาษา" data-i18n-attr="aria-label:nav.lang">' +
      LANG_BTNS.map(function (b) { return '<button type="button" data-lang="' + b[0] + '" lang="' + b[1] + '" title="' + b[3] + '" aria-pressed="' + (b[0] === "th") + '">' + b[2] + '</button>'; }).join("") +
    '</div>' +
    '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="siteMenu" aria-label="เปิดเมนู">' +
      '<svg class="i-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
      '<svg class="i-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
    '</button>' +
    '<div class="nav-scrim" aria-hidden="true"></div>' +
    '<nav class="site-menu" id="siteMenu" aria-label="เมนูหลัก" data-i18n-attr="aria-label:nav.menu"><ul class="nav-list">';

  /** @type {any} */
  var curGroup = null;
  /** @type {any} */
  var curItem = null;
  MENU.forEach(function (g) {
    if (g.items) {
      var cur = g.items.filter(function (i) { return isCur(i.href); })[0];
      if (cur && !curGroup) { curGroup = g; curItem = cur; }
      html += '<li class="nav-item has-sub"><button class="nav-link' + (cur ? " is-current" : "") + '" type="button" aria-expanded="false" aria-controls="navsub-' + g.id + '"><span class="nav-lbl-s" data-i18n="nav.groups.' + g.id + '">' + esc(g.short || g.label) + '</span><span class="nav-lbl-f" data-i18n="nav.group.' + g.id + '">' + esc(g.label) + '</span>' + chev + '</button>' +
        '<div class="nav-sub" id="navsub-' + g.id + '"><div class="mega">' +
          '<div class="mega-intro"><p class="mega-k" data-i18n="nav.group.' + g.id + '">' + esc(g.label) + '</p><p class="mega-d" data-i18n="nav.groupd.' + g.id + '">' + esc(g.intro) + '</p>' +
          // owner order 2026-11-18: the fortune panel's link names no status or accuracy (fortune cards carry neither)
          (g.cat ? '<a class="mega-all" href="cat-' + g.cat + '.html">' + (g.cat === "fortune" ? '<span data-i18n="nav.viewcat.fortune">ดูหน้าหมวดนี้</span>'
            : '<span data-i18n="nav.viewcat">ดูหน้าหมวดนี้: สถานะและความแม่นยำ</span>') + arrow + '</a></div>'
            : '<a class="mega-all" href="cameras.html"><span data-i18n="nav.viewall">ดูระบบทั้งหมด</span>' + arrow + '</a></div>') +
          '<ul class="mega-links' + (g.items.length > 6 ? " cols-3" : g.items.length > 3 ? " cols-2" : "") + '">';
      g.items.forEach(function (i) {
        // crisisSales (crisis-v3-protect, rule b): a price / payment entry is hidden while the crisis or calm state is set
        var cs = ' data-lq-crisis-sales=""';
        html += '<li' + (i.crisisSales === "item" ? cs : "") + '><a href="' + (ENTRY[i.href] || i.href) + '"'
          + (isCur(i.href) ? ' aria-current="page"' : "") + '><b data-i18n="' + key(i.href) + '.title">' + esc(i.title) + '</b>'
          + '<small' + (i.crisisSales === "desc" ? cs : "") + ' data-i18n="' + key(i.href) + '.desc">' + esc(i.desc) + '</small></a></li>';
      });
      html += '</ul></div></div></li>';
    } else {
      var c = isCur(g.href) ? ' aria-current="page"' : "";
      html += '<li class="nav-item' + (g.cta ? " nav-item-cta" : "") + '">' + (g.cta
        ? '<a class="nav-cta" href="' + g.href + '"' + c + ' data-i18n="nav.cta">' + esc(g.label) + '</a>'
        : '<a class="nav-link' + (c ? " is-current" : "") + '" href="' + g.href + '"' + c + ' data-i18n="' + key(g.href) + '.title">' + esc(g.label) + '</a>') + '</li>';
    }
  });
  html += '</ul></nav>';
  header.innerHTML = html;

  if (page !== "index.html" && !document.querySelector(".lq-crumbs")) {
    var crumbs = document.createElement("nav");
    crumbs.className = "lq-crumbs";
    crumbs.setAttribute("aria-label", "เส้นทาง"); crumbs.setAttribute("data-i18n-attr", "aria-label:nav.crumbs");
    var ch = '<ol><li><a href="index.html" data-i18n="nav.home.short">หน้าแรก</a></li>';
    var gl = curGroup ? 'data-i18n="nav.group.' + curGroup.id + '">' + esc(curGroup.label) : "";
    if (curGroup) ch += '<li>' +(curGroup.cat && !isCur("cat-" + curGroup.cat + ".html") ? '<a href="cat-' + curGroup.cat + '.html" ' + gl + '</a>'
      : '<span ' + gl + '</span>') + '</li>' +
      '<li><a href="' + curItem.href + '" aria-current="page" data-i18n="' + key(curItem.href) + '.title">' + esc(curItem.title) + '</a></li>';
    else {
      var top = MENU.filter(function (g) { return g.href && !g.cta && isCur(g.href); })[0];
      if (top) ch += '<li><a href="' + top.href + '" aria-current="page" data-i18n="' + key(top.href) + '.title">' + esc(top.label) + '</a></li>';
    }
    crumbs.innerHTML = ch + '</ol>';
    header.insertAdjacentElement("afterend", crumbs);
  }

  var main = document.querySelector("main");
  var skip = /** @type {HTMLElement} */ (header.querySelector(".skip-link"));
  if (main) { if (!main.id) main.id = "main"; skip.setAttribute("href", "#" + main.id); }
  else document.addEventListener("DOMContentLoaded", function () {
    var m = document.querySelector("main");
    if (m) { if (!m.id) m.id = "main"; skip.setAttribute("href", "#" + m.id); } else skip.remove();
  });

  var toggle = /** @type {HTMLElement} */ (header.querySelector(".nav-toggle"));
  var menu = /** @type {HTMLElement} */ (header.querySelector(".site-menu"));
  var scrim = /** @type {HTMLElement} */ (header.querySelector(".nav-scrim"));
  /** @type {HTMLElement[]} */
  var subBtns = Array.prototype.slice.call(header.querySelectorAll(".has-sub > .nav-link"));
  var mq = window.matchMedia("(max-width: 1023.98px), (pointer: coarse) and (max-height: 600px)");
  var hoverMq = window.matchMedia("(hover: hover) and (pointer: fine)");

  var util = /** @type {HTMLElement} */ (header.querySelector(".nav-util"));
  function setNavH() {
    var u = util && util.offsetHeight || 0;
    document.documentElement.style.setProperty("--nav-util", u + "px");
    document.documentElement.style.setProperty("--nav-h", (header.offsetHeight - u) + "px");
  }

  function setSub(btn, open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    var sub = document.getElementById(btn.getAttribute("aria-controls"));
    if (sub) sub.classList.toggle("open", open);
  }
  function closeSubs(except) { subBtns.forEach(function (b) { if (b !== except) setSub(b, false); }); }

  function setDrawer(open, returnFocus) {
    header.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? T("nav.close", "ปิดเมนู") : T("nav.open", "เปิดเมนู"));
    document.documentElement.classList.toggle("nav-locked", open);
    if (open) {
      setNavH();
      subBtns.forEach(function (b) { if (b.classList.contains("is-current")) setSub(b, true); });
      var first = /** @type {HTMLElement|null} */ (menu.querySelector("a, button"));
      if (first) first.focus({ preventScroll: true });
    } else if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", function () { setDrawer(!header.classList.contains("menu-open")); });
  scrim.addEventListener("click", function () { setDrawer(false, true); });

  subBtns.forEach(function (btn) {
    var item = /** @type {HTMLElement} */ (btn.parentNode);
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") !== "true";
      if (!mq.matches) closeSubs(btn);
      setSub(btn, open);
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault(); setSub(btn, true);
        var a = /** @type {HTMLElement|null} */ (item.querySelector(".nav-sub .mega-links a")); if (a) a.focus();
      }
    });
    item.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      /** @type {HTMLElement[]} */
      var links = Array.prototype.slice.call(item.querySelectorAll(".nav-sub a"));
      var i = links.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      if (i < 0) return;
      e.preventDefault();
      var n = links[(i + (e.key === "ArrowDown" ? 1 : links.length - 1)) % links.length];
      n.focus();
    });
    item.addEventListener("focusout", function (e) {
      if (!mq.matches && !item.contains(/** @type {Node} */ (/** @type {FocusEvent} */ (e).relatedTarget))) setSub(btn, false);
    });
    item.addEventListener("mouseenter", function () { if (!mq.matches && hoverMq.matches) { closeSubs(btn); setSub(btn, true); } });
    item.addEventListener("mouseleave", function () { if (!mq.matches && hoverMq.matches) setSub(btn, false); });
  });

  menu.addEventListener("click", function (e) {
    var tg = /** @type {Element} */ (e.target);
    var a = tg && tg.closest ? tg.closest("a") : null;
    if (a) { closeSubs(); if (header.classList.contains("menu-open")) setDrawer(false); }
  });

  document.addEventListener("click", function (e) {
    if (!mq.matches && !header.contains(/** @type {Node} */ (e.target))) closeSubs();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (header.classList.contains("menu-open")) { setDrawer(false, true); return; }
    var openBtn = subBtns.filter(function (b) { return b.getAttribute("aria-expanded") === "true"; })[0];
    if (openBtn) { closeSubs(); openBtn.focus(); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Tab" || !header.classList.contains("menu-open")) return;
    /** @type {HTMLElement[]} */
    var f = [toggle].concat(Array.prototype.slice.call(menu.querySelectorAll("a, button"))).filter(function (el) { return el.offsetParent !== null; });
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function onMq() { setDrawer(false); closeSubs(); setNavH(); }
  if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);
  window.addEventListener("resize", setNavH);
  setNavH();

  var langBtns = Array.prototype.slice.call(header.querySelectorAll(".lang-switch button"));
  function syncLang() {
    var l = window.LQI18N ? window.LQI18N.lang : "th";
    langBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-lang") === l ? "true" : "false"); });
    toggle.setAttribute("aria-label", header.classList.contains("menu-open") ? T("nav.close", "ปิดเมนู") : T("nav.open", "เปิดเมนู"));
    if (typeof syncCompact === "function" && langBox) { langBox.classList.remove("open"); syncCompact(); }
    setNavH();
  }
  var langBox = /** @type {HTMLElement} */ (header.querySelector(".lang-switch"));
  function langCompact() {
    var other = langBtns.filter(function (b) { return b.getAttribute("aria-pressed") !== "true"; })[0];
    return !!other && !langBox.classList.contains("open") && getComputedStyle(other).display === "none";
  }
  function setLangOpen(open) {
    langBox.classList.toggle("open", open);
    var k = 0;
    langBtns.forEach(function (b) {
      var cur = b.getAttribute("aria-pressed") === "true";
      if (cur) { if (open || langCompact()) b.setAttribute("aria-expanded", open ? "true" : "false"); else b.removeAttribute("aria-expanded"); }
      b.style.top = open && !cur ? (langBox.offsetHeight + 4 + 48 * k++) + "px" : "";
    });
  }
  function syncCompact() { if (!langBox.classList.contains("open")) setLangOpen(false); }
  window.addEventListener("resize", syncCompact);
  document.addEventListener("click", function (e) { if (langBox.classList.contains("open") && !langBox.contains(/** @type {Node} */ (e.target))) setLangOpen(false); });
  langBox.addEventListener("keydown", function (e) {
    var c = function (/** @type {any} */ b) { return b.getAttribute("aria-pressed") === "true"; }, o = langBtns.filter(c).concat(langBtns.filter(function (/** @type {any} */ b) { return !c(b); })),
      n = o[o.indexOf(/** @type {any} */ (document.activeElement)) + (e.shiftKey ? -1 : 1)];
    if (e.key === "Tab" && langBox.classList.contains("open") && n) { e.preventDefault(); n.focus(); }
  });
  langBox.addEventListener("keydown", function (e) { if (e.key === "Escape" && langBox.classList.contains("open")) { e.stopPropagation(); setLangOpen(false); var c = langBtns.filter(function (b) { return b.getAttribute("aria-pressed") === "true"; })[0]; if (c) c.focus(); } });
  langBox.addEventListener("focusout", function (e) { if (langBox.classList.contains("open") && !langBox.contains(/** @type {Node} */ (e.relatedTarget))) setLangOpen(false); });
  /** @type {any} */ (window).LQNavCompact = syncCompact;
  langBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      if (b.getAttribute("aria-pressed") === "true" && (langCompact() || langBox.classList.contains("open"))) { setLangOpen(!langBox.classList.contains("open")); return; }
      if (langBox.classList.contains("open")) setLangOpen(false);
      var l = b.getAttribute("data-lang");
      if (window.LQI18N) window.LQI18N.setLang(l);
      else { try { localStorage.setItem("lq-lang", l); } catch (e) { /* storage blocked */ } location.reload(); }
    });
  });
  window.addEventListener("lq-lang", syncLang);
  if (window.LQI18N) { window.LQI18N.apply(header); var cb = document.querySelector(".lq-crumbs"); if (cb) window.LQI18N.apply(cb); syncLang(); }

  /** @type {any} */
  var help = /** @type {any} */ (window).LQHelpTop = { confirm: true, close: function () { if (help.dlg && help.dlg.open) help.dlg.close(); }, open: function () {
    var d = help.dlg, w = /** @type {any} */ ({ en: ["Call 1323", "Close"], zh: ["拨打 1323", "关闭"] })[window.LQI18N ? String(window.LQI18N.lang) : ""] || ["โทร 1323", "ปิด"];
    if (!d) {
      d = help.dlg = document.body.appendChild(document.createElement("dialog")); d.className = "lq-help-dlg"; d.setAttribute("aria-labelledby", "lqHelpQ");
      d.innerHTML = '<p id="lqHelpQ"></p><div><a class="lq-call-btn" href="tel:1323"></a><button type="button"></button></div><a class="lq-help-more" href="counselling.html"></a>';
      d.querySelector("button").onclick = help.close; d.onclick = function (/** @type {Event} */ e) { if (e.target === d) help.close(); };
      d.onclose = function () { help.link.focus(); };
    }
    d.querySelector("p").textContent = help.link.getAttribute("aria-label"); d.querySelector("a").textContent = w[0]; d.querySelector("button").textContent = w[1];
    /** @type {HTMLElement} */ (d.querySelector(".lq-help-more")).textContent = T("counsel.link", "ช่องทางให้คำปรึกษา");
    if (!d.open) { d.showModal(); d.querySelector("a").focus(); }
  } };
  function helpMount() {
    var top = document.getElementById("lqHelpTop"), a = top && top.querySelector("a");
    if (!top || !a || header.contains(top)) return;
    if (/** @type {any} */ (window).LENSIQ_HELP_TOP_STICKY === false) top.classList.add("lq-helpquiet");
    else { header.insertBefore(top, header.querySelector(".nav-end") || langBox); top.classList.add("lq-helpnav"); header.classList.add("has-help"); }
    a.setAttribute("aria-haspopup", "dialog"); a.onclick = function (/** @type {Event} */ e) { if (help.confirm) { e.preventDefault(); help.open(); } };
    help.el = top; help.link = a; syncCompact(); setNavH();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", helpMount); else helpMount();

  window.LENSIQ_BRAND = BRAND;

  var mountAccount = function () { if (window.LQMember && typeof window.LQMember.mountNav === "function") window.LQMember.mountNav(header); };
  mountAccount();
  window.addEventListener("lq-member-ready", mountAccount);
  thaiBreaks();
  models();
  registerSW();
  legalFoot();
  reportHook();
  meritHook();

  function thaiBreaks() {
    if (/[?&]nowb\b/.test(location.search)) return;
    if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return;
    var seg;
    try { seg = new Intl.Segmenter("th", { granularity: "word" }); } catch (e) { return; }
    var THAI = /[\u0e00-\u0e7f]/;
    var JOIN = ["แดชบอร์ด", "สติ๊กเกอร์", "โหงวเฮ้ง", "ฮวงจุ้ย", "อัจฉริยะ", "คีออสก์", "เซียมซี", "ทาโรต์", "นักษัตร", "อี้จิง", "เว็บแคม", "แท็บเล็ต", "ดาวน์โหลด", "ออฟไลน์", "ออนไลน์", "เบราว์เซอร์", "แพ็กเกจ", "แบรนด์", "โปรโมชัน", "คอนเทนต์", "อีเวนต์", "สตูดิโอ", "ฟีเจอร์", "เซิร์ฟเวอร์", "ฮาร์ดแวร์", "ซอฟต์แวร์", "แอปพลิเคชัน", "โซเชียล", "หน้าตา"];
    var LOAN = new RegExp(JOIN.join("|"), "g");
    var SEL = "h1,h2,h3,h4,h5,.nav-sub b,.nav-sub small,.mega-k,.mega-d,.lq-crumbs li,.nav-link,.nav-cta,.btn,button,label,.chip,.tag,.kicker,.eyebrow,.pill,summary,th,legend,.lead,.sub,.hint,figcaption,.lq-wb";
    var CR = ".lq-helpline,[data-lq-call],#lqHelpTop,.lq-help-dlg,.lq-crisis-slot,.fa-support,.fa-soft,.lq-call-btn";
    var SKIP = "svg,canvas,script,style,textarea,select,option,pre,code,[contenteditable],.lq-run,.lq-t," + CR;
    var sk = function (/** @type {any} */ e) { return e && e.nodeType === 1 && (e.matches(CR) || e.querySelector(CR)) ? null : e; };
    function words(text) {
      var parts = [];
      var it = seg.segment(text)[Symbol.iterator](), r;
      while (!(r = it.next()).done) parts.push(r.value.segment);
      for (var m = parts.length - 1; m > 0; m--) if (/^[ก-ฮ]$/.test(parts[m]) && THAI.test(parts[m - 1])) parts.splice(m - 1, 2, parts[m - 1] + parts[m]);
      for (var i = 0; i < parts.length; i++) {
        for (var j = i + 1, acc = parts[i]; j < parts.length && j < i + 5; j++) {
          acc += parts[j];
          if (JOIN.indexOf(acc) >= 0) { parts.splice(i, j - i + 1, acc); break; }
        }
      }
      return parts;
    }
    function loanParts(text) {
      var parts = [], last = 0, mm;
      LOAN.lastIndex = 0;
      while ((mm = LOAN.exec(text))) { if (mm.index > last) parts.push([text.slice(last, mm.index), 0]); parts.push([mm[0], 1]); last = mm.index + mm[0].length; }
      if (!parts.length) return null;
      if (last < text.length) parts.push([text.slice(last), 0]);
      return parts;
    }
    function rebuild(tn, full) {
      var v = tn.nodeValue, t = words(v), L = full ? wt(v) : len(tn), k = L > (full ? 19 : 11) ? cut(t, L > v.trim().length + 2) : t.length, at = t.slice(0, k).join("").length, pos = 0, buf = "";
      var parts = full ? t.map(function (p) { return [p, THAI.test(p) && p.length >= 4 && p.length <= 14 && !/\s/.test(p) ? 1 : 0]; }) : loanParts(v);
      if (!parts) {
        if (k >= t.length || /lq-t/.test(tn.nextSibling && tn.nextSibling.className)) return;
        var ws = (/\s*$/.exec(v) || [""])[0], tail = document.createElement("lq-t");
        tail.textContent = v.slice(at, v.length - ws.length);
        var nt = nxt(tn);
        var lv = tn.parentElement.closest("[role=status],[role=alert],button,[role=tab],.btn,label,summary,a"); if (lv && wt(tail.textContent) > 12) return;
        tail.className = "lq-w lq-t" + (!lv && !CP.test(((nt && nt.textContent) || "").trim()) ? " lq-b" : "");
        if (v.slice(0, at).trim() && !/flex|grid/.test(getComputedStyle(tn.parentNode).display)) { tn.nodeValue = v.slice(0, at); tn.after(tail); if (ws) tail.after(ws); }
        else if (!RT(tn)) { var box = document.createElement("lq-t"); box.className = "lq-t"; box.append(tail); if (at) tail.before(v.slice(0, at)); if (ws) tail.after(ws); tn.replaceWith(box); }
        return;
      }
      if (RT(tn) || k >= t.length && parts.length < 2 && !parts[0][1]) return;
      var run = document.createElement("span"), ps = /** @type {Array<Array<any>>} */ (parts);
      tail = document.createElement("lq-t");
      var add = function (el) { if (buf) run.appendChild(document.createTextNode(buf)); buf = ""; if (el) run.appendChild(el); };
      run.className = "lq-run"; tail.className = "lq-w lq-t";
      parts.forEach(function (p, i) {
        var f = function (y) { return y.replace(/[ \t]*\n\s*/g, " "); }, x = f(p[0]), e = pos + p[0].length, h = Math.max(0, at - pos);
        pos = e;
        if (e > at && (p[1] || !h)) { tail.textContent += x; return; }
        if (e > at) { buf += f(p[0].slice(0, h)); tail.textContent += f(p[0].slice(h)); return; }
        if (p[1]) { var w = document.createElement("span"); w.className = "lq-w"; w.textContent = x; add(w); } else buf += x;
        if (full && i < ps.length - 1 && !/\s$/.test(p[0]) && THAI.test(p[0]) && !CP.test(ps[i + 1][0])) add(document.createElement("wbr"));
      });
      ws = (/\s*$/.exec(tail.textContent || "") || [""])[0]; tail.textContent = (tail.textContent || "").slice(0, -ws.length || undefined);
      add(tail.textContent ? tail : null); buf = ws; add(null);
      tn.parentNode.replaceChild(run, tn);
    }
    function textNodes(el, min) {
      var walker = document.createTreeWalker(el, 4 /* SHOW_TEXT */), out = [], n;
      while ((n = walker.nextNode())) {
        var p = n.parentElement;
        var nv = n.nodeValue || "";
        if (nv.length >= min && TC.test(nv) && p && !p.closest(SKIP)) out.push(n);
      }
      return out;
    }
    function fix(el) {
      if (!el || el.nodeType !== 1 || el.hasAttribute("data-lqwb") || el.closest(SKIP)) return;
      el.setAttribute("data-lqwb", "");
      textNodes(el, 7).forEach(function (tn) { rebuild(tn, true); });
    }
    var RX = function () { return /** @type {any} */ (window).LQI18N_RTX; }, RT = function (n) { return RX() && RX().owns && RX().owns(n); };
    var TC = /[\u0e00-\u0e7f\u3040-\u9fff]/, CP = /^[)\]}.,:;!?%ๆฯ…”’»，。、：；！？）」』】]/;
    var wt = function (x) { return x.replace(/[\s\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/g, "").length + (x.match(/[\u3040-\u9fff]/g) || []).length; };
    function cut(t, all) {
      for (var c = t.length, L = 0; c > (all ? 0 : 1) && L < 8; ) L += wt(t[--c]);
      while (c && (CP.test(t[c]) || /[(\[{“‘（「『【]$/.test(t[c - 1]))) c--;
      return L < 8 || L > 16 ? t.length : c;
    }
    var PR = [/\d[\d.,]*[ \t\n]+(?:%|[A-Za-z]{1,8}|[\u0e00-\u0e7f]{1,6}|[\u3040-\u9fff]{1,2})/g, /[฿$][ \t\n]*\d[\d.,]*/g,
      /\S[ \t\n]+[)\].,:;!?ๆฯ…，。、：；！？）」』】]+/g, /[(\[{][ \t\n]+\S{1,6}/g];
    var nxt = function (n) { for (var e = n; e && !e.nextSibling && e.parentElement && IN.test(e.parentElement.nodeName); ) e = e.parentElement; return e && e.nextSibling; };
    var kf = function (t) { return t.nodeValue + "|" + ((t.previousSibling && t.previousSibling.textContent) || ""); };
    var DONE = new WeakMap(), IN = /^(B|SPAN|STRONG|EM|A|SMALL|CODE|OUTPUT|DATA)$/;
    var len = function (n) {
      var p = n.parentNode, x = (p && p.lastChild === n ? (p.closest("p,li,td,th,dd,dt,div,label,summary,h1,h2,h3,h4") || p).textContent : n.nodeValue) || "";
      return x.trim().length + (x.match(/[\u3040-\u9fff]/g) || []).length;
    };
    function glue(root) {
      var w = document.createTreeWalker(root, 4), all = [], n;
      while ((n = w.nextNode())) all.push(n);
      all.forEach(function (n) {
        var p = n.parentElement, v = n.nodeValue || "", r = [], m, e, i, L, z, out = [], wd = null;
        var x = n.previousSibling, y = n.nextSibling, pre = 0, post = -1;
        if (!p || DONE.get(n) === kf(n) || p.closest(SKIP + ",#siteNav,.lq-crumbs")) return;
        x = sk(x); y = sk(y);
        DONE.set(n, kf(n));
        PR.forEach(function (re) { re.lastIndex = 0; while ((m = re.exec(v))) r.push([m.index, m.index + m[0].length]); });
        if (x && IN.test(x.nodeName) && /^[\d.,]+$/.test((x.textContent || "").trim()) && (m = /^[ \t\n]+\S{1,8}/.exec(v))) r.push([0, pre = m[0].length]);
        else if (x && IN.test(x.nodeName) && /\S/.test(x.textContent || "") && wt(x.textContent || "") < 13 && (m = /^[)\]}.,:;!?…”’»，。、：；！？）」』】]+/.exec(v))) r.push([0, pre = m[0].length]);
        if (y && IN.test(y.nodeName) && !y.nextSibling && /^\S.{0,4}$/.test((y.textContent || "").trim()) && (m = /\S{1,8}[ \t\n]*$/.exec(v))) r.push([post = m.index, v.length]);
        var ctl = p.closest("button,[role=tab],.btn,label,summary,a");
        if ((L = len(n)) > 12) {
          e = v.replace(/\s+$/, "").length; i = e;
          while (i > 0 && wt(v.slice(i, e)) < 10) i--;
          for (m = i; m > 0 && /^\w\w$/.test(v[m - 1] + v[m]); ) m--;
          if (wt(v.slice(m, e)) < 19 || (z = v.indexOf(" ", i)) < 0 || z >= e - 1) i = m; else i = z + 1;
          if (i < e && (i > 0 || L > wt(v))) wd = [i, e];
        }
        if (!v.trim() && y && IN.test(y.nodeName) && !y.nextSibling && /^\S.{0,4}$/.test((y.textContent || "").trim())) /** @type {Element} */ (y).classList.add("lq-w");
        if (!r.length && !wd) return;
        var bd = { 0: 1 }, at = 0, sg;
        for (sg of seg.segment(v)) bd[at += sg.segment.length] = 1;
        r.concat(wd ? [wd] : []).forEach(function (q) {
          while (q[0] > 0 && (!bd[q[0]] || /[(\[{“‘（「『【]/.test(v[q[0] - 1]) || CP.test(v[q[0]]))) q[0]--;
          while (q[1] < v.length && (!bd[q[1]] || CP.test(v[q[1]]))) q[1]++;
        });
        r.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (q) { var o = out[out.length - 1]; if (o && q[0] <= o[1]) o[1] = Math.max(o[1], q[1]); else out.push(q); });
        var inner = function (q) { for (var k = q[0] + 1; k < q[1]; k++) if (bd[k] && /\S/.test(v[k - 1])) return 1; return 0; };
        out = out.filter(function (q) { return wt(v.slice(q[0], q[1])) < 31 && ((pre && !q[0]) || (post >= 0 && q[1] === v.length) || (inner(q) && !CP.test(v.slice(q[0], q[1]).trim()))); });
        if (wd) out.forEach(function (q) { if (q[0] < wd[1] && q[1] > wd[0]) { wd[0] = Math.min(wd[0], q[0]); wd[1] = Math.max(wd[1], q[1]); } });
        if (wd && !(inner(wd) && !CP.test(v.slice(wd[0], wd[1]).trim()) && wt(v.slice(wd[0], wd[1])) < 23)) wd = null;
        if (!out.length && !wd) return;
        var nn = nxt(post >= 0 ? /** @type {Node} */ (y) : n), nx = ((nn && nn.textContent) || "").trim();
        var cs = getComputedStyle(p), fl = /flex|grid/.test(cs.display), f = document.createDocumentFragment();
        if (/pre|break/.test(cs.whiteSpace)) return;
        var live = ctl || p.closest("[role=status],[role=alert]");
        if (wd && (live || (wd[1] >= v.trim().length && (CP.test(nx) || (nn && !nx))))) { while (wd[0] < wd[1] && (wt(v.slice(wd[0], wd[1])) > 12 || !bd[wd[0]])) wd[0]++; out.forEach(function (q) { if (wd && q[0] < wd[0] && wd[0] < q[1]) wd[0] = q[1]; }); if (!inner(wd)) wd = null; }
        var first = Math.min(out.length ? out[0][0] : v.length, wd ? wd[0] : v.length);
        if (RT(n) && pre && !fl && wt(v) < 15) { var h = document.createElement("lq-t"); h.className = "lq-w lq-t lq-b"; /** @type {Text} */ (n).before(h); h.append(/** @type {Node} */ (x), n); return; }
        if (RT(n) && !first) { if (!fl && IN.test(p.nodeName) && p.childNodes.length < 2 && wt(v) < 12) p.classList.add("lq-w"); return; }
        var pos = first, W = null, made = [n];
        var piece = function (a, b2) {
          var w = wt(v.slice(a, b2)), k = document.createElement("lq-t");
          k.className = "lq-w lq-t" + (live || (b2 >= v.trim().length && (CP.test(nx) || (nn && !nx)) && w < 13) || (/\s/.test(v[a - 1] || "") && w < 17) ? "" : " lq-b");
          return k;
        };
        var put = function (node) { (W || f).append(node); };
        var to = function (e2) { if (e2 > pos) { var t = document.createTextNode(v.slice(pos, e2)); made.push(t); put(t); pos = e2; } };
        var open = function () { var q = /** @type {number[]} */ (wd); to(q[0]); W = piece(q[0], q[1]); f.append(W); };
        out.forEach(function (q) {
          if (wd && q[0] >= wd[0] && q[1] <= wd[1]) { if (!W) open(); } else if (W && q[0] >= wd[1]) { to(wd[1]); W = null; }
          to(q[0]); var k = piece(q[0], q[1]); k.textContent = v.slice(q[0], q[1]);
          if (pre && !q[0]) { k.prepend(/** @type {Node} */ (x)); k.className = "lq-w lq-t"; }
          if (post >= 0 && q[1] === v.length) { k.append(/** @type {Node} */ (y)); k.className = "lq-w lq-t"; }
          put(k); pos = q[1];
        });
        if (wd && !W && pos <= wd[0]) open();
        if (W && wd) { to(wd[1]); W = null; }
        to(v.length);
        n.nodeValue = v.slice(0, first);
        var tx = /** @type {Text} */ (n);
        if (fl) { var b = document.createElement("lq-t"); b.className = "lq-t"; tx.before(b); b.append(tx, f); }
        else tx.after(f);
        made.forEach(function (t) { DONE.set(t, kf(t)); });
        if (!tx.nodeValue) tx.remove();
      });
    }
    function run(root) {
      if (root.nodeType === 3) root = root.parentElement;
      if (!root || root.nodeType !== 1 || root.closest(SKIP) || !document.body.contains(root)) return;
      glue(root);
      if (!(document.documentElement.lang || "th").indexOf("th")) {
        if (root.matches(SEL)) fix(root);
        Array.prototype.forEach.call(root.querySelectorAll(SEL), fix);
      }
      textNodes(root, 4).forEach(function (tn) { rebuild(tn, false); });
    }
    var pending = [], timer = 0;
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 120); };
    function flush() { timer = 0; var p = pending; pending = []; p.forEach(function (r) { if (r.isConnected) run(r); }); }
    function start() {
      run(document.body);
      if (typeof MutationObserver === "undefined") return;
      new MutationObserver(function (recs) {
        for (var i = 0; i < recs.length; i++) {
          var t = /** @type {Element} */ (recs[i].target);
          if (recs[i].type === "characterData" && t.parentNode) pending.push(t.parentNode);
          for (var j = 0; j < recs[i].addedNodes.length; j++) {
            var a = /** @type {Element} */ (recs[i].addedNodes[j]);
            if (a.nodeType === 1) { if (a.nodeName !== "WBR" && !/\blq-(run|w|t)\b/.test(a.className)) pending.push(a); }
            else if (a.nodeType === 3 && t.nodeType === 1) {
              if (t.hasAttribute("data-lqwb")) t.removeAttribute("data-lqwb");
              pending.push(t.parentNode || t);
            }
          }
        }
        if (pending.length > 400) pending = [document.body];
        if (pending.length && !timer) timer = idle(flush, { timeout: 150 });
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    window.addEventListener("lq-lang", function () { run(document.body); });
    if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  }

  function models() {
    if (window.LQModels) return;
    var MODEL_CACHE_PREFIX = "lq-models-";
    function isCached(url) {
      if (!window.caches || !url) return Promise.resolve(false);
      var abs = new URL(url, location.href).href;
      return caches.keys().then(function (ks) {
        return Promise.all(ks.filter(function (k) { return k.indexOf(MODEL_CACHE_PREFIX) === 0; }).map(function (k) {
          return caches.open(k).then(function (c) { return c.match(abs, { ignoreSearch: true }); });
        }));
      }).then(function (r) { return r.some(Boolean); }).catch(function () { return false; });
    }
    function slowNet() {
      var c = navigator.connection || {};
      return !!(c.saveData || /(^|-)2g|3g/.test(c.effectiveType || ""));
    }
    var box = null, active = 0;
    function ensureBox() {
      if (box && box.isConnected) return box;
      box = document.createElement("div");
      box.className = "lq-model-note"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite");
      box.innerHTML = '<span class="lq-spin" aria-hidden="true"></span><span class="lq-model-text"></span>' +
        '<span class="lq-model-bar" aria-hidden="true"><i></i></span>';
      document.body.appendChild(box);
      return box;
    }
    /** แสดง "กำลังโหลดโมเดล {label} {mb} MB" ; คืน {progress(0..1), done(), fail(msg)} ; ไม่แสดงถ้าอยู่ในแคชแล้ว (opts.url) */
    function loading(opts) {
      opts = opts || {};
      var shown = false, closed = false, b = null;
      var text = function () {
        var mb = opts.mb ? " " + (Math.round(opts.mb * 10) / 10) + " MB" : "";
        return T("models.loading", "กำลังโหลดโมเดล{label}{mb} (ครั้งแรกเท่านั้น หลังจากนี้ใช้ได้แม้ออฟไลน์)",
          { label: opts.label ? " " + T(opts.label, opts.label) : "", mb: mb });
      };
      var show = function () {
        if (closed || shown || !document.body) return;
        shown = true; active++;
        b = ensureBox(); b.classList.remove("err"); b.querySelector(".lq-model-text").textContent = text(); b.classList.add("show");
      };
      var hide = function () {
        if (closed) return; closed = true;
        if (shown && --active <= 0 && b) { active = 0; b.classList.remove("show"); }
      };
      (opts.url ? isCached(opts.url) : Promise.resolve(false)).then(function (hit) { if (!hit) show(); });
      return {
        progress: function (p) { if (b && shown && !closed) b.querySelector(".lq-model-bar i").style.width = Math.max(0, Math.min(1, p)) * 100 + "%"; },
        done: hide,
        fail: function (msg) {
          if (!b) { show(); }
          if (b) { b.classList.add("err"); b.querySelector(".lq-model-text").textContent = msg || T("models.fail", "โหลดโมเดลไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่"); }
          setTimeout(hide, 6000);
        }
      };
    }
    /** ถามก่อนดาวน์โหลดเมื่อเน็ตช้า/ประหยัดข้อมูล หรือไฟล์ใหญ่กว่า opts.askOverMb (ค่าเริ่ม 40) ; อยู่ในแคชแล้ว = true ทันที */
    function confirmDownload(opts) {
      opts = opts || {};
      return isCached(opts.url).then(function (hit) {
        if (hit) return true;
        if (!slowNet() && !(opts.mb > (opts.askOverMb || 40))) return true;
        return window.confirm(T("models.confirm", "ต้องดาวน์โหลดโมเดล{label} ประมาณ {mb} MB ดาวน์โหลดตอนนี้หรือไม่?",
          { label: opts.label ? " " + T(opts.label, opts.label) : "", mb: Math.round((opts.mb || 0) * 10) / 10 }));
      });
    }
    /** fetch พร้อมแสดงความคืบหน้า -> ArrayBuffer */
    function fetchWithNotice(url, opts) {
      opts = opts || {};
      var h = loading({ label: opts.label, mb: opts.mb, url: url });
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        var total = +(r.headers.get("content-length") || 0) || (opts.mb || 0) * 1048576;
        if (!r.body || !r.body.getReader || !total) return r.arrayBuffer();
        var reader = r.body.getReader(), got = 0, chunks = [];
        return (function pump() {
          return reader.read().then(function (x) {
            if (x.done) {
              var out = new Uint8Array(got), o = 0;
              chunks.forEach(function (c) { out.set(c, o); o += c.length; });
              return out.buffer;
            }
            chunks.push(x.value); got += x.value.length; h.progress(got / total);
            return pump();
          });
        })();
      }).then(function (buf) { h.done(); return buf; }, function (e) { h.fail(); throw e; });
    }
    window.LQModels = { loading: loading, isCached: isCached, confirm: confirmDownload, fetch: fetchWithNotice, slowNet: slowNet };
  }

  function legalFoot() {
    var DOCS = [["terms.html", "foot.terms", "ข้อกำหนดการใช้บริการ"], ["privacy.html", "foot.privacy", "ความเป็นส่วนตัว"], ["help.html", "foot.help", "ช่วยเหลือ"]];
    var add = function () {
      if (!document.body) return;
      var own = document.querySelector("footer:not(.lq-legal-foot)");
      if (own) {
        var miss = DOCS.filter(function (d) { return !document.querySelector('a[href^="' + d[0] + '"]'); });
        if (!miss.length || own.querySelector(".lq-foot-docs")) return;
        var p = document.createElement("p");
        p.className = "lq-foot-docs";
        p.innerHTML = miss.map(function (d) { return '<a href="' + d[0] + '" data-i18n="' + d[1] + '">' + d[2] + '</a>'; }).join("");
        own.appendChild(p);
        if (window.LQI18N) window.LQI18N.apply(p);
        return;
      }
      if (document.querySelector(".lq-legal-foot")) return;
      var f = document.createElement("footer");
      f.className = "lq-legal-foot";
      f.setAttribute("aria-label", "ข้อมูลทางกฎหมาย"); f.setAttribute("data-i18n-attr", "aria-label:foot.legalnav");
      f.innerHTML = '<p><span>© 2026 LENSIQ</span>' +
        '<a href="terms.html" data-i18n="foot.terms">ข้อกำหนดการใช้บริการ</a>' +
        '<a href="privacy.html" data-i18n="foot.privacy">ความเป็นส่วนตัว</a>' +
        '<a href="help.html" data-i18n="foot.help">ช่วยเหลือ</a>' +
        '<a href="about.html" data-i18n="foot.about">เกี่ยวกับ &amp; สัญญาอนุญาต</a></p>';
      document.body.appendChild(f);
      if (window.LQI18N) window.LQI18N.apply(f);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add();
  }
  function reportHook() {
    var p = (location.pathname.split("/").pop() || "").toLowerCase();
    // not the hub (fortune.html): it shows no reading to report (speed budget, 2026-11-17)
    if (!/^(faceread|palm|horoscope|tarot|fengshui|numbers|iching|zodiac|astro|dream|bazi|taksa|lek7|lifegraph|planner|luckycolor)\.html$/.test(p)) return;
    if (/** @type {any} */ (window).LQReport || document.querySelector('script[src^="lensiq-report.js"]')) return;
    var sc = document.createElement("script");
    sc.src = "lensiq-report.js?v=3"; sc.async = true;
    (document.head || document.documentElement).appendChild(sc);
  }
  function meritHook() {
    var p = (location.pathname.split("/").pop() || "").toLowerCase();
    if (!/^(faceread|palm|horoscope|tarot|fengshui|numbers|iching|zodiac|astro|dream|bazi|taksa|lek7|lifegraph)\.html$/.test(p)) return;
    var W = /** @type {any} */ (window), d = document.head || document.documentElement;
    if (W.LENSIQ_FORTUNE_PAID === true && !W.LQPaid) {
      ["fortune-negstate.js?v=1", "fortune-paid.js?v=1"].forEach(function (f) { var ps = document.createElement("script"); ps.src = f; ps.async = false; d.appendChild(ps); });
    }
    if (W.LQMerit || document.querySelector('script[src^="lensiq-merit.js"]')) return;
    ["lensiq-merit-core.js?v=4", "lensiq-merit-lint.js?v=2", "lensiq-merit.js?v=4"].forEach(function (src) {
      var sc = document.createElement("script");
      sc.src = src; sc.async = false;
      (document.head || document.documentElement).appendChild(sc);
    });
  }
  function registerSW() {
    if (!("serviceWorker" in navigator) || !window.isSecureContext || /[?&]nosw\b/.test(location.search)) return;
    var go = function () { navigator.serviceWorker.register("sw.js").catch(function () { /* unsupported / blocked: pages work without it */ }); };
    if (document.readyState === "complete") go(); else window.addEventListener("load", go);
  }
})();
