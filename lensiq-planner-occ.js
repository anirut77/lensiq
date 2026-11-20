/* lensiq-planner-occ.js — the added occasions of planner.html (owner order 2026-11-18), loaded on demand by planner.js when the user
 * opens an occasion group (never by a <script> tag: the speed budget counts the page before any user action). Registers itself with
 * LQPlanner.addOccasions. Rules: the occasion sources table in docs/ (internal; two sources per occasion, title, publisher, URL, date read).
 * Good days only (no bad-day label, no warning); every reason is belief wording, never a promise. EN / ZH: i18n/en-planner-occ.js,
 * i18n/zh-planner-occ.js ("pl.r.<id>", "pl.why.<id>"). Excluded on purpose: caesarean or any medical procedure; investing, shares, gold. */
(function (root) {
  "use strict";
  var P = root.LQPlanner || (typeof require === "function" ? require("./lensiq-planner.js") : null);
  var HS = root.HSCore || (typeof require === "function" ? (function () { var hsPath = "./horoscope.js"; return require(hsPath); })() : null);
  var HOME_MONTHS = [1, 2, 4, 6, 9, 12], WED_MONTHS = [2, 4, 6, 9, 10];
  /* Source class (owner decisions 114–117, 2026-11-19): src(cls, rules) — "text" = from a traditional text, "modern" = statistics,
   * office practice or thin evidence (labelled "ตามความนิยมสมัยใหม่" on the page, never worded as tradition). The rules listed are
   * the occasion's own; the shared rules taksa, zodiac and the วันพระ note are text. The source note behind each class is internal
   * (the occasion sources table in docs/, per occasion and per rule). */
  function src(cls, rules) {
    var r = { taksa: "text", zodiac: "text", phra: "text" };
    rules.split(" ").forEach(function (k) { r[k] = cls; });
    return { cls: cls, rules: r };
  }
  // weekday 0 Sunday … 6 Saturday; birth planet 7 = Wednesday night (ราหู)
  var OCC = {
    wedding: { days: [0, 1, 5], fav: [5], months: WED_MONTHS, monthsRequired: true, waxing: true, star: "sri", src: src("text", "days fav months waxing") },
    engage: { days: [0, 1, 5], fav: [5], months: WED_MONTHS, monthsRequired: true, waxing: true, star: "sri", src: src("text", "days fav months waxing") },
    regmarry: { office: true, months: WED_MONTHS, monthsRequired: true, star: "mula", src: src("modern", "office months") },
    ordain: { prelent: true, months: [7, 8], monthsRequired: true, star: "montri", src: src("text", "prelent months") },
    bdaymerit: { needsOwner: true, star: "montri", src: src("text", "needsOwner") },
    haircut: { days: [0, 1, 4, 5, 6], fav: [5], star: "montri", src: src("text", "days fav") },
    pillar: { fav: [1, 3, 4], months: HOME_MONTHS, monthsRequired: true, star: "mula", extra: "ayu", src: src("text", "fav months") },
    pile: { months: HOME_MONTHS, monthsRequired: true, star: "mula", extra: "ayu", src: src("text", "months") },
    spirit: { days: [3, 4], fav: [3, 4], lunarDays: [2, 4, 6, 9, 11], star: "mula", extra: "ayu",
      monthBan: { 1: [4, 6], 5: [4, 6], 9: [4, 6], 2: [3, 5], 6: [3, 5], 10: [3, 5], 3: [2, 6], 7: [2, 6], 11: [2, 6], 4: [1], 8: [1], 12: [1] }, src: src("text", "days fav lunarDays monthBan") },
    shrine: { days: [4, 5], fav: [4, 5], star: "montri", extra: "ayu", skipPhra: true, src: src("text", "days fav skipPhra") },
    compreg: { days: [1, 4], fav: [1, 4], star: "dech", extra: "boriwan", src: src("modern", "days fav") },
    newco: { days: [4, 5], fav: [4, 5], star: "sri", extra: "boriwan", src: src("text", "days fav") },
    contract: { days: [3, 4, 5], fav: [3, 4, 5], star: "dech", extra: "utsaha", src: src("text", "days fav") },
    branch: { days: [4, 5], fav: [4, 5], star: "sri", extra: "boriwan", src: src("text", "days fav") },
    car: { byBirth: { 0: [1], 1: [1, 5], 2: [5], 3: [1, 5], 7: [1, 5], 4: [5], 5: [1, 5], 6: [1] }, general: [1, 5], star: "montri", src: src("text", "byBirth general") },
    journey: { days: [0, 1, 3, 4], fav: [0, 1, 3, 4], star: "montri", src: src("text", "days fav") },
    waikru: { days: [4], fav: [4], months: [2, 4, 6, 8, 9, 10, 12], monthsRequired: true, waxing: true, star: "montri", extra: "utsaha", src: src("text", "days fav months waxing") },
    launch: { days: [1, 3], fav: [1, 3], star: "sri", extra: "boriwan", src: src("modern", "days fav") }
  };
  var GROUPS = [
    { id: "family", ev: ["wedding", "engage", "regmarry", "ordain", "bdaymerit", "haircut"] },
    { id: "home", ev: ["move", "pillar", "pile", "spirit", "shrine"] },
    { id: "biz", ev: ["shop", "compreg", "newco", "contract", "branch"] },
    { id: "travel", ev: ["car", "journey"] },
    { id: "study", ev: ["work", "waikru", "launch"] }
  ];
  var PL = "ตำราปลูกเรือนนับวัน", BIZ = "ตำราการค้า";
  var TH = {
    "wd.wedding.5": "วันศุกร์: ดาวศุกร์ ความรักและความสุข ตำรางานมงคลนิยมใช้แต่งงาน",
    "wd.engage.5": "วันศุกร์: ดาวศุกร์ ความรักและความสุข ตำรางานมงคลนิยมใช้ทำพิธีหมั้น",
    "wd.haircut.5": "วันศุกร์: ตำราตัดผมนิยมวันศุกร์ ซึ่งถือเป็นวันแห่งความสุข",
    "wd.pillar.1": "วันจันทร์: " + PL + "จันทร์เป็นวันดี (ตำราปลูกเรือนฉบับหนึ่ง)", "wd.pillar.3": "วันพุธ: " + PL + "พุธเป็นวันดี (ตำราปลูกเรือนฉบับหนึ่ง)", "wd.pillar.4": "วันพฤหัสบดี: " + PL + "พฤหัสบดีเป็นวันดี (ตำราปลูกเรือนฉบับหนึ่ง)",
    "wd.spirit.3": "วันพุธ: นิยมตั้งศาลพระภูมิช่วงเช้าวันพุธ", "wd.spirit.4": "วันพฤหัสบดี: นิยมตั้งศาลพระภูมิช่วงเช้าวันพฤหัสบดี",
    "wd.shrine.4": "วันพฤหัสบดี: วันครู นิยมใช้ในพิธีเกี่ยวกับสิ่งศักดิ์สิทธิ์ เช่น อัญเชิญพระขึ้นหิ้ง", "wd.shrine.5": "วันศุกร์: วันแห่งความสุขและความเจริญ นิยมใช้ตั้งหิ้งพระ",
    "wd.compreg.1": "วันจันทร์: วันแรกของสัปดาห์ เป็นวันที่มีคนจดทะเบียนบริษัทมากที่สุดวันหนึ่ง",
    "wd.compreg.4": "วันพฤหัสบดี: เป็นวันที่มีคนจดทะเบียนบริษัทมากที่สุดวันหนึ่ง",
    "wd.newco.4": "วันพฤหัสบดี: " + BIZ + "ถือเป็นวันเพิ่มความน่าเชื่อถือ นิยมใช้เริ่มกิจการ", "wd.newco.5": "วันศุกร์: " + BIZ + "ถือเป็นวันดึงดูดลูกค้า นิยมใช้เริ่มกิจการ",
    "wd.contract.3": "วันพุธ: ดาวพุธ การเจรจาและการค้า นิยมใช้เซ็นสัญญา", "wd.contract.4": "วันพฤหัสบดี: ความน่าเชื่อถือในสายตาคู่ค้า นิยมใช้ลงนามสัญญา",
    "wd.contract.5": "วันศุกร์: " + BIZ + "นับพุธถึงศุกร์เป็นวันเอื้อต่อการเจรจาและลงนาม",
    "wd.branch.4": "วันพฤหัสบดี: " + BIZ + "ถือเป็นวันโชคลาภ นิยมใช้เปิดสาขา", "wd.branch.5": "วันศุกร์: " + BIZ + "ถือเป็นวันดึงดูดลูกค้า นิยมใช้เปิดสาขา",
    "wd.journey.0": "วันอาทิตย์: อยู่ในช่วงวันอาทิตย์ถึงพฤหัสบดีที่นิยมออกเดินทาง", "wd.journey.1": "วันจันทร์: นิยมใช้ออกเดินทางและติดต่อธุระ",
    "wd.journey.3": "วันพุธ: อยู่ในช่วงวันอาทิตย์ถึงพฤหัสบดีที่นิยมออกเดินทาง", "wd.journey.4": "วันพฤหัสบดี: วันแห่งความรู้และความรอบคอบ นิยมใช้ออกเดินทางไกล",
    "wd.waikru.4": "วันพฤหัสบดี: พระพฤหัสบดีเป็นครูของทุกวิชา ตำราไหว้ครูใช้วันพฤหัสบดี",
    "wd.launch.1": "วันจันทร์: วันเริ่มต้นสัปดาห์ นิยมใช้เริ่มสิ่งใหม่", "wd.launch.3": "วันพุธ: นิยมใช้ริเริ่มโครงการและงานใหม่",
    "wedding.month": "เดือน {m}: ตำราแต่งงานนิยมเดือนคู่ (ชีวิตคู่) และเดือน 9 (ก้าวหน้า)",
    "engage.month": "เดือน {m}: การหมั้นใช้หลักเดียวกับงานแต่ง ซึ่งนิยมเดือนคู่และเดือน 9",
    "regmarry.month": "เดือน {m}: เดือนที่นิยมแต่งงาน คู่บ่าวสาวมักจดทะเบียนในเดือนเดียวกับงานแต่ง",
    "pillar.month": "เดือน {m}: ตำราปลูกเรือนนับเป็นเดือนดี (เดือน 1, 2, 4, 6, 9, 12)",
    "pile.month": "เดือน {m}: ตำราปลูกเรือนนับเป็นเดือนดีสำหรับเริ่มสร้างบ้าน (เดือน 1, 2, 4, 6, 9, 12)",
    "waikru.month": "เดือน {m}: นิยมไหว้ครูและครอบครูในเดือนคู่ และเดือน 9",
    "ordain.season": "เดือน {m}: ช่วงก่อนเข้าพรรษา นิยมบวชให้ทันจำพรรษา",
    "spirit.lday": "{d} ค่ำ: ตำราตั้งศาลพระภูมินิยมวัน 2, 4, 6, 9, 11 ค่ำ ได้ทั้งข้างขึ้นและข้างแรม",
    "bdaymerit.birth": "เจ้าของคนที่ {n} เกิดวัน{birth}: นิยมทำบุญตรงกับวันเกิดของตน",
    "car.birth": "เจ้าของคนที่ {n} (เกิด{birth}): ตำราฤกษ์ออกรถให้คนเกิดวันนี้ออกรถวัน{day}",
    "car.gen": "วัน{day}: ตำราฤกษ์ออกรถให้เป็นวันออกรถของคนเกิดหลายวัน ใส่วันเกิดเพื่อดูวันของคุณเอง"
  };
  var WHY = {
    wedding: "ตำรางานแต่งนิยมวันศุกร์ (ความรัก) เดือนคู่ตามจันทรคติ (ชีวิตคู่) หรือเดือน 9 (ก้าวหน้า) และข้างขึ้น " +
      "หน้านี้แสดงวันศุกร์ วันอาทิตย์ และวันจันทร์ในเดือนเหล่านั้น แล้วเทียบกับวันเกิดของคู่บ่าวสาว",
    engage: "การหมั้นมักหาฤกษ์พร้อมงานแต่ง จึงใช้หลักเดียวกัน: วันศุกร์ เดือนคู่ หรือเดือน 9 และข้างขึ้น แล้วเทียบกับวันเกิดของทั้งสองฝ่าย",
    regmarry: "การจดทะเบียนสมรสเป็นขั้นตอนทางราชการ ไม่มีวันในสัปดาห์ที่กำหนดไว้ คนนิยมจดในเดือนเดียวกับงานแต่ง (เดือนคู่หรือเดือน 9) หน้านี้แสดงเฉพาะวันจันทร์ถึงศุกร์ที่สำนักงานเปิด",
    ordain: "นิยมบวชช่วงก่อนเข้าพรรษา (เดือน 7 ถึงกลางเดือน 8) เพื่อให้ทันจำพรรษา วันและเวลาจริงให้พระอุปัชฌาย์และวัดเป็นผู้กำหนด",
    bdaymerit: "นิยมทำบุญวันเกิดตรงกับวันในสัปดาห์ที่ตนเกิด หรือวันเกิดประจำปี ใส่วันเกิดของเจ้าของงานเพื่อดูวัน",
    haircut: "พิธีโกนผมไฟเดิมทำเมื่อเด็กอายุครบ 1 เดือน ปัจจุบันยืดได้ถึงราว 6 เดือน ตำราตัดผมนิยมวันศุกร์ " +
      "ถ้าใส่วันเกิดของเด็ก รายการจะเทียบกับวันเกิด และอาจมีวันอาทิตย์ จันทร์ พฤหัสบดี หรือเสาร์ด้วย",
    pillar: "ตำราปลูกเรือนนิยมเดือน 1, 2, 4, 6, 9, 12 ตามจันทรคติ หน้านี้แสดงเฉพาะวันในเดือนเหล่านั้น " +
      "ตำราฉบับหนึ่งนิยมวันจันทร์ พุธ และพฤหัสบดี (ได้คะแนนเพิ่ม) แล้วเทียบกับวันเกิดของเจ้าบ้าน",
    pile: "การลงเสาเข็มคือการเริ่มสร้างบ้าน ตำราปลูกเรือนนิยมเดือน 1, 2, 4, 6, 9, 12 ตามจันทรคติ " +
      "ตำราที่พบไม่ได้กำหนดวันในสัปดาห์ บางตำราใช้วันอธิบดีประจำปี ควรถามผู้รู้ แล้วเทียบกับวันเกิดของเจ้าบ้าน",
    spirit: "ตำราตั้งศาลพระภูมินิยมช่วงเช้าวันพุธหรือพฤหัสบดี ในวัน 2, 4, 6, 9, 11 ค่ำ ตามตารางวันประจำเดือนของตำรา และนิยมทำพิธีก่อนเที่ยง",
    shrine: "ตำราตั้งหิ้งพระนิยมวันพฤหัสบดี (วันครู) และวันศุกร์ (ความสุข) ช่วงเช้าหรือเย็น และใช้วันที่ไม่ใช่วันพระ เวลาที่ทุกคนในบ้านสะดวกก็นับเป็นมงคล",
    compreg: "วันจันทร์และวันพฤหัสบดีเป็นวันที่คนนิยมจดทะเบียนบริษัทมากที่สุดตามสถิติการจดทะเบียน จดได้เฉพาะวันทำการ",
    newco: "ตำราการค้านิยมเริ่มกิจการวันพฤหัสบดี (ความน่าเชื่อถือ) และวันศุกร์ (ดึงดูดลูกค้า) แล้วเทียบกับวันเกิดของเจ้าของกิจการ",
    contract: "ตำราการค้านิยมวันพุธถึงศุกร์สำหรับเจรจาและลงนาม วันพฤหัสบดีนับเป็นวันความน่าเชื่อถือ แล้วเทียบกับวันเกิดของผู้ลงนาม",
    branch: "การเปิดสาขาใช้หลักเดียวกับเปิดร้าน: วันพฤหัสบดีและวันศุกร์ แล้วเทียบกับวันเกิดของเจ้าของ",
    car: "ฤกษ์ออกรถดูจากวันเกิดของเจ้าของรถเป็นหลัก ใส่วันเกิดเพื่อดูวันของคุณ ถ้าไม่ใส่จะแสดงวันจันทร์และวันศุกร์ซึ่งเข้ากับคนเกิดหลายวัน ความพร้อมของผู้ขับสำคัญที่สุด",
    journey: "ตำราเดินทางนิยมวันอาทิตย์ จันทร์ พุธ และพฤหัสบดี โดยวันจันทร์และวันพฤหัสบดีเป็นวันที่หลายตำราตรงกัน ควรดูความพร้อมของคนและรถประกอบด้วย",
    waikru: "ตำราไหว้ครูดนตรีและนาฏศิลป์ใช้วันพฤหัสบดี เพราะพระพฤหัสบดีเป็นครูของทุกวิชา นิยมข้างขึ้นและเดือนคู่ วันจริงมักเป็นของครูผู้ประกอบพิธี",
    launch: "เรื่องวันเปิดตัวสินค้ามีหลักฐานน้อย หน้านี้ใช้ความนิยมทั่วไปที่เริ่มสิ่งใหม่วันจันทร์ (ต้นสัปดาห์) และวันพุธ แล้วเทียบกับวันเกิดของเจ้าของ"
  };
  /** owners' taksa (ทักษา) and zodiac year, shared with planOcc: {skip} when a kalakini / clash day (never shown as a warning) */
  function ownerPoints(owners, ev, wd, branch, reasons) {
    var score = 0, skip = false;
    owners.forEach(function (w, i) {
      var bh = HS.bhumiOf(w.planet, wd);
      if (bh === "kalakini") { skip = true; return; }
      var pts = P.BHUMI_PTS[bh] || (P.EVENT_EXTRA[ev] === bh ? 1 : 0);
      if (pts) {
        if (P.EVENT_STAR[ev] === bh) pts += 1;
        score += pts; reasons.push({ id: "bh." + bh, v: { n: i + 1, planet: w.planet, wd: wd, bhumi: bh, star: P.EVENT_STAR[ev] === bh } });
      }
      if (w.animal != null && w.animal >= 0 && w.animal <= 11) {
        var rel = HS.branchRel(w.animal, branch);
        if (rel === "clash") { skip = true; return; }
        var zid = { harmony: "zHarmony", trine: "zTrine", same: "zSame" }[rel];
        if (zid) { score += 1; reasons.push({ id: zid, v: { n: i + 1, animal: w.animal, dayAnimal: branch } }); }
      }
    });
    return { score: score, skip: skip };
  }

  /**
   * Added occasions (rule R = OCC[ev], recorded with two sources each): R.days weekdays that may be listed (the favoured ones and,
   * where the sources name the days to leave out, the days no source advises against); R.fav favoured weekdays (+1, own reason);
   * R.office Mon–Fri only (an office has to be open); R.months lunar months (+1; R.monthsRequired: only those); R.prelent before
   * เข้าพรรษา; R.lunarDays ค่ำ that qualify (+1); R.monthBan lunar month -> weekdays left out; R.waxing ข้างขึ้น (+1); R.skipPhra วันพระ not listed;
   * R.byBirth birth weekday -> weekdays (owner 1; R.general without an owner); R.needsOwner the owner's birth weekday.
   * Good days only, like plan(): a day that does not qualify is simply not listed.
   */
  function planOcc(o, ev, R) {
    var owners = (o.owners || []).filter(function (w) { return w && w.planet >= 0 && w.planet <= 7; }).slice(0, 3);
    if (R.needsOwner && !owners.length) return [];
    var a = HS.jdn(o.from.y, o.from.m, o.from.d), b = HS.jdn(o.to.y, o.to.m, o.to.d);
    if (b < a) { var t = a; a = b; b = t; }
    b = Math.min(b, a + 400);
    var out = [], min = o.min == null ? (R.min || 1) : o.min;
    for (var j = a; j <= b; j++) {
      var dt = HS.fromJD(j), y = dt.y, m = dt.m, d = dt.d, wd = P.weekday(y, m, d);
      if (R.days && R.days.indexOf(wd) < 0) continue;
      if (R.office && (wd === 0 || wd === 6)) continue;
      var L = P.lunarDay(y, m, d), score = 0, reasons = [];
      if (R.monthBan && (R.monthBan[L.month] || []).indexOf(wd) >= 0) continue;
      if (R.prelent && !(L.month === 7 || (L.month === 8 && (L.waxing || L.firstEight)))) continue;
      if (R.lunarDays && R.lunarDays.indexOf(L.day) < 0) continue;
      if (R.skipPhra && L.phra) continue;
      if (R.byBirth) {
        var okDays = owners.length ? R.byBirth[owners[0].planet] : R.general;
        if (okDays.indexOf(wd) < 0) continue;
        score += 1; reasons.push(owners.length ? { id: ev + ".birth", v: { n: 1, planet: owners[0].planet, wd: wd } } : { id: ev + ".gen", v: { wd: wd } });
      }
      if (R.needsOwner) {
        var hit = -1;
        owners.forEach(function (w, i) { if (hit < 0 && (w.planet === 7 ? 3 : w.planet) === wd) hit = i; });
        if (hit < 0) continue;
        score += 1; reasons.push({ id: ev + ".birth", v: { n: hit + 1, planet: owners[hit].planet } });
      }
      if (R.fav && R.fav.indexOf(wd) >= 0) { score += 1; reasons.push({ id: "wd." + ev + "." + wd, v: {} }); }
      if (R.prelent) { score += 1; reasons.push({ id: ev + ".season", v: { m: L.month } }); }
      if (R.months && !R.prelent) {
        if (R.months.indexOf(L.month) >= 0) { score += 1; reasons.push({ id: ev + ".month", v: { m: L.month } }); }
        else if (R.monthsRequired) continue;
      }
      if (R.lunarDays) { score += 1; reasons.push({ id: ev + ".lday", v: { d: L.day } }); }
      if (R.waxing && L.waxing) { score += 1; reasons.push({ id: L.day === 15 ? "full" : "waxing", v: { d: L.day } }); }
      var op = ownerPoints(owners, ev, wd, HS.dayPillarJDN(j).branch, reasons);
      if (op.skip) continue;
      score += op.score;
      if (score < min) continue;
      if (L.phra) reasons.push({ id: "phra", v: {}, note: true });
      out.push({ y: y, m: m, d: d, wd: wd, lunar: L, score: score, reasons: reasons, colour: { day: wd, lucky: HS.taksa(wd).sri } });
    }
    return out;
  }

  /** maximum score of an added occasion (the "matches n of N" label) */
  function maxOcc(R, owners) {
    var own = owners.reduce(function (s, w) { return s + 3 + (w.animal != null && w.animal >= 0 ? 1 : 0); }, 0);
    return own + (R.byBirth ? 1 : 0) + (R.needsOwner ? 1 : 0) + (R.fav ? 1 : 0) + (R.prelent ? 1 : 0) + (R.months && !R.prelent ? 1 : 0) + (R.lunarDays ? 1 : 0) + (R.waxing ? 1 : 0);
  }

  var PACK = { OCC: OCC, GROUPS: GROUPS, TH: TH, WHY: WHY, planOcc: planOcc, maxOcc: maxOcc };
  if (P && P.addOccasions) P.addOccasions(PACK);
  if (typeof module !== "undefined" && module.exports) module.exports = PACK;
  root.LQPlannerOcc = PACK;
})(typeof window !== "undefined" ? window : globalThis);
