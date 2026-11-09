"use strict";
// tests/unit/backend-ai-admin-ui.test.js — round 17 P5 fixed test set: the admin "AI Gateway" section is wired (tab, panel,
// API paths), every adg.* key used by admin.html / admin.js has English and Chinese text, and the Worker serves the
// dictionaries the section needs (ADMIN_ASSETS + build-admin copy).
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const dict = (file, lang) => { const w = {}; w.window = w; vm.runInNewContext(read(file), w); return Object.assign({}, ...w.LQI18N_Q.map(d => d[lang] || {})); };

test("admin.html: AI Gateway tab + panel; admin.js calls the gateway admin API and re-auth on save", () => {
  const html = read("admin.html"), js = read("admin.js");
  assert.match(html, /data-tab="aigw"/);
  assert.match(html, /data-panel="aigw"/);
  for (const id of ["adgOn", "adgLegacy", "adgProv", "adgFeatures", "adgSave", "adgUsage", "adgEval", "adgLang"]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(js, /call\("\/ai\/gateway"\)/);
  assert.match(js, /call\("\/ai\/usage"\)/);
  assert.match(js, /call\("\/ai\/gateway", \{ method: "PUT"/);
  assert.ok(!/\.innerHTML\s*=/.test(js), "server strings rendered as text only");
  assert.match(html, /<script src="i18n\/zh-admin\.js/);
  assert.match(html, /<script src="lensiq-i18n\.js/);
});

test("every adg.* key used by admin.html / admin.js exists in en-admin.js and zh-admin.js (no Thai in them)", () => {
  const en = dict("i18n/en-admin.js", "en"), zh = dict("i18n/zh-admin.js", "zh");
  const keys = (src, re) => [...src.matchAll(re)].map(m => m[1]);
  const js = read("admin.js");
  const used = new Set([...keys(read("admin.html"), /data-i18n="(adg\.[^"]+)"/g), ...keys(js, /G\("(adg\.[^"]+)"/g), ...keys(js, /"(adg\.f\.[a-z]+)"/g)]);
  assert.ok(used.size > 30, "keys found: " + used.size);
  for (const k of used) { assert.ok(en[k], "en " + k); assert.ok(zh[k], "zh " + k); }
  for (const v of [...Object.values(en), ...Object.values(zh)]) assert.ok(!/[ก-๙]/.test(v), "Thai left in " + v);
});

test("the Worker serves the admin dictionaries; build-admin copies them", async () => {
  const { ADMIN_ASSETS } = await import(join(ROOT, "backend", "src", "index.js"));
  for (const p of ["/lensiq-i18n.js", "/i18n/zh-admin.js", "/i18n/en-admin.js"]) assert.ok(ADMIN_ASSETS.has(p), p);
  const b = read("backend/scripts/build-admin.mjs");
  assert.match(b, /zh-admin\.js/); assert.match(b, /en-admin\.js/); assert.match(b, /lensiq-i18n\.js/);
});
