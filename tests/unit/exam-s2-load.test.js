"use strict";
// tests/unit/exam-s2-load.test.js — Exam lab acceptance sheet (docs/acceptance/exam-lab.md) criterion S2, load order of
// exam-lab.html and exam-dashboard.html (branch examlab-s2, 2026-11-20). Locked BEFORE any product change
// (evals-locks/examlab-s2.sha256).
// Cause measured on main 299370b8 (tools/exam-s2.mjs, synthetic): the CSP <meta> turns off Chrome's preload scanner, so each
// page script was fetched only when the parser reached it (one 562 ms round trip each on Fast 3G), and exam-lab.html also
// downloaded TF.js (1.25 MB uncompressed) before its first control worked, although TF.js is used only after the camera starts.
// Guards:
//   1. every page script is listed as <link rel="preload" as="script"> in <head>, before the first script tag, with the SAME
//      URL (a ?v= drift would download a file twice); a preload names a page script or a file nav.js adds with nav.js's ?v=;
//      no duplicates; no model or TF.js file is preloaded;
//   2. exam-lab.html has no TF.js script tag: exam-lab.js loads vendor/tfjs/tf.es2017.min.js, then
//      vendor/tfjs/tf-backend-wasm.es2017.min.js, on demand (camera start), in that order, and never vendor/face-api.js;
//      loadModels() loads TF.js before it asks LQDetect for a backend; the loader is reachable for the measuring harnesses
//      (window.__LQ_EXAM_LAB.loadTf).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const MODEL_RE = /(\.(onnx|ort|tflite|task|wasm|pb|traineddata)(\?|#|$))|(weights_manifest\.json)|(vendor\/models\/)|(-shard\d+)|(model\.json)|(vendor\/tfjs\/)|(face-api)/i;

for (const page of ["exam-lab.html", "exam-dashboard.html"]) {
  test(page + ": every page script is preloaded in <head> with the same URL, before the first script tag", () => {
    const html = read(page);
    const head = html.slice(0, html.indexOf("</head>"));
    const scripts = [...html.matchAll(/<script src="([^"]+)"[^>]*><\/script>/g)].map(m => m[1]);
    const preloads = [...html.matchAll(/<link rel="preload" as="script" href="([^"]+)">/g)].map(m => m[1]);
    assert.ok(scripts.length >= 10, "page scripts found");
    const nav = scripts.find(s => s.startsWith("nav.js?"));
    assert.ok(nav, "nav.js present");
    const q = nav.slice(nav.indexOf("?"));
    const injected = ["lensiq-i18n.js" + q, "i18n/zh-common.js" + q];
    for (const s of scripts) assert.ok(preloads.includes(s), page + ": script not preloaded: " + s);
    for (const p of injected) assert.ok(preloads.includes(p), page + ": nav.js file not preloaded: " + p);
    for (const p of preloads) assert.ok(scripts.includes(p) || injected.includes(p), page + ": preload without a matching script: " + p);
    assert.equal(new Set(preloads).size, preloads.length, page + ": duplicate preload");
    for (const p of preloads) {
      const at = head.indexOf(`<link rel="preload" as="script" href="${p}">`);
      assert.ok(at >= 0, page + ": preload outside <head>: " + p);
      assert.ok(at < html.indexOf("<script src="), page + ": preload after the first script tag: " + p);
      assert.ok(!MODEL_RE.test(p), page + ": model or TF.js file preloaded: " + p);
    }
  });
}

test("exam-lab.html: no TF.js script tag; exam-lab.js loads TF.js then the wasm backend on demand, never face-api.js", () => {
  const html = read("exam-lab.html");
  assert.ok(!/vendor\/tfjs\//.test(html), "exam-lab.html names no vendor/tfjs file");
  assert.ok(!/face-api/.test(html), "exam-lab.html names no face-api file");
  const code = read("exam-lab.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1"); // code only
  const a = code.indexOf('"vendor/tfjs/tf.es2017.min.js"'), b = code.indexOf('"vendor/tfjs/tf-backend-wasm.es2017.min.js"');
  assert.ok(a >= 0 && b > a, "TF.js before its wasm backend in exam-lab.js");
  assert.ok(!/face-api/.test(code), "exam-lab.js never loads face-api.js");
  const lm = code.slice(code.indexOf("async function loadModels"));
  const lt = lm.indexOf("await loadTf()"), tb = lm.indexOf("LQDetect.tfBackend()");
  assert.ok(lt >= 0 && tb > lt, "loadModels() loads TF.js before LQDetect.tfBackend()");
  assert.match(code, /__LQ_EXAM_LAB = \{[\s\S]*?\bloadTf\b[\s\S]*?\};/, "window.__LQ_EXAM_LAB.loadTf");
});
