"use strict";
// node --test tests/unit — evidence vs meaning consistency for the fortune pages.
// Each reading item carries an `evidence` string (what was measured) and `label` + `meanings` (what the KB says).
// These sweeps generate thousands of synthetic inputs and check that the KB never describes a trait that the
// evidence of the same item contradicts (e.g. "ตากลม" next to "ทรงตาเรียวยาว", "ฝ่ามือทรงยาว" next to "สั้นกว่าค่าทั่วไป"),
// that dream-type and dream-time meanings agree, and the small wording fixes (zodiac year, I Ching term).
const test = require("node:test");
const assert = require("node:assert/strict");
global.FR_KB = require("../../faceread-kb.js");
global.PALM_KB = require("../../palm-kb.js");
const FR = require("../../faceread.js");
const PC = require("../../palm.js");
const DR = require("../../dream.js");
const DKB = require("../../dream-kb.js");
const ZD = require("../../zodiac.js");
const IC = require("../../iching.js");
const ICKB = require("../../iching-kb.js");

function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; }; }
const TOPICS = ["overall", "love", "work", "money"];
const textsOf = it => [it.label].concat(...Object.values(it.meanings || {}));

/** [evidence pattern, pattern that must not appear in label/meanings of the same item] */
function violations(items, oracle) {
  const out = [];
  for (const it of items) for (const [ev, bad] of oracle) {
    if (!ev.test(it.evidence || "")) continue;
    for (const t of textsOf(it)) if (bad.test(t)) out.push(`${it.id}: [${it.evidence}] vs "${t.slice(0, 70)}"`);
  }
  return out;
}

/* ---------------- โหงวเฮ้ง ---------------- */
const FACE_ORACLE = [
  [/ทรงตาเรียวยาว/, /ตา(?:ที่)?กลม|ดวงตากลม/],
  [/ทรงตาค่อนข้างกลม/, /ตา(?:ที่)?เรียวยาว|ตายาว/],
  [/หางตาลาดลง/, /แนวตาระดับ|หางตาชี้ขึ้น|ทั้งความยาวและแนวหางตา/],
  [/หางตาชี้ขึ้น/, /แนวตาระดับ|หางตาลาด|ทั้งความยาวและแนวหางตา/],
  [/หางตาอยู่ระดับ/, /หางตาชี้ขึ้น|หางตาลาด/],
  [/ความยาวคิ้ว.*ถือว่าสั้นกว่า/, /คิ้ว(?:ที่)?ยาว|ยาวเกินตา/],
  [/ความยาวคิ้ว.*ถือว่ายาวกว่า/, /คิ้ว(?:ที่)?สั้น|คิ้วกระชับ/],
  [/ความโก่งน้อยกว่า/, /คิ้ว(?:ที่)?โก่ง|โก่งโค้ง|พระจันทร์เสี้ยว/],
  [/ความโก่งมากกว่า/, /คิ้วตรง|เส้นคิ้ว(?:ค่อนข้าง)?ตรง/],
  [/ความยาวจมูกสั้น/, /สัน(?:จมูก)?ยาว|จมูกยาว/],
  [/ความยาวจมูกยาว/, /จมูก(?:ที่)?(?:สั้น|กะทัดรัด)/],
  [/ฐานจมูกแคบ/, /ปีกจมูก(?:ที่)?(?:กว้าง|อิ่ม)/],
  [/ฐานจมูกกว้าง/, /ปีกจมูก(?:ที่)?(?:แคบ|เรียว)|จมูกเรียว/],
  [/ริมฝีปากบาง/, /ริมฝีปาก(?:ที่)?(?:อิ่ม|หนา)|ปากอิ่ม/],
  [/ริมฝีปากอิ่ม/, /ริมฝีปาก(?:ที่)?บาง/],
  [/คางแคบ/, /คาง(?:ที่)?(?:กว้าง|มน|อิ่ม)/],
  [/คางกว้าง/, /คาง(?:ที่)?(?:เรียว|แหลม)/]
];
function sampleFace(r) {
  const m = {};
  for (const k in FR.NORMS) { const z = (r() * 2 - 1) * 2.6 * (r() < 0.5 ? 1 : 0.5); m[k] = FR.NORMS[k][0] + z * FR.NORMS[k][1]; }
  m.upperEstimated = r() < 0.3;
  return m;
}
const faceFacts = (m, i) => {
  const R = { m, cls: FR.classify(m), el: FR.elementScores(m), palaces: FR.palaceScores(m, null), mountains: FR.mountains(m), rivers: FR.rivers(m) };
  return { R, f: FR.buildFacts(R, { topic: TOPICS[i % 4], age: 20 + (i % 50) }) };
};

test("faceread: eye/chin type agrees with the measured shape (no tiger eye with a sloping tail)", () => {
  const r = lcg(7), t = FR.THRESH;
  const bad = [];
  for (let i = 0; i < 3000; i++) {
    const m = sampleFace(r), c = FR.classify(m), S = FR.zOf("eyeAspect", m.eyeAspect), U = FR.zOf("eyeTilt", m.eyeTilt), W = FR.zOf("chinWidth", m.chinWidth);
    const e = c.eye.cat;
    if ((e === "tiger" || e === "dragon") && Math.abs(U) >= t.tiltZ) bad.push(e + " tilt " + U.toFixed(2));
    if ((e === "phoenix" || e === "deer") && U < t.tiltZ) bad.push(e + " tilt " + U.toFixed(2));
    if ((e === "elephant" || e === "soft") && U > -t.tiltZ) bad.push(e + " tilt " + U.toFixed(2));
    if ((e === "tiger" || e === "deer" || e === "soft") && S > -t.typeZ) bad.push(e + " aspect " + S.toFixed(2));
    if ((e === "phoenix" || e === "dragon" || e === "elephant") && S < t.typeZ) bad.push(e + " aspect " + S.toFixed(2));
    if (c.chin.cat === "broad" && W <= -0.5) bad.push("broad chin, narrow width " + W.toFixed(2));
    if (c.chin.cat === "pointed" && W >= 0.5) bad.push("pointed chin, wide width " + W.toFixed(2));
  }
  assert.deepEqual(bad.slice(0, 5), []);
  // กรณีจากรายงานประเมิน: ตากลม (2.6 เท่า) หางตาลาดลง → ไม่ใช่ "ตาเสือ (กลมโต แนวตาระดับ)"
  const m = Object.fromEntries(Object.keys(FR.NORMS).map(k => [k, FR.NORMS[k][0]]));
  m.eyeAspect = 2.6; m.eyeTilt = FR.NORMS.eyeTilt[0] - 1.5 * FR.NORMS.eyeTilt[1];
  assert.equal(FR.classify(m).eye.cat, "soft");
  const it = faceFacts(m, 0).f.items.find(x => /^eye\./.test(x.id) && !/note/.test(x.id));
  assert.match(it.evidence, /ทรงตาค่อนข้างกลม หางตาลาดลง/);
  assert.ok(!textsOf(it).some(x => /แนวตาระดับ|ตาเสือ/.test(x)), JSON.stringify(it.meanings).slice(0, 200));
});

test("faceread: meanings never contradict the evidence of the same item (6000 sampled faces)", () => {
  const r = lcg(11), bad = [];
  for (let i = 0; i < 6000; i++) {
    const m = sampleFace(r), { f } = faceFacts(m, i);
    bad.push(...violations(f.items, FACE_ORACLE));
    // คำบรรยายรูปหน้าในสำนวน (เช่น "ใบหน้ากลมอิ่ม", "คางเรียวลง") ต้องไม่ขัดกับค่าที่วัดได้
    if (!m.upperEstimated) {
      const zm = Object.fromEntries(Object.keys(FR.NORMS).map(k => [k, FR.zOf(k, m[k])]));
      for (const it of f.items) for (const t of Object.values(it.meanings).flat()) if (FR.contradicts(t, zm)) bad.push(it.id + ": " + t.slice(0, 60));
    }
    for (const it of f.items) for (const tag of it.tags) assert.ok(it.meanings[tag] && it.meanings[tag].length, it.id + "." + tag);
    if (bad.length > 5) break;
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

test("faceread: shape guard keeps meanings that agree and drops ones that clash", () => {
  assert.equal(FR.contradicts("ดวงตากลมโตและแนวตาระดับแบบตาเสือ", { eyeAspect: 1.2, eyeTilt: 0 }), true);
  assert.equal(FR.contradicts("ดวงตากลมโตและแนวตาระดับแบบตาเสือ", { eyeAspect: -1.2, eyeTilt: -0.8 }), true);
  assert.equal(FR.contradicts("ดวงตากลมโตและแนวตาระดับแบบตาเสือ", { eyeAspect: -1.2, eyeTilt: 0.1 }), false);
  assert.equal(FR.contradicts("ร่องใต้จมูกยาวบอกถึงความอดทน", { noseLen: -2 }), false, "philtrum is not the nose");
  assert.equal(FR.contradicts("ใบหน้ากลมอิ่ม เส้นโค้งนุ่มนวล", { lengthRatio: 1.1 }), true);
  // ทุกชนิดตาในคลังมีคำอ่าน
  for (const k of Object.keys(FR_KB.features.eye.cats)) assert.ok(FR_KB.interp["eye." + k], "interp eye." + k);
});

test("faceread: synthetic faces through the full pipeline stay consistent", () => {
  const r = lcg(3), bad = [];
  for (let i = 0; i < 300; i++) {
    const pts = FR.synthFace({ x: 100, y: 100, w: 300, h: 380 }).map(([x, y], k) => {
      const j = (r() - 0.5) * 18, jy = (r() - 0.5) * 18;
      return k >= 36 && k < 48 ? [x + j * 0.4, y + jy * 0.4] : [x + j * 0.25, y + jy * 0.25];
    });
    const R = FR.analyze(pts, null, 30 + (i % 40));
    bad.push(...violations(FR.buildFacts(R, { topic: TOPICS[i % 4] }).items, FACE_ORACLE));
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

/* ---------------- ลายมือ ---------------- */
const PALM_ORACLE = [
  [/^ความยาวฝ่ามือ.*สั้นกว่า/, /ฝ่ามือ(?:ที่ค่อนข้าง|ทรง)?ยาว/],
  [/^ความยาวฝ่ามือ.*ยาวกว่า/, /ฝ่ามือ(?:ทรง)?เหลี่ยม|ฝ่ามือ(?:ที่)?สั้น/],
  [/^(?:ความยาวฝ่ามือ|นิ้วกลาง).*ใกล้ค่าทั่วไป/, /ฝ่ามือทรง(?:ยาว|เหลี่ยม)|นิ้วเรียวยาว|นิ้วสั้นกระชับ/],
  [/^นิ้วกลาง.*สั้นกว่า/, /นิ้ว(?:ที่ค่อนข้าง)?(?:เรียว)?ยาว/],
  [/^นิ้วกลาง.*ยาวกว่า/, /นิ้ว(?:ที่ค่อนข้าง)?สั้น|นิ้วกระชับ/],
  [/เส้นสมอง.*ถือว่าสั้น/, /เส้นสมอง(?:ที่)?(?:ยาว|แบบยาว)/],
  [/เส้นสมอง.*ถือว่ายาว$/, /เส้นสมอง(?:ที่)?(?:สั้น|แบบสั้น)/],
  [/เส้นชีวิต.*จบก่อน/, /เส้นชีวิต(?:ที่)?(?:ยาว|แบบยาว)/],
  [/เส้นชีวิต.*ลงไปลึก/, /เส้นชีวิต(?:ที่)?(?:สั้น|แบบสั้น)/]
];
test("palm: hand shape and line length meanings agree with the measured evidence (1500 synthetic hands)", () => {
  const r = lcg(5), bad = [], seen = new Set();
  const PARENT = [0, 0, 0, 0, 0, 5, 5, 5, 5, 9, 9, 9, 9, 13, 13, 13, 13, 17, 17, 17, 17];
  for (let i = 0; i < 1500; i++) {
    const w = 300 + r() * 200, h = w * (1 + r()), fk = 0.7 + r() * 0.7, side = i % 2 ? "right" : "left";
    let pts = PC.synthHand({ x: 100, y: 100, w, h }, side);
    pts = pts.map((p, k) => { if ([0, 1, 2, 3, 4, 5, 9, 13, 17].includes(k)) return p; const b = pts[PARENT[k]]; return [b[0] + (p[0] - b[0]) * fk, b[1] + (p[1] - b[1]) * fk]; });
    const lines = Object.fromEntries(PC.LINE_IDS.map(id => [id, { cp: PC.TEMPLATES[id].pts.map(([x, y]) => [x + (r() - 0.5) * 0.25, y + (r() - 0.5) * 0.25]), present: r() > 0.1 }]));
    const A = PC.analyze({ hand: PC.handFromLandmarks(pts), lines, side, isDominant: !!(i % 3) });
    const f = PC.buildFacts(A, { topic: TOPICS[i % 4], side, isDominant: true });
    f.items.forEach(it => seen.add(it.id));
    bad.push(...violations(f.items, PALM_ORACLE));
    // หลักฐานต้องไม่ขึ้นต้นด้วย "ฝ่ามือยาว x เท่า" (อ่านเหมือนฝ่ามือยาว แม้หมวดจะเป็นฝ่ามือเหลี่ยม/สั้น)
    for (const it of f.items) if (/^(?:ฝ่ามือ|นิ้วโป้ง|นิ้วก้อย|นิ้วชี้|เส้น\S+)ยาว \d/.test(it.evidence)) bad.push("ambiguous evidence " + it.id + ": " + it.evidence);
    if (bad.length > 5) break;
  }
  assert.deepEqual(bad.slice(0, 5), []);
  for (const id of ["shape.palm.long", "shape.palm.square", "shape.fingers.long", "shape.fingers.short", "head.long", "life.long"]) assert.ok(seen.has(id), "sweep covers " + id);
});
test("palm: the evaluated case (palm ratio 1.46) reads as a short/square palm without 'ฝ่ามือยาว 1.46'", () => {
  const w = 400, hand = PC.handFromLandmarks(PC.synthHand({ x: 0, y: 0, w, h: 500 }, "right"));
  const s = 1.46 / (PC.analyze({ hand, lines: {}, side: "right" }).hm.palmRatio);
  const pts = PC.synthHand({ x: 0, y: 0, w, h: 500 }, "right").map(([x, y]) => [x, y * s]);
  const A = PC.analyze({ hand: PC.handFromLandmarks(pts), lines: {}, side: "right" });
  assert.ok(Math.abs(A.hm.palmRatio - 1.46) < 0.05, String(A.hm.palmRatio));
  const it = PC.buildFacts(A, {}).items.find(x => /^shape\.palm/.test(x.id));
  assert.equal(it.id, "shape.palm.square");
  assert.match(it.evidence, /^ความยาวฝ่ามือ 1\.4\d เท่าของความกว้าง ถือว่าสั้นกว่าค่าทั่วไป/);
});

/* ---------------- ทำนายฝัน ---------------- */
test("dream: non-omen dream types never claim the dream 'comes true soon'", () => {
  const syms = DKB.SYMBOLS.map(s => s.id), moods = ["", ...Object.keys(DKB.MOODS)], times = ["", ...Object.keys(DKB.TIMES)];
  const PROPHETIC = /มักเห็นผลเร็ว|ลางบอกเหตุล่วงหน้า|ผลจะค่อย ๆ ปรากฏ/;
  let n = 0;
  for (const mood of moods) for (const time of times) for (let i = 0; i < 12; i++) {
    const ids = [syms[(i * 7) % syms.length], syms[(i * 13 + 3) % syms.length]];
    const ty = DR.dreamType(ids, mood, time), omen = DKB.TYPES[ty].omen;
    const f = DR.buildFacts(ids, mood, time, TOPICS[i % 4], { rng: lcg(i) });
    const timing = f.items.find(x => x.id === "type").timingFull;
    const all = JSON.stringify(f.items.map(x => x.meanings));
    if (!omen) assert.ok(!PROPHETIC.test(all), `${ty}/${mood}/${time}: ${timing.join(" | ")}`);
    if (time) assert.equal(timing.length, 2);
    n++;
  }
  assert.ok(n > 300);
  // กรณีจากรายงานประเมิน
  const f = DR.buildFacts(["snake", "teeth", "flood"], "anxious", "dawn", "money", {});
  const t = f.items.find(x => x.id === "type").timingFull.join(" ");
  assert.match(t, /จิตนิวรณ์/);
  assert.ok(!/มักเห็นผลเร็ว/.test(t), t);
  // ฝันที่เป็นลาง (บุพนิมิต) ยังคงความเชื่อเรื่องฝันใกล้รุ่ง
  const g = DR.buildFacts(["snake"], "happy", "dawn", "love", {});
  assert.match(g.items.find(x => x.id === "type").timingFull.join(" "), /มักเห็นผลเร็ว/);
  assert.equal(DR.timeMeaning(DKB.TYPES.jit, "dawn"), DKB.TIMES.dawn.r);
});

/* ---------------- ถ้อยคำเล็ก ๆ ---------------- */
test("zodiac/iching wording: spaced CE year with พ.ศ., I Ching uses กว้า (卦) not ฮู่", () => {
  const f = ZD.buildFacts(ZD.annual(0, 2026, 1984), "love", {});
  const g = f.items.find(x => /^rel\./.test(x.id)).group;
  assert.equal(g, "ปี 2026 (พ.ศ. 2569)");
  const txt = JSON.stringify(f);
  assert.ok(!/[ก-๎]\d{4}/.test(txt), "Thai letter glued to a year");
  const all = JSON.stringify(IC.buildFacts(IC.cast([9, 7, 8, 6, 7, 7]), "work", { rng: () => 0.3 })) + ICKB.allText().join(" ");
  assert.ok(!/ฮู่|ฮู้/.test(all));
  assert.match(all, /กว้า/);
});
