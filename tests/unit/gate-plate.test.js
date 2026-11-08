"use strict";
// tests/unit/gate-plate.test.js — lensiq-plate.js (LENSIQ Gate): Thai plate parser / validator, look-alike fuzzy match,
// multi-frame voting, CTC decode, OCR line picking, 77-province pick-list, classical plate finder on a synthetic frame,
// text-band split, retention purge, hash-chained correction audit, CSV safety and the on-site accuracy report.
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../../lensiq-plate.js");

test("parse: car plates (optional digit + 2 consonants + 1-4 digits), formatting, invalid reads dropped", () => {
  const a = P.parse("1กข 2345");
  assert.equal(a.ok, true); assert.equal(a.key, "1กข2345"); assert.equal(a.line1, "1กข 2345"); assert.equal(a.prefix, "1");
  assert.equal(P.parse("กข-12").key, "กข12");
  assert.equal(P.parse(" ๑กข ๒๓๔๕ ").key, "1กข2345", "Thai digits");
  for (const bad of ["", "1234", "กขค1234", "กข01234", "กข12345", "กข0", "0กข12", "ABC123", "กข 12a", "ฃข 12"]) assert.equal(P.parse(bad).ok, false, bad);
  const legacy = P.parse("ก 1234");
  assert.equal(legacy.ok, true); assert.equal(legacy.legacy, true);
  assert.equal(P.format("2ขค99"), "2ขค 99");
});

test("parse: Latin look-alikes in the number part are repaired (O->0, B->8, I->1)", () => {
  assert.equal(P.parse("กข 1O5B").key, "กข1058");
  assert.equal(P.parse("Iกข 23").key, "1กข23");
  assert.equal(P.parse("กข I2").key, "กข12");
});

test("parse: motorcycle 3-line plates (letters line + digits line)", () => {
  const m = P.parse("1กข 123", { moto: true });
  assert.equal(m.ok, true); assert.equal(m.kind, "moto");
  assert.equal(P.parse("กขค 45", { moto: true }).ok, true, "3 consonants on a motorcycle");
  assert.equal(P.parse("กขค 45").ok, false, "3 consonants is not a car plate");
});

test("provinces: 77 + Betong, unique ids, common-first pick-list, names in th/en, fuzzy province guess", () => {
  assert.equal(P.PROVINCES.length, 78);
  assert.equal(new Set(P.PROVINCES.map(p => p.id)).size, 78);
  assert.equal(new Set(P.PROVINCES.map(p => p.th)).size, 78);
  const l = P.provinceList(["chonburi", "bangkok", "nope"]);
  assert.deepEqual(l.slice(0, 2).map(p => p.id), ["chonburi", "bangkok"]);
  assert.equal(l.length, 78);
  assert.equal(P.provinceName("bangkok", "en"), "Bangkok");
  assert.equal(P.provinceName("bangkok"), "กรุงเทพมหานคร");
  assert.equal(P.guessProvince("กรุงเทพมหานศร").id, "bangkok", "one wrong letter");
  assert.equal(P.guessProvince("ชลบุร").id, "chonburi");
  assert.equal(P.guessProvince("xx"), null);
});

test("fuzzy match: edit distance 1 + Thai / Latin look-alike pairs at half cost; province optional", () => {
  assert.equal(P.plateDist("กข1234", "กข1234"), 0);
  assert.equal(P.plateDist("กข1234", "กช1234"), 0.5, "ข/ช look-alike");
  assert.equal(P.plateDist("ดบ1234", "ตป1234"), 1, "two look-alikes");
  assert.equal(P.plateDist("กข1234", "กข124"), 1, "deletion");
  assert.equal(P.plateDist("กข1234", "กค1234"), 1);
  for (const [a, b] of [["ผ", "ฝ"], ["ภ", "ถ"], ["ม", "ฆ"], ["0", "O"], ["8", "B"], ["1", "I"]]) assert.ok(P.lookalike(a, b) && P.lookalike(b, a), a + b);
  const list = [{ key: "กข1234", province: "bangkok", n: 1 }, { key: "กช1234", province: "chonburi", n: 2 }, { key: "ขข9", n: 3 }];
  const m = P.match({ key: "กข1234" }, list);
  assert.deepEqual(m.map(x => [x.item.n, x.dist]), [[1, 0], [2, 0.5]]);
  assert.equal(m[0].provinceOk, null, "read without province: guard checks");
  const mp = P.match({ key: "กช1234", province: "bangkok" }, list);
  assert.deepEqual(mp.map(x => x.item.n), [1], "province mismatch excluded");
  assert.equal(P.match({ key: "กช1234", province: "bangkok" }, list, { ignoreProvince: true }).length, 2);
  assert.deepEqual(P.match("กข5678", list), []);
});

test("vote: per-character weighted vote across frames repairs a single bad frame; agreement + weak positions", () => {
  const fr = (key, p = 0.9, low = {}) => ({ key, conf: p, chars: [...key].map((c, i) => ({ c, p: low[i] || p })) });
  const v = P.vote([fr("กข1234"), fr("กช1234", 0.6, { 1: 0.4 }), fr("กข1234"), fr("กข1284", 0.7), fr("กข1234")]);
  assert.equal(v.key, "กข1234"); assert.equal(v.n, 5); assert.equal(v.agree, 0.6); assert.equal(v.line1, "กข 1234");
  assert.ok(v.conf > 0.7 && v.conf <= 1, String(v.conf));
  const w = P.vote([fr("กข12"), fr("กช34")]);
  assert.ok(w.low.length >= 1, "weak positions flagged " + JSON.stringify(w));
  assert.equal(P.vote([]), null);
  const one = P.vote([fr("1กข2345", 0.95)]);
  assert.equal(one.key, "1กข2345"); assert.equal(one.agree, 1);
});

test("ctcDecode: blank collapse, repeats, space class, logits or probabilities", () => {
  const dict = ["ก", "ข", "1", "2"]; const C = dict.length + 2, seq = [1, 1, 0, 2, 0, 3, 3, 5, 4];
  const probs = new Float32Array(seq.length * C);
  seq.forEach((c, t) => { for (let k = 0; k < C; k++) probs[t * C + k] = k === c ? 0.9 : 0.1 / (C - 1); });
  const r = P.ctcDecode(probs, seq.length, C, dict);
  assert.equal(r.text, "กข1 2"); assert.equal(r.chars.length, 5); assert.ok(Math.abs(r.conf - 0.9) < 1e-3);
  const logits = probs.map(v => Math.log(v) + 3);
  assert.equal(P.ctcDecode(logits, seq.length, C, dict).text, "กข1 2");
});

test("fromOcr: picks the plate line, keeps per-char probabilities, province text; motorcycle joins line 1 + 3", () => {
  const L = (text, p = 0.9) => ({ text, conf: p, chars: [...text].map(c => ({ c, p })) });
  const r = P.fromOcr([L("1กข 2345"), L("กรุงเทพมหานคร")]);
  assert.equal(r.key, "1กข2345"); assert.equal(r.provinceText, "กรุงเทพมหานคร"); assert.equal(r.chars.length, 7);
  assert.equal(P.fromOcr([L("·กข1234-")]).key, "กข1234", "noise around the plate stripped");
  const m = P.fromOcr([L("1กข"), L("ชลบุรี"), L("123")], { moto: true });
  assert.equal(m.key, "1กข123"); assert.equal(m.provinceText, "ชลบุรี");
  assert.equal(P.fromOcr([L("ABC")]), null);
});

function synth(W, H, plate) {
  const g = new Uint8Array(W * H);
  let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < g.length; i++) g[i] = 70 + Math.floor(rnd() * 12);
  const { x, y, w, h } = plate;
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy * W + xx] = 235;
  // character strokes: dark vertical bars in the upper 60 %, a thinner row of strokes below (province)
  for (let k = 0; k < 7; k++) {
    const bx = x + 6 + k * Math.floor((w - 12) / 7);
    for (let yy = y + 3; yy < y + Math.floor(h * 0.6); yy++) for (let xx = bx; xx < bx + 3; xx++) g[yy * W + xx] = 20;
  }
  for (let k = 0; k < 10; k++) {
    const bx = x + 8 + k * Math.floor((w - 16) / 10);
    for (let yy = y + Math.floor(h * 0.7); yy < y + h - 3; yy++) for (let xx = bx; xx < bx + 2; xx++) g[yy * W + xx] = 30;
  }
  return g;
}
const iou = (a, b) => { const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h); const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1); return i / (a.w * a.h + b.w * b.h - i); };

test("findCandidates: the classical finder locates a synthetic plate; a flat frame yields nothing", () => {
  const W = 320, H = 180, plate = { x: 120, y: 100, w: 80, h: 36 };
  const c = P.findCandidates(synth(W, H, plate), W, H);
  assert.ok(c.length >= 1, "found nothing");
  const truth = { x: plate.x / W, y: plate.y / H, w: plate.w / W, h: plate.h / H };
  assert.ok(iou(c[0], truth) > 0.4, "best box " + JSON.stringify(c[0]) + " IoU " + iou(c[0], truth).toFixed(2));
  assert.deepEqual(P.findCandidates(new Uint8Array(W * H).fill(90), W, H), []);
});

test("splitLines: two text bands inside a plate crop; fallback split when nothing is found", () => {
  const W = 80, H = 36, g = synth(W, H, { x: 0, y: 0, w: W, h: H });
  const b = P.splitLines(g, W, H);
  assert.equal(b.length, 2, JSON.stringify(b));
  assert.ok(b[0].y1 <= b[1].y0);
  assert.equal(P.splitLines(new Uint8Array(W * H).fill(200), W, H).length, 2, "fallback 62/38 split");
});

test("isNight / lumaMean: dark frame or 18:00-06:00 clock", () => {
  assert.equal(P.isNight(0, { luma: 30 }), true);
  assert.equal(P.isNight(0, { luma: 140 }), false);
  assert.equal(P.isNight(new Date(2026, 0, 1, 22).getTime()), true);
  assert.equal(P.isNight(new Date(2026, 0, 1, 12).getTime()), false);
  assert.equal(P.lumaMean(new Uint8Array([0, 100, 200])), 100);
});

test("purge: images 7-30 days, logs configurable, receipts 5 years; unknown kinds kept", () => {
  const now = Date.UTC(2026, 10, 8), d = 86400000;
  const recs = [{ id: 1, kind: "img", at: now - 8 * d }, { id: 2, kind: "img", at: now - 6 * d }, { id: 3, kind: "ev", at: now - 100 * d },
    { id: 4, kind: "ev", at: now - 80 * d }, { id: 5, kind: "rc", at: now - 4 * 365 * d }, { id: 6, kind: "rc", at: now - 6 * 365 * d }, { id: 7, kind: "cfg", at: 0 }];
  const r = P.purge(recs, now, { imgDays: 7, logDays: 90, receiptYears: 5 });
  assert.deepEqual(r.drop.map(x => x.id), [1, 3, 6]);
  assert.deepEqual(P.purge(recs, now, { imgDays: 99 }).drop.filter(x => x.kind === "img").map(x => x.id), [], "image cap 30 days");
  assert.deepEqual(P.purge([{ id: 1, kind: "img", at: now - 31 * d }], now, { imgDays: 99 }).drop.length, 1);
});

test("audit: append-only hash chain; editing, removing or reordering an entry is detected", () => {
  let chain = [];
  for (const [f, t] of [["กข1234", "กข1284"], ["bangkok", "chonburi"], ["กข1284", "กข1234"]]) chain = chain.concat(P.auditAppend(chain, { ref: "ev1", field: "plate", from: f, to: t, by: "guard A", at: 1000 + chain.length }));
  assert.equal(chain.length, 3); assert.equal(chain[2].seq, 3); assert.equal(chain[1].prev, chain[0].hash);
  assert.deepEqual(P.auditVerify(chain), { ok: true, bad: null });
  const edited = chain.map((e, i) => (i === 1 ? { ...e, to: "rayong" } : e));
  assert.deepEqual(P.auditVerify(edited), { ok: false, bad: 2 });
  assert.equal(P.auditVerify([chain[0], chain[2]]).ok, false, "removed entry");
  assert.equal(P.auditVerify([chain[1], chain[0], chain[2]]).ok, false, "reordered");
});

test("toCSV: BOM, quoting, formula injection guard, numbers untouched", () => {
  const s = P.toCSV([{ a: "=HYPERLINK(1)", b: 'x,"y"', c: -12.5 }, { a: "+1", b: "ok", c: 3 }], [{ k: "a" }, { k: "b", label: "B" }, { k: "c" }]);
  assert.equal(s, "﻿a,B,c\r\n'=HYPERLINK(1),\"x,\"\"y\"\"\",-12.5\r\n'+1,ok,3");
});

test("accuracy: plate-level, char-level, day/night split, province; CI-aware verdict from lensiq-sitecheck", () => {
  const rows = [];
  for (let i = 0; i < 160; i++) rows.push({ read: "กข" + (1000 + i), truth: "กข" + (1000 + i), night: i % 4 === 0, provRead: "bangkok", provTruth: "bangkok" });
  let r = P.accuracy(rows);
  assert.equal(r.n, 160); assert.equal(r.plate.p, 1); assert.equal(r.char.p, 1); assert.equal(r.night.n, 40); assert.equal(r.day.n, 120);
  assert.equal(r.verdict, "pass");
  const bad = rows.map((x, i) => (i % 5 === 0 ? { ...x, read: "กช" + x.truth.slice(2) } : x));
  r = P.accuracy(bad);
  assert.ok(Math.abs(r.plate.p - 0.8) < 1e-9, String(r.plate.p));
  assert.ok(Math.abs(r.char.p - (1 - 32 / (160 * 6))) < 1e-9, "1 wrong char of 6 in 32 reads");
  assert.equal(r.verdict, "fail");
  const few = P.accuracy(rows.slice(0, 20));
  assert.ok(["ontrack", "more"].includes(few.verdict) && few.need.some(n => n.group === "reads"), JSON.stringify(few.need));
  const ticks = P.accuracy([{ read: "กข1", ok: true }, { read: "กข2", ok: false, truth: "กข3" }]);
  assert.equal(ticks.plate.x, 1); assert.equal(ticks.plate.n, 2);
  assert.deepEqual(ticks.metrics.map(m => m.k), ["plate", "char", "day", "night", "province"]);
});

test("trimBorder: skips dark margins around the plate and its frame line", () => {
  const W = 120, H = 60, g = new Uint8Array(W * H).fill(60); // car body
  for (let y = 8; y < 52; y++) for (let x = 10; x < 110; x++) g[y * W + x] = 240; // plate
  for (let y = 10; y < 50; y++) for (const x of [12, 13, 106, 107]) g[y * W + x] = 15; // frame (left / right)
  for (let x = 12; x < 108; x++) for (const y of [10, 11, 48, 49]) g[y * W + x] = 15; // frame (top / bottom)
  const t = P.trimBorder(g, W, H);
  assert.ok(t.x0 >= 14 && t.x0 <= 18 && t.x1 <= 106 && t.x1 >= 102, JSON.stringify(t));
  assert.ok(t.y0 >= 12 && t.y0 <= 16 && t.y1 <= 48 && t.y1 >= 44, JSON.stringify(t));
  const flat = P.trimBorder(new Uint8Array(W * H).fill(200), W, H);
  assert.deepEqual(flat, { x0: 0, y0: 0, x1: W, y1: H });
});

test("leading digit: plates with and without the optional 1-9 prefix parse; motorcycles keep their prefix", () => {
  for (const [s, key] of [["1กข 2345", "1กข2345"], ["กข 2345", "กข2345"], ["9กก 9999", "9กก9999"], ["ทข 1234", "ทข1234"]]) {
    const p = P.parse(s); assert.equal(p.ok, true, s); assert.equal(p.key, key);
  }
  assert.equal(P.parse("0กข 2345").ok, false, "a leading 0 is not a valid prefix");
  assert.equal(P.parse("12กข 2345").ok, false, "only one leading digit");
  const m = P.parse("1กขค 123", { moto: true }); assert.equal(m.ok, true); assert.equal(m.prefix, "1");
});

test("leadAlternatives: frames that disagree on the leading digit -> both readings offered, never dropped silently", () => {
  const r = k => ({ key: k, conf: 0.9, chars: [...k].map(c => ({ c, p: 0.9 })) });
  const reads = [r("กข2345"), r("กข2345"), r("1กข2345")];
  const v = P.vote(reads);
  assert.equal(v.key, "กข2345"); // the majority alone would drop the "1"
  const a = P.leadAlternatives(v, reads);
  assert.equal(a.leadCheck, true); assert.equal(a.reason, "frames");
  assert.deepEqual(new Set(a.alts), new Set(["กข2345", "1กข2345"]));
  assert.equal(a.alts[0], v.key, "the voted reading is listed first");
});

test("leadAlternatives: low-confidence prefix offers the reading without it; agreeing confident frames offer nothing", () => {
  const k = "1กข2345";
  const weak = { key: k, conf: 0.8, chars: [...k].map((c, i) => ({ c, p: i === 0 ? 0.4 : 0.95 })) };
  const v = P.vote([weak, weak]);
  const a = P.leadAlternatives(v, [weak, weak]);
  assert.equal(a.leadCheck, true); assert.equal(a.reason, "lowconf"); assert.deepEqual(a.alts, ["1กข2345", "กข2345"]);
  const sure = { key: k, conf: 0.95, chars: [...k].map(c => ({ c, p: 0.95 })) };
  const b = P.leadAlternatives(P.vote([sure, sure]), [sure, sure]);
  assert.equal(b.leadCheck, false); assert.deepEqual(b.alts, []);
});

test("leadAlternatives: a crop cut at the left frame edge without a prefix asks the guard to check", () => {
  const k = "กข2345", rd = { key: k, conf: 0.95, chars: [...k].map(c => ({ c, p: 0.95 })), leftCut: true };
  const a = P.leadAlternatives(P.vote([rd, rd]), [rd, rd]);
  assert.equal(a.leadCheck, true); assert.equal(a.reason, "edge");
  assert.equal(P.leadAlternatives(P.vote([rd, rd]), [rd, rd], { leftCut: false }).reason, "edge", "per-read flag is enough");
  assert.equal(P.leadAlternatives(null, []).leadCheck, false);
});
