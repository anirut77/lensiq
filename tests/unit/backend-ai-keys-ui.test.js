"use strict";
// tests/unit/backend-ai-keys-ui.test.js — the admin "AI provider keys" card: every adk.* text in English and Chinese, no
// installer wording left in the back office, the key never put into storage, the URL or the page source.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const dict = (file, lang) => { const w = {}; w.window = w; vm.runInNewContext(read(file), w); return Object.assign({}, ...w.LQI18N_Q.map(d => d[lang] || {})); };

test("every adk.* key used by admin.html / admin.js has English and Chinese text without Thai", () => {
  const en = dict("i18n/en-admin.js", "en"), zh = dict("i18n/zh-admin.js", "zh");
  const used = new Set([...read("admin.html").matchAll(/data-i18n="(adk\.[^"]+)"/g), ...read("admin.js").matchAll(/G\("(adk\.[^"]+)"/g)].map(m => m[1]));
  assert.ok(used.size >= 30, "keys found: " + used.size);
  for (const k of used) {
    assert.ok(en[k] && !/[ก-๙]/.test(en[k]), "en " + k);
    assert.ok(zh[k] && !/[ก-๙]/.test(zh[k]) && /[㐀-鿿]/.test(zh[k]), "zh " + k);
  }
  for (const k of ["adk.dlg.set", "adk.saved", "adk.test.okMsg"]) { assert.match(en[k], /\{p\}/); assert.match(zh[k], /\{p\}/); }
});

test("no installer wording in the back office text (commands, secret names, config names)", () => {
  const js = read("admin.js").split("\n").filter(l => !/^\s*(\/\/|\/?\*)/.test(l)).join("\n");
  const strings = [...js.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]).filter(s => /[ก-๙]/.test(s) || /\s/.test(s));
  for (const s of strings) assert.ok(!/wrangler|secret put|Worker secret|SECRETS_KEK|TURNSTILE_|GOOGLE_CLIENT_ID|_API_KEY|fail closed/.test(s), "installer wording: " + s.slice(0, 80));
  const en = dict("i18n/en-admin.js", "en"), zh = dict("i18n/zh-admin.js", "zh");
  for (const v of [...Object.values(en), ...Object.values(zh)]) assert.ok(!/wrangler|Worker secret|ANTHROPIC_API_KEY|legacyKeyStore/.test(v), "installer wording: " + v.slice(0, 80));
});

test("the key dialog: password fields, no autocomplete of the key, values cleared, sent with noReauth only in the request body", () => {
  const html = read("admin.html"), js = read("admin.js");
  assert.match(html, /<input name="key" type="text" class="adk-mask" autocomplete="off"/, "masked, but not a site password the browser offers to save");
  assert.match(js, /call\("\/ai\/keys\/" \+ id, \{ method: what === "remove" \? "DELETE" : "PUT", body: body, noReauth: true \}\)/);
  assert.match(js, /var done = function \(\) \{ f\.reset\(\); keyDlg = null; d\.close\(\); \};/);
  assert.match(js, /\$\("adkDlg"\)\.addEventListener\("close", function \(\) \{ \/\*\* @type \{any\} \*\/ \(\$\("adkForm"\)\)\.reset\(\);/, "Esc / any close clears the form");
  assert.match(js, /f\.password\.value = ""; f\.totp\.value = ""; f\.key\.value = "";/, "a refused attempt clears the key, the password and the code");
  assert.ok(!/localStorage\.setItem\([^)]*key/i.test(js.replace(/DEV_KEY/g, "")), "no key in storage");
});
