#!/usr/bin/env node
// tools/fortune-depth-audit.mjs — reading-depth and belief-advice repetition audit of the fortune pages (owner order
// 2026-11-17 night, items 3a / 4a / 4c). MEASURES ONLY: it changes no product file and sets no ceiling.
//
// Input: the locked synthetic profile set ~/LENSIQ-field/evals/fortune-depth/profiles.json (30 per reading domain, all
// synthetic: birth dates, card draws, phone numbers, hexagram lines, dream symbols, face / palm landmark offsets on the
// engines' own synthetic templates; no image of a person). Its sha256 is committed in evals-locks/fortune-depth.sha256
// BEFORE any measurement; assertLocked() refuses to run otherwise (owner rule 2026-11-13).
//
// Every reading is produced by the real code path the pages use offline: engine -> facts -> FortuneAI.compose (Thai, local
// composer, no network) -> LQRead.planSection (fortune-read.js: what is shown vs folded behind "อ่านเพิ่มเติม"). The belief
// panel ("สิ่งที่ทำได้ตามความเชื่อ") is LQMeritCore.panelModel over the bundled samples (what the live site serves with no
// backend: LENSIQ_API_BASE is empty), after the same lint filter the page applies.
//
// Definitions (fixed before measuring):
//   words      Intl.Segmenter("th", {granularity: "word"}) segments with isWordLike, counted over the text.
//   visible    the summary card lines (label + text), the 3-step plan items, and every section part planSection marks
//              visible (the first ~3 lines of each group + every caution paragraph). Headings, the one-line notice, the
//              reminder, "ที่มาของผล" and the belief panel are not counted.
//   expanded   every section part planSection marks not visible (what "อ่านเพิ่มเติม" opens).
//   unit       a composer sentence (FortuneAI.safety.sentences) of a visible / expanded text; a unit of < 4 words is
//              joined to the one before it; a unit with < 3 words is dropped.
//   point      a unit whose word-bigram set has Jaccard < 0.5 against every earlier unit of the same reading (reading
//              order: visible first, then expanded) and is not an exact repeat. distinct points = number of points.
//   new%       expanded units that are points / expanded units (100% = everything behind read more is new substance).
//   advice     (a) belief panel = the panel's cards (type label, title, body) joined in order; (b) composer advice = the
//              plan items + the "advice" section paragraphs. Identity = exact string match.
//   node tools/fortune-depth-audit.mjs gen           write profiles.json (refuses to overwrite)
//   node tools/fortune-depth-audit.mjs [--json out]  measure (refuses unless the set is locked and committed)
//   ... --depth [--strict]                          also C5–C7 pass / fail against ceilings-v1.json (locked)
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocked, phaseDir } from "./eval-guard.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const PHASE = "fortune-depth";
const SET = "profiles.json";
const N = 30;
export const DOMAINS = ["face", "palm", "horoscope", "tarot", "siamsee", "fengshui", "numbers", "iching", "zodiac", "astro", "dream", "bazi", "taksa", "lek7", "lifegraph", "report"];
export const PAGE = { face: "faceread", palm: "palm", horoscope: "horoscope", tarot: "tarot", siamsee: "tarot (เซียมซี)", fengshui: "fengshui", numbers: "numbers",
  iching: "iching", zodiac: "zodiac", astro: "astro", dream: "dream", bazi: "bazi", taksa: "taksa", lek7: "lek7", lifegraph: "lifegraph", report: "report" };
const TOPICS = ["overall", "love", "work", "money"];
const lcg = s => () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
const r2 = x => Math.round(x * 1000) / 1000;

let M = null;
function load() {
  if (M) return M;
  global.PALM_KB = require(join(repo, "palm-kb.js"));
  global.FR_KB = require(join(repo, "faceread-kb.js"));
  for (const f of readdirSync(join(repo, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(join(repo, "i18n", f));
  const q = n => require(join(repo, n));
  M = { FA: q("fortune-ai.js"), RD: q("fortune-read.js"), FR: q("faceread.js"), PC: q("palm.js"), HS: q("horoscope.js"), TR: q("tarot.js"), TKB: q("tarot-kb.js"),
    FS: q("fengshui.js"), NM: q("numbers.js"), IC: q("iching.js"), ZD: q("zodiac.js"), AS: q("astro.js"), DR: q("dream.js"), DKB: q("dream-kb.js"),
    LC: q("lifecal.js"), LK: q("lifecal-kb.js"), RP: q("report.js"), MC: q("lensiq-merit-core.js"), ML: q("lensiq-merit-lint.js"), SEED: q("lensiq-merit-seed.js") };
  return M;
}

/* ---------------- the profile set (gen only) ---------------- */
export function makeProfiles() {
  const { TKB, PC, DKB } = load();
  const out = [];
  DOMAINS.forEach((d, di) => {
    const r = lcg((20261117 ^ (di + 1) * 2654435761) >>> 0);
    const int = (a, b) => a + Math.floor(r() * (b - a + 1));
    const birth = () => ({ y: int(1950, 2007), m: int(1, 12), d: int(1, 28), h: int(0, 23), mi: int(0, 59) });
    for (let i = 0; i < N; i++) {
      const p = { id: `${d}-${String(i + 1).padStart(2, "0")}`, domain: d, topic: TOPICS[i % 4], seed: int(1, 2 ** 31 - 1) };
      switch (d) {
        case "face": p.input = { a: r2((r() - 0.5) * 14), b: r2((r() - 0.5) * 16), c: r2((r() - 0.5) * 18), e: r2((r() - 0.5) * 10), age: int(20, 69) }; break;
        case "palm": p.input = { side: i % 2 ? "left" : "right", dominant: r() < 0.7, w: r2(300 + r() * 140), h: r2(420 + r() * 140),
          present: Object.fromEntries(PC.LINE_IDS.map(id => [id, r() < 0.85 || /life|head|heart/.test(id)])) }; break;
        case "horoscope": { const b = birth(); p.input = { y: b.y, m: b.m, d: b.d, time: r() < 0.6 ? { h: b.h, mi: b.mi } : null }; break; }
        case "tarot": {
          const spreads = Object.keys(TKB.spreads), sp = spreads[i % spreads.length], n = TKB.spreads[sp].positions.length, picks = [], used = new Set();
          while (picks.length < n) { const c = TKB.cards[Math.floor(r() * TKB.cards.length)]; if (!used.has(c.id)) { used.add(c.id); picks.push({ id: c.id, rev: r() < 0.35 }); } }
          p.input = { spread: sp, picks, question: ["general", "love", "work", "money"][i % 4] }; break;
        }
        case "siamsee": p.input = { stick: Math.floor(r() * TKB.siamsee.length) }; break;
        case "fengshui": p.input = { year: int(1945, 2009), gender: r() < 0.5 ? "f" : "m", month: int(0, 11), day: int(1, 27) }; break;
        case "numbers": p.input = { phone: "0" + ["8", "9", "6"][i % 3] + String(Math.floor(r() * 1e8)).padStart(8, "0") }; break;
        case "iching": p.input = { lines: Array.from({ length: 6 }, () => [6, 7, 8, 9][Math.floor(r() * 4)]) }; break;
        case "zodiac": p.input = { animal: int(0, 11), year: 2026, born: int(1940, 2009) }; break;
        case "astro": { const b = birth(); p.input = { y: b.y, m: b.m, d: b.d, time: r() < 0.6 ? { h: b.h, mi: 10 } : null }; break; }
        case "dream": {
          const syms = DKB.SYMBOLS.map(s => s.id), moods = ["", ...Object.keys(DKB.MOODS)], times = ["", ...Object.keys(DKB.TIMES)], n = int(1, 4), ids = [];
          while (ids.length < n) { const s = syms[Math.floor(r() * syms.length)]; if (!ids.includes(s)) ids.push(s); }
          p.input = { symbols: ids, mood: moods[Math.floor(r() * moods.length)], time: times[Math.floor(r() * times.length)] }; break;
        }
        default: { const b = birth(); p.input = Object.assign(b, { gender: r() < 0.5 ? "male" : "female" }); }
      }
      out.push(p);
    }
  });
  return { phase: PHASE, made: "2026-11-17", lang: "th", now: "2026-11-17T12:00:00+07:00", note: "synthetic only; no image of a person", profiles: out };
}

/* ---------------- facts + reading for one profile ---------------- */
function factsOf(p, now) {
  const { FR, PC, HS, TR, TKB, FS, NM, IC, ZD, AS, DR, LC, LK } = load();
  const x = p.input, topic = p.topic;
  switch (p.domain) {
    case "face": {
      const base = FR.synthFace({ x: 100, y: 100, w: 300, h: 380 }), { a, b, c, e } = x;
      const pts = base.map(([px, py], k) => [px + (k >= 36 && k < 48 ? (k < 42 ? -a : a) : 0) + (k <= 16 ? (k < 8 ? -c : c) * (Math.abs(k - 8) / 8) : 0) + (k >= 48 ? (k % 2 ? e : -e) : 0),
        py + (k >= 48 ? b : 0) + (k >= 17 && k < 27 ? -Math.abs(a) : 0)]);
      return FR.buildFacts(FR.analyze(pts, null, x.age), { topic, age: x.age });
    }
    case "palm": {
      const lines = Object.fromEntries(PC.LINE_IDS.map(id => [id, { cp: PC.TEMPLATES[id].pts, present: !!x.present[id] }]));
      const hand = PC.handFromLandmarks(PC.synthHand({ x: 400, y: 200, w: x.w, h: x.h }, x.side));
      return PC.buildFacts(PC.analyze({ hand, lines, side: x.side, isDominant: x.dominant }), { topic, side: x.side, isDominant: x.dominant });
    }
    case "horoscope": return HS.buildFacts(HS.analyze({ y: x.y, m: x.m, d: x.d, time: x.time }), { topic, rng: lcg(p.seed) });
    case "tarot": return TR.buildFacts(x.picks, x.question, x.spread, { rng: lcg(p.seed) });
    case "siamsee": return TR.siamseeFacts(TKB.siamsee[x.stick], { topic });
    case "fengshui": return FS.buildFacts({ kua: Object.assign({ solarYear: 2026 }, FS.kua(x.year, x.gender)), recorded: {}, rooms: [], photos: [], topic, now: new Date(2026, x.month, x.day) });
    case "numbers": return NM.buildFacts(NM.analyzePhone(x.phone), topic, {});
    case "iching": return IC.buildFacts(IC.cast(x.lines), topic, { rng: lcg(p.seed) });
    case "zodiac": return ZD.buildFacts(ZD.annual(x.animal, x.year, x.born), topic, {});
    case "astro": return AS.buildFacts(AS.chart({ y: x.y, m: x.m, d: x.d, time: x.time, tz: 7, lat: 13.75, lon: 100.5 }), topic);
    case "dream": return DR.buildFacts(x.symbols, x.mood, x.time, topic, { rng: lcg(p.seed) });
    case "bazi": case "taksa": case "lek7": case "lifegraph": {
      const age = now.getFullYear() - x.y, B = LC.bazi(x);
      if (p.domain === "bazi") return LK.baziFacts(B, topic, { age });
      const TK = LC.taksa(x);
      if (p.domain === "taksa") return LK.taksaFacts(TK, topic, { age });
      if (p.domain === "lek7") return LK.lek7Facts(LC.lek7(x), topic);
      const WW = LC.progressedSunChanges(x);
      return LK.lifeFacts(B, TK, WW, LK.lifeCurves(B, TK, WW), age, topic);
    }
  }
  throw new Error("unknown domain " + p.domain);
}
/** { summary[], plan[], sections:[{id, paragraphs, caution}], facts } as the page composes it offline (Thai by default; the
 *  measures above use Thai only, lang is for tests/unit/fortune-depth-warnings.test.js) */
export function readingOf(p, now, lang = "th") {
  const { FA, RP } = load();
  if (p.domain === "report") {
    const rep = RP.buildBasic(p.input, { lang, now });
    const sections = rep.parts.flatMap(x => x.sections || []);
    const facts = { domain: "bazi", items: [] }; // the report page has no belief panel (nav.js meritHook page list)
    return { summary: rep.summary, plan: rep.plan, sections, facts, plan30: rep.plan30 };
  }
  const facts = factsOf(p, now);
  const res = FA.compose(facts, { seed: p.seed, lang });
  return { summary: res.summary, plan: res.plan, sections: res.sections || [], facts };
}

/* ---------------- measures ---------------- */
const SEG = new Intl.Segmenter("th", { granularity: "word" });
export const words = t => [...SEG.segment(String(t || ""))].filter(s => s.isWordLike).map(s => s.segment);
const bigrams = w => { const s = new Set(); for (let i = 0; i + 1 < w.length; i++) s.add(w[i] + "\u0001" + w[i + 1]); if (w.length === 1) s.add(w[0]); return s; };
const jac = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; const u = a.size + b.size - n; return u ? n / u : 0; };
function unitsOf(texts) {
  const { FA } = load(), out = [];
  for (const t of texts) {
    const sen = FA.safety.sentences(String(t)), us = [];
    for (const s of sen) { const w = words(s); if (us.length && w.length < 4) { us[us.length - 1].push(...w); } else us.push(w); }
    for (const w of us) if (w.length >= 3) out.push(w);
  }
  return out;
}
function depth(rd) {
  const { RD } = load();
  const vis = [], exp = [];
  for (const l of (rd.summary && rd.summary.lines) || []) vis.push(`${l.k || ""} ${l.t || ""}`.trim());
  for (const x of (rd.plan && rd.plan.items) || []) vis.push(`${x.for || ""} ${x.t || ""}`.trim());
  for (const s of rd.sections) for (const part of RD.planSection(s, "th")) (part.visible ? vis : exp).push(part.text);
  const vU = unitsOf(vis), eU = unitsOf(exp), seen = [], seenStr = new Set();
  let points = 0, expPoints = 0;
  const judge = (w, isExp) => {
    const key = w.join(""), bg = bigrams(w);
    const isNew = !seenStr.has(key) && seen.every(o => jac(bg, o) < 0.5);
    seenStr.add(key); seen.push(bg);
    if (isNew) { points++; if (isExp) expPoints++; }
  };
  vU.forEach(w => judge(w, false)); eU.forEach(w => judge(w, true));
  const vw = vis.reduce((n, t) => n + words(t).length, 0), ew = exp.reduce((n, t) => n + words(t).length, 0);
  return { visWords: vw, expWords: ew, ratio: vw ? ew / vw : 0, points, expUnits: eU.length, expPoints, newPct: eU.length ? expPoints / eU.length : null };
}
function adviceOf(rd, p) {
  const { MC, ML, SEED } = load();
  const page = p.domain === "siamsee" ? "tarot.html" : (p.domain === "face" ? "faceread" : p.domain) + ".html";
  let panel = "";
  let cards = [];
  if (p.domain !== "report") {
    const items = MC.safeItems(SEED, ML.lintMerit);
    const m = MC.panelModel(items, { choice: "", keys: MC.keysFromFacts(rd.facts, page), lang: "th", crisis: false });
    cards = m ? m.cards : [];
    panel = cards.map(c => `${c.typeLabel}|${c.title}|${c.body}`).join("\n");
  }
  const comp = [...((rd.plan && rd.plan.items) || []).map(x => x.t), ...rd.sections.filter(s => s.id === "advice").flatMap(s => s.paragraphs)].join("\n");
  return { panel, cardIds: cards.map(c => c.id), comp, keys: p.domain === "report" ? [] : MC.keysFromFacts(rd.facts, page) };
}
const median = a => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
function identity(strings) {
  const c = new Map(); for (const s of strings) c.set(s, (c.get(s) || 0) + 1);
  const top = Math.max(0, ...c.values());
  const inShared = [...c.values()].filter(v => v > 1).reduce((a, b) => a + b, 0);
  return { n: strings.length, distinct: c.size, topCount: top, topShare: strings.length ? top / strings.length : 0, inShared };
}

export function measure(set) {
  const now = new Date(set.now);
  const per = {}, all = { panel: [], comp: [] }, cardUse = new Map(), keyUse = new Map();
  for (const p of set.profiles) {
    const rd = readingOf(p, now), d = depth(rd), a = adviceOf(rd, p);
    (per[p.domain] = per[p.domain] || { depth: [], panel: [], comp: [] });
    per[p.domain].depth.push(d); per[p.domain].panel.push(a.panel); per[p.domain].comp.push(a.comp);
    if (p.domain !== "report") {
      all.panel.push(a.panel);
      for (const id of a.cardIds) cardUse.set(id, (cardUse.get(id) || 0) + 1);
      for (const k of new Set(a.keys.map(k => (/^domain:/.test(k) ? "domain" : k.replace(/:.*/, ":*"))))) keyUse.set(k, (keyUse.get(k) || 0) + 1);
    }
    all.comp.push(a.comp);
  }
  const rows = [];
  for (const d of DOMAINS) {
    const x = per[d]; if (!x) continue;
    const col = k => x.depth.map(y => y[k]).filter(v => v != null);
    rows.push({ domain: d, page: PAGE[d], n: x.depth.length,
      visWords: { median: median(col("visWords")), min: Math.min(...col("visWords")) },
      expWords: { median: median(col("expWords")), min: Math.min(...col("expWords")) },
      ratio: { median: r2(median(col("ratio"))), min: r2(Math.min(...col("ratio"))) },
      points: { median: median(col("points")), min: Math.min(...col("points")) },
      newPct: { median: col("newPct").length ? r2(median(col("newPct"))) : null, min: col("newPct").length ? r2(Math.min(...col("newPct"))) : null },
      panel: d === "report" ? null : identity(x.panel), comp: identity(x.comp) });
  }
  return { rows, across: { panel: identity(all.panel), comp: identity(all.comp) }, cardUse: Object.fromEntries([...cardUse].sort((a, b) => b[1] - a[1])),
    keyUse: Object.fromEntries(keyUse), seedItems: load().SEED.length, seedPublished: load().SEED.filter(i => i.status === "published").length };
}

function table(res) {
  const L = [];
  const pct = v => (v == null ? "–" : Math.round(v * 100) + "%"), mm = o => `${o.median} / ${o.min}`, pm = o => `${pct(o.median)} / ${pct(o.min)}`;
  const idn = o => (o ? `${o.distinct} / ${pct(o.topShare)} / ${o.inShared}` : "no panel");
  const across = (name, o) => `Across pages (${name}, ${o.n} readings): ${o.distinct} distinct texts, the most common shown to ${o.topCount} ` +
    `(${pct(o.topShare)}), ${o.inShared} readings share their text with at least one other.`;
  L.push("| page | n | visible words | expanded words | exp/vis | distinct points | new% behind read more | belief panel: distinct / top / shared | " +
    "composer advice: distinct / top / shared |");
  L.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of res.rows) {
    L.push(`| ${r.page} | ${r.n} | ${mm(r.visWords)} | ${mm(r.expWords)} | ${mm(r.ratio)} | ${mm(r.points)} | ${pm(r.newPct)} | ${idn(r.panel)} | ${idn(r.comp)} |`);
  }
  L.push("", "(number pairs: median / min over the 30 profiles)", "", across("belief panel", res.across.panel), across("composer advice", res.across.comp));
  L.push(`Belief cards used (of ${res.seedItems} bundled, ${res.seedPublished} published): ${JSON.stringify(res.cardUse)}`);
  L.push(`Matching keys produced (readings carrying each kind): ${JSON.stringify(res.keyUse)}`);
  return L.join("\n");
}

/* ---------------- C5–C7 depth ceilings (ceilings-v1.json, locked) — pass / fail per page ----------------
   C5 expanded / visible words: median >= median_min and every reading has >= per_reading_min_words_behind_read_more words
   behind "อ่านเพิ่มเติม"; C6 distinct points: median >= median_min, min >= per_reading_min; C7 new% behind read more:
   median >= median_min, min >= per_reading_min. Kept apart from the C1–C4 checks (another stream owns those). */
export function depthChecks(res, ceil) {
  const c5 = ceil.C5_expanded_over_visible_words, c6 = ceil.C6_distinct_points, c7 = ceil.C7_new_substance_behind_read_more;
  return res.rows.map(r => {
    const C5 = r.ratio.median >= c5.median_min && r.expWords.min >= c5.per_reading_min_words_behind_read_more;
    const C6 = r.points.median >= c6.median_min && r.points.min >= c6.per_reading_min;
    const C7 = r.newPct.median != null && r.newPct.median >= c7.median_min && r.newPct.min >= c7.per_reading_min;
    return { page: r.page, C5, C6, C7, pass: C5 && C6 && C7,
      values: { C5: `${r.ratio.median} / ${r.expWords.min} words`, C6: `${r.points.median} / ${r.points.min}`, C7: `${r.newPct.median} / ${r.newPct.min}` } };
  });
}
export function depthTable(checks) {
  const ok = b => (b ? "pass" : "FAIL");
  return ["| page | C5 exp/vis median / min words | C6 points median / min | C7 new% median / min |", "|---|---|---|---|"]
    .concat(checks.map(c => `| ${c.page} | ${ok(c.C5)} ${c.values.C5} | ${ok(c.C6)} ${c.values.C6} | ${ok(c.C7)} ${c.values.C7} |`))
    .concat(["", `C5–C7: ${checks.filter(c => c.pass).length} / ${checks.length} pages pass`]).join("\n");
}

const cmd = process.argv[2];
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = phaseDir(PHASE), file = join(dir, SET);
  if (cmd === "gen") {
    if (existsSync(file)) { console.error(`refused: ${file} exists (a locked set is never rewritten; make a new phase)`); process.exit(1); }
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(makeProfiles(), null, 1) + "\n", { flag: "wx" });
    console.log("wrote " + file + "\nnext: node tools/eval-guard.mjs lock " + PHASE + " " + SET);
  } else {
    assertLocked(PHASE, [SET]);
    const set = JSON.parse(readFileSync(file, "utf8"));
    const res = measure(set);
    const j = process.argv.indexOf("--json");
    if (j > 0 && process.argv[j + 1]) writeFileSync(process.argv[j + 1], JSON.stringify(res, null, 1));
    console.log(table(res));
    if (process.argv.includes("--depth")) { // C5–C7 against the locked ceilings (exit 1 on a miss with --strict)
      assertLocked(PHASE, [SET, "ceilings-v1.json"]);
      const checks = depthChecks(res, JSON.parse(readFileSync(join(dir, "ceilings-v1.json"), "utf8")));
      console.log("\n" + depthTable(checks));
      if (process.argv.includes("--strict") && checks.some(c => !c.pass)) process.exitCode = 1;
    }
  }
}
