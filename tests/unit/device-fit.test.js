// "Best used on" (owner order 2026-11-14, after testing on a real phone): every product page has one device value
// (computer / tablet / phone / any) with a reason, kept in ONE config (lensiq-devicefit.js). On a phone, computer and
// tablet pages show a short TH / EN / ZH notice with "send this link to myself" (navigator.share, else the clipboard;
// nothing is sent to our server or a third party) and "continue anyway" (remembered per device in localStorage, wrapped in
// try/catch). The same value is shown in the menu, the category pages, the solutions catalogue and the sales documents.
// FIXED TEST written and locked (~/LENSIQ-field/evals/device-fit/locked.sha256) before the module existed.
// Browser behaviour: tests/e2e/device-fit.e2e.mjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repo = path.join(__dirname, "..", "..");
const F = require("../../lensiq-devicefit.js");
const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/, HAN = /[一-鿿]/;

/** Category table of CLAUDE.md: { "#": [pages] } and the platform row. */
function claudeTable() {
  const src = fs.readFileSync(path.join(repo, "CLAUDE.md"), "utf8");
  const rows = {};
  for (const line of src.split("\n")) {
    const m = /^\| ([1-7]|–) \| [^|]+\| ([^|]+)\|$/.exec(line.trim());
    if (!m) continue;
    rows[m[1]] = m[2].replace(/\([^)]*\)/g, "").split(",").map(s => s.trim()).filter(Boolean);
  }
  return rows;
}
const htmlPages = () => fs.readdirSync(repo).filter(f => f.endsWith(".html")).map(f => f.slice(0, -5)).sort();

test("values: exactly computer / tablet / phone / any, each with a TH / EN / ZH label", () => {
  assert.deepEqual([...F.VALUES].sort(), ["any", "computer", "phone", "tablet"]);
  for (const v of F.VALUES) for (const l of LANGS) {
    const s = F.LABEL[v] && F.LABEL[v][l];
    assert.ok(typeof s === "string" && s.trim().length > 2, `label ${v}.${l}`);
  }
  for (const v of F.VALUES) {
    assert.match(F.LABEL[v].th, THAI, `label ${v}.th is Thai`);
    assert.match(F.LABEL[v].zh, HAN, `label ${v}.zh is Chinese`);
    assert.doesNotMatch(F.LABEL[v].en, THAI, `label ${v}.en has no Thai`);
  }
  assert.match(F.LABEL.computer.en, /computer/i);
  assert.match(F.LABEL.tablet.en, /tablet/i);
  assert.match(F.LABEL.phone.en, /phone/i);
});

test("config covers every page of the CLAUDE.md category table, the platform row and every *.html page", () => {
  const rows = claudeTable();
  assert.equal(Object.keys(rows).length, 8, "7 categories + platform row parsed from CLAUDE.md: " + Object.keys(rows));
  const want = new Set([...Object.values(rows).flat(), ...htmlPages()]);
  assert.ok(want.size > 70, "pages found: " + want.size);
  const missing = [...want].filter(p => !F.FIT[p]);
  assert.deepEqual(missing, [], "pages without a device value");
  for (const p of rows["–"]) assert.equal(F.FIT[p].fit, p === "admin" ? "computer" : "any", `platform page ${p}`);
});

test("every entry: valid value, a reason in TH / EN / ZH, and a basis (measured with its evidence, or estimate)", () => {
  for (const [p, e] of Object.entries(F.FIT)) {
    assert.ok(F.VALUES.includes(e.fit), `${p}: value ${e.fit}`);
    const r = F.REASONS[e.why];
    assert.ok(r, `${p}: reason id ${e.why}`);
    for (const l of LANGS) assert.ok(typeof r[l] === "string" && r[l].trim().length > 10, `${p}: reason ${e.why}.${l}`);
    assert.match(r.th, THAI, `${e.why}.th is Thai`);
    assert.match(r.zh, HAN, `${e.why}.zh is Chinese`);
    assert.doesNotMatch(r.en, THAI, `${e.why}.en has no Thai`);
    assert.ok(e.basis === "measured" || e.basis === "estimate", `${p}: basis ${e.basis}`);
    if (e.basis === "measured") {
      // a measured value names its evidence: a document in the repo and a fragment that must still be in it
      assert.ok(e.src && typeof e.src.doc === "string" && Array.isArray(e.src.quote) && e.src.quote.length, `${p}: measured needs {doc, quote[]}`);
      const doc = fs.readFileSync(path.join(repo, e.src.doc), "utf8");
      for (const q of e.src.quote) assert.ok(doc.includes(q), `${p}: "${q}" not found in ${e.src.doc}`);
    } else {
      assert.ok(typeof e.src === "string" && /estimate/i.test(e.src), `${p}: an estimate says whose estimate it is (${e.src})`);
    }
  }
  for (const id of Object.keys(F.REASONS)) assert.ok(Object.values(F.FIT).some(e => e.why === id), `unused reason ${id}`);
});

test("overview pages: no notice of their own (any), the catalogue shows the strictest value of their working pages", () => {
  const rank = { computer: 3, tablet: 2, phone: 1, any: 0 };
  let n = 0;
  for (const [p, e] of Object.entries(F.FIT)) {
    if (!e.product) { assert.equal(F.catalogueFit(p), e.fit, p); continue; }
    n++;
    assert.equal(e.fit, "any", `${p}: an overview page itself is "any"`);
    assert.ok(Array.isArray(e.product) && e.product.length && e.product.every(q => F.FIT[q] && !F.FIT[q].product), `${p}: product pages`);
    const want = e.product.map(q => F.FIT[q].fit).sort((a, b) => rank[b] - rank[a])[0];
    assert.equal(F.catalogueFit(p), want, p);
  }
  assert.ok(n >= 3, "overview pages with product pages: " + n);
  assert.equal(F.catalogueFit("exam"), "computer", "Exam is sold as lab mode + dashboard");
});

test("the owner's starting estimate (2026-11-14) is kept", () => {
  const want = {
    "exam-lab": "computer", "exam-dashboard": "computer", admin: "computer",
    gate: "tablet", parking: "tablet", village: "tablet", crowd: "tablet", studio: "tablet", photobooth: "tablet",
    attendance: "any", index: "any", medicine: "phone"
  };
  for (const [p, v] of Object.entries(want)) assert.equal(F.FIT[p].fit, v, p);
  for (const p of claudeTable()["6"]) assert.equal(F.FIT[p].fit, "phone", `fortune page ${p}`);
});

test("notice text complete in TH / EN / ZH", () => {
  const keys = Object.keys(F.TEXT.th).sort();
  for (const k of ["computer", "tablet", "sub", "send", "cont", "copied", "shared", "manual", "region"]) assert.ok(keys.includes(k), "TEXT.th." + k);
  for (const l of LANGS) {
    assert.deepEqual(Object.keys(F.TEXT[l]).sort(), keys, `TEXT.${l} has the same keys as TEXT.th`);
    for (const k of keys) assert.ok(typeof F.TEXT[l][k] === "string" && F.TEXT[l][k].trim().length > 1, `TEXT.${l}.${k}`);
  }
  for (const k of keys) {
    assert.match(F.TEXT.th[k], THAI, `TEXT.th.${k} is Thai`);
    assert.match(F.TEXT.zh[k], HAN, `TEXT.zh.${k} is Chinese`);
    assert.doesNotMatch(F.TEXT.en[k], THAI, `TEXT.en.${k} has no Thai`);
  }
  assert.match(F.TEXT.en.computer, /best on a computer/i);
  assert.match(F.TEXT.en.tablet, /tablet/i);
  assert.match(F.TEXT.en.send, /send this link to myself/i);
  assert.match(F.TEXT.en.cont, /continue anyway/i);
  assert.equal(F.text("xx"), F.TEXT.th, "unknown language falls back to Thai");
  assert.equal(F.text("en"), F.TEXT.en);
});

test("phone = small viewport plus touch (not the user agent)", () => {
  assert.equal(F.isPhone({ width: 390, height: 844, coarse: true }), true, "iPhone portrait");
  assert.equal(F.isPhone({ width: 844, height: 390, coarse: true }), true, "iPhone landscape");
  assert.equal(F.isPhone({ width: 360, height: 780, coarse: false, touch: 5 }), true, "touch points without a media query");
  assert.equal(F.isPhone({ width: 390, height: 844, coarse: false, touch: 0 }), false, "narrow desktop window, no touch");
  assert.equal(F.isPhone({ width: 1280, height: 800, coarse: true }), false, "touch laptop / large tablet");
  assert.equal(F.isPhone({ width: 768, height: 1024, coarse: true }), false, "iPad portrait");
  assert.equal(F.isPhone({ width: 1024, height: 768, coarse: true }), false, "iPad landscape");
  assert.equal(F.isPhone({}), false, "nothing known");
});

/** in-memory localStorage */
function mem(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, m };
}
const broken = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); }, removeItem() { throw new Error("SecurityError"); } };
const PHONE = { width: 390, height: 844, coarse: true }, DESK = { width: 1280, height: 800, coarse: false };

test("shouldShow: only computer / tablet pages, only on a phone, only until dismissed", () => {
  const s = mem();
  assert.equal(F.shouldShow({ page: "exam-dashboard", env: PHONE, storage: s }), true);
  assert.equal(F.shouldShow({ page: "crowd", env: PHONE, storage: s }), true);
  assert.equal(F.shouldShow({ page: "tarot", env: PHONE, storage: s }), false, "phone page");
  assert.equal(F.shouldShow({ page: "attendance", env: PHONE, storage: s }), false, "any page");
  assert.equal(F.shouldShow({ page: "exam-dashboard", env: DESK, storage: s }), false, "desktop");
  assert.equal(F.shouldShow({ page: "no-such-page", env: PHONE, storage: s }), false, "unknown page");
  F.dismiss({ page: "exam-dashboard", storage: s });
  assert.equal(s.getItem(F.dismissKey("exam-dashboard")), "1");
  assert.deepEqual([...s.m.keys()], [F.dismissKey("exam-dashboard")], "one key, nothing else stored");
  assert.equal(F.shouldShow({ page: "exam-dashboard", env: PHONE, storage: s }), false, "remembered on this device");
  assert.equal(F.shouldShow({ page: "crowd", env: PHONE, storage: s }), true, "other pages still tell");
});

test("storage blocked: never throws, the notice still shows (and can still be closed for this load)", () => {
  assert.equal(F.shouldShow({ page: "exam-lab", env: PHONE, storage: broken }), true);
  assert.equal(F.shouldShow({ page: "exam-lab", env: PHONE, storage: null }), true);
  assert.doesNotThrow(() => F.dismiss({ page: "exam-lab", storage: broken }));
  assert.doesNotThrow(() => F.dismiss({ page: "exam-lab", storage: null }));
});

test("send this link to myself: the device share sheet, else the clipboard, else a link to copy by hand", async () => {
  const url = "https://example.test/lensiq/exam-dashboard.html";
  const shared = [];
  assert.equal(await F.sendLink({ nav: { share: d => { shared.push(d); return Promise.resolve(); } }, url, title: "T" }), "shared");
  assert.equal(shared.length, 1);
  assert.equal(shared[0].url, url);
  const abort = Object.assign(new Error("cancel"), { name: "AbortError" });
  assert.equal(await F.sendLink({ nav: { share: () => Promise.reject(abort) }, url }), "cancelled", "user closed the share sheet");
  let copied = null;
  const clip = { writeText: t => { copied = t; return Promise.resolve(); } };
  assert.equal(await F.sendLink({ nav: { clipboard: clip }, url }), "copied");
  assert.equal(copied, url);
  copied = null;
  assert.equal(await F.sendLink({ nav: { share: () => Promise.reject(new Error("NotAllowedError")), clipboard: clip }, url }), "copied", "share failed -> copy");
  assert.equal(copied, url);
  assert.equal(await F.sendLink({ nav: { clipboard: { writeText: () => Promise.reject(new Error("denied")) } }, url }), "manual");
  assert.equal(await F.sendLink({ nav: {}, url }), "manual");
});

test("the module sends nothing anywhere and never starts a camera or loads a model", () => {
  const src = fs.readFileSync(path.join(repo, "lensiq-devicefit.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const bad of [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /WebSocket/, /EventSource/, /new\s+Image\s*\(/, /getUserMedia/, /LQCam/, /LQModels/,
    /\.onnx|\.tflite|\.task\b|\bort\.|InferenceSession/, /\bimport\s*\(/, /createElement\(\s*["']script/, /sessionStorage/, /window\.open\s*\(/, /location\.(assign|replace|href\s*=)/])
    assert.doesNotMatch(src, bad, "lensiq-devicefit.js must not use " + bad);
  // the only storage write is the dismiss flag, inside try/catch
  const sets = src.match(/\.setItem\(/g) || [];
  assert.equal(sets.length, 1, "one localStorage write (the dismiss flag)");
});

test("every page loads the module: through nav.js (all pages with the shared header) or its own script tag", () => {
  const nav = fs.readFileSync(path.join(repo, "nav.js"), "utf8");
  assert.match(nav, /lensiq-devicefit\.js/, "nav.js injects lensiq-devicefit.js");
  for (const p of htmlPages()) {
    const html = fs.readFileSync(path.join(repo, p + ".html"), "utf8");
    assert.ok(/<script src="nav\.js/.test(html) || /<script src="lensiq-devicefit\.js/.test(html), `${p}.html loads neither nav.js nor lensiq-devicefit.js`);
  }
});

test("category pages show each tool's device value (generated from the same config)", () => {
  for (const f of fs.readdirSync(repo).filter(f => /^cat-[a-z]+\.html$/.test(f))) {
    const html = fs.readFileSync(path.join(repo, f), "utf8");
    const cards = [...html.matchAll(/<article class="pd-card cat-tool" data-page="([a-z0-9-]+)"[\s\S]*?<\/article>/g)];
    assert.ok(cards.length > 0, f + " has tool cards");
    for (const [card, page] of cards) {
      const m = /data-fit="([a-z]+)"/.exec(card);
      assert.ok(m, `${f} ${page}: no device value`);
      assert.equal(m[1], F.catalogueFit(page), `${f} ${page}`);
      assert.ok(card.includes(F.LABEL[m[1]].th), `${f} ${page}: Thai label`);
    }
  }
  for (const l of ["en", "zh"]) {
    const dict = fs.readFileSync(path.join(repo, "i18n", `${l}-cat.js`), "utf8");
    for (const v of F.VALUES) assert.ok(dict.includes(JSON.stringify(F.LABEL[v][l])), `i18n/${l}-cat.js has the ${v} label`);
  }
});

test("sales one-pagers, decks, demo scripts and onboarding guides state the device, in each language they are written in", () => {
  const docs = Object.keys(F.DOCS);
  for (const need of ["docs/ONE-PAGER-EXAM.md", "docs/ONE-PAGER-GATE.md", "docs/ONE-PAGER-CROWD.md", "docs/ONE-PAGER-ATTENDANCE.md", "docs/ONE-PAGER-ZH.md",
    "docs/sales/DECK-EXAM.md", "docs/sales/DECK-GATE.md", "docs/sales/DECK-CROWD.md", "docs/sales/DECK-ATTENDANCE.md",
    "docs/sales/DEMO-SCRIPT-EXAM.md", "docs/sales/DEMO-SCRIPT-GATE.md", "docs/sales/DEMO-SCRIPT-CROWD.md", "docs/sales/DEMO-SCRIPT-ATTENDANCE.md"])
    assert.ok(docs.includes(need), need + " is listed in DOCS");
  for (const d of docs) {
    const src = fs.readFileSync(path.join(repo, d), "utf8");
    const spec = F.DOCS[d];
    assert.ok(spec.pages.length && spec.pages.every(p => F.FIT[p]), d + " pages");
    for (const l of spec.langs) {
      assert.ok(LANGS.includes(l) || l === "th+en", d + " lang " + l);
      const block = F.docBlock(d, l);
      assert.ok(src.includes(block), `${d}: the ${l} block is missing or out of date (run node tools/device-fit.mjs)`);
      for (const p of spec.pages) assert.ok(block.includes(p + ".html"), `${d} ${l}: ${p}`);
    }
    // a document with an "# English" part carries an English block, a Chinese document a Chinese block
    if (/^# English$/m.test(src)) assert.ok(spec.langs.includes("en"), d + " has an English part");
    if ((src.match(/[一-鿿]/g) || []).length > 200) assert.ok(spec.langs.includes("zh"), d + " is Chinese");
  }
  const r = spawnSync(process.execPath, [path.join(repo, "tools", "device-fit.mjs"), "--check"], { cwd: repo, encoding: "utf8" });
  assert.equal(r.status, 0, "tools/device-fit.mjs --check: " + r.stdout + r.stderr);
});
