"use strict";
// tests/unit/member-gate.test.js — lensiq-member.js pure gate logic (light reading, soft guest counter, when the gate is
// on), the Google sign-in CSP (only when configured), and the fortune hook's member Authorization header.
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const M = require("../../lensiq-member.js");

const ROOT = join(__dirname, "..", "..");
const RES = {
  source: "local", lang: "th", topic: "overall",
  summary: { title: "สรุปสั้น", lines: [{ k: "ภาพรวม", t: "ดี" }] },
  plan: { title: "แผนปรับ 3 ข้อ", items: [{ for: "คิ้ว", t: "เล็มขนคิ้ว" }, { for: "งาน", t: "แบ่งงาน" }, { for: "เงิน", t: "จดรายจ่าย" }] },
  note: "ใช้ตัวเรียบเรียงในเครื่อง",
  sections: [
    { id: "overview", title: "ภาพรวม", paragraphs: ["ภาพรวมดี"] },
    { id: "love", title: "ความรัก", paragraphs: ["ความรักมั่นคง"] },
    { id: "money", title: "การเงิน", paragraphs: ["ช่วงนี้ตำราชี้ว่าเรื่องเงินอาจตึงมืออยู่บ้าง ควรวางแผนใช้จ่ายให้รัดกุม", "รายได้มาจากหลายทาง"] },
    { id: "work", title: "การงาน", paragraphs: ["งานก้าวหน้า"] },
    { id: "timing", title: "จังหวะเวลา", paragraphs: ["ไตรมาสหน้าดี"], collapsed: true }
  ],
  reminder: "ไม่มีอะไรแน่นอนตายตัว ตามหลักกาลามสูตร ใช้วิจารณญาณของตัวเอง"
};

test("lightResult: summary, first sections, gentle cautions, note and reminder kept; plan and the rest hidden", () => {
  const l = M.lightResult(RES, { sections: 2 });
  assert.deepEqual(l.sections.map(s => s.id), ["overview", "love", "cautions"]);
  assert.equal(l.sections[2].paragraphs[0], RES.sections[2].paragraphs[0], "caution from a hidden section is shown");
  assert.equal(l.sections[2].paragraphs.length, 1, "only the caution paragraph, not the rest of the section");
  assert.deepEqual(l.summary, RES.summary);
  assert.equal(l.reminder, RES.reminder, "Kalama reminder always shown");
  assert.equal(l.note, RES.note);
  assert.equal(l.plan, undefined, "3-point plan is a member feature");
  assert.deepEqual(l.light, { hiddenSections: 3, plan: true, over: false });
  assert.equal(RES.sections.length, 5, "input not mutated");
  assert.ok(RES.plan, "input not mutated");
});

test("lightResult: over the daily limit -> summary + cautions + reminder only; never zero safety text", () => {
  const l = M.lightResult(RES, { sections: 2, over: true });
  assert.deepEqual(l.sections.map(s => s.id), ["cautions"]);
  assert.ok(l.reminder && l.summary);
  assert.equal(l.light.over, true);
  const noCaution = M.lightResult({ ...RES, sections: RES.sections.filter(s => s.id !== "money") }, { sections: 1 });
  assert.deepEqual(noCaution.sections.map(s => s.id), ["overview"]);
  assert.equal(M.lightResult(null), null);
  assert.ok(M.cautionParagraphs([{ paragraphs: ["这段时间财务上可能会紧一些，建议记账"] }]).length === 1, "Chinese caution markers");
  assert.ok(M.cautionParagraphs([{ paragraphs: ["Money may feel tight for a while, so plan your spending."] }]).length === 1, "English caution markers");
});

test("guest counter: per day, soft; re-renders within a few seconds are not counted twice", () => {
  let s = null, r;
  r = M.countGuest(s, "2026-11-07", 2, 1000); s = r.store; assert.deepEqual([r.n, r.over], [1, false]);
  r = M.countGuest(s, "2026-11-07", 2, 2000); s = r.store; assert.deepEqual([r.n, r.over], [1, false], "same reading re-rendered");
  r = M.countGuest(s, "2026-11-07", 2, 10000); s = r.store; assert.deepEqual([r.n, r.over], [2, false]);
  r = M.countGuest(s, "2026-11-07", 2, 20000); s = r.store; assert.deepEqual([r.n, r.over], [3, true]);
  r = M.countGuest(s, "2026-11-08", 2, 30000); assert.deepEqual([r.n, r.over], [1, false], "new day resets");
  assert.equal(M.countGuest(null, "d", 0, 0).over, true, "limit 0 = always short");
});

test("gate is on only with the API's membership.required AND a client id on the page", () => {
  const cfg = { membership: { required: true, google_client_id: "x.apps.example" } };
  assert.equal(M.gateOn(cfg, "x.apps.example"), true);
  assert.equal(M.gateOn(cfg, ""), false, "page not configured (CSP would block GSI)");
  assert.equal(M.gateOn({ membership: { required: false } }, "x"), false, "owner switch off (default)");
  assert.equal(M.gateOn(null, "x"), false, "no API = exactly as today");
  assert.equal(M.signInPossible({ membership: { required: false, google_client_id: "x" } }, "x"), true);
  assert.equal(M.CONSENT_VERSION, "m1");
});

test("member consent version matches the Worker", async () => {
  const { MEMBER_CONSENT_VERSIONS } = await import("../../backend/src/members.js");
  assert.ok(MEMBER_CONSENT_VERSIONS.includes(M.CONSENT_VERSION));
});

test("csp-meta: Google sign-in paths only when LENSIQ_GOOGLE_CLIENT_ID is set; default policy unchanged", async () => {
  const { policy, configuredGoogle, configuredPolicy } = await import("../../tools/csp-meta.mjs");
  const cfg = readFileSync(join(ROOT, "lensiq-config.js"), "utf8");
  assert.equal(configuredGoogle(cfg), false, "repo default: no client id");
  assert.equal(configuredPolicy(cfg), policy(), "default config = today's policy");
  assert.ok(!/google/.test(policy()));
  const on = configuredGoogle('window.LENSIQ_GOOGLE_CLIENT_ID = window.LENSIQ_GOOGLE_CLIENT_ID || "123-abc.apps.googleusercontent.com";');
  assert.equal(on, true);
  const p = policy({ google: true, turnstile: true });
  assert.match(p, /script-src 'self' 'wasm-unsafe-eval' https:\/\/challenges\.cloudflare\.com https:\/\/accounts\.google\.com\/gsi\/client;/);
  assert.match(p, /style-src 'self' 'unsafe-inline' https:\/\/accounts\.google\.com\/gsi\/style;/);
  assert.match(p, /frame-src https:\/\/challenges\.cloudflare\.com https:\/\/accounts\.google\.com\/gsi\/;/);
  assert.match(p, /connect-src [^;]*https:\/\/accounts\.google\.com\/gsi\//);
  assert.ok(!/accounts\.google\.com[;\s]/.test(p), "never the whole accounts.google.com origin");
});

test("lensiq-member.js never loads Google's script on page load and is not loaded without the API", () => {
  const src = readFileSync(join(ROOT, "lensiq-member.js"), "utf8");
  // the only place the GSI src is assigned is loadGsi(), called from the dialog's click handler
  assert.equal((src.match(/s\.src = GSI_SRC/g) || []).length, 1);
  assert.match(src, /go\.addEventListener\("click"[\s\S]*loadGsi\(\)/);
  const cfg = readFileSync(join(ROOT, "lensiq-config.js"), "utf8");
  assert.match(cfg, /window\.LENSIQ_GOOGLE_CLIENT_ID = window\.LENSIQ_GOOGLE_CLIENT_ID \|\| "";/, "no real client id committed");
  assert.match(cfg, /if \(!\/\^https\?:\\\/\\\/\/\.test\(String\(window\.LENSIQ_API_BASE/, "loader returns early without an API");
});

test("lensiq-fortune-hook.js: member token added to /api/fortune POST and status only when signed in", async () => {
  const seen = [];
  const win = {
    LENSIQ_API_BASE: "https://api.x.dev", Headers, Promise, Object, String, setTimeout, clearTimeout,
    document: { readyState: "complete", addEventListener() {} },
    fetch: (input, init) => { seen.push({ input, init }); return Promise.resolve({ ok: true }); }
  };
  win.window = win;
  vm.runInContext(readFileSync(join(ROOT, "lensiq-fortune-hook.js"), "utf8"), vm.createContext(win));
  await win.fetch("https://api.x.dev/api/fortune/status");
  assert.equal(seen[0].init, undefined, "guest: untouched");
  win.LQMember = { token: () => "tok_" + "a".repeat(40) };
  await win.fetch("https://api.x.dev/api/fortune", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  await win.fetch("https://api.x.dev/api/fortune/status");
  await win.fetch("https://other.example/api/fortune", { method: "POST" });
  assert.equal(seen[1].init.headers.get("Authorization"), "Bearer tok_" + "a".repeat(40));
  assert.equal(seen[1].init.headers.get("Content-Type"), "application/json");
  assert.equal(seen[2].init.headers.get("Authorization"), "Bearer tok_" + "a".repeat(40));
  assert.ok(!seen[3].init.headers || !(seen[3].init.headers instanceof Headers), "other origins never get the token");
});

test("pickSession: sessionStorage first (default), localStorage only for 'remember me'; expired dropped", () => {
  const now = 1_700_000_000_000, ok = { t: "x".repeat(43), exp: now / 1000 + 60 }, old = { t: "y".repeat(43), exp: now / 1000 - 1 };
  assert.deepEqual(M.pickSession(ok, null, now), { sess: ok, where: "session" });
  assert.deepEqual(M.pickSession(null, ok, now), { sess: ok, where: "local" });
  assert.deepEqual(M.pickSession(old, ok, now), { sess: ok, where: "local" });
  assert.deepEqual(M.pickSession(old, old, now), { sess: null, where: null });
  assert.deepEqual(M.pickSession({ t: "" }, "junk", now), { sess: null, where: null });
});

test("claimOutcome / addClaim: guest purchase kept until linked; invalid / claimed dropped; endpoint missing kept", () => {
  assert.equal(M.claimOutcome({ ok: true, status: 200, j: {} }), "done");
  assert.equal(M.claimOutcome({ ok: false, status: 409, j: { code: "already_claimed" } }), "drop");
  assert.equal(M.claimOutcome({ ok: false, status: 400, j: null }), "drop");
  assert.equal(M.claimOutcome({ ok: false, status: 404, j: { error: "not found" } }), "keep", "Worker without the endpoint yet");
  assert.equal(M.claimOutcome({ ok: false, status: 0, j: null }), "keep", "offline");
  assert.equal(M.claimOutcome({ ok: false, status: 503, j: null }, 100 * 86400), "drop", "too old");
  const c = { customer_id: "c".repeat(24), order_token: "t".repeat(32) };
  let l = M.addClaim([], c, 10);
  assert.equal(l.length, 1);
  l = M.addClaim(l, { ...c, order_token: "u".repeat(32) }, 11);
  assert.equal(l.length, 1, "deduplicated by customer id");
  assert.equal(l[0].order_token, "u".repeat(32));
  for (let i = 0; i < 8; i++) l = M.addClaim(l, { customer_id: "id" + String(i).padStart(6, "0"), order_token: "t".repeat(32) }, 20 + i);
  assert.equal(l.length, 5, "at most 5 kept");
  assert.deepEqual(M.addClaim([], { customer_id: "<script>", order_token: "x" }), [], "malformed ignored");
});
