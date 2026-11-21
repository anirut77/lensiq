"use strict";
// tests/unit/palm-honesty.test.js — owner decision 163 ก (2026-11-19), LIVE palm page honesty fix. Locked BEFORE the fix
// (phase palm-honesty). Synthetic images only (source: synthetic; no photo of a person).
//   H1  a palm image with no crease: heart / head / life (and fate) are NOT detected; each carries the "not clear" state
//       (present === false, unclear === true) instead of a placeholder placed on the template
//   H1c control: the same palm with dark creases drawn along life / head / heart IS detected (the detector is not simply off)
//   H2  the reading never references a line in the "not clear" state (reading rows, summaries, highlights, tips, facts
//       for FortuneAI and the locally composed narrative), in TH; EN / ZH strings are checked in the e2e
//   H3  a fate line that is not found is never read as "absent / no fate line"
//   H4  the "not clear" label is exactly ไม่ชัดในภาพนี้ / Not clear in this photo / 此照片中不清楚
//   H5  the mounts label is the owner-approved text (decision 164; placeholder until re-lock 2)
//   H6-H8 see re-lock 2 below
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const KB = require(path.join(ROOT, "palm-kb.js"));
global.PALM_KB = KB;
const PC = require(path.join(ROOT, "palm.js"));
const FA = require(path.join(ROOT, "fortune-ai.js"));
const EN = require(path.join(ROOT, "i18n", "en-fortune-palm.js")).en;
const ZH = require(path.join(ROOT, "i18n", "zh-fortune-palm.js")).zh;

const MAJOR = ["life", "head", "heart"];
const UNCLEAR = { th: "ไม่ชัดในภาพนี้", en: "Not clear in this photo", zh: "此照片中不清楚" };

/** synthetic hand (21 points) from the built-in guide template, rotated / scaled / mirrored */
function hand(side, rot, scale) {
  const sx = side === "right" ? -1 : 1, k = 100 * (scale || 1);
  return PC.handFromLandmarks(PC.GUIDE_HAND.map(p => { const x = p[0] * sx * k, y = p[1] * k; return [640 + x * Math.cos(rot) - y * Math.sin(rot), 600 + x * Math.sin(rot) + y * Math.cos(rot)]; }));
}
/** canonical palm image: flat skin tone with a smooth illumination gradient (no crease), optional dark creases drawn on templates */
function palmImage(F, creases) {
  const g = new Float32Array(F.w * F.h);
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) g[y * F.w + x] = 150 + 30 * x / F.w + 12 * y / F.h;
  for (const id of creases || []) {
    for (const p of PC.spline(PC.TEMPLATES[id].pts.map(F.uvToPx), 400)) {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = Math.round(p[0] + dx), y = Math.round(p[1] + dy); if (x < 0 || y < 0 || x >= F.w || y >= F.h) continue;
        const d = Math.hypot(dx, dy), i = y * F.w + x; g[i] = Math.min(g[i], g[i] - 45 * Math.exp(-d * d / 2.5));
      }
    }
  }
  return g;
}
function detect(h, creases) {
  const F = PC.palmFrame(h), R = PC.ridgeFilter(PC.localContrast(palmImage(F, creases), F.w, F.h, 12), F.w, F.h, [1.6, 2.4, 3.4], null);
  return { F, R, lines: PC.detectLines(R, F) };
}
const HANDS = [["left", 0, 1], ["right", 0, 1], ["left", 0.4, 1.3], ["right", -0.3, 0.8]];
const NAMES = { life: ["เส้นชีวิต"], head: ["เส้นสมอง"], heart: ["เส้นหัวใจ"], fate: ["เส้นวาสนา", "วาสนา"] };
/** every piece of text the reading shows or hands to the narrator */
function readingTexts(R, facts) {
  const rd = R.reading, out = [rd.personality, rd.work, rd.money, rd.love].concat(rd.highlights, rd.tips);
  rd.lines.forEach(l => { out.push(l.th, l.about); l.items.forEach(it => out.push(it.label, it.meaning)); });
  facts.items.forEach(it => { out.push(it.label, it.evidence, it.group, it.short || ""); Object.values(it.meanings).forEach(a => out.push(a.join(" "))); });
  out.push(facts.headline || "");
  return out.filter(Boolean).join("\n");
}
async function narrative(facts) {
  const res = await FA.compose(facts);
  assert.ok(res && Array.isArray(res.sections) && res.sections.length >= 2, "narrative not composed");
  return JSON.stringify(res);
}

test("H1: palm image with no crease -> heart / head / life / fate are not detected; each is in the 'not clear' state", () => {
  for (const [side, rot, sc] of HANDS) {
    const { lines } = detect(hand(side, rot, sc), null);
    for (const id of PC.LINE_IDS) {
      const L = lines[id], tag = `${side} rot ${rot} scale ${sc} ${id}`;
      assert.ok(L, tag + " missing");
      assert.equal(L.present, false, tag + ": drawn / read as detected although the image has no crease");
      assert.equal(L.unclear, true, tag + ": no 'not clear' state");
      assert.ok(L.auto && typeof L.auto.conf === "number" && L.auto.conf < 0.3, tag + ": detector score " + JSON.stringify(L.auto));
    }
  }
});

test("H1c control: creases drawn along life / head / heart are detected; fate (no crease) stays not clear", () => {
  for (const [side, rot, sc] of HANDS) {
    const { lines } = detect(hand(side, rot, sc), MAJOR);
    for (const id of MAJOR) {
      assert.equal(lines[id].present, true, `${side} ${rot} ${id}: a real crease was not detected ` + JSON.stringify(lines[id].auto));
      assert.ok(!lines[id].unclear, `${side} ${rot} ${id}: found line marked not clear`);
    }
    assert.equal(lines.fate.present, false, `${side} ${rot} fate found without a crease`);
    assert.equal(lines.fate.unclear, true, `${side} ${rot} fate not marked not clear`);
  }
});

test("H2: the reading never references a line in the 'not clear' state (all four, and heart alone)", async () => {
  // a) nothing found
  for (const [side, rot, sc] of HANDS) {
    const h = hand(side, rot, sc), d = detect(h, null);
    for (let seed = 0; seed < 4; seed++) {
      const R = PC.analyze({ hand: h, lines: d.lines, R: d.R, F: d.F, seed, side, isDominant: side === "right" });
      assert.deepEqual(R.reading.lines, [], "reading rows for unclear lines");
      for (const id of PC.LINE_IDS) assert.equal(R.lc.cats[id], undefined, id + " classified although not clear");
      for (const id of PC.LINE_IDS) assert.equal(R.lc.m[id], undefined, id + " measured into the reading although not clear");
      const facts = PC.buildFacts(R, { topic: ["overall", "love", "work", "money"][seed], side, isDominant: side === "right" });
      for (const it of facts.items) assert.ok(!/^(life|head|heart|fate)\./.test(it.id), "fact for an unclear line: " + it.id);
      const txt = readingTexts(R, facts) + "\n" + await narrative(facts);
      for (const id of PC.LINE_IDS) for (const n of NAMES[id]) assert.ok(!txt.includes(n), `${side} seed ${seed}: reading names ${n} (${id} not clear): ` + txt.slice(Math.max(0, txt.indexOf(n) - 60), txt.indexOf(n) + 60));
    }
  }
  // b) life + head found, heart not clear (no crease) -> heart never named, life/head are read
  const h = hand("left", 0, 1), d = detect(h, ["life", "head"]);
  assert.equal(d.lines.heart.unclear, true, "heart should be not clear");
  for (let seed = 0; seed < 4; seed++) {
    const R = PC.analyze({ hand: h, lines: d.lines, R: d.R, F: d.F, seed });
    assert.deepEqual(R.reading.lines.map(l => l.id).sort(), ["head", "life"]);
    const facts = PC.buildFacts(R, { topic: "love" });
    const txt = readingTexts(R, facts) + "\n" + await narrative(facts);
    assert.ok(!txt.includes("เส้นหัวใจ"), "heart named while not clear: " + txt.slice(Math.max(0, txt.indexOf("เส้นหัวใจ") - 60), txt.indexOf("เส้นหัวใจ") + 60));
    assert.ok(!txt.includes("เส้นวาสนา"), "fate named while not clear");
    assert.ok(txt.includes("เส้นชีวิต") && txt.includes("เส้นสมอง"), "found lines must still be read");
  }
});

test("H3: a fate line that is not found is never read as 'absent / no fate line'", async () => {
  const absentLabel = KB.lines.fate.cats.absent.label, absentMeaning = KB.lines.fate.cats.absent.meaning;
  const S = KB.summary.work;
  for (const creases of [null, MAJOR, ["life"]]) {
    for (const [side, rot, sc] of HANDS) {
      const h = hand(side, rot, sc), d = detect(h, creases);
      assert.equal(d.lines.fate.present, false); assert.equal(d.lines.fate.unclear, true);
      const R = PC.analyze({ hand: h, lines: d.lines, R: d.R, F: d.F, seed: 1 });
      assert.equal(R.lc.cats.fate, undefined, "fate classified: " + JSON.stringify(R.lc.cats.fate));
      assert.ok(!R.reading.lines.some(l => l.id === "fate"), "fate row in the reading");
      assert.ok(!R.reading.work.includes(S["fate.absent"]), "work summary reads an absent fate line");
      assert.ok(!R.reading.work.includes(S["fate.present"]), "work summary reads a present fate line");
      const facts = PC.buildFacts(R, { topic: "work" });
      assert.ok(!facts.items.some(it => it.id === "fate.absent" || /^fate\./.test(it.id)), "fate fact: " + facts.items.map(i => i.id).join(","));
      const txt = readingTexts(R, facts) + "\n" + await narrative(facts);
      assert.ok(!txt.includes(absentMeaning), "absent meaning in the reading");
      assert.ok(!txt.includes("มองไม่เห็นเส้นวาสนา") && !txt.includes("ไม่มีเส้นวาสนา") && !txt.includes(absentLabel), "reads 'no fate line'");
    }
  }
});

test("H4: the 'not clear' label is exact in TH / EN / ZH", () => {
  const src = fs.readFileSync(path.join(ROOT, "palm.js"), "utf8");
  assert.ok(src.includes('T("palm.line.unclear", "' + UNCLEAR.th + '")'), "TH label (palm.js default for key palm.line.unclear)");
  assert.equal(EN["palm.line.unclear"], UNCLEAR.en);
  assert.equal(ZH["palm.line.unclear"], UNCLEAR.zh);
});

// re-lock 2 (owner decisions 164 / 165 ก / 167, 2026-11-20): H5 now asserts the owner-approved text exactly (stricter than
// the placeholder); H6 the approved line note; H7 no confidence badge renderer; H8 the mount evidence wording (no "%")
const MEST = {
  th: "(ประเมินจากสัดส่วนนิ้วและฝ่ามือ มุมนิ้วโป้ง รูปเส้นหลักที่ใช้อ่าน และความเรียบของผิวในภาพ)",
  en: "(estimated from finger and palm proportions, thumb angle, the shape of the main lines used in the reading and skin smoothness in the photo)",
  zh: "（根据照片中手指和手掌的比例、拇指角度、用于解读的主线形状以及皮肤平滑度估算）"
};
const NOTE = {
  th: "เส้นที่แสดงเป็นการประมาณจากภาพ ผลอาจคลาดเคลื่อนได้ โปรดเทียบกับมือของคุณ และลากจุดกลมเพื่อปรับเส้นให้ตรงกับรอยจริงได้",
  en: "The lines shown are an estimate from the photo, and the result may not be accurate. Please compare them with your own hand; you can drag the round dots to move a line onto the real crease.",
  zh: "图中显示的掌纹是根据照片估算的，结果可能有误。请与自己的手对照，可以拖动圆点把线移到真实的纹路上。"
};
// re-lock 3 (owner decision 223, 2026-11-21): H6 asserts the new approved note (no "not measured" claim on the page;
// EN / ZH from the palm dictionaries) and that no "not measured" wording is left in it in TH / EN / ZH
const NOT_MEASURED = /ยังไม่ได้วัด|not (yet )?(been )?measured|has not been measured|尚未测量|未测量|尚未实测|尚未在真实手掌上测量/i;
const MOUNT_EV = "ประเมินจากสัดส่วนนิ้วและฝ่ามือ มุมนิ้วโป้ง รูปเส้นหลักที่ใช้อ่าน และความเรียบของผิวในภาพ";

test("H5 (owner decision 164): the mounts label is exactly the approved text in TH / EN / ZH", () => {
  const html = fs.readFileSync(path.join(ROOT, "palm.html"), "utf8");
  const m = html.match(/data-i18n="palm\.mestSmall">([^<]*)</);
  assert.ok(m, "mounts label missing in palm.html");
  assert.equal(m[1], MEST.th);
  assert.equal(EN["palm.mestSmall"], MEST.en);
  assert.equal(ZH["palm.mestSmall"], MEST.zh);
});

test("H6 (owner decision 165 ก): the line note is exactly the approved text in TH / EN / ZH, in the edit and result areas", () => {
  const html = fs.readFileSync(path.join(ROOT, "palm.html"), "utf8");
  const th = [...html.matchAll(/data-i18n="palm\.linesNote">([^<]*)</g)].map(x => x[1]);
  assert.equal(th.length, 2, "the note must appear twice (edit area and result area): " + th.length);
  for (const t of th) assert.equal(t, NOTE.th);
  assert.equal(EN["palm.linesNote"], NOTE.en);
  assert.equal(ZH["palm.linesNote"], NOTE.zh);
  // re-lock 3 (owner decision 223): the note no longer says the accuracy is "not measured", in any language
  for (const t of th.concat(EN["palm.linesNote"], ZH["palm.linesNote"])) assert.ok(!NOT_MEASURED.test(t), "note still says 'not measured': " + t);
});

test("H7 (owner decision 165 ก condition): palm.js renders no clear / faint / unclear confidence badge for a line", () => {
  const src = fs.readFileSync(path.join(ROOT, "palm.js"), "utf8");
  assert.ok(!/T\("palm\.conf\.(hi|mid|lo)"/.test(src), "a palm.conf.* badge is still rendered");
});

test("H8 (owner decision 167): mount evidence uses the approved wording and no '%' or level number", () => {
  assert.ok(KB.evidence.mountEst.startsWith(MOUNT_EV), KB.evidence.mountEst);
  assert.ok(!/%|\{level\}/.test(KB.evidence.mountEst), KB.evidence.mountEst);
  for (const [side, rot, sc] of HANDS) {
    const h = hand(side, rot, sc), d = detect(h, MAJOR);
    const R = PC.analyze({ hand: h, lines: d.lines, R: d.R, F: d.F, seed: 2 });
    const f = PC.buildFacts(R, {});
    const ms = f.items.filter(i => /^mount\./.test(i.id));
    assert.ok(ms.length >= 1, "no mount item");
    for (const it of ms) { assert.ok(it.evidence.includes(MOUNT_EV), it.evidence); assert.ok(!/%|\d/.test(it.evidence), "number in mount evidence: " + it.evidence); }
  }
});
