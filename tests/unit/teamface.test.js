"use strict";
// node --test tests/unit — teamface.js (โหงวเฮ้งทีม): element -> role mapping on the real face-reading engine (read-only
// reuse of faceread.js / faceread-kb.js), team summary patterns, positive-only copy and 中文 key coverage.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const TF = require("../../teamface.js");
const FR = require("../../faceread.js");
const ROOT = path.join(__dirname, "..", "..");

test("roles: one playful role per face-reading element, all with full copy", () => {
  assert.deepEqual(TF.IDS.slice().sort(), FR.ELEMENTS.slice().sort());
  for (const id of TF.IDS) {
    const r = TF.ROLES[id];
    for (const f of ["name", "tag", "power", "work", "ice", "borrow"]) assert.ok(r[f] && r[f].length > 3, id + "." + f);
    assert.equal(r.str.length, 2);
  }
});

test("roleFor: uses FRCore.elementScores ranking (synthetic faces of different proportions)", () => {
  const role = (w, h) => TF.roleFor(FR.elementScores(FR.measure(FR.synthFace({ x: 50, y: 50, w, h }), null)));
  assert.equal(role(100, 100).role, "water");
  assert.equal(role(100, 130).role, "fire");
  assert.equal(role(100, 160).role, "wood");
  const r = role(100, 130); assert.ok(r.second && r.second !== r.role);
  assert.deepEqual(TF.roleFor(null), { role: "earth", second: null });
  assert.deepEqual(TF.roleFor({ ranked: [{ id: "metal" }, { id: "metal" }] }), { role: "metal", second: null });
});

test("teamSummary: counts and patterns", () => {
  const m = ids => ids.map(role => ({ role }));
  assert.equal(TF.teamSummary([]).pattern, "empty");
  assert.equal(TF.teamSummary(m(["fire"])).pattern, "solo");
  const bal = TF.teamSummary(m(["wood", "fire", "earth", "metal", "water", "fire"]));
  assert.deepEqual([bal.pattern, bal.n, bal.counts.fire, bal.present[0], bal.missing.length], ["balanced", 6, 2, "fire", 0]);
  const dom = TF.teamSummary(m(["earth", "earth", "earth", "water"]));
  assert.deepEqual([dom.pattern, dom.dominant, dom.missing], ["dominant", "earth", ["wood", "fire", "metal"]]);
  assert.equal(TF.teamSummary(m(["earth", "water"])).pattern, "duo");
  assert.equal(TF.teamSummary(m(["earth", "earth", "water", "water"])).pattern, "duo", "a 2–2 tie is not 'dominant'");
  assert.equal(TF.teamSummary(m(["wood", "fire", "metal"])).pattern, "mixed");
  assert.equal(TF.teamSummary(m(["water", "water"])).pattern, "same");
  assert.equal(TF.teamSummary(m(["water", "water", "water"])).pattern, "same");
  assert.equal(TF.teamSummary([{ role: "bogus" }, null, { role: "wood" }]).n, 1);
});

test("copy is positive and the page carries the not-for-hiring banner; 中文 keys complete; no 'AI' label; KB untouched", () => {
  const html = fs.readFileSync(path.join(ROOT, "teamface.html"), "utf8"), js = fs.readFileSync(path.join(ROOT, "teamface.js"), "utf8");
  assert.match(html, /class="tf-banner"[^>]*role="note"/);
  assert.match(html, /ห้ามใช้ประกอบการจ้างงาน ประเมินผล หรือตัดสินบุคคล/);
  assert.match(fs.readFileSync(path.join(ROOT, "teamface.css"), "utf8"), /\.tf-banner\{position:fixed/);
  const all = JSON.stringify(TF.ROLES);
  for (const w of ["ไม่ดี", "แย่", "อ่อนแอ", "ขี้เกียจ", "ปัญหา", "จุดอ่อน", "ด้อย"]) assert.ok(!all.includes(w), "negative word " + w);
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "i18n/zh-teamface.js"), "utf8"), ctx);
  const zh = Object.assign({}, ...ctx.window.LQI18N_Q.map(e => e.zh));
  const keys = new Set([...html.matchAll(/data-i18n="([^"]+)"/g)].map(x => x[1]));
  for (const x of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const p of x[1].split(";")) keys.add(p.split(":")[1]);
  for (const x of js.matchAll(/\bT\("([a-z][\w.]+)"/g)) if (!x[1].endsWith(".")) keys.add(x[1]);
  for (const id of TF.IDS) { for (const f of ["name", "tag", "power", "work", "ice", "borrow", "str0", "str1"]) keys.add(`tf.role.${id}.${f}`); }
  for (const p of ["empty", "solo", "same", "balanced", "dominant", "duo", "mixed"]) { keys.add(`tf.pat.${p}.t`); keys.add(`tf.pat.${p}.x`); }
  assert.deepEqual([...keys].filter(k => !(k in zh)), []);
  for (const [k, v] of Object.entries(zh)) assert.ok(!/[฀-๿]/.test(v), "Thai in zh " + k);
  assert.ok(!/\bAI\b/.test(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ")));
  assert.match(html, /<script src="faceread-kb\.js[^"]*"><\/script>[\s\S]*<script src="faceread\.js[^"]*"><\/script>[\s\S]*<script src="teamface\.js/);
  assert.ok(!/FR_KB\.\w+\s*=[^=]|FR_KB\[[^\]]+\]\s*=[^=]/.test(js), "teamface.js must not write to the face-reading KB");
});

test("Round 10: 'for fun / icebreaker, not an assessment' on every screen and card; results cannot be attached to candidate records", () => {
  const html = fs.readFileSync(path.join(ROOT, "teamface.html"), "utf8"), js = fs.readFileSync(path.join(ROOT, "teamface.js"), "utf8");
  const NA = "เพื่อความบันเทิง/กิจกรรมละลายพฤติกรรม ไม่ใช่การประเมิน";
  assert.equal(TF.NOT_ASSESSMENT, NA);
  assert.ok(html.includes('<span data-i18n="tf.s.banner">' + NA), "fixed banner carries the label");
  // the label sits in the page header, the reading stage, the cards section, the team summary and "how it works"
  assert.ok((html.match(/class="tf-na" data-i18n="tf.s.na"/g) || []).length >= 5);
  assert.match(js, /'<p class="tf-na">' \+ esc\(T\("tf\.s\.na", TF\.NOT_ASSESSMENT\)\)/, "every card carries the label");
  // no export / copy / download path anywhere
  for (const w of ["download", "clipboard", "localStorage", "sessionStorage", "indexedDB", "fetch(", "exportSheet", "JSON.stringify(members"]) assert.ok(!js.includes(w), "teamface must not " + w);
  for (const id of ["C-014", "c014", "EMP 2231", "0812345678", "a@b.co", "ผู้สมัคร 3", "candidate 2", "面试者"]) assert.equal(TF.recordLike(id), true, id);
  for (const ok of ["บี", "นิด", "Ann", "小王", "", "J"]) assert.equal(TF.recordLike(ok), false, ok);
  assert.equal(TF.recruitLike("ทีมสัมภาษณ์งาน"), true); assert.equal(TF.recruitLike("Interview panel"), true); assert.equal(TF.recruitLike("ทีมขาย"), false);
  assert.match(js, /\["cand", "candidate", "applicant", "record", "employee", "emp", "id"\]/, "record parameters in links are ignored");
  // the interview kit refuses anything that is not an interview sheet
  const IV = require("../../interview-core.js");
  assert.throws(() => IV.importSheet(JSON.stringify({ kind: "lensiq-teamface", v: 1, who: "x", role: "fire" })), /bad-kind/);
  // English + Chinese for the new keys
  for (const [f, lang] of [["i18n/zh-teamface.js", "zh"], ["i18n/en-teamface.js", "en"]]) {
    const ctx = { window: {} }; vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx);
    const d = Object.assign({}, ...ctx.window.LQI18N_Q.map(e => e[lang] || {}));
    for (const k of ["tf.s.banner", "tf.s.na", "tf.s.r4", "tf.s.guard", "tf.js.nickDrop", "tf.js.teamDrop"]) assert.ok(d[k] && !/[฀-๿]/.test(d[k]), lang + " " + k);
  }
});
