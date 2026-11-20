"use strict";
// tests/unit/palm-v2-capture2.test.js — FIXED TEST SET "palm-layers" relock4 (palm v2 capture, owner orders 2026-11-20), changed and
// re-locked as relock5 (owner decisions 171 ก and 172, 2026-11-20) in evals-locks/palm-layers.sha256 BEFORE the product change.
//   171 ก: the sharpness gate (S x 10^4 >= 1.0) is removed from the photo pass / fail minimum (owner-approved loosening: the best
//          real photo pair scored 0.42-0.99); the minimum keeps palm width >= 360 px and blown-out <= 2 %. Sharpness is still measured
//          (a value to look at only) and never blocks a photo or appears as a score to the user.
//   172:   the pre-capture guidance is EXACTLY the owner-approved text (TH / EN / ZH); the earlier tip texts are gone. DRAWN SYNTHETIC images and landmark sets only
// (tests/fixtures/palm-v2/synth-capture.js); every number here is SYNTHETIC.
// Contract under test (palm-v2.js, browser global PalmV2):
//   UPLOAD_MIN = { PROVISIONAL: true, pw: 360, clip: 0.02 }   (clip = fraction of blown-out pixels; no sharpness key, 171 ก)
//   photoQuality(rgba, w, h, hand) -> { pw, sharp, clip, mean }: the B2.3 measure. Palm ROI u 0..1, v 0.05..0.95 of the palm frame,
//     resampled to 256 px wide; Y = BT.601; S = variance of the 4-neighbour Laplacian of the Gaussian (sigma 1) smoothed Y / mean(Y)^2;
//     blown-out = any channel >= 250; pw = index-to-little-finger knuckle distance in image px.
//   qualityVerdict(q, { source }) -> { ok, fails[] }: source "upload" checks pw and clip; "camera" checks clip (no flash); sharp never.
//   T("quality.retake", lang) = the owner-approved retake message, EXACTLY (TH / EN / ZH).
//   handSide({ hand, facing, mirrored, handedness }) -> { side: "left" | "right" | null, ... }: from the thumb position relative to
//     the palm (landmark geometry); facing "user" = a mirrored image unless `mirrored` says otherwise; the model's handedness label
//     is never used to decide.
//   sideCheck(chosen, geo) -> { side, ask, detected }: side is ALWAYS the user's choice; ask = the geometry disagrees.
//   sideAskText(detected, chosen, lang): the confirmation question (TH / EN / ZH).
//   CAM_OPTS.torch === false; photoSettings(caps) -> { fillLightMode: "off" } when the track supports it, else null;
//   grabStill asks takePhoto for fillLightMode "off" when supported.
//   Texts: T("tips.guide", lang) = the owner-approved guidance (172), EXACTLY; tips.light / tips.flash / tips.hand and their texts are
//   gone; the live hints carry the daylight, no-flash and relaxed / slightly cupped hand guidance in TH / EN / ZH; no text tells the
//   user to stretch the hand flat; no text shows a sharpness value.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PV = require(path.join(ROOT, "palm-v2.js"));
const SY = require(path.join(ROOT, "tests", "fixtures", "palm-v2", "synth-capture.js"));

const LANGS = ["th", "en", "zh"];
const RETAKE = {
  th: "ภาพนี้เล็กหรือไม่คมพอสำหรับหาเส้นลายมือ ถ่ายใหม่ให้ฝ่ามือเต็มกรอบ ในที่สว่างทั่วถึง ไม่ใช้แฟลช และถือให้นิ่ง หรือจะวาดเส้นเองบนภาพนี้ก็ได้",
  en: "This photo is too small or not sharp enough to find palm lines. Retake it with your palm filling the frame, in bright even light, without flash, holding still, or draw the lines yourself on this photo.",
  zh: "这张照片太小或不够清晰，无法找到掌纹。请让手掌占满画面，在明亮均匀的光线下、不开闪光灯、保持稳定后重拍，也可以直接在这张照片上自己画线。"
};
/* owner decision 172 (2026-11-20): byte for byte */
const GUIDE = {
  th: "ถ่ายข้างหน้าต่างให้แสงส่องฝ่ามือจากด้านข้าง ไม่ใช่จากด้านหน้า ปิดแฟลช (ตั้งเป็น 'ปิด' ไม่ใช่ 'อัตโนมัติ') ปล่อยมือสบาย ๆ งุ้มเล็กน้อย ไม่ต้องเหยียดตึง และให้เห็นทั้งฝ่ามือและนิ้วอยู่ในกรอบ",
  en: "Stand beside a window so the light falls across your palm from the side, not from the front. Turn the flash off (set it to 'off', not 'auto'). Keep your hand relaxed and slightly cupped, not stretched flat, with the whole palm and fingers inside the frame.",
  zh: "站在窗边，让光线从侧面照到手掌，而不是从正面。关闭闪光灯（设为“关闭”，不要用“自动”）。手放松、略微弯曲，不要用力伸平，并让整个手掌和手指都在画面内。"
};
/* the relock4 tip texts that 172 replaces: none may remain anywhere */
const OLD_TIPS = [
  "ถ่ายให้เห็นเส้นชัด", "For clear lines", "让掌纹更清楚",
  "ถ่ายในที่สว่างทั่วถึง แสงกลางวันดีที่สุด ถ้าทำได้ให้แสงมาจากด้านข้าง เส้นจะมีเงาและเห็นชัดขึ้น",
  "Use bright, even light: daylight is best, ideally from the side, so the lines cast a little shadow and show clearly.",
  "在明亮均匀的光线下拍摄，日光最好，光线尽量从侧面照来，掌纹会有阴影、更清楚。",
  "ไม่ใช้แฟลช แสงแฟลชลบเงาในร่องเส้นจนมองไม่เห็น", "No flash: a flash washes the shadows out of the lines.", "不开闪光灯：闪光灯会把掌纹的阴影照没。",
  "ผ่อนมือตามสบาย ให้ฝ่ามือห่อเล็กน้อย ไม่ต้องเหยียดตึงจนแบน", "Keep your hand relaxed and slightly cupped, not stretched flat.",
  "手放松，掌心微微拱起，不要把手绷直撑平。"
];
const NO_FLASH = { th: /ไม่ใช้แฟลช|ปิดแฟลช/, en: /\b(no flash|without (the )?flash|flash off|turn off the flash)\b/i, zh: /不开闪光灯|关闭闪光灯|不要用闪光灯|不用闪光灯/ };
const CUPPED = { th: /ห่อ/, en: /\bcupped\b/i, zh: /微微拱起|微拱|稍微弯曲|微弯/ };
const RELAXED = { th: /ผ่อน|สบาย/, en: /\brelax/i, zh: /放松/ };
const DAYLIGHT = { th: /แสงกลางวัน/, en: /\bdaylight\b/i, zh: /日光|白天的光/ };
const NOT_FLAT = { th: /ไม่ต้องเหยียด|อย่าเหยียด|ไม่เหยียด/, en: /\bnot (stretched|stretch(ed)? flat)|don't stretch|do not stretch/i, zh: /不要(把手)?(伸直|绷直|撑平)|不用(伸直|绷直|撑平)/ };
const FLAT_ORDER = { th: /เหยียดมือให้ตรง|กางนิ้วออก/, en: /\b(straighten your fingers|open your hand and|stretch (your hand|it) flat)\b/i, zh: /把手伸直|张开手指/ };

const imgQ = o => { const im = SY.palmImage(o); return { im, q: PV.photoQuality(im.rgba, im.w, im.h, PV.handFromTaps(im.taps)) }; };

test("upload minimum: PROVISIONAL constants pw >= 360, blown-out <= 2 %; no sharpness limit (171 ก)", () => {
  assert.equal(PV.UPLOAD_MIN.PROVISIONAL, true, "marked PROVISIONAL until calibrated on the pilot");
  assert.equal(PV.UPLOAD_MIN.pw, 360);
  assert.equal(PV.UPLOAD_MIN.clip, 0.02);
  assert.ok(!("sharp" in PV.UPLOAD_MIN), "sharpness is not part of the minimum " + JSON.stringify(PV.UPLOAD_MIN));
  assert.deepEqual(Object.keys(PV.UPLOAD_MIN).sort(), ["PROVISIONAL", "clip", "pw"]);
});

test("upload minimum: the verdict at each limit (below rejected, at or above passes)", () => {
  const good = { pw: 500, sharp: 1.8, clip: 0 };
  const v = (o, source = "upload") => PV.qualityVerdict(Object.assign({}, good, o), { source });
  assert.deepEqual(v({}), { ok: true, fails: [] });
  assert.deepEqual(v({ pw: 359.9 }).fails, ["pw"]); assert.equal(v({ pw: 359.9 }).ok, false);
  assert.equal(v({ pw: 360 }).ok, true);
  assert.deepEqual(v({ clip: 0.0201 }).fails, ["clip"]); assert.equal(v({ clip: 0.02 }).ok, true);
  assert.deepEqual(v({ pw: 200, sharp: 0.2, clip: 0.5 }).fails.sort(), ["clip", "pw"]);
  // 171 ก: sharpness never blocks a photo, whatever its value (the owner's best real pair scored 0.42-0.99)
  for (const sharp of [0, 0.01, 0.42, 0.5, 0.99, 0.999, 1.0, 5, -1, NaN, undefined, null, Infinity]) for (const source of ["upload", "camera"]) {
    const r = v({ sharp }, source);
    assert.deepEqual(r, { ok: true, fails: [] }, `sharp ${sharp} ${source} -> ${JSON.stringify(r)}`);
    const r2 = v({ pw: 359, sharp }, source);
    assert.ok(!r2.fails.includes("sharp"), `sharp ${sharp} ${source} with pw 359 -> ${JSON.stringify(r2)}`);
  }
  // the two remaining limits still block, alone and together, at any sharpness
  for (const sharp of [0.2, 1.8]) {
    assert.deepEqual(v({ pw: 359.9, sharp }).fails, ["pw"]);
    assert.deepEqual(v({ clip: 0.0201, sharp }).fails, ["clip"]);
    assert.deepEqual(v({ pw: 0, clip: 1, sharp }).fails.sort(), ["clip", "pw"]);
    assert.deepEqual(v({ clip: 0.0201, sharp }, "camera").fails, ["clip"]);
  }
  // a missing or broken measure fails closed on the two remaining limits
  assert.ok(v({ pw: NaN }).fails.includes("pw")); assert.ok(v({ clip: NaN }).fails.includes("clip"));
  assert.ok(v({ pw: undefined }).fails.includes("pw")); assert.ok(v({ clip: undefined }, "camera").fails.includes("clip"));
  // a camera still: no flash blow-out (the live hints already ask for a sharp, close palm)
  assert.equal(v({ clip: 0.05 }, "camera").ok, false);
  assert.deepEqual(v({ clip: 0.05 }, "camera").fails, ["clip"]);
  assert.equal(v({ clip: 0.01 }, "camera").ok, true);
});

test("upload minimum on synthetic photos: small photos are rejected, blurred ones pass with S still measured, good ones pass (B2.3 measure)", () => {
  const good = imgQ({ pw: 480 });
  assert.ok(Math.abs(good.q.pw - 480) < 1, "pw " + good.q.pw);
  assert.ok(good.q.sharp >= 1.4 && good.q.clip === 0, "good photo " + JSON.stringify(good.q));
  assert.equal(PV.qualityVerdict(good.q, { source: "upload" }).ok, true, JSON.stringify(good.q));
  const big = imgQ({ pw: 900, seed: 4 });
  assert.equal(PV.qualityVerdict(big.q, { source: "upload" }).ok, true, "pw 900 " + JSON.stringify(big.q));
  const justOver = imgQ({ pw: 385 });
  assert.equal(PV.qualityVerdict(justOver.q, { source: "upload" }).ok, true, "pw 385 " + JSON.stringify(justOver.q));
  const small = imgQ({ pw: 340 });
  assert.ok(Math.abs(small.q.pw - 340) < 1, "pw " + small.q.pw);
  assert.deepEqual(PV.qualityVerdict(small.q, { source: "upload" }).fails, ["pw"], "pw 340 " + JSON.stringify(small.q));
  const tiny = imgQ({ pw: 200 });
  assert.ok(PV.qualityVerdict(tiny.q, { source: "upload" }).fails.includes("pw"));
  const soft = imgQ({ pw: 480, blur: 0.008 });
  assert.ok(Number.isFinite(soft.q.sharp) && soft.q.sharp < 1.0, "blurred S still measured " + soft.q.sharp);
  assert.deepEqual(PV.qualityVerdict(soft.q, { source: "upload" }), { ok: true, fails: [] }, "171 ก: a blurred photo is not blocked " + JSON.stringify(soft.q));
  // a small AND blurred photo is rejected for its size only
  const smallSoft = imgQ({ pw: 340, blur: 0.008 });
  assert.deepEqual(PV.qualityVerdict(smallSoft.q, { source: "upload" }).fails, ["pw"], "pw 340 blurred " + JSON.stringify(smallSoft.q));
  // a blurred, blown-out photo is rejected for the blow-out only
  const softBlown = imgQ({ pw: 480, blur: 0.008, clip: 0.03 });
  assert.deepEqual(PV.qualityVerdict(softBlown.q, { source: "upload" }).fails, ["clip"], "blurred blown-out " + JSON.stringify(softBlown.q));
  const lightBlur = imgQ({ pw: 480, blur: 0.003 });
  assert.equal(PV.qualityVerdict(lightBlur.q, { source: "upload" }).ok, true, "slight blur " + JSON.stringify(lightBlur.q));
  // the measure is scale-free: the same palm at 480 and 900 px gives about the same S
  assert.ok(Math.abs(good.q.sharp - big.q.sharp) / good.q.sharp < 0.25, `S ${good.q.sharp} vs ${big.q.sharp}`);
});

test("flash / blow-out: more than 2 % blown-out pixels on the palm is rejected (upload and camera); 1.5 % passes", () => {
  const blown = imgQ({ pw: 480, clip: 0.03 });
  assert.ok(blown.q.clip > 0.02 && blown.q.clip < 0.04, "clip " + blown.q.clip);
  assert.ok(PV.qualityVerdict(blown.q, { source: "upload" }).fails.includes("clip"));
  assert.ok(PV.qualityVerdict(blown.q, { source: "camera" }).fails.includes("clip"));
  const flash = imgQ({ pw: 480, clip: 0.3 });
  assert.equal(PV.qualityVerdict(flash.q, { source: "camera" }).ok, false, "flash-like 30 % " + flash.q.clip);
  const some = imgQ({ pw: 480, clip: 0.015 });
  assert.ok(some.q.clip > 0.01 && some.q.clip <= 0.02, "clip " + some.q.clip);
  assert.equal(PV.qualityVerdict(some.q, { source: "upload" }).ok, true);
  assert.equal(PV.qualityVerdict(some.q, { source: "camera" }).ok, true);
  // only the palm counts: blown-out background outside the palm ROI does not reject
  const im = SY.palmImage({ pw: 480 });
  for (let y = 0; y < 40; y++) for (let x = 0; x < im.w; x++) { const j = (y * im.w + x) * 4; im.rgba[j] = im.rgba[j + 1] = im.rgba[j + 2] = 255; }
  const q = PV.photoQuality(im.rgba, im.w, im.h, PV.handFromTaps(im.taps));
  assert.equal(q.clip, 0, "background blow-out counted " + q.clip);
});

test("the rejection message is EXACTLY the approved text in TH / EN / ZH, and the user may still draw lines", () => {
  for (const l of LANGS) assert.equal(PV.T("quality.retake", l), RETAKE[l]);
  const all = PV.allTexts().filter(t => t.kind === "ui" && t.key === "quality.retake");
  assert.equal(all.length, 3, "listed in allTexts for the hard-limit scan");
  // below the minimum the state is the normal one: every line "not found", tracing allowed
  const st = PV.newState({ side: "right" });
  const r = PV.setLine(st, "life", { status: "added", cp: [[-0.06, 0.33], [0.13, 0.47], [0.24, 0.63], [0.28, 0.8]] });
  assert.equal(r.ok, true);
});

test("handedness from landmark geometry: left / right, rear and front cameras, rotated hands", () => {
  for (const side of ["left", "right"]) for (const rot of [0, -25, 30, 75, -80, 180]) {
    // rear camera: the image is not mirrored
    const rear = SY.landmarks({ side, rot });
    assert.equal(PV.handSide({ hand: rear.hand, facing: "environment" }).side, side, `rear ${side} rot ${rot}`);
    // front camera: a mirrored image (preview / mirrored selfie); facing "user" means mirrored unless told otherwise
    const front = SY.landmarks({ side, rot, mirror: true });
    assert.equal(PV.handSide({ hand: front.hand, facing: "user" }).side, side, `front ${side} rot ${rot}`);
    assert.equal(PV.handSide({ hand: front.hand, facing: "user", mirrored: true }).side, side, `front explicit mirrored ${side} rot ${rot}`);
    // a raw (not mirrored) front-camera frame: the explicit flag wins
    const raw = SY.landmarks({ side, rot });
    assert.equal(PV.handSide({ hand: raw.hand, facing: "user", mirrored: false }).side, side, `front raw ${side} rot ${rot}`);
  }
});

test("handedness: a reversed model label never decides the side", () => {
  for (const side of ["left", "right"]) for (const facing of ["environment", "user"]) {
    const L = SY.landmarks({ side, mirror: facing === "user", rot: 10 });
    const wrong = side === "left" ? "Right" : "Left";
    for (const handedness of [wrong, { label: wrong, score: 0.99 }, side === "left" ? 0.99 : 0.01, [{ categoryName: wrong, score: 0.98 }]]) {
      const r = PV.handSide({ hand: L.hand, facing, handedness });
      assert.equal(r.side, side, `${side} ${facing} label ${JSON.stringify(handedness)} -> ${JSON.stringify(r)}`);
    }
  }
});

test("handedness: the 7-tap hand (no thumb point) uses the index side; a thumb folded across the palm is not a decision", () => {
  for (const side of ["left", "right"]) {
    const im = SY.palmImage({ pw: 400, side });
    assert.equal(PV.handSide({ hand: PV.handFromTaps(im.taps), facing: "environment" }).side, side, "taps " + side);
    const imM = SY.palmImage({ pw: 400, side, mirror: true });
    assert.equal(PV.handSide({ hand: PV.handFromTaps(imM.taps), facing: "user" }).side, side, "taps mirrored " + side);
    const f = SY.landmarks({ side, foldThumb: true });
    assert.equal(PV.handSide({ hand: f.hand, facing: "environment" }).side, null, "folded thumb " + side);
  }
});

test("handedness: the user's choice is never silently overridden; a disagreement asks (TH / EN / ZH)", () => {
  const geoL = PV.handSide({ hand: SY.landmarks({ side: "left" }).hand, facing: "environment" });
  const c1 = PV.sideCheck("right", geoL);
  assert.equal(c1.side, "right", "the choice stays until the user answers");
  assert.equal(c1.ask, true); assert.equal(c1.detected, "left");
  const c2 = PV.sideCheck("left", geoL);
  assert.equal(c2.ask, false); assert.equal(c2.side, "left");
  const c3 = PV.sideCheck("right", { side: null });
  assert.equal(c3.ask, false); assert.equal(c3.side, "right");
  const want = { th: [/ซ้าย/, /ขวา/], en: [/\bleft\b/i, /\bright\b/i], zh: [/左/, /右/] };
  for (const l of LANGS) {
    const t = PV.sideAskText("left", "right", l);
    assert.ok(t && t.length > 15, l + " " + t);
    assert.ok(want[l].every(re => re.test(t)), `${l}: names both sides: ${t}`);
    assert.ok({ th: /นิ้วโป้ง/, en: /\bthumb\b/i, zh: /拇指/ }[l].test(t), `${l}: says why (the thumb): ${t}`);
  }
});

test("flash / torch off: the camera never turns the torch on; takePhoto asks for fillLightMode 'off' when supported", async () => {
  assert.equal(PV.CAM_OPTS.torch, false);
  assert.equal(PV.CAM_OPTS.facing, "environment");
  assert.deepEqual(PV.photoSettings({ fillLightMode: ["auto", "off", "flash"] }), { fillLightMode: "off" });
  assert.equal(PV.photoSettings({ fillLightMode: ["auto", "flash"] }), null);
  assert.equal(PV.photoSettings(null), null);
  const calls = [];
  class IC { constructor(t) { this.t = t; } getPhotoCapabilities() { return Promise.resolve({ fillLightMode: ["auto", "off", "flash"] }); }
    takePhoto(o) { calls.push(o || null); return Promise.resolve({ w: 4032, h: 3024 }); } }
  const track = { readyState: "live", getSettings: () => ({ width: 1920, height: 1080, facingMode: "environment" }) };
  const video = { videoWidth: 1920, videoHeight: 1080 };
  const r = await PV.grabStill({ track, video, ImageCapture: IC, createCanvas: () => ({ getContext: () => ({ drawImage() {} }) }), decode: b => Promise.resolve({ width: b.w, height: b.h }) });
  assert.equal(r.source, "takePhoto");
  assert.deepEqual(calls, [{ fillLightMode: "off" }]);
  const calls2 = [];
  class IC2 { getPhotoCapabilities() { return Promise.resolve({ fillLightMode: ["auto", "flash"] }); } takePhoto(o) { calls2.push(o || null); return Promise.resolve({ w: 10, h: 10 }); } }
  await PV.grabStill({ track, video, ImageCapture: IC2, createCanvas: () => ({ getContext: () => ({ drawImage() {} }) }), decode: b => Promise.resolve({ width: b.w, height: b.h }) });
  assert.equal(calls2.length, 1); assert.ok(!(calls2[0] && calls2[0].fillLightMode === "flash"), "never asks for flash");
});

test("guidance texts: the pre-capture guidance is EXACTLY the owner-approved 172 text; live hints: daylight, no flash, relaxed slightly cupped hand (TH / EN / ZH)", () => {
  for (const l of LANGS) {
    assert.equal(PV.T("tips.guide", l), GUIDE[l], `${l}: 172 text byte for byte`);
    assert.ok(Buffer.from(PV.T("tips.guide", l), "utf8").equals(Buffer.from(GUIDE[l], "utf8")), `${l}: bytes differ`);
    // the earlier tip keys are gone (T returns the key for an unknown key)
    for (const k of ["tips.light", "tips.flash", "tips.hand", "tips.title"]) assert.equal(PV.T(k, l), k, `${l}: old key ${k} still defined: ${PV.T(k, l)}`);
    for (const other of [false, true]) {
      const h = id => PV.hintText(id, l, other);
      assert.ok(NO_FLASH[l].test(h("glare")), `${l} glare hint: no flash: ${h("glare")}`);
      assert.ok(NO_FLASH[l].test(h("bright")), `${l} bright hint: no flash: ${h("bright")}`);
      assert.ok(DAYLIGHT[l].test(h("dark")) && NO_FLASH[l].test(h("dark")), `${l} dark hint: daylight, no flash: ${h("dark")}`);
      assert.ok(CUPPED[l].test(h("open")) && NOT_FLAT[l].test(h("open")), `${l} open hint: cupped, not flat: ${h("open")}`);
      assert.ok(RELAXED[l].test(h("noHand")), `${l} noHand hint: relaxed: ${h("noHand")}`);
    }
  }
  // no text tells the user to stretch the hand flat or open it wide
  const bad = PV.allTexts().filter(t => (t.kind === "hint" || t.kind === "ui") && FLAT_ORDER[t.lang] && FLAT_ORDER[t.lang].test(t.text));
  assert.deepEqual(bad.map(t => `${t.key} ${t.lang}: ${t.text}`), []);
  // the guidance is listed for the hard-limit scan, once per language; the old tip keys are not
  const ui = PV.allTexts().filter(t => t.kind === "ui");
  const keys = new Set(ui.map(t => t.key));
  for (const k of ["tips.guide", "quality.retake"]) assert.ok(keys.has(k), k + " in allTexts");
  for (const k of ["tips.light", "tips.flash", "tips.hand", "tips.title"]) assert.ok(!keys.has(k), k + " still in allTexts");
  const g = ui.filter(t => t.key === "tips.guide");
  assert.equal(g.length, 3);
  for (const t of g) assert.equal(t.text, GUIDE[t.lang], t.lang);
  // the old tip texts are gone from every text (whole or as a part)
  const left = PV.allTexts().filter(t => OLD_TIPS.some(o => t.text.includes(o)));
  assert.deepEqual(left.map(t => `${t.key} ${t.lang}: ${t.text}`), []);
});

test("palm.html: the guidance block shows only the 172 key; the old tip keys and texts are not in the page source", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync(path.join(ROOT, "palm.html"), "utf8");
  const block = (html.match(/<div class="pv2-tips" id="pv2Tips">([\s\S]*?)<\/div>/) || [])[1];
  assert.ok(block, "#pv2Tips block in palm.html");
  const keys = [...block.matchAll(/data-pv2-t="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(keys, ["tips.guide"], "guidance keys in #pv2Tips " + JSON.stringify(keys));
  for (const k of ["tips.light", "tips.flash", "tips.hand", "tips.title"]) assert.ok(!html.includes(`"${k}"`), `palm.html still names ${k}`);
  for (const f of ["palm.html", "palm-v2.js", "palm-v2-ui.js"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    const left = OLD_TIPS.filter(o => src.includes(o));
    assert.deepEqual(left, [], `${f} still holds old tip text`);
  }
});

test("no sharpness number is shown to the user: no user text names sharpness with a value or a placeholder (TH / EN / ZH)", () => {
  const SHARP_WORD = /sharpness|\bsharp\b|ความคม|คมชัด|清晰度|锐度/i;
  const NUM_OR_SLOT = /\d|\{[^}]*\}|%s|\$\{/;
  const bad = PV.allTexts().filter(t => SHARP_WORD.test(t.text) && NUM_OR_SLOT.test(t.text));
  assert.deepEqual(bad.map(t => `${t.key} ${t.lang}: ${t.text}`), []);
  // the UI module never writes the measured sharpness into the page
  const fs = require("node:fs");
  const ui = fs.readFileSync(path.join(ROOT, "palm-v2-ui.js"), "utf8");
  const writes = ui.split("\n").filter(l => /\.sharp\b/.test(l) && /textContent|innerHTML|innerText|insertAdjacent|msg\(|setTapMsg\(|setAttribute|\.title\s*=|aria-label/.test(l));
  assert.deepEqual(writes, [], "palm-v2-ui.js writes sharpness into the page");
});
