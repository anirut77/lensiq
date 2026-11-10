"use strict";
// tests/unit/backend-site.test.js — front-end integration of the API Worker: backend/ and Worker secrets are never
// published; CSP connect-src gets the API origin only when LENSIQ_API_BASE is configured; lensiq-api.js is inert
// offline; lensiq-analytics.js sends nothing without opt-in / with Do-Not-Track and only allowlisted fields;
// no secrets in the git-tracked files under backend/, and backend/.dev.vars stays git-ignored.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
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

// ---- secrets (owner decision 2026-11-10): git-TRACKED files only + the ignore rule itself is asserted -----------------
// A developer's own backend/.dev.vars (real keys for `wrangler dev`) is expected on a laptop and is git-ignored: its
// presence must not fail the suite. What must fail: a tracked .dev.vars, a tracked file with a real-looking key, or a
// backend/.gitignore that no longer ignores .dev.vars (the next `git add -A` would then commit the keys).
const git = (args, o = {}) => require("node:child_process").spawnSync("git", args, { cwd: ROOT, encoding: "utf8", ...o });
const SECRET_PATTERNS = [
  [/sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}/, "Anthropic key"],
  [/skey_(test_)?[0-9a-z]{19,}/, "Opn secret key"],
  [/pkey_(test_)?[0-9a-z]{19,}/, "Opn public key"],
  [/sk-or-v1-[0-9a-f]{32,}/, "OpenRouter key"],
  [/sk-(proj-)?[A-Za-z0-9]{40,}/, "OpenAI-style key"],
  [/AIza[0-9A-Za-z_-]{35}/, "Google API key"]
];
/** A local secrets file: .dev.vars or .dev.vars.<anything> except the committed example. */
const isDevVars = f => /(^|\/)\.dev\.vars(\.[^/]*)?$/.test(f) && !/(^|\/)\.dev\.vars\.example$/.test(f);
/** Problems in a list of tracked paths. read(path) -> file text. @param {string[]} files @param {(f: string) => string} read */
function secretProblems(files, read) {
  const out = [];
  for (const f of files) {
    if (isDevVars(f)) { out.push(f + ": a .dev.vars file is tracked"); continue; }
    const s = read(f);
    for (const [re, name] of SECRET_PATTERNS) if (re.test(s)) out.push(f + ": " + name);
  }
  return out;
}
const trackedBackend = () => {
  const r = git(["ls-files", "-z", "--", "backend"]);
  assert.equal(r.status, 0, "git ls-files must work (the secrets test needs the repository): " + r.stderr);
  return r.stdout.split("\0").filter(Boolean);
};

test("secrets checker: a tracked .dev.vars or a real-looking key in a tracked file is reported; placeholders are not", () => {
  const A = "sk-ant-" + "api03-" + "Ab1_".repeat(8), O = "skey_" + "test_" + "5x".repeat(12), P = "pkey_" + "9z".repeat(12), R = "sk-or-" + "v1-" + "0a1b2c3d".repeat(8);
  const fake = { "backend/src/a.js": "const k = \"" + A + "\";", "backend/b.md": "key: " + O, "backend/c.toml": "OPN_PUBLIC_KEY = \"" + P + "\"", "backend/d.js": R,
    "backend/.dev.vars": "X=1", "backend/sub/.dev.vars.staging": "X=1", "backend/.dev.vars.local": "",
    "backend/.dev.vars.example": "ANTHROPIC_API_KEY=\nOPN_SECRET_KEY=skey_test_xxx\n", "backend/ok.js": "const k = env.ANTHROPIC_API_KEY; // sk-ant-... goes in .dev.vars" };
  const got = secretProblems(Object.keys(fake), f => fake[f]);
  assert.deepEqual(got.sort(), [
    "backend/.dev.vars.local: a .dev.vars file is tracked", "backend/.dev.vars: a .dev.vars file is tracked", "backend/b.md: Opn secret key", "backend/c.toml: Opn public key",
    "backend/d.js: OpenRouter key", "backend/src/a.js: Anthropic key", "backend/sub/.dev.vars.staging: a .dev.vars file is tracked"
  ].sort());
  assert.equal(isDevVars("backend/.dev.vars.example"), false);
  assert.equal(isDevVars("backend/.dev.vars.example.bak"), true, "only the exact example name is exempt");
  assert.equal(isDevVars("backend/src/dev.vars.js"), false);
});

test("backend/.dev.vars and .dev.vars.* are git-ignored (the example is not): removing the ignore rule fails here", () => {
  // --no-index: the rule itself is checked, whether or not the file exists or is tracked. Exit 0 = ignored, 1 = not.
  const ignored = p => { const r = git(["check-ignore", "-q", "--no-index", "--", p]); assert.ok(r.status === 0 || r.status === 1, "git check-ignore failed: " + r.stderr); return r.status === 0; };
  for (const p of ["backend/.dev.vars", "backend/.dev.vars.local", "backend/.dev.vars.staging", "backend/.dev.vars.production", "backend/.dev.vars.bak"]) {
    assert.ok(ignored(p), p + " must be git-ignored (backend/.gitignore: .dev.vars and .dev.vars.*)");
  }
  assert.ok(!ignored("backend/.dev.vars.example"), "the placeholder example stays committed");
  assert.ok(!ignored("backend/wrangler.toml") && !ignored("backend/src/index.js"), "sanity: ordinary files are not ignored");
  // the rule is in a TRACKED ignore file (not only in a developer's .git/info/exclude or global excludes)
  const v = git(["check-ignore", "-v", "--no-index", "--", "backend/.dev.vars", "backend/.dev.vars.staging"]);
  for (const line of v.stdout.trim().split("\n")) assert.match(line, /^(backend\/)?\.gitignore:\d+:/, "ignored by a .gitignore in the repo: " + line);
  const src = v.stdout.trim().split("\n").map(l => l.split(":")[0]);
  const tracked = git(["ls-files", "--", ...new Set(src)]).stdout.trim().split("\n");
  for (const f of new Set(src)) assert.ok(tracked.includes(f), f + " is tracked");
});

test("no secrets committed under backend/ (git-tracked files only; only placeholders)", () => {
  const { existsSync } = require("node:fs");
  const files = trackedBackend();
  assert.ok(files.length > 20 && files.includes("backend/wrangler.toml") && files.includes("backend/.dev.vars.example"), "the tracked list is the real backend tree");
  assert.ok(!files.some(isDevVars), ".dev.vars must never be tracked");
  // working-tree content when the file is there; otherwise (deleted locally, or staged only) the content in the index
  const read = f => {
    if (existsSync(join(ROOT, f))) return readFileSync(join(ROOT, f), "utf8");
    const r = git(["show", ":" + f], { maxBuffer: 64 * 1024 * 1024 });
    assert.equal(r.status, 0, "git show :" + f + " failed");
    return r.stdout;
  };
  const problems = secretProblems(files, read);
  assert.deepEqual(problems, []);
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
