"use strict";
// tests/unit/fortune-paid-guidance.test.js — FIXED TEST SET, review of fortune-paid at ed6a0a6 (NOT OK), findings F1 and F2.
// Locked (evals-locks/fortune-paid.sha256, append-only re-lock (2)) BEFORE the fix. Adds to tests/unit/fortune-paid.test.js
// (unchanged). Switch on in these tests only.
//   F1  belief remedies and guidance (lucky colour, direction, worship / merit, element tips, lucky items, the composer's remedy
//       texts, every item's belief-remedy advice) are free information in EVERY group, with or without a caution: 0 in paid parts.
//       Every part that the reading layout gives an advice box (data-lq-remedy: fortune-read adviceKinds) is free too.
//   F2  feng-shui flying stars 2 and 5 (Two Black, Five Yellow) and their remedy, and every "avoid / don't" style warning
//       (อย่า / เลี่ยง / ไม่ควร · avoid / don't · 避免 / 不要 / 疲惫), are cautions: 0 in paid parts. Not warnings, so not counted:
//       the encouragements อย่าลืม (don't forget), อย่าลังเล (don't hesitate), ไม่ควรมองข้าม (worth noticing), 'อย่าง' and 别人 / 特别.
// Detectors are independent of fortune-paid.js: word lists (the reviewer's lists in scratchpad/rev/remedy2.mjs and fs.mjs,
// widened) and item n-grams (character windows TH 16 / ZH 8, English 5-word windows) of every item's belief-remedy advice and of
// every feng-shui meaning that names star 2 or 5.
// Corpus: all 15 disciplines × TH / EN / ZH × gentle and straight, 25 readings per cell (>= 2,000; feng shui 150), seeds
// different from the reviewer's and from fortune-paid.test.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
for (const f of fs.readdirSync(path.join(ROOT, "i18n")).filter(f => /^(?:zh|en)-kb-.+\.js$/.test(f))) require(path.join(ROOT, "i18n", f));
const FA = require("../../fortune-ai.js");
const RD = require("../../fortune-read.js");
const P = require("../../fortune-paid.js");
const exportTool = () => import("../../tools/fortune-review-export.mjs");
const LANGS = ["th", "en", "zh"];

const BELIEF = {
  th: new RegExp("(?:เลือก|ใส่|ใช้|สวม|เติม)สี|สีมงคล|สีที่เข้ากับ|เคล็ดเสริมดวง|เคล็ด|วิธีเสริมจุดนี้ตามตำรา|หันหน้าไปทาง|หันไปทาง|ปรับมุมไปทาง|" +
    "จัด\\S*ไว้ทาง|ทิศมงคล|ทิศที่ส่งเสริม|เสริมพลังธาตุ|เสริมธาตุ|ทำบุญ|ไหว้|บูชา|สวดมนต์|ใส่บาตร|พกติดตัว|ของมงคล|เครื่องราง|ถวาย"),
  en: new RegExp("\\b(?:wear(?:ing)?|choose|add|use) (?:a touch of |some |more )?(?:red|orange|blue|black|green|white|yellow|gold|pink|purple|navy|cream|grey|gray|brown|" +
    "light blue|sky blue)\\b|lucky colou?rs?|\\bfacing (?:north|south|east|west)|\\bface (?:north|south|east|west)|\\bmake merit\\b|\\bpray\\w*\\b|\\bofferings?\\b|" +
    "boost (?:the )?\\w+ element|\\blucky (?:item|charm|direction)s?\\b|\\bamulet", "i"),
  zh: /(?:穿|选|用|佩戴|添).{0,3}(?:红|橙|蓝|黑|绿|白|黄|金|粉|紫|灰|棕)色|幸运色|吉祥色|朝(?:东|西|南|北)|吉位|供奉|拜神|拜佛|祈福|行善|布施|补充(?:能量|[金木水火土])|护身符|吉祥物/,
};
// when the reading layout draws an advice box (data-lq-remedy) after a part: fortune-read.js ADVICE_FRAME + adviceKinds (copied)
const FRAME = { th: /ควร|ลอง|วิธีปรับ|สิ่งที่ทำได้|ข้อแนะนำ|เคล็ด|เลือก|ใส่|ใช้กับ|สีที่เข้ากับ|สีมงคล|ทิศที่ส่งเสริม|ไหว้|บูชา|ทำบุญ/,
  en: /\b(?:try|wear|choose|should|tip|remedy|suit|face|pay|make merit|pray)\b/i, zh: /建议|可以|不妨|穿|选择|宜|适合|朝|拜|供奉|孝/ };
const FLY = { th: /ดาว ?[25]\b|ดาว ?[25] |ห้าเหลือง|เหลืองห้า|ดำสอง|ดาว 5 เหลือง|ดาว 2 ดำ|ทุบเจาะ/, en: /\bStar [25]\b|\b(?:Five|5) Yellow|\b(?:Two|2) Black|digging/i, zh: /二黑|五黄|动土/ };
const AVOID = { th: /อย่า(?!ง|ลืม|ลังเล)|เลี่ยง|ไม่ควร(?!มองข้าม)/, en: /\bavoid\w*|\bdon't\b|\bdo not\b/i, zh: /避免|不要|(?<![特区告分识派离辨])别(?![人的处具致墅])|勿|忌|疲惫/ };

function shingles(t, l) {
  t = String(t || "");
  const out = new Set();
  if (l === "en") { const w = t.toLowerCase().replace(/[^a-z' ]+/g, " ").split(/\s+/).filter(Boolean); for (let i = 0; i + 5 <= w.length; i++) out.add(w.slice(i, i + 5).join(" ")); }
  else { const n = l === "zh" ? 8 : 16; const s = t.replace(/\s+/g, ""); for (let i = 0; i + n <= s.length; i += 2) out.add(s.slice(i, i + n)); }
  return out;
}
const norm = (t, l) => (l === "en" ? " " + String(t).toLowerCase().replace(/[^a-z' ]+/g, " ").split(/\s+/).filter(Boolean).join(" ") + " " : String(t).replace(/\s+/g, ""));
const hit = (t, sh, l) => { const T = norm(t, l); for (const s of sh) if (T.includes(l === "en" ? " " + s + " " : s)) return s; return null; };
const itemOf = (dom, it, l) => { try { return (l === "en" ? FA.en.item(dom, it) : l === "zh" ? FA.zh.item(dom, it) : it) || it; } catch (e) { return it; } };

let CORPUS = null;
async function corpus() {
  if (CORPUS) return CORPUS;
  const X = await exportTool();
  const out = [];
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const straight of [false, true]) {
    const r = X.lcg(60601 + X.DOMAINS.indexOf(d) * 37 + (straight ? 11 : 0) + LANGS.indexOf(lang) * 503);
    let got = 0;
    for (let i = 0; i < 300 && got < 25; i++) {
      let f; try { f = X.factsFor(d, i + 3000, r); } catch (e) { continue; }
      const res = FA.compose(f, { seed: 31000 + i * 7, lang, straight });
      if (!res || res.crisis || !(res.sections || []).length) continue;
      got++;
      const dom = f.domain || d, adv = new Set(), fly = new Set();
      for (const it of f.items || []) {
        const ms = (itemOf(dom, it, lang) || {}).meanings || {};
        for (const k of Object.keys(ms)) for (const m of [].concat(ms[k] || [])) {
          // n-grams of belief remedies only (an advice meaning that names a colour, direction, rite, element or lucky item);
          // practical tips ("set a budget") may stay paid in groups without a caution (owner decides; coordinator 2026-11-15)
          if (k === "advice" && BELIEF[lang].test(String(m))) for (const s of shingles(m, lang)) adv.add(s);
          if (dom === "fengshui" && FLY[lang].test(String(m))) for (const s of shingles(m, lang)) fly.add(s);
        }
      }
      out.push({ d, lang, straight, res, adv, fly });
    }
  }
  CORPUS = out;
  return out;
}
const on = fn => { const old = globalThis.LENSIQ_FORTUNE_PAID; globalThis.LENSIQ_FORTUNE_PAID = true; try { return fn(); } finally { globalThis.LENSIQ_FORTUNE_PAID = old; } };

test("F1/F2 corpus: >= 2,000 readings, every discipline × TH / EN / ZH × gentle / straight; feng shui >= 150; paid depth still exists", async () => {
  const C = await corpus();
  assert.ok(C.length >= 2000, "readings " + C.length);
  assert.ok(C.filter(x => x.d === "fengshui").length >= 150, "feng shui readings");
  const X = await exportTool();
  for (const d of X.DOMAINS) for (const lang of LANGS) for (const st of [false, true]) assert.ok(C.filter(x => x.d === d && x.lang === lang && x.straight === st).length >= 10, `${d} ${lang} ${st}`);
  const withPaid = C.filter(x => on(() => P.split(x.res, { lang: x.lang, straight: x.straight })).groups.some(g => g.paid.length)).length;
  assert.ok(withPaid >= C.length * 0.4, `readings with paid depth ${withPaid}/${C.length}`);
  assert.ok(C.some(x => x.fly.size), "flying-star meanings found (the ground truth is not empty)");
});

test("F1: 0 belief remedies or guidance in paid parts (word lists + belief-remedy n-grams + advice boxes), every group", async () => {
  const C = await corpus();
  const bad = []; let checked = 0, readings = 0;
  for (const x of C) {
    const sp = on(() => P.split(x.res, { lang: x.lang, straight: x.straight }));
    let any = false;
    for (const g of sp.groups) for (const t of g.paid) {
      checked++;
      const box = RD.adviceKinds(t, x.lang).length && FRAME[x.lang].test(t) ? "advice box: " + RD.adviceKinds(t, x.lang).join("/") : "";
      const w = (t.match(BELIEF[x.lang]) || [])[0] || hit(t, x.adv, x.lang) || box;
      if (w) { any = true; if (bad.length < 30) bad.push(`${x.d} ${x.lang} ${x.straight ? "S" : "G"} ${g.id} [${w}] ${t.slice(0, 110)}`); }
    }
    if (any) readings++;
  }
  assert.ok(checked >= 1000, "paid parts checked " + checked);
  assert.equal(readings, 0, readings + " readings with belief guidance in paid text:\n" + bad.join("\n"));
});

test("F2: 0 flying-star 2 / 5 text and 0 'avoid / don't' warnings in paid parts (word lists + feng-shui star n-grams)", async () => {
  const C = await corpus();
  const bad = []; let readings = 0;
  for (const x of C) {
    const sp = on(() => P.split(x.res, { lang: x.lang, straight: x.straight }));
    let any = false;
    for (const g of sp.groups) for (const t of g.paid) {
      const w = (t.match(FLY[x.lang]) || [])[0] || (t.match(AVOID[x.lang]) || [])[0] || hit(t, x.fly, x.lang);
      if (w) { any = true; if (bad.length < 30) bad.push(`${x.d} ${x.lang} ${x.straight ? "S" : "G"} ${g.id} [${w}] ${t.slice(0, 110)}`); }
    }
    if (any) readings++;
  }
  assert.equal(readings, 0, readings + " readings with a flying-star / avoid warning in paid text:\n" + bad.join("\n"));
});

test("F1/F2: the composer marks guidance at the source (section.guidance, one flag per paragraph) for every composed reading", async () => {
  const C = await corpus();
  let marked = 0;
  for (const x of C) for (const s of x.res.sections) {
    assert.ok(Array.isArray(s.guidance), `${x.d} ${x.lang} ${s.id}: no guidance marks`);
    assert.equal(s.guidance.length, s.paragraphs.length, `${x.d} ${x.lang} ${s.id}: one mark per paragraph`);
    marked += s.guidance.filter(Boolean).length;
    // the existing caution marks are untouched by the new marks
    assert.ok(Array.isArray(s.caution) && s.caution.length === s.paragraphs.length, "caution marks kept");
  }
  assert.ok(marked >= 1000, "guidance paragraphs marked " + marked);
  // a paragraph the composer marks as guidance is never paid
  for (const x of C.slice(0, 600)) {
    const sp = on(() => P.split(x.res, { lang: x.lang, straight: x.straight }));
    x.res.sections.forEach((s, k) => {
      const parts = RD.planSection(s, x.lang);
      for (const p of parts) if (s.guidance[p.para]) assert.ok(!sp.groups[k].paid.includes(p.text), `${x.d} ${x.lang} ${s.id}: marked guidance paid`);
    });
  }
});

test("F1/F2: with the switch off nothing changes: the layout ignores the new marks (same parts, same folds)", async () => {
  const C = await corpus();
  for (const x of C.slice(0, 300)) for (const s of x.res.sections) {
    const without = Object.assign({}, s); delete without.guidance;
    assert.deepEqual(RD.planSection(s, x.lang), RD.planSection(without, x.lang), `${x.d} ${x.lang} ${s.id}: layout changed by guidance marks`);
  }
  for (const x of C.slice(0, 100)) assert.equal(P.apply(x.res, { lang: x.lang }), x.res, "off: same object");
});
