// @ts-check
// backend/src/price-list.js — the approved B2B price lines a quotation / invoice / receipt may use (owner approval
// 2026-11-09, docs/PRICING-RESEARCH.md §3; labels decided 2026-11-13 option B: pilot price charged now, regular price
// after the pilot thresholds shown beside it). All amounts EXCLUDE 7 % VAT. Only items that are on the list as sellable:
// exam hall (experimental, not sold), Crowd monthly (held back), dense crowds, hardware and multi-branch sync are not
// here, and neither is the institution licence ("from 19,900": a quoted amount, not a list price).
// tests/unit/backend-seller.test.js S9 checks every pilot price and minimum against the row named in `source_row`, so a
// price can change only by changing the approved document first. The client never sends a price.

/** @typedef {{id: string, product: string, name_th: string, name_en: string, name_zh: string, unit_th: string, unit_en: string,
 *  unit_zh: string, pilot_satang: number, min_satang?: number, regular_th: string, regular_en: string, regular_zh: string,
 *  source_row: string}} PriceLine */

/** @type {PriceLine[]} */
export const PRICE_LINES = [
  { id: "exam_lab_candidate", product: "exam", name_th: "LENSIQ Exam ห้องคอมพิวเตอร์/ออนไลน์ ต่อผู้สอบ", name_en: "LENSIQ Exam computer room / online, per candidate",
    name_zh: "LENSIQ Exam 机房/在线考试 按考生", unit_th: "ผู้สอบต่อการสอบ", unit_en: "candidate per exam", unit_zh: "考生/每场考试",
    pilot_satang: 1000, min_satang: 30000, regular_th: "15–30", regular_en: "15–30", regular_zh: "15–30", source_row: "Computer room / online, per candidate" },
  { id: "exam_lab_room", product: "exam", name_th: "LENSIQ Exam ห้องคอมพิวเตอร์ รายเดือน", name_en: "LENSIQ Exam computer lab, monthly",
    name_zh: "LENSIQ Exam 机房 月付", unit_th: "ห้องต่อเดือน", unit_en: "lab per month", unit_zh: "机房/月",
    pilot_satang: 99000, regular_th: "990–1,490", regular_en: "990–1,490", regular_zh: "990–1,490", source_row: "Computer room / online, monthly lab package" },
  { id: "attendance_person", product: "attendance", name_th: "LENSIQ ลงเวลาทำงาน มาตรฐาน", name_en: "LENSIQ Attendance standard",
    name_zh: "LENSIQ 考勤 标准版", unit_th: "คนที่ใช้งานต่อเดือน", unit_en: "active person per month", unit_zh: "活跃人数/月",
    pilot_satang: 1900, min_satang: 19000, regular_th: "29 (ขั้นต่ำ 290)", regular_en: "29 (minimum 290)", regular_zh: "29（最低 290）", source_row: "Standard (shifts, OT, holidays" },
  { id: "attendance_setup", product: "attendance", name_th: "LENSIQ ลงเวลาทำงาน ช่วยตั้งค่า (ครั้งเดียว)", name_en: "LENSIQ Attendance set-up help (one-off)",
    name_zh: "LENSIQ 考勤 设置协助（一次性）", unit_th: "ครั้ง", unit_en: "one-off", unit_zh: "次",
    pilot_satang: 290000, regular_th: "4,900", regular_en: "4,900", regular_zh: "4,900", source_row: "Set-up help (shift tables" },
  { id: "gate_village_lane", product: "gate", name_th: "LENSIQ Gate หมู่บ้าน/คอนโด", name_en: "LENSIQ Gate village / condo guard post",
    name_zh: "LENSIQ Gate 小区/公寓岗亭", unit_th: "ช่องทางต่อเดือน", unit_en: "lane per month", unit_zh: "车道/月",
    pilot_satang: 49000, regular_th: "990", regular_en: "990", regular_zh: "990", source_row: "Village / condo guard post" },
  { id: "gate_parking_lane", product: "gate", name_th: "LENSIQ Gate ลานจอดรถ", name_en: "LENSIQ Gate car park",
    name_zh: "LENSIQ Gate 停车场", unit_th: "ช่องทางต่อเดือน", unit_en: "lane per month", unit_zh: "车道/月",
    pilot_satang: 79000, regular_th: "1,490", regular_en: "1,490", regular_zh: "1,490", source_row: "Car park (`parking.html`" },
  { id: "gate_setup", product: "gate", name_th: "LENSIQ Gate ติดตั้งหน้างาน", name_en: "LENSIQ Gate set-up visit",
    name_zh: "LENSIQ Gate 现场安装", unit_th: "ครั้ง", unit_en: "visit", unit_zh: "次",
    pilot_satang: 250000, regular_th: "3,000–5,000", regular_en: "3,000–5,000", regular_zh: "3,000–5,000", source_row: "Set-up visit (camera angle" },
  { id: "crowd_event_day", product: "crowd", name_th: "LENSIQ Crowd วันงาน", name_en: "LENSIQ Crowd event day",
    name_zh: "LENSIQ Crowd 活动日", unit_th: "เครื่องต่อวัน", unit_en: "device per day", unit_zh: "设备/天",
    pilot_satang: 59000, regular_th: "990", regular_en: "990", regular_zh: "990", source_row: "Event day (1 camera device" },
  { id: "crowd_event_week", product: "crowd", name_th: "LENSIQ Crowd สัปดาห์งาน (7 วัน)", name_en: "LENSIQ Crowd event week (7 days)",
    name_zh: "LENSIQ Crowd 活动周（7 天）", unit_th: "เครื่อง", unit_en: "device", unit_zh: "设备",
    pilot_satang: 249000, regular_th: "3,900", regular_en: "3,900", regular_zh: "3,900", source_row: "Event week (7 days)" }
];

/** @param {string} id */
export const priceLine = id => PRICE_LINES.find(l => l.id === id) || null;

/** Line amount excl. VAT: quantity × pilot price, at least the line minimum. @param {PriceLine} l @param {number} qty */
export const lineAmount = (l, qty) => Math.max(l.pilot_satang * qty, l.min_satang || 0);
