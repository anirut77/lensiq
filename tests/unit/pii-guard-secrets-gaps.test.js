// tests/unit/pii-guard-secrets-gaps.test.js — independent review round 1 of pii-guard-secrets (7e843337): the placeholder
// exclusions were over-broad (a real-shaped key with "demo" or a 4-character run in its random part passed), unquoted
// NAME=value lines and Cloudflare Turnstile secrets were missed, hex values could fall under the entropy gate, and some key
// families had no rule. Locked (evals-locks/pii-guard-secrets.sha256) BEFORE the fixes. Method (the reviewer's): 300
// seeded random keys per case, every one must be caught; every negative must stay clean. Values are built at run time from
// a seeded generator, so this file holds none. The existing pii-guard-secrets.test.js is unchanged.
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
const SCAN = join(REPO, "tools", "pii-scan.mjs");
let S;
before(async () => { S = await import(pathToFileURL(SCAN).href); });

const J = (...parts) => parts.join("");
let seed = 7843337;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const URL64 = ALNUM + "-_";
const HEX = "0123456789abcdef";
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const pick = (set, n) => Array.from({ length: n }, () => set[Math.floor(rnd() * set.length)]).join("");
/** a random body with `insert` placed at a random position (same total length) */
const withInsert = (set, n, insert) => { const b = pick(set, n - insert.length); const i = Math.floor(rnd() * (b.length + 1)); return b.slice(0, i) + insert + b.slice(i); };
const runOf = (set, k) => set[Math.floor(rnd() * set.length)].repeat(k);
const TRIES = 300;
const AT = String.fromCharCode(64);

// each case: a generator of one line holding one secret
const CASES = {
  "sk-proj with demo inside": () => J("s", "k-proj-", withInsert(URL64, 48, "demo")),
  "ghp with demo inside": () => J("gh", "p_", withInsert(ALNUM, 36, "demo")),
  "sk_live with demo inside": () => J("s", "k_li", "ve_", withInsert(ALNUM, 32, "demo")),
  "AIza with demo inside": () => J("AI", "za", withInsert(URL64, 35, "demo")),
  "sk-ant with test inside": () => J("s", "k-ant-api03-", withInsert(URL64, 80, "test")),
  "ghp with a 4-7 char run": () => J("gh", "p_", withInsert(ALNUM, 36, runOf(ALNUM, 4 + Math.floor(rnd() * 4)))),
  "AIza with a 4-7 char run": () => J("AI", "za", withInsert(URL64, 35, runOf(ALNUM, 4 + Math.floor(rnd() * 4)))),
  "unquoted env OPENFDA_API_KEY": () => J("OPENFDA_API", "_KEY=", pick(ALNUM, 40)),
  "unquoted yaml api_key": () => J("  api", "_key: ", pick(ALNUM, 32)),
  "unquoted env DB_PASSWORD": () => J("DB_PASS", "WORD=", pick(ALNUM, 24)),
  "hex32 quoted secret": () => J('"client', '_secret": "', pick(HEX, 32), '"'),
  "hex40 unquoted token": () => J("GITLAB_TO", "KEN=", pick(HEX, 40)),
  "hex64 quoted api key": () => J("const apiK", 'ey = "', pick(HEX, 64), '";'),
  "turnstile secret quoted": () => J('TURNSTILE_SECRET', '_KEY: "0x4', "A".repeat(7 + Math.floor(rnd() * 3)), pick(URL64, 22), '"'),
  "turnstile secret bare": () => J("secret 0x4", "A".repeat(7 + Math.floor(rnd() * 3)), pick(URL64, 22)),
  "stripe sk_test": () => J("s", "k_te", "st_", pick(ALNUM, 32)),
  "huggingface hf_": () => J("h", "f_", pick(LETTERS, 34)),
  "npm token": () => J("np", "m_", pick(ALNUM, 36)),
  "sendgrid SG.": () => J("S", "G.", pick(URL64, 22), ".", pick(URL64, 43)),
  "telegram bot token": () => J(pick("123456789", 1), pick("0123456789", 9), ":A", "A", pick(URL64, 33)),
  "google oauth GOCSPX-": () => J("GOC", "SPX-", pick(URL64, 28)),
  "password in URL": () => J("postgres://app", "user:", pick(ALNUM, 18), AT, "db.internal-host.net:5432/app"),
  "password in https URL": () => J("https://deploy:", pick(ALNUM + "!~", 16), AT, "git.sample-host.org/repo.git")
};

const NEGATIVES = {
  "existing placeholder sk": J('ANTHROPIC_API_KEY: "s', "k-ant-", "SECRETVALUE", "AAAA", "1111", '"'),
  "existing placeholder google": J('GEMINI_API_KEY: "AI', "za", "SECRETVALUE", "BBBB", "2222", '"'),
  "placeholder words": J('secret = "', "your-secret-here-", "change-me", '"'),
  "x run": J('token: "', "x".repeat(32), '"'),
  "ghp zeros": J("gh", "p_", "0".repeat(36)),
  "env reference": J("token: process.env.", "LINE_CHANNEL_TOKEN"),
  "identifier value": J("apiKey: apiKey", "FromStorage,"),
  "name value": J('tokenParam: "max_completion', '_tokens"'),
  "sha line without a name": J(pick(HEX, 64), "  tests/unit/x.test.js"),
  "sri integrity": J('<link rel="stylesheet" href="a.css" integrity="sha384-', pick(ALNUM + "+/", 64), '">'),
  "turnstile documented test secret": J("TURNSTILE_SECRET", '_KEY: "1x', "0".repeat(31), 'AA"'),
  "turnstile short canary": J('secret: "0x4', 'short"'),
  "url placeholder password": J("postgres://user:", "password", AT, "localhost/db"),
  "url template password": J("https://user:", "${PASS}", AT, "host.example.org/x"),
  "url masked password": J("redis://:", "****", AT, "cache-host:6379"),
  "url with port only": J("http://localhost:", "8080/path"),
  "short password": J('password: "', "hunter2", '"'),
  "hex digest named sha": J('sha256: "', pick(HEX, 64), '"'),
  "lock hash in evals-locks": J(pick(HEX, 64), "  pii-guard.test.js")
};

/** @param {string} line */
const isSecret = line => S.scanText(line, "src/x.js").some(h => h.type === "secret");

for (const [name, gen] of Object.entries(CASES)) {
  test(`caught ${TRIES}/${TRIES}: ${name}`, () => {
    let caught = 0;
    const missed = [];
    for (let i = 0; i < TRIES; i++) {
      const line = gen();
      if (isSecret(line)) caught++;
      else if (missed.length < 3) missed.push(line.replace(/[A-Za-z]/g, "x").replace(/\d/g, "#"));
    }
    assert.equal(caught, TRIES, `${name}: ${caught}/${TRIES}; missed shapes ${JSON.stringify(missed)}`);
  });
}

test("negatives stay clean (placeholders, references, names, hashes, SRI, documented test keys, URL placeholders)", () => {
  for (const [name, line] of Object.entries(NEGATIVES)) {
    const hits = S.scanText(line, "src/x.js").filter(h => h.type === "secret" || h.type === "email");
    assert.deepEqual(hits, [], `false positive: ${name}`);
  }
});

test("output never shows a generated key", () => {
  for (const gen of Object.values(CASES)) {
    const line = gen();
    for (const h of S.scanText(line, "x")) {
      const longest = (line.match(/[A-Za-z0-9_\-+/!~]{12,}/g) || []).sort((a, b) => b.length - a.length)[0] || "";
      if (longest) assert.ok(!h.masked.includes(longest.slice(-12)), "masked shape leaks the key tail");
    }
  }
});

test("repo: tracked tree clean; secret entries synthetic or false-positive; no e-mail entry for docs/NUTRITION-DESIGN.md", () => {
  const r = spawnSync(process.execPath, [SCAN, "--tracked"], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const allow = JSON.parse(readFileSync(join(REPO, "tools", "pii-allow.json"), "utf8"));
  for (const e of allow.entries) {
    const kinds = { ...Object.fromEntries(Object.keys(e.types).map(t => [t, e.kind])), ...(e.kinds || {}) };
    if (e.types.secret) assert.ok(["synthetic", "false-positive"].includes(kinds.secret), `${e.path}: secret kind`);
  }
  const nut = allow.entries.find(e => e.path === "docs/NUTRITION-DESIGN.md");
  assert.ok(!nut || !nut.types.email, "the personal-looking address in docs/NUTRITION-DESIGN.md is replaced, not allow-listed");
});
