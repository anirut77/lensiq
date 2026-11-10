// @ts-check
// backend/src/tester.js — controls of a closed-test deployment (docs/DEPLOY.md). Every switch is a Worker var / secret and
// is UNSET in the default configuration, where nothing here changes any behaviour.
//
//   SERVICE_OFF ("1" / "true" / "on")   kill switch: every public route except GET /health and CORS preflights answers
//                          503 {off:true, fallback:true, reason:"service_off"}. The admin back office stays reachable.
//   PUBLIC_ROUTES (comma list; "/a/*" = prefix)   allow-list of public routes of THIS deployment. A public route that is
//                          not listed answers 404 {code:"route_off"} before anything touches D1. Unset = every route
//                          (default configuration). /health is always allowed.
//   DAILY_REQUEST_CAP (1..50000)        LENSIQ-side budget of public requests per UTC day (the Free plan's 100,000 requests
//                          a day are shared by the whole account): over it 429 {code:"daily_cap"} until 00:00 UTC.
//   D1_WRITE_BUDGET (1..50000)          budget of D1 write statements per UTC day caused by public routes (the Free
//                          plan's 100,000 rows written a day are shared too): over it 429 {code:"d1_budget"} for every
//                          counted public route. Writes are counted by a meter around env.DB (meterDb).
//                          Both are APPROXIMATE (see countRequest): counted per isolate, stored in ONE D1 row, written
//                          once per CAP_BATCH requests. Reaching one switches the public service off for the rest of the
//                          UTC day and raises the owner alert "daily_limit_reached". A counter that cannot be read or
//                          written, or a value that is not a plain number in range, refuses (fail closed, alert
//                          "config_invalid"). A refused request has still reached the Worker and still counts at
//                          Cloudflare: the budgets bound LENSIQ's own work, not a flood.
//   ADMIN_UNAUTH_WRITES_HOUR (1..5000)  bound on the D1 writes that unauthenticated admin requests (failed sign-ins) can
//                          cause per hour and isolate, WITHOUT ever refusing a correct sign-in (adminUnauth below).
//   (The Referer of a request is NOT used for any decision: Safari / iOS, Firefox strict mode and Brave reduce it to the
//   origin, and it is not a security boundary. The site origin is shared with the owner's other Pages projects; that
//   residual risk is described in docs/DEPLOY.md.)
//   TESTER_GATE ("required") + TESTER_ACCESS_CODE (secret)   header X-Tester-Code on every gated request.
//                          - "required" with a missing, short or easy-to-guess secret (weakCode) refuses everyone
//                            (fail closed, alert "tester_code_weak");
//                          - the code is compared as SHA-256 digests in constant time, with NO database access: a
//                            correct code always passes, whatever anybody else is doing (nobody can lock testers out);
//                          - a wrong code costs at most one read and one write, FAIL_CALLER times per caller and window
//                            (D1 counter + an in-memory limiter per isolate); after that, and after FAIL_GLOBAL wrong
//                            codes per hour in the isolate, wrong codes get a 429 that touches nothing;
//                          - protection against guessing is the code itself (>= 16 characters, weakCode rules, enforced
//                            here) plus the request cap, not a lock-out;
//                          - the code is never logged, stored or echoed. A new secret value is a new Worker version at
//                            once: the old code stops working.
import { raiseAlert } from "./billing.js";
import { sha256Hex, timingSafeEqual } from "./crypto.js";
import { callerHash, hit } from "./store.js";
import { callerIp, dayOf, log, now } from "./util.js";

export const TESTER_HEADER = "X-Tester-Code";
export const TESTER_MIN = 16;
export const TESTER_MAX = 200;
export const FAIL_CALLER = 5;
export const FAIL_CALLER_WIN = 900;
export const FAIL_GLOBAL = 100;
export const FAIL_GLOBAL_WIN = 3600;
export const CAP_BATCH = 10;
export const CAP_MAX = 50000;

const WEAK_WORDS = ["password", "passw0rd", "tester", "lensiq", "qwerty", "letmein", "welcome", "admin", "secret", "iloveyou", "medicine", "abc123"];
/** Why a tester code is not usable ("" = fine): shorter than TESTER_MIN, too few different characters, a common word, a run
 *  of consecutive characters, a repeated pattern. The text never quotes the value. Used by the Worker (a weak configured
 *  code refuses everyone) and by tools/secrets-setup.mjs (the owner is told why). @param {string} v */
export function weakCode(v) {
  const s = String(v);
  if (s.length < 16) return "at least 16 characters are needed";
  if (new Set(s).size < 8) return "too few different characters (use at least 8 different ones)";
  const low = s.toLowerCase();
  if (WEAK_WORDS.some(w => low.includes(w))) return "it contains a common word (such as password, tester, lensiq, admin)";
  let up = 1, down = 1;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    up = d === 1 ? up + 1 : 1; down = d === -1 ? down + 1 : 1;
    if (up >= 6 || down >= 6) return "it contains a run of consecutive characters (such as 123456 or abcdef)";
  }
  if (/(.{1,4})\1{3,}/.test(s)) return "it repeats the same short pattern";
  return "";
}

/** @param {any} env */
export const serviceOff = env => /^(1|true|on|yes)$/i.test(String(env.SERVICE_OFF ?? "").trim());
export const OFF_BODY = Object.freeze({ off: true, fallback: true, reason: "service_off", code: "service_off",
  error: "the service is switched off; on-device results only" });

/* ---------------- public route allow-list ---------------- */
/** @param {any} env @returns {string[]|null} patterns, or null when no allow-list is set (every route) */
export function publicRoutes(env) {
  const raw = String(env.PUBLIC_ROUTES ?? "").trim();
  return raw ? raw.split(",").map(s => s.trim()).filter(s => s.startsWith("/")) : null;
}
/** Is this public path enabled in this deployment? /health always is. @param {any} env @param {string} path */
export function routeEnabled(env, path) {
  const list = publicRoutes(env);
  if (!list || path === "/health") return true;
  return list.some(p => (p.endsWith("/*") ? path.startsWith(p.slice(0, -1)) || path === p.slice(0, -2) : path === p));
}
export const ROUTE_OFF_BODY = Object.freeze({ fallback: true, reason: "route_off", code: "route_off", error: "not enabled in this deployment" });

/* ---------------- tester gate ---------------- */
/** @param {any} env */
export const testerGateRequired = env => String(env.TESTER_GATE || "").trim().toLowerCase() === "required";

/** in-memory wrong-code limiter of this isolate: per caller and in total (no D1 once a limit is reached) */
const WRONG = { callers: /** @type {Map<string, {t: number, n: number}>} */ (new Map()), g: { t: 0, n: 0 }, weakAlert: 0 };
/** Tests: forget the isolate state. */
export function resetTesterState() { WRONG.callers.clear(); WRONG.g = { t: 0, n: 0 }; WRONG.weakAlert = 0; }

/**
 * State of the tester gate for this request.
 *   {required:false, ok:true}                        gate off (local dev, on-premise): everything behaves as before
 *   {required:true, ok:true}                         valid code (decided without any database access)
 *   {required:true, ok:false, reason, status}        "tester_required" (403: no / wrong code, or the configured code is
 *                                                    not usable) or "tester_locked" (429: too many wrong codes)
 * @param {any} env @param {Request} request
 * @returns {Promise<{required: boolean, ok: boolean, reason?: string, status?: number, retryAfter?: number}>}
 */
export async function testerState(env, request) {
  if (!testerGateRequired(env)) return { required: false, ok: true };
  const refuse = { required: true, ok: false, reason: "tester_required", status: 403 };
  const secret = typeof env.TESTER_ACCESS_CODE === "string" ? env.TESTER_ACCESS_CODE.trim() : "";
  const given = String(request.headers.get(TESTER_HEADER) || "").trim();
  const t = now();
  if (weakCode(secret)) { // fail closed: no usable secret (missing, short or easy to guess); one alert per hour and isolate
    if (secret && t - WRONG.weakAlert >= 3600) {
      WRONG.weakAlert = t;
      try { await raiseAlert(env, "tester_code_weak", null, { gate: "required" }); } catch { /* never fails the request */ }
    }
    return refuse;
  }
  if (!given) return refuse; // no code: not an attempt, nothing counted
  // a correct code ALWAYS passes: digests compared in constant time, no database, no dependence on other callers
  if (given.length <= TESTER_MAX && timingSafeEqual(await sha256Hex("lq-tester|" + given), await sha256Hex("lq-tester|" + secret))) return { required: true, ok: true };

  // a wrong code: throttled per caller, capped in total; over a limit the refusal touches nothing
  const locked = win => ({ required: true, ok: false, reason: "tester_locked", status: 429, retryAfter: win - (t % win) });
  if (t - WRONG.g.t >= FAIL_GLOBAL_WIN) WRONG.g = { t: t - (t % FAIL_GLOBAL_WIN), n: 0 };
  if (WRONG.callers.size > 5000) for (const [k, v] of WRONG.callers) if (t - v.t >= FAIL_CALLER_WIN) WRONG.callers.delete(k);
  const key = await sha256Hex("lq-tester-ip|" + callerIp(request)); // memory only, never stored
  let c = WRONG.callers.get(key);
  if (!c || t - c.t >= FAIL_CALLER_WIN) { c = { t: t - (t % FAIL_CALLER_WIN), n: 0 }; WRONG.callers.set(key, c); }
  if (c.n >= FAIL_CALLER) return locked(FAIL_CALLER_WIN);
  if (WRONG.g.n >= FAIL_GLOBAL) return locked(FAIL_GLOBAL_WIN);
  c.n++; WRONG.g.n++;
  if (env.DB) { // shared across isolates: one read (day salt) + one write, at most FAIL_CALLER times per caller and window here
    try {
      const r = await hit(env.DB, "tester:f:" + (await callerHash(env, request, "tester")), FAIL_CALLER, FAIL_CALLER_WIN, t);
      if (!r.ok) { c.n = FAIL_CALLER; return locked(FAIL_CALLER_WIN); }
    } catch { /* the in-memory limiter still applies */ }
  }
  log("tester.refused", { gate: "required" });
  return refuse;
}

/** Refusal body of a gated route. @param {{reason?: string}} st */
export const testerBody = st => ({ fallback: true, reason: st.reason || "tester_required", code: st.reason || "tester_required",
  error: st.reason === "tester_locked" ? "too many wrong tester codes; try again later" : "tester access code required" });

/* ---------------- daily request cap + D1 write budget ---------------- */
/** A strictly parsed limit: {set:false} when the var is unset / empty, {set:true, n} for a plain integer 1..max, and
 *  {set:true, invalid:true} for anything else ("abc", "-5", "20,000", "0", "200000"): an invalid limit refuses. */
export function strictLimit(v, max = CAP_MAX) {
  const s = v == null ? "" : String(v).trim();
  if (s === "") return { set: false };
  if (!/^[0-9]{1,6}$/.test(s)) return { set: true, invalid: true };
  const n = Number(s);
  return n >= 1 && n <= max ? { set: true, n } : { set: true, invalid: true };
}

/** per-isolate state: day, requests / writes counted here and not yet written, last known totals of the day, blocked */
const CAP = { day: "", pending: 0, total: -1, wPending: 0, wTotal: 0, blocked: "", alerted: false, told: "" };
/** Tests: forget the isolate state. */
export function resetCapState() { CAP.day = ""; CAP.pending = 0; CAP.total = -1; CAP.wPending = 0; CAP.wTotal = 0; CAP.blocked = ""; CAP.alerted = false; CAP.told = ""; }
/** Both day counters live in ONE row (key "cap:day"): count = requests + writes x W_UNIT, so a flush is one statement. */
export const W_UNIT = 1000000;

/** A meter around a D1 binding: counts read and write statements (INSERT / UPDATE / DELETE / REPLACE = write).
 *  @param {any} db @returns {{db: any, reads: number, writes: number}} */
export function meterDb(db) {
  const m = { db: /** @type {any} */ (null), reads: 0, writes: 0 };
  const note = sql => { if (IS_WRITE.test(String(sql))) m.writes++; else m.reads++; };
  const wrap = (st, sql) => new Proxy(st, {
    get(target, p) {
      if (p === "__sql") return sql;
      if (p === "__raw") return target;
      if (p === "bind") return (...a) => wrap(target.bind(...a), sql);
      const v = target[p];
      if (typeof v !== "function") return v;
      if (p === "first" || p === "run" || p === "all" || p === "raw") return (...a) => { note(sql); return v.apply(target, a); };
      return v.bind(target);
    }
  });
  m.db = {
    prepare: sql => wrap(db.prepare(sql), sql),
    batch: stmts => { for (const s of stmts) note(s.__sql); return db.batch(stmts.map(s => s.__raw || s)); },
    exec: sql => { note(sql); return db.exec(sql); },
    _raw: db._raw,
    _unmetered: db
  };
  return m;
}
const IS_WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

/** Add the write statements a finished request caused to the day's pending count. @param {number} n */
export function noteWrites(n) { if (n > 0) CAP.wPending += n; }

/**
 * Counts one public request against DAILY_REQUEST_CAP and checks D1_WRITE_BUDGET. {ok:true} or {ok:false, code, retryAfter}.
 *
 * Both are APPROXIMATE budgets, not exact caps: each isolate counts in memory and writes its counts to D1 once per
 * CAP_BATCH requests (one upsert of one row), so the stored total lags by up to CAP_BATCH requests per live isolate and an
 * isolate that is recycled before its next flush never reports its last few. They bound LENSIQ's use of the account's
 * shared quotas to roughly the configured figure. Reaching either one also switches the public service OFF until
 * 00:00 UTC (anyone who sends enough requests can do that); the owner is alerted once when it happens.
 * @param {any} env @param {number} [t] unix seconds
 */
export async function countRequest(env, t = now()) {
  const cap = strictLimit(env.DAILY_REQUEST_CAP), budget = strictLimit(env.D1_WRITE_BUDGET);
  if (!cap.set && !budget.set) return { ok: true };
  const day = dayOf(t), retryAfter = 86400 - (t % 86400);
  if (cap.invalid || budget.invalid) { // a limit that cannot be read as a number refuses (never "no limit")
    if (!CAP.alerted) { CAP.alerted = true; log("alert.config_invalid", { ref: cap.invalid ? "DAILY_REQUEST_CAP" : "D1_WRITE_BUDGET" }); }
    return { ok: false, code: "config_invalid", retryAfter: 300 };
  }
  if (CAP.day !== day) { CAP.day = day; CAP.pending = 0; CAP.total = -1; CAP.wPending = 0; CAP.wTotal = 0; CAP.blocked = ""; CAP.told = ""; }
  if (CAP.blocked) return { ok: false, code: CAP.blocked, retryAfter };
  if (!env.DB) return { ok: false, code: "daily_cap", retryAfter: 60 }; // fail closed: a limit is set but nothing can count
  CAP.pending++;
  const capN = cap.set ? cap.n : Infinity, budgetN = budget.set ? budget.n : Infinity;
  if (CAP.total < 0 || CAP.pending >= CAP_BATCH || CAP.total + CAP.pending > capN || CAP.wTotal + CAP.wPending >= budgetN) {
    const n = CAP.pending, w = CAP.wPending + 1; // + this statement itself
    try {
      const row = await (env.DB._unmetered || env.DB).prepare("INSERT INTO rate_limits (key, window_start, count) VALUES ('cap:day', ?1, ?2) " +
        "ON CONFLICT (key, window_start) DO UPDATE SET count = count + ?2 RETURNING count").bind(t - (t % 86400), n + w * W_UNIT).first();
      const c = row ? Number(row.count) : n + w * W_UNIT;
      CAP.total = c % W_UNIT; CAP.wTotal = Math.floor(c / W_UNIT);
      CAP.pending = 0; CAP.wPending = 0;
    } catch {
      CAP.pending -= 1;
      return { ok: false, code: "daily_cap", retryAfter: 60 }; // fail closed
    }
    const hitCode = CAP.total > capN ? "daily_cap" : CAP.wTotal > budgetN ? "d1_budget" : "";
    if (hitCode) {
      CAP.blocked = hitCode;
      log("cap.reached", { code: hitCode });
      // tell the owner once per day and isolate (admin -> Alerts, and the optional webhook); never fails the request
      if (CAP.told !== day) { CAP.told = day; try { await raiseAlert(env, "daily_limit_reached", hitCode, { limit: hitCode === "daily_cap" ? capN : budgetN }); } catch { /* ignore */ } }
      return { ok: false, code: hitCode, retryAfter };
    }
  }
  return { ok: true };
}
/** @param {string} code */
export const capBody = code => ({ fallback: true, reason: code, code,
  error: code === "config_invalid" ? "this deployment's limits are not configured correctly" : "daily limit reached; please try again tomorrow" });

/* ---------------- unauthenticated admin endpoints (login, bootstrap, state) ----------------
 * They are outside the public caps (the owner must always be able to get in) and a failed sign-in writes about 4 rows.
 * With ADMIN_UNAUTH_WRITES_HOUR set (1..5000; per hour and isolate):
 *   - nobody can lock the owner out: there is NO ceiling that refuses sign-ins. A correct sign-in always succeeds;
 *   - D1 writes stay bounded: once the unauthenticated admin requests of this hour have caused that many write statements
 *     in this isolate, login / bootstrap run against a BUFFERING view of the database (bufferDb): reads are real, writes
 *     are held back. A request that fails is answered and its bookkeeping (attempt counters, audit rows) is dropped,
 *     so it writes nothing; a request that succeeds has its writes applied (session, device, audit). While buffering,
 *     the stored attempt counters and the account's "slow down" delay are not applied either (a stranger could use those
 *     to keep the owner out); the throttle then is the in-memory limiter below;
 *   - CPU: every login attempt costs one PBKDF2. ADMIN_CALLER_MAX attempts per caller address and 15 minutes are
 *     processed in an isolate; further ones are refused before any hashing or database access;
 *   - /state answers from memory once the isolate knows the answer and the hour's writes are over the ceiling.
 */
export const ADMIN_CALLER_MAX = 10;
export const ADMIN_CALLER_WIN = 900;
const ADMIN = { t: 0, writes: 0, callers: /** @type {Map<string, {t: number, n: number}>} */ (new Map()), bootstrapped: /** @type {boolean|null} */ (null) };
/** Tests: forget the isolate state. */
export function resetAdminState() { ADMIN.t = 0; ADMIN.writes = 0; ADMIN.callers.clear(); ADMIN.bootstrapped = null; }

/** A view of a D1 binding that holds writes back: reads run at once; write statements return a neutral result and are
 *  queued. flush() applies them in one batch; dropping the object discards them. Rows of admin_users are read with
 *  locked_until = 0 (the account delay is not applied while buffering). @param {any} db */
export function bufferDb(db) {
  /** @type {any[]} */ const queue = [];
  const fake = { first: async () => ({ count: 1, failed_count: 1 }), run: async () => ({ success: true, meta: { changes: 1, last_row_id: 0 } }), all: async () => ({ results: [],
    success: true }) };
  const wrap = (st, sql) => {
    const write = IS_WRITE.test(String(sql)) && !/\bdaily_salts\b/i.test(String(sql)), owner = !write && /\bFROM\s+admin_users\b/i.test(String(sql));
    return {
      __sql: sql, __raw: st,
      bind: (...a) => wrap(st.bind(...a), sql),
      first: async (...a) => {
        if (write) { queue.push(st); return fake.first(); }
        const row = await st.first(...a);
        return owner && row && typeof row === "object" && "locked_until" in row ? { ...row, locked_until: 0 } : row;
      },
      run: async (...a) => (write ? (queue.push(st), fake.run()) : st.run(...a)),
      all: async (...a) => (write ? (queue.push(st), fake.all()) : st.all(...a))
    };
  };
  return {
    db: { prepare: sql => wrap(db.prepare(sql), sql), batch: async stmts => { for (const s of stmts) queue.push(s.__raw || s); return stmts.map(() => fake.run()); }, _raw: db._raw },
    pending: () => queue.length,
    flush: async () => { if (queue.length) await db.batch(queue.splice(0)); }
  };
}

/**
 * Runs one unauthenticated admin action (login / bootstrap) under the rules above. `run(env2)` is the action with the
 * environment to use. Returns its result, or throws what it throws; {busy:true, retryAfter} when this caller is over
 * the in-memory attempt limit. Without ADMIN_UNAUTH_WRITES_HOUR it simply runs the action.
 * @param {any} env @param {Request} request @param {(env2: any) => Promise<any>} run
 */
export async function adminUnauth(env, request, run, t = now()) {
  const lim = strictLimit(env.ADMIN_UNAUTH_WRITES_HOUR, 5000);
  if (!lim.set) return run(env);
  if (t - ADMIN.t >= 3600) { ADMIN.t = t - (t % 3600); ADMIN.writes = 0; }
  // CPU guard: attempts per caller address, in memory, before any hashing or database access
  if (ADMIN.callers.size > 5000) for (const [k, v] of ADMIN.callers) if (t - v.t >= ADMIN_CALLER_WIN) ADMIN.callers.delete(k);
  const key = await sha256Hex("lq-admin-ip|" + callerIp(request));
  let c = ADMIN.callers.get(key);
  if (!c || t - c.t >= ADMIN_CALLER_WIN) { c = { t: t - (t % ADMIN_CALLER_WIN), n: 0 }; ADMIN.callers.set(key, c); }
  if (c.n >= ADMIN_CALLER_MAX) return { busy: true, retryAfter: ADMIN_CALLER_WIN - (t % ADMIN_CALLER_WIN) };
  c.n++;
  const over = lim.invalid || ADMIN.writes >= lim.n; // an invalid setting is treated as "ceiling reached" (no failure writes)
  if (!over) {
    const m = meterDb(env.DB);
    try { return await run({ ...env, DB: m.db }); } finally { ADMIN.writes += m.writes; }
  }
  const b = bufferDb(env.DB);
  const out = await run({ ...env, DB: b.db }); // a failure throws here: its queued writes are dropped
  ADMIN.writes += b.pending();
  await b.flush();                             // success: session / device / audit rows are written
  return out;
}
/** /state: {cached} when the answer is known in this isolate and the hour's writes are over the ceiling, else null. */
export function adminStateCached(env, t = now()) {
  const lim = strictLimit(env.ADMIN_UNAUTH_WRITES_HOUR, 5000);
  if (!lim.set || ADMIN.bootstrapped === null) return null;
  if (t - ADMIN.t >= 3600) return null;
  return lim.invalid || ADMIN.writes >= lim.n ? { bootstrapped: ADMIN.bootstrapped } : null;
}
/** @param {boolean} v */
export function noteBootstrapped(v) { ADMIN.bootstrapped = !!v; }
