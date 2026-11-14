"use strict";
// tests/unit/walkfix-n.test.js — independent re-walk of walk-fix @ a86b02c (coordinator 2026-11-14): N1, N2, N6, N7, W-006.
// FIXED TEST: locked (~/LENSIQ-field/evals/walk-fix/, evals-locks/walk-fix.sha256, append-only) BEFORE the fixes.
//   N1  buyer-facing Attendance links open the PIN / QR time clock (attendance.html?mode=employee). Bare links are allowed
//       only where an older locked test pins them (the .sl-go of the cat-hr card: cat-pages.test.js + categories.e2e.mjs;
//       existing-file check of solutions.test.js) or where the card is a training / class / event check-in (face):
//       solutions cards edu2, f3, e4. Those two cards that sell the time clock (cat-hr attendance, solutions hr1) carry an
//       explicit PIN / QR link; the nav.js menu entry opens employee mode.
//   N2  employee mode sets the document title to the PIN / QR name (TH / EN / ZH keys).
//   N6  customer onboarding guides: Chinese wording fixes, the support level S1 is explained in every language.
//   N7  gate-notice.html loads the same i18n/zh-gate.js?v= as the other Gate pages.
//   W-006  docs/GATE.md states the PILOT-GATE §5 bar (>= 200 reads, night >= 40, motorcycles >= 30), not the old 100 / 30.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const EMP = "attendance.html?mode=employee";

test("N1: buyer-facing Attendance links open employee mode (PIN / QR)", () => {
  const bad = [];
  for (const f of readdirSync(ROOT).filter(x => x.endsWith(".html") && x !== "attendance.html")) {
    const src = read(f);
    for (const m of src.matchAll(/<a\b[^>]*href="attendance\.html(?:&amp;|[?#][^"]*)?"[^>]*>/g)) {
      if (/href="attendance\.html\?mode=employee/.test(m[0])) continue;
      const before = src.slice(0, m.index);
      const card = (before.match(/<article class="sl-card" data-status="\w+" id="sol-(\w+)">(?![\s\S]*<\/article>)/) || [])[1];
      if (f === "solutions.html" && ["edu2", "f3", "e4"].includes(card)) continue;
      // amendment 1: as the header says, solutions.test.js requires each card's .sl-go to name an existing file, so hr1 keeps a
      // bare .sl-go next to its explicit PIN / QR link (checked below)
      if (f === "solutions.html" && card === "hr1" && /class="sl-go"/.test(m[0])) continue;
      const catCard = (before.match(/<article class="pd-card cat-tool" data-page="([a-z0-9-]+)"(?![\s\S]*<\/article>)/) || [])[1];
      if (f === "cat-hr.html" && catCard === "attendance" && /class="sl-go"/.test(m[0])) continue;
      bad.push(f + ": " + m[0].slice(0, 90));
    }
  }
  assert.deepEqual(bad, []);
  const hrCard = read("cat-hr.html").match(/<article class="pd-card cat-tool" data-page="attendance"[\s\S]*?<\/article>/)[0];
  assert.ok(hrCard.includes(`href="${EMP}"`), "cat-hr attendance card has the PIN / QR link");
  const hr1 = read("solutions.html").match(/<article class="sl-card" data-status="\w+" id="sol-hr1">[\s\S]*?<\/article>/)[0];
  assert.ok(hr1.includes(`href="${EMP}"`), "solutions hr1 (employee time clock) has the PIN / QR link");
  assert.ok(read("tools/cat-pages.mjs").includes(EMP), "the cat-hr link comes from the generator");
  const nav = read("nav.js");
  assert.ok(nav.includes(`"attendance.html": "${EMP}"`), "nav.js maps the menu entry to employee mode");
  for (const f of ["index.html", "hr.html", "cameras.html"]) assert.ok(read(f).includes(`href="${EMP}"`), f);
});

test("N2: employee mode sets the document title to the PIN / QR time clock in TH / EN / ZH", () => {
  const js = read("attendance-hr.js");
  assert.match(js, /attendance\.hr\.title/);
  assert.match(js, /document\.title\s*=/);
  for (const f of ["i18n/en-attendance.js", "i18n/zh-attendance.js"]) {
    const m = read(f).match(/"attendance\.hr\.title":\s*"([^"]+)"/);
    assert.ok(m && /PIN/.test(m[1]) && /QR/.test(m[1]) && /LENSIQ/.test(m[1]), f + ": " + (m && m[1]));
  }
  const th = js.match(/T\("title",\s*"([^"]+)"\)|"attendance\.hr\.title",\s*"([^"]+)"/);
  assert.ok(th && /PIN/.test(th[1] || th[2]), "Thai default title");
});

const GUIDES = ["EXAM", "ATTENDANCE", "GATE", "CROWD"].map(p => "docs/sales/customer/ONBOARDING-" + p + ".md");
test("N6: customer guides — Chinese wording fixed, S1 explained in every language", () => {
  for (const f of GUIDES) {
    const s = read(f), iEn = s.indexOf("\n## English"), iZh = s.indexOf("\n## 中文");
    const parts = { th: s.slice(0, iEn), en: s.slice(iEn, iZh), zh: s.slice(iZh) };
    for (const [n, p] of Object.entries(parts)) {
      if (!/\bS1\b/.test(p)) continue;
      const def = { th: /S1\s*\(|S1 คือ|S1 =|S1:|S1 หมายถึง/, en: /S1 \(|S1 means|S1 =|S1:/, zh: /S1（|S1 \(|S1 指|S1 =|S1：/ }[n];
      assert.match(p, def, `${f} ${n}: S1 is used but not explained`);
    }
    assert.ok(!/设在大厅内/.test(parts.zh), f + ": 设在大厅内");
    assert.ok(!/与商店原有记录/.test(parts.zh), f + ": 与商店原有记录");
    for (const m of parts.zh.matchAll(/第\s?114\s?条/g)) assert.match(parts.zh.slice(Math.max(0, m.index - 20), m.index), /《[^》]+》/, f + ": law name before 第114条");
  }
  assert.match(read(GUIDES[0]), /大型考场/);
});

test("N7: gate-notice.html loads the same i18n/zh-gate.js version as the other Gate pages", () => {
  const v = f => (read(f).match(/i18n\/zh-gate\.js\?v=(\d+)/) || [])[1];
  const want = v("gate.html");
  assert.ok(want, "gate.html version");
  for (const f of ["gate-notice.html", "village.html", "parking.html"]) assert.equal(v(f), want, f);
});

test("W-006: docs/GATE.md pilot bar matches PILOT-GATE §5", () => {
  const g = read("docs/GATE.md");
  assert.ok(!/≥ 100 vehicles/.test(g), "old 100-vehicle bar");
  assert.match(g, /≥ 200 (real )?reads/);
  assert.match(g, /night ≥ 40/);
  assert.match(g, /motorcycles ≥ 30/);
});
