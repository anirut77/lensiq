"use strict";
// tests/unit/pc-live.test.js — Product Check LIVE SCAN (owner order 2026-11-12): FIXED TEST SET written before
// lensiq-pc-live.js was built (sha256 recorded in ~/LENSIQ-field/evals/live-scan/locked.sha256).
//   1. per-frame checks on a downscaled frame: "no label", "too dark", "move closer", "glare", "hold still" (motion or
//      blur), "ok"; frame analysis is throttled to <= 5 frames per second;
//   2. auto-capture: N steady good frames; a moving frame starts the count again; a scene cut is reported; a blurred
//      but steady view is still captured after the patience window (the OCR decides, the user is not stuck);
//   3. reading merged across frames: vote per line, a line seen once in three readings is dropped, OCR variants
//      collapse to the most-voted (then longest) reading, the order of the label is kept, reset() forgets everything;
//   4. the live checklist: barcode / registration number / ingredients;
//   5. product key for "one AI call per product": GTIN, else registration number, else a hash of the merged text (the
//      key never carries label text);
//   6. TESTER-ONLY auto-send decision: every refusal reason (not a tester, no remembered auto consent, page hidden,
//      product-label gate, name guard incl. possible names, face found or face detector not run, product already
//      sent, session cap) and the one allowed case; real guard on real texts (dispensing label, parcel label, name).
// Synthetic frames and texts only; no network, no image of a person.
const test = require("node:test");
const assert = require("node:assert/strict");

const L = require("../../lensiq-pc-live.js");
const P = require("../../lensiq-pc.js");
const G = require("../../lensiq-pc-guard.js");

/* ---------- synthetic frames (ImageData-like) ---------- */
function mk(w, h, v) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = v; d[4 * i + 3] = 255; }
  return { width: w, height: h, data: d };
}
function rect(im, x, y, w, h, v) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    if (i < 0 || j < 0 || i >= im.width || j >= im.height) continue;
    const k = 4 * (j * im.width + i); im.data[k] = im.data[k + 1] = im.data[k + 2] = v;
  }
}
/** rows of glyph-like dark strokes (a printed label seen from the camera) */
function text(im, x0, y0, w, h, ink = 20, seed = 1) {
  let s = seed;
  const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let y = y0; y + 9 <= y0 + h; y += 14) {
    let x = x0;
    while (x + 6 <= x0 + w) { const gw = 2 + Math.floor(r() * 4); rect(im, x, y, gw, 9, ink); x += gw + 2 + (r() < 0.15 ? 5 : 0); }
  }
  return im;
}
function blur(im, rad) {
  const w = im.width, h = im.height, o = mk(w, h, 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) {
      const xx = Math.min(w - 1, Math.max(0, x + i)), yy = Math.min(h - 1, Math.max(0, y + j));
      s += im.data[4 * (yy * w + xx)]; n++;
    }
    const v = s / n, k = 4 * (y * w + x); o.data[k] = o.data[k + 1] = o.data[k + 2] = v;
  }
  return o;
}
function shift(im, dx) {
  const o = mk(im.width, im.height, 235);
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
    const sx = x - dx; if (sx < 0 || sx >= im.width) continue;
    for (let c = 0; c < 4; c++) o.data[4 * (y * im.width + x) + c] = im.data[4 * (y * im.width + sx) + c];
  }
  return o;
}
const label = () => text(mk(320, 240, 235), 20, 20, 280, 200);
const stats = (im, prev) => L.frameStats(im, prev ? prev.thumb : null);

test("frame checks: no label / too dark / move closer / glare / hold still / ok, on a 320 px frame", () => {
  const ok = stats(label());
  assert.equal(L.hintOf(stats(label(), ok)), "ok", "a steady, sharp label filling the frame");
  assert.equal(L.hintOf(stats(mk(320, 240, 235))), "nolabel", "a blank frame: point at the label");
  assert.equal(L.hintOf(stats(text(mk(320, 240, 20), 20, 20, 280, 200, 4))), "dark", "a dark frame");
  const small = text(mk(320, 240, 235), 140, 100, 60, 40);
  assert.equal(L.hintOf(stats(small, stats(small))), "closer", "a label that fills a small part of the frame: move closer");
  const gl = text(mk(320, 240, 200), 20, 20, 280, 200);
  rect(gl, 140, 100, 40, 40, 255);
  assert.equal(L.hintOf(stats(gl, stats(gl))), "glare", "a compact white spot on the label: glare");
  const b = blur(label(), 3);
  assert.equal(L.hintOf(stats(b, stats(b))), "hold", "a blurred label: hold still");
  const a = label(), moved = shift(a, 24);
  const m = stats(moved, stats(a));
  assert.ok(m.motion > L.CFG.motionMax, "a shifted frame shows motion " + m.motion);
  assert.equal(L.hintOf(m), "hold", "the camera moved: hold still");
  const s = stats(a);
  for (const k of ["sharp", "edge", "area", "mean", "motion"]) assert.equal(typeof s[k], "number", k);
  assert.ok(s.thumb && s.thumb.length > 0 && s.thumb.length <= 64 * 48, "a small thumbnail for the motion check");
});

test("battery: frame analysis is throttled to at most 5 frames per second; analysis frame <= 320 px", () => {
  assert.ok(L.CFG.fps > 0 && L.CFG.fps <= 5, "fps " + L.CFG.fps);
  assert.ok(L.interval() >= 200, "interval " + L.interval());
  assert.ok(L.interval({ ...L.CFG, fps: 30 }) >= 200, "a higher setting is capped at 5 fps");
  assert.ok(L.CFG.side <= 320, "analysis side " + L.CFG.side);
  assert.ok(L.CFG.readsPerScene >= 2 && L.CFG.readsPerScene <= 6, "a bounded number of OCR passes per steady view");
});

test("auto-capture: N steady good frames; movement restarts the count; a scene cut is reported; a steady blurred view is captured after the patience window", () => {
  const N = L.CFG.stableFrames;
  assert.ok(N >= 2 && N <= 6, "N " + N);
  const s = L.makeStabilizer();
  const a = label();
  let prev = stats(a), r;
  for (let i = 1; i < N; i++) { r = s.push(stats(a, prev)); assert.equal(r.stable, false, "not yet at frame " + i); }
  r = s.push(stats(a, prev));
  assert.equal(r.stable, true, "stable at frame N");
  // the camera moves: the count starts again
  const moved = shift(a, 24);
  r = s.push(stats(moved, prev)); prev = stats(moved);
  assert.equal(r.stable, false, "movement breaks the run");
  assert.equal(r.run, 0);
  for (let i = 1; i < N; i++) r = s.push(stats(moved, prev));
  assert.equal(r.stable, false, "N - 1 steady frames are not enough");
  r = s.push(stats(moved, prev));
  assert.equal(r.stable, true);
  // another object entirely: a scene cut (the merged reading must start over)
  const other = text(mk(320, 240, 120), 0, 0, 320, 240, 250, 7);
  r = s.push(stats(other, prev));
  assert.equal(r.cut, true, "a scene cut is reported");
  // a blank frame is never "stable"
  const s2 = L.makeStabilizer(), blank = mk(320, 240, 235);
  for (let i = 0; i < 30; i++) r = s2.push(stats(blank, stats(blank)));
  assert.equal(r.stable, false, "no label, no capture");
  // steady but blurred: captured after the patience window, never before N frames
  const s3 = L.makeStabilizer(), b = blur(a, 3), bs = stats(b);
  let at = -1;
  for (let i = 0; i < 40 && at < 0; i++) { if (s3.push(stats(b, bs)).stable) at = i + 1; }
  assert.ok(at > N, "a blurred view waits longer than a sharp one: " + at);
  assert.ok(at <= L.CFG.blurPatience + N, "but it is captured within the patience window: " + at);
  s3.reset();
  assert.equal(s3.push(stats(a, stats(a))).run, 1, "reset starts again");
});

test("merge across frames: vote per line, the most-voted (then longest) reading, the label's order, a once-seen line dropped after three readings", () => {
  const m = L.makeMerger();
  m.add(["TESTOL 500 mg", "เลขทะเบียน 1A 844/39", "ส่วนประกอบ: พาราเซตามอล 500 มก.", "EXP 01/2028"]);
  assert.equal(m.text(), "TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nส่วนประกอบ: พาราเซตามอล 500 มก.\nEXP 01/2028", "one reading = that reading");
  m.add([{ text: "TESTO1 500 mg", conf: 0.6 }, { text: "เลขทะเบียน 1A 844/39", conf: 0.9 }, { text: "@@ ~~ ##", conf: 0.3 }, { text: "ส่วนประกอบ: พาราเซตามอล 500 มก.", conf: 0.9 },
    { text: "EXP 01/2028", conf: 0.9 }]);
  assert.equal(m.frames, 2);
  assert.ok(m.text().includes("@@ ~~ ##"), "two readings: a line seen once is still kept");
  m.add(["TESTOL 500 mg", "เลขทะเบียน 1A 844/3", "ส่วนประกอบ: พาราเซตามอล 500 มก.", "EXP 01/2028"]);
  assert.equal(m.text(), "TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nส่วนประกอบ: พาราเซตามอล 500 มก.\nEXP 01/2028",
    "three readings: OCR variants collapse to the most-voted reading, the stray line is dropped, the order is kept");
  const ls = m.lines();
  assert.ok(ls.every(l => typeof l.text === "string" && l.votes >= 2), "every kept line was seen at least twice");
  // tie between two readings of one line: the longer reading wins
  const t = L.makeMerger();
  t.add(["ส่วนประกอบ: พาราเซตามอล"]); t.add(["ส่วนประกอบ: พาราเซตามอล 500"]);
  assert.equal(t.text(), "ส่วนประกอบ: พาราเซตามอล 500", "tie: the longest consistent reading");
  // a line missing from one reading (cut by the frame edge) is kept when the others saw it
  const c = L.makeMerger();
  c.add(["A LINE ONE", "BRAVO LINE TWO", "CHARLIE LINE THREE"]); c.add(["BRAVO LINE TWO", "CHARLIE LINE THREE"]); c.add(["A LINE ONE", "BRAVO LINE TWO"]);
  assert.equal(c.text(), "A LINE ONE\nBRAVO LINE TWO\nCHARLIE LINE THREE");
  m.reset();
  assert.equal(m.text(), ""); assert.equal(m.frames, 0);
  assert.ok(L.similarity("TESTOL 500 mg", "TESTO1 500 mg") >= 0.8 && L.similarity("TESTOL 500 mg", "EXP 01/2028") < 0.5, "line similarity");
});

test("live checklist: barcode / registration number / ingredients found", () => {
  const deps = { P, G };
  const full = L.checklist("TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nส่วนประกอบ: พาราเซตามอล 500 มก.", [{ rawValue: "8850006939727", format: "ean_13" }], deps);
  assert.deepEqual(full, { barcode: true, reg: true, ingredients: true });
  assert.deepEqual(L.checklist("Ingredients: water, glycerin", [], deps), { barcode: false, reg: false, ingredients: true });
  assert.deepEqual(L.checklist("ซาแมพลาม็อล ตราสาธิต\nบรรเทาปวด", [], deps), { barcode: false, reg: false, ingredients: false });
  assert.equal(L.checklist("", [{ rawValue: "8850006939728", format: "ean_13" }], deps).barcode, false, "a barcode with a wrong check digit does not count");
});

test("product key (one AI call per product): GTIN, else registration number, else a hash of the merged text; never the text itself", () => {
  assert.equal(L.productKey({ gtins: ["8850006939727"], regs: ["1A 844/39"], text: "x" }), "g:8850006939727");
  assert.equal(L.productKey({ gtins: [], regs: ["1A 844/39"], text: "x" }), "r:1A84439");
  const k1 = L.productKey({ gtins: [], regs: [], text: "ซาแมพลาม็อล ตราสาธิต\nบรรเทาปวด" });
  const k2 = L.productKey({ text: "ซาแมพลาม็อล  ตราสาธิต \n บรรเทาปวด" });
  const k3 = L.productKey({ text: "อีกสินค้าหนึ่ง\nคนละตัว" });
  assert.match(k1, /^t:[0-9a-f]{8}$/);
  assert.equal(k1, k2, "spacing does not change the key");
  assert.notEqual(k1, k3, "another text, another key");
  assert.ok(!/[ก-๙]/.test(k1), "no label text in the key");
});

test("auto-send decision (TESTERS ONLY): every refusal reason, in order, and the one allowed case", () => {
  const base = { tester: true, autoOn: true, hidden: false, gate: { allow: true, reason: "ok" }, hits: 0, maybe: 0, face: { ran: true, faces: 0 }, key: "g:1", sent: [], count: 0,
    cap: 10 };
  assert.deepEqual(L.autoDecision(base), { send: true, reason: "ok" });
  const no = (o, why) => assert.deepEqual(L.autoDecision({ ...base, ...o }), { send: false, reason: why }, why);
  no({ tester: false }, "not-tester");
  no({ autoOn: false }, "no-auto-consent");
  no({ hidden: true }, "hidden");
  no({ gate: { allow: false, reason: "dispensing" } }, "gate:dispensing");
  no({ gate: { allow: false, reason: "personal-doc" } }, "gate:personal-doc");
  no({ gate: { allow: false, reason: "no-product" } }, "gate:no-product");
  no({ hits: 1 }, "name-guard");
  no({ maybe: 1 }, "name-guard");
  no({ face: { ran: true, faces: 1 } }, "face");
  no({ face: { ran: false, faces: 0 } }, "face-unknown");
  no({ face: null }, "face-unknown");
  no({ sent: ["g:1"] }, "already-sent");
  no({ count: 10 }, "session-cap");
  // precedence: a non-tester is refused first, whatever else holds
  assert.equal(L.autoDecision({ ...base, tester: false, hidden: true, hits: 3 }).reason, "not-tester");
  assert.equal(L.autoDecision({ ...base, hidden: true, gate: { allow: false, reason: "dispensing" } }).reason, "hidden", "nothing is sent while the page is hidden");
  assert.ok(L.CFG.autoCap >= 1 && L.CFG.autoCap <= 20, "a per-session cap " + L.CFG.autoCap);
});

test("auto-send text check with the REAL guard: product label passes; dispensing label, parcel label, a name or a possible name do not", () => {
  const LABEL = "ยาแก้ปวด TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nส่วนประกอบ: พาราเซตามอล 500 มก.\nEXP 01/2028";
  const DISP = "ร้านยาสาธิต\nสมพร ใจสมมติ\nHN 6512345\nรับประทานครั้งละ 1 เม็ด\n" + LABEL;
  const SHIP = "ผู้รับ: คุณสมมติ ใจทดสอบ\nโทร 081-234-5678\n55/12 ซอยสาธิต 3 แขวงตัวอย่าง เขตบางรัก กรุงเทพฯ 10500\nสินค้า: " + LABEL.replace(/\n/g, " ") + "\nผู้ส่ง: ร้านยาสาธิต";
  const base = { tester: true, autoOn: true, hidden: false, face: { ran: true, faces: 0 }, key: "k", sent: [], count: 0, cap: 10 };
  const run = t => L.autoDecision({ ...base, ...L.autoTextCheck(G, t, { gtins: [], regs: [] }) });
  assert.deepEqual(run(LABEL), { send: true, reason: "ok" });
  assert.equal(run(DISP).reason, "gate:dispensing");
  assert.equal(run(SHIP).reason, "gate:personal-doc");
  assert.equal(run(LABEL + "\nโทร 081-234-5678").reason, "name-guard", "a personal phone");
  assert.equal(run(LABEL + "\nSomchai Jaidee").reason, "name-guard", "a possible name (not removed by the guard) still stops auto-send");
  assert.equal(run("ซาแมพลาม็อล ตราสาธิต\nบรรเทาปวด ลดไข้").reason, "gate:no-product", "a front panel");
  const c = L.autoTextCheck(G, LABEL, { gtins: [], regs: [] });
  assert.equal(c.hits, 0); assert.equal(c.maybe, 0); assert.equal(c.gate.allow, true);
  // session evidence (option ข) is never used for an auto-send
  assert.equal(L.autoTextCheck(G, "ซาแมพลาม็อล ตราสาธิต\nบรรเทาปวด ลดไข้", { gtins: [], regs: [] }, { sessionFacts: { gtins: ["8850006939727"], regs: [] } }).gate.allow, false);
});
