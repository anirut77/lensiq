// tests/unit/pii-guard.test.js — owner decision 111 (2026-11-19): a commit pushed on 2026-11-18 carried a local Wrangler
// cache file (.wrangler/cache/cf.json) holding the owner's device location (coordinates, postcode, city). This test locks
// the blocking check that stops personal data being committed again: tools/pii-scan.mjs scans tracked files (--tracked),
// the added lines of every commit in a range (--range A..B, used in CI on the pushed commits) and staged changes
// (--staged, tools/git-hooks/pre-commit). Detectors: coordinates, postcode + city, phone numbers (Thai and international),
// Thai national ID (13 digits with checksum), public IPv4 / IPv6, street addresses, and forbidden paths (.wrangler/,
// .dev.vars, .env). Synthetic fixtures pass only through tools/pii-allow.json (path + type + max count + kind + reason).
// The scanner never prints a matched value. Every sample below is built at run time so this file itself holds none.
// This file is locked: evals-locks/pii-guard.sha256 (written BEFORE tools/pii-scan.mjs existed).
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const REPO = join(__dirname, "..", "..");
const SCAN = join(REPO, "tools", "pii-scan.mjs");
const ALLOW = join(REPO, "tools", "pii-allow.json");
let S;
before(async () => { S = await import(pathToFileURL(SCAN).href); });

const J = (...parts) => parts.join("");
/** Thai national ID check digit: (11 - sum(d[i] * (13 - i)) mod 11) mod 10 */
const thaiId = first12 => {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(first12[i]) * (13 - i);
  return first12 + String((11 - (s % 11)) % 10);
};
const ID_OK = thaiId(J("3", "1012", "0045", "67"));
const ID_BAD = ID_OK.slice(0, 12) + String((Number(ID_OK[12]) + 1) % 10);
const dashedId = id => [id[0], id.slice(1, 5), id.slice(5, 10), id.slice(10, 12), id[12]].join("-");

const SAMPLES = {
  coordinates: [
    J("const home = [", "13.7", "4561", ", ", "100.5", "2873", "];"),
    J('{"lati', 'tude":"', "13.7", '4561","longi', 'tude":"', "100.5", '2873"}'),
    J("lat", ": ", "18.79", "0123", ", lng", ": ", "98.98", "4567")
  ],
  "postcode-city": [
    J('{"postal', 'Code":"', "105", '00","city":"Somewhere"}'),
    J("กรุงเทพ", "ฯ ", "105", "00")
  ],
  phone: [
    J("โทร ", "08", "1-", "555-", "0123"),
    J("call ", "+66 ", "81 ", "555 ", "0123"),
    J("office ", "02-", "555-", "0123"),
    J("US line ", "+1 ", "415-", "555-", "0134")
  ],
  "thai-id": [J("id ", ID_OK), J("บัตร ", dashedId(ID_OK))],
  ipv4: [J("host ", "203.", "150.", "18.", "77")],
  ipv6: [J("addr ", "2405:", "9800:", "b870:", "11::", "4")],
  "street-address": [
    J("บ้านเลขที่ ", "99/", "12 ", "ซอยสุข", "ใจ 4 ", "ถนนตัวอย่าง ", "แขวงทุ่ง", "สาธิต"),
    J("ship to ", "221 ", "Baker ", "Street")
  ]
};
const CLEAN = [
  J("e3b0c442", "98fc1c149afbf4c8996fb924", "27ae41e4649b934ca495991b7852b855  tests/unit/x.test.js"),
  J("UA Chrome/", "120.0.", "0.0 Safari/", "537.36"),
  J("opencv-python==", "4.10.0.", "84"),
  J("http://", "127.0.", "0.1:8000 and ", "0.0.", "0.0 and ", "192.168.", "1.10 and ", "10.0.", "0.1"),
  J("docs ", "192.0.", "2.7 and ", "198.51.", "100.9 and ", "203.0.", "113.5"),
  J("loopback ", "::1 and doc ", "2001:", "db8::", "1"),
  J("M = [[", "0.4124", "564, -0.", "3575761, -0.", "1985], [", "12.3", "45, 0.5]]"),
  J('gtin: "', ID_OK, '"'),
  J("checksum fails ", ID_BAD),
  J("at ", "12:34:", "56 on ", "2026-11-19"),
  J("tax_id: ", "0000000", "000000"),
  "a sentence without numbers"
];

test("module exports scanText, scanPath and isThaiId", () => {
  assert.equal(typeof S.scanText, "function");
  assert.equal(typeof S.scanPath, "function");
  assert.equal(typeof S.isThaiId, "function");
  assert.equal(S.isThaiId(ID_OK), true);
  assert.equal(S.isThaiId(ID_BAD), false);
  assert.equal(S.isThaiId(J("0", ID_OK.slice(1))), false, "a Thai ID never starts with 0");
});

for (const [type, lines] of Object.entries(SAMPLES)) {
  test(`detector flags ${type}`, () => {
    for (const line of lines) {
      const hits = S.scanText(line, "docs/sample.md");
      assert.ok(hits.some(h => h.type === type), `${type} not found in sample #${lines.indexOf(line)}`);
      for (const h of hits) {
        assert.equal(h.line, 1);
        assert.ok(!("value" in h), "a finding never carries the raw value");
      }
    }
  });
}

test("detector ignores hashes, versions, reserved IPs, math constants, barcodes, bad checksums and times", () => {
  for (const line of CLEAN) assert.deepEqual(S.scanText(line, "docs/sample.md"), [], `false positive in clean sample #${CLEAN.indexOf(line)}`);
});

test("line numbers point at the right line", () => {
  const text = ["first", "second", SAMPLES.phone[0], "fourth", SAMPLES["thai-id"][0]].join("\n");
  const hits = S.scanText(text, "a.txt");
  assert.deepEqual(hits.map(h => [h.type, h.line]), [["phone", 3], ["thai-id", 5]]);
});

test("forbidden paths: Wrangler / Miniflare cache, .dev.vars and .env (examples allowed)", () => {
  for (const p of [".wrangler/cache/cf.json", "backend/.wrangler/state/v3/d1/x.sqlite", ".dev.vars", "backend/.dev.vars", ".env", "x/.env.local"]) {
    assert.ok(S.scanPath(p).some(h => h.type === "forbidden-path"), p);
  }
  for (const p of [".dev.vars.example", "backend/.dev.vars.example", ".env.example", "docs/wrangler.md", "backend/wrangler.toml"]) {
    assert.deepEqual(S.scanPath(p), [], p);
  }
});

// ---- CLI against throw-away git repositories ----
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const git = (dir, ...args) => {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd: dir, encoding: "utf8", env: GIT_ENV });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
const scan = (dir, ...args) => spawnSync(process.execPath, [SCAN, "--repo", dir, ...args], { encoding: "utf8", env: GIT_ENV });
function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "pii-guard-"));
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "README.md"), "clean\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "clean");
  return dir;
}
const noRawValue = (out, raw) => {
  assert.ok(!out.includes(raw), "output must not contain the raw value");
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 6) assert.ok(!out.replace(/\D/g, " ").split(/\s+/).includes(digits), "output must not contain the digits");
};

test("CLI --tracked: exit 1 with type and path:line, never the value; exit 0 when clean", () => {
  const dir = tempRepo();
  try {
    assert.equal(scan(dir, "--tracked").status, 0);
    const raw = J("08", "1-", "555-", "0123");
    writeFileSync(join(dir, "contacts.txt"), `x\nโทร ${raw}\n`);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "add");
    const r = scan(dir, "--tracked");
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const out = r.stdout + r.stderr;
    assert.match(out, /phone/);
    assert.match(out, /contacts\.txt:2/);
    noRawValue(out, raw);
    const j = scan(dir, "--tracked", "--json");
    const parsed = JSON.parse(j.stdout);
    assert.equal(parsed.findings.length, 1);
    const f = parsed.findings[0];
    assert.equal(f.type, "phone");
    assert.equal(f.path, "contacts.txt");
    assert.equal(f.line, 2);
    assert.ok(!("value" in f), "JSON findings never carry the raw value");
    assert.ok(!JSON.stringify(parsed).includes(raw.replace(/\D/g, "")));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI allow-list: path + type + max count; more hits than the max fail again", () => {
  const dir = tempRepo();
  try {
    const raw = J("+66 ", "81 ", "555 ", "0123");
    writeFileSync(join(dir, "fixture.txt"), `${raw}\n`);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "fixture");
    const allow = join(dir, "allow.json");
    writeFileSync(allow, JSON.stringify({ entries: [{ path: "fixture.txt", types: { phone: 1 }, kind: "synthetic", reason: "test fixture" }] }));
    assert.equal(scan(dir, "--tracked", "--allow", allow).status, 0);
    writeFileSync(join(dir, "fixture.txt"), `${raw}\n${J("08", "9-", "555-", "0177")}\n`);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "second number");
    const r = scan(dir, "--tracked", "--allow", allow);
    assert.equal(r.status, 1, "a second phone number in an allow-listed file is not covered by max 1");
    writeFileSync(allow, JSON.stringify({ entries: [{ path: "fixture.txt", types: { phone: 2 } }] }));
    assert.notEqual(scan(dir, "--tracked", "--allow", allow).status, 0, "an entry without kind and reason is refused");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI --range catches data that a later commit removed (the 8e44c420 case)", () => {
  const dir = tempRepo();
  try {
    const base = git(dir, "rev-parse", "HEAD");
    mkdirSync(join(dir, ".wrangler", "cache"), { recursive: true });
    writeFileSync(join(dir, ".wrangler", "cache", "cf.json"),
      J('{"city":"Somewhere","lati', 'tude":"', "13.7", '4561","longi', 'tude":"', "100.5", '2873","postal', 'Code":"', "105", '00"}'));
    git(dir, "add", "-A", "-f");
    git(dir, "commit", "-q", "-m", "oops");
    const bad = git(dir, "rev-parse", "HEAD");
    git(dir, "rm", "-q", "-r", ".wrangler");
    git(dir, "commit", "-q", "-m", "remove");
    assert.equal(scan(dir, "--tracked").status, 0, "the tree is clean again");
    const r = scan(dir, "--range", `${base}..HEAD`);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const out = r.stdout + r.stderr;
    assert.match(out, /forbidden-path/);
    assert.match(out, /coordinates/);
    assert.ok(out.includes(bad.slice(0, 8)), "names the commit that added it");
    noRawValue(out, J("13.7", "4561"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI --staged (pre-commit hook) blocks a staged Thai ID and passes a clean index", () => {
  const dir = tempRepo();
  try {
    writeFileSync(join(dir, "ok.txt"), "nothing personal\n");
    git(dir, "add", "ok.txt");
    assert.equal(scan(dir, "--staged").status, 0);
    writeFileSync(join(dir, "form.txt"), `เลขประจำตัว ${dashedId(ID_OK)}\n`);
    git(dir, "add", "form.txt");
    const r = scan(dir, "--staged");
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /thai-id/);
    noRawValue(r.stdout + r.stderr, ID_OK);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- this repository ----
test("this repository: no personal data in tracked files (synthetic fixtures only via tools/pii-allow.json)", () => {
  const r = spawnSync(process.execPath, [SCAN, "--tracked"], { cwd: REPO, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("allow-list: every entry names a tracked file, a kind (synthetic / public / false-positive), a reason and max counts", () => {
  const allow = JSON.parse(readFileSync(ALLOW, "utf8"));
  assert.ok(Array.isArray(allow.entries) && allow.entries.length > 0);
  const tracked = new Set(spawnSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8" }).stdout.split("\0"));
  for (const e of allow.entries) {
    assert.ok(tracked.has(e.path), `allow-list path is not tracked: ${e.path}`);
    assert.ok(["synthetic", "public", "false-positive"].includes(e.kind), `${e.path}: kind`);
    assert.ok(typeof e.reason === "string" && e.reason.length >= 10, `${e.path}: reason`);
    assert.ok(e.types && Object.keys(e.types).length, `${e.path}: types`);
    for (const [t, n] of Object.entries(e.types)) assert.ok(Number.isInteger(n) && n > 0, `${e.path}: ${t} max`);
    assert.ok(!e.types["forbidden-path"], "a forbidden path can never be allow-listed");
  }
});

test("wiring: CI runs --tracked and --range on the pushed commits; .wrangler/ is ignored; pre-commit hook exists", () => {
  const ci = readFileSync(join(REPO, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(ci, /node tools\/pii-scan\.mjs --tracked/);
  assert.match(ci, /node tools\/pii-scan\.mjs --range/);
  const ignore = readFileSync(join(REPO, ".gitignore"), "utf8").split("\n").map(s => s.trim());
  assert.ok(ignore.includes(".wrangler/"), ".gitignore lists .wrangler/");
  const hook = join(REPO, "tools", "git-hooks", "pre-commit");
  assert.ok(existsSync(hook), "tools/git-hooks/pre-commit");
  assert.match(readFileSync(hook, "utf8"), /pii-scan\.mjs --staged/);
});
