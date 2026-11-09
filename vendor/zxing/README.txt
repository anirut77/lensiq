Barcode fallback for LENSIQ Product Check (lensiq-pc-run.js barcodes()) — browsers without a native BarcodeDetector
(iOS Safari, Firefox, desktop Chrome on Linux / Windows). vendor/zxing/

File                            Source (npm, unchanged)                                     Bytes    sha256
barcode-detector-ponyfill.js    barcode-detector@3.2.3  dist/iife/ponyfill.js (global BarcodeDetectionAPI)   43,758  915a6febe3edd6dab6a7c5a21f69cadd54e1d095cdde9a3eb62605b3db71bf60
zxing_reader.wasm               zxing-wasm@3.1.6        dist/reader/zxing_reader.wasm (reader-only build)   946,860  5003fb4b88c4fbd1fd518a2fd8c8ad365c519e183a08c03a322dddfea3cea84e
Downloaded with `npm pack` on 2026-11-09 (both versions published 2026-10-19). https://github.com/Sec-ant/barcode-detector ,
https://github.com/Sec-ant/zxing-wasm , https://github.com/zxing-cpp/zxing-cpp

Licences:
  barcode-detector — MIT, Copyright (c) 2023 Ze-Zheng Wu (LICENSE-barcode-detector)
  zxing-wasm glue  — MIT, Copyright (c) 2023 Ze-Zheng Wu (LICENSE-zxing-wasm)
  zxing-cpp (compiled into the .wasm) and ZXingWasm.cpp — Apache License 2.0 (LICENSE-zxing-cpp-Apache-2.0)
  The zint encoder (BSD-3-Clause) is only in zxing-wasm's writer / full builds, which are NOT vendored; the reader build
  has no zint code.

Self-hosting: the ponyfill would fetch the .wasm from cdn.jsdelivr.net by default. lensiq-pc-run.js calls
BarcodeDetectionAPI.prepareZXingModule({overrides: {locateFile}}) so the wasm comes from this folder; the page CSP stays
connect-src 'self' (no CDN). Formats read: EAN-13/8, UPC-A/E, Code 128, Code 39, ITF, Data Matrix (incl. GS1), QR.
