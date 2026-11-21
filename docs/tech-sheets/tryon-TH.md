# Try-On: ลองแว่น หมวก ต่างหู และเสื้อบนภาพกล้อง — เอกสารเทคนิค

> **Internal / for buyers on request — measured figures and their sources (owner decision 223)**
>
> **เอกสารภายใน / มอบให้ผู้ซื้อเมื่อขอ — ตัวเลขที่วัดได้และแหล่งที่มา (คำตัดสินของเจ้าของ ข้อ 223)**

สร้างโดย `node tools/tech-sheets.mjs` จาก `docs/tech-sheets/ORIGINAL-FIGURES-223.json` (sha256 93cff21370ba…), `docs/accuracy-figures.json` และทะเบียนใน `docs/ACCURACY-CLAIMS.md` ห้ามแก้ด้วยมือ

หน้าเว็บ: tryon.html

## ใช้ทำอะไร

สองบรรทัดที่แสดงบนหน้าเว็บ (คำตัดสินข้อ 223-7):

- ลองแว่น หมวก ต่างหู และเสื้อบนภาพกล้องสดบนเครื่องนี้
- เป็นภาพจำลอง ขนาดและตำแหน่งอาจไม่ตรงกับของจริง

## ตัวเลขที่วัดได้

ทุกตัวเลขระบุที่มา (ข้อมูลจำลอง / ชุดข้อมูลสาธารณะ / หน้างานจริง) ตามข้อความเดิม ตัวเลขไม่ได้พิมพ์ซ้ำด้วยมือ

### บรรทัดการ์ดหมวดและเหตุผลสถานะเดิม (tools/cat-data.cjs ก่อนข้อ 223)

- `cat.c.tryon` · ที่มา: none (ยังไม่ได้วัด) · อ้างอิง: docs/TRYON-DESIGN.md §4 (real-camera measurement not done; garment fit tested on a synthetic set only)
  - TH: ยังไม่ได้วัดกับภาพกล้องจริง การวางแว่น หมวก ต่างหู และเสื้อทดสอบกับข้อมูลสังเคราะห์เท่านั้น เป็นภาพจำลอง ไม่ใช่ภาพสวมใส่จริง
  - EN: Not measured on real camera pictures; placing glasses, hats, earrings and tops is tested on synthetic data only. A preview, not a real fit
  - 中文: 尚未用真实摄像头画面测量；眼镜、帽子、耳环和上衣的放置仅用合成数据测试。仅为模拟预览，不代表真实穿着效果
- `cat.r.tryon`
  - TH: ลองแว่น หมวก ต่างหู และเสื้อบนภาพกล้องสดบนเครื่อง พร้อมหลังบ้านแคตตาล็อกร้าน ยังไม่ได้วัดกับภาพจริงและยังไม่ได้เปิดระบบหลังบ้าน
  - EN: Try glasses, hats, earrings and tops on the live camera picture on the device, with a shop catalogue back office; not measured on real pictures and the backend is not deployed
  - 中文: 在本机实时摄像头画面上试戴眼镜、帽子、耳环和上衣，并配有店铺目录后台；尚未用真实画面测量，后端尚未部署

## ข้อจำกัดที่รู้

- เป็นภาพตัวอย่าง ขนาดและตำแหน่งอาจต่างจากของจริง

## สัญญาอนุญาต

- MediaPipe Face Landmarker, Pose Landmarker และ selfie segmenter (Apache-2.0); โมเดลลองชุดด้วย AI ปิดอยู่จนกว่าจะยืนยันสิทธิ์ (F2)
- รายละเอียดและสถานะการใช้เชิงพาณิชย์ของทุกโมเดลและข้อมูล: `LICENSES/THIRD_PARTY.md`

## ข้อความเดิมก่อนคำตัดสินข้อ 223 (Original page text before decision 223)

ข้อความที่ลูกค้าเห็นก่อนการเปลี่ยน คัดลอกตามจริงจาก snapshot (ช่องว่างถูกยุบเป็นช่องเดียว) แยกตามไฟล์ `[คีย์] ข้อความ`

#### tryon.html

~~~~text
[to.help.acc] ความแม่นยำบนภาพจริงยังไม่ได้วัด ตัวเลขที่มีอยู่มาจากชุดทดสอบสังเคราะห์เท่านั้น
~~~~
