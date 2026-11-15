// tools/fortune-quality-metrics-3.mjs — FIXED METRICS, round 3 of the fortune reading quality work (coordinator order after the
// independent re-check ~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK-2.md returned NOT OK on d07ecbe). Appended to the
// locked set of phase fortune-quality (evals-locks/fortune-quality.sha256) BEFORE the round-3 fixes; rounds 1 and 2 stay locked.
// Detectors are written by the builder from the re-check's findings (the reviewer's scripts were not read or copied).
//
// Inputs (synthetic: engine-built facts, tools/fortune-review-export.mjs factsFor; FortuneAI.compose; no network):
//   the round-2 corpus (345: reviewer 75, fresh 150, fresh2 120) plus a new set "fresh3" (15 domains x 8, lcg(515153 + k*104729),
//   seed 7001 + i*61) = 465 inputs, each in TH / EN / ZH (gentle); plus the pinned phone number 0812345678 asked about money,
//   seeds 1..60 (the test case of fortune-safety-lint "money-topic overview uses money meanings").
//
// Metrics (counts of failures; target 0 unless a share is stated):
//   S1  overview holds only the overview: no topic block ("การเงิน: / Money: / 财运方面：" …) in any overview, and nothing after the
//       "read on below" line ("…ขอเล่าละเอียดในหัวข้อถัดไป", "…there's a section on it below", "…下面单独细说"); pinned number:
//       the money overview has no love block and no love-only meaning (TH / EN / ZH)
//   S2  no "finding name + means-that verb" opener formula: at most 15 % of Thai group starts open "<finding> บ่งบอกว่า / สื่อว่า /
//       ชี้ว่า / สะท้อนว่า / หมายความว่า / แสดงว่า / ตีความได้ว่า / แปลได้ว่า / อ่านได้ว่า"; no reading where 3 or more groups open
//       that way on the same finding; at most 5 % of English group starts open "In your reading, …"
//   S3  a means-that verb (TH) never wraps an instruction ("ปีนี้สื่อว่ากันเงินสำรองไว้"), a simile ("ชี้ว่าเหมือนตะเกียง"), physical
//       evidence ("สื่อว่าหน้าผากกว้าง…", "สะท้อนว่าฝ่ามือเหลี่ยม…") or a bare noun phrase ("สะท้อนว่าการครบรอบที่สวยงาม"); an
//       invitation frame (ชวนให้ / แนะให้ / ชวนคุณ) never invites to invest ("ชวนให้กล้าลงทุนในเทคโนโลยี")
//   S4  Thai visible parts: no cut before ๆ, no name split from its value or gloss (next part opens with a Chinese character or a
//       bracket), no dangling tag or bare item at the end ("…ในตำราทักษา", "ชาวปีจอ", "เช่น", "คือ", "ว่า"), and no group whose
//       visible start is only a label (the round-2 Q3 rule applied to every group, not only the overview)
//   S5  report: one tip at most once per report, compared on the tip's core text after its lead words are stripped
//       ("ข้อแนะนำทั่วไปคือ / สิ่งที่ทำได้จากจุดนี้คือ / ข้อแนะนำทั่วไปจากจุดนี้คือ …", "Try this:", "建议你" …)
//   S6  the overview's FIRST named finding is the same in TH / EN / ZH (round 2 Q8 checks the second); lifegraph EN / ZH keep the
//       age band of the Thai main point
//   S7  smaller items: (a) at most 2 stock caution leads per Thai reading; (b) no topic caution lead inside another topic's group;
//       (c) the EN / ZH "pick one" closer ("挑一条最适合你的…", "Pick the one suggestion…") only after 2 or more tips in the same group
//       (Thai: the re-check found it only after several tips); (d) lek7 and siam si: an advice line in every language when any language has one
//   S8  content kept (characters of the whole reading, fresh3 inputs, vs the base composer on the same facts, read from the locked
//       file fortune-quality-base-chars.json): every domain and language >= 75 %, lifegraph >= 80 %, each language in total >= 85 %
//   S9  small Thai grammar: no Chinese character glued to a Thai letter ("วัยจร 戊寅ตีความได้ว่า"), no "ซึ่ง … ซึ่ง" within 40
//       characters, no content-free lead ("ซึ่งเล่าไว้ในหัวข้อก่อนหน้าแล้ว"), no raw percentage in a visible group part, no taksa
//       tautology "ภูมิX (ดาวY) … มาจากดาวY"
//   S10 static: the hub says "ดูได้" / "ลองเอง" (not "เล่นได้" / "เล่นเอง")
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { REPO, LANGS } from "./fortune-quality-metrics.mjs";
import { corpus as corpus2, danglingTh } from "./fortune-quality-metrics-2.mjs";
const require = createRequire(import.meta.url);

let M = null;
async function mods() {
  if (M) return M;
  const EX = await import(join(REPO, "tools", "fortune-review-export.mjs"));
  M = { EX, FA: require(join(REPO, "fortune-ai.js")), RD: require(join(REPO, "fortune-read.js")) };
  return M;
}
export const FRESH3 = { name: "fresh3", n: 8, rng: k => 515153 + k * 104729, seed: i => 7001 + i * 61 };
export async function fresh3Facts() {
  const { EX } = await mods();
  const out = [];
  for (const d of EX.DOMAINS) { const r = EX.lcg(FRESH3.rng(EX.DOMAINS.indexOf(d))); for (let i = 0; i < FRESH3.n; i++) out.push({ set: "fresh3", d, i, facts: EX.factsFor(d, i, r), seed: FRESH3.seed(i) }); }
  return out;
}
export async function corpus() {
  const { FA } = await mods();
  const C = await corpus2();
  for (const x of await fresh3Facts()) {
    const row = { set: x.set, d: x.d, i: x.i, topic: x.facts.topic, facts: x.facts, seed: x.seed, g: {} };
    for (const L of LANGS) row.g[L] = FA.compose(JSON.parse(JSON.stringify(x.facts)), { seed: x.seed, lang: L, straight: false, trace: true });
    C.push(row);
  }
  return C;
}

/* ---------------- helpers ---------------- */
const PAREN = /\s*[(（][^)）]*[)）]/g;
function namesOf(FA, d, items, L) {
  const out = new Set();
  const add = s => { if (!s) return; const b = String(s).replace(PAREN, "").trim(); for (const p of [String(s), b, ...b.split(/\s*[·•|]\s*/), b.replace(/\s*[\d.,]+\s*%?$/, "")]) if (p.trim().length >= 2) out.add(L === "en" ? p.trim().toLowerCase() : p.trim()); };
  for (const it of items || []) { const x = L === "en" ? FA.en.item(d, it) : L === "zh" ? FA.zh.item(d, it) : it; if (x) { add(x.label); add(x.short); } }
  return [...out].sort((a, b) => b.length - a.length);
}
function namedOrder(FA, row, L, text) {
  const t = L === "en" ? text.toLowerCase() : text, hits = [];
  for (const it of row.facts.items || []) {
    let at = Infinity;
    for (const n of namesOf(FA, row.d, [it], L)) { const j = t.indexOf(n); if (j >= 0 && j < at) at = j; }
    if (at < Infinity) hits.push([at, it.id]);
  }
  return hits.sort((a, b) => a[0] - b[0]).map(x => x[1]);
}
const CONN_TH = /ในขณะเดียวกัน|พร้อมกันนั้น|นอกจากนี้|ที่สำคัญ|ในอีกมุมหนึ่ง|อีกด้านหนึ่ง|เช่นเดียวกัน|ถัดมา|อีกทั้ง|ในทำนองเดียวกัน|ที่น่าสังเกตคือ|อีกเรื่องหนึ่งคือ/g;
function meaningLeft(gist, names, L) {
  let t = L === "en" ? gist.toLowerCase() : gist;
  for (const n of names) t = t.split(n).join(" ");
  t = t.replace(PAREN, " ").replace(/[\d.,%]+/g, " ");
  if (L === "th") return (t.replace(CONN_TH, " ").replace(/และ|กับ|หรือ|ของคุณ|ครั้งนี้|คุณ/g, "").match(/[ก-๎]/g) || []).length >= 20;
  if (L === "zh") return (t.replace(/[和与的是这次你]/g, "").match(/[一-鿿]/g) || []).length >= 10;
  return (t.match(/[a-z']{3,}/g) || []).filter(w => !/^(?:and|the|your|this|time|with|along|for|you)$/.test(w)).length >= 6;
}
const TAG = { th: /(?:^|\s)(?:ตัวตน|การงาน|การเงิน|ความรัก|ผู้คนรอบตัว|จังหวะเวลา):\s/, en: /(?:^|\s)(?:Personality|Work|Money|Love|Friends|Timing|Advice):\s/, zh: /(?:整体|性格|事业|财运|感情|人际|时机|行动)方面：/ };
const LOVE_TAG = { th: /ความรัก:\s/, en: /(?:^|\s)Love:\s/, zh: /感情方面：/ };
const BRIDGE = { th: /ขอเล่าละเอียดในหัวข้อถัดไป|อ่านต่อด้านล่างได้เลย|หัวข้อถัดไปจึงเน้นเรื่องนี้/, en: /there's a section on it below|so read on below/, zh: /下面单独细说|接着往下看/ };
const VERB = "บ่งบอกว่า|สื่อว่า|ชี้ว่า|สะท้อนว่า|หมายความว่า|แสดงว่า|ตีความได้ว่า|แปลได้ว่า|อ่านได้ว่า";
const VERB_RE = new RegExp("(" + VERB + ")\\s?(?:คุณ)?(\\S+)", "g");
const INSTR = /^(?:กัน|ลอง|เลือก|จัด|ตั้ง(?!แต่)|หา|ใช้|เก็บ|เช็ก|ตรวจ|พัก|ช่วยเหลือ|ปรึกษา|วางแผน|ให้เวลา|ให้รางวัล|เริ่ม|ฝึก|ขอ|คุยกับ|อย่า|ควร|รักษา|เขียน|จด|แบ่ง|ชวน|ทบทวน|ทำข้อตกลง|ยืดหยุ่นกับ|ระวัง|หลีกเลี่ยง|เตรียม|ออม)/;
const SIMILE = /^(?:เหมือน|ดุจ|ราวกับ|ประหนึ่ง|เปรียบ)/;
const EVID = /^(?:หน้าผาก|โหนกแก้ม|คาง|ฝ่ามือ|นิ้ว|จมูก|คิ้ว|ริมฝีปาก|ดวงตา|ใบหู|โซน\S*มีดาว)/;
const NOUNISH = /^การ\S*ที่\S*$/;
const INVEST = /(?:ชวนให้|แนะให้|ชวนคุณ(?:ให้)?)\s?(?:กล้า)?ลงทุน/;
const STOCK_LEAD = /ตำราชี้ว่า(?:ช่วงนี้|เรื่องเงิน|งาน|ความสัมพันธ์)|ตำรามองว่าเป็น(?:ช่วง|จังหวะ)ที่ควร/g;
const TOPIC_LEAD = { money: /ตำราชี้ว่าเรื่องเงิน|ด้านการเงิน ตำรามองว่า/, work: /ตำราชี้ว่างาน|ด้านการงาน ตำรามองว่า/, love: /ตำราชี้ว่าความสัมพันธ์|เรื่องหัวใจ ตำรามองว่า/ };
const CLOSER = { th: /ลองเลือกสักหนึ่งข้อจากที่กล่าวมา/, en: /Pick the one suggestion/, zh: /挑一条最适合你的/ };
const TIP = {
  en: /^(?:Try|It would help|A good next step|This is a good time to|A simple adjustment|Set aside|Pick|Keep|Plan|Take|Make|Spend|Give|Write|Ask|Talk|Rest|Start|Check|Save|Choose|Wear|Add|Place|Face|Turn|Put|Avoid|Leave|Note|Use)\b/,
  zh: /建议|不妨|试着|可以先|可以|记得|调整的方法|先把|多留|留意|别急/,
  th: /ลอง|ควร|ให้เวลา|กันเวลา|เลือก|จด|ตั้งงบ|พัก|วิธีปรับ|ข้อแนะนำ|สิ่งที่ทำได้|เคล็ด/,
};
const sentencesOf = (t, L) => (L === "zh" ? String(t).split(/(?<=[。！？])/) : L === "en" ? String(t).split(/(?<=[.!?])\s+/) : String(t).split(/\s+(?=ลอง|ควร|ข้อแนะนำ|สิ่งที่ทำได้|วิธีปรับ|เคล็ด)/)).map(x => x.trim()).filter(Boolean);
function adviceShown(FA, row, L, text) {
  const t = L === "en" ? text.toLowerCase() : text;
  for (const it of row.facts.items || []) {
    const y = L === "en" ? FA.en.item(row.d, it) : L === "zh" ? FA.zh.item(row.d, it) : it; if (!y) continue;
    for (const m of [].concat((y.meanings || {}).advice || [])) { const k = String(m).slice(0, L === "zh" ? 8 : 18).trim(); if (k.length >= (L === "zh" ? 5 : 10) && t.includes(L === "en" ? k.toLowerCase() : k)) return true; }
  }
  return false;
}

/* ---------------- measure ---------------- */
export async function measure(C) {
  const { FA, RD } = await mods();
  const per = {}, ex = {}, note = (k, s) => { (ex[k] = ex[k] || []).length < 14 && ex[k].push(s); };
  const K0 = { n: 0, S1: 0, S2same: 0, S2th: 0, S2en: 0, S3: 0, S4: 0, S6: 0, S7a: 0, S7b: 0, S7c: 0, S7d: 0, S9: 0, groupsTh: 0, groupsEn: 0 };
  const P = d => (per[d] = per[d] || Object.assign({}, K0));
  for (const row of C) {
    const p = P(row.d); p.n++;
    const tag = `${row.set}:${row.d}#${row.i}`;
    for (const L of LANGS) {
      const secs = row.g[L].sections || [];
      const names = namesOf(FA, row.d, row.facts.items, L);
      const ov = secs.find(s => s.id === "overview");
      // S1
      if (ov) {
        const t = ov.paragraphs.join(" "), b = BRIDGE[L].exec(t);
        const after = b ? t.slice(b.index + b[0].length).replace(/^[\s。.!]+/, "") : "";
        if (TAG[L].test(t) || after.length > 0) { p.S1++; note("S1", `${tag} ${L}: ${TAG[L].test(t) ? "topic block" : "text after read-on"} …${t.slice(-90)}`); }
      }
      const opener = {};
      for (const s of secs) {
        const parts = RD.planSection(s, L), gist = parts[0] ? parts[0].text : "";
        if (s.id !== "overview" && s.id !== "brief") {
          if (L === "th") {
            p.groupsTh++;
            const nm = names.find(n => gist.startsWith(n) || gist.slice(0, 8 + n.length).indexOf(n) >= 0);
            if (nm && new RegExp("^.{0,8}" + nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s?(?:" + VERB + ")").test(gist)) { p.S2th++; opener[nm] = (opener[nm] || 0) + 1; }
          }
          if (L === "en") { p.groupsEn++; if (/^In your reading, /.test(gist)) p.S2en++; }
          // S4 label-only group start
          if (L === "th" && gist && !meaningLeft(gist, names, L) && s.paragraphs.join(" ").length < 200) { p.S4++; note("S4", `${tag} [${s.id}] label only: ${gist.slice(0, 80)}`); }
        }
        if (L === "th") {
          for (let k = 0; k < parts.length - 1; k++) {
            const a = parts[k], b = parts[k + 1];
            if (a.para !== b.para || !a.visible || b.visible) continue;
            const why = /^ๆ/.test(b.text) ? "before ๆ" : /^[(（一-鿿]/.test(b.text) ? "name split from its value" :
              /(?:^|\s)ในตำรา\S*$|(?:^|\s)ชาวปี(?:ชวด|ฉลู|ขาล|เถาะ|มะโรง|มะเส็ง|มะเมีย|มะแม|วอก|ระกา|จอ|กุน)$|(?:^|\s)(?:เช่น|คือ|ว่า|ได้แก่)$/.test(a.text) ? "dangling tag" : danglingTh(a.text, b.text);
            if (why) { p.S4++; note("S4", `${tag} [${s.id}] ${why}: …${a.text.slice(-30)} ‖ ${b.text.slice(0, 16)}`); }
          }
          for (const para of s.paragraphs) {
            for (const m of para.matchAll(VERB_RE)) {
              const rest0 = para.slice(m.index + m[1].length).replace(/^\s/, ""), you = /^คุณ/.test(rest0), rest = rest0.replace(/^คุณ/, "");
              const w = (you ? /^ควร/.test(rest) : INSTR.test(rest)) ? "instruction" : SIMILE.test(rest) ? "simile" : EVID.test(rest) ? "evidence" : NOUNISH.test(rest.split(/\s/)[0] + "") && /\s/.test(rest) === false ? "noun" : "";
              if (w) { p.S3++; note("S3", `${tag} [${s.id}] ${m[1]} + ${w}: ${para.slice(Math.max(0, m.index - 20), m.index + 50)}`); }
            }
            if (INVEST.test(para)) { p.S3++; note("S3", `${tag} [${s.id}] invest invitation: ${para.match(new RegExp(".{0,20}" + INVEST.source + ".{0,20}"))[0]}`); }
            // S9
            const g = [/[一-鿿][ก-๎]/.test(para) && "cjk glued", /ซึ่ง\S{0,24}\sซึ่ง/.test(para) && "double ซึ่ง", /ซึ่งเล่าไว้ในหัวข้อก่อนหน้าแล้ว/.test(para) && "content-free lead",
              ((m => !!m && m[2].startsWith(m[1]))(/\(ดาว([^)\s]+)\)[^()]{0,80}มาจากดาว(\S+)/.exec(para))) && "taksa tautology"].filter(Boolean);
            for (const x of g) { p.S9++; note("S9", `${tag} [${s.id}] ${x}: ${para.slice(0, 70)}`); }
            // S7b
            if (/^(?:work|money|love|social|personality|timing)$/.test(s.id)) for (const [tp, re] of Object.entries(TOPIC_LEAD)) if (re.test(para) && tp !== s.id && !(tp === "love" && s.id === "social")) { p.S7b++; note("S7b", `${tag} [${s.id}] ${tp} lead`); }
          }
          for (const x of parts.filter(x => x.visible && s.id !== "overview")) if (/\d+\s*%/.test(x.text)) { p.S9++; note("S9", `${tag} [${s.id}] raw %: ${x.text.slice(0, 60)}`); }
        }
        // S7c closer after 2+ tips
        if (L !== "th") for (const para of s.paragraphs) { const c = CLOSER[L].exec(para); if (!c) continue;
          const before = sentencesOf(s.paragraphs.join(" ").slice(0, s.paragraphs.join(" ").indexOf(c[0])), L).filter(x => TIP[L].test(x)).length;
          if (before < 2) { p.S7c++; note("S7c", `${tag} ${L} [${s.id}] closer after ${before} tip(s)`); } }
      }
      if (L === "th") {
        if (Object.values(opener).some(v => v >= 3)) { p.S2same++; note("S2same", `${tag} ${JSON.stringify(opener)}`); }
        const all = secs.map(s => s.paragraphs.join(" ")).join(" "), n = (all.match(STOCK_LEAD) || []).length;
        if (n > 2) { p.S7a++; note("S7a", `${tag} ${n} stock caution leads`); }
      }
    }
    // S6 first named finding; lifegraph age band
    const ovT = L => ((row.g[L].sections || []).find(s => s.id === "overview") || { paragraphs: [""] }).paragraphs.join(" ");
    const o = Object.fromEntries(LANGS.map(L => [L, namedOrder(FA, row, L, ovT(L))]));
    if (o.th[0] && (o.th[0] !== o.en[0] || o.th[0] !== o.zh[0])) { p.S6++; note("S6", `${tag} first th ${o.th[0]} en ${o.en[0]} zh ${o.zh[0]}`); }
    if (row.d === "lifegraph") {
      const g = L => { const s = (row.g[L].sections || []).find(x => x.id === "overview"); return s ? (RD.planSection(s, L)[0] || {}).text || "" : ""; };
      if (/ช่วงอายุ\s?\d/.test(g("th")) && (!/\b(?:age|ages|aged)\b[^.]{0,20}\d|\d+\s?[–-]\s?\d+/.test(g("en")) || !/\d+\s?[–-]\s?\d+\s?岁|\d+岁/.test(g("zh")))) { p.S6++; note("S6", `${tag} lifegraph age band lost: ${g("en").slice(0, 60)} / ${g("zh").slice(0, 30)}`); }
    }
    // S7d lek7 / siam si advice in every language
    if (row.d === "lek7" || row.d === "siamsee") {
      const txt = L => (row.g[L].sections || []).filter(s => s.id !== "overview").map(s => s.paragraphs.join(" ")).join(" ");
      const has = Object.fromEntries(LANGS.map(L => [L, adviceShown(FA, row, L, txt(L)) || ((row.g[L].sections || []).some(s => s.id === "advice"))]));
      if (LANGS.some(L => has[L]) && !LANGS.every(L => has[L])) { p.S7d++; note("S7d", `${tag} advice th ${has.th} en ${has.en} zh ${has.zh}`); }
    }
  }
  const tot = {}; for (const q of Object.values(per)) for (const [k, v] of Object.entries(q)) tot[k] = (tot[k] || 0) + v;
  return { per, totals: tot, shares: { S2th: tot.S2th / tot.groupsTh, S2en: tot.S2en / tot.groupsEn }, examples: ex };
}
/** S1, pinned: the money overview of 0812345678 (seeds 1..60) holds no love block and no love-only meaning */
export function pinnedIssues(repo = REPO) {
  const FA = require(join(repo, "fortune-ai.js")), NM = require(join(repo, "numbers.js")), out = [];
  const f = NM.buildFacts(NM.analyzePhone("0812345678"), "money", {});
  for (const L of LANGS) for (let seed = 1; seed <= 60; seed++) {
    const r = FA.compose(JSON.parse(JSON.stringify(f)), { seed, lang: L }), ov = ((r.sections || []).find(s => s.id === "overview") || { paragraphs: [""] }).paragraphs.join(" ");
    if (LOVE_TAG[L].test(ov)) { out.push(`${L} seed ${seed}: love block`); continue; }
    for (const it of f.items) {
      const y = L === "en" ? FA.en.item("numbers", it) : L === "zh" ? FA.zh.item("numbers", it) : it; if (!y || !y.meanings) continue;
      const other = new Set(["money", "overview", "personality", "work", "social"].flatMap(k => y.meanings[k] || []));
      for (const m of y.meanings.love || []) if (!other.has(m)) { const k = String(m).slice(0, L === "zh" ? 8 : 18); if (k.length >= 6 && (L === "en" ? ov.toLowerCase().includes(k.toLowerCase()) : ov.includes(k))) out.push(`${L} seed ${seed}: love-only meaning ${k}`); }
    }
  }
  return out;
}
/** S5: report tips compared on their core text after the lead words */
const LEAD = {
  th: /^(?:ข้อแนะนำทั่วไป(?:จากจุดนี้)?คือ|สิ่งที่ทำได้(?:ทันที)?(?:จากจุดนี้)?(?:ในเรื่อง\S*)?คือ|วิธีปรับตามตำรา(?:คือ)?|สิ่งที่ควรทำ(?:คือ)?|เคล็ดเสริมดวง\S*\s?)\s?/,
  en: /^(?:Try this simple adjustment:|A simple adjustment:|Try this:|It would help to|Try to|A good next step is to|This is a good time to)\s*/i,
  zh: /^(?:调整的方法是：|建议你|不妨|试着|可以先)/,
};
export function reportIssues3(repo = REPO) {
  global.window = globalThis; globalThis.LQI18N_Q = globalThis.LQI18N_Q || [];
  require(join(repo, "i18n", "en-report.js")); require(join(repo, "i18n", "zh-report.js"));
  const dict = {}; for (const q of globalThis.LQI18N_Q) for (const L of Object.keys(q)) Object.assign(dict[L] = dict[L] || {}, q[L]);
  const RP = require(join(repo, "report.js"));
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : "{" + k + "}"));
  const tOf = L => (k, th, v) => fill(L === "th" ? th : (dict[L] && dict[L][k]) || th, v);
  const births = [{ y: 1954, m: 10, d: 24, h: 5, mi: 20, gender: "male" }, { y: 1986, m: 5, d: 6, h: 13, mi: 0, gender: "female" }, { y: 1999, m: 12, d: 12, noTime: true, gender: "male" },
    { y: 1976, m: 3, d: 30, h: 21, mi: 45, gender: "female" }, { y: 2005, m: 8, d: 1, h: 8, mi: 8, gender: "male" }, { y: 1990, m: 6, d: 17, h: 17, mi: 30, gender: "female" }];
  const now = new Date(2026, 10, 16), out = [];
  for (const [i, b] of births.entries()) for (const L of LANGS) {
    const rep = i % 3 === 2 ? RP.buildCompat(b, births[0], { lang: L, t: tOf(L) }) : i % 3 === 1 ? RP.buildAnnual(b, 2027, { lang: L, t: tOf(L) }) : RP.buildBasic(b, { lang: L, t: tOf(L), now });
    const paras = (rep.parts || []).flatMap(p => p.sections || []).flatMap(s => s.paragraphs || []);
    const units = paras.flatMap(q => L === "zh" ? q.split(/(?<=[。！？])/) : L === "en" ? q.split(/(?<=[.!?])\s+/) : q.split(/\s+(?=ข้อแนะนำทั่วไป|วิธีปรับตามตำรา|สิ่งที่ควรทำ|สิ่งที่ทำได้|เคล็ดเสริมดวง)/)).map(u => u.trim());
    const seen = {};
    for (const u of units) { if (!LEAD[L].test(u)) continue; const core = u.replace(LEAD[L], "").replace(/^[:：\s]+/, ""); const k = (L === "en" ? core.toLowerCase() : core).slice(0, L === "zh" ? 10 : L === "en" ? 30 : 20); if (k.length >= (L === "zh" ? 6 : 12)) seen[k] = (seen[k] || 0) + 1; }
    for (const [k, n] of Object.entries(seen)) if (n > 1) out.push(`report#${i} ${L} ×${n}: ${k}`);
  }
  return out;
}
/** S8: characters of the whole reading per domain and language (fresh3 inputs) */
export async function charsOf(FA, rows) {
  const out = {};
  for (const x of rows) for (const L of LANGS) {
    const res = FA.compose(JSON.parse(JSON.stringify(x.facts)), { seed: x.seed, lang: L });
    const k = x.d + " " + L; out[k] = (out[k] || 0) + (res.sections || []).map(s => s.paragraphs.join(" ")).join(" ").length;
  }
  return out;
}
export function charsIssues(now, base) {
  const out = [], tl = {}, tb = {};
  for (const [k, v] of Object.entries(base)) {
    const [d, L] = k.split(" "), n = now[k] || 0; tl[L] = (tl[L] || 0) + n; tb[L] = (tb[L] || 0) + v;
    if (n < (d === "lifegraph" ? 0.8 : 0.75) * v) out.push(`${k} ${Math.round(100 * n / v)} %`);
  }
  for (const L of Object.keys(tb)) if (tl[L] < 0.85 * tb[L]) out.push(`total ${L} ${Math.round(100 * tl[L] / tb[L])} %`);
  return out;
}
export const BASE_CHARS = () => JSON.parse(readFileSync(join(REPO, "tests", "unit", "fortune-quality-base-chars.json"), "utf8"));
export function staticIssues3(repo = REPO) {
  const hub = readFileSync(join(repo, "fortune.html"), "utf8"), out = [];
  if (/เล่นได้/.test(hub)) out.push("hub: เล่นได้");
  if (/เล่นเอง/.test(hub)) out.push("hub: เล่นเอง");
  return out;
}
