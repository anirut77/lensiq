"use strict";
// tests/unit/fortune-layout-caution.test.js — FIXED TEST SET, review round 2 of owner order 2026-11-14 Part A (finding F1).
// Locked (evals-locks/fortune-layout__caution.sha256, ~/LENSIQ-field/evals/fortune-layout/caution/) BEFORE the fix.
// F1: a caution / unfavourable sentence must never sit inside a closed "อ่านเพิ่มเติม" fold. The independent review found
// 11 / 2,160 synthetic readings (all Thai) where the composer had trimmed a caution lead's opening words, so the layout's
// whole-lead string match missed it and folded the paragraph.
// The fix is at the source: the composer marks every caution paragraph itself (section.caution[i] === true), and the layout
// (fortune-read.js planSection) never folds a marked paragraph; a section without marks is not folded at all.
// Ground truth here is independent of those marks and of the layout's code:
//   (a) every tail (a suffix after a space / comma, 14+ chars, 6+ for Chinese) of every caution lead the composer can use
//       (straight leads, natal leads, gentle caution leads) — the reviewer's tails.mjs method;
//   (b) fragments of the meanings (all areas except "advice") of every item the discipline marks unfavourable in the facts
//       (tone "caution", polarity "challenge", and in straight mode a label the tradition itself names as bad), in the
//       reading's language (Thai knowledge base, i18n/en-kb-*, i18n/zh-kb-*).
// Corpus: all 15 disciplines × TH / EN / ZH × gentle and straight, only fact sets that contain such an item, >= 2,000 readings.
// The reading wording is not touched (fortune-layout.test.js keeps checking that parts rejoin to the composer's paragraphs).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const RD = require("../../fortune-read.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");
const LANGS = ["th", "en", "zh"];

const flat = x => (Array.isArray(x) ? x.flatMap(flat) : x && typeof x === "object" ? Object.values(x).flatMap(flat) : typeof x === "string" ? [x] : []);
const leadsOf = l => [...new Set(flat(FA.straight.LEADS[l]).concat(flat((FA.straight.NATAL_LEADS || {})[l]), flat(FA._internal.cautionLeads(l))))]
  .map(s => s.replace(/[.。]$/, "")).filter(s => s.length >= 6);
function tailsOf(l) {
  const out = new Set(), min = l === "zh" ? 6 : 14, re = l === "zh" ? /[，,]/g : l === "en" ? /, | /g : / /g;
  for (const lead of leadsOf(l)) {
    if (lead.length >= min) out.add(lead);
    let m; re.lastIndex = 0;
    while ((m = re.exec(lead))) { const t = lead.slice(m.index + m[0].length); if (t.length >= min) out.add(t); }
  }
  return [...out];
}
// fragments of one meaning string, in the reading's language
function fragments(m, l) {
  m = String(m || "").trim();
  if (l === "zh") return m.split(/[，。；！？、]/).map(x => x.trim()).filter(x => x.length >= 8);
  if (l === "en") return m.split(/[,;:.!?]\s+|\s+(?:and|but|so)\s+/).map(x => x.trim()).filter(x => x.length >= 25);
  return m.split(/\s+/).filter(x => x.length >= 15);
}
// English matches end on a word boundary ("rather than rush" is not "rather than rushing to expand"); re-lock 2026-11-15 (1)
function has(text, q, l) {
  if (l !== "en") return text.includes(q);
  for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) if (!/[A-Za-z]/.test(text.charAt(i + q.length))) return true;
  return false;
}
const isCautionItem = (it, straight) => it.tone === "caution" || it.polarity === "challenge" || (straight && FA.straight.LABEL_NEG.test(String(it.label || "")));
function meaningsOf(domain, it, l) {
  const src = l === "en" ? FA.en.item(domain, it) : l === "zh" ? FA.zh.item(domain, it) : it;
  const ms = (src && src.meanings) || {};
  return Object.keys(ms).filter(k => k !== "advice").flatMap(k => [].concat(ms[k] || []));
}

let CORPUS = null;
async function corpus() {
  if (CORPUS) return CORPUS;
  const X = await exportTool();
  const out = [];
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const straight of [false, true]) {
    const r = X.lcg(5151 + X.DOMAINS.indexOf(d) * 11 + (straight ? 3 : 0) + LANGS.indexOf(lang) * 101);
    let got = 0;
    for (let i = 0; i < 400 && got < 24; i++) {
      let f; try { f = X.factsFor(d, i, r); } catch (e) { continue; }
      // engines that never mark a finding unfavourable (face, palm, siam si, feng shui, Western astrology, dream: see
      // docs/FORTUNE-HONEST-READINGS.md) get one real item of the fact set marked as caution, so their caution path is tested too
      if (!(f.items || []).some(it => isCautionItem(it, straight))) {
        const ok = it => it.kind !== "plain" && Object.keys(it.meanings || {}).some(m => m !== "advice");
        let k = (f.items || []).findIndex((it, j) => j > 0 && ok(it)); if (k < 0) k = (f.items || []).findIndex(ok);
        if (k < 0) continue;
        f = Object.assign({}, f, { items: f.items.map((it, j) => (j === k ? Object.assign({}, it, { tone: "caution", polarity: "challenge" }) : it)) });
      }
      const caut = (f.items || []).filter(it => isCautionItem(it, straight));
      if (!caut.length) continue;
      const res = FA.compose(f, { seed: 700 + i, lang, straight });
      if (!res || res.crisis || !(res.sections || []).length) continue;
      got++;
      out.push({ d, lang, straight, res, frags: [...new Set(caut.flatMap(it => meaningsOf(f.domain || d, it, lang)).flatMap(m => fragments(m, lang)))] });
    }
  }
  CORPUS = out;
  return out;
}

test("F1 corpus: >= 2,000 readings with an unfavourable item, every discipline × TH / EN / ZH × gentle / straight", async () => {
  const C = await corpus();
  assert.ok(C.length >= 2000, "readings " + C.length);
  const X = await exportTool();
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const st of [false, true]) {
    const n = C.filter(x => x.d === d && x.lang === lang && x.straight === st).length;
    assert.ok(n >= 10, `${d} ${lang} ${st ? "straight" : "gentle"}: ${n} readings with a caution item`);
  }
});

test("F1: the composer marks caution paragraphs itself (section.caution, one flag per paragraph), for every composed reading", async () => {
  const C = await corpus();
  let marked = 0;
  for (const { d, lang, straight, res } of C) for (const s of res.sections) {
    assert.ok(Array.isArray(s.caution), `${d} ${lang} ${straight ? "S" : "G"} ${s.id}: no caution marks`);
    assert.equal(s.caution.length, s.paragraphs.length, `${d} ${lang} ${s.id}: one mark per paragraph`);
    marked += s.caution.filter(Boolean).length;
  }
  assert.ok(marked >= 1000, "marked caution paragraphs " + marked);
});

test("F1: no caution sentence inside a closed fold (lead tails and unfavourable-item meanings), 0 readings allowed", async () => {
  const C = await corpus();
  const tails = Object.fromEntries(LANGS.map(l => [l, tailsOf(l)]));
  const bad = [];
  let shownHits = 0, readings = 0;
  for (const { d, lang, straight, res, frags } of C) {
    let hit = false;
    for (const s of res.sections) {
      for (const x of RD.planSection(s, lang)) {
        const t = tails[lang].find(q => has(x.text, q, lang)) || frags.find(q => has(x.text, q, lang));
        if (!t) continue;
        if (x.visible) { shownHits++; continue; }
        hit = true;
        if (bad.length < 25) bad.push(`${d} ${lang} ${straight ? "straight" : "gentle"} ${s.id}: …${t.slice(0, 60)}`);
      }
    }
    if (hit) readings++;
  }
  assert.ok(shownHits >= 2000, "caution sentences found (shown) " + shownHits + " — the ground truth is not empty");
  assert.equal(readings, 0, readings + " readings with caution text folded:\n" + bad.join("\n"));
});

test("F1: a section without composer marks (AI text, an older caller) is never folded; marked paragraphs are never folded", () => {
  const paras = ["ภาพรวมช่วงนี้มั่นคง งานเดินหน้าได้ดี ผู้ใหญ่ให้การสนับสนุน และมีโอกาสได้เรียนรู้สิ่งใหม่จากคนรอบตัวอยู่เสมอ",
    "ช่วงนี้มีเรื่องที่ต้องระวังเรื่องเงิน ".repeat(8).trim(), "ข้อแนะนำทั่วไปคือพักผ่อนให้พอ ".repeat(8).trim()];
  for (const l of LANGS) {
    const none = RD.planSection({ id: "overview", paragraphs: paras }, l);
    assert.ok(none.every(x => x.visible), l + ": unmarked section fully shown");
    const marked = RD.planSection({ id: "overview", paragraphs: paras, caution: [false, true, false] }, l);
    assert.ok(marked.filter(x => x.para === 1).every(x => x.visible && x.caution), l + ": marked paragraph shown in full");
    assert.ok(marked.filter(x => x.para === 1).length === 1, l + ": marked paragraph not cut");
    assert.ok(marked.some(x => !x.visible), l + ": unmarked long text may fold");
    assert.equal(marked.filter(x => x.para === 0).map(x => x.text).join(RD.SEP[l]), paras[0]);
  }
  // marks that do not line up with the paragraphs (length differs) count as no marks: nothing folds
  assert.ok(RD.planSection({ id: "x", paragraphs: paras, caution: [true] }, "th").every(x => x.visible));
});

test("F1: the page layout finds a section's marks by id and paragraph text, and falls back to 'show all' on any mismatch", () => {
  const res = { lang: "th", sections: [{ id: "work", paragraphs: ["ก ข", "ค ง"], caution: [false, true] }, { id: "money", paragraphs: ["จ"], caution: [false] }] };
  assert.deepEqual(RD.sectionFlags(res, "work", ["ก ข", "ค ง"]), [false, true]);
  assert.equal(RD.sectionFlags(res, "work", ["ก ข"]), null, "paragraph count differs");
  assert.equal(RD.sectionFlags(res, "work", ["ก ข", "อื่น"]), null, "paragraph text differs");
  assert.equal(RD.sectionFlags(res, "love", ["x"]), null, "no such section");
  assert.equal(RD.sectionFlags({ sections: [{ id: "work", paragraphs: ["a"] }] }, "work", ["a"]), null, "no marks");
});

// ---------------------------------------------------------------------------------------------------------------------
// RE-LOCK 2026-11-15 (2), fortune-paid review finding: feng shui flying-star 2 / 5 text (Five Yellow / Two Black, 五黄 / 二黑,
// "ดาว 5", "ดาว 2") and avoid-warnings ("เลี่ยง…", "avoid…", "避免…") were not marked as caution by the composer, so the
// layout folded them behind "อ่านเพิ่มเติม". Append-only: nothing above changed. Ground truth is a fixed wording detector,
// independent of the composer's marks and of the layout code. The corpus uses the engine's own facts (fengshui.js
// buildFacts) with the page's inputs: kua from a birth year, floor-plan rooms (sectorAdvice on the year chart, as the page's
// collect() does) and compass records, across all 12 months; TH / EN / ZH × gentle / straight, >= 150 readings in all.
const FS_STAR_AVOID = {
  th: /ดาว ?[25](?![0-9])|ห้าเหลือง|สองดำ|เลี่ยง/,
  en: /\bstar ?[25]\b|\bfive yellow\b|\btwo black\b|\bavoid|free of digging/i,
  zh: /五黄|二黑|避免|第 ?[25] ?星/
};
let FS_CORPUS = null;
function fsCorpus() {
  if (FS_CORPUS) return FS_CORPUS;
  const FSE = require("../../fengshui.js"), FKB = require("../../fengshui-kb.js");
  const ROOMS = Object.keys(FKB.rooms), RECS = ["door", "desk", "bed"], TOPICS = ["overall", "work", "money", "love"];
  const out = [];
  for (const lang of LANGS) for (const straight of [false, true]) {
    let s = 9191 + LANGS.indexOf(lang) * 37 + (straight ? 5 : 0);
    const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 30; i++) {
      const now = new Date(2026, i % 12, 1 + Math.floor(r() * 27)), k = FSE.kua(1945 + Math.floor(r() * 65), r() < 0.5 ? "f" : "m");
      const chart = FSE.flyChart(FSE.monthInfo(now.getFullYear(), now.getMonth() + 1, now.getDate()).yearCenter);
      const rooms = [], recorded = {};
      for (let j = Math.floor(r() * 4); j > 0; j--) { const d = FSE.DIRS[Math.floor(r() * 8)], room = ROOMS[Math.floor(r() * ROOMS.length)]; rooms.push({ room, advice: FSE.sectorAdvice(d, chart[d], [room], k.kua) }); }
      for (const rec of RECS) if (r() < 0.4) recorded[rec] = FSE.DIRS[Math.floor(r() * 8)];
      const f = FSE.buildFacts({ kua: Object.assign({ solarYear: 2026 }, k), recorded, rooms, photos: [], topic: TOPICS[i % 4], now });
      const res = FA.compose(f, { seed: 900 + i, lang, straight });
      if (!res || res.crisis || !(res.sections || []).length) continue;
      out.push({ lang, straight, res });
    }
  }
  return (FS_CORPUS = out);
}

test("F1 feng shui: flying-star 2 / 5 and avoid-warnings are never inside a closed fold (>= 150 readings, TH / EN / ZH × gentle / straight)", () => {
  const C = fsCorpus();
  assert.ok(C.length >= 150, "feng shui readings " + C.length);
  for (const l of LANGS) for (const st of [false, true]) {
    const n = C.filter(x => x.lang === l && x.straight === st).length;
    assert.ok(n >= 25, `fengshui ${l} ${st ? "straight" : "gentle"}: ${n} readings`);
  }
  const bad = [];
  let found = 0, readings = 0;
  for (const { lang, straight, res } of C) {
    let hit = false;
    for (const s of res.sections) for (const x of RD.planSection(s, lang)) {
      if (!FS_STAR_AVOID[lang].test(x.text)) continue;
      found++;
      if (x.visible) continue;
      hit = true;
      if (bad.length < 25) bad.push(`${lang} ${straight ? "straight" : "gentle"} ${s.id}: ${x.text.slice(0, 90)}`);
    }
    if (hit) readings++;
  }
  assert.ok(found >= 200, "flying-star 2 / 5 and avoid sentences found " + found + " — the ground truth is not empty");
  assert.equal(readings, 0, readings + " feng shui readings with flying-star 2 / 5 or avoid text folded:\n" + bad.join("\n"));
});

test("F1 feng shui: the layout keeps the composer's wording (parts rejoin byte-equal to each paragraph)", () => {
  for (const { lang, res } of fsCorpus()) for (const s of res.sections) {
    const parts = RD.planSection(s, lang);
    s.paragraphs.forEach((p, i) => assert.equal(parts.filter(x => x.para === i).map(x => x.text).join(RD.SEP[lang]), p, `${lang} ${s.id} paragraph ${i}`));
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// RE-LOCK 2026-11-15 (3), independent review finding (fresh detector): "hold off / slow down" cautions from restraining items
// (tarot Four of Swords / Knight of Wands, siam si slips, I Ching 蹇 / 否, flying star 7 …) were folded because only items
// the engine marks unfavourable were protected. Structural contract, append-only (nothing above changed):
//   - fortune-restrain.js holds data tags, per discipline, for every fact item / meaning area that restrains or warns,
//     tagged by reading (RS.of(domain, item) → "all" | [areas] | null; RS.count(domain) = tagged entries);
//   - docs/FORTUNE-LAYOUT.md has a per-discipline table row "| <domain> | <count> | …" for what was tagged;
//   - the composer records provenance: FA._internal.provenance(result) → [{ section, para, id, area }] for every final
//     paragraph that carries text from a tagged entry; each such paragraph is never inside a closed fold.
// Checks: provenance (recorded by the composer) and an independent trace by this test (fragments of each tagged entry's
// meanings in the reading's language), both 0 folded; the reviewer's five example sentences never folded; parts rejoin
// byte-equal. Corpus: every discipline × TH / EN / ZH × gentle / straight, fact sets that contain a tagged entry.
const loadRS = () => require(path.join(ROOT, "fortune-restrain.js"));
const REVIEW_EXAMPLES = ["ชะลอการตัดสินใจการเงินเรื่องใหญ่ไว้ก่อน", "steer clear of impulsive money decisions", "hold off on big financial commitments", "暂缓新的投资", "keep valuables put away and think twice"];
function taggedMeanings(RS, domain, it, l) {
  const tag = RS.of(domain, it); if (!tag) return [];
  const src = l === "en" ? FA.en.item(domain, it) : l === "zh" ? FA.zh.item(domain, it) : it;
  if (!src) return [];
  const ms = src.meanings || {};
  return tag === "all" ? Object.values(ms).flat() : [].concat(tag).flatMap(a => [].concat(ms[a] || []));
}
let RS_CORPUS = null;
async function rsCorpus() {
  if (RS_CORPUS) return RS_CORPUS;
  const X = await exportTool(), RS = loadRS(), out = [];
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const straight of [false, true]) {
    const r = X.lcg(6262 + X.DOMAINS.indexOf(d) * 13 + (straight ? 7 : 0) + LANGS.indexOf(lang) * 97);
    let got = 0;
    for (let i = 0; i < 400 && got < 12; i++) {
      let f; try { f = X.factsFor(d, i, r); } catch (e) { continue; }
      const tagged = (f.items || []).filter(it => RS.of(f.domain || d, it));
      if (!tagged.length) continue;
      const res = FA.compose(f, { seed: 1300 + i, lang, straight });
      if (!res || res.crisis || !(res.sections || []).length) continue;
      got++;
      const frags = [...new Set(tagged.flatMap(it => taggedMeanings(RS, f.domain || d, it, lang)).flatMap(m => fragments(m, lang)))];
      out.push({ d, lang, straight, res, frags });
    }
  }
  return (RS_CORPUS = out);
}

test("restrain tags: every discipline has tagged entries, and docs/FORTUNE-LAYOUT.md has a matching per-discipline row", async () => {
  const X = await exportTool(), RS = loadRS(), doc = fs.readFileSync(path.join(ROOT, "docs", "FORTUNE-LAYOUT.md"), "utf8");
  for (const d of X.DOMAINS) {
    const n = RS.count(d);
    assert.ok(n > 0, d + ": no tagged entries");
    const row = new RegExp("^\\|\\s*" + d + "\\s*\\|\\s*(\\d+)\\s*\\|", "m").exec(doc);
    assert.ok(row, d + ": no row in docs/FORTUNE-LAYOUT.md");
    assert.equal(Number(row[1]), n, d + ": documented count");
  }
});

test("restrain corpus: >= 8 readings with a tagged entry for every discipline × TH / EN / ZH × gentle / straight", async () => {
  const C = await rsCorpus(), X = await exportTool();
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const st of [false, true]) {
    const n = C.filter(x => x.d === d && x.lang === lang && x.straight === st).length;
    assert.ok(n >= 8, `${d} ${lang} ${st ? "straight" : "gentle"}: ${n} readings with a tagged entry`);
  }
});

test("restrain provenance: every paragraph the composer derives from a tagged entry is outside closed folds (0 allowed)", async () => {
  const C = await rsCorpus(), X = await exportTool(), per = {}, bad = [];
  for (const { d, lang, straight, res } of C) {
    const prov = FA._internal.provenance(res);
    assert.ok(Array.isArray(prov), "provenance is recorded");
    per[d] = (per[d] || 0) + prov.length;
    for (const p of prov) {
      const s = res.sections.find(x => x.id === p.section);
      assert.ok(s && typeof s.paragraphs[p.para] === "string", `${d}: provenance points at a real paragraph`);
      const folded = RD.planSection(s, lang).filter(x => x.para === p.para && !x.visible);
      if (folded.length && bad.length < 25) bad.push(`${d} ${lang} ${straight ? "S" : "G"} ${s.id} (${p.id} ${p.area}): ${folded[0].text.slice(0, 70)}`);
      if (folded.length) bad.total = (bad.total || 0) + 1;
    }
  }
  for (const d of X.DOMAINS) assert.ok((per[d] || 0) >= 10, `${d}: ${per[d] || 0} provenance records`);
  assert.equal(bad.total || 0, 0, (bad.total || 0) + " derived paragraphs folded:\n" + bad.join("\n"));
  assert.ok(!Object.keys(C[0].res).includes("provenance"), "provenance is not part of the reading's data");
});

test("restrain trace (independent of the composer): text of tagged entries, and the reviewer's examples, never folded", async () => {
  const C = await rsCorpus(), bad = [];
  let shown = 0;
  for (const { d, lang, straight, res, frags } of C) for (const s of res.sections) for (const x of RD.planSection(s, lang)) {
    const t = frags.find(q => has(x.text, q, lang)) || REVIEW_EXAMPLES.find(q => x.text.includes(q));
    if (!t) continue;
    if (x.visible) { shown++; continue; }
    if (bad.length < 25) bad.push(`${d} ${lang} ${straight ? "S" : "G"} ${s.id}: …${t.slice(0, 60)}`);
    bad.total = (bad.total || 0) + 1;
  }
  assert.ok(shown >= 1000, "tagged text found (shown) " + shown + " — the ground truth is not empty");
  assert.equal(bad.total || 0, 0, (bad.total || 0) + " parts with tagged text folded:\n" + bad.join("\n"));
});

test("restrain: the layout keeps the composer's wording (parts rejoin byte-equal to each paragraph)", async () => {
  for (const { lang, res } of await rsCorpus()) for (const s of res.sections) {
    const parts = RD.planSection(s, lang);
    s.paragraphs.forEach((p, i) => assert.equal(parts.filter(x => x.para === i).map(x => x.text).join(RD.SEP[lang]), p, `${lang} ${s.id} paragraph ${i}`));
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// RE-LOCK 2026-11-15 (4), independent review of 64b7e57 (fresh detector, synthetic): six gaps, append-only (nothing above
// changed). A/B: summary and headline templates filled with the name of an unfavourable or tagged item (TH contrast
// "แม้{W}จะยังไม่เด่นนัก…", TH / ZH / EN headline "…{X}") were folded, because a short name is under markCaution's fragment
// length. The composer must record provenance at the fill site (area "fill") and the paragraph is never folded. C: numbers
// tips the knowledge base marks as restraining (numbers-kb.js goals[].tips[].avoid) were folded; they must carry provenance
// (area "tip") and never fold. D / E / F: data tags for tarot m00.r and swords11.r love, every numbers sum whose pair is
// tagged (sums reuse the pair's text: sum.70, 72-80 …), and the two borderline cases (Wheel of Fortune advice, I Ching hex.4
// money), each decided in docs/FORTUNE-LAYOUT.md.
const TH_CONTRAST = ["แม้{W}จะยังไม่เด่นนัก แต่{S}ช่วยเรื่อง{TW}ไว้ได้", "{W}เป็นจุดที่ควรค่อย ๆ พัฒนา ส่วน{S}เป็นจุดแข็งที่ใช้ได้ทันที",
  "{W}เป็นเรื่องที่ควรค่อย ๆ ดูแล ขณะที่{S}เป็นแรงหนุนในเรื่อง{TW}"];
const TH_HEAD = ["จุดที่เด่นที่สุดครั้งนี้คือ{X}", "ใจความหลักของผลครั้งนี้คือ{X}", "ผลหลักที่ควรจำไว้คือ{X}"];
const ZH_HEADS = ["这次最突出的是{X}", "这次的重点在{X}"], EN_HEADS = ["What stands out most this time is {X}", "The main focus this time is {X}"];
const tplRe = t => new RegExp(t.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\{W\}/, "(?<W>.+?)").replace(/\{X\}/, "(?<X>[^。.]+)").replace(/\{[A-Z]+\}/g, ".+?"));
const fillTemplates = { th: TH_CONTRAST.concat(TH_HEAD).map(tplRe), zh: ZH_HEADS.map(tplRe), en: EN_HEADS.map(tplRe) };
const noParen = s => String(s || "").replace(/\s*[(（][^)）]*[)）]/g, "").trim();
function namesOf(domain, it, l) {
  const src = l === "en" ? FA.en.item(domain, it) : l === "zh" ? FA.zh.item(domain, it) : it;
  return src ? [src.short, src.label, noParen(src.label)].filter(x => x && String(x).length >= 2).map(String) : [];
}
const RESTRAIN_TIPS = (() => { const K = require("../../numbers-kb.js"); return Object.values(K.goals).flatMap(g => g.tips).filter(t => t && t.avoid && t.avoid.length).map(t => t.t); })();
let FILL_CORPUS = null;
async function fillCorpus() {
  if (FILL_CORPUS) return FILL_CORPUS;
  const X = await exportTool(), RS = loadRS(), out = [];
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const straight of [false, true]) {
    const r = X.lcg(7373 + X.DOMAINS.indexOf(d) * 17 + (straight ? 5 : 0) + LANGS.indexOf(lang) * 89);
    for (let i = 0; i < 20; i++) {
      let f; try { f = X.factsFor(d, i, r); } catch (e) { continue; }
      const res = FA.compose(f, { seed: 2100 + i, lang, straight });
      if (!res || res.crisis || !(res.sections || []).length) continue;
      const flagged = (f.items || []).filter(it => isCautionItem(it, straight) || RS.of(f.domain || d, it));
      out.push({ d, lang, straight, f, res, flagged, names: flagged.map(it => ({ it, n: namesOf(f.domain || d, it, lang), all: isCautionItem(it, straight) || RS.of(f.domain || d, it) === "all" })) });
    }
  }
  return (FILL_CORPUS = out);
}

test("fills (A / B): a summary or headline template filled with an unfavourable or tagged item is never folded and has fill provenance", async () => {
  const C = await fillCorpus(), bad = [];
  let found = 0;
  for (const { d, lang, straight, res, names } of C) {
    const prov = FA._internal.provenance(res);
    for (const s of res.sections) for (const x of RD.planSection(s, lang)) for (const re of fillTemplates[lang]) {
      const m = re.exec(x.text); if (!m) continue;
      const slot = (m.groups.W || m.groups.X || "").trim(), isHead = !m.groups.W;
      // W is the text right before the template words, so it must END with the name; X starts right after them (a list of names)
      const hit = names.find(o => (isHead ? o.all : true) && o.n.some(n => (isHead ? slot.slice(0, 80).includes(n) : slot.endsWith(n))));
      if (!hit) continue;
      found++;
      const ok = x.visible && prov.some(p => p.section === s.id && p.para === x.para && p.area === "fill");
      if (!ok && bad.length < 25) bad.push(`${d} ${lang} ${straight ? "S" : "G"} ${s.id} ${x.visible ? "no fill provenance" : "FOLDED"}: ${x.text.slice(0, 70)}`);
      if (!ok) bad.total = (bad.total || 0) + 1;
    }
  }
  assert.ok(found >= 40, "filled templates naming an unfavourable / tagged item found " + found);
  assert.equal(bad.total || 0, 0, (bad.total || 0) + " filled templates folded or without provenance:\n" + bad.join("\n"));
});

test("tips (C): numbers tips the knowledge base marks as restraining are never folded and have tip provenance", async () => {
  assert.ok(RESTRAIN_TIPS.length >= 2, "restraining tips in numbers-kb.js " + RESTRAIN_TIPS.length);
  const C = (await fillCorpus()).filter(x => x.d === "numbers" && x.lang === "th"), bad = [];
  let found = 0;
  for (const { straight, res } of C) {
    const prov = FA._internal.provenance(res);
    for (const s of res.sections) for (const x of RD.planSection(s, "th")) {
      if (!RESTRAIN_TIPS.some(t => fragments(t, "th").some(q => x.text.includes(q)) || x.text.includes(t))) continue;
      found++;
      const ok = x.visible && prov.some(p => p.section === s.id && p.para === x.para && p.area === "tip");
      if (!ok) { bad.total = (bad.total || 0) + 1; if (bad.length < 25) bad.push(`${straight ? "S" : "G"} ${s.id} ${x.visible ? "no tip provenance" : "FOLDED"}: ${x.text.slice(0, 70)}`); }
    }
  }
  assert.ok(found >= 5, "restraining tips found in numbers TH readings " + found);
  assert.equal(bad.total || 0, 0, (bad.total || 0) + " restraining tips folded or without provenance:\n" + bad.join("\n"));
});

test("data tags (D / E / F): tarot m00.r / swords11.r love, sums that reuse a tagged pair, Wheel advice and I Ching hex.4 money; decisions documented", () => {
  const RS = loadRS(), has = (tag, a) => tag === "all" || (Array.isArray(tag) && tag.includes(a));
  for (const [id, a] of [["card.love.m00.r", "love"], ["card.past.swords11.r", "love"], ["card.today.m10", "advice"], ["card.today.m10.r", "advice"]]) assert.ok(has(RS.of("tarot", { id }), a), `tarot ${id} ${a}`);
  for (const id of ["hex.4", "rel.4"]) assert.ok(has(RS.of("iching", { id }), "money"), "iching " + id + " money");
  for (let n = 10; n <= 99; n++) {
    const p = RS.of("numbers", { id: "pair." + String(n).padStart(2, "0") });
    if (p) assert.ok(RS.of("numbers", { id: "sum." + n }), `numbers sum.${n} (pair.${n} is tagged)`);
  }
  for (const n of [70, 72, 73, 74, 75, 76, 77, 78, 79, 80]) if (RS.of("numbers", { id: "pair." + n })) assert.ok(RS.of("numbers", { id: "sum." + n }), "sum." + n);
  const doc = fs.readFileSync(path.join(ROOT, "docs", "FORTUNE-LAYOUT.md"), "utf8");
  for (const k of ["m10", "hex.4", "m00.r", "swords11.r", "sum."]) assert.ok(doc.includes(k), "docs record the decision for " + k);
});

// ---------------------------------------------------------------------------------------------------------------------
// RE-LOCK 2026-11-15 (5), re-review of 80da630 (Thai only): the Thai composer rewrites a tagged item's meaning before it reaches
// the page (modal "ควร" dropped, "{LEV}เป็นสัญญาณให้{M}" and the other imperative / advice / action frames), so whole-token
// matching missed it and the sentence folded (numbers pair.48 / pair.38 / sum.38 money, BaZi luck.peer advice …). Append-only.
// Contract: every Thai sentence the composer builds from a tagged item's meaning carries provenance { id, area } recorded at
// the rewrite step (not by matching the rewritten words) and its paragraph is never folded. Corpus: every discipline, TH,
// gentle and straight, fact sets until each tagged key the engines produce has been composed (<= 300 per discipline / mode).
// Independent check: the tail of each tagged meaning (rewrites change the start of a sentence, not its end) in any part means
// that part must be visible and its paragraph must carry provenance with that item's id.
const tailOf = m => { const c = String(m || "").trim().replace(/[.。\s]+$/, ""); return c.length >= 20 ? c.slice(-20) : c.length >= 12 ? c : null; };
const REVIEW_REWRITES = [["numbers", "pair.48", "money"], ["numbers", "pair.38", "money"], ["numbers", "sum.38", "money"], ["bazi", "luck.peer", "advice"]];
let TH_TAG_CORPUS = null;
const AMBIGUOUS = { n: 0 };
async function thTagCorpus() {
  if (TH_TAG_CORPUS) return TH_TAG_CORPUS;
  const X = await exportTool(), RS = loadRS(), out = [], seen = {};
  for (const d of X.DOMAINS) for (const straight of [false, true]) {
    const r = X.lcg(8484 + X.DOMAINS.indexOf(d) * 19 + (straight ? 3 : 0)), want = new Set(), got = new Set();
    for (let i = 0; i < 300; i++) {
      let f; try { f = X.factsFor(d, i, r); } catch (e) { continue; }
      const tagged = (f.items || []).filter(it => RS.of(f.domain || d, it));
      tagged.forEach(it => want.add(String(it.id).replace(/^card\.[a-z]+\./, "")));
      if (!tagged.some(it => !got.has(String(it.id).replace(/^card\.[a-z]+\./, ""))) && i >= 40) continue;
      const res = FA.compose(f, { seed: 3100 + i, lang: "th", straight });
      if (!res || res.crisis || !(res.sections || []).length) continue;
      tagged.forEach(it => got.add(String(it.id).replace(/^card\.[a-z]+\./, "")));
      const raw = tagged.flatMap(it => { const tag = RS.of(f.domain || d, it), ms = it.meanings || {};
        return (tag === "all" ? Object.keys(ms) : tag).flatMap(a => [].concat(ms[a] || []).map(m => ({ id: it.id, area: a, tail: tailOf(m) }))).filter(x => x.tail); });
      // re-lock 6 (ground truth only): a tail is attributed to the tagged items whose tagged meanings carry it (any of them may
      // hold the provenance), and is not attributed at all when untagged text of the same fact set carries it too (template tails
      // such as "…ต้องใช้ความใส่ใจมากกว่าปกติ" or tarot's "…จะค่อย ๆ ชัดเจนขึ้นจนคุณสัมผัสได้" are shared by many entries)
      const untagged = (f.items || []).flatMap(it => { const tag = RS.of(f.domain || d, it), ms = it.meanings || {};
        return Object.keys(ms).filter(a => !tag || (tag !== "all" && !tag.includes(a))).flatMap(a => [].concat(ms[a] || []).map(String)); });
      const tails = [];
      for (const x of raw) {
        if (untagged.some(u => u.includes(x.tail))) { AMBIGUOUS.n++; continue; }
        const ids = new Set(raw.filter(y => y.tail === x.tail || y.tail.endsWith(x.tail)).map(y => y.id));
        tails.push(Object.assign({}, x, { ids }));
      }
      out.push({ d, straight, f, res, tails });
    }
    seen[d + (straight ? "S" : "G")] = { want: want.size, got: got.size };
  }
  return (TH_TAG_CORPUS = { out, seen });
}

test("TH rewrites: every tagged key the engines produce is composed in Thai, gentle and straight (coverage)", async () => {
  const { seen } = await thTagCorpus();
  for (const [k, v] of Object.entries(seen)) assert.equal(v.got, v.want, `${k}: ${v.got} of ${v.want} tagged keys composed`);
});

test("TH rewrites: every sentence derived from a tagged meaning is outside closed folds and carries provenance with its item id", async () => {
  const { out } = await thTagCorpus(), bad = [], per = {};
  let found = 0;
  for (const { d, straight, res, tails } of out) {
    const prov = FA._internal.provenance(res);
    for (const s of res.sections) for (const x of RD.planSection(s, "th")) for (const t of tails) {
      if (!x.text.includes(t.tail)) continue;
      found++; per[d] = (per[d] || 0) + 1;
      const ok = x.visible && prov.some(p => p.section === s.id && p.para === x.para && t.ids.has(p.id));
      if (!ok) { bad.total = (bad.total || 0) + 1; if (bad.length < 25) bad.push(`${d} ${straight ? "S" : "G"} ${s.id} ${t.id} ${t.area} ${x.visible ? "no provenance" : "FOLDED"}: …${x.text.slice(-70)}`); }
    }
  }
  assert.ok(found >= 2000, "derived sentences found " + found);
  assert.equal(bad.total || 0, 0, (bad.total || 0) + " derived Thai sentences folded or without provenance:\n" + bad.join("\n"));
});

test("TH rewrites: the reviewer's rewritten examples (pair.48, pair.38, sum.38 money; BaZi luck.peer advice) and the rewrite frames", async () => {
  const { out } = await thTagCorpus(), bad = [];
  const hits = Object.fromEntries(REVIEW_REWRITES.map(([d, id, a]) => [d + " " + id + " " + a, 0]));
  let framed = 0;
  for (const { d, straight, res, tails } of out) {
    const prov = FA._internal.provenance(res);
    for (const s of res.sections) for (const x of RD.planSection(s, "th")) for (const t of tails) {
      if (!x.text.includes(t.tail)) continue;
      const k = d + " " + t.id + " " + t.area;
      if (k in hits) hits[k]++;
      // a rewrite path: the derived sentence is framed ("…เป็นสัญญาณให้", "…ชวนให้", "…แนะให้", "ลอง…", "ตามคำแนะนำของ…")
      if (/เป็นสัญญาณให้|ชวนให้|แนะให้|ตามคำแนะนำของ|(?:^|\s)ลอง/.test(x.text)) {
        framed++;
        if (!x.visible || !prov.some(p => p.section === s.id && p.para === x.para && t.ids.has(p.id))) bad.push(`${k} ${straight ? "S" : "G"}: ${x.text.slice(0, 80)}`);
      }
    }
  }
  for (const [k, n] of Object.entries(hits)) assert.ok(n >= 1, k + ": composed " + n + " times");
  assert.ok(framed >= 200, "framed (rewritten) derived sentences found " + framed);
  assert.equal(bad.length, 0, bad.length + " framed derived sentences folded or without provenance:\n" + bad.slice(0, 25).join("\n"));
});
