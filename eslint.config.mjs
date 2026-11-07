// eslint.config.mjs — lenient flat config: catches real bugs (undefined names, duplicate keys, unreachable code,
// bad regexes) without style rules. Pages are classic browser scripts sharing a few globals; tools/tests are Node.
import js from "@eslint/js";
import globals from "globals";

// globals the pages share (vendor libraries + LENSIQ modules loaded with <script>)
const LENSIQ = Object.fromEntries([
  "faceapi", "tf", "ort", "pdfjsLib", "docx", "cocoSsd", "handPoseDetection", "mobilenet",
  "LQCam", "LQDetect", "LQTrack", "LQHand", "LQStats", "LQAgg", "LQVault", "LQI18N", "LQI18N_Q", "LQModels", "LQFortune",
  "LQStudio", "LQKit", "LENSIQ_API_BASE", "LENSIQ_FACEPARSE", "LENSIQ_BRAND", "LENSIQ_ANALYTICS", "LQApi", "LQAnalytics",
  "LQInsightsAnalysis", "LQInsightsCards", "LQInsightsCharts", "LQInsightsData", "LQInsightsDemo", "LQInsightsUI",
  "PBHQ", "PBOutfits", "PBTpl", "StudioCore", "NMCore", "FR_KB"
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
  "preserve-caught-error": "off"
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
