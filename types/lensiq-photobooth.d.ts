// types/lensiq-photobooth.d.ts — ambient types for photobooth.js (checked on its own by `npm run typecheck`: the page
// scripts share one global scope at run time, so each page is type-checked as its own program; see tools/typecheck.mjs).
// The sibling scripts of photobooth.html (photobooth-hq.js, photobooth-templates.js, photobooth-outfits.js,
// studio-core.js, studio-qa.js) are not in the gate yet, so their globals are typed loosely here.

/** i18n core as a bare global (lensiq-i18n.js sets window.LQI18N) */
declare var LQI18N: any;
/** photobooth-hq.js: matting / retouch helpers */
declare var PBHQ: any;
/** photobooth-templates.js: uploaded frame / outfit templates */
declare var PBTpl: any;
/** photobooth-outfits.js: drawn outfit catalogue */
declare var PBOutfits: any;
/** studio-core.js: shared portrait geometry (also window.StudioCore) */
declare var StudioCore: any;

interface Window {
  /** photobooth-layout.js */
  PBLayout?: any;
  StudioCore?: any;
  /** studio-qa.js */
  StudioQA?: any;
  /** photobooth.js test hook */
  __pb?: any;
}
/** Safari / old WebKit fullscreen API */
interface Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
