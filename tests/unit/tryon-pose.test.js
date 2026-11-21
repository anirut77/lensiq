"use strict";
// tests/unit/tryon-pose.test.js — pose-anchored garment placement on tryon.html (owner decision 2026-11-18: "Try-On,
// on-device overlay ... garment placed and scaled on the body from pose landmarks, front view first ... a preview of
// placement and colour, not a realistic fitting. Nothing leaves the device."). FIXED TEST SET: written and hash-locked
// (evals-locks/tryon-pose.sha256, ~/LENSIQ-field/evals/tryon-pose/) BEFORE the pose code in lensiq-tryon-core.js / tryon.js,
// the vendored model and its licence entries existed. Browser half: tests/e2e/tryon-pose.e2e.mjs.
// Source label of every number: SYNTHETIC (tests/unit/fixtures/tryon-pose-set.js: bodies made of numbers, no image of anyone).
//
//   Q1 fit set: TO.bodyAnchors(landmarks, W, H) puts every garment anchor point within the per-anchor limits of
//      FIT.TARGETS (mean and p90 over all accepted people; every condition's mean under the p90 limit)
//   Q2 refusals: side view, shoulders / hips not visible, knees or ankles missing for the categories that need them: the
//      right reason every time, and no front-view person refused for a part that is visible; poseFor(): one person only
//   Q3 garment target rules on an exact body (no estimation error): tops / outerwear (hem on the hip line), dresses (hem on
//      the knee line), skirts (waist to knee line), trousers (waist, crotch, ankles), with the stated widening rules
//   Q4 rendered: built-in drawn garments warped with studio-core land on their targets (inside / outside samples)
//   Q5 garment anchors from a cut-out's alpha (skirts, trousers) match the drawing's own anchors
//   Q6 licence: MediaPipe Pose Landmarker (lite) vendored with its Apache-2.0 text, README (source, bytes, sha256, model
//      card, out-of-scope uses), LICENSES/THIRD_PARTY.md row and LICENSES/THIRD-PARTY-NOTICES.txt entry; no AGPL / GPL /
//      non-commercial / Ultralytics wording in what this phase adds
//   Q7 page: disclaimer "a preview of placement and colour, not a realistic fitting" in TH (markup) / EN / ZH, inside the
//      result card; the model file is never named by tryon.html (lazy: tryon.js loads it when a pose item is picked);
//      skirts and trousers are drawable; demo items for every pose category; no POST, no drop / paste, no stored frames
//   Q8 size: the model file is at most 6,000,000 bytes (speed budget: it is fetched only after the visitor picks a pose item)
// Re-lock 2026-11-22 (owner decision 223, approved 223-1): assertions that required a figure, source or old status word on a
// customer page are inverted (the page must not show it) and redirected (docs/tech-sheets/* must hold it verbatim).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const TO = require(path.join(ROOT, "lensiq-tryon-core.js"));
const SC = require(path.join(ROOT, "studio-core.js"));
const FIT = require("./fixtures/tryon-pose-set.js");
const MODEL = "vendor/models/pose-landmarker/pose_landmarker_lite.task";
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test("Q1: fit set within the per-anchor limits (source: synthetic, 120 people x 10 conditions)", () => {
  const res = FIT.run(TO), S = FIT.summarize(res.rows);
  for (const [g, s] of Object.entries(S)) {
    console.log(`  ${g.padEnd(8)} n=${String(s.all.n).padStart(4)} mean ${s.all.mean.toFixed(3)} B  p90 ${s.all.p90.toFixed(3)} B  (limits ${FIT.TARGETS[g].mean} / ${FIT.TARGETS[g].p90})`);
  }
  assert.ok(res.rows.length >= 1500, "rows " + res.rows.length);
  assert.deepEqual(FIT.verdict(res), []);
});

test("Q2: refusals with the right reason; one person only", () => {
  const res = FIT.run(TO), wrong = res.decisions.filter(x => x.want !== x.got);
  assert.deepEqual(wrong.slice(0, 20), [], `${wrong.length} wrong decisions`);
  assert.ok(res.decisions.filter(x => x.cond[0] === "R").length === 4 * FIT.N * FIT.CATS.length);
  const one = FIT.cases()[0].lms;
  assert.equal(TO.poseFor([]), null, "no person");
  assert.equal(TO.poseFor(null), null);
  assert.equal(TO.poseFor([one, one]), null, "two people: nothing is placed");
  assert.equal(TO.poseFor([one]), one);
  for (const cat of FIT.CATS) assert.deepEqual(TO.POSE_NEEDS[cat], FIT.NEEDS[cat], "needs " + cat);
});

/** exact body from the ground truth of one fixture person (axes and B known) */
function exactBody(C) {
  return Object.assign({ ok: true, B: C.B, across: C.axis.across, down: C.axis.down, has: C.has }, C.truth);
}
const along = (b, p, a, dn) => ({ x: p.x + b.across.x * a + b.down.x * dn, y: p.y + b.across.y * a + b.down.y * dn });
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const half = (b, l, r) => Math.abs((r.x - l.x) * b.across.x + (r.y - l.y) * b.across.y) / 2;

test("Q3: garment target rules on an exact body", () => {
  for (const C of FIT.cases().filter(c => c.cond === "P1" || c.cond === "P4").slice(0, 10)) {
    const b = exactBody(C), B = b.B;
    const get = (cat, anchors) => {
      const r = TO.garmentTargets(cat, b, anchors);
      assert.ok(r && r.ok, cat + " " + JSON.stringify(r && r.reason));
      return Object.fromEntries(r.targets.map(t => [t.k, t]));
    };
    // tops: canon (u, v) anchors as SC.templateAnchors gives them; narrow hem (0.8 x shoulders) -> hem on the hip outline
    const top = [{ k: "neck", x: 200, y: 30, u: 0, v: -.05 }, { k: "cl", x: 160, y: 20, u: -.33, v: -.22 }, { k: "cr", x: 240, y: 20, u: .33, v: -.22 },
      { k: "l", x: 60, y: 50, u: -1.45, v: .25 }, { k: "r", x: 340, y: 50, u: 1.45, v: .25 }, { k: "hl", x: 88, y: 400, u: -1.5, v: 5 }, { k: "hr", x: 312, y: 400, u: 1.5, v: 5 }];
    for (const cat of ["tops", "outerwear"]) {
      const t = get(cat, top), hipC = mid(b.hipL, b.hipR), hh = Math.max(half(b, b.hipL, b.hipR), B / 2 * (224 / 280));
      assert.ok(d(t.neck, b.neck) < .5 && d(t.l, b.shoulderL) < .5 && d(t.r, b.shoulderR) < .5, cat + " neck / shoulders");
      assert.ok(d(t.cl, along(b, b.neck, -.33 / 2.9 * B, -.17 / 2.9 * B)) < .5 && d(t.cr, along(b, b.neck, .33 / 2.9 * B, -.17 / 2.9 * B)) < .5, cat + " collar");
      assert.ok(d(t.hl, along(b, hipC, -hh, 0)) < .5 && d(t.hr, along(b, hipC, hh, 0)) < .5, cat + " hem on the hip line");
    }
    // a boxy top (hem 1.2 x shoulders) keeps its width: hem half-width = B / 2 x 1.2 when that is wider than the hips
    const boxy = top.map(a => (a.k === "hl" ? { ...a, x: 32 } : a.k === "hr" ? { ...a, x: 368 } : a));
    const tb = get("tops", boxy), hb = Math.max(half(b, b.hipL, b.hipR), B / 2 * (336 / 280));
    assert.ok(Math.abs(half(b, tb.hl, tb.hr) - hb) < .5, "boxy top keeps its width");
    // dresses: hem on the knee line, half-width = max(knee outline, hip outline, B / 2 x hem / shoulder width of the garment)
    const dress = top.map(a => (a.k === "hl" ? { ...a, x: 100, y: 700 } : a.k === "hr" ? { ...a, x: 300, y: 700 } : a));
    const td = get("dresses", dress), kc = mid(b.kneeLo, b.kneeRo);
    const hd = Math.max(half(b, b.kneeLo, b.kneeRo), half(b, b.hipL, b.hipR), B / 2 * (200 / 280));
    assert.ok(d(td.hl, along(b, kc, -hd, 0)) < .5 && d(td.hr, along(b, kc, hd, 0)) < .5, "dress hem on the knee line");
    assert.ok(d(td.l, b.shoulderL) < .5 && d(td.neck, b.neck) < .5, "dress shoulders");
    // skirts: waistband ends on the waist outline; hem on the knee line, half = max(knee, hip, waist half x hem / waist)
    const skirt = [{ k: "wl", x: 50, y: 10 }, { k: "wr", x: 250, y: 10 }, { k: "hl", x: 10, y: 300 }, { k: "hr", x: 290, y: 300 }];
    const ts = get("skirts", skirt), hs = Math.max(half(b, b.kneeLo, b.kneeRo), half(b, b.hipL, b.hipR), half(b, b.waistL, b.waistR) * (280 / 200));
    assert.ok(d(ts.wl, b.waistL) < .5 && d(ts.wr, b.waistR) < .5, "skirt waist");
    assert.ok(d(ts.hl, along(b, kc, -hs, 0)) < .5 && d(ts.hr, along(b, kc, hs, 0)) < .5, "skirt hem");
    // trousers: waist, crotch and the four ankle outline points
    const tr = [{ k: "wl", x: 20, y: 5 }, { k: "wr", x: 220, y: 5 }, { k: "c", x: 120, y: 120 }, { k: "hlo", x: 10, y: 600 }, { k: "hli", x: 100, y: 600 },
      { k: "hri", x: 140, y: 600 }, { k: "hro", x: 230, y: 600 }];
    const tt = get("trousers", tr);
    assert.ok(d(tt.wl, b.waistL) < .5 && d(tt.wr, b.waistR) < .5 && d(tt.c, b.crotch) < .5, "trousers waist / crotch");
    assert.ok(d(tt.hlo, b.ankleLo) < .5 && d(tt.hli, b.ankleLi) < .5 && d(tt.hri, b.ankleRi) < .5 && d(tt.hro, b.ankleRo) < .5, "trousers ankles");
    // a category the body cannot carry is refused, not guessed
    const noKnees = Object.assign({}, b, { has: { ...b.has, knees: false } });
    assert.equal(TO.garmentTargets("skirts", noKnees, skirt).ok, false);
    assert.equal(TO.garmentTargets("skirts", noKnees, skirt).reason, "knees");
  }
});

const KINDS = [["tee", "tops"], ["jacket", "outerwear"], ["dress", "dresses"], ["skirt", "skirts"], ["trousers", "trousers"]];
function alphaOf(px, w, h) { const a = new Float32Array(w * h); for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3] / 255; return a; }

test("Q4: drawn garments warped onto the body land on their targets (inside opaque, outside clear)", () => {
  const people = FIT.FIT_CONDS.filter(c => c !== "P6").map(c => FIT.cases().filter(x => x.cond === c).slice(0, 2)).flat();
  let checked = 0;
  for (const [kind, cat] of KINDS) {
    const g = TO.demoGarment(kind);
    assert.ok(g && g.w > 50 && g.h > 50 && g.category === cat, kind);
    const px = TO.rasterGarment(g), anchors = TO.garmentAnchorsFromAlpha(cat, alphaOf(px, g.w, g.h), g.w, g.h, SC);
    assert.ok(Array.isArray(anchors) && anchors.length >= 4, kind + " anchors");
    for (const C of people) {
      const body = TO.bodyAnchors(C.lms, C.W, C.H), r = TO.garmentTargets(cat, body, anchors);
      assert.ok(r.ok, `${C.id} ${kind}: ${r.reason}`);
      const tw = SC.templateWarpTo(anchors, r.targets), out = SC.warpRGBA(px, g.w, g.h, C.W, C.H, tw.inv, { step: 4 });
      const A = (x, y) => { x = Math.round(x); y = Math.round(y); return x < 0 || y < 0 || x >= C.W || y >= C.H ? 0 : out[(y * C.W + x) * 4 + 3]; };
      const B = body.B, e = .05 * B;
      for (const t of r.targets) {
        const sideIn = { l: 1, hl: 1, wl: 1, hlo: 1, r: -1, hr: -1, wr: -1, hro: -1, hli: -1, hri: 1 }[t.k];
        if (!sideIn) continue;
        const vert = /^h/.test(t.k) ? -1 : 1; // hem points: the garment is above; shoulder / waist points: below
        const inP = along(body, t, sideIn * e, vert * e), outP = along(body, t, -sideIn * e, vert * e);
        assert.ok(A(inP.x, inP.y) > 128, `${C.id} ${kind} ${t.k}: inside sample is clear`);
        if (!(cat === "tops" || cat === "outerwear" || cat === "dresses") || /^h/.test(t.k)) assert.ok(A(outP.x, outP.y) < 64, `${C.id} ${kind} ${t.k}: outside sample is covered`);
        checked++;
      }
      if (cat === "trousers") {
        const c = r.targets.find(t => t.k === "c"), below = along(body, c, 0, e), above = along(body, c, 0, -e);
        assert.ok(A(below.x, below.y) < 64, `${C.id} below the crotch is clear`);
        assert.ok(A(above.x, above.y) > 128, `${C.id} above the crotch is covered`);
      }
    }
  }
  assert.ok(checked >= 300, "samples " + checked);
});

test("Q5: anchors from a cut-out's alpha match the drawing (skirts, trousers)", () => {
  for (const kind of ["skirt", "trousers"]) {
    const g = TO.demoGarment(kind), px = TO.rasterGarment(g), got = TO.garmentAnchorsFromAlpha(g.category, alphaOf(px, g.w, g.h), g.w, g.h, SC);
    for (const a of g.anchors) {
      const b = got.find(x => x.k === a.k);
      assert.ok(b && d(a, b) <= 2.5, `${kind} ${a.k}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    }
  }
  assert.equal(TO.garmentAnchorsFromAlpha("skirts", new Float32Array(100), 10, 10, SC), null, "empty cut-out: no anchors");
});

test("Q6: licence: Pose Landmarker lite vendored with Apache-2.0 text, README, THIRD_PARTY row and notice", () => {
  const dir = "vendor/models/pose-landmarker";
  assert.ok(fs.existsSync(path.join(ROOT, MODEL)), MODEL);
  const buf = fs.readFileSync(path.join(ROOT, MODEL)), sha = crypto.createHash("sha256").update(buf).digest("hex");
  const lic = read(dir + "/LICENSE"), readme = read(dir + "/README.txt");
  assert.match(lic, /Apache License\s+Version 2\.0, January 2004/);
  assert.ok(readme.includes(sha), "README states the sha256 " + sha);
  assert.ok(readme.replace(/,/g, "").includes(String(buf.length)), "README states the size in bytes " + buf.length);
  assert.match(readme, /storage\.googleapis\.com\/mediapipe-models\/pose_landmarker\/pose_landmarker_lite/);
  assert.match(readme, /Model Card BlazePose GHUM 3D/);
  assert.match(readme, /Apache License,? Version 2\.0/);
  assert.match(readme, /surveillance or identity recognition/i, "out-of-scope uses quoted");
  assert.match(readme, /[Mm]ultiple people/);
  const tp = read("LICENSES/THIRD_PARTY.md"), row = tp.split("\n").find(l => l.includes("pose_landmarker_lite.task"));
  assert.ok(row, "THIRD_PARTY.md row");
  assert.match(row, /Apache-2\.0/); assert.match(row, /BlazePose GHUM 3D/); assert.match(row, /tryon/); assert.match(row, /OK-ATTR/);
  const notice = read("LICENSES/THIRD-PARTY-NOTICES.txt");
  assert.match(notice, /Pose Landmarker[\s\S]{0,300}pose_landmarker_lite\.task/);
  for (const f of [dir + "/README.txt", "lensiq-tryon-core.js", "tryon.js"]) {
    assert.ok(!/AGPL|\bGPL\b|ultralytics|non-?commercial|CC BY-NC/i.test(read(f)), f + ": no copyleft / non-commercial wording");
  }
});

test("Q7: page: disclaimer in TH / EN / ZH inside the result card; lazy model; pose categories drawable; no POST / drop / storage", () => {
  const html = read("tryon.html"), js = read("tryon.js"), en = read("i18n/en-tryon.js"), zh = read("i18n/zh-tryon.js");
  const stage = html.slice(html.indexOf('id="toStage"'), html.indexOf("</section>", html.indexOf('id="toStage"')));
  const m = /<p[^>]*data-i18n="to\.pose\.note"[^>]*>([^<]+)<\/p>/.exec(stage);
  assert.ok(m, "the note sits in the same card as the picture");
  assert.match(m[1], /ภาพตัวอย่างตำแหน่งและสี/); assert.match(m[1], /ไม่ใช่การลองสวมที่สมจริง/);
  assert.match(en, /"to\.pose\.note":\s*"[^"]*a preview of placement and colour, not a realistic fitting/i);
  assert.match(zh, /"to\.pose\.note":\s*"[^"]*位置和颜色的预览[^"]*不是真实的试穿/);
  assert.ok(!/pose_landmarker/.test(html), "tryon.html never names the model (no preload)");
  assert.match(js, /pose_landmarker_lite\.task/);
  assert.match(js, /function loadPose\(/);
  for (const c of ["skirts", "trousers", "tops", "outerwear", "dresses"]) assert.ok(TO.DRAWABLE.includes(c), "drawable " + c);
  for (const c of ["tops", "outerwear", "dresses", "skirts", "trousers"]) assert.ok(TO.DEMO.some(i => i.category === c && i.draw), "demo item " + c);
  for (const i of TO.DEMO) for (const l of ["th", "en", "zh"]) assert.ok(i.name[l], i.id + " " + l);
  assert.ok(!/method\s*:\s*["']POST/i.test(js), "no POST");
  assert.ok(!/addEventListener\(\s*["'](drop|paste|dragover)["']/.test(js) && !/on(drop|paste)\s*=/.test(js + html), "no drop / paste");
  assert.ok(!/(localStorage|sessionStorage|indexedDB)\.[a-zA-Z]+\([^)]*(toDataURL|frame|snapshot|image|photo)/i.test(js), "no frames stored");
  assert.ok(!/toDataURL[\s\S]{0,80}(fetch|setItem)/.test(js), "no frame sent or stored");
  const keys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map(x => x[1]).concat([...js.matchAll(/T\("([a-z][\w.]+)"/g)].map(x => x[1]));
  // Decision 223: ln.tryon.* and common.recheck live in the shared dictionaries i18n/en-common.js / zh-common.js (nav.js
  // loads them on every page); only those keys may be found there, every key must still be found.
  const enC = read("i18n/en-common.js"), zhC = read("i18n/zh-common.js"), sharedKey = k => /^(ln\.tryon\.|common\.recheck$)/.test(k);
  for (const k of new Set(keys)) {
    assert.ok(en.includes(`"${k}":`) || (sharedKey(k) && enC.includes(`"${k}":`)), "en misses " + k);
    assert.ok(zh.includes(`"${k}":`) || (sharedKey(k) && zhC.includes(`"${k}":`)), "zh misses " + k);
  }
});

test("Q8: model size within the budget (fetched only after a pose item is picked)", () => {
  const n = fs.statSync(path.join(ROOT, MODEL)).size;
  assert.ok(n > 1000000 && n <= 6000000, "bytes " + n);
});
