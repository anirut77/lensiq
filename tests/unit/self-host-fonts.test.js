// tests/unit/self-host-fonts.test.js — tools/self-host-fonts.mjs: Google Fonts <link>s removed, CSP meta without Google
// origins, idempotent; styles.css declares the vendored Prompt faces and every referenced woff2 + OFL.txt exists.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync, statSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const tool = () => import(join(ROOT, "tools", "self-host-fonts.mjs"));

const PAGE = [
  "<!doctype html>", "<html lang=\"th\">", "<head>", "<meta charset=\"utf-8\">",
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com\">",
  "<title>x</title>",
  "<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">",
  "  <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>",
  "<link href=\"https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap\" rel=\"stylesheet\">",
  "<link rel=\"stylesheet\" href=\"styles.css\">", "</head>", "<body></body>", "</html>", ""
].join("\n");

test("transform() removes every Google Fonts link and origin, keeps the rest, is idempotent", async () => {
  const { transform, referencesGoogle } = await tool();
  assert.ok(referencesGoogle(PAGE));
  const out = transform(PAGE);
  assert.equal(transform(out), out, "second run is a no-op");
  assert.ok(!referencesGoogle(out), out);
  assert.match(out, /<link rel="stylesheet" href="styles.css\?v=8">/, "styles.css cache-busted");
  assert.equal(transform(out.replace("styles.css?v=8", "styles.css?v=12")).includes("styles.css?v=12"), true, "newer version kept");
  assert.match(out, /<title>x<\/title>\n<link rel="stylesheet"/, "no blank lines left behind");
  assert.match(out, /font-src 'self' data:/);
});

test("CRLF pages keep CRLF", async () => {
  const { transform } = await tool();
  const out = transform(PAGE.replace(/\n/g, "\r\n"));
  assert.ok(!/[^\r]\n/.test(out));
  assert.ok(!/fonts\.g/.test(out));
});

test("styles.css self-hosts Prompt: woff2 + font-display:swap + unicode-range, files and licence present", () => {
  const css = readFileSync(join(ROOT, "styles.css"), "utf8");
  const all = css.match(/@font-face\{[^}]*\}/g) || [];
  // Inter (SIL OFL, latin subset) is the Latin companion for the header / English pages
  const inter = all.filter(f => /font-family:Inter/.test(f));
  for (const f of inter) {
    assert.match(f, /font-display:swap/); assert.match(f, /unicode-range:/);
    const url = /url\(([^)]+)\)/.exec(f)[1];
    assert.match(url, /^vendor\/fonts\/inter\/inter-latin-wght-normal\.woff2$/);
    assert.equal(readFileSync(join(ROOT, url)).subarray(0, 4).toString("latin1"), "wOF2", url + " is woff2");
    assert.match(readFileSync(join(ROOT, "vendor/fonts/inter/OFL.txt"), "utf8"), /SIL Open Font License/i);
  }
  const faces = all.filter(f => !inter.includes(f));
  assert.ok(faces.length >= 15, "faces: " + faces.length);
  for (const f of faces) {
    assert.match(f, /font-family:Prompt/);
    assert.match(f, /font-display:swap/);
    assert.match(f, /unicode-range:/);
    const url = /url\(([^)]+)\)/.exec(f)[1];
    assert.match(url, /^vendor\/fonts\/prompt\/prompt-\d00-(thai|latin|latin-ext)\.woff2$/);
    const p = join(ROOT, url);
    assert.ok(existsSync(p) && statSync(p).size > 2000, url);
    assert.equal(readFileSync(p).subarray(0, 4).toString("latin1"), "wOF2", url + " is woff2");
  }
  for (const w of [300, 400, 500, 600, 700]) assert.ok(faces.some(f => f.includes(`prompt-${w}-thai`)), "thai " + w);
  assert.match(readFileSync(join(ROOT, "vendor/fonts/prompt/OFL.txt"), "utf8"), /SIL Open Font License/i);
  assert.ok(!/fonts\.g(oogleapis|static)/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "no Google URL in CSS rules");
  // zh: no CJK webfont is vendored; the zh stack must reach OS CJK fonts
  assert.match(css, /html\[lang\^=zh\] body\{font-family:Prompt,"PingFang SC"[^}]*"Noto Sans CJK SC"/);
});
