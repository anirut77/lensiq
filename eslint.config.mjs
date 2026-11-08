// eslint.config.mjs — flat config: catches real bugs (undefined names, duplicate keys, unreachable code, bad regexes),
// requires === / !== (eqeqeq "smart": `x == null` stays allowed), and FAILS when a file grows past its size budget
// (max-lines: 1500 code lines for every file; existing monoliths are capped at their current size so they cannot grow —
// lower a cap when you split one; tests/unit/size-budget.test.js fails when a cap has more than 5 % slack).
// Pages are classic browser scripts sharing a few globals; tools/tests are Node.
import js from "@eslint/js";
import globals from "globals";

// globals the pages share (vendor libraries + LENSIQ modules loaded with <script>)
const LENSIQ = Object.fromEntries([
  "faceapi", "tf", "ort", "pdfjsLib", "docx", "cocoSsd", "handPoseDetection", "mobilenet",
  "LQCam", "LQDetect", "LQTrack", "LQHand", "LQStats", "LQAgg", "LQSite", "LENSIQ_AGE_GENDER", "LQVault", "LQI18N", "LQI18N_Q", "LQModels", "LQFortune",
  "LQStudio", "LQKit", "LENSIQ_API_BASE", "LENSIQ_FACEPARSE", "LENSIQ_BRAND", "LENSIQ_ANALYTICS", "LENSIQ_TURNSTILE_SITEKEY", "LQApi", "LQAnalytics",
  "LQInsightsAnalysis", "LQInsightsCards", "LQInsightsCharts", "LQInsightsData", "LQInsightsDemo", "LQInsightsUI",
  "PBHQ", "PBOutfits", "PBTpl", "StudioCore", "StudioQA", "NMCore", "FR_KB"
].map(k => [k, "writable"]));

const RULES = {
  "no-undef": "error",
  "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
  "no-empty": ["warn", { allowEmptyCatch: true }],
  "no-useless-escape": "off",
  "no-prototype-builtins": "off",
  "no-cond-assign": ["error", "except-parens"],
  "no-control-regex": "off",
  "no-misleading-character-class": "warn",
  "no-fallthrough": "warn",
  "no-case-declarations": "off",
  "no-inner-declarations": "off",
  "no-redeclare": ["error", { builtinGlobals: false }],
  "no-irregular-whitespace": ["error", { skipStrings: true, skipTemplates: true, skipComments: true, skipRegExps: true }],
  "no-self-assign": "warn",
  "no-sparse-arrays": "warn",
  "no-unused-private-class-members": "warn",
  "no-useless-assignment": "off",
  "preserve-caught-error": "off",
  // === / !== everywhere except `== null` and typeof / literal comparisons (round 11: 0 violations when switched on)
  "eqeqeq": ["error", "smart"],
  // size budget (code lines, blank lines and comments not counted). An ERROR since round 12: a new file over 1500 code
  // lines, or a capped monolith growing past its cap, fails `npm run lint` and CI. Split pure logic into a module behind
  // the existing global instead (reorganisation only — no feature is removed).
  "max-lines": ["error", { max: 1500, skipBlankLines: true, skipComments: true }]
};

// Files already over the budget — a per-file baseline ratchet. Each cap = the size measured on 2026-11-08 (round 12,
// eslint max-lines code lines) + ~2-3 % headroom: the file may not grow beyond it. Lower the number whenever a file
// shrinks; never raise it. tests/unit/size-budget.test.js fails when a cap is more than 5 % above the measured size
// (so a cap is lowered in the same change that shrinks the file) and when a capped file drops under 1500 (delete it).
//   round 11 -> 12: fortune-ai.js 3460 -> 3720 (the round-12 crisis net / hook API landed before the ratchet
//   became an error; this is the last raise — the next split must bring it down), palm 1830 -> 1820,
//   studio-core 1800 -> 1790, store 1650 -> 1670 (round 12 work in progress), faceread 1550 -> 1540, qc 1550 -> 1540.
export const SIZE_CAPS = {
  "fortune-ai.js": 3720,
  "palm.js": 1820,
  "studio-core.js": 1790,
  "store.js": 1670,
  "faceread.js": 1540,
  "qc.js": 1540
};
export const SIZE_DEFAULT = 1500;

export default [
  { ignores: ["vendor/**", "_site/**", "node_modules/**", ".venv/**", "**/*.min.js", "data/**", "logs/**", "certs/**", "*-kb.js"] },
  js.configs.recommended,
  { rules: RULES },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023, sourceType: "script",
      globals: { ...globals.browser, ...LENSIQ, module: "writable", require: "readonly", Buffer: "readonly", process: "readonly", globalThis: "readonly" }
    },
    linterOptions: { reportUnusedDisableDirectives: "off" }
  },
  ...Object.entries(SIZE_CAPS).map(([file, max]) => ({ files: [file], rules: { "max-lines": ["error", { max, skipBlankLines: true, skipComments: true }] } })),
  // dictionaries are data, not code: no size budget
  { files: ["i18n/**"], rules: { "max-lines": "off" } },
  { files: ["sw.js"], languageOptions: { globals: { ...globals.serviceworker } } },
  // API Worker (Cloudflare Workers runtime: ES modules, fetch/Request/Response/crypto/btoa globals)
  { files: ["backend/**/*.js"], languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.serviceworker, console: "readonly" } } },
  {
    files: ["**/*.mjs", "tools/**", "tests/**", "eslint.config.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node, ...globals.browser, WebSocket: "readonly" } }
  },
  // e2e/bench functions are serialised into the page by page.evaluate(): page globals are not visible to ESLint
  { files: ["tests/e2e/**", "tests/bench/**"], rules: { "no-undef": "off" } },
  { files: ["tests/unit/**/*.js"], languageOptions: { sourceType: "commonjs", globals: { ...globals.node } } },
  { files: ["tests/e2e/fake-cams.js"], languageOptions: { sourceType: "script", globals: { ...globals.browser } } }
];
