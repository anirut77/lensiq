"use strict";
// tests/unit/fortune-gist.test.js — FIXED TEST SET, owner decision 90 ข (2026-11-17): fix the summary-line shortening bug
// (gist() in fortune-ai.js, the "สรุปสั้น / Summary / 简要总结" bullets) on the live site as a small separate change.
// Written and locked (sha256 in evals-locks/gist-fix.sha256 and ~/LENSIQ-field/evals/gist-fix/locked.sha256) BEFORE the fix.
//
// Input set: every fortune engine (the 15 reading domains of tools/fortune-review-export.mjs) × 40 seeded engine-built fact
// sets × TH / EN / ZH × gentle / straight (compose opts.straight). Every summary bullet must satisfy:
//   R1 word      a shortened line never ends inside a word: the cut sits at a space / punctuation of the source, or at an
//                Intl.Segmenter word boundary that is not directly before a bound tail ("ที่" as in เต็มที่ / แผนที่, "ๆ")
//   R2 ๆ         never cut before "ๆ" (ๆ stays with its word); no line starts with "ๆ"
//   R3 brackets  no unclosed / stray “ ” " ( ) [ ] （ ） 「 」 in the line
//   R4 label+no. never cut between a label and its number ("เลขกัว 4", "คู่ 69", "ใบที่ 21", "Kua 4", "Slip 21", "第21签"),
//                and never end on a bare number whose unit / word follows in the source ("ภายใน 3" | "วัน")
//   R5 fits      if the whole source line is short (≤ 100 characters with what follows), it is not cut at all
// The source of a bullet is found by matching the bullet's tail (≥ 8 characters) in the engine facts' own strings (meanings,
// tips) first, then in the composed sentences (compose opts.trace). A bullet whose tail is found nowhere gets the static checks
// (R2 start, R3, label at the very end) only, and the unmatched share is reported.
// Run with GIST_REPORT=1 to print the violation counts per engine × language × mode (baseline / after numbers).
const test = require("node:test");
const assert = require("node:assert/strict");

const N = 40, MODES = ["gentle", "straight"], LANGS = ["th", "en", "zh"], FITS = 100;
const SEG = {};
const seg = lang => {
  if (SEG[lang] !== undefined) return SEG[lang];
  const loc = lang === "zh" ? "zh" : lang === "en" ? "en" : "th";
  try { SEG[lang] = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(loc, { granularity: "word" }) : null; } catch (e) { SEG[lang] = null; }
  return SEG[lang];
};
const PUNCT = /[\s.,;:!?…。，；：！？、()（）[\]「」“”"'‘’—–\-/]/u;
const PAIRS = [["(", ")"], ["[", "]"], ["（", "）"], ["「", "」"], ["“", "”"]];
// a label that needs its number right after it (TH / EN / ZH), checked at the very end of a line
const BARE_LABEL = /(?:เลขกัว|เลขที่|ใบที่|ไพ่ใบที่|คู่ที่|ข้อที่|ตำแหน่งที่|ลำดับที่|\bKua|\bSlip(?: No\.)?|\bNo\.|\bnumber|\bcard|第)\s*$/i;

function balanced(t) {
  for (const [o, c] of PAIRS) {
    let d = 0;
    for (const ch of t) { if (ch === o) d++; else if (ch === c) { d--; if (d < 0) return false; } }
    if (d !== 0) return false;
  }
  return ((t.match(/"/g) || []).length % 2) === 0;
}
function boundaries(s, lang) {
  const S = seg(lang); if (!S) return null;
  const b = new Set([0, s.length]);
  for (const g of S.segment(s)) b.add(g.index);
  return b;
}
function strings(x, out, depth) {
  if (depth > 6 || x == null) return out;
  if (typeof x === "string") { if (x.length >= 8) out.push(x.trim().replace(/[.。\s]+$/u, "")); return out; }
  if (Array.isArray(x)) { for (const y of x) strings(y, out, depth + 1); return out; }
  if (typeof x === "object") for (const k of Object.keys(x)) strings(x[k], out, depth + 1);
  return out;
}

/** violations of one bullet: [rule, detail] */
function check(t, lang, corpus) {
  const v = [];
  t = String(t || "");
  if (/^\s*ๆ/.test(t)) v.push(["R2", "starts with ๆ"]);
  if (!balanced(t)) v.push(["R3", "unbalanced bracket / quote"]);
  if (BARE_LABEL.test(t)) v.push(["R4", "ends on a bare label"]);
  // source occurrences of the bullet's tail
  const body = t.replace(/[.。\s]+$/u, "");
  let occ = [];
  for (const pool of [corpus.facts, corpus.sentences]) {
    for (let L = Math.min(body.length, 40); L >= 8 && !occ.length; L--) {
      const tail = body.slice(-L);
      for (const s of pool) for (let i = s.indexOf(tail); i >= 0; i = s.indexOf(tail, i + 1)) occ.push({ s, e: i + L, start: i + L - body.length, pool });
    }
    if (occ.length) break;
  }
  if (!occ.length) return { v, matched: false };
  // a violation of a source rule counts only when EVERY occurrence of the tail shows it (no false positives from repeats)
  const per = occ.map(({ s, e, start, pool }) => {
    const w = [], rest = s.slice(e), restT = rest.replace(/^[\s.。]+/u, "");
    if (!restT) return w; // nothing cut
    if (/^\s*ๆ/.test(rest)) w.push(["R2", "cut before ๆ: …" + body.slice(-14) + " | " + rest.slice(0, 10)]);
    const atSpace = PUNCT.test(s[e] || " ") || PUNCT.test(s[e - 1] || " ");
    if (!atSpace) {
      const b = boundaries(s, lang);
      if ((b && !b.has(e)) || (!b && lang !== "zh") || /^(?:ที่|ๆ|ฯ|ๅ)/.test(rest)) w.push(["R1", "mid-word: …" + body.slice(-14) + " | " + rest.slice(0, 10)]);
    }
    if (/^\s?(?:[\d๐-๙])/.test(rest) && /[^\d๐-๙\s]$/.test(body)) w.push(["R4", "label | number: …" + body.slice(-14) + " | " + rest.slice(0, 8)]);
    const UNIT = /^\s?(?:ปี|เดือน|วัน|สัปดาห์|ครั้ง|เท่า|%|องศา|คน|ชั่วโมง|นาที|หลัก|ตัว|ใบ|ข้อ|years?\b|months?\b|days?\b|weeks?\b|times\b|岁|年|月|日|天|次|号|签|张)/u;
    if (/[\d๐-๙]$/.test(body) && UNIT.test(rest)) w.push(["R4", "number | unit: …" + body.slice(-14) + " | " + rest.slice(0, 8)]);
    if (pool === corpus.facts && start >= 0 && s.length - Math.max(0, start) <= FITS && lang === "th") w.push(["R5", "cut though the line fits: " + s.length + " chars"]);
    return w;
  });
  for (const rule of ["R1", "R2", "R4", "R5"]) {
    if (per.every(w => w.some(x => x[0] === rule))) v.push(per[0].find(x => x[0] === rule));
  }
  return { v, matched: true };
}

let RUN = null;
async function runAll() {
  if (RUN) return RUN;
  const X = await import("../../tools/fortune-review-export.mjs");
  const FA = require("../../fortune-ai.js");
  const out = { rows: [], lines: 0, unmatched: 0, noSummary: 0, readings: 0 };
  for (const d of X.DOMAINS) {
    const r = X.lcg(9000 + d.length * 131 + d.charCodeAt(0));
    for (let i = 0; i < N; i++) {
      const facts = X.factsFor(d, i, r);
      const fstr = strings(facts, [], 0);
      for (const lang of LANGS) for (const mode of MODES) {
        const res = FA.compose(facts, { seed: 31 + i, lang, straight: mode === "straight", trace: true });
        out.readings++;
        const sm = res && res.summary;
        if (!sm || !Array.isArray(sm.lines)) { out.noSummary++; continue; }
        const corpus = { facts: fstr, sentences: (res._sentences || []).concat((res.sections || []).flatMap(s => s.paragraphs || [])).map(String) };
        for (const l of sm.lines) {
          out.lines++;
          const c = check(l.t, lang, corpus);
          if (!c.matched) out.unmatched++;
          out.rows.push({ d, i, lang, mode, k: l.k, t: l.t, v: c.v });
        }
      }
    }
  }
  if (process.env.GIST_REPORT) {
    const cnt = {};
    for (const row of out.rows) if (row.v.length) {
      const key = row.d + "\t" + row.lang + "\t" + row.mode; cnt[key] = cnt[key] || { lines: 0, R1: 0, R2: 0, R3: 0, R4: 0, R5: 0 };
      cnt[key].lines++; for (const [rule] of row.v) cnt[key][rule]++;
    }
    console.log("readings", out.readings, "summary lines", out.lines, "unmatched", out.unmatched, "no summary", out.noSummary);
    for (const d of X.DOMAINS) for (const lang of LANGS) for (const mode of MODES) {
      const c = cnt[d + "\t" + lang + "\t" + mode];
      console.log([d, lang, mode, c ? c.lines : 0, c ? "R1 " + c.R1 + " R2 " + c.R2 + " R3 " + c.R3 + " R4 " + c.R4 + " R5 " + c.R5 : ""].join("\t"));
    }
    if (process.env.GIST_REPORT === "2") for (const row of out.rows) if (row.v.length) console.log(row.d, row.i, row.lang, row.mode, JSON.stringify(row.t), JSON.stringify(row.v));
  }
  RUN = out;
  return out;
}

test("every summary bullet: no mid-word cut, ๆ kept, brackets / quotes closed, label kept with its number, no cut when it fits" +
  " (15 engines × 40 × TH/EN/ZH × gentle/straight)", { timeout: 600000 }, async () => {
  const R = await runAll();
  assert.ok(R.lines >= 15 * N * 3 * 2, "too few summary lines: " + R.lines);
  // the matcher must be able to place almost every bullet in its source, otherwise R1 / R2 / R4 / R5 test nothing
  assert.ok(R.unmatched <= R.lines * 0.05, "unmatched bullets " + R.unmatched + " of " + R.lines);
  const bad = R.rows.filter(row => row.v.length);
  const show = b => b.d + "#" + b.i + " " + b.lang + "/" + b.mode + " " + JSON.stringify(b.t) + " " + JSON.stringify(b.v);
  assert.equal(bad.length, 0, bad.length + " bullets break a rule, e.g.\n" + bad.slice(0, 12).map(show).join("\n"));
});

// targeted cases from the reviewer's evidence (RECHECK-86c, 2026-11-16): fengshui "…เลขกัว", lek7 "…เที่ยวใกล้" before ๆ,
// tarot / Siam Si "…แผน" (แผนที่) and "…เต็ม" (เต็มที่), "ก้าวเล็ก" before ๆ
test("targeted: no TH bullet ends on 'เลขกัว', before ๆ ('เที่ยวใกล้', 'ก้าวเล็ก'), or on 'แผน' / 'เต็ม' cut from แผนที่ / เต็มที่", { timeout: 600000 }, async () => {
  const R = await runAll();
  const th = R.rows.filter(r => r.lang === "th");
  const fs = th.filter(r => r.d === "fengshui"), lk = th.filter(r => r.d === "lek7"), tr = th.filter(r => r.d === "tarot" || r.d === "siamsee");
  assert.ok(fs.length && lk.length && tr.length, "engines produced TH summaries");
  const endKua = fs.filter(r => /เลขกัว\s*$/.test(r.t));
  assert.equal(endKua.length, 0, "fengshui bullets ending on เลขกัว: " + endKua.slice(0, 3).map(r => r.t).join(" / "));
  const yamok = th.filter(r => r.v.some(x => x[0] === "R2"));
  assert.equal(yamok.filter(r => r.d === "lek7").length, 0, "lek7 bullets cut before ๆ: " + yamok.filter(r => r.d === "lek7").slice(0, 3).map(r => r.t).join(" / "));
  assert.equal(yamok.length, 0, "TH bullets cut before ๆ: " + yamok.slice(0, 3).map(r => r.d + ": " + r.t).join(" / "));
  const mid = tr.filter(r => r.v.some(x => x[0] === "R1"));
  assert.equal(mid.length, 0, "tarot / Siam Si mid-word cuts: " + mid.slice(0, 3).map(r => r.t).join(" / "));
  for (const r of th) {
    assert.doesNotMatch(r.t, /(?:เป็นเพียงแผน|หนุนเต็ม|ผ่อนเต็ม)\s*$/, r.d + "#" + r.i + " " + r.t);
    assert.doesNotMatch(r.t, /(?:เที่ยวใกล้|ก้าวเล็ก)\s*$/, r.d + "#" + r.i + " " + r.t);
  }
});

// the checker itself (so a broken matcher cannot pass everything): known-bad and known-good lines
test("checker self-test: the rules catch the reviewer's examples and pass clean lines", () => {
  const C = (t, src, lang) => check(t, lang || "th", { facts: [src], sentences: [] }).v.map(x => x[0]);
  const long = " " + "ก".repeat(0) + "และควรวางแผนการเงินระยะยาวให้รอบคอบมากขึ้นในช่วงครึ่งปีหลังเพื่อความมั่นคงของครอบครัวและตัวคุณเอง";
  assert.ok(C("ช่วงนี้ไปเที่ยวใกล้", "ช่วงนี้ไปเที่ยวใกล้ ๆ บ้านก็พอ" + long).includes("R2"));
  assert.ok(C("คุณเป็นคนกลุ่มตะวันตก เลขกัว", "คุณเป็นคนกลุ่มตะวันตก เลขกัว 4 ทิศดีของคุณคือ" + long).includes("R4"));
  assert.ok(C("ให้ไพ่เป็นเพียงแผน", "ให้ไพ่เป็นเพียงแผนที่ ส่วนการเดินทางเป็นของคุณ" + long).includes("R1"));
  assert.ok(C("ได้แรงหนุนเต็ม", "ได้แรงหนุนเต็มที่ จากผู้ใหญ่" + long).includes("R1"));
  assert.ok(C("ควรเลี่ยงทิศ (เทียนอี", "ควรเลี่ยงทิศ (เทียนอี) ในช่วงนี้" + long).includes("R3"));
  assert.ok(C("Your Kua", "Your Kua 4 favours the east" + long, "en").includes("R4"));
  assert.ok(C("ช่วงนี้ไปเที่ยวใกล้ ๆ", "ช่วงนี้ไปเที่ยวใกล้ ๆ บ้านก็พอ").includes("R5"));
  assert.deepEqual(C("ช่วงนี้ไปเที่ยวใกล้ ๆ บ้านก็พอ", "ช่วงนี้ไปเที่ยวใกล้ ๆ บ้านก็พอ"), []);
  assert.deepEqual(C("คุณเป็นคนกลุ่มตะวันตก เลขกัว 4", "คุณเป็นคนกลุ่มตะวันตก เลขกัว 4 ทิศดีของคุณคือ" + long), []);
});
