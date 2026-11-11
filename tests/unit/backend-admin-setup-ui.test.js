"use strict";
// tests/unit/backend-admin-setup-ui.test.js — fixed checks for the owner-facing admin screens (first-run setup, sign-in,
// 2-step verification, recovery codes) and for moving the API / admin / site to a custom domain by configuration only.
// The flow itself runs in a real browser against the real Worker code in tests/e2e/admin-setup.e2e.mjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const vm = require("node:vm");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const dict = (file, lang) => { const w = {}; w.window = w; vm.runInNewContext(read(file), w); return Object.assign({}, ...w.LQI18N_Q.map(d => d[lang] || {})); };
/** The auth screens of admin.html: everything before the signed-in application section, comments removed. */
const authHtml = () => { const h = read("admin.html"); return h.slice(h.indexOf("<header"), h.indexOf('<section id="adApp"')).replace(/<!--[\s\S]*?-->/g, ""); };

test("admin sign-in and first-run markup: no session-mode choice, no developer wording, every field labelled", () => {
  const html = read("admin.html"), auth = authHtml();
  assert.ok(!/name="mode"/.test(html), "no session mode field anywhere on the page");
  assert.ok(!/<select[^>]*name=/.test(auth), "no select inside the sign-in / setup forms");
  const text = auth.replace(/<[^>]+>/g, " ");
  for (const w of [/bearer/i, /cookie/i, /คุกกี้/, /เซสชัน/, /TOTP/, /wrangler/i, /\bsecret\b/i, /\btoken\b/i, /\borigin\b/i, /\bCSP\b/, /bootstrap/i, /\bAPI\b/, /github\.io/])
    assert.ok(!w.test(text), "developer wording on an owner screen: " + w + " in …" + (text.match(new RegExp(".{0,30}" + w.source + ".{0,30}", w.flags)) || [""])[0]);
  assert.ok(!/<code>/.test(auth), "no code snippets on the owner screens");
  for (const id of ["adBoot", "adLogin", "adTwo", "adCodes", "adBootForm", "adLoginForm", "adTwoForm", "adTwoQr", "adTwoKey", "adCodesList", "adCodesOk", "adCodesDone", "adLoginSwap", "adLang"])
    assert.match(html, new RegExp(`id="${id}"`), id);
  // every input of the four forms sits inside a <label>
  const forms = auth.match(/<form[\s\S]*?<\/form>/g) || [];
  assert.equal(forms.length, 3);
  for (const f of forms) {
    const labelled = (f.match(/<label[\s\S]*?<\/label>/g) || []).join("");
    for (const m of f.matchAll(/<input[^>]*name="([^"]+)"/g)) assert.ok(labelled.includes(`name="${m[1]}"`), "unlabelled input " + m[1]);
  }
  assert.match(auth, /role="alert"/);
  assert.match(html, /<script src="attendance-qr\.js/, "QR drawn on the device");
});

test("admin.js: the session mode is automatic; the override needs the developer flag; secrets stay out of storage and URLs", () => {
  const js = read("admin.js");
  assert.match(js, /function sessionMode\(\) \{\s*var auto = sameOrigin\(\) \? "cookie" : "bearer";\s*if \(!devFlag\(\)\) return auto;/);
  assert.match(js, /state\.mode = sessionMode\(\);/);
  assert.ok(!/d\.mode|\.mode\.value|name=mode/.test(js), "no form field feeds the mode");
  assert.ok(!/\.innerHTML\s*=/.test(js), "server strings rendered as text only");
  // only the trusted-device token and the developer flag ever touch storage
  const stores = [...js.matchAll(/(?:localStorage|sessionStorage)\.(?:setItem|getItem)\(([^,)]+)/g)].map(m => m[1].trim());
  assert.deepEqual([...new Set(stores)].sort(), ["\"lq-admin-dev\"", "DEV_KEY"]);
  assert.ok(!/console\.(log|info|debug|warn|error)/.test(js), "nothing is logged");
  assert.match(js, /"data:image\/svg\+xml;charset=utf-8," \+ encodeURIComponent\(QR\.svg\(r\.uri/, "the QR is a local data: image");
  assert.ok(!/fetch\([^)]*uri|fetch\([^)]*secret/.test(js));
  // the page shows its own text for refusals, never the server's English message, on the owner screens
  assert.match(js, /function friendly\(/);
  for (const c of ["invalid_token", "already_setup", "setup_closed", "invalid_username", "weak_password", "invalid_credentials", "invalid_totp", "invalid_recovery", "too_many", "admin_busy"])
    assert.match(js, new RegExp(`case "${c}"`), c);
});

test("every adm.* key used by admin.html / admin.js has English and Chinese text (no Thai in them)", () => {
  const en = dict("i18n/en-admin.js", "en"), zh = dict("i18n/zh-admin.js", "zh");
  const html = read("admin.html"), js = read("admin.js");
  const used = new Set([...html.matchAll(/data-i18n="(adm\.[^"]+)"/g), ...html.matchAll(/data-i18n-attr="[a-z-]+:(adm\.[^"]+)"/g), ...js.matchAll(/G\("(adm\.[^"]+)"/g),
    ...js.matchAll(/"data-i18n", [^)]*"(adm\.[^"]+)" : "(adm\.[^"]+)"/g)].flatMap(m => m.slice(1).filter(Boolean)));
  assert.ok(used.size >= 85, "keys found: " + used.size);
  for (const k of used) { assert.ok(en[k], "en " + k); assert.ok(zh[k], "zh " + k); }
  for (const k of Object.keys(en).filter(k => k.startsWith("adm."))) {
    assert.ok(!/[ก-๙]/.test(en[k]), "Thai in en " + k);
    assert.ok(!/[ก-๙]/.test(zh[k]), "Thai in zh " + k);
    assert.ok(/[\u3400-\u9FFF]/.test(zh[k]), "zh " + k + " is Chinese");
  }
  // placeholders survive translation
  for (const k of ["adm.e.many", "adm.rec.left"]) { assert.match(en[k], /\{n\}/); assert.match(zh[k], /\{n\}/); }
  // every element of the owner screens that shows text carries a key (so nothing stays Thai in English / Chinese)
  const auth = authHtml();
  for (const m of auth.matchAll(/<(h1|p|li|small|button|span)(\s[^>]*)?>([^<]*[ก-๙][^<]*)</g)) assert.ok(/data-i18n=/.test(m[2] || ""), "no key on: " + m[3].trim().slice(0, 40));
});

test("the Worker serves the QR encoder with the admin shell; build-admin copies it", async () => {
  const { ADMIN_ASSETS, ADMIN_PAGE_HEADERS } = await import(join(ROOT, "backend", "src", "index.js"));
  assert.ok(ADMIN_ASSETS.has("/attendance-qr.js"));
  assert.match(read("backend/scripts/build-admin.mjs"), /"attendance-qr\.js"/);
  assert.match(ADMIN_PAGE_HEADERS["Content-Security-Policy"], /img-src 'self' data: blob:/, "the data: QR image is allowed, nothing external");
  assert.match(ADMIN_PAGE_HEADERS["Content-Security-Policy"], /connect-src 'self'/);
  const src = [...read("admin.html").matchAll(/<script src="([^"?]+)/g)].map(m => "/" + m[1]);
  for (const s of src) assert.ok(ADMIN_ASSETS.has(s), "admin.html loads " + s + " but the Worker does not serve it");
});

// ---- custom domain: a configuration change only (docs/CUSTOM-DOMAIN.md) ------------------------------------------------
test("custom domain: no source file of the Worker or the admin page names the current hosts", () => {
  const files = [...readdirSync(join(ROOT, "backend", "src")).filter(f => f.endsWith(".js")).map(f => "backend/src/" + f),
    ...readdirSync(join(ROOT, "backend", "src", "ai")).filter(f => f.endsWith(".js")).map(f => "backend/src/ai/" + f),
    "admin.html", "admin.js", "lensiq-api.js", "lensiq-ai.js", "lensiq-tester.js", "medicine.html", "medicine.js", "backend/scripts/build-admin.mjs", "tools/build-site.mjs"];
  for (const f of files) {
    const s = read(f);
    assert.ok(!/anirut77\.github\.io/.test(s), f + " names the GitHub Pages host");
    assert.ok(!/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/.test(s.replace(/<sub>\.workers\.dev|<subdomain>\.workers\.dev/g, "")), f + " names a workers.dev host");
  }
});

test("custom domain: the same Worker code answers on any host; CORS, the admin origin and Turnstile hostnames come from configuration", async () => {
  const index = await import(join(ROOT, "backend", "src", "index.js"));
  const { turnstileStatus } = await import(join(ROOT, "backend", "src", "turnstile.js"));
  const API = "https://lensiq-api.example.com", SITE = "https://lensiq.example.com";
  const env = createEnv({ ALLOWED_ORIGINS: SITE + ",https://anirut77.github.io", ADMIN_ORIGINS: "", TURNSTILE_HOSTNAMES: "lensiq.example.com,anirut77.github.io", TURNSTILE_SECRET: "x",
    ADMIN_BOOTSTRAP_TOKEN: "t".repeat(40), SECRETS_KEK: Buffer.alloc(32, 3).toString("base64") });
  // public API: the new site origin is allowed, the old one still is (both listed during the move), a stranger is not
  for (const [origin, ok] of [[SITE, true], ["https://anirut77.github.io", true], ["https://evil.example", false]]) {
    const r = await index.handle(req("/v1/config", { origin, base: API }), env);
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), ok ? origin : null, origin);
  }
  // admin: with ADMIN_ORIGINS empty the only allowed origin is the Worker's own host, whatever that host is
  const post = origin => index.handle(req("/admin/api/bootstrap", { method: "POST", origin, base: API,
    body: { token: "t".repeat(40), username: "owner", password: "correct horse battery staple" } }), env);
  assert.equal((await post(SITE)).status, 403, "the public site is not an admin origin");
  assert.equal((await post("https://lensiq-api-test.x.workers.dev")).status, 403, "nor is the old workers.dev host when the request arrives on the custom host");
  const made = await post(API);
  assert.equal(made.status, 201);
  const login = await index.handle(req("/admin/api/login", { method: "POST", origin: API, base: API, body: { username: "owner", password: "correct horse battery staple" } }), env);
  assert.match(login.headers.get("Set-Cookie"), /^__Host-lq_admin=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Strict/, "host-only cookie: nothing to change for a new domain");
  assert.deepEqual(turnstileStatus(env).hostnames, ["lensiq.example.com", "anirut77.github.io"]);
});

test("custom domain: site:set-api and the smoke check accept only workers.dev or a hostname approved in deploy/domains.json", async () => {
  const G = await import(join(ROOT, "tools", "lib", "cf-guard.mjs"));
  const { main } = await import(join(ROOT, "tools", "site-config.mjs"));
  const smoke = await import(join(ROOT, "tools", "backend-smoke.mjs"));
  assert.deepEqual(JSON.parse(read("deploy/domains.json")).apiHosts, [], "committed default: no custom host approved");
  for (const h of ["lensiq-api.example.com", "api.lensiq.example", "lensiq.example.co.th"]) assert.equal(G.isLensiqHost(h), true, h);
  const notOurs = ["api.example.com", "aidanex.faksak.com", "faksak.com", "LENSIQ.example.com", "lensiq-api.example.com/path", "*.lensiq.example", "lensiq", "https://lensiq.example.com", ""];
  for (const h of notOurs) assert.equal(G.isLensiqHost(h), false, h);
  const dir = mkdtempSync(join(tmpdir(), "lq-domains-"));
  try {
    const domains = join(dir, "domains.json"), file = join(dir, "site.json"), KEY = "0x4AAAAAAADnPIDROrmt1Wwj";
    const run = base => main(["--api-base", base, "--sitekey", KEY], { file, domains, print: () => {} });
    writeFileSync(domains, JSON.stringify({ apiHosts: [] }));
    assert.equal(run("https://lensiq-api.example.com"), 3, "not approved yet");
    assert.ok(!existsSync(file));
    writeFileSync(domains, JSON.stringify({ apiHosts: ["lensiq-api.example.com"] }));
    assert.equal(run("https://lensiq-api.example.com"), 0);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).apiBase, "https://lensiq-api.example.com");
    for (const bad of ["https://lensiq-api.example.com/x", "http://lensiq-api.example.com", "https://other.example.com", "https://lensiq-api.example.com.evil.example"]) assert.equal(run(bad), 3, bad);
    assert.equal(run("https://lensiq-api-test.my-sub.workers.dev"), 0, "workers.dev keeps working");
    assert.ok(smoke.checkBase("https://lensiq-api.example.com", ["lensiq-api.example.com"]));
    assert.equal(smoke.checkBase("https://lensiq-api.example.com", []), null);
    assert.equal(smoke.checkBase("https://lensiq-api.example.com"), null);
    // a list that names another project's host is refused as a whole
    writeFileSync(domains, JSON.stringify({ apiHosts: ["aidanex.faksak.com"] }));
    assert.equal(run("https://aidanex.faksak.com"), 3);
    assert.throws(() => G.approvedApiHosts(domains, p => readFileSync(p, "utf8")), /not an accepted hostname/);
    writeFileSync(domains, JSON.stringify({ apiHosts: [], extra: 1 }));
    assert.throws(() => G.approvedApiHosts(domains, p => readFileSync(p, "utf8")), /unknown key/);
    assert.deepEqual(G.approvedApiHosts(join(dir, "missing.json"), p => readFileSync(p, "utf8")), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
