"use strict";
// tests/unit/pet-zodiac-r2.test.js — FIXED TEST SET, review round 2 of the Pet zodiac cards (independent review round 1 FAILED
// on bdeeed49, 2026-11-19). Locked (evals-locks/pet-zodiac.sha256) BEFORE the fixes. Browser half: tests/e2e/pet-zodiac-r2.e2e.mjs.
//   W1  one date basis: LQPetDraw.today() is the Bangkok (UTC+7) calendar date, the same basis as the full-moon rule; petread.js
//       builds the draw's "today" with LQPetDraw.today(); the module documents the Bangkok basis
//   W2  full-moon day distribution: 100 000 draws of the default config on a full-moon day (2025-11-05) match the config
//       (chi-square < 40, 12 df) and the secret rate is within ±0.4 percentage points of 10 %
//   W3  the odds line carries the approximation word on full-moon days (TH "วันเพ็ญ โดยประมาณ" / EN "approx. full-moon day" /
//       ZH "约满月日") and on ordinary days a short clause with the full-moon rate and the same word
//   W4  the card renderer reports its text boxes and keeps decoration out of them: lensiq-pet-card.js exposes info.textBoxes and
//       a decor switch (opts.decor === false draws the same card without stickers, sprinkles, border and corner art), used by
//       the browser exclusion-zone check
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const D = require("../../lensiq-pet-draw.js");
const ZODIAC = ["rat", "ox", "tiger", "rabbit", "dragon", "snake", "horse", "goat", "monkey", "rooster", "dog", "pig"];
const ALL = ZODIAC.concat(["secret"]);
const LANGS = ["th", "en", "zh"];
const pct = x => (Math.round(x * 10000) / 100).toFixed(2).replace(/\.?0+$/, "") + "%";

test("W1 one date basis: today() is the Bangkok date, like the full-moon rule; petread uses it", () => {
  assert.equal(D.today(new Date("2026-11-19T16:59:59Z")), "2026-11-19");
  assert.equal(D.today(new Date("2026-11-19T17:00:00Z")), "2026-11-20", "midnight in Bangkok");
  assert.equal(D.today(new Date("2026-11-19T18:30:00Z")), "2026-11-20");
  assert.equal(D.today(new Date("2026-12-31T23:30:00Z")), "2027-01-01");
  assert.match(D.today(), /^\d{4}-\d\d-\d\d$/);
  const s = read("lensiq-pet-draw.js");
  assert.match(s, /Bangkok/); assert.match(s, /function today/);
  const js = read("petread.js");
  assert.match(js, /today:\s*D\.today\(\)/, "petread builds the draw date with LQPetDraw.today()");
  assert.doesNotMatch(js, /today:\s*(?:new Date|Date\.now)/, "no other date basis for the draw");
});

test("W2 full-moon day: 100 000 draws of the default config, chi-square < 40, secret within ±0.4 pp of 10 %", () => {
  const cfg = D.config(D.DEFAULT), t = "2025-11-05";
  assert.ok(D.isFullMoonDay(t), t + " is a full-moon day");
  const p = D.odds(cfg, { today: t }).p, N = 100000, n = Object.fromEntries(ALL.map(k => [k, 0]));
  assert.ok(Math.abs(p.secret - 0.1) < 1e-12);
  for (let i = 0; i < N; i++) n[D.draw(cfg, { today: t }).id]++;
  let chi = 0; for (const k of ALL) { const e = N * p[k]; chi += (n[k] - e) ** 2 / e; }
  assert.ok(chi < 40, `chi-square ${chi.toFixed(2)} (counts ${JSON.stringify(n)})`);
  assert.ok(Math.abs(n.secret / N - 0.1) <= 0.004, `secret rate ${(n.secret / N * 100).toFixed(3)} %`);
});

test("W3 the odds line: approximation word on full-moon days; ordinary days name the full-moon rate with the same word", () => {
  const cfg = D.config(D.DEFAULT);
  const APPROX = { th: "วันเพ็ญ โดยประมาณ", en: "approx. full-moon day", zh: "约满月日" };
  for (const l of LANGS) {
    const fm = D.oddsText(cfg, { today: "2025-11-05" }, l)[0], od = D.oddsText(cfg, { today: "2026-11-19" }, l)[0];
    assert.ok(fm.includes(APPROX[l]) && fm.includes(pct(cfg.fullMoonSecret)), `${l} full-moon day: ${fm}`);
    assert.ok(od.includes(APPROX[l]) && od.includes(pct(cfg.fullMoonSecret)) && od.includes(pct(cfg.secret)), `${l} ordinary day: ${od}`);
    assert.ok(od.length <= (l === "zh" ? 70 : l === "th" ? 150 : 170), `${l} short: ${od.length}`);
  }
});

test("W4 the card renderer reports text boxes and has a decor switch (for the exclusion-zone check)", () => {
  const s = read("lensiq-pet-card.js");
  assert.match(s, /textBoxes/, "info.textBoxes");
  assert.match(s, /decor\s*!==\s*false|decor\s*===\s*false/, "opts.decor switch");
  for (const k of ["header", "footer"]) assert.match(s, new RegExp(`["']${k}["']`), k + " boxes");
  const a = read("lensiq-pet-zodiac-art.js");
  assert.match(a, /ribbon/, "the art reports the label ribbon rectangle");
});
