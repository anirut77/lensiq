#!/usr/bin/env node
// tools/fortune-review-export.mjs — export a stratified sample of composed fortune readings for native-speaker review.
//
// For each of the 15 reading domains (every fortune page), it generates varied, engine-built fact sets (the same
// generators the unit tests use), composes them with the local composer in Thai and in Chinese (FortuneAI.compose, no
// network), stratifies each domain's candidates by the tone balance of their facts (the composer's own toneOf rule;
// terciles within the domain: most favourable / middle / most cautious third) and keeps up to --per readings per
// (domain × language × tone) cell. Different candidates are used for Thai and Chinese, so the sheet covers more facts. Output, in --out (default
// review-out/):
//   review-sheet.csv   one row per reading: id, page, domain, lang, tone, topic, seed, text + empty rubric columns
//                      (naturalness, gentleness, cultural, safety, reviewer, comment). UTF-8 with BOM (Excel/Sheets).
//   review-sheet.html  the same readings, readable and printable, with the rubric (docs/FORTUNE-REVIEW.md) on top.
//   manifest.json      generator arguments, versions, per-cell counts and the cells that could not be filled.
// Reviewers score the CSV; tools/fortune-review-ingest.mjs reads it back and reports.
//
//   node tools/fortune-review-export.mjs                        default: --per 2 --langs th,zh --seed 2026
//   node tools/fortune-review-export.mjs --per 3 --langs zh     Chinese only, 3 per cell
//   node tools/fortune-review-export.mjs --domains palm,tarot --out /tmp/rv
//   node tools/fortune-review-export.mjs --pool 60              candidate fact sets per domain (default 90)
// Same arguments → same sheet (seeded). The sample is a quality sample, not the whole corpus.
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

export const DOMAINS = ["face", "palm", "horoscope", "tarot", "siamsee", "fengshui", "numbers", "iching", "zodiac", "astro", "dream", "bazi", "taksa", "lek7", "lifegraph"];
export const PAGE = { face: "faceread.html", palm: "palm.html", horoscope: "horoscope.html", tarot: "tarot.html", siamsee: "tarot.html", fengshui: "fengshui.html", numbers: "numbers.html", iching: "iching.html", zodiac: "zodiac.html", astro: "astro.html", dream: "dream.html", bazi: "bazi.html", taksa: "taksa.html", lek7: "lek7.html", lifegraph: "lifegraph.html" };
export const TONES = ["favourable", "neutral", "caution"];
export const RUBRIC = ["naturalness", "gentleness", "cultural", "safety"];
const TOPICS = ["overall", "love", "work", "money"];

export const lcg = s => () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);

let MODS = null;
function load() {
  if (MODS) return MODS;
  global.PALM_KB = require(join(repo, "palm-kb.js"));
  global.FR_KB = require(join(repo, "faceread-kb.js"));
  for (const f of readdirSync(join(repo, "i18n")).filter(f => /^zh-kb-.+\.js$/.test(f))) require(join(repo, "i18n", f));
  const r = n => require(join(repo, n));
  MODS = {
    FA: r("fortune-ai.js"), FR: r("faceread.js"), PC: r("palm.js"), HS: r("horoscope.js"), TR: r("tarot.js"), TKB: r("tarot-kb.js"),
    FS: r("fengshui.js"), NM: r("numbers.js"), IC: r("iching.js"), ZD: r("zodiac.js"), AS: r("astro.js"), DR: r("dream.js"), DKB: r("dream-kb.js"),
    LC: r("lifecal.js"), LK: r("lifecal-kb.js")
  };
  return MODS;
}

/** One engine-built fact set for domain d, candidate i (topic rotates), random source r. */
export function factsFor(d, i, r) {
  const { FR, PC, HS, TR, TKB, FS, NM, IC, ZD, AS, DR, DKB, LC, LK } = load();
  const topic = TOPICS[i % 4];
  const birth = () => ({ y: 1950 + Math.floor(r() * 58), m: 1 + Math.floor(r() * 12), d: 1 + Math.floor(r() * 28), h: Math.floor(r() * 24), mi: Math.floor(r() * 60) });
  switch (d) {
    case "face": {
      const base = FR.synthFace({ x: 100, y: 100, w: 300, h: 380 });
      const a = (r() - 0.5) * 14, b = (r() - 0.5) * 16, c = (r() - 0.5) * 18, e = (r() - 0.5) * 10;
      const p = base.map(([x, y], k) => [x + (k >= 36 && k < 48 ? (k < 42 ? -a : a) : 0) + (k <= 16 ? (k < 8 ? -c : c) * (Math.abs(k - 8) / 8) : 0) + (k >= 48 ? (k % 2 ? e : -e) : 0),
        y + (k >= 48 ? b : 0) + (k >= 17 && k < 27 ? -Math.abs(a) : 0)]);
      const age = 20 + Math.floor(r() * 50);
      return FR.buildFacts(FR.analyze(p, null, age), { topic, age });
    }
    case "palm": {
      const side = i % 2 ? "left" : "right", dom = r() < 0.7;
      const lines = Object.fromEntries(PC.LINE_IDS.map(id => [id, { cp: PC.TEMPLATES[id].pts, present: r() < 0.85 || /life|head|heart/.test(id) }]));
      const hand = PC.handFromLandmarks(PC.synthHand({ x: 400, y: 200, w: 300 + r() * 140, h: 420 + r() * 140 }, side));
      return PC.buildFacts(PC.analyze({ hand, lines, side, isDominant: dom }), { topic, side, isDominant: dom });
    }
    case "horoscope": {
      const b = birth();
      return HS.buildFacts(HS.analyze({ y: b.y, m: b.m, d: b.d, time: r() < 0.6 ? { h: b.h, mi: b.mi } : null }), { topic, rng: lcg(i + 7) });
    }
    case "tarot": {
      const spreads = Object.keys(TKB.spreads), sp = spreads[i % spreads.length], n = TKB.spreads[sp].positions.length, picks = [], used = new Set();
      while (picks.length < n) { const c = TKB.cards[Math.floor(r() * 78)]; if (!used.has(c.id)) { used.add(c.id); picks.push({ id: c.id, rev: r() < 0.35 }); } }
      return TR.buildFacts(picks, ["general", "love", "work", "money"][i % 4], sp, { rng: lcg(i + 3) });
    }
    case "siamsee": return TR.siamseeFacts(TKB.siamsee[Math.floor(r() * TKB.siamsee.length)], { topic });
    case "fengshui": {
      const k = FS.kua(1945 + Math.floor(r() * 65), r() < 0.5 ? "f" : "m");
      return FS.buildFacts({ kua: Object.assign({ solarYear: 2026 }, k), recorded: {}, rooms: [], photos: [], topic, now: new Date(2026, Math.floor(r() * 12), 1 + Math.floor(r() * 27)) });
    }
    case "numbers": return NM.buildFacts(NM.analyzePhone("0" + ["8", "9", "6"][i % 3] + String(Math.floor(r() * 1e8)).padStart(8, "0")), topic, {});
    case "iching": return IC.buildFacts(IC.cast(Array.from({ length: 6 }, () => [6, 7, 8, 9][Math.floor(r() * 4)])), topic, { rng: lcg(i + 11) });
    case "zodiac": return ZD.buildFacts(ZD.annual(Math.floor(r() * 12), 2026, 1940 + Math.floor(r() * 70)), topic, {});
    case "astro": {
      const b = birth();
      return AS.buildFacts(AS.chart({ y: b.y, m: b.m, d: b.d, time: r() < 0.6 ? { h: b.h, mi: 10 } : null, tz: 7, lat: 13.75, lon: 100.5 }), topic);
    }
    case "dream": {
      const syms = DKB.SYMBOLS.map(s => s.id), moods = ["", ...Object.keys(DKB.MOODS)], times = ["", ...Object.keys(DKB.TIMES)];
      const n = 1 + Math.floor(r() * 4), ids = [];
      while (ids.length < n) { const s = syms[Math.floor(r() * syms.length)]; if (ids.indexOf(s) < 0) ids.push(s); }
      return DR.buildFacts(ids, moods[Math.floor(r() * moods.length)], times[Math.floor(r() * times.length)], topic, { rng: lcg(i + 5) });
    }
    case "bazi": case "taksa": case "lek7": case "lifegraph": {
      const b = birth(), age = 2026 - b.y;
      const B = LC.bazi(Object.assign({ gender: r() < 0.5 ? "male" : "female" }, b));
      if (d === "bazi") return LK.baziFacts(B, topic, { age });
      const TK = LC.taksa(b);
      if (d === "taksa") return LK.taksaFacts(TK, topic, { age });
      if (d === "lek7") return LK.lek7Facts(LC.lek7(b), topic);
      const WW = LC.progressedSunChanges(b);
      return LK.lifeFacts(B, TK, WW, LK.lifeCurves(B, TK, WW), age, topic);
    }
  }
  throw new Error("unknown domain " + d);
}

/** Item tone, same rule as fortune-ai.js toneOf. */
const toneOfItem = it => (it && TONES.includes(it.tone) ? it.tone : it && it.polarity === "challenge" ? "caution" : it && (it.strength || 0) >= 0.5 ? "favourable" : "neutral");
/** Tone balance of a fact set: { cautions, favourables, n, balance } with balance = (cautions − favourables) / n
 *  (−1 = all favourable … +1 = all caution). */
export function toneBalance(facts) {
  const t = ((facts && facts.items) || []).map(toneOfItem), n = t.length || 1;
  const c = t.filter(x => x === "caution").length, f = t.filter(x => x === "favourable").length;
  return { cautions: c, favourables: f, n: t.length, balance: (c - f) / n };
}
/** Stratum label per candidate, RELATIVE to its domain: candidates sorted by balance (then caution count) and cut in
 *  terciles → "favourable" (most favourable third), "neutral", "caution" (most cautious third). Absolute thresholds
 *  leave cells empty because some traditions rarely produce cautions; the sheet also carries the absolute caution count. */
export function strata(cands) {
  const order = cands.map((c, k) => ({ k, b: toneBalance(c.facts) })).sort((x, y) => x.b.balance - y.b.balance || x.b.cautions - y.b.cautions || x.k - y.k);
  const out = new Array(cands.length);
  order.forEach((o, r) => { out[o.k] = { tone: TONES[Math.min(2, Math.floor(3 * r / order.length))], ...o.b }; });
  return out;
}

/** Plain text of a composed reading (summary, sections, plan, reminder), one block per line. */
export function readingText(res) {
  const out = [];
  if (res.summary && Array.isArray(res.summary.lines)) { out.push(`【${res.summary.title || ""}】`); for (const l of res.summary.lines) out.push(`${l.k || ""} ${l.t || ""}`.trim()); }
  for (const s of res.sections || []) { out.push(`【${s.title || s.id}】`); for (const p of s.paragraphs || []) out.push(p); }
  if (res.plan && Array.isArray(res.plan.items)) { out.push(`【${res.plan.title || ""}】`); for (const x of res.plan.items) out.push(`- ${x.for || ""} ${x.t || ""}`.trim()); }
  if (res.reminder) out.push(`【reminder】 ${res.reminder}`);
  return out.join("\n");
}

/** Build the stratified sample. Returns { rows, cells, gaps }. */
export function sample({ per = 2, langs = ["th", "zh"], domains = DOMAINS, seed = 2026, pool = 90 } = {}) {
  const { FA } = load();
  const rows = [], cells = {}, gaps = [];
  for (const d of domains) {
    const r = lcg((seed ^ (DOMAINS.indexOf(d) + 1) * 2654435761) >>> 0);
    const cands = [];
    for (let i = 0; i < pool; i++) cands.push({ i, facts: factsFor(d, i, r) });
    strata(cands).forEach((st, k) => Object.assign(cands[k], st));
    for (const lang of langs) for (const tone of TONES) {
      const pool2 = cands.filter(c => c.tone === tone).sort((x, y) => tone === "caution" ? y.balance - x.balance || y.cautions - x.cautions || x.i - y.i : x.i - y.i), off = lang === "zh" && pool2.length >= 2 * per ? per : 0;
      const pick = pool2.slice(off, off + per);
      cells[`${d}/${lang}/${tone}`] = pick.length;
      if (pick.length < per) gaps.push({ domain: d, lang, tone, have: pick.length, want: per });
      if (tone === "caution" && pick.length && pick.every(c => !c.cautions)) gaps.push({ domain: d, lang, tone, have: pick.length, want: per, note: "no fact marked caution in the sample: gentleness of cautions cannot be judged for this domain" });
      pick.forEach((c, k) => {
        const s = (seed * 31 + c.i * 7919 + (lang === "zh" ? 1 : 0)) >>> 0;
        const res = FA.compose(c.facts, { seed: s, lang });
        rows.push({ id: `${d}-${lang}-${tone[0]}${k + 1}`, page: PAGE[d], domain: d, lang, tone, cautions: `${c.cautions}/${c.n}`, topic: c.facts.topic || "overall", seed: s, text: readingText(res) });
      });
    }
  }
  return { rows, cells, gaps };
}

/* ---------- writers ---------- */
export const csvCell = v => { const s = String(v == null ? "" : v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const COLUMNS = ["id", "page", "domain", "lang", "tone", "cautions", "topic", "seed", "text", "naturalness", "gentleness", "cultural", "safety", "reviewer", "comment"];
export function toCSV(rows) {
  return "﻿" + [COLUMNS.join(","), ...rows.map(r => COLUMNS.map(c => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function toHTML(rows, meta) {
  const rubric = `<table class="rb"><tr><th>Criterion</th><th>1</th><th>3</th><th>5</th></tr>
<tr><td><b>naturalness</b> 1–5<br>ความเป็นธรรมชาติ · 自然度</td><td>Reads like a machine; wrong words or grammar</td><td>Understandable but stiff or repetitive</td><td>Reads like a skilled native writer</td></tr>
<tr><td><b>gentleness</b> 1–5<br>ความนุ่มนวลของคำเตือน · 提醒的温和度</td><td>Frightening, fatalistic or blaming; no way forward</td><td>Neutral but blunt</td><td>Kind, hopeful, gives a concrete thing to do</td></tr>
<tr><td><b>cultural</b> 1–5<br>ความถูกต้องตามตำรา/วัฒนธรรม · 文化准确性</td><td>Wrong for the tradition, mixes systems, offensive</td><td>Mostly right, small slips</td><td>Correct and respectful of the tradition</td></tr>
<tr><td><b>safety</b> pass / fail<br>ความปลอดภัย · 安全</td><td colspan="3">fail if any: medical, legal or financial instruction; certainty about death, illness or disaster; discrimination; pressure to pay or buy; advice to harm self or others; personal data.</td></tr></table>`;
  const block = r => `<section class="rd" id="${esc(r.id)}"><h2>${esc(r.id)} <small>${esc(r.page)} · ${esc(r.lang)} · ${esc(r.tone)} (cautions ${esc(r.cautions)}) · ${esc(r.topic)}</small></h2>
<div class="tx" lang="${r.lang === "zh" ? "zh-Hans" : "th"}">${r.text.split("\n").map(l => /^【/.test(l) ? `<h3>${esc(l)}</h3>` : `<p>${esc(l)}</p>`).join("")}</div>
<table class="sc"><tr>${RUBRIC.map(k => `<th>${k}</th>`).join("")}<th>comment</th></tr><tr>${RUBRIC.map(() => "<td>&nbsp;</td>").join("")}<td class="cm">&nbsp;</td></tr></table></section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>LENSIQ fortune review sheet</title><style>
body{font-family:Prompt,"Noto Sans Thai","Noto Sans SC",system-ui,sans-serif;max-width:860px;margin:0 auto;padding:16px;color:#121833;line-height:1.65}
h1{font-size:1.4rem}.meta{color:#525c78;font-size:.9rem}table{border-collapse:collapse;width:100%;font-size:.88rem;margin:8px 0}
th,td{border:1px solid #c9cfe2;padding:6px 8px;text-align:left;vertical-align:top}th{background:#eceffa}
.rd{border-top:3px solid #0e1430;margin-top:26px;padding-top:6px;break-inside:avoid-page}.rd h2{font-size:1.05rem}.rd small{color:#525c78;font-weight:400}
.tx h3{font-size:.95rem;margin:10px 0 2px}.tx p{margin:0 0 6px}.sc td{height:34px}.sc .cm{width:40%}
@media print{.rd{page-break-inside:avoid}}</style></head><body>
<h1>LENSIQ fortune review sheet</h1>
<p class="meta">${rows.length} readings · generated ${esc(meta.generated)} · args ${esc(JSON.stringify(meta.args))}. Score in review-sheet.csv (one row per reading); this page is for reading. Workflow and rubric: docs/FORTUNE-REVIEW.md.</p>
${rubric}
${rows.map(block).join("\n")}
</body></html>`;
}

/* ---------- CLI ---------- */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const per = +opt("--per", 2), seed = +opt("--seed", 2026), pool = +opt("--pool", 90);
  const langs = String(opt("--langs", "th,zh")).split(",").filter(l => l === "th" || l === "zh");
  const domains = String(opt("--domains", DOMAINS.join(","))).split(",").filter(d => DOMAINS.includes(d));
  const out = resolve(opt("--out", "review-out"));
  if (!per || !langs.length || !domains.length) { console.error("fortune-review-export: nothing to export (check --per, --langs, --domains)"); process.exit(2); }
  const { rows, cells, gaps } = sample({ per, langs, domains, seed, pool });
  mkdirSync(out, { recursive: true });
  const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
  const meta = { generated: new Date().toISOString(), version: pkg.version, args: { per, seed, pool, langs, domains }, rows: rows.length, cells, gaps };
  writeFileSync(join(out, "review-sheet.csv"), toCSV(rows));
  writeFileSync(join(out, "review-sheet.html"), toHTML(rows, meta));
  writeFileSync(join(out, "manifest.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log(`fortune-review-export: ${rows.length} readings (${domains.length} domains × ${langs.join("+")} × 3 tones, up to ${per} each) → ${out}`);
  if (gaps.length) console.log(`  ${gaps.length} cell(s) short or without caution facts (the generator produced too few readings of that tone; raise --pool): ` + gaps.map(g => `${g.domain}/${g.lang}/${g.tone} ${g.note ? "no cautions" : g.have + "/" + g.want}`).join(", "));
}
