// tests/unit/pii-guard-secrets.test.js — owner decision 147 ก (2026-11-19): tools/pii-scan.mjs also blocks e-mail addresses
// and secrets (cloud / API keys, tokens, JWTs, private keys, high-entropy values assigned to secret-like names).
// Locked (evals-locks/pii-guard-secrets.sha256) BEFORE the detectors exist. Every sample is built at run time from a seeded
// generator, so this file holds no e-mail address and no key-shaped string. The scanner prints only a masked shape.
// Negatives: reserved e-mail domains (example.com/.org/.net, *.example, *.test, *.invalid, *.localhost), noreply addresses,
// image names like icon@2x.png, git author metadata (not file content), placeholder keys made of repeated characters or
// placeholder words (as in the backend tests), sha256 lines in evals-locks, SRI integrity attributes.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
const SCAN = join(REPO, "tools", "pii-scan.mjs");
let S;
before(async () => { S = await import(pathToFileURL(SCAN).href); });

const J = (...parts) => parts.join("");
// deterministic pseudo-random strings (LCG), so the file holds no literal key
let seed = 147;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const UPPER_NUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const B64 = ALNUM + "+/";
const URL64 = ALNUM + "-_";
const pick = (set, n) => Array.from({ length: n }, () => set[Math.floor(rnd() * set.length)]).join("");
const AT = String.fromCharCode(64);
const mail = (local, domain) => J(local, AT, domain);

const SECRETS = {
  "aws access key id": J("AK", "IA", pick(UPPER_NUM, 16)),
  "aws secret": J("aws_secret_access_key = ", pick(B64, 40)),
  "github ghp": J("gh", "p_", pick(ALNUM, 36)),
  "github gho": J("gh", "o_", pick(ALNUM, 36)),
  "github fine-grained": J("github", "_pat_", pick(ALNUM, 22), "_", pick(ALNUM, 59)),
  "openai sk": J("s", "k-", "proj-", pick(URL64, 48)),
  "anthropic sk": J("s", "k-", "ant-", "api03-", pick(URL64, 80)),
  "slack": J("xo", "xb-", pick("0123456789", 12), "-", pick("0123456789", 13), "-", pick(ALNUM, 24)),
  "google": J("AI", "za", pick(URL64, 35)),
  "stripe sk_live": J("s", "k_li", "ve_", pick(ALNUM, 32)),
  "stripe rk_live": J("r", "k_li", "ve_", pick(ALNUM, 32)),
  "jwt": J("ey", "J", pick(URL64, 30), ".", "ey", "J", pick(URL64, 60), ".", pick(URL64, 43)),
  "pem rsa": J("-----BEGIN ", "RSA ", "PRIVATE ", "KEY-----"),
  "pem openssh": J("-----BEGIN ", "OPENSSH ", "PRIVATE ", "KEY-----"),
  "pem pkcs8": J("-----BEGIN ", "PRIVATE ", "KEY-----"),
  "generic secret": J('const clientSecret = "', pick(ALNUM, 32), '";'),
  "generic token": J('  "token": "', pick(URL64, 40), '"'),
  "generic password": J("DB_PASSWORD=", '"', pick(ALNUM + "!#%", 24), '"'),
  "generic api_key": J("api_key: '", pick(ALNUM, 28), "'")
};
const EMAILS = {
  "plain text": J("contact me at ", mail("somchai.p", "mailbox-th.co"), " please"),
  "json": J('{"name":"x","email":"', mail("jane_doe+news", "corp-mail.net"), '"}'),
  "thai sentence": J("อีเมล ", mail("tum", "uni-sample.ac.th")),
  "mailto": J('<a href="mailto:', mail("sales", "lensiq-sample.app"), '">')
};
const CLEAN = {
  "example.com": J("write to ", mail("billing", "example.com")),
  "sub.example.org": J(mail("a", "mail.example.org")),
  ".example tld": J(mail("seller", "shop.example")),
  ".test tld": J(mail("owner", "example.test")),
  ".invalid tld": J(mail("t", "example.invalid")),
  ".localhost": J(mail("dev", "app.localhost")),
  "noreply": J("Co-Authored-By: Bot <", mail("noreply", "vendor-sample.com"), ">"),
  "github noreply": J(mail("12345+someone", "users.noreply.github.com")),
  "retina image": J('src="icon', AT, '2x.png" and logo', AT, "3x.webp"),
  "npm scope": J("import x from '", AT, "scope/pkg", AT, "1.2.3'"),
  "placeholder sk repeated": J('ANTHROPIC_API_KEY: "s', "k-ant-", "SECRETVALUE", "AAAA", "1111", '"'),
  "placeholder google repeated": J('GEMINI_API_KEY: "AI', "za", "SECRETVALUE", "BBBB", "2222", '"'),
  "placeholder generic x": J('token: "', "x".repeat(32), '"'),
  "placeholder generic words": J('secret = "', "your-secret-here-", "change-me", '"'),
  "placeholder ghp zeros": J("gh", "p_", "0".repeat(36)),
  "evals-lock line": J(pick("0123456789abcdef", 64), "  tests/unit/x.test.js  # repo file"),
  "sri integrity": J('<script src="x.js" integrity="sha384-', pick(B64, 64), '" crossorigin="anonymous"></script>'),
  "env reference": J("token: process.env.", "LINE_CHANNEL_TOKEN"),
  "short generic": J('password: "', "hunter2", '"'),
  "plain word with dash": J("the sk-", "learn library and xox", "o notation")
};

test("e-mail addresses are flagged as type email (plain text, JSON, Thai text, mailto)", () => {
  for (const [name, line] of Object.entries(EMAILS)) {
    const hits = S.scanText(line, "docs/x.md");
    assert.ok(hits.some(h => h.type === "email"), `email not found: ${name}`);
  }
});

test("secrets are flagged as type secret, each kind", () => {
  for (const [name, line] of Object.entries(SECRETS)) {
    const hits = S.scanText(line, "src/x.js");
    assert.ok(hits.some(h => h.type === "secret"), `secret not found: ${name}`);
  }
});

test("no false positives: reserved domains, noreply, image and npm names, placeholders, hashes, SRI, env refs", () => {
  for (const [name, line] of Object.entries(CLEAN)) {
    const hits = S.scanText(line, "src/x.js").filter(h => h.type === "email" || h.type === "secret");
    assert.deepEqual(hits, [], `false positive: ${name}`);
  }
});

test("findings never carry or show the value (masked shape only)", () => {
  for (const line of [...Object.values(SECRETS), ...Object.values(EMAILS)]) {
    for (const h of S.scanText(line, "x")) {
      assert.ok(!("value" in h));
      const tokens = line.match(/[A-Za-z0-9_\-+/.@]{8,}/g) || [];
      for (const t of tokens) if (/\d/.test(t) && /[A-Za-z]/.test(t)) assert.ok(!h.masked.includes(t), "masked shape leaks a token");
      for (const e of line.match(/[^\s"'<>:]+@[^\s"'<>]+/g) || []) {
        const [local, domain] = e.split(AT);
        assert.ok(!h.masked.includes(local) && !h.masked.includes(domain), "masked shape leaks an e-mail part");
      }
    }
  }
});

// ---- CLI ----
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const git = (dir, email, ...args) => {
  const r = spawnSync("git", ["-c", "user.name=Some Person", "-c", `user.email=${email}`, "-c", "commit.gpgsign=false", ...args],
    { cwd: dir, encoding: "utf8", env: GIT_ENV });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
const scan = (dir, ...args) => spawnSync(process.execPath, [SCAN, "--repo", dir, ...args], { encoding: "utf8", env: GIT_ENV });

test("CLI: git author e-mail is metadata, not content (clean); an e-mail or key in a file fails without printing it", () => {
  const dir = mkdtempSync(join(tmpdir(), "pii-secrets-"));
  const author = mail("real.person", "university-sample.ac.th");
  try {
    git(dir, author, "init", "-q", "-b", "main");
    writeFileSync(join(dir, "README.md"), "clean\n");
    git(dir, author, "add", "-A");
    git(dir, author, "commit", "-q", "-m", "clean");
    const base = git(dir, author, "rev-parse", "HEAD");
    writeFileSync(join(dir, "notes.md"), "still clean\n");
    git(dir, author, "add", "-A");
    git(dir, author, "commit", "-q", "-m", "more");
    assert.equal(scan(dir, "--tracked").status, 0, "author e-mail is not file content");
    assert.equal(scan(dir, "--range", `${base}..HEAD`).status, 0, "author e-mail is not in the scanned diff");
    assert.equal(scan(dir, "--range", "HEAD").status, 0, "full history: author e-mail still not content");
    const email = mail("jane_doe+news", "corp-mail.net");
    const key = J("gh", "p_", pick(ALNUM, 36));
    writeFileSync(join(dir, "config.json"), JSON.stringify({ owner: email, gh: key }) + "\n");
    git(dir, author, "add", "-A");
    git(dir, author, "commit", "-q", "-m", "oops");
    for (const r of [scan(dir, "--tracked"), scan(dir, "--range", `${base}..HEAD`)]) {
      assert.equal(r.status, 1, r.stdout + r.stderr);
      const out = r.stdout + r.stderr;
      assert.match(out, /email\s+config\.json:1/);
      assert.match(out, /secret\s+config\.json:1/);
      assert.ok(!out.includes(email) && !out.includes(key) && !out.includes("jane_doe"), "values never printed");
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("allow-list: email and secret can be capped per path; a secret entry is never kind public", () => {
  const dir = mkdtempSync(join(tmpdir(), "pii-secrets-allow-"));
  try {
    git(dir, "t@example.invalid", "init", "-q", "-b", "main");
    writeFileSync(join(dir, "fixture.js"), J('const k = "', J("gh", "p_", pick(ALNUM, 36)), '";\n'));
    git(dir, "t@example.invalid", "add", "-A");
    git(dir, "t@example.invalid", "commit", "-q", "-m", "fixture");
    const allow = join(dir, "allow.json");
    writeFileSync(allow, JSON.stringify({ entries: [{ path: "fixture.js", types: { secret: 1 }, kind: "synthetic", reason: "synthetic test key" }] }));
    assert.equal(scan(dir, "--tracked", "--allow", allow).status, 0);
    writeFileSync(allow, JSON.stringify({ entries: [{ path: "fixture.js", types: { secret: 1 }, kind: "public", reason: "not allowed for secrets" }] }));
    assert.equal(scan(dir, "--tracked", "--allow", allow).status, 2, "a secret cannot be allow-listed as public");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("this repository: e-mails and secrets only where allow-listed (synthetic / public / false positive)", () => {
  const r = spawnSync(process.execPath, [SCAN, "--tracked"], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const allow = JSON.parse(readFileSync(join(REPO, "tools", "pii-allow.json"), "utf8"));
  for (const e of allow.entries) if (e.types.secret) assert.notEqual(e.kind, "public", `${e.path}: secret entries are synthetic or false-positive`);
});
