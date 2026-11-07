// backend/src/analytics.js — privacy-first usage analytics (PDPA).
//
// Accepted: POST /v1/events  {v:1, consent:true, cv:"a1", events:[{n, sid, page?, feature?, domain?, step?, err?, lang?,
// device?, dur?, ret?}]}. Every field is an enum or an allowlisted slug; any other key — and anything that looks like
// personal data (e-mail incl. "_gmail.com"-style, >= 6 digits anywhere after removing separators, URLs, free text) —
// rejects the WHOLE batch, nothing is stored. page / feature / err values that pass those checks but are not on the
// server allowlists (constants.js) are stored as "other", so a page bug can never smuggle an identifier in.
// Consent is CLAIMED by the client (consent:true + the consent-text version cv); the server cannot verify it — it logs
// the version with every event and refuses unknown versions (docs/BACKEND.md).
// Never stored: images, face data, free text, IP addresses, user agents. A day-salted HMAC of (IP, UA) gives same-day
// unique counts only; the salt is deleted the next day (retention.js), so visitors cannot be linked across days.
// Do-Not-Track / Global Privacy Control headers are honoured server-side too (204, nothing stored).
import { callerHash, hit } from "./store.js";
import { ANALYTICS_ERRORS, ANALYTICS_FEATURES, ANALYTICS_PAGES, CONSENT_VERSIONS, FORTUNE_DOMAINS } from "./constants.js";
import { HttpError, addDays, dayOf, now } from "./util.js";

export const MAX_BODY = 16 * 1024;
export const MAX_EVENTS = 50;

const enumOf = (...xs) => ({ enum: new Set(xs) });
export const EVENT_NAMES = new Set(["page_view", "feature_used", "reading_domain", "studio_render_done", "error", "session_end"]);
const PAGES = new Set(ANALYTICS_PAGES), ERRORS = new Set(ANALYTICS_ERRORS);
export const FIELDS = {
  n: { enum: EVENT_NAMES },
  sid: { re: /^[a-f0-9]{32}$/ },                                     // 128-bit random per tab, nothing else fits
  page: { re: /^[a-z][a-z0-9-]{0,31}$/, allow: () => PAGES },
  feature: { re: /^[a-z][a-z0-9_.-]{0,47}$/, allow: env => featureSet(env) },
  domain: { enum: new Set(FORTUNE_DOMAINS) },
  step: enumOf("start", "complete"),
  err: { re: /^[A-Za-z][A-Za-z0-9_.-]{0,39}$/, allow: () => ERRORS },
  lang: enumOf("th", "en", "zh"),
  device: enumOf("mobile", "tablet", "desktop"),
  dur: enumOf("lt10s", "10-30s", "30s-2m", "2-10m", "10m+"),
  ret: enumOf("new", "d1", "d2-7", "d8-30", "d30+")
};
const REQUIRED_BY_NAME = { page_view: ["page"], feature_used: ["feature"], reading_domain: ["domain"], error: ["err"], session_end: ["dur"] };

let featCache = null, featKey = null;
function featureSet(env) {
  const extra = String((env && env.ANALYTICS_FEATURES) || "");
  if (featCache && featKey === extra) return featCache;
  featKey = extra;
  featCache = new Set(ANALYTICS_FEATURES.concat(extra.split(",").map(x => x.trim()).filter(x => FIELDS.feature.re.test(x))));
  return featCache;
}

// keys a client might mistakenly send — named in the error so the bug is easy to find
const PII_KEY = /mail|phone|tel|name|ip|addr|user|uid|email|face|image|img|photo|descriptor|text|msg|message|birth|dob|card|id_?card|token|lat|lon|geo|ua|agent|url|ref/i;
const EMAIL_PROVIDERS = /(^|[._-])(gmail|googlemail|hotmail|outlook|live|yahoo|ymail|icloud|proton|protonmail|aol|msn|gmx|zoho|yandex|qq|naver|kakao|csloxinfo|loxinfo)([._-]|$)/i;
const EMAIL_TLD = /[._-](com|net|org|edu|gov|mil|info|biz|io|me|th|cn|jp|kr|uk|de|ru|sg|my|vn)$|[._-](com|net|org|co|ac|go|or|in)[._-]/i;
/** @returns {string|null} reason when the value looks like personal data */
export function piiReason(v) {
  if (/@/.test(v)) return "e-mail-like value";
  if ((v.match(/\d/g) || []).length >= 6) return "6+ digits (phone / ID / card, separators ignored)";
  if (/https?:|www\./i.test(v)) return "URL";
  if (EMAIL_PROVIDERS.test(v) || EMAIL_TLD.test(v)) return "e-mail-like value";
  if (/\s/.test(v)) return "free text (whitespace)";
  if (/[^\x20-\x7e]/.test(v)) return "non-ASCII free text";
  return null;
}

/** Validates a batch. Returns the events or throws HttpError(400, reason). */
export function validateBatch(body, env = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "body must be an object");
  for (const k of Object.keys(body)) if (!["v", "consent", "cv", "events"].includes(k)) throw new HttpError(400, `unknown top-level field: ${k.slice(0, 32)}`);
  if (body.v !== 1) throw new HttpError(400, "unsupported version");
  if (body.consent !== true) throw new HttpError(400, "analytics consent required");
  if (!CONSENT_VERSIONS.includes(body.cv)) throw new HttpError(400, "unknown consent version");
  if (!Array.isArray(body.events) || !body.events.length) throw new HttpError(400, "events must be a non-empty array");
  if (body.events.length > MAX_EVENTS) throw new HttpError(400, `at most ${MAX_EVENTS} events per batch`);
  const out = [];
  for (const [i, e] of body.events.entries()) {
    if (!e || typeof e !== "object" || Array.isArray(e)) throw new HttpError(400, `event ${i}: must be an object`);
    const ev = {};
    for (const [k, v] of Object.entries(e)) {
      const spec = FIELDS[k];
      if (!spec) throw new HttpError(400, PII_KEY.test(k) ? `event ${i}: field "${k.slice(0, 32)}" looks like personal data — not accepted` : `event ${i}: unknown field "${k.slice(0, 32)}"`);
      if (typeof v !== "string") throw new HttpError(400, `event ${i}: ${k} must be a string`);
      if (k !== "sid") { const why = piiReason(v); if (why) throw new HttpError(400, `event ${i}: ${k} rejected (${why})`); }
      if (spec.enum ? !spec.enum.has(v) : !spec.re.test(v)) throw new HttpError(400, `event ${i}: invalid ${k}`);
      ev[k] = spec.allow && !spec.allow(env).has(v) ? "other" : v;
    }
    if (!ev.n || !ev.sid) throw new HttpError(400, `event ${i}: n and sid are required`);
    for (const f of REQUIRED_BY_NAME[ev.n] || []) if (!ev[f]) throw new HttpError(400, `event ${i}: ${ev.n} needs ${f}`);
    out.push(ev);
  }
  return out;
}

export const doNotTrack = request => request.headers.get("DNT") === "1" || request.headers.get("Sec-GPC") === "1";

export async function ingest(env, request, body) {
  const events = validateBatch(body, env);
  const rk = await callerHash(env, request, "events");
  const rl = await hit(env.DB, `ev:${rk}`, 60, 60);
  if (!rl.ok) throw new HttpError(429, "too many event batches", { retryAfter: rl.retryAfter });
  const vh = (await callerHash(env, request, "visitor", request.headers.get("User-Agent") || "")).slice(0, 16);
  const t = now(), day = dayOf(t);
  const stmt = env.DB.prepare("INSERT INTO events (day, ts, name, sid, vh, page, feature, domain, step, err, lang, device, dur, ret, cv) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)");
  await env.DB.batch(events.map(e => stmt.bind(day, t, e.n, e.sid, vh, e.page ?? null, e.feature ?? null, e.domain ?? null,
    e.step ?? null, e.err ?? null, e.lang ?? null, e.device ?? null, e.dur ?? null, e.ret ?? null, body.cv)));
  return { accepted: events.length };
}

// ---- aggregation ----------------------------------------------------------------------------------------------------
// metric           key          n
// events           ''           all events
// sessions         ''           distinct sid
// visitors         ''           distinct day-salted visitor hash (same-day unique only)
// page             page         page views
// feature          feature      feature_used events
// domain           domain       reading_domain events
// funnel           visit|start|complete   distinct sessions that reached the step (any feature)
// start / complete feature      distinct sessions per feature
// lang / device    value        distinct sessions
// ret              bucket       distinct sessions (returning-visitor approximation from a coarse client bucket)
// error            class        error events
// dur              bucket       session_end events
// studio_render    ''           studio renders completed
const AGG_SQL = [
  "SELECT 'events' AS m, '' AS k, COUNT(*) AS c FROM events WHERE day = ?1",
  "SELECT 'sessions' AS m, '' AS k, COUNT(DISTINCT sid) AS c FROM events WHERE day = ?1",
  "SELECT 'visitors' AS m, '' AS k, COUNT(DISTINCT vh) AS c FROM events WHERE day = ?1 AND vh IS NOT NULL",
  "SELECT 'page' AS m, page AS k, COUNT(*) AS c FROM events WHERE day = ?1 AND name = 'page_view' GROUP BY page",
  "SELECT 'feature' AS m, feature AS k, COUNT(*) AS c FROM events WHERE day = ?1 AND name = 'feature_used' GROUP BY feature",
  "SELECT 'domain' AS m, domain AS k, COUNT(*) AS c FROM events WHERE day = ?1 AND name = 'reading_domain' GROUP BY domain",
  "SELECT 'funnel' AS m, 'visit' AS k, COUNT(DISTINCT sid) AS c FROM events WHERE day = ?1 AND name = 'page_view'",
  "SELECT 'funnel' AS m, step AS k, COUNT(DISTINCT sid) AS c FROM events WHERE day = ?1 AND name = 'feature_used' AND step IS NOT NULL GROUP BY step",
  "SELECT step AS m, feature AS k, COUNT(DISTINCT sid) AS c FROM events WHERE day = ?1 AND name = 'feature_used' AND step IS NOT NULL GROUP BY step, feature",
  "SELECT 'lang' AS m, lang AS k, COUNT(DISTINCT sid) AS c FROM events WHERE day = ?1 AND lang IS NOT NULL GROUP BY lang",
  "SELECT 'device' AS m, device AS k, COUNT(DISTINCT sid) AS c FROM events WHERE day = ?1 AND device IS NOT NULL GROUP BY device",
  "SELECT 'ret' AS m, ret AS k, COUNT(DISTINCT sid) AS c FROM events WHERE day = ?1 AND ret IS NOT NULL GROUP BY ret",
  "SELECT 'error' AS m, err AS k, COUNT(*) AS c FROM events WHERE day = ?1 AND name = 'error' GROUP BY err",
  "SELECT 'dur' AS m, dur AS k, COUNT(*) AS c FROM events WHERE day = ?1 AND name = 'session_end' GROUP BY dur",
  "SELECT 'studio_render' AS m, '' AS k, COUNT(*) AS c FROM events WHERE day = ?1 AND name = 'studio_render_done'"
];

/** (Re)builds daily_agg for one day from raw events. Idempotent. A day without raw events keeps its aggregates. */
export async function aggregateDay(db, day) {
  const has = await db.prepare("SELECT 1 AS x FROM events WHERE day = ?1 LIMIT 1").bind(day).first();
  if (!has) return false;
  const stmts = [db.prepare("DELETE FROM daily_agg WHERE day = ?1").bind(day)];
  for (const q of AGG_SQL) stmts.push(db.prepare(`INSERT OR REPLACE INTO daily_agg (day, metric, key, n) SELECT ?1, m, COALESCE(k, ''), c FROM (${q})`).bind(day));
  await db.batch(stmts);
  return true;
}

/** Aggregates every day that has raw events but no aggregate yet, plus yesterday and today (still changing). */
export async function aggregatePending(db, t = now()) {
  const today = dayOf(t);
  const rows = (await db.prepare("SELECT DISTINCT day FROM events WHERE day NOT IN (SELECT day FROM daily_agg WHERE metric = 'events')").all()).results || [];
  const days = new Set(rows.map(r => r.day).concat([addDays(today, -1), today]));
  let n = 0;
  for (const d of [...days].sort()) if (await aggregateDay(db, d)) n++;
  return n;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function range(q, t = now()) {
  const to = DAY_RE.test(q.to || "") ? q.to : dayOf(t);
  let from = DAY_RE.test(q.from || "") ? q.from : addDays(to, -29);
  if (from > to) from = to;
  if (Date.parse(to) - Date.parse(from) > 400 * 86400000) from = addDays(to, -400);
  return { from, to };
}

/** Dashboard summary for [from, to]. */
export async function summary(db, q, t = now()) {
  await aggregateDay(db, dayOf(t)); // today is always fresh
  const { from, to } = range(q, t);
  const rows = (await db.prepare("SELECT day, metric, key, n FROM daily_agg WHERE day BETWEEN ?1 AND ?2 ORDER BY day").bind(from, to).all()).results || [];
  const daily = {};
  const totals = {};
  for (const r of rows) {
    if (["sessions", "visitors", "events", "studio_render"].includes(r.metric)) {
      (daily[r.day] ||= { day: r.day, sessions: 0, visitors: 0, events: 0, studio_render: 0 })[r.metric] = r.n;
    }
    const m = (totals[r.metric] ||= {});
    m[r.key] = (m[r.key] || 0) + r.n;
  }
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(daily[d] || { day: d, sessions: 0, visitors: 0, events: 0, studio_render: 0 });
  // weekly active sessions = sessions in the last 7 days of the range (sessions are per tab, so this is a sum)
  const last7 = days.slice(-7).reduce((s, d) => s + d.sessions, 0);
  const sorted = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).map(([key, n]) => ({ key, n }));
  const f = totals.funnel || {};
  const funnelByFeature = Object.keys(totals.start || {}).map(k => ({ feature: k, start: totals.start[k] || 0, complete: (totals.complete || {})[k] || 0 }))
    .sort((a, b) => b.start - a.start);
  const ret = totals.ret || {};
  const retTotal = Object.values(ret).reduce((a, b) => a + b, 0);
  return {
    from, to, days,
    totals: { sessions: days.reduce((s, d) => s + d.sessions, 0), visitors_daily_sum: days.reduce((s, d) => s + d.visitors, 0), events: days.reduce((s, d) => s + d.events, 0) },
    dau_avg: days.length ? Math.round(days.reduce((s, d) => s + d.sessions, 0) / days.length * 10) / 10 : 0,
    weekly_active_sessions: last7,
    pages: sorted(totals.page), features: sorted(totals.feature), domains: sorted(totals.domain),
    funnel: { visit: f.visit || 0, start: f.start || 0, complete: f.complete || 0 }, funnel_by_feature: funnelByFeature,
    lang: sorted(totals.lang), device: sorted(totals.device), errors: sorted(totals.error), duration: sorted(totals.dur),
    retention: { buckets: sorted(ret), returning_share: retTotal ? Math.round((1 - (ret.new || 0) / retTotal) * 1000) / 1000 : null },
    notes: [
      "visitors are unique per day only (salt rotates daily); weekly figures are sums of daily values",
      "retention is approximated from a coarse 'days since last visit' bucket sent by consenting browsers"
    ]
  };
}

const csvCell = v => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export async function exportCsv(db, q, t = now()) {
  await aggregateDay(db, dayOf(t));
  const { from, to } = range(q, t);
  const rows = (await db.prepare("SELECT day, metric, key, n FROM daily_agg WHERE day BETWEEN ?1 AND ?2 ORDER BY day, metric, key").bind(from, to).all()).results || [];
  return { from, to, csv: ["day,metric,key,n", ...rows.map(r => [r.day, r.metric, r.key, r.n].map(csvCell).join(","))].join("\r\n") + "\r\n" };
}
