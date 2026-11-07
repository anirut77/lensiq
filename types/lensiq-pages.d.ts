// types/lensiq-pages.d.ts — ambient types for the page scripts in the typecheck gate (converter.js, checkout.js, qc.js …).
// Classic <script> pages read the shared modules as bare globals (window.LQCam → LQCam) and vendor libraries
// (face-api.js, pdf.js, docx.js) that ship without type declarations. Used only by `npm run typecheck`.

/** shared platform modules, as bare globals (each also sets window.<name>) */
declare var LQCam: typeof import("../lensiq-camera.js");
declare var LQDetect: typeof import("../lensiq-detect.js");
declare var LQTrack: typeof import("../lensiq-track.js");
declare var LQVault: typeof import("../lensiq-facevault.js");

/** vendor libraries without bundled types (vendor/face-api.js, vendor/pdf.min.js, vendor/docx.js) */
declare var faceapi: any;
declare var pdfjsLib: any;
declare var docx: any;

/** Shape Detection API (Chromium; not in lib.dom) */
declare var BarcodeDetector: any;

interface Window {
  LQCam?: typeof import("../lensiq-camera.js");
  LQDetect?: typeof import("../lensiq-detect.js");
  LQTrack?: typeof import("../lensiq-track.js");
  /** Safari < 14.1 */
  webkitAudioContext?: typeof AudioContext;
  /** qc.js test hook (?fakedet on localhost) */
  __QC?: any;
  /** booth.js test hook */
  __booth?: any;
  /** fortune pages (palm.js …): knowledge bases, composer and EN/ZH KB dictionaries (i18n/*-kb-*.js) */
  PalmCore?: any;
  PALM_KB?: any;
  FortuneAI?: any;
  FORTUNE_EN?: any;
  FORTUNE_ZH?: any;
  /** palm.js test hook */
  __palm?: any;
}
