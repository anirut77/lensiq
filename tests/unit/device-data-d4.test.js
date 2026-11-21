"use strict";
// tests/unit/device-data-d4.test.js — owner decision D-4 (2026-11-19, BOARD-0800-2026-11-19 line ~103): "data export page".
// Locked BEFORE the product code (evals-locks/device-data-d4.sha256). Re-lock relock1 (owner item 215, 2026-11-21 09:10,
// STRICTER): the medicine look-up history (lq-med-history) is never exportable and never importable until counsel answers. docs/PRODUCTION-MOVE-PLAN.md §2.7: what LENSIQ keeps
// in a browser belongs to that web address; when the site moves, the user saves it to a file on the old address and loads
// it on the new one. No server is involved.
//
// lensiq-device-data.js (global LQDeviceData) + the slot on privacy.html. Switch: window.LENSIQ_DEVICE_EXPORT, OFF unless
// exactly true, and always off in a customer bundle (LENSIQ_RESEARCH_DEMO === false, the operator lock).
//   D1 switch: off by default; on only with exactly true; customer lock wins; the repo config does not turn it on
//   D2 only an allow-list of the user's OWN settings and records; business stores, sign-in tokens, the tester code,
//      consents, owner / admin keys and anything that is not on the list are never read into a file
//   D3 values are checked: wrong shapes, images (data: / blob: URLs) and over-long values are left out
//   D4 groups: settings + 18+ choice by default; records (pet cards) only when ticked
//   D12 (owner item 215) the medicine look-up history is excluded: not on the allow-list, not in any file, not loaded from
//      any file, no UI string names it
//   D5 the file: format, version, time, groups, items; nothing else (no origin path, no user agent, no device id)
//   D6 import: strict; unknown keys are never written; a bad file writes nothing; size limit
//   D7 import of the 18+ choice needs the person to confirm 18+ again on this device
//   D8 no network in the module (no fetch / XHR / beacon / WebSocket / import()), no eval
//   D9 TH / EN / ZH complete: every UI string and every item label in all three; EN / ZH carry no Thai
//   D10 privacy.html loads the module after lensiq-config.js and has one hidden slot
//   D11 PDPA note for counsel
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const FILE = join(ROOT, "lensiq-device-data.js");
const D = () => require(FILE);
const THAI = /[฀-๿]/;

/** a localStorage stand-in */
function store(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); },
    key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m
  };
}
const ALL = {
  "lq-lang": "en", "lq-sol-filter": "pilot", "lq-nut-hide-kcal": "1", "lq-merit-tradition": "chinese_folk",
  "lq-fortune-straight": JSON.stringify({ adult: true, straight: false }),
  "lq-med-history": JSON.stringify([{ at: 1763600000000, kind: "reg", q: "1A 844/39", r: "TH" }]),
  "lq-pet-zodiac-v1": JSON.stringify({ v: 1, found: { rat: "2026-11-20" } }),
  // never exported
  "lq-member-session": "tok-canary-abc", "lq-tester": "tester-canary-xyz-123456", "lq-owner": "owner-canary", "lq-admin-dev": "1",
  "lq-ai-consent": "{\"pc_fields\":true}", "lq-leads": "[]", "lq-pending-claims": "[]", "lq-research-demo": "on", "lq-profile": "demo",
  "lq-report-log": "[]", "lq-guest-reads": "3", "lq-camcap": "{}", "lensiq-timeclock": "{\"emp\":[]}", "lensiq-exam": "{}",
  "lensiq-vault": "{}", "att-settings": "{}", "lqcr-day": "{}", "lq-i18n-debug": "1", "random-other": "x"
};

test("D1 switch: off by default, on only with exactly true, customer lock wins; the repo config does not turn it on", () => {
  const M = D();
  assert.equal(M.enabled({}), false);
  for (const v of [1, "true", "1", "on", {}, null]) assert.equal(M.enabled({ LENSIQ_DEVICE_EXPORT: v }), false, String(v));
  assert.equal(M.enabled({ LENSIQ_DEVICE_EXPORT: true }), true);
  assert.equal(M.enabled({ LENSIQ_DEVICE_EXPORT: true, LENSIQ_RESEARCH_DEMO: false }), false, "customer bundle (operator lock)");
  assert.equal(M.enabled({ LENSIQ_DEVICE_EXPORT: true, LENSIQ_RESEARCH_DEMO: true }), true);
  const cfg = readFileSync(join(ROOT, "lensiq-config.js"), "utf8");
  assert.doesNotMatch(cfg, /LENSIQ_DEVICE_EXPORT\s*=\s*true/, "repo config never switches it on");
});

test("D2 only the allow-list is read: own settings and records; everything else stays out", () => {
  const M = D();
  const keys = M.ITEMS.map(i => i.key).sort();
  assert.deepEqual(keys, ["lq-fortune-straight", "lq-lang", "lq-merit-tradition", "lq-nut-hide-kcal", "lq-pet-zodiac-v1", "lq-sol-filter"]);
  for (const k of ["lq-member-session", "lq-tester", "lq-owner", "lq-admin-dev", "lq-ai-consent", "lq-leads", "lq-pending-claims",
    "lq-research-demo", "lq-profile", "lq-report-log", "lq-guest-reads", "lq-camcap", "lq-med-history"]) assert.ok(M.EXCLUDED.includes(k), "documented exclusion: " + k);
  const r = M.collect(store(ALL), ["settings", "age", "records"]);
  assert.deepEqual(Object.keys(r.items).sort(), keys);
  const text = M.serialize(M.build(store(ALL), ["settings", "age", "records"], 1763700000000));
  for (const canary of ["tok-canary-abc", "tester-canary", "owner-canary", "emp", "pc_fields", "random-other", "lensiq-timeclock", "lq-member-session",
    "lq-med-history", "1A 844/39"]) {
    assert.ok(!text.includes(canary), "never in the file: " + canary);
  }
});

test("D3 values are checked: wrong shapes, images and over-long values are left out", () => {
  const M = D();
  const bad = {
    "lq-lang": "fr", "lq-sol-filter": "<b>", "lq-nut-hide-kcal": "yes", "lq-merit-tradition": "other",
    "lq-fortune-straight": JSON.stringify({ adult: "yes" }),
    "lq-med-history": JSON.stringify([{ at: 1, kind: "reg", q: "data:image/png;base64,iVBORw0KGgo=", r: "" }]),
    "lq-pet-zodiac-v1": "x".repeat(70000)
  };
  const r = M.collect(store(bad), ["settings", "age", "records"]);
  assert.deepEqual(r.items, {});
  // every listed key with a bad value is skipped (6 listed keys); lq-med-history is not listed, so it is neither read nor skipped
  // relock2: skipped entries are {key, why} objects (relock1 compared them with plain strings, which no product can meet)
  assert.equal(r.skipped.length, 6);
  assert.deepEqual(r.skipped.map(s => s.key).sort(), ["lq-fortune-straight", "lq-lang", "lq-merit-tradition", "lq-nut-hide-kcal", "lq-pet-zodiac-v1", "lq-sol-filter"]);
  assert.ok(r.skipped.every(s => s.why === "invalid"), "every skip is for an invalid value");
  assert.equal(M.valueOk("lq-med-history", JSON.stringify([{ at: 1, kind: "x", q: "blob:https://a/b", r: "" }])), false, "blob: URL");
  assert.equal(M.valueOk("lq-med-history", JSON.stringify([{ at: 1, kind: "x", q: { nested: 1 }, r: "" }])), false, "nested object");
  assert.equal(M.valueOk("lq-fortune-straight", JSON.stringify({ adult: true, straight: true, extra: 1 })), false, "extra field");
  assert.equal(M.valueOk("lq-pet-zodiac-v1", JSON.stringify({ v: 1, found: { rat: "20-11-2026" } })), false, "date shape");
  assert.equal(M.valueOk("lq-lang", "th"), true);
  assert.equal(M.valueOk("not-listed", "th"), false);
});

test("D4 groups: settings and the 18+ choice by default; records only when ticked", () => {
  const M = D();
  assert.deepEqual(M.DEFAULT_GROUPS.slice().sort(), ["age", "settings"]);
  const g = Object.fromEntries(M.ITEMS.map(i => [i.key, i.group]));
  assert.deepEqual(g, { "lq-lang": "settings", "lq-sol-filter": "settings", "lq-nut-hide-kcal": "settings", "lq-merit-tradition": "settings",
    "lq-fortune-straight": "age", "lq-pet-zodiac-v1": "records" });
  const def = M.collect(store(ALL), M.DEFAULT_GROUPS);
  assert.ok(!("lq-med-history" in def.items) && !("lq-pet-zodiac-v1" in def.items), "records not by default");
  assert.ok("lq-lang" in def.items && "lq-fortune-straight" in def.items);
});

test("D5 the file carries format, version, time, groups and items only", () => {
  const M = D();
  const o = M.build(store(ALL), ["settings"], Date.UTC(2026, 10, 21, 1, 2, 3));
  assert.deepEqual(Object.keys(o).sort(), ["exportedAt", "format", "groups", "items", "version"]);
  assert.equal(o.format, "lensiq-device-data"); assert.equal(o.version, 1);
  assert.equal(o.exportedAt, "2026-11-21T01:02:03.000Z");
  assert.deepEqual(o.groups, ["settings"]);
  assert.deepEqual(o.items, { "lq-lang": "en", "lq-sol-filter": "pilot", "lq-nut-hide-kcal": "1", "lq-merit-tradition": "chinese_folk" });
  assert.match(M.fileName(Date.UTC(2026, 10, 21)), /^lensiq-device-data-2026-11-21\.json$/);
  assert.deepEqual(JSON.parse(M.serialize(o)), o);
});

test("D6 import: strict; unknown keys never written; a bad file writes nothing; size limit", () => {
  const M = D();
  const good = M.serialize(M.build(store(ALL), ["settings", "records"], 1763700000000));
  const p = M.parse(good);
  assert.equal(p.ok, true);
  assert.deepEqual(Object.keys(p.items).sort(), ["lq-lang", "lq-merit-tradition", "lq-nut-hide-kcal", "lq-pet-zodiac-v1", "lq-sol-filter"]);
  const st = store({ "lq-lang": "th" });
  const w = M.apply(st, p, { adultConfirmed: false });
  assert.deepEqual(w.written.sort(), Object.keys(p.items).sort());
  assert.equal(st.getItem("lq-lang"), "en");
  // unknown / excluded keys in a hand-made file: listed, never written
  const hostile = JSON.stringify({ format: "lensiq-device-data", version: 1, exportedAt: "2026-11-21T00:00:00.000Z", groups: ["settings"],
    items: { "lq-lang": "zh", "lq-member-session": "stolen", "lq-research-demo": "on", "__proto__": "x" } });
  const h = M.parse(hostile);
  assert.equal(h.ok, true);
  assert.deepEqual(Object.keys(h.items), ["lq-lang"]);
  assert.ok(h.unknown.includes("lq-member-session") && h.unknown.includes("lq-research-demo"));
  const st2 = store();
  M.apply(st2, h, { adultConfirmed: true });
  assert.equal(st2.getItem("lq-member-session"), null); assert.equal(st2.getItem("lq-research-demo"), null);
  assert.equal(st2.getItem("lq-lang"), "zh");
  // a listed key with a bad value: the whole file is refused, nothing written
  const badVal = JSON.stringify({ format: "lensiq-device-data", version: 1, exportedAt: "2026-11-21T00:00:00.000Z", groups: ["settings"],
    items: { "lq-lang": "en", "lq-sol-filter": "<script>" } });
  const b = M.parse(badVal);
  assert.equal(b.ok, false); assert.ok(b.invalid.includes("lq-sol-filter"));
  const st3 = store({ "lq-lang": "th" });
  assert.deepEqual(M.apply(st3, b, { adultConfirmed: true }).written, []);
  assert.equal(st3.getItem("lq-lang"), "th");
  for (const t of ["", "null", "[]", "{}", '{"format":"lensiq-backup","version":1,"items":{}}', '{"format":"lensiq-device-data","version":2,"items":{}}',
    '{"format":"lensiq-device-data","version":1,"items":[]}', "x".repeat(M.MAX_FILE + 1)]) {
    assert.equal(M.parse(t).ok, false, "refused: " + t.slice(0, 60));
  }
});

test("D7 the 18+ choice is written only after the person confirms 18+ again on this device", () => {
  const M = D();
  const p = M.parse(M.serialize(M.build(store(ALL), ["age"], 1763700000000)));
  assert.equal(p.ok, true); assert.equal(p.needsAdult, true);
  const a = store();
  const r = M.apply(a, p, { adultConfirmed: false });
  assert.equal(a.getItem("lq-fortune-straight"), null);
  assert.ok(r.skipped.includes("lq-fortune-straight"));
  const b = store();
  M.apply(b, p, { adultConfirmed: true });
  assert.deepEqual(JSON.parse(b.getItem("lq-fortune-straight")), { adult: true, straight: false });
  // not adult in the file: no confirmation needed
  const q = M.parse(M.serialize(M.build(store({ "lq-fortune-straight": JSON.stringify({ adult: false, straight: true }) }), ["age"], 1)));
  assert.equal(q.needsAdult, false);
});

test("D8 no network and no eval in the module", () => {
  const src = readFileSync(FILE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /\bimport\s*\(/, /\beval\s*\(/, /new\s+Function/, /\.src\s*=/, /indexedDB/]) {
    assert.doesNotMatch(src, re, String(re));
  }
});

test("D9 TH / EN / ZH complete; EN and ZH carry no Thai", () => {
  const M = D();
  const th = Object.keys(M.STR.th).sort();
  assert.ok(th.length >= 15, "UI strings present");
  for (const l of ["en", "zh"]) {
    assert.deepEqual(Object.keys(M.STR[l]).sort(), th, l + " has every key");
    for (const [k, v] of Object.entries(M.STR[l])) { assert.ok(String(v).trim(), l + "." + k + " not empty"); assert.doesNotMatch(String(v), THAI, l + "." + k); }
  }
  for (const v of Object.values(M.STR.th)) assert.ok(String(v).trim());
  for (const i of M.ITEMS) for (const l of ["th", "en", "zh"]) {
    assert.ok(i.label[l] && String(i.label[l]).trim(), i.key + " label " + l);
    if (l !== "th") assert.doesNotMatch(i.label[l], THAI, i.key + " " + l);
  }
  for (const g of ["settings", "age", "records"]) for (const l of ["th", "en", "zh"]) assert.ok(M.GROUP_LABEL[g][l], g + " " + l);
});

test("D10 privacy.html: one hidden slot, the module loaded after lensiq-config.js", () => {
  const html = readFileSync(join(ROOT, "privacy.html"), "utf8");
  assert.equal((html.match(/id="lqDeviceData"/g) || []).length, 1);
  assert.match(html, /<div id="lqDeviceData"[^>]*\bhidden\b/);
  const cfg = html.indexOf('<script src="lensiq-config.js'), mod = html.indexOf('<script src="lensiq-device-data.js?v=');
  assert.ok(cfg > 0 && mod > cfg, "module after lensiq-config.js");
});

test("D11 PDPA note for counsel", () => {
  const n = readFileSync(join(ROOT, "docs", "PDPA-NOTES-FOR-COUNSEL.md"), "utf8");
  assert.match(n, /D-4/); assert.match(n, /lensiq-device-data\.js/); assert.match(n, /LENSIQ_DEVICE_EXPORT/);
  // owner item 215: the D-4 section says the medicine look-up history is excluded until counsel answers
  const d4 = n.slice(n.indexOf("lensiq-device-data.js") - 2000, n.indexOf("lensiq-device-data.js") + 4000);
  assert.match(d4, /lq-med-history/); assert.match(d4, /excluded until counsel answers/i);
});

test("D12 (owner item 215) the medicine look-up history is never exportable and never importable", () => {
  const M = D();
  const MED = "lq-med-history";
  const good = JSON.stringify([{ at: 1763600000000, kind: "reg", q: "1A 844/39", r: "TH" }]);
  assert.equal(M.ITEMS.some(i => i.key === MED), false, "not on the allow-list");
  assert.ok(M.EXCLUDED.includes(MED), "documented exclusion");
  assert.equal(M.valueOk(MED, good), false, "a well-formed value is still refused");
  // export: every group, ticked or not, never carries it
  for (const groups of [M.DEFAULT_GROUPS, ["records"], ["settings", "age", "records"]]) {
    const c = M.collect(store(ALL), groups);
    assert.ok(!(MED in c.items), "collect " + groups.join("+"));
    const text = M.serialize(M.build(store(ALL), groups, 1763700000000));
    assert.ok(!text.includes(MED) && !text.includes("1A 844/39"), "file " + groups.join("+"));
  }
  // import: a hand-made file carrying it (alone or with valid items) never writes it, and the other valid items still load
  const file = items => JSON.stringify({ format: "lensiq-device-data", version: 1, exportedAt: "2026-11-21T00:00:00.000Z", groups: ["settings", "records"], items });
  const p = M.parse(file({ "lq-lang": "zh", [MED]: good }));
  assert.equal(p.ok, true);
  assert.ok(!(MED in p.items) && p.unknown.includes(MED), "listed as not accepted");
  const st = store();
  const w = M.apply(st, p, { adultConfirmed: true });
  assert.equal(st.getItem(MED), null, "never written");
  assert.ok(!w.written.includes(MED));
  assert.equal(st.getItem("lq-lang"), "zh");
  const only = M.parse(file({ [MED]: good }));
  const st2 = store();
  M.apply(st2, only, { adultConfirmed: true });
  assert.equal(st2.getItem(MED), null, "never written (file with nothing else)");
  // an existing value on the device is left alone by a load (the module never touches the key)
  const st3 = store({ [MED]: "keep" });
  M.apply(st3, M.parse(file({ "lq-lang": "en", [MED]: good })), { adultConfirmed: true });
  assert.equal(st3.getItem(MED), "keep");
  // no dangling UI: no item label, group label or UI string names medicine look-ups, in TH / EN / ZH
  const ui = JSON.stringify([M.ITEMS.map(i => i.label), M.GROUP_LABEL, M.STR]);
  assert.doesNotMatch(ui, /ยา|ฉลาก|medicine|label look-up|药|标签查询/i);
  assert.doesNotMatch(ui, /health|สุขภาพ|健康/i, "no health wording left from the medicine group");
});
