// @ts-check
// backend/src/identities.js — LINE Login next to Google sign-in, and the account-linking rules (stream G, owner decision
// 2026-11-13). Primitives (authorize URL, token exchange, ID-token checks) are in line.js.
//
//   POST /api/auth/line/start   {mode: "signin"|"link"|"reauth", accept_terms?, consent_version?, marketing_opt_in?, session?}
//        -> 201 {authorize_url, binding, expires_in: 600, mode}
//        signin: Turnstile (action "signin", fail closed) + the go-live gate; link / reauth: the member's bearer token
//   POST /api/auth/line/finish  {code, state, binding}   (+ bearer for link / reauth)
//        signin -> {token, expires_at, session, idle_timeout, refresh_path, created, user, provider: "line"}
//        link   -> {ok: true, linked: "line"}           reauth -> {ok: true, valid_until, valid_for}
//   POST /api/auth/link/google  {credential, nonce}       bearer: add Google to a LINE-only account
//   GET  /api/me/identities                              {methods: [{provider, linked, linked_at?}]}
//   POST /api/me/identities/unlink {provider}             fresh confirmation; never the last sign-in method
//
// Security (see docs/BACKEND.md "LINE Login"):
//   * state (32 random bytes) and the browser binding (32 random bytes, kept in the starting tab's sessionStorage) are
//     stored as SHA-256 only; a flow is single use (DELETE … RETURNING) and lives 10 minutes. The binding stops login
//     CSRF: a finish link planted by someone else lacks the victim's binding and is refused (line_state).
//   * PKCE S256 (verifier 48 random bytes) and a nonce per flow; the channel secret is sent only to LINE's token endpoint.
//   * LINE's access and refresh tokens are discarded; no picture, no e-mail (scope "openid profile" only).
// Linking rules (conservative, nothing is ever merged):
//   * a LINE account belongs to at most one LENSIQ account; a LENSIQ account has at most one Google and one LINE account
//   * linking needs the signed-in member to start AND finish the flow (same account); a LINE / Google account already
//     linked elsewhere is refused (line_already_linked / google_already_linked) — the two accounts stay separate
//   * no automatic linking by e-mail (LINE gives none)
//   * unlinking needs a fresh confirmation and is refused for the last sign-in method (last_sign_in_method)
import { randomId, randomToken, sha256Hex, timingSafeEqual } from "./crypto.js";
import { GoogleTokenError, verifyGoogleIdToken } from "./google.js";
import { LineTokenError, authorizeUrl, exchangeCode, lineConfig, pkceChallenge, verifyLineIdToken } from "./line.js";
import {
  MEMBER_CONSENT_VERSION, MEMBER_CONSENT_VERSIONS, NO_GOOGLE, REAUTH_MAX_AGE, claimNonce, googleClientId, hasGoogle, ledger, lineTombKey, newSession,
  optionalMember, publicUser, requireFreshMember, requireMember, restoreTombstone, sessionKindOf
} from "./members.js";
import { assertGoLive } from "./golive.js";
import { audit, callerHash, hit } from "./store.js";
import { verifyTurnstile } from "./turnstile.js";
import { HttpError, intVar, log, now } from "./util.js";

export const LINE_FLOW_TTL = 600;
const MODES = ["signin", "link", "reauth"];
const notConfigured = () => new HttpError(503, "LINE sign-in is not configured (line_not_configured)", { code: "line_not_configured" });
const stateErr = () => new HttpError(401, "LINE sign-in expired or was not started here — please try again (line_state)", { code: "line_state" });

/** POST /api/auth/line/start */
export async function startLine(env, request, body, deps = {}) {
  const t = deps.nowSec ?? now();
  const cfg = lineConfig(env);
  if (!cfg) throw notConfigured();
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "invalid request");
  const mode = body.mode == null ? "signin" : body.mode;
  if (!MODES.includes(mode)) throw new HttpError(400, "mode must be signin, link or reauth");
  if (body.session != null && body.session !== "short" && body.session !== "long") throw new HttpError(400, "session must be short or long");
  let userId = null, sessionHash = null;
  if (mode === "signin") {
    await assertGoLive(env, "line_signin");
    const who = await callerHash(env, request, "signin");
    const rl = await hit(env.DB, `linestart:${who}`, 20, 900, t);
    if (!rl.ok) throw new HttpError(429, "too many sign-in attempts — try again later", { retryAfter: rl.retryAfter });
    const ts = await verifyTurnstile(env, request, "signin", deps.fetch);
    if (!ts.ok) throw ts.code === "turnstile_not_configured"
      ? new HttpError(503, "sign-in unavailable: Turnstile is not configured on the server (turnstile_not_configured)", { code: "turnstile_not_configured" })
      : new HttpError(403, "bot check failed (turnstile_failed)", { code: "turnstile_failed" });
    const g = await hit(env.DB, "signin:global", intVar(env.SIGNIN_GLOBAL_15MIN, 300, 1, 100000), 900, t);
    if (!g.ok) throw new HttpError(429, "sign-in temporarily busy", { retryAfter: g.retryAfter });
  } else {
    const m = await requireMember(env, request);
    const rl = await hit(env.DB, `linestart:u:${m.user.id}`, 20, 900, t);
    if (!rl.ok) throw new HttpError(429, "too many attempts — try again later", { retryAfter: rl.retryAfter });
    userId = m.user.id; sessionHash = m.idHash;
  }
  const state = randomToken(32), binding = randomToken(32), nonce = randomToken(24), verifier = randomToken(48);
  const accept = body.accept_terms === true && MEMBER_CONSENT_VERSIONS.includes(body.consent_version);
  await env.DB.prepare("INSERT INTO line_auth_flows (state_hash, binding_hash, nonce, code_verifier, redirect_uri, mode, user_id, session_hash, " +
    "accept_terms, consent_version, marketing_opt_in, session_kind, created_at, expires_at) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)")
    .bind(await sha256Hex(state), await sha256Hex(binding), nonce, verifier, cfg.redirectUri, mode, userId, sessionHash, accept ? 1 : 0, accept ? body.consent_version : null,
      body.marketing_opt_in === true ? 1 : 0, sessionKindOf(body.session), t, t + LINE_FLOW_TTL).run();
  const url = authorizeUrl(cfg, { state, nonce, challenge: await pkceChallenge(verifier), maxAge: mode === "reauth" ? REAUTH_MAX_AGE : undefined });
  return { authorize_url: url, binding, expires_in: LINE_FLOW_TTL, mode };
}

const lineErr = e => {
  if (!(e instanceof LineTokenError)) return e;
  log("member.line.rejected", { reason: e.code });
  if (e.code === "unavailable") return new HttpError(503, "LINE is not reachable — please try again (line_unavailable)", { code: "line_unavailable" });
  if (e.code === "code") return new HttpError(401, "LINE sign-in could not be completed — please try again (line_code)", { code: "line_code" });
  return new HttpError(401, "LINE sign-in could not be verified (line_token)", { code: "line_token" });
};

/** POST /api/auth/line/finish */
export async function finishLine(env, request, body, deps = {}) {
  const t = deps.nowSec ?? now();
  if (!body || typeof body !== "object" || typeof body.code !== "string" || !/^[A-Za-z0-9._~-]{1,512}$/.test(body.code) ||
    typeof body.state !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(body.state) || typeof body.binding !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.binding)) {
    throw new HttpError(400, "code, state and binding are required");
  }
  const cfg = lineConfig(env);
  if (!cfg) throw notConfigured();
  const who = await callerHash(env, request, "signin");
  const rl = await hit(env.DB, `linefinish:${who}`, 30, 900, t);
  if (!rl.ok) throw new HttpError(429, "too many sign-in attempts — try again later", { retryAfter: rl.retryAfter });
  // single use: the row is deleted whatever happens next
  const row = await env.DB.prepare("DELETE FROM line_auth_flows WHERE state_hash = ?1 AND expires_at > ?2 RETURNING *").bind(await sha256Hex(body.state), t).first();
  if (!row || !timingSafeEqual(String(row.binding_hash), await sha256Hex(body.binding))) throw stateErr();
  let m = null;
  if (row.mode !== "signin") {
    m = await optionalMember(env, request, t);
    if (!m || m.user.id !== row.user_id) throw new HttpError(403, "please finish in the account that started this (line_wrong_session)", { code: "line_wrong_session" });
  }
  let c;
  try {
    const idToken = await exchangeCode(cfg, body.code, String(row.code_verifier), deps.fetch);
    c = await verifyLineIdToken(idToken, { channelId: cfg.channelId, secret: cfg.secret, nonce: String(row.nonce), fetchImpl: deps.fetch, now: t });
  } catch (e) { throw lineErr(e); }
  const sub = String(c.sub);
  const linked = await env.DB.prepare("SELECT user_id FROM user_identities WHERE provider = 'line' AND sub = ?1").bind(sub).first();

  if (row.mode === "reauth") {
    if (!linked || linked.user_id !== m.user.id) {
      await audit(env, "member", "member.reauth.wrong_account", { user: m.user.id, provider: "line" });
      throw new HttpError(403, "please confirm with the same LINE account (reauth_wrong_account)", { code: "reauth_wrong_account" });
    }
    const at = typeof c.auth_time === "number" ? c.auth_time : c.iat;
    if (typeof at !== "number" || t - at > REAUTH_MAX_AGE) throw new HttpError(401, "please sign in with LINE again — the confirmation must be recent (reauth_stale)", { code: "reauth_stale" });
    await env.DB.prepare("UPDATE member_sessions SET reauth_at = ?1 WHERE id_hash = ?2").bind(t, m.idHash).run();
    return { ok: true, valid_until: t + REAUTH_MAX_AGE, valid_for: REAUTH_MAX_AGE };
  }
  if (row.mode === "link") {
    if (linked && linked.user_id !== m.user.id) throw new HttpError(409, "this LINE account is already linked to another LENSIQ account (line_already_linked)", { code: "line_already_linked" });
    if (!linked) {
      const mine = await env.DB.prepare("SELECT 1 AS x FROM user_identities WHERE provider = 'line' AND user_id = ?1").bind(m.user.id).first();
      if (mine) throw new HttpError(409, "this account already has a LINE account linked (line_already_linked)", { code: "line_already_linked" });
      await env.DB.prepare("INSERT INTO user_identities (provider, sub, user_id, created_at, last_login_at) VALUES ('line', ?1, ?2, ?3, NULL)").bind(sub, m.user.id, t).run();
      await audit(env, "member", "member.identity.linked", { user: m.user.id, provider: "line" });
    }
    return { ok: true, linked: "line" };
  }

  // sign-in
  const accept = row.accept_terms === 1 && MEMBER_CONSENT_VERSIONS.includes(row.consent_version);
  const name = typeof c.name === "string" ? c.name.replace(/[\u0000-\u001f<>`]/g, "").trim().slice(0, 40) || null : null;
  let u = linked ? await env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(linked.user_id).first() : null;
  let created = false;
  if (u) {
    if (u.status !== "active") throw new HttpError(403, "this account is disabled — contact support", { code: "account_disabled" });
    const needsConsent = u.consent_version !== MEMBER_CONSENT_VERSION;
    if (needsConsent && !accept) throw new HttpError(400, "please accept the updated terms and privacy notice (consent_required)", { code: "consent_required" });
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET last_login_at = ?1, display_name = COALESCE(display_name, ?2), consent_version = CASE WHEN ?3 THEN ?4 ELSE consent_version END, " +
        "consent_at = CASE WHEN ?3 THEN ?1 ELSE consent_at END, marketing_opt_in = CASE WHEN ?5 THEN 1 ELSE marketing_opt_in END, " +
        "marketing_opt_in_at = CASE WHEN ?5 AND marketing_opt_in = 0 THEN ?1 ELSE marketing_opt_in_at END WHERE id = ?6")
        .bind(t, name, needsConsent ? 1 : 0, MEMBER_CONSENT_VERSION, row.marketing_opt_in === 1 ? 1 : 0, u.id),
      env.DB.prepare("UPDATE user_identities SET last_login_at = ?1 WHERE provider = 'line' AND sub = ?2").bind(t, sub)
    ]);
  } else {
    if (!accept) throw new HttpError(400, "please accept the terms and privacy notice (consent_required)", { code: "consent_required" });
    const id = randomId(16), mk = row.marketing_opt_in === 1 ? 1 : 0;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, google_sub, email, email_verified, display_name, status, consent_version, consent_at, marketing_opt_in, marketing_opt_in_at, created_at, last_login_at) " +
        "VALUES (?1, ?2, '', 0, ?3, 'active', ?4, ?5, ?6, ?7, ?5, ?5)").bind(id, NO_GOOGLE + id, name, MEMBER_CONSENT_VERSION, t, mk, mk ? t : null),
      env.DB.prepare("INSERT INTO user_identities (provider, sub, user_id, created_at, last_login_at) VALUES ('line', ?1, ?2, ?3, ?3)").bind(sub, id, t)
    ]);
    created = true;
    await ledger(env, id, "signup", {}, t);
    await restoreTombstone(env, lineTombKey(sub), id, t);
    u = await env.DB.prepare("SELECT * FROM users WHERE id = ?1").bind(id).first();
  }
  const s = await newSession(env.DB, u.id, t, request, sessionKindOf(row.session_kind));
  await audit(env, "member", created ? "member.signup" : "member.login", { user: u.id, session: s.kind, provider: "line" }, who);
  return { token: s.token, expires_at: s.expires_at, session: s.kind, idle_timeout: s.idle_timeout, refresh_path: "/api/auth/refresh", created, user: publicUser(u), provider: "line" };
}

/** GET /api/me/identities */
export async function listIdentities(env, m) {
  const line = await env.DB.prepare("SELECT created_at FROM user_identities WHERE user_id = ?1 AND provider = 'line'").bind(m.user.id).first();
  return {
    methods: [
      { provider: "google", linked: hasGoogle(m.user) },
      line ? { provider: "line", linked: true, linked_at: line.created_at } : { provider: "line", linked: false }
    ],
    line_enabled: !!lineConfig(env), google_enabled: !!googleClientId(env)
  };
}

/** POST /api/me/identities/unlink {provider} */
export async function unlinkIdentity(env, m, body, deps = {}) {
  const provider = body && body.provider;
  if (provider !== "google" && provider !== "line") throw new HttpError(400, "provider must be google or line");
  await requireFreshMember(env, m, body, deps);
  const line = await env.DB.prepare("SELECT 1 AS x FROM user_identities WHERE user_id = ?1 AND provider = 'line'").bind(m.user.id).first();
  const have = { google: hasGoogle(m.user), line: !!line };
  if (!have[provider]) throw new HttpError(409, "this sign-in method is not linked (not_linked)", { code: "not_linked" });
  if (!have.google || !have.line) throw new HttpError(409, "you cannot remove your only sign-in method (last_sign_in_method)", { code: "last_sign_in_method" });
  if (provider === "line") await env.DB.prepare("DELETE FROM user_identities WHERE user_id = ?1 AND provider = 'line'").bind(m.user.id).run();
  // Google: the account e-mail stays (receipts / support); the Google account id is replaced by the placeholder
  else await env.DB.prepare("UPDATE users SET google_sub = ?1 WHERE id = ?2").bind(NO_GOOGLE + m.user.id, m.user.id).run();
  await audit(env, "member", "member.identity.unlinked", { user: m.user.id, provider });
  return { ok: true, unlinked: provider };
}

/** POST /api/auth/link/google {credential, nonce} — adds Google to a signed-in account that has none. */
export async function linkGoogle(env, m, body, deps = {}) {
  const t = deps.nowSec ?? now();
  const clientId = googleClientId(env);
  if (!clientId) throw new HttpError(503, "Google sign-in is not configured (google_not_configured)", { code: "google_not_configured" });
  const rl = await hit(env.DB, `linkg:${m.user.id}`, 10, 900, t);
  if (!rl.ok) throw new HttpError(429, "too many attempts — try again later", { retryAfter: rl.retryAfter });
  if (!body || !(await claimNonce(env.DB, body.nonce, t))) throw new HttpError(401, "sign-in expired — please try again (nonce)", { code: "nonce" });
  let c;
  try {
    c = await verifyGoogleIdToken(String(body.credential || ""), { clientId, nonce: body.nonce, fetchImpl: deps.fetch, now: t });
  } catch (e) {
    if (e instanceof GoogleTokenError) throw new HttpError(e.code === "jwks_unavailable" || e.code === "jwks_empty" ? 503 : 401, "Google sign-in could not be verified", { code: e.code });
    throw e;
  }
  if (hasGoogle(m.user)) {
    if (m.user.google_sub === c.sub) return { ok: true, linked: "google" };
    throw new HttpError(409, "this account already has a Google account linked (google_already_linked)", { code: "google_already_linked" });
  }
  const other = await env.DB.prepare("SELECT id FROM users WHERE google_sub = ?1").bind(c.sub).first();
  if (other) throw new HttpError(409, "this Google account is already linked to another LENSIQ account (google_already_linked)", { code: "google_already_linked" });
  const name = typeof c.given_name === "string" ? c.given_name.replace(/[\u0000-\u001f<>`]/g, "").trim().slice(0, 40) || null : null;
  await env.DB.prepare("UPDATE users SET google_sub = ?1, email = ?2, email_verified = 1, display_name = COALESCE(display_name, ?3) WHERE id = ?4")
    .bind(c.sub, String(c.email).toLowerCase().slice(0, 254), name, m.user.id).run();
  await audit(env, "member", "member.identity.linked", { user: m.user.id, provider: "google" });
  return { ok: true, linked: "google" };
}
