// types/lensiq-globals.d.ts — ambient types for the classic-script modules that share globals on `window`.
// Used only by `npm run typecheck` (tsc --checkJs, tsconfig.typecheck.json). Nothing here ships to the browser.

/** lensiq-i18n.js */
interface LQI18NApi {
  readonly __core: true;
  readonly LANGS: string[];
  readonly LABEL: Record<"th" | "zh", string>;
  readonly HTML_LANG: Record<"th" | "zh", string>;
  lang: "th" | "zh";
  add(a: string | Record<string, Record<string, string>>, b?: Record<string, string>): LQI18NApi;
  t(key: string, vars?: Record<string, unknown>, lang?: string): string;
  tf(key: string, thai: string, vars?: Record<string, unknown>): string;
  has(key: string, lang?: string): boolean;
  apply(root?: Element | Document): void;
  setLang(lang: string, opts?: { persist?: boolean; force?: boolean; init?: boolean }): "th" | "zh";
  coverage(root?: Element, opts?: { top?: number; all?: boolean }): LQCoverage;
  debugOverlay(): void;
}

/** nav.js window.LQModels */
interface LQModelsApi {
  loading(opts?: { label?: string; mb?: number; url?: string }): { progress(p: number): void; done(): void; fail(msg?: string): void };
  isCached(url: string): Promise<boolean>;
  confirm(opts: { url?: string; label?: string; mb?: number; askOverMb?: number }): Promise<boolean>;
  fetch(url: string, opts?: { label?: string; mb?: number }): Promise<ArrayBuffer>;
  slowNet(): boolean;
}

interface Window {
  LQI18N?: LQI18NApi;
  /** dictionaries queued before lensiq-i18n.js loads (i18n/zh-*.js) */
  LQI18N_Q?: Array<Record<string, object>> | { push(d: Record<string, object>): number; length: number };
  /** run-time phrase dictionaries queued before lensiq-i18n-rt.js loads (i18n/zh-rt-*.js) */
  LQI18N_RT?: Array<Record<string, string>> | { push(d: Record<string, string>): number; length: number };
  LQI18N_RTX?: { tr(thai: string): string; add(d: Record<string, string>): void; readonly active: boolean; stats(): { phrases: number; templates: number; translated: number } };
  LQAgg?: typeof import("../lensiq-agg.js");
  LQVault?: typeof import("../lensiq-facevault.js");
  LQModels?: LQModelsApi;
  LENSIQ_BRAND?: { name: string; accent: string; full: string; tagline: string };
  LENSIQ_API_BASE?: string;
  /** lensiq-config.js: opt-in to the non-commercial BiSeNet face parser */
  LENSIQ_FACEPARSE?: boolean;
  /** lensiq-config.js: false = hide the signage age/gender option and never load ageGenderNet (research-licence model) */
  LENSIQ_AGE_GENDER?: boolean;
  /** lensiq-config.js (decision 221 default ข): Exam lab phone zoom pass; off unless exactly true (customer builds: off) */
  LENSIQ_EXAM_PHONE_ZOOM?: boolean;
  /** lensiq-config.js: quote-request form sends to the server (POST /v1/leads) only when true; ON by default since the owner decision 2026-11-12 */
  LENSIQ_LEADS_FORM?: boolean;
  /** photobooth try-on server status is asked only when true (mirrors the backend TRYON switch; off as shipped) */
  LENSIQ_TRYON?: boolean;
  /** petread zodiac share cards (owner spec 2026-11-19): mode switch, classic-theme switch (PET_CARD_CLASSIC), odds preset a / b */
  LENSIQ_PET_ZODIAC?: boolean;
  LENSIQ_PET_CARD_CLASSIC?: boolean;
  LENSIQ_PET_ZODIAC_ODDS?: string;
  /** pet card footer (decision 184 ก): brand text from one setting; address line off as shipped */
  LENSIQ_CARD_BRAND?: string;
  LENSIQ_CARD_SHOW_ADDRESS?: boolean;
  /** converter uses the local python server.py PDF engine only when true (off as shipped) */
  LENSIQ_CONVERT_SERVER?: boolean;
  /** rule-6 switch (owner decision 2026-11-16): the top 1323 control in the sticky top bar (true) or scrolling away (false) */
  LENSIQ_HELP_TOP_STICKY?: boolean;
  /** fortune section look (owner decision 92): "a" = theme ราตรีคราม, "classic" = the previous look */
  LENSIQ_FORTUNE_THEME?: string;
  LENSIQ_LEADS_NOTICE?: boolean;
  /** fortune-crisis.js (loaded before fortune-ai.js) */
  LQFortuneCrisis?: any;
  /** lensiq-config.js: Part C "read it straight" fortune option (owner order 2026-11-12); false until the owner approves */
  LENSIQ_FORTUNE_STRAIGHT?: boolean;
  /** look suggestions salon mode (lensiq-config.js, hard off until the human-approval step exists; owner 2026-11-14) */
  LENSIQ_LOOK_SALON?: boolean;
  /** fortune-straight.js (loaded before fortune-ai.js) */
  LQFortuneStraight?: any;
  /** lensiq-config.js: "commercial" (default since round 16, customer mode) forces LENSIQ_AGE_GENDER, LENSIQ_EXPRESSION and
   *  LENSIQ_FACEPARSE off; "demo" = research demo (device toggle or operator preset) */
  LENSIQ_PROFILE?: string;
  /** lensiq-config.js (round 16): false = never load faceExpressionNet (research-licence model, F5); forced off in customer mode */
  LENSIQ_EXPRESSION?: boolean;
  /** lensiq-config.js (round 17 P9): true = the travel card lists Thai products with the same ingredients (TMT 2020); default false */
  LENSIQ_PC_THAI_EQUIV?: boolean;
  /** lensiq-config.js (round 16): false = customer installation, the "Research demo" toggle is locked off */
  LENSIQ_RESEARCH_DEMO?: boolean;
  /** lensiq-config.js (round 16): resolved research-demo state, read by lensiq-research.js */
  LENSIQ_RESEARCH?: { on: boolean; locked: null | "operator" | "profile"; key: string; operatorDemo: boolean };
  /** lensiq-research.js (round 16): research-demo toggle and notice */
  LQResearch?: any;
  /** lensiq-config.js: false = never load lensiq-analytics.js */
  LENSIQ_ANALYTICS?: boolean;
  /** lensiq-config.js (Merit MVP): true = the page may show the paid on-your-behalf interest form (default false; also needs the Worker's
   *  MERIT_INTEREST_FORM = "on" and no crisis state) */
  LENSIQ_MERIT_INTEREST_FORM?: boolean;
  /** lensiq-config.js (org-p1): true = account.html / admin.html may show organisation accounts lite (default false; also
   *  needs the Worker's ORG_ACCOUNTS = "on", reported as /v1/config org_accounts) */
  LENSIQ_ORG_ACCOUNTS?: boolean;
  /** paid depth on the fortune pages (owner order 2026-11-15, design only): off unless exactly true */
  LENSIQ_FORTUNE_PAID?: boolean;
  LENSIQ_FORTUNE_PERIOD?: boolean;
  /** fortune-period.js: the period layer frame */
  LQPeriod?: any;
  /** palm reading upgrade v1 (owner order 2026-11-19): off unless exactly true */
  LENSIQ_PALM_V2?: boolean;
  LENSIQ_FACEREAD_TIER1?: boolean;
  /** lensiq-face-mesh68.js (tier-1 face model for faceread, loaded only when LENSIQ_FACEREAD_TIER1 is on) */
  LQFaceMesh68?: any;
  /** palm v2 automatic hand points (MediaPipe hands, tier 2-U): research-demo profile only */
  LENSIQ_PALM_LANDMARKS?: boolean;
  /** goal-based plan under the paid switch (owner order 2026-11-15 (2), design only): off unless exactly true */
  LENSIQ_FORTUNE_PLAN?: boolean;
  /** "recommended sources" (outside seller links) under the paid switch (decision 46, design only): off unless exactly true */
  LENSIQ_FORTUNE_SOURCES?: boolean;
  /** item 177: the closed "สิ่งที่ควรระวัง" section (fortune-caution.js); off until the owner says "177 ขึ้นเว็บ" */
  LENSIQ_FORTUNE_CAUTIONS?: boolean;
  /** item 177 D-6: Chinese and Western caution rules (off until expert review) */
  LENSIQ_FORTUNE_CAUTIONS_CN_WEST?: boolean;
  /** item 177: show caution rules not yet expert-reviewed (preview only) */
  LENSIQ_FORTUNE_CAUTIONS_DRAFTS?: boolean;
  /** compat.html v2 view (compat-v2.js, on demand); off unless exactly true (night order A6, 2026-11-20) */
  LENSIQ_COMPAT_V2?: boolean;
  /** recommended-source entries (admin-managed later; none ship) */
  LQ_FORTUNE_SELLER_LINKS?: any[];
  /** item 177: caution rules registered by the generated packs fortune-caution-pack-*.js (read by fortune-caution-core.js) */
  LQCautionRules?: any[];
  /** item 177: fortune-caution.js mount API, used by horoscope.js, astro.js and lifecal-ui.js */
  LQFortuneCaution?: any;
  /** lensiq-config.js: Cloudflare Turnstile site key for the AI writing assistant on the Worker ("" = off) */
  LENSIQ_TURNSTILE_SITEKEY?: string;
  /** lensiq-config.js: public OAuth Client ID for "Sign in with Google" ("" = no member sign-in) */
  LENSIQ_GOOGLE_CLIENT_ID?: string;
  /** lensiq-config.js: seller / support details shown by legal.js, lensiq-leads.js, pricing ("" = not announced yet) */
  LENSIQ_SELLER?: Record<string, any>;
  /** lensiq-leads.js: contact / demo / notify-me form transport (POST /v1/leads, else mailto / LINE fallback) */
  LQLeads?: any;
  /** lensiq-member.js: member sign-in, account chip, light-reading gate (inert without API + membership) */
  LQMember?: any;
  /** lensiq-ai.js (round 17): AI gateway client — consent screen, remembered consent + withdraw, fallback messages */
  LQAI?: any;
  /** lensiq-api.js: optional Cloudflare Worker backend client (null results when LENSIQ_API_BASE is empty) */
  LQApi?: typeof import("../lensiq-api.js");
  /** lensiq-analytics.js: opt-in, privacy-first usage analytics */
  LQAnalytics?: {
    track(name: string, fields?: Record<string, any>): boolean;
    feature(name: string, step?: "start" | "complete"): boolean;
    domain(d: string): boolean;
    renderDone(): boolean;
    error(err: any): boolean;
    consent(): "yes" | "no" | null;
    setConsent(on: boolean): void;
    showBanner(): HTMLElement | null;
    active(): boolean;
    flush(useBeacon?: boolean): void;
    _internal: { durBucket(ms: number): string; page(): string; dnt(): boolean };
  };
  LQStats?: typeof import("../lensiq-stats.js");
  LQInsightsData?: typeof import("../insights-data.js");
  LQInsightsAnalysis?: typeof import("../insights-analysis.js");
  LQInsightsCards?: typeof import("../insights-cards.js");
  LQInsightsCharts?: typeof import("../insights-charts.js");
  LQInsightsDemo?: typeof import("../insights-demo.js");
  TAROT_KB?: typeof import("../tarot-kb.js");
}

/** insights-data.js reads the multi-device aggregate as a bare global when lensiq-agg.js is loaded with <script> */
declare var LQAgg: typeof import("../lensiq-agg.js") | undefined;
/** insights-data.js / store.js read the on-site check + quality helpers as a bare global when lensiq-sitecheck.js is loaded */
declare var LQSite: typeof import("../lensiq-sitecheck.js") | undefined;
/** UMD modules call require() only under Node (guarded by typeof checks); no @types/node in the browser typecheck */
declare var require: ((id: string) => any) | undefined;

/** Image Capture extension (Chromium): torch / flash on rear cameras */
interface MediaTrackCapabilities { torch?: boolean }

/** marker set by lensiq-i18n-rt.js on patched prototypes so they are wrapped once */
interface CanvasRenderingContext2D { __lqrt?: boolean }

/** lensiq-camera.js LQCam.create(video, opts) */
interface LQCamOptions {
  facing?: string; ideal?: { width?: number; height?: number } | null; frameRate?: number; mirror?: string | boolean;
  torch?: boolean; persistKey?: string | null; autoPause?: boolean; strictDevice?: boolean; reconnect?: boolean | (() => boolean);
  onChange?: (cam: any, ev: { type: string; [k: string]: unknown }) => void;
  onError?: (cam: any, err: any) => void;
}
interface LQCamChainOpts {
  deviceId?: string; facing?: string; frameRate?: number;
  /** one ideal size, or a ladder tried highest first */
  ideal?: { width?: number; height?: number } | Array<{ width: number; height: number }> | null;
}
interface LQCamSlotOpts { deviceId?: string; name?: string; role?: string; slot?: string; label?: string; _restore?: boolean }

/** lensiq-detect.js detectCoco / detectYolox / embedBox options */
interface LQDetectOpts {
  detW?: number; classes?: number[]; minScore?: number; iou?: number; max?: number;
  canvas?: HTMLCanvasElement | null; tiles?: any; split?: string | null; pad?: number;
}

interface Navigator {
  /** Network Information API (Chromium only) */
  connection?: { saveData?: boolean; effectiveType?: string };
}

/** lensiq-facevault.js falls back to Node's Buffer when atob/btoa are missing (unit tests) */
declare var Buffer: { from(s: string, enc: string): { toString(enc: string): string } } | undefined;
