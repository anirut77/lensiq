// backend/src/constants.js — shared enums (same lists as fortune-ai.js / server.py) and the analytics allowlists.
export const FORTUNE_DOMAINS = ["face", "palm", "horoscope", "tarot", "siamsee", "fengshui", "numbers", "iching", "zodiac", "astro", "dream", "bazi", "taksa", "lek7", "lifegraph"];

/** Page slugs the analytics accepts (root *.html without the extension; admin.html never sends events).
 *  Unknown slugs are stored as "other". tests/unit/backend-site.test.js fails when a page is missing here. */
export const ANALYTICS_PAGES = [
  "about", "astro", "attendance", "bazi", "booth", "cameras", "checkout", "converter", "creative", "customers", "dream",
  "driver", "faceread", "fengshui", "fortune", "horoscope", "iching", "index", "insights", "interview", "lek7", "lifegraph",
  "neuro", "numbers", "palm", "photobooth", "pricing", "qc", "signage", "store", "studio", "taksa", "tarot", "teamface", "zodiac"
];

/** Feature slugs the analytics accepts; unknown ones are stored as "other". Add new ones here (or via the
 *  ANALYTICS_FEATURES var, comma separated) when a page starts sending them. */
export const ANALYTICS_FEATURES = [
  "fortune.reading", "fortune.ai", "fortune.local",
  "studio.render", "photobooth.capture", "photobooth.print", "booth.count", "store.count", "signage.play",
  "camera.start", "camera.denied", "attendance.checkin", "customers.lookup", "checkout.scan", "qc.inspect",
  "driver.alert", "neuro.session", "insights.view", "insights.export", "converter.convert", "creative.analyse",
  "creative.compare", "interview.session", "teamface.card", "pricing.view", "palm", "faceread", "tarot", "horoscope"
];

/** Error classes (JS error names / DOMException names). Unknown names are stored as "other" — never free text. */
export const ANALYTICS_ERRORS = [
  "Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AggregateError",
  "UnhandledRejection", "AbortError", "NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError",
  "SecurityError", "QuotaExceededError", "NetworkError", "TimeoutError", "InvalidStateError", "DataError", "OperationError",
  "UnknownError", "EncodingError", "NotSupportedError", "WebGLContextLost", "ModelLoadError", "CameraError", "other"
];

/** Versions of the analytics consent text (lensiq-analytics.js CONSENT_VERSION). Bump both when the text changes. */
export const CONSENT_VERSIONS = ["a1"];
