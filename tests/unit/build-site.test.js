// tests/unit/build-site.test.js — tools/build-site.mjs: outside a git checkout the build fails unless --allow-no-git;
// in that mode the folder walk still drops faceparse-*.onnx and everything the root .gitignore matches.
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { join, dirname } = require("node:path");
const { tmpdir } = require("node:os");
const { spawnSync } = require("node:child_process");

const ROOT = join(__dirname, "..", "..");
const TOOL = join(ROOT, "tools", "build-site.mjs");
const tool = () => import(TOOL);

function fixture() {
  const d = mkdtempSync(join(tmpdir(), "lq-site-"));
  const put = (rel, body = "x") => { mkdirSync(dirname(join(d, rel)), { recursive: true }); writeFileSync(join(d, rel), body); };
  put(".gitignore", "# local\nlogs/\n/secret.js\n*.bak\nvendor/models/faceparse-*.onnx\nvendor/tmp/**\n!vendor/tmp/keep.js\n");
  for (const f of ["index.html", "page.js", "page.css", "secret.js", "i18n/zh.js", "vendor/lib.js", "vendor/models/face.onnx",
    "vendor/models/faceparse-resnet.onnx", "vendor/deep/faceparse-x.onnx", "vendor/old.js.bak", "vendor/tmp/a.js", "vendor/tmp/keep.js",
    "logs/run.html", "server.py", "node_modules/x/index.js", "LICENSE"]) put(f);
  return d;
}

test("parseGitignore: anchoring, dir-only, globs, ** and negation", async () => {
  const { parseGitignore } = await tool();
  const ig = parseGitignore("# c\n\nlogs/\n/top.js\n*.bak\nvendor/models/faceparse-*.onnx\na/**/b.js\n!keep.bak\n");
  assert.equal(ig("logs", true), true);
  assert.equal(ig("sub/logs", true), true, "unanchored dir pattern matches at any depth");
  assert.equal(ig("logs", false), false, "trailing / matches directories only");
  assert.equal(ig("top.js"), true);
  assert.equal(ig("sub/top.js"), false, "leading / anchors to the root");
  assert.equal(ig("x/y.bak"), true);
  assert.equal(ig("keep.bak"), false, "later ! re-includes");
  assert.equal(ig("vendor/models/faceparse-resnet34.onnx"), true);
  assert.equal(ig("other/vendor/models/faceparse-resnet34.onnx"), false, "a pattern with an inner / is anchored");
  assert.equal(ig("a/b.js"), true); assert.equal(ig("a/x/y/b.js"), true);
});

test("the repo's own .gitignore ignores the face-parsing weights", async () => {
  const { parseGitignore } = await tool();
  const ig = parseGitignore(require("node:fs").readFileSync(join(ROOT, ".gitignore"), "utf8"));
  assert.equal(ig("vendor/models/faceparse-resnet34.onnx"), true);
  assert.equal(ig("_site", true), true);
});

test("outside a git checkout: publishedFiles throws unless allowNoGit", async () => {
  const { publishedFiles, NotAGitCheckout, isGitCheckout } = await tool();
  const d = fixture();
  try {
    assert.equal(isGitCheckout(d), false);
    assert.throws(() => publishedFiles(d), NotAGitCheckout);
    const files = publishedFiles(d, { allowNoGit: true });
    assert.deepEqual(files, ["LICENSE", "i18n/zh.js", "index.html", "page.css", "page.js", "vendor/lib.js", "vendor/models/face.onnx", "vendor/tmp/keep.js"]);
    assert.ok(!files.some(f => /faceparse-/.test(f)), "faceparse weights never published, even outside .gitignore's path");
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("CLI: exit 1 without --allow-no-git, builds with it (copy of the tool in a non-git folder)", () => {
  const d = fixture();
  try {
    mkdirSync(join(d, "tools"));
    writeFileSync(join(d, "tools", "build-site.mjs"), require("node:fs").readFileSync(TOOL));
    const run = (...a) => spawnSync(process.execPath, [join(d, "tools", "build-site.mjs"), ...a], { cwd: d, encoding: "utf8" });
    const r1 = run("--list");
    assert.equal(r1.status, 1);
    assert.match(r1.stderr, /not a git checkout/);
    assert.doesNotMatch(r1.stderr, /fatal:/, "git's own error text is not leaked");
    const r2 = run("--list", "--allow-no-git");
    assert.equal(r2.status, 0, r2.stderr);
    assert.doesNotMatch(r2.stdout, /faceparse|secret\.js|logs\/|\.bak/);
    assert.match(r2.stdout, /8 file\(s\)/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("--customer: the output lensiq-config.js is locked and passes go-live config.profile / config.age_gender", async () => {
  const { lockCustomerConfig, customerConfigProblems, applyCustomerLock, CUSTOMER_LOCK } = await tool();
  const { readFileSync } = require("node:fs");
  const vm = require("node:vm");
  const src = readFileSync(join(ROOT, "lensiq-config.js"), "utf8");
  // the repo file (public demo site) stays unlocked on purpose: both items are open there
  assert.deepEqual((await customerConfigProblems(src)).filter(x => /^config\./.test(x)).sort(), ["config.age_gender is warn", "config.profile is warn"]);
  const locked = lockCustomerConfig(src);
  assert.equal(lockCustomerConfig(locked), locked, "idempotent");
  assert.ok(locked.startsWith(CUSTOMER_LOCK) && locked.endsWith(src), "repo text kept, lock prepended");
  assert.deepEqual(await customerConfigProblems(locked), []);
  // a device whose user switched the research demo on (localStorage) still gets customer mode, models off
  const run = store => {
    const window = {};
    const localStorage = { getItem: k => (k in store ? store[k] : null), setItem() {} };
    vm.runInNewContext(locked, { window, localStorage, location: { pathname: "/" } }, { timeout: 1000 });
    return window;
  };
  for (const store of [{}, { "lq-research-demo": "on" }]) {
    const w = run(store);
    assert.equal(w.LENSIQ_PROFILE, "commercial");
    assert.equal(w.LENSIQ_RESEARCH.locked, "operator");
    assert.equal(w.LENSIQ_RESEARCH.on, false);
    assert.equal(w.LENSIQ_AGE_GENDER, false); assert.equal(w.LENSIQ_EXPRESSION, false); assert.equal(w.LENSIQ_FACEPARSE, false);
  }
  // a later line that turns a model back on is caught
  assert.ok((await customerConfigProblems(locked + "\nwindow.LENSIQ_AGE_GENDER = true;\n")).some(x => /age_gender|AGE_GENDER/.test(x)));
  // applyCustomerLock on a site folder: writes the locked copy, fails closed without lensiq-config.js
  const d = mkdtempSync(join(tmpdir(), "lq-cust-"));
  try {
    await assert.rejects(applyCustomerLock(d), /lensiq-config\.js is not in the site/);
    writeFileSync(join(d, "lensiq-config.js"), src);
    await applyCustomerLock(d);
    assert.equal(readFileSync(join(d, "lensiq-config.js"), "utf8"), locked);
    writeFileSync(join(d, "lensiq-config.js"), src + "\nwindow.LENSIQ_FACEPARSE = true;\n");
    await assert.rejects(applyCustomerLock(d), /customer lock check failed/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("--customer: LENSIQ_EXPRESSION turned back on later in the file fails the check", async () => {
  const { lockCustomerConfig, customerConfigProblems } = await tool();
  const { readFileSync } = require("node:fs");
  const locked = lockCustomerConfig(readFileSync(join(ROOT, "lensiq-config.js"), "utf8"));
  assert.deepEqual(await customerConfigProblems(locked), []);
  assert.ok((await customerConfigProblems(locked + "\nwindow.LENSIQ_EXPRESSION = true;\n")).includes("LENSIQ_EXPRESSION is not false"));
});

test("--customer CLI: never the public test-site config; API-less without --site-config; tester gate off", () => {
  const { readFileSync, existsSync, readdirSync } = require("node:fs");
  const pub = JSON.parse(readFileSync(join(ROOT, "deploy", "public-site.json"), "utf8"));
  const testHost = pub.apiBase ? new URL(pub.apiBase).host : null;
  const run = (...a) => spawnSync(process.execPath, [TOOL, ...a], { cwd: ROOT, encoding: "utf8" });
  const texts = dir => {
    const out = [];
    const walk = d => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p); else if (/\.(html|js|mjs|css|json)$/.test(e.name)) out.push(readFileSync(p, "utf8"));
      }
    };
    walk(dir); return out.join("\n");
  };
  const tmp = mkdtempSync(join(tmpdir(), "lq-custcli-"));
  try {
    const out = join(tmp, "a");
    const r = run("--customer", "--out", out);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(join(out, "lensiq-site-config.js")), "no generated site config");
    const all = texts(out);
    if (testHost) assert.ok(!all.includes(testHost), "test API host nowhere in HTML / JS / CSP");
    if (pub.turnstileSiteKey) assert.ok(!all.includes(pub.turnstileSiteKey), "test Turnstile key absent");
    assert.ok(!/^\s*window\.LENSIQ_TESTER_GATE\s*=\s*true/m.test(all), "no tester gate (statement; the lensiq-tester.js comment names it)");
    assert.ok(!/workers\.dev/.test(all), "no workers.dev origin");
    assert.match(readFileSync(join(out, "lensiq-config.js"), "utf8"), /^\/\* customer bundle/);
    // an explicit, separate customer config is applied, with the tester gate forced off
    const cfg = join(tmp, "customer-site.json");
    writeFileSync(cfg, JSON.stringify({ apiBase: "https://api.customer.example", pages: ["medicine.html"], testerGate: true }));
    const out2 = join(tmp, "b");
    const r2 = run("--customer", "--site-config", cfg, "--out", out2);
    assert.equal(r2.status, 0, r2.stderr);
    const js = readFileSync(join(out2, "lensiq-site-config.js"), "utf8");
    assert.match(js, /https:\/\/api\.customer\.example/);
    assert.match(js, /LENSIQ_TESTER_GATE = false/);
    assert.match(r2.stdout, /customer-site\.json -> API https:\/\/api\.customer\.example/, "log names the customer file");
    assert.ok(!/public-site\.json -> API/.test(r2.stdout));
    // refused by content: test-looking apiBase, or the public test Turnstile key, under any file name
    const bad = [
      { apiBase: "https://lensiq-api.someone.workers.dev", pages: ["medicine.html"] },
      { apiBase: "https://api-test.customer.example", pages: ["medicine.html"] },
      ...(pub.turnstileSiteKey ? [{ apiBase: "https://api.customer.example", turnstileSiteKey: pub.turnstileSiteKey, pages: ["medicine.html"] }] : []),
      ...(pub.apiBase ? [pub] : [])
    ];
    bad.forEach((c, i) => {
      const f = join(tmp, "bad-" + i + ".json");
      writeFileSync(f, JSON.stringify(c));
      const rb = run("--customer", "--site-config", f, "--out", join(tmp, "bad-out-" + i));
      assert.equal(rb.status, 1, "refused: " + JSON.stringify(c));
      assert.ok(!existsSync(join(tmp, "bad-out-" + i)), "nothing built");
    });
    // --site-config as the last argument, or followed by another flag: exit 1
    assert.equal(run("--customer", "--out", join(tmp, "e"), "--site-config").status, 1);
    assert.equal(run("--customer", "--site-config", "--out", join(tmp, "f")).status, 1);
    if (testHost) assert.ok(!texts(out2).includes(testHost));
    // refused: the public test-site file as a customer config, and --site-config without --customer
    assert.equal(run("--customer", "--site-config", "deploy/public-site.json", "--out", join(tmp, "c")).status, 1);
    assert.equal(run("--site-config", cfg, "--out", join(tmp, "d")).status, 1);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
