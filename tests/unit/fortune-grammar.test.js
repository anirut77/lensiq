"use strict";
// node --test tests/unit — fortune-ai.js grammar roles, semantic consistency, AI-path safety and native Chinese readings.
//  * the evaluator's exact bad sentences (round 3) are planted as negative tests: FA.lint / FA.lintSemantic must flag each one
//  * a corpus over all 11 domains, Thai and Chinese, must produce 0 lint / semantic violations (the 10,000-reading run is
//    the same check at scale: see the report; this suite keeps ~900 readings so it stays fast)
//  * zh knowledge-base files: no Thai, safe, typed (clauses vs. imperative advice), and they cover the facts the pages produce
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
global.PALM_KB = require("../../palm-kb.js");
global.FR_KB = require("../../faceread-kb.js");
const FA = require("../../fortune-ai.js");
const FR = require("../../faceread.js"), PC = require("../../palm.js"), HS = require("../../horoscope.js");
const TR = require("../../tarot.js"), TKB = require("../../tarot-kb.js"), FS = require("../../fengshui.js"), NM = require("../../numbers.js");
const IC = require("../../iching.js"), ZD = require("../../zodiac.js"), AS = require("../../astro.js"), DR = require("../../dream.js");
const I18N = path.join(__dirname, "..", "..", "i18n");
const ZH_FILES = fs.readdirSync(I18N).filter(f => /^zh-kb-.+\.js$/.test(f));
for (const f of ZH_FILES) require(path.join(I18N, f));

const sec = (id, ...p) => ({ lang: "th", sections: [{ id, title: "x", paragraphs: p }] });
const rules = r => FA.lint(r).map(x => x.rule);
const pad = "ข้อความนี้ยาวพอสำหรับตรวจความยาวของหัวข้อ ไม่ให้นับเป็นหัวข้อบาง ";

/* ---------------- planted negatives: the evaluator's sentences ---------------- */
test("lint flags every pattern from the round-3 evaluation (exact sentences)", () => {
  const cases = [
    ["dup-copula", "ข้อคิดหนึ่งคือคู่ท้ายสุดคือคู่ที่หลายตำราให้น้ำหนักมาก"],
    ["dup-copula", "ข้อคิดหนึ่งคือคู่ความรักมั่นคงที่หลายตำรายกตัวอย่างคือ 56/65 และ 69/96"],
    ["copula+verb", "ข้อคิดสำคัญคือเป็นคู่ที่ควรระวังความลังเล ตั้งเส้นแบ่งให้ชัดจะสบายใจขึ้น"],
    ["copula+verb", "ข้อคิดที่เข้ากับผลนี้คือคู่ 12 ที่ควรใส่ใจ"],
    ["subject-clash", "วันเกิดพฤหัสบดีชี้ว่าคุณการเงินเติบโตอย่างมั่นคงจากความรู้"],
    ["subject-clash", "เลขชีวิตแสดงว่าคุณเงินไหลมาเมื่อทำสิ่งที่มีความหมาย"],
    ["noun-slot", "ลองนำช่างสังเกตมาใช้กับเรื่องเล็ก ๆ ตั้งแต่วันนี้ แล้วผลจะค่อย ๆ ขยายใหญ่ขึ้นเอง"],
    ["noun-slot", "ลองนำขอความช่วยเหลือมาใช้กับเรื่องเล็ก ๆ ตั้งแต่วันนี้"],
    ["double-report", "ไพ่มหาดเล็กดาบหมายความว่าภาพมหาดเล็กถือดาบยืนบนเนินลมแรงสะท้อนความอยากรู้อยากเห็น"],
    ["double-report", "ธาตุไฟแสดงว่าเคล็ดลับสำหรับธาตุไฟคือแยกบัญชีเงินเก็บแบบตัดอัตโนมัติ"],
    ["raw-separator", "พบปีปกติ · เดินหน้าได้ตามแผน ในปีมะเมีย"],
  ];
  for (const [rule, t] of cases) assert.ok(rules(sec("overview", pad + t)).includes(rule), rule + " ← " + t + " → " + JSON.stringify(rules(sec("overview", pad + t))));
  // every rule is a grammar rule known to the composer's gate
  for (const [rule] of cases) assert.ok(FA.grammar.RULES.includes(rule), rule);
});
test("lintSemantic flags label tautology, numbers polarity; lint flags fillers, polarity conflicts and topic mismatch", () => {
  const tarot = { domain: "tarot", topic: "overall", items: [{ id: "card.present.m13", label: "การเปลี่ยนผ่าน (XIII)", tags: ["overview"], meanings: { overview: ["x"] } }] };
  const taut = FA.lintSemantic(tarot, sec("overview", pad + "การเปลี่ยนผ่าน (XIII) หมายถึงไพ่ใบนี้วางน้ำหนักไว้ที่การเปลี่ยนผ่าน"));
  assert.ok(taut.some(x => x.rule === "label-tautology"), JSON.stringify(taut));
  const fire = { domain: "face", topic: "money", items: [{ id: "element.fire", label: "ธาตุไฟ", tags: ["money"], meanings: { money: ["x"] } }] };
  assert.ok(FA.lintSemantic(fire, sec("money", pad + "ธาตุไฟแสดงว่าเคล็ดลับสำหรับธาตุไฟคือแยกบัญชีเงินเก็บ")).some(x => x.rule === "label-tautology"));
  // ≤ 1 generic agreement line per reading
  const filler = rules(sec("overview", pad + "ก กับ ข ชี้ไปทางเดียวกันในเรื่องการงาน ค และ ง ให้ความหมายเรื่องความรักสอดคล้องกัน จ และ ฉ ต่างพูดถึงเรื่องเงิน จึงเป็นเรื่องที่ควรให้น้ำหนัก"));
  assert.ok(filler.includes("filler-budget"), JSON.stringify(filler));
  assert.ok(!rules(sec("overview", pad + "ทั้งเส้นสมองและเส้นวาสนาพูดถึงการวางแผนเหมือนกัน")).includes("filler-budget"));
  // palm: novelty-seeking vs routine-tolerant in the same reading
  const pol = rules({ lang: "th", sections: [{ id: "work", title: "x", paragraphs: [pad + "งานซ้ำเดิมนาน ๆ อาจทำให้คุณเบื่อ ลองหาโปรเจกต์ใหม่"] }, { id: "personality", title: "y", paragraphs: [pad + "ยิ่งอยู่ในสายเดิมนาน ผลงานยิ่งลึกและมั่นคง"] }] });
  assert.ok(pol.includes("polarity-conflict"), JSON.stringify(pol));
  // numbers: advice to avoid a pair the reading praised / praising a care pair
  const nf = { domain: "numbers", topic: "money", items: [{ id: "pair.24", label: "คู่ 24", tags: ["money"], meanings: { money: ["x"] } }, { id: "pair.67", label: "คู่ 67", polarity: "challenge", tags: ["love"], meanings: { love: ["x"] } }] };
  const np = FA.lintSemantic(nf, sec("money", pad + "นิยมเลี่ยง 24/42 เมื่อเลือกเบอร์เพื่อการเงิน คู่ยอดนิยมสายความรักคือ 67/76"));
  assert.equal(np.filter(x => x.rule === "numbers-polarity").length, 2, JSON.stringify(np));
  // love meaning under money / friendship
  assert.ok(rules(sec("money", pad + "คู่ความรักมั่นคงที่หลายตำรายกตัวอย่างคือคู่ที่อบอุ่น")).some(r => r === "topic-mismatch" || r === "off-topic"));
  assert.ok(rules(sec("social", pad + "ความรักมีสีสันชอบทำเซอร์ไพรส์ให้คนที่รัก")).includes("topic-mismatch"));
});
test("grammar roles: KB strings are typed before they fill a slot", () => {
  const R = FA.grammar.roleOf;
  assert.equal(R("ลองจดสิ่งที่อยากทำไว้สามข้อ"), "imperative");
  assert.equal(R("เป็นคนใจเย็นและคิดก่อนพูด"), "vpPerson");
  assert.equal(R("ช่วยให้ได้รับความเชื่อถือด้านความเชี่ยวชาญ"), "vpItem");
  assert.equal(R("ความมั่นคง"), "noun");
  assert.equal(R("คุณมีเสน่ห์ เข้ากับคนง่าย"), "clause");
  assert.equal(FA.grammar.asNoun("ช่างสังเกต"), "ความช่างสังเกต");
  assert.equal(FA.grammar.proseLabel("เส้นที่ 1 · จุดเริ่มต้น (หยางเก่า → หยิน)"), "เส้นที่ 1 (จุดเริ่มต้น)");
});

/* ---------------- AI path safety ---------------- */
test("AI path: reckless financial / job / medical directives and lottery lines are dropped as whole sentences", () => {
  const ai = { sections: [{ id: "money", paragraphs: ["ดวงการเงินช่วงนี้ดีมาก กู้เงินลงทุนคริปโตเลย แล้วจะรวยเร็ว", "งานไม่ราบรื่น ลาออกจากงานทันที แล้วหางานใหม่", "ช่วงนี้ดวงดี ซื้อหวยเลข 27 แน่นอน ขอให้โชคดี", "สุขภาพดีขึ้น หยุดกินยาได้เลย", "วางแผนรายจ่ายเดือนนี้ให้ชัด"] }] };
  const out = FA._internal.normalizeAI(ai)[0].paragraphs.join(" ");
  for (const bad of ["กู้", "คริปโต", "ลาออก", "หวย", "27", "แน่นอน", "หยุดกินยา", "รวยเร็ว"]) assert.ok(out.indexOf(bad) < 0, bad + " in: " + out);
  assert.match(out, /วางแผนรายจ่าย/);
  for (const t of ["借钱投资加密货币，马上就能翻倍", "明天立刻辞职吧", "买彩票选27号"]) assert.equal(FA.safety.isSafe(t), false, t);
  for (const t of ["ไม่ทุ่มหมดหน้าตักกับเรื่องที่ยังไม่แน่ใจ", "ช่วงวันหยุดยาวเป็นจังหวะดีที่จะเติมไอเดีย", "记得每月把一部分收入存起来"]) assert.equal(FA.safety.isSafe(t), true, t);
});

/* ---------------- corpus over all 11 domains ---------------- */
function corpus(per) {
  let s = 99; const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const T = ["overall", "love", "work", "money"], out = [];
  const base = FR.synthFace({ x: 100, y: 100, w: 300, h: 380 });
  const LINES = Object.fromEntries(PC.LINE_IDS.map(id => [id, { cp: PC.TEMPLATES[id].pts, present: true }]));
  const syms = Object.keys(DR.BY);
  for (let i = 0; i < per; i++) {
    const t = T[i % 4];
    const dx = (r() - 0.5) * 14, k0 = Math.floor(r() * 12);
    out.push(FR.buildFacts(FR.analyze(base.map(([x, y], k) => [x + (k >= 36 && k < 48 ? (k < 42 ? -dx : dx) : 0) + (k <= 16 ? (k < 8 ? -k0 : k0) : 0), y + (k >= 17 && k < 27 ? -k0 : 0)]), null, 20 + i), { topic: t, age: 20 + i }));
    const side = i % 2 ? "left" : "right";
    out.push(PC.buildFacts(PC.analyze({ hand: PC.handFromLandmarks(PC.synthHand({ x: 400, y: 200, w: 330 + i * 7, h: 450 + (i % 4) * 20 }, side)), lines: LINES, side, isDominant: i % 3 > 0 }), { topic: t, side, isDominant: i % 3 > 0 }));
    out.push(HS.buildFacts(HS.analyze({ y: 1955 + i * 2, m: 1 + i % 12, d: 1 + (i * 7) % 28, time: i % 2 ? { h: (i * 5) % 24, mi: 20 } : null }), { topic: t, rng: r }));
    const sp = ["three", "celtic", "love5", "threeAdvice", "one"][i % 5], n = TKB.spreads[sp].positions.length, used = new Set(), picks = [];
    while (picks.length < n) { const id = TKB.cards[Math.floor(r() * 78)].id; if (!used.has(id)) { used.add(id); picks.push({ id, rev: r() < 0.4 }); } }
    out.push(TR.buildFacts(picks, t === "overall" ? "general" : t, sp, { rng: r }));
    out.push(TR.siamseeFacts(TKB.siamsee[i % TKB.siamsee.length], { topic: t }));
    out.push(FS.buildFacts({ kua: FS.kua(1955 + i * 2, i % 2 ? "f" : "m"), recorded: {}, rooms: [], photos: [], topic: t, now: new Date(2026, i % 12, 5) }));
    out.push(NM.buildFacts(NM.analyzePhone("08" + String(Math.floor(r() * 1e8)).padStart(8, "0")), t, {}));
    out.push(IC.buildFacts(IC.cast(Array.from({ length: 6 }, () => [6, 7, 8, 9][Math.floor(r() * 4)])), t, { rng: r }));
    out.push(ZD.buildFacts(ZD.annual(i % 12, 2026, 1955 + i * 3), t, {}));
    out.push(AS.buildFacts(AS.chart({ y: 1960 + i, m: 1 + i % 12, d: 2 + i % 26, time: i % 2 ? { h: 6 + i % 12, mi: 10 } : null, tz: 7, lat: 13.75, lon: 100.5 }), t));
    out.push(DR.buildFacts([syms[(i * 7) % syms.length], syms[(i * 13 + 3) % syms.length]].slice(0, 1 + i % 2), ["happy", "anxious", "", "sad"][i % 4], ["dawn", "early", "late", ""][i % 4], t, { rng: r }));
  }
  return out;
}
const CORPUS = corpus(40);
const text = r => r.sections.map(s => s.paragraphs.join(" ")).join(" ");
for (const lang of ["th", "zh"]) {
  test(`corpus (${lang}): ${CORPUS.length} readings over 11 domains have 0 lint / semantic violations`, () => {
    const bad = {}, domains = new Set();
    CORPUS.forEach((facts, i) => {
      domains.add(facts.domain);
      const r = FA.compose(facts, { seed: i * 7919 + 1, trace: true, lang });
      assert.equal(r.lang, lang);
      for (const p of FA.lint(r).concat(FA.lintSemantic(facts, r))) (bad[p.rule] = bad[p.rule] || []).push(facts.domain + ": " + p.excerpt);
      const t = text(r);
      if (lang === "zh") assert.ok(!/[฀-๿]/.test(t + JSON.stringify(r.summary || {})), "Thai in zh reading: " + facts.domain);
      else {
        assert.ok(!/คือ[^ ]{0,40}คือ/.test(t), "คือ…คือ " + facts.domain);
        assert.ok((t.match(/ไปทางเดียวกัน|สอดคล้องกัน|ควรให้น้ำหนัก/g) || []).length <= 1, "filler " + facts.domain);
      }
    });
    assert.equal(domains.size, 11);
    assert.deepEqual(Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, v.length + ": " + v.slice(0, 2).join(" | ")])), {});
  });
}
test("zh lint catches Thai, empty sections, raw separators and filler overuse", () => {
  const z = (...p) => ({ lang: "zh", sections: [{ id: "overview", title: "总览", paragraphs: p }] });
  assert.ok(FA.lint(z("最突出ใบหน้ากลมอิ่ม，你性格温和。")).some(x => x.rule === "thai-in-zh"));
  assert.ok(FA.lint({ lang: "zh", sections: [{ id: "love", title: "感情", paragraphs: [""] }] }).some(x => x.rule === "empty-section"));
  assert.ok(FA.lint(z("这次的重点在第46卦 · 升。")).some(x => x.rule === "raw-separator"));
  assert.ok(FA.lint(z("甲和乙都提到了沟通。丙和丁都提到了耐心。")).some(x => x.rule === "filler-budget"));
  assert.deepEqual(FA.lint(z("先看第46卦（升）：你正在一步步往上走，适合稳扎稳打。")), []);
});

/* ---------------- zh knowledge base ---------------- */
test("zh-kb files: Simplified Chinese only, safe, clauses vs. imperative advice, no digits in meanings", () => {
  assert.ok(ZH_FILES.length >= 11, ZH_FILES.join(","));
  const D = FA.zh.data(), problems = [];
  for (const dom of Object.keys(D)) for (const [k, e] of Object.entries(D[dom].items)) {
    for (const [f, v] of Object.entries(e)) for (const x of [].concat(v)) {
      const s = String(x);
      if (/[฀-๿]/.test(s)) problems.push(`${dom}.${k}.${f} Thai: ${s}`);
      if (!FA.safety.isSafe(s)) problems.push(`${dom}.${k}.${f} unsafe: ${s}`);
      if (f === "n" || f === "s") continue;
      if (/\d/.test(s)) problems.push(`${dom}.${k}.${f} digit: ${s}`);
      if (/。$/.test(s)) problems.push(`${dom}.${k}.${f} final 。: ${s}`);
      if (f === "a" && /^(?:建议|不妨|可以|试着|请|你应该)/.test(s)) problems.push(`${dom}.${k}.a starts with a frame word: ${s}`);
      if (f !== "a" && /^(?:代表|象征|意味着|说明)/.test(s)) problems.push(`${dom}.${k}.${f} bare verb start: ${s}`);
    }
  }
  assert.deepEqual(problems.slice(0, 8), []);
});
test("zh coverage: ≥ 90 % of the facts each domain produces have Chinese data", () => {
  const per = {};
  for (const facts of CORPUS) for (const it of facts.items) {
    const d = facts.domain, keys = FA.zh.keys(d, it);
    if (!keys.length) continue; // tarot pair/spread notes are summarised by the cards themselves
    const p = per[d] = per[d] || { n: 0, ok: 0 };
    p.n++; if (FA.zh.item(d, Object.assign({ _i: 0 }, it, { label: it.label }))) p.ok++;
  }
  for (const [d, p] of Object.entries(per)) assert.ok(p.ok / p.n >= 0.9, `${d}: ${p.ok}/${p.n}`);
});
test("numbers 0812345678: no 'avoid' advice for pairs in the number, no love-only phrase under money", () => {
  const f = NM.buildFacts(NM.analyzePhone("0812345678"), "money", {});
  assert.ok(!f.extras.tips.some(t => /เลี่ยง/.test(t) && /67|76/.test(t)), JSON.stringify(f.extras.tips));
  for (const it of f.items) for (const m of (it.meanings.money || [])) assert.ok(!/ความรัก|คนรัก|คู่รัก/.test(m) || /เงิน/.test(m), it.id + ": " + m);
  for (let seed = 1; seed < 30; seed++) {
    const r = FA.compose(f, { seed, trace: true });
    assert.deepEqual(FA.lintSemantic(f, r).filter(x => x.rule === "numbers-polarity"), []);
    assert.ok(!/เลี่ยง[^ ]{0,12}(?:67|76)/.test(text(r)));
  }
});
test("zodiac: no raw '·' labels in prose", () => {
  for (let a = 0; a < 12; a++) for (const y of [2025, 2026]) {
    const f = ZD.buildFacts(ZD.annual(a, y, 1960 + a), "overall", {});
    assert.ok(!/·/.test(text(FA.compose(f, { seed: a + y }))), "animal " + a);
  }
});
