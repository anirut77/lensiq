// @ts-check
// backend/src/ai/gateway.js — AI gateway core (round 17 P5; design docs/PRODUCT-CHECK-DESIGN.md §10, docs/AI-GATEWAY.md).
//
//   POST /v1/ai/:feature        aiRoute(): feature on (global + feature) -> body, consent, mode -> Turnstile -> membership
//                               -> per-user / global limits -> feature.build() -> runFeature()
//   GET  /v1/ai/providers       providersInfo(): data for the consent screen (ordered chain, provider, model, processing
//                               location, retention; TH / EN / ZH; no secrets)
//   runFeature()                the shared core (also used by fortune.js for feature fortune_reword):
//                               budget reservation (micro-USD, one SQL statement) -> walk the ordered chain with the
//                               §10.3 policy (fallback.js) -> validate the JSON result against the schema (schema.js)
//                               -> settle the budget to the real cost / refund when not billed -> one log line per attempt
//                               (allowed fields only) -> monthly aggregates for the admin page
// Provider-neutral: nothing here names a provider host or SDK (tools/check-ai-providers.mjs); provider code lives in
// ai/adapters/. All database access goes through ai/db.js.
import { membership, optionalMember } from "../members.js";
import { raiseAlert } from "../billing.js";
import { randomId } from "../crypto.js";
import { periodKey } from "../quota.js";
import { apiKeyStatus, EFFORTS } from "../settings.js";
import { callerHash, hit, hitAll } from "../store.js";
import { verifyTurnstile } from "../turnstile.js";
import { BKK_OFFSET, dayOf, log, now, readJson } from "../util.js";
import { ADAPTERS, PROVIDERS, PROVIDER_IDS, SECRET_NAMES, adaptersWith, keyFor, keyPresence, publicProvider } from "./adapters/index.js";
import { PRICES, costMicros, modelsOf, priceAt } from "./adapters/prices.js";
import { addAggregates, adjustBudget, readMonth, reserveBudget } from "./db.js";
import { POLICY, decide } from "./fallback.js";
import { FEATURES, featuresWith } from "./features.js";
import { assertSupportedSchema, validateJson } from "./schema.js";
import { getGateway, putGateway } from "./settings.js";

export const MAX_BODY_TEXT = 64 * 1024;
export const MAX_BODY_IMAGE = 2 * 1024 * 1024;
export const MAX_IMAGES = 2;
export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];
/** Input tokens assumed per image (a 1000 x 1000 crop is <= 1,300 tokens at every listed provider; §11). */
export const IMAGE_TOKENS = 1600;
export const LAT_BUCKETS = [250, 500, 1000, 2000, 4000, 8000, 15000, 30000, 60000, 120000];
const FEATURE_RE = /^[a-z][a-z0-9_]{1,40}$/;

const utf8Len = s => new TextEncoder().encode(String(s || "")).length;

/** Conservative estimate (micro-USD) reserved before a call: input ~ UTF-8 bytes / 2 + 64 tokens, images, and the FULL
 *  output allowance; the system prompt is priced as a prompt-cache WRITE (the dearest way it can be billed).
 *  @param {any} price @param {any} req */
export function estimateMicros(price, req) {
  if (!price) return 0;
  const sysTok = Math.ceil(utf8Len(req.system) / 2);
  const inTok = sysTok + Math.ceil(utf8Len(req.text) / 2) + 64 + (req.images ? req.images.length * IMAGE_TOKENS : 0);
  const write = (price.cacheWrite ?? 1) > 1 ? sysTok : 0;
  return costMicros(price, { inputTokens: inTok, cacheWriteTokens: write, outputTokens: req.maxOutputTokens });
}

const latBucket = ms => { for (const b of LAT_BUCKETS) if (ms <= b) return String(b); return "inf"; };
const hasUsage = u => !!u && (Number(u.inputTokens) > 0 || Number(u.outputTokens) > 0);

/** Chain entries that may be used: provider allowlisted, adapter implemented, key set and (when given) shown to the user
 *  on the consent screen. The consent screen (providersInfo) uses the same function, so what is shown is what runs. */
async function usableChain(env, gw, fs, adapters, consentProviders) {
  const out = [];
  for (const e of (fs && fs.chain) || []) {
    if (gw.providers[e.provider] === false || !adapters[e.provider]) continue;
    if (consentProviders && !consentProviders.includes(e.provider)) continue;
    const key = await keyFor(env, e.provider, gw);
    if (key) out.push({ entry: e, key });
  }
  return out;
}

/** Whether at least one chain entry of a feature could run (allowlisted, adapter, key). Used by fortune's status. */
export async function chainReady(env, gw, featureId, deps = {}) {
  const fs = gw.features[featureId];
  return (await usableChain(env, gw, fs, adaptersWith(deps.aiAdapters), null)).length > 0;
}

/** Runs `start(signal)` against the attempt deadline; on timeout the signal is aborted (the adapter's request is cancelled)
 *  and the result is {kind: "timeout"}. @param {(signal: AbortSignal) => any} start @param {number} ms */
export function withDeadline(start, ms) {
  const ac = new AbortController();
  let timer;
  const t = new Promise(res => { timer = setTimeout(() => { ac.abort(); res({ ok: false, kind: "timeout" }); }, ms); });
  const p = Promise.resolve().then(() => start(ac.signal)).catch(() => ({ ok: false, kind: "server_error", unexpected: true }));
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

/** Alerts the admin about a configuration error (bad_request / auth / unsupported) at most once per hour per case. */
async function alertConfig(env, feature, provider, kind, fetchImpl) {
  try {
    const r = await hit(env.DB, `ai:alert:${feature}:${provider}:${kind}`, 1, 3600);
    if (r.ok) await raiseAlert(env, "ai_config_error", feature, { provider, kind }, fetchImpl);
  } catch { /* never fails the call */ }
}

/**
 * Runs one feature request through the ordered chain.
 * @param {Env} env
 * @param {string} featureId
 * @param {{system: string, text: string, images?: any[], output: {name: string, schema: object, validate?: object}, maxOutputTokens?: number}} req0
 * @param {{deps?: any, gw?: any, fs?: any, consentProviders?: string[], t?: number, timeoutOverrideMs?: number, overallMs?: number}} [opts]
 */
export async function runFeature(env, featureId, req0, opts = {}) {
  const deps = opts.deps || {};
  const t = opts.t ?? now();
  const month = periodKey("month", t); // budget counter key 'YYYY-MM-01' (Bangkok month)
  const aggMonth = month.slice(0, 7);
  const day = dayOf(t);                // price table day (UTC)
  const gw = opts.gw || (await getGateway(env.DB, { features: deps.aiFeatures }));
  const fs = opts.fs || gw.features[featureId];
  const adapters = adaptersWith(deps.aiAdapters);
  const requestId = randomId(8);
  const attempts = [];
  const schema = req0.output.validate || req0.output.schema;
  assertSupportedSchema(schema); // throws before anything is reserved or called (aiRoute gives the limits back)
  const meta = /** @type {any} */ (featuresWith(deps.aiFeatures)[featureId] || {});
  const req = { ...req0, feature: featureId, requestId, maxOutputTokens: req0.maxOutputTokens || (fs && fs.maxOutputTokens) || 1500 };
  const finish = async (res) => {
    try { await addAggregates(env.DB, aggMonth, featureId, res.ok ? { req: 1, req_ok: 1 } : { req: 1, ["fb:" + res.reason]: 1 }); } catch { /* aggregates are best effort */ }
    return { ...res, attempts, month, requestId, costMicros: attempts.reduce((s, a) => s + a.costMicros, 0) };
  };
  if (!fs) return finish({ ok: false, reason: "disabled" });
  const capMicros = fs.monthlyBudgetUsd == null ? null : Math.round(fs.monthlyBudgetUsd * 1e6);
  const timeoutMs = opts.timeoutOverrideMs || fs.timeoutMs || 30000;
  const sleep = deps.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  const chain = await usableChain(env, gw, fs, adapters, opts.consentProviders);
  if (!chain.length) return finish({ ok: false, reason: "not_configured" });
  // one deadline for the whole request; each attempt gets min(per-attempt timeout, time left)
  const overallMs = opts.overallMs || meta.overallMs || Math.min(120000, timeoutMs * 2 * chain.length);
  const deadline = Date.now() + overallMs;
  const pin = capMicros != null; // with a cap the served model must be the reserved one: no provider-side fallback

  let tried = 0, budgetSkips = 0, last = null;
  /** @type {false|"policy"|"deadline"} */
  let stop = false;
  for (const { entry, key } of chain) {
    const adapter = adapters[entry.provider];
    const price = priceAt(entry.provider, entry.model, day);
    if (capMicros != null && !price) { // a budget is set but this model has no known price: it cannot be reserved
      attempts.push({ provider: entry.provider, model: entry.model, kind: "unsupported", billed: false, costMicros: 0, skipped: "no_price" });
      await alertConfig(env, featureId, entry.provider, "no_price", deps.fetch);
      continue;
    }
    const est = estimateMicros(price, req);
    for (let same = 1; ; same++) {
      const left = deadline - Date.now();
      if (left < Math.min(500, timeoutMs / 4, overallMs / 4)) { last = last || { kind: "timeout", unexpected: false }; stop = "deadline"; break; }
      const attemptMs = Math.min(timeoutMs, left);
      // no cap (fortune_reword migrated with no gateway budget): nothing is reserved, cost still goes to the aggregates
      const rsv = capMicros == null ? { ok: true } : await reserveBudget(env.DB, month, featureId, est, capMicros);
      if (!rsv.ok) { budgetSkips++; break; } // a cheaper model further down the chain may still fit
      tried++;
      const t0 = Date.now();
      const ctx = { key, timeoutMs: attemptMs, loadSdk: deps.loadSdk, fetchImpl: deps.fetch, sdkRetries: meta.sdkRetries ?? 0, pin };
      let r = await withDeadline(signal => adapter.call(req, entry, { ...ctx, signal }), attemptMs);
      const latencyMs = Date.now() - t0;
      if (!r || typeof r !== "object") r = { ok: false, kind: "server_error", unexpected: true };
      if (r.ok) {
        const errs = validateJson(schema, r.json);
        if (errs.length) r = { ok: false, kind: "schema_mismatch", usage: r.usage, model: r.model, providerRequestId: r.providerRequestId };
      }
      const kind = r.ok ? "ok" : typeof r.kind === "string" && Object.hasOwn(POLICY, r.kind) ? r.kind : "server_error";
      const d = r.ok ? null : decide(kind, { sameAttempts: meta.gatewayRetries === false ? 2 : same, retryAfterMs: r.retryAfterMs, timeLeftMs: deadline - Date.now() });
      const billed = r.ok ? true : d.billed;
      const servedPrice = (r.model && priceAt(entry.provider, r.model, day)) || price;
      const cost = billed ? (hasUsage(r.usage) ? costMicros(servedPrice, r.usage) : est) : 0;
      if (capMicros != null) {
        // the budget counter never moves past the reservation (so never past the cap); a higher real cost is an alert
        const charged = Math.min(cost, Math.ceil(est));
        await adjustBudget(env.DB, month, featureId, charged - Math.ceil(est));
        if (cost > Math.ceil(est)) await alertConfig(env, featureId, entry.provider, "cost_over_reservation", deps.fetch);
      }
      const u = r.usage || {};
      attempts.push({ provider: entry.provider, model: entry.model, kind, billed, costMicros: cost, latencyMs });
      log("ai.attempt", {
        feature: featureId, provider: entry.provider, model: entry.model, served_model: r.model || undefined,
        region: typeof adapter.region === "function" ? adapter.region(entry.model) : undefined, attempt: attempts.length, kind, billed,
        in_tok: u.inputTokens, out_tok: u.outputTokens, reasoning_tok: u.reasoningTokens, cached_tok: u.cachedInputTokens, image_tok: u.imageTokens,
        cost_micros: cost, latency_ms: latencyMs, request_id: requestId, provider_request_id: r.providerRequestId
      });
      try {
        await addAggregates(env.DB, aggMonth, featureId, {
          calls: 1, cost, in_tok: Number(u.inputTokens) || 0, out_tok: (Number(u.outputTokens) || 0) + (Number(u.reasoningTokens) || 0),
          ["k:" + kind]: 1, ["lat:" + latBucket(latencyMs)]: 1, ["prov:" + entry.provider]: 1
        });
      } catch { /* best effort */ }
      if (r.ok) {
        const region = typeof adapter.region === "function" ? adapter.region(entry.model) : null;
        return finish({ ok: true, json: r.json, provider: entry.provider, model: entry.model, servedModel: r.model || entry.model, region });
      }
      last = { kind, unexpected: !!r.unexpected, httpStatus: r.httpStatus };
      if (d.alert) await alertConfig(env, featureId, entry.provider, kind, deps.fetch);
      if (d.retry) { if (d.waitMs) await sleep(d.waitMs); continue; }
      if (!d.next) stop = "policy";
      break;
    }
    if (stop) break;
  }
  const reason = stop === "policy" ? "content_policy" : stop === "deadline" && tried === 0 ? "provider_error" : tried === 0 && budgetSkips > 0 ? "budget" : tried === 0 ? "not_configured"
    : last && (last.kind === "invalid_json" || last.kind === "schema_mismatch") ? "invalid_output" : "provider_error";
  return finish({ ok: false, reason, last });
}

// ---- public route --------------------------------------------------------------------------------------------------

const FB_STATUS = { budget: 429, limit: 429, not_configured: 503, disabled: 503, content_policy: 422, invalid_output: 502, provider_error: 502 };
const FB_TEXT = {
  unavailable: "AI feature not available", disabled: "AI is switched off", consent_required: "consent required before anything is sent",
  image_not_allowed: "image mode is not allowed for this feature", bad_request: "invalid request", bad_input: "invalid input",
  turnstile: "bot check failed", member_required: "sign in to use AI", limit: "AI limit reached", budget: "AI checks are paused for this month",
  not_configured: "AI is not configured", content_policy: "the provider refused this input", invalid_output: "the AI answer was not valid",
  provider_error: "the AI service is unavailable"
};
const fb = (reason, status, extra = {}) => [{ fallback: true, reason, error: FB_TEXT[reason] || reason, ...extra }, status];

/** @param {any} images */
function cleanImages(images) {
  if (!Array.isArray(images) || !images.length || images.length > MAX_IMAGES) return null;
  const out = [];
  for (const i of images) {
    if (!i || typeof i !== "object" || !IMAGE_MIMES.includes(i.mime) || typeof i.base64 !== "string" || !/^[A-Za-z0-9+/=]{4,}$/.test(i.base64)) return null;
    if (!Number.isInteger(i.width) || !Number.isInteger(i.height) || i.width < 1 || i.height < 1 || i.width > 1024 || i.height > 1024) return null;
    out.push({ mime: i.mime, base64: i.base64, width: i.width, height: i.height });
  }
  return out;
}

/**
 * POST /v1/ai/:feature (Origin is checked by the router). Returns [body, status]; every refusal carries fallback:true and
 * a reason so the page keeps its on-device result.
 * @param {Env} env @param {Request} request @param {string} featureId @param {any} [deps]
 */
export async function aiRoute(env, request, featureId, deps = {}) {
  const reg = featuresWith(deps.aiFeatures);
  const meta = FEATURE_RE.test(featureId) ? reg[featureId] : null;
  if (!meta || meta.legacy || typeof meta.build !== "function") return fb("unavailable", 404);
  const gw = await getGateway(env.DB, { features: deps.aiFeatures });
  const fs = gw.features[featureId];
  if (!gw.enabled || !fs || !fs.enabled) return fb("disabled", 503);
  let body;
  try { body = await readJson(request, fs.imageModeAllowed ? MAX_BODY_IMAGE : MAX_BODY_TEXT); } catch (e) { return fb("bad_request", e.status || 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fb("bad_request", 400);
  const providers = body.providers;
  if (body.consent !== true || !Array.isArray(providers) || !providers.length || providers.length > 8 || !providers.every(p => PROVIDER_IDS.includes(p))) return fb("consent_required", 400);
  const mode = body.mode == null ? "text" : body.mode;
  if (mode !== "text" && mode !== "image") return fb("bad_request", 400);
  if (mode === "image" && !fs.imageModeAllowed) return fb("image_not_allowed", 400);
  const input = body.input && typeof body.input === "object" && !Array.isArray(body.input) ? { ...body.input } : null;
  if (!input) return fb("bad_input", 400);
  if (mode === "image") { const imgs = cleanImages(input.images); if (!imgs) return fb("bad_input", 400); input.images = imgs; }
  else delete input.images; // text mode: an image is never sent

  const ts = await verifyTurnstile(env, request, "ai", deps.fetch);
  if (!ts.ok) return fb("turnstile", ts.code === "turnstile_not_configured" ? 503 : 403, { code: ts.code });
  const ms = await membership(env);
  const member = await optionalMember(env, request);
  if (ms.required && !member) return fb("member_required", 401);

  const who = member ? "u:" + member.user.id : await callerHash(env, request, "ai");
  const DAY = { win: 86400, offset: BKK_OFFSET, daily: true };
  const specs = [
    { key: `ai:${featureId}:m:${who}`, limit: fs.perUserPerMinute, win: 60 },
    { key: `ai:${featureId}:d:${who}`, limit: fs.perUserDaily, ...DAY },
    { key: `ai:${featureId}:g`, limit: fs.globalPerMinute, win: 60 }
  ];
  const lim = await hitAll(env.DB, specs);
  if (!lim.ok) return fb("limit", 429);

  let nreq;
  try {
    nreq = meta.build(input, { mode });
    if (!nreq || typeof nreq.system !== "string" || typeof nreq.text !== "string" || !nreq.output || !nreq.output.schema) throw new Error("bad build");
  } catch { await lim.release(x => !!x.daily); return fb("bad_input", 400); }
  if (mode !== "image") delete nreq.images;
  let run;
  try {
    run = await runFeature(env, featureId, { ...nreq, maxOutputTokens: fs.maxOutputTokens }, { deps, gw, fs, consentProviders: providers });
  } catch (e) { // configuration error (e.g. an unsupported schema keyword): nothing ran, every limit bucket is given back
    await lim.release();
    log("ai.config_error", { feature: featureId, name: String((e && e.name) || "Error").slice(0, 40) });
    return fb("not_configured", 503);
  }
  if (!run.ok) {
    if (!run.attempts.some(a => a.billed)) await lim.release(x => !!x.daily); // nothing was produced: the day's use is given back
    return fb(run.reason, FB_STATUS[run.reason] || 502);
  }
  const pp = publicProvider(run.provider);
  return [{ ok: true, json: run.json, provider: run.provider, model: run.servedModel, region: run.region, providerName: pp && pp.name, regionText: pp && pp.region }, 200];
}

/** GET /v1/ai/providers?feature=… — consent-screen data. null = unknown feature. @param {Env} env @param {string} featureId @param {any} [deps] */
export async function providersInfo(env, featureId, deps = {}) {
  const reg = featuresWith(deps.aiFeatures);
  if (!FEATURE_RE.test(String(featureId || "")) || !reg[featureId]) return null;
  const gw = await getGateway(env.DB, { features: deps.aiFeatures });
  const fs = gw.features[featureId];
  const chain = await usableChain(env, gw, fs, adaptersWith(deps.aiAdapters), null);
  return {
    feature: featureId,
    enabled: !!((gw.enabled || reg[featureId].legacy) && fs.enabled && chain.length),
    imageModeAllowed: !!fs.imageModeAllowed,
    stores: false,
    chain: chain.map(({ entry }) => ({ provider: entry.provider, model: entry.model, ...publicProvider(entry.provider) }))
  };
}

// ---- admin ---------------------------------------------------------------------------------------------------------

/** GET /admin/api/ai/gateway — settings, provider table with key presence (never values), features, prices. */
export async function adminGateway(env) {
  const keys = keyPresence(env);
  return {
    settings: await getGateway(env.DB),
    providers: PROVIDER_IDS.map(id => ({
      id, name: PROVIDERS[id].name, region: PROVIDERS[id].region, retention: PROVIDERS[id].retention,
      secret_name: SECRET_NAMES[id], key_set: keys[id], implemented: !!ADAPTERS[id], models: modelsOf(id)
    })),
    legacy_key: await apiKeyStatus(env),
    features: Object.values(FEATURES).map(f => ({ id: f.id, status: f.status, legacy: !!f.legacy, imageCapable: !!f.imageCapable, label: f.label })),
    prices: PRICES,
    efforts: EFFORTS
  };
}

/** PUT /admin/api/ai/gateway (re-auth + audit in the router). */
export async function adminPutGateway(env, input) {
  return { settings: await putGateway(env.DB, input) };
}

/** Bucket upper bound (ms) at quantile q of a latency histogram. @param {Record<string, number>} a */
function quantile(a, q) {
  const total = LAT_BUCKETS.concat([Infinity]).reduce((s, b) => s + (a["lat:" + (b === Infinity ? "inf" : b)] || 0), 0);
  if (!total) return null;
  let acc = 0;
  for (const b of LAT_BUCKETS.concat([Infinity])) {
    acc += a["lat:" + (b === Infinity ? "inf" : b)] || 0;
    if (acc >= q * total) return b === Infinity ? null : b;
  }
  return null;
}

/** GET /admin/api/ai/usage?month=YYYY-MM — monthly aggregates per feature. */
export async function adminUsage(env, q = {}) {
  const month = /^\d{4}-\d{2}$/.test(String(q.month || "")) ? String(q.month) : periodKey("month").slice(0, 7);
  const { agg, budget } = await readMonth(env.DB, month);
  const gw = await getGateway(env.DB);
  const ids = [...new Set([...Object.keys(FEATURES), ...Object.keys(agg)])];
  const features = ids.map(id => {
    const a = agg[id] || {};
    const pick = prefix => Object.fromEntries(Object.entries(a).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));
    const fbs = pick("fb:");
    const fs = gw.features[id];
    return {
      feature: id, requests: a.req || 0, ok: a.req_ok || 0, fallbacks: Object.values(fbs).reduce((s, v) => s + v, 0), fallback_reasons: fbs,
      calls: a.calls || 0, cost_usd: (a.cost || 0) / 1e6, budget_used_usd: (budget[id] || 0) / 1e6, budget_usd: fs ? fs.monthlyBudgetUsd : null,
      in_tok: a.in_tok || 0, out_tok: a.out_tok || 0, kinds: pick("k:"), providers: pick("prov:"), p50_ms: quantile(a, 0.5), p95_ms: quantile(a, 0.95)
    };
  });
  return { month, features, last_eval: gw.last_eval };
}
