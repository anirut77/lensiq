// eslint.config.mjs — flat config: catches real bugs (undefined names, duplicate keys, unreachable code, bad regexes),
// requires === / !== (eqeqeq "smart": `x == null` stays allowed), and WARNS when a file grows past a size budget
// (max-lines; existing monoliths are capped at their current size so they cannot grow — lower a cap when you split one).
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
  // size budget (code lines, blank lines and comments not counted). Warning only: `npm run lint` stays green, the
  // report shows which file outgrew its budget. Split pure logic into a module behind the existing global instead.
  "max-lines": ["warn", { max: 1500, skipBlankLines: true, skipComments: true }]
};

// Files already over the budget (code lines measured 2026-11-08, round 11). Each cap = today's size + ~3 % headroom:
// the file may not grow beyond it. Lower the number whenever a file shrinks; never raise it.
const SIZE_CAPS = {
  "fortune-ai.js": 3460,
  "palm.js": 1830,
  "studio-core.js": 1800,
  "store.js": 1650,
  "faceread.js": 1550,
  "qc.js": 1550
};

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
  ...Object.entries(SIZE_CAPS).map(([file, max]) => ({ files: [file], rules: { "max-lines": ["warn", { max, skipBlankLines: true, skipComments: true }] } })),
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
