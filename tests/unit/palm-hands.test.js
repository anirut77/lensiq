"use strict";
// tests/unit/palm-hands.test.js — palm reading: left/right hand resolution, hand-shaped guide outline, deeper palmistry measures,
// estimated mounts + bagua, two-hand comparison and the facts contract for fortune-ai.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const KB = require(path.join(ROOT, "palm-kb.js"));
global.PALM_KB = KB;
const PC = require(path.join(ROOT, "palm.js"));
const FA = require(path.join(ROOT, "fortune-ai.js"));

const W = 1280, H = 720;
/** 21 synthetic landmarks of a palm-facing hand in a RAW (unmirrored) frame, rotated by rot around the wrist and scaled. */
function hand(side, { rot = 0, scale = 1, at = [640, 600], fingers = null, thumbOpen = 0 } = {}) {
  const base = PC.GUIDE_HAND.map(p => [p[0], p[1]]);
  if (fingers) { // lengthen/shorten fingers: {index: k, ...} multiplies MCP→joint vectors
    const F = { index: 5, middle: 9, ring: 13, pinky: 17 };
    for (const [f, k] of Object.entries(fingers)) { const b = base[F[f]]; for (let j = 1; j <= 3; j++) { const p = base[F[f] + j]; base[F[f] + j] = [b[0] + (p[0] - b[0]) * k, b[1] + (p[1] - b[1]) * k]; } }
  }
  if (thumbOpen) { // rotate thumb joints around the thumb CMC (positive = away from index)
    const c = base[1], a = -thumbOpen * Math.PI / 180;
    for (let j = 2; j <= 4; j++) { const p = base[j], x = p[0] - c[0], y = p[1] - c[1]; base[j] = [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]; }
  }
  const sx = side === "right" ? -1 : 1, k = 100 * scale;
  return base.map(p => { const x = p[0] * sx * k, y = p[1] * k; return [at[0] + x * Math.cos(rot) - y * Math.sin(rot), at[1] + x * Math.sin(rot) + y * Math.cos(rot)]; });
}
const mirrorPts = pts => pts.map(p => [W - p[0], p[1]]);

/* ---------------- handedness ---------------- */
test("resolveSide: left/right x unmirrored/mirrored input, several rotations", () => {
  for (const side of ["left", "right"]) for (const rot of [-0.6, 0, 0.5, 1.2]) {
    const pts = hand(side, { rot });
    const r = PC.resolveSide({ pts });
    assert.equal(r.side, side, `${side} rot ${rot}`);
    assert.equal(r.source, "geometry"); assert.ok(r.conf > 0.5); assert.equal(r.thumbOk, true);
    // a horizontally mirrored image (selfie photo) of the same hand looks like the other hand ...
    const m = mirrorPts(pts);
    assert.equal(PC.resolveSide({ pts: m }).side, PC.flipSide(side));
    // ... unless we say the coordinates come from a mirrored image
    assert.equal(PC.resolveSide({ pts: m, mirrored: true }).side, side);
  }
});

test("resolveSide: MediaPipe handedness (mirrored convention) is flipped for raw frames and only breaks ties", () => {
  const pts = hand("right");
  // MediaPipe on a raw (unmirrored) frame of a right hand reports 'Left' (score < 0.5)
  const agree = PC.resolveSide({ pts, handedness: 0.05 });
  assert.equal(agree.side, "right"); assert.equal(agree.agree, true); assert.equal(agree.maybeBack, false);
  // a confident contradicting label does not override clear geometry, it only flags a possible back-of-hand view
  const clash = PC.resolveSide({ pts, handedness: 0.97 });
  assert.equal(clash.side, "right"); assert.equal(clash.agree, false); assert.equal(clash.maybeBack, true);
  // mirrored input: the label is used as-is
  assert.equal(PC.resolveSide({ pts: mirrorPts(pts), mirrored: true, handedness: 0.97 }).agree, true);
  // degenerate geometry (fingers folded onto the index-pinky axis) -> the model label decides
  const flat = pts.map(p => p.slice()); const w = flat[0];
  [5, 9, 13, 17].forEach(i => { flat[i] = [flat[i][0], w[1] - 0.001 * (flat[i][0] - w[0])]; });
  const r = PC.resolveSide({ pts: flat, handedness: 0.9 });
  assert.equal(r.source, "model"); assert.equal(r.side, "left");
  assert.equal(PC.resolveSide({ pts: flat, handedness: 0.9, mirrored: true }).side, "right");
});

test("resolveSide: thumb on the wrong side lowers confidence; tap hands (no thumb) still resolve", () => {
  const pts = hand("left");
  const bad = pts.slice(); bad[4] = [pts[17][0] + 80, pts[17][1]];
  const r = PC.resolveSide({ pts: bad });
  assert.equal(r.thumbOk, false); assert.ok(r.conf < PC.resolveSide({ pts }).conf);
  const t = PC.handFromTaps({ wrist: [200, 400], indexBase: [260, 215], pinkyBase: [150, 200], indexTip: [262, 90], middleTip: [225, 70], ringTip: [190, 85], pinkyTip: [150, 130] });
  assert.equal(PC.resolveSide({ hand: t }).side, "right");
  assert.equal(PC.guessSide(PC.handFromLandmarks(hand("left"))), "left");
});

test("synthHand(box, side) gives a hand of that side (fake detector seam)", () => {
  const box = { x: 100, y: 50, w: 300, h: 400 };
  assert.equal(PC.resolveSide({ pts: PC.synthHand(box) }).side, "left");
  assert.equal(PC.resolveSide({ pts: PC.synthHand(box, "left") }).side, "left");
  assert.equal(PC.resolveSide({ pts: PC.synthHand(box, "right") }).side, "right");
  const bl = PC.handBox(PC.synthHand(box, "left")), br = PC.handBox(PC.synthHand(box, "right"));
  for (const k of ["y", "w", "h"]) assert.ok(Math.abs(bl[k] - br[k]) < 1e-9, k);
  assert.ok(Math.abs((bl.x - box.x) - (box.x + box.w - br.x - br.w)) < 1e-9, "mirrored inside the box");
});

/* ---------------- guide outline ---------------- */
test("guideTemplate: left and right are mirror images; the template itself resolves to its side", () => {
  const L = PC.guideTemplate("left", W, H), R = PC.guideTemplate("right", W, H);
  L.raw.forEach((p, i) => { assert.ok(Math.abs(p[0] - (W - R.raw[i][0])) < 1e-6 && Math.abs(p[1] - R.raw[i][1]) < 1e-6); });
  L.contour.forEach((p, i) => { assert.ok(Math.abs(p[0] - (W - R.contour[i][0])) < 1e-6 && Math.abs(p[1] - R.contour[i][1]) < 1e-6); });
  assert.equal(PC.resolveSide({ pts: L.raw }).side, "left");
  assert.equal(PC.resolveSide({ pts: R.raw }).side, "right");
  assert.ok(L.contour.length > 40);
  // thumb on the index side, outside the palm
  assert.ok(L.raw[4][0] < L.raw[5][0] && R.raw[4][0] > R.raw[5][0]);
});

test("guideTemplate: mirrored preview flips only the display coordinates (overlay is CSS-mirrored with the video)", () => {
  for (const side of ["left", "right"]) {
    const a = PC.guideTemplate(side, W, H, { mirrored: false }), b = PC.guideTemplate(side, W, H, { mirrored: true });
    assert.deepEqual(a.raw, b.raw); // drawing coordinates are identical
    b.display.forEach((p, i) => assert.ok(Math.abs(p[0] - (W - a.display[i][0])) < 1e-9));
    assert.notEqual(a.thumbOnScreen, b.thumbOnScreen);
  }
  // front camera, right hand: the user sees the thumb on the screen's left (like a mirror)
  assert.equal(PC.guideTemplate("right", W, H, { mirrored: true }).thumbOnScreen, "left");
  assert.equal(PC.guideTemplate("right", W, H, { mirrored: false }).thumbOnScreen, "right");
});

test("guideTemplate scales to the frame aspect and stays inside it", () => {
  for (const [w, h] of [[1280, 720], [720, 1280], [390, 844], [640, 480]]) {
    const t = PC.guideTemplate("left", w, h);
    const xs = t.contour.map(p => p[0]), ys = t.contour.map(p => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= w && Math.min(...ys) >= 0 && Math.max(...ys) <= h, `${w}x${h} inside`);
    assert.ok(bw <= w * 0.62 + 1e-6 && bh <= h * 0.84 + 1e-6);
    assert.ok(Math.abs(bw - w * 0.62) < 1e-6 || Math.abs(bh - h * 0.84) < 1e-6, "fills one dimension");
    assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - w / 2) < 1e-6, "centred");
  }
  const portrait = PC.guideTemplate("left", 720, 1280), land = PC.guideTemplate("left", 1280, 720);
  assert.ok(portrait.palmW / 720 > land.palmW / 1280, "portrait: hand uses more of the width");
});

test("fitScore: 1 on the template, drops with offset, scale and the wrong hand", () => {
  const t = PC.guideTemplate("right", W, H);
  assert.equal(PC.fitScore(t.raw, t), 1);
  const shifted = t.raw.map(p => [p[0] + t.palmW * 0.3, p[1]]);
  const f1 = PC.fitScore(shifted, t);
  assert.ok(f1 > 0.55 && f1 < 0.75, String(f1));
  const other = PC.guideTemplate("left", W, H);
  assert.ok(PC.fitScore(other.raw, t) < 0.4, "left hand in a right-hand outline fits poorly");
  assert.equal(PC.fitScore(null, t), 0);
});

/* ---------------- hand shape & finger measures ---------------- */
test("hand shape: element quadrants from palm ratio and finger length measured on landmarks", () => {
  const mk = (palmK, fingK) => {
    const pts = hand("left").map(p => p.slice()), w = pts[0];
    const out = pts.map(p => [w[0] + (p[0] - w[0]), w[1] + (p[1] - w[1]) * palmK]); // stretch palm vertically
    [5, 9, 13, 17].forEach(b => { for (let j = 1; j <= 3; j++) { const p = pts[b + j], q = pts[b]; out[b + j] = [out[b][0] + (p[0] - q[0]) * fingK * palmK, out[b][1] + (p[1] - q[1]) * fingK * palmK]; } }); // finger length relative to the palm
    return PC.handElement(PC.measureHand(PC.handFromLandmarks(out))).top.id;
  };
  assert.equal(mk(0.82, 0.85), "earth");
  assert.equal(mk(0.82, 1.2), "air");
  assert.equal(mk(1.2, 0.85), "fire");
  assert.equal(mk(1.2, 1.2), "water");
});

test("finger measures: dominant finger, pinky, thumb angle and spread categories", () => {
  const m0 = PC.measureHand(PC.handFromLandmarks(hand("left")));
  assert.equal(PC.fingerDom(m0).id, "balanced");
  assert.equal(PC.pinkyCat(m0), "medium");
  assert.equal(PC.thumbAngleCat(m0), "medium");
  assert.equal(PC.spreadCat(m0), "medium");
  assert.ok(Math.abs(m0.palmRatio - PC.NORMS.palm) < 0.05);
  const dom = f => PC.fingerDom(PC.measureHand(PC.handFromLandmarks(hand("right", { fingers: { [f]: 1.15 } })))).id;
  assert.equal(dom("index"), "jupiter"); assert.equal(dom("middle"), "saturn"); assert.equal(dom("ring"), "apollo"); assert.equal(dom("pinky"), "mercury");
  assert.equal(PC.pinkyCat(PC.measureHand(PC.handFromLandmarks(hand("left", { fingers: { pinky: 1.12 } })))), "long");
  assert.equal(PC.pinkyCat(PC.measureHand(PC.handFromLandmarks(hand("left", { fingers: { pinky: 0.85 } })))), "short");
  assert.equal(PC.thumbAngleCat(PC.measureHand(PC.handFromLandmarks(hand("left", { thumbOpen: 30 })))), "wide");
  assert.equal(PC.thumbAngleCat(PC.measureHand(PC.handFromLandmarks(hand("left", { thumbOpen: -20 })))), "narrow");
  // measures do not depend on the side or rotation
  const mr = PC.measureHand(PC.handFromLandmarks(hand("right", { rot: 0.7, scale: 1.6 })));
  for (const k of ["palmRatio", "fingerRatio", "thumbAngle", "spread", "pinkyRing", "indexRing"]) assert.ok(Math.abs(mr[k] - m0[k]) < 1e-6, k);
  // tap hands: no thumb angle
  const t = PC.measureHand(PC.handFromTaps({ wrist: [200, 400], indexBase: [150, 200], pinkyBase: [260, 215], indexTip: [150, 90], middleTip: [190, 70], ringTip: [225, 85], pinkyTip: [262, 130] }));
  assert.equal(t.thumbAngle, null); assert.equal(PC.thumbAngleCat(t), "na"); assert.ok(t.spread > 0);
});

/* ---------------- mounts, comparison, facts ---------------- */
const LINES = Object.fromEntries(PC.LINE_IDS.map(id => [id, { cp: PC.TEMPLATES[id].pts, present: true }]));
test("estimateMounts: finger-linked mounts follow finger length; level 0..100; 1-2 top mounts with a bagua palace", () => {
  const R = PC.analyze({ hand: PC.handFromLandmarks(hand("left", { fingers: { index: 1.2 } })), lines: LINES });
  assert.equal(R.mounts.ranked.length, 7);
  assert.equal(R.mounts.top[0], "jupiter");
  assert.ok(R.mounts.top.length >= 1 && R.mounts.top.length <= 2);
  R.mounts.ranked.forEach(r => assert.ok(r.level >= 0 && r.level <= 100));
  for (const k of PC.MOUNT_IDS) assert.ok(KB.bagua[KB.mountBagua[k]], k);
  const rd = R.reading;
  assert.ok(rd.mountsEst.length === 7 && rd.mountsEst[0].top && rd.mountsEst[0].bagua.cn === "巽");
  assert.ok(rd.fingerDom.cat === "jupiter" && rd.pinky && rd.thumbAngle && rd.spread);
});

test("compareHands / buildComparison: same hands vs different hands, positive wording", () => {
  const A = PC.analyze({ hand: PC.handFromLandmarks(hand("left")), lines: LINES, side: "left", isDominant: false });
  const A2 = PC.analyze({ hand: PC.handFromLandmarks(hand("right")), lines: LINES, side: "right", isDominant: true });
  const same = PC.compareHands(A, A2);
  assert.equal(same.same, same.total); assert.equal(same.similar, true);
  const l2 = JSON.parse(JSON.stringify(LINES));
  l2.head.cp = [[0.05, 0.36], [0.2, 0.45], [0.33, 0.56], [0.43, 0.68], [0.5, 0.78]];
  l2.heart.cp = [[1.1, 0.25], [0.85, 0.18], [0.6, 0.13], [0.3, 0.12], [0.02, 0.1]];
  l2.fate.present = false;
  const B = PC.analyze({ hand: PC.handFromLandmarks(hand("right", { fingers: { middle: 1.3, ring: 1.25 }, thumbOpen: 30 })), lines: l2, side: "right", isDominant: true });
  const diff = PC.compareHands(A, B);
  assert.ok(diff.same < diff.total && diff.similar === false, JSON.stringify(diff.rows));
  for (let seed = 0; seed < 6; seed++) {
    const c = PC.buildComparison(A, B, { sideA: "มือซ้าย", sideB: "มือขวา", seed });
    assert.ok(c.title.includes("ศักยภาพที่ติดตัว") && c.title.includes("สิ่งที่สร้างขึ้นเอง"));
    assert.ok(c.paragraphs.length >= 4);
    const txt = c.paragraphs.join(" ");
    assert.ok(FA.safety.isSafe(txt), txt); assert.ok(!/[{}]/.test(txt), txt);
    assert.ok(/มือซ้าย/.test(txt) || /ติดตัว/.test(txt));
  }
});

const BANNED = ["ตาย", "เสียชีวิต", "อายุขัย", "อายุสั้น", "อายุยืน", "โรค", "ป่วย", "สุขภาพ", "อุบัติเหตุ", "เคราะห์", "นอกใจ", "หย่า", "เลิกรา", "อัปมงคล", "ซวย", "ล้มละลาย", "มะเร็ง", "อันตราย", "ภัย", "หายนะ", "ผิดหวัง", "ยากจน", "ชู้", "โชคร้าย", "วิบัติ", "ขาดทุน", "ตกงาน", "หวย", "เลขเด็ด"];
test("KB: new palmistry phrasings are complete, varied and safe", () => {
  const need = {};
  ["wide", "medium", "narrow"].forEach(c => { need["thumbangle." + c] = 3; });
  ["long", "medium", "short"].forEach(c => { need["pinky." + c] = 3; });
  Object.keys(KB.fingerDom).forEach(c => { need["fingerdom." + c] = 3; });
  Object.keys(KB.spread).forEach(c => { need["spread." + c] = 3; });
  new Set(Object.values(KB.mountBagua)).forEach(b => { need["bagua." + b] = 3; });
  need["compare.same"] = 3; need["compare.shift"] = 3;
  let n = 0;
  for (const [id, minTags] of Object.entries(need)) {
    const o = KB.interp[id]; assert.ok(o, "missing " + id);
    assert.ok(Object.keys(o).length >= minTags, id);
    for (const [tg, arr] of Object.entries(o)) {
      assert.ok(FA.SECTION_IDS.includes(tg), id + "." + tg);
      assert.ok(arr.length >= 3 && new Set(arr).size === arr.length, id + "." + tg);
      for (const s of arr) { n++; assert.ok(FA.safety.isSafe(s), s); for (const b of BANNED) assert.ok(!s.includes(b), `${id}.${tg}: ${b}`); assert.ok(!/\d{2,}/.test(s), "no numbers: " + s); }
    }
  }
  assert.ok(n >= 250, "new phrasings " + n);
  const walk = (o, k) => { if (k === "ethics" || k === "sources") return; if (typeof o === "string") { for (const b of BANNED) assert.ok(!o.includes(b), k + ": " + b + " in " + o.slice(0, 40)); } else if (o && typeof o === "object") for (const kk of Object.keys(o)) walk(o[kk], kk); };
  for (const k of ["hands", "thumbAngle", "pinky", "fingerDom", "spread", "bagua", "compare", "mountEstNote", "sides"]) walk(KB[k], k);
  assert.ok(KB.hands.tradition.some(t => /ชายดูมือซ้าย หญิงดูมือขวา/.test(t.t)));
  assert.ok(KB.hands.tradition.some(t => /ไม่ถนัด/.test(t.t) && /ถนัด/.test(t.t)));
  assert.equal(KB.sides.other.short, "ศักยภาพที่ติดตัว"); assert.equal(KB.sides.dominant.short, "สิ่งที่สร้างขึ้นเอง");
});

test("buildFacts: new items wired into the facts contract; composer uses them; compare item on the second hand", () => {
  const A = PC.analyze({ hand: PC.handFromLandmarks(hand("left", { thumbOpen: 30 })), lines: LINES, side: "left", isDominant: false, mounts: ["venus"] });
  const B = PC.analyze({ hand: PC.handFromLandmarks(hand("right", { fingers: { index: 1.2 } })), lines: LINES, side: "right", isDominant: true });
  const f = PC.buildFacts(B, { topic: "work", side: "right", isDominant: true, mounts: ["venus"], compare: { first: A, sideA: "มือซ้าย", sideB: "มือขวา" } });
  const ids = f.items.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, "unique ids");
  for (const want of ["thumbangle.medium", "pinky.medium", "fingerdom.jupiter", "spread.medium", "mount.venus", "mount.jupiter", "bagua.gen", "bagua.xun", "side.dominant"]) assert.ok(ids.includes(want), want + " in " + ids.join(","));
  assert.ok(ids.some(i => /^compare\.(same|shift)$/.test(i)));
  for (const it of f.items) {
    assert.ok(KB.interp[it.id], "KB has " + it.id);
    assert.ok(!/[()]/.test(it.label) && !/[{}()]/.test(it.evidence), it.id);
    assert.ok(it.strength >= 0 && it.strength <= 1);
  }
  const jm = f.items.find(i => i.id === "mount.jupiter"); assert.match(jm.evidence, /ประเมินจากภาพ/);
  const vm = f.items.find(i => i.id === "mount.venus"); assert.match(vm.label, /อิ่มเด่น/);
  const fa = PC.buildFacts(A, { side: "left", isDominant: false });
  assert.ok(fa.items.some(i => i.id === "thumbangle.wide"));
  assert.ok(!fa.items.some(i => i.id.startsWith("compare.")));
  // the local composer weaves the new items into the prose
  let hit = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const r = FA.compose(f, { seed }), txt = r.sections.map(s => s.paragraphs.join(" ")).join(" ");
    assert.ok(FA.safety.isSafe(txt));
    const mine = f.items.filter(i => /^(thumbangle|pinky|fingerdom|spread|bagua|compare)\./.test(i.id));
    if (mine.some(it => Object.values(it.meanings).flat().some(m => txt.includes(m.replace(/[.\s]+$/, "").slice(0, 25))))) hit++;
  }
  assert.ok(hit >= 6, "composer used new items in " + hit + "/8 readings");
});
