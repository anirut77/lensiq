#!/usr/bin/env node
// tools/backend-smoke.mjs — `npm run backend:smoke -- --base https://lensiq-api-test.<sub>.workers.dev`
// Read-only smoke check of the deployed test Worker. It changes nothing, sends NO personal data, NO label text, NO image,
// NO tester code and NO secret, and prints only status codes and switch states. Run by hand after a deploy; never in CI
// against a live Worker.
//
//   --base <url>      the Worker origin (only https://lensiq-api-test.<sub>.workers.dev or a localhost wrangler dev)
//   --origin <url>    the site origin to test CORS with (default https://anirut77.github.io)
//   --expect off      expect the kill switch to be ON (every public route 503); default: expect the service to answer
//   --json            print the result list as JSON
// Checks: /health · CORS for the Pages origin and refusal of a foreign origin · the preflight allows X-Tester-Code ·
// every Product Check AI feature answers "tester code required" / "disabled" without a code · analytics, demo requests,
// billing, sign-in, fortune AI and CSP reports are not enabled (404 route_off) ·
// the testing-only lookup sources are closed to a visitor while an open-licence source is on · kill switch state.
import { pathToFileURL } from "node:url";
import { ALLOWED } from "./lib/cf-guard.mjs";

export const AI_FEATURES = ["pc_fields", "pc_translate", "pc_claims"];
export const TESTING_ONLY = ["thfda", "safetygate", "rasff"];
const UA = "Mozilla/5.0 (compatible; lensiq-smoke/1.0)"; // workers.dev runs Browser Integrity Check: library user agents can be refused (error 1010)

/** The base must be LENSIQ's own test Worker or a local wrangler dev. */
export function checkBase(base) {
  let u;
  try { u = new URL(String(base)); } catch { return null; }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) && /^https?:$/.test(u.protocol);
  const own = u.protocol === "https:" && new RegExp(`^${ALLOWED.worker}\\.[a-z0-9-]+\\.workers\\.dev$`).test(u.hostname);
  return (local || own) && !u.username && !u.password ? { origin: u.origin, local } : null;
}

/**
 * @param {string} base Worker origin @param {{origin?: string, expectOff?: boolean, fetch?: typeof fetch}} [o]
 * @returns {Promise<{ok: boolean, off: boolean, results: {name: string, ok: boolean, got: string}[]}>}
 */
export async function smoke(base, o = {}) {
  const f = o.fetch || fetch, site = o.origin || "https://anirut77.github.io";
  /** @type {{name: string, ok: boolean, got: string}[]} */ const results = [];
  const add = (name, ok, got) => results.push({ name, ok: !!ok, got: String(got).slice(0, 160) });
  const get = async (path, init = {}) => {
    try {
      const r = await f(base + path, { redirect: "manual", ...init, headers: { "User-Agent": UA, ...(init.headers || {}) } });
      let j = null;
      try { j = await r.json(); } catch { /* not JSON */ }
      return { status: r.status, j, h: r.headers };
    } catch (e) { return { status: 0, j: null, h: new Headers(), err: String((e && e.name) || "error") }; }
  };
  const O = { Origin: site };

  const h = await get("/health");
  add("GET /health answers ok", h.status === 200 && h.j && h.j.ok === true, `${h.status} ${JSON.stringify(h.j)}`);
  const off = !!(h.j && h.j.off === true);
  add(`kill switch is ${o.expectOff ? "ON (service off)" : "OFF (service answering)"}`, off === !!o.expectOff, off ? "SERVICE_OFF is set" : "SERVICE_OFF is not set");

  const pre = await get("/v1/ai/pc_fields", { method: "OPTIONS", headers: { ...O, "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type,x-tester-code,x-turnstile-token" } });
  add("preflight from the site origin: 204, allows X-Tester-Code", pre.status === 204 && pre.h.get("Access-Control-Allow-Origin") === site &&
    /x-tester-code/i.test(pre.h.get("Access-Control-Allow-Headers") || ""),
    `${pre.status} allow-origin ${pre.h.get("Access-Control-Allow-Origin")}`);
  const evil = await get("/v1/ai/pc_fields", { method: "OPTIONS", headers: { Origin: "https://not-lensiq.example", "Access-Control-Request-Method": "POST" } });
  add("preflight from a foreign origin is refused", evil.status === 403 && !evil.h.get("Access-Control-Allow-Origin"), `${evil.status}`);

  const st = await get("/api/pc/status", { headers: O });
  if (off) {
    add("lookups refuse while off (503 off:true) and the site can read the answer", st.status === 503 && st.j && st.j.off === true && st.h.get("Access-Control-Allow-Origin") === site,
      `${st.status} ${JSON.stringify(st.j)}`);
    for (const id of AI_FEATURES) {
      const r = await get("/v1/ai/providers?feature=" + id, { headers: O });
      add(`AI ${id} refuses while off`, r.status === 503 && r.j && r.j.off === true, `${r.status}`);
    }
    return { ok: results.every(r => r.ok), off, results };
  }
  add("GET /api/pc/status from the site origin: 200 + CORS", st.status === 200 && st.h.get("Access-Control-Allow-Origin") === site,
    `${st.status} allow-origin ${st.h.get("Access-Control-Allow-Origin")}`);
  const foreign = await get("/api/pc/status", { headers: { Origin: "https://not-lensiq.example" } });
  add("lookups refuse a foreign origin", foreign.status === 403, `${foreign.status}`);
  const src = (st.j && st.j.sources) || {};
  add("tester gate is on for lookups", st.j && st.j.tester_gate === true, `tester_gate ${st.j && st.j.tester_gate}`);
  for (const k of TESTING_ONLY) add(`testing-only source ${k} is closed to a visitor`, src[k] && src[k].on === false, src[k] ? `on ${src[k].on} (${src[k].off_reason})` : "missing");
  add("open-licence source openfda is on", src.openfda && src.openfda.on === true, src.openfda ? `on ${src.openfda.on}` : "missing");

  for (const id of AI_FEATURES) {
    const p = await get("/v1/ai/providers?feature=" + id, { headers: O });
    add(`AI ${id}: consent data closed without a tester code`, p.status === 200 && p.j && p.j.enabled === false && Array.isArray(p.j.chain) && p.j.chain.length === 0,
      `${p.status} enabled ${p.j && p.j.enabled} tester ${p.j && p.j.tester}`);
    // an EMPTY request: refused by the gate before anything is read, counted or sent
    const r = await get("/v1/ai/" + id, { method: "POST", headers: { ...O, "Content-Type": "application/json" }, body: "{}" });
    const reason = r.j && r.j.reason;
    add(`AI ${id}: POST without a code answers "tester code required" (or "disabled")`, (r.status === 403 && reason === "tester_required") || (r.status === 503 && reason === "disabled"),
      `${r.status} ${reason}`);
  }
  // routes that are NOT part of this deployment answer 404 "route_off" (and never touch the database): empty requests only
  for (const [method, path] of [["POST", "/v1/events"], ["POST", "/v1/leads"], ["GET", "/v1/billing/plans"], ["POST", "/api/auth/nonce"], ["GET", "/api/fortune/status"], ["POST",
    "/v1/csp-report"]]) {
    const r = await get(path, { method, headers: method === "POST" ? { ...O, "Content-Type": "application/json" } : O, ...(method === "POST" ? { body: "{}" } : {}) });
    add(`${method} ${path} is not enabled in this deployment`, r.status === 404 && r.j && r.j.code === "route_off", `${r.status} ${r.j && r.j.code}`);
  }
  const cfg = await get("/v1/config", { headers: O });
  add("config: analytics off, sign-in off, billing off, free mode", cfg.status === 200 && cfg.j && cfg.j.analytics === false && cfg.j.free_mode === true && cfg.j.pricing_enabled === false &&
    cfg.j.billing_enabled === false && cfg.j.membership && cfg.j.membership.google_client_id == null, `${cfg.status} ${JSON.stringify(cfg.j).slice(0, 110)}`);
  return { ok: results.every(r => r.ok), off, results };
}

/** @param {string[]} argv @param {{print?: (s: string) => void, env?: any, fetch?: typeof fetch}} [io] */
export async function main(argv, io = {}) {
  const print = io.print || (s => console.log(s));
  const env = io.env || process.env;
  const arg = k => (argv.includes(k) ? String(argv[argv.indexOf(k) + 1] || "") : "");
  const b = checkBase(arg("--base"));
  if (!b) { print(`usage: npm run backend:smoke -- --base https://${ALLOWED.worker}.<subdomain>.workers.dev [--origin https://anirut77.github.io] [--expect off]`); return 2; }
  if (!b.local && (env.CI || env.GITHUB_ACTIONS)) { print("REFUSED: the live smoke check never runs in CI."); return 3; }
  print(`LENSIQ smoke check (read-only) · TARGET ${b.origin}`);
  const r = await smoke(b.origin, { origin: arg("--origin") || undefined, expectOff: arg("--expect") === "off", fetch: io.fetch });
  if (argv.includes("--json")) print(JSON.stringify(r, null, 2));
  else for (const x of r.results) print(`${x.ok ? "PASS" : "FAIL"}  ${x.name}  [${x.got}]`);
  print(r.ok ? `smoke: OK (${r.results.length} checks)` : `smoke: FAILED (${r.results.filter(x => !x.ok).length} of ${r.results.length})`);
  return r.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) main(process.argv.slice(2)).then(c => process.exit(c));
