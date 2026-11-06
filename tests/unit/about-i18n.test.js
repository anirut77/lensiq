// tests/unit/about-i18n.test.js — about.html (platform page): every data-i18n / data-i18n-attr key has a Chinese entry
// in i18n/zh-common.js; the header strings nav.js sets from JS (toggle, logo, language group) are translated; the page
// passes the CSP lint and loads no third-party origin.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");
function zh() {
  const win = { location: { search: "" }, localStorage: { getItem: () => null, setItem() {} }, URLSearchParams };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(readFileSync(join(ROOT, "lensiq-i18n.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "i18n", "zh-common.js"), "utf8"), ctx);
  return win.LQI18N;
}
const keysOf = html => {
  const keys = new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]));
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of m[1].split(";")) keys.add(p.split(":")[1]);
  return keys;
};

test("about.html: all keys translated, Chinese has no Thai, no third-party origin", async () => {
  const I = zh();
  const html = readFileSync(join(ROOT, "about.html"), "utf8");
  const keys = keysOf(html);
  assert.ok(keys.size >= 40, "keys " + keys.size);
  const missing = [...keys].filter(k => !I.has(k, "zh"));
  assert.deepEqual(missing, []);
  for (const k of keys) assert.ok(!/[฀-๿]/.test(I._dicts.zh[k]), "Thai inside zh entry " + k);
  const { lint } = await import(join(ROOT, "tools", "csp-meta.mjs"));
  assert.deepEqual(lint(html), []);
  assert.ok(!/fonts\.g(oogleapis|static)/.test(html));
  assert.match(readFileSync(join(ROOT, "index.html"), "utf8"), /href="about.html" data-i18n="foot.about"/, "linked from the landing footer");
});

test("nav.js: header strings set from JS or attributes have Chinese keys", () => {
  const I = zh();
  const nav = readFileSync(join(ROOT, "nav.js"), "utf8");
  const keys = new Set([...nav.matchAll(/\bT\("([a-z.]+)"/g)].map(m => m[1]));
  for (const m of nav.matchAll(/data-i18n(?:-attr)?="(?:[a-z-]+:)?([a-z.]+)"/g)) keys.add(m[1]);
  for (const k of ["nav.home", "nav.lang", "nav.open", "nav.close", "nav.skip", "nav.menu", "models.loading"]) assert.ok(keys.has(k), "nav.js uses " + k);
  const missing = [...keys].filter(k => !I.has(k, "zh"));
  assert.deepEqual(missing, []);
  assert.ok(!/aria-label="ภาษา \/ 语言"/.test(nav), "no mixed-language label in the shared header");
});
