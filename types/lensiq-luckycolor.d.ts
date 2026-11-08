// types/lensiq-luckycolor.d.ts — ambient types for luckycolor.js (checked on its own by `npm run typecheck` once the
// integrator adds { "file": "luckycolor.js", "types": ["types/lensiq-luckycolor.d.ts"] } to tsconfig.typecheck.json "pages").

/** i18n core as a bare global (lensiq-i18n.js sets window.LQI18N) */
declare var LQI18N: any;
/** lensiq-luckycolor.js: pure colour / Taksa logic */
declare var LQLucky: typeof import("../lensiq-luckycolor.js");
/** photobooth-hq.js: loadMulticlass / multiclassParse (MediaPipe Selfie Multiclass via onnxruntime-web) */
declare var PBHQ: any;
/** vendor/ort/ort.wasm.min.js */
declare var ort: any;

interface Window {
  PBHQ?: any;
  /** tests: scripted clothing mask (normalised face box + clothing region) */
  __LQ_FAKE_SEG?: (w: number, h: number) => { face?: { x0: number; y0: number; x1: number; y1: number } | null; region?: { x0: number; y0: number; x1: number; y1: number } | null } | null;
  /** luckycolor.js test hook (numbers and colour names only) */
  __LQLC?: any;
}
