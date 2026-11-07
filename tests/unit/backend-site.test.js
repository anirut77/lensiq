"use strict";
// tests/unit/backend-site.test.js — front-end integration of the API Worker: backend/ and Worker secrets are never
// published; CSP connect-src gets the API origin only when LENSIQ_API_BASE is configured; lensiq-api.js is inert
// offline; lensiq-analytics.js sends nothing without opt-in / with Do-Not-Track and only allowlisted fields;
// no secrets committed under backend/.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync, statSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");

test("build-site: backend/, wrangler config, .dev.vars and migrations are forbidden; admin/pricing shells allowed", async () => {
  const { forbiddenReason, ALLOW } = await import(join(ROOT, "tools", "build-site.mjs"));
  for (const f of ["backend/src/index.js", "backend/wrangler.toml", "backend/.dev.vars", "backend/migrations/0001_init.sql", "wrangler.toml", ".dev.vars", "migrations/0001_init.sql", "backend/package.json"]) {
    assert.ok(forbiddenReason(f), f + " must be forbidden");
  }
  for (const f of ["admin.html", "admin.js", "admin.css", "pricing.html", "pricing.js", "lensiq-api.js", "lensiq-analytics.js", "lensiq-fortune-hook.js"]) {
    assert.equal(forbiddenReason(f), null, f);
    assert.ok(ALLOW.some(re => re.test(f)), f + " is published");
  }
  assert.ok(!ALLOW.some(re => re.test("backend/src/index.js")), "backend is not even in the allowlist");
});

test("csp-meta: API origin added to connect-src only when LENSIQ_API_BASE is configured", async () => {
  const { configuredApiOrigin, policy } = await import(join(ROOT, "tools", "csp-meta.mjs"));
  const repoCfg = readFileSync(join(ROOT, "lensiq-config.js"), "utf8");
  assert.equal(configuredApiOrigin(repoCfg), null, "default config is empty (the example in the comment is ignored)");
  assert.equal(configuredApiOrigin('window.LENSIQ_API_BASE = window.LENSIQ_API_BASE || "https://api.lensiq.example/";'), "https://api.lensiq.example");
  assert.equal(configuredApiOrigin('window.LENSIQ_API_BASE = "https://x.workers.dev";'), "https://x.workers.dev");
  assert.equal(configuredApiOrigin('window.LENSIQ_API_BASE = "javascript:alert(1)";'), null);
  assert.equal(configuredApiOrigin('window.LENSIQ_API_BASE = "https://u:p@x.dev";'), null);
  assert.match(policy(), /connect-src 'self' data: blob:;/);
  assert.match(policy({ connect: ["https://api.lensiq.example"] }), /connect-src 'self' data: blob: https:\/\/api\.lensiq\.example;/);
  for (const p of ["admin.html", "pricing.html", "index.html"]) {
    const html = readFileSync(join(ROOT, p), "utf8");
    assert.match(html, /connect-src 'self' data: blob:;/, p + " has no extra origin while unconfigured");
  }
});

test("admin.html / pricing.html: noindex, not linked from public pages or the menu", () => {
  for (const p of ["admin.html", "pricing.html"]) assert.match(readFileSync(join(ROOT, p), "utf8"), /<meta name="robots" content="noindex/);
  const pages = readdirSync(ROOT).filter(f => f.endsWith(".html") && !["admin.html", "pricing.html"].includes(f));
  for (const p of pages) assert.ok(!/href="(\.\/)?admin\.html/.test(readFileSync(join(ROOT, p), "utf8")), p + " links admin.html");
  assert.ok(!/admin\.html/.test(readFileSync(join(ROOT, "nav.js"), "utf8")));
});

test("no secrets committed under backend/ (only placeholders)", () => {
  const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); if (f === "node_modules" || f === ".wrangler") return []; return statSync(p).isDirectory() ? walk(p) : [p]; });
  const files = walk(join(ROOT, "backend"));
  assert.ok(!files.some(f => /[/\\]\.dev\.vars$/.test(f)), ".dev.vars must not exist in the tree");
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    assert.ok(!/sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}/.test(s), f + ": Anthropic key");
    assert.ok(!/skey_(test_)?[0-9a-z]{19,}/.test(s), f + ": Opn secret key");
    assert.ok(!/pkey_(test_)?[0-9a-z]{19,}/.test(s), f + ": Opn public key");
  }
  const toml = readFileSync(join(ROOT, "backend", "wrangler.toml"), "utf8");
  assert.match(toml, /FREE_MODE = "true"/);
  assert.match(toml, /BILLING_ENABLED = "false"/);
  assert.match(toml, /binding = "DB"/);
  assert.match(toml, /crons = \["17 3 \* \* \*", "\*\/15 \* \* \* \*"\]/, "daily maintenance + 15-min payment reconcile");
  assert.match(toml, /binding = "ASSETS"/, "admin shell served by the Worker");
  assert.ok(!/^\s*(ANTHROPIC_API_KEY|OPN_SECRET_KEY|SECRETS_KEK|ADMIN_BOOTSTRAP_TOKEN)\s*=/m.test(toml), "secrets never in [vars]");
});

/** Runs a browser script in a fake window. */
function browser({ base = "", dnt = false, consent = null, width = 400, path = "/lensiq/palm.html" } = {}) {
  const store = new Map(), sess = new Map();
  if (consent) store.set("lq-analytics", JSON.stringify({ v: 1, choice: consent, at: "2026-01-01" }));
  const mkStorage = m => ({ getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) });
  const beacons = [], fetches = [], listeners = {};
  const body = { children: [], appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, removeChild(c) { this.children = this.children.filter(x => x !== c); } };
  const el = () => ({ style: {}, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); return c; }, addEventListener() {} });
  const document = { readyState: "complete", documentElement: { lang: "th" }, body, createElement: el, addEventListener: (t, f) => ((listeners["doc:" + t] ||= []).push(f)), visibilityState: "visible" };
  const win = {
    LENSIQ_API_BASE: base, document, innerWidth: width, location: { pathname: path, search: "" },
    navigator: { doNotTrack: dnt ? "1" : null, sendBeacon: (url, blob) => { beacons.push({ url, blob }); return true; } },
    localStorage: mkStorage(store), sessionStorage: mkStorage(sess),
    crypto: { getRandomValues: a => { for (let i = 0; i < a.length; i++) a[i] = i * 17 & 255; return a; } },
    addEventListener: (t, f) => ((listeners[t] ||= []).push(f)),
    setTimeout: () => 0, clearTimeout: () => {}, Blob: class { constructor(parts, o) { this.text = parts.join(""); this.type = o.type; } },
    fetch: (url, init) => { fetches.push({ url, init }); return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of ["lensiq-api.js", "lensiq-analytics.js"]) vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  const fire = t => (listeners[t] || []).forEach(f => f({}));
  return { win, beacons, fetches, body, fire, store };
}

test("lensiq-api.js: inert when LENSIQ_API_BASE is empty", async () => {
  const b = browser({ base: "" });
  assert.equal(b.win.LQApi.enabled(), false);
  assert.equal(await b.win.LQApi.getJSON("/v1/config"), null);
  assert.equal(b.win.LQApi.beacon("/v1/events", {}), false);
  assert.equal(b.fetches.length, 0);
  assert.equal(browser({ base: "javascript:alert(1)" }).win.LQApi.enabled(), false);
});

test("lensiq-analytics.js: no banner and nothing sent offline, with DNT, or before consent", () => {
  for (const opts of [{ base: "" }, { base: "https://api.x.dev", dnt: true, consent: "yes" }, { base: "https://api.x.dev", consent: "no" }]) {
    const b = browser(opts);
    b.win.LQAnalytics.feature("palm", "start");
    b.fire("pagehide");
    assert.equal(b.beacons.length + b.fetches.length, 0, JSON.stringify(opts));
    assert.equal(b.body.children.length, 0, "no banner");
  }
  const undecided = browser({ base: "https://api.x.dev" });
  assert.equal(undecided.body.children.length, 1, "opt-in banner shown");
  undecided.fire("pagehide");
  assert.equal(undecided.beacons.length, 0, "nothing sent while undecided");
});

test("lensiq-analytics.js: after opt-in sends only allowlisted coarse fields via text/plain beacon", () => {
  const b = browser({ base: "https://api.x.dev", consent: "yes", width: 400 });
  b.win.LQAnalytics.track("feature_used", { feature: "palm", step: "start", email: "a@b.co", text: "free text", page: "Not A Slug!" });
  b.win.LQAnalytics.error(new TypeError("secret message about Somchai"));
  b.fire("pagehide");
  assert.equal(b.beacons.length, 1);
  assert.equal(b.beacons[0].url, "https://api.x.dev/v1/events");
  assert.match(b.beacons[0].blob.type, /^text\/plain/);
  const payload = JSON.parse(b.beacons[0].blob.text);
  assert.equal(payload.consent, true);
  const raw = b.beacons[0].blob.text;
  for (const bad of ["a@b.co", "free text", "Somchai", "secret message", "Not A Slug"]) assert.ok(!raw.includes(bad), bad);
  const names = payload.events.map(e => e.n);
  assert.deepEqual(names, ["page_view", "feature_used", "error", "session_end"]);
  assert.equal(payload.events[0].page, "palm");
  assert.equal(payload.events[0].ret, "new");
  assert.equal(payload.events[2].err, "TypeError");
  assert.equal(payload.events[1].device, "mobile");
  const allowed = new Set(["n", "sid", "page", "feature", "domain", "step", "err", "lang", "device", "dur", "ret"]);
  for (const e of payload.events) for (const k of Object.keys(e)) assert.ok(allowed.has(k), k);
});

test("client and Worker carry the same page / feature / error allowlists; client sends unlisted values as 'other'", async () => {
  const C = await import(join(ROOT, "backend", "src", "constants.js"));
  const src = readFileSync(join(ROOT, "lensiq-analytics.js"), "utf8");
  const m = /var ALLOW = \{\s*page: (\[[^\]]*\]),\s*feature: (\[[^\]]*\]),\s*err: (\[[^\]]*\])/.exec(src);
  assert.ok(m, "ALLOW block in lensiq-analytics.js");
  assert.deepEqual(JSON.parse(m[1]), C.ANALYTICS_PAGES);
  assert.deepEqual(JSON.parse(m[2]), C.ANALYTICS_FEATURES);
  assert.deepEqual(JSON.parse(m[3]), C.ANALYTICS_ERRORS);
  const b = browser({ base: "https://api.x.dev", consent: "yes", path: "/lensiq/unknownpage.html" });
  b.win.LQAnalytics.feature("somchai-jaidee", "start");
  b.win.LQAnalytics.error({ name: "SomchaiError" });
  b.fire("pagehide");
  const p = JSON.parse(b.beacons[0].blob.text);
  assert.equal(p.events[0].page, "other");
  assert.equal(p.events[1].feature, "other");
  assert.equal(p.events[2].err, "other");
  for (const e of p.events) assert.ok(!/\d{6,}/.test(e.sid), "client sid has no 6+ digit run");
});

test("client and Worker agree on the allowed event fields", async () => {
  const { FIELDS, EVENT_NAMES } = await import(join(ROOT, "backend", "src", "analytics.js"));
  const src = readFileSync(join(ROOT, "lensiq-analytics.js"), "utf8");
  for (const k of Object.keys(FIELDS)) if (!["n", "sid"].includes(k)) assert.match(src, new RegExp("\\b" + k + ": /"), k);
  for (const n of EVENT_NAMES) assert.ok(src.includes(n), n);
});

test("csp-meta: Turnstile origin only when LENSIQ_TURNSTILE_SITEKEY is configured", async () => {
  const { configuredTurnstile, policy, TURNSTILE_ORIGIN } = await import(join(ROOT, "tools", "csp-meta.mjs"));
  assert.equal(configuredTurnstile(readFileSync(join(ROOT, "lensiq-config.js"), "utf8")), false, "off by default");
  assert.equal(configuredTurnstile('window.LENSIQ_TURNSTILE_SITEKEY = window.LENSIQ_TURNSTILE_SITEKEY || "0x4AAAAAAAabcdef";'), true);
  const p = policy({ turnstile: true });
  assert.match(p, new RegExp("script-src 'self' 'wasm-unsafe-eval' " + TURNSTILE_ORIGIN.replace(/\./g, "\\.")));
  assert.match(p, /frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.ok(!/challenges/.test(policy()), "default policy has no third-party origin");
});

test("lensiq-fortune-hook.js: adds X-Turnstile-Token only to the POST /api/fortune request", async () => {
  const seen = [];
  const listeners = {};
  const body = { appendChild() {} };
  const win = {
    LENSIQ_API_BASE: "https://api.x.dev", LENSIQ_TURNSTILE_SITEKEY: "0x4AAAAAAAabcdef", Headers, Promise, Object, String, setTimeout,
    document: { readyState: "complete", head: { appendChild() {} }, body, createElement: () => ({ style: {}, setAttribute() {} }), addEventListener: (t, f) => { listeners[t] = f; } },
    clearTimeout,
    fetch: (input, init) => { seen.push({ input, init }); return Promise.resolve({ ok: true }); },
    turnstile: { render: (el, o) => { win._cb = o.callback; return "w1"; }, reset() {}, execute: () => setTimeout(() => win._cb("tok-123"), 0) }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(readFileSync(join(ROOT, "lensiq-api.js"), "utf8"), ctx); // LQApi.turnstile provides the token
  vm.runInContext(readFileSync(join(ROOT, "lensiq-fortune-hook.js"), "utf8"), ctx);
  await win.fetch("https://api.x.dev/api/fortune", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  await win.fetch("https://api.x.dev/api/fortune/status");
  await win.fetch("https://other.example/api/fortune", { method: "POST" });
  assert.equal(seen[0].init.headers.get("X-Turnstile-Token"), "tok-123");
  assert.equal(seen[0].init.headers.get("Content-Type"), "application/json");
  assert.equal(seen[1].init, undefined, "status request untouched");
  assert.ok(!seen[2].init.headers || !(seen[2].init.headers instanceof Headers), "other origins untouched");
});

test("backend/scripts/build-admin.mjs: admin shell for the Worker's own origin (same-origin API, no analytics)", () => {
  const { execFileSync } = require("node:child_process");
  const { rmSync, existsSync } = require("node:fs");
  const out = join(ROOT, "backend", "admin-dist");
  execFileSync(process.execPath, [join(ROOT, "backend", "scripts", "build-admin.mjs")], { stdio: "ignore" });
  try {
    for (const f of ["admin.html", "admin.js", "admin.css", "lensiq-api.js", "lensiq-config.js"]) assert.ok(existsSync(join(out, f)), f);
    assert.match(readFileSync(join(out, "lensiq-config.js"), "utf8"), /LENSIQ_API_BASE = location\.origin/);
    assert.match(readFileSync(join(out, "admin.html"), "utf8"), /connect-src 'self';/);
    assert.match(readFileSync(join(ROOT, "backend", ".gitignore"), "utf8"), /admin-dist\//);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
