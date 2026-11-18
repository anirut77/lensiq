"use strict";
// tests/unit/look-salon-approval.test.js — the page side of the salon approval step (owner decision 2026-11-18;
// docs/BEAUTY-IMAGE-DESIGN.md §4; CLAUDE.md "Look suggestions"). FIXED TEST SET: written and hash-locked
// (~/LENSIQ-field/evals/salon-approval/, evals-locks/salon-approval.sha256) BEFORE lensiq-look.js was changed.
//
//   P1 pending entries are never shown: LQLook.salonApproved(entries, lang) keeps only entries whose status is exactly
//      "approved" (pending, rejected, hidden, missing or forged statuses are dropped) and of a known kind
//   P2 procedure words are never shown, even in an "approved" entry: every salon text (names, descriptions, colour code, in
//      TH / EN / ZH) is checked with the strict lint (no salon exception); an entry with any hit is dropped whole
//   P3 the switch: salon mode stays refused while window.LENSIQ_LOOK_SALON is not exactly true (lensiq-config.js ships
//      false); LQLook.salonLoad() makes no network call while it is off
//   P4 crisis / calm hides salon content: LQLook.salonRender(container, entries) draws nothing (container hidden and empty)
//      when the tab is calm, in the crisis state or holds distress words, even with the switch on and an adult confirmed
//   P5 the 18+ gate holds: nothing is drawn until the same 18+ confirmation as straight mode; also nothing when the user
//      switched the look section off on this device
//   P6 when shown: approved entries only, the salon's text escaped and labelled as the salon's own, our wrapper wording passes
//      the strict lint, no image tag (no photo is shown or stored), no free-text input
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const look = () => require("../../lensiq-look.js");
const lint = () => require("../../lensiq-look-lint.js");
const LANGS = ["th", "en", "zh"];
const SALON_LABEL = { th: "ข้อความของร้าน ไม่ใช่คำแนะนำของ LENSIQ", en: "The salon's own text, not a LENSIQ suggestion", zh: "店家自己的文字，并非 LENSIQ 的建议" };

function store(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
function fakeDoc(attrs = {}, fields = []) {
  const a = { ...attrs };
  return { documentElement: { getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); } },
    querySelector: () => null, querySelectorAll: () => fields, getElementById: () => null };
}
function box(doc) {
  const attrs = {};
  return { ownerDocument: doc, hidden: false, innerHTML: "", setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: k => (k in attrs ? attrs[k] : null),
    removeAttribute: k => { delete attrs[k]; }, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} };
}
const entry = (o = {}) => ({ id: "a1b2c3d4e5f6", kind: "brow", status: "approved", version: 2,
  name: { th: "ทรงโค้งนุ่ม", en: "Soft arch", zh: "柔和弯眉" }, desc: { th: "ทรงคิ้วโค้งปลายยกเล็กน้อย", en: "A gentle arch with a slightly lifted tail", zh: "弯眉，眉尾略微上扬" },
  shape: { card: "brow-arch" }, ...o });
/** run fn with the switch, storage and globals set, then restore */
function withEnv({ on, adult = true, off = false, session = {} }, fn) {
  const G = /** @type {any} */ (globalThis);
  const prev = { s: G.LENSIQ_LOOK_SALON, hs: Object.prototype.hasOwnProperty.call(G, "LENSIQ_LOOK_SALON"), l: G.localStorage, ss: G.sessionStorage, f: G.fetch };
  if (on === undefined) delete G.LENSIQ_LOOK_SALON; else G.LENSIQ_LOOK_SALON = on;
  const ls = {};
  if (adult) ls["lq-fortune-straight"] = JSON.stringify({ adult: true, straight: false });
  if (off) ls["lq-look-off"] = "1";
  G.localStorage = store(ls); G.sessionStorage = store(session);
  try { return fn(); } finally {
    if (prev.hs) G.LENSIQ_LOOK_SALON = prev.s; else delete G.LENSIQ_LOOK_SALON;
    G.localStorage = prev.l; G.sessionStorage = prev.ss; G.fetch = prev.f;
  }
}

test("P1 salonApproved(): only entries whose status is exactly \"approved\" and of a known kind", () => {
  const L = look();
  assert.equal(typeof L.salonApproved, "function");
  const list = [entry({ id: "000000000001" }), entry({ id: "000000000002", status: "pending" }), entry({ id: "000000000003", status: "rejected" }),
    entry({ id: "000000000004", status: "hidden" }), entry({ id: "000000000005", status: undefined }), entry({ id: "000000000006", status: "APPROVED" }),
    entry({ id: "000000000007", status: "approved ", }), entry({ id: "000000000008", status: true }), entry({ id: "000000000009", kind: "nose" }),
    entry({ id: "00000000000a", kind: "lip", shape: { hex: "#b5523b" }, name: { th: "ส้มอิฐ", en: "Brick orange", zh: "砖橙色" }, desc: {} }),
    null, "x", 5];
  for (const l of LANGS) {
    const items = L.salonApproved(list, l);
    assert.deepEqual(items.map(i => i.id), ["000000000001", "00000000000a"], l);
    for (const i of items) { assert.equal(i.source, "salon"); assert.equal(i.label, SALON_LABEL[l]); }
  }
  assert.deepEqual(L.salonApproved(undefined, "th"), []);
});

test("P2 procedure words in TH / EN / ZH are never shown, even in an approved entry (no salon exception)", () => {
  const L = look();
  const PROC = { th: ["สักคิ้ว 6 มิติ", "ฝังสีปาก", "ร้อยไหมยกคิ้ว", "ฉีดฟิลเลอร์", "เลเซอร์", "ศัลยกรรม", "กึ่งถาวร", "ไมโครเบลด"],
    en: ["Microblading", "Semi-permanent brows", "Lip tattoo", "Thread lift", "Laser", "Filler", "Botox", "Surgery"],
    zh: ["纹眉", "半永久", "雾眉", "埋线", "激光", "玻尿酸", "手术", "整形"] };
  for (const l of LANGS) for (const t of PROC[l]) {
    for (const where of ["name", "desc"]) {
      const e = entry({ [where]: { ...entry()[where], [l]: t } });
      for (const pl of LANGS) assert.deepEqual(L.salonApproved([e], pl), [], `${where}.${l} = ${t} (page ${pl})`);
    }
    assert.deepEqual(L.salonApproved([entry({ kind: "lip", shape: { hex: "#aa3344" }, code: t })], "th"), [], "code " + t);
  }
  // the old salon-source lint lifts the procedure code; this path must not use it
  assert.deepEqual(lint().lintLook("Microblading soft arch", { source: "salon" }), [], "(salon-source lint still lifts it)");
  assert.deepEqual(L.salonApproved([entry({ name: { th: "ทรงโค้ง", en: "Microblading soft arch", zh: "弯眉" } })], "th"), []);
  // other bans too
  for (const t of ["ผิวขาวขึ้น", "flawed brows", "10/10", "www.example.com", "立即购买"]) {
    assert.deepEqual(L.salonApproved([entry({ desc: { th: t, en: "", zh: "" } })], "th"), [], t);
  }
  // fail closed without the lint
  L.__setLintForTest(null);
  try { assert.deepEqual(L.salonApproved([entry()], "th"), [], "no lint, nothing shown"); } finally { L.__setLintForTest(undefined); }
});

test("P3 salon mode stays refused unless window.LENSIQ_LOOK_SALON === true; config ships false; salonLoad() makes no call while off", async () => {
  const L = look();
  assert.match(readFileSync(join(ROOT, "lensiq-config.js"), "utf8"), /^window\.LENSIQ_LOOK_SALON = false;$/m);
  for (const v of [undefined, false, "true", 1, "1", "on", {}, null]) withEnv({ on: v }, () => assert.equal(L.salonEnabled(), false, JSON.stringify(v)));
  withEnv({ on: true }, () => assert.equal(L.salonEnabled(), true, "the approval step exists; the owner's switch decides"));
  assert.equal(typeof L.salonLoad, "function");
  let calls = 0;
  await withEnv({ on: false }, async () => {
    /** @type {any} */ (globalThis).fetch = async () => { calls++; return { ok: true, json: async () => ({ entries: [entry()] }) }; };
    const r = await L.salonLoad({ base: "https://api.example" });
    assert.deepEqual(r, []);
  });
  assert.equal(calls, 0, "no network call while off");
  // on: one GET of the public catalogue; only approved, lint-clean entries come back
  const seen = [];
  await withEnv({ on: true }, async () => {
    /** @type {any} */ (globalThis).fetch = async (u, o) => { seen.push([String(u), (o && o.method) || "GET"]); return { ok: true, status: 200, json: async () => ({ entries: [entry(), entry({ id: "bbbbbbbbbbbb", status: "pending" }), entry({ id: "cccccccccccc", name: { th: "สักคิ้ว", en: "x", zh: "x" } })] }) }; };
    const r = await L.salonLoad({ base: "https://api.example" });
    assert.deepEqual(r.map(e => e.id), ["a1b2c3d4e5f6"]);
  });
  assert.deepEqual(seen, [["https://api.example/v1/look/salon/catalog", "GET"]]);
});

test("P4 crisis / calm hides salon content, with the switch on and an adult confirmed", () => {
  const L = look();
  assert.equal(typeof L.salonRender, "function");
  const cases = [
    ["calm attribute", fakeDoc({ "data-lq-calm": "1" }), {}],
    ["crisis attribute", fakeDoc({ "data-lq-crisis": "1" }), {}],
    ["calm session in this tab", fakeDoc(), { "lq-fortune-calm": "1" }],
    ["distress words typed on the page", fakeDoc({}, [{ value: "อยากตาย ไม่อยากอยู่แล้ว", tagName: "TEXTAREA", type: "textarea" }]), {}]
  ];
  for (const [why, d, session] of cases) {
    withEnv({ on: true, session }, () => {
      const c = box(d);
      c.innerHTML = "old";
      const shown = L.salonRender(c, [entry()]);
      assert.equal(shown, false, why);
      assert.equal(c.hidden, true, why); assert.equal(c.innerHTML, "", why);
    });
  }
  // the same entries are shown on a plain page (so the cases above are hidden for the calm reason, not by accident)
  withEnv({ on: true }, () => {
    const c = box(fakeDoc());
    assert.equal(L.salonRender(c, [entry()]), true);
    assert.equal(c.hidden, false); assert.ok(c.innerHTML.includes("ทรงโค้งนุ่ม") || c.innerHTML.includes("Soft arch"));
  });
  // the block carries data-lq-look, so the page CSS also hides it under html[data-lq-calm] / html[data-lq-crisis]
  withEnv({ on: true }, () => { const c = box(fakeDoc()); L.salonRender(c, [entry()]); assert.match(c.innerHTML, /data-lq-look/); });
  assert.match(L.CSS, /html\[data-lq-calm\] \[data-lq-look\],html\[data-lq-crisis\] \[data-lq-look\]\{display:none!important\}/);
});

test("P5 the 18+ gate holds; nothing while the switch is off or the section is switched off on this device", () => {
  const L = look();
  for (const [why, env] of [["no 18+ confirmation", { on: true, adult: false }], ["switch off", { on: false }], ["switch missing", { on: undefined }],
    ["section switched off", { on: true, off: true }]]) {
    withEnv(env, () => {
      const c = box(fakeDoc());
      assert.equal(L.salonRender(c, [entry()]), false, why);
      assert.equal(c.hidden, true, why); assert.equal(c.innerHTML, "", why);
    });
  }
  // the salon block never asks the age question itself and never confirms it
  withEnv({ on: true, adult: false }, () => {
    const c = box(fakeDoc());
    L.salonRender(c, [entry()]);
    assert.ok(!/checkbox|<input/i.test(c.innerHTML));
    assert.equal(/** @type {any} */ (globalThis).localStorage.getItem("lq-fortune-straight"), null, "not confirmed by the salon block");
  });
});

test("P6 when shown: approved only, escaped, labelled as the salon's text, wrapper wording passes the strict lint, no image or input", () => {
  const L = look();
  for (const l of LANGS) {
    withEnv({ on: true }, () => {
      /** @type {any} */ (globalThis).LQI18N = { lang: l };
      try {
        const c = box(fakeDoc());
        const list = [entry({ name: { th: "<b>ทรง</b> & โค้ง", en: "<i>Soft</i> & arch", zh: "<u>弯</u>眉" } }), entry({ id: "dddddddddddd", status: "pending", name: { th: "รออนุมัติ", en: "Waiting", zh: "等待" } })];
        assert.equal(L.salonRender(c, list), true, l);
        const h = c.innerHTML;
        assert.ok(h.includes(SALON_LABEL[l]), l + " label");
        assert.ok(!/<b>|<i>|<u>/.test(h) && /&lt;/.test(h) && /&amp;/.test(h), l + " escaped");
        assert.ok(!/รออนุมัติ|Waiting|等待|dddddddddddd/.test(h), l + " pending entry not shown");
        assert.ok(!/<img|<input|<textarea|contenteditable|<video|<canvas/i.test(h), l + " no image or input");
        const wrapper = h.replace(/<span lang="[^"]*">[^<]*<\/span>/g, " ").replace(/<[^>]+>/g, " ");
        assert.deepEqual(lint().lintLook(wrapper).filter(x => x.code !== "markup"), [], l + " wrapper wording: " + wrapper);
      } finally { delete /** @type {any} */ (globalThis).LQI18N; }
    });
  }
});
