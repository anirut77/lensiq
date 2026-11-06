// tests/unit/i18n.test.js — lensiq-i18n.js (window.LQI18N) pure API: add/t/vars/fallbacks, language normalisation,
// persistence in localStorage "lq-lang", "lq-lang" event, queued dictionaries, and that i18n/zh-common.js covers every
// nav.js menu entry (keys nav.<page>.title|desc, nav.group.<id>, nav.cta).
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");
const CORE = readFileSync(join(ROOT, "lensiq-i18n.js"), "utf8");
const COMMON = readFileSync(join(ROOT, "i18n", "zh-common.js"), "utf8");

function sandbox({ stored = null, search = "", blockStorage = false, queueFirst = null } = {}) {
  const store = new Map(stored == null ? [] : [["lq-lang", stored]]);
  const events = [];
  const win = {
    location: { search },
    localStorage: blockStorage ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } }
      : { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    dispatchEvent: e => { events.push(e); return true; },
    URLSearchParams
  };
  win.window = win;
  const ctx = vm.createContext(win);
  if (queueFirst) vm.runInContext(queueFirst, ctx);
  vm.runInContext(CORE, ctx);
  return { win, I: win.LQI18N, store, events, ctx };
}

test("default Thai; t() falls back zh -> th -> key; {vars} filled", () => {
  const { I } = sandbox();
  assert.equal(I.lang, "th");
  I.add({ th: { "a.b": "สวัสดี {name}" }, zh: { "a.b": "你好 {name}" } });
  assert.equal(I.t("a.b", { name: "แอน" }), "สวัสดี แอน");
  assert.equal(I.t("missing.key"), "missing.key");
  assert.equal(I.t("ข้อความไทยเป็นคีย์"), "ข้อความไทยเป็นคีย์");
  I.setLang("zh");
  assert.equal(I.t("a.b", { name: "Ann" }), "你好 Ann");
  I.add("zh", { "only.th": undefined });
  I.add({ th: { "only.th": "ไทยเท่านั้น" } });
  assert.equal(I.t("only.th"), "ไทยเท่านั้น", "missing zh falls back to Thai");
  assert.equal(I.t("a.b", { other: 1 }), "你好 {name}", "unknown vars left as-is");
  assert.equal(I.t("a.b", null, "th"), "สวัสดี {name}", "explicit language");
  assert.equal(I.tf("nope", "ค่าเริ่ม {n}", { n: 2 }), "ค่าเริ่ม 2");
});

test("setLang normalises codes, persists to localStorage, emits lq-lang with prev", () => {
  const { I, store, events } = sandbox();
  assert.equal(I.setLang("zh-CN"), "zh");
  assert.equal(store.get("lq-lang"), "zh");
  assert.equal(events.length, 1);
  assert.deepEqual({ ...events[0].detail }, { lang: "zh", prev: "th", init: false });
  assert.equal(events[0].type, "lq-lang");
  I.lang = "TH";
  assert.equal(I.lang, "th");
  assert.equal(store.get("lq-lang"), "th");
  assert.equal(I.setLang("fr"), "th", "unsupported language ignored");
  assert.equal(events.length, 2);
  I.setLang("th");
  assert.equal(events.length, 2, "no event when unchanged");
});

test("start-up: stored language applied with an init event; ?lang= overrides and persists; blocked storage is fine", () => {
  const a = sandbox({ stored: "zh" });
  assert.equal(a.I.lang, "zh");
  assert.equal(a.events.length, 1);
  assert.equal(a.events[0].detail.init, true);
  const b = sandbox({ stored: "zh", search: "?lang=th" });
  assert.equal(b.I.lang, "th");
  assert.equal(b.store.get("lq-lang"), "th");
  const c = sandbox({ blockStorage: true, search: "?x=1" });
  assert.equal(c.I.lang, "th");
  assert.equal(c.I.setLang("zh"), "zh");
});

test("dictionaries queued before the core loads are drained; later pushes go straight in", () => {
  const { I, win, ctx } = sandbox({ queueFirst: '(window.LQI18N_Q = window.LQI18N_Q || []).push({ zh: { "q.k": "队列" } });' });
  assert.equal(I.t("q.k", null, "zh"), "队列");
  vm.runInContext('(window.LQI18N_Q = window.LQI18N_Q || []).push({ zh: { "q.k2": "之后" } });', ctx);
  assert.equal(win.LQI18N.t("q.k2", null, "zh"), "之后");
  assert.ok(!("x" in I._dicts.zh), "only strings are merged");
  I.add({ zh: { bad: 5 } });
  assert.equal(I.has("bad", "zh"), false);
});

test("loading the core twice keeps the first instance", () => {
  const s = sandbox();
  s.I.add({ zh: { k: "一" } });
  vm.runInContext(CORE, s.ctx);
  assert.equal(s.win.LQI18N, s.I);
  assert.equal(s.win.LQI18N.t("k", null, "zh"), "一");
});

test("zh-common.js translates every nav.js menu entry", () => {
  const { I, ctx } = sandbox();
  vm.runInContext(COMMON, ctx);
  const nav = readFileSync(join(ROOT, "nav.js"), "utf8");
  const hrefs = [...nav.matchAll(/\{ href: "([a-z-]+)\.html", title: "[^"]+", desc: "[^"]+" \}/g)].map(m => m[1]);
  assert.ok(hrefs.length >= 15, "menu parsed: " + hrefs.length);
  for (const h of hrefs) {
    assert.ok(I.has(`nav.${h}.title`, "zh"), `nav.${h}.title`);
    assert.ok(I.has(`nav.${h}.desc`, "zh"), `nav.${h}.desc`);
  }
  for (const g of [...nav.matchAll(/label: "[^"]+", id: "([a-z]+)"/g)].map(m => m[1])) assert.ok(I.has(`nav.group.${g}`, "zh"), g);
  for (const k of ["nav.cta", "nav.open", "nav.close", "nav.skip", "models.loading", "vault.insecure"]) assert.ok(I.has(k, "zh"), k);
});

test("index.html: every data-i18n key has a Chinese entry; home.js keys too", () => {
  const { I, ctx } = sandbox();
  vm.runInContext(COMMON, ctx);
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const keys = new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map(m => m[1]));
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of m[1].split(";")) keys.add(p.split(":")[1]);
  const js = readFileSync(join(ROOT, "home.js"), "utf8");
  for (const m of js.matchAll(/T\("([a-z.]+)"/g)) keys.add(m[1]);
  assert.ok(keys.size > 100, "keys: " + keys.size);
  const missing = [...keys].filter(k => !I.has(k, "zh"));
  assert.deepEqual(missing, []);
  assert.ok(!/\bAI\b/.test(I._dicts.zh["home.link.fortune"]) && !/AI/.test(html.match(/home\.link\.fortune">([^<]+)/)[1]), "no 'AI' on fortune labels");
  // placeholders in Thai defaults and Chinese match
  for (const m of js.matchAll(/T\("([a-z.]+)", "([^"]+)"/g)) {
    const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(ph(I._dicts.zh[m[1]]), ph(m[2]), m[1]);
  }
});
