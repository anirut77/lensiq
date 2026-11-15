// tools/fortune-quality-metrics.mjs — FIXED METRICS for the fortune reading quality round (owner order 2026-11-16: "an independent
// reviewer reads the rewritten Thai readings on all 18 pages for natural language, clear main point and grouping; fix weak pages;
// check English and Chinese match"). Source of the findings: ~/LENSIQ-field/review/fortune-quality-2026-11-16/REPORT.md.
// Locked (evals-locks/fortune-quality.sha256, ~/LENSIQ-field/evals/fortune-quality/) BEFORE any product change on branch
// fortune-quality. Used by tests/unit/fortune-quality.test.js (the targets) and tools/fortune-quality-measure.mjs (the table).
//
// Inputs (synthetic: engine-built facts from tools/fortune-review-export.mjs factsFor, composed with FortuneAI.compose, no network):
//   set "reviewer": the reviewer's exact inputs (15 domains x 5, rng lcg(4242 + k*977), seed 1000 + i*31)
//   set "fresh":    new inputs so the fixes do not fit 5 inputs per domain (15 domains x 10, lcg(77017 + k*1597), seed 5003 + i*41)
// Every reading is composed in TH, EN and ZH (gentle; the default) and in TH / EN / ZH straight (hard limits only).
//
// Metrics (per domain; each is a count of failures, target 0 unless stated):
//   R1  overview: the visible start (the first part the layout shows) names a finding of this reading (an item label / short name
//       in the reading's language, or a piece of the headline), and when the overview states its main point ("เด่นที่สุด /
//       ใจความหลัก / ผลหลัก", "stands out most / main point", "最突出 / 重点 / 核心"), that statement is in the visible start
//   R2  no visible group start (any group) is only a stock lead-in: a start shorter than TH 60 / EN 75 / ZH 22 characters whose first
//       TH 16 / EN 22 / ZH 8 characters open group starts in 3 or more domains of the corpus (the reviewer's rule), or a start that
//       is one of the lead-ins the reviewer quoted
//   R3  TH: the cutter never cuts after "ๆ", between a number and its unit, before "เช่น / ได้แก่ / เสริมด้วย", inside a list
//       ("อำนาจ ‖ บารมี และ…"), or right after a "สำหรับ / จาก / ดูที่ / ส่วน / เรื่อง / ด้าน + noun" lead; EN / ZH: a visible part
//       that does not hold the whole paragraph ends at a sentence end (. ! ? / 。！？). Reported for every cut; target 0 for the
//       cut that ends a visible part
//   R4  no frame over the wrong meaning type: the reviewer's examples (explicit patterns) plus a generic check on every frame the
//       composer fills (compose trace): a frame that expects an action (…ลอง{M} / …ให้{M} / …ควร{M} / "เพื่อใช้จุดเด่นของ…ให้เต็มที่
//       {M}" / "ตามคำแนะนำของ… {M}") never wraps a noun, an adjective or a trait (มี / เป็น / พูดจา / กล้าเสี่ยง / มัก …), and a
//       "…ว่า{M}" statement frame never wraps a bare request (…บ้าง / …นะ / …เถอะ)
//   R5  remedies by topic: no sleep, screen, study or "what is this teaching me" remedy in the love or personality group
//   P   group parity: the same groups in the same order in TH, EN and ZH for the same input (target: every input), and the
//       overview names the same main finding (the first finding it names) in all three
//   H   hard limits on every output (gentle and straight, TH / EN / ZH): FortuneAI hard-limit check, the safety filter of the
//       mode, and W1 (no investment instruction) / W2 (no promised result) patterns
//   L   the reviewer's weak lines (explicit patterns over the corpus, the report pages and the static pages)
import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
export const LANGS = ["th", "en", "zh"];

let M = null;
async function mods(repo = REPO) {
  if (M) return M;
  global.PALM_KB = require(join(repo, "palm-kb.js"));
  global.FR_KB = require(join(repo, "faceread-kb.js"));
  for (const f of readdirSync(join(repo, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(join(repo, "i18n", f));
  const EX = await import(join(repo, "tools", "fortune-review-export.mjs"));
  M = { EX, FA: require(join(repo, "fortune-ai.js")), RD: require(join(repo, "fortune-read.js")) };
  return M;
}

export const SETS = [
  { name: "reviewer", n: 5, rng: k => 4242 + k * 977, seed: i => 1000 + i * 31 },
  { name: "fresh", n: 10, rng: k => 77017 + k * 1597, seed: i => 5003 + i * 41 },
];

/** every input of both sets, composed in TH / EN / ZH (gentle, with the compose trace) and straight */
export async function corpus() {
  const { EX, FA } = await mods();
  const out = [];
  for (const set of SETS) for (const d of EX.DOMAINS) {
    const k = EX.DOMAINS.indexOf(d), r = EX.lcg(set.rng(k));
    for (let i = 0; i < set.n; i++) {
      const facts = EX.factsFor(d, i, r), seed = set.seed(i);
      const row = { set: set.name, d, i, topic: facts.topic, facts, seed, g: {}, st: {} };
      for (const lang of LANGS) {
        row.g[lang] = FA.compose(facts, { seed, lang, straight: false, trace: true });
        row.st[lang] = FA.compose(facts, { seed, lang, straight: true });
      }
      out.push(row);
    }
  }
  return out;
}

/* ---------------- helpers ---------------- */
const PAREN = /\s*[(（][^)）]*[)）]/g;
/** names of the findings of one reading in one language (label, short name, headline pieces) */
function namesOf(FA, row, lang) {
  const out = new Set();
  const add = s => {
    if (!s) return;
    const base = String(s).replace(PAREN, "").trim();
    for (const piece of [String(s).trim(), base, ...base.split(/\s*[·•|]\s*/)]) {
      const p = piece.trim();
      if (p.length >= (lang === "zh" ? 2 : 3)) out.add(lang === "en" ? p.toLowerCase() : p);
      // "ธาตุดิน 61%" → "ธาตุดิน"; "Kua 2" stays
      const q = p.replace(/\s*[\d.,]+\s*%?$/, "").trim();
      if (lang !== "en" && q.length >= 3 && q !== p) out.add(q);
    }
  };
  for (const it of row.facts.items || []) {
    const x = lang === "en" ? FA.en.item(row.d, it) : lang === "zh" ? FA.zh.item(row.d, it) : it;
    if (!x) continue;
    add(x.label); add(x.short);
  }
  if (lang === "th" && row.facts.headline) for (const h of String(row.facts.headline).split(/\s*·\s*/)) add(h);
  return [...out];
}
const hasName = (text, names, lang) => { const t = lang === "en" ? text.toLowerCase() : text; return names.some(n => t.includes(n)); };
const MAIN = { th: /เด่นที่สุด|ใจความหลัก|ผลหลัก/, en: /stands out most|main point|key result|most important/i, zh: /最突出|重点在|核心|最重要/ };
const STOCK_P = { th: 16, en: 22, zh: 8 }, STOCK_LEN = { th: 60, en: 75, zh: 22 };
// lead-ins the reviewer quoted (a visible start that is only one of these, give or take the domain name, is stock)
const QUOTED_LEADS = [/^ปิดท้ายด้วยสิ่งที่ลงมือได้เลย\s*$/, /^เรื่องงาน ผลครั้งนี้ชี้ทางไว้ค่อนข้างชัด\s*$/, /^ด้าน\S+ \S+อ่านไว้ดังนี้\s*$/,
  /^Finally, here are some things you can do right away\.?\s*$/i, /^最后是可以马上做的事[。，]?\s*$/];
const TH_UNITS = /^(?:ปี|เท่า|%|องศา|คน|วัน|เดือน|ครั้ง|ข้อ|ชั่วโมง|นาที|บาท|ใบ|ตัว|ดวง|ฐาน|ภพ|ช่วง|สัปดาห์|ขวบ)/;
/** why a Thai cut between a and b (same paragraph) is wrong, or "" */
export function badCutTh(a, b) {
  if (/ๆ$/.test(a)) return "after ๆ";
  if (/\d$/.test(a) && TH_UNITS.test(b)) return "number|unit";
  if (/^(?:เช่น|ได้แก่|เสริมด้วย|และ|หรือ)/.test(b)) return "before เช่น/และ";
  if (/^\S{1,14} (?:\S{1,14} )?(?:และ|หรือ)\S/.test(b) && /(?:^|\s)\S{1,24}$/.test(a) && !/[.!?)]$/.test(a)) return "inside a list";
  const last = (a.match(/(?:^|\s)(\S+)$/) || [])[1] || "";
  if (/^(?:สำหรับ|จาก|ดูที่|ส่วน|เรื่อง|ด้าน)\S/.test(last)) return "after a lead + noun";
  return "";
}
const EN_END = /[.!?]["”’)]?$/, ZH_END = /[。！？][”」』）)]*$/;
// R4 explicit patterns (TH unless marked)
const R4_PATTERNS = [
  ["imp-frame-trait", /เพื่อใช้จุดเด่นของ\S*(?: \S+){0,3}?ให้เต็มที่ (?:คุณ)?(?:พูดจา|มี|เป็น|มัก|กล้าเสี่ยง|ได้รับ|ความ|ชอบ|เก่ง|ช่าง|ขี้|สัญชาตญาณ)/],
  ["neg-frame-trait", /ตามคำแนะนำของ\S+(?: \d+)? (?:คุณ)?(?:กล้าเสี่ยง|พูดจา|มี|เป็น|มัก|ได้รับ|ความ|ชอบ|เก่ง|ช่าง|ขี้|สัญชาตญาณ)/],
  ["statement-frame-request", /(?:ฝากข้อคิดไว้ว่า|มีอยู่ว่า|อย่าลืมว่า|เตือนเบา ๆ ว่า)(?:คุณ)?\S*(?:บ้าง|เถอะ|นะ)(?=\s|$)/],
  ["dont-forget-trait", /อย่าลืมว่าคุณมั่นใจในตัวเองสูง/],
  ["energy-word-noun", /คำที่ใช้เตือนใจ\S*คือ(?:ธาตุ|สี|ทิศ)/],
  ["keyword-verb", /คำสำคัญที่ควรจำไว้คือ(?:ไหล|เดิน|ทำ|ปล่อย|รอ|อด)/],
  ["raw-numbers", /(?:ที่ควรจำไว้คือ|คือ)ฐานรวม(?: \d+){3,}/],
  ["after-that-you", /(?:^|\s)ต่อจากนั้น คุณ/],
  ["for-x-adjective", /(?:^|\s)สำหรับ(?:ธาตุ|ราศี|ดาว|ปี)\S+ (?:ตรงไปตรงมา|ใจดี|อบอุ่น|มั่นคง|ร่าเริง|ขยัน|ละเอียด|รอบคอบ)/],
  ["hedge-adjective", /ดูที่\S+(?: \d+)? (?:ตามความเชื่อแล้ว|ว่ากันว่า|เชื่อกันว่า) ?(?:สัญชาตญาณ|ใจ|พูดจา|มี|เป็น)/],
  ["person-means", /ชาวปี\S{1,8}(?:หมายความว่า|บ่งบอกว่า|ชี้ว่า|สะท้อนว่า)/],
  ["reads-as-from", /ตำราอ่านว่าตาม/],
  ["from-topic-age", /(?:^|\s)จาก(?:ความรัก|การงาน|การเงิน)ช่วงอายุ/],
  ["source-twice", /ดูได้จาก(\S{3,}).{0,60}ดูที่\1/],
  ["tautology-repeat", /ไพ่เลข (\d+) ออกซ้ำ \(\d+ ใบ\) ชี้ว่าเลข \1 ออกมาซ้ำ/],
  ["vague-caution", /ตำราชี้ว่ามีบางเรื่องที่ควรระมัดระวังในช่วงนี้/],
  ["en-a-vowel", /\ba (?:earth|air|east|eight|open|ox|odd|upper|inner|outer|eleven|ace|emperor|empress|hermit|instinct)\b/i],
];
// generic: a frame expecting an action never wraps a noun / adjective / trait; a "…ว่า" frame never wraps a bare request
const VP_FRAME = /(?:ลอง|ให้|ควร)\{M\}|ให้เต็มที่ \{M\}|^\^?ตามคำแนะนำของ\{LE\} \{M\}/;
const WA_FRAME = /ว่า\{M\}$/;
const TRAIT_START = /^(?:คุณ)?(?:มี(?!ส่วน)|เป็น(?!ฝ่าย)|พูดจา|มัก|กล้าเสี่ยง|ได้รับ|ความ|การ(?!บ้าน)|ชอบ|เก่ง|ช่าง|ขี้|สัญชาตญาณ|เสน่ห์|ธาตุ|ดาว|ราศี|ปี(?!ด)|เลข|ไพ่)/;
const REQUEST_END = /(?:บ้าง|เถอะ|นะ)$/;
/** generic frame check over one reading's trace (compose(..., { trace: true })._frames: [template, M]) */
export function frameIssues(FA, res) {
  const out = [];
  for (const [t, m] of (res && res._frames) || []) {
    const M0 = String(m || "").trim(); if (!M0) continue;
    const role = FA.grammar.roleOf(M0);
    if (VP_FRAME.test(t) && (role === "noun" || role === "adjective" || TRAIT_START.test(M0))) out.push(`VP frame over ${role}: ${t} <- ${M0.slice(0, 40)}`);
    if (WA_FRAME.test(t) && (REQUEST_END.test(M0) || role === "noun")) out.push(`ว่า-frame over ${REQUEST_END.test(M0) ? "a request" : role}: ${t} <- ${M0.slice(0, 40)}`);
  }
  return out;
}
// R5: remedies by topic
const R5 = {
  th: /นอนให้พอ|นอนหลับ|เข้านอน|ตื่นนอน|การนอน|หน้าจอ|พักสายตา|มือถือ|ลงเรียน|คอร์ส|เรียนสิ่งใหม่|ทักษะใหม่|อ่านหนังสือ|เรื่องนี้กำลังสอนอะไร/,
  en: /\b(?:sleep|screens?|phone|course|classes|study|studying|learn something new|new skill)\b|what is this teaching me/i,
  zh: /睡眠|早睡|睡够|屏幕|手机|课程|报名|学一门|新技能|这件事在教我什么/,
};
// H: hard limits beyond the filters
const W1 = { th: /ลงทุนในสิ่งที่ใช้อยู่อาศัย|(?:การ)?ลงทุน(?:ซื้อ)?(?:บ้าน|คอนโด|ที่ดิน|อสังหา|หุ้น|ทองคำ|คริปโต)/, en: /\binvest(?:ing|ment)? in (?:property|real estate|a home|stocks?|gold|crypto)/i, zh: /投资(?:房产|房地产|股票|黄金|加密)/ };
const W2 = {
  th: /แล้ว(?:ปีนี้|ชีวิต|ทุกอย่าง|คุณ)?จะ(?:เต็มไปด้วย|ได้รับ|ประสบ)(?:ความสุข|โชค|ความสำเร็จ|เงิน)|รับรองว่า|การันตี|แน่นอนว่าจะ(?:ได้|มี|รวย|สำเร็จ)/,
  en: /\b(?:will surely|will definitely|will certainly|is guaranteed|guarantees?)\b|\bthen (?:this year|your life|everything) will be (?:full|filled)/i,
  zh: /(?<![不能无法没])保证(?!什么)|一定会(?:成功|发财|幸福)|必定(?:成功|发财)|就会充满/,
};
const sentencesOf = (text, lang) => (lang === "zh" ? String(text).split(/(?<=[。！？])/) : lang === "en" ? String(text).split(/(?<=[.!?]) /) : [String(text)]);
function textsOf(res) {
  const o = [];
  if (res.summary) for (const l of res.summary.lines || []) o.push(["summary", (l.k || "") + " " + (l.t || "")]);
  for (const s of res.sections || []) for (const p of s.paragraphs || []) o.push([s.id, p]);
  if (res.plan) for (const x of res.plan.items || []) o.push(["plan", x.t]);
  if (res.reminder) o.push(["reminder", res.reminder]);
  return o;
}
// L: the reviewer's weak lines in composed readings (TH unless marked)
export const WEAK_LINES = [
  ["face: nose shape named", /จมูกที่ได้รูปแบบนี้/],
  ["palm: interest line", /แบบสะสมดอกเบี้ย/],
  ["palm: 0 degrees", /เฉลี่ย 0 องศา/],
  ["horoscope: closer energy word", /คำที่ใช้เตือนใจช่วงนี้คือธาตุ/],
  ["tarot: one-card pattern line", /ไพ่ 1 ใบ มีไพ่ชุดใหญ่/],
  ["tarot: one-card story (en)", /one clear story/i, "en", row => row.d === "tarot" && (row.facts.items || []).filter(it => /^card\./.test(it.id)).length === 1],
  ["iching: trigram gloss double brackets", /\)\s*\([一-鿿]{1,2}\)/],
  ["bazi: love closer", /เรื่องความรักไม่ต้องรีบ ทำสม่ำเสมอจะเห็นผลชัดกว่า/],
  ["taksa: straight lead repeats the point", /จุดนี้.{0,80}จุดนั้นคือ/],
  ["lek7: Tanu saves life", /ภพตนุช่วยเรื่องชีวิตไว้ได้/],
  ["fengshui: star number doubled", /ดาว \d (?:หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า)/],
  ["fengshui: กั้ว spelling", /กั้ว/],
  ["thai: ๆ without a space", /[ก-๎]ๆ/],
  ["dream: main image said twice", /ภาพหลัก.{0,80}ภาพหลักในฝันครั้งนี้คือ/],
  ["zodiac: unexplained normal year", /ปีปกติ(?!\s*\(ไม่ชง)/],
  ["zodiac: be kind frame", /ตำราฝากข้อคิดไว้ว่าคุณใจดีกับตัวเองบ้าง/],
  ["en: a earth-element", /\ba earth/i, "en"],
];
const once = (re, t) => (t.match(new RegExp(re.source, "g")) || []).length;

/* ---------------- measure ---------------- */
/** all metrics of a composed corpus: { per: { [domain]: counts }, totals, examples } */
export async function measure(C) {
  const { FA, RD } = await mods();
  const per = {}, ex = {}, note = (k, s) => { (ex[k] = ex[k] || []).length < 12 && ex[k].push(s); };
  const P = d => (per[d] = per[d] || { n: 0, R1: 0, R2: 0, R3th: 0, R3thAll: 0, R3en: 0, R3zh: 0, R4: 0, R4gen: 0, R5: 0, parity: 0, main: 0, H: 0, L: 0 });
  // R2 stock prefixes: per language, which domains open a group start with the same first characters
  const pre = { th: {}, en: {}, zh: {} };
  for (const row of C) for (const L of LANGS) for (const s of row.g[L].sections || []) {
    const g = (RD.planSection(s, L)[0] || {}).text || "", k = g.slice(0, STOCK_P[L]);
    (pre[L][k] = pre[L][k] || new Set()).add(row.d);
  }
  for (const row of C) {
    const p = P(row.d); p.n++;
    const tag = `${row.set}:${row.d}#${row.i}`;
    for (const L of LANGS) {
      const res = row.g[L], secs = res.sections || [];
      // R1
      const ov = secs.find(s => s.id === "overview");
      if (ov) {
        const parts = RD.planSection(ov, L), gist = parts[0] ? parts[0].text : "", full = ov.paragraphs.join(" ");
        const names = namesOf(FA, row, L);
        const r1 = (!hasName(gist, names, L) ? "no finding named" : "") || (MAIN[L].test(full) && !MAIN[L].test(gist) ? "main point folded" : "");
        if (r1) { p.R1++; note("R1", `${tag} ${L} ${r1}: ${gist.slice(0, 90)}`); }
      }
      for (const s of secs) {
        const parts = RD.planSection(s, L), gist = parts[0] ? parts[0].text : "";
        // R2
        const stock = (pre[L][gist.slice(0, STOCK_P[L])] || new Set()).size >= 3 && gist.length < STOCK_LEN[L];
        if (stock || QUOTED_LEADS.some(re => re.test(gist))) { p.R2++; note("R2", `${tag} ${L} [${s.id}] ${gist}`); }
        // R3
        for (let k = 0; k < parts.length - 1; k++) {
          const a = parts[k], b = parts[k + 1];
          if (a.para !== b.para) continue;
          const shown = a.visible && !b.visible;
          if (L === "th") {
            const why = badCutTh(a.text, b.text);
            if (why) { p.R3thAll++; if (shown) { p.R3th++; note("R3th", `${tag} [${s.id}] ${why}: …${a.text.slice(-30)} ‖ ${b.text.slice(0, 24)}`); } }
          } else if (shown && !(L === "en" ? EN_END : ZH_END).test(a.text.trim())) {
            p["R3" + L]++; note("R3" + L, `${tag} [${s.id}] …${a.text.slice(-40)} ‖ ${b.text.slice(0, 24)}`);
          }
        }
        // R5
        if ((s.id === "love" || s.id === "personality") && s.paragraphs.some(x => R5[L].test(x))) {
          p.R5++; note("R5", `${tag} ${L} [${s.id}] ${(s.paragraphs.join(" ").match(new RegExp(".{0,40}(?:" + R5[L].source + ").{0,30}", R5[L].flags)) || [""])[0]}`);
        }
      }
      // R4 (gentle and straight)
      for (const r of [res, row.st[L]]) for (const [sid, t] of textsOf(r)) for (const [k, re, only] of R4_PATTERNS.map(x => [x[0], x[1], x[0].startsWith("en-") ? "en" : "th"])) {
        if (only !== L) continue;
        const m = t.match(re); if (m) { p.R4++; note("R4", `${tag} ${L} [${sid}] ${k}: ${m[0].slice(0, 70)}`); }
      }
      const fi = frameIssues(FA, res);
      if (fi.length) { p.R4gen += fi.length; fi.forEach(x => note("R4gen", `${tag} ${L} ${x}`)); }
      // H
      for (const [r, st] of [[res, false], [row.st[L], true]]) for (const [sid, t] of textsOf(r)) for (const s of sentencesOf(t, L)) {
        if (!s.trim()) continue;
        const why = FA.straight.hardLimit(s) ? "hard limit" : !(st ? FA.straight.isSafe(s) : FA.safety.isSafe(s)) ? "safety filter" : W1[L].test(s) ? "W1 investment" : W2[L].test(s) ? "W2 promised result" : "";
        if (why) { p.H++; note("H", `${tag} ${L}${st ? " straight" : ""} [${sid}] ${why}: ${s.slice(0, 90)}`); }
      }
      // L (weak lines)
      for (const r of [res, row.st[L]]) {
        const all = textsOf(r).map(x => x[1]).join("\n");
        for (const [k, re, lang, when] of WEAK_LINES) if ((lang || "th") === L && (!when || when(row)) && re.test(all)) { p.L++; note("L", `${tag} ${L} ${k}: ${(all.match(re) || [""])[0].slice(0, 60)}`); }
        // the Taksa / lifegraph glosses at most once per reading
        if (L === "th" && once(/\(การจัดดาวตามวันเกิดของโหราศาสตร์ไทย\)/, all) > 1) { p.L++; note("L", `${tag} gloss repeated`); }
      }
    }
    // P: group parity and the main finding
    const seq = L => (row.g[L].sections || []).map(s => s.id).join(",");
    if (seq("th") !== seq("en") || seq("th") !== seq("zh")) { p.parity++; note("P", `${tag} th ${seq("th")} | en ${seq("en")} | zh ${seq("zh")}`); }
    const mainOf = L => {
      const ov = (row.g[L].sections || []).find(s => s.id === "overview"); if (!ov) return "";
      const t0 = L === "en" ? ov.paragraphs.join(" ").toLowerCase() : ov.paragraphs.join(" ");
      let best = "", at = Infinity;
      for (const it of row.facts.items || []) {
        const x = L === "en" ? FA.en.item(row.d, it) : L === "zh" ? FA.zh.item(row.d, it) : it; if (!x) continue;
        for (const n of namesOf(FA, { d: row.d, facts: { items: [it] } }, L)) { const j = t0.indexOf(n); if (j >= 0 && j < at) { at = j; best = it.id; } }
      }
      return best;
    };
    const mm = LANGS.map(mainOf);
    if (!mm[0] || mm[0] !== mm[1] || mm[0] !== mm[2]) { p.main++; note("main", `${tag} th ${mm[0]} en ${mm[1]} zh ${mm[2]}`); }
  }
  // set-independent unique-content checks (TH): taksa love and lifegraph overview start differ between users
  for (const [d, sid] of [["taksa", "love"], ["lifegraph", "overview"]]) {
    const texts = C.filter(r => r.d === d).map(r => ((r.g.th.sections || []).find(s => s.id === sid) || { paragraphs: [""] }).paragraphs[0]);
    const seen = {}; for (const t of texts) if (t) seen[t] = (seen[t] || 0) + 1;
    const dup = Object.values(seen).filter(n => n > 1).reduce((a, n) => a + n - 1, 0);
    if (dup) { P(d).L += dup; note("L", `${d} [${sid}] the same first paragraph for ${dup + 1} users`); }
  }
  const totals = {};
  for (const p of Object.values(per)) for (const [k, v] of Object.entries(p)) totals[k] = (totals[k] || 0) + v;
  return { per, totals, examples: ex };
}

/* ---------------- static pages and the report (weak lines outside the composer) ---------------- */
export function staticIssues(repo = REPO) {
  const rd = f => readFileSync(join(repo, f), "utf8"), out = [];
  const hub = rd("fortune.html"), planner = rd("planner.js") + rd("lensiq-planner.js"), lucky = rd("luckycolor.js") + rd("lensiq-luckycolor.js");
  if (/ช่วยดึงคนเข้าบูธและสร้างการพูดถึงแบรนด์/.test(hub)) out.push("hub: booth / brand lead");
  if (/เล่นได้ในไม่กี่นาที/.test(hub)) out.push("hub: เล่นได้");
  if (/ปาจื้อ/.test(hub) && !/แปดอักษร \(ปาจื้อ\)/.test(hub)) out.push("hub: ปาจื้อ without แปดอักษร");
  if (/\(เกิด(?:อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์)/.test(planner)) out.push("planner: (เกิดอังคาร)");
  if (/งานเปิดร้าน \/ กิจการ/.test(planner)) out.push("planner: slash");
  if (/ทำบุญตักบาตรควบคู่(?!ไปด้วย)/.test(planner)) out.push("planner: ควบคู่");
  if (/การเงิน โชคลาภ/.test(lucky)) out.push("luckycolor: การเงิน โชคลาภ");
  if (/ไม่มีภาพถูกเก็บไว้/.test(lucky)) out.push("luckycolor: ไม่มีภาพถูกเก็บไว้");
  if (/อารมณ์ดี สดชื่น/.test(lucky)) out.push("luckycolor: อารมณ์ดี สดชื่น");
  return out;
}
/** the report page (report.js builders), TH / EN / ZH, the reviewer's five births plus five fresh ones */
export function reportIssues(repo = REPO) {
  const vm = require("node:vm"); void vm;
  global.window = globalThis; globalThis.LQI18N_Q = globalThis.LQI18N_Q || [];
  for (const f of readdirSync(join(repo, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(join(repo, "i18n", f));
  require(join(repo, "i18n", "en-report.js")); require(join(repo, "i18n", "zh-report.js"));
  const dict = {}; for (const q of globalThis.LQI18N_Q) for (const L of Object.keys(q)) Object.assign(dict[L] = dict[L] || {}, q[L]);
  const RP = require(join(repo, "report.js"));
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : "{" + k + "}"));
  const tOf = L => (k, th, v) => fill(L === "th" ? th : (dict[L] && dict[L][k]) || th, v);
  const births = [{ y: 1988, m: 4, d: 12, h: 9, mi: 30, gender: "female" }, { y: 1975, m: 11, d: 3, h: 22, mi: 5, gender: "male" }, { y: 1999, m: 7, d: 28, noTime: true, gender: "female" },
    { y: 1962, m: 1, d: 19, h: 6, mi: 0, gender: "male" }, { y: 2004, m: 9, d: 9, h: 14, mi: 45, gender: "female" },
    { y: 1981, m: 2, d: 23, h: 4, mi: 10, gender: "male" }, { y: 1993, m: 12, d: 30, h: 18, mi: 40, gender: "female" }, { y: 1969, m: 6, d: 6, noTime: true, gender: "male" },
    { y: 2001, m: 3, d: 15, h: 11, mi: 0, gender: "female" }, { y: 1957, m: 8, d: 1, h: 23, mi: 55, gender: "male" }];
  const now = new Date(2026, 10, 15), out = [], counts = [];
  const kinds = (b, i, L) => (i % 5 < 3 ? RP.buildBasic(b, { lang: L, t: tOf(L), now }) : i % 5 === 3 ? RP.buildAnnual(b, 2027, { lang: L, t: tOf(L) }) : RP.buildCompat(b, births[0], { lang: L, t: tOf(L) }));
  for (const [i, b] of births.entries()) {
    const n = {};
    for (const L of LANGS) {
      const rep = kinds(b, i, L);
      const secs = (rep.parts || []).flatMap(p => p.sections || []);
      n[L] = secs.length;
      const paras = secs.flatMap(s => s.paragraphs || []);
      // one remedy sentence at most once in the whole report
      const sens = paras.flatMap(p => sentencesOf(p, L === "th" ? "zh" : L).flatMap(x => (L === "th" ? x.split(/\s+(?=ข้อแนะนำทั่วไป|วิธีปรับตามตำรา|สิ่งที่ควรทำ)/) : [x]))).map(x => x.trim()).filter(x => x.length >= (L === "zh" ? 14 : 40));
      const seen = {}; for (const s of sens) seen[s] = (seen[s] || 0) + 1;
      for (const [s, k] of Object.entries(seen)) if (k > 1 && /ข้อแนะนำทั่วไป|วิธีปรับตามตำรา|สิ่งที่ควรทำ|Try |try |建议|不妨/.test(s)) out.push(`report#${i} ${L} remedy ×${k}: ${s.slice(0, 60)}`);
      if (L === "th" && /ที่คุณถามมา/.test(paras.join(" "))) out.push(`report#${i} th: ที่คุณถามมา (nothing was asked)`);
      if (L === "th" && rep.plan30) for (const w of rep.plan30.weeks) for (const x of w.items) if (/(?:^|[^(])ภูมิกาลกิณี/.test((x.for || "") + " " + x.t) && !/จุดที่ควรใส่ใจ \(ภูมิกาลกิณี\)/.test((x.for || "") + " " + x.t)) out.push(`report#${i} th: bare ภูมิกาลกิณี in the 30-day plan`);
    }
    counts.push(n);
    if (n.th !== n.en || n.th !== n.zh) out.push(`report#${i} section counts th ${n.th} en ${n.en} zh ${n.zh}`);
  }
  return { issues: out, counts };
}
