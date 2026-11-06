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
  LQI18N_Q?: Array<Record<string, Record<string, string>>> | { push(d: Record<string, Record<string, string>>): number; length: number };
  LQAgg?: typeof import("../lensiq-agg.js");
  LQVault?: typeof import("../lensiq-facevault.js");
  LQModels?: LQModelsApi;
  LENSIQ_BRAND?: { name: string; accent: string; full: string; tagline: string };
  LENSIQ_API_BASE?: string;
}

interface Navigator {
  /** Network Information API (Chromium only) */
  connection?: { saveData?: boolean; effectiveType?: string };
}

/** lensiq-facevault.js falls back to Node's Buffer when atob/btoa are missing (unit tests) */
declare var Buffer: { from(s: string, enc: string): { toString(enc: string): string } } | undefined;
