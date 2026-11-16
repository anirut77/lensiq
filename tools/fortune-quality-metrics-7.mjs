// tools/fortune-quality-metrics-7.mjs — FIXED METRICS, round 7 of the fortune reading quality work (coordinator order after the
// independent re-check ~/LENSIQ-field/review/fortune-quality-2026-11-16/RECHECK-6.md returned NOT OK on 1168a59). Appended to the
// locked set of phase fortune-quality (evals-locks/fortune-quality.sha256) BEFORE the round-7 fixes; rounds 1 to 6 stay locked.
// Detectors are written by the builder from the re-check's findings (the reviewer's scripts in r6rev/ were not read or copied).
//
// Inputs (synthetic: engine-built facts, tools/fortune-review-export.mjs factsFor; FortuneAI.compose; no network):
//   a NEW input set "fresh7": 15 domains x 16, lcg(552211 + k*6007), seed 80021 + i*149 = 240 inputs, each in TH / EN / ZH, gentle
//   AND straight = 480 readings per language
//   report: 5 NEW births; basic x 5 (each with its own "now"), annual 2029 x 2, compatibility x 1, each in TH / EN / ZH
//
// Metrics (counts of failures; target 0):
//   X1  (N1) "คุณ" put in front of a noun subject, a label or an advice frame: "คุณงบประมาณ…", "คุณห้าธาตุ…", "คุณโปรเจกต์…",
//       "คุณนก…", "คุณกระแสเงิน…", "คุณข้อเสนอ…", "คุณวิธีเสริม…", "คุณเป็นจังหวะ…" — at a paragraph start or right after "ว่า" /
//       "ให้" / a space (words that start with คุณ — คุณภาพ, คุณค่า, คุณธรรม, คุณสมบัติ, คุณประโยชน์, คุณความดี — are not counted);
//       readings and report sections, TH
//   X2  (N2) EN: a sentence that opens with a finding's name and a verb a finding does not do ("Pair 20 finds its way into someone's
//       heart…"), right after a sentence whose subject is another noun phrase ("Your charm is quiet and lasting.")
//   X3  (N3) EN "By tradition,": a capital after the comma that is not a proper noun ("By tradition, A good offer…"); a proper noun in
//       lower case ("By tradition, thai folk belief…"); two in one paragraph; a second hedge word in the same sentence; a hedged
//       calculation ("By tradition, adding up all the digits…")
//   X4  (N4) a lead or reporting verb stacked on a glossary line ("Jupiter means that in Taksa…", "再看木星，在塔克萨命理里…",
//       "火星提示，在塔克萨…"), and stacked labels at a paragraph start ("塔克萨：土星：…", "Taksa: Jupiter: …"); readings and reports
//   X5  (N5) a doubled bracket ("(คู่ 69, คู่รักและชื่อเสียง) (คู่ 69)", "(เลขซ้ำ 3 ตัว, 000) (เลขซ้ำ 3 ตัว)") and Chinese punctuation
//       inside a bracket of a Thai reading ("(กว้าที่ 37 พลังครอบครัว，家人 Jiā Rén)")
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
export const FRESH7 = { name: "fresh7", n: 16, rng: k => 552211 + k * 6007, seed: i => 80021 + i * 149 };
export async function corpus() {
  const { EX, FA } = await mods();
  const out = [];
  for (const d of EX.DOMAINS) {
    const r = EX.lcg(FRESH7.rng(EX.DOMAINS.indexOf(d)));
    for (let i = 0; i < FRESH7.n; i++) {
      const facts = EX.factsFor(d, i, r), seed = FRESH7.seed(i);
      for (const straight of [false, true]) {
        const row = { set: "fresh7", d, i, straight, facts, seed, g: {} };
        for (const L of LANGS) row.g[L] = FA.compose(JSON.parse(JSON.stringify(facts)), { seed, lang: L, straight });
        out.push(row);
      }
    }
  }
  return out;
}

/** targeted inputs for the shapes RECHECK-6 found that the random set rarely composes: numbers 0920202011 (pair 20, N2) in EN, and
 *  hexagram 37 (家人, N5) in TH; 12 seeds each, gentle and straight */
export async function targeted() {
  const { FA } = await mods();
  const NM = require(join(REPO, "numbers.js")), IC = require(join(REPO, "iching.js")), out = [];
  for (let i = 0; i < 12; i++) for (const straight of [false, true]) {
    const f1 = NM.buildFacts(NM.analyzePhone("0920202011"), "overall", {});
    out.push({ set: "t7", d: "numbers", i, straight, facts: f1, g: { en: FA.compose(JSON.parse(JSON.stringify(f1)), { seed: 1 + i, lang: "en", straight }) } });
    const f2 = IC.buildFacts(IC.cast([7, 8, 7, 8, 7, 7]), ["overall", "work", "money", "love"][i % 4], {});
    out.push({ set: "t7", d: "iching", i, straight, facts: f2, g: { th: FA.compose(JSON.parse(JSON.stringify(f2)), { seed: 9001 + i * 11, lang: "th", straight }) } });
  }
  return out;
}

/* ---------------- detectors ---------------- */
const NOUN_TH = "งบ|ห้าธาตุ|โปรเจกต์|โครงการ|นก|กระแส|ข้อ|วิธี|หัวใจ|บทสนทนา|ดอกไม้|ดอก|วุฒิภาวะ|เป็นจังหวะ|เป็นช่วง|เป็นปี|เป็นเวลา|เป็นสัญญาณ|ช่วง|ปี|เดือน|วัน|เรื่อง|ความ|การ|ภาพ|สิ่ง|ผล|เงิน|งาน(?!หนัก)|ทีม|คน|ธาตุ|ดาว|ทิศ|สี|เลข|คู่|ไพ่|ราศี|กว้า|ตรีแกรม|เซียมซี|ตำรา|ลาภ|โชค|ทรัพย์|รายได้|รายจ่าย|ค่าใช้จ่าย|บัญชี|หนี้|ข่าว|โอกาส|อุปสรรค|ปัญหา|ฝัน|แผน|เป้าหมาย|บ้าน|ครอบครัว|เพื่อน|คนรัก|คู่ครอง|ลูกค้า|หัวหน้า|ต้นไม้|น้ำ(?!ใจ)|ไฟ|ลม|ฟ้า|ภูเขา|แม่น้ำ|ทะเล|พลังของ|จังหวะ|สถานการณ์|บรรยากาศ|ใบหน้า|มือ|เส้น|ภพ|ภูมิ";
const KUN_WORD = "ภาพ|ค่า|ธรรม|สมบัติ|ประโยชน์|ความดี|ูปการ|คู่ควร";
// at a paragraph start, or right after a reporting "ว่า" (where the round-6 rules insert "คุณ"); "…ให้คุณช่วงนี้" (to you) is an object
const X1_RE = new RegExp("(?:^|ว่า)คุณ(?!" + KUN_WORD + ")(?:" + NOUN_TH + ")", "gm");
export function kunNoun(text) {
  const out = [];
  for (const m of String(text).matchAll(X1_RE)) out.push(String(text).slice(Math.max(0, m.index - 10), m.index + 40).trim());
  return out;
}
const sentencesOf = (t, L) => (L === "zh" ? String(t).split(/(?<=[。！？])/) : String(t).split(/(?<=[.!?])\s+/)).map(x => x.trim()).filter(Boolean);
const FINDING_VERB = /^(?:also |traditionally |often |usually )?(?:suggests?|shows?|means?|adds?|points?|indicates?|reflects?|stands?|is|are|was|has|have|carries|carry|brings?|governs?|rules?|sits?|represents?|says?|tells?|links?|ties?|holds?|gives?|marks?|speaks?|asks?|invites?|calls?|reminds?|encourages?|warns?|hints?|relates?|belongs?|comes?|centers?|focuses?|falls?|lies|lie|works?|helps?|supports?|favors?|can|may|will|would|could|might|does|do)\b/;
export function swappedIt(paras, names) {
  const out = [], nn = names.map(n => n.toLowerCase().replace(/^(?:the|your|a|an) /, "")).filter(n => n.length >= 4);
  for (const q of paras) {
    const s = sentencesOf(q, "en");
    for (let k = 1; k < s.length; k++) {
      const lo = s[k].toLowerCase().replace(/^(?:the|your|a|an) /, "");
      const n = nn.find(x => lo.startsWith(x + " ") || lo.startsWith(x + " ("));
      if (!n) continue;
      const rest = lo.slice(n.length).replace(/^\s*\([^)]*\)/, "").trim();
      // only a finite verb right after the name ("Pair 20 finds…"); "Worry in a dream is…" or "X: the area…" are not this case
      if (!/^[a-z]+s\b/.test(rest) || FINDING_VERB.test(rest)) continue;
      const prev = s[k - 1];
      // the sentence before has its own subject; "The area of …" is the finding's own paraphrase (lek7 houses), not another subject
      if (/^(?:By tradition,? )?(?:Your|The|A|An|This|That|My|your|the|a|an|this|that|my) [a-z]/.test(prev) && !/^(?:The|This) (?:area|house|part)\b/.test(prev) && prev.toLowerCase().indexOf(n) < 0 && !/[)]\.$/.test(prev)) out.push(s[k].slice(0, 80));
    }
  }
  return out;
}
const PROPER = /^(?:Thai|Chinese|Buddhist|Taksa|BaZi|I Ching|Siam|Lek|Sun|Moon|Mercury|Venus|Mars|Jupiter|Saturn|Rahu|Ketu|Pair|Slip|Kua|Eight Mansions|Period|Sheng Qi|Yan Nian|Tian Yi|Fu Wei|Day Master|Lunar|Western|Year|Tarot|The (?:Fool|Magician|High|Empress|Emperor|Hierophant|Lovers|Chariot|Hermit|Wheel|Hanged|Tower|Star|Moon|Sun|World|Devil)|Strength|Justice|Death|Temperance|Judgement|Ace|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Page|Knight|Queen|King|[A-Z][a-z]+ (?:of|in) [A-Z])/;
export function hedgeIssues(paras) {
  const out = [];
  for (const q of paras) {
    const n = (q.match(/\bBy tradition\b/g) || []).length;
    if (n > 1) out.push(`×${n} in one paragraph: ${q.slice(0, 60)}`);
    for (const x of sentencesOf(q, "en")) {
      const m = /\bBy tradition,?\s+(\S+)/.exec(x);
      if (!m) continue;
      const w = m[1], after = x.slice(m.index + m[0].length - w.length);
      if (/^[A-Z]/.test(w) && !PROPER.test(after)) out.push("capital after the hedge: " + x.slice(0, 60));
      if (/^(?:thai|chinese|buddhist|taksa|bazi|siam|western|lunar)\b/.test(w)) out.push("proper noun in lower case: " + x.slice(0, 60));
      if (/\b(?:tradition(?:al|ally)?|belief|believed|folk|folklore|by custom)\b/i.test(x.slice(0, m.index) + x.slice(m.index + 12))) out.push("second hedge in the sentence: " + x.slice(0, 70));
      if (/\b(?:adding up|add up|digits?|reduc(?:e|ing)|calculat\w*|computed|counted from|sum of)\b/i.test(x.replace(/\([^)]*\)/g, ""))) out.push("hedged calculation: " + x.slice(0, 70));
    }
  }
  return out;
}
const STACK = {
  en: /\b(?:means?|shows?|suggests?|adds?|indicates?|points? to|reflects?) that,? in (?:Taksa|BaZi|Eight Mansions|Thai number reading|Chinese face reading|palm reading|the I Ching|Siam Si)\b/i,
  zh: /(?:提示|显示|说明|来看|这边|而言|再看[^，。]{1,12}|先看[^，。]{1,12}|说到[^，。]{1,12})，在(?:塔克萨|八字|八宅|面相|泰式数字|手相|易经)/,
  th: /(?:บ่งบอกว่า|สื่อว่า|ชี้ว่า|สะท้อนว่า|หมายความว่า|แสดงว่า|ตีความได้ว่า)\s?(?:ในตำรา|ตามตำรา)(?:ทักษา|แปดอักษร|ปาจื้อ)/,
};
const LABELS2 = /^[^：:\s()（）]{1,18}[：:]\s?[^：:\s()（）]{1,18}[：:]/;
export function stacked(paras, L) {
  const out = [];
  for (const q of paras) {
    if (LABELS2.test(q)) out.push("stacked labels: " + q.slice(0, 50));
    for (const x of L === "th" ? [q] : sentencesOf(q, L)) if (STACK[L].test(x)) out.push("lead on a glossary line: " + x.slice(0, 70));
  }
  return out;
}
const core = t => String(t).replace(/[,，、].*$/, "").trim().toLowerCase();
export function bracketSlips(text, L) {
  const out = [], t = String(text);
  for (const m of t.matchAll(/[(（]([^()（）]{1,80})[)）]\s?[(（]([^()（）]{1,80})[)）]/g)) {
    const a = core(m[1]), b = core(m[2]);
    if (a && b && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) out.push("doubled bracket: " + m[0]);
  }
  if (L === "th") for (const m of t.matchAll(/\(([^()]{1,80})\)/g)) if (/[，、。：；]/.test(m[1])) out.push("Chinese punctuation in a Thai bracket: " + m[0]);
  return out;
}

/* ---------------- measure ---------------- */
export async function targetedIssues(T) {
  const { FA } = await mods();
  const out = [];
  for (const row of T) for (const L of Object.keys(row.g)) {
    const names = namesOf(FA, row.d, row.facts.items, L);
    for (const s of row.g[L].sections || []) {
      if (L === "en") for (const f of swappedIt(s.paragraphs, names)) out.push(`X2 ${row.d}#${row.i} [${s.id}] ${f}`);
      for (const f of bracketSlips(s.paragraphs.join(" "), L)) out.push(`X5 ${row.d}#${row.i} ${L} [${s.id}] ${f}`);
      if (L === "th") for (const f of s.paragraphs.flatMap(kunNoun)) out.push(`X1 ${row.d}#${row.i} [${s.id}] ${f}`);
    }
  }
  return out;
}
export async function measure(C) {
  const { FA } = await mods();
  const per = {}, ex = {}, note = (k, s) => { (ex[k] = ex[k] || []).length < 20 && ex[k].push(s); };
  const K0 = { n: 0, X1: 0, X2: 0, X3: 0, X4th: 0, X4en: 0, X4zh: 0, X5th: 0, X5en: 0, X5zh: 0 };
  const P = d => (per[d] = per[d] || Object.assign({}, K0));
  for (const row of C) {
    const p = P(row.d); p.n++;
    const tag = `${row.set}:${row.d}#${row.i}${row.straight ? "s" : ""}`;
    for (const L of LANGS) {
      const names = namesOf(FA, row.d, row.facts.items, L);
      for (const s of row.g[L].sections || []) {
        const text = s.paragraphs.join(L === "zh" ? "" : " ");
        if (L === "th") for (const f of s.paragraphs.flatMap(kunNoun)) { p.X1++; note("X1", `${tag} [${s.id}] ${f}`); }
        if (L === "en") {
          for (const f of swappedIt(s.paragraphs, names)) { p.X2++; note("X2", `${tag} [${s.id}] ${f}`); }
          for (const f of hedgeIssues(s.paragraphs)) { p.X3++; note("X3", `${tag} [${s.id}] ${f}`); }
        }
        for (const f of stacked(s.paragraphs, L)) { p["X4" + L]++; note("X4" + L, `${tag} [${s.id}] ${f}`); }
        for (const f of bracketSlips(text, L)) { p["X5" + L]++; note("X5" + L, `${tag} [${s.id}] ${f}`); }
      }
    }
  }
  const tot = {}; for (const q of Object.values(per)) for (const [k, v] of Object.entries(q)) tot[k] = (tot[k] || 0) + v;
  return { per, totals: tot, examples: ex };
}

/** the report: X1 (TH), X4 (stacked labels / leads, every language), X5 */
export async function reportIssues7(repo = REPO) {
  await mods();
  global.window = globalThis; globalThis.LQI18N_Q = globalThis.LQI18N_Q || [];
  require(join(repo, "i18n", "en-report.js")); require(join(repo, "i18n", "zh-report.js"));
  const dict = {}; for (const q of globalThis.LQI18N_Q) for (const L of Object.keys(q)) Object.assign(dict[L] = dict[L] || {}, q[L]);
  const RP = require(join(repo, "report.js"));
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : "{" + k + "}"));
  const tOf = L => (k, th, v) => fill(L === "th" ? th : (dict[L] && dict[L][k]) || th, v);
  const births = [{ y: 1955, m: 2, d: 11, h: 9, mi: 30, gender: "female" }, { y: 1974, m: 6, d: 6, h: 23, mi: 50, gender: "male" }, { y: 1988, m: 9, d: 27, noTime: true, gender: "female" },
    { y: 1993, m: 12, d: 3, h: 5, mi: 15, gender: "male" }, { y: 2005, m: 4, d: 19, h: 16, mi: 0, gender: "female" }];
  const nows = [new Date(2026, 10, 20), new Date(2027, 2, 2), new Date(2026, 7, 9), new Date(2027, 0, 15), new Date(2026, 11, 28)];
  const out = { X1: [], X4: [], X5: [] }, jobs = [];
  births.forEach((b, i) => jobs.push({ kind: "basic", i, b }));
  jobs.push({ kind: "annual", i: 0, b: births[0] }, { kind: "annual", i: 1, b: births[2] }, { kind: "compat", i: 0, b: births[1], b2: births[3] });
  for (const j of jobs) for (const L of LANGS) {
    const t = tOf(L), tag = `report ${j.kind}#${j.i} ${L}`;
    const rep = j.kind === "basic" ? RP.buildBasic(j.b, { lang: L, t, now: nows[j.i] }) : j.kind === "annual" ? RP.buildAnnual(j.b, 2029, { lang: L, t }) : RP.buildCompat(j.b, j.b2, { lang: L, t });
    for (const part of rep.parts || []) for (const s of part.sections || []) {
      const paras = s.paragraphs || [], text = paras.join(L === "zh" ? "" : " ");
      if (L === "th") for (const f of paras.flatMap(kunNoun)) out.X1.push(`${tag} [${part.id}/${s.id}] ${f}`);
      for (const f of stacked(paras, L)) out.X4.push(`${tag} [${part.id}/${s.id}] ${f}`);
      for (const f of bracketSlips(text, L)) out.X5.push(`${tag} [${part.id}/${s.id}] ${f}`);
    }
  }
  return out;
}
