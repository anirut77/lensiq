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

  var KB = { EL: EL, STEM: STEM, STRENGTH: STRENGTH, GOD: GOD, PLANET: PLANET, BHUMI_TH: BHUMI_TH, HOUSE: HOUSE, DOMS: DOMS, DOM_TH: DOM_TH, DOM_LINE: DOM_LINE, DOM_ACT: DOM_ACT, TURN_LINE: TURN_LINE,
    PLANET_W: PLANET_W, BHUMI_W: BHUMI_W, GOD_W: GOD_W, baziFacts: baziFacts, taksaFacts: taksaFacts, lek7Facts: lek7Facts, lifeCurves: lifeCurves, lifeFacts: lifeFacts, bandSummary: bandSummary, BANDS: BANDS, TONE_OF: TONE_OF };
  if (typeof module !== "undefined" && module.exports) module.exports = KB;
  root.LIFECAL_KB = KB;
})(typeof window !== "undefined" ? window : globalThis);
