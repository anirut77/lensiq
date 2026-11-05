/* fortune-ai.js — ชั้นแปลผลดวงกลางของ LENSIQ (ใช้ร่วมกันทุกศาสตร์)
 *
 * ทำงาน 2 ชั้น:
 *  1) ตัวเรียบเรียงในเครื่อง (local composer) — ใช้ได้ทันที ไม่มีค่าใช้จ่าย ไม่ส่งข้อมูลออก
 *     วางโครงคำทำนาย (ภาพรวม → หัวข้อที่ผู้ใช้สนใจ → หัวข้ออื่น) สุ่มสำนวน/ลำดับ/คำเชื่อม
 *     ผสานจุดเด่นที่เสริมกัน กรองคำต้องห้าม และตัดประโยคที่ซ้ำ ทำให้คำอ่านแต่ละรอบไม่ซ้ำกัน
 *  2) Claude AI (ผ่านเซิร์ฟเวอร์ /api/fortune) — เปิดเมื่อเซิร์ฟเวอร์ตั้ง ANTHROPIC_API_KEY
 *     และผู้ใช้กดยินยอม ส่งเฉพาะ "ผลที่วัด/คำนวณได้" (facts) ไม่ส่งรูป ชื่อจริง หรือวันเกิด
 *     ถ้า AI ล้มเหลว/ไม่พร้อม จะตกกลับมาใช้ตัวเรียบเรียงในเครื่องเสมอ
 *
 * ---------------- สัญญาข้อมูล (ทุกหน้าใช้รูปแบบนี้) ----------------
 * facts = {
 *   domain: "face" | "palm" | "horoscope" | "tarot" | "siamsee" | "fengshui" | "numbers",
 *   topic:  "overall" | "love" | "work" | "money",          // หัวข้อที่ผู้ใช้สนใจ
 *   subject: { nickname?: string, ageBand?: string },       // ไม่ใส่ข้อมูลระบุตัวตน
 *   headline?: string,                                      // ใจความหลัก เช่น "ธาตุดิน 61%"
 *   items: [{
 *     id: string,            // รหัสคงที่ เช่น "brow.crescent"
 *     group: string,         // กลุ่มที่แสดง เช่น "คิ้ว", "เส้นหัวใจ", "เสาวัน"
 *     label: string,         // ชื่อสิ่งที่พบ เช่น "คิ้วพระจันทร์เสี้ยว"
 *     evidence?: string,     // ค่าที่วัดได้/ที่มา เช่น "ความยาวคิ้ว 1.18 เท่าของตา"
 *     strength?: number,     // 0..1 ความเด่น (ใช้เรียงลำดับ)
 *     polarity?: "challenge",// (ไม่บังคับ) จุดที่ควรระวัง/ยังไม่เด่น — จะเรียบเรียงแบบ "แม้…แต่…"
 *     tags: string[],        // หมวดที่เกี่ยว: "personality","work","money","love","social","advice","luck","timing"
 *     meanings: { [tag]: string[] }   // ความหมายหลายสำนวนต่อหมวด (ตัวเรียบเรียงจะสุ่มเลือก)
 *   }],
 *   extras?: { luckyColors?: string[], luckyNumbers?: string[], directions?: string[], tips?: string[] }
 * }
 *
 * ผลลัพธ์ interpret(): { source: "ai" | "local", sections: [{ id, title, paragraphs: string[] }], note?: string,
 *                        seed?: number (local), model?: string (ai) }
 *   section id มาตรฐาน: "overview","personality","work","money","love","social","advice","timing"
 *
 * API:
 *   FortuneAI.interpret(facts, { useAI?, seed?, tone?, timeoutMs? })  -> Promise<result>
 *        useAI ไม่ระบุ = ใช้ AI เมื่อผู้ใช้เคยติ๊กยินยอม (localStorage "fa-consent")
 *   FortuneAI.compose(facts, { seed? })        -> result (ซิงก์ ในเครื่องล้วน)
 *   FortuneAI.regenerate(facts, opts)          -> Promise<result> (สำนวนใหม่ = seed ใหม่) ใช้กับปุ่ม "อ่านอีกสำนวน"
 *   FortuneAI.status()                         -> Promise<{enabled, model?}>
 *   FortuneAI.renderSections(el, result, { aiBadge?: boolean|string, showNote?: boolean })
 *   FortuneAI.toHTML(result, opts)             -> string (escape แล้ว)
 *   FortuneAI.consentControl(el, { onChange }) -> Promise<HTMLElement|null> แสดงเฉพาะเมื่อ AI เปิดใช้งาน
 *   FortuneAI.hasConsent() / setConsent(bool)
 *   FortuneAI.safety.isSafe(text) / filterText(text)
 *
 * ตั้งค่าเซิร์ฟเวอร์ภายนอก: window.LENSIQ_API_BASE (ดู lensiq-config.js / AI-SETUP.md) — อ่านทุกครั้งที่เรียก จึงโหลดก่อนหรือหลังไฟล์นี้ก็ได้
 */
(function (root) {
  "use strict";

  const apiBase = () => String(root.LENSIQ_API_BASE || "").replace(/\/+$/, "");
  const SECTION_TITLES = {
    overview: "ภาพรวม", personality: "บุคลิกและตัวตน", work: "การงานและการเรียน",
    money: "การเงินและโชคลาภ", love: "ความรักและความสัมพันธ์", social: "มิตรภาพและผู้คนรอบตัว",
    timing: "จังหวะเวลา", advice: "คำแนะนำและเคล็ดเสริมดวง",
  };
  const SECTION_IDS = ["overview", "personality", "work", "money", "love", "social", "timing", "advice"];
  const DOMAINS = ["face", "palm", "horoscope", "tarot", "siamsee", "fengshui", "numbers"];
  const TOPICS = ["overall", "love", "work", "money"];
  const DOMAIN_NAMES = {
    face: "ตำราโหงวเฮ้ง", palm: "ตำราลายมือ", horoscope: "ตำราโหราศาสตร์", tarot: "ไพ่ทาโรต์",
    siamsee: "คำเซียมซี", fengshui: "ตำราฮวงจุ้ย", numbers: "ศาสตร์แห่งตัวเลข",
  };
  // คำเรียกหมวดในประโยค (ใช้ทั้งประโยคผสานและประโยคปิดท้าย)
  const TAG_WORDS = {
    overview: "ชีวิต", personality: "ตัวตนและความคิด", work: "การงาน", money: "การเงิน", love: "ความรัก",
    social: "มิตรภาพ", luck: "โชคลาภ", timing: "จังหวะชีวิต", advice: "การดูแลตัวเอง",
  };
  const CLOSER_TOPIC = {
    overview: "ชีวิต", personality: "การเติบโตของตัวเอง", work: "การงาน", money: "การเงิน", love: "ความรัก",
    social: "มิตรภาพ", timing: "จังหวะชีวิต", advice: "ชีวิต",
  };
  // หมวดความหมายที่ป้อนให้แต่ละหัวข้อ
  const SECTION_KEYS = {
    personality: ["personality"], work: ["work"], money: ["money", "luck"], love: ["love"],
    social: ["social"], timing: ["timing"], advice: ["advice"],
  };

  /* ---------- สุ่มแบบปลอดภัย (seed ได้ เพื่อทดสอบ) ---------- */
  function randomSeed() {
    const c = root.crypto || (typeof require === "function" ? require("crypto").webcrypto : null);
    const a = new Uint32Array(1); c.getRandomValues(a); return a[0];
  }
  function rng(seed) {
    if (seed == null) seed = randomSeed();
    let s = seed >>> 0;
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function shuffle(r, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // สำรับไพ่: หยิบโดยไม่ซ้ำจนกว่าจะหมดสำรับ และไม่ให้ตัวเดียวกันออกติดกันตอนสับใหม่
  function deck(r, arr) {
    let pool = [], last = null;
    return () => {
      if (!pool.length) {
        pool = shuffle(r, arr);
        if (pool.length > 1 && pool[pool.length - 1] === last) { const t = pool[0]; pool[0] = pool[pool.length - 1]; pool[pool.length - 1] = t; }
      }
      last = pool.pop(); return last;
    };
  }
  const fill = (t, v) => t.replace(/\{(\w+)\}/g, (m, k) => (v[k] == null ? "" : typeof v[k] === "function" ? v[k]() : v[k]));

  /* ======================= คลังสำนวน ======================= */
  // {N} = คุณ / คุณ{ชื่อเล่น}, {D} = ชื่อศาสตร์
  const OPENERS = [
    "เมื่อมองภาพรวมตาม{D} {N}มีจุดเด่นหลายอย่างที่ส่งเสริมกันอย่างน่าสนใจ",
    "ดวงครั้งนี้ของ{N}ฉายภาพของคนที่มีของดีซ่อนอยู่มากกว่าที่ตัวเองคิด",
    "อ่านจากสิ่งที่ปรากฏทั้งหมด {N}มีพื้นดวงที่อบอุ่นและมีทิศทางชัดเจน",
    "สิ่งแรกที่สะดุดตาในดวงของ{N}คือความสมดุลระหว่างความคิดกับความรู้สึก",
    "หากเปรียบดวงเป็นแผนที่ {N}ถือแผนที่ที่มีเส้นทางดี ๆ ให้เลือกเดินหลายสาย",
    "ตาม{D} ภาพที่ออกมาครั้งนี้ค่อนข้างเป็นบวกและมีกำลังใจแฝงอยู่ไม่น้อย",
    "เมื่อนำทุกองค์ประกอบมาวางเรียงกัน จะเห็นว่า{N}มีเอกลักษณ์ที่ไม่เหมือนใคร",
    "ดวงของ{N}ในครั้งนี้เล่าเรื่องของคนที่ค่อย ๆ เติบโตอย่างมั่นคง",
    "ภาพรวมที่ได้จาก{D}บอกว่า{N}มีต้นทุนชีวิตที่ดีและรู้จักใช้มันอย่างชาญฉลาด",
    "ถ้าจะสรุปดวงครั้งนี้ในประโยคเดียว คงต้องบอกว่า{N}เป็นคนที่มีแสงสว่างในตัวเอง",
    "หมอดูหลายสำนักคงยิ้มเมื่อเห็นดวงแบบนี้ เพราะมีจุดแข็งให้หยิบมาใช้ได้มากมาย",
    "ก่อนจะไล่ดูกันทีละเรื่อง ขอเล่าภาพรวมของ{N}ให้ฟังก่อน",
    "ดวงที่ปรากฏตรงหน้าบอกถึงคนที่มีทั้งความอ่อนโยนและความหนักแน่นอยู่ในคนเดียวกัน",
    "ตามความเชื่อแบบ{D} {N}มีพลังบวกบางอย่างที่คนรอบตัวสัมผัสได้",
    "สิ่งที่เห็นได้ชัดจากดวงครั้งนี้คือ{N}มีศักยภาพที่ยังเติบโตได้อีกไกล",
    "อ่านดวงของ{N}แล้วรู้สึกได้ถึงพลังที่มั่นคงแต่ไม่แข็งกระด้าง",
    "ภาพรวมของ{N}ครั้งนี้เหมือนฟ้าหลังฝน คือสดใสและพร้อมสำหรับการเริ่มต้นใหม่",
    "หากฟังตาม{D}อย่างเปิดใจ จะพบว่าดวงของ{N}มีเรื่องน่ายินดีอยู่หลายเรื่อง",
    "จุดตั้งต้นของคำทำนายครั้งนี้คือความเป็นตัวของตัวเองที่ชัดเจนของ{N}",
    "ดวงของ{N}มีลักษณะเด่นที่ร้อยเรียงกันเป็นเรื่องเดียวได้อย่างลงตัว",
    "เมื่อดูองค์ประกอบทั้งหมดอย่างละเอียด ภาพที่ได้คือคนที่มีทั้งความฝันและความพากเพียร",
    "ขอเริ่มจากภาพกว้างก่อน ดวงของ{N}โดยรวมถือว่ามีพื้นฐานที่ดีทีเดียว",
    "ตามตำราแล้ว ดวงแบบที่{N}ได้ในครั้งนี้มักเป็นของคนที่มีน้ำใจและมีหลักในใจ",
    "ในมุมมองของ{D} {N}เป็นคนที่มีพลังหลายด้านคอยหนุนกันอยู่เงียบ ๆ",
    "ภาพที่ปรากฏบอกถึงช่วงชีวิตที่{N}กำลังได้ใช้ศักยภาพของตัวเองมากขึ้น",
    "ดวงครั้งนี้ไม่ได้เด่นเพียงจุดเดียว แต่มีหลายจุดที่ช่วยกันเสริมให้{N}ไปได้ไกล",
    "เมื่อชั่งน้ำหนักทุกสัญญาณแล้ว ดวงของ{N}เอียงไปทางบวกอย่างชัดเจน",
    "สิ่งที่น่ารักในดวงของ{N}คือความจริงใจที่สะท้อนออกมาจากหลายองค์ประกอบ",
    "ถ้าดวงเป็นบทเพลง ดวงของ{N}ครั้งนี้คือเพลงที่มีจังหวะมั่นคงและท่วงทำนองอบอุ่น",
    "หลังจากอ่านทุกรายละเอียดแล้ว ขอบอกว่า{N}มีพื้นดวงที่น่าภูมิใจ",
    "ตาม{D} ดวงของ{N}ในรอบนี้ชี้ไปที่การเติบโตทั้งด้านในและด้านนอก",
    "คำทำนายครั้งนี้ขอเริ่มด้วยข่าวดี คือ{N}มีจุดแข็งที่พร้อมใช้งานอยู่แล้วหลายข้อ",
    "เปิดดวงครั้งนี้แล้วเห็นภาพของคนที่ใจกว้าง มองโลกตามจริง และพร้อมเรียนรู้",
  ];
  const CONNECTORS = [
    "นอกจากนี้", "อีกด้านหนึ่ง", "ที่น่าสนใจคือ", "ยิ่งไปกว่านั้น", "ในขณะเดียวกัน", "ไม่เพียงเท่านั้น",
    "ที่สำคัญ", "อีกเรื่องที่น่าพูดถึงคือ", "ควบคู่กันไป", "ถัดมา", "ในอีกมุมหนึ่ง", "เมื่อมองลึกลงไป",
    "ที่น่ายินดีคือ", "และที่ขาดไม่ได้คือ", "อีกจุดที่ช่วยเสริมคือ", "พร้อมกันนั้น", "นอกเหนือจากนั้น",
    "เมื่อพิจารณาต่อ", "อีกทั้ง", "ข้อดีอีกประการคือ", "ในทำนองเดียวกัน", "หากมองให้กว้างขึ้น",
    "ที่น่าสังเกตคือ", "เพิ่มเติมจากนั้น", "ต่อเนื่องจากเรื่องนี้", "อีกมุมที่น่าสนใจคือ",
    "เมื่อมองควบคู่กัน", "อีกประเด็นหนึ่งคือ", "ในรายละเอียดลงไปอีก", "ขณะเดียวกันนั้น",
    "สิ่งที่ตามมาคือ", "แถมยังพบว่า",
  ];
  // คำปิดท้ายหัวข้อ/คำให้กำลังใจ {T} = หัวข้อ
  const CLOSERS = [
    "หากค่อย ๆ ใช้จุดแข็งเหล่านี้อย่างมีสติ เรื่อง{T}จะยิ่งราบรื่นขึ้นเป็นลำดับ",
    "ขอให้เชื่อมั่นในจังหวะของตัวเอง แล้วเรื่อง{T}จะค่อย ๆ เบ่งบานตามเวลา",
    "สิ่งเหล่านี้เป็นเพียงแนวโน้ม ส่วนผลลัพธ์จริงขึ้นอยู่กับการลงมือของ{N}เอง",
    "ลองเลือกสักหนึ่งข้อจากที่กล่าวมาไปทดลองใช้ในสัปดาห์นี้ดู",
    "ดวงดีเป็นเหมือนลมส่ง แต่คนที่ถือหางเสือคือ{N}เสมอ",
    "เก็บคำทำนายนี้ไว้เป็นกำลังใจ และใช้ปัญญาของตัวเองเป็นเข็มทิศหลัก",
    "ถ้าหมั่นดูแลจุดเด่นนี้ไว้ เรื่อง{T}จะเป็นอีกด้านที่ทำให้{N}ภูมิใจ",
    "ความสม่ำเสมอเล็ก ๆ ในแต่ละวันคือเคล็ดลับที่ทำให้เรื่อง{T}ออกดอกออกผล",
    "จำไว้ว่าทุกจุดแข็งงดงามที่สุดเมื่อใช้ด้วยความอ่อนโยน",
    "ช่วงนี้เหมาะกับการตั้งเป้าเล็ก ๆ ที่ทำได้จริง แล้วค่อยขยับไปทีละก้าว",
    "ขอให้{N}ยิ้มรับโอกาสที่เข้ามา เพราะดวงเปิดทางไว้ให้แล้ว",
    "ทั้งหมดนี้คือเสียงกระซิบจากตำรา ส่วนเรื่องราวจริงเป็นของ{N}ที่จะเขียนต่อ",
    "อย่าลืมให้รางวัลตัวเองบ้างเมื่อทำสิ่งดี ๆ สำเร็จ แม้จะเป็นเรื่องเล็กก็ตาม",
    "การฟังเสียงหัวใจควบคู่กับเหตุผลจะช่วยให้เรื่อง{T}ลงตัวยิ่งขึ้น",
    "พลังดี ๆ จะทวีขึ้นเมื่อแบ่งปันให้คนรอบข้างด้วย",
    "เรื่อง{T}ในช่วงนี้เหมือนต้นกล้าที่ต้องการน้ำและแสงแดดในปริมาณที่พอดี",
    "เชื่อมั่นในสิ่งที่ตัวเองถนัด แล้วปล่อยให้เวลาช่วยทำงานบ้าง",
    "ลองจดสิ่งที่อยากเห็นในเรื่อง{T}ไว้สักสามข้อ แล้วกลับมาทบทวนเป็นระยะ",
    "ไม่ต้องรีบร้อน เพราะจังหวะที่ใช่มักมาถึงเมื่อเราพร้อม",
    "การดูแลใจให้แจ่มใสเป็นเคล็ดเสริมดวงที่ง่ายและได้ผลที่สุด",
    "ถ้ามีวันที่รู้สึกเหนื่อย ให้กลับมาอ่านจุดเด่นของตัวเองตรงนี้อีกครั้ง",
    "สิ่งดีที่สุดที่ทำได้คือการเป็นตัวเองในแบบที่ใจดีกับตัวเองมากขึ้น",
    "เปิดใจเรียนรู้จากทุกประสบการณ์ แล้วเรื่อง{T}จะพัฒนาไปในทางที่ดี",
    "ความตั้งใจจริงของ{N}คือเครื่องรางที่ดีที่สุดในเรื่อง{T}",
    "เมื่อเจอทางแยก ให้เลือกทางที่ทำให้ใจสงบ แล้วสิ่งดี ๆ จะตามมา",
    "หมั่นขอบคุณสิ่งเล็ก ๆ รอบตัว แล้วจะเห็นว่าโชคดีอยู่ใกล้กว่าที่คิด",
    "ใช้คำทำนายนี้เป็นแรงบันดาลใจ ไม่ใช่กรอบที่ต้องเดินตาม",
    "การวางแผนอย่างพอดีและลงมืออย่างสม่ำเสมอจะทำให้เรื่อง{T}ส่องประกาย",
    "ขอให้{N}มีความสุขกับการเดินทางมากพอ ๆ กับจุดหมาย",
    "รักษาความจริงใจแบบนี้ไว้ แล้วผู้คนและโอกาสดี ๆ จะเข้ามาหาเอง",
    "เมื่อใจพร้อมและจังหวะเหมาะ เรื่อง{T}จะเดินหน้าได้อย่างงดงาม",
    "ทุกคำทำนายเป็นเพียงมุมมองหนึ่ง เลือกเก็บไว้เฉพาะส่วนที่ทำให้{N}มีกำลังใจก็พอ",
  ];
  // กรอบสำหรับคำแนะนำ/เคล็ดเสริมดวง {M} = เนื้อความ
  const ADVICE_FRAMES = [
    "เคล็ดเล็ก ๆ ที่อยากฝากไว้คือ{M}", "สิ่งที่ช่วยเสริมดวงได้ดีในช่วงนี้คือ{M}", "ถ้าอยากเติมพลังบวก ลอง{M}",
    "ตำราแนะนำว่า{M}", "คำแนะนำที่เข้ากับดวงนี้คือ{M}", "เคล็ดเสริมดวงแบบเบา ๆ คือ{M}",
    "อีกเคล็ดที่ทำได้ทันทีคือ{M}", "สิ่งเล็ก ๆ ที่ให้ผลดีเกินคาดคือ{M}", "ผู้รู้ด้านนี้มักแนะนำว่า{M}",
    "หากมีเวลา ลอง{M}", "{M} จะช่วยให้พลังดี ๆ ไหลเวียนได้สะดวกขึ้น", "เคล็ดลับที่หลายคนใช้แล้วได้ผลคือ{M}",
  ];
  const INTROS = {
    personality: [
      "มาดูที่ตัวตนของ{N}กันก่อน", "ในด้านบุคลิกภาพ ดวงของ{N}มีรายละเอียดที่น่าสนใจไม่น้อย",
      "ถ้าพูดถึงความเป็นตัวตน {N}มีเสน่ห์เฉพาะตัวที่ชัดเจน", "เมื่อมองเข้าไปในนิสัยใจคอ จะเห็นภาพของคนที่มีทั้งหลักการและหัวใจ",
      "บุคลิกของ{N}ตาม{D}สะท้อนออกมาได้หลายแง่มุม", "เรื่องตัวตนเป็นรากฐานของทุกเรื่อง จึงขอเล่าให้ละเอียดสักหน่อย",
      "ตัวตนของ{N}ประกอบขึ้นจากจุดเด่นหลายอย่างที่เข้ากันได้ดี", "ลองมาทำความรู้จักตัวเองผ่านมุมมองของ{D}กัน",
      "ในเรื่องนิสัยและวิธีคิด ดวงบอกอะไรเกี่ยวกับ{N}ไว้หลายอย่าง",
    ],
    work: [
      "เรื่องการงานและการเรียนของ{N}มีสัญญาณที่น่าติดตาม", "ในเส้นทางการงาน ดวงชี้ให้เห็นจุดแข็งที่ใช้ได้จริง",
      "ถ้าพูดถึงงาน {N}มีพลังบางอย่างที่โดดเด่นเป็นพิเศษ", "มาที่เรื่องการงาน ซึ่งเป็นอีกด้านที่ดวงครั้งนี้เล่าไว้ละเอียด",
      "ด้านการเรียนรู้และการทำงาน {D}มองเห็นศักยภาพที่ชัดเจน", "ในโลกของการทำงาน {N}มีวิธีของตัวเองที่น่าสนใจ",
      "สำหรับเรื่องงาน ดวงของ{N}มีทั้งแรงส่งและทิศทาง", "เมื่อมองไปที่การงาน จะเห็นว่า{N}เหมาะกับบทบาทที่ได้ใช้จุดแข็งอย่างเต็มที่",
      "เรื่องหน้าที่การงานในดวงนี้มีมุมดี ๆ ให้หยิบมาใช้หลายข้อ",
    ],
    money: [
      "มาถึงเรื่องการเงินและโชคลาภ", "ในด้านการเงิน ดวงของ{N}มีลักษณะที่น่าสนใจ",
      "เรื่องเงินทองตาม{D}สะท้อนวิธีคิดและนิสัยการใช้จ่ายได้ดี", "ถ้าพูดถึงโชคลาภ {N}มีจุดที่ช่วยหนุนอยู่หลายตำแหน่ง",
      "การเงินของ{N}ในมุมของ{D}มีแนวโน้มที่น่าพอใจ", "สำหรับเรื่องทรัพย์สิน ดวงชี้ทางที่เหมาะกับ{N}ไว้ค่อนข้างชัด",
      "มาดูกันว่าดวงครั้งนี้บอกอะไรเกี่ยวกับการเงินของ{N}", "เรื่องโชคลาภและการเก็บออมมีสัญญาณดีที่ควรรู้ไว้",
      "ในมุมของเงินทอง ดวงนี้มีเคล็ดที่ช่วยให้{N}วางแผนได้ดีขึ้น",
    ],
    love: [
      "มาถึงเรื่องหัวใจ ซึ่งหลายคนรอฟังอยู่", "ในด้านความรักและความสัมพันธ์ {N}มีเสน่ห์ในแบบของตัวเอง",
      "เรื่องความรักตาม{D}สะท้อนวิธีที่{N}ดูแลคนที่รัก", "ถ้าพูดถึงความสัมพันธ์ ดวงของ{N}มีความอบอุ่นเป็นพื้นฐาน",
      "หัวใจของ{N}ในมุมมองของ{D}มีเรื่องน่ารักให้เล่าหลายเรื่อง", "สำหรับความรัก ดวงครั้งนี้มีมุมมองที่ให้กำลังใจ",
      "ในเรื่องความสัมพันธ์ใกล้ชิด {N}มีจุดเด่นที่คนรักสัมผัสได้", "มาดูเรื่องความรักกันบ้าง ซึ่งดวงนี้มีรายละเอียดที่ละมุนละไม",
      "ด้านความรัก ดวงของ{N}บอกถึงความจริงใจที่มั่นคง",
    ],
    social: [
      "ในเรื่องมิตรภาพและผู้คนรอบตัว ดวงนี้มีภาพที่อบอุ่น", "ด้านสังคม {N}เป็นคนที่ผู้คนอยากอยู่ใกล้",
      "เรื่องเพื่อนฝูงและเครือข่ายในดวงนี้มีจุดน่าสนใจ", "ถ้าพูดถึงความสัมพันธ์กับผู้คน ดวงของ{N}มีพลังดึงดูดที่ดี",
      "มาดูเรื่องผู้คนรอบตัวและผู้ใหญ่ที่คอยหนุนกัน", "สำหรับมิตรภาพ {D}มองเห็นน้ำใจที่{N}มีให้คนอื่น",
      "ในวงสังคม {N}มีบทบาทที่น่าสนใจกว่าที่คิด", "ด้านมนุษยสัมพันธ์ ดวงครั้งนี้มีข่าวดีหลายเรื่อง",
    ],
    timing: [
      "ในเรื่องจังหวะเวลา ดวงนี้มีสัญญาณที่น่าจดไว้", "มาดูกันว่าช่วงไหนเป็นจังหวะดีของ{N}",
      "ด้านจังหวะชีวิต {D}ให้ภาพที่น่าสนใจ", "เรื่องเวลาเป็นอีกมิติที่ช่วยให้วางแผนได้ดีขึ้น",
      "สำหรับจังหวะเวลา ดวงของ{N}มีช่วงที่เหมาะกับการเริ่มต้นสิ่งใหม่", "ถ้าพูดถึงช่วงเวลาที่ควรใช้โอกาส ดวงนี้มีคำแนะนำไว้",
      "จังหวะชีวิตของ{N}ในช่วงนี้มีสัญญาณที่ควรรู้", "ในมุมของเวลา ดวงครั้งนี้ชวนให้{N}เดินหน้าอย่างมีจังหวะ",
    ],
    advice: [
      "ก่อนจากกัน มีเคล็ดเสริมดวงฝากไว้ให้{N}", "สำหรับคำแนะนำ ขอสรุปเป็นเคล็ดง่าย ๆ ที่ทำได้จริง",
      "เพื่อให้ดวงดีที่มีอยู่ทำงานได้เต็มที่ ลองนำคำแนะนำเหล่านี้ไปใช้", "เคล็ดเสริมดวงที่เข้ากับ{N}ในครั้งนี้มีหลายข้อ",
      "ส่วนคำแนะนำ ตำราแนะนำสิ่งเล็ก ๆ ที่ให้ผลดี", "ปิดท้ายด้วยเคล็ดลับเสริมพลังบวกสำหรับ{N}",
      "หากอยากเติมพลังให้ดวงครั้งนี้ ลองเริ่มจากสิ่งต่อไปนี้", "ท้ายที่สุด ขอฝากเคล็ดเสริมดวงแบบเบา ๆ ไว้",
    ],
  };
  const HEADLINES = [
    "ใจความหลักของดวงครั้งนี้คือ{X}", "จุดที่โดดเด่นที่สุดในผลครั้งนี้คือ{X}", "หากสรุปเป็นค่าเดียว ผลที่ได้คือ{X}",
    "หัวใจของคำทำนายครั้งนี้อยู่ที่{X}", "ผลที่ชัดเจนที่สุดซึ่งควรจำไว้คือ{X}", "ตัวชี้วัดหลักของดวงรอบนี้คือ{X}",
  ];
  const BRIDGES = [
    "ส่วนเรื่อง{TW}ที่{N}อยากรู้เป็นพิเศษ ขอเล่าอย่างละเอียดในหัวข้อถัดไป",
    "สำหรับเรื่อง{TW}ซึ่งเป็นหัวข้อที่สนใจ ดวงมีรายละเอียดดี ๆ รออยู่ด้านล่าง",
    "และเพราะ{N}ตั้งใจถามเรื่อง{TW} จึงขอให้น้ำหนักกับหัวข้อนี้มากเป็นพิเศษ",
    "เรื่อง{TW}เป็นจุดที่ดวงครั้งนี้มีเรื่องเล่ามากที่สุด ลองอ่านต่อได้เลย",
    "หัวข้อ{TW}ที่ถามมานั้นมีสัญญาณน่าสนใจหลายข้อ ซึ่งจะไล่เรียงให้ฟังต่อจากนี้",
    "ในเรื่อง{TW} ดวงได้ทิ้งเบาะแสดี ๆ ไว้หลายอย่าง ขอขยายความในส่วนถัดไป",
  ];
  // คำบ่งชี้ความไม่แน่นอน (ว่างบ่อย ๆ เพื่อไม่ให้ทุกประโยคขึ้นต้นเหมือนกัน)
  const HEDGES = ["", "", "", "", "มีแนวโน้มว่า", "ตามตำราเชื่อว่า", "ว่ากันว่า", "ตามความเชื่อแล้ว ", "ในทางตำรามักตีความว่า", "ดูเหมือนว่า", "เชื่อกันว่า"];
  // คำเชื่อมหลังชื่อสิ่งที่พบ (ห้ามว่าง เพื่อไม่ให้ชื่อกับความหมายชนกันเป็นสองวลีห้วน ๆ)
  const LINKS = ["มีแนวโน้มว่า", "ตามตำราเชื่อว่า", "ว่ากันว่า", "บ่งบอกว่า", "สะท้อนว่า", "ซึ่งตามความเชื่อหมายถึง", "ในทางตำรามักตีความว่า", "เชื่อกันว่า", "ชี้ว่า", "ถือเป็นสัญญาณว่า", "ตามความเชื่อแล้วบอกว่า"];
  const VERBS = ["บ่งบอกว่า", "สะท้อนว่า", "ชี้ให้เห็นว่า", "เป็นสัญญาณว่า", "ตามตำรามักตีความว่า", "ในความเชื่อหมายความว่า", "เผยให้เห็นว่า", "บอกเป็นนัยว่า"];
  // ประโยคกล่าวถึงสิ่งที่พบครั้งแรก ({LE} ชื่อ+หลักฐาน, {LEV} ชื่อ+หลักฐานต่อกริยา, {G} กลุ่ม, ^ = ไม่เติมคำเชื่อมหน้า)
  const FIRST_FRAMES = [
    "{LEV}{V}{M}", "^จาก{LE} {H}{M}", "^เมื่อดูที่{G} ซึ่งเป็น{LE} {H}{M}", "{G}ของ{N}เป็น{LE} {H}{M}",
    "^สิ่งที่พบคือ{LE} ซึ่ง{V}{M}", "ลักษณะเด่นอย่าง{LE} {H}{M}", "^ในส่วนของ{G} พบ{LE} {H}{M}", "{L}ที่ปรากฏนี้{V}{M}",
  ];
  const NEEDS_GROUP = /\{G\}/;
  const NEXT_FRAMES = ["{H}{M}", "{L}ยังบอกอีกว่า{M}", "^ส่วน{L} {H}{M}", "^สำหรับ{L} {H}{M}", "^หากดูที่{L} {H}{M}", "{L}ยังช่วยเสริมด้วยว่า{M}", "{L}{V}{M}"];
  const MORE_FRAMES = ["{H}{M}", "{H}{M}", "^ในมุมเดียวกันนี้ {M}", "^อีกความหมายหนึ่งของ{L}คือ{M}", "^ตำราบางสำนักยังเสริมว่า{M}", "^ไม่เพียงเท่านั้น {L}ยัง{V}{M}"];
  const SYN_PAIR = [
    "ทั้ง{A}และ{B}ช่วยเสริมกันในเรื่อง{TW} ทำให้จุดนี้เด่นชัดเป็นพิเศษ",
    "เมื่อ{A}มาประกอบกับ{B} พลังด้าน{TW}ของ{N}จึงยิ่งหนักแน่น",
    "{A}กับ{B}เป็นเหมือนคู่หูที่หนุนเรื่อง{TW}ไปในทิศทางเดียวกัน",
    "น่าสังเกตว่า{A}และ{B}ต่างก็ชี้ไปที่เรื่อง{TW} ซึ่งตามตำราถือว่าเป็นสัญญาณที่ย้ำชัด",
    "การที่มีทั้ง{A}และ{B}อยู่ด้วยกัน ทำให้เรื่อง{TW}มีฐานที่มั่นคงถึงสองชั้น",
    "สองสัญญาณอย่าง{A}และ{B}สอดรับกันพอดีในเรื่อง{TW}",
    "{A}ช่วยเปิดทาง ส่วน{B}ช่วยประคอง ทำให้เรื่อง{TW}เดินหน้าได้อย่างสมดุล",
    "ความสอดคล้องระหว่าง{A}กับ{B}คือสิ่งที่ทำให้เรื่อง{TW}น่าจับตามอง",
  ];
  const SYN_CONTRAST = [
    "แม้{W}จะยังไม่โดดเด่นนัก แต่{S}ช่วยหนุนเรื่อง{TW}ไว้ได้อย่างดี",
    "แม้{W}จะเป็นจุดที่ยังรอการพัฒนา แต่{S}ก็เป็นแรงส่งที่ช่วยเติมเต็มกันได้",
    "ถึง{W}จะบอกให้ค่อยเป็นค่อยไป แต่{S}ก็ทำให้เรื่อง{TW}มีความหวังเสมอ",
    "{W}อาจชวนให้ใจเย็นลงอีกนิดในเรื่อง{TW} ทว่า{S}คอยถ่วงดุลให้ทุกอย่างลงตัว",
    "แม้จังหวะของ{W}จะยังไม่เร่งเร้า แต่{S}เป็นจุดแข็งที่ใช้ได้ทันที",
    "หาก{W}คือบทเรียน {S}ก็คือเครื่องมือที่ช่วยให้ผ่านบทเรียนนั้นไปได้อย่างสวยงาม",
  ];
  const COLOR_LINES = [
    "สีที่ช่วยเสริมพลังให้{N}ในช่วงนี้คือ{X}", "หากอยากเพิ่มความมั่นใจ ลองหยิบสี{X}มาใช้ในการแต่งกายหรือของใช้ประจำวัน",
    "ตามความเชื่อ สี{X}จะช่วยเติมพลังบวกให้ได้ดี", "เลือกของใช้ชิ้นเล็ก ๆ โทนสี{X}ติดตัวไว้ เป็นเคล็ดเสริมดวงที่ทำง่าย",
  ];
  const NUMBER_LINES = [
    "เลขมงคลที่เข้ากับดวงนี้คือ{X} ไว้เป็นกำลังใจเล็ก ๆ ในชีวิตประจำวัน",
    "ตัวเลข{X}ถือเป็นเลขนำโชคประจำดวงครั้งนี้ เลือกใช้กับสิ่งเล็ก ๆ ที่ชอบได้",
    "ตามความเชื่อ เลข{X}ช่วยเติมพลังใจให้{N}ได้ดี",
  ];
  const DIRECTION_LINES = [
    "ทิศ{X}เป็นทิศที่ส่งเสริมพลังดี ลองหันโต๊ะทำงานหรือมุมพักผ่อนไปทางนั้นดู",
    "ตามความเชื่อ ทิศ{X}เป็นทิศมงคลสำหรับ{N}ในช่วงนี้",
    "ถ้าจัดมุมโปรดในบ้านได้ ลองให้หันไปทางทิศ{X} เชื่อกันว่าช่วยให้ใจสงบและคิดอะไรได้ปลอดโปร่ง",
  ];

  /* ======================= ตัวกรองความปลอดภัย ======================= */
  // ห้าม: ความตาย ความเจ็บป่วย อุบัติเหตุ การหย่าร้าง/นอกใจ ล้มละลาย ภัยพิบัติ คำสาป การพนัน ฯลฯ
  const BANNED_TH = [
    // "ตาย" ตรวจเฉพาะรูปที่สื่อความตาย เพราะคำว่า "ดวงตายาว" "หางตายก" มีตัวอักษร ตาย อยู่ด้วย
    "ความตาย", "ตายจาก", "ตายไป", "ตายก่อน", "ตายแล้ว", "ตายโหง", "ตายเร็ว", "จะตาย", "ถึงตาย", "คนตาย", "การตาย", "อายุสั้น", "เสียชีวิต", "สิ้นใจ", "มรณะ", "ศพ", "ป่วย", "โรค", "เจ็บไข้", "มะเร็ง", "ผ่าตัด",
    "อุบัติเหตุ", "รถชน", "บาดเจ็บ", "เลือดตก", "หย่า", "แยกทาง", "นอกใจ", "ชู้", "เมียน้อย",
    "ล้มละลาย", "หนี้ท่วม", "หายนะ", "ภัยพิบัติ", "วิบัติ", "คำสาป", "สาปแช่ง", "เคราะห์ร้าย", "เคราะห์หนัก",
    "อัปมงคล", "ซวย", "ดวงตก", "ติดคุก", "ฆาตกรรม", "ฆ่า", "หวย", "เลขเด็ด", "พนัน", "แท่งหวย", "ของไม่ดีจะเข้า",
  ];
  const BANNED_EN = /\b(death|die|dies|dying|dead|ill|illness|sick|sickness|disease|cancer|accident|divorce|bankrupt\w*|disaster|curse[sd]?|lottery|gambl\w*|suicide|kill\w*|infidelity|cheat\w*)\b/i;
  function isSafe(text) {
    const t = String(text || "");
    if (BANNED_EN.test(t)) return false;
    for (const w of BANNED_TH) if (t.indexOf(w) !== -1) return false;
    return true;
  }
  // ตัดเฉพาะวลี (คั่นด้วยช่องว่าง) ที่มีคำต้องห้ามออก ใช้กับข้อความยาวจาก AI
  function filterText(text) {
    const s = String(text || "");
    if (isSafe(s)) return s;
    return s.split(/\s+/).filter(isSafe).join(" ").trim();
  }

  /* ======================= ตัวตรวจประโยคซ้ำ ======================= */
  const STRIP_PREFIX = CONNECTORS.concat(HEDGES.filter(Boolean).map(h => h.trim())).sort((a, b) => b.length - a.length);
  function normSentence(s) {
    let t = String(s).trim();
    for (const p of STRIP_PREFIX) if (t.startsWith(p)) { t = t.slice(p.length); break; }
    return t.replace(/[\s​.,!?;:"'()\-–—…]/g, "").toLowerCase();
  }
  function bigrams(t) { const set = new Set(); for (let i = 0; i < t.length - 1; i++) set.add(t.substr(i, 2)); return set; }
  function dice(a, b) {
    if (!a.size || !b.size) return 0;
    let n = 0; const [x, y] = a.size < b.size ? [a, b] : [b, a];
    for (const g of x) if (y.has(g)) n++;
    return (2 * n) / (a.size + b.size);
  }

  /* ======================= ตัวเรียบเรียงในเครื่อง ======================= */
  const cleanMeaning = m => String(m || "").trim().replace(/[.。\s]+$/u, "");
  const thaiList = (arr, sp) => arr.length <= 1 ? (arr[0] || "") : arr.slice(0, -1).join(" ") + (sp ? " และ " : " และ") + arr[arr.length - 1];
  const tidy = s => s.replace(/\s{2,}/g, " ").replace(/\s+\)/g, ")").replace(/\(\s+/g, "(").trim();

  function normalizeFacts(facts) {
    const f = facts && typeof facts === "object" ? facts : {};
    const items = (Array.isArray(f.items) ? f.items : []).filter(it => it && typeof it === "object" && it.label).map((it, i) => ({
      id: String(it.id || "item" + i), group: String(it.group || ""), label: String(it.label),
      evidence: it.evidence ? String(it.evidence) : "", strength: typeof it.strength === "number" && isFinite(it.strength) ? Math.max(0, Math.min(1, it.strength)) : 0.5,
      polarity: it.polarity === "challenge" ? "challenge" : "", tags: Array.isArray(it.tags) ? it.tags.map(String) : [],
      meanings: it.meanings && typeof it.meanings === "object" ? it.meanings : {}, _i: i,
    }));
    items.sort((a, b) => (b.strength - a.strength) || (a._i - b._i));
    return {
      domain: DOMAINS.indexOf(f.domain) >= 0 ? f.domain : "face",
      topic: TOPICS.indexOf(f.topic) >= 0 ? f.topic : "overall",
      nickname: f.subject && f.subject.nickname ? String(f.subject.nickname).replace(/[<>{}]/g, "").trim().slice(0, 24) : "",
      headline: f.headline ? String(f.headline) : "", items,
      extras: f.extras && typeof f.extras === "object" ? f.extras : {},
    };
  }

  function makeCtx(F, r) {
    const ctx = {
      r, F, used: new Set(), mentioned: new Set(), evidenceShown: new Set(), accepted: [], all: [], nickUses: 0,
      opener: deck(r, OPENERS), conn: deck(r, CONNECTORS), closer: deck(r, CLOSERS), advice: deck(r, ADVICE_FRAMES),
      hedge: deck(r, HEDGES), link: deck(r, LINKS), verb: deck(r, VERBS), first: deck(r, FIRST_FRAMES), next: deck(r, NEXT_FRAMES), more: deck(r, MORE_FRAMES),
      pair: deck(r, SYN_PAIR), contrast: deck(r, SYN_CONTRAST), bridge: deck(r, BRIDGES), headline: deck(r, HEADLINES),
      intro: {}, lastConn: null,
    };
    for (const k in INTROS) ctx.intro[k] = deck(r, INTROS[k]);
    // คุณ / คุณ{ชื่อเล่น} — ใช้ชื่อเล่นอย่างพอดี ไม่เกิน 3 ครั้งต่อคำทำนาย
    ctx.N = () => (F.nickname && ctx.nickUses < 3 && r() < 0.55 ? (ctx.nickUses++, "คุณ" + F.nickname) : "คุณ");
    ctx.vars = extra => Object.assign({ N: ctx.N, D: DOMAIN_NAMES[F.domain] }, extra);
    return ctx;
  }

  // เพิ่มประโยคเมื่อปลอดภัยและไม่ซ้ำ/คล้ายประโยคก่อนหน้า
  function accept(ctx, s) {
    s = tidy(s);
    if (!s || !isSafe(s)) return null;
    const n = normSentence(s);
    if (!n) return null;
    const bg = bigrams(n);
    for (const a of ctx.accepted) {
      if (a.n === n) return null;
      if (n.length >= 12 && a.n.length >= 12 && dice(a.bg, bg) >= 0.82) return null;
    }
    ctx.accepted.push({ n, bg }); ctx.all.push(s);
    return s;
  }

  function pickMeaning(ctx, it, keys) {
    const pool = [];
    for (const k of keys) { const arr = it.meanings[k]; if (Array.isArray(arr)) for (const m of arr) { const c = cleanMeaning(m); if (c && !ctx.used.has(c) && isSafe(c)) pool.push(c); } }
    if (!pool.length) return null;
    const m = pick(ctx.r, pool); ctx.used.add(m); return m;
  }
  const hasKeys = (it, keys) => keys.some(k => Array.isArray(it.meanings[k]) && it.meanings[k].length);

  // สร้างประโยคจากสิ่งที่พบ 1 รายการ (+ คืนค่าว่าเติมคำเชื่อมได้หรือไม่)
  function itemSentence(ctx, it, m, mode) {
    const r = ctx.r;
    let frame;
    if (mode === "first") {
      for (let k = 0; k < 4; k++) { frame = ctx.first(); if (!NEEDS_GROUP.test(frame) || (it.group && it.group !== it.label)) break; frame = "{LEV}{V}{M}"; }
    } else frame = mode === "more" ? ctx.more() : ctx.next();
    let ev = "";
    if (mode === "first" && /\{LEV?\}/.test(frame) && it.evidence && !ctx.evidenceShown.has(it.id) && r() < 0.8) { ev = it.evidence; ctx.evidenceShown.add(it.id); }
    const LE = it.label + (ev ? " (" + ev + ")" : "");
    const noConn = frame[0] === "^";
    const text = fill(noConn ? frame.slice(1) : frame, ctx.vars({ LE, LEV: LE + (ev ? " " : ""), L: it.label, G: it.group, H: /\{LE\} \{H\}/.test(frame) ? ctx.link() : ctx.hedge(), V: ctx.verb(), M: m }));
    ctx.mentioned.add(it.id);
    return { text, noConn };
  }

  function withConnector(ctx, s) {
    let c = ctx.conn();
    if (c === ctx.lastConn) c = ctx.conn();
    ctx.lastConn = c;
    return c + " " + s;
  }

  // แบ่งย่อหน้า 2–4 ประโยค; ประโยคที่ 2 เป็นต้นไปอาจเติมคำเชื่อม
  function paragraphs(ctx, list) {
    const r = ctx.r, out = [];
    let i = 0;
    while (i < list.length) {
      let size = 2 + Math.floor(r() * 3);
      if (list.length - (i + size) === 1) size++;
      const chunk = list.slice(i, i + size);
      const parts = [];
      chunk.forEach((u, j) => {
        let s = u.text;
        if (j > 0 && !u.noConn && !u.fixed && r() < 0.6) s = withConnector(ctx, s);
        s = accept(ctx, s);
        if (s) parts.push(s);
      });
      if (parts.length) out.push(parts.join(" "));
      i += size;
    }
    return out;
  }

  function synthesis(ctx, list, tagWord) {
    const out = [];
    const strong = list.filter(it => it.strength >= 0.6 && it.polarity !== "challenge");
    const weak = list.filter(it => it.polarity === "challenge" || it.strength <= 0.4);
    if (strong.length >= 2 && strong[0].label !== strong[1].label) {
      out.push({ text: fill(ctx.pair(), ctx.vars({ A: strong[0].label, B: strong[1].label, TW: tagWord })), fixed: true });
    }
    if (weak.length && strong.length && weak[0].label !== strong[0].label) {
      out.push({ text: fill(ctx.contrast(), ctx.vars({ W: weak[0].label, S: strong[0].label, TW: tagWord })), fixed: true });
    }
    return out;
  }

  function buildOverview(ctx, plan) {
    const { F, r } = ctx;
    const units = [{ text: fill(ctx.opener(), ctx.vars()), fixed: true }];
    if (F.headline) units.push({ text: fill(ctx.headline(), ctx.vars({ X: F.headline })), fixed: true });
    const k = Math.min(F.items.length, 3 + Math.floor(r() * 3));
    const top = F.items.slice(0, k);
    const pref = ["overview", "personality"].concat(F.topic !== "overall" ? [F.topic] : []);
    for (const it of top) {
      const m = pickMeaning(ctx, it, pref) || pickMeaning(ctx, it, it.tags.filter(t => t !== "advice").concat(Object.keys(it.meanings)));
      if (m) units.push(itemSentence(ctx, it, m, "first"));
    }
    // ผสานสองสิ่งที่พบซึ่งอยู่หมวดเดียวกัน
    let best = null;
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const shared = top[i].tags.filter(t => t !== "advice" && top[j].tags.indexOf(t) >= 0 && TAG_WORDS[t]);
      if (shared.length && top[i].label !== top[j].label) {
        const score = top[i].strength + top[j].strength;
        if (!best || score > best.score) best = { a: top[i], b: top[j], tag: shared.indexOf(F.topic) >= 0 ? F.topic : shared[0], score };
      }
    }
    if (best) units.push({ text: fill(ctx.pair(), ctx.vars({ A: best.a.label, B: best.b.label, TW: TAG_WORDS[best.tag] })), fixed: true });
    const w = top.find(it => it.polarity === "challenge");
    const s = top.find(it => it !== w && it.polarity !== "challenge");
    if (w && s) units.push({ text: fill(ctx.contrast(), ctx.vars({ W: w.label, S: s.label, TW: TAG_WORDS.overview })), fixed: true });
    if (plan.topicHasSection) units.push({ text: fill(ctx.bridge(), ctx.vars({ TW: TAG_WORDS[F.topic] })), fixed: true });
    else if (r() < 0.6) units.push({ text: fill(ctx.closer(), ctx.vars({ T: CLOSER_TOPIC.overview })), fixed: true });
    return paragraphs(ctx, units);
  }

  function buildSection(ctx, id, isTopic) {
    const { F, r } = ctx;
    const keys = SECTION_KEYS[id];
    const rel = F.items.filter(it => hasKeys(it, keys));
    const extras = F.extras || {};
    const extraUnits = [];
    if (id === "advice") {
      const list = v => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 6) : []);
      for (const t of list(extras.tips)) extraUnits.push({ text: fill(ctx.advice(), ctx.vars({ M: cleanMeaning(t) })), noConn: true });
      if (list(extras.luckyColors).length) extraUnits.push({ text: fill(pick(r, COLOR_LINES), ctx.vars({ X: thaiList(list(extras.luckyColors)) })), noConn: true });
      if (list(extras.luckyNumbers).length) extraUnits.push({ text: fill(pick(r, NUMBER_LINES), ctx.vars({ X: " " + thaiList(list(extras.luckyNumbers), true) + " " })), noConn: true });
      if (list(extras.directions).length) extraUnits.push({ text: fill(pick(r, DIRECTION_LINES), ctx.vars({ X: thaiList(list(extras.directions)) })), noConn: true });
    }
    if (!rel.length && !extraUnits.length) return null;

    const maxItems = isTopic ? 8 : 3 + Math.floor(r() * 3);
    // เรียงตามความเด่น + สุ่มเล็กน้อย เพื่อให้ลำดับต่างกันในแต่ละรอบ แต่ตัวเด่นยังมาก่อน
    const chosen = rel.map(it => ({ it, k: it.strength + r() * 0.18 })).sort((a, b) => b.k - a.k).slice(0, maxItems).map(x => x.it);
    const units = [{ text: fill(ctx.intro[id](), ctx.vars()), fixed: true }];
    const body = [];
    for (const it of chosen) {
      const m = pickMeaning(ctx, it, keys);
      if (!m) continue;
      if (id === "advice") { body.push({ text: fill(ctx.advice(), ctx.vars({ M: m })), noConn: true }); ctx.mentioned.add(it.id); continue; }
      body.push(itemSentence(ctx, it, m, ctx.mentioned.has(it.id) ? "next" : "first"));
      if (isTopic && r() < 0.55) { const m2 = pickMeaning(ctx, it, keys); if (m2) body.push(itemSentence(ctx, it, m2, "more")); }
    }
    const syn = id === "advice" ? [] : synthesis(ctx, chosen, TAG_WORDS[id]);
    // แทรกประโยคผสานไว้หลังสิ่งที่พบชิ้นที่สองหรือสาม ให้อ่านลื่นเหมือนคนเล่า
    if (syn.length) body.splice(Math.min(body.length, 2 + Math.floor(r() * 2)), 0, syn[0]);
    if (isTopic && syn[1]) body.push(syn[1]); else if (syn[1] && r() < 0.5) body.push(syn[1]);
    units.push(...body, ...extraUnits);
    if (isTopic || r() < 0.6 || id === "advice") units.push({ text: fill(ctx.closer(), ctx.vars({ T: CLOSER_TOPIC[id] })), fixed: true });
    const paras = paragraphs(ctx, units);
    return paras.length ? { id, title: SECTION_TITLES[id], paragraphs: paras } : null;
  }

  function compose(facts, opts = {}) {
    const seed = opts.seed != null ? opts.seed >>> 0 : randomSeed();
    const r = rng(seed);
    const F = normalizeFacts(facts);
    const ctx = makeCtx(F, r);
    let order = ["personality", "work", "money", "love", "social", "timing", "advice"];
    if (F.topic !== "overall") order = [F.topic].concat(order.filter(x => x !== F.topic));
    const topicId = F.topic === "overall" ? "personality" : F.topic;
    const topicHasSection = F.topic !== "overall" && F.items.some(it => hasKeys(it, SECTION_KEYS[F.topic]));
    const sections = [];
    const ov = buildOverview(ctx, { topicHasSection });
    if (ov.length) sections.push({ id: "overview", title: SECTION_TITLES.overview, paragraphs: ov });
    for (const id of order) { const s = buildSection(ctx, id, id === topicId); if (s) sections.push(s); }
    const out = { source: "local", sections, seed };
    if (opts.trace) out._sentences = ctx.all.slice();
    return out;
  }

  /* ======================= Claude AI ผ่านเซิร์ฟเวอร์ ======================= */
  const MAX_FACTS_BYTES = 19 * 1024; // เซิร์ฟเวอร์รับไม่เกิน 20KB
  const byteLen = s => (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s).length : unescape(encodeURIComponent(s)).length);
  const clip = (s, n) => (s == null ? undefined : String(s).slice(0, n));
  // ส่งเฉพาะคีย์ตามสัญญา ตัดความยาว และย่อจนขนาดไม่เกินที่เซิร์ฟเวอร์รับ
  function compactFacts(facts, perTag, maxItems) {
    const F = facts || {};
    const items = (Array.isArray(F.items) ? F.items : []).slice().sort((a, b) => ((b && b.strength) || 0) - ((a && a.strength) || 0)).slice(0, maxItems).map(it => {
      const meanings = {};
      if (it && it.meanings) for (const k of Object.keys(it.meanings).slice(0, 10)) {
        const arr = Array.isArray(it.meanings[k]) ? it.meanings[k].slice(0, perTag).map(m => clip(m, 300)) : [];
        if (arr.length) meanings[clip(k, 24)] = arr;
      }
      const o = { id: clip(it.id, 80), group: clip(it.group, 80), label: clip(it.label, 160), tags: (it.tags || []).slice(0, 10).map(t => clip(t, 24)), meanings };
      if (it.evidence) o.evidence = clip(it.evidence, 200);
      if (typeof it.strength === "number") o.strength = Math.max(0, Math.min(1, it.strength));
      if (it.polarity === "challenge") o.polarity = "challenge";
      return o;
    });
    const out = { domain: F.domain, topic: F.topic || "overall", items };
    if (F.subject) { out.subject = {}; if (F.subject.nickname) out.subject.nickname = clip(F.subject.nickname, 24); if (F.subject.ageBand) out.subject.ageBand = clip(F.subject.ageBand, 24); }
    if (F.headline) out.headline = clip(F.headline, 200);
    if (F.extras) {
      out.extras = {};
      for (const k of ["luckyColors", "luckyNumbers", "directions", "tips"]) if (Array.isArray(F.extras[k])) out.extras[k] = F.extras[k].slice(0, 8).map(x => clip(x, 200));
    }
    return out;
  }
  function factsForAI(facts) {
    for (const [perTag, maxItems] of [[2, 60], [1, 60], [1, 40], [1, 25], [1, 15]]) {
      const c = compactFacts(facts, perTag, maxItems);
      if (byteLen(JSON.stringify(c)) <= MAX_FACTS_BYTES) return c;
    }
    return compactFacts(facts, 1, 8);
  }
  function normalizeAI(j) {
    if (!j || !Array.isArray(j.sections)) return null;
    const seen = new Set(), sections = [];
    for (const s of j.sections) {
      if (!s || SECTION_IDS.indexOf(s.id) < 0 || seen.has(s.id)) continue;
      const paras = (Array.isArray(s.paragraphs) ? s.paragraphs : []).map(p => filterText(p)).filter(p => p && p.length > 1);
      if (!paras.length) continue;
      seen.add(s.id);
      sections.push({ id: s.id, title: filterText(s.title) || SECTION_TITLES[s.id], paragraphs: paras });
    }
    return sections.length ? sections : null;
  }

  let statusP = null, statusBase = null;
  function status() {
    const base = apiBase();
    if (!statusP || statusBase !== base) {
      statusBase = base;
      // โฮสต์แบบเว็บนิ่ง (GitHub Pages) ไม่มี backend — ไม่ต้องถาม เว้นแต่ตั้ง LENSIQ_API_BASE ไว้
      const staticHost = !base && typeof location !== "undefined" && /\.github\.io$/i.test(location.hostname);
      statusP = (typeof fetch !== "function" || staticHost) ? Promise.resolve({ enabled: false })
        : fetch(base + "/api/fortune/status").then(r => (r.ok ? r.json() : { enabled: false })).then(j => Object.assign({ enabled: false }, j)).catch(() => ({ enabled: false }));
    }
    return statusP;
  }

  const CONSENT_KEY = "fa-consent";
  const CONSENT_TEXT = "ให้ AI ช่วยเรียบเรียงคำทำนาย (ส่งเฉพาะผลวิเคราะห์ ไม่ส่งรูปหรือข้อมูลส่วนตัว)";
  function hasConsent() { try { return root.localStorage && root.localStorage.getItem(CONSENT_KEY) === "1"; } catch (e) { return false; } }
  function setConsent(v) { try { if (root.localStorage) root.localStorage.setItem(CONSENT_KEY, v ? "1" : "0"); } catch (e) { /* โหมดส่วนตัว */ } }

  async function interpret(facts, opts = {}) {
    const useAI = opts.useAI != null ? !!opts.useAI : hasConsent();
    let note;
    if (useAI) {
      const st = await status();
      if (st.enabled) {
        const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ac ? setTimeout(() => ac.abort(), opts.timeoutMs || 90000) : null;
        try {
          const res = await fetch(apiBase() + "/api/fortune", {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: ac ? ac.signal : undefined,
            body: JSON.stringify({ facts: factsForAI(facts), consent: true, tone: opts.tone || "warm" }),
          });
          if (res.ok) {
            const j = await res.json();
            const sections = normalizeAI(j);
            if (sections) return { source: "ai", sections, model: j.model };
          }
          note = "AI ไม่พร้อมใช้งานชั่วคราว จึงใช้ตัวเรียบเรียงในเครื่องแทน";
        } catch (e) {
          note = "เชื่อมต่อ AI ไม่สำเร็จ จึงใช้ตัวเรียบเรียงในเครื่องแทน";
        } finally { if (timer) clearTimeout(timer); }
      }
    }
    const out = compose(facts, opts);
    if (note) out.note = note;
    return out;
  }
  function regenerate(facts, opts = {}) {
    return interpret(facts, Object.assign({}, opts, { seed: randomSeed() }));
  }

  /* ======================= ตัวช่วยแสดงผล ======================= */
  const escapeHtml = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let uid = 0;
  const badgeText = o => (typeof o.aiBadge === "string" ? o.aiBadge : "เรียบเรียงโดย AI (Claude)");
  function toHTML(result, opts = {}) {
    const res = result || { sections: [] };
    let h = "";
    if (res.source === "ai" && opts.aiBadge !== false) h += '<p class="fa-ai-badge">' + escapeHtml(badgeText(opts)) + "</p>";
    if (res.note && opts.showNote !== false) h += '<p class="fa-note" role="status">' + escapeHtml(res.note) + "</p>";
    for (const s of res.sections || []) {
      const hid = "fa-h-" + (++uid);
      h += '<section class="fa-section" data-section="' + escapeHtml(s.id) + '" aria-labelledby="' + hid + '"><h3 id="' + hid + '">' + escapeHtml(s.title || SECTION_TITLES[s.id] || "") + "</h3>";
      for (const p of s.paragraphs || []) h += "<p>" + escapeHtml(p) + "</p>";
      h += "</section>";
    }
    return h;
  }
  function renderSections(container, result, opts = {}) {
    if (!container) return null;
    const doc = container.ownerDocument || root.document;
    const res = result || { sections: [] };
    container.textContent = "";
    const frag = doc.createDocumentFragment();
    const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    if (res.source === "ai" && opts.aiBadge !== false) frag.appendChild(el("p", "fa-ai-badge", badgeText(opts)));
    if (res.note && opts.showNote !== false) { const n = el("p", "fa-note", res.note); n.setAttribute("role", "status"); frag.appendChild(n); }
    for (const s of res.sections || []) {
      const sec = el("section", "fa-section"); sec.setAttribute("data-section", s.id);
      const h = el("h3", null, s.title || SECTION_TITLES[s.id] || ""); h.id = "fa-h-" + (++uid);
      sec.setAttribute("aria-labelledby", h.id); sec.appendChild(h);
      for (const p of s.paragraphs || []) sec.appendChild(el("p", null, p));
      frag.appendChild(sec);
    }
    container.appendChild(frag);
    return container;
  }
  // ช่องติ๊กยินยอมให้ใช้ AI — แสดงเฉพาะเมื่อเซิร์ฟเวอร์เปิดใช้ AI
  function consentControl(container, opts = {}) {
    return status().then(st => {
      if (!st.enabled || !container) return null;
      const doc = container.ownerDocument || root.document;
      const old = container.querySelector && container.querySelector(".fa-consent"); if (old) old.remove();
      const label = doc.createElement("label"); label.className = "fa-consent";
      label.style.cssText = "display:flex;gap:.5em;align-items:flex-start;cursor:pointer";
      const cb = doc.createElement("input"); cb.type = "checkbox"; cb.checked = hasConsent();
      const span = doc.createElement("span"); span.textContent = opts.text || CONSENT_TEXT;
      label.appendChild(cb); label.appendChild(span);
      cb.addEventListener("change", () => { setConsent(cb.checked); if (opts.onChange) opts.onChange(cb.checked); });
      container.appendChild(label);
      return label;
    });
  }

  const api = {
    compose, interpret, regenerate, status, renderSections, toHTML, consentControl, hasConsent, setConsent,
    rng, pick, shuffle, SECTION_TITLES, SECTION_IDS, CONSENT_TEXT,
    safety: { isSafe, filterText, BANNED: BANNED_TH.slice() },
    _internal: { factsForAI, normalizeAI, normSentence, dice, bigrams, banks: { OPENERS, CONNECTORS, CLOSERS, ADVICE_FRAMES, INTROS } },
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FortuneAI = api;
})(typeof window !== "undefined" ? window : globalThis);
