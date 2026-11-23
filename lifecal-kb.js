/* lifecal-kb.js — คลังความหมาย (ภาษาไทย) และตัวสร้าง facts ของ 八字 · ทักษา · เลข 7 ตัว 9 ฐาน · กราฟชีวิต
 * ใช้คู่กับ lifecal.js (การคำนวณ) และ fortune-ai.js (ตัวเรียบเรียง) — ภาษาจีนอยู่ที่ i18n/zh-kb-lifecal.js (คีย์เดียวกัน)
 * หลัก: บอกทั้งด้านที่ส่งเสริมและด้านที่ควรระวัง (tone: favourable / neutral / caution) — ด้านที่ควรระวังต้องนุ่มนวลและมีสิ่งที่ทำได้
 * ไม่ทำนายโรค อุบัติเหตุ ความตาย การนอกใจ การหย่าร้าง ภัยพิบัติ ไม่ให้เลขเสี่ยงโชค "สุขภาพ" หมายถึงการดูแลตัวเองเท่านั้น
 * ตามความเชื่อ (โปรดใช้วิจารณญาณ) ไม่ใช่การพยากรณ์ทางวิทยาศาสตร์ */
(function (root) {
  "use strict";
  var LC = root.LifeCal || (typeof require === "function" ? require("./lifecal.js") : null);

  /* ---------- 八字 ---------- */
  var EL = [
    { key: "wood", th: "ไม้", zh: "木", color: "เขียว", hi: "คุณมีพลังของการเติบโตสูง ชอบเริ่มสิ่งใหม่และวางแผนระยะยาว", lo: "พลังของการเริ่มต้นใหม่ยังน้อย บางครั้งอาจลังเลก่อนก้าวแรก", act: "ลองเดินในสวนหรือดูแลต้นไม้สักกระถาง แล้วเขียนเป้าหมายเล็ก ๆ หนึ่งข้อ" },
    { key: "fire", th: "ไฟ", zh: "火", color: "แดงและส้ม", hi: "คุณกระตือรือร้น พูดจาเปิดเผย และจุดประกายให้คนรอบตัวได้ดี", lo: "ความกระตือรือร้นอาจหมดเร็วเมื่อเหนื่อย", act: "ลองออกไปรับแดดยามเช้าและเลือกงานที่ทำให้ใจตื่นตัววันละเรื่อง" },
    { key: "earth", th: "ดิน", zh: "土", color: "เหลืองและน้ำตาล", hi: "คุณมั่นคง หนักแน่น และเป็นที่พึ่งของคนรอบตัว", lo: "ความมั่นคงทางใจอาจแกว่งเมื่อมีหลายเรื่องเข้ามาพร้อมกัน", act: "ควรจัดกิจวัตรประจำวันให้เป็นระบบ และกันเวลาพักไว้ทุกวัน" },
    { key: "metal", th: "ทอง", zh: "金", color: "ขาวและเงิน", hi: "คุณมีระเบียบ ตัดสินใจชัด และรักษาคำพูด", lo: "การตัดสินใจเด็ดขาดอาจยังไม่ใช่จุดถนัด", act: "ลองจัดโต๊ะให้โล่ง และกำหนดวันส่งงานให้ตัวเองทีละงาน" },
    { key: "water", th: "น้ำ", zh: "水", color: "น้ำเงินและดำ", hi: "คุณช่างคิด ปรับตัวเก่ง และเข้าใจความรู้สึกคนอื่น", lo: "การหยุดคิดทบทวนอาจน้อยไปเมื่อชีวิตเร่งรีบ", act: "ลองกันเวลาเงียบ ๆ วันละสิบนาทีเพื่อทบทวนสิ่งที่ทำ" },
  ];
  var STEM = [
    { th: "ไม้หยาง (เจี่ย 甲)", p: "คุณตรงไปตรงมา มีหลักยึด และอยากเติบโตอย่างมั่นคงเหมือนต้นไม้ใหญ่", w: "คุณเหมาะกับงานที่ได้วางรากฐานและนำทีมในระยะยาว", l: "ในความรัก คุณจริงจังและพร้อมดูแลอีกฝ่ายอย่างมั่นคง", m: "เรื่องเงิน คุณชอบสะสมแบบค่อยเป็นค่อยไปมากกว่าการเสี่ยง" },
    { th: "ไม้หยิน (อี่ 乙)", p: "คุณอ่อนโยน ยืดหยุ่น และหาทางไปต่อได้เสมอเหมือนเถาไม้เลื้อย", w: "คุณเหมาะกับงานประสานงานและงานที่ต้องใช้ความละเอียดอ่อน", l: "ในความรัก คุณใส่ใจรายละเอียดเล็ก ๆ ที่ทำให้อีกฝ่ายอุ่นใจ", m: "เรื่องเงิน คุณใช้จ่ายอย่างรู้คุณค่าและเก่งเรื่องการต่อรอง" },
    { th: "ไฟหยาง (ปิ่ง 丙)", p: "คุณสดใส เปิดเผย และอบอุ่นเหมือนแสงอาทิตย์", w: "คุณเหมาะกับงานที่ได้นำเสนอ สอน หรือสร้างแรงบันดาลใจ", l: "ในความรัก คุณแสดงความรู้สึกตรง ๆ และใจกว้าง", m: "เรื่องเงิน คุณหาเงินได้ดีเมื่อได้ทำงานที่มีคนเห็นผลงาน" },
    { th: "ไฟหยิน (ติง 丁)", p: "คุณละเอียดอ่อน มีสมาธิ และให้ความอบอุ่นแบบเทียนที่ส่องทาง", w: "คุณเหมาะกับงานที่ต้องใช้ความคิดลึกและฝีมือเฉพาะทาง", l: "ในความรัก คุณดูแลอีกฝ่ายอย่างสม่ำเสมอแม้ไม่ค่อยพูด", m: "เรื่องเงิน คุณเก็บออมได้ดีเมื่อมีเป้าหมายที่ชัด" },
    { th: "ดินหยาง (อู้ 戊)", p: "คุณหนักแน่น ไว้ใจได้ และมั่นคงเหมือนภูเขา", w: "คุณเหมาะกับงานบริหาร งานที่ต้องรับผิดชอบสูง และงานที่ต้องสร้างความน่าเชื่อถือ", l: "ในความรัก คุณเป็นที่พึ่งที่มั่นคงของคนที่คุณรัก", m: "เรื่องเงิน คุณเหมาะกับการสะสมทรัพย์ระยะยาว" },
    { th: "ดินหยิน (จี่ 己)", p: "คุณใจดี ช่างดูแล และให้พื้นที่คนอื่นได้เติบโตเหมือนผืนดินในสวน", w: "คุณเหมาะกับงานบริการ งานดูแลคน และงานที่ต้องใช้ความอดทน", l: "ในความรัก คุณอบอุ่นและรับฟังได้ดี", m: "เรื่องเงิน คุณวางแผนรายรับรายจ่ายได้ละเอียด" },
    { th: "ทองหยาง (เกิง 庚)", p: "คุณเด็ดเดี่ยว ตรงไปตรงมา และกล้าตัดสินใจเหมือนเหล็กกล้า", w: "คุณเหมาะกับงานที่ต้องแก้ปัญหาเร็วและตัดสินใจภายใต้แรงกดดัน", l: "ในความรัก คุณซื่อตรงและปกป้องคนที่รัก", m: "เรื่องเงิน คุณกล้าลงมือเมื่อเห็นโอกาสที่ชัด" },
    { th: "ทองหยิน (ซิน 辛)", p: "คุณประณีต มีรสนิยม และใส่ใจคุณภาพเหมือนอัญมณี", w: "คุณเหมาะกับงานออกแบบ งานคุณภาพ และงานที่ต้องการความแม่นยำ", l: "ในความรัก คุณให้ความสำคัญกับความใส่ใจและความจริงใจ", m: "เรื่องเงิน คุณเลือกใช้เงินกับสิ่งที่มีคุณค่าจริง" },
    { th: "น้ำหยาง (เหริน 壬)", p: "คุณมองกว้าง คิดการใหญ่ และเคลื่อนไหวไม่หยุดเหมือนแม่น้ำ", w: "คุณเหมาะกับงานวางกลยุทธ์ งานเดินทาง และงานต่างประเทศ", l: "ในความรัก คุณเปิดใจกว้างและชอบเรียนรู้ไปด้วยกัน", m: "เรื่องเงิน คุณมองเห็นโอกาสใหม่ได้ไวเมื่อวางแผนรอบคอบ" },
    { th: "น้ำหยิน (กุ่ย 癸)", p: "คุณช่างสังเกต ลึกซึ้ง และเข้าใจคนเหมือนน้ำค้างที่ซึมลึก", w: "คุณเหมาะกับงานวิเคราะห์ งานวิจัย และงานที่ต้องอ่านใจคน", l: "ในความรัก คุณอ่อนโยนและรับรู้ความรู้สึกของอีกฝ่ายได้ไว", m: "เรื่องเงิน คุณเก็บเล็กผสมน้อยได้ดีและวางแผนเงียบ ๆ" },
  ];
  var STRENGTH = {
    strong: { th: "เจ้าชะตาแข็งแรง", tone: "favourable", p: "พลังของตัวคุณเองค่อนข้างเต็ม คุณจึงมีแรงผลักดันและพึ่งตัวเองได้ดี", a: "ลองแบ่งพลังไปช่วยงานส่วนรวมหรือสอนคนอื่น จะยิ่งสมดุล" },
    balanced: { th: "เจ้าชะตาสมดุล", tone: "favourable", p: "พลังในดวงค่อนข้างสมดุล คุณจึงปรับตัวได้ดีทั้งช่วงสบายและช่วงที่ต้องใช้แรง", a: "รักษาจังหวะชีวิตที่สม่ำเสมอไว้ แล้วผลจะค่อย ๆ เติบโต" },
    weak: { th: "เจ้าชะตาต้องการแรงหนุน", tone: "caution", p: "ตำรามองว่าพลังของตัวคุณเองยังต้องการแรงหนุน บางช่วงคุณอาจรู้สึกว่าต้องแบกหลายเรื่อง", a: "ควรหาคนที่ไว้ใจได้ช่วยคิด และเรียนรู้เพิ่มทีละเรื่องเพื่อเติมกำลัง" },
  };
  // สิบเทพของวัยจร (大运) — หัวข้อที่เด่นในช่วงนั้น
  var GOD = {
    peer: { th: "ช่วงเพื่อนร่วมทาง (比劫)", tone: "neutral", t: "ช่วงวัยนี้เด่นเรื่องเพื่อนร่วมทางและการแข่งขันอย่างสร้างสรรค์", c: "คุณจะได้แรงหนุนจากเพื่อนและเครือข่าย", m: "ตำรามองว่าเรื่องเงินอาจไหลออกง่ายเพราะเพื่อนและการแบ่งปัน", a: "ควรแยกเงินส่วนตัวกับเงินที่ร่วมกับผู้อื่นให้ชัดเจน" },
    output: { th: "ช่วงแสดงฝีมือ (食伤)", tone: "favourable", t: "ช่วงวัยนี้เด่นเรื่องการแสดงฝีมือ ความคิดสร้างสรรค์ และการสื่อสาร", w: "ผลงานที่ทำด้วยฝีมือของคุณจะเป็นที่รู้จักมากขึ้น", l: "เสน่ห์และการพูดคุยช่วยให้ความสัมพันธ์สดใส", a: "ลองเก็บผลงานไว้เป็นแฟ้มและนำเสนอให้คนเห็นบ่อยขึ้น" },
    wealth: { th: "ช่วงทรัพย์ (财)", tone: "favourable", t: "ช่วงวัยนี้เด่นเรื่องรายได้ การลงทุนอย่างรอบคอบ และการบริหารทรัพย์", m: "รายได้มีโอกาสเติบโตจากความขยันและการวางแผน", a: "ควรวางแผนออมและลงทุนระยะยาวอย่างสม่ำเสมอ" },
    officer: { th: "ช่วงหน้าที่ (官杀)", tone: "neutral", t: "ช่วงวัยนี้เด่นเรื่องหน้าที่ ตำแหน่ง และความรับผิดชอบ", w: "คุณมีโอกาสได้รับบทบาทที่ใหญ่ขึ้น แต่ก็ต้องรับแรงกดดันมากขึ้นด้วย", a: "ควรรักษาวินัย จัดลำดับงานให้ชัด และพักให้พอระหว่างทาง" },
    resource: { th: "ช่วงความรู้และผู้อุปถัมภ์ (印)", tone: "favourable", t: "ช่วงวัยนี้เด่นเรื่องการเรียนรู้ ผู้ใหญ่ที่สนับสนุน และการดูแลใจ", w: "การเรียนเพิ่มหรือได้ผู้ใหญ่ช่วยแนะนำจะเปิดทางให้งานของคุณ", a: "ลองลงเรียนสิ่งใหม่สักเรื่องและขอคำแนะนำจากผู้มีประสบการณ์" },
  };
  function baziFacts(B, topic, opts) {
    opts = opts || {};
    var dm = B.dayMaster, S = STEM[dm.stem], hi = EL[B.strongest], lo = EL[B.weakest], st = STRENGTH[B.strength];
    // รอบ 11: แผนเสริมธาตุต้องเสริมเฉพาะ "ธาตุที่ผังนี้ต้องการ" (B.favour) — ธาตุเด่น/ธาตุน้อยที่ไม่ใช่ธาตุที่ต้องการ ใช้วิธีของเจ้าชะตาแทน
    var helpful = B.favour.map(function (e) { return EL[e].key; }), dmRemedy = "el." + EL[B.favour[0]].key;
    var boost = function (e) { return B.favour.indexOf(e) >= 0 ? "el." + EL[e].key : dmRemedy; };
    var P = B.pillars, pz = [P.year.zh, P.month.zh, P.day.zh].concat(P.hour ? [P.hour.zh] : []).join(" ");
    var items = [
      { id: "dm." + dm.stem, group: "เจ้าชะตา (日主)", label: S.th, short: "เจ้าชะตา" + EL[dm.el].th, evidence: "เสาวัน " + P.day.zh, strength: 0.96, tone: "favourable", remedy: dmRemedy, tags: ["personality", "work", "love", "money"],
        meanings: { overview: [S.p], personality: [S.p], work: [S.w], love: [S.l], money: [S.m] } },
      { id: "str." + B.strength, group: "กำลังเจ้าชะตา", label: st.th, short: st.th, evidence: "ธาตุเดียวกับเจ้าชะตา " + B.elementShare[dm.el] + "% ของผัง + ธาตุที่ให้กำเนิด + ฤดูเกิด", strength: 0.8, tone: st.tone, tags: ["personality", "advice"],
        meanings: { personality: [st.p], advice: [st.a] } },
      { id: "el.hi." + hi.key, group: "ห้าธาตุ", label: "ธาตุ" + hi.th + "เด่นที่สุด", short: "ธาตุ" + hi.th, evidence: "สัดส่วน " + B.elementShare[B.strongest] + "% ของแปดอักษร", strength: 0.7, tone: "favourable", remedy: boost(B.strongest), tags: ["personality"],
        meanings: { personality: [hi.hi] } },
      { id: "el.lo." + lo.key, group: "ห้าธาตุ", label: "ธาตุ" + lo.th + "น้อยที่สุด", short: "ธาตุ" + lo.th + "ที่น้อย", evidence: "สัดส่วน " + B.elementShare[B.weakest] + "% ของแปดอักษร", strength: 0.62, tone: "caution", remedy: boost(B.weakest), tags: ["personality", "advice"],
        meanings: { personality: [lo.lo], advice: [lo.act] } },
    ];
    var age = opts.age != null ? opts.age : (new Date().getFullYear()) - B.input.y, L = LC.luckAt(B, age);
    if (L) {
      var G = GOD[L.stemGod], m = { timing: [G.t] };
      ["w", "m", "l", "c"].forEach(function (k) { if (G[k]) m[{ w: "work", m: "money", l: "love", c: "social" }[k]] = [G[k]]; });
      if (G.a) m.advice = [G.a];
      items.push({ id: "luck." + L.stemGod, group: "วัยจร 10 ปี (大运)", label: "วัยจร " + L.pillar.zh + " · " + G.th, short: "วัยจรช่วงนี้", evidence: "อายุราว " + Math.round(L.from) + "–" + Math.round(L.to) + " ปี",
        strength: 0.85, tone: L.fav === 0 && G.tone !== "favourable" ? "caution" : G.tone, tags: Object.keys(m), meanings: m });
    }
    return { domain: "bazi", topic: topic || "overall", subject: {}, helpful: helpful, headline: "แปดอักษร " + pz + " · เจ้าชะตา" + EL[dm.el].th, items: items, extras: { luckyColors: B.favour.slice(0, 2).map(function (e) { return EL[e].color; }) } };
  }

  /* ---------- ทักษา ---------- */
  var PLANET = {
    1: { th: "อาทิตย์", color: "แดง", day: "วันอาทิตย์", q: "เกียรติและความเป็นผู้นำ" },
    2: { th: "จันทร์", color: "เหลืองนวล", day: "วันจันทร์", q: "เสน่ห์และความอ่อนโยน" },
    3: { th: "อังคาร", color: "ชมพู", day: "วันอังคาร", q: "ความกล้าและความขยัน" },
    4: { th: "พุธ", color: "เขียว", day: "วันพุธ (กลางวัน)", q: "การสื่อสารและการค้า" },
    5: { th: "พฤหัสบดี", color: "ส้ม", day: "วันพฤหัสบดี", q: "ปัญญาและผู้ใหญ่อุปถัมภ์" },
    6: { th: "ศุกร์", color: "ฟ้า", day: "วันศุกร์", q: "ความรัก ศิลปะ และความสุข" },
    7: { th: "เสาร์", color: "ม่วง", day: "วันเสาร์", q: "ความอดทนและความรับผิดชอบ" },
    8: { th: "ราหู", color: "เทาและดำ", day: "วันพุธกลางคืน", q: "ความทะเยอทะยานและการเปลี่ยนแปลง" },
  };
  var BHUMI_TH = {
    boriwan: { th: "บริวาร", tone: "favourable", tag: "social", m: "คนรอบตัวและลูกน้องเป็นกำลังสำคัญของคุณ" },
    ayu: { th: "อายุ", tone: "favourable", tag: "advice", m: "พลังในการดูแลตัวเองและความสม่ำเสมอของชีวิตมาจากดาวนี้", a: "ลองทำกิจวัตรดูแลตัวเองสั้น ๆ ทุกวัน เช่น เดินเล่นหรือนอนให้ตรงเวลา" },
    det: { th: "เดช", tone: "favourable", tag: "work", m: "อำนาจ บารมี และความน่าเกรงขามในการงานมาจากดาวนี้" },
    sri: { th: "ศรี", tone: "favourable", tag: "money", m: "โชคและความเป็นสิริมงคลด้านทรัพย์มาจากดาวนี้" },
    mula: { th: "มูละ", tone: "neutral", tag: "money", m: "รากฐาน บ้าน และทรัพย์สินที่สะสมไว้มาจากดาวนี้" },
    utsaha: { th: "อุตสาหะ", tone: "favourable", tag: "work", m: "ความขยันและความพากเพียรในการลงมือทำมาจากดาวนี้" },
    montri: { th: "มนตรี", tone: "favourable", tag: "social", m: "ผู้ใหญ่และคนที่คอยช่วยเหลือสนับสนุนมาจากดาวนี้" },
    kalakini: { th: "กาลกิณี", tone: "caution", tag: "advice", m: "ตำราถือว่าดาวนี้เป็นจุดที่ควรระวัง ของใช้หรือการตัดสินใจที่เกี่ยวกับดาวนี้ควรทำอย่างรอบคอบ", a: "หากชอบความสบายใจ ลองเลี่ยงสีของดาวนี้ในวันสำคัญ แต่ความตั้งใจของคุณสำคัญกว่าเสมอ" },
  };
  function taksaFacts(T, topic, opts) {
    opts = opts || {};
    var bp = T.birth.planet, items = [];
    var P0 = PLANET[bp];
    items.push({ id: "tk.boriwan." + bp, group: "ดาวประจำวันเกิด", label: "ดาว" + P0.th + " (" + P0.day + ")", short: "ดาว" + P0.th, evidence: "ภูมิบริวาร", strength: 0.95, tone: "favourable", tags: ["personality", "social"],
      meanings: { overview: ["ดาวประจำวันเกิดของคุณคือดาว" + P0.th + " ซึ่งตำราให้ความหมายเรื่อง" + P0.q], personality: ["คุณมีพลังของ" + P0.q + "เป็นพื้นฐาน"], social: [BHUMI_TH.boriwan.m],
        // ภูมิบริวารในตำราทักษารวมถึงคู่ครองและคนในครอบครัว → ใช้ตอบเรื่องความรักได้ตรงตำรา
        love: ["ในตำราทักษา ภูมิบริวารยังหมายถึงคู่ครองและคนในครอบครัว ความสัมพันธ์ใกล้ชิดจึงเติบโตได้ดีเมื่อคุณดูแลคนรอบตัวอย่างใส่ใจ"] } });
    ["sri", "det", "montri", "utsaha", "ayu", "kalakini"].forEach(function (b, i) {
      var p = T.bhumi[b], B = BHUMI_TH[b], P = PLANET[p], m = {};
      m[B.tag] = [B.m.replace("ดาวนี้", "ดาว" + P.th) + " สีประจำดาวคือสี" + P.color];
      if (B.a) m.advice = [B.a.replace("ดาวนี้", "ดาว" + P.th)];
      if (B.tag !== "advice") m.overview = m[B.tag].slice();
      items.push({ id: "tk." + b + "." + p, group: "ภูมิทักษา", label: "ภูมิ" + B.th + " (ดาว" + P.th + ")", short: "ภูมิ" + B.th, evidence: "นับจากดาว" + P0.th + "ตามวงทักษา", strength: 0.88 - i * 0.05, tone: B.tone, tags: Object.keys(m), meanings: m });
    });
    var age = opts.age != null ? opts.age : new Date().getFullYear() - (T.y || new Date().getFullYear()), M = LC.mahaAt(T, Math.max(0, age)), MP = PLANET[M.planet], MB = BHUMI_TH[M.bhumi];
    var mm = { timing: ["ช่วงอายุ " + M.from + "–" + M.to + " ปีอยู่ในมหาทักษาของดาว" + MP.th + " ซึ่งเด่นเรื่อง" + MP.q] };
    if (M.bhumi === "kalakini") mm.advice = ["ควรตัดสินใจเรื่องใหญ่อย่างใจเย็น ทำทีละขั้น และปรึกษาคนที่ไว้ใจก่อนลงมือ"];
    items.push({ id: "maha." + M.planet + "." + M.bhumi, group: "มหาทักษา (อายุจร)", label: "มหาทักษาดาว" + MP.th + " (ภูมิ" + MB.th + ")", short: "มหาทักษาช่วงนี้", evidence: "อายุ " + M.from + "–" + M.to + " ปี",
      strength: 0.9, tone: MB.tone, tags: Object.keys(mm), meanings: mm });
    return { domain: "taksa", topic: topic || "overall", subject: {}, headline: "ดาว" + P0.th + " · ภูมิศรีคือดาว" + PLANET[T.bhumi.sri].th, items: items, extras: { luckyColors: [PLANET[T.bhumi.sri].color, PLANET[T.bhumi.det].color] } };
  }

  /* ---------- เลข 7 ตัว 9 ฐาน (ฐาน 1–4) ---------- */
  var HOUSE = [
    { th: "ตนุ", tag: "personality", m: "ตัวตน ความมั่นใจ และภาพที่คนอื่นมองเห็น" },
    { th: "กดุมภะ", tag: "money", m: "ทรัพย์สินและการหาเงินเก็บเงิน" },
    { th: "สหัชชะ", tag: "social", m: "เพื่อน พี่น้อง และการเดินทางใกล้ ๆ" },
    { th: "พันธุ", tag: "social", m: "ครอบครัว บ้าน และญาติพี่น้อง" },
    { th: "ปุตตะ", tag: "love", m: "ความรัก ความสุข และงานสร้างสรรค์" },
    { th: "อริ", tag: "work", m: "การรับมือกับคู่แข่งและงานที่ต้องฝ่าฟัน" },
    { th: "ปัตนิ", tag: "love", m: "คู่ครองและหุ้นส่วน" },
  ];
  /** ทุกภพเป็นสิ่งที่พบหนึ่งชิ้น: สูงกว่าค่าเฉลี่ยชัด = จุดแข็ง (favourable), ต่ำกว่าชัด = ควรค่อย ๆ เติม (caution), อื่น ๆ = ปกติ */
  var L7_TONE = function (v, mean) { return v >= mean + 2 ? "favourable" : v <= mean - 3 ? "caution" : "neutral"; };
  var L7_LINE = {
    favourable: function (H) { return "ผังเลขชี้ว่าเรื่อง" + H.m + "เป็นจุดแข็งที่ใช้ได้ทันที"; },
    neutral: function (H) { return "เรื่อง" + H.m + "มีพลังพอดี ดูแลไปตามจังหวะปกติได้"; },
    caution: function (H) { return "ผังเลขชี้ว่าด้าน" + H.th + " (" + H.m + ") ยังมีพลังน้อย จึงควรค่อย ๆ เติม"; },
  };
  var L7_LINE2 = {
    favourable: function (H) { return "พลังของภพ" + H.th + "ช่วยให้เรื่อง" + H.m + "เดินหน้าได้ง่ายกว่าเรื่องอื่น"; },
    neutral: function (H) { return "ภพ" + H.th + "อยู่ในระดับกลาง เรื่อง" + H.m + "จึงขึ้นกับความสม่ำเสมอของคุณ"; },
    caution: function (H) { return "ตำรามองว่าเรื่อง" + H.m + "ต้องใช้ความใส่ใจมากกว่าปกติ"; },
  };
  function lek7Facts(L7, topic) {
    var s = L7.sum, mean = s.reduce(function (a, x) { return a + x; }, 0) / s.length, hiI = s.indexOf(Math.max.apply(null, s));
    var items = HOUSE.map(function (H, i) {
      var tone = L7_TONE(s[i], mean), m = {}; m[H.tag] = [L7_LINE[tone](H), L7_LINE2[tone](H)];
      if (tone === "caution") m.advice = ["ลองให้เวลากับเรื่อง" + H.m + "มากขึ้นทีละน้อย"];
      if (i === hiI) m.overview = ["เรื่อง" + H.m + "เป็นจุดที่มีพลังมากที่สุดในผังของคุณ"];
      return { id: "l7." + i + "." + tone, group: "ฐานรวม", label: "ภพ" + H.th + " ได้ " + s[i], short: "ภพ" + H.th, evidence: "ช่องที่ " + (i + 1) + " ของฐานรวม",
        strength: Math.max(0.3, Math.min(0.95, 0.5 + (s[i] - mean) / 20)), tone: tone, tags: Object.keys(m), meanings: m };
    });
    return { domain: "lek7", topic: topic || "overall", subject: {}, headline: "ฐานรวม " + s.join(" "), items: items, extras: {} };
  }

  /* ---------- กราฟชีวิต ----------
     เส้นพลัง 4 ด้าน (การงาน การเงิน ความรัก การดูแลตัวเอง) ต่ออายุ จากสามระบบ แต่ละจุดบอกว่าได้มาจากระบบใด
       ทักษา: ดาวมหาทักษาที่ครองช่วงอายุ (ธรรมชาติของดาว + ภูมิของดาวนั้นสำหรับคุณ)
       八字: วัยจร 10 ปี (สิบเทพของก้านวัยจร + ธาตุที่หนุนเจ้าชะตา)
       ตะวันตก: รอบดาวเสาร์คืนตำแหน่ง (ราว 29.5, 59, 88 ปี) และดวงอาทิตย์จรเปลี่ยนราศี
     "การดูแลตัวเอง" เป็นคำชวนดูแลสุขภาพกายใจ ไม่ใช่การทำนายโรค */
  var DOMS = ["work", "money", "love", "care"];
  var DOM_TH = { work: "การงาน", money: "การเงิน", love: "ความรัก", care: "การดูแลตัวเอง" };
  var PLANET_W = { 1: [10, 2, 0, 0], 2: [0, 4, 10, 4], 3: [8, 2, -2, -4], 4: [8, 6, 2, 0], 5: [8, 6, 4, 6], 6: [2, 8, 10, 4], 7: [-2, -4, -2, -6], 8: [4, 4, -4, -6] };
  var BHUMI_W = { boriwan: [2, 0, 4, 0], ayu: [0, 0, 0, 8], det: [8, 2, 0, 0], sri: [4, 8, 4, 2], mula: [2, 6, 2, 2], utsaha: [6, 2, 0, 0], montri: [6, 2, 4, 2], kalakini: [-8, -8, -6, -6] };
  var GOD_W = { peer: [2, -6, 2, 2], output: [6, 2, 6, 0], wealth: [2, 10, 2, -2], officer: [8, 2, 0, -4], resource: [4, 0, 0, 8] };
  function lifeCurves(B, T, W) {
    var pts = [];
    for (var a = 0; a <= 96; a++) {
      var M = LC.mahaAt(T, a), pw = PLANET_W[M.planet], bw = BHUMI_W[M.bhumi], L = LC.luckAt(B, a);
      var gw = L ? GOD_W[L.stemGod] : [0, 0, 0, 0], fav = L ? (L.fav - 0.8) * 3 : 0;
      var sat = LC.SATURN_RETURNS.some(function (x) { return Math.abs(a - x) <= 1.2; });
      var v = DOMS.map(function (d, i) { var x = 50 + pw[i] + bw[i] + gw[i] + fav + (sat ? (i === 0 ? -6 : i === 3 ? -6 : -2) : 0); return Math.max(8, Math.min(95, Math.round(x))); });
      pts.push({ age: a, v: v, maha: M, luck: L, saturn: sat });
    }
    // ทำให้เส้นนุ่มขึ้น (ค่าเฉลี่ยเคลื่อนที่ 3 ปี)
    var sm = pts.map(function (p, i) { return DOMS.map(function (d, k) { var s = 0, n = 0; for (var j = i - 1; j <= i + 1; j++) if (pts[j]) { s += pts[j].v[k]; n++; } return Math.round(s / n); }); });
    pts.forEach(function (p, i) { p.v = sm[i]; });
    // จุดเปลี่ยน: เปลี่ยนดาวมหาทักษา / เปลี่ยนวัยจร / รอบดาวเสาร์ / ดวงอาทิตย์จรย้ายราศี
    var turns = [];
    T.maha.forEach(function (m) { if (m.from > 0 && m.from <= 96) turns.push({ age: m.from, sys: "taksa", key: "maha." + m.planet + "." + m.bhumi, planet: m.planet, bhumi: m.bhumi }); });
    B.luck.pillars.forEach(function (l) { if (l.from <= 96) turns.push({ age: Math.round(l.from), sys: "bazi", key: "luck." + l.stemGod, god: l.stemGod, pillar: l.pillar.zh }); });
    LC.SATURN_RETURNS.forEach(function (x) { turns.push({ age: x, sys: "west", key: "saturn" }); });
    (W && W.changes || []).forEach(function (c) { if (c.age <= 96) turns.push({ age: c.age, sys: "west", key: "prog." + c.sign, sign: c.sign }); });
    turns.sort(function (a, b) { return a.age - b.age; });
    // จุดสูงสุดของแต่ละด้าน
    var peaks = DOMS.map(function (d, k) { var best = pts[0]; pts.forEach(function (p) { if (p.v[k] > best.v[k]) best = p; }); var low = pts[0]; pts.forEach(function (p) { if (p.v[k] < low.v[k]) low = p; }); return { dom: d, peak: best.age, peakV: best.v[k], low: low.age, lowV: low.v[k] }; });
    return { points: pts, turns: turns, peaks: peaks, doms: DOMS };
  }
  var BANDS = function (step) { var out = []; for (var a = 0; a < 96; a += step) out.push([a, a + step]); return out; };
  function bandSummary(C, from, to) {
    var ps = C.points.filter(function (p) { return p.age >= from && p.age < to; });
    var avg = DOMS.map(function (d, k) { return Math.round(ps.reduce(function (s, p) { return s + p.v[k]; }, 0) / ps.length); });
    var mid = ps[Math.floor(ps.length / 2)];
    return { from: from, to: to, avg: avg, maha: mid.maha, luck: mid.luck, saturn: ps.some(function (p) { return p.saturn; }) };
  }
  var TONE_OF = function (v) { return v >= 62 ? "favourable" : v <= 44 ? "caution" : "neutral"; };
  var DOM_LINE = {
    work: { favourable: "งานมีแรงส่งดี เหมาะกับการรับบทบาทใหม่หรือขยายผลงาน", neutral: "งานเดินตามจังหวะปกติ เหมาะกับการเก็บประสบการณ์", caution: "ตำราชี้ว่างานอาจต้องใช้แรงมากกว่าปกติ" },
    money: { favourable: "การเงินมีโอกาสงอกเงยจากการวางแผนที่ดี", neutral: "การเงินทรงตัว เหมาะกับการออมสม่ำเสมอ", caution: "ตำราชี้ว่าเรื่องเงินอาจตึงมืออยู่บ้าง" },
    love: { favourable: "ความสัมพันธ์อบอุ่นและเปิดใจได้ง่าย", neutral: "ความสัมพันธ์มั่นคงตามปกติ", caution: "ตำราชี้ว่าความสัมพันธ์อาจต้องการความเข้าใจมากขึ้น" },
    care: { favourable: "เป็นช่วงที่ดูแลตัวเองได้สม่ำเสมอและมีกำลังใจดี", neutral: "ควรรักษากิจวัตรดูแลตัวเองให้สม่ำเสมอ", caution: "ตำราชวนให้ใส่ใจการพักผ่อนและการดูแลใจเป็นพิเศษ" },
  };
  var DOM_ACT = { work: "ลองแบ่งงานเป็นขั้นเล็ก ๆ และขอความช่วยเหลือเมื่อจำเป็น", money: "ควรวางแผนใช้จ่ายให้รัดกุม และกันเงินสำรองไว้", love: "ลองคุยกันด้วยน้ำเสียงนุ่มนวล ฟังให้มากกว่าพูด", care: "ควรนอนให้พอ ขยับร่างกายเบา ๆ และไปตรวจสุขภาพตามนัดเป็นประจำ" };
  /** facts ของกราฟชีวิต: ช่วงอายุปัจจุบัน + ช่วงถัดไป + จุดเปลี่ยนที่ใกล้ที่สุด (ทุกข้อบอกระบบที่มา) */
  function lifeFacts(B, T, W, C, nowAge, topic) {
    var step = 6, cur = Math.floor(Math.max(0, nowAge) / step) * step, S = bandSummary(C, cur, cur + step), N = bandSummary(C, cur + step, cur + 2 * step);
    var items = [];
    DOMS.forEach(function (d, k) {
      var tone = TONE_OF(S.avg[k]), tag = d === "care" ? "advice" : d, m = {};
      m[tag] = [DOM_LINE[d][tone]];
      if (tone === "caution") m.advice = [DOM_ACT[d]];
      if (k === 0) m.overview = [DOM_LINE[d][tone]];
      items.push({ id: "lg.now." + d + "." + tone, group: "ช่วงอายุปัจจุบัน", label: DOM_TH[d] + "ช่วงอายุ " + cur + "–" + (cur + step), short: "ด้าน" + DOM_TH[d], evidence: "ระดับ " + S.avg[k] + "/100 จากทักษา 八字 และตะวันตก", strength: 0.9 - k * 0.04, tone: tone, tags: Object.keys(m), meanings: m });
    });
    var MP = PLANET[S.maha.planet];
    items.push({ id: "lg.maha." + S.maha.planet, group: "ระบบทักษา", label: "มหาทักษาดาว" + MP.th, short: "มหาทักษา", evidence: "มหาทักษา · อายุ " + S.maha.from + "–" + S.maha.to, strength: 0.8, tone: BHUMI_TH[S.maha.bhumi].tone, tags: ["timing"],
      meanings: { timing: ["ตามมหาทักษา ช่วงนี้อยู่ใต้ดาว" + MP.th + " ซึ่งเด่นเรื่อง" + MP.q] } });
    if (S.luck) { var G = GOD[S.luck.stemGod]; items.push({ id: "lg.luck." + S.luck.stemGod, group: "ระบบ 八字", label: "วัยจร " + S.luck.pillar.zh, short: "วัยจร", evidence: "八字 大运 · อายุ " + Math.round(S.luck.from) + "–" + Math.round(S.luck.to), strength: 0.78, tone: G.tone, tags: ["timing"], meanings: { timing: [G.t] } }); }
    var nx = C.turns.find(function (t) { return t.age > nowAge; });
    if (nx) items.push({ id: "lg.turn." + nx.sys, group: "จุดเปลี่ยนถัดไป", label: "จุดเปลี่ยนราวอายุ " + Math.round(nx.age) + " ปี", short: "จุดเปลี่ยนถัดไป", evidence: { taksa: "ทักษา", bazi: "八字", west: "ตะวันตก" }[nx.sys], strength: 0.72, tone: "neutral", tags: ["timing"],
      meanings: { timing: [TURN_LINE[nx.sys]] } });
    var nb = DOMS.map(function (d, k) { return N.avg[k] - S.avg[k]; }), up = nb.indexOf(Math.max.apply(null, nb));
    if (nb[up] > 3) items.push({ id: "lg.next." + DOMS[up], group: "ช่วงอายุถัดไป", label: DOM_TH[DOMS[up]] + "ช่วงอายุ " + (cur + step) + "–" + (cur + 2 * step), short: "ช่วงถัดไป", evidence: "ระดับ " + N.avg[up] + "/100 จากทักษา 八字 และตะวันตก", strength: 0.6, tone: "favourable", tags: ["timing"],
      meanings: { timing: ["ในช่วงอายุถัดไป ด้าน" + DOM_TH[DOMS[up]] + "มีแนวโน้มดีขึ้นกว่าช่วงนี้"] } });
    return { domain: "lifegraph", topic: topic || "overall", subject: {}, headline: "กราฟชีวิตช่วงอายุ " + cur + "–" + (cur + step) + " ปี", items: items, extras: {} };
  }
  var TURN_LINE = {
    taksa: "ตามทักษา จุดนี้คือการเปลี่ยนดาวมหาทักษา จังหวะชีวิตจะเปลี่ยนโทน ควรทบทวนเป้าหมายก่อนเข้าช่วงใหม่",
    bazi: "ตาม 八字 จุดนี้คือการเปลี่ยนวัยจร 10 ปี เรื่องที่เด่นในชีวิตจะเปลี่ยนไป ควรวางแผนรับช่วงใหม่ล่วงหน้า",
    west: "ตามโหราศาสตร์ตะวันตก จุดนี้เป็นช่วงจัดระเบียบชีวิตใหม่ เหมาะกับการทบทวนว่าอะไรสำคัญจริง",
  };

  /* item 177: engine items of the closed "สิ่งที่ควรระวัง" section on bazi.html, built BESIDE the reading (its facts never change):
     every baziFacts item + this year's 流年 relation; period = the current 大运 and this year (or this year before the first luck period) */
  var YEAR_CHONG = ["clash", "same", "harm", "punish", "break"];
  function baziCautions(B, age, now) {
    /** @type {any[]} */
    var items = baziFacts(B, "overall", { age: age }).items.slice();
    var yb = LC.bazi({ y: now.y, m: now.m, d: now.d, h: 12, mi: 0, tz: 7, noTime: false }).pillars.year.branch, rel = LC.yearRelation(B.pillars.year.branch, yb);
    if (rel !== "neutral") items.push(YEAR_CHONG.indexOf(rel) >= 0 ? { id: "year." + rel, polarity: "challenge", strength: 0.9 } : { id: "year." + rel, strength: 0.9 });
    var L = LC.luckAt(B, age), period;
    if (L) {
      var a = Math.round(L.from) + "–" + Math.round(L.to), zh = L.pillar.zh;
      period = { span: "decade", th: "วัยจร " + zh + " (อายุราว " + a + " ปี) และปีนี้", en: "Luck period " + zh + " (about age " + a + ") and this year", zh: "大运 " + zh + "（约 " + a + " 岁）与今年" };
    } else period = { span: "year", th: "ปีนี้", en: "This year", zh: "今年" };
    return { items: items, period: period };
  }

  /* ---------- depth layer (fortune-depth.js, owner order 2026-11-17 item 3): which deeper material of each tradition a reading
     gets, in reading order. Kept as facts.depth (derived facts: keys and the computed numbers the texts use, so every number in the reading has its
     evidence; the AI path's compactFacts never sends it); the texts are
     the depth tables (TH at the end of this file, EN / ZH in i18n/*-kb-lifecal.js). ---------- */
  var EKEY = ["wood", "fire", "earth", "metal", "water"];
  // English text names a pillar in pinyin (no Chinese script in English readings); กำลังดาว = the planet's major-period years
  var PY_S = ["Jia", "Yi", "Bing", "Ding", "Wu", "Ji", "Geng", "Xin", "Ren", "Gui"], PY_B = ["Zi", "Chou", "Yin", "Mao", "Chen", "Si", "Wu", "Wei", "Shen", "You", "Xu", "Hai"];
  var pyOf = function (p) { return PY_S[p.stem] + "-" + PY_B[p.branch]; };
  var POWER = { 1: 6, 2: 15, 3: 8, 4: 17, 5: 19, 6: 21, 7: 10, 8: 12 };
  // not enumerable: the reading's own facts (and their JSON) stay as they were (fortune-caution T15); the semantic lint reads
  // facts.depth explicitly for its number evidence (fortune-ai.js lintSemantic)
  function withDepth(F, list) { try { Object.defineProperty(F, "depth", { value: list.filter(Boolean), enumerable: false }); } catch (e) { /* frozen */ } return F; }
  function baziDepth(B, opts) {
    var dm = B.dayMaster.el, P = B.pillars, god = function (e) { return LC.tenGod(dm, e); }, out = [];
    out.push({ sec: "love", key: "spouse." + god(LC.BRANCH_EL[P.day.branch]), vars: { P: P.day.zh, PE: pyOf(P.day) } });
    out.push({ sec: "work", key: "pg.month." + god(LC.STEM_EL[P.month.stem]), vars: { P: P.month.zh, PE: pyOf(P.month) } });
    out.push({ sec: "social", key: "pg.year." + god(LC.STEM_EL[P.year.stem]), vars: { P: P.year.zh, PE: pyOf(P.year) } });
    if (P.hour) out.push({ sec: "timing", key: "pg.hour." + god(LC.STEM_EL[P.hour.stem]), vars: { P: P.hour.zh, PE: pyOf(P.hour) } });
    B.elementShare.forEach(function (v, e) { if (v < 8) out.push({ sec: "personality", key: "none." + EKEY[e] }); });
    var age = opts && opts.age != null ? opts.age : new Date().getFullYear() - B.input.y;
    var nx = (B.luck.pillars || []).filter(function (l) { return l.from > age; })[0];
    if (nx) out.push({ sec: "timing", key: "next." + nx.stemGod, vars: { A: Math.round(nx.from), P: nx.pillar.zh, PE: pyOf(nx.pillar), T: 10 } });
    return out;
  }
  function taksaDepth(T, opts) {
    var age = opts && opts.age != null ? opts.age : new Date().getFullYear() - (T.y || new Date().getFullYear());
    var nx = (T.maha || []).filter(function (m) { return m.from > Math.max(0, age); })[0];
    return [{ sec: "personality", key: "day." + T.birth.planet, vars: { K: POWER[T.birth.planet] } },
      nx && { sec: "timing", key: "maha.next." + nx.planet, vars: { A: nx.from, K: POWER[nx.planet] } }];
  }
  function lek7Depth(L7) {
    var s = L7.sum, hi = s.indexOf(Math.max.apply(null, s)), lo = s.indexOf(Math.min.apply(null, s)), out = [];
    [0, hi, lo, 6].filter(function (i, k, a) { return a.indexOf(i) === k; }).forEach(function (i) {
      var tag = HOUSE[i].tag;
      out.push({ sec: tag, key: "house." + i, vars: { N: s[i] } });
      out.push({ sec: tag, key: "planet." + L7.rows[0][i], vars: { H: "@hname." + i } });
    });
    return out;
  }
  function lifeDepth(C, nowAge) {
    var out = [];
    C.turns.filter(function (t) { return t.age > nowAge; }).slice(0, 3).forEach(function (t) {
      var k = t.sys === "taksa" ? "turn.taksa." + t.planet : t.sys === "bazi" ? "turn.bazi." + t.god : t.key === "saturn" ? "turn.saturn" : "turn.prog." + t.sign;
      out.push({ sec: "timing", key: k, vars: t.sys === "bazi" ? { A: Math.round(t.age), T: 10 } : { A: Math.round(t.age) } });
    });
    (C.peaks || []).forEach(function (p) { if (p.peak > nowAge) out.push({ sec: p.dom === "care" ? "advice" : p.dom, key: "peak." + p.dom, vars: { A: Math.round(p.peak) } }); });
    return out;
  }
  var baziFactsD = function (B, topic, opts) { return withDepth(baziFacts(B, topic, opts), baziDepth(B, opts)); };
  var taksaFactsD = function (T, topic, opts) { return withDepth(taksaFacts(T, topic, opts), taksaDepth(T, opts)); };
  var lek7FactsD = function (L7, topic) { return withDepth(lek7Facts(L7, topic), lek7Depth(L7)); };
  var lifeFactsD = function (B, T, W, C, nowAge, topic) { return withDepth(lifeFacts(B, T, W, C, nowAge, topic), lifeDepth(C, nowAge)); };
  var KB = { EL: EL, STEM: STEM, STRENGTH: STRENGTH, GOD: GOD, PLANET: PLANET, BHUMI_TH: BHUMI_TH, HOUSE: HOUSE, DOMS: DOMS, DOM_TH: DOM_TH, DOM_LINE: DOM_LINE, DOM_ACT: DOM_ACT, TURN_LINE: TURN_LINE,
    PLANET_W: PLANET_W, BHUMI_W: BHUMI_W, GOD_W: GOD_W, baziFacts: baziFactsD, taksaFacts: taksaFactsD, lek7Facts: lek7FactsD, lifeCurves: lifeCurves, lifeFacts: lifeFactsD,
    bandSummary: bandSummary, BANDS: BANDS, TONE_OF: TONE_OF };
  KB.baziCautions = baziCautions;
  if (typeof module !== "undefined" && module.exports) module.exports = KB;
  root.LIFECAL_KB = KB;
})(typeof window !== "undefined" ? window : globalThis);
/* BEGIN depth th.bazi (fortune-depth.js: material behind "อ่านเพิ่มเติม"; {t, c: true} = restraining, always shown) */
(/** @param {any} G */ function (G) {
  "use strict";
  var R = G.LQ_DEPTH = G.LQ_DEPTH || { build: {}, text: { th: {}, en: {}, zh: {} } };
  var T = {"_title":"อ่านลึกตามผังแปดอักษร",
    "pg.year.peer":"เสา {P} คือเสาปี ตำราใช้ดูรากเหง้า วงศ์ตระกูล วัยเด็กตอนต้น และสังคมวงกว้างที่คุณเติบโตมา ก้านปีเป็นกลุ่มเพื่อนร่วมธาตุ จึงอ่านว่าเด็กวัยนั้นมีพี่น้องหรือเพื่อนรุ่นเดียวกันรายล้อม ได้ฝึกแบ่งปันและพึ่งตัวเองมาแต่เล็ก",
    "pg.year.output":"เสา {P} คือเสาปี เสาของรากเหง้า บรรพบุรุษ และสิ่งแวดล้อมช่วงปฐมวัย ก้านปีเป็นกลุ่มผลงานและการแสดงออก ตำราจึงมองว่าบ้านหรือสังคมช่วงเด็กเปิดโอกาสให้พูด ลองทำ และสร้างสรรค์ จนความถนัดของคุณเริ่มเผยตั้งแต่ยังเยาว์",
    "pg.year.wealth":"เสา {P} คือเสาปี ใช้ดูต้นตระกูล ปีแรก ๆ ของชีวิต และโลกภายนอกที่กว้างกว่าบ้าน ก้านปีเป็นกลุ่มทรัพย์ ตำราอ่านว่ารากเหง้าคุ้นเคยกับการค้า การทำมาหากิน หรือการดูแลสมบัติ คุณจึงโตมากับมุมมองเชิงปฏิบัติเรื่องเงินทอง",
    "pg.year.officer":"เสา {P} คือเสาปี ว่าด้วยรากเหง้า วงศ์ตระกูล และสังคมที่ห่อหุ้มวัยเด็ก ก้านปีเป็นกลุ่มหน้าที่และระเบียบ ตำราจึงมองว่ารากเดิมของคุณมีเกียรติยศ กติกา หรือความคาดหวังจากผู้ใหญ่ ทำให้ซึมซับวินัยและสำนึกรับผิดชอบมาก่อนวัย",
    "pg.year.resource":"เสา {P} คือเสาปี ใช้ดูบรรพบุรุษ รากฐานวัยเด็ก และสังคมวงกว้าง ก้านปีเป็นกลุ่มความรู้และผู้อุปถัมภ์ ตำราอ่านว่าวัยเด็กมีผู้ใหญ่คอยเอื้อเฟื้อ มีโอกาสเรียนรู้ และมีร่มเงาของตระกูลคอยหนุน จึงเป็นต้นทุนด้านความรู้และใจที่ดี",
    "pg.month.peer":"เสา {P} คือเสาเดือน ที่ตำราให้น้ำหนักมาก แทนบิดามารดา การเลี้ยงดู สภาพแวดล้อมการงาน และธาตุที่คุมฤดูเกิด ก้านเดือนเป็นกลุ่มเพื่อนร่วมธาตุ จึงสื่อว่าวงการของคุณมีเพื่อนร่วมทางมาก งานเดินไปพร้อมการร่วมแรงและการแข่งขันอย่างเป็นมิตร",
    "pg.month.output":"เสา {P} คือเสาเดือน แทนบิดามารดา บรรยากาศการเลี้ยงดู สภาพแวดล้อมในอาชีพ และธาตุที่ครองฤดูเกิด ก้านเดือนเป็นกลุ่มฝีมือและการแสดงออก ตำราอ่านว่างานที่เหมาะคือแบบที่ได้ใช้ความคิด การพูด หรือฝีมือ และบ้านเดิมเปิดให้ลองทำ",
    "pg.month.wealth":"เสา {P} คือเสาเดือน ตำราใช้ดูพ่อแม่ การเติบโตในบ้าน แวดวงอาชีพ และธาตุที่ครองฤดูเกิด ก้านเดือนเป็นกลุ่มทรัพย์ จึงมองว่าอาชีพของคุณมักเกี่ยวกับการจัดการ การค้า หรือผลลัพธ์ที่จับต้องได้ และบ้านเดิมให้ค่ากับความมั่นคงเชิงปฏิบัติ",
    "pg.month.officer":"เสา {P} คือเสาเดือน เสาแห่งพ่อแม่ การอบรมเลี้ยงดู สนามอาชีพ และธาตุที่ครองฤดูเกิด ก้านเดือนเป็นกลุ่มหน้าที่ ตำราอ่านว่าคุณอยู่ในแวดวงที่มีลำดับขั้นและตำแหน่งชัดเจน งานจึงสร้างชื่อได้เมื่อรักษาวินัยและรับผิดชอบสม่ำเสมอ",
    "pg.month.resource":"เสา {P} คือเสาเดือน ตำราใช้ดูบิดามารดา การเลี้ยงดู สภาพแวดล้อมการงาน และธาตุที่ครองฤดูเกิด ก้านเดือนเป็นกลุ่มความรู้ จึงมองว่าอาชีพเหมาะกับงานสอน งานวิชาการ หรืองานที่มีผู้ใหญ่ชี้แนะ และบ้านเดิมให้ความสำคัญกับการเรียนและความอบอุ่น",
    "pg.hour.peer":"เสา {P} คือเสายาม ตำราใช้ดูบุตร ศิษย์หรือรุ่นน้อง ความคิดที่ยังไม่ออกดอก และช่วงปลายของชีวิต ก้านยามเป็นกลุ่มเพื่อนร่วมธาตุ จึงอ่านว่าช่วงหลังคุณมักอยู่ท่ามกลางเพื่อนและคนรุ่นเดียวกัน และความคิดเติบโตดีเมื่อได้ลงมือร่วมกับผู้อื่น",
    "pg.hour.output":"เสา {P} คือเสายาม เสาที่แทนลูก ลูกศิษย์ รุ่นน้อง ความคิดใหม่ ๆ และวัยปลายของชีวิต ก้านยามเป็นกลุ่มฝีมือและการแสดงออก ตำราจึงอ่านว่าคุณมีของจะส่งต่อ เช่น ความรู้ งานสร้างสรรค์ หรือเรื่องเล่า และช่วงหลังเป็นเวลาที่ได้ทำสิ่งที่รัก",
    "pg.hour.wealth":"เสา {P} คือเสายาม ใช้ดูบุตร ศิษย์ รุ่นน้อง ความคิดที่ค่อย ๆ สุก และปลายทางของชีวิต ก้านยามเป็นกลุ่มทรัพย์ ตำราจึงมองว่าแผนระยะยาวและสิ่งที่สะสมไว้จะออกผลในภายหลัง และคุณมักใส่ใจวางรากให้คนรุ่นหลัง",
    "pg.hour.officer":"เสา {P} คือเสายาม แทนลูก ศิษย์ รุ่นน้อง ไอเดีย และช่วงท้ายของชีวิต ก้านยามเป็นกลุ่มหน้าที่ ตำราอ่านว่าคุณรับบทผู้ดูแลหรือผู้นำให้คนรุ่นหลัง เป็นที่พึ่งด้านวินัยและทิศทาง ความคิดมีระเบียบ และช่วงปลายมีภารกิจที่ให้ความหมาย",
    "pg.hour.resource":"เสา {P} คือเสายาม เสาแห่งบุตร ศิษย์ รุ่นน้อง ความคิด และวัยปลาย ก้านยามเป็นกลุ่มความรู้และผู้อุปถัมภ์ ตำราจึงมองว่าช่วงหลังของชีวิตเป็นเวลาของการเรียน การทบทวน และความสงบใจ และคุณมักเป็นที่ปรึกษาที่รุ่นเล็กไว้ใจ",
    "spouse.peer":"กิ่งวันของเสา {P} คือวังคู่ครองในตำรา และธาตุหลักของกิ่งนี้เป็นกลุ่มเพื่อนร่วมธาตุ จึงอ่านว่าความสัมพันธ์ของคุณคล้ายมิตรภาพ ต่างฝ่ายมีพื้นที่ของตัวเอง ชอบแบ่งกันทำ ชีวิตในบ้านเป็นแบบหุ้นส่วนที่ตกลงหน้าที่กันให้ชัด",
    "spouse.output":"กิ่งวันของเสา {P} คือวังคู่ครอง และธาตุหลักของกิ่งนี้เป็นกลุ่มฝีมือและการแสดงออก ตำราอ่านว่าคุณแสดงความรักผ่านการพูดคุย การทำอาหาร ของฝาก หรือกิจกรรมสร้างสรรค์ และบ้านอบอุ่นด้วยเสียงหัวเราะและการลงมือทำร่วมกัน",
    "spouse.wealth":"กิ่งวันของเสา {P} คือวังคู่ครอง และธาตุหลักของกิ่งนี้เป็นกลุ่มทรัพย์ ตำราอ่านว่าคุณมองความสัมพันธ์อย่างเป็นรูปธรรม ดูแลกันด้วยการกระทำ ใส่ใจความมั่นคงของบ้านและแผนชีวิตร่วมกัน บ้านจึงเป็นระเบียบและเน้นความสบายที่จับต้องได้",
    "spouse.officer":"กิ่งวันของเสา {P} คือวังคู่ครอง ธาตุหลักของกิ่งนี้เป็นกลุ่มหน้าที่ ตำราอ่านว่าคุณให้ค่ากับความจริงจัง ความรับผิดชอบ และการเคารพข้อตกลงร่วมกัน ชีวิตในบ้านมีระเบียบและเป้าหมายชัด และเข้ากันดีกับคู่ที่คุยตรง ๆ และให้เกียรติกัน",
    "spouse.resource":"กิ่งวันของเสา {P} คือวังคู่ครอง ธาตุหลักของกิ่งนี้เป็นกลุ่มความรู้และผู้อุปถัมภ์ ตำราอ่านว่าคุณมองหาคู่ที่ดูแลใจกัน เรียนรู้ไปด้วยกัน และให้ความอบอุ่นแบบผู้ใหญ่ ชีวิตในบ้านเน้นความสงบ การพูดคุยที่ลึก และการเกื้อกูลกันทั้งสองทาง",
    "none.wood":{"t":"ผังของคุณมีธาตุไม้น้อยมาก ตำราอ่านว่าพลังของการเริ่มต้น การเติบโต และการวางแผนระยะไกลอาจต้องหาเพิ่มจากภายนอก ลองเติมด้วยสีเขียว เดินในที่ร่มรื่น ปลูกต้นไม้ หรือเรียนทักษะใหม่ทีละน้อย เป็นแนวทางตามความเชื่อ โปรดใช้วิจารณญาณ",
    "c":true},
    "none.fire":{"t":"ในผังของคุณแทบไม่มีธาตุไฟ ตำราจึงมองว่าความอบอุ่นในการแสดงออกและพลังทางสังคมอาจต้องเติม ลองใช้สีแดงหรือส้ม รับแสงแดดยามเช้า นัดพบเพื่อนที่ทำให้ใจสว่าง หรือเริ่มงานอดิเรกที่มีชีวิตชีวา เป็นแนวทางตามความเชื่อ โปรดใช้วิจารณญาณ",
    "c":true},
    "none.earth":{"t":"ผังของคุณมีธาตุดินน้อยมาก ตำราอ่านว่าความมั่นคงและความหนักแน่นอาจต้องสร้างเพิ่มอย่างตั้งใจ ลองเลือกสีเหลืองหรือน้ำตาล วางกิจวัตรให้คงที่ กินอาหารเป็นเวลา และอยู่ในที่ที่รู้สึกเหมือนบ้าน เป็นแนวทางตามความเชื่อ โปรดใช้วิจารณญาณ",
    "c":true},
    "none.metal":{"t":"ผังของคุณแทบไม่มีธาตุทอง ตำราจึงมองว่าความเด็ดขาดและการตั้งขอบเขตให้ตัวเองอาจต้องฝึกเพิ่ม ลองใช้สีขาวหรือเงิน จัดโต๊ะให้โล่ง ตั้งเวลาเริ่มและเลิกงาน แล้วตัดสินใจเรื่องเล็กให้เร็วขึ้น เป็นแนวทางตามความเชื่อ โปรดใช้วิจารณญาณ",
    "c":true},
    "none.water":{"t":"ผังของคุณมีธาตุน้ำน้อยมาก ตำราอ่านว่าความยืดหยุ่นและการหยุดพักให้ใจนิ่งอาจต้องเติมจากภายนอก ลองใช้สีน้ำเงินหรือดำ นั่งใกล้ริมน้ำ ฟังเสียงฝน และกันเวลาเงียบ ๆ ทุกวัน เป็นแนวทางตามความเชื่อ โปรดใช้วิจารณญาณ",
    "c":true},
    "next.peer":"เมื่ออายุ {A} ปี วัยจรสิบปีถัดไปคือเสา {P} ก้านเป็นกลุ่มเพื่อนร่วมธาตุ ตำราอ่านว่าทศวรรษนั้นเน้นเครือข่ายและการร่วมแรง เหมาะกับการตั้งทีมหรือหาพันธมิตร และควรตกลงเรื่องค่าใช้จ่ายร่วมกันตั้งแต่ต้นเพื่อให้ทุกอย่างราบรื่น",
    "next.output":"วัยจรถัดไปเริ่มเมื่ออายุ {A} ปีด้วยเสา {P} ซึ่งก้านเป็นกลุ่มฝีมือและการแสดงออก ตำราอ่านว่าสิบปีนั้นเป็นเวลาของการลงมือสร้างผลงาน เปิดเวที พูดและเขียนให้คนเห็น เหมาะกับการรวบรวมความถนัดแล้วปั้นเป็นสิ่งที่ส่งต่อได้",
    "next.wealth":"ตอนอายุ {A} ปี วัยจรสิบปีใหม่เข้าสู่เสา {P} ก้านเป็นกลุ่มทรัพย์ ตำราจึงมองว่าทศวรรษนั้นเน้นการหารายได้ การบริหารทรัพย์สิน และผลงานที่จับต้องได้ เหมาะกับการเรียนรู้ระบบการเงินและวางฐานให้มั่นคงทีละขั้น",
    "next.officer":"วัยจรถัดไปเริ่มที่อายุ {A} ปี คือเสา {P} ก้านเป็นกลุ่มหน้าที่ ตำราอ่านว่าทศวรรษนั้นนำบทบาท ตำแหน่ง และความรับผิดชอบที่ใหญ่ขึ้นมาให้ ควรเตรียมวินัย ความรู้ และเวลาพักไว้ล่วงหน้า แล้วจะรับบทใหม่ได้อย่างสง่างาม",
    "next.resource":
      "เมื่ออายุ {A} ปี จะเข้าสู่วัยจรสิบปีใหม่ที่เสา {P} ก้านเป็นกลุ่มความรู้และผู้อุปถัมภ์ ตำราอ่านว่าทศวรรษนั้นเหมาะกับการเรียน เก็บใบรับรอง ขอคำแนะนำจากผู้ใหญ่ และดูแลใจ ผู้มีประสบการณ์มักเข้ามาเปิดทางให้"
  };
  R.text.th.bazi = T;
})(typeof globalThis !== "undefined" ? globalThis : this);
/* END depth th.bazi */
/* BEGIN depth th.taksa (fortune-depth.js: material behind "อ่านเพิ่มเติม"; {t, c: true} = restraining, always shown) */
(/** @param {any} G */ function (G) {
  "use strict";
  var R = G.LQ_DEPTH = G.LQ_DEPTH || { build: {}, text: { th: {}, en: {}, zh: {} } };
  var T = {"_title":"อ่านลึกตามตำราทักษา",
    "day.1":"ผู้เกิดวันอาทิตย์ ตามตำราทักษามีพระอาทิตย์เป็นเจ้าเรือน กำลัง 6 สีแดง ภาพเทวดาคือสุริยเทพผู้นำแสงสว่าง คนวันนี้มักมีศักดิ์ศรี ชอบเป็นผู้นำ ใจกว้างและรักษาหน้า จุดแข็งคือความมั่นใจที่ชวนคนมาร่วมงานได้",
    "day.2":"ผู้เกิดวันจันทร์ มีพระจันทร์เป็นเจ้าเรือน กำลัง 15 สีเหลืองนวล ภาพเทวดาคือจันทรเทพผู้ให้แสงเย็น ตามตำราเป็นคนอ่อนโยน อ่อนไหวง่ายและช่างเอาใจ จุดแข็งคือเสน่ห์และการเข้าใจความรู้สึกของคนรอบตัว",
    "day.3":"ผู้เกิดวันอังคาร มีพระอังคารเป็นเจ้าเรือน กำลัง 8 สีชมพู ภาพเทวดาคือพระอังคารผู้กล้าหาญ ตำราว่าเป็นคนตรงไปตรงมา ใจร้อนและชอบลุยงาน จุดแข็งคือความกล้าตัดสินใจและแรงขยันที่ทำให้งานเดินต่อไปได้",
    "day.4":"ผู้เกิดวันพุธกลางวัน มีพระพุธเป็นเจ้าเรือน กำลัง 17 สีเขียว ภาพเทวดาคือพระพุธผู้ฉลาดเจรจา ตำราว่าเป็นคนช่างพูด ช่างคิดและปรับตัวไว จุดแข็งคือการสื่อสารและการค้าขายที่ทำให้การเจรจาราบรื่น",
    "day.5":"ผู้เกิดวันพฤหัสบดี มีพระพฤหัสบดีเป็นเจ้าเรือน กำลัง 19 สีส้ม ภาพเทวดาคือพระครูผู้สอนเหล่าเทพ ตำราว่าเป็นคนใฝ่รู้ สุภาพและมีหลักธรรม จุดแข็งคือปัญญากับความเมตตาที่ทำให้ผู้ใหญ่เอ็นดู",
    "day.6":"ผู้เกิดวันศุกร์ มีพระศุกร์เป็นเจ้าเรือน กำลัง 21 สีฟ้า ภาพเทวดาคือพระศุกร์ผู้รักศิลปะและความละเมียด ตำราว่าเป็นคนอ่อนหวาน รักความสบายและมีรสนิยม จุดแข็งคือเสน่ห์และงานสร้างสรรค์ที่ประณีต",
    "day.7":"ผู้เกิดวันเสาร์ มีพระเสาร์เป็นเจ้าเรือน กำลัง 10 สีม่วง ภาพเทวดาคือพระเสาร์ผู้ทรงสงบเงียบ ตำราว่าเป็นคนเงียบขรึม อดทนและรอบคอบ จุดแข็งคือความรับผิดชอบที่พางานระยะยาวให้สำเร็จด้วยความสม่ำเสมอ",
    "day.8":"ผู้เกิดวันพุธกลางคืนหรือราหู กำลัง 12 สีเทาและดำ ภาพเทวดาคือราหูผู้อมจันทร์ ตำราว่าเป็นคนคิดนอกกรอบ ทะเยอทะยานและเปลี่ยนแปลงเร็ว จุดแข็งคือความกล้าลองทางใหม่และมองเห็นช่องทางที่คนอื่นมองข้าม",
    "maha.next.1":"เมื่ออายุ {A} ปี จะเข้ามหาทักษาของพระอาทิตย์ ซึ่งยาว 6 ปี ตำราว่าเป็นช่วงที่ชื่อเสียง บทบาทผู้นำ และความสัมพันธ์กับผู้ใหญ่หรือหน่วยงานเด่นขึ้น เหมาะกับการเสนอตัวรับงานที่ต้องใช้ความเป็นหลักและการยอมรับ",
    "maha.next.2":"ถึงอายุ {A} ปี มหาทักษาเปลี่ยนมาเป็นพระจันทร์ ยาว 15 ปี ตำราว่าเป็นช่วงยาวที่อารมณ์ละเอียดขึ้น เสน่ห์และมิตรภาพเด่น เรื่องบ้านและคนใกล้ตัวมีน้ำหนัก เหมาะกับการสร้างความสัมพันธ์ที่อบอุ่นและงานที่ต้องใช้ใจบริการ",
    "maha.next.3":"เมื่อถึงอายุ {A} ปี พระอังคารเข้าครองมหาทักษา 8 ปี ตำราว่าเป็นช่วงที่แรงลงมือสูง กล้าเริ่ม กล้าแข่ง และงานที่ต้องลุยได้ผลดี จึงควรตั้งเป้าหมายให้ชัดและเผื่อเวลาพักให้ร่างกายกับใจ",
    "maha.next.4":"อายุ {A} ปีเป็นจุดที่มหาทักษาส่งต่อให้พระพุธ ยาว 17 ปี ตำราว่าเป็นช่วงยาวของการเรียนรู้ การเจรจา การเดินทางและการค้า ข่าวสารและคนรู้จักใหม่หลั่งไหลเข้ามา เหมาะกับการเพิ่มทักษะและขยายเครือข่าย",
    "maha.next.5":"ที่อายุ {A} ปี พระพฤหัสบดีขึ้นครองมหาทักษา 19 ปี ซึ่งเป็นช่วงยาวมากในตำรา เด่นเรื่องปัญญา ผู้ใหญ่อุปถัมภ์ ความน่าเชื่อถือ และโอกาสเรียนสูงหรือสอนผู้อื่น เหมาะกับการสร้างชื่อด้วยความรู้และคุณธรรม",
    "maha.next.6":"มหาทักษาของพระศุกร์เริ่มที่อายุ {A} ปี และยาวถึง 21 ปี ซึ่งยาวที่สุดในวงทักษา ตำราว่าเด่นเรื่องความรัก ศิลปะ ความสุขสบายและรายได้ที่มาจากเสน่ห์ เหมาะกับการสร้างบ้าน ครอบครัวและงานสร้างสรรค์",
    "maha.next.7":"เมื่ออายุ {A} ปี พระเสาร์เข้าครองมหาทักษา 10 ปี ตำราว่าเป็นช่วงของความอดทน งานหนักที่ค่อย ๆ สร้างฐาน และบทเรียนเรื่องวินัย ผลมักมาช้าแต่ยืนนาน เหมาะกับการวางระบบและดูแลตัวเองอย่างสม่ำเสมอ",
    "maha.next.8":
      "มหาทักษาของราหูมาถึงเมื่ออายุ {A} ปี ยาว 12 ปี ตำราว่าเป็นช่วงแห่งการเปลี่ยนแปลง ความทะเยอทะยานและเรื่องไม่คาดคิด อาจได้ลองสิ่งใหม่ ย้ายที่ หรือเปลี่ยนวงสังคม เหมาะกับการเปิดใจเรียนรู้และตั้งหลักให้ดีก่อนก้าวใหญ่"
  };
  R.text.th.taksa = T;
})(typeof globalThis !== "undefined" ? globalThis : this);
/* END depth th.taksa */
/* BEGIN depth th.lek7 (fortune-depth.js: material behind "อ่านเพิ่มเติม"; {t, c: true} = restraining, always shown) */
(/** @param {any} G */ function (G) {
  "use strict";
  var R = G.LQ_DEPTH = G.LQ_DEPTH || { build: {}, text: { th: {}, en: {}, zh: {} } };
  var T = {"_title":"อ่านลึกตามเลข 7 ตัว 3 ฐาน",
    "house.0":"ภพตนุในตำราคืออุปนิสัย พื้นฐานชะตา และวิธีที่คุณวางตัวกับโลก ยอดรวมของคอลัมน์นี้คือ {N} ผู้อ่านมักดูว่าสูงหรือต่ำ ถ้าสูงถือว่าตัวตนชัดและมีแรงนำ ถ้าต่ำแปลว่าความมั่นใจจะค่อย ๆ งอกจากการลงมือทำจริง",
    "house.1":"ภพกดุมภะในตำราครอบคลุมรายได้ การออม สมบัติติดตัว ไปจนถึงคำพูดที่ใช้หาเลี้ยงชีพ ยอดรวมคอลัมน์ของคุณคือ {N} ค่าสูงอ่านว่าทรัพยากรไหลเวียนดี ค่าต่ำชวนให้สร้างนิสัยออมและหารายได้ทีละเล็กทีละน้อย",
    "house.2":"ภพสหัชชะดูแลเพื่อนร่วมทาง พี่น้อง การเดินทางระยะสั้น ข่าวสาร และการติดต่อ ยอดรวมของคอลัมน์นี้คือ {N} ค่าสูงอ่านว่าวงสังคมคึกคักและสื่อสารคล่อง ค่าต่ำคือวงที่เงียบกว่า แต่เลือกกระชับให้ลึกขึ้นได้ตามใจ",
    "house.3":"ภพพันธุว่าด้วยญาติพี่น้อง ที่อยู่อาศัย ยานพาหนะ ฝ่ายมารดา และความรู้สึกว่ามีที่ให้กลับ คอลัมน์นี้รวมได้ {N} ค่าสูงบ่งถึงฐานที่มั่นคงและมีผู้หนุน ค่าต่ำชวนให้คุณปั้นบ้านให้เป็นที่ของตัวเองด้วยมือเอง",
    "house.4":"ภพปุตตะดูเรื่องบุตร ศิษย์ ความรัก ความบันเทิง และความคิดสร้างสรรค์ที่อยากทำให้เป็นจริง ยอดรวมของคอลัมน์คือ {N} ค่าสูงอ่านว่าอบอุ่นและมีไอเดียล้น ค่าต่ำคือด้านที่จะผลิบานเมื่อให้เวลาอย่างสม่ำเสมอ",
    "house.5":"ภพอริเกี่ยวกับคู่แข่ง งานที่ต้องฝ่าฟัน และงานบริการที่ต้องอดทน ยอดรวมคอลัมน์คือ {N} ผู้อ่านมองค่าสูงว่าทนแรงเสียดทานได้และถนัดงานหนัก ค่าต่ำคือช่วงสงบกว่า เลือกสนามแข่งได้อย่างรอบคอบ",
    "house.6":"ภพปัตนิดูคู่ครอง หุ้นส่วนธุรกิจ และคนที่คุณทำข้อตกลงด้วย ยอดรวมคอลัมน์ของคุณคือ {N} ค่าสูงบ่งว่าการร่วมมือเข้ากันง่ายและได้แรงหนุน ค่าต่ำชวนให้ใช้เวลาเลือกคนและตกลงเงื่อนไขร่วมงานหรือร่วมบ้านให้ชัด",
    "planet.1":"ดาวอาทิตย์นำคอลัมน์ของ{H} จึงให้ลักษณะที่ภาคภูมิ ชัดเจนและมีอำนาจ เรื่องในภพนี้มักมีศักดิ์ศรีกำกับ คุณอยากเป็นผู้กำหนดทิศทางเอง และคนรอบตัวมักมองหาแนวทางกับมาตรฐานที่ซื่อตรงจากคุณ",
    "planet.2":"เมื่อดาวจันทร์เป็นหัวแถวของ{H} น้ำเสียงจะอ่อนโยน เปลี่ยนแปลงง่ายและเอาใจใส่ เรื่องในภพนี้ขึ้นลงตามความรู้สึกและคนรอบตัว จึงเบ่งบานเมื่อคุณทะนุถนอมและรักษาจังหวะที่นุ่มนวลสม่ำเสมอ",
    "planet.3":"ดาวอังคารนำคอลัมน์ของ{H} เติมความกล้า ความเร็ว และแรงขยันเข้ามา เรื่องในภพนี้เคลื่อนเร็วและตอบแทนการลงมือ แต่ไปได้ดีเมื่อวางแผนก่อนและปล่อยแรงออกเป็นช่วง ๆ อย่างพอดี",
    "planet.4":"ดาวพุธเป็นหัวแถวของ{H} ซึ่งเป็นดาวแห่งการพูด การเรียน และการค้า เรื่องในภพนี้ขับเคลื่อนด้วยบทสนทนา ข้อมูล และไหวพริบ การถาม การจดบันทึก และการหาคนรู้จักคือทางที่ทำให้ดีขึ้น",
    "planet.5":"ดาวพฤหัสบดีอยู่หัวแถวของ{H} นำความเอื้อเฟื้อ มุมมองกว้างและคำแนะนำดี ๆ มา ภพนี้มักเติบโตผ่านการเรียนรู้และน้ำใจของผู้ใหญ่หรือครูอาจารย์ และการแบ่งปันสิ่งที่รู้ยิ่งช่วยให้กว้างขึ้น",
    "planet.6":"ดาวศุกร์นำคอลัมน์ของ{H} เพิ่มเสน่ห์ ความสุข และสายตาแบบศิลปิน เรื่องในภพนี้โน้มไปทางความกลมกลืนและความสบาย จะรุ่งเมื่อคุณใส่ใจ ให้ความสุภาพ และเผื่อเวลาให้ได้ชื่นชม",
    "planet.7":"ดาวเสาร์เป็นหัวแถวของ{H} ดาวแห่งความอดทน โครงสร้าง และผลที่มาช้า เรื่องในภพนี้ต้องการความสม่ำเสมอและความรับผิดชอบ และตอบแทนด้วยฐานที่มั่นคงยาวนานมากกว่าชัยชนะเร็ว ๆ",
    "hname.0":"ภพตนุ",
    "hname.1":"ภพกดุมภะ",
    "hname.2":"ภพสหัชชะ",
    "hname.3":"ภพพันธุ",
    "hname.4":"ภพปุตตะ",
    "hname.5":"ภพอริ",
    "hname.6":"ภพปัตนิ"};
  R.text.th.lek7 = T;
})(typeof globalThis !== "undefined" ? globalThis : this);
/* END depth th.lek7 */
/* BEGIN depth th.lifegraph (fortune-depth.js: material behind "อ่านเพิ่มเติม"; {t, c: true} = restraining, always shown) */
(/** @param {any} G */ function (G) {
  "use strict";
  var R = G.LQ_DEPTH = G.LQ_DEPTH || { build: {}, text: { th: {}, en: {}, zh: {} } };
  var T = {"_title":"อ่านลึกตามจุดเปลี่ยนของชีวิต",
    "turn.taksa.1":"ราวอายุ {A} ปี จังหวะชีวิตส่งต่อให้พระอาทิตย์ คุณอาจรู้สึกอยากยืนด้วยตัวเอง อยากรับผิดชอบเต็มตัวและได้รับการยอมรับ เป็นเวลาที่ดีในการพูดถึงเป้าหมายของตนให้ชัดเจน",
    "turn.taksa.2":"ที่ {A} ปี พระจันทร์รับไม้ต่อ บรรยากาศชีวิตนุ่มลงและเอนไปทางความรู้สึก ครอบครัว ที่อยู่ และมิตรภาพอาจมีความหมายมากขึ้น ลองใช้เวลากับคนที่ทำให้สบายใจและจัดบ้านให้เป็นที่พักใจ",
    "turn.taksa.3":"ถึงอายุ {A} ปี ดาวอังคารเป็นผู้นำจังหวะ หลายคนรู้สึกพลังพุ่งขึ้น อยากพิสูจน์ฝีมือและกลับไปทำโครงการที่ค้าง ลองระบายแรงด้วยการออกกำลังพอดี ๆ และวางแผนให้ชัดก่อนเร่ง",
    "turn.taksa.4":"ตอน {A} ปี พุธหยิบเส้นด้ายต่อ ชีวิตเต็มไปด้วยข่าวสาร การเรียน และการเจรจา คนรู้จักใหม่และโอกาสมักมาทางการพูดคุย จึงควรอัปเดตทักษะและเก็บสัญญากับบันทึกให้เป็นระเบียบ",
    "turn.taksa.5":"ราวอายุ {A} ปี พฤหัสบดีขึ้นเป็นดาวนำ โทนชีวิตกว้างและใจดีขึ้น ผู้ใหญ่ ครูอาจารย์ และโอกาสเติบโตเข้ามาง่ายกว่าเดิม ลองเปิดรับคำแนะนำและให้เวลากับการเรียนรู้",
    "turn.taksa.6":"เมื่อ {A} ปี ศุกร์ก้าวขึ้นนำ ความสบายใจ ความรัก ศิลปะ และรสนิยมส่วนตัวมีบทบาทมากขึ้นอยู่นาน เป็นเวลาดีที่จะบ่มเพาะความสัมพันธ์ที่ดีและทำสิ่งที่เติมใจ",
    "turn.taksa.7":"ที่อายุ {A} ปี เสาร์กำหนดจังหวะ ชีวิตขอให้สม่ำเสมอ ผลงานไม่เร่งแต่ยืนระยะ ช่วงนี้เหมาะกับการจัดระบบ ฝึกวินัย และปล่อยวางสิ่งที่ไม่จำเป็นอีกต่อไป",
    "turn.taksa.8":"ราว {A} ปี ราหูเปลี่ยนโทนชีวิต ความอยากรู้ ความอยากลองและการพบสิ่งแปลกใหม่มีมากขึ้น อาจย้ายที่หรือเปลี่ยนแนวทาง ลองตั้งหลักด้วยแผนสำรองและคนที่ไว้ใจได้",
    "turn.bazi.peer":"ราวอายุ {A} ปี วัยจรสิบปีของเสาเพื่อนร่วมธาตุเริ่มขึ้น ผู้คนรอบตัว ทั้งเพื่อนร่วมงาน พี่น้องและพันธมิตร มีบทบาทมากขึ้น ทศวรรษนี้ชวนให้ร่วมมือ แบ่งหน้าที่ชัด และรักษาพื้นที่ของตัวเองไว้",
    "turn.bazi.output":"ที่อายุ {A} ปี วัยจรสิบปีของกลุ่มฝีมือและการแสดงออกเปิดฉาก สิ่งที่คุณคิดและสร้างมีเวทีมากขึ้น งานสร้างสรรค์ การสอน และการพูดต่อหน้าผู้คนเด่นขึ้น ลองรวบรวมผลงานไว้เป็นแฟ้มที่จับต้องได้",
    "turn.bazi.wealth":"เมื่อ {A} ปี วัยจรสิบปีของกลุ่มทรัพย์ตามมา ความสนใจหันไปที่รายได้ การบริหารเงิน และผลลัพธ์ที่วัดได้ เป็นทศวรรษที่เอื้อต่อการสร้างนิสัยการเงินเป็นระเบียบและงานที่เห็นผลจริง",
    "turn.bazi.officer":"ตอน {A} ปี วัยจรสิบปีของกลุ่มหน้าที่เริ่มต้น บทบาท ตำแหน่ง และความคาดหวังจากภายนอกชัดขึ้น งานอาจใหญ่ขึ้นและต้องใช้วินัย ลองจัดลำดับความสำคัญและกันเวลาพักไว้ก่อน",
    "turn.bazi.resource":"ราวอายุ {A} ปี วัยจรสิบปีของกลุ่มความรู้และผู้อุปถัมภ์เปิดขึ้น ครู ผู้ใหญ่ และโอกาสเรียนรู้มีบทบาทนำ เป็นทศวรรษของการสะสมความรู้ ใบรับรอง และความสงบใจก่อนก้าวต่อไป",
    "turn.saturn":{"t":"ราวอายุ {A} ปี ตามโหราศาสตร์ตะวันตกเป็นรอบเสาร์คืนตำแหน่ง คือดาวเสาร์กลับจุดที่เคยอยู่ตอนคุณเกิด เป็นช่วงทบทวนโครงสร้างชีวิตและภาระผูกพัน ควรค่อย ๆ ปรับอย่างใจเย็น ไม่รีบเปลี่ยนครั้งใหญ่ เป็นมุมมองตามความเชื่อ โปรดใช้วิจารณญาณ",
    "c":true},
    "turn.prog.0":"ราวอายุ {A} ปี ดวงอาทิตย์จรก้าวเข้าราศีเมษ โทนชีวิตสามสิบปีต่อจากนี้ออกไปทางกล้าเริ่มและพึ่งตัวเอง คุณจะเป็นตัวของตัวเองชัดขึ้นและยินดีเป็นคนแรกที่เสนอความคิด",
    "turn.prog.1":"ดวงอาทิตย์จรเข้าราศีพฤษภเมื่ออายุ {A} ปี ช่วงสามสิบปีถัดไปมีโทนช้าลงและมั่นคงขึ้น ให้ค่ากับความสบาย ของที่จับต้องได้ และความสม่ำเสมอ คุณจะพอใจกับสิ่งที่ค่อย ๆ สร้างจนอยู่ตัว",
    "turn.prog.2":"เมื่อ {A} ปี อาทิตย์จรย้ายไปราศีมิถุน สามสิบปีต่อไปเปี่ยมด้วยความอยากรู้ การพูดคุย การเรียนและการติดต่อหลายทาง คุณปรับตัวเร็วขึ้นและสนใจเรื่องใหม่ได้หลากหลาย",
    "turn.prog.3":"อายุ {A} ปีเป็นจุดที่อาทิตย์จรเข้าราศีกรกฎ โทนของสามสิบปีถัดไปอ่อนโยนและให้ความสำคัญกับบ้าน ครอบครัวและความรู้สึกปลอดภัย คุณมีแนวโน้มทะนุถนอมคนใกล้ตัวและสร้างพื้นที่ที่เรียกว่าบ้านมากขึ้น",
    "turn.prog.4":"ที่ {A} ปี อาทิตย์จรก้าวเข้าราศีสิงห์ ช่วงสามสิบปีต่อมาเปล่งประกายและต้องการการแสดงออก ความภาคภูมิใจ ความเอื้อเฟื้อและงานที่ใส่หัวใจลงไปมีเวทีมากขึ้น",
    "turn.prog.5":"เมื่ออายุ {A} ปี อาทิตย์จรเข้าราศีกันย์ โทนใหม่ใส่ใจรายละเอียด ระเบียบ และการรับใช้ผู้อื่นอย่างเป็นประโยชน์ สามสิบปีถัดไปเหมาะกับการปรับปรุงนิสัยและฝีมือให้ประณีตขึ้น",
    "turn.prog.6":"ที่ {A} ปี อาทิตย์จรเข้าราศีตุล ชีวิตสามสิบปีต่อจากนี้เน้นสมดุล ความยุติธรรม และความสัมพันธ์ที่ลงตัว คุณจะสนใจการร่วมมือ การไกล่เกลี่ย และสุนทรียะมากกว่าเดิม",
    "turn.prog.7":"เมื่อ {A} ปี อาทิตย์จรเข้าราศีพิจิก โทนสามสิบปีถัดไปลึกและจริงจัง สนใจเบื้องหลังของเรื่องราว การเปลี่ยนแปลงภายใน และความผูกพันที่ลึกซึ้ง คุณมุ่งมั่นกับสิ่งที่เลือกอย่างเต็มกำลัง",
    "turn.prog.8":"ที่อายุ {A} ปี อาทิตย์จรเข้าราศีธนู สามสิบปีถัดไปมองไกลและโหยหาอิสระ การเดินทาง การเรียนรู้ปรัชญา และการแบ่งปันความรู้จะดึงดูดคุณ โทนชีวิตเปิดกว้างและมองโลกในแง่ดี",
    "turn.prog.9":"ดวงอาทิตย์จรเข้าราศีมกรเมื่อ {A} ปี โทนสามสิบปีต่อไปเป็นระเบียบ ทะเยอทะยานอย่างอดทน และให้ค่ากับความสำเร็จที่สร้างทีละขั้น คุณมองระยะยาวและรับบทผู้ใหญ่ที่ไว้ใจได้มากขึ้น",
    "turn.prog.10":"ที่ {A} ปี อาทิตย์จรเข้าราศีกุมภ์ สามสิบปีถัดไปเป็นโทนอิสระ คิดต่าง และใส่ใจส่วนรวม คุณสนใจแนวคิดใหม่ ชุมชน และการทำสิ่งที่ไม่ซ้ำใคร",
    "turn.prog.11":"เมื่ออายุ {A} ปี อาทิตย์จรก้าวเข้าราศีมีน โทนสามสิบปีต่อมานุ่มนวล เปี่ยมจินตนาการ และเห็นอกเห็นใจ งานศิลป์ จิตใจ และการช่วยเหลือผู้อื่นมีความหมายมากขึ้น",
    "peak.work":"เส้นกราฟชี้ว่าด้านการงานเด่นที่สุดราวอายุ {A} ปี ช่วงนั้นเหมาะกับการรับบทบาทใหม่ เสนอโครงการที่ฝันไว้ และสร้างผลงานให้คนเห็น ควรเตรียมทักษะและบันทึกผลงานไว้ล่วงหน้า",
    "peak.money":"กราฟแสดงว่าการเงินเด่นราวอายุ {A} ปี ควรใช้ช่วงนั้นสร้างระบบ เช่น กันเงินสำรอง ปรับรายรับรายจ่าย เรียนรู้เรื่องเงิน และเลือกสิ่งที่ยั่งยืน โดยไม่ต้องรีบตัดสินใจ",
    "peak.love":"กราฟชี้ว่าด้านความรักและความสัมพันธ์เด่นราวอายุ {A} ปี ช่วงนั้นเปิดใจง่าย ลองใช้เวลากับคนที่รัก ขอบคุณและรับฟังให้มากขึ้น รวมถึงทำความรู้จักคนใหม่ในวงที่ชอบ",
    "peak.care":"กราฟแสดงว่าการดูแลตัวเองเด่นราวอายุ {A} ปี เป็นช่วงที่จัดนิสัยดี ๆ ได้ง่าย เช่น นอนเป็นเวลา เดินเล่น กินอาหารที่สบายใจ และกันเวลาพักผ่อนไว้ให้เป็นกิจวัตร"};
  R.text.th.lifegraph = T;
})(typeof globalThis !== "undefined" ? globalThis : this);
/* END depth th.lifegraph */
