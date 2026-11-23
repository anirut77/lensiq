"use strict";
// tests/unit/fortune-dream-type-summary.test.js — FIXED TEST, fortune-90 rule A (owner voice: advice + caution +
// encouragement, never a verdict; mindfulness, not superstition). Written and locked (evals-locks/fortune-90.sha256, field
// copy ~/LENSIQ-field/evals/fortune-90/rule-a/) BEFORE the fix, after the independent review of 2026-11-23 found that the
// summary dropped the dream-type line (จิตนิวรณ์ "…ไม่ใช่ลางบอกเหตุ…", ธาตุกำเริบ) once whole lines over 140 characters were
// skipped, so a reflective dream kept its "omen" lines in the summary and lost its "not an omen" line.
//
// Definition (fixed before the fix):
//   corpus     240 synthetic dream inputs (lcg seed 20261123: 1–4 symbols of dream-kb.js, any mood or none, any time or
//              none, topic overall/love/work/money in turn) × TH/EN/ZH × gentle/straight. No image of a person.
//   condition  the reading's overview section carries the plain dream-type line: TH "เข้าลักษณะ<type>"; EN / ZH the type's
//              own overview clause from i18n/en-kb-dream.js / i18n/zh-kb-dream.js (case-insensitive).
//   assertion  then the FIRST summary bullet (the overview bullet) carries that dream type: it names it (TH) and holds one
//              of the type's whole meanings from the KB (TH: dream-kb.js TYPES[k].d or TYPES[k].o after "ตามตำราไทย";
//              EN / ZH: the type's o clause), and for a type the tradition does not treat as an omen (omen: false) it says
//              so (TH ไม่ใช่ลาง / ไม่ถือเป็นลาง / มากกว่าลาง; EN "rather than a sign" / "not treat it as a sign"; ZH 非征兆 /
//              不把它当作征兆). TH bullets stay within the existing 140-character limit.
//   coverage   the condition holds at least 3 times for EVERY dream type in dream-kb.js in EVERY language, so the test
//              cannot be passed by dropping the type line from the overview (or from a language) instead.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const repo = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(repo, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(repo, "i18n", f));
const FA = require(path.join(repo, "fortune-ai.js"));
const DR = require(path.join(repo, "dream.js"));
const KB = require(path.join(repo, "dream-kb.js"));

const lcg = s => () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
const TOPICS = ["overall", "love", "work", "money"];
const NOT_OMEN = { th: /ไม่ใช่ลาง|ไม่ถือเป็นลาง|มากกว่าลาง/, en: /rather than a sign|not treat it as a sign/i, zh: /非征兆|不把它当作征兆/ };

function corpus() {
  const r = lcg(20261123), syms = KB.SYMBOLS.map(s => s.id), moods = ["", ...Object.keys(KB.MOODS)], times = ["", ...Object.keys(KB.TIMES)];
  const out = [];
  for (let i = 0; i < 240; i++) {
    const n = 1 + Math.floor(r() * 4), ids = [];
    while (ids.length < n) { const s = syms[Math.floor(r() * syms.length)]; if (ids.indexOf(s) < 0) ids.push(s); }
    const mood = moods[Math.floor(r() * moods.length)], time = times[Math.floor(r() * times.length)];
    out.push({ i, facts: DR.buildFacts(ids, mood, time, TOPICS[i % 4], { rng: lcg(i + 11) }) });
  }
  return out;
}

test("rule A: when the overview has the dream-type line, the summary's overview bullet carries it (every type × TH/EN/ZH)", { timeout: 600000 }, () => {
  const KBL = { en: FA.en.data().dream.items, zh: FA.zh.data().dream.items };
  const seen = {}, bad = [];
  for (const k of Object.keys(KB.TYPES)) seen[k] = { th: 0, en: 0, zh: 0 };
  for (const { i, facts } of corpus()) {
    const tyIt = facts.items.find(it => it.id === "type");
    const k = [].concat(tyIt.zk)[0].replace(/^type\./, ""), ty = KB.TYPES[k];
    for (const lang of ["th", "en", "zh"]) for (const straight of [false, true]) {
      const res = FA.compose(facts, { seed: i * 7919 + 1, lang, straight });
      const ov = ((res.sections || []).find(s => s.id === "overview") || { paragraphs: [] }).paragraphs.join(" ");
      const o = lang === "th" ? "" : String(KBL[lang]["type." + k].o);
      const has = lang === "th" ? ov.indexOf("เข้าลักษณะ" + ty.th) >= 0 : ov.toLowerCase().indexOf(o.toLowerCase()) >= 0;
      if (!has) continue;
      seen[k][lang]++;
      const first = res.summary && res.summary.lines && res.summary.lines[0];
      const t = first ? String(first.t) : "";
      const whole = lang === "th"
        ? t.indexOf(ty.th) >= 0 && (t.indexOf(ty.d) >= 0 || t.indexOf(ty.o.replace(/^ตามตำราไทย\s*/, "")) >= 0)
        : t.toLowerCase().indexOf(o.toLowerCase()) >= 0;
      const notOmen = ty.omen !== false || NOT_OMEN[lang].test(t);
      const fits = lang !== "th" || t.length <= 140;
      if (!whole || !notOmen || !fits) bad.push(`#${i} ${k} ${lang}/${straight ? "straight" : "gentle"} ${facts.topic}: ${JSON.stringify(t)}`);
    }
  }
  const thin = Object.entries(seen).flatMap(([k, c]) => Object.entries(c).filter(([, n]) => n < 3).map(([l, n]) => `${k}/${l}: ${n}`));
  assert.deepEqual(thin, [], "dream type line in the overview too rarely to test (need ≥ 3 per type × language): " + JSON.stringify(seen));
  assert.equal(bad.length, 0, bad.length + " readings lose the dream-type line in the summary, e.g.\n" + bad.slice(0, 12).join("\n"));
});
