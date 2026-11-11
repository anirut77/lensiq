#!/usr/bin/env node
// tools/fortune-sources.mjs — the reference list of every fortune discipline, for the back office and the docs only.
//
// Owner order 2026-11-12 (Part B): fortune pages no longer show book / author / tradition citations or "sources" lists
// to users. The sources stay in the knowledge bases (*-kb.js: KB.sources, horoscope KB.readingSources) and are listed:
//   fortune-sources.js        window.LQ_FORTUNE_SOURCES, loaded by admin.html (tab "แหล่งอ้างอิงดูดวง", after sign-in)
//   docs/FORTUNE-SOURCES.md   every source per discipline, plus the page notes that used to sit next to the list
// Both files are generated from the knowledge bases, so they cannot drift:
//   node tools/fortune-sources.mjs           write both files
//   node tools/fortune-sources.mjs --check   exit 1 when either file is out of date (run by tests/unit/fortune-sources.test.js)
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// discipline → knowledge base, page and the page notes that were moved off the page (Thai / English as they were shown)
export const DISCIPLINES = [
  { id: "horoscope", kb: "horoscope-kb.js", page: "horoscope.html", th: "ดูดวงไทย (โหราศาสตร์ไทย)", en: "Thai astrology", lists: ["sources", "readingSources"],
    moved: ["เนื้อหาเรียบเรียงใหม่ในเชิงบวกจากความเชื่อที่เผยแพร่ทั่วไป แต่ละสำนักอาจตีความต่างกัน (ส่วนวิธีคำนวณดาวยังแสดงบนหน้า)"] },
  { id: "face", kb: "faceread-kb.js", page: "faceread.html", th: "โหงวเฮ้ง (อ่านใบหน้า)", en: "Face reading", lists: ["sources"],
    moved: ["เนื้อหาเรียบเรียงใหม่ในเชิงบวกจากแนวคิดโหงวเฮ้งที่สอนกันทั่วไป แต่ละสำนักอาจแบ่งรูปหน้าและช่วงวัยต่างกัน"] },
  { id: "palm", kb: "palm-kb.js", page: "palm.html", th: "ลายมือ", en: "Palm reading", lists: ["sources"],
    moved: ["เนื้อหาเรียบเรียงใหม่ในเชิงบวกจากแนวคิดลายมือตะวันตก จีน/ญี่ปุ่น และไทย แต่ละสำนักตีความต่างกันได้"] },
  { id: "tarot", kb: "tarot-kb.js", page: "tarot.html", th: "ไพ่ทาโรต์และเซียมซี", en: "Tarot and siam si", lists: ["sources"],
    moved: ["ความหมายไพ่เรียบเรียงใหม่เป็นภาษาไทยในเชิงสร้างสรรค์จากความหมายดั้งเดิมของสำรับ Rider–Waite–Smith ผู้อ่านไพ่แต่ละสำนักอาจตีความต่างกัน (เครดิตภาพไพ่ยังแสดงบนหน้า เพราะเป็นเครดิตสื่อ)"] },
  { id: "iching", kb: "iching-kb.js", page: "iching.html", th: "อี้จิง", en: "I Ching", lists: ["sources"],
    moved: ["ความหมายเรียบเรียงใหม่เป็นภาษาไทยเชิงสร้างสรรค์จากแก่นของตัวบทดั้งเดิม (ข้อจำกัดเรื่องความหมายเส้นเปลี่ยนยังแสดงบนหน้า)"] },
  { id: "dream", kb: "dream-kb.js", page: "dream.html", th: "ทำนายฝัน", en: "Dream reading", lists: ["sources"],
    moved: ["ความหมายสัญลักษณ์เรียบเรียงใหม่จากแก่นความเชื่อพื้นบ้านไทยและการตีความฝันทั่วไป ประเภทฝัน 4 แบบตามคติไทย (บุพนิมิต เทพสังหรณ์ จิตนิวรณ์ ธาตุกำเริบ)"] },
  { id: "fengshui", kb: "fengshui-kb.js", page: "fengshui.html", th: "ฮวงจุ้ย", en: "Feng shui", lists: ["sources"], moved: [] },
  { id: "numbers", kb: "numbers-kb.js", page: "numbers.html", th: "เลขศาสตร์", en: "Numerology", lists: ["sources"],
    moved: ["เนื้อหาเรียบเรียงใหม่ในเชิงบวกจากแนวคิดเลขศาสตร์ที่เผยแพร่ทั่วไป แต่ละสำนักให้ความหมายและตารางค่าอักษรต่างกัน"] },
  { id: "zodiac", kb: "zodiac-kb.js", page: "zodiac.html", th: "นักษัตรจีนและปีชง", en: "Chinese zodiac", lists: ["sources"],
    moved: ["ความสัมพันธ์ของกิ่งดินตามตำราจีน คำทำนายเรียบเรียงใหม่ทั้งหมดในเชิงสร้างสรรค์ (วิธีคำนวณตรุษจีนและลี่ชุนยังแสดงบนหน้า)"] },
  { id: "astro", kb: "astro-kb.js", page: "astro.html", th: "โหราศาสตร์ตะวันตก", en: "Western astrology", lists: ["sources"],
    moved: ["ชื่อผู้แต่งสูตรคำนวณ (Meeus, Astronomical Algorithms) ย้ายมาที่นี่ หน้าเว็บยังบอกความคลาดเคลื่อนของการคำนวณ"] },
];
// pages that never had a citation list (method notes only); listed so the docs cover every fortune page
export const NO_LIST = [
  { page: "bazi.html", th: "แปดอักษร (八字)", en: "BaZi", note: "วิธีคำนวณ (ลี่ชุน สารทเจี๋ย ยามจื่อ เขตเวลา) แสดงบนหน้า ไม่มีรายการอ้างอิงในโค้ด" },
  { page: "taksa.html", th: "ทักษา / มหาทักษา", en: "Taksa", note: "วิธีคำนวณ (วันไทยเริ่ม 06:00 อายุดาวมหาทักษา) แสดงบนหน้า ไม่มีรายการอ้างอิงในโค้ด" },
  { page: "lek7.html", th: "เลข 7 ตัว", en: "Lek 7", note: "วิธีคำนวณเดือนจันทรคติแสดงบนหน้า ไม่มีรายการอ้างอิงในโค้ด" },
  { page: "lifegraph.html", th: "กราฟชีวิต", en: "Life graph", note: "หมายเหตุเรื่องระดับในกราฟแสดงบนหน้า ไม่มีรายการอ้างอิงในโค้ด" },
  { page: "luckycolor.html", th: "สีมงคล", en: "Lucky colours", note: "หลักทักษาจรและสีประจำดาวแสดงบนหน้า (เป็นวิธีคำนวณ ไม่ใช่การอ้างอิงหนังสือ)" },
  { page: "planner.html", th: "ฤกษ์และแผนมงคล", en: "Auspicious planner", note: "ใช้ผลจากศาสตร์ข้างบน ไม่มีรายการอ้างอิงของตัวเอง" },
  { page: "fortune.html", th: "หน้ารวมดูดวง", en: "Fortune hub", note: "หน้ารวม ไม่มีรายการอ้างอิง" },
  { page: "report.html", th: "รายงานดวง", en: "Fortune report", note: "รวมผลจากศาสตร์ข้างบน ไม่มีรายการอ้างอิงของตัวเอง" },
];

export function collect() {
  return DISCIPLINES.map(d => {
    const KB = require(join(repo, d.kb));
    const sources = d.lists.flatMap(k => (KB[k] || []).map(s => ({ label: String(s.label), url: String(s.url), list: k })));
    return { id: d.id, page: d.page, th: d.th, en: d.en, sources, moved: d.moved };
  });
}

function js(data) {
  return "/* fortune-sources.js — GENERATED by tools/fortune-sources.mjs from the fortune knowledge bases. Do not edit.\n" +
    " * Back office only (admin.html, after sign-in): fortune pages do not show citations to users (owner order 2026-11-12). */\n" +
    "/** @type {any} */ (window).LQ_FORTUNE_SOURCES = " + JSON.stringify(data.map(d => ({ id: d.id, page: d.page, th: d.th, en: d.en, sources: d.sources.map(s => ({ label: s.label, url: s.url })) })), null, 1) + ";\n";
}

function md(data) {
  const n = data.reduce((a, d) => a + d.sources.length, 0);
  const L = [
    "# Fortune sources (back office and docs only)",
    "",
    "GENERATED by `node tools/fortune-sources.mjs` from the knowledge bases (`*-kb.js`). Do not edit by hand; `--check` runs in",
    "the unit tests. Owner order 2026-11-12: fortune pages and readings no longer show book, author or tradition citations,",
    "\"sources\" lists or footnote links to users. The sources stay in the code and data, are listed here, and are shown in the",
    "back office (admin.html → tab \"แหล่งอ้างอิงดูดวง / Fortune sources\", after sign-in, from `fortune-sources.js`).",
    "",
    "Not affected (sources still shown to users): medicine, product check, nutrition, and every accuracy figure or",
    "accuracy page (category pages, one-pagers, ACCURACY.md). Media and model licence credits (tarot card images,",
    "MediaPipe Hands) are licence credits, not citations, and stay on the pages.",
    "",
    "Total: " + n + " sources in " + data.length + " disciplines.",
    "",
  ];
  for (const d of data) {
    L.push("## " + d.th + " / " + d.en + " (`" + d.page + "`)", "");
    for (const s of d.sources) L.push("- " + s.label.replace(/\|/g, "\\|") + (s.list !== "sources" ? " *(reading source)*" : "") + " — <" + s.url + ">");
    if (d.moved.length) { L.push("", "Notes moved off the page:"); for (const m of d.moved) L.push("- " + m); }
    L.push("");
  }
  L.push("## Pages without a citation list", "");
  for (const p of NO_LIST) L.push("- `" + p.page + "` " + p.th + " / " + p.en + ": " + p.note);
  L.push("");
  return L.join("\n");
}

export function outputs() {
  const data = collect();
  return { [join(repo, "fortune-sources.js")]: js(data), [join(repo, "docs", "FORTUNE-SOURCES.md")]: md(data) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  let bad = 0;
  for (const [f, text] of Object.entries(outputs())) {
    let cur = null;
    try { cur = readFileSync(f, "utf8"); } catch (e) { /* missing */ }
    if (check) { if (cur !== text) { bad++; console.error("out of date: " + f + " (run node tools/fortune-sources.mjs)"); } } else { writeFileSync(f, text); console.log("wrote " + f); }
  }
  process.exit(bad ? 1 : 0);
}
