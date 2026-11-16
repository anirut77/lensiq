// tools/fortune-quality-metrics-4.mjs — FIXED METRICS, round 4 of the fortune reading quality work (coordinator order after the
// independent re-check ~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK-3.md returned NOT OK on 431d2c8). Appended to the
// locked set of phase fortune-quality (evals-locks/fortune-quality.sha256) BEFORE the round-4 fixes; rounds 1 to 3 stay locked.
// Detectors are written by the builder from the re-check's findings (the reviewer's scripts were not read or copied).
//
// Inputs (synthetic: engine-built facts, tools/fortune-review-export.mjs factsFor; FortuneAI.compose; no network):
//   a NEW input set "fresh4": 15 domains x 8, lcg(31337 + k*6151), seed 11003 + i*59 = 120 inputs, each in TH / EN / ZH (gentle)
//   report: 6 NEW births (basic x 2, annual x 2, compatibility x 2) x TH / EN / ZH
//
// Metrics (counts of failures; target 0 unless a share is stated):
//   U1  stock openers (N1): a group start (every group but the overview, in the layout's visible start; for the brief, any of its
//       lines after the area label) that opens with the
//       source instead of the finding's content: TH "ตาม X / ในมุมของ X / จาก X / ดูที่ X / สำหรับ X / ส่วน X / ด้วย X" or
//       "X + reporting verb" (บ่งบอกว่า / สื่อว่า / ชี้ว่า / สะท้อนว่า / หมายความว่า / แสดงว่า / ตีความได้ว่า / แปลได้ว่า /
//       อ่านได้ว่า / บอกว่า / อ่านว่า) with X a finding of this reading; EN "Looking at / As for / With / Start with / Turning to /
//       Traditionally / In traditional readings" or "X suggests / shows / means / indicates / is read to mean"; ZH "从X来看 / 就X /
//       说到X / 先看X / 再看X / 至于X / 按X" or "X显示 / 说明 / 提示 / 表示 / 这一点说明 / 意味着". Share <= 15 % per language.
//   U2  no identical source lead twice in one reading (any paragraph; TH "ตาม/ในมุมของ/จาก/ดูที่/สำหรับ + X", EN "Looking at X /
//       As for X", ZH "从X来看 / 说到X / 就X"), per language
//   U3  no reading (3 or more groups) where 60 % or more of the groups open with a stock opener (per language)
//   U4  wrong-type frames (TH): a reporting verb over an instruction ("สะท้อนว่าเช็กตัวเลข…"), "ปีนี้ + reporting verb", a reporting
//       verb or a source lead with no subject before a trait ("หมายความว่าฉลาด…", "ในมุมของ X โดดเด่น…", "ด้วยคู่ 95 มีปัญญา"),
//       evidence after a source lead ("ตามธาตุไฟ หน้าผากกว้าง…"), "พลังของ + verb"
//   U5  report (N2): (a) each glossary sentence ("In BaZi (the Four Pillars…", "In BaZi, a ten-year luck period…", "在八字里…")
//       at most once per report (target 0); (b) no EN sentence (>= 40 characters) or ZH sentence (>= 14) twice in one report (target
//       0); (c) TH: space-separated units of >= 30 characters shown twice in one report are COUNTED and reported, no target this
//       round (Thai has no sentence mark, so a repeated clause cannot be dropped safely without a redesign of the deep-dive; recorded
//       as a known limit for the reviewer)
//   U6  closer last (N3): the closer ("ลองเลือกสักหนึ่งข้อ…", "These are tendencies…", "Pick the one suggestion…", "Treat this reading
//       as a reference…", "这些只是传统说法里的倾向…", "挑一条最适合你的…", "把这次解读当作参考…", "สิ่งเหล่านี้เป็นแนวโน้มตามตำรา…",
//       "ใช้คำอ่านนี้เป็นข้อคิด…") is the last sentence of its group, when a group has one
//   U7  visible cuts (N4, TH): no cut inside a list (year animals, days, colours, directions), before a quote, between a label and
//       its number ("ผลรวม ‖ 43", "เส้นที่ ‖ 2"), or after a dangling "ปี 2026" (every cut inside one paragraph)
//   U8  briefs (padding): no TH brief carries a stock tip lead ("ข้อแนะนำทั่วไปคือ / …จากจุดนี้คือ / วิธีเสริมจุดนี้ตามตำราคือ /
//       เคล็ดเสริมดวงจากจุดนี้คือ"); no two readings of a domain share the same brief (any language)
//   U9  carried over: lifegraph shows no raw "(ระดับ x จาก 100)" / "level x of 100" / "x/100" in a visible part; the fengshui
//       content-free lead ("…ขอเล่าว่านำมาใช้กับ…", "doesn't speak to … directly", "这次没有直接谈到") is not a group's visible
//       start; the fengshui overview's visible start says more than the kua number / trigram / group label
//   U10 taksa social: the social group differs between users beyond planet / day names: no knowledge-base social line (planet and
//       day names masked) shown in the social group of more than 2 of the 8 taksa readings
//   U11 advice parity (carried over): lek7, siam si and lifegraph have an advice group in TH, EN and ZH when the knowledge base has
//       advice lines for a finding of the reading
//   U12 siam si EN content: characters of the siam si readings in EN >= 85 % of the base (round-3 file
//       fortune-quality-base-chars.json, fresh3 facts)
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { REPO, LANGS } from "./fortune-quality-metrics.mjs";
const require = createRequire(import.meta.url);

let M = null;
async function mods() {
  if (M) return M;
  global.PALM_KB = require(join(REPO, "palm-kb.js"));
  global.FR_KB = require(join(REPO, "faceread-kb.js"));
  for (const f of readdirSync(join(REPO, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(join(REPO, "i18n", f));
  const EX = await import(join(REPO, "tools", "fortune-review-export.mjs"));
  M = { EX, FA: require(join(REPO, "fortune-ai.js")), RD: require(join(REPO, "fortune-read.js")) };
  return M;
}
export const FRESH4 = { name: "fresh4", n: 8, rng: k => 31337 + k * 6151, seed: i => 11003 + i * 59 };
export async function corpus() {
  const { EX, FA } = await mods();
  const out = [];
  for (const d of EX.DOMAINS) {
    const r = EX.lcg(FRESH4.rng(EX.DOMAINS.indexOf(d)));
    for (let i = 0; i < FRESH4.n; i++) {
      const facts = EX.factsFor(d, i, r), seed = FRESH4.seed(i), row = { set: "fresh4", d, i, facts, seed, g: {} };
      for (const L of LANGS) row.g[L] = FA.compose(JSON.parse(JSON.stringify(facts)), { seed, lang: L, straight: false });
      out.push(row);
    }
  }
  return out;
}

/* ---------------- helpers ---------------- */
const PAREN = /\s*[(（][^)）]*[)）]/g;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function namesOf(FA, d, items, L) {
  const out = new Set();
  const add = s => { if (!s) return; const b = String(s).replace(PAREN, "").trim(); for (const p of [String(s), b, ...b.split(/\s*[·•|]\s*/), b.replace(/\s*[\d.,]+\s*%?$/, "")]) if (p.trim().length >= 2) out.add(L === "en" ? p.trim().toLowerCase() : p.trim()); };
  for (const it of items || []) { const x = L === "en" ? FA.en.item(d, it) : L === "zh" ? FA.zh.item(d, it) : it; if (x) { add(x.label); add(x.short); } }
  return [...out].sort((a, b) => b.length - a.length);
}
const VERB_TH = "บ่งบอกว่า|สื่อว่า|ชี้ว่า|สะท้อนว่า|หมายความว่า|แสดงว่า|ตีความได้ว่า|แปลได้ว่า|อ่านได้ว่า|บอกว่า|อ่านว่า";
const LEAD_TH = "ตาม|ในมุมของ|จาก|ดูที่|สำหรับ|ส่วน|ด้วย|ในส่วนของ";
const LEAD_EN = /^(?:Looking at|As for|With|Start with|Starting with|Turning to|Traditionally|In traditional readings)\b/;
const VERB_EN = "suggests?|shows?|means?|indicates?|points? to|reflects?|is read to mean|are read to mean|says?";
const LEAD_ZH = /^(?:从|就|说到|先看|再看|至于|按|根据)/;
const VERB_ZH = "显示|说明|提示|表示|这一点说明|意味着|也提示|还说明|则说明";
/** the stock opener at the start of a group's visible text, or "" */
export function stockLead(gist, names, L) {
  const g = String(gist || "").trim();
  if (L === "th") {
    for (const n of names) {
      const e = esc(n);
      const a = new RegExp("^(?:คน)?(?:" + LEAD_TH + ")\\s?" + e).exec(g); if (a) return a[0];
      const b = new RegExp("^.{0,6}" + e + "(?:\\s?\\([^)]*\\))?\\s?(?:ตาม(?:ตำรา|ความเชื่อ)?\\s?)?(?:ตำรา)?(?:" + VERB_TH + ")").exec(g); if (b) return b[0];
    }
    return /^(?:ตาม|ในมุมของ)\S/.test(g) && !/^ตาม(?:ปกติ|ที่)/.test(g) ? g.split(/\s/)[0] : "";
  }
  if (L === "en") {
    const t = g.toLowerCase();
    if (LEAD_EN.test(g)) return g.split(",")[0];
    for (const n of names) if (new RegExp("^(?:the |your )?" + esc(n) + "[^,.]{0,24}? (?:also )?(?:" + VERB_EN + ")\\b").test(t)) return n;
    return "";
  }
  if (LEAD_ZH.test(g)) return g.split(/[，：]/)[0];
  for (const n of names) if (new RegExp("^.{0,4}" + esc(n) + "[^，。]{0,8}?(?:" + VERB_ZH + ")").test(g)) return n;
  return "";
}
const LEADS_ANY = {
  th: names => names.map(n => new RegExp("(?:^|\\s)((?:ตาม|ในมุมของ|จาก|ดูที่|สำหรับ)" + esc(n) + ")(?=\\s)", "g")),
  en: names => names.map(n => new RegExp("\\b((?:looking at|as for) (?:the |your )?" + esc(n) + ")\\b", "g")),
  zh: names => names.map(n => new RegExp("((?:从" + esc(n) + "来看)|(?:说到" + esc(n) + ")|(?:就" + esc(n) + "而言))", "g")),
};
const TRAIT_TH = /^(?:ฉลาด|เก่ง|โดดเด่น|มีปัญญา|มีเสน่ห์|มีความ|เป็นคน|ชอบ|รัก(?!ษา)|ใจดี|ใจเย็น|ใจกว้าง|กล้า|ช่าง|บริหาร|เชื่อมโยง|ปรับตัว|มัก|เหมาะ|ขยัน|อ่อนโยน|จริงใจ|มองการณ์|มีสัญชาตญาณ)/;
const INSTR_TH = /^(?:กัน(?!เอง)|ลอง|เลือก|จัด|ตั้ง(?!แต่|ใจ)|หา(?!ก)|ใช้|เก็บ|เช็ก|ตรวจ|พัก|ปรึกษา|วางแผน|ให้เวลา|ให้รางวัล|เริ่ม|ฝึก|ขอ|คุยกับ|อย่า|ควร|รักษา|เขียน|จด|แบ่ง|ชวน|ทบทวน|ทำ(?!ให้)|ระวัง|หลีกเลี่ยง|เตรียม|ออม|ค่อย ๆ)/;
const EVID_TH = /^(?:หน้าผาก|โหนกแก้ม|คาง|ฝ่ามือ|นิ้ว|จมูก|คิ้ว|ริมฝีปาก|ดวงตา|ใบหู)/;
export function frameIssuesTh(t, names) {
  const out = [];
  for (const m of t.matchAll(new RegExp("(" + VERB_TH + ")\\s?(\\S+)", "g"))) {
    const w = m[2];
    if (INSTR_TH.test(w)) out.push("verb + instruction: " + t.slice(Math.max(0, m.index - 16), m.index + 40));
    else if (TRAIT_TH.test(w) && !/^ใจ/.test(m[1])) out.push("verb, no subject: " + t.slice(Math.max(0, m.index - 16), m.index + 40));
  }
  for (const m of t.matchAll(new RegExp("ปีนี้(?:" + VERB_TH + ")", "g"))) out.push("ปีนี้ + verb: " + t.slice(m.index, m.index + 40));
  for (const n of names) for (const m of t.matchAll(new RegExp("(?:^|\\s)(?:ตาม|ในมุมของ|ด้วย)" + esc(n) + "\\s(\\S+)", "g"))) {
    if (TRAIT_TH.test(m[1])) out.push("lead, no subject: " + m[0].trim().slice(0, 50));
    else if (EVID_TH.test(m[1])) out.push("evidence after lead: " + m[0].trim().slice(0, 50));
  }
  for (const m of t.matchAll(/พลังของ(?:ผ่าน|กำลัง|ช่วย|เป็น|ทำ)\S*/g)) out.push("พลังของ + verb: " + m[0].slice(0, 40));
  return [...new Set(out)];
}
const CLOSER = {
  th: /ลองเลือกสักหนึ่งข้อจากที่กล่าวมา|สิ่งเหล่านี้เป็นแนวโน้มตามตำรา|ใช้คำอ่านนี้เป็นข้อคิด/,
  en: /These are tendencies in traditional teachings|Pick the one suggestion that suits you|Treat this reading as a reference/,
  zh: /这些只是传统说法里的倾向|挑一条最适合你的|把这次解读当作参考/,
};
const sentences = (t, L) => (L === "zh" ? String(t).split(/(?<=[。！？])/) : L === "en" ? String(t).split(/(?<=[.!?])\s+/) : String(t).split(/\s+/)).map(x => x.trim()).filter(Boolean);
const YEAR = /ปี(?:ชวด|ฉลู|ขาล|เถาะ|มะโรง|มะเส็ง|มะเมีย|มะแม|วอก|ระกา|จอ|กุน)/;
const DAY = /^วัน(?:อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส\S*|ศุกร์|เสาร์)$/;
const COLOUR = /^(?:สี)?(?:แดง|ส้ม|เหลือง|เขียว|ฟ้า|น้ำเงิน|ม่วง|ชมพู|ขาว|ดำ|เทา|ทอง|เงิน|น้ำตาล|ครีม)$/;
const DIR = /^(?:ทิศ)?(?:เหนือ|ใต้|ตะวันออก|ตะวันตก|ตะวันออกเฉียง\S+|ตะวันตกเฉียง\S+)$/;
export function cutIssueTh(a, b) {
  const last = (a.trim().split(/\s+/).pop() || "").replace(/^(?:และ|หรือ)/, ""), first = (b.trim().split(/\s+/)[0] || "").replace(/^(?:และ|หรือ)/, "");
  for (const [k, re] of [["year list", YEAR], ["day list", DAY], ["colour list", COLOUR], ["direction list", DIR]]) if (re.test(last) && re.test(first)) return k;
  if (/^(?:และ|หรือ)\s?/.test(b.trim()) && (YEAR.test(last) || DAY.test(last) || COLOUR.test(last) || DIR.test(last))) return "list";
  if (/^["“'‘「]/.test(b.trim()) || /["“]$/.test(a.trim())) return "before quote";
  if (/^\d/.test(b.trim()) && /[ก-๎A-Za-z]$/.test(a.trim())) return "label | number";
  if (/(?:^|\s)(?:ใน)?(?:ปี|เดือน)\s?\d{1,4}$/.test(a.trim())) return "dangling year";
  return "";
}
const STOCK_TIP = /ข้อแนะนำทั่วไป(?:จากจุดนี้)?คือ|สิ่งที่ทำได้จากจุดนี้คือ|วิธีเสริมจุดนี้ตามตำราคือ|เคล็ดเสริมดวงจากจุดนี้คือ/;
const LEVEL = /ระดับ\s?\d+\s?จาก\s?100|level \d+ (?:of|out of) 100|\b\d{1,3}\s?\/\s?100\b|水平\s?\d+|\d+\s?分（满分100）/i;
const NONE_LEAD = /ขอเล่าว่านำมาใช้กับ|doesn't speak to .* directly|says little about .* directly|这次没有直接谈到|的直接说法不多/;
const FS_LABEL = /เลขกัว\S*|ตรีแกรม\S*|กลุ่ม(?:ตะวันออก|ตะวันตก)|[(（][^)）]*[)）]|\d+|ของคุณ|คือ|ตรงกับ|อยู่ใน|และ|เป็น/g;
const MASK = /ดาว\S+?(?=[\s,]|ประจำ|เป็น|หมาย|ชี้|สื่อ|บ่ง|ตี|ทำ|ใน|คือ|$)|วัน(?:อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส\S*|ศุกร์|เสาร์)|ภูมิ\S+|ตามดาว|\d+/g;

/* ---------------- measure ---------------- */
export async function measure(C) {
  const { FA, RD } = await mods();
  const per = {}, ex = {}, note = (k, s) => { (ex[k] = ex[k] || []).length < 16 && ex[k].push(s); };
  const K0 = { n: 0, U1th: 0, U1en: 0, U1zh: 0, U2: 0, U3: 0, U4: 0, U6: 0, U7: 0, U8: 0, U9: 0, U10: 0, U11: 0, gth: 0, gen: 0, gzh: 0 };
  const P = d => (per[d] = per[d] || Object.assign({}, K0));
  const briefs = {}, social = {};
  for (const row of C) {
    const p = P(row.d); p.n++;
    const tag = `${row.set}:${row.d}#${row.i}`;
    for (const L of LANGS) {
      const secs = row.g[L].sections || [], names = namesOf(FA, row.d, row.facts.items, L);
      let groups = 0, stock = 0;
      for (const s of secs) {
        const parts = RD.planSection(s, L), gist = parts[0] ? parts[0].text : "";
        if (s.id !== "overview") {
          groups++; p["g" + L]++;
          // the brief: each line after its label ("การงาน: / Work: / 事业方面：")
          const starts = s.id === "brief" ? s.paragraphs.map(q => q.replace(/^[^:：\s]{1,12}(?:方面)?[:：]\s?/, "")) : [gist];
          const sl = starts.map(x => stockLead(x, names, L)).find(Boolean);
          if (sl) { stock++; p["U1" + L]++; note("U1" + L, `${tag} [${s.id}] ${gist.slice(0, 70)}`); }
          if (row.d === "fengshui" && NONE_LEAD.test(gist)) { p.U9++; note("U9", `${tag} ${L} [${s.id}] content-free lead: ${gist.slice(0, 80)}`); }
        }
        // U6 closer last
        const all = sentences(s.paragraphs.join(" "), L), ci = all.findIndex(x => CLOSER[L].test(x));
        if (L === "th") { const t = s.paragraphs.join(" "), c = CLOSER.th.exec(t); if (c) { const rest = t.slice(c.index).replace(/^\S+(?:\s\S+)?(?:\s\S+)?/, ""); if (/\s(?:ลอง|ควร|ข้อแนะนำ|สิ่งที่ทำได้|วิธี|เคล็ด|เลือก|ให้เวลา|กันเวลา)/.test(rest) && rest.length > 40) { p.U6++; note("U6", `${tag} th [${s.id}] closer before more text: …${rest.slice(0, 60)}`); } } }
        else if (ci >= 0 && ci < all.length - 1) { p.U6++; note("U6", `${tag} ${L} [${s.id}] closer before: ${all.slice(ci + 1).join(" ").slice(0, 60)}`); }
        // U9 lifegraph raw levels
        if (row.d === "lifegraph") for (const x of parts.filter(x => x.visible)) if (LEVEL.test(x.text)) { p.U9++; note("U9", `${tag} ${L} [${s.id}] raw level: ${x.text.slice(0, 60)}`); }
        if (L === "th") {
          for (let k = 0; k < parts.length - 1; k++) {
            const a = parts[k], b = parts[k + 1];
            if (a.para !== b.para) continue;
            const why = cutIssueTh(a.text, b.text);
            if (why) { p.U7++; note("U7", `${tag} [${s.id}] ${why}: …${a.text.slice(-30)} ‖ ${b.text.slice(0, 20)}`); }
          }
          for (const para of s.paragraphs) for (const f of frameIssuesTh(para, names)) { p.U4++; note("U4", `${tag} [${s.id}] ${f}`); }
          if (s.id === "brief" && STOCK_TIP.test(s.paragraphs.join(" "))) { p.U8++; note("U8", `${tag} brief padded: ${s.paragraphs.join(" ").slice(0, 90)}`); }
          if (row.d === "fengshui" && s.id === "overview") {
            const left = (gist.replace(FS_LABEL, " ").match(/[ก-๎]/g) || []).length;
            if (left < 25) { p.U9++; note("U9", `${tag} fengshui overview label only: ${gist.slice(0, 80)}`); }
          }
          if (row.d === "taksa" && s.id === "social") {
            const t = s.paragraphs.join(" ");
            for (const it of row.facts.items) for (const m of (it.meanings || {}).social || []) {
              const core = String(m).split(/\s+สีประจำ/)[0];
              if (core.length >= 12 && t.includes(core.slice(0, 18))) { const k = core.replace(MASK, "#"); (social[k] = social[k] || new Set()).add(tag); }
            }
          }
        }
        if (s.id === "brief") { const k = row.d + " " + L + " " + s.paragraphs.join(" "); (briefs[k] = briefs[k] || []).push(tag); }
      }
      if (groups >= 3 && stock / groups >= 0.6) { p.U3++; note("U3", `${tag} ${L} ${stock}/${groups}`); }
      // U2 identical lead twice
      const text = secs.map(s => s.paragraphs.join(" ")).join(" "), tx = L === "en" ? text.toLowerCase() : text, seen = {};
      for (const re of LEADS_ANY[L](names)) for (const m of tx.matchAll(re)) seen[m[1]] = (seen[m[1]] || 0) + 1;
      const dup = Object.entries(seen).filter(([, v]) => v > 1);
      if (dup.length) { p.U2++; note("U2", `${tag} ${L} ${dup.map(([k, v]) => k + " ×" + v).join(", ")}`); }
    }
    // U11 advice parity
    if (["lek7", "siamsee", "lifegraph"].includes(row.d)) {
      const kb = row.facts.items.some(it => ((it.meanings || {}).advice || []).length);
      const has = Object.fromEntries(LANGS.map(L => [L, (row.g[L].sections || []).some(s => s.id === "advice")]));
      if (kb && !LANGS.every(L => has[L])) { p.U11++; note("U11", `${tag} advice th ${has.th} en ${has.en} zh ${has.zh}`); }
    }
  }
  for (const [k, v] of Object.entries(briefs)) if (v.length > 1) { const d = k.split(" ")[0]; P(d).U8 += v.length - 1; note("U8", `same brief in ${v.join(", ")}: ${k.slice(0, 80)}`); }
  for (const [k, v] of Object.entries(social)) if (v.size > 2) { P("taksa").U10 += v.size - 2; note("U10", `taksa social line in ${v.size} readings: ${k.slice(0, 80)}`); }
  const tot = {}; for (const q of Object.values(per)) for (const [k, v] of Object.entries(q)) tot[k] = (tot[k] || 0) + v;
  return { per, totals: tot, shares: { th: tot.U1th / tot.gth, en: tot.U1en / tot.gen, zh: tot.U1zh / tot.gzh }, examples: ex };
}

/** U5: report repeats (sentences and glossary) */
const GLOSS = { th: /^$/, en: /^In BaZi\b/, zh: /^在八字里/ };
export async function reportIssues4(repo = REPO) {
  await mods();
  global.window = globalThis; globalThis.LQI18N_Q = globalThis.LQI18N_Q || [];
  require(join(repo, "i18n", "en-report.js")); require(join(repo, "i18n", "zh-report.js"));
  const dict = {}; for (const q of globalThis.LQI18N_Q) for (const L of Object.keys(q)) Object.assign(dict[L] = dict[L] || {}, q[L]);
  const RP = require(join(repo, "report.js"));
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : "{" + k + "}"));
  const tOf = L => (k, th, v) => fill(L === "th" ? th : (dict[L] && dict[L][k]) || th, v);
  const births = [{ y: 1949, m: 7, d: 3, h: 6, mi: 10, gender: "female" }, { y: 1972, m: 11, d: 29, h: 22, mi: 5, gender: "male" }, { y: 1983, m: 2, d: 19, noTime: true, gender: "female" },
    { y: 1995, m: 9, d: 18, h: 11, mi: 40, gender: "male" }, { y: 2003, m: 4, d: 7, h: 15, mi: 15, gender: "female" }, { y: 1961, m: 12, d: 25, h: 3, mi: 30, gender: "male" }];
  const now = new Date(2026, 10, 16), out = { gloss: [], th: [], en: [], zh: [] }, MIN = { th: 30, en: 40, zh: 14 };
  for (const [i, b] of births.entries()) for (const L of LANGS) {
    const rep = i < 2 ? RP.buildBasic(b, { lang: L, t: tOf(L), now }) : i < 4 ? RP.buildAnnual(b, 2027, { lang: L, t: tOf(L) }) : RP.buildCompat(b, births[(i + 1) % 6], { lang: L, t: tOf(L) });
    const paras = (rep.parts || []).flatMap(p => p.sections || []).flatMap(s => s.paragraphs || []);
    const units = paras.flatMap(q => (L === "zh" ? q.split(/(?<=[。！？])/) : L === "en" ? q.split(/(?<=[.!?])\s+/) : q.split(/\s+/))).map(u => u.trim().replace(/^→\s*/, "")).filter(u => u.length >= MIN[L]);
    const seen = {}; for (const u of units) seen[u] = (seen[u] || 0) + 1;
    for (const [k, n] of Object.entries(seen)) if (n > 1) out[L].push(`report#${i} ${L} ×${n}: ${k.slice(0, 70)}`);
    const g = paras.flatMap(q => (L === "zh" ? q.split(/(?<=[。！？])/) : q.split(/(?<=[.!?])\s+/))).map(u => u.trim()).filter(u => GLOSS[L].test(u) && u.length > 4);
    const gk = {}; for (const u of g) { const k = u.slice(0, L === "zh" ? 8 : 24); gk[k] = (gk[k] || 0) + 1; }
    for (const [k, n] of Object.entries(gk)) if (n > 1) out.gloss.push(`report#${i} ${L} glossary ×${n}: ${k}`);
  }
  return out;
}
/** U12: siam si EN content vs base (round-3 base characters, fresh3 facts) */
export async function siamseeEn() {
  const { FA } = await mods();
  const M3 = await import(join(REPO, "tools", "fortune-quality-metrics-3.mjs"));
  const rows = (await M3.fresh3Facts()).filter(x => x.d === "siamsee"), now = await M3.charsOf(FA, rows), base = M3.BASE_CHARS();
  return (now["siamsee en"] || 0) / base["siamsee en"];
}
