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
