TensorFlow.js 4.7.0 runtime on its own (no face models) — vendor/tfjs/

Why: the Exam pages (exam-lab.html, exam-hall.html) run COCO-SSD for phones / books / laptops / screens / people and
used to get TF.js from inside vendor/face-api.js. Since the Exam face switch (2026-11-10, docs/exam/FACE-ENGINE-RESULTS.md)
Exam loads this runtime instead, so a customer build of Exam never loads face-api.js. It is the same TF.js version that
face-api.js 1.7.12 bundles, and the WASM binaries already in vendor/ (tfjs-backend-wasm*.wasm) are byte-identical to the
4.7.0 release, so both runtimes share them.

File                           Bytes      sha256                                                            Source (npm, via jsDelivr, downloaded 2026-11-10)
tf.es2017.min.js               1,100,608  da42fabcf96a4a87cb0bba09173b29ccc4e21aa56ace2b7078e5f0940a0d411f  https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.7.0/dist/tf.es2017.min.js
tf-backend-wasm.es2017.min.js    144,350  eab0c083fd64067c1ecdd5e505924b8e4f68c688a4c8f7aea468b88dc5ef9b64  https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.7.0/dist/tf-backend-wasm.es2017.min.js

Why the ES2017 builds: the default tf.min.js (ES5) carries regenerator-runtime, which falls back to Function("...") when
it cannot assign a global; the pages' CSP (script-src 'self' 'wasm-unsafe-eval', no 'unsafe-eval') blocks that and the
script throws. The ES2017 builds use native async functions and contain no string evaluation.

WASM binaries used (already vendored, checked identical to @tensorflow/tfjs-backend-wasm@4.7.0/dist):
  vendor/tfjs-backend-wasm.wasm               70a5d516060464e5269f01c74bac1772d6b8ab6cb612acf16b5cdaf61f78d892
  vendor/tfjs-backend-wasm-simd.wasm          77ebb28a6d34f371dbbf2086b7f2de8994acd8ea5a3cf1fa24d2c26c840cac7b
  vendor/tfjs-backend-wasm-threaded-simd.wasm c052228d4bef185c27bbe59a9e029570c78bbb9f08b3cb46b597851650373de2

Licence: Apache License 2.0 (package.json "license": "Apache-2.0"; each file starts with the Apache-2.0 header,
"Copyright 2023 Google LLC"). LICENSE here is the Apache-2.0 text. Unchanged.
Use: lensiq-detect.js uses window.tf when it is present, otherwise faceapi.tf (every other page is unchanged).
