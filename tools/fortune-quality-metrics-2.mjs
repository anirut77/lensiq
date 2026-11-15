// tools/fortune-quality-metrics-2.mjs — FIXED METRICS, round 2 of the fortune reading quality work (coordinator order after the
// independent re-check ~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK.md returned NOT OK on 65fa9e8). Appended to the
// locked set of phase fortune-quality (evals-locks/fortune-quality.sha256) BEFORE the round-2 fixes; round 1 stays locked as is.
// Detectors are written by the builder from the re-check's findings (the reviewer's scripts were not read or copied).
//
// Inputs (synthetic: engine-built facts, tools/fortune-review-export.mjs factsFor; FortuneAI.compose; no network):
//   the round-1 sets "reviewer" (75) and "fresh" (150) plus a new set "fresh2" (15 domains x 8, lcg(424243 + k*7919),
//   seed 9001 + i*53) = 345 inputs, each in TH / EN / ZH (gentle).
//
// Metrics (counts of failures; target 0 unless a share is stated):
//   Q1  no visible Thai part ends dangling: the round-1 rules plus a transition word ("ที่สำคัญ", "เช่นเดียวกัน", "พร้อมกันนั้น",
//       "ในขณะเดียวกัน", "ถ้ามีเวลา", "นอกจากนี้", "ในอีกมุมหนึ่ง", "ถัดมา", "อีกทั้ง", "ในทำนองเดียวกัน", …), a lead + noun
//       ("ในฐานะชาวปีขาล", "ในส่วนของX", "ดูที่X", "จากX", "สำหรับX", "ส่วนX", "ตามX"), or an open bracket
//   Q2  no stock main-point formula: at most 10 % of overviews per language open their visible part with one of the formulas
//       ("…คือจุดที่เด่นที่สุดของผลครั้งนี้", "จุดที่เด่นที่สุดครั้งนี้คือ", "ใจความหลักของผลครั้งนี้คือ", "ผลหลักที่ควรจำไว้คือ";
//       "是这次最突出的地方", "这次最突出的是", "这次的重点在"; "stands out most", "The main focus this time"), and never the
//       ZH duplication "…最突出是这次最突出…"
//   Q3  the visible overview says what the finding means: after removing finding names, headline pieces, brackets, numbers and
//       formula words, at least 20 Thai letters (EN 6 words, ZH 10 characters) remain; no raw percentage and no run of Chinese
//       pillars ("辛巳 丁酉") in the visible overview
//   Q4  no filler: none of the general tips the composer adds by itself to a group that is not the asked topic ("ลองเลือกสิ่งที่
//       ทำได้เลยหนึ่งข้อจากคำอ่านนี้…" and its EN / ZH lines, the "says little about … directly" line outside the asked topic);
//       no "ชวนให้ให้"; no "X … ชวนให้ … X" tautology (the subject's own words repeated in the advice)
//   Q5  group openings vary: at most 15 % of Thai group starts open with "จาก / ดูที่ / สำหรับ / ส่วน / ในส่วนของ / ในฐานะ +
//       finding", none opens with a contrastive "ส่วน"; at most 15 % of English group starts open with "Looking at / With the /
//       With your / As for", and none echoes its own label ("Looking at the money, money …")
//   Q6  no action frame over a trait or fact: "ตามคำแนะนำของX / เพื่อใช้จุดเด่นของX…ให้เต็มที่ / Xเป็นสัญญาณให้ / Xแนะให้ /
//       Xชวนให้" is followed by an action; "ตำราฝากข้อคิดไว้ว่า / ข้อคิดที่ตำราฝากไว้มีอยู่ว่า" never wraps "คุณเป็น / คุณมี /
//       หลายตำรา / a direction fact"
//   Q7  a reading with one finding (siam si) does not call it the most prominent and names it once in the visible overview
//   Q8  the overview's second named finding is the same in TH / EN / ZH (when Thai names two); tarot leads with a card
//   Q9  report: one advice unit at most once per report (units split at every advice lead, also at the start of a paragraph)
//   Q10 taksa love differs between users beyond the planet / day / number slots
//   Q11 static: no "ปาจื้อ (สี่เสา)" or "ปากั้ว" on the hub, the awkward topic sentence rewritten; lucky colour lists of two or
//       more meanings joined with "และ"
//   Q12 content: per domain and language, the number of distinct knowledge-base meanings shown is at least 90 % of the base
//       (fortune-live before this branch), read from the locked file fortune-quality-base-content.json
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO, LANGS, corpus as corpus1, badCutTh } from "./fortune-quality-metrics.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

let M = null;
async function mods() {
  if (M) return M;
  const EX = await import(join(REPO, "tools", "fortune-review-export.mjs"));
  M = { EX, FA: require(join(REPO, "fortune-ai.js")), RD: require(join(REPO, "fortune-read.js")) };
  return M;
}
export const FRESH2 = { name: "fresh2", n: 8, rng: k => 424243 + k * 7919, seed: i => 9001 + i * 53 };
/** the facts of the fresh2 set (also used to compute the base content numbers) */
export async function fresh2Facts() {
  const { EX } = await mods();
  const out = [];
  for (const d of EX.DOMAINS) { const r = EX.lcg(FRESH2.rng(EX.DOMAINS.indexOf(d))); for (let i = 0; i < FRESH2.n; i++) out.push({ set: "fresh2", d, i, facts: EX.factsFor(d, i, r), seed: FRESH2.seed(i) }); }
  return out;
}
export async function corpus() {
  const { FA } = await mods();
  const C = await corpus1();
  for (const x of await fresh2Facts()) {
    const row = { set: x.set, d: x.d, i: x.i, topic: x.facts.topic, facts: x.facts, seed: x.seed, g: {}, st: {} };
    for (const L of LANGS) row.g[L] = FA.compose(x.facts, { seed: x.seed, lang: L, straight: false, trace: true });
    C.push(row);
  }
  return C;
}

/* ---------------- detectors ---------------- */
const TRANS = /(?:^|\s)(?:ที่สำคัญ|เช่นเดียวกัน|พร้อมกันนั้น|ในขณะเดียวกัน|ถ้ามีเวลา|นอกจากนี้|ในอีกมุมหนึ่ง|อีกด้านหนึ่ง|ถัดมา|อีกทั้ง|ในทำนองเดียวกัน|ที่น่าสังเกตคือ|อีกเรื่องหนึ่งคือ|ต่อจากนั้น|ยิ่งไปกว่านั้น|ขณะเดียวกัน)$/;
const LEAD_END = /(?:^|\s)(?:ในฐานะ|ในส่วนของ|ดูที่|จาก|สำหรับ|ส่วน|เรื่อง|ด้าน|ตาม|เมื่อดูที่)\S*$/;
export function danglingTh(a, b) {
  return badCutTh(a, b) || (TRANS.test(a) ? "transition" : "") || (LEAD_END.test(a) ? "lead + noun" : "") ||
    ((a.match(/[(（]/g) || []).length > (a.match(/[)）]/g) || []).length ? "inside brackets" : "");
}
const FORMULA = {
  th: /คือจุดที่เด่นที่สุด|จุดที่เด่นที่สุดครั้งนี้คือ|ใจความหลักของผลครั้งนี้คือ|ผลหลักที่ควรจำไว้คือ/,
  en: /stands? out most|The main focus this time/i,
  zh: /是这次最突出的地方|这次最突出的是|这次的重点在/,
};
const PAREN = /\s*[(（][^)）]*[)）]/g;
function namesOf(FA, d, items, L, headline) {
  const out = new Set();
  const add = s => { if (!s) return; const b = String(s).replace(PAREN, "").trim(); for (const p of [String(s), b, ...b.split(/\s*[·•|]\s*/), b.replace(/\s*[\d.,]+\s*%?$/, "")]) if (p.trim().length >= 2) out.add(L === "en" ? p.trim().toLowerCase() : p.trim()); };
  for (const it of items || []) { const x = L === "en" ? FA.en.item(d, it) : L === "zh" ? FA.zh.item(d, it) : it; if (x) { add(x.label); add(x.short); } }
  if (L === "th" && headline) for (const h of String(headline).split(/\s*·\s*/)) add(h);
  return [...out].sort((a, b) => b.length - a.length);
}
const CONN_TH = /ในขณะเดียวกัน|พร้อมกันนั้น|นอกจากนี้|ที่สำคัญ|ในอีกมุมหนึ่ง|อีกด้านหนึ่ง|เช่นเดียวกัน|ถัดมา|อีกทั้ง|ในทำนองเดียวกัน|ที่น่าสังเกตคือ|อีกเรื่องหนึ่งคือ/g;
function meaningLeft(gist, names, L) {
  let t = L === "en" ? gist.toLowerCase() : gist;
  for (const n of names) t = t.split(n).join(" ");
  t = t.replace(PAREN, " ").replace(/[\d.,%]+/g, " ").replace(new RegExp(FORMULA[L].source, "gi"), " ");
  if (L === "th") return (t.replace(CONN_TH, " ").replace(/และ|กับ|หรือ|ของคุณ|ครั้งนี้|คุณ/g, "").match(/[ก-๎]/g) || []).length >= 20;
  if (L === "zh") return (t.replace(/[和与的是这次你]/g, "").match(/[一-鿿]/g) || []).length >= 10;
  return (t.match(/[a-z']{3,}/g) || []).filter(w => !/^(?:and|the|your|this|time|with|along|stands?|out|most|for|you)$/.test(w)).length >= 6;
}
const FILLER = [/ลองเลือกสิ่งที่ทำได้เลยหนึ่งข้อจากคำอ่านนี้/, /ลองสังเกตว่าตัวเองทำอะไรแล้วมีพลังที่สุด/, /ลองทักทายเพื่อนที่ไม่ได้คุยกันนานสักคน/, /ลองเลือกเรื่องสำคัญหนึ่งเรื่อง แล้วกำหนดวันเริ่ม/,
  /Pick one thing from this reading you can do right away/i, /Notice what gives you the most energy/i, /Reach out to one friend you haven't talked to/i, /Pick one important plan and give it a clear start date/i,
  /从这次解读里挑一件马上能做的事/, /留意自己做什么事时最有劲/, /这周可以主动问候一位很久没联系的朋友/, /挑一件重要的事，给它定一个明确的开始日期/];
const NONE_LINE = /ไม่ได้พูดถึงเรื่อง\S*โดยตรงในครั้งนี้|ให้ข้อมูลเรื่อง\S*โดยตรงไม่มากนัก|doesn't speak to .* directly|says little about .* directly|这次没有直接谈到|的直接说法不多/;
function tautology(t) {
  for (const m of t.matchAll(/(\S{6,}?)ชวนให้(\S{6,})/g)) {
    const subj = m[1], obj = m[2];
    for (let k = 0; k + 6 <= subj.length; k++) if (obj.includes(subj.slice(k, k + 6))) return subj.slice(k, k + 6);
  }
  return "";
}
const START_TH = /^(?:จาก|ดูที่|สำหรับ|ส่วน|ในส่วนของ|ในฐานะ)/, START_EN = /^(?:Looking at|With (?:the|your)|As for)\b/;
const ACT = /^(?:คุณ)?(?:ควร|ลอง|หมั่น|ฝึก|เลือก|จด|ตั้ง|เปิด|ใช้|เริ่ม|ค่อย|ปล่อย|พัก|รักษา|เตรียม|ปรับ|นับ|เก็บ|แบ่ง|วาง|จัด|เติม|หัน|พก|ใส่|เขียน|ทบทวน|ขอบคุณ|หา|ให้|คุย|ฟัง|บอก|ทัก|ออก|ดูแล|ยิ้ม|เดิน|ลด|เพิ่ม|ชวน|อย่า|รอ|กล้า|เชื่อมั่น|ภูมิใจ|ยึด|เห็นคุณค่า|ต้อนรับ|ทำ|สำรวจ|หยุด|เลี่ยง|ระวัง|ถาม|ขอ|ส่ง|ชื่นชม|อดทน|ทุ่ม|กัน|ตรวจ|ยืด|เล็ม|แปรง|ทา|นวด|เงย|โฟกัส|สังเกต|ปิด|เผื่อ|อ่าน|เลื่อน|ชะลอ|โทร|นัด|เปลี่ยน|ระบาย|จับ|ขยับ|เดิน|ออม|เช็ก|มอง|แสดง|ตอบ|สร้าง|ปลูก|ไป|มา|เก็บ|คิด|ศึกษา|เรียน|หัน|สะท้อน|ใจดี)/;
const TRAIT_IN = /^\S*(?:ได้ดี|เก่ง|เหมาะกับ|มัก|คือหลัก|มีเสน่ห์|เป็นคน)/;
// the words after the frame: an action must start the next word, or the word after it when a name has two words ("ปีมะเส็ง ธาตุน้ำ")
const FRAMES = [/ตามคำแนะนำของ\S+ (\S+)(?: (\S+))?/g, /เพื่อใช้จุดเด่นของ.{1,40}?ให้เต็มที่ (\S+)(?: (\S+))?/g, /\S(?:เป็นสัญญาณให้|แนะให้|ชวนให้)(\S+)()/g];
const WRAP = /(?:ตำราฝากข้อคิดไว้ว่า|ข้อคิดที่ตำราฝากไว้มีอยู่ว่า)(?:คุณ(?:เป็น|มี)|หลายตำรา|ทิศ\S*เป็นทิศ)/;
function frameIssues(t) {
  const out = [];
  const ok = n => !!n && ACT.test(n) && !TRAIT_IN.test(n);
  for (const re of FRAMES) for (const m of t.matchAll(re)) if (!ok(m[1]) && !ok(m[2])) out.push(m[0].slice(0, 60));
  const w = t.match(WRAP); if (w) out.push(w[0]);
  return out;
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

/* ---------------- measure ---------------- */
export async function measure(C) {
  const { FA, RD } = await mods();
  const per = {}, ex = {}, note = (k, s) => { (ex[k] = ex[k] || []).length < 14 && ex[k].push(s); };
  const P = d => (per[d] = per[d] || { n: 0, Q1: 0, Q2th: 0, Q2en: 0, Q2zh: 0, Q2dup: 0, Q3: 0, Q4: 0, Q5th: 0, Q5thSuo: 0, Q5en: 0, Q5echo: 0, Q6: 0, Q7: 0, Q8: 0, groupsTh: 0, groupsEn: 0, ov: 0 });
  for (const row of C) {
    const p = P(row.d); p.n++;
    const tag = `${row.set}:${row.d}#${row.i}`;
    for (const L of LANGS) {
      const res = row.g[L], secs = res.sections || [];
      const names = namesOf(FA, row.d, row.facts.items, L, row.facts.headline);
      for (const s of secs) {
        const parts = RD.planSection(s, L), gist = parts[0] ? parts[0].text : "";
        if (L === "th") for (let k = 0; k < parts.length - 1; k++) {
          const a = parts[k], b = parts[k + 1];
          if (a.para !== b.para || !(a.visible && !b.visible)) continue;
          const why = danglingTh(a.text, b.text); if (why) { p.Q1++; note("Q1", `${tag} [${s.id}] ${why}: …${a.text.slice(-35)} ‖ ${b.text.slice(0, 20)}`); }
        }
        if (s.id === "overview") {
          if (L === "th") p.ov++;
          if (FORMULA[L].test(gist)) p["Q2" + L]++;
          if (/最突出是这次最突出|最突出.{0,12}是这次最突出/.test(s.paragraphs.join(""))) { p.Q2dup++; note("Q2dup", `${tag} ${gist}`); }
          const why = !meaningLeft(gist, names, L) ? "label only" : /\d+\s*%/.test(gist) ? "raw percentage" : /[一-鿿]{2}\s[一-鿿]{2}\s[一-鿿]{2}/.test(L === "th" ? gist : "") ? "pillars" : "";
          if (why) { p.Q3++; note("Q3", `${tag} ${L} ${why}: ${gist.slice(0, 110)}`); }
          // Q7: one finding
          const items = (row.facts.items || []).filter(it => !/^spread\./.test(it.id));
          if (items.length === 1) {
            const nm = namesOf(FA, row.d, items, L)[0] || "", cnt = nm ? (L === "en" ? s.paragraphs[0].toLowerCase() : s.paragraphs[0]).split(nm).length - 1 : 0;
            if (FORMULA[L].test(s.paragraphs[0]) || /最突出|stands out most|เด่นที่สุด/.test(s.paragraphs[0]) || cnt > 1) { p.Q7++; note("Q7", `${tag} ${L}: ${s.paragraphs[0].slice(0, 120)}`); }
          }
        } else {
          if (L === "th") { p.groupsTh++; if (START_TH.test(gist)) p.Q5th++; if (/^ส่วน(?!ตัว)/.test(gist)) { p.Q5thSuo++; note("Q5suo", `${tag} [${s.id}] ${gist.slice(0, 60)}`); } }
          if (L === "en") {
            p.groupsEn++; if (START_EN.test(gist)) p.Q5en++;
            const m = /^(?:Looking at|As for|With) (?:the |your |a |an )?([A-Za-z]+)[^,]*, (?:the |your |a |an )?(\w+)/i.exec(gist);
            if (m && m[1].toLowerCase() === m[2].toLowerCase()) { p.Q5echo++; note("Q5echo", `${tag} [${s.id}] ${gist.slice(0, 80)}`); }
          }
        }
        // Q4 filler (outside the asked topic group)
        for (const para of s.paragraphs) {
          const f = FILLER.find(re => re.test(para)) || (s.id !== row.facts.topic && NONE_LINE.test(para) ? NONE_LINE : null);
          if (f) { p.Q4++; note("Q4", `${tag} ${L} [${s.id}] ${(para.match(f) || [""])[0].slice(0, 60)}`); }
          if (L === "th") {
            if (/ชวนให้ให้/.test(para)) { p.Q4++; note("Q4", `${tag} [${s.id}] ชวนให้ให้`); }
            const tt = tautology(para); if (tt) { p.Q4++; note("Q4", `${tag} [${s.id}] tautology "${tt}": ${para.slice(0, 80)}`); }
            for (const fi of frameIssues(para)) { p.Q6++; note("Q6", `${tag} [${s.id}] ${fi}`); }
          }
        }
      }
    }
    // Q8: second finding (and the tarot lead)
    const ov = L => ((row.g[L].sections || []).find(s => s.id === "overview") || { paragraphs: [""] }).paragraphs.join(" ");
    const o = Object.fromEntries(LANGS.map(L => [L, namedOrder(FA, row, L, ov(L))]));
    if (o.th.length >= 2 && (o.th[1] !== o.en[1] || o.th[1] !== o.zh[1])) { p.Q8++; note("Q8", `${tag} th ${o.th.slice(0, 2)} en ${o.en.slice(0, 2)} zh ${o.zh.slice(0, 2)}`); }
    if (row.d === "tarot" && LANGS.some(L => !/^card\./.test(o[L][0] || ""))) { p.Q8++; note("Q8", `${tag} tarot lead ${o.th[0]} / ${o.en[0]} / ${o.zh[0]}`); }
  }
  // shares
  const tot = {}; for (const q of Object.values(per)) for (const [k, v] of Object.entries(q)) tot[k] = (tot[k] || 0) + v;
  const shares = { Q2th: tot.Q2th / tot.ov, Q2en: tot.Q2en / tot.ov, Q2zh: tot.Q2zh / tot.ov, Q5th: tot.Q5th / tot.groupsTh, Q5en: tot.Q5en / tot.groupsEn };
  // Q10 taksa love
  const strip = t => t.replace(/ดาว\S+|วัน\S+|\d+(?:–\d+)?/g, "#");
  const tl = C.filter(r => r.d === "taksa").map(r => ((r.g.th.sections || []).find(s => s.id === "love") || { paragraphs: [""] }).paragraphs[0]).filter(Boolean);
  const q10 = { users: tl.length, distinct: new Set(tl.map(strip)).size };
  return { per, totals: tot, shares, q10, examples: ex };
}
/** Q12: distinct knowledge-base meanings shown, per domain and language (TH: facts' meanings; EN / ZH: their data) */
export async function contentOf(FA, rows) {
  const out = {};
  for (const x of rows) for (const L of LANGS) {
    const res = FA.compose(JSON.parse(JSON.stringify(x.facts)), { seed: x.seed, lang: L });
    const text = (res.sections || []).map(s => s.paragraphs.join(" ")).join(" ");
    const ms = new Set();
    for (const it of x.facts.items || []) {
      const y = L === "en" ? FA.en.item(x.d, it) : L === "zh" ? FA.zh.item(x.d, it) : it; if (!y) continue;
      for (const arr of Object.values(y.meanings || {})) for (const m of [].concat(arr)) {
        const k = String(m).replace(/^[^\s]*\s/, "").slice(0, L === "zh" ? 10 : 24).trim();
        if (k.length >= (L === "zh" ? 6 : 12) && (L === "en" ? text.toLowerCase().includes(k.toLowerCase()) : text.includes(k))) ms.add(it.id + "|" + k);
      }
    }
    const key = x.d + " " + L; out[key] = (out[key] || 0) + ms.size;
  }
  return out;
}
export function staticIssues2(repo = REPO) {
  const rd = f => readFileSync(join(repo, f), "utf8"), out = [];
  const hub = rd("fortune.html"), lucky = rd("luckycolor.js");
  if (/ปาจื้อ \(สี่เสา\)/.test(hub)) out.push("hub: ปาจื้อ (สี่เสา)");
  if (/ปากั้ว/.test(hub)) out.push("hub: ปากั้ว");
  if (/แต่ละศาสตร์เลือกหัวข้อ ความรัก การงาน การเงิน/.test(hub)) out.push("hub: topic sentence");
  for (const m of lucky.matchAll(/(?:MEAN_TH|GOAL_TH) = \{([^}]*)\}/g)) for (const v of m[1].matchAll(/"([^"]+)"/g)) if (/\S \S/.test(v[1]) && !/และ/.test(v[1]) && /[ก-๎]/.test(v[1])) out.push("luckycolor: " + v[1]);
  return out;
}
export function reportIssues2(repo = REPO) {
  global.window = globalThis; globalThis.LQI18N_Q = globalThis.LQI18N_Q || [];
  require(join(repo, "i18n", "en-report.js")); require(join(repo, "i18n", "zh-report.js"));
  const dict = {}; for (const q of globalThis.LQI18N_Q) for (const L of Object.keys(q)) Object.assign(dict[L] = dict[L] || {}, q[L]);
  const RP = require(join(repo, "report.js"));
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : "{" + k + "}"));
  const tOf = L => (k, th, v) => fill(L === "th" ? th : (dict[L] && dict[L][k]) || th, v);
  const births = [{ y: 1984, m: 5, d: 21, h: 7, mi: 15, gender: "female" }, { y: 1972, m: 10, d: 9, h: 20, mi: 40, gender: "male" }, { y: 1996, m: 2, d: 29, noTime: true, gender: "female" },
    { y: 1966, m: 7, d: 4, h: 3, mi: 5, gender: "male" }, { y: 2003, m: 12, d: 12, h: 12, mi: 12, gender: "female" }, { y: 1979, m: 1, d: 31, h: 16, mi: 50, gender: "male" }];
  const now = new Date(2026, 10, 16), out = [];
  const ADV = /ข้อแนะนำทั่วไป|วิธีปรับตามตำรา|สิ่งที่ควรทำ|สิ่งที่ทำได้|เคล็ด|\bTry\b|\btry\b|建议|不妨|调整的方法/;
  for (const [i, b] of births.entries()) for (const L of LANGS) {
    const rep = i % 3 === 0 ? RP.buildBasic(b, { lang: L, t: tOf(L), now }) : i % 3 === 1 ? RP.buildAnnual(b, 2027, { lang: L, t: tOf(L) }) : RP.buildCompat(b, births[0], { lang: L, t: tOf(L) });
    const paras = (rep.parts || []).flatMap(p => p.sections || []).flatMap(s => s.paragraphs || []);
    const units = paras.flatMap(q => L === "zh" ? q.split(/(?<=[。！？])/) : L === "en" ? q.split(/(?<=[.!?])\s+/) : q.split(/(?=ข้อแนะนำทั่วไป|วิธีปรับตามตำรา|สิ่งที่ควรทำ|สิ่งที่ทำได้จาก|เคล็ดเสริมดวง)/)).map(u => u.trim());
    const seen = {}; for (const u of units) if (u.length >= (L === "zh" ? 10 : 30) && ADV.test(u)) seen[u] = (seen[u] || 0) + 1;
    for (const [u, k] of Object.entries(seen)) if (k > 1) out.push(`report#${i} ${L} ×${k}: ${u.slice(0, 70)}`);
  }
  return out;
}
export const BASE_CONTENT = () => JSON.parse(readFileSync(join(REPO, "tests", "unit", "fortune-quality-base-content.json"), "utf8"));
