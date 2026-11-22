# ร่างแก้ข้อ 11 และข้อ 2 (ข้อสุดท้าย) ของข้อกำหนดการใช้บริการ — ตัดสินใจ 223

> **ร่างเพื่อให้ทนายตรวจ (draft for legal review) — ยังไม่ใช้บนเว็บไซต์ จนกว่าทนายตรวจและเจ้าของอนุมัติ**
> ไฟล์นี้ไม่เปลี่ยน `terms.html` `privacy.html` `help.html` หรือหน้าใด ๆ ข้อความบนเว็บไซต์ยังเป็นฉบับปัจจุบันด้านล่าง
> (ป้าย "ฉบับร่าง — รอทนายความตรวจทาน" บนหน้าข้อกำหนดยังอยู่) ร่างนี้ใช้เมื่อทนายตรวจและเจ้าของอนุมัติเท่านั้น

ภาษา: ไทย (ต้นฉบับ) แล้ว English แล้ว 中文 · Language order: Thai (original), English, Chinese

> **ปรับ 2026-11-22 ตามตัดสินใจ 226 ของเจ้าของ / Updated 2026-11-22 for owner decision 226 / 2026-11-22 按所有者决定 226 更新:**
> เว็บไซต์ไม่แสดงป้ายสถานะใดเลย (ไม่มี “รุ่นทดลอง”) ระบบที่ยังไม่เปิดไม่แสดงให้ลูกค้าเห็น · The site shows no status label at all (no “Trial version”); a
> product that is not open is not shown · 网站不显示任何状态标签（没有“试用版”）；未开放的产品不向客户显示。

---

# ภาษาไทย

## เหตุผล

เจ้าของตัดสินใจ 223 (2026-11-21): หน้าเว็บของลูกค้าไม่เผยแพร่ตัวเลขความแม่นยำ ตาราง ชื่อชุดข้อมูล และป้ายสถานะอีกต่อไป
หน้าเครื่องมือบอกเพียงสองบรรทัดคือใช้ทำอะไรและข้อจำกัดสำคัญเป็นภาษาง่าย ๆ ตัวเลขละเอียดย้ายไปอยู่ในเอกสารเทคนิคที่ขอได้จากฝ่ายขายและในหลังบ้านของผู้ดูแล
ผลที่ตามมากับข้อกำหนด:

1. ข้อความปัจจุบันในข้อ 11 ว่า "เราเปิดเผยผลวัดบนชุดข้อมูลสาธารณะพร้อมข้อจำกัด" จะไม่เป็นจริงอีกต่อไป เพราะหน้าเว็บไม่เปิดเผยผลวัดแล้ว
2. ข้อความปัจจุบันในข้อ 2 ว่า "ฟีเจอร์ที่ยังไม่ได้วัดผลบนข้อมูลจริงแสดงป้าย “Beta”" ไม่ตรงกับเว็บไซต์อีกต่อไป ตามตัดสินใจ 226 หน้าเว็บไม่แสดงป้ายสถานะใดเลย
   (ไม่มีทั้ง “Beta” และ “รุ่นทดลอง”) ระบบที่ปิดไม่แสดงให้ลูกค้าเห็น และหน้าตรงของระบบนั้นแสดงเพียง “ระบบนี้ยังไม่เปิดให้บริการ”
   วันนี้การเปิดหรือปิดแต่ละระบบเป็นรายการใน `nav.js` ที่เปลี่ยนได้ด้วยการออกรุ่นใหม่ของเว็บไซต์
   หน้าจอหลังบ้านสำหรับให้ผู้ดูแลเปิดปิดเองเป็นขั้นที่ 2 ที่วางแผนไว้และยังไม่ได้สร้าง
3. ต้องไม่ให้ข้อกำหนดสัญญาเกินกว่าที่หน้าเว็บบอก และต้องไม่ตัดความรับผิดชอบของผู้ใช้ในการทดสอบหน้างานก่อนใช้ตัดสินใจ

## ข้อความปัจจุบัน (ตรงตาม `terms.html` วันที่ร่าง)

**ข้อ 2 รายการสุดท้าย (ภาษาไทย):**

> ฟีเจอร์ที่ยังไม่ได้วัดผลบนข้อมูลจริงแสดงป้าย “Beta” และอาจเปลี่ยนแปลงหรือยกเลิกได้

**ข้อ 11 ความพร้อมให้บริการและความแม่นยำ (สามรายการแรก ภาษาไทย):**

> เครื่องมือที่ประมวลผลในเครื่องทำงานได้แม้ออฟไลน์หลังโหลดครั้งแรก ฟีเจอร์ออนไลน์อาจหยุดชั่วคราวเพื่อบำรุงรักษา โดยจะแจ้งล่วงหน้าเท่าที่ทำได้
>
> ผลการตรวจจับ การนับ และการประมาณค่าขึ้นกับกล้อง แสง และมุมติดตั้ง เราเปิดเผยผลวัดบนชุดข้อมูลสาธารณะพร้อมข้อจำกัด และแนะนำให้ทดลองหน้างานก่อนใช้ตัวเลขในการตัดสินใจทางธุรกิจ
>
> ระดับการตอบกลับของฝ่ายสนับสนุนในแต่ละแพ็กเกจเป็นไปตามหน้าช่วยเหลือ หรือสัญญาบริการที่ลงนามแยก

(รายการที่สี่ของข้อ 11 เรื่องตรวจข้อมูลยา `medicine.html` ไม่เกี่ยวกับร่างนี้ และไม่เปลี่ยน)

## ข้อความที่เสนอ

**ข้อ 2 รายการสุดท้าย:**

> ระบบที่ยังไม่เปิดให้บริการจะไม่แสดงบนเว็บไซต์ ระบบที่เปิดให้บริการอาจเปลี่ยนแปลงหรือยกเลิกได้

**ข้อ 11 รายการที่สอง (รายการอื่นของข้อ 11 ไม่เปลี่ยน):**

> ผลการตรวจจับ การนับ และการประมาณค่าขึ้นกับกล้อง แสง และมุมติดตั้ง ไม่รับประกันความถูกต้อง ผลการทดสอบมีให้ตามคำขอ และแนะนำให้ทดลองหน้างานก่อนใช้ตัวเลขในการตัดสินใจทางธุรกิจ

## คำถามถึงทนายความ

1. การที่หน้าเว็บเลิกเผยแพร่ตัวเลขความแม่นยำ ทำให้หน้าที่ด้านคุ้มครองผู้บริโภค การโฆษณา หรือการเปิดเผยข้อมูลเปลี่ยนไปหรือไม่ (เช่น ผู้ซื้อธุรกิจและผู้บริโภค
   ต้องได้รับข้อมูลที่เพียงพอก่อนซื้อหรือไม่ และการให้ตามคำขอเพียงพอหรือไม่)
2. ประโยค “ผลการทดสอบมีให้ตามคำขอ” เพียงพอหรือไม่ ควรระบุช่องทางขอ ระยะเวลาตอบ หรือให้เอกสารเทคนิคแนบใบเสนอราคาทุกครั้งหรือไม่
3. “ไม่รับประกันความถูกต้อง” ใช้กับลูกค้าธุรกิจและผู้ใช้ทั่วไปได้เท่าใด ขัดกับกฎหมายคุ้มครองผู้บริโภค ข้อสัญญาที่ไม่เป็นธรรม หรือการโฆษณาเกินจริงหรือไม่
   และเมื่อสัญญาแยกกับลูกค้าธุรกิจระบุเกณฑ์หน้างาน ข้อใดมีผลก่อน
4. เมื่อหน้าเว็บไม่แสดงป้ายสถานะแล้ว ข้อ 2 ยังต้องพูดถึงระดับความพร้อมของระบบหรือไม่ หรือเพียงพอที่จะบอกว่าระบบที่ยังไม่เปิดจะไม่แสดง และระบบที่เปิดอาจเปลี่ยนหรือยกเลิกได้
5. บรรทัดอื่นที่เกี่ยวข้องในเอกสารของเรา ซึ่งต้องปรับพร้อมกัน ถ้าร่างนี้ผ่าน:
   - `help.html` หัวข้อ "ตัวเลขจากกล้องแม่นแค่ไหน" (และ EN/ZH ในหน้าเดียวกัน) ที่ตอนนี้ถูกปรับตามตัดสินใจ 223 แล้ว ต้องให้สอดคล้องกับประโยค "ไม่รับประกัน"
   - `privacy.html` และ `camera-notice.html` ป้ายสำหรับช่วงทดสอบหน้างาน (คำว่า "เพื่อทดสอบความแม่นยำ" ที่เป็นข้อความตามกฎหมาย ไม่เปลี่ยนในรอบนี้)
   - `docs/PDPA-NOTES-FOR-COUNSEL.md` ควรเพิ่มรายการนี้ (ผู้ประสานงานเป็นผู้เพิ่ม ไฟล์นี้ไม่ได้แก้ในงานนี้)
   - เอกสารขาย: ใบเสนอราคา ข้อตกลงนำร่อง และแบบฟอร์มสั่งซื้อ ควรอ้างถึงเอกสารเทคนิคอย่างไร

---

# English

## Reason

Owner decision 223 (2026-11-21): customer pages no longer publish accuracy figures, tables, dataset names or status tags. A tool page says only two plain lines,
what it is for and its main limit. The detailed figures moved to the technical sheet, available from sales, and to the administrator back office. Consequences for the terms:

1. The current clause 11 sentence "We publish public-dataset results with their limitations" would no longer be true, because the pages no longer publish results.
2. The current clause 2 sentence about a “Beta” label no longer matches the site. Under decision 226 the pages show no status label at all (neither “Beta” nor “Trial version”); a product switched off is not shown, and its direct address shows only “This service is not available yet.” Today the on/off switch is a list in `nav.js`, changed by a release of the site; a back-office screen for the administrator to switch products is a planned step 2 and is not built.
3. The terms must not promise more than the pages say, and must not remove the user's responsibility to test on site before relying on a result.

## Current text (verbatim from `terms.html` on the draft date)

**Clause 2, last item (English):**

> Features not yet validated on real-world data carry a “Beta” label and may change or be withdrawn.

**Clause 11 Availability and accuracy (first three items, English):**

> On-device tools keep working offline after the first load. Online features may pause for maintenance, announced in advance where possible.
>
> Detection, counting and estimates depend on the camera, lighting and mounting. We publish public-dataset results with their limitations and recommend an on-site pilot before relying on the numbers for business decisions.
>
> Support response levels per plan are on the Help page or in a separately signed support agreement.

(The fourth item of clause 11, on the medicine checker `medicine.html`, is unrelated and unchanged.)

## Proposed text

**Clause 2, last item:**

> Products that are not yet available are not shown on the site. Products that are available may be changed or withdrawn.

**Clause 11, second item (the other items of clause 11 stay):**

> Detection, counting and estimates depend on the camera, lighting and mounting angle; accuracy is not guaranteed. Test results are available on request. We recommend an on-site pilot before relying on the numbers for business decisions.

## Questions for counsel

1. Does removing published figures change any consumer-protection, advertising or disclosure duty (for example, must business and consumer buyers receive enough information before buying, and is providing it on request enough)?
2. Is "test results are available on request" enough? Should the terms name the channel and a reply time, or should the technical sheet be attached to every quotation?
3. How far can "accuracy is not guaranteed" be relied on against business customers and ordinary users? Does it conflict with consumer-protection law, unfair contract terms or misleading-advertising rules? When a separate contract with a business customer sets on-site criteria, which prevails?
4. Now that the pages show no status label, does clause 2 still need to describe how ready a product is, or is it enough to say that products not yet available are not shown and that available products may change or be withdrawn?
5. Related lines in our other documents that must change together if this draft passes:
   - `help.html`, "How accurate are the camera numbers?" (and the TH/ZH versions on the same page), already adjusted for decision 223, to match the "not guaranteed" sentence.
   - `privacy.html` and `camera-notice.html`: the sign for an on-site test period (the legal wording "to test accuracy" is unchanged in this round).
   - `docs/PDPA-NOTES-FOR-COUNSEL.md` should list this item (the coordinator adds it; this task did not edit that file).
   - Sales documents: how the quotation, pilot agreement and order form should refer to the technical sheet.

---

# 中文

## 理由

所有者决定 223（2026-11-21）：面向客户的页面不再公布准确率数字、表格、数据集名称和状态标签。工具页面只用通俗的两句话说明用途和主要限制。详细数据转入技术资料（可向销售索取）和管理员后台。对条款的影响：

1. 现行第 11 条中“我们公开在公共数据集上的测量结果及其局限”将不再属实，因为页面不再公布测量结果。
2. 现行第 2 条关于“Beta”标签的表述已与网站不符。按决定 226，页面不显示任何状态标签（既没有“Beta”也没有“试用版”）；关闭的产品不向客户显示，其直接网址只显示“此服务尚未开放。”目前开关是 `nav.js` 中的一个列表，通过发布新版本网站来更改；供管理员在后台开关产品的界面是计划中的第 2 步，尚未建成。
3. 条款不得承诺超过页面所说的内容，也不得免除用户在依赖结果前进行现场测试的责任。

## 现行文本（与 `terms.html` 在起草日完全一致）

**第 2 条最后一项（中文）：**

> 尚未在真实数据上验证的功能标有“Beta”，可能变更或下线。

**第 11 条 可用性与准确性（前三项，中文）：**

> 本机处理的工具在首次加载后可离线使用。在线功能可能因维护暂停，我们会尽可能提前通知。
>
> 检测、计数和估计结果取决于摄像头、光线和安装角度。我们公开在公共数据集上的测量结果及其局限，并建议在依据这些数字做商业决策前先进行现场试点。
>
> 各套餐的支持响应级别见帮助页面或另行签署的支持协议。

（第 11 条第四项关于药品信息核对 `medicine.html` 与本草案无关，保持不变。）

## 拟议文本

**第 2 条最后一项：**

> 尚未开放的产品不在网站上显示。已开放的产品可能变更或下线。

**第 11 条第二项（第 11 条其他项不变）：**

> 检测、计数和估计结果取决于摄像头、光线和安装角度，不保证准确。测试结果可按要求提供。建议在依据这些数字做商业决策前先进行现场试点。

## 向律师提出的问题

1. 页面不再公布准确率数字，是否改变消费者保护、广告或信息披露方面的义务（例如企业买家和消费者在购买前是否必须获得足够的信息，按要求提供是否足够）？
2. “测试结果可按要求提供”是否足够？是否应写明申请渠道和答复时限，或在每份报价单中附上技术资料？
3. “不保证准确”对企业客户和普通用户能起多大作用？是否与消费者保护法、不公平合同条款或虚假广告规定冲突？当与企业客户另行签署的合同规定了现场标准时，以哪个为准？
4. 页面已不显示状态标签，第 2 条是否仍需说明产品的成熟程度，还是只需说明未开放的产品不会显示、已开放的产品可能变更或下线即可？
5. 若本草案通过，其他文件中必须同时调整的相关内容：
   - `help.html` 中“摄像头的数字有多准确？”（及同页泰语/英语版本），已按决定 223 调整，需与“不保证准确”一句保持一致。
   - `privacy.html` 和 `camera-notice.html`：现场测试期间的告示（法律文字“为测试准确性”本轮不变）。
   - `docs/PDPA-NOTES-FOR-COUNSEL.md` 应列入本事项（由协调人添加，本任务未编辑该文件）。
   - 销售文件：报价单、试点协议和订单应如何引用技术资料。
