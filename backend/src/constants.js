// @ts-check
// backend/src/constants.js — shared enums (same lists as fortune-ai.js / server.py) and the analytics allowlists.
export const FORTUNE_DOMAINS = ["face", "palm", "horoscope", "tarot", "siamsee", "fengshui", "numbers", "iching", "zodiac", "astro", "dream", "bazi", "taksa", "lek7", "lifegraph"];

/** Page slugs the analytics accepts (root *.html without the extension; admin.html never sends events).
 *  Anything else is rejected (the client sends "other" instead). A unit test fails when a page is missing here;
 *  lensiq-analytics.js carries the same lists (drift test in tests/unit/backend-site.test.js). */
export const ANALYTICS_PAGES = [
  "about", "account", "astro", "attendance", "bazi", "booth", "camera-notice", "cameras", "checkout", "converter", "creative", "creative-suite", "customers", "dream",
  "driver", "faceread", "fengshui", "fortune", "help", "horoscope", "hr", "iching", "index", "insights", "interview", "lek7", "lifegraph",
  "neuro", "numbers", "palm", "photobooth", "pricing", "privacy", "qc", "report", "retail", "signage", "store", "studio", "taksa", "tarot", "teamface", "terms", "zodiac",
  "other"
];

/** Feature slugs the analytics accepts; anything else is rejected (the client sends "other"). Add new ones here AND in
 *  lensiq-analytics.js (or via the ANALYTICS_FEATURES var, comma separated) when a page starts sending them. */
export const ANALYTICS_FEATURES = [
  "fortune.reading", "fortune.ai", "fortune.local",
  "studio.render", "photobooth.capture", "photobooth.print", "booth.count", "store.count", "signage.play",
  "camera.start", "camera.denied", "attendance.checkin", "customers.lookup", "checkout.scan", "qc.inspect",
  "driver.alert", "neuro.session", "insights.view", "insights.export", "converter.convert", "creative.analyse",
  "creative.compare", "interview.session", "teamface.card", "pricing.view", "palm", "faceread", "tarot", "horoscope",
  "other"
];

/** Error classes (JS error names / DOMException names). Anything else is rejected (the client sends "other"). */
export const ANALYTICS_ERRORS = [
  "Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AggregateError",
  "UnhandledRejection", "AbortError", "NotAllowedError", "NotFoundError", "NotReadableError", "OverconstrainedError",
  "SecurityError", "QuotaExceededError", "NetworkError", "TimeoutError", "InvalidStateError", "DataError", "OperationError",
  "UnknownError", "EncodingError", "NotSupportedError", "WebGLContextLost", "ModelLoadError", "CameraError", "other"
];

/** Versions of the analytics consent text (lensiq-analytics.js CONSENT_VERSION). Bump both when the text changes. */
export const CONSENT_VERSIONS = ["a1"];

/**
 * Paid-perk registry (served by GET /v1/billing/plans as `perks`). status:
 *   active       enforced by the server (checkEntitlement / POST /api/me/entitlements/use) — the pricing page may sell it
 *   coming_soon  listed in a plan's entitlements but NOT enforced or delivered yet — the pricing page must label it
 *                "เร็ว ๆ นี้ / coming soon" and must not present it as part of the offer
 * enforcement: "quota" (counted per period), "credit" (one-time purchase credits), "server_check" (the page asks the
 * server before it runs the feature — csv_export: POST /api/me/entitlements/use {feature:"csv_export"}).
 * Only features listed here can be put on a plan through the admin API.
 * consumer (round 11): the page script that DELIVERS the perk (null = none yet). A unit test
 * (tests/unit/backend-fulfilment-refunds.test.js "perk consumers") fails when an active credit perk — something sold as a one-time
 * purchase — has no consumer that calls POST /api/me/entitlements/use with that feature, so nothing is sold that the
 * site cannot hand over. report_* are delivered by report.js (redeem flow: generate, save to the account, print / PDF).
 * csv_export: the server check exists but no page calls it yet (CSV export is free on-device) — consumer null.
 */
export const PERKS = Object.freeze({
  ai_reading:     { status: "active", enforcement: "quota", consumer: "fortune-ai.js", unit: "uses", th: "ผู้ช่วยเขียนคำทำนายด้วย AI", en: "AI writing assistant", zh: "AI 写作助手" },
  report_basic:   { status: "active", enforcement: "credit", consumer: "report.js", unit: "reports", th: "รายงานดวงพื้นฐาน", en: "Basic reading report", zh: "基础运势报告" },
  report_compat:  { status: "active", enforcement: "credit", consumer: "report.js", unit: "reports", th: "รายงานดวงคู่", en: "Compatibility report", zh: "合盘报告" },
  report_annual:  { status: "active", enforcement: "credit", consumer: "report.js", unit: "reports", th: "รายงานดวงรายปี", en: "Annual forecast report", zh: "年度运势报告" },
  csv_export:     { status: "active", enforcement: "server_check", consumer: null, unit: "exports", th: "ส่งออก CSV", en: "CSV export", zh: "CSV 导出" },
  analytics_days: { status: "coming_soon", enforcement: "none", consumer: null, unit: "days", th: "ประวัติสถิติบนคลาวด์", en: "Cloud analytics history", zh: "云端统计历史" },
  hub_nodes:      { status: "coming_soon", enforcement: "none", consumer: null, unit: "nodes", th: "เชื่อมหลายสาขา (hub)", en: "Multi-site hub nodes", zh: "多站点节点" }
});
