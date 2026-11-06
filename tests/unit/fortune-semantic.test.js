"use strict";
// node --test tests/unit — cross-domain semantic-consistency lint (FortuneAI.lintSemantic) over ≥5,000 composed readings.
// Every one of the 11 fortune domains feeds varied, engine-generated fact sets into the local composer; each reading must have
// ZERO violations of: omen-vs-reflect (non-omen dreams make no omen claims), claim-support ("A and B both point to X" only when
// both facts really speak to X; topic sentences come from facts that have meanings for that topic), number-evidence (no number
// that isn't in the measured/computed facts), trait-conflict, advice-repeat, tense-position (past-position tarot cards),
// section-fit (no "บุคลิกและตัวตน" in dream readings), formulaic frames, and the 3-line summary card.
// Plus the specific evaluator repro cases and the length/repetition targets.
const test = require("node:test");
const assert = require("node:assert/strict");
global.PALM_KB = require("../../palm-kb.js");
global.FR_KB = require("../../faceread-kb.js");
const FA = require("../../fortune-ai.js");
const FR = require("../../faceread.js"), PC = require("../../palm.js"), HS = require("../../horoscope.js");
const TR = require("../../tarot.js"), TKB = require("../../tarot-kb.js"), FS = require("../../fengshui.js"), NM = require("../../numbers.js");
const IC = require("../../iching.js"), ZD = require("../../zodiac.js"), AS = require("../../astro.js"), DR = require("../../dream.js"), DKB = require("../../dream-kb.js");

const TOPICS = ["overall", "love", "work", "money"];
const lcg = s => () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
const PER_DOMAIN = 42, SEEDS = 11; // 11 domains × 42 fact sets × 11 seeds = 5,082 readings

function corpus() {
  const out = [], r = lcg(2026);
  const add = (d, f) => out.push({ d, facts: f() });
  const base = FR.synthFace({ x: 100, y: 100, w: 300, h: 380 });
  for (let i = 0; i < PER_DOMAIN; i++) add("face", () => {
    // random but plausible perturbations of eyes, mouth, jaw, brows
    const a = (r() - 0.5) * 14, b = (r() - 0.5) * 16, c = (r() - 0.5) * 18, e = (r() - 0.5) * 10;
    const p = base.map(([x, y], k) => [x + (k >= 36 && k < 48 ? (k < 42 ? -a : a) : 0) + (k <= 16 ? (k < 8 ? -c : c) * (Math.abs(k - 8) / 8) : 0) + (k >= 48 ? (k % 2 ? e : -e) : 0),
      y + (k >= 48 ? b : 0) + (k >= 17 && k < 27 ? -Math.abs(a) : 0)]);
    return FR.buildFacts(FR.analyze(p, null, 20 + Math.floor(r() * 50)), { topic: TOPICS[i % 4], age: 20 + Math.floor(r() * 50) });
  });
  const LINES = Object.fromEntries(PC.LINE_IDS.map(id => [id, { cp: PC.TEMPLATES[id].pts, present: true }]));
  for (let i = 0; i < PER_DOMAIN; i++) add("palm", () => {
    const side = i % 2 ? "left" : "right", dom = r() < 0.7;
    const lines = Object.fromEntries(PC.LINE_IDS.map(id => [id, { cp: PC.TEMPLATES[id].pts, present: r() < 0.85 || /life|head|heart/.test(id) }]));
    const hand = PC.handFromLandmarks(PC.synthHand({ x: 400, y: 200, w: 300 + r() * 140, h: 420 + r() * 140 }, side));
    return PC.buildFacts(PC.analyze({ hand, lines: i % 3 ? lines : LINES, side, isDominant: dom }), { topic: TOPICS[i % 4], side, isDominant: dom });
  });
  for (let i = 0; i < PER_DOMAIN; i++) add("horoscope", () => {
    const P = HS.analyze({ y: 1950 + Math.floor(r() * 60), m: 1 + Math.floor(r() * 12), d: 1 + Math.floor(r() * 28), time: r() < 0.6 ? { h: Math.floor(r() * 24), mi: Math.floor(r() * 60) } : null });
    return HS.buildFacts(P, { topic: TOPICS[i % 4], rng: lcg(i + 7) });
  });
  const spreads = Object.keys(TKB.spreads);
  for (let i = 0; i < PER_DOMAIN; i++) add("tarot", () => {
    const sp = spreads[i % spreads.length], n = TKB.spreads[sp].positions.length, picks = [], used = new Set();
    while (picks.length < n) { const c = TKB.cards[Math.floor(r() * 78)]; if (!used.has(c.id)) { used.add(c.id); picks.push({ id: c.id, rev: r() < 0.35 }); } }
    return TR.buildFacts(picks, ["general", "love", "work", "money"][i % 4], sp, { rng: lcg(i + 3) });
  });
  for (let i = 0; i < PER_DOMAIN; i++) add("siamsee", () => TR.siamseeFacts(TKB.siamsee[i % TKB.siamsee.length], { topic: TOPICS[(i * 3) % 4] }));
  for (let i = 0; i < PER_DOMAIN; i++) add("fengshui", () => {
    const k = FS.kua(1945 + Math.floor(r() * 65), r() < 0.5 ? "f" : "m");
    return FS.buildFacts({ kua: Object.assign({ solarYear: 2026 }, k), recorded: {}, rooms: [], photos: [], topic: TOPICS[i % 4], now: new Date(2026, Math.floor(r() * 12), 1 + Math.floor(r() * 27)) });
  });
  for (let i = 0; i < PER_DOMAIN; i++) add("numbers", () => {
    const ph = "0" + ["8", "9", "6"][i % 3] + String(Math.floor(r() * 1e8)).padStart(8, "0");
    return NM.buildFacts(NM.analyzePhone(ph), TOPICS[i % 4], {});
  });
  for (let i = 0; i < PER_DOMAIN; i++) add("iching", () => IC.buildFacts(IC.cast(Array.from({ length: 6 }, () => [6, 7, 8, 9][Math.floor(r() * 4)])), TOPICS[i % 4], { rng: lcg(i + 11) }));
  for (let i = 0; i < PER_DOMAIN; i++) add("zodiac", () => ZD.buildFacts(ZD.annual(i % 12, 2026, 1940 + Math.floor(r() * 70)), TOPICS[i % 4], {}));
  for (let i = 0; i < PER_DOMAIN; i++) add("astro", () => AS.buildFacts(AS.chart({ y: 1950 + Math.floor(r() * 60), m: 1 + Math.floor(r() * 12), d: 1 + Math.floor(r() * 28), time: r() < 0.6 ? { h: Math.floor(r() * 24), mi: 10 } : null, tz: 7, lat: 13.75, lon: 100.5 }), TOPICS[i % 4]));
  const syms = DKB.SYMBOLS.map(s => s.id), moods = ["", ...Object.keys(DKB.MOODS)], times = ["", ...Object.keys(DKB.TIMES)];
  for (let i = 0; i < PER_DOMAIN - 1; i++) add("dream", () => {
    const n = 1 + Math.floor(r() * 4), ids = [];
    while (ids.length < n) { const s = syms[Math.floor(r() * syms.length)]; if (ids.indexOf(s) < 0) ids.push(s); }
    return DR.buildFacts(ids, moods[Math.floor(r() * moods.length)], times[Math.floor(r() * times.length)], TOPICS[i % 4], { rng: lcg(i + 5) });
  });
  add("dream", () => DR.buildFacts(["snake", "teeth", "flood"], "anxious", "dawn", "money", { rng: lcg(1) }));
  return out;
}

const CORPUS = corpus();
let READ = null;
function readings() {
  if (READ) return READ;
  READ = [];
  for (const { d, facts } of CORPUS) for (let k = 0; k < SEEDS; k++) { const seed = k * 104729 + 1; READ.push({ d, seed, facts, r: FA.compose(facts, { seed, trace: true }) }); }
  return READ;
}
const fullText = r => r.sections.map(s => s.paragraphs.join(" ")).join(" ");

test("semantic lint: ≥5,000 readings across all 11 domains have zero violations", () => {
  const R = readings();
  assert.ok(R.length >= 5000, "readings " + R.length);
  assert.equal(new Set(R.map(x => x.facts.domain)).size, 11);
  const byRule = {};
  for (const { d, seed, facts, r } of R) for (const v of FA.lintSemantic(facts, r)) (byRule[v.rule] = byRule[v.rule] || []).push(`${d}#${seed} [${v.section}] ${v.excerpt}`);
  const summary = Object.fromEntries(Object.entries(byRule).map(([k, v]) => [k, v.length + ": " + v.slice(0, 3).join(" | ")]));
  assert.deepEqual(summary, {});
});

test("semantic lint catches seeded violations (the checker itself works)", () => {
  const f = DR.buildFacts(["snake", "teeth", "flood"], "anxious", "dawn", "money", { rng: lcg(1) });
  const r = FA.compose(f, { seed: 1, trace: true });
  const bad = JSON.parse(JSON.stringify(r));
  bad.sections[0].paragraphs.push("ตำราโบราณมองว่าฝันแบบนี้เป็นลางดีเรื่องลาภผล มีเลข 93 และคุณเป็นคนใจร้อน แต่ก็เป็นคนใจเย็น งูในฝันยังบอกอีกว่าดี");
  bad.sections.push({ id: "personality", title: "บุคลิกและตัวตน", paragraphs: ["x"] });
  const love = f.items.find(x => x.id === "sym.snake"), teeth = f.items.find(x => x.id === "sym.teeth");
  bad._claims.push({ kind: "pair", ids: [love.id, teeth.id], tag: "money", sec: "money", text: bad.sections[0].paragraphs[0] });
  const rules = new Set(FA.lintSemantic(f, bad).map(v => v.rule));
  for (const k of ["omen-vs-reflect", "number-evidence", "trait-conflict", "section-fit", "formulaic", "claim-support"]) assert.ok(rules.has(k), k);
});

test("dream repro (snake+teeth+flood, anxious, dawn, money): จิตนิวรณ์ reading has no omen claims, no cross-theme money claims, no personality section", () => {
  const f = DR.buildFacts(["snake", "teeth", "flood"], "anxious", "dawn", "money", {});
  for (let seed = 1; seed <= 40; seed++) {
    const r = FA.compose(f, { seed, trace: true }), t = fullText(r);
    assert.match(t, /จิตนิวรณ์/);
    assert.ok(!/ลางดี|สัญญาณของโชค|โชคดีที่กำลังเข้ามา|มักเห็นผลเร็ว/.test(t), t);
    assert.ok(!/ฐานที่มั่นคงถึงสองชั้น/.test(t));
    assert.ok(!r.sections.some(s => s.id === "personality"), "no บุคลิกและตัวตน in dream");
    for (const c of r._claims) if (c.kind === "pair" && c.tag === "money") assert.fail("cross-theme money pair: " + c.text);
    assert.deepEqual(FA.lintSemantic(f, r), []);
  }
  // across the whole dream space: never a personality section, non-omen types never claim omens
  let n = 0;
  for (const { d, r, facts } of readings()) if (d === "dream") { n++; assert.ok(!r.sections.some(s => s.id === "personality")); if (facts.register === "reflect") assert.ok(!/ลางดี|(?<!ไม่ถือ|ไม่ใช่)เป็นลาง(?!บอกเหตุ)|สัญญาณของ/.test(fullText(r)), fullText(r)); }
  assert.ok(n > 400);
});

test("length & repetition: full reading ≤ 3,000 chars, main ≤ 2,500, formulaic frames ≤ 0.3/reading, no advice repeated", () => {
  const R = readings();
  let formulaic = 0;
  for (const { d, seed, r } of R) {
    const full = fullText(r);
    assert.ok(full.length <= FA.MAIN_LENGTH.full, `${d}#${seed} ${full.length}`);
    formulaic += (full.match(/ยังบอกอีกว่า|ยังช่วยเสริมด้วยว่า/g) || []).length;
  }
  assert.ok(formulaic / R.length <= 0.3, "formulaic per reading " + (formulaic / R.length).toFixed(2));
  // faceread: the evaluator's 7,000-char reading
  const face = R.filter(x => x.d === "face").map(x => fullText(x.r).length);
  assert.ok(Math.max(...face) <= 3000 && face.reduce((a, b) => a + b, 0) / face.length >= 2000, "face lengths " + Math.min(...face) + "–" + Math.max(...face));
  // colour advice at most once per reading (was "carry a red/pink item" 3×)
  for (const { d, seed, r } of R) {
    const sents = r._sentences.filter(s => fullText(r).indexOf(s.slice(5, 30)) >= 0);
    const colour = sents.filter(s => /สี(?:แดง|ชมพู|ส้ม|เขียว|ทอง|ขาว|ฟ้า|ม่วง|เหลือง)/.test(s) && /พก|ใส่|สวม|ของใช้|ของเล็ก|โทน|หยิบ|เลือก/.test(s));
    assert.ok(colour.length <= 1, `${d}#${seed}: ` + colour.join(" ‖ "));
  }
});

test("summary card: every reading has a 2–3 line สรุปสั้น synthesised from the strongest facts", () => {
  for (const { d, seed, r, facts } of readings()) {
    assert.ok(r.summary && r.summary.lines.length >= 2 && r.summary.lines.length <= 3, `${d}#${seed} ${facts.topic} ${JSON.stringify(r.summary)} ${facts.items.map(i => i.id).join(",")}`);
    for (const l of r.summary.lines) { assert.ok(l.k && l.t.length >= 8 && l.t.length <= 140, `${d}#${seed} ${l.k}: ${l.t}`); assert.ok(FA.safety.isSafe(l.t)); }
    if (facts.topic !== "overall") assert.ok(r.summary.lines.some(l => l.k.indexOf("เรื่อง") === 0 || l.k === "ลองทำ" || l.k === "ข้อคิด"), `${d}#${seed} topic line ${JSON.stringify(r.summary)}`);
  }
  const html = FA.toHTML(readings()[0].r);
  assert.match(html, /class="fa-summary"/);
  assert.match(html, /data-i18n="fa\.summary\.title"/);
});

test("safety filter: lottery terms, zodiac มะเร็ง, sentence-level filtering", () => {
  const S = FA.safety;
  for (const t of ["ซื้อลอตเตอรี่", "สลากกินแบ่ง", "เลขท้าย 2 ตัว 47", "เลขเด็ด 25 งวดนี้", "แทงหวย", "3 ตัวบน 123", "ลุ้นรางวัลที่ 1", "มะเร็งเต้านม", "ราศีมะเร็งกับโรคมะเร็ง", "Cancer patient"]) assert.equal(S.isSafe(t), false, t);
  for (const t of ["ราศีมะเร็ง", "ลัคนาอยู่ราศีมะเร็ง", "คนราศีมะเร็งอ่อนโยน", "ราศีกรกฎ (Cancer)", "Sun in Cancer", "ทิศพายัพ", "ผ่อนค่างวดรถ", "ดู 7 ตัวท้ายของเบอร์"]) assert.equal(S.isSafe(t), true, t);
  assert.equal(S.filterText("เลขเด็ด 25 งวดนี้"), "");
  assert.equal(S.filterText("คุณมีเสน่ห์มาก เลขเด็ด 25 งวดนี้ ลองพกของสีแดงติดตัว"), "คุณมีเสน่ห์มาก ลองพกของสีแดงติดตัว");
  assert.equal(S.filterText("ช่วงนี้การเงินดี ซื้อลอตเตอรี่ 2 ใบ แต่ควรออมด้วย"), "ช่วงนี้การเงินดี");
  assert.ok(!/\d/.test(S.filterText("โชคดีมาก เลขท้าย 2 ตัว 47 และ 3 ตัวบน 591")));
});
