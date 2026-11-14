/* lensiq-devicefit.js — "best used on" (owner order 2026-11-14): THE config of which device each page works best on,
 * plus the short phone notice. Browser: window.LQDeviceFit (loaded on every page by nav.js; admin.html loads it itself).
 * Node: module.exports (tools/device-fit.mjs, tools/cat-pages.mjs, tests/unit/device-fit.test.js).
 *
 * Values: computer · tablet (= a tablet or a computer) · phone · any. Every page has one, with a reason (REASONS, TH / EN /
 * ZH) and a basis: "measured" names its evidence ({doc, quote}: a fragment that must still be in that document; every
 * figure there is SYNTHETIC: headless Chrome / WebKit on CI or a Mac, docs/PHONE-QUALITY.md; no real-phone crash or
 * memory data exists yet), "estimate" says whose estimate it is. Overview pages are "any" themselves; `product` lists
 * their working pages, and the menu and the catalogues show the strictest value of those (catalogueFit).
 *
 * The notice: on a phone (small viewport AND touch, never the user agent alone) a page marked computer or tablet shows a
 * short note in the page flow under the breadcrumb (never an overlay, never blocking) with two buttons:
 *   "send this link to myself": navigator.share (the device's own share sheet), else the clipboard, else the link in a
 *     field to copy by hand. Nothing is sent to our server or to a third party.
 *   "continue anyway": hides it; remembered on this device for this page (localStorage "lq-fit-ok:<page>" = "1", in
 *     try/catch: blocked storage only means the note comes back next time).
 * It never starts a camera, loads a model or opens a connection. The labels in the menu (computer / tablet / phone; "any"
 * is left out to keep the menu short) and on the solutions catalogue are added here; the category pages carry them as
 * static markup written by tools/cat-pages.mjs from this file.
 *
 * API: VALUES, LABEL, REASONS, FIT, DOCS, TEXT, text(lang), isPhone(env), needsNotice(fit), catalogueFit(page),
 *      dismissKey(page), shouldShow({page, env, storage}), dismiss({page, storage}), sendLink({nav, url, title, doc}),
 *      docBlock(docPath, lang). Browser extra: page, env(), show(). */
(function (root) {
  "use strict";
  const VALUES = ["computer", "tablet", "phone", "any"];
  const RANK = { computer: 3, tablet: 2, phone: 1, any: 0 };

  const LABEL = {
    computer: { th: "💻 เหมาะกับคอมพิวเตอร์", en: "💻 Best on a computer", zh: "💻 最适合电脑" },
    tablet: { th: "💻 เหมาะกับแท็บเล็ตหรือคอมพิวเตอร์", en: "💻 Best on a tablet or computer", zh: "💻 最适合平板或电脑" },
    phone: { th: "📱 เหมาะกับมือถือ", en: "📱 Best on a phone", zh: "📱 最适合手机" },
    any: { th: "✓ ใช้ได้ทุกอุปกรณ์", en: "✓ Works on any device", zh: "✓ 任何设备均可" }
  };

  /** Reasons (user-facing, short). Measured figures are synthetic (headless browser), never a real phone. */
  const REASONS = {
    lab: { th: "โหมดห้องคอมพิวเตอร์ออกแบบให้ผู้สอบใช้คอมพิวเตอร์ในห้องแล็บกับเว็บแคม (Chrome / Edge) มือถือเปิดได้ แต่ไม่ใช่เครื่องสอบที่รองรับ",
      en: "Lab mode is built for candidates on lab computers with a webcam (Chrome / Edge); a phone opens it but is not a supported exam device",
      zh: "机房模式专为考生在机房电脑上配合网络摄像头使用而设计（Chrome / Edge）；手机可以打开，但不是受支持的考试设备" },
    dash: { th: "ผังที่นั่ง ตาราง กราฟ และรายงาน ต้องใช้จอกว้าง", en: "Seat maps, tables, charts and reports need a wide screen",
      zh: "座位图、表格、图表和报告需要宽屏" },
    admin: { th: "หลังบ้านของเจ้าของ: ตาราง คีย์ และการส่งออกข้อมูล ต้องใช้จอกว้างและคีย์บอร์ด",
      en: "The owner's back office: tables, keys and exports need a wide screen and a keyboard", zh: "所有者后台：表格、密钥和导出需要宽屏和键盘" },
    video: { th: "ดูคลิปวิดีโอ ใส่แท็กเวลา และจดบันทึก ต้องใช้จอใหญ่และคีย์บอร์ด",
      en: "Watching video clips, tagging times and writing notes needs a big screen and a keyboard", zh: "观看视频片段、标记时间和撰写备注需要大屏幕和键盘" },
    screen: { th: "ใช้ควบคุมจอแสดงผล จึงทำงานบนคอมพิวเตอร์หรือเครื่องเล่นที่ต่อกับจอนั้น",
      en: "It drives a display screen, so it runs on the computer or player attached to that screen", zh: "它用于驱动显示屏，因此在连接该屏幕的电脑或播放器上运行" },
    adtest: { th: "ผู้ชมดูโฆษณาหรือบรรจุภัณฑ์บนจอใหญ่ที่มีเว็บแคม", en: "Viewers watch an ad or a package on a large screen with a webcam",
      zh: "观众在带网络摄像头的大屏幕上观看广告或包装" },
    files: { th: "ทำงานกับไฟล์งานและเอกสารที่มักอยู่บนคอมพิวเตอร์ และเทียบหลายชิ้นบนจอกว้าง",
      en: "It works on design files and documents that usually live on a computer, compared side by side on a wide screen",
      zh: "处理通常保存在电脑上的设计文件和文档，并在宽屏上并排比较" },
    gate: { th: "เจ้าหน้าที่ยืนยันป้ายทะเบียนทุกคันบนจอที่ป้อมตลอดกะ แท็บเล็ตหรือโน้ตบุ๊กที่ตั้งนิ่งและเสียบไฟจึงเหมาะที่สุด",
      en: "The guard confirms every plate on a screen at the booth for a whole shift, so a tablet or laptop on a stand and on power fits best",
      zh: "保安整个班次都在岗亭屏幕上确认每一块车牌，因此最适合放在支架上并接通电源的平板或笔记本电脑" },
    mounted: { th: "กล้องตั้งนิ่งอยู่จุดเดิมและทำงานต่อเนื่องหลายชั่วโมง แท็บเล็ตหรือโน้ตบุ๊กบนขาตั้งที่เสียบไฟเหมาะกว่ามือถือที่ถือไว้",
      en: "The camera stays in one place and runs for hours; a tablet or laptop on a stand and on power suits it better than a hand-held phone",
      zh: "摄像头固定在同一位置并连续运行数小时；放在支架上并接通电源的平板或笔记本电脑比手持手机更合适" },
    interview: { th: "กรรมการให้คะแนนตามเกณฑ์ระหว่างสัมภาษณ์ จอที่ใหญ่กว่ามือถือแสดงคำถามและเกณฑ์ได้พร้อมกัน",
      en: "Interviewers score against the rubric while they talk; a screen bigger than a phone shows the questions and the rubric together",
      zh: "面试官边交谈边按评分标准打分；比手机大的屏幕可以同时显示问题和评分标准" },
    group: { th: "หลายคนดูจอเดียวกันพร้อมกันเป็นกลุ่ม", en: "Several people look at one screen together as a group", zh: "多人作为一个小组一起看同一块屏幕" },
    counter: { th: "ตั้งไว้ที่เคาน์เตอร์ร้านตลอดวัน", en: "It stays on the shop counter all day", zh: "全天放置在店铺的收银柜台上" },
    kiosk: { th: "ใช้เป็นจุดคิดเงินด้วยตนเองที่ตั้งประจำ กล้องต้องนิ่ง", en: "It is a fixed self-checkout point; the camera must stay still",
      zh: "作为固定的自助结账点使用；摄像头必须保持稳定" },
    photobooth: { th: "หน้าที่ใช้หน่วยความจำมากที่สุดในการทดสอบ: 873 MB ในเบราว์เซอร์จำลอง (ไม่ใช่มือถือจริง) " +
        "iPhone รุ่นเก่าอาจปิดแท็บก่อนถึง 1 GB ตู้ถ่ายรูปในงานจึงควรใช้แท็บเล็ตหรือโน้ตบุ๊กบนขาตั้ง",
      en: "The heaviest page measured: 873 MB in a synthetic headless browser (not a real phone); older iPhones may close a tab below 1 GB, " +
        "so an event booth should run on a tablet or laptop on a stand",
      zh: "实测内存占用最高的页面：模拟无头浏览器中为 873 MB（非真实手机）；较旧的 iPhone 可能在不到 1 GB 时关闭标签页，因此活动拍照亭应使用支架上的平板或笔记本电脑" },
    studio: { th: "ใช้โมเดลแยกพื้นหลัง หน่วยความจำ 408 MB ในเบราว์เซอร์จำลอง (มากเป็นอันดับ 4 จาก 9 หน้าที่วัด ไม่ใช่มือถือจริง) และรีทัชบนจอใหญ่ได้ง่ายกว่า",
      en: "It runs a background-segmentation model: 408 MB in a synthetic headless browser (4th of the 9 pages measured, not a real phone), " +
        "and retouching is easier on a bigger screen",
      zh: "运行背景分割模型：模拟无头浏览器中为 408 MB（9 个实测页面中第 4 高，非真实手机），而且在大屏幕上修图更容易" },
    att: { th: "ลงเวลาด้วย PIN หรือ QR ได้ทุกจอ ขั้นตอนบนจอขนาด iPhone ผ่านการทดสอบจำลอง และหน่วยความจำอยู่ในงบที่กำหนด (290 MB)",
      en: "PIN or QR punches work on any screen; the flow passes the synthetic test at iPhone width and memory stays within its budget (290 MB)",
      zh: "PIN 或二维码打卡适用于任何屏幕；该流程在 iPhone 宽度的模拟测试中通过，内存在预算之内（290 MB）" },
    scan: { th: "ออกแบบให้ใช้กล้องมือถือส่องฉลาก กล่อง หรือกระดาษ", en: "Made for pointing a phone camera at a label, a box or a sheet of paper",
      zh: "专为用手机摄像头对准标签、盒子或纸张而设计" },
    med: { th: "ออกแบบให้ใช้กล้องมือถือส่องฉลาก ขั้นตอนสแกนบนจอขนาด iPhone ผ่านการทดสอบจำลอง หน่วยความจำ 554 MB (มากเป็นอันดับ 2 ต้องลองบน iPhone รุ่นเก่า)",
      en: "Made for pointing a phone camera at a label; the scan passes the synthetic test at iPhone width; memory 554 MB (2nd heaviest, to be tried on older iPhones)",
      zh: "专为用手机摄像头对准标签而设计；扫描在 iPhone 宽度的模拟测试中通过；内存 554 MB（第 2 高，需在较旧的 iPhone 上试用）" },
    nut: { th: "ส่องฉลากด้วยกล้องมือถือ ขั้นตอนบนจอขนาด iPhone ผ่านการทดสอบจำลอง หน่วยความจำ 203 MB (น้อยที่สุดใน 9 หน้าที่วัด)",
      en: "Point a phone camera at the label; the flow passes the synthetic test at iPhone width; memory 203 MB (the lightest of the 9 pages measured)",
      zh: "用手机摄像头对准标签；该流程在 iPhone 宽度的模拟测试中通过；内存 203 MB（9 个实测页面中最低）" },
    car: { th: "วางมือถือบนที่ยึดในรถ กล้องหน้าหันหาคนขับ", en: "The phone sits in a car holder with its front camera on the driver",
      zh: "手机放在车载支架上，前置摄像头对准驾驶员" },
    fortune: { th: "ดูดวงสั้น ๆ บนมือถือของตัวเอง มีแต่ข้อความและการแตะไม่กี่ครั้ง", en: "Short readings on your own phone: text and a few taps",
      zh: "在自己的手机上进行简短占卜：只有文字和几次点击" },
    fortuneTested: { th: "ดูดวงบนมือถือของตัวเอง ขั้นตอนบนจอขนาด iPhone ผ่านการทดสอบจำลอง (WebKit)",
      en: "Readings on your own phone; the flow passes the synthetic test at iPhone width (WebKit)", zh: "在自己的手机上占卜；该流程在 iPhone 宽度的模拟测试中通过（WebKit）" },
    faceread: { th: "ใช้กล้องหน้าของมือถือ ขั้นตอนบนจอขนาด iPhone ผ่านการทดสอบจำลอง หน่วยความจำ 514 MB (มากเป็นอันดับ 3 ต้องลองบน iPhone รุ่นเก่า)",
      en: "It uses the phone's front camera; the flow passes the synthetic test at iPhone width; memory 514 MB (3rd heaviest, to be tried on older iPhones)",
      zh: "使用手机前置摄像头；该流程在 iPhone 宽度的模拟测试中通过；内存 514 MB（第 3 高，需在较旧的 iPhone 上试用）" },
    selfie: { th: "ลองสินค้ากับกล้องหน้ามือถือของตัวเองจากลิงก์ของร้าน", en: "Try items on with your own phone's front camera from the shop's link",
      zh: "通过店铺链接，用自己手机的前置摄像头试戴" },
    overview: { th: "หน้าแนะนำผลิตภัณฑ์ อ่านได้ทุกจอ หน้าที่ใช้งานจริงบอกอุปกรณ์ของตัวเอง", en: "A product overview, readable on any screen; each working page states its own device",
      zh: "产品概览，任何屏幕均可阅读；各功能页面会注明各自适用的设备" },
    info: { th: "หน้าข้อมูล อ่านได้ทุกจอ", en: "An information page, readable on any screen", zh: "信息页面，任何屏幕均可阅读" },
    notice: { th: "ป้ายแจ้งสำหรับพิมพ์ เปิดและสั่งพิมพ์ได้จากทุกอุปกรณ์", en: "A notice to print; open and print it from any device", zh: "用于打印的告示；可在任何设备上打开并打印" },
    home: { th: "หน้าแรกและแบบฟอร์มขอใบเสนอราคาใช้ได้ทุกจอ เมนูและแบบฟอร์มผ่านการทดสอบจำลองบนจอขนาด iPhone (WebKit)",
      en: "The home page and the quote form work on any screen; the menu and the form pass the synthetic test at iPhone width (WebKit)",
      zh: "首页和报价表单适用于任何屏幕；菜单和表单在 iPhone 宽度的模拟测试中通过（WebKit）" }
  };

  const OWNER = "owner estimate 2026-11-14 (after testing on a real phone; no measured figure)";
  const OWNER_M = "owner estimate 2026-11-14; the phone flow passes the synthetic test (docs/PHONE-QUALITY.md), so memory is not the reason";
  const BUILDER = "builder estimate 2026-11-14 (how the page is used; not measured)";
  const PQ = "docs/PHONE-QUALITY.md";
  const M = (quote, doc) => ({ doc: doc || PQ, quote: Array.isArray(quote) ? quote : [quote] });
  const e = (fit, why, src, product) => (product ? { fit, why, basis: "estimate", src, product } : { fit, why, basis: typeof src === "string" ? "estimate" : "measured", src });

  /** THE list. One entry per page (every *.html of the site). */
  const FIT = {
    // 1 Security & Access
    gate: e("tablet", "gate", OWNER),
    parking: e("tablet", "gate", OWNER_M),
    village: e("tablet", "gate", OWNER),
    "gate-notice": e("any", "notice", BUILDER),
    cameras: e("any", "info", BUILDER),
    afterhours: e("tablet", "mounted", BUILDER),
    // 2 Education & Exams
    exam: e("any", "overview", BUILDER, ["exam-lab", "exam-dashboard"]),
    "exam-lab": e("computer", "lab", OWNER_M),
    "exam-hall": e("tablet", "mounted", BUILDER),
    "exam-dashboard": e("computer", "dash", OWNER),
    omr: e("phone", "scan", BUILDER),
    // 3 HR & Workplace
    attendance: e("any", "att", M(["| attendance | 5.7 | 5.6 | 122.5 | 289.7 | 10 | 440 |", "| Attendance (PIN / QR) | add employees, punch by PIN, punch by QR badge |"])),
    hr: e("any", "overview", BUILDER, ["interview", "teamface"]),
    interview: e("tablet", "interview", BUILDER),
    "case-review": e("computer", "video", BUILDER),
    teamface: e("tablet", "group", BUILDER),
    // 4 Marketing, Retail & Events
    crowd: e("tablet", "mounted", OWNER_M),
    store: e("tablet", "mounted", BUILDER),
    retail: e("any", "overview", BUILDER, ["store"]),
    insights: e("computer", "dash", BUILDER),
    customers: e("tablet", "counter", BUILDER),
    signage: e("computer", "screen", BUILDER),
    neuro: e("computer", "adtest", BUILDER),
    queue: e("tablet", "mounted", BUILDER),
    tables: e("tablet", "mounted", BUILDER),
    bays: e("tablet", "mounted", BUILDER),
    checkout: e("tablet", "kiosk", BUILDER),
    creative: e("computer", "files", BUILDER),
    "creative-suite": e("any", "overview", BUILDER, ["creative", "studio", "photobooth"]),
    booth: e("tablet", "mounted", BUILDER),
    // 5 Health, Safety & Quality
    medicine: e("phone", "med", M(["| product-check (medicine.html) | 3.4 | 3.1 | 119.2 | 553.6 | 10 | 840 |", "| Product Check | live scan of a steady label -> Thai registration number |"])),
    nutrition: e("phone", "nut", M(["| nutrition | 2.0 | 2.1 | 108.1 | 203.2 | 5 | 310 |", "| Nutrition | sample label card; camera opens |"])),
    driver: e("phone", "car", BUILDER),
    qc: e("tablet", "mounted", BUILDER),
    // 6 Fortune & Auspicious Planning (owner: phone)
    fortune: e("phone", "fortune", OWNER),
    faceread: e("phone", "faceread", M(["| faceread | 5.5 | 5.0 | 154.7 | 513.8 | 10 | 780 |", "| Face reading | fake camera + scripted face -> reading |"])),
    palm: e("phone", "fortune", OWNER),
    horoscope: e("phone", "fortuneTested", M("| Tarot / Horoscope / Zodiac | a reading of at least 3 sections |")),
    tarot: e("phone", "fortuneTested", M("| Tarot / Horoscope / Zodiac | a reading of at least 3 sections |")),
    iching: e("phone", "fortune", OWNER),
    bazi: e("phone", "fortune", OWNER),
    taksa: e("phone", "fortune", OWNER),
    lek7: e("phone", "fortune", OWNER),
    numbers: e("phone", "fortune", OWNER),
    fengshui: e("phone", "fortune", OWNER),
    dream: e("phone", "fortune", OWNER),
    zodiac: e("phone", "fortuneTested", M("| Tarot / Horoscope / Zodiac | a reading of at least 3 sections |")),
    astro: e("phone", "fortune", OWNER),
    lifegraph: e("phone", "fortune", OWNER),
    planner: e("phone", "fortune", OWNER),
    luckycolor: e("phone", "fortune", OWNER),
    report: e("phone", "fortune", OWNER),
    // 7 Studio & Media
    studio: e("tablet", "studio", M("| studio | 5.3 | 5.6 | 118.6 | 408.3 | 10 | 620 |")),
    photobooth: e("tablet", "photobooth", M("| photobooth | 4.7 | 4.8 | 187.5 | 873.1 | 10 | 1310 |")),
    converter: e("computer", "files", BUILDER),
    tryon: e("phone", "selfie", BUILDER),
    // Platform (not a category): any, except the owner's back office
    index: e("any", "home", M(["| Home | menu opens / closes by tap, contact section present |", "The quote form is covered by `tests/e2e/lead-form-webkit.e2e.mjs`"])),
    solutions: e("any", "info", BUILDER),
    about: e("any", "info", BUILDER),
    help: e("any", "info", BUILDER),
    pricing: e("any", "info", BUILDER),
    account: e("any", "info", BUILDER),
    privacy: e("any", "info", BUILDER),
    terms: e("any", "info", BUILDER),
    "camera-notice": e("any", "notice", BUILDER),
    admin: e("computer", "admin", OWNER),
    "cat-security": e("any", "info", BUILDER),
    "cat-education": e("any", "info", BUILDER),
    "cat-hr": e("any", "info", BUILDER),
    "cat-marketing": e("any", "info", BUILDER),
    "cat-health": e("any", "info", BUILDER),
    "cat-fortune": e("any", "info", BUILDER),
    "cat-studio": e("any", "info", BUILDER)
  };

  /** Sales documents that state the device (tools/device-fit.mjs fills the marked blocks). langs: th / en / zh, or
   *  "th+en" for a Thai document with English next to it (decks, Thai-only one-pagers). */
  const EXAM = ["exam-lab", "exam-dashboard"], GATE = ["parking", "village"];
  const DOCS = {
    "docs/ONE-PAGER-EXAM.md": { pages: EXAM, langs: ["th", "en"] },
    "docs/ONE-PAGER-GATE.md": { pages: GATE, langs: ["th", "en"] },
    "docs/ONE-PAGER-CROWD.md": { pages: ["crowd"], langs: ["th", "en"] },
    "docs/ONE-PAGER-ATTENDANCE.md": { pages: ["attendance"], langs: ["th", "en"] },
    "docs/ONE-PAGER-EVENTS.md": { pages: ["photobooth", "booth", "fortune"], langs: ["th+en"] },
    "docs/ONE-PAGER-FORTUNE.md": { pages: ["fortune", "report"], langs: ["th+en"] },
    "docs/ONE-PAGER-HR.md": { pages: ["interview", "teamface"], langs: ["th+en"] },
    "docs/ONE-PAGER-RETAIL.md": { pages: ["store"], langs: ["th+en"] },
    "docs/ONE-PAGER-TH.md": { pages: ["fortune", "store", "interview", "creative", "studio", "photobooth"], langs: ["th+en"] },
    "docs/ONE-PAGER-ZH.md": { pages: ["fortune", "store", "interview", "creative", "studio", "photobooth"], langs: ["zh"] },
    "docs/sales/DECK-EXAM.md": { pages: EXAM, langs: ["th+en"] },
    "docs/sales/DECK-GATE.md": { pages: GATE, langs: ["th+en"] },
    "docs/sales/DECK-CROWD.md": { pages: ["crowd"], langs: ["th+en"] },
    "docs/sales/DECK-ATTENDANCE.md": { pages: ["attendance"], langs: ["th+en"] },
    "docs/sales/DEMO-SCRIPT-EXAM.md": { pages: EXAM, langs: ["th", "en"] },
    "docs/sales/DEMO-SCRIPT-GATE.md": { pages: GATE, langs: ["th", "en"] },
    "docs/sales/DEMO-SCRIPT-CROWD.md": { pages: ["crowd"], langs: ["th", "en"] },
    "docs/sales/DEMO-SCRIPT-ATTENDANCE.md": { pages: ["attendance"], langs: ["th", "en"] },
    "docs/sales/ONBOARDING-EXAM.md": { pages: EXAM, langs: ["th", "en"] },
    "docs/sales/ONBOARDING-GATE.md": { pages: GATE, langs: ["th", "en"] },
    "docs/sales/ONBOARDING-CROWD.md": { pages: ["crowd"], langs: ["th", "en"] },
    "docs/sales/ONBOARDING-ATTENDANCE.md": { pages: ["attendance"], langs: ["th", "en"] }
  };

  const TEXT = {
    th: { computer: "หน้านี้ใช้บนคอมพิวเตอร์ได้ดีที่สุด", tablet: "หน้านี้ใช้บนแท็บเล็ตหรือคอมพิวเตอร์ได้ดีที่สุด",
      sub: "บนมือถือยังใช้ต่อได้ แต่จอเล็กและอาจทำงานช้ากว่า", why: "เหตุผล", send: "ส่งลิงก์นี้ให้ตัวเอง", cont: "ใช้ต่อเลย",
      shared: "เปิดหน้าต่างแชร์ของเครื่องแล้ว เลือกส่งให้ตัวเองได้เลย", copied: "คัดลอกลิงก์แล้ว นำไปเปิดบนเครื่องที่เหมาะกว่าได้เลย",
      manual: "คัดลอกอัตโนมัติไม่ได้ กดค้างที่ลิงก์ด้านล่างเพื่อคัดลอก", link: "ลิงก์ของหน้านี้", region: "คำแนะนำเรื่องอุปกรณ์" },
    en: { computer: "This page works best on a computer", tablet: "This page works best on a tablet or computer",
      sub: "It still works on a phone, but the screen is small and it may run slower.", why: "Why", send: "Send this link to myself", cont: "Continue anyway",
      shared: "Your device's share sheet is open: send it to yourself.", copied: "Link copied. Open it on a better-suited device.",
      manual: "Could not copy automatically. Press and hold the link below to copy it.", link: "Link to this page", region: "Device suggestion" },
    zh: { computer: "此页面在电脑上使用效果最佳", tablet: "此页面在平板或电脑上使用效果最佳",
      sub: "在手机上仍可继续使用，但屏幕较小，运行可能较慢。", why: "原因", send: "把链接发给自己", cont: "仍然继续",
      shared: "已打开设备的分享面板，请发送给自己。", copied: "链接已复制，请在更合适的设备上打开。",
      manual: "无法自动复制。请长按下面的链接进行复制。", link: "本页链接", region: "设备建议" }
  };
  /** @param {string} lang */
  const text = lang => TEXT[/** @type {"th"|"en"|"zh"} */ (lang)] || TEXT.th;

  /** phone = touch (coarse primary pointer, or touch points when no media query is known) AND a small viewport: the
   *  shorter side under 600 CSS px (phones in portrait and landscape; tablets and laptops are 600 and up). */
  function isPhone(env) {
    const o = env || {};
    const touch = o.coarse === true || (o.coarse !== true && +o.touch > 0);
    const w = +o.width || 0, h = +o.height || 0;
    if (!touch || !w || !h) return false;
    return Math.min(w, h) < 600;
  }
  const needsNotice = fit => fit === "computer" || fit === "tablet";
  /** the value shown in menus and catalogues: an overview page shows the strictest value of its working pages */
  function catalogueFit(page) {
    const f = FIT[page];
    if (!f) return null;
    if (!f.product) return f.fit;
    return f.product.map(p => FIT[p].fit).sort((a, b) => RANK[b] - RANK[a])[0];
  }
  const dismissKey = page => "lq-fit-ok:" + page;
  function dismissed(page, storage) {
    try { return !!storage && storage.getItem(dismissKey(page)) === "1"; } catch { return false; }
  }
  function shouldShow(o) {
    const f = FIT[o.page];
    return !!f && needsNotice(f.fit) && isPhone(o.env) && !dismissed(o.page, o.storage);
  }
  function dismiss(o) {
    try { if (o.storage) o.storage.setItem(dismissKey(o.page), "1"); } catch { /* storage blocked: the note comes back next load */ }
  }

  /** "send this link to myself": share sheet -> clipboard -> by hand. Only on-device APIs; no request of our own.
   *  @returns {Promise<"shared"|"cancelled"|"copied"|"manual">} */
  async function sendLink(o) {
    const nav = o.nav || {}, url = o.url;
    if (typeof nav.share === "function") {
      try { await nav.share({ title: o.title || "", url }); return "shared"; }
      catch (err) { if (err && err.name === "AbortError") return "cancelled"; }
    }
    if (nav.clipboard && typeof nav.clipboard.writeText === "function") {
      try { await nav.clipboard.writeText(url); return "copied"; } catch { /* fall through */ }
    }
    const d = o.doc;
    if (d && d.body && typeof d.execCommand === "function") {
      const ta = d.createElement("textarea");
      ta.value = url; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; ta.style.top = "0";
      d.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = d.execCommand("copy") === true; } catch { ok = false; }
      ta.remove();
      if (ok) return "copied";
    }
    return "manual";
  }

  const BASIS = {
    th: { measured: "วัดจากการทดสอบจำลอง ยังไม่ใช่มือถือจริง", estimate: "ประมาณการ", head: "อุปกรณ์ที่เหมาะ",
      tail: "เปิดบนมือถือได้ แต่หน้าจะขึ้นป้ายสั้น ๆ แนะนำให้เปิดบนเครื่องที่เหมาะกว่า" },
    en: { measured: "measured in a synthetic test, not yet on a real phone", estimate: "estimate", head: "Best used on",
      tail: "On a phone the page still opens, with a short notice suggesting a better-suited device." },
    zh: { measured: "模拟测试实测，尚未在真实手机上测量", estimate: "估计", head: "最适合的设备",
      tail: "在手机上仍可打开，但页面会显示简短提示，建议改用更合适的设备。" }
  };
  function docLine(pages, l) {
    const b = BASIS[l];
    const parts = pages.map(p => "`" + p + ".html` " + LABEL[FIT[p].fit][l] + (l === "zh" ? "（" + b[FIT[p].basis] + "）" : " (" + b[FIT[p].basis] + ")"));
    const tail = pages.some(p => needsNotice(FIT[p].fit)) ? (l === "en" ? ". " : " ") + b.tail : (l === "en" ? "." : "");
    return "**" + b.head + (l === "zh" ? "：** " : ":** ") + parts.join(" · ") + (l === "zh" ? "。" : "") + tail;
  }
  /** the generated block of one document and language (markers included) */
  function docBlock(doc, lang) {
    const spec = DOCS[doc];
    if (!spec) throw new Error("not in DOCS: " + doc);
    const body = lang === "th+en" ? docLine(spec.pages, "th") + "\n\n" + docLine(spec.pages, "en") : docLine(spec.pages, lang);
    return "<!-- device-fit:" + lang + " (generated by tools/device-fit.mjs from lensiq-devicefit.js) -->\n" + body + "\n<!-- /device-fit -->";
  }

  const api = { VALUES, LABEL, REASONS, FIT, DOCS, TEXT, text, isPhone, needsNotice, catalogueFit, dismissKey, shouldShow, dismiss, sendLink, docBlock };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (!root || typeof root.document === "undefined") return;

  // ---------- browser ----------
  const d = root.document;
  const page = ((root.location.pathname.split("/").pop() || "index.html").toLowerCase().replace(/\.html$/, "")) || "index";
  let storage = null;
  try { storage = root.localStorage; } catch { storage = null; }
  const lang = () => { const I = root.LQI18N; return String((I && I.lang) || d.documentElement.lang || "th").slice(0, 2); };
  const mq = q => { try { return !!root.matchMedia && root.matchMedia(q).matches; } catch { return false; } };
  function env() {
    const coarse = mq("(pointer: coarse)");
    return { width: root.innerWidth, height: root.innerHeight, coarse, touch: (root.navigator && root.navigator.maxTouchPoints) || 0 };
  }

  // dictionaries for the shared i18n (lensiq-i18n.js); the text above is the source
  const dictFor = l => {
    const o = {};
    for (const v of VALUES) o["fit.l." + v] = LABEL[v][l];
    for (const k of Object.keys(TEXT.th)) o["fit.n." + k] = TEXT[l][k];
    for (const id of Object.keys(REASONS)) o["fit.r." + id] = REASONS[id][l];
    return o;
  };
  (root.LQI18N_Q = root.LQI18N_Q || []).push({ en: dictFor("en"), zh: dictFor("zh") });

  let note = null, msgState = "";
  function render() {
    if (!note) return;
    const l = lang(), t = text(l), f = FIT[page];
    note.setAttribute("lang", l);
    note.setAttribute("aria-label", t.region);
    note.querySelector(".lq-fit-h").textContent = t[/** @type {"computer"|"tablet"} */ (f.fit)];
    note.querySelector(".lq-fit-sub").textContent = t.sub;
    note.querySelector(".lq-fit-why").textContent = t.why + ": " + REASONS[f.why][l === "en" || l === "zh" ? l : "th"];
    note.querySelector('[data-fit-act="send"]').textContent = t.send;
    note.querySelector('[data-fit-act="continue"]').textContent = t.cont;
    const m = /** @type {HTMLElement} */ (note.querySelector(".lq-fit-msg"));
    if (msgState && msgState !== "cancelled") m.firstChild.textContent = t[/** @type {"shared"|"copied"|"manual"} */ (msgState)];
    const inp = note.querySelector(".lq-fit-link");
    if (inp) inp.setAttribute("aria-label", t.link);
  }
  function show() {
    if (note || !d.body || !FIT[page]) return;
    note = d.createElement("aside");
    note.className = "lq-fit-note";
    note.setAttribute("role", "note");
    note.setAttribute("data-fit", FIT[page].fit);
    note.innerHTML = '<p class="lq-fit-h"></p><p class="lq-fit-sub"></p><p class="lq-fit-why"></p>' +
      '<div class="lq-fit-btns"><button type="button" data-fit-act="send"></button><button type="button" data-fit-act="continue"></button></div>' +
      '<p class="lq-fit-msg" role="status" hidden><span></span></p>';
    note.style.cssText = "display:block;position:static;margin:8px 16px;padding:12px 14px;border:1px solid #6d5df0;border-radius:12px;" +
      "background:#f4f2ff;color:#1f2937;font-size:15px;line-height:1.5;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere";
    for (const p of note.querySelectorAll("p")) /** @type {HTMLElement} */ (p).style.cssText = "margin:0 0 6px;color:#1f2937";
    /** @type {HTMLElement} */ (note.querySelector(".lq-fit-h")).style.fontWeight = "700";
    /** @type {HTMLElement} */ (note.querySelector(".lq-fit-why")).style.fontSize = "14px";
    /** @type {HTMLElement} */ (note.querySelector(".lq-fit-btns")).style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:4px";
    const [send, cont] = /** @type {HTMLElement[]} */ ([...note.querySelectorAll("button")]);
    send.style.cssText = "min-height:44px;min-width:44px;padding:0 14px;border-radius:8px;border:1px solid #4c3fd1;background:#4c3fd1;color:#fff;font:inherit;cursor:pointer";
    cont.style.cssText = "min-height:44px;min-width:44px;padding:0 14px;border-radius:8px;border:1px solid #4c3fd1;background:#fff;color:#3b2fb8;font:inherit;cursor:pointer";
    cont.addEventListener("click", () => {
      dismiss({ page, storage });
      if (note) { note.hidden = true; note.style.display = "none"; }
    });
    send.addEventListener("click", () => {
      sendLink({ nav: root.navigator, url: root.location.href, title: d.title, doc: d }).then(state => {
        if (!note || state === "cancelled") return;
        msgState = state;
        const m = /** @type {HTMLElement} */ (note.querySelector(".lq-fit-msg"));
        m.dataset.state = state;
        m.hidden = false;
        if (state === "manual" && !m.querySelector(".lq-fit-link")) {
          const inp = d.createElement("input");
          inp.className = "lq-fit-link"; inp.type = "text"; inp.readOnly = true; inp.value = root.location.href;
          inp.style.cssText = "display:block;width:100%;box-sizing:border-box;min-height:44px;margin-top:6px;padding:0 10px;" +
            "border:1px solid #9ca3af;border-radius:8px;font:inherit;background:#fff;color:#111827";
          inp.addEventListener("focus", () => inp.select());
          m.appendChild(inp);
        }
        render();
      });
    });
    render();
    const crumbs = d.querySelector(".lq-crumbs"), main = d.querySelector("main");
    if (crumbs && crumbs.parentNode) crumbs.insertAdjacentElement("afterend", note);
    else if (main && main.parentNode) main.parentNode.insertBefore(note, main);
    else d.body.insertBefore(note, d.body.firstChild);
  }

  // labels: menu links (computer / tablet / phone; "any" left out to keep the menu short) and the solutions catalogue
  function tag(v) {
    const s = d.createElement("span");
    s.className = "lq-fit-tag"; s.dataset.fit = v; s.setAttribute("data-i18n", "fit.l." + v);
    s.textContent = LABEL[v].th;
    return s;
  }
  const pageOf = href => (String(href || "").split("#")[0].split("?")[0].split("/").pop() || "").toLowerCase().replace(/\.html$/, "");
  function labels() {
    const made = [];
    for (const a of d.querySelectorAll("#siteNav .mega-links a[href]")) {
      const v = catalogueFit(pageOf(a.getAttribute("href")));
      if (!v || v === "any" || a.querySelector(".lq-fit-tag")) continue;
      const s = tag(v);
      s.style.cssText = "display:block;margin-top:2px;font-size:12px;font-weight:600;color:inherit";
      a.appendChild(s); made.push(s);
    }
    for (const go of d.querySelectorAll(".sl-card a.sl-go[href]")) {
      const card = go.closest(".sl-card"), v = catalogueFit(pageOf(go.getAttribute("href")));
      if (!card || !v || card.querySelector(".lq-fit-tag")) continue;
      const p = d.createElement("p");
      p.className = "sl-meta lq-fit-meta";
      const s = tag(v);
      s.style.cssText = "font-weight:600;color:#4c3fd1";
      p.appendChild(s); made.push(s);
      card.insertBefore(p, go);
    }
    if (root.LQI18N) for (const s of made) root.LQI18N.apply(s);
  }

  function start() {
    labels();
    if (shouldShow({ page, env: env(), storage })) show();
  }
  root.addEventListener("lq-lang", () => { render(); });
  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", start, { once: true }); else start();
  /** @type {any} */ (root).LQDeviceFit = Object.assign({}, api, { page, env, show });
})(typeof window !== "undefined" ? window : null);
