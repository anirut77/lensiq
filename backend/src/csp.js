// @ts-check
// backend/src/csp.js — CSP violation report collection (round 12): POST /v1/csp-report.
//
// Accepts the legacy `report-uri` format (Content-Type application/csp-report, {"csp-report": {...}}) and the Reporting
// API format (application/reports+json, [{type:"csp-violation", body:{...}}]). Only DAILY COUNTERS are stored
// (csp_reports: day, effective directive, blocked origin = scheme + host or a keyword such as "inline" / "eval", page path
// without query / fragment). No IP, user agent, full URL, script sample or source line is kept. Caps: 60 reports per
// caller (day-salted, IPv6 /64) per hour and CSP_REPORT_GLOBAL_DAY (default 5000) per Bangkok day; over-cap reports are
// dropped with 204 (a browser never retries a report, so 429 would only add noise).
//
// NOTE: browsers ignore report-uri / report-to inside a <meta http-equiv="Content-Security-Policy"> — the static
// GitHub Pages site cannot report. Reports arrive from pages whose CSP is sent as an HTTP HEADER: the Worker-served
// admin shell (index.js ADMIN_PAGE_HEADERS) today, and the public site once it is served behind a header-capable host
// (docs/BACKEND.md "CSP reports"). The admin sees the counters in GET /admin/api/csp-reports.
import { callerHash, hit } from "./store.js";
import { BKK_OFFSET, bkkDay, intVar, publicOrigins, readText } from "./util.js";

export const CSP_MAX_BODY = 16 * 1024;
const TYPES = ["application/csp-report", "application/reports+json", "application/json"];
const KEYWORDS = new Set(["inline", "eval", "wasm-eval", "data", "blob", "self", "trusted-types-policy", "trusted-types-sink", "about"]);

/** scheme://host of a blocked URL, or a short keyword; never a path or query. */
export function blockedOf(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return "none";
  if (KEYWORDS.has(s)) return s;
  if (/^(data|blob|about|filesystem|chrome-extension|moz-extension|safari-extension|safari-web-extension):/.test(s)) return s.split(":")[0] + ":";
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.protocol + "//" + u.host : u.protocol; } catch { return "other"; }
}
/** Page path only (no query / fragment / origin); "other-origin" when the page is not one of ALLOWED_ORIGINS / the admin. */
export function pageOf(v, allowed) {
  try {
    const u = new URL(String(v || ""));
    if (allowed.length && !allowed.includes(u.origin)) return "other-origin";
    return (u.pathname || "/").replace(/[^A-Za-z0-9/._-]/g, "_").slice(0, 80);
  } catch { return "unknown"; }
}
const directiveOf = v => (String(v || "").toLowerCase().match(/^[a-z-]{2,40}/) || ["unknown"])[0];

/** Normalised reports from either format (at most 20 per request). */
export function parseReports(text) {
  let j;
  try { j = JSON.parse(text); } catch { return []; }
  const list = Array.isArray(j) ? j.filter(r => r && r.type === "csp-violation").map(r => r.body || {}) : j && j["csp-report"] ? [j["csp-report"]] : [];
  return list.slice(0, 20).map(b => ({
    directive: directiveOf(b.effectiveDirective || b["effective-directive"] || b["violated-directive"] || b.violatedDirective),
    blocked: blockedOf(b.blockedURL || b["blocked-uri"] || b.blockedURI),
    page: b.documentURL || b["document-uri"] || b.documentURI || ""
  }));
}

/** @param {Env} env @param {Request} request */
export async function ingestCspReport(env, request) {
  const ct = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!TYPES.includes(ct)) return { stored: 0, reason: "type" };
  const text = await readText(request, CSP_MAX_BODY);
  const reports = parseReports(text);
  if (!reports.length) return { stored: 0, reason: "empty" };
  const who = await callerHash(env, request, "csp");
  if (!(await hit(env.DB, `csp:${who}`, 60, 3600)).ok) return { stored: 0, reason: "caller_cap" };
  if (!(await hit(env.DB, "csp:global", intVar(env.CSP_REPORT_GLOBAL_DAY, 5000, 1, 1e6), 86400, undefined, BKK_OFFSET)).ok) return { stored: 0, reason: "global_cap" };
  let self = [];
  try { self = [new URL(request.url).origin]; } catch { /* ignore */ }
  const allowed = [...publicOrigins(env), ...self];
  const day = bkkDay();
  const db = env.DB;
  await db.batch(reports.map(r => db.prepare("INSERT INTO csp_reports (day, directive, blocked, page, n) VALUES (?1, ?2, ?3, ?4, 1) " +
    "ON CONFLICT (day, directive, blocked, page) DO UPDATE SET n = n + 1").bind(day, r.directive, r.blocked, pageOf(r.page, allowed))));
  return { stored: reports.length };
}

/** GET /admin/api/csp-reports?days=7 — top counters. */
export async function adminCspReports(db, q = {}) {
  const days = intVar(q.days, 7, 1, 90);
  const from = bkkDay(Math.floor(Date.now() / 1000) - (days - 1) * 86400);
  const rows = (await db.prepare("SELECT directive, blocked, page, SUM(n) AS n, MIN(day) AS first_day, MAX(day) AS last_day FROM csp_reports WHERE day >= ?1 " +
    "GROUP BY directive, blocked, page ORDER BY n DESC LIMIT 200").bind(from).all()).results || [];
  return { from, days, reports: rows };
}
