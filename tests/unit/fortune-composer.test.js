"use strict";
// node --test tests/unit — fortune-ai.js composer quality:
//  * safety filter: Thai word segmentation (Intl.Segmenter) + allowlist fallback — no legit KB string blocked, banned terms still blocked
//  * a lint pass over ~2,000 composed readings from every domain (doubled words, belief frame + imperative, connector budget,
//    thin/empty sections, off-topic advice under money, unfilled slots)
//  * main reading length 1,500–2,500 chars with the rest behind "อ่านเพิ่มเติม", opener variety, tarot past-position tense
const test = require("node:test");
const assert = require("node:assert/strict");
global.PALM_KB = require("../../palm-kb.js");
global.FR_KB = require("../../faceread-kb.js");
const FA = require("../../fortune-ai.js");
const FR = require("../../faceread.js"), PC = require("../../palm.js"), HS = require("../../horoscope.js");
const TR = require("../../tarot.js"), TKB = require("../../tarot-kb.js"), FS = require("../../fengshui.js");
const IC = require("../../iching.js"), ZD = require("../../zodiac.js"), AS = require("../../astro.js"), DR = require("../../dream.js");

const TOPICS = ["overall", "love", "work", "money"];
const lcg = s => () => ((s = (s * 9301 + 49297) % 233280) / 233280);

/* ---------- corpus: fact sets from every domain the composer serves ---------- */
function corpus() {
  const out = [];
  const add = (d, f) => out.push({ d, facts: f() });
  const base = FR.synthFace({ x: 100, y: 100, w: 300, h: 380 });
  for (let i = 0; i < 12; i++) add("face", () => {
    const dx = (i % 4 - 1.5) * 5, dy = (i % 3) * 6;
    const p = base.map(([x, y], k) => [x + (k >= 36 && k < 48 ? (k < 42 ? -dx : dx) : 0) + (k <= 16 ? (k < 8 ? -i : i) : 0), y + (k >= 48 ? dy : 0) + (k >= 17 && k < 27 ? -i : 0)]);
    return FR.buildFacts(FR.analyze(p, null, 25 + i * 3), { topic: TOPICS[i % 4], age: 25 + i * 3 });
  });
  const LINES = Object.fromEntries(PC.LINE_IDS.map(id => [id, { cp: PC.TEMPLATES[id].pts, present: true }]));
  for (let i = 0; i < 12; i++) add("palm", () => {
    const side = i % 2 ? "left" : "right";
    const hand = PC.handFromLandmarks(PC.synthHand({ x: 400, y: 200, w: 340 + i * 12, h: 460 + (i % 3) * 30 }, side));
    return PC.buildFacts(PC.analyze({ hand, lines: LINES, side, isDominant: i % 3 !== 0 }), { topic: TOPICS[i % 4], side, isDominant: i % 3 !== 0 });
  });
  for (let i = 0; i < 12; i++) add("horoscope", () => HS.buildFacts(HS.analyze({ y: 1970 + i * 3, m: 1 + (i * 5) % 12, d: 1 + (i * 7) % 27, time: i % 3 ? { h: (i * 5) % 24, mi: 30 } : null }), { topic: TOPICS[i % 4], rng: lcg(i + 1) }));
  for (let i = 0; i < 16; i++) add("tarot", () => {
    const c = TKB.cards, sp = ["three", "three", "celtic", "love5", "threeAdvice", "one"][i % 6], n = TKB.spreads[sp].positions.length;
    const picks = [], used = new Set(); let k = i * 17 + 3;
    while (picks.length < n) { const id = c[(k = (k * 31 + 7) % 78)].id; if (!used.has(id)) { used.add(id); picks.push({ id, rev: k % 3 === 0 }); } }
    return TR.buildFacts(picks, ["general", "love", "work", "money"][i % 4], sp, { rng: lcg(i + 1) });
  });
  for (let i = 0; i < 8; i++) add("siamsee", () => TR.siamseeFacts(TKB.siamsee[(i * 5) % TKB.siamsee.length], { topic: TOPICS[i % 4] }));
  for (let i = 0; i < 8; i++) add("fengshui", () => FS.buildFacts({ kua: FS.kua(1960 + i * 6, i % 2 ? "f" : "m"), recorded: {}, rooms: [], photos: [], topic: TOPICS[i % 4], now: new Date(2026, 10, 6) }));
  for (let i = 0; i < 12; i++) add("iching", () => IC.buildFacts(IC.cast(Array.from({ length: 6 }, (_, k) => [6, 7, 8, 9][(i * 3 + k * 5 + (k * i) % 3) % 4])), TOPICS[i % 4], { rng: lcg(i + 2) }));
  for (let i = 0; i < 12; i++) add("zodiac", () => ZD.buildFacts(ZD.annual(i, 2026, 1960 + i * 4 + (i % 2) * 12), TOPICS[i % 4], {}));
  for (let i = 0; i < 8; i++) add("astro", () => AS.buildFacts(AS.chart({ y: 1975 + i * 4, m: 1 + i, d: 3 + i * 3, time: i % 2 ? { h: 7 + i, mi: 10 } : null, tz: 7, lat: 13.75, lon: 100.5 }), TOPICS[i % 4]));
  const syms = Object.keys(DR.BY);
  for (let i = 0; i < 16; i++) add("dream", () => DR.buildFacts([syms[(i * 7) % syms.length], syms[(i * 13 + 3) % syms.length], syms[(i * 5 + 1) % syms.length]].slice(0, 1 + i % 3), ["happy", "anxious", "neutral", "sad"][i % 4], ["dawn", "early", "late", ""][i % 4], TOPICS[i % 4], {}));
  add("dream", () => DR.buildFacts(["snake", "teeth", "flood"], "anxious", "dawn", "money", {}));
  return out;
}
const CORPUS = corpus();
const SEEDS = Array.from({ length: 18 }, (_, i) => i * 7919 + 1);
const mainText = r => r.sections.filter(s => !s.collapsed).map(s => s.paragraphs.slice(0, typeof s.main === "number" ? s.main : s.paragraphs.length).join(" ")).join(" ");
const fullText = r => r.sections.map(s => s.paragraphs.join(" ")).join(" ");
let READINGS = null;
function readings() {
  if (!READINGS) { READINGS = []; for (const { d, facts } of CORPUS) for (const seed of SEEDS) READINGS.push({ d, seed, r: FA.compose(facts, { seed }) }); }
  return READINGS;
}

/* ---------------- safety filter ---------------- */
function kbStrings(name) {
  const kb = require("../../" + name + "-kb.js"), seen = new Set(), out = [];
  (function walk(o) { if (typeof o === "string") { out.push(o); return; } if (!o || typeof o !== "object" || seen.has(o)) return; seen.add(o); for (const v of Object.values(o)) walk(v); })(kb);
  return out;
}
const KBS = ["faceread", "palm", "tarot", "horoscope", "fengshui", "numbers", "iching", "zodiac", "astro", "dream"];
// สิ่งที่ตั้งใจให้ถูกกรอง: ข้อความปฏิเสธความรับผิด (ไม่เคยเข้าคำทำนาย) ชื่อไพ่ Death ดิบ (หน้าเว็บใช้ "การเปลี่ยนผ่าน") และชื่อตำแหน่ง "มรณะ"
const INTENDED_BLOCK = t => /ไม่ทำนาย|ไม่ใช้เพื่อการพนัน|ไม่มีเลขนำโชค|ไม่ให้เลข/.test(t) || /^(ความตาย|Death|มรณะ)$/.test(t);
const LEGIT = ["ทิศพลังเติบโต", "ทิศพายัพ (ตะวันตกเฉียงเหนือ)", "ราศีกรกฎ (Cancer)", "Cancer", "Moon in Cancer", "ดวงตายาวเรียว", "หางตายกขึ้น", "ประเทศพม่า", "เพศพึงใจ", "ทิศพิฆาตที่ควรเลี่ยง", "ความตายตัวของแผน"];
const BANNED = ["งานศพ", "ฝันเห็นศพ", "ศพ", "เสียชีวิต", "ป่วยหนัก", "เป็นโรคร้าย", "อุบัติเหตุรถชน", "หย่าร้าง", "ถูกหวย", "เลขเด็ดงวดนี้", "cancer risk", "Cancer patients need treatment", "you will die", "เคราะห์ร้ายมาเยือน", "ตายโหง", "ความตาย", "จะตายแล้ว", "ฆ่า"];

for (const mode of ["segmenter", "fallback"]) {
  test(`safety (${mode}): no legit KB string is blocked; banned samples still blocked`, () => {
    FA.safety._useSegmenter(mode === "segmenter");
    try {
      if (mode === "segmenter") assert.ok(FA.safety.segmenter(), "Node ships Intl.Segmenter with Thai");
      let total = 0;
      for (const k of KBS) {
        const all = kbStrings(k); total += all.length;
        const bad = all.filter(t => !FA.safety.isSafe(t) && !INTENDED_BLOCK(t));
        assert.deepEqual(bad.slice(0, 5), [], k);
      }
      assert.ok(total > 10000, "scanned " + total + " KB strings");
      for (const t of LEGIT) assert.ok(FA.safety.isSafe(t), "legit: " + t);
      for (const t of BANNED) assert.ok(!FA.safety.isSafe(t), "banned: " + t);
      assert.match(FA.safety.filterText("หันโต๊ะไปทางทิศพายัพ แล้วจัดมุมนี้ให้โปร่ง"), /ทิศพายัพ/);
      assert.equal(FA.safety.filterText("วันนี้อากาศดี ฝันเห็นศพ ตื่นมาสดชื่น"), "วันนี้อากาศดี ตื่นมาสดชื่น");
    } finally { FA.safety._useSegmenter(true); }
  });
}
test("safety: fengshui directions such as ทิศพายัพ / ทิศพลัง… reach the reading", () => {
  let hits = 0;
  for (let i = 0; i < 8; i++) {
    const f = FS.buildFacts({ kua: FS.kua(1960 + i * 6, i % 2 ? "f" : "m"), recorded: {}, rooms: [], photos: [], topic: "overall", now: new Date(2026, 10, 6) });
    for (const it of f.items) for (const k in it.meanings) for (const m of it.meanings[k]) assert.ok(FA.safety.isSafe(m), m);
    for (let s = 1; s <= 4; s++) if (/ทิศพ/.test(fullText(FA.compose(f, { seed: s })))) hits++;
  }
  assert.ok(hits > 0, "some reading mentions a ทิศพ… direction");
});

/* ---------------- lint over thousands of readings ---------------- */
test("lint: ~2,000 composed readings have no template-join glitches", () => {
  const R = readings();
  assert.ok(R.length >= 2000, String(R.length));
  const problems = {};
  for (const { d, seed, r } of R) {
    assert.ok(FA.safety.isSafe(fullText(r)));
    for (const p of FA.lint(r)) {
      // ข้อความในคลังเลขมงคล (numbers-kb.js) ไม่อยู่ในชุดนี้ — ชุดนี้ไม่ได้รวมศาสตร์ตัวเลข
      (problems[p.rule] = problems[p.rule] || []).push(`${d}#${seed} [${p.section}] ${p.excerpt}`);
    }
  }
  const summary = Object.fromEntries(Object.entries(problems).map(([k, v]) => [k, v.length + ": " + v.slice(0, 3).join(" | ")]));
  assert.deepEqual(summary, {});
});
test("lint: detects the glitches it is meant to catch", () => {
  const sec = t => ({ sections: [{ id: "money", title: "x", paragraphs: [t] }] });
  const rules = t => FA.lint(sec(t)).map(p => p.rule);
  assert.ok(rules("ถ้าอยากเติมพลังบวก ลองลองฟังให้จบก่อนตอบสักวันละครั้ง คุณจะพบว่าคนรอบตัวเปิดใจมากขึ้น").includes("doubled-word"));
  assert.ok(rules("เมื่อดูที่สิบสองวัง ซึ่งเป็นวังทรัพย์ เชื่อกันว่าเปิดบัญชีออมแยกไว้หนึ่งบัญชีและตั้งโอนอัตโนมัติทุกวันเงินเข้า").includes("belief+imperative"));
  assert.ok(rules("ไพ่ใบนี้ในทางตำรามักตีความว่าปรับแผนให้ยืดหยุ่นและพร้อมรับโอกาสใหม่เสมอในช่วงนี้นะ").includes("belief+imperative"));
  assert.ok(rules("สั้นไป").includes("thin-section"));
  assert.ok(rules("เรื่องเงินในช่วงนี้มีสัญญาณที่ดี เปิดใจและแสดงความรู้สึกดี ๆ ต่อคนรักของคุณให้มากขึ้นอีกนิด").includes("off-topic"));
  const many = { sections: [{ id: "love", title: "x", paragraphs: ["ก ยังบอกอีกว่าดี ข ยังบอกอีกว่าดี ค ยังบอกอีกว่าดี นอกจากนี้ ง ดีมากขึ้นเรื่อย ๆ ไปอีกนานแสนนาน"] }] };
  assert.ok(FA.lint(many).some(p => p.rule === "connector-overuse"));
});
test("composer: no template phrase or connector used more than twice per reading", () => {
  for (const { d, seed, r } of readings()) {
    const counts = {};
    for (const m of fullText(r).matchAll(new RegExp("(^|\\s)(" + FA._internal.banks.CONNECTORS.join("|") + ")\\s", "g"))) counts[m[2]] = (counts[m[2]] || 0) + 1;
    for (const p of FA._internal.phrasesIn(fullText(r))) if (/^(ยังบอกอีกว่า|ยังช่วยเสริมด้วยว่า)$/.test(p)) counts[p] = (counts[p] || 0) + 1;
    for (const p in counts) assert.ok(counts[p] <= FA.PHRASE_BUDGET, `${d}#${seed}: ${p} ×${counts[p]}`);
  }
});

/* ---------------- structure & length ---------------- */
test("composer: every section has substantive content (no intro-only sections)", () => {
  for (const { d, seed, r } of readings()) for (const s of r.sections) {
    const t = s.paragraphs.join(" ");
    assert.ok(t.length >= 90, `${d}#${seed} [${s.title}] ${t}`);
  }
  const rep = FA.compose(DR.buildFacts(["snake", "teeth", "flood"], "anxious", "dawn", "money", {}), { seed: 1 });
  const intros = Object.values(FA._internal.banks.INTROS).flat();
  for (const s of rep.sections) {
    let t = s.paragraphs.join(" ");
    for (const x of intros) t = t.replace(x.replace(/\{[A-Z]\}/g, "คุณ"), "");
    assert.ok(t.trim().length >= 60, "[" + s.title + "] " + s.paragraphs.join(" "));
  }
});
test("composer: main reading is 1,500–2,500 chars; the rest sits behind อ่านเพิ่มเติม", () => {
  const R = readings();
  let inRange = 0, eligible = 0;
  for (const { d, seed, r } of R) {
    const main = mainText(r).length, full = fullText(r).length;
    assert.ok(main <= 2800, `${d}#${seed} main ${main}`);
    if (full >= 1500) { eligible++; assert.ok(main >= 1500, `${d}#${seed} main ${main} of ${full}`); if (main <= 2500) inRange++; }
    else assert.equal(main, full, "short readings are shown in full");
  }
  assert.ok(inRange / eligible >= 0.97, `${inRange}/${eligible} within 1,500–2,500`);
  // the whole reading (including อ่านเพิ่มเติม) is capped at ~3,000 chars — no 7k-char faceread/palm walls
  for (const { d, seed, r } of R) assert.ok(fullText(r).length <= FA.MAIN_LENGTH.full, `${d}#${seed} full ${fullText(r).length}`);
  const face = R.find(x => x.d === "face").r;
  assert.ok(fullText(face).length > 2200 && mainText(face).length <= 2500);
  assert.ok(R.filter(x => x.d === "face" || x.d === "palm").some(x => x.r.sections.some(s => s.collapsed || typeof s.main === "number")));
});
test("render: folded paragraphs and sections are inside <details> อ่านเพิ่มเติม, nothing lost", () => {
  const r = readings().find(x => x.d === "palm").r;
  const html = FA.toHTML(r);
  assert.match(html, /<details class="fa-more[^"]*"><summary[^>]*>อ่านเพิ่มเติม/);
  const plain = html.replace(/<[^>]+>/g, " ");
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  for (const s of r.sections) for (const p of s.paragraphs) assert.ok(plain.includes(esc(p)) || html.includes(esc(p)), p.slice(0, 40));
  assert.equal((html.match(/class="fa-section"/g) || []).length, r.sections.length);
  // compose without the split shows everything (for callers that render their own way)
  const flat = FA.compose(CORPUS[0].facts, { seed: 3, split: false });
  assert.ok(flat.sections.every(s => !s.collapsed && s.main == null));
});

/* ---------------- variety & grammar specifics ---------------- */
test("composer: openers vary across domains for the same seed and are domain-specific", () => {
  const firsts = CORPUS.map(({ facts }) => FA.compose(facts, { seed: 1 }).sections[0].paragraphs[0].slice(0, 30));
  const top = Math.max(...Object.values(firsts.reduce((a, x) => ((a[x] = (a[x] || 0) + 1), a), {})));
  assert.ok(top / firsts.length < 0.1, "most common opener share " + top + "/" + firsts.length);
  const detail = readings().filter(x => x.r.sections[0].paragraphs[0].startsWith("เมื่อดูองค์ประกอบทั้งหมดอย่างละเอียด")).length;
  assert.ok(detail / readings().length < 0.02, "old dominant opener " + detail);
  for (const d of Object.keys(FA._internal.banks.OPENERS_BY_DOMAIN)) assert.ok(FA._internal.banks.OPENERS_BY_DOMAIN[d].length >= 6, d);
});
test("composer: imperatives are classified and never follow belief frames", () => {
  const I = FA._internal.isImperative;
  for (const t of ["ลองฟังให้จบ", "ควรพักผ่อน", "คุณควรออม", "เปิดบัญชีออมแยกไว้", "ปรับแผนการเงิน", "นับรายจ่าย", "อย่าเพิ่งลงทุน", "หาเวลาพักผ่อน"]) assert.ok(I(t), t);
  for (const t of ["คุณเป็นคนใจกว้าง", "รอบนี้การเงินดี", "เดินหน้าได้ดี", "ส่งผลดีต่องาน", "ทำให้คนรอบตัวอุ่นใจ", "แต่งงานแล้วมีความสุข", "เปิดทางให้โอกาสใหม่"]) assert.ok(!I(t), t);
});
test("tarot: past-position cards carry no future tense; timing uses past templates", () => {
  for (let i = 0; i < 78; i++) for (const rev of [false, true]) {
    const picks = [{ id: TKB.cards[i].id, rev }, { id: TKB.cards[(i + 1) % 78].id, rev: false }, { id: TKB.cards[(i + 2) % 78].id, rev: false }];
    const f = TR.buildFacts(picks, ["general", "love", "work", "money"][i % 4], "three", { rng: lcg(i + 1) });
    const past = f.items.find(x => /^card\.past\./.test(x.id));
    assert.ok(past.tags.length >= 2, past.id);
    for (const k in past.meanings) { assert.ok(past.meanings[k].length, past.id + "." + k); for (const m of past.meanings[k]) assert.ok(!/จะ|ในอนาคต/.test(m), past.id + ": " + m); }
  }
});
test("composer: money section never carries love-only advice; topic action line is on-topic", () => {
  for (const { d, seed, r } of readings()) {
    const money = r.sections.find(s => s.id === "money");
    if (!money) continue;
    for (const p of money.paragraphs) {
      const m = /เพื่อเรื่องการเงิน แนะนำให้(.+?)(?:\s|$)|ในเรื่องการเงิน(?:ที่ทำได้เลย)?คือ(.+?)(?:\s|$)|สำหรับเรื่องการเงินช่วงนี้คือ(.+?)(?:\s|$)/.exec(p);
      if (m) assert.ok(!/คนรัก|คู่รัก|แฟน|ความรู้สึกดี/.test(m[1] || m[2] || m[3]), `${d}#${seed}: ${p}`);
    }
  }
});
test("composer: no lucky numbers in readings or AI-bound facts", () => {
  const f = HS.buildFacts(HS.analyze({ y: 1990, m: 5, d: 15, time: { h: 8, mi: 30 } }), { topic: "money", rng: lcg(3) });
  assert.ok(!f.extras.luckyNumbers);
  const withNums = Object.assign({}, f, { extras: Object.assign({}, f.extras, { luckyNumbers: ["7", "9"] }) });
  assert.ok(!("luckyNumbers" in (FA._internal.factsForAI(withNums).extras || {})));
  for (let s = 1; s <= 5; s++) assert.ok(!/เลขนำโชค|เลขมงคลที่เข้ากับ/.test(fullText(FA.compose(withNums, { seed: s }))));
});
