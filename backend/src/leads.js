// @ts-check
// backend/src/leads.js — B2B quotation requests (round 11; switched on 2026-11-12 by the owner). The quote form on
// index.html sends them through lensiq-leads.js:
//
//   POST /v1/leads  {name, org?, email?, phone?, interest, message?, source?, lang?, consent: true}
//                   only what a quote needs (owner decision 2026-11-12): name, organisation, one contact (e-mail or
//                   phone), product of interest, message; anything else is refused (400 unknown field)
//                   + X-Turnstile-Token (action "lead", FAIL CLOSED like checkout) -> 201 {ok, id}
//                   rate limited: 5 per caller per hour, LEADS_GLOBAL_DAY (200; the test deployment sets 50) per Bangkok day
//   GET  /admin/api/leads?status=new|contacted|closed|all   inbox (newest first): summary fields only + counts + unread
//   GET  /admin/api/leads/unread                   {unread}: new requests the owner has not opened yet (tab badge)
//   GET  /admin/api/leads/:id                      one request with contact details + its automatic deletion date
//                                                  (opening it marks it read: viewed_at, migration 0014)
//   POST /admin/api/leads/:id/status {status}      new | contacted | closed (owner decision 2026-11-12)
//   POST /admin/api/leads/:id/ack                  legacy: mark handled (= contacted)
//   DELETE /admin/api/leads/:id                    erase one request (PDPA: the requester asked to be forgotten; re-auth)
//   POST /admin/api/leads/export {status?}         CSV of the inbox (re-auth)
//   Every inbox action is audited by index.js with the request id / count only, never personal data.
//
// Data minimisation: only what the person typed in (no IP, no user agent — the rate limit uses the day-salted caller
// hash which is never stored with the lead). Purged LEADS_DAYS (180) after it was received (retention.js). The owner
// gets an `alert.lead_new` log line and, when ALERT_WEBHOOK_URL is set, a push WITHOUT the person's details.
// LINE push to the owner (owner decision 2026-11-12): when BOTH Worker secrets are set by the owner,
// LINE_CHANNEL_ACCESS_TOKEN (Messaging API channel access token of the LINE OA "LENSIQ" @632yliiw) and
// LEAD_NOTIFY_LINE_TO (the owner's LINE user ID, U + 32 hex), every stored request sends ONE push
// "LENSIQ: คำขอใบเสนอราคาใหม่ #<id> <time>" (no personal data), at most LEAD_NOTIFY_LINE_DAY (50) per Bangkok day.
// A LINE failure never blocks or undoes the stored request. Only push is used: no webhook, so no channel secret.
// POST /health/notify-test (Bearer HEALTH_TOKEN; `npm run backend:notify-test`) sends one test push, 3 per hour.
// The page form sends here while window.LENSIQ_LEADS_FORM is on (lensiq-config.js) and the deployment lists /v1/leads
// in PUBLIC_ROUTES.
import { pushAlert } from "./alerts.js";
import { randomId } from "./crypto.js";
import { callerHash, hit } from "./store.js";
import { verifyTurnstile } from "./turnstile.js";
import { BKK_OFFSET, HttpError, intVar, log, now } from "./util.js";

/** Inbox statuses. Rows written before 2026-11-12 may still say "acked": shown and filtered as "contacted". */
export const LEAD_STATUSES = ["new", "contacted", "closed"];
const LINE_PUSH = "https://api.line.me/v2/bot/message/push";
export const LINE_TO_RE = /^U[0-9a-f]{32}$/; // the owner's LINE user ID (LINE Developers console: Basic settings)
export const LINE_TEST_PER_HOUR = 3;
/** Days a request is kept (retention.js purges after this many days from receipt). @param {any} env */
export const leadDays = env => intVar(env && env.LEADS_DAYS, 180, 7, 3650);

/** Version of the contact notice next to the form (lensiq-leads.js / index.html). Bump both when the text changes. */
export const LEAD_CONSENT_VERSION = "l1";
const LIMITS = { name: 120, org: 160, email: 254, phone: 32, interest: 40, message: 1000, source: 40, lang: 5 };
const SLUG = /^[A-Za-z0-9_.-]{1,40}$/;
const ID_RE = /^[a-f0-9]{24}$/;

const clean = (v, max) => {
  if (v == null) return null;
  if (typeof v !== "string") throw new HttpError(400, "lead fields must be text");
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (s.length > max) throw new HttpError(400, "lead field too long");
  return s || null;
};

/** Validates a lead body; returns the row to store. Throws 400 with a code the page can show. */
export function cleanLead(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "invalid request");
  // own keys only: `k in LIMITS` let Object.prototype names (constructor, toString, __proto__ ...) through (review S1)
  for (const k of Object.keys(body)) {
    if (!Object.hasOwn(LIMITS, k) && k !== "consent" && k !== "consent_version" && k !== "company") throw new HttpError(400, `unknown field ${String(k).slice(0, 32)}`);
  }
  if (body.consent !== true) throw new HttpError(400, "please agree to be contacted (consent_required)", { code: "consent_required" });
  const out = {};
  for (const [k, max] of Object.entries(LIMITS)) out[k] = clean(body[k], max);
  if (!out.org && body.company != null) out.org = clean(body.company, LIMITS.org);
  if (!out.name || out.name.length < 2) throw new HttpError(400, "name required", { code: "lead_invalid" });
  if (out.email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(out.email)) throw new HttpError(400, "invalid e-mail", { code: "lead_invalid" });
  if (out.phone && !/^[0-9+()\s-]{6,32}$/.test(out.phone)) throw new HttpError(400, "invalid phone", { code: "lead_invalid" });
  if (!out.email && !out.phone) throw new HttpError(400, "an e-mail or a phone number is needed to reply", { code: "lead_invalid" });
  if (!out.interest || !SLUG.test(out.interest)) throw new HttpError(400, "interest required", { code: "lead_invalid" });
  for (const k of ["source"]) if (out[k] && !SLUG.test(out[k])) throw new HttpError(400, `invalid ${k}`, { code: "lead_invalid" });
  if (out.lang && !["th", "en", "zh"].includes(out.lang)) out.lang = null;
  if (out.email) out.email = out.email.toLowerCase();
  return out;
}

export async function submitLead(env, request, body, deps = {}) {
  const ts = await verifyTurnstile(env, request, "lead", deps.fetch);
  if (!ts.ok) throw ts.code === "turnstile_not_configured"
    ? new HttpError(503, "the request form is unavailable: Turnstile is not configured on the server (turnstile_not_configured)", { code: "turnstile_not_configured" })
    : new HttpError(403, "bot check failed (turnstile_failed)", { code: "turnstile_failed" });
  const lead = cleanLead(body);
  const who = await callerHash(env, request, "lead");
  const a = await hit(env.DB, `lead:${who}`, 5, 3600);
  if (!a.ok) throw new HttpError(429, "too many requests — try again later", { retryAfter: a.retryAfter });
  const g = await hit(env.DB, "lead:global", intVar(env.LEADS_GLOBAL_DAY, 200, 1, 100000), 86400, now(), BKK_OFFSET);
  if (!g.ok) throw new HttpError(429, "the request inbox is full for today — please try again tomorrow", { retryAfter: g.retryAfter });
  const id = randomId(12), t = now();
  await env.DB.prepare("INSERT INTO leads (id, created_at, product, plan, source, name, company, email, phone, message, lang, consent_version, status) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'new')")
    .bind(id, t, lead.interest, null, lead.source, lead.name, lead.org, lead.email, lead.phone, lead.message, lead.lang, LEAD_CONSENT_VERSION).run();
  log("alert.lead_new", { interest: lead.interest });
  try { await pushAlert(env, "lead_new", id, null, deps.fetch); } catch { /* push is best effort */ }
  try { await notifyLine(env, id, t, deps.fetch); } catch { /* push is best effort */ }
  return { ok: true, id };
}

/** "YYYY-MM-DD HH:MM" in Bangkok time. @param {number} t unix seconds */
const bkkTime = t => new Date((t + BKK_OFFSET) * 1000).toISOString().slice(0, 16).replace("T", " ");

/** @param {any} env */
const lineConfig = env => {
  const token = String(env.LINE_CHANNEL_ACCESS_TOKEN || "").trim(), to = String(env.LEAD_NOTIFY_LINE_TO || "").trim();
  return { token, to, ok: !!token && !/\s/.test(token) && LINE_TO_RE.test(to) };
};
/** One LINE push (text only). Returns the LINE HTTP status (0 = network error / timeout). The token is never logged.
 *  @param {{token: string, to: string}} c @param {string} text @param {typeof fetch} [fetchImpl] */
async function linePush(c, text, fetchImpl) {
  /** @type {RequestInit} */
  const init = { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + c.token },
    body: JSON.stringify({ to: c.to, messages: [{ type: "text", text }] }) };
  try { init.signal = AbortSignal.timeout(3000); } catch { /* older runtime */ }
  try { const r = await (fetchImpl || fetch)(LINE_PUSH, init); return r ? r.status : 0; } catch { return 0; }
}

/** LINE push to the owner for a new request: id and time only. Off unless both owner-entered secrets are set; daily cap.
 *  @param {any} env @param {string} id @param {number} t @param {typeof fetch} [fetchImpl] */
export async function notifyLine(env, id, t, fetchImpl) {
  const c = lineConfig(env);
  if (!c.ok) return false;
  const cap = await hit(env.DB, "lead:line", intVar(env.LEAD_NOTIFY_LINE_DAY, 50, 1, 1000), 86400, now(), BKK_OFFSET);
  if (!cap.ok) { log("alert.lead_line_capped", {}); return false; }
  const st = await linePush(c, `LENSIQ: คำขอใบเสนอราคาใหม่ #${id} ${bkkTime(t)}`, fetchImpl);
  if (st < 200 || st > 299) log("alert.lead_line_failed", { status: st });
  return st >= 200 && st <= 299;
}

/** POST /health/notify-test: one test push to the owner, LINE_TEST_PER_HOUR per hour. Never returns the token or the
 *  recipient. @param {any} env @param {typeof fetch} [fetchImpl] */
export async function lineTest(env, fetchImpl) {
  const c = lineConfig(env);
  const missing = [!c.token ? "LINE_CHANNEL_ACCESS_TOKEN" : "", !LINE_TO_RE.test(c.to) ? "LEAD_NOTIFY_LINE_TO" : ""].filter(Boolean);
  if (missing.length) return { ok: false, configured: false, missing };
  const rl = await hit(env.DB, "lead:line_test", LINE_TEST_PER_HOUR, 3600);
  if (!rl.ok) throw new HttpError(429, `test limit reached (${LINE_TEST_PER_HOUR} per hour) — try again later`, { code: "too_many", retryAfter: rl.retryAfter });
  const st = await linePush(c, `LENSIQ: ทดสอบการแจ้งเตือน ${bkkTime(now())}`, fetchImpl);
  return { ok: st >= 200 && st <= 299, configured: true, line_status: st };
}

/** @param {any} s */
const statusOf = s => (s === "acked" ? "contacted" : s);
const SUMMARY = "id, created_at, product, plan, source, lang, name, company, status, acked_at, viewed_at";
const STATUS_SQL = "(CASE status WHEN 'acked' THEN 'contacted' ELSE status END)";

/** Inbox list, newest first: summary fields only (contact details and message only in the audited single view).
 *  @param {any} db @param {any} [q] */
export async function adminLeads(db, q = {}) {
  const want = q.status === "acked" ? "contacted" : LEAD_STATUSES.includes(q.status) ? q.status : q.status === "all" ? null : "new";
  const limit = intVar(q.limit, 100, 1, 500);
  const rows = (await db.prepare(`SELECT ${SUMMARY} FROM leads WHERE (?1 IS NULL OR ${STATUS_SQL} = ?1) ORDER BY created_at DESC, id DESC LIMIT ?2`)
    .bind(want, limit).all()).results || [];
  const counts = { new: 0, contacted: 0, closed: 0 };
  const unread = await unreadLeads(db);
  for (const c of (await db.prepare("SELECT status, COUNT(*) AS n FROM leads GROUP BY status").all()).results || []) {
    const k = statusOf(c.status);
    if (k === "new" || k === "contacted" || k === "closed") counts[k] += Number(c.n);
  }
  return {
    leads: rows.map(/** @param {any} r */ r => ({ id: r.id, created_at: r.created_at, interest: r.product, plan: r.plan, source: r.source, lang: r.lang,
      name: r.name, company: r.company, status: statusOf(r.status), status_at: r.acked_at || null,
      unread: r.status === "new" && r.viewed_at == null })),
    open: counts.new, counts, unread, status: want || "all"
  };
}

/** New requests not opened yet (badge on the admin tab). @param {any} db */
export async function unreadLeads(db) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM leads WHERE status = 'new' AND viewed_at IS NULL").first();
  return Number(r && r.n) || 0;
}

/** One request in full + when it is deleted automatically. @param {any} env @param {string} id */
export async function getLead(env, id) {
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "lead not found");
  const r = await env.DB.prepare("SELECT * FROM leads WHERE id = ?1").bind(id).first();
  if (!r) throw new HttpError(404, "lead not found");
  if (r.viewed_at == null) await env.DB.prepare("UPDATE leads SET viewed_at = ?1 WHERE id = ?2 AND viewed_at IS NULL").bind(now(), id).run();
  const days = leadDays(env);
  return {
    lead: { id: r.id, created_at: r.created_at, interest: r.product, plan: r.plan, source: r.source, lang: r.lang, name: r.name, company: r.company,
      email: r.email, phone: r.phone, message: r.message, consent_version: r.consent_version, status: statusOf(r.status), status_at: r.acked_at || null,
      delete_after: r.created_at + days * 86400 },
    retention_days: days
  };
}

/** @param {any} db @param {string} id @param {any} status */
export async function setLeadStatus(db, id, status) {
  if (typeof status !== "string" || !LEAD_STATUSES.includes(status)) throw new HttpError(400, "status must be new, contacted or closed", { code: "bad_status" });
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "lead not found");
  const r = await db.prepare("UPDATE leads SET status = ?1, acked_at = ?2, viewed_at = COALESCE(viewed_at, ?2) WHERE id = ?3").bind(status, now(), id).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "lead not found");
  return { ok: true, id, status };
}

/** Legacy route: mark a new request handled (= contacted). @param {any} db @param {string} id */
export async function ackLead(db, id) {
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "lead not found");
  const r = await db.prepare("UPDATE leads SET status = 'contacted', acked_at = ?1, viewed_at = COALESCE(viewed_at, ?1) WHERE id = ?2 AND status = 'new'").bind(now(), id).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "lead not found or already handled");
  return { ok: true };
}

/** @param {any} db @param {string} id */
export async function deleteLead(db, id) {
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "lead not found");
  const r = await db.prepare("DELETE FROM leads WHERE id = ?1").bind(id).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "lead not found");
  return { ok: true };
}

/** @param {any} v */
const csvCell = v => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula injection guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** @param {number} t */
const isoDay = t => new Date(t * 1000).toISOString().slice(0, 10);
/** @param {number} t */
const isoTime = t => new Date(t * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
export const LEAD_CSV_HEAD = "id,received,status,interest,plan,source,lang,name,organisation,email,phone,message,consent_version,delete_after";

/** CSV of the inbox (newest first), all or one status. @param {any} env @param {any} [q] */
export async function exportLeads(env, q = {}) {
  const want = LEAD_STATUSES.includes(q.status) ? q.status : null;
  const rows = (await env.DB.prepare(`SELECT * FROM leads WHERE (?1 IS NULL OR ${STATUS_SQL} = ?1) ORDER BY created_at DESC, id DESC LIMIT 5000`)
    .bind(want).all()).results || [];
  const days = leadDays(env);
  const lines = rows.map(/** @param {any} r */ r => [r.id, isoTime(r.created_at), statusOf(r.status), r.product, r.plan, r.source, r.lang, r.name, r.company,
    r.email, r.phone, r.message, r.consent_version, isoDay(r.created_at + days * 86400)].map(csvCell).join(","));
  return { csv: [LEAD_CSV_HEAD, ...lines].join("\r\n") + "\r\n", n: rows.length, status: want || "all", filename: `lensiq-quote-requests-${isoDay(now())}.csv` };
}
