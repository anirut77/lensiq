// @ts-check
// backend/src/leads.js — B2B demo / quotation requests (round 11). The contact form on index.html and the "notify me"
// boxes send them through lensiq-leads.js:
//
//   POST /v1/leads  {name, org?, email?, phone?, interest, plan?, message?, source?, lang?, consent: true}
//                   + X-Turnstile-Token (action "lead", FAIL CLOSED like checkout) -> 201 {ok, id}
//                   rate limited: 5 per caller per hour, LEADS_GLOBAL_DAY (200) per Bangkok day for everyone
//   GET  /admin/api/leads?status=new|acked|all     inbox (newest first)
//   POST /admin/api/leads/:id/ack                  mark handled
//   DELETE /admin/api/leads/:id                    erase one request (PDPA: the requester asked to be forgotten)
//
// Data minimisation: only what the person typed in (no IP, no user agent — the rate limit uses the day-salted caller
// hash which is never stored with the lead). Purged LEADS_DAYS (180) after it was received (retention.js). The owner
// gets an `alert.lead_new` log line and, when ALERT_WEBHOOK_URL is set, a push WITHOUT the person's details.
import { pushAlert } from "./alerts.js";
import { randomId } from "./crypto.js";
import { callerHash, hit } from "./store.js";
import { verifyTurnstile } from "./turnstile.js";
import { BKK_OFFSET, HttpError, intVar, log, now } from "./util.js";

/** Version of the contact notice next to the form (lensiq-leads.js / index.html). Bump both when the text changes. */
export const LEAD_CONSENT_VERSION = "l1";
const LIMITS = { name: 120, org: 160, email: 254, phone: 32, interest: 40, plan: 40, message: 1000, source: 40, lang: 5 };
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
  for (const k of Object.keys(body)) if (!(k in LIMITS) && k !== "consent" && k !== "consent_version" && k !== "company") throw new HttpError(400, `unknown field ${String(k).slice(0, 32)}`);
  if (body.consent !== true) throw new HttpError(400, "please agree to be contacted (consent_required)", { code: "consent_required" });
  const out = {};
  for (const [k, max] of Object.entries(LIMITS)) out[k] = clean(body[k], max);
  if (!out.org && body.company != null) out.org = clean(body.company, LIMITS.org);
  if (!out.name || out.name.length < 2) throw new HttpError(400, "name required", { code: "lead_invalid" });
  if (out.email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(out.email)) throw new HttpError(400, "invalid e-mail", { code: "lead_invalid" });
  if (out.phone && !/^[0-9+()\s-]{6,32}$/.test(out.phone)) throw new HttpError(400, "invalid phone", { code: "lead_invalid" });
  if (!out.email && !out.phone) throw new HttpError(400, "an e-mail or a phone number is needed to reply", { code: "lead_invalid" });
  if (!out.interest || !SLUG.test(out.interest)) throw new HttpError(400, "interest required", { code: "lead_invalid" });
  for (const k of ["plan", "source"]) if (out[k] && !SLUG.test(out[k])) throw new HttpError(400, `invalid ${k}`, { code: "lead_invalid" });
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
    .bind(id, t, lead.interest, lead.plan, lead.source, lead.name, lead.org, lead.email, lead.phone, lead.message, lead.lang, LEAD_CONSENT_VERSION).run();
  log("alert.lead_new", { interest: lead.interest });
  try { await pushAlert(env, "lead_new", id, null, deps.fetch); } catch { /* push is best effort */ }
  return { ok: true, id };
}

export async function adminLeads(db, q = {}) {
  const st = q.status === "acked" ? "acked" : q.status === "all" ? null : "new";
  const limit = intVar(q.limit, 100, 1, 500);
  const rows = (await db.prepare("SELECT * FROM leads WHERE (?1 IS NULL OR status = ?1) ORDER BY created_at DESC LIMIT ?2").bind(st, limit).all()).results || [];
  const open = await db.prepare("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'").first();
  return { leads: rows, open: Number(open.n) };
}

export async function ackLead(db, id) {
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "lead not found");
  const r = await db.prepare("UPDATE leads SET status = 'acked', acked_at = ?1 WHERE id = ?2 AND status = 'new'").bind(now(), id).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "lead not found or already handled");
  return { ok: true };
}

export async function deleteLead(db, id) {
  if (!ID_RE.test(String(id || ""))) throw new HttpError(404, "lead not found");
  const r = await db.prepare("DELETE FROM leads WHERE id = ?1").bind(id).run();
  if (!r.meta || !r.meta.changes) throw new HttpError(404, "lead not found");
  return { ok: true };
}
