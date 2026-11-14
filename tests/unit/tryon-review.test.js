"use strict";
// tests/unit/tryon-review.test.js — fixes asked by the independent review of tryon-fit (coordinator, 2026-11-14).
// FIXED TEST SET: written and hash-locked (evals-locks/tryon-mvp.sha256, append-only) BEFORE the fixes were coded.
//
//   V1 (B1) an editor saving a published / hidden item never sends status "": the form sends the chosen status, or
//      leaves it out when the editor did not change it (LQTryOn.formStatus); admin-tryon.js uses it
//   V2 (B2) the "no face remains" checkbox and the "no face found" status message are two keys, both in TH / EN / ZH
//   V3 the customer page lists only categories it can draw (no skirts / trousers yet: LQTryOn.DRAWABLE)
//   V4 with more than one face in the picture nothing is drawn (LQTryOn.anchorsFor returns null)
//   V5 studio fit handles: touch radius ≥ 24 CSS px whatever the canvas scale; the hint names hem points only when the hem
//      handles are visible (a second key without the hem, TH / EN / ZH)
//   V6 every error code the try-on Worker (and the delete re-auth) can return has an EN and a ZH text, and a Thai default
//   V7 a non-numeric price is a validation error in the form (LQTryOn.parseBaht -> NaN, message at.v.price), never cleared
//   V8 LICENSES/THIRD_PARTY.md names the try-on page and the admin face blur where the models are used
//   V9 the fit scorer refuses to overwrite an existing results file (exit ≠ 0, file unchanged, nothing measured)
//   V10 docs/BACKEND.md says to apply migration 0017 BEFORE deploying this Worker; admin delete sends a body (so the
//       try-on admin's inline re-auth works) and the admin shell serves lensiq-tryon-core.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const os = require("node:os");
const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const TO = require(path.join(ROOT, "lensiq-tryon-core.js"));

test("V1: formStatus never returns an empty status; an unchanged status is left out", () => {
  assert.equal(typeof TO.formStatus, "function");
  for (const cur of ["draft", "in_review", "published", "hidden", null]) for (const sel of ["", undefined, null]) {
    const r = TO.formStatus(sel, cur);
    assert.ok(r === undefined, `selected ${sel} current ${cur} -> ${r}`);
  }
  assert.equal(TO.formStatus("published", "published"), undefined, "unchanged: left out");
  assert.equal(TO.formStatus("in_review", "published"), "in_review");
  assert.equal(TO.formStatus("draft", null), "draft");
  const js = read("admin-tryon.js");
  assert.match(js, /formStatus\(/);
  assert.ok(!/status:\s*f\.status\.value\b/.test(js), "the raw select value is not sent");
  assert.match(read("admin.html"), /<script src="lensiq-tryon-core\.js(\?v=\d+)?"><\/script>/);
});

test("V2: checkbox label and status message use different keys, all in TH / EN / ZH", () => {
  const html = read("admin.html"), js = read("admin-tryon.js");
  const label = /<input type="checkbox" id="atNoFace">\s*<span data-i18n="([^"]+)"/.exec(html);
  assert.ok(label, "checkbox label key");
  const msgKeys = [...js.matchAll(/G\("(at\.img\.[\w.]+)"/g)].map(m => m[1]);
  assert.ok(!msgKeys.includes(label[1]), "the checkbox key is not reused for a status message: " + label[1]);
  assert.ok(msgKeys.includes("at.img.noFace"), "the 'no face found' message keeps its key");
  for (const f of ["i18n/en-admin.js", "i18n/zh-admin.js"]) {
    const src = read(f), m = new RegExp(`"${label[1].replace(/\./g, "\\.")}":\\s*"([^"]+)"`).exec(src);
    assert.ok(m, f + " has " + label[1]);
    assert.ok(!/^No face found|^图片中未发现/.test(m[1]), f + ": the checkbox is a confirmation, not a result: " + m[1]);
  }
});

test("V3: the page lists only categories it can draw", () => {
  assert.deepEqual([...TO.DRAWABLE].sort(), ["dresses", "earrings", "glasses", "hats", "necklaces", "outerwear", "tops"]);
  assert.match(read("tryon.js"), /TO\.DRAWABLE/);
});

test("V4: more than one face -> no anchors (nothing drawn)", () => {
  const one = Array.from({ length: 478 }, (_, i) => ({ x: .5 + (i % 7) * .01, y: .5 + (i % 5) * .01 }));
  assert.ok(TO.anchorsFor([one], 640, 480), "one face: anchors");
  assert.equal(TO.anchorsFor([one, one], 640, 480), null, "two faces: nothing");
  assert.equal(TO.anchorsFor([], 640, 480), null);
  assert.match(read("tryon.js"), /TO\.anchorsFor\(/);
});

test("V5: studio handles: ≥ 24 CSS px touch radius from the displayed size; hem hint only when hem handles are visible", () => {
  const js = read("studio.js");
  assert.match(js, /getBoundingClientRect\(\)[\s\S]{0,200}24/, "radius from the displayed size");
  assert.match(js, /T\("studio\.js\.hint\.fitPtsNoHem",\s*"[^"]+"/);
  assert.ok(!/T\("studio\.js\.hint\.fitPtsNoHem",\s*"[^"]*ชายเสื้อ/.test(js), "no hem in the no-hem hint (TH)");
  for (const [f, bad] of [["i18n/en-studio.js", /hem/i], ["i18n/zh-studio.js", /下摆/]]) {
    const m = /"studio\.js\.hint\.fitPtsNoHem":\s*"([^"]+)"/.exec(read(f));
    assert.ok(m && !bad.test(m[1]), f);
  }
});

test("V6: every try-on error code has EN / ZH text and a Thai default", () => {
  const src = read("backend/src/tryon.js");
  const codes = new Set([...src.matchAll(/bad\("([a-z_]+)"/g), ...src.matchAll(/code: "([a-z_]+)"/g)].map(m => m[1]));
  for (const c of ["reauth_inline_required", "reauth_required", "invalid_credentials", "invalid_totp", "not_found"]) codes.add(c);
  assert.ok(codes.size >= 20, "codes found: " + codes.size);
  const js = read("admin-tryon.js");
  for (const c of codes) {
    for (const f of ["i18n/en-admin.js", "i18n/zh-admin.js"]) assert.ok(read(f).includes(`"at.e.${c}":`), `${f} misses at.e.${c}`);
    assert.ok(new RegExp(`\\b${c}:\\s*"`).test(js), "Thai default for " + c);
  }
});

test("V7: a non-numeric price is a form error, never silently cleared", () => {
  assert.equal(TO.parseBaht(""), null);
  assert.equal(TO.parseBaht(" 12.50 "), 1250);
  assert.equal(TO.parseBaht("1,200"), 120000);
  for (const bad of ["abc", "12a", "-5", "1.234", "฿12"]) assert.ok(Number.isNaN(TO.parseBaht(bad)), bad);
  const js = read("admin-tryon.js");
  assert.match(js, /parseBaht\(/); assert.match(js, /at\.v\.price/);
  for (const f of ["i18n/en-admin.js", "i18n/zh-admin.js"]) assert.ok(read(f).includes('"at.v.price":'), f);
});

test("V8: THIRD_PARTY.md names the try-on page and the admin face blur", () => {
  const md = read("LICENSES/THIRD_PARTY.md");
  assert.match(md, /tryon\.html/); assert.match(md, /admin-tryon\.js/);
});

test("V9: the fit scorer refuses to overwrite an existing results file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fit-")), f = path.join(dir, "r.json");
  fs.writeFileSync(f, "KEEP");
  const t0 = Date.now(), r = spawnSync(process.execPath, [path.join(ROOT, "tools", "studio-fit-eval.mjs"), "--out=" + f], { encoding: "utf8" });
  assert.notEqual(r.status, 0, "non-zero exit");
  assert.equal(fs.readFileSync(f, "utf8"), "KEEP", "file unchanged");
  assert.ok(Date.now() - t0 < 15000, "refused before measuring");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("V10: BACKEND.md orders migration 0017 before the deploy; delete sends a body; admin shell serves the core", async () => {
  const md = read("docs/BACKEND.md");
  assert.match(md, /0017_tryon\.sql[\s\S]{0,400}(before|BEFORE) (deploying|you deploy)/);
  assert.match(read("admin-tryon.js"), /method: "DELETE", body: \{\}/);
  const { ADMIN_ASSETS } = await import(path.join(ROOT, "backend", "src", "index.js"));
  assert.ok(ADMIN_ASSETS.has("/lensiq-tryon-core.js"));
  assert.match(read("backend/scripts/build-admin.mjs"), /"lensiq-tryon-core\.js"/);
});
