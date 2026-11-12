# คำอ่านดวงแบบตรง ๆ (ส่วน C) — รอเจ้าของอนุมัติ / Honest negative readings (Part C) — awaiting owner approval

สถานะ: **ยังไม่เปิดใช้** `lensiq-config.js` ตั้ง `window.LENSIQ_FORTUNE_STRAIGHT = false` การ commit นี้จึงไม่เปลี่ยนสิ่งที่ผู้ใช้เห็น
(ตรวจแล้ว: คำอ่าน 540 ชุด 15 ศาสตร์ × ไทย/อังกฤษ/จีน เทียบโค้ดก่อนและหลังในโปรเซสเดียวกัน ต่างกัน 0 ชุด
`~/LENSIQ-field/evals/fortune-honest/gentle-unchanged.log`). คำสั่งเจ้าของ 2026-11-12 ส่วน C. ไม่ได้แก้ CLAUDE.md

Status: **not switched on**. `lensiq-config.js` sets `window.LENSIQ_FORTUNE_STRAIGHT = false`, so this commit changes nothing users
see (540 readings, 15 disciplines × TH/EN/ZH, compared old vs new code in one process: 0 differ). CLAUDE.md is not edited.

---

## ภาษาไทย

### ก. ข้อความกฎที่เสนอให้แทนใน CLAUDE.md

แทนบรรทัด "Fortune hard bans: no predictions of death, illness, accident, disaster or infidelity; no lottery numbers; no medical or
cosmetic advice." ด้วยข้อความภาษาอังกฤษในส่วน English ข้อ (a) ด้านล่าง ความหมายภาษาไทย:

> **คำอ่านดวง (คำสั่งเจ้าของ 2026-11-12):** เมื่อหลักของศาสตร์คำนวณได้ผลที่ไม่ดี ให้บอกตรง ๆ ได้ เช่น ช่วงดวงอ่อน เรื่องที่ต้องระวัง
> (เงิน งาน ความสัมพันธ์ นิสัยการดูแลสุขภาพ การเดินทาง) ความขัดแย้ง อุปสรรค การสูญเสีย คนไม่หวังดี ถ้อยคำแบบตรงเสนอเป็นตัวเลือก
> "ดูตรง ๆ / Read it straight / 直说" สำหรับผู้ที่ยืนยันว่าอายุ 18 ปีขึ้นไป จำไว้ในเครื่อง ผู้ที่ยังไม่ยืนยันหรือปิดตัวเลือกนี้ได้ถ้อยคำแบบนุ่มนวล
> **ข้อห้ามเด็ดขาดทุกโหมด มีชุดทดสอบไทย/อังกฤษ/จีน:** (1) ไม่ทำนายความตาย โรคร้ายระยะสุดท้าย หรืออุบัติเหตุเฉพาะเจาะจงแบบฟันธงหรือระบุวัน
> (2) ไม่สั่งให้หยุดยาหรือการรักษา ไม่สั่งให้ลงทุนในสิ่งใดเฉพาะเจาะจง ไม่สั่งให้เลิกกับคนรัก (3) ตาข่ายวิกฤตมาก่อนทุกอย่างเสมอ โหมดตรงข้ามไม่ได้
> (4) ห้ามถ้อยคำว่าเรื่องร้ายจะเกิดถ้าผู้ใช้ไม่จ่ายเงินหรือไม่ทำพิธี (ห้ามขายความกลัว ดูกฎ Remedies and merit)
> และยังห้าม: เลขเสี่ยงโชค คำแนะนำทางการแพทย์หรือศัลยกรรม การอ่านอารมณ์หรือการโกหก

### ข. สิ่งที่ทำแล้ว (อยู่หลังสวิตช์ ปิดไว้)

- `fortune-straight.js` (ไฟล์ใหม่ โหลดก่อน `fortune-ai.js` ทั้ง 15 หน้า): ข้อห้ามเด็ดขาด, คำบอกผลไม่ดีที่โหมดตรงยอมให้ผ่าน,
  ประโยคนำแบบตรง (ไทย/อังกฤษ/จีน), ตัวเลือกของผู้ใช้ (localStorage `lq-fortune-straight` = `{ adult, straight }`), ช่องติ๊ก
- `fortune-ai.js`: `compose()` เลือกโหมดก่อน ถ้าเป็นโหมดตรงและข้อความของผู้ใช้เข้าตาข่ายวิกฤต คืนการ์ดช่วยเหลือทันที
  `interpret()` ตรวจวิกฤตก่อนเหมือนเดิม และโหมดตรงเรียบเรียงในเครื่องเท่านั้น (ผู้ช่วยเขียน AI ยังนุ่มนวล)
- ข้อห้ามเด็ดขาด (1)(2)(4) ใช้กับ**ทั้งสองโหมด** ตัวกรองนุ่มนวลเดิมไม่เปลี่ยน ยกเว้นแก้บั๊ก 1 จุด: คำว่า "accidents" (พหูพจน์)
  เคยหลุดตัวกรองภาษาอังกฤษ ตอนนี้ถูกตัดแล้ว (ไม่มีคำอ่านเดิมใดใช้คำนี้ จึงไม่มีอะไรเปลี่ยน)
- โหมดตรงไม่แต่งเหตุการณ์ที่ศาสตร์ไม่ได้บอก: ประโยคนำบอกว่า "ตามหลักของศาสตร์นี้เป็นผลไม่ดี" และบอกด้าน (เงิน งาน ความรัก) ตามหัวข้อ
  แล้วตามด้วยสิ่งที่ทำได้เสมอ ถ้าสิ่งที่พบไม่มีความหมายด้านภาพรวม (เช่น กาลกิณีที่มีแต่คำแนะนำ) โหมดตรงยังบอกชื่อสิ่งที่พบนั้น

### ค. ตัวอย่าง 10 ชุด (ก่อน/หลัง) — ดูส่วน Examples ด้านล่าง

ไทย 6 ชุด (ปาจื้อ ทักษา เลข 7 ตัว นักษัตร ดวงไทย เลขศาสตร์) อังกฤษ 2 ชุด (ไพ่ทาโรต์ ปาจื้อ) จีน 2 ชุด (นักษัตร ดวงไทย)
และตัวอย่างโหมดนุ่มนวล 1 ชุด ทุกชุดสร้างจากโค้ดจริง (`FortuneAI.compose`) ด้วยข้อมูลคงที่ สร้างซ้ำได้ด้วย
`node tools/fortune-honest-examples.mjs` (คำที่ขึ้นกับวันที่ เช่น ช่วงอายุ อาจเปลี่ยนตามวันที่รัน) ทุกชุดตรวจแล้ว: ไม่ชนข้อห้ามเด็ดขาด
และไม่มีประโยคที่ไม่ผ่านตัวกรองโหมดตรง

### ง. ตัวเลขที่วัดได้ (ข้อมูลสังเคราะห์: ข้อเท็จจริงสร้างจากเอนจินของแต่ละศาสตร์ ไม่ใช่ข้อมูลผู้ใช้จริง)

| รายการ | ผล | เป้า |
|---|---|---|
| ข้อห้ามเด็ดขาด 60 ประโยคทดสอบ (10 หมวด × ไทย/อังกฤษ/จีน) ถูกตัดทั้งโหมดตรงและโหมดนุ่มนวล | 60/60 | 60/60 |
| ตาข่ายวิกฤต 3 ภาษา × 3 ทาง (compose, interpret, userText) เมื่อเปิดโหมดตรง | 27/27 การ์ดช่วยเหลือ | ทั้งหมด |
| ประโยคบอกผลไม่ดีที่โหมดตรงยอมให้ผ่าน | 12/12 (โหมดนุ่มนวลตัด 6/12) | 12/12 |
| คำอ่านโหมดตรง 84 ชุด (7 ศาสตร์ × 3 ภาษา × 4) มีถ้อยคำบอกผลไม่ดีตรง ๆ | 80/84 (95 %) | ≥ 90 % |
| คำอ่านโหมดตรง 84 ชุด ต่างจากโหมดนุ่มนวล | 80/84 (95 %) | ≥ 90 % |
| ประโยคในคำอ่านโหมดตรง 3,271 ประโยค ชนข้อห้ามเด็ดขาด / ไม่ผ่านตัวกรองโหมดตรง | 0 / 0 | 0 / 0 |
| ทุกประโยคบอกผลไม่ดีมีสิ่งที่ทำได้ตามมา ไม่มีการขายความกลัว/บริการทำบุญแทน | ผ่าน | ผ่าน |
| สวิตช์ปิด: คำอ่านเหมือนเดิมทุกตัวอักษร | 540/540 เหมือนเดิม | 100 % |

### จ. ยังไม่ได้ทำ (รออนุมัติ) และเหตุผล

1. เปิดสวิตช์ `LENSIQ_FORTUNE_STRAIGHT = true` — รอเจ้าของอนุมัติข้อความกฎและตัวอย่าง
2. บรรทัด "หลักการ: เนื้อหาเชิงบวกเท่านั้น ..." บนหน้าดูดวง เอกสารขาย และ docs/legal จะไม่ตรงกับโหมดตรง ต้องแก้พร้อมกันเมื่ออนุมัติ
   (เป็นการเปลี่ยนสิ่งที่ผู้ใช้เห็นเรื่องคำกล่าวอ้าง จึงไม่ทำก่อนอนุมัติ)
3. ผู้ช่วยเขียน AI (Worker `/api/fortune`) ยังใช้ถ้อยคำนุ่มนวล โหมดตรงจึงเรียบเรียงในเครื่องเท่านั้น ต้องปรับ prompt ฝั่ง Worker หลังอนุมัติ
4. ความหมายในคลังความรู้ (`*-kb.js`, `i18n/*-kb-*.js`) ของจุดที่ไม่ดียังเขียนแบบนุ่มนวล โหมดตรงเพิ่มประโยคนำแบบตรงก่อนความหมายนั้น
   ถ้าต้องการให้ตรงทั้งประโยค ต้องเขียนความหมายด้านไม่ดีเพิ่มต่อศาสตร์ (งานใหญ่ ควรให้ผู้รู้ภาษาไทย/จีนตรวจตาม docs/FORTUNE-REVIEW.md)
5. ศาสตร์ที่เอนจินไม่ระบุจุดไม่ดีเลย (ใบหน้า ลายมือ เซียมซี ฮวงจุ้ย โหราศาสตร์ตะวันตก ฝัน) โหมดตรงจึงยังเหมือนเดิม
6. ให้ผู้รู้ภาษา (ไทย/จีน) ตรวจถ้อยคำโหมดตรงตาม docs/FORTUNE-REVIEW.md ก่อนเปิดจริง และเพิ่มข้อสังเกต PDPA (การยืนยันอายุเก็บในเครื่องเท่านั้น)

### ฉ. เรื่องที่ขอให้เจ้าของตัดสิน

1. **โรคทั่วไป:** โหมดตรงยังตัดการทำนายว่าจะป่วย (ไม่ใช่แค่โรคร้ายระยะสุดท้าย) อนุญาตเฉพาะ "นิสัยการดูแลสุขภาพ" เช่น ร่างกายอ่อนล้าง่าย
   เข้มกว่าคำสั่ง ถ้าต้องการให้บอก "มีเกณฑ์เจ็บป่วยเล็กน้อย" ได้ ต้องอนุมัติเพิ่ม
2. **อุบัติเหตุ:** "ควรระวังอุบัติเหตุ" ได้ แต่ชนิดเฉพาะ (รถชน / car crash / 车祸) ถูกตัดเสมอแม้ไม่ระบุวัน (เข้มกว่าคำสั่งเล็กน้อย)
3. **การนอกใจ/การเลิกรา:** ยังตัดการทำนายว่าคู่จะนอกใจหรือจะเลิกกัน (นับเป็นการอ่านการโกหก/ความลับของอีกฝ่าย) อนุญาต "ทะเลาะ ขัดแย้ง ห่างเหิน"
4. **การยืนยันอายุ:** เป็นช่องติ๊กยืนยันเอง (ไม่ได้ตรวจบัตร) เก็บในเครื่องเท่านั้น
5. **ส่วน B กาลามสูตร:** ข้อความเตือนใจท้ายคำอ่านที่กล่าวถึง "กาลามสูตร / Kalama Sutta / 《卡拉玛经》" ยังคงไว้ เพราะเป็นข้อความเตือนให้ใช้วิจารณญาณ
   ไม่ใช่แหล่งที่มาของคำทำนาย และชุดทดสอบเดิมกำหนดไว้ ถ้าต้องการให้ถอดด้วย ขอคำสั่ง

---

## English

### (a) Proposed CLAUDE.md rule text

Replace "Fortune hard bans: no predictions of death, illness, accident, disaster or infidelity; no lottery numbers; no medical or
cosmetic advice." with:

> - Fortune readings (owner decision 2026-11-12): readings state unfavourable results plainly when the discipline's rules produce
>   them: weak periods; what to be careful about in money, work, relationships, health habits and travel; conflict, obstacles, loss
>   and ill-wishers. Plain wording is offered as "read it straight / ดูตรง ๆ / 直说" to users who confirm they are 18 or older,
>   remembered per device; anyone who has not confirmed, or who switches it off, gets the gentler wording.
>   Hard limits in every mode, each with tests in TH/EN/ZH:
>   1. no prediction of death, terminal illness or a specific accident stated as certain or dated;
>   2. no instruction to stop medication or treatment, to make a specific investment, or to end a relationship;
>   3. the crisis net always takes priority; straight mode never bypasses it;
>   4. no wording that says the bad result will happen unless the user pays or performs something (no fear-selling; see
>      Remedies and merit).
>   Also: no lottery numbers; no medical or cosmetic advice; no emotion or deception inference.

### (b) What was built (behind the flag, off)

- `fortune-straight.js` (new, loaded before `fortune-ai.js` on the 15 reading pages): hard limits, the plain-negative phrases straight
  mode lets through, the straight lead lexicon (TH/EN/ZH), the per-device choice (`localStorage["lq-fortune-straight"]`) and the control
  (adult confirmation checkbox, then "Read it straight", on by default once confirmed).
- `fortune-ai.js`: `compose()` resolves the mode first; in straight mode a crisis signal returns the support card before anything else.
  `interpret()` keeps its crisis check first; straight readings are composed on the device only (the AI writing assistant stays gentle).
- Hard limits (1)(2)(4) apply in **both** modes. The gentle filter is otherwise unchanged, except one bug fix: plural "accidents" used to
  pass the English filter; it is now blocked (no existing reading used it, so nothing visible changed).
- Straight mode does not invent events the discipline did not produce: the lead says the finding is unfavourable by the tradition's rules
  and names the area (money / work / love) of the section, then a practical step always follows. When the unfavourable finding has no
  overview meaning (e.g. Taksa kalakini, advice only), straight mode still names it.

### (c) Numbers (synthetic: engine-built facts, no real users)

Same table as the Thai section: 60/60 hard-limit probes blocked in both modes; 27/27 crisis checks show the support card with straight
on; 12/12 plain negatives let through (gentle hides 6/12); 80/84 straight readings (95 %, target ≥ 90 %) state the negative plainly and differ from gentle; 0 of 3,271 straight sentences hit a hard limit or fail the straight filter;
every plain negative followed by a step, no fear-selling or paid-merit wording; flag off: 540/540 readings identical to before.

### (d) Deferred, and why

1. Switching the flag on: waits for the owner's approval of this text and the examples.
2. The "principle: positive content only" lines on fortune pages, sales material and legal docs would be wrong in straight mode; they
   change together with the switch (a change to what users see about claims, so not before approval).
3. The AI writing assistant (Worker `/api/fortune`) prompt is still gentle; straight readings are local only until the prompt is updated.
4. Knowledge-base meanings of unfavourable findings are still written gently; straight mode adds a plain lead before them. Fully plain
   sentences need new per-discipline negative meanings and a native-speaker review (docs/FORTUNE-REVIEW.md).
5. Face, palm, siam si, feng shui, Western astrology and dream engines never mark a finding unfavourable, so straight mode reads the same there.
6. Native-speaker review of the straight wording before launch; a PDPA note (the age confirmation is self-declared and stays on the device).

### (e) Owner decisions requested

1. Ordinary illness: straight mode still blocks predictions of getting ill (not only terminal illness); only health habits ("tire easily")
   are allowed. Stricter than the order; say if "minor illness" may be stated.
2. Accidents: "be careful of accidents" is allowed; specific types (car crash / รถชน / 车祸) are always blocked even undated.
3. Infidelity and break-up predictions stay blocked (they read a partner's secrets or deception); conflict and distance are allowed.
4. The age confirmation is a self-declared checkbox stored on the device.
5. Part B, Kalama Sutta: the closing reminder that names the Kalama Sutta is kept (it is the "use your own judgement" reminder, not a
   source of the reading, and existing tests require it). Say if it should go too.

### Hard limits: what each one stops (probe sentences from tests/unit/fortune-honest.test.js)

| Limit | TH | EN | ZH |
|---|---|---|---|
| (1) death | ปีหน้าคุณจะเสียชีวิต | you will die next year | 你明年会去世 |
| (1) terminal illness | มีเกณฑ์ป่วยเป็นมะเร็งระยะสุดท้าย | you may develop a terminal illness | 你可能患上绝症 |
| (1) accident certain/dated | วันที่ 15 เดือนหน้าคุณจะประสบอุบัติเหตุรถชน | On 3 March you will have a car accident | 下个月15日你一定会出车祸 |
| (2) stop medication | หยุดกินยาที่หมอสั่งได้เลย | stop taking your medication | 可以停药了 |
| (2) specific investment | ควรนำเงินเก็บไปลงทุนซื้อหุ้นตัวนี้ | you should invest in gold now | 你应该买入这只股票 |
| (2) end a relationship | ควรเลิกกับแฟนคนนี้ | you should break up with your partner | 你应该和他分手 |
| (3) crisis first | ช่วงนี้อยากตาย ดวงจะดีขึ้นไหม → การ์ดช่วยเหลือ | I want to end my life… → support card | 活着好累… → 求助卡片 |
| (4) fear-selling | ถ้าไม่ทำบุญแก้ชง เรื่องร้ายจะเกิดกับคุณ | unless you make an offering, this loss will happen | 如果不化解，这次破财一定会发生 |
| lottery | เลขเด็ดงวดนี้ 25 | your lucky lottery numbers are 12 and 34 | 这期彩票号码是 25 |
| medical / cosmetic | ควรเสริมจมูกเพื่อเสริมดวง | get a nose job to improve your luck | 去隆鼻可以改运 |
| emotion / deception | แฟนของคุณกำลังโกหกคุณ | your face shows that you are sad and stressed | 你的伴侣在骗你 |

Allowed in straight mode (blocked by the gentle filter today, marked *): ช่วงนี้ดวงตก งานมีอุปสรรค…*, การเดินทางช่วงนี้ควรระวังอุบัติเหตุและของหาย*,
"Bad luck at work this month: obstacles, delays and people who wish you ill."*, "Be careful when travelling: there is a risk of accidents
or lost belongings."*, 出行要小心意外和丢失财物。*, 工作上阻碍多，要提防小人。

### Tests and evidence

- Fixed tests written and locked **before** building: `tests/unit/fortune-honest.test.js` (13 tests) and
  `tests/e2e/fortune-straight.e2e.mjs` (5 checks); sha256 in `~/LENSIQ-field/evals/fortune-honest/locked.sha256` (unchanged since).
- First run before building: 0/13 pass (`run-0-before-build.log`); after: 13/13 and 5/5.
- Examples: `node tools/fortune-honest-examples.mjs` (copy of this run: `~/LENSIQ-field/evals/fortune-honest/examples-2026-11-12.md`).

---

## Examples (generated by the real code path, fixed inputs, 2026-11-12)

### 1. bazi · TH · topic money

Input: `factsFor("bazi", 3, lcg(2430))`, seed 11. Unfavourable finding(s) by the discipline's rules: ธาตุไม้น้อยที่สุด.

**Before (today, gentle):**

> [ภาพรวม] เจ้าชะตาแข็งแรงสะท้อนว่าพลังของตัวคุณเองค่อนข้างเต็ม คุณจึงมีแรงผลักดันและพึ่งตัวเองได้ดี ตำราชี้ว่ามีบางเรื่องที่ควรระมัดระวังในช่วงนี้ จากธาตุไม้น้อยที่สุด พลังของการเริ่มต้นใหม่ยังน้อย บางครั้งอาจลังเลก่อนก้าวแรก วิธีปรับตามตำราคือเลือกสีเหลืองหรือน้ำตาล จัดกิจวัตรให้สม่ำเสมอ และลองทำสวนหรือทำอาหารเอง

**After (straight):**

> [ภาพรวม] เจ้าชะตาแข็งแรงสะท้อนว่าพลังของตัวคุณเองค่อนข้างเต็ม คุณจึงมีแรงผลักดันและพึ่งตัวเองได้ดี พูดกันตรง ๆ ดวงของคุณมีจุดที่ตามหลักของศาสตร์นี้นับเป็นผลไม่ดี และทำให้ดวงอ่อนลงในช่วงนี้ จากธาตุไม้น้อยที่สุด พลังของการเริ่มต้นใหม่ยังน้อย บางครั้งอาจลังเลก่อนก้าวแรก สิ่งที่ควรทำตามตำราคือเลือกสีเหลืองหรือน้ำตาล จัดกิจวัตรให้สม่ำเสมอ และลองทำสวนหรือทำอาหารเอง

Hard limit hit in the straight text: none · sentences failing the straight filter: 0

### 2. taksa · TH · topic overall

Input: `factsFor("taksa", 0, lcg(2531))`, seed 12. Unfavourable finding(s) by the discipline's rules: ภูมิกาลกิณี (ดาวจันทร์).

**Before (today, gentle):**

> [ภาพรวม] ทักษาของคุณเริ่มนับจากดาววันเกิด แล้วไล่ดูภูมิที่ส่งเสริมและภูมิที่ควรระวัง ใจความหลักของผลครั้งนี้คือดาวอังคาร และภูมิศรีคือดาวพฤหัสบดี ในอีกมุมหนึ่ง ดาวอังคาร (วันอังคาร) ตำราอ่านว่าคุณมีพลังของความกล้าและความขยันเป็นพื้นฐาน
>
> [ภาพรวม] จากมหาทักษาดาวราหู (ภูมิมูละ) ว่ากันว่าช่วงอายุ 54–66 ปีอยู่ในมหาทักษาของดาวราหู ซึ่งเด่นเรื่องความทะเยอทะยานและการเปลี่ยนแปลง ภูมิศรี (ดาวพฤหัสบดี) สื่อว่าโชคและความเป็นสิริมงคลด้านทรัพย์มาจากดาวพฤหัสบดี สีประจำดาวคือสีส้ม ถ้าค่อย ๆ ใช้จุดแข็งเหล่านี้ เรื่องชีวิตจะราบรื่นขึ้นทีละขั้น

**After (straight):**

> [ภาพรวม] พูดกันตรง ๆ ดวงของคุณมีจุดที่ตามหลักของศาสตร์นี้นับเป็นผลไม่ดี และทำให้ดวงอ่อนลงในช่วงนี้ จุดนั้นคือภูมิกาลกิณี (ดาวจันทร์) สิ่งที่ควรทำคือนอนให้พอ ขยับร่างกายเบา ๆ ทุกวัน และพักสายตาจากจอเป็นระยะ เรื่องชีวิตไม่ต้องรีบ ทำสม่ำเสมอจะเห็นผลชัดกว่า
>
> [ภาพรวม] ทักษาของคุณเริ่มนับจากดาววันเกิด แล้วไล่ดูภูมิที่ส่งเสริมและภูมิที่ควรระวัง ใจความหลักของผลครั้งนี้คือดาวอังคาร และภูมิศรีคือดาวพฤหัสบดี

Hard limit hit in the straight text: none · sentences failing the straight filter: 0

### 3. lek7 · TH · topic work

Input: `factsFor("lek7", 2, lcg(2430))`, seed 13. Unfavourable finding(s) by the discipline's rules: ภพปุตตะ ได้ 9.

**Before (today, gentle):**

> [ภาพรวม] ในส่วนของฐานรวม พบภพตนุ ได้ 11 ตามความเชื่อหมายถึงเรื่องตัวตน ความมั่นใจ และภาพที่คนอื่นมองเห็นมีพลังพอดี ดูแลไปตามจังหวะปกติได้ ช่วงนี้ตำรามองว่าเป็นจังหวะที่ควรเดินอย่างรอบคอบ สำหรับภพปุตตะ ได้ 9 (ช่องที่ 5 ของฐานรวม) ผังเลขชี้ว่าด้านปุตตะ (ความรัก ความสุข และงานสร้างสรรค์) ยังมีพลังน้อย จึงควรค่อย ๆ เติม ข้อแนะนำทั่วไปคือกันเวลาคุยกันแบบไม่ดูโทรศัพท์วันละสิบห้านาที และบอกขอบคุณในเรื่องเล็ก ๆ

**After (straight):**

> [ภาพรวม] ในส่วนของฐานรวม พบภพตนุ ได้ 11 ตามความเชื่อหมายถึงเรื่องตัวตน ความมั่นใจ และภาพที่คนอื่นมองเห็นมีพลังพอดี ดูแลไปตามจังหวะปกติได้ ตามหลักของศาสตร์นี้ มีผลที่ไม่ดีอยู่ในดวง ช่วงนี้ดวงอ่อนและมีอุปสรรคมากกว่าปกติ สำหรับภพปุตตะ ได้ 9 (ช่องที่ 5 ของฐานรวม) ผังเลขชี้ว่าด้านปุตตะ (ความรัก ความสุข และงานสร้างสรรค์) ยังมีพลังน้อย จึงควรค่อย ๆ เติม สิ่งที่ควรทำคือกันเวลาคุยกันแบบไม่ดูโทรศัพท์วันละสิบห้านาที และบอกขอบคุณในเรื่องเล็ก ๆ

Hard limit hit in the straight text: none · sentences failing the straight filter: 0

### 4. zodiac · TH · topic love

Input: `factsFor("zodiac", 9, lcg(2632))`, seed 14. Unfavourable finding(s) by the discipline's rules: ผั่วในปีมะเมีย.

**Before (today, gentle):**

> [ภาพรวม] นักษัตรประจำตัวของคุณกับธาตุของปีนี้ช่วยบอกจังหวะที่ควรใช้ ใจความหลักของผลครั้งนี้คือชาวปีเถาะในปีมะเมีย (ม้า) ธาตุไฟ และผั่ว ตำราชี้ว่ามีบางเรื่องที่ควรระมัดระวังในช่วงนี้ เมื่อดูที่ผั่วในปีมะเมีย ปีนี้กิ่งปีเป็นคู่ผั่วกับปีเกิดของคุณ ตามความเชื่อหมายถึงปีที่แผนอาจต้องปรับระหว่างทาง ความยืดหยุ่นจึงเป็นจุดแข็ง ข้อแนะนำทั่วไปคือเลือกงานที่สำคัญที่สุดวันละหนึ่งเรื่องแล้วทำให้เสร็จก่อนเที่ยง
>
> [ความรักและความสัมพันธ์] มาถึงเรื่องความรักที่คุณถาม ตำราดูจากปีผั่วกับชาวปีเถาะ ตำรามองว่าเป็นช่วงที่ควรใจเย็นกับกันและกัน จากปีผั่ว ความรักดีเมื่อยอมรับการเปลี่ยนแปลงของกันและกัน ข้อแนะนำทั่วไปคือกันเวลาคุยกันแบบไม่ดูโทรศัพท์วันละสิบห้านาที และบอกขอบคุณในเรื่องเล็ก ๆ ต่อจากนั้น ทำกิจกรรมใหม่ ๆ ร่วมกันเพื่อเติมความสดใส

**After (straight):**

> [ภาพรวม] นักษัตรประจำตัวของคุณกับธาตุของปีนี้ช่วยบอกจังหวะที่ควรใช้ ใจความหลักของผลครั้งนี้คือชาวปีเถาะในปีมะเมีย (ม้า) ธาตุไฟ และผั่ว พูดกันตรง ๆ ดวงของคุณมีจุดที่ตามหลักของศาสตร์นี้นับเป็นผลไม่ดี และทำให้ดวงอ่อนลงในช่วงนี้ เมื่อดูที่ผั่วในปีมะเมีย ปีนี้กิ่งปีเป็นคู่ผั่วกับปีเกิดของคุณ ตามความเชื่อหมายถึงปีที่แผนอาจต้องปรับระหว่างทาง ความยืดหยุ่นจึงเป็นจุดแข็ง สิ่งที่ควรทำคือเลือกงานที่สำคัญที่สุดวันละหนึ่งเรื่องแล้วทำให้เสร็จก่อนเที่ยง
>
> [ความรักและความสัมพันธ์] มาถึงเรื่องความรักที่คุณถาม ตำราดูจากปีผั่วกับชาวปีเถาะ ตามหลักของศาสตร์นี้ เรื่องหัวใจช่วงนี้ดวงอ่อน ขัดแย้งและห่างเหินกันได้ง่าย จากปีผั่ว ความรักดีเมื่อยอมรับการเปลี่ยนแปลงของกันและกัน สิ่งที่ควรทำคือกันเวลาคุยกันแบบไม่ดูโทรศัพท์วันละสิบห้านาที และบอกขอบคุณในเรื่องเล็ก ๆ ต่อจากนั้น ทำกิจกรรมใหม่ ๆ ร่วมกันเพื่อเติมความสดใส

Hard limit hit in the straight text: none · sentences failing the straight filter: 0

### 5. horoscope · TH · topic overall

Input: `factsFor("horoscope", 0, lcg(2935))`, seed 15. Unfavourable finding(s) by the discipline's rules: ธาตุไฟน้อย.

**Before (today, gentle):**

> [ภาพรวม] ดูที่ปาจื้อ (ผังธาตุจากปี เดือน วัน และเวลาเกิดตามตำราจีน) ซึ่งเป็นธาตุประจำตัวน้ำหยิน กุ่ย (癸) ตามตำราเชื่อว่าคุณละเอียดอ่อน ช่างสังเกต และหล่อเลี้ยงคนรอบตัวเหมือนสายฝนและน้ำค้าง ด้วยราศีเมษ คนรอบตัวมักสัมผัสได้ว่าคุณกล้าคิดกล้าทำแบบนักบุกเบิกที่มีดาวอังคารเป็นเจ้าเรือน ตำราชี้ว่ามีบางเรื่องที่ควรระมัดระวังในช่วงนี้ ธาตุไฟน้อย (แทบไม่พบธาตุไฟในดวง) ตำราอ่านว่าอาจเก็บความรู้สึกไว้มากกว่าแสดงออก วิธีปรับตามตำราคือเลือกสีแดงหรือส้มบ้าง รับแดดยามเช้า และนัดพบเพื่อนที่ทำให้มีพลัง
>
> [มิตรภาพและผู้คนรอบตัว] ในวงสังคม ผลครั้งนี้มีภาพที่ชัดอยู่สองสามข้อ จากวันเกิดศุกร์ คุณเป็นคนที่ใคร ๆ ก็อยากชวนไปงานเลี้ยง เพราะอยู่ด้วยแล้วสบายใจ ธาตุน้ำหยินตีความได้ว่าคุณเป็นคนที่เพื่อนรู้สึกปลอดภัยเมื่อเล่าเรื่องในใจ ดูที่ราศีเมษ คุณเป็นคนที่ชวนเพื่อนออกไปทำสิ่งใหม่ ๆ อยู่เสมอ

**After (straight):**

> [ภาพรวม] ดูที่ปาจื้อ (ผังธาตุจากปี เดือน วัน และเวลาเกิดตามตำราจีน) ซึ่งเป็นธาตุประจำตัวน้ำหยิน กุ่ย (癸) ตามตำราเชื่อว่าคุณละเอียดอ่อน ช่างสังเกต และหล่อเลี้ยงคนรอบตัวเหมือนสายฝนและน้ำค้าง ด้วยราศีเมษ คนรอบตัวมักสัมผัสได้ว่าคุณกล้าคิดกล้าทำแบบนักบุกเบิกที่มีดาวอังคารเป็นเจ้าเรือน พูดกันตรง ๆ ดวงของคุณมีจุดที่ตามหลักของศาสตร์นี้นับเป็นผลไม่ดี และทำให้ดวงอ่อนลงในช่วงนี้ ธาตุไฟน้อย (แทบไม่พบธาตุไฟในดวง) ตำราอ่านว่าอาจเก็บความรู้สึกไว้มากกว่าแสดงออก สิ่งที่ควรทำตามตำราคือเลือกสีแดงหรือส้มบ้าง รับแดดยามเช้า และนัดพบเพื่อนที่ทำให้มีพลัง

Hard limit hit in the straight text: none · sentences failing the straight filter: 0

### 6. numbers · TH · topic work

Input: `factsFor("numbers", 2, lcg(2733))`, seed 16. Unfavourable finding(s) by the discipline's rules: คู่ 25 (คู่ใจดีคิดมาก); คู่ 12 (คู่ใจดีลังเล).

**Before (today, gentle):**

> [ภาพรวม] จากผลรวม 43 (คู่นักพูดนักลุย) คุณเหมาะกับงานที่ต้องตัดสินใจไวและแก้ปัญหาเฉพาะหน้า ทอนเป็นเลขโดดได้ 7 (พระเสาร์) หมายถึงความอดทนรับผิดชอบ ในส่วนของรูปแบบตัวเลข พบไม่มีเลข 0 ในช่วงที่อ่าน (ตำราเลขศาสตร์มองเลข 0 เป็นช่องว่างของพลัง) ตามความเชื่อหมายถึงคุณไม่ค่อยทิ้งงานกลางทาง เริ่มแล้วมักไปให้ถึงปลายทาง ช่วงนี้ตำรามองว่าเป็นจังหวะที่ควรเดินอย่างรอบคอบ คู่ 25 (คู่ใจดีคิดมาก) สื่อว่าคุณใจดี มีเมตตา เป็นผู้ฟังที่ดี ข้อแนะนำทั่วไปคือทักทายเพื่อนเก่าหนึ่งคนในสัปดาห์นี้ และรับฟังให้มากกว่าพูด
>
> [ความรักและความสัมพันธ์] มาถึงเรื่องความรัก ช่วงนี้ตำราชี้ว่าความสัมพันธ์อาจต้องการความเข้าใจมากขึ้น ดูที่คู่เลข พบคู่ 12 (คู่ใจดีลังเล) ชี้ว่าคุณเป็นคนใจดี มักช่วยเหลือคนอื่นก่อนตัวเอง ข้อแนะนำทั่วไปคือกันเวลาคุยกันแบบไม่ดูโทรศัพท์วันละสิบห้านาที และบอกขอบคุณในเรื่องเล็ก ๆ

**After (straight):**

> [ภาพรวม] จากผลรวม 43 (คู่นักพูดนักลุย) คุณเหมาะกับงานที่ต้องตัดสินใจไวและแก้ปัญหาเฉพาะหน้า ทอนเป็นเลขโดดได้ 7 (พระเสาร์) หมายถึงความอดทนรับผิดชอบ ในส่วนของรูปแบบตัวเลข พบไม่มีเลข 0 ในช่วงที่อ่าน (ตำราเลขศาสตร์มองเลข 0 เป็นช่องว่างของพลัง) ตามความเชื่อหมายถึงคุณไม่ค่อยทิ้งงานกลางทาง เริ่มแล้วมักไปให้ถึงปลายทาง ตามหลักของศาสตร์นี้ มีผลที่ไม่ดีอยู่ในดวง ช่วงนี้ดวงอ่อนและมีอุปสรรคมากกว่าปกติ คู่ 25 (คู่ใจดีคิดมาก) สื่อว่าคุณใจดี มีเมตตา เป็นผู้ฟังที่ดี สิ่งที่ควรทำคือทักทายเพื่อนเก่าหนึ่งคนในสัปดาห์นี้ และรับฟังให้มากกว่าพูด
>
> [ความรักและความสัมพันธ์] มาถึงเรื่องความรัก พูดกันตรง ๆ ความสัมพันธ์ช่วงนี้มีเกณฑ์ทะเลาะหรือผิดใจกัน ดูที่คู่เลข พบคู่ 12 (คู่ใจดีลังเล) ชี้ว่าคุณเป็นคนใจดี มักช่วยเหลือคนอื่นก่อนตัวเอง สิ่งที่ควรทำคือกันเวลาคุยกันแบบไม่ดูโทรศัพท์วันละสิบห้านาที และบอกขอบคุณในเรื่องเล็ก ๆ

Hard limit hit in the straight text: none · sentences failing the straight filter: 0

### 7. tarot · EN · topic love

Input: `factsFor("tarot", 1, lcg(2531))`, seed 17. Unfavourable finding(s) by the discipline's rules: เก้าดาบ (Nine of Swords).

**Before (today, gentle):**

> [Overview] The first of these shows that you are weighing two paths, so calmly open your eyes and take in all the information. The traditional reading points to a few things that call for a little extra care at the moment. As for the second, your mind may be wearing itself out with spinning thoughts, and talking with someone you trust lightens your heart. A simple adjustment: write your worries on paper, sort them into what you can and can't control, and start with one thing you can control. As for the Fool card (reversed), part of you is eager to set off, but your plans could use one more careful look. Love gets the most detail in this reading, so read on below.
>
> [Love and relationships] In matters of the heart, tradition sees this as a time for patience with each other. When it comes to the Nine of Swords, talking with the other person about what worries you shows that reality is often lighter than you imagined. This is a good time to write your worries on paper and deal with them one at a time. Turning to the Fool card, your relationship can slow down a little so the two of you get to know each other before deciding anything. Treat this reading as a reference, and let your own judgement have the final say.

**After (straight):**

> [Overview] The first of these shows that you are weighing two paths, so calmly open your eyes and take in all the information. To put it plainly, your chart has a weak patch here, and by the tradition's rules it counts as an unfavourable result. As for the second, your mind may be wearing itself out with spinning thoughts, and talking with someone you trust lightens your heart. Try this simple adjustment: write your worries on paper, sort them into what you can and can't control, and start with one thing you can control. As for the Fool card (reversed), part of you is eager to set off, but your plans could use one more careful look. Love gets the most detail in this reading, so read on below.
>
> [Love and relationships] Straight answer: matters of the heart are in a weak period, and conflict or distance can build up. When it comes to the Nine of Swords, talking with the other person about what worries you shows that reality is often lighter than you imagined. Try this: this is a good time to write your worries on paper and deal with them one at a time. Turning to the Fool card, your relationship can slow down a little so the two of you get to know each other before deciding anything. Treat this reading as a reference, and let your own judgement have the final say.

Hard limit hit in the straight text: none · sentences failing the straight filter: 0

### 8. bazi · EN · topic work

Input: `factsFor("bazi", 2, lcg(2430))`, seed 18. Unfavourable finding(s) by the discipline's rules: เจ้าชะตาต้องการแรงหนุน; ธาตุไม้น้อยที่สุด.

**Before (today, gentle):**

> [Overview] The first of these shows that you observe closely and think deeply, and like dew you slowly reach people's hearts. In BaZi (the Four Pillars of year, month, day and hour), your Day Master is the heavenly stem of your birth day and stands for you yourself. The traditional reading points to a few things that call for a little extra care at the moment. A Day Master that welcomes support is where it pays to slow down a little: traditionally, your own element could use more support, so at times you may feel you are carrying a lot on your own. In BaZi, Day Master strength describes how much support your own element receives from the rest of your chart. A simple adjustment: get enough sleep, move gently every day, and give your eyes regular breaks from screens. Work gets the most detail in this reading, so read on below.

**After (straight):**

> [Overview] The first of these shows that you observe closely and think deeply, and like dew you slowly reach people's hearts. In BaZi (the Four Pillars of year, month, day and hour), your Day Master is the heavenly stem of your birth day and stands for you yourself. To put it plainly, your chart has a weak patch here, and by the tradition's rules it counts as an unfavourable result. A Day Master that welcomes support is where it pays to slow down a little: traditionally, your own element could use more support, so at times you may feel you are carrying a lot on your own. In BaZi, Day Master strength describes how much support your own element receives from the rest of your chart. Try this simple adjustment: get enough sleep, move gently every day, and give your eyes regular breaks from screens. Work gets the most detail in this reading, so read on below.

Hard limit hit in the straight text: none · sentences failing the straight filter: 0

### 9. zodiac · ZH · topic money

Input: `factsFor("zodiac", 11, lcg(2632))`, seed 19. Unfavourable finding(s) by the discipline's rules: ไห่ในปีมะเมีย.

**Before (today, gentle):**

> [总览] 把你的生肖和今年的流年放在一起看，就能看出该进还是该缓。这次的重点在害太岁和生肖牛（丑牛）。这段时间宜稳一点，凡事多想一步。
>
> [总览] 前者显示，按传统说法这一年与你的生肖相害，要多留意说话和小误会。调整的方法是：每天挑一件最重要的事，在中午前完成。后者则说明，你稳重踏实说到做到，身边的人都信任你。

**After (straight):**

> [总览] 把你的生肖和今年的流年放在一起看，就能看出该进还是该缓。这次的重点在害太岁和生肖牛（丑牛）。照直讲，按这门命理的规则，命盘里有不利的一项，这段时间阻碍会比平时多。前者显示，按传统说法这一年与你的生肖相害，要多留意说话和小误会。建议这样调整：每天挑一件最重要的事，在中午前完成。
>
> [财运] 财运方面，这次主要看害太岁之年和生肖牛。直说吧，这段时间财运低迷，容易破财或有计划外的开支。害太岁之年还说明，替人担保或资金往来要谨慎，一切写清楚。建议这样调整：定一个每周预算，每天简单记账，先存再花。害太岁之年这边，自己做计划而不是被人劝着做决定，财务会更稳。

Hard limit hit in the straight text: none · sentences failing the straight filter: 0

### 10. horoscope · ZH · topic overall

Input: `factsFor("horoscope", 0, lcg(2935))`, seed 20. Unfavourable finding(s) by the discipline's rules: ธาตุไฟน้อย.

**Before (today, gentle):**

> [总览] 至于后者，日主是八字里代表你本人的那个字，你的日主是癸水。你出生时太阳位于白羊座。生命灵数 1 这一点说明，把出生年月日的数字相加再化简，就得到这个数。
>
> [总览] 这段时间宜稳一点，凡事多想一步。需要多留意的是五行火偏少：你可能常把感受藏在心里，较少表达出来。调整的方法是：按传统说法适当用红色或橙色，早上晒晒太阳，和让你有活力的朋友见面。

**After (straight):**

> [总览] 至于后者，日主是八字里代表你本人的那个字，你的日主是癸水。你出生时太阳位于白羊座。生命灵数 1 这一点说明，把出生年月日的数字相加再化简，就得到这个数。照直讲，按这门命理的规则，命盘里有不利的一项，这段时间阻碍会比平时多。需要多留意的是五行火偏少：你可能常把感受藏在心里，较少表达出来。建议这样调整：按传统说法适当用红色或橙色，早上晒晒太阳，和让你有活力的朋友见面。
>
> [性格与自我] 性格方面，这次主要看周五生人和癸水。周五生人的另一层意思是，你有魅力、爱美，到哪里都能营造温暖的氛围。

Hard limit hit in the straight text: none · sentences failing the straight filter: 0

### Gentle-mode example (flag on, adult NOT confirmed) · bazi · TH · topic money

Same input as example 1. Mode: gentle; identical to today's gentle reading: yes.

> [ภาพรวม] ดวงแปดอักษรดูทั้งด้านที่ส่งเสริมและด้านที่ควรเติม ของคุณก็มีทั้งสองด้าน ใจความหลักของผลครั้งนี้คือแปดอักษร 壬申 乙巳 丁酉 丙午 และเจ้าชะตาไฟ จากไฟหยิน (ติง 丁) ชี้ว่าคุณละเอียดอ่อน มีสมาธิ และให้ความอบอุ่นแบบเทียนที่ส่องทาง จากวัยจร 戊申 ช่วงวัยนี้เด่นเรื่องการแสดงฝีมือ ความคิดสร้างสรรค์ และการสื่อสาร

