"use strict";
// tests/unit/style-core.test.js — lensiq-style.js + vendor/style/content.json (Style MVP = personal colour palette with the
// white-balance step; docs/STYLE-DESIGN.md §1.2, §1.3, §1.5, §2.3, §3.1, §3.2). FIXED TEST: hash-locked in
// evals-locks/style-mvp.sha256 BEFORE lensiq-style.js and content.json were written. Source label: synthetic (colour
// patches and landmark sets are built here; no image of a person).
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../lensiq-colour.js");
const S = require("../../lensiq-style.js");
const CONTENT = require("../../vendor/style/content.json");

const BANDS = ["cool", "neutral-cool", "neutral", "neutral-warm", "warm"];
const THAI = /[ก-๛]/, CJK = /[㐀-鿿]/;
function rand(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const labOf = (L, C_, h) => [L, C_ * Math.cos(h * Math.PI / 180), C_ * Math.sin(h * Math.PI / 180)];

test("exports the style API", () => {
  for (const f of ["patchCentres", "robustLab", "sampleRect", "samplePatches", "hairLab", "measureFrame", "aggregate", "dimensions",
    "applyDrapes", "undertone", "closest", "confidence", "result", "palette", "toSaved", "fromSaved"]) assert.equal(typeof S[f], "function", f);
  assert.deepEqual(S.BANDS, BANDS);
});

// ---------------- content (bundled fallback, design §2.2 / §2.3) ----------------
test("content: 12 seasons under 4 parents, generic names in TH / EN / ZH, Korean-style alternative label", () => {
  assert.equal(typeof CONTENT.version, "string");
  assert.deepEqual(CONTENT.parents.map(p => p.id).sort(), ["autumn", "spring", "summer", "winter"]);
  assert.equal(CONTENT.seasons.length, 12);
  for (const p of CONTENT.parents) assert.equal(CONTENT.seasons.filter(s => s.parent === p.id).length, 3, p.id);
  const ids = new Set();
  for (const s of [...CONTENT.parents, ...CONTENT.seasons]) {
    assert.ok(!ids.has(s.id), "unique id " + s.id); ids.add(s.id);
    for (const k of ["name"].concat(s.parent ? ["alt", "desc"] : [])) {
      assert.ok(s[k] && s[k].th && s[k].en && s[k].zh, `${s.id}.${k} has th / en / zh`);
      assert.ok(THAI.test(s[k].th) && !THAI.test(s[k].en) && !THAI.test(s[k].zh) && CJK.test(s[k].zh), `${s.id}.${k} scripts`);
    }
    if (s.parent) for (const d of ["warmth", "value", "chroma"]) assert.ok(Math.abs(s.pos[d]) <= 1, `${s.id}.pos.${d}`);
  }
});

test("content: every season palette has 12-16 swatches, own colour names in 3 languages, positive roles only, no Pantone", () => {
  const ROLES = new Set(["base", "accent", "metal", "away"]);
  for (const s of CONTENT.seasons) {
    const pal = S.palette(s.id, CONTENT);
    assert.ok(pal.length >= 12 && pal.length <= 16, s.id + " swatches " + pal.length);
    assert.ok(pal.some(p => p.role === "away"), s.id + " has 'away from the face' colours");
    assert.ok(pal.some(p => p.role === "metal"), s.id + " has a metal");
    assert.equal(new Set(pal.map(p => p.hex)).size, pal.length, s.id + " no duplicate swatch");
    for (const p of pal) {
      assert.ok(ROLES.has(p.role), s.id + " role " + p.role);
      assert.match(p.hex, /^#[0-9a-f]{6}$/, s.id + " hex " + p.hex);
      assert.ok(p.name.th && p.name.en && p.name.zh && THAI.test(p.name.th) && CJK.test(p.name.zh) && !THAI.test(p.name.en), s.id + " names " + JSON.stringify(p.name));
    }
  }
  const all = JSON.stringify(CONTENT);
  assert.ok(!/pantone|\b\d{2}-\d{4}\s*(tcx|tpx|tpg)?\b/i.test(all), "no Pantone names or numbers (L-S6)");
  assert.ok(!/"(avoid|never|bad)"/i.test(all), "no 'avoid' list (positive framing)");
});

test("content: thresholds are a versioned owner-only block; three drape pairs (gold/silver, light/deep, clear/soft)", () => {
  const t = CONTENT.thresholds;
  assert.equal(typeof t.version, "string");
  assert.equal(typeof t.ownerApproved, "boolean");
  assert.equal(t.hue.bands.length, 4);
  for (let i = 1; i < 4; i++) assert.ok(t.hue.bands[i] > t.hue.bands[i - 1], "band edges ascend");
  assert.deepEqual(CONTENT.drapes.map(d => d.dim), ["warmth", "value", "chroma"]);
  for (const d of CONTENT.drapes) for (const side of ["a", "b"]) {
    assert.match(d[side].hex, /^#[0-9a-f]{6}$/);
    assert.ok(d[side].name.th && d[side].name.en && d[side].name.zh, d.dim + side);
  }
  assert.deepEqual(CONTENT.drapes.map(d => [d.a.id, d.b.id]), [["gold", "silver"], ["light", "deep"], ["clear", "soft"]]);
});

// ---------------- sampling ----------------
function face({ skin = [62, 14, 22], g = [1, 1, 1], highlights = 0.05, brow = true, seed = 3 } = {}) {
  const r = rand(seed), w = 200, h = 200, data = new Uint8ClampedArray(w * h * 4), s = C.labToRgb(skin);
  const cast = v => v.map((c, i) => Math.round(C.linearToSrgb(Math.min(1, C.srgbToLinear(c) * g[i]))));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = [90, 100, 120].map(c => c + (r() - 0.5) * 60);
    if (x >= 40 && x < 160 && y >= 30 && y < 190) {
      const q = r();
      v = q < highlights ? [252, 250, 248] : s.map(c => c + (r() - 0.5) * 4);
      if (brow && y >= 70 && y < 78 && ((x >= 55 && x < 90) || (x >= 110 && x < 145))) v = [45, 35, 30];
      if (y >= 150 && y < 158 && x >= 80 && x < 120) v = C.labToRgb([45, 40, 15]); // lips
    }
    if (x >= 165 && x < 195 && y >= 60 && y < 140) v = [118, 118, 118]; // grey card
    const i = (y * w + x) * 4, cv = cast(v); data[i] = cv[0]; data[i + 1] = cv[1]; data[i + 2] = cv[2]; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}
// 478 normalised landmarks spread over the skin area (x 50..150, y 40..180 of 200 px): the module may use any of them
function landmarks(seed = 5) {
  const r = rand(seed), pts = [];
  for (let i = 0; i < 478; i++) pts.push({ x: (50 + r() * 100) / 200, y: (40 + r() * 140) / 200, z: 0 });
  pts[0] = { x: 50 / 200, y: 110 / 200, z: 0 }; pts[1] = { x: 150 / 200, y: 110 / 200, z: 0 };
  return pts;
}
const CARD = { x: 165, y: 60, w: 30, h: 80 };

test("robustLab drops highlights, shadows and off-colour pixels; sampleRect corrects a cast with the card gains", () => {
  const skin = [60, 15, 20], base = C.labToRgb(skin), labs = [];
  for (let i = 0; i < 400; i++) labs.push(C.rgbToLab(base));
  for (let i = 0; i < 30; i++) labs.push([98, 0, 2]);
  for (let i = 0; i < 40; i++) labs.push([25, 8, 8]);
  for (let i = 0; i < 20; i++) labs.push([45, 45, 18]);
  const r = S.robustLab(labs);
  assert.ok(C.deltaE2000(r.lab, C.rgbToLab(base)) < 0.5, "robust median " + r.lab);
  assert.ok(r.n < labs.length && r.n >= 300, "kept " + r.n);
  assert.equal(S.robustLab([]), null);
  const g = [1.3, 1.0, 0.65], img = face({ g, highlights: 0, brow: false }), st = C.cardStats(img, CARD, { target: 0.18 });
  assert.equal(st.ok, true, JSON.stringify(st.reasons));
  const m = S.sampleRect(img, { x: 60, y: 90, w: 30, h: 30 }, st.gains), ref = C.rgbToLab(C.labToRgb([62, 14, 22]));
  assert.ok(C.deltaE2000(m.lab, ref) < 1.5, "rect after correction " + m.lab);
});

test("samplePatches: cheeks, forehead, chin from the landmarks; robust to highlights, brows and lips", () => {
  const img = face({}), st = C.cardStats(img, CARD, { target: 0.18 }), ref = C.rgbToLab(C.labToRgb([62, 14, 22]));
  const p = S.samplePatches(img, landmarks(), st.gains, {});
  assert.ok(p && p.skin, "skin found");
  assert.ok(C.deltaE2000(p.skin, ref) < 1.5, "skin dE00 " + C.deltaE2000(p.skin, ref) + " " + p.skin);
  const ids = p.patches.map(x => x.id).sort();
  for (const k of ["chin", "forehead", "leftCheek", "rightCheek"]) assert.ok(ids.includes(k), "patch " + k + " in " + ids);
  const mk = S.samplePatches(img, landmarks(), st.gains, { makeup: true });
  assert.ok(mk.patches.every(x => /jaw|neck/i.test(x.id)), "makeup mode samples the jaw / neck edge only: " + mk.patches.map(x => x.id));
  const cs = S.patchCentres(landmarks(), 200, 200, {});
  for (const c of cs) assert.ok(c.x >= 0 && c.x < 200 && c.y >= 0 && c.y < 200 && c.r > 0, JSON.stringify(c));
});

test("measureFrame: refuses a frame without a usable card or a face; hair colour from the hair mask", () => {
  const img = face({}), st = C.cardStats(img, CARD, { target: 0.18 });
  const mask = { data: new Float32Array(50 * 50), w: 50, h: 50 };
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) if (x >= 12 && x < 38 && y >= 9 && y < 18) mask.data[y * 50 + x] = 1; // = skin area rows 36..72 (dark brow stripe included)
  const f = S.measureFrame(img, { landmarks: landmarks(), card: st, hairMask: mask });
  assert.equal(f.ok, true, JSON.stringify(f.reasons));
  assert.ok(f.skin && f.skin.length === 3);
  assert.ok(Array.isArray(f.hair) && f.hair.length === 3);
  const bad = S.measureFrame(img, { landmarks: landmarks(), card: { ok: false, reasons: ["clipped"] } });
  assert.equal(bad.ok, false); assert.ok(bad.reasons.includes("card"), JSON.stringify(bad.reasons));
  const none = S.measureFrame(img, { landmarks: null, card: st });
  assert.equal(none.ok, false); assert.ok(none.reasons.includes("face"), JSON.stringify(none.reasons));
  assert.equal(S.measureFrame(img, { landmarks: landmarks(), card: st }).hair, null, "no mask -> no hair colour");
});

// ---------------- aggregation, undertone, dimensions, seasons ----------------
function frames(skin, n = 30, jitter = 0.4, hair = [25, 4, 8], seed = 9) {
  const r = rand(seed), out = [];
  for (let i = 0; i < n; i++) out.push({ ok: true, skin: skin.map(v => v + (r() - 0.5) * jitter), hair: hair.map(v => v + (r() - 0.5) * jitter) });
  return out;
}

test("aggregate: robust medians, hue angle and spread", () => {
  const a = S.aggregate(frames(labOf(60, 22, 55)));
  assert.equal(a.n, 30);
  assert.ok(Math.abs(a.skin.h - 55) < 0.6 && Math.abs(a.skin.C - 22) < 0.3 && Math.abs(a.skin.L - 60) < 0.3, JSON.stringify(a.skin));
  assert.ok(a.sd.h < 1 && a.sd.L < 1, JSON.stringify(a.sd));
  const noisy = S.aggregate(frames(labOf(60, 22, 55), 30, 12));
  assert.ok(noisy.sd.h > a.sd.h, "spread grows with noise");
  assert.ok(S.aggregate([{ ok: false }, { ok: false }]).n === 0);
});

test("undertone: five ordered bands from the skin hue angle (owner thresholds), 'unsure' when the spread is high", () => {
  const edges = CONTENT.thresholds.hue.bands;
  let last = -1;
  for (const h of [edges[0] - 4, edges[0] + 0.5, edges[1] + 0.5, edges[2] + 0.5, edges[3] + 4]) {
    const u = S.undertone(S.aggregate(frames(labOf(60, 22, h))), CONTENT);
    const i = BANDS.indexOf(u.band);
    assert.ok(i > last, `band order at h=${h}: ${u.band}`); last = i;
    assert.ok(u.pos >= 0 && u.pos <= 1, "bar position " + u.pos);
  }
  assert.equal(last, 4, "reaches 'warm'");
  for (let i = 0; i < 4; i++) {
    const lo = S.undertone(S.aggregate(frames(labOf(60, 22, edges[i] - 0.5))), CONTENT).band, hi = S.undertone(S.aggregate(frames(labOf(60, 22, edges[i] + 0.5))), CONTENT).band;
    assert.equal(BANDS.indexOf(hi) - BANDS.indexOf(lo), 1, "edge " + edges[i]);
  }
  const noisy = S.undertone(S.aggregate(frames(labOf(60, 22, 55), 30, 30)), CONTENT);
  assert.equal(noisy.band, "unsure");
});

test("dimensions are monotonic; drapes move them; seasons: each season's own position is its closest, warm -> Spring/Autumn", () => {
  const d0 = S.dimensions(S.aggregate(frames(labOf(55, 20, 52))), CONTENT);
  assert.ok(S.dimensions(S.aggregate(frames(labOf(55, 20, 64))), CONTENT).warmth > d0.warmth, "warmer hue -> warmth up");
  assert.ok(S.dimensions(S.aggregate(frames(labOf(70, 20, 52))), CONTENT).value > d0.value, "lighter -> value up");
  assert.ok(S.dimensions(S.aggregate(frames(labOf(55, 30, 52))), CONTENT).chroma > d0.chroma, "more chroma -> chroma up");
  for (const k of ["warmth", "value", "chroma"]) assert.ok(Math.abs(d0[k]) <= 1.5, k);
  const up = S.applyDrapes(d0, { warmth: "a", value: "a", chroma: "a" }, CONTENT), dn = S.applyDrapes(d0, { warmth: "b", value: "b", chroma: "b" }, CONTENT);
  for (const k of ["warmth", "value", "chroma"]) assert.ok(up[k] > d0[k] && dn[k] < d0[k], "drape moves " + k);
  assert.deepEqual(S.applyDrapes(d0, { warmth: "skip", value: "skip", chroma: "skip" }, CONTENT), d0, "skip changes nothing");
  for (const s of CONTENT.seasons) {
    const c = S.closest(s.pos, CONTENT);
    assert.equal(c[0].id, s.id, "closest to its own position: " + s.id);
    assert.equal(c.length, 12);
    assert.notEqual(c[0].id, c[1].id);
  }
  for (const w of [0.6, 1]) for (const v of [-0.8, 0, 0.8]) for (const ch of [-0.8, 0, 0.8]) {
    assert.ok(["spring", "autumn"].includes(S.closest({ warmth: w, value: v, chroma: ch }, CONTENT)[0].parent), `warm ${w},${v},${ch}`);
    assert.ok(["summer", "winter"].includes(S.closest({ warmth: -w, value: v, chroma: ch }, CONTENT)[0].parent), `cool ${-w},${v},${ch}`);
  }
});

test("result: closest two seasons, palette, confidence in words; 'unsure' instead of a guess (few frames, card failed, high spread)", () => {
  const r = S.result(frames(labOf(66, 24, 62), 30, 0.4, [30, 6, 14]), { drapes: { warmth: "a", value: "a", chroma: "skip" }, cardShare: 1 }, CONTENT);
  assert.equal(r.status, "ok", JSON.stringify(r.reasons));
  assert.equal(r.seasons.length, 2);
  assert.notEqual(r.seasons[0], r.seasons[1]);
  for (const id of r.seasons) assert.ok(CONTENT.seasons.some(s => s.id === id), id);
  assert.ok(["spring", "autumn"].includes(CONTENT.seasons.find(s => s.id === r.seasons[0]).parent), "warm measurement + gold drape -> warm season");
  assert.ok(BANDS.includes(r.undertone.band));
  assert.ok(["high", "medium", "low"].includes(r.confidence));
  assert.ok(r.palette.length >= 12 && r.palette.length <= 16);
  assert.ok(Array.isArray(r.why) && r.why.length === 3, "one line per dimension");
  assert.ok(r.position && Math.abs(r.position.warmth) <= 1.5 && Math.abs(r.position.value) <= 1.5);
  assert.equal(typeof r.thresholds, "string", "result names the threshold version");
  // never a guess
  assert.equal(S.result(frames(labOf(66, 24, 62), 6), { cardShare: 1 }, CONTENT).status, "unsure", "too few frames");
  assert.equal(S.result(frames(labOf(66, 24, 62)), { cardShare: 0.3 }, CONTENT).status, "unsure", "card missing in most frames");
  const u = S.result(frames(labOf(66, 24, 62), 30, 40), { cardShare: 1 }, CONTENT);
  assert.equal(u.status, "unsure", "high spread");
  assert.equal(u.seasons.length, 0, "no season shown when unsure");
  assert.equal(u.palette.length, 0, "no palette shown when unsure");
});

test("confidence: makeup and drapes that disagree with the measurement never raise it", () => {
  const order = ["low", "medium", "high"], f = frames(labOf(60, 22, 64), 30, 0.3);
  const agree = S.result(f, { drapes: { warmth: "a", value: "skip", chroma: "skip" }, cardShare: 1 }, CONTENT).confidence;
  const disagree = S.result(f, { drapes: { warmth: "b", value: "skip", chroma: "skip" }, cardShare: 1 }, CONTENT).confidence;
  const makeup = S.result(f, { drapes: { warmth: "a", value: "skip", chroma: "skip" }, cardShare: 1, makeup: true }, CONTENT).confidence;
  assert.ok(order.indexOf(disagree) <= order.indexOf(agree), `${disagree} <= ${agree}`);
  assert.ok(order.indexOf(disagree) < 2, "disagreement is never 'high'");
  assert.ok(order.indexOf(makeup) < order.indexOf(agree) || agree === "low", `makeup ${makeup} < ${agree}`);
  const noisy = S.result(frames(labOf(60, 22, 64), 30, 3.5), { cardShare: 1 }, CONTENT);
  if (noisy.status === "ok") assert.notEqual(noisy.confidence, "high");
});

// ---------------- saving (design §1.3, §5: opt-in, derived colours only) ----------------
test("toSaved keeps only season ids, swatch hex, undertone band and date; fromSaved validates", () => {
  const r = S.result(frames(labOf(66, 24, 62), 30, 0.4), { cardShare: 1 }, CONTENT);
  const saved = S.toSaved(r, "2026-11-14");
  assert.deepEqual(Object.keys(saved).sort(), ["date", "seasons", "swatches", "undertone", "v"]);
  assert.equal(saved.date, "2026-11-14");
  assert.deepEqual(saved.seasons, r.seasons);
  assert.equal(saved.undertone, r.undertone.band);
  assert.ok(saved.swatches.every(h => /^#[0-9a-f]{6}$/.test(h)));
  const json = JSON.stringify(saved);
  assert.ok(json.length < 2048, "small");
  assert.ok(!/"(L|a|b|h|C|skin|hair|lab|image|frame|landmarks?)"/.test(json), "no skin values, no image: " + json);
  assert.deepEqual(S.fromSaved(JSON.parse(json), CONTENT), saved);
  for (const bad of [null, "x", {}, { v: 1, seasons: ["nope"], swatches: [], undertone: "warm", date: "2026-11-14" },
    { v: 1, seasons: r.seasons, swatches: ["red"], undertone: "warm", date: "2026-11-14" },
    { v: 1, seasons: r.seasons, swatches: saved.swatches, undertone: "fair", date: "2026-11-14" },
    Object.assign({}, saved, { skin: [60, 10, 20] })]) assert.equal(S.fromSaved(bad, CONTENT), null, JSON.stringify(bad));
  assert.equal(S.toSaved(S.result(frames(labOf(66, 24, 62), 4), { cardShare: 1 }, CONTENT), "2026-11-14"), null, "nothing to save when unsure");
});
