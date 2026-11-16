// tools/fortune-quality-metrics-5.mjs — FIXED METRICS, round 5 of the fortune reading quality work (coordinator order after the
// independent re-check ~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK-4.md returned NOT OK on d0c8b43). Appended to the
// locked set of phase fortune-quality (evals-locks/fortune-quality.sha256) BEFORE the round-5 fixes; rounds 1 to 4 stay locked.
// Detectors are written by the builder from the re-check's findings (the reviewer's scripts in r4rev/ were not read or copied).
//
// Inputs (synthetic: engine-built facts, tools/fortune-review-export.mjs factsFor; FortuneAI.compose; no network):
//   a NEW input set "fresh5": 15 domains x 8, lcg(271829 + k*7919), seed 40009 + i*97 = 120 inputs, each in TH / EN / ZH, gentle
//   AND straight (the straight wording is composed with { straight: true }) = 240 readings per language
//   report: 5 NEW births; basic x 5 (each with its own "now" month), annual 2028 x 2, compatibility x 1, each in TH / EN / ZH
//
// Metrics (counts of failures; target 0 unless a share is stated):
//   V1  (R1) bare-adjective group starts (TH): the first paragraph of a group (the overview too; not the brief, whose lines open with
//       an area label, and not the advice group, which opens with an instruction) opens with a predicate that has no subject ("โรแมนติก ใส่ใจบรรยากาศ…", "ประณีต มีรสนิยม…", "เข้ากับคนได้ง่าย…",
//       "มีชื่อเสียงและ…", "มั่นคงและน่าเชื่อถือ…"); report sections are read the same way
//   V2  (R1) a partly stripped hedge (TH): a paragraph or clause that starts with "ไทย" / "จีน" / "ความเชื่อ…" or a stand-alone "ไทย" /
//       "จีน" word ("ตามความเชื่อไทย ฝัน…" → "ไทย ฝัน…"); plus the stray "ลงมือ ๆ" (readings and reports)
//   V3  (R1) orphan back-references (TH / EN / ZH): a back-reference ("อีกความหมายของX…", "ตำรายังบอกด้วยว่า…", "X ยังบอกอีกว่า…",
//       "Another side of X…", "X also shows that…", "X adds that…", "X的另一层意思是…", "X还说明…", "X也提示…") in a group whose earlier
//       text does not name X (or, for "ตำรายัง…", any finding)
//   V4  (R1) per-group source on multi-system pages (horoscope, bazi, report; TH / EN / ZH): every topic group (not the overview,
//       brief or advice) names at least one finding of its reading; in the report (whose bazi / taksa / lek7 parts carry the system
//       as their title), the cross-system deep-dive: every run of paragraphs from one system names a finding of that system or the
//       system itself (runs from the section's src list when the report gives one, else each paragraph)
//   V5  (R2) month names in the report: the "same month" line never shows a bare month number ("เดือน12", "as 12", "和12差不多"),
//       and no TH report text shows "เดือน" + a bare number
//   V6  (R3) siam si: no meaning verb over the verse image (EN "… is read to mean that your verse compares…", "… means that your
//       verse…"; ZH "…显示/说明/意味着…签诗…")
//   V7  overview openers (EN / ZH; TH counted): the overview's first sentence opens with a stock source lead (round-4 stockLead) in
//       <= 15 % of the readings per language, and no overview has more than one sentence that opens with a stock source lead
//   V8  report closers (TH): each closing line ("เก็บไว้เฉพาะส่วนที่ใช้ได้…", "ลองเลือกสักหนึ่งข้อ…", the 10 closers of the composer)
//       at most once per report part, and the same closer at most once per report
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { REPO, LANGS } from "./fortune-quality-metrics.mjs";
import { namesOf, stockLead } from "./fortune-quality-metrics-4.mjs";
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
export const FRESH5 = { name: "fresh5", n: 8, rng: k => 271829 + k * 7919, seed: i => 40009 + i * 97 };
export async function corpus() {
  const { EX, FA } = await mods();
  const out = [];
  for (const d of EX.DOMAINS) {
    const r = EX.lcg(FRESH5.rng(EX.DOMAINS.indexOf(d)));
    for (let i = 0; i < FRESH5.n; i++) {
      const facts = EX.factsFor(d, i, r), seed = FRESH5.seed(i);
      for (const straight of [false, true]) {
        const row = { set: "fresh5", d, i, straight, facts, seed, g: {} };
        for (const L of LANGS) row.g[L] = FA.compose(JSON.parse(JSON.stringify(facts)), { seed, lang: L, straight });
        out.push(row);
      }
    }
  }
  return out;
}

/* ---------------- detectors ---------------- */
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// a predicate with no subject at the start of a Thai line
export const BARE_TH = new RegExp("^(?:มี(?!ความหมาย|โอกาสที่จะเกิด|ตัวเลือก|ทาง|สิ่ง|เรื่อง|ข่าว|อุปสรรค|ปัญหา|แรง|เป้าหมายร่วม|คนคอย|หลาย)|เป็น(?!ปี|ช่วง|จังหวะ|เวลา|สัญญาณ|ลาง|วัน|เดือน|เรื่อง|ภาพ)|โรแมนติก|ประณีต|มั่นคง|เข้ากับ|เด็ดขาด|ยุติธรรม|" +
  "ลึกซึ้ง|หนักแน่น|สติปัญญา|ฉลาด|อ่อนโยน|อ่อนหวาน|ใจ(?:ดี|เย็น|กว้าง|ร้อน|อ่อน|สู้)|ช่าง(?:คิด|สังเกต|พูด|เจรจา)|เก่ง|รัก(?!ษา)|ชอบ|มัก|กล้า|ขยัน|ร่าเริง|อบอุ่น|" +
  "จริงใจ|ซื่อ|ละเอียด|รอบคอบ|อดทน|มุ่งมั่น|สุขุม|ทะเยอทะยาน|ตรงไปตรงมา|เปิดเผย|มั่นใจ|เรียบร้อย|สดใส|คล่องแคล่ว|คุยเก่ง|พูดเก่ง|ยืดหยุ่น|ปรับตัว|" +
  "สร้างสรรค์|มองการณ์|เห็นอกเห็นใจ|เอาใจใส่|ใส่ใจ|ให้ความสำคัญ|ถนัด|เหมาะกับ(?!การ)|ดู(?:อบอุ่น|สดใส|เรียบร้อย|น่า|เป็นคน|ดี)|รักสงบ|น่าเชื่อถือ|น่ารัก|" +
  "ทำงาน(?:เก่ง|ได้ดี|หนัก)|พูดจา|คิดเร็ว|คิดลึก|เป็นคน|เป็นที่)");
// a Thai instruction ("ลอง…", "ตั้ง…") opens advice naturally: not a bare predicate
const INSTR_TH = /^(?:ลอง|เลือก|จัด|ตั้ง(?!แต่|ใจ)|ใช้|เก็บ|เช็ก|ตรวจ|พัก|ปรึกษา|วางแผน|ให้เวลา|เริ่ม|ฝึก|อย่า|ควร|รักษา|เขียน|จด|แบ่ง|ชวน|ทบทวน|ระวัง|เตรียม|ออม|หมั่น)/;
export const bareTh = t => { const s = String(t || "").trim(); return BARE_TH.test(s) && !INSTR_TH.test(s); };
export function hedgeIssuesTh(p) {
  const out = [], s = String(p).trim();
  if (/^(?:ไทย|จีน|ความเชื่อ|เชื่อไทย|แล้ว)(?:\s|$)/.test(s) || /^ความเชื่อ(?:ไทย|จีน)/.test(s)) out.push("starts with a hedge fragment: " + s.slice(0, 40));
  const tok = s.split(/\s+/);
  tok.forEach((w, i) => { if (i && /^(?:ไทย|จีน)$/.test(w)) out.push("stand-alone " + w + ": …" + tok.slice(Math.max(0, i - 2), i + 3).join(" ")); });
  for (const m of s.matchAll(/ลงมือ\s?ๆ/g)) out.push("ลงมือ ๆ: …" + s.slice(Math.max(0, m.index - 20), m.index + 10));
  return out;
}
// back-references: { re, named } — named: the group of the regex that holds the name (or null: any finding before it)
// ("X also shows that…" / "X还说明…" add a second finding to the one before: "also" points at the earlier line, not at X; not counted)
const BACK = {
  th: [{ re: /อีกความหมายของ(\S{2,40}?)คือ/g, g: 1 }, { re: /(?:^|\s)(\S{2,40}?)(?:ยังบอกอีกว่า|ยังช่วยเสริมด้วยว่า)/g, g: 1 }, { re: /ตำรายัง(?:บอก|ชี้|อ่าน|มอง)/g, g: 0 }],
  en: [{ re: /\b(?:Another side of|Another meaning of) ((?:the |your )?[^,.]{2,60}?) is\b/gi, g: 1 }],
  zh: [{ re: /([^，。：；！？]{1,24}?)的另一层意思是/g, g: 1 }],
};
export function orphanRefs(text, names, L) {
  const out = [], lo = L === "en" ? text.toLowerCase() : text;
  for (const { re, g } of BACK[L]) for (const m of text.matchAll(re)) {
    const at = m.index + (m[0].length - m[0].trimStart().length), before = lo.slice(0, at);
    if (!g) { if (!names.some(n => n.length >= 2 && before.indexOf(n) >= 0)) out.push(m[0].trim().slice(0, 50)); continue; }
    const x = (L === "en" ? m[g].toLowerCase() : m[g]).replace(/^(?:the |your )/, "").trim();
    // the names the back-reference points at (a name inside x, or x inside a name)
    const hit = names.filter(n => n.length >= 2 && (x.indexOf(n) >= 0 || n.indexOf(x) >= 0));
    if (!hit.length) continue; // not a finding (a plain clause)
    if (!hit.some(n => before.indexOf(n) >= 0 || before.indexOf(x) >= 0)) out.push(m[0].trim().slice(0, 60));
  }
  return out;
}
const named = (text, names, L) => { const t = L === "en" ? text.toLowerCase() : text; return names.some(n => n.length >= 2 && t.indexOf(n) >= 0); };
const MULTI = ["horoscope", "bazi"];
// the names of the 3 report systems (the report parts carry them as titles; the deep-dive needs them per run)
const SYS = { th: { bazi: ["แปดอักษร", "八字", "ปาจื้อ"], taksa: ["ทักษา"], lek7: ["เลข 7 ตัว"] }, en: { bazi: ["BaZi"], taksa: ["Taksa"], lek7: ["Lek 7"] }, zh: { bazi: ["八字"], taksa: ["塔克萨"], lek7: ["七数九宫"] } };
const TOPIC_SKIP = new Set(["overview", "brief", "advice"]);
const SM = { th: /แนวโน้มคล้ายกับเดือน\s?(\S+)/, en: /Much the same as (\S+?),/, zh: /走势和(\S+?)差不多/ };
const SIAM_VERB = { en: /\b(?:means?|is read to mean|are read to mean|suggests?|shows?|indicates?|points to|reflects?)(?: that)? your verse\b/i, zh: /(?:显示|说明|意味着|表示|提示)[，,]?(?:你的)?(?:这支)?签(?:诗|文)/ };
const sentencesOf = (t, L) => (L === "zh" ? String(t).split(/(?<=[。！？])/) : L === "en" ? String(t).split(/(?<=[.!?])\s+/) : String(t).split(/\s+/)).map(x => x.trim()).filter(Boolean);

/* ---------------- measure ---------------- */
export async function measure(C) {
  const { FA } = await mods();
  const per = {}, ex = {}, note = (k, s) => { (ex[k] = ex[k] || []).length < 20 && ex[k].push(s); };
  const K0 = { n: 0, V1: 0, V2: 0, V3: 0, V4: 0, V6: 0, V7th: 0, V7en: 0, V7zh: 0, V7multi: 0 };
  const P = d => (per[d] = per[d] || Object.assign({}, K0));
  const ov = { th: 0, en: 0, zh: 0 };
  for (const row of C) {
    const p = P(row.d); p.n++;
    const tag = `${row.set}:${row.d}#${row.i}${row.straight ? "s" : ""}`;
    for (const L of LANGS) {
      const secs = row.g[L].sections || [], names = namesOf(FA, row.d, row.facts.items, L);
      for (const s of secs) {
        const text = s.paragraphs.join(" ");
        if (L === "th") {
          if (s.id !== "brief" && s.id !== "advice" && s.paragraphs[0] && bareTh(s.paragraphs[0])) { p.V1++; note("V1", `${tag} [${s.id}] ${s.paragraphs[0].slice(0, 70)}`); }
          for (const q of s.paragraphs) for (const f of hedgeIssuesTh(q)) { p.V2++; note("V2", `${tag} [${s.id}] ${f}`); }
        }
        for (const f of orphanRefs(text, names, L)) { p.V3++; note("V3", `${tag} ${L} [${s.id}] ${f}`); }
        if (MULTI.includes(row.d) && !TOPIC_SKIP.has(s.id) && !named(text, names, L)) { p.V4++; note("V4", `${tag} ${L} [${s.id}] ${text.slice(0, 80)}`); }
        if (row.d === "siamsee" && L !== "th" && SIAM_VERB[L].test(text)) { p.V6++; note("V6", `${tag} ${L} [${s.id}] ${text.slice(0, 90)}`); }
        if (s.id === "overview") {
          ov[L]++;
          const sens = s.paragraphs.flatMap(q => sentencesOf(q, L === "th" ? "zh" : L)), leads = sens.filter(x => stockLead(x, names, L));
          if (sens[0] && stockLead(sens[0], names, L)) { p["V7" + L]++; note("V7" + L, `${tag} ${sens[0].slice(0, 80)}`); }
          if (L !== "th" && leads.length > 1) { p.V7multi++; note("V7multi", `${tag} ${L} ×${leads.length}: ${leads.map(x => x.slice(0, 30)).join(" | ")}`); }
        }
      }
    }
  }
  const tot = {}; for (const q of Object.values(per)) for (const [k, v] of Object.entries(q)) tot[k] = (tot[k] || 0) + v;
  return { per, totals: tot, shares: { th: tot.V7th / ov.th, en: tot.V7en / ov.en, zh: tot.V7zh / ov.zh }, examples: ex };
}

/** the report: V1 / V2 (TH), V4 (sources), V5 (month names), V8 (TH closers) */
export async function reportIssues5(repo = REPO) {
  const { FA } = await mods();
  global.window = globalThis; globalThis.LQI18N_Q = globalThis.LQI18N_Q || [];
  require(join(repo, "i18n", "en-report.js")); require(join(repo, "i18n", "zh-report.js"));
  const dict = {}; for (const q of globalThis.LQI18N_Q) for (const L of Object.keys(q)) Object.assign(dict[L] = dict[L] || {}, q[L]);
  const RP = require(join(repo, "report.js")), LC = require(join(repo, "lifecal.js")), KB = require(join(repo, "lifecal-kb.js"));
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : "{" + k + "}"));
  const tOf = L => (k, th, v) => fill(L === "th" ? th : (dict[L] && dict[L][k]) || th, v);
  const births = [{ y: 1958, m: 5, d: 21, h: 4, mi: 45, gender: "male" }, { y: 1979, m: 10, d: 2, h: 13, mi: 20, gender: "female" }, { y: 1991, m: 1, d: 30, noTime: true, gender: "male" },
    { y: 1966, m: 8, d: 14, h: 19, mi: 5, gender: "female" }, { y: 2000, m: 12, d: 9, h: 8, mi: 0, gender: "male" }];
  const nows = [new Date(2026, 10, 16), new Date(2026, 9, 3), new Date(2027, 1, 20), new Date(2026, 11, 1), new Date(2027, 5, 12)];
  const closers = FA._internal.banks.CLOSERS.map(c => new RegExp(esc(c).replace(/\\\{(?:N|T)\\\}/g, "\\S{1,30}?"), "g"));
  const out = { V1: [], V2: [], V4: [], V5: [], V8: [] };
  const jobs = [];
  births.forEach((b, i) => jobs.push({ kind: "basic", i, b }));
  jobs.push({ kind: "annual", i: 0, b: births[1] }, { kind: "annual", i: 1, b: births[3] }, { kind: "compat", i: 0, b: births[0], b2: births[4] });
  for (const j of jobs) for (const L of LANGS) {
    const t = tOf(L), tag = `report ${j.kind}#${j.i} ${L}`;
    const rep = j.kind === "basic" ? RP.buildBasic(j.b, { lang: L, t, now: nows[j.i] }) : j.kind === "annual" ? RP.buildAnnual(j.b, 2028, { lang: L, t }) : RP.buildCompat(j.b, j.b2, { lang: L, t });
    const parts = rep.parts || [];
    // names per system (basic report)
    let sysNames = null;
    if (j.kind === "basic") {
      const b = Object.assign({ tz: 7 }, j.b), B = LC.bazi(b), Tk = LC.taksa(b), L7 = LC.lek7(b), nm = f => namesOf(FA, f.domain, f.items, L);
      const tops = ["overall", "work", "money", "love"];
      sysNames = { bazi: tops.flatMap(tp => nm(KB.baziFacts(B, tp, {}))), taksa: tops.flatMap(tp => nm(KB.taksaFacts(Tk, tp, {}))), lek7: tops.flatMap(tp => nm(KB.lek7Facts(L7, tp))) };
    }
    const seenCloser = {};
    for (const part of parts) {
      let inPart = 0;
      for (const s of part.sections || []) {
        const paras = s.paragraphs || [], text = paras.join(" ");
        if (L === "th") {
          if (paras[0] && s.id !== "advice" && bareTh(paras[0])) out.V1.push(`${tag} [${part.id}/${s.id}] ${paras[0].slice(0, 60)}`);
          for (const q of paras) for (const f of hedgeIssuesTh(q)) out.V2.push(`${tag} [${part.id}/${s.id}] ${f}`);
          if (/เดือน\s?\d{1,2}(?![\d–\-/])/.test(text) || /เดือน\s?\d/.test(s.title || "")) out.V5.push(`${tag} [${part.id}/${s.id}] ${(text.match(/.{0,20}เดือน\s?\d.{0,20}/) || [s.title])[0]}`);
          for (const re of closers) for (const m of text.matchAll(re)) {
            inPart++; const k = m[0].replace(/ของ\S+ก็พอ$/, ""); seenCloser[k] = (seenCloser[k] || 0) + 1;
            if (seenCloser[k] === 2) out.V8.push(`${tag} same closer twice: ${m[0].slice(0, 50)}`);
          }
        }
        for (const q of paras) { const m = SM[L].exec(q); if (m && /^\d{1,2}$/.test(m[1])) out.V5.push(`${tag} [${part.id}/${s.id}] ${m[0]}`); }
        // the deep-dive mixes the 3 systems in one section: each run of paragraphs from one system (s.src, when the report gives it;
        // otherwise each paragraph) names a finding of that system or the system itself
        if (sysNames && part.id === "deep") {
          const src = Array.isArray(s.src) && s.src.length === paras.length ? s.src : null, runs = [];
          paras.forEach((q, k) => { if (src && k && src[k] === src[k - 1]) runs[runs.length - 1].t += " " + q; else runs.push({ sys: src ? src[k] : null, t: q }); });
          for (const r of runs) {
            const ok = r.sys ? named(r.t, sysNames[r.sys].concat(SYS[L][r.sys].map(x => (L === "en" ? x.toLowerCase() : x))), L) : ["bazi", "taksa", "lek7"].some(k => named(r.t, sysNames[k].concat(SYS[L][k].map(x => (L === "en" ? x.toLowerCase() : x))), L));
            if (!ok) out.V4.push(`${tag} [deep/${s.id}${r.sys ? "/" + r.sys : ""}] ${r.t.slice(0, 70)}`);
          }
        }
      }
      if (L === "th" && inPart > 1) out.V8.push(`${tag} part ${part.id}: ${inPart} closers`);
    }
  }
  return out;
}
