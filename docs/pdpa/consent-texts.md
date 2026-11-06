# Consent and notice texts (Thai / English)

Ready-to-adapt wording. Replace `[ชื่อร้าน / Store name]`, `[ช่องทางติดต่อ / contact]` and the other brackets. *Not legal advice. Have counsel review the final wording.* Keep each consent **separate** from terms of sale, and make it **voluntary**: refusing must not block the purchase or service.

For each consent, keep a record of when it was given, which text version was shown, and by whom (the operator for kiosk sign-ups). `customers.js` stores `consentAt` per member. For other modules, log it on paper or in your CRM.

---

## 1. Notice sign: camera analytics (store / booth / signage counting)

Post the sign at every entrance and next to each camera, at eye level, at A4 size or larger.

**TH**

> **พื้นที่นี้ใช้กล้องวิเคราะห์ข้อมูล**
> [ชื่อร้าน] ใช้กล้องเพื่อ **นับจำนวนผู้เข้าชม เวลาที่ใช้ในพื้นที่ และความยาวคิว** เพื่อปรับปรุงการให้บริการ
> • ระบบประมวลผลภาพบนอุปกรณ์ในร้าน **ไม่บันทึกภาพหรือวิดีโอ** และไม่ระบุตัวตนบุคคล
> • เก็บเฉพาะตัวเลขสถิติ เช่น จำนวนคนต่อชั่วโมง เป็นเวลา [13 เดือน]
> • ฐานทางกฎหมาย: ประโยชน์โดยชอบด้วยกฎหมาย (มาตรา 24(5) พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562)
> • สอบถาม/คัดค้าน: [ช่องทางติดต่อ] · อ่านประกาศความเป็นส่วนตัวฉบับเต็ม: [URL/QR]

**EN**

> **Camera analytics in use**
> [Store name] uses cameras to **count visitors, time spent in this area and queue length** to improve our service.
> • Images are processed on our in-store device. **No images or video are recorded**, and no one is identified.
> • Only statistics (e.g. visitors per hour) are kept, for [13 months].
> • Legal basis: legitimate interest (s.24(5), Personal Data Protection Act B.E. 2562).
> • Questions or objections: [contact] · Full privacy notice: [URL/QR]

*If signage age/gender estimation or booth expression/repeat-visitor matching is enabled, add this line:*
TH: "ระบบประมาณช่วงอายุ เพศ หรือสีหน้าโดยอัตโนมัติเพื่อสถิติรวม ไม่จดจำตัวบุคคลข้ามวัน ผลอาจคลาดเคลื่อน"
EN: "The system automatically estimates age range, gender or facial expression for aggregate statistics only. It does not recognise individuals across days. Estimates may be inaccurate."

---

## 2. Explicit biometric consent: customer recognition (`customers.html`)

Biometric data is sensitive data (s.26), so explicit consent is required. Show this on the enrolment screen or on a signed paper form. Always offer the alternative of looking the member up by phone number.

**TH**

> **ความยินยอมในการเก็บและใช้ข้อมูลชีวมิติจากใบหน้า**
> ข้าพเจ้ายินยอมโดยสมัครใจให้ [ชื่อร้าน] เก็บ **ค่าตัวเลขลักษณะใบหน้า (ข้อมูลชีวมิติ)** ซึ่งไม่ใช่รูปถ่าย ร่วมกับชื่อ เบอร์โทร และประวัติการสั่งซื้อ เพื่อ **จดจำข้าพเจ้าเมื่อมาใช้บริการและแนะนำเมนู** เท่านั้น
> • ข้อมูลเก็บแบบเข้ารหัสในอุปกรณ์ของร้าน ไม่ส่งออกภายนอก และไม่เปิดเผยต่อบุคคลอื่น
> • ข้อมูลใบหน้าจะถูกลบอัตโนมัติเมื่อข้าพเจ้าไม่ได้มาใช้บริการเกิน [180] วัน
> • การไม่ให้ความยินยอมไม่มีผลต่อการซื้อสินค้าหรือรับบริการ (ร้านค้นหาสมาชิกด้วยเบอร์โทรแทนได้)
> • ข้าพเจ้าถอนความยินยอมและขอลบข้อมูลได้ทุกเมื่อที่ [เคาน์เตอร์/ช่องทางติดต่อ]
> ☐ ข้าพเจ้ายินยอมให้เก็บและใช้ข้อมูลชีวมิติจากใบหน้าตามข้างต้น

**EN**

> **Consent to collect and use facial biometric data**
> I voluntarily consent to [Store name] storing a **numeric facial template (biometric data)**, which is not a photograph, together with my name, phone number and order history, **solely to recognise me when I visit and to recommend menu items**.
> • The data is stored encrypted on the store's device. It is not sent elsewhere or disclosed to others.
> • My face data is deleted automatically if I do not visit for [180] days.
> • Declining does not affect purchases or service; the store can look me up by phone number instead.
> • I may withdraw consent and request deletion at any time at [counter/contact].
> ☐ I consent to the collection and use of my facial biometric data as described above.

---

## 3. Explicit biometric consent: attendance (`attendance.html`)

Provide a **manual sign-in alternative**. In employment or training contexts, consent may not be "freely given", so counsel should confirm the lawful basis.

**TH**

> ข้าพเจ้ายินยอมให้ [ผู้จัดอบรม] เก็บ **ข้อมูลชีวมิติจากใบหน้า** (ค่าตัวเลข ไม่ใช่รูปถ่าย) พร้อมชื่อและรหัสผู้เข้าอบรม เพื่อ **เช็คชื่อเข้าอบรม [ชื่อหลักสูตร]** เท่านั้น ข้อมูลเก็บเข้ารหัสในอุปกรณ์ลงทะเบียน และจะลบภายใน [30] วันหลังจบหลักสูตร ข้าพเจ้าเลือกลงชื่อด้วยวิธีปกติแทนได้ และถอนความยินยอมได้ทุกเมื่อที่ [ช่องทางติดต่อ]
> ☐ ยินยอม

**EN**

> I consent to [Organiser] storing my **facial biometric data** (a numeric template, not a photo) with my name and participant code, **solely to record attendance at [course name]**. It is stored encrypted on the registration device and deleted within [30] days after the course ends. I may use the manual sign-in instead, and may withdraw consent at any time via [contact].
> ☐ I consent

---

## 4. Emotion-analysis research consent (`neuro.html`)

**TH**: ข้าพเจ้ายินยอมให้กล้องวิเคราะห์สีหน้าระหว่างการทดสอบสื่อ ระบบประมวลผลในเครื่อง ไม่บันทึกภาพหรือวิดีโอ เก็บเฉพาะค่าตัวเลขโดยไม่ระบุชื่อ เพื่อ [วัตถุประสงค์การวิจัย] ผลเป็นการประมาณจากสีหน้า ไม่ใช่การวัดความรู้สึกภายใน และจะไม่ใช้ประเมินตัวบุคคล ☐ ยินยอม

**EN**: I consent to on-device facial-expression analysis while I view test materials. No images or video are recorded. Only anonymous numeric values are kept, for [research purpose]. Results are estimates from facial movement, not measurements of inner feelings, and will not be used to evaluate me personally. ☐ I consent

---

## 5. Photo booth / studio

**TH (ป้ายที่ตู้)**

> รูปของคุณประมวลผลบนเครื่องนี้เท่านั้น **ไม่ถูกอัปโหลดหรือบันทึก** หลังพิมพ์/ดาวน์โหลด ภาพจะถูกลบเมื่อเริ่มรอบใหม่ การถ่ายภาพถือเป็นการยินยอมให้ประมวลผลภาพเพื่อสร้างภาพถ่ายของคุณ [ถ้ามีการเก็บภาพเพื่อการตลาด ให้ขอความยินยอมแยก: ☐ ยินยอมให้ [ชื่อแบรนด์] ใช้ภาพนี้เพื่อการประชาสัมพันธ์]

**EN (booth sign)**

> Your photo is processed on this device only and is **not uploaded or stored**. It is cleared when the next session starts, after you print or download it. Taking a photo means you agree to it being processed to create your picture. [If photos are kept for marketing, ask separately: ☐ I agree that [Brand] may use this photo for promotion.]

**AI try-on (only if enabled). Cross-border consent is required before each use.**

TH: ☐ ข้าพเจ้ายินยอมให้ส่ง **รูปถ่ายของข้าพเจ้าและรูปชุด** ไปประมวลผลที่บริการ **Replicate ซึ่งตั้งอยู่ในสหรัฐอเมริกา** เพื่อสร้างภาพเปลี่ยนชุด ประเทศปลายทางอาจมีมาตรฐานคุ้มครองข้อมูลแตกต่างจากประเทศไทย ร้านไม่เก็บรูปไว้บนเซิร์ฟเวอร์ของร้าน ข้าพเจ้าไม่ยินยอมก็ยังใช้ตู้ถ่ายรูปแบบปกติได้

EN: ☐ I consent to my **photo and the garment image** being sent to **Replicate, a service located in the United States**, to generate a try-on image. The destination country may have data-protection standards different from Thailand's. The store does not keep the photo on its server. If I decline, I can still use the normal photo booth.

---

## 6. AI fortune (Claude by Anthropic)

The built-in text in `fortune-ai.js` (`CONSENT_TEXT`) already reads:

> ให้ AI ช่วยเรียบเรียงคำทำนาย — ระบบจะส่งผลวิเคราะห์และชื่อเล่น (ถ้ากรอก) ไปประมวลผลที่บริการ Claude ของ Anthropic ซึ่งตั้งอยู่ต่างประเทศ (สหรัฐอเมริกา) ไม่ส่งรูป ชื่อจริง วันเกิด หรือข้อมูลติดต่อ และไม่เก็บไว้บนเซิร์ฟเวอร์ของเรา ยกเลิกได้ทุกเมื่อ

**EN equivalent**

> Let AI word your reading. The analysis results and your nickname (if entered) are sent to the Claude service of **Anthropic, located abroad (United States)**. No photo, real name, birth date or contact details are sent, and nothing is stored on our server. You can turn this off at any time.

Suggested addition to the sign at the booth: TH "ดูดวงเพื่อความบันเทิงเท่านั้น ไม่ใช่คำแนะนำทางการเงิน สุขภาพ หรือกฎหมาย" / EN "For entertainment only. Not financial, health or legal advice."

---

## 7. Withdrawal and data-subject requests

Print this on the privacy notice and the counter card.

**TH**

> **ถอนความยินยอม / ขอลบข้อมูล** แจ้งพนักงานที่เคาน์เตอร์ หรือติดต่อ [อีเมล/โทร/LINE] ร้านจะลบข้อมูลใบหน้าทันทีเมื่อได้รับแจ้ง และลบข้อมูลอื่นที่เกี่ยวข้องภายใน [7] วัน การถอนความยินยอมไม่กระทบการประมวลผลที่ทำไปก่อนหน้า ท่านมีสิทธิขอเข้าถึง ขอสำเนา แก้ไข ลบ คัดค้าน และร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล (สคส.)

**EN**

> **Withdraw consent / request deletion**: tell staff at the counter or contact [email/phone/LINE]. We delete face data immediately on request and other related data within [7] days. Withdrawal does not affect processing carried out before it. You have the right to access, obtain a copy, correct, delete and object, and to complain to the Personal Data Protection Committee (PDPC).

**Staff procedure**

- Customers: open the member → delete face data (or delete the member).
- Attendance: delete the person.
- AI fortune: the guest unticks the consent box.
- Record the request date and completion date.
