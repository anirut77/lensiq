// tools/fortune-quality-metrics-6.mjs — FIXED METRICS, round 6 of the fortune reading quality work (coordinator order after the
// independent re-check ~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK-5.md returned NOT OK on 38eb985). Appended to the
// locked set of phase fortune-quality (evals-locks/fortune-quality.sha256) BEFORE the round-6 fixes; rounds 1 to 5 stay locked.
// Detectors are written by the builder from the re-check's findings (the reviewer's scripts in r5rev/ were not read or copied).
//
// Inputs (synthetic: engine-built facts, tools/fortune-review-export.mjs factsFor; FortuneAI.compose; no network):
//   a NEW input set "fresh6": 15 domains x 8, lcg(918273 + k*4447), seed 60013 + i*131 = 120 inputs, each in TH / EN / ZH, gentle
//   AND straight = 240 readings per language
//
// Metrics (counts of failures; target 0):
//   W1  (D1) a bracket citation "(X)" credits the wrong finding: the stretch it closes (from the previous bracket, sentence end or
//       paragraph start) names another finding of the reading (its name, or the name without its kind word: "น้ำหยิน" of
//       "ธาตุประจำตัวน้ำหยิน กุ่ย (癸)"); TH / EN / ZH, every engine (TH: topic groups; a bracket right after another finding's
//       name annotates it and is not a citation)
//   W2  (D2) a sentence that opens with a pronoun ("It …", "它…") right after a sentence that ended in a bracket citation, or at the
//       start of a paragraph: the pronoun has no antecedent (EN / ZH)
//   W3  (D3) EN / ZH: a group's "also" line ("X also shows that…", "X adds that…", "X也提示…", "X还说明…", "X也说明…") or glossary
//       line ("In Thai number reading, …", "In Eight Mansions feng shui, …", "Siam Si is …", "在八字里…", "求签是…") with no
//       finding of the reading named before it in the group; and numbers / siam si / feng shui / taksa topic groups that name no
//       finding at all (the numbered source "(Pair N)", "(Slip N)", "(Kua N)" dropped)
//   W4  (D4) a content-free bracket citation: "(ปีนี้)", "(เซียมซีใบนี้)", "(…นี้)", "(this year)", "(this element's energy)",
//       "(this luck period)", "(the older person)", "(the success theme)", "(the winning dream)", "（今年）", "（这股五行能量）",
//       "（这步大运）", or a topic word ("(การงาน)", "(work)", "（工作）")
//   W5  (D5) advice turned into a statement: a Thai paragraph that opens "คุณมี…ไว้ …" or "คุณลอง / คุณอย่า / คุณควร / คุณหมั่น …"
//   W6  (R1, general) a Thai group (not the brief or the advice group) whose first paragraph opens with a predicate that has no
//       subject: its first word is not "คุณ", not a finding of the reading, not a noun / time / condition / connector start, not an
//       instruction ("ลอง…", "พัฒนา…") and not a list; a digit start ("46 (คู่…)") counts too
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { REPO, LANGS } from "./fortune-quality-metrics.mjs";
import { namesOf } from "./fortune-quality-metrics-4.mjs";
const require = createRequire(import.meta.url);

let M = null;
async function mods() {
  if (M) return M;
  global.PALM_KB = require(join(REPO, "palm-kb.js"));
  global.FR_KB = require(join(REPO, "faceread-kb.js"));
  for (const f of readdirSync(join(REPO, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(join(REPO, "i18n", f));
  const EX = await import(join(REPO, "tools", "fortune-review-export.mjs"));
  M = { EX, FA: require(join(REPO, "fortune-ai.js")) };
  return M;
}
export const FRESH6 = { name: "fresh6", n: 8, rng: k => 918273 + k * 4447, seed: i => 60013 + i * 131 };
export async function corpus() {
  const { EX, FA } = await mods();
  const out = [];
  for (const d of EX.DOMAINS) {
    const r = EX.lcg(FRESH6.rng(EX.DOMAINS.indexOf(d)));
    for (let i = 0; i < FRESH6.n; i++) {
      const facts = EX.factsFor(d, i, r), seed = FRESH6.seed(i);
      for (const straight of [false, true]) {
        const row = { set: "fresh6", d, i, straight, facts, seed, g: {} };
        for (const L of LANGS) row.g[L] = FA.compose(JSON.parse(JSON.stringify(facts)), { seed, lang: L, straight });
        out.push(row);
      }
    }
  }
  return out;
}

/** W5 targeted inputs (RECHECK-5 D5: the Tower reversed gives the advice "มีเงินสำรองไว้ แล้ว…" in money): 6 seeds x gentle / straight, TH */
export async function targeted() {
  const { EX, FA } = await mods();
  const TR = require(join(REPO, "tarot.js")), out = [];
  for (let i = 0; i < 6; i++) for (const straight of [false, true]) {
    const facts = TR.buildFacts([{ id: "m16", rev: true }], "money", "one", { rng: EX.lcg(i + 3) });
    out.push({ set: "w5", d: "tarot", i, straight, facts, g: { th: FA.compose(JSON.parse(JSON.stringify(facts)), { seed: 71011 + i * 7, lang: "th", straight }) } });
  }
  return out;
}

/* ---------------- detectors ---------------- */
const KIND_TH = /^(?:ธาตุประจำตัว|ธาตุ|เจ้าชะตา|วันเกิด|เกิดวัน|ลัคนาราศี|ราศี|มือธาตุ|เลขชีวิต)/;
/** the names of each item, and their stems (Thai: without the kind word, first word only) */
export function itemNames(FA, d, items, L) {
  return (items || []).map(it => {
    const own = namesOf(FA, d, [it], L);
    const stems = new Set(own.filter(n => L === "th" || /\d|\s/.test(n) || L === "zh"));
    // EN: "your Yan Nian direction" is also named as "Yan Nian"
    if (L === "en") for (const n of own) { const b = n.replace(/^(?:your|the|a|an) /, "").replace(/ (?:direction|star|house|area)$/, "").trim(); if (b.length >= 5 && b !== n) own.push(b); }
    if (L === "th") for (const n of own) { const s = n.replace(KIND_TH, "").split(/[\s(（]/)[0]; if (s.length >= 4) stems.add(s); }
    return { id: it.id, names: own, stems: [...stems].filter(s => s.length >= (L === "zh" ? 2 : 4)) };
  });
}
const lower = (x, L) => (L === "en" ? String(x).toLowerCase() : String(x));
export function wrongBrackets(text, inames, L) {
  const out = [], t = lower(text, L);
  const re = /[(（]([^()（）]{2,60})[)）]/g;
  for (const m of t.matchAll(re)) {
    const inner = m[1].trim(), own = inames.find(x => x.names.some(n => n === inner || n.replace(/\s*[(（][^)）]*[)）]/g, "").trim() === inner));
    if (!own) continue;
    const before = t.slice(0, m.index), cut = Math.max(before.lastIndexOf(")"), before.lastIndexOf("）"), L === "th" ? -1 : Math.max(before.lastIndexOf(". "), before.lastIndexOf("。")));
    const seg = before.slice(cut + 1);
    const mine = new Set(own.stems.concat(own.names));
    // "X (Y)": a bracket right after another finding's name annotates that name (the composer's own form), not a citation
    if (inames.some(o => o !== own && o.stems.concat(o.names).some(n => n.length >= 2 && seg.trimEnd().endsWith(lower(n, L))))) continue;
    for (const o of inames) {
      if (o === own) continue;
      const hit = o.stems.find(s => !([...mine].some(x => x.indexOf(s) >= 0 || s.indexOf(x) >= 0)) && seg.indexOf(lower(s, L)) >= 0);
      if (hit) { out.push(`(${inner}) closes a stretch naming ${hit}: …${seg.slice(-70)}`); break; }
    }
  }
  return out;
}
const sentencesOf = (t, L) => (L === "zh" ? String(t).split(/(?<=[。！？])/) : String(t).split(/(?<=[.!?])\s+/)).map(x => x.trim()).filter(Boolean);
export function danglingPronouns(paras, L) {
  const out = [];
  for (const q of paras) {
    const s = sentencesOf(q, L);
    s.forEach((x, k) => {
      // a dummy "it" ("It would help to…", "It is time to…") has no antecedent to lose
      const pron = L === "zh" ? /^它/.test(x) : /^It\b/.test(x) && !/^It (?:would|could|may|might|can|helps?|pays|takes|does|doesn't|is (?:time|worth|a good|wise|best|okay|fine|natural|important|easier|easy|normal|also worth))|^It's\b/.test(x);
      if (pron && (k === 0 || /[)）][.。!?！？]$/.test(s[k - 1]))) out.push(x.slice(0, 70));
    });
  }
  return out;
}
const ALSO = { en: /^(?:The |Your )?[A-Z][^,.]{0,60}? (?:also (?:shows?|says?|means?|suggests?|points? to)|adds?) that\b/, zh: /^[^，。：；！？]{1,24}?(?:也提示|还说明|也说明)/ };
const GLOSS = {
  en: /^(?:In (?:Thai number reading|Eight Mansions|Taksa|BaZi|Chinese face reading|palm reading|palmistry|the I Ching|Siam Si|astrology)\b|Siam Si is\b|A hexagram is\b|The five mountains are\b|The twelve palaces are\b|Face reading splits\b|Each Chinese year carries\b)/,
  zh: /^(?:在(?:泰式数字|八宅|塔克萨|八字|面相|手相|易经)[^，。]{0,8}(?:里|中)|求签是|面相把|十二宫是|五岳是|卦是)/,
};
const NUMBERED = ["numbers", "siamsee", "fengshui", "taksa"];
const TOPIC_SKIP = new Set(["overview", "brief", "advice"]);
export function lostSources(s, d, inames, L) {
  const out = [], all = inames.flatMap(x => x.names.map(n => lower(n, L))).filter(n => n.length >= 2), sens = s.paragraphs.flatMap(q => sentencesOf(q, L));
  let seen = "";
  for (const x of sens) {
    if ((ALSO[L].test(x) || GLOSS[L].test(x))) {
      // an "also" line names its own finding; the line before it must name one too
      const own = ALSO[L].test(x) ? lower(x, L).slice(0, 60) : "";
      if (!all.some(n => lower(seen, L).indexOf(n) >= 0) && !(GLOSS[L].test(x) && all.some(n => own.indexOf(n) >= 0))) out.push(x.slice(0, 80));
    }
    seen += " " + x;
  }
  if (NUMBERED.includes(d) && !TOPIC_SKIP.has(s.id) && !all.some(n => lower(s.paragraphs.join(" "), L).indexOf(n) >= 0)) out.push("no finding named: " + s.paragraphs.join(" ").slice(0, 70));
  return out;
}
const EMPTY = {
  th: /^(?:ปีนี้|เซียมซีใบนี้|\S{1,14}นี้|การงาน|การเงิน|ความรัก|ตัวตน)$/,
  en: /^(?:this |that |these |the (?:older|younger) person$|the success theme$|the winning dream$|(?:work|money|love)$)/i,
  zh: /^(?:今年|这|本|工作$|事业$|财运$|感情$|爱情$)/,
};
export function emptyBrackets(text, L) {
  const out = [];
  for (const m of String(text).matchAll(/[(（]([^()（）]{1,40})[)）]/g)) if (EMPTY[L].test(m[1].trim())) out.push(m[0]);
  return out;
}
export const W5_RE = /^คุณ(?:มี\S*ไว้(?:\s|$)|ลอง|อย่า|ควร|หมั่น)/;
// a Thai start that has its subject (or needs none)
const SUBJ_OK = new RegExp("^(?:คุณ|ช่วง|จังหวะ|ดาว|คน|โซน|ตาม|ใน|ทิศ|ภายใน|ถ้า|หาก|เป็นปี|เป็นช่วง|หน้าผาก|รายได้|รายรับ|ด้าน|โต๊ะ|ธาตุ|ตำรา|สถานการณ์|งาน|การ|เรื่อง|เคล็ด|พลัง|ความ|ปี|ฝัน|ฝ่ามือ|จมูก|ปีกจมูก|มุม|เมื่อ|ราว|บาง|ทรัพย์|ครอบครัว|ไอเดีย|ข้อมูล|คำ|เส้น|บรรยากาศ|รอบตัว|สิ่ง|ฟ้า|น้ำ|ไฟ|ภูเขา|ทะเลสาบ|ลม|ดิน|ไม้|ทอง|แนวโน้ม|ใจ|เพื่อน|ด้วย|อาจ|ทั้ง|ชื่อเสียง|ศิลปะ|ดนตรี|ร่างกาย|สุขภาพ|ผล|โชค|ลาภ|เงิน|ชีวิต|อนาคต|โอกาส|ทุก|ยิ่ง|แม้|นี่|ที่|ผู้|หัวหน้า|ทีม|ลูก|บ้าน|ภาพ|เลข|คู่|ไพ่|ราศี|มือ|ใบหน้า|วัย|ภพ|ภูมิ|กว้า|ตรีแกรม|เซียมซี|นอกจาก|อีก|ส่วน|สำหรับ|จาก|ดูที่|หลัง|ก่อน|ตอน|วัน|เดือน|สัปดาห์|เช้า|ค่ำ|กลางวัน|เวลา|ระยะ|ข่าว|ปัญหา|อุปสรรค|เป้าหมาย|แผน|ลึก ๆ|เจ้าชะตา|ลัคนา|หู|ตา|ปาก|คิ้ว|คาง|แก้ม|โหนกแก้ม|ริมฝีปาก|ดวง|ฐาน|ทักษา|ตำแหน่ง|บทบาท|ลูกค้า|คู่ครอง|คนรัก|ญาติ|พ่อ|แม่|พี่|น้อง|แสง|เมฆ|ฝน|ต้นไม้|ทะเล|แม่น้ำ|ถนน|ประตู|หน้าต่าง|เตียง|ห้อง|พื้นที่|โครงการ|สัญญา|เอกสาร|ภาระ|หนี้|ค่าใช้จ่าย|รายจ่าย|บัญชี|เงินออม|การลงทุน|ใคร|อะไร|เหตุ|ผู้คน|มิตร|บริวาร|ศัตรู|คู่แข่ง|สี|ปลาย|เชื่อกันว่า|เชื่อว่า|เครือข่าย|อารมณ์|ศาสตร์|ไม่ต้อง|พูดกันตรง|คาน|สายลม)");
const INSTR = /^(?:ลอง|เลือก|จัด|ตั้ง(?!แต่|ใจ)|ใช้|เก็บ|เช็ก|ตรวจ|พัก|ปรึกษา|วางแผน|วาง|ให้|เริ่ม|ฝึก|อย่า|ควร|รักษา|เขียน|จด|แบ่ง|ชวน|ทบทวน|ระวัง|เตรียม|ออม|หมั่น|ทดลอง|ฉลอง|หยุด|ประกาศ|พัฒนา|เปิดใจ|หา(?!ก)|ทำ(?!งาน|ให้)|คุย|ขอ|ฟัง|อ่าน|เดิน|ปล่อย|มอง(?!การณ์)|ดูแล|เติม|หล่อเลี้ยง|ติดตาม|กล้า(?=พูด|เลือก|ลอง|ขอ)|ใจดีกับ|มีเงินสำรอง|มี\S*ไว้(?:\s|$))/;
export function bareStartTh(t, names) {
  const s = String(t || "").trim();
  if (!s || names.some(n => n.length >= 2 && s.startsWith(n))) return false;
  if (/^\d/.test(s)) return true;
  return !SUBJ_OK.test(s) && !INSTR.test(s);
}

/* ---------------- measure ---------------- */
export function w5Of(rows) {
  const out = [];
  for (const row of rows) for (const s of row.g.th.sections || []) for (const q of s.paragraphs) if (W5_RE.test(q)) out.push(`${row.set}:${row.d}#${row.i}${row.straight ? "s" : ""} [${s.id}] ${q.slice(0, 60)}`);
  return out;
}
export async function measure(C) {
  const { FA } = await mods();
  const per = {}, ex = {}, note = (k, s) => { (ex[k] = ex[k] || []).length < 20 && ex[k].push(s); };
  const K0 = { n: 0, W1th: 0, W1en: 0, W1zh: 0, W2: 0, W3: 0, W4: 0, W5: 0, W6: 0 };
  const P = d => (per[d] = per[d] || Object.assign({}, K0));
  for (const row of C) {
    const p = P(row.d); p.n++;
    const tag = `${row.set}:${row.d}#${row.i}${row.straight ? "s" : ""}`;
    for (const L of LANGS) {
      const inames = itemNames(FA, row.d, row.facts.items, L), names = inames.flatMap(x => x.names);
      for (const s of row.g[L].sections || []) {
        const text = s.paragraphs.join(L === "zh" ? "" : " ");
        // (the Thai overview is the composer's own text, with its own "X (Y)" annotations; the post-pass cites in topic groups only)
        if (!(L === "th" && s.id === "overview")) for (const q of s.paragraphs) for (const f of wrongBrackets(q, inames, L)) { p["W1" + L]++; note("W1" + L, `${tag} [${s.id}] ${f}`); }
        if (L !== "th") {
          for (const f of danglingPronouns(s.paragraphs, L)) { p.W2++; note("W2", `${tag} ${L} [${s.id}] ${f}`); }
          if (s.id !== "overview" && s.id !== "brief") for (const f of lostSources(s, row.d, inames, L)) { p.W3++; note("W3", `${tag} ${L} [${s.id}] ${f}`); }
        }
        for (const f of emptyBrackets(text, L)) { p.W4++; note("W4", `${tag} ${L} [${s.id}] ${f}`); }
        if (L === "th") {
          for (const q of s.paragraphs) if (W5_RE.test(q)) { p.W5++; note("W5", `${tag} [${s.id}] ${q.slice(0, 60)}`); }
          if (!TOPIC_SKIP.has(s.id) && s.paragraphs[0] && bareStartTh(s.paragraphs[0], names)) { p.W6++; note("W6", `${tag} [${s.id}] ${s.paragraphs[0].slice(0, 70)}`); }
        }
      }
    }
  }
  const tot = {}; for (const q of Object.values(per)) for (const [k, v] of Object.entries(q)) tot[k] = (tot[k] || 0) + v;
  return { per, totals: tot, examples: ex };
}
