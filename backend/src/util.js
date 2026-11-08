// @ts-check
// backend/src/util.js — HTTP helpers shared by every route: JSON responses, security headers, CORS / Origin allowlist,
// size-capped body reading, safe logging.

export const now = () => Math.floor(Date.now() / 1000);
/** UTC day 'YYYY-MM-DD' for a unix-seconds timestamp. */
export const dayOf = (t = now()) => new Date(t * 1000).toISOString().slice(0, 10);
export const addDays = (day, n) => dayOf(Math.floor(Date.parse(day + "T00:00:00Z") / 1000) + n * 86400);
/** Asia/Bangkok is UTC+7 all year (no DST). Member-facing quota days / months and "today" use Bangkok time. */
export const BKK_OFFSET = 7 * 3600;
/** Bangkok calendar day 'YYYY-MM-DD' for a unix-seconds timestamp. */
export const bkkDay = (t = now()) => dayOf(t + BKK_OFFSET);
/** Unix seconds of 00:00 Bangkok time of the day containing t. */
export const bkkDayStart = (t = now()) => Math.floor(Date.parse(bkkDay(t) + "T00:00:00Z") / 1000) - BKK_OFFSET;

export class HttpError extends Error {
  /** @param {number} status @param {string} message @param {Record<string, unknown>} [extra] */
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const BASE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Resource-Policy": "cross-origin"
};

export function json(data, status = 200, headers = {}) {
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function withHeaders(resp, headers) {
  const h = new Headers(resp.headers);
  for (const [k, v] of Object.entries(BASE_HEADERS)) if (!h.has(k)) h.set(k, v);
  for (const [k, v] of Object.entries(headers || {})) h.set(k, v);
  return new Response(resp.body, { status: resp.status, headers: h });
}

/** Comma-separated origin list -> normalised array (scheme://host[:port], no trailing slash). */
export function parseOrigins(s) {
  return String(s || "").split(",").map(o => o.trim().replace(/\/+$/, "")).filter(o => /^https?:\/\/[A-Za-z0-9.\-:[\]]+$/.test(o));
}
export const publicOrigins = env => parseOrigins(env.ALLOWED_ORIGINS);
/** Admin API origins: ADMIN_ORIGINS plus the Worker's own origin (admin.html served by the Worker itself, the
 *  recommended setup). Deliberately NO fallback to ALLOWED_ORIGINS: the public site's origin never gets admin access. */
export const adminOrigins = (env, request) => {
  const a = parseOrigins(env.ADMIN_ORIGINS);
  if (request) { try { a.push(new URL(request.url).origin); } catch { /* ignore */ } }
  return a;
};

/** Origin header check. "null" is always refused. `required`: a missing Origin is refused too. */
export function originAllowed(request, allow, { required = false } = {}) {
  const o = request.headers.get("Origin");
  if (o == null) return !required && request.headers.get("Sec-Fetch-Site") !== "cross-site";
  if (o === "null") return false;
  return allow.includes(o.replace(/\/+$/, ""));
}

export function corsHeaders(request, allow, { credentials = false, methods = "GET, POST, OPTIONS", headers = "Content-Type" } = {}) {
  const o = request.headers.get("Origin");
  if (!o || !allow.includes(o)) return { Vary: "Origin" };
  const h = { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": methods, "Access-Control-Allow-Headers": headers, "Access-Control-Max-Age": "600", Vary: "Origin" };
  if (credentials) h["Access-Control-Allow-Credentials"] = "true";
  return h;
}

/** Read the body as text, refusing more than maxBytes (Content-Length checked first, then the stream is capped). */
export async function readText(request, maxBytes) {
  const cl = request.headers.get("Content-Length");
  if (cl != null && Number(cl) > maxBytes) throw new HttpError(413, "payload too large");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } throw new HttpError(413, "payload too large"); }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

export async function readJson(request, maxBytes, { types = ["application/json"] } = {}) {
  const ct = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (!types.includes(ct)) throw new HttpError(415, "unsupported content type");
  const text = await readText(request, maxBytes);
  try { return JSON.parse(text); } catch { throw new HttpError(400, "invalid JSON"); }
}

export const clientIp = request => request.headers.get("CF-Connecting-IP") || "0.0.0.0";

/**
 * Round 12: the per-caller KEY of an address. IPv4 stays as is; an IPv6 address is reduced to its /64 prefix (a single
 * subscriber / LAN normally gets a whole /64, so rotating the low 64 bits must not buy a fresh rate-limit bucket).
 * Unparseable values are returned unchanged (still a stable key). Turnstile siteverify keeps the full address.
 */
export function ipv6Prefix64(ip) {
  let s = String(ip || "").trim().toLowerCase();
  if (!s.includes(":")) return s;
  s = s.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  let tail = [];
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) { // ::ffff:1.2.3.4 (IPv4-mapped): the IPv4 address is the caller
    if (/^(0{0,4}:){0,5}:?ffff:/.test(s.slice(0, v4.index)) || s.slice(0, v4.index) === "::") return v4.slice(1).join(".");
    tail = [((+v4[1] << 8) | +v4[2]).toString(16), ((+v4[3] << 8) | +v4[4]).toString(16)];
    s = s.slice(0, v4.index);
    if (!s.endsWith("::")) s = s.slice(0, -1);
  }
  const halves = s.split("::");
  if (halves.length > 2) return s;
  const head = halves[0] ? halves[0].split(":") : [];
  const back = (halves.length === 2 && halves[1] ? halves[1].split(":") : []).concat(tail);
  const fill = 8 - head.length - back.length;
  if (fill < 0 || (halves.length === 1 && fill !== 0)) return s;
  const groups = head.concat(Array(halves.length === 2 ? fill : 0).fill("0"), back);
  if (groups.length !== 8 || !groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) return s;
  return groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}
/** Rate-limit / pseudonym key of the caller: clientIp reduced to /64 for IPv6 (ipv6Prefix64). */
export const callerIp = request => ipv6Prefix64(clientIp(request));

export const intVar = (v, def, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
};
export const flag = (v, def = false) => (v == null || v === "" ? def : String(v).toLowerCase() === "true");

/** Structured log line: only a fixed event name + small allowlisted scalars (never bodies, keys, IPs). */
export function log(event, fields = {}) {
  const safe = {};
  for (const [k, v] of Object.entries(fields)) {
    if (/key|secret|token|password|totp|facts|body|ip|email|cookie/i.test(k)) continue;
    if (typeof v === "number" || typeof v === "boolean") safe[k] = v;
    else if (typeof v === "string") safe[k] = v.slice(0, 80);
  }
  console.log(JSON.stringify({ event, ...safe }));
}
