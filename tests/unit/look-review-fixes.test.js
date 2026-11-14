"use strict";
// tests/unit/look-review-fixes.test.js — findings of the independent review of branch beauty-look (2026-11-13,
// ~/LENSIQ-field/evals/beauty-look/review/). FIXED TEST SET: written and hash-locked before the fixes.
//   R1 (S1) the camera never stays on after the dialog closed: acquire(gum, token) stops a stream that arrives after the
//      token was cancelled (dialog closed, or opened again) and returns null; open() uses it
//   R2 (S2) when the page turns calm or enters the crisis state, LQLook.render() closes an open preview dialog
//   R3 (S4) the look modules fail CLOSED when the wording lint is missing: no generated item, no salon item
//   R4 (S3) the reviewer's adversarial strings (TH / EN / ZH) are caught by the look lint (any code); the salon source still
//      lifts only the procedure code
const test = require("node:test");
const assert = require("node:assert/strict");

const look = () => require("../../lensiq-look.js");
const prev = () => require("../../lensiq-look-preview.js");
const lint = () => require("../../lensiq-look-lint.js");

function fakeStream() {
  const tracks = [{ readyState: "live", stop() { this.readyState = "ended"; } }];
  return { getTracks: () => tracks, tracks };
}

test("R1 acquire(): a stream that arrives after cancel is stopped and dropped; a live token keeps it", async () => {
  const P = prev();
  assert.equal(typeof P.acquire, "function");
  assert.equal(typeof P.newToken, "function");
  // cancelled while the permission prompt is open
  let s1; const t1 = P.newToken();
  const pending = P.acquire(() => new Promise(r => setTimeout(() => { s1 = fakeStream(); r(s1); }, 20)), t1);
  t1.cancel();
  assert.equal(await pending, null);
  assert.equal(s1.tracks[0].readyState, "ended", "late stream stopped");
  // opened again while the first start is pending: the first token is cancelled by the second
  let a; const ta = P.newToken();
  const pa = P.acquire(() => new Promise(r => setTimeout(() => { a = fakeStream(); r(a); }, 20)), ta);
  const tb = P.newToken(); // a new open cancels the previous token
  assert.equal(ta.cancelled, true, "previous token cancelled by a new open");
  assert.equal(await pa, null); assert.equal(a.tracks[0].readyState, "ended");
  const b = fakeStream();
  assert.equal(await P.acquire(() => Promise.resolve(b), tb), b, "live token keeps its stream");
  assert.equal(b.tracks[0].readyState, "live");
  // open() goes through acquire()
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "..", "lensiq-look-preview.js"), "utf8");
  assert.match(src, /await acquire\(/);
});

test("R2 render() closes an open preview dialog when the page is calm or in crisis", () => {
  const L = look();
  const prevG = { P: globalThis.LQLookPreview, ls: globalThis.localStorage, ss: globalThis.sessionStorage };
  let closed = 0;
  globalThis.LQLookPreview = { close: () => { closed++; }, available: () => false };
  const store = init => { const m = new Map(Object.entries(init)); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
  globalThis.localStorage = store({ "lq-fortune-straight": JSON.stringify({ adult: true }) });
  globalThis.sessionStorage = store({});
  try {
    for (const attr of ["data-lq-calm", "data-lq-crisis"]) {
      const attrs = { [attr]: "1" };
      const doc = { documentElement: { getAttribute: k => attrs[k] || null, setAttribute: () => {} }, querySelector: () => null, querySelectorAll: () => [],
        getElementById: () => ({}), createElement: () => ({}), head: { appendChild: () => {} } };
      const box = { ownerDocument: doc, hidden: false, innerHTML: "x", setAttribute() {}, querySelector: () => null };
      const before = closed;
      L.render(box, { cls: { brow: { cat: "straight" }, eye: { cat: "soft" }, nose: { cat: "balanced" }, mouth: { cat: "small", note: "level" }, yintang: { cat: "balanced" },
        chin: { cat: "balanced" }, zones: { dominant: null } }, el: { top: { id: "fire" } } });
      assert.equal(box.hidden, true, attr + ": block hidden");
      assert.ok(closed > before, attr + ": preview closed");
    }
  } finally { globalThis.LQLookPreview = prevG.P; globalThis.localStorage = prevG.ls; globalThis.sessionStorage = prevG.ss; }
});

test("R3 fail closed without the lint: no generated item and no salon item", () => {
  const L = look();
  assert.equal(typeof L.__setLintForTest, "function");
  const c = { brow: { cat: "straight" }, eye: { cat: "soft" }, nose: { cat: "balanced" }, mouth: { cat: "small", note: "level" }, yintang: { cat: "balanced" }, chin: { cat: "balanced" },
    zones: { dominant: null } };
  try {
    L.__setLintForTest(null);
    assert.deepEqual(L.suggest(c, { el: "fire", lang: "th" }), [], "no generated items");
    const it = { id: "g", cat: "brows", reading: "คิ้วตรง", text: "ลองเติมกลางคิ้ว", label: L.LABEL.th, card: null, preview: null };
    assert.ok(!L.html([it], "th").includes('data-look-id="g"'), "html drops items");
    assert.equal(L.salonItem({ id: "s", kind: "brow", shape: "brow-arch", name: { th: "ทรงโค้ง", en: "arch", zh: "弯眉" } }, "th").ok, false, "salon refused");
  } finally { L.__setLintForTest(undefined); }
  assert.ok(L.suggest(c, { el: "fire", lang: "th" }).length > 0, "restored");
});

test("R4 the reviewer's adversarial strings are caught (TH / EN / ZH)", () => {
  const { lintLook } = lint();
  const S = [
    // procedures
    "ทำคิ้ว 6D", "ฝังสีคิ้ว", "ปากชมพูถาวร", "ทำ HIFU", "กรีดตาสองชั้น", "เสริมคาง", "ดูดไขมันแก้ม", "ไปคลินิก", "b0tox", "fill-ers", "microneedling", "chemical peel",
    "lash lift", "lash extensions", "brow lamination", "水光针", "热玛吉", "瘦脸针", "割眼皮", "开眼角", "皮秒",
    // whitening
    "หน้าดูสว่างขึ้น", "หน้ากระจ่างใส", "ผิวผ่อง", "look paler", "look whiter", "dusky skin", "更白", "冷白皮", "提亮气色", "去黄气",
    // feature is bad / too big / too small
    "ปิดคิ้วบาง", "แก้คิ้วบาง", "พรางหน้าใหญ่", "ให้หน้าเรียวลง", "slim a round face", "a wide nose", "big forehead", "conceal a weak chin", "eyes are too small",
    "修饰大脸", "显脸小", "脸太圆", "嘴唇太薄",
    // beauty score / age look
    "look 10 years younger", "glow up", "look more youthful", "ดูอ่อนวัย", "年轻十岁", "看起来更年轻",
    // luck suffers otherwise
    "ไม่ทำคิ้วแล้วการงานจะไม่รุ่ง", "ขาดคิ้วยาวจะไม่มีคนช่วย", "skip this and your career stalls", "without a lifted brow friends will drift away", "不画的话没人帮你",
    // purchase
    "สั่งเลย", "DM us to order", "淘宝链接"
  ];
  const miss = S.filter(t => !lintLook(t).length);
  assert.deepEqual(miss, [], "missed: " + miss.join(" | "));
  // salon text: procedure names still allowed, the rest still refused
  for (const t of ["ฝังสีคิ้ว ทรงโค้ง", "brow lamination, soft arch", "雾眉 柳叶形"]) assert.deepEqual(lintLook(t, { source: "salon" }).filter(h => h.code === "procedure"), [], t);
  for (const t of ["ฝังสีคิ้ว หน้าดูสว่างขึ้น", "lash lift to look 10 years younger", "纹眉 冷白皮"]) assert.ok(lintLook(t, { source: "salon" }).length, t);
});
